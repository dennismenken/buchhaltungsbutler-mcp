// Guard 6: der Duplikatshinweis (Plan 1.4 Schritt 7, 6.2; AP10, Prüfpunkt 3).
//
// Drei Zusagen werden hier nachgewiesen, und alle drei sind Zusagen an den Betreiber:
// Im Auslieferungszustand geht **kein** Zusatzaufruf hinaus, eingeschaltet **blockiert** der
// Guard nicht, und bei einem Stapelwerkzeug läuft er **einmal für den ganzen Stapel**.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { checkDuplicates, type DuplicateLookup } from "../../src/guards/duplicate-check.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { batchArray } from "../../src/schema/batch.js";
import { boundedText, strictObject } from "../../src/schema/primitives.js";
import { amountIn, date as dateField } from "../../src/schema/vocab.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// --- Fixtures -------------------------------------------------------------------------

const SEARCH_ENTRY: ToolEntry = {
  name: "bb_receipts_search",
  title: "Belege suchen",
  path: { literal: "/receipts/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description: "Sucht Belege des Mandanten.",
  fields: [
    {
      name: "counterparty",
      apiNames: ["counterparty"],
      source: "body",
      required: false,
      description: "Geschäftspartner des Belegs.",
      schema: boundedText("Der Geschäftspartner des Belegs.", 128),
    },
    {
      name: "invoicenumber",
      apiNames: ["invoicenumber"],
      source: "body",
      required: false,
      description: "Rechnungsnummer des Belegs.",
      schema: boundedText("Die Rechnungsnummer des Belegs.", 64),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: {
    container: "data",
    fields: {
      id_by_customer: "id-string",
      counterparty: "string",
      invoicenumber: "string",
      amount: "amount-string",
    },
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  concise: ["id_by_customer", "counterparty", "invoicenumber", "amount"],
  bucket: "default",
  timeoutTier: "normal",
  crossChecks: [],
  invalidatesCache: [],
};

const CREATE_ENTRY: ToolEntry = {
  name: "bb_receipts_create",
  title: "Beleg anlegen",
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
    {
      name: "counterparty",
      apiNames: ["counterparty"],
      source: "body",
      required: true,
      description: "Geschäftspartner des Belegs.",
      schema: boundedText("Der Geschäftspartner des Belegs.", 128),
    },
    {
      name: "invoicenumber",
      // Die API nennt den Parameter an /receipts/add invoice_number und an /receipts/get
      // invoicenumber. Das Werkzeugfeld trägt den einen Namen, der Mapper den anderen.
      apiNames: ["invoice_number"],
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
    argsFrom: { counterparty: "counterparty" },
    hint: "nach invoicenumber {invoicenumber} suchen",
  },
  duplicateCheck: {
    tool: "bb_receipts_search",
    keyFields: ["counterparty", "invoicenumber"],
    perBatch: true,
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};

function batchEntry(): ToolEntry {
  return {
    name: "bb_receipts_create_batch",
    title: "Belege im Stapel anlegen",
    path: { literal: "/receipts/addBatch" },
    effect: "create",
    toolClass: "A",
    tier: 2,
    description: "Legt mehrere Belege an.",
    mandatorySentence: "U1",
    fields: [
      {
        name: "receipts",
        apiNames: ["receipts"],
        source: "body",
        required: true,
        description: "Die Belege des Stapels.",
        schema: batchArray(
          strictObject({
            counterparty: boundedText("Der Geschäftspartner des Belegs.", 128),
            invoicenumber: boundedText("Die Rechnungsnummer.", 64),
            amount: amountIn("der Bruttobetrag des Belegs"),
          }),
          { description: "Die Belege des Stapels.", maxItems: 50 },
        ),
        itemFields: [
          {
            name: "counterparty",
            apiNames: ["counterparty"],
            source: "body",
            required: true,
            description: "Geschäftspartner des Belegs.",
            schema: boundedText("Der Geschäftspartner des Belegs.", 128),
          },
          {
            name: "invoicenumber",
            apiNames: ["invoice_number"],
            source: "body",
            required: true,
            description: "Rechnungsnummer.",
            schema: boundedText("Die Rechnungsnummer.", 64),
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
        transform: "object-list",
      },
    ],
    serverOnlyFields: [],
    omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
    responseContract: { container: "none", fields: {}, source: "dokumentiert" },
    shape: "ack",
    concise: [],
    bucket: "batch",
    timeoutTier: "long",
    verifyWith: {
      kind: "tool",
      tool: "bb_receipts_search",
      argsFrom: { counterparty: "counterparty" },
      hint: "",
    },
    duplicateCheck: {
      tool: "bb_receipts_search",
      keyFields: ["counterparty", "invoicenumber"],
      perBatch: true,
    },
    crossChecks: [],
    invalidatesCache: [],
  };
}

interface RunningTestServer {
  readonly client: Client;
  close(): Promise<void>;
}

async function startServer(
  config: ResolvedConfig,
  entries: readonly ToolEntry[],
): Promise<RunningTestServer> {
  const built = createServer({
    config,
    entries,
    store: createMasterDataStore({ ttlMs: 0 }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ap10-duplicatetest", version: "0.0.0" });
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

const NEW_RECEIPT = {
  date: "2026-01-10",
  amount: "884.65",
  counterparty: "Erfundene Bürobedarf GmbH",
  invoicenumber: "ER-2026-0001",
};

const EXISTING_MATCH = {
  success: true,
  message: "",
  rows: 1,
  data: [
    {
      id_by_customer: "4711",
      counterparty: "Erfundene Bürobedarf GmbH",
      invoicenumber: "ER-2026-0001",
      amount: "884.65",
    },
  ],
};

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
  api.post("/receipts/add", { json: { success: true, message: "", id_by_customer: "4716" } });
  api.post("/receipts/addBatch", { json: { success: true, message: "" } });
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("Guard 6 im Auslieferungszustand", () => {
  it("setzt keinen Zusatzaufruf ab; ein Werkzeugaufruf bleibt genau ein Aufruf", async () => {
    const server = await startServer(installTestConfig(), [SEARCH_ENTRY, CREATE_ENTRY]);
    try {
      api.post("/receipts/get", { json: EXISTING_MATCH });
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: NEW_RECEIPT,
      });

      expect(result.isError).toBeFalsy();
      expect(api.count("/receipts/add")).toBe(1);
      expect(api.count("/receipts/get")).toBe(0);
      expect(textOf(result)).not.toContain("MÖGLICHES DUPLIKAT");
    } finally {
      await server.close();
    }
  });
});

describe("Guard 6 eingeschaltet", () => {
  const duplicateCheckOn = { BB_MCP_DUPLICATE_CHECK: "on" } as const;

  it("blockiert nicht, sondern legt den Hinweis in die Antwort", async () => {
    const server = await startServer(installTestConfig(duplicateCheckOn), [
      SEARCH_ENTRY,
      CREATE_ENTRY,
    ]);
    try {
      api.post("/receipts/get", { json: EXISTING_MATCH });
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: NEW_RECEIPT,
      });
      const text = textOf(result);

      // Nicht blockiert: Der anlegende Aufruf ist hinausgegangen.
      expect(result.isError).toBeFalsy();
      expect(api.count("/receipts/add")).toBe(1);
      expect(api.count("/receipts/get")).toBe(1);

      expect(text).toContain("MÖGLICHES DUPLIKAT");
      expect(text).toContain("id_by_customer 4711");
      expect(text).toContain("counterparty, invoicenumber");
      const structured = result.structuredContent as Record<string, unknown> | undefined;
      expect(structured?.["duplicate_hint"]).toBeDefined();

      // Gesucht wurde mit beiden Schlüsselfeldern, und der Mandantenschlüssel kam aus der
      // Konfiguration.
      const lookup = await api.lastRequest("/receipts/get");
      expect(lookup.body["counterparty"]).toBe(NEW_RECEIPT.counterparty);
      expect(lookup.body["invoicenumber"]).toBe(NEW_RECEIPT.invoicenumber);
      expect(lookup.body["api_key"]).toBe("test-api-key");
    } finally {
      await server.close();
    }
  });

  it("schweigt, wenn die Suche nichts Passendes liefert", async () => {
    const server = await startServer(installTestConfig(duplicateCheckOn), [
      SEARCH_ENTRY,
      CREATE_ENTRY,
    ]);
    try {
      api.post("/receipts/get", {
        json: {
          success: true,
          message: "",
          rows: 1,
          data: [
            {
              id_by_customer: "4712",
              counterparty: "Erfundene Bürobedarf GmbH",
              invoicenumber: "ER-2026-0099",
              amount: "12.00",
            },
          ],
        },
      });
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: NEW_RECEIPT,
      });

      expect(result.isError).toBeFalsy();
      expect(api.count("/receipts/get")).toBe(1);
      expect(textOf(result)).not.toContain("MÖGLICHES DUPLIKAT");
    } finally {
      await server.close();
    }
  });

  it("lässt den Aufruf durchlaufen, wenn die Nachschlage-Abfrage scheitert", async () => {
    const server = await startServer(installTestConfig(duplicateCheckOn), [
      SEARCH_ENTRY,
      CREATE_ENTRY,
    ]);
    try {
      api.post("/receipts/get", {
        status: 400,
        json: { success: false, message: "invalid field specified", error_code: 15 },
      });
      const result = await server.client.callTool({
        name: "bb_receipts_create",
        arguments: NEW_RECEIPT,
      });

      expect(result.isError).toBeFalsy();
      expect(api.count("/receipts/add")).toBe(1);
      expect(textOf(result)).not.toContain("MÖGLICHES DUPLIKAT");
    } finally {
      await server.close();
    }
  });

  it("läuft bei einem Stapelwerkzeug genau einmal für den ganzen Stapel", async () => {
    const server = await startServer(installTestConfig(duplicateCheckOn), [
      SEARCH_ENTRY,
      batchEntry(),
    ]);
    try {
      api.post("/receipts/get", { json: EXISTING_MATCH });
      const result = await server.client.callTool({
        name: "bb_receipts_create_batch",
        arguments: {
          receipts: [
            {
              counterparty: "Erfundene Bürobedarf GmbH",
              invoicenumber: "ER-2026-0001",
              amount: "884.65",
            },
            {
              counterparty: "Erfundene Bürobedarf GmbH",
              invoicenumber: "ER-2026-0002",
              amount: "12.00",
            },
            {
              counterparty: "Erfundene Bürobedarf GmbH",
              invoicenumber: "ER-2026-0003",
              amount: "7.00",
            },
          ],
        },
      });

      expect(result.isError).toBeFalsy();
      // Genau ein Zusatzaufruf für drei Stapelelemente, nicht drei.
      expect(api.count("/receipts/get")).toBe(1);
      expect(api.count("/receipts/addBatch")).toBe(1);

      // Gesucht wurde nur mit dem Feld, das im ganzen Stapel denselben Wert trägt; die drei
      // verschiedenen Rechnungsnummern weiten die Suche, statt sie zu verfälschen.
      const lookup = await api.lastRequest("/receipts/get");
      expect(lookup.body["counterparty"]).toBe("Erfundene Bürobedarf GmbH");
      expect(lookup.body["invoicenumber"]).toBeUndefined();

      // Der Treffer passt auf das erste Stapelelement und steht in der Antwort.
      expect(textOf(result)).toContain("MÖGLICHES DUPLIKAT");
    } finally {
      await server.close();
    }
  });
});

// --- Der Vergleich selbst, ohne Server ---------------------------------------------------
//
// Die Fälle oben fahren den ganzen Weg über den Server, und das ist für die drei Zusagen des
// Guards auch richtig. Der fachliche Vergleich darunter hat aber Randfälle, die sich über eine
// API-Attrappe nur mühsam herstellen lassen: eine Antwortzeile, die gar kein Objekt ist, ein
// Schlüsselfeld, das die Suchmaske nicht führt, ein Betrag in zwei Schreibweisen. Sie stehen
// deshalb hier als Aufrufe von `checkDuplicates` mit eingespeister Nachschlage-Abfrage.
//
// **Es geht dabei kein Request hinaus**: `lookup` ist eine Funktion des Tests.

describe("Guard 6, der fachliche Vergleich", () => {
  /** Ein Eintrag mit abweichenden Schlüsselfeldern, sonst unverändert. */
  function withKeyFields(entry: ToolEntry, keyFields: readonly string[]): ToolEntry {
    return {
      ...entry,
      duplicateCheck: { tool: "bb_receipts_search", keyFields, perBatch: true },
    };
  }

  /** Ruft den Guard mit eingeschaltetem Schalter auf und merkt sich die Suchargumente. */
  async function run(
    entry: ToolEntry,
    args: Record<string, unknown>,
    rows: readonly unknown[] | (() => never),
    options: { resolveEntry?: (name: string) => ToolEntry | undefined } = {},
  ): Promise<{ hint: string | undefined; lookupArgs: Record<string, unknown> | null }> {
    const config = installTestConfig({ BB_MCP_DUPLICATE_CHECK: "on" });
    let seen: Record<string, unknown> | null = null;
    const lookup: DuplicateLookup = (_readEntry, lookupArgs) => {
      seen = { ...lookupArgs };
      if (typeof rows === "function") {
        rows();
      }
      return Promise.resolve(rows as readonly unknown[]);
    };
    const hint = await checkDuplicates({
      entry,
      args,
      config,
      resolveEntry:
        options.resolveEntry ?? ((name) => (name === SEARCH_ENTRY.name ? SEARCH_ENTRY : undefined)),
      lookup,
    });
    return { hint, lookupArgs: seen };
  }

  it("schlägt nicht nach, wenn das lesende Werkzeug nicht im Register steht", async () => {
    const { hint, lookupArgs } = await run(CREATE_ENTRY, NEW_RECEIPT, [], {
      resolveEntry: () => undefined,
    });
    expect(hint).toBeUndefined();
    // Kein Zusatzaufruf: Der Guard hat die Abfrage gar nicht erst gestellt.
    expect(lookupArgs).toBeNull();
  });

  it("schlägt nicht nach, wenn kein Schlüsselfeld in der Suchmaske vorkommt", async () => {
    // amount führt bb_receipts_search nicht als Suchfeld; damit bleibt kein Suchwert übrig.
    const { hint, lookupArgs } = await run(
      withKeyFields(CREATE_ENTRY, ["amount"]),
      NEW_RECEIPT,
      [],
    );
    expect(hint).toBeUndefined();
    expect(lookupArgs).toBeNull();
  });

  it("schlägt nicht nach, wenn der Stapel in jedem Schlüsselfeld verschiedene Werte trägt", async () => {
    const { hint, lookupArgs } = await run(
      batchEntry(),
      {
        receipts: [
          { counterparty: "Erfundene A GmbH", invoicenumber: "ER-1", amount: "10.00" },
          { counterparty: "Erfundene B GmbH", invoicenumber: "ER-2", amount: "20.00" },
        ],
      },
      [],
    );
    expect(hint).toBeUndefined();
    expect(lookupArgs).toBeNull();
  });

  it("lässt ein Schlüsselfeld weg, das nicht in jedem Stapelelement steht", async () => {
    const { hint, lookupArgs } = await run(
      batchEntry(),
      {
        receipts: [
          { counterparty: "Erfundene Bürobedarf GmbH", invoicenumber: "ER-1", amount: "10.00" },
          // Ohne invoicenumber, und oben steht auch keine.
          { counterparty: "Erfundene Bürobedarf GmbH", amount: "20.00" },
        ],
      },
      [],
    );
    expect(hint).toBeUndefined();
    expect(lookupArgs).toEqual({ counterparty: "Erfundene Bürobedarf GmbH" });
  });

  it("nimmt einen gemeinsamen Wert von der obersten Ebene, wenn er im Element fehlt", async () => {
    const { lookupArgs } = await run(
      batchEntry(),
      {
        counterparty: "Erfundene Bürobedarf GmbH",
        receipts: [
          { invoicenumber: "ER-1", amount: "10.00" },
          { invoicenumber: "ER-2", amount: "20.00" },
        ],
      },
      [],
    );
    // counterparty steht außerhalb des Behälters und gilt trotzdem für jedes Element.
    expect(lookupArgs).toEqual({ counterparty: "Erfundene Bürobedarf GmbH" });
  });

  it("lässt ein Schlüsselfeld weg, das der Aufruf gar nicht trägt", async () => {
    const { lookupArgs } = await run(
      CREATE_ENTRY,
      {
        date: "2026-01-10",
        amount: "884.65",
        counterparty: "Erfundene Bürobedarf GmbH",
      },
      [],
    );
    expect(lookupArgs).toEqual({ counterparty: "Erfundene Bürobedarf GmbH" });
  });

  it("hält zwei Schreibweisen desselben Betrags für denselben Wert", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const { hint } = await run(entry, { counterparty: "Erfundene Bürobedarf GmbH" }, [
      { id_by_customer: "4711", counterparty: "Erfundene Bürobedarf GmbH" },
    ]);
    expect(hint).toContain("MÖGLICHES DUPLIKAT");

    // Beträge werden in Ganzzahl-Cent verglichen, nicht als Zeichenkette und nie auf
    // Gleitkomma (Plan 7.4). Deutsche und englische Schreibweise sind derselbe Wert.
    const match = await run(
      withKeyFields(CREATE_ENTRY, ["counterparty", "invoicenumber"]),
      { counterparty: "884,65", invoicenumber: "ER-2026-0001" },
      [{ id_by_customer: "4712", counterparty: "884.65", invoicenumber: "ER-2026-0001" }],
    );
    expect(match.hint).toContain("MÖGLICHES DUPLIKAT");
  });

  it("hält zwei Werte für verschieden, wenn keiner davon ein Betrag ist", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const { hint } = await run(entry, { counterparty: "Erfundene A GmbH" }, [
      { id_by_customer: "4711", counterparty: "Erfundene B GmbH" },
    ]);
    expect(hint).toBeUndefined();
  });

  it("vergleicht Zahlen und Wahrheitswerte über ihre Textform", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const num = await run(entry, { counterparty: 4711 }, [
      { id_by_customer: 4711, counterparty: "4711" },
    ]);
    // Kennungen kommen gemessen mal als Zahl, mal als Zeichenkette zurück (Plan 0.3 Befund L3).
    expect(num.hint).toContain("id_by_customer 4711");

    const boolValue = await run(entry, { counterparty: true }, [
      { id_by_customer: "4712", counterparty: "true" },
    ]);
    expect(boolValue.hint).toContain("MÖGLICHES DUPLIKAT");
  });

  it("hält ein Objekt für keinen fachlichen Schlüssel", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    // Ein Objekt über die Zeichenkettenumwandlung zu vergleichen ergäbe [object Object], und
    // zwei verschiedene Objekte sähen damit gleich aus.
    const { hint } = await run(entry, { counterparty: "Erfundene Bürobedarf GmbH" }, [
      { id_by_customer: "4711", counterparty: { name: "Erfundene Bürobedarf GmbH" } },
    ]);
    expect(hint).toBeUndefined();
  });

  it("übergeht Antwortzeilen, die keine Objekte sind, und Zeilen ohne das Schlüsselfeld", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const { hint } = await run(entry, { counterparty: "Erfundene Bürobedarf GmbH" }, [
      null,
      "eine Zeichenkette",
      ["eine Liste"],
      { id_by_customer: "4711", invoicenumber: "ER-2026-0001" },
    ]);
    // Kein einziges vergleichbares Feld heißt: kein Treffer. Sonst wäre jede Zeile einer weit
    // gefassten Suche ein Duplikat.
    expect(hint).toBeUndefined();
  });

  it("nennt eine Zeile ohne id_by_customer als solche und zählt in der Einzahl", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const { hint } = await run(entry, { counterparty: "Erfundene Bürobedarf GmbH" }, [
      { counterparty: "Erfundene Bürobedarf GmbH" },
    ]);
    expect(hint).toContain("bereits einen Datensatz");
    expect(hint).toContain("ohne id_by_customer in der Antwort");
  });

  it("nennt höchstens fünf Treffer und zählt den Rest", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const rowSet = Array.from({ length: 8 }, (_unused, index) => ({
      id_by_customer: String(4711 + index),
      counterparty: "Erfundene Bürobedarf GmbH",
    }));
    const { hint } = await run(entry, { counterparty: "Erfundene Bürobedarf GmbH" }, rowSet);

    expect(hint).toContain("bereits 8 Datensätze");
    expect(hint).toContain("und 3 weitere");
    expect(hint).toContain("id_by_customer 4715");
    expect(hint).not.toContain("id_by_customer 4716");
    // Der Guard blockiert nicht, und das steht auch im Hinweis.
    expect(hint).toContain("NICHT blockiert");
  });

  it("schweigt, wenn die Nachschlage-Abfrage scheitert, gleich womit", async () => {
    const entry = withKeyFields(CREATE_ENTRY, ["counterparty"]);
    const args = { counterparty: "Erfundene Bürobedarf GmbH" };

    const withException = await run(entry, args, () => {
      throw new Error("die Nachschlage-Abfrage ist gescheitert");
    });
    expect(withException.hint).toBeUndefined();

    const withoutException = await run(entry, args, () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Genau das ist der Prüffall.
      throw "etwas Fremdes";
    });
    expect(withoutException.hint).toBeUndefined();
  });
});
