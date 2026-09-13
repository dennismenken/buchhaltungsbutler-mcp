// Werkzeug 37 von 54: `/settings/add/creditor` (Plan 3.8, Arbeitspaket AP12d).
//
// Wie `bb_debtors_create`, mit **drei** Unterschieden, die in der Spezifikation leicht
// übersehen werden und hier deshalb ausgeschrieben sind:
//
//  1. **`due_in_days` gibt es nur beim Kreditor.** Die Zahlungsfrist ist schreibbar, wird
//     aber von `/settings/get/creditors` nicht zurückgeliefert (live geprüft,
//     `docs/api/stammdaten.md`). Der gesetzte Wert ist über die API nicht mehr lesbar.
//  2. **`customer_number` gibt es hier nicht.** Der Debitorenendpunkt führt das Feld, dieser
//     nicht — die Antwort von `/settings/get/creditors` liefert es trotzdem, dort durchgehend
//     als `null`.
//  3. **Der Beschreibungstext von `due_in_days` lautet in der Spezifikation wörtlich „The due
//     in days of your new debtor account“**, also mit dem falschen Objekt. Das ist ein
//     Pflegefehler der Spezifikation und keine fachliche Aussage über Debitoren.
//
// Die neun Adress- und Kontaktfelder kommen aus `contactAddressBlock()` und tragen damit das
// Kurzmuster aus Sparmaßnahme S4 (höchstens 80 Zeichen je Feld, Plan 4.10). Das Element
// `SettingsCreditor` der Stapelvariante führt dieselben Felder **ohne** `email`.

import { z } from "zod";

import { boundedText } from "../../schema/primitives.js";
import { bic, contactAddressBlock, iban } from "../../schema/vocab.js";
import type { ContactAddressField } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const address = contactAddressBlock();

/** Ein Feld des Adress- und Kontaktblocks. Der Werkzeugname ist gleich dem API-Namen. */
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

export const bb_creditors_create: ToolEntry = {
  name: "bb_creditors_create",
  title: "Kreditorenkonto anlegen",
  group: "creditors",
  path: { literal: "/settings/add/creditor" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description:
    "Legt ein Kreditorenkonto, also ein Lieferantenkonto, in BuchhaltungsButler an. Gedacht " +
    "für einen neuen Lieferanten, bevor eine Eingangsrechnung kreditorisch erfasst wird. " +
    "Ohne postingaccount_number vergibt BuchhaltungsButler die nächste freie Nummer und " +
    "nennt sie in der Antwort. Mehrere Konten in einem Aufruf legt bb_creditors_create_batch " +
    "an; Kunden sind Debitoren und gehören zu bb_debtors_create. Schreibt in die echten " +
    "Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das " +
    "rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
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
    addressField("email"),
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
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Kein `data`: Die vergebene Kontonummer steht auf oberster Ebene des Umschlags.
  responseContract: {
    container: "none",
    fields: { postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // `bb_creditors_search` nimmt keinen Filter an; `argsFrom` nennt deshalb den gesuchten Wert
  // und keinen Suchparameter, und der Hinweis sagt, dass in der Liste zu suchen ist.
  verifyWith: {
    kind: "tool",
    tool: "bb_creditors_search",
    argsFrom: { name: "name" },
    hint: "in der gelieferten Liste nach diesem Namen suchen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  duplicateCheck: { tool: "bb_creditors_search", keyFields: ["name"], perBatch: true },
  crossChecks: ["Q3"],
  // Ein neuer Kreditor erscheint auch in der vereinigten Kontenliste von
  // `/settings/get/postingaccounts` (Plan 7.8, erste Zeile).
  invalidatesCache: ["bb_creditors_search", "bb_postingaccounts_search"],
};
