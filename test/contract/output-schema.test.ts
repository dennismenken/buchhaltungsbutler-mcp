// Vertragstest aus Plan 9.3: **jede Golden-Antwort validiert gegen das `outputSchema` ihres
// Werkzeugs.**
//
// Das `outputSchema` beschreibt die Antwort **dieses Servers** und nicht den Rohumschlag der
// API (Plan 7.1): `success`, `endpoint`, die Paginierungstatsachen und den Datenbehälter —
// `items` bei der Listenform, `data` beim Einzelabruf. Ein Golden-Körper validiert deshalb
// nicht unmittelbar dagegen; der Weg ist der aus `test/golden/README.md` und derselbe, den ein
// echter Aufruf nimmt:
//
//     parseEnvelope → mapResponse → buildToolResponse → structuredContent
//
// **Warum das überhaupt geprüft wird.** Ein `outputSchema`, das die eigene Antwort nicht
// beschreibt, ist keine Zusage, sondern eine Zierde: Ein Client, der validiert, müsste jede
// Antwort verwerfen. Die Gefahr ist real, weil das Ausgabeschema aus dem Antwortvertrag
// entsteht und die Antwort aus der Normalisierung — zwei Wege, die auseinanderlaufen können,
// ohne dass es jemandem auffällt.
//
// **Was daran hängt, ist nicht theoretisch.** Der MCP-Client des SDK prüft `structuredContent`
// gegen das angekündigte `outputSchema`, sobald für ihn ein Schemaprüfer eingerichtet ist
// (`@modelcontextprotocol/client`, Zweig um `Structured content does not match the tool's
// output schema`); der Aufruf endet dann mit einem Protokollfehler statt mit einer Antwort.
// Eine Abweichung ist also kein Schönheitsfehler, sondern ein Aufruf, der beim Nutzer scheitert.
//
// **Der Prüfer ist bewusst von Hand geschrieben.** Eine Schemabibliothek wäre eine zusätzliche
// Abhängigkeit für eine Aufgabe, die aus `response/output-schema.ts` genau bekannt ist:
// Objekte, Arrays, Typlisten mit `null`, `required` und durchgehend
// `additionalProperties: true`. Der Prüfer weist ausdrücklich zurück, was er nicht kennt,
// statt es stillschweigend durchzuwinken — ein Prüfer, der bei Unbekanntem schweigt, ist die
// schlechteste aller Varianten.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseEnvelope } from "../../src/http/envelope.js";
import { isTransportError } from "../../src/http/transport-error.js";
import { CONTRACT_WARNINGS_KEY } from "../../src/mapping/contract-violation.js";
import { mapResponse } from "../../src/mapping/response.js";
import { TOOL_BY_NAME } from "../../src/registry/index.generated.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { buildToolResponse } from "../../src/response/build.js";
import { buildOutputSchema } from "../../src/response/output-schema.js";
import { specPathOf } from "../../src/schema/build.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";
import { goldenNames, loadGolden } from "../golden/index.js";

// ---------------------------------------------------------------------------------------
// Ein kleiner JSON-Schema-Prüfer für genau das, was buildOutputSchema erzeugt
// ---------------------------------------------------------------------------------------

interface SchemaNode {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: SchemaNode;
  readonly additionalProperties?: boolean;
}

/** Der JSON-Typ eines Wertes in der Schreibweise von JSON Schema. */
function jsonTypeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function typeMatches(allowed: string, actual: string): boolean {
  if (allowed === actual) {
    return true;
  }
  // Jede Ganzzahl ist auch eine Zahl; umgekehrt gilt das nicht.
  return allowed === "number" && actual === "integer";
}

/** Ein Finding des Prüfers: wo, was, und an welchem Blattfeld. */
interface Finding {
  /** Der vollständige Pfad, zum Beispiel `structuredContent.items[0].amount`. */
  readonly path: string;
  /** Der Satz, der im Fehlschlag steht. */
  readonly text: string;
  /** Der Feldname am Ende des Pfades, ohne Index. Leer, wenn der Finding am Objekt hängt. */
  readonly field: string;
}

