import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runConnectionTest, TEST_ENDPOINT } from "../../src/cli/test.js";
import type { RetryRuntime } from "../../src/http/retry.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// Der Netzwerkfehler steht in einer eigenen Datei: Eine Abfangregel für einen Pfad ist
// entweder eine gewöhnliche Antwort oder ein Verbindungsfehler, und sie bleibt für die
// ganze Testdatei stehen (test/helpers/mock-api.ts).

const FAST_RETRY: RetryRuntime = {
  sleep: () => Promise.resolve(),
  random: () => 0.5,
};

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("runConnectionTest bei Netzwerkfehler", () => {
  it("deutet ihn als Netzwerkproblem und nennt die Zieldomain", async () => {
    const config = installTestConfig();
    api.postNetworkError(TEST_ENDPOINT);

    const result = await runConnectionTest(config, { retryRuntime: FAST_RETRY });

    expect(result.outcome.kind).toBe("network");
    expect(result.headline).toContain("Keine Verbindung zu nicht-aufloesbar.invalid");
    expect(result.detail.join(" ")).toContain("HTTPS_PROXY");
  });

  it("wiederholt den lesenden Versuch und weist die Zahl der Versuche aus", async () => {
    const config = installTestConfig();

    const result = await runConnectionTest(config, { retryRuntime: FAST_RETRY });

    // Lesende Aufrufe dürfen wiederholt werden (Plan 5.3); die Zahl steht im Ergebnis.
    expect(result.attempts).toBeGreaterThan(1);
    expect(api.count(TEST_ENDPOINT)).toBe(result.attempts);
  });
});
