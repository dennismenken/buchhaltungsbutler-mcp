import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tenantKey } from "../../src/http/auth.js";
import {
  buildRequestUrl,
  callEndpoint,
  checkRequestPath,
  timeoutForTier,
  USER_AGENT,
  type EndpointCall,
} from "../../src/http/client.js";
import { RateLimiter, type RateLimiterClock } from "../../src/http/rate-limiter.js";
import type { RetryRuntime } from "../../src/http/retry.js";
import {
  ApiResponseError,
  CancelledError,
  EnvelopeContractError,
  InvalidRequestError,
  NonJsonResponseError,
  TimeoutError,
} from "../../src/http/transport-error.js";
import {
  installTestConfig,
  mockApi,
  resetTestConfig,
  TEST_BASE_URL,
  TEST_CREDENTIALS,
  type ApiMock,
} from "../helpers/mock-api.js";

// Die HTTP-Fälle aus Plan 9.4. Die Antwortkörper sind aus den Live-Befunden in 0.3
// abgeleitet: Feldnamen, Feldmengen und Typen sind gemessen, die Geschäftsdaten erfunden.

/** Die 16 Felder, die /receipts/get live liefert (Befund L2). */
const RECEIPT_LIST_ROW = {
  filename: "rechnung-2026-08.pdf",
  id_by_customer: "2",
  type: "inbox",
  date: "2026-08-14",
  counterparty: "Musterlieferant GmbH",
  invoicenumber: "R-2026-0815",
  amount: "1190.00",
  payment_date: null,
  account: "1200",
  amount_paid: "0.00",
  amount_paid_fixed: "0",
  deleted: "0",
  link_to_receipt_id_by_customer: null,
  delivery_date: null,
  date_uploaded: "2026-08-15 09:12:03",
  due_date: null,
};

/** Die 23 Felder, die /receipts/get/<wert> live liefert — andere Datumsnamen (Befund L2). */
const RECEIPT_SINGLE = {
  filename: "rechnung-2026-08.pdf",
  id_by_customer: "2",
  type: "inbox",
  date: "2026-08-14",
  counterparty: "Musterlieferant GmbH",
  invoicenumber: "R-2026-0815",
  amount: "1190.00",
  amount_original: "1190.00",
  currency: "EUR",
  currency_original: "EUR",
  exchangerate: "1.0000",
  vat: "19.00",
  e_invoice_type: 0,
  list_direction: "inbox",
  payment_reference: null,
  payment_date: null,
  account: "1200",
  amount_paid: "0.00",
  amount_paid_fixed: "0",
  deleted: "0",
  link_to_receipt_id_by_customer: null,
  date_delivery: null,
  date_payment_due: null,
};

/** Die 6 Felder der Zahlungsliste; id_by_customer ist hier eine Zahl (Befund L3). */
const TRANSACTION_LIST_ROW = {
  id_by_customer: 1590,
  to_from: "Musterkunde AG",
  amount: "884.65",
  booking_date: "2026-08-12",
  value_date: "2026-08-12",
  purpose: "Rechnung R-2026-0815",
};

/** Die 13 Felder, die /transactions/get/<wert> live liefert; account ist hier eine Zahl (L3). */
const TRANSACTION_SINGLE = {
  id_by_customer: 1590,
  account: 12,
  to_from: "Musterkunde AG",
  booking_date: "2026-08-12",
  value_date: "2026-08-12",
  amount: "884.65",
  currency: "EUR",
  account_number: "DE02120300000000202051",
  bank_code: "BYLADEM1001",
  bank_name: "Musterbank",
  purpose: "Rechnung R-2026-0815",
  type: "SEPA-Überweisung",
  booking_text: "GUTSCHRIFT",
};

function call(overrides: Partial<EndpointCall> = {}): EndpointCall {
  return {
    toolName: "bb_receipts_search",
    toolClass: "R",
    specPath: "/receipts/get",
    requestPath: "/receipts/get",
    shape: "list",
    bucket: "default",
    timeoutTier: "short",
    body: {},
    ...overrides,
  };
}

