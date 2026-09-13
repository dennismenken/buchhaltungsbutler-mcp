import { describe, expect, it } from "vitest";

import { centsFieldName, centsOf, coerceField, coerceRecord } from "../../src/mapping/coerce.js";
import {
  aggregateWarnings,
  contractWarningLine,
  contractWarningLogLine,
  seenTypeOf,
  warningsForStructuredContent,
} from "../../src/mapping/contract-violation.js";
import type { ContractFieldType } from "../../src/registry/types.js";
import { RECEIPTS_LIST_FIELDS } from "../golden/entries.js";
import { goldenRows } from "../golden/index.js";

// Plan 9.5: 100 Prozent Zweigabdeckung, weil hier stille Datenfehler entstehen. Geprüft werden
// alle sieben Vertragstypen aus Plan 2.1 in jeder Lage, die Plan 7.4 nennt.

describe("coerceField, Beträge (Plan 7.4, Streitfrage S9)", () => {
  it("behält die Zeichenkette und ergänzt den Centwert", () => {
    const result = coerceField("amount", "amount-string", "884.65");
    expect(result.value).toBe("884.65");
    expect(typeof result.value).toBe("string");
    expect(result.extra).toEqual({ name: "amount_cents", value: 88465 });
    expect(result.warning).toBeUndefined();
  });

  it("erzeugt niemals ein number-Betragsfeld, auch nicht bei einer gelieferten Zahl", () => {
    const result = coerceField("amount", "amount-string", 884.65);
    expect(result.value).toBe(884.65);
    expect(result.extra).toBeUndefined();
    expect(result.warning).toEqual({ field: "amount", expected: "amount-string", seen: "number" });
  });

  it("meldet eine Zeichenkette, die kein eindeutiger Betrag ist, und reicht sie durch", () => {
    const result = coerceField("amount", "amount-string", "1.234");
    expect(result.value).toBe("1.234");
    expect(result.extra).toBeUndefined();
    expect(result.warning?.seen).toContain("mehrdeutiges Trennzeichen");
  });
});

describe("coerceField, Booleans aus Zeichenketten", () => {
  it('macht aus "0" und "1" echte Booleans', () => {
    expect(coerceField("deleted", "bool-string", "0").value).toBe(false);
    expect(coerceField("deleted", "bool-string", "1").value).toBe(true);
    expect(coerceField("deleted", "bool-string", "0").warning).toBeUndefined();
  });

  it('nimmt auch "true" und "false" und lässt eine echte Boolean stehen', () => {
    expect(coerceField("fixed", "bool-string", "true").value).toBe(true);
    expect(coerceField("fixed", "bool-string", "FALSE").value).toBe(false);
    expect(coerceField("fixed", "bool-string", true).value).toBe(true);
    expect(coerceField("fixed", "bool-string", false).value).toBe(false);
    expect(coerceField("fixed", "bool-string", false).warning).toBeUndefined();
  });

  it("deutet nichts anderes und meldet es", () => {
    const two = coerceField("deleted", "bool-string", "2");
    expect(two.value).toBe("2");
    expect(two.warning?.seen).toContain("weder 0 noch 1");

    const empty = coerceField("deleted", "bool-string", "");
    expect(empty.value).toBe("");
    expect(empty.warning).toBeDefined();

    const num = coerceField("deleted", "bool-string", 0);
    // Eine Falsy-Prüfung würde hier aus 0 ein false machen. Das wäre geraten.
    expect(num.value).toBe(0);
    expect(num.warning).toEqual({ field: "deleted", expected: "bool-string", seen: "number" });
  });
});

describe("coerceField, Kennungen (Streitfrage S10)", () => {
  it("liefert eine Kennung immer als String, aus beiden gemessenen Formen", () => {
    // Gemessen: receipts liefert "2", transactions 1590 (Plan 0.3 Befund L3).
    expect(coerceField("id_by_customer", "id-string", "2").value).toBe("2");
    expect(coerceField("id_by_customer", "id-string", 1590).value).toBe("1590");
    expect(coerceField("id_by_customer", "id-string", 1590).warning).toBeUndefined();
  });

  it("meldet eine Kennung mit Nachkommastellen, ohne sie zu runden", () => {
    const result = coerceField("id_by_customer", "id-string", 2.5);
    expect(result.value).toBe(2.5);
    expect(result.warning?.seen).toContain("keine ganze Zahl");
  });

  it("meldet eine Kennung, die weder Zahl noch Zeichenkette ist", () => {
    const result = coerceField("id_by_customer", "id-string", true);
    expect(result.warning).toEqual({
      field: "id_by_customer",
      expected: "id-string",
      seen: "boolean",
    });
  });
});

