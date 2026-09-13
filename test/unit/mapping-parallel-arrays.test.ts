import { describe, expect, it } from "vitest";

import {
  assertTransformAllowed,
  buildParallelArrays,
  columnsOf,
  NO_PARALLEL_ARRAY_PATHS,
  PARALLEL_ARRAY_NESTED_PATHS,
  PARALLEL_ARRAY_TOP_LEVEL_PATHS,
  PositionMappingError,
} from "../../src/mapping/parallel-arrays.js";
import { mapRequest } from "../../src/mapping/request.js";
import type { FieldSpec, ToolEntry } from "../../src/registry/types.js";
import {
  INVOICES_CREATE,
  INVOICES_CREATE_EINVOICE,
  POSTINGS_CREATE_FOR_RECEIPT,
  POSTINGS_CREATE_FOR_RECEIPT_BATCH,
  POSTINGS_CREATE_FOR_TRANSACTION,
  POSTINGS_CREATE_FREE,
  TRANSACTIONS_ASSIGN_RECEIPT_BATCH,
} from "../golden/entries.js";

// Plan 4.8 und 9.5: „eine Positionsliste mit drei Einträgen erzeugt Arrays mit je drei
// Elementen; null in oi_receipts_ids_by_customer überlebt die JSON-Kodierung".

function positionsField(entry: ToolEntry, name = "positions"): FieldSpec {
  const field = entry.fields.find((candidate) => candidate.name === name);
  if (field === undefined) {
    throw new Error(`Die Attrappe ${entry.name} trägt kein Feld ${name}.`);
  }
  return field;
}

const THREE_POSITIONS = [
  { postingaccount: "4980", postingtext: "Büromaterial", vat: "19_pre", amount: "100.00" },
  { postingaccount: "4930", postingtext: "Porto", vat: "19_pre", amount: "50.00" },
  { postingaccount: "4940", postingtext: "Beiträge", vat: "0_pre", amount: "20.00" },
];

describe("Die Längeninvariante ist konstruktiv erfüllt", () => {
  it("erzeugt aus drei Positionen Arrays mit je drei Elementen", () => {
    const arrays = buildParallelArrays(
      POSTINGS_CREATE_FOR_RECEIPT.name,
      positionsField(POSTINGS_CREATE_FOR_RECEIPT),
      THREE_POSITIONS,
    );
    expect(arrays.postingaccounts).toEqual(["4980", "4930", "4940"]);
    expect(arrays.postingtexts).toEqual(["Büromaterial", "Porto", "Beiträge"]);
    expect(arrays.vats).toEqual(["19_pre", "19_pre", "0_pre"]);
    expect(arrays.amounts).toEqual(["100.00", "50.00", "20.00"]);
    for (const column of Object.values(arrays)) {
      expect(column).toHaveLength(THREE_POSITIONS.length);
    }
  });

  it("lässt ein optionales Array ganz weg, solange keine Position es setzt", () => {
    const arrays = buildParallelArrays(
      POSTINGS_CREATE_FOR_RECEIPT.name,
      positionsField(POSTINGS_CREATE_FOR_RECEIPT),
      THREE_POSITIONS,
    );
    expect("cost_locations" in arrays).toBe(false);
    expect("cost_locations_two" in arrays).toBe(false);
  });

  it("füllt ein optionales Array vollständig, sobald eine Position es setzt", () => {
    const arrays = buildParallelArrays(
      POSTINGS_CREATE_FOR_RECEIPT.name,
      positionsField(POSTINGS_CREATE_FOR_RECEIPT),
      [THREE_POSITIONS[0], { ...THREE_POSITIONS[1], cost_location: "VERW" }],
    );
    expect(arrays.cost_locations).toEqual([null, "VERW"]);
    expect(arrays.cost_locations).toHaveLength(2);
  });
});

