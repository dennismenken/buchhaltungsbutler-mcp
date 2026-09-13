// Werkzeug 19 aus Plan 3.8: `/invoices/create/e-invoice`, die E-Rechnung.
//
// Strengste Feldprüfung der API (Plan 3.8, rechnungen.md 1.1 und 4.1): Gegenüber
// `/invoices/create` sind `street`, `zip`, `city`, `country` und `email` des Empfängers
// Pflicht, dazu die Käuferreferenz `e_invoice_id`, und je Position treten `item_tax_type`
// und `item_tax_amount` an die Stelle von `item_vat`.
//
// **Q8** hängt genau hier (Plan 4.7): Die Spezifikation führt `item_tax_amount` als
// `required: true` und schreibt zugleich „Only required if corresponding item_tax_type = 'S'
// (VAT)". Die beiden Angaben widersprechen sich. Ein hartes Pflichtfeld lehnte die fünf
// übrigen Steuerarten ab, bei denen es gar keinen Satz gibt; deshalb ist das Feld im
// Positionsobjekt optional, und Q8 verlangt es dort, wo die Steuerart es braucht. Ein
// ersatzlos optionales Feld ohne Querprüfung wäre der bequeme Ausweg: Der Widerspruch
// verschwände aus dem Schema und schlüge erst als Ablehnung der API auf.
//
// `verifyWith` trägt `{ kind: "none" }`: Die API führt unterhalb von `/invoices/` keinen
// lesenden Pfad (Plan 2.1, 3.5 U4, P10).

import { z } from "zod";

import { isConfigLoaded } from "../../config/resolve.js";
import {
  API_MAX_BATCH,
  EINVOICE_ITEM_COLUMNS,
  batchLimit,
  declarationSentence,
  einvoiceItemItem,
  einvoiceItems,
} from "../../schema/line-items.js";
import { boundedText, dateValue, unwrapSchema } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE, contactAddressBlock } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/**
 * Die Mengengrenze der Positionsliste: `min(50, BB_MCP_MAX_BATCH)`, sobald die
 * Konfiguration aufgelöst ist (Plan 4.7 Q4, 4.8). Ohne aufgelöste Konfiguration — so laden
 * die Registerprüfungen das Register — gilt das API-Maximum; die wirksame Grenze erzwingt
 * Q4 zur Laufzeit, zusätzlich Guard 5.
 */
const ITEM_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein selbst. */
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
  "Die Positionen der E-Rechnung, je Eintrag eine Zeile des Dokuments. item_amount ist die " +
  "Menge und nicht der Betrag; der Preis einer Einheit steht in item_single_price. Die " +
  "Steuer wird hier als Steuerart item_tax_type angegeben, nicht als item_vat.";

const ITEMS_DESCRIPTION = `${ITEMS_PURPOSE} ${declarationSentence(EINVOICE_ITEM_COLUMNS)}`;

const DATE_DESCRIPTION =
  `Rechnungsdatum als YYYY-MM-DD, zum Beispiel 2026-04-26. ${EMPTY_STRING_SENTENCE} ` +
  "Die Spezifikation nennt hier kein Format; YYYY-MM-DD gilt überall sonst in dieser API.";

const RECURRING_DATE_DESCRIPTION =
  `Nächster Termin des Rechnungsplans als YYYY-MM-DD. ${EMPTY_STRING_SENTENCE} ` +
  "Pflicht, sobald recurring_interval gesetzt ist.";

const address = contactAddressBlock();
const item = einvoiceItemItem().shape;

