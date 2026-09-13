import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLIENT_KEYS, createClientHost, type ClientHost } from "../../src/cli/clients/types.js";
import { createScriptedTerminal, type ScriptedTerminal } from "../../src/cli/prompt.js";
import { runCli } from "../../src/cli/run.js";
import { resetTestConfig, TEST_BASE_URL } from "../helpers/mock-api.js";

// Die Weiche aus `run.ts` und die beiden Unterbefehle, die nur mit Dateien und Ausgabe
// arbeiten: `print-config` und `uninstall` (Plan 8.1).

let root: string;
let terminal: ScriptedTerminal;

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
    run: () => ({ status: 0, stdout: "", stderr: "", failure: null }),
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-cmd-"));
  fs.mkdirSync(path.join(root, "home"), { recursive: true });
  fs.mkdirSync(path.join(root, "projekt"), { recursive: true });
  terminal = createScriptedTerminal([], { interactive: false });
});

afterEach(() => {
  resetTestConfig();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("runCli", () => {
  it("gibt die Hilfe aus", async () => {
    const variables = env();

    const code = await runCli(["--help"], { terminal, host: makeHost(variables), env: variables });

    expect(code).toBe(0);
    expect(terminal.text()).toContain("bbutler-mcp setup");
  });

  it("weist einen unbekannten Unterbefehl mit 2 zurück", async () => {
    const variables = env();

    const code = await runCli(["installiere"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(2);
    expect(terminal.errorLines.join(" ")).toContain("Unbekannter Unterbefehl");
  });

  it("macht aus einer falschen Kommandozeile den Rückgabewert 2", async () => {
    const variables = env();

    const code = await runCli(["print-config"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(2);
    const message = terminal.errorLines.join(" ");
    expect(message).toContain("--client");
    for (const key of CLIENT_KEYS) {
      expect(message).toContain(key);
    }
  });

  it("endet bei einem Geheimnis als Argument mit 2 und einer Begründung", async () => {
    const variables = env();

    const code = await runCli(["print-config", "--client", "cursor", "--api-key=PLATZHALTER"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(2);
    expect(terminal.errorLines.join(" ")).toContain("Zugangsdaten nimmt kein Unterbefehl");
  });

  it("endet bei `test` ohne Zugangsdaten mit 1", async () => {
    const variables = env();

    const code = await runCli(["test"], { terminal, host: makeHost(variables), env: variables });

    expect(code).toBe(1);
    expect(terminal.errorLines.join("\n")).toContain("NICHT KONFIGURIERT");
  });
});

describe("print-config", () => {
  it("gibt für jedes der zwölf Kürzel einen Block aus und schreibt nichts", async () => {
    for (const key of CLIENT_KEYS) {
      const localTerminal = createScriptedTerminal([], { interactive: false });
      const variables = env();

      const code = await runCli(["print-config", "--client", key], {
        terminal: localTerminal,
        host: makeHost(variables),
        env: variables,
      });

      expect(code, key).toBe(0);
      expect(localTerminal.text(), key).toContain("Es wurde nichts geschrieben.");
      expect(localTerminal.text().length, key).toBeGreaterThan(80);
    }

    // Nichts im Heimatverzeichnis, nichts im Projekt.
    expect(fs.readdirSync(path.join(root, "home"))).toEqual([]);
    expect(fs.readdirSync(path.join(root, "projekt"))).toEqual([]);
  });

  it("setzt Zugangsdaten nur als Platzhalter ein", async () => {
    const variables = env();

    await runCli(["print-config", "--client", "claude-desktop", "--with-credentials"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    const text = terminal.text();
    expect(text).toContain("PLATZHALTER_API_CLIENT");
    expect(text).toContain("PLATZHALTER_API_KEY");
  });

  it("schreibt ohne --with-credentials gar keine Zugangsangabe in den Block", async () => {
    const variables = env();

    await runCli(["print-config", "--client", "windsurf"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(terminal.text()).not.toContain("BB_API_CLIENT");
  });

  it("lehnt eine Ebene ab, die der Client nicht kennt", async () => {
    const variables = env();

    const code = await runCli(["print-config", "--client", "windsurf", "--scope", "project"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(2);
  });
});

describe("uninstall", () => {
  it("entfernt den eigenen Eintrag und legt eine Sicherung an", async () => {
    const target = path.join(root, "home", ".cursor", "mcp.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify({ mcpServers: { buchhaltungsbutler: { command: "npx" }, fremd: {} } }),
    );
    const variables = env();

    const code = await runCli(["uninstall", "--client", "cursor", "--yes"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(0);
    const written = JSON.parse(fs.readFileSync(target, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(written.mcpServers)).toEqual(["fremd"]);
    const text = terminal.text();
    expect(text).toContain("Der Eintrag wurde entfernt.");
    const match = /Sicherung: (\S+)/.exec(text);
    expect(match).not.toBeNull();
    expect(fs.existsSync(match?.[1] ?? "")).toBe(true);
  });

  it("meldet freundlich, wenn es nichts zu entfernen gibt", async () => {
    const variables = env();

    const code = await runCli(["uninstall", "--client", "cline", "--yes"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(0);
    expect(terminal.text()).toContain("nichts geändert");
  });

  it("verweist bei einem Nur-Ausgeben-Client auf die Handarbeit", async () => {
    const variables = env();

    const code = await runCli(["uninstall", "--client", "jan", "--yes"], {
      terminal,
      host: makeHost(variables),
      env: variables,
    });

    expect(code).toBe(0);
    expect(terminal.text()).toContain("von Hand zu erledigen");
  });
});