describe("null in oi_receipts_ids_by_customer", () => {
  const positionRows = [
    { ...THREE_POSITIONS[0], open_item_receipt_id_by_customer: 4711 },
    { ...THREE_POSITIONS[1], open_item_receipt_id_by_customer: null },
  ];

  it("überlebt die Umformung als Wert und nicht als Lücke", () => {
    const arrays = buildParallelArrays(
      POSTINGS_CREATE_FOR_TRANSACTION.name,
      positionsField(POSTINGS_CREATE_FOR_TRANSACTION),
      positionRows,
    );
    expect(arrays.oi_receipts_ids_by_customer).toEqual([4711, null]);
  });

  it("überlebt die JSON-Kodierung", () => {
    const arrays = buildParallelArrays(
      POSTINGS_CREATE_FOR_TRANSACTION.name,
      positionsField(POSTINGS_CREATE_FOR_TRANSACTION),
      positionRows,
    );
    const roundTripped = JSON.parse(JSON.stringify(arrays)) as Record<string, unknown[]>;
    expect(roundTripped.oi_receipts_ids_by_customer).toEqual([4711, null]);
    expect(roundTripped.oi_receipts_ids_by_customer).toHaveLength(2);
  });
});

describe("Fehlermeldungen sind positionsgenau", () => {
  it("nennt die Position, in der ein Pflichtfeld fehlt", () => {
    const broken = [THREE_POSITIONS[0], { postingaccount: "4930", vat: "19_pre", amount: "1.00" }];
    expect(() =>
      buildParallelArrays(
        POSTINGS_CREATE_FOR_RECEIPT.name,
        positionsField(POSTINGS_CREATE_FOR_RECEIPT),
        broken,
      ),
    ).toThrow(/Position 2: postingtext fehlt/);
  });

  it("nennt die Position, die kein Objekt ist", () => {
    expect(() =>
      buildParallelArrays(
        POSTINGS_CREATE_FOR_RECEIPT.name,
        positionsField(POSTINGS_CREATE_FOR_RECEIPT),
        [THREE_POSITIONS[0], "kein Objekt"],
      ),
    ).toThrow(/Position 2: ist kein Objekt/);
  });

  it("trägt Feldpfad und Position in der Ausnahme", () => {
    try {
      buildParallelArrays(
        POSTINGS_CREATE_FOR_RECEIPT.name,
        positionsField(POSTINGS_CREATE_FOR_RECEIPT),
        [{ postingaccount: "4980" }],
        "positions",
      );
      expect.unreachable("hätte werfen müssen");
    } catch (caughtError) {
      expect(caughtError).toBeInstanceOf(PositionMappingError);
      const typedError = caughtError as PositionMappingError;
      expect(typedError.position).toBe(1);
      expect(typedError.fieldPath).toBe("positions");
      expect(typedError.toolName).toBe("bb_postings_create_for_receipt");
    }
  });

  it("weist eine leere Liste und eine Nichtliste ab", () => {
    const field = positionsField(POSTINGS_CREATE_FOR_RECEIPT);
    expect(() => buildParallelArrays("t", field, [])).toThrow(/ist leer/);
    expect(() => buildParallelArrays("t", field, null)).toThrow(/erwartet eine Liste/);
    expect(() => buildParallelArrays("t", field, { postingaccount: "1" })).toThrow(
      /erwartet eine Liste/,
    );
  });

  it("erlaubt ein ausdrückliches null, wo das Schema es zulässt", () => {
    const field = positionsField(POSTINGS_CREATE_FOR_TRANSACTION);
    expect(() =>
      buildParallelArrays("t", field, [
        { ...THREE_POSITIONS[0], open_item_receipt_id_by_customer: null },
      ]),
    ).not.toThrow();
  });
});

