// Vertragstest aus Plan 9.3: Die Werkzeugliste des Bundle-Manifests gegen das Register.
//
// Der Fehler, auf den diese Prüfung antwortet: Eine von Hand gepflegte Werkzeugliste im
// Manifest driftet früher oder später von der tatsächlichen Werkzeugmenge ab. Wer das
// Manifest liest, glaubt danach etwas über den Server, das nicht mehr stimmt.
//
// Die Gegenmaßnahme hat zwei Hälften, und diese Datei prüft beide:
//
//   1. Die Liste wird **erzeugt** (`buildToolList` aus `scripts/build-mcpb.ts`), nicht
//      gepflegt. Die Vorlage `.mcpb/manifest.template.json` trägt eine leere Liste; trüge sie
//      eine gefüllte, bräche schon `readManifestTemplate` ab.
//   2. Die erzeugte Liste wird **danach gegen das Register geprüft**, in beide Richtungen:
//      kein Werkzeug fehlt, keines ist zu viel, und kein Text weicht ab.
//
// Geprüft wird gegen das Register unter `src/`, nicht gegen `dist/`. Der Bau ist zur Testzeit
// nicht vorausgesetzt (`pnpm test` baut nicht); `scripts/build-mcpb.ts` lädt zur Bauzeit
// dagegen ausdrücklich das gebaute Register und bricht ab, wenn `dist/` veraltet ist.

import { describe, expect, it } from "vitest";

import {
  buildToolList,
  readManifestTemplate,
  renderManifest,
  type Manifest,
  type ManifestTool,
} from "../../scripts/build-mcpb.js";
import { REGISTRY, TOOL_BY_NAME } from "../helpers/registry-fixtures.js";

const COUNT = 54;

/** Eine Version, die es so nie gibt. Sie belegt, dass `renderManifest` wirklich einsetzt. */
const TESTVERSION = "9.9.9-test";

const template: Manifest = readManifestTemplate();
const tools: readonly ManifestTool[] = buildToolList(REGISTRY);
const manifest: Manifest = renderManifest(template, TESTVERSION, tools);

function manifestTools(): readonly ManifestTool[] {
  const value = manifest["tools"];
  expect(Array.isArray(value)).toBe(true);
  return value as readonly ManifestTool[];
}

