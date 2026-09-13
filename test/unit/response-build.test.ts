import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseEnvelope, type SuccessEnvelope } from "../../src/http/envelope.js";
import { mapResponse, type MappedResponse } from "../../src/mapping/response.js";
import {
  buildToolResponse,
  cacheHitNote,
  estimateResponseTokens,
  resolveWriteRecord,
} from "../../src/response/build.js";
import { duplicateFoundNote } from "../../src/response/next-step.js";
import { buildOutputSchema, writeRecordKey } from "../../src/response/output-schema.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";
import {
  INVOICES_CREATE,
  PAYMENT_ACCOUNTS_LIST,
  POSTINGACCOUNTS_SEARCH,
  INVOICES_CREATE_EINVOICE,
  POSTINGS_CREATE_FREE,
  RECEIPTS_CREATE,
  RECEIPTS_GET,
  RECEIPTS_SEARCH,
  REPORTS_CREATE_BWA,
  REPORTS_GET_BWA,
} from "../golden/entries.js";
import { loadGolden } from "../golden/index.js";

// Plan 7.1, 7.5 und 7.6: structuredContent und Textblock entstehen aus derselben
// Datenstruktur. Zusätzlich der Nachweis, dass das offene outputSchema (7.1, S18) wirklich
// auf die erzeugte Antwort passt — ein Schema, das die eigene Antwort verwirft, wäre keine
// Zusage, sondern eine Zierde.

beforeEach(() => {
  installTestConfig();
});

afterEach(() => {
  resetTestConfig();
});

function envelopeOf(entry: ToolEntry, goldenName: string): SuccessEnvelope {
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

function mapGolden(
  entry: ToolEntry,
  goldenName: string,
  projection?: "concise" | "detailed",
): MappedResponse {
  return mapResponse(entry, envelopeOf(entry, goldenName), {
    accountLabels: new Map(),
    ...(projection === undefined ? {} : { projection }),
  });
}

// --- Ein kleiner Schemaprüfer --------------------------------------------------------
// Kein zusätzliches Paket: Geprüft werden Pflichtfelder und deklarierte Typen, und genau das
// verlangt Plan 7.1 vom offenen Ausgabeschema.

function typeMatches(value: unknown, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((single) => {
    switch (single) {
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      case "array":
        return Array.isArray(value);
      case "null":
        return value === null;
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "number":
        return typeof value === "number";
      case "string":
        return typeof value === "string";
      case "boolean":
        return typeof value === "boolean";
      default:
        return true;
    }
  });
}

function check(value: unknown, schema: Record<string, unknown>, path = "$"): string[] {
  const problems: string[] = [];
  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    problems.push(`${path}: erwartet ${JSON.stringify(schema.type)}, geliefert ${typeof value}`);
    return problems;
  }
  if (Array.isArray(value) && typeof schema.items === "object" && schema.items !== null) {
    value.forEach((item, index) => {
      problems.push(...check(item, schema.items as Record<string, unknown>, `${path}[${index}]`));
    });
    return problems;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const requiredName of (schema.required ?? []) as string[]) {
      if (!(requiredName in (value as Record<string, unknown>))) {
        problems.push(`${path}: Pflichtfeld ${requiredName} fehlt`);
      }
    }
    for (const [name, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      const subSchema = properties[name];
      if (subSchema !== undefined) {
        problems.push(...check(fieldValue, subSchema, `${path}.${name}`));
      }
      // Unbekannte Felder sind erlaubt: additionalProperties bleibt offen (S18).
    }
  }
  return problems;
}

