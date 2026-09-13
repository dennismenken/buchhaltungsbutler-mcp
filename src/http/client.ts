/**
 * Der **eine** `fetch`-Aufrufer des Projekts. Alles andere spricht nur mit ihm.
 *
 * | Aspekt | Festlegung |
 * | --- | --- |
 * | Methode | ausschließlich `POST`, bei allen 54 Endpunkten (maschinell bestätigt) |
 * | Authentifizierung | `Authorization: Basic …` über `Buffer.from` (`auth.ts`) |
 * | Header | `Content-Type: application/json`, `Accept: application/json`, `User-Agent` |
 * | Body | immer JSON, niemals formularkodiert — das erhält Booleans, `null` in Arrays und das `order`-Objekt |
 * | `api_key` | hier in den Body gesetzt, nicht vom Register: genau ein Ort, an dem das Geheimnis den Body berührt |
 * | Zeitlimit | nach der Stufe des Registereintrags, verknüpft mit dem Abbruchsignal des Clients |
 * | Umleitungen | `redirect: "error"` — die API leitet nicht um; eine Umleitung ist ein Anzeichen für einen falschen Host |
 * | Cookies | kein Jar (`dispatcher.ts`) |
 *
 * Die Reihenfolge innerhalb eines Versuchs ist verbindlich: erst
 * Token aus dem Rate-Limiter, dann der Request, dann die Content-Type-Prüfung, dann die
 * Zerlegung. Die Entscheidung über einen **zweiten** Versuch liegt nicht hier, sondern in
 * `retry.ts`, und sie ist an `toolClass === "R"` gebunden.
 */

import { getConfig, type ResolvedConfig } from "../config/resolve.js";
import { redact } from "../config/redact.js";
import { VERSION } from "../generated/version.js";
import { logDebug } from "../logging/stderr.js";
import type { ToolClass, ToolEntry } from "../registry/types.js";
import { AUTHORIZATION_HEADER, basicAuthHeader, checkBasicCredentials, tenantKey } from "./auth.js";
import { parseEnvelope, type EnvelopeShape, type SuccessEnvelope } from "./envelope.js";
import {
  getRateLimiter,
  systemClock,
  type BucketName,
  type RateLimiter,
  type RateLimiterClock,
} from "./rate-limiter.js";
import { runAttempts, type RetryRuntime } from "./retry.js";
import {
  CancelledError,
  InvalidRequestError,
  NetworkError,
  TimeoutError,
  type TransportErrorContext,
} from "./transport-error.js";

/** Die drei Zeitlimitstufen aus dem Registereintrag. */
export type TimeoutTier = ToolEntry["timeoutTier"];

/**
 * Die Faktoren, mit denen die Stufen aus `BB_MCP_TIMEOUT_MS` hervorgehen.
 * Bei der Vorgabe 30000 ergibt das 15 s, 30 s und 120 s.
 */
export const TIMEOUT_FACTORS: Record<TimeoutTier, number> = {
  short: 0.5,
  normal: 1,
  long: 4,
};

/** Das Zeitlimit einer Stufe. */
export function timeoutForTier(tier: TimeoutTier, normalMs: number): number {
  return Math.round(normalMs * TIMEOUT_FACTORS[tier]);
}

/** Der `User-Agent`. Er macht diesen Server in den Protokollen des Anbieters erkennbar. */
export const USER_AGENT = `buchhaltungsbutler-mcp/${VERSION}`;

/** Das Feld, das den Mandanten wählt. Es kommt ausschließlich aus der Konfiguration. */
const API_KEY_FIELD = "api_key";

/**
 * Ein aufzurufender Endpunkt. Der Request-Mapper füllt die Struktur aus dem
 * Registereintrag und den geprüften Argumenten.
 *
 * `specPath` und `requestPath` sind getrennt und werden nie gegeneinander getauscht:
 * Gesendet wird der gebaute Pfad, nachgeschlagen und protokolliert wird der
 * Spezifikationspfad. Bei den 50 Endpunkten ohne Vorlage sind beide gleich.
 */
