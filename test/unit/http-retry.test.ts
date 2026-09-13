import { describe, expect, it } from "vitest";

import { TOOL_CLASSES } from "../../src/registry/classes.js";
import type { ToolClass } from "../../src/registry/types.js";
import {
  backoffDelayMs,
  BASE_DELAY_MS,
  factsFromError,
  isRetryableRead,
  MAX_DELAY_MS,
  MAX_READ_ATTEMPTS,
  maxAttemptsFor,
  runAttempts,
  systemRetryRuntime,
  type RetryFacts,
  type RetryRuntime,
} from "../../src/http/retry.js";
import {
  ApiResponseError,
  CancelledError,
  InvalidRequestError,
  NetworkError,
  RateLimitGiveUpError,
  TimeoutError,
  type TransportErrorContext,
} from "../../src/http/transport-error.js";

// Die Retry-Weiche ist der gefährlichste Zweig des Projekts: Ein Retry an einem
// schreibenden Endpunkt erzeugt Doppelbuchungen, und die fallen erst im Jahresabschluss auf.

const READING_CONTEXT: TransportErrorContext = {
  toolName: "bb_receipts_search",
  specPath: "/receipts/get",
  toolClass: "R",
};

const WRITING_CONTEXT: TransportErrorContext = {
  toolName: "bb_postings_create_free",
  specPath: "/postings/add/free",
  toolClass: "B",
};

function apiError(
  status: number,
  errorCode: number | null,
  context: TransportErrorContext = READING_CONTEXT,
): ApiResponseError {
  return new ApiResponseError(context, {
    status,
    errorCode,
    apiMessage: "irgendein Text, der für die Entscheidung keine Rolle spielt",
    body: { success: false },
  });
}

function facts(partial: Partial<RetryFacts>): RetryFacts {
  return {
    specPath: "/receipts/get",
    status: null,
    errorCode: null,
    kind: "response",
    ...partial,
  };
}

/** Eine Laufzeit ohne echtes Warten. Die Wartezeiten werden aufgezeichnet. */
function testRuntime(randomValue = 0.5): RetryRuntime & { delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
    random: () => randomValue,
  };
}

describe("maxAttemptsFor", () => {
  it("erlaubt drei Versuche ausschließlich bei Klasse R", () => {
    expect(maxAttemptsFor("R")).toBe(MAX_READ_ATTEMPTS);
    for (const toolClass of Object.keys(TOOL_CLASSES) as ToolClass[]) {
      if (toolClass === "R") {
        continue;
      }
      expect(maxAttemptsFor(toolClass)).toBe(1);
    }
  });

  it("deckt alle sechs Klassen ab, ohne eine zu vergessen", () => {
    // Kommt je eine Klasse hinzu, fällt das hier auf und nicht erst im Betrieb.
    expect(Object.keys(TOOL_CLASSES)).toHaveLength(6);
  });
});

describe("backoffDelayMs", () => {
  it("verdoppelt und kappt bei 20 Sekunden", () => {
    const withoutJitter = (failedAttempts: number): number =>
      backoffDelayMs(failedAttempts, () => 0.5);
    expect(withoutJitter(1)).toBe(BASE_DELAY_MS);
    expect(withoutJitter(2)).toBe(2 * BASE_DELAY_MS);
    expect(withoutJitter(3)).toBe(4 * BASE_DELAY_MS);
    expect(withoutJitter(10)).toBe(MAX_DELAY_MS);
  });

  it("streut im Bereich 0,5 bis 1,5 um den vollen Wert", () => {
    // Ausdrücklich nicht delay × random(): Das wartet im Mittel nur die Hälfte und kommt zu
    // früh wieder.
    expect(backoffDelayMs(1, () => 0)).toBe(500);
    expect(backoffDelayMs(1, () => 0.999_999)).toBe(1_500);
    expect(backoffDelayMs(2, () => 0)).toBe(1_000);
    expect(backoffDelayMs(2, () => 0.999_999)).toBe(3_000);
  });

  it("wartet im Mittel den vollen Wert", () => {
    let sum = 0;
    const samples = 2_000;
    for (let i = 0; i < samples; i++) {
      sum += backoffDelayMs(1);
    }
    const average = sum / samples;
    expect(average).toBeGreaterThan(0.9 * BASE_DELAY_MS);
    expect(average).toBeLessThan(1.1 * BASE_DELAY_MS);
  });
});

