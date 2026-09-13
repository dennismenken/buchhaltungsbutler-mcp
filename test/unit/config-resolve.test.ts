import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigError } from "../../src/config/env.js";
import { credentialsFilePath, writeProfile } from "../../src/config/credentials-file.js";
import { clearSecrets, redact } from "../../src/config/redact.js";
import {
  MINIMUM_NODE_VERSION,
  NOT_CONFIGURED_INSTRUCTIONS_PREFIX,
  formatMissingCredentialsStartupWarning,
  formatNotConfiguredToolError,
  getConfig,
  initConfig,
  inspectCredentialsPermissions,
  isConfigLoaded,
  loadConfigOrExit,
  resetConfigForTests,
  resolveConfig,
  type ResolveOptions,
} from "../../src/config/resolve.js";
import { resetLoggingForTests } from "../../src/logging/stderr.js";

// Ausschließlich Platzhalter.
const ENV_CLIENT = "PLATZHALTER_ENV_CLIENT";
const ENV_SECRET = "PLATZHALTER_ENV_SECRET";
const ENV_KEY = "PLATZHALTER_ENV_KEY";
const FILE_CLIENT = "PLATZHALTER_FILE_CLIENT";
const FILE_SECRET = "PLATZHALTER_FILE_SECRET";
const FILE_KEY = "PLATZHALTER_FILE_KEY";

let dir: string;
let stderrChunks: string[] = [];
let stdoutChunks: string[] = [];

function options(env: Record<string, string>): ResolveOptions {
  return {
    env: { BB_CONFIG_DIR: dir, ...env },
    platform: "linux",
    homeDir: dir,
    nodeVersion: "22.19.0",
  };
}

function resolve(env: Record<string, string>) {
  return resolveConfig(options(env));
}

function writeFileProfile(name = "default"): void {
  writeProfile(credentialsFilePath(dir), name, {
    apiClient: FILE_CLIENT,
    apiSecret: FILE_SECRET,
    apiKey: FILE_KEY,
    label: "Musterfirma GmbH",
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-resolve-"));
  stderrChunks = [];
  stdoutChunks = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  });
  // eslint-disable-next-line no-restricted-properties -- Der Test weist nach, dass der Start stdout nicht anfasst.
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  resetConfigForTests();
  resetLoggingForTests();
  clearSecrets();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
  resetConfigForTests();
  resetLoggingForTests();
  clearSecrets();
});

describe("Auflösungsreihenfolge 6.3", () => {
  it("nimmt die Umgebungsvariablen, wenn alle drei gesetzt sind, und liest die Datei nicht", () => {
    writeFileProfile();
    const { config } = resolve({
      BB_API_CLIENT: ENV_CLIENT,
      BB_API_SECRET: ENV_SECRET,
      BB_API_KEY: ENV_KEY,
    });

    expect(config.configured).toBe(true);
    expect(config.credentials?.source).toBe("env");
    expect(config.credentials?.apiClient).toBe(ENV_CLIENT);
    expect(config.credentials?.apiKey).toBe(ENV_KEY);
    expect(config.credentials?.profile).toBeNull();
    expect(config.missingCredentials).toEqual([]);
  });

  it("nimmt die Zugangsdatendatei, wenn die Umgebung unvollständig ist", () => {
    writeFileProfile();
    const { config } = resolve({ BB_API_CLIENT: ENV_CLIENT });

    expect(config.configured).toBe(true);
    expect(config.credentials?.source).toBe("file");
    expect(config.credentials?.apiClient).toBe(FILE_CLIENT);
    expect(config.credentials?.apiSecret).toBe(FILE_SECRET);
    expect(config.credentials?.profile).toBe("default");
    expect(config.credentials?.label).toBe("Musterfirma GmbH");
  });

  it("wählt das Profil aus BB_PROFILE", () => {
    writeFileProfile("kanzlei");
    const { config, warnings } = resolve({ BB_PROFILE: "kanzlei" });

    expect(config.profile).toBe("kanzlei");
    expect(config.credentials?.source).toBe("file");
    expect(warnings).toEqual([]);
  });

  it("mischt Umgebung und Datei nicht", () => {
    writeProfile(credentialsFilePath(dir), "default", {
      apiClient: FILE_CLIENT,
      apiSecret: FILE_SECRET,
      apiKey: "",
    });
    const { config } = resolve({ BB_API_KEY: ENV_KEY });

    expect(config.configured).toBe(false);
    expect(config.credentials).toBeNull();
    expect(config.credentialsSplitAcrossSources).toBe(true);
    expect(config.missingCredentials).toEqual([]);
  });

  it("meldet ein Profil, das die Datei nicht führt, und startet trotzdem", () => {
    writeFileProfile("default");
    const { config, warnings } = resolve({ BB_PROFILE: "kanzlei" });

    expect(config.configured).toBe(false);
    expect(warnings.some((warning) => warning.code === "profile-not-found")).toBe(true);
  });
});

