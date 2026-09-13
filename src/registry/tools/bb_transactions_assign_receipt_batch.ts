// Werkzeug 15, `/transactions/assign-batch/receipt`: bis zu 50 Zuordnungen in einem Aufruf
// (Plan 3.8, AP12b). Wirkung ändernd, Klasse A, Pflichtsatz U1.
//
// **Reine Umbenennung, keine Umformung** (Plan 4.8, Anhang A). Der Endpunkt führt genau einen
// Parameter `transactions_to_receipts`, Definition `TransactionsToReceipts`, und der ist bereits
// eine Objektliste aus `receipt_id_by_customer` und `transaction_id_by_customer`. Das
// Werkzeugfeld heißt `assignments`, weil der Name deutlicher sagt, was darin steht; parallele
// Arrays gibt es hier nicht, und es wird nichts umgerechnet. Der einzige umbenannte Behälter
// der acht Stapelendpunkte ist genau dieser.
//
// Behälter und Element stehen vollständig in `src/schema/batch.ts`, weil Plan 4.8 sie
// vollständig festlegt: zwei Felder, beide Pflicht. Dieser Eintrag trägt die `itemFields`, damit
// die Deckung zweiter Stufe die beiden Eigenschaften der Elementdefinition
// `TransactionToReceipt` prüfen kann (Plan 4.4 Punkt 3).

import { assignments } from "../../schema/batch.js";
import { API_MAX_BATCH } from "../../schema/line-items.js";
import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

// `maxItems` ausdrücklich mit API_MAX_BATCH: Dieser Eintrag entsteht beim Laden des Moduls, und
// die Konfiguration ist zu diesem Zeitpunkt noch nicht aufgelöst (Plan 6.4 Punkt 7). Die
// wirksame Grenze `min(50, BB_MCP_MAX_BATCH)` prüfen Q4 und Guard 5 zur Laufzeit (Plan 4.7 Q4).
const ASSIGNMENTS = assignments(API_MAX_BATCH);

const RECEIPT_ID = idByCustomer("des Belegs", "bb_receipts_search");
const TRANSACTION_ID = idByCustomer("der Zahlung", "bb_transactions_search");

export const bb_transactions_assign_receipt_batch: ToolEntry = {
  name: "bb_transactions_assign_receipt_batch",
  title: "Belege und Zahlungen im Stapel zuordnen",
  group: "transactions",
  path: { literal: "/transactions/assign-batch/receipt" },
  effect: "modify",
  toolClass: "A",
  tier: 3,
  mandatorySentence: "U1",
  description:
    "Stellt bis zu 50 Zuordnungen aus Beleg und Zahlung in BuchhaltungsButler in einem Aufruf " +
    "her. Fachlich gleich bb_transactions_assign_receipt, dessen Beschreibung die " +
    "Einzelheiten trägt; für ein einzelnes Paar dieses Werkzeug nicht nehmen. Gebucht wird " +
    "dabei nichts. Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. " +
    "Rückgängig zu machen mit bb_transactions_unassign_receipt.",
  fields: [
    {
      name: "assignments",
      apiNames: ["transactions_to_receipts"],
      source: "body",
      required: true,
      // Die Beschreibung des Bausteins wird wörtlich übernommen: Sie nennt den Originalnamen
      // des Parameters und den Satz zur Mengengrenze; ein eigener Text überschriebe beides.
      description: ASSIGNMENTS.description ?? "",
      schema: ASSIGNMENTS,
      transform: "object-list",
      itemFields: [
        {
          name: "receipt_id_by_customer",
          apiNames: ["receipt_id_by_customer"],
          source: "body",
          required: true,
          description: RECEIPT_ID.description ?? "",
          schema: RECEIPT_ID,
        },
        {
          name: "transaction_id_by_customer",
          apiNames: ["transaction_id_by_customer"],
          source: "body",
          required: true,
          description: TRANSACTION_ID.description ?? "",
          schema: TRANSACTION_ID,
        },
      ],
    },
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Die Erfolgsantwort trägt auf oberster Ebene die Listen `transactions_to_receipts` und
  // `errors`. `ContractFieldType` (Plan 2.1) kennt keinen Typ für eine Liste; mit leerem
  // Vertrag laufen beide unverändert durch, statt zwei `_contract_warnings` je Aufruf zu
  // erzeugen (Plan 7.3, letzter Fall).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_transactions_list_receipts",
    // Auf oberster Ebene trägt dieser Aufruf keine Kennung: Die Werte stehen je Eintrag in
    // assignments. Der Text setzt dort „nicht gesendet" ein, der Hinweis nennt die Quelle.
    argsFrom: { transaction_id_by_customer: "transaction_id_by_customer" },
    hint:
      "je Eintrag des Stapels die transaction_id_by_customer aus assignments übernehmen; der " +
      "zugehörige Beleg steht dann in der Liste",
  },
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
