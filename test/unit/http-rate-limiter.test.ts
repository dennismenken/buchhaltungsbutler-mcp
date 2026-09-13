import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bucketDefinitions,
  getRateLimiter,
  RateLimiter,
  setRateLimitNotifier,
  systemClock,
  type RateLimiterClock,
  type SlowWaitInfo,
} from "../../src/http/rate-limiter.js";
import {
  RateLimitGiveUpError,
  type TransportErrorContext,
} from "../../src/http/transport-error.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";

// Geprüft wird über eine gesteuerte Uhr (Plan 9.5). Mit der echten Uhr wäre der Nachweis
// „zehn gleichzeitige Aufrufe laufen nicht gemeinsam durch" entweder langsam oder wackelig,
// und genau dieser Nachweis ist der Grund für die Serialisierung.

class TestClock implements RateLimiterClock {
  private current = 0;
  private waiters: { at: number; resolve: () => void; reject: (reason: Error) => void }[] = [];

  now(): number {
    return this.current;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(new Error("abgebrochen"));
        return;
      }
      const waiter = { at: this.current + ms, resolve, reject };
      this.waiters.push(waiter);
      signal?.addEventListener(
        "abort",
        () => {
          this.waiters = this.waiters.filter((entry) => entry !== waiter);
          reject(new Error("abgebrochen"));
        },
        { once: true },
      );
    });
  }

  /** Lässt die Zeit laufen und weckt jeden fälligen Wartevorgang der Reihe nach. */
  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    for (;;) {
      const due = this.waiters
        .filter((waiter) => waiter.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (due === undefined) {
        break;
      }
      this.current = Math.max(this.current, due.at);
      this.waiters = this.waiters.filter((waiter) => waiter !== due);
      due.resolve();
      await flush();
    }
    this.current = target;
    await flush();
  }

  get pendingWaits(): number {
    return this.waiters.length;
  }
}

/** Lässt alle anstehenden Mikrotasks durchlaufen. */
function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

const CONTEXT: TransportErrorContext = {
  toolName: "bb_receipts_search",
  specPath: "/receipts/get",
  toolClass: "R",
};

const WRITING: TransportErrorContext = {
  toolName: "bb_receipts_add_batch",
  specPath: "/receipts/addBatch",
  toolClass: "A",
};

function build(options: {
  clock: TestClock;
  ratePerMinute?: number;
  notify?: (info: SlowWaitInfo) => void;
}): RateLimiter {
  return new RateLimiter({
    ratePerMinute: options.ratePerMinute ?? 60,
    clock: options.clock,
    // Vorgabe ist ein stiller Empfänger: Der Wartehinweis gehört im Betrieb auf stderr
    // beziehungsweise an sendLoggingMessage, im Testlauf wäre er nur Lärm. Der Weg nach
    // stderr hat seinen eigenen Fall weiter unten.
    notify: options.notify ?? (() => undefined),
  });
}

describe("bucketDefinitions", () => {
  it("entspricht der Tabelle aus 5.4", () => {
    const buckets = bucketDefinitions(60);
    expect(buckets.default).toEqual({ capacity: 60, intervalMs: 1_000 });
    expect(buckets.upload).toEqual({ capacity: 10, intervalMs: 6_000 });
    expect(buckets.batch).toEqual({ capacity: 1, intervalMs: 5_000 });
    expect(buckets.reports).toEqual({ capacity: 1, intervalMs: 10_000 });
  });

  it("zieht die Nachfüllrate des Grundeimers aus BB_MCP_RATE_LIMIT", () => {
    expect(bucketDefinitions(10).default).toEqual({ capacity: 10, intervalMs: 6_000 });
    expect(bucketDefinitions(100).default).toEqual({ capacity: 100, intervalMs: 600 });
  });
});