describe("Zustand nicht konfiguriert, 6.5", () => {
  it("startet ohne Zugangsdaten und nennt alle drei als fehlend", () => {
    const { config, warnings } = resolve({});

    expect(config.configured).toBe(false);
    expect(config.missingCredentials).toEqual(["BB_API_CLIENT", "BB_API_SECRET", "BB_API_KEY"]);
    expect(warnings.some((warning) => warning.code === "not-configured")).toBe(true);
  });

  it("liefert den Absagetext aus 6.5 Punkt 4 wörtlich", () => {
    const { config } = resolve({ BB_API_CLIENT: ENV_CLIENT });

    expect(formatNotConfiguredToolError("bb_receipts_search", config)).toBe(
      [
        "bb_receipts_search ist nicht ausführbar: Dieser Server hat keine Zugangsdaten für",
        "BuchhaltungsButler.",
        "Es fehlen: BB_API_SECRET, BB_API_KEY. BB_API_CLIENT ist gesetzt.",
        "Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.",
        'Den Nutzer bitten, "npx -y @dennismenken/buchhaltungsbutler-mcp setup" auszuführen',
        "oder BB_API_CLIENT, BB_API_SECRET und BB_API_KEY in der MCP-Serverkonfiguration",
        "seines Clients zu setzen und den Client danach neu zu starten. Die Zugangsdaten",
        "werden einmal beim Serverstart gelesen.",
        "Keine anderen Werkzeuge dieses Servers ausprobieren; sie scheitern alle auf",
        "dieselbe Weise.",
      ].join("\n"),
    );
  });

  it("beugt beim Absagetext Singular und Plural richtig", () => {
    const twoVars = resolve({ BB_API_CLIENT: ENV_CLIENT, BB_API_SECRET: ENV_SECRET }).config;
    const noVars = resolve({}).config;

    expect(formatNotConfiguredToolError("bb_receipts_search", twoVars)).toContain(
      "Es fehlen: BB_API_KEY. BB_API_CLIENT und BB_API_SECRET sind gesetzt.",
    );
    expect(formatNotConfiguredToolError("bb_receipts_search", noVars)).toContain(
      "Es fehlen: BB_API_CLIENT, BB_API_SECRET, BB_API_KEY.",
    );
    expect(formatNotConfiguredToolError("bb_receipts_search", noVars)).not.toContain("gesetzt.");
  });

  it("nennt in der Startwarnung beide Wege und die Zugangsdatendatei", () => {
    const { config } = resolve({});
    const text = formatMissingCredentialsStartupWarning(config);

    expect(text).toContain("NICHT KONFIGURIERT");
    expect(text).toContain("npx -y @dennismenken/buchhaltungsbutler-mcp setup");
    expect(text).toContain(credentialsFilePath(dir));
    expect(text).toContain("0600");
  });

  it("hat einen Vorspann für die instructions", () => {
    expect(NOT_CONFIGURED_INSTRUCTIONS_PREFIX).toContain("NICHT KONFIGURIERT.");
    expect(NOT_CONFIGURED_INSTRUCTIONS_PREFIX).toContain(
      "npx -y @dennismenken/buchhaltungsbutler-mcp setup",
    );
  });
});

