// Die Registrierung aller Werkzeuge und der EINE generische Handler (Plan 1.2 Punkt 1, 1.4).
//
// Was 54-fach existiert, sind Daten und keine Ablaufpfade. Dieser Ausführungsweg wird genau
// einmal geschrieben und von jedem Werkzeug benutzt; ein Fehler in der Ablauflogik ist damit
// ein Fehler und nicht potenziell 54. Die Reihenfolge der sechs Guards steht in `runTool` und
// ist die aus Plan 1.4 — sie ist nicht durch Disziplin eingehalten, sondern als einzige
// Codefolge vorhanden, die es gibt.
//
// **Die Schemaprüfung findet in diesem Handler statt und nicht im SDK.** Das ist eine bewusste
// Entscheidung mit einem zwingenden Grund: `McpServer` validiert ein übergebenes `inputSchema`
// selbst, und zwar **vor** dem Handler. Damit liefe Guard 3 vor Guard 1 und Guard 2, und ein
// gesperrtes schreibendes Werkzeug mit einem Tippfehler im Argument meldete den Tippfehler
// statt der Absage des Nur-Lesen-Schalters — genau die Reihenfolge, die Plan 1.4 ausschließt.
// Außerdem wäre der Text eine englische SDK-Meldung ohne den Zustandssatz aus 5.8. Der Server
// gibt dem SDK deshalb einen Schematräger, der das erzeugte JSON Schema **ankündigt** und die
// Prüfung selbst nicht vornimmt (siehe {@link advertise}); geprüft wird in Guard 3 mit
// demselben Zod-Schema, aus dem dieses JSON Schema entstanden ist.

import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

import type { MasterDataStore } from "../cache/store.js";
import { getMasterDataStore } from "../cache/store.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { getConfig } from "../config/resolve.js";
import { pathLabel } from "../errors/path-label.js";
import { renderRejectedBeforeRequest, renderTransportFailure } from "../errors/render.js";
import { checkConfigured } from "../guards/configured.js";
import { checkDuplicates } from "../guards/duplicate-check.js";
import { checkLimits } from "../guards/limits.js";
import { checkReadOnly } from "../guards/read-only.js";
import type { HttpCallResult } from "../http/client.js";
import { callEndpoint } from "../http/client.js";
import type { SuccessEnvelope } from "../http/envelope.js";
import { isTransportError } from "../http/transport-error.js";
import { logDebug, logError, writeStderrBlock } from "../logging/stderr.js";
import type { MappedRequest } from "../mapping/request.js";
import { mapRequest, resolveUploadArguments } from "../mapping/request.js";
import { mapResponse } from "../mapping/response.js";
import { TOOL_CLASSES } from "../registry/classes.js";
import { TOOL_ENTRIES } from "../registry/index.generated.js";
import type { ToolClass, ToolEntry } from "../registry/types.js";
import { buildToolResponse } from "../response/build.js";
import { sanitizeText } from "../response/sanitize.js";
import { buildOutputSchema } from "../response/output-schema.js";
import { isUploadSourceError } from "../upload/sniff.js";
import { buildZodSchema, specPathOf, toJsonSchema } from "../schema/build.js";

/** Die geprüften Argumente eines Werkzeugaufrufs. */
type ToolArguments = Record<string, unknown>;

/** Herkunftskennung der Schematräger. Sie erscheint in keinem ausgelieferten Text. */
const SCHEMA_VENDOR = "buchhaltungsbutler-mcp";

/**
 * Ein Schematräger für das SDK: Er **kündigt** ein fertiges JSON Schema an und prüft nicht.
 *
 * Die Begründung steht im Kopf dieser Datei. Entscheidend ist, dass hier nichts verloren geht:
 * Das angekündigte JSON Schema ist dasselbe, das `schema/build.ts` aus dem Zod-Schema erzeugt,
 * mit dem Guard 3 prüft. `tools/list` und Guard 3 können also nicht auseinanderlaufen — sie
 * stammen aus einem Aufruf.
 */
function advertise(
  jsonSchema: Record<string, unknown>,
): StandardSchemaWithJSON<ToolArguments, ToolArguments> {
  return {
    "~standard": {
      version: 1,
      vendor: SCHEMA_VENDOR,
      validate: (value: unknown) => ({ value: value as ToolArguments }),
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema,
      },
    },
  };
}

export interface RegisteredToolInfo {
  readonly name: string;
  /** Der unveränderte Spezifikationspfad, auch bei den vier Werkzeugen mit Pfadvorlage (4.6). */
  readonly specPath: string;
  readonly toolClass: ToolClass;
  /** `true`, wenn dieses Werkzeug bei der aktuellen Konfiguration an Guard 2 scheitert. */
  readonly blockedByReadOnly: boolean;
}

