import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import {
  BUNDLE_TOOL_GROUP,
  TOOL_GROUPS,
  TOOL_GROUP_NAMES,
  isToolGroup,
  measuredTokensOf,
  type ToolGroup,
  type ToolGroupDefinition,
} from "../../src/registry/groups.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import { ROOT } from "../helpers/registry-fixtures.js";

// Die Zahlen in README Abschnitt 7.4 gegen die gemessene Tabelle in `src/registry/groups.ts`.
//
// **Warum diese Prüfung nötig ist.** Abschnitt 7.4 ist die Stelle, an der ein Nutzer sein
// Profil wählt, und die README liegt im npm-Tarball. Der Abschnitt behauptet dort ausdrücklich,
// seine Zahlen seien gemessen und keine Schätzungen. Geschrieben sind sie aber von Hand:
// `scripts/gen-tool-table.ts` erzeugt die Werkzeugtabellen in Abschnitt 11, nicht die
// Gruppentabelle und nicht die Profiltabelle. Eine Definition, der ein Satz hinzugefügt wird,
// verschiebt die gemessene Tokenzahl einer Gruppe — `test/registry/groups.test.ts` rechnet das
// für `src/registry/groups.ts` nach, aber ohne diese Prüfung bliebe die README still auf dem
// alten Stand stehen und behauptete eine Ersparnis, die es so nicht gibt. Genau das ist am
// 2026-09-13 passiert: Die Gruppe `bundles` stand mit 6.675 statt 6.852 in der README.
//
// Geprüft werden ausschließlich Zahlen, nie Formulierungen. Der Text darf umgeschrieben werden,
// solange jede Zahl weiter zu `TOOL_GROUPS` passt.

const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

/** Die elf Endpunktgruppen, also alle außer `bundles`. */
const ENDPOINT_GROUPS: readonly ToolGroup[] = TOOL_GROUP_NAMES.filter(
  (group) => group !== BUNDLE_TOOL_GROUP,
);

/** Abschnitt 7.4 vollständig, bis zur nächsten Überschrift der Ebenen eins bis drei. */
function groupSection(): string {
  const begin = README.indexOf("### 7.4 ");
  expect(
    begin,
    "README.md führt keinen Abschnitt 7.4 mehr. Dort stehen die Gruppentabelle und die " +
      "empfohlenen Profile; ohne ihn prüft diese Datei nichts.",
  ).toBeGreaterThan(-1);
  const rest = README.slice(begin + 1);
  const next = /\n#{1,3} /.exec(rest);
  return next === null ? README.slice(begin) : README.slice(begin, begin + 1 + next.index);
}

/**
 * Eine deutsch geschriebene Zahl als Zahl.
 *
 * Der Punkt ist der Tausenderpunkt aus `toLocaleString("de-DE")`, kein Dezimaltrennzeichen:
 * In diesem Abschnitt sind alle Zahlen ganze Tokenzahlen.
 */
function parseGerman(value: string): number {
  return Number(value.replaceAll(".", ""));
}

/** Dieselbe Schreibweise, die die README und `doctor` verwenden. */
function formatGerman(value: number): string {
  return value.toLocaleString("de-DE");
}

/** Die Werkzeuge einer Gruppe, aus beiden Registern gezählt. */
function toolCountOf(group: ToolGroup): number {
  return (
    TOOL_ENTRIES.filter((entry) => entry.group === group).length +
    BUNDLE_ENTRIES.filter((entry) => entry.group === group).length
  );
}

/**
 * Die gemessene Tokenzahl einer Gruppe, mit der Zusicherung, dass sie überhaupt gemessen ist.
 *
 * `measuredTokens: null` heißt „nicht gemessen" und nicht „null Token". Eine ungemessene Gruppe
 * kann die README nicht als gemessene Zahl ausweisen; diese Prüfung sagt das, statt gegen eine
 * stillschweigende 0 zu rechnen.
 */