/** Eine Retry-Laufzeit ohne echtes Warten; die Wartezeiten werden aufgezeichnet. */
function testRuntime(): RetryRuntime & { delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
  };
}

/** Ein Limiter mit stehender Uhr: So ist der Füllstand am Ende exakt nachrechenbar. */
function countingLimiter(): RateLimiter {
  const clock: RateLimiterClock = { now: () => 1_000, sleep: () => Promise.resolve() };
  return new RateLimiter({ ratePerMinute: 60, clock, notify: () => undefined });
}

let api: ApiMock;

beforeEach(() => {
  installTestConfig();
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("Der Request selbst", () => {
  it("sendet POST mit Basic Auth, JSON und User-Agent", async () => {
    api.post("/receipts/get", { json: { success: true, rows: 1, data: [RECEIPT_LIST_ROW] } });

    await callEndpoint(call({ body: { limit: 1, list_direction: "inbox" } }));

    const request = await api.lastRequest("/receipts/get");
    expect(request.method).toBe("POST");
    expect(request.headers.authorization).toBe(
      `Basic ${Buffer.from(`${TEST_CREDENTIALS.BB_API_CLIENT}:${TEST_CREDENTIALS.BB_API_SECRET}`, "utf8").toString("base64")}`,
    );
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers.accept).toBe("application/json");
    expect(request.headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^buchhaltungsbutler-mcp\/\d+\.\d+\.\d+/);
  });

  it("setzt den api_key in den Body und lässt die Argumente unverändert", async () => {
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });
    const requestArgs = { limit: 1, order: { date: "DESC" } };

    await callEndpoint(call({ body: requestArgs }));

    const request = await api.lastRequest();
    expect(request.body).toEqual({
      limit: 1,
      order: { date: "DESC" },
      api_key: TEST_CREDENTIALS.BB_API_KEY,
    });
    // Der Aufrufer bekommt sein Objekt unverändert zurück; der Client ergänzt nur im Body.
    expect(requestArgs).not.toHaveProperty("api_key");
  });

  it("sendet den Body als JSON und nicht formularkodiert", async () => {
    // Nur als JSON überleben Booleans, null in Arrays und das order-Objekt (Plan 5.1).
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });
    await callEndpoint(call({ body: { get_file: true, ids: [1, null, 3] } }));
    const request = await api.lastRequest();
    expect(request.rawBody).toContain('"get_file":true');
    expect(request.rawBody).toContain('"ids":[1,null,3]');
  });
});

