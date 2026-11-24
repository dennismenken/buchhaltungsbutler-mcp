// Größe und Inhalt der Discovery-Antworten, an denen der Modus hängt.
//
// Die Übersicht ist der erste Aufruf fast jeder Sitzung im Modus discovery; sie bleibt unter
// DISCOVER_OVERVIEW_TOKEN_BUDGET. Und die Beschreibung eines Werkzeugs muss die Parameter im
// Textblock tragen: Viele Clients reichen dem Modell nur den Text weiter, und ohne Parameter
// könnte der Agent das beschriebene Werkzeug nicht aufrufen.

import { encode } from "gpt-tokenizer/encoding/o200k_base";
import { afterEach, describe, expect, it } from "vitest";

import { DISCOVER_OVERVIEW_TOKEN_BUDGET } from "../../src/registry/budget.js";
import { mockApi } from "../helpers/mock-api.js";
import {
  startDiscoveryServer,
  structuredOf,
  textOf,
  type RunningDiscoveryServer,
} from "../helpers/discovery.js";

let server: RunningDiscoveryServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("Antworten des Modus discovery", () => {
  it("hält die Übersicht unter DISCOVER_OVERVIEW_TOKEN_BUDGET", async () => {
    mockApi();
    server = await startDiscoveryServer();
    const result = await server.client.callTool({ name: "bb_tools_discover", arguments: {} });
    const tokens =
      encode(textOf(result)).length + encode(JSON.stringify(structuredOf(result))).length;
    expect(
      tokens,
      `${String(tokens)} Token in der Übersicht, erlaubt sind ${String(DISCOVER_OVERVIEW_TOKEN_BUDGET)}.`,
    ).toBeLessThanOrEqual(DISCOVER_OVERVIEW_TOKEN_BUDGET);
  });

  it("nennt in der Beschreibung die Parameter im Textblock, nicht nur in structuredContent", async () => {
    mockApi();
    server = await startDiscoveryServer();
    const result = await server.client.callTool({
      name: "bb_tools_describe",
      arguments: { names: ["bb_debtors_delete", "bb_receipts_search"] },
    });
    const text = textOf(result);
    expect(text).toContain("Eingabeschema von bb_debtors_delete");
    expect(text).toContain("postingaccount_number");
    expect(text).toContain("Eingabeschema von bb_receipts_search");
    expect(text).toContain("list_direction");
  });
});
