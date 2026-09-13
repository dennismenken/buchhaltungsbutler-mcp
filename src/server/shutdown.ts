// Idempotentes Herunterfahren bei SIGINT, SIGTERM und stdin-Ende (Plan 2, Dateibaum; AP10).
//
// Warum Idempotenz hier keine Feinheit ist: Ein MCP-Client beendet den Serverprozess regelmäßig
// auf zwei Wegen gleichzeitig — er schließt die Pipe **und** schickt ein Signal. Läuft der Abbau
// dann zweimal, wird `close()` auf einem schon geschlossenen Transport aufgerufen, und die
// Ausnahme daraus landet als letzte Zeile im Protokoll des Nutzers, obwohl nichts kaputt war.
// Deshalb gibt es genau einen Abbau, gemerkt in einer Zusage, und jeder weitere Auslöser wartet
// auf dieselbe.
//
// Dieses Modul ruft `process.exit` nicht auf. Auf POSIX schreibt Node nach einer Pipe asynchron,
// und `process.exit` verwirft den Puffer — genau die Abschiedsmeldung wäre verloren. Stattdessen
// werden die Lauscher entfernt und der Rückgabewert gesetzt; der Prozess endet dann von selbst,
// sobald keine offenen Handles mehr übrig sind.

import type { Readable } from "node:stream";

import { logDebug, logError, logInfo } from "../logging/stderr.js";

/** Alles, was beim Herunterfahren zu schließen ist: der Server, der Transport. */
export interface ShutdownCloseable {
  close(): Promise<void> | void;
}

/** Die Signale, auf die gelauscht wird. */
export const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = Object.freeze(["SIGINT", "SIGTERM"]);

export interface InstallShutdownOptions {
  /** In dieser Reihenfolge geschlossen. Ein Fehler beim Schließen stoppt die Folge nicht. */
  readonly targets: readonly ShutdownCloseable[];
  readonly signals?: readonly NodeJS.Signals[];
  /**
   * Der Eingabestrom, dessen Ende das Gespräch beendet. Ohne Angabe `process.stdin`.
   * `null` schaltet diesen Auslöser ab.
   */
  readonly stdin?: Readable | null;
  /** Setzt den Rückgabewert des Prozesses. Ohne Angabe `process.exitCode`. */
  readonly setExitCode?: (code: number) => void;
  /** Nur für Tests: der Prozess, an dem die Signallauscher hängen. */
  readonly processRef?: Pick<NodeJS.Process, "on" | "off">;
}

export interface ShutdownHandle {
  /**
   * Fährt herunter. Jeder Aufruf nach dem ersten wartet auf denselben Abbau und löst keinen
   * zweiten aus.
   */
  shutdown(reason: string): Promise<void>;
  /** `true`, sobald der Abbau begonnen hat. */
  isShuttingDown(): boolean;
  /** Wie oft der Abbau wirklich gelaufen ist. Für den Nachweis der Idempotenz genau 1. */
  runs(): number;
  /** Entfernt die Lauscher, ohne herunterzufahren. Für Tests und für einen Neuaufbau. */
  dispose(): void;
}

/**
 * Hängt Signal- und Strombehandlung ein und liefert den Griff zum Herunterfahren.
 *
 * Die Lauscher werden als Erstes des Abbaus wieder entfernt. Das ist nicht Kosmetik: Ein
 * zweites SIGINT soll den Prozess nach dem voreingestellten Verhalten beenden dürfen, wenn der
 * Abbau hängt, und ein Signallauscher, der stehen bleibt, verhindert genau das.
 */
