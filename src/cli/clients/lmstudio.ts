/**
 * LM Studio: `~/.lmstudio/mcp.json`, **nur wenn vorhanden** (Plan 8.3, „ja, mit Vorbehalt").
 *
 * Zwei benannte Unsicherheiten, beide aus `distribution.md` 10.5:
 *
 * 1. Zu diesem Pfad gibt es einen offenen Fehlerbericht im Bugtracker von LM Studio
 *    (Issue 1371), demzufolge der tatsächliche Ort auf macOS abweicht. Der abweichende Pfad
 *    ist **nicht verifiziert**, deshalb bleibt es beim dokumentierten — und es wird nur
 *    geschrieben, wenn die Datei dort wirklich liegt.
 * 2. Die Beispiele der Primärquelle zeigen ausschließlich entfernte Server mit `url` und
 *    `headers`. Dass `command`, `args` und `env` dort ebenso wirken, folgt aus dem
 *    allgemeinen `mcpServers`-Schema, ist aber **nicht wörtlich belegt**.
 */

import path from "node:path";

import { createJsonFileAdapter, type ClientAdapter, type ClientHost } from "./types.js";

export function lmStudioConfigPath(host: ClientHost): string {
  return path.join(host.homeDir, ".lmstudio", "mcp.json");
}

export const lmStudioAdapter: ClientAdapter = createJsonFileAdapter({
  key: "lmstudio",
  label: "LM Studio",
  way: "~/.lmstudio/mcp.json, nur wenn vorhanden",
  wrapperKey: "mcpServers",
  includeType: false,
  inlineSecrets: true,
  envReference: null,
  scopes: ["user"],
  resolvePath: (host) => lmStudioConfigPath(host),
  reachHint:
    "Der zuverlässige Weg ist der eingebaute Editor: rechte Seitenleiste, Reiter Program, " +
    "dann Install, dann Edit mcp.json. LM Studio lädt die Server danach selbst neu.",
  standingNotes: [
    "Der Pfad ist dokumentiert, laut offenem Fehlerbericht (lmstudio-ai/lmstudio-bug-tracker, " +
      "Issue 1371) auf macOS aber nicht überall zutreffend. Im Zweifel den Editor in der " +
      "Anwendung benutzen.",
    "Dass LM Studio in mcpServers auch command, args und env auswertet, ist aus der " +
      "Primärquelle nicht wörtlich belegt.",
  ],
  finishNote:
    "LM Studio lädt die Server nach dem Speichern selbst neu; ein Neustart ist nicht nötig.",
  verifyCommand: null,
});