export interface EndpointCall {
  readonly toolName: string;
  readonly toolClass: ToolClass;
  /** Der unveränderte Spezifikationspfad, zum Beispiel `/receipts/get/id_by_customer`. */
  readonly specPath: string;
  /** Der tatsächlich gesendete Pfad, zum Beispiel `/receipts/get/4711`. */
  readonly requestPath: string;
  readonly shape: EnvelopeShape;
  readonly bucket: BucketName;
  readonly timeoutTier: TimeoutTier;
  /** Der Body **ohne** `api_key`. */
  readonly body: Readonly<Record<string, unknown>>;
}

export interface HttpCallOptions {
  /** Das Abbruchsignal des Clients (`extra.signal`), unverändert durchgereicht. */
  readonly signal?: AbortSignal;
  /** Abweichende Konfiguration. Im Betrieb immer die eingefrorene aus `config/resolve.ts`. */
  readonly config?: ResolvedConfig;
  /** Abweichender Rate-Limiter. Im Betrieb der prozessweite. */
  readonly limiter?: RateLimiter;
  /** Uhr und Zufall des Retry-Zweiges. Im Betrieb die echten (Einspeisung für Tests). */
  readonly retryRuntime?: RetryRuntime;
  /** Uhr für die Zeitmessung der Antwortdauer. Im Betrieb die echte. */
  readonly clock?: Pick<RateLimiterClock, "now">;
}

export interface HttpCallResult {
  readonly envelope: SuccessEnvelope;
  /** Zahl der unternommenen Versuche. Bei schreibenden Werkzeugen bauartbedingt immer 1. */
  readonly attempts: number;
  /** Dauer über alle Versuche einschließlich Wartezeit auf Token. */
  readonly durationMs: number;
  /** Davon Wartezeit im Rate-Limiter. */
  readonly waitedMs: number;
}

/**
 * Prüft den gebauten Pfad, bevor daraus eine URL wird.
 *
 * Der Pfad entsteht bei vier Endpunkten aus einer Vorlage mit einer Geschäftskennung.
 * `mapping/path.ts` prüft den eingesetzten Wert und kodiert ihn; diese Prüfung hier
 * ist die zweite Verteidigungslinie am Ort des Absendens und fängt jeden Weg ab, der später
 * einmal an `mapping/path.ts` vorbeiführt.
 *
 * @returns Leere Zeichenkette, wenn der Pfad brauchbar ist, sonst der Grund.
 */
export function checkRequestPath(requestPath: string): string {
  if (!requestPath.startsWith("/")) {
    return "er beginnt nicht mit einem Schrägstrich";
  }
  if (requestPath.includes("?") || requestPath.includes("#")) {
    return "er enthält eine Abfrage oder ein Fragment";
  }
  if (requestPath.includes("\\")) {
    return "er enthält einen umgekehrten Schrägstrich";
  }
  if (requestPath.includes("//")) {
    return "er enthält ein leeres Segment";
  }
  if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) {
    return "er enthält ein Punktsegment";
  }
  if (/[\s]/.test(requestPath)) {
    return "er enthält Leerraum";
  }
  return "";
}

/** Setzt Basis-URL und Pfad zusammen und stellt sicher, dass der Pfad die Basis nicht verlässt. */
export function buildRequestUrl(baseUrl: string, requestPath: string): URL {
  const base = new URL(baseUrl);
  const url = new URL(`${baseUrl}${requestPath}`);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error(`Der gebaute Pfad ${requestPath} verlässt die Basis-URL.`);
  }
  return url;
}

/**
 * `true`, wenn das Signal ausgelöst ist.
 *
 * Absichtlich eine Funktion und keine Bedingung auf `options.signal?.aborted`: Der Wert
 * ändert sich **während** eines `await`. Die Typverengung von TypeScript weiß das nicht und
 * hält eine zweite Prüfung nach dem Warten für unerfüllbar — sie wäre ein Übersetzungsfehler,
 * und genau diese Prüfung ist die wichtige.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Die Kurzbeschreibung einer gescheiterten Verbindung, ohne Stacktrace und geschwärzt. */