describe("Die vier Endpunkte mit Pfadvorlage", () => {
  it("ruft den interpolierten Pfad auf, nicht den Spezifikationspfad", async () => {
    // Die Abfangregel hängt am interpolierten Pfad (9.4): Läge sie am Spezifikationspfad,
    // könnte der Test grün sein, ohne dass der Pfadbau je durchlaufen wurde.
    api.post("/receipts/get/4711", { json: { success: true, message: "", data: RECEIPT_SINGLE } });
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });

    const result = await callEndpoint(
      call({
        toolName: "bb_receipts_get",
        specPath: "/receipts/get/id_by_customer",
        requestPath: "/receipts/get/4711",
        shape: "object",
        body: { get_file: false },
      }),
    );

    expect(api.count("/receipts/get/4711")).toBe(1);
    expect(api.count("/receipts/get")).toBe(0);
    expect(result.envelope.shape).toBe("object");
    if (result.envelope.shape === "object") {
      // Die Fremdwährungsfelder liefert nur der Einzelabruf (Befund 2 der Live-Befunde).
      expect(result.envelope.data.amount_original).toBe("1190.00");
      expect(result.envelope.data.date_delivery).toBeNull();
    }
    expect(result.envelope.body).not.toHaveProperty("rows");
  });

  it("sendet kein Body-Feld id_by_customer", async () => {
    // Regel 5 aus 4.6: Die Spezifikation führt an diesen vier Pfaden überhaupt kein solches
    // Feld, und der dokumentierte Aufruf mit Body-Feld scheitert nachweislich.
    api.post("/receipts/get/4711", { json: { success: true, message: "", data: RECEIPT_SINGLE } });

    await callEndpoint(
      call({
        toolName: "bb_receipts_get",
        specPath: "/receipts/get/id_by_customer",
        requestPath: "/receipts/get/4711",
        shape: "object",
        body: { get_file: true },
      }),
    );

    const request = await api.lastRequest("/receipts/get/4711");
    expect(Object.keys(request.body).sort()).toEqual(["api_key", "get_file"]);
    expect(request.body).not.toHaveProperty("id_by_customer");
  });

  it("gibt einen Fehler mit dem Spezifikationspfad zurück, nicht mit dem gebauten", async () => {
    // Der Fehlerkatalog schlägt über specPath nach (5.6). Stünde hier der gebaute Pfad,
    // fiele jeder Fehler dieser vier Werkzeuge auf „Paar fehlt" zurück.
    api.post("/receipts/get/4711", {
      status: 400,
      json: { success: false, error_code: 5, message: "invalid id_by_customer specified" },
    });

    let caughtError: unknown;
    try {
      await callEndpoint(
        call({
          toolName: "bb_receipts_get",
          specPath: "/receipts/get/id_by_customer",
          requestPath: "/receipts/get/4711",
          shape: "object",
        }),
      );
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(ApiResponseError);
    expect((caughtError as ApiResponseError).specPath).toBe("/receipts/get/id_by_customer");
    expect((caughtError as ApiResponseError).errorCode).toBe(5);
  });
});

