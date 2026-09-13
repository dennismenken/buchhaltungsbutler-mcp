// Werkzeug 35 von 54: `/settings/update/debtor` (Plan 3.8, Arbeitspaket AP12d).
//
// Klasse M, also `destructiveHint: true` und `idempotentHint: true` (Plan 3.3, Streitfrage
// S5): Ein Überschreiben ist nicht additiv, und kein Endpunkt der API liefert den Vorzustand
// zurück. Ein zu strenger Hint kostet eine Rückfrage, ein zu milder einen unbemerkten
// Stammdatenverlust. `idempotentHint: true` gilt, weil der Aufruf einen im Aufruf genannten
// Zielzustand setzt, genau wie das Schreiben einer Datei.
//
// **Drei Eigenheiten dieses Endpunkts:**
//
//  1. `postingaccount_number` ist hier eine **Ganzzahl**, beim Anlegen eine Zeichenkette.
//     Dieser Eintrag sendet deshalb eine Zahl. Ob der Server beides annimmt, ist **nicht
//     verifiziert** (`docs/api/stammdaten.md`, Fallstricke).
//  2. Die Kontonummer selbst lässt sich nicht ändern; einen Parameter für eine neue Nummer
//     gibt es nicht.
//  3. Ob ein weggelassenes Feld unverändert bleibt oder geleert wird, sagt die Spezifikation
//     nicht. Die Formulierung „The new … of the debtor account“ legt eine Teilaktualisierung
//     nahe; das ist eine **Annahme**. Die Werkzeugbeschreibung sagt das und rät, den
//     vollständigen Datensatz zu senden.

import { boundedText, identifierValue } from "../../schema/primitives.js";
import { bic, contactAddressBlock, iban } from "../../schema/vocab.js";
import type { ContactAddressField } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const address = contactAddressBlock();

const NUMBER_DESCRIPTION =
  "Kontonummer des zu ändernden Debitorenkontos, zum Beispiel 10001. Sie ist der " +
  "Identifikator und lässt sich nicht ändern. Nachschlagen mit bb_debtors_search. Dieser " +
  "Endpunkt erwartet eine ganze Zahl, das Anlegen dagegen eine Zeichenkette.";

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

const NAME_DESCRIPTION = "Neuer Name des Kundenkontos, zum Beispiel Musterkunde GmbH.";

export const bb_debtors_update: ToolEntry = {
  name: "bb_debtors_update",
  title: "Debitorenkonto überschreiben",
  group: "debtors",
  path: { literal: "/settings/update/debtor" },
  effect: "modify",
  toolClass: "M",
  tier: 2,
  description:
    "Überschreibt die Stammdaten eines Debitorenkontos in BuchhaltungsButler, Anschrift und " +
    "Bankverbindung eingeschlossen. Gedacht für eine geänderte Adresse oder IBAN eines " +
    "Kunden. Angesprochen wird das Konto über postingaccount_number; die Nummer selbst " +
    "lässt sich nicht ändern. Ob ein weggelassenes Feld unverändert bleibt, ist nicht " +
    "dokumentiert — im Zweifel den vollständigen Datensatz senden, vorher gelesen mit " +
    "bb_debtors_search. Überschreibt Stammdaten im echten Mandanten von BuchhaltungsButler. " +
    "Die API liefert die vorherigen Werte nicht zurück; ohne vorher gelesenen Datensatz ist " +
    "die Änderung nicht rückgängig zu machen.",
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
  // `data` ist hier ein Objekt, kein Array. Die Feldnamen sind die **Lesenamen**:
  // `additional_addressline` ohne zweiten Unterstrich und `sales_tax_id_eu` mit Zusatz,
  // während die Schreibparameter oben `additional_address_line` und `sales_tax_id` heißen
  // (Plan 7.2). `customer_number` und `import_pending` führt die Spezifikation in dieser
  // Antwort nicht; kommen sie doch, werden sie unverändert durchgereicht (Plan 7.3).
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
  // `bb_debtors_search` nimmt keinen Filter an; `argsFrom` nennt deshalb den gesuchten Wert
  // und keinen Suchparameter, und der Hinweis sagt, dass in der Liste zu suchen ist.
  verifyWith: {
    kind: "tool",
    tool: "bb_debtors_search",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der gelieferten Liste den Eintrag mit dieser Kontonummer prüfen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_debtors_search", "bb_postingaccounts_search"],
};
