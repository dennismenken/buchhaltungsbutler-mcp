/**
 * Die Unterbefehlsweiche, die Hilfe und die Liste der zehn Clientadapter.
 *
 * `src/cli.ts` lädt dieses Modul **dynamisch**, und zwar nur dann, wenn ein Unterbefehl
 * angegeben ist. Ein Serverstart lädt deshalb keine Zeile CLI-Code.
 *
 * Umgekehrt gilt dasselbe: Hier wird nichts aus `src/server/*` geladen. Die einzige
 * gemeinsame Grundlage sind Konfiguration, HTTP-Schicht und Register.
 *
 * **Warum die Adapterliste hier steht und nicht in `clients/types.ts`.** Jeder Adapter lädt
 * `types.ts`; eine Liste dort ergäbe einen Ringschluss. Diese Datei lädt die zehn Adapter
 * statisch, und die vier Unterbefehle, die sie brauchen, holen sie sich von hier.
 */

import { registerSecrets } from "../config/redact.js";
import { CREDENTIAL_VARS, ConfigError } from "../config/env.js";
import { resolveConfig, type ConfigWarning, type ResolvedConfig } from "../config/resolve.js";
import { VERSION } from "../generated/version.js";
import { setLogLevel } from "../logging/stderr.js";
import { claudeCodeAdapter } from "./clients/claude-code.js";
import { claudeDesktopAdapter } from "./clients/claude-desktop.js";
import { clineAdapter } from "./clients/cline.js";
import { codexAdapter } from "./clients/codex.js";
import { cursorAdapter } from "./clients/cursor.js";
import { grokAdapter } from "./clients/grok.js";
import { lmStudioAdapter } from "./clients/lmstudio.js";
import { continueAdapter, janAdapter, zedAdapter } from "./clients/print-only.js";
import {
  BINARY_NAME,
  CLIENT_KEYS,
  createClientHost,
  isClientKey,
  type ClientAdapter,
  type ClientHost,
  type ClientKey,
  type ConfigScope,
  type StartVariant,
} from "./clients/types.js";
import { vscodeAdapter } from "./clients/vscode.js";
import { windsurfAdapter } from "./clients/windsurf.js";
import {
  createTerminal,
  PromptAbortedError,
  PromptUnavailableError,
  type Terminal,
} from "./prompt.js";

/**
 * Die **zehn** Adapter, auf die sich die zwölf Clientkürzel verteilen: neun eigene und die
 * Sammeldatei `print-only.ts`, aus der Zed, Continue und Jan stammen.
 */
export const ALL_ADAPTERS: readonly ClientAdapter[] = [
  claudeCodeAdapter,
  claudeDesktopAdapter,
  codexAdapter,
  grokAdapter,
  vscodeAdapter,
  cursorAdapter,
  windsurfAdapter,
  lmStudioAdapter,
  clineAdapter,
  zedAdapter,
  continueAdapter,
  janAdapter,
];

const ADAPTER_BY_KEY = new Map<ClientKey, ClientAdapter>(
  ALL_ADAPTERS.map((adapter) => [adapter.key, adapter]),
);

/** Der Adapter zu einem Kürzel. `null`, wenn es das Kürzel nicht gibt. */
export function findAdapter(key: string): ClientAdapter | null {
  return isClientKey(key) ? (ADAPTER_BY_KEY.get(key) ?? null) : null;
}

// --- Kommandozeile ---------------------------------------------------------------------

/** Eine Kommandozeile, die so nicht stimmt. Sie endet mit Rückgabewert 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

/**
 * Namen, die nach einem Geheimnis aussehen.
 *
 * **Kein Unterbefehl nimmt ein Geheimnis als Argument entgegen**. Diese Liste
 * sorgt dafür, dass der Versuch eine deutliche Absage bekommt statt eines unverstandenen
 * Arguments — und dass die Entscheidung im Code sichtbar bleibt.
 */
const SECRET_LIKE = /^(api[-_]?(key|client|secret)|secret|password|passwort|token|credential)/i;

export interface ParseOptions {
  /** Schalter ohne Wert. */
  readonly booleans?: readonly string[];
  /** Schalter mit Wert. */
  readonly strings?: readonly string[];
}

/**
 * Zerlegt `--name wert`, `--name=wert` und `--schalter`.
 *
 * Unbekannte Schalter sind ein Fehler und kein stiller Hinweis: Ein vertippter Schalter, der
 * wirkungslos durchrutscht, ist genau der Fall, in dem jemand glaubt, `--print-only` gesetzt
 * zu haben, und trotzdem eine Datei ändert.
 */
