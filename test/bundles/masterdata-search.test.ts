// bb_masterdata_search: Abläufe, Teilfehler, Seitenobergrenze (Bauvorlage Abschnitt 4.1).
//
// Der Kern dieser Datei sind nicht die Erfolgsfälle, sondern die Aussagen über das, was FEHLT:
// ein ausgefallener Bereich trägt `hits` = null und nicht das leere Array (R5), ein nicht
// vollständig durchsuchter Suchraum sagt nie „nicht gefunden" (R4), und der Kontenrahmen wird
// nie vollständig ausgegeben.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../../src/config/resolve.js";
import {
  gapsOf,
  pageOf,
  startBundleServer,
  type RunningBundleServer,
} from "../helpers/bundle-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

const ACCOUNTS = "/accounts/get";
const COST_LOCATIONS = "/cost-locations/get";
const CHART = "/settings/get/postingaccounts";

const ACCOUNT_ROWS = [
  { name: "Girokonto 1200", postingaccount_number: "1200" },
  { name: "PayPal", postingaccount_number: "1201" },
  { name: "Kasse", postingaccount_number: "1000" },
];

const CHART_ROWS = [
  { postingaccount_number: "4980", name: "Bürobedarf", type: "postingaccount", subtype: null },
  { postingaccount_number: "6815", name: "Beiträge", type: "postingaccount", subtype: null },
  { postingaccount_number: "10001", name: "Muster Kunde GmbH", type: "debtor", subtype: null },
  { postingaccount_number: "70001", name: "Bürobedarf Nordwest", type: "creditor", subtype: null },
];

function list(rows: readonly unknown[]): { json: Record<string, unknown> } {
  return { json: { success: true, message: "", rows: rows.length, data: rows } };
}

let api: ApiMock;
let config: ResolvedConfig;
let server: RunningBundleServer;

beforeEach(async () => {
  config = installTestConfig();
  api = mockApi();
  server = await startBundleServer({ config });
});

afterEach(async () => {
  await server.close();
  api.close();
  resetTestConfig();
});

describe("bb_masterdata_search, Suche", () => {
  it("findet ein Zahlungskonto über den Namen und nennt die Kontonummer", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([]));
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", { query: "paypal" });

    expect(result.isError).toBe(false);
    expect(result.bundle["complete"]).toBe(true);
    expect(result.bundle["api_calls"]).toBe(3);
    expect(result.bundle["api_calls_limit"]).toBe(5);
    expect(result.bundle["gaps"]).toEqual([]);
    expect(result.bundle["written"]).toBe("");
    const payment = result.structured["payment_accounts"] as Record<string, unknown>;
    expect(payment["hits"]).toEqual([{ postingaccount_number: "1201", name: "PayPal" }]);
    expect(payment["rows_read"]).toBe(3);
    expect(result.text).toContain("1201");
  });

  it("sucht in allen Bereichen und trennt Sachkonto, Debitor und Kreditor", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([]));
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", { query: "bürobedarf" });

    const posting = result.structured["posting_accounts"] as Record<string, unknown>;
    const creditors = result.structured["creditors"] as Record<string, unknown>;
    expect((posting["hits"] as unknown[]).length).toBe(1);
    expect((creditors["hits"] as unknown[]).length).toBe(1);
    expect(result.text).toContain("Kreditor (creditors)");
  });

  it("verweist bei null Treffern auf den anderen Weg über die Gegenpartei des Belegs", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([]));
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", { query: "gibtesnicht" });

    expect(result.bundle["complete"]).toBe(true);
    expect(result.text).toContain("bb_records_collect");
    expect(result.text).toContain("counterparty");
    const posting = result.structured["posting_accounts"] as Record<string, unknown>;
    // Nachweislich keine: das LEERE Array, nicht null (R5).
    expect(posting["hits"]).toEqual([]);
  });

  it("kappt je Bereich und weist die Zahl der passenden Zeilen aus", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([]));
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", { query: "konto", max_hits: 1 });

    const payment = result.structured["payment_accounts"] as Record<string, unknown>;
    expect(payment["matched"]).toBe(1);
    expect((payment["hits"] as unknown[]).length).toBe(1);
  });
});