describe("Die Listenantwort (Plan 7.1, 7.5)", () => {
  it("trägt die Tatsachen der Seite und die Zeilen", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list"),
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });

    expect(response.structuredContent).toMatchObject({
      endpoint: "/receipts/get",
      success: true,
      rows_returned: 2,
      limit_used: 100,
      offset_used: 0,
      more_possible: false,
    });
    expect(response.structuredContent.items).toHaveLength(2);
  });

  it("zeigt Tabelle und Bestandszeile im Textblock", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list"),
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });
    const text = response.content[0]?.text ?? "";
    expect(text).toContain("| id_by_customer | date | counterparty |");
    expect(text).toContain("2 Zeilen geliefert (limit=100, offset=0).");
    expect(text).toContain("vollständige Ergebnis für diese Filter");
  });

  it("meldet die volle Seite als „wahrscheinlich mehr“ und nennt den nächsten offset", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list-full-page"),
      args: { list_direction: "inbound", limit: 3, offset: 0 },
    });
    expect(response.structuredContent.more_possible).toBe(true);
    const text = response.content[0]?.text ?? "";
    expect(text).toContain("offset=3 erneut aufrufen");
    expect(text).not.toMatch(/von \d+ Treffern/);
  });

  it("verkraftet die leere Seite ohne Tabelle und ohne Folgehinweis", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list-empty"),
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });
    const text = response.content[0]?.text ?? "";
    expect(text).toBe(
      "0 Zeilen geliefert. Entweder haben die Filter nichts getroffen, oder der offset liegt " +
        "hinter dem Ende des Ergebnisses. Das ist kein Fehler.",
    );
    expect(response.structuredContent.items).toEqual([]);
  });

  it("sagt bei /accounts/get ausdrücklich, dass es keine Paginierung gibt", () => {
    const response = buildToolResponse({
      entry: PAYMENT_ACCOUNTS_LIST,
      mapped: mapGolden(PAYMENT_ACCOUNTS_LIST, "accounts-get-list"),
      args: {},
    });
    expect(response.content[0]?.text).toContain("kennt keine Paginierung");
    expect(response.structuredContent.limit_used).toBeNull();
  });

  it("hängt den Kontenhinweis an eine volle Kontenseite", () => {
    const response = buildToolResponse({
      entry: POSTINGACCOUNTS_SEARCH,
      mapped: mapGolden(POSTINGACCOUNTS_SEARCH, "postingaccounts-get-list"),
      args: { limit: 4, offset: 0 },
    });
    expect(response.content[0]?.text).toContain("Die Liste mischt Sachkonten");
  });
});

describe("Kürzung und Binärinhalte (Plan 7.6)", () => {
  it("kürzt eine lange Liste, weist die Kürzung aus und lügt dabei nicht", () => {
    const rows = Array.from({ length: 400 }, (_, index) => ({
      success: true,
      id_by_customer: String(index),
    }));
    const body = {
      success: true,
      message: "",
      rows: rows.length,
      data: rows.map((row) => ({
        filename: `datei-${row.id_by_customer}`,
        id_by_customer: row.id_by_customer,
        type: "invoice inbound",
        date: "2026-01-04",
        delivery_date: null,
        date_uploaded: "2026-01-05",
        counterparty: "Erfundene Bürobedarf GmbH mit langem Namen",
        invoicenumber: `ER-2026-${row.id_by_customer}`,
        amount: "884.65",
        payment_date: "2026-01-09",
        due_date: null,
        account: "1200",
        amount_paid: "0.00",
        amount_paid_fixed: "0.00",
        deleted: "0",
        link_to_receipt_id_by_customer: null,
      })),
    };
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify(body),
        shape: "list",
        context: { toolName: RECEIPTS_SEARCH.name, specPath: "/receipts/get", toolClass: "R" },
      }),
      { accountLabels: new Map() },
    );
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped,
      args: { list_direction: "inbound", limit: 500, offset: 0 },
      maxResponseTokens: 1000,
    });

    const shownCount = (response.structuredContent.items as unknown[]).length;
    expect(shownCount).toBeLessThan(400);
    expect(shownCount).toBeGreaterThan(0);
    const text = response.content[0]?.text ?? "";
    expect(text).toContain(`${String(shownCount)} von 400 gelieferten Zeilen werden angezeigt`);
    expect(text).toContain("Auf Seiten der API ist nichts verloren gegangen");
    // Die Bestandszeile nennt weiter die tatsächlich gelieferten Zeilen.
    expect(response.structuredContent.rows_returned).toBe(400);
    expect(response.structuredContent._truncated).toMatchObject({
      shown: shownCount,
      returned: 400,
    });
  });

  it("zeigt Base64 nie im Textblock, sondern als Zeile mit Art und Größe", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_GET,
      mapped: mapGolden(RECEIPTS_GET, "receipts-get-single-with-file", "detailed"),
      args: { receipt_id_by_customer: 4711 },
    });
    const text = response.content[0]?.text ?? "";
    expect(text).not.toMatch(/[A-Za-z0-9+/]{200,}/);
    expect(text).toContain("file_content: unbekannt,");
    expect(text).toContain("nicht ausgeliefert (nicht angefordert)");
    const data = response.structuredContent.data as Record<string, unknown>;
    expect(data.file_content).toMatchObject({ _binary: true });
  });

  it("lässt die Datei im strukturierten Teil, wenn sie angefordert war", () => {
    const response = buildToolResponse({
      entry: REPORTS_GET_BWA,
      mapped: mapGolden(REPORTS_GET_BWA, "reports-get-bwa-with-files", "detailed"),
      args: { report_id_by_customer: 42, get_files: true },
    });
    const data = response.structuredContent.data as Record<string, unknown>;
    const files = data.files as Record<string, unknown>;
    expect(typeof files.pdf).toBe("string");
    expect(response.content[0]?.text).toContain("im strukturierten Teil der Antwort");
    expect(response.content[0]?.text).not.toMatch(/[A-Za-z0-9+/]{200,}/);
  });
});

