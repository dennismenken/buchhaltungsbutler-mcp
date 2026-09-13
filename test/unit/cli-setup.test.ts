import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createClientHost, SERVER_NAME, type ClientHost } from "../../src/cli/clients/types.js";
import { createScriptedTerminal, type ScriptedTerminal } from "../../src/cli/prompt.js";
import { runSetup, VERIFICATION_SENTENCE } from "../../src/cli/setup.js";
import { TEST_ENDPOINT } from "../../src/cli/test.js";
import {
  mockApi,
  resetTestConfig,
  TEST_BASE_URL,
  TEST_CREDENTIALS,
  type ApiMock,
} from "../helpers/mock-api.js";

// Der Einrichtungsassistent, neun Schritte.
//
// Der Ablauf läuft gegen ein wegwerfbares Verzeichnis und gegen die HTTP-Nachbildung; es geht
// nichts an die echte API. Die Werte in der Umgebung sind Platzhalter aus `mock-api.ts`.

const ACCOUNTS = [
  { name: "Bank", postingaccount_number: "1200" },
  { name: "Kasse", postingaccount_number: "1000" },
];

let root: string;
let api: ApiMock;
const runCalls: { command: string; args: readonly string[] }[] = [];

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: "",
    BB_BASE_URL: TEST_BASE_URL,
    BB_CONFIG_DIR: path.join(root, "config"),
    ...extra,
  };
}

function makeHost(variables: NodeJS.ProcessEnv): ClientHost {
  const base = createClientHost({
    env: variables,
    platform: "linux",
    homeDir: path.join(root, "home"),
    cwd: path.join(root, "projekt"),
  });
  return {
    ...base,
    which: () => null,
    run: (command, args) => {
      runCalls.push({ command, args });
      return { status: 0, stdout: "", stderr: "", failure: null };
    },
  };
}

function cursorUserFile(): string {
  return path.join(root, "home", ".cursor", "mcp.json");
}

function credentialsFile(): string {
  return path.join(root, "config", "credentials.json");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-setup-"));
  fs.mkdirSync(path.join(root, "home"), { recursive: true });
  fs.mkdirSync(path.join(root, "projekt"), { recursive: true });
  api = mockApi();
  runCalls.length = 0;
});