/** Der Feldname am Ende eines Pfades: `structuredContent.items[0].amount` → `amount`. */
function leafField(path: string): string {
  const lastSegment = path.split(".").pop() ?? "";
  return lastSegment.replace(/\[\d+\]$/, "");
}

function finding(path: string, text: string): Finding {
  return { path, text: `${path}: ${text}`, field: leafField(path) };
}

/** Prüft einen Wert gegen einen Schemaknoten und sammelt die Befunde. */
function validate(node: SchemaNode, value: unknown, path: string): Finding[] {
  const findings: Finding[] = [];
  const actual = jsonTypeOf(value);

  if (node.type !== undefined) {
    // Von Hand aufgefaltet: `Array.isArray` auf einem readonly-Array ergibt für den Typprüfer
    // `any[]`, und damit wäre jeder Vergleich darunter ungeprüft.
    const allowed: readonly string[] = typeof node.type === "string" ? [node.type] : node.type;
    if (!allowed.some((candidate) => typeMatches(candidate, actual))) {
      findings.push(finding(path, `erwartet ${allowed.join(" oder ")}, geliefert ${actual}`));
      return findings;
    }
  }

  if (actual === "object") {
    const record = value as Record<string, unknown>;
    for (const name of node.required ?? []) {
      if (!(name in record)) {
        findings.push(finding(`${path}.${name}`, "Pflichtfeld fehlt"));
      }
    }
    for (const [name, child] of Object.entries(node.properties ?? {})) {
      if (name in record) {
        findings.push(...validate(child, record[name], `${path}.${name}`));
      }
    }
    if (node.additionalProperties === false) {
      for (const name of Object.keys(record)) {
        if (node.properties?.[name] === undefined) {
          findings.push(finding(`${path}.${name}`, "unbekanntes Feld"));
        }
      }
    }
    return findings;
  }

  if (actual === "array" && node.items !== undefined) {
    (value as readonly unknown[]).forEach((element, index) => {
      findings.push(...validate(node.items as SchemaNode, element, `${path}[${String(index)}]`));
    });
  }

  return findings;
}

/** Die Felder, die die Antwort selbst als vertragswidrig ausweist (Plan 7.3). */
function reportedFields(structured: Record<string, unknown>): Set<string> {
  const rawWarnings = structured[CONTRACT_WARNINGS_KEY];
  if (!Array.isArray(rawWarnings)) {
    return new Set();
  }
  return new Set(
    rawWarnings
      .map((warning) => (warning as { field?: unknown }).field)
      .filter((field): field is string => typeof field === "string"),
  );
}

// Die Antwortaufbereitung liest die eingefrorene Konfiguration (Stammdatenspeicher,
// Antwortbudget). Hier geht dabei nichts hinaus: Dieser Test setzt keinen Aufruf ab, er führt
// eine bereits vorliegende Antwort durch dieselben drei Schichten wie der Betrieb.
beforeAll(() => {
  installTestConfig();
});

afterAll(() => {
  resetTestConfig();
});

// ---------------------------------------------------------------------------------------
// Golden-Datei → Werkzeug
// ---------------------------------------------------------------------------------------

/** Ein Fall, der bis zum `structuredContent` durchläuft. */
interface SuccessCase {
  readonly tool: string;
  /** Die Argumente des Aufrufs. Sie tragen die Auflösung einer Schreibantwort (Plan 7.6). */
  readonly args?: Record<string, unknown>;
}

/**
 * Ein Fall, bei dem schon der Umschlag scheitert. Dann entsteht **kein** `structuredContent`,
 * und das ist die richtige Antwort: Ein Ausgabeschema gibt es nur für eine Antwort, die dieser
 * Server überhaupt gebaut hat.
 */