describe("Vertragsverletzung und Speicherherkunft stehen vorn", () => {
  it("beginnt den Textblock mit der Warnzeile", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list-contract-violation"),
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });
    expect(response.content[0]?.text.startsWith("ACHTUNG")).toBe(true);
    expect(response.structuredContent._contract_warnings).toBeDefined();
  });

  it("weist einen Treffer aus dem Stammdatenspeicher wörtlich aus (Plan 7.8 Punkt 2)", () => {
    const response = buildToolResponse({
      entry: POSTINGACCOUNTS_SEARCH,
      mapped: mapGolden(POSTINGACCOUNTS_SEARCH, "postingaccounts-get-list"),
      args: { limit: 200, offset: 0 },
      cacheHit: { ageMs: 43_000 },
    });
    expect(cacheHitNote(43_000)).toBe(
      "Aus dem Stammdatenspeicher dieses Serverprozesses, abgelegt vor 43 Sekunden. Frisch " +
        "holen: Serverprozess neu starten oder BB_MCP_CACHE_TTL_MS=0 setzen.",
    );
    expect(response.content[0]?.text).toContain(
      "Aus dem Stammdatenspeicher dieses Serverprozesses",
    );
    expect(response.structuredContent._from_cache).toMatchObject({ age_ms: 43_000 });
  });

  it("nennt unbekannte Felder im strukturierten Teil", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list-unknown-field", "detailed"),
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });
    expect(response.structuredContent._unknown_fields).toEqual(["provider_new_field"]);
  });
});

