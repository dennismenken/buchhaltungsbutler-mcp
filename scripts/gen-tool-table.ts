// Erzeugt die drei Werkzeugtabellen der README aus dem Register.
//
// **Warum erzeugt und nicht von Hand gepflegt.** Die README nennt jedes Werkzeug mit Wirkung
// und Kurzbeschreibung. Eine von Hand gepflegte Tabelle wäre eine zweite Wahrheit neben
// src/registry/tools/ und liefe genau dann auseinander, wenn es darauf ankommt: beim
// Nachrüsten eines Endpunkts. Der CI-Schritt „pnpm generate, danach git diff --exit-code"
// (.github/workflows/ci.yml) prüft die eingecheckte README damit gegen das Register; ein
// vergessener Lauf ist rot und nicht unsichtbar.
//
// **Die Bündelwerkzeuge werden mitgeführt.** Sie stehen nicht in `index.generated.ts`, weil
// sie einen eigenen Eintragstyp tragen (die 54 Endpunktwerkzeuge bleiben
// unverändert, die Bündel kommen daneben). Dieses Skript liest sie deshalb aus
// `src/bundles/index.ts` und erzeugt daraus die Tabelle in Abschnitt 11.1 sowie die beiden
// Bündelzeilen der Bereichsübersicht in Abschnitt 1. Ein sechstes Bündel macht damit dieselbe
// CI-Prüfung rot wie ein neuer Endpunkt, statt in der README unbemerkt zu fehlen.
//
// **Warum hier dynamisch importiert wird.** Node führt TypeScript aus, löst aber einen
// Spezifizierer `./x.js` nicht auf `./x.ts` auf — und genau so importiert dieses Projekt
// (verbatimModuleSyntax, NodeNext). Ein statischer Import von `src/**` würde deshalb zur
// Laufzeit scheitern, obwohl er typprüft. Der Auflösungshaken unten holt das nach; die Typen
// kommen über `typeof import(...)` trotzdem aus den echten Dateien. Dasselbe Muster benutzt
// scripts/measure-tokens.ts.
//
// Node führt diese Datei direkt aus und entfernt die Typannotationen selbst; ab der
// festgelegten Untergrenze >=22.19.0 braucht es dafür keinen TypeScript-Starter.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.endsWith(".js")) throw error;
      return nextResolve(`${specifier.slice(0, -".js".length)}.ts`, context);
    }
  },
});

const ROOT = new URL("../", import.meta.url);

/** Die URL einer Projektdatei, aus der dieses Skript lädt. */
function moduleUrl(relativePath: string): string {
  return new URL(relativePath, ROOT).href;
}

/** Ein Projektpfad im Dateisystem. */
function filePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, ROOT));
}

const REGISTRY_INDEX = "src/registry/index.generated.ts";
const BUNDLE_INDEX = "src/bundles/index.ts";
const README = "README.md";

// Der Registerindex wird nicht eingecheckt und von gen-registry-index.ts erzeugt.
// Dieses Skript läuft alphabetisch danach, die Datei ist also da. Fehlt sie trotzdem, sagt
// die Meldung, was zu tun ist, statt einen Modulpfad zu melden, den niemand deutet.
if (!existsSync(filePath(REGISTRY_INDEX))) {
  console.error(
    `${REGISTRY_INDEX} fehlt. Die Datei wird erzeugt und nicht eingecheckt: ` +
      "zuerst scripts/gen-registry-index.ts ausführen, dann diesen Generator. " +
      "Über pnpm generate geschieht das von selbst.",
  );
  process.exit(1);
}

const registry = (await import(
  moduleUrl(REGISTRY_INDEX)
)) as typeof import("../src/registry/index.generated.js");

// Die Bündelliste ist eingecheckt und braucht keinen Generatorlauf vorher; sie wird deshalb
// ohne die Existenzprüfung von oben geladen.
const bundles = (await import(moduleUrl(BUNDLE_INDEX))) as typeof import("../src/bundles/index.js");

