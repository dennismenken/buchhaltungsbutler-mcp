// Vertragstest D1 d) bis g): der Aufruf über die Gateways.
//
// d) Falsches Aufrufwerkzeug: isError, nennt das richtige, 0 Requests.
// e) Ungültige Argumente: isError, 0 Requests, mit dem Eingabeschema des Ziels.
// f) Gleichheit: structuredContent über das Gateway gleicht dem direkten Modus.
// g) Nur-Lesen: invoke_write lehnt mit demselben Text ab wie das Werkzeug im
//    direkten Modus; describe nennt die Sperre.

import { afterEach, describe, expect, it } from "vitest";

import { STATE_NOTHING_SENT } from "../../src/errors/render.js";
import { READ_ONLY_VAR } from "../../src/guards/read-only.js";
import {
  DESCRIBE_TOOL,
  INVOKE_DESTRUCTIVE_TOOL,
  INVOKE_READ_TOOL,
  INVOKE_WRITE_TOOL,
} from "../../src/server/discovery.js";
import { loadGolden } from "../golden/index.js";
import {
  startDiscoveryServer,
  startTestServer,
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

describe("D1 d) falsches Aufrufwerkzeug", () => {
  it("lehnt ab, nennt das richtige und setzt keinen Request ab", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const cases = [
      { gateway: INVOKE_WRITE_TOOL, name: "bb_receipts_search", correct: INVOKE_READ_TOOL },
      { gateway: INVOKE_READ_TOOL, name: "bb_cost_locations_create", correct: INVOKE_WRITE_TOOL },
      {
        gateway: INVOKE_WRITE_TOOL,
        name: "bb_cost_locations_delete",
        correct: INVOKE_DESTRUCTIVE_TOOL,
      },
      { gateway: INVOKE_DESTRUCTIVE_TOOL, name: "bb_invoices_create", correct: INVOKE_WRITE_TOOL },
      {
        gateway: INVOKE_READ_TOOL,
        name: "bb_cost_locations_update",
        correct: INVOKE_DESTRUCTIVE_TOOL,
      },
      {
        gateway: INVOKE_READ_TOOL,
        name: "bb_reports_create_bwa",
        correct: INVOKE_DESTRUCTIVE_TOOL,
      },
    ] as const;
    const problems: string[] = [];
    for (const { gateway, name, correct } of cases) {
      const result = await server.client.callTool({
        name: gateway,
        arguments: { name, arguments: {} },
      });
      const text = textOf(result);
      if (result.isError !== true) {
        problems.push(`${gateway}/${name}: kein Fehler.`);
      }
      if (!text.includes(correct)) {
        problems.push(`${gateway}/${name}: nennt nicht ${correct}.`);
      }
      if (!text.includes(STATE_NOTHING_SENT)) {
        problems.push(`${gateway}/${name}: ohne Zustandssatz.`);
      }
    }
    expect(problems.join("\n")).toBe("");
    expect(api.count()).toBe(0);
  }, 30_000);
});

describe("D1 e) ungültige Argumente", () => {
  it("lehnt ohne Request ab und liefert das Eingabeschema des Ziels", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: INVOKE_READ_TOOL,
      arguments: { name: "bb_receipts_search", arguments: { list_direction: "eingehend" } },
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    // Dieselbe Darstellung wie im direkten Modus: deutscher Befund mit übergebenem Wert.
    expect(text).toContain("list_direction: erlaubt sind 'inbound' und 'outbound'");
    expect(text).toContain("übergeben wurde die Zeichenkette");
    expect(text).toContain(STATE_NOTHING_SENT);
    // Plus das Eingabeschema des Ziels als Datum.
    const structured = structuredOf(result);
    expect(structured.success).toBe(false);
    const inputSchema = structured.inputSchema as Record<string, unknown>;
    expect(inputSchema.type).toBe("object");
    const properties = inputSchema.properties as Record<string, unknown>;
    expect(properties.list_direction).toBeDefined();
    expect(api.count()).toBe(0);
  });

  it("meldet ein fehlendes Pflichtfeld wie der direkte Modus", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    const result = await server.client.callTool({
      name: INVOKE_READ_TOOL,
      arguments: { name: "bb_receipts_search", arguments: {} },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("list_direction");
    expect(textOf(result)).toContain("das Feld fehlt");
    expect(api.count()).toBe(0);
  });
});