afterEach(() => {
  api.close();
  resetTestConfig();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("runSetup, interaktiv", () => {
  /** Cursor soll gefunden werden, damit Schritt 7 die Vorauswahl benutzen kann. */
  function prepareCursor(): void {
    fs.mkdirSync(path.dirname(cursorUserFile()), { recursive: true });
    fs.writeFileSync(cursorUserFile(), JSON.stringify({ mcpServers: { fremd: {} } }, null, 2));
  }

  function fullRun(): { terminal: ScriptedTerminal; variables: NodeJS.ProcessEnv } {
    const terminal = createScriptedTerminal([
      "j", // Schritt 2: vorhandene Zugangsdaten übernehmen
      "j", // Schritt 4: Mandant bestätigen
      "1", // Schritt 5: Startvariante npx
      "1", // Schritt 6: Zugangsdatendatei
      "Musterfirma GmbH", // Anzeigename
      "n", // Schritt 9: kein Nur-Lesen
      "", // Schritt 7: Vorauswahl übernehmen
      "j", // schreiben
    ]);
    return { terminal, variables: env(TEST_CREDENTIALS) };
  }

  it("läuft alle neun Schritte durch und schreibt Profil und Clienteintrag", async () => {
    prepareCursor();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const { terminal, variables } = fullRun();

    const code = await runSetup({ argv: [], terminal, host: makeHost(variables), env: variables });

    expect(code).toBe(0);
    const text = terminal.text();
    for (const step of [
      "Schritt 1 von 9: Vorprüfung",
      "Schritt 2 von 9: Zugangsdaten",
      "Schritt 3 von 9: Verbindung testen",
      "Schritt 4 von 9: Mandant bestätigen",
      "Schritt 5 von 9: Startvariante",
      "Schritt 6 von 9: Ablageort der Zugangsdaten",
      "Schritt 7 von 9: Clients auswählen und Vorschau",
      "Schritt 8 von 9: Abschluss",
      "Schritt 9 von 9 (vorgezogen): Nur-Lesen-Schalter",
    ]) {
      expect(text).toContain(step);
    }

    // Schritt 6: Profil in der Zugangsdatendatei, Rechte 0600.
    const profile = JSON.parse(fs.readFileSync(credentialsFile(), "utf8")) as {
      profiles: Record<string, Record<string, string>>;
    };
    expect(profile.profiles.default?.api_key).toBe(TEST_CREDENTIALS.BB_API_KEY);
    expect(profile.profiles.default?.label).toBe("Musterfirma GmbH");
    expect(fs.statSync(credentialsFile()).mode & 0o777).toBe(0o600);

    // Schritt 7: Eintrag bei Cursor, ohne Geheimnis, fremder Eintrag unberührt.
    const cursor = JSON.parse(fs.readFileSync(cursorUserFile(), "utf8")) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(cursor.mcpServers).sort()).toEqual([SERVER_NAME, "fremd"].sort());
    expect(cursor.mcpServers[SERVER_NAME]?.env).toBeUndefined();
  });

  it("nennt den Pfad der Sicherung, bevor es eine bestehende Datei ändert", async () => {
    prepareCursor();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const { terminal, variables } = fullRun();

    await runSetup({ argv: [], terminal, host: makeHost(variables), env: variables });

    const text = terminal.text();
    const match = /Sicherung: (\S+)/.exec(text);
    expect(match).not.toBeNull();
    expect(fs.existsSync(match?.[1] ?? "")).toBe(true);
  });

  it("zeigt die gefundenen Zahlungskonten und den Verifikationssatz", async () => {
    prepareCursor();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const { terminal, variables } = fullRun();

    await runSetup({ argv: [], terminal, host: makeHost(variables), env: variables });

    const text = terminal.text();
    expect(text).toContain("Gefunden: 2 Zahlungskonten.");
    expect(text).toContain("1200  Bank");
    expect(text).toContain("Gehören diese Konten zu dem Mandanten");
    expect(text).toContain(VERIFICATION_SENTENCE);
  });

  it("bricht ab, wenn die Konten nicht zum gewünschten Mandanten gehören", async () => {
    prepareCursor();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal(["j", "n"]);
    const variables = env(TEST_CREDENTIALS);

    const code = await runSetup({ argv: [], terminal, host: makeHost(variables), env: variables });

    expect(code).toBe(1);
    expect(terminal.errorLines.join(" ")).toContain("Dann ist der api_key der falsche");
    expect(fs.existsSync(credentialsFile())).toBe(false);
    const cursor = fs.readFileSync(cursorUserFile(), "utf8");
    expect(cursor).not.toContain(SERVER_NAME);
  });

  it("schreibt nichts, wenn der Verbindungstest scheitert und der Nutzer abbricht", async () => {
    prepareCursor();
    api.post(TEST_ENDPOINT, { status: 401, json: { success: false, error_code: 3 } });
    const terminal = createScriptedTerminal(["j", "n"]);
    const variables = env(TEST_CREDENTIALS);

    const code = await runSetup({ argv: [], terminal, host: makeHost(variables), env: variables });

    expect(code).toBe(1);
    expect(terminal.text()).toContain("API Client oder API Secret ist falsch");
    expect(fs.existsSync(credentialsFile())).toBe(false);
  });

  it("schreibt mit BB_MCP_READ_ONLY, wenn der Nutzer es will", async () => {
    prepareCursor();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal([
      "j",
      "j",
      "1",
      "1",
      "",
      "j", // Nur-Lesen: ja
      "",
      "j",
    ]);
    const variables = env(TEST_CREDENTIALS);

    await runSetup({ argv: [], terminal, host: makeHost(variables), env: variables });

    const cursor = JSON.parse(fs.readFileSync(cursorUserFile(), "utf8")) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    expect(cursor.mcpServers[SERVER_NAME]?.env).toEqual({ BB_MCP_READ_ONLY: "true" });
    expect(terminal.text()).toContain("BWA und Summen- und Saldenliste nicht");
  });
});

describe("runSetup, nicht interaktiv", () => {
  it("schreibt mit --print-only nichts und gibt den Block aus", async () => {
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env(TEST_CREDENTIALS);

    const code = await runSetup({
      argv: [
        "--client",
        "claude-code",
        "--scope",
        "user",
        "--start",
        "npx",
        "--non-interactive",
        "--print-only",
      ],
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(0);
    expect(fs.existsSync(credentialsFile())).toBe(false);
    expect(runCalls).toHaveLength(0);
    const text = terminal.text();
    expect(text).toContain("Claude Code");
    expect(text).toContain('"command": "npx"');
    expect(text).toContain("Nur ausgeben: Es wurde keine Datei geändert");
  });

  it("verlangt ohne Terminal ein --client", async () => {
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env(TEST_CREDENTIALS);

    await expect(
      runSetup({
        argv: ["--non-interactive"],
        terminal,
        host: makeHost(variables),
        env: variables,
      }),
    ).rejects.toThrow(/--client/);
  });

  it("nimmt die Zugangsdaten ausschließlich aus der Umgebung und zeigt keinen Wert", async () => {
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env(TEST_CREDENTIALS);

    await runSetup({
      argv: ["--client", "cursor", "--non-interactive", "--print-only"],
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    const text = terminal.text();
    expect(text).toContain("Zugangsdaten aus den Umgebungsvariablen übernommen");
    for (const value of Object.values(TEST_CREDENTIALS)) {
      expect(text).not.toContain(value);
    }
  });

  it("bricht ohne Zugangsdaten und ohne Terminal ab, statt zu fragen", async () => {
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env();

    await expect(
      runSetup({
        argv: ["--client", "cursor", "--non-interactive"],
        terminal,
        host: makeHost(variables),
        env: variables,
      }),
    ).rejects.toThrow(/BB_API_CLIENT/);
  });

  it("gibt ohne Zugangsdaten mit --print-only Platzhalter aus", async () => {
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env();

    const code = await runSetup({
      argv: ["--client", "claude-desktop", "--non-interactive", "--print-only"],
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(0);
    expect(api.count()).toBe(0);
    expect(terminal.text()).toContain("bleibt bei Platzhaltern");
  });

  it("trägt mehrere Clients auf einmal ein", async () => {
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env(TEST_CREDENTIALS);

    const code = await runSetup({
      argv: ["--client", "cursor,zed", "--scope", "project", "--non-interactive"],
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(root, "projekt", ".cursor", "mcp.json"))).toBe(true);
    // Zed wird nur ausgegeben; es darf keine Datei entstehen.
    expect(terminal.text()).toContain("wird nicht automatisch konfiguriert");
  });

  it("weist ein unbekanntes Clientkürzel zurück", async () => {
    const terminal = createScriptedTerminal([], { interactive: false });
    const variables = env(TEST_CREDENTIALS);
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 0, data: [] } });

    await expect(
      runSetup({
        argv: ["--client", "emacs", "--non-interactive"],
        terminal,
        host: makeHost(variables),
        env: variables,
      }),
    ).rejects.toThrow(/emacs/);
  });
});
