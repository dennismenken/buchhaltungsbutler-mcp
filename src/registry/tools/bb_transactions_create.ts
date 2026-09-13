// Werkzeug 12, `/transactions/add`: eine Zahlung auf einem echten Zahlungskonto anlegen
// (Plan 3.8, AP12b). Klasse A, Wirkung anlegend, Pflichtsatz U4.
//
// Drei Festlegungen des Plans stehen hier als Code:
//
//   1. **`currency` bleibt optional** (Plan 4.3, 4.5 Zeile 4). Die Verschärfung des
//      Entwurfsstandes ist zurückgenommen: Die Spezifikation beschreibt `amount` wörtlich als
//      Betrag „in the account's currency", und kein Endpunkt der API gibt die Währung eines
//      Zahlungskontos preis — `/accounts/get` liefert je Konto nur `name` und
//      `postingaccount_number`. Ein Pflichtfeld hätte den Aufrufer zum Raten gezwungen, und ein
//      geratener Wert erzeugt hier eine Fremdwährungszahlung, die über die API nicht mehr zu
//      löschen ist (U4). Ersatz ist der Pflichtsatz aus 4.3 in der Feldbeschreibung, den P8 an
//      diesem Feld und an dem von bb_transactions_create_batch prüft.
//   2. **Der Wertevorrat ist das 48er-Enum** aus `currencyTransactions()`: die 47 an diesem
//      Endpunkt ausgeschriebenen Codes plus `RSD` aus dem Stapelelement. Nach Regel R-B gilt
//      die Vereinigung, weil ein zu enges Enum gültige Vorgänge unsichtbar vor dem Request
//      ablehnt. Belegstelle zum verworfenen Ein-Wert-Enum: Die Definition `Transaction` führt
//      `currency` mit `enum: ["EUR"]` und widerspricht damit ihrem eigenen Beschreibungstext
//      mit 48 Codes; dieses Enum wird verworfen wie das Platzhalterschema des
//      `order`-Parameters (Plan 0.5 Korrektur 2, Anhang B Punkt 47).
//   3. **Regel R-A, Gleichlauf mit der Stapelform:** Dasselbe Feld trägt an
//      bb_transactions_create_batch denselben Baustein, dieselbe Pflichtigkeit und denselben
//      Beschreibungstext (Plan 4.5).
//
// Die Umbenennung `account` → `payment_account_number` ist die Zeile aus Anhang A: Der
// Parameter erwartet eine Sachkontonummer, meint aber ein Zahlungskonto (Plan 3.4).

import { boundedText } from "../../schema/primitives.js";
import {
  TRANSACTION_CURRENCY_SENTENCE,
  amountIn,
  currencyTransactions,
  dateTime,
  paymentAccountNumber,
} from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const AMOUNT = amountIn(
  "Betrag der Zahlung, positiv für einen Eingang und negativ für einen Ausgang",
);
const BOOKING_DATE = dateTime("Buchungsdatum der Zahlung");
const VALUE_DATE = dateTime("Wertstellungsdatum der Zahlung");

const PAYMENT_ACCOUNT_DESCRIPTION =
  "Sachkontonummer, die ein Zahlungskonto bezeichnet, zum Beispiel '1200'. Nicht das " +
  "Sachkonto, auf das gebucht wird. Zahlungskonten auflisten mit bb_payment_accounts_list. " +
  "Das Konto muss im Mandanten als Zahlungskonto vorhanden sein. Der Body-Parameter der API " +
  "heißt account.";

const TO_FROM_DESCRIPTION = "Zahlender oder Empfänger der Zahlung, zum Beispiel 'Muster GmbH'.";

const ACCOUNT_NUMBER_DESCRIPTION =
  "Kontonummer oder IBAN der Gegenseite, zum Beispiel 'DE02120300000000202051'.";

const BANK_CODE_DESCRIPTION = "Bankleitzahl oder BIC der Gegenseite, zum Beispiel 'BYLADEM1001'.";

const BANK_NAME_DESCRIPTION = "Name der Bank der Gegenseite.";

