/**
 * Claude Code: `claude mcp add-json` als Unterprozess (Plan 8.3).
 *
 * Die offizielle Kommandozeile wird aufgerufen, statt `~/.claude.json` nachzubauen. Diese
 * Datei führt neben den MCP-Servern den gesamten übrigen Zustand des Clients; sie von außen
 * neu zu schreiben wäre der riskantere Weg.
 *
 * Geprüft am 2026-09-12 an `claude mcp add-json --help`: Die Form ist
 * `claude mcp add-json [options] <name> <json>` mit `-s, --scope <local|user|project>`.
 *
 * **Dieser Weg schreibt keine Zugangsdaten in den Eintrag.** Sie stünden sonst als Argument
 * in der Prozessliste (`distribution.md` 13.1). Claude Code kennt dafür `${VAR}`.
 */

import {
  entryEnv,
  renderJson,
  type ClientAdapter,
  type ClientPlan,
  type ClientPreview,
  type WriteOutcome,
} from "./types.js";

const SCOPE_FLAG = "--scope";

function buildEntry(plan: ClientPlan): {
  readonly entry: Record<string, unknown>;
  readonly notes: readonly string[];
} {
  const { env, notes } = entryEnv(plan, { envReference: reference, inlineSecrets: false });
  const entry: Record<string, unknown> = {
    type: "stdio",
    command: plan.launch.command,
    args: [...plan.launch.args],
  };
  if (Object.keys(env).length > 0) {
    entry.env = env;
  }
  return { entry, notes };
}

/** Claude Code ersetzt `${VAR}` in `command`, `args`, `env`, `url` und `headers`. */
function reference(name: string): string {
  return `\${${name}}`;
}

export const claudeCodeAdapter: ClientAdapter = {
  key: "claude-code",
  label: "Claude Code",
  way: "claude mcp add-json",
  automatic: true,
  scopes: ["user", "project"],
  inlineSecrets: false,
  envReference: reference,
  finishNote:
    "Claude Code liest die Konfiguration beim Start einer Sitzung. Eine laufende Sitzung " +
    "übernimmt den Eintrag nach /mcp oder einem Neustart.",
  verifyCommand: "claude mcp get buchhaltungsbutler",

  detect(host) {
    const binary = host.which("claude");
    return {
      found: binary !== null,
      how: binary === null ? "claude nicht im Suchpfad" : `claude gefunden: ${binary}`,
      path: binary,
    };
  },

  preview(plan, host): ClientPreview {
    const { entry, notes } = buildEntry(plan);
    const json = JSON.stringify({ ...entry });
    return {
      path: null,
      pathNote:
        `Wird mit "claude mcp add-json ${SCOPE_FLAG} ${plan.scope} ${plan.serverName} '<json>'" ` +
        "eingetragen; es wird keine Datei von Hand geschrieben.",
      format: "json",
      block: renderJson(entry),
      notes: [
        ...notes,
        `Aufruf: claude mcp add-json ${SCOPE_FLAG} ${plan.scope} ${plan.serverName} '${json}'`,
        ...(host.which("claude") === null
          ? ["claude ist nicht im Suchpfad; der Aufruf muss dort erfolgen, wo Claude Code liegt."]
          : []),
      ],
    };
  },

  apply(plan, host): WriteOutcome {
    if (host.which("claude") === null) {
      return {
        kind: "manual",
        reason:
          "claude ist nicht im Suchpfad. Claude Code installieren oder den obigen Aufruf dort " +
          "ausführen, wo das Programm liegt.",
      };
    }
    const { entry } = buildEntry(plan);
    const args = [
      "mcp",
      "add-json",
      SCOPE_FLAG,
      plan.scope,
      plan.serverName,
      JSON.stringify(entry),
    ];
    const result = host.run("claude", args);
    if (result.failure !== null) {
      return { kind: "failed", reason: `claude ließ sich nicht starten: ${result.failure}` };
    }
    if (result.status !== 0) {
      return {
        kind: "failed",
        reason:
          `claude mcp add-json endete mit Rückgabewert ${String(result.status)}. ` +
          `Ausgabe: ${(result.stderr || result.stdout).trim()}`,
      };
    }
    return {
      kind: "written",
      path: null,
      backupPath: null,
      detail: `claude mcp add-json hat den Eintrag in der Ebene ${plan.scope} angelegt.`,
    };
  },

  remove(plan, host): WriteOutcome {
    if (host.which("claude") === null) {
      return {
        kind: "manual",
        reason: `claude ist nicht im Suchpfad. Von Hand: claude mcp remove ${plan.serverName} ${SCOPE_FLAG} ${plan.scope}`,
      };
    }
    const result = host.run("claude", ["mcp", "remove", plan.serverName, SCOPE_FLAG, plan.scope]);
    if (result.failure !== null) {
      return { kind: "failed", reason: `claude ließ sich nicht starten: ${result.failure}` };
    }
    if (result.status !== 0) {
      return {
        kind: "unchanged",
        reason:
          `claude mcp remove endete mit Rückgabewert ${String(result.status)}; ` +
          `vermutlich gab es keinen Eintrag. Ausgabe: ${(result.stderr || result.stdout).trim()}`,
      };
    }
    return { kind: "removed", path: null, backupPath: null };
  },
};
