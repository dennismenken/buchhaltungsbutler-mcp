// Der Vertragslauf gegen die echte API. Aufruf: `pnpm run contract:read`.
//
// Er führt jeden der 15 LESENDEN Registereinträge genau einmal mit minimalen Parametern aus
// und hält die Feldmenge und die JSON-Typen der Antwort gegen das `responseContract` des
// Eintrags. Abgesetzt werden davon höchstens 13 Aufrufe: `bb_reports_get_bwa` und
// `bb_reports_get_sums` holen eine Auswertung ab, die erst ein SCHREIBENDER Aufruf erzeugt, und
// die führt dieser Lauf nicht aus. Beide erscheinen im Bericht als nicht prüfbar, statt
// stillschweigend zu fehlen.
// Ausgegeben wird eine Liste neuer, fehlender und typveränderter Felder. Das ist die Antwort
// auf die Frage, wie dieses Projekt merkt, dass die API sich geändert hat: Die
// Spezifikationsdatei wird nicht gepflegt und ist nachweislich unvollständig; die
// Wirklichkeit ist das, was zurückkommt.
//
// **Die Grenze dieses Laufs ist seine eigentliche Substanz.** Er ist die einzige Ausnahme von
// der absoluten Regel und läuft gegen eine echte, produktive Buchhaltung. Vier
// Festlegungen halten ihn lesend:
//
//  1. Die Erlaubnisliste wird AUS DEM REGISTER erzeugt (`toolClass === "R"`) und nirgends
//     abgeschrieben. Eine zweite, von Hand gepflegte Liste liefe irgendwann auseinander, und
//     zwar zugunsten des Schreibens.
//  2. Jeder Pfad, der nicht in dieser Liste steht, lässt den Lauf werfen, BEVOR der Aufruf
//     abgeht. Geprüft wird beides: der Spezifikationspfad und der tatsächlich gesendete Pfad.
//  3. `test/unit/contract-read-guard.test.ts` weist nach, dass der Wächter bei einem
//     schreibenden Pfad wirft und dass er wirft, ohne den Aufrufer auch nur zu berühren.
//  4. Der Lauf schreibt in keine Datei. Auf stdout erscheinen ausschließlich Feldnamen, Typen
//     und Zählungen — keine Geschäftsdaten, keine Parameterwerte, keine Zugangsdaten.
//
// **Der Wächter hängt an keinem Modul aus `src/`.** Er bringt seine Pfadprüfung selbst mit,
// obwohl `src/http/client.ts` und `src/mapping/path.ts` sehr ähnliche Prüfungen führen. Das
// ist Absicht und keine Doppelpflege: Ein Wächter, der das Modul importiert, das er bewachen
// soll, fällt mit ihm zusammen aus. Zweiter, technischer Grund steht bei HOOK_SOURCE.
//
// **Rückgabewerte:** 0 nichts nachzutragen (Hinweise zählen nicht, siehe compareContract);
// 1 neue, fehlende oder typveränderte Felder gefunden, sie stehen im Bericht; 2 der Lauf war
// nicht durchführbar (keine Zugangsdaten, Aufruf gescheitert, Wächter hat geworfen).
//
// **Aufrufschalter:**
//   --only bb_x,bb_y   nur diese Werkzeuge aufrufen. Für einen gezielten Nachlauf und für
//                      Läufe unter einem knappen Minutenkontingent (100 Anfragen
//                      je Minute und Mandant, geteilt mit allem anderen).
//   --list             den Ablaufplan ausgeben und nichts aufrufen. Setzt keinen Request ab.
//   --help             diese Übersicht.

import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { EndpointCall } from "../src/http/client.js";
import type { SuccessEnvelope } from "../src/http/envelope.js";
import type { ContractFieldType, ToolEntry } from "../src/registry/types.js";

// ---------------------------------------------------------------------------------------
// Auflösungshaken
// ---------------------------------------------------------------------------------------

/**
 * Node führt diese Datei direkt aus und entfernt die Typannotationen selbst (siehe
 * `scripts/generate.ts`). Was es NICHT tut: einen Import auf `./x.js` auf die daneben
 * liegende `x.ts` abbilden. Genau diese Schreibweise verlangt aber `verbatimModuleSyntax`
 * im gesamten `src/`-Baum, und ohne sie übersetzte das Projekt nicht.
 *
 * Der Haken schließt diese eine Lücke: Endet ein relativer Import auf `.js` und existiert
 * die gleichnamige `.ts`, wird sie genommen. Sonst entscheidet Node wie immer.
 *
 * Er wird ausschließlich in {@link main} angemeldet, also nur beim direkten Aufruf. Beim
 * Import aus einem Test läuft er nicht: Dort löst vitest die Module selbst auf, und ein
 * zweiter Auflöser in derselben Laufzeit wäre eine Nebenwirkung, die niemand bestellt hat.
 * Deshalb steht in dieser Datei auch kein einziger ausführbarer Import aus `src/` — jeder
 * davon würde vor dem ersten Anweisungsschritt aufgelöst und damit vor der Anmeldung.
 */
