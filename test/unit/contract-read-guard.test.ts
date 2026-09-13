// Der Wächter des Vertragslaufs.
//
// Der Vertragslauf ist die EINZIGE Ausnahme von der absoluten Regel, und er
// läuft gegen eine echte, produktive Buchhaltung. Dort gibt es keinen folgenlosen
// Schreibvorgang: Ein Kommentar ist über die API nicht löschbar, eine
// Kostenstelle verändert die Kostenstellenauswertung. Deshalb ist nicht die Auswertung des
// Laufs seine wichtigste Eigenschaft, sondern seine Grenze.
//
// Diese Datei weist drei Dinge nach:
//
//   1. Die Erlaubnisliste entsteht AUS DEM REGISTER (`toolClass === "R"`) und deckt sich
//      Eintrag für Eintrag mit den lesenden Werkzeugen. Sie ist nirgends abgeschrieben.
//   2. Der Wächter wirft bei JEDEM der 39 schreibenden Pfade — nicht nur bei einem
//      Beispiel. Ein Test mit einem einzigen Beispiel bewiese nur, dass dieser eine Pfad
//      bekannt ist.
//   3. Er wirft, BEVOR etwas hinausgeht. Der Nachweis ist zweiteilig: eine Attrappe, die
//      protokolliert, ob der Absender berührt wurde, und eine Quelltextprüfung der einen
//      Stelle, an der der Lauf wirklich absendet.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ContractRunGuardError,
  PROBE_PLAN,
  assertAllowedCall,
  buildAllowList,
  compareContract,
  jsonKindOf,
  observeRows,
  parseArgs,
  type AllowedEndpoint,
} from "../../scripts/contract-read.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import type { ToolEntry } from "../../src/registry/types.js";

const SCRIPT = fileURLToPath(new URL("../../scripts/contract-read.ts", import.meta.url));

const READING_TOOLS = TOOL_ENTRIES.filter((entry) => entry.toolClass === "R");
const WRITING_TOOLS = TOOL_ENTRIES.filter((entry) => entry.toolClass !== "R");

function specPathOf(entry: ToolEntry): string {
  return "literal" in entry.path ? entry.path.literal : entry.path.specPath;
}

/** Ein erlaubter Anfragepfad des Eintrags: der literale Pfad oder die gefüllte Vorlage. */
function requestPathOf(entry: ToolEntry): string {
  if ("literal" in entry.path) {
    return entry.path.literal;
  }
  return entry.path.template.replace(/\{[^}]+\}/g, "4711");
}

const ALLOW_LIST = buildAllowList(TOOL_ENTRIES);

describe("Erlaubnisliste des Vertragslaufs", () => {
  it("enthält genau die lesenden Einträge des Registers", () => {
    expect(READING_TOOLS).toHaveLength(15);
    expect([...ALLOW_LIST.keys()].sort()).toEqual(READING_TOOLS.map(specPathOf).sort());
  });

  it("führt zu jedem Eintrag den Werkzeugnamen aus dem Register", () => {
    for (const entry of READING_TOOLS) {
      expect(ALLOW_LIST.get(specPathOf(entry))?.toolName).toBe(entry.name);
    }
  });

  it("kennt keinen einzigen schreibenden Pfad", () => {
    for (const entry of WRITING_TOOLS) {
      expect(ALLOW_LIST.has(specPathOf(entry))).toBe(false);
    }
    expect(WRITING_TOOLS).toHaveLength(39);
  });
});

