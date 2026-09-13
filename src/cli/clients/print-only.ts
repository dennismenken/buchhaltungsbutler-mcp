/**
 * Die Sammeldatei für Zed, Continue und Jan (Plan 8.3).
 *
 * Diese drei Clients werden **nicht** automatisch konfiguriert, jeder aus einem eigenen,
 * benannten Grund:
 *
 * - **Zed**: `settings.json` ist JSONC und darf Kommentare tragen. Maschinelles Neuschreiben
 *   zerstörte sie. Zusätzlich ist der Pfad der Datei in der Primärquelle nicht genannt und
 *   damit **nicht verifiziert**. Der Wrapper-Schlüssel heißt hier `context_servers`.
 * - **Continue**: YAML, und der Ablageort hängt vom Projekt ab. Der Namensraum im Paketnamen
 *   erzwingt dort Anführungszeichen: `@` darf in YAML keinen unquotierten Skalar beginnen.
 * - **Jan**: kein dokumentierter Dateipfad, die Einrichtung läuft über die Oberfläche.
 *
 * Alle drei geben einen fertigen Block aus und schreiben nichts. `apply` und `remove` liefern
 * deshalb immer `manual` und sagen, wo der Block hingehört. Das ist kein halber Adapter: Das
 * Ergebnis ist genau das, was der Plan für diese Clients vorsieht.
 */

import path from "node:path";

import { CREDENTIAL_VARS } from "../../config/env.js";
import {
  entryEnv,
  renderJson,
  type ClientAdapter,
  type ClientHost,
  type ClientPlan,
  type ConfigFormat,
  type ClientKey,
  type ClientPreview,
  type WriteOutcome,
} from "./types.js";

interface PrintOnlySpec {
  readonly key: ClientKey;
  readonly label: string;
  readonly way: string;
  readonly reason: string;
  readonly format: ConfigFormat;
  readonly inlineSecrets: boolean;
  readonly envReference: ((name: string) => string) | null;
  /** Der vermutete Pfad, falls es einen gibt. Immer mit Vorbehalt ausgegeben. */
  readonly pathHint: (host: ClientHost) => string | null;
  readonly pathNote: string;
  readonly render: (plan: ClientPlan, env: Readonly<Record<string, string>>) => string;
  readonly standingNotes: readonly string[];
  readonly finishNote: string;
}

function createPrintOnlyAdapter(spec: PrintOnlySpec): ClientAdapter {
  const envReference = (name: string): string | null => spec.envReference?.(name) ?? null;

  const manual = (host: ClientHost): WriteOutcome => {
    const target = spec.pathHint(host);
    return {
      kind: "manual",
      reason:
        `${spec.label} wird nicht automatisch konfiguriert: ${spec.reason} ` +
        (target === null ? spec.pathNote : `${spec.pathNote} Vermuteter Ort: ${target}.`),
    };
  };

  return {
    key: spec.key,
    label: spec.label,
    way: spec.way,
    automatic: false,
    scopes: ["user"],
    inlineSecrets: spec.inlineSecrets,
    envReference,
    finishNote: spec.finishNote,
    verifyCommand: null,

    detect(host) {
      const target = spec.pathHint(host);
      if (target !== null && host.exists(target)) {
        return { found: true, how: `Konfigurationsdatei gefunden: ${target}`, path: target };
      }
      return {
        found: false,
        how:
          target === null
            ? "kein dokumentierter Konfigurationspfad; Einrichtung über die Oberfläche"
            : `keine Konfigurationsdatei unter ${target}`,
        path: target,
      };
    },

    preview(plan, host): ClientPreview {
      const { env, notes } = entryEnv(plan, { envReference, inlineSecrets: spec.inlineSecrets });
      const target = spec.pathHint(host);
      return {
        path: target,
        pathNote: target === null ? spec.pathNote : `${spec.pathNote} Vermuteter Ort: ${target}.`,
        format: spec.format,
        block: spec.render(plan, env),
        notes: [...notes, ...spec.standingNotes],
      };
    },

    apply(_plan, host) {
      return manual(host);
    },

    remove(_plan, host) {
      return manual(host);
    },
  };
}

// --- Zed ------------------------------------------------------------------------------

export const zedAdapter: ClientAdapter = createPrintOnlyAdapter({
  key: "zed",
  label: "Zed",
  way: "Block ausgeben; settings.json ist JSONC mit Kommentaren",
  reason: "die settings.json ist JSONC und darf Kommentare tragen, die ein Neuschreiben zerstörte.",
  format: "json",
  inlineSecrets: true,
  envReference: null,
  pathHint: (host) => {
    if (host.platform === "win32") {
      const appData = host.env.APPDATA;
      return appData !== undefined && appData.trim() !== ""
        ? path.join(appData, "Zed", "settings.json")
        : null;
    }
    const xdg = host.env.XDG_CONFIG_HOME;
    const base = xdg !== undefined && xdg.trim() !== "" ? xdg : path.join(host.homeDir, ".config");
    return path.join(base, "zed", "settings.json");
  },
  pathNote:
    "Der Weg über die Oberfläche ist der belegte: Settings, AI, MCP Servers, oder die Aktion " +
    "agent: open settings. Der Dateipfad ist in der Primärquelle nicht genannt und damit nicht " +
    "verifiziert.",
  render: (plan, env) =>
    renderJson({
      context_servers: {
        [plan.serverName]: {
          command: plan.launch.command,
          args: [...plan.launch.args],
          ...(Object.keys(env).length > 0 ? { env } : {}),
        },
      },
    }),
  standingNotes: [
    "Zed nennt MCP-Server context_servers; der Wrapper-Schlüssel weicht also von allen " +
      "anderen Clients ab.",
  ],
  finishNote: "Zed übernimmt Änderungen an der settings.json sofort.",
});