function measuredTokensOfGroup(group: ToolGroup): number {
  // Der Umweg über `ToolGroupDefinition` ist Absicht: `TOOL_GROUPS` ist `as const`, und ein
  // direkter Zugriff liefert deshalb eine Vereinigung von Zahlenliteralen, in der `null` gar
  // nicht vorkommt. Die Prüfung unten wäre dann totes Holz, das erst auffiele, wenn eine Zahl
  // tatsächlich auf `null` zurückgesetzt wird. Gegen die deklarierte Schnittstelle gelesen,
  // bleibt sie eine echte Prüfung.
  const definition: ToolGroupDefinition = TOOL_GROUPS[group];
  const measured = definition.measuredTokens;
  expect(
    measured,
    `Die Gruppe ${group} trägt in src/registry/groups.ts keine gemessene Tokenzahl. ` +
      "Abschnitt 7.4 der README weist ihre Zahl aber als gemessen aus. Entweder wird sie " +
      "gemessen (pnpm measure-tokens) oder der Abschnitt sagt für diese Gruppe, dass sie es " +
      "nicht ist.",
  ).not.toBeNull();
  return measured as number;
}

interface TableRow {
  readonly line: string;
  readonly cells: readonly string[];
}

/** Alle Tabellenzeilen eines Abschnitts, Trennzeilen (`| --- |`) ausgenommen. */
function tableRows(section: string): readonly TableRow[] {
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => ({
      line,
      cells: line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    }))
    .filter((row) => !row.cells.every((cell) => /^-+$/.test(cell)));
}

/** Jede Zahl einer Zelle, in der Reihenfolge des Textes. */
function numbersIn(cell: string): readonly number[] {
  return [...cell.matchAll(/\d[\d.]*/g)].map((match) => parseGerman(match[0]));
}

describe("README, Abschnitt 7.4, Gruppentabelle", () => {
  const rows = tableRows(groupSection()).filter((row) => /^`[a-z_]+`$/.test(row.cells[0]));

  it("führt genau die zwölf Gruppen", () => {
    const listed = rows.map((row) => row.cells[0].replaceAll("`", ""));
    expect(
      listed,
      "Die Gruppentabelle in Abschnitt 7.4 der README führt nicht dieselben Gruppen wie " +
        "src/registry/groups.ts. Jeder Name dort ist ein gültiger Wert von " +
        "BB_MCP_TOOL_GROUPS; eine Gruppe, die in der README fehlt, findet niemand.",
    ).toEqual([...TOOL_GROUP_NAMES]);
    for (const name of listed) {
      expect(isToolGroup(name), `${name} ist keine Gruppe.`).toBe(true);
    }
  });

  it("nennt je Gruppe die gemessene Tokenzahl aus TOOL_GROUPS", () => {
    const problems: string[] = [];
    for (const row of rows) {
      const group = row.cells[0].replaceAll("`", "");
      if (!isToolGroup(group)) continue;
      const written = parseGerman(row.cells[2]);
      const measured = measuredTokensOfGroup(group);
      if (written !== measured) {
        problems.push(
          `${group}: README ${formatGerman(written)}, gemessen ${formatGerman(measured)}`,
        );
      }
    }
    expect(
      problems.join("\n"),
      "Die Tokenspalte der Gruppentabelle in Abschnitt 7.4 der README weicht von den " +
        "gemessenen Zahlen in src/registry/groups.ts ab. Der Abschnitt weist seine Zahlen " +
        "ausdrücklich als gemessen aus; pnpm measure-tokens gibt den aktuellen Stand aus.",
    ).toBe("");
  });

  it("nennt je Gruppe die Zahl ihrer Werkzeuge", () => {
    const problems: string[] = [];
    for (const row of rows) {
      const group = row.cells[0].replaceAll("`", "");
      if (!isToolGroup(group)) continue;
      const written = parseGerman(row.cells[1]);
      const counted = toolCountOf(group);
      if (written !== counted) {
        problems.push(`${group}: README ${String(written)}, gezählt ${String(counted)}`);
      }
    }
    expect(
      problems.join("\n"),
      "Die Spalte „Werkzeuge“ der Gruppentabelle in Abschnitt 7.4 der README weicht " +
        "vom Register ab.",
    ).toBe("");
  });

  it("summiert die elf Endpunktgruppen richtig", () => {
    const section = groupSection();
    const sumRow = tableRows(section).find((row) => row.cells[0].includes("Summe"));
    expect(
      sumRow,
      "Die Gruppentabelle in Abschnitt 7.4 der README führt keine Summenzeile mehr. Sie ist " +
        "die Zahl, gegen die ein Nutzer seine Ersparnis rechnet.",
    ).toBeDefined();
    // Die beiden Zellen sind fett gesetzt (`**54**`); `numbersIn` nimmt die Zahl aus der
    // Auszeichnung heraus, statt an den Sternen zu scheitern.
    const tools = numbersIn((sumRow as TableRow).cells[1])[0];
    const tokens = numbersIn((sumRow as TableRow).cells[2])[0];
    expect(
      tools,
      "Die Summenzeile nennt nicht die Zahl der Endpunktwerkzeuge aus dem Register.",
    ).toBe(TOOL_ENTRIES.length);
    expect(
      tokens,
      "Die Summenzeile nennt nicht die Summe der elf gemessenen Endpunktgruppen aus " +
        "src/registry/groups.ts.",
    ).toBe(measuredTokensOf(ENDPOINT_GROUPS).tokens);
  });

  it("nennt im Fließtext dieselbe Summe wie die Tabelle", () => {
    const section = groupSection();
    const endpoints = measuredTokensOf(ENDPOINT_GROUPS).tokens;
    expect(
      section,
      `Der Fließtext in Abschnitt 7.4 nennt nicht "**${formatGerman(endpoints)} Token**" als ` +
        "Gewicht der Endpunktwerkzeuge. Das ist der erste fette Satz des Abschnitts und die " +
        "Zahl, die den ganzen Schalter begründet.",
    ).toContain(`**${formatGerman(endpoints)} Token**`);
    expect(
      section,
      `Der Fließtext in Abschnitt 7.4 sagt nicht mehr, dass die ${formatGerman(
        measuredTokensOfGroup(BUNDLE_TOOL_GROUP),
      )} Token der Bündelgruppe zu den ${formatGerman(endpoints)} hinzukommen.`,
    ).toContain(
      `Ihre ${formatGerman(measuredTokensOfGroup(BUNDLE_TOOL_GROUP))} Token kommen zu den ` +
        `${formatGerman(endpoints)} hinzu`,
    );
  });
});