describe("Abbruchfälle der Startprüfung 6.4", () => {
  it("bricht bei zu alter Node-Fassung ab", () => {
    expect(() => resolveConfig({ ...options({}), nodeVersion: "22.18.0" })).toThrow(ConfigError);
    expect(() => resolveConfig({ ...options({}), nodeVersion: "20.11.0" })).toThrow(
      new RegExp(MINIMUM_NODE_VERSION.replace(/\./g, "\\.")),
    );
    expect(() => resolveConfig({ ...options({}), nodeVersion: "v24.11.0" })).not.toThrow();
  });

  it("bricht bei einem unbrauchbaren Wert ab, statt auf die Vorgabe zurückzufallen", () => {
    expect(() => resolve({ BB_MCP_READ_ONLY: "ture" })).toThrow(ConfigError);
    expect(() => resolve({ BB_MCP_MAX_BATCH: "1000" })).toThrow(/zwischen 1 und 50/);
  });

  it("bricht ab, wenn BB_MCP_READ_ONLY und BB_READ_ONLY sich widersprechen", () => {
    let thrown: ConfigError | undefined;
    try {
      resolve({ BB_MCP_READ_ONLY: "true", BB_READ_ONLY: "false" });
    } catch (error) {
      thrown = error as ConfigError;
    }

    expect(thrown?.code).toBe("read-only-conflict");
    expect(thrown?.message).toContain("BB_MCP_READ_ONLY=true");
    expect(thrown?.message).toContain("BB_READ_ONLY=false");
  });

  it("lässt beide Namen zu, solange sie dasselbe sagen", () => {
    const { config, warnings } = resolve({ BB_MCP_READ_ONLY: "1", BB_READ_ONLY: "true" });

    expect(config.readOnly).toBe(true);
    expect(warnings.some((warning) => warning.code === "deprecated-env-var")).toBe(true);
  });

  it("nimmt den veralteten Namen allein an und warnt", () => {
    const { config, warnings } = resolve({ BB_READ_ONLY: "1" });

    expect(config.readOnly).toBe(true);
    expect(warnings.some((warning) => warning.text.includes("veraltet"))).toBe(true);
  });
});

describe("unbekannte BB_*-Variablen", () => {
  it("warnt für jede und nennt den nächstähnlichen bekannten Namen", () => {
    const { warnings } = resolve({ BB_MCP_READ_ONY: "true", BB_LOG_LEVEL: "info" });
    const unknown = warnings.filter((warning) => warning.code === "unknown-env-var");

    expect(unknown).toHaveLength(2);
    expect(unknown[0]?.text).toContain("BB_LOG_LEVEL");
    expect(unknown[0]?.text).toContain("BB_MCP_LOG_LEVEL");
    expect(unknown[1]?.text).toContain("BB_MCP_READ_ONLY");
  });
});

describe("das Konfigurationsobjekt", () => {
  it("trägt jeden Wert aus 6.2 und ist eingefroren", () => {
    const { config } = resolve({
      BB_API_CLIENT: ENV_CLIENT,
      BB_API_SECRET: ENV_SECRET,
      BB_API_KEY: ENV_KEY,
      BB_BASE_URL: "https://beispiel.invalid/api/v1",
      BB_MCP_READ_ONLY: "true",
      BB_MCP_MAX_BATCH: "10",
      BB_MCP_MAX_AMOUNT: "2500.50",
      BB_MCP_RATE_LIMIT: "30",
      BB_MCP_TIMEOUT_MS: "60000",
      BB_MCP_DUPLICATE_CHECK: "on",
      BB_MCP_MAX_RESPONSE_TOKENS: "1000",
      BB_MCP_CACHE_TTL_MS: "60000",
      BB_MCP_UPLOAD_DIRS: path.resolve("/tmp/belege"),
      BB_MCP_UPLOAD_FROM_URL: "true",
      BB_MCP_LOG_LEVEL: "debug",
    });

    expect(config.baseUrl).toBe("https://beispiel.invalid/api/v1");
    expect(config.readOnly).toBe(true);
    expect(config.maxBatch).toBe(10);
    expect(config.maxAmount).toBe("2500.50");
    expect(config.maxAmountCents).toBe(250_050);
    expect(config.rateLimitPerMinute).toBe(30);
    expect(config.timeoutMs).toBe(60_000);
    expect(config.duplicateCheck).toBe("on");
    expect(config.maxResponseTokens).toBe(1000);
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.uploadDirs).toEqual([path.resolve("/tmp/belege")]);
    expect(config.uploadFromUrl).toBe(true);
    expect(config.logLevel).toBe("debug");
    expect(config.credentialsFile).toBe(credentialsFilePath(dir));

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.credentials)).toBe(true);
    expect(Object.isFrozen(config.uploadDirs)).toBe(true);
    expect(() => {
      (config as { readOnly: boolean }).readOnly = false;
    }).toThrow(TypeError);
  });

  it("rechnet die Betragsgrenze ohne Gleitkomma in Cent um", () => {
    expect(resolve({ BB_MCP_MAX_AMOUNT: "0.01" }).config.maxAmountCents).toBe(1);
    expect(resolve({ BB_MCP_MAX_AMOUNT: "1.1" }).config.maxAmountCents).toBe(110);
    expect(resolve({ BB_MCP_MAX_AMOUNT: "999" }).config.maxAmountCents).toBe(99_900);
    expect(resolve({}).config.maxAmount).toBeNull();
    expect(resolve({}).config.maxAmountCents).toBeNull();
  });

  it("setzt die Vorgaben aus 6.2, wenn nichts gesetzt ist", () => {
    const { config } = resolve({});

    expect(config.readOnly).toBe(false);
    expect(config.duplicateCheck).toBe("off");
    expect(config.cacheTtlMs).toBe(0);
    expect(config.uploadDirs).toEqual([]);
    expect(config.uploadFromUrl).toBe(false);
    expect(config.maxBatch).toBe(50);
    expect(config.logLevel).toBe("warn");
    expect(config.baseUrl).toBe("https://webapp.buchhaltungsbutler.de/api/v1");
  });
});

