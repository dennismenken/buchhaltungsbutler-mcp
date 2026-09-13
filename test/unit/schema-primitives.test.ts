import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AMOUNT_PATTERN,
  DATE_PATTERN,
  DATE_TIME_PATTERN,
  INTERNAL_META_KEYS,
  amountValue,
  boundedText,
  dateTimeValue,
  dateValue,
  identifierValue,
  isAmountSchema,
  isCalendarDate,
  isCalendarDateTime,
  markSchemaKind,
  schemaKind,
  strictObject,
  stripInternalMeta,
  unwrapSchema,
} from "../../src/schema/primitives.js";

/** Die Eigenschaft `name` des erzeugten JSON Schemas, als einfaches Objekt. */
function property(schema: z.ZodType, name: string): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }) as unknown as {
    properties?: Record<string, Record<string, unknown>>;
  };
  return json.properties?.[name] ?? {};
}

describe("Datum", () => {
  it("nimmt ein Datum im Format YYYY-MM-DD", () => {
    expect(dateValue("Belegdatum").parse("2026-04-26")).toBe("2026-04-26");
  });

  it("lehnt ein falsches Format, einen leeren String und einen Zeitpunkt ab", () => {
    const schema = dateValue("Belegdatum");
    expect(schema.safeParse("26.04.2026").success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("2026-04-26 13:45:00").success).toBe(false);
  });

  it("lehnt einen nicht existierenden Kalendertag ab", () => {
    const schema = dateValue("Belegdatum");
    expect(schema.safeParse("2026-02-30").success).toBe(false);
    expect(schema.safeParse("2026-13-01").success).toBe(false);
    expect(schema.safeParse("2025-02-29").success).toBe(false);
    expect(schema.safeParse("2024-02-29").success).toBe(true);
  });

  it("trägt format: date und nicht das Muster von z.iso.date()", () => {
    const json = property(z.object({ d: dateValue("Belegdatum") }), "d");
    expect(json["format"]).toBe("date");
    expect(String(json["pattern"])).toBe(DATE_PATTERN.source);
    // Die Begründung steht in primitives.ts: Das Muster von z.iso.date() ist rund 250
    // Zeichen lang und käme an jedem Datumsfeld aller 54 Werkzeuge erneut vor.
    expect(String(json["pattern"]).length).toBeLessThan(40);
  });
});

describe("Datumzeit", () => {
  it("nimmt beide Formen", () => {
    const schema = dateTimeValue("Letzte Änderung");
    expect(schema.parse("2026-04-26 13:45:00")).toBe("2026-04-26 13:45:00");
    expect(schema.parse("2026-04-26")).toBe("2026-04-26");
  });

  it("lehnt eine unmögliche Uhrzeit und den T-Trenner ab", () => {
    const schema = dateTimeValue("Letzte Änderung");
    expect(schema.safeParse("2026-04-26 24:00:00").success).toBe(false);
    expect(schema.safeParse("2026-04-26 13:60:00").success).toBe(false);
    expect(schema.safeParse("2026-04-26T13:45:00").success).toBe(false);
  });

  it("prüft die Muster auch einzeln", () => {
    expect(DATE_TIME_PATTERN.test("2026-04-26 00:00:00")).toBe(true);
    expect(isCalendarDate("2026-04-26")).toBe(true);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(isCalendarDateTime("2026-04-26 23:59:59")).toBe(true);
    expect(isCalendarDateTime("2026-04-26 23:59:60")).toBe(false);
    expect(isCalendarDateTime("quatsch")).toBe(false);
  });
});