function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unbekannte Ursache";
  }
  const cause = (error as { cause?: unknown }).cause;
  const causeParts: string[] = [];
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string") {
      causeParts.push(code);
    }
    causeParts.push(cause.message);
  } else if (typeof cause === "string") {
    causeParts.push(cause);
  }
  const detail = [error.message, ...causeParts].filter((part) => part !== "").join(" — ");
  return redact(detail === "" ? error.name : detail);
}

interface AttemptInput {
  readonly call: EndpointCall;
  readonly context: TransportErrorContext;
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly payload: string;
  readonly timeoutMs: number;
  readonly clientSignal: AbortSignal | undefined;
}

/**
 * Ein einzelner Versuch: genau ein `fetch`, genau eine Antwortprüfung.
 *
 * Die Funktion ist absichtlich nicht exportiert. Wer sie von außen aufrufen könnte, könnte
 * den Retry-Zweig aus `retry.ts` umgehen — und damit die Regel, dass schreibende Aufrufe
 * nicht wiederholt werden.
 */
async function performRequest(input: AttemptInput): Promise<SuccessEnvelope> {
  const { context, url, headers, payload, timeoutMs, clientSignal } = input;

  // AbortSignal.timeout setzt einen nicht referenzierten Zeitgeber; ein abgeschlossener
  // Aufruf hält den Prozess damit nicht offen. AbortSignal.any verknüpft das Zeitlimit mit
  // dem Abbruchsignal des Clients (mcp-sdk-typescript.md 10.4 Punkt 8).
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    clientSignal === undefined ? timeoutSignal : AbortSignal.any([timeoutSignal, clientSignal]);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { ...headers },
      body: payload,
      signal,
      // Die API leitet nicht um. Eine Umleitung bedeutet einen falschen Host oder einen
      // Zwischenknoten, der sich einmischt; ihr zu folgen würde die Zugangsdaten dorthin
      // mitnehmen.
      redirect: "error",
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new TimeoutError(context, timeoutMs);
    }
    if (isAborted(clientSignal)) {
      throw new CancelledError(context, "in-flight");
    }
    throw new NetworkError(context, describeFetchFailure(error));
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new TimeoutError(context, timeoutMs);
    }
    if (isAborted(clientSignal)) {
      throw new CancelledError(context, "in-flight");
    }
    throw new NetworkError(context, describeFetchFailure(error));
  }

  // Die vier Stufen der Umschlagprüfung. Der Content-Type wird **vor** dem Parsen geprüft.
  return parseEnvelope({
    status: response.status,
    contentType: response.headers.get("content-type"),
    bodyText,
    shape: input.call.shape,
    context,
  });
}

/**
 * Setzt den Aufruf ab. Der einzige Weg dieses Projekts ins Netz.
 *
 * @throws {InvalidRequestError} wenn der Aufruf so nicht absetzbar ist: fehlende
 *         Zugangsdaten, `api_key` in den Argumenten, unbrauchbarer Pfad. Es geht nichts hinaus.
 * @throws Jeden weiteren Fehlertyp aus `transport-error.ts`.
 */
