// P7 aus Plan 9.2: die vier MCP-Annotationen je Werkzeug.
//
// Die Annotationen sind das einzige MASCHINENLESBARE Signal, an dem ein Client erkennt, was
// ein Aufruf anrichtet. Unter E2 sperrt der Server nichts; der Freigabedialog des Clients ist
// die einzige menschliche Kontrolle, und er liest genau diese vier Werte.
//
// Der Registereintrag trägt keine Annotationen, sondern eine Klasse; die Übersetzung steht
// als Tabelle in src/registry/classes.ts. Diese Prüfung hält sie gegen eine zweite,
// unabhängig aus Plan 3.3 abgeschriebene Fassung derselben Tabelle. Ändert AP19b eine Zeile,
// werden classes.ts, test/registry/class-list.ts und diese Datei gemeinsam nachgezogen
// (Plan 3.3).

import { describe, expect, it } from "vitest";

import { TOOL_CLASSES } from "../../src/registry/classes.js";
import type { ToolClass } from "../../src/registry/types.js";
import {
  REGISTRY,
  annotationsOf,
  entryByName,
  missingEntry,
} from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_CLASSES, EXPECTED_TOOL_NAMES } from "./class-list.js";

/**
 * Die Hint-Spalten der Tabelle aus Plan 3.3, von Hand abgeschrieben.
 *
 * Zwei Zeilen sind unbequem und stehen deshalb ausdrücklich so da:
 * - M trägt destructiveHint TRUE. Ein Überschreiben ist nicht additiv, und kein Endpunkt
 *   liefert den Vorzustand zurück.
 * - B trägt destructiveHint FALSE, obwohl es die folgenreichste Klasse ist. Ihre Werkzeuge
 *   legen Neues an und überschreiben nichts; Unumkehrbarkeit und Destruktivität fallen hier
 *   auseinander. Die Warnung läuft über die Pflichtsätze U3 und U4 (P8) und den title.
 *
 * openWorldHint ist überall true: Der Datenbestand ändert sich unabhängig von diesem Server.
 */
const EXPECTED_ANNOTATIONS = {
  R: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  A: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  AR: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  M: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  D: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  B: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
} as const satisfies Record<ToolClass, Record<string, boolean>>;

/** Auszählung aus Plan 3.3 und 3.9, Auslieferungszustand: AR 2 + M 4 + D 7 = 13 destruktive,
 *  R 15 + M 4 = 19 idempotente. */
const DESTRUCTIVE_COUNT = 13;
const IDEMPOTENT_COUNT = 19;

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const;

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

describe("P7 Annotationen", () => {
  it("setzt in der Klassentabelle alle vier Hints ausdrücklich", () => {
    const problems: string[] = [];

    for (const [cls, definition] of Object.entries(TOOL_CLASSES)) {
      for (const hint of HINTS) {
        if (typeof definition.annotations[hint] !== "boolean") {
          problems.push(
            `Klasse ${cls}: ${hint} ist nicht gesetzt. Ein fehlender Hint ist für den Client dasselbe wie eine unbekannte Wirkung (Plan 3.3).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("stimmt Wert für Wert mit der Tabelle aus Plan 3.3 überein", () => {
    const problems: string[] = [];

    for (const [cls, expected] of Object.entries(EXPECTED_ANNOTATIONS)) {
      const actual = TOOL_CLASSES[cls as ToolClass].annotations;
      for (const hint of HINTS) {
        if (actual[hint] !== expected[hint]) {
          problems.push(
            `Klasse ${cls}, ${hint}: src/registry/classes.ts sagt ${String(actual[hint])}, Plan 3.3 sagt ${String(expected[hint])}.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("gibt jedem der 54 Werkzeuge die Annotationen seiner Klasse", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) {
        const cls = EXPECTED_TOOL_CLASSES[name as keyof typeof EXPECTED_TOOL_CLASSES];
        const expected = EXPECTED_ANNOTATIONS[cls];
        problems.push(
          `${missingEntry(name)} Erwartete Annotationen (Klasse ${cls}): ${HINTS.map(
            (hint) => `${hint}=${String(expected[hint])}`,
          ).join(", ")}.`,
        );
        continue;
      }

      const actual = annotationsOf(tool);
      const expected = EXPECTED_ANNOTATIONS[tool.toolClass];
      for (const hint of HINTS) {
        if (actual[hint] !== expected[hint]) {
          problems.push(
            `${name} (Klasse ${tool.toolClass}), ${hint}: ${String(actual[hint])} statt ${String(expected[hint])}.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("setzt openWorldHint bei allen 54 Werkzeugen auf true", () => {
    const problems = REGISTRY.filter((tool) => !annotationsOf(tool).openWorldHint).map(
      (tool) =>
        `${tool.name}: openWorldHint ist false. Der Datenbestand ändert sich unabhängig von uns.`,
    );

    expectNoIssues(problems);
  });

  it("zählt 13 destruktive und 19 idempotente Werkzeuge", () => {
    const destructiveTools = REGISTRY.filter((tool) => annotationsOf(tool).destructiveHint).map(
      (tool) => `${tool.name} (${tool.toolClass})`,
    );
    const idempotentTools = REGISTRY.filter((tool) => annotationsOf(tool).idempotentHint).map(
      (tool) => `${tool.name} (${tool.toolClass})`,
    );

    // Die Namen stehen in der Fehlermeldung, damit ein falsch eingestuftes Werkzeug sofort
    // sichtbar ist und nicht erst über die Differenz zweier Zahlen gesucht werden muss.
    expect(destructiveTools, `destruktiv: ${destructiveTools.join(", ")}`).toHaveLength(
      DESTRUCTIVE_COUNT,
    );
    expect(idempotentTools, `idempotent: ${idempotentTools.join(", ")}`).toHaveLength(
      IDEMPOTENT_COUNT,
    );
  });

  it("setzt readOnlyHint genau bei den 15 Werkzeugen der Klasse R", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const isReadOnlyMarked = annotationsOf(tool).readOnlyHint;
      if (isReadOnlyMarked !== (tool.toolClass === "R")) {
        problems.push(
          `${tool.name}: readOnlyHint ${String(isReadOnlyMarked)} bei Klasse ${tool.toolClass}.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(REGISTRY.filter((tool) => annotationsOf(tool).readOnlyHint)).toHaveLength(15);
  });
});
