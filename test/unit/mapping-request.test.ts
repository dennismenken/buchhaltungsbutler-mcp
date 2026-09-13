import { describe, expect, it } from "vitest";

import {
  ANNEX_A_RENAMES,
  API_KEY_FIELD,
  assertNoApiKeyInArguments,
  documentedRename,
  mapRequest,
  RequestMappingError,
} from "../../src/mapping/request.js";
import type { ToolEntry } from "../../src/registry/types.js";
import {
  INVOICES_CREATE,
  INVOICES_CREATE_EINVOICE,
  POSTINGS_CREATE_FOR_RECEIPT,
  POSTINGS_CREATE_FOR_RECEIPT_BATCH,
  POSTINGS_CREATE_FOR_TRANSACTION,
  POSTINGS_SEARCH,
  RECEIPTS_CREATE,
  RECEIPTS_GET,
  RECEIPTS_SEARCH,
  TRANSACTIONS_ASSIGN_RECEIPT_BATCH,
  TRANSACTIONS_SEARCH,
} from "../golden/entries.js";

// Plan 1.4 Schritt 8 und Anhang A. Geprüft wird jede Art von Umbenennung: die einfache
// (payment_account_number → account), die mehrfach belegte (type), der Filtername, der
// Behälter, die Positionsliste, die geschachtelte Positionsliste und das Pfadsegment.