export function parseArgs(args: readonly string[], options: ParseOptions = {}): ParsedArgs {
  const booleans = new Set(options.booleans ?? []);
  const strings = new Set(options.strings ?? []);
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < args.length; index++) {
    const argument = args[index] ?? "";
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const body = argument.slice(2);
    const equals = body.indexOf("=");
    const name = equals === -1 ? body : body.slice(0, equals);
    const inlineValue = equals === -1 ? null : body.slice(equals + 1);

    if (SECRET_LIKE.test(name)) {
      throw new UsageError(
        `--${name} gibt es nicht, und zwar mit Absicht: Zugangsdaten nimmt kein Unterbefehl als ` +
          "Argument entgegen. Argumente eines Prozesses sind für andere Prozesse desselben " +
          "Benutzers lesbar und landen in Shell-Historien und Protokollen. Die drei Werte " +
          `kommen aus ${CREDENTIAL_VARS.join(", ")} oder aus der Zugangsdatendatei.`,
      );
    }
    if (booleans.has(name)) {
      if (inlineValue !== null && inlineValue !== "true" && inlineValue !== "false") {
        throw new UsageError(`--${name} ist ein Schalter und nimmt keinen Wert.`);
      }
      flags.set(name, inlineValue === "false" ? "false" : true);
      continue;
    }
    if (strings.has(name)) {
      if (inlineValue !== null) {
        flags.set(name, inlineValue);
        continue;
      }
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new UsageError(`--${name} braucht einen Wert.`);
      }
      flags.set(name, next);
      index += 1;
      continue;
    }
    throw new UsageError(`Unbekannte Option --${name}.`);
  }

  return { positionals, flags };
}

/** Der Wert eines Schalters mit Wert, oder `null`. */
export function stringFlag(args: ParsedArgs, name: string): string | null {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : null;
}

/** `true`, wenn der Schalter gesetzt ist und nicht ausdrücklich auf `false` steht. */
export function boolFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

/** Eine Ebene aus einem Schalter. Wirft bei einem unbekannten Wert. */
export function scopeFlag(args: ParsedArgs, fallback: ConfigScope = "user"): ConfigScope {
  const raw = stringFlag(args, "scope");
  if (raw === null) {
    return fallback;
  }
  if (raw === "user" || raw === "project") {
    return raw;
  }
  throw new UsageError(`--scope kennt nur "user" und "project", nicht "${raw}".`);
}

/** Die Startvariante aus einem Schalter. */
export function startFlag(args: ParsedArgs, fallback: StartVariant = "npx"): StartVariant {
  const raw = stringFlag(args, "start");
  if (raw === null) {
    return fallback;
  }
  if (raw === "npx" || raw === "global") {
    return raw;
  }
  throw new UsageError(`--start kennt nur "npx" und "global", nicht "${raw}".`);
}

/** Den Adapter aus `--client <kürzel>` holen, mit vollständiger Fehlermeldung. */
export function requireAdapter(args: ParsedArgs): ClientAdapter {
  const raw = stringFlag(args, "client") ?? args.positionals[0] ?? null;
  if (raw === null) {
    throw new UsageError(`Es fehlt --client <name>. Bekannte Kürzel: ${CLIENT_KEYS.join(", ")}.`);
  }
  const adapter = findAdapter(raw);
  if (adapter === null) {
    throw new UsageError(
      `"${raw}" ist kein bekanntes Clientkürzel. Bekannt sind: ${CLIENT_KEYS.join(", ")}.`,
    );
  }
  return adapter;
}

// --- Hilfe -----------------------------------------------------------------------------

/** Die Hilfe: Unterbefehle und die zwölf Clientkürzel. */
export function buildHelp(): string {
  const clients = CLIENT_KEYS.join(", ");
  return [
    `${BINARY_NAME} ${VERSION} — inoffizieller MCP-Server für die BuchhaltungsButler-API`,
    "",
    "Aufruf:",
    `  ${BINARY_NAME}                              startet den MCP-Server auf stdio`,
    `  ${BINARY_NAME} setup                        Einrichtungsassistent, neun Schritte`,
    `  ${BINARY_NAME} doctor                       Diagnose: Zugangsdaten, Verbindung, Rechte,`,
    "                                           gefundene Clientkonfigurationen",
    `  ${BINARY_NAME} test                         nur der Verbindungstest, Rückgabewert 0 oder 1`,
    `  ${BINARY_NAME} profiles list|add|remove     Mandantenprofile in der Zugangsdatendatei`,
    `  ${BINARY_NAME} print-config --client <name> den fertigen Konfigurationsblock ausgeben`,
    `  ${BINARY_NAME} uninstall --client <name>    den eigenen Eintrag beim genannten Client entfernen`,
    `  ${BINARY_NAME} --version                    Version ausgeben`,
    `  ${BINARY_NAME} --help                       diese Hilfe`,
    "",
    "Clientkürzel für --client:",
    `  ${clients}`,
    "",
    "Häufige Optionen:",
    "  --scope user|project      Ebene der Clientkonfiguration, Vorgabe user",
    "  --start npx|global        wie der Client den Server startet, Vorgabe npx",
    "  --profile <name>          Profil in der Zugangsdatendatei, Vorgabe default",
    "  --non-interactive         keine Rückfragen; Zugangsdaten nur aus der Umgebung",
    "  --print-only              nichts schreiben, nur ausgeben",
    "  --read-only               BB_MCP_READ_ONLY=true in die erzeugte Konfiguration schreiben",
    "  --overwrite               einen bestehenden Eintrag ersetzen",
    "  --yes                     Rückfragen mit ja beantworten",
    "  --skip-connection-test    nur bei doctor: keinen Aufruf an die API absetzen",
    "",
    "Zugangsdaten nimmt kein Unterbefehl als Argument entgegen. Sie stehen in den",
    `Umgebungsvariablen ${CREDENTIAL_VARS.join(", ")} oder in der Zugangsdatendatei.`,
    `Ohne Unterbefehl startet ${BINARY_NAME} den MCP-Server auf stdio; genau so steht er in`,
    "jeder Clientkonfiguration, ohne ein Argument hinter dem Paketnamen.",
    "",
  ].join("\n");
}

