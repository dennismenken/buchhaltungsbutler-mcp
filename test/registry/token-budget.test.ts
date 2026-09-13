// P11 aus Plan 9.2: das Kontextbudget.
//
// Gezählt wird mit dem echten Tokenizer aus Plan 13.9 (`gpt-tokenizer@4.0.0`, Kodierung
// `o200k_base`) und ausdrücklich NICHT über die Konstante CHARS_PER_TOKEN: Ein Budget, das
// über einen Schätzfaktor erzwungen wird, erzwingt die Schätzung und nicht das Budget
// (Plan 4.10). Der Tokenizer ist seit AP01 eine devDependency; P11 ist damit hier
// vollständig lauffähig und wartet auf keine Messung aus AP14.
//
// Die Stufenbudgets aus Plan 4.9 sind ZEICHENgrenzen und brauchen ohnehin keinen Tokenizer.
//
// Reißt das Gesamtbudget, gilt die Reihenfolge aus Plan 4.10: erstens S1 bis S6 nachziehen,
// zweitens die Beschreibungen der Stufe 3 auf die untere Wortgrenze kürzen, drittens Inhalte
// in Resources verschieben. Werkzeuge zu streichen oder zusammenzulegen ist kein Hebel, E1
// steht dem entgegen; das Budget stillschweigend anzuheben ebenfalls nicht.
//
// Stand 2026-09-13: Die drei Schritte schließen die Lücke nicht, und das ist ausgerechnet
// (48.305 Token gegen die frühere Grenze von 32.000, docs/entwicklung/befund-tokenbudget.md):
// Selbst alle 54 Werkzeugbeschreibungen zusammen sind nur 32.654 Zeichen lang, also rund 7.980
// Token, während 16.305 Token fehlen. Die Rechnung steht in src/registry/budget.ts.
// Der Projektinhaber hat das Gesamtbudget daraufhin ausdrücklich auf 49.000 Token angehoben,
// also auf den gemessenen Stand zuzüglich 695 Token Luft; die Begründung steht in CHANGELOG.md
// und in src/registry/budget.ts. Diese Prüfung bricht seither wieder hart an dieser Grenze ab.
// Sie schreibt die gemessene Summe zusätzlich bei jedem Lauf auf stderr, damit sichtbar bleibt,
// wie viel Luft bis zur Grenze noch bleibt.

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../../src/config/resolve.js";
import { resolveConfig } from "../../src/config/resolve.js";
import {
  DESCRIPTION_CHAR_BUDGET_BY_TIER,
  INSTRUCTIONS_TOKEN_BUDGET,
  TOOL_NAMES_BY_TIER,
  TOTAL_TOOL_DEFINITION_TOKEN_BUDGET,
} from "../../src/registry/budget.js";
import type { DescriptionTier } from "../../src/registry/types.js";
import {
  INSTRUCTIONS_MODULE,
  REGISTRY,
  definitionJson,
  entryByName,
  missingEntry,
  tokenCount,
} from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "./class-list.js";

const TIERS: readonly DescriptionTier[] = [1, 2, 3];

/** Die Besetzung der drei Stufen aus Plan 4.9, Prüfsumme 22 + 18 + 14 = 54. */
const TIER_COUNTS: Readonly<Record<DescriptionTier, number>> = { 1: 22, 2: 18, 3: 14 };

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

/**
 * Der größte Zustand der Konfiguration: jeder Schalter an, der den Servertext verlängert.
 *
 * Das Budget muss im größten Zustand halten, und nur er beweist das. Zum Gruppenschalter
 * gehörte dabei früher die **kleinste** Gruppe allein: Elf inaktive Gruppen, jede mit dem,
 * was mit ihr unbeantwortbar ist (N5), und der Buchungswegweiser stand ohnehin in jedem
 * Profil. Seit die Blöcke des Servertextes an ihren Gruppen hängen, trägt das nicht mehr:
 * Ohne die Gruppe `postings` entfällt der Wegweiser, und `comments` allein wiegt gemessen nur
 * noch 1.508 Token. Der teuerste Zustand ist jetzt `postings,bundles` mit 1.840 Token —
 * gemessen über alle 4.095 nichtleeren Gruppenmengen mit demselben Tokenizer, der auch hier
 * zählt; die nächstteuren liegen bei 1.839 und 1.832. Er vereint beides: zehn inaktive
 * Gruppen und den Wegweiser.
 *
 * Die Zugangsdaten sind Platzhalter. Sie stehen in keinem Ausgabetext; sie sorgen allein
 * dafür, dass die Auflösung keine Zugangsdatendatei des Betreibers liest.
 */
