// Die vier MCP-Resources.
//
// Geprüft wird hier ohne laufenden Server: `registerResources` bekommt eine Attrappe, die jede
// Anmeldung mitschreibt, und die Lesefunktionen werden danach einzeln aufgerufen. Das ist die
// einzige Stelle, an der sich die drei Zustände von `bb://postingaccounts` — Speicher aus,
// Speicher an aber leer, Speicher an mit Stand — nebeneinander prüfen lassen, ohne den
// Stammdatenspeicher über einen Werkzeugaufruf zu befüllen.
//
// **Es geht kein Request hinaus.** Dieses Modul ruft die API nicht auf, und der Speicher wird
// hier von Hand gefüllt.

import type { McpServer } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MasterDataStore } from "../../src/cache/store.js";
import {
  POSTINGACCOUNTS_TOOL,
  cacheDisabledNotice,
  createMasterDataStore,
  resetMasterDataStoreForTests,
} from "../../src/cache/store.js";
import { VAT_KEYS } from "../../src/schema/vocab.js";
import { POSTINGS_GUIDE, RESOURCE_URIS, registerResources } from "../../src/server/resources.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";

// --- Attrappe des Servers --------------------------------------------------------------

interface Registered {
  readonly name: string;
  readonly uri: string;
  readonly meta: { title: string; description: string; mimeType: string };
  readonly read: (uri: URL) => { contents: { uri: string; mimeType: string; text: string }[] };
}

function fakeServer(): { server: McpServer; registered: Registered[] } {
  const registered: Registered[] = [];
  const server = {
    registerResource(
      name: string,
      uri: string,
      meta: Registered["meta"],
      read: Registered["read"],
    ): void {
      registered.push({ name, uri, meta, read });
    },
  };
  return { server: server as unknown as McpServer, registered };
}

/** Der Text einer angemeldeten Resource, gelesen wie der Client es täte. */
function textOf(entry: Registered): string {
  const result = entry.read(new URL(entry.uri));
  expect(result.contents).toHaveLength(1);
  const first = result.contents[0];
  expect(first?.uri).toBe(entry.uri);
  expect(first?.mimeType).toBe("text/plain");
  return first?.text ?? "";
}

/** Meldet die vier Resources an einer frischen Attrappe an und liefert sie nach URI. */
function register(store?: MasterDataStore): Map<string, Registered> {
  const { server, registered } = fakeServer();
  const uris = registerResources(server, store === undefined ? {} : { store });
  expect(uris).toEqual([
    RESOURCE_URIS.accounts,
    RESOURCE_URIS.postings,
    RESOURCE_URIS.vatKeys,
    RESOURCE_URIS.postingAccounts,
  ]);
  expect(registered.map((entry) => entry.uri)).toEqual([...uris]);
  return new Map(registered.map((entry) => [entry.uri, entry]));
}

/** Ein eingeschalteter Speicher mit gestellter Uhr, damit das Alter nachrechenbar ist. */
function storeWithClock(nowRef: { value: number }, ttlMs = 60_000): MasterDataStore {
  return createMasterDataStore({ ttlMs, clock: { now: () => nowRef.value } });
}

beforeEach(() => {
  installTestConfig();
  resetMasterDataStoreForTests();
});

afterEach(() => {
  resetTestConfig();
  resetMasterDataStoreForTests();
});

// --- Anmeldung -------------------------------------------------------------------------

describe("registerResources", () => {
  it("meldet genau die vier URIs mit Titel, Beschreibung und Medientyp an", () => {
    const byUri = register(createMasterDataStore({ ttlMs: 0 }));

    expect([...byUri.keys()]).toEqual([
      "bb://guide/accounts",
      "bb://guide/postings",
      "bb://vat-keys",
      "bb://postingaccounts",
    ]);

    for (const entry of byUri.values()) {
      expect(entry.name).toMatch(/^bb-[a-z-]+$/);
      expect(entry.meta.title).not.toBe("");
      expect(entry.meta.description).not.toBe("");
      // text/plain und nicht text/markdown: Die Tabellen leben von ihrer Ausrichtung.
      expect(entry.meta.mimeType).toBe("text/plain");
    }
  });

  it("nimmt ohne übergebenen Speicher den prozessweiten aus der Konfiguration", () => {
    // Auslieferungszustand: BB_MCP_CACHE_TTL_MS ist 0, der prozessweite Speicher also aus.
    const byUri = register();
    const entry = byUri.get(RESOURCE_URIS.postingAccounts);
    expect(entry).toBeDefined();
    expect(textOf(entry as Registered)).toBe(cacheDisabledNotice());
  });
});

