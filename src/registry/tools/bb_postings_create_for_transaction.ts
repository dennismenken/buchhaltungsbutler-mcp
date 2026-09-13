// Werkzeug 23, `/postings/add/transaction`: Buchungssätze zu einer vorhandenen Zahlung
// (Plan 3.8, 4.8, AP12c).
//
// Der zweite der fünf Endpunkte mit parallelen Arrays auf oberster Ebene. Die Positionsliste
// `positions` trägt hier **sieben** `apiNames`: dieselben sechs wie bei der Belegbuchung plus
// `oi_receipts_ids_by_customer`, die Zuordnung offener Posten je Position.
//
// **`null` ist dort ein Wert und keine Lücke.** Die Spezifikation beschreibt es als einziges
// Array der ganzen API ausdrücklich: „A null value within the array means explicitly assigning
// no receipt to the partial posting in that position." Im Positionsobjekt heißt das Feld
// `open_item_receipt_id_by_customer` und ist deshalb nullable und nicht optional; wer nur für
// die erste von drei Zeilen einen Beleg hat, setzt die beiden übrigen auf `null`
// (`buchungen.md` 12.2 und 12.6).
//
// **Es gibt keine Querprüfung „Summe der Positionsbeträge"** (Plan 4.7): Der Zahlungsbetrag
// ist an diesem Endpunkt kein Argument, die API prüft die Summe selbst, und ihre Meldung steht
// im Fehlerkatalog.
//
// Klasse B mit `destructiveHint: false`: Es entstehen neue Buchungszeilen, nichts wird
// überschrieben. Die Warnung läuft über U3 und den `title` (Plan 3.3, 3.5).

import { isConfigLoaded } from "../../config/resolve.js";
import {
  API_MAX_BATCH,
  POSTINGS_TRANSACTION_COLUMNS,
  batchLimit,
  declarationSentence,
  postingPositionItem,
  postingPositions,
} from "../../schema/line-items.js";
import { unwrapSchema } from "../../schema/primitives.js";
import { ID_STRING_SENTENCE, idByCustomer } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Mengengrenze der Positionsliste; Begründung wie in bb_postings_create_for_receipt. */
const POSITION_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

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
  "BuchhaltungsButler den Aufruf ab.";

const POSITIONS_DESCRIPTION = `${POSITIONS_PURPOSE} ${declarationSentence(POSTINGS_TRANSACTION_COLUMNS)}`;

/**
 * Die Beschreibung der Zahlungskennung, ausgeschrieben statt aus dem Baustein übernommen: Das
 * Muster von `idByCustomer()` bildet den Genitiv mit „des" und passt damit zu „Belegs", nicht
 * zu „Zahlung". Schema und Wortlaut bleiben trotzdem an einer Quelle, weil der Baustein die
 * Form liefert und nur der Text ersetzt wird.
 */
const TRANSACTION_ID_DESCRIPTION =
  "Die mandantenbezogene Nummer der Zahlung, zu finden über bb_transactions_search. Keine " +
  `globale Kennung. ${ID_STRING_SENTENCE}`;

/**
 * Die Felder des Positionsobjekts, nach Namen.
 *
 * Der Zugriff läuft über eine Namenskarte und nicht über `.shape.<feld>`, weil
 * `postingPositionItem()` je nach Variante zwei verschiedene Objektschemata liefert und
 * TypeScript diese Union an der siebten Spalte nicht auflöst. Die Bausteine bleiben damit
 * dieselben, die auch das ausgelieferte Schema benutzt — eine zweite Fassung wäre die Stelle,
 * an der Schema und Registereintrag später auseinanderlaufen (Plan 4.5).
 */
const POSITION_SHAPE: Readonly<Record<string, FieldSpec["schema"]>> =
  postingPositionItem(true).shape;

function positionSchema(name: string): FieldSpec["schema"] {
  const schema = POSITION_SHAPE[name];
  if (schema === undefined) {
    throw new Error(`Das Positionsobjekt von /postings/add/transaction führt kein Feld ${name}.`);
  }
  return schema;
}

/** Werkzeug 23: `/postings/add/transaction`. */
export const bb_postings_create_for_transaction: ToolEntry = {
  name: "bb_postings_create_for_transaction",
  title: "Buchungen zu Zahlung anlegen",
  path: { literal: "/postings/add/transaction" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Legt die Buchungssätze zu einer bereits vorhandenen Zahlung in BuchhaltungsButler an. Zu " +
    "nehmen, wenn die id_by_customer einer Zahlung vorliegt und diese gebucht werden soll; " +
    "bb_postings_create_for_receipt, wenn stattdessen ein Beleg der Ausgangspunkt ist, und " +
    "bb_postings_create_free, wenn weder Beleg noch Zahlung vorliegt. Je Position lässt sich " +
    "ein offener Posten ausgleichen. Buchungsdatum, Gegenkonto und Buchungsrichtung kommen " +
    "von der Zahlung und sind keine Argumente. Die Antwort nennt die erzeugten Buchungen " +
    "nicht; nachsehen mit bb_postings_search. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich nicht löschen, sondern nur " +
    "mit bb_postings_cancel stornieren; der Storno bleibt dauerhaft sichtbar.",
  mandatorySentence: "U3",
  fields: [
    field({
      name: "transaction_id_by_customer",
      required: true,
      schema: idByCustomer("der Zahlung", "bb_transactions_search").describe(
        TRANSACTION_ID_DESCRIPTION,
      ),
    }),
    {
      name: "positions",
      apiNames: [
        "postingaccounts",
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
      schema: postingPositions("transaction", {
        description: POSITIONS_PURPOSE,
        maxItems: POSITION_LIMIT,
      }),
      transform: "parallel-arrays",
      // Die `apiNames` der Positionsfelder zielen auf die parallelen Array-Parameter des
      // Endpunkts und nicht auf ein Body-Feld gleichen Namens (Plan 2.1, 4.8). Aus derselben
      // Liste leitet `mapping/parallel-arrays.ts` die Spalten der Umformung ab.
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
        // Pflicht, weil die API das Array immer erwartet; `null` je Position bedeutet
        // ausdrücklich „dieser Zeile keinen Beleg zuordnen" (Plan 4.8).
        field({
          name: "open_item_receipt_id_by_customer",
          apiName: "oi_receipts_ids_by_customer",
          required: true,
          schema: positionSchema("open_item_receipt_id_by_customer"),
        }),
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
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` und ohne die erzeugten
  // Kennungen (buchungen.md 12.3).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Das Buchungsdatum kommt von der Zahlung und ist kein Argument dieses Werkzeugs; das
    // Pflichtpaar steht trotzdem im Prüfaufruf, damit er vollständig dasteht. Ohne Wert
    // erscheint dort „(nicht gesendet)", und der hint sagt, woraus der Zeitraum entsteht.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf das Buchungsdatum der Zahlung setzen, zusätzlich " +
      "date_last_action_from auf den heutigen Tag; die gesuchten Zeilen tragen " +
      "transaction_id_by_customer {transaction_id_by_customer}",
  },
  // Kein duplicateCheck: bb_postings_search nimmt transaction_id_by_customer nicht als Filter
  // an und verlangt einen Zeitraum, den dieser Aufruf nicht trägt (Plan 2.1).
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
