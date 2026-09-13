import { describe, expect, it } from "vitest";

import {
  countCatalogPairs,
  type ErrorClass,
  EXPECTED_PAIR_COUNT,
  EXPECTED_PATH_COUNT,
  listCatalogPairs,
  loadErrorCatalog,
} from "../../src/errors/catalog.js";
import { THROTTLE_ERROR_CODE, THROTTLE_PATHS } from "../../src/errors/classify.js";

// =========================================================================================
// DIE HANDPRÜFUNG DER SPALTE `cls` (Plan 5.6, R12, AP08)
//
// Die Klassenspalte des Katalogs wird beim Erzeugen aus dem Meldungstext VORGESCHLAGEN
// (scripts/gen-errors.ts) und ist anschließend von Hand zu prüfen, weil die Ableitung bei den
// Sonderfällen falsch liegt. Diese Datei IST diese Prüfung: Sie ist im Diff sichtbar, sie
// nennt jeden geprüften Text beim Namen, und sie schlägt fehl, sobald sich eine Einstufung
// ändert, ohne dass jemand diese Datei anfasst.
//
// Geprüft am 2026-09-12 gegen src/generated/errors.ts, docs/api/fehlercodes.md und
// docs/openapi/buchhaltungsbutler-v1.json.
//
// PRÜFWEG. Die Klasse hängt am Paar (Pfad, error_code), aber nur EIN Text der 263 im Katalog
// vorkommenden Meldungstexte trägt an verschiedenen Pfaden verschiedene Klassen. Die Prüfung
// ist deshalb zweistufig: eine Tabelle Text → Klasse über alle 263 Texte, dazu eine
// Ausnahmeliste für die Paare, bei denen der Pfad die Klasse kippt. Zusammen decken beide
// Tabellen alle 786 Paare ab; der Test rechnet das nach und lässt keinen Text unerwähnt.
//
// BEFUND DER PRÜFUNG, in vier Punkten:
//
// 1. Die Einstufungen, an denen etwas hängt, sind richtig. Vorübergehend ist genau das, was
//    vorübergehend ist: Code 0 mit HTTP 500, Code 30 mit HTTP 504 und Code 15 an den zehn
//    Pfaden mit HTTP 403. Kein Text, der eine Drosselung oder eine Wartelage benennt, steht in
//    einer anderen Klasse, und kein Text in `transient` benennt einen Dauerzustand. Damit ist
//    die einzige Einstufung, die ein FALSCHES Verhalten auslösen könnte — Retry ja oder nein —
//    vollständig gegengelesen.
// 2. `config` enthält genau die Codes 3, 4 und 11 sowie die vier belegten „not activated"-Texte.
//    Kein Zugangs- oder Aktivierungsfall ist in `input` oder `final` gerutscht; das ist der
//    zweite Fall, in dem eine falsche Klasse den Agenten in die falsche Richtung schickte.
// 3. Die Grenze zwischen `input` und `final` ist an einigen Stellen eine Auslegung und keine
//    Tatsache. Beide Klassen verbieten die Wiederholung mit denselben Werten; sie
//    unterscheiden sich nur im Rat. Die Grenzfälle sind unten bei der jeweiligen Zeile
//    vermerkt und bewusst so belassen.
// 4. Eine Ungereimtheit ist erfasst und nicht geändert: Texte der Form „X not found" stehen in
//    `final`, Texte der Form „no X found" in `input`, obwohl beide dasselbe meinen können. Die
//    Folge ist ein anderer Ratschlag, nicht ein anderes Verhalten. Belassen, weil bei „no X
//    found" die beanstandete Kennung aus den Argumenten stammt und der Rat „diesen Wert
//    korrigieren" dort zutrifft. Gemeldet an AP03, weil die Tabelle dort erzeugt wird.
//
// Die vier Sonderfälle aus 5.6 und die elf Paare mit error_code 15 sind weiter unten einzeln
// abgehakt.
// =========================================================================================

/**
 * Alle 263 Meldungstexte des Katalogs mit der geprüften Klasse.
 *
 * Die Zahl hinter jeder Zeile ist die Zahl der Paare, die diesen Text tragen. Sie ist eine
 * Prüfgröße und keine Zierde: Ein Text, der plötzlich an mehr Pfaden auftaucht, ist eine
 * geänderte Spezifikation.
 */
