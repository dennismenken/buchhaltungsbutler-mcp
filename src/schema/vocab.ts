// Die geteilten Bausteine: Schemafragment und deutsches Beschreibungsmuster
// immer zusammen, damit derselbe Sachverhalt an 54 Werkzeugen nicht 54-mal neu formuliert
// wird. Das ist der größte Hebel gegen Wiederholung und trägt die Sparmaßnahmen S1, S3 und
// S4.
//
// Sprachregel: Der Fließtext ist deutsch mit echten Umlauten. API-Feldnamen,
// Werkzeugnamen und Enum-Werte stehen unverändert im Original und werden weder übersetzt
// noch eingedeutscht; wörtlich zitierte API-Werte stehen in einfachen Anführungszeichen,
// damit eine maschinelle Sprachprüfung sie ausklammern kann.
//
// `limit` und `offset` stehen nicht hier, sondern in pagination.ts: Sie hängen am Endpunkt
// und nicht an der Feldart. Die drei `order`-Formen stehen in order.ts.

import { z } from "zod";

import {
  amountValue,
  boundedText,
  dateTimeValue,
  dateValue,
  identifierValue,
} from "./primitives.js";

// --- Textbausteine -------------------------------------------------------------------

/**
 * Der Satz zum leeren String.
 *
 * Die Spezifikation wiederholt „An empty string is not considered a valid date“ dutzendfach.
 * Als Querschnittsregel steht sie einmal in den `instructions` (S1). An den Datumsfeldern
 * steht sie trotzdem, weil das Muster von `date()` sie wörtlich vorsieht: Dort ist
 * der Unterschied zwischen „leerer String“ und „weglassen“ der häufigste Fehler.
 */
export const EMPTY_STRING_SENTENCE =
  "Ein leerer String wird abgelehnt; das Feld stattdessen weglassen.";

/** Der Hinweis auf die Typ-Asymmetrie der Kennungen. */
export const ID_STRING_SENTENCE =
  "In Suchergebnissen erscheint sie als String; hier ohne Anführungszeichen übergeben.";

/**
 * Der Pflichtsatz zur Währung einer Zahlung, wörtlich.
 *
 * Er ersetzt die zurückgenommene Verschärfung von `currency` an `/transactions/add`: Die
 * Währung einer Zahlung ist implizit die des Zahlungskontos, und kein Endpunkt der API gibt
 * sie preis. P8 prüft den Satz an `bb_transactions_create` und an
 * `bb_transactions_create_batch`.
 */
export const TRANSACTION_CURRENCY_SENTENCE =
  "Ohne Angabe bucht BuchhaltungsButler in der Währung des Zahlungskontos; die Spezifikation " +
  "beschreibt den Betrag ausdrücklich als Betrag in der Kontowährung. Welche Währung ein " +
  "Zahlungskonto führt, gibt die API an keiner Stelle preis — diesen Wert also nur setzen, " +
  "wenn er aus dem Vorgang bekannt ist.";

/**
 * Der Beschreibungstext der beiden Belegwährungsfelder, wörtlich.
 *
 * Er benennt den Spezifikationswiderspruch, statt ihn durch ein geratenes Enum zu
 * verdecken: drei Codes am Endpunkt, 48 Codes am Stapelelement und dort zugleich der
 * Ein-Wert-Enum `['EUR']`. Nach Regel R-B ist damit kein Vorrat belegt.
 */
export const RECEIPT_CURRENCY_SENTENCE =
  "Die Spezifikation nennt an /receipts/add nur USD, GBP und CHF, an der Stapelvariante " +
  "dagegen 48 Codes und zugleich EUR als einzigen Enum-Wert. Die drei Angaben widersprechen " +
  "sich; dieses Werkzeug prüft den Wert deshalb nicht vorab. EUR ist der Regelfall. Lehnt " +
  "BuchhaltungsButler eine Währung ab, nennt die Fehlermeldung den erlaubten Vorrat.";

/**
 * Der Beschreibungstext von `currency` an `/receipts/upload`.
 *
 * Die Spezifikation verlangt dort „Has to be 'EUR' if specified“ und widerspricht damit dem
 * Vorrat von `/receipts/add`. Dass nur 'EUR' gilt, ist **nicht verifiziert**.
 */
export const UPLOAD_CURRENCY_SENTENCE =
  "Die Spezifikation sagt hier „Has to be 'EUR' if specified“ und widerspricht damit dem " +
  "Vorrat von /receipts/add mit USD, GBP und CHF. Dass nur 'EUR' gilt, ist nicht verifiziert; " +
  "dieses Werkzeug prüft den Wert deshalb nicht vorab.";

