/**
 * Die Zeilen zur Betriebsart für `doctor` und `print-config`.
 *
 * Beide Unterbefehle nennen die aktive Betriebsart und, im Modus `discovery`, welche
 * Werkzeuge dieser Start anmeldet: die fünf Gateways und die aktiven Bündel. Die Namen
 * stehen genau einmal im Code, in `src/server/discovery.ts`, und werden von hier nur
 * gelesen; angemeldet wird in `src/server/create-server.ts` und nirgends sonst.
 */

import { BUNDLE_ENTRIES } from "../bundles/index.js";
import { bundlesAreActive } from "../bundles/register.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { GATEWAY_TOOL_NAMES } from "../server/discovery.js";

/**
 * Die Zeilen zur Betriebsart, ohne Einrückung und ohne Abschnittskopf. Die Aufrufer
 * rücken selbst ein, wie bei den Zeilen zum Gruppenschalter.
 */
export function toolModeLines(config: ResolvedConfig): readonly string[] {
  if (config.toolMode === "direct") {
    return ["Betriebsart: direct (Vorgabe). Der Server meldet jedes Endpunktwerkzeug einzeln an."];
  }
  const bundles = bundlesAreActive(config.toolGroups)
    ? BUNDLE_ENTRIES.map((entry) => entry.name)
    : [];
  return [
    "Betriebsart: discovery. Der Server meldet fünf Gatewaywerkzeuge und die aktiven " +
      "Bündel an.",
    `Gateways: ${GATEWAY_TOOL_NAMES.join(", ")}.`,
    bundles.length === 0
      ? "Bündel: keine; die Gruppe bundles ist abgeschaltet."
      : `Bündel: ${bundles.join(", ")}.`,
  ];
}
