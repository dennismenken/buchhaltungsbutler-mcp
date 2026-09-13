// P5 und P6.
//
// P5 hält die Klasse jedes Eintrags gegen test/registry/class-list.ts, die zweite und
// unabhängig gepflegte Klassenliste. P6 hält die Wirkung jedes Eintrags gegen
// test/registry/effect-list.ts, die aus grundlagen.md 7.3 abgeschriebene Wirkungstabelle.
// Beide Listen liegen bewusst getrennt vom Register: Eine Prüfung, die ihre Erwartung aus
// derselben Datei liest, die sie prüft, prüft sich selbst.
//
// Die Klasse wird niemals aus dem Namen abgeleitet: bb_postings_assign_receipt
// endet auf _receipt und ist buchend, bb_reports_get_ledger endet auf _ledger und ist lesend.

import { describe, expect, it } from "vitest";

import { READ_ONLY_TOOL_CLASS, TOOL_CLASSES, TOOL_EFFECTS } from "../../src/registry/classes.js";
import type { ToolClass, ToolEffect } from "../../src/registry/types.js";
import {
  REGISTRY,
  entryByName,
  entryBySpecPath,
  missingEntry,
  specPathOf,
} from "../helpers/registry-fixtures.js";
import { EXPECTED_CLASS_COUNTS, EXPECTED_TOOL_CLASSES, EXPECTED_TOOL_NAMES } from "./class-list.js";
import {
  EXPECTED_EFFECT_COUNTS,
  EXPECTED_ENDPOINT_EFFECTS,
  EXPECTED_READ_ONLY_SPEC_PATHS,
  EXPECTED_SPEC_PATHS,
  expectedEffectOf,
} from "./effect-list.js";

const CLASSES: readonly ToolClass[] = ["R", "A", "AR", "M", "D", "B"];
const EFFECTS: readonly ToolEffect[] = ["read", "create", "modify", "delete"];

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

