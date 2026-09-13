/**
 * Codex CLI und ChatGPT-Desktop-App: `codex mcp add` als Unterprozess, danach
 * `startup_timeout_sec = 30`.
 *
 * Die drei Clients Codex CLI, ChatGPT-Desktop-App und die IDE-Erweiterung teilen dieselbe
 * `~/.codex/config.toml`; ein Eintrag genügt für alle drei (`distribution.md` 5.2).
 *
 * **Warum die TOML-Datei anschließend doch angefasst wird.** `codex mcp add` kennt kein Flag
 * für `startup_timeout_sec`; `-c key=value` überschreibt laut Hilfeausgabe nur **diesen**
 * Aufruf und landet nicht in der Datei (geprüft am 2026-09-12 an `codex mcp add --help`).
 * Die Vorgabe von 10 Sekunden ist für einen npx-Kaltstart knapp, also wird genau **eine**
 * Zeile in die bereits angelegte Tabelle eingefügt — der Rest der Datei, Kommentare
 * eingeschlossen, bleibt unberührt. Vorher entsteht eine Sicherung.
 *
 * **Dieser Weg schreibt keine Zugangsdaten in den Eintrag**, weil `--env KEY=VALUE` sie in
 * die Prozessliste schriebe (`distribution.md` 13.1). Codex hat für den sauberen Weg
 * `env_vars`, das nur Namen nennt; die Zugangsdaten gehören aber in die Zugangsdatendatei.
 */

import path from "node:path";

import {
  entryEnv,
  LEGACY_ENTRY_NOTE,
  LEGACY_SERVER_NAMES,
  SERVER_NAME,
  type ClientAdapter,
  type ClientHost,
  type ClientPlan,
  type WriteOutcome,
} from "./types.js";

/** Zeitlimit für den Serverstart in Sekunden. */
export const STARTUP_TIMEOUT_SEC = 30;

/** Der Ort der Konfiguration. `CODEX_HOME` verlegt ihn; die Semantik ist nicht verifiziert. */
export function codexConfigPath(host: ClientHost): string {
  const codexHome = host.env.CODEX_HOME;
  if (codexHome !== undefined && codexHome.trim() !== "") {
    return path.join(codexHome, "config.toml");
  }
  return path.join(host.homeDir, ".codex", "config.toml");
}

function entryOf(plan: ClientPlan): {
  readonly env: Record<string, string>;
  readonly notes: readonly string[];
} {
  return entryEnv(plan, { envReference: () => null, inlineSecrets: false });
}

/**
 * Fügt `startup_timeout_sec` in die Tabelle des Servers ein, falls sie noch keinen solchen
 * Schlüssel führt.
 *
 * Die Funktion ist absichtlich stumpf: Sie sucht die Kopfzeile der Tabelle, liest bis zur
 * nächsten Kopfzeile und setzt die Zeile direkt hinter den Kopf. Ein TOML-Parser wäre eine
 * weitere Abhängigkeit, und ein Neuschreiben der Datei verlöre die Kommentare.
 *
 * @returns Den geänderten Text, oder `null`, wenn nichts zu tun war.
 */
export function withStartupTimeout(
  text: string,
  serverName: string,
  seconds: number = STARTUP_TIMEOUT_SEC,
): string | null {
  const lines = text.split("\n");
  const header = `[mcp_servers.${serverName}]`;
  const headerIndex = lines.findIndex((line) => line.trim() === header);
  if (headerIndex === -1) {
    return null;
  }
  let end = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  for (let i = headerIndex + 1; i < end; i++) {
    if (/^\s*startup_timeout_sec\s*=/.test(lines[i] ?? "")) {
      return null;
    }
  }
  const next = [...lines];
  next.splice(headerIndex + 1, 0, `startup_timeout_sec = ${String(seconds)}`);
  return next.join("\n");
}

