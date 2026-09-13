// Werkzeug 22, `/postings/add-batch/receipts`: Belegbuchungen für mehrere Belege in einem
// Aufruf.
//
// **Auf oberster Ebene findet hier KEINE Umformung statt.** Der Endpunkt führt genau einen
// Parameter `receipts`, und der ist laut Definition `ReceiptsPostings` bereits eine
// Objektliste. Die parallelen Arrays liegen **innerhalb** jedes Stapelelements, also in der
// Elementdefinition `ReceiptPostings`; die Positionsliste wird deshalb je Element gebildet und
// nicht oben (Tabelle am Ende).
//
// **Der Spezifikationsfehler ist hier sichtbar und bewusst nicht geglättet:**
// `ReceiptPostings` schreibt das Array `postingstexts` mit eingeschobenem `s`, der
// Einzelendpunkt `/postings/add/receipt` schreibt `postingtexts`. Beides steht so in
// `SPEC_BUGS`; geglättet scheiterte der Aufruf am falschen Feldnamen. Das Feld des
// Positionsobjekts heißt an beiden Werkzeugen `postingtext`, nur sein `apiName` weicht ab.
//
// **Der Stapel ist nicht transaktional.** Die Erfolgsantwort trägt `success: true` auf
// oberster Ebene, dazu ein Array `receipts` mit je einem Ergebnis und ein Array `errors` mit je
// einem Fehlerobjekt; ein `message` auf oberster Ebene gibt es nicht (`buchungen.md` 11.3).
// `success: true` sagt deshalb nichts darüber, ob alles gebucht wurde.
//
// **Es gibt keine Querprüfung „Summe der Positionsbeträge"**: Der Belegbetrag ist
// an diesem Endpunkt kein Argument, die API prüft die Summe selbst.

import { isConfigLoaded } from "../../config/resolve.js";
import { batchContainer } from "../../schema/batch.js";
import {
  API_MAX_BATCH,
  POSTINGS_RECEIPT_BATCH_COLUMNS,
  batchLimit,
  declarationSentence,
  postingPositionItem,
  postingPositions,
} from "../../schema/line-items.js";
import { strictObject, unwrapSchema } from "../../schema/primitives.js";
import { idByCustomer, postingAccountNumber } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/**
 * Die Mengengrenze beider Ebenen: `min(50, BB_MCP_MAX_BATCH)`, sobald die Konfiguration
 * aufgelöst ist.
 *
 * Sie gilt für den Behälter **und** für die Positionsliste jedes einzelnen Elements, und es
 * wird nichts aufsummiert: Ein Stapel aus 50 Belegen mit je 50 Positionen reißt keine der
 * beiden Grenzen. Ohne aufgelöste Konfiguration gilt das API-Maximum, weil das Register auch
 * von den Registerprüfungen geladen wird und `batchLimit()` dann wirft.
 */
const ITEM_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt. */
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
  "Die Buchungssätze zu diesem Beleg, je Eintrag eine Zeile. Mehrere Einträge ergeben eine " +
  "Splitbuchung; die Summe der Zeilenbeträge muss dem Belegbetrag entsprechen, sonst lehnt " +
  "BuchhaltungsButler diesen Stapeleintrag ab.";

const POSITIONS_DESCRIPTION = `${POSITIONS_PURPOSE} ${declarationSentence(POSTINGS_RECEIPT_BATCH_COLUMNS)}`;

const CONDITIONAL_PERSON_ACCOUNT_SENTENCE =
  "Die Spezifikation führt das Feld als Pflicht, seine eigene Beschreibung nennt es nur bei " +
  "passender Belegrichtung nötig; dieser Widerspruch ist nicht aufgelöst. Passt das Konto " +
  "nicht zur Belegrichtung, antwortet die API mit error_code 8.";

const CREDITOR_DESCRIPTION =
  "Kreditorenkonto als Gegenkonto, zum Beispiel 70001. Gilt für Eingangsrechnungen und setzt " +
  `die eingeschaltete Kreditorenbuchung voraus. ${CONDITIONAL_PERSON_ACCOUNT_SENTENCE} ` +
  "Kreditoren nachschlagen mit bb_creditors_search.";

const DEBTOR_DESCRIPTION =
  "Debitorenkonto als Gegenkonto, zum Beispiel 10001. Gilt für Ausgangsrechnungen und setzt " +
  `die eingeschaltete Debitorenbuchung voraus. ${CONDITIONAL_PERSON_ACCOUNT_SENTENCE} ` +
  "Debitoren nachschlagen mit bb_debtors_search.";

const RECEIPT_ID_SCHEMA = idByCustomer("des Belegs", "bb_receipts_search");

const NESTED_POSITIONS_SCHEMA = postingPositions("receipt-batch", {
  description: POSITIONS_PURPOSE,
  maxItems: ITEM_LIMIT,
});

const position = postingPositionItem(false).shape;

/** Ein Stapelelement nach der Elementdefinition `ReceiptPostings`. */
const RECEIPT_POSTINGS_ITEM = strictObject({
  receipt_id_by_customer: RECEIPT_ID_SCHEMA,
  creditor: postingAccountNumber().describe(CREDITOR_DESCRIPTION),
  debtor: postingAccountNumber().describe(DEBTOR_DESCRIPTION),
  positions: NESTED_POSITIONS_SCHEMA,
});

