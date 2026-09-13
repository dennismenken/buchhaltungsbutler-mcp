// Werkzeug 47 von 54: `/cost-locations/add` (Plan 3.8, Arbeitspaket AP12d).
//
// **Das einzige anlegende Werkzeug dieses Arbeitspakets mit Pflichtsatz U1**, also mit einem
// echten Weg zurück: `/cost-locations/delete` nimmt eine Kostenstelle wieder aus dem
// Mandanten. Debitoren, Kreditoren, Sachkonten, Zahlungskonten und Kommentare haben diesen
// Weg nicht und tragen deshalb U4 (Plan 3.5).
//
// Beide Parameter sind laut Spezifikation Pflicht; verschärft wird nichts (Plan 4.3). Der
// `code` ist zugleich der Identifikator: Eine numerische Kennung vergibt die API nicht.

import { boundedText } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const CODE_DESCRIPTION =
  "Alphanumerischer Code der neuen Kostenstelle, höchstens 10 Zeichen, zum Beispiel abc123. " +
  "Er ist zugleich der Identifikator. Welche Codes belegt sind, zeigt bb_cost_locations_search.";
const NAME_DESCRIPTION =
  "Bezeichnung der Kostenstelle, zum Beispiel Vertrieb Nord oder Projekt Neubau.";

export const bb_cost_locations_create: ToolEntry = {
  name: "bb_cost_locations_create",
  title: "Kostenstelle anlegen",
  path: { literal: "/cost-locations/add" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description:
    "Legt eine Kostenstelle in BuchhaltungsButler an, mit einem selbst gewählten code von " +
    "höchstens 10 Zeichen und einer Bezeichnung. Gedacht für eine neue Abteilung oder ein " +
    "neues Projekt, auf das Buchungszeilen verteilt werden sollen. Die Kostenstelle steht " +
    "danach in den Positionsfeldern cost_location und cost_location_two der " +
    "Buchungswerkzeuge zur Verfügung. Welche Codes schon belegt sind, zeigt " +
    "bb_cost_locations_search. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Rückgängig zu machen mit bb_cost_locations_delete.",
  mandatorySentence: "U1",
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Kein `data`: Der angelegte Code steht auf oberster Ebene des Umschlags.
  responseContract: { container: "none", fields: { code: "id-string" }, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // Hier greift der Prüfweg sauber: `/cost-locations/get` führt `code` als echten Filter.
  verifyWith: {
    kind: "tool",
    tool: "bb_cost_locations_search",
    argsFrom: { code: "code" },
    hint: "prüfen, ob die Kostenstelle mit diesem code vorhanden ist",
  },
  duplicateCheck: { tool: "bb_cost_locations_search", keyFields: ["code"], perBatch: true },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_cost_locations_search"],
};