describe("Die Schreibantwort (Plan 7.6)", () => {
  const freePosting = {
    date: "2026-08-14",
    postingtext: "Büromaterial August",
    amount: "1190.00",
    postingaccount_debit: "4980",
    postingaccount_credit: "1600",
    vat: "19_pre",
  };

  it("löst den Datensatz aus den Argumenten auf, wo die API nichts zurückmeldet", () => {
    const mapped = mapGolden(POSTINGS_CREATE_FREE, "postings-add-free-ack");
    const resolved = resolveWriteRecord({
      entry: POSTINGS_CREATE_FREE,
      mapped,
      args: freePosting,
    });
    expect(resolved.fromResponse).toEqual([]);
    expect(resolved.record).toMatchObject(freePosting);

    const response = buildToolResponse({ entry: POSTINGS_CREATE_FREE, mapped, args: freePosting });
    const text = response.content[0]?.text ?? "";
    expect(text).toContain("in den echten Buchhaltungsdaten des verbundenen Mandanten angelegt");
    expect(text).toContain("Benutzter Endpunkt: /postings/add/free");
    expect(text).toContain("date 2026-08-14 | postingtext Büromaterial August");
    expect(text).toContain("Weg zurück: bb_postings_unconfirm_free");
    expect(response.structuredContent.created).toMatchObject({ amount: "1190.00" });
  });

  it("nennt die Felder, die die API nicht zurückgemeldet hat, samt Leseweg", () => {
    const mapped = mapGolden(RECEIPTS_CREATE, "receipts-add-ack");
    const response = buildToolResponse({
      entry: RECEIPTS_CREATE,
      mapped,
      args: {
        counterparty: "Erfundene Bürobedarf GmbH",
        invoicenumber: "ER-2026-0001",
        date: "2026-01-04",
        amount: "884.65",
        currency: "EUR",
        receipt_type: "invoice inbound",
      },
    });
    // id_by_customer kommt aus der Antwort, alles andere aus den Argumenten.
    expect(response.structuredContent.created).toMatchObject({
      id_by_customer: "4716",
      counterparty: "Erfundene Bürobedarf GmbH",
    });
    expect(response.content[0]?.text).toContain(
      "Weg zurück: bb_receipts_delete mit receipt_id_by_customer=4716",
    );
  });

  it("nennt bei einer Rechnung ausdrücklich, dass es keinen Weg zurück gibt", () => {
    const mapped = mapGolden(INVOICES_CREATE, "invoices-create-success");
    const response = buildToolResponse({
      entry: INVOICES_CREATE,
      mapped,
      args: { invoice_type: "invoice", date: "2026-02-01", items: [{ item_name: "Beratung" }] },
    });
    const text = response.content[0]?.text ?? "";
    expect(text).toContain("Weg zurück: keiner.");
    expect(text).toContain("kennt keinen Storno");
    expect(response.structuredContent.reversal).toMatchObject({ available: false });
    // Die Positionsliste steht als Menge da und nicht ein zweites Mal ausgeschrieben.
    expect(response.structuredContent.created).toMatchObject({ items: "1 Eintrag (items)" });
  });

  it("nennt Menge und Summe einer Positionsliste in Ganzzahl-Cent", () => {
    const mapped = mapGolden(INVOICES_CREATE, "invoices-create-success");
    const resolved = resolveWriteRecord({
      entry: INVOICES_CREATE,
      mapped,
      args: {
        invoice_type: "invoice",
        date: "2026-02-01",
        items: [{ amount: "19.99" }, { amount: "1.13" }],
      },
    });
    expect(resolved.record.items).toBe("2 Einträge (items), Summe 21.12");
  });

  it("hängt den Anschlusshinweis an eine angeforderte Auswertung", () => {
    const mapped = mapGolden(REPORTS_CREATE_BWA, "reports-create-bwa-ack");
    const response = buildToolResponse({
      entry: REPORTS_CREATE_BWA,
      mapped,
      args: { date_from: "2026-01-01", date_to: "2026-01-31" },
    });
    expect(response.content[0]?.text).toContain("Auswertung 42 wurde angefordert");
    expect(response.content[0]?.text).toContain("report_id_by_customer=42");
  });

  it("setzt den Schlüssel des Datensatzes nach der Wirkung", () => {
    expect(writeRecordKey("create")).toBe("created");
    expect(writeRecordKey("modify")).toBe("changed");
    expect(writeRecordKey("delete")).toBe("removed");
    expect(writeRecordKey("read")).toBe("data");
  });
});