describe("P5 Klassen", () => {
  it("trägt je Eintrag genau eine der sechs Klassen", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      if (!CLASSES.includes(tool.toolClass)) {
        problems.push(
          `${tool.name}: toolClass "${tool.toolClass}" ist keine der sechs Klassen ${CLASSES.join(", ")}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("stimmt bei allen 54 Werkzeugen mit der zweiten, unabhängig gepflegten Liste überein", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) {
        const expected = EXPECTED_TOOL_CLASSES[name as keyof typeof EXPECTED_TOOL_CLASSES];
        problems.push(`${missingEntry(name)} Erwartete Klasse: ${expected}.`);
        continue;
      }
      const expected = EXPECTED_TOOL_CLASSES[name as keyof typeof EXPECTED_TOOL_CLASSES];
      if (tool.toolClass !== expected) {
        problems.push(
          `${name}: Register sagt ${tool.toolClass}, test/registry/class-list.ts sagt ${expected}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("kennt kein Werkzeug, das in der zweiten Liste fehlt", () => {
    const knownNames = new Set(EXPECTED_TOOL_NAMES);
    const problems = REGISTRY.filter((tool) => !knownNames.has(tool.name)).map(
      (tool) =>
        `${tool.name}: steht nicht in test/registry/class-list.ts. Ein neues Werkzeug wird dort gemeinsam eingetragen.`,
    );

    expectNoIssues(problems);
  });

  it("erfüllt die Auszählung R 15, A 16, AR 2, M 4, D 7, B 10", () => {
    const problems: string[] = [];

    for (const cls of CLASSES) {
      const actualCount = REGISTRY.filter((tool) => tool.toolClass === cls).length;
      const expected = EXPECTED_CLASS_COUNTS[cls];
      if (actualCount !== expected) {
        problems.push(
          `Klasse ${cls}: ${String(actualCount)} Werkzeuge, erwartet sind ${String(expected)}.`,
        );
      }
      // Dieselbe Zahl steht in src/registry/classes.ts. Laufen die beiden Quellen
      // auseinander, ist das ein Fund und keine Nebensache.
      if (TOOL_CLASSES[cls].count !== expected) {
        problems.push(
          `Klasse ${cls}: src/registry/classes.ts nennt ${String(TOOL_CLASSES[cls].count)}, test/registry/class-list.ts nennt ${String(expected)}.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(Object.values(EXPECTED_CLASS_COUNTS).reduce((a, b) => a + b, 0)).toBe(54);
  });
});

describe("P6 Wirkungsabgleich", () => {
  it("trägt je Eintrag genau eine der vier Wirkungen", () => {
    const problems = REGISTRY.filter((tool) => !EFFECTS.includes(tool.effect)).map(
      (tool) =>
        `${tool.name}: effect "${tool.effect}" ist keine der vier Wirkungen ${EFFECTS.join(", ")}.`,
    );

    expectNoIssues(problems);
  });

  it("stimmt bei allen 54 Endpunkten mit grundlagen.md 7.3 überein", () => {
    const problems: string[] = [];

    for (const path of EXPECTED_SPEC_PATHS) {
      const tool = entryBySpecPath(path);
      const expected = expectedEffectOf(path);
      if (tool === undefined) {
        problems.push(
          `${path}: kein Registereintrag. Erwartete Wirkung nach grundlagen.md 7.3: ${String(expected)}.`,
        );
        continue;
      }
      if (tool.effect !== expected) {
        problems.push(
          `${tool.name} (${path}): Register sagt ${tool.effect}, grundlagen.md 7.3 sagt ${String(expected)}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("kennt keinen Endpunkt, den die Wirkungstabelle nicht führt", () => {
    const knownNames = new Set(EXPECTED_SPEC_PATHS);
    const problems = REGISTRY.filter((tool) => !knownNames.has(specPathOf(tool))).map(
      (tool) =>
        `${tool.name}: Pfad ${specPathOf(tool)} steht nicht in test/registry/effect-list.ts.`,
    );

    expectNoIssues(problems);
  });

  it("erfüllt die Auszählung 15 lesend, 24 anlegend, 8 ändernd, 7 löschend", () => {
    const problems: string[] = [];

    for (const effect of EFFECTS) {
      const actualCount = REGISTRY.filter((tool) => tool.effect === effect).length;
      const expected = EXPECTED_EFFECT_COUNTS[effect];
      if (actualCount !== expected) {
        problems.push(
          `Wirkung ${effect} (${TOOL_EFFECTS[effect].german}): ${String(actualCount)} Werkzeuge, erwartet sind ${String(expected)}.`,
        );
      }
      if (TOOL_EFFECTS[effect].count !== expected) {
        problems.push(
          `Wirkung ${effect}: src/registry/classes.ts nennt ${String(TOOL_EFFECTS[effect].count)}, test/registry/effect-list.ts nennt ${String(expected)}.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(Object.values(EXPECTED_EFFECT_COUNTS).reduce((a, b) => a + b, 0)).toBe(54);
  });

  it("macht Klasse R exakt zur Menge der lesenden Endpunkte", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const isReadOnlyClass = tool.toolClass === READ_ONLY_TOOL_CLASS;
      const isReadEffect = tool.effect === "read";
      if (isReadOnlyClass && !isReadEffect) {
        problems.push(
          `${tool.name}: Klasse R, aber Wirkung ${tool.effect}. Der Nur-Lesen-Schalter liest die Klassenspalte; ein schreibendes Werkzeug mit Klasse R würde ihn passieren.`,
        );
      }
      if (isReadEffect && !isReadOnlyClass) {
        problems.push(
          `${tool.name}: Wirkung lesend, aber Klasse ${tool.toolClass}. Ein lesendes Werkzeug außerhalb von R bekäme keinen Retry und würde im Nur-Lesen-Modus ohne Grund absagen.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("deckt die Klasse-R-Pfade mit den 15 lesenden Pfaden aus grundlagen.md 7.3", () => {
    const readOnlyPaths = REGISTRY.filter((tool) => tool.toolClass === READ_ONLY_TOOL_CLASS)
      .map((tool) => specPathOf(tool))
      .sort();

    expect(readOnlyPaths).toEqual([...EXPECTED_READ_ONLY_SPEC_PATHS].sort());
    expect(EXPECTED_READ_ONLY_SPEC_PATHS).toHaveLength(15);
  });

  it("führt in der Wirkungstabelle alle 54 Pfade genau einmal", () => {
    expect(Object.keys(EXPECTED_ENDPOINT_EFFECTS)).toHaveLength(54);
    expect(new Set(Object.keys(EXPECTED_ENDPOINT_EFFECTS)).size).toBe(54);
  });
});
