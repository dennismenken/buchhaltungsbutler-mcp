// Werkzeug 13, `/transactions/addBatch`: bis zu 50 Zahlungen in einem Aufruf anlegen.
// Klasse A, Wirkung anlegend, Pflichtsatz U4.
//
// **Keine Umformung.** Der Endpunkt führt genau einen Parameter `transactions`, Definition
// `Transactions`, und der ist bereits eine Objektliste. Der Behälter wird deshalb
// NICHT umbenannt, und die Deckung zweiter Stufe vergleicht die `apiNames` der `itemFields` mit
// den 13 Eigenschaften der Elementdefinition `Transaction`.
//
// **Regel R-A, Gleichlauf mit der Einzelform:** `currency` trägt hier denselben
// Baustein `currencyTransactions()` mit dem 48er-Enum, dieselbe Pflichtigkeit — nämlich
// optional, `Transaction.required` führt `currency` nicht — und wörtlich denselben
// Beschreibungstext wie an bb_transactions_create. P8 prüft den Satz an beiden
// Feldern. Belegstelle zum verworfenen Ein-Wert-Enum: `Transaction.currency` führt
// `enum: ["EUR"]` und widerspricht damit dem eigenen Beschreibungstext mit 48 Codes; das Enum
// wird verworfen wie das Platzhalterschema des `order`-Parameters.
//
// **Der Feldname `account` bleibt innerhalb eines Stapeleintrags unverändert.** Anhang A ist
// abschließend und führt die Umbenennung `account` → `payment_account_number` nur an
// `/receipts/add`, `/receipts/upload`, `/transactions/add` und `/transactions/get`. Wo eine
// Umbenennung innerhalb eines Stapelelements gilt, nennt der Anhang sie ausdrücklich (Zeilen
// „positions je Stapelelement"); für `/transactions/addBatch` tut er das nicht. Die
// Feldbeschreibung nennt deshalb beide Namen, damit der Unterschied zur Einzelform nicht
// stillschweigend bleibt.

import { batchContainer } from "../../schema/batch.js";
import { API_MAX_BATCH } from "../../schema/line-items.js";
import { boundedText, strictObject } from "../../schema/primitives.js";
import {
  TRANSACTION_CURRENCY_SENTENCE,
  amountIn,
  currencyTransactions,
  dateTime,
  paymentAccountNumber,
} from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const ACCOUNT_DESCRIPTION =
  "Sachkontonummer, die ein Zahlungskonto bezeichnet, zum Beispiel '1200'. Nicht das " +
  "Sachkonto, auf das gebucht wird. Zahlungskonten auflisten mit bb_payment_accounts_list. " +
  "Innerhalb eines Stapeleintrags trägt das Feld den Namen der Spezifikation; " +
  "bb_transactions_create nennt dasselbe Feld payment_account_number.";

const TO_FROM_DESCRIPTION = "Zahlender oder Empfänger der Zahlung, zum Beispiel 'Muster GmbH'.";

const ACCOUNT_NUMBER_DESCRIPTION =
  "Kontonummer oder IBAN der Gegenseite, zum Beispiel 'DE02120300000000202051'.";

const BANK_CODE_DESCRIPTION = "Bankleitzahl oder BIC der Gegenseite, zum Beispiel 'BYLADEM1001'.";

const BANK_NAME_DESCRIPTION = "Name der Bank der Gegenseite.";

// Zu `purpose` und `booking_text`: Die Spezifikation erlaubt dort einen leeren String, Q3 lehnt
// ihn an jedem Feld ab. Der Satz nennt deshalb das Weglassen als richtigen Weg.
const PURPOSE_DESCRIPTION =
  "Verwendungszweck der Zahlung. Soll er leer bleiben, das Feld weglassen: Dieser Server " +
  "lehnt leere Strings an jedem Feld ab, auch wo die Spezifikation sie zulässt.";

const BOOKING_TEXT_DESCRIPTION =
  "Buchungstext der Zahlung, zum Beispiel 'SEPA-Überweisung'. Soll er leer bleiben, das Feld " +
  "weglassen.";

const TYPE_DESCRIPTION =
  "Art der Zahlung als Freitext, zum Beispiel 'Direct debit'. Der Name type ist in der " +
  "Spezifikation mehrfach mit anderer Bedeutung belegt.";