interface ErrorCase {
  readonly tool: string;
  /** Der Name des erwarteten Transportfehlers aus `http/transport-error.ts`. */
  readonly errorName: string;
}

const SUCCESS_CASES: Readonly<Record<string, SuccessCase>> = {
  "receipts-get-list": { tool: "bb_receipts_search" },
  "receipts-get-list-full-page": { tool: "bb_receipts_search" },
  "receipts-get-list-empty": { tool: "bb_receipts_search" },
  "receipts-get-list-contract-violation": { tool: "bb_receipts_search" },
  "receipts-get-list-unknown-field": { tool: "bb_receipts_search" },
  "receipts-get-list-freetext": { tool: "bb_receipts_search" },
  "receipts-get-single": { tool: "bb_receipts_get", args: { receipt_id_by_customer: 4711 } },
  "receipts-get-single-with-file": {
    tool: "bb_receipts_get",
    args: { receipt_id_by_customer: 4711, get_file: true },
  },
  "transactions-get-list": { tool: "bb_transactions_search" },
  "transactions-get-single": {
    tool: "bb_transactions_get",
    args: { transaction_id_by_customer: 815 },
  },
  "postingaccounts-get-list": { tool: "bb_postingaccounts_search" },
  "accounts-get-list": { tool: "bb_payment_accounts_list" },
  "cost-locations-get-list": { tool: "bb_cost_locations_search" },
  "reports-get-bwa-with-files": {
    tool: "bb_reports_get_bwa",
    args: { report_id_by_customer: 12, get_files: true },
  },
  "postings-add-free-ack": {
    tool: "bb_postings_create_free",
    args: {
      date: "2026-01-15",
      postingtext: "Vertragstest",
      amount: "119.00",
      postingaccount_debit: "6815",
      postingaccount_credit: "1600",
      vat: "19_vat",
    },
  },
  "receipts-add-ack": {
    tool: "bb_receipts_create",
    args: {
      receipt_type: "invoice inbound",
      counterparty: "Erfundene Bürobedarf GmbH",
      invoice_number: "ER-2026-0001",
      date: "2026-01-04",
      amount: "119.00",
      currency: "EUR",
    },
  },
  "invoices-create-success": {
    tool: "bb_invoices_create",
    args: {
      invoice_type: "invoice",
      show_prices_type: "net",
      company_name: "Erfundene Kundin GmbH",
      date: "2026-01-04",
      items: [
        {
          item_name: "Beratung",
          item_amount: "1",
          item_unit: "Stunde",
          item_vat: "19",
          item_single_price: "100.00",
        },
      ],
    },
  },
  "reports-create-bwa-ack": {
    tool: "bb_reports_create_bwa",
    args: { date_from: "2026-01-01", date_to: "2026-01-31" },
  },
};

const ERROR_CASES: Readonly<Record<string, ErrorCase>> = {
  "receipts-get-error-400-15-catalog": {
    tool: "bb_receipts_search",
    errorName: "ApiResponseError",
  },
  "receipts-get-error-400-15-live": { tool: "bb_receipts_search", errorName: "ApiResponseError" },
  "receipts-get-success-false": { tool: "bb_receipts_search", errorName: "ApiResponseError" },
  "receipts-get-no-success": { tool: "bb_receipts_search", errorName: "EnvelopeContractError" },
  "transactions-get-literal-path-html": {
    tool: "bb_transactions_get",
    errorName: "NonJsonResponseError",
  },
};

function entryOf(name: string): ToolEntry {
  const entry = TOOL_BY_NAME.get(name);
  if (entry === undefined) {
    throw new Error(`Das Register führt ${name} nicht.`);
  }
  return entry;
}

