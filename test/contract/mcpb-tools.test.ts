// Vertragstest: Die Werkzeugliste des Bundle-Manifests gegen das Register.
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
//
// **Die ausgelieferte Werkzeugmenge sind beide Listen zusammen**: die 54 Endpunktwerkzeuge aus
// `TOOL_ENTRIES` und die 5 Bündelwerkzeuge aus `BUNDLE_ENTRIES`; die 54 bleiben neben den
// Bündeln unverändert bestehen. Das Manifest trägt
// `tools_generated: false` und behauptet damit eine vollständige Liste; eine Liste aus nur
// einer der beiden Mengen wäre im Installationsdialog von Claude Desktop schlicht falsch.
//
// Der dritte Block dieser Datei prüft die **Zahlen im Fließtext** der Vorlage. Sie stehen dort
// als Literale, weil `description`, `long_description` und die Beschreibung von `read_only`
// ganze deutsche Sätze sind und kein Platzhalterraster vertragen; die Gegenmaßnahme gegen das
// Veralten ist deshalb dieser Test und nicht eine Einsetzung zur Bauzeit.

import { describe, expect, it } from "vitest";

import {
  buildToolList,
  readManifestTemplate,
  renderManifest,
  type Manifest,
  type ManifestTool,
} from "../../scripts/build-mcpb.js";
import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { TOOL_CLASSES } from "../../src/registry/classes.js";
import type { ToolClass, ToolEffect } from "../../src/registry/types.js";
import { REGISTRY } from "../helpers/registry-fixtures.js";

/** So viel eines Eintrags braucht diese Datei. Mehr haben beide Listen nicht gemeinsam. */
interface ToolListEntry {
  readonly name: string;
  readonly description: string;
  readonly toolClass: ToolClass;
  readonly effect: ToolEffect;
}

/** Die ausgelieferte Werkzeugmenge: Endpunktwerkzeuge und Bündelwerkzeuge zusammen. */
const SHIPPED: readonly ToolListEntry[] = [...REGISTRY, ...BUNDLE_ENTRIES];

const SHIPPED_BY_NAME: ReadonlyMap<string, ToolListEntry> = new Map(
  SHIPPED.map((entry): [string, ToolListEntry] => [entry.name, entry]),
);

const COUNT = SHIPPED.length;

/** Eine Version, die es so nie gibt. Sie belegt, dass `renderManifest` wirklich einsetzt. */
const TESTVERSION = "9.9.9-test";

const template: Manifest = readManifestTemplate();
const tools: readonly ManifestTool[] = buildToolList(SHIPPED);
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
    // tut er nicht: Es sind 54 Endpunktwerkzeuge, eines je Endpunkt, und 5 Bündel daneben.
    expect(template["tools_generated"]).toBe(false);
  });
});

