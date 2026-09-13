// Der Gruppenschalter an der Registrierung (N5).
//
// Nachgewiesen wird die Entscheidung aus `docs/entwicklung/buendelwerkzeuge.md` Abschnitt 7:
// Ein Werkzeug einer abgeschalteten Gruppe wird **gar nicht erst registriert** und steht damit
// auch nicht mit `enabled: false` in `tools/list`. Das ist der bewusste Gegensatz zum
// Nur-Lesen-Schalter, der gesperrte Werkzeuge sichtbar lässt und erst beim Aufruf absagt.
//
// Geprüft wird gegen den **echten** Registerstand und über eine echte MCP-Verbindung: Eine
// Prüfung an Attrappen sagte nichts darüber, ob dieser Server bei `BB_MCP_TOOL_GROUPS=reports`
// wirklich fünf Werkzeuge anmeldet.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import { TOOL_GROUP_NAMES, type ToolGroup } from "../../src/registry/groups.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

/**
 * Die Werkzeugnamen einer Gruppe, aus dem echten Register.
 *
 * Beide Verzeichnisse werden gelesen: die 54 Endpunktwerkzeuge aus `index.generated.ts` und die
 * Bündelwerkzeuge aus `src/bundles/index.ts`. Die Gruppe `bundles` führt ausschließlich Bündel,
 * jede andere ausschließlich Endpunktwerkzeuge; die Reihenfolge ist die der Registrierung
 * (erst die Endpunktwerkzeuge, dann die Bündel).
 */
function namesOf(group: ToolGroup): string[] {
  return [
    ...TOOL_ENTRIES.filter((entry) => entry.group === group).map((entry) => entry.name),
    ...BUNDLE_ENTRIES.filter((entry) => entry.group === group).map((entry) => entry.name),
  ];
}

/** Alles, was dieser Server ohne jede Einschränkung anmeldet. */
const ALL_NAMES: readonly string[] = [
  ...TOOL_ENTRIES.map((entry) => entry.name),
  ...BUNDLE_ENTRIES.map((entry) => entry.name),
];

/** Meldet den Server mit dieser Konfiguration an und gibt die Namen aus `tools/list` zurück. */
async function listedTools(config: ResolvedConfig): Promise<string[]> {
  const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "gruppen-test", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  try {
    const listed = await client.listTools();
    return listed.tools.map((tool) => tool.name);
  } finally {
    await client.close();
    await built.server.close();
  }
}

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("ohne die beiden Variablen", () => {
  it("meldet alle 54 Endpunktwerkzeuge und die Bündel an", async () => {
    const names = await listedTools(installTestConfig());
    expect(names).toHaveLength(ALL_NAMES.length);
    expect(names).toEqual(ALL_NAMES);
  });
});

