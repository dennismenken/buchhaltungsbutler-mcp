// Die Guardreihenfolge aus Plan 1.4 und der Zustandssatz 1 aus 5.8 (AP10, Prüfpunkte 1 und 2).
//
// Geprüft wird nicht der einzelne Guard für sich, sondern die Kette: Ein Aufruf, der gegen
// mehrere Guards zugleich verstößt, muss beim **ersten** enden, und kein späterer darf laufen.
// Nachgewiesen wird das über den Text der Absage — sie nennt genau einen Grund — und über den
// MockAgent, der dabei keinen einzigen Request sehen darf.
//
// Der Server wird dafür vollständig aufgebaut und über eine Verbindung im Speicher
// angesprochen. Ein Test, der den Handler direkt aufriefe, prüfte nicht denselben Weg: Die
// Frage, ob das SDK vor dem Handler validiert, ist genau die, an der die Reihenfolge hängt.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { initConfig } from "../../src/config/resolve.js";
import { STATE_NOTHING_SENT } from "../../src/errors/render.js";
import { READ_ONLY_VAR } from "../../src/guards/read-only.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { amountIn, date as dateField } from "../../src/schema/vocab.js";
import { boundedText } from "../../src/schema/primitives.js";
import { limit, offset } from "../../src/schema/pagination.js";
import { createServer } from "../../src/server/create-server.js";
import {
  installTestConfig,
  mockApi,
  resetTestConfig,
  TEST_BASE_URL,
  type ApiMock,
} from "../helpers/mock-api.js";

// --- Beispieleinträge -----------------------------------------------------------------
//
// Drei Einträge, je einer lesend, anlegend und löschend (AP10). Sie stehen hier und nicht in
// `src/registry/tools/`: Die 54 echten Einträge entstehen in AP12a bis AP12e, und dieser Test
// prüft den Ausführungsweg und nicht ihren Inhalt. Pfade, Klassen und Querprüfungen sind
// trotzdem die echten, damit der Weg genau die Verzweigungen nimmt, die er im Betrieb nimmt.

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
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: false,
      description: "Frühestes Belegdatum.",
      schema: dateField("das früheste Belegdatum"),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: false,
      description: "Spätestes Belegdatum.",
      schema: dateField("das späteste Belegdatum"),
    },
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
    fields: { id_by_customer: "id-string", date: "string", amount: "amount-string" },
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  concise: ["id_by_customer", "date", "amount"],
  bucket: "default",
  timeoutTier: "normal",
  crossChecks: ["Q1", "Q2", "Q3"],
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
      name: "date_delivery",
      apiNames: ["date_delivery"],
      source: "body",
      required: false,
      description: "Leistungsdatum.",
      schema: dateField("das Leistungsdatum"),
    },
    {
      name: "amount",
      apiNames: ["amount"],
      source: "body",
      required: true,
      description: "Bruttobetrag des Belegs.",
      schema: amountIn("der Bruttobetrag des Belegs"),
    },
    {
      name: "invoicenumber",
      apiNames: ["invoicenumber"],
      source: "body",
      required: false,
      description: "Rechnungsnummer.",
      schema: boundedText("Die Rechnungsnummer.", 64),
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
    argsFrom: { date_from: "date", date_to: "date" },
    hint: "nach amount {amount} suchen",
  },
  crossChecks: ["Q3", "Q5", "Q6"],
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
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_search",
    argsFrom: {},
    hint: "den Beleg erneut suchen",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
  verified: false,
};

const ENTRIES: readonly ToolEntry[] = [READ_ENTRY, CREATE_ENTRY, DELETE_ENTRY];

// --- Aufbau ---------------------------------------------------------------------------

interface RunningTestServer {
  readonly client: Client;
  readonly instructions: string;
  close(): Promise<void>;
}