describe("Bundle-Manifest, erzeugte Werkzeugliste", () => {
  it("führt beide Werkzeugmengen, also 54 Endpunktwerkzeuge und 5 Bündel", () => {
    expect(manifestTools()).toHaveLength(COUNT);
    expect(REGISTRY).toHaveLength(54);
    expect(BUNDLE_ENTRIES).toHaveLength(5);
    expect(COUNT).toBe(59);
  });

  it("deckt sich in beide Richtungen mit der ausgelieferten Werkzeugmenge", () => {
    const inManifest = new Set(manifestTools().map((tool) => tool.name));
    const problems: string[] = [];

    for (const entry of SHIPPED) {
      if (!inManifest.has(entry.name)) {
        problems.push(`${entry.name} wird ausgeliefert, steht aber nicht im Bundle-Manifest.`);
      }
    }
    for (const name of inManifest) {
      if (!SHIPPED_BY_NAME.has(name)) {
        problems.push(
          `${name} steht im Bundle-Manifest, aber in keinem Register- und keinem Bündeleintrag.`,
        );
      }
    }

    expect(problems.join("\n")).toBe("");
  });

  it("übernimmt jede Beschreibung unverändert aus dem Eintrag", () => {
    const problems: string[] = [];

    for (const tool of manifestTools()) {
      const entry = SHIPPED_BY_NAME.get(tool.name);
      if (entry === undefined) {
        continue; // Der vorige Test nennt diesen Fall bereits beim Namen.
      }
      if (tool.description !== entry.description) {
        problems.push(
          `${tool.name}: Die Beschreibung im Manifest weicht vom Eintrag ab. ` +
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

// ---------------------------------------------------------------------------------------
// Die Zahlen im Fließtext
// ---------------------------------------------------------------------------------------
//
// `description`, `long_description` und die Beschreibung des Schalters `read_only` sind die
// Texte, die ein Mensch im Installationsdialog von Claude Desktop liest, der Zielumgebung
// dieses Servers. Sie nennen Werkzeugzahlen, und sie nennen sie als Literale: Es sind ganze
// deutsche Sätze, und ein Platzhalterraster („{{TOOL_COUNT}} Werkzeuge") machte die Vorlage
// unlesbar und die Beugung falsch. Die Gegenmaßnahme gegen das Veralten ist deshalb dieser
// Block. Er rechnet jede genannte Zahl aus der ausgelieferten Werkzeugmenge nach und verlangt
// zusätzlich, dass im Text keine Zahl steht, die sich nicht aus ihr ergibt.

/** Deutsche Zahlwörter, soweit die Vorlage sie ausschreibt. */
const ZAHLWORT: Readonly<Record<number, string>> = {
  1: "ein",
  2: "zwei",
  3: "drei",
  4: "vier",
  5: "fünf",
};

function zahlwort(value: number): string {
  const word = ZAHLWORT[value];
  if (word === undefined) {
    throw new Error(
      `Die Vorlage schreibt diese Zahl als Wort aus, und für ${value} kennt der Test keines. ` +
        "Entweder die Tabelle ZAHLWORT erweitern oder den Satz in der Vorlage auf Ziffern umstellen.",
    );
  }
  return word;
}

function readOnlyCount(entries: readonly ToolListEntry[]): number {
  return entries.filter((entry) => TOOL_CLASSES[entry.toolClass].annotations.readOnlyHint).length;
}

function effectCount(entries: readonly ToolListEntry[], effect: ToolEffect): number {
  return entries.filter((entry) => entry.effect === effect).length;
}

describe("Bundle-Manifest, die Zahlen im Fließtext der Vorlage", () => {
  const endpoints = REGISTRY.length;
  const bundles = BUNDLE_ENTRIES.length;
  const total = SHIPPED.length;
  const lesend = readOnlyCount(SHIPPED);
  const schreibend = total - lesend;
  const lesendeBuendel = readOnlyCount(BUNDLE_ENTRIES);
  const schreibendeBuendel = BUNDLE_ENTRIES.filter(
    (entry) => !TOOL_CLASSES[entry.toolClass].annotations.readOnlyHint,
  );

  const userConfig = template["user_config"] as Record<string, { description?: string }>;
  const description = template["description"] as string;
  const longDescription = template["long_description"] as string;
  const readOnlyDescription = userConfig["read_only"]?.description ?? "";

  it("liest die drei Texte überhaupt als Zeichenketten", () => {
    for (const text of [description, longDescription, readOnlyDescription]) {
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("nennt in description die beiden Werkzeugmengen", () => {
    const problems: string[] = [];
    for (const phrase of [`${endpoints} Endpunktwerkzeuge`, `${bundles} Bündelwerkzeuge`]) {
      if (!description.includes(phrase)) {
        problems.push(`description nennt nicht „${phrase}".`);
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("nennt in long_description jede Zahl so, wie das Register sie hergibt", () => {
    const problems: string[] = [];
    const phrases = [
      `Er stellt ${total} Werkzeuge bereit`,
      `${endpoints} Endpunktwerkzeuge`,
      `(${effectCount(REGISTRY, "read")} lesende, ${effectCount(REGISTRY, "create")} anlegende, ` +
        `${effectCount(REGISTRY, "modify")} ändernde und ${effectCount(REGISTRY, "delete")} löschende)`,
      `${bundles} Bündelwerkzeuge`,
      `${lesend} der ${total} Werkzeuge lesen nur, ${schreibend} schreiben`,
      `${schreibend} der ${total} Werkzeuge schreiben`,
      `alle ${endpoints} bleiben daneben nutzbar`,
      `alle ${schreibend} schreibenden Werkzeuge`,
      `die ${zahlwort(lesendeBuendel)} lesenden Bündel`,
    ];
    for (const phrase of phrases) {
      if (!longDescription.includes(phrase)) {
        problems.push(`long_description nennt nicht „${phrase}".`);
      }
    }
    if (
      !longDescription
        .toLowerCase()
        .includes(`${zahlwort(lesendeBuendel)} der ${zahlwort(bundles)} lesen nur`)
    ) {
      problems.push(
        `long_description sagt nicht, dass ${zahlwort(lesendeBuendel)} der ${zahlwort(bundles)} Bündel nur lesen.`,
      );
    }
    expect(problems.join("\n")).toBe("");
  });

  it("nennt in der Beschreibung von read_only, was der Schalter sperrt und was er stehen lässt", () => {
    const problems: string[] = [];
    const phrases = [
      `auf die ${lesend} lesenden Werkzeuge`,
      `die ${effectCount(REGISTRY, "read")} lesenden Endpunkte`,
      `die ${zahlwort(lesendeBuendel)} lesenden Bündel`,
      `Die ${schreibend} schreibenden Werkzeuge lehnen dann ab`,
    ];
    for (const phrase of phrases) {
      if (!readOnlyDescription.includes(phrase)) {
        problems.push(`user_config.read_only.description nennt nicht „${phrase}".`);
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("benennt das einzige schreibende Bündel namentlich, in beiden Texten", () => {
    // Vier der fünf Bündel lesen nur; bb_reports_run ersetzt den zuvor erzeugten Bericht
    // desselben Typs und ist deshalb im Nur-Lesen-Modus gesperrt. Wächst die Zahl der
    // schreibenden Bündel, ist jeder Satz mit „als einziges" falsch — dann bricht dieser Test.
    expect(schreibendeBuendel.map((entry) => entry.name)).toEqual(["bb_reports_run"]);
    expect(longDescription).toContain("bb_reports_run, schreibt als einziges");
    expect(readOnlyDescription).toContain("bb_reports_run");
  });

  it("führt in keinem der drei Texte eine Zahl, die die Werkzeugmenge nicht hergibt", () => {
    // Die Gegenprobe zu den Wendungen oben: Sie fängt eine Zahl, die beim Umschreiben
    // stehengeblieben ist, auch dort, wo dieser Test keinen Satz erwartet.
    const erlaubt = new Set<number>([
      endpoints,
      bundles,
      total,
      lesend,
      schreibend,
      effectCount(REGISTRY, "read"),
      effectCount(REGISTRY, "create"),
      effectCount(REGISTRY, "modify"),
      effectCount(REGISTRY, "delete"),
    ]);

    const problems: string[] = [];
    for (const [feld, text] of [
      ["description", description],
      ["long_description", longDescription],
      ["user_config.read_only.description", readOnlyDescription],
    ] as const) {
      for (const treffer of text.matchAll(/\b\d+\b/g)) {
        const zahl = Number(treffer[0]);
        if (!erlaubt.has(zahl)) {
          problems.push(
            `${feld} nennt die Zahl ${zahl}, und keine Werkzeugzahl dieses Servers lautet so. ` +
              `Erlaubt sind: ${[...erlaubt].sort((a, b) => a - b).join(", ")}.`,
          );
        }
      }
    }
    expect(problems.join("\n")).toBe("");
  });
});