// --- Datum, Datumzeit, Betrag, Kennung -----------------------------------------------

/**
 * Datumsfeld, Muster.
 *
 * @param subject Der feldeigene Anfang der Beschreibung, zum Beispiel
 *                „Rechnungsdatum des Belegs“. Ohne abschließenden Punkt.
 */
export function date(subject: string): z.ZodString {
  return dateValue(`${subject} als YYYY-MM-DD, zum Beispiel 2026-04-26. ${EMPTY_STRING_SENTENCE}`);
}

/** Datum mit Uhrzeit, Muster. Ein reines Datum gilt als 23:59:59 dieses Tages. */
export function dateTime(subject: string): z.ZodString {
  return dateTimeValue(
    `${subject} als YYYY-MM-DD HH:MM:SS, zum Beispiel 2026-04-26 13:45:00. ` +
      `Ein reines Datum YYYY-MM-DD gilt als 23:59:59 dieses Tages. ${EMPTY_STRING_SENTENCE}`,
  );
}

/**
 * Betragsfeld, Muster. Das Fragment ist als Betrag markiert (Guard 5).
 *
 * @param subject Der feldeigene Anfang der Beschreibung, zum Beispiel „Bruttobetrag des
 *                Belegs". Ohne abschließenden Punkt.
 */
export function amountIn(subject: string): z.ZodString {
  return amountValue(
    `${subject}. Dezimalpunkt, kein Tausendertrennzeichen, als Zeichenkette übergeben, zum ` +
      'Beispiel "123.99". ' +
      "0.00 ist kein gültiger Betrag.",
  );
}

/**
 * Mandantenbezogene Kennung, Muster.
 *
 * @param entity     Die **vollständige Nominalphrase im Genitiv**, mit Artikel: „des Belegs“,
 *                   „der Zahlung“, „der Buchung“. Der Artikel gehört zum Argument und steht
 *                   nicht fest im Satz: „des“ passt nur zu Maskulinum und Neutrum, und mit
 *                   einem festen „des“ entstünde an jedem Zahlungs- und Buchungsfeld das
 *                   falsche „des Zahlung“.
 * @param lookupTool Das Werkzeug, mit dem die Nummer zu finden ist.
 */
export function idByCustomer(entity: string, lookupTool: string): z.ZodNumber {
  return identifierValue(
    `Die mandantenbezogene Nummer ${entity}, zu finden über ${lookupTool}. ` +
      `Keine globale Kennung. ${ID_STRING_SENTENCE}`,
  );
}

// --- Umsatzsteuerschlüssel -----------------------------------------------------------

/**
 * Die 23 Steuerschlüssel der Eingabeseite, in der Reihenfolge der Spezifikation.
 *
 * Belegstelle: Beschreibungstext von `vat` an `/postings/add/free` sowie `vats` an
 * `/postings/add/receipt` und `/postings/add/transaction`; die drei Listen sind wortgleich
 * (maschinell geprüft am 2026-09-12, `docs/api/buchungen.md` 4.1).
 *
 * Die deutschen Bezeichnungen stehen **nicht** hier, sondern einmal in der Resource
 * `bb://vat-keys` und in den `instructions`. Mit Labels kosten sie rund 1.100 Zeichen und
 * kämen an sechs Werkzeugen vor; als reine Werteliste rund 320 (Sparmaßnahme S3).
 */
export const VAT_KEYS = [
  "0_none",
  "19_vat",
  "7_vat",
  "19_pre",
  "7_pre",
  "19_both_1",
  "19_both_506",
  "19_both_6506",
  "19_both_511",
  "19_both_6511",
  "19_both_6501",
  "19_both_2",
  "7_both",
  "19_both_1_no_pre",
  "19_both_2_no_pre",
  "7_both_no_pre",
  "19_pre_app",
  "7_pre_app",
  "19_both_app_1",
  "19_both_app_506",
  "19_both_app_511",
  "19_both_app_2",
  "7_both_app",
] as const;

/** Steuerschlüssel als Enum über die 23 belegten Werte. */
export function vatKey() {
  return z
    .enum(VAT_KEYS)
    .describe(
      "Steuerschlüssel der Buchungszeile. '_pre' steht für Vorsteuer (Eingangsumsätze), " +
        "'_vat' für Umsatzsteuer (Ausgangsumsätze), '_both' für Fälle mit beidem, etwa " +
        "Reverse Charge nach §13b. Welcher Schlüssel zulässig ist, hängt vom Konto, vom " +
        "Buchungsdatum und von den Mandanteneinstellungen ab. Die deutschen Bezeichnungen " +
        "aller 23 Schlüssel stehen in der Resource bb://vat-keys.",
    );
}

