// Werkzeug 49 von 54: `/cost-locations/delete`.
//
// Klasse D, also `destructiveHint: true` und `idempotentHint: false` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts). Eine Wiederholung wäre plausibel
// wirkungslos, das ist aber **nicht verifiziert**, und
// ein falsches `idempotentHint: true` lädt einen Host zum selbsttätigen Wiederholen ein.
//
// **Was mit Buchungen geschieht, die auf diese Kostenstelle verweisen, ist nicht
// dokumentiert und nicht verifiziert.** Weder die Spezifikation noch ein Dossier sagt, ob die
// Zuordnung bestehen bleibt, geleert wird oder den Löschvorgang verhindert. Der Pflichtsatz
// U6 verlangt deshalb, die betroffenen Datensätze vorher zu lesen und vorzulegen; die
// Beschreibung nennt `bb_postings_search` als den Weg dorthin.
//
// Die Antwort trägt ausschließlich `success` und `message`.

import { boundedText } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const CODE_DESCRIPTION =
  "Code der zu löschenden Kostenstelle, zum Beispiel abc123. Nachschlagen mit " +
  "bb_cost_locations_search.";

export const bb_cost_locations_delete: ToolEntry = {
  name: "bb_cost_locations_delete",
  title: "Kostenstelle löschen",
  group: "cost_locations",
  path: { literal: "/cost-locations/delete" },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  description:
    "Löscht eine Kostenstelle in BuchhaltungsButler über ihren code. Gedacht für eine " +
    "versehentlich angelegte oder nicht mehr benutzte Kostenstelle. Was mit Buchungen " +
    "geschieht, die auf diese Kostenstelle verweisen, ist nicht dokumentiert und nicht " +
    "verifiziert: Die Zuordnung kann verloren gehen. Welche Buchungen betroffen sind, zeigt " +
    "bb_postings_search. Entfernt Daten aus dem echten Mandanten von BuchhaltungsButler: " +
    "eine Kostenstelle samt ihrer Bezeichnung. Die betroffenen Datensätze vorher lesen und " +
    "dem Nutzer vorlegen.",
  mandatorySentence: "U6",
  fields: [
    {
      name: "code",
      apiNames: ["code"],
      source: "body",
      required: true,
      description: CODE_DESCRIPTION,
      schema: boundedText(CODE_DESCRIPTION, 10),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_cost_locations_search",
    argsFrom: { code: "code" },
    hint: "prüfen, ob die Kostenstelle noch vorhanden ist",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_cost_locations_search"],
};
