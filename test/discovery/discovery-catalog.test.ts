// Vertragstest D1 a) und b): der Katalog der Gateways.
//
// a) Jedes Werkzeug aktiver Gruppen ist über seinen exakten Namen als Treffer 1
//    auffindbar; die Übersicht zählt je Gruppe wie das Register; group listet
//    vollständig; abgeschaltete Gruppen fehlen.
// b) Vier Suchanfragen aus dem Alltag einer Buchhalterin treffen die gemeinten
//    Werkzeuge vorn.

import { afterEach, describe, expect, it } from "vitest";

import { TOOL_GROUP_NAMES } from "../../src/registry/groups.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import { EXPECTED_TOOL_CLASSES } from "../registry/class-list.js";
import {
  startDiscoveryServer,
  structuredOf,
  textOf,
  type RunningDiscoveryServer,
} from "../helpers/discovery.js";
import { mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

let api: ApiMock;
let server: RunningDiscoveryServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  api?.close();
  resetTestConfig();
});

interface CatalogTool {
  readonly name: string;
  readonly title: string;
  readonly class: string;
  readonly invokeVia: string;
  readonly summary: string;
}

function toolsOf(result: { structuredContent?: unknown }): CatalogTool[] {
  const structured = structuredOf(result);
  if (!Array.isArray(structured.tools)) {
    throw new Error("Die Antwort trägt keine Werkzeugliste.");
  }
  return structured.tools as CatalogTool[];
}

describe("D1 a) der Katalog", () => {
  it("findet jedes der 61 Werkzeuge über seinen exakten Namen als Treffer 1", async () => {
    expect(TOOL_ENTRIES).toHaveLength(61);
    api = mockApi();
    server = await startDiscoveryServer();

    const problems: string[] = [];
    for (const entry of TOOL_ENTRIES) {
      const result = await server.client.callTool({
        name: "bb_tools_discover",
        arguments: { query: entry.name },
      });
      const tools = toolsOf(result);
      if (tools[0]?.name !== entry.name) {
        problems.push(`${entry.name}: Treffer 1 ist ${tools[0]?.name ?? "keiner"}.`);
      }
    }
    expect(problems.join("\n")).toBe("");
  }, 30_000);

  it("zählt die Übersicht je Gruppe wie das Register", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({ name: "bb_tools_discover", arguments: {} });
    const structured = structuredOf(result);
    expect(structured.success).toBe(true);
    expect(structured.mode).toBe("overview");
    const groups = structured.groups as { group: string; tools: number }[];
    for (const group of TOOL_GROUP_NAMES.filter((name) => name !== "bundles")) {
      const expected = TOOL_ENTRIES.filter((entry) => entry.group === group).length;
      const listed = groups.find((item) => item.group === group);
      expect(listed, `Gruppe ${group} fehlt in der Übersicht`).toBeDefined();
      expect(listed?.tools).toBe(expected);
    }
    const counted = groups.reduce((sum, item) => sum + item.tools, 0);
    expect(counted).toBe(TOOL_ENTRIES.length);
  });

  it("listet mit group alle Werkzeuge der Gruppe vollständig", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const problems: string[] = [];
    for (const group of TOOL_GROUP_NAMES.filter((name) => name !== "bundles")) {
      const expected = TOOL_ENTRIES.filter((entry) => entry.group === group).map(
        (entry) => entry.name,
      );
      const result = await server.client.callTool({
        name: "bb_tools_discover",
        arguments: { group },
      });
      const structured = structuredOf(result);
      const names = toolsOf(result).map((tool) => tool.name);
      if (structured.mode !== "group") {
        problems.push(`${group}: Modus ist ${String(structured.mode)} statt group.`);
      }
      if (names.join(",") !== expected.join(",")) {
        problems.push(`${group}: [${names.join(",")}] statt [${expected.join(",")}].`);
      }
      // Jeder Eintrag nennt den zuständigen Aufrufweg, und er stimmt mit der Klasse.
      for (const tool of toolsOf(result)) {
        const toolClass = EXPECTED_TOOL_CLASSES[tool.name as keyof typeof EXPECTED_TOOL_CLASSES];
        if (tool.class !== toolClass) {
          problems.push(`${tool.name}: Klasse ${tool.class} statt ${toolClass}.`);
        }
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("kennt abgeschaltete Gruppen nicht", async () => {
    api = mockApi();
    server = await startDiscoveryServer({ BB_MCP_TOOL_GROUPS: "receipts" });

    const overview = structuredOf(
      await server.client.callTool({ name: "bb_tools_discover", arguments: {} }),
    );
    const groups = overview.groups as { group: string }[];
    expect(groups.map((item) => item.group)).toEqual(["receipts"]);

    // Die Gruppe steht nicht im Eingabeschema dieser Installation: Die Absage nennt den
    // übergebenen Wert und den erlaubten Vorrat, und es geht nichts hinaus.
    const refused = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { group: "postings" },
    });
    expect(refused.isError).toBe(true);
    const text = textOf(refused);
    expect(text).toContain("postings");
    expect(text).toContain("receipts");
    expect(structuredOf(refused).success).toBe(false);
    expect(api.count()).toBe(0);
  });

  it("nennt die abgeschaltete Gruppe mit der Variablen, wenn kein Enum sie ausschließt", async () => {
    // Unter BB_MCP_TOOL_GROUPS=bundles ist keine Endpunktgruppe aktiv; das Eingabeschema
    // zählt dann keine auf, und der Handler meldet die abgeschaltete Gruppe beim Namen.
    api = mockApi();
    server = await startDiscoveryServer({ BB_MCP_TOOL_GROUPS: "bundles" });

    const overview = structuredOf(
      await server.client.callTool({ name: "bb_tools_discover", arguments: {} }),
    );
    expect(overview.groups).toEqual([]);

    const refused = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { group: "postings" },
    });
    expect(refused.isError).toBe(true);
    const text = textOf(refused);
    expect(text).toContain("postings");
    expect(text).toContain("BB_MCP_TOOL_GROUPS");
    expect(api.count()).toBe(0);
  });
});

describe("D1 b) die Stichwortsuche", () => {
  it("stellt Debitor löschen auf Platz 1", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { query: "Debitor löschen" },
    });
    expect(toolsOf(result)[0]?.name).toBe("bb_debtors_delete");
  });

  it("stellt Rechnungskorrektur auf Platz 1", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { query: "Rechnungskorrektur" },
    });
    expect(toolsOf(result)[0]?.name).toBe("bb_invoices_create_correction");
  });

  it("nennt Beleg hochladen unter den ersten 3", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { query: "Beleg hochladen" },
    });
    const names = toolsOf(result).map((tool) => tool.name);
    expect(names.slice(0, 3)).toContain("bb_receipts_upload");
  });

  it("nennt Kostenstelle anlegen unter den ersten 3", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { query: "Kostenstelle anlegen" },
    });
    const names = toolsOf(result).map((tool) => tool.name);
    expect(names.slice(0, 3)).toContain("bb_cost_locations_create");
  });

  it("sagt es und liefert die Übersicht, wenn nichts trifft", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: "bb_tools_discover",
      arguments: { query: "Flugdrachen versichern" },
    });
    const structured = structuredOf(result);
    expect(structured.success).toBe(true);
    expect(structured.mode).toBe("search");
    expect(structured.tools).toEqual([]);
    expect(textOf(result)).toContain("Keine Treffer");
    expect(Array.isArray(structured.groups)).toBe(true);
    expect(api.count()).toBe(0);
  });
});
