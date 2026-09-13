// Werkzeug 17: `/invoices/create`, die endgültige Ausgangsrechnung.
//
// Klasse B: Das Werkzeug legt ein neues, nummeriertes Dokument an und
// überschreibt nichts, trägt deshalb `destructiveHint: false` — die Warnung läuft über den
// Pflichtsatz U4 und den `title` im Freigabedialog. Unumkehrbarkeit und Destruktivität
// fallen hier auseinander.
//
// Zwei Eigenheiten dieses Endpunkts stehen in den Beschreibungen, weil sie fachlich falsche
// Rechnungen erzeugen, ohne dass die API etwas meldet (rechnungen.md 2.3 und 2.4):
//
//   1. `item_amount` ist die **Menge**, nicht der Betrag. Ein Agent, der dort den
//      Rechnungsbetrag einsetzt, bekommt HTTP 200 und eine falsche Rechnung.
//   2. `date_of_supply` wirkt doppelt und wird bei einem Datum nach dem Rechnungsdatum
//      **stillschweigend verworfen** (Spezifikation, DATEV-Kompatibilität).
//
// `verifyWith` trägt `{ kind: "none" }`: Die API führt unterhalb von `/invoices/` keinen
// lesenden Pfad. Nach einem Zeitlimit bleibt die Weboberfläche.

import { z } from "zod";

import { isConfigLoaded } from "../../config/resolve.js";
import {
  API_MAX_BATCH,
  INVOICE_ITEM_COLUMNS,
  batchLimit,
  declarationSentence,
  invoiceItemItem,
  invoiceItems,
} from "../../schema/line-items.js";
import { boundedText, dateValue, unwrapSchema } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE, contactAddressBlock } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/**
 * Die Mengengrenze der Positionsliste: `min(50, BB_MCP_MAX_BATCH)`, sobald die
 * Konfiguration aufgelöst ist.
 *
 * Die Abfrage auf `isConfigLoaded()` ist kein Zierrat: Das Register wird auch ohne
 * aufgelöste Konfiguration geladen, nämlich von den dreizehn Registerprüfungen, und
 * `batchLimit()` wirft dann. Ohne Konfiguration gilt deshalb das
 * API-Maximum. Die **wirksame** Grenze erzwingt ohnehin Q4 zur Laufzeit aus der
 * eingefrorenen Konfiguration, zusätzlich Guard 5; ein zu großzügiges `maxItems` im
 * angekündigten Schema kostet höchstens eine Ablehnung vor dem Request, nie einen falschen
 * Datensatz.
 */
const ITEM_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

/**
 * Ein Feld aus einem Schemabaustein.
 *
 * Die Beschreibung kommt aus dem Baustein selbst, solange der Eintrag keine eigene nennt.
 * Das hält Schema und Registereintrag an einer Quelle; `src/schema/build.ts` setzt die
 * Beschreibung des Eintrags sonst über die des Bausteins, und eine abweichende zweite
 * Fassung wäre genau die stille Doppelung, die dieser Aufbau vermeidet.
 */
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
    throw new Error(
      `${spec.name}: Weder der Eintrag noch der Schemabaustein trägt eine Beschreibung.`,
    );
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

const ITEMS_PURPOSE =
  "Die Rechnungspositionen, je Eintrag eine Zeile des Dokuments. item_amount ist die Menge " +
  "und nicht der Betrag; der Preis einer Einheit steht in item_single_price.";

const ITEMS_DESCRIPTION = `${ITEMS_PURPOSE} ${declarationSentence(INVOICE_ITEM_COLUMNS)}`;

const DATE_DESCRIPTION =
  `Rechnungsdatum als YYYY-MM-DD, zum Beispiel 2026-04-26. ${EMPTY_STRING_SENTENCE} ` +
  "Die Spezifikation nennt hier kein Format; YYYY-MM-DD gilt überall sonst in dieser API.";

const RECURRING_DATE_DESCRIPTION =
  `Nächster Termin des Rechnungsplans als YYYY-MM-DD. ${EMPTY_STRING_SENTENCE} ` +
  "Pflicht, sobald recurring_interval gesetzt ist.";

const address = contactAddressBlock();
const item = invoiceItemItem().shape;

