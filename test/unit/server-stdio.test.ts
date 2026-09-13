// Der Prozesseinstieg `runStdioServer` (AP10).
//
// Er ist der Weg, den `src/cli.ts` in AP15 nimmt, und damit der einzige, der im Betrieb wirklich
// läuft. Geprüft wird hier, was `createServer` allein nicht zeigt: dass der Transport geöffnet
// wird, dass die Verbindung auf `initialize` antwortet und dass der zurückgegebene Griff
// idempotent herunterfährt.
//
// Der Transport hängt an zwei Strömen im Speicher statt an den Strömen des Prozesses. Das ist
// nicht nur Testbequemlichkeit: Ein Test, der `process.stdout` belegte, nähme dem Testlauf
// seine eigene Ausgabe.

import { PassThrough } from "node:stream";

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { afterEach, expect, it } from "vitest";

import type { ToolEntry } from "../../src/registry/types.js";
import { limit } from "../../src/schema/pagination.js";
import { runStdioServer } from "../../src/server/create-server.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";

afterEach(() => {
  resetTestConfig();
});

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
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: { container: "data", fields: {}, source: "dokumentiert" },
  shape: "list",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  crossChecks: ["Q2"],
  invalidatesCache: [],
};

it("öffnet den Transport, antwortet auf initialize und fährt idempotent herunter", async () => {
  const config = installTestConfig();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const written: string[] = [];
  stdout.on("data", (chunk: Buffer) => written.push(chunk.toString("utf8")));

  const running = await runStdioServer({
    config,
    entries: [READ_ENTRY],
    transport: new StdioServerTransport(stdin, stdout),
  });

  try {
    expect(running.tools.map((tool) => tool.name)).toEqual(["bb_receipts_search"]);
    expect(running.instructions).toContain("ZUSTAND DIESES SERVERS");

    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "ap10-stdio", version: "0.0.0" },
        },
      })}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    const lines = written
      .join("")
      .split("\n")
      .filter((line) => line !== "");
    expect(lines).toHaveLength(1);
    const answer = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(answer["jsonrpc"]).toBe("2.0");
    expect(answer["id"]).toBe(1);

    // Zweimal herunterfahren heißt einmal abbauen.
    await running.shutdown.shutdown("Ende des Tests");
    await running.shutdown.shutdown("Ende des Tests, zum zweiten Mal");
    expect(running.shutdown.runs()).toBe(1);
  } finally {
    // Entfernt auch die Lauscher, die der Abbau nicht schon entfernt hat.
    running.dispose();
  }
});
