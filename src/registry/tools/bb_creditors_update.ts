// Werkzeug 39 von 54: `/settings/update/creditor` (Plan 3.8, Arbeitspaket AP12d).
//
// Klasse M, also `destructiveHint: true` und `idempotentHint: true` (Plan 3.3, Streitfrage
// S5). Für dieses Werkzeug wiegt der Hinweis am schwersten: Hier steht die **Bankverbindung**
// eines Lieferanten, und ein überschriebener IBAN ohne abrufbaren Vorzustand ist der teuerste
// Stammdatenverlust, den diese API erlaubt.
//
// **Vier Eigenheiten:**
//
//  1. `postingaccount_number` ist hier eine **Ganzzahl**, beim Anlegen eine Zeichenkette.
//     Ob der Server beides annimmt, ist **nicht verifiziert**.
//  2. Die Kontonummer selbst lässt sich nicht ändern.
//  3. Ob ein weggelassenes Feld unverändert bleibt oder geleert wird, sagt die Spezifikation
//     nicht; das ist eine **Annahme** (`docs/api/stammdaten.md`).
//  4. `due_in_days` lässt sich setzen, erscheint aber weder in dieser Antwort noch in
//     `/settings/get/creditors`. Wer die Zahlungsfrist ändert, kann den neuen Wert über die
//     API nicht bestätigen.
//
// Die Beschreibung der `data`-Eigenschaft lautet in der Spezifikation fälschlich „the updated
// Debitor“; der Beispielwert von `type` ist dagegen richtig „creditor“.

import { z } from "zod";

import { boundedText, identifierValue } from "../../schema/primitives.js";
import { bic, contactAddressBlock, iban } from "../../schema/vocab.js";
import type { ContactAddressField } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const address = contactAddressBlock();

const NUMBER_DESCRIPTION =
  "Kontonummer des zu ändernden Kreditorenkontos, zum Beispiel 70150. Sie ist der " +
  "Identifikator und lässt sich nicht ändern. Nachschlagen mit bb_creditors_search. Dieser " +
  "Endpunkt erwartet eine ganze Zahl, das Anlegen dagegen eine Zeichenkette.";
const NAME_DESCRIPTION = "Neuer Name des Lieferantenkontos, zum Beispiel Musterlieferant GmbH.";
const DUE_DESCRIPTION =
  "Neue Zahlungsfrist in Tagen, zum Beispiel 14. Schreibbar, aber von keinem lesenden " +
  "Endpunkt der API zurückgeliefert; der neue Wert ist danach nur in der Weboberfläche von " +
  "BuchhaltungsButler zu sehen.";

/** Zahlungsfrist in Tagen. Ganzzahl laut Spezifikation, 0 ist zulässig (sofort fällig). */
function dueInDays(): z.ZodNumber {
  return z
    .number()
    .int({ error: "erwartet wird eine ganze Zahl" })
    .min(0, { error: "muss 0 oder größer sein" })
    .describe(DUE_DESCRIPTION);
}

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

export const bb_creditors_update: ToolEntry = {
  name: "bb_creditors_update",
  title: "Kreditorenkonto überschreiben",
  path: { literal: "/settings/update/creditor" },
  effect: "modify",
  toolClass: "M",
  tier: 2,
  description:
    "Überschreibt die Stammdaten eines Kreditorenkontos in BuchhaltungsButler, die " +
    "Bankverbindung eingeschlossen. Gedacht für eine geänderte Anschrift oder IBAN eines " +
    "Lieferanten. Angesprochen wird das Konto über postingaccount_number; die Nummer selbst " +
    "lässt sich nicht ändern. Ob ein weggelassenes Feld unverändert bleibt, ist nicht " +
    "dokumentiert — im Zweifel den vollständigen Datensatz senden, vorher gelesen mit " +
    "bb_creditors_search. Überschreibt Stammdaten im echten Mandanten von " +
    "BuchhaltungsButler. Die API liefert die vorherigen Werte nicht zurück; ohne vorher " +
    "gelesenen Datensatz ist die Änderung nicht rückgängig zu machen.",
  mandatorySentence: "U5",
  fields: [
    {
      name: "postingaccount_number",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: NUMBER_DESCRIPTION,
      schema: identifierValue(NUMBER_DESCRIPTION),
    },
    {
      name: "name",
      apiNames: ["name"],
      source: "body",
      required: false,
      description: NAME_DESCRIPTION,
      schema: boundedText(NAME_DESCRIPTION),
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
  // `data` ist ein Objekt mit den **Lesenamen**: `additional_addressline` ohne zweiten
  // Unterstrich, `sales_tax_id_eu` mit Zusatz (Plan 7.2). `due_in_days` fehlt auch hier.
  responseContract: {
    container: "data",
    fields: {
      type: "string",
      name: "string",
      contact_person_name: "string",
      street: "string",
      additional_addressline: "string",
      zip: "string",
      city: "string",
      country: "string",
      sales_tax_id_eu: "string",
      email: "string",
      uid_ch: "null-or-string",
      iban: "string",
      bic: "string",
      postingaccount_number: "id-string",
    },
    source: "dokumentiert",
  },
  shape: "object",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_creditors_search",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der gelieferten Liste den Eintrag mit dieser Kontonummer prüfen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_creditors_search", "bb_postingaccounts_search"],
};
