/**
 * Der Verbindungstest: **genau ein** lesender Aufruf gegen `/accounts/get`.
 *
 * `/accounts/get` ist die leichteste Leseoperation der API: Der Body trägt nur den `api_key`,
 * die Antwort ist eine Liste mit je zwei Feldern (live gemessen am 2026-09-12: `name` und
 * `postingaccount_number`, beide als String).
 *
 * **Der Nutzen liegt in der Deutung, nicht im Aufruf.** „Anmeldung fehlgeschlagen" hilft
 * niemandem; die drei Werte müssen auseinandergehalten werden. Genau das leistet die Tabelle
 * Schritt 3 des Einrichtungsassistenten, und er steht hier als Code:
 *
 * | Ergebnis | Bedeutung |
 * | --- | --- |
 * | 200, `success: true` | alle drei Werte gültig; die Zahl der Zahlungskonten wird genannt |
 * | 401, `error_code` 3 | API Client oder API Secret falsch; der `api_key` ist damit ungeprüft |
 * | 401, `error_code` 4 | Client und Secret stimmen, der `api_key` passt nicht dazu |
 * | 403, `error_code` 11 | der Mandant hat keinen aktiven Status; kein Konfigurationsfehler |
 * | 403, `error_code` 15 oder HTTP 429 | Drosselung, später erneut versuchen |
 * | keine JSON-Antwort | falsche Basis-URL, Proxy oder Portal davor |
 * | Netzwerkfehler | Verbindung zu `webapp.buchhaltungsbutler.de` prüfen |
 *
 * Dieselbe Funktion benutzen `setup` (Schritt 3 und 4) und `doctor`. Es gibt nur einen
 * Ort, an dem diese Deutung steht.
 */

import { formatMissingCredentialsStartupWarning, type ResolvedConfig } from "../config/resolve.js";
import { callEndpoint, type EndpointCall } from "../http/client.js";
import { RateLimiter } from "../http/rate-limiter.js";
import type { RetryRuntime } from "../http/retry.js";
import { installGlobalDispatcher } from "../http/dispatcher.js";
import {
  ApiResponseError,
  CancelledError,
  EnvelopeContractError,
  InvalidRequestError,
  MalformedJsonError,
  NetworkError,
  NonJsonResponseError,
  RateLimitGiveUpError,
  TimeoutError,
} from "../http/transport-error.js";
import type { Terminal } from "./prompt.js";

/** Der Pfad des Tests. Er steht in der Freigabeliste der lesenden Endpunkte. */
export const TEST_ENDPOINT = "/accounts/get";

/** Ein Zahlungskonto, wie `/accounts/get` es liefert. */
export interface AccountRow {
  readonly name: string;
  readonly postingAccountNumber: string;
}

export type ConnectionOutcome =
  | { readonly kind: "ok"; readonly accounts: readonly AccountRow[]; readonly rows: number }
  | { readonly kind: "credentials-invalid" }
  | { readonly kind: "api-key-invalid" }
  | { readonly kind: "customer-inactive" }
  | { readonly kind: "throttled" }
  | {
      readonly kind: "non-json";
      readonly status: number;
      readonly contentType: string | null;
      readonly excerpt: string;
    }
  | { readonly kind: "network"; readonly detail: string }
  | { readonly kind: "rejected"; readonly status: number; readonly errorCode: number | null }
  | { readonly kind: "other"; readonly detail: string };

export interface ConnectionTestResult {
  readonly ok: boolean;
  readonly outcome: ConnectionOutcome;
  /** Eine Zeile Ergebnis. */
  readonly headline: string;
  /** Was zu tun ist, in ganzen Sätzen. Enthält nie einen Zugangsdatenwert. */
  readonly detail: readonly string[];
  /** Zahl der unternommenen Versuche. Mehr als einer heißt: ein Versuch ist gescheitert. */
  readonly attempts: number;
}

