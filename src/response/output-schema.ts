// Das `outputSchema` eines Werkzeugs, erzeugt aus dem Antwortvertrag (Plan 7.1).
//
// **Gesetzt bei allen 54 Werkzeugen, aber niemals geschlossen** (Streitfrage S18). Jedes
// Ausgabeschema trägt `additionalProperties: true`, und die Pflichtfelder beschränken sich auf
// `success` und den Datenbehälter.
//
// Die Begründung ist gemessen (Plan 0.3 Befund L4): `/receipts/get` liefert `amount_paid` und
// `amount_paid_fixed`, die in der Spezifikation nicht stehen. Ein geschlossenes Ausgabeschema
// ließe beim nächsten Feld, das BuchhaltungsButler ergänzt, jeden Aufruf scheitern — und zwar
// bei allen Nutzern gleichzeitig. Das ist der Unterschied zwischen „das Projekt braucht ein
// Update" und „das Projekt ist kaputt, bis jemand eines macht".
//
// **Feldbeschreibungen entfallen** (Sparmaßnahme S6 aus Plan 4.10); Feldnamen und Typen
// genügen. Das Schema beschreibt genau das, was `response/build.ts` in `structuredContent`
// legt — sonst wäre es keine Zusage, sondern eine Zierde: Ein Client, der validiert, müsste
// sonst jede Antwort verwerfen.

import { centsFieldName } from "../mapping/coerce.js";
import { CONTRACT_WARNINGS_KEY } from "../mapping/contract-violation.js";
import { ACCOUNT_LABEL_FIELDS } from "../mapping/response.js";
import type { ContractFieldType, ToolEntry } from "../registry/types.js";

/** Die Schlüssel, unter denen die Nutzdaten stehen. */
export const LIST_CONTAINER = "items";
export const OBJECT_CONTAINER = "data";

/**
 * Der JSON-Schema-Typ eines Vertragsfeldes **nach** der Normalisierung aus Plan 7.4.
 *
 * Jeder Typ ist zusätzlich `null`: Gemessen kommen nicht gesetzte Felder durchgehend als
 * JSON-`null` (Befund L3), und `null` wird weder weggelassen noch zu `""` gemacht. Ein
 * Schema, das das verschwiege, würde bei der ersten leeren Zelle fehlschlagen.
 */
function jsonTypeOf(type: ContractFieldType): unknown {
  switch (type) {
    case "number":
      return ["number", "null"];
    case "boolean":
    case "bool-string":
      // "0"/"1" wird zu echtem Boolean normalisiert (Plan 7.4).
      return ["boolean", "null"];
    default:
      // Auch ein Betrag bleibt String: Es entsteht niemals ein number-Betragsfeld (S9).
      return ["string", "null"];
  }
}

/** Die Eigenschaften eines Datensatzes, aus den Vertragsfeldern des Endpunkts. */
export function recordProperties(entry: ToolEntry): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, type] of Object.entries(entry.responseContract.fields)) {
    properties[name] = { type: jsonTypeOf(type) };
    if (type === "amount-string") {
      // Die verlustfreie Ganzzahlform des Betrages (Plan 7.4).
      properties[centsFieldName(name)] = { type: "integer" };
    }
    const label = ACCOUNT_LABEL_FIELDS[name];
    if (label !== undefined) {
      // Wird nur ergänzt, wenn der Kontenrahmen im Stammdatenspeicher liegt (Plan 7.4).
      properties[label] = { type: "string" };
    }
  }
  return properties;
}

const CONTRACT_WARNING_SCHEMA = Object.freeze({
  type: "array",
  items: {
    type: "object",
    properties: {
      field: { type: "string" },
      expected: { type: "string" },
      seen: { type: "string" },
    },
    additionalProperties: true,
  },
});

/**
 * Das offene Ausgabeschema eines Eintrags.
 *
 * Es beschreibt den Umschlag, den dieser Server erzeugt, und nicht den der API: `endpoint`,
 * die Paginierungstatsachen und der Datenbehälter. Der Rohumschlag der API steht dem nicht
 * entgegen — `success` trägt beides.
 */
export function buildOutputSchema(entry: ToolEntry): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    success: { type: "boolean" },
    endpoint: { type: "string" },
    message: { type: ["string", "null"] },
    [CONTRACT_WARNINGS_KEY]: CONTRACT_WARNING_SCHEMA,
  };
  const required: string[] = ["success"];

  const record = {
    type: "object",
    properties: recordProperties(entry),
    additionalProperties: true,
  };

  switch (entry.shape) {
    case "list": {
      properties.rows_returned = { type: "integer" };
      properties.limit_used = { type: ["integer", "null"] };
      properties.offset_used = { type: "integer" };
      // „wahrscheinlich mehr", niemals eine Gesamttrefferzahl (Plan 7.5).
      properties.more_possible = { type: "boolean" };
      properties[LIST_CONTAINER] = { type: "array", items: record };
      required.push(LIST_CONTAINER);
      break;
    }
    case "object": {
      properties[OBJECT_CONTAINER] = record;
      required.push(OBJECT_CONTAINER);
      break;
    }
    case "ack": {
      // Eine Quittung trägt keine Nutzdaten; kommt doch etwas, steht es unter data und ist
      // durch additionalProperties gedeckt (Plan 5.5).
      properties[OBJECT_CONTAINER] = { type: ["object", "array", "string", "null"] };
      break;
    }
  }

  if (entry.effect !== "read") {
    // Der aufgelöste Datensatz und der Weg zurück (Plan 7.1, Zeile „Schreiben"; 7.6).
    properties[writeRecordKey(entry.effect)] = { type: "object", additionalProperties: true };
    properties.reversal = { type: ["object", "null"], additionalProperties: true };
    properties.fields_not_returned = { type: "array", items: { type: "string" } };
  }

  return { type: "object", properties, required, additionalProperties: true };
}

/**
 * Der Schlüssel des aufgelösten Datensatzes einer Schreibantwort.
 *
 * Plan 7.1 nennt für die Zeile „Schreiben" den Schlüssel `created`. Das trifft für 24 der 39
 * schreibenden Werkzeuge zu; für ein `update` oder ein `delete` wäre `created` schlicht
 * falsch, und ein falscher Schlüssel ist in einer Buchhaltung teurer als ein zusätzlicher.
 * Deshalb folgt der Name der Wirkung des Eintrags.
 */
export function writeRecordKey(effect: ToolEntry["effect"]): string {
  switch (effect) {
    case "create":
      return "created";
    case "modify":
      return "changed";
    case "delete":
      return "removed";
    case "read":
      return "data";
  }
}
