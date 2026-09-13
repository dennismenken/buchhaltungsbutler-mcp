/**
 * Cline, Variante Kommandozeile: `~/.cline/mcp.json`.
 *
 * Reines JSON, deshalb wird geschrieben. Der Eintrag trägt zusätzlich `disabled` und
 * `autoApprove`; in `autoApprove` gehören **nur lesende** Werkzeuge, und weil die Liste je
 * Arbeitsweise anders aussieht, bleibt sie hier leer (`distribution.md` 10.3).
 *
 * Die **IDE-Variante** von Cline hat keinen dokumentierten Dateipfad. Sie wird deshalb nicht
 * von diesem Adapter bedient, sondern in der Sammeldatei `print-only.ts` erwähnt; ein
 * geratener Pfad wäre schlimmer als ein Hinweis auf die Oberfläche.
 */

import path from "node:path";

import { createJsonFileAdapter, type ClientAdapter, type ClientHost } from "./types.js";

export function clineConfigPath(host: ClientHost): string {
  return path.join(host.homeDir, ".cline", "mcp.json");
}

export const clineAdapter: ClientAdapter = createJsonFileAdapter({
  key: "cline",
  label: "Cline (Kommandozeile)",
  way: "~/.cline/mcp.json",
  wrapperKey: "mcpServers",
  includeType: false,
  inlineSecrets: true,
  envReference: null,
  scopes: ["user"],
  resolvePath: (host) => clineConfigPath(host),
  reachHint:
    "Die Datei entsteht, sobald in der Cline-Kommandozeile einmal ein MCP-Server eingetragen " +
    "wurde. In der IDE-Erweiterung führt der Weg über das Symbol MCP Servers, Reiter " +
    "Configure, Schaltfläche Configure MCP Servers.",
  extraEntryFields: { disabled: false, autoApprove: [] },
  standingNotes: [
    "In autoApprove gehören ausschließlich die 15 lesenden Werkzeuge dieses Servers. Die " +
      "Liste bleibt hier leer, damit nichts ohne Rückfrage schreibt.",
  ],
  finishNote: "Cline liest die Datei beim Start; eine laufende Sitzung neu starten.",
  verifyCommand: null,
});
