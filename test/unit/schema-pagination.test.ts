import { describe, expect, it } from "vitest";
import { z } from "zod";

import { strictObject } from "../../src/schema/primitives.js";
import {
  PAGINATION_BY_PATH,
  UNDOCUMENTED_LIMIT_SENTENCE,
  hasPagination,
  limit,
  limitMaximumFor,
  offset,
  paginationFor,
} from "../../src/schema/pagination.js";

function jsonOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
}

function property(schema: z.ZodType, name: string): Record<string, unknown> {
  const properties = jsonOf(schema)["properties"] as Record<string, Record<string, unknown>>;
  return properties[name];
}

describe("die sieben Endpunkte mit limit und offset", () => {
  it("führt genau die sieben", () => {
    expect(Object.keys(PAGINATION_BY_PATH).sort()).toEqual(
      [
        "/cost-locations/get",
        "/postings/get",
        "/receipts/get",
        "/settings/get/creditors",
        "/settings/get/debtors",
        "/settings/get/postingaccounts",
        "/transactions/get",
      ].sort(),
    );
  });

  it("trägt die belegten Obergrenzen und bei den drei settings-Listen keine", () => {
    expect(limitMaximumFor("/receipts/get")).toBe(500);
    expect(limitMaximumFor("/transactions/get")).toBe(500);
    expect(limitMaximumFor("/postings/get")).toBe(1000);
    expect(limitMaximumFor("/cost-locations/get")).toBe(1000);
    expect(limitMaximumFor("/settings/get/debtors")).toBeNull();
    expect(limitMaximumFor("/settings/get/creditors")).toBeNull();
    expect(limitMaximumFor("/settings/get/postingaccounts")).toBeNull();
  });

  it("meldet für jeden anderen Pfad keine Paginierung", () => {
    expect(hasPagination("/accounts/get")).toBe(false);
    expect(limitMaximumFor("/accounts/get")).toBeNull();
    expect(() => paginationFor("/accounts/get")).toThrow(/kein limit und kein offset/);
  });

  it("trägt konservative Vorgaben unterhalb der API-Vorgabe", () => {
    expect(PAGINATION_BY_PATH["/receipts/get"]?.limitDefault).toBe(100);
    expect(PAGINATION_BY_PATH["/receipts/get"]?.apiDefault).toBe(500);
    expect(PAGINATION_BY_PATH["/settings/get/debtors"]?.apiDefault).toBe(25);
    expect(PAGINATION_BY_PATH["/settings/get/postingaccounts"]?.limitDefault).toBe(200);
  });
});

describe("limit", () => {
  it("setzt maximum und default, wenn eine Obergrenze belegt ist", () => {
    const json = property(strictObject({ limit: limit(500, 100) }), "limit");
    expect(json["type"]).toBe("integer");
    expect(json["minimum"]).toBe(1);
    expect(json["maximum"]).toBe(500);
    expect(json["default"]).toBe(100);
    expect(String(json["description"])).toContain("Harte Obergrenze 500");
  });

  it("setzt kein endpunktspezifisches maximum, wenn keine Grenze belegt ist", () => {
    const json = property(strictObject({ limit: limit(null, 100) }), "limit");
    // Zod setzt an jeder Ganzzahl die Grenze des JavaScript-Zahlentyps. Das ist keine
    // Aussage über den Endpunkt und kann keinen Aufruf abweisen, den die API annähme.
    expect(json["maximum"]).toBe(Number.MAX_SAFE_INTEGER);
    expect(String(json["description"])).toContain(UNDOCUMENTED_LIMIT_SENTENCE);
  });

  it("ersetzt die JavaScript-Grenze, sobald eine Obergrenze belegt ist", () => {
    const json = property(strictObject({ limit: limit(1000, 200) }), "limit");
    expect(json["maximum"]).toBe(1000);
  });

  it("lehnt 0 und einen Wert über dem Maximum ab", () => {
    const schema = limit(500, 100);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(501).success).toBe(false);
    expect(schema.safeParse(500).success).toBe(true);
  });

  // Kein Listenaufruf geht ohne ausdrückliches `limit` hinaus; die Vorgabe steht im Schema.
  it("setzt die Vorgabe ein, wenn der Aufrufer nichts schickt", () => {
    expect(strictObject({ limit: limit(500, 100) }).parse({})).toEqual({ limit: 100 });
  });
});

describe("offset", () => {
  it("beginnt bei 0 und lehnt negative Werte ab", () => {
    const json = property(strictObject({ offset: offset() }), "offset");
    expect(json["minimum"]).toBe(0);
    expect(json["default"]).toBe(0);
    expect(offset().safeParse(-1).success).toBe(false);
  });

  it("nennt das Beispiel", () => {
    expect(offset().description ?? "").toContain("offset=100");
  });
});

describe("paginationFor", () => {
  it("liefert das Paar mit den Zahlen des Endpunkts", () => {
    const { limit: limitSchema, offset: offsetSchema } = paginationFor("/postings/get");
    const schema = strictObject({ limit: limitSchema, offset: offsetSchema });
    expect(schema.parse({})).toEqual({ limit: 100, offset: 0 });
    expect(property(schema, "limit")["maximum"]).toBe(1000);
  });
});