const REVIEWED_TEXTS: ReadonlyMap<string, ErrorClass> = new Map([
  // --- config: 8 Texte ---
  ["API credentials unknown or invalid", "config"], // 54 — Code 3, endpunktübergreifend.
  ["creditor posting is not activated", "config"], // 1 — einer der vier belegten not-activated-Texte.
  ["creditors are not activated for the customer", "config"], // 2 — einer der vier belegten not-activated-Texte.
  ["customer has no active status", "config"], // 54 — Code 11, endpunktübergreifend.
  ["customer not found or insufficient privileges", "config"], // 35 — Code 4, endpunktübergreifend.
  ["customer not found or invalid api client for customer or insufficient privileges", "config"], // 19 — zweiter Wortlaut zu Code 4.
  ["debtor posting is not activated", "config"], // 1 — einer der vier belegten not-activated-Texte.
  ["debtors are not activated for the customer", "config"], // 2 — einer der vier belegten not-activated-Texte.
  // --- transient: 5 Texte ---
  ["a timeout occurred while processing the request", "transient"], // 51 — Code 30 mit HTTP 504.
  ["adding temporarily restricted", "transient"], // 9 — neun der zehn Drosselungspfade; unten einzeln abgehakt.
  ["error while processing the request", "transient"], // 54 — Code 0 mit HTTP 500.
  ["timeout", "transient"], // 3 — Kurzform derselben Bedeutung wie der lange Text; Code 30, HTTP 504.
  ["upload temporarily restricted", "transient"], // 1 — der zehnte Drosselungspfad.
  // --- special: 5 Texte ---
  ["invalid booking text specified", "special"], // 1 — Definition deklariert error_code 23 statt 24; ohne Text nicht unterscheidbar.
  ["invalid e_invoice_id specified", "special"], // 1 — Definition deklariert error_code 42 statt 41; ohne Text nicht unterscheidbar.
  ["invalid e_invoice_type specified", "special"], // 1 — einen Parameter dieses Namens führt der Endpunkt nicht.
  ["report generation already in progress", "special"], // 2 — Sonderfall 3: laufende Erzeugung nicht verwerfen.
  ["report generation has not been finished yet", "special"], // 2 — Sonderfall 1: Zwischenstand, kein Fehler.
  // --- final: 68 Texte ---
  ["a receipt linked to the transaction has already been posted", "final"], // 1
  ["a receipt of type '<type>' cannot be assigned to a creditor account", "final"], // 2
  ["a receipt of type '<type>' cannot be assigned to a debtor account", "final"], // 2
  ["a transaction linked to the receipt has already been posted", "final"], // 1
  ["account specified does not exist for the customer", "final"], // 3
  ["assignment failed", "final"], // 1
  ["cost location may not be deleted", "final"], // 1
  ["cost location was not found", "final"], // 2
  ["creditor/debtor specified does not exist for the customer", "final"], // 2
  ["customer has reached the upload limit", "final"], // 3 — Tarifkontingent, Sonderfall 4; kein Minutenlimit.
  ["expected account type by receipt does not match the creditor/debtor account's type", "final"], // 1
  ["invalid postingaccount_credit specified or postingaccount_credit is not available", "final"], // 1 — grenznah: wie die Zeile zum Sollkonto.
  ["invalid postingaccount_debit specified or postingaccount_debit is not available", "final"], // 1 — grenznah: nennt zwei Lesarten; die Zustandslesart nennt den Prüfaufruf.
  ["Posting cannot be cancelled.", "final"], // 1
  ["Posting could not be cancelled.", "final"], // 1
  ["Posting is fixed and cannot be unconfirmed.", "final"], // 1
  ["posting not found", "final"], // 2
  ["Posting not found.", "final"], // 2
  ["postingaccount was not found", "final"], // 1
  ["postings are not allowed on receipts without currency", "final"], // 1
  ["postings with foreign currencies are not allowed", "final"], // 1
  ["receipt can´t be marked as deleted - fixed postings exist", "final"], // 1
  ["receipt could not be removed from transaction, because of a confirmed posting.", "final"], // 1
  ["receipt has fixed postings that cannot be unconfirmed", "final"], // 1
  ["receipt has no postings to unconfirm", "final"], // 1
  ["receipt is already deleted", "final"], // 1
  ["receipt is deleted", "final"], // 2
  ["receipt is not marked as deleted", "final"], // 1
  ["receipt not found", "final"], // 4
  ["Receipt not found.", "final"], // 1
  ["receipt not processable", "final"], // 1
  ["receipt ocr processing failed", "final"], // 1
  ["receipt was not found", "final"], // 1
  ["report was not found", "final"], // 2 — Sonderfall 2: die Erzeugung ist die Vorbedingung.
  ["restoration of receipt failed", "final"], // 1
  ["specified postingaccount_credit cannot posted manually", "final"], // 1
  ["specified postingaccount_debit cannot posted manually", "final"], // 1
  ['the account "%account_number%" must be posted with vat option "%vat_option%"', "final"], // 1
  [
    'the account "%account_number%";"%account_name%" must be posted with/without "%vat_class%"',
    "final",
  ], // 1
  [
    'The account "%postinaccount_number%; %postingaccount_name%" must be posted with value added tax / with pre tax / without value added tax',
    "final",
  ], // 1
  [
    'the account "%postingaccount_number%; %postingsccount_name%" must be posted with/without %vat_class%',
    "final",
  ], // 1
  ['The account %postingaccount_number% must be posted with vat option "%vat_option%"', "final"], // 1
  ["The account %postingaccount_number% must be posted with vat option %vat_option%", "final"], // 1
  [
    "the parent_postingaccount_number is not valid or is not available due to your settings or was added manually",
    "final",
  ], // 1
  ["the postingaccount_number already exists", "final"], // 1
  ["the postingaccount_number already exists or is not available due to your settings", "final"], // 1
  ["the receipt has already created a transaction", "final"], // 1
  ["the receipt is not valid, please complete the data", "final"], // 1
  ["the specified creditor/debtor is invalid", "final"], // 1
  ["the specified name already exists", "final"], // 2
  ["the specified postingaccount cannot be booked manually", "final"], // 2
  ["the specified postingaccount is not available", "final"], // 2
  ["the specified postingaccount is not valid", "final"], // 2
  ["the tax key is invalid for specified account combination", "final"], // 1
  ["the total amount of all postings does not match the receipt amount", "final"], // 1 — Betragsprüfung, nach 5.6 final.
  ["the total amount of all postings does not match the transaction amount", "final"], // 1 — Betragsprüfung, nach 5.6 final.
  ["the total amount of all postings is invalid", "final"], // 2 — Betragsprüfung, nach 5.6 final.
  ["the type of the receipt does not allow postings", "final"], // 1
  [
    'The vat option for account "%postinaccount_number%; %postingaccount_name%" is invalid',
    "final",
  ], // 1
  [
    'the vat option for account "%postingaccount_number%; %postingsccount_name%" is invalid',
    "final",
  ], // 1
  ["the vat option is not available for this date", "final"], // 1
  ["transaction has fixed postings that cannot be unconfirmed", "final"], // 1
  ["transaction has no postings to unconfirm", "final"], // 1
  ["transaction not found", "final"], // 4
  ["Transaction not found.", "final"], // 1
  ["transaction was not found", "final"], // 1
  ["vat option unavailable due to current settings", "final"], // 3 — Zustand einer Kontoeinstellung, nicht ein gesendeter Wert.
  ["vat option unavailable with 'not liable to sales tax' setting", "final"], // 3 — Zustand einer Kontoeinstellung.
  // --- input: 177 Texte ---
  ["either transaction_id_by_customer or receipt_id_by_customer should be specified", "input"], // 1
  ["file name is not specified", "input"], // 1
  ["file type not accepted", "input"], // 1
  [
    "for each partial posting, one or no receipt has to be specified explicitly via oi_receipts_ids_by_customer",
    "input",
  ], // 1
  ['foreign currencies can only be posted to account "%account_number%"', "input"], // 1
  ["foreign currencies can only be posted to account %postingaccount_number%", "input"], // 1
  ["invalid account number specified", "input"], // 1
  ["invalid account specified", "input"], // 5
  ["invalid additional_addressline specified", "input"], // 7
  ["invalid amount specified", "input"], // 6
  ["invalid archive_export specified", "input"], // 1
  ["invalid assignment type specified", "input"], // 2
  ["invalid bank code specified", "input"], // 1
  ["invalid bank name specified", "input"], // 1
  ["invalid base specified", "input"], // 2
  ["invalid bic specified", "input"], // 4
  ["invalid booking date specified", "input"], // 1
  ["invalid city specified", "input"], // 3
  ["invalid code specified", "input"], // 2
  ["invalid comment_text specified", "input"], // 1
  ["invalid company_name specified", "input"], // 3
  ["invalid confirmed_only specified", "input"], // 2
  ["invalid contact_person_name specified", "input"], // 7
  ["invalid correspondence specified", "input"], // 3
  ["invalid cost_location specified", "input"], // 1
  ["invalid counterparty specified", "input"], // 3
  ["invalid country specified", "input"], // 7
  ["invalid creditor/debtor specified", "input"], // 2
  ["invalid currency specified", "input"], // 3
  ["invalid customer_number specified", "input"], // 5
  ["invalid date delivery specified", "input"], // 2
  ["invalid date specified", "input"], // 6
  ["invalid date_from specified", "input"], // 6
  ["invalid date_last_action_from specified", "input"], // 1
  ["invalid date_last_action_to specified", "input"], // 1
  ["invalid date_of_supply specified", "input"], // 3
  ["invalid date_payment_due specified", "input"], // 2
  ["invalid date_since_last_modified specified", "input"], // 2
  ["invalid date_to specified", "input"], // 6
  ["invalid deleted specified", "input"], // 1
  ["invalid discount_type specified", "input"], // 3
  ["invalid discount_value specified", "input"], // 3
  ["invalid due in days specified", "input"], // 2
  ["invalid due_date specified", "input"], // 1
  ["invalid due_days specified", "input"], // 2
  ["invalid email specified", "input"], // 7
  ["invalid exclude_accounts specified", "input"], // 1
  ["invalid exclude_creditors specified", "input"], // 1
  ["invalid exclude_debtors specified", "input"], // 1
  ["invalid exclude_postingaccounts specified", "input"], // 1
  ["invalid file_csv specified", "input"], // 1
  ["invalid file_pdf specified", "input"], // 1
  ["invalid final_provisions specified", "input"], // 3
  ["invalid get_file specified", "input"], // 1
  ["invalid get_files specified", "input"], // 2
  ["invalid iban specified", "input"], // 4
  ["invalid id_by_customer specified", "input"], // 4
  ["invalid id_by_customer_from specified", "input"], // 1
  ["invalid id_by_customer_to specified", "input"], // 1
  ["invalid include_offers specified", "input"], // 1
  ["invalid invoice number specified", "input"], // 2
  ["invalid invoicenumber specified", "input"], // 3
  ["invalid is_revision_safe specified", "input"], // 1
  ["invalid item_amount specified", "input"], // 2
  ["invalid item_name specified", "input"], // 2
  ["invalid item_tax_amount specified", "input"], // 1
  ["invalid item_tax_type specified", "input"], // 1
  ["invalid item_unit specified", "input"], // 2
  ["invalid item_vat specified", "input"], // 1
  ["invalid language specified, allowed values: de_DE, en_US", "input"], // 3
  ["invalid limit specified", "input"], // 5
  ["invalid link_to_receipt_id_by_customer specified", "input"], // 2
  ["invalid list_direction specified", "input"], // 1
  ["invalid name specified", "input"], // 9
  ["invalid offset specified", "input"], // 5
  ["invalid or not existing parameters", "input"], // 2
  ["invalid order specified", "input"], // 2
  ["invalid parent_postingaccount_number specified", "input"], // 1
  ["invalid payment recipient or sender (to_from) specified", "input"], // 1
  ["invalid payment reference specified", "input"], // 3
  ["invalid payment_conditions specified", "input"], // 3
  ["invalid payment_status specified", "input"], // 1
  ["invalid posting type specified", "input"], // 3
  ["invalid posting_status specified", "input"], // 1
  ["invalid postingaccount flag specified", "input"], // 1
  ["invalid postingaccount_number specified", "input"], // 5
  ["invalid purpose specified", "input"], // 1
  ["invalid receipt_creates_transaction specified", "input"], // 1
  ["invalid receipt_id_by_customer specified", "input"], // 2
  ["invalid recurring_date_next specified", "input"], // 3
  ["invalid recurring_interval specified", "input"], // 3
  ["invalid report_id_by_customer specified", "input"], // 2
  ["invalid sales_tax_id specified", "input"], // 4
  ["invalid settings type specified", "input"], // 8
  ["invalid show_bankdata specified", "input"], // 3
  ["invalid show_contactdata specified", "input"], // 3
  ["invalid show_prices_type specified", "input"], // 3
  ["invalid sort field specified", "input"], // 1 — das elfte Paar mit Code 15; live kam ein dritter Text (L6).
  ["invalid sort value specified", "input"], // 1
  ["invalid street specified", "input"], // 11
  ["invalid tax key specified", "input"], // 2
  ["invalid to_from specified", "input"], // 1
  ["invalid transaction_id_by_customer specified", "input"], // 2
  ["invalid type specified", "input"], // 9
  ["invalid unconfirm type specified", "input"], // 3
  ["invalid value date specified", "input"], // 1
  [
    'invalid vat option for given account "%postinaccount_number%; %postingaccount_name%" specified',
    "input",
  ], // 1
  ["invalid vat option for given account specified", "input"], // 1
  ["invalid vat rate specified", "input"], // 2
  ["invalid vat specified", "input"], // 1
  ["invalid zip specified", "input"], // 7
  ["maximum file size is <max>MB", "input"], // 1 — Grenze; render.ts nennt dazu das billigere Aufrufmuster.
  ["maximum number of pages is <max>", "input"], // 1 — Grenze; render.ts nennt dazu das billigere Aufrufmuster.
  ["no account specified", "input"], // 1
  ["no amount specified", "input"], // 1
  ["No amount specified", "input"], // 1
  ["no booking date specified", "input"], // 1
  ["no comment_text is specified", "input"], // 1
  ["no cost location code specified", "input"], // 2
  ["no creditor found for specified postingaccount_number", "input"], // 1 — grenznah zu final, siehe Befund 4 im Kopf.
  ["no date specified", "input"], // 1
  ["no debtor found for specified postingaccount_number", "input"], // 1 — grenznah zu final, siehe Befund 4 im Kopf.
  ["no file provided", "input"], // 1
  ["no items specified", "input"], // 3
  ["no name specified", "input"], // 3
  ["no or invalid receipt_id_by_customer specified", "input"], // 1
  ["no or invalid transaction_id_by_customer specified", "input"], // 1
  ["no parent_postingaccount_number specified", "input"], // 1
  ["no payment recipient or sender (to_from) specified", "input"], // 1
  ["no post and files content received or declined", "input"], // 21 — an /transactions/add special, siehe PAIR_EXCEPTIONS.
  ["no postingaccount found for specified postingaccount_number", "input"], // 1 — grenznah zu final, siehe Befund 4 im Kopf.
  ["no postingaccount number specified", "input"], // 2
  ["no postingaccount_credit specified", "input"], // 1
  ["no postingaccount_debit specified", "input"], // 1
  ["no postingaccount_number specified", "input"], // 2
  ["no postingtext specified", "input"], // 1
  ["no receipt found", "input"], // 3 — grenznah zu final, siehe Befund 4 im Kopf.
  ["no receipts assigned to transaction", "input"], // 1 — grenznah: Zustand der Zahlung; der Rat auf die Kennung passt trotzdem.
  ["No receipts found", "input"], // 1 — leerer Stapel, also wirklich eine Eingabeprüfung.
  ["no transaction found", "input"], // 1 — grenznah zu final, siehe Befund 4 im Kopf.
  ["no transaction_id_by_customer specified", "input"], // 1
  ["No transactions to receipts found", "input"], // 1 — leerer Stapel, also wirklich eine Eingabeprüfung.
  ["no type specified", "input"], // 1
  ["no vat option specified", "input"], // 2
  ["no vat possible for specified combination", "input"], // 1 — grenznah: Kombination aus Konten und Steuerschlüssel.
  ["no vat specified", "input"], // 1
  ["Number of receipts exceeded", "input"], // 1 — Stapelgrenze; render.ts nennt dazu das billigere Aufrufmuster.
  ["Number of transactions exceeded", "input"], // 1 — Stapelgrenze; render.ts nennt dazu das billigere Aufrufmuster.
  ["Number of transactions to receipts exceeded", "input"], // 1 — Stapelgrenze; render.ts nennt dazu das billigere Aufrufmuster.
  ["only transaction_id_by_customer or receipt_id_by_customer should be specified", "input"], // 1
  ["parameter posting_id_by_customer is required", "input"], // 1
  ["Parameter posting_id_by_customer is required.", "input"], // 1
  ["parameter posting_id_by_customer must be an integer", "input"], // 1
  ["Parameter posting_id_by_customer must be an integer.", "input"], // 1
  ["parameter receipt_id_by_customer is required", "input"], // 1
  ["parameter receipt_id_by_customer must be an integer", "input"], // 1
  ["parameter transaction_id_by_customer is required", "input"], // 1
  ["parameter transaction_id_by_customer must be an integer", "input"], // 1
  ["posting is no free posting", "input"], // 1
  ["Posting is not a free posting.", "input"], // 1
  ["postingaccount_number is out of allowed range [detailed error message]", "input"], // 2
  ["receipt is directly assigned to confirmed postings", "input"], // 1
  ["the account name must be %min% to %max% characters long", "input"], // 1
  ["the cost location is longer than 10 characters", "input"], // 3
  [
    "the cost location must consist of alphanumeric characters or be a number greater than 0",
    "input",
  ], // 3
  ["the cost location two is longer than 10 characters", "input"], // 3
  [
    "the cost location two must consist of alphanumeric characters or be a number greater than 0",
    "input",
  ], // 3
  ["the date delivery is invalid", "input"], // 1
  ["the posting text is longer than 128 characters", "input"], // 3
  ["the postingaccount name must be %min% to %max% characters long", "input"], // 2
  ["The postingaccount_credit is identical to the postingaccount_debit", "input"], // 1
  ["the postingaccount_number must be at least %min% digits long", "input"], // 1
  ["the postingaccount_number must have %min% to %max% digits", "input"], // 2
  ["there are no negative amounts allowed", "input"], // 1
  ["wrong creditor account postingaccount_number specified", "input"], // 1
  ["wrong debtor account postingaccount_number specified", "input"], // 1
  ["wrong postingaccount_number specified", "input"], // 1
]);

