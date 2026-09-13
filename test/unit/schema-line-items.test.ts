import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  API_MAX_BATCH,
  EINVOICE_ITEM_COLUMNS,
  INVOICE_ITEM_COLUMNS,
  POSTINGS_RECEIPT_BATCH_COLUMNS,
  POSTINGS_RECEIPT_COLUMNS,
  POSTINGS_TRANSACTION_COLUMNS,
  declarationSentence,
  einvoiceItemItem,
  einvoiceItems,
  invoiceItemItem,
  invoiceItems,
  postingPositionItem,
  postingPositions,
  toParallelArrays,
} from "../../src/schema/line-items.js";
import { isAmountSchema, schemaKind } from "../../src/schema/primitives.js";

const POSITION = {
  postingaccount: "4980",
  postingtext: "Bürobedarf",
  vat: "19_pre",
  amount: "100.00",
} as const;

function jsonOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
}

describe("Spaltenlisten", () => {
  it("führt die sechs Spalten von /postings/add/receipt", () => {
    expect(POSTINGS_RECEIPT_COLUMNS.map((column) => column.apiName)).toEqual([
      "postingaccounts",
      "postingtexts",
      "vats",
      "cost_locations",
      "cost_locations_two",
      "amounts",
    ]);
  });

  it("führt an /postings/add/transaction eine siebte Spalte", () => {
    expect(POSTINGS_TRANSACTION_COLUMNS).toHaveLength(7);
    expect(POSTINGS_TRANSACTION_COLUMNS[6]?.apiName).toBe("oi_receipts_ids_by_customer");
    expect(POSTINGS_TRANSACTION_COLUMNS[6]?.field).toBe("open_item_receipt_id_by_customer");
  });

  it("trägt im Stapelelement von Werkzeug 22 die Schreibweise postingstexts", () => {
    const batch = POSTINGS_RECEIPT_BATCH_COLUMNS.find((column) => column.field === "postingtext");
    const single = POSTINGS_RECEIPT_COLUMNS.find((column) => column.field === "postingtext");
    expect(single?.apiName).toBe("postingtexts");
    expect(batch?.apiName).toBe("postingstexts");
  });

  it("führt an den Rechnungen sechs beziehungsweise sieben Spalten", () => {
    expect(INVOICE_ITEM_COLUMNS).toHaveLength(6);
    expect(EINVOICE_ITEM_COLUMNS).toHaveLength(7);
    expect(EINVOICE_ITEM_COLUMNS.map((column) => column.apiName)).toContain("item_tax_type");
    expect(EINVOICE_ITEM_COLUMNS.map((column) => column.apiName)).toContain("item_tax_amount");
    expect(EINVOICE_ITEM_COLUMNS.map((column) => column.apiName)).not.toContain("item_vat");
  });

  it("deklariert die Umformung wörtlich und nennt die API-Arrays", () => {
    const sentence = declarationSentence(POSTINGS_RECEIPT_COLUMNS);
    expect(sentence).toContain("parallele Arrays");
    expect(sentence).toContain("postingaccounts, postingtexts, vats");
    expect(sentence).toContain("zwingend gleich lang");
  });
});

describe("Positionsobjekt der Buchungen", () => {
  it("verlangt die vier Pflichtfelder und lässt die Kostenstellen offen", () => {
    const schema = postingPositionItem(false);
    expect(schema.safeParse(POSITION).success).toBe(true);
    expect(schema.safeParse({ ...POSITION, cost_location: "1000" }).success).toBe(true);
    expect(schema.safeParse({ ...POSITION, postingtext: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...POSITION, unbekannt: 1 }).success).toBe(false);
  });

  it("markiert den Zeilenbetrag als Betrag, damit Guard 5 ihn findet", () => {
    const shape = postingPositionItem(false).shape;
    expect(isAmountSchema(shape["amount"])).toBe(true);
    expect(isAmountSchema(shape["postingtext"])).toBe(false);
  });

  it("führt an der Zahlungsvariante das Feld für offene Posten und erlaubt dort null", () => {
    const schema = postingPositionItem(true);
    expect(schema.safeParse({ ...POSITION, open_item_receipt_id_by_customer: null }).success).toBe(
      true,
    );
    expect(schema.safeParse({ ...POSITION, open_item_receipt_id_by_customer: 8801 }).success).toBe(
      true,
    );
    // Die Spezifikation führt das Array als required; weglassen ist deshalb kein Ersatz für
    // die ausdrückliche Angabe null.
    expect(schema.safeParse(POSITION).success).toBe(false);
  });

  it("begrenzt den Buchungstext auf 128 Zeichen", () => {
    const schema = postingPositionItem(false);
    expect(schema.safeParse({ ...POSITION, postingtext: "x".repeat(128) }).success).toBe(true);
    expect(schema.safeParse({ ...POSITION, postingtext: "x".repeat(129) }).success).toBe(false);
  });
});

