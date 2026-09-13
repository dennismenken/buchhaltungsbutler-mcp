// Werkzeug 4 von 54: `/receipts/add`, Beleg ohne Datei anlegen.
//
// **Währung, Regel R-A.** `currency` trägt hier und an `bb_receipts_create_batch`
// denselben Wertevorrat, dieselbe Pflichtigkeit und wortgleich dieselbe Beschreibung: freier
// String, an beiden Pflicht, Text aus `RECEIPT_CURRENCY_SENTENCE`. Dass beide Einträge
// dieselbe Konstante und denselben Baustein rufen, ist der Nachweis des Gleichlaufs.
// **Der Ein-Wert-Enum `["EUR"]`** der Definition `Receipt` (Belegstelle:
// `.definitions.Receipt.properties.currency.enum` in docs/openapi/buchhaltungsbutler-v1.json)
// **ist verworfen**, weil er dem Beschreibungstext derselben Eigenschaft mit 48 Codes und dem
// Endpunkttext mit drei Codes widerspricht; nach Regel R-B ist damit kein Vorrat belegt, und
// ein erfundenes Enum lehnte gültige Belege unsichtbar vor dem Request ab.
//
// **Zu `account` und `creditor_debtor`:** Die Spezifikation führt beide als `integer`, schreibt
// die Beispiele in ihrem eigenen Text aber als '1200' und '70001'. Für `account` gilt
// deshalb der Baustein `paymentAccountNumber()`, also eine Zeichenkette; `creditor_debtor`
// folgt derselben Form, damit zwei Felder mit derselben Bedeutung nicht verschiedene Typen
// haben und führende Nullen erhalten bleiben. Ob die API eine Zeichenkette annimmt, ist
// **nicht verifiziert** (kein schreibender Testaufruf).

import { z } from "zod";

import { amountValue, boundedText, dateValue } from "../../schema/primitives.js";
import {
  currencyReceipts,
  idByCustomer,
  paymentAccountNumber,
  postingAccountNumber,
  RECEIPT_CURRENCY_SENTENCE,
} from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

/** Die vier Belegarten, wörtlich und kleingeschrieben (docs/api/belege.md 2.3). */
export const RECEIPT_TYPES = [
  "invoice inbound",
  "invoice outbound",
  "credit inbound",
  "credit outbound",
] as const;

/** Wortlaut der Belegartbeschreibung. Er gilt an `/receipts/add` und `/receipts/upload`. */
export const RECEIPT_TYPE_TEXT =
  "Belegart, kleingeschrieben und mit Leerzeichen. 'invoice inbound' ist eine " +
  "Eingangsrechnung, 'invoice outbound' eine Ausgangsrechnung, 'credit inbound' eine " +
  "Eingangsgutschrift nach § 14 UStG, 'credit outbound' eine Ausgangsgutschrift nach " +
  "§ 14 UStG. Der Parameter heißt in der API type; dieser Name ist dort siebenfach mit " +
  "verschiedener Bedeutung belegt, deshalb der eindeutige Werkzeugname.";

