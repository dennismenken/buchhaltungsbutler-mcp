// Werkzeug 46 von 54: `/cost-locations/get` (Plan 3.8, Arbeitspaket AP12d).
//
// **Dieses Werkzeug trägt Q2, die drei `settings`-Listen nicht** (Plan 4.7, 7.5): Für
// `/cost-locations/get` nennt die Spezifikation die Obergrenze 1000 ausdrücklich („NOTE: the
// maximum limit is 1000!“). Damit gibt es eine belegte Schranke, gegen die Q2 prüfen kann,
// und `maximum` steht im Schema.
//
// **Der `code` ist der Schlüssel.** Eine numerische Kennung gibt es nicht, und der Endpunkt
// liefert je Kostenstelle genau zwei Felder. Anders als die drei `settings`-Listen kennt er
// einen echten Filter: Mit `code` liefert er genau eine Kostenstelle.
//
// Der Testmandant führte am 2026-09-12 keine einzige Kostenstelle (`rows: 0`); der
// Antwortvertrag stammt deshalb unverändert aus `docs/api/stammdaten.md` und ist durch den
// Vertragslauf (Plan 9.7, AP17) zu bestätigen. `code` steht als `id-string` im Vertrag, weil
// er der Identifikator ist: Käme er an einem Mandanten mit rein numerischen Codes als Zahl
// zurück, wäre das sonst an jeder Zeile eine Vertragswarnung.

import { paginationFor } from "../../schema/pagination.js";
import { boundedText } from "../../schema/primitives.js";
import { responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const pagination = paginationFor("/cost-locations/get");

const CODE_DESCRIPTION =
  "Code genau einer Kostenstelle, zum Beispiel abc123. Mit dieser Angabe liefert der " +
  "Endpunkt nur diese eine Kostenstelle, ohne sie alle.";

export const bb_cost_locations_search: ToolEntry = {
  name: "bb_cost_locations_search",
  title: "Kostenstellen auflisten",
  path: { literal: "/cost-locations/get" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Listet die Kostenstellen des Mandanten in BuchhaltungsButler auf oder holt mit code " +
    "genau eine. Gedacht zum Nachschlagen, bevor eine Buchungszeile über cost_location einer " +
    "Kostenstelle zugeordnet wird. Eine numerische Kennung gibt es nicht, der code ist der " +
    "Schlüssel. Geliefert werden nur code und name, keine Auswertung und keine Summen. " +
    "Höchstens 1000 Zeilen je Aufruf.",
  fields: [
    {
      name: "code",
      apiNames: ["code"],
      source: "body",
      required: false,
      description: CODE_DESCRIPTION,
      schema: boundedText(CODE_DESCRIPTION, 10),
    },
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      description: pagination.limit.description ?? "",
      schema: pagination.limit,
    },
    {
      name: "offset",
      apiNames: ["offset"],
      source: "body",
      required: false,
      description: pagination.offset.description ?? "",
      schema: pagination.offset,
    },
    {
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: responseFormat().description ?? "",
      schema: responseFormat(),
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Der Vertragslauf (AP17, Plan 9.7) hat diesen Endpunkt am 2026-09-13 aufgerufen und KEINE
  // Bestätigung erreicht: Der Mandant führt keine Kostenstelle, die Antwort war eine leere
  // Liste. Das ist kein Fehler und keine Abweichung — es ist die eine Stelle, an der der Lauf
  // nichts lernen kann. Die beiden Feldnamen bleiben damit aus `docs/api/stammdaten.md`
  // übernommen und sind weiterhin nicht live bestätigt; der nächste Lauf gegen einen Mandanten
  // mit Kostenstellen trägt das nach.
  responseContract: {
    container: "data",
    fields: { code: "id-string", name: "string" },
    source: "dokumentiert",
  },
  shape: "list",
  concise: ["code", "name"],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q2", "Q3"],
  invalidatesCache: [],
};