describe("coerceField, die übrigen Typen und null", () => {
  const cases: readonly [ContractFieldType, unknown, boolean][] = [
    ["string", "Text", false],
    ["string", 5, true],
    ["string", true, true],
    ["number", 5, false],
    ["number", "5", true],
    ["number", Number.POSITIVE_INFINITY, true],
    ["boolean", true, false],
    ["boolean", "1", true],
    ["null-or-string", "Text", false],
    ["null-or-string", 5, true],
  ];

  it.each(cases)("%s mit %o: Warnung erwartet %s", (type, value, expectsWarning) => {
    const result = coerceField("feld", type, value);
    expect(result.value).toEqual(value);
    expect(result.warning !== undefined).toBe(expectsWarning);
  });

  it("trägt null an jedem Typ unverändert und ohne Warnung", () => {
    const types: ContractFieldType[] = [
      "string",
      "number",
      "boolean",
      "null-or-string",
      "amount-string",
      "bool-string",
      "id-string",
    ];
    for (const type of types) {
      const result = coerceField("feld", type, null);
      expect(result.value).toBeNull();
      expect(result.warning).toBeUndefined();
      expect(result.extra).toBeUndefined();
    }
  });

  it("meldet ein fehlendes Feld und nimmt es nicht in die Antwort", () => {
    const result = coerceField("due_date", "null-or-string", undefined);
    expect(result.present).toBe(false);
    expect(result.warning).toEqual({
      field: "due_date",
      expected: "null-or-string",
      seen: "fehlt",
    });
  });
});

describe("coerceRecord gegen die gemessene Belegzeile", () => {
  it("typisiert die 16 bekannten Felder und ergänzt die Centwerte", () => {
    const [row] = goldenRows("receipts-get-list");
    const result = coerceRecord(RECEIPTS_LIST_FIELDS, row);

    expect(result.warnings).toEqual([]);
    expect(result.unknownFields).toEqual([]);
    expect(result.values.id_by_customer).toBe("4711");
    expect(result.values.amount).toBe("884.65");
    expect(result.values[centsFieldName("amount")]).toBe(88465);
    expect(result.values.amount_paid_cents).toBe(0);
    expect(result.values.deleted).toBe(false);
    expect(result.values.delivery_date).toBeNull();
    expect(result.values.due_date).toBeNull();
  });

  it("reicht ein unbekanntes Feld unverändert durch und zählt es (Befund L4)", () => {
    const [row] = goldenRows("receipts-get-list-unknown-field");
    const result = coerceRecord(RECEIPTS_LIST_FIELDS, row);

    expect(result.unknownFields).toEqual(["provider_new_field"]);
    expect(result.values.provider_new_field).toBe("etwas Neues vom Anbieter");
    expect(result.warnings).toEqual([]);
  });

  it("meldet fehlendes Feld, falschen Typ und unbekannten Boolean zugleich", () => {
    const [row] = goldenRows("receipts-get-list-contract-violation");
    const result = coerceRecord(RECEIPTS_LIST_FIELDS, row);

    const fieldNames = result.warnings.map((warning) => warning.field);
    expect(fieldNames).toContain("amount");
    expect(fieldNames).toContain("due_date");
    expect(fieldNames).toContain("deleted");
    // Die Antwort wird trotzdem geliefert: Die übrigen Werte stehen da.
    expect(result.values.counterparty).toBe("Erfundene Bürobedarf GmbH");
    expect(result.values.amount_cents).toBeUndefined();
  });

  it("hält die Reihenfolge: Vertragsfelder zuerst, unbekannte danach", () => {
    const result = coerceRecord(
      { a: "string", b: "string" },
      { b: "zwei", z: "unbekannt", a: "eins" },
    );
    expect(Object.keys(result.values)).toEqual(["a", "b", "z"]);
  });
});

describe("centsOf", () => {
  it("liest den Centwert aus dem Centfeld", () => {
    expect(centsOf({ amount: "884.65", amount_cents: 88465 }, "amount")).toBe(88465);
  });

  it("rechnet aus der Zeichenkette, wenn das Centfeld fehlt", () => {
    expect(centsOf({ amount: "884.65" }, "amount")).toBe(88465);
  });

  it("liefert null, wo kein Betrag steht", () => {
    expect(centsOf({ amount: null }, "amount")).toBeNull();
    expect(centsOf({}, "amount")).toBeNull();
    expect(centsOf({ amount: 884.65 }, "amount")).toBeNull();
  });
});

