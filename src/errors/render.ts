/**
 * Der Aufbau jeder Fehlermeldung: vier Blöcke, immer in dieser Reihenfolge, immer vorhanden
 * (Plan 5.8).
 *
 * ```
 * [Was]     ein Satz, was schiefging
 * [Warum]   mit dem konkreten Wert, der das Problem verursacht hat
 * [Wie]     was stattdessen zu tun ist, als konkreter Aufruf
 * [Zustand] eine von genau drei Formulierungen
 * ```
 *
 * Alle vier Blöcke sind deutsch (E4); Feldnamen, Werkzeugnamen und wörtlich zitierte
 * API-Meldungen bleiben im Original.
 *
 * **Der Wortlaut der Antwort gewinnt.** Der Block `[Was]` zitiert ausschließlich das
 * `message`-Feld der tatsächlichen Antwort, wörtlich und als Fremdtext markiert. Der
 * Katalogtext tritt nur ein, wenn die Antwort keinen verwertbaren Text trägt, und dann mit dem
 * Zusatz „Text laut Spezifikation, nicht der Wortlaut dieser Antwort". Begründung ist eine
 * Messung: Live kam an `/receipts/get` zu Code 15 der Text `invalid field specified`, der in
 * **keiner** der beiden Spezifikationsquellen steht (Plan 0.3 Befund L6).
 *
 * **Die drei Zustandssätze stehen hier als Konstanten und werden nie neu formuliert.** Eine
 * vierte Formulierung ist verboten; `errors-render.test.ts` vergleicht zeichengenau.
 */

import { redact } from "../config/redact.js";
import {
  ApiResponseError,
  CancelledError,
  EnvelopeContractError,
  type FailurePhase,
  FOREIGN_TEXT_MARKER,
  InvalidRequestError,
  MalformedJsonError,
  NetworkError,
  NonJsonResponseError,
  RateLimitGiveUpError,
  TimeoutError,
  type TransportError,
} from "../http/transport-error.js";
import { READ_ONLY_TOOL_CLASS } from "../registry/classes.js";
import type { VerifySpec } from "../registry/types.js";
import type { ErrorClass } from "./catalog.js";
import {
  type Classification,
  type ClassOrigin,
  classifyFailure,
  describeAmbiguity,
} from "./classify.js";
import {
  buildWriteUncertainty,
  formatArgumentValue,
  type WriteUncertaintyCause,
} from "./write-uncertainty.js";

// ---------------------------------------------------------------------------------------
// Die drei Zustandsformulierungen aus Plan 5.8. Genau drei, an genau einer Stelle.
// ---------------------------------------------------------------------------------------

/** Jede Ablehnung vor dem Request, also durch jeden der sechs Guards. */
export const STATE_NOTHING_SENT =
  "Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.";

/** Eine Fehlerantwort mit `success: false`, die die API verwertbar abgelehnt hat. */
export const STATE_REJECTED =
  "BuchhaltungsButler hat die Anfrage abgelehnt. Es wurde nichts geändert.";

/** Zeitlimit, Verbindungsabbruch oder HTTP 5xx an einem schreibenden Werkzeug (Plan 5.7). */
export const STATE_UNKNOWN =
  "Es ist UNBEKANNT, ob BuchhaltungsButler diese Anfrage verarbeitet hat.";

export const STATE_SENTENCES = [STATE_NOTHING_SENT, STATE_REJECTED, STATE_UNKNOWN] as const;

export type StateSentence = (typeof STATE_SENTENCES)[number];

export interface ErrorBlocks {
  readonly was: string;
  readonly warum: string;
  readonly wie: string;
  readonly zustand: StateSentence;
}

export interface ErrorMessage {
  readonly text: string;
  readonly blocks: ErrorBlocks;
  readonly state: StateSentence;
  /** Die Klasse aus 5.6, oder `null`, wenn der Fehler keinen Katalogbezug hat. */
  readonly cls: ErrorClass | null;
  readonly origin: ClassOrigin | null;
  /** `true`, wenn der Text den Sonderfall aus 5.7 trägt. */
  readonly uncertainWrite: boolean;
}

