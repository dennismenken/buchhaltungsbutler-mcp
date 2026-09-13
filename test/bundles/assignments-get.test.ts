// bb_assignments_get: beide Richtungen, Teilfehler, bedingte Anreicherung (Abschnitt 4.3).
//
// **Die wichtigste Einzelregel des ganzen Satzes wird hier geprüft**: Scheitert der
// Zuordnungsabruf, ist `assignments` null und nicht das leere Array, `assignments_status` ist
// `error`, und im Textblock steht, dass es nicht ermittelt werden konnte. Eine fälschlich als
// unbezahlt gemeldete Rechnung führt zu einer doppelten Zahlung.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../../src/config/resolve.js";
import { tenantKey } from "../../src/http/auth.js";
import { RateLimiter } from "../../src/http/rate-limiter.js";
import { gapsOf, startBundleServer, type RunningBundleServer } from "../helpers/bundle-server.js";
import {
  installTestConfig,
  mockApi,
  resetTestConfig,
  TEST_CREDENTIALS,
  type ApiMock,
} from "../helpers/mock-api.js";

const RECEIPT = "/receipts/get/4711";
const RECEIPT_ASSIGNMENTS = "/receipts/assigned-transactions/get";
const TRANSACTION = "/transactions/get/815";
const TRANSACTION_ASSIGNMENTS = "/transactions/assigned-receipts/get";

const RECEIPT_RECORD = {
  id_by_customer: "4711",
  date: "2026-01-05",
  counterparty: "Bürobedarf Nordwest GmbH",
  invoicenumber: "RE-4711",
  amount: "119.00",
  currency: "EUR",
  vat: "19",
  account: "1200",
  type: "invoice",
  payment_date: "2026-01-20",
  date_payment_due: null,
  deleted: "0",
};

const TRANSACTION_RECORD = {
  id_by_customer: 815,
  account: "1200",
  to_from: "Bürobedarf Nordwest GmbH",
  booking_date: "2026-01-20",
  value_date: "2026-01-20",
  amount: "-119.00",
  currency: "EUR",
  purpose: "RE-4711",
};

