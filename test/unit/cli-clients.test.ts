import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claudeCodeAdapter } from "../../src/cli/clients/claude-code.js";
import { claudeDesktopAdapter } from "../../src/cli/clients/claude-desktop.js";
import { clineAdapter } from "../../src/cli/clients/cline.js";
import { codexAdapter, withStartupTimeout } from "../../src/cli/clients/codex.js";
import { cursorAdapter } from "../../src/cli/clients/cursor.js";
import { grokAdapter } from "../../src/cli/clients/grok.js";
import { lmStudioAdapter } from "../../src/cli/clients/lmstudio.js";
import { continueAdapter, janAdapter, zedAdapter } from "../../src/cli/clients/print-only.js";
import {
  buildPlan,
  createClientHost,
  placeholderCredentials,
  serverLaunch,
  LEGACY_SERVER_NAMES,
  SERVER_NAME,
  type ClientHost,
  type CommandResult,
} from "../../src/cli/clients/types.js";
import { vscodeAdapter } from "../../src/cli/clients/vscode.js";
import { windsurfAdapter } from "../../src/cli/clients/windsurf.js";
import { ALL_ADAPTERS } from "../../src/cli/run.js";

// Die zehn Adapter (Plan 8.3). Geschrieben wird gegen ein echtes, wegwerfbares Verzeichnis:
// Sicherungen, Zusammenführen und die Regel „fehlt die Datei, wird nur ausgegeben" sind
// Dateisystemverhalten und nur dort ehrlich prüfbar.
//
// **In keinem Test steht ein echtes Zugangsdatum**; die Werte heißen TESTWERT_*.

const TEST_VALUES = {
  BB_API_CLIENT: "TESTWERT_CLIENT",
  BB_API_SECRET: "TESTWERT_SECRET",
  BB_API_KEY: "TESTWERT_KEY",
} as const;

let root: string;
const calls: { command: string; args: readonly string[] }[] = [];

function makeHost(overrides: Partial<ClientHost> = {}): ClientHost {
  const base = createClientHost({
    env: { PATH: "" },
    platform: "darwin",
    homeDir: path.join(root, "home"),
    cwd: path.join(root, "projekt"),
  });
  return {
    ...base,
    which: () => null,
    run: (command, args): CommandResult => {
      calls.push({ command, args });
      return { status: 0, stdout: "", stderr: "", failure: null };
    },
    ...overrides,
  };
}

function launch(): ReturnType<typeof serverLaunch> {
  return serverLaunch("npx", null);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-cli-"));
  fs.mkdirSync(path.join(root, "home"), { recursive: true });
  fs.mkdirSync(path.join(root, "projekt"), { recursive: true });
  calls.length = 0;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Adapterliste", () => {
  it("bildet die zwölf Kürzel auf zehn Module ab", () => {
    // Neun eigene Adapter plus die Sammeldatei print-only.ts mit drei Kürzeln.
    const ownModules = [
      claudeCodeAdapter,
      claudeDesktopAdapter,
      codexAdapter,
      grokAdapter,
      vscodeAdapter,
      cursorAdapter,
      windsurfAdapter,
      lmStudioAdapter,
      clineAdapter,
    ];
    const collected = [zedAdapter, continueAdapter, janAdapter];

    expect(ownModules).toHaveLength(9);
    expect(collected).toHaveLength(3);
    expect(ALL_ADAPTERS).toEqual([...ownModules.slice(0, 9), ...collected]);
    expect(new Set(ALL_ADAPTERS.map((adapter) => adapter.key)).size).toBe(12);
  });

  it("gibt bei jedem Adapter an, was danach zu tun ist", () => {
    for (const adapter of ALL_ADAPTERS) {
      expect(adapter.finishNote.length).toBeGreaterThan(10);
      expect(adapter.label.length).toBeGreaterThan(2);
    }
  });

  it("kennzeichnet Zed, Continue und Jan als nicht automatisch", () => {
    const automatic = ALL_ADAPTERS.filter((adapter) => adapter.automatic).map((a) => a.key);
    const manual = ALL_ADAPTERS.filter((adapter) => !adapter.automatic).map((a) => a.key);

    expect(manual).toEqual(["zed", "continue", "jan"]);
    expect(automatic).toHaveLength(9);
  });
});