/**
 * Die Paare, bei denen der Pfad die Klasse kippt.
 *
 * Es ist genau eines. `no post and files content received or declined` steht an 21 Pfaden; an
 * 20 davon ist es eine Eingabeprüfung („der Rumpf kam nicht an, sende ihn vollständig"), an
 * `/transactions/add` dagegen `special` — dort beschriftet die Spezifikation zwei fachlich
 * verschiedene Antworten mit den Schlüsseln „400 (23)" und „400 (24)", lässt aber BEIDE
 * Definitionen intern `error_code: 23` deklarieren. Am Code allein sind die beiden Fälle nicht
 * zu unterscheiden; deshalb und nur deshalb wertet die Fehlerschicht dort den Text aus.
 */
const PAIR_EXCEPTIONS: ReadonlyMap<string, ErrorClass> = new Map([
  ["/transactions/add|23", "special"],
]);

/** Die Verteilung aus dem Kopf des Generats. Ändert sie sich, ist eine Einstufung gewandert. */
const EXPECTED_DISTRIBUTION: Record<ErrorClass, number> = {
  config: 168,
  input: 397,
  transient: 118,
  final: 95,
  special: 8,
};

/**
 * Die elf Paare mit `error_code` 15, namentlich (Plan 5.6 Fußnote, AP08).
 *
 * Unterschieden werden sie über den HTTP-STATUS und nicht über den Wortlaut: Der Katalog führt
 * `adding temporarily restricted`, `upload temporarily restricted` und
 * `invalid sort field specified`, live kam an `/receipts/get` jedoch `invalid field specified`
 * (Plan 0.3 Befund L6). Eine automatische Ableitung aus dem Muster `invalid …` stufte
 * `/transactions/add` falsch ein — es ist weder Stapel- noch Upload-Endpunkt — und sagte dem
 * Agenten bei einer vorübergehenden Drosselung, ein späterer Versuch helfe nicht.
 */
