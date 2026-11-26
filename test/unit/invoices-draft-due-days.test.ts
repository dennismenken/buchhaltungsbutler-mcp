// bb_invoices_create_draft sendet due_days an /invoices/create/draft, obwohl die Spezifikation das
// Feld dort nicht führt: live belegt am 2026-11-26 (Befund L9 in docs/api/live-befunde.md),
// freigeschaltet auf Entscheidung des Projektinhabers. Geprüft wird, dass der Wert unverändert
// im Request-Body ankommt und dass ein Wert, der keine Ziffernfolge ist, vor dem Request scheitert.

import { afterEach, describe, expect, it } from "vitest";

import { mockApi } from "../helpers/mock-api.js";
import { startTestServer, type RunningDiscoveryServer } from "../helpers/discovery.js";

let server: RunningDiscoveryServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const DRAFT_ARGS = {
  invoice_type: "invoice",
  show_prices_type: "net",
  company_name: "Erfundene Kundin GmbH",
  date: "2026-11-26",
  items: [
    {
      item_name: "Beratung",
      item_amount: "1",
      item_unit: "Stunde",
      item_vat: "19",
      item_single_price: "100.00",
    },
  ],
};

describe("bb_invoices_create_draft mit due_days", () => {
  it("sendet due_days unverändert im Body", async () => {
    const api = mockApi();
    api.post("/invoices/create/draft", { json: { success: true, message: "" } });
    server = await startTestServer();

    const result = await server.client.callTool({
      name: "bb_invoices_create_draft",
      arguments: { ...DRAFT_ARGS, due_days: "14" },
    });

    expect(result.isError).not.toBe(true);
    const [request] = await api.requests();
    expect(request?.body.due_days).toBe("14");
  });

  it("lehnt einen Wert ohne Ziffernfolge vor dem Request ab", async () => {
    const api = mockApi();
    server = await startTestServer();

    const result = await server.client.callTool({
      name: "bb_invoices_create_draft",
      arguments: { ...DRAFT_ARGS, due_days: "vierzehn" },
    });

    expect(result.isError).toBe(true);
    expect(api.count("/invoices/create/draft")).toBe(0);
  });
});
