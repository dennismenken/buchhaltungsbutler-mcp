import { getGlobalDispatcher, MockAgent } from "undici";
import { describe, expect, it } from "vitest";

import { getMockAgent } from "../setup.js";

// Selbsttest der Netzsperre aus Plan 9.1, Punkt 2. Ohne ihn wäre die Absicherung das Erste,
// was bei einem Umbau stumm ausfällt: Ein Testlauf ohne aktive Sperre sähe genauso grün aus.

describe("disableNetConnect() ist aktiv", () => {
  it("setzt den MockAgent als globalen Dispatcher", () => {
    const dispatcher = getGlobalDispatcher();
    expect(dispatcher).toBeInstanceOf(MockAgent);
    expect(dispatcher).toBe(getMockAgent());
  });

  it("lässt einen nicht abgefangenen Aufruf des eingebauten fetch scheitern", async () => {
    // Der Nachweis, den toolchain.md 5.2 ausdrücklich offenlässt: setGlobalDispatcher aus dem
    // installierten undici-Paket wirkt auch auf das eingebaute globale fetch. Geprüft wird die
    // Ursache und nicht nur, dass überhaupt etwas scheitert: Ein Namensauflösungsfehler würde
    // ebenfalls werfen und die Sperre fälschlich als wirksam ausweisen.
    const attempt = fetch("https://webapp.buchhaltungsbutler.de/api/v1/accounts/get", {
      method: "POST",
    });
    await expect(attempt).rejects.toThrow(TypeError);

    const caughtError = await attempt.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    const cause = (caughtError as { cause?: { name?: string; message?: string } } | undefined)
      ?.cause;
    expect(cause?.name).toBe("MockNotMatchedError");
    expect(cause?.message).toContain("net.connect disabled");
  });

  it("setzt die Basis-URL der Testumgebung auf einen nicht auflösbaren Wert", () => {
    expect(process.env.BB_BASE_URL).toBe("https://nicht-aufloesbar.invalid/api/v1");
  });
});