describe("Bundle-Manifest, Vorlage", () => {
  it("trägt eine leere Werkzeugliste und die Platzhalterversion", () => {
    // readManifestTemplate wirft bei beidem. Der Test hält fest, warum: Eine von Hand
    // gepflegte Liste wäre die zweite Quelle, die dieser Vertragstest ausschließen soll.
    expect(template["tools"]).toEqual([]);
    expect(template["version"]).toBe("0.0.0-vorlage");
  });

  it("beschreibt einen Node-Server, dessen Einstiegspunkt zum Aufrufbefehl passt", () => {
    const server = template["server"] as {
      type: string;
      entry_point: string;
      mcp_config: { command: string; args: string[]; env: Record<string, string> };
    };

    expect(server.type).toBe("node");
    expect(server.mcp_config.command).toBe("node");
    // Der Einstiegspunkt ist eine Angabe über das Bundle, das Argument der Startbefehl.
    // Zeigen die beiden auf verschiedene Dateien, startet etwas anderes als angekündigt.
    expect(server.mcp_config.args).toEqual([`\${__dirname}/${server.entry_point}`]);
  });

  it("verweist in env ausschließlich auf erklärte user_config-Felder", () => {
    const server = template["server"] as {
      mcp_config: { env: Record<string, string> };
    };
    const userConfig = template["user_config"] as Record<string, unknown>;

    const problems: string[] = [];
    for (const [variable, value] of Object.entries(server.mcp_config.env)) {
      const match = /^\$\{user_config\.([a-z0-9_]+)\}$/.exec(value);
      if (match === null) {
        problems.push(`${variable} verweist mit "${value}" auf nichts Erklärtes.`);
        continue;
      }
      const fieldName = match[1] ?? "";
      if (!(fieldName in userConfig)) {
        problems.push(
          `${variable} verweist auf user_config.${fieldName}, und dieses Feld gibt es nicht. ` +
            "Claude Desktop setzte dann eine leere Zeichenkette ein.",
        );
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("kennzeichnet die Werkzeugliste als vollständig und nicht zur Laufzeit erzeugt", () => {
    // tools_generated: true hieße, der Server melde zur Laufzeit weitere Werkzeuge an. Das
    // tut er nicht: Es sind genau 54, eines je Endpunkt (E1).
    expect(template["tools_generated"]).toBe(false);
  });
});

describe("Bundle-Manifest, erzeugte Werkzeugliste", () => {
  it("führt genau 54 Werkzeuge", () => {
    expect(manifestTools()).toHaveLength(COUNT);
    expect(REGISTRY).toHaveLength(COUNT);
  });

  it("deckt sich in beide Richtungen mit dem Register", () => {
    const inManifest = new Set(manifestTools().map((tool) => tool.name));
    const problems: string[] = [];

    for (const entry of REGISTRY) {
      if (!inManifest.has(entry.name)) {
        problems.push(`${entry.name} steht im Register, aber nicht im Bundle-Manifest.`);
      }
    }
    for (const name of inManifest) {
      if (!TOOL_BY_NAME.has(name)) {
        problems.push(`${name} steht im Bundle-Manifest, aber in keinem Registereintrag.`);
      }
    }

    expect(problems.join("\n")).toBe("");
  });

  it("übernimmt jede Beschreibung unverändert aus dem Register", () => {
    const problems: string[] = [];

    for (const tool of manifestTools()) {
      const entry = TOOL_BY_NAME.get(tool.name);
      if (entry === undefined) {
        continue; // Der vorige Test nennt diesen Fall bereits beim Namen.
      }
      if (tool.description !== entry.description) {
        problems.push(
          `${tool.name}: Die Beschreibung im Manifest weicht vom Register ab. ` +
            "Gekürzt wird nichts; was vor der Installation zu lesen ist, ist derselbe Text, " +
            "den der Agent danach sieht.",
        );
      }
      if (tool.description.trim() === "") {
        problems.push(`${tool.name}: leere Beschreibung.`);
      }
    }

    expect(problems.join("\n")).toBe("");
  });

  it("führt je Eintrag ausschließlich name und description", () => {
    // Das Manifest-Schema von @anthropic-ai/mcpb setzt additionalProperties: false. Ein
    // zusätzliches Feld ließe `mcpb validate` scheitern, und zwar erst im Bau.
    const problems: string[] = [];
    for (const tool of manifestTools()) {
      const key = Object.keys(tool).sort();
      if (key.join(",") !== "description,name") {
        problems.push(`${tool.name}: unerwartete Felder ${key.join(", ")}.`);
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("ist nach Namen in Codepunktfolge sortiert", () => {
    // Zwei Bauläufe auf zwei Rechnern müssen zeichengleiche Manifeste ergeben.
    const names = manifestTools().map((tool) => tool.name);
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sorted);
  });
});

describe("Bundle-Manifest, Zusammenbau", () => {
  it("setzt die Version ein und lässt die Vorlage unverändert", () => {
    expect(manifest["version"]).toBe(TESTVERSION);
    // Die Vorlage ist danach immer noch Vorlage: renderManifest kopiert, statt zu ändern.
    expect(template["version"]).toBe("0.0.0-vorlage");
    expect(template["tools"]).toEqual([]);
  });

  it("übernimmt jedes übrige Feld der Vorlage unverändert", () => {
    const problems: string[] = [];
    for (const key of Object.keys(template)) {
      if (key === "version" || key === "tools") {
        continue;
      }
      if (manifest[key] !== template[key]) {
        problems.push(`${key} wurde beim Zusammenbau verändert.`);
      }
    }
    expect(problems.join("\n")).toBe("");
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(template).sort());
  });
});
