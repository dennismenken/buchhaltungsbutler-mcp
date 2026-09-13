// bb_balances_get: Kontostand, Namensauflösung, Kürzung in der Mitte (Abschnitt 4.5).
//
// Der Kern: **Der Saldo steht in der letzten Zeile, also darf bei einer Kürzung nie die letzte
// Zeile wegfallen.** Dazu die beiden Ehrlichkeitsregeln: Ein leeres Kontenblatt ist kein Saldo
// von 0,00, und eine mehrdeutige Namensauflösung holt gar kein Kontenblatt.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../../src/config/resolve.js";
import { gapsOf, startBundleServer, type RunningBundleServer } from "../helpers/bundle-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

const ACCOUNTS = "/accounts/get";
const LEDGER = "/reports/get/sums/ledger";

const ACCOUNT_ROWS = [
  { name: "Girokonto", postingaccount_number: "1200" },
  { name: "PayPal Geschäft", postingaccount_number: "1201" },
  { name: "PayPal Privat", postingaccount_number: "1202" },
];

function ledgerRow(index: number, balance: string): Record<string, unknown> {
  return {
    id_by_customer: index,
    record_side: "debit",
    record_amount: "10.00",
    date: `2026-01-${String(index).padStart(2, "0")} 00:00:00`,
    postingTextFull: `Buchung ${String(index)}`,
    standard_chart: "skr03",
    counterRecordPostingaccountNumber: 4980,
    balanceAfterAbsolute: balance,
    balanceAfterSide: "debit",
    cost_location: null,
    receipts_id_by_customer: null,
    transactions_id_by_customer: null,
  };
}

function ledger(
  rows: readonly unknown[],
  integrityError = false,
): { json: Record<string, unknown> } {
  return {
    json: {
      success: true,
      message: "",
      report_sums_postingaccount_ledger: {
        integrityError,
        postingaccount_number: "1200",
        postingaccountLedger: rows,
      },
    },
  };
}

function list(rows: readonly unknown[]): { json: Record<string, unknown> } {
  return { json: { success: true, message: "", rows: rows.length, data: rows } };
}

const PERIOD = { date_from: "2026-01-01", date_to: "2026-01-31" };

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

describe("bb_balances_get, Kontostand", () => {
  it("nimmt eine numerische Angabe als Kontonummer und braucht nur einen Aufruf", async () => {
    api.post(LEDGER, ledger([ledgerRow(1, "10.00"), ledgerRow(2, "45097.03")]));

    const result = await server.call("bb_balances_get", { account: "1200", ...PERIOD });

    expect(result.isError).toBe(false);
    expect(api.count(ACCOUNTS)).toBe(0);
    expect(result.bundle["api_calls"]).toBe(1);
    expect(result.bundle["api_calls_limit"]).toBe(2);
    expect(result.structured["balance_end"]).toMatchObject({
      amount: "45097.03",
      side: "debit",
    });
    expect(result.structured["standard_chart"]).toBe("skr03");
    expect(result.structured["posting_count"]).toBe(2);
    expect(result.text).toContain("45097.03 Soll");
    expect(result.text).toContain("einschließlich");
    const request = await api.lastRequest(LEDGER);
    expect(request.body).toMatchObject({ postingaccount_number: "1200", date_from: "2026-01-01" });
  });

  it("löst einen eindeutigen Kontonamen auf und sagt, welcher Weg gegriffen hat", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(LEDGER, ledger([ledgerRow(1, "10.00")]));

    const result = await server.call("bb_balances_get", { account: "Girokonto", ...PERIOD });

    expect(result.bundle["api_calls"]).toBe(2);
    expect(result.structured["account"]).toMatchObject({
      postingaccount_number: "1200",
      name: "Girokonto",
      resolved_via: "name",
    });
    expect(result.text).toContain("über den Namen aufgelöst");
  });

  it("sagt bei leerem Kontenblatt nicht 'Saldo 0'", async () => {
    api.post(LEDGER, ledger([]));

    const result = await server.call("bb_balances_get", { account: "1200", ...PERIOD });

    expect(result.structured["balance_end"]).toBeNull();
    expect(result.structured["posting_count"]).toBe(0);
    expect(result.text).toContain("KEIN Saldo");
  });

  it("stellt einen integrityError vor jede Zahl", async () => {
    api.post(LEDGER, ledger([ledgerRow(1, "10.00")], true));

    const result = await server.call("bb_balances_get", { account: "1200", ...PERIOD });

    expect(result.structured["integrity_error"]).toBe(true);
    expect(result.text.startsWith("ACHTUNG")).toBe(true);
  });
});

