import { describe, expect, it } from "vitest";
import { z } from "zod";

import { batchArray } from "../../src/schema/batch.js";
import { buildToolSchema } from "../../src/schema/build.js";
import { strictObject } from "../../src/schema/primitives.js";
import {
  EMPTY_STRING_SENTENCE,
  ID_STRING_SENTENCE,
  RECEIPT_CURRENCY_SENTENCE,
  RESPONSE_FORMATS,
  TRANSACTION_CURRENCY_CODES,
  TRANSACTION_CURRENCY_SENTENCE,
  VAT_KEYS,
  amountIn,
  bic,
  contactAddressBlock,
  costLocation,
  currencyReceipts,
  currencyTransactions,
  currencyUpload,
  date,
  dateTime,
  iban,
  idByCustomer,
  paymentAccountNumber,
  postingAccountNumber,
  responseFormat,
  vatKey,
} from "../../src/schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../../src/registry/types.js";

// --- Hilfsmittel ---------------------------------------------------------------------

function field(
  overrides: Partial<FieldSpec> & { name: string; schema: FieldSpec["schema"] },
): FieldSpec {
  return {
    apiNames: [overrides.name],
    source: "body",
    required: true,
    description: overrides.schema.description ?? "Beschreibung des Feldes.",
    ...overrides,
  };
}

function entry(name: string, literal: string, fields: FieldSpec[]): ToolEntry {
  return {
    name,
    title: "Beispielwerkzeug",
    group: "receipts",
    path: { literal },
    effect: "create",
    toolClass: "A",
    tier: 2,
    description: "Beispielbeschreibung für den Test.",
    fields,
    serverOnlyFields: [],
    omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
    responseContract: { container: "data", fields: {}, source: "dokumentiert" },
    shape: "ack",
    concise: [],
    bucket: "default",
    timeoutTier: "normal",
    crossChecks: [],
    invalidatesCache: [],
  };
}

function jsonOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
}

function property(json: Record<string, unknown>, name: string): Record<string, unknown> {
  const properties = json["properties"] as Record<string, Record<string, unknown>>;
  return properties[name];
}

// --- Beschreibungsmuster -------------------------------------------------------------

const ALL_DESCRIPTIONS: string[] = [
  date("Rechnungsdatum des Belegs").description ?? "",
  dateTime("Zeitpunkt der letzten Änderung").description ?? "",
  amountIn("Bruttobetrag des Belegs").description ?? "",
  idByCustomer("des Belegs", "bb_receipts_search").description ?? "",
  vatKey().description ?? "",
  postingAccountNumber().description ?? "",
  paymentAccountNumber().description ?? "",
  costLocation().description ?? "",
  iban().description ?? "",
  bic().description ?? "",
  currencyReceipts().description ?? "",
  currencyTransactions().description ?? "",
  currencyUpload().description ?? "",
  ...Object.values(contactAddressBlock()).map((schema) => schema.description ?? ""),
];

