import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cacheDisabledNotice,
  CACHEABLE_TOOLS,
  createMasterDataStore,
  getMasterDataStore,
  isCacheableTool,
  POSTINGACCOUNTS_TOOL,
  resetMasterDataStoreForTests,
  type CacheClock,
} from "../../src/cache/store.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";

// Die Zusagen: „BB_MCP_CACHE_TTL_MS=0 liefert keinen Treffer, Ablauf nach TTL über eine
// kontrollierte Uhr, Invalidierung nach invalidatesCache; Negativprüfung: /accounts/get und
// Bewegungsdaten landen nie im Speicher."

/** Eine gestellte Uhr. Der Ablauf ist damit ohne Warten prüfbar. */
function fakeClock(): CacheClock & { advance(ms: number): void } {
  let currentTime = 1_000;
  return {
    now: () => currentTime,
    advance(ms: number) {
      currentTime += ms;
    },
  };
}

afterEach(() => {
  resetMasterDataStoreForTests();
  resetTestConfig();
});

describe("Die Vorgabe: BB_MCP_CACHE_TTL_MS=0 schaltet ihn vollständig ab", () => {
  it("meldet sich als abgeschaltet, legt nichts ab und liefert nie einen Treffer", () => {
    const store = createMasterDataStore({ ttlMs: 0, clock: fakeClock() });
    expect(store.isEnabled()).toBe(false);
    expect(store.ttlMs()).toBe(0);

    expect(store.write(POSTINGACCOUNTS_TOOL, [{ postingaccount_number: "4980" }])).toBe(false);
    expect(store.size()).toBe(0);
    expect(store.read(POSTINGACCOUNTS_TOOL)).toBeUndefined();
  });

  it("hat keinen Zweig, in dem ein abgelaufener Wert doch benutzt würde", () => {
    const clock = fakeClock();
    const store = createMasterDataStore({ ttlMs: 0, clock: clock });
    store.write(POSTINGACCOUNTS_TOOL, ["egal"]);
    for (const step of [0, 1, 1_000, 86_400_000]) {
      clock.advance(step);
      expect(store.read(POSTINGACCOUNTS_TOOL)).toBeUndefined();
    }
    expect(store.size()).toBe(0);
  });

  it("ist im Auslieferungszustand der Konfiguration aus", () => {
    installTestConfig();
    const store = getMasterDataStore();
    expect(store.isEnabled()).toBe(false);
    expect(store.ttlMs()).toBe(0);
  });

  it("liest die Haltbarkeit aus der eingefrorenen Konfiguration, wenn sie gesetzt ist", () => {
    installTestConfig({ BB_MCP_CACHE_TTL_MS: "60000" });
    const store = getMasterDataStore();
    expect(store.isEnabled()).toBe(true);
    expect(store.ttlMs()).toBe(60_000);
    // Derselbe Prozessspeicher bei jedem Zugriff.
    expect(getMasterDataStore()).toBe(store);
  });

  it("nennt im Absagetext der Resource die Variable und das Werkzeug", () => {
    const text = cacheDisabledNotice();
    expect(text).toContain("BB_MCP_CACHE_TTL_MS=0");
    expect(text).toContain(POSTINGACCOUNTS_TOOL);
  });
});

describe("Der Ablauf läuft über die eingespeiste Uhr", () => {
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
  });

  it("liefert einen Treffer mit Alter, solange die Haltbarkeit nicht erreicht ist", () => {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: clock });
    store.write(POSTINGACCOUNTS_TOOL, [{ postingaccount_number: "4980" }]);

    clock.advance(43_000);
    const hit = store.read(POSTINGACCOUNTS_TOOL);
    expect(hit?.ageMs).toBe(43_000);
    expect(hit?.payload).toEqual([{ postingaccount_number: "4980" }]);
  });

  it("invalidatorsFor den Eintrag genau mit Erreichen der Haltbarkeit", () => {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: clock });
    store.write(POSTINGACCOUNTS_TOOL, ["stand"]);

    clock.advance(59_999);
    expect(store.read(POSTINGACCOUNTS_TOOL)).toBeDefined();

    clock.advance(1);
    expect(store.read(POSTINGACCOUNTS_TOOL)).toBeUndefined();
    // Der abgelaufene Eintrag ist weg und nicht nur unsichtbar.
    expect(store.size()).toBe(0);
  });

  it("benutzt Date.now nicht: eine stehende Uhr lässt nichts ablaufen", () => {
    const store = createMasterDataStore({ ttlMs: 1, clock: { now: () => 5 } });
    store.write(POSTINGACCOUNTS_TOOL, ["stand"]);
    expect(store.read(POSTINGACCOUNTS_TOOL)?.ageMs).toBe(0);
  });
});

