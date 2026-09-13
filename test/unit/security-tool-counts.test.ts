import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { BundleEntry } from "../../src/bundles/types.js";
import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { TOOL_CLASSES } from "../../src/registry/classes.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { ROOT } from "../helpers/registry-fixtures.js";

// SECURITY.md gegen die Registerzahlen.
//
// **Warum diese Prüfung nötig ist.** Der erste Absatz der Sicherheitsrichtlinie begründet seine
// Dringlichkeit mit einer Zahl: wie viele der ausgelieferten Werkzeuge schreiben. Diese Zahl ist
// von Hand geschrieben, und bis hierher hielt sie nichts nach. Beim Zubau der fünf
// Bündelwerkzeuge blieb sie deshalb auf „39 seiner 54" stehen, während `tools/list` 59 Werkzeuge
// meldete, davon 19 mit `readOnlyHint: true` und folglich 40 schreibende. Die README nennt
// dieselbe Aussage in ihrem Warnblock und blieb richtig — sie wird von
// test/unit/readme-bundles.test.ts gehalten. Diese Datei tut für SECURITY.md dasselbe.
//
// Eine zu kleine Zahl untertreibt genau das Risiko, vor dem der Absatz warnt, und sie steht in
// dem Dokument, das jemand mit einem Fund zuerst liest.
//
// Gezählt wird über `TOOL_CLASSES[...].annotations.readOnlyHint`, also über denselben Wert, den
// `tools/list` ausliefert und den `src/server/instructions.ts` für den Servertext zählt. Eine
// zweite Liste lesender Werkzeuge entsteht hier deshalb nicht; sie wäre die nächste, die altert.
//
// Geprüft werden ausschließlich Zahlen, nie Formulierungen: Der Absatz darf umgeschrieben
// werden, solange jedes Verhältnis „x von y Werkzeugen" weiter zum Register passt.

const SECURITY = fs.readFileSync(path.join(ROOT, "SECURITY.md"), "utf8");

/** Beide Register hintereinander, so wie ein Client sie in `tools/list` sieht. */
const ALL: readonly (ToolEntry | BundleEntry)[] = [...TOOL_ENTRIES, ...BUNDLE_ENTRIES];

/** So viele Werkzeuge meldet `tools/list`: Endpunktwerkzeuge und Bündel zusammen. */
const TOTAL = ALL.length;

/** Die schreibenden darunter, also alle ohne `readOnlyHint: true`. */
const WRITING = ALL.filter(
  (entry) => !TOOL_CLASSES[entry.toolClass].annotations.readOnlyHint,
).length;

interface CountClaim {
  /** Die zuerst genannte Zahl: die schreibenden Werkzeuge. */
  readonly writing: number;
  /** Die zweite Zahl: alle Werkzeuge. */
  readonly total: number;
  /** Die Fundstelle im Wortlaut, damit die Fehlermeldung sie zeigen kann. */
  readonly text: string;
}

/**
 * Jede Stelle in SECURITY.md, die ein Verhältnis „x … y Werkzeuge" behauptet.
 *
 * Die Bindewörter sind absichtlich offen gehalten. Die Prüfung soll an den Zahlen hängen und
 * nicht an einer Formulierung, und sie soll eine zweite Fundstelle von selbst mitnehmen, falls
 * der Text später eine bekommt.
 */
function countClaims(): readonly CountClaim[] {
  const pattern = /(\d+)\s+(?:seiner|seinen|der|von)\s+(\d+)\s+Werkzeuge/g;
  return [...SECURITY.matchAll(pattern)].map((match) => ({
    writing: Number(match[1]),
    total: Number(match[2]),
    text: match[0],
  }));
}

describe("SECURITY.md, Zahl der Werkzeuge", () => {
  it("nennt das Verhältnis überhaupt", () => {
    expect(
      countClaims().length,
      "SECURITY.md sagt nicht mehr, wie viele der ausgelieferten Werkzeuge schreiben. Genau " +
        "diese Zahl begründet im ersten Absatz, warum ein Fund hier schwerer wiegt als " +
        "anderswo; ohne sie steht die Dringlichkeit unbelegt da.",
    ).toBeGreaterThan(0);
  });

  it("nennt die Zahlen, die das Register führt", () => {
    const problems = countClaims()
      .filter((claim) => claim.writing !== WRITING || claim.total !== TOTAL)
      .map((claim) => `„${claim.text}" statt „${String(WRITING)} … ${String(TOTAL)} Werkzeuge"`);
    expect(
      problems.join("\n"),
      `Das Register führt ${String(TOTAL)} Werkzeuge (${String(TOOL_ENTRIES.length)} ` +
        `Endpunktwerkzeuge und ${String(BUNDLE_ENTRIES.length)} Bündel), davon schreiben ` +
        `${String(WRITING)}. SECURITY.md behauptet etwas anderes. Eine zu kleine Zahl im ` +
        "ersten Absatz der Sicherheitsrichtlinie untertreibt das Risiko, vor dem der Absatz " +
        "warnt — und sie steht in dem Dokument, das jemand mit einem Fund zuerst liest.",
    ).toBe("");
  });
});
