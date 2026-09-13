// Werkzeug 48 von 54: `/cost-locations/update`.
//
// Klasse M, also `destructiveHint: true` und `idempotentHint: true` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts): Der Aufruf ersetzt die Bezeichnung, und
// kein Endpunkt liefert den Vorzustand zurück.
//
// **Der Endpunkt ändert ausschließlich die Bezeichnung.** Der `code` ist der Identifikator
// und lässt sich nicht ändern; einen Parameter dafür gibt es nicht.
//
// **Die Antwort bestätigt den neuen Namen nicht.** Sie trägt ausschließlich `success` und
// `message`: kein `data`, kein `code`, kein `rows`. Wer sichergehen will, liest die
// Kostenstelle danach mit `bb_cost_locations_search`; genau das sagt auch der Prüfweg.

import { boundedText } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const CODE_DESCRIPTION =
  "Code der zu ändernden Kostenstelle, zum Beispiel abc123. Er ist der Identifikator und " +
  "lässt sich nicht ändern. Nachschlagen mit bb_cost_locations_search.";
const NAME_DESCRIPTION =
  "Neue Bezeichnung der Kostenstelle, zum Beispiel Vertrieb Nord. Sie ersetzt die bisherige " +
  "vollständig.";

export const bb_cost_locations_update: ToolEntry = {
  name: "bb_cost_locations_update",
  title: "Kostenstelle überschreiben",
  group: "cost_locations",
  path: { literal: "/cost-locations/update" },
  effect: "modify",
  toolClass: "M",
  tier: 2,
  description:
    "Überschreibt die Bezeichnung einer Kostenstelle in BuchhaltungsButler. Gedacht für eine " +
    "berichtigte Bezeichnung. Der code bleibt unverändert; er ist der Identifikator und " +
    "lässt sich nicht ändern. Buchungen, die auf diese Kostenstelle verweisen, bleiben " +
    "erhalten und erscheinen danach unter der neuen Bezeichnung. Die Antwort bestätigt die " +
    "neue Bezeichnung nicht, deshalb den Stand vorher und nachher mit " +
    "bb_cost_locations_search lesen. Überschreibt Stammdaten im echten Mandanten von " +
    "BuchhaltungsButler. Die API liefert die vorherigen Werte nicht zurück; ohne vorher " +
    "gelesenen Datensatz ist die Änderung nicht rückgängig zu machen.",
  mandatorySentence: "U5",
  fields: [
    {
      name: "code",
      apiNames: ["code"],
      source: "body",
      required: true,
      description: CODE_DESCRIPTION,
      schema: boundedText(CODE_DESCRIPTION, 10),
    },
    {
      name: "name",
      apiNames: ["name"],
      source: "body",
      required: true,
      description: NAME_DESCRIPTION,
      schema: boundedText(NAME_DESCRIPTION),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  // Weder `data` noch `code` noch `rows`: Der Aufrufer erhält keine Bestätigung des neuen
  // Namens (`docs/api/stammdaten.md`).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_cost_locations_search",
    argsFrom: { code: "code" },
    hint: "prüfen, ob die Kostenstelle die neue Bezeichnung trägt",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_cost_locations_search"],
};
