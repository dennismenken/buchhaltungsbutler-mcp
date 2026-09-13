// Kürzung und Binärinhalte (Plan 7.6).
//
// Zwei Grenzen: weich `BB_MCP_MAX_RESPONSE_TOKENS` (Vorgabe 5.000 Token), hart 20.000 Token je
// Antwort. Geschätzt wird über die Zeichenmethode aus 4.10, also über `CHARS_PER_TOKEN` aus
// `src/registry/budget.ts`; **zur Laufzeit wird kein Tokenizer geladen** (Plan 4.10, 13.2).
//
// Die Richtung der Ungenauigkeit ist bewusst gewählt: Eine Schätzung, die zu früh kürzt, ist
// harmlos; eine, die zu spät kürzt, sprengt das Kontextfenster des Clients.
//
// **Base64-Inhalte erscheinen niemals im Textblock.** Dort steht nur „PDF, 412 KB, im
// strukturierten Teil der Antwort". Hat der Aufrufer die Datei nicht ausdrücklich angefordert,
// wird sie auch im `structuredContent` durch einen Platzhalter mit Größenangabe ersetzt.

import type { Projection } from "../mapping/response.js";
import { CHARS_PER_TOKEN } from "../registry/budget.js";

/** Die harte Obergrenze je Antwort, in Token (Plan 7.6). Sie ist nicht konfigurierbar. */
export const HARD_RESPONSE_TOKEN_LIMIT = 20_000;

/**
 * Die geschätzte Tokenzahl eines Textes.
 *
 * Aufgerundet, weil eine Schätzung, die zu niedrig liegt, genau den Fall erzeugt, gegen den
 * die Grenze gebaut ist.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Dieselbe Schätzung für einen Wert, der als JSON in `structuredContent` landet. */
export function estimateTokensOfValue(value: unknown): number {
  const json = JSON.stringify(value) ?? "";
  return estimateTokens(json);
}

/**
 * Feldnamen, die nachweislich base64-kodierte Dateien tragen.
 *
 * `file_content` liefert `/receipts/get/<id>` bei `get_file`; `pdf`, `csv` und `csv_archive`
 * stehen im Objekt `files` der beiden Berichtsabrufe (Spezifikation, `ReportsGetBwa_Success`
 * und `ReportsGetSums_Success`). Die Liste ist die bekannte Menge, nicht die einzige Prüfung:
 * Zusätzlich greift die Längenheuristik, damit ein künftiges Feld nicht ungeprüft in den
 * Kontext läuft.
 */
export const BASE64_FIELD_NAMES: readonly string[] = Object.freeze([
  "file_content",
  "pdf",
  "csv",
  "csv_archive",
  "zip",
]);

/** Ab dieser Länge gilt eine base64-artige Zeichenkette als Datei und nicht als Text. */
export const BASE64_HEURISTIC_MIN_LENGTH = 512;

const BASE64_CHARS = /^[A-Za-z0-9+/\r\n=]+$/;

/** `true`, wenn dieser Wert eine eingebettete Datei ist und nicht ein Text, den man liest. */
export function looksLikeBase64(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= BASE64_HEURISTIC_MIN_LENGTH &&
    BASE64_CHARS.test(value)
  );
}

