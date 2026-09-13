import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createScriptedTerminal } from "../../src/cli/prompt.js";
import { runConnectionTest, runTestCommand, TEST_ENDPOINT } from "../../src/cli/test.js";
import type { RetryRuntime } from "../../src/http/retry.js";
import {
  installTestConfig,
  mockApi,
  resetTestConfig,
  TEST_CREDENTIALS,
  type ApiMock,
} from "../helpers/mock-api.js";

// Der Verbindungstest und seine Deutung (Plan 8.2 Schritt 3, 8.1 `test`).
//
// Es geht kein Aufruf hinaus: `test/setup.ts` sperrt das Netz, und die Basis-URL des
// Testlaufs ist nicht auflösbar. Die Antworten sind aus den Live-Befunden abgeleitet
// (`/accounts/get` liefert je Zeile `name` und `postingaccount_number`, beide als String);
// die Kontonamen sind erfunden.

const ACCOUNTS = [
  { name: "Bank", postingaccount_number: "1200" },
  { name: "Kasse", postingaccount_number: "1000" },
];

/** Wartet nicht wirklich: Ein Drosselungsfall würde sonst Sekunden kosten. */
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

describe("runConnectionTest", () => {
  it("deutet eine Erfolgsantwort und nennt die Zahl der Zahlungskonten", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });

    const result = await runConnectionTest(config, { retryRuntime: FAST_RETRY });

    expect(result.ok).toBe(true);
    expect(result.headline).toContain("Gefunden: 2 Zahlungskonten");
    expect(result.outcome.kind).toBe("ok");
    if (result.outcome.kind === "ok") {
      expect(result.outcome.accounts[0]).toEqual({ name: "Bank", postingAccountNumber: "1200" });
    }
    expect(api.count(TEST_ENDPOINT)).toBe(1);
  });

  it("setzt genau einen Aufruf ab und sendet nur den api_key im Körper", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 0, data: [] } });

    await runConnectionTest(config, { retryRuntime: FAST_RETRY });

    expect(api.count()).toBe(1);
    const request = await api.lastRequest(TEST_ENDPOINT);
    expect(Object.keys(request.body)).toEqual(["api_key"]);
    expect(request.body.api_key).toBe(TEST_CREDENTIALS.BB_API_KEY);
  });

  it("trennt error_code 3 und error_code 4 auseinander", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, {
      status: 401,
      json: { success: false, error_code: 3, message: "API credentials unknown or invalid" },
    });

    const three = await runConnectionTest(config, { retryRuntime: FAST_RETRY });
    expect(three.outcome.kind).toBe("credentials-invalid");
    expect(three.headline).toContain("API Client oder API Secret");
    expect(three.detail.join(" ")).toContain("api_key wurde damit noch nicht geprüft");

    api.close();
    api = mockApi();
    api.post(TEST_ENDPOINT, {
      status: 401,
      json: { success: false, error_code: 4, message: "customer not found" },
    });

    const four = await runConnectionTest(config, { retryRuntime: FAST_RETRY });
    expect(four.outcome.kind).toBe("api-key-invalid");
    expect(four.headline).toContain("api_key");
  });

  it("erkennt den fehlenden aktiven Status als Kontostand, nicht als Konfigurationsfehler", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, {
      status: 403,
      json: { success: false, error_code: 11, message: "customer has no active status" },
    });

    const result = await runConnectionTest(config, { retryRuntime: FAST_RETRY });

    expect(result.outcome.kind).toBe("customer-inactive");
    expect(result.detail.join(" ")).toContain("kein Konfigurationsfehler");
  });

  it("erkennt Drosselung an HTTP 429 und an error_code 15", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, {
      status: 429,
      json: { success: false, error_code: 15, message: "too many requests" },
    });

    const tooMany = await runConnectionTest(config, { retryRuntime: FAST_RETRY });
    expect(tooMany.outcome.kind).toBe("throttled");

    api.close();
    api = mockApi();
    api.post(TEST_ENDPOINT, {
      status: 403,
      json: { success: false, error_code: 15, message: "rate limit" },
    });

    const forbidden = await runConnectionTest(config, { retryRuntime: FAST_RETRY });
    expect(forbidden.outcome.kind).toBe("throttled");
  });

  it("nennt bei einer HTML-Antwort Proxy, Zieldomain und die ersten Zeichen", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, {
      status: 200,
      body: "<html><body>Bitte anmelden</body></html>",
      contentType: "text/html; charset=utf-8",
    });

    const result = await runConnectionTest(config, { retryRuntime: FAST_RETRY });

    expect(result.outcome.kind).toBe("non-json");
    const text = result.detail.join(" ");
    expect(text).toContain("HTTPS_PROXY");
    expect(text).toContain("nicht-aufloesbar.invalid");
    expect(text).toContain("Bitte anmelden");
  });

  it("gibt in keinem Ausgang ein Zugangsdatum zurück", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, {
      status: 401,
      json: {
        success: false,
        error_code: 3,
        // Die Gegenstelle könnte den Wert zurückspiegeln; er darf trotzdem nicht erscheinen.
        message: `unbekannter Zugang ${TEST_CREDENTIALS.BB_API_CLIENT}`,
      },
    });

    const result = await runConnectionTest(config, { retryRuntime: FAST_RETRY });
    const everything = [result.headline, ...result.detail].join(" ");

    for (const value of Object.values(TEST_CREDENTIALS)) {
      expect(everything).not.toContain(value);
    }
  });
});

describe("runTestCommand", () => {
  it("endet mit 0 und listet die Konten auf", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, { json: { success: true, rows: 2, data: ACCOUNTS } });
    const terminal = createScriptedTerminal([]);

    const code = await runTestCommand({ config, terminal, retryRuntime: FAST_RETRY });

    expect(code).toBe(0);
    expect(terminal.text()).toContain("1200  Bank");
  });

  it("endet ohne Zugangsdaten mit 1 und setzt keinen Aufruf ab", async () => {
    const config = installTestConfig({
      BB_API_CLIENT: "",
      BB_API_SECRET: "",
      BB_API_KEY: "",
    });
    const terminal = createScriptedTerminal([]);

    const code = await runTestCommand({ config, terminal, retryRuntime: FAST_RETRY });

    expect(code).toBe(1);
    expect(api.count()).toBe(0);
    expect(terminal.errorLines.join("\n")).toContain("NICHT KONFIGURIERT");
  });

  it("endet bei einer Ablehnung mit 1", async () => {
    const config = installTestConfig();
    api.post(TEST_ENDPOINT, { status: 401, json: { success: false, error_code: 3 } });
    const terminal = createScriptedTerminal([]);

    expect(await runTestCommand({ config, terminal, retryRuntime: FAST_RETRY })).toBe(1);
  });
});
