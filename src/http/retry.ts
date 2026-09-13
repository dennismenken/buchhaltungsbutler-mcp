/**
 * Die Retry-Politik, getrennt nach Wirkung.
 *
 * Die wichtigste Sicherheitsregel der HTTP-Schicht: **Ein schreibender Aufruf wird niemals
 * wiederholt.** Die API kennt keinen Idempotenzschlüssel. Wer trotzdem pauschal jeden Aufruf
 * wiederholt, erzeugt Doppelbuchungen: Der erste Versuch kann angekommen sein, auch wenn
 * seine Antwort verloren ging. Auch ein Netzwerkfehler **vor** dem Absenden wird nicht
 * wiederholt, weil `fetch` nicht zuverlässig unterscheidet, ob der Server die Anfrage schon
 * gesehen hat.
 *
 * **Bauartbedingt, nicht durch Disziplin:** {@link runAttempts} schaltet den Wiederholzweig
 * ausschließlich für `toolClass === "R"` frei. Bei jeder anderen Klasse gibt es im
 * Ablaufpfad keine Schleife, keine Weiche und keine Wartezeit — ein später nachgerüsteter
 * schreibender Endpunkt bekommt damit nicht versehentlich Retry, und es gibt keine
 * Umgebungsvariable, die das aufhebt.
 *
 * Dieses Modul liegt aus genau diesem Grund **neben** `client.ts` und nicht darin: Der Client
 * führt einen Versuch aus, die Entscheidung über einen zweiten fällt hier.
 */

import { logDebug } from "../logging/stderr.js";
import { READ_ONLY_TOOL_CLASS } from "../registry/classes.js";
import type { ToolClass } from "../registry/types.js";
import { isTransportError, type TransportError } from "./transport-error.js";

/** Höchstzahl der Versuche bei einem lesenden Werkzeug, den ersten eingeschlossen. */
export const MAX_READ_ATTEMPTS = 3;

/** Grundwartezeit der Verdopplungsfolge. */
export const BASE_DELAY_MS = 1_000;

/** Obergrenze der Wartezeit vor dem Jitter. */
export const MAX_DELAY_MS = 20_000;

/** Der `error_code`, der an zehn schreibenden Pfaden mit HTTP 403 Drosselung bedeutet. */
export const THROTTLE_ERROR_CODE = 15;

/**
 * Die Zahl der Versuche, die eine Werkzeugklasse erlaubt.
 *
 * Genau eine Klasse darf wiederholen. Die Funktion ist die einzige Stelle, an der das
 * entschieden wird; `registry/classes.ts` liefert den Klassennamen als Datum.
 */
export function maxAttemptsFor(toolClass: ToolClass): number {
  return toolClass === READ_ONLY_TOOL_CLASS ? MAX_READ_ATTEMPTS : 1;
}

/**
 * Die Wartezeit nach `failedAttempts` gescheiterten Versuchen.
 *
 * `delay = min(1000 ms × 2^(n-1), 20 s)`, tatsächliche Wartezeit `delay × (0,5 + random())`,
 * also Jitter im Bereich `[0,5; 1,5]` um den **vollen** Wert. Ausdrücklich
 * **nicht** `delay × random()`: Das wartet im Mittel nur die Hälfte und kommt zu früh wieder.
 * „Full jitter" im AWS-Sinn löst ein Herdenproblem, das ein stdio-Server mit wenigen
 * gleichzeitigen Aufrufen nicht hat; sein Problem ist das umgekehrte.
 */
export function backoffDelayMs(failedAttempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, failedAttempts - 1);
  const base = Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
  return Math.round(base * (0.5 + random()));
}

/** Die Tatsachen, an denen die Wiederholung hängt. Ein Meldungstext ist nicht darunter. */
export interface RetryFacts {
  /**
   * Der unveränderte Spezifikationspfad. Er gehört zum Tripel und wird mitgeführt,
   * damit eine Entscheidung nachvollziehbar ist. Eine Weiche hängt heute **nicht** an ihm:
   * Die Regel „`error_code` 15 nur mit HTTP 403" gilt an allen Pfaden gleich, und eine
   * zusätzliche Pfadliste wäre eine zweite Stelle, die zu pflegen ist.
   */
  readonly specPath: string;
  /** HTTP-Status, oder `null`, wenn keine Antwort zustande kam. */
  readonly status: number | null;
  /** `error_code` der Antwort, oder `null`. */
  readonly errorCode: number | null;
  /** Wie der Versuch gescheitert ist. */
  readonly kind: "timeout" | "network" | "response" | "cancelled" | "local";
}

/**
 * Die Weiche, ausschließlich über das Tripel (`specPath`, `error_code`, HTTP-Status)
 * beziehungsweise über die Art des Scheiterns.
 *
 * **Kein Zeichenkettenvergleich gegen einen Meldungstext.** Das ist gemessen begründet (L6):
 * `/receipts/get` liefert zu Code 15 live `invalid field specified` und damit weder den Text
 * der `description` noch den des `message`-Enums. Eine Weiche auf einen dieser Texte wäre ein
 * stiller Fehlschlag in Wartestellung — sie griffe einfach nie.
 */