const CODE_15_PAIRS: readonly { path: string; status: number; cls: ErrorClass }[] = [
  { path: "/receipts/addBatch", status: 403, cls: "transient" },
  { path: "/receipts/upload", status: 403, cls: "transient" },
  { path: "/transactions/add", status: 403, cls: "transient" },
  { path: "/transactions/addBatch", status: 403, cls: "transient" },
  { path: "/transactions/assign-batch/receipt", status: 403, cls: "transient" },
  { path: "/postings/add-batch/receipts", status: 403, cls: "transient" },
  { path: "/postings/add-batch/transactions", status: 403, cls: "transient" },
  { path: "/postings/add-batch/free", status: 403, cls: "transient" },
  { path: "/settings/add-batch/debtors", status: 403, cls: "transient" },
  { path: "/settings/add-batch/creditors", status: 403, cls: "transient" },
  // Das elfte Paar. Es ist der einzige Pfad, an dem Code 15 nicht 403 ist, und es bleibt
  // `input`: ein Tippfehler im Sortierfeld, keine Drosselung.
  { path: "/receipts/get", status: 400, cls: "input" },
];

/** Die acht Paare der Klasse `special` (Plan 5.6). */
const SPECIAL_PAIRS: readonly { path: string; code: number }[] = [
  { path: "/transactions/add", code: 23 },
  { path: "/transactions/add", code: 24 },
  { path: "/invoices/create/e-invoice", code: 41 },
  { path: "/invoices/create/e-invoice", code: 42 },
  { path: "/reports/get/bwa", code: 8 },
  { path: "/reports/get/sums", code: 8 },
  { path: "/reports/create/bwa", code: 12 },
  { path: "/reports/create/sums", code: 12 },
];