describe("D1 f) Gleichheit mit dem direkten Modus", () => {
  // Je Fall: derselbe Mock, derselbe Aufruf — einmal direkt, einmal über das Gateway.
  const cases = [
    {
      golden: "receipts-get-list",
      tool: "bb_receipts_search",
      gateway: INVOKE_READ_TOOL,
      path: "/receipts/get",
      args: { list_direction: "inbound" },
    },
    {
      golden: "receipts-get-single",
      tool: "bb_receipts_get",
      gateway: INVOKE_READ_TOOL,
      path: "/receipts/get/4711",
      args: { receipt_id_by_customer: 4711 },
    },
    {
      golden: "postings-add-free-ack",
      tool: "bb_postings_create_free",
      gateway: INVOKE_WRITE_TOOL,
      path: "/postings/add/free",
      args: {
        date: "2026-01-15",
        postingtext: "Vertragstest",
        amount: "119.00",
        postingaccount_debit: "6815",
        postingaccount_credit: "1600",
        vat: "19_vat",
      },
    },
    {
      golden: "debtors-update-success",
      tool: "bb_debtors_update",
      gateway: INVOKE_DESTRUCTIVE_TOOL,
      path: "/settings/update/debtor",
      args: { postingaccount_number: 10001, name: "Erfundene Kundin GmbH", city: "Musterstadt" },
    },
  ] as const;

  for (const { golden, tool, gateway, path, args } of cases) {
    it(`${golden}: dieselbe Antwort über ${gateway} wie direkt`, async () => {
      const goldenFile = loadGolden(golden);
      api = mockApi();
      api.post(path, { status: goldenFile.http.status, json: goldenFile.body });

      const direct = await startTestServer();
      try {
        const directResult = await direct.client.callTool({ name: tool, arguments: { ...args } });
        expect(directResult.isError, `direkt scheiterte: ${textOf(directResult)}`).toBeFalsy();
        const directStructured = structuredOf(directResult);
        const directText = textOf(directResult);
        await direct.close();

        api = mockApi();
        api.post(path, { status: goldenFile.http.status, json: goldenFile.body });
        server = await startDiscoveryServer();
        try {
          const gatewayResult = await server.client.callTool({
            name: gateway,
            arguments: { name: tool, arguments: { ...args } },
          });
          expect(gatewayResult.isError, `Gateway scheiterte: ${textOf(gatewayResult)}`).toBeFalsy();
          expect(structuredOf(gatewayResult)).toEqual(directStructured);
          expect(textOf(gatewayResult)).toBe(directText);
        } finally {
          await server.close();
          server = null;
        }
      } finally {
        await direct.close();
      }
    }, 30_000);
  }
});

describe("D1 g) Nur-Lesen", () => {
  it("lehnt invoke_write mit demselben Text ab wie das Werkzeug im direkten Modus", async () => {
    api = mockApi();
    const direct = await startTestServer({ BB_MCP_READ_ONLY: "true" });
    const directText = textOf(
      await direct.client.callTool({ name: "bb_cost_locations_create", arguments: {} }),
    );
    await direct.close();
    resetTestConfig();

    server = await startDiscoveryServer({ BB_MCP_READ_ONLY: "true" });
    const result = await server.client.callTool({
      name: INVOKE_WRITE_TOOL,
      arguments: { name: "bb_cost_locations_create", arguments: {} },
    });
    expect(result.isError).toBe(true);
    // Derselbe Text: Variablenname mit Zielwert, Zustandssatz, kein Umgehungsversuch.
    expect(textOf(result)).toBe(directText);
    expect(textOf(result)).toContain(`${READ_ONLY_VAR}=true`);
    expect(textOf(result)).toContain(STATE_NOTHING_SENT);
    expect(api.count()).toBe(0);
  });

  it("nennt describe die Sperre bei schreibenden Werkzeugen", async () => {
    api = mockApi();
    server = await startDiscoveryServer({ BB_MCP_READ_ONLY: "true" });

    const result = await server.client.callTool({
      name: DESCRIBE_TOOL,
      arguments: { names: ["bb_cost_locations_create", "bb_cost_locations_search"] },
    });
    const structured = structuredOf(result);
    expect(structured.success).toBe(true);
    const tools = structured.tools as Record<string, unknown>[];
    const writing = tools.find((tool) => tool.name === "bb_cost_locations_create");
    const reading = tools.find((tool) => tool.name === "bb_cost_locations_search");
    expect(String(writing?.readOnlyNote)).toContain(`${READ_ONLY_VAR}=true`);
    expect(textOf(result)).toContain(`${READ_ONLY_VAR}=true`);
    expect(reading).not.toContain("readOnlyNote");
    expect(api.count()).toBe(0);
  });

  it("lässt lesende Ziele weiter laufen", async () => {
    api = mockApi();
    api.post("/receipts/get", {
      json: { success: true, message: "", rows: 0, data: [] },
    });
    server = await startDiscoveryServer({ BB_MCP_READ_ONLY: "true" });

    const result = await server.client.callTool({
      name: INVOKE_READ_TOOL,
      arguments: { name: "bb_receipts_search", arguments: { list_direction: "inbound" } },
    });
    expect(result.isError, `scheiterte: ${textOf(result)}`).toBeFalsy();
    expect(api.count("/receipts/get")).toBe(1);
  });
});