describe("Zehn gleichzeitige Aufrufe laufen nicht gemeinsam durch", () => {
  it("lässt am batch-Eimer genau einen durch und reiht die übrigen ein", async () => {
    const clock = new TestClock();
    const limiter = build({ clock });
    const completed: number[] = [];

    const runs = Array.from({ length: 10 }, (_, index) =>
      limiter.acquire({ tenant: "t1", bucket: "batch", context: WRITING }).then(
        () => {
          completed.push(index);
          return "durch";
        },
        (error: unknown) => {
          if (error instanceof RateLimitGiveUpError) {
            return "aufgegeben";
          }
          throw error;
        },
      ),
    );
    await flush();

    // Der batch-Eimer fasst genau einen Token (ein Aufruf je 5 Sekunden).
    expect(completed).toEqual([0]);

    await clock.advance(5_000);
    expect(completed).toEqual([0, 1]);

    await clock.advance(5_000);
    expect(completed).toEqual([0, 1, 2]);

    // Gemeinsam durchgelaufen ist niemand.
    expect(completed).toHaveLength(3);

    await clock.advance(20_000);
    const results = await Promise.all(runs);

    // Bis zur Grenze von 30 Sekunden kommen sieben durch; die drei übrigen bekommen keine
    // stumme Hängepartie, sondern die Meldung aus 5.4 und den Rat, zusammenzufassen.
    expect(completed).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(results.filter((result) => result === "aufgegeben")).toHaveLength(3);
  });

  it("hält die Reihenfolge auch dann ein, wenn Token vorhanden sind", async () => {
    const clock = new TestClock();
    const limiter = build({ clock, ratePerMinute: 60 });
    const done: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        limiter
          .acquire({ tenant: "t1", bucket: "default", context: CONTEXT })
          .then(() => done.push(index)),
      ),
    );
    expect(done).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(limiter.levels()["t1:default"]).toBe(50);
  });

  it("bremst den elften Aufruf, wenn der Grundeimer zehn Token führt", async () => {
    const clock = new TestClock();
    const limiter = build({ clock, ratePerMinute: 10 });
    let passed = 0;
    const runs = Array.from({ length: 11 }, () =>
      limiter.acquire({ tenant: "t1", bucket: "default", context: CONTEXT }).then(() => {
        passed += 1;
      }),
    );
    await flush();
    expect(passed).toBe(10);
    expect(clock.pendingWaits).toBe(1);

    // Ein Token wächst bei 10 je Minute alle 6 Sekunden nach.
    await clock.advance(6_000);
    await Promise.all(runs);
    expect(passed).toBe(11);
  });
});

describe("Eimerschlüssel und Sondereimer", () => {
  it("drosselt nicht quer über Mandanten", async () => {
    const clock = new TestClock();
    const limiter = build({ clock });
    await limiter.acquire({ tenant: "mandant-a", bucket: "batch", context: WRITING });
    // Derselbe Eimername, anderer Mandant: eigener Eimer, also kein Warten.
    const start = clock.now();
    await limiter.acquire({ tenant: "mandant-b", bucket: "batch", context: WRITING });
    expect(clock.now()).toBe(start);
    expect(limiter.levels()["mandant-a:batch"]).toBe(0);
    expect(limiter.levels()["mandant-b:batch"]).toBe(0);
  });

  it("entnimmt bei einem Sondereimer zusätzlich einen Token aus default", async () => {
    const clock = new TestClock();
    const limiter = build({ clock });
    const result = await limiter.acquire({
      tenant: "t1",
      bucket: "upload",
      context: { toolName: "bb_receipts_upload", specPath: "/receipts/upload", toolClass: "A" },
    });
    expect(result.buckets).toEqual(["upload", "default"]);
    expect(limiter.levels()["t1:upload"]).toBe(9);
    expect(limiter.levels()["t1:default"]).toBe(59);
  });

  it("entnimmt je Versuch einen eigenen Token", async () => {
    // 5.3: Der Limiter liegt in der Wiederholschleife, nicht davor. Drei Versuche eines
    // lesenden Werkzeugs verbrauchen drei Token.
    const clock = new TestClock();
    const limiter = build({ clock });
    for (let attempt = 0; attempt < 3; attempt++) {
      await limiter.acquire({ tenant: "t1", bucket: "default", context: CONTEXT });
    }
    expect(limiter.levels()["t1:default"]).toBe(57);
  });
});