describe("Die Spaltenliste kommt aus dem Registereintrag", () => {
  it("leitet Spalten und Pflichtigkeit aus den itemFields ab", () => {
    const columns = columnsOf(
      POSTINGS_CREATE_FOR_RECEIPT.name,
      positionsField(POSTINGS_CREATE_FOR_RECEIPT),
    );
    expect(columns.map((column) => column.apiName)).toEqual([
      "postingaccounts",
      "postingtexts",
      "vats",
      "cost_locations",
      "cost_locations_two",
      "amounts",
    ]);
    expect(columns.filter((column) => column.required).map((column) => column.field)).toEqual([
      "postingaccount",
      "postingtext",
      "vat",
      "amount",
    ]);
  });

  it("kennt die abweichende Schreibweise postingstexts je Stapelelement (Plan 0.5)", () => {
    const container = positionsField(POSTINGS_CREATE_FOR_RECEIPT_BATCH, "receipts");
    const nested = container.itemFields?.find((field) => field.name === "positions");
    expect(nested).toBeDefined();
    const columns = columnsOf(POSTINGS_CREATE_FOR_RECEIPT_BATCH.name, nested as FieldSpec);
    expect(columns.map((column) => column.apiName)).toContain("postingstexts");
    expect(columns.map((column) => column.apiName)).not.toContain("postingtexts");
  });

  it("weist einen Eintrag ab, dessen apiNames nicht zu den itemFields passen", () => {
    const field = positionsField(POSTINGS_CREATE_FOR_RECEIPT);
    const broken: FieldSpec = { ...field, apiNames: ["postingaccounts"] };
    expect(() => columnsOf("t", broken)).toThrow(/Beide Listen müssen übereinstimmen/);
  });

  it("weist ein Behälterfeld ohne itemFields ab", () => {
    const field = positionsField(POSTINGS_CREATE_FOR_RECEIPT);
    const broken: FieldSpec = { ...field, itemFields: undefined };
    expect(() => columnsOf("t", broken)).toThrow(/keine itemFields/);
  });

  it("weist ein Elementfeld mit mehr als einem API-Namen ab", () => {
    const field = positionsField(POSTINGS_CREATE_FOR_RECEIPT);
    const broken: FieldSpec = {
      ...field,
      apiNames: ["postingaccounts", "x", "vats", "cost_locations", "cost_locations_two", "amounts"],
      itemFields: field.itemFields?.map((item) =>
        item.name === "postingtext" ? { ...item, apiNames: ["postingtexts", "x"] } : item,
      ),
    };
    expect(() => columnsOf("t", broken)).toThrow(/API-Namen/);
  });
});

describe("Die Umformung findet ausschließlich an den benannten Endpunkten statt", () => {
  it("kennt genau fünf Endpunkte auf oberster Ebene und zwei je Stapelelement", () => {
    expect(PARALLEL_ARRAY_TOP_LEVEL_PATHS).toEqual([
      "/postings/add/receipt",
      "/postings/add/transaction",
      "/invoices/create",
      "/invoices/create/draft",
      "/invoices/create/e-invoice",
    ]);
    expect(PARALLEL_ARRAY_NESTED_PATHS).toEqual([
      "/postings/add-batch/receipts",
      "/postings/add-batch/transactions",
    ]);
  });

  it("lässt die fünf erlaubten Endpunkte durch", () => {
    for (const path of PARALLEL_ARRAY_TOP_LEVEL_PATHS) {
      expect(() => assertTransformAllowed("t", path, "positions", false)).not.toThrow();
    }
    for (const path of PARALLEL_ARRAY_NESTED_PATHS) {
      expect(() =>
        assertTransformAllowed("t", path, "receipts (Position 1).positions", true),
      ).not.toThrow();
    }
  });

  it("weist jeden anderen Endpunkt ab, auch die Stapelform derselben Ressource", () => {
    for (const path of NO_PARALLEL_ARRAY_PATHS) {
      expect(() => assertTransformAllowed("t", path, "positions", false)).toThrow(
        /keine parallelen Arrays/,
      );
    }
    // Die beiden geschachtelten Endpunkte führen auf oberster Ebene eine Objektliste.
    for (const path of PARALLEL_ARRAY_NESTED_PATHS) {
      expect(() => assertTransformAllowed("t", path, "receipts", false)).toThrow(
        /keine parallelen Arrays/,
      );
    }
    // Und umgekehrt: Die fünf oberen führen je Stapelelement keine.
    for (const path of PARALLEL_ARRAY_TOP_LEVEL_PATHS) {
      expect(() => assertTransformAllowed("t", path, "positions", true)).toThrow(
        /keine parallelen Arrays/,
      );
    }
  });
});

