// Bündel 4: BWA oder Summen- und Saldenliste erzeugen, auf die serverseitige Berechnung warten
// und die fertige Auswertung im selben Aufruf zurückliefern.
//
// **Das einzige Bündel dieses Satzes, das schreibt.** Klasse AR, `readOnlyHint` false,
// `destructiveHint` true, Pflichtsatz U7, im Nur-Lesen-Modus gesperrt. Daraus folgt alles
// Weitere:
//
//   1. **Der Schaden entsteht im ersten Teilaufruf, nicht am Ende.** Ab der Millisekunde des
//      `create` ist der Vorgängerbericht desselben Typs weg, ganz gleich, was danach passiert.
//      `bundle.written` trägt deshalb IMMER, auch im Erfolgsfall, den Klartext der Ersetzung.
//      Prozessübergreifend lässt sich nichts verhindern — die API kennt keinen Sperrmechanismus
//      —, also wird nicht Sicherheit behauptet, sondern gesagt, was geschehen ist.
//   2. **Schreibende Schritte werden nie wiederholt.** Das `create` läuft als Klasse `AR` durch
//      `runAttempts`, und dort gibt es für jede Klasse außer `R` keine Schleife
//      (`src/http/retry.ts`). Das gilt bauartbedingt und nicht durch Disziplin.
//   3. **Prozesslokale Sperre je (`api_key`-Hash, Berichtstyp).** Ein zweiter Aufruf desselben
//      Typs im selben Prozess wartet, statt ein zweites `create` abzusetzen.
//   4. **`error_code` 12 führt NICHT zu einem eigenen `create`.** Automatisches
//      Warten-und-dann-doch-Anlegen wäre das Zerstören fremder Arbeit.
//   5. **`error_code` 7 in der Warteschleife beendet den Lauf sofort**, statt weiterzupollen
//      oder neu anzulegen.
//   6. **Abgeholt wird ausschließlich mit der Kennung aus dem eigenen `create`.**
//
// Ein Abbruch der Warteschleife ist **kein Fehlschlag**: Der Bericht ist dann erzeugt und der
// vorherige ersetzt. Die Antwort ist ein Erfolg mit `complete` = false, der Kennung und einer
// Lücke, die `bb_reports_get_bwa` beziehungsweise `bb_reports_get_sums` mit genau dieser
// Kennung nennt. Ein bloßes „fehlgeschlagen" verschwiege, dass der vorherige Bericht weg ist.
//
// **Das zweite Zeitlimit liegt beim Client und ist hier nicht abstellbar.** Das ausgelieferte
// MCP-SDK setzt als Vorgabe 60 Sekunden je Anfrage: `DEFAULT_REQUEST_TIMEOUT_MSEC = 6e4`,
// gemessen in `@modelcontextprotocol/client` und in `@modelcontextprotocol/server`. Welche
// Frist ein bestimmter Wirt wie Claude Desktop tatsächlich setzt, ist NICHT verifiziert;
// gemessen ist allein die Konstante des SDK. Bricht der Client ab, kommt die Antwort
// dieses Laufs nirgends an — das `create` ist trotzdem gelaufen und der Vorgängerbericht
// trotzdem ersetzt, und die Kennung steht dann nur noch im stderr-Protokoll (`logWarn` unten)
// und in der Weboberfläche. Deshalb nennen sowohl die Werkzeugbeschreibung als auch
// `MAX_WAIT_DESCRIPTION` diese Frist ausdrücklich: Ein Feld, das bis 240 Sekunden zulässt,
// darf nicht verschweigen, dass der Weg dorthin am Client endet.
//
// **Das Kontenblatt gehört ausdrücklich NICHT hierher.** `/reports/get/sums/ledger` wird on the
// fly erzeugt und braucht kein `create`; am 2026-09-13 gegen den Produktivmandanten bestätigt
// (HTTP 200, 147 Byte, leeres `postingaccountLedger`, ohne jeden vorherigen `create`-Aufruf).
// Ein gemeinsames Werkzeug müsste die strengere Annotation tragen und wäre im Nur-Lesen-Modus
// gesperrt, obwohl es nichts ändert. Dafür bleibt `bb_reports_get_ledger`.
//
// **Zu `response_format`:** Die beiden Abholendpunkte liefern `report` als untypisiertes
// Objekt; ihre Registereinträge tragen deshalb `concise: []`, und eine Projektion ohne
// Datenbehälter projiziert nichts (P13). `structuredContent.data` trägt den Bericht in beiden
// Modi vollständig; die Projektion steuert ausschließlich, wie ausführlich der **Textblock**
// ihn wiedergibt. Etwas anderes zu behaupten hieße, eine Kürzung zu versprechen, die an einem
// Objekt ohne bekannte Feldliste niemand vornehmen kann, ohne die Antwort zu verlieren.

