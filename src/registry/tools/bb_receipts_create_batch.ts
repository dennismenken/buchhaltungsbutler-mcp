// Werkzeug 5 von 54 (Plan 3.8): `/receipts/addBatch`, bis zu 50 Belege ohne Datei.
//
// **Währung, Regel R-A aus Plan 4.5.** Das Feld `currency` je Element trägt denselben
// Wertevorrat, dieselbe Pflichtigkeit und wortgleich dieselbe Beschreibung wie `currency` an
// bb_receipts_create: freier String, an beiden Pflicht, Text aus `RECEIPT_CURRENCY_SENTENCE`,
// Schema aus `currencyReceipts()`. Beide Einträge rufen dieselbe Konstante und denselben
// Baustein; damit ist der Gleichlauf nicht behauptet, sondern bauartbedingt.
// **Der Ein-Wert-Enum `["EUR"]`** der Definition `Receipt` (Belegstelle:
// `.definitions.Receipt.properties.currency.enum` in docs/openapi/buchhaltungsbutler-v1.json)
// **ist verworfen**: Er widerspricht dem Beschreibungstext derselben Eigenschaft, der 48 Codes
// aufzählt, und dem Endpunkttext von `/receipts/add`, der drei nennt. Nach Regel R-B ist damit
// kein Vorrat belegt (Plan 0.5 Korrektur 2, Anhang B Punkt 47).
//
// **Die Elementfelder tragen die Namen von bb_receipts_create**, also `receipt_type` statt
// `type` und `payment_account_number` statt `account`, und ihre `apiNames` zeigen auf die
// Eigenschaften der Definition `Receipt`. Grund: Die Spezifikation erklärt Stapelelement und
// Einzelendpunkt wörtlich für gleich („A receipt has the same fields like the /receipts/add
// endpoint has"), und `account` meint auch hier ein Zahlungskonto, während der Wert eine
// Sachkontonummer ist — der gefährlichste Verwechslungsfall der API (Plan 3.4). Ein Werkzeugpaar,
// das denselben Wert einmal `account` und einmal `payment_account_number` nennt, verschiebt die
// Verwechslung nur in den Stapel. Die Originalnamen stehen in den Feldbeschreibungen (Anhang A).
//
// **`maxItems` steht mit dem API-Maximum 50 im Schema und nicht mit `min(50, BB_MCP_MAX_BATCH)`.**
// Das Fragment entsteht beim Laden dieses Moduls, und zu diesem Zeitpunkt ist die Konfiguration
// noch nicht aufgelöst; `batchLimit()` ohne Übergabewert würde dort werfen. Die
// Betreibergrenze wirkt trotzdem: Querprüfung Q4 liest sie beim Bau des Schemas und lehnt einen
// zu großen Stapel vor dem Request ab (Plan 4.7 Q4, 6.4 Punkt 7).
//
// **Teilerfolg ist der Normalfall.** Die Antwort trägt `receipts` und `errors` nebeneinander und
// weder `data` noch `rows` noch `message` (docs/api/belege.md 6.3). Der Antwortvertrag bleibt
// deshalb leer: Beide Felder sind Arrays von Objekten, und `ContractFieldType` (Plan 2.1) kennt
// keinen Typ dafür. Mit `"string"` erzeugte jeder erfolgreiche Aufruf zwei
// `_contract_warnings`; mit leerem Vertrag laufen beide Felder unverändert durch (Plan 7.3).

import { z } from "zod";

import { batchContainer, batchSizeSentence } from "../../schema/batch.js";
import { API_MAX_BATCH } from "../../schema/line-items.js";
import { amountValue, boundedText, dateValue, strictObject } from "../../schema/primitives.js";
import {
  currencyReceipts,
  idByCustomer,
  paymentAccountNumber,
  postingAccountNumber,
  RECEIPT_CURRENCY_SENTENCE,
} from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";
import { RECEIPT_TYPES, RECEIPT_TYPE_TEXT } from "./bb_receipts_create.js";

/**
 * Die Beschreibungen der Elementfelder, gemeinsame Quelle für das Schemafragment und für
 * `itemFields`.
 *
 * Sie sind kürzer als an bb_receipts_create, und das ist Absicht: Die Fachlichkeit trägt die
 * Einzelvariante, auf die die Werkzeugbeschreibung verweist, und dieser Eintrag ist Stufe 3
 * (Plan 4.9). Sie stehen aber an **beiden** Stellen, weil allein das Schemafragment beim
 * Aufrufer ankommt: Ein Text, der nur in `itemFields` stünde, würde nie ausgeliefert.
 */
