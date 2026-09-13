import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  BATCH_CONTAINERS,
  assignmentItem,
  assignments,
  batchArray,
  batchContainer,
  batchContainerSpec,
  batchSizeSentence,
} from "../../src/schema/batch.js";
import { boundedText, schemaKind, strictObject } from "../../src/schema/primitives.js";

const ELEMENT = strictObject({ name: boundedText("Name des Datensatzes.") });

function jsonOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
}

describe("die acht Stapelendpunkte", () => {
  it("führt genau acht Einträge", () => {
    expect(Object.keys(BATCH_CONTAINERS)).toHaveLength(8);
  });

  it("nennt je Eintrag Behälter- und Elementdefinition getrennt", () => {
    expect(batchContainerSpec("bb_receipts_create_batch")).toMatchObject({
      field: "receipts",
      apiName: "receipts",
      specPath: "/receipts/addBatch",
      containerDefinition: "Receipts",
      itemDefinition: "Receipt",
      itemProperties: 13,
    });
    expect(batchContainerSpec("bb_postings_create_for_receipt_batch")).toMatchObject({
      containerDefinition: "ReceiptsPostings",
      itemDefinition: "ReceiptPostings",
      itemProperties: 9,
    });
  });

  it("führt PostingsFree als den einen Fall ohne eigene Elementdefinition", () => {
    const inline = Object.values(BATCH_CONTAINERS).filter((spec) => spec.itemDefinition === null);
    expect(inline).toHaveLength(1);
    expect(inline[0]?.containerDefinition).toBe("PostingsFree");
  });

  it("benennt genau einen Behälter um", () => {
    const renamed = Object.values(BATCH_CONTAINERS).filter((spec) => spec.field !== spec.apiName);
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatchObject({
      field: "assignments",
      apiName: "transactions_to_receipts",
    });
  });

  it("unterscheidet die belegte Obergrenze von der übernommenen", () => {
    const documented = Object.values(BATCH_CONTAINERS).filter((spec) => spec.maxDocumented);
    expect(documented.map((spec) => spec.specPath).sort()).toEqual([
      "/receipts/addBatch",
      "/transactions/addBatch",
      "/transactions/assign-batch/receipt",
    ]);
  });

  it("wirft bei einem Werkzeug ohne Stapelbehälter", () => {
    expect(() => batchContainerSpec("bb_receipts_create")).toThrow(/keinen Stapelbehälter/);
  });
});

describe("batchArray", () => {
  it("verlangt mindestens einen Eintrag und begrenzt nach oben", () => {
    const schema = batchArray(ELEMENT, { description: "Die Datensätze.", maxItems: 2 });
    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse([{ name: "a" }, { name: "b" }]).success).toBe(true);
    expect(schema.safeParse([{ name: "a" }, { name: "b" }, { name: "c" }]).success).toBe(false);
    const json = jsonOf(schema);
    expect(json["minItems"]).toBe(1);
    expect(json["maxItems"]).toBe(2);
  });

  it("ist als Stapel markiert und nicht als Positionsliste", () => {
    expect(schemaKind(batchArray(ELEMENT, { description: "x", maxItems: 5 }))).toBe("batch");
  });

  it("nennt die Mengengrenze in der Beschreibung", () => {
    const schema = batchArray(ELEMENT, { description: "Die Datensätze.", maxItems: 7 });
    expect(schema.description ?? "").toContain(batchSizeSentence(7));
    expect(schema.description ?? "").toContain("Die Datensätze.");
  });

  it("lehnt ein Element ab, das kein Objektschema ist", () => {
    expect(() => batchArray(boundedText("Freitext"), { description: "x", maxItems: 5 })).toThrow(
      /Objektschema/,
    );
  });

  it("verwirft einen unbekannten Schlüssel im Element", () => {
    const schema = batchArray(ELEMENT, { description: "x", maxItems: 5 });
    expect(schema.safeParse([{ name: "a", unbekannt: 1 }]).success).toBe(false);
  });

  it("erbt die Strenge auch im JSON Schema", () => {
    const json = jsonOf(batchArray(ELEMENT, { description: "x", maxItems: 5 }));
    const items = json["items"] as Record<string, unknown>;
    expect(items["additionalProperties"]).toBe(false);
  });
});

describe("batchContainer", () => {
  it("baut den Behälter zu einem der acht Werkzeuge", () => {
    const schema = batchContainer("bb_debtors_create_batch", ELEMENT, {
      description: "Die Debitorenkonten.",
      maxItems: 4,
    });
    expect(jsonOf(schema)["maxItems"]).toBe(4);
  });
});

describe("assignments, Werkzeug 15", () => {
  it("führt genau zwei Pflichtfelder je Element", () => {
    const schema = assignmentItem();
    expect(Object.keys(schema.shape).sort()).toEqual([
      "receipt_id_by_customer",
      "transaction_id_by_customer",
    ]);
    expect(
      schema.safeParse({ receipt_id_by_customer: 1, transaction_id_by_customer: 2 }).success,
    ).toBe(true);
    expect(schema.safeParse({ receipt_id_by_customer: 1 }).success).toBe(false);
  });

  it("nennt den Body-Parameter der API in der Beschreibung", () => {
    const schema = assignments(3);
    expect(schema.description ?? "").toContain("transactions_to_receipts");
    expect(jsonOf(schema)["maxItems"]).toBe(3);
  });
});