describe("isRetryableRead", () => {
  it("wiederholt bei Netzwerkfehler und Zeitlimit", () => {
    expect(isRetryableRead(facts({ kind: "network" }))).toBe(true);
    expect(isRetryableRead(facts({ kind: "timeout" }))).toBe(true);
  });

  it("wiederholt bei HTTP 5xx, also auch bei 504/30 und 500/0", () => {
    expect(isRetryableRead(facts({ status: 500, errorCode: 0 }))).toBe(true);
    expect(isRetryableRead(facts({ status: 502, errorCode: null }))).toBe(true);
    expect(isRetryableRead(facts({ status: 504, errorCode: 30 }))).toBe(true);
  });

  it("wiederholt defensiv bei HTTP 429", () => {
    // In der Spezifikation kommt 429 nicht vor; das Verhalten beim Reißen des Minutenlimits
    // ist nicht verifiziert (grundlagen.md 3.3).
    expect(isRetryableRead(facts({ status: 429 }))).toBe(true);
  });

  it("unterscheidet error_code 15 nach dem HTTP-Status", () => {
    // 403/15 ist Drosselung, 400/15 ist ein falsches Sortierfeld. Derselbe Code, zwei
    // Bedeutungen.
    expect(isRetryableRead(facts({ status: 403, errorCode: 15 }))).toBe(true);
    expect(isRetryableRead(facts({ status: 400, errorCode: 15 }))).toBe(false);
  });

  it("wiederholt nie bei 400, 401, 403/11, 403/12 und 422", () => {
    expect(isRetryableRead(facts({ status: 400, errorCode: 5 }))).toBe(false);
    expect(isRetryableRead(facts({ status: 401, errorCode: 3 }))).toBe(false);
    expect(isRetryableRead(facts({ status: 401, errorCode: 4 }))).toBe(false);
    expect(isRetryableRead(facts({ status: 403, errorCode: 11 }))).toBe(false);
    expect(isRetryableRead(facts({ status: 403, errorCode: 12 }))).toBe(false);
    expect(isRetryableRead(facts({ status: 422, errorCode: 7 }))).toBe(false);
  });

  it("wiederholt nie nach einem Abbruch durch den Client oder einer örtlichen Absage", () => {
    expect(isRetryableRead(facts({ kind: "cancelled" }))).toBe(false);
    expect(isRetryableRead(facts({ kind: "local" }))).toBe(false);
  });

  it("entscheidet nicht am Meldungstext", () => {
    // L6: Live kam zu 400/15 der Text `invalid field specified`, der in keiner der beiden
    // Spezifikationsquellen steht. Beide Texte müssen dieselbe Entscheidung ergeben.
    const catalogText = new ApiResponseError(READING_CONTEXT, {
      status: 400,
      errorCode: 15,
      apiMessage: "invalid sort field specified",
      body: { success: false },
    });
    const liveText = new ApiResponseError(READING_CONTEXT, {
      status: 400,
      errorCode: 15,
      apiMessage: "invalid field specified",
      body: { success: false },
    });
    const decide = (error: ApiResponseError): boolean => {
      const derived = factsFromError(error);
      expect(derived).not.toBeNull();
      return isRetryableRead(derived as RetryFacts);
    };
    expect(decide(catalogText)).toBe(decide(liveText));
    expect(decide(liveText)).toBe(false);
  });
});

describe("factsFromError", () => {
  it("ordnet jeden Fehlertyp einer Art zu", () => {
    expect(factsFromError(new TimeoutError(READING_CONTEXT, 15_000))?.kind).toBe("timeout");
    expect(factsFromError(new NetworkError(READING_CONTEXT, "ECONNRESET"))?.kind).toBe("network");
    expect(factsFromError(new CancelledError(READING_CONTEXT, "in-flight"))?.kind).toBe(
      "cancelled",
    );
    expect(
      factsFromError(new InvalidRequestError("x", READING_CONTEXT, "invalid-path"))?.kind,
    ).toBe("local");
    expect(
      factsFromError(
        new RateLimitGiveUpError(READING_CONTEXT, { bucket: "batch", waitMs: 1, limitMs: 1 }),
      )?.kind,
    ).toBe("local");
    expect(factsFromError(apiError(500, 0))?.kind).toBe("response");
  });

  it("liefert für einen fremden Fehler nichts", () => {
    expect(factsFromError(new Error("irgendwas"))).toBeNull();
    expect(factsFromError("kein Fehler")).toBeNull();
  });
});

