/**
 * Token-Eimer je (`api_key`, Eimername), serialisiert über eine Promise-Kette (Plan 5.4).
 *
 * Dokumentiert sind 100 Anfragen je Mandant und Minute, ohne jeden Rate-Limit-Header
 * (`grundlagen.md` 3.1 und 3.3 — live geprüft, es gibt keinen). Ein Client kann sein
 * verbleibendes Kontingent also nicht ablesen, er muss selbst zählen. Das Kontingent ist
 * zudem **geteilt**: Die Weboberfläche desselben Mandanten verbraucht es mit. Deshalb 60
 * statt 100 als Vorgabe.
 *
 * **Der Eimerschlüssel ist der `api_key`** (Streitfrage S16), weil das Limit pro Mandant
 * gilt. Ein Server mit mehreren Profilen führt damit mehrere Eimersätze und drosselt nicht
 * quer über Mandanten hinweg. Abgelegt wird nicht der Schlüssel, sondern sein Hash
 * ({@link tenantKey}), damit er in keiner Diagnoseausgabe auftaucht.
 *
 * **Die Serialisierung ist der Kern.** Ohne sie prüfen zehn gleichzeitige Aufrufe denselben
 * Füllstand, finden alle einen freien Token und laufen gemeinsam durch; ein Eimer ohne
 * Serialisierung zählt also nur dort richtig, wo ohnehin niemand gleichzeitig zugreift —
 * und dann bräuchte es ihn nicht. Jeder Eimer führt deshalb eine Promise-Kette, in die sich
 * jede Entnahme einreiht. Auf der gespeicherten Kette steht ein `.catch(() => {})`, damit
 * eine Ablehnung die Kette nicht vergiftet.
 *
 * Der Eimer ist **prozesslokal**. Zwei Clients auf demselben Mandanten teilen ihn nicht; das
 * steht so in der README.
 */

import { logWarn } from "../logging/stderr.js";
import { getConfig } from "../config/resolve.js";
import type { ToolEntry } from "../registry/types.js";
import { RateLimitGiveUpError, type TransportErrorContext } from "./transport-error.js";

/** Die vier Eimer aus 5.4; der Name steht im Registereintrag. */
export type BucketName = ToolEntry["bucket"];

/** Ab dieser Wartezeit meldet der Server, dass er wartet (Plan 5.4). */
export const SLOW_WAIT_MS = 5_000;

/** Ab dieser Wartezeit gibt der Aufruf auf, statt stumm zu hängen (Plan 5.4). */
export const GIVE_UP_WAIT_MS = 30_000;

export interface BucketDefinition {
  /** Höchstzahl gleichzeitig verfügbarer Token. */
  readonly capacity: number;
  /** Zeitabstand, in dem ein Token nachwächst. */
  readonly intervalMs: number;
}

/**
 * Die vier Eimer nach der Tabelle in 5.4. Nur der `default`-Eimer hängt an der
 * Konfiguration; die drei übrigen stehen fest, weil sie dokumentierte Einzellimits der API
 * abbilden (`/receipts/upload`: 10 je Minute; `addBatch`: ein Aufruf je 5 Sekunden) oder, im
 * Fall von `reports`, eine bewusste Bremse sind.
 *
 * Der `reports`-Eimer ist **kein API-Limit**, sondern verhindert das Muster „create, sofort
 * get, `error_code` 8, sofort wieder create", das einen laufenden Bericht mehrfach ersetzt.
 */
export function bucketDefinitions(ratePerMinute: number): Record<BucketName, BucketDefinition> {
  return {
    default: { capacity: ratePerMinute, intervalMs: 60_000 / ratePerMinute },
    upload: { capacity: 10, intervalMs: 6_000 },
    batch: { capacity: 1, intervalMs: 5_000 },
    reports: { capacity: 1, intervalMs: 10_000 },
  };
}

/** Die Uhr des Limiters. Im Betrieb die echte, im Test eine gesteuerte (Plan 9.5). */
export interface RateLimiterClock {
  now(): number;
  /** Wartet; bricht ab, sobald das Signal ausgelöst wird. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/**
 * Die echte Uhr.
 *
 * `performance.now()` statt `Date.now()`, weil der Füllstand eines Eimers aus einer
 * **Zeitdifferenz** folgt: Eine Korrektur der Systemuhr durch NTP würde bei `Date.now()`
 * entweder Token erzeugen oder einen Aufruf unnötig warten lassen. `performance.now()` läuft
 * monoton ab Prozessstart und kennt diesen Sprung nicht. Ein absoluter Zeitpunkt wird hier
 * nirgends gebraucht.
 */
export const systemClock: RateLimiterClock = {
  now: () => performance.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(signal.reason instanceof Error ? signal.reason : new Error("abgebrochen"));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      function onAbort(): void {
        clearTimeout(timer);
        reject(signal?.reason instanceof Error ? signal.reason : new Error("abgebrochen"));
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    }),
};