function renderTomlBlock(plan: ClientPlan, env: Readonly<Record<string, string>>): string {
  const lines = [
    `[mcp_servers.${plan.serverName}]`,
    `command = ${JSON.stringify(plan.launch.command)}`,
    `args = [${plan.launch.args.map((value) => JSON.stringify(value)).join(", ")}]`,
    `startup_timeout_sec = ${String(STARTUP_TIMEOUT_SEC)}`,
  ];
  const names = Object.keys(env);
  if (names.length > 0) {
    lines.push("", `[mcp_servers.${plan.serverName}.env]`);
    for (const name of names) {
      lines.push(`${name} = ${JSON.stringify(env[name] ?? "")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export const codexAdapter: ClientAdapter = {
  key: "codex",
  label: "Codex CLI und ChatGPT-Desktop-App",
  way: "codex mcp add, danach startup_timeout_sec = 30",
  automatic: true,
  scopes: ["user"],
  inlineSecrets: false,
  envReference: () => null,
  finishNote:
    "Codex braucht keinen Neustart. Die ChatGPT-Desktop-App und die IDE-Erweiterung lesen " +
    "dieselbe Datei und übernehmen den Eintrag mit.",
  verifyCommand: `codex mcp get ${SERVER_NAME}`,

  detect(host) {
    const binary = host.which("codex");
    const configPath = codexConfigPath(host);
    if (binary !== null) {
      return { found: true, how: `codex gefunden: ${binary}`, path: configPath };
    }
    if (host.exists(configPath)) {
      return { found: true, how: `Konfigurationsdatei gefunden: ${configPath}`, path: configPath };
    }
    return { found: false, how: "codex nicht im Suchpfad", path: configPath };
  },

  preview(plan, host) {
    const { env, notes } = entryOf(plan);
    const args = ["mcp", "add", plan.serverName, "--", plan.launch.command, ...plan.launch.args];
    return {
      path: codexConfigPath(host),
      pathNote:
        `Wird mit "codex ${args.join(" ")}" eingetragen; danach wird genau die Zeile ` +
        `startup_timeout_sec = ${String(STARTUP_TIMEOUT_SEC)} in ${codexConfigPath(host)} ergänzt.`,
      format: "toml",
      block: renderTomlBlock(plan, env),
      notes: [
        ...notes,
        `Aufruf: codex ${args.join(" ")}`,
        'Empfehlung für Codex: default_tools_approval_mode = "writes" fragt genau bei den ' +
          "39 schreibenden Werkzeugen nach.",
        LEGACY_ENTRY_NOTE,
      ],
    };
  },

  apply(plan, host): WriteOutcome {
    if (host.which("codex") === null) {
      return {
        kind: "manual",
        reason:
          "codex ist nicht im Suchpfad. Codex CLI installieren oder den Block von Hand eintragen.",
      };
    }
    const result = host.run("codex", [
      "mcp",
      "add",
      plan.serverName,
      "--",
      plan.launch.command,
      ...plan.launch.args,
    ]);
    if (result.failure !== null) {
      return { kind: "failed", reason: `codex ließ sich nicht starten: ${result.failure}` };
    }
    if (result.status !== 0) {
      return {
        kind: "failed",
        reason:
          `codex mcp add endete mit Rückgabewert ${String(result.status)}. ` +
          `Ausgabe: ${(result.stderr || result.stdout).trim()}`,
      };
    }

    const configPath = codexConfigPath(host);
    const text = host.readText(configPath);
    if (text === null) {
      return {
        kind: "written",
        path: configPath,
        backupPath: null,
        detail:
          `Der Eintrag wurde angelegt. ${configPath} war danach nicht lesbar; ` +
          `startup_timeout_sec = ${String(STARTUP_TIMEOUT_SEC)} muss von Hand ergänzt werden.`,
      };
    }
    const patched = withStartupTimeout(text, plan.serverName);
    if (patched === null) {
      return {
        kind: "written",
        path: configPath,
        backupPath: null,
        detail: `Der Eintrag wurde angelegt; startup_timeout_sec war bereits gesetzt.`,
      };
    }
    let backupPath: string | null = null;
    try {
      backupPath = host.writeText(configPath, patched).backupPath;
    } catch (error) {
      return {
        kind: "written",
        path: configPath,
        backupPath: null,
        detail:
          `Der Eintrag wurde angelegt, aber ${configPath} ließ sich nicht ergänzen ` +
          `(${(error as Error).message}). startup_timeout_sec = ${String(STARTUP_TIMEOUT_SEC)} ` +
          "muss von Hand nachgetragen werden.",
      };
    }
    return {
      kind: "written",
      path: configPath,
      backupPath,
      detail: `Der Eintrag wurde angelegt und um startup_timeout_sec = ${String(STARTUP_TIMEOUT_SEC)} ergänzt.`,
    };
  },

  remove(plan, host): WriteOutcome {
    // Entfernt wird der eigene Name UND jeder frühere: Eine ältere config.toml führt die
    // Tabelle noch unter dem langen Namen, und `codex mcp remove` kennt nur den, den es hört.
    const names = [
      plan.serverName,
      ...LEGACY_SERVER_NAMES.filter((name) => name !== plan.serverName),
    ];
    if (host.which("codex") === null) {
      const byHand = names.map((name) => `codex mcp remove ${name}`).join(" und ");
      return { kind: "manual", reason: `codex ist nicht im Suchpfad. Von Hand: ${byHand}` };
    }
    const attempts = names.map((name) => host.run("codex", ["mcp", "remove", name]));
    const failure = attempts.find((attempt) => attempt.failure !== null);
    if (failure !== undefined) {
      return { kind: "failed", reason: `codex ließ sich nicht starten: ${failure.failure ?? ""}` };
    }
    if (!attempts.some((attempt) => attempt.status === 0)) {
      const last = attempts[attempts.length - 1];
      return {
        kind: "unchanged",
        reason:
          `codex mcp remove endete für ${names.join(" und ")} mit Rückgabewert ` +
          `${String(last?.status ?? null)}; vermutlich gab es keinen Eintrag. ` +
          `Ausgabe: ${((last?.stderr ?? "") || (last?.stdout ?? "")).trim()}`,
      };
    }
    return { kind: "removed", path: codexConfigPath(host), backupPath: null };
  },
};