const HOOK_SOURCE = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && specifier.endsWith(".js") && context.parentURL !== undefined) {
    const candidateUrl = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
    if (candidateUrl.protocol === "file:" && existsSync(fileURLToPath(candidateUrl))) {
      return { url: candidateUrl.href, format: "module-typescript", shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
`;

/**
 * Startet diesen Lauf mit `--experimental-transform-types` neu und reicht Ausgabe und
 * Rückgabewert durch.
 *
 * **Der Grund ist ein Befund und keine Bequemlichkeit.** Node entfernt Typannotationen
 * standardmäßig nur (`process.features.typescript === "strip"`) und bricht dabei an jedem
 * TypeScript-Konstrukt ab, das echte Übersetzung braucht. `src/http/rate-limiter.ts`
 * benutzt Parametereigenschaften (`constructor(private readonly definition: …)`); der
 * HTTP-Client zieht die Datei mit, und der Lauf endete mit „TypeScript parameter property is
 * not supported in strip-only mode". Der Bau über tsdown merkt davon nichts, ein direkt
 * gestartetes Skript schon.
 *
 * Der Neustart ist die Behelfslösung, die dieses Paket selbst tragen kann; die Ursache
 * gehört in das Paket, dem `src/http/rate-limiter.ts` gehört, und ist dort gemeldet. Sobald
 * die Datei ohne Parametereigenschaften auskommt, fällt dieser Zweig ersatzlos weg, ohne dass
 * an dieser Stelle etwas zu ändern wäre: Er greift nur, solange Node „strip" meldet.
 */
function restartWithTransform(): number {
  const result = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit" },
  );

  if (result.error !== undefined) {
    console.error(
      `Der Neustart mit --experimental-transform-types ist gescheitert: ${result.error.message}`,
    );
    return 2;
  }
  return result.status ?? 2;
}

// ---------------------------------------------------------------------------------------
// Der Wächter
// ---------------------------------------------------------------------------------------

/** Ein Pfad, den dieser Lauf nicht anfassen darf. Es geht kein Byte hinaus. */
export class ContractRunGuardError extends Error {
  readonly toolName: string;
  readonly specPath: string;
  readonly requestPath: string;

  constructor(toolName: string, specPath: string, requestPath: string, detail: string) {
    super(
      `Der Vertragslauf hat ${toolName} mit dem Pfad ${specPath} abgelehnt: ${detail} ` +
        "Dieser Lauf ruft ausschließlich die lesenden Endpunkte des Registers auf.",
    );
    this.name = "ContractRunGuardError";
    this.toolName = toolName;
    this.specPath = specPath;
    this.requestPath = requestPath;
  }
}

/** Ein Eintrag der Erlaubnisliste. Er entsteht aus dem Register und nirgendwo sonst. */
export interface AllowedEndpoint {
  readonly toolName: string;
  readonly specPath: string;
  /**
   * Der Vorrat gültiger Anfragepfade dieses Endpunkts. Bei den 13 literalen Pfaden ist das
   * genau einer, bei den beiden Pfadvorlagen jeder Pfad mit einem Ziffernsegment an der
   * Einsetzstelle — dieselbe Grenze, die `PATH_SEGMENT_PATTERN` in `src/mapping/path.ts`
   * zieht.
   */
  readonly requestPattern: RegExp;
}

/** Maskiert die Sonderzeichen eines regulären Ausdrucks in einem Literal. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Erzeugt die Erlaubnisliste aus dem Register: genau die Einträge mit `toolClass === "R"`.
 *
 * Geschlüsselt wird nach dem unveränderten Spezifikationspfad, nicht nach dem gebauten Pfad.
 * Der gebaute Pfad trägt bei zwei der 15 Endpunkte eine Geschäftskennung und ist damit nicht
 * konstant.
 */
export function buildAllowList(
  entries: readonly ToolEntry[],
): ReadonlyMap<string, AllowedEndpoint> {
  const allowed = new Map<string, AllowedEndpoint>();

  for (const entry of entries) {
    if (entry.toolClass !== "R") {
      continue;
    }

    if ("literal" in entry.path) {
      const literal = entry.path.literal;
      allowed.set(literal, {
        toolName: entry.name,
        specPath: literal,
        requestPattern: new RegExp(`^${escapeForRegExp(literal)}$`),
      });
      continue;
    }

    // Die Vorlage wird Segment für Segment übersetzt: literale Teile bleiben literal, jede
    // Einsetzstelle wird zu einem Ziffernsegment. Ein Platzhalter, den die Vorlage nicht
    // in `params` führt, wäre ein Registerfehler und lässt den Aufbau scheitern.
    const { template, params, specPath } = entry.path;
    const pattern = template
      .split("/")
      .map((segment) => {
        if (!segment.startsWith("{") || !segment.endsWith("}")) {
          return escapeForRegExp(segment);
        }
        const param = segment.slice(1, -1);
        if (!params.includes(param)) {
          throw new Error(
            `Die Pfadvorlage von ${entry.name} führt den Platzhalter ${param}, ` +
              `params nennt ihn nicht. Der Vertragslauf kann daraus keine Erlaubnis bauen.`,
          );
        }
        return "[0-9]{1,18}";
      })
      .join("/");

    allowed.set(specPath, {
      toolName: entry.name,
      specPath,
      requestPattern: new RegExp(`^${pattern}$`),
    });
  }

  return allowed;
}

/** Die Grundprüfung des Anfragepfades, unabhängig von der Erlaubnisliste. */
function requestPathProblem(requestPath: string): string {
  if (!requestPath.startsWith("/")) {
    return "er beginnt nicht mit einem Schrägstrich.";
  }
  if (requestPath.includes("?") || requestPath.includes("#")) {
    return "er enthält eine Abfrage oder ein Fragment.";
  }
  if (requestPath.includes("\\") || requestPath.includes("//")) {
    return "er enthält einen umgekehrten Schrägstrich oder ein leeres Segment.";
  }
  if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) {
    return "er enthält ein Punktsegment.";
  }
  if (/\s/.test(requestPath)) {
    return "er enthält Leerraum.";
  }
  return "";
}

/**
 * Lässt den Aufruf durch oder wirft. Nach dieser Funktion und vor dem Absenden steht nichts
 * mehr, was den Pfad noch ändern könnte.
 *
 * @throws {ContractRunGuardError} sobald irgendetwas nicht stimmt: unbrauchbarer Pfad,
 *         Spezifikationspfad nicht in der Erlaubnisliste, anderes Werkzeug als das erlaubte,
 *         Anfragepfad außerhalb des Vorrats dieses Endpunkts.
 */
export function assertAllowedCall(
  allowList: ReadonlyMap<string, AllowedEndpoint>,
  call: Pick<EndpointCall, "toolName" | "specPath" | "requestPath">,
): void {
  const problem = requestPathProblem(call.requestPath);
  if (problem !== "") {
    throw new ContractRunGuardError(call.toolName, call.specPath, call.requestPath, problem);
  }

  const allowedEndpoint = allowList.get(call.specPath);
  if (allowedEndpoint === undefined) {
    throw new ContractRunGuardError(
      call.toolName,
      call.specPath,
      call.requestPath,
      "Dieser Spezifikationspfad steht nicht in der aus dem Register erzeugten Erlaubnisliste.",
    );
  }

  if (allowedEndpoint.toolName !== call.toolName) {
    throw new ContractRunGuardError(
      call.toolName,
      call.specPath,
      call.requestPath,
      `Dieser Pfad gehört zum Werkzeug ${allowedEndpoint.toolName}.`,
    );
  }

  if (!allowedEndpoint.requestPattern.test(call.requestPath)) {
    throw new ContractRunGuardError(
      call.toolName,
      call.specPath,
      call.requestPath,
      `Der gesendete Pfad ${call.requestPath} passt nicht zum erlaubten Pfad dieses Endpunkts.`,
    );
  }
}

// ---------------------------------------------------------------------------------------
// Der Ablaufplan: je lesendem Werkzeug ein Probeaufruf
// ---------------------------------------------------------------------------------------

/** Kennungen, die ein Probeaufruf aus einer früheren Antwort übernimmt. */
export type IdName = "receipt_id" | "transaction_id" | "postingaccount_number";

export interface ProbeSpec {
  /** Der Registereintrag, dessen Antwortvertrag geprüft wird. */
  readonly tool: string;
  /** Die festen Felder des Bodys. Minimal gehalten, aber vollständig genug für eine Antwort. */
  readonly body: Readonly<Record<string, unknown>>;
  /** Body-Felder, deren Wert aus einer früheren Antwort stammt: Feldname → Kennung. */
  readonly bodyFromIds?: Readonly<Record<string, IdName>>;
  /** Bei den Endpunkten mit Pfadvorlage: die Kennung, die in den Pfad eingesetzt wird. */
  readonly pathFromId?: IdName;
  /** Kennungen, die aus der Antwort geerntet werden: Kennung → Feldname in der Antwortzeile. */
  readonly harvest?: Readonly<Partial<Record<IdName, string>>>;
  /**
   * Gesetzt, wenn dieser Endpunkt ohne einen SCHREIBENDEN Vorlauf nichts liefern kann. Er
   * wird dann übersprungen und im Bericht als nicht prüfbar geführt. Der Vorlauf wird nicht
   * ausgeführt, auch nicht „nur einmal".
   */
  readonly blocked?: string;
}

/** Ein Datum als YYYY-MM-DD. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const TODAY = isoDate(new Date());
const FIVE_YEARS_AGO = isoDate(new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000));

/**
 * Warum das Zeitfenster fünf Jahre umfasst: Ein Vertragslauf lernt nur aus Zeilen, die
 * wirklich kommen. Ein enges Fenster liefert bei einem ruhigen Mandanten eine leere Liste,
 * und eine leere Liste bestätigt keinen einzigen Feldnamen. Die Zeilenzahl bleibt über
 * `limit` klein; das Fenster kostet also nichts.
 */
const TIME_WINDOW = { date_from: FIVE_YEARS_AGO, date_to: TODAY } as const;

/**
 * Der Ablaufplan, in Aufrufreihenfolge. Jeder der 15 lesenden Einträge kommt genau einmal
 * vor; ein Probeaufruf steht hinter dem, aus dessen Antwort er seine Kennung bezieht.
 *
 * `limit` bleibt überall klein. Der Lauf braucht Feldnamen, keine Datenbestände, und jede
 * Zeile, die er nicht anfordert, ist eine Zeile Geschäftsdaten weniger im Arbeitsspeicher.
 * Zehn Zeilen stehen dort, wo aus den Zeilen zusätzlich Kennungen geerntet werden.
 */
export const PROBE_PLAN: readonly ProbeSpec[] = [
  { tool: "bb_payment_accounts_list", body: {} },
  {
    tool: "bb_postingaccounts_search",
    body: { limit: 10 },
    harvest: { postingaccount_number: "postingaccount_number" },
  },
  { tool: "bb_debtors_search", body: { limit: 5 } },
  { tool: "bb_creditors_search", body: { limit: 5 } },
  { tool: "bb_cost_locations_search", body: { limit: 5 } },
  {
    // Die Buchungssuche liefert die beiden Kennungen, mit denen sich die zwei
    // Zuordnungslisten prüfen lassen: Eine Buchung, die Beleg und Zahlung verbindet, führt
    // beide Felder. Ein Beleg ohne zugeordnete Zahlung ergäbe dort eine leere Liste und
    // damit keinen einzigen Feldnamen.
    tool: "bb_postings_search",
    body: { ...TIME_WINDOW, limit: 10 },
    harvest: {
      receipt_id: "receipt_id_by_customer",
      transaction_id: "transaction_id_by_customer",
    },
  },
  {
    tool: "bb_receipts_search",
    body: { list_direction: "inbound", limit: 10 },
    harvest: { receipt_id: "id_by_customer" },
  },
  { tool: "bb_receipts_get", body: {}, pathFromId: "receipt_id" },
  {
    tool: "bb_receipts_list_transactions",
    body: {},
    bodyFromIds: { receipt_id_by_customer: "receipt_id" },
  },
  {
    tool: "bb_transactions_search",
    body: { limit: 10 },
    harvest: { transaction_id: "id_by_customer" },
  },
  { tool: "bb_transactions_get", body: {}, pathFromId: "transaction_id" },
  {
    tool: "bb_transactions_list_receipts",
    body: {},
    bodyFromIds: { transaction_id_by_customer: "transaction_id" },
  },
  {
    tool: "bb_reports_get_ledger",
    body: { ...TIME_WINDOW },
    bodyFromIds: { postingaccount_number: "postingaccount_number" },
  },
  {
    tool: "bb_reports_get_bwa",
    body: {},
    blocked:
      "Der Endpunkt holt eine zuvor erzeugte Auswertung ab. Die Erzeugung läuft über " +
      "bb_reports_create_bwa und ist schreibend; dieser Lauf führt keinen schreibenden " +
      "Aufruf aus (berichte.md 2.3).",
  },
  {
    tool: "bb_reports_get_sums",
    body: {},
    blocked:
      "Der Endpunkt holt eine zuvor erzeugte Auswertung ab. Die Erzeugung läuft über " +
      "bb_reports_create_sums und ist schreibend; dieser Lauf führt keinen schreibenden " +
      "Aufruf aus (berichte.md 2.3).",
  },
];

// ---------------------------------------------------------------------------------------
// Beobachtung und Vergleich
// ---------------------------------------------------------------------------------------

/** Der JSON-Typ eines beobachteten Wertes. Mehr Stufen kennt JSON nicht. */
export type JsonKind = "string" | "number" | "boolean" | "null" | "object" | "array";

export function jsonKindOf(value: unknown): JsonKind {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const typeName = typeof value;
  if (typeName === "string" || typeName === "number" || typeName === "boolean") {
    return typeName;
  }
  return "object";
}

/**
 * Welche JSON-Typen ein Vertragstyp zulässt.
 *
 * `id-string` lässt String UND Zahl zu, und das ist kein Zugeständnis, sondern der gemessene
 * Befund L3 in docs/api/live-befunde.md: Dieselbe Kennung kommt bei `/receipts/*` als String
 * und bei `/transactions/*`
 * als Zahl. Ausgehend ist sie immer ein String; eingehend darf sie beides
 * sein, und ein Lauf, der die Zahl als Typänderung meldete, meldete jeden Lauf dasselbe.
 */
const ALLOWED_TYPES: Readonly<Record<ContractFieldType, readonly JsonKind[]>> = {
  string: ["string"],
  number: ["number"],
  boolean: ["boolean"],
  "null-or-string": ["string", "null"],
  "amount-string": ["string"],
  "bool-string": ["string"],
  "id-string": ["string", "number"],
};

export interface FieldObservation {
  /** Die beobachteten JSON-Typen, ohne `null`. */
  readonly kinds: ReadonlySet<JsonKind>;
  /** In wie vielen der ausgewerteten Zeilen das Feld überhaupt vorkam. */
  readonly present: number;
  /** In wie vielen Zeilen es `null` war. */
  readonly nulls: number;
}

/** Zählt Feldnamen und JSON-Typen über die ausgewerteten Zeilen. Werte werden nicht behalten. */
export function observeRows(rows: readonly unknown[]): Map<string, FieldObservation> {
  const observed = new Map<string, { kinds: Set<JsonKind>; present: number; nulls: number }>();

  for (const row of rows) {
    if (jsonKindOf(row) !== "object") {
      continue;
    }
    for (const [field, value] of Object.entries(row as Record<string, unknown>)) {
      let entry = observed.get(field);
      if (entry === undefined) {
        entry = { kinds: new Set<JsonKind>(), present: 0, nulls: 0 };
        observed.set(field, entry);
      }
      entry.present += 1;
      const kind = jsonKindOf(value);
      if (kind === "null") {
        entry.nulls += 1;
      } else {
        entry.kinds.add(kind);
      }
    }
  }

  return observed;
}

export type DeviationKind = "neu" | "fehlt" | "typ" | "hinweis";

export interface Deviation {
  readonly kind: DeviationKind;
  readonly field: string;
  readonly text: string;
}

/**
 * Hält die Beobachtung gegen den Antwortvertrag.
 *
 * Drei Entscheidungen, die sonst als Willkür gelesen würden:
 *
 *  - Ein Feld, das in JEDER ausgewerteten Zeile `null` war, ist KEINE Typänderung. Sein Typ
 *    ist schlicht nicht beobachtbar; nicht gesetzte Felder kommen durchgehend als `null`
 *    (Befund L3 in docs/api/live-befunde.md). Der Lauf sagt das als Hinweis und behauptet
 *    nichts.
 *  - Ein `null`, wo der Vertragstyp keins nennt, ist ein Hinweis und KEIN Fehler.
 *    `coerceField` in `src/mapping/coerce.ts` lässt `null` bei jedem Vertragstyp durch und
 *    meldet es nicht („nicht gesetzt" und „leer" sind fachlich verschieden). Der
 *    Hinweis sagt also nur, dass der Vertrag die Wirklichkeit genauer beschreiben könnte; zur
 *    Laufzeit entsteht aus dem `null` keine einzige `_contract_warning`. Deshalb zählt ein
 *    Hinweis auch nicht in den Rückgabewert des Laufs.
 *  - Ein Feld, das nur in einem Teil der Zeilen vorkam, wird mit dieser Zahl gemeldet. Ein
 *    Vertrag, der es führt, bleibt richtig; ein Vertrag, der es nicht führt, bekommt einen
 *    „neu"-Eintrag mit der Häufigkeit dazu.
 */
export function compareContract(
  contract: ToolEntry["responseContract"],
  observed: ReadonlyMap<string, FieldObservation>,
  rowCount: number,
): Deviation[] {
  const deviations: Deviation[] = [];

  for (const [field, fieldType] of Object.entries(contract.fields)) {
    const observation = observed.get(field);
    if (observation === undefined) {
      deviations.push({
        kind: "fehlt",
        field: field,
        text: `${field}: im Vertrag als ${fieldType}, in keiner der ${rowCount} ausgewerteten Zeilen vorhanden.`,
      });
      continue;
    }

    if (observation.kinds.size === 0) {
      deviations.push({
        kind: "hinweis",
        field: field,
        text: `${field}: in allen ${observation.present} Zeilen null. Der Vertragstyp ${fieldType} ist damit nicht bestätigt und nicht widerlegt.`,
      });
      continue;
    }

    const allowedKinds = ALLOWED_TYPES[fieldType];
    const unexpectedKinds = [...observation.kinds].filter((kind) => !allowedKinds.includes(kind));
    if (unexpectedKinds.length > 0) {
      deviations.push({
        kind: "typ",
        field: field,
        text: `${field}: im Vertrag ${fieldType} (erlaubt ${allowedKinds.join(", ")}), beobachtet ${[...observation.kinds].join(", ")}.`,
      });
    }

    if (observation.nulls > 0 && !allowedKinds.includes("null")) {
      deviations.push({
        kind: "hinweis",
        field: field,
        text: `${field}: im Vertrag ${fieldType}, in ${observation.nulls} von ${observation.present} Zeilen null. Zur Laufzeit unkritisch; ein Typ, der null nennt, beschriebe den Endpunkt genauer.`,
      });
    }
  }

  for (const [field, observation] of observed) {
    if (field in contract.fields) {
      continue;
    }
    const kindsText = observation.kinds.size === 0 ? "nur null" : [...observation.kinds].join(", ");
    deviations.push({
      kind: "neu",
      field: field,
      text: `${field}: nicht im Vertrag, beobachtet in ${observation.present} von ${rowCount} Zeilen als ${kindsText}.`,
    });
  }

  return deviations;
}

/**
 * Die auszuwertenden Zeilen einer Antwort.
 *
 * Bei `container: "none"` liegen die Nutzdaten auf der obersten Ebene des Umschlags (die
 * drei Berichtsendpunkte). `success`, `message` und `rows` gehören zum Umschlag
 * und nicht zum Antwortvertrag; sie bleiben draußen, sonst erzeugte jeder Lauf drei
 * „neu"-Einträge, die niemand nachträgt.
 */
export function rowsOf(entry: ToolEntry, envelope: SuccessEnvelope): readonly unknown[] {
  if (entry.responseContract.container === "none") {
    const envelopeFields = ["success", "message", "rows"];
    const rest: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(envelope.body)) {
      if (!envelopeFields.includes(field)) {
        rest[field] = value;
      }
    }
    return [rest];
  }
  if (envelope.shape === "list") {
    return envelope.data;
  }
  if (envelope.shape === "object") {
    return [envelope.data];
  }
  return jsonKindOf(envelope.data) === "object" ? [envelope.data] : [];
}

// ---------------------------------------------------------------------------------------
// Ausführung
// ---------------------------------------------------------------------------------------

interface CliOptions {
  readonly only: readonly string[];
  readonly list: boolean;
  readonly help: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  let only: string[] = [];
  let list = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      // `pnpm run contract:read -- --only …` reicht den Trenner unverändert mit durch. Ihn
      // als unbekannten Schalter abzulehnen hieße, die eigene Aufrufform abzulehnen.
      continue;
    }
    if (arg === "--list") {
      list = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--only") {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error("--only braucht eine kommagetrennte Liste von Werkzeugnamen.");
      }
      only = value
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
      index += 1;
    } else if (arg !== undefined && arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
    } else {
      throw new Error(`Unbekannter Schalter ${String(arg)}. --help zeigt die Übersicht.`);
    }
  }

  return { only, list, help };
}

