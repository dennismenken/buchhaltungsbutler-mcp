// P4: das Namensschema und die Prüfsätze.
//
// Der Name ist das Erste, was ein Agent sieht, und bei 54 Werkzeugen die einzige
// Navigationshilfe, die ohne Kontextkosten auskommt. Deshalb ist er hier vollständig
// festgelegt und nicht dem Geschmack des jeweiligen Bearbeiters überlassen.
//
// Gegen das leere Register läuft diese Datei rot und nennt jeden fehlenden Werkzeugnamen.

import { describe, expect, it } from "vitest";

import { REGISTRY, entryByName, missingEntry } from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "./class-list.js";

/** Das Namensschema. Die Längengrenze wird zusätzlich geprüft: Der Ausdruck
 *  allein ließe 41 Zeichen zu (3 Zeichen „bb_" plus 1 plus 37). */
const NAME_PATTERN = /^bb_[a-z][a-z0-9_]{2,37}$/;
const MAX_NAME_LENGTH = 40;

/** Die geschlossene Verbliste, zwölf Verben. Elf aus tool-design.md 4.4,
 *  `unassign` ergänzt, weil `bb_transactions_delete_receipt` sich läse, als lösche es den
 *  Beleg — im Buchhaltungskontext eine gefährliche Fehllesung. */
const VERBS: readonly string[] = [
  "search",
  "get",
  "list",
  "create",
  "update",
  "delete",
  "restore",
  "upload",
  "cancel",
  "unconfirm",
  "assign",
  "unassign",
];

/** Die Auszählung nach Ressource, von Hand abgeschrieben. Summe 54. */
const TOOLS_BY_RESOURCE: Readonly<Record<string, number>> = {
  receipts: 8,
  transactions: 8,
  invoices: 3,
  postings: 12,
  debtors: 4,
  creditors: 4,
  postingaccounts: 3,
  payment_accounts: 2,
  comments: 1,
  cost_locations: 4,
  reports: 5,
};

/** Längster und kürzester Name des Satzes, nachgerechnet. */
const LONGEST_NAME = "bb_postings_create_for_transaction_batch";
const SHORTEST_NAME = "bb_receipts_get";

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

/** Ressource und Verb eines Namens. Das Verb wird als SEGMENT hinter der Ressource gesucht
 *  und nicht als Namensendung, weil zwölf Namen auf einen Qualifizierer enden. */
function parseName(name: string): { resource: string; verb?: string; verbIndex: number } {
  const segments = name.slice("bb_".length).split("_");
  const verbIndex = segments.findIndex((segment) => VERBS.includes(segment));
  if (verbIndex < 0) {
    return { resource: segments.join("_"), verbIndex };
  }
  return {
    resource: segments.slice(0, verbIndex).join("_"),
    verb: segments[verbIndex],
    verbIndex,
  };
}

describe("P4 Namensschema", () => {
  it("führt jeden der 54 erwarteten Werkzeugnamen", () => {
    const problems = EXPECTED_TOOL_NAMES.filter((name) => entryByName(name) === undefined).map(
      (name) => missingEntry(name),
    );

    expectNoIssues(problems);
  });

  it("erfüllt bei jedem Namen Ausdruck und Längengrenze", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      if (!NAME_PATTERN.test(tool.name)) {
        problems.push(`${tool.name}: erfüllt ${String(NAME_PATTERN)} nicht.`);
      }
      if (tool.name.length > MAX_NAME_LENGTH) {
        problems.push(
          `${tool.name}: ${String(tool.name.length)} Zeichen, erlaubt sind höchstens ${String(MAX_NAME_LENGTH)}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt genau ein Verb aus der geschlossenen Liste, als Segment hinter der Ressource", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const segments = tool.name.slice("bb_".length).split("_");
      const verbSegments = segments.filter((segment) => VERBS.includes(segment));

      if (verbSegments.length === 0) {
        problems.push(`${tool.name}: kein Verb aus der Liste (${VERBS.join(", ")}) als Segment.`);
        continue;
      }
      if (verbSegments.length > 1) {
        problems.push(
          `${tool.name}: mehrere Verbsegmente (${verbSegments.join(", ")}). Genau eines ist das Verb, alles dahinter ist Qualifizierer.`,
        );
      }

      const { resource, verbIndex } = parseName(tool.name);
      if (resource === "") {
        problems.push(`${tool.name}: das Verb steht an erster Stelle, die Ressource fehlt davor.`);
      }
      if (verbIndex < 1) {
        problems.push(
          `${tool.name}: das Verb steht nicht hinter der Ressource (Segmentindex ${String(verbIndex)}).`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("nennt die Ressource im Plural und vor dem Verb", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const { resource } = parseName(tool.name);
      const lastSegment = resource.split("_").at(-1) ?? "";
      if (!lastSegment.endsWith("s")) {
        problems.push(
          `${tool.name}: Ressource "${resource}" steht nicht im Plural. Die elf Ressourcen sind ${Object.keys(TOOLS_BY_RESOURCE).join(", ")}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("verteilt die 54 Werkzeuge genau wie die Auszählung nach Ressource", () => {
    const problems: string[] = [];
    const countByResource = new Map<string, number>();

    for (const tool of REGISTRY) {
      const { resource } = parseName(tool.name);
      countByResource.set(resource, (countByResource.get(resource) ?? 0) + 1);
    }

    for (const [resource, expected] of Object.entries(TOOLS_BY_RESOURCE)) {
      const actualCount = countByResource.get(resource) ?? 0;
      if (actualCount !== expected) {
        problems.push(
          `Ressource ${resource}: ${String(actualCount)} Werkzeuge, expected sind ${String(expected)}.`,
        );
      }
    }
    for (const [resource, actualCount] of countByResource) {
      if (!(resource in TOOLS_BY_RESOURCE)) {
        problems.push(
          `Ressource ${resource}: nicht vorgesehen (${String(actualCount)} Werkzeuge).`,
        );
      }
    }

    expectNoIssues(problems);
    expect(Object.values(TOOLS_BY_RESOURCE).reduce((a, b) => a + b, 0)).toBe(54);
  });

  it("vergibt jeden Namen genau einmal", () => {
    const names = REGISTRY.map((tool) => tool.name);
    const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];

    expectNoIssues(duplicates.map((name) => `${name}: Name zweimal vergeben.`));
  });

  it("hat 40 Zeichen als längsten und 15 als kürzesten Namen", () => {
    const sorted = [...REGISTRY].sort((a, b) => a.name.length - b.name.length);
    const shortest = sorted.at(0);
    const longest = sorted.at(-1);

    expect(longest?.name).toBe(LONGEST_NAME);
    expect(LONGEST_NAME.length).toBe(40);
    expect(shortest?.name).toBe(SHORTEST_NAME);
    expect(SHORTEST_NAME.length).toBe(15);
  });

  it("setzt einen title von höchstens 40 Zeichen ohne Satzzeichen am Ende", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      if (tool.title.trim() === "") {
        problems.push(
          `${tool.name}: kein title. Der Client zeigt im Freigabedialog den title, sonst den Maschinennamen.`,
        );
        continue;
      }
      if (tool.title.length > MAX_NAME_LENGTH) {
        problems.push(
          `${tool.name}: title ist ${String(tool.title.length)} Zeichen lang, erlaubt sind höchstens ${String(MAX_NAME_LENGTH)}.`,
        );
      }
      if (/[.,;:!?]$/.test(tool.title)) {
        problems.push(`${tool.name}: title endet mit einem Satzzeichen: "${tool.title}".`);
      }
    }

    expectNoIssues(problems);
  });
});
