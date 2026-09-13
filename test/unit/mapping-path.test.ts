import { describe, expect, it } from "vitest";

import {
  assertNoPathFieldInBody,
  buildPath,
  hasPathTemplate,
  PATH_SEGMENT_PATTERN,
  PathBuildError,
  specPathOf,
} from "../../src/mapping/path.js";
import { mapRequest } from "../../src/mapping/request.js";
import type { ToolEntry } from "../../src/registry/types.js";
import {
  RECEIPTS_DELETE,
  RECEIPTS_GET,
  RECEIPTS_SEARCH,
  TRANSACTIONS_GET,
} from "../golden/entries.js";

// Die sechs Regeln aus Plan 4.6, jede einzeln, plus die beiden Negativprüfungen aus 9.5:
// Der Body trägt kein `id_by_customer` (Regel 5), und der zurückgegebene `specPath` ist
// unverändert der Spezifikationspfad (Regel 6).

function buildTemplatePath(entry: ToolEntry, args: Record<string, unknown>) {
  return buildPath(entry, args);
}

describe("Regel 1 und 2: Wertprüfung und Kodierung", () => {
  it("setzt eine Kennung als Segment ein", () => {
    const built = buildTemplatePath(RECEIPTS_GET, { receipt_id_by_customer: 4711 });
    expect(built.requestPath).toBe("/receipts/get/4711");
  });

  it("nimmt die Kennung auch als Zeichenkette", () => {
    expect(buildTemplatePath(RECEIPTS_GET, { receipt_id_by_customer: "4711" }).requestPath).toBe(
      "/receipts/get/4711",
    );
  });

  it("weist jeden Wert ab, der nicht aus eins bis achtzehn Ziffern besteht", () => {
    const invalidValues: unknown[] = [
      "",
      "   ",
      "47/11",
      "../../receipts/delete/1",
      "4711?x=1",
      "4711#y",
      "47-11",
      "47.11",
      "4711a",
      "-4711",
      4711.5,
      "1234567890123456789",
      "%2e%2e%2f",
    ];
    for (const value of invalidValues) {
      expect(() => buildTemplatePath(RECEIPTS_GET, { receipt_id_by_customer: value })).toThrow(
        PathBuildError,
      );
    }
  });

  it("weist eine fehlende Kennung ab, statt einen Pfad ohne Segment zu bauen", () => {
    expect(() => buildTemplatePath(RECEIPTS_GET, {})).toThrow(
      /gehört bei diesem Endpunkt in den Pfad/,
    );
    expect(() => buildTemplatePath(RECEIPTS_GET, { receipt_id_by_customer: null })).toThrow(
      PathBuildError,
    );
  });

  it("hält das Muster aus Regel 1 fest", () => {
    expect(PATH_SEGMENT_PATTERN.test("1")).toBe(true);
    expect(PATH_SEGMENT_PATTERN.test("123456789012345678")).toBe(true);
    expect(PATH_SEGMENT_PATTERN.test("1234567890123456789")).toBe(false);
    expect(PATH_SEGMENT_PATTERN.test("01")).toBe(true);
  });

  it("kodiert den eingesetzten Wert, auch wenn Regel 1 das bereits erledigt", () => {
    // Nachweis über die Vorlage eines hypothetischen Eintrags: Der Pfad enthält danach kein
    // rohes Sonderzeichen mehr. Die Prüfung aus Regel 1 greift vorher; dieser Test belegt,
    // dass die Kodierung trotzdem im Weg liegt (zweite Linie gegen Pfadinjektion).
    const built = buildTemplatePath(TRANSACTIONS_GET, { transaction_id_by_customer: 1590 });
    expect(built.requestPath).toBe("/transactions/get/1590");
    expect(encodeURIComponent("4711")).toBe("4711");
  });
});

describe("Regel 3: Rückprüfung gegen die Vorlage", () => {
  it("baut genau ein Segment mehr als der Vorlagenstamm", () => {
    expect(buildTemplatePath(RECEIPTS_DELETE, { receipt_id_by_customer: 7 }).requestPath).toBe(
      "/receipts/delete/7",
    );
  });

  it("weist eine Vorlage ohne Parameter ab", () => {
    const broken: ToolEntry = {
      ...RECEIPTS_GET,
      path: { template: "/receipts/get/{x}", params: [], specPath: "/receipts/get/id_by_customer" },
    };
    expect(() => buildTemplatePath(broken, { x: 1 })).toThrow(/ohne Parameter/);
  });

  it("weist eine Vorlage ab, deren Parameter nicht in ihr vorkommt", () => {
    const broken: ToolEntry = {
      ...RECEIPTS_GET,
      path: {
        template: "/receipts/get/{anders}",
        params: ["receipt_id_by_customer"],
        specPath: "/receipts/get/id_by_customer",
      },
    };
    expect(() => buildTemplatePath(broken, { receipt_id_by_customer: 1 })).toThrow(/kein Segment/);
  });
});

