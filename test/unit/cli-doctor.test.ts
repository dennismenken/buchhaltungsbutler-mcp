import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUNDLE_TOOL_COUNT } from "../../src/bundles/register.js";
import { countByEffect, definitionSizeLines, runDoctor } from "../../src/cli/doctor.js";
import { createClientHost, type ClientHost } from "../../src/cli/clients/types.js";
import { createScriptedTerminal, type ScriptedTerminal } from "../../src/cli/prompt.js";
import { TEST_ENDPOINT } from "../../src/cli/test.js";
import { CHARS_PER_TOKEN } from "../../src/registry/budget.js";
import {
  MEASURED_TOOL_DEFINITION_CHARS,
  MEASURED_TOOL_DEFINITION_TOKENS,
  measureToolDefinitionChars,
  toolDefinitionJson,
} from "../../src/registry/definition.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import {
  mockApi,
  resetTestConfig,
  TEST_BASE_URL,
  TEST_CREDENTIALS,
  type ApiMock,
} from "../helpers/mock-api.js";
import { definitionJson, ROOT as PROJECT_ROOT, tokenCount } from "../helpers/registry-fixtures.js";

// `doctor`. Der wichtigste Satz dieser Datei: Die Ausgabe enthält kein
// Geheimnis. Alles Übrige ist Diagnose, und die darf in einen Fehlerbericht.

let root: string;
let api: ApiMock;
let terminal: ScriptedTerminal;

function baseEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: "",
    BB_BASE_URL: TEST_BASE_URL,
    BB_CONFIG_DIR: path.join(root, "config"),
    ...extra,
  };
}

