// Werkzeug 50: `/reports/get/bwa`, eine erzeugte BWA abholen.
//
// Lesend (Klasse R), deshalb kein Pflichtsatz und `response_format` als einziges
// serverseitiges Feld. Zeitlimitstufe `long`: Die fünf Berichtswerkzeuge
// tragen sie alle. Der Eimer bleibt `default`; nur die beiden erzeugenden
// Werkzeuge liegen im Eimer `reports`.
//
// **Q1 trägt dieses Werkzeug ausdrücklich nicht**: Es führt laut Spezifikation
// nur `report_id_by_customer` und `get_files` und hat überhaupt kein Datumsfeld. Die
// Datumsgrenzen liegen an `bb_reports_create_bwa`.
//
// **Vorbedingung und Sperre:** Ohne vorheriges `bb_reports_create_bwa` gibt es nichts
// abzuholen; einen impliziten „letzten" Bericht liefert der Endpunkt nicht (berichte.md 2.3,
// live gemessen). Bei aktivem `BB_MCP_READ_ONLY` ist der erzeugende erste Schritt gesperrt,
// und dann liefert von den fünf Berichtswerkzeugen nur `bb_reports_get_ledger` noch eine
// Auswertung.
//
// **Der Antwortvertrag bleibt leer, und das ist ein Befund, keine Bequemlichkeit:** `report`
// und `files` sind untypisierte Objekte, und `ContractFieldType` kennt keinen Typ
// dafür. Mit `"string"` erzeugte jeder erfolgreiche Aufruf zwei `_contract_warnings`; mit
// leerem Vertrag laufen beide Felder als unbekannt unverändert durch.
// `concise` ist deshalb ebenfalls leer, und P13 verlangt das auch: Eine Projektion ohne
// Datenbehälter projizierte nichts.

import { z } from "zod";

import { identifierValue } from "../../schema/primitives.js";
import { ID_STRING_SENTENCE, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const REPORT_ID_DESCRIPTION =
  "Kennung der zuvor mit bb_reports_create_bwa erzeugten Auswertung, deren id_by_customer. " +
  `${ID_STRING_SENTENCE} Ohne Bericht dazu antwortet die API mit error_code 7.`;

const GET_FILES_DESCRIPTION =
  "true liefert die Dateien base64-kodiert unter csv und pdf mit; ohne Angabe fehlt das " +
  "Objekt files ganz. bb_reports_create_bwa kennt keinen Parameter, Dateien anzufordern; " +
  "dass beide deshalb immer null bleiben, ist nicht verifiziert.";

/** Werkzeug 50: `/reports/get/bwa`. */
export const bb_reports_get_bwa: ToolEntry = {
  name: "bb_reports_get_bwa",
  title: "BWA abholen",
  group: "reports",
  path: { literal: "/reports/get/bwa" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Holt eine zuvor in BuchhaltungsButler erzeugte Betriebswirtschaftliche Auswertung ab, " +
    "auf Wunsch samt Dateien. Vorbedingung ist ein Lauf von bb_reports_create_bwa; dessen " +
    "id_by_customer ist hier einzusetzen. Bei aktivem BB_MCP_READ_ONLY ist dieser erste " +
    "Schritt gesperrt, dann liefert nur bb_reports_get_ledger eine Auswertung. error_code 8 " +
    "heißt: Erzeugung läuft noch, einige Sekunden warten. error_code 7 heißt: kein Bericht " +
    "zu dieser Kennung.",
  fields: [
    {
      name: "report_id_by_customer",
      apiNames: ["report_id_by_customer"],
      source: "body",
      required: true,
      description: REPORT_ID_DESCRIPTION,
      schema: identifierValue(REPORT_ID_DESCRIPTION),
    },
    {
      name: "get_files",
      apiNames: ["get_files"],
      source: "body",
      required: false,
      description: GET_FILES_DESCRIPTION,
      schema: z.boolean().describe(GET_FILES_DESCRIPTION),
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt." }],
  // Die BWA kommt ohne data-Hülle unter `report`, als Baum aus Gruppen, darin Klassen, darin
  // Konten, dazu Ergebniszeilen unter `totals`. Die Umformung in src/mapping/report-rows.ts legt
  // den Baum in Lesereihenfolge flach: `level` ist group, class, account oder total. `files`
  // wandert in die Kopfangaben. Gemessen über je einen Lauf von bb_reports_create_bwa mit
  // Freigabe des Projektinhabers, am 2026-09-14 für September 2026 ohne bestätigte Buchungen
  // und für das abgeschlossene Jahr 2024 mit 305 Buchungen und 25 Konten (Befund L7 in
  // docs/api/live-befunde.md). Die Kontenliste einer Klasse ist gefüllt ein Objekt mit der
  // Kontonummer als Schlüssel, leer ein Array; beide Formen werden gelesen.
  responseContract: {
    container: "none",
    reportRows: "bwa",
    fields: {
      level: "string",
      group: "string",
      class: "string",
      postingaccount_number: "id-string",
      name: "string",
      amountsSum: "number",
      empty: "boolean",
    },
    source: "gemessen",
    measuredOn: "2026-09-14",
  },
  shape: "ack",
  concise: ["level", "group", "class", "postingaccount_number", "name", "amountsSum"],
  bucket: "default",
  timeoutTier: "long",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
