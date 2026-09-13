// bb_records_collect: Blättern, Kennzahlen, Teilfehler, Namensauflösung (Abschnitt 4.2).
//
// Die beiden wichtigsten Zusagen dieser Datei: **Keine Kennzahl ohne Vollständigkeit** (R1) —
// eine abgebrochene Sammlung liefert keine Summe, sondern die Zahl der gelesenen Zeilen und das
// erreichte offset — und **die Namensauflösung rät nie**: Mehrere oder keine Treffer beenden
// den Aufruf, BEVOR die erste Zeile geholt wird.

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
const RECEIPTS = "/receipts/get";
const TRANSACTIONS = "/transactions/get";
const POSTINGS = "/postings/get";

const ACCOUNT_ROWS = [
  { name: "Girokonto", postingaccount_number: "1200" },
  { name: "PayPal Geschäft", postingaccount_number: "1201" },
  { name: "PayPal Privat", postingaccount_number: "1202" },
];

function receipt(id: number, amount: string, date: string): Record<string, unknown> {
  return {
    id_by_customer: String(id),
    date,
    counterparty: "Bürobedarf Nordwest GmbH",
    invoicenumber: `RE-${String(id)}`,
    amount,
    payment_date: null,
    due_date: null,
    account: "1200",
    amount_paid: "0.00",
    deleted: "0",
  };
}

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

describe("bb_records_collect, Belege", () => {
  it("läuft über beide Richtungen und hält den Bestandsstand je Richtung getrennt", async () => {
    api.post(RECEIPTS, (request) =>
      request.attempt === 1
        ? list([receipt(1, "119.00", "2026-01-05"), receipt(2, "50.00", "2026-02-10")])
        : list([receipt(3, "31.00", "2026-01-20")]),
    );

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      date_from: "2026-01-01",
      date_to: "2026-02-28",
    });

    expect(result.isError).toBe(false);
    expect(result.bundle["complete"]).toBe(true);
    expect(result.bundle["api_calls"]).toBe(2);
    expect(result.structured["rows_read"]).toBe(3);
    expect(result.structured["sum_of_rows_read"]).toBe("200.00");
    const directions = result.structured["directions"] as Record<string, unknown>[];
    expect(directions.map((entry) => entry["key"])).toEqual(["inbound", "outbound"]);
    expect(directions[0]?.["rows_read"]).toBe(2);
    expect(directions[1]?.["rows_read"]).toBe(1);
  });

  it("kennzeichnet bei beiden Richtungen jede Zeile und summiert je Richtung getrennt", async () => {
    api.post(RECEIPTS, (request) =>
      request.attempt === 1
        ? list([receipt(1, "119.00", "2026-01-05"), receipt(2, "50.00", "2026-02-10")])
        : list([receipt(3, "31.00", "2026-01-20")]),
    );

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "both",
      max_rows: 10,
    });

    // Was in den Zeilen WIRKLICH steht: Jede trägt den Durchlauf, aus dem sie stammt — in der
    // Projektion und damit auch in der Tabelle des Textblocks.
    const rows = result.structured["rows"] as Record<string, unknown>[];
    expect(rows.map((row) => row["list_direction"])).toEqual(["inbound", "inbound", "outbound"]);
    expect(result.text).toContain("list_direction");
    // Die Gesamtsumme mischt beide Richtungen, und die Antwort sagt genau das.
    expect(result.structured["sum_of_rows_read"]).toBe("200.00");
    expect(result.text).toContain("Verbindlichkeiten und Forderungen in einer Zahl");
    // Getrennt verfügbar ist sie trotzdem: je Richtung, und nur bei vollständiger Richtung.
    const directions = result.structured["directions"] as Record<string, unknown>[];
    expect(directions[0]).toMatchObject({ key: "inbound", sum: "169.00", sum_cents: 16900 });
    expect(directions[1]).toMatchObject({ key: "outbound", sum: "31.00", sum_cents: 3100 });
    expect(result.text).toContain(
      "inbound: 2 Zeilen, offset 2, 1 Seiten, vollständig, Summe 169.00",
    );
  });

  it("liefert ohne max_rows keine Einzelzeilen, aber Gruppen nach Monat", async () => {
    api.post(RECEIPTS, (request) =>
      request.attempt === 1
        ? list([receipt(1, "119.00", "2026-01-05"), receipt(2, "50.00", "2026-02-10")])
        : list([]),
    );

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
    });

    expect(result.structured["rows"]).toEqual([]);
    const groups = result.structured["groups"] as Record<string, unknown>[];
    expect(groups.map((group) => group["key"])).toEqual(["2026-01", "2026-02"]);
    expect(groups[0]?.["sum"]).toBe("119.00");
    expect(result.text).toContain("max_rows steht auf 0");
  });

  it("gibt Einzelzeilen erst ab max_rows, projiziert wie bb_receipts_search und ergänzt die Richtung", async () => {
    api.post(RECEIPTS, list([receipt(1, "119.00", "2026-01-05")]));

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
      max_rows: 5,
    });

    const rows = result.structured["rows"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      list_direction: "inbound",
      id_by_customer: "1",
      amount: "119.00",
      amount_cents: 11900,
    });
  });

  it("nennt den Zahlungsstand nur über payment_status und payment_date", async () => {
    api.post(RECEIPTS, list([receipt(1, "119.00", "2026-01-05")]));

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
      payment_status: "unpaid",
    });

    expect(result.text).toContain("amount_paid");
    expect(result.text).toContain("0.00");
    expect(result.text).toContain("Teilzahlungen");
  });
});

