// Aus einem Beispiel-ToolEntry entsteht ein striktes Zod-Objekt und daraus ein JSON Schema
// Draft 2020-12 (Plan 11.2, AP05). Dazu die Vollständigkeitsprüfungen gegenüber dem Eintrag.

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  JSON_SCHEMA_DIALECT,
  SchemaBuildError,
  buildToolSchema,
  buildZodSchema,
  specPathOf,
  toJsonSchema,
} from "../../src/schema/build.js";
import { boundedText, strictObject } from "../../src/schema/primitives.js";
import { limit, offset } from "../../src/schema/pagination.js";
import { receiptsOrder } from "../../src/schema/order.js";
import { postingPositions } from "../../src/schema/line-items.js";
import { amountIn, date, idByCustomer, responseFormat } from "../../src/schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../../src/registry/types.js";

// --- Beispieleinträge ----------------------------------------------------------------

function baseEntry(overrides: Partial<ToolEntry>): ToolEntry {
  return {
    name: "bb_beispiel",
    title: "Beispielwerkzeug",
    path: { literal: "/receipts/get" },
    effect: "read",
    toolClass: "R",
    tier: 1,
    description: "Beispielbeschreibung für den Test.",
    fields: [],
    serverOnlyFields: [],
    omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
    responseContract: { container: "data", fields: {}, source: "dokumentiert" },
    shape: "list",
    concise: [],
    bucket: "default",
    timeoutTier: "normal",
    crossChecks: [],
    invalidatesCache: [],
    ...overrides,
  };
}

function field(
  overrides: Partial<FieldSpec> & { name: string; schema: FieldSpec["schema"] },
): FieldSpec {
  return {
    apiNames: [overrides.name],
    source: "body",
    required: false,
    description: overrides.schema.description ?? "Beschreibung des Feldes.",
    ...overrides,
  };
}

/** Ein lesendes Werkzeug mit Paginierung, Sortierung und dem serverseitigen Feld. */
function searchEntry(): ToolEntry {
  return baseEntry({
    name: "bb_receipts_search",
    path: { literal: "/receipts/get" },
    crossChecks: ["Q1", "Q2", "Q3", "Q7"],
    serverOnlyFields: ["response_format"],
    fields: [
      field({
        name: "list_direction",
        required: true,
        schema: boundedText("Richtung der Belegliste: 'incoming' oder 'outgoing'."),
      }),
      field({ name: "date_from", schema: date("Früheste Rechnungsdatum der Treffer") }),
      field({ name: "date_to", schema: date("Spätestes Rechnungsdatum der Treffer") }),
      field({ name: "limit", schema: limit(500, 100) }),
      field({ name: "offset", schema: offset() }),
      field({ name: "order", schema: receiptsOrder() }),
      field({
        name: "response_format",
        apiNames: [],
        source: "server",
        schema: responseFormat(),
      }),
    ],
  });
}

/** Ein Werkzeug mit Pfadvorlage: Der Identifikator geht in den Pfad, nie in den Body. */
function getEntry(): ToolEntry {
  return baseEntry({
    name: "bb_receipts_get",
    path: {
      template: "/receipts/get/{receipt_id_by_customer}",
      params: ["receipt_id_by_customer"],
      specPath: "/receipts/get/id_by_customer",
    },
    shape: "object",
    serverOnlyFields: ["response_format"],
    fields: [
      field({
        name: "receipt_id_by_customer",
        apiNames: [],
        source: "path",
        required: true,
        schema: idByCustomer("des Belegs", "bb_receipts_search"),
      }),
      field({
        name: "get_file",
        schema: z.boolean().describe("Liefert die Belegdatei zusätzlich als base64 zurück."),
      }),
      field({
        name: "response_format",
        apiNames: [],
        source: "server",
        schema: responseFormat(),
      }),
    ],
  });
}