describe("Die übrigen Bestandteile der Schreibantwort", () => {
  it("nimmt den Duplikatshinweis auf, wenn die Abfrage eingeschaltet war und traf", () => {
    const mapped = mapGolden(RECEIPTS_CREATE, "receipts-add-ack");
    const hint = duplicateFoundNote({ existingId: "8801", deleteTool: "bb_receipts_delete" });
    const response = buildToolResponse({
      entry: RECEIPTS_CREATE,
      mapped,
      args: { date: "2026-01-04", amount: "884.65" },
      duplicateHint: hint,
    });
    expect(response.content[0]?.text).toContain("existiert bereits (id_by_customer 8801)");
    expect(response.structuredContent.duplicate_hint).toEqual({ text: hint });
  });

  it("nennt bei einem Werkzeug ohne Leseweg den Grund aus verifyWith", () => {
    const mapped = mapGolden(INVOICES_CREATE_EINVOICE, "postings-add-free-ack");
    const response = buildToolResponse({
      entry: { ...INVOICES_CREATE_EINVOICE, responseContract: INVOICES_CREATE.responseContract },
      mapped,
      args: { items: [{ item_name: "Beratung" }] },
    });
    expect(response.content[0]?.text).toContain("Nicht zurückgemeldet wurden:");
    expect(response.content[0]?.text).toContain("Kein Leseweg über die API.");
  });

  it("hängt den Stornohinweis nur an, wenn die API die Festschreibung meldet", () => {
    const cancelEntry: ToolEntry = {
      ...POSTINGS_CREATE_FREE,
      name: "bb_postings_cancel",
      title: "Buchung stornieren",
      effect: "delete",
      path: { literal: "/postings/cancel" },
      responseContract: {
        container: "none",
        fields: { id_by_customer: "id-string", fixed: "bool-string" },
        source: "dokumentiert",
      },
    };
    const envelopeWith = parseEnvelope({
      status: 200,
      contentType: "application/json",
      bodyText: JSON.stringify({
        success: true,
        message: "",
        id_by_customer: "8814",
        fixed: "1",
      }),
      shape: "ack",
      context: { toolName: cancelEntry.name, specPath: "/postings/cancel", toolClass: "D" },
    });
    const withReversal = buildToolResponse({
      entry: cancelEntry,
      mapped: mapResponse(cancelEntry, envelopeWith, { accountLabels: new Map() }),
      args: { posting_id_by_customer: 8814 },
    });
    expect(withReversal.content[0]?.text).toContain("war festgeschrieben");
    expect(withReversal.structuredContent.removed).toMatchObject({ id_by_customer: "8814" });

    const envelopeWithout = parseEnvelope({
      status: 200,
      contentType: "application/json",
      bodyText: JSON.stringify({
        success: true,
        message: "",
        id_by_customer: "8815",
        fixed: "0",
      }),
      shape: "ack",
      context: { toolName: cancelEntry.name, specPath: "/postings/cancel", toolClass: "D" },
    });
    const withoutReversal = buildToolResponse({
      entry: cancelEntry,
      mapped: mapResponse(cancelEntry, envelopeWithout, { accountLabels: new Map() }),
      args: { posting_id_by_customer: 8815 },
    });
    // Ohne Beleg wird nichts behauptet.
    expect(withoutReversal.content[0]?.text).not.toContain("war festgeschrieben");
  });

  it("weist die Herkunft der Kontobezeichnungen aus", () => {
    const labels = new Map([["4980", "4980 Sonstiger Betriebsbedarf"]]);
    const mapped = mapResponse(
      POSTINGACCOUNTS_SEARCH,
      envelopeOf(POSTINGACCOUNTS_SEARCH, "postingaccounts-get-list"),
      { accountLabels: labels },
    );
    const response = buildToolResponse({
      entry: POSTINGACCOUNTS_SEARCH,
      mapped,
      args: { limit: 200, offset: 0 },
    });
    expect(response.structuredContent._labels_from_cache).toBe(true);
    expect(response.content[0]?.text).toContain("aus dem Stammdatenspeicher dieses");
  });

  it("gibt einen Hinweis der Umschlagzerlegung weiter", () => {
    const mapped = mapResponse(
      RECEIPTS_SEARCH,
      parseEnvelope({
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify({ success: true, message: "alles gut", data: [] }),
        shape: "list",
        context: { toolName: RECEIPTS_SEARCH.name, specPath: "/receipts/get", toolClass: "R" },
      }),
      { accountLabels: new Map() },
    );
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped,
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });
    expect(response.content[0]?.text).toContain("Hinweis zum Umschlag:");
    expect(response.structuredContent._envelope_warnings).toHaveLength(1);
    expect(response.structuredContent.message).toBe("alles gut");
  });
});