describe("bb_balances_get, Kürzung", () => {
  it("kürzt in der Mitte und behält die letzte Zeile mit dem Saldo", async () => {
    const rows = Array.from({ length: 100 }, (_unused, index) =>
      ledgerRow(index + 1, String((index + 1) * 10)),
    );
    api.post(LEDGER, ledger(rows));

    const result = await server.call("bb_balances_get", {
      account: "1200",
      ...PERIOD,
      max_rows: 10,
    });

    const shown = result.structured["rows"] as Record<string, unknown>[];
    expect(shown).toHaveLength(10);
    expect(result.structured["rows_omitted"]).toBe(90);
    // Die erste und die LETZTE Zeile sind dabei, die Mitte fehlt.
    expect(shown[0]?.["postingTextFull"]).toBe("Buchung 1");
    expect(shown[9]?.["postingTextFull"]).toBe("Buchung 100");
    expect(result.structured["balance_end"]).toMatchObject({ amount: "1000" });
    expect(result.text).toContain("aus der MITTE");
  });

  it("nennt max_rows als Grund und behauptet kein Antwortbudget, das nicht gekürzt hat", async () => {
    // Der gemessene Live-Fall: Konto 1200, 62 Buchungszeilen, max_rows=8. Gekürzt hat allein
    // max_rows; das Antwortbudget ist mit 20.000 Token weit davon entfernt zu greifen.
    await server.close();
    config = installTestConfig({ BB_MCP_MAX_RESPONSE_TOKENS: "20000" });
    server = await startBundleServer({ config });
    const rows = Array.from({ length: 62 }, (_unused, index) =>
      ledgerRow(index + 1, String((index + 1) * 10)),
    );
    api.post(LEDGER, ledger(rows));

    const result = await server.call("bb_balances_get", {
      account: "1200",
      ...PERIOD,
      max_rows: 8,
    });

    expect(result.structured["rows_omitted"]).toBe(54);
    expect(result.text).toContain("aus der MITTE");
    expect(result.text).toContain("Gekürzt hat max_rows");
    // Die Kürzungsmeldung des Antwortbudgets darf hier in keiner ihrer Fassungen stehen.
    expect(result.text).not.toContain("um im Antwortbudget zu bleiben");
    expect(result.text).not.toContain("gelieferten Zeilen werden angezeigt");
    expect(result.text).not.toContain("enger filtern");
  });

  it("nennt das Antwortbudget, wenn es tatsächlich gekürzt hat", async () => {
    await server.close();
    config = installTestConfig({ BB_MCP_MAX_RESPONSE_TOKENS: "600" });
    server = await startBundleServer({ config });
    const rows = Array.from({ length: 62 }, (_unused, index) =>
      ledgerRow(index + 1, String((index + 1) * 10)),
    );
    api.post(LEDGER, ledger(rows));

    const result = await server.call("bb_balances_get", { account: "1200", ...PERIOD });

    expect(result.structured["rows_omitted"]).toBeGreaterThan(0);
    expect(result.text).toContain("um im Antwortbudget zu bleiben");
    expect(result.text).not.toContain("Gekürzt hat max_rows");
  });

  it("projiziert auf die zehn Felder des Kontenblatts", async () => {
    api.post(LEDGER, ledger([ledgerRow(1, "10.00")]));

    const result = await server.call("bb_balances_get", { account: "1200", ...PERIOD });

    const shown = result.structured["rows"] as Record<string, unknown>[];
    expect(Object.keys(shown[0] ?? {}).sort()).toEqual([
      "balanceAfterAbsolute",
      "balanceAfterSide",
      "cost_location",
      "counterRecordPostingaccountNumber",
      "date",
      "postingTextFull",
      "receipts_id_by_customer",
      "record_amount",
      "record_side",
      "transactions_id_by_customer",
    ]);
  });
});

describe("bb_balances_get, Teilfehler", () => {
  it("rät bei mehreren Namenstreffern nicht und holt kein Kontenblatt", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(LEDGER, ledger([]));

    const result = await server.call("bb_balances_get", { account: "PayPal", ...PERIOD });

    expect(api.count(LEDGER)).toBe(0);
    expect(result.bundle["complete"]).toBe(false);
    expect(result.structured["account"]).toBeNull();
    expect((result.structured["account_candidates"] as unknown[]).length).toBe(2);
    expect(result.text).toContain("bb_masterdata_search");
  });

  it("behält die Auflösungsarbeit, wenn das Kontenblatt scheitert", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(LEDGER, {
      status: 400,
      json: { success: false, error_code: 1, message: "kaputt" },
    });

    const result = await server.call("bb_balances_get", { account: "Girokonto", ...PERIOD });

    expect(result.isError).toBe(false);
    expect(result.structured["account"]).toMatchObject({ postingaccount_number: "1200" });
    expect(result.structured["rows"]).toBeNull();
    expect(result.bundle["complete"]).toBe(false);
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("bb_reports_get_ledger");
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("1200");
  });

  it("meldet einen Fehler, wenn schon die Kontenliste ausfällt", async () => {
    api.post(ACCOUNTS, {
      status: 401,
      json: { success: false, error_code: 3, message: "no access" },
    });
    api.post(LEDGER, ledger([]));

    const result = await server.call("bb_balances_get", { account: "Girokonto", ...PERIOD });

    expect(result.isError).toBe(true);
    expect(api.count(LEDGER)).toBe(0);
  });

  it("lehnt vertauschte Zeitgrenzen ab, bevor etwas hinausgeht", async () => {
    const result = await server.call("bb_balances_get", {
      account: "1200",
      date_from: "2026-02-01",
      date_to: "2026-01-01",
    });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
  });
});