describe("Warten melden und aufgeben", () => {
  it("meldet eine Wartezeit über fünf Sekunden genau einmal", async () => {
    const clock = new TestClock();
    const notices: SlowWaitInfo[] = [];
    const limiter = build({
      clock,
      notify: (info) => {
        notices.push(info);
      },
    });

    // Der reports-Eimer gibt einen Aufruf je zehn Sekunden frei.
    const context: TransportErrorContext = {
      toolName: "bb_reports_create_bwa",
      specPath: "/reports/create/bwa",
      toolClass: "AR",
    };
    await limiter.acquire({ tenant: "t1", bucket: "reports", context });
    const second = limiter.acquire({ tenant: "t1", bucket: "reports", context });
    await flush();

    expect(notices).toHaveLength(1);
    expect(notices[0]?.bucket).toBe("reports");
    expect(notices[0]?.toolName).toBe("bb_reports_create_bwa");
    expect(notices[0]?.expectedWaitMs).toBe(10_000);

    await clock.advance(10_000);
    await second;
    expect(notices).toHaveLength(1);
  });

  it("meldet unter fünf Sekunden nichts", async () => {
    const clock = new TestClock();
    const notices: SlowWaitInfo[] = [];
    const limiter = build({
      clock,
      notify: (info) => {
        notices.push(info);
      },
    });
    const runs = Array.from({ length: 61 }, () =>
      limiter.acquire({ tenant: "t1", bucket: "default", context: CONTEXT }),
    );
    await flush();
    // Der 61. Aufruf wartet eine Sekunde — das ist keine Meldung wert.
    expect(notices).toHaveLength(0);
    await clock.advance(1_000);
    await Promise.all(runs);
  });

  it("gibt auf, sobald die Wartezeit über dreißig Sekunden feststeht", async () => {
    const clock = new TestClock();
    const limiter = build({ clock });
    // Sieben Aufrufe auf den batch-Eimer: der siebte müsste 30 Sekunden warten.
    const runs: Promise<unknown>[] = [];
    for (let i = 0; i < 8; i++) {
      runs.push(
        limiter
          .acquire({ tenant: "t1", bucket: "batch", context: WRITING })
          .catch((error: unknown) => error),
      );
    }
    await flush();
    await clock.advance(30_000);
    const results = await Promise.all(runs);

    const givenUp = results.filter(
      (result): result is RateLimitGiveUpError => result instanceof RateLimitGiveUpError,
    );
    expect(givenUp.length).toBeGreaterThan(0);
    const giveUpError = givenUp[0];
    expect(giveUpError?.bucket).toBe("batch");
    expect(giveUpError?.limitMs).toBe(30_000);
    expect(giveUpError?.waitMs).toBeGreaterThan(30_000);
    // Es ging nichts hinaus, also ist auch bei einem schreibenden Werkzeug nichts geändert.
    expect(giveUpError?.changed).toBe("nein");
    expect(giveUpError?.message).toContain("Sammelabfrage");
  });

  it("vergiftet die Kette nicht, wenn ein Wartevorgang aufgibt", async () => {
    const clock = new TestClock();
    const limiter = build({ clock, ratePerMinute: 10 });
    // Bei 10 je Minute wächst ein Token alle 6 Sekunden nach; der sechste Nachzügler wartet
    // über 30 Sekunden und gibt auf. Der Eimer muss danach weiter funktionieren.
    const initial = Array.from({ length: 10 }, () =>
      limiter.acquire({ tenant: "t1", bucket: "default", context: CONTEXT }),
    );
    await flush();
    await Promise.all(initial);

    const latecomers = Array.from({ length: 6 }, () =>
      limiter
        .acquire({ tenant: "t1", bucket: "default", context: CONTEXT })
        .then(() => "durch")
        .catch(() => "aufgegeben"),
    );
    await flush();
    await clock.advance(40_000);
    const results = await Promise.all(latecomers);
    expect(results).toContain("aufgegeben");
    expect(results).toContain("durch");

    // Nach allem Wartenden ist der Eimer wieder benutzbar.
    await clock.advance(60_000);
    await expect(
      limiter.acquire({ tenant: "t1", bucket: "default", context: CONTEXT }),
    ).resolves.toMatchObject({ buckets: ["default"] });
  });

  it("bricht das Warten ab, wenn der Client abbricht", async () => {
    const clock = new TestClock();
    const limiter = build({ clock });
    await limiter.acquire({ tenant: "t1", bucket: "batch", context: WRITING });
    const controller = new AbortController();
    const waiting = limiter
      .acquire({
        tenant: "t1",
        bucket: "batch",
        context: WRITING,
        signal: controller.signal,
      })
      .then(
        () => "durch",
        () => "abgebrochen",
      );
    await flush();
    controller.abort();
    expect(await waiting).toBe("abgebrochen");
  });
});