export interface SlowWaitInfo {
  readonly toolName: string;
  readonly bucket: BucketName;
  /** Die bis zum Erhalt des Tokens erwartete Gesamtwartezeit. */
  readonly expectedWaitMs: number;
}

/** Der Empfänger der Wartemeldung. AP10 hängt hier `sendLoggingMessage` ein (Plan 5.4). */
export type SlowWaitNotifier = (info: SlowWaitInfo) => void;

export interface RateLimiterOptions {
  /** Nachfüllrate des `default`-Eimers je Minute (`BB_MCP_RATE_LIMIT`, 10 bis 100). */
  readonly ratePerMinute: number;
  readonly clock?: RateLimiterClock;
  readonly notify?: SlowWaitNotifier;
  readonly slowWaitMs?: number;
  readonly giveUpWaitMs?: number;
}

export interface AcquireRequest {
  /** Gehashter `api_key`; {@link tenantKey} erzeugt ihn. */
  readonly tenant: string;
  /** Der Sondereimer des Registereintrags. `default` bedeutet: nur der Grundeimer. */
  readonly bucket: BucketName;
  readonly context: TransportErrorContext;
  readonly signal?: AbortSignal;
}

export interface AcquireResult {
  /** Tatsächlich gewartete Zeit über alle beteiligten Eimer. */
  readonly waitedMs: number;
  /** Die Eimer, aus denen je ein Token entnommen wurde, in Entnahmereihenfolge. */
  readonly buckets: readonly BucketName[];
}

/** Ein einzelner Eimer. Alle Entnahmen laufen serialisiert durch {@link take}. */
class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;
  /** Die Kette, in die sich jede Entnahme einreiht. Sie lehnt nie ab. */
  private chain: Promise<void> = Promise.resolve();

  readonly name: BucketName;
  private readonly definition: BucketDefinition;
  private readonly clock: RateLimiterClock;
  private readonly notify: SlowWaitNotifier;
  private readonly slowWaitMs: number;
  private readonly giveUpWaitMs: number;

  // Die Felder stehen einzeln und werden im Rumpf zugewiesen, statt als Parametereigenschaften
  // im Konstruktor: Node lehnt Parametereigenschaften beim reinen Entfernen der Typen mit
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX ab. Sonst ließe sich kein Skript, das den HTTP-Client
  // zieht, mit `node datei.ts` starten (AP17).
  constructor(
    name: BucketName,
    definition: BucketDefinition,
    clock: RateLimiterClock,
    notify: SlowWaitNotifier,
    slowWaitMs: number,
    giveUpWaitMs: number,
  ) {
    this.name = name;
    this.definition = definition;
    this.clock = clock;
    this.notify = notify;
    this.slowWaitMs = slowWaitMs;
    this.giveUpWaitMs = giveUpWaitMs;
    this.tokens = definition.capacity;
    this.lastRefillAt = clock.now();
  }

  private refill(at: number): void {
    const elapsed = at - this.lastRefillAt;
    if (elapsed <= 0) {
      // Läuft die übergebene Uhr rückwärts — bei `performance.now()` ausgeschlossen, bei einer
      // eingespeisten Uhr nicht —, entstehen hier keine Token. Der Bezugspunkt wandert auf den
      // kleineren Wert, damit der Eimer danach nicht bis zum Einholen des alten Stands steht.
      this.lastRefillAt = Math.min(this.lastRefillAt, at);
      return;
    }
    const grown = elapsed / this.definition.intervalMs;
    this.tokens = Math.min(this.definition.capacity, this.tokens + grown);
    this.lastRefillAt = at;
  }

  /** Reiht die Entnahme in die Kette ein und liefert die gewartete Zeit. */
  take(request: AcquireRequest): Promise<number> {
    const enqueuedAt = this.clock.now();
    const result = this.chain.then(() => this.takeNow(request, enqueuedAt));
    // Die gespeicherte Kette darf nie ablehnen, sonst reißt die Serialisierung ab.
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async takeNow(request: AcquireRequest, enqueuedAt: number): Promise<number> {
    let notified = false;
    for (;;) {
      const now = this.clock.now();
      this.refill(now);
      if (this.tokens >= 1) {
        this.tokens -= 1;
        // Auf ganze Millisekunden gerundet: `performance.now()` liefert Bruchteile, und eine
        // gemeldete Wartezeit von 0,0014 ms wäre in einer Antwort nur Rauschen.
        return Math.max(0, Math.round(now - enqueuedAt));
      }

      const waitedSoFar = Math.max(0, now - enqueuedAt);
      const stillNeeded = Math.ceil((1 - this.tokens) * this.definition.intervalMs);
      const expectedTotal = waitedSoFar + stillNeeded;

      if (expectedTotal > this.giveUpWaitMs) {
        // Aufgegeben wird, sobald die Wartezeit **feststeht**, nicht erst nach dem Ablaufen:
        // Das Ergebnis ist dasselbe, und der Client hängt nicht 30 Sekunden ohne Nachricht.
        throw new RateLimitGiveUpError(request.context, {
          bucket: this.name,
          waitMs: expectedTotal,
          limitMs: this.giveUpWaitMs,
        });
      }
      if (!notified && expectedTotal > this.slowWaitMs) {
        notified = true;
        this.notify({
          toolName: request.context.toolName,
          bucket: this.name,
          expectedWaitMs: expectedTotal,
        });
      }

      await this.clock.sleep(stillNeeded, request.signal);
    }
  }

  /** Füllstand für Diagnose und Tests. */
  level(): number {
    this.refill(this.clock.now());
    return this.tokens;
  }
}