// Die Spezifikation erlaubt an `purpose` und `booking_text` ausdrücklich einen leeren String.
// Q3 lehnt leere Strings an jedem Feld ab (Plan 4.7); der Satz nennt deshalb das Weglassen als
// den Weg, einen Vorgang ohne Verwendungszweck anzulegen.
const PURPOSE_DESCRIPTION =
  "Verwendungszweck der Zahlung. Soll er leer bleiben, das Feld weglassen: Dieser Server " +
  "lehnt leere Strings an jedem Feld ab, auch wo die Spezifikation sie zulässt.";

const BOOKING_TEXT_DESCRIPTION =
  "Buchungstext der Zahlung, zum Beispiel 'SEPA-Überweisung'. Soll er leer bleiben, das Feld " +
  "weglassen.";

const TYPE_DESCRIPTION =
  "Art der Zahlung als Freitext, zum Beispiel 'Direct debit'. Der Body-Parameter der API heißt " +
  "type; dieser Name ist in der Spezifikation mehrfach mit anderer Bedeutung belegt.";

const PAYMENT_REFERENCE_DESCRIPTION =
  "Zahlungsreferenz des Vorgangs. Trifft sie zu, ordnet BuchhaltungsButler die angelegte " +
  "Zahlung dem passenden Beleg selbst zu.";

export const bb_transactions_create: ToolEntry = {
  name: "bb_transactions_create",
  title: "Zahlung anlegen",
  path: { literal: "/transactions/add" },
  effect: "create",
  toolClass: "A",
  tier: 1,
  mandatorySentence: "U4",
  description:
    "Legt in BuchhaltungsButler eine Zahlung auf einem echten Zahlungskonto an, also einen " +
    "Kontoumsatz. Zu nehmen für Vorgänge, die kein Bankabruf einspielt, zum Beispiel eine " +
    "Barzahlung über 47.60 auf dem Kassenkonto. Buchungssätze entstehen dabei nicht: Die legt " +
    "bb_postings_create_for_transaction an, und einen Beleg verknüpft " +
    "bb_transactions_assign_receipt. payment_account_number bezeichnet das Zahlungskonto und " +
    "nicht das Sachkonto der Buchung. Der Umsatz verändert Kontostand und Abstimmung sofort. " +
    "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen " +
    "Endpunkt, das rückgängig zu machen.",
  fields: [
    {
      name: "payment_account_number",
      apiNames: ["account"],
      source: "body",
      required: true,
      description: PAYMENT_ACCOUNT_DESCRIPTION,
      schema: paymentAccountNumber(),
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
      description: `${VALUE_DATE.description ?? ""} Ohne Angabe übernimmt BuchhaltungsButler den Wert von booking_date.`,
      schema: VALUE_DATE,
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
      name: "transaction_type",
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
    // Optional, und das ist eine Entscheidung mit Begründung: siehe Punkt 1 im Dateikopf.
    // Der Beschreibungstext ist wörtlich derselbe wie an bb_transactions_create_batch (R-A).
    {
      name: "currency",
      apiNames: ["currency"],
      source: "body",
      required: false,
      description: TRANSACTION_CURRENCY_SENTENCE,
      schema: currencyTransactions(),
    },
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Die Erfolgsantwort trägt die Kennung der angelegten Zahlung auf oberster Ebene und nicht
  // unter `data` (Spezifikation `TransactionsAdd_Success`), deshalb container "none".
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_transactions_search",
    argsFrom: { to_from: "to_from" },
    hint:
      "den Zeitraum über date_from und date_to auf den Tag aus booking_date {booking_date} " +
      "eingrenzen; die angelegte Zahlung ist an amount {amount} zu erkennen",
  },
  // Der fachliche Schlüssel einer Zahlung. Er ist tragfähig, weil die Liste genau diese drei
  // Felder liefert (Plan 0.3 Befund L2); verglichen wird der Betrag in Ganzzahl-Cent.
  duplicateCheck: {
    tool: "bb_transactions_search",
    keyFields: ["booking_date", "amount", "to_from"],
    perBatch: true,
  },
  crossChecks: ["Q3", "Q5"],
  invalidatesCache: [],
};