const RECEIPTS_PURPOSE =
  "Die Belege mit ihren Buchungssätzen, je Eintrag ein Beleg. Der Body-Parameter der API heißt " +
  "ebenfalls receipts und ist bereits eine Objektliste; umgeformt wird nur die Positionsliste " +
  "innerhalb eines Eintrags.";

const RECEIPTS_CONTAINER = batchContainer(
  "bb_postings_create_for_receipt_batch",
  RECEIPT_POSTINGS_ITEM,
  {
    description: RECEIPTS_PURPOSE,
    maxItems: ITEM_LIMIT,
  },
);

/** Werkzeug 22: `/postings/add-batch/receipts`. */
export const bb_postings_create_for_receipt_batch: ToolEntry = {
  name: "bb_postings_create_for_receipt_batch",
  title: "Buchungen zu Belegen anlegen",
  group: "postings",
  path: { literal: "/postings/add-batch/receipts" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Legt die Buchungssätze zu mehreren vorhandenen Belegen in BuchhaltungsButler in einem " +
    "Aufruf an. Zu nehmen, wenn viele Belege zu buchen sind, etwa ein Monat Eingangsrechnungen; " +
    "für einen einzelnen Beleg bb_postings_create_for_receipt. Der Stapel ist nicht " +
    "transaktional: success auf oberster Ebene sagt nichts über die einzelnen Einträge, das " +
    "Array errors der Antwort nennt die gescheiterten. Die Antwort nennt die erzeugten " +
    "Buchungen nicht; nachsehen mit bb_postings_search. Schreibt in die echten " +
    "Buchhaltungsdaten von BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich nicht " +
    "löschen, sondern nur mit bb_postings_cancel stornieren; der Storno bleibt dauerhaft " +
    "sichtbar.",
  mandatorySentence: "U3",
  fields: [
    {
      name: "receipts",
      apiNames: ["receipts"],
      source: "body",
      required: true,
      description: RECEIPTS_CONTAINER.description ?? RECEIPTS_PURPOSE,
      schema: RECEIPTS_CONTAINER,
      transform: "object-list",
      itemFields: [
        field({ name: "receipt_id_by_customer", required: true, schema: RECEIPT_ID_SCHEMA }),
        field({
          name: "creditor",
          required: true,
          description: CREDITOR_DESCRIPTION,
          schema: postingAccountNumber(),
        }),
        field({
          name: "debtor",
          required: true,
          description: DEBTOR_DESCRIPTION,
          schema: postingAccountNumber(),
        }),
        {
          name: "positions",
          apiNames: [
            "postingaccounts",
            // Der eingeschobene Buchstabe ist der benannte Spezifikationsfehler:
            // ReceiptPostings trägt postingstexts, der Einzelendpunkt postingtexts.
            "postingstexts",
            "vats",
            "cost_locations",
            "cost_locations_two",
            "amounts",
          ],
          source: "body",
          required: true,
          description: POSITIONS_DESCRIPTION,
          schema: NESTED_POSITIONS_SCHEMA,
          transform: "parallel-arrays",
          // Die `apiNames` zielen auf die parallelen Arrays INNERHALB der Elementdefinition
          // ReceiptPostings und nicht auf Body-Parameter.
          itemFields: [
            field({
              name: "postingaccount",
              apiName: "postingaccounts",
              required: true,
              schema: position.postingaccount,
            }),
            field({
              name: "postingtext",
              apiName: "postingstexts",
              required: true,
              schema: position.postingtext,
            }),
            field({ name: "vat", apiName: "vats", required: true, schema: position.vat }),
            field({
              name: "cost_location",
              apiName: "cost_locations",
              schema: position.cost_location,
            }),
            field({
              name: "cost_location_two",
              apiName: "cost_locations_two",
              schema: position.cost_location_two,
            }),
            field({
              name: "amount",
              apiName: "amounts",
              required: true,
              schema: position.amount,
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
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  // Die Erfolgsantwort trägt `receipts` und `errors` als Arrays von Objekten und kein
  // `message` (buchungen.md 11.3). `ContractFieldType` kennt keinen Typ für ein
  // Objekt oder ein Array; ein erfundener Typ erzeugte bei jedem erfolgreichen Aufruf
  // Vertragswarnungen. Mit leerem Vertrag laufen beide Felder als unbekannt unverändert durch.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Kein Buchungsdatum unter den Argumenten: Es kommt je Eintrag vom Beleg. Das Pflichtpaar
    // steht trotzdem im Prüfaufruf, damit er vollständig dasteht; ohne Wert erscheint dort
    // „(nicht gesendet)", und der hint sagt, woraus der Zeitraum entsteht.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf den Zeitraum der gesendeten Belege setzen, zusätzlich " +
      "date_last_action_from auf den heutigen Tag; jede Zeile trägt das " +
      "receipt_id_by_customer ihres Belegs, und gezählt wird je Beleg getrennt",
  },
  // Kein duplicateCheck: bb_postings_search nimmt receipt_id_by_customer nicht als Filter an
  // und verlangt einen Zeitraum, den dieser Aufruf nicht trägt.
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
