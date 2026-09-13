import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ENDPOINTS, ENDPOINTS_BY_PATH } from "../../src/generated/endpoints.js";
import { ERRORS } from "../../src/generated/errors.js";
import { PACKAGE_NAME, SERVER_INFO, VERSION } from "../../src/generated/version.js";

// Prüfgrößen, keine Zierde (Plan 0.4, AP03). Jede dieser Zahlen ist am 2026-09-12 maschinell
// gegen docs/openapi/buchhaltungsbutler-v1.json ausgezählt. Ändert sich eine, hat sich die
// Spezifikationsdatei geändert — und dann ist das eine Entscheidung und kein Nebenbefund:
// Der Test schlägt fehl, die Zahl wird bewusst nachgezogen, und die Änderung steht im Diff.
const PATH_COUNT = 54;
const PARAMETER_COUNT = 371;
const ARRAYS_WITHOUT_ITEMS = 32;
const PARAMETERS_WITH_SCHEMA = 9;
const ERROR_PAIR_COUNT = 786;
const MISMATCHED_MESSAGE_PAIRS = 179;

// Die vier Pfade mit dem Platzhaltersegment id_by_customer. Sie stehen im Generat und im
// Fehlerkatalog UNVERÄNDERT; der Pfadbau geschieht erst zur Laufzeit (Plan 4.6).
const PLACEHOLDER_PATHS = [
  "/receipts/get/id_by_customer",
  "/receipts/delete/id_by_customer",
  "/receipts/restore/id_by_customer",
  "/transactions/get/id_by_customer",
];

describe("src/generated/endpoints.ts", () => {
  it("führt genau 54 Pfade, jeden genau einmal", () => {
    expect(ENDPOINTS).toHaveLength(PATH_COUNT);
    expect(new Set(ENDPOINTS.map((endpoint) => endpoint.path)).size).toBe(PATH_COUNT);
    expect(ENDPOINTS_BY_PATH.size).toBe(PATH_COUNT);
  });

  it("führt genau 371 Body-Parameter, davon 54 mal api_key", () => {
    const allParams = ENDPOINTS.flatMap((endpoint) => endpoint.parameters);
    expect(allParams).toHaveLength(PARAMETER_COUNT);
    expect(allParams.filter((parameter) => parameter.name === "api_key")).toHaveLength(PATH_COUNT);
    // 371 minus 54 sind die 317 fachlichen Parameter aus Plan 0.4.
    expect(allParams.length - PATH_COUNT).toBe(317);
  });

  it("nennt keinen Parameter eines Pfades zweimal", () => {
    for (const endpoint of ENDPOINTS) {
      const names = endpoint.parameters.map((parameter) => parameter.name);
      expect(new Set(names).size, `doppelter Parametername an ${endpoint.path}`).toBe(names.length);
    }
  });

  it("markiert die 32 Array-Parameter ohne items", () => {
    const flagged = ENDPOINTS.flatMap((endpoint) =>
      endpoint.parameters.filter((parameter) => parameter.itemsMissing),
    );
    expect(flagged).toHaveLength(ARRAYS_WITHOUT_ITEMS);
    // Die Markierung ist nur an Arrays sinnvoll.
    for (const parameter of flagged) {
      expect(parameter.specType).toBe("array");
    }
  });

  it("löst die neun Parameter mit schema statt type auf", () => {
    const withSchema = ENDPOINTS.flatMap((endpoint) =>
      endpoint.parameters.filter((parameter) => parameter.schema !== undefined),
    );
    expect(withSchema).toHaveLength(PARAMETERS_WITH_SCHEMA);
    // Acht der neun verweisen über $ref auf eine Definition, der neunte trägt ein
    // Inline-Schema: der Platzhalter `order` an /receipts/get (Plan 4.1).
    expect(withSchema.filter((parameter) => parameter.ref !== undefined)).toHaveLength(8);
    const order = ENDPOINTS_BY_PATH.get("/receipts/get")?.parameters.find(
      (parameter) => parameter.name === "order",
    );
    expect(order?.ref).toBeUndefined();
    expect(order?.schema?.itemFields.map((field) => field.name)).toEqual(["field"]);
  });

  it("macht den Widerspruch in PostingsFree sichtbar, statt ihn zu glätten", () => {
    // `amounts` steht in required, es gibt aber nur `amount` (Plan 0.5, Korrektur 1).
    const freePostings = ENDPOINTS_BY_PATH.get("/postings/add-batch/free")?.parameters.find(
      (parameter) => parameter.name === "free_postings",
    );
    expect(freePostings?.schema?.requiredWithoutProperty).toEqual(["amounts"]);
  });

  it("enthält weder HTML noch unaufgelöste Entities", () => {
    const texts: string[] = [];
    for (const endpoint of ENDPOINTS) {
      texts.push(endpoint.summary, endpoint.description);
      for (const parameter of endpoint.parameters) {
        texts.push(parameter.description);
        for (const field of parameter.schema?.itemFields ?? []) texts.push(field.description);
      }
    }
    for (const text of texts) {
      expect(text, `HTML-Element in: ${text}`).not.toMatch(/<\s*\/?\s*(?:br|i|b|strong|em)\b/i);
      expect(text, `Entity in: ${text}`).not.toMatch(/&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+);/);
    }
  });

  it("hält die vier Platzhalterpfade unverändert", () => {
    for (const path of PLACEHOLDER_PATHS) {
      expect(ENDPOINTS_BY_PATH.has(path), `${path} fehlt im Generat`).toBe(true);
    }
    // Der Identifikator kommt in der Parameterliste dieser vier Pfade nicht vor; er steht
    // im Pfad und nie im Body (Plan 4.6, Regel 5).
    for (const path of PLACEHOLDER_PATHS) {
      const names = ENDPOINTS_BY_PATH.get(path)?.parameters.map((parameter) => parameter.name);
      expect(names, `${path} führt id_by_customer als Body-Parameter`).not.toContain(
        "id_by_customer",
      );
    }
  });
});