import { z } from "zod";

import { logWarn } from "../../logging/stderr.js";
import { BUNDLE_TOOL_GROUP } from "../../registry/groups.js";
import { bb_reports_create_bwa } from "../../registry/tools/bb_reports_create_bwa.js";
import { bb_reports_create_sums } from "../../registry/tools/bb_reports_create_sums.js";
import { bb_reports_get_bwa } from "../../registry/tools/bb_reports_get_bwa.js";
import { bb_reports_get_sums } from "../../registry/tools/bb_reports_get_sums.js";
import { renderRecord } from "../../response/table.js";
import { estimateTokensOfValue, replaceBinaryPayloads } from "../../response/truncate.js";
import { dateValue } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE } from "../../schema/vocab.js";
import { responseFormatField } from "../common.js";
import { stepFromTool } from "../steps.js";
import type {
  BundleArguments,
  BundleContext,
  BundleEntry,
  BundleOutcome,
  StepResult,
} from "../types.js";

/** Die Berichtsart, wie sie das Eingabeschema führt. */
export type ReportType = "bwa" | "sums";

/** Der Stand der Auswertung am Ende des Aufrufs. */
export type ReportRunStatus = "done" | "still_running" | "failed";

/** Die kleinste zulässige Wartezeit in Sekunden. Darunter lohnt die Warteschleife nicht. */
export const MIN_WAIT_SECONDS = 10;

/** Die größte zulässige Wartezeit in Sekunden. */
export const MAX_WAIT_SECONDS = 240;

/** Die Vorgabe, wenn der Aufrufer nichts sagt. */
export const DEFAULT_WAIT_SECONDS = 60;

/**
 * Der Warteplan zwischen zwei Abholversuchen, in Sekunden.
 *
 * Acht Abstände für neun Versuche: Der erste Versuch läuft unmittelbar nach dem `create`. Er
 * kostet einen Token aus `default` und beantwortet den einzigen Fall, in dem gar nicht gewartet
 * werden muss — einen sehr kleinen Zeitraum, dessen Bericht sofort fertig ist.
 */
export const WAIT_PLAN_SECONDS: readonly number[] = Object.freeze([2, 4, 7, 11, 16, 20, 20, 20]);

/** Höchstzahl der Abholversuche. Mit dem einen `create` sind das die 10 aus `maxCalls`. */
export const MAX_POLL_ATTEMPTS = 9;

/** `error_code` 8: Die Erzeugung läuft noch. Ein Zustand, kein Fehler (berichte.md 6.7). */
const STILL_RUNNING_CODE = 8;

/** `error_code` 7: Zu dieser Kennung liegt kein Bericht (mehr) vor. */
const NOT_FOUND_CODE = 7;

/** `error_code` 12: Am Mandanten läuft bereits eine Erzeugung desselben Typs. */
const ALREADY_RUNNING_CODE = 12;

/** Anteil des Antwortbudgets, den der Berichtskörper höchstens belegen darf. */
const DATA_BUDGET_SHARE = 0.75;

/**
 * Die beiden Endpunktpaare und ihre Benennungen.
 *
 * `label` geht in den Pflichtsatz `bundle.written` ein („Ein neuer BWA-Bericht wurde erzeugt"),
 * `longLabel` in den Fließtext. Die Trennung ist kein Schmuck: „Ein neuer
 * Summen-und-Saldenliste-Bericht" wäre falsches Deutsch.
 */
const REPORTS = {
  bwa: {
    createStep: "create_bwa",
    getStep: "get_bwa",
    label: "BWA",
    longLabel: "Betriebswirtschaftliche Auswertung",
    createPath: "/reports/create/bwa",
    getTool: bb_reports_get_bwa.name,
  },
  sums: {
    createStep: "create_sums",
    getStep: "get_sums",
    label: "Summen- und Salden",
    longLabel: "Summen- und Saldenliste",
    createPath: "/reports/create/sums",
    getTool: bb_reports_get_sums.name,
  },
} as const satisfies Record<ReportType, Record<string, string>>;

/** Der Klartext, den `bundle.written` trägt, sobald das `create` gewirkt hat. */
export function writtenSentence(reportType: ReportType): string {
  return (
    `Ein neuer ${REPORTS[reportType].label}-Bericht wurde erzeugt; der zuvor erzeugte Bericht ` +
    "desselben Typs ist ersetzt."
  );
}

// ---------------------------------------------------------------------------------------
// Feldbeschreibungen.
// ---------------------------------------------------------------------------------------

const REPORT_TYPE_DESCRIPTION =
  "Welche Auswertung erzeugt wird. 'bwa' ist die Betriebswirtschaftliche Auswertung, also " +
  "Erträge und Aufwendungen im Zeitraum. 'sums' ist die Summen- und Saldenliste, also je Konto " +
  "die Bewegungen und der Saldo. Der Wert geht nicht an die API, er entscheidet, welcher " +
  "Endpunkt aufgerufen wird. Beide Arten blockieren sich gegenseitig nicht.";

