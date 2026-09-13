// Der Regressionsschutz für das Bündelregister `src/bundles/index.ts`.
//
// Geprüft wird ausschließlich der Bestand: Sind es genau fünf Einträge, sind es die fünf
// erwarteten Namen, stehen sie in der Registrierreihenfolge, steht kein Name doppelt, und
// trägt jeder Eintrag die Gruppe `bundles`. Alles Weitere — Schritte, Klasse, Schema,
// Verhalten — prüfen `read-bundles-contract.test.ts` und die Dateien je Bündel.
//
// Die Sollnamen kommen aus `bundle-list.ts` und damit aus einer zweiten, von Hand gepflegten
// Quelle. Eine Prüfung gegen `BUNDLE_ENTRIES` selbst könnte einen verlorenen Eintrag nicht
// bemerken.

import { describe, expect, it } from "vitest";

import { BUNDLE_BY_NAME, BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { BUNDLE_TOOL_GROUP } from "../../src/registry/groups.js";
import { EXPECTED_BUNDLE_COUNT, EXPECTED_BUNDLE_NAMES } from "./bundle-list.js";

/** Meldet alle Abweichungen auf einmal, damit eine Fehlermeldung jeden Namen nennt. */
function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

const registeredNames = BUNDLE_ENTRIES.map((entry) => entry.name);

describe("Bündelregister", () => {
  it("führt jeden der fünf erwarteten Bündelnamen", () => {
    const present = new Set(registeredNames);
    const problems = EXPECTED_BUNDLE_NAMES.filter((name) => !present.has(name)).map(
      (name) =>
        `${name} fehlt in BUNDLE_ENTRIES (src/bundles/index.ts): Das Werkzeug ist nicht importiert oder nicht in die Liste eingetragen und erscheint damit in keinem tools/list.`,
    );

    expectNoIssues(problems);
  });

  it("führt keinen Eintrag, der nicht in der Namensliste steht", () => {
    const expected = new Set(EXPECTED_BUNDLE_NAMES);
    const problems = registeredNames
      .filter((name) => !expected.has(name))
      .map(
        (name) =>
          `${name} ist zu viel: Der Eintrag steht in BUNDLE_ENTRIES, aber in keiner Namensliste. Ein weiteres Bündel ist eine Entscheidung des Projektinhabers.`,
      );

    expectNoIssues(problems);
  });

  it("führt genau fünf Einträge", () => {
    expect(EXPECTED_BUNDLE_NAMES).toHaveLength(EXPECTED_BUNDLE_COUNT);
    expect(BUNDLE_ENTRIES).toHaveLength(EXPECTED_BUNDLE_COUNT);
  });

  it("hält die festgelegte Registrierreihenfolge ein", () => {
    expect(registeredNames).toEqual([...EXPECTED_BUNDLE_NAMES]);
  });

  it("führt keinen Namen doppelt", () => {
    const seen = new Set<string>();
    const problems: string[] = [];

    for (const name of registeredNames) {
      if (seen.has(name)) {
        problems.push(
          `${name} steht mehrfach in BUNDLE_ENTRIES: Ein doppelter Eintrag verdrängt in BUNDLE_BY_NAME einen anderen und verdeckt so einen verlorenen Namen.`,
        );
      }
      seen.add(name);
    }

    expectNoIssues(problems);
    expect(BUNDLE_BY_NAME.size).toBe(EXPECTED_BUNDLE_COUNT);
  });

  it("trägt bei jedem Eintrag die Gruppe bundles", () => {
    const problems = BUNDLE_ENTRIES.filter((entry) => entry.group !== BUNDLE_TOOL_GROUP).map(
      (entry) =>
        `${entry.name}: group ist ${String(entry.group)} statt ${BUNDLE_TOOL_GROUP}. Damit verschwände das Bündel unter einem Wert von BB_MCP_TOOL_GROUPS, mit dem niemand rechnet.`,
    );

    expectNoIssues(problems);
  });

  it("findet jeden erwarteten Namen über BUNDLE_BY_NAME", () => {
    const problems = EXPECTED_BUNDLE_NAMES.filter(
      (name) => BUNDLE_BY_NAME.get(name) === undefined,
    ).map((name) => `${name} ist über BUNDLE_BY_NAME nicht auffindbar (src/bundles/index.ts).`);

    expectNoIssues(problems);
  });
});
