// Der Server: initialize, tools/list, Fehlerverhalten und das Herunterfahren (AP10,
// Prüfpunkte 4 und 5).
//
// Vier Nachweise stehen hier:
//
//  1. Der Server beantwortet `initialize` und `tools/list` mit den drei Beispieleinträgen, und
//     die Liste hängt von keinem Schalter ab (Plan 1.5, 6.6).
//  2. Ein unbekannter Werkzeugname ist der **einzige** Protokollfehler; alles andere ist
//     `isError: true` im Ergebnis (Plan 1.4 Schritt 1, 5.8).
//  3. Auf stdout steht ausschließlich JSON-RPC — auch dann, wenn im Handler etwas wirft.
//     Nachgewiesen über einen echten StdioServerTransport auf zwei Strömen im Speicher; ein
//     Test gegen `process.stdout` prüfte die Sperre der Lint-Regel und nicht den Server.
//  4. Das Herunterfahren ist idempotent: bei SIGINT, SIGTERM, stdin-Ende, doppeltem Signal und
//     zwei Signalen hintereinander läuft der Abbau genau einmal.

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MasterDataStore } from "../../src/cache/store.js";
import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { boundedText } from "../../src/schema/primitives.js";
import { limit, offset } from "../../src/schema/pagination.js";
import { amountIn, date as dateField } from "../../src/schema/vocab.js";
import { createServer } from "../../src/server/create-server.js";
import { installShutdown, type ShutdownCloseable } from "../../src/server/shutdown.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// --- Die drei Beispieleinträge ---------------------------------------------------------