const DATE_FROM_DESCRIPTION =
  "Erster Tag des Auswertungszeitraums als YYYY-MM-DD, zum Beispiel 2026-01-01. " +
  `${EMPTY_STRING_SENTENCE} Der Zeitraum schließt diesen Tag ein.`;

const DATE_TO_DESCRIPTION =
  "Letzter Tag des Auswertungszeitraums als YYYY-MM-DD, zum Beispiel 2026-03-31. " +
  `${EMPTY_STRING_SENTENCE} Der Zeitraum schließt diesen Tag ein; für ein vollständiges erstes ` +
  "Quartal also 2026-03-31 und nicht 2026-04-01.";

const BASE_DESCRIPTION =
  "Datum der Periodenzuordnung, NUR bei report_type 'sums'. 'date' ist das Buchungs- oder " +
  "Rechnungsdatum, 'date_delivery_else_date' das Leistungsdatum und ersatzweise das " +
  "Buchungsdatum. Ohne Angabe 'date'. Bei report_type 'bwa' wird das Feld abgelehnt, bevor " +
  "etwas hinausgeht: /reports/create/bwa kennt es nicht.";

// Der Text nennt beide Fristen, weil nur eine davon hier gesetzt wird: Die zweite gehört dem
// Client, und ein Feld, das bis 240 Sekunden zulässt, darf nicht verschweigen, dass der Weg
// dorthin gewöhnlich bei etwa 60 Sekunden endet. Er bleibt trotzdem knapp, weil jede Zeile in
// jeder Anfrage eines Wirts wie Claude Desktop liegt, der alle Definitionen lädt.
const MAX_WAIT_DESCRIPTION =
  "Wie lange dieser Aufruf höchstens auf die Berechnung wartet, in Sekunden. Ohne Angabe " +
  `${String(DEFAULT_WAIT_SECONDS)}, erlaubt ${String(MIN_WAIT_SECONDS)} bis ` +
  `${String(MAX_WAIT_SECONDS)}. Läuft die Zeit ab, ist der Bericht trotzdem erzeugt und der ` +
  "vorherige trotzdem ersetzt; die Antwort nennt dann die Kennung, mit der " +
  "bb_reports_get_bwa beziehungsweise bb_reports_get_sums ihn nachholt. Dasselbe gilt, wenn " +
  "der Client vorher abbricht: Viele tun das nach etwa 60 Sekunden, verifiziert ist das nicht " +
  "für jeden. Dann kommt gar keine Antwort an, und die Kennung steht nur noch im " +
  "stderr-Protokoll dieses Servers. Wer die Frist seines Clients nicht kennt, wählt deshalb " +
  "höchstens 30. Das Feld ist serverseitig und geht nicht an die API.";

// ---------------------------------------------------------------------------------------
// Kleine Helfer.
// ---------------------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Die Kennung des angelegten Berichts aus der `create`-Antwort.
 *
 * Sie steht auf oberster Ebene des Umschlags und nicht unter `data` (Spezifikation
 * `ReportsCreateBwa_Success`), und sie kommt als **String**, während der Abholendpunkt eine
 * Ganzzahl verlangt (`docs/api/berichte.md` 4.6 Punkt 5). Beides wird hier aufgelöst.
 *
 * @returns Die Kennung als Ganzzahl, oder `null`, wenn die Antwort keine verwertbare trug.
 */