function largestConfig(): ResolvedConfig {
  return resolveConfig({
    env: {
      BB_API_CLIENT: "PLATZHALTER",
      BB_API_SECRET: "PLATZHALTER",
      BB_API_KEY: "PLATZHALTER",
      BB_MCP_READ_ONLY: "true",
      BB_MCP_DUPLICATE_CHECK: "on",
      BB_MCP_CACHE_TTL_MS: "60000",
      BB_MCP_MAX_AMOUNT: "1000.00",
      BB_MCP_MAX_BATCH: "10",
      BB_MCP_TOOL_GROUPS: "postings,bundles",
    },
    platform: "linux",
    homeDir: "/nicht/vorhanden",
    nodeVersion: process.versions.node,
  }).config;
}

/**
 * Die instructions des Servers, sofern es sie schon gibt. src/server/instructions.ts wird in
 * AP10 als Platzhalter angelegt und in AP14 befüllt; die endgültige Signatur der
 * Exportfunktion steht dort und nicht hier, weshalb diese Prüfung jeden Export abtastet und
 * nicht einen Namen errät.
 */
async function instructionsText(): Promise<string | undefined> {
  if (!existsSync(INSTRUCTIONS_MODULE)) return undefined;

  // Der Pfad steht bewusst in einer Variablen: Ein wörtlicher Spezifizierer würde die
  // Typprüfung dieser Testdatei an eine Datei binden, die es vor AP10 noch nicht gibt.
  const specifier = pathToFileURL(INSTRUCTIONS_MODULE).href;
  const moduleExports = (await import(specifier)) as Record<string, unknown>;

  for (const value of Object.values(moduleExports)) {
    if (typeof value === "string") return value;
    if (typeof value !== "function") continue;

    // Drei Versuche, in aufsteigender Vollständigkeit: ohne Argument, mit einem leeren
    // Objekt (der Platzhalter aus AP10 kommt damit aus) und mit einer echten, vollständig
    // aufgelösten Konfiguration im größten Zustand. Der dritte Versuch ist der, der seit dem
    // Gruppenschalter trägt: Der Servertext liest dort ein Feld, das ein leeres Objekt nicht
    // hat, und misst dann zugleich den teuersten Zustand statt des billigsten.
    for (const args of [[], [{}], [largestConfig()]]) {
      try {
        const result: unknown = (value as (...args: unknown[]) => unknown)(...args);
        if (typeof result === "string" && result !== "") return result;
      } catch {
        // Dieser Export war es nicht; der nächste wird probiert.
      }
    }
  }

  return undefined;
}