function defaultNotifier(info: SlowWaitInfo): void {
  logWarn(
    `${info.toolName} wartet etwa ${Math.round(info.expectedWaitMs / 1000)} s auf das ` +
      `Minutenkontingent des Mandanten (Eimer ${info.bucket}).`,
  );
}

/**
 * Die Eimerverwaltung. Eine Instanz je Prozess genügt; mehrere Mandanten unterscheidet sie
 * über {@link AcquireRequest.tenant}.
 */
export class RateLimiter {
  private readonly definitions: Record<BucketName, BucketDefinition>;
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly clock: RateLimiterClock;
  private readonly slowWaitMs: number;
  private readonly giveUpWaitMs: number;
  private notify: SlowWaitNotifier;

  constructor(options: RateLimiterOptions) {
    this.definitions = bucketDefinitions(options.ratePerMinute);
    this.clock = options.clock ?? systemClock;
    this.notify = options.notify ?? defaultNotifier;
    this.slowWaitMs = options.slowWaitMs ?? SLOW_WAIT_MS;
    this.giveUpWaitMs = options.giveUpWaitMs ?? GIVE_UP_WAIT_MS;
  }

  /** Hängt den Empfänger der Wartemeldung ein (AP10: `sendLoggingMessage`). */
  setNotifier(notify: SlowWaitNotifier): void {
    this.notify = notify;
  }

  private bucketFor(tenant: string, name: BucketName): TokenBucket {
    const key = `${tenant}:${name}`;
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = new TokenBucket(
        name,
        this.definitions[name],
        this.clock,
        (info) => {
          this.notify(info);
        },
        this.slowWaitMs,
        this.giveUpWaitMs,
      );
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /**
   * Entnimmt die Token für **einen** Versuch: immer einen aus `default`, bei einem
   * Sondereimer zusätzlich einen aus diesem.
   *
   * Der Sondereimer kommt zuerst, weil er der knappere ist: Wer zuerst den Grundeimer leert
   * und dann fünf Sekunden auf den `batch`-Eimer wartet, hat in dieser Zeit ein Kontingent
   * verbraucht, das andere Aufrufe hätten nutzen können.
   *
   * Wiederholt ein lesendes Werkzeug (5.3), ruft jeder Versuch diese Methode erneut auf.
   * Sonst erzeugte ausgerechnet der Fehler, der Drosselung anzeigt, ungebremste Zusatzlast.
   */
  async acquire(request: AcquireRequest): Promise<AcquireResult> {
    const order: BucketName[] =
      request.bucket === "default" ? ["default"] : [request.bucket, "default"];
    let waitedMs = 0;
    for (const name of order) {
      waitedMs += await this.bucketFor(request.tenant, name).take(request);
    }
    return { waitedMs, buckets: order };
  }

  /** Füllstände für Diagnose und Tests, Schlüssel `<tenant>:<eimer>`. */
  levels(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, bucket] of this.buckets) {
      out[key] = bucket.level();
    }
    return out;
  }
}

// --- Prozessweite Instanz ------------------------------------------------------------

let shared: RateLimiter | null = null;
let sharedNotifier: SlowWaitNotifier | null = null;

/**
 * Der Limiter des Prozesses. Er entsteht beim ersten Aufruf aus der Konfiguration und wird
 * danach nicht mehr ausgetauscht; `BB_MCP_RATE_LIMIT` ist zur Laufzeit nicht änderbar, weil
 * das Konfigurationsobjekt eingefroren ist (6.4 Punkt 7).
 */
export function getRateLimiter(): RateLimiter {
  if (shared === null) {
    shared = new RateLimiter({ ratePerMinute: getConfig().rateLimitPerMinute });
    if (sharedNotifier !== null) {
      shared.setNotifier(sharedNotifier);
    }
  }
  return shared;
}

/**
 * Hängt den Empfänger der Wartemeldung ein, auch schon vor dem ersten Aufruf von
 * {@link getRateLimiter}. AP10 ruft das beim Aufbau des Servers auf.
 */
export function setRateLimitNotifier(notify: SlowWaitNotifier): void {
  sharedNotifier = notify;
  if (shared !== null) {
    shared.setNotifier(notify);
  }
}

/** Verwirft den prozessweiten Limiter. Ausschließlich für Tests. */
export function resetRateLimiterForTests(): void {
  shared = null;
  sharedNotifier = null;
}
