// Werkzeug 34 von 54: `/settings/add-batch/debtors` (Plan 3.8, Arbeitspaket AP12d).
//
// Der Endpunkt führt genau einen fachlichen Parameter, `debtors`, und der verweist auf die
// Definition `SettingsDebtors`. Der Behälter wird **nicht** umbenannt (Anhang A): Er ist
// bereits eine Objektliste, und ein zweiter Name für dasselbe wäre eine Umbenennung ohne
// Gewinn. Die zwölf Eigenschaften des Elements `SettingsDebtor` stehen als `itemFields` hier
// und werden von der zweiten Deckungsstufe aus Plan 4.4 Punkt 3 gegen die aufgelöste
// Elementdefinition aufgerechnet.
//
// **Das Element führt kein `email`, der Einzelendpunkt `/settings/add/debtor` schon.** Das
// ist eine Ungereimtheit der Spezifikation und keine fachliche Unterscheidung; sie wird hier
// nicht geglättet, weil ein erfundenes Feld an einem Stapelaufruf scheiterte, den die API
// sonst annimmt.
//
// **Zur Mengengrenze:** `maxItems` wird ausdrücklich mit `API_MAX_BATCH` gesetzt und nicht
// aus der Konfiguration geholt. Der Grund ist die Ladereihenfolge: Dieses Modul wird beim
// Import ausgewertet, die Konfiguration ist zu diesem Zeitpunkt noch nicht aufgelöst, und
// `batchLimit()` ohne Vorgabe würde werfen. Die wirksame Grenze `min(50, BB_MCP_MAX_BATCH)`
// erzwingt Q4 zur Laufzeit aus der dann aufgelösten Konfiguration (Plan 4.7), zusätzlich
// Guard 5; das Schema ist damit höchstens weiter als die Guards, nie enger.

import { batchContainer } from "../../schema/batch.js";
import { API_MAX_BATCH } from "../../schema/line-items.js";
import { boundedText, strictObject } from "../../schema/primitives.js";
import { bic, contactAddressBlock, iban } from "../../schema/vocab.js";
import type { ContactAddressField } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const address = contactAddressBlock();

const NAME_DESCRIPTION = "Name des Kundenkontos, zum Beispiel Musterkunde GmbH.";
const NUMBER_DESCRIPTION =
  "Kontonummer des neuen Debitorenkontos als Zeichenkette. Ohne Angabe vergibt " +
  "BuchhaltungsButler die nächste freie Nummer. Belegte Nummern zeigt bb_debtors_search.";

/** Ein Feld des Adress- und Kontaktblocks innerhalb eines Stapelelements. */
function addressField(name: ContactAddressField): FieldSpec {
  const schema = address[name];
  return {
    name,
    apiNames: [name],
    source: "body",
    required: false,
    description: schema.description ?? "",
    schema,
  };
}

/** Die zwölf Eigenschaften der Elementdefinition `SettingsDebtor`, in ihrer Reihenfolge. */
const itemFields: FieldSpec[] = [
  {
    name: "name",
    apiNames: ["name"],
    source: "body",
    required: true,
    description: NAME_DESCRIPTION,
    schema: boundedText(NAME_DESCRIPTION),
  },
  {
    name: "postingaccount_number",
    apiNames: ["postingaccount_number"],
    source: "body",
    required: false,
    description: NUMBER_DESCRIPTION,
    schema: boundedText(NUMBER_DESCRIPTION),
  },
  addressField("contact_person_name"),
  addressField("street"),
  addressField("additional_address_line"),
  addressField("customer_number"),
  addressField("zip"),
  addressField("city"),
  addressField("country"),
  addressField("sales_tax_id"),
  {
    name: "iban",
    apiNames: ["iban"],
    source: "body",
    required: false,
    description: iban().description ?? "",
    schema: iban(),
  },
  {
    name: "bic",
    apiNames: ["bic"],
    source: "body",
    required: false,
    description: bic().description ?? "",
    schema: bic(),
  },
];

const debtorItem = strictObject({
  name: boundedText(NAME_DESCRIPTION),
  postingaccount_number: boundedText(NUMBER_DESCRIPTION).optional(),
  contact_person_name: address.contact_person_name.optional(),
  street: address.street.optional(),
  additional_address_line: address.additional_address_line.optional(),
  customer_number: address.customer_number.optional(),
  zip: address.zip.optional(),
  city: address.city.optional(),
  country: address.country.optional(),
  sales_tax_id: address.sales_tax_id.optional(),
  iban: iban().optional(),
  bic: bic().optional(),
});

const debtors = batchContainer("bb_debtors_create_batch", debtorItem, {
  description:
    "Die anzulegenden Debitorenkonten. Ein Element trägt dieselben Felder wie " +
    "bb_debtors_create, allerdings ohne email.",
  maxItems: API_MAX_BATCH,
});

export const bb_debtors_create_batch: ToolEntry = {
  name: "bb_debtors_create_batch",
  title: "Debitorenkonten im Stapel anlegen",
  path: { literal: "/settings/add-batch/debtors" },
  effect: "create",
  toolClass: "A",
  tier: 3,
  description:
    "Legt mehrere Debitorenkonten in BuchhaltungsButler in einem Aufruf an. Gedacht für die " +
    "Übernahme einer Kundenliste. Ein Element trägt dieselben Felder wie bb_debtors_create, " +
    "allerdings ohne email. Die Antwort meldet Teilerfolg: Das Array errors nennt jeden " +
    "abgelehnten Eintrag. Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. " +
    "Die API bietet keinen Endpunkt, das rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    {
      name: "debtors",
      apiNames: ["debtors"],
      source: "body",
      required: true,
      description: debtors.description ?? "",
      schema: debtors,
      itemFields,
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Die Antwort trägt weder `data` noch `rows`, sondern zwei parallele Arrays `debtors` und
  // `errors` auf oberster Ebene. Beide sind Listen und damit in `ContractFieldType` (Plan
  // 2.1) nicht abbildbar; sie werden als unbekannte Felder unverändert durchgereicht
  // (Plan 7.3, letzte Zeile). `success: true` bedeutet hier NICHT, dass alle Konten angelegt
  // wurden — `errors` ist zwingend auszuwerten.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_debtors_search",
    argsFrom: { debtors: "debtors" },
    hint: "in der gelieferten Liste nach den Namen der gesendeten Einträge suchen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  duplicateCheck: { tool: "bb_debtors_search", keyFields: ["name"], perBatch: true },
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: ["bb_debtors_search", "bb_postingaccounts_search"],
};
