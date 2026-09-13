/**
 * Cursor: `~/.cursor/mcp.json` oder `.cursor/mcp.json` im Projekt.
 *
 * Abweichende Schreibweise der Ersetzung: Cursor schreibt `${env:NAME}`, nicht `${NAME}`
 * (`distribution.md` 8). Ersetzt wird in `command`, `args`, `env`, `url` und `headers`.
 *
 * Die Projektdatei darf angelegt werden: Ihr Ort ist durch `.cursor/mcp.json` im aktuellen
 * Verzeichnis festgelegt und nicht geraten. Die Datei im Benutzerprofil wird dagegen nur
 * ergänzt, wenn sie schon existiert.
 */

import path from "node:path";

import { createJsonFileAdapter, type ClientAdapter, type ClientHost } from "./types.js";

export function cursorConfigPath(host: ClientHost, scope: "user" | "project"): string {
  return scope === "project"
    ? path.join(host.cwd, ".cursor", "mcp.json")
    : path.join(host.homeDir, ".cursor", "mcp.json");
}

export const cursorAdapter: ClientAdapter = createJsonFileAdapter({
  key: "cursor",
  label: "Cursor",
  way: "~/.cursor/mcp.json oder .cursor/mcp.json",
  wrapperKey: "mcpServers",
  includeType: true,
  inlineSecrets: true,
  envReference: (name) => `\${env:${name}}`,
  scopes: ["user", "project"],
  resolvePath: (host, scope) => cursorConfigPath(host, scope),
  reachHint:
    "Die Datei lässt sich in Cursor über Customize, MCP anlegen, oder von Hand unter dem " +
    "genannten Pfad.",
  standingNotes: [
    "Für stdio-Server kennt Cursor zusätzlich envFile, einen Pfad zu einer Datei mit " +
      "Variablen. Damit bleibt eine eingecheckte Projektkonfiguration frei von Geheimnissen.",
  ],
  createInScopes: ["project"],
  finishNote:
    "Cursor neu laden (Developer: Reload Window) oder den Server unter Customize starten.",
  verifyCommand: null,
});