const HELP_TEXT = [
  "Vertragslauf gegen die echte BuchhaltungsButler-API.",
  "",
  "  pnpm run contract:read                      alle 15 lesenden Endpunkte",
  "  pnpm run contract:read -- --only bb_x,bb_y  nur diese Werkzeuge",
  "  pnpm run contract:read -- --list            nur den Ablaufplan zeigen, nichts aufrufen",
  "",
  "Der Lauf braucht BB_API_CLIENT, BB_API_SECRET und BB_API_KEY in der Umgebung und ruft",
  "ausschließlich lesende Endpunkte auf. Er schreibt in keine Datei und gibt weder",
  "Geschäftsdaten noch Parameterwerte aus, nur Feldnamen, Typen und Zählungen.",
  "",
  "Rückgabewert 0: nichts nachzutragen. 1: neue, fehlende oder typveränderte Felder im",
  "Bericht. 2: Lauf nicht durchführbar.",
].join("\n");

/** Das Ergebnis eines einzelnen Probeaufrufs, fertig für den Bericht. */
interface ProbeResult {
  readonly tool: string;
  readonly specPath: string;
  readonly status: "geprueft" | "uebersprungen" | "gescheitert";
  readonly note: string;
  readonly rowCount: number;
  readonly deviations: readonly Deviation[];
}

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  // Erst ab hier werden Module aus src/ geladen, und erst ab hier zählt der Unterschied
  // zwischen Entfernen und Übersetzen der Typannotationen.
  if (process.features.typescript !== "transform") {
    return restartWithTransform();
  }

  register(`data:text/javascript,${encodeURIComponent(HOOK_SOURCE)}`);

  const { TOOL_BY_NAME, TOOL_ENTRIES } = await import("../src/registry/index.generated.js");
  const { buildPath, specPathOf } = await import("../src/mapping/path.js");

  const allowList = buildAllowList(TOOL_ENTRIES);

  // Der Plan wird gegen das Register gehalten, bevor irgendetwas hinausgeht: Ein Werkzeug,
  // das es nicht mehr gibt, und ein lesendes Werkzeug ohne Probeaufruf sind beides Fehler,
  // die sonst erst im Bericht als Lücke auffielen — oder gar nicht.
  const plannedTools = new Set(PROBE_PLAN.map((probe) => probe.tool));
  const missingTools = TOOL_ENTRIES.filter(
    (entry) => entry.toolClass === "R" && !plannedTools.has(entry.name),
  ).map((entry) => entry.name);
  if (missingTools.length > 0) {
    console.error(
      `Der Ablaufplan kennt keinen Probeaufruf für ${missingTools.join(", ")}. ` +
        "Jeder lesende Registereintrag braucht genau einen.",
    );
    return 2;
  }

  let plan = PROBE_PLAN;
  if (options.only.length > 0) {
    const unknownTools = options.only.filter((name) => !plannedTools.has(name));
    if (unknownTools.length > 0) {
      console.error(`--only nennt ${unknownTools.join(", ")}; dazu gibt es keinen Probeaufruf.`);
      return 2;
    }
    plan = PROBE_PLAN.filter((probe) => options.only.includes(probe.tool));
  }

  if (options.list) {
    console.log("Ablaufplan des Vertragslaufs, ohne einen einzigen Aufruf:");
    for (const probe of plan) {
      const entry = TOOL_BY_NAME.get(probe.tool);
      const path = entry === undefined ? "unbekannt" : specPathOf(entry.path);
      const suffix = probe.blocked === undefined ? "" : "  [nicht prüfbar]";
      console.log(`  ${probe.tool.padEnd(32)} ${path}${suffix}`);
    }
    console.log(
      `\n${plan.length} Einträge, davon ${plan.filter((p) => p.blocked === undefined).length} mit Aufruf.`,
    );
    return 0;
  }

  const { initConfig } = await import("../src/config/resolve.js");
  const { callEndpoint } = await import("../src/http/client.js");

  const config = initConfig();
  if (!config.configured) {
    console.error(
      "Der Vertragslauf braucht echte Zugangsdaten in BB_API_CLIENT, BB_API_SECRET und " +
        "BB_API_KEY. Ohne sie wird er nicht ausgeführt, und es wird kein Antwortvertrag " +
        "geändert.",
    );
    return 2;
  }

  const ids = new Map<IdName, string>();
  const results: ProbeResult[] = [];

  for (const probe of plan) {
    const entry = TOOL_BY_NAME.get(probe.tool);
    if (entry === undefined) {
      results.push({
        tool: probe.tool,
        specPath: "unbekannt",
        status: "gescheitert",
        note: "Das Register kennt dieses Werkzeug nicht.",
        rowCount: 0,
        deviations: [],
      });
      continue;
    }

    const specPath = specPathOf(entry.path);

    if (probe.blocked !== undefined) {
      results.push({
        tool: entry.name,
        specPath,
        status: "uebersprungen",
        note: probe.blocked,
        rowCount: 0,
        deviations: [],
      });
      continue;
    }

    // Die Kennungen aus früheren Antworten einsetzen. Fehlt eine, wird der Aufruf nicht
    // geraten, sondern ausgelassen: Ein erfundener Identifikator liefert bestenfalls einen
    // Fehlercode und schlimmstenfalls den Datensatz eines fremden Vorgangs.
    const body: Record<string, unknown> = { ...probe.body };
    let missingId = "";
    for (const [field, idName] of Object.entries(probe.bodyFromIds ?? {})) {
      const value = ids.get(idName);
      if (value === undefined) {
        missingId = idName;
        break;
      }
      body[field] = Number.isNaN(Number(value)) ? value : Number(value);
    }

    const pathArgs: Record<string, unknown> = {};
    if (missingId === "" && probe.pathFromId !== undefined) {
      const value = ids.get(probe.pathFromId);
      if (value === undefined) {
        missingId = probe.pathFromId;
      } else if ("literal" in entry.path) {
        missingId = probe.pathFromId;
      } else {
        const param = entry.path.params[0];
        if (param === undefined) {
          missingId = probe.pathFromId;
        } else {
          pathArgs[param] = value;
        }
      }
    }

    if (missingId !== "") {
      results.push({
        tool: entry.name,
        specPath,
        status: "uebersprungen",
        note:
          `Für diesen Aufruf fehlt die Kennung ${missingId}. Sie stammt aus einer ` +
          "früheren Antwort dieses Laufs; ohne sie wird nichts geraten.",
        rowCount: 0,
        deviations: [],
      });
      continue;
    }

    const built = buildPath(entry, pathArgs);
    const call: EndpointCall = {
      toolName: entry.name,
      toolClass: entry.toolClass,
      specPath: built.specPath,
      requestPath: built.requestPath,
      shape: entry.shape,
      bucket: entry.bucket,
      timeoutTier: entry.timeoutTier,
      body,
    };

    // Der Wächter. Er steht zwischen dem fertigen Aufruf und dem Absenden, und er ist die
    // letzte Stelle, an der dieser Lauf noch anhalten kann.
    assertAllowedCall(allowList, call);

    let envelope: SuccessEnvelope;
    try {
      const result = await callEndpoint(call);
      envelope = result.envelope;
    } catch (error) {
      results.push({
        tool: entry.name,
        specPath,
        status: "gescheitert",
        note: error instanceof Error ? error.message : String(error),
        rowCount: 0,
        deviations: [],
      });
      continue;
    }

    const rows = rowsOf(entry, envelope);
    const observed = observeRows(rows);

    const harvestSpec = probe.harvest ?? {};
    for (const idName of Object.keys(harvestSpec) as IdName[]) {
      const field = harvestSpec[idName];
      if (field !== undefined) {
        harvestId(ids, idName, field, rows, harvestSpec);
      }
    }

    if (rows.length === 0 || observed.size === 0) {
      results.push({
        tool: entry.name,
        specPath,
        status: "uebersprungen",
        note:
          "Die Antwort enthielt keine auswertbare Zeile. Für diesen Mandanten und diese " +
          "Parameter bestätigt der Lauf keinen einzigen Feldnamen; der Vertrag bleibt, wie er ist.",
        rowCount: 0,
        deviations: [],
      });
      continue;
    }

    results.push({
      tool: entry.name,
      specPath,
      status: "geprueft",
      note: envelope.warnings
        .map((warning) => warning.text)
        .join(" ")
        .trim(),
      rowCount: rows.length,
      deviations: compareContract(entry.responseContract, observed, rows.length),
    });
  }

  return report(results);
}

