// Die Markdown-Tabelle des Textblocks. **Feldnamen im Original, keine Verschönerung**.
//
// Der Grund ist keine Stilfrage: Der Feldname der Antwort ist der
// Parametername des nächsten Aufrufs. Wer `id_by_customer` zu „Id By Customer" macht, nimmt
// dem Modell genau diese Information und erzeugt einen Zwischenschritt, in dem geraten wird.
//
// Ebenso wenig wird übersetzt oder umsortiert: Die Spaltenreihenfolge ist die Reihenfolge der
// Felder in der Antwort (und damit, nach der Projektion, die des Registereintrags).

import { sanitizeCell, sanitizeValue } from "./sanitize.js";

/** Die Spalten einer Zeilenmenge: jede vorkommende Eigenschaft, in der Reihenfolge des Auftretens. */
export function columnsOf(rows: readonly Readonly<Record<string, unknown>>[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

export interface TableOptions {
  /** Feste Spaltenliste. Ohne Angabe die Vereinigung aller Zeilen. */
  readonly columns?: readonly string[];
  /** Höchstlänge einer Zelle; darüber wird sichtbar gekürzt. */
  readonly maxCellLength?: number;
}

/**
 * Eine Markdown-Tabelle aus normalisierten Zeilen.
 *
 * Eine leere Zeilenmenge ergibt eine leere Zeichenkette; die Bestandszeile sagt dann,
 * was Sache ist, und eine Tabelle ohne Zeilen sagte nichts.
 */
export function renderTable(
  rows: readonly Readonly<Record<string, unknown>>[],
  options: TableOptions = {},
): string {
  if (rows.length === 0) {
    return "";
  }
  const columns = options.columns ?? columnsOf(rows);
  if (columns.length === 0) {
    return "";
  }
  const maxCellLength = options.maxCellLength ?? 120;

  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = columns.map((column) =>
      column in row ? sanitizeCell(row[column], maxCellLength) : "",
    );
    return `| ${cells.join(" | ")} |`;
  });
  return [header, separator, ...body].join("\n");
}

/**
 * Die lesbare Aufzählung eines Einzelobjekts (zweite Zeile der Tabelle).
 *
 * Kein Tabellenkopf mit einer einzigen Datenzeile: Bei 23 Feldern wäre das eine Zeile, die
 * niemand liest. Stattdessen Feld für Feld, Name im Original.
 */
export function renderRecord(
  record: Readonly<Record<string, unknown>>,
  options: { readonly maxCellLength?: number } = {},
): string {
  const maxCellLength = options.maxCellLength ?? DEFAULT_RECORD_CELL_LENGTH;
  return Object.entries(record)
    .map(([field, value]) => `${field}: ${renderRecordCell(value, maxCellLength)}`)
    .join("\n");
}

/**
 * Die Vorgabe für die Einzelform. Sie ist bewusst groß: Bei `bb_reports_get_bwa` und
 * `bb_reports_get_sums` **ist** die eine Zelle die gesamte Auskunft, und eine Kürzung auf
 * wenige hundert Zeichen wirft dort die Antwort weg statt sie zu bändigen. Die eigentliche
 * Grenze der Antwort ist das Tokenbudget; diese Zahl verhindert nur, dass ein
 * einzelnes Feld sie allein ausschöpft.
 */
export const DEFAULT_RECORD_CELL_LENGTH = 4000;

/**
 * Eine Zelle der Einzelform. Anders als {@link sanitizeCell} **beziffert** sie den Verlust.
 *
 * Bei der Liste sagt die Antwort, wie viele Zeilen von wie vielen gezeigt werden. Für
 * die Einzelform fehlte diese Angabe: Der Text endete auf „…", und weder der Agent noch der
 * Nutzer erfuhr, dass und wie viel fehlt. Genau das ist an einer Berichtsantwort der
 * Unterschied zwischen einer knappen und einer falschen Auskunft.
 */
export function renderRecordCell(value: unknown, maxLength: number): string {
  const text = sanitizeValue(value);
  if (text.length <= maxLength) {
    return text;
  }
  return (
    `${text.slice(0, Math.max(1, maxLength - 1))}… ` +
    `[gekürzt: ${String(maxLength - 1)} von ${String(text.length)} Zeichen; ` +
    "der vollständige Wert steht im strukturierten Teil dieser Antwort]"
  );
}

/** Dieselbe Aufzählung einzeilig, für Sätze wie den Auflösungssatz. */
export function renderRecordInline(
  record: Readonly<Record<string, unknown>>,
  options: { readonly maxCellLength?: number } = {},
): string {
  const maxCellLength = options.maxCellLength ?? 80;
  return Object.entries(record)
    .map(([field, value]) => `${field} ${sanitizeCell(value, maxCellLength)}`)
    .join(" | ");
}
