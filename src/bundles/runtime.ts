// Der Ablauf eines Bündels: Aufrufe zählen, Schritte protokollieren, Lücken sammeln, den Block
// `bundle` führen.
//
// **Die Buchführung liegt hier und nicht in den Bündeln.** Ein Bündel wertet aus; dass jeder
// Teilaufruf gezählt wird, dass eine Lücke `complete` umlegt und dass der Eimer vor jedem
// zusätzlichen Aufruf befragt wird, entscheidet diese eine Stelle. Der Token-Eimer wird dabei
// benutzt und nicht umgangen: Jeder Teilaufruf geht durch `callEndpoint` und entnimmt dort
// einzeln und unmittelbar vor dem Request seinen Token.
import type { ResolvedConfig } from "../config/resolve.js";
import { renderTransportFailure } from "../errors/render.js";
import { callEndpoint } from "../http/client.js";
import { tenantKey } from "../http/auth.js";
import { buildPath } from "../mapping/path.js";
import {
  getRateLimiter,
  SLOW_WAIT_MS,
  systemClock,
  type BucketName,
  type RateLimiter,
  type RateLimiterClock,
} from "../http/rate-limiter.js";
import { ApiResponseError, isTransportError } from "../http/transport-error.js";
import { logWarn } from "../logging/stderr.js";
import type { Projection } from "../mapping/response.js";
import type {
  BundleContext,
  BundleEntry,
  BundleGap,
  BundleOutcome,
  BundleStep,
  BundleStopReason,
  StepCall,
  StepResult,
} from "./types.js";

/**
 * Fehlercodes, nach denen im selben Bündelaufruf nichts mehr besser wird: 3 und 4 sind
 * Zugangsdaten und Mandant, 11 der inaktive Mandant. Weitere Aufrufe gegen dieselbe
 * abgelehnte Anmeldung verbrennen nur Minutenkontingent, deshalb endet der Lauf sofort.
 */
const FATAL_ERROR_CODES: readonly number[] = Object.freeze([3, 4, 11]);

/** Ab zwei aufeinanderfolgenden 5xx desselben Endpunkts endet der Lauf sofort. */
const CONSECUTIVE_SERVER_ERRORS_UNTIL_STOP = 2;

/**
 * Der Teiler der Aufrufobergrenze: Ein Bündelaufruf darf höchstens ein Drittel des
 * Minutenbudgets verbrauchen, damit daneben noch Einzelaufrufe möglich bleiben.
 */
const RATE_LIMIT_DIVISOR = 3;

/**
 * Die wirksame Aufrufobergrenze: `min(deklarierte Obergrenze, floor(BB_MCP_RATE_LIMIT / 3))`.
 *
 * Bei der Vorgabe 60 sind das 20, die Grenze bindet also nie; bei `BB_MCP_RATE_LIMIT=10` sind
 * es 3, und das Bündel meldet es über `api_calls_limit`, `stopped_because` und `continuation`.
 * Ein Bündel, das die Einstellung des Betreibers ignoriert, wäre ein Entwurfsfehler.
 */
export function effectiveMaxCalls(declared: number, ratePerMinute: number): number {
  return Math.max(1, Math.min(declared, Math.floor(ratePerMinute / RATE_LIMIT_DIVISOR)));
}

/** Eine Zeile der Schrittliste. */
interface StepRecord {
  no: number;
  endpoint: string;
  state: "ok" | "failed" | "skipped";
  rows: number | null;
  duration_ms: number;
  error?: string;
}

export interface BundleRunnerOptions {
  readonly entry: BundleEntry;
  readonly config: ResolvedConfig;
  readonly signal: AbortSignal;
  readonly projection: Projection;
  /** Die geprüften Argumente; sie gehen in die Fehlermeldung eines gescheiterten Schrittes. */
  readonly args: Readonly<Record<string, unknown>>;
  readonly limiter?: RateLimiter;
  /** Monotone Uhr für die Schrittdauer. */
  readonly now?: () => number;
  /**
   * Uhr und Warten für {@link BundleRunner.sleep}. Im Betrieb die echte, im Test eine
   * gesteuerte: Eine Warteschleife, die im Test wirklich zwei Minuten schliefe,
   * wäre nicht prüfbar.
   */
  readonly clock?: RateLimiterClock;
}