describe("bb_records_collect, Teilfehler beim Blättern", () => {
  it("liefert den Präfix, verschweigt die Summe und nennt das genaue offset", async () => {
    const fullPage = pageOf(500, (index) => receipt(index + 1, "10.00", "2026-01-05"));
    api.post(RECEIPTS, (request) =>
      request.attempt === 1
        ? list(fullPage)
        : { status: 500, json: { success: false, error_code: 0, message: "Serverfehler" } },
    );

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
    });

    expect(result.isError).toBe(false);
    expect(result.bundle["complete"]).toBe(false);
    expect(result.bundle["stopped_because"]).toBe("error");
    expect(result.structured["rows_read"]).toBe(500);
    // R1: keine Kennzahl ohne Vollständigkeit.
    expect(result.structured["sum_of_rows_read"]).toBeNull();
    expect(result.structured["groups"]).toBeNull();
    expect(result.text.startsWith("Unvollständig: abgebrochen bei offset 500 nach 1 Seiten")).toBe(
      true,
    );
    expect(result.bundle["continuation"]).toMatchObject({ offset: 500 });
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("offset=500");
  });

  it("entdoppelt über id_by_customer, meldet die Zahl und setzt complete auf false", async () => {
    const fullPage = pageOf(500, (index) => receipt(index + 1, "10.00", "2026-01-05"));
    api.post(RECEIPTS, (request) =>
      request.attempt === 1 ? list(fullPage) : list([receipt(500, "10.00", "2026-01-05")]),
    );

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
    });

    expect(result.structured["duplicates_discarded"]).toBe(1);
    expect(result.bundle["complete"]).toBe(false);
    expect(result.structured["sum_of_rows_read"]).toBeNull();
  });

  it("stoppt an der Aufrufobergrenze und meldet page_limit", async () => {
    const fullPage = pageOf(500, (index) => receipt(index + 1, "10.00", "2026-01-05"));
    api.post(RECEIPTS, list(fullPage));

    const result = await server.call("bb_records_collect", {
      resource: "receipts",
      list_direction: "inbound",
    });

    expect(result.bundle["api_calls"]).toBe(10);
    expect(result.bundle["api_calls_limit"]).toBe(10);
    expect(result.bundle["stopped_because"]).toBe("page_limit");
    expect(result.bundle["complete"]).toBe(false);
  });

  it("liefert die zweite Belegrichtung, wenn die erste ausfällt", async () => {
    let call = 0;
    api.post(RECEIPTS, () => {
      call += 1;
      return call === 1
        ? { status: 400, json: { success: false, error_code: 1, message: "kaputt" } }
        : list([receipt(9, "10.00", "2026-01-05")]);
    });

    const result = await server.call("bb_records_collect", { resource: "receipts" });

    expect(result.isError).toBe(false);
    expect(result.structured["rows_read"]).toBe(1);
    const directions = result.structured["directions"] as Record<string, unknown>[];
    expect(directions).toHaveLength(2);
    expect(directions[1]?.["complete"]).toBe(true);
    // R1 je Teilmenge: Die ausgefallene Richtung trägt keine Summe, die vollständige schon.
    expect(directions[0]?.["sum"]).toBeNull();
    expect(directions[1]?.["sum"]).toBe("10.00");
    expect(result.structured["sum_of_rows_read"]).toBeNull();
  });
});

