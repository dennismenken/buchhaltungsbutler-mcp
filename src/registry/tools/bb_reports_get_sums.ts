// Werkzeug 51: `/reports/get/sums`, eine erzeugte Summen- und Saldenliste
// abholen.
//
// Lesend (Klasse R), deshalb kein Pflichtsatz und `response_format` als einziges
// serverseitiges Feld. Zeitlimitstufe `long` wie alle fünf
// Berichtswerkzeuge, Eimer `default`: Im Eimer `reports` liegen nur die beiden
// erzeugenden Werkzeuge.
//
// **Q1 trägt dieses Werkzeug ausdrücklich nicht**: Es führt laut Spezifikation
// nur `report_id_by_customer` und `get_files` und hat überhaupt kein Datumsfeld.
//
// **Vorbedingung und Sperre:** Ohne vorheriges `bb_reports_create_sums` gibt es nichts
// abzuholen (berichte.md 2.3, live gemessen: error_code 7 bei einer Kennung ohne Bericht,
// error_code 6 bei fehlender Kennung). Bei aktivem `BB_MCP_READ_ONLY` ist der erzeugende
// erste Schritt gesperrt.
//
// **Der Antwortvertrag bleibt leer, und das ist ein Befund:** `report` und `files` sind
// untypisierte Objekte, und `ContractFieldType` kennt keinen Typ dafür. Mit
// `"string"` erzeugte jeder erfolgreiche Aufruf zwei `_contract_warnings`; so laufen beide
// Felder als unbekannt unverändert durch.

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
  group: "reports",
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt." }],
  // Die Summen- und Saldenliste kommt ohne data-Hülle unter `report`; die Konten stehen in
  // `report.sums` als Objekt mit der Kontonummer als Schlüssel, die Kontoangaben darin
  // verschachtelt unter `postingaccount`. Die Umformung in src/mapping/report-rows.ts macht
  // daraus eine Zeile je Konto. Beträge liefert die API hier als Zahl, anders als sonst; sie
  // bleiben Zahlen. Gemessen am 2026-09-14 mit 166 Konten über einen einmaligen Lauf von
  // bb_reports_create_sums mit Freigabe des Projektinhabers (Befund L7 in
  // docs/api/live-befunde.md). `sumPeriodDebit` und `sumPeriodCredit` waren in allen
  // Einträgen null.
  responseContract: {
    container: "none",
    reportRows: "sums",
    fields: {
      postingaccount_number: "id-string",
      name: "string",
      class: "string",
      type: "string",
      balanceBeforeDebit: "number",
      balanceBeforeCredit: "number",
      balanceBeforeAbsolute: "number",
      balanceBeforeSide: "string",
      sumPeriodDebit: "number",
      sumPeriodCredit: "number",
      balanceAfterDebit: "number",
      balanceAfterCredit: "number",
      balanceAfterAbsolute: "number",
      balanceAfterSide: "string",
    },
    source: "gemessen",
    measuredOn: "2026-09-14",
  },
  shape: "ack",
  concise: [
    "postingaccount_number",
    "name",
    "balanceBeforeAbsolute",
    "balanceBeforeSide",
    "sumPeriodDebit",
    "sumPeriodCredit",
    "balanceAfterAbsolute",
    "balanceAfterSide",
  ],
  bucket: "default",
  timeoutTier: "long",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
