/**
 * Windsurf, Cascade: `~/.codeium/windsurf/mcp_config.json`.
 *
 * Reines JSON. Eine `${VAR}`-Ersetzung ist in der Quelle **nicht dokumentiert**; Zugangsdaten
 * stehen hier also im Klartext, wenn man sie hineinschreibt (`distribution.md` 10.1).
 *
 * Cascade begrenzt die Gesamtzahl der Werkzeuge auf 100. Dieser Server bringt 54 mit; das ist
 * die Hälfte des Budgets und gehört in die Ausgabe, damit niemand darüber stolpert.
 */

import path from "node:path";

import { createJsonFileAdapter, type ClientAdapter, type ClientHost } from "./types.js";

export function windsurfConfigPath(host: ClientHost): string {
  return path.join(host.homeDir, ".codeium", "windsurf", "mcp_config.json");
}

export const windsurfAdapter: ClientAdapter = createJsonFileAdapter({
  key: "windsurf",
  label: "Windsurf, Cascade",
  way: "~/.codeium/windsurf/mcp_config.json",
  wrapperKey: "mcpServers",
  includeType: false,
  inlineSecrets: true,
  envReference: null,
  scopes: ["user"],
  resolvePath: (host) => windsurfConfigPath(host),
  reachHint:
    "Die Datei lässt sich über das MCP-Symbol oben rechts im Cascade-Bereich anlegen, oder " +
    "über Devin Settings, Cascade, Abschnitt MCP Servers.",
  standingNotes: [
    "Windsurf kennt laut Quelle keine Variablenersetzung; Zugangsdaten stünden hier im Klartext.",
    "Cascade begrenzt die Gesamtzahl der Werkzeuge auf 100. Dieser Server bringt 54 mit.",
  ],
  finishNote: "In Cascade die MCP-Server neu laden (Refresh im MCP-Bereich).",
  verifyCommand: null,
});
