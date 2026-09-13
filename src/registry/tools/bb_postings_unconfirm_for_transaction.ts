// Werkzeug 28, `/postings/unconfirm/transaction`: hebt die Bestätigung der Buchungen einer
// Zahlung auf und entfernt sie damit.
//
// Klasse D: `destructiveHint: true`, `idempotentHint: false`. Eine wirkungslose Wiederholung
// ist plausibel, aber **nicht verifiziert**.
//
// Zwei Eigenheiten stehen in der Beschreibung (`buchungen.md` 16.6):
//
//   1. Der Aufruf adressiert die **Zahlung**, nicht die Buchung, und entfernt in einem Schritt
//      alle nicht festgeschriebenen Buchungszeilen dieser Zahlung.
//   2. `error_code` 7 ist hier fachlich kein Fehler, sondern die Feststellung, dass nichts zu
//      tun war. Bei bb_postings_unconfirm_free bedeutet derselbe Code etwas ganz anderes,
//      nämlich „falscher Buchungstyp".

import { unwrapSchema } from "../../schema/primitives.js";
import { ID_STRING_SENTENCE, idByCustomer } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt. */
function field(spec: {
  name: string;
  schema: FieldSpec["schema"];
  required?: boolean;
  description?: string;
}): FieldSpec {
  const described = unwrapSchema(spec.schema) ?? spec.schema;
  const description = spec.description ?? described.description;
  if (description === undefined || description.trim() === "") {
    throw new Error(`${spec.name}: weder Eintrag noch Schemabaustein trägt eine Beschreibung.`);
  }
  return {
    name: spec.name,
    apiNames: [spec.name],
    source: "body",
    required: spec.required ?? false,
    description,
    schema: spec.schema,
  };
}

const TRANSACTION_ID_DESCRIPTION =
  "Die mandantenbezogene Nummer der Zahlung, deren Buchungen entfernt werden, zu finden über " +
  `bb_transactions_search. Adressiert wird die Zahlung, nicht die einzelne Buchungszeile. ${ID_STRING_SENTENCE}`;

/** Werkzeug 28: `/postings/unconfirm/transaction`. */
export const bb_postings_unconfirm_for_transaction: ToolEntry = {
  name: "bb_postings_unconfirm_for_transaction",
  title: "Buchungen einer Zahlung entfernen",
  group: "postings",
  path: { literal: "/postings/unconfirm/transaction" },
  effect: "delete",
  toolClass: "D",
  tier: 1,
  description:
    "Hebt in BuchhaltungsButler die Bestätigung der Buchungen einer Zahlung auf und entfernt " +
    "sie damit. Zu nehmen, um eine falsche Zahlungsbuchung zurückzunehmen, solange sie nicht " +
    "festgeschrieben ist; ist ein Beleg der Ausgangspunkt, ist " +
    "bb_postings_unconfirm_for_receipt zuständig, bei einer freien Buchung " +
    "bb_postings_unconfirm_free. Entfernt immer alle Zeilen der Zahlung, nie eine einzelne " +
    "Zeile einer Splitbuchung, und lässt die Zahlung selbst unverändert. Festgeschriebene " +
    "Buchungen bleiben stehen; dort hilft nur bb_postings_cancel. Entfernt Daten aus dem " +
    "echten Mandanten von BuchhaltungsButler: alle nicht festgeschriebenen Buchungszeilen der " +
    "genannten Zahlung. Die betroffenen Datensätze vorher lesen und dem Nutzer vorlegen.",
  mandatorySentence: "U6",
  fields: [
    field({
      name: "transaction_id_by_customer",
      required: true,
      description: TRANSACTION_ID_DESCRIPTION,
      schema: idByCustomer("der Zahlung", "bb_transactions_search"),
    }),
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` (buchungen.md 16.3).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Der Zeitraum ist kein Argument dieses Werkzeugs; ohne Wert erscheint im Prüfaufruf
    // „(nicht gesendet)", und der hint sagt, woraus er zu bilden ist.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf den Zeitraum der bisherigen Buchungen setzen; sind dort keine " +
      "Zeilen mit transaction_id_by_customer {transaction_id_by_customer} mehr zu sehen, hat " +
      "der Aufruf gewirkt",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