describe("Positionsobjekt der Rechnungen", () => {
  const item = {
    item_name: "Beratung",
    item_amount: "10",
    item_unit: "Std.",
    item_vat: "19",
    item_single_price: "120.00",
  } as const;

  it("nimmt eine vollständige Position", () => {
    expect(invoiceItemItem().safeParse(item).success).toBe(true);
  });

  it("markiert den Einzelpreis als Betrag, die Menge und den Satz aber nicht", () => {
    const shape = invoiceItemItem().shape;
    expect(isAmountSchema(shape["item_single_price"])).toBe(true);
    expect(isAmountSchema(shape["item_amount"])).toBe(false);
    expect(isAmountSchema(shape["item_vat"])).toBe(false);
  });

  it("lehnt einen Steuersatz über 100 ab", () => {
    expect(invoiceItemItem().safeParse({ ...item, item_vat: "101" }).success).toBe(false);
    expect(invoiceItemItem().safeParse({ ...item, item_vat: "7.5" }).success).toBe(true);
  });

  it("führt an der E-Rechnung die sechs Steuerarten und ein optionales item_tax_amount", () => {
    const schema = einvoiceItemItem();
    const base = {
      item_name: "Beratung",
      item_amount: "10",
      item_unit: "Std.",
      item_single_price: "120.00",
    };
    expect(schema.safeParse({ ...base, item_tax_type: "Z" }).success).toBe(true);
    expect(schema.safeParse({ ...base, item_tax_type: "S", item_tax_amount: "19" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ ...base, item_tax_type: "X" }).success).toBe(false);
    // Ohne Steuersatz ist die Position syntaktisch gültig; die Pflicht bei 'S' prüft Q8.
    expect(schema.safeParse({ ...base, item_tax_type: "S" }).success).toBe(true);
  });
});

describe("Positionslisten", () => {
  it("verlangt mindestens eine Position und begrenzt nach oben", () => {
    const schema = postingPositions("receipt", { description: "Die Buchungssätze.", maxItems: 3 });
    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse([POSITION, POSITION, POSITION]).success).toBe(true);
    expect(schema.safeParse([POSITION, POSITION, POSITION, POSITION]).success).toBe(false);
    const json = jsonOf(schema);
    expect(json["minItems"]).toBe(1);
    expect(json["maxItems"]).toBe(3);
  });

  it("ist als Positionsliste markiert", () => {
    expect(
      schemaKind(postingPositions("receipt", { description: "Die Buchungssätze.", maxItems: 5 })),
    ).toBe("positions");
    expect(schemaKind(invoiceItems({ description: "Die Positionen.", maxItems: 5 }))).toBe(
      "positions",
    );
    expect(schemaKind(einvoiceItems({ description: "Die Positionen.", maxItems: 5 }))).toBe(
      "positions",
    );
  });

  it("hängt den Deklarationssatz an die Beschreibung", () => {
    const schema = postingPositions("transaction", {
      description: "Die Buchungssätze zu dieser Zahlung.",
      maxItems: 5,
    });
    const description = schema.description ?? "";
    expect(description).toContain("Die Buchungssätze zu dieser Zahlung.");
    expect(description).toContain("oi_receipts_ids_by_customer");
  });

  it("kennt die API-Obergrenze 50", () => {
    expect(API_MAX_BATCH).toBe(50);
  });
});

describe("Umformung in parallele Arrays", () => {
  it("erzeugt Arrays gleicher Länge, alle so lang wie die Positionsliste", () => {
    const positions = [
      { ...POSITION },
      { ...POSITION, amount: "50.00", cost_location: "1000" },
      { ...POSITION, amount: "25.00" },
    ];
    const body = toParallelArrays(positions, POSTINGS_RECEIPT_COLUMNS);
    for (const [name, array] of Object.entries(body)) {
      expect(array.length, name).toBe(positions.length);
    }
    expect(body["amounts"]).toEqual(["100.00", "50.00", "25.00"]);
    expect(body["postingaccounts"]).toEqual(["4980", "4980", "4980"]);
    // Die eine Position ohne Kostenstelle trägt null, damit die Länge erhalten bleibt.
    expect(body["cost_locations"]).toEqual([null, "1000", null]);
  });

  it("lässt ein optionales Array ganz weg, solange keine Position es setzt", () => {
    const body = toParallelArrays([{ ...POSITION }], POSTINGS_RECEIPT_COLUMNS);
    expect(Object.keys(body)).toEqual(["postingaccounts", "postingtexts", "vats", "amounts"]);
    expect(body).not.toHaveProperty("cost_locations");
  });

  it("trägt das null der offenen Posten durch", () => {
    const body = toParallelArrays(
      [
        { ...POSITION, open_item_receipt_id_by_customer: 8801 },
        { ...POSITION, open_item_receipt_id_by_customer: null },
      ],
      POSTINGS_TRANSACTION_COLUMNS,
    );
    expect(body["oi_receipts_ids_by_customer"]).toEqual([8801, null]);
  });

  it("benutzt im Stapelelement von Werkzeug 22 den Namen postingstexts", () => {
    const body = toParallelArrays([{ ...POSITION }], POSTINGS_RECEIPT_BATCH_COLUMNS);
    expect(body).toHaveProperty("postingstexts");
    expect(body).not.toHaveProperty("postingtexts");
  });

  it("erzeugt auch an den Rechnungen gleich lange Arrays", () => {
    const items = [
      {
        item_name: "Beratung",
        item_amount: "10",
        item_unit: "Std.",
        item_vat: "19",
        item_single_price: "120.00",
      },
      {
        item_name: "Reisekosten",
        item_amount: "1",
        item_unit: "Stk.",
        item_vat: "7",
        item_single_price: "49.50",
        item_description: "Bahnfahrt",
      },
    ];
    const body = toParallelArrays(items, INVOICE_ITEM_COLUMNS);
    for (const array of Object.values(body)) {
      expect(array).toHaveLength(2);
    }
    expect(body["item_description"]).toEqual([null, "Bahnfahrt"]);
  });

  it("liefert bei einer leeren Liste leere Arrays für die Pflichtspalten", () => {
    const body = toParallelArrays([], POSTINGS_RECEIPT_COLUMNS);
    expect(body["amounts"]).toEqual([]);
    expect(Object.keys(body)).toHaveLength(4);
  });
});