const PAYMENT_REFERENCE_DESCRIPTION =
  "Zahlungsreferenz des Vorgangs. Trifft sie zu, ordnet BuchhaltungsButler die angelegte " +
  "Zahlung dem passenden Beleg selbst zu.";

const AMOUNT = amountIn(
  "Betrag der Zahlung, positiv für einen Eingang und negativ für einen Ausgang",
);
const BOOKING_DATE = dateTime("Buchungsdatum der Zahlung");
const VALUE_DATE = dateTime("Wertstellungsdatum der Zahlung");
const VALUE_DATE_DESCRIPTION = `${VALUE_DATE.description ?? ""} Ohne Angabe übernimmt BuchhaltungsButler den Wert von booking_date.`;

/** Ein Stapeleintrag: dieselben 13 Felder wie `Transaction` in der Spezifikation. */
const TRANSACTION_ITEM = strictObject({
  account: paymentAccountNumber().describe(ACCOUNT_DESCRIPTION),
  to_from: boundedText(TO_FROM_DESCRIPTION),
  amount: AMOUNT,
  booking_date: BOOKING_DATE,
  value_date: VALUE_DATE.describe(VALUE_DATE_DESCRIPTION).optional(),
  account_number: boundedText(ACCOUNT_NUMBER_DESCRIPTION).optional(),
  bank_code: boundedText(BANK_CODE_DESCRIPTION).optional(),
  bank_name: boundedText(BANK_NAME_DESCRIPTION).optional(),
  purpose: boundedText(PURPOSE_DESCRIPTION).optional(),
  type: boundedText(TYPE_DESCRIPTION).optional(),
  booking_text: boundedText(BOOKING_TEXT_DESCRIPTION).optional(),
  payment_reference: boundedText(PAYMENT_REFERENCE_DESCRIPTION).optional(),
  currency: currencyTransactions().optional(),
});

// `maxItems` wird ausdrücklich mit API_MAX_BATCH gebaut und nicht über `batchLimit()` aus der
// Konfiguration geholt: Dieser Eintrag entsteht beim Laden des Moduls, und zu diesem Zeitpunkt
// ist die Konfiguration noch nicht aufgelöst — `getConfig()` würde werfen.
// Die wirksame Grenze `min(50, BB_MCP_MAX_BATCH)` prüfen Q4 beim Bau des Schemas und Guard 5
// vor dem Request.
const TRANSACTIONS_CONTAINER = batchContainer("bb_transactions_create_batch", TRANSACTION_ITEM, {
  description:
    "Die Zahlungen, die angelegt werden sollen. Ein Eintrag trägt dieselben Felder wie " +
    "bb_transactions_create; dort heißt account allerdings payment_account_number.",
  maxItems: API_MAX_BATCH,
});