describe("Antwortformen", () => {
  it("liest die Listenform mit rows", async () => {
    api.post("/receipts/get", {
      json: { success: true, message: "", rows: 1, data: [RECEIPT_LIST_ROW] },
    });
    const result = await callEndpoint(call());
    expect(result.envelope.shape).toBe("list");
    if (result.envelope.shape === "list") {
      expect(result.envelope.rows).toBe(1);
      expect(Object.keys(result.envelope.data[0] as object)).toHaveLength(16);
    }
    expect(result.attempts).toBe(1);
  });

  it("liest die leere Seite, ohne zu stolpern", async () => {
    api.post("/receipts/get", { json: { success: true, message: "", rows: 0, data: [] } });
    const result = await callEndpoint(call());
    if (result.envelope.shape === "list") {
      expect(result.envelope.rows).toBe(0);
      expect(result.envelope.data).toEqual([]);
    }
  });

  it("meldet rows der vollen und der unvollständigen Seite unverändert", async () => {
    // Die HTTP-Schicht behauptet keine Gesamttrefferzahl; sie gibt rows weiter, wie geliefert
    // (Befund L5). Den Bestandshinweis daraus bildet die Antwortaufbereitung (7.5).
    api.post("/postings/get", [
      { json: { success: true, rows: 2, data: [{ id: 1 }, { id: 2 }] } },
      { json: { success: true, rows: 1, data: [{ id: 3 }] } },
    ]);
    const fullPage = await callEndpoint(
      call({
        toolName: "bb_postings_search",
        specPath: "/postings/get",
        requestPath: "/postings/get",
        body: { limit: 2 },
      }),
    );
    const lastPage = await callEndpoint(
      call({
        toolName: "bb_postings_search",
        specPath: "/postings/get",
        requestPath: "/postings/get",
        body: { limit: 2, offset: 2 },
      }),
    );
    expect(fullPage.envelope.shape === "list" && fullPage.envelope.rows).toBe(2);
    expect(lastPage.envelope.shape === "list" && lastPage.envelope.rows).toBe(1);
    expect(fullPage.envelope.warnings).toHaveLength(0);
    expect(lastPage.envelope.warnings).toHaveLength(0);
  });

  it("liest die Zahlungsliste mit id_by_customer als Zahl", async () => {
    api.post("/transactions/get", {
      json: { success: true, message: "", rows: 1, data: [TRANSACTION_LIST_ROW] },
    });
    const result = await callEndpoint(
      call({
        toolName: "bb_transactions_search",
        specPath: "/transactions/get",
        requestPath: "/transactions/get",
      }),
    );
    if (result.envelope.shape === "list") {
      expect(result.envelope.data[0]).toMatchObject({ id_by_customer: 1590 });
      // Die Liste liefert kein Zahlungskonto; ein Agent findet es dort nicht (Befund L2).
      expect(result.envelope.data[0]).not.toHaveProperty("account");
    }
  });

  it("liest den Einzelabruf einer Zahlung mit account als Zahl", async () => {
    // Gemessen (L2, L3): 13 Felder statt 6, und account ist hier eine Zahl, während es an
    // /receipts/get ein String ist. Die Typ-Asymmetrie ist nicht einmal zwischen den
    // Ressourcen einheitlich und muss je Feld behandelt werden (Befund 3 der Live-Befunde).
    api.post("/transactions/get/1590", {
      json: { success: true, message: "", data: TRANSACTION_SINGLE },
    });
    const result = await callEndpoint(
      call({
        toolName: "bb_transactions_get",
        specPath: "/transactions/get/id_by_customer",
        requestPath: "/transactions/get/1590",
        shape: "object",
      }),
    );
    expect(result.envelope.shape).toBe("object");
    if (result.envelope.shape === "object") {
      expect(Object.keys(result.envelope.data)).toHaveLength(13);
      expect(result.envelope.data.account).toBe(12);
      expect(result.envelope.data.id_by_customer).toBe(1590);
    }
    const request = await api.lastRequest("/transactions/get/1590");
    expect(Object.keys(request.body)).toEqual(["api_key"]);
  });

  it("reicht eine reine Bestätigung durch", async () => {
    api.post("/receipts/delete/4711", { json: { success: true, message: "receipt deleted" } });
    const result = await callEndpoint(
      call({
        toolName: "bb_receipts_delete",
        toolClass: "D",
        specPath: "/receipts/delete/id_by_customer",
        requestPath: "/receipts/delete/4711",
        shape: "ack",
        timeoutTier: "normal",
      }),
    );
    expect(result.envelope.shape).toBe("ack");
    expect(result.envelope.message).toBe("receipt deleted");
  });
});