describe("contract-violation: Zusammenfassung und Meldetexte (Plan 7.3)", () => {
  it("benennt jeden gesehenen Typ", () => {
    expect(seenTypeOf(undefined)).toBe("fehlt");
    expect(seenTypeOf(null)).toBe("null");
    expect(seenTypeOf([])).toBe("array");
    expect(seenTypeOf({})).toBe("object");
    expect(seenTypeOf("x")).toBe("string");
    expect(seenTypeOf(1)).toBe("number");
    expect(seenTypeOf(Number.NaN)).toBe("number (nicht endlich)");
    expect(seenTypeOf(true)).toBe("boolean");
    // Typen, die in einer JSON-Antwort nicht vorkommen können, werden trotzdem benannt
    // statt verschwiegen.
    expect(seenTypeOf(() => 0)).toBe("function");
    expect(seenTypeOf(10n)).toBe("bigint");
  });

  it("fasst gleichlautende Abweichungen zusammen und zählt die Zeilen", () => {
    const rawWarnings = [
      { field: "due_date", expected: "null-or-string", seen: "fehlt" },
      { field: "due_date", expected: "null-or-string", seen: "fehlt" },
      { field: "amount", expected: "amount-string", seen: "number" },
    ];
    const aggregated = aggregateWarnings(rawWarnings);
    expect(aggregated).toHaveLength(2);
    expect(aggregated[0]).toEqual({ warning: rawWarnings[0], rows: 2 });
    expect(aggregated[1]?.rows).toBe(1);
    // Nach außen gehen genau die drei Schlüssel aus Plan 7.3.
    expect(warningsForStructuredContent(aggregated).map((w) => Object.keys(w))).toEqual([
      ["field", "expected", "seen"],
      ["field", "expected", "seen"],
    ]);
  });

  it("unterscheidet Abweichungen, deren Feldname ein Trennzeichen enthalten könnte", () => {
    // Der Schlüssel entsteht über JSON und nicht über ein Trennzeichen; ein Feldname, der
    // selbst eines enthielte, führte sonst zwei verschiedene Abweichungen zusammen. Das
    // Zeichen wird aus seinem Codepunkt gebaut und steht nicht wörtlich in dieser Datei.
    const separator = String.fromCodePoint(0x00);
    const aggregated = aggregateWarnings([
      { field: "a", expected: "b", seen: "c" },
      { field: `a${separator}b`, expected: "c", seen: "d" },
      { field: "a", expected: `b${separator}c`, seen: "d" },
    ]);
    expect(aggregated).toHaveLength(3);
  });

  it("schreibt eine Warnzeile, die die Antwort nicht für falsch erklärt", () => {
    const line = contractWarningLine(
      aggregateWarnings([{ field: "due_date", expected: "null-or-string", seen: "fehlt" }]),
      37,
    );
    expect(line).toContain("ACHTUNG");
    expect(line).toContain("due_date: erwartet null-or-string, geliefert fehlt");
    expect(line).toContain("in 1 von 37 Zeilen");
    expect(line).toContain("Die Antwort wird trotzdem geliefert");
  });

  it("beugt die Zeilenangabe richtig, auch bei genau einer Zeile", () => {
    const line = contractWarningLine(
      aggregateWarnings([{ field: "amount", expected: "amount-string", seen: "number" }]),
      1,
    );
    expect(line).toContain("in 1 von 1 Zeile)");
    expect(line).not.toContain("von 1 Zeilen");
  });

  it("lässt die Zeilenangabe beim Einzelobjekt weg", () => {
    const line = contractWarningLine(
      aggregateWarnings([{ field: "vat", expected: "string", seen: "number" }]),
      null,
    );
    expect(line).not.toContain("Zeilen");
    expect(line).toContain("1 Abweichung)");
  });

  it("liefert für keine Abweichung auch keine Zeile", () => {
    expect(contractWarningLine([], 10)).toBe("");
  });

  it("schreibt eine stderr-Zeile ohne Werte", () => {
    const line = contractWarningLogLine(
      "bb_receipts_search",
      "/receipts/get",
      aggregateWarnings([{ field: "due_date", expected: "null-or-string", seen: "fehlt" }]),
    );
    expect(line).toBe(
      "bb_receipts_search /receipts/get: Antwortvertrag verletzt: due_date (null-or-string → fehlt)",
    );
  });
});