/**
 * Die vier Sonderfälle aus Plan 5.6, als Paare.
 *
 * Sonderfall 4 ist der, bei dem der Plantext ungenau ist und die Spezifikation entscheidet:
 * Das Kontingent trägt an `/receipts/upload` den Code **12** (HTTP 403); Code 33 heißt dort
 * `file name is not specified` (HTTP 400). `/invoices/create/draft` führt überhaupt keinen
 * Code 33. „Code 33 an /invoices/create*" träfe also einen falschen Pfad und ein Paar, das es
 * nicht gibt.
 */
const SPECIAL_CASE_PAIRS: readonly {
  caseNumber: number;
  path: string;
  code: number;
  cls: ErrorClass;
}[] = [
  { caseNumber: 1, path: "/reports/get/bwa", code: 8, cls: "special" },
  { caseNumber: 1, path: "/reports/get/sums", code: 8, cls: "special" },
  { caseNumber: 2, path: "/reports/get/bwa", code: 7, cls: "final" },
  { caseNumber: 2, path: "/reports/get/sums", code: 7, cls: "final" },
  { caseNumber: 3, path: "/reports/create/bwa", code: 12, cls: "special" },
  { caseNumber: 3, path: "/reports/create/sums", code: 12, cls: "special" },
  { caseNumber: 4, path: "/receipts/upload", code: 12, cls: "final" },
  { caseNumber: 4, path: "/invoices/create", code: 33, cls: "final" },
  { caseNumber: 4, path: "/invoices/create/e-invoice", code: 33, cls: "final" },
];

