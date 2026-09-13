// Werkzeug 6 von 54 (Plan 3.8): `/receipts/upload`, Belegdatei hochladen.
//
// Der einzige Endpunkt der API, der eine Datei entgegennimmt, und der einzige mit einem
// eigenen Minutenlimit (zehn Aufrufe, Eimer `upload` in Plan 5.4). Die Verarbeitung umfasst
// Texterkennung und E-Rechnungsauswertung; die Zeitlimitstufe ist deshalb `long` (Plan 5.2),
// und ein Zeitlimit ist hier kein Fehlschlag, sondern ein ungewisser Ausgang (Plan 5.7).
//
// **Der Wertevorrat von `currency` ist hier ein dritter.** Die Spezifikation verlangt an
// diesem Endpunkt „Has to be 'EUR' if specified“ und widerspricht damit `/receipts/add`, das
// USD, GBP und CHF nennt. Regel R-A greift nicht, weil `/receipts/upload` keine Stapelform
// hat; nach Regel R-B bleibt es bei einem freien String mit benanntem Widerspruch
// (Plan 4.5 Zeile 3, Baustein `currencyUpload()`).
//
// **Belegart und die übrigen Metadaten teilen sich Text und Schema mit bb_receipts_create**,
// weil es fachlich dieselben Felder sind; die Spezifikation führt sie an beiden Endpunkten
// wortgleich. Abweichend ist allein die Pflichtigkeit: Hier sind nur `file` und `type`
// Pflicht, alles Übrige liest BuchhaltungsButler aus der Datei.
//
// **Die Datei selbst.** Das Feld `file` nimmt den base64-Inhalt, eine https-Adresse oder eine
// file-Adresse; die beiden letzten Formen sind nur nutzbar, wenn der Betreiber sie freigegeben
// hat (Plan 6.2). Den Inhalt beschafft `src/upload/source.ts` vor dem ersten Byte an die API,
// prüft den Dateityp über die Magic Bytes und bereinigt den Dateinamen.

import { z } from "zod";

import { amountValue, boundedText, dateValue } from "../../schema/primitives.js";
import {
  currencyUpload,
  idByCustomer,
  paymentAccountNumber,
  postingAccountNumber,
  UPLOAD_CURRENCY_SENTENCE,
} from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";
import { RECEIPT_TYPES, RECEIPT_TYPE_TEXT } from "./bb_receipts_create.js";

