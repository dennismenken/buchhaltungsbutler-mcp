// Guard 5: Betrags- und Stapelgrenze, positionsgenau (Plan 6.2, 4.7 Q4; AP10).
//
// Der Kern dieses Tests ist der Nachweis, dass Guard 5 **ohne Feldliste** auskommt: Die
// Mengenfelder findet er über `itemFields` des Registereintrags, die Betragsfelder über die
// Markierung aus `amountIn()`. Beide Ebenen — Stapelbehälter und geschachtelte Positionsliste —
// werden getrennt geprüft, und es wird nichts aufsummiert.
//
// Geprüft wird überwiegend `inspectLimits` unmittelbar. Das ist Absicht: Über den Server käme
// bei einer zu langen Liste schon Guard 3 (`maxItems` im Schema) oder Guard 4 (Q4) zuvor, und
// dann prüfte der Test die doppelte Absicherung statt Guard 5. Ein Durchlauf über den ganzen
// Server steht am Ende für den Fall, den nur Guard 5 kennt: die Betragsgrenze.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { checkLimits, inspectLimits } from "../../src/guards/limits.js";
import type { FieldSpec, ToolEntry } from "../../src/registry/types.js";
import { batchArray } from "../../src/schema/batch.js";
import { strictObject } from "../../src/schema/primitives.js";
import { amountIn, idByCustomer } from "../../src/schema/vocab.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// --- Fixtures -------------------------------------------------------------------------
//
// Ein Eintrag nach dem Muster der Werkzeuge 22 und 24: ein Stapelbehälter, dessen Elemente
// selbst eine Positionsliste tragen. Beide Ebenen führen ein Betragsfeld.
//
// Die Schemata bekommen `maxItems` ausdrücklich mit, damit sie ohne aufgelöste Konfiguration
// gebaut werden können; Guard 5 liest seine Mengengrenze ohnehin aus der Konfiguration und
// nicht aus dem Schema.

const POSITION_FIELDS: readonly FieldSpec[] = [
  {
    name: "amount",
    apiNames: ["amounts"],
    source: "body",
    required: true,
    description: "Betrag dieser Position.",
    schema: amountIn("der Betrag dieser Position"),
  },
];

const ELEMENT_FIELDS: readonly FieldSpec[] = [
  {
    name: "receipt_id_by_customer",
    apiNames: ["receipt_id_by_customer"],
    source: "body",
    required: true,
    description: "Kennung des Belegs.",
    schema: idByCustomer("des Belegs", "bb_receipts_search"),
  },
  {
    name: "amount",
    apiNames: ["amount"],
    source: "body",
    required: false,
    description: "Bruttobetrag des Belegs.",
    schema: amountIn("der Bruttobetrag des Belegs"),
  },
  {
    name: "positions",
    apiNames: ["amounts", "postingtexts"],
    source: "body",
    required: true,
    description: "Die Positionen dieses Stapelelements.",
    schema: z.array(strictObject({ amount: amountIn("der Betrag dieser Position") })).min(1),
    itemFields: [...POSITION_FIELDS],
    transform: "parallel-arrays",
  },
];