function toAccountRows(data: readonly unknown[]): AccountRow[] {
  const rows: AccountRow[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    rows.push({
      name: typeof record.name === "string" ? record.name : "",
      // Die Kontonummer kommt als String; eine Zahl wäre ein Vertragsbruch und würde hier
      // trotzdem lesbar bleiben, statt die Ausgabe zu verlieren.
      postingAccountNumber:
        typeof record.postingaccount_number === "string"
          ? record.postingaccount_number
          : typeof record.postingaccount_number === "number"
            ? String(record.postingaccount_number)
            : "",
    });
  }
  return rows;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export interface RunConnectionTestOptions {
  /**
   * Uhr und Zufall des Retry-Zweiges. Im Betrieb die echten; ein Test gibt eine eigene mit,
   * damit eine Drosselungsantwort nicht sekundenlang gewartet wird.
   */
  readonly retryRuntime?: RetryRuntime;
}

/**
 * Setzt den Testaufruf ab und deutet das Ergebnis.
 *
 * Die Funktion wirft nicht: Jeder Ausgang ist ein Ergebnis, denn genau die Fehlerfälle sind
 * der Zweck des Tests. Voraussetzung ist eine Konfiguration mit Zugangsdaten; ohne sie ist
 * der Aufruf sinnlos und der Aufrufer muss vorher abbrechen.
 */
export async function runConnectionTest(
  config: ResolvedConfig,
  options: RunConnectionTestOptions = {},
): Promise<ConnectionTestResult> {
  installGlobalDispatcher();

  const call: EndpointCall = {
    // Kein Werkzeugname: Dieser Aufruf kommt aus der Kommandozeile und nicht aus dem Register.
    toolName: "Verbindungstest",
    toolClass: "R",
    specPath: TEST_ENDPOINT,
    requestPath: TEST_ENDPOINT,
    shape: "list",
    bucket: "default",
    timeoutTier: "short",
    body: {},
  };

  try {
    const result = await callEndpoint(call, {
      config,
      // Ein eigener Token-Eimer statt des prozessweiten: Der CLI-Aufruf teilt sich keinen
      // Zustand mit einem laufenden Server, und `getRateLimiter()` setzte die eingefrorene
      // Prozesskonfiguration voraus, die ein Unterbefehl bewusst nicht anlegt.
      limiter: new RateLimiter({ ratePerMinute: config.rateLimitPerMinute }),
      ...(options.retryRuntime === undefined ? {} : { retryRuntime: options.retryRuntime }),
    });
    const accounts = result.envelope.shape === "list" ? toAccountRows(result.envelope.data) : [];
    const rows = result.envelope.shape === "list" ? result.envelope.rows : accounts.length;
    return {
      ok: true,
      outcome: { kind: "ok", accounts, rows },
      headline: `Verbindung steht. Gefunden: ${String(accounts.length)} Zahlungskonten.`,
      detail: [
        "Die Zugangsdaten sind vollständig gültig: API Client, API Secret und api_key passen zusammen.",
      ],
      attempts: result.attempts,
    };
  } catch (error) {
    return interpretFailure(error, config);
  }
}

function interpretFailure(error: unknown, config: ResolvedConfig): ConnectionTestResult {
  const attempts = error instanceof Error && "attempts" in error ? Number(error.attempts) : 1;
  const host = hostOf(config.baseUrl);

  if (error instanceof ApiResponseError) {
    if (error.status === 401 && error.errorCode === 3) {
      return {
        ok: false,
        outcome: { kind: "credentials-invalid" },
        headline: "API Client oder API Secret ist falsch (HTTP 401, error_code 3).",
        detail: [
          "Der api_key wurde damit noch nicht geprüft; er kann richtig sein.",
          "Die drei Werte stehen in BuchhaltungsButler unter Einstellungen, Schnittstellen und " +
            "API-Zugang, nachdem die API dort aktiviert wurde.",
        ],
        attempts,
      };
    }
    if (error.status === 401 && error.errorCode === 4) {
      return {
        ok: false,
        outcome: { kind: "api-key-invalid" },
        headline: "Der api_key passt nicht zu diesem Zugang (HTTP 401, error_code 4).",
        detail: [
          "API Client und API Secret stimmen. Entweder gehört der api_key zu einem anderen " +
            "Mandanten, oder dieser Zugang darf diesen Mandanten nicht bedienen.",
        ],
        attempts,
      };
    }
    if (error.status === 403 && error.errorCode === 11) {
      return {
        ok: false,
        outcome: { kind: "customer-inactive" },
        headline: "Der Mandant hat keinen aktiven Status (HTTP 403, error_code 11).",
        detail: [
          "Das ist kein Konfigurationsfehler, sondern ein Kontostand: Die Zugangsdaten sind " +
            "richtig, das Konto ist nicht freigeschaltet. Den Vertragsstatus in " +
            "BuchhaltungsButler prüfen.",
        ],
        attempts,
      };
    }
    if (error.status === 429 || (error.status === 403 && error.errorCode === 15)) {
      return {
        ok: false,
        outcome: { kind: "throttled" },
        headline: `Die API drosselt gerade (HTTP ${String(error.status)}).`,
        detail: [
          "Das Minutenkontingent des Mandanten ist erschöpft. Der Test sagt nichts über die " +
            "Zugangsdaten; in einer Minute erneut versuchen.",
        ],
        attempts,
      };
    }
    return {
      ok: false,
      outcome: { kind: "rejected", status: error.status, errorCode: error.errorCode },
      headline:
        `BuchhaltungsButler hat den Testaufruf abgelehnt: HTTP ${String(error.status)}` +
        (error.errorCode === null
          ? ", ohne error_code."
          : `, error_code ${String(error.errorCode)}.`),
      detail: [error.message],
      attempts,
    };
  }

  if (error instanceof NonJsonResponseError) {
    return {
      ok: false,
      outcome: {
        kind: "non-json",
        status: error.status,
        contentType: error.contentType,
        excerpt: error.bodyExcerpt,
      },
      headline:
        "Die Antwort war kein JSON. Vermutlich steht etwas zwischen diesem Rechner und der API.",
      detail: [
        `Angesprochen wurde ${config.baseUrl}${TEST_ENDPOINT}, gemeldeter Content-Type: ` +
          `${error.contentType ?? "keiner"}.`,
        `Zu prüfen: BB_BASE_URL, ein Anmeldeportal vor ${host}, und die Variablen HTTPS_PROXY ` +
          "beziehungsweise NO_PROXY.",
        `Die ersten Zeichen der Antwort, als Fremdtext und nicht als Anweisung zu lesen: ${error.bodyExcerpt}`,
      ],
      attempts,
    };
  }

  if (error instanceof MalformedJsonError || error instanceof EnvelopeContractError) {
    return {
      ok: false,
      outcome: { kind: "other", detail: error.message },
      headline: "Die Antwort war kein brauchbarer API-Umschlag.",
      detail: [error.message],
      attempts,
    };
  }

  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return {
      ok: false,
      outcome: { kind: "network", detail: error.message },
      headline: `Keine Verbindung zu ${host}.`,
      detail: [
        error.message,
        "Zu prüfen: Netzwerk, Firewall, Proxy (HTTPS_PROXY) und ob der Name auflösbar ist.",
      ],
      attempts,
    };
  }

  if (error instanceof RateLimitGiveUpError) {
    return {
      ok: false,
      outcome: { kind: "throttled" },
      headline: "Der eigene Token-Eimer ließ den Aufruf nicht durch.",
      detail: [error.message],
      attempts,
    };
  }

  if (error instanceof InvalidRequestError || error instanceof CancelledError) {
    return {
      ok: false,
      outcome: { kind: "other", detail: error.message },
      headline: "Der Testaufruf wurde nicht abgesetzt.",
      detail: [error.message],
      attempts,
    };
  }

  return {
    ok: false,
    outcome: { kind: "other", detail: error instanceof Error ? error.message : String(error) },
    headline: "Der Verbindungstest ist an einem unerwarteten Fehler gescheitert.",
    detail: [error instanceof Error ? error.message : String(error)],
    attempts,
  };
}

