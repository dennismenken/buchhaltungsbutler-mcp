// Werkzeug 33 von 54: `/settings/add/debtor` (Plan 3.8, Arbeitspaket AP12d).
//
// Die neun Adress- und Kontaktfelder kommen aus `contactAddressBlock()` und tragen damit das
// Kurzmuster aus Sparmaßnahme S4 (höchstens 80 Zeichen je Feld, Plan 4.10). Sie rund 90-mal
// auszuschreiben wäre der größte vermeidbare Posten des Kontextbudgets.
//
// `iban` und `bic` stehen bewusst außerhalb dieses Blocks (`vocab.ts`): Eine überschriebene
// Bankverbindung ist ein anderer Schaden als eine überschriebene Postadresse.
//
// **Zwei Abweichungen der Spezifikation, die hier sichtbar bleiben müssen:**
//
//  1. `postingaccount_number` ist an diesem Endpunkt eine Zeichenkette, an
//     `/settings/update/debtor` dagegen eine Ganzzahl. Beide Einträge senden deshalb
//     verschiedene JSON-Typen für denselben fachlichen Wert.
//  2. Das Stapelelement `SettingsDebtor` führt **kein** `email`, dieser Einzelendpunkt
//     schon. Die Spezifikation erklärt Element und Einzelendpunkt ausdrücklich für gleich;
//     einer der beiden Stände ist also falsch gepflegt. Regel R-A aus Plan 4.5 greift nicht,
//     weil sie Wertevorrat und Pflichtigkeit eines **vorhandenen** Feldes gleichzieht und
//     kein fehlendes Feld erfindet.

import { boundedText } from "../../schema/primitives.js";
import { bic, contactAddressBlock, iban } from "../../schema/vocab.js";
import type { ContactAddressField } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const address = contactAddressBlock();

/** Ein Feld des Adress- und Kontaktblocks. Der Werkzeugname ist hier gleich dem API-Namen. */
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

/** Ein freies Textfeld, dessen Beschreibung an genau einer Stelle steht. */
function textField(name: string, required: boolean, description: string): FieldSpec {
  return {
    name,
    apiNames: [name],
    source: "body",
    required,
    description,
    schema: boundedText(description),
  };
}

export const bb_debtors_create: ToolEntry = {
  name: "bb_debtors_create",
  title: "Debitorenkonto anlegen",
  path: { literal: "/settings/add/debtor" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description:
    "Legt ein Debitorenkonto, also ein Kundenkonto, in BuchhaltungsButler an. Gedacht für " +
    "einen neuen Kunden, bevor ihm eine Ausgangsrechnung zugeordnet wird. Ohne " +
    "postingaccount_number vergibt BuchhaltungsButler die nächste freie Nummer und nennt " +
    "sie in der Antwort. Mehrere Konten in einem Aufruf legt bb_debtors_create_batch an; " +
    "Lieferanten sind Kreditoren und gehören zu bb_creditors_create. Schreibt in die echten " +
    "Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das " +
    "rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    textField("name", true, "Name des Kundenkontos, zum Beispiel Musterkunde GmbH."),
    textField(
      "postingaccount_number",
      false,
      "Kontonummer des neuen Debitorenkontos als Zeichenkette. Ohne Angabe vergibt " +
        "BuchhaltungsButler die nächste freie Nummer. Belegte Nummern zeigt bb_debtors_search.",
    ),
    addressField("contact_person_name"),
    addressField("street"),
    addressField("additional_address_line"),
    addressField("customer_number"),
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
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Die Antwort trägt kein `data`: Die vergebene Kontonummer steht auf oberster Ebene des
  // Umschlags (Plan 7.6, `docs/api/stammdaten.md`). Das ist der einzige Weg, an eine
  // automatisch vergebene Nummer zu kommen.
  responseContract: {
    container: "none",
    fields: { postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // `bb_debtors_search` nimmt keinen Filter an; der Endpunkt führt nur limit und offset.
  // `argsFrom` nennt deshalb den gesuchten Wert und keinen Suchparameter, und der Hinweis
  // sagt ausdrücklich, dass in der gelieferten Liste zu suchen ist.
  verifyWith: {
    kind: "tool",
    tool: "bb_debtors_search",
    argsFrom: { name: "name" },
    hint: "in der gelieferten Liste nach diesem Namen suchen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  duplicateCheck: { tool: "bb_debtors_search", keyFields: ["name"], perBatch: true },
  crossChecks: ["Q3"],
  // Ein neuer Debitor erscheint auch in der vereinigten Kontenliste von
  // `/settings/get/postingaccounts` (Plan 7.8, erste Zeile). Wer das übersieht, liest nach
  // dem Anlegen einen Kontenrahmen, in dem das neue Konto fehlt.
  invalidatesCache: ["bb_debtors_search", "bb_postingaccounts_search"],
};