describe("bb_records_collect, Kontoauflösung", () => {
  it("löst einen eindeutigen Namen auf und sendet die Nummer als Filter", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(TRANSACTIONS, list([]));

    const result = await server.call("bb_records_collect", {
      resource: "transactions",
      account: "Girokonto",
    });

    expect(result.structured["account"]).toMatchObject({
      postingaccount_number: "1200",
      resolved_via: "name",
    });
    const request = await api.lastRequest(TRANSACTIONS);
    expect(request.body["account"]).toBe("1200");
  });

  it("nimmt eine numerische Angabe als Kontonummer", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(TRANSACTIONS, list([]));

    const result = await server.call("bb_records_collect", {
      resource: "transactions",
      account: "1201",
    });

    expect(result.structured["account"]).toMatchObject({ resolved_via: "number" });
  });

  it("rät bei mehreren Treffern nicht und holt keine einzige Zeile", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(TRANSACTIONS, list([]));

    const result = await server.call("bb_records_collect", {
      resource: "transactions",
      account: "PayPal",
    });

    expect(api.count(TRANSACTIONS)).toBe(0);
    expect(result.bundle["complete"]).toBe(false);
    expect(result.structured["account"]).toBeNull();
    expect((result.structured["account_candidates"] as unknown[]).length).toBe(2);
    expect(result.text).toContain("1201");
    expect(result.text).toContain("1202");
  });

  it("liefert bei keinem Treffer die vollständige Kontenliste", async () => {
    api.post(ACCOUNTS, list(ACCOUNT_ROWS));
    api.post(TRANSACTIONS, list([]));

    const result = await server.call("bb_records_collect", {
      resource: "transactions",
      account: "Sparbuch",
    });

    expect(api.count(TRANSACTIONS)).toBe(0);
    expect((result.structured["account_candidates"] as unknown[]).length).toBe(3);
  });

  it("sagt bei Zahlungen ohne Kontofilter, dass die Zeilen keinem Konto zugeordnet sind", async () => {
    api.post(TRANSACTIONS, list([]));

    const result = await server.call("bb_records_collect", { resource: "transactions" });

    expect(result.text).toContain("kein account");
  });
});

describe("bb_records_collect, Querprüfungen", () => {
  it("lehnt resource postings ohne Zeitraum vor dem ersten Request ab", async () => {
    const result = await server.call("bb_records_collect", { resource: "postings" });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
    expect(result.text).toContain("date_from");
    expect(result.text).toContain("Es ging nichts an BuchhaltungsButler hinaus");
  });

  it("lehnt einen Filter ab, der nicht zur Ressource gehört", async () => {
    const result = await server.call("bb_records_collect", {
      resource: "transactions",
      payment_status: "unpaid",
    });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
    expect(result.text).toContain("payment_status");
  });

  it("lehnt group_by counterparty bei Buchungen ab", async () => {
    const result = await server.call("bb_records_collect", {
      resource: "postings",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      group_by: "counterparty",
    });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
  });

  it("lehnt vertauschte Zeitgrenzen ab (Q1)", async () => {
    const result = await server.call("bb_records_collect", {
      resource: "postings",
      date_from: "2026-02-01",
      date_to: "2026-01-01",
    });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
  });
});

describe("bb_records_collect, Buchungen", () => {
  it("sendet den Pflichtzeitraum und zählt die Zeilen", async () => {
    api.post(
      POSTINGS,
      list([
        { id_by_customer: "1", date: "2026-01-05", postingtext: "Miete", amount: "1000.00" },
        { id_by_customer: "2", date: "2026-01-06", postingtext: "Strom", amount: "200.00" },
      ]),
    );

    const result = await server.call("bb_records_collect", {
      resource: "postings",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(result.structured["rows_read"]).toBe(2);
    expect(result.structured["sum_of_rows_read"]).toBe("1200.00");
    const request = await api.lastRequest(POSTINGS);
    expect(request.body).toMatchObject({ date_from: "2026-01-01", limit: 1000, offset: 0 });
  });
});