/**
 * Der Lauf eines Bündels. Eine Instanz je Aufruf; sie ist der {@link BundleContext}, den der
 * Ablauf sieht.
 */
export class BundleRunner implements BundleContext {
  readonly entry: BundleEntry;
  readonly maxCalls: number;
  readonly projection: Projection;
  readonly maxResponseTokens: number;

  private readonly config: ResolvedConfig;
  private readonly signal: AbortSignal;
  private readonly args: Readonly<Record<string, unknown>>;
  private readonly limiter: RateLimiter;
  private readonly now: () => number;
  private readonly clock: RateLimiterClock;
  /** Der gehashte `api_key`; derselbe Schlüssel wie im Token-Eimer. */
  readonly tenant: string;

  private readonly steps: StepRecord[] = [];
  private readonly gaps: BundleGap[] = [];
  private calls = 0;
  private successes = 0;
  private complete = true;
  private stoppedBecause: BundleStopReason | null = null;
  private continuation: Record<string, unknown> | null = null;
  private firstFailure: (StepResult & { ok: false }) | null = null;
  private written = "";
  private nextStepOverride: string | null = null;
  private slowWaitReported = false;
  private lastServerErrorPath = "";
  private consecutiveServerErrors = 0;

  constructor(options: BundleRunnerOptions) {
    this.entry = options.entry;
    this.config = options.config;
    this.signal = options.signal;
    this.projection = options.projection;
    this.args = options.args;
    this.limiter = options.limiter ?? getRateLimiter();
    this.now = options.now ?? ((): number => performance.now());
    this.clock = options.clock ?? systemClock;
    this.maxResponseTokens = options.config.maxResponseTokens;
    this.maxCalls = effectiveMaxCalls(options.entry.maxCalls, options.config.rateLimitPerMinute);
    this.tenant = tenantKey(options.config.credentials?.apiKey ?? "");
  }

  callsUsed(): number {
    return this.calls;
  }

  isComplete(): boolean {
    return this.complete;
  }

  /** Zahl der erfolgreichen Teilaufrufe. Null heißt: Es gibt nichts zu berichten. */
  successCount(): number {
    return this.successes;
  }

  gap(gap: BundleGap): void {
    this.gaps.push(gap);
    this.complete = false;
  }

  stop(reason: BundleStopReason): void {
    this.complete = false;
    this.stoppedBecause ??= reason;
  }

  continueWith(continuation: Record<string, unknown>): void {
    this.continuation = continuation;
  }

  /**
   * Hält fest, was dieser Lauf im Mandanten verändert hat.
   *
   * Der Text erscheint in `bundle.written` und damit in JEDER Antwort dieses Laufs, auch im
   * Erfolgsfall. Die vier lesenden Bündel rufen das nie auf; leer heißt dort nachweislich
   * „nichts geschrieben".
   */
  wrote(text: string): void {
    this.written = text;
  }

  /**
   * Wartet. Bricht der Client ab, endet das Warten mit einer Ablehnung der Uhr.
   *
   * Die Uhr kommt aus den Optionen, damit ein Test eine Warteschleife prüfen kann, ohne
   * wirklich zu warten.
   */
  async sleep(ms: number): Promise<void> {
    await this.clock.sleep(ms, this.signal);
  }

  /** Ersetzt den Block `[Wie]` der Fehlermeldung, falls dieser Lauf als Fehler endet. */
  explainNextStep(text: string): void {
    this.nextStepOverride = text;
  }