describe("runAttempts: der Zweig ist an Klasse R gebunden", () => {
  it("versucht es bei einem lesenden Werkzeug dreimal", async () => {
    const runtime = testRuntime();
    let attemptCount = 0;
    const runningAttempt = runAttempts({
      toolClass: "R",
      runtime,
      attempt: (attemptNumber) => {
        attemptCount = attemptNumber;
        return Promise.reject(apiError(504, 30));
      },
    });
    await expect(runningAttempt).rejects.toBeInstanceOf(ApiResponseError);
    expect(attemptCount).toBe(MAX_READ_ATTEMPTS);
    // Zwei Wartezeiten zwischen drei Versuchen, mit wachsendem Abstand.
    expect(runtime.delays).toEqual([BASE_DELAY_MS, 2 * BASE_DELAY_MS]);
  });

  it("versucht es bei jeder schreibenden Klasse genau einmal", async () => {
    for (const toolClass of Object.keys(TOOL_CLASSES) as ToolClass[]) {
      if (toolClass === "R") {
        continue;
      }
      const runtime = testRuntime();
      let attemptCount = 0;
      const context: TransportErrorContext = { ...WRITING_CONTEXT, toolClass };
      await expect(
        runAttempts({
          toolClass,
          runtime,
          attempt: () => {
            attemptCount += 1;
            // HTTP 504 ist der Fall: an einem schreibenden Werkzeug genau ein Request.
            return Promise.reject(apiError(504, 30, context));
          },
        }),
      ).rejects.toBeInstanceOf(ApiResponseError);
      expect(attemptCount).toBe(1);
      expect(runtime.delays).toEqual([]);
    }
  });

  it("gibt den Erfolg eines späteren Versuchs zurück", async () => {
    const runtime = testRuntime();
    let attemptCount = 0;
    const result = await runAttempts({
      toolClass: "R",
      runtime,
      attempt: (attemptNumber) => {
        attemptCount = attemptNumber;
        if (attemptNumber < 3) {
          return Promise.reject(new NetworkError(READING_CONTEXT, "ECONNRESET"));
        }
        return Promise.resolve("endlich");
      },
    });
    expect(result).toBe("endlich");
    expect(attemptCount).toBe(3);
  });

  it("hört bei einem nicht wiederholbaren Fehler sofort auf", async () => {
    const runtime = testRuntime();
    let attemptCount = 0;
    await expect(
      runAttempts({
        toolClass: "R",
        runtime,
        attempt: () => {
          attemptCount += 1;
          return Promise.reject(apiError(400, 15));
        },
      }),
    ).rejects.toBeInstanceOf(ApiResponseError);
    expect(attemptCount).toBe(1);
    expect(runtime.delays).toEqual([]);
  });

  it("gibt einen fremden Fehler unverändert weiter, ohne zu wiederholen", async () => {
    let attemptCount = 0;
    await expect(
      runAttempts({
        toolClass: "R",
        runtime: testRuntime(),
        attempt: () => {
          attemptCount += 1;
          return Promise.reject(new Error("Programmierfehler"));
        },
      }),
    ).rejects.toThrow("Programmierfehler");
    expect(attemptCount).toBe(1);
  });

  it("meldet jeden Wiederholversuch über onRetry", async () => {
    const reported: { failedAttempt: number; delayMs: number }[] = [];
    await expect(
      runAttempts({
        toolClass: "R",
        runtime: testRuntime(),
        onRetry: (info) => {
          reported.push({ failedAttempt: info.failedAttempt, delayMs: info.delayMs });
        },
        attempt: () => Promise.reject(apiError(503, null)),
      }),
    ).rejects.toBeInstanceOf(ApiResponseError);
    expect(reported).toEqual([
      { failedAttempt: 1, delayMs: BASE_DELAY_MS },
      { failedAttempt: 2, delayMs: 2 * BASE_DELAY_MS },
    ]);
  });

  it("bricht das Warten ab, wenn der Client abbricht", async () => {
    const controller = new AbortController();
    const runtime: RetryRuntime = {
      sleep: (_ms, signal) => {
        controller.abort();
        return signal?.aborted === true
          ? Promise.reject(new Error("abgebrochen"))
          : Promise.resolve();
      },
      random: () => 0.5,
    };
    await expect(
      runAttempts({
        toolClass: "R",
        runtime,
        signal: controller.signal,
        attempt: () => Promise.reject(new NetworkError(READING_CONTEXT, "ECONNRESET")),
      }),
    ).rejects.toThrow("abgebrochen");
  });
});

describe("systemRetryRuntime", () => {
  it("wartet wirklich und streut im erwarteten Bereich", async () => {
    const start = Date.now();
    await systemRetryRuntime.sleep(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < 50; i++) {
      const value = systemRetryRuntime.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("lehnt sofort ab, wenn das Signal bereits ausgelöst ist", async () => {
    const controller = new AbortController();
    controller.abort(new Error("vorher abgebrochen"));
    await expect(systemRetryRuntime.sleep(1_000, controller.signal)).rejects.toThrow(
      "vorher abgebrochen",
    );
  });

  it("bricht eine laufende Wartezeit ab, ohne den Zeitgeber stehen zu lassen", async () => {
    const controller = new AbortController();
    const pending = systemRetryRuntime.sleep(60_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("isRetryableRead ohne Antwort", () => {
  it("wiederholt nicht, wenn eine Antwort erwartet wurde, aber kein Status vorliegt", () => {
    expect(isRetryableRead(facts({ kind: "response", status: null }))).toBe(false);
  });
});
