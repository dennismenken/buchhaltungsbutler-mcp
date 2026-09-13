import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSecrets, registerSecret } from "../../src/config/redact.js";
import {
  getLogLevel,
  isLevelEnabled,
  logDebug,
  logError,
  logInfo,
  logOnce,
  logWarn,
  resetLoggingForTests,
  setLogLevel,
  writeStderrBlock,
} from "../../src/logging/stderr.js";

let stderrChunks: string[] = [];
let stdoutChunks: string[] = [];

function written(): string {
  return stderrChunks.join("");
}

beforeEach(() => {
  resetLoggingForTests();
  clearSecrets();
  stderrChunks = [];
  stdoutChunks = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  });
  // eslint-disable-next-line no-restricted-properties -- Der Test weist nach, dass der Server stdout nicht anfasst.
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLoggingForTests();
  clearSecrets();
});

describe("stderr-Protokoll", () => {
  it("hat die Vorgabestufe warn", () => {
    expect(getLogLevel()).toBe("warn");
    expect(isLevelEnabled("warn")).toBe(true);
    expect(isLevelEnabled("info")).toBe(false);
  });

  it("schreibt niemals auf stdout", () => {
    setLogLevel("debug");
    logError("A");
    logWarn("B");
    logInfo("C");
    logDebug("D");
    writeStderrBlock("E");

    expect(stdoutChunks).toEqual([]);
    expect(written()).toContain("A");
    expect(written()).toContain("E");
  });

  it("unterdrückt Meldungen unterhalb der eingestellten Stufe", () => {
    setLogLevel("error");
    logWarn("nicht sichtbar");
    logInfo("nicht sichtbar");
    logDebug("nicht sichtbar");
    expect(stderrChunks).toEqual([]);

    logError("sichtbar");
    expect(written()).toContain("sichtbar");
  });

  it("stellt jeder Zeile ein Präfix mit der Stufe voran", () => {
    logWarn("erste Zeile\nzweite Zeile");
    const out = written();

    expect(out).toBe("bbutler-mcp warn: erste Zeile\nbbutler-mcp warn: zweite Zeile\n");
  });

  it("schreibt einen Block ohne Präfix, aber mit Zeilenende", () => {
    writeStderrBlock("mehrzeilig\nohne Praefix");

    expect(written()).toBe("mehrzeilig\nohne Praefix\n");
  });

  it("schwärzt jedes Geheimnis auf dem Weg nach stderr", () => {
    registerSecret("PLATZHALTER_API_SECRET_9b2c4d");
    logWarn("Wert war PLATZHALTER_API_SECRET_9b2c4d");
    writeStderrBlock("Block mit PLATZHALTER_API_SECRET_9b2c4d");

    expect(written()).not.toContain("PLATZHALTER_API_SECRET_9b2c4d");
    expect(written()).toContain("[redacted]");
  });

  it("gibt eine Einmalmeldung genau einmal aus", () => {
    logOnce("feld:unbekannt", "warn", "unbekanntes Feld gesehen");
    logOnce("feld:unbekannt", "warn", "unbekanntes Feld gesehen");

    expect(stderrChunks).toHaveLength(1);
  });
});