describe("src/generated/errors.ts", () => {
  const pairs = Object.entries(ERRORS).flatMap(([path, entriesByCode]) =>
    Object.entries(entriesByCode).map(([code, entry]) => ({ path, code: Number(code), entry })),
  );

  it("führt genau 786 Paare (Pfad, error_code) über 54 Pfade", () => {
    expect(Object.keys(ERRORS)).toHaveLength(PATH_COUNT);
    expect(pairs).toHaveLength(ERROR_PAIR_COUNT);
  });

  it("ist auf erster Ebene nach dem unveränderten Spezifikationspfad geschlüsselt", () => {
    // Jeder Katalogpfad ist ein Pfad des Generats, und umgekehrt fehlt keiner. Das ist die
    // Voraussetzung dafür, dass zur Laufzeit mit path.specPath nachgeschlagen werden kann.
    expect(Object.keys(ERRORS).sort()).toEqual([...ENDPOINTS_BY_PATH.keys()].sort());
    for (const path of PLACEHOLDER_PATHS) {
      expect(ERRORS[path], `${path} fehlt im Fehlerkatalog`).toBeDefined();
    }
  });

  it("trägt je Paar zwei getrennt erzeugte Meldungstexte", () => {
    for (const { path, code, entry } of pairs) {
      expect(entry.message.length, `message leer an ${path} Code ${code}`).toBeGreaterThan(0);
      expect(entry.summary.length, `summary leer an ${path} Code ${code}`).toBeGreaterThan(0);
      expect(entry.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("hält die Zahl der abweichenden Meldungspaare auf 179", () => {
    // message stammt aus properties.message.enum[0], summary aus responses[…].description.
    // Keiner der beiden Texte ist aus dem anderen abgeleitet; weicht die Zahl ab, hat sich
    // die Spezifikationsdatei geändert (Plan 5.6).
    const mismatched = pairs.filter(({ entry }) => entry.message !== entry.summary);
    expect(mismatched).toHaveLength(MISMATCHED_MESSAGE_PAIRS);
  });

  it("stuft die elf Paare mit error_code 15 über den HTTP-Status ein", () => {
    // Zehn Pfade führen ihn mit HTTP 403 als vorübergehende Drosselung, /receipts/get als
    // einziger mit HTTP 400 als Eingabefehler (Plan 5.6, Fußnote).
    const code15Pairs = pairs.filter(({ code }) => code === 15);
    expect(code15Pairs).toHaveLength(11);
    for (const { path, entry } of code15Pairs) {
      const expectedClass = entry.status === 403 ? "transient" : "input";
      expect(entry.cls, `falsche Klasse an ${path} Code 15`).toBe(expectedClass);
    }
    expect(ERRORS["/receipts/get"]?.[15]?.status).toBe(400);
    expect(ERRORS["/transactions/add"]?.[15]?.cls).toBe("transient");
  });

  it("bildet das Beispiel aus Plan 5.6 genau ab", () => {
    expect(ERRORS["/receipts/get"]?.[5]).toEqual({
      status: 400,
      message: "invalid list_direction specified",
      summary: "invalid list_direction specified",
      cls: "input",
      field: "list_direction",
    });
    expect(ERRORS["/receipts/get"]?.[15]).toEqual({
      status: 400,
      message: "invalid sort field specified",
      summary: "invalid sort field is specified",
      cls: "input",
      field: "order",
    });
  });

  it("nennt als Feld nur Parameter, die es an diesem Pfad wirklich gibt", () => {
    for (const { path, code, entry } of pairs) {
      if (entry.field === undefined) continue;
      const names = ENDPOINTS_BY_PATH.get(path)?.parameters.map((parameter) => parameter.name);
      expect(names, `unbekanntes Feld ${entry.field} an ${path} Code ${code}`).toContain(
        entry.field,
      );
    }
  });
});

describe("src/generated/version.ts", () => {
  // Der Test gegen das stille Scheitern (AP03): Ein Generat mit leerer oder falscher Version
  // fiele im Betrieb niemandem auf, weil die Version nur bei `initialize` gemeldet wird.
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
  };

  it("liefert genau die Version aus package.json", () => {
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/);
  });

  it("liefert genau den Namen aus package.json", () => {
    expect(PACKAGE_NAME).toBe(pkg.name);
    expect(PACKAGE_NAME).toBe("@dennismenken/buchhaltungsbutler-mcp");
  });

  it("stellt beides als SERVER_INFO bereit", () => {
    expect(SERVER_INFO).toEqual({ name: PACKAGE_NAME, version: VERSION });
  });
});