/**
 * Übernimmt eine Kennung aus den Zeilen einer Antwort.
 *
 * Bevorzugt wird eine Zeile, in der ALLE geernteten Felder gesetzt sind. Der Grund ist
 * fachlich: Eine Buchung, die Beleg und Zahlung verbindet, führt beide Kennungen, und nur
 * mit einem solchen Paar liefern die beiden Zuordnungslisten überhaupt eine Zeile. Findet
 * sich keine solche Zeile, wird je Feld der erste gesetzte Wert genommen.
 */
function harvestId(
  ids: Map<IdName, string>,
  idName: IdName,
  field: string,
  rows: readonly unknown[],
  harvestFields: Readonly<Partial<Record<IdName, string>>>,
): void {
  if (ids.has(idName)) {
    return;
  }
  const fieldNames = Object.values(harvestFields).filter(
    (name): name is string => name !== undefined,
  );

  const completeRow = rows.find((row) => {
    if (jsonKindOf(row) !== "object") {
      return false;
    }
    const record = row as Record<string, unknown>;
    return fieldNames.every((name) => record[name] !== undefined && record[name] !== null);
  });

  const candidateRows = completeRow === undefined ? rows : [completeRow];
  for (const row of candidateRows) {
    if (jsonKindOf(row) !== "object") {
      continue;
    }
    const value = (row as Record<string, unknown>)[field];
    if (typeof value === "string" && value !== "") {
      ids.set(idName, value);
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      ids.set(idName, String(value));
      return;
    }
  }
}