describe("Anhang A, Vollständigkeit der Tabelle", () => {
  it("führt alle 16 Zeilen des Anhangs", () => {
    expect(ANNEX_A_RENAMES).toHaveLength(16);
  });

  it("nennt zu jeder Zeile Endpunkte und einen Grund", () => {
    for (const rename of ANNEX_A_RENAMES) {
      expect(rename.specPaths.length).toBeGreaterThan(0);
      expect(rename.reason.length).toBeGreaterThan(3);
      expect(rename.field).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("führt die vier Pfadsegmentzeilen mit leerem apiNames", () => {
    const pathRenames = ANNEX_A_RENAMES.filter((rename) => rename.apiNames.length === 0);
    expect(pathRenames.map((rename) => rename.field)).toEqual([
      "receipt_id_by_customer",
      "transaction_id_by_customer",
    ]);
    expect(pathRenames.flatMap((rename) => rename.specPaths)).toEqual([
      "/receipts/get/id_by_customer",
      "/receipts/delete/id_by_customer",
      "/receipts/restore/id_by_customer",
      "/transactions/get/id_by_customer",
    ]);
  });

  it("führt die Schreibweise postingstexts nur an /postings/add-batch/receipts", () => {
    const matchingRenames = ANNEX_A_RENAMES.filter((rename) =>
      rename.apiNames.includes("postingstexts"),
    );
    expect(matchingRenames).toHaveLength(1);
    expect(matchingRenames[0]?.specPaths).toEqual(["/postings/add-batch/receipts"]);
  });

  it("stimmt mit den Attrappen der betroffenen Endpunkte überein", () => {
    const samples: readonly [ToolEntry, string][] = [
      [TRANSACTIONS_SEARCH, "payment_account_number"],
      [POSTINGS_SEARCH, "account_filter"],
      [POSTINGS_SEARCH, "postingaccount_filter"],
      [RECEIPTS_CREATE, "receipt_type"],
      [RECEIPTS_CREATE, "payment_account_number"],
      [INVOICES_CREATE, "invoice_type"],
      [POSTINGS_CREATE_FOR_RECEIPT, "positions"],
      [POSTINGS_CREATE_FOR_TRANSACTION, "positions"],
      [INVOICES_CREATE, "items"],
      [INVOICES_CREATE_EINVOICE, "items"],
      [TRANSACTIONS_ASSIGN_RECEIPT_BATCH, "assignments"],
    ];
    for (const [entry, fieldName] of samples) {
      const specPath = "literal" in entry.path ? entry.path.literal : entry.path.specPath;
      const documented = documentedRename(specPath, fieldName);
      const field = entry.fields.find((candidate) => candidate.name === fieldName);
      expect(documented, `${entry.name}.${fieldName} fehlt in Anhang A`).toBeDefined();
      expect(field?.apiNames).toEqual(documented?.apiNames);
    }
  });

  it("sagt nichts zu einem Feld, das nicht umbenannt wird", () => {
    expect(documentedRename("/receipts/get", "counterparty")).toBeUndefined();
    // Dasselbe Feld an einem anderen Endpunkt ist eine andere Zeile.
    expect(documentedRename("/postings/get", "payment_account_number")).toBeUndefined();
  });
});

describe("Die Umbenennungen im Body", () => {
  it("schreibt payment_account_number als account", () => {
    const mapped = mapRequest(TRANSACTIONS_SEARCH, {
      payment_account_number: "1200",
      limit: 100,
      offset: 0,
    });
    expect(mapped.body).toEqual({ account: "1200", limit: 100, offset: 0 });
    expect("payment_account_number" in mapped.body).toBe(false);
  });

  it("schreibt die beiden Filternamen von /postings/get zurück", () => {
    const mapped = mapRequest(POSTINGS_SEARCH, {
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      account_filter: "all financial accounts",
      postingaccount_filter: "4980,4930",
      limit: 100,
      offset: 0,
    });
    expect(mapped.body.account).toBe("all financial accounts");
    expect(mapped.body.postingaccount).toBe("4980,4930");
    expect("account_filter" in mapped.body).toBe(false);
    expect("postingaccount_filter" in mapped.body).toBe(false);
  });

  it("schreibt receipt_type und invoice_type je als type", () => {
    const receiptResult = mapRequest(RECEIPTS_CREATE, {
      counterparty: "Erfundene GmbH",
      invoicenumber: "ER-1",
      date: "2026-01-04",
      amount: "884.65",
      currency: "EUR",
      receipt_type: "invoice inbound",
      payment_account_number: "1200",
    });
    expect(receiptResult.body.type).toBe("invoice inbound");
    expect(receiptResult.body.account).toBe("1200");
    expect(receiptResult.body.amount).toBe(884.65);

    const invoiceResult = mapRequest(INVOICES_CREATE, {
      invoice_type: "invoice",
      date: "2026-02-01",
      items: [
        {
          item_name: "Beratung",
          item_amount: "1",
          item_unit: "Std.",
          item_vat: "19",
          item_single_price: "95.00",
        },
      ],
    });
    expect(invoiceResult.body.type).toBe("invoice");
  });
});

describe("Der api_key kommt nie aus den Argumenten (Plan 1.4 Schritt 8)", () => {
  it("weist einen Aufruf mit api_key ab, ohne einen Body zu bauen", () => {
    expect(() =>
      mapRequest(RECEIPTS_SEARCH, {
        list_direction: "inbound",
        limit: 100,
        offset: 0,
        api_key: "x",
      }),
    ).toThrow(RequestMappingError);
    expect(() => assertNoApiKeyInArguments("bb_receipts_search", { api_key: "x" })).toThrow(
      /ausschließlich aus der Konfiguration/,
    );
  });

  it("setzt den api_key selbst nicht in den Body", () => {
    const mapped = mapRequest(RECEIPTS_SEARCH, {
      list_direction: "inbound",
      limit: 100,
      offset: 0,
    });
    expect(API_KEY_FIELD in mapped.body).toBe(false);
  });

  it("weist einen Registereintrag ab, dessen Feld auf api_key zielte", () => {
    const broken: ToolEntry = {
      ...RECEIPTS_SEARCH,
      fields: [
        {
          name: "apiKeyField",
          apiNames: ["api_key"],
          source: "body",
          required: false,
          description: "Attrappe",
          schema: RECEIPTS_SEARCH.fields[0]?.schema ?? (undefined as never),
        },
      ],
    };
    expect(() => mapRequest(broken, { apiKeyField: "x" })).toThrow(/Mandantenschlüssel/);
  });
});

describe("Serverseitige Felder verlassen den Prozess nie", () => {
  it("trennt response_format vom Body", () => {
    const mapped = mapRequest(RECEIPTS_SEARCH, {
      list_direction: "inbound",
      limit: 100,
      offset: 0,
      response_format: "detailed",
    });
    expect("response_format" in mapped.body).toBe(false);
    expect(mapped.serverOnly).toEqual({ response_format: "detailed" });
  });

  it("liefert serverOnly leer, wenn der Aufrufer nichts gesetzt hat", () => {
    const mapped = mapRequest(RECEIPTS_SEARCH, {
      list_direction: "inbound",
      limit: 100,
      offset: 0,
    });
    expect(mapped.serverOnly).toEqual({});
  });
});

describe("Was der Mapper abweist", () => {
  it("meldet ein fehlendes Pflichtfeld, ohne einen halben Body zu bauen", () => {
    expect(() =>
      mapRequest(POSTINGS_SEARCH, { date_from: "2026-01-01", limit: 100, offset: 0 }),
    ).toThrow(/date_to: ist Pflicht/);
  });

  it("meldet einen Betrag, der nicht eindeutig ist, und setzt nichts ab", () => {
    expect(() =>
      mapRequest(RECEIPTS_CREATE, {
        counterparty: "Erfundene GmbH",
        invoicenumber: "ER-1",
        date: "2026-01-04",
        amount: "1.234",
        currency: "EUR",
        receipt_type: "invoice inbound",
      }),
    ).toThrow(/kein eindeutiger Betrag/);
  });

  it("meldet zwei Felder, die denselben Body-Parameter schreiben würden", () => {
    const first = RECEIPTS_SEARCH.fields[0];
    if (first === undefined) {
      throw new Error("Die Attrappe trägt keine Felder.");
    }
    const broken: ToolEntry = {
      ...RECEIPTS_SEARCH,
      fields: [first, { ...first, name: "secondName", apiNames: first.apiNames }],
    };
    expect(() => mapRequest(broken, { list_direction: "inbound", secondName: "inbound" })).toThrow(
      /ein zweites Mal setzen/,
    );
  });

  it("meldet ein Behälterfeld, das keine Liste ist, und einen leeren Stapel", () => {
    expect(() =>
      mapRequest(TRANSACTIONS_ASSIGN_RECEIPT_BATCH, { assignments: { receipt_id_by_customer: 1 } }),
    ).toThrow(/erwartet eine Liste von Objekten/);
    expect(() => mapRequest(TRANSACTIONS_ASSIGN_RECEIPT_BATCH, { assignments: [] })).toThrow(
      /ist leer/,
    );
    expect(() => mapRequest(TRANSACTIONS_ASSIGN_RECEIPT_BATCH, { assignments: ["x"] })).toThrow(
      /ist kein Objekt/,
    );
  });

  it("meldet ein Feld ohne genau einen API-Namen", () => {
    const first = RECEIPTS_SEARCH.fields[0];
    if (first === undefined) {
      throw new Error("Die Attrappe trägt keine Felder.");
    }
    const broken: ToolEntry = {
      ...RECEIPTS_SEARCH,
      fields: [{ ...first, apiNames: ["a", "b"] }],
    };
    expect(() => mapRequest(broken, { list_direction: "inbound" })).toThrow(/2 API-Namen/);
  });
});

describe("Die geschachtelte Umbenennung im Stapelelement", () => {
  it("benennt innerhalb eines Elements um und formt dort die Positionsliste", () => {
    const mapped = mapRequest(POSTINGS_CREATE_FOR_RECEIPT_BATCH, {
      receipts: [
        {
          receipt_id_by_customer: 4711,
          creditor: "70150",
          positions: [
            { postingaccount: "4980", postingtext: "Material", vat: "19_pre", amount: "10.00" },
          ],
        },
      ],
    });
    const element = (mapped.body.receipts as Record<string, unknown>[])[0];
    expect(element).toEqual({
      receipt_id_by_customer: 4711,
      creditor: "70150",
      postingaccounts: ["4980"],
      postingstexts: ["Material"],
      vats: ["19_pre"],
      amounts: [10],
    });
  });

  it("meldet die Position innerhalb des Elements mit Element- und Positionsangabe", () => {
    try {
      mapRequest(POSTINGS_CREATE_FOR_RECEIPT_BATCH, {
        receipts: [
          {
            receipt_id_by_customer: 4711,
            positions: [{ postingaccount: "4980", vat: "19_pre", amount: "10.00" }],
          },
        ],
      });
      expect.unreachable("hätte werfen müssen");
    } catch (caughtError) {
      expect((caughtError as Error).message).toContain("Position 1: postingtext fehlt");
      expect((caughtError as { fieldPath?: string }).fieldPath).toBe(
        "receipts (Position 1).positions",
      );
    }
  });
});

describe("Der gebaute Pfad steht neben dem Spezifikationspfad", () => {
  it("liefert beide Werte und den Werkzeugnamen", () => {
    const mapped = mapRequest(RECEIPTS_GET, { receipt_id_by_customer: 4711 });
    expect(mapped).toMatchObject({
      toolName: "bb_receipts_get",
      specPath: "/receipts/get/id_by_customer",
      requestPath: "/receipts/get/4711",
    });
  });
});
