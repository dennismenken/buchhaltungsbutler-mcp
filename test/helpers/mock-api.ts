/**
 * Der gemeinsame MockAgent-Aufbau aller Testpakete (Plan 9.4).
 *
 * Es gibt genau eine Nachbildung des Netzes, und sie setzt auf der Ebene des eingebauten
 * `fetch` an: `undici`-`MockAgent` über `setGlobalDispatcher` (`test/setup.ts`). Damit prüft
 * jeder Test den echten Client aus `src/http/client.ts` und keinen Ersatz. Eine zweite
 * Mocking-Bibliothek gibt es nicht.
 *
 * Die Schnittstelle ist bewusst schmal, weil alle späteren Pakete sie benutzen:
 *
 * ```ts
 * const api = mockApi();
 * api.post("/receipts/get", { json: { success: true, rows: 1, data: [{ id_by_customer: "2" }] } });
 * // … Aufruf …
 * expect(api.count("/receipts/get")).toBe(1);
 * const [request] = await api.requests();
 * expect(request.body.api_key).toBe(TEST_CREDENTIALS.BB_API_KEY);
 * ```
 *
 * **Es geht in diesem Paket kein einziger Aufruf hinaus.** `disableNetConnect()` ist global
 * aktiv, und die Basis-URL der Testumgebung zeigt auf einen nicht auflösbaren Namen.
 */

import type { Interceptable } from "undici";

import { clearSecrets } from "../../src/config/redact.js";
import { initConfig, resetConfigForTests, type ResolvedConfig } from "../../src/config/resolve.js";
import { resetLoggingForTests } from "../../src/logging/stderr.js";
import { resetRateLimiterForTests } from "../../src/http/rate-limiter.js";
import { getMockAgent } from "../setup.js";

/** Herkunft: `vitest.config.ts` setzt genau diese Basis-URL für den Testlauf (Plan 9.1). */
export const TEST_ORIGIN = "https://nicht-aufloesbar.invalid";

/** Der Pfadteil der Basis-URL. Jeder Endpunktpfad hängt sich hinten an. */
export const TEST_BASE_PATH = "/api/v1";

export const TEST_BASE_URL = `${TEST_ORIGIN}${TEST_BASE_PATH}`;

/**
 * Platzhalter, niemals echte Zugangsdaten. Die drei Werte werden von `config/resolve.ts` zur
 * Schwärzung angemeldet; {@link resetTestConfig} meldet sie wieder ab.
 */
export const TEST_CREDENTIALS = {
  BB_API_CLIENT: "test-client",
  BB_API_SECRET: "test-secret",
  BB_API_KEY: "test-api-key",
} as const;