export function isRetryableRead(facts: RetryFacts): boolean {
  switch (facts.kind) {
    case "cancelled":
      // Der Client hat abgebrochen. Ein weiterer Versuch wäre Arbeit gegen den Willen des
      // Aufrufers.
      return false;
    case "local":
      // Fehlende Zugangsdaten, ein aufgegebener Wartevorgang, ein unbaubarer Pfad: Nichts
      // davon wird durch Wiederholen besser.
      return false;
    case "timeout":
    case "network":
      // Zeitlimit und Netzwerkabbruch gehören für die Gegenrichtung (schreibend)
      // zusammen. Für ein lesendes Werkzeug ist beides
      // folgenlos wiederholbar.
      return true;
    case "response":
      break;
  }

  const { status, errorCode } = facts;
  if (status === null) {
    return false;
  }
  // HTTP 5xx, also auch 504 mit error_code 30 und 500 mit error_code 0.
  if (status >= 500) {
    return true;
  }
  // In der Spezifikation kommt 429 nicht vor; defensiv berücksichtigt, weil das Verhalten
  // beim Reißen des Minutenlimits nicht verifiziert ist (`grundlagen.md` 3.3).
  if (status === 429) {
    return true;
  }
  // Code 15 heißt an zehn schreibenden Pfaden mit HTTP 403 Drosselung, an `/receipts/get`
  // mit HTTP 400 dagegen „falsches Sortierfeld". Die Klausel ist im Auslieferungszustand
  // rein defensiv, weil kein lesender Pfad 403/15 führt; sie bleibt stehen, damit ein später
  // nachgerüsteter lesender Endpunkt nicht stillschweigend in eine falsche Wiederholung läuft.
  if (status === 403 && errorCode === THROTTLE_ERROR_CODE) {
    return true;
  }
  // Nie wiederholt: 400, 401, 403 mit Code 11 oder 12, 422 und jeder andere 4xx.
  return false;
}

/** Leitet die {@link RetryFacts} aus einem Fehler der HTTP-Schicht ab. */
export function factsFromError(error: unknown): RetryFacts | null {
  if (!isTransportError(error)) {
    return null;
  }
  return {
    specPath: error.specPath,
    status: error.status,
    errorCode: error.errorCode,
    kind: kindOf(error),
  };
}

function kindOf(error: TransportError): RetryFacts["kind"] {
  switch (error.code) {
    case "timeout":
      return "timeout";
    case "network":
      return "network";
    case "cancelled":
      return "cancelled";
    case "invalid-request":
    case "rate-limit-give-up":
      return "local";
    case "api-response":
    case "non-json-response":
    case "malformed-json":
    case "envelope-contract":
      return "response";
  }
}

/** Uhr und Zufall des Retry-Zweiges. Im Test werden beide ersetzt. */
export interface RetryRuntime {
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  random(): number;
}

export const systemRetryRuntime: RetryRuntime = {
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
  random: () => Math.random(),
};

export interface RetryInfo {
  /** Der Versuch, der gerade gescheitert ist, 1-basiert. */
  readonly failedAttempt: number;
  readonly delayMs: number;
  readonly error: TransportError;
}

export interface RunAttemptsOptions<T> {
  readonly toolClass: ToolClass;
  /**
   * Ein einzelner Versuch. Die Nummer ist 1-basiert und gehört in den Fehlerkontext, damit
   * eine Meldung sagen kann, wie oft es versucht wurde.
   *
   * **Jeder Versuch entnimmt seinen eigenen Token aus dem Rate-Limiter.** Das geschieht
   * innerhalb dieser Funktion, also innerhalb der Schleife und nicht davor.
   */
  readonly attempt: (attemptNumber: number) => Promise<T>;
  readonly signal?: AbortSignal;
  readonly runtime?: RetryRuntime;
  readonly onRetry?: (info: RetryInfo) => void;
}

/**
 * Führt den Aufruf aus und wiederholt ihn **nur** bei `toolClass === "R"`.
 *
 * Bei jeder anderen Klasse wird der Versuch einmal ausgeführt und sein Fehler unverändert
 * weitergegeben; es gibt für diesen Fall keinen zweiten Codepfad, den jemand versehentlich
 * erweitern könnte.
 */
export async function runAttempts<T>(options: RunAttemptsOptions<T>): Promise<T> {
  const maxAttempts = maxAttemptsFor(options.toolClass);

  if (maxAttempts === 1) {
    // Schreibend: genau ein Versuch. Keine Schleife, keine Weiche, keine Wartezeit.
    return await options.attempt(1);
  }

  const runtime = options.runtime ?? systemRetryRuntime;
  for (let attemptNumber = 1; ; attemptNumber++) {
    try {
      return await options.attempt(attemptNumber);
    } catch (error) {
      const facts = factsFromError(error);
      if (attemptNumber >= maxAttempts || facts === null || !isRetryableRead(facts)) {
        throw error;
      }
      const delayMs = backoffDelayMs(attemptNumber, () => runtime.random());
      const info: RetryInfo = {
        failedAttempt: attemptNumber,
        delayMs,
        error: error as TransportError,
      };
      logDebug(
        `${info.error.toolName}: Versuch ${attemptNumber} von ${maxAttempts} scheiterte ` +
          `(${info.error.code}, HTTP ${facts.status ?? "-"}, error_code ${facts.errorCode ?? "-"}, ` +
          `${facts.specPath}); nächster Versuch in ${delayMs} ms.`,
      );
      options.onRetry?.(info);
      await runtime.sleep(delayMs, options.signal);
    }
  }
}