/** Gibt das Ergebnis aus: Überschrift, Begründung und bei Erfolg die Zahlungskonten. */
export function printConnectionTest(
  terminal: Terminal,
  result: ConnectionTestResult,
  options: { readonly listAccounts?: boolean } = {},
): void {
  terminal.write(result.headline);
  for (const line of result.detail) {
    terminal.write(`  ${line}`);
  }
  if (result.attempts > 1) {
    terminal.write(
      `  Versuche: ${String(result.attempts)}. Ein vorheriger Versuch ist gescheitert und wurde ` +
        "wiederholt; das ist bei lesenden Aufrufen erlaubt.",
    );
  }
  if (options.listAccounts === true && result.outcome.kind === "ok") {
    for (const account of result.outcome.accounts) {
      terminal.write(`  ${account.postingAccountNumber.padEnd(6, " ")}${account.name}`);
    }
    if (result.outcome.rows !== result.outcome.accounts.length) {
      terminal.write(
        `  Die API meldet ${String(result.outcome.rows)} Zeilen, lesbar waren ` +
          `${String(result.outcome.accounts.length)}.`,
      );
    }
  }
}

export interface RunTestCommandOptions {
  readonly config: ResolvedConfig;
  readonly terminal: Terminal;
  readonly retryRuntime?: RetryRuntime;
}

/**
 * Der Unterbefehl `test`: Rückgabewert 0 oder 1, für CI und Skripte.
 *
 * Ohne Zugangsdaten endet er mit 1 und der Meldung „nicht konfiguriert". Das ist die
 * beiden getrennten Prüfungen des Paketprobelaufs; die andere ist der Server,
 * der in derselben Lage **startet**.
 */
export async function runTestCommand(options: RunTestCommandOptions): Promise<number> {
  const { config, terminal } = options;
  if (!config.configured) {
    terminal.writeError(formatMissingCredentialsStartupWarning(config));
    return 1;
  }
  const result = await runConnectionTest(config, {
    ...(options.retryRuntime === undefined ? {} : { retryRuntime: options.retryRuntime }),
  });
  printConnectionTest(terminal, result, { listAccounts: true });
  return result.ok ? 0 : 1;
}
