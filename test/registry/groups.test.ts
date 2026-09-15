// Der Gruppenschalter, Registerseite.
//
// Geprüft wird hier genau das, was am Register hängt: dass jeder Eintrag eine Gruppe trägt,
// dass die Zuordnung mit der zweiten, unabhängig gepflegten Liste übereinstimmt, und dass die
// eingecheckten Tokenzahlen in `src/registry/groups.ts` noch zur Wirklichkeit passen.
//
// Die letzte Prüfung ist die wichtigste: Startmeldung, `doctor` und `print-config` geben diese
// Zahlen als Tatsache aus, und zur Laufzeit gibt es keinen Tokenizer, der sie nachrechnen
// könnte. Läuft die Tabelle der Wirklichkeit davon, behauptet der Server eine Ersparnis,
// die es nicht gibt — und niemand merkt es. Gemessen wird mit dem echten Tokenizer.

import { describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { bundleDefinitionJson } from "../../src/bundles/schema.js";
import {
  BUNDLE_TOOL_GROUP,
  TOOL_GROUPS,
  TOOL_GROUP_NAMES,
  isToolGroup,
  measuredTokensOf,
  type ToolGroup,
} from "../../src/registry/groups.js";
import { REGISTRY, definitionJson, tokenCount } from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "./class-list.js";
import {
  EXPECTED_GROUP_COUNTS,
  EXPECTED_GROUP_TOKENS,
  EXPECTED_TOOL_GROUPS,
} from "./group-list.js";

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

/** Die Einträge einer Gruppe, aus dem Register. */
function entriesOf(group: ToolGroup): typeof REGISTRY {
  return REGISTRY.filter((entry) => entry.group === group);
}

/**
 * Die Werkzeuge einer Gruppe, aus **beiden** Registern gezählt.
 *
 * Die Bündel stehen nicht in `index.generated.ts`: Sie tragen einen eigenen Eintragstyp
 * (`src/bundles/types.ts`). Wer die Besetzung einer Gruppe allein über `REGISTRY` zählt, hält
 * `bundles` für leer und prüft deren eingecheckte Zahl deshalb gar nicht nach.
 */
function toolCountOf(group: ToolGroup): number {
  return entriesOf(group).length + (group === BUNDLE_TOOL_GROUP ? BUNDLE_ENTRIES.length : 0);
}

/**
 * Die gemessene Tokenzahl der Definitionen einer Gruppe, mit dem echten Tokenizer.
 *
 * Die elf Endpunktgruppen werden über `definitionJson` gemessen, `bundles` über
 * `bundleDefinitionJson` — beides sind die Funktionen, aus denen die ausgelieferte Definition
 * entsteht, und keine Nachbildung.
 */
function measureGroup(group: ToolGroup): number {
  const endpoints = entriesOf(group).reduce(
    (sum, entry) => sum + tokenCount(definitionJson(entry)),
    0,
  );
  if (group !== BUNDLE_TOOL_GROUP) {
    return endpoints;
  }
  return (
    endpoints +
    BUNDLE_ENTRIES.reduce((sum, entry) => sum + tokenCount(bundleDefinitionJson(entry)), 0)
  );
}

describe("die zwölf Werkzeuggruppen", () => {
  it("führt genau zwölf Namen, und jeder ist über isToolGroup erkennbar", () => {
    expect(TOOL_GROUP_NAMES).toHaveLength(12);
    expect(new Set(TOOL_GROUP_NAMES).size).toBe(12);
    for (const name of TOOL_GROUP_NAMES) {
      expect(isToolGroup(name)).toBe(true);
    }
    // Ein Name, den es nicht gibt, ist keine Gruppe. Ohne diese Zeile prüfte die Schleife
    // oben nur, dass isToolGroup immer true sagt.
    expect(isToolGroup("cost")).toBe(false);
    expect(isToolGroup("payment")).toBe(false);
    expect(isToolGroup("")).toBe(false);
  });

  it("schreibt cost_locations und payment_accounts aus, statt am zweiten Unterstrich zu trennen", () => {
    // Die beiden Namen sind der Grund, aus dem die Gruppe ein Feld und keine Ableitung ist.
    expect(TOOL_GROUP_NAMES).toContain("cost_locations");
    expect(TOOL_GROUP_NAMES).toContain("payment_accounts");
    expect(TOOL_GROUP_NAMES).not.toContain("cost");
    expect(TOOL_GROUP_NAMES).not.toContain("payment");
  });

  it("gibt jeder Gruppe einen deutschen Anzeigenamen und einen Satz über das, was ohne sie fehlt", () => {
    const problems: string[] = [];
    for (const group of TOOL_GROUP_NAMES) {
      const definition = TOOL_GROUPS[group];
      if (definition.label.trim() === "") {
        problems.push(`${group}: label ist leer.`);
      }
      if (definition.withoutIt.trim() === "") {
        problems.push(
          `${group}: withoutIt ist leer. Bei abgeschalteter Gruppe stünde in den instructions dann nicht, welche Fragen diese Installation nicht beantworten kann.`,
        );
      }
    }
    expectNoIssues(problems);
  });
});

describe("die Gruppe jedes Registereintrags", () => {
  it("trägt bei allen 54 Werkzeugen eine der zwölf Gruppen", () => {
    const problems: string[] = [];
    for (const entry of REGISTRY) {
      // Der Zwischenschritt über `string` ist Absicht: Ohne ihn engte TypeScript den Wert im
      // Negativzweig auf `never` ein, und die Meldung könnte den falschen Wert nicht nennen.
      const group: string = entry.group;
      if (!isToolGroup(group)) {
        problems.push(`${entry.name}: group="${group}" ist keine der zwölf Gruppen.`);
      }
    }
    expectNoIssues(problems);
    expect(REGISTRY).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it("stimmt bei allen 54 Werkzeugen mit der zweiten, unabhängig gepflegten Liste überein", () => {
    const expected: Record<string, ToolGroup> = EXPECTED_TOOL_GROUPS;
    const problems: string[] = [];
    for (const entry of REGISTRY) {
      const wanted = expected[entry.name];
      if (wanted === undefined) {
        problems.push(
          `${entry.name}: steht in test/registry/group-list.ts nicht. Entweder ist das Werkzeug neu, dann gehört es dort eingetragen, oder der Name ist falsch.`,
        );
        continue;
      }
      if (entry.group !== wanted) {
        problems.push(
          `${entry.name}: Register sagt group="${entry.group}", group-list.ts sagt "${wanted}". Eine der beiden Stellen ist falsch; die Gruppe wird niemals aus dem Namen abgeleitet.`,
        );
      }
    }
    for (const name of Object.keys(expected)) {
      if (!REGISTRY.some((entry) => entry.name === name)) {
        problems.push(`${name}: steht in group-list.ts, aber in keinem Registereintrag.`);
      }
    }
    expectNoIssues(problems);
  });

  it("verteilt die 54 Werkzeuge genau nach der Quersumme der Gruppentabelle", () => {
    const problems: string[] = [];
    let total = 0;
    for (const [group, wanted] of Object.entries(EXPECTED_GROUP_COUNTS)) {
      const found = entriesOf(group as ToolGroup).length;
      total += wanted;
      if (found !== wanted) {
        problems.push(
          `${group}: ${String(found)} Werkzeuge im Register, erwartet ${String(wanted)}.`,
        );
      }
    }
    expectNoIssues(problems);
    expect(total).toBe(54);
  });

  it("hält die Gruppe bundles frei von Endpunktwerkzeugen", () => {
    // Ein Endpunktwerkzeug in `bundles` hebelte die Zusicherung aus, dass die 54
    // Endpunktwerkzeuge neben den Bündeln unverändert bestehen bleiben: Es verschwände,
    // sobald jemand die Bündelgruppe abschaltet.
    const inBundles = entriesOf(BUNDLE_TOOL_GROUP).map((entry) => entry.name);
    const endpointTools = inBundles.filter((name) => EXPECTED_TOOL_NAMES.includes(name));
    expect(endpointTools).toEqual([]);
  });
});

describe("die eingecheckte Tokenmessung je Gruppe", () => {
  it("stimmt in jeder besetzten Gruppe mit dem echten Tokenizer überein", () => {
    const problems: string[] = [];
    for (const group of TOOL_GROUP_NAMES) {
      const toolCount = toolCountOf(group);
      const recorded = TOOL_GROUPS[group].measuredTokens;

      if (toolCount === 0) {
        if (recorded !== null) {
          problems.push(
            `${group}: führt kein Werkzeug, trägt aber measuredTokens=${String(recorded)}. Null heißt „nicht gemessen"; eine Zahl ohne Werkzeuge behauptet eine Messung, die es nicht gibt.`,
          );
        }
        continue;
      }

      const measured = measureGroup(group);
      if (recorded === null) {
        problems.push(
          `${group}: führt ${String(toolCount)} Werkzeuge, trägt aber measuredTokens=null. In src/registry/groups.ts auf ${String(measured)} setzen; pnpm measure-tokens weist die Zahl je Gruppe aus.`,
        );
        continue;
      }
      if (recorded !== measured) {
        problems.push(
          `${group}: eingecheckt ${String(recorded)} Token, gemessen ${String(measured)}. Startmeldung, doctor und print-config geben die eingecheckte Zahl als Tatsache aus; sie ist in src/registry/groups.ts nachzuziehen.`,
        );
      }
    }
    expectNoIssues(problems);
  });

  it("addiert sich über die elf Endpunktgruppen zur gemessenen Gesamtzahl", () => {
    const expected: Record<string, number> = EXPECTED_GROUP_TOKENS;
    const sum = Object.values(expected).reduce((total, value) => total + value, 0);
    // 48.368 ist die Zahl aus docs/entwicklung/tokenbudget.md und aus
    // src/registry/definition.ts. Die Gruppensummen sind kein eigener Gegenstand: Sie zerlegen
    // dieselbe Messung.
    expect(sum).toBe(48_964);

    const problems: string[] = [];
    for (const [group, wanted] of Object.entries(expected)) {
      const measured = measureGroup(group as ToolGroup);
      if (measured !== wanted) {
        problems.push(
          `${group}: gemessen ${String(measured)} Token, in test/registry/group-list.ts steht ${String(wanted)}.`,
        );
      }
    }
    expectNoIssues(problems);
  });

  it("summiert eine Teilmenge exakt und nennt ungemessene Gruppen getrennt", () => {
    const subset: readonly ToolGroup[] = ["receipts", "payment_accounts"];
    const { tokens, unmeasured } = measuredTokensOf(subset);
    expect(unmeasured).toEqual([]);
    expect(tokens).toBe(measureGroup("receipts") + measureGroup("payment_accounts"));

    // Die Bündelgruppe ist seit dem 2026-09-13 gemessen und zählt deshalb mit, statt benannt
    // zu werden. Der `null`-Zweig bleibt stehen: Er ist die Zusicherung für den Tag, an dem
    // eine neue Gruppe ohne Messung hinzukommt, und würde sonst erst auffallen, wenn eine
    // Ausgabe eine fehlende Messung als 0 verrechnet.
    const withBundles = measuredTokensOf([...subset, BUNDLE_TOOL_GROUP]);
    if (TOOL_GROUPS[BUNDLE_TOOL_GROUP].measuredTokens === null) {
      expect(withBundles.unmeasured).toEqual([BUNDLE_TOOL_GROUP]);
      expect(withBundles.tokens).toBe(tokens);
    } else {
      expect(withBundles.unmeasured).toEqual([]);
      expect(withBundles.tokens).toBe(tokens + measureGroup(BUNDLE_TOOL_GROUP));
    }
  });

  // Das getrennte Budget der Bündelgruppe (`BUNDLE_DEFINITION_TOKEN_BUDGET`) wird hier NICHT
  // ein zweites Mal geprüft. Die echte Messung dagegen steht in
  // `test/bundles/read-bundles-contract.test.ts` („hält das eigene Tokenbudget der Gruppe
  // ein"): Sie summiert `bundleDefinitionJson` über `BUNDLE_ENTRIES`. Bis zum 2026-09-13 stand
  // an dieser Stelle dieselbe Zusicherung über `REGISTRY` — dort steht kein Bündel, die Summe
  // war immer 0, und die Prüfung sah nach Absicherung aus, ohne eine zu sein.
});