export interface RegisterToolsOptions {
  /** Die Einträge. Ohne Angabe das vollständige Register aus `index.generated.ts`. */
  readonly entries?: readonly ToolEntry[];
  /** Die aufgelöste Konfiguration. Ohne Angabe die eingefrorene des Prozesses. */
  readonly config?: ResolvedConfig;
  /** Der Stammdatenspeicher. Ohne Angabe der prozessweite aus `cache/store.ts`. */
  readonly store?: MasterDataStore;
  /** Die Uhr der Audit-Dauer. Monoton, nicht die Wanduhr. */
  readonly now?: () => number;
}

/** Was der Handler über sein Werkzeug wissen muss. Einmal beim Registrieren gebaut. */
interface ToolRuntime {
  readonly entry: ToolEntry;
  /**
   * Guard 3: das Objektschema **ohne** die Querprüfungen. Es entsteht aus demselben Eintrag
   * mit leerem `crossChecks`, damit Guard 3 und Guard 4 getrennt melden können und nicht aus
   * einem Parse heraus geraten werden muss, welcher der beiden gegriffen hat.
   */
  readonly baseSchema: z.ZodType;
  /** Guard 4: dasselbe Schema **mit** den Querprüfungen aus `crossChecks`. */
  readonly fullSchema: z.ZodType;
  readonly specPath: string;
  readonly config: ResolvedConfig;
  readonly store: MasterDataStore;
  readonly resolveEntry: (name: string) => ToolEntry | undefined;
  readonly now: () => number;
}

/** Der Ergebnisstatus der Audit-Zeile. */
type AuditOutcome = string;

function textResult(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

/**
 * Die Audit-Zeile aus Plan 1.4 Schritt 14.
 *
 * Sie nennt Zeitstempel, Werkzeug, Klasse, Endpunkt, Dauer, Ergebnisstatus und die
 * Argument**namen** ohne Werte. Als Endpunkt steht dort `specPath` und niemals der gebaute
 * Pfad: Bei den vier Werkzeugen mit Pfadvorlage stünde sonst die eingesetzte Geschäftskennung
 * im Protokoll, und das wäre ein Wert und kein Name (Plan 4.6).
 *
 * Die Zeile hängt **nicht** an `BB_MCP_LOG_LEVEL`. Sie ist der Prüfpfad des Servers
 * (`tool-design.md` 9.6 Punkt 3: „Jeder Aufruf"), und ein Prüfpfad, den die Protokollstufe
 * abschaltet, ist keiner. Sie geht wie jede Ausgabe dieses Servers nach stderr und läuft dabei
 * durch die Schwärzung; stdout gehört dem Protokoll (Plan 1.5).
 */
function audit(
  runtime: ToolRuntime,
  rawArgs: ToolArguments,
  startedAt: number,
  outcome: AuditOutcome,
): void {
  const durationMs = Math.round(runtime.now() - startedAt);
  const names = Object.keys(rawArgs).sort();
  writeStderrBlock(
    `audit ${new Date().toISOString()} werkzeug=${runtime.entry.name} ` +
      `klasse=${runtime.entry.toolClass} endpunkt=${runtime.specPath} ` +
      `dauer=${String(durationMs)}ms ergebnis=${outcome} ` +
      `argumente=${names.length === 0 ? "keine" : names.join(",")}`,
  );
}

/** Eine Ablehnung vor dem Request: Audit-Zeile schreiben und das Ergebnis zurückgeben. */
function refuse(
  runtime: ToolRuntime,
  rawArgs: ToolArguments,
  startedAt: number,
  outcome: AuditOutcome,
  text: string,
): CallToolResult {
  audit(runtime, rawArgs, startedAt, `abgelehnt:${outcome}`);
  return textResult(text, true);
}

// ---------------------------------------------------------------------------------------
// Guard 3 und Guard 4: die Schemameldungen.
// ---------------------------------------------------------------------------------------

/**
 * Der Ort eines Schemaverstoßes in der Schreibweise des Werkzeugschemas.
 *
 * Die Schreibweise steht in `errors/path-label.ts` und gilt für jede Meldung dieses Servers:
 * `items (Position 2).item_amount` und niemals `items[2]`. Eine Klammer, die ab 1 zählt, sagt
 * einem Sprachmodell das dritte Element, wenn sie das zweite meint.
 */
function issueLocation(path: readonly (string | number | symbol)[]): string {
  return path.length === 0 ? "der Aufruf" : pathLabel(path);
}

/**
 * Der tatsächlich übergebene Wert an der Stelle, die ein Befund nennt.
 *
 * Zod 4 führt den Wert im fertigen Issue **nicht** mehr; `issue.input` ist zur Laufzeit
 * `undefined`, und eine Meldung daraus behauptete an jedem Typfehler, das Feld fehle. Der
 * Wert wird deshalb über `issue.path` aus den Rohargumenten nachgeschlagen — dort steht er
 * unverändert, weil Guard 3 vor jeder Umformung läuft.
 */
function valueAtPath(root: unknown, path: readonly (string | number | symbol)[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      current = (current as Record<string, unknown>)[String(segment)];
    }
  }
  return current;
}