describe("Speicherfähig sind ausschließlich die vier Werkzeuge der Tabelle", () => {
  it("führt genau diese vier", () => {
    expect([...CACHEABLE_TOOLS]).toEqual([
      "bb_postingaccounts_search",
      "bb_debtors_search",
      "bb_creditors_search",
      "bb_cost_locations_search",
    ]);
  });

  it("beantwortet die Frage auch am Speicher selbst", () => {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: fakeClock() });
    expect(store.isCacheable(POSTINGACCOUNTS_TOOL)).toBe(true);
    expect(store.isCacheable("bb_payment_accounts_list")).toBe(false);
  });

  it("führt bb_payment_accounts_list ausdrücklich nicht", () => {
    // /accounts/get wird nie zwischengespeichert (Auflösung des Widerspruchs).
    expect(isCacheableTool("bb_payment_accounts_list")).toBe(false);
  });

  it("legt Bewegungsdaten auch dann nicht ab, wenn jemand es verlangt", () => {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: fakeClock() });
    for (const toolName of [
      "bb_payment_accounts_list",
      "bb_receipts_search",
      "bb_receipts_get",
      "bb_transactions_search",
      "bb_postings_search",
      "bb_reports_get_bwa",
    ]) {
      expect(store.write(toolName, ["stand"])).toBe(false);
      expect(store.read(toolName)).toBeUndefined();
    }
    expect(store.size()).toBe(0);
  });

  it("legt die vier speicherfähigen ab", () => {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: fakeClock() });
    for (const toolName of CACHEABLE_TOOLS) {
      expect(store.write(toolName, [toolName])).toBe(true);
    }
    expect(store.size()).toBe(CACHEABLE_TOOLS.length);
  });
});

describe("Die Invalidierung kommt aus dem Register, nicht aus diesem Modul", () => {
  /**
   * Die Tabelle, so wie sie in den Feldern `invalidatesCache` der
   * Registereinträge stehen wird. Der Speicher bekommt nur die
   * Werkzeugnamen übergeben und kennt diese Zuordnung selbst nicht.
   */
  const INVALIDATED_BY: Readonly<Record<string, readonly string[]>> = {
    bb_postingaccounts_search: [
      "bb_postingaccounts_create",
      "bb_postingaccounts_update",
      // Die nicht offensichtliche Zeile: /settings/get/postingaccounts ist eine
      // Vereinigungsliste und enthält Debitoren und Kreditoren.
      "bb_debtors_create",
      "bb_debtors_create_batch",
      "bb_debtors_update",
      "bb_creditors_create",
      "bb_creditors_create_batch",
      "bb_creditors_update",
    ],
    bb_debtors_search: ["bb_debtors_create", "bb_debtors_create_batch", "bb_debtors_update"],
    bb_creditors_search: [
      "bb_creditors_create",
      "bb_creditors_create_batch",
      "bb_creditors_update",
    ],
    bb_cost_locations_search: [
      "bb_cost_locations_create",
      "bb_cost_locations_update",
      "bb_cost_locations_delete",
    ],
  };

  /** Wessen Stand ein schreibendes Werkzeug invalidatorsFor: die Tabelle oben, umgedreht. */
  function invalidatorsFor(writingTool: string): string[] {
    return Object.entries(INVALIDATED_BY)
      .filter(([, triggers]) => triggers.includes(writingTool))
      .map(([stored]) => stored);
  }

  function filledStore() {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: fakeClock() });
    for (const toolName of CACHEABLE_TOOLS) {
      store.write(toolName, [toolName]);
    }
    return store;
  }

  it.each(Object.keys(INVALIDATED_BY))("hält den Stand von %s vorrätig", (toolName) => {
    expect(filledStore().read(toolName)).toBeDefined();
  });

  it("invalidatorsFor je Zeile der Tabelle genau den genannten Stand", () => {
    for (const [stored, triggers] of Object.entries(INVALIDATED_BY)) {
      for (const writingTool of triggers) {
        const store = filledStore();
        const discarded = store.invalidate(invalidatorsFor(writingTool));
        expect(discarded, `${writingTool} invalidatorsFor ${stored}`).toContain(stored);
        expect(store.read(stored)).toBeUndefined();
      }
    }
  });

  it("invalidatorsFor mit jedem Debitoren- und Kreditorenwerkzeug auch den Sachkontenstand", () => {
    const masterDataTools = [
      "bb_debtors_create",
      "bb_debtors_create_batch",
      "bb_debtors_update",
      "bb_creditors_create",
      "bb_creditors_create_batch",
      "bb_creditors_update",
    ];
    for (const writingTool of masterDataTools) {
      const store = filledStore();
      store.invalidate(invalidatorsFor(writingTool));
      expect(store.read("bb_postingaccounts_search"), writingTool).toBeUndefined();
    }
  });

  it("lässt die übrigen Stände stehen", () => {
    const store = filledStore();
    store.invalidate(invalidatorsFor("bb_cost_locations_update"));
    expect(store.read("bb_cost_locations_search")).toBeUndefined();
    expect(store.read("bb_postingaccounts_search")).toBeDefined();
    expect(store.read("bb_debtors_search")).toBeDefined();
    expect(store.read("bb_creditors_search")).toBeDefined();
  });

  it("invalidatorsFor nichts bei einem Werkzeug ohne invalidatesCache", () => {
    const store = filledStore();
    // bb_payment_accounts_create trägt ein leeres invalidatesCache.
    expect(store.invalidate([])).toEqual([]);
    expect(store.size()).toBe(CACHEABLE_TOOLS.length);
  });

  it("meldet nur, was wirklich weg ist", () => {
    const store = createMasterDataStore({ ttlMs: 60_000, clock: fakeClock() });
    store.write("bb_debtors_search", ["stand"]);
    expect(store.invalidate(["bb_debtors_search", "bb_creditors_search"])).toEqual([
      "bb_debtors_search",
    ]);
  });

  it("leert den ganzen Speicher auf Wunsch", () => {
    const store = filledStore();
    store.clear();
    expect(store.size()).toBe(0);
  });
});