// --- Konten und Kostenstellen --------------------------------------------------------

/**
 * Sachkontonummer. Mandantendaten sind nie ein Enum, sondern tragen den Verweis
 * auf das Nachschlagewerkzeug.
 */
export function postingAccountNumber(): z.ZodString {
  return boundedText(
    'Nummer eines Sachkontos, zum Beispiel "4980" — eine Zeichenkette, keine Zahl. ' +
      "Mandantenbezogene Stammdaten: " +
      "nachschlagen mit bb_postingaccounts_search.",
  );
}

/**
 * Sachkontonummer eines Zahlungskontos.
 *
 * Der eigene Baustein ist kein Zierrat: Der API-Parameter heißt an vier Endpunkten
 * `account`, erwartet aber eine Sachkontonummer und meint ein Zahlungskonto. Im
 * Werkzeugschema heißt das Feld deshalb `payment_account_number` (Anhang A).
 */
export function paymentAccountNumber(): z.ZodString {
  return boundedText(
    'Sachkontonummer eines Zahlungskontos, zum Beispiel "1200" — eine Zeichenkette, keine ' +
      "Zahl. " +
      "Auflisten mit bb_payment_accounts_list.",
  );
}

/** Kostenstelle, höchstens 10 Zeichen. */
export function costLocation(): z.ZodString {
  return boundedText(
    "Kostenstelle, mandantenbezogen, nachschlagen mit bb_cost_locations_search. " +
      "Höchstens 10 Zeichen.",
    10,
  );
}

// --- Adress- und Kontaktblock --------------------------------------------------------

/**
 * Die neun Adress- und Kontaktfelder, die Debitoren, Kreditoren und Rechnungen teilen.
 *
 * Sparmaßnahme S4: Die rund 90 Vorkommen dieser Felder über alle Werkzeuge
 * tragen einen Einzeiler nach festem Muster und höchstens 80 Zeichen, statt den
 * ausführlichen Spezifikationstext zu übersetzen.
 *
 * **Bankdaten gehören nicht in diesen Block.** `iban` und `bic` stehen als eigene
 * Bausteine daneben ({@link iban}, {@link bic}): Eine überschriebene Bankverbindung ist ein
 * anderer Schaden als eine überschriebene Postadresse, und genau damit ist
 * `destructiveHint: true` bei Klasse M begründet.
 *
 * **Der Feldname weicht bei den Rechnungen ab.** Debitoren und Kreditoren führen
 * `additional_address_line`, die drei Rechnungsendpunkte `additional_addressline` ohne
 * Unterstrich (maschinell geprüft am 2026-09-12). Der Baustein liefert die Beschreibung;
 * welcher Name gesendet wird, entscheidet `apiNames` im Registereintrag.
 */
export function contactAddressBlock(): Readonly<Record<ContactAddressField, z.ZodString>> {
  return Object.freeze({
    contact_person_name: boundedText("Name der Ansprechperson, zum Beispiel Maria Schmidt."),
    street: boundedText("Straße und Hausnummer, zum Beispiel Hauptstraße 12."),
    additional_address_line: boundedText("Zusätzliche Adresszeile, zum Beispiel Gebäude B."),
    zip: boundedText('Postleitzahl, zum Beispiel "28195".'),
    city: boundedText("Ort, zum Beispiel Bremen."),
    country: boundedText("Land, zum Beispiel Deutschland oder DE."),
    email: boundedText("E-Mail-Adresse, zum Beispiel rechnung@beispiel.de."),
    sales_tax_id: boundedText("Umsatzsteuer-Identifikationsnummer, zum Beispiel DE123456789."),
    customer_number: boundedText("Kunden- oder Lieferantennummer des Mandanten."),
  });
}

/** Die neun Feldnamen des Adress- und Kontaktblocks. */
export type ContactAddressField =
  | "contact_person_name"
  | "street"
  | "additional_address_line"
  | "zip"
  | "city"
  | "country"
  | "email"
  | "sales_tax_id"
  | "customer_number";

/**
 * IBAN der Bankverbindung. Bankdaten stehen bewusst außerhalb des Adressblocks.
 *
 * Die Obergrenze 34 Zeichen stammt aus ISO 13616 und nicht aus der Spezifikation; sie ist
 * die einzige Längengrenze dieses Moduls, die keine API-Quelle hat, und sie kann keinen
 * gültigen Wert abweisen.
 */
export function iban(): z.ZodString {
  return boundedText("IBAN der Bankverbindung, zum Beispiel DE02120300000000202051.", 34);
}

