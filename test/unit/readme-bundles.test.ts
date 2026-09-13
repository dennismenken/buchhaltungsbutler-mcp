import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import { ROOT } from "../helpers/registry-fixtures.js";

// Die README gegen das Bündelregister.
//
// **Warum das nicht schon der Generator erledigt.** `scripts/gen-tool-table.ts` schreibt die
// Tabelle in Abschnitt 11.1 aus `BUNDLE_ENTRIES`; ein sechstes Bündel erzeugt dort eine
// Differenz, und der CI-Schritt „pnpm generate, danach git diff --exit-code" wird rot. Die
// Erklärung in Alltagssprache darunter kann der Generator dagegen nicht schreiben — sie steht
// nirgends als Datum. Genau sie ist aber der Teil, den jemand liest, der nicht programmiert.
// Diese Prüfung hält deshalb den handgeschriebenen Teil gegen das Register.
//
// Geprüft wird nur, DASS jedes Bündel vorkommt, nicht WIE es beschrieben ist: Eine Prüfung auf
// Formulierungen wäre eine zweite Redaktion und machte jede Textverbesserung rot.

const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

/** Der Anfang von Abschnitt 11.1 und der Anfang des darauffolgenden Abschnitts 11.2. */
function bundleSectionBounds(): { readonly begin: number; readonly end: number } {
  const begin = README.indexOf("### 11.1 ");
  const end = README.indexOf("### 11.2 ", begin);
  expect(
    begin,
    "README.md führt keinen Abschnitt 11.1 mehr. Dort stehen die Bündelwerkzeuge; " +
      "scripts/gen-tool-table.ts schreibt die Tabelle hinein.",
  ).toBeGreaterThan(-1);
  expect(
    end,
    "README.md führt keinen Abschnitt 11.2 mehr. Abschnitt 11.1 endet an dieser Überschrift.",
  ).toBeGreaterThan(begin);
  return { begin, end };
}

/** Abschnitt 11.1 vollständig, erzeugte Tabelle eingeschlossen. */
function bundleSection(): string {
  const { begin, end } = bundleSectionBounds();
  return README.slice(begin, end);
}

/**
 * Nur der handgeschriebene Teil hinter der erzeugten Tabelle.
 *
 * Die Abgrenzung ist der Kern dieser Prüfung: In der erzeugten Tabelle steht der Name eines
 * neuen Bündels von selbst, in der Erklärung darunter nicht.
 */
function handwrittenBundleSection(): string {
  const { end } = bundleSectionBounds();
  const begin = README.indexOf("<!-- buendel-tabelle:ende -->");
  expect(
    begin,
    "README.md führt keine Markierung buendel-tabelle:ende mehr. Ohne sie schreibt " +
      "scripts/gen-tool-table.ts die Bündeltabelle nicht.",
  ).toBeGreaterThan(-1);
  expect(begin).toBeLessThan(end);
  return README.slice(begin, end);
}

describe("README, Abschnitt 11.1", () => {
  it("erklärt jedes Bündelwerkzeug in Alltagssprache", () => {
    const section = handwrittenBundleSection();
    for (const entry of BUNDLE_ENTRIES) {
      expect(
        section.includes(`\`${entry.name}\``),
        `README.md erklärt ${entry.name} nicht. Die erzeugte Tabelle in Abschnitt 11.1 führt ` +
          "jedes Bündel von selbst; die Aufzählung darunter sagt, welche Frage aus dem " +
          "Buchhaltungsalltag es beantwortet, und die ist von Hand zu ergänzen.",
      ).toBe(true);
    }
  });

  it("nennt die Zusage, dass bundle.complete eine Lücke ausweist", () => {
    expect(
      bundleSection(),
      "README.md sagt in Abschnitt 11.1 nicht mehr, dass bundle.complete eine unvollständige " +
        "Antwort als solche ausweist. Das ist die Zusage, auf die sich jemand verlässt, der " +
        "eine Summe aus einem Bündel in eine Auswertung übernimmt.",
    ).toContain("bundle.complete");
  });
});

describe("README, Zahl der Werkzeuge", () => {
  const total = TOOL_ENTRIES.length + BUNDLE_ENTRIES.length;

  it("nennt im Vorspann die Zahl, die tools/list meldet", () => {
    expect(
      README,
      `README.md nennt nicht "alle ${String(total)} Werkzeuge". So viele meldet tools/list: ` +
        `${String(TOOL_ENTRIES.length)} Endpunktwerkzeuge und ${String(BUNDLE_ENTRIES.length)} ` +
        "Bündel.",
    ).toContain(`alle ${String(total)} Werkzeuge`);
  });

  it("nennt die Zahl der schreibenden Werkzeuge richtig", () => {
    const writing =
      TOOL_ENTRIES.filter((entry) => entry.effect !== "read").length +
      BUNDLE_ENTRIES.filter((entry) => entry.effect !== "read").length;
    expect(
      README,
      `README.md nennt nicht "${String(writing)} der ${String(total)} Werkzeuge schreiben". ` +
        "Der Warnblock ganz oben ist die erste Zeile, die ein Nutzer liest; eine zu kleine Zahl " +
        "dort untertreibt genau das Risiko, vor dem sie warnt.",
    ).toContain(`${String(writing)} der ${String(total)} Werkzeuge schreiben`);
  });
});