type Entry = (typeof registry.TOOL_ENTRIES)[number];
type Bundle = (typeof bundles.BUNDLE_ENTRIES)[number];

// --- Bereiche --------------------------------------------------------------------------

/**
 * Die sieben Bereiche der README-Gliederung, zugeordnet über den
 * Ressourcenteil des Werkzeugnamens.
 *
 * Der Ressourcenteil steht immer zwischen `bb_` und dem Verb, ist also aus dem
 * Namen ablesbar. Die Zuordnung zu einer deutschen Überschrift ist es nicht; sie steht
 * deshalb hier. Eine unbekannte Ressource lässt diesen Generator **nicht** scheitern,
 * sondern landet unter „Weitere": Das Nachrüsten eines Endpunkts bleibt damit bei den fünf
 * Schritten, und niemand muss eine Liste an zweiter Stelle pflegen,
 * damit `pnpm generate` überhaupt durchläuft. Die Zeile auf stderr sagt trotzdem, dass hier
 * ein Wort fehlt.
 */
const AREA_BY_RESOURCE: ReadonlyMap<string, string> = new Map([
  ["receipts", "Belege"],
  ["comments", "Belege"],
  ["transactions", "Zahlungen"],
  ["invoices", "Rechnungen"],
  ["postings", "Buchungen"],
  ["debtors", "Stammdaten"],
  ["creditors", "Stammdaten"],
  ["postingaccounts", "Stammdaten"],
  ["payment_accounts", "Stammdaten"],
  ["cost_locations", "Kostenstellen"],
  ["reports", "Berichte"],
]);

/** Die Reihenfolge der Bereiche in der README. „Weitere" steht immer am Ende. */
const AREA_ORDER: readonly string[] = [
  "Belege",
  "Zahlungen",
  "Rechnungen",
  "Buchungen",
  "Stammdaten",
  "Kostenstellen",
  "Berichte",
];

const FALLBACK_AREA = "Weitere";

/**
 * Der Bereich eines Werkzeugs. Geprüft wird vom längsten Ressourcennamen zum kürzesten, damit
 * `payment_accounts` nicht an einem kürzeren Präfix hängen bleibt.
 */
function areaOf(name: string): string {
  for (const [resource, area] of AREA_BY_RESOURCE) {
    if (name.startsWith(`bb_${resource}_`)) return area;
  }
  return FALLBACK_AREA;
}

// --- Wirkung ---------------------------------------------------------------------------

/** Die deutschen Wirkungsbezeichnungen aus grundlagen.md 7.3, wie verwendet. */
const EFFECT_LABELS: Readonly<Record<Entry["effect"], string>> = {
  read: "lesend",
  create: "anlegend",
  modify: "ändernd",
  delete: "löschend",
};

// --- Der erste Satz --------------------------------------------------------------------

/**
 * Abkürzungen, nach deren Punkt kein Satz endet. Die Registereinträge führen derzeit keine
 * einzige davon; die Liste steht hier, damit ein später ergänztes „z. B." die Tabelle nicht
 * still zerschneidet.
 */
const ABBREVIATIONS = new Set([
  "z",
  "B",
  "bzw",
  "ggf",
  "u",
  "a",
  "d",
  "h",
  "Nr",
  "vgl",
  "ca",
  "inkl",
  "etc",
  "Abs",
  "S",
]);

/**
 * Der erste Satz einer Werkzeugbeschreibung. Er ist der Zwecksatz und damit
 * genau das „ein Satz" der README-Gliederung.
 */
function firstSentence(description: string): string {
  const text = description.trim();
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== ".") continue;
    const next = text[index + 1];
    if (next !== undefined && next !== " ") continue;
    const after = text.slice(index + 2).trimStart();
    if (after.length > 0 && after[0] !== after[0]?.toUpperCase()) continue;
    const word = /([A-Za-zÄÖÜäöüß]+)$/.exec(text.slice(0, index));
    if (word !== null && ABBREVIATIONS.has(word[1] ?? "")) continue;
    return text.slice(0, index + 1);
  }
  return text;
}

