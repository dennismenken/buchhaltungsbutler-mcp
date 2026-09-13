import {
  Agent,
  type Dispatcher,
  EnvHttpProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from "undici";
import { afterEach, describe, expect, it } from "vitest";

import {
  installGlobalDispatcher,
  isDispatcherInstalled,
  KEEP_ALIVE_OPTIONS,
  resetDispatcherStateForTests,
} from "../../src/http/dispatcher.js";
import { getMockAgent } from "../setup.js";

afterEach(() => {
  resetDispatcherStateForTests();
  setGlobalDispatcher(getMockAgent());
});

describe("installGlobalDispatcher", () => {
  it("ersetzt einen eingehängten MockAgent nicht", () => {
    // Das ist die wichtigere der beiden Richtungen: Würde der Produktionsdispatcher den
    // MockAgent überschreiben, wäre die Netzsperre aus 9.1 stillschweigend aufgehoben, und
    // der Testlauf sähe trotzdem grün aus.
    const before = getGlobalDispatcher();
    expect(installGlobalDispatcher()).toBe(false);
    expect(getGlobalDispatcher()).toBe(before);
    expect(isDispatcherInstalled()).toBe(false);
  });

  it("setzt einen EnvHttpProxyAgent mit Keep-Alive und wirkt nur einmal", async () => {
    // Es geht in diesem Fall kein Aufruf hinaus; es wird ausschließlich der Dispatcher
    // getauscht und danach sofort wieder der MockAgent eingehängt.
    const placeholderAgent = new Agent();
    setGlobalDispatcher(placeholderAgent);
    resetDispatcherStateForTests();
    let installed: Dispatcher | null = null;
    try {
      expect(installGlobalDispatcher()).toBe(true);
      expect(isDispatcherInstalled()).toBe(true);
      const current = getGlobalDispatcher();
      expect(current).toBeInstanceOf(EnvHttpProxyAgent);
      installed = current;

      // Ein zweiter Aufruf würde die offenen Verbindungen des ersten Agents hinter sich
      // lassen, ohne sie zu schließen.
      expect(installGlobalDispatcher()).toBe(false);
      expect(getGlobalDispatcher()).toBe(current);
    } finally {
      setGlobalDispatcher(getMockAgent());
      resetDispatcherStateForTests();
      await installed?.close();
      await placeholderAgent.close();
    }
  });

  it("hält Verbindungen offen, ohne unbegrenzt viele zu öffnen", () => {
    expect(KEEP_ALIVE_OPTIONS.keepAliveTimeout).toBe(30_000);
    expect(KEEP_ALIVE_OPTIONS.keepAliveMaxTimeout).toBe(60_000);
    expect(KEEP_ALIVE_OPTIONS.connections).toBe(8);
  });
});