describe("Der Wächter wirft bei einem schreibenden Pfad", () => {
  it("lehnt jeden der 39 schreibenden Endpunkte ab", () => {
    for (const entry of WRITING_TOOLS) {
      expect(() =>
        assertAllowedCall(ALLOW_LIST, {
          toolName: entry.name,
          specPath: specPathOf(entry),
          requestPath: requestPathOf(entry),
        }),
      ).toThrow(ContractRunGuardError);
    }
  });

  it("nennt in der Meldung den abgelehnten Pfad und das Werkzeug", () => {
    // `/receipts/delete/id_by_customer` ist der gefährlichste der 39: Er trägt dieselbe
    // Pfadvorlage wie der erlaubte Einzelabruf `/receipts/get/id_by_customer` und
    // unterscheidet sich nur in einem Segment (Live-Befunde Befund 1).
    let caughtError: unknown;
    try {
      assertAllowedCall(ALLOW_LIST, {
        toolName: "bb_receipts_delete",
        specPath: "/receipts/delete/id_by_customer",
        requestPath: "/receipts/delete/4711",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ContractRunGuardError);
    const guard = caughtError as ContractRunGuardError;
    expect(guard.toolName).toBe("bb_receipts_delete");
    expect(guard.specPath).toBe("/receipts/delete/id_by_customer");
    expect(guard.requestPath).toBe("/receipts/delete/4711");
    expect(guard.message).toContain("nicht in der aus dem Register erzeugten Erlaubnisliste");
  });

  it("lehnt auch einen erfundenen Pfad ab, den das Register überhaupt nicht kennt", () => {
    expect(() =>
      assertAllowedCall(ALLOW_LIST, {
        toolName: "bb_receipts_search",
        specPath: "/receipts/add",
        requestPath: "/receipts/add",
      }),
    ).toThrow(ContractRunGuardError);
  });
});

describe("Der Wächter lässt genau die lesenden Aufrufe durch", () => {
  it("nimmt jeden der 15 lesenden Endpunkte an", () => {
    for (const entry of READING_TOOLS) {
      expect(() =>
        assertAllowedCall(ALLOW_LIST, {
          toolName: entry.name,
          specPath: specPathOf(entry),
          requestPath: requestPathOf(entry),
        }),
      ).not.toThrow();
    }
  });

  it("lehnt einen fremden Werkzeugnamen an einem erlaubten Pfad ab", () => {
    expect(() =>
      assertAllowedCall(ALLOW_LIST, {
        toolName: "bb_receipts_delete",
        specPath: "/receipts/get",
        requestPath: "/receipts/get",
      }),
    ).toThrow(ContractRunGuardError);
  });

  it("lehnt einen Anfragepfad ab, der nicht zur Vorlage des Endpunkts passt", () => {
    // Alle vier Formen führen über einen erlaubten Spezifikationspfad an einen anderen
    // Endpunkt. Sie sind der Grund, warum der Wächter den GESENDETEN Pfad prüft und nicht
    // nur den Schlüssel, unter dem nachgeschlagen wird.
    const attackPaths = [
      "/receipts/get/4711/extra",
      "/receipts/get/../delete/4711",
      "/receipts/get/abc",
      "/receipts/get/4711?force=1",
    ];

    for (const requestPath of attackPaths) {
      expect(() =>
        assertAllowedCall(ALLOW_LIST, {
          toolName: "bb_receipts_get",
          specPath: "/receipts/get/id_by_customer",
          requestPath,
        }),
      ).toThrow(ContractRunGuardError);
    }
  });

  it("lehnt einen leeren und einen relativen Anfragepfad ab", () => {
    for (const requestPath of ["", "receipts/get", "//receipts/get", "/receipts/get "]) {
      expect(() =>
        assertAllowedCall(ALLOW_LIST, {
          toolName: "bb_receipts_search",
          specPath: "/receipts/get",
          requestPath,
        }),
      ).toThrow(ContractRunGuardError);
    }
  });
});

describe("Der Wurf geschieht vor dem Absenden", () => {
  it("berührt den Absender nicht, wenn der Pfad abgelehnt wird", async () => {
    // Die Attrappe steht für den einzigen Weg dieses Projekts ins Netz. Wird sie berührt,
    // ist der Aufruf abgegangen; der Test scheitert dann, ohne dass ein Netzwerkversuch
    // nötig wäre (der Testlauf sperrt das Netz ohnehin).
    const touched: string[] = [];
    const dispatchMock = async (call: { toolName: string }): Promise<never> => {
      touched.push(call.toolName);
      return Promise.reject(new Error("Dieser Aufruf hätte niemals abgehen dürfen."));
    };

    const call = {
      toolName: "bb_postings_create_free",
      specPath: "/postings/add/free",
      requestPath: "/postings/add/free",
    };

    let thrown = false;
    try {
      assertAllowedCall(ALLOW_LIST, call);
      await dispatchMock(call);
    } catch (error) {
      thrown = error instanceof ContractRunGuardError;
    }

    expect(thrown).toBe(true);
    expect(touched).toEqual([]);
  });

  it("ruft im Skript den Wächter vor dem einzigen Absendeaufruf", () => {
    // Diese Prüfung liest den Quelltext, und das ist Absicht: Die Reihenfolge „erst der
    // Wächter, dann der Request" lässt sich ohne einen echten Netzwerkversuch nicht anders
    // beweisen, und genau diese Reihenfolge ist die Zusage des Pakets.
    const sourceText = readFileSync(SCRIPT, "utf8");
    const guardIndex = sourceText.indexOf("assertAllowedCall(allowList, call)");
    const dispatchIndex = sourceText.indexOf("await callEndpoint(call)");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(dispatchIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(dispatchIndex);
    expect(sourceText.split("callEndpoint(call)")).toHaveLength(2);
  });

  it("hält jeden schreibenden Endpunkt aus dem Ablaufplan heraus", () => {
    const readingNames = new Set(READING_TOOLS.map((entry) => entry.name));
    for (const probe of PROBE_PLAN) {
      expect(readingNames.has(probe.tool)).toBe(true);
    }
    expect(PROBE_PLAN.map((probe) => probe.tool).sort()).toEqual([...readingNames].sort());
  });
});

describe("Aufbau der Erlaubnisliste", () => {
  it("weist eine Pfadvorlage zurück, deren Platzhalter nicht in params steht", () => {
    const broken: ToolEntry = {
      ...READING_TOOLS[0],
      name: "bb_kaputt",
      toolClass: "R",
      path: {
        template: "/receipts/get/{fremder_platzhalter}",
        params: ["receipt_id_by_customer"],
        specPath: "/receipts/get/id_by_customer",
      },
    };

    expect(() => buildAllowList([broken])).toThrow(/fremder_platzhalter/);
  });

  it("erzeugt aus einer Vorlage nur Ziffernsegmente", () => {
    const allowedEndpoint = ALLOW_LIST.get("/transactions/get/id_by_customer") as AllowedEndpoint;
    expect(allowedEndpoint.requestPattern.test("/transactions/get/1590")).toBe(true);
    expect(allowedEndpoint.requestPattern.test("/transactions/get/1590a")).toBe(false);
    expect(allowedEndpoint.requestPattern.test("/transactions/get/")).toBe(false);
  });
});

describe("Vergleich gegen den Antwortvertrag", () => {
  it("nimmt bei id-string sowohl den String als auch die Zahl an", () => {
    // Die Asymmetrie ist gemessen: dieselbe Kennung kommt bei Belegen
    // als String und bei Zahlungen als Zahl. Ein Lauf, der das meldete, meldete es immer.
    const observed = observeRows([{ id_by_customer: 1590 }, { id_by_customer: "2" }]);
    const deviations = compareContract(
      { container: "data", fields: { id_by_customer: "id-string" }, source: "gemessen" },
      observed,
      2,
    );

    expect(deviations).toEqual([]);
  });

  it("meldet ein neues, ein fehlendes und ein typverändertes Feld", () => {
    const observed = observeRows([{ amount: 12.5, unbekannt: "x" }]);
    const deviations = compareContract(
      {
        container: "data",
        fields: { amount: "amount-string", weg: "string" },
        source: "dokumentiert",
      },
      observed,
      1,
    );

    expect(deviations.map((deviation) => deviation.kind).sort()).toEqual(["fehlt", "neu", "typ"]);
  });

  it("behauptet nichts über ein Feld, das in jeder Zeile null war", () => {
    const observed = observeRows([{ payment_date: null }, { payment_date: null }]);
    const deviations = compareContract(
      { container: "data", fields: { payment_date: "null-or-string" }, source: "dokumentiert" },
      observed,
      2,
    );

    expect(deviations).toHaveLength(1);
    expect(deviations[0]?.kind).toBe("hinweis");
  });

  it("unterscheidet die sechs JSON-Typen", () => {
    expect(jsonKindOf(null)).toBe("null");
    expect(jsonKindOf([])).toBe("array");
    expect(jsonKindOf({})).toBe("object");
    expect(jsonKindOf("0")).toBe("string");
    expect(jsonKindOf(0)).toBe("number");
    expect(jsonKindOf(false)).toBe("boolean");
  });
});

describe("Aufrufschalter", () => {
  it("liest --only in beiden Schreibweisen", () => {
    expect(parseArgs(["--only", "bb_receipts_search,bb_postings_search"]).only).toEqual([
      "bb_receipts_search",
      "bb_postings_search",
    ]);
    expect(parseArgs(["--only=bb_receipts_search"]).only).toEqual(["bb_receipts_search"]);
  });

  it("übergeht den Trenner, den pnpm mitschickt", () => {
    // `pnpm run contract:read -- --list` liefert argv ["--", "--list"]. Ohne diese Zeile
    // lehnte der Lauf genau die Aufrufform ab, die seine eigene Hilfe nennt.
    const options = parseArgs(["--", "--list"]);
    expect(options.list).toBe(true);
    expect(parseArgs(["--", "--only", "bb_receipts_search"]).only).toEqual(["bb_receipts_search"]);
  });

  it("weist einen unbekannten Schalter zurück", () => {
    expect(() => parseArgs(["--alles"])).toThrow(/Unbekannter Schalter/);
  });
});
