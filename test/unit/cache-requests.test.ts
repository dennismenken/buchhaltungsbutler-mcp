import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createMasterDataStore,
  isCacheableTool,
  type MasterDataStore,
} from "../../src/cache/store.js";
import { callEndpoint } from "../../src/http/client.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";
import {
  PAYMENT_ACCOUNTS_LIST,
  POSTINGACCOUNTS_SEARCH,
  POSTINGS_SEARCH,
  RECEIPTS_SEARCH,
  TRANSACTIONS_SEARCH,
} from "../golden/entries.js";
import { goldenReply } from "../golden/index.js";

// Die Negativprüfung: „/accounts/get und alle
// Bewegungsdaten werden nie zwischengespeichert. Der Test ruft die Werkzeuge bei
// eingeschaltetem Speicher zweimal auf und verlangt ZWEI Requests am Mock."
//
// Gemessen wird am MockAgent und nicht an einer Zusicherung des Speichers: Ein Guard, der zu
// spät greift, hat den Request schon abgesetzt, und das ist nur am Mock zu sehen.

let api: ApiMock;
let store: MasterDataStore;

beforeEach(() => {
  installTestConfig({ BB_MCP_CACHE_TTL_MS: "60000" });
  api = mockApi();
  store = createMasterDataStore({ ttlMs: 60_000, clock: { now: () => 0 } });
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

/**
 * Der Ausschnitt des generischen Handlers, der den Speicher betrifft: befragen
 * **nach** den Guards und **vor** dem Rate-Limiter, bei einem Treffer kein Request, nach einer
 * erfolgreichen Antwort füllen. Der Handler hat eigene Tests; hier wird nur diese
 * Reihenfolge nachgestellt, damit die Zusicherung am Mock messbar ist.
 */
async function callWithCache(entry: ToolEntry): Promise<{ fromCache: boolean }> {
  const specPath = "literal" in entry.path ? entry.path.literal : entry.path.specPath;
  if (isCacheableTool(entry.name)) {
    const hit = store.read(entry.name);
    if (hit !== undefined) {
      return { fromCache: true };
    }
  }
  const result = await callEndpoint({
    toolName: entry.name,
    toolClass: entry.toolClass,
    specPath,
    requestPath: specPath,
    shape: entry.shape,
    bucket: entry.bucket,
    timeoutTier: entry.timeoutTier,
    body: {},
  });
  store.write(entry.name, result.envelope.shape === "list" ? result.envelope.data : null);
  return { fromCache: false };
}

describe("Bewegungsdaten und /accounts/get werden nie zwischengespeichert", () => {
  const cases: readonly [ToolEntry, string, string][] = [
    [PAYMENT_ACCOUNTS_LIST, "/accounts/get", "accounts-get-list"],
    [RECEIPTS_SEARCH, "/receipts/get", "receipts-get-list"],
    [TRANSACTIONS_SEARCH, "/transactions/get", "transactions-get-list"],
    [POSTINGS_SEARCH, "/postings/get", "receipts-get-list-empty"],
  ];

  it.each(cases)("%#: zwei Aufrufe ergeben zwei Requests", async (entry, path, golden) => {
    api.post(path, goldenReply(golden));

    const first = await callWithCache(entry);
    const second = await callWithCache(entry);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(false);
    expect(api.count(path)).toBe(2);
    expect(store.size()).toBe(0);
  });

  it("gilt auch bei eingeschaltetem Speicher und gefülltem Stammdatenstand", async () => {
    api.post("/settings/get/postingaccounts", goldenReply("postingaccounts-get-list"));
    api.post("/accounts/get", goldenReply("accounts-get-list"));

    await callWithCache(POSTINGACCOUNTS_SEARCH);
    expect(store.size()).toBe(1);

    await callWithCache(PAYMENT_ACCOUNTS_LIST);
    await callWithCache(PAYMENT_ACCOUNTS_LIST);
    expect(api.count("/accounts/get")).toBe(2);
  });
});

describe("Die vier speicherfähigen Werkzeuge sparen den zweiten Request", () => {
  it("setzt beim zweiten Aufruf keinen Request ab", async () => {
    api.post("/settings/get/postingaccounts", goldenReply("postingaccounts-get-list"));

    const first = await callWithCache(POSTINGACCOUNTS_SEARCH);
    const second = await callWithCache(POSTINGACCOUNTS_SEARCH);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(api.count("/settings/get/postingaccounts")).toBe(1);
  });

  it("macht aus einem Aufruf null und nie zwei", async () => {
    api.post("/settings/get/postingaccounts", goldenReply("postingaccounts-get-list"));
    for (let run = 0; run < 5; run++) {
      await callWithCache(POSTINGACCOUNTS_SEARCH);
    }
    expect(api.count("/settings/get/postingaccounts")).toBe(1);
    expect(api.count()).toBe(1);
  });

  it("holt nach dem Verwerfen wieder frisch", async () => {
    api.post("/settings/get/postingaccounts", goldenReply("postingaccounts-get-list"));

    await callWithCache(POSTINGACCOUNTS_SEARCH);
    // Ein Debitorenwerkzeug verwirft laut Register auch den Sachkontenstand.
    store.invalidate(["bb_postingaccounts_search", "bb_debtors_search"]);
    await callWithCache(POSTINGACCOUNTS_SEARCH);

    expect(api.count("/settings/get/postingaccounts")).toBe(2);
  });
});

describe("Bei der Vorgabe BB_MCP_CACHE_TTL_MS=0 gibt es den Zwischenschritt nicht", () => {
  it("setzt auch beim zweiten Aufruf einen Request ab", async () => {
    store = createMasterDataStore({ ttlMs: 0, clock: { now: () => 0 } });
    api.post("/settings/get/postingaccounts", goldenReply("postingaccounts-get-list"));

    await callWithCache(POSTINGACCOUNTS_SEARCH);
    await callWithCache(POSTINGACCOUNTS_SEARCH);

    expect(api.count("/settings/get/postingaccounts")).toBe(2);
    expect(store.size()).toBe(0);
  });
});
