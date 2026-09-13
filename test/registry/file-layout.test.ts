// P12: Dateiaufbau des Registers.
//
// Eine Datei je Werkzeug, Dateiname gleich exportiertem `name` plus `.ts`. Erst dadurch hat
// die Frage „wo ändere ich bb_postings_cancel" genau eine Antwort, und erst dadurch können
// mehrere Bearbeiter gleichzeitig arbeiten, ohne sich in dieselbe Datei
// zu schreiben.
//
// Der Index src/registry/index.generated.ts ist NICHT eingecheckt. Er entsteht
// zur Testlaufzeit, weil `pnpm test` `pnpm generate` als ersten Schritt aufruft.
// Diese Prüfung vergleicht deshalb den frisch erzeugten Index mit dem Verzeichnisinhalt und
// setzt keine eingecheckte Datei voraus; ein Test, der das täte, scheiterte auf einem
// frischen Klon.

import { describe, expect, it } from "vitest";

import {
  REGISTRY,
  TOOL_BY_NAME,
  TOOL_BY_SPEC_PATH,
  registryFileNames,
  specPathOf,
} from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "./class-list.js";

const COUNT = 54;

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

describe("P12 Dateiaufbau", () => {
  it("führt genau 54 Dateien unter src/registry/tools/", () => {
    const files = registryFileNames();
    const present = new Set(files);
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      if (!present.has(name)) {
        problems.push(`src/registry/tools/${name}.ts fehlt.`);
      }
    }

    const expectedNames = new Set(EXPECTED_TOOL_NAMES);
    for (const name of files) {
      if (!expectedNames.has(name)) {
        problems.push(
          `src/registry/tools/${name}.ts ist zu viel: Der Dateiname ist zugleich der Werkzeugname, und ${name} steht in keiner Liste.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(files).toHaveLength(COUNT);
  });

  it("deckt den erzeugten Index mit dem Verzeichnisinhalt", () => {
    const files = registryFileNames();
    const inIndex = REGISTRY.map((tool) => tool.name);
    const problems: string[] = [];

    for (const name of files) {
      if (!inIndex.includes(name)) {
        problems.push(
          `src/registry/tools/${name}.ts steht nicht im erzeugten Index. Entweder hat der Generator die Datei nicht erfasst, oder sie exportiert keinen Eintrag namens ${name} (scripts/gen-registry-index.ts).`,
        );
      }
    }
    for (const name of inIndex) {
      if (!files.includes(name)) {
        problems.push(
          `${name}: steht im Index, aber es gibt keine Datei src/registry/tools/${name}.ts.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(inIndex).toHaveLength(files.length);
  });

  it("hält Dateiname und exportierten name deckungsgleich", () => {
    const files = new Set(registryFileNames());
    const problems = REGISTRY.filter((tool) => !files.has(tool.name)).map(
      (tool) =>
        `${tool.name}: das Feld name deckt sich mit keinem Dateinamen. Dateiname und name müssen übereinstimmen.`,
    );

    expectNoIssues(problems);
  });

  it("schlägt jeden Eintrag über Name und Spezifikationspfad nach", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      if (TOOL_BY_NAME.get(tool.name) !== tool) {
        problems.push(`${tool.name}: über TOOL_BY_NAME nicht auffindbar.`);
      }
      const path = specPathOf(tool);
      if (TOOL_BY_SPEC_PATH.get(path) !== tool) {
        problems.push(
          `${tool.name}: über TOOL_BY_SPEC_PATH mit ${path} nicht auffindbar. Nachgeschlagen wird immer mit dem Spezifikationspfad.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(TOOL_BY_NAME.size).toBe(COUNT);
    expect(TOOL_BY_SPEC_PATH.size).toBe(COUNT);
  });
});
