// Die Antwortgrenze BB_MCP_MAX_RESPONSE_TOKENS gilt für ALLE fünf Bündel (README 7.2).
//
// Geprüft wird nicht die Kürzungsmechanik im Kleinen, sondern die Zusage, die ein Betreiber
// liest: Wer die Variable senkt, um ein kleines Kontextfenster zu schützen, bekommt von jedem
// Bündel eine Antwort, die darunter bleibt. Jeder Fall fährt einen Großfall gegen die
// Nachbildung — mindestens 300 Zeilen beziehungsweise max_hits=100 über alle fünf Bereiche —
// und läuft dabei über `startBundleServer`, also über den echten Registrierpfad samt Textblock
// aus Unvollständigkeitszeile, Lückenliste und Zeilen des Bündels.
//
// Der schreibende Pfad von bb_reports_run läuft auch hier ausschließlich gegen die
// Nachbildung: /reports/create/* ersetzt serverseitig den zuvor erzeugten Bericht.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../../src/config/resolve.js";
import { estimateTokens } from "../../src/response/truncate.js";
import { pageOf, startBundleServer, type RunningBundleServer } from "../helpers/bundle-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

const ACCOUNTS = "/accounts/get";
const COST_LOCATIONS = "/cost-locations/get";
const CHART = "/settings/get/postingaccounts";
const RECEIPTS = "/receipts/get";
const TRANSACTION = "/transactions/get/815";
const TRANSACTION_ASSIGNMENTS = "/transactions/assigned-receipts/get";
const LEDGER = "/reports/get/sums/ledger";
const CREATE_BWA = "/reports/create/bwa";
const GET_BWA = "/reports/get/bwa";

/** Der Großfall dieser Datei. */
const BIG_ROWS = 300;

function list(rows: readonly unknown[]): { json: Record<string, unknown> } {
  return { json: { success: true, message: "", rows: rows.length, data: rows } };
}

function object(data: Record<string, unknown>): { json: Record<string, unknown> } {
  return { json: { success: true, message: "", data } };
}

function ledger(rows: readonly unknown[]): { json: Record<string, unknown> } {
  return {
    json: {
      success: true,
      message: "",
      report_sums_postingaccount_ledger: {
        integrityError: false,
        postingaccount_number: "1200",
        postingaccountLedger: rows,
      },
    },
  };
}

/** Eine vollständige Belegzeile, wie sie /transactions/assigned-receipts/get liefern kann. */
function assignedReceipt(index: number): Record<string, unknown> {
  const id = index + 1;
  return {
    id_by_customer: String(id),
    filename: `rechnung-${String(id)}-eingang-scan.pdf`,
    date: "2026-01-05",
    counterparty: "Bürobedarf Nordwest Handelsgesellschaft mbH",
    invoicenumber: `RE-2026-${String(id).padStart(5, "0")}`,
    amount: "119.00",
    payment_date: "2026-01-20",
  };
}

function receiptRow(index: number): Record<string, unknown> {
  const id = index + 1;
  return {
    id_by_customer: String(id),
    date: "2026-01-05",
    counterparty: "Bürobedarf Nordwest Handelsgesellschaft mbH",
    invoicenumber: `RE-2026-${String(id).padStart(5, "0")}`,
    amount: "119.00",
    payment_date: null,
    due_date: null,
    account: "1200",
    amount_paid: "0.00",
    deleted: "0",
  };
}

function ledgerRow(index: number): Record<string, unknown> {
  return {
    id_by_customer: index + 1,
    record_side: "debit",
    record_amount: "10.00",
    date: `2026-01-01 00:00:0${String(index % 10)}`,
    postingTextFull: `Sammelbuchung ${String(index + 1)} Bürobedarf Nordwest Handelsgesellschaft`,
    standard_chart: "skr03",
    counterRecordPostingaccountNumber: 4980,
    balanceAfterAbsolute: `${String(1000 + index)}.00`,
    balanceAfterSide: "debit",
    cost_location: "Verwaltung",
    receipts_id_by_customer: String(index + 1),
    transactions_id_by_customer: String(index + 1),
  };
}