describe("bb_masterdata_search, Überblick ohne Suchbegriff", () => {
  it("fasst den Kontenrahmen zusammen und sagt, dass die Einzelkonten fehlen", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([{ code: "abc", name: "Fuhrpark" }]));
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", {});

    const posting = result.structured["posting_accounts"] as Record<string, unknown>;
    expect(posting["hits_state"]).toBe("summarized");
    expect(posting["hits"]).toBeNull();
    expect(posting["summary"]).not.toBeNull();
    expect(result.text).toContain("NICHT enthalten");
    // Die Zahlungskonten und die Kostenstellen kommen dagegen vollständig.
    const payment = result.structured["payment_accounts"] as Record<string, unknown>;
    expect((payment["hits"] as unknown[]).length).toBe(3);
    const cost = result.structured["cost_locations"] as Record<string, unknown>;
    expect((cost["hits"] as unknown[]).length).toBe(1);
  });

  it("grenzt auf die angeforderten Bereiche ein und spart die übrigen Aufrufe", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));

    const result = await server.call("bb_masterdata_search", { areas: ["payment_accounts"] });

    expect(api.count()).toBe(1);
    expect(result.bundle["api_calls"]).toBe(1);
    expect(result.structured["cost_locations"]).toBeNull();
  });
});

describe("bb_masterdata_search, Teilfehler", () => {
  it("liefert die übrigen Bereiche, wenn die Kostenstellen ausfallen", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, {
      status: 400,
      json: { success: false, error_code: 1, message: "Fehler" },
    });
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", { query: "paypal" });

    expect(result.isError).toBe(false);
    expect(result.bundle["complete"]).toBe(false);
    const cost = result.structured["cost_locations"] as Record<string, unknown>;
    // Nicht ermittelt heißt null, nicht das leere Array (R5).
    expect(cost["hits"]).toBeNull();
    expect(cost["hits_state"]).toBe("error");
    const payment = result.structured["payment_accounts"] as Record<string, unknown>;
    expect((payment["hits"] as unknown[]).length).toBe(1);
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("bb_cost_locations_search");
    expect(result.text.startsWith("Unvollständig:")).toBe(true);
  });

  it("meldet einen Fehler, wenn nicht ein einziger Schritt erfolgreich war", async () => {
    const failure = { status: 401, json: { success: false, error_code: 3, message: "no access" } };
    api.post(ACCOUNTS, failure);
    api.post(COST_LOCATIONS, failure);
    api.post(CHART, failure);

    const result = await server.call("bb_masterdata_search", { query: "paypal" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("[Was]");
    // error_code 3 beendet den Lauf sofort: Die übrigen Endpunkte werden nicht mehr gefragt.
    expect(api.count()).toBe(1);
  });

  it("bricht nach error_code 11 ab und nennt die nicht abgerufenen Bereiche", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, {
      status: 400,
      json: { success: false, error_code: 11, message: "inaktiv" },
    });
    api.post(CHART, list(CHART_ROWS));

    const result = await server.call("bb_masterdata_search", { query: "paypal" });

    expect(api.count(CHART)).toBe(0);
    expect(result.bundle["complete"]).toBe(false);
    const posting = result.structured["posting_accounts"] as Record<string, unknown>;
    expect(posting["hits"]).toBeNull();
    expect(gapsOf(result.bundle).some((gap) => String(gap["what"]).includes("Sachkonten"))).toBe(
      true,
    );
  });
});

describe("bb_masterdata_search, Seitenobergrenze", () => {
  it("hört nach drei Seiten auf, nennt das offset und sagt nie 'nicht gefunden'", async () => {
    const full = pageOf(1000, (index) => ({
      postingaccount_number: String(20000 + index),
      name: `Konto ${String(index)}`,
      type: "postingaccount",
      subtype: null,
    }));
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([]));
    api.post(CHART, list(full));

    const result = await server.call("bb_masterdata_search", {
      query: "gibtesnicht",
      areas: ["posting_accounts"],
    });

    expect(api.count(CHART)).toBe(3);
    expect(result.bundle["complete"]).toBe(false);
    expect(result.bundle["stopped_because"]).toBe("page_limit");
    expect(result.bundle["continuation"]).toMatchObject({ offset: 3000 });
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("offset=3000");
    // R4: kein Negativbefund ohne Vollabdeckung.
    expect(result.text).toContain("nicht ausgeschlossen");
  });

  it("hält die wirksame Obergrenze an BB_MCP_RATE_LIMIT", async () => {
    await server.close();
    config = installTestConfig({ BB_MCP_RATE_LIMIT: "10" });
    server = await startBundleServer({ config });
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(COST_LOCATIONS, list([]));
    api.post(
      CHART,
      list(
        pageOf(1000, (index) => ({
          postingaccount_number: String(30000 + index),
          name: `Konto ${String(index)}`,
          type: "postingaccount",
          subtype: null,
        })),
      ),
    );

    const result = await server.call("bb_masterdata_search", { query: "konto" });

    expect(result.bundle["api_calls_limit"]).toBe(3);
    expect(result.bundle["api_calls"]).toBe(3);
    expect(result.bundle["stopped_because"]).toBe("page_limit");
  });
});