/** Die längste Wiedergabe eines übergebenen Wertes in einer Fehlermeldung. */
const VALUE_EXCERPT_LENGTH = 40;

/**
 * Der übergebene Wert als deutscher Halbsatz.
 *
 * Der Unterschied zwischen „das Feld fehlt" und „das Feld hat den falschen Typ" ist der
 * ganze Zweck: Der Agent liest aus dem einen, er müsse etwas nachtragen, aus dem anderen, er
 * müsse etwas umformen. Beides mit demselben Satz zu beantworten hat im Evaluationslauf
 * genau diesen Irrweg erzeugt (Befund V2/E-3).
 */
function describeGivenValue(value: unknown): string {
  if (value === undefined) return "das Feld fehlt";
  if (value === null) return "übergeben wurde null";
  if (Array.isArray(value))
    return `übergeben wurde eine Liste mit ${String(value.length)} Einträgen`;
  if (typeof value === "object") return "übergeben wurde ein Objekt";
  if (typeof value === "string") {
    const sanitized = sanitizeText(value);
    const excerpt =
      sanitized.length > VALUE_EXCERPT_LENGTH
        ? `${sanitized.slice(0, VALUE_EXCERPT_LENGTH)}…`
        : sanitized;
    return `übergeben wurde die Zeichenkette "${excerpt}"`;
  }
  if (typeof value === "number") return `übergeben wurde die Zahl ${String(value)}`;
  if (typeof value === "boolean") return `übergeben wurde der Wahrheitswert ${String(value)}`;
  // bigint, symbol und function kommen aus JSON-RPC nicht an; der Zweig ist reine Vorsorge.
  return `übergeben wurde ein Wert vom Typ ${typeof value}`;
}

/** Die längste Aufzählung erlaubter Werte in einer Fehlermeldung. */
const ALLOWED_VALUES_LIMIT = 8;

/**
 * Ein erlaubter Wert in der Schreibweise der Werkzeugbeschreibungen.
 *
 * Zeichenketten stehen in einfachen Anführungszeichen wie überall sonst, wo dieser Server
 * einen API-Wert wörtlich zitiert (`schema/vocab.ts`, Sprachregel aus Plan 4.9). Geschwärzt
 * wird hier nichts: Die Werte stammen aus dem Enum des eigenen Schemas und nie vom Aufrufer.
 */
function renderAllowedValue(value: unknown): string {
  return typeof value === "string" ? `'${value}'` : String(value);
}

/**
 * Die erlaubten Werte eines Enums als deutsche Aufzählung.
 *
 * Lange Vorräte werden gekürzt: Die Währungsliste hat 48 Einträge, und eine Fehlermeldung, die
 * sie vollständig ausschreibt, verdrängt die Aussage, um die es geht. Der vollständige Vorrat
 * steht ohnehin im angekündigten JSON Schema des Werkzeugs.
 */
function listAllowedValues(values: readonly unknown[]): string {
  if (values.length === 0) {
    // Ein Enum ohne Werte kann dieses Register nicht bauen; der Zweig ist reine Vorsorge.
    return "kein Wert";
  }
  const shown = values.slice(0, ALLOWED_VALUES_LIMIT).map(renderAllowedValue);
  if (values.length > ALLOWED_VALUES_LIMIT) {
    return (
      `${shown.join(", ")} und ${String(values.length - ALLOWED_VALUES_LIMIT)} weitere ` +
      "(der vollständige Vorrat steht im Eingabeschema dieses Werkzeugs)"
    );
  }
  const last = shown[shown.length - 1] ?? "";
  return shown.length === 1 ? last : `${shown.slice(0, -1).join(", ")} und ${last}`;
}

/**
 * Die erlaubten Formen einer Vereinigung, aus den Befunden ihrer Zweige gelesen.
 *
 * Zod meldet zu `invalid_union` keinen erwarteten Typ, sondern die Befunde **jedes** Zweiges.
 * Der erste Befund eines Zweiges sagt, woran dieser Zweig gescheitert ist, und damit, was er
 * erwartet hätte.
 *
 * @returns `undefined`, wenn sich aus den Zweigen nichts Nennbares ergibt.
 */
function describeUnionForms(errors: readonly (readonly z.core.$ZodIssue[])[]): string | undefined {
  const forms: string[] = [];
  for (const branch of errors) {
    const first = branch[0];
    if (first === undefined) {
      continue;
    }
    const form =
      first.code === "invalid_type"
        ? `ein Wert vom Typ ${first.expected}`
        : first.code === "invalid_value"
          ? `einer der Werte ${listAllowedValues(first.values)}`
          : undefined;
    if (form !== undefined && !forms.includes(form)) {
      forms.push(form);
    }
  }
  return forms.length === 0 ? undefined : forms.join(" oder ");
}