export function readReportId(body: Readonly<Record<string, unknown>>): number | null {
  const raw = body["id_by_customer"];
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const parsed = Number.parseInt(raw.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function numberOf(record: unknown, field: string): number | null {
  if (!isPlainObject(record)) {
    return null;
  }
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  // Dieselbe API liefert Zahlen, Beträge und Booleans auch als Zeichenketten (Befund L3 in
  // docs/api/live-befunde.md).
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

function booleanOf(record: unknown, field: string): boolean | null {
  if (!isPlainObject(record)) {
    return null;
  }
  const value = record[field];
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "1" || value === "true") {
    return true;
  }
  if (value === "0" || value === "false") {
    return false;
  }
  return null;
}

/** `null` heißt nicht ermittelt und wird nie als `false` oder `0` ausgegeben (Regel R5). */
function describeValue(value: boolean | number | null): string {
  return value === null ? "nicht ermittelt" : String(value);
}

/**
 * Der Satz, der ganz vorn steht, sobald ein Qualitätsfeld auffällig ist.
 *
 * Eine BWA berücksichtigt nur bestätigte Buchungen. Sie mit unbestätigten Buchungen als
 * endgültiges Ergebnis zu präsentieren, ist der Fehler, gegen den `uncompletedPostingsCount`
 * existiert — deshalb steht der Satz **vor** jeder Zahl und nicht als Fußnote.
 *
 * @returns Leere Zeichenkette, wenn nichts auffällig ist.
 */
export function qualityWarning(
  integrityError: boolean | null,
  uncompleted: number | null,
  vatNotConsidered: number | null,
): string {
  const parts: string[] = [];
  if (integrityError === true) {
    parts.push(
      "integrityError ist true: BuchhaltungsButler meldet die Daten dieses Berichts selbst als " +
        "nicht konsistent.",
    );
  }
  if (uncompleted !== null && uncompleted > 0) {
    parts.push(
      `uncompletedPostingsCount ist ${String(uncompleted)}: So viele Buchungen sind nicht ` +
        "bestätigt. Eine Auswertung berücksichtigt nur bestätigte Buchungen; diese Zahlen sind " +
        "damit NICHT das endgültige Ergebnis.",
    );
  }
  if (vatNotConsidered !== null && vatNotConsidered > 0) {
    parts.push(
      `countPostingsWithDateVatEffectiveNotConsideredInReport ist ${String(vatNotConsidered)}: ` +
        "So viele Buchungen sind mit ihrem umsatzsteuerlich wirksamen Datum nicht in den " +
        "Bericht eingegangen.",
    );
  }
  return parts.length === 0 ? "" : `ACHTUNG: ${parts.join(" ")}`;
}

/**
 * Hält den Berichtskörper im Antwortbudget.
 *
 * Ein Bericht über ein volles Geschäftsjahr kann die harte Antwortgrenze von 20.000 Token
 * reißen. Gekürzt wird dann **nicht** stillschweigend: Statt des Körpers steht eine Aufzählung
 * seiner obersten Schlüssel da, der Lauf gilt als unvollständig, und die Lücke nennt das
 * Abholwerkzeug, das denselben Bericht ohne neues Anlegen liefert.
 */
export function shortenReport(
  data: unknown,
  maxResponseTokens: number,
): { readonly value: unknown; readonly shortened: boolean } {
  const budget = Math.floor(maxResponseTokens * DATA_BUDGET_SHARE);
  if (estimateTokensOfValue(data) <= budget) {
    return { value: data, shortened: false };
  }
  return {
    shortened: true,
    value: {
      _shortened: true,
      _note:
        "Der Berichtskörper ist zu groß für eine Antwort dieses Servers und wurde nicht " +
        "ausgeliefert. Auf Seiten von BuchhaltungsButler ist nichts verloren gegangen: Der " +
        "Bericht liegt dort vollständig und lässt sich ohne neues Anlegen abholen.",
      _top_level_keys: isPlainObject(data) ? Object.keys(data) : [],
    },
  };
}

/** Der Ersatz für den Block `[Wie]` bei `error_code` 12. */
function alreadyRunningNextStep(reportType: ReportType): string {
  const report = REPORTS[reportType];
  return (
    `Am selben Mandanten läuft bereits die Erzeugung eines Berichts vom Typ ${report.label}. ` +
    "Diese Erzeugung stammt NICHT aus diesem Aufruf: Es wurde nichts erzeugt und nichts " +
    "ersetzt, der zuvor erzeugte Bericht steht unverändert. In einigen Minuten " +
    "bb_reports_run erneut aufrufen, nicht im engen Takt wiederholen und keinesfalls ein " +
    "zweites Anlegen erzwingen — das entwertete den Bericht, an dem gerade jemand anders " +
    `arbeitet. Den laufenden Bericht holt ${report.getTool} ab, sobald er nicht mehr mit ` +
    "error_code 8 antwortet; dessen Kennung kennt dieser Server nicht."
  );
}

// ---------------------------------------------------------------------------------------
// Die prozesslokale Sperre.
// ---------------------------------------------------------------------------------------

/**
 * Eine Kette je (`api_key`-Hash, Berichtstyp). Ein zweiter Aufruf desselben Typs im selben
 * Prozess **wartet**, statt ein zweites `/reports/create/*` abzusetzen, das den gerade
 * laufenden Bericht entwertet.
 *
 * Die Kette lehnt nie ab, damit ein gescheiterter Lauf die Serialisierung nicht abreißen
 * lässt — dieselbe Bauart wie im Token-Eimer (`src/http/rate-limiter.ts`).
 *
 * **Ehrliche Grenze:** Prozessübergreifend richtet sie nichts aus. Zwei Clients auf demselben
 * Mandanten teilen sie nicht, und die Weboberfläche kennt sie erst recht nicht; die API bietet
 * keinen Sperrmechanismus. Genau deshalb sagt `bundle.written` die Ersetzung immer an, statt
 * Sicherheit zu behaupten.
 */
const creationLocks = new Map<string, Promise<void>>();

async function withCreationLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = creationLocks.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  creationLocks.set(
    key,
    previous.then(
      () => mine,
      () => mine,
    ),
  );
  await previous;
  try {
    return await run();
  } finally {
    release();
  }
  // Der Eintrag bleibt stehen. Die Karte wächst dabei nicht unbegrenzt: Sie führt je Mandant
  // und Berichtstyp genau einen Schlüssel, also höchstens zwei je verbundenem Mandanten.
}

/** Ausschließlich für Tests: verwirft die Sperren zwischen zwei Fällen. */
export function resetCreationLocksForTests(): void {
  creationLocks.clear();
}

// ---------------------------------------------------------------------------------------
// Der Ablauf.
// ---------------------------------------------------------------------------------------

interface RunResult {
  status: ReportRunStatus;
  attempts: number;
  waitMs: number;
  data: unknown;
}

async function run(ctx: BundleContext, args: BundleArguments): Promise<BundleOutcome> {
  const reportType: ReportType = args["report_type"] === "sums" ? "sums" : "bwa";
  // Serialisiert je Mandant und Berichtstyp. BWA und Summenliste sind verschiedene Typen und
  // blockieren sich gegenseitig nicht; die API führt sie getrennt.
  return await withCreationLock(
    `${ctx.tenant}:${reportType}`,
    async () => await runLocked(ctx, args, reportType),
  );
}

async function runLocked(
  ctx: BundleContext,
  args: BundleArguments,
  reportType: ReportType,
): Promise<BundleOutcome> {
  const report = REPORTS[reportType];
  const dateFrom = typeof args["date_from"] === "string" ? args["date_from"] : "";
  const dateTo = typeof args["date_to"] === "string" ? args["date_to"] : "";
  const base = typeof args["base"] === "string" ? args["base"] : null;
  const maxWaitMs =
    (typeof args["max_wait_seconds"] === "number"
      ? Math.min(Math.max(args["max_wait_seconds"], 0), MAX_WAIT_SECONDS)
      : DEFAULT_WAIT_SECONDS) * 1_000;

  const createBody: Record<string, unknown> = { date_from: dateFrom, date_to: dateTo };
  if (base !== null) {
    createBody.base = base;
  }

  // --- Schritt 1: anlegen. Genau einmal, ohne Wiederholung. ---------------------------
  const created = await ctx.call({ step: report.createStep, body: createBody });
  if (!created.ok) {
    if (created.errorCode === ALREADY_RUNNING_CODE) {
      ctx.explainNextStep(alreadyRunningNextStep(reportType));
    }
    return ctx.errorOutcome(created);
  }

  // Ab hier ist der Vorgängerbericht weg. Das steht in JEDER weiteren Antwort dieses Laufs.
  ctx.wrote(writtenSentence(reportType));

  const reportId = readReportId(created.envelope.body);
  // Typ, Kennung und Zeitstempel nach stderr, damit der Betreiber den Bericht nach einem
  // Clientabbruch wiederfindet. Eine Rücknahme gibt es nicht, die API kennt keinen Endpunkt.
  logWarn(
    `bb_reports_run: ${report.createPath} ausgeführt um ${new Date().toISOString()}, ` +
      `id_by_customer=${reportId === null ? "nicht lesbar" : String(reportId)}. ` +
      writtenSentence(reportType),
  );

  const result: RunResult = { status: "still_running", attempts: 0, waitMs: 0, data: null };

  if (reportId === null) {
    ctx.stop("error");
    ctx.gap({
      what: `Die fertige ${report.longLabel} wurde nicht abgeholt.`,
      why:
        "Die Antwort auf das Anlegen trug kein verwertbares Feld id_by_customer. Ohne die " +
        "Kennung lässt sich der Bericht nicht abholen; angelegt und damit ersetzt ist er " +
        "trotzdem.",
      next_step:
        `${report.getTool} mit der report_id_by_customer der zuletzt erzeugten Auswertung ` +
        "aufrufen. Die Kennung steht in der Weboberfläche von BuchhaltungsButler.",
    });
    return outcome(ctx, reportType, { dateFrom, dateTo, base }, null, result);
  }

  // --- Schritt 2: abholen, mit wachsendem Abstand. ------------------------------------
  let lastFailure: (StepResult & { ok: false }) | null = null;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      const plannedMs = (WAIT_PLAN_SECONDS[attempt - 2] ?? 20) * 1_000;
      if (result.waitMs + plannedMs > maxWaitMs) {
        ctx.stop("time_limit");
        break;
      }
      await ctx.sleep(plannedMs);
      result.waitMs += plannedMs;
    }

    result.attempts += 1;
    const got = await ctx.call({
      step: report.getStep,
      body: { report_id_by_customer: reportId },
      // Jeder Abholversuch ist ein zusätzlicher Teilaufruf: Vor ihm wird der Eimer befragt,
      // und bei nennenswerter Wartezeit bricht der Lauf ab, statt zu warten.
      additional: true,
      // error_code 8 ist der Wartezustand und beendet den Lauf nicht.
      tolerate: [STILL_RUNNING_CODE],
    });

    if (got.ok) {
      const body = got.envelope.body;
      result.data = body["report"] === undefined ? null : body["report"];
      result.status = "done";
      break;
    }

    lastFailure = got;
    if (got.errorCode === STILL_RUNNING_CODE) {
      continue;
    }
    // Jeder andere Fehler beendet das Warten sofort — auch das Erreichen der
    // Aufrufobergrenze und der Abbruch am Eimer, die der Ablauf bereits vermerkt hat.
    if (got.kind === "error") {
      result.status = "failed";
    }
    break;
  }

  if (result.status === "failed" && lastFailure !== null) {
    ctx.gap(
      lastFailure.errorCode === NOT_FOUND_CODE
        ? {
            what: `Die erzeugte ${report.longLabel} ist nicht mehr abrufbar.`,
            why:
              "Der Abholaufruf meldet error_code 7 (report was not found). Zwischen dem " +
              "Anlegen aus diesem Aufruf und dem Abholen hat ein anderer Aufruf am selben " +
              "Mandanten einen neuen Bericht desselben Typs erzeugt und damit unseren " +
              "entwertet. Dieser Lauf legt deshalb nichts erneut an.",
            next_step:
              `${report.getTool} mit der Kennung des NEUEREN Berichts aufrufen, oder ` +
              "bb_reports_run erneut aufrufen, wenn niemand sonst gerade an diesem Mandanten " +
              "arbeitet. Ein erneuter Aufruf ersetzt wieder den dann vorhandenen Bericht.",
          }
        : {
            what: `Die fertige ${report.longLabel} wurde nicht abgeholt.`,
            why: `Der Abholaufruf ist gescheitert: ${lastFailure.summary}`,
            next_step: `${report.getTool} mit report_id_by_customer=${String(reportId)} aufrufen.`,
          },
    );
  }

  if (result.status === "still_running") {
    // Der Grund wird nicht behauptet, sondern gelesen: Das Warten kann auch an der
    // Aufrufobergrenze oder am Minutenkontingent geendet haben, und dann hat die API zuletzt
    // gar nichts gesagt. Ein Text, der in diesem Fall error_code 8 nennte, erfände eine
    // Auskunft der Gegenstelle.
    const lastWasStillRunning = lastFailure?.errorCode === STILL_RUNNING_CODE;
    const reason = lastWasStillRunning
      ? "Die API meldete zuletzt error_code 8, die Erzeugung lief also noch."
      : `Der letzte Abholversuch kam nicht zustande: ${lastFailure?.summary ?? "kein Versuch"}`;
    ctx.gap({
      what: `Die ${report.longLabel} war am Ende der Wartezeit noch nicht fertig.`,
      why:
        `Das Warten endete nach ${String(result.attempts)} Abholversuchen und rund ` +
        `${String(Math.round(result.waitMs / 1000))} Sekunden. ${reason} Angelegt und damit ` +
        "ersetzt ist der Bericht trotzdem; er wird auf Seiten von BuchhaltungsButler weiter " +
        "berechnet.",
      next_step: `${report.getTool} mit report_id_by_customer=${String(reportId)} aufrufen.`,
    });
  }

  // Der Folgeaufruf, der genau dort weitermacht, wo dieser Lauf aufgehört hat. Die Kennung
  // steht hier als ZAHL, weil der Abholendpunkt eine Ganzzahl verlangt; im Datenblock steht
  // sie als Zeichenkette, wie jede Kennung dieses Servers (Umwandlungsregel 2 im Kopf von
  // src/mapping/coerce.ts). Nach error_code 7 gibt es keinen Anschluss: Genau diese
  // Kennung ist dann wertlos.
  if (result.status !== "done" && lastFailure?.errorCode !== NOT_FOUND_CODE) {
    ctx.continueWith({ tool: report.getTool, report_id_by_customer: reportId });
  }

  return outcome(ctx, reportType, { dateFrom, dateTo, base }, reportId, result);
}

