// Typnormalisierung der Antwort, deterministisch und an genau einer Stelle.
//
// Die Tabelle, vollständig und als Code:
//
// | Rohwert der API                | Ergebnis                                        |
// | ------------------------------ | ----------------------------------------------- |
// | "884.65" bei `amount-string`   | unverändert "884.65" plus `amount_cents: 88465`  |
// | "0" / "1" bei `bool-string`    | echtes `false` / `true`                          |
// | "2" bzw. 2 bei `id-string`     | immer String                                     |
// | `null`                         | `null`, nicht weggelassen und nicht ""           |
// | unbekanntes Feld               | unverändert durchgereicht und gezählt            |
//
// Drei Umwandlungsregeln sind dabei nicht verhandelbar. Sie sind hier definiert und werden
// im übrigen Quelltext als „Umwandlungsregel N im Kopf von src/mapping/coerce.ts" zitiert:
//
//  1. **Es entsteht niemals ein `number`-Betragsfeld.** Die Rohzeichenkette bleibt führend,
//     das Centfeld ist ihre verlustfreie Ganzzahlform. Die Begründung steht im Kopf von
//     `src/mapping/decimal.ts`: Auf Gleitkomma wird nicht gerechnet, weil eine stille
//     Rundung in einer Buchhaltung der schlimmste denkbare Ausgang ist.
//  2. **Kennungen gehen immer als String hinaus**, auch wenn das Eingabeschema sie als
//     `integer` entgegennimmt. Gemessen liefert die API sie bei `receipts` als String und
//     bei `transactions` als Zahl (Befund L3 in docs/api/live-befunde.md); eine
//     einheitliche Form verhindert, dass ein Vergleich `"2" === 2` fehlschlägt.
//  3. **`null` ist an jedem bekannten Feld zulässig und erzeugt keine Warnung.** Gemessen
//     kommen nicht gesetzte Felder durchgehend als JSON-`null` (Befund L3 in
//     docs/api/live-befunde.md); eine Warnung je leerem Feld wäre an einer Belegliste Lärm
//     und würde die echten Abweichungen verdecken.
//     „Nicht gesetzt" und „leer" bleiben fachlich verschieden, deshalb wird `null` nicht zu "".

import type { ContractFieldType } from "../registry/types.js";
import {
  contractWarning,
  seenTypeOf,
  type ContractWarning,
  SEEN_MISSING,
} from "./contract-violation.js";
import { amountToCents, parseAmountToCents } from "./decimal.js";

/** Die Endung des zusätzlichen Ganzzahlfeldes eines Betrages. */
export const CENTS_SUFFIX = "_cents";

/** Der Name des Centfeldes zu einem Betragsfeld: `amount` wird zu `amount_cents`. */
export function centsFieldName(field: string): string {
  return `${field}${CENTS_SUFFIX}`;
}

/**
 * Die beiden Schreibweisen, die als Boolean gelesen werden.
 *
 * `"0"` und `"1"` sind die gemessene Form (Befund L3 in docs/api/live-befunde.md).
 * `"true"` und `"false"` werden
 * zusätzlich angenommen, weil sie dieselbe Aussage ohne jede Mehrdeutigkeit tragen; jede
 * andere Zeichenkette wird **nicht** gedeutet, sondern gemeldet und unverändert
 * durchgereicht. Eine Falsy-Prüfung gibt es hier nirgends: Sie würde `0` und `""` zu
 * demselben Wert machen und damit eine gemessene Null nicht mehr von einem leeren Feld
 * unterscheiden.
 */
const BOOL_STRINGS: Readonly<Record<string, boolean>> = Object.freeze({
  "0": false,
  "1": true,
  false: false,
  true: true,
});

/** Das Ergebnis der Normalisierung eines einzelnen Feldes. */
export interface CoercedField {
  /** `true`, wenn das Feld in die Antwort übernommen wird. `false` nur, wenn es fehlte. */
  readonly present: boolean;
  readonly value: unknown;
  /** Zusätzliches Feld, derzeit ausschließlich `<feld>_cents`. */
  readonly extra?: { readonly name: string; readonly value: number };
  readonly warning?: ContractWarning;
}

function keep(value: unknown): CoercedField {
  return { present: true, value };
}

function keepWithWarning(field: string, expected: string, value: unknown): CoercedField {
  return { present: true, value, warning: contractWarning(field, expected, seenTypeOf(value)) };
}

/**
 * Normalisiert einen Wert nach dem Typ, den der Antwortvertrag des Endpunkts für ihn nennt.
 *
 * Ein typwidriger Wert wird **nie** umgedeutet, sondern unverändert weitergegeben und
 * gemeldet. Der Grund ist derselbe wie für die Centform: Eine Umdeutung wäre eine
 * Tatsachenbehauptung über Daten, die der Server nicht kennt.
 */
