// Die Randfälle des Herunterfahrens und die beiden Prozesslauscher aus `server/shutdown.ts`
// (Plan 2, AP10).
//
// `server-lifecycle.test.ts` prüft den Regelfall am laufenden Server: ein Signal, zwei Signale,
// stdin-Ende, ein Ziel, das beim Schließen wirft. Hier stehen die Fälle daneben, die dort nicht
// hinpassen, weil sie keinen Server brauchen und keinen vertragen:
//
//   1. Ein Ziel, das etwas wirft, das **keine** Ausnahme ist. Ein `throw "kaputt"` ist in
//      JavaScript erlaubt, und die Diagnose darf daran nicht selbst scheitern.
//   2. `dispose()` zweimal. Der zweite Aufruf muss folgenlos bleiben.
//   3. `installProcessErrorHandlers` mit beiden Ereignissen, jeweils mit und ohne verwertbaren
//      Stapel und mit einem abgelehnten Wert, der keine Ausnahme ist.
//
// Die Lauscher hängen ausnahmslos an einem eingespeisten `processRef`. Am echten Prozess
// hinge nach dem Test ein Lauscher, der jede folgende Testdatei beeinflusste.

import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoggingForTests, setLogLevel } from "../../src/logging/stderr.js";
import {
  installProcessErrorHandlers,
  installShutdown,
  type ShutdownCloseable,
} from "../../src/server/shutdown.js";

let stderrChunks: string[] = [];

function written(): string {
  return stderrChunks.join("");
}

/** Ein Prozessersatz mit genau den beiden Methoden, die das Modul benutzt. */
function fakeProcess(): Pick<NodeJS.Process, "on" | "off"> & EventEmitter {
  return new EventEmitter() as unknown as Pick<NodeJS.Process, "on" | "off"> & EventEmitter;
}

beforeEach(() => {
  resetLoggingForTests();
  setLogLevel("debug");
  stderrChunks = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLoggingForTests();
});

describe("installShutdown, Randfälle", () => {
  it("übergeht auch etwas, das geworfen wurde und keine Ausnahme ist", async () => {
    const closed: string[] = [];
    const targets: ShutdownCloseable[] = [
      {
        close(): void {
          // In JavaScript erlaubt, in fremden Bibliotheken gelegentlich anzutreffen.
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- Genau das ist der Prüffall.
          throw "die Gegenstelle hat schon aufgelegt";
        },
      },
      {
        close(): void {
          closed.push("zweites Ziel");
        },
      },
    ];

    const handle = installShutdown({
      targets,
      signals: [],
      stdin: null,
      setExitCode: () => undefined,
      processRef: fakeProcess(),
    });

    await handle.shutdown("Prüffall");

    // Der Fehler des ersten Ziels stoppt die Folge nicht.
    expect(closed).toEqual(["zweites Ziel"]);
    expect(written()).toContain("die Gegenstelle hat schon aufgelegt");
    expect(handle.runs()).toBe(1);
    handle.dispose();
  });

  it("bleibt beim zweiten dispose folgenlos", () => {
    const proc = fakeProcess();
    const handle = installShutdown({
      targets: [],
      signals: ["SIGINT"],
      stdin: null,
      setExitCode: () => undefined,
      processRef: proc,
    });

    expect(proc.listenerCount("SIGINT")).toBe(1);

    handle.dispose();
    expect(proc.listenerCount("SIGINT")).toBe(0);

    // Der zweite Aufruf darf weder werfen noch den Abbau auslösen.
    handle.dispose();
    expect(proc.listenerCount("SIGINT")).toBe(0);
    expect(handle.runs()).toBe(0);
    expect(handle.isShuttingDown()).toBe(false);
  });
});

describe("installProcessErrorHandlers", () => {
  /**
   * `onException` setzt `process.exitCode` am echten Prozess und nicht am eingespeisten: Der
   * Rückgabewert des Testlaufs gehört vitest. Er wird deshalb um jeden Prüffall herum
   * gesichert und danach wiederhergestellt.
   */
  function withRestoredExitCode(body: () => void): void {
    const before = process.exitCode;
    try {
      body();
    } finally {
      process.exitCode = before;
    }
  }

  it("protokolliert eine unbehandelte Zusage mit Ausnahme samt Stapel und beendet nicht", () => {
    const proc = fakeProcess();
    let fatal = 0;
    const remove = installProcessErrorHandlers({
      processRef: proc,
      onFatal: () => {
        fatal += 1;
      },
    });

    const reason = new Error("die Zusage ist danebengegangen");
    proc.emit("unhandledRejection", reason);

    expect(written()).toContain("Unbehandelte Zusage (unhandledRejection)");
    expect(written()).toContain("die Zusage ist danebengegangen");
    expect(written()).toContain("server-process-errors.test.ts");
    // Eine abgelehnte Zusage beendet den Server ausdrücklich nicht (Plan 2, AP10).
    expect(fatal).toBe(0);
    expect(process.exitCode).not.toBe(1);

    remove();
  });

  it("protokolliert eine unbehandelte Zusage ohne Stapel und einen Wert, der keine Ausnahme ist", () => {
    const proc = fakeProcess();
    const remove = installProcessErrorHandlers({ processRef: proc });

    const withoutStack = new Error("Ausnahme ohne Stapel");
    // Manche Laufzeiten und manche Bibliotheken liefern eine Ausnahme ohne stack.
    Object.defineProperty(withoutStack, "stack", { value: undefined });
    proc.emit("unhandledRejection", withoutStack);
    expect(written()).toContain("Ausnahme ohne Stapel");

    stderrChunks = [];
    proc.emit("unhandledRejection", { grund: "kein Error" });
    expect(written()).toContain("Unbehandelte Zusage (unhandledRejection)");
    expect(written()).toContain("[object Object]");

    remove();
  });

  it("meldet eine unbehandelte Ausnahme, setzt den Rückgabewert 1 und ruft onFatal", () => {
    withRestoredExitCode(() => {
      const proc = fakeProcess();
      const fatal: Error[] = [];
      const remove = installProcessErrorHandlers({
        processRef: proc,
        onFatal: (error) => {
          fatal.push(error);
        },
      });

      const error = new Error("es ist etwas durchgeschlagen");
      proc.emit("uncaughtException", error);

      expect(written()).toContain("Unbehandelte Ausnahme (uncaughtException)");
      expect(written()).toContain("es ist etwas durchgeschlagen");
      expect(written()).toContain("server-process-errors.test.ts");
      expect(process.exitCode).toBe(1);
      expect(fatal).toEqual([error]);

      remove();
    });
  });

  it("kommt auch bei einer unbehandelten Ausnahme ohne Stapel und ohne onFatal zurecht", () => {
    withRestoredExitCode(() => {
      const proc = fakeProcess();
      const remove = installProcessErrorHandlers({ processRef: proc });

      const error = new Error("Ausnahme ohne Stapel");
      Object.defineProperty(error, "stack", { value: undefined });
      proc.emit("uncaughtException", error);

      expect(written()).toContain(
        "Unbehandelte Ausnahme (uncaughtException): Ausnahme ohne Stapel",
      );
      expect(process.exitCode).toBe(1);

      remove();
    });
  });

  it("entfernt beide Lauscher wieder", () => {
    const proc = fakeProcess();
    const remove = installProcessErrorHandlers({ processRef: proc });

    expect(proc.listenerCount("unhandledRejection")).toBe(1);
    expect(proc.listenerCount("uncaughtException")).toBe(1);

    remove();

    expect(proc.listenerCount("unhandledRejection")).toBe(0);
    expect(proc.listenerCount("uncaughtException")).toBe(0);
  });
});
