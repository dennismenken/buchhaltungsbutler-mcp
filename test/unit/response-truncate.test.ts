import { describe, expect, it } from "vitest";

import { CHARS_PER_TOKEN } from "../../src/registry/budget.js";
import {
  base64SizeInBytes,
  BASE64_FIELD_NAMES,
  BASE64_HEURISTIC_MIN_LENGTH,
  binaryTextLine,
  estimateTokens,
  estimateTokensOfValue,
  fitRows,
  formatBytes,
  HARD_RESPONSE_TOKEN_LIMIT,
  looksLikeBase64,
  mediaTypeOf,
  replaceBinaryPayloads,
  truncationNote,
} from "../../src/response/truncate.js";
import { goldenBody } from "../golden/index.js";

// Plan 7.6 und 9.5: „eine Antwort mit 1000 Zeilen wird gekürzt, die Kürzung ausgewiesen, die
// Bestandszeile lügt nicht"; Base64 erscheint nie im Textblock.

describe("Die Schätzung", () => {
  it("rechnet über CHARS_PER_TOKEN und rundet auf", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(32))).toBe(Math.ceil(32 / CHARS_PER_TOKEN));
    expect(estimateTokensOfValue({ a: "b" })).toBe(estimateTokens('{"a":"b"}'));
  });

  it("lädt keinen Tokenizer (Plan 4.10, 13.2)", () => {
    // Belegt über die Zahl selbst: Sie ist genau die Zeichenrechnung und nicht die echte
    // Tokenzahl. Ein Tokenizer zur Laufzeit wäre eine vierte Abhängigkeit.
    expect(estimateTokens("Buchhaltung")).toBe(Math.ceil("Buchhaltung".length / CHARS_PER_TOKEN));
  });

  it("kennt die harte Grenze aus 7.6", () => {
    expect(HARD_RESPONSE_TOKEN_LIMIT).toBe(20_000);
  });
});

describe("fitRows", () => {
  const row = (index: number): Record<string, unknown> => ({
    id_by_customer: String(index),
    counterparty: "Erfundene GmbH",
    amount: "100.00",
  });

  it("liefert alles, was in das Budget passt", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(index));
    const result = fitRows(rows, {
      maxTokens: 5000,
      costOf: (row) => (JSON.stringify(row) ?? "").length,
    });
    expect(result.count).toBe(10);
    expect(result.truncated).toBe(false);
  });

  it("kürzt eine Antwort mit 1000 Zeilen und weist die Kürzung aus", () => {
    const rows = Array.from({ length: 1000 }, (_, index) => row(index));
    const result = fitRows(rows, {
      maxTokens: 500,
      costOf: (row) => (JSON.stringify(row) ?? "").length,
    });
    expect(result.truncated).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.count).toBeLessThan(1000);
    expect(result.budgetTokens).toBe(500);
  });

  it("zieht den bereits verbrauchten Text ab", () => {
    const rows = Array.from({ length: 50 }, (_, index) => row(index));
    const without = fitRows(rows, {
      maxTokens: 200,
      costOf: (row) => (JSON.stringify(row) ?? "").length,
    });
    const withReserved = fitRows(rows, {
      maxTokens: 200,
      reservedChars: 400,
      costOf: (row) => (JSON.stringify(row) ?? "").length,
    });
    expect(withReserved.count).toBeLessThan(without.count);
  });

  it("liefert mindestens eine Zeile, auch wenn sie allein das Budget reißt", () => {
    const result = fitRows([row(1)], { maxTokens: 1, costOf: () => 10_000 });
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("deckelt das weiche Budget an der harten Grenze", () => {
    const result = fitRows([row(1)], { maxTokens: 999_999, costOf: () => 1 });
    expect(result.budgetTokens).toBe(HARD_RESPONSE_TOKEN_LIMIT);
  });

  it("verkraftet eine leere Zeilenmenge", () => {
    const result = fitRows([], { maxTokens: 5000, costOf: () => 1 });
    expect(result).toMatchObject({ count: 0, truncated: false });
  });
});

describe("Die Kürzungsmeldung (Plan 7.6)", () => {
  it("nennt bei detailed beide Zahlen, das Budget und beide Wege zum Rest", () => {
    const note = truncationNote(120, 281, 5000, "detailed");
    expect(note).toBe(
      "120 von 281 gelieferten Zeilen werden angezeigt; der Rest wurde weggelassen, um im " +
        "Antwortbudget zu bleiben (rund 5000 Token). Auf Seiten der API ist nichts verloren " +
        'gegangen. Um den Rest zu sehen, enger filtern oder response_format="concise" setzen.',
    );
  });

  // Der Rat, response_format="concise" zu setzen, wäre bei bereits kurzer Projektion ein Rat
  // zum wortgleichen Aufruf: gleiche Antwort, ein Request weniger im Minutenkontingent.
  it("rät bei concise nicht zu einem Aufruf, der nichts ändert", () => {
    const note = truncationNote(27, 500, 5000, "concise");
    expect(note).toBe(
      "27 von 500 gelieferten Zeilen werden angezeigt; der Rest wurde weggelassen, um im " +
        "Antwortbudget zu bleiben (rund 5000 Token). Auf Seiten der API ist nichts verloren " +
        "gegangen. Um den Rest zu sehen, enger filtern.",
    );
    expect(note).not.toContain("response_format");
  });

  it("behauptet keinen Datenverlust", () => {
    expect(truncationNote(1, 2, 5000, "concise")).toContain(
      "Auf Seiten der API ist nichts verloren gegangen",
    );
    expect(truncationNote(1, 2, 5000, "detailed")).toContain(
      "Auf Seiten der API ist nichts verloren gegangen",
    );
  });
});

