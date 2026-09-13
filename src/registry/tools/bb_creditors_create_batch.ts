// Werkzeug 38 von 54: `/settings/add-batch/creditors` (Plan 3.8, Arbeitspaket AP12d).
//
// Ein fachlicher Parameter, `creditors`, mit einem Verweis auf die Definition
// `SettingsCreditors`. Der Behälter wird **nicht** umbenannt (Anhang A). Die zwölf
// Eigenschaften des Elements `SettingsCreditor` stehen als `itemFields` hier und werden von
// der zweiten Deckungsstufe aus Plan 4.4 Punkt 3 gegen die aufgelöste Elementdefinition
// aufgerechnet.
//
// **Das Element führt kein `email`, der Einzelendpunkt `/settings/add/creditor` schon.** Wie
// beim Debitorenstapel ist das eine Ungereimtheit der Spezifikation und keine fachliche
// Unterscheidung; ein erfundenes Feld scheiterte an einem Aufruf, den die API sonst annimmt.
//
// **Das Erfolgsarray der Antwort heißt hier `creditors` und beim Debitorenstapel `debtors`.**
// Beide Endpunkte sind damit nicht über einen gemeinsamen Parser lesbar, ohne den Schlüssel
// zu parametrisieren — ein Beispiel dafür, warum der Antwortvertrag je Endpunkt gilt
// (Plan 7.2).
//
// **Zur Mengengrenze:** `maxItems` wird ausdrücklich mit `API_MAX_BATCH` gesetzt, weil dieses
// Modul beim Import ausgewertet wird und die Konfiguration zu diesem Zeitpunkt noch nicht
// aufgelöst ist. Die wirksame Grenze `min(50, BB_MCP_MAX_BATCH)` erzwingt Q4 zur Laufzeit
// (Plan 4.7), zusätzlich Guard 5; das Schema ist damit höchstens weiter als die Guards, nie
// enger. Die 50 ist an diesem Endpunkt **nicht verifiziert**, sondern defensiv aus
// `/receipts/addBatch` übernommen (Plan 14.2).

import { z } from "zod";

import { batchContainer } from "../../schema/batch.js";
import { API_MAX_BATCH } from "../../schema/line-items.js";
import { boundedText, strictObject } from "../../schema/primitives.js";
import { bic, contactAddressBlock, iban } from "../../schema/vocab.js";
import type { ContactAddressField } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const address = contactAddressBlock();

const NAME_DESCRIPTION = "Name des Lieferantenkontos, zum Beispiel Musterlieferant GmbH.";
const NUMBER_DESCRIPTION =
  "Kontonummer des neuen Kreditorenkontos als Zeichenkette. Ohne Angabe vergibt " +
  "BuchhaltungsButler die nächste freie Nummer. Belegte Nummern zeigt bb_creditors_search.";
const DUE_DESCRIPTION =
  "Zahlungsfrist in Tagen, zum Beispiel 14. Schreibbar, aber von keinem lesenden Endpunkt " +
  "der API zurückgeliefert; der gesetzte Wert ist danach nur in der Weboberfläche von " +
  "BuchhaltungsButler zu sehen.";

/** Zahlungsfrist in Tagen. Ganzzahl laut Spezifikation, 0 ist zulässig (sofort fällig). */
function dueInDays(): z.ZodNumber {
  return z
    .number()
    .int({ error: "erwartet wird eine ganze Zahl" })
    .min(0, { error: "muss 0 oder größer sein" })
    .describe(DUE_DESCRIPTION);
}

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

/** Die zwölf Eigenschaften der Elementdefinition `SettingsCreditor`, in ihrer Reihenfolge. */
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
  {
    name: "due_in_days",
    apiNames: ["due_in_days"],
    source: "body",
    required: false,
    description: DUE_DESCRIPTION,
    schema: dueInDays(),
  },
];

const creditorItem = strictObject({
  name: boundedText(NAME_DESCRIPTION),
  postingaccount_number: boundedText(NUMBER_DESCRIPTION).optional(),
  contact_person_name: address.contact_person_name.optional(),
  street: address.street.optional(),
  additional_address_line: address.additional_address_line.optional(),
  zip: address.zip.optional(),
  city: address.city.optional(),
  country: address.country.optional(),
  sales_tax_id: address.sales_tax_id.optional(),
  iban: iban().optional(),
  bic: bic().optional(),
  due_in_days: dueInDays().optional(),
});

const creditors = batchContainer("bb_creditors_create_batch", creditorItem, {
  description:
    "Die anzulegenden Kreditorenkonten. Ein Element trägt dieselben Felder wie " +
    "bb_creditors_create, allerdings ohne email.",
  maxItems: API_MAX_BATCH,
});

export const bb_creditors_create_batch: ToolEntry = {
  name: "bb_creditors_create_batch",
  title: "Kreditorenkonten im Stapel anlegen",
  path: { literal: "/settings/add-batch/creditors" },
  effect: "create",
  toolClass: "A",
  tier: 3,
  description:
    "Legt mehrere Kreditorenkonten in BuchhaltungsButler in einem Aufruf an. Gedacht für die " +
    "Übernahme einer Lieferantenliste. Ein Element trägt dieselben Felder wie " +
    "bb_creditors_create, allerdings ohne email. Die Antwort meldet Teilerfolg: Das Array " +
    "errors nennt jeden abgelehnten Eintrag. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Die API bietet keinen Endpunkt, das rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    {
      name: "creditors",
      apiNames: ["creditors"],
      source: "body",
      required: true,
      description: creditors.description ?? "",
      schema: creditors,
      itemFields,
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Die Antwort trägt weder `data` noch `rows`, sondern die beiden Arrays `creditors` und
  // `errors` auf oberster Ebene. Arrays sind in `ContractFieldType` (Plan 2.1) nicht
  // abbildbar; sie werden als unbekannte Felder unverändert durchgereicht (Plan 7.3).
  // `success: true` bedeutet NICHT, dass alle Konten angelegt wurden.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_creditors_search",
    argsFrom: { creditors: "creditors" },
    hint: "in der gelieferten Liste nach den Namen der gesendeten Einträge suchen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  duplicateCheck: { tool: "bb_creditors_search", keyFields: ["name"], perBatch: true },
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: ["bb_creditors_search", "bb_postingaccounts_search"],
};