/**
 * Ein Zod-Befund als deutscher Satz.
 *
 * Die Bausteine der Schemaschicht tragen ihre Meldungen selbst und auf Deutsch (AP05); für die
 * Befunde, die Zod ohne eigenen Text erzeugt, steht der Text hier. Eine englische
 * Bibliotheksmeldung inmitten von 54 deutschen Beschreibungen wäre der größere Bruch
 * (Plan 4.9, E4).
 *
 * Vier Codes werden deshalb selbst formuliert. `invalid_value` ist der Code, den Zod 4 an
 * jedem Enum erzeugt — 54 Enum-Felder in 31 der 54 Werkzeuge, darunter `list_direction`,
 * `invoice_type`, `show_prices_type` und `order`; ohne diesen Zweig fiele die Meldung dort auf
 * „Invalid option: expected one of …" zurück, und zwar **auch** dann, wenn das Pflichtfeld
 * schlicht fehlt. Genau diese Unterscheidung zwischen „nachtragen" und „umformen" ist der
 * Zweck der Meldung (Befund V2/E-3).
 */
function describeIssue(issue: z.core.$ZodIssue, rawArgs: unknown): string {
  const where = issueLocation(issue.path);
  switch (issue.code) {
    case "invalid_type":
      return `${where}: erwartet wird ${issue.expected}, ${describeGivenValue(valueAtPath(rawArgs, issue.path))}.`;
    case "invalid_value": {
      const given = describeGivenValue(valueAtPath(rawArgs, issue.path));
      const verb = issue.values.length === 1 ? "erlaubt ist nur" : "erlaubt sind";
      return `${where}: ${verb} ${listAllowedValues(issue.values)}, ${given}.`;
    }
    case "invalid_union": {
      const given = describeGivenValue(valueAtPath(rawArgs, issue.path));
      const forms = describeUnionForms(issue.errors);
      return forms === undefined
        ? `${where}: der Wert passt zu keiner der erlaubten Formen, ${given}.`
        : `${where}: erwartet wird ${forms}, ${given}.`;
    }
    case "unrecognized_keys":
      return (
        `${where}: unbekannte Felder ${issue.keys.join(", ")}. Das Schema ist streng ` +
        "(additionalProperties: false), weil die API unbekannte Body-Felder kommentarlos " +
        "ignoriert und ein Tippfehler im Feldnamen sonst ein stiller Datenfehler wäre."
      );
    default:
      return `${where}: ${issue.message}`;
  }
}

/**
 * Die Satzzeichen, die einen Einzelbefund als abgeschlossen ausweisen.
 *
 * Fehlt eines davon, setzt {@link joinIssues} einen Punkt. Der Doppelpunkt und das Semikolon
 * stehen mit in der Liste, weil ein Befundtext mit einem von beiden eine angehängte Aufzählung
 * ankündigt („darf nicht leer sein; das Feld stattdessen weglassen"); ein Punkt dahinter wäre
 * ein zweites Satzzeichen an derselben Stelle.
 */
const ISSUE_END_MARKS: readonly string[] = [".", "!", "?", ":", ";", "…"];

/**
 * Das Trennzeichen zwischen zwei Einzelbefunden im Block `[Warum]`.
 *
 * Es ist bewusst ein Zeichen, das in keinem der deutschen Befundtexte vorkommt. Ein Leerzeichen
 * allein trägt nicht: Bei kurzen Texten ohne Satzzeichen — `muss mindestens 1 sein` — läuft der
 * nächste Befund unsichtbar in den vorigen hinein.
 */
const ISSUE_SEPARATOR = " | ";

/**
 * Mehrere Befunde als ein Block `[Warum]`, jeder Befund für sich abgegrenzt.
 *
 * Ein Aufruf verletzt das Schema regelmäßig an mehreren Feldern zugleich, und der Block
 * `[Warum]` ist der Kanal, über den ein Agent erkennt, welches Feld er **nachzutragen** und
 * welches er **umzuformen** hat. Verschmolzene Befunde machen genau diese Unterscheidung
 * unlesbar: `limit: muss mindestens 1 sein offset: muss 0 oder größer sein` liest sich als ein
 * Satz über ein Feld.
 *
 * Normalisiert wird deshalb **hier**, an der Fügestelle, und nicht in den Einzeltexten: Die
 * Meldungen der Schemabausteine (`schema/primitives.ts`) enden ohne Satzzeichen, weil Zod sie
 * auch einzeln ausgibt, und der `default`-Zweig von {@link describeIssue} reicht sie unverändert
 * durch. Jeder Teil bekommt sein Satzende, und zwischen zwei Teilen steht zusätzlich
 * {@link ISSUE_SEPARATOR}.
 */
function joinIssues(issues: readonly z.core.$ZodIssue[], rawArgs: unknown): string {
  const parts: string[] = [];
  for (const issue of issues) {
    const text = describeIssue(issue, rawArgs).trim();
    if (text === "") {
      // Ein leerer Befundtext entsteht aus keinem Zweig von describeIssue; der Zweig ist
      // Vorsorge dagegen, dass ein leerer Teil ein Trennzeichen ohne Inhalt erzeugt.
      continue;
    }
    parts.push(ISSUE_END_MARKS.some((mark) => text.endsWith(mark)) ? text : `${text}.`);
  }
  return parts.join(ISSUE_SEPARATOR);
}

