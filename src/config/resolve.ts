/**
 * Auflösungsreihenfolge (6.3), Startprüfung (6.4) und das eingefrorene Konfigurationsobjekt.
 *
 * Dieses Modul ist die einzige Quelle der Konfiguration. HTTP-Schicht, Guards, Server,
 * Upload, Stammdatenspeicher und CLI lesen ausschließlich {@link ResolvedConfig}; nach dem
 * Start ändert das Objekt niemand mehr, weil es eingefroren ist (6.4 Punkt 7).
 *
 * Zwei Fälle werden bewusst verschieden behandelt:
 *
 * - **Fehlende Zugangsdaten** sind ein Zustand, den der Nutzer erwartet und beheben kann.
 *   Der Server startet trotzdem und erklärt sich bei jedem Werkzeugaufruf (6.5).
 * - **Ein unbrauchbarer Wert** ist ein Irrtum, der unbemerkt eine Schutzschicht abschaltet.
 *   Er führt zum Abbruch (6.4 Punkt 3).
 */

import os from "node:os";

import {
  logWarn,
  setLogLevel,
  writeStderrBlock,
  writeStderrBlockSync,
  type LogLevel,
} from "../logging/stderr.js";
import {
  ConfigError,
  CREDENTIAL_VARS,
  DEPRECATED_READ_ONLY_VAR,
  ENV_DEFAULTS,
  defaultConfigDir,
  findUnknownBbVars,
  nearestKnownVar,
  parseEnv,
  type CredentialVarName,
} from "./env.js";
import {
  checkCredentialsPermissions,
  credentialsFilePath,
  readProfile,
  type CredentialsFileWarning,
} from "./credentials-file.js";
import { registerSecrets } from "./redact.js";
import { resolveToolGroups, type ToolGroupSelection } from "./tool-groups.js";

export { ConfigError } from "./env.js";
export type { CredentialVarName } from "./env.js";
export type { ToolGroupSelection } from "./tool-groups.js";

/**
 * Kleinste unterstützte Node-Fassung. Sie spiegelt `engines.node` der `package.json`
 * (Plan 13.1). Beide Stellen müssen zusammen geändert werden; eine maschinelle Ableitung
 * gäbe es erst, wenn `scripts/gen-version.ts` die Range mit erzeugt.
 */
export const MINIMUM_NODE_VERSION = "22.19.0";

/** Der Aufruf, der den Einrichtungsassistenten startet. Er steht wörtlich in 6.5. */
export const SETUP_COMMAND = "npx -y @dennismenken/buchhaltungsbutler-mcp setup";

export interface ConfigWarning {
  readonly code: string;
  readonly text: string;
}

export interface ResolvedCredentials {
  readonly apiClient: string;
  readonly apiSecret: string;
  readonly apiKey: string;
  /** Woher die drei Werte stammen. Gemischt wird nie (6.3 Punkt 3). */
  readonly source: "env" | "file";
  /** Profilname, wenn die Werte aus der Zugangsdatendatei stammen. */
  readonly profile: string | null;
  /** Anzeigename des Mandanten aus der Zugangsdatendatei, falls hinterlegt. Kein Geheimnis. */
  readonly label: string | null;
}

export interface ResolvedConfig {
  /** `true`, wenn alle drei Zugangsdaten aus **einer** Quelle vorliegen. */
  readonly configured: boolean;
  readonly credentials: ResolvedCredentials | null;
  /** Die Zugangsdaten, die weder in der Umgebung noch im Profil stehen. */
  readonly missingCredentials: readonly CredentialVarName[];
  /** Die Zugangsdaten, die irgendeine der beiden Quellen führt. */
  readonly presentCredentials: readonly CredentialVarName[];
  /**
   * `true`, wenn die drei Werte zusammen vorhanden sind, aber auf beide Quellen verteilt.
   * Sie werden trotzdem nicht gemischt (6.3 Punkt 3); der Zustand heißt „nicht konfiguriert".
   */
  readonly credentialsSplitAcrossSources: boolean;

  readonly baseUrl: string;
  readonly profile: string;
  readonly configDir: string;
  readonly credentialsFile: string;