function batchEntry(): ToolEntry {
  return {
    name: "bb_postings_create_for_receipt_batch",
    title: "Buchungen zu Belegen anlegen",
    group: "postings",
    path: { literal: "/postings/add-batch/receipts" },
    effect: "create",
    toolClass: "B",
    tier: 3,
    description: "Legt Buchungen zu mehreren Belegen an.",
    mandatorySentence: "U3",
    fields: [
      {
        name: "receipts",
        apiNames: ["receipts"],
        source: "body",
        required: true,
        description: "Die Belege des Stapels.",
        schema: batchArray(
          strictObject({
            receipt_id_by_customer: idByCustomer("des Belegs", "bb_receipts_search"),
            amount: amountIn("der Bruttobetrag des Belegs").optional(),
            positions: z.array(strictObject({ amount: amountIn("der Betrag dieser Position") })),
          }),
          { description: "Die Belege des Stapels.", maxItems: 50 },
        ),
        itemFields: [...ELEMENT_FIELDS],
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
    verifyWith: { kind: "tool", tool: "bb_postings_search", argsFrom: {}, hint: "" },
    // Q4 fehlt bewusst: Sonst meldete Q4 (Guard 4) die zu lange Liste, und Guard 5 käme
    // in diesem Test nie an die Reihe. Ein echter Eintrag trägt Q4 zusätzlich, und das ist
    // die doppelte Absicherung aus Plan 4.7.
    crossChecks: [],
    invalidatesCache: [],
  };
}

/** Ein lesendes Werkzeug mit einem Betragsfilter. Es darf die Betragsgrenze nicht spüren. */
function readEntryWithAmount(): ToolEntry {
  return {
    name: "bb_postings_search",
    title: "Buchungen suchen",
    group: "postings",
    path: { literal: "/postings/get" },
    effect: "read",
    toolClass: "R",
    tier: 1,
    description: "Sucht Buchungen.",
    fields: [
      {
        name: "amount",
        apiNames: ["amount"],
        source: "body",
        required: false,
        description: "Betrag, nach dem gefiltert wird.",
        schema: amountIn("der Betrag, nach dem gefiltert wird"),
      },
    ],
    serverOnlyFields: [],
    omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
    responseContract: { container: "data", fields: {}, source: "dokumentiert" },
    shape: "list",
    concise: [],
    bucket: "default",
    timeoutTier: "normal",
    crossChecks: [],
    invalidatesCache: [],
  };
}

function positions(count: number, amount = "10.00"): { amount: string }[] {
  return Array.from({ length: count }, () => ({ amount }));
}

function stack(count: number, positionCount: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    receipt_id_by_customer: index + 1,
    positions: positions(positionCount),
  }));
}

let config: ResolvedConfig;
let api: ApiMock;

beforeEach(() => {
  api = mockApi();
  config = installTestConfig();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("Guard 5, Mengengrenze", () => {
  it("prüft beide Ebenen getrennt und summiert nichts auf", () => {
    // 50 Elemente mit je 50 Positionen: 2.500 Positionen insgesamt und trotzdem kein Verstoß.
    const result = inspectLimits(batchEntry(), { receipts: stack(50, 50) }, config);
    expect(result.maxItems).toBe(50);
    expect(result.violations).toEqual([]);
  });

  it("meldet den Behälter mit seiner Länge", () => {
    const result = inspectLimits(batchEntry(), { receipts: stack(51, 1) }, config);
    expect(result.violations).toEqual([
      { kind: "batch", location: "receipts", seen: "51 Einträge", limit: "50 Einträge" },
    ]);
  });

  it("meldet eine geschachtelte Positionsliste mit dem Index ihres Elements", () => {
    const args = {
      receipts: [...stack(2, 1), { receipt_id_by_customer: 3, positions: positions(51) }],
    };
    const result = inspectLimits(batchEntry(), args, config);
    expect(result.violations).toEqual([
      {
        kind: "batch",
        location: "receipts (Position 3).positions",
        seen: "51 Einträge",
        limit: "50 Einträge",
      },
    ]);
  });

  it("folgt BB_MCP_MAX_BATCH, wenn es kleiner ist als das Maximum der API", () => {
    const tighterConfig = installTestConfig({ BB_MCP_MAX_BATCH: "2" });
    const result = inspectLimits(batchEntry(), { receipts: stack(3, 1) }, tighterConfig);
    expect(result.maxItems).toBe(2);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.location).toBe("receipts");
  });
});

describe("Guard 5, Betragsgrenze", () => {
  it("findet Betragsfelder über die Markierung, skalar wie je Position", () => {
    const stricterConfig = installTestConfig({ BB_MCP_MAX_AMOUNT: "100.00" });
    const args = {
      receipts: [
        { receipt_id_by_customer: 1, amount: "50.00", positions: positions(1, "50.00") },
        { receipt_id_by_customer: 2, amount: "250.00", positions: positions(1, "99.99") },
        { receipt_id_by_customer: 3, positions: [{ amount: "40.00" }, { amount: "1000.00" }] },
      ],
    };
    const result = inspectLimits(batchEntry(), args, stricterConfig);
    expect(result.violations.map((violation) => violation.location)).toEqual([
      "receipts (Position 2).amount",
      "receipts (Position 3).positions (Position 2).amount",
    ]);
    expect(result.violations[0]).toEqual({
      kind: "amount",
      location: "receipts (Position 2).amount",
      seen: "250.00",
      limit: "100.00",
    });
  });

  it("prüft auch den Betrag eines negativen Vorzeichens gegen dieselbe Grenze", () => {
    const stricterConfig = installTestConfig({ BB_MCP_MAX_AMOUNT: "100.00" });
    const args = { receipts: [{ receipt_id_by_customer: 1, positions: positions(1, "-250.00") }] };
    const result = inspectLimits(batchEntry(), args, stricterConfig);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.seen).toBe("-250.00");
  });

  it("gilt nicht für ein lesendes Werkzeug", () => {
    const stricterConfig = installTestConfig({ BB_MCP_MAX_AMOUNT: "100.00" });
    const result = inspectLimits(readEntryWithAmount(), { amount: "999999.00" }, stricterConfig);
    expect(result.maxAmountCents).toBeNull();
    expect(result.violations).toEqual([]);
  });

  it("greift gar nicht, wenn BB_MCP_MAX_AMOUNT nicht gesetzt ist", () => {
    const result = inspectLimits(batchEntry(), { receipts: stack(1, 1) }, config);
    expect(result.maxAmountCents).toBeNull();
    expect(result.violations).toEqual([]);
  });
});