describe("Vorgegebener Empfänger der Wartemeldung", () => {
  it("schreibt den Hinweis nach stderr und niemals nach stdout", async () => {
    const clock = new TestClock();
    // Ohne eigenen Empfänger greift der vorgegebene: eine Zeile auf stderr. stdout gehört
    // dem MCP-Protokoll (Plan 1.3).
    const limiter = new RateLimiter({ ratePerMinute: 60, clock });
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    });
    try {
      const context: TransportErrorContext = {
        toolName: "bb_reports_create_sums",
        specPath: "/reports/create/sums",
        toolClass: "AR",
      };
      await limiter.acquire({ tenant: "t1", bucket: "reports", context });
      const second = limiter.acquire({ tenant: "t1", bucket: "reports", context });
      await flush();
      await clock.advance(10_000);
      await second;
    } finally {
      spy.mockRestore();
    }
    expect(lines.join("")).toContain("bb_reports_create_sums wartet");
    expect(lines.join("")).toContain("bbutler-mcp warn:");
  });
});

describe("Rückwärts laufende Uhr", () => {
  it("erzeugt keine Token", async () => {
    let current = 10_000;
    const clock: RateLimiterClock = {
      now: () => current,
      sleep: () => Promise.resolve(),
    };
    const limiter = new RateLimiter({ ratePerMinute: 60, clock });
    await limiter.acquire({ tenant: "t1", bucket: "default", context: CONTEXT });
    expect(limiter.levels()["t1:default"]).toBe(59);
    current = 0;
    expect(limiter.levels()["t1:default"]).toBe(59);
  });
});

describe("systemClock", () => {
  it("wartet mit echten Zeitgebern", async () => {
    const start = Date.now();
    await systemClock.sleep(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
  });

  it("lehnt sofort ab, wenn das Signal bereits ausgelöst ist", async () => {
    const controller = new AbortController();
    controller.abort(new Error("vorher abgebrochen"));
    await expect(systemClock.sleep(1_000, controller.signal)).rejects.toThrow("vorher abgebrochen");
  });

  it("bricht eine laufende Wartezeit ab", async () => {
    const controller = new AbortController();
    const waiting = systemClock.sleep(60_000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow();
  });
});

describe("Der prozessweite Limiter", () => {
  afterEach(() => {
    resetTestConfig();
  });

  it("entsteht aus der Konfiguration und bleibt danach derselbe", () => {
    installTestConfig({ BB_MCP_RATE_LIMIT: "25" });
    const first = getRateLimiter();
    expect(getRateLimiter()).toBe(first);
  });

  it("nimmt den Empfänger der Wartemeldung auch vor dem ersten Zugriff an", async () => {
    installTestConfig({ BB_MCP_RATE_LIMIT: "10" });
    const notices: SlowWaitInfo[] = [];
    setRateLimitNotifier((info) => {
      notices.push(info);
    });
    const limiter = getRateLimiter();
    // Der reports-Eimer gibt einen Aufruf je zehn Sekunden frei; der zweite wartet und meldet.
    const context: TransportErrorContext = {
      toolName: "bb_reports_create_bwa",
      specPath: "/reports/create/bwa",
      toolClass: "AR",
    };
    await limiter.acquire({ tenant: "t1", bucket: "reports", context });
    const controller = new AbortController();
    const second = limiter
      .acquire({ tenant: "t1", bucket: "reports", context, signal: controller.signal })
      .catch(() => "abgebrochen");
    await flush();
    controller.abort();
    await second;
    expect(notices).toHaveLength(1);
    expect(notices[0]?.toolName).toBe("bb_reports_create_bwa");
  });
});
