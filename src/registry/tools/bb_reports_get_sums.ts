// Werkzeug 51 aus Plan 3.8: `/reports/get/sums`, eine erzeugte Summen- und Saldenliste
// abholen.
//
// Lesend (Klasse R), deshalb kein Pflichtsatz und `response_format` als einziges
// serverseitiges Feld (Plan 4.3, 7.4). Zeitlimitstufe `long` wie alle fünf
// Berichtswerkzeuge (Plan 5.2), Eimer `default`: Im Eimer `reports` liegen nur die beiden
// erzeugenden Werkzeuge (Plan 5.4).
//
// **Q1 trägt dieses Werkzeug ausdrücklich nicht** (Plan 4.7): Es führt laut Spezifikation
// nur `report_id_by_customer` und `get_files` und hat überhaupt kein Datumsfeld.
//
// **Vorbedingung und Sperre:** Ohne vorheriges `bb_reports_create_sums` gibt es nichts
// abzuholen (berichte.md 2.3, live gemessen: error_code 7 bei einer Kennung ohne Bericht,
// error_code 6 bei fehlender Kennung). Bei aktivem `BB_MCP_READ_ONLY` ist der erzeugende
// erste Schritt gesperrt (Plan 6.6).
//
// **Der Antwortvertrag bleibt leer, und das ist ein Befund:** `report` und `files` sind
// untypisierte Objekte, und `ContractFieldType` (Plan 2.1) kennt keinen Typ dafür. Mit
// `"string"` erzeugte jeder erfolgreiche Aufruf zwei `_contract_warnings`; so laufen beide
// Felder als unbekannt unverändert durch (Plan 7.3, letzter Fall).

import { z } from "zod";

import { identifierValue } from "../../schema/primitives.js";
import { ID_STRING_SENTENCE, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const REPORT_ID_DESCRIPTION =
  "Kennung der zuvor mit bb_reports_create_sums erzeugten Auswertung, deren id_by_customer. " +
  `${ID_STRING_SENTENCE} Ohne Bericht dazu antwortet die API mit error_code 7.`;

const GET_FILES_DESCRIPTION =
  "true liefert die Dateien base64-kodiert unter csv, pdf und csv_archive mit. Geliefert " +
  "wird nur, was bb_reports_create_sums angefordert hat, alles andere ist null. Ohne Angabe " +
  "fehlt das Objekt files ganz.";

/** Werkzeug 51: `/reports/get/sums`. */
export const bb_reports_get_sums: ToolEntry = {
  name: "bb_reports_get_sums",
  title: "Summen- und Saldenliste abholen",
  path: { literal: "/reports/get/sums" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Holt eine zuvor in BuchhaltungsButler erzeugte Summen- und Saldenliste ab, auf Wunsch " +
    "samt Dateien. Vorbedingung ist ein Lauf von bb_reports_create_sums; dessen " +
    "id_by_customer ist hier einzusetzen. Bei aktivem BB_MCP_READ_ONLY ist dieser erste " +
    "Schritt gesperrt, dann liefert nur bb_reports_get_ledger eine Auswertung. Die Salden " +
    "stehen im Objekt sums, geschlüsselt nach Kontonummer. error_code 8 heißt: Erzeugung " +
    "läuft noch. error_code 7 heißt: kein Bericht zu dieser Kennung.",
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)." }],
  // `report` und `files` stehen auf oberster Ebene des Umschlags, nicht unter `data`
  // (Spezifikation `ReportsGetSums_Success`).
  // Wie bei bb_reports_get_bwa: Der Vertragslauf (AP17, Plan 9.7) erreicht diesen Endpunkt
  // nicht, weil seine Vorbedingung bb_reports_create_sums schreibend ist. Die Antwortform
  // bleibt aus der Spezifikation und aus berichte.md übernommen und wird im Testmandat aus
  // Plan 9.9 Punkt 1 geklärt.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "long",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
