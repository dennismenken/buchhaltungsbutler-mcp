// `structuredContent` und Textblock aus **derselben** Datenstruktur (Plan 7.1).
//
// Beides ist nicht redundant: Der Textblock ist das, was ein Client ohne Unterstützung für
// `structuredContent` anzeigt, und das, was der Nutzer im Freigabedialog und im Verlauf liest.
// Beide entstehen deshalb hier, aus einem Ergebnis von `mapping/response.ts`, und können nicht
// auseinanderlaufen.
//
// Die Reihenfolge im Textblock ist fest, weil ein Agent den Anfang sicher liest und das Ende
// vielleicht: erst die Warnung, dann die Herkunft, dann die Daten, dann der Bestand, dann der
// Anschluss. Eine Vertragsverletzung steht deshalb **vor** den Zahlen, die sie betrifft.

import { getConfig } from "../config/resolve.js";
import { centsOf } from "../mapping/coerce.js";
import {
  contractWarningLine,
  warningsForStructuredContent,
  CONTRACT_WARNINGS_KEY,
} from "../mapping/contract-violation.js";
import { formatCents, sumCents } from "../mapping/decimal.js";
import type { MappedResponse } from "../mapping/response.js";
import { CHARS_PER_TOKEN } from "../registry/budget.js";
import type { ToolEntry } from "../registry/types.js";
import { LIST_CONTAINER, OBJECT_CONTAINER, writeRecordKey } from "./output-schema.js";
import {
  cancelledFixedPostingNote,
  fullPostingAccountPageNote,
  reportRequestedNote,
  reversalFor,
  reversalText,
} from "./next-step.js";
import { filterHintFromFields, noPaginationNote, paginationNote } from "./pagination-note.js";
import {
  DEFAULT_RECORD_CELL_LENGTH,
  renderRecord,
  renderRecordInline,
  renderTable,
} from "./table.js";
import {
  binaryTextLine,
  estimateTokens,
  fitRows,
  replaceBinaryPayloads,
  stripBinariesForText,
  truncationNote,
  type ReplacedBinary,
} from "./truncate.js";

