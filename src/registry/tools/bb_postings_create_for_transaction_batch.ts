// Werkzeug 24, `/postings/add-batch/transactions`: Zahlungsbuchungen für mehrere Zahlungen in
// einem Aufruf (Plan 3.8, 4.8, AP12c). Mit 40 Zeichen der längste Werkzeugname des Satzes.
//
// **Auf oberster Ebene findet keine Umformung statt.** Der Endpunkt führt genau einen
// Parameter `transactions`, laut Definition `TransactionsPostings` bereits eine Objektliste.
// Die parallelen Arrays liegen **innerhalb** jedes Elements, also in `TransactionPostings`;
// dort heißt das Textarray `postingtexts` **ohne** eingeschobenes `s` — anders als in
// `ReceiptPostings`, wo derselbe Sachverhalt `postingstexts` heißt. Beide Schreibweisen sind
// geprüft und keine Verwechslung (Plan 0.5, 4.8).
//
// **`oi_receipts_ids_by_customer` ist Teil der geschachtelten Positionsliste.** Die
// Elementdefinition deklariert den Elementtyp als `integer` und schließt `null` damit formal
// aus, während der Einzelendpunkt `null` ausdrücklich verlangt; dieser Widerspruch steht in
// `buchungen.md` 13.2. Das Werkzeug folgt dem Einzelendpunkt und lässt `null` zu, weil dort
// die Bedeutung ausgeschrieben ist: „dieser Position ausdrücklich keinen Beleg zuordnen".
//
// **Der Stapel ist nicht transaktional**: `success: true` auf oberster Ebene sagt nichts über
// die einzelnen Einträge; das Array `errors` nennt die gescheiterten (`buchungen.md` 13.3).
//
// **Es gibt keine Querprüfung „Summe der Positionsbeträge"** (Plan 4.7): Der Zahlungsbetrag ist
// kein Argument, die API prüft die Summe selbst.

import { isConfigLoaded } from "../../config/resolve.js";
import { batchContainer } from "../../schema/batch.js";
import {
  API_MAX_BATCH,
  POSTINGS_TRANSACTION_BATCH_COLUMNS,
  batchLimit,
  declarationSentence,
  postingPositionItem,
  postingPositions,
} from "../../schema/line-items.js";
import { strictObject, unwrapSchema } from "../../schema/primitives.js";
import { ID_STRING_SENTENCE, idByCustomer } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Mengengrenze beider Ebenen, getrennt geprüft und nie aufsummiert (Plan 4.7 Q4). */
const ITEM_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt (Plan 4.5). */
function field(spec: {
  name: string;
  schema: FieldSpec["schema"];
  required?: boolean;
  apiName?: string;
  description?: string;
}): FieldSpec {
  const described = unwrapSchema(spec.schema) ?? spec.schema;
  const description = spec.description ?? described.description;
  if (description === undefined || description.trim() === "") {
    throw new Error(`${spec.name}: weder Eintrag noch Schemabaustein trägt eine Beschreibung.`);
  }
  return {
    name: spec.name,
    apiNames: [spec.apiName ?? spec.name],
    source: "body",
    required: spec.required ?? false,
    description,
    schema: spec.schema,
  };
}

const POSITIONS_PURPOSE =
  "Die Buchungssätze zu dieser Zahlung, je Eintrag eine Zeile. Mehrere Einträge ergeben eine " +
  "Splitbuchung; die Summe der Zeilenbeträge muss dem Zahlungsbetrag entsprechen, sonst lehnt " +
  "BuchhaltungsButler diesen Stapeleintrag ab.";

const POSITIONS_DESCRIPTION = `${POSITIONS_PURPOSE} ${declarationSentence(POSTINGS_TRANSACTION_BATCH_COLUMNS)}`;

/**
 * Die Beschreibung der Zahlungskennung, ausgeschrieben statt aus dem Baustein übernommen: Das
 * Muster von `idByCustomer()` bildet den Genitiv mit „des" und passt damit zu „Belegs", nicht
 * zu „Zahlung". Der Baustein liefert weiterhin die Form, ersetzt wird nur der Text.
 */
const TRANSACTION_ID_DESCRIPTION =
  "Die mandantenbezogene Nummer der Zahlung, zu finden über bb_transactions_search. Keine " +
  `globale Kennung. ${ID_STRING_SENTENCE}`;

const TRANSACTION_ID_SCHEMA = idByCustomer("der Zahlung", "bb_transactions_search").describe(
  TRANSACTION_ID_DESCRIPTION,
);

const NESTED_POSITIONS_SCHEMA = postingPositions("transaction-batch", {
  description: POSITIONS_PURPOSE,
  maxItems: ITEM_LIMIT,
});

/**
 * Die Felder des Positionsobjekts, nach Namen.
 *
 * Der Zugriff läuft über eine Namenskarte und nicht über `.shape.<feld>`, weil
 * `postingPositionItem()` je nach Variante zwei verschiedene Objektschemata liefert und
 * TypeScript diese Union an der siebten Spalte nicht auflöst. Die Bausteine bleiben damit
 * dieselben, die auch das ausgelieferte Schema benutzt (Plan 4.5).
 */
const POSITION_SHAPE: Readonly<Record<string, FieldSpec["schema"]>> =
  postingPositionItem(true).shape;

