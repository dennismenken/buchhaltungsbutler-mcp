import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ORDER_FORM_BY_PATH,
  POSTINGS_ORDER_VALUES,
  POSTING_ACCOUNTS_ORDER_VALUES,
  RECEIPTS_ORDER_FIELDS,
  postingAccountsOrder,
  postingsOrder,
  receiptsOrder,
} from "../../src/schema/order.js";

function jsonOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
}

describe("die drei Formen bleiben getrennt", () => {
  it("kennt genau drei Endpunkte mit order", () => {
    expect(Object.keys(ORDER_FORM_BY_PATH).sort()).toEqual([
      "/postings/get",
      "/receipts/get",
      "/settings/get/postingaccounts",
    ]);
  });

  it("/transactions/get führt ausdrücklich kein order", () => {
    expect(ORDER_FORM_BY_PATH["/transactions/get"]).toBeUndefined();
  });

  it("erzeugt drei verschiedene Schemaformen", () => {
    expect(jsonOf(receiptsOrder())["type"]).toBe("object");
    expect(jsonOf(postingsOrder())["type"]).toBe("string");
    expect(jsonOf(postingAccountsOrder())["type"]).toBe("string");
  });
});

describe("order an /receipts/get", () => {
  it("nimmt ein Objekt aus Sortierfeld und Richtung", () => {
    const schema = receiptsOrder();
    expect(schema.parse({ date: "ASC" })).toEqual({ date: "ASC" });
    expect(schema.parse({ date: "ASC", amount: "DESC" })).toEqual({ date: "ASC", amount: "DESC" });
  });

  it("führt genau die vier sortierbaren Felder und verwirft das Platzhalterschema", () => {
    expect([...RECEIPTS_ORDER_FIELDS]).toEqual([
      "date",
      "amount",
      "invoicenumber",
      "invoicingparty",
    ]);
    const properties = jsonOf(receiptsOrder())["properties"] as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual([...RECEIPTS_ORDER_FIELDS].sort());
    // Die Spezifikation führt hier eine einzige Eigenschaft namens `field`. Sie ist ein
    // Platzhalter und wird verworfen (Plan 4.8, Anhang B Punkt 47).
    expect(properties["field"]).toBeUndefined();
    expect(receiptsOrder().safeParse({ field: "ASC" }).success).toBe(false);
  });

  it("lehnt ein unbekanntes Sortierfeld und eine unbekannte Richtung ab", () => {
    expect(receiptsOrder().safeParse({ datum: "ASC" }).success).toBe(false);
    expect(receiptsOrder().safeParse({ date: "asc" }).success).toBe(false);
    expect(jsonOf(receiptsOrder())["additionalProperties"]).toBe(false);
  });
});

describe("order an /postings/get", () => {
  it("führt alle sieben Werte aus Plan 4.8, wörtlich", () => {
    expect([...POSTINGS_ORDER_VALUES]).toEqual([
      "default",
      "date ASC",
      "date DESC",
      "date_last_action ASC",
      "date_last_action DESC",
      "id_by_customer ASC",
      "id_by_customer DESC",
    ]);
    expect(jsonOf(postingsOrder())["enum"]).toEqual([...POSTINGS_ORDER_VALUES]);
  });

  it("nimmt jeden der sieben Werte an", () => {
    for (const value of POSTINGS_ORDER_VALUES) {
      expect(postingsOrder().safeParse(value).success, value).toBe(true);
    }
  });

  it("unterscheidet Groß- und Kleinschreibung, wie die API es tut", () => {
    expect(postingsOrder().safeParse("date asc").success).toBe(false);
    expect(postingsOrder().safeParse("DATE ASC").success).toBe(false);
    expect(postingsOrder().safeParse("Default").success).toBe(false);
  });

  it("lehnt einen Wert der anderen Form ab", () => {
    expect(postingsOrder().safeParse("name ASC").success).toBe(false);
  });
});

describe("order an /settings/get/postingaccounts", () => {
  it("führt die sechs Kombinationen", () => {
    expect([...POSTING_ACCOUNTS_ORDER_VALUES]).toHaveLength(6);
    expect(jsonOf(postingAccountsOrder())["enum"]).toEqual([...POSTING_ACCOUNTS_ORDER_VALUES]);
  });

  it("lehnt einen Wert der anderen Form ab", () => {
    expect(postingAccountsOrder().safeParse("date ASC").success).toBe(false);
    expect(postingAccountsOrder().safeParse("default").success).toBe(false);
    expect(postingAccountsOrder().safeParse("name DESC").success).toBe(true);
  });
});
