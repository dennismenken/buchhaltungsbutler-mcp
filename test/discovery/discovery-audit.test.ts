// Die Audit-Zeilen des Discovery-Modus: Jeder `bb_tools_discover`- und
// `bb_tools_describe`-Aufruf schreibt je eine Zeile im vorhandenen Format — Ausgang `ok`
// beziehungsweise `abgelehnt` mit Grund. Das `gateway=`-Feld steht nur dabei, wenn Ziel
// und Gateway verschieden sind; bei einer gateway-eigenen Absage entfällt es.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DESCRIBE_TOOL,
  DISCOVER_TOOL,
  INVOKE_READ_TOOL,
  INVOKE_WRITE_TOOL,
} from "../../src/server/discovery.js";
import { startDiscoveryServer, type RunningDiscoveryServer } from "../helpers/discovery.js";
import { mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

let api: ApiMock;
let server: RunningDiscoveryServer | null = null;
let stderrChunks: string[] = [];

/** Die Audit-Zeilen aus dem stderr-Mitschnitt, ohne alles andere. */
function auditLines(): string[] {
  return stderrChunks
    .join("")
    .split("\n")
    .filter((line) => line.includes("audit "));
}

beforeEach(() => {
  stderrChunks = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = null;
  api?.close();
  resetTestConfig();
});

describe("Audit-Zeilen von discover und describe", () => {
  it("schreibt je discover-Aufruf eine ok-Zeile ohne Gateway-Feld", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    await server.client.callTool({ name: DISCOVER_TOOL, arguments: {} });

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(`werkzeug=${DISCOVER_TOOL}`);
    expect(lines[0]).toContain("ergebnis=ok");
    expect(lines[0]).not.toContain("gateway=");
  });

  it("schreibt je describe-Aufruf eine ok-Zeile, auch bei Teilerfolg", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: DESCRIBE_TOOL,
      arguments: { names: ["bb_receipts_search", "gibt_es_nicht"] },
    });
    expect(result.isError).not.toBe(true);

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(`werkzeug=${DESCRIBE_TOOL}`);
    expect(lines[0]).toContain("ergebnis=ok");
    expect(lines[0]).not.toContain("gateway=");
  });

  it("nennt bei nur unbekannten Namen den Grund unbekannt", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: DESCRIBE_TOOL,
      arguments: { names: ["gibt_es_nicht"] },
    });
    expect(result.isError).toBe(true);

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(`werkzeug=${DESCRIBE_TOOL}`);
    expect(lines[0]).toContain("ergebnis=abgelehnt:unbekannt");
  });

  it("nennt bei nur abgeschalteten Namen den Grund deaktiviert", async () => {
    api = mockApi();
    server = await startDiscoveryServer({ BB_MCP_TOOL_GROUPS_EXCLUDE: "receipts" });

    const result = await server.client.callTool({
      name: DESCRIBE_TOOL,
      arguments: { names: ["bb_receipts_search"] },
    });
    expect(result.isError).toBe(true);

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("ergebnis=abgelehnt:deaktiviert");
  });

  it("nennt bei gemischtem Scheitern den Grund gemischt", async () => {
    api = mockApi();
    server = await startDiscoveryServer({ BB_MCP_TOOL_GROUPS_EXCLUDE: "receipts" });

    const result = await server.client.callTool({
      name: DESCRIBE_TOOL,
      arguments: { names: ["gibt_es_nicht", "bb_receipts_search"] },
    });
    expect(result.isError).toBe(true);

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("ergebnis=abgelehnt:gemischt");
  });
});

describe("das Gateway-Feld der Audit-Zeile", () => {
  it("nennt Ziel und Gateway bei verschiedenen Namen", async () => {
    api = mockApi();
    server = await startDiscoveryServer({ BB_MCP_READ_ONLY: "true" });

    // Die Guard-Absage läuft mit der Laufzeit des Ziels: Die Zeile nennt das Ziel
    // und zusätzlich das Gateway, über das der Aufruf lief.
    await server.client.callTool({
      name: INVOKE_WRITE_TOOL,
      arguments: { name: "bb_cost_locations_create", arguments: {} },
    });

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("werkzeug=bb_cost_locations_create");
    expect(lines[0]).toContain(`gateway=${INVOKE_WRITE_TOOL}`);
    expect(lines[0]).toContain("ergebnis=abgelehnt:nur-lesen");
  });

  it("lässt das Gateway-Feld bei einer gateway-eigenen Absage weg", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    // Die Schema-Absage des Gateways selbst: Ziel und Gateway sind derselbe Name,
    // also steht er nur einmal in der Zeile.
    await server.client.callTool({
      name: DISCOVER_TOOL,
      arguments: { group: "bundles" },
    });

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(`werkzeug=${DISCOVER_TOOL}`);
    expect(lines[0]).not.toContain("gateway=");
    expect(lines[0]).toContain("ergebnis=abgelehnt:schema");
  });

  it("lässt das Gateway-Feld bei einer Zuständigkeitsabsage weg", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    await server.client.callTool({
      name: INVOKE_READ_TOOL,
      arguments: { name: "bb_cost_locations_create", arguments: {} },
    });

    const lines = auditLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(`werkzeug=${INVOKE_READ_TOOL}`);
    expect(lines[0]).not.toContain("gateway=");
    expect(lines[0]).toContain("ergebnis=abgelehnt:zuständigkeit");
  });
});