// --- Continue -------------------------------------------------------------------------

function renderContinueYaml(plan: ClientPlan, env: Readonly<Record<string, string>>): string {
  const lines = [
    "name: BuchhaltungsButler mcpServer",
    "version: 0.0.1",
    "schema: v1",
    "mcpServers:",
    `  - name: ${plan.serverName}`,
    "    type: stdio",
    `    command: ${plan.launch.command}`,
  ];
  if (plan.launch.args.length > 0) {
    lines.push("    args:");
    for (const arg of plan.launch.args) {
      // Anführungszeichen sind hier Pflicht und kein Stilmittel: In YAML darf @ keinen
      // unquotierten Skalar beginnen (distribution.md 11.1).
      lines.push(`      - ${JSON.stringify(arg)}`);
    }
  }
  const names = Object.keys(env);
  if (names.length > 0) {
    lines.push("    env:");
    for (const name of names) {
      lines.push(`      ${name}: ${JSON.stringify(env[name] ?? "")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export const continueAdapter: ClientAdapter = createPrintOnlyAdapter({
  key: "continue",
  label: "Continue",
  way: "Block ausgeben; YAML, Ablageort projektabhängig",
  reason: "das Format ist YAML und der Ablageort hängt vom Arbeitsbereich ab.",
  format: "yaml",
  inlineSecrets: true,
  // Continue liest Geheimnisse als ${{ secrets.NAME }}; das ist keine Umgebungsvariable,
  // sondern der eigene Geheimnisspeicher des Clients.
  envReference: (name) => `\${{ secrets.${name} }}`,
  pathHint: (host) => path.join(host.cwd, ".continue", "mcpServers", "buchhaltungsbutler.yaml"),
  pathNote:
    "Der Block gehört in eine eigene YAML-Datei unter .continue/mcpServers/ auf oberster Ebene " +
    "des Arbeitsbereichs, oder in den Abschnitt mcpServers der config.yaml.",
  render: renderContinueYaml,
  standingNotes: [
    "MCP wirkt in Continue nur im Agent-Modus.",
    `Für Geheimnisse kennt Continue \${{ secrets.NAME }}; die drei Namen lauten ${CREDENTIAL_VARS.join(", ")}.`,
  ],
  finishNote: "Continue liest die Dateien unter .continue/ beim Start des Arbeitsbereichs.",
});

// --- Jan ------------------------------------------------------------------------------

export const janAdapter: ClientAdapter = createPrintOnlyAdapter({
  key: "jan",
  label: "Jan",
  way: "Block ausgeben; kein dokumentierter Dateipfad",
  reason: "für Jan ist kein Dateipfad der Konfiguration belegt.",
  format: "json",
  inlineSecrets: true,
  envReference: null,
  pathHint: () => null,
  pathNote:
    "Einrichtung über die Oberfläche: Settings, MCP Servers, Schaltfläche + Add MCP Server. " +
    "Die Felder heißen Command, Args und Env; die Werte aus dem Block dort eintragen.",
  render: (plan, env) =>
    renderJson({
      command: plan.launch.command,
      args: [...plan.launch.args],
      ...(Object.keys(env).length > 0 ? { env } : {}),
    }),
  standingNotes: [
    "Die Angaben zu Jan stammen aus Suchtreffern, nicht aus einem direkten Abruf der " +
      "Primärquelle, und sind damit schwächer belegt als die übrigen.",
    'Die Einstellung "Allow All MCP Tool Permissions" gibt alle Werkzeuge ohne Rückfrage ' +
      "frei. Für einen Server mit 39 schreibenden Werkzeugen ist das die falsche Einstellung; " +
      "wer sie braucht, setzt BB_MCP_READ_ONLY=true.",
  ],
  finishNote: "In Jan den Server nach dem Anlegen einschalten; die Anzeige wird dann grün.",
});

/**
 * Der vierte Fall aus der Tabelle in 8.3, ohne Clientkürzel: ChatGPT im Browser. Er ist
 * technisch ausgeschlossen und taucht deshalb in `--help` nicht auf; der Satz steht hier,
 * damit die Begründung im Code eine Heimat hat und `doctor` sie nennen kann.
 */
export const CHATGPT_BROWSER_NOTE =
  "ChatGPT im Browser kann keinen lokalen MCP-Server einbinden: Die Oberfläche läuft in einem " +
  "fremden Rechenzentrum und hat keinen Weg zu einem Prozess auf diesem Rechner. Für ChatGPT " +
  "ist die Desktop-App der Weg; sie liest dieselbe Konfiguration wie die Codex CLI.";