const catalog = await loadErrorCatalog();
const pairs = listCatalogPairs(catalog);

describe("Handprüfung der Klassenspalte", () => {
  it("deckt alle 786 Paare über 54 Pfade ab", () => {
    expect(countCatalogPairs(catalog)).toBe(EXPECTED_PAIR_COUNT);
    expect(Object.keys(catalog)).toHaveLength(EXPECTED_PATH_COUNT);
    expect(pairs).toHaveLength(EXPECTED_PAIR_COUNT);
  });

  it("hält die geprüfte Klassenverteilung", () => {
    const counted: Record<string, number> = {};
    for (const { entry } of pairs) {
      counted[entry.cls] = (counted[entry.cls] ?? 0) + 1;
    }
    expect(counted).toEqual(EXPECTED_DISTRIBUTION);
  });

  it("stuft jedes einzelne Paar so ein, wie es von Hand geprüft wurde", () => {
    const deviations: string[] = [];
    for (const { specPath, errorCode, entry } of pairs) {
      const expected =
        PAIR_EXCEPTIONS.get(`${specPath}|${errorCode}`) ?? REVIEWED_TEXTS.get(entry.message);
      if (expected === undefined) {
        deviations.push(`ungeprüfter Text an ${specPath} (${errorCode}): ${entry.message}`);
        continue;
      }
      if (expected !== entry.cls) {
        deviations.push(`${specPath} (${errorCode}): ${entry.cls} statt ${expected}`);
      }
    }
    expect(deviations).toEqual([]);
  });

  it("führt keine Zeile, die kein Paar benutzt", () => {
    const present = new Set(pairs.map(({ entry }) => entry.message));
    const unused = [...REVIEWED_TEXTS.keys()].filter((text) => !present.has(text));
    expect(unused).toEqual([]);
    expect(REVIEWED_TEXTS.size).toBe(present.size);
  });
});

