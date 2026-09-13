import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ErrorCatalog, listCatalogPairs, loadErrorCatalog } from "../../src/errors/catalog.js";
import {
  classifyFailure,
  classifyWithCatalog,
  describeAmbiguity,
  THROTTLE_ERROR_CODE,
  THROTTLE_PATHS,
} from "../../src/errors/classify.js";
import { setLogLevel } from "../../src/logging/stderr.js";

const SOURCE = readFileSync(resolve(import.meta.dirname, "../../src/errors/classify.ts"), "utf8");

let catalog: ErrorCatalog;

beforeEach(async () => {
  catalog = await loadErrorCatalog();
  setLogLevel("warn");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function classifyPair(specPath: string, errorCode: number, status: number, apiMessage?: string) {
  return classifyWithCatalog(catalog, {
    specPath,
    errorCode,
    status,
    apiMessage: apiMessage ?? null,
  });
}

/** Entfernt Kommentare, damit nur echter Quelltext geprüft wird. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("Keine Gleichheitsvergleiche auf Meldungstexte (Plan 5.6, AP08 Punkt 2)", () => {
  const sourceText = withoutComments(SOURCE);

  it("vergleicht nirgends mit === oder !== gegen eine Zeichenkette, die kein Klassenname ist", () => {
    const allowed = new Set([
      "config",
      "input",
      "transient",
      "final",
      "special",
      "catalog",
      "runtime-rule",
      "fallback",
    ]);
    const matched = [
      ...sourceText.matchAll(/(?:===|!==)\s*"((?:[^"\\]|\\.)*)"/g),
      ...sourceText.matchAll(/"((?:[^"\\]|\\.)*)"\s*(?:===|!==)/g),
    ].map((m) => m[1] ?? "");
    for (const value of matched) {
      expect(allowed, `Vergleich gegen "${value}"`).toContain(value);
    }
  });

  it("trägt überhaupt keinen Katalogtext als Zeichenkette im Quelltext", () => {
    // Der schärfere Nachweis: Steht kein Katalogtext in der Datei, kann auch keiner verglichen
    // werden — weder mit === noch sonstwie.
    const catalogTexts = new Set<string>();
    for (const { entry } of listCatalogPairs(catalog)) {
      catalogTexts.add(entry.message);
      catalogTexts.add(entry.summary);
    }
    const literals = [...sourceText.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1] ?? "");
    for (const literal of literals) {
      expect(catalogTexts.has(literal), `Katalogtext im Quelltext: "${literal}"`).toBe(false);
    }
  });

  it("sieht einen Meldungstext an genau einer Stelle an", () => {
    // Teilzeichenketten ohne Rücksicht auf Groß- und Kleinschreibung, und das an einer
    // einzigen Stelle: containsInsensitive. Ein zweiter toLowerCase-Aufruf wäre eine zweite,
    // ungeprüfte Textweiche.
    expect(sourceText.match(/toLowerCase\(\)/g) ?? []).toHaveLength(1);
  });
});

describe("Die Klasse hängt am Paar, nicht am Code", () => {
  it("ordnet Code 7 an zwei Pfaden verschieden ein", () => {
    // /receipts/get: invalid date_from specified. /reports/get/bwa: report was not found.
    expect(classifyPair("/receipts/get", 7, 400).cls).toBe("input");
    expect(classifyPair("/reports/get/bwa", 7, 400).cls).toBe("final");
  });

  it("ordnet Code 8 an zwei Pfaden verschieden ein", () => {
    expect(classifyPair("/reports/get/sums", 8, 400).cls).toBe("special");
    expect(classifyPair("/reports/create/sums", 8, 400).cls).toBe("input");
  });

  it("ordnet Code 12 an drei Pfaden verschieden ein", () => {
    expect(classifyPair("/receipts/upload", 12, 403).cls).toBe("final");
    expect(classifyPair("/reports/get/sums/ledger", 12, 400).cls).toBe("input");
    expect(classifyPair("/reports/create/bwa", 12, 400).cls).toBe("special");
  });

  it("ordnet Code 23 an zwei Pfaden verschieden ein", () => {
    expect(classifyPair("/transactions/add", 23, 400, "invalid booking text specified").cls).toBe(
      "special",
    );
    expect(classifyPair("/invoices/create", 23, 400).cls).toBe("input");
  });
});

describe("Die elf Paare mit error_code 15", () => {
  it("stuft die zehn Pfade mit HTTP 403 als vorübergehend ein", () => {
    for (const path of THROTTLE_PATHS) {
      const result = classifyPair(path, THROTTLE_ERROR_CODE, 403);
      expect(result.cls, path).toBe("transient");
      expect(result.origin, path).toBe("runtime-rule");
    }
    expect(THROTTLE_PATHS).toHaveLength(10);
  });

  it("stuft /receipts/get mit HTTP 400 als Eingabefehler ein", () => {
    const result = classifyPair("/receipts/get", THROTTLE_ERROR_CODE, 400);
    expect(result.cls).toBe("input");
    expect(result.field).toBe("order");
  });

  it("entscheidet über den Status und nicht über den Wortlaut", () => {
    // Derselbe Pfad, derselbe Code, verschiedener Status: verschiedene Klasse. Der gelieferte
    // Text ist bei beiden Aufrufen derselbe und ändert nichts.
    const throttled = classifyPair("/transactions/add", 15, 403, "adding temporarily restricted");
    const rejectedResult = classifyPair(
      "/transactions/add",
      15,
      400,
      "adding temporarily restricted",
    );
    expect(throttled.cls).toBe("transient");
    // HTTP 400 wird nie wiederholt (5.3); eine Drosselung mit 400 wäre ein Widerspruch, und
    // die sichere Lesart ist die, die keinen weiteren Versuch nahelegt.
    expect(rejectedResult.cls).toBe("input");
  });

  it("liefert dieselbe Einstufung, wenn der Live-Text von der Spezifikation abweicht", () => {
    // Der live gemessene Text (Plan 0.3 Befund L6) steht in keiner der beiden Quellen.
    const result = classifyPair("/receipts/get", 15, 400, "invalid field specified");
    expect(result.cls).toBe("input");
    expect(result.entry?.message).toBe("invalid sort field specified");
  });
});

describe("Die Sonderfälle", () => {
  it("erkennt die Lesart an /transactions/add über eine Teilzeichenkette", () => {
    const bookingTextCase = classifyPair(
      "/transactions/add",
      23,
      400,
      "INVALID BOOKING TEXT SPECIFIED",
    );
    expect(bookingTextCase.reading?.id).toBe("transactions-add-booking-text");
    expect(bookingTextCase.field).toBe("booking_text");

    const noBodyCase = classifyPair(
      "/transactions/add",
      24,
      400,
      "no post and files content received or declined",
    );
    expect(noBodyCase.reading?.id).toBe("transactions-add-no-body");
  });

  it("erkennt die beiden Lesarten an /invoices/create/e-invoice", () => {
    expect(
      classifyPair("/invoices/create/e-invoice", 42, 400, "invalid e_invoice_id specified").reading
        ?.id,
    ).toBe("einvoice-id");
    expect(
      classifyPair("/invoices/create/e-invoice", 41, 400, "invalid e_invoice_type specified")
        .reading?.id,
    ).toBe("einvoice-type");
  });

  it("nennt die Mehrdeutigkeit beim Namen", () => {
    expect(describeAmbiguity("/transactions/add", 23)).toContain("error_code 23");
    expect(describeAmbiguity("/receipts/get", 5)).toBeNull();
  });

  it("trägt die ausformulierten Hinweise der vier Sonderfälle", () => {
    expect(classifyPair("/reports/get/bwa", 8, 400).guidance).toContain("bb_reports_create_bwa");
    expect(classifyPair("/reports/get/sums", 7, 400).guidance).toContain("BB_MCP_READ_ONLY");
    expect(classifyPair("/reports/create/sums", 12, 400).guidance).toContain("bb_reports_get_sums");
    expect(classifyPair("/receipts/upload", 12, 403).guidance).toContain("kein Minutenlimit");
    expect(classifyPair("/invoices/create", 33, 403).guidance).toContain("kein Minutenlimit");
  });
});

describe("Die Rückfallregel", () => {
  it("behandelt ein unbekanntes Paar als endgültig und schreibt eine warn-Zeile", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = classifyPair("/receipts/get", 999, 400, "etwas ganz Neues");
    expect(result.cls).toBe("final");
    expect(result.origin).toBe("fallback");
    expect(result.fallback).toBe(true);
    expect(result.entry).toBeNull();
    const output = stderr.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("warn");
    expect(output).toContain("/receipts/get");
  });

  it("greift auch, wenn ein Sonderfall auf kein Muster passt", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = classifyPair("/transactions/add", 23, 400, "etwas völlig anderes");
    expect(result.cls).toBe("final");
    expect(result.fallback).toBe(true);
    // Der Katalogeintrag bleibt erhalten: Die Kurzfassung darf die Meldung weiter nennen.
    expect(result.entry).not.toBeNull();
    expect(stderr.mock.calls.length).toBeGreaterThan(0);
  });

  it("ordnet keinen Code einem gleichnamigen Code eines anderen Pfades zu", () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    // Code 44 gibt es an /invoices/create, nicht an /receipts/get.
    expect(classifyPair("/invoices/create", 44, 400).cls).toBe("input");
    expect(classifyPair("/receipts/get", 44, 400).entry).toBeNull();
  });
});

describe("Die endpunktübergreifenden Codes", () => {
  it("stuft 3, 4 und 11 überall als Konfigurationsfehler ein", async () => {
    for (const [path, code, status] of [
      ["/receipts/get", 3, 401],
      ["/postings/add/free", 4, 401],
      ["/settings/update/debtor", 11, 403],
    ] as const) {
      const result = await classifyFailure({
        specPath: path,
        errorCode: code,
        status,
        apiMessage: null,
      });
      expect(result.cls, `${path} (${code})`).toBe("config");
    }
  });

  it("stuft 0 mit HTTP 500 und 30 mit HTTP 504 als vorübergehend ein", () => {
    expect(classifyPair("/receipts/get", 0, 500).cls).toBe("transient");
    expect(classifyPair("/postings/cancel", 30, 504).cls).toBe("transient");
  });
});

describe("Regeln und Katalog sagen dasselbe", () => {
  it("stuft alle 786 Paare mit ihrem eigenen Status so ein wie der Katalog", () => {
    // Die Regeltabelle in classify.ts ist eine zweite, von Hand gepflegte Quelle. Weicht sie
    // vom Katalog ab, ist eine der beiden falsch — und dieser Test sagt, welche Paare.
    const deviations: string[] = [];
    for (const { specPath, errorCode, entry } of listCatalogPairs(catalog)) {
      const result = classifyWithCatalog(catalog, {
        specPath,
        errorCode,
        status: entry.status,
        apiMessage: entry.message,
      });
      if (result.cls !== entry.cls) {
        deviations.push(`${specPath} (${errorCode}): ${result.cls} statt ${entry.cls}`);
      }
    }
    expect(deviations).toEqual([]);
  });
});