// --- Die drei festen Texte -------------------------------------------------------------

describe("Die drei festen Resources", () => {
  it("liefert die Kontenkunde mit allen vier Begriffen und der Falle gleichen Namens", () => {
    const text = textOf(
      register(createMasterDataStore({ ttlMs: 0 })).get(RESOURCE_URIS.accounts) as Registered,
    );

    for (const term of ["ZAHLUNGSKONTO", "SACHKONTO", "DEBITOR", "KREDITOR"]) {
      expect(text).toContain(term);
    }
    expect(text).toContain("payment_account_number");
    expect(text).toContain("postingaccount_filter");
  });

  it("liefert den Buchungswegweiser wortgleich zum Export aus instructions", () => {
    const text = textOf(
      register(createMasterDataStore({ ttlMs: 0 })).get(RESOURCE_URIS.postings) as Registered,
    );

    // Der Wegweiser steht genau einmal. Weicht die Resource vom Export ab, liefe der
    // Servertext mit einer anderen Fassung als die Resource (Weg 2).
    expect(text).toBe(POSTINGS_GUIDE);
    expect(text).toContain("bb_postings_create_for_receipt");
  });

  it("liefert alle 23 Steuerschlüssel mit deutscher Bezeichnung", () => {
    const text = textOf(
      register(createMasterDataStore({ ttlMs: 0 })).get(RESOURCE_URIS.vatKeys) as Registered,
    );

    expect(VAT_KEYS).toHaveLength(23);
    for (const key of VAT_KEYS) {
      expect(text).toContain(key);
    }
    expect(text).toContain("§19 UStG");
  });
});

// --- bb://postingaccounts, die drei Zustände --------------------------------------------