export function coerceField(field: string, type: ContractFieldType, value: unknown): CoercedField {
  if (value === undefined) {
    return {
      present: false,
      value: undefined,
      warning: contractWarning(field, type, SEEN_MISSING),
    };
  }
  if (value === null) {
    return keep(null);
  }

  switch (type) {
    case "amount-string": {
      if (typeof value !== "string") {
        // Eine Zahl wird nicht in Cent überführt: Das wäre Rechnen auf Gleitkomma und damit
        // genau der Fehler, den Umwandlungsregel 1 im Kopf dieser Datei ausschließt. Der
        // Wert geht unverändert hinaus, mit Meldung.
        return keepWithWarning(field, type, value);
      }
      const parsed = parseAmountToCents(value);
      if (!parsed.ok) {
        return {
          present: true,
          value,
          warning: contractWarning(field, type, `string (${parsed.problem})`),
        };
      }
      return {
        present: true,
        value,
        extra: { name: centsFieldName(field), value: parsed.cents },
      };
    }

    case "bool-string": {
      if (typeof value === "boolean") {
        // Schon die Zielform. Kein Grund zur Warnung und kein Verlust an Genauigkeit.
        return keep(value);
      }
      if (typeof value === "string") {
        const normalized = BOOL_STRINGS[value.trim().toLowerCase()];
        if (normalized !== undefined) {
          return keep(normalized);
        }
        return {
          present: true,
          value,
          warning: contractWarning(field, type, `string "${value}" (weder 0 noch 1)`),
        };
      }
      return keepWithWarning(field, type, value);
    }

    case "id-string": {
      if (typeof value === "string") {
        return keep(value);
      }
      if (typeof value === "number" && Number.isInteger(value)) {
        // Die gemessene Asymmetrie zwischen receipts und transactions wird hier aufgelöst,
        // und zwar zum String hin (Umwandlungsregel 2 im Kopf dieser Datei). Das ist keine
        // Umdeutung, sondern dieselbe Kennung.
        return keep(String(value));
      }
      if (typeof value === "number") {
        // Eine Kennung mit Nachkommastellen ist keine Kennung. Sie wird gemeldet und
        // unverändert durchgereicht, damit niemand sie stillschweigend rundet.
        return {
          present: true,
          value,
          warning: contractWarning(field, type, "number (keine ganze Zahl)"),
        };
      }
      return keepWithWarning(field, type, value);
    }

    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return keep(value);
      }
      return keepWithWarning(field, type, value);
    }

    case "boolean": {
      if (typeof value === "boolean") {
        return keep(value);
      }
      return keepWithWarning(field, type, value);
    }

    case "string":
    case "null-or-string": {
      if (typeof value === "string") {
        return keep(value);
      }
      return keepWithWarning(field, type, value);
    }

    case "array": {
      // Nur die Form wird geprüft, nicht der Inhalt: Die Listen in den Berichten tragen
      // Dateinamen oder Kontonummern, deren Aufbau nicht gemessen ist.
      if (Array.isArray(value)) {
        return keep(value);
      }
      return keepWithWarning(field, type, value);
    }
  }
}

/** Das Ergebnis der Normalisierung eines ganzen Datensatzes. */
export interface CoercedRecord {
  /** Die bekannten Felder in der Reihenfolge des Vertrags, danach die unbekannten. */
  readonly values: Record<string, unknown>;
  readonly warnings: readonly ContractWarning[];
  /** Die Namen der Felder, die der Vertrag nicht kennt. Sie stehen trotzdem in `values`. */
  readonly unknownFields: readonly string[];
}

/**
 * Wendet den Antwortvertrag auf einen Datensatz an.
 *
 * Bekannte Felder werden typisiert, **unbekannte unverändert durchgereicht und gezählt**
 * (Befund L4 in docs/api/live-befunde.md: `amount_paid` und `amount_paid_fixed` kommen,
 * obwohl die Spezifikation sie nicht kennt). Verwerfen wäre Datenverlust, und ein geschlossener
 * Vertrag machte den Server bei der nächsten Anbieteränderung unbrauchbar.
 */
export function coerceRecord(
  contractFields: Readonly<Record<string, ContractFieldType>>,
  row: Readonly<Record<string, unknown>>,
): CoercedRecord {
  const values: Record<string, unknown> = {};
  const warnings: ContractWarning[] = [];

  for (const [field, type] of Object.entries(contractFields)) {
    const result = coerceField(field, type, row[field]);
    if (result.present) {
      values[field] = result.value;
      if (result.extra !== undefined) {
        values[result.extra.name] = result.extra.value;
      }
    }
    if (result.warning !== undefined) {
      warnings.push(result.warning);
    }
  }

  const unknownFields: string[] = [];
  for (const [field, value] of Object.entries(row)) {
    if (field in contractFields) {
      continue;
    }
    unknownFields.push(field);
    values[field] = value;
  }

  return { values, warnings, unknownFields };
}

/**
 * Der Centwert eines Betragsfeldes aus einem bereits normalisierten Datensatz.
 *
 * Gedacht für Summen über mehrere Zeilen: Sie laufen über diese Ganzzahlen und niemals über
 * `parseFloat` des Rohstrings.
 */
export function centsOf(record: Readonly<Record<string, unknown>>, field: string): number | null {
  const direct = record[centsFieldName(field)];
  if (typeof direct === "number" && Number.isInteger(direct)) {
    return direct;
  }
  const raw = record[field];
  return typeof raw === "string" ? amountToCents(raw) : null;
}
