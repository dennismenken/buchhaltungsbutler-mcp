// Werkzeug 42 von 54: `/settings/update/postingaccount`.
//
// Klasse M, also `destructiveHint: true` und `idempotentHint: true` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts): Der Aufruf ersetzt einen bestehenden Wert,
// und kein Endpunkt der API liefert den Vorzustand zurück.
//
// **Der Endpunkt kann nur den Namen ändern.** Er führt genau zwei fachliche Parameter, beide
// `required: true`: die Nummer des Kontos und dessen neuen Namen. Nummer, Vorlagekonto und
// Steuerbehandlung lassen sich nicht ändern; einen Parameter dafür gibt es nicht.
//
// Die Antwort ist ein `data`-Objekt mit genau zwei Feldern. `type`, `subtype` und die
// Vorlagefelder fehlen darin, anders als bei `/settings/get/postingaccounts` — ein weiterer
// Beleg dafür, warum der Antwortvertrag je Endpunkt gilt und nicht je Fachobjekt.

import { boundedText, identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const NAME_DESCRIPTION =
  "Neue Bezeichnung des Sachkontos, zum Beispiel Softwarelizenzen Cloud 19% USt.";
const NUMBER_DESCRIPTION =
  "Nummer des zu ändernden Sachkontos als ganze Zahl, zum Beispiel 4931. Sie ist der " +
  "Identifikator und lässt sich nicht ändern. Nachschlagen mit bb_postingaccounts_search.";

export const bb_postingaccounts_update: ToolEntry = {
  name: "bb_postingaccounts_update",
  title: "Sachkonto überschreiben",
  group: "postingaccounts",
  path: { literal: "/settings/update/postingaccount" },
  effect: "modify",
  toolClass: "M",
  tier: 2,
  description:
    "Überschreibt die Bezeichnung eines Sachkontos in BuchhaltungsButler. Gedacht für eine " +
    "berichtigte Kontobezeichnung. Mehr als den Namen ändert dieser Endpunkt nicht: Nummer, " +
    "Vorlagekonto und Steuerbehandlung bleiben, wie sie sind. Bestehende Buchungen verweisen " +
    "weiter auf dieses Konto und erscheinen danach unter dem neuen Namen; die Buchungen " +
    "selbst bleiben unverändert. Den alten Namen vorher mit bb_postingaccounts_search lesen. " +
    "Überschreibt Stammdaten im echten Mandanten von BuchhaltungsButler. Die API liefert die " +
    "vorherigen Werte nicht zurück; ohne vorher gelesenen Datensatz ist die Änderung nicht " +
    "rückgängig zu machen.",
  mandatorySentence: "U5",
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
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  responseContract: {
    container: "data",
    fields: { name: "string", postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "object",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_postingaccounts_search",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der gelieferten Liste den Eintrag mit dieser Kontonummer prüfen; der Endpunkt filtert nicht danach, limit also hoch setzen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_postingaccounts_search"],
};
