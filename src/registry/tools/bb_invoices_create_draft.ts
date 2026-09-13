// Werkzeug 18 aus Plan 3.8: `/invoices/create/draft`, der Rechnungsentwurf.
//
// Der Endpunkt ist eine abgespeckte Fassung von `/invoices/create`: dieselben Pflichtfelder,
// aber **keine** Nummernvergabe, **kein** PDF und drei Parameter weniger (`invoicenumber`,
// `due_days`, `payment_reference`). Die Erfolgsantwort trägt ausschließlich `success` und
// `message`; weder `id_by_customer` noch `invoicenumber` kommen zurück (rechnungen.md 1.1
// und 5.3). Der Antwortvertrag ist deshalb leer, und das ist ein Befund und keine Lücke.
//
// Klasse B (Plan 3.3): Der Entwurf ist ein neues, sichtbares Objekt und überschreibt nichts.
// `verifyWith` trägt `{ kind: "none" }`, weil die API unterhalb von `/invoices/` keinen
// lesenden Pfad führt (Plan 2.1, P10).
//
// **Nicht verifiziert:** Das Hilfecenter schreibt, Entwürfe würden ohne Rechnungsdatum
// gespeichert, die API verlangt `date` aber als Pflichtfeld. Ob das Datum gespeichert,
// verworfen oder beim Finalisieren überschrieben wird, ist offen (rechnungen.md 1.1).

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
  "Die Positionen des Entwurfs, je Eintrag eine Zeile des späteren Dokuments. item_amount " +
  "ist die Menge und nicht der Betrag; der Preis einer Einheit steht in item_single_price.";

const ITEMS_DESCRIPTION = `${ITEMS_PURPOSE} ${declarationSentence(INVOICE_ITEM_COLUMNS)}`;

const DATE_DESCRIPTION =
  `Rechnungsdatum als YYYY-MM-DD, zum Beispiel 2026-04-26. ${EMPTY_STRING_SENTENCE} ` +
  "Ob der Wert im Entwurf erhalten bleibt, ist nicht verifiziert.";

const RECURRING_DATE_DESCRIPTION =
  `Nächster Termin des Rechnungsplans als YYYY-MM-DD. ${EMPTY_STRING_SENTENCE} ` +
  "Pflicht, sobald recurring_interval gesetzt ist.";

const address = contactAddressBlock();
const item = invoiceItemItem().shape;

/** Werkzeug 18: `/invoices/create/draft`. */
export const bb_invoices_create_draft: ToolEntry = {
  name: "bb_invoices_create_draft",
  title: "Rechnungsentwurf erzeugen",
  path: { literal: "/invoices/create/draft" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Erzeugt in BuchhaltungsButler einen Rechnungsentwurf: ohne endgültige Nummer, ohne PDF, " +
    "aber als sichtbares Objekt in der Rechnungsstellung des Mandanten. Zu nehmen, solange " +
    "der Vorgang noch abgestimmt wird, etwa ein Angebot zur internen Durchsicht; " +
    "bb_invoices_create erzeugt die endgültige, nummerierte Rechnung, " +
    "bb_invoices_create_einvoice die E-Rechnung. Die Antwort trägt ausschließlich success " +
    "und message: keine id_by_customer, keine invoicenumber, und die API kennt keinen Pfad, " +
    "den Entwurf später zu lesen. Die Felder invoicenumber, due_days und payment_reference " +
    "führt dieser Endpunkt nicht. Schreibt in die echten Buchhaltungsdaten von " +
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
      name: "date_of_supply",
      description:
        "Liefer- oder Leistungsdatum, freier Text oder YYYY-MM-DD. Nur im Format YYYY-MM-DD " +
        "wird der Wert zusätzlich date_delivery des entstehenden Belegs. Ein Datum nach date " +
        "verwirft BuchhaltungsButler wegen der DATEV-Regel stillschweigend.",
      schema: boundedText("Liefer- oder Leistungsdatum, als Text oder als YYYY-MM-DD."),
    }),
    field({
      name: "payment_conditions",
      description:
        "Zahlungsbedingungen als Text auf dem Dokument. Ein Fälligkeitsdatum entsteht daraus " +
        "nicht; das Feld due_days führt dieser Endpunkt nicht.",
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
    // `additional_addressline` ohne Unterstrich: So heißt das Feld an den drei
    // Rechnungsendpunkten, während Debitoren und Kreditoren `additional_address_line`
    // führen. Anhang A benennt es nicht um.
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)." }],
  // Leer, und zwar belegt: `InvoicesCreateDraft_Success` führt ausschließlich `success` und
  // `message`. Ein erfundenes Feld erzeugte bei jedem Aufruf eine `_contract_warnings`-Zeile.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "none",
    reason:
      "Die API führt unterhalb von /invoices/ keinen lesenden Pfad, und der Entwurf trägt " +
      "nicht einmal eine zurückgemeldete Kennung. In der Weboberfläche von " +
      "BuchhaltungsButler unter Rechnungsstellung nachsehen, ob der Entwurf vorliegt.",
  },
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