describe("JSON-Dateiadapter", () => {
  it("ergänzt eine bestehende Datei, lässt fremde Einträge stehen und legt eine Sicherung an", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".cursor", "mcp.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify({ mcpServers: { fremd: { command: "node" } }, andereEinstellung: 1 }, null, 2),
    );

    const outcome = cursorAdapter.apply(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("written");
    if (outcome.kind !== "written") {
      return;
    }
    expect(outcome.backupPath).not.toBeNull();
    expect(fs.existsSync(outcome.backupPath ?? "")).toBe(true);

    const written = JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, unknown>;
    const servers = written.mcpServers as Record<string, Record<string, unknown>>;
    expect(Object.keys(servers).sort()).toEqual([SERVER_NAME, "fremd"].sort());
    expect(servers[SERVER_NAME]?.command).toBe("npx");
    expect(written.andereEinstellung).toBe(1);
  });

  it("schreibt nicht in eine fehlende Datei im Benutzerprofil, sondern gibt nur aus", () => {
    const host = makeHost();
    const target = path.join(
      root,
      "home",
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );

    const outcome = claudeDesktopAdapter.apply(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("manual");
    expect(fs.existsSync(target)).toBe(false);
  });

  it("legt eine Projektdatei an, weil ihr Ort nicht geraten ist", () => {
    const host = makeHost();
    const target = path.join(root, "projekt", ".cursor", "mcp.json");

    const outcome = cursorAdapter.apply(buildPlan({ launch: launch(), scope: "project" }), host);

    expect(outcome.kind).toBe("written");
    expect(fs.existsSync(target)).toBe(true);
  });

  it("tastet einen bestehenden Eintrag ohne ausdrückliche Zustimmung nicht an", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".cline", "mcp.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: "alt" } } }));

    const outcome = clineAdapter.apply(buildPlan({ launch: launch() }), host);
    expect(outcome.kind).toBe("unchanged");

    const overwritten = clineAdapter.apply(
      buildPlan({ launch: launch(), allowOverwrite: true }),
      host,
    );
    expect(overwritten.kind).toBe("written");
    const written = JSON.parse(fs.readFileSync(target, "utf8")) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(written.mcpServers[SERVER_NAME]?.command).toBe("npx");
    expect(written.mcpServers[SERVER_NAME]?.disabled).toBe(false);
  });

  // --- Der frühere Eintragsname ------------------------------------------------------
  //
  // `SERVER_NAME` wurde von `buchhaltungsbutler` auf `bbutler` gekürzt, damit
  // `mcp__<name>__<werkzeug>` unter der 64-Zeichen-Grenze der Messages API bleibt. Eine
  // bestehende Installation führt den Eintrag deshalb noch unter dem alten Namen. Die
  // folgenden drei Prüfungen halten fest, dass daraus kein doppelter Eintrag wird.

  it("tastet einen Eintrag unter dem früheren Namen ohne Zustimmung nicht an", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".cline", "mcp.json");
    const legacy = LEGACY_SERVER_NAMES[0] ?? "";
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ mcpServers: { [legacy]: { command: "alt" } } }));

    const outcome = clineAdapter.apply(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("unchanged");
    if (outcome.kind !== "unchanged") {
      return;
    }
    expect(outcome.reason).toContain(legacy);
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({
      mcpServers: { [legacy]: { command: "alt" } },
    });
  });

  it("ersetzt mit --overwrite den früheren Eintrag, statt einen zweiten daneben zu legen", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".cline", "mcp.json");
    const legacy = LEGACY_SERVER_NAMES[0] ?? "";
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify({ mcpServers: { [legacy]: { command: "alt" }, fremd: {} } }),
    );

    const outcome = clineAdapter.apply(buildPlan({ launch: launch(), allowOverwrite: true }), host);

    expect(outcome.kind).toBe("written");
    if (outcome.kind !== "written") {
      return;
    }
    expect(outcome.detail).toContain(legacy);
    const written = JSON.parse(fs.readFileSync(target, "utf8")) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    // Genau ein Eintrag dieses Servers, und zwar unter dem neuen Namen. Der fremde bleibt.
    expect(Object.keys(written.mcpServers).sort()).toEqual([SERVER_NAME, "fremd"].sort());
    expect(written.mcpServers[SERVER_NAME]?.command).toBe("npx");
  });

  it("entfernt auch einen Eintrag, der noch unter dem früheren Namen steht", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".codeium", "windsurf", "mcp_config.json");
    const legacy = LEGACY_SERVER_NAMES[0] ?? "";
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify({ mcpServers: { [legacy]: { command: "npx" }, fremd: {} } }),
    );

    const outcome = windsurfAdapter.remove(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("removed");
    const written = JSON.parse(fs.readFileSync(target, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(written.mcpServers)).toEqual(["fremd"]);
  });

  it("entfernt den eigenen Eintrag und legt auch dabei eine Sicherung an", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".codeium", "windsurf", "mcp_config.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: "npx" }, fremd: {} } }),
    );

    const outcome = windsurfAdapter.remove(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("removed");
    if (outcome.kind !== "removed") {
      return;
    }
    expect(outcome.backupPath).not.toBeNull();
    const written = JSON.parse(fs.readFileSync(target, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(written.mcpServers)).toEqual(["fremd"]);
  });

  it("lässt eine kaputte JSON-Datei unverändert", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".lmstudio", "mcp.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{ das ist kein JSON");

    const outcome = lmStudioAdapter.apply(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("failed");
    expect(fs.readFileSync(target, "utf8")).toBe("{ das ist kein JSON");
  });

  it("schreibt Zugangsdaten nur, wenn der Plan sie trägt", () => {
    const host = makeHost();
    const target = path.join(root, "home", ".cursor", "mcp.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{}");

    cursorAdapter.apply(buildPlan({ launch: launch() }), host);
    expect(fs.readFileSync(target, "utf8")).not.toContain("BB_API_CLIENT");

    cursorAdapter.apply(
      buildPlan({
        launch: launch(),
        allowOverwrite: true,
        credentials: { mode: "reference" },
      }),
      host,
    );
    const referenced = fs.readFileSync(target, "utf8");
    expect(referenced).toContain("${env:BB_API_CLIENT}");
    expect(referenced).not.toContain(TEST_VALUES.BB_API_CLIENT);
  });
});

