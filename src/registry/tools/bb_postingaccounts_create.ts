// Werkzeug 41 von 54: `/settings/add/postingaccount`.
//
// Drei Pflichtfelder, alle drei laut Spezifikation `required: true`; verschärft wird hier
// nichts. `postingaccount_number` und `parent_postingaccount_number` sind an
// diesem Endpunkt **Ganzzahlen**, anders als beim Anlegen eines Debitors oder Kreditors, wo
// dasselbe Feld eine Zeichenkette ist.
//
// **Das Vorlagekonto ist der fachliche Kern dieses Aufrufs** (`docs/api/stammdaten.md`): Das
// neue Konto erbt seine Eigenschaften, darunter die Steuerbehandlung und die Zuordnung in
// der Auswertung, vom Konto `parent_postingaccount_number`. Ein falsch gewähltes Vorlagekonto
// erzeugt ein Konto, das still falsch bucht — deshalb nennt die Feldbeschreibung das
// Nachschlagewerkzeug und den Erbvorgang ausdrücklich.
//
// Die Antwort trägt kein `data`; beide Nummern stehen auf oberster Ebene des Umschlags und
// kommen als **Zeichenkette** zurück, obwohl sie als Ganzzahl gesendet werden. Der Vertrag
// führt sie deshalb als `id-string`.

import { boundedText, identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const NAME_DESCRIPTION = "Bezeichnung des neuen Sachkontos, zum Beispiel Softwarelizenzen Cloud.";
const NUMBER_DESCRIPTION =
  "Nummer des neuen Sachkontos als ganze Zahl, zum Beispiel 4931. Sie muss frei sein und in " +
  "den Kontenrahmen des Mandanten passen; belegte Nummern zeigt bb_postingaccounts_search.";
const PARENT_DESCRIPTION =
  "Nummer des Vorlagekontos als ganze Zahl, zum Beispiel 4930. Das neue Konto erbt dessen " +
  "Eigenschaften, etwa die Steuerbehandlung. Nachschlagen mit bb_postingaccounts_search.";

export const bb_postingaccounts_create: ToolEntry = {
  name: "bb_postingaccounts_create",
  title: "Sachkonto anlegen",
  group: "postingaccounts",
  path: { literal: "/settings/add/postingaccount" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description:
    "Legt ein neues Sachkonto im Kontenrahmen des Mandanten in BuchhaltungsButler an. " +
    "Gedacht für ein eigenes Aufwandskonto, etwa 4931 für Softwarelizenzen. Das neue Konto " +
    "erbt seine Eigenschaften, darunter die Steuerbehandlung, vom Vorlagekonto " +
    "parent_postingaccount_number; dieses vorher mit bb_postingaccounts_search heraussuchen. " +
    "Kundenkonten legt bb_debtors_create an, Lieferantenkonten bb_creditors_create, " +
    "Zahlungskonten bb_payment_accounts_create. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Die API bietet keinen Endpunkt, das rückgängig zu machen.",
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
      required: true,
      description: NUMBER_DESCRIPTION,
      schema: identifierValue(NUMBER_DESCRIPTION),
    },
    {
      name: "parent_postingaccount_number",
      apiNames: ["parent_postingaccount_number"],
      source: "body",
      required: true,
      description: PARENT_DESCRIPTION,
      schema: identifierValue(PARENT_DESCRIPTION),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  responseContract: {
    container: "none",
    fields: { postingaccount_number: "id-string", parent_postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // `bb_postingaccounts_search` filtert nicht nach einer Kontonummer; `argsFrom` nennt
  // deshalb den gesuchten Wert und keinen Suchparameter.
  verifyWith: {
    kind: "tool",
    tool: "bb_postingaccounts_search",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der gelieferten Liste nach dieser Kontonummer suchen; der Endpunkt filtert nicht danach, limit also hoch setzen",
  },
  duplicateCheck: {
    tool: "bb_postingaccounts_search",
    keyFields: ["postingaccount_number"],
    perBatch: true,
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_postingaccounts_search"],
};