const ELEMENT_TEXTS = {
  receipt_type: RECEIPT_TYPE_TEXT,
  counterparty:
    "Gegenpartei: bei einer Eingangsrechnung der Rechnungssteller, bei einer Ausgangsrechnung " +
    "der Empfänger. Ein leerer Wert wird abgelehnt.",
  invoice_number:
    "Rechnungsnummer, zum Beispiel ER-2026-0001, höchstens 60 Zeichen. In der Antwort der Suche " +
    "heißt das Feld invoicenumber.",
  date: "Belegdatum, also das Ausstellungsdatum, als YYYY-MM-DD, zum Beispiel 2026-04-26.",
  amount:
    "Bruttobetrag des Belegs mit Dezimalpunkt, zum Beispiel 123.99. 0.00 ist kein gültiger " +
    "Betrag; ein negativer Betrag kennzeichnet eine Rückabwicklung.",
  currency: RECEIPT_CURRENCY_SENTENCE,
  vat_rate:
    "Umsatzsteuersatz in Prozent als Zahl, zum Beispiel 19 oder 0. Weglassen bei keinem oder " +
    "mehreren Steuersätzen.",
  payment_account_number:
    "Sachkontonummer eines Zahlungskontos, zum Beispiel '1200'. Nicht das Sachkonto, auf das " +
    "gebucht wird. Auflisten mit bb_payment_accounts_list. Der Parameter heißt in der API account.",
  creditor_debtor:
    "Nummer des Personenkontos: bei Eingangsbelegen ein Kreditor, bei Ausgangsbelegen ein " +
    "Debitor, zum Beispiel 70001. Nachschlagen mit bb_postingaccounts_search.",
  payment_reference:
    "Technische Zahlungsreferenz, zum Beispiel eine Amazon-Bestellnummer oder eine Vorgangsnummer " +
    "von PayPal oder Stripe. Kein Verwendungszweck als Freitext.",
  date_delivery:
    "Leistungs- oder Lieferdatum als YYYY-MM-DD. Wegen der DATEV-Kompatibilität nicht nach dem " +
    "Belegdatum.",
  date_payment_due: "Fälligkeitsdatum als YYYY-MM-DD, zum Beispiel 2026-05-26.",
  link_to_receipt_id_by_customer:
    "Nummer eines anderen Belegs, zu finden über bb_receipts_search. Beide Belege werden dann " +
    "gemeinsam einer Zahlung zugeordnet. Ohne Anführungszeichen übergeben.",
} as const;

/** Die feldeigene Beschreibung des Behälters. Der Mengensatz wird vom Baustein angehängt. */
const CONTAINER_TEXT =
  "Die anzulegenden Belege, je Eintrag ein vollständiger Beleg mit denselben Feldern wie bei " +
  "bb_receipts_create. Ein abgelehnter Einzelbeleg lässt die übrigen unberührt: Die Antwort " +
  "trägt die angelegten Belege und die abgelehnten getrennt.";

