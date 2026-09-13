/**
 * Grok Build (xAI): `grok mcp add` als Unterprozess (Plan 8.3).
 *
 * Geprüft am 2026-09-12 an `grok mcp add --help`: `grok mcp add [OPTIONS] <NAME>
 * [COMMAND_OR_URL] [ARGS]...`, mit `-s, --scope <user|project>` und `-e, --env KEY=value`.
 * Argumente des Servers gehören hinter `--`, damit `-y` an npx geht und nicht an grok.
 *
 * **Dieser Weg schreibt keine Zugangsdaten in den Eintrag** (`distribution.md` 13.1). Grok
 * ersetzt dafür `${VAR}` in `command`, `args`, `env`, `url` und `headers`.
 *
 * Nicht verwechseln: Die Chatoberfläche auf grok.com ist etwas anderes; dort ist die
 * Einbindung eigener lokaler Server nicht belegt (`distribution.md` 7.1).
 */

import path from "node:path";

import {
  entryEnv,
  type ClientAdapter,
  type ClientHost,
  type ClientPlan,
  type WriteOutcome,
} from "./types.js";

export function grokConfigPath(host: ClientHost, scope: "user" | "project"): string {
  return scope === "project"
    ? path.join(host.cwd, ".grok", "config.toml")
    : path.join(host.homeDir, ".grok", "config.toml");
}

/** Grok ersetzt `${VAR}` in der Konfiguration. */
function reference(name: string): string {
  return `\${${name}}`;
}

function renderTomlBlock(plan: ClientPlan, env: Readonly<Record<string, string>>): string {
  const lines = [
    `[mcp_servers.${plan.serverName}]`,
    `command = ${JSON.stringify(plan.launch.command)}`,
    `args = [${plan.launch.args.map((value) => JSON.stringify(value)).join(", ")}]`,
  ];
  const names = Object.keys(env);
  if (names.length > 0) {
    const pairs = names.map((name) => `${name} = ${JSON.stringify(env[name] ?? "")}`).join(", ");
    lines.push(`env = { ${pairs} }`);
  }
  lines.push("enabled = true");
  return `${lines.join("\n")}\n`;
}

function addArgs(plan: ClientPlan, env: Readonly<Record<string, string>>): string[] {
  const args = ["mcp", "add", "--scope", plan.scope];
  for (const [name, value] of Object.entries(env)) {
    args.push("--env", `${name}=${value}`);
  }
  args.push(plan.serverName, "--", plan.launch.command, ...plan.launch.args);
  return args;
}

export const grokAdapter: ClientAdapter = {
  key: "grok",
  label: "Grok Build (xAI)",
  way: "grok mcp add",
  automatic: true,
  scopes: ["user", "project"],
  inlineSecrets: false,
  envReference: reference,
  finishNote: "Grok braucht keinen Neustart; der Eintrag gilt ab der nächsten Sitzung.",
  verifyCommand: "grok mcp doctor buchhaltungsbutler",

  detect(host) {
    const binary = host.which("grok");
    const configPath = grokConfigPath(host, "user");
    if (binary !== null) {
      return { found: true, how: `grok gefunden: ${binary}`, path: configPath };
    }
    if (host.exists(configPath)) {
      return { found: true, how: `Konfigurationsdatei gefunden: ${configPath}`, path: configPath };
    }
    return { found: false, how: "grok nicht im Suchpfad", path: configPath };
  },

  preview(plan, host) {
    const { env, notes } = entryEnv(plan, { envReference: reference, inlineSecrets: false });
    const configPath = grokConfigPath(host, plan.scope);
    return {
      path: configPath,
      pathNote: `Wird mit "grok ${addArgs(plan, env).join(" ")}" in ${configPath} eingetragen.`,
      format: "toml",
      block: renderTomlBlock(plan, env),
      notes: [...notes, `Aufruf: grok ${addArgs(plan, env).join(" ")}`],
    };
  },

  apply(plan, host): WriteOutcome {
    if (host.which("grok") === null) {
      return {
        kind: "manual",
        reason:
          "grok ist nicht im Suchpfad. Grok Build installieren oder den Block von Hand eintragen.",
      };
    }
    const { env } = entryEnv(plan, { envReference: reference, inlineSecrets: false });
    const result = host.run("grok", addArgs(plan, env));
    if (result.failure !== null) {
      return { kind: "failed", reason: `grok ließ sich nicht starten: ${result.failure}` };
    }
    if (result.status !== 0) {
      return {
        kind: "failed",
        reason:
          `grok mcp add endete mit Rückgabewert ${String(result.status)}. ` +
          `Ausgabe: ${(result.stderr || result.stdout).trim()}`,
      };
    }
    return {
      kind: "written",
      path: grokConfigPath(host, plan.scope),
      backupPath: null,
      detail: `grok mcp add hat den Eintrag in der Ebene ${plan.scope} angelegt.`,
    };
  },

  remove(plan, host): WriteOutcome {
    if (host.which("grok") === null) {
      return {
        kind: "manual",
        reason: `grok ist nicht im Suchpfad. Von Hand: grok mcp remove ${plan.serverName}`,
      };
    }
    const result = host.run("grok", ["mcp", "remove", plan.serverName]);
    if (result.failure !== null) {
      return { kind: "failed", reason: `grok ließ sich nicht starten: ${result.failure}` };
    }
    if (result.status !== 0) {
      return {
        kind: "unchanged",
        reason:
          `grok mcp remove endete mit Rückgabewert ${String(result.status)}; ` +
          `vermutlich gab es keinen Eintrag. Ausgabe: ${(result.stderr || result.stdout).trim()}`,
      };
    }
    return { kind: "removed", path: grokConfigPath(host, plan.scope), backupPath: null };
  },
};