function schemaRefusal(
  entry: ToolEntry,
  issues: readonly z.core.$ZodIssue[],
  was: string,
  rawArgs: unknown,
): string {
  return renderRejectedBeforeRequest({
    toolName: entry.name,
    was,
    warum: joinIssues(issues, rawArgs),
    wie:
      `Die genannten Felder korrigieren und ${entry.name} erneut aufrufen. Die Feldliste und ` +
      "die erlaubten Werte stehen in der Beschreibung dieses Werkzeugs.",
  }).text;
}

// ---------------------------------------------------------------------------------------
// Der Weg zur API. Eine Stelle, benutzt vom Handler und von Guard 6.
// ---------------------------------------------------------------------------------------

interface SentRequest {
  readonly request: MappedRequest;
  readonly result: HttpCallResult;
}

async function sendRequest(
  entry: ToolEntry,
  args: Readonly<ToolArguments>,
  config: ResolvedConfig,
  signal: AbortSignal,
): Promise<SentRequest> {
  const request = mapRequest(entry, args);
  const result = await callEndpoint(
    {
      toolName: entry.name,
      toolClass: entry.toolClass,
      specPath: request.specPath,
      requestPath: request.requestPath,
      shape: entry.shape,
      bucket: entry.bucket,
      timeoutTier: entry.timeoutTier,
      body: request.body,
    },
    { signal, config },
  );
  return { request, result };
}

// ---------------------------------------------------------------------------------------
// Der Stammdatenspeicher (Plan 7.8, 1.4 Zwischenschritt).
// ---------------------------------------------------------------------------------------

interface CacheAnswer {
  readonly envelope: SuccessEnvelope;
  readonly ageMs: number;
}

/**
 * Befragt den Speicher. Ein Treffer beendet den Aufruf ohne Request und ohne Token.
 *
 * Bei `BB_MCP_CACHE_TTL_MS=0`, also im Auslieferungszustand, endet die Funktion in der ersten
 * Zeile: `isEnabled()` ist dann `false`, und es gibt keinen zweiten Zweig, der danach doch noch
 * etwas läse.
 *
 * Ein abgelegter Stand wird nur dann zur Antwort, wenn er zur erwarteten Umschlagform des
 * Eintrags passt. Alle vier speicherfähigen Werkzeuge sind Listenabfragen (Plan 7.8); ein
 * Stand anderer Form wäre ein Fehler im Befüllen, und daraus eine Antwort zu bauen hieße,
 * einen falschen Datenbestand als echten auszugeben.
 */
function readCache(runtime: ToolRuntime): CacheAnswer | undefined {
  const { entry, store } = runtime;
  if (!store.isEnabled() || !store.isCacheable(entry.name)) {
    return undefined;
  }
  const hit = store.read(entry.name);
  if (hit === undefined) {
    return undefined;
  }
  if (entry.shape !== "list" || !Array.isArray(hit.payload)) {
    logDebug(
      `Stammdatenspeicher: Der Stand von ${entry.name} passt nicht zur Umschlagform ` +
        `${entry.shape} und wird nicht verwendet.`,
    );
    return undefined;
  }
  return {
    ageMs: hit.ageMs,
    envelope: {
      shape: "list",
      status: 200,
      message: null,
      body: {},
      warnings: [],
      rows: hit.payload.length,
      data: hit.payload,
    },
  };
}

/**
 * Füllt und verwirft den Speicher nach einer erfolgreichen Antwort (Plan 7.8 Punkt 3).
 *
 * Die Invalidierungstabelle steht im Register (`invalidatesCache`) und nicht hier, damit sie
 * beim Nachrüsten eines Endpunkts an derselben Stelle liegt wie alles andere. Die nicht
 * offensichtliche Zeile ist `bb_postingaccounts_search`: `/settings/get/postingaccounts`
 * liefert Sachkonten **einschließlich** Debitoren und Kreditoren, weshalb jedes Debitoren- und
 * Kreditorenwerkzeug diesen Stand verwirft.
 */
function updateCache(runtime: ToolRuntime, envelope: SuccessEnvelope): void {
  const { entry, store } = runtime;
  if (!store.isEnabled()) {
    return;
  }
  if (store.isCacheable(entry.name) && envelope.shape === "list") {
    store.write(entry.name, envelope.data);
  }
  if (entry.invalidatesCache.length > 0) {
    store.invalidate(entry.invalidatesCache);
  }
}

/**
 * Die rein serverseitigen Felder eines Aufrufs, also die aus `serverOnlyFields` (Plan 4.3).
 *
 * Auf dem gewöhnlichen Weg liefert sie der Request-Mapper; bei einem Treffer im
 * Stammdatenspeicher gibt es keinen Request und damit keinen Mapper, und dann werden sie hier
 * unmittelbar aus den geprüften Argumenten gelesen.
 */