// --- Tabellen --------------------------------------------------------------------------

/** Senkrechte Striche würden die Tabellenzelle zerbrechen. In den Texten kommt keiner vor. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function groupByArea(entries: readonly Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const area of AREA_ORDER) groups.set(area, []);
  for (const entry of entries) {
    const area = areaOf(entry.name);
    const bucket = groups.get(area);
    if (bucket === undefined) {
      groups.set(area, [entry]);
    } else {
      bucket.push(entry);
    }
  }
  for (const [area, bucket] of groups) {
    if (bucket.length === 0) groups.delete(area);
  }
  return groups;
}

/**
 * Die Übersicht nach Bereichen.
 *
 * Die Tabelle trägt drei Summenzeilen statt einer: die Endpunktwerkzeuge, die Bündelwerkzeuge
 * und beides zusammen. Nur die letzte Zahl ist die, die `tools/list` einem Client wirklich
 * meldet — und genau sie stand vor den Bündeln nirgends in Abschnitt 1.
 */
function renderAreaTable(
  groups: ReadonlyMap<string, readonly Entry[]>,
  total: number,
  bundleEntries: readonly Bundle[],
): string {
  const lines = ["| Bereich | Werkzeuge | davon lesend |", "| --- | --- | --- |"];
  let readTotal = 0;
  for (const [area, bucket] of groups) {
    const reading = bucket.filter((entry) => entry.effect === "read").length;
    readTotal += reading;
    lines.push(`| ${cell(area)} | ${String(bucket.length)} | ${String(reading)} |`);
  }
  const bundleReading = bundleEntries.filter((entry) => entry.effect === "read").length;
  lines.push(
    `| **Endpunktwerkzeuge zusammen** | **${String(total)}** | **${String(readTotal)}** |`,
  );
  lines.push(
    `| Bündelwerkzeuge ([11.1](#111-die-fünf-bündelwerkzeuge)) | ` +
      `${String(bundleEntries.length)} | ${String(bundleReading)} |`,
  );
  lines.push(
    `| **Alle Werkzeuge zusammen** | **${String(total + bundleEntries.length)}** | ` +
      `**${String(readTotal + bundleReading)}** |`,
  );
  return lines.join("\n");
}

/**
 * Die Tabelle der Bündelwerkzeuge (Abschnitt 11.1).
 *
 * Gezeigt wird, was jemand ohne Programmierkenntnisse wissen muss: wofür das Bündel da ist, ob
 * es dabei schreibt, und wie viele Aufrufe an die API es höchstens verbraucht. Welche Frage aus
 * dem Buchhaltungsalltag es beantwortet, steht in der Aufzählung unter der Tabelle; die ist von
 * Hand geschrieben, weil dieser Text im Register nicht steht.
 *
 * Die Spalte „Aufrufe höchstens" kommt aus `maxCalls` und nicht aus dem Beschreibungstext; eine
 * später angehobene Obergrenze wandert damit von selbst in die README.
 *
 * Die Reihenfolge ist die von `BUNDLE_ENTRIES` und damit die Registrierreihenfolge. Anders als
 * bei den Endpunktwerkzeugen wird hier **nicht** alphabetisch sortiert: Die Liste ist kurz,
 * und ihre Reihenfolge geht vom Sitzungsanfang (Stammdaten) zum Abschluss (Auswertung).
 */
function renderBundleTable(bundleEntries: readonly Bundle[]): string {
  const lines = [
    "| Werkzeug | Wirkung | Aufrufe höchstens | Wofür es da ist |",
    "| --- | --- | --- | --- |",
  ];
  for (const entry of bundleEntries) {
    lines.push(
      `| \`${cell(entry.name)}\` | ${EFFECT_LABELS[entry.effect]} | ` +
        `${String(entry.maxCalls)} | ${cell(firstSentence(entry.description))} |`,
    );
  }
  return lines.join("\n");
}