/** BIC der Bankverbindung, 8 oder 11 Zeichen nach ISO 9362. Siehe Hinweis bei {@link iban}. */
export function bic(): z.ZodString {
  return boundedText("BIC der Bankverbindung, zum Beispiel BYLADEM1001.", 11);
}

// --- Antwortformat -------------------------------------------------------------------

/** Die beiden Werte von `response_format` (`tool-design.md` 7.2). */
export const RESPONSE_FORMATS = ["concise", "detailed"] as const;

/**
 * Das einzige rein serverseitige Feld des ganzen Servers.
 *
 * Es wird nie an die API gesendet, und die Beschreibung sagt das. Damit ist es kein
 * verborgenes Verhalten, sondern deklariert.
 */
export function responseFormat() {
  // .describe() steht nach .default(): Nur dann trägt das äußere Schema die Beschreibung,
  // und nur dann liest `schema.description` sie auch wieder. Im erzeugten JSON Schema
  // landet sie in beiden Reihenfolgen.
  return z
    .enum(RESPONSE_FORMATS)
    .default("concise")
    .describe(
      "'concise' liefert nur die Felder, die einen Datensatz erkennbar machen und den " +
        "nächsten Schritt erlauben. 'detailed' liefert den Datensatz so, wie die " +
        "BuchhaltungsButler-API ihn ausgibt. Mit 'concise' beginnen und nur für die wenigen " +
        "Datensätze auf 'detailed' wechseln, die wirklich geprüft werden müssen. Dieses Feld " +
        "ist serverseitig und geht nicht an die API.",
    );
}

// --- Währung -------------------------------------------------------------------------

/**
 * Die 48 Währungscodes, verbindlich und vollständig.
 *
 * Entnommen dem Beschreibungstext von `Transaction.currency` (maschinell am 2026-09-12).
 * Der Body-Parameter `currency` an `/transactions/add` schreibt 47 davon aus; der einzige
 * Unterschied ist `RSD`. Nach Regel R-B gilt die Vereinigung, weil ein zu enges Enum
 * gültige Vorgänge unsichtbar vor dem Request ablehnt.
 */
export const TRANSACTION_CURRENCY_CODES = [
  "AED",
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "COP",
  "CYP",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HRK",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "LTL",
  "LVL",
  "MTL",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PEN",
  "PHP",
  "PLN",
  "QAR",
  "ROL",
  "RON",
  "RSD",
  "RUB",
  "SEK",
  "SGD",
  "SIT",
  "SKK",
  "THB",
  "TRL",
  "TRY",
  "UAH",
  "USD",
  "VND",
  "ZAR",
] as const;

/**
 * Währung eines Belegs: freier String, **kein** Enum.
 *
 * Benutzt von Werkzeug 4 (`bb_receipts_create`) und Werkzeug 5
 * (`bb_receipts_create_batch`). Dass beide denselben Baustein rufen, ist die konstruktive
 * Erfüllung von Regel R-A: Ein Werkzeugpaar, bei dem ein Wert einzeln erlaubt
 * und im Stapel verboten wäre, ist ein Widerspruch, den kein Aufrufer auflösen kann. Der
 * Ein-Wert-Enum `['EUR']` der Definition `Receipt` wird verworfen wie das Platzhalterschema
 * des `order`-Parameters.
 */
export function currencyReceipts(): z.ZodString {
  return boundedText(RECEIPT_CURRENCY_SENTENCE);
}

/**
 * Währung einer Zahlung: Enum über die 48 Codes.
 *
 * Benutzt von Werkzeug 12 (`bb_transactions_create`) und Werkzeug 13
 * (`bb_transactions_create_batch`) — dieselbe konstruktive Erfüllung von R-A wie bei
 * {@link currencyReceipts}. Der Ein-Wert-Enum `['EUR']` der Definition `Transaction` wird
 * auch hier verworfen.
 */
export function currencyTransactions() {
  return z.enum(TRANSACTION_CURRENCY_CODES).describe(TRANSACTION_CURRENCY_SENTENCE);
}

/**
 * Währung beim Belegupload: freier String mit dem Widerspruch.
 *
 * Benutzt von Werkzeug 6 (`bb_receipts_upload`). Der eigene Baustein ist nötig, weil die
 * Spezifikation hier einen dritten, wieder anderen Vorrat nennt; R-A greift nicht, weil
 * `/receipts/upload` keine Stapelvariante hat.
 */
export function currencyUpload(): z.ZodString {
  return boundedText(UPLOAD_CURRENCY_SENTENCE);
}