  readonly readOnly: boolean;
  /**
   * Die aktiven Werkzeuggruppen (N5). Sie entscheiden über die **Registrierung**; der
   * Nur-Lesen-Schalter daneben über die **Ausführung**. Beide sind vollständig orthogonal.
   */
  readonly toolGroups: ToolGroupSelection;
  readonly maxBatch: number;
  /** Betragsgrenze als Dezimalzeichenkette, `null` wenn aus. */
  readonly maxAmount: string | null;
  /** Dieselbe Grenze in Ganzzahl-Cent, `null` wenn aus. Beträge werden nie in Gleitkomma gerechnet. */
  readonly maxAmountCents: number | null;
  readonly rateLimitPerMinute: number;
  readonly timeoutMs: number;
  readonly duplicateCheck: "on" | "off";
  readonly maxResponseTokens: number;
  readonly cacheTtlMs: number;
  readonly uploadDirs: readonly string[];
  readonly uploadFromUrl: boolean;
  readonly logLevel: LogLevel;
}

export interface ResolveOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly nodeVersion?: string;
}

export interface ResolveOutcome {
  readonly config: ResolvedConfig;
  readonly warnings: readonly ConfigWarning[];
}

// --- Node-Version --------------------------------------------------------------------

function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/, "")
      .split("-")[0]
      ?.split(".")
      .map((part) => Number.parseInt(part, 10) || 0) ?? [];
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

function checkNodeVersion(found: string): void {
  if (compareVersions(found, MINIMUM_NODE_VERSION) >= 0) {
    return;
  }
  throw new ConfigError(
    "node-version",
    [
      `Abbruch: Dieser Server verlangt Node ${MINIMUM_NODE_VERSION} oder neuer, gefunden wurde ${found.replace(/^v/, "")}.`,
      "Aktualisierung: Node über den Paketmanager des Systems, über nvm oder von https://nodejs.org",
      `auf eine unterstützte Fassung heben (${MINIMUM_NODE_VERSION} oder neuer).`,
      "Der Server ist nicht gestartet. Es ging nichts an BuchhaltungsButler hinaus.",
    ].join("\n"),
  );
}

// --- Texte aus 6.5 -------------------------------------------------------------------

