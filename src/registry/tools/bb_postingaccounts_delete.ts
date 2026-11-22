// Werkzeug 47 von 61: `/settings/delete/postingaccount`.
//
// Klasse D, also `destructiveHint: true` und `idempotentHint: false` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts). Eine Wiederholung wäre plausibel
// wirkungslos, das ist aber **nicht verifiziert**, und
// ein falsches `idempotentHint: true` lädt einen Host zum selbsttätigen Wiederholen ein.
//
// **Drei Eigenheiten dieses Endpunkts, alle wörtlich aus der Spezifikation:**
//
//  1. Gelöscht werden nur Sachkonten, die manuell angelegt oder bearbeitet wurden.
//  2. Das Konto darf weder Buchungen noch Anlagen haben.
//  3. Ist das Sachkonto ein manuell bearbeitetes Standardkonto, setzt die API nur dessen
//     Namen auf den Standardwert zurück; gelöscht wird es dann nicht. Ob der Aufruf danach
//     trotzdem erfolgreich meldet, sagt die Spezifikation nicht.
//
// **Der Aufruf ist nicht live verifiziert.** Die Beschreibung, die Fehlerfälle und die
// Antwortform sind aus der Spezifikation abgeleitet, nicht gemessen.
//
// Die Antwort trägt `success`, `message` und `postingaccount_number` auf oberster Ebene.

import { identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const NUMBER_DESCRIPTION =
  "Buchungskontonummer des zu löschenden Sachkontos als ganze Zahl, zum Beispiel 4931. Sie " +
  "ist der Identifikator des Kontos. Nachschlagen mit bb_postingaccounts_search.";

export const bb_postingaccounts_delete: ToolEntry = {
  name: "bb_postingaccounts_delete",
  title: "Sachkonto löschen",
  group: "postingaccounts",
  path: { literal: "/settings/delete/postingaccount" },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  description:
    "Löscht ein Sachkonto in BuchhaltungsButler. Möglich ist das nur bei manuell angelegten " +
    "oder bearbeiteten Sachkonten ohne Buchungen und ohne Anlagen. Ist das Konto ein manuell " +
    "bearbeitetes Standardkonto, setzt die API nur den Namen auf den Standardwert zurück und " +
    "löscht es nicht. Die postingaccount_number ist der Identifikator des Kontos, zu finden " +
    "mit bb_postingaccounts_search. Nicht live verifiziert. Entfernt Daten aus dem echten " +
    "Mandanten von BuchhaltungsButler: das Sachkonto. Die betroffenen Datensätze vorher " +
    "lesen und dem Nutzer vorlegen.",
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
  responseContract: {
    container: "none",
    fields: { postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // `bb_postingaccounts_search` filtert nicht nach der Nummer; `argsFrom` nennt deshalb den
  // gesuchten Wert und keinen Suchparameter, und der Hinweis sagt, dass in der Liste zu suchen ist.
  verifyWith: {
    kind: "tool",
    tool: "bb_postingaccounts_search",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der gelieferten Liste den Eintrag mit dieser Kontonummer prüfen; der Endpunkt filtert nicht danach, limit also hoch setzen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_postingaccounts_search"],
};
