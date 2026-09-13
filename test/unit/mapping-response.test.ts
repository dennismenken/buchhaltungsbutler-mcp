import { afterEach, describe, expect, it } from "vitest";

import { parseEnvelope, type SuccessEnvelope } from "../../src/http/envelope.js";
import {
  accountLabelsFrom,
  accountLabelsFromStore,
  ACCOUNT_LABEL_FIELDS,
  mapResponse,
  projectionFrom,
} from "../../src/mapping/response.js";
import { createMasterDataStore } from "../../src/cache/store.js";
import { setLogLevel } from "../../src/logging/stderr.js";
import type { ToolEntry } from "../../src/registry/types.js";
import {
  POSTINGACCOUNTS_SEARCH,
  POSTINGS_SEARCH,
  RECEIPTS_CREATE,
  RECEIPTS_GET,
  RECEIPTS_SEARCH,
  TRANSACTIONS_GET,
  TRANSACTIONS_SEARCH,
} from "../golden/entries.js";
import { goldenBody, loadGolden } from "../golden/index.js";

// Der Weg ist derselbe wie im Betrieb: Golden-Körper durch
// `parseEnvelope`, dann durch `mapResponse`. Ein Test, der sich eine Erfolgsantwort selbst
// zusammensetzt, prüfte die Umschlagzerlegung mit.

afterEach(() => {
  setLogLevel("warn");
});

function envelope(entry: ToolEntry, goldenName: string): SuccessEnvelope {
  const golden = loadGolden(goldenName);
  return parseEnvelope({
    status: golden.http.status,
    contentType: golden.http.contentType,
    bodyText: JSON.stringify(golden.body),
    shape: entry.shape,
    context: {
      toolName: entry.name,
      specPath: "literal" in entry.path ? entry.path.literal : entry.path.specPath,
      toolClass: entry.toolClass,
    },
  });
}

describe("Der Antwortvertrag gilt je Endpunkt", () => {
  it("liest die Liste mit den Listennamen", () => {
    const mapped = mapResponse(RECEIPTS_SEARCH, envelope(RECEIPTS_SEARCH, "receipts-get-list"), {
      projection: "detailed",
      accountLabels: new Map(),
    });
    expect(mapped.endpoint).toBe("/receipts/get");
    expect(mapped.rowsReturned).toBe(2);
    expect(mapped.warnings).toEqual([]);
    expect(mapped.items[0]).toMatchObject({
      id_by_customer: "4711",
      delivery_date: null,
      due_date: null,
      amount: "884.65",
      amount_cents: 88465,
      deleted: false,
    });
  });

  it("liest den Einzelabruf mit den Einzelnamen und ohne rows", () => {
    const mapped = mapResponse(RECEIPTS_GET, envelope(RECEIPTS_GET, "receipts-get-single"), {
      projection: "detailed",
      accountLabels: new Map(),
    });
    expect(mapped.endpoint).toBe("/receipts/get/id_by_customer");
    expect(mapped.rowsReturned).toBeNull();
    expect(mapped.warnings).toEqual([]);
    expect(mapped.object).toMatchObject({
      date_delivery: "2026-01-02",
      date_payment_due: "2026-02-03",
      amount_original: "950.00",
      amount_original_cents: 95000,
      currency_original: "CHF",
      e_invoice_type: 0,
    });
    expect(mapped.object?.due_date).toBeUndefined();
  });

  it("erzeugt Warnungen, sobald der falsche Vertrag angewandt wird", () => {
    // Genau der Fall: Wer den Vertrag des Listenabrufs auf den Einzelabruf legt,
    // sieht ein leeres due_date und hält es für „keine Fälligkeit".
    const wrongEntry: ToolEntry = {
      ...RECEIPTS_GET,
      responseContract: RECEIPTS_SEARCH.responseContract,
    };
    const mapped = mapResponse(wrongEntry, envelope(RECEIPTS_GET, "receipts-get-single"), {
      accountLabels: new Map(),
    });
    const fieldNames = mapped.warnings.map((entry) => entry.warning.field);
    expect(fieldNames).toContain("due_date");
    expect(fieldNames).toContain("delivery_date");
    expect(fieldNames).toContain("date_uploaded");
    // Und die Fremdwährungsfelder wären dort nur noch „unbekannt".
    expect(mapped.unknownFields).toContain("amount_original");
    expect(mapped.unknownFields).toContain("currency_original");
  });

  it("löst die Typ-Asymmetrie beider Ressourcen zum String hin auf", () => {
    const list = mapResponse(
      TRANSACTIONS_SEARCH,
      envelope(TRANSACTIONS_SEARCH, "transactions-get-list"),
      { projection: "detailed", accountLabels: new Map() },
    );
    expect(list.items[0]?.id_by_customer).toBe("1002");
    expect(list.warnings).toEqual([]);

    const single = mapResponse(
      TRANSACTIONS_GET,
      envelope(TRANSACTIONS_GET, "transactions-get-single"),
      { projection: "detailed", accountLabels: new Map() },
    );
    expect(single.object?.id_by_customer).toBe("1002");
    expect(single.object?.account).toBe("1200");
    expect(single.warnings).toEqual([]);
  });

  it("liest eine Schreibantwort mit container none vom Umschlag selbst", () => {
    const golden = goldenBody("receipts-add-ack");
    const mapped = mapResponse(
      RECEIPTS_CREATE,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify(golden),
        shape: "ack",
        context: {
          toolName: RECEIPTS_CREATE.name,
          specPath: "/receipts/add",
          toolClass: RECEIPTS_CREATE.toolClass,
        },
      }),
      { accountLabels: new Map() },
    );
    expect(mapped.object).toEqual({ id_by_customer: "4716" });
    expect(mapped.warnings).toEqual([]);
  });
});