/** Aufzählung „A", „A und B", „A, B und C" ohne Oxford-Komma. */
function enumerate(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} und ${names[names.length - 1] ?? ""}`;
}

function credentialStateSentence(config: ResolvedConfig): string {
  if (config.missingCredentials.length === 0) {
    return "Die drei Werte liegen verteilt auf Umgebungsvariablen und Zugangsdatendatei; sie werden nicht gemischt.";
  }
  const missing = `Es fehlen: ${config.missingCredentials.join(", ")}.`;
  if (config.presentCredentials.length === 0) {
    return missing;
  }
  const verb = config.presentCredentials.length === 1 ? "ist" : "sind";
  return `${missing} ${enumerate(config.presentCredentials)} ${verb} gesetzt.`;
}

/**
 * Der Vorspann der `instructions` im Zustand „nicht konfiguriert", wörtlich nach 6.5 Punkt 3.
 * `server/instructions.ts` (AP14) stellt ihn seinem Text voran.
 */
export const NOT_CONFIGURED_INSTRUCTIONS_PREFIX =
  "NICHT KONFIGURIERT. Es wurden keine Zugangsdaten für BuchhaltungsButler gefunden. " +
  "Jeder Werkzeugaufruf scheitert, bis der Server mit Zugangsdaten neu gestartet wird. " +
  `Den Nutzer bitten, auszuführen: ${SETUP_COMMAND}`;

/**
 * Die Absage eines Werkzeugaufrufs im Zustand „nicht konfiguriert", wörtlich nach 6.5
 * Punkt 4. `guards/configured.ts` (AP10) gibt genau diesen Text zurück, damit er an einer
 * Stelle steht und nicht in 54 Werkzeugen neu formuliert wird.
 *
 * Der letzte Satz ist kein Beiwerk: Er hält einen hartnäckigen Agenten davon ab, alle 54
 * Werkzeuge durchzuprobieren.
 */
export function formatNotConfiguredToolError(toolName: string, config: ResolvedConfig): string {
  return [
    `${toolName} ist nicht ausführbar: Dieser Server hat keine Zugangsdaten für`,
    "BuchhaltungsButler.",
    credentialStateSentence(config),
    "Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.",
    `Den Nutzer bitten, "${SETUP_COMMAND}" auszuführen`,
    "oder BB_API_CLIENT, BB_API_SECRET und BB_API_KEY in der MCP-Serverkonfiguration",
    "seines Clients zu setzen und den Client danach neu zu starten. Die Zugangsdaten",
    "werden einmal beim Serverstart gelesen.",
    "Keine anderen Werkzeuge dieses Servers ausprobieren; sie scheitern alle auf",
    "dieselbe Weise.",
  ].join("\n");
}

/** Die mehrzeilige Startwarnung aus 6.5 Punkt 2. Kein stiller Start. */
export function formatMissingCredentialsStartupWarning(config: ResolvedConfig): string {
  return [
    "",
    "NICHT KONFIGURIERT: BuchhaltungsButler-MCP hat keine vollständigen Zugangsdaten gefunden.",
    credentialStateSentence(config),
    "Der Server startet trotzdem und meldet alle Werkzeuge an. Jeder Werkzeugaufruf scheitert,",
    "bis der Server mit Zugangsdaten neu gestartet wurde.",
    "",
    "Zwei Wege, die Werte zu setzen:",
    `  1. Einrichtungsassistent:  ${SETUP_COMMAND}`,
    `     Er legt ${config.credentialsFile} mit den Rechten 0600 an.`,
    "  2. Von Hand: BB_API_CLIENT, BB_API_SECRET und BB_API_KEY in der MCP-Serverkonfiguration",
    "     des Clients setzen und den Client danach neu starten.",
    "",
    "Die drei Werte stehen in BuchhaltungsButler unter Einstellungen, Schnittstellen und",
    "API-Zugang, nachdem die API dort aktiviert wurde. Die Zugangsdaten werden einmal beim",
    "Serverstart gelesen.",
    "",
  ].join("\n");
}

// --- Auflösung -----------------------------------------------------------------------

function toConfigWarnings(warnings: readonly CredentialsFileWarning[]): ConfigWarning[] {
  return warnings.map((warning) => ({ code: warning.code, text: warning.text }));
}

function amountToCents(amount: string): number {
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, "0") || "0", 10);
}

/**
 * Führt die Startprüfung aus 6.4 in genau dieser Reihenfolge aus und liefert das fertige,
 * eingefrorene Konfigurationsobjekt samt der Warnungen, die dabei angefallen sind.
 *
 * Die Funktion protokolliert nichts und beendet nichts; sie ist damit ohne Aufbau prüfbar.
 * Das Ausgeben übernimmt {@link initConfig}.
 *
 * @throws ConfigError bei zu alter Node-Fassung, unbrauchbarem Wert oder Widerspruch.
 */
export function resolveConfig(options: ResolveOptions = {}): ResolveOutcome {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const nodeVersion = options.nodeVersion ?? process.versions.node;

  // 6.4 Punkt 1
  checkNodeVersion(nodeVersion);

  // 6.4 Punkt 2: unbekannte BB_*-Variablen, jeweils mit dem nächstähnlichen bekannten Namen.
  const warnings: ConfigWarning[] = [];
  for (const name of findUnknownBbVars(env)) {
    warnings.push({
      code: "unknown-env-var",
      text: `Unbekannte Umgebungsvariable ${name}; sie wird nicht ausgewertet. Gemeint war vermutlich ${nearestKnownVar(name)}.`,
    });
  }

  // 6.4 Punkt 3
  const { values, emptyVars } = parseEnv(env);
  for (const name of emptyVars) {
    warnings.push({
      code: "empty-env-var",
      text: `${name} ist auf eine leere Zeichenkette gesetzt und wird wie nicht gesetzt behandelt.`,
    });
  }

  // 6.4 Punkt 4: Widerspruch zwischen kanonischem und veraltetem Namen (6.1).
  const canonicalReadOnly = values.BB_MCP_READ_ONLY;
  const deprecatedReadOnly = values.BB_READ_ONLY;
  if (
    canonicalReadOnly !== undefined &&
    deprecatedReadOnly !== undefined &&
    canonicalReadOnly !== deprecatedReadOnly
  ) {
    throw new ConfigError(
      "read-only-conflict",
      [
        `Abbruch: BB_MCP_READ_ONLY und ${DEPRECATED_READ_ONLY_VAR} widersprechen sich.`,
        `  BB_MCP_READ_ONLY=${env.BB_MCP_READ_ONLY ?? ""}`,
        `  ${DEPRECATED_READ_ONLY_VAR}=${env[DEPRECATED_READ_ONLY_VAR] ?? ""}`,
        `Kanonisch ist BB_MCP_READ_ONLY. Entweder ${DEPRECATED_READ_ONLY_VAR} entfernen oder beide auf denselben Wert setzen.`,
        "Der Server ist nicht gestartet. Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.",
      ].join("\n"),
    );
  }
  if (deprecatedReadOnly !== undefined) {
    warnings.push({
      code: "deprecated-env-var",
      text: `${DEPRECATED_READ_ONLY_VAR} ist veraltet; kanonisch ist BB_MCP_READ_ONLY. Der Wert wird weiter ausgewertet.`,
    });
  }
  const readOnly = canonicalReadOnly ?? deprecatedReadOnly ?? ENV_DEFAULTS.BB_MCP_READ_ONLY;

  // 6.4 Punkt 4b: der Gruppenschalter. Er steht hier, also vor dem Auflösen der Zugangsdaten:
  // Ein unbrauchbarer Gruppenname ist ein Abbruch, und ein Abbruch soll keine Zugangsdatendatei
  // gelesen haben. Die vier Startfehler stehen in `config/tool-groups.ts`.
  const toolGroups = resolveToolGroups({
    include: values.BB_MCP_TOOL_GROUPS,
    exclude: values.BB_MCP_TOOL_GROUPS_EXCLUDE,
  });

  // 6.4 Punkt 5: Zugangsdaten auflösen, ohne zu mischen (6.3).
  const configDir = values.BB_CONFIG_DIR ?? defaultConfigDir(env, platform, homeDir);
  const credentialsFile = credentialsFilePath(configDir);

  const fromEnv = {
    BB_API_CLIENT: values.BB_API_CLIENT ?? null,
    BB_API_SECRET: values.BB_API_SECRET ?? null,
    BB_API_KEY: values.BB_API_KEY ?? null,
  } satisfies Record<CredentialVarName, string | null>;
  const envComplete = CREDENTIAL_VARS.every((name) => fromEnv[name] !== null);

  let credentials: ResolvedCredentials | null = null;
  let fromFile: Record<CredentialVarName, string | null> = {
    BB_API_CLIENT: null,
    BB_API_SECRET: null,
    BB_API_KEY: null,
  };

  if (envComplete) {
    credentials = {
      apiClient: fromEnv.BB_API_CLIENT ?? "",
      apiSecret: fromEnv.BB_API_SECRET ?? "",
      apiKey: fromEnv.BB_API_KEY ?? "",
      source: "env",
      profile: null,
      label: null,
    };
    // 6.3 Punkt 1: Sind alle drei gesetzt, wird die Zugangsdatendatei nicht gelesen. Auch
    // ihre Rechte werden dann nicht geprüft, weil sie nichts zur Sache tut.
  } else {
    const result = readProfile(credentialsFile, values.BB_PROFILE, platform);
    warnings.push(...toConfigWarnings(result.warnings));
    if (result.profile !== null) {
      fromFile = {
        BB_API_CLIENT: result.profile.apiClient,
        BB_API_SECRET: result.profile.apiSecret,
        BB_API_KEY: result.profile.apiKey,
      };
      if (CREDENTIAL_VARS.every((name) => fromFile[name] !== null)) {
        credentials = {
          apiClient: fromFile.BB_API_CLIENT ?? "",
          apiSecret: fromFile.BB_API_SECRET ?? "",
          apiKey: fromFile.BB_API_KEY ?? "",
          source: "file",
          profile: values.BB_PROFILE,
          label: result.profile.label,
        };
      }
    }
  }

  const presentCredentials = CREDENTIAL_VARS.filter(
    (name) => fromEnv[name] !== null || fromFile[name] !== null,
  );
  const missingCredentials = CREDENTIAL_VARS.filter(
    (name) => fromEnv[name] === null && fromFile[name] === null,
  );
  const configured = credentials !== null;

  const maxAmount = values.BB_MCP_MAX_AMOUNT ?? null;

  // 6.4 Punkt 6: kein Verbindungsaufbau beim Start.
  // 6.4 Punkt 7: einfrieren, auch die Teilobjekte.
  const config: ResolvedConfig = Object.freeze({
    configured,
    credentials: credentials === null ? null : Object.freeze(credentials),
    missingCredentials: Object.freeze(missingCredentials),
    presentCredentials: Object.freeze(presentCredentials),
    credentialsSplitAcrossSources: !configured && missingCredentials.length === 0,

    baseUrl: values.BB_BASE_URL,
    profile: values.BB_PROFILE,
    configDir,
    credentialsFile,

    readOnly,
    toolGroups,
    maxBatch: values.BB_MCP_MAX_BATCH,
    maxAmount,
    maxAmountCents: maxAmount === null ? null : amountToCents(maxAmount),
    rateLimitPerMinute: values.BB_MCP_RATE_LIMIT,
    timeoutMs: values.BB_MCP_TIMEOUT_MS,
    duplicateCheck: values.BB_MCP_DUPLICATE_CHECK,
    maxResponseTokens: values.BB_MCP_MAX_RESPONSE_TOKENS,
    cacheTtlMs: values.BB_MCP_CACHE_TTL_MS,
    // Eine eigene Kopie: Zod gibt bei der Vorgabe dieselbe Arrayinstanz zurück, und die
    // darf nicht prozessweit eingefroren zurückbleiben.
    uploadDirs: Object.freeze([...values.BB_MCP_UPLOAD_DIRS]),
    uploadFromUrl: values.BB_MCP_UPLOAD_FROM_URL,
    logLevel: values.BB_MCP_LOG_LEVEL,
  });

  if (!configured) {
    warnings.push({
      code: "not-configured",
      text: formatMissingCredentialsStartupWarning(config),
    });
  }

  return { config, warnings };
}

// --- Prozessweite Instanz ------------------------------------------------------------

let current: ResolvedConfig | null = null;

/**
 * Löst die Konfiguration auf, meldet die drei Geheimnisse zur Schwärzung an, stellt die
 * Protokollstufe ein, gibt die Warnungen auf stderr aus und merkt sich das Ergebnis.
 *
 * @throws ConfigError in den Abbruchfällen aus 6.4.
 */
export function initConfig(options: ResolveOptions = {}): ResolvedConfig {
  const env = options.env ?? process.env;

  // Noch vor jeder Prüfung: Was wie ein Geheimnis aussieht, wird geschwärzt. Sonst könnte
  // eine Abbruchmeldung einen Wert tragen, den niemand sehen darf.
  registerSecrets(CREDENTIAL_VARS.map((name) => env[name]));

  const { config, warnings } = resolveConfig(options);

  if (config.credentials !== null) {
    const { apiClient, apiSecret, apiKey } = config.credentials;
    registerSecrets([apiClient, apiSecret, apiKey, `${apiClient}:${apiSecret}`]);
  }

  setLogLevel(config.logLevel);

  for (const warning of warnings) {
    if (warning.code === "not-configured") {
      // Der Block aus 6.5 trägt seine eigene Form und bekommt kein Stufenpräfix.
      writeStderrBlock(warning.text);
    } else {
      logWarn(warning.text);
    }
  }

  current = config;
  return config;
}

/**
 * Wie {@link initConfig}, beendet den Prozess aber mit Rückgabewert 1, wenn die
 * Konfiguration unbrauchbar ist. Das ist der Einstieg für `cli.ts` und `create-server.ts`.
 */
export function loadConfigOrExit(options: ResolveOptions = {}): ResolvedConfig {
  try {
    return initConfig(options);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Blockierend, weil process.exit einen noch nicht geschriebenen Puffer verwerfen würde.
      writeStderrBlockSync(error.message);
      process.exit(1);
    }
    throw error;
  }
}

/** Die aufgelöste Konfiguration. Alle übrigen Schichten lesen ausschließlich sie. */
export function getConfig(): ResolvedConfig {
  if (current === null) {
    throw new Error(
      "Die Konfiguration ist noch nicht aufgelöst. initConfig() oder loadConfigOrExit() muss vor dem ersten Zugriff laufen.",
    );
  }
  return current;
}

/** `true`, sobald die Konfiguration aufgelöst ist. */
export function isConfigLoaded(): boolean {
  return current !== null;
}

/**
 * Vergisst die aufgelöste Konfiguration. Ausschließlich für Tests; außerhalb eines
 * Testlaufs verweigert die Funktion den Dienst, damit zur Laufzeit niemand die
 * eingefrorene Konfiguration gegen eine andere tauschen kann (6.4 Punkt 7).
 */
export function resetConfigForTests(): void {
  if (process.env.VITEST === undefined && process.env.NODE_ENV !== "test") {
    throw new Error("resetConfigForTests() ist außerhalb eines Testlaufs nicht erlaubt.");
  }
  current = null;
}

/** Rechteprüfung der Zugangsdatendatei für `doctor` (8.4), ohne sie zu lesen. */
export function inspectCredentialsPermissions(config: ResolvedConfig): readonly ConfigWarning[] {
  return toConfigWarnings(checkCredentialsPermissions(config.credentialsFile));
}