describe("Base64 erscheint nie im Textblock (Plan 7.6)", () => {
  it("erkennt eine eingebettete Datei an Länge und Zeichenvorrat", () => {
    const base64 = "QUJDRA==".repeat(100);
    expect(looksLikeBase64(base64)).toBe(true);
    expect(looksLikeBase64("kurz")).toBe(false);
    expect(looksLikeBase64("Text mit Leerzeichen ".repeat(40))).toBe(false);
    expect(BASE64_FIELD_NAMES).toContain("file_content");
    expect(BASE64_FIELD_NAMES).toContain("pdf");
    expect(BASE64_FIELD_NAMES).toContain("csv");
    expect(BASE64_HEURISTIC_MIN_LENGTH).toBe(512);
  });

  it("rechnet die Größe ohne zu dekodieren", () => {
    const content = Buffer.from("a".repeat(1000)).toString("base64");
    expect(base64SizeInBytes(content)).toBe(1000);
    expect(formatBytes(512)).toBe("512 Bytes");
    expect(formatBytes(421_888)).toBe("412 KB");
    expect(formatBytes(3_145_728)).toBe("3.0 MB");
  });

  it("benennt die Art aus dem Feldnamen", () => {
    expect(mediaTypeOf("pdf")).toBe("application/pdf");
    expect(mediaTypeOf("csv")).toBe("text/csv");
    expect(mediaTypeOf("csv_archive")).toBe("application/zip");
    expect(mediaTypeOf("file_content")).toBe("unbekannt");
  });

  it("ersetzt die Dateien eines Berichts durch Platzhalter mit Größenangabe", () => {
    const report = goldenBody("reports-get-bwa-with-files");
    const result = replaceBinaryPayloads(report);
    const fileEntries = (result.value as { files: Record<string, unknown> }).files;
    expect(fileEntries.pdf).toMatchObject({
      _binary: true,
      field: "pdf",
      media_type: "application/pdf",
    });
    expect((fileEntries.pdf as { size_bytes: number }).size_bytes).toBeGreaterThan(0);
    expect(JSON.stringify(result.value)).not.toContain("RXJmdW5kZW5lcg");
    expect(result.replaced.map((entry) => entry.path).sort()).toEqual(["files.csv", "files.pdf"]);
    expect(result.replaced.every((entry) => entry.replaced)).toBe(true);
  });

  it("lässt eine ausdrücklich angeforderte Datei im strukturierten Teil stehen", () => {
    const report = goldenBody("reports-get-bwa-with-files");
    const result = replaceBinaryPayloads(report, { requested: true });
    const fileEntries = (result.value as { files: Record<string, unknown> }).files;
    expect(typeof fileEntries.pdf).toBe("string");
    expect(result.replaced.every((entry) => !entry.replaced)).toBe(true);
    // Der Textblock bekommt trotzdem nur die Zeile mit Art und Größe.
    const line = binaryTextLine(result.replaced[0]);
    expect(line).toContain("im strukturierten Teil der Antwort");
    expect(line).not.toContain("RXJm");
  });

  it("ersetzt file_content des Belegeinzelabrufs", () => {
    const receipt = goldenBody("receipts-get-single-with-file");
    const result = replaceBinaryPayloads(receipt);
    const dataObject = (result.value as { data: Record<string, unknown> }).data;
    expect(dataObject.file_content).toMatchObject({ _binary: true, field: "file_content" });
    expect(dataObject.file_type).toBe("pdf");
    expect(result.replaced[0]?.path).toBe("data.file_content");
  });

  it("lässt gewöhnliche Felder unangetastet", () => {
    const result = replaceBinaryPayloads({
      counterparty: "Erfundene GmbH",
      amount: "884.65",
      file_content: "rechnung.pdf",
      numbers: [1, 2, 3],
      nested: { deep: null },
    });
    expect(result.replaced).toEqual([]);
    expect(result.value).toEqual({
      counterparty: "Erfundene GmbH",
      amount: "884.65",
      file_content: "rechnung.pdf",
      numbers: [1, 2, 3],
      nested: { deep: null },
    });
  });

  it("schreibt die Textzeile mit Art, Größe und Lage", () => {
    expect(
      binaryTextLine({
        path: "files.pdf",
        mediaType: "application/pdf",
        sizeBytes: 421_888,
        replaced: false,
      }),
    ).toBe("files.pdf: PDF, 412 KB, im strukturierten Teil der Antwort.");
    expect(
      binaryTextLine({
        path: "files.csv",
        mediaType: "text/csv",
        sizeBytes: 2048,
        replaced: true,
      }),
    ).toBe("files.csv: text/csv, 2 KB, nicht ausgeliefert (nicht angefordert).");
  });
});