describe("initConfig und getConfig", () => {
  it("verweigert getConfig vor der Auflösung", () => {
    expect(isConfigLoaded()).toBe(false);
    expect(() => getConfig()).toThrow(/noch nicht aufgelöst/);
  });

  it("merkt sich das Ergebnis, meldet die Geheimnisse zur Schwärzung an und schreibt nur nach stderr", () => {
    const config = initConfig(
      options({ BB_API_CLIENT: ENV_CLIENT, BB_API_SECRET: ENV_SECRET, BB_API_KEY: ENV_KEY }),
    );

    expect(getConfig()).toBe(config);
    expect(isConfigLoaded()).toBe(true);
    expect(stdoutChunks).toEqual([]);

    expect(redact(`key=${ENV_KEY}`)).toBe("key=[redacted]");
    expect(
      redact(`Basic ${Buffer.from(`${ENV_CLIENT}:${ENV_SECRET}`, "utf8").toString("base64")}`),
    ).toBe("Basic [redacted]");
  });

  it("schreibt die Startwarnung nach stderr, wenn Zugangsdaten fehlen", () => {
    initConfig(options({}));
    const out = stderrChunks.join("");

    expect(out).toContain("NICHT KONFIGURIERT");
    expect(out).toContain("Es fehlen: BB_API_CLIENT, BB_API_SECRET, BB_API_KEY.");
    expect(stdoutChunks).toEqual([]);
  });

  it("schwärzt einen Wert, der schon vor der Prüfung in der Umgebung stand", () => {
    expect(() => initConfig(options({ BB_API_KEY: ENV_KEY, BB_MCP_MAX_BATCH: "0" }))).toThrow(
      ConfigError,
    );

    expect(redact(`key=${ENV_KEY}`)).toBe("key=[redacted]");
  });
});

describe("loadConfigOrExit", () => {
  it("gibt die Konfiguration zurück, wenn sie brauchbar ist", () => {
    const config = loadConfigOrExit(options({ BB_MCP_READ_ONLY: "true" }));

    expect(config.readOnly).toBe(true);
    expect(stdoutChunks).toEqual([]);
  });

  it("schreibt den Abbruchtext blockierend nach stderr und endet mit Rückgabewert 1", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((): never => {
      throw new Error("exit");
    });
    // Der Abbruchtext geht über fs.writeSync auf den Deskriptor 2, damit process.exit ihn
    // nicht verwirft; der Test fängt ihn deshalb dort ab.
    const sync: string[] = [];
    const writeSync = vi.spyOn(fs, "writeSync").mockImplementation((fd: number, data: unknown) => {
      sync.push(`${String(fd)}:${String(data)}`);
      return 0;
    });

    expect(() => loadConfigOrExit(options({ BB_MCP_READ_ONLY: "ture" }))).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(writeSync).toHaveBeenCalled();
    expect(sync.join("")).toContain("2:");
    expect(sync.join("")).toContain("BB_MCP_READ_ONLY");
    expect(stdoutChunks).toEqual([]);
  });
});

describe("Diagnose für doctor", () => {
  it("meldet zu weite Rechte der Zugangsdatendatei, ohne sie zu lesen", () => {
    writeFileProfile();
    fs.chmodSync(credentialsFilePath(dir), 0o644);
    const { config } = resolve({});

    const warnings = inspectCredentialsPermissions(config);

    expect(warnings.some((warning) => warning.code === "credentials-file-permissions")).toBe(true);
  });
});

describe("Schutz des eingefrorenen Zustands", () => {
  it("verweigert resetConfigForTests außerhalb eines Testlaufs", () => {
    const vitestFlag = process.env.VITEST;
    const nodeEnv = process.env.NODE_ENV;
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
    try {
      expect(() => resetConfigForTests()).toThrow(/außerhalb eines Testlaufs/);
    } finally {
      if (vitestFlag !== undefined) {
        process.env.VITEST = vitestFlag;
      }
      if (nodeEnv !== undefined) {
        process.env.NODE_ENV = nodeEnv;
      }
    }
  });
});