describe("Guard 5, Absagetext", () => {
  it("nennt beide Grenzen, wenn beide gerissen sind, und trägt Satz 1 aus 5.8", () => {
    const stricterConfig = installTestConfig({
      BB_MCP_MAX_AMOUNT: "100.00",
      BB_MCP_MAX_BATCH: "2",
    });
    const args = {
      receipts: [
        ...stack(2, 1),
        { receipt_id_by_customer: 3, amount: "500.00", positions: positions(1) },
      ],
    };
    const text = checkLimits(batchEntry(), args, stricterConfig);

    expect(text).toBeTypeOf("string");
    expect(text).toContain("reißt die Mengengrenze und die Betragsgrenze");
    expect(text).toContain("receipts hat 3 Einträge, erlaubt sind 2 Einträge.");
    expect(text).toContain(
      "receipts (Position 3).amount trägt 500.00, erlaubt sind höchstens 100.00.",
    );
    expect(text).toContain(
      "[Zustand] Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.",
    );
  });

  it("lehnt einen Aufruf über den ganzen Server ab, ohne einen Request abzusetzen", async () => {
    const stricterConfig = installTestConfig({ BB_MCP_MAX_AMOUNT: "100.00" });
    const built = createServer({
      config: stricterConfig,
      entries: [batchEntry()],
      store: createMasterDataStore({ ttlMs: 0 }),
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ap10-limittest", version: "0.0.0" });
    await built.server.connect(serverSide);
    await client.connect(clientSide);

    try {
      const result = await client.callTool({
        name: "bb_postings_create_for_receipt_batch",
        arguments: { receipts: [{ receipt_id_by_customer: 1, positions: positions(1, "500.00") }] },
      });
      const block = Array.isArray(result.content) ? result.content[0] : undefined;
      const text =
        typeof block === "object" && block !== null && "text" in block
          ? String((block as { text: unknown }).text)
          : "";

      expect(result.isError).toBe(true);
      expect(text).toContain("receipts (Position 1).positions (Position 1).amount trägt 500.00");
      expect(api.count()).toBe(0);
    } finally {
      await client.close();
      await built.server.close();
    }
  });
});
