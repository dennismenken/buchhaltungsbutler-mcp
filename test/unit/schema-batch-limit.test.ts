// Die Mengengrenze `min(50, BB_MCP_MAX_BATCH)` gilt für Stapelarrays UND für
// Positionslisten, auf oberster Ebene wie je Stapelelement.
//
// Der Test geht bewusst über die echte Umgebungsvariable und nicht über das Argument
// `maxItems`: Nur so ist belegt, dass die Grenze beim Bau des Schemas aus der eingefrorenen
// Konfiguration kommt und nicht irgendwo zweimal gepflegt wird.

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { initConfig, resetConfigForTests } from "../../src/config/resolve.js";
import { API_MAX_BATCH, batchLimit, postingPositions } from "../../src/schema/line-items.js";
import { batchArray } from "../../src/schema/batch.js";
import { boundedText, strictObject } from "../../src/schema/primitives.js";

// Platzhalter, keine echten Zugangsdaten. Sie verhindern, dass der Start den Block
// „nicht konfiguriert" auf stderr schreibt.
function envWith(maxBatch?: string): NodeJS.ProcessEnv {
  return {
    BB_API_CLIENT: "platzhalter-client",
    BB_API_SECRET: "platzhalter-secret",
    BB_API_KEY: "platzhalter-key",
    BB_MCP_LOG_LEVEL: "error",
    ...(maxBatch === undefined ? {} : { BB_MCP_MAX_BATCH: maxBatch }),
  };
}

const ELEMENT = strictObject({ name: boundedText("Name des Datensatzes.") });

const POSITION = {
  postingaccount: "4980",
  postingtext: "Bürobedarf",
  vat: "19_pre",
  amount: "10.00",
} as const;

function maxItemsOf(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }) as Record<
    string,
    unknown
  >;
  return json["maxItems"];
}

afterEach(() => {
  resetConfigForTests();
});

describe("BB_MCP_MAX_BATCH=10", () => {
  it("begrenzt Stapelarrays und Positionslisten gleichermaßen auf zehn", () => {
    initConfig({ env: envWith("10") });

    const batch = batchArray(ELEMENT, { description: "Die Datensätze." });
    const positions = postingPositions("receipt", { description: "Die Buchungssätze." });
    const nested = postingPositions("receipt-batch", { description: "Die Buchungssätze." });
    const invoiceLike = postingPositions("transaction", { description: "Die Buchungssätze." });

    expect(batchLimit()).toBe(10);
    expect(maxItemsOf(batch)).toBe(10);
    expect(maxItemsOf(positions)).toBe(10);
    expect(maxItemsOf(nested)).toBe(10);
    expect(maxItemsOf(invoiceLike)).toBe(10);
  });

  it("lehnt den elften Eintrag in beiden Arten ab", () => {
    initConfig({ env: envWith("10") });

    const batch = batchArray(ELEMENT, { description: "Die Datensätze." });
    const positions = postingPositions("receipt", { description: "Die Buchungssätze." });

    const tenElements = Array.from({ length: 10 }, () => ({ name: "a" }));
    const tenPositions = Array.from({ length: 10 }, () => ({ ...POSITION }));

    expect(batch.safeParse(tenElements).success).toBe(true);
    expect(positions.safeParse(tenPositions).success).toBe(true);
    expect(batch.safeParse([...tenElements, { name: "a" }]).success).toBe(false);
    expect(positions.safeParse([...tenPositions, { ...POSITION }]).success).toBe(false);
  });

  it("nennt die Zahl in der Beschreibung beider Arten", () => {
    initConfig({ env: envWith("10") });

    expect(batchArray(ELEMENT, { description: "x" }).description ?? "").toContain("Höchstens 10");
    expect(
      postingPositions("receipt", { description: "x" }).safeParse(
        Array.from({ length: 11 }, () => ({ ...POSITION })),
      ).success,
    ).toBe(false);
  });
});

describe("die Vorgabe und die API-Grenze", () => {
  it("fällt im Auslieferungszustand mit der API-Grenze 50 zusammen", () => {
    initConfig({ env: envWith() });
    expect(batchLimit()).toBe(API_MAX_BATCH);
    expect(batchLimit()).toBe(50);
  });

  it("kappt einen Betreiberwunsch niemals nach oben über 50 hinaus", () => {
    initConfig({ env: envWith("50") });
    expect(batchLimit()).toBe(50);
    // Der kleinere der beiden Faktoren gewinnt, in beiden Richtungen.
    expect(batchLimit(7)).toBe(7);
    expect(batchLimit(80)).toBe(50);
  });

  it("lehnt einen unbrauchbaren Wert beim Start ab, statt auf die Vorgabe zurückzufallen", () => {
    expect(() => initConfig({ env: envWith("0") })).toThrow(/BB_MCP_MAX_BATCH/);
    expect(() => initConfig({ env: envWith("51") })).toThrow(/BB_MCP_MAX_BATCH/);
  });

  it("verlangt eine aufgelöste Konfiguration, statt stillschweigend 50 anzunehmen", () => {
    expect(() => batchLimit()).toThrow(/noch nicht aufgelöst/);
  });
});