/** Eine eingerichtete Antwort. Genau eines von `json` und `body` wird gesetzt. */
export interface MockReply {
  /** HTTP-Status, Vorgabe 200. */
  readonly status?: number;
  /** Körper als JSON. Setzt `content-type: application/json; charset=utf-8`. */
  readonly json?: unknown;
  /** Roher Körper, für HTML und für absichtlich kaputtes JSON. */
  readonly body?: string;
  /** Content-Type; `null` lässt den Header ganz weg. */
  readonly contentType?: string | null;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface MockRequestInfo {
  /** Der vollständige Pfad einschließlich Basispfad. */
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Der wievielte Aufruf dieses Endpunkts, 1-basiert. */
  readonly attempt: number;
}

/**
 * Die Antwort eines Endpunkts: eine feste, eine Folge (die letzte gilt für alle weiteren
 * Aufrufe) oder eine Funktion.
 */
export type MockReplySource =
  | MockReply
  | readonly MockReply[]
  | ((request: MockRequestInfo) => MockReply);

export interface RecordedRequest {
  /** Vollständiger Pfad, zum Beispiel `/api/v1/receipts/get/4711`. */
  readonly path: string;
  /** Pfad ohne Basispfad, zum Beispiel `/receipts/get/4711`. */
  readonly endpoint: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
  /** Der gesendete Body, zerlegt. Leeres Objekt, wenn der Body kein JSON war. */
  readonly body: Record<string, unknown>;
}

export interface MockPostOptions {
  /**
   * Verzögert **jede** Antwort dieses Endpunkts. Gedacht für den Nachweis des Zeitlimits.
   *
   * Zwei Einschränkungen, beide technisch bedingt: Die Verzögerung hängt an der Abfangregel
   * und damit am Pfad, ein Pfad kann also nicht verzögert **und** unverzögert antworten. Und
   * ein verzögerter Endpunkt zeichnet **keine** Anfragen auf, er zählt nur — `undici@8.10.2`
   * wertet `MockScope.delay()` bei einer Antwortfunktion nicht aus (geprüft am 2026-09-12),
   * und die Aufzeichnung des Körpers braucht genau diese Antwortfunktion.
   */
  readonly delayMs?: number;
}

export interface ApiMock {
  /** Richtet die Antwort auf `POST <endpoint>` ein. */
  post(endpoint: string, reply: MockReplySource, options?: MockPostOptions): ApiMock;
  /**
   * Lässt jeden Aufruf von `POST <endpoint>` mit einem Verbindungsfehler scheitern.
   *
   * Ein Endpunkt ist entweder gewöhnlich eingerichtet oder als Verbindungsfehler; beides
   * zugleich geht nicht, weil undici die zuerst eingetragene Abfangregel nimmt.
   */
  postNetworkError(endpoint: string, error?: Error): ApiMock;
  /** Zahl der Aufrufe, insgesamt oder für einen Endpunkt. Zählt auch gescheiterte. */
  count(endpoint?: string): number;
  /** Die aufgezeichneten Anfragen, in Reihenfolge. Verbindungsfehler tragen keinen Body. */
  requests(endpoint?: string): Promise<RecordedRequest[]>;
  /** Die letzte aufgezeichnete Anfrage. Wirft, wenn es keine gibt. */
  lastRequest(endpoint?: string): Promise<RecordedRequest>;
  /** Gibt die eingerichteten Antworten frei. Die Abfangregeln selbst bleiben stehen. */
  close(): void;
}

interface PendingRecord {
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: Promise<string>;
}

/**
 * Die eingerichteten Antworten des Prozesses, je Pfad.
 *
 * Die Abfangregel bei undici bleibt dauerhaft stehen (`persist()`), die Antwort dahinter ist
 * austauschbar. Das ist der Grund für diese Zwischenschicht: Ohne sie müsste jeder Test eine
 * eigene Abfangregel eintragen, und zwei Tests auf denselben Pfad würden sich in die Quere
 * kommen, weil undici die zuerst eingetragene nimmt.
 */
const handlers = new Map<string, (info: MockRequestInfo) => MockReply>();
const interceptedPaths = new Set<string>();
const records: PendingRecord[] = [];
const callCounts = new Map<string, number>();

function fullPathOf(endpoint: string): string {
  return `${TEST_BASE_PATH}${endpoint}`;
}

function normalizeHeaders(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === null || raw === undefined) {
    return out;
  }
  if (typeof (raw as Headers).forEach === "function" && !Array.isArray(raw)) {
    const maybeHeaders = raw as Headers;
    if (typeof maybeHeaders.get === "function") {
      maybeHeaders.forEach((value, key) => {
        out[key.toLowerCase()] = value;
      });
      return out;
    }
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

async function readBody(body: unknown): Promise<string> {
  if (typeof body === "string") {
    return body;
  }
  if (body === null || body === undefined) {
    return "";
  }
  const iterable = body as AsyncIterable<unknown>;
  if (typeof iterable[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of iterable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return "<Body in unbekannter Form>";
}

function pool(): Interceptable {
  return getMockAgent().get(TEST_ORIGIN);
}

/** Zählt einen Aufruf in der Abfangregel selbst; für Regeln ohne Antwortfunktion. */
function countingBodyMatcher(path: string): () => boolean {
  return () => {
    callCounts.set(path, (callCounts.get(path) ?? 0) + 1);
    return true;
  };
}

function claimPath(path: string, was: string): void {
  if (interceptedPaths.has(path)) {
    throw new Error(
      `Für ${path} ist in dieser Testdatei bereits eine Abfangregel eingetragen; ` +
        `${was} braucht einen eigenen Pfad. undici nimmt je Pfad die zuerst eingetragene Regel.`,
    );
  }
  interceptedPaths.add(path);
}

/**
 * Eine Abfangregel mit Verzögerung und **statischer** Antwort.
 *
 * Der Umweg über die statische Antwort ist nötig, weil `undici@8.10.2` die Verzögerung bei
 * einer Antwortfunktion nicht auswertet (geprüft am 2026-09-12: 4 ms statt 300 ms). Mit einer
 * statischen Antwort greift sie.
 */
function registerDelayedInterceptor(path: string, reply: MockReply, delayMs: number): void {
  claimPath(path, "eine verzögerte Antwort");
  const { status, data, headers } = toReplyParts(reply);
  pool()
    .intercept({ path, method: "POST", body: countingBodyMatcher(path) })
    .reply(status, data, { headers })
    .delay(delayMs)
    .persist();
}

/** Setzt eine {@link MockReply} in Status, Körper und Header um. */
function toReplyParts(reply: MockReply): {
  status: number;
  data: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = { ...reply.headers };
  if (reply.contentType === null) {
    // Ausdrücklich ohne Content-Type: der Fall „die Gegenstelle sagt nicht, was sie schickt".
  } else if (reply.contentType !== undefined) {
    headers["content-type"] = reply.contentType;
  } else if (reply.json !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  return {
    status: reply.status ?? 200,
    data: reply.json === undefined ? (reply.body ?? "") : JSON.stringify(reply.json),
    headers,
  };
}

function ensureInterceptor(path: string): void {
  if (interceptedPaths.has(path)) {
    return;
  }
  interceptedPaths.add(path);
  pool()
    .intercept({ path, method: "POST" })
    .reply((options) => {
      const attempt = (callCounts.get(path) ?? 0) + 1;
      callCounts.set(path, attempt);
      const headers = normalizeHeaders(options.headers);
      records.push({
        path,
        method: options.method,
        headers,
        // Der Body ist bei `fetch` ein asynchron lesbarer Strom. Er wird hier angestoßen und
        // erst in `requests()` abgewartet; der Fehlerzweig verhindert eine unbeachtete
        // Ablehnung, die den Testlauf mit einer unklaren Warnung überziehen würde.
        rawBody: readBody(options.body).catch(
          (error: unknown) => `<Body nicht lesbar: ${String(error)}>`,
        ),
      });

      const handler = handlers.get(path);
      if (handler === undefined) {
        return {
          statusCode: 501,
          data: JSON.stringify({
            success: false,
            error_code: 0,
            message: `Für ${path} ist in diesem Test keine Antwort eingerichtet.`,
          }),
          responseOptions: { headers: { "content-type": "application/json" } },
        };
      }

      const {
        status,
        data,
        headers: replyHeaders,
      } = toReplyParts(handler({ path, method: options.method, headers, attempt }));
      return { statusCode: status, data, responseOptions: { headers: replyHeaders } };
    })
    .persist();
}

/**
 * Richtet die Nachbildung ein. Eine Sitzung je Test; {@link ApiMock.close} gibt sie frei.
 *
 * Der Aufruf setzt Zähler und Aufzeichnung zurück, damit zwei Tests in derselben Datei
 * einander nicht sehen.
 */
export function mockApi(): ApiMock {
  handlers.clear();
  records.length = 0;
  callCounts.clear();

  const ownPaths = new Set<string>();

  const api: ApiMock = {
    post(endpoint, reply, options) {
      const path = fullPathOf(endpoint);
      ownPaths.add(path);
      if (options?.delayMs !== undefined) {
        if (typeof reply === "function" || Array.isArray(reply)) {
          throw new Error(
            "Eine verzögerte Antwort muss eine feste MockReply sein; eine Folge oder eine " +
              "Funktion wertet undici zusammen mit delay() nicht aus.",
          );
        }
        registerDelayedInterceptor(path, reply as MockReply, options.delayMs);
        return api;
      }
      ensureInterceptor(path);
      handlers.set(path, toHandler(reply));
      return api;
    },

    postNetworkError(endpoint, error) {
      const path = fullPathOf(endpoint);
      ownPaths.add(path);
      claimPath(path, "ein Verbindungsfehler");
      const failure = error ?? Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
      pool()
        // Die Abfangregel zählt den Aufruf selbst, weil es hier keine Antwortfunktion gibt.
        .intercept({ path, method: "POST", body: countingBodyMatcher(path) })
        .replyWithError(failure)
        .persist();
      return api;
    },

    count(endpoint) {
      if (endpoint === undefined) {
        let total = 0;
        for (const value of callCounts.values()) {
          total += value;
        }
        return total;
      }
      return callCounts.get(fullPathOf(endpoint)) ?? 0;
    },

    async requests(endpoint) {
      const wanted = endpoint === undefined ? null : fullPathOf(endpoint);
      const selected = records.filter((record) => wanted === null || record.path === wanted);
      return await Promise.all(
        selected.map(async (record) => {
          const rawBody = await record.rawBody;
          let body: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(rawBody);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              body = parsed as Record<string, unknown>;
            }
          } catch {
            body = {};
          }
          return {
            path: record.path,
            endpoint: record.path.slice(TEST_BASE_PATH.length),
            method: record.method,
            headers: record.headers,
            rawBody,
            body,
          } satisfies RecordedRequest;
        }),
      );
    },

    async lastRequest(endpoint) {
      const all = await api.requests(endpoint);
      const last = all[all.length - 1];
      if (last === undefined) {
        throw new Error(
          `Es wurde keine Anfrage an ${endpoint ?? "die API"} aufgezeichnet. ` +
            "Entweder hat der Aufruf den Prozess nicht verlassen, oder er ging an einen anderen Pfad.",
        );
      }
      return last;
    },

    close() {
      for (const path of ownPaths) {
        handlers.delete(path);
      }
      records.length = 0;
      callCounts.clear();
    },
  };

  return api;
}

function toHandler(reply: MockReplySource): (info: MockRequestInfo) => MockReply {
  if (typeof reply === "function") {
    return reply;
  }
  if (Array.isArray(reply)) {
    const list = reply as readonly MockReply[];
    return (info) => list[Math.min(info.attempt - 1, list.length - 1)] ?? {};
  }
  return () => reply as MockReply;
}

/**
 * Legt eine Konfiguration für den Testlauf an: Platzhalter-Zugangsdaten und die Basis-URL
 * der Nachbildung.
 *
 * Die echte Auflösung aus `config/resolve.ts` läuft dabei durch, damit die Tests dieselben
 * Werte sehen wie der Betrieb. Die Zugangsdatendatei wird nicht gelesen, weil alle drei
 * Werte aus der Umgebung kommen (6.3 Punkt 1).
 */
export function installTestConfig(overrides: Record<string, string> = {}): ResolvedConfig {
  resetConfigForTests();
  clearSecrets();
  resetRateLimiterForTests();
  return initConfig({
    env: {
      ...TEST_CREDENTIALS,
      BB_BASE_URL: TEST_BASE_URL,
      ...overrides,
    },
    platform: "linux",
    homeDir: "/nicht/vorhanden",
    nodeVersion: process.versions.node,
  });
}

/** Setzt Konfiguration, Schwärzung, Rate-Limiter und Protokollstufe zurück. */
export function resetTestConfig(): void {
  resetConfigForTests();
  clearSecrets();
  resetRateLimiterForTests();
  resetLoggingForTests();
}