describe("die Positivliste", () => {
  it("meldet genau die Werkzeuge der genannten Gruppe an", async () => {
    const names = await listedTools(installTestConfig({ BB_MCP_TOOL_GROUPS: "reports" }));
    expect(names.sort()).toEqual(namesOf("reports").sort());
  });

  it("meldet die Werkzeuge mehrerer Gruppen an und sonst nichts", async () => {
    const names = await listedTools(
      installTestConfig({ BB_MCP_TOOL_GROUPS: "receipts,payment_accounts" }),
    );
    expect(names.sort()).toEqual([...namesOf("receipts"), ...namesOf("payment_accounts")].sort());
    expect(names).not.toContain("bb_postings_search");
  });

  it("meldet unter dem Profil bundles kein einziges Endpunktwerkzeug an", async () => {
    // Das eigentliche Profil aus der Bauvorlage: Unter `BB_MCP_TOOL_GROUPS=bundles` ist keine
    // Endpunktgruppe aktiv, und trotzdem wird registriert — ein Bündel ruft die HTTP-Schicht
    // auf und hängt an keiner Endpunktgruppe (Abschnitt 7).
    const names = await listedTools(installTestConfig({ BB_MCP_TOOL_GROUPS: "bundles" }));
    expect(names).toEqual(namesOf("bundles"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of TOOL_ENTRIES.map((entry) => entry.name)) {
      expect(names).not.toContain(name);
    }
  });
});

describe("die Negativliste", () => {
  it("lässt genau die genannte Gruppe weg", async () => {
    const names = await listedTools(installTestConfig({ BB_MCP_TOOL_GROUPS_EXCLUDE: "postings" }));
    const postings = namesOf("postings");
    expect(postings.length).toBeGreaterThan(0);
    expect(names).toHaveLength(ALL_NAMES.length - postings.length);
    for (const name of postings) {
      expect(names).not.toContain(name);
    }
  });
});

describe("jede Gruppe für sich", () => {
  it("meldet für jede besetzte Gruppe genau ihre Werkzeuge an", async () => {
    const problems: string[] = [];
    for (const group of TOOL_GROUP_NAMES) {
      const expected = namesOf(group);
      if (expected.length === 0) continue;
      const names = await listedTools(installTestConfig({ BB_MCP_TOOL_GROUPS: group }));
      if (names.sort().join(",") !== [...expected].sort().join(",")) {
        problems.push(
          `${group}: angemeldet [${names.join(", ")}], erwartet [${expected.join(", ")}]`,
        );
      }
      resetTestConfig();
    }
    expect(problems.join("\n")).toBe("");
  });
});

describe("das Zusammenspiel mit dem Nur-Lesen-Schalter", () => {
  it("versteckt nichts, was der Nur-Lesen-Schalter nur sperrt", async () => {
    // Der Nur-Lesen-Schalter lässt die Werkzeugliste unverändert; nur der Gruppenschalter
    // kürzt sie. Beide zusammen kürzen genau um die Gruppen und um nichts weiter.
    const readOnlyOnly = await listedTools(installTestConfig({ BB_MCP_READ_ONLY: "true" }));
    expect(readOnlyOnly).toHaveLength(ALL_NAMES.length);
    resetTestConfig();

    const both = await listedTools(
      installTestConfig({ BB_MCP_READ_ONLY: "true", BB_MCP_TOOL_GROUPS: "reports" }),
    );
    expect(both.sort()).toEqual(namesOf("reports").sort());
    // Auch die beiden gesperrten AR-Werkzeuge stehen weiter in der Liste: Gesperrt ist nicht
    // versteckt (src/guards/read-only.ts).
    expect(both).toContain("bb_reports_create_bwa");
  });
});

describe("die instructions", () => {
  it("nennen die aktiven Gruppen und die abgeschalteten namentlich", async () => {
    const config = installTestConfig({ BB_MCP_TOOL_GROUPS: "reports" });
    const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
    expect(built.instructions).toContain("WERKZEUGGRUPPEN DIESER INSTALLATION");
    expect(built.instructions).toContain("Angemeldet sind 1 von 12 Gruppen: reports.");
    expect(built.instructions).toContain("postings");
    // Der volle Umfang darf nicht als Zahl der angemeldeten Werkzeuge dastehen: Genannt werden
    // beide Zahlen, jede als das, was sie ist. Beide sind gerechnet und keine Literale.
    expect(built.instructions).toContain(`im vollen Umfang ${String(TOOL_ENTRIES.length)}`);
    expect(built.instructions).toContain(
      `meldet davon ${String(namesOf("reports").length)} Werkzeuge an`,
    );
    await built.server.close();
  });

  it("nennen ohne Gruppenschalter den vollen Bestand samt Bündeln", async () => {
    const config = installTestConfig();
    const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
    expect(built.instructions).toContain(`Angemeldet: ${String(ALL_NAMES.length)} Werkzeuge`);
    expect(built.instructions).toContain("Alle sind aufrufbar, die schreibenden eingeschlossen");
    expect(built.instructions).toContain("Angemeldet sind alle 12 Gruppen");
    await built.server.close();
  });
});