// --- Konfiguration für die Unterbefehle -------------------------------------------------

export interface CliConfig {
  readonly config: ResolvedConfig;
  readonly warnings: readonly ConfigWarning[];
}

/**
 * Löst die Konfiguration für einen Unterbefehl auf.
 *
 * Anders als `initConfig` wird hier **nichts ausgegeben**: Die Unterbefehle schreiben selbst,
 * und `doctor` braucht die Warnungen als Daten und nicht als bereits gedruckte Zeilen. Die
 * Schwärzung wird trotzdem angemeldet, bevor irgendein Text entsteht.
 */
export function loadCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  registerSecrets(CREDENTIAL_VARS.map((name) => env[name]));
  const { config, warnings } = resolveConfig({ env });
  if (config.credentials !== null) {
    const { apiClient, apiSecret, apiKey } = config.credentials;
    registerSecrets([apiClient, apiSecret, apiKey, `${apiClient}:${apiSecret}`]);
  }
  setLogLevel(config.logLevel);
  return { config, warnings };
}

// --- Die Weiche ------------------------------------------------------------------------

export interface RunCliOptions {
  readonly terminal?: Terminal;
  readonly host?: ClientHost;
  readonly env?: NodeJS.ProcessEnv;
}

const SUBCOMMANDS = new Set(["setup", "doctor", "test", "profiles", "print-config", "uninstall"]);

/** `true`, wenn das erste Argument ein Unterbefehl ist. */
export function isSubcommand(value: string): boolean {
  return SUBCOMMANDS.has(value);
}

/**
 * Führt einen Unterbefehl aus und liefert den Rückgabewert des Prozesses.
 *
 * Die Unterbefehle werden einzeln und **dynamisch** geladen: `doctor` zieht keinen
 * Einrichtungsassistenten nach sich, und kein Unterbefehl lädt den Server.
 */
export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const terminal =
    options.terminal ?? createTerminal({ nonInteractive: argv.includes("--non-interactive") });
  const host = options.host ?? createClientHost({ env });
  const command = argv[0] ?? "";
  const rest = argv.slice(1);

  try {
    switch (command) {
      case "setup": {
        const { runSetup } = await import("./setup.js");
        return await runSetup({ argv: rest, terminal, host, env });
      }
      case "doctor": {
        const { runDoctor } = await import("./doctor.js");
        return await runDoctor({ argv: rest, terminal, host, env });
      }
      case "test": {
        const { runTestCommand } = await import("./test.js");
        // `test` kennt keine Optionen; ein Argument hier wäre ein Missverständnis.
        parseArgs(rest);
        return await runTestCommand({ config: loadCliConfig(env).config, terminal });
      }
      case "profiles": {
        const { runProfiles } = await import("./profiles.js");
        return await runProfiles({ argv: rest, terminal, env });
      }
      case "print-config": {
        const { runPrintConfig } = await import("./print-config.js");
        return await runPrintConfig({ argv: rest, terminal, host, env });
      }
      case "uninstall": {
        const { runUninstall } = await import("./uninstall.js");
        return await runUninstall({ argv: rest, terminal, host, env });
      }
      case "help":
      case "--help":
      case "-h":
        terminal.writeRaw(buildHelp());
        return 0;
      case "--version":
      case "-v":
        terminal.write(VERSION);
        return 0;
      default:
        terminal.writeError(
          `Unbekannter Unterbefehl "${command}". "${BINARY_NAME} --help" zeigt die Übersicht.`,
        );
        return 2;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      terminal.writeError(error.message);
      terminal.writeError(`"${BINARY_NAME} --help" zeigt die Übersicht.`);
      return 2;
    }
    if (error instanceof PromptAbortedError) {
      terminal.writeError("Abgebrochen. Es wurde nichts geschrieben.");
      return 130;
    }
    if (error instanceof PromptUnavailableError) {
      terminal.writeError(error.message);
      return 2;
    }
    if (error instanceof ConfigError) {
      terminal.writeError(error.message);
      return 1;
    }
    throw error;
  } finally {
    terminal.close();
  }
}