interface Period {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly base: string | null;
}

const STATUS_TEXT: Record<ReportRunStatus, string> = {
  done: "fertig berechnet und abgeholt",
  still_running: "angelegt, aber am Ende der Wartezeit noch nicht fertig",
  failed: "angelegt; das Abholen ist gescheitert",
};

function outcome(
  ctx: BundleContext,
  reportType: ReportType,
  period: Period,
  reportId: number | null,
  result: RunResult,
): BundleOutcome {
  const report = REPORTS[reportType];

  // Dateien werden nie angefordert; die Ersetzung steht trotzdem, damit ein künftiges Feld
  // nicht base64-kodiert in den Kontext läuft.
  const withoutBinaries = replaceBinaryPayloads(result.data, { requested: false }).value;
  const shortened = shortenReport(withoutBinaries, ctx.maxResponseTokens);
  if (shortened.shortened) {
    ctx.stop("response_size");
    ctx.gap({
      what: `Der Inhalt der ${report.longLabel} ist nicht in dieser Antwort enthalten.`,
      why: "Er überschreitet das Antwortbudget dieses Servers (BB_MCP_MAX_RESPONSE_TOKENS).",
      next_step:
        `${report.getTool} mit report_id_by_customer=${String(reportId ?? 0)} aufrufen und den ` +
        "Zeitraum vorher enger fassen.",
    });
  }

  const integrityError = booleanOf(result.data, "integrityError");
  const uncompleted = numberOf(result.data, "uncompletedPostingsCount");
  const vatNotConsidered = numberOf(
    result.data,
    "countPostingsWithDateVatEffectiveNotConsideredInReport",
  );

  const lines: string[] = [];
  const warning = qualityWarning(integrityError, uncompleted, vatNotConsidered);
  if (warning !== "") {
    lines.push(warning);
  }
  lines.push(
    `${writtenSentence(reportType)} Das gilt für den ganzen Mandanten: Wer gleichzeitig mit ` +
      "einem Bericht desselben Typs gearbeitet hat, findet dort jetzt diesen hier.",
  );
  lines.push(
    `${report.longLabel} für ${period.dateFrom} bis ${period.dateTo}` +
      `${period.base === null ? "" : ` (base ${period.base})`}: ${STATUS_TEXT[result.status]}. ` +
      `Kennung ${reportId === null ? "nicht lesbar" : String(reportId)}, ` +
      `${String(result.attempts)} Abholversuche, rund ` +
      `${String(Math.round(result.waitMs / 1000))} Sekunden gewartet.`,
  );
  lines.push(
    `Qualitätsfelder: integrityError ${describeValue(integrityError)}, ` +
      `uncompletedPostingsCount ${describeValue(uncompleted)}` +
      `${vatNotConsidered === null ? "" : `, countPostingsWithDateVatEffectiveNotConsideredInReport ${String(vatNotConsidered)}`}.`,
  );
  if (isPlainObject(shortened.value)) {
    lines.push(
      ctx.projection === "detailed"
        ? renderRecord(shortened.value)
        : renderRecord(topLevelOverview(shortened.value)),
    );
  }
  lines.push(ctx.callBudgetLine());

  return {
    kind: "ok",
    data: {
      report_type: reportType,
      // Ausgehend immer String (Umwandlungsregel 2 im Kopf von src/mapping/coerce.ts), auch
      // wenn der Abholendpunkt eine Ganzzahl verlangt.
      report_id_by_customer: reportId === null ? null : String(reportId),
      period: { date_from: period.dateFrom, date_to: period.dateTo, base: period.base },
      status: result.status,
      wait_ms: result.waitMs,
      attempts: result.attempts,
      integrity_error: integrityError,
      uncompletedPostingsCount: uncompleted,
      data: shortened.value,
    },
    lines,
  };
}