function positionSchema(name: string): FieldSpec["schema"] {
  const schema = POSITION_SHAPE[name];
  if (schema === undefined) {
    throw new Error(`Das Positionsobjekt von TransactionPostings führt kein Feld ${name}.`);
  }
  return schema;
}

/** Ein Stapelelement nach der Elementdefinition `TransactionPostings`. */
const TRANSACTION_POSTINGS_ITEM = strictObject({
  transaction_id_by_customer: TRANSACTION_ID_SCHEMA,
  positions: NESTED_POSITIONS_SCHEMA,
});

const TRANSACTIONS_PURPOSE =
  "Die Zahlungen mit ihren Buchungssätzen, je Eintrag eine Zahlung. Der Body-Parameter der API " +
  "heißt ebenfalls transactions und ist bereits eine Objektliste; umgeformt wird nur die " +
  "Positionsliste innerhalb eines Eintrags.";

const TRANSACTIONS_CONTAINER = batchContainer(
  "bb_postings_create_for_transaction_batch",
  TRANSACTION_POSTINGS_ITEM,
  { description: TRANSACTIONS_PURPOSE, maxItems: ITEM_LIMIT },
);

/** Werkzeug 24: `/postings/add-batch/transactions`. */
export const bb_postings_create_for_transaction_batch: ToolEntry = {
  name: "bb_postings_create_for_transaction_batch",
  title: "Buchungen zu Zahlungen anlegen",
  path: { literal: "/postings/add-batch/transactions" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Legt die Buchungssätze zu mehreren vorhandenen Zahlungen in BuchhaltungsButler in einem " +
    "Aufruf an. Zu nehmen, wenn ein ganzer Kontoauszug zu buchen ist; für eine einzelne " +
    "Zahlung bb_postings_create_for_transaction. Der Stapel ist nicht transaktional: success " +
    "auf oberster Ebene sagt nichts über die einzelnen Einträge, das Array errors der Antwort " +
    "nennt die gescheiterten. Die Antwort nennt die erzeugten Buchungen nicht; nachsehen mit " +
    "bb_postings_search. Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. " +
    "Eine festgeschriebene Buchung lässt sich nicht löschen, sondern nur mit " +
    "bb_postings_cancel stornieren; der Storno bleibt dauerhaft sichtbar.",
  mandatorySentence: "U3",
  fields: [
    {
      name: "transactions",
      apiNames: ["transactions"],
      source: "body",
      required: true,
      description: TRANSACTIONS_CONTAINER.description ?? TRANSACTIONS_PURPOSE,
      schema: TRANSACTIONS_CONTAINER,
      transform: "object-list",
      itemFields: [
        field({
          name: "transaction_id_by_customer",
          required: true,
          schema: TRANSACTION_ID_SCHEMA,
        }),
        {
          name: "positions",
          apiNames: [
            "postingaccounts",
            // Ohne eingeschobenes `s`: TransactionPostings schreibt postingtexts wie der
            // Einzelendpunkt. Der Spezifikationsfehler betrifft allein ReceiptPostings (0.5).
            "postingtexts",
            "vats",
            "cost_locations",
            "cost_locations_two",
            "amounts",
            "oi_receipts_ids_by_customer",
          ],
          source: "body",
          required: true,
          description: POSITIONS_DESCRIPTION,
          schema: NESTED_POSITIONS_SCHEMA,
          transform: "parallel-arrays",
          // Die `apiNames` zielen auf die parallelen Arrays INNERHALB der Elementdefinition
          // TransactionPostings und nicht auf Body-Parameter (Plan 2.1, 4.4 Punkt 3).
          itemFields: [
            field({
              name: "postingaccount",
              apiName: "postingaccounts",
              required: true,
              schema: positionSchema("postingaccount"),
            }),
            field({
              name: "postingtext",
              apiName: "postingtexts",
              required: true,
              schema: positionSchema("postingtext"),
            }),
            field({ name: "vat", apiName: "vats", required: true, schema: positionSchema("vat") }),
            field({
              name: "cost_location",
              apiName: "cost_locations",
              schema: positionSchema("cost_location"),
            }),
            field({
              name: "cost_location_two",
              apiName: "cost_locations_two",
              schema: positionSchema("cost_location_two"),
            }),
            field({
              name: "amount",
              apiName: "amounts",
              required: true,
              schema: positionSchema("amount"),
            }),
            field({
              name: "open_item_receipt_id_by_customer",
              apiName: "oi_receipts_ids_by_customer",
              required: true,
              schema: positionSchema("open_item_receipt_id_by_customer"),
            }),
          ],
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
  // Erfolgsantwort mit den Arrays `transactions` und `errors` und ohne `message`
  // (buchungen.md 13.3). Begründung des leeren Vertrags wie bei Werkzeug 22.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Kein Buchungsdatum unter den Argumenten: Es kommt je Eintrag von der Zahlung. Ohne Wert
    // erscheint im Prüfaufruf „(nicht gesendet)"; woraus der Zeitraum entsteht, sagt der hint.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf den Zeitraum der gesendeten Zahlungen setzen, zusätzlich " +
      "date_last_action_from auf den heutigen Tag; jede Zeile trägt das " +
      "transaction_id_by_customer ihrer Zahlung, und gezählt wird je Zahlung getrennt",
  },
  // Kein duplicateCheck: bb_postings_search nimmt transaction_id_by_customer nicht als Filter
  // an und verlangt einen Zeitraum, den dieser Aufruf nicht trägt (Plan 2.1).
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
