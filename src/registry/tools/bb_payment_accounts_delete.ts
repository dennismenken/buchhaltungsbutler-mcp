// Werkzeug 51 von 61: `/accounts/delete`.
//
// Klasse D, also `destructiveHint: true` und `idempotentHint: false` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts). Eine Wiederholung wäre plausibel
// wirkungslos, das ist aber **nicht verifiziert**, und
// ein falsches `idempotentHint: true` lädt einen Host zum selbsttätigen Wiederholen ein.
//
// **Die Löschbedingung steht wörtlich in der Spezifikation:** Das Konto lässt sich nur
// löschen, wenn es keine festgeschriebenen Buchungen und keine revisionssicheren
// Transaktionen enthält. Beide Bedingungen prüft die API, nicht dieses Werkzeug; ein
// gescheiterter Aufruf ist deshalb die erste und einzige Auskunft darüber, ob das Konto
// noch löschbar ist.
//
// **Der Aufruf ist nicht live verifiziert.** Die Beschreibung, die Fehlerfälle und die
// Antwortform sind aus der Spezifikation abgeleitet, nicht gemessen.
//
// Die Antwort trägt `success`, `message` und `postingaccount_number` auf oberster Ebene.

import { identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const NUMBER_DESCRIPTION =
  "Buchungskontonummer des zu löschenden Zahlungskontos als ganze Zahl, zum Beispiel 1200. " +
  "Sie ist der Identifikator des Kontos. Nachschlagen mit bb_payment_accounts_list.";

export const bb_payment_accounts_delete: ToolEntry = {
  name: "bb_payment_accounts_delete",
  title: "Zahlungskonto löschen",
  group: "payment_accounts",
  path: { literal: "/accounts/delete" },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  description:
    "Löscht ein Zahlungskonto in BuchhaltungsButler, etwa eine Kasse, die nicht mehr " +
    "benutzt wird. Die API löscht nur ein Konto ohne festgeschriebene Buchungen und ohne " +
    "revisionssichere Transaktionen; beide Bedingungen prüft sie selbst. Die " +
    "postingaccount_number ist der Identifikator des Kontos, zu finden mit " +
    "bb_payment_accounts_list. Nicht live verifiziert. Entfernt Daten aus dem echten " +
    "Mandanten von BuchhaltungsButler: das Zahlungskonto. Die betroffenen Datensätze vorher " +
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
  // `bb_payment_accounts_list` nimmt überhaupt keinen Parameter an; `argsFrom` nennt deshalb
  // den gesuchten Wert und keinen Suchparameter.
  verifyWith: {
    kind: "tool",
    tool: "bb_payment_accounts_list",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der vollständigen Kontenliste nach dieser Nummer suchen; der Endpunkt nimmt keinen Parameter an",
  },
  crossChecks: ["Q3"],
  // `/accounts/get` selbst wird nie zwischengespeichert, das Zahlungskonto steht aber auch in der
  // vereinigten Kontenliste von `/settings/get/postingaccounts` (type 'account').
  invalidatesCache: ["bb_postingaccounts_search"],
};
