/**
 * Der Betriebsmodus: `BB_MCP_TOOL_MODE` mit den Werten `direct` und `discovery`.
 *
 * Zwei Betriebsarten statt einer, weil sie verschiedene Clientlagen bedienen: `direct`
 * meldet jedes Endpunktwerkzeug einzeln an (das heutige Verhalten und die Vorgabe),
 * `discovery` meldet stattdessen die fünf Gatewaywerkzeuge aus `src/server/discovery.ts`
 * an und führt die Endpunktwerkzeuge über sie aus. Die Bündel und die Resources sind in
 * beiden Modi dieselben.
 *
 * **Entschieden wird einmal beim Serverstart, aus der eingefrorenen Konfiguration.** Das
 * ist dieselbe Begründung wie beim Gruppenschalter (`config/tool-groups.ts`): Die
 * MUST-NOT-vary-Klausel verbietet eine Werkzeugliste, die je Verbindung schwankt, nicht
 * eine Konfigurationsentscheidung. Über die gesamte Verbindung bleibt die Liste stabil,
 * und dieser Server schickt kein `list_changed`, in keinem der beiden Modi.
 *
 * **Ein leerer Wert gilt als nicht gesetzt**, wie beim Gruppenschalter: `config/env.ts`
 * behandelt ihn bereits so und meldet ihn als Warnung. Das Desktop-Bundle setzt die
 * Variable über `${user_config.tool_mode}`, und ein optionales, vom Nutzer leer
 * gelassenes Feld expandiert damit auf einen leeren Wert. Ein Startfehler darauf machte
 * das Bundle für jeden unstartbar, der das Feld nicht ausfüllt.
 *
 * Großschreibung wird angenommen (`Direct` gilt als `direct`), wie bei den
 * Gruppennamen: Getippt wird der Wert von einem Menschen, und ein Abbruch über die
 * Großschreibung erklärte nichts, sondern ärgerte nur.
 */

import { ConfigError } from "./env.js";

/** Der Variablenname. Er steht genau hier und wird nirgends neu geschrieben. */
export const TOOL_MODE_VAR = "BB_MCP_TOOL_MODE";

/** Die beiden Betriebsarten dieses Servers. */
export type ToolMode = "direct" | "discovery";

/** Beide Modi in der Reihenfolge, in der Fehlermeldungen sie nennen. */
export const TOOL_MODES: readonly ToolMode[] = Object.freeze(["direct", "discovery"]);

/** Die Vorgabe des Servers: das heutige Verhalten, jedes Endpunktwerkzeug einzeln. */
export const DEFAULT_TOOL_MODE: ToolMode = "direct";

/** `true`, wenn der Wert einer der beiden Modi ist. */
export function isToolMode(value: string): value is ToolMode {
  return (TOOL_MODES as readonly string[]).includes(value);
}

/**
 * Löst den Rohwert der Variablen zum wirksamen Modus auf.
 *
 * @param raw Der Rohwert aus `config/env.ts`; `undefined`, wenn nicht oder leer gesetzt
 *   oder ein nicht ersetzter `${user_config.…}`-Platzhalter darin stand.
 * @throws ConfigError bei jedem Wert, der keiner der beiden Modi ist.
 */
export function resolveToolMode(raw: string | undefined): ToolMode {
  if (raw === undefined) {
    return DEFAULT_TOOL_MODE;
  }
  const candidate = raw.trim().toLowerCase();
  if (candidate === "") {
    return DEFAULT_TOOL_MODE;
  }
  if (isToolMode(candidate)) {
    return candidate;
  }
  throw new ConfigError(
    "tool-mode-unknown",
    [
      `Abbruch: ${TOOL_MODE_VAR} nennt den unbekannten Betriebsmodus "${raw.trim()}".`,
      `Gültig sind: ${TOOL_MODES.join(", ")}.`,
      `"direct" meldet jedes Endpunktwerkzeug einzeln an (das heutige Verhalten), ` +
        `"discovery" meldet stattdessen die fünf Gatewaywerkzeuge bb_tools_discover, ` +
        `bb_tools_describe, bb_tools_invoke_read, bb_tools_invoke_write und ` +
        `bb_tools_invoke_destructive an.`,
      "Ein falsch geschriebener Modus wird nicht stillschweigend durch die Vorgabe " +
        "ersetzt: Er schaltete sonst unbemerkt auf eine andere Werkzeugliste um.",
      "Der Server ist nicht gestartet. Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.",
    ].join("\n"),
  );
}
