// Werkzeug 14, `/transactions/assign/receipt`: einen Beleg einer Zahlung zuordnen
// (Plan 3.8, AP12b). Wirkung ändernd, Klasse A, Pflichtsatz U1.
//
// Klasse A und nicht D oder B: Die Zuordnung ist eine Verbindung, die dieselbe API wieder
// lösen kann (bb_transactions_unassign_receipt). Genau diese Umkehrbarkeit steht als U1 in der
// Beschreibung, und der Umkehrweg ist dort namentlich genannt (Plan 3.5).
//
// Die Zuordnung erzeugt KEINEN Buchungssatz. Das ist der häufigste Irrtum an dieser Stelle und
// steht deshalb als Negation in der Beschreibung (Plan 4.9 Punkt 4).

import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const TRANSACTION_ID = idByCustomer("der Zahlung", "bb_transactions_search");
const RECEIPT_ID = idByCustomer("des Belegs", "bb_receipts_search");

export const bb_transactions_assign_receipt: ToolEntry = {
  name: "bb_transactions_assign_receipt",
  title: "Beleg einer Zahlung zuordnen",
  path: { literal: "/transactions/assign/receipt" },
  effect: "modify",
  toolClass: "A",
  tier: 2,
  mandatorySentence: "U1",
  description:
    "Ordnet in BuchhaltungsButler einen Beleg einer Zahlung zu. Zu nehmen, wenn Beleg und " +
    "Zahlung denselben Vorgang betreffen, zum Beispiel eine Eingangsrechnung und die " +
    "Überweisung über denselben Betrag. Mehrere Paare in einem Aufruf stellt " +
    "bb_transactions_assign_receipt_batch her. Gebucht wird dabei nichts: Die Zuordnung allein " +
    "erzeugt keinen Buchungssatz, den legt bb_postings_create_for_transaction an. Welche " +
    "Belege bereits an einer Zahlung hängen, zeigt bb_transactions_list_receipts. Schreibt in " +
    "die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig zu machen mit " +
    "bb_transactions_unassign_receipt.",
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
      description: RECEIPT_ID.description ?? "",
      schema: RECEIPT_ID,
    },
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
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
    hint: "der Beleg mit receipt_id_by_customer {receipt_id_by_customer} steht dann in der Liste",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
