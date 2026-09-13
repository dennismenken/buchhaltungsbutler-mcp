// Werkzeug 27, `/postings/unconfirm/receipt`: hebt die Bestätigung der Buchungen eines Belegs
// auf und entfernt sie damit (Plan 3.8, AP12c).
//
// Klasse D: `destructiveHint: true`, `idempotentHint: false`. Dass eine Wiederholung
// wirkungslos wäre, ist plausibel, aber **nicht verifiziert**; ein falsches `true` lädt einen
// Host zum automatischen Wiederholen ein (Plan 3.3, Streitfrage S6).
//
// Zwei Eigenheiten stehen in der Beschreibung, weil sie sonst zu einem falschen zweiten Aufruf
// führen (`buchungen.md` 17.6):
//
//   1. Der Aufruf entfernt **alle** nicht festgeschriebenen Buchungszeilen des Belegs, nie
//      eine einzelne Zeile einer Splitbuchung. Der Beleg selbst bleibt unangetastet.
//   2. Wurde der Beleg über eine verknüpfte Zahlung gebucht, hängen die Buchungen an der
//      Zahlung. Dann meldet dieser Endpunkt `error_code` 7, und zuständig ist
//      bb_postings_unconfirm_for_transaction.

import { unwrapSchema } from "../../schema/primitives.js";
import { idByCustomer } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt (Plan 4.5). */
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

const RECEIPT_ID_DESCRIPTION =
  "Die mandantenbezogene Nummer des Belegs, dessen Buchungen entfernt werden, zu finden über " +
  "bb_receipts_search. Adressiert wird der Beleg, nicht die einzelne Buchungszeile.";

/** Werkzeug 27: `/postings/unconfirm/receipt`. */
export const bb_postings_unconfirm_for_receipt: ToolEntry = {
  name: "bb_postings_unconfirm_for_receipt",
  title: "Buchungen eines Belegs entfernen",
  path: { literal: "/postings/unconfirm/receipt" },
  effect: "delete",
  toolClass: "D",
  tier: 1,
  description:
    "Hebt in BuchhaltungsButler die Bestätigung der Buchungen eines Belegs auf und entfernt " +
    "sie damit. Zu nehmen, um eine falsche Belegbuchung zurückzunehmen, solange sie nicht " +
    "festgeschrieben ist; hängen die Buchungen an einer verknüpften Zahlung, ist " +
    "bb_postings_unconfirm_for_transaction zuständig, bei einer freien Buchung " +
    "bb_postings_unconfirm_free. Entfernt immer alle Zeilen des Belegs, nie eine einzelne " +
    "Zeile einer Splitbuchung, und lässt den Beleg selbst unverändert. Festgeschriebene " +
    "Buchungen bleiben stehen; dort hilft nur bb_postings_cancel. Entfernt Daten aus dem " +
    "echten Mandanten von BuchhaltungsButler: alle nicht festgeschriebenen Buchungszeilen des " +
    "genannten Belegs. Die betroffenen Datensätze vorher lesen und dem Nutzer vorlegen.",
  mandatorySentence: "U6",
  fields: [
    field({
      name: "receipt_id_by_customer",
      required: true,
      description: RECEIPT_ID_DESCRIPTION,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    }),
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` (buchungen.md 17.3).
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
      "Zeilen mit receipt_id_by_customer {receipt_id_by_customer} mehr zu sehen, hat der " +
      "Aufruf gewirkt",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