function serverOnlyFrom(entry: ToolEntry, args: Readonly<ToolArguments>): ToolArguments {
  const out: ToolArguments = {};
  for (const name of entry.serverOnlyFields) {
    const value = args[name];
    if (value !== undefined) {
      out[name] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Der eine generische Handler.
// ---------------------------------------------------------------------------------------

/**
 * Der Weg eines Aufrufs nach Plan 1.4, Schritt 2 bis 14.
 *
 * Schritt 1 — das Nachschlagen des Eintrags — erledigt das SDK: Ein unbekannter Werkzeugname
 * ist der einzige Fall, in dem ein JSON-RPC-Protokollfehler entsteht. Alles, was von hier an
 * schiefgeht, ist `isError: true` im Ergebnis (Plan 5.8).
 */
async function runTool(
  runtime: ToolRuntime,
  rawArgs: ToolArguments,
  signal: AbortSignal,
): Promise<CallToolResult> {
  const startedAt = runtime.now();
  try {
    return await runGuardedCall(runtime, rawArgs, signal, startedAt);
  } catch (error) {
    // Der äußere Fangarm. Er ist kein Ersatz für die Behandlung weiter unten, sondern die
    // Zusage, dass aus diesem Handler **niemals** eine Ausnahme entkommt: Das SDK machte
    // daraus eine englische Meldung ohne Zustandssatz, und die Audit-Zeile fehlte.
    return unexpectedFailure(runtime, rawArgs, startedAt, error, false);
  }
}

async function runGuardedCall(
  runtime: ToolRuntime,
  rawArgs: ToolArguments,
  signal: AbortSignal,
  startedAt: number,
): Promise<CallToolResult> {
  const { entry, config } = runtime;

  // --- Guard 1: Konfiguration (Plan 6.5) ---------------------------------------------
  const notConfigured = checkConfigured(entry.name, config);
  if (notConfigured !== undefined) {
    return refuse(runtime, rawArgs, startedAt, "konfiguration", notConfigured);
  }

  // --- Guard 2: Nur-Lesen-Schalter (Plan 6.6) ----------------------------------------
  const readOnlyRefusal = checkReadOnly(entry, config);
  if (readOnlyRefusal !== undefined) {
    return refuse(runtime, rawArgs, startedAt, "nur-lesen", readOnlyRefusal);
  }

  // --- Guard 3: Schema, streng (Plan 1.4 Schritt 4) ----------------------------------
  const parsed = runtime.baseSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return refuse(
      runtime,
      rawArgs,
      startedAt,
      "schema",
      schemaRefusal(
        entry,
        parsed.error.issues,
        "Die Argumente entsprechen nicht dem Eingabeschema dieses Werkzeugs.",
        rawArgs,
      ),
    );
  }
  let args = parsed.data as ToolArguments;

  // --- Guard 4: Querprüfungen Q1 bis Q8 (Plan 4.7) -----------------------------------
  // Geprüft wird mit demselben Schema plus den Querprüfungen des Eintrags. Dass die
  // Feldprüfungen dabei ein zweites Mal laufen, ist der Preis dafür, dass Guard 3 und Guard 4
  // getrennt melden; er besteht aus einem Parse über ein kleines Objekt. Trägt der Eintrag
  // keine Querprüfung, entfällt der Schritt vollständig.
  if (entry.crossChecks.length > 0) {
    const crossChecked = runtime.fullSchema.safeParse(rawArgs);
    if (!crossChecked.success) {
      return refuse(
        runtime,
        rawArgs,
        startedAt,
        "querprüfung",
        schemaRefusal(
          entry,
          crossChecked.error.issues,
          "Eine Querprüfung dieses Endpunkts ist nicht erfüllt.",
          rawArgs,
        ),
      );
    }
    args = crossChecked.data as ToolArguments;
  }

  // --- Guard 5: Betrags- und Stapelgrenze (Plan 6.2) ---------------------------------
  const limitRefusal = checkLimits(entry, args, config);
  if (limitRefusal !== undefined) {
    return refuse(runtime, rawArgs, startedAt, "grenze", limitRefusal);
  }

  // --- Guard 6: Duplikatshinweis (Plan 1.4 Schritt 7) --------------------------------
  // Er blockiert nie. Bei `BB_MCP_DUPLICATE_CHECK=off`, also im Auslieferungszustand, geht
  // hier kein Zusatzaufruf hinaus.
  const duplicateHint = await checkDuplicates({
    entry,
    args,
    config,
    resolveEntry: runtime.resolveEntry,
    lookup: async (readEntry, lookupArgs) => {
      const { result } = await sendRequest(readEntry, lookupArgs, config, signal);
      return result.envelope.shape === "list" ? result.envelope.data : [];
    },
  });

  // --- Stammdatenspeicher: befragen (Plan 7.8 Punkt 1) -------------------------------
  const cached = readCache(runtime);
  if (cached !== undefined) {
    const mapped = mapResponse(entry, cached.envelope, {
      // Die rein serverseitigen Felder — im Auslieferungszustand genau `response_format` —
      // werden auch auf diesem Weg gelesen. Sonst käme eine aus dem Speicher beantwortete
      // Abfrage immer in der Kurzform zurück, und `response_format: "detailed"` wäre
      // stillschweigend wirkungslos (Plan 7.4).
      serverOnly: serverOnlyFrom(entry, args),
      store: runtime.store,
    });
    const payload = buildToolResponse({
      entry,
      mapped,
      args,
      cacheHit: { ageMs: cached.ageMs },
      maxResponseTokens: config.maxResponseTokens,
      ...(duplicateHint === undefined ? {} : { duplicateHint }),
    });
    audit(runtime, rawArgs, startedAt, "ok:speicher");
    return { content: [...payload.content], structuredContent: payload.structuredContent };
  }

  // --- Belegquelle auflösen (Plan 11.2 AP13) -----------------------------------------
  // Nur `/receipts/upload` tut hier etwas; jedes andere Werkzeug bekommt seine Argumente
  // unverändert zurück. Der Schritt liegt bewusst vor dem Request: Schlägt er fehl, ging
  // nichts hinaus, und die Meldung sagt genau das.
  try {
    args = await resolveUploadArguments(entry, args, { signal });
  } catch (error) {
    if (isUploadSourceError(error)) {
      return refuse(
        runtime,
        rawArgs,
        startedAt,
        "belegquelle",
        renderRejectedBeforeRequest({
          toolName: entry.name,
          was: "Die Belegdatei konnte nicht beschafft werden.",
          warum: error.message,
          wie:
            "Das Feld file auf eine der erlaubten Formen bringen und " +
            `${entry.name} erneut aufrufen.`,
        }).text,
      );
    }
    return await handleCallFailure(runtime, rawArgs, args, startedAt, error);
  }

  // --- Schritt 8 bis 13: Abbildung, Request, Antwort ---------------------------------
  let sent: SentRequest;
  try {
    sent = await sendRequest(entry, args, config, signal);
  } catch (error) {
    return await handleCallFailure(runtime, rawArgs, args, startedAt, error);
  }

  try {
    const mapped = mapResponse(entry, sent.result.envelope, {
      serverOnly: sent.request.serverOnly,
      store: runtime.store,
    });
    // Gefüllt und verworfen wird erst nach einer erfolgreichen Antwort (Plan 7.8 Punkt 3).
    updateCache(runtime, sent.result.envelope);
    const payload = buildToolResponse({
      entry,
      mapped,
      args,
      maxResponseTokens: config.maxResponseTokens,
      ...(duplicateHint === undefined ? {} : { duplicateHint }),
    });
    audit(runtime, rawArgs, startedAt, "ok");
    return { content: [...payload.content], structuredContent: payload.structuredContent };
  } catch (error) {
    // Die Antwort liegt vor, das Aufbereiten ist gescheitert. Der Aufruf hat gewirkt, und das
    // darf der Agent nicht als „nichts passiert" lesen.
    return unexpectedFailure(runtime, rawArgs, startedAt, error, true);
  }
}

/** Ein gescheiterter Aufruf: Fehlerschicht befragen, Speicher bei offenem Ausgang verwerfen. */
async function handleCallFailure(
  runtime: ToolRuntime,
  rawArgs: ToolArguments,
  args: ToolArguments,
  startedAt: number,
  error: unknown,
): Promise<CallToolResult> {
  const { entry } = runtime;

  if (isTransportError(error)) {
    const message = await renderTransportFailure(error, {
      args,
      ...(entry.verifyWith === undefined ? {} : { verifyWith: entry.verifyWith }),
    });
    if (message.uncertainWrite && runtime.store.isEnabled() && entry.invalidatesCache.length > 0) {
      // Bei ungewissem Ausgang wird ebenfalls verworfen: Lieber einmal zu viel frisch geholt
      // als ein Stand, der eine womöglich erfolgte Änderung nicht kennt (Plan 7.8 Punkt 3).
      runtime.store.invalidate(entry.invalidatesCache);
    }
    audit(runtime, rawArgs, startedAt, `fehler:${error.code}`);
    return textResult(message.text, true);
  }

  // Der Request-Mapper (Plan 1.4 Schritt 8). Seine Fehler entstehen **vor** dem ersten Byte,
  // tragen also wie jede Ablehnung eines Guards den Zustandssatz 1 aus 5.8.
  if (error instanceof Error) {
    return refuse(
      runtime,
      rawArgs,
      startedAt,
      "abbildung",
      renderRejectedBeforeRequest({
        toolName: entry.name,
        was: "Die Argumente ließen sich nicht in einen Aufruf an BuchhaltungsButler übersetzen.",
        warum: error.message,
        wie: `Die genannte Stelle korrigieren und ${entry.name} erneut aufrufen.`,
      }).text,
    );
  }

  return unexpectedFailure(runtime, rawArgs, startedAt, error, false);
}

/**
 * Der Rückfall für alles, was hier nicht vorgesehen ist.
 *
 * Zwei Dinge sind dabei Pflicht: Das Ergebnis ist `isError: true` und niemals ein
 * Protokollfehler, und die Diagnose geht nach stderr — stdout trägt ausschließlich JSON-RPC
 * (Plan 1.5, 5.8).
 *
 * @param afterRequest `true`, wenn der Request schon hinausgegangen war. Dann darf der Text
 *        nicht behaupten, es sei nichts geschehen.
 */
function unexpectedFailure(
  runtime: ToolRuntime,
  rawArgs: ToolArguments,
  startedAt: number,
  error: unknown,
  afterRequest: boolean,
): CallToolResult {
  const detail = error instanceof Error ? error.message : String(error);
  logError(
    `${runtime.entry.name} ${runtime.specPath}: unerwarteter Fehler im Handler: ${detail}` +
      (error instanceof Error && error.stack !== undefined ? `\n${error.stack}` : ""),
  );
  audit(runtime, rawArgs, startedAt, "fehler:unerwartet");

  const text = renderRejectedBeforeRequest({
    toolName: runtime.entry.name,
    was: "Dieser Server ist in einen unerwarteten Zustand gelaufen.",
    warum: detail,
    wie:
      "Den Aufruf nicht unverändert wiederholen. Der Vorgang ist ein Fehler dieses Servers; " +
      "die Einzelheiten stehen im Protokoll des Serverprozesses (stderr).",
  }).text;

  if (!afterRequest) {
    return textResult(text, true);
  }
  // Der Zustandssatz 1 wäre hier eine Unwahrheit: Der Aufruf ist hinausgegangen. Ersetzt wird
  // ausschließlich diese Zeile, der übrige Aufbau bleibt der aus 5.8.
  return textResult(
    text.replace(
      /^\[Zustand\].*$/m,
      "[Zustand] Der Aufruf ist an BuchhaltungsButler hinausgegangen und hat dort gewirkt; " +
        "gescheitert ist erst das Aufbereiten der Antwort in diesem Server.",
    ),
    true,
  );
}

// ---------------------------------------------------------------------------------------
// Registrierung.
// ---------------------------------------------------------------------------------------

/**
 * Registriert jeden Eintrag als Werkzeug und hängt den einen Handler daran.
 *
 * Die Registrierung hängt an **keiner** Bedingung: Auch ein durch `BB_MCP_READ_ONLY`
 * gesperrtes und auch ein bei fehlender Konfiguration nicht ausführbares Werkzeug steht in
 * `tools/list`. Die Liste ist über die gesamte Verbindung stabil und hängt von keinem Schalter
 * ab (Plan 1.5, 6.5 Punkt 1, 6.6).
 *
 * @returns Eine Zeile je registriertem Werkzeug, in Registrierreihenfolge.
 */
export function registerTools(
  server: McpServer,
  options: RegisterToolsOptions = {},
): readonly RegisteredToolInfo[] {
  const entries = options.entries ?? TOOL_ENTRIES;
  const config = options.config ?? getConfig();
  const store = options.store ?? getMasterDataStore();
  const now = options.now ?? (() => performance.now());

  const byName = new Map(entries.map((entry): [string, ToolEntry] => [entry.name, entry]));
  const resolveEntry = (name: string): ToolEntry | undefined => byName.get(name);

  const registered: RegisteredToolInfo[] = [];

  for (const entry of entries) {
    // `maxItems` wird ausdrücklich übergeben und nicht aus der prozessweiten Konfiguration
    // geholt: Dieser Aufruf kennt seine Konfiguration schon, und ein Schema, das sich die
    // Grenze woanders besorgt, wäre gegenüber der hier gültigen blind.
    const schemaOptions = { maxItems: config.maxBatch };
    const fullSchema = buildZodSchema(entry, schemaOptions);
    // Dasselbe Schema ohne Querprüfungen, für Guard 3. Der Eintrag wird dafür nicht verändert,
    // sondern eine Kopie mit leerer Prüfliste gebaut; der Bau läuft durch dieselbe Funktion,
    // damit es keinen zweiten Weg von einem Eintrag zu einem Schema gibt.
    const baseSchema = buildZodSchema({ ...entry, crossChecks: [] }, schemaOptions);
    const runtime: ToolRuntime = {
      entry,
      baseSchema,
      fullSchema,
      specPath: specPathOf(entry),
      config,
      store,
      resolveEntry,
      now,
    };

    server.registerTool(
      entry.name,
      {
        title: entry.title,
        description: entry.description,
        inputSchema: advertise(toJsonSchema(fullSchema)),
        outputSchema: advertise(buildOutputSchema(entry)),
        annotations: { ...TOOL_CLASSES[entry.toolClass].annotations },
      },
      (args, ctx) => runTool(runtime, args, ctx.mcpReq.signal),
    );

    registered.push({
      name: entry.name,
      specPath: runtime.specPath,
      toolClass: entry.toolClass,
      blockedByReadOnly: checkReadOnly(entry, config) !== undefined,
    });
  }

  return registered;
}