describe("Die elf Paare mit error_code 15", () => {
  it("sind genau diese elf und keine zwölf", () => {
    const found = pairs
      .filter(({ errorCode }) => errorCode === THROTTLE_ERROR_CODE)
      .map(({ specPath, entry }) => ({ path: specPath, status: entry.status, cls: entry.cls }));
    expect(found).toHaveLength(11);
    expect([...found].sort((a, b) => a.path.localeCompare(b.path))).toEqual(
      [...CODE_15_PAIRS].sort((a, b) => a.path.localeCompare(b.path)),
    );
  });

  it("unterscheidet sie über den HTTP-Status, nicht über den Wortlaut", () => {
    for (const { path, status, cls } of CODE_15_PAIRS) {
      const entry = catalog[path]?.[THROTTLE_ERROR_CODE];
      expect(entry, `Paar (${path}, 15) fehlt`).toBeDefined();
      expect(entry?.status, path).toBe(status);
      expect(entry?.cls, path).toBe(cls);
    }
    // Die Gegenprobe zum Wortlaut: Drei verschiedene Katalogtexte tragen dieselbe Klasse,
    // und ein vierter Text trägt live an /receipts/get denselben Code mit anderer Klasse.
    const texts = new Set(
      CODE_15_PAIRS.map(({ path }) => catalog[path]?.[THROTTLE_ERROR_CODE]?.message),
    );
    expect(texts.size).toBe(3);
  });

  it("nennt in classify.ts dieselben zehn Drosselungspfade wie der Katalog", () => {
    const fromCatalog = pairs
      .filter(({ errorCode, entry }) => errorCode === THROTTLE_ERROR_CODE && entry.status === 403)
      .map(({ specPath }) => specPath)
      .sort();
    expect([...THROTTLE_PATHS].sort()).toEqual(fromCatalog);
    expect(THROTTLE_PATHS).toHaveLength(10);
    // /transactions/add ist der Pfad, der leicht durchrutscht: weder Stapel noch Upload.
    expect(THROTTLE_PATHS).toContain("/transactions/add");
  });
});

