// Bausteine, die mehr als ein Bündel braucht: Feldvorlagen, Textvergleich, Summen, Gruppen.
//
// Gerechnet wird in Ganzzahl-Cent über `mapping/decimal.ts`, nie in Binär-Gleitkomma (7.4, S9).
// Ein nicht zerlegbarer Betrag wird gezählt und gemeldet, statt als 0 in eine Summe einzugehen:
// Eine Summe, die stillschweigend Zeilen auslässt, ist der teurere Fehler.

import {
  CONTRACT_WARNINGS_KEY,
  contractWarningLine,
  warningsForStructuredContent,
  type AggregatedWarning,
} from "../mapping/contract-violation.js";
import { amountToCents, formatCents, sumCents } from "../mapping/decimal.js";
import { fitRows, type FitResult } from "../response/truncate.js";
import { responseFormat } from "../schema/vocab.js";
import type { FieldSpec } from "../registry/types.js";

/** Das serverseitige Feld der Projektion, wortgleich mit dem der 54 Endpunktwerkzeuge. */
export function responseFormatField(): FieldSpec {
  const schema = responseFormat();
  return {
    name: "response_format",
    apiNames: [],
    source: "server",
    required: false,
    description: schema.description ?? "",
    schema,
  };
}

/** Ein Wert als Zeichenkette, oder die leere Zeichenkette. Zahlen kommen als Zahl zurück. */
export function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

/**
 * Teilzeichenkettenvergleich ohne Beachtung der Groß- und Kleinschreibung, über alle
 * übergebenen Felder. Weder normalisiert noch transliteriert: 'Muller' findet 'Müller' nicht,
 * und die Antwort behauptet an keiner Stelle, dass sie es täte.
 */
export function matchesQuery(query: string, values: readonly unknown[]): boolean {
  const needle = query.toLowerCase();
  return values.some((value) => textOf(value).toLowerCase().includes(needle));
}

/** Das Ergebnis einer Summenbildung über eine Zeilenmenge. */
export interface AmountSum {
  readonly cents: number;
  readonly formatted: string;
  /** Zeilen, deren Betrag sich nicht zerlegen ließ. Sie sind NICHT in der Summe. */
  readonly unparsed: number;
}

/** Die Summe eines Betragsfeldes über Zeilen, in Ganzzahl-Cent. */
export function sumAmounts(
  rows: readonly Readonly<Record<string, unknown>>[],
  field: string,
): AmountSum {
  const cents: number[] = [];
  let unparsed = 0;
  for (const row of rows) {
    const raw = row[field];
    const value = typeof raw === "string" ? amountToCents(raw) : null;
    if (value === null) {
      unparsed += 1;
      continue;
    }
    cents.push(value);
  }
  const total = sumCents(cents);
  return { cents: total, formatted: formatCents(total), unparsed };
}

/** Eine Gruppe der serverseitigen Auswertung. */
export interface RowGroup {
  readonly key: string;
  readonly rows: number;
  readonly sum: string;
  readonly sum_cents: number;
}

/**
 * Gruppiert Zeilen über den Wert eines Feldes und summiert je Gruppe.
 *
 * Sortiert wird nach dem Schlüssel in Codepunktfolge, damit zwei Läufe über denselben Bestand
 * dieselbe Reihenfolge ergeben. Eine Zeile ohne Wert im Schlüsselfeld landet in der Gruppe
 * `(ohne Angabe)`; sie verschwindet nicht.
 */
export function groupRows(
  rows: readonly Readonly<Record<string, unknown>>[],
  keyField: string,
  amountField: string,
  keyOf: (value: string) => string = (value): string => value,
): readonly RowGroup[] {
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const raw = textOf(row[keyField]);
    const key = raw === "" ? "(ohne Angabe)" : keyOf(raw);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [row]);
    } else {
      bucket.push(row);
    }
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, bucketRows]) => {
      const sum = sumAmounts(bucketRows, amountField);
      return { key, rows: bucketRows.length, sum: sum.formatted, sum_cents: sum.cents };
    });
}

/** Der Monat eines Datums als `YYYY-MM`. Das Kontenblatt liefert `YYYY-MM-DD HH:MM:SS`. */
export function monthOf(value: string): string {
  return value.length >= 7 ? value.slice(0, 7) : value;
}

/**
 * Entdoppelt über `id_by_customer` und meldet, wie viele verworfen wurden.
 *
 * `offset`-Paginierung über lebende Daten kann Zeilen doppeln oder überspringen; die API kennt
 * keinen Cursor. Eine Zahl größer null ist der Beweis, dass sich die Liste unter dem Blättern
 * bewegt hat — belastbare Evidenz statt Vermutung, und der Grund für `complete` = false.
 */
export function dedupeById(rows: readonly Readonly<Record<string, unknown>>[]): {
  readonly rows: readonly Record<string, unknown>[];
  readonly discarded: number;
} {
  const seen = new Set<string>();
  const kept: Record<string, unknown>[] = [];
  let discarded = 0;
  for (const row of rows) {
    const id = textOf(row["id_by_customer"]);
    if (id === "") {
      kept.push({ ...row });
      continue;
    }
    if (seen.has(id)) {
      discarded += 1;
      continue;
    }
    seen.add(id);
    kept.push({ ...row });
  }
  return { rows: kept, discarded };
}

/** Eine Aufzählung als deutscher Satzteil: „a, b und c". */
export function enumerate(values: readonly string[]): string {
  if (values.length === 0) {
    return "";
  }
  const last = values[values.length - 1] ?? "";
  return values.length === 1 ? last : `${values.slice(0, -1).join(", ")} und ${last}`;
}

/**
 * Wie viele der ausgewählten Zeilen in das Antwortbudget passen.
 *
 * `max_rows` und `max_hits` schützen den Kontext, aber nicht vor einer breiten Zeile: Eine
 * Kontenblattzeile wiegt gemessen 723 Byte, 200 davon rund 36.000 Token. Gerechnet wird mit
 * Text und strukturiertem Teil, also mit dem, was wirklich hinausgeht.
 */
export function fitToBudget(
  rows: readonly Readonly<Record<string, unknown>>[],
  maxResponseTokens: number,
  reservedChars: number,
): FitResult {
  return fitRows(rows, {
    maxTokens: maxResponseTokens,
    reservedChars,
    costOf: (row) => (JSON.stringify(row) ?? "").length * 2,
  });
}

/** Was eine Vertragsverletzung in Textblock und `structuredContent` hinterlässt. */
export interface ContractWarningBlock {
  readonly line: string;
  readonly structured: Record<string, unknown>;
}

/**
 * Die Vertragsverletzungen der gelesenen Zeilen, für Textblock und `structuredContent`.
 *
 * Ein Bündel darf nicht weniger melden als das Einzelwerkzeug, das es ersetzt: Die 54 legen
 * dieselbe Meldung unter `_contract_warnings` ab und stellen sie VOR die Zahlen (7.3, R6).
 * Ohne sie verschwände eine Änderung der API in einer Bündelantwort spurlos.
 */
export function contractWarnings(
  warnings: readonly AggregatedWarning[],
  rowCount: number,
): ContractWarningBlock | null {
  if (warnings.length === 0) {
    return null;
  }
  return {
    line: contractWarningLine(warnings, rowCount),
    structured: { [CONTRACT_WARNINGS_KEY]: warningsForStructuredContent(warnings) },
  };
}
