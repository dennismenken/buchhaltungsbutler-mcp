// Werkzeug 54 aus Plan 3.8: `/reports/create/sums`, Erzeugung der Summen- und Saldenliste
// anstoßen.
//
// Klasse AR (Plan 3.3): `destructiveHint: true`, weil der neue Bericht den vorherigen
// desselben Typs **ersetzt**. Pflichtsatz U7. Eimer `reports` (Plan 5.4), ein Aufruf je zehn
// Sekunden — keine API-Regel, sondern eine Bremse gegen das Muster „create, sofort get,
// error_code 8, sofort wieder create".
//
// **Q1** hängt hier (Plan 4.7): Beide Datumsfelder sind `required: true`, und ein
// vertauschter Zeitraum erzeugt einen falschen Bericht, der den vorherigen ersetzt.
//
// Eine Namensfalle steht in der Beschreibung, weil eine naive Zuordnung über gleiche
// Feldnamen fehlschlägt (berichte.md 5.6 Punkt 1): Der Parameter heißt `archive_export`, der
// Schlüssel im `files`-Objekt von `/reports/get/sums` dagegen `csv_archive`.
//
// Der Anschlusshinweis nach einem erfolgreichen Aufruf steht wörtlich in
// `src/response/next-step.ts` (`reportRequestedNote`, Plan 7.6) und wird über die Paartabelle
// in `src/response/build.ts` an diesen Werkzeugnamen gehängt.

import { z } from "zod";

import { dateValue } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const DATE_FROM_DESCRIPTION =
  `Erster Tag des Auswertungszeitraums als YYYY-MM-DD, zum Beispiel 2026-01-01. ` +
  `${EMPTY_STRING_SENTENCE} Der Zeitraum schließt diesen Tag ein.`;

const DATE_TO_DESCRIPTION =
  `Letzter Tag des Auswertungszeitraums als YYYY-MM-DD, zum Beispiel 2026-03-31. ` +
  `${EMPTY_STRING_SENTENCE} Der Zeitraum schließt diesen Tag ein; für ein vollständiges ` +
  "erstes Quartal also 2026-03-31 und nicht 2026-04-01.";

const BASE_DESCRIPTION =
  "Datum der Periodenzuordnung: 'date' Buchungsdatum, 'date_delivery_else_date' " +
  "Leistungsdatum und ersatzweise Buchungsdatum. Ohne Angabe 'date'. Die BWA der " +
  "Weboberfläche wertet nach dem Leistungsdatum aus; beim Vergleich bewusst setzen.";

/** Werkzeug 54: `/reports/create/sums`. */
export const bb_reports_create_sums: ToolEntry = {
  name: "bb_reports_create_sums",
  title: "Summen- und Saldenliste anfordern",
  path: { literal: "/reports/create/sums" },
  effect: "create",
  toolClass: "AR",
  tier: 2,
  description:
    "Stößt in BuchhaltungsButler die Erzeugung einer Summen- und Saldenliste über alle Konten " +
    "des Mandanten an und liefert deren id_by_customer zurück; wahlweise entstehen dabei PDF, " +
    "CSV und ein ZIP-Archiv mit den Kontenblättern. Die Berechnung läuft im Hintergrund; " +
    "abgeholt wird das Ergebnis danach mit bb_reports_get_sums und report_id_by_customer, das " +
    "bis zum Abschluss mit error_code 8 antwortet. Ein zweiter Aufruf vor dem Abschluss " +
    "scheitert mit error_code 12. Eine Filterung auf einzelne Konten kennt die API nicht. " +
    "Ersetzt die zuvor in BuchhaltungsButler erzeugte Auswertung desselben Typs. " +
    "Buchungsdaten ändern sich dabei nicht, und die Auswertung lässt sich jederzeit neu " +
    "erzeugen.",
  mandatorySentence: "U7",
  fields: [
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: true,
      description: DATE_FROM_DESCRIPTION,
      schema: dateValue(DATE_FROM_DESCRIPTION),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: true,
      description: DATE_TO_DESCRIPTION,
      schema: dateValue(DATE_TO_DESCRIPTION),
    },
    {
      name: "base",
      apiNames: ["base"],
      source: "body",
      required: false,
      description: BASE_DESCRIPTION,
      schema: z.enum(["date", "date_delivery_else_date"]).describe(BASE_DESCRIPTION),
    },
    {
      name: "file_pdf",
      apiNames: ["file_pdf"],
      source: "body",
      required: false,
      description:
        "true erzeugt zusätzlich ein PDF. Abgeholt wird es über bb_reports_get_sums mit " +
        "get_files; ohne diese Angabe bleibt der Schlüssel pdf dort null.",
      schema: z.boolean().describe("true erzeugt zusätzlich ein PDF der Auswertung."),
    },
    {
      name: "file_csv",
      apiNames: ["file_csv"],
      source: "body",
      required: false,
      description:
        "true erzeugt zusätzlich eine CSV-Datei. Abgeholt wird sie über bb_reports_get_sums " +
        "mit get_files; ohne diese Angabe bleibt der Schlüssel csv dort null.",
      schema: z.boolean().describe("true erzeugt zusätzlich eine CSV-Datei der Auswertung."),
    },
    {
      name: "archive_export",
      apiNames: ["archive_export"],
      source: "body",
      required: false,
      description:
        "true erzeugt zusätzlich ein ZIP-Archiv aus CSV-Datei und den Kontenblättern aller " +
        "bebuchten Konten. Im Objekt files von bb_reports_get_sums heißt es csv_archive, " +
        "nicht archive_export. Das ersetzt viele Aufrufe von bb_reports_get_ledger.",
      schema: z
        .boolean()
        .describe("true erzeugt zusätzlich ein ZIP-Archiv mit CSV-Datei und Kontenblättern."),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)." }],
  // `id_by_customer` steht **auf oberster Ebene** des Umschlags (Spezifikation
  // `ReportsCreateSums_Success`); deshalb `container: "none"`. Als String geliefert, beim
  // Abholen als Ganzzahl erwartet (berichte.md 4.6 Punkt 5) — deshalb `id-string`.
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "reports",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_reports_get_sums",
    // Die Kennung des neuen Berichts steht nur in der Antwort, und genau die fehlt nach
    // einem Zeitlimit. Ohne Wert erscheint im Prüfaufruf „(nicht gesendet)".
    argsFrom: { report_id_by_customer: "id_by_customer" },
    hint:
      "dabei gilt: error_code 8 heißt, dass die Erzeugung läuft, der Aufruf also gewirkt hat, " +
      "und error_code 7, dass zu dieser Kennung kein Bericht vorliegt. Ist die Kennung " +
      "unbekannt, bleibt die Weboberfläche von BuchhaltungsButler",
  },
  crossChecks: ["Q1", "Q3"],
  invalidatesCache: [],
};