/** Die Größe eines base64-Inhalts in Bytes, ohne ihn zu dekodieren. */
export function base64SizeInBytes(value: string): number {
  const clean = value.replace(/[\r\n]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** Eine lesbare Größenangabe: Bytes, KB oder MB, ohne Nachkommastellen bei Bytes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} Bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${String(Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Die Art einer eingebetteten Datei, aus ihrem Feldnamen. */
export function mediaTypeOf(field: string): string {
  switch (field) {
    case "pdf":
      return "application/pdf";
    case "csv":
      return "text/csv";
    case "csv_archive":
    case "zip":
      return "application/zip";
    default:
      return "unbekannt";
  }
}

/** Der Platzhalter, der im `structuredContent` an die Stelle der Datei tritt. */
export interface BinaryPlaceholder {
  readonly _binary: true;
  readonly field: string;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly note: string;
}

/** Ein ersetzter Binärinhalt, für die Zeile im Textblock. */
export interface ReplacedBinary {
  /** Pfad des Feldes, zum Beispiel `files.pdf`. */
  readonly path: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  /** `true`, wenn der Inhalt auch im `structuredContent` ersetzt wurde. */
  readonly replaced: boolean;
}

export interface BinaryOptions {
  /**
   * `true`, wenn der Aufrufer die Datei ausdrücklich angefordert hat (`get_file`,
   * `get_files`). Dann bleibt sie im `structuredContent` stehen — im Textblock steht sie
   * trotzdem nie.
   */
  readonly requested?: boolean;
}

function describe(path: string, field: string, value: string): ReplacedBinary {
  return {
    path,
    mediaType: mediaTypeOf(field),
    sizeBytes: base64SizeInBytes(value),
    replaced: false,
  };
}

/**
 * Ersetzt eingebettete Dateien durch Platzhalter und meldet, welche das waren.
 *
 * Die Struktur wird dabei nicht umgebaut: Ein Platzhalter steht an genau der Stelle, an der
 * die Datei stand, damit der Aufrufer sieht, welches Feld sie trug.
 */
export function replaceBinaryPayloads(
  value: unknown,
  options: BinaryOptions = {},
  path = "",
): { readonly value: unknown; readonly replaced: readonly ReplacedBinary[] } {
  const found: ReplacedBinary[] = [];

  const walk = (node: unknown, nodePath: string, field: string): unknown => {
    if (typeof node === "string") {
      // Zwei Wege zur Erkennung: der bekannte Feldname und die Längenheuristik. Der
      // Feldname allein genügt nicht, weil ein kurzes `file_content` eher ein Name als eine
      // Datei ist; die Heuristik allein genügt nicht, weil ein bekanntes Dateifeld auch
      // einmal Zeichen außerhalb des Base64-Vorrats tragen kann.
      const isBinary =
        looksLikeBase64(node) ||
        (BASE64_FIELD_NAMES.includes(field) && node.length >= BASE64_HEURISTIC_MIN_LENGTH);
      if (!isBinary) {
        return node;
      }
      const info = describe(nodePath, field, node);
      if (options.requested === true) {
        found.push(info);
        return node;
      }
      found.push({ ...info, replaced: true });
      const placeholder: BinaryPlaceholder = {
        _binary: true,
        field,
        media_type: info.mediaType,
        size_bytes: info.sizeBytes,
        note:
          "Der Inhalt wurde nicht ausgeliefert, weil er nicht ausdrücklich angefordert wurde. " +
          "Zum Abholen den Aufruf mit get_file beziehungsweise get_files wiederholen.",
      };
      return placeholder;
    }
    if (Array.isArray(node)) {
      return node.map((item, index) => walk(item, `${nodePath}[${String(index)}]`, field));
    }
    if (typeof node === "object" && node !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
        out[key] = walk(item, nodePath === "" ? key : `${nodePath}.${key}`, key);
      }
      return out;
    }
    return node;
  };

  return { value: walk(value, path, path), replaced: found };
}

/** Der Platzhalter, der im **Textblock** an die Stelle einer Datei tritt (Plan 7.6). */
export const BINARY_TEXT_MARKER = "(Datei, Größe und Art siehe Hinweiszeile)";

/**
 * Entfernt jeden Binärinhalt aus einer Struktur, die in den **Textblock** geht.
 *
 * Das ist bewusst ein zweiter Durchgang neben {@link replaceBinaryPayloads}: Eine
 * ausdrücklich angeforderte Datei bleibt im `structuredContent` stehen, im Textblock steht
 * sie trotzdem **nie** (Plan 7.6). Ohne diese Trennung landeten bei `get_files: true` einige
 * hundert Zeichen Base64 im Kontext des Modells — genau das, was der Plan ausschließt.
 */
export function stripBinariesForText(value: unknown, field = ""): unknown {
  if (typeof value === "string") {
    const isBinary =
      looksLikeBase64(value) ||
      (BASE64_FIELD_NAMES.includes(field) && value.length >= BASE64_HEURISTIC_MIN_LENGTH);
    return isBinary ? BINARY_TEXT_MARKER : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripBinariesForText(item, field));
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (record._binary === true) {
      return BINARY_TEXT_MARKER;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      out[key] = stripBinariesForText(item, key);
    }
    return out;
  }
  return value;
}

/** Die Zeile, die im Textblock an die Stelle der Datei tritt (Plan 7.6). */
export function binaryTextLine(replaced: ReplacedBinary): string {
  const type = replaced.mediaType === "application/pdf" ? "PDF" : replaced.mediaType;
  const size = formatBytes(replaced.sizeBytes);
  return replaced.replaced
    ? `${replaced.path}: ${type}, ${size}, nicht ausgeliefert (nicht angefordert).`
    : `${replaced.path}: ${type}, ${size}, im strukturierten Teil der Antwort.`;
}

export interface FitOptions {
  /** Die weiche Grenze in Token (`BB_MCP_MAX_RESPONSE_TOKENS`). */
  readonly maxTokens: number;
  /** Die harte Grenze; ohne Angabe {@link HARD_RESPONSE_TOKEN_LIMIT}. */
  readonly hardMaxTokens?: number;
  /** Zeichen, die der übrige Text schon verbraucht (Bestandszeile, Hinweise, Kopf). */
  readonly reservedChars?: number;
  /** Die Zeichenzahl einer Zeile in Text **und** strukturiertem Teil. */
  readonly costOf: (row: Readonly<Record<string, unknown>>) => number;
}

export interface FitResult {
  /** Wie viele Zeilen ausgeliefert werden. Mindestens 1, solange es Zeilen gibt. */
  readonly count: number;
  readonly truncated: boolean;
  /** Die wirksame Grenze in Token; sie steht in der Kürzungsmeldung. */
  readonly budgetTokens: number;
}

/**
 * Bestimmt, wie viele Zeilen in das Antwortbudget passen.
 *
 * Es wird von vorn gezählt und nicht gesampelt: Eine Antwort aus den ersten 120 Zeilen ist
 * zusammen mit `offset` wieder herstellbar, eine aus 120 verstreuten Zeilen nicht.
 *
 * Mindestens eine Zeile wird immer ausgeliefert. Eine Antwort, die wegen einer einzigen
 * riesigen Zeile gar nichts zeigt, wäre für den Aufrufer nicht von einem leeren Ergebnis zu
 * unterscheiden — und genau diese Verwechslung ist der teure Fehler bei der Paginierung.
 */
export function fitRows(
  rows: readonly Readonly<Record<string, unknown>>[],
  options: FitOptions,
): FitResult {
  const hard = options.hardMaxTokens ?? HARD_RESPONSE_TOKEN_LIMIT;
  const budgetTokens = Math.min(options.maxTokens, hard);
  const budgetChars = budgetTokens * CHARS_PER_TOKEN - (options.reservedChars ?? 0);

  if (rows.length === 0) {
    return { count: 0, truncated: false, budgetTokens };
  }

  let used = 0;
  let count = 0;
  for (const row of rows) {
    used += options.costOf(row);
    if (used > budgetChars && count > 0) {
      break;
    }
    count += 1;
    if (used > budgetChars) {
      break;
    }
  }

  return { count, truncated: count < rows.length, budgetTokens };
}

/**
 * Die Kürzungsmeldung aus Plan 7.6.
 *
 * Sie nennt beide Zahlen, sagt ausdrücklich, dass auf Seiten der API nichts verloren gegangen
 * ist, und nennt den oder die Wege zum Rest. Ohne den mittleren Satz liest ein Agent die
 * Kürzung als Datenverlust.
 *
 * Der Rat zu `response_format` hängt an der benutzten Projektion und steht deshalb nur bei
 * `detailed`. Die Vorgabe des Eingabeschemas ist `concise`; wer dort noch einmal
 * `response_format="concise"` empfiehlt, rät zu einem Aufruf, der Wort für Wort derselbe wäre
 * und dieselbe Antwort brächte — bezahlt mit einem Request aus dem Minutenkontingent. Eine
 * Antwort dieses Servers behauptet nichts Unzutreffendes, auch nicht in einem Ratschlag.
 */
export function truncationNote(
  shown: number,
  total: number,
  budgetTokens: number,
  projection: Projection,
): string {
  const remedy =
    projection === "detailed"
      ? 'enger filtern oder response_format="concise" setzen.'
      : "enger filtern.";
  return (
    `${String(shown)} von ${String(total)} gelieferten Zeilen werden angezeigt; der Rest wurde ` +
    `weggelassen, um im Antwortbudget zu bleiben (rund ${String(budgetTokens)} Token). Auf ` +
    `Seiten der API ist nichts verloren gegangen. Um den Rest zu sehen, ${remedy}`
  );
}