/** Schreibt den Bericht auf stdout und liefert den Rückgabewert des Laufs. */
function report(results: readonly ProbeResult[]): number {
  const allDeviations = results.flatMap((result) => result.deviations);
  // Der Rückgabewert hängt ausschließlich an neuen, fehlenden und typveränderten Feldern.
  // Ein Hinweis ist Dokumentation und kein Befund: Er entsteht dort, wo ein Feld
  // durchgehend null war, und `null` ist bei jedem Vertragstyp zulässig.
  const reportableCount = allDeviations.filter((deviation) => deviation.kind !== "hinweis").length;
  const noteCount = allDeviations.length - reportableCount;
  const failedResults = results.filter((result) => result.status === "gescheitert");

  console.log("Vertragslauf gegen die echte API, ausschließlich lesend.");
  console.log(`Ausgewertet: ${results.length} Einträge.\n`);

  for (const result of results) {
    console.log(`${result.tool}  (${result.specPath})`);

    if (result.status === "uebersprungen") {
      console.log(`  übersprungen: ${result.note}`);
      console.log("");
      continue;
    }
    if (result.status === "gescheitert") {
      console.log(`  gescheitert: ${result.note}`);
      console.log("");
      continue;
    }

    console.log(`  ${result.rowCount} Zeile(n) ausgewertet.`);
    if (result.note !== "") {
      console.log(`  Umschlag: ${result.note}`);
    }
    if (result.deviations.length === 0) {
      console.log("  Der Antwortvertrag deckt sich mit der Antwort.");
    }
    for (const kind of ["neu", "fehlt", "typ", "hinweis"] as const) {
      const matches = result.deviations.filter((deviation) => deviation.kind === kind);
      for (const deviation of matches) {
        console.log(`  [${kind}] ${deviation.text}`);
      }
    }
    console.log("");
  }

  const checkedCount = results.filter((result) => result.status === "geprueft").length;
  console.log(
    `Zusammenfassung: ${checkedCount} Endpunkt(e) geprüft, ${reportableCount} nachzutragende(s) Feld(er), ` +
      `${noteCount} Hinweis(e), ${failedResults.length} gescheitert.`,
  );

  if (failedResults.length > 0) {
    return 2;
  }
  return reportableCount > 0 ? 1 : 0;
}

/**
 * Ausgeführt wird nur beim direkten Aufruf. Ein Import aus dem Test setzt keinen Request ab
 * und meldet auch keinen Auflösungshaken an.
 */
const invokedScriptPath = process.argv[1];
if (invokedScriptPath !== undefined && import.meta.url === pathToFileURL(invokedScriptPath).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    });
}
