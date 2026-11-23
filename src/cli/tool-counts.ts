// Werkzeugzahlen für Texte an den Nutzer, aus dem Register gezählt.
//
// Die Einrichtung und die Client-Hinweise nannten feste Zahlen („Alle 54 Werkzeuge“, „39
// schreibenden Werkzeugen“). Nach der Spezifikation vom 2026-11-22 stimmten sie nicht mehr,
// und keine Prüfung bemerkte es, weil eine eingetragene Zahl nur gegen sich selbst stimmt.
// Hier werden sie deshalb aus `TOOL_ENTRIES` und `BUNDLE_ENTRIES` gezählt, genau wie in
// `doctor`.

import { BUNDLE_ENTRIES } from "../bundles/index.js";
import { TOOL_ENTRIES } from "../registry/index.generated.js";

/** Endpunktwerkzeuge, eines je API-Endpunkt. */
export const ENDPOINT_TOOL_COUNT = TOOL_ENTRIES.length;

/** Lesende Endpunktwerkzeuge (Wirkung `read`). */
export const READING_ENDPOINT_TOOL_COUNT = TOOL_ENTRIES.filter(
  (entry) => entry.effect === "read",
).length;

/** Schreibende Endpunktwerkzeuge, also alle übrigen. */
export const WRITING_ENDPOINT_TOOL_COUNT = ENDPOINT_TOOL_COUNT - READING_ENDPOINT_TOOL_COUNT;

/** Bündelwerkzeuge. */
export const BUNDLE_TOOL_TOTAL = BUNDLE_ENTRIES.length;

/** Alle Werkzeuge, die bei voller Gruppenwahl angemeldet werden. */
export const TOTAL_TOOL_COUNT = ENDPOINT_TOOL_COUNT + BUNDLE_TOOL_TOTAL;

/**
 * Alle schreibenden Werkzeuge einschließlich der schreibenden Bündel. Diese Zahl zählt, wo ein
 * Client je Werkzeug über eine Rückfrage entscheidet.
 */
export const WRITING_TOOL_COUNT =
  WRITING_ENDPOINT_TOOL_COUNT + BUNDLE_ENTRIES.filter((entry) => entry.effect !== "read").length;