/**
 * Die oberste Ebene des Berichts für den Textblock in der Kurzform.
 *
 * Verschachtelte Teile werden durch eine Angabe ihrer Art und Größe ersetzt, nicht
 * weggelassen: Der Leser soll sehen, dass es sie gibt, und dass sie in
 * `structuredContent.data` vollständig stehen.
 */
function topLevelOverview(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      out[key] = `Liste mit ${String(value.length)} Einträgen (vollständig in data)`;
    } else if (isPlainObject(value)) {
      out[key] = `Objekt mit ${String(Object.keys(value).length)} Feldern (vollständig in data)`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Der Eintrag.
// ---------------------------------------------------------------------------------------

export const bb_reports_run: BundleEntry = {
  name: "bb_reports_run",
  title: "Bericht erzeugen und abholen",
  group: BUNDLE_TOOL_GROUP,
  effect: "create",
  toolClass: "AR",
  tier: 1,
  description:
    "Erzeugt eine BWA oder eine Summen- und Saldenliste für einen Zeitraum, wartet auf die " +
    "serverseitige Berechnung und liefert die fertige Auswertung im selben Aufruf zurück. " +
    "Dabei wird geschrieben: /reports/create/bwa beziehungsweise /reports/create/sums ersetzt " +
    "den zuvor erzeugten Bericht desselben Typs im ganzen Mandanten, und ein gleichzeitig " +
    "arbeitender zweiter Nutzer verliert damit seinen Bericht. Ersetzt die zuvor in " +
    "BuchhaltungsButler erzeugte Auswertung desselben Typs. Buchungsdaten ändern sich dabei " +
    "nicht, und die Auswertung lässt sich jederzeit neu erzeugen. Viele Clients brechen den " +
    "Aufruf nach rund 60 Sekunden ab; erzeugt und ersetzt ist der Bericht dann trotzdem und " +
    "nur noch mit bb_reports_get_bwa oder bb_reports_get_sums abzuholen. Bei aktivem " +
    "BB_MCP_READ_ONLY gesperrt; lesend bleiben diese beiden und bb_reports_get_ledger. " +
    "Dateien wie PDF oder CSV liefert es nie.",
  mandatorySentence: "U7",
  fields: [
    {
      name: "report_type",
      apiNames: [],
      source: "server",
      required: true,
      description: REPORT_TYPE_DESCRIPTION,
      schema: z.enum(["bwa", "sums"]).describe(REPORT_TYPE_DESCRIPTION),
    },
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: true,
      description: DATE_FROM_DESCRIPTION,
      schema: dateValue(DATE_FROM_DESCRIPTION),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: true,
      description: DATE_TO_DESCRIPTION,
      schema: dateValue(DATE_TO_DESCRIPTION),
    },
    {
      name: "base",
      apiNames: ["base"],
      source: "body",
      required: false,
      description: BASE_DESCRIPTION,
      schema: z.enum(["date", "date_delivery_else_date"]).describe(BASE_DESCRIPTION),
    },
    {
      name: "max_wait_seconds",
      apiNames: [],
      source: "server",
      required: false,
      description: MAX_WAIT_DESCRIPTION,
      // .describe() steht nach .default(), damit `schema.description` den Text wiedergibt.
      schema: z
        .number()
        .int({ error: "erwartet wird eine ganze Zahl" })
        .min(MIN_WAIT_SECONDS, { error: `muss mindestens ${String(MIN_WAIT_SECONDS)} sein` })
        .max(MAX_WAIT_SECONDS, { error: `höchstens ${String(MAX_WAIT_SECONDS)}` })
        .default(DEFAULT_WAIT_SECONDS)
        .describe(MAX_WAIT_DESCRIPTION),
    },
    responseFormatField(),
  ],
  // `report_type` und `max_wait_seconds` verlassen den Prozess nie: Der eine wählt den
  // Endpunkt, der andere steuert die Warteschleife dieses Servers.
  serverOnlyFields: ["report_type", "max_wait_seconds", "response_format"],
  steps: [
    stepFromTool(bb_reports_create_bwa, "create_bwa", "required"),
    stepFromTool(bb_reports_create_sums, "create_sums", "required"),
    // Die beiden Abholschritte entnehmen aus `default` und nicht aus `reports`; das ist die
    // Eimerbelegung ihrer Registereinträge und zugleich die eine begründete Ausnahme: Der
    // Eimer `reports` fasst einen Token je zehn Sekunden, und jeder Abholversuch wartete
    // sonst die volle Bremszeit ab — die Warteschleife wäre durch ihre eigene Bremse
    // unbrauchbar.
    stepFromTool(bb_reports_get_bwa, "get_bwa", "required"),
    stepFromTool(bb_reports_get_sums, "get_sums", "required"),
  ],
  // 1 create plus höchstens 9 Abholversuche. Je Aufruf läuft genau eines der beiden
  // create-Paare und genau der dazu passende Abholschritt.
  maxCalls: 10,
  // Ein Token genügt: Ohne das create gibt es nichts abzuholen, und mit ihm steht bereits die
  // Kennung fest, mit der ein späterer Aufruf den Bericht holt.
  minTokens: 1,
  failureMode: "abort",
  crossChecks: ["Q1", "Q3"],
  bundleChecks: ["B5"],
  searchHint: [
    "BWA",
    "Betriebswirtschaftliche Auswertung",
    "Summen und Salden",
    "SuSa",
    "Saldenliste",
    "Gewinn",
    "Verlust",
    "Auswertung",
    "Bericht",
    "Quartal",
    "Jahresergebnis",
  ],
  outputProperties: {
    report_type: { type: "string", enum: ["bwa", "sums"] },
    report_id_by_customer: { type: ["string", "null"] },
    period: {
      type: "object",
      properties: {
        date_from: { type: "string" },
        date_to: { type: "string" },
        base: { type: ["string", "null"] },
      },
      additionalProperties: true,
    },
    status: { type: "string", enum: ["done", "still_running", "failed"] },
    wait_ms: { type: "integer" },
    attempts: { type: "integer" },
    integrity_error: { type: ["boolean", "null"] },
    uncompletedPostingsCount: { type: ["integer", "null"] },
    data: { type: ["object", "array", "string", "number", "boolean", "null"] },
  },
  outputRequired: ["report_type", "report_id_by_customer", "status"],
  run,
};