/** Eine Kontozeile, deren Name den Suchbegriff dieses Tests trägt. */
function namedAccount(prefix: string, index: number, type: string): Record<string, unknown> {
  return {
    postingaccount_number: String(10_000 + index),
    name: `${prefix} Nordwest Handelsgesellschaft mbH Niederlassung ${String(index)}`,
    type,
    subtype: null,
  };
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

/** Die geschätzte Tokenzahl des Textblocks, als Zusage gegen die weiche Grenze. */
function assertWithinBudget(text: string): void {
  expect(estimateTokens(text)).toBeLessThanOrEqual(config.maxResponseTokens);
}

describe("Antwortbudget aller fünf Bündel im Großfall", () => {
  it("bb_assignments_get: 300 zugeordnete Belege bleiben im Budget", async () => {
    api.post(
      TRANSACTION,
      object({
        id_by_customer: 815,
        account: "1200",
        to_from: "Bürobedarf Nordwest Handelsgesellschaft mbH",
        booking_date: "2026-01-20",
        value_date: "2026-01-20",
        amount: "-119.00",
        currency: "EUR",
        purpose: "Sammelzahlung Januar 2026",
      }),
    );
    api.post(TRANSACTION_ASSIGNMENTS, list(pageOf(BIG_ROWS, assignedReceipt)));

    const result = await server.call("bb_assignments_get", { transaction_id_by_customer: 815 });

    expect(result.isError).toBe(false);
    // Keine Anreicherung: Die Zeilen tragen alle fachlich nötigen Felder bereits.
    expect(result.structured["enriched"]).toBe(0);
    assertWithinBudget(result.text);
  });

  it("bb_records_collect: 300 Belege bei max_rows=200 bleiben im Budget", async () => {
    api.post(RECEIPTS, list(pageOf(BIG_ROWS, receiptRow)));

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      max_rows: 200,
    });

    expect(result.isError).toBe(false);
    assertWithinBudget(result.text);
  });

  it("bb_balances_get: 300 Buchungszeilen bei max_rows=200 bleiben im Budget", async () => {
    api.post(ACCOUNTS, list([{ name: "Girokonto", postingaccount_number: "1200" }]));
    api.post(LEDGER, ledger(pageOf(BIG_ROWS, ledgerRow)));

    const result = await server.call("bb_balances_get", {
      account: "1200",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      max_rows: 200,
    });

    expect(result.isError).toBe(false);
    assertWithinBudget(result.text);
  });

  it("bb_masterdata_search: max_hits=100 über alle fünf Bereiche bleibt im Budget", async () => {
    api.post(
      ACCOUNTS,
      list(pageOf(120, (index) => namedAccount("Zahlungskonto", index, "account"))),
    );
    api.post(
      COST_LOCATIONS,
      list(
        pageOf(120, (index) => ({
          code: String(index + 1),
          name: `Kostenstelle Nordwest Handelsgesellschaft mbH Bereich ${String(index)}`,
        })),
      ),
    );
    api.post(
      CHART,
      list([
        ...pageOf(120, (index) => namedAccount("Sachkonto", index, "postingaccount")),
        ...pageOf(120, (index) => namedAccount("Debitor", index + 200, "debtor")),
        ...pageOf(120, (index) => namedAccount("Kreditor", index + 400, "creditor")),
      ]),
    );

    const result = await server.call("bb_masterdata_search", {
      query: "Nordwest",
      areas: ["payment_accounts", "posting_accounts", "debtors", "creditors", "cost_locations"],
      max_hits: 100,
    });

    expect(result.isError).toBe(false);
    assertWithinBudget(result.text);
  });

  it("bb_masterdata_search: der Arbeitskontext ohne query bleibt im Budget", async () => {
    // Ohne Suchbegriff sind nicht die Treffer der große Posten, sondern die Zusammenfassung
    // des Kontenrahmens: Ein Kontenrahmen über viele Tausenderblöcke wog vor der Kürzung
    // gemessen rund 10.700 Token.
    api.post(
      ACCOUNTS,
      list(
        pageOf(30, (index) => ({
          postingaccount_number: String(1200 + index),
          name: `Zahlungskonto Nordwest Handelsgesellschaft ${String(index)}`,
        })),
      ),
    );
    api.post(
      COST_LOCATIONS,
      list(
        pageOf(200, (index) => ({
          code: String(index + 1),
          name: `Kostenstelle Nordwest Handelsgesellschaft mbH Bereich ${String(index)}`,
        })),
      ),
    );
    api.post(
      CHART,
      list(
        pageOf(1300, (index) => ({
          postingaccount_number: String(1000 + index * 70),
          name: `Konto Nordwest Handelsgesellschaft mbH Niederlassung ${String(index)}`,
          type: index % 3 === 0 ? "debtor" : index % 3 === 1 ? "creditor" : "postingaccount",
          subtype: null,
        })),
      ),
    );

    const result = await server.call("bb_masterdata_search", { max_hits: 100 });

    expect(result.isError).toBe(false);
    assertWithinBudget(result.text);
  });

  it("bb_reports_run: eine große BWA bleibt im Budget", async () => {
    api.post(CREATE_BWA, { json: { success: true, message: "", id_by_customer: "123" } });
    api.post(GET_BWA, {
      json: {
        success: true,
        message: "",
        report: {
          integrityError: false,
          standardChart: "skr03",
          postingsRecordsCount: BIG_ROWS,
          uncompletedPostingsCount: 0,
          groups: pageOf(BIG_ROWS, (index) => ({
            name: `Gruppe ${String(index)} Bürobedarf Nordwest Handelsgesellschaft mbH`,
            postingaccount_number: String(4000 + index),
            amount: "119.00",
            amountPreviousYear: "99.00",
          })),
          totals: { amountsSum: "35700.00" },
        },
      },
    });

    const result = await server.call("bb_reports_run", {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-03-31",
    });

    expect(result.isError).toBe(false);
    assertWithinBudget(result.text);
  });
});