describe("Wo keine Umformung stattfindet (Plan 4.8, die fünf Korrekturen)", () => {
  it("/postings/add/free bleibt skalar", () => {
    const mapped = mapRequest(POSTINGS_CREATE_FREE, {
      date: "2026-08-14",
      postingtext: "Büromaterial August",
      amount: "1190.00",
      postingaccount_debit: "4980",
      postingaccount_credit: "1600",
      vat: "19_pre",
    });
    expect(mapped.body).toEqual({
      date: "2026-08-14",
      postingtext: "Büromaterial August",
      amount: 1190,
      postingaccount_debit: "4980",
      postingaccount_credit: "1600",
      vat: "19_pre",
    });
    expect(Object.keys(mapped.body)).not.toContain("amounts");
  });

  it("/transactions/assign-batch/receipt bleibt eine Objektliste und wird nur umbenannt", () => {
    const mapped = mapRequest(TRANSACTIONS_ASSIGN_RECEIPT_BATCH, {
      assignments: [
        { receipt_id_by_customer: 4711, transaction_id_by_customer: 1002 },
        { receipt_id_by_customer: 4712, transaction_id_by_customer: 1003 },
      ],
    });
    expect(mapped.body).toEqual({
      transactions_to_receipts: [
        { receipt_id_by_customer: 4711, transaction_id_by_customer: 1002 },
        { receipt_id_by_customer: 4712, transaction_id_by_customer: 1003 },
      ],
    });
  });

  it("/postings/add-batch/receipts formt nur INNERHALB der Elemente um", () => {
    const mapped = mapRequest(POSTINGS_CREATE_FOR_RECEIPT_BATCH, {
      receipts: [
        { receipt_id_by_customer: 4711, positions: [THREE_POSITIONS[0]] },
        { receipt_id_by_customer: 4712, positions: THREE_POSITIONS.slice(0, 2) },
      ],
    });
    const container = mapped.body.receipts as Record<string, unknown>[];
    expect(container).toHaveLength(2);
    expect(container[0]).toEqual({
      receipt_id_by_customer: 4711,
      postingaccounts: ["4980"],
      postingstexts: ["Büromaterial"],
      vats: ["19_pre"],
      amounts: [100],
    });
    expect(container[1]?.amounts).toEqual([100, 50]);
    // Auf oberster Ebene steht kein einziges paralleles Array.
    expect(Object.keys(mapped.body)).toEqual(["receipts"]);
  });
});

describe("Die Rechnungspositionen", () => {
  it("erzeugt die sechs Arrays von /invoices/create", () => {
    const mapped = mapRequest(INVOICES_CREATE, {
      invoice_type: "invoice",
      date: "2026-02-01",
      items: [
        {
          item_name: "Beratung",
          item_amount: "10",
          item_unit: "Std.",
          item_vat: "19",
          item_single_price: "95.00",
        },
      ],
    });
    expect(mapped.body).toEqual({
      type: "invoice",
      date: "2026-02-01",
      item_name: ["Beratung"],
      item_amount: ["10"],
      item_unit: ["Std."],
      item_vat: ["19"],
      item_single_price: [95],
    });
    expect("item_description" in mapped.body).toBe(false);
  });

  it("erzeugt die sieben Arrays der E-Rechnung, mit item_tax_type statt item_vat", () => {
    const mapped = mapRequest(INVOICES_CREATE_EINVOICE, {
      items: [
        {
          item_name: "Beratung",
          item_amount: "10",
          item_unit: "Std.",
          item_tax_type: "S",
          item_tax_amount: "19",
          item_single_price: "95.00",
          item_description: "Erfundener Zusatztext",
        },
      ],
    });
    expect(Object.keys(mapped.body).sort()).toEqual([
      "item_amount",
      "item_description",
      "item_name",
      "item_single_price",
      "item_tax_amount",
      "item_tax_type",
      "item_unit",
    ]);
    expect("item_vat" in mapped.body).toBe(false);
  });
});