export const bb_receipts_create_batch: ToolEntry = {
  name: "bb_receipts_create_batch",
  title: "Belege stapelweise anlegen",
  group: "receipts",
  path: { literal: "/receipts/addBatch" },
  effect: "create",
  toolClass: "A",
  tier: 3,
  mandatorySentence: "U2",
  // Stufe 3 erlaubt 480 Zeichen, und der Pflichtsatz U2 belegt davon 217 (Plan 4.9, 4.10).
  // Die Abgrenzung steht deshalb in Kurzform; die Fachlichkeit trägt bb_receipts_create.
  description:
    "Legt in BuchhaltungsButler bis zu 50 Belege ohne Datei an, beim Import aus einem " +
    "Vorsystem; höchstens ein Aufruf je fünf Sekunden. Einzeln legt bb_receipts_create an, " +
    "Belege mit Datei bb_receipts_upload. Erzeugt keine Buchung; Teilerfolg ist der " +
    "Normalfall. Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig " +
    "nur mit bb_receipts_delete, das den Beleg lediglich als gelöscht markiert; die API kennt " +
    "keinen Endpunkt, der einen Beleg endgültig entfernt.",
  fields: [
    {
      name: "receipts",
      apiNames: ["receipts"],
      source: "body",
      required: true,
      // Der Text des Bausteins einschließlich des Mengensatzes. Wer ihn hier überschreibt,
      // liefert eine Mengengrenze aus, die in keiner Beschreibung steht (Plan 4.8).
      description: `${CONTAINER_TEXT} ${batchSizeSentence(API_MAX_BATCH)}`,
      schema: batchContainer(
        "bb_receipts_create_batch",
        strictObject({
          receipt_type: z.enum(RECEIPT_TYPES).describe(ELEMENT_TEXTS.receipt_type),
          counterparty: boundedText(ELEMENT_TEXTS.counterparty),
          invoice_number: boundedText(ELEMENT_TEXTS.invoice_number, 60),
          date: dateValue(ELEMENT_TEXTS.date),
          amount: amountValue(ELEMENT_TEXTS.amount),
          currency: currencyReceipts(),
          vat_rate: z.number().describe(ELEMENT_TEXTS.vat_rate).optional(),
          payment_account_number: paymentAccountNumber()
            .describe(ELEMENT_TEXTS.payment_account_number)
            .optional(),
          creditor_debtor: postingAccountNumber()
            .describe(ELEMENT_TEXTS.creditor_debtor)
            .optional(),
          payment_reference: boundedText(ELEMENT_TEXTS.payment_reference).optional(),
          date_delivery: dateValue(ELEMENT_TEXTS.date_delivery).optional(),
          date_payment_due: dateValue(ELEMENT_TEXTS.date_payment_due).optional(),
          link_to_receipt_id_by_customer: idByCustomer("des Belegs", "bb_receipts_search")
            .describe(ELEMENT_TEXTS.link_to_receipt_id_by_customer)
            .optional(),
        }),
        { description: CONTAINER_TEXT, maxItems: API_MAX_BATCH },
      ),
      transform: "object-list",
      itemFields: [
        {
          name: "receipt_type",
          apiNames: ["type"],
          source: "body",
          required: true,
          description: ELEMENT_TEXTS.receipt_type,
          schema: z.enum(RECEIPT_TYPES),
        },
        {
          name: "counterparty",
          apiNames: ["counterparty"],
          source: "body",
          required: true,
          description: ELEMENT_TEXTS.counterparty,
          schema: boundedText(ELEMENT_TEXTS.counterparty),
        },
        {
          name: "invoice_number",
          apiNames: ["invoice_number"],
          source: "body",
          required: true,
          description: ELEMENT_TEXTS.invoice_number,
          schema: boundedText(ELEMENT_TEXTS.invoice_number, 60),
        },
        {
          name: "date",
          apiNames: ["date"],
          source: "body",
          required: true,
          description: ELEMENT_TEXTS.date,
          schema: dateValue(ELEMENT_TEXTS.date),
        },
        {
          name: "amount",
          apiNames: ["amount"],
          source: "body",
          required: true,
          description: ELEMENT_TEXTS.amount,
          schema: amountValue(ELEMENT_TEXTS.amount),
        },
        {
          name: "currency",
          apiNames: ["currency"],
          source: "body",
          required: true,
          // Wortgleich mit dem Feld `currency` an bb_receipts_create (Regel R-A, Plan 4.5).
          description: RECEIPT_CURRENCY_SENTENCE,
          schema: currencyReceipts(),
        },
        {
          name: "vat_rate",
          apiNames: ["vat_rate"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.vat_rate,
          schema: z.number(),
        },
        {
          name: "payment_account_number",
          apiNames: ["account"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.payment_account_number,
          schema: paymentAccountNumber(),
        },
        {
          name: "creditor_debtor",
          apiNames: ["creditor_debtor"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.creditor_debtor,
          schema: postingAccountNumber(),
        },
        {
          name: "payment_reference",
          apiNames: ["payment_reference"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.payment_reference,
          schema: boundedText(ELEMENT_TEXTS.payment_reference),
        },
        {
          name: "date_delivery",
          apiNames: ["date_delivery"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.date_delivery,
          schema: dateValue(ELEMENT_TEXTS.date_delivery),
        },
        {
          name: "date_payment_due",
          apiNames: ["date_payment_due"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.date_payment_due,
          schema: dateValue(ELEMENT_TEXTS.date_payment_due),
        },
        {
          name: "link_to_receipt_id_by_customer",
          apiNames: ["link_to_receipt_id_by_customer"],
          source: "body",
          required: false,
          description: ELEMENT_TEXTS.link_to_receipt_id_by_customer,
          schema: idByCustomer("des Belegs", "bb_receipts_search"),
        },
      ],
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  responseContract: {
    // Begründung für den leeren Vertrag steht im Kopf dieser Datei.
    container: "none",
    fields: {},
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_search",
    // Dieser Aufruf trägt die Belegdaten nur je Element; die beiden Grenzen erscheinen im
    // Prüftext deshalb als nicht gesendet, und der Hinweis sagt, woher sie zu nehmen sind.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "die beiden Datumsgrenzen aus den Belegdaten des Stapels selbst setzen, list_direction " +
      "passend zur Belegart wählen und die Antwort mit den gesendeten Belegen abgleichen; ein " +
      "Stapel kann teilweise verarbeitet worden sein",
  },
  duplicateCheck: {
    tool: "bb_receipts_search",
    keyFields: ["date", "amount", "counterparty"],
    perBatch: true,
  },
  crossChecks: ["Q3", "Q4", "Q5", "Q6"],
  invalidatesCache: [],
};