export interface RenderContext {
  /** Die Argumente des Aufrufs, ohne `api_key`. */
  readonly args?: Readonly<Record<string, unknown>>;
  /** Der Prüfweg aus dem Registereintrag; Pflicht bei jedem schreibenden Werkzeug (P10). */
  readonly verifyWith?: VerifySpec;
  /** Erlaubte Werte je Feld, soweit das Register sie führt (Plan 5.8, erste Pflichtangabe). */
  readonly allowedValues?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Wählt den Zustandssatz.
 *
 * Die Lage entscheidet, nicht die Klasse: `not-sent` heißt, es ging nichts hinaus;
 * `rejected` heißt, die API hat geprüft und abgelehnt; `unclear` heißt, der Ausgang ist offen.
 *
 * **Ein lesendes Werkzeug mit offenem Ausgang bekommt ebenfalls Satz 3.** Plan 5.8 nennt bei
 * Satz 3 ausdrücklich das schreibende Werkzeug, und Satz 3 ist trotzdem der einzige der drei,
 * der hier nicht die Unwahrheit sagt: Nach einem Zeitlimit ist Satz 1 falsch (es ging etwas
 * hinaus) und Satz 2 ebenso (die API hat nichts abgelehnt). Dass ein lesender Aufruf nichts
 * ändert, steht in der Klassenzusage des Werkzeugs; der Sondertext aus 5.7 entsteht dagegen
 * ausschließlich bei den schreibenden Klassen.
 */
export function selectStateSentence(phase: FailurePhase, uncertainWrite: boolean): StateSentence {
  if (uncertainWrite || phase === "unclear") {
    return STATE_UNKNOWN;
  }
  return phase === "not-sent" ? STATE_NOTHING_SENT : STATE_REJECTED;
}

/** Setzt die vier Blöcke zu einem Text zusammen und schwärzt ihn. */
export function composeMessage(blocks: ErrorBlocks): string {
  return redact(
    [
      `[Was] ${blocks.was}`,
      `[Warum] ${blocks.warum}`,
      `[Wie] ${blocks.wie}`,
      `[Zustand] ${blocks.zustand}`,
    ].join("\n"),
  );
}

function finish(
  blocks: ErrorBlocks,
  rest: Omit<ErrorMessage, "text" | "blocks" | "state">,
): ErrorMessage {
  return { text: composeMessage(blocks), blocks, state: blocks.zustand, ...rest };
}

// ---------------------------------------------------------------------------------------
// Zitat der Antwort und Rückfall auf den Katalogtext (Plan 5.6, 5.8).
// ---------------------------------------------------------------------------------------

/** Der Zusatz, der jeden Katalogtext begleitet, der an die Stelle des Wortlauts tritt. */
export const SPEC_TEXT_NOTE = "Text laut Spezifikation, nicht der Wortlaut dieser Antwort";

function quoteResponse(apiMessage: string | null, classification: Classification): string {
  if (apiMessage !== null) {
    const entry = classification.entry;
    // Die Kurzfassung entfällt, sobald eine Lesart den Text aufgelöst hat: Bei den beiden
    // Paaren mit doppelt vergebenem error_code gehört der Katalogtext dieses Codes
    // möglicherweise zur ANDEREN Lesart, und er stünde dann als Kurzfassung dieser Antwort da,
    // obwohl er etwas anderes meint.
    //
    // Der Textvergleich darunter entscheidet ausschließlich darüber, ob derselbe Satz zweimal
    // im Block steht. An ihm hängt keine Klasse, kein Retry und keine Weiche; die Einordnung
    // ist zu diesem Zeitpunkt längst gefallen (classify.ts).
    const summary =
      entry !== null && classification.reading === null && entry.summary !== apiMessage
        ? ` (Kurzfassung laut Spezifikation: "${entry.summary}")`
        : "";
    return `${FOREIGN_TEXT_MARKER} "${apiMessage}"${summary}`;
  }
  if (classification.entry === null) {
    return "Die Antwort trug keinen verwertbaren Text, und die Spezifikation führt dieses Paar nicht.";
  }
  return (
    `Die Antwort trug keinen verwertbaren Text. Die Spezifikation führt zu diesem Paar ` +
    `"${classification.entry.message}" (${SPEC_TEXT_NOTE}).`
  );
}

// ---------------------------------------------------------------------------------------
// Die deutsche Einordnung je Klasse für den Block [Was].
//
// Der Katalog führt mit `summary` zwar eine kürzere Fassung, aber `summary` ist die englische
// `responses[…].description` der Spezifikation und keine deutsche Einordnung. Übersetzt wird
// hier nichts: Eine erfundene deutsche Fassung eines fremden Textes wäre eine Behauptung über
// dessen Bedeutung. Die deutsche Einordnung kommt deshalb aus der Klasse, der englische
// `summary` steht als Zitat daneben.
// ---------------------------------------------------------------------------------------

const CLASS_HEADLINE: Record<ErrorClass, string> = {
  config: "BuchhaltungsButler hat den Zugang oder eine Kontoeinstellung beanstandet",
  input: "BuchhaltungsButler hat einen Eingabewert beanstandet",
  transient: "BuchhaltungsButler meldet einen vorübergehenden Zustand",
  final: "BuchhaltungsButler meldet einen Zustand, den ein erneuter Aufruf nicht ändert",
  special: "BuchhaltungsButler meldet einen benannten Sonderfall",
};

/**
 * Die Überschrift für die Rückfallregel. Sie behauptet ausdrücklich NICHT, dass ein erneuter
 * Aufruf nichts ändert: Über einen Code, den die Spezifikation für diesen Pfad nicht führt,
 * weiß dieser Server nichts. Die Behandlung als `final` ist die vorsichtige Festlegung aus
 * 5.6 und keine Aussage über die Ursache.
 */
const FALLBACK_HEADLINE =
  "BuchhaltungsButler meldet einen Fehler, den die Spezifikation für diesen Pfad nicht führt";

// ---------------------------------------------------------------------------------------
// Billigere Aufrufmuster bei überschrittenen Grenzen (Plan 5.8, zweite Pflichtangabe).
//
// Geschlüsselt ist die Tabelle über das Paar und nicht über den Meldungstext: Die Zuordnung
// „welcher Code an welchem Pfad meint eine Grenze" steht in der Spezifikation, der gelieferte
// Wortlaut dagegen ist nicht vorhersagbar (L6).
// ---------------------------------------------------------------------------------------

const CHEAPER_CALL_ADVICE: ReadonlyMap<string, string> = new Map([
  [
    "/receipts/addBatch|5",
    "Der Stapel war zu groß. Höchstens 50 Belege je Aufruf senden und den Rest in einem zweiten " +
      "Stapelaufruf nachreichen; ein zweiter Stapel ist billiger als 50 Einzelaufrufe.",
  ],
  [
    "/transactions/addBatch|5",
    "Der Stapel war zu groß. Höchstens 50 Zahlungen je Aufruf senden und den Rest in einem " +
      "zweiten Stapelaufruf nachreichen; ein zweiter Stapel ist billiger als 50 Einzelaufrufe.",
  ],
  [
    "/transactions/assign-batch/receipt|10",
    "Der Stapel war zu groß. Höchstens 50 Zuordnungen je Aufruf senden und den Rest in einem " +
      "zweiten Stapelaufruf nachreichen.",
  ],
  [
    "/receipts/upload|7",
    "Die Datei ist zu groß. Eine kleinere Fassung hochladen; ein Beleg ohne Datei lässt sich " +
      "über bb_receipts_create anlegen und später mit der Datei ergänzen.",
  ],
  [
    "/receipts/upload|14",
    "Die Datei hat zu viele Seiten. Das Dokument aufteilen und die Teile einzeln hochladen.",
  ],
]);

/** Felder, bei denen eine Grenze über das billigere Blättern statt über Wiederholung fällt. */
const PAGINATION_FIELDS: readonly string[] = ["limit", "offset"];

// ---------------------------------------------------------------------------------------
// Levenshtein für den wahrscheinlich gemeinten Wert (Plan 5.8, erste Pflichtangabe).
// ---------------------------------------------------------------------------------------

/** Abstand zweier Zeichenketten, gedeckelt: Alles über `limit` interessiert nicht. */
export function levenshtein(a: string, b: string): number {
  const line = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = line[0] ?? 0;
    line[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = line[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      line[j] = Math.min((line[j] ?? 0) + 1, (line[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = previous;
    }
  }
  return line[b.length] ?? 0;
}

/** Der erlaubte Wert mit Abstand 1 oder 2 zum gesendeten; sonst `null`. */
export function closestAllowedValue(sent: unknown, allowed: readonly string[]): string | null {
  if (typeof sent !== "string" || allowed.length === 0) {
    return null;
  }
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const value of allowed) {
    const distance = levenshtein(sent, value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = value;
    }
  }
  return bestDistance >= 1 && bestDistance <= 2 ? best : null;
}

// ---------------------------------------------------------------------------------------
// Die Blöcke [Warum] und [Wie] je Klasse.
// ---------------------------------------------------------------------------------------

function describeSentValue(
  field: string | null,
  args: Readonly<Record<string, unknown>>,
): string | null {
  if (field === null) {
    return null;
  }
  if (!(field in args)) {
    return `Die Meldung bezieht sich auf ${field}; dieser Wert war in den Argumenten nicht enthalten.`;
  }
  return `Gesendet wurde ${field}=${formatArgumentValue(field, args[field])}.`;
}

function reasonForConfig(errorCode: number | null): string {
  switch (errorCode) {
    case 3:
      return "BuchhaltungsButler hat die Basic-Auth-Zugangsdaten nicht angenommen; betroffen sind api_client und api_secret.";
    case 4:
      return "Der Mandantenschlüssel api_key ist unbekannt, oder der API-Client hat für diesen Mandanten keine ausreichenden Rechte.";
    case 11:
      return "Der über api_key gewählte Mandant hat in BuchhaltungsButler keinen aktiven Status.";
    default:
      return "BuchhaltungsButler meldet eine Kontoeinstellung als nicht aktiviert. Das ist kein Wert dieses Aufrufs, sondern eine Einstellung des Mandanten.";
  }
}

function adviceForConfig(errorCode: number | null): string {
  switch (errorCode) {
    case 3:
      return "api_client und api_secret prüfen und richtigstellen. Der Unterbefehl bbutler-mcp doctor prüft die drei Zugangswerte, ohne sie auszugeben.";
    case 4:
      return "api_key prüfen und sicherstellen, dass der API-Client diesem Mandanten mit ausreichenden Rechten zugewiesen ist. bbutler-mcp doctor zeigt, welcher Mandant konfiguriert ist.";
    case 11:
      return "Der Mandant ist in BuchhaltungsButler selbst zu aktivieren; über diesen Server ist daran nichts zu ändern. bbutler-mcp doctor zeigt, welcher Mandant konfiguriert ist.";
    default:
      return "Die genannte Einstellung in BuchhaltungsButler aktivieren. Bis dahin scheitert derselbe Aufruf mit denselben Werten genauso; bbutler-mcp doctor prüft die Zugangsdaten, nicht diese Einstellung.";
  }
}

function adviceForInput(
  toolName: string,
  specPath: string,
  errorCode: number | null,
  field: string | null,
  context: RenderContext,
): string {
  const parts: string[] = [];
  if (field === null) {
    parts.push(
      `Die Argumente gegen die Beschreibung von ${toolName} prüfen und den beanstandeten Wert ` +
        "korrigieren. Derselbe Aufruf mit denselben Werten scheitert erneut.",
    );
  } else {
    parts.push(`Den Wert für ${field} korrigieren und ${toolName} erneut aufrufen.`);
    const allowed = context.allowedValues?.[field];
    if (allowed !== undefined && allowed.length > 0) {
      parts.push(`Erlaubt sind: ${allowed.join(", ")}.`);
      const probablyMeant = closestAllowedValue(context.args?.[field], allowed);
      if (probablyMeant !== null) {
        parts.push(`Gemeint war wahrscheinlich ${probablyMeant}.`);
      }
    }
    if (PAGINATION_FIELDS.includes(field)) {
      parts.push(
        "Bei einer überschrittenen Grenze ist Blättern billiger als Wiederholen: kleineres " +
          "limit wählen und mit offset weiterblättern, statt denselben Aufruf erneut zu senden.",
      );
    }
  }
  const cheaper =
    errorCode === null ? undefined : CHEAPER_CALL_ADVICE.get(`${specPath}|${errorCode}`);
  if (cheaper !== undefined) {
    parts.push(cheaper);
  }
  return parts.join(" ");
}

function adviceForFinal(toolName: string, verifyWith: VerifySpec | undefined): string {
  const base = `Ein erneuter Aufruf von ${toolName} mit denselben Werten ändert daran nichts.`;
  if (verifyWith === undefined) {
    return `${base} Zuerst den Zustand des betroffenen Vorgangs prüfen und die Argumente daran ausrichten.`;
  }
  if (verifyWith.kind === "none") {
    return `${base} Die API bietet dazu keinen Leseweg: ${verifyWith.reason} In der Weboberfläche von BuchhaltungsButler nachsehen.`;
  }
  return `${base} Zuerst den Zustand mit ${verifyWith.tool} prüfen und die Argumente daran ausrichten.`;
}

function adviceForTransientRead(toolName: string, attempts: number): string {
  return (
    `Der Zustand ist vorübergehend. Dieser Server hat ${attempts} Versuch(e) unternommen und ` +
    `keinen weiteren angehängt. ${toolName} mit denselben Argumenten später erneut aufrufen.`
  );
}

// ---------------------------------------------------------------------------------------
// Der Sonderfall 5.7 aus einem Transportfehler.
// ---------------------------------------------------------------------------------------

function causeFromError(error: TransportError, cls: ErrorClass | null): WriteUncertaintyCause {
  if (error instanceof TimeoutError) {
    return { kind: "timeout", timeoutMs: error.timeoutMs };
  }
  if (error instanceof NetworkError) {
    return { kind: "network", detail: error.detail };
  }
  if (error instanceof ApiResponseError) {
    if (error.status >= 500) {
      return { kind: "server-error", status: error.status, errorCode: error.errorCode };
    }
    if (cls === "transient") {
      return { kind: "throttle", status: error.status };
    }
    return { kind: "server-error", status: error.status, errorCode: error.errorCode };
  }
  if (error instanceof CancelledError) {
    return {
      kind: "unclear-response",
      detail: "Der Client hat den Aufruf abgebrochen, während er lief.",
    };
  }
  if (error instanceof NonJsonResponseError) {
    return {
      kind: "unclear-response",
      detail: `Die Gegenstelle hat mit Content-Type ${error.contentType ?? "ohne Angabe"} geantwortet und damit nicht als API.`,
    };
  }
  if (error instanceof MalformedJsonError) {
    return { kind: "unclear-response", detail: "Die Antwort war kein zerlegbares JSON." };
  }
  if (error instanceof EnvelopeContractError) {
    return {
      kind: "unclear-response",
      detail: `Der Antwortumschlag entspricht nicht dem Vertrag (${error.violation}).`,
    };
  }
  return { kind: "unclear-response", detail: "Der Aufruf ist ohne verwertbare Antwort geblieben." };
}

// ---------------------------------------------------------------------------------------
// Die beiden Einstiegspunkte.
// ---------------------------------------------------------------------------------------

export interface RejectionInput {
  readonly toolName: string;
  /** Was der Guard beanstandet hat, in einem Satz. */
  readonly was: string;
  /** Der konkrete Wert oder die konkrete Regel, an der es lag. */
  readonly warum: string;
  /** Was stattdessen zu tun ist, als konkreter Aufruf. */
  readonly wie: string;
}

/**
 * Eine Ablehnung **vor** dem Request: jeder der sechs Guards (Plan 1.4).
 *
 * Der Zustandssatz steht hier fest und wird nicht gewählt: Es ging nichts hinaus, und genau
 * das sagt Satz 1.
 */
export function renderRejectedBeforeRequest(input: RejectionInput): ErrorMessage {
  const blocks: ErrorBlocks = {
    was: `${input.toolName}: ${input.was}`,
    warum: input.warum,
    wie: input.wie,
    zustand: STATE_NOTHING_SENT,
  };
  return finish(blocks, { cls: null, origin: null, uncertainWrite: false });
}

/**
 * Die Meldung zu einem Fehler der HTTP-Schicht, vollständig nach 5.6, 5.7 und 5.8.
 *
 * Der Katalog wird dabei erst geladen, wenn eine Fehlerantwort der API vorliegt; bei einem
 * Zeitlimit oder einem Netzwerkfehler gibt es kein Paar nachzuschlagen und der Katalog bleibt
 * ungeladen.
 */
export async function renderTransportFailure(
  error: TransportError,
  context: RenderContext = {},
): Promise<ErrorMessage> {
  const args = context.args ?? {};
  const writing = error.toolClass !== READ_ONLY_TOOL_CLASS;

  let classification: Classification | null = null;
  if (error instanceof ApiResponseError) {
    classification = await classifyFailure({
      specPath: error.specPath,
      errorCode: error.errorCode,
      status: error.status,
      apiMessage: error.apiMessage,
    });
  }

  const cls = classification?.cls ?? null;
  // 5.6, Zeile `transient`: An einem schreibenden Werkzeug führt ein vorübergehender Zustand
  // zum Text aus 5.7 — auch bei HTTP 403, weil nicht belegt ist, ob die Einschränkung vor oder
  // nach dem Schreiben gegriffen hat. Die Fehlerschicht weitet den Zustand hier auf; enger
  // machen darf sie ihn nie (siehe http/transport-error.ts).
  const uncertainWrite = writing && (error.phase === "unclear" || cls === "transient");
  const stateSentence = selectStateSentence(error.phase, uncertainWrite);

  if (uncertainWrite) {
    const uncertainty = buildWriteUncertainty({
      toolName: error.toolName,
      specPath: error.specPath,
      cause: causeFromError(error, cls),
      ...(context.verifyWith === undefined ? {} : { verifyWith: context.verifyWith }),
      args,
    });
    const quote =
      error instanceof ApiResponseError && classification !== null
        ? ` ${quoteResponse(error.apiMessage, classification)}`
        : "";
    const blocks: ErrorBlocks = {
      was: `${uncertainty.headline}${quote}`,
      warum: uncertainty.reason,
      wie: appendAdvice(uncertainty.verification, classification?.guidance ?? null),
      zustand: stateSentence,
    };
    return finish(blocks, {
      cls,
      origin: classification?.origin ?? null,
      uncertainWrite: true,
    });
  }

  if (error instanceof ApiResponseError && classification !== null) {
    const field = classification.field;
    const headline =
      classification.fallback && classification.entry === null
        ? FALLBACK_HEADLINE
        : CLASS_HEADLINE[classification.cls];
    const head = `${error.toolName}: ${headline} (HTTP ${error.status}, error_code ${error.errorCode ?? "fehlt"}${field === null ? "" : `, Feld ${field}`}).`;
    const ambiguityNote =
      classification.reading === null
        ? ""
        : ` ${describeSpecialAmbiguity(error.specPath, error.errorCode, classification)}`;
    const was = `${head}${ambiguityNote} ${quoteResponse(error.apiMessage, classification)}`;

    const warum = reasonForApi(error, classification, field, args);
    const wie = adviceForApi(error, classification, context, field);
    return finish(
      { was, warum, wie, zustand: stateSentence },
      { cls: classification.cls, origin: classification.origin, uncertainWrite: false },
    );
  }

  // Alle übrigen Fehler der HTTP-Schicht. Ihr `message` ist bereits ein deutscher Satz, der
  // den Fall benennt und übernommenen Fremdtext markiert (AP07); er ist der Block [Was].
  return finish(
    {
      was: error.message,
      warum: reasonForTransport(error),
      wie: adviceForTransport(error, writing),
      zustand: stateSentence,
    },
    { cls, origin: classification?.origin ?? null, uncertainWrite: false },
  );
}

/** Hängt einen Sonderfallhinweis an einen Text an, falls es einen gibt. */
function appendAdvice(text: string, guidance: string | null): string {
  return guidance === null ? text : `${text} ${guidance}`;
}

/**
 * Benennt bei einem Paar mit mehreren Lesarten, woran die Mehrdeutigkeit liegt und wie sie hier
 * aufgelöst wurde. Beides gehört in die Meldung: Der Agent soll wissen, dass die Auflösung am
 * Wortlaut hängt und nicht am `error_code`.
 */
function describeSpecialAmbiguity(
  specPath: string,
  errorCode: number | null,
  classification: Classification,
): string {
  const reading = classification.reading;
  if (reading === null) {
    return "";
  }
  const reason = describeAmbiguity(specPath, errorCode);
  const resolution = `Die Lesart folgt hier aus dem gelieferten Text (${reading.id}).`;
  return reason === null ? resolution : `${reason} ${resolution}`;
}

function reasonForApi(
  error: ApiResponseError,
  classification: Classification,
  field: string | null,
  args: Readonly<Record<string, unknown>>,
): string {
  const errorCode = error.errorCode;
  if (classification.cls === "config") {
    return reasonForConfig(errorCode);
  }
  if (classification.cls === "transient") {
    return `Die Spezifikation führt dieses Paar als vorübergehenden Zustand (HTTP ${error.status}). Ein Wert des Aufrufs ist nicht die Ursache.`;
  }
  if (classification.fallback) {
    // Die Rückfallregel aus 5.6. Sie wird benannt und nicht verschleiert: Der Agent soll
    // wissen, dass dieser Server hier nichts zuordnet, was er nicht belegen kann.
    return classification.entry === null
      ? `Die Spezifikation führt zu ${error.specPath} keinen error_code ${errorCode ?? "ohne Angabe"}. Dieser Server ordnet ihn keinem gleichnamigen Code eines anderen Pfades zu; maßgeblich ist allein der oben zitierte Wortlaut.`
      : `Die Spezifikation kennt dieses Paar, der gelieferte Text passt aber auf keine der bekannten Lesarten. Maßgeblich ist deshalb allein der oben zitierte Wortlaut.`;
  }
  const value = describeSentValue(field, args);
  if (value !== null) {
    return value;
  }
  if (classification.cls === "special") {
    return "Die Spezifikation führt dieses Paar als benannten Sonderfall; die Antwort beanstandet keinen Wert des Aufrufs.";
  }
  return "Die Spezifikation ordnet diesem Paar kein einzelnes Feld zu, und die Antwort nennt keines. Maßgeblich ist der oben zitierte Wortlaut.";
}

function adviceForApi(
  error: ApiResponseError,
  classification: Classification,
  context: RenderContext,
  field: string | null,
): string {
  const parts: string[] = [];
  switch (classification.cls) {
    case "config":
      parts.push(adviceForConfig(error.errorCode));
      break;
    case "input":
      parts.push(adviceForInput(error.toolName, error.specPath, error.errorCode, field, context));
      break;
    case "transient":
      // Schreibend ist dieser Zweig nicht erreichbar: Dort greift der Sondertext aus 5.7.
      parts.push(adviceForTransientRead(error.toolName, error.attempts));
      break;
    case "final":
      parts.push(adviceForFinal(error.toolName, context.verifyWith));
      break;
    case "special": {
      // Ohne Lesart und ohne Hinweis bleibt nur der Rat der Klasse `final`. Steht ein
      // ausformulierter Sonderfalltext bereit, ERSETZT er ihn: Bei einem Zwischenstand wäre
      // „ein erneuter Aufruf ändert daran nichts" das Gegenteil des richtigen Rats.
      const specialAdvice = classification.reading?.guidance ?? classification.guidance;
      parts.push(specialAdvice ?? adviceForFinal(error.toolName, context.verifyWith));
      if (specialAdvice !== null && specialAdvice !== undefined) {
        return parts.join(" ");
      }
      break;
    }
  }
  return appendAdvice(parts.join(" "), classification.guidance);
}

function reasonForTransport(error: TransportError): string {
  if (error instanceof TimeoutError) {
    return `Das Zeitlimit lag bei ${Math.round(error.timeoutMs / 1000)} s; die Gegenstelle hat in dieser Zeit nicht vollständig geantwortet.`;
  }
  if (error instanceof NetworkError) {
    return `Die Verbindung ist gescheitert: ${error.detail}`;
  }
  if (error instanceof RateLimitGiveUpError) {
    return `Der Eimer ${error.bucket} war belegt; die Wartezeit hätte rund ${Math.round(error.waitMs / 1000)} s betragen, die Grenze liegt bei ${Math.round(error.limitMs / 1000)} s.`;
  }
  if (error instanceof InvalidRequestError) {
    return `Dieser Server hat den Aufruf selbst abgelehnt (${error.reason}); er darf ihn so nicht absetzen.`;
  }
  if (error instanceof NonJsonResponseError) {
    return `Gemeldet wurde Content-Type ${error.contentType ?? "ohne Angabe"}; ein Pfad dieser API antwortet mit application/json.`;
  }
  if (error instanceof MalformedJsonError) {
    return "Der Content-Type kündigte JSON an, der Körper ließ sich aber nicht zerlegen.";
  }
  if (error instanceof EnvelopeContractError) {
    return `Der Umschlag verletzt den Vertrag: ${error.violation}.`;
  }
  if (error instanceof CancelledError) {
    return "Der Abbruch kam vom Client, nicht von BuchhaltungsButler.";
  }
  return "Die Ursache liegt in der Verbindung oder in der Antwort, nicht in einem Wert des Aufrufs.";
}

function adviceForTransport(error: TransportError, writing: boolean): string {
  if (error instanceof RateLimitGiveUpError) {
    return "Mehrere Einzelabfragen zu einer Sammelabfrage zusammenfassen und es danach erneut versuchen. Das Minutenkontingent gilt je Mandant und wird mit anderen Anwendungen geteilt.";
  }
  if (error instanceof InvalidRequestError) {
    return "Die Argumente gegen die Beschreibung des Werkzeugs prüfen; bei fehlenden Zugangsdaten hilft bbutler-mcp doctor.";
  }
  if (error instanceof CancelledError) {
    return "Der Aufruf lässt sich unverändert erneut stellen, sobald er gewollt ist.";
  }
  if (error instanceof NonJsonResponseError || error instanceof MalformedJsonError) {
    return "Die Basis-URL prüfen (BB_BASE_URL) und den Aufruf danach erneut stellen. Antwortet ein Zwischenknoten, hilft kein anderer Wert im Aufruf.";
  }
  if (error instanceof EnvelopeContractError) {
    return "Der Aufruf wird nicht als Erfolg behandelt. Den Vorgang in BuchhaltungsButler nachsehen, bevor derselbe Aufruf wiederholt wird.";
  }
  // Zeitlimit und Netzwerkfehler an einem lesenden Werkzeug: Der Retry-Zweig hat bereits
  // gearbeitet, ein weiterer Versuch ist dem Agenten überlassen. Schreibend ist dieser Zweig
  // nicht erreichbar — dort greift 5.7.
  return writing
    ? "Vor jedem weiteren Aufruf in BuchhaltungsButler nachsehen, ob der Vorgang angekommen ist."
    : "Der Aufruf ist folgenlos wiederholbar; die Argumente bleiben gültig.";
}
