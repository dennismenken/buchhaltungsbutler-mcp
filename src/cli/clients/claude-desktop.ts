/**
 * Claude Desktop: `claude_desktop_config.json` lesen, ergänzen, zurückschreiben.
 *
 * Reines JSON, also verlustfrei änderbar. Claude Desktop kennt **keine** `${VAR}`-Ersetzung;
 * wer hier Zugangsdaten will, bekommt sie im Klartext in einer Datei im Benutzerprofil
 * (`distribution.md` 4.1). Der empfohlene Weg bleibt deshalb die Zugangsdatendatei.
 *
 * Pfade: macOS und Windows sind vom Hersteller dokumentiert. Für Linux gibt es nur Pakete aus
 * der Gemeinschaft; `~/.config/Claude/claude_desktop_config.json` ist dort **nicht
 * verifiziert**. Existiert die Datei nicht, wird nur ausgegeben — geraten wird nicht.
 */

import path from "node:path";

import { createJsonFileAdapter, type ClientAdapter, type ClientHost } from "./types.js";

/** Der dokumentierte Pfad je Plattform; `null`, wenn es für die Plattform keinen gibt. */
export function claudeDesktopConfigPath(host: ClientHost): string | null {
  if (host.platform === "darwin") {
    return path.join(
      host.homeDir,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (host.platform === "win32") {
    const appData = host.env.APPDATA;
    const base =
      appData !== undefined && appData.trim() !== ""
        ? appData
        : path.join(host.homeDir, "AppData", "Roaming");
    return path.join(base, "Claude", "claude_desktop_config.json");
  }
  // Linux und alles Übrige: Pfad der Gemeinschaftspakete, nicht vom Hersteller gedeckt.
  return path.join(host.homeDir, ".config", "Claude", "claude_desktop_config.json");
}

export const claudeDesktopAdapter: ClientAdapter = createJsonFileAdapter({
  key: "claude-desktop",
  label: "Claude Desktop",
  way: "claude_desktop_config.json ergänzen",
  wrapperKey: "mcpServers",
  includeType: false,
  inlineSecrets: true,
  envReference: null,
  scopes: ["user"],
  resolvePath: (host) => claudeDesktopConfigPath(host),
  reachHint:
    "Die Datei entsteht über das Claude-Menü in der Menüleiste: Settings, Reiter Developer, " +
    "Schaltfläche Edit Config.",
  standingNotes: [
    "Claude Desktop kennt keine ${VAR}-Ersetzung. Stehen die Zugangsdaten in dieser Datei, " +
      "liegen sie im Klartext im Benutzerprofil; die Zugangsdatendatei ist der bessere Weg.",
  ],
  finishNote:
    "Claude Desktop vollständig beenden und neu starten. Ein Schließen des Fensters genügt " +
    "nicht. Danach: Symbol links unten im Eingabefeld, dann Connectors.",
  verifyCommand: null,
});