  /**
   * Der Eimerstand, ohne zu entnehmen. Für die Vorabprüfung gegen `minTokens`: Liegen nicht
   * genug Token ohne Warten bereit, sagt das Bündel vor dem ersten Request ab.
   */
  peek(bucket: BucketName = "default"): { readonly available: number; readonly waitMs: number } {
    return this.limiter.peek(this.tenant, bucket);
  }

  private stepFor(id: string): BundleStep {
    const step = this.entry.steps.find((candidate) => candidate.id === id);
    if (step === undefined) {
      // Ein Ablauf, der einen Schritt anfordert, den sein Eintrag nicht führt, ist ein
      // Verdrahtungsfehler. Er soll laut scheitern und nicht still einen anderen Pfad nehmen.
      throw new Error(`${this.entry.name} kennt keinen Schritt ${id}.`);
    }
    return step;
  }

  private record(record: StepRecord): void {
    this.steps.push(record);
  }

  private failure(
    kind: "budget" | "rate_limit" | "error",
    fatal: boolean,
    text: string,
    summary: string,
    errorCode: number | null,
  ): StepResult & { ok: false } {
    const result = { ok: false as const, kind, fatal, text, summary, errorCode };
    this.firstFailure ??= result;
    return result;
  }

  async call(request: StepCall): Promise<StepResult> {
    const step = this.stepFor(request.step);
    const built = buildPath(
      { name: this.entry.name, path: step.path },
      request.pathValue === undefined ? {} : { [pathParamOf(step)]: request.pathValue },
    );
    const no = this.steps.length + 1;

    // Die Obergrenze steht im Register und nicht in der Dokumentation: Ein Bündel ohne sie
    // ist eine Blackbox, die still das Minutenkontingent leert.
    if (this.calls >= this.maxCalls) {
      this.stop("page_limit");
      this.record({
        no,
        endpoint: built.specPath,
        state: "skipped",
        rows: null,
        duration_ms: 0,
        error: `Aufrufobergrenze ${String(this.maxCalls)} erreicht.`,
      });
      return this.failure(
        "budget",
        false,
        "",
        `Die Aufrufobergrenze dieses Bündels ist erreicht (${String(this.calls)} von ` +
          `${String(this.maxCalls)} Aufrufen).`,
        null,
      );
    }

    // Abbruch statt Warten, und nur vor einem ZUSÄTZLICHEN Aufruf: Eine wahrheitsgemäße
    // Teilantwort nach zwei Sekunden ist mehr wert als eine vollständige nach vierzig.
    if (request.additional === true) {
      const seen = this.limiter.peek(this.tenant, step.bucket);
      if (seen.waitMs > SLOW_WAIT_MS) {
        this.stop("rate_limit");
        this.record({
          no,
          endpoint: built.specPath,
          state: "skipped",
          rows: null,
          duration_ms: 0,
          error: `Wartezeit auf das Minutenkontingent rund ${formatSeconds(seen.waitMs)}.`,
        });
        if (!this.slowWaitReported) {
          this.slowWaitReported = true;
          logWarn(
            `${this.entry.name} bricht ab, statt rund ${formatSeconds(seen.waitMs)} auf das ` +
              `Minutenkontingent des Mandanten zu warten (Eimer ${step.bucket}).`,
          );
        }
        return this.failure(
          "rate_limit",
          false,
          "",
          `Der nächste Aufruf hätte rund ${formatSeconds(seen.waitMs)} auf das ` +
            "Minutenkontingent des Mandanten gewartet. Abgebrochen statt gewartet.",
          null,
        );
      }
    }

    const startedAt = this.now();
    this.calls += 1;
    try {
      const result = await callEndpoint(
        {
          toolName: this.entry.name,
          toolClass: step.toolClass,
          specPath: built.specPath,
          requestPath: built.requestPath,
          shape: step.shape,
          bucket: step.bucket,
          timeoutTier: step.timeoutTier,
          body: request.body ?? {},
        },
        { signal: this.signal, config: this.config, limiter: this.limiter },
      );
      this.successes += 1;
      this.consecutiveServerErrors = 0;
      this.lastServerErrorPath = "";
      const rows = result.envelope.shape === "list" ? result.envelope.data.length : null;
      this.record({
        no,
        endpoint: built.specPath,
        state: "ok",
        rows,
        duration_ms: Math.round(this.now() - startedAt),
      });
      return { ok: true, envelope: result.envelope, rows: rows ?? 0 };
    } catch (error) {
      return await this.handleFailure(
        error,
        step,
        built.specPath,
        no,
        startedAt,
        request.tolerate ?? [],
      );
    }
  }