/** Das Ergebnis eines Werkzeugaufrufs, so wie der Handler es zurückgibt. */
export interface ToolResponsePayload {
  readonly structuredContent: Record<string, unknown>;
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

export interface BuildResponseInput {
  readonly entry: ToolEntry;
  readonly mapped: MappedResponse;
  /** Die geprüften Werkzeugargumente. Sie liefern `limit`, `offset` und die Auflösung (7.6). */
  readonly args?: Readonly<Record<string, unknown>>;
  /** Gesetzt, wenn die Antwort aus dem Stammdatenspeicher kam (Plan 7.8 Punkt 2). */
  readonly cacheHit?: { readonly ageMs: number };
  /** Der Hinweis der Duplikatsabfrage, falls sie eingeschaltet war und traf (Plan 6.2, 7.6). */
  readonly duplicateHint?: string;
  /** Abweichende weiche Grenze. Im Betrieb `BB_MCP_MAX_RESPONSE_TOKENS`. */
  readonly maxResponseTokens?: number;
}

const REPORT_TOOL_PAIRS: Readonly<Record<string, string>> = Object.freeze({
  bb_reports_create_bwa: "bb_reports_get_bwa",
  bb_reports_create_sums: "bb_reports_get_sums",
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberArg(
  args: Readonly<Record<string, unknown>> | undefined,
  name: string,
): number | null {
  const value = args?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `true`, wenn der Aufrufer die Datei ausdrücklich angefordert hat (`get_file`, `get_files`). */
function fileRequested(args: Readonly<Record<string, unknown>> | undefined): boolean {
  return args?.get_file === true || args?.get_files === true;
}

/**
 * Der Hinweis auf einen Treffer im Stammdatenspeicher, wörtlich nach Plan 7.8 Punkt 2.
 *
 * Er steht im Textblock **und** in `structuredContent`: Ein stillschweigend aus dem Speicher
 * beantworteter Aufruf wäre genau die verborgene Logik, die E1 ausschließt.
 */
export function cacheHitNote(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  return (
    `Aus dem Stammdatenspeicher dieses Serverprozesses, abgelegt vor ${String(seconds)} ` +
    "Sekunden. Frisch holen: Serverprozess neu starten oder BB_MCP_CACHE_TTL_MS=0 setzen."
  );
}

/**
 * Der aufgelöste Datensatz einer Schreibantwort (Plan 7.6).
 *
 * **Es geht dafür kein zusätzlicher Request hinaus.** Die Auflösung speist sich aus genau zwei
 * Quellen: den Argumenten des Aufrufs, die der Server ohnehin hat, und den Feldern, die die
 * API in ihrer Schreibantwort mitliefert. Wo die API den angelegten Datensatz nicht
 * zurückgibt, nennt die Antwort die Werte aus den Argumenten und sagt ausdrücklich, welche
 * Felder nicht zurückgemeldet wurden.
 */
export function resolveWriteRecord(input: BuildResponseInput): {
  readonly record: Record<string, unknown>;
  readonly fromResponse: readonly string[];
  readonly fieldsNotReturned: readonly string[];
} {
  const { entry, mapped, args } = input;
  const fromApi = mapped.object ?? (isPlainObject(mapped.ackData) ? mapped.ackData : {});
  const record: Record<string, unknown> = { ...fromApi };
  const fromResponse = Object.keys(fromApi);

  for (const field of entry.fields) {
    if (field.source === "server") {
      continue;
    }
    const value = args?.[field.name];
    if (value === undefined || field.name in record) {
      continue;
    }
    if (Array.isArray(value)) {
      // Eine Positions- oder Stapelliste wird nicht ausgeschrieben: Sie stünde ein zweites
      // Mal in der Antwort. Gezeigt werden ihre Menge und, wo es Beträge gibt, deren Summe
      // in Ganzzahl-Cent — also genau das, was der Aufrufer nachrechnen will.
      record[field.name] = describeList(field.name, value);
      continue;
    }
    record[field.name] = value;
  }

  const fieldsNotReturned = Object.keys(entry.responseContract.fields).filter(
    (field) => !(field in fromApi),
  );

  return { record, fromResponse, fieldsNotReturned };
}

/** Menge und Betragssumme einer Positions- oder Stapelliste, ohne sie auszuschreiben. */
function describeList(name: string, list: readonly unknown[]): string {
  const cents: number[] = [];
  for (const item of list) {
    if (!isPlainObject(item)) {
      continue;
    }
    const value = centsOf(item, "amount");
    if (value !== null) {
      cents.push(value);
    }
  }
  const count = `${String(list.length)} Eintr${list.length === 1 ? "ag" : "äge"}`;
  if (cents.length !== list.length || cents.length === 0) {
    return `${count} (${name})`;
  }
  return `${count} (${name}), Summe ${formatCents(sumCents(cents))}`;
}

/**
 * Setzt Antwort und Textblock zusammen.
 *
 * Der Aufruf selbst setzt **keinen** weiteren Request ab und liest keine Datenquelle: Alles,
 * was hier steht, stammt aus der bereits vorliegenden Antwort, aus den Argumenten und aus dem
 * Registereintrag (Plan 7.5 Regel 2, 7.6).
 */
export function buildToolResponse(input: BuildResponseInput): ToolResponsePayload {
  const { entry, mapped, args } = input;
  const maxResponseTokens = input.maxResponseTokens ?? getConfig().maxResponseTokens;
  const requested = fileRequested(args);

  const lines: string[] = [];
  const structured: Record<string, unknown> = {
    endpoint: mapped.endpoint,
    success: true,
  };

  // 1. Die Vertragsverletzung zuerst (Plan 7.3): Sie betrifft die Zahlen, die danach kommen.
  if (mapped.warnings.length > 0) {
    lines.push(contractWarningLine(mapped.warnings, mapped.rowsReturned));
    structured[CONTRACT_WARNINGS_KEY] = warningsForStructuredContent(mapped.warnings);
  }
  for (const warning of mapped.envelopeWarnings) {
    lines.push(`Hinweis zum Umschlag: ${warning.text}`);
  }
  if (mapped.envelopeWarnings.length > 0) {
    structured._envelope_warnings = mapped.envelopeWarnings.map((warning) => ({
      code: warning.code,
      text: warning.text,
    }));
  }

  // 2. Herkunft, falls die Antwort nicht frisch ist.
  if (input.cacheHit !== undefined) {
    const note = cacheHitNote(input.cacheHit.ageMs);
    lines.push(note);
    structured._from_cache = { age_ms: Math.round(input.cacheHit.ageMs), note };
  }
  if (mapped.labelsFromCache) {
    lines.push(
      "Die sprechenden Kontobezeichnungen stammen aus dem Stammdatenspeicher dieses " +
        "Serverprozesses; die Kontonummern selbst kommen unverändert aus dieser Antwort.",
    );
    structured._labels_from_cache = true;
  }

  const binaries: ReplacedBinary[] = [];

  if (entry.shape === "list" && entry.effect === "read") {
    appendList(input, structured, lines, binaries, { maxResponseTokens, requested });
  } else if (entry.effect === "read") {
    appendSingle(input, structured, lines, binaries, { maxResponseTokens, requested });
  } else {
    appendWrite(input, structured, lines, binaries, { requested });
  }

  for (const binary of binaries) {
    lines.push(binaryTextLine(binary));
  }

  if (mapped.unknownFields.length > 0) {
    structured._unknown_fields = [...mapped.unknownFields];
  }
  if (mapped.message !== null && mapped.message !== "") {
    structured.message = mapped.message;
  }

  const text = lines.filter((line) => line !== "").join("\n\n");
  return {
    structuredContent: structured,
    content: [{ type: "text", text }],
  };
}

interface ListOptions {
  readonly maxResponseTokens: number;
  readonly requested: boolean;
}

/** Die Listenform: Tabelle, Bestandszeile, Anschlusshinweis (Plan 7.1, 7.5). */
function appendList(
  input: BuildResponseInput,
  structured: Record<string, unknown>,
  lines: string[],
  binaries: ReplacedBinary[],
  options: ListOptions,
): void {
  const { entry, mapped, args } = input;
  const limitUsed = numberArg(args, "limit");
  const offsetUsed = numberArg(args, "offset") ?? 0;

  const cleaned = mapped.items.map((row) => {
    const result = replaceBinaryPayloads(row, { requested: options.requested });
    binaries.push(...result.replaced);
    return result.value as Record<string, unknown>;
  });

  // Die Kürzung rechnet mit dem, was wirklich hinausgeht: Text **und** strukturierter Teil.
  const reservedChars = lines.join("\n\n").length + 600;
  const fit = fitRows(cleaned, {
    maxTokens: options.maxResponseTokens,
    reservedChars,
    costOf: (row) => (JSON.stringify(row) ?? "").length * 2,
  });
  const shown = cleaned.slice(0, fit.count);

  // Der Textblock bekommt die binärfreie Fassung, auch wenn die Datei angefordert war:
  // Base64 erscheint dort niemals (Plan 7.6).
  const table = renderTable(
    shown.map((row) => stripBinariesForText(row) as Record<string, unknown>),
  );
  if (table !== "") {
    lines.push(table);
  }

  const rowsReturned = mapped.rowsReturned ?? cleaned.length;
  const note =
    limitUsed === null
      ? noPaginationNote(rowsReturned)
      : paginationNote({
          toolName: entry.name,
          rowsReturned,
          limitUsed,
          offsetUsed,
          filterHint: filterHintFromFields(entry.fields.map((field) => field.name)),
        });
  lines.push(note);

  if (fit.truncated) {
    lines.push(truncationNote(shown.length, cleaned.length, fit.budgetTokens, mapped.projection));
  }

  const morePossible = limitUsed !== null && rowsReturned >= limitUsed;
  structured.rows_returned = rowsReturned;
  structured.limit_used = limitUsed;
  structured.offset_used = offsetUsed;
  structured.more_possible = morePossible;
  structured[LIST_CONTAINER] = shown;
  if (fit.truncated) {
    structured._truncated = {
      shown: shown.length,
      returned: cleaned.length,
      budget_tokens: fit.budgetTokens,
    };
  }

  if (entry.name === "bb_postingaccounts_search" && morePossible) {
    lines.push(fullPostingAccountPageNote());
  }
}

/** Die Einzelform: lesbare Aufzählung statt Tabelle mit einer Zeile (Plan 7.1). */
function appendSingle(
  input: BuildResponseInput,
  structured: Record<string, unknown>,
  lines: string[],
  binaries: ReplacedBinary[],
  options: { readonly maxResponseTokens: number; readonly requested: boolean },
): void {
  const { mapped } = input;
  const payload = mapped.object ?? mapped.ackData;
  const result = replaceBinaryPayloads(payload, { requested: options.requested });
  binaries.push(...result.replaced);

  // Die Grenze je Feld folgt dem Tokenbudget dieser Antwort und ist keine feste Zahl: Ein
  // einzelnes Feld darf höchstens ein Viertel des Budgets belegen, mehr nicht, weniger aber
  // auch nicht. Der Rest der Kürzung steht beziffert in der Zelle selbst.
  const maxCellLength = Math.max(
    DEFAULT_RECORD_CELL_LENGTH,
    Math.floor((options.maxResponseTokens * CHARS_PER_TOKEN) / 4),
  );

  const textValue = stripBinariesForText(result.value);
  if (isPlainObject(textValue)) {
    lines.push(renderRecord(textValue, { maxCellLength }));
  } else if (textValue !== null && textValue !== undefined) {
    lines.push(renderRecord({ data: textValue }, { maxCellLength }));
  }
  structured[OBJECT_CONTAINER] = result.value ?? null;
}

/** Die Schreibform: Satz, aufgelöster Datensatz, Weg zurück (Plan 7.1, 7.6). */
function appendWrite(
  input: BuildResponseInput,
  structured: Record<string, unknown>,
  lines: string[],
  binaries: ReplacedBinary[],
  options: { readonly requested: boolean },
): void {
  const { entry, mapped, args } = input;
  const resolved = resolveWriteRecord(input);
  const cleaned = replaceBinaryPayloads(resolved.record, { requested: options.requested });
  binaries.push(...cleaned.replaced);
  const record = isPlainObject(cleaned.value) ? cleaned.value : resolved.record;

  const verb =
    entry.effect === "create"
      ? "angelegt"
      : entry.effect === "modify"
        ? "geändert"
        : entry.effect === "delete"
          ? "entfernt"
          : "ausgeführt";
  // Der Titel eines Werkzeugs ist nach Plan 3.6 eine Infinitivwendung („Beleg als gelöscht
  // markieren“). Als Subjekt eines Satzes, der ein Substantiv braucht, ergibt er falsches
  // Deutsch; er steht deshalb als vorangestellte Benennung und nicht im Satz selbst.
  lines.push(
    `Ausgeführt: ${entry.title}. Der Datensatz wurde in den echten Buchhaltungsdaten des ` +
      `verbundenen Mandanten ${verb}. Benutzter Endpunkt: ${mapped.endpoint}`,
  );
  const inline = renderRecordInline(stripBinariesForText(record) as Record<string, unknown>);
  if (inline !== "") {
    lines.push(inline);
  }

  if (resolved.fieldsNotReturned.length > 0 && Object.keys(record).length > 0) {
    const verify = entry.verifyWith;
    const lookup =
      verify !== undefined && verify.kind === "tool"
        ? ` Nachsehen lässt sich das mit ${verify.tool}.`
        : verify !== undefined
          ? ` ${verify.reason}`
          : "";
    lines.push(
      `Nicht zurückgemeldet wurden: ${resolved.fieldsNotReturned.join(", ")}. Die übrigen ` +
        `Werte oben stammen aus den Argumenten dieses Aufrufs.${lookup}`,
    );
  }

  const reversal = reversalText(entry.name, [record, args ?? {}]);
  if (reversal !== "") {
    lines.push(reversal);
  }

  if (input.duplicateHint !== undefined && input.duplicateHint !== "") {
    lines.push(input.duplicateHint);
    structured.duplicate_hint = { text: input.duplicateHint };
  }

  const getTool = REPORT_TOOL_PAIRS[entry.name];
  if (getTool !== undefined) {
    lines.push(
      reportRequestedNote({
        reportId: asIdentifier(
          record.report_id_by_customer ?? record.id_by_customer,
          "<siehe Antwort>",
        ),
        createTool: entry.name,
        getTool,
      }),
    );
  }

  if (entry.name === "bb_postings_cancel" && wasFixed(mapped)) {
    lines.push(
      cancelledFixedPostingNote(
        asIdentifier(record.posting_id_by_customer ?? record.id_by_customer, "<unbekannt>"),
      ),
    );
  }

  structured[writeRecordKey(entry.effect)] = record;
  structured.reversal = reversalDescription(entry.name);
  if (resolved.fieldsNotReturned.length > 0) {
    structured.fields_not_returned = [...resolved.fieldsNotReturned];
  }
}

/**
 * Eine Kennung als Text. Alles, was weder Zeichenkette noch endliche Zahl ist, wird zum
 * genannten Ersatztext: Eine Kennung, die in Wahrheit ein Objekt ist, wird nicht als
 * `[object Object]` in eine Handlungsanweisung geschrieben.
 */
function asIdentifier(value: unknown, fallback: string): string {
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

/**
 * `true`, wenn die Antwort erkennen lässt, dass eine festgeschriebene Buchung storniert wurde.
 *
 * Gelesen wird ausschließlich, was die API selbst meldet — ein Feld `fixed` oder ein
 * entsprechender Hinweis in `message`. Geraten wird nichts: Ohne Beleg erscheint der Hinweis
 * nicht, statt ihn auf Verdacht zu behaupten.
 */
function wasFixed(mapped: MappedResponse): boolean {
  const record = mapped.object;
  if (record !== null && (record.fixed === true || record.fixed === "1")) {
    return true;
  }
  return mapped.message !== null && /storno|cancel/i.test(mapped.message);
}

/** Der Weg zurück als Datenstruktur für `structuredContent`. */
function reversalDescription(toolName: string): Record<string, unknown> | null {
  const reversal = reversalFor(toolName);
  if (reversal === undefined) {
    return null;
  }
  return reversal.kind === "none"
    ? { available: false, reason: reversal.note }
    : { available: true, tool: reversal.tool, args_from: reversal.argFrom, note: reversal.note };
}

/** Die geschätzte Tokenzahl einer fertigen Antwort. Für Tests und für `doctor` (Plan 8.4). */
export function estimateResponseTokens(payload: ToolResponsePayload): number {
  const text = payload.content.map((block) => block.text).join("\n");
  return estimateTokens(text) + estimateTokens(JSON.stringify(payload.structuredContent) ?? "");
}