const READ_ENTRY: ToolEntry = {
  name: "bb_receipts_search",
  title: "Belege suchen",
  group: "receipts",
  path: { literal: "/receipts/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description: "Sucht Belege des Mandanten.",
  fields: [
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      description: "Zeilen je Seite.",
      schema: limit(500, 100),
    },
    {
      name: "offset",
      apiNames: ["offset"],
      source: "body",
      required: false,
      description: "Zeilen, die übersprungen werden.",
      schema: offset(),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: {
    container: "data",
    fields: { id_by_customer: "id-string", amount: "amount-string" },
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  concise: ["id_by_customer", "amount"],
  bucket: "default",
  timeoutTier: "normal",
  crossChecks: ["Q2"],
  invalidatesCache: [],
};

const CREATE_ENTRY: ToolEntry = {
  name: "bb_receipts_create",
  title: "Beleg anlegen",
  group: "receipts",
  path: { literal: "/receipts/add" },
  effect: "create",
  toolClass: "A",
  tier: 1,
  description: "Legt einen Beleg an.",
  mandatorySentence: "U1",
  fields: [
    {
      name: "date",
      apiNames: ["date"],
      source: "body",
      required: true,
      description: "Belegdatum.",
      schema: dateField("das Belegdatum"),
    },
    {
      name: "amount",
      apiNames: ["amount"],
      source: "body",
      required: true,
      description: "Bruttobetrag des Belegs.",
      schema: amountIn("der Bruttobetrag des Belegs"),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: ["id_by_customer"],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_search",
    argsFrom: {},
    hint: "nach dem Beleg suchen",
  },
  crossChecks: ["Q3", "Q5"],
  invalidatesCache: [],
};

const DELETE_ENTRY: ToolEntry = {
  name: "bb_receipts_delete",
  title: "Beleg löschen",
  group: "receipts",
  path: {
    template: "/receipts/delete/{receipt_id_by_customer}",
    params: ["receipt_id_by_customer"],
    specPath: "/receipts/delete/id_by_customer",
  },
  effect: "delete",
  toolClass: "D",
  tier: 2,
  description: "Löscht einen Beleg.",
  mandatorySentence: "U2",
  fields: [
    {
      name: "receipt_id_by_customer",
      apiNames: [],
      source: "path",
      required: true,
      description: "Kennung des Belegs; sie wird in den Pfad eingesetzt.",
      schema: boundedText("Die Kennung des Belegs.", 18),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: { kind: "tool", tool: "bb_receipts_search", argsFrom: {}, hint: "" },
  crossChecks: ["Q3"],
  invalidatesCache: [],
  verified: false,
};

const ENTRIES: readonly ToolEntry[] = [READ_ENTRY, CREATE_ENTRY, DELETE_ENTRY];

const PROTOCOL_VERSION = "2025-11-25";

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
let config: ResolvedConfig;

beforeEach(() => {
  api = mockApi();
  config = installTestConfig();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

// Diese Datei prüft genau die drei Beispieleinträge. Die Bündelwerkzeuge stehen im Betrieb
// zusätzlich in `tools/list`; sie werden hier ausdrücklich abgewählt (`bundles: []`), statt die
// erwarteten Namen um sie zu erweitern. Ihre eigene Prüfung steht in `test/bundles/`.
describe("initialize und tools/list", () => {
  it("meldet die drei Beispieleinträge mit Titel, Annotationen und strengem Schema", async () => {
    const built = createServer({
      config,
      entries: ENTRIES,
      bundles: [],
      store: createMasterDataStore({ ttlMs: 0 }),
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ap10-servertest", version: "0.0.0" });
    await built.server.connect(serverSide);
    await client.connect(clientSide);

    try {
      expect(client.getServerCapabilities()?.tools).toBeDefined();
      expect(client.getInstructions()).toContain("ZUSTAND DIESES SERVERS");

      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "bb_receipts_search",
        "bb_receipts_create",
        "bb_receipts_delete",
      ]);

      const search = listed.tools[0];
      expect(search?.title).toBe("Belege suchen");
      expect(search?.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      // Guard 3 verlangt additionalProperties: false, und genau das wird angekündigt.
      expect(search?.inputSchema.additionalProperties).toBe(false);
      expect(search?.inputSchema.properties).toHaveProperty("limit");
      expect(search?.outputSchema).toBeDefined();

      const create = listed.tools[1];
      expect(create?.annotations?.readOnlyHint).toBe(false);
      expect(create?.annotations?.destructiveHint).toBe(false);
      const remove = listed.tools[2];
      expect(remove?.annotations?.destructiveHint).toBe(true);
      expect(remove?.annotations?.idempotentHint).toBe(false);
    } finally {
      await client.close();
      await built.server.close();
    }
  });

  it("meldet dieselbe Liste, auch wenn der Nur-Lesen-Schalter greift", async () => {
    const built = createServer({
      config: installTestConfig({ BB_MCP_READ_ONLY: "true" }),
      entries: ENTRIES,
      bundles: [],
      store: createMasterDataStore({ ttlMs: 0 }),
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ap10-servertest", version: "0.0.0" });
    await built.server.connect(serverSide);
    await client.connect(clientSide);

    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(3);
      expect(built.tools.filter((tool) => tool.blockedByReadOnly).map((tool) => tool.name)).toEqual(
        ["bb_receipts_create", "bb_receipts_delete"],
      );
    } finally {
      await client.close();
      await built.server.close();
    }
  });

  it("beantwortet einen unbekannten Werkzeugnamen als Protokollfehler", async () => {
    const built = createServer({
      config,
      entries: ENTRIES,
      bundles: [],
      store: createMasterDataStore({ ttlMs: 0 }),
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ap10-servertest", version: "0.0.0" });
    await built.server.connect(serverSide);
    await client.connect(clientSide);

    try {
      await expect(client.callTool({ name: "bb_gibt_es_nicht", arguments: {} })).rejects.toThrow(
        /bb_gibt_es_nicht/,
      );
    } finally {
      await client.close();
      await built.server.close();
    }
  });
});

describe("Ein Fehler im Handler", () => {
  /** Ein Speicher, der beim Lesen wirft. Er steht für alles, was hier nicht vorgesehen ist. */
  const explodingStore: MasterDataStore = {
    isEnabled: () => true,
    ttlMs: () => 60_000,
    isCacheable: () => true,
    read: () => {
      throw new Error("Der Stammdatenspeicher ist im Test absichtlich kaputt.");
    },
    write: () => false,
    invalidate: () => [],
    clear: () => undefined,
    size: () => 0,
  };

  it("wird zu isError im Ergebnis und nicht zu einem Protokollfehler", async () => {
    const built = createServer({ config, entries: ENTRIES, bundles: [], store: explodingStore });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ap10-servertest", version: "0.0.0" });
    await built.server.connect(serverSide);
    await client.connect(clientSide);

    try {
      const result = await client.callTool({ name: "bb_receipts_search", arguments: {} });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain("[Was] bb_receipts_search: Dieser Server ist in einen unerwarteten");
      expect(text).toContain("absichtlich kaputt");
      // Die englische Rückfallmeldung des SDK darf nicht erscheinen.
      expect(text).not.toContain("Input validation error");
      expect(api.count()).toBe(0);
    } finally {
      await client.close();
      await built.server.close();
    }
  });
});

describe("stdout trägt ausschließlich JSON-RPC", () => {
  it("schreibt auch bei einem Fehler im Handler keine fremde Zeile", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const written: string[] = [];
    stdout.on("data", (chunk: Buffer) => written.push(chunk.toString("utf8")));

    const built = createServer({
      config,
      entries: ENTRIES,
      bundles: [],
      store: createMasterDataStore({ ttlMs: 0 }),
    });
    await built.server.connect(new StdioServerTransport(stdin, stdout));

    const send = (message: unknown): void => {
      stdin.write(`${JSON.stringify(message)}\n`);
    };

    const waitForId = async (id: number): Promise<Record<string, unknown>> => {
      const deadline = Date.now() + 2_000;
      for (;;) {
        const lines = written
          .join("")
          .split("\n")
          .filter((line) => line !== "");
        for (const line of lines) {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          if (parsed["id"] === id) {
            return parsed;
          }
        }
        if (Date.now() > deadline) {
          throw new Error(`Keine Antwort auf die Anfrage ${String(id)}.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };

    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "ap10-stdio", version: "0.0.0" },
        },
      });
      await waitForId(1);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });

      // Ein Aufruf, der an Guard 3 scheitert: Die Diagnose gehört in das Ergebnis, nicht auf
      // stdout.
      send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "bb_receipts_create", arguments: { date: "kein Datum" } },
      });
      const answer = await waitForId(2);
      const result = answer["result"] as { isError?: boolean } | undefined;
      expect(result?.isError).toBe(true);

      const lines = written
        .join("")
        .split("\n")
        .filter((line) => line !== "");
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        expect(parsed["jsonrpc"]).toBe("2.0");
      }
    } finally {
      await built.server.close();
    }
  });
});

describe("Herunterfahren", () => {
  function fakeProcess(): EventEmitter & Pick<NodeJS.Process, "on" | "off"> {
    return new EventEmitter() as unknown as EventEmitter & Pick<NodeJS.Process, "on" | "off">;
  }

  function countingTarget(): ShutdownCloseable & { closed: number } {
    const target = {
      closed: 0,
      close: () => {
        target.closed += 1;
      },
    };
    return target;
  }

  it("fährt bei SIGINT genau einmal herunter", async () => {
    const proc = fakeProcess();
    const target = countingTarget();
    const handle = installShutdown({
      targets: [target],
      stdin: null,
      processRef: proc,
      setExitCode: () => undefined,
    });

    proc.emit("SIGINT");
    await handle.shutdown("Warten auf denselben Abbau");

    expect(handle.runs()).toBe(1);
    expect(target.closed).toBe(1);
    expect(handle.isShuttingDown()).toBe(true);
  });

  it("läuft bei einem doppelten Signal trotzdem nur einmal", async () => {
    const proc = fakeProcess();
    const target = countingTarget();
    const handle = installShutdown({
      targets: [target],
      stdin: null,
      processRef: proc,
      setExitCode: () => undefined,
    });

    proc.emit("SIGINT");
    proc.emit("SIGINT");
    await handle.shutdown("Warten");

    expect(handle.runs()).toBe(1);
    expect(target.closed).toBe(1);
  });

  it("läuft bei zwei verschiedenen Signalen hintereinander nur einmal", async () => {
    const proc = fakeProcess();
    const target = countingTarget();
    const handle = installShutdown({
      targets: [target],
      stdin: null,
      processRef: proc,
      setExitCode: () => undefined,
    });

    proc.emit("SIGINT");
    proc.emit("SIGTERM");
    await handle.shutdown("Warten");

    expect(handle.runs()).toBe(1);
    expect(target.closed).toBe(1);
  });

  it("fährt beim Ende von stdin herunter, auch zusammen mit einem Signal", async () => {
    const proc = fakeProcess();
    const stdin = new PassThrough();
    const target = countingTarget();
    const handle = installShutdown({
      targets: [target],
      stdin,
      processRef: proc,
      setExitCode: () => undefined,
    });

    stdin.end();
    proc.emit("SIGTERM");
    await handle.shutdown("Warten");

    expect(handle.runs()).toBe(1);
    expect(target.closed).toBe(1);
  });

  it("übergeht einen Fehler beim Schließen und schließt die übrigen Ziele", async () => {
    const proc = fakeProcess();
    const second = countingTarget();
    let exitCode: number | undefined;
    const handle = installShutdown({
      targets: [
        {
          close: () => {
            throw new Error("Transport war schon zu.");
          },
        },
        second,
      ],
      stdin: null,
      processRef: proc,
      setExitCode: (code) => {
        exitCode = code;
      },
    });

    await handle.shutdown("Test");

    expect(handle.runs()).toBe(1);
    expect(second.closed).toBe(1);
    expect(exitCode).toBe(0);
  });

  it("entfernt seine Lauscher, sobald der Abbau begonnen hat", async () => {
    const proc = fakeProcess();
    const target = countingTarget();
    const handle = installShutdown({
      targets: [target],
      stdin: null,
      processRef: proc,
      setExitCode: () => undefined,
    });

    expect(proc.listenerCount("SIGINT")).toBe(1);
    await handle.shutdown("Test");
    expect(proc.listenerCount("SIGINT")).toBe(0);
    handle.dispose();
  });
});
