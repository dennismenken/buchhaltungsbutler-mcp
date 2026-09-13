// Der Stammdatenspeicher im Ausführungspfad (Plan 1.4 Zwischenschritt, 7.8; AP10,
// Prüfpunkt 6).
//
// Das Modul selbst gehört AP09 und wird hier nur aufgerufen. Geprüft wird, was der Handler
// damit tut: **befragen** nach allen Guards und vor dem Rate-Limiter, **füllen** nach einer
// erfolgreichen Antwort, **verwerfen** nach jedem Aufruf, der in `invalidatesCache` steht, und
// ebenso bei ungewissem Ausgang.
//
// Der wichtigste Fall ist der Auslieferungszustand: Bei `BB_MCP_CACHE_TTL_MS=0` greift **kein**
// Zweig davon, und jeder Aufruf geht hinaus.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { boundedText } from "../../src/schema/primitives.js";
import { limit, offset } from "../../src/schema/pagination.js";
import { postingAccountNumber, responseFormat } from "../../src/schema/vocab.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// --- Fixtures -------------------------------------------------------------------------
//
// `bb_debtors_search` ist eines der vier speicherfähigen Werkzeuge aus 7.8, und
// `bb_debtors_create` eines der drei, die seinen Stand verwerfen.

const SEARCH_ENTRY: ToolEntry = {
  name: "bb_debtors_search",
  title: "Debitoren suchen",
  path: { literal: "/settings/get/debtors" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description: "Listet die Debitoren des Mandanten.",
  fields: [
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      // Für /settings/get/debtors ist keine Obergrenze dokumentiert; deshalb trägt dieser
      // Eintrag Q2 nicht (Plan 4.7, 7.5).
      description: "Zeilen je Seite.",
      schema: limit(null, 100),
    },
    {
      name: "offset",
      apiNames: ["offset"],
      source: "body",
      required: false,
      description: "Zeilen, die übersprungen werden.",
      schema: offset(),
    },
    {
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: "Umfang der Antwort; der Wert verlässt diesen Server nicht.",
      schema: responseFormat(),
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: {
    container: "data",
    fields: { postingaccount_number: "string", name: "string", type: "string" },
    source: "dokumentiert",
  },
  shape: "list",
  concise: ["postingaccount_number", "name"],
  bucket: "default",
  timeoutTier: "normal",
  crossChecks: [],
  invalidatesCache: [],
};

const CREATE_ENTRY: ToolEntry = {
  name: "bb_debtors_create",
  title: "Debitor anlegen",
  path: { literal: "/settings/add/debtor" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description: "Legt einen Debitor an.",
  mandatorySentence: "U1",
  fields: [
    {
      name: "name",
      apiNames: ["name"],
      source: "body",
      required: true,
      description: "Name des Debitors.",
      schema: boundedText("Der Name des Debitors.", 128),
    },
    {
      name: "postingaccount_number",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: "Sachkontonummer des Debitors.",
      schema: postingAccountNumber(),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_debtors_search",
    argsFrom: {},
    hint: "nach dem Namen suchen",
  },
  crossChecks: ["Q3"],
  // Die Zeile aus 7.8, die den Speicher überhaupt rechtfertigt.
  invalidatesCache: ["bb_debtors_search", "bb_postingaccounts_search"],
};

/**
 * Ein änderndes Werkzeug auf einem **eigenen** Pfad.
 *
 * Es steht hier, weil der Nachweis für den ungewissen Ausgang einen Verbindungsfehler braucht
 * und `undici` je Pfad nur eine Abfangregel zulässt: Ein Pfad ist entweder gewöhnlich
 * eingerichtet oder als Verbindungsfehler, nicht beides.
 */
const UPDATE_ENTRY: ToolEntry = {
  name: "bb_debtors_update",
  title: "Debitor ändern",
  path: { literal: "/settings/update/debtor" },
  effect: "modify",
  toolClass: "M",
  tier: 2,
  description: "Überschreibt die Stammdaten eines Debitors.",
  mandatorySentence: "U5",
  fields: [
    {
      name: "postingaccount_number",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: "Sachkontonummer des Debitors.",
      schema: postingAccountNumber(),
    },
    {
      name: "name",
      apiNames: ["name"],
      source: "body",
      required: true,
      description: "Name des Debitors.",
      schema: boundedText("Der Name des Debitors.", 128),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_debtors_search",
    argsFrom: {},
    hint: "den Debitor erneut lesen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: ["bb_debtors_search", "bb_postingaccounts_search"],
};

const ENTRIES: readonly ToolEntry[] = [SEARCH_ENTRY, CREATE_ENTRY, UPDATE_ENTRY];

const DEBTORS = {
  success: true,
  message: "",
  rows: 2,
  data: [
    { postingaccount_number: "10001", name: "Erfundene Kundin GmbH", type: "debtor" },
    { postingaccount_number: "10002", name: "Zweite erfundene Kundin GmbH", type: "debtor" },
  ],
};

interface RunningTestServer {
  readonly client: Client;
  close(): Promise<void>;
}

async function startServer(config: ResolvedConfig): Promise<RunningTestServer> {
  const built = createServer({
    config,
    entries: ENTRIES,
    // Derselbe Weg wie im Betrieb: Die Haltbarkeit kommt aus der Konfiguration.
    store: createMasterDataStore({ ttlMs: config.cacheTtlMs }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ap10-cachetest", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    close: async () => {
      await client.close();
      await built.server.close();
    },
  };
}

function textOf(result: { content?: unknown }): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks
    .map((block) =>
      typeof block === "object" && block !== null && "text" in block
        ? String((block as { text: unknown }).text)
        : "",
    )
    .join("\n");
}

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("Auslieferungszustand: BB_MCP_CACHE_TTL_MS=0", () => {
  it("befragt und füllt nichts; jeder Aufruf geht hinaus", async () => {
    api.post("/settings/get/debtors", { json: DEBTORS });
    const server = await startServer(installTestConfig());
    try {
      const first = await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      const second = await server.client.callTool({ name: "bb_debtors_search", arguments: {} });

      expect(first.isError).toBeFalsy();
      expect(second.isError).toBeFalsy();
      expect(api.count("/settings/get/debtors")).toBe(2);
      expect(textOf(second)).not.toContain("Stammdatenspeicher");
      expect((second.structuredContent as Record<string, unknown>)["_from_cache"]).toBeUndefined();
    } finally {
      await server.close();
    }
  });
});

describe("Eingeschalteter Speicher", () => {
  const cacheOn = { BB_MCP_CACHE_TTL_MS: "60000" } as const;

  it("beantwortet den zweiten Aufruf aus dem Speicher und weist das aus", async () => {
    api.post("/settings/get/debtors", { json: DEBTORS });
    const server = await startServer(installTestConfig(cacheOn));
    try {
      await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      const second = await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      const text = textOf(second);

      // Ein Treffer macht aus einem Aufruf null, nie zwei (Plan 7.8 Punkt 4).
      expect(api.count("/settings/get/debtors")).toBe(1);
      expect(text).toContain("Aus dem Stammdatenspeicher dieses Serverprozesses");
      expect(text).toContain("BB_MCP_CACHE_TTL_MS=0");
      const structured = second.structuredContent as Record<string, unknown>;
      expect(structured["_from_cache"]).toBeDefined();
      // Die Zeilen selbst sind dieselben wie beim ersten Aufruf.
      expect(JSON.stringify(structured["items"])).toContain("Erfundene Kundin GmbH");
    } finally {
      await server.close();
    }
  });

  it("wertet response_format auch auf dem Weg aus dem Speicher aus", async () => {
    api.post("/settings/get/debtors", { json: DEBTORS });
    const server = await startServer(installTestConfig(cacheOn));
    try {
      // Der erste Aufruf füllt den Speicher in der Kurzform.
      const first = await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      expect(
        JSON.stringify((first.structuredContent as Record<string, unknown>)["items"]),
      ).not.toContain('"type"');

      // Der zweite kommt aus dem Speicher und soll trotzdem die Langform liefern: Der
      // Speicher hält die Rohzeilen, nicht die Projektion.
      const second = await server.client.callTool({
        name: "bb_debtors_search",
        arguments: { response_format: "detailed" },
      });
      expect(api.count("/settings/get/debtors")).toBe(1);
      expect(textOf(second)).toContain("Aus dem Stammdatenspeicher");
      expect(
        JSON.stringify((second.structuredContent as Record<string, unknown>)["items"]),
      ).toContain('"type"');
    } finally {
      await server.close();
    }
  });

  it("verwirft den Stand nach einem erfolgreichen anlegenden Aufruf", async () => {
    api.post("/settings/get/debtors", { json: DEBTORS });
    api.post("/settings/add/debtor", { json: { success: true, message: "" } });
    const server = await startServer(installTestConfig(cacheOn));
    try {
      await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      expect(api.count("/settings/get/debtors")).toBe(1);

      const created = await server.client.callTool({
        name: "bb_debtors_create",
        arguments: { name: "Dritte erfundene Kundin GmbH", postingaccount_number: "10003" },
      });
      expect(created.isError).toBeFalsy();

      await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      // Der zweite Leseaufruf geht hinaus, weil der Stand verworfen wurde.
      expect(api.count("/settings/get/debtors")).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("verwirft den Stand auch bei ungewissem Ausgang", async () => {
    api.post("/settings/get/debtors", { json: DEBTORS });
    api.postNetworkError("/settings/update/debtor");
    const server = await startServer(installTestConfig(cacheOn));
    try {
      await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      expect(api.count("/settings/get/debtors")).toBe(1);

      const failed = await server.client.callTool({
        name: "bb_debtors_update",
        arguments: { name: "Vierte erfundene Kundin GmbH", postingaccount_number: "10004" },
      });
      const text = textOf(failed);

      expect(failed.isError).toBe(true);
      expect(text).toContain("UNGEWISSER AUSGANG.");
      expect(text).toContain("Es ist UNBEKANNT, ob BuchhaltungsButler diese Anfrage verarbeitet");
      // Kein automatischer zweiter Versuch an einem schreibenden Werkzeug (Plan 5.3).
      expect(api.count("/settings/update/debtor")).toBe(1);

      await server.client.callTool({ name: "bb_debtors_search", arguments: {} });
      expect(api.count("/settings/get/debtors")).toBe(2);
    } finally {
      await server.close();
    }
  });
});