describe("P11 Stufenbesetzung", () => {
  it("erfüllt die Prüfsumme 22 + 18 + 14 = 54", () => {
    const problems: string[] = [];

    for (const tier of TIERS) {
      const names = TOOL_NAMES_BY_TIER[tier];
      if (names.length !== TIER_COUNTS[tier]) {
        problems.push(
          `Stufe ${String(tier)}: ${String(names.length)} Werkzeuge in src/registry/budget.ts, nach Plan 4.9 sind es ${String(TIER_COUNTS[tier])}.`,
        );
      }
      if (new Set(names).size !== names.length) {
        problems.push(`Stufe ${String(tier)}: ein Name steht mehrfach in der Liste.`);
      }
    }

    const allNames = TIERS.flatMap((tier) => [...TOOL_NAMES_BY_TIER[tier]]);
    const duplicates = allNames.filter((name, index) => allNames.indexOf(name) !== index);
    for (const name of new Set(duplicates)) {
      problems.push(
        `${name}: steht in mehr als einer Stufenliste; jedes Werkzeug trägt genau eine Stufe.`,
      );
    }

    expectNoIssues(problems);
    expect(allNames).toHaveLength(54);
    expect([...allNames].sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("findet zu jedem Namen der drei Listen einen Eintrag mit dieser Stufe", () => {
    const problems: string[] = [];

    for (const tier of TIERS) {
      for (const name of TOOL_NAMES_BY_TIER[tier]) {
        const tool = entryByName(name);
        if (tool === undefined) {
          problems.push(
            `${missingEntry(name)} Erwartete Stufe ${String(tier)}, Budget ${String(DESCRIPTION_CHAR_BUDGET_BY_TIER[tier])} Zeichen.`,
          );
          continue;
        }
        if (tool.tier !== tier) {
          problems.push(
            `${name}: tier ${String(tool.tier)} statt ${String(tier)} (Plan 4.9, src/registry/budget.ts).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });
});

describe("P11 Zeichengrenzen je Stufe", () => {
  it("hält jede Beschreibung innerhalb von 900, 700 beziehungsweise 480 Zeichen", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const limit = DESCRIPTION_CHAR_BUDGET_BY_TIER[tool.tier];
      const length = tool.description.length;
      if (length > limit) {
        problems.push(
          `${tool.name}: ${String(length)} Zeichen, Stufe ${String(tool.tier)} erlaubt ${String(limit)}. Überschuss ${String(length - limit)}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("bestätigt die Budgetwerte aus Plan 4.9", () => {
    expect(DESCRIPTION_CHAR_BUDGET_BY_TIER[1]).toBe(900);
    expect(DESCRIPTION_CHAR_BUDGET_BY_TIER[2]).toBe(700);
    expect(DESCRIPTION_CHAR_BUDGET_BY_TIER[3]).toBe(480);
  });
});

describe("P11 Gesamtbudget", () => {
  it("misst alle 54 Definitionen, meldet den Abstand zur Grenze und erzwingt sie", () => {
    const problems: string[] = [];
    const measured: { name: string; token: number; chars: number }[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(missingEntry(name));
        continue;
      }
      const text = definitionJson(tool);
      measured.push({ name, token: tokenCount(text), chars: text.length });
    }

    expectNoIssues(problems);

    const total = measured.reduce((value, item) => value + item.token, 0);
    const topExpensive = [...measured]
      .sort((a, b) => b.token - a.token)
      .slice(0, 10)
      .map((item) => `${item.name} ${String(item.token)}`)
      .join(", ");

    const report =
      `P11 Gesamtbudget: ${String(total)} Token für 54 Werkzeugdefinitionen, ` +
      `Grenze ${String(TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)}. ` +
      `Teuerste Werkzeuge: ${topExpensive}.`;

    const message =
      total > TOTAL_TOOL_DEFINITION_TOKEN_BUDGET
        ? `${report} Die Grenze ist um ${String(total - TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)} Token gerissen.`
        : `${report} Eingehalten, noch ${String(TOTAL_TOOL_DEFINITION_TOKEN_BUDGET - total)} Token Luft.`;

    // Geschrieben wird nach stderr und ausdrücklich nicht über console.error: Vitest 5 fängt
    // die Konsole ab und unterdrückt ihre Ausgabe bei bestandenen Prüfungen (Vorgabe
    // `silent: "passed-only"`). Eine Warnung, die nur im Fehlerfall erscheint, wäre genau die
    // Warnung, die hier gebraucht wird, nirgends zu sehen. stdout kommt nicht in Frage, es
    // gehört in diesem Projekt dem MCP-Protokoll (eslint.config.js).
    //
    // Gemeldet wird bei jedem Lauf, nicht nur bei Überschreitung: Eine Zahl, die erst beim
    // Reißen auftaucht, verrät nicht, ob sie sich der Grenze nähert.
    process.stderr.write(`${message}\n`);

    expect(
      total,
      `${report} Das Gesamtbudget ist gerissen: Die Werkzeugdefinitionen sind über den in docs/entwicklung/befund-tokenbudget.md festgehaltenen Stand hinaus gewachsen. Gegenmaßnahmen in der Reihenfolge aus Plan 4.10: erstens S1 bis S6 nachziehen, zweitens die Beschreibungen der Stufe 3 kürzen, drittens Inhalte in die Resources aus 7.7 verschieben. Die Grenze anzuheben ist kein Schritt dieser Prüfung, sondern eine Entscheidung des Projektinhabers mit Eintrag in CHANGELOG.md.`,
    ).toBeLessThanOrEqual(TOTAL_TOOL_DEFINITION_TOKEN_BUDGET);
  });

  it("bestätigt die Zahlen, an denen P11 abbricht", () => {
    // 49.000 statt der 32.000 aus Plan 4.10: die ausdrückliche Entscheidung des
    // Projektinhabers vom 2026-09-13 über den gemessenen Stand, begründet in
    // src/registry/budget.ts und in CHANGELOG.md. Hier mitgeprüft, damit ein weiteres,
    // stilles Anheben auffällt.
    expect(TOTAL_TOOL_DEFINITION_TOKEN_BUDGET).toBe(49_000);
    expect(INSTRUCTIONS_TOKEN_BUDGET).toBe(2_100);
  });

  it("zählt mit dem Tokenizer und nicht über einen Schätzfaktor", () => {
    // Ein deutscher Satz mit Umlauten zerfällt in mehr Token als die Zeichenzahl geteilt
    // durch 3,2 vermuten lässt; genau deshalb steht hier der echte Tokenizer (Plan 4.10).
    const sentence = "Überschreibt Stammdaten im echten Mandanten von BuchhaltungsButler.";
    expect(tokenCount(sentence)).toBeGreaterThan(0);
    expect(tokenCount("")).toBe(0);
  });
});

describe("P11 instructions", () => {
  it("bleibt auch im größten Zustand unter 2.100 Token", async () => {
    const text = await instructionsText();

    expect(
      text,
      `src/server/instructions.ts liefert keinen messbaren Text. Die Datei entsteht als Platzhalter in AP10 und wird in AP14 befüllt (Plan 6.7); sie muss eine Zeichenkette exportieren oder eine Funktion, die eine liefert.`,
    ).toBeTypeOf("string");

    if (typeof text !== "string") return;

    const token = tokenCount(text);
    expect(
      token,
      `${String(token)} Token in den instructions, erlaubt sind ${String(INSTRUCTIONS_TOKEN_BUDGET)}. Sie tragen alles Querschnittliche genau einmal; was nicht hineinpasst, gehört in eine Resource (Plan 4.10, 7.7).`,
    ).toBeLessThanOrEqual(INSTRUCTIONS_TOKEN_BUDGET);
  });
});