describe("Beschreibungsmuster", () => {
  it("jeder Baustein trägt eine nicht leere deutsche Beschreibung", () => {
    for (const description of ALL_DESCRIPTIONS) {
      expect(description.length).toBeGreaterThan(10);
    }
  });

  it("verwendet keinen doppelten Bindestrich als Gedankenstrich und keine Emojis", () => {
    for (const description of ALL_DESCRIPTIONS) {
      expect(description).not.toContain("--");
      expect(/\p{Extended_Pictographic}/u.test(description)).toBe(false);
    }
  });

  it("trägt kein Markup aus der Spezifikation", () => {
    for (const description of ALL_DESCRIPTIONS) {
      expect(description).not.toContain("<br");
      expect(description).not.toContain("&ldquo;");
    }
  });

  it("nennt bei den Datumsfeldern das Muster und den leeren String", () => {
    const text = date("Rechnungsdatum des Belegs").description ?? "";
    expect(text).toContain("YYYY-MM-DD");
    expect(text).toContain("2026-04-26");
    expect(text).toContain(EMPTY_STRING_SENTENCE);
  });

  it("nennt bei Datumzeit den Rückfall auf 23:59:59", () => {
    expect(dateTime("Zeitpunkt").description ?? "").toContain("23:59:59");
  });

  it("nennt beim Betrag den Dezimalpunkt und den ungültigen Nullbetrag", () => {
    const text = amountIn("Bruttobetrag des Belegs").description ?? "";
    expect(text).toContain("Dezimalpunkt");
    expect(text).toContain("0.00 ist kein gültiger Betrag");
  });

  it("nennt bei der Kennung das Nachschlagewerkzeug und die Stringform der Antwort", () => {
    const text = idByCustomer("des Belegs", "bb_receipts_search").description ?? "";
    expect(text).toContain("bb_receipts_search");
    expect(text).toContain(ID_STRING_SENTENCE);
  });

  it("verweist bei den Stammdatenfeldern auf das Nachschlagewerkzeug statt auf ein Enum", () => {
    expect(postingAccountNumber().description ?? "").toContain("bb_postingaccounts_search");
    expect(paymentAccountNumber().description ?? "").toContain("bb_payment_accounts_list");
    expect(costLocation().description ?? "").toContain("bb_cost_locations_search");
    expect(jsonOf(strictObject({ a: postingAccountNumber() }))).not.toHaveProperty("enum");
  });
});

// --- Umsatzsteuerschlüssel -----------------------------------------------------------

describe("vatKey", () => {
  it("führt genau die 23 belegten Schlüssel", () => {
    expect(VAT_KEYS).toHaveLength(23);
    expect(new Set(VAT_KEYS).size).toBe(23);
    const json = property(jsonOf(strictObject({ vat: vatKey() })), "vat");
    expect(json["enum"]).toEqual([...VAT_KEYS]);
  });

  it("verweist für die deutschen Bezeichnungen auf die Resource statt sie mitzuliefern", () => {
    const text = vatKey().description ?? "";
    expect(text).toContain("bb://vat-keys");
    expect(text).not.toContain("keine Ust.");
  });

  it("lehnt einen erfundenen Schlüssel ab", () => {
    expect(vatKey().safeParse("19_ust").success).toBe(false);
    expect(vatKey().safeParse("19_pre").success).toBe(true);
  });
});

// --- Adressblock ---------------------------------------------------------------------