describe("Die Sonderfälle aus 5.6", () => {
  it("führt genau die acht Paare der Klasse special", () => {
    const found = pairs
      .filter(({ entry }) => entry.cls === "special")
      .map(({ specPath, errorCode }) => ({ path: specPath, code: errorCode }));
    expect(
      [...found].sort((a, b) => `${a.path}${a.code}`.localeCompare(`${b.path}${b.code}`)),
    ).toEqual(
      [...SPECIAL_PAIRS].sort((a, b) => `${a.path}${a.code}`.localeCompare(`${b.path}${b.code}`)),
    );
  });

  it("führt die vier ausformulierten Sonderfälle an den Paaren, an denen sie gemeint sind", () => {
    for (const { caseNumber, path, code, cls } of SPECIAL_CASE_PAIRS) {
      const entry = catalog[path]?.[code];
      expect(entry, `Sonderfall ${caseNumber}: Paar (${path}, ${code}) fehlt`).toBeDefined();
      expect(entry?.cls, `Sonderfall ${caseNumber} an ${path}`).toBe(cls);
    }
  });

  it("belegt, dass Code 33 an /receipts/upload NICHT das Kontingent meint", () => {
    // Die Begründung für die Pfadgenauigkeit von Sonderfall 4, als Test statt als Behauptung.
    expect(catalog["/receipts/upload"]?.[12]?.status).toBe(403);
    expect(catalog["/receipts/upload"]?.[33]?.status).toBe(400);
    expect(catalog["/invoices/create/draft"]?.[33]).toBeUndefined();
  });
});