describe("Adapter mit eigener Kommandozeile", () => {
  it("ruft claude mcp add-json auf, ohne ein Geheimnis in die Argumente zu legen", () => {
    const host = makeHost({ which: () => "/usr/local/bin/claude" });

    const outcome = claudeCodeAdapter.apply(
      buildPlan({
        launch: launch(),
        scope: "user",
        credentials: { mode: "values", values: TEST_VALUES },
      }),
      host,
    );

    expect(outcome.kind).toBe("written");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.command).toBe("claude");
    expect(call?.args.slice(0, 5)).toEqual(["mcp", "add-json", "--scope", "user", SERVER_NAME]);
    const payload = call?.args[5] ?? "";
    for (const value of Object.values(TEST_VALUES)) {
      expect(payload).not.toContain(value);
    }
    expect(JSON.parse(payload)).toMatchObject({ type: "stdio", command: "npx" });
  });

  it("meldet einen fehlenden Client als Handarbeit, statt etwas zu erfinden", () => {
    const outcome = grokAdapter.apply(buildPlan({ launch: launch() }), makeHost());

    expect(outcome.kind).toBe("manual");
    expect(calls).toHaveLength(0);
  });

  it("meldet einen Fehlschlag der fremden Kommandozeile als Fehlschlag", () => {
    const host = makeHost({
      which: () => "/usr/local/bin/codex",
      run: () => ({ status: 2, stdout: "", stderr: "kaputt", failure: null }),
    });

    const outcome = codexAdapter.apply(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("failed");
  });

  it("ergänzt nach codex mcp add genau eine Zeile startup_timeout_sec", () => {
    const host = makeHost({ which: () => "/usr/local/bin/codex" });
    const target = path.join(root, "home", ".codex", "config.toml");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      ["# eigener Kommentar", `[mcp_servers.${SERVER_NAME}]`, 'command = "npx"', ""].join("\n"),
    );

    const outcome = codexAdapter.apply(buildPlan({ launch: launch() }), host);

    expect(outcome.kind).toBe("written");
    const text = fs.readFileSync(target, "utf8");
    expect(text).toContain("startup_timeout_sec = 30");
    expect(text).toContain("# eigener Kommentar");
    expect(text.match(/startup_timeout_sec/g)).toHaveLength(1);
  });
});

