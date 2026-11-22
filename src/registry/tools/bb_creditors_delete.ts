// Werkzeug 42 von 59: `/settings/delete/creditor`.
//
// Klasse D, also `destructiveHint: true` und `idempotentHint: false` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts). Eine Wiederholung wäre plausibel
// wirkungslos, das ist aber **nicht verifiziert**, und
// ein falsches `idempotentHint: true` lädt einen Host zum selbsttätigen Wiederholen ein.
//
// **Die Löschbedingung steht wörtlich in der Spezifikation:** Ein Kreditorenkonto lässt sich
// nur löschen, wenn für das Konto keine Buchungen existieren. Diese Bedingung prüft die API,
// nicht dieses Werkzeug.
//
// **Der Aufruf ist nicht live verifiziert.** Die Beschreibung, die Fehlerfälle und die
// Antwortform sind aus der Spezifikation abgeleitet, nicht gemessen.
//
// Die Antwort trägt ausschließlich `success` und `message`.

import { identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const NUMBER_DESCRIPTION =
  "Buchungskontonummer des zu löschenden Kreditorenkontos als ganze Zahl, zum Beispiel 7001. " +
  "Sie ist der Identifikator des Kontos. Nachschlagen mit bb_creditors_search.";

export const bb_creditors_delete: ToolEntry = {
  name: "bb_creditors_delete",
  title: "Kreditorenkonto löschen",
  group: "creditors",
  path: { literal: "/settings/delete/creditor" },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  description:
    "Löscht ein Kreditorenkonto in BuchhaltungsButler, etwa einen Lieferanten, der nicht " +
    "mehr beliefert. Möglich ist das nur, wenn für das Konto keine Buchungen existieren; die " +
    "Bedingung prüft die API selbst. Die postingaccount_number ist der Identifikator des " +
    "Kontos, zu finden mit bb_creditors_search. Nicht live verifiziert. Entfernt Daten aus " +
    "dem echten Mandanten von BuchhaltungsButler: das Kreditorenkonto. Die betroffenen " +
    "Datensätze vorher lesen und dem Nutzer vorlegen.",
  mandatorySentence: "U6",
  fields: [
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
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // `bb_creditors_search` nimmt keinen Filter an; `argsFrom` nennt deshalb den gesuchten Wert
  // und keinen Suchparameter, und der Hinweis sagt, dass in der Liste zu suchen ist.
  verifyWith: {
    kind: "tool",
    tool: "bb_creditors_search",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der gelieferten Liste den Eintrag mit dieser Kontonummer prüfen; der Endpunkt nimmt keinen Filter an, limit also hoch setzen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_creditors_search", "bb_postingaccounts_search"],
};