export async function callEndpoint(
  call: EndpointCall,
  options: HttpCallOptions = {},
): Promise<HttpCallResult> {
  const config = options.config ?? getConfig();
  // Dieselbe monotone Uhr wie der Rate-Limiter: Gemessen werden Dauern, nicht Zeitpunkte.
  const clock = options.clock ?? systemClock;
  const baseContext: TransportErrorContext = {
    toolName: call.toolName,
    specPath: call.specPath,
    toolClass: call.toolClass,
  };

  // Der Aufruf darf diese Schicht nur erreichen, wenn Guard 1 ihn
  // durchgelassen hat. Die Prüfung steht trotzdem hier, weil das Versprechen „genau ein
  // Ort, an dem das Geheimnis den Body berührt" sonst von einem fremden Aufrufer abhängt.
  const credentials = config.credentials;
  if (credentials === null) {
    throw new InvalidRequestError(
      `${call.toolName} ist nicht ausführbar: Dieser Server hat keine Zugangsdaten für BuchhaltungsButler.`,
      baseContext,
      "missing-credentials",
    );
  }

  const credentialProblem = checkBasicCredentials(credentials.apiClient, credentials.apiSecret);
  if (credentialProblem !== "") {
    throw new InvalidRequestError(
      `${call.toolName} ist nicht ausführbar: ${credentialProblem}`,
      baseContext,
      "unusable-credentials",
    );
  }

  if (API_KEY_FIELD in call.body) {
    throw new InvalidRequestError(
      `${call.toolName} hat ein Feld ${API_KEY_FIELD} in den Argumenten. Der Mandantenschlüssel ` +
        "kommt ausschließlich aus der Konfiguration dieses Servers und niemals aus einem Aufruf.",
      baseContext,
      "api-key-in-arguments",
    );
  }

  const pathProblem = checkRequestPath(call.requestPath);
  if (pathProblem !== "") {
    throw new InvalidRequestError(
      `${call.toolName} hat keinen absetzbaren Pfad für ${call.specPath}: ${pathProblem}.`,
      baseContext,
      "invalid-path",
    );
  }

  let url: URL;
  try {
    url = buildRequestUrl(config.baseUrl, call.requestPath);
  } catch {
    throw new InvalidRequestError(
      `${call.toolName} hat keinen absetzbaren Pfad für ${call.specPath}: er verlässt die Basis-URL.`,
      baseContext,
      "invalid-path",
    );
  }

  const headers: Record<string, string> = {
    [AUTHORIZATION_HEADER]: basicAuthHeader(credentials.apiClient, credentials.apiSecret),
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": USER_AGENT,
  };

  // Der api_key steht bewusst hinter dem Body: Selbst wenn die Prüfung oben je entfiele,
  // könnte kein Argument den Mandanten umlenken.
  const payload = JSON.stringify({ ...call.body, [API_KEY_FIELD]: credentials.apiKey });
  const timeoutMs = timeoutForTier(call.timeoutTier, config.timeoutMs);
  const limiter = options.limiter ?? getRateLimiter();
  const tenant = tenantKey(credentials.apiKey);

  const startedAt = clock.now();
  let attempts = 0;
  let waitedMs = 0;

  const envelope = await runAttempts({
    toolClass: call.toolClass,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.retryRuntime === undefined ? {} : { runtime: options.retryRuntime }),
    attempt: async (attemptNumber) => {
      attempts = attemptNumber;
      const context: TransportErrorContext = { ...baseContext, attempts: attemptNumber };

      // throwIfAborted zu Beginn jedes Versuchs: Hat der Client inzwischen abgebrochen, geht
      // nichts mehr hinaus (mcp-sdk-typescript.md 10.4 Punkt 8).
      if (isAborted(options.signal)) {
        throw new CancelledError(context, "before-request");
      }

      // Schritt 9: Token aus `default`, zusätzlich aus dem Sondereimer. Jeder Versuch
      // entnimmt seine eigenen.
      let acquired;
      try {
        acquired = await limiter.acquire({
          tenant,
          bucket: call.bucket,
          context,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
      } catch (error) {
        // Bricht der Client ab, während der Aufruf auf ein Token wartet, lehnt die Uhr des
        // Limiters mit einem gewöhnlichen Fehler ab. Daraus wird hier der Abbruch mit der
        // richtigen Lage: Es ging nichts hinaus.
        if (isAborted(options.signal)) {
          throw new CancelledError(context, "before-request");
        }
        throw error;
      }
      waitedMs += acquired.waitedMs;

      const sentAt = clock.now();
      try {
        const result = await performRequest({
          call,
          context,
          url,
          headers,
          payload,
          timeoutMs,
          clientSignal: options.signal,
        });
        logDebug(
          `${call.toolName} ${call.specPath}: HTTP ${result.status} in ${Math.round(clock.now() - sentAt)} ms ` +
            `(Versuch ${attemptNumber}).`,
        );
        return result;
      } catch (error) {
        // Protokolliert wird der Spezifikationspfad, nie der gebaute: Der trüge eine
        // Geschäftskennung, und im Protokoll stehen nur Namen.
        logDebug(
          `${call.toolName} ${call.specPath}: Versuch ${attemptNumber} scheiterte nach ` +
            `${Math.round(clock.now() - sentAt)} ms.`,
        );
        throw error;
      }
    },
  });

  return {
    envelope,
    attempts,
    durationMs: Math.round(clock.now() - startedAt),
    waitedMs,
  };
}