describe("README, Abschnitt 7.4, empfohlene Profile", () => {
  /** Die Zeilen der Profiltabelle, die ein `BB_MCP_TOOL_GROUPS` setzen. */
  const rows = tableRows(groupSection())
    .map((row) => {
      const setting = /BB_MCP_TOOL_GROUPS=([a-z_,]+)/.exec(row.line);
      return setting === null
        ? null
        : {
            groups: setting[1].split(","),
            tokens: numbersIn(row.cells.at(-1) ?? ""),
            line: row.line,
          };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    // Der Codeblock am Anfang des Abschnitts setzt die Variable auch, steht aber in keiner
    // Tabelle; `tableRows` liefert ihn deshalb gar nicht erst aus.
    .filter((row) => row.tokens.length > 0);

  it("findet die drei Profilzeilen mit einer Gruppenauswahl", () => {
    expect(
      rows.length,
      "Die Profiltabelle in Abschnitt 7.4 der README führt keine drei Zeilen mehr, die " +
        "BB_MCP_TOOL_GROUPS setzen und eine Tokenzahl nennen. Ohne sie prüft diese Datei " +
        "nichts und wäre still zufrieden.",
    ).toBe(3);
  });

  it("rechnet jede Profilzeile aus den gemessenen Gruppenzahlen", () => {
    const alle = measuredTokensOf(TOOL_GROUP_NAMES).tokens;
    const problems: string[] = [];
    for (const row of rows) {
      const groups: ToolGroup[] = [];
      for (const name of row.groups) {
        expect(
          isToolGroup(name),
          `Die Profiltabelle in Abschnitt 7.4 nennt die Gruppe ${name}, die es nicht gibt. ` +
            "Ein solcher Wert ist beim Serverstart ein Fehler; als Empfehlung in der README " +
            "wäre er eine Anleitung zum Absturz.",
        ).toBe(true);
        if (isToolGroup(name)) groups.push(name);
      }
      const expected = measuredTokensOf(groups).tokens;
      const [first, second] = row.tokens;
      if (first !== expected) {
        problems.push(
          `${row.groups.join(",")}: README ${formatGerman(first)}, ` +
            `gemessen ${formatGerman(expected)}`,
        );
      }
      // Die zweite Zahl einer Zeile ist immer der Vergleichswert „statt", also alle zwölf
      // Gruppen zusammen. Sie steht nur in der ersten Zeile, ist aber die Zahl, an der die
      // Ersparnis hängt.
      if (second !== undefined && second !== alle) {
        problems.push(
          `${row.groups.join(",")}, Vergleichswert: README ${formatGerman(second)}, ` +
            `gemessen ${formatGerman(alle)}`,
        );
      }
    }
    expect(
      problems.join("\n"),
      "Die Tokenspalte der Profiltabelle in Abschnitt 7.4 der README passt nicht zur Summe " +
        "der gewählten Gruppen aus src/registry/groups.ts. Diese Zeilen sind der Grund, " +
        "warum jemand den Schalter überhaupt setzt.",
    ).toBe("");
  });

  it("nennt im Absatz darunter dieselben Einzelzahlen", () => {
    const section = groupSection();
    const problems: string[] = [];
    for (const match of section.matchAll(/([\d.]+) für `([a-z_]+)`/g)) {
      const group = match[2];
      if (!isToolGroup(group)) continue;
      const written = parseGerman(match[1]);
      const measured = measuredTokensOfGroup(group);
      if (written !== measured) {
        problems.push(
          `${group}: README ${formatGerman(written)}, gemessen ${formatGerman(measured)}`,
        );
      }
    }
    expect(
      problems.join("\n"),
      "Der Absatz unter der Profiltabelle in Abschnitt 7.4 der README nennt die Summanden " +
        "einzeln. Mindestens einer davon ist nicht mehr die gemessene Zahl.",
    ).toBe("");
    expect(
      section,
      "Der Absatz unter der Profiltabelle nennt nicht mehr die gemessene Tokenzahl der " +
        "Bündelgruppe. Sie ist der Summand, der in allen drei Profilzeilen steckt.",
    ).toContain(`${formatGerman(measuredTokensOfGroup(BUNDLE_TOOL_GROUP))} Token für die fünf`);
  });
});

describe("README, Kontextkosten außerhalb von Abschnitt 7.4", () => {
  const endpoints = measuredTokensOf(ENDPOINT_GROUPS).tokens;
  const bundles = measuredTokensOfGroup(BUNDLE_TOOL_GROUP);

  // Die Wendung „Bündelwerkzeuge weitere …" steht zweimal in der README: einmal in Abschnitt 10
  // (Sicherheit, Kontextkosten) und einmal in Abschnitt 12 (was dieser Server nicht kann). Beide
  // Stellen wiederholen dieselbe gemessene Zahl, und beide sind am 2026-09-13 mit veraltet.
  // Angesetzt wird an der Wendung und nicht an irgendeiner Zahl im Dokument, damit ein Satz
  // über ganz andere Zahlen diese Prüfung nicht grundlos rot macht.
  const mentions = [
    ...README.matchAll(/Bündelwerkzeuge weitere ([\d.]+)(?:, zusammen ([\d.]+))?/g),
  ];

  it("nennt das Gewicht der Bündelwerkzeuge an beiden Stellen gemessen", () => {
    expect(
      mentions.length,
      "Die README nennt das Gewicht der Bündelwerkzeuge nicht mehr an den beiden erwarteten " +
        "Stellen (Abschnitt 10 und Abschnitt 12). Wurde der Satz umgeschrieben, gehört diese " +
        "Prüfung mit umgeschrieben und nicht gelöscht.",
    ).toBe(2);
    const problems: string[] = [];
    for (const mention of mentions) {
      const written = parseGerman(mention[1]);
      if (written !== bundles) {
        problems.push(`weitere ${formatGerman(written)}, gemessen ${formatGerman(bundles)}`);
      }
      if (mention[2] !== undefined && parseGerman(mention[2]) !== endpoints + bundles) {
        problems.push(
          `zusammen ${formatGerman(parseGerman(mention[2]))}, ` +
            `gemessen ${formatGerman(endpoints + bundles)}`,
        );
      }
    }
    expect(
      problems.join("\n"),
      "Die Kontextkosten in den Abschnitten 10 und 12 der README weichen von " +
        "src/registry/groups.ts ab. Beide Stellen sagen ausdrücklich „gemessen“.",
    ).toBe("");
  });

  it("nennt die Gesamtsumme mindestens einmal", () => {
    expect(
      mentions.some((mention) => mention[2] !== undefined),
      `Keine der beiden Stellen nennt mehr die Gesamtsumme von ${formatGerman(
        endpoints + bundles,
      )} Token. Sie ist die Zahl, die jemand mit dem Kontextfenster seines Clients vergleicht.`,
    ).toBe(true);
  });
});
