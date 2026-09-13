// Der gemeinsame Vertrag der vier LESENDEN Bündel.
//
// Geprüft wird hier, was für alle gilt und deshalb nicht viermal geprüft werden soll: der
// Pflichtblock `bundle`, die Klasse als schärfste Klasse der Schritte, die Annotationen, die
// Namenslänge mit Clientpräfix, das Beschreibungsbudget, die Registrierung über den
// Gruppenschalter, das Verhalten unter BB_MCP_READ_ONLY und der Abbruch statt des Wartens am
// Token-Eimer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bb_assignments_get,
  bb_balances_get,
  bb_masterdata_search,
  bb_records_collect,
  BUNDLE_ENTRIES,
} from "../../src/bundles/index.js";
import { bundleDefinitionJson, buildBundleOutputSchema } from "../../src/bundles/schema.js";
import type { BundleEntry } from "../../src/bundles/types.js";
import { resolveToolGroups } from "../../src/config/tool-groups.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { SERVER_NAME } from "../../src/cli/clients/types.js";
import { tenantKey } from "../../src/http/auth.js";
import { RateLimiter } from "../../src/http/rate-limiter.js";
import {
  BUNDLE_DEFINITION_TOKEN_BUDGET,
  DESCRIPTION_CHAR_BUDGET_BY_TIER,
} from "../../src/registry/budget.js";
import { TOOL_CLASSES } from "../../src/registry/classes.js";
import { BUNDLE_TOOL_GROUP, TOOL_GROUPS } from "../../src/registry/groups.js";
import { createServer } from "../../src/server/create-server.js";
import { startBundleServer, type RunningBundleServer } from "../helpers/bundle-server.js";
import { tokenCount } from "../helpers/registry-fixtures.js";
import {
  installTestConfig,
  mockApi,
  resetTestConfig,
  TEST_CREDENTIALS,
  type ApiMock,
} from "../helpers/mock-api.js";

/** Die vier lesenden Bündel dieses Auftrags, namentlich und nicht gefiltert. */
const READ_BUNDLES: readonly BundleEntry[] = [
  bb_masterdata_search,
  bb_records_collect,
  bb_assignments_get,
  bb_balances_get,
];

/** Die Reihenfolge der Klassen nach Schärfe; die schärfste Klasse eines Bündels gewinnt. */
const CLASS_SEVERITY: Readonly<Record<string, number>> = {
  R: 0,
  A: 2,
  AR: 3,
  M: 2,
  D: 3,
  B: 3,
};

const MESSAGES_API_NAME_LIMIT = 64;

/**
 * Die Tokenlast aller fünf Bündeldefinitionen, mit dem echten Tokenizer über
 * `bundleDefinitionJson` — also über die Definition, wie `tools/list` sie ausliefert.
 */
function measuredBundleTokens(): number {
  return BUNDLE_ENTRIES.reduce((sum, entry) => sum + tokenCount(bundleDefinitionJson(entry)), 0);
}

let api: ApiMock;
let config: ResolvedConfig;

