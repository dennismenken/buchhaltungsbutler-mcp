// Werkzeug 53 aus Plan 3.8: `/reports/create/bwa`, Erzeugung der BWA anstoßen.
//
// Klasse AR (Plan 3.3): `destructiveHint: true`, weil ein neu erzeugter Bericht den
// vorherigen desselben Typs **ersetzt** — dass er jederzeit neu berechenbar ist, ändert
// nichts daran, dass der Vorgänger weg ist. Pflichtsatz U7.
//
// Eimer `reports` (Plan 5.4): ein Aufruf je zehn Sekunden. Das ist **kein** API-Limit,
// sondern eine Bremse gegen das Muster „create, sofort get, error_code 8, sofort wieder
// create", das einen laufenden Bericht mehrfach ersetzt.
//
// **Q1** hängt hier (Plan 4.7): `date_from` und `date_to` sind beide `required: true`, und
// ein vertauschter Zeitraum erzeugt einen falschen Bericht, der den vorherigen ersetzt.
// Genau hier wiegt die vertauschte Grenze am schwersten. Die beiden Abholwerkzeuge
// `bb_reports_get_bwa` und `bb_reports_get_sums` tragen Q1 ausdrücklich nicht: Sie führen
// überhaupt kein Datumsfeld.
//
// Der Anschlusshinweis nach einem erfolgreichen Aufruf steht wörtlich in
// `src/response/next-step.ts` (`reportRequestedNote`, Plan 7.6, erste Zeile der
// Hinweistabelle) und wird über die Paartabelle in `src/response/build.ts` an diesen
// Werkzeugnamen gehängt; `ToolEntry` führt für ihn kein eigenes Feld.

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

/** Werkzeug 53: `/reports/create/bwa`. */
export const bb_reports_create_bwa: ToolEntry = {
  name: "bb_reports_create_bwa",
  title: "BWA anfordern",
  path: { literal: "/reports/create/bwa" },
  effect: "create",
  toolClass: "AR",
  tier: 2,
  description:
    "Stößt in BuchhaltungsButler die Erzeugung einer Betriebswirtschaftlichen Auswertung für " +
    "einen Zeitraum an und liefert deren id_by_customer zurück. Die Berechnung läuft im " +
    "Hintergrund; abgeholt wird das Ergebnis danach mit bb_reports_get_bwa und " +
    "report_id_by_customer, das bis zum Abschluss mit error_code 8 antwortet. Ein zweiter " +
    "Aufruf vor dem Abschluss scheitert mit error_code 12. Dateien kann dieser Endpunkt " +
    "nicht anfordern, anders als bb_reports_create_sums. Ersetzt die zuvor in " +
    "BuchhaltungsButler erzeugte Auswertung desselben Typs. Buchungsdaten ändern sich dabei " +
    "nicht, und die Auswertung lässt sich jederzeit neu erzeugen.",
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
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)." }],
  // `id_by_customer` steht **auf oberster Ebene** des Umschlags und nicht unter `data`
  // (Spezifikation `ReportsCreateBwa_Success`); deshalb `container: "none"`. Die Antwort
  // liefert die Kennung als String, der Abholaufruf erwartet sie als Ganzzahl
  // (berichte.md 4.6 Punkt 5) — deshalb `id-string`.
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
    tool: "bb_reports_get_bwa",
    // Die Kennung des neuen Berichts steht nur in der Antwort, und genau die fehlt nach
    // einem Zeitlimit. Der Eintrag nennt sie trotzdem, damit der Prüfaufruf vollständig
    // dasteht; ohne Wert erscheint dort „(nicht gesendet)" und nichts Erfundenes.
    argsFrom: { report_id_by_customer: "id_by_customer" },
    hint:
      "dabei gilt: error_code 8 heißt, dass die Erzeugung läuft, der Aufruf also gewirkt hat, " +
      "und error_code 7, dass zu dieser Kennung kein Bericht vorliegt. Ist die Kennung " +
      "unbekannt, bleibt die Weboberfläche von BuchhaltungsButler",
  },
  crossChecks: ["Q1", "Q3"],
  invalidatesCache: [],
};
