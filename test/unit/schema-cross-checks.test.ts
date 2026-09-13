// Q1 bis Q9, je mit einem positiven und einem negativen Testfall.
//
// Geprüft wird jede Prüfung an einem Werkzeug, dem sie in der Spalte „Betroffen" der Tabelle
// zugeordnet ist. Die Schemata hier sind bewusst schlank: Geprüft wird die
// Querprüfung und nicht noch einmal der Registereintrag.

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CROSS_CHECKS,
  applyCrossChecks,
  type CrossCheckTool,
} from "../../src/schema/cross-checks.js";
import { boundedText, strictObject } from "../../src/schema/primitives.js";
import { limit, offset } from "../../src/schema/pagination.js";
import { receiptsOrder, postingsOrder } from "../../src/schema/order.js";
import { date } from "../../src/schema/vocab.js";
import type { CrossCheckId } from "../../src/registry/types.js";

function tool(toolName: string, specPath: string, maxItems = 50): CrossCheckTool {
  return { toolName, specPath, maxItems };
}

function messagesOf(result: z.ZodSafeParseResult<unknown>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("Q1 date_from <= date_to", () => {
  const schema = applyCrossChecks(
    strictObject({
      date_from: date("Beginn des Zeitraums").optional(),
      date_to: date("Ende des Zeitraums").optional(),
    }),
    ["Q1"],
    tool("bb_reports_create_bwa", "/reports/create/bwa"),
  );

  it("nimmt einen Zeitraum in der richtigen Reihenfolge an", () => {
    expect(schema.safeParse({ date_from: "2026-01-01", date_to: "2026-03-31" }).success).toBe(true);
    expect(schema.safeParse({ date_from: "2026-01-01", date_to: "2026-01-01" }).success).toBe(true);
    expect(schema.safeParse({ date_to: "2026-03-31" }).success).toBe(true);
  });

  it("lehnt vertauschte Grenzen ab", () => {
    const result = schema.safeParse({ date_from: "2026-03-31", date_to: "2026-01-01" });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("date_from (2026-03-31) liegt nach date_to");
  });
});

describe("Q2 limit innerhalb des Maximums", () => {
  const schema = applyCrossChecks(
    strictObject({ limit: limit(500, 100), offset: offset() }),
    ["Q2"],
    tool("bb_receipts_search", "/receipts/get"),
  );

  it("nimmt ein limit innerhalb der Grenze an", () => {
    expect(schema.safeParse({ limit: 500 }).success).toBe(true);
  });

  it("lehnt ein zu großes limit ab und nennt die Grenze", () => {
    // Das Schema von pagination.ts fängt den Wert bereits ab; Q2 prüft denselben Wert an
    // einem Feld ohne maximum noch einmal und meldet die Grenze des Endpunkts.
    const loose = applyCrossChecks(
      strictObject({ limit: z.number().int() }),
      ["Q2"],
      tool("bb_receipts_search", "/receipts/get"),
    );
    const result = loose.safeParse({ limit: 600 });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("Obergrenze 500 von /receipts/get");
    expect(schema.safeParse({ limit: 600 }).success).toBe(false);
  });

  it("ist an einem Endpunkt ohne belegte Obergrenze nicht anwendbar", () => {
    expect(() =>
      applyCrossChecks(
        strictObject({ limit: limit(null, 100) }),
        ["Q2"],
        tool("bb_debtors_search", "/settings/get/debtors"),
      ),
    ).toThrow(/keine Obergrenze für limit dokumentiert/);
  });
});

describe("Q3 kein leerer String", () => {
  const schema = applyCrossChecks(
    strictObject({
      counterparty: z.string().optional(),
      positions: z.array(strictObject({ postingtext: z.string() })).optional(),
    }),
    ["Q3"],
    tool("bb_receipts_search", "/receipts/get"),
  );

  it("nimmt gefüllte Felder an", () => {
    expect(schema.safeParse({ counterparty: "Muster GmbH" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("lehnt den leeren String ab und nennt das Weglassen als Weg", () => {
    const result = schema.safeParse({ counterparty: "" });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("weglassen");
  });

  it("findet den leeren String auch in einer Position", () => {
    const result = schema.safeParse({ positions: [{ postingtext: "ok" }, { postingtext: "" }] });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("positions.1.postingtext");
  });
});

describe("Q4 Mengengrenze auf beiden Ebenen", () => {
  const schema = applyCrossChecks(
    strictObject({
      receipts: z.array(strictObject({ positions: z.array(z.string()).optional() })).optional(),
    }),
    ["Q4"],
    tool("bb_postings_create_for_receipt_batch", "/postings/add-batch/receipts", 2),
  );

  it("nimmt zwei Stapelelemente mit je zwei Positionen an", () => {
    expect(
      schema.safeParse({
        receipts: [{ positions: ["a", "b"] }, { positions: ["c", "d"] }],
      }).success,
    ).toBe(true);
  });

  it("lehnt einen zu langen Stapel ab", () => {
    const result = schema.safeParse({ receipts: [{}, {}, {}] });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("receipts enthält 3 Einträge");
  });

  it("lehnt eine zu lange Positionsliste innerhalb eines Elements positionsgenau ab", () => {
    const result = schema.safeParse({ receipts: [{}, { positions: ["a", "b", "c"] }] });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("Position 2 von receipts: positions");
  });

  it("summiert die beiden Ebenen nicht auf", () => {
    expect(
      schema.safeParse({
        receipts: [{ positions: ["a", "b"] }, { positions: ["c", "d"] }],
      }).success,
    ).toBe(true);
  });
});

describe("Q5 Betrag ungleich 0.00", () => {
  const schema = applyCrossChecks(
    strictObject({
      amount: z.string().optional(),
      receipts: z.array(strictObject({ amount: z.string() })).optional(),
    }),
    ["Q5"],
    tool("bb_receipts_create", "/receipts/add"),
  );

  it("nimmt einen Betrag ungleich null an, auch einen negativen", () => {
    expect(schema.safeParse({ amount: "123.99" }).success).toBe(true);
    expect(schema.safeParse({ amount: "-192.44" }).success).toBe(true);
  });

  it("lehnt 0.00 ab, auch in den Schreibweisen 0 und -0.00", () => {
    for (const value of ["0.00", "0", "-0.00", "0.0"]) {
      const result = schema.safeParse({ amount: value });
      expect(result.success, value).toBe(false);
      expect(messagesOf(result).join(" ")).toContain("für ungültig");
    }
  });

  it("prüft auch die Elemente eines Stapels", () => {
    const result = schema.safeParse({ receipts: [{ amount: "10.00" }, { amount: "0.00" }] });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("Position 2 von receipts");
  });
});

describe("Q6 date_delivery <= date", () => {
  const schema = applyCrossChecks(
    strictObject({
      date: date("Rechnungsdatum des Belegs").optional(),
      date_delivery: date("Leistungsdatum des Belegs").optional(),
      receipts: z
        .array(
          strictObject({
            date: date("Rechnungsdatum").optional(),
            date_delivery: date("Leistungsdatum").optional(),
          }),
        )
        .optional(),
    }),
    ["Q6"],
    tool("bb_receipts_create", "/receipts/add"),
  );

  it("nimmt ein Leistungsdatum vor oder am Belegdatum an", () => {
    expect(schema.safeParse({ date: "2026-04-26", date_delivery: "2026-04-20" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ date: "2026-04-26", date_delivery: "2026-04-26" }).success).toBe(
      true,
    );
  });

  it("lehnt ein Leistungsdatum nach dem Belegdatum ab und nennt DATEV", () => {
    const result = schema.safeParse({ date: "2026-04-20", date_delivery: "2026-04-26" });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("DATEV");
  });

  it("prüft auch die Elemente eines Stapels", () => {
    const result = schema.safeParse({
      receipts: [{ date: "2026-04-20", date_delivery: "2026-04-26" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("Q7 order je Endpunkt", () => {
  const receipts = applyCrossChecks(
    strictObject({ order: receiptsOrder().optional() }),
    ["Q7"],
    tool("bb_receipts_search", "/receipts/get"),
  );

  it("nimmt ein gefülltes Sortierobjekt an", () => {
    expect(receipts.safeParse({ order: { date: "ASC" } }).success).toBe(true);
    expect(receipts.safeParse({}).success).toBe(true);
  });

  it("lehnt ein leeres Sortierobjekt ab", () => {
    const result = receipts.safeParse({ order: {} });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("order ist leer");
  });

  it("lehnt an /postings/get einen Wert der anderen Form ab", () => {
    const postings = applyCrossChecks(
      strictObject({ order: z.string().optional() }),
      ["Q7"],
      tool("bb_postings_search", "/postings/get"),
    );
    expect(postings.safeParse({ order: "date ASC" }).success).toBe(true);
    const result = postings.safeParse({ order: "name ASC" });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain(
      "gehört nicht zur Sortierform von /postings/get",
    );
  });

  it("das Enum fängt die Schreibweise bereits vor der Querprüfung ab", () => {
    const postings = applyCrossChecks(
      strictObject({ order: postingsOrder().optional() }),
      ["Q7"],
      tool("bb_postings_search", "/postings/get"),
    );
    expect(postings.safeParse({ order: "date asc" }).success).toBe(false);
  });

  it("ist an einem Endpunkt ohne order nicht anwendbar", () => {
    expect(() =>
      applyCrossChecks(
        strictObject({}),
        ["Q7"],
        tool("bb_transactions_search", "/transactions/get"),
      ),
    ).toThrow(/keinen order-Parameter/);
  });
});

describe("Q8 item_tax_amount bei item_tax_type 'S'", () => {
  const schema = applyCrossChecks(
    strictObject({
      items: z.array(
        strictObject({
          item_tax_type: z.string(),
          item_tax_amount: z.string().optional(),
        }),
      ),
    }),
    ["Q8"],
    tool("bb_invoices_create_einvoice", "/invoices/create/e-invoice"),
  );

  it("nimmt 'S' mit Steuersatz und jede andere Steuerart ohne an", () => {
    expect(
      schema.safeParse({ items: [{ item_tax_type: "S", item_tax_amount: "19" }] }).success,
    ).toBe(true);
    expect(schema.safeParse({ items: [{ item_tax_type: "AE" }] }).success).toBe(true);
  });

  it("lehnt 'S' ohne Steuersatz positionsgenau ab", () => {
    const result = schema.safeParse({
      items: [{ item_tax_type: "Z" }, { item_tax_type: "S" }],
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain("Position 2: item_tax_type 'S'");
  });
});

describe("Q9 genau eine der beiden Kennungen von /comments/add", () => {
  const schema = applyCrossChecks(
    strictObject({
      comment_text: boundedText("Der Kommentartext"),
      receipt_id_by_customer: z.number().int().optional(),
      transaction_id_by_customer: z.number().int().optional(),
    }),
    ["Q9"],
    tool("bb_comments_create", "/comments/add"),
  );

  it("nimmt genau eine der beiden Kennungen an", () => {
    expect(
      schema.safeParse({ comment_text: "Beleg geklärt", receipt_id_by_customer: 142 }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ comment_text: "Zahlung geklärt", transaction_id_by_customer: 77 }).success,
    ).toBe(true);
  });

  it("lehnt den Aufruf ohne jede Kennung ab und nennt beide Feldnamen", () => {
    const result = schema.safeParse({ comment_text: "Ohne Ziel" });
    expect(result.success).toBe(false);
    const text = messagesOf(result).join(" ");
    expect(text).toContain("receipt_id_by_customer");
    expect(text).toContain("transaction_id_by_customer");
    expect(text).toContain("Gesetzt ist keine von beiden");
    expect(text).toContain("an die API ist nichts hinausgegangen");
  });

  it("lehnt den Aufruf mit beiden Kennungen ab und nennt beide Feldnamen", () => {
    const result = schema.safeParse({
      comment_text: "Zwei Ziele",
      receipt_id_by_customer: 142,
      transaction_id_by_customer: 77,
    });
    expect(result.success).toBe(false);
    const text = messagesOf(result).join(" ");
    expect(text).toContain("receipt_id_by_customer");
    expect(text).toContain("transaction_id_by_customer");
    expect(text).toContain("Gesetzt sind beide");
    expect(text).toContain("an die API ist nichts hinausgegangen");
  });
});

describe("Vollständigkeit und Verdrahtung", () => {
  it("führt genau Q1 bis Q9 und keine gestrichene Prüfung", () => {
    expect(Object.keys(CROSS_CHECKS)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "Q5",
      "Q6",
      "Q7",
      "Q8",
      "Q9",
    ]);
    for (const [id, check] of Object.entries(CROSS_CHECKS)) {
      expect(check.id).toBe(id);
      expect(check.summary.length).toBeGreaterThan(10);
    }
  });

  it("lässt ein Schema ohne Querprüfung unverändert", () => {
    const base = strictObject({ a: boundedText("A") });
    expect(applyCrossChecks(base, [], tool("bb_accounts", "/accounts/get"))).toBe(base);
  });

  it("lehnt eine doppelt genannte Querprüfung ab", () => {
    expect(() =>
      applyCrossChecks(
        strictObject({}),
        ["Q3", "Q3"] as CrossCheckId[],
        tool("bb_receipts_search", "/receipts/get"),
      ),
    ).toThrow(/doppelt/);
  });

  it("meldet mehrere verletzte Prüfungen in einem Durchgang", () => {
    const schema = applyCrossChecks(
      strictObject({
        date: date("Rechnungsdatum").optional(),
        date_delivery: date("Leistungsdatum").optional(),
        amount: z.string().optional(),
        counterparty: z.string().optional(),
      }),
      ["Q3", "Q5", "Q6"],
      tool("bb_receipts_create", "/receipts/add"),
    );
    const result = schema.safeParse({
      date: "2026-04-20",
      date_delivery: "2026-04-26",
      amount: "0.00",
      counterparty: "",
    });
    expect(result.success).toBe(false);
    expect(result.success ? 0 : result.error.issues.length).toBe(3);
  });
});