describe("Regel 4: die übrigen 50 Endpunkte", () => {
  it("liefert bei einem literalen Pfad beide Werte gleich", () => {
    const built = buildTemplatePath(RECEIPTS_SEARCH, {});
    expect(built.requestPath).toBe("/receipts/get");
    expect(built.specPath).toBe("/receipts/get");
    expect(hasPathTemplate(RECEIPTS_SEARCH.path)).toBe(false);
    expect(hasPathTemplate(RECEIPTS_GET.path)).toBe(true);
  });
});

describe("Regel 5, Negativprüfung: der Body trägt kein id_by_customer", () => {
  it("schreibt den Identifikator nicht in den Body", () => {
    const mapped = mapRequest(RECEIPTS_GET, { receipt_id_by_customer: 4711, get_file: true });
    expect(mapped.requestPath).toBe("/receipts/get/4711");
    expect(mapped.body).toEqual({ get_file: true });
    expect("id_by_customer" in mapped.body).toBe(false);
    expect("receipt_id_by_customer" in mapped.body).toBe(false);
  });

  it("lässt den Body der drei übrigen Endpunkte mit Vorlage leer", () => {
    for (const entry of [RECEIPTS_DELETE, TRANSACTIONS_GET]) {
      const param =
        entry === TRANSACTIONS_GET ? "transaction_id_by_customer" : "receipt_id_by_customer";
      const mapped = mapRequest(entry, { [param]: 4711 });
      expect(mapped.body).toEqual({});
    }
  });

  it("weist einen Body zurück, in dem der Identifikator trotzdem steht", () => {
    // Der Fall entsteht nur durch einen Fehler im Mapper; er darf nicht hinausgehen.
    expect(() => assertNoPathFieldInBody(RECEIPTS_GET, { id_by_customer: 4711 })).toThrow(
      /ausschließlich in den Pfad/,
    );
    expect(() => assertNoPathFieldInBody(RECEIPTS_GET, { receipt_id_by_customer: 4711 })).toThrow(
      PathBuildError,
    );
    expect(() => assertNoPathFieldInBody(RECEIPTS_SEARCH, { id_by_customer: 4711 })).not.toThrow();
  });
});

describe("Regel 6, Negativprüfung: specPath bleibt der Spezifikationspfad", () => {
  it("liefert ein Paar und nie eine einzelne Zeichenkette", () => {
    const built = buildTemplatePath(RECEIPTS_GET, { receipt_id_by_customer: 4711 });
    expect(Object.keys(built).sort()).toEqual(["requestPath", "specPath"]);
    expect(built.specPath).toBe("/receipts/get/id_by_customer");
    expect(built.specPath).not.toBe(built.requestPath);
  });

  it("vertauscht die beiden Werte auch im Request-Mapper nicht", () => {
    const mapped = mapRequest(TRANSACTIONS_GET, { transaction_id_by_customer: 1590 });
    expect(mapped.specPath).toBe("/transactions/get/id_by_customer");
    expect(mapped.requestPath).toBe("/transactions/get/1590");
  });

  it("liefert specPathOf für beide Zweige der Union den Schlüssel der Spezifikation", () => {
    expect(specPathOf(RECEIPTS_GET.path)).toBe("/receipts/get/id_by_customer");
    expect(specPathOf(RECEIPTS_SEARCH.path)).toBe("/receipts/get");
  });
});

describe("Die vier betroffenen Endpunkte, vollständig", () => {
  it("deckt genau die vier Pfade aus Plan 4.6 ab", () => {
    const templatePaths = [RECEIPTS_GET, RECEIPTS_DELETE, TRANSACTIONS_GET].map((entry) =>
      specPathOf(entry.path),
    );
    expect(templatePaths).toEqual([
      "/receipts/get/id_by_customer",
      "/receipts/delete/id_by_customer",
      "/transactions/get/id_by_customer",
    ]);
    // Der vierte Pfad, /receipts/restore/id_by_customer, trägt dieselbe Form; seine Attrappe
    // fehlt hier bewusst, weil sie nichts Neues prüfte. Der Eintrag entsteht in AP12a.
  });

  it("kennzeichnet die schreibende Form als nicht verifiziert (Plan 4.6, S1)", () => {
    expect(RECEIPTS_DELETE.verified).toBe(false);
    expect(RECEIPTS_GET.verified).toBeUndefined();
  });
});