  private async handleFailure(
    error: unknown,
    step: BundleStep,
    specPath: string,
    no: number,
    startedAt: number,
    tolerate: readonly number[],
  ): Promise<StepResult> {
    const durationMs = Math.round(this.now() - startedAt);

    if (!isTransportError(error)) {
      const detail = error instanceof Error ? error.message : String(error);
      this.record({
        no,
        endpoint: specPath,
        state: "failed",
        rows: null,
        duration_ms: durationMs,
        error: detail,
      });
      return this.failure("error", true, detail, detail, null);
    }

    // Der vollständige Vierblocktext des bestehenden Renderers: Ein Bündel darf keine
    // schlechtere Fehlermeldung liefern als das Einzelwerkzeug, das es ersetzt.
    const message = await renderTransportFailure(error, { args: this.args });
    const errorCode = error instanceof ApiResponseError ? error.errorCode : null;
    const status = error instanceof ApiResponseError ? error.status : 0;

    // Ein geduldeter `error_code` ist ein Zustand und kein Fehlschlag: Er beendet den Lauf
    // nicht, setzt `stopped_because` nicht und gilt nicht als erster Fehlschlag. Der Schritt
    // steht trotzdem in der Liste, damit die Warteschleife nachvollziehbar bleibt.
    if (errorCode !== null && tolerate.includes(errorCode)) {
      this.consecutiveServerErrors = 0;
      this.lastServerErrorPath = "";
      this.record({
        no,
        endpoint: specPath,
        state: "ok",
        rows: null,
        duration_ms: durationMs,
        error: `error_code ${String(errorCode)}: ${firstLineOf(message.text)}`,
      });
      return {
        ok: false,
        kind: "error",
        fatal: false,
        text: message.text,
        summary: firstLineOf(message.text),
        errorCode,
      };
    }

    if (status >= 500 && status <= 599) {
      this.consecutiveServerErrors =
        this.lastServerErrorPath === specPath ? this.consecutiveServerErrors + 1 : 1;
      this.lastServerErrorPath = specPath;
    } else {
      this.consecutiveServerErrors = 0;
      this.lastServerErrorPath = "";
    }

    const fatal =
      (errorCode !== null && FATAL_ERROR_CODES.includes(errorCode)) ||
      this.consecutiveServerErrors >= CONSECUTIVE_SERVER_ERRORS_UNTIL_STOP ||
      error.code === "rate-limit-give-up";

    this.record({
      no,
      endpoint: specPath,
      state: "failed",
      rows: null,
      duration_ms: durationMs,
      error: message.text,
    });

    if (error.code === "rate-limit-give-up") {
      // Feuert die Aufgabegrenze doch mitten im Bündel, gilt der Teilfehlerfall: Erfolg mit
      // dem Gesammelten, `complete` false, Lücke mit der Ursache.
      this.stop("rate_limit");
      return this.failure(
        "rate_limit",
        true,
        message.text,
        `${step.fallbackTool}: Das Minutenkontingent des Mandanten ist erschöpft; der Aufruf ` +
          "hat aufgegeben, statt stumm zu warten.",
        errorCode,
      );
    }

    this.stop("error");
    return this.failure("error", fatal, message.text, firstLineOf(message.text), errorCode);
  }