describe("Fehlerfälle der Gegenstelle", () => {
  it("parst eine HTML-Fehlerseite nicht", async () => {
    api.post("/transactions/get/id_by_customer", {
      status: 404,
      contentType: "text/html; charset=UTF-8",
      body:
        "<!DOCTYPE html><html><head><title>404 Not Found</title></head><body>" +
        "<h1>Not Found</h1><p>Der angeforderte Pfad existiert nicht.</p></body></html>",
    });

    let caughtError: unknown;
    try {
      await callEndpoint(
        call({
          specPath: "/transactions/get/id_by_customer",
          requestPath: "/transactions/get/id_by_customer",
        }),
      );
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(NonJsonResponseError);
    const nonJson = caughtError as NonJsonResponseError;
    expect(nonJson.status).toBe(404);
    expect(nonJson.bodyExcerpt).toContain("Not Found");
    expect(nonJson.bodyExcerpt.length).toBeLessThanOrEqual(201);
    // Keine Parserausnahme, sondern ein eigener Fehlertyp: Die Gegenstelle hat gar nicht als
    // API geantwortet, und genau das soll in der Meldung stehen.
    expect(nonJson.message).not.toContain("JSON.parse");
  });

  it("behandelt HTTP 200 mit success: false als Fehler", async () => {
    api.post("/receipts/get", {
      status: 200,
      json: { success: false, error_code: 10, message: "invalid limit specified" },
    });
    let caughtError: unknown;
    try {
      await callEndpoint(call({ body: { limit: 999_999 } }));
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(ApiResponseError);
    expect((caughtError as ApiResponseError).status).toBe(200);
    expect((caughtError as ApiResponseError).errorCode).toBe(10);
    expect((caughtError as ApiResponseError).changed).toBe("nein");
  });

  it("lehnt einen Umschlag ohne success ab", async () => {
    api.post("/receipts/get", { json: { rows: 1, data: [RECEIPT_LIST_ROW] } });
    let caughtError: unknown;
    try {
      await callEndpoint(call());
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(EnvelopeContractError);
    expect((caughtError as EnvelopeContractError).violation).toBe("success-missing");
  });

  it("gibt den Wortlaut der Antwort weiter, auch wenn er in keiner Quelle steht", async () => {
    // L6: Live kam zu 400/15 der Text `invalid field specified`. Der Katalogtext tritt nur
    // ein, wenn die Antwort keinen verwertbaren Text trägt (5.6, AP08).
    api.post("/receipts/get", {
      status: 400,
      json: { success: false, error_code: 15, message: "invalid field specified" },
    });
    let caughtError: unknown;
    try {
      await callEndpoint(call({ body: { order: { nicht_existierendes_feld: "ASC" } } }));
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as ApiResponseError).apiMessage).toBe("invalid field specified");
  });
});

describe("Wiederholung: ausschließlich lesend", () => {
  it("wiederholt 504/30 an einem lesenden Werkzeug dreimal, mit eigenem Token je Versuch", async () => {
    api.post("/receipts/get", {
      status: 504,
      json: { success: false, error_code: 30, message: "a timeout occurred" },
    });
    const runtime = testRuntime();
    const limiter = countingLimiter();

    await expect(callEndpoint(call(), { retryRuntime: runtime, limiter })).rejects.toBeInstanceOf(
      ApiResponseError,
    );

    expect(api.count("/receipts/get")).toBe(3);
    expect(runtime.delays).toEqual([1_000, 2_000]);
    // Drei Versuche, drei Token: Der Limiter liegt in der Schleife, nicht davor (5.3).
    expect(limiter.levels()[`${tenantKey(TEST_CREDENTIALS.BB_API_KEY)}:default`]).toBe(57);
  });

  it("wiederholt einen Verbindungsfehler an einem lesenden Werkzeug", async () => {
    // Eigener Pfad, weil eine Abfangregel entweder gewöhnlich antwortet oder scheitert.
    api.postNetworkError("/accounts/get");
    const runtime = testRuntime();
    await expect(
      callEndpoint(
        call({
          toolName: "bb_accounts_list",
          specPath: "/accounts/get",
          requestPath: "/accounts/get",
        }),
        { retryRuntime: runtime },
      ),
    ).rejects.toMatchObject({ code: "network", changed: "nein" });
    expect(api.count("/accounts/get")).toBe(3);
  });

  it("setzt bei HTTP 504 an einem schreibenden Werkzeug genau einen Request ab", async () => {
    api.post("/postings/add/free", {
      status: 504,
      json: { success: false, error_code: 30, message: "a timeout occurred" },
    });
    const runtime = testRuntime();

    let caughtError: unknown;
    try {
      await callEndpoint(
        call({
          toolName: "bb_postings_create_free",
          toolClass: "B",
          specPath: "/postings/add/free",
          requestPath: "/postings/add/free",
          shape: "ack",
          timeoutTier: "normal",
          body: { amount: 1190, postingtext: "Büromaterial August" },
        }),
        { retryRuntime: runtime },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(api.count("/postings/add/free")).toBe(1);
    expect(runtime.delays).toEqual([]);
    // Der Ausgang ist offen: HTTP 5xx an einem schreibenden Werkzeug heißt Ungewissheit (5.7).
    expect((caughtError as ApiResponseError).changed).toBe("unbekannt");
  });

  it("wiederholt 400/15 nicht, gleich welchen Text die Antwort trägt", async () => {
    // Derselbe Fall zweimal: einmal mit dem Katalogtext, einmal mit dem live gemessenen.
    // Beide Läufe müssen dasselbe ergeben, weil keine Weiche am Wortlaut hängt (L6).
    for (const message of ["invalid sort field specified", "invalid field specified"]) {
      const attemptApi = mockApi();
      attemptApi.post("/receipts/get", {
        status: 400,
        json: { success: false, error_code: 15, message },
      });
      let caughtError: unknown;
      try {
        await callEndpoint(call(), { retryRuntime: testRuntime() });
      } catch (error) {
        caughtError = error;
      }
      expect(attemptApi.count("/receipts/get")).toBe(1);
      expect((caughtError as ApiResponseError).status).toBe(400);
      expect((caughtError as ApiResponseError).errorCode).toBe(15);
      attemptApi.close();
    }
  });

  it("wiederholt 403/15 an einem schreibenden Stapelendpunkt nicht", async () => {
    // 5.3 ist unbedingt: Kein schreibender Aufruf wird wiederholt. Die Einstufung als
    // Drosselung (Klasse transient, 5.6) geschieht in der Fehlerschicht und führt dort zum
    // Text aus 5.7, nicht zu einem zweiten Request.
    api.post("/receipts/addBatch", {
      status: 403,
      json: { success: false, error_code: 15, message: "adding temporarily restricted" },
    });
    let caughtError: unknown;
    try {
      await callEndpoint(
        call({
          toolName: "bb_receipts_add_batch",
          toolClass: "A",
          specPath: "/receipts/addBatch",
          requestPath: "/receipts/addBatch",
          shape: "ack",
          bucket: "batch",
          timeoutTier: "long",
          body: { receipts: [] },
        }),
        { retryRuntime: testRuntime() },
      );
    } catch (error) {
      caughtError = error;
    }
    expect(api.count("/receipts/addBatch")).toBe(1);
    expect((caughtError as ApiResponseError).errorCode).toBe(15);
    expect((caughtError as ApiResponseError).status).toBe(403);
  });

  it("wiederholt 403/15 auch an /transactions/add nicht", async () => {
    // Dieser Pfad rutscht leicht durch (Fußnote zu 5.6): Er ist weder Stapel noch Upload,
    // führt aber dieselbe Drosselung. Ein Retry gäbe es hier nicht, weil er schreibend ist;
    // die Einstufung als transient und der Text aus 5.7 sind Sache der Fehlerschicht.
    api.post("/transactions/add", {
      status: 403,
      json: { success: false, error_code: 15, message: "adding temporarily restricted" },
    });
    let caughtError: unknown;
    try {
      await callEndpoint(
        call({
          toolName: "bb_transactions_create",
          toolClass: "A",
          specPath: "/transactions/add",
          requestPath: "/transactions/add",
          shape: "ack",
          timeoutTier: "normal",
          body: { amount: 100, booking_date: "2026-08-12" },
        }),
        { retryRuntime: testRuntime() },
      );
    } catch (error) {
      caughtError = error;
    }
    expect(api.count("/transactions/add")).toBe(1);
    expect((caughtError as ApiResponseError).specPath).toBe("/transactions/add");
    expect((caughtError as ApiResponseError).errorCode).toBe(15);
  });
});

describe("Zeitlimit und Abbruch", () => {
  it("rechnet die drei Stufen aus BB_MCP_TIMEOUT_MS", () => {
    expect(timeoutForTier("short", 30_000)).toBe(15_000);
    expect(timeoutForTier("normal", 30_000)).toBe(30_000);
    expect(timeoutForTier("long", 30_000)).toBe(120_000);
  });

  it("bricht nach dem Zeitlimit der Stufe ab", async () => {
    const config = installTestConfig();
    // Die Stufe „kurz" ist die Hälfte von „normal". Der Wert liegt hier weit unter der
    // Untergrenze von BB_MCP_TIMEOUT_MS, damit der Fall in Millisekunden nachweisbar ist.
    const fastConfig = { ...config, timeoutMs: 60 };
    // Eigener Pfad: Die Verzögerung hängt an der Abfangregel, und die entsteht je Pfad nur
    // einmal je Testdatei.
    api.post("/reports/get/bwa", { json: { success: true, rows: 0, data: [] } }, { delayMs: 400 });

    let caughtError: unknown;
    try {
      await callEndpoint(
        call({
          toolName: "bb_reports_get_bwa",
          specPath: "/reports/get/bwa",
          requestPath: "/reports/get/bwa",
        }),
        { config: fastConfig, retryRuntime: testRuntime() },
      );
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(TimeoutError);
    expect((caughtError as TimeoutError).timeoutMs).toBe(30);
    expect((caughtError as TimeoutError).changed).toBe("nein"); // lesend
  });

  it("bricht einen laufenden Aufruf ab und nennt den Ausgang bei schreibenden ungewiss", async () => {
    // extra.signal wird an jeden fetch durchgereicht (5.1). Bricht der Client ab, während die
    // Anfrage unterwegs ist, ist der Ausgang bei einem schreibenden Werkzeug offen.
    api.post("/postings/add/receipt", { json: { success: true, message: "ok" } }, { delayMs: 300 });
    const controller = new AbortController();
    const inFlight = callEndpoint(
      call({
        toolName: "bb_postings_create_for_receipt",
        toolClass: "B",
        specPath: "/postings/add/receipt",
        requestPath: "/postings/add/receipt",
        shape: "ack",
        timeoutTier: "normal",
      }),
      { signal: controller.signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();

    let caughtError: unknown;
    try {
      await inFlight;
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(CancelledError);
    expect((caughtError as CancelledError).phase).toBe("unclear");
    expect((caughtError as CancelledError).changed).toBe("unbekannt");
    expect(api.count("/postings/add/receipt")).toBe(1);
  });

  it("bricht das Warten auf ein Token ab, ohne etwas zu senden", async () => {
    // Wartet der Aufruf auf das Minutenkontingent und bricht der Client ab, ist das ein
    // Abbruch vor dem ersten Byte: nichts ging hinaus, nichts wurde geändert.
    const neverFinishes: RateLimiterClock = {
      now: () => 0,
      sleep: (_ms, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("abgebrochen")), { once: true });
        }),
    };
    const limiter = new RateLimiter({
      ratePerMinute: 60,
      clock: neverFinishes,
      notify: () => undefined,
    });
    const context = {
      toolName: "bb_receipts_add_batch",
      specPath: "/receipts/addBatch",
      toolClass: "A" as const,
    };
    // Den batch-Eimer leeren; er fasst genau einen Token.
    await limiter.acquire({
      tenant: tenantKey(TEST_CREDENTIALS.BB_API_KEY),
      bucket: "batch",
      context,
    });

    api.post("/receipts/addBatch", { json: { success: true, message: "ok" } });
    const controller = new AbortController();
    const waiting = callEndpoint(
      call({
        toolName: "bb_receipts_add_batch",
        toolClass: "A",
        specPath: "/receipts/addBatch",
        requestPath: "/receipts/addBatch",
        shape: "ack",
        bucket: "batch",
        timeoutTier: "long",
      }),
      { signal: controller.signal, limiter },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    let caughtError: unknown;
    try {
      await waiting;
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(CancelledError);
    expect((caughtError as CancelledError).phase).toBe("not-sent");
    expect((caughtError as CancelledError).changed).toBe("nein");
    expect(api.count("/receipts/addBatch")).toBe(0);
  });

  it("setzt nichts ab, wenn der Client vorher abbricht", async () => {
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });
    const controller = new AbortController();
    controller.abort();

    let caughtError: unknown;
    try {
      await callEndpoint(call(), { signal: controller.signal });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(CancelledError);
    expect((caughtError as CancelledError).phase).toBe("not-sent");
    expect(api.count()).toBe(0);
  });
});

describe("Absagen vor dem ersten Byte", () => {
  it("lehnt einen api_key in den Argumenten ab", async () => {
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });
    let caughtError: unknown;
    try {
      await callEndpoint(call({ body: { api_key: "fremder-mandant" } }));
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(InvalidRequestError);
    expect((caughtError as InvalidRequestError).reason).toBe("api-key-in-arguments");
    expect(api.count()).toBe(0);
  });

  it("lehnt einen Pfad ab, der die Basis verlässt oder Punktsegmente trägt", async () => {
    expect(checkRequestPath("/receipts/get")).toBe("");
    expect(checkRequestPath("receipts/get")).not.toBe("");
    expect(checkRequestPath("/receipts/get/../../admin")).not.toBe("");
    expect(checkRequestPath("/receipts/get?x=1")).not.toBe("");
    expect(checkRequestPath("/receipts//get")).not.toBe("");
    expect(checkRequestPath("/receipts/ get")).not.toBe("");

    let caughtError: unknown;
    try {
      await callEndpoint(call({ requestPath: "/receipts/get/../../admin" }));
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(InvalidRequestError);
    expect((caughtError as InvalidRequestError).reason).toBe("invalid-path");
    expect(api.count()).toBe(0);
  });

  it("lehnt den Aufruf ohne Zugangsdaten ab, ohne etwas zu senden", async () => {
    const silencedStderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      installTestConfig({ BB_API_SECRET: "" });
    } finally {
      silencedStderr.mockRestore();
    }
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });

    let caughtError: unknown;
    try {
      await callEndpoint(call());
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(InvalidRequestError);
    expect((caughtError as InvalidRequestError).reason).toBe("missing-credentials");
    expect((caughtError as InvalidRequestError).changed).toBe("nein");
    expect(api.count()).toBe(0);
  });
});

describe("Absagen vor dem ersten Byte, zweiter Teil", () => {
  it("lehnt ein unbrauchbares Anmeldepaar ab", async () => {
    // Ein Doppelpunkt im API Client macht den Header unbrauchbar; ohne diese Absage käme ein
    // HTTP 401, dessen Ursache niemand sieht.
    installTestConfig({ BB_API_CLIENT: "cli:ent" });
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });

    let caughtError: unknown;
    try {
      await callEndpoint(call());
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(InvalidRequestError);
    expect((caughtError as InvalidRequestError).reason).toBe("unusable-credentials");
    expect((caughtError as InvalidRequestError).message).not.toContain("cli:ent");
    expect(api.count()).toBe(0);
  });

  it("lässt keinen gebauten Pfad die Basis-URL verlassen", () => {
    expect(buildRequestUrl(TEST_BASE_URL, "/receipts/get").toString()).toBe(
      `${TEST_BASE_URL}/receipts/get`,
    );
    // Zweite Verteidigungslinie am Ort des Absendens: Selbst wenn ein Pfad die Prüfung aus
    // checkRequestPath je passieren sollte, darf er die Basis nicht verlassen.
    expect(() => buildRequestUrl(TEST_BASE_URL, "/../../angriff")).toThrow(/verlässt/);
  });
});

describe("Messwerte des Aufrufs", () => {
  it("meldet Versuche, Dauer und Wartezeit", async () => {
    api.post("/receipts/get", { json: { success: true, rows: 0, data: [] } });
    const result = await callEndpoint(call());
    expect(result.attempts).toBe(1);
    expect(result.waitedMs).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