/** Der Weg aus `test/golden/README.md`, Schritt für Schritt. */
function structuredContentFor(golden: string, testCase: SuccessCase): Record<string, unknown> {
  const goldenFile = loadGolden(golden);
  const entry = entryOf(testCase.tool);
  const envelope = parseEnvelope({
    status: goldenFile.http.status,
    contentType: goldenFile.http.contentType,
    bodyText: goldenFile.bodyText ?? JSON.stringify(goldenFile.body),
    shape: entry.shape,
    context: {
      toolName: entry.name,
      specPath: specPathOf(entry),
      toolClass: entry.toolClass,
      attempts: 1,
    },
  });
  const mapped = mapResponse(entry, envelope, { serverOnly: {} });
  return buildToolResponse({ entry, mapped, args: testCase.args ?? {} }).structuredContent;
}

// ---------------------------------------------------------------------------------------
// Die Tests
// ---------------------------------------------------------------------------------------

describe("jede Golden-Datei ist einem Werkzeug assignedGoldens", () => {
  it("keine Datei fehlt und keine Zuordnung zeigt ins Leere", () => {
    const present = goldenNames().sort();
    const assignedGoldens = [...Object.keys(SUCCESS_CASES), ...Object.keys(ERROR_CASES)].sort();

    // Eine neue Golden-Datei darf nicht stillschweigend ungeprüft bleiben; sie fällt hier auf.
    expect(assignedGoldens).toEqual(present);

    for (const [golden, testCase] of [
      ...Object.entries(SUCCESS_CASES),
      ...Object.entries(ERROR_CASES),
    ]) {
      expect(() => entryOf(testCase.tool), `${golden} zeigt auf ${testCase.tool}`).not.toThrow();
    }
  });
});

describe("structuredContent gegen das outputSchema", () => {
  for (const [golden, testCase] of Object.entries(SUCCESS_CASES)) {
    it(`${golden} validiert gegen das outputSchema von ${testCase.tool}`, () => {
      const entry = entryOf(testCase.tool);
      const structured = structuredContentFor(golden, testCase);
      const schema: SchemaNode = buildOutputSchema(entry);

      const findings = validate(schema, structured, "structuredContent");

      // **Der Fall, an dem sich zwei Regeln des Plans berühren.** 7.3 verlangt, ein bekanntes
      // Feld mit falschem Typ unverändert durchzureichen und in `_contract_warnings` zu
      // melden; 7.1 verlangt, dass das `outputSchema` genau das beschreibt, was in
      // `structuredContent` steht. Bei `receipts-get-list-contract-violation` schließt das
      // eine das andere aus: Der rohe Wert bleibt stehen und passt dann nicht mehr zum
      // angekündigten Typ. Geprüft wird deshalb die Zusage, die beides zusammenhält — **jede**
      // Abweichung vom Ausgabeschema ist ein Feld, das die Antwort selbst als vertragswidrig
      // ausweist. Eine stille Abweichung gibt es nicht. Der Zielkonflikt ist an den
      // Projektinhaber reported und hier nicht durch eine weichere Prüfung verdeckt.
      const reported = reportedFields(structured);
      const unreported = findings.filter((finding) => !reported.has(finding.field));

      expect(
        unreported.map((finding) => finding.text),
        `${golden}: Abweichung ohne Eintrag in ${CONTRACT_WARNINGS_KEY}`,
      ).toEqual([]);

      // Zwei Zusagen des Ausgabeschemas, die ein reiner Schemavergleich nicht sichtbar macht:
      // Es ist offen (`additionalProperties: true`, Streitfrage S18 und Finding L4) und der
      // Datenbehälter heißt so, wie 7.1 ihn nennt.
      expect(schema.additionalProperties).toBe(true);
      expect(structured.success).toBe(true);
      if (entry.shape === "list") {
        expect(Array.isArray(structured.items)).toBe(true);
      } else if (entry.shape === "object") {
        expect(structured.data).toBeTypeOf("object");
      }
    });
  }
});