/** Ein buchendes Werkzeug mit Positionsliste. */
function postingEntry(): ToolEntry {
  return baseEntry({
    name: "bb_postings_create_for_receipt",
    path: { literal: "/postings/add/receipt" },
    effect: "create",
    toolClass: "B",
    shape: "ack",
    crossChecks: ["Q3", "Q4"],
    fields: [
      field({
        name: "receipt_id_by_customer",
        required: true,
        schema: idByCustomer("des Belegs", "bb_receipts_search"),
      }),
      field({
        name: "positions",
        apiNames: [
          "postingaccounts",
          "postingtexts",
          "vats",
          "cost_locations",
          "cost_locations_two",
          "amounts",
        ],
        required: true,
        transform: "parallel-arrays",
        itemFields: [
          field({ name: "postingaccount", schema: boundedText("Sachkonto der Zeile.") }),
          field({ name: "postingtext", schema: boundedText("Buchungstext der Zeile.") }),
          field({ name: "vat", schema: boundedText("Steuerschlüssel der Zeile.") }),
          field({ name: "amount", schema: amountIn("Betrag der Zeile") }),
        ],
        schema: postingPositions("receipt", {
          description: "Die Buchungssätze zu diesem Beleg.",
          maxItems: 50,
        }),
      }),
    ],
  });
}

// --- Der Hauptweg --------------------------------------------------------------------

describe("aus einem ToolEntry entsteht ein striktes Zod-Objekt", () => {
  it("nimmt einen gültigen Aufruf an und setzt die Vorgaben ein", () => {
    const { zod } = buildToolSchema(searchEntry());
    expect(zod.parse({ list_direction: "incoming" })).toEqual({
      list_direction: "incoming",
      limit: 100,
      offset: 0,
      response_format: "concise",
    });
  });

  it("lehnt einen unbekannten Schlüssel ab", () => {
    const { zod } = buildToolSchema(searchEntry());
    const result = zod.safeParse({ list_direction: "incoming", limitt: 10 });
    expect(result.success).toBe(false);
  });

  it("macht required: false zu einem optionalen Feld und required: true nicht", () => {
    const { zod } = buildToolSchema(searchEntry());
    expect(zod.safeParse({}).success).toBe(false);
    expect(zod.safeParse({ list_direction: "incoming" }).success).toBe(true);
  });

  it("hängt die Querprüfungen des Eintrags an", () => {
    const { zod } = buildToolSchema(searchEntry());
    const result = zod.safeParse({
      list_direction: "incoming",
      date_from: "2026-03-31",
      date_to: "2026-01-01",
    });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages.join(" ")).toContain("liegt nach date_to");
  });
});

describe("daraus entsteht ein JSON Schema Draft 2020-12", () => {
  it("trägt den Dialekt, den Objekttyp und additionalProperties: false", () => {
    const { jsonSchema } = buildToolSchema(searchEntry());
    expect(jsonSchema["$schema"]).toBe(JSON_SCHEMA_DIALECT);
    expect(jsonSchema["type"]).toBe("object");
    expect(jsonSchema["additionalProperties"]).toBe(false);
  });

  it("führt jedes Feld des Eintrags genau einmal", () => {
    const entry = searchEntry();
    const { jsonSchema } = buildToolSchema(entry);
    const properties = jsonSchema["properties"] as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(entry.fields.map((f) => f.name).sort());
  });

  it("führt nur die Pflichtfelder in required, und Vorgaben nicht", () => {
    const { jsonSchema } = buildToolSchema(searchEntry());
    expect(jsonSchema["required"]).toEqual(["list_direction"]);
  });

  it("trägt die Beschreibung des Eintrags und nicht die des Bausteins, wenn sie abweicht", () => {
    const entry = baseEntry({
      fields: [
        field({
          name: "counterparty",
          description: "Eigene Beschreibung aus dem Registereintrag.",
          schema: boundedText("Beschreibung des Bausteins."),
        }),
      ],
    });
    const properties = buildToolSchema(entry).jsonSchema["properties"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties["counterparty"]?.["description"]).toBe(
      "Eigene Beschreibung aus dem Registereintrag.",
    );
  });

  it("trägt keine internen Markierungen", () => {
    // Der Eintrag führt Q4, also wird die Mengengrenze gebraucht; im Test kommt sie als
    // Argument und nicht aus der Konfiguration.
    const serialized = JSON.stringify(buildToolSchema(postingEntry(), { maxItems: 50 }).jsonSchema);
    expect(serialized).not.toContain("bbKind");
  });

  it("erzeugt das geschachtelte Positionsschema mit Längengrenzen", () => {
    const properties = buildToolSchema(postingEntry(), { maxItems: 50 }).jsonSchema[
      "properties"
    ] as Record<string, Record<string, unknown>>;
    const positions = properties["positions"];
    expect(positions["type"]).toBe("array");
    expect(positions["minItems"]).toBe(1);
    expect(positions["maxItems"]).toBe(50);
    const items = positions["items"] as Record<string, unknown>;
    expect(items["additionalProperties"]).toBe(false);
  });

  it("führt das Pfadsegmentfeld im Eingabeschema, aber als Pflichtfeld", () => {
    const { jsonSchema } = buildToolSchema(getEntry());
    expect(jsonSchema["required"]).toEqual(["receipt_id_by_customer"]);
    expect(specPathOf(getEntry())).toBe("/receipts/get/id_by_customer");
    expect(specPathOf(searchEntry())).toBe("/receipts/get");
  });

  it("wirft, wenn ein Schema am Ende kein striktes Objekt wäre", () => {
    expect(() => toJsonSchema(z.array(z.string()))).toThrow(/immer ein Objekt/);
    expect(() => toJsonSchema(z.object({ a: z.string() }))).toThrow(/additionalProperties/);
    expect(() => toJsonSchema(strictObject({ a: boundedText("A") }))).not.toThrow();
  });
});