function makeHost(env: NodeJS.ProcessEnv): ClientHost {
  const base = createClientHost({
    env,
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-doctor-"));
  fs.mkdirSync(path.join(root, "home"), { recursive: true });
  fs.mkdirSync(path.join(root, "projekt"), { recursive: true });
  api = mockApi();
  terminal = createScriptedTerminal([]);
});

afterEach(() => {
  api.close();
  resetTestConfig();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("runDoctor", () => {
  it("endet ohne Zugangsdaten mit 1, nennt die fehlenden Werte und setzt keinen Aufruf ab", async () => {
    const env = baseEnv();

    const code = await runDoctor({ argv: [], terminal, host: makeHost(env), env });

    expect(code).toBe(1);
    const text = terminal.text();
    expect(text).toContain("Es fehlen: BB_API_CLIENT, BB_API_SECRET, BB_API_KEY.");
    expect(text).toContain("Der Verbindungstest entfällt");
    expect(api.count()).toBe(0);
  });

  it("nennt Paket, Node, Plattform und Basis-URL", async () => {
    const env = baseEnv();

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const text = terminal.text();
    expect(text).toContain("@dennismenken/buchhaltungsbutler-mcp");
    expect(text).toContain(process.versions.node);
    expect(text).toContain(TEST_BASE_URL);
  });

  it("nennt die Schalterlage vollständig", async () => {
    const env = baseEnv({ BB_MCP_READ_ONLY: "true", BB_MCP_MAX_BATCH: "10" });

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const text = terminal.text();
    for (const name of [
      "BB_MCP_READ_ONLY",
      "BB_MCP_MAX_BATCH",
      "BB_MCP_MAX_AMOUNT",
      "BB_MCP_CACHE_TTL_MS",
      "BB_MCP_DUPLICATE_CHECK",
    ]) {
      expect(text).toContain(name);
    }
    expect(text).toContain("true, nur lesende Werkzeuge");
    expect(text).toContain("BB_MCP_MAX_BATCH:       10");
  });

  it("zählt die Werkzeuge nach Wirkung und nennt die Größe der Definitionen", async () => {
    const env = baseEnv();

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const counts = countByEffect(TOOL_ENTRIES);
    const sum = counts.read + counts.create + counts.modify + counts.delete;
    expect(sum).toBe(TOOL_ENTRIES.length);

    const text = terminal.text();
    // Die genannte Zahl ist die der tools/list-Antwort: Endpunktwerkzeuge UND Bündel. Die
    // Aufschlüsselung nach Wirkung bleibt bei den Endpunktwerkzeugen und sagt das.
    expect(text).toContain(
      `Registriert: ${String(TOOL_ENTRIES.length + BUNDLE_TOOL_COUNT)} — ` +
        `${String(TOOL_ENTRIES.length)} Endpunktwerkzeuge und ` +
        `${String(BUNDLE_TOOL_COUNT)} Bündelwerkzeuge.`,
    );
    expect(text).toContain(`Die Endpunktwerkzeuge nach Wirkung: ${String(counts.read)} lesend`);
    expect(text).toContain("Die Bündelwerkzeuge sind darin nicht enthalten.");
    expect(text).toContain(MEASURED_TOOL_DEFINITION_CHARS.toLocaleString("de-DE"));
    expect(text).toContain(MEASURED_TOOL_DEFINITION_TOKENS.toLocaleString("de-DE"));
    expect(text).toContain("pnpm measure-tokens");
  });

  it("zählt die Bündel mit, wenn der Gruppenschalter nur sie übrig lässt", async () => {
    // Der gemessene Befund vor der Behebung: doctor meldete hier „Registriert: 0 von 54 — 0
    // lesend, 0 anlegend, 0 ändernd, 0 löschend", während tools/list fünf Werkzeuge auslieferte.
    const env = baseEnv({ BB_MCP_TOOL_GROUPS: "bundles" });

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const text = terminal.text();
    expect(text).toContain(
      `Registriert: ${String(BUNDLE_TOOL_COUNT)} von ` +
        `${String(TOOL_ENTRIES.length + BUNDLE_TOOL_COUNT)} — kein Endpunktwerkzeug und ` +
        `${String(BUNDLE_TOOL_COUNT)} Bündelwerkzeuge.`,
    );
    expect(text).not.toContain("Registriert: 0 ");
    // Die Rückmeldung zum Gruppenschalter nennt dieselbe Zahl wie die Zeile darüber.
    expect(text).toContain(`Registriert: ${String(BUNDLE_TOOL_COUNT)} Werkzeuge`);
  });

  it("nennt bei abgeschalteten Bündeln nur die Endpunktwerkzeuge", async () => {
    const env = baseEnv({ BB_MCP_TOOL_GROUPS_EXCLUDE: "bundles" });

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const text = terminal.text();
    expect(text).toContain(
      `Registriert: ${String(TOOL_ENTRIES.length)} von ` +
        `${String(TOOL_ENTRIES.length + BUNDLE_TOOL_COUNT)} — ` +
        `${String(TOOL_ENTRIES.length)} Endpunktwerkzeuge und kein Bündelwerkzeug.`,
    );
  });

  it("nennt eine unbekannte BB_-Variable mit dem nächstähnlichen bekannten Namen", async () => {
    const env = baseEnv({ BB_MCP_READ_ONLI: "true" });

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const text = terminal.text();
    expect(text).toContain("BB_MCP_READ_ONLI");
    expect(text).toContain("BB_MCP_READ_ONLY");
  });

  it("listet die zehn Adapter mit Pfad oder Begründung auf", async () => {
    const env = baseEnv();

    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const text = terminal.text();
    for (const label of ["Claude Code", "Claude Desktop", "Cursor", "Zed", "Jan"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("ChatGPT im Browser kann keinen lokalen MCP-Server einbinden");
  });

  it("führt mit Zugangsdaten den Verbindungstest aus und endet mit 0", async () => {
    const env = baseEnv({ ...TEST_CREDENTIALS });
    api.post(TEST_ENDPOINT, {
      json: { success: true, rows: 1, data: [{ name: "Bank", postingaccount_number: "1200" }] },
    });

    const code = await runDoctor({ argv: [], terminal, host: makeHost(env), env });

    expect(code).toBe(0);
    expect(api.count(TEST_ENDPOINT)).toBe(1);
    expect(terminal.text()).toContain("Verbindung steht");
  });

  it("gibt kein Zugangsdatum aus, auch nicht gekürzt", async () => {
    const env = baseEnv({ ...TEST_CREDENTIALS });
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 0, data: [] } });

    await runDoctor({ argv: [], terminal, host: makeHost(env), env });

    const everything = `${terminal.text()}\n${terminal.errorLines.join("\n")}`;
    for (const value of Object.values(TEST_CREDENTIALS)) {
      expect(everything).not.toContain(value);
    }
    expect(everything).toContain("Zugangsdaten: aus den Umgebungsvariablen.");
  });

  it("meldet die Rechte der Zugangsdatendatei, wenn sie zu weit sind", async () => {
    const configDir = path.join(root, "config");
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    const file = path.join(configDir, "credentials.json");
    fs.writeFileSync(file, JSON.stringify({ version: 1, profiles: {} }));
    fs.chmodSync(file, 0o644);
    const env = baseEnv({ ...TEST_CREDENTIALS });
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 0, data: [] } });

    await runDoctor({ argv: [], terminal, host: makeHost(env), env });

    expect(terminal.text()).toContain("Dateirechte:");
    expect(terminal.text()).toContain("chmod 600");
  });

  it("weist ein Argument zurück, das es nicht gibt", async () => {
    const env = baseEnv();

    expect(await runDoctor({ argv: ["alles"], terminal, host: makeHost(env), env })).toBe(2);
  });
});