describe("_contract_warnings und unbekannte Felder", () => {
  it("liefert die Antwort trotz Vertragsverletzung und meldet sie", () => {
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      envelope(RECEIPTS_SEARCH, "receipts-get-list-contract-violation"),
      { projection: "detailed", accountLabels: new Map() },
    );
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0]?.counterparty).toBe("Erfundene Bürobedarf GmbH");
    const fieldNames = mapped.warnings.map((entry) => entry.warning.field);
    expect(fieldNames).toEqual(expect.arrayContaining(["amount", "due_date", "deleted"]));
    expect(mapped.warnings.every((entry) => entry.rows === 1)).toBe(true);
  });

  it("zählt ein unbekanntes Feld und reicht es durch", () => {
    setLogLevel("debug");
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      envelope(RECEIPTS_SEARCH, "receipts-get-list-unknown-field"),
      { projection: "detailed", accountLabels: new Map() },
    );
    expect(mapped.unknownFields).toEqual(["provider_new_field"]);
    expect(mapped.items[0]?.provider_new_field).toBe("etwas Neues vom Anbieter");
    expect(mapped.warnings).toEqual([]);
  });

  it("fasst dieselbe Abweichung über many Zeilen zu einem Eintrag zusammen", () => {
    const many = {
      success: true,
      message: "",
      rows: 3,
      data: [{}, {}, {}],
    };
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify(many),
        shape: "list",
        context: {
          toolName: RECEIPTS_SEARCH.name,
          specPath: "/receipts/get",
          toolClass: "R",
        },
      }),
      { accountLabels: new Map() },
    );
    const missing = mapped.warnings.filter((entry) => entry.warning.seen === "fehlt");
    expect(missing).toHaveLength(Object.keys(RECEIPTS_SEARCH.responseContract.fields).length);
    expect(missing.every((entry) => entry.rows === 3)).toBe(true);
  });

  it("reicht eine Zeile durch, die kein Objekt ist, und meldet sie", () => {
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify({ success: true, message: "", rows: 1, data: ["kaputt"] }),
        shape: "list",
        context: { toolName: RECEIPTS_SEARCH.name, specPath: "/receipts/get", toolClass: "R" },
      }),
      { accountLabels: new Map() },
    );
    expect(mapped.items[0]).toEqual({ value: "kaputt" });
    expect(mapped.warnings[0]?.warning).toEqual({
      field: "(Zeile)",
      expected: "object",
      seen: "string",
    });
  });

  it("reicht die Hinweise der Umschlagzerlegung weiter", () => {
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        // rows fehlt: Das ist ein Hinweis, kein Abbruch.
        bodyText: JSON.stringify({ success: true, message: "", data: [] }),
        shape: "list",
        context: { toolName: RECEIPTS_SEARCH.name, specPath: "/receipts/get", toolClass: "R" },
      }),
      { accountLabels: new Map() },
    );
    expect(mapped.envelopeWarnings.map((warning) => warning.code)).toEqual(["rows-missing"]);
  });
});

describe("Die Projektionen concise und detailed", () => {
  it("zeigt in concise genau die Felder des Eintrags plus ihre Centwerte", () => {
    const mapped = mapResponse(RECEIPTS_SEARCH, envelope(RECEIPTS_SEARCH, "receipts-get-list"), {
      projection: "concise",
      accountLabels: new Map(),
    });
    expect(Object.keys(mapped.items[0] ?? {})).toEqual([
      "id_by_customer",
      "date",
      "counterparty",
      "invoicenumber",
      "amount",
      "amount_cents",
      "payment_date",
      "due_date",
      "account",
      "amount_paid",
      "amount_paid_cents",
      "deleted",
    ]);
  });

  it("zeigt in detailed alle gelieferten Felder", () => {
    const mapped = mapResponse(RECEIPTS_SEARCH, envelope(RECEIPTS_SEARCH, "receipts-get-list"), {
      projection: "detailed",
      accountLabels: new Map(),
    });
    expect(Object.keys(mapped.items[0] ?? {})).toContain("filename");
    expect(Object.keys(mapped.items[0] ?? {})).toContain("date_uploaded");
  });

  it("nimmt die Vorgabe concise aus den serverseitigen Feldern", () => {
    expect(projectionFrom(undefined)).toBe("concise");
    expect(projectionFrom({})).toBe("concise");
    expect(projectionFrom({ response_format: "detailed" })).toBe("detailed");
    expect(projectionFrom({ response_format: "concise" })).toBe("concise");
    // Ein unbekannter Wert ist nicht „detailed": Die Vorgabe gewinnt.
    expect(projectionFrom({ response_format: "alles" })).toBe("concise");
  });

  it("lässt den Datensatz vollständig, wenn der Eintrag keine Projektion kennt", () => {
    const mapped = mapResponse(
      { ...RECEIPTS_SEARCH, concise: [] },
      envelope(RECEIPTS_SEARCH, "receipts-get-list"),
      { projection: "concise", accountLabels: new Map() },
    );
    expect(Object.keys(mapped.items[0] ?? {})).toContain("filename");
  });
});