export function installShutdown(options: InstallShutdownOptions): ShutdownHandle {
  const signals = options.signals ?? SHUTDOWN_SIGNALS;
  const proc = options.processRef ?? process;
  const stdin = options.stdin === undefined ? process.stdin : options.stdin;
  const setExitCode =
    options.setExitCode ??
    ((code: number): void => {
      process.exitCode = code;
    });

  let started = false;
  let runs = 0;
  let pending: Promise<void> | undefined;
  let disposed = false;

  const listeners: { readonly remove: () => void }[] = [];

  const removeListeners = (): void => {
    for (const listener of listeners) {
      listener.remove();
    }
    listeners.length = 0;
  };

  const teardown = async (reason: string): Promise<void> => {
    runs += 1;
    logInfo(`Herunterfahren: ${reason}.`);
    removeListeners();
    for (const target of options.targets) {
      try {
        await target.close();
      } catch (error) {
        // Ein Transport, den die Gegenstelle schon geschlossen hat, wirft hier. Das ist kein
        // Grund, die übrigen Ziele nicht mehr zu schließen.
        logDebug(
          `Beim Schließen trat ein Fehler auf und wird übergangen: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    setExitCode(0);
  };

  const handle: ShutdownHandle = {
    shutdown(reason: string): Promise<void> {
      if (pending !== undefined) {
        logDebug(`Weiterer Auslöser beim Herunterfahren übergangen: ${reason}.`);
        return pending;
      }
      started = true;
      pending = teardown(reason);
      return pending;
    },
    isShuttingDown(): boolean {
      return started;
    },
    runs(): number {
      return runs;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      removeListeners();
    },
  };

  for (const signal of signals) {
    const onSignal = (): void => {
      void handle.shutdown(`Signal ${signal}`);
    };
    proc.on(signal, onSignal);
    listeners.push({
      remove: () => {
        proc.off(signal, onSignal);
      },
    });
  }

  if (stdin !== null) {
    // stdin-Ende heißt: Der Client hat die Pipe geschlossen. Auf „close" wird zusätzlich
    // gelauscht, weil ein abgebrochener Strom nicht zwingend vorher „end" meldet.
    for (const event of ["end", "close"] as const) {
      const onEnd = (): void => {
        void handle.shutdown(`stdin-Ende (${event})`);
      };
      stdin.on(event, onEnd);
      listeners.push({
        remove: () => {
          stdin.off(event, onEnd);
        },
      });
    }
  }

  return handle;
}

export interface ProcessErrorHandlerOptions {
  /**
   * Wird bei `uncaughtException` aufgerufen, nachdem die Diagnose auf stderr steht. Hier hängt
   * `create-server.ts` das Herunterfahren ein.
   */
  readonly onFatal?: (error: Error) => void;
  readonly processRef?: Pick<NodeJS.Process, "on" | "off">;
}

/**
 * Lenkt `unhandledRejection` und `uncaughtException` nach stderr.
 *
 * Beide schreiben nach stderr, und das ist Pflicht: Ohne Lauscher beendet Node den Prozess mit
 * einer Ausgabe, die bei einem über eine Pipe gestarteten Server niemand sieht, und der Nutzer
 * liest im Client nur „Server beendet".
 *
 * Die beiden Fälle werden **verschieden** behandelt, und das ist eine Entscheidung und kein
 * Versehen:
 *
 * - `uncaughtException` lässt den Prozess in einem unbekannten Zustand zurück. In einer
 *   Buchhaltung ist Weiterlaufen dort teurer als Beenden, deshalb löst er das Herunterfahren
 *   aus und setzt den Rückgabewert 1. Das ist dasselbe Ergebnis wie ohne Lauscher, nur mit
 *   lesbarer Diagnose.
 * - Eine `unhandledRejection` wird protokolliert, beendet den Server aber **nicht**. Jeder
 *   Werkzeugaufruf ist in `register-tools.ts` vollständig umschlossen; eine Zusage, die
 *   daneben scheitert, darf keine Sitzung beenden, in der die übrigen Aufrufe weiter laufen.
 *
 * @returns Eine Funktion, die beide Lauscher wieder entfernt.
 */
export function installProcessErrorHandlers(options: ProcessErrorHandlerOptions = {}): () => void {
  const proc = options.processRef ?? process;

  const onRejection = (reason: unknown): void => {
    logError(
      "Unbehandelte Zusage (unhandledRejection): " +
        (reason instanceof Error
          ? `${reason.message}${reason.stack === undefined ? "" : `\n${reason.stack}`}`
          : String(reason)),
    );
  };

  const onException = (error: Error): void => {
    logError(
      `Unbehandelte Ausnahme (uncaughtException): ${error.message}` +
        (error.stack === undefined ? "" : `\n${error.stack}`),
    );
    process.exitCode = 1;
    options.onFatal?.(error);
  };

  proc.on("unhandledRejection", onRejection);
  proc.on("uncaughtException", onException);

  return () => {
    proc.off("unhandledRejection", onRejection);
    proc.off("uncaughtException", onException);
  };
}
