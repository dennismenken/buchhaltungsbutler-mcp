import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  countCatalogPairs,
  EXPECTED_PAIR_COUNT,
  EXPECTED_PATH_COUNT,
  isErrorCatalogLoaded,
  listCatalogPairs,
  loadErrorCatalog,
  lookupErrorEntry,
  lookupInCatalog,
  resetErrorCatalogForTests,
} from "../../src/errors/catalog.js";

// Die vier Pfade mit dem Platzhaltersegment id_by_customer. Der Katalog ist über den
// UNVERÄNDERTEN Spezifikationspfad erreichbar und nie über den gebauten Pfad:
// Der Schlüssel /receipts/get/2 steht in keiner Tabelle, und jeder Fehler dieser vier
// Werkzeuge fiele sonst auf die Rückfallregel zurück.
const TEMPLATE_PATHS = [
  "/receipts/get/id_by_customer",
  "/receipts/delete/id_by_customer",
  "/receipts/restore/id_by_customer",
  "/transactions/get/id_by_customer",
];

const SOURCE = readFileSync(resolve(import.meta.dirname, "../../src/errors/catalog.ts"), "utf8");

beforeEach(() => {
  resetErrorCatalogForTests();
});

describe("src/errors/catalog.ts", () => {
  it("lädt den Katalog dynamisch und nicht beim Laden des Moduls", () => {
    // Punkt 1: Im Normalbetrieb tritt kein Fehler auf, und dann kostet der größte
    // einzelne Datenblock des Pakets null Ladezeit und null Speicher.
    expect(isErrorCatalogLoaded()).toBe(false);
    expect(SOURCE).toContain('import("../generated/errors.js")');
    // Der einzige statische Verweis auf das Generat ist ein TYP-Import; er wird beim
    // Übersetzen entfernt und lädt zur Laufzeit nichts nach.
    expect(SOURCE).toMatch(/^import type \{[^}]*\} from "\.\.\/generated\/errors\.js";$/m);
    expect(SOURCE).not.toMatch(/^import \{[^}]*\} from "\.\.\/generated\/errors\.js";$/m);
  });

  it("merkt sich den geladenen Katalog", async () => {
    const first = await loadErrorCatalog();
    expect(isErrorCatalogLoaded()).toBe(true);
    const second = await loadErrorCatalog();
    expect(second).toBe(first);
  });

  it("deckt alle 786 Paare über 54 Pfade ab", async () => {
    const catalog = await loadErrorCatalog();
    expect(Object.keys(catalog)).toHaveLength(EXPECTED_PATH_COUNT);
    expect(countCatalogPairs(catalog)).toBe(EXPECTED_PAIR_COUNT);
    expect(listCatalogPairs(catalog)).toHaveLength(EXPECTED_PAIR_COUNT);
  });

  it("führt zu jedem Paar beide Texte und eine Klasse", async () => {
    const catalog = await loadErrorCatalog();
    for (const { specPath, errorCode, entry } of listCatalogPairs(catalog)) {
      const where = `${specPath} (${errorCode})`;
      expect(entry.message.length, where).toBeGreaterThan(0);
      expect(entry.summary.length, where).toBeGreaterThan(0);
      expect(entry.status, where).toBeGreaterThanOrEqual(400);
      expect(["config", "input", "transient", "final", "special"], where).toContain(entry.cls);
    }
  });

  it("ist über den Spezifikationspfad erreichbar, nicht über den gebauten Pfad", async () => {
    const catalog = await loadErrorCatalog();
    for (const path of TEMPLATE_PATHS) {
      expect(Object.keys(catalog[path] ?? {}).length, path).toBeGreaterThan(0);
    }
    // Der gebaute Pfad trägt eine Geschäftskennung und steht in keiner Tabelle.
    expect(lookupInCatalog(catalog, "/receipts/get/2", 5)).toBeNull();
    expect(lookupInCatalog(catalog, "/receipts/get/id_by_customer", 5)).not.toBeNull();
  });

  it("liefert null für ein Paar, das die Spezifikation nicht führt", async () => {
    // Kein Raten, keine Zuordnung zu einem gleichnamigen Code eines anderen Pfades.
    expect(await lookupErrorEntry("/receipts/get", 999)).toBeNull();
    expect(await lookupErrorEntry("/gibt/es/nicht", 5)).toBeNull();
  });

  it("lädt den Katalog gar nicht erst, wenn kein error_code vorliegt", async () => {
    expect(await lookupErrorEntry("/receipts/get", null)).toBeNull();
    expect(isErrorCatalogLoaded()).toBe(false);
  });
});