describe("Sprechende Kontobezeichnungen aus dem Stammdatenspeicher", () => {
  const chartOfAccounts = goldenBody("postingaccounts-get-list").data;

  it("baut die Zuordnung Nummer zu Bezeichnung", () => {
    const labels = accountLabelsFrom(chartOfAccounts);
    expect(labels.get("4980")).toBe("4980 Sonstiger Betriebsbedarf");
    expect(labels.get("1200")).toBe("1200 Bank (erfunden)");
    expect(labels.size).toBe(4);
  });

  it("ergänzt die Bezeichnung und lässt die Rohnummer stehen", () => {
    const labels = accountLabelsFrom(chartOfAccounts);
    const posting = {
      success: true,
      message: "",
      rows: 1,
      data: [
        {
          id_by_customer: 8814,
          date: "2026-08-14",
          postingtext: "Büromaterial August",
          amount: "1190.00",
          debit_postingaccount_number: "4980",
          credit_postingaccount_number: "1200",
          tax_key: 9,
          fixed: "0",
          receipt_id_by_customer: null,
        },
      ],
    };
    const mapped = mapResponse(
      POSTINGS_SEARCH,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify(posting),
        shape: "list",
        context: { toolName: POSTINGS_SEARCH.name, specPath: "/postings/get", toolClass: "R" },
      }),
      { accountLabels: labels },
    );
    expect(mapped.labelsFromCache).toBe(true);
    expect(mapped.items[0]).toMatchObject({
      debit_postingaccount_number: "4980",
      debit_postingaccount: "4980 Sonstiger Betriebsbedarf",
      credit_postingaccount_number: "1200",
      credit_postingaccount: "1200 Bank (erfunden)",
    });
  });

  it("löst genau drei Feldnamen auf und nicht account", () => {
    expect(Object.keys(ACCOUNT_LABEL_FIELDS)).toEqual([
      "postingaccount_number",
      "debit_postingaccount_number",
      "credit_postingaccount_number",
    ]);
    expect("account" in ACCOUNT_LABEL_FIELDS).toBe(false);
  });

  it("ergänzt nichts, solange der Speicher abgeschaltet ist", () => {
    const disabledStore = createMasterDataStore({ ttlMs: 0 });
    expect(accountLabelsFromStore(disabledStore)).toBeUndefined();

    const mapped = mapResponse(
      POSTINGACCOUNTS_SEARCH,
      envelope(POSTINGACCOUNTS_SEARCH, "postingaccounts-get-list"),
      { store: disabledStore },
    );
    expect(mapped.labelsFromCache).toBe(false);
    expect(mapped.items[0]?.postingaccount).toBeUndefined();
  });

  it("liest den Kontenrahmen aus einem eingeschalteten Speicher", () => {
    const enabledStore = createMasterDataStore({ ttlMs: 60_000 });
    enabledStore.write("bb_postingaccounts_search", chartOfAccounts);
    const labels = accountLabelsFromStore(enabledStore);
    expect(labels?.get("4980")).toBe("4980 Sonstiger Betriebsbedarf");

    const mapped = mapResponse(
      POSTINGACCOUNTS_SEARCH,
      envelope(POSTINGACCOUNTS_SEARCH, "postingaccounts-get-list"),
      { store: enabledStore },
    );
    expect(mapped.labelsFromCache).toBe(true);
    expect(mapped.items[1]).toMatchObject({
      postingaccount_number: "4980",
      postingaccount: "4980 Sonstiger Betriebsbedarf",
    });
  });

  it("verkraftet einen Kontenrahmen, der nicht die erwartete Form hat", () => {
    expect(accountLabelsFrom(undefined).size).toBe(0);
    expect(accountLabelsFrom([null, 5, {}, { postingaccount_number: "1" }]).size).toBe(0);
    expect(accountLabelsFrom([{ postingaccount_number: 4980, name: "Material" }]).get("4980")).toBe(
      "4980 Material",
    );
  });
});