describe("bb://postingaccounts", () => {
  it("nennt bei abgeschaltetem Speicher den Weg über das Werkzeug", () => {
    const text = textOf(
      register(createMasterDataStore({ ttlMs: 0 })).get(
        RESOURCE_URIS.postingAccounts,
      ) as Registered,
    );

    expect(text).toBe(cacheDisabledNotice());
    expect(text).toContain("BB_MCP_CACHE_TTL_MS=0");
    expect(text).toContain(POSTINGACCOUNTS_TOOL);
  });

  it("sagt bei eingeschaltetem, aber leerem Speicher, dass noch nichts vorliegt", () => {
    const now = { value: 1_000 };
    const store = storeWithClock(now, 30_000);
    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("liegt noch nicht vor");
    expect(text).toContain("30000 ms");
    expect(text).toContain(POSTINGACCOUNTS_TOOL);
  });

  it("verweigert die Ausgabe, wenn der Stand keine Liste ist", () => {
    const now = { value: 1_000 };
    const store = storeWithClock(now);
    store.write(POSTINGACCOUNTS_TOOL, { rows: [] });

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    // Aus einer unerwarteten Form einen Kontenrahmen zu bauen hieße, geratene Daten als
    // echte auszugeben.
    expect(text).toContain("nicht die erwartete Listenform");
    expect(text).not.toContain("KONTENRAHMEN DES MANDANTEN");
  });

  it("gruppiert den Kontenrahmen nach type und sortiert die Blöcke", () => {
    const now = { value: 10_000 };
    const store = storeWithClock(now);
    store.write(POSTINGACCOUNTS_TOOL, [
      { postingaccount_number: "1200", name: "Bank", type: "account", subtype: "bank/institution" },
      { postingaccount_number: 4980, name: "Sonstiges", type: "postingaccount" },
      { postingaccount_number: "10001", name: "Kunde GmbH", type: "debtor", subtype: "default" },
      { postingaccount_number: "70001", name: "", type: "creditor" },
    ]);
    // Der Stand ist 2.400 ms alt; gerundet sind das 2 Sekunden.
    now.value = 12_400;

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("KONTENRAHMEN DES MANDANTEN");
    expect(text).toContain("abgelegt vor 2 Sekunden");
    expect(text).toContain("4 Zeilen, so wie");

    // Die Überschriften stehen alphabetisch, unabhängig von der Reihenfolge der Zeilen.
    const blocks = ["account (1)", "creditor (1)", "debtor (1)", "postingaccount (1)"];
    const positions = blocks.map((block) => text.indexOf(block));
    expect(positions.some((position) => position === -1)).toBe(false);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    // Zahl statt Zeichenkette, leerer Name, fehlender subtype.
    expect(text).toContain("  1200  Bank [bank/institution]");
    expect(text).toContain("  4980  Sonstiges");
    expect(text).toContain("  70001  (ohne Namen)");
    expect(text).not.toContain("ausgelassen");
  });

  it("nennt eine Zeile ohne type als 'ohne type' und rundet ein junges Alter auf eine Sekunde", () => {
    const now = { value: 500 };
    const store = storeWithClock(now);
    store.write(POSTINGACCOUNTS_TOOL, [{ postingaccount_number: "1000", name: "Kasse" }]);

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("ohne type (1)");
    // „vor 0 Sekunden" wäre keine Auskunft; die Untergrenze ist eine Sekunde.
    expect(text).toContain("abgelegt vor 1 Sekunde.");
    expect(text).toContain("1 Zeile, so wie");
  });

  it("lässt eine einzelne unbrauchbare Zeile aus und sagt es in der Einzahl", () => {
    const now = { value: 0 };
    const store = storeWithClock(now);
    store.write(POSTINGACCOUNTS_TOOL, [
      { postingaccount_number: "1200", name: "Bank", type: "account" },
      { name: "ohne Nummer", type: "account" },
    ]);

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("account (1)");
    expect(text).toContain("1 Zeile ohne verwertbare postingaccount_number wurde ausgelassen.");
  });

  it("lässt auch Zeilen aus, die gar keine Objekte sind, und zählt sie in der Mehrzahl", () => {
    const now = { value: 0 };
    const store = storeWithClock(now);
    store.write(POSTINGACCOUNTS_TOOL, [
      null,
      "eine Zeichenkette",
      { postingaccount_number: true, name: "unbrauchbarer Typ" },
      { postingaccount_number: "", name: "leere Nummer" },
      { postingaccount_number: "1200", name: "Bank", type: "account" },
    ]);

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("4 Zeilen ohne verwertbare postingaccount_number wurden ausgelassen.");
    expect(text).toContain("  1200  Bank");
  });

  it("sammelt mehrere Zeilen desselben type in einem Block", () => {
    const now = { value: 0 };
    const store = storeWithClock(now);
    store.write(POSTINGACCOUNTS_TOOL, [
      { postingaccount_number: "4980", name: "Sonstiges", type: "postingaccount" },
      { postingaccount_number: "4981", name: "Porto", type: "postingaccount" },
    ]);

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("postingaccount (2)");
    expect(text).toContain("  4980  Sonstiges");
    expect(text).toContain("  4981  Porto");
  });

  it("meldet einen abgelaufenen Stand wie einen fehlenden", () => {
    const now = { value: 0 };
    const store = storeWithClock(now, 1_000);
    store.write(POSTINGACCOUNTS_TOOL, [
      { postingaccount_number: "1200", name: "Bank", type: "account" },
    ]);
    now.value = 5_000;

    const text = textOf(register(store).get(RESOURCE_URIS.postingAccounts) as Registered);

    expect(text).toContain("liegt noch nicht vor");
  });

  it("liest den Speicher bei jedem Zugriff neu", () => {
    const now = { value: 0 };
    const store = storeWithClock(now);
    const entry = register(store).get(RESOURCE_URIS.postingAccounts) as Registered;

    expect(textOf(entry)).toContain("liegt noch nicht vor");

    store.write(POSTINGACCOUNTS_TOOL, [
      { postingaccount_number: "1200", name: "Bank", type: "account" },
    ]);

    expect(textOf(entry)).toContain("KONTENRAHMEN DES MANDANTEN");
  });
});
