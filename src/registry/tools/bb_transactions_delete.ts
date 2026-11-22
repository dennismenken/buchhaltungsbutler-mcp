// Werkzeug 17 von 59: `/transactions/delete`.
//
// Klasse D, also `destructiveHint: true` und `idempotentHint: false` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts). Eine Wiederholung wäre plausibel
// wirkungslos, das ist aber **nicht verifiziert**, und
// ein falsches `idempotentHint: true` lädt einen Host zum selbsttätigen Wiederholen ein.
//
// **Der Endpunkt löscht nicht immer.** Zwei Fälle stehen wörtlich in der Spezifikation:
//
//  1. Liegt die Transaktion in einem revisionssicheren Konto, legt die API stattdessen eine
//     Stornotransaktion (STORNO) an.
//  2. Transaktionen mit festgeschriebenen Buchungen lassen sich nicht löschen.
//
// **Ob `id_by_customer` in der Antwort im Stornofall die Kennung der Stornotransaktion
// ist, ist nicht verifiziert.** Die Spezifikation beschreibt das Feld nicht; der Werkzeugtext
// sagt das ausdrücklich und nennt die Kennung der gelöschten Transaktion als das, was
// bestätigt wird.
//
// **Der Aufruf ist nicht live verifiziert.** Die Beschreibung, die Fehlerfälle und die
// Antwortform sind aus der Spezifikation abgeleitet, nicht gemessen.

import { identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const ID_DESCRIPTION =
  "Mandantenbezogene Nummer der zu löschenden Transaktion, zum Beispiel 4716. Sie ist der " +
  "Identifikator der Zahlung. Nachschlagen mit bb_transactions_search.";

export const bb_transactions_delete: ToolEntry = {
  name: "bb_transactions_delete",
  title: "Zahlung löschen",
  group: "transactions",
  path: { literal: "/transactions/delete" },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  description:
    "Löscht eine Zahlung in BuchhaltungsButler, etwa eine falsch erfasste Kontoumsatzbuchung. " +
    "In einem revisionssicheren Konto löscht die API nicht, sondern legt eine " +
    "Stornotransaktion (STORNO) an; Transaktionen mit festgeschriebenen Buchungen lassen sich " +
    "nicht löschen. Die transaction_id_by_customer ist der Identifikator der Zahlung, zu finden " +
    "mit bb_transactions_search. Ob die zurückgemeldete id_by_customer im Stornofall die Kennung " +
    "der Stornotransaktion ist, ist nicht verifiziert. Nicht live verifiziert. Entfernt Daten " +
    "aus dem echten Mandanten von BuchhaltungsButler: die Transaktion. Die betroffenen " +
    "Datensätze vorher lesen und dem Nutzer vorlegen.",
  mandatorySentence: "U6",
  fields: [
    {
      name: "transaction_id_by_customer",
      apiNames: ["transaction_id_by_customer"],
      source: "body",
      required: true,
      description: ID_DESCRIPTION,
      schema: identifierValue(ID_DESCRIPTION),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_transactions_search",
    argsFrom: { transaction_id_by_customer: "id_by_customer" },
    hint: "in der gelieferten Liste nach dieser Nummer suchen; der Endpunkt filtert nicht danach, limit also hoch setzen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