/** Die vollständige Werkzeugtabelle nach Bereichen. */
function renderToolTable(groups: ReadonlyMap<string, readonly Entry[]>): string {
  const blocks: string[] = [];
  for (const [area, bucket] of groups) {
    const lines = [`### ${area}`, "", "| Werkzeug | Wirkung | Was es tut |", "| --- | --- | --- |"];
    for (const entry of bucket) {
      lines.push(
        `| \`${cell(entry.name)}\` | ${EFFECT_LABELS[entry.effect]} | ` +
          `${cell(firstSentence(entry.description))} |`,
      );
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

// --- Einsetzen -------------------------------------------------------------------------

/**
 * Ersetzt den Inhalt zwischen zwei Markierungen. Fehlt eine Markierung, ist das ein Fehler:
 * Eine stillschweigend nicht eingesetzte Tabelle wäre eine README, die ihre Werkzeuge
 * verschweigt, und niemand merkte es.
 */
function replaceBlock(source: string, marker: string, content: string): string {
  const begin = `<!-- ${marker}:anfang -->`;
  const end = `<!-- ${marker}:ende -->`;
  const beginAt = source.indexOf(begin);
  const endAt = source.indexOf(end);
  if (beginAt < 0 || endAt < 0 || endAt < beginAt) {
    console.error(
      `${README}: Die Markierungen ${begin} und ${end} fehlen oder stehen in der falschen ` +
        "Reihenfolge. Die erzeugte Werkzeugtabelle gehört genau zwischen sie.",
    );
    process.exit(1);
  }
  return `${source.slice(0, beginAt + begin.length)}\n\n${content}\n\n${source.slice(endAt)}`;
}

const entries = [...registry.TOOL_ENTRIES].sort((a, b) => (a.name < b.name ? -1 : 1));

if (entries.length === 0) {
  // Vor den Registerpaketen gibt es keinen Eintrag. Eine leere Tabelle einzusetzen wäre
  // schlechter als nichts zu tun: Sie erzeugte eine Differenz im Diff, die keine Aussage hat.
  process.stderr.write("gen-tool-table: das Register ist leer; README.md bleibt unverändert.\n");
  process.exitCode = 0;
} else {
  const groups = groupByArea(entries);
  const unknown = groups.get(FALLBACK_AREA);
  if (unknown !== undefined) {
    process.stderr.write(
      `gen-tool-table: ohne Bereich und deshalb unter "${FALLBACK_AREA}": ` +
        `${unknown.map((entry) => entry.name).join(", ")}. ` +
        "Eine Zeile in AREA_BY_RESOURCE ordnet sie ein.\n",
    );
  }

  // Die Bündel sind kein Sonderfall, der ausfallen darf: Steht die Liste leer, fehlt entweder
  // der Import oder jemand hat sie geleert — beides gehört gemeldet und nicht in eine
  // stillschweigend leere Tabelle geschrieben.
  const bundleEntries = bundles.BUNDLE_ENTRIES;
  if (bundleEntries.length === 0) {
    console.error(
      `${BUNDLE_INDEX} führt kein einziges Bündelwerkzeug. Abschnitt 11.1 der README ` +
        "beschreibt sie; eine leere Tabelle dort wäre eine falsche Aussage.",
    );
    process.exit(1);
  }

  const readmePath = filePath(README);
  const current = readFileSync(readmePath, "utf8");
  let next = replaceBlock(
    current,
    "werkzeuge-bereiche",
    renderAreaTable(groups, entries.length, bundleEntries),
  );
  next = replaceBlock(next, "werkzeuge-tabelle", renderToolTable(groups));
  next = replaceBlock(next, "buendel-tabelle", renderBundleTable(bundleEntries));

  const counted = `${String(entries.length)} Endpunktwerkzeuge, ${String(bundleEntries.length)} Bündel`;
  if (current === next) {
    process.stderr.write(`${README}: Werkzeugtabellen sind aktuell (${counted}).\n`);
  } else {
    writeFileSync(readmePath, next, "utf8");
    process.stderr.write(`${README}: Werkzeugtabellen geschrieben (${counted}).\n`);
  }
  process.exitCode = 0;
}