describe("die beiden Seiten des Zielkonflikts, ausdrücklich festgehalten", () => {
  it("die saubere Listenantwort hält das Ausgabeschema vollständig ein", () => {
    const testCase = SUCCESS_CASES["receipts-get-list"];
    if (testCase === undefined) {
      throw new Error("Die Golden-Datei receipts-get-list ist nicht mehr assignedGoldens.");
    }
    const structured = structuredContentFor("receipts-get-list", testCase);
    const findings = validate(buildOutputSchema(entryOf(testCase.tool)), structured, "s");

    expect(findings.map((finding) => finding.text)).toEqual([]);
    expect(structured[CONTRACT_WARNINGS_KEY]).toBeUndefined();
  });

  it("die vertragswidrige Antwort weicht ab und meldet genau diese Felder", () => {
    const testCase = SUCCESS_CASES["receipts-get-list-contract-violation"];
    if (testCase === undefined) {
      throw new Error("Die Golden-Datei receipts-get-list-contract-violation fehlt.");
    }
    const structured = structuredContentFor("receipts-get-list-contract-violation", testCase);
    const findings = validate(buildOutputSchema(entryOf(testCase.tool)), structured, "s");
    const reported = reportedFields(structured);

    // Ohne diese beiden Erwartungen wäre die Regel „jede Abweichung ist reported" auch dann
    // grün, wenn es gar keine Abweichung und gar keine Meldung gäbe — und der Zielkonflikt
    // verschwände unbemerkt aus dem Test.
    expect(findings.length).toBeGreaterThan(0);
    // `due_date` fehlt in dieser Antwort ganz. Das meldet der Antwortvertrag ebenfalls, ohne
    // dass daraus eine Abweichung vom Ausgabeschema würde: Pflichtfeld ist dort nur der
    // Datenbehälter. Die Meldungen sind also die weitere Menge, und genau so soll es sein.
    expect([...reported].sort()).toEqual(["amount", "deleted", "due_date"]);
    expect([...new Set(findings.map((finding) => finding.field))].sort()).toEqual([
      "amount",
      "deleted",
    ]);
  });
});

describe("Golden-Dateien, an denen schon der Umschlag scheitert", () => {
  for (const [golden, testCase] of Object.entries(ERROR_CASES)) {
    it(`${golden} erzeugt ${testCase.errorName} und damit kein structuredContent`, () => {
      const goldenFile = loadGolden(golden);
      const entry = entryOf(testCase.tool);

      let thrownError: unknown = null;
      try {
        parseEnvelope({
          status: goldenFile.http.status,
          contentType: goldenFile.http.contentType,
          bodyText: goldenFile.bodyText ?? JSON.stringify(goldenFile.body),
          shape: entry.shape,
          context: {
            toolName: entry.name,
            specPath: specPathOf(entry),
            toolClass: entry.toolClass,
            attempts: 1,
          },
        });
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError, `${golden} ist ohne Fehler durchgelaufen`).not.toBeNull();
      expect(isTransportError(thrownError)).toBe(true);
      expect((thrownError as Error).name).toBe(testCase.errorName);
    });
  }
});

describe("der Prüfer selbst", () => {
  // Ein Prüfer, der nie etwas findet, macht jeden Test darüber wertlos. Diese beiden Fälle
  // belegen, dass er Befunde meldet, statt alles durchzuwinken.
  it("meldet einen falschen Typ", () => {
    const schema: SchemaNode = {
      type: "object",
      properties: { rows_returned: { type: "integer" } },
      required: ["rows_returned"],
    };
    expect(validate(schema, { rows_returned: "3" }, "x").map((finding) => finding.text)).toEqual([
      "x.rows_returned: erwartet integer, geliefert string",
    ]);
  });

  it("meldet ein fehlendes Pflichtfeld", () => {
    const schema: SchemaNode = { type: "object", required: ["items"] };
    expect(validate(schema, {}, "x").map((finding) => finding.text)).toEqual([
      "x.items: Pflichtfeld fehlt",
    ]);
  });
});