describe("definitionSizeLines", () => {
  it("zählt die vollständige Definition und nennt die gemessene Tokenzahl", () => {
    const [counted, tokenLine] = definitionSizeLines(TOOL_ENTRIES);

    expect(counted).toContain(MEASURED_TOOL_DEFINITION_CHARS.toLocaleString("de-DE"));
    expect(counted).toContain("Eingabe- und Ausgabeschema");
    expect(tokenLine).toContain(MEASURED_TOOL_DEFINITION_TOKENS.toLocaleString("de-DE"));
    expect(tokenLine).toContain("gemessen mit gpt-tokenizer");
  });

  it("weist die Tokenzahl als Schätzung aus, sobald der Registerstand ein anderer ist", () => {
    const [counted, tokenLine] = definitionSizeLines(TOOL_ENTRIES.slice(0, 10));

    const chars = measureToolDefinitionChars(TOOL_ENTRIES.slice(0, 10));
    expect(chars).toBeLessThan(MEASURED_TOOL_DEFINITION_CHARS);
    expect(counted).toContain(chars.toLocaleString("de-DE"));
    expect(tokenLine).toContain("geschätzt rund");
    expect(tokenLine).toContain(Math.round(chars / CHARS_PER_TOKEN).toLocaleString("de-DE"));
    expect(tokenLine).toContain("pnpm measure-tokens zieht sie nach");
  });
});

// Der Zahlenabgleich. Er ist die Lehre aus einem echten Fehler: `doctor` zählte einmal nur
// Name, Titel, Beschreibung und Feldtexte und nannte deshalb 104.779 Zeichen und rund 26.195
// Token, während der Client nach der Messung vom 2026-09-12 197.528 Zeichen und 48.305 Token
// bekam — 46 Prozent zu wenig, und im Widerspruch zur eigenen README. Den jeweils aktuellen
// Stand nennen MEASURED_TOOL_DEFINITION_CHARS und MEASURED_TOOL_DEFINITION_TOKENS. Diese
// Prüfung hält alle Stellen gegeneinander, an denen die Zahl steht: die Messgrundlage von
// P11, die eingecheckten Werte, die Ausgabe von
// `doctor`, CHANGELOG.md und Abschnitt 17 der README.
describe("Zahlenabgleich der Tokenangaben", () => {
  const definitions = TOOL_ENTRIES.map((entry) => toolDefinitionJson(entry));
  const chars = definitions.reduce((sum, json) => sum + json.length, 0);
  const tokens = definitions.reduce((sum, json) => sum + tokenCount(json), 0);

  it("misst dieselben Definitionen wie P11", () => {
    TOOL_ENTRIES.forEach((entry, index) => {
      expect(definitions[index]).toBe(definitionJson(entry));
    });
    expect(measureToolDefinitionChars(TOOL_ENTRIES)).toBe(chars);
  });

  it("hält die eingecheckten Werte auf dem gemessenen Stand", () => {
    expect(
      chars,
      "Die Werkzeugdefinitionen haben sich geändert. MEASURED_TOOL_DEFINITION_CHARS in src/registry/definition.ts nachziehen, pnpm measure-tokens laufen lassen und die Zahlen in README, CHANGELOG.md und docs/entwicklung/tokenbudget.md anpassen.",
    ).toBe(MEASURED_TOOL_DEFINITION_CHARS);
    expect(
      tokens,
      "Die Tokenzahl der Werkzeugdefinitionen hat sich geändert. MEASURED_TOOL_DEFINITION_TOKENS in src/registry/definition.ts nachziehen, pnpm measure-tokens laufen lassen und die Zahlen in README, CHANGELOG.md und docs/entwicklung/tokenbudget.md anpassen.",
    ).toBe(MEASURED_TOOL_DEFINITION_TOKENS);
  });

  it("nennt in doctor, CHANGELOG und README dieselbe Zahl", async () => {
    const env = baseEnv();
    await runDoctor({ argv: ["--skip-connection-test"], terminal, host: makeHost(env), env });

    const measured = tokens.toLocaleString("de-DE");
    const rounded = (Math.round(tokens / 1_000) * 1_000).toLocaleString("de-DE");

    expect(terminal.text()).toContain(measured);
    expect(fs.readFileSync(path.join(PROJECT_ROOT, "CHANGELOG.md"), "utf8")).toContain(measured);

    // Die README nennt die Größenordnung und nicht die Stelle: „rund 48.000 Token". Geprüft
    // wird deshalb der auf Tausender gerundete Messwert — wandert er, wandert die README mit.
    const readme = fs.readFileSync(path.join(PROJECT_ROOT, "README.md"), "utf8");
    expect(
      readme,
      `README.md nennt nicht "rund ${rounded} Token". Abschnitt 16 und Abschnitt 17 führen die Kontextkosten; der gemessene Stand sind ${measured} Token.`,
    ).toContain(`rund ${rounded} Token`);
  });
});