describe("Betrag", () => {
  it("nimmt Dezimalzeichenketten mit höchstens zwei Nachkommastellen", () => {
    const schema = amountValue("Bruttobetrag");
    expect(schema.parse("123.99")).toBe("123.99");
    expect(schema.parse("-192.44")).toBe("-192.44");
    expect(schema.parse("884")).toBe("884");
    expect(schema.safeParse("1.234,00").success).toBe(false);
    expect(schema.safeParse("1,99").success).toBe(false);
    expect(schema.safeParse("1.999").success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
  });

  it("erzeugt das kurze Muster im JSON Schema", () => {
    expect(property(z.object({ a: amountValue("Bruttobetrag") }), "a")["pattern"]).toBe(
      AMOUNT_PATTERN.source,
    );
  });
});

describe("Markierung der Betragsfelder (Guard 5)", () => {
  it("markiert jedes von amountValue erzeugte Fragment", () => {
    expect(isAmountSchema(amountValue("Bruttobetrag"))).toBe(true);
    expect(schemaKind(amountValue("Bruttobetrag"))).toBe("amount");
  });

  it("markiert nichts anderes", () => {
    expect(isAmountSchema(boundedText("Freitext"))).toBe(false);
    expect(isAmountSchema(identifierValue("Kennung"))).toBe(false);
    expect(isAmountSchema(dateValue("Datum"))).toBe(false);
    expect(isAmountSchema("kein Schema")).toBe(false);
    expect(schemaKind(undefined)).toBeUndefined();
  });

  it("findet die Markierung durch .optional(), .nullable() und .default() hindurch", () => {
    const amount = amountValue("Bruttobetrag");
    expect(isAmountSchema(amount.optional())).toBe(true);
    expect(isAmountSchema(amount.nullable())).toBe(true);
    expect(isAmountSchema(amount.default("1.00"))).toBe(true);
    expect(isAmountSchema(amount.nullable().optional())).toBe(true);
  });

  it("verliert die Markierung nicht, wenn die Beschreibung später geändert wird", () => {
    const amount = amountValue("Bruttobetrag").describe("Anderer Text");
    expect(isAmountSchema(amount)).toBe(true);
    expect(amount.description).toBe("Anderer Text");
  });

  it("trägt die übrigen beiden Arten", () => {
    expect(schemaKind(markSchemaKind(z.array(z.string()), "positions"))).toBe("positions");
    expect(schemaKind(markSchemaKind(z.array(z.string()), "batch"))).toBe("batch");
  });

  it("schält die Hüllen ab", () => {
    const inner = boundedText("Freitext");
    expect(unwrapSchema(inner.optional().nullable())).toBe(inner);
    expect(unwrapSchema("kein Schema")).toBeUndefined();
  });

  it("entfernt die Markierung aus einem JSON-Schema-Knoten", () => {
    const node: Record<string, unknown> = { type: "string", bbKind: "amount" };
    stripInternalMeta(node);
    expect(node).toEqual({ type: "string" });
    expect(INTERNAL_META_KEYS).toContain("bbKind");
  });
});

describe("Kennung", () => {
  it("nimmt eine positive Ganzzahl und lehnt String, 0 und Bruch ab", () => {
    const schema = identifierValue("Kennung");
    expect(schema.parse(1590)).toBe(1590);
    expect(schema.safeParse("1590").success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(1.5).success).toBe(false);
  });
});

describe("Freitext", () => {
  it("lehnt den leeren String ab", () => {
    expect(boundedText("Freitext").safeParse("").success).toBe(false);
  });

  it("hält die Längengrenze ein, wenn eine gesetzt ist", () => {
    const schema = boundedText("Buchungstext", 5);
    expect(schema.parse("12345")).toBe("12345");
    expect(schema.safeParse("123456").success).toBe(false);
  });
});

describe("das eine strikte Objekt", () => {
  it("lehnt unbekannte Schlüssel ab", () => {
    const schema = strictObject({ a: boundedText("A") });
    expect(schema.safeParse({ a: "x" }).success).toBe(true);
    expect(schema.safeParse({ a: "x", b: "y" }).success).toBe(false);
  });

  // Die Regel lautet: Es gibt genau einen Ort, der
  // additionalProperties: false setzt. Sie wird hier geprüft und nicht bloß verabredet.
  it("ist der einzige Aufruf von .strict() in der ganzen Schemaschicht", () => {
    const directory = path.join(import.meta.dirname, "..", "..", "src", "schema");
    const occurrences: string[] = [];
    for (const name of readdirSync(directory).sort()) {
      if (!name.endsWith(".ts")) {
        continue;
      }
      const lines = readFileSync(path.join(directory, name), "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Kommentarzeilen zählen nicht: Der Verweis auf die Regel ist nicht ihre Verletzung.
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
          continue;
        }
        const count = line.split(".strict()").length - 1;
        for (let i = 0; i < count; i++) {
          occurrences.push(name);
        }
      }
    }
    expect(occurrences).toEqual(["primitives.ts"]);
  });

  it("erzeugt additionalProperties: false", () => {
    const json = z.toJSONSchema(strictObject({ a: boundedText("A") }), {
      target: "draft-2020-12",
      io: "input",
    });
    expect((json as Record<string, unknown>)["additionalProperties"]).toBe(false);
  });
});