async function startServer(config: ResolvedConfig): Promise<RunningTestServer> {
  const built = createServer({
    config,
    entries: ENTRIES,
    store: createMasterDataStore({ ttlMs: config.cacheTtlMs }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ap10-guardtest", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    instructions: built.instructions,
    close: async () => {
      await client.close();
      await built.server.close();
    },
  };
}

/** Eine Konfiguration ohne jede Zugangsangabe: der Zustand „nicht konfiguriert" aus 6.5. */
function unconfigured(): ResolvedConfig {
  resetTestConfig();
  return initConfig({
    env: { BB_BASE_URL: TEST_BASE_URL },
    platform: "linux",
    homeDir: "/nicht/vorhanden",
    nodeVersion: process.versions.node,
  });
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

/** Die Argumente, die gegen Guard 3, Guard 4 und Guard 5 zugleich verstoßen. */
const TRIPLE_INVALID = {
  date: "2026-01-10",
  // Q6: Leistungsdatum nach Belegdatum.
  date_delivery: "2026-02-01",
  // Guard 5 bei BB_MCP_MAX_AMOUNT=1000.00.
  amount: "20000.00",
  // Guard 3: unbekanntes Feld, das Schema ist streng.
  unbekanntesFeld: "x",
};

const LIMITS = { BB_MCP_MAX_AMOUNT: "1000.00" } as const;

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("Guardreihenfolge nach Plan 1.4", () => {
  it("meldet Guard 1, obwohl derselbe Aufruf auch gegen 2 bis 5 verstößt", async () => {
    const server = await startServer(unconfigured());
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: TRIPLE_INVALID,
      });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain("bb_receipts_create ist nicht ausführbar");
      expect(text).toContain("Es fehlen: BB_API_CLIENT, BB_API_SECRET, BB_API_KEY.");
      // Kein späterer Guard hat gemeldet.
      expect(text).not.toContain("unbekannte Felder");
      expect(text).not.toContain("date_delivery");
      expect(text).not.toContain("Betragsgrenze");
      expect(api.count()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("meldet Guard 2, obwohl derselbe Aufruf auch gegen 3 bis 5 verstößt", async () => {
    const config = installTestConfig({ ...LIMITS, BB_MCP_READ_ONLY: "true" });
    const server = await startServer(config);
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: TRIPLE_INVALID,
      });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain(`bb_receipts_create ist gesperrt`);
      expect(text).toContain(`${READ_ONLY_VAR}=true`);
      expect(
        text
          .trimEnd()
          .endsWith("Keine anderen Werkzeuge dieses Servers ausprobieren, um das zu umgehen."),
      ).toBe(true);
      expect(text).not.toContain("unbekannte Felder");
      expect(text).not.toContain("Betragsgrenze");
      expect(api.count()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("meldet Guard 3, obwohl derselbe Aufruf auch gegen 4 und 5 verstößt", async () => {
    const server = await startServer(installTestConfig(LIMITS));
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: TRIPLE_INVALID,
      });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain("[Was] bb_receipts_create: Die Argumente entsprechen nicht dem");
      expect(text).toContain("unbekannte Felder unbekanntesFeld");
      // Q6 (Guard 4) und die Betragsgrenze (Guard 5) sind nicht gelaufen.
      expect(text).not.toContain("DATEV");
      expect(text).not.toContain("Betragsgrenze");
      expect(api.count()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("meldet Guard 4, obwohl derselbe Aufruf auch gegen 5 verstößt", async () => {
    const server = await startServer(installTestConfig(LIMITS));
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: {
          date: TRIPLE_INVALID.date,
          date_delivery: TRIPLE_INVALID.date_delivery,
          amount: TRIPLE_INVALID.amount,
        },
      });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain("[Was] bb_receipts_create: Eine Querprüfung dieses Endpunkts");
      expect(text).toContain("date_delivery (2026-02-01) liegt nach date (2026-01-10)");
      expect(text).not.toContain("Betragsgrenze");
      expect(api.count()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("meldet Guard 5 als letzten der Kette, positionsgenau", async () => {
    const server = await startServer(installTestConfig(LIMITS));
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: { date: "2026-01-10", amount: "20000.00" },
      });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain("[Was] bb_receipts_create: Der Aufruf reißt die Betragsgrenze");
      expect(text).toContain("amount trägt 20000.00, erlaubt sind höchstens 1000.00.");
      expect(api.count()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("lässt einen Aufruf ohne Verstoß durch und setzt genau einen Request ab", async () => {
    api.post("/receipts/add", { json: { success: true, message: "", id_by_customer: "4716" } });
    const server = await startServer(installTestConfig(LIMITS));
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: { date: "2026-01-10", amount: "884.65", invoicenumber: "ER-2026-0001" },
      });

      expect(result.isError).toBeFalsy();
      expect(api.count("/receipts/add")).toBe(1);
      const request = await api.lastRequest("/receipts/add");
      // Der Mandantenschlüssel kommt aus der Konfiguration und nie aus den Argumenten.
      expect(request.body["api_key"]).toBe("test-api-key");
      expect(request.body["date"]).toBe("2026-01-10");
    } finally {
      await server.close();
    }
  });
});

describe("Zustandssatz 1 aus Plan 5.8", () => {
  const scenarios: readonly {
    readonly guard: string;
    readonly env: Record<string, string>;
    readonly tool: string;
    readonly args: Record<string, unknown>;
    readonly unconfigured?: boolean;
  }[] = [
    {
      guard: "Guard 1, Konfiguration",
      env: {},
      tool: "bb_receipts_search",
      args: {},
      unconfigured: true,
    },
    {
      guard: "Guard 2, Nur-Lesen",
      env: { BB_MCP_READ_ONLY: "true" },
      tool: "bb_receipts_create",
      args: { date: "2026-01-10", amount: "884.65" },
    },
    {
      guard: "Guard 3, Schema",
      env: {},
      tool: "bb_receipts_search",
      args: { date_from: "31.03.2026" },
    },
    {
      guard: "Guard 4, Querprüfung",
      env: {},
      tool: "bb_receipts_search",
      args: { date_from: "2026-03-31", date_to: "2026-01-01" },
    },
    {
      guard: "Guard 5, Grenze",
      env: LIMITS,
      tool: "bb_receipts_create",
      args: { date: "2026-01-10", amount: "20000.00" },
    },
    {
      guard: "Abbildung vor dem Request",
      env: {},
      tool: "bb_receipts_delete",
      // Regel 1 aus 4.6: Der Wert des Pfadsegments muss ^[0-9]{1,18}$ erfüllen.
      args: { receipt_id_by_customer: "47/11" },
    },
  ];

  for (const scenario of scenarios) {
    it(`${scenario.guard} bricht vor dem ersten Byte ab und trägt Satz 1 zeichengenau`, async () => {
      const config =
        scenario.unconfigured === true ? unconfigured() : installTestConfig(scenario.env);
      const server = await startServer(config);
      try {
        const result = await server.client.callTool({
          name: scenario.tool,
          arguments: scenario.args,
        });
        const text = textOf(result);

        expect(result.isError).toBe(true);
        expect(text).toContain(STATE_NOTHING_SENT);
        // Die beiden anderen Formulierungen aus 5.8 dürfen hier nicht stehen.
        expect(text).not.toContain("BuchhaltungsButler hat die Anfrage abgelehnt.");
        expect(text).not.toContain("Es ist UNBEKANNT");
        expect(api.count()).toBe(0);
      } finally {
        await server.close();
      }
    });
  }

  it("nennt Guard 6 nicht, weil er nie ablehnt", async () => {
    // Guard 6 ist der einzige der sechs ohne Absagetext: Ein Treffer wandert in die Antwort,
    // blockiert aber nicht (Plan 1.4 Schritt 7). Der Nachweis dafür steht in
    // guards-duplicate-check.test.ts; hier wird nur festgehalten, dass es keinen sechsten
    // Absagetext gibt.
    const server = await startServer(installTestConfig({ BB_MCP_DUPLICATE_CHECK: "on" }));
    try {
      api.post("/receipts/add", { json: { success: true, message: "", id_by_customer: "4716" } });
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: { date: "2026-01-10", amount: "884.65" },
      });
      expect(result.isError).toBeFalsy();
    } finally {
      await server.close();
    }
  });
});

describe("Der Zustandsblock der instructions", () => {
  it("nennt Schalter, Speicher und Duplikatsprüfung", async () => {
    const server = await startServer(
      installTestConfig({ BB_MCP_DUPLICATE_CHECK: "on", BB_MCP_MAX_BATCH: "10" }),
    );
    try {
      expect(server.instructions).toContain("ZUSTAND DIESES SERVERS");
      expect(server.instructions).toContain("Nur-Lesen-Schalter: aus");
      expect(server.instructions).toContain("Stammdatenspeicher: aus");
      expect(server.instructions).toContain("Duplikatsprüfung: AN");
      expect(server.instructions).toContain("Mengengrenze: 10 Einträge");
      expect(server.client.getInstructions()).toBe(server.instructions);
    } finally {
      await server.close();
    }
  });
});