beforeEach(() => {
  config = installTestConfig();
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("Registereintrag der lesenden Bündel", () => {
  it("trägt die Gruppe bundles und die Wirkung read", () => {
    for (const entry of READ_BUNDLES) {
      expect(entry.group).toBe(BUNDLE_TOOL_GROUP);
      expect(entry.effect).toBe("read");
    }
  });

  it("trägt als toolClass die schärfste Klasse seiner Schritte", () => {
    for (const entry of READ_BUNDLES) {
      const sharpest = entry.steps.reduce(
        (worst, step) =>
          (CLASS_SEVERITY[step.toolClass] ?? 0) > (CLASS_SEVERITY[worst] ?? 0)
            ? step.toolClass
            : worst,
        "R" as BundleEntry["toolClass"],
      );
      expect(entry.toolClass).toBe(sharpest);
      // Die vier sind ausschließlich aus lesenden Schritten gebaut; sonst wäre der
      // Nur-Lesen-Schalter stillschweigend entwertet.
      expect(entry.toolClass).toBe("R");
    }
  });

  it("trägt readOnlyHint true und destructiveHint false", () => {
    for (const entry of READ_BUNDLES) {
      const annotations = TOOL_CLASSES[entry.toolClass].annotations;
      expect(annotations.readOnlyHint).toBe(true);
      expect(annotations.destructiveHint).toBe(false);
    }
  });

  it("bleibt mit dem Clientpräfix unter der Grenze der Messages API", () => {
    const prefix = `mcp__${SERVER_NAME}__`;
    for (const entry of READ_BUNDLES) {
      expect(`${prefix}${entry.name}`.length).toBeLessThanOrEqual(MESSAGES_API_NAME_LIMIT);
    }
  });

  it("hält das Beschreibungsbudget seiner Stufe ein und nennt die ersetzten Werkzeuge", () => {
    for (const entry of READ_BUNDLES) {
      expect(entry.description.length).toBeLessThanOrEqual(
        DESCRIPTION_CHAR_BUDGET_BY_TIER[entry.tier],
      );
      // Jede Beschreibung nennt mindestens ein Einzelwerkzeug, damit ein Agent nicht beides tut.
      expect(entry.description).toMatch(/bb_[a-z_]+/);
      expect(entry.title.length).toBeLessThanOrEqual(40);
    }
  });

  it("trägt einen searchHint mit den Wörtern einer Buchhalterin", () => {
    for (const entry of READ_BUNDLES) {
      expect(entry.searchHint.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("nennt für jeden Schritt das Endpunktwerkzeug als Rückfallebene", () => {
    for (const entry of READ_BUNDLES) {
      for (const step of entry.steps) {
        expect(step.fallbackTool).toMatch(/^bb_/);
      }
    }
  });

  it("hält das eigene Tokenbudget der Gruppe ein", () => {
    const measured = measuredBundleTokens();
    expect(
      measured,
      `Das Budget der Bündelgruppe ist gerissen: gemessen ${String(measured)} Token, Grenze ${String(BUNDLE_DEFINITION_TOKEN_BUDGET)}. Gekürzt wird an den Bündeldefinitionen; die Grenze anzuheben ist eine Entscheidung des Projektinhabers mit Eintrag in CHANGELOG.md.`,
    ).toBeLessThanOrEqual(BUNDLE_DEFINITION_TOKEN_BUDGET);
  });

  // Die Messung der Bündelgruppe steht an genau einer Stelle, in `src/registry/groups.ts`.
  // `src/registry/budget.ts` verweist darauf, statt die Zahlen abzuschreiben — vorher standen
  // sie an beiden Stellen und nannten Verschiedenes (6.675 im Kommentar, 6.852 in der Tabelle).
  // Diese Prüfung hält beide Zahlenreihen gegeneinander, damit das nicht wiederkommt.
  it("nennt in groups.ts, im Budget und in der echten Messung dieselbe Zahl", () => {
    const measured = measuredBundleTokens();
    expect(
      TOOL_GROUPS[BUNDLE_TOOL_GROUP].measuredTokens,
      `measuredTokens der Gruppe bundles in src/registry/groups.ts steht auf ${String(TOOL_GROUPS[BUNDLE_TOOL_GROUP].measuredTokens)}, gemessen sind ${String(measured)} Token. Die Zahl und ihre fünf Summanden sind dort nachzuziehen; src/registry/budget.ts verweist darauf und schreibt sie nicht ab.`,
    ).toBe(measured);
    expect(
      BUNDLE_DEFINITION_TOKEN_BUDGET,
      "BUNDLE_DEFINITION_TOKEN_BUDGET liegt unter der eingecheckten Messung der Gruppe bundles. Eine Grenze unterhalb des ausgelieferten Standes ist kein Budget, sondern ein dauerhaft roter Testlauf.",
    ).toBeGreaterThanOrEqual(measured);
  });
});

describe("Ausgabeschema der lesenden Bündel", () => {
  it("führt den Block bundle mit allen acht Schlüsseln als Pflicht", () => {
    for (const entry of READ_BUNDLES) {
      const schema = buildBundleOutputSchema(entry);
      const required = schema["required"] as string[];
      expect(required).toContain("bundle");
      expect(required).toContain("success");
      const properties = schema["properties"] as Record<string, Record<string, unknown>>;
      const block = properties["bundle"];
      expect(block["required"]).toEqual([
        "complete",
        "stopped_because",
        "steps",
        "api_calls",
        "api_calls_limit",
        "gaps",
        "written",
        "continuation",
      ]);
      // Offen wie jedes Ausgabeschema dieses Servers.
      expect(schema["additionalProperties"]).toBe(true);
    }
  });
});

describe("Registrierung und Schalter", () => {
  it("registriert die Bündel über createServer, sobald die Gruppe aktiv ist", () => {
    const built = createServer({ config });
    expect(built.bundles.map((entry) => entry.name)).toEqual(
      BUNDLE_ENTRIES.map((entry) => entry.name),
    );
  });

  it("registriert kein Bündel, wenn die Gruppe abgeschaltet ist", async () => {
    const groups = resolveToolGroups({ include: "receipts" });
    const server = await startBundleServer({ config: { ...config, toolGroups: groups } });
    expect(server.registered).toEqual([]);
    expect(await server.listNames()).toEqual([]);
    await server.close();
  });

  it("registriert die Bündel auch dann, wenn keine Endpunktgruppe aktiv ist", async () => {
    const groups = resolveToolGroups({ include: "bundles" });
    const server = await startBundleServer({ config: { ...config, toolGroups: groups } });
    expect(server.registered.length).toBe(BUNDLE_ENTRIES.length);
    await server.close();
  });

  it("lässt alle vier lesenden Bündel unter BB_MCP_READ_ONLY laufen", async () => {
    const readOnly = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    const server = await startBundleServer({ config: readOnly });
    api.post("/accounts/get", { json: { success: true, message: "", rows: 0, data: [] } });

    const result = await server.call("bb_masterdata_search", { areas: ["payment_accounts"] });

    expect(result.isError).toBe(false);
    const names = new Set(READ_BUNDLES.map((entry) => entry.name));
    for (const entry of server.registered.filter((row) => names.has(row.name))) {
      expect(entry.blockedByReadOnly).toBe(false);
    }
    // Gegenprobe: Ein Bündel, das nicht Klasse R ist, wird vom selben Schalter gesperrt.
    for (const entry of server.registered.filter((row) => !names.has(row.name))) {
      expect(entry.blockedByReadOnly).toBe(true);
    }
    await server.close();
  });
});

describe("Abbruch statt Warten am Token-Eimer", () => {
  let server: RunningBundleServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("bricht vor dem zusätzlichen Aufruf ab und liefert, was es hat", async () => {
    // Eine stehende Uhr: Der Eimer füllt sich im Test nicht nach, und der Füllstand ist damit
    // genau der eingestellte. `sleep` wird nie erreicht, weil vorher abgebrochen wird.
    const frozen = { now: (): number => 0, sleep: (): Promise<void> => Promise.resolve() };
    // Zehn Token je Minute heißt ein Token je sechs Sekunden; über SLOW_WAIT_MS von fünf.
    const limiter = new RateLimiter({ ratePerMinute: 10, clock: frozen });
    const tenant = tenantKey(TEST_CREDENTIALS.BB_API_KEY);
    for (let index = 0; index < 9; index += 1) {
      await limiter.acquire({
        tenant,
        bucket: "default",
        context: { toolName: "test", specPath: "/x", toolClass: "R" },
      });
    }
    server = await startBundleServer({ config, limiter });
    api.post("/accounts/get", {
      json: {
        success: true,
        message: "",
        rows: 1,
        data: [{ name: "Kasse", postingaccount_number: "1000" }],
      },
    });
    api.post("/cost-locations/get", { json: { success: true, message: "", rows: 0, data: [] } });

    const result = await server.call("bb_masterdata_search", {
      areas: ["payment_accounts", "cost_locations"],
    });

    // Der erste Aufruf geht hinaus, der zweite nicht: Eine wahrheitsgemäße Teilantwort ist
    // mehr wert als eine vollständige nach vierzig Sekunden.
    expect(result.isError).toBe(false);
    expect(api.count("/accounts/get")).toBe(1);
    expect(api.count("/cost-locations/get")).toBe(0);
    expect(result.bundle["stopped_because"]).toBe("rate_limit");
    expect(result.bundle["complete"]).toBe(false);
    const cost = result.structured["cost_locations"] as Record<string, unknown>;
    expect(cost["hits"]).toBeNull();
    const payment = result.structured["payment_accounts"] as Record<string, unknown>;
    expect((payment["hits"] as unknown[]).length).toBe(1);
  });
});