describe("contactAddressBlock", () => {
  it("führt genau neun Felder", () => {
    expect(Object.keys(contactAddressBlock())).toHaveLength(9);
  });

  it("hält je Feld die 80-Zeichen-Grenze aus Sparmaßnahme S4 ein", () => {
    for (const [name, schema] of Object.entries(contactAddressBlock())) {
      const description = schema.description ?? "";
      expect(description.length, `${name}: ${description}`).toBeLessThanOrEqual(80);
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it("führt die Bankdaten ausdrücklich nicht im Adressblock", () => {
    expect(Object.keys(contactAddressBlock())).not.toContain("iban");
    expect(Object.keys(contactAddressBlock())).not.toContain("bic");
  });
});

// --- response_format -----------------------------------------------------------------

describe("responseFormat", () => {
  it("führt concise und detailed mit der Vorgabe concise", () => {
    const json = property(
      jsonOf(strictObject({ response_format: responseFormat() })),
      "response_format",
    );
    expect(json["enum"]).toEqual([...RESPONSE_FORMATS]);
    expect(json["default"]).toBe("concise");
  });

  it("ist im JSON Schema optional, obwohl es eine Vorgabe trägt", () => {
    const json = jsonOf(strictObject({ response_format: responseFormat() }));
    expect(json["required"]).toBeUndefined();
  });

  it("sagt ausdrücklich, dass das Feld nicht an die API geht", () => {
    expect(responseFormat().description ?? "").toContain("geht nicht an die API");
  });
});

// --- Währung, Regel R-A --------------------------------------------------------------

describe("Währung: kein Baustein über alle fünf Vorkommen, aber je Ressource einer", () => {
  it("currencyReceipts ist ein freier String mit dem benannten Widerspruch", () => {
    const json = property(jsonOf(strictObject({ currency: currencyReceipts() })), "currency");
    expect(json["type"]).toBe("string");
    expect(json["enum"]).toBeUndefined();
    expect(json["description"]).toBe(RECEIPT_CURRENCY_SENTENCE);
    expect(RECEIPT_CURRENCY_SENTENCE).toContain("/receipts/add");
    expect(RECEIPT_CURRENCY_SENTENCE).toContain("widersprechen");
  });

  it("currencyTransactions ist ein Enum über die 48 Codes mit dem Hinweissatz", () => {
    expect(TRANSACTION_CURRENCY_CODES).toHaveLength(48);
    expect(new Set(TRANSACTION_CURRENCY_CODES).size).toBe(48);
    expect(TRANSACTION_CURRENCY_CODES).toContain("RSD");
    const json = property(jsonOf(strictObject({ currency: currencyTransactions() })), "currency");
    expect(json["enum"]).toEqual([...TRANSACTION_CURRENCY_CODES]);
    expect(json["description"]).toBe(TRANSACTION_CURRENCY_SENTENCE);
  });

  it("currencyUpload bleibt ein eigener, dritter Vorrat", () => {
    const text = currencyUpload().description ?? "";
    expect(text).toContain("nicht verifiziert");
    expect(text).not.toBe(RECEIPT_CURRENCY_SENTENCE);
  });

  // Regel R-A aus Plan 4.5 ist damit konstruktiv erfüllt und nicht bloß verabredet: Beide
  // Werkzeuge eines Paares rufen denselben Baustein, also kann kein Wert einzeln erlaubt
  // und im Stapel verboten sein.
  it("erzeugt an Werkzeug 4 und 5 zeichengleiche Fragmente (R-A)", () => {
    const single = buildToolSchema(
      entry("bb_receipts_create", "/receipts/add", [
        field({ name: "currency", schema: currencyReceipts() }),
      ]),
    );
    const batch = buildToolSchema(
      entry("bb_receipts_create_batch", "/receipts/addBatch", [
        field({
          name: "receipts",
          apiNames: ["receipts"],
          transform: "object-list",
          itemFields: [
            field({ name: "currency", apiNames: ["currency"], schema: currencyReceipts() }),
          ],
          schema: batchArray(strictObject({ currency: currencyReceipts() }), {
            description: "Die Belege dieses Stapels.",
            maxItems: 50,
          }),
        }),
      ]),
    );

    const fromSingle = property(single.jsonSchema, "currency");
    const container = property(batch.jsonSchema, "receipts");
    const items = container["items"] as Record<string, unknown>;
    const fromBatch = (items["properties"] as Record<string, Record<string, unknown>>)["currency"];

    expect(JSON.stringify(fromBatch)).toBe(JSON.stringify(fromSingle));
  });

  it("erzeugt an Werkzeug 12 und 13 zeichengleiche Fragmente (R-A)", () => {
    const single = buildToolSchema(
      entry("bb_transactions_create", "/transactions/add", [
        field({ name: "currency", required: false, schema: currencyTransactions() }),
      ]),
    );
    const batch = buildToolSchema(
      entry("bb_transactions_create_batch", "/transactions/addBatch", [
        field({
          name: "transactions",
          apiNames: ["transactions"],
          transform: "object-list",
          itemFields: [
            field({ name: "currency", apiNames: ["currency"], schema: currencyTransactions() }),
          ],
          schema: batchArray(strictObject({ currency: currencyTransactions().optional() }), {
            description: "Die Zahlungen dieses Stapels.",
            maxItems: 50,
          }),
        }),
      ]),
    );

    const fromSingle = property(single.jsonSchema, "currency");
    const container = property(batch.jsonSchema, "transactions");
    const items = container["items"] as Record<string, unknown>;
    const fromBatch = (items["properties"] as Record<string, Record<string, unknown>>)["currency"];

    expect(JSON.stringify(fromBatch)).toBe(JSON.stringify(fromSingle));
  });
});