function object(data: Record<string, unknown>): { json: Record<string, unknown> } {
  return { json: { success: true, message: "", data } };
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

describe("bb_assignments_get, Beleg als Einstieg", () => {
  it("liefert Beleg und zugeordnete Zahlungen in einem Aufruf", async () => {
    api.post(RECEIPT, object(RECEIPT_RECORD));
    api.post(
      RECEIPT_ASSIGNMENTS,
      list([
        {
          id_by_customer: "815",
          to_from: "Bürobedarf Nordwest GmbH",
          amount: "-119.00",
          booking_date: "2026-01-20",
          value_date: "2026-01-20",
          purpose: "RE-4711",
        },
      ]),
    );

    const result = await server.call("bb_assignments_get", { receipt_id_by_customer: 4711 });

    expect(result.isError).toBe(false);
    expect(result.structured["kind"]).toBe("receipt");
    expect(result.structured["assignments_status"]).toBe("loaded");
    expect(result.structured["assignment_count"]).toBe(1);
    expect(result.bundle["complete"]).toBe(true);
    expect(result.bundle["api_calls"]).toBe(2);
    expect(result.bundle["api_calls_limit"]).toBe(5);
    expect(result.text).toContain("bb_records_collect");
  });

  it("unterscheidet 'keine Zuordnung' von 'nicht ermittelt'", async () => {
    api.post(RECEIPT, object(RECEIPT_RECORD));
    api.post(RECEIPT_ASSIGNMENTS, list([]));

    const result = await server.call("bb_assignments_get", { receipt_id_by_customer: 4711 });

    // Nachweislich keine: das leere Array und ein Positivbefund im Text.
    expect(result.structured["assignments"]).toEqual([]);
    expect(result.structured["assignments_status"]).toBe("loaded");
    expect(result.text).toContain("Positivbefund");
    expect(result.bundle["complete"]).toBe(true);
  });

  it("setzt assignments auf null, wenn nur der Zuordnungsabruf scheitert", async () => {
    api.post(RECEIPT, object(RECEIPT_RECORD));
    api.post(RECEIPT_ASSIGNMENTS, {
      status: 500,
      json: { success: false, error_code: 0, message: "kaputt" },
    });

    const result = await server.call("bb_assignments_get", { receipt_id_by_customer: 4711 });

    expect(result.isError).toBe(false);
    expect(result.structured["assignments"]).toBeNull();
    expect(result.structured["assignments_status"]).toBe("error");
    expect(result.structured["assignment_count"]).toBeNull();
    expect(result.text).toContain("konnte nicht ermittelt werden");
    expect(result.text).not.toContain("Keine Zahlungen zugeordnet");
    expect(result.bundle["complete"]).toBe(false);
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("bb_receipts_list_transactions");
    // Der Datensatz selbst bleibt erhalten.
    expect((result.structured["record"] as Record<string, unknown>)["invoicenumber"]).toBe(
      "RE-4711",
    );
  });

  it("setzt den zweiten Schritt nicht ab, wenn der Hauptabruf scheitert", async () => {
    api.post(RECEIPT, {
      status: 404,
      json: { success: false, error_code: 2, message: "nicht gefunden" },
    });
    api.post(RECEIPT_ASSIGNMENTS, list([]));

    const result = await server.call("bb_assignments_get", { receipt_id_by_customer: 4711 });

    expect(result.isError).toBe(true);
    expect(api.count(RECEIPT_ASSIGNMENTS)).toBe(0);
    expect(result.text).toContain("[Zustand]");
  });

  it("reicht confirmed_only durch und behauptet keinen Bestätigungsstatus", async () => {
    api.post(RECEIPT, object(RECEIPT_RECORD));
    api.post(RECEIPT_ASSIGNMENTS, list([]));

    const result = await server.call("bb_assignments_get", {
      receipt_id_by_customer: 4711,
      confirmed_only: true,
    });

    const request = await api.lastRequest(RECEIPT_ASSIGNMENTS);
    expect(request.body["confirmed_only"]).toBe(true);
    expect(result.text).toContain("Bestätigungsstatus");
  });
});

describe("bb_assignments_get, Zahlung als Einstieg", () => {
  it("reichert bis zu drei magere Zuordnungszeilen an und meldet den Rest", async () => {
    api.post(TRANSACTION, object(TRANSACTION_RECORD));
    api.post(
      TRANSACTION_ASSIGNMENTS,
      list([
        { id_by_customer: "1", filename: "a.pdf" },
        { id_by_customer: "2", filename: "b.pdf" },
        { id_by_customer: "3", filename: "c.pdf" },
        { id_by_customer: "4", filename: "d.pdf" },
      ]),
    );
    for (const id of [1, 2, 3, 4]) {
      api.post(
        `/receipts/get/${String(id)}`,
        object({ ...RECEIPT_RECORD, id_by_customer: String(id) }),
      );
    }

    const result = await server.call("bb_assignments_get", { transaction_id_by_customer: 815 });

    expect(result.structured["kind"]).toBe("transaction");
    expect(result.structured["enriched"]).toBe(3);
    expect(result.structured["not_enriched"]).toBe(1);
    expect(result.bundle["api_calls"]).toBe(5);
    const rows = result.structured["assignments"] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ filename: "a.pdf", counterparty: "Bürobedarf Nordwest GmbH" });
    expect(rows[3]).toMatchObject({ filename: "d.pdf" });
    expect(rows[3]?.["counterparty"]).toBeUndefined();
  });

  it("reichert nicht an, wenn die Zeile die fachlich nötigen Felder schon trägt", async () => {
    api.post(TRANSACTION, object(TRANSACTION_RECORD));
    api.post(
      TRANSACTION_ASSIGNMENTS,
      list([
        {
          id_by_customer: "1",
          filename: "a.pdf",
          counterparty: "Bürobedarf Nordwest GmbH",
          amount: "119.00",
          date: "2026-01-05",
        },
      ]),
    );

    const result = await server.call("bb_assignments_get", { transaction_id_by_customer: 815 });

    expect(result.bundle["api_calls"]).toBe(2);
    expect(result.structured["enriched"]).toBe(0);
  });

  it("hält die Lücke fest, wenn eine Anreicherung scheitert", async () => {
    api.post(TRANSACTION, object(TRANSACTION_RECORD));
    api.post(TRANSACTION_ASSIGNMENTS, list([{ id_by_customer: "1", filename: "a.pdf" }]));
    api.post("/receipts/get/1", {
      status: 404,
      json: { success: false, error_code: 2, message: "weg" },
    });

    const result = await server.call("bb_assignments_get", { transaction_id_by_customer: 815 });

    expect(result.isError).toBe(false);
    expect(result.structured["not_enriched"]).toBe(1);
    const rows = result.structured["assignments"] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ id_by_customer: "1", filename: "a.pdf" });
    expect(gapsOf(result.bundle)[0]?.["next_step"]).toContain("bb_receipts_get");
  });
});

describe("bb_assignments_get, Querprüfung und Vorabprüfung", () => {
  it("lehnt ohne Kennung vor dem ersten Request ab", async () => {
    const result = await server.call("bb_assignments_get", {});

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
    expect(result.text).toContain("Es ging nichts an BuchhaltungsButler hinaus");
  });

  it("lehnt beide Kennungen zugleich ab", async () => {
    const result = await server.call("bb_assignments_get", {
      receipt_id_by_customer: 4711,
      transaction_id_by_customer: 815,
    });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
  });

  it("lehnt ab, bevor etwas hinausgeht, wenn weniger als zwei Token bereitliegen", async () => {
    await server.close();
    // Eine stehende Uhr: Der Eimer füllt sich im Test nicht nach, und der Füllstand ist damit
    // genau der eingestellte. `sleep` wird nie erreicht, weil vorher abgebrochen wird.
    const frozen = { now: (): number => 0, sleep: (): Promise<void> => Promise.resolve() };
    const limiter = new RateLimiter({ ratePerMinute: 10, clock: frozen });
    // Neun der zehn Token entnehmen; übrig bleibt einer, das Bündel braucht zwei.
    const tenant = tenantKey(TEST_CREDENTIALS.BB_API_KEY);
    for (let index = 0; index < 9; index += 1) {
      await limiter.acquire({
        tenant,
        bucket: "default",
        context: { toolName: "test", specPath: "/x", toolClass: "R" },
      });
    }
    server = await startBundleServer({ config, limiter });
    api.post(RECEIPT, object(RECEIPT_RECORD));

    const result = await server.call("bb_assignments_get", { receipt_id_by_customer: 4711 });

    expect(result.isError).toBe(true);
    expect(api.count()).toBe(0);
    expect(result.text).toContain("Token");
  });
});