/** Die 13 Felder eines Stapeleintrags; die `apiNames` zielen auf `Transaction`. */
const ITEM_FIELDS: FieldSpec[] = [
  {
    name: "account",
    apiNames: ["account"],
    source: "body",
    required: true,
    description: ACCOUNT_DESCRIPTION,
    schema: paymentAccountNumber().describe(ACCOUNT_DESCRIPTION),
  },
  {
    name: "to_from",
    apiNames: ["to_from"],
    source: "body",
    required: true,
    description: TO_FROM_DESCRIPTION,
    schema: boundedText(TO_FROM_DESCRIPTION),
  },
  {
    name: "amount",
    apiNames: ["amount"],
    source: "body",
    required: true,
    description: AMOUNT.description ?? "",
    schema: AMOUNT,
  },
  {
    name: "booking_date",
    apiNames: ["booking_date"],
    source: "body",
    required: true,
    description: BOOKING_DATE.description ?? "",
    schema: BOOKING_DATE,
  },
  {
    name: "value_date",
    apiNames: ["value_date"],
    source: "body",
    required: false,
    description: VALUE_DATE_DESCRIPTION,
    schema: VALUE_DATE.describe(VALUE_DATE_DESCRIPTION),
  },
  {
    name: "account_number",
    apiNames: ["account_number"],
    source: "body",
    required: false,
    description: ACCOUNT_NUMBER_DESCRIPTION,
    schema: boundedText(ACCOUNT_NUMBER_DESCRIPTION),
  },
  {
    name: "bank_code",
    apiNames: ["bank_code"],
    source: "body",
    required: false,
    description: BANK_CODE_DESCRIPTION,
    schema: boundedText(BANK_CODE_DESCRIPTION),
  },
  {
    name: "bank_name",
    apiNames: ["bank_name"],
    source: "body",
    required: false,
    description: BANK_NAME_DESCRIPTION,
    schema: boundedText(BANK_NAME_DESCRIPTION),
  },
  {
    name: "purpose",
    apiNames: ["purpose"],
    source: "body",
    required: false,
    description: PURPOSE_DESCRIPTION,
    schema: boundedText(PURPOSE_DESCRIPTION),
  },
  {
    name: "type",
    apiNames: ["type"],
    source: "body",
    required: false,
    description: TYPE_DESCRIPTION,
    schema: boundedText(TYPE_DESCRIPTION),
  },
  {
    name: "booking_text",
    apiNames: ["booking_text"],
    source: "body",
    required: false,
    description: BOOKING_TEXT_DESCRIPTION,
    schema: boundedText(BOOKING_TEXT_DESCRIPTION),
  },
  {
    name: "payment_reference",
    apiNames: ["payment_reference"],
    source: "body",
    required: false,
    description: PAYMENT_REFERENCE_DESCRIPTION,
    schema: boundedText(PAYMENT_REFERENCE_DESCRIPTION),
  },
  {
    name: "currency",
    apiNames: ["currency"],
    source: "body",
    required: false,
    description: TRANSACTION_CURRENCY_SENTENCE,
    schema: currencyTransactions(),
  },
];

export const bb_transactions_create_batch: ToolEntry = {
  name: "bb_transactions_create_batch",
  title: "Zahlungen im Stapel anlegen",
  group: "transactions",
  path: { literal: "/transactions/addBatch" },
  effect: "create",
  toolClass: "A",
  tier: 3,
  mandatorySentence: "U4",
  description:
    "Legt bis zu 50 Zahlungen in BuchhaltungsButler in einem Aufruf an. Fachlich gleich " +
    "bb_transactions_create, dessen Beschreibung die Felder erklärt; für eine einzelne Zahlung " +
    "dieses Werkzeug nicht nehmen. Die API erlaubt nur einen Aufruf je fünf Sekunden. " +
    "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen " +
    "Endpunkt, das rückgängig zu machen.",
  fields: [
    {
      name: "transactions",
      apiNames: ["transactions"],
      source: "body",
      required: true,
      // Die Beschreibung des Bausteins wird wörtlich übernommen, damit der Satz zur
      // Mengengrenze erhalten bleibt; ein eigener Text würde ihn überschreiben (build.ts).
      description: TRANSACTIONS_CONTAINER.description ?? "",
      schema: TRANSACTIONS_CONTAINER,
      transform: "object-list",
      itemFields: ITEM_FIELDS,
    },
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  // Die Erfolgsantwort trägt auf oberster Ebene die Listen `transactions` und `errors`.
  // `ContractFieldType` kennt keinen Typ für eine Liste; mit einem leeren Vertrag
  // laufen beide Felder als unbekannt unverändert durch, statt bei
  // jedem erfolgreichen Aufruf zwei `_contract_warnings` zu erzeugen.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_transactions_search",
    // Auf oberster Ebene trägt dieser Aufruf kein to_from: Die Werte stehen je Eintrag in
    // transactions. Der Text setzt dort deshalb „nicht gesendet" ein, und der Hinweis nennt
    // die Quelle. Erfunden wird nichts.
    argsFrom: { to_from: "to_from" },
    hint:
      "je Eintrag des Stapels to_from, booking_date und amount von dort übernehmen und damit " +
      "suchen; jeder Eintrag ist einzeln zu prüfen",
  },
  duplicateCheck: {
    tool: "bb_transactions_search",
    keyFields: ["booking_date", "amount", "to_from"],
    perBatch: true,
  },
  crossChecks: ["Q3", "Q4", "Q5"],
  invalidatesCache: [],
};