/** Werkzeug 17: `/invoices/create`. */
export const bb_invoices_create: ToolEntry = {
  name: "bb_invoices_create",
  title: "Rechnung erzeugen",
  group: "invoices",
  path: { literal: "/invoices/create" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Erzeugt in BuchhaltungsButler eine endgültige Ausgangsrechnung, eine Gutschrift oder " +
    "ein Angebot: nummeriert, als PDF und als Ausgangsbeleg der Buchhaltung. Zu nehmen, " +
    "sobald der Vorgang final ist, etwa 10 Std. Beratung zu 120.00 je Stunde; " +
    "bb_invoices_create_draft erzeugt stattdessen einen Entwurf ohne Nummernvergabe, " +
    "bb_invoices_create_einvoice eine E-Rechnung mit Steuerart je Position. Die API kennt " +
    "keinen Pfad, eine Rechnung oder ihr PDF zu lesen; nachsehen lässt sich das Ergebnis " +
    "nur in der Weboberfläche. Einen Währungsparameter gibt es nicht, Rechnungen über die " +
    "API laufen in Euro. Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. " +
    "Die API bietet keinen Endpunkt, das rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    field({
      name: "invoice_type",
      apiName: "type",
      required: true,
      description:
        "Art des Dokuments: 'invoice' Rechnung, 'credit' Gutschrift, 'offer' Angebot. Heißt " +
        "in der API type, hier umbenannt: type ist dort siebenfach belegt.",
      schema: z.enum(["invoice", "credit", "offer"]),
    }),
    field({
      name: "show_prices_type",
      required: true,
      description:
        "Preisdarstellung: 'net' Nettopreise, 'gross' Bruttopreise. Danach werden die Werte " +
        "in item_single_price gelesen.",
      schema: z.enum(["net", "gross"]),
    }),
    field({
      name: "company_name",
      required: true,
      schema: boundedText("Firmenname des Empfängers, wie er auf dem Dokument erscheint."),
    }),
    field({ name: "date", required: true, schema: dateValue(DATE_DESCRIPTION) }),
    {
      name: "items",
      apiNames: [
        "item_name",
        "item_amount",
        "item_unit",
        "item_vat",
        "item_single_price",
        "item_description",
      ],
      source: "body",
      required: true,
      description: ITEMS_DESCRIPTION,
      schema: invoiceItems({ description: ITEMS_PURPOSE, maxItems: ITEM_LIMIT }),
      transform: "parallel-arrays",
      itemFields: [
        field({ name: "item_name", required: true, schema: item.item_name }),
        field({ name: "item_amount", required: true, schema: item.item_amount }),
        field({ name: "item_unit", required: true, schema: item.item_unit }),
        field({ name: "item_vat", required: true, schema: item.item_vat }),
        field({ name: "item_single_price", required: true, schema: item.item_single_price }),
        field({ name: "item_description", schema: item.item_description }),
      ],
    },
    field({
      name: "invoicenumber",
      description:
        "Rechnungsnummer. Ohne Angabe vergibt BuchhaltungsButler sie aus dem eigenen " +
        "Nummernkreis.",
      schema: boundedText("Rechnungsnummer aus einem eigenen Nummernkreis."),
    }),
    field({
      name: "date_of_supply",
      description:
        "Liefer- oder Leistungsdatum, freier Text oder YYYY-MM-DD. Nur im Format YYYY-MM-DD " +
        "wird der Wert zusätzlich date_delivery des entstehenden Belegs. Ein Datum nach date " +
        "verwirft BuchhaltungsButler wegen der DATEV-Regel stillschweigend.",
      schema: boundedText("Liefer- oder Leistungsdatum, als Text oder als YYYY-MM-DD."),
    }),
    field({
      name: "due_days",
      description:
        "Tage bis zur Fälligkeit, Ziffernfolge, zum Beispiel 14. Nur dieses Feld erzeugt ein " +
        "Fälligkeitsdatum. Die Vorgabe ohne Angabe ist hier nicht dokumentiert.",
      schema: z
        .string()
        .regex(/^\d+$/, { error: "erwartet wird eine Ziffernfolge, zum Beispiel 14" })
        .describe("Tage zwischen Rechnungsdatum und Fälligkeit, zum Beispiel 14."),
    }),
    field({
      name: "payment_conditions",
      description:
        "Zahlungsbedingungen als Text auf dem Dokument. Erzeugt kein Fälligkeitsdatum, " +
        "dafür ist due_days da.",
      schema: boundedText("Zahlungsbedingungen als Text auf dem Dokument."),
    }),
    field({
      name: "correspondence",
      schema: boundedText("Anschreiben an den Empfänger, erscheint vor den Positionen."),
    }),
    field({
      name: "final_provisions",
      schema: boundedText("Schlusstext des Dokuments, erscheint nach den Positionen."),
    }),
    field({
      name: "discount_type",
      description:
        "Rabatt auf die gesamte Rechnung: 'percent' Prozent, 'EUR' Euro. Positionsrabatte " +
        "kennt die API nicht; gemeinsam mit discount_value setzen.",
      schema: z.enum(["percent", "EUR"]),
    }),
    field({
      name: "discount_value",
      description:
        "Höhe des Rabatts mit Dezimalpunkt, zum Beispiel 10 oder 49.50. Die Bedeutung " +
        "entscheidet discount_type.",
      schema: z
        .string()
        .regex(/^\d+(?:\.\d{1,2})?$/, {
          error: "erwartet wird eine Zahl mit Dezimalpunkt, zum Beispiel 10 oder 49.50",
        })
        .describe("Höhe des Rabatts, zum Beispiel 10 oder 49.50."),
    }),
    field({
      name: "payment_reference",
      description:
        "Zahlungsreferenz für die spätere Zuordnung zu einer Zahlung: Amazon-Bestellnummer " +
        "oder Vorgangsnummer von PayPal oder Stripe.",
      schema: boundedText("Zahlungsreferenz, etwa eine PayPal-Vorgangsnummer."),
    }),
    field({
      name: "language",
      description:
        "Sprache der festen Beschriftungen: 'de_DE' oder 'en_US', ohne Angabe 'de_DE'. " +
        "Positionstexte werden nicht übersetzt.",
      schema: z.enum(["de_DE", "en_US"]),
    }),
    field({
      name: "show_bankdata",
      description:
        "true zeigt die im Mandanten hinterlegte Bankverbindung auf dem Dokument. Die " +
        "Bankdaten selbst stammen aus den Mandanteneinstellungen.",
      schema: z.boolean().describe("true zeigt die hinterlegte Bankverbindung auf dem Dokument."),
    }),
    field({
      name: "show_contactdata",
      description: "true zeigt die im Mandanten hinterlegten Kontaktdaten auf dem Dokument.",
      schema: z.boolean().describe("true zeigt die hinterlegten Kontaktdaten auf dem Dokument."),
    }),
    field({ name: "customer_number", schema: address.customer_number }),
    field({ name: "contact_person_name", schema: address.contact_person_name }),
    field({ name: "street", schema: address.street }),
    // Debitoren und Kreditoren führen `additional_address_line`, die drei Rechnungsendpunkte
    // `additional_addressline` ohne Unterstrich. Anhang A benennt das Feld nicht um;
    // gesendet wird der Name dieses Endpunkts.
    field({ name: "additional_addressline", schema: address.additional_address_line }),
    field({ name: "zip", schema: address.zip }),
    field({ name: "city", schema: address.city }),
    field({
      name: "country",
      schema: boundedText(
        "Land des Empfängers, deutscher Ländername oder ISO-Code, zum Beispiel DK.",
      ),
    }),
    field({ name: "email", schema: address.email }),
    field({
      name: "recurring_interval",
      description:
        "Rhythmus eines Rechnungsplans: 'weekly', 'monthly', 'quarterly' oder 'yearly'. Es " +
        "entsteht ein dauerhafter Plan, der selbsttätig weitere Rechnungen erzeugt und über " +
        "die API weder lesbar noch zu beenden ist.",
      schema: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
    }),
    field({ name: "recurring_date_next", schema: dateValue(RECURRING_DATE_DESCRIPTION) }),
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt." }],
  // Die drei Felder stehen **auf oberster Ebene** des Umschlags und nicht unter `data`
  // (Spezifikation `InvoicesCreate_Success`); deshalb `container: "none"`.
  responseContract: {
    container: "none",
    fields: {
      id_by_customer: "id-string",
      invoicenumber: "string",
      file_name: "string",
    },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "none",
    reason:
      "Die API führt unterhalb von /invoices/ keinen lesenden Pfad; eine erzeugte Rechnung " +
      "ist über die API nicht abrufbar. In der Weboberfläche von BuchhaltungsButler unter " +
      "Rechnungsstellung nachsehen, ob die Rechnung vorliegt.",
  },
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