// --- Vollständigkeit gegenüber dem Eintrag -------------------------------------------

describe("Vollständigkeit gegenüber dem Eintrag", () => {
  function expectBuildError(entry: ToolEntry, pattern: RegExp): void {
    let thrown: unknown;
    try {
      buildZodSchema(entry);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SchemaBuildError);
    expect((thrown as SchemaBuildError).message).toMatch(pattern);
  }

  it("lehnt ein doppelt geführtes Feld ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({ name: "counterparty", schema: boundedText("Gegenpartei.") }),
          field({ name: "counterparty", schema: boundedText("Gegenpartei, zweimal.") }),
        ],
      }),
      /steht zweimal in fields/,
    );
  });

  it("lehnt eine leere Feldbeschreibung ab", () => {
    expectBuildError(
      baseEntry({
        fields: [field({ name: "counterparty", description: "", schema: boundedText("X") })],
      }),
      /Beschreibung ist leer/,
    );
  });

  it("lehnt Markup aus der Spezifikation in einer Beschreibung ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({
            name: "counterparty",
            description: "Die Gegenpartei.<br/>Wird geprüft.",
            schema: boundedText("X"),
          }),
        ],
      }),
      /ohne Markup/,
    );
  });

  it("erlaubt einen Kleiner-gleich-Vergleich in einer Beschreibung", () => {
    expect(() =>
      buildZodSchema(
        baseEntry({
          fields: [
            field({
              name: "date_delivery",
              description: "Es gilt date_delivery <= date.",
              schema: date("Leistungsdatum"),
            }),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("lehnt ein serverseitiges Feld ab, das nicht in serverOnlyFields steht", () => {
    expectBuildError(
      baseEntry({
        serverOnlyFields: [],
        fields: [
          field({
            name: "response_format",
            apiNames: [],
            source: "server",
            schema: responseFormat(),
          }),
        ],
      }),
      /fehlt in serverOnlyFields/,
    );
  });

  it("lehnt serverOnlyFields ohne zugehöriges Feld ab", () => {
    expectBuildError(
      baseEntry({ serverOnlyFields: ["response_format"], fields: [] }),
      /aber fields führt das Feld nicht/,
    );
  });

  it("lehnt ein Body-Feld ohne apiNames ab", () => {
    expectBuildError(
      baseEntry({
        fields: [field({ name: "counterparty", apiNames: [], schema: boundedText("X") })],
      }),
      /mindestens einen Eintrag in apiNames/,
    );
  });

  it("lehnt ein Pfadfeld mit apiNames ab", () => {
    expectBuildError(
      baseEntry({
        path: {
          template: "/receipts/get/{receipt_id_by_customer}",
          params: ["receipt_id_by_customer"],
          specPath: "/receipts/get/id_by_customer",
        },
        fields: [
          field({
            name: "receipt_id_by_customer",
            apiNames: ["id_by_customer"],
            source: "path",
            required: true,
            schema: idByCustomer("des Belegs", "bb_receipts_search"),
          }),
        ],
      }),
      /leeres apiNames/,
    );
  });

  it("lehnt ein Pfadfeld an einem literalen Pfad ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({
            name: "receipt_id_by_customer",
            apiNames: [],
            source: "path",
            required: true,
            schema: idByCustomer("des Belegs", "bb_receipts_search"),
          }),
        ],
      }),
      /literalen Pfad/,
    );
  });

  it("lehnt einen Platzhalter ohne Feld ab", () => {
    expectBuildError(
      baseEntry({
        path: {
          template: "/receipts/get/{receipt_id_by_customer}",
          params: ["receipt_id_by_customer"],
          specPath: "/receipts/get/id_by_customer",
        },
        fields: [field({ name: "get_file", schema: z.boolean().describe("Datei mitliefern.") })],
      }),
      /fields führt kein solches Feld/,
    );
  });

  it("lehnt ein optionales Pfadsegment ab", () => {
    expectBuildError(
      baseEntry({
        path: {
          template: "/receipts/get/{receipt_id_by_customer}",
          params: ["receipt_id_by_customer"],
          specPath: "/receipts/get/id_by_customer",
        },
        fields: [
          field({
            name: "receipt_id_by_customer",
            apiNames: [],
            source: "path",
            required: false,
            schema: idByCustomer("des Belegs", "bb_receipts_search"),
          }),
        ],
      }),
      /immer Pflicht/,
    );
  });

  it("lehnt required: true neben einem .optional()-Fragment ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({
            name: "counterparty",
            required: true,
            schema: boundedText("Gegenpartei.").optional(),
          }),
        ],
      }),
      /widersprechen sich/,
    );
  });

  it("lehnt eine Umformung ohne itemFields ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({
            name: "positions",
            apiNames: ["amounts"],
            required: true,
            transform: "parallel-arrays",
            schema: postingPositions("receipt", { description: "Die Zeilen.", maxItems: 50 }),
          }),
        ],
      }),
      /verlangt itemFields/,
    );
  });

  it("lehnt eine Umformung ohne Arrayschema ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({
            name: "positions",
            apiNames: ["amounts"],
            required: true,
            transform: "object-list",
            itemFields: [field({ name: "amount", schema: amountIn("Betrag") })],
            schema: boundedText("Kein Array."),
          }),
        ],
      }),
      /verlangt ein Arrayschema/,
    );
  });

  it("lehnt ein Feld innerhalb eines Behälters mit source path ab", () => {
    expectBuildError(
      baseEntry({
        fields: [
          field({
            name: "positions",
            apiNames: ["amounts"],
            required: true,
            transform: "parallel-arrays",
            itemFields: [
              field({ name: "amount", apiNames: [], source: "path", schema: amountIn("Betrag") }),
            ],
            schema: postingPositions("receipt", { description: "Die Zeilen.", maxItems: 50 }),
          }),
        ],
      }),
      /immer source: "body"/,
    );
  });

  it("lehnt eine Querprüfung ohne Grundlage ab", () => {
    expectBuildError.bind(null);
    expect(() =>
      buildZodSchema(
        baseEntry({
          name: "bb_debtors_search",
          path: { literal: "/settings/get/debtors" },
          crossChecks: ["Q2"],
          fields: [field({ name: "limit", schema: limit(null, 100) })],
        }),
      ),
    ).toThrow(/Q2 ist an bb_debtors_search/);
  });

  it("nimmt einen Eintrag ohne Felder an, weil vier Endpunkte nur api_key führen", () => {
    const { jsonSchema } = buildToolSchema(
      baseEntry({ name: "bb_payment_accounts_list", path: { literal: "/accounts/get" } }),
    );
    expect(jsonSchema["type"]).toBe("object");
    expect(jsonSchema["additionalProperties"]).toBe(false);
  });
});