describe("withStartupTimeout", () => {
  const table = [
    "[mcp_servers.buchhaltungsbutler]",
    'command = "npx"',
    "",
    "[andere]",
    "x = 1",
  ].join("\n");

  it("setzt die Zeile in die richtige Tabelle", () => {
    const patched = withStartupTimeout(table, "buchhaltungsbutler");

    expect(patched).not.toBeNull();
    expect((patched ?? "").split("\n")[1]).toBe("startup_timeout_sec = 30");
  });

  it("ändert nichts, wenn die Zeile schon steht", () => {
    const already = `[mcp_servers.buchhaltungsbutler]\nstartup_timeout_sec = 45\n`;
    expect(withStartupTimeout(already, "buchhaltungsbutler")).toBeNull();
  });

  it("ändert nichts, wenn es die Tabelle nicht gibt", () => {
    expect(withStartupTimeout("[andere]\n", "buchhaltungsbutler")).toBeNull();
  });
});

describe("VS Code", () => {
  it("schreibt Zugangsdaten als inputs und niemals als Wert", () => {
    const host = makeHost();
    const target = path.join(root, "projekt", ".vscode", "mcp.json");

    const outcome = vscodeAdapter.apply(
      buildPlan({
        launch: launch(),
        scope: "project",
        credentials: { mode: "values", values: TEST_VALUES },
      }),
      host,
    );

    expect(outcome.kind).toBe("written");
    const text = fs.readFileSync(target, "utf8");
    for (const value of Object.values(TEST_VALUES)) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain("${input:bb-api-key}");
    const parsed = JSON.parse(text) as { servers: Record<string, unknown>; inputs: unknown[] };
    expect(Object.keys(parsed.servers)).toEqual([SERVER_NAME]);
    expect(parsed.inputs).toHaveLength(3);
  });

  it("benutzt den Wrapper-Schlüssel servers und nicht mcpServers", () => {
    const preview = vscodeAdapter.preview(
      buildPlan({ launch: launch(), scope: "project" }),
      makeHost(),
    );

    expect(preview.block).toContain('"servers"');
    expect(preview.block).not.toContain("mcpServers");
  });
});

describe("Nur ausgeben: Zed, Continue, Jan", () => {
  it("schreibt nichts und sagt, warum", () => {
    const host = makeHost();
    for (const adapter of [zedAdapter, continueAdapter, janAdapter]) {
      const outcome = adapter.apply(buildPlan({ launch: launch() }), host);
      expect(outcome.kind).toBe("manual");
      if (outcome.kind === "manual") {
        expect(outcome.reason.length).toBeGreaterThan(20);
      }
    }
    expect(fs.existsSync(path.join(root, "home", ".config"))).toBe(false);
  });

  it("setzt bei Zed den eigenen Wrapper-Schlüssel", () => {
    const preview = zedAdapter.preview(buildPlan({ launch: launch() }), makeHost());
    expect(preview.block).toContain("context_servers");
  });

  it("setzt den Paketnamen in Continues YAML in Anführungszeichen", () => {
    const preview = continueAdapter.preview(buildPlan({ launch: launch() }), makeHost());
    expect(preview.block).toContain('- "@dennismenken/buchhaltungsbutler-mcp"');
    expect(preview.format).toBe("yaml");
  });
});

describe("Vorschau", () => {
  it("zeigt nie einen Wert, sondern Platzhalter oder eine Begründung", () => {
    const host = makeHost();
    const plan = buildPlan({ launch: launch(), credentials: placeholderCredentials() });

    for (const adapter of ALL_ADAPTERS) {
      const preview = adapter.preview(plan, host);
      for (const value of Object.values(TEST_VALUES)) {
        expect(preview.block).not.toContain(value);
      }
      const carriesPlaceholder = preview.block.includes("PLATZHALTER_API_CLIENT");
      const explains =
        preview.notes.some((note) => note.length > 0) || preview.block.includes("${input:");
      expect(carriesPlaceholder || explains).toBe(true);
    }
  });

  it("nennt für jeden Adapter einen Ort oder den Weg über die Oberfläche", () => {
    const host = makeHost();
    for (const adapter of ALL_ADAPTERS) {
      const preview = adapter.preview(buildPlan({ launch: launch() }), host);
      expect(preview.pathNote.length).toBeGreaterThan(10);
    }
  });
});