export const bb_receipts_create: ToolEntry = {
  name: "bb_receipts_create",
  title: "Beleg anlegen",
  group: "receipts",
  path: { literal: "/receipts/add" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  mandatorySentence: "U2",
  description:
    "Legt in BuchhaltungsButler einen Beleg ohne Datei an, zum Beispiel den Datensatz einer " +
    "Eingangsrechnung aus einem Vorsystem; Belegart, Gegenpartei, Rechnungsnummer, Belegdatum, " +
    "Betrag und Währung sind Pflicht. Gibt es eine Belegdatei, stattdessen bb_receipts_upload " +
    "nehmen: Nachträglich lässt sich an einen Beleg keine Datei mehr hängen. Mehrere Belege auf " +
    "einmal legt bb_receipts_create_batch an. Erzeugt weder eine Buchung noch eine Zahlung. " +
    "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig nur mit " +
    "bb_receipts_delete, das den Beleg lediglich als gelöscht markiert; die API kennt keinen " +
    "Endpunkt, der einen Beleg endgültig entfernt.",
  fields: [
    {
      name: "receipt_type",
      apiNames: ["type"],
      source: "body",
      required: true,
      description: RECEIPT_TYPE_TEXT,
      schema: z.enum(RECEIPT_TYPES),
    },
    {
      name: "counterparty",
      apiNames: ["counterparty"],
      source: "body",
      required: true,
      description:
        "Gegenpartei des Belegs: bei einer Eingangsrechnung der Rechnungssteller, bei einer " +
        "Ausgangsrechnung der Empfänger, zum Beispiel Bürobedarf Nordwest GmbH. Ein leerer " +
        "Wert wird abgelehnt.",
      schema: boundedText("Gegenpartei des Belegs."),
    },
    {
      name: "invoice_number",
      apiNames: ["invoice_number"],
      source: "body",
      required: true,
      description:
        "Rechnungsnummer des Belegs, zum Beispiel ER-2026-0001, höchstens 60 Zeichen. Die API " +
        "ließe hier auch einen leeren Wert zu; dieser Server lehnt leere Zeichenketten " +
        "grundsätzlich ab, weil sie an fast allen Feldern dieser API ein Validierungsfehler " +
        "sind. In der Antwort der Suche heißt das Feld invoicenumber, ohne Unterstrich.",
      schema: boundedText("Rechnungsnummer des Belegs.", 60),
    },
    {
      name: "date",
      apiNames: ["date"],
      source: "body",
      required: true,
      description:
        "Belegdatum, also das Ausstellungsdatum, als YYYY-MM-DD, zum Beispiel 2026-04-26. Ein " +
        "leerer String wird abgelehnt; das Feld stattdessen weglassen.",
      schema: dateValue("Belegdatum."),
    },
    {
      name: "amount",
      apiNames: ["amount"],
      source: "body",
      required: true,
      description:
        "Bruttobetrag des Belegs. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel " +
        "123.99. 0.00 ist kein gültiger Betrag. Ein negativer Betrag kennzeichnet eine " +
        "Rückabwicklung, zum Beispiel -12.30.",
      schema: amountValue("Bruttobetrag des Belegs."),
    },
    {
      name: "currency",
      apiNames: ["currency"],
      source: "body",
      required: true,
      // Wortgleich mit dem Feld `currency` je Element an bb_receipts_create_batch: dieselbe
      // Konstante, derselbe Baustein, dieselbe Pflichtigkeit (Regel R-A).
      description: RECEIPT_CURRENCY_SENTENCE,
      schema: currencyReceipts(),
    },
    {
      name: "vat_rate",
      apiNames: ["vat_rate"],
      source: "body",
      required: false,
      description:
        "Umsatzsteuersatz des Belegs in Prozent als Zahl, zum Beispiel 19 oder 0. Weglassen, " +
        "wenn der Beleg keinen oder mehrere Steuersätze trägt. In der Antwort des " +
        "Einzelabrufs heißt das Feld vat.",
      schema: z.number(),
    },
    {
      name: "payment_account_number",
      apiNames: ["account"],
      source: "body",
      required: false,
      description:
        "Sachkontonummer, die ein Zahlungskonto bezeichnet, zum Beispiel '1200'. Nicht das " +
        "Sachkonto, auf das gebucht wird. Zahlungskonten auflisten mit " +
        "bb_payment_accounts_list. Gesetzt wird der Beleg damit unmittelbar diesem " +
        "Zahlungskonto zugeordnet; das Konto muss beim Mandanten als Zahlungskonto bestehen. " +
        "Der Parameter heißt in der API account.",
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
        "gemeinsam führt und sie über die Spalte type unterscheidet. Nutzbar nur, wenn " +
        "Debitoren und Kreditoren beim Mandanten aktiviert sind, und passend zur Belegart.",
      schema: postingAccountNumber(),
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
        "DATEV-Kompatibilität nimmt BuchhaltungsButler kein Leistungsdatum nach dem Belegdatum " +
        "an. Ein leerer String wird abgelehnt; das Feld stattdessen weglassen.",
      schema: dateValue("Leistungs- oder Lieferdatum."),
    },
    {
      name: "date_payment_due",
      apiNames: ["date_payment_due"],
      source: "body",
      required: false,
      description:
        "Fälligkeitsdatum als YYYY-MM-DD, zum Beispiel 2026-05-26. Ein leerer String wird " +
        "abgelehnt; das Feld stattdessen weglassen. In der Antwort der Suche heißt das Feld " +
        "due_date, im Einzelabruf date_payment_due.",
      schema: dateValue("Fälligkeitsdatum."),
    },
    {
      name: "link_to_receipt_id_by_customer",
      apiNames: ["link_to_receipt_id_by_customer"],
      source: "body",
      required: false,
      description:
        "Die mandantenbezogene Nummer eines anderen Belegs, zu finden über bb_receipts_search. " +
        "Keine globale Kennung. In Suchergebnissen erscheint sie als String; hier ohne " +
        "Anführungszeichen übergeben. Beide Belege werden gemeinsam einer Zahlung zugeordnet, " +
        "sobald einer von ihnen von Hand zugeordnet wird.",
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  responseContract: {
    // Die Quittung trägt id_by_customer auf oberster Ebene des Umschlags, nicht unter data
    // (docs/api/belege.md 5.2, Spezifikation ReceiptsAdd_Success).
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
    tool: "bb_receipts_search",
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "list_direction passend zur Belegart setzen, wobei 'invoice inbound' und 'credit inbound' " +
      "zu 'inbound' gehören, dann in der Antwort nach counterparty {counterparty} mit " +
      "invoice_number {invoice_number} und amount {amount} suchen",
  },
  duplicateCheck: {
    tool: "bb_receipts_search",
    keyFields: ["date", "amount", "counterparty"],
    perBatch: true,
  },
  crossChecks: ["Q3", "Q5", "Q6"],
  invalidatesCache: [],
};
