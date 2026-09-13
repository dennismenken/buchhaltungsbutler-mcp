import { describe, expect, it } from "vitest";

import {
  amountStringToApiNumber,
  amountToCents,
  compareCents,
  formatCents,
  MAX_SAFE_CENTS,
  parseAmountToCents,
  sumCents,
} from "../../src/mapping/decimal.js";

// Plan 9.5 verlangt hier 100 Prozent Zweigabdeckung: „hier entstehen stille Datenfehler.
// Beträge mit Punkt und mit Komma". Der naheliegende Fehler ist eine Gleitkommarechnung auf
// Geld; diese Datei prüft, dass es sie hier nicht gibt.

describe("parseAmountToCents, die gemessenen Formen der API", () => {
  it("liest die gemessenen Betragszeichenketten verlustfrei", () => {
    // Gemessen am 2026-09-12 (Plan 0.3 Befund L3, live-befunde-orchestrator.md Befund 3).
    expect(amountToCents("884.65")).toBe(88465);
    expect(amountToCents("-192.44")).toBe(-19244);
    expect(amountToCents("0.00")).toBe(0);
    expect(amountToCents("1190.00")).toBe(119000);
  });

  it("greift nicht daneben, wo parseFloat es tut", () => {
    // Nachgerechnet am 2026-09-12 mit Node: `parseFloat("19.99") * 100` ergibt
    // 1998.9999999999998, `parseFloat("1.13") * 100` ergibt 112.99999999999999. Eine
    // Abschneidung statt einer Rundung macht daraus 1998 beziehungsweise 112 — ein Cent
    // Differenz je Zeile. Genau so entsteht der stille Datenfehler, den diese Datei ausschließt.
    // Beträge, deren Gleitkommaprodukt NICHT ganzzahlig ist.
    for (const [raw, cents] of [
      ["19.99", 1999],
      ["1.13", 113],
      ["0.07", 7],
      ["8.38", 838],
      ["4.35", 435],
    ] as const) {
      expect(amountToCents(raw)).toBe(cents);
      expect(Number.isInteger(Number.parseFloat(raw) * 100)).toBe(false);
    }
    // Und die Teilmenge, bei der das Produkt **unter** dem richtigen Cent liegt: Dort wird
    // aus einer Abschneidung ein Cent Differenz je Zeile.
    for (const [raw, cents] of [
      ["19.99", 1999],
      ["1.13", 113],
      ["4.35", 435],
    ] as const) {
      expect(Math.trunc(Number.parseFloat(raw) * 100)).toBe(cents - 1);
      expect(amountToCents(raw)).toBe(cents);
    }
  });

  it("nimmt eine Stelle, zwei Stellen und keine Nachkommastelle", () => {
    expect(amountToCents("7")).toBe(700);
    expect(amountToCents("7.5")).toBe(750);
    expect(amountToCents("7.05")).toBe(705);
  });

  it("nimmt das Pluszeichen und Leerraum am Rand", () => {
    expect(amountToCents("+12.34")).toBe(1234);
    expect(amountToCents("  12.34  ")).toBe(1234);
  });
});

describe("parseAmountToCents, deutsche Schreibweise und Tausendertrennzeichen", () => {
  it("liest das Komma als Dezimaltrennzeichen", () => {
    expect(amountToCents("884,65")).toBe(88465);
    expect(amountToCents("-192,44")).toBe(-19244);
  });

  it("liest die Mischform, bei der das letzte Zeichen das Dezimaltrennzeichen ist", () => {
    expect(amountToCents("1.234,56")).toBe(123456);
    expect(amountToCents("1,234.56")).toBe(123456);
    expect(amountToCents("1.234.567,89")).toBe(123456789);
  });

  it("liest ein mehrfach vorkommendes Trennzeichen als Gruppierung", () => {
    expect(amountToCents("1.234.567")).toBe(123456700);
    expect(amountToCents("1,234,567")).toBe(123456700);
  });

  it("lehnt eine Mischform ab, deren Vorkommateil selbst noch ein Dezimaltrennzeichen trägt", () => {
    expect(parseAmountToCents("1,234.56.78")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("1.234,56,78")).toEqual({ ok: false, problem: "kein Betragsformat" });
  });

  it("lehnt eine Mischform mit falscher Gruppierung oder leerer Nachkommastelle ab", () => {
    expect(parseAmountToCents("1234.567,89")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("1.234,")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents(".234,56")).toEqual({ ok: false, problem: "kein Betragsformat" });
  });

  it("lehnt eine Mischform mit mehr als zwei Nachkommastellen ab", () => {
    expect(parseAmountToCents("1.234,5678")).toEqual({
      ok: false,
      problem: "mehr als zwei Nachkommastellen",
    });
  });

  it("lehnt eine unsaubere Gruppierung ab", () => {
    expect(parseAmountToCents("1.23.456,78")).toEqual({
      ok: false,
      problem: "kein Betragsformat",
    });
    expect(parseAmountToCents("12.34.567")).toEqual({ ok: false, problem: "kein Betragsformat" });
  });
});