/** Werkzeug 19: `/invoices/create/e-invoice`. */
export const bb_invoices_create_einvoice: ToolEntry = {
  name: "bb_invoices_create_einvoice",
  title: "E-Rechnung erzeugen",
  group: "invoices",
  path: { literal: "/invoices/create/e-invoice" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Erzeugt in BuchhaltungsButler eine E-Rechnung: endgültig, nummeriert, mit PDF und " +
    "strukturiertem Datensatz nach EN 16931. Zu nehmen für Empfänger, die eine E-Rechnung " +
    "verlangen, etwa öffentliche Auftraggeber; bb_invoices_create erzeugt die gewöhnliche " +
    "Rechnung, bb_invoices_create_draft einen Entwurf. Strengste Feldprüfung der API: Die " +
    "Käuferreferenz e_invoice_id sowie street, zip, city, country und email des Empfängers " +
    "sind Pflicht, und je Position stehen item_tax_type und item_tax_amount an der Stelle " +
    "von item_vat. Die API kennt keinen Pfad, eine Rechnung zu lesen; nachsehen lässt sich " +
    "das Ergebnis nur in der Weboberfläche. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Die API bietet keinen Endpunkt, das rückgängig zu machen.",
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
    field({
      name: "e_invoice_id",
      required: true,
      description:
        "Käuferreferenz des Empfängers, in der Norm die Leitweg-Identifikationsnummer. Ohne " +
        "eigene Referenz '0' senden; öffentliche Auftraggeber geben sie vor.",
      schema: boundedText("Käuferreferenz des Empfängers, ohne eigene Referenz '0'."),
    }),
    {
      name: "items",
      apiNames: [
        "item_name",
        "item_amount",
        "item_unit",
        "item_tax_type",
        "item_tax_amount",
        "item_single_price",
        "item_description",
      ],
      source: "body",
      required: true,
      description: ITEMS_DESCRIPTION,
      schema: einvoiceItems({ description: ITEMS_PURPOSE, maxItems: ITEM_LIMIT }),
      transform: "parallel-arrays",
      itemFields: [
        field({ name: "item_name", required: true, schema: item.item_name }),
        field({ name: "item_amount", required: true, schema: item.item_amount }),
        field({ name: "item_unit", required: true, schema: item.item_unit }),
        field({ name: "item_tax_type", required: true, schema: item.item_tax_type }),
        // Im Positionsobjekt optional, im Body-Parameter der Spezifikation `required: true`.
        // Den Widerspruch löst Q8 auf der sicheren Seite auf: Das Array wird immer erzeugt,
        // Positionen ohne Steuersatz tragen darin null.
        field({ name: "item_tax_amount", schema: item.item_tax_amount }),
        field({ name: "item_single_price", required: true, schema: item.item_single_price }),
        field({ name: "item_description", schema: item.item_description }),
      ],
    },
    field({ name: "street", required: true, schema: address.street }),
    field({ name: "zip", required: true, schema: address.zip }),
    field({ name: "city", required: true, schema: address.city }),
    field({
      name: "country",
      required: true,
      schema: boundedText(
        "Land des Empfängers, deutscher Ländername oder ISO-Code, zum Beispiel DK.",
      ),
    }),
    field({
      name: "email",
      required: true,
      description: "E-Mail-Adresse des Empfängers. Hier Pflicht, an bb_invoices_create nicht.",
      schema: address.email,
    }),
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
        "Tage bis zur Fälligkeit, Ziffernfolge, zum Beispiel 14. Ohne Angabe gilt 0, die " +
        "Rechnung ist dann sofort fällig. Nur dieses Feld erzeugt ein Fälligkeitsdatum.",
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
    // `additional_addressline` ohne Unterstrich: So heißt das Feld an den drei
    // Rechnungsendpunkten, während Debitoren und Kreditoren `additional_address_line`
    // führen. Anhang A benennt es nicht um.
    field({ name: "additional_addressline", schema: address.additional_address_line }),
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)." }],
  // Drei Felder **auf oberster Ebene** des Umschlags, nicht unter `data` (Spezifikation
  // `InvoicesCreateEInvoice_Success`); deshalb `container: "none"`.
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
      "Die API führt unterhalb von /invoices/ keinen lesenden Pfad; eine erzeugte E-Rechnung " +
      "ist über die API nicht abrufbar. In der Weboberfläche von BuchhaltungsButler unter " +
      "Rechnungsstellung nachsehen, ob die Rechnung vorliegt.",
  },
  crossChecks: ["Q3", "Q4", "Q8"],
  invalidatesCache: [],
};