describe("Das offene outputSchema passt auf die erzeugte Antwort (Plan 7.1, S18)", () => {
  const cases: readonly [ToolEntry, string, Record<string, unknown>][] = [
    [RECEIPTS_SEARCH, "receipts-get-list", { list_direction: "inbound", limit: 100, offset: 0 }],
    [
      RECEIPTS_SEARCH,
      "receipts-get-list-empty",
      { list_direction: "inbound", limit: 100, offset: 0 },
    ],
    [
      RECEIPTS_SEARCH,
      "receipts-get-list-unknown-field",
      { list_direction: "inbound", limit: 100, offset: 0 },
    ],
    [RECEIPTS_GET, "receipts-get-single", { receipt_id_by_customer: 4711 }],
    [PAYMENT_ACCOUNTS_LIST, "accounts-get-list", {}],
    [POSTINGACCOUNTS_SEARCH, "postingaccounts-get-list", { limit: 200, offset: 0 }],
    [POSTINGS_CREATE_FREE, "postings-add-free-ack", { date: "2026-08-14", amount: "1190.00" }],
    [RECEIPTS_CREATE, "receipts-add-ack", { date: "2026-01-04", amount: "884.65" }],
    [INVOICES_CREATE, "invoices-create-success", { invoice_type: "invoice" }],
  ];

  it.each(cases)("%#: %s validiert gegen sein Schema", (entry, golden, args) => {
    const response = buildToolResponse({
      entry,
      mapped: mapGolden(entry, golden, "detailed"),
      args,
    });
    const problems = check(response.structuredContent, buildOutputSchema(entry));
    expect(problems).toEqual([]);
  });

  it("bleibt offen: ein unbekanntes Feld bricht die Prüfung nicht", () => {
    const schema = buildOutputSchema(RECEIPTS_SEARCH);
    expect(schema.additionalProperties).toBe(true);
    expect(schema.required).toEqual(["success", "items"]);
    const items = (schema.properties as Record<string, Record<string, unknown>>).items;
    expect((items.items as Record<string, unknown>).additionalProperties).toBe(true);
  });

  it("kennzeichnet Betragsfelder als String und ihr Centfeld als Ganzzahl", () => {
    const schema = buildOutputSchema(RECEIPTS_SEARCH);
    const items = (schema.properties as Record<string, Record<string, unknown>>).items;
    const properties = (items.items as Record<string, Record<string, unknown>>)
      .properties as Record<string, Record<string, unknown>>;
    expect(properties.amount.type).toEqual(["string", "null"]);
    expect(properties.amount_cents.type).toBe("integer");
    expect(properties.deleted.type).toEqual(["boolean", "null"]);
  });

  it("verlangt bei einer Quittung nur success", () => {
    expect(buildOutputSchema(POSTINGS_CREATE_FREE).required).toEqual(["success"]);
  });
});

describe("Die Antwort bleibt messbar klein", () => {
  it("schätzt die Tokenzahl aus Text und strukturiertem Teil", () => {
    const response = buildToolResponse({
      entry: RECEIPTS_SEARCH,
      mapped: mapGolden(RECEIPTS_SEARCH, "receipts-get-list"),
      args: { list_direction: "inbound", limit: 100, offset: 0 },
    });
    expect(estimateResponseTokens(response)).toBeGreaterThan(0);
    expect(estimateResponseTokens(response)).toBeLessThan(5000);
  });
});