  errorOutcome(failure: StepResult & { ok: false }): BundleOutcome {
    const base = failure.text === "" ? failure.summary : failure.text;
    if (this.nextStepOverride === null) {
      return { kind: "error", text: base };
    }
    // Ersetzt wird ausschließlich die Handlungsanweisung. Der Vierblockaufbau bleibt
    // erhalten, insbesondere der Zustandssatz: Ob etwas hinausgegangen ist, entscheidet die
    // Fehlerschicht und nicht das Bündel. Dasselbe Muster benutzt `register-tools.ts` für den
    // Der Sondertext bei offenem Ausgang.
    return {
      kind: "error",
      text: base.replace(/^\[Wie\] .*$/m, `[Wie] ${this.nextStepOverride}`),
    };
  }

  /** Der Block `bundle`, wie er in `structuredContent` steht. */
  bundleBlock(): Record<string, unknown> {
    return {
      complete: this.complete,
      stopped_because: this.stoppedBecause,
      steps: this.steps.map((step) => ({ ...step })),
      api_calls: this.calls,
      api_calls_limit: this.maxCalls,
      gaps: this.gaps.map((gap) => ({ ...gap })),
      // Leer heißt: Es wurde nichts geschrieben. Die vier lesenden Bündel füllen es nie;
      // `bb_reports_run` setzt den Satz über `wrote`, sobald das `create` gewirkt hat.
      written: this.written,
      continuation: this.continuation,
    };
  }

  /** Die Lücken als Zeilen für den Textblock, in der Reihenfolge ihres Entstehens. */
  gapLines(): readonly string[] {
    return this.gaps.map(
      (gap) => `Lücke: ${gap.what} Grund: ${gap.why} Nächster Schritt: ${gap.next_step}`,
    );
  }

  /**
   * Die ERSTE Zeile des Textblocks bei `complete` = false (R6). Nicht als Fußnote und nicht am
   * Ende: Ein Hinweis hinter einer Tabelle mit 50 Zeilen ist praktisch nicht vorhanden.
   */
  incompleteLine(detail?: string): string {
    if (this.complete) {
      return "";
    }
    const reason = this.stoppedBecause ?? "error";
    const head =
      detail === undefined || detail === ""
        ? `Unvollständig: abgebrochen nach ${String(this.calls)} Aufrufen`
        : `Unvollständig: ${detail}`;
    return `${head}, Grund ${reason}.`;
  }

  /** Die Zahl der Aufrufe als Satz für den Bestandsteil. */
  callBudgetLine(): string {
    return (
      `Aufrufe an die API: ${String(this.calls)} von höchstens ${String(this.maxCalls)} für ` +
      "dieses Bündel. Der Eimer ist prozesslokal; zwei Clients auf demselben Mandanten teilen " +
      "ihn nicht."
    );
  }

  /**
   * Der erste Fehlschlag dieses Laufs. `registerBundleTools` beantwortet damit einen Lauf
   * ohne einen einzigen erfolgreichen Schritt als Fehler statt als leeres Ergebnis.
   */
  firstFailureOrNull(): (StepResult & { ok: false }) | null {
    return this.firstFailure;
  }
}

/** Der Name des Pfadparameters eines Schrittes mit Vorlage. */
function pathParamOf(step: BundleStep): string {
  return "template" in step.path ? (step.path.params[0] ?? "") : "";
}

/** Eine Wartezeit als deutscher Halbsatz, auf ganze Sekunden gerundet. */
export function formatSeconds(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${String(seconds)} Sekunde${seconds === 1 ? "" : "n"}`;
}

/** Die erste Zeile eines mehrzeiligen Textes, für eine knappe Lückenbegründung. */
function firstLineOf(text: string): string {
  const line = text.split("\n").find((candidate) => candidate.trim() !== "");
  return (line ?? text).replace(/^\[Was\]\s*/, "");
}