export const bb_receipts_upload: ToolEntry = {
  name: "bb_receipts_upload",
  title: "Belegdatei hochladen",
  group: "receipts",
  path: { literal: "/receipts/upload" },
  effect: "create",
  toolClass: "A",
  tier: 1,
  mandatorySentence: "U2",
  description:
    "Lädt eine Belegdatei nach BuchhaltungsButler, legt daraus einen Beleg an und stößt die " +
    "Texterkennung an; Pflicht sind nur die Datei und die Belegart, alles Weitere liest " +
    "BuchhaltungsButler aus der Datei. Beispiel: eine Eingangsrechnung als PDF übergeben und " +
    "die erkannten Felder danach mit bb_receipts_get prüfen. Für einen Beleg ohne Datei " +
    "bb_receipts_create, für viele davon bb_receipts_create_batch. Einen Stapelupload gibt es " +
    "nicht, und an einen bestehenden Beleg lässt sich nachträglich keine Datei hängen. Bei " +
    "einer E-Rechnung ignoriert die API alle mitgegebenen Metadaten. Eigenes Limit: zehn " +
    "Aufrufe je Minute. Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. " +
    "Rückgängig nur mit bb_receipts_delete, das den Beleg lediglich als gelöscht markiert; die " +
    "API kennt keinen Endpunkt, der einen Beleg endgültig entfernt.",
  fields: [
    {
      name: "file",
      apiNames: ["file"],
      source: "body",
      required: true,
      description:
        "Die Belegdatei in einer von drei Formen: als base64-Zeichenkette, was immer geht, als " +
        "https-Adresse oder als file-Adresse. Die beiden Adressformen nimmt der Server nur an, " +
        "wenn der Betreiber sie freigegeben hat; sonst lehnt er den Aufruf ab, bevor etwas " +
        "hinausgeht. Angenommene Dateiarten sind PDF, XML, JPEG, PNG, BMP und TIFF; der Typ " +
        "wird am Inhalt bestimmt und nicht am Namen. Bei der base64-Form gehört der Dateiname " +
        "in file_name.",
      schema: boundedText("Die Belegdatei."),
    },
    {
      name: "receipt_type",
      apiNames: ["type"],
      source: "body",
      required: true,
      description: RECEIPT_TYPE_TEXT,
      schema: z.enum(RECEIPT_TYPES),
    },
    {
      name: "file_name",
      apiNames: ["file_name"],
      source: "body",
      required: false,
      description:
        "Dateiname einschließlich Endung, zum Beispiel rechnung-2026-0001.pdf. Bei der " +
        "base64-Form verlangt die API ihn; fehlt er, kann der Server einen Namen aus dem " +
        "erkannten Dateityp bilden. Pfadanteile und Steuerzeichen werden entfernt.",
      schema: boundedText("Dateiname einschließlich Endung."),
    },
    {
      name: "payment_account_number",
      apiNames: ["account"],
      source: "body",
      required: false,
      description:
        "Sachkontonummer, die ein Zahlungskonto bezeichnet, zum Beispiel '1200'. Nicht das " +
        "Sachkonto, auf das gebucht wird. Zahlungskonten auflisten mit " +
        "bb_payment_accounts_list. Der Beleg wird damit unmittelbar diesem Zahlungskonto " +
        "zugeordnet. Der Parameter heißt in der API account.",
      schema: paymentAccountNumber(),
    },
    {
      name: "creditor_debtor",
      apiNames: ["creditor_debtor"],
      source: "body",
      required: false,
      description:
        "Nummer des Personenkontos, dem der Beleg zugeordnet wird: bei Eingangsbelegen ein " +
        "Kreditor, bei Ausgangsbelegen ein Debitor, zum Beispiel 70001. Nachschlagen mit " +
        "bb_postingaccounts_search, das Sachkonten, Zahlungskonten, Debitoren und Kreditoren " +
        "gemeinsam führt. Nutzbar nur, wenn Debitoren und Kreditoren beim Mandanten aktiviert " +
        "sind, und passend zur Belegart.",
      schema: postingAccountNumber(),
    },
    {
      name: "counterparty",
      apiNames: ["counterparty"],
      source: "body",
      required: false,
      description:
        "Gegenpartei des Belegs: bei einer Eingangsrechnung der Rechnungssteller, bei einer " +
        "Ausgangsrechnung der Empfänger. Ohne Angabe liest BuchhaltungsButler sie aus der Datei.",
      schema: boundedText("Gegenpartei des Belegs."),
    },
    {
      name: "invoice_number",
      apiNames: ["invoice_number"],
      source: "body",
      required: false,
      description:
        "Rechnungsnummer des Belegs, zum Beispiel ER-2026-0001, höchstens 60 Zeichen. Ohne " +
        "Angabe wird sie aus der Datei gelesen.",
      schema: boundedText("Rechnungsnummer des Belegs.", 60),
    },
    {
      name: "date",
      apiNames: ["date"],
      source: "body",
      required: false,
      description:
        "Belegdatum, also das Ausstellungsdatum, als YYYY-MM-DD, zum Beispiel 2026-04-26. Ohne " +
        "Angabe wird es aus der Datei gelesen.",
      schema: dateValue("Belegdatum."),
    },
    {
      name: "amount",
      apiNames: ["amount"],
      source: "body",
      required: false,
      description:
        "Bruttobetrag des Belegs. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel " +
        "123.99. 0.00 ist kein gültiger Betrag; ein negativer Betrag kennzeichnet eine " +
        "Rückabwicklung. Ohne Angabe wird er aus der Datei gelesen.",
      schema: amountValue("Bruttobetrag des Belegs."),
    },
    {
      name: "currency",
      apiNames: ["currency"],
      source: "body",
      required: false,
      description: UPLOAD_CURRENCY_SENTENCE,
      schema: currencyUpload(),
    },
    {
      name: "vat_rate",
      apiNames: ["vat_rate"],
      source: "body",
      required: false,
      description:
        "Umsatzsteuersatz des Belegs in Prozent als Zahl, zum Beispiel 19 oder 0. Weglassen, " +
        "wenn der Beleg keinen oder mehrere Steuersätze trägt.",
      schema: z.number(),
    },
    {
      name: "payment_reference",
      apiNames: ["payment_reference"],
      source: "body",
      required: false,
      description:
        "Technische Zahlungsreferenz, zum Beispiel eine Amazon-Bestellnummer oder eine " +
        "Vorgangsnummer von PayPal oder Stripe. Kein Verwendungszweck als Freitext. Stimmt sie, " +
        "findet BuchhaltungsButler die passende Zahlung von selbst.",
      schema: boundedText("Technische Zahlungsreferenz."),
    },
    {
      name: "date_delivery",
      apiNames: ["date_delivery"],
      source: "body",
      required: false,
      description:
        "Leistungs- oder Lieferdatum als YYYY-MM-DD, zum Beispiel 2026-04-26. Wegen der " +
        "DATEV-Kompatibilität nimmt BuchhaltungsButler kein Leistungsdatum nach dem Belegdatum an.",
      schema: dateValue("Leistungs- oder Lieferdatum."),
    },
    {
      name: "date_payment_due",
      apiNames: ["date_payment_due"],
      source: "body",
      required: false,
      description:
        "Fälligkeitsdatum als YYYY-MM-DD, zum Beispiel 2026-05-26. In der Antwort der Suche " +
        "heißt das Feld due_date.",
      schema: dateValue("Fälligkeitsdatum."),
    },
    {
      name: "link_to_receipt_id_by_customer",
      apiNames: ["link_to_receipt_id_by_customer"],
      source: "body",
      required: false,
      description:
        "Die mandantenbezogene Nummer eines anderen Belegs, zu finden über bb_receipts_search. " +
        "Keine globale Kennung; hier ohne Anführungszeichen übergeben. Beide Belege werden " +
        "gemeinsam einer Zahlung zugeordnet, sobald einer von ihnen von Hand zugeordnet wird.",
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  responseContract: {
    // Die Quittung trägt id_by_customer und filename auf oberster Ebene des Umschlags, nicht
    // unter data (docs/api/belege.md 7.2). filename ist der interne Name ohne Endung.
    container: "none",
    fields: { id_by_customer: "id-string", filename: "string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "upload",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_search",
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "list_direction passend zur Belegart setzen und, falls die Datumsgrenzen nicht gesendet " +
      "wurden, den heutigen Tag nehmen, weil der Beleg das Datum aus der Datei tragen kann; " +
      "dann in der Antwort nach dem Beleg suchen",
  },
  duplicateCheck: {
    tool: "bb_receipts_search",
    keyFields: ["date", "amount", "counterparty"],
    perBatch: true,
  },
  crossChecks: ["Q3", "Q5", "Q6"],
  invalidatesCache: [],
};
