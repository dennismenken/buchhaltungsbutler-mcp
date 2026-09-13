// Werkzeug 16, `/transactions/unassign/receipt`: die Zuordnung eines Belegs zu einer Zahlung
// lösen. Wirkung löschend, Klasse D, Pflichtsatz U1.
//
// Der Name trägt das Verb `unassign` und nicht `delete`: `bb_transactions_delete_receipt` läse
// sich, als lösche es den Beleg, und das ist im Buchhaltungskontext eine gefährliche
// Fehllesung. Das Paar assign/unassign ist genau die Symmetrie, an der die
// Umkehrbarkeit abzulesen ist.
//
// `idempotentHint` bleibt über die Klasse D bei `false`, obwohl ein zweiter Aufruf plausibel
// wirkungslos wäre: Das ist NICHT verifiziert, und ein falsches `true` lädt einen Host zum
// automatischen Wiederholen ein.

import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const TRANSACTION_ID = idByCustomer("der Zahlung", "bb_transactions_search");
const RECEIPT_ID = idByCustomer("des Belegs", "bb_receipts_search");

export const bb_transactions_unassign_receipt: ToolEntry = {
  name: "bb_transactions_unassign_receipt",
  title: "Zuordnung Beleg zu Zahlung lösen",
  group: "transactions",
  path: { literal: "/transactions/unassign/receipt" },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  mandatorySentence: "U1",
  description:
    "Löst in BuchhaltungsButler die Zuordnung zwischen einem Beleg und einer Zahlung. Zu " +
    "nehmen, wenn ein Beleg der falschen Zahlung zugeordnet wurde. Welche Belege an einer " +
    "Zahlung hängen, zeigt bb_transactions_list_receipts. Der Beleg selbst bleibt erhalten; " +
    "als gelöscht markiert wird er mit bb_receipts_delete, und die Zahlung bleibt ohnehin " +
    "unberührt. Hängt an der Zuordnung eine bestätigte Buchung, lehnt BuchhaltungsButler den " +
    "Aufruf ab; die Buchung zuerst mit bb_postings_unconfirm_for_transaction entfernen. " +
    "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig zu machen " +
    "mit bb_transactions_assign_receipt.",
  fields: [
    {
      name: "transaction_id_by_customer",
      apiNames: ["transaction_id_by_customer"],
      source: "body",
      required: true,
      description: TRANSACTION_ID.description ?? "",
      schema: TRANSACTION_ID,
    },
    {
      name: "receipt_id_by_customer",
      apiNames: ["receipt_id_by_customer"],
      source: "body",
      required: true,
      description: `${RECEIPT_ID.description ?? ""} Gelöst wird nur die Zuordnung dieses einen Belegs.`,
      schema: RECEIPT_ID,
    },
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  // Die Erfolgsantwort trägt nur `success` und `message`; einen Datensatz liefert sie nicht.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_transactions_list_receipts",
    argsFrom: { transaction_id_by_customer: "transaction_id_by_customer" },
    hint:
      "der Beleg mit receipt_id_by_customer {receipt_id_by_customer} steht dann nicht mehr in " +
      "der Liste",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