describe("parseAmountToCents, was ausdrücklich nicht geraten wird", () => {
  it("lehnt die mehrdeutige Form mit drei Nachkommastellen ab", () => {
    // "1.234" kann 1234 oder 1,234 bedeuten. Beides wäre eine Annahme über Geld.
    expect(parseAmountToCents("1.234")).toEqual({
      ok: false,
      problem: "mehrdeutiges Trennzeichen",
    });
    expect(parseAmountToCents("1,234")).toEqual({
      ok: false,
      problem: "mehrdeutiges Trennzeichen",
    });
  });

  it("rundet niemals still", () => {
    expect(parseAmountToCents("12.3456")).toEqual({
      ok: false,
      problem: "mehr als zwei Nachkommastellen",
    });
    expect(parseAmountToCents("1.234,567")).toEqual({
      ok: false,
      problem: "mehr als zwei Nachkommastellen",
    });
  });

  it("lehnt leere, unvollständige und fremde Eingaben ab", () => {
    expect(parseAmountToCents("")).toEqual({ ok: false, problem: "leer" });
    expect(parseAmountToCents("   ")).toEqual({ ok: false, problem: "leer" });
    expect(parseAmountToCents("-")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("12.")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("12 34")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("12,34 EUR")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("abc")).toEqual({ ok: false, problem: "kein Betragsformat" });
    expect(parseAmountToCents("1e3")).toEqual({ ok: false, problem: "kein Betragsformat" });
  });

  it("lehnt ab, was die Ganzzahlgenauigkeit verlässt", () => {
    const tooLarge = `${String(Number.MAX_SAFE_INTEGER)}0.00`;
    expect(parseAmountToCents(tooLarge)).toEqual({
      ok: false,
      problem: "zu groß für eine verlustfreie Ganzzahl",
    });
  });

  it("nimmt den größten noch verlustfreien Betrag an", () => {
    const limit = formatCents(MAX_SAFE_CENTS - 1);
    expect(amountToCents(limit)).toBe(MAX_SAFE_CENTS - 1);
  });
});

describe("formatCents", () => {
  it("schreibt immer zwei Nachkommastellen, ohne zu dividieren", () => {
    expect(formatCents(88465)).toBe("884.65");
    expect(formatCents(-19244)).toBe("-192.44");
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(-5)).toBe("-0.05");
    expect(formatCents(100)).toBe("1.00");
  });

  it("weist eine Gleitkommazahl zurück", () => {
    expect(() => formatCents(884.65)).toThrow(/Ganzzahl-Cent/);
  });
});

describe("sumCents und compareCents", () => {
  it("summiert in Ganzzahl-Cent", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([88465, -19244, 705])).toBe(69926);
  });

  it("summiert 0,1 plus 0,2 ohne Gleitkommafehler", () => {
    expect(formatCents(sumCents([10, 20]))).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("weist Gleitkomma und Überlauf zurück", () => {
    expect(() => sumCents([1.5])).toThrow(/Ganzzahl-Cent/);
    expect(() => sumCents([MAX_SAFE_CENTS, 1])).toThrow(/verlustfreien Ganzzahlbereich/);
  });

  it("vergleicht ohne Gleitkomma", () => {
    expect(compareCents(1, 2)).toBe(-1);
    expect(compareCents(2, 1)).toBe(1);
    expect(compareCents(2, 2)).toBe(0);
  });
});

describe("amountStringToApiNumber, die Umwandlung am Rand (Plan 4.5)", () => {
  it("erzeugt die JSON-Zahl, die die API erwartet", () => {
    expect(amountStringToApiNumber("884.65")).toBe(884.65);
    expect(amountStringToApiNumber("-192.44")).toBe(-192.44);
    expect(amountStringToApiNumber("1190.00")).toBe(1190);
  });

  it("überlebt die JSON-Kodierung ohne Centverlust", () => {
    // Die Zahl geht als JSON hinaus. Entscheidend ist nicht die Schreibweise, sondern dass
    // der zurückgelesene Wert denselben Centbetrag trägt.
    for (const raw of ["884.65", "0.07", "1190.00", "-192.44", "19.99", "0.01", "99999.99"]) {
      const converted = amountStringToApiNumber(raw);
      expect(converted).not.toBeNull();
      const serialized = JSON.stringify(converted) ?? "";
      expect(amountToCents(serialized)).toBe(amountToCents(raw));
    }
  });

  it("liefert null, wo der Betrag nicht eindeutig ist", () => {
    expect(amountStringToApiNumber("1.234")).toBeNull();
    expect(amountStringToApiNumber("")).toBeNull();
  });
});
