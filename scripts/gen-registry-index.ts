// Erzeugt src/registry/index.generated.ts aus den Dateien in src/registry/tools/.
//
// Warum es diesen Generator gibt (Plan 4.2, 12 Streitfrage S15): Es gibt eine Datei je
// Werkzeug, und niemand soll beim Nachrüsten eines Werkzeugs eine Sammeldatei anfassen
// müssen. Erst dadurch können die fünf Registerpakete AP12a bis AP12e echt parallel laufen,
// ohne sich in dieselbe Datei zu schreiben.
//
// Die Ausgabe wird als einziges Generat NICHT eingecheckt; sie steht in .gitignore und wird
// vor build, test und typecheck neu erzeugt. Sie leitet sich allein aus dem Verzeichnisinhalt
// ab und trägt keine Information, die nicht schon versioniert wäre.
//
// Drei Zusagen, auf die sich die Arbeitspakete verlassen:
//   1. Gegen ein leeres oder fehlendes Verzeichnis läuft der Generator fehlerfrei durch.
//   2. Er ist mehrfach ausführbar ohne Nebenwirkung: Bei gleichem Inhalt wird nicht geschrieben.
//   3. Gleicher Verzeichnisinhalt ergibt zeichengleiche Ausgabe. Sortiert wird nach Dateiname
//      in Codepunktfolge, nicht über localeCompare, damit zwei Rechner nicht auseinanderlaufen.
//
// Node führt diese Datei direkt aus und entfernt die Typannotationen selbst; ab der in 13.1
// festgelegten Untergrenze >=22.19.0 braucht es dafür keinen TypeScript-Starter.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = join(root, "src", "registry", "tools");
const outFile = join(root, "src", "registry", "index.generated.ts");

// Dasselbe Namensschema wie in Plan 3.1 und P4. Der Generator prüft es nicht, um P4
// vorwegzunehmen, sondern weil der Dateiname als Bezeichner in die erzeugte Datei
// eingesetzt wird: Ein Name, der kein gültiger Bezeichner ist, erzeugte keinen Fehlschlag
// im Test, sondern eine Datei, die sich nicht übersetzen lässt.
const TOOL_NAME_PATTERN = /^bb_[a-z][a-z0-9_]{2,37}$/;
const MAX_TOOL_NAME_LENGTH = 40;

const errors: string[] = [];

/** Verzeichnisinhalt einlesen. Ein fehlendes Verzeichnis ist kein Fehler: Zum Zeitpunkt von
 *  AP04 gibt es noch keinen einzigen Registereintrag, und AP12a legt es mit der ersten Datei an. */
function readToolFiles(): string[] {
  let entries;
  try {
    entries = readdirSync(toolsDir, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `${toolsDir} gibt es noch nicht; der Registerindex wird leer erzeugt.\n`,
      );
      return [];
    }
    throw cause;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      process.stderr.write(
        `Übersprungen: ${entry.name} ist ein Verzeichnis. Registereinträge liegen flach in src/registry/tools/.\n`,
      );
      continue;
    }
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
      process.stderr.write(`Übersprungen: ${entry.name} ist keine .ts-Datei.\n`);
      continue;
    }
    files.push(entry.name);
  }

  // Codepunktfolge statt localeCompare: Die Sortierung muss auf jedem Rechner dieselbe sein.
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return files;
}

/**
 * „Dateiname gleich exportierter Name", geprüft in beiden Bedeutungen und rein lexikalisch,
 * also ohne das Modul zu laden. Ein Import würde die gesamte Schemaschicht und zod ausführen,
 * und der Generator läuft ausdrücklich VOR der Typprüfung; ein halbfertiger Registereintrag
 * dürfte den Lauf nicht mit einem Ladefehler abbrechen, der wie ein Generatorfehler aussieht.
 *
 * Die maßgebliche Prüfung ist und bleibt P12 (test/registry/file-layout.test.ts), die den
 * erzeugten Index gegen den Verzeichnisinhalt hält und dabei die echten Objekte sieht.
 */
function checkFile(fileName: string, toolName: string): void {
  const source = readFileSync(join(toolsDir, fileName), "utf8");

  const bindingPattern = new RegExp(`^export const ${toolName}\\b`, "m");
  if (!bindingPattern.test(source)) {
    errors.push(
      `${fileName}: exportiert kein "export const ${toolName}". Der exportierte Bezeichner muss dem Dateinamen ohne .ts entsprechen; ein default-Export genügt nicht.`,
    );
  }

  const namePattern = new RegExp(`(^|[\\s{,])name\\s*:\\s*["']${toolName}["']`, "m");
  if (!namePattern.test(source)) {
    errors.push(
      `${fileName}: enthält kein Feld name: "${toolName}". Dateiname und das Feld name des Eintrags müssen übereinstimmen (Plan 2.1, P12).`,
    );
  }
}

function render(toolNames: readonly string[]): string {
  const lines: string[] = [
    "// Erzeugt von scripts/gen-registry-index.ts. Nicht von Hand ändern.",
    "//",
    "// Diese Datei wird nicht eingecheckt (Plan 4.2). Sie steht in .gitignore und entsteht vor",
    "// build, test und typecheck neu aus dem Inhalt von src/registry/tools/.",
    "",
    'import type { ToolEntry } from "./types.js";',
  ];

  for (const toolName of toolNames) {
    lines.push(`import { ${toolName} } from "./tools/${toolName}.js";`);
  }

  lines.push("");
  if (toolNames.length === 0) {
    lines.push("export const TOOL_ENTRIES: readonly ToolEntry[] = [];");
  } else {
    lines.push("export const TOOL_ENTRIES: readonly ToolEntry[] = [");
    for (const toolName of toolNames) {
      lines.push(`  ${toolName},`);
    }
    lines.push("];");
  }

  lines.push(
    "",
    "/** Nachschlagen nach Werkzeugname. */",
    "export const TOOL_BY_NAME: ReadonlyMap<string, ToolEntry> = new Map(",
    "  TOOL_ENTRIES.map((entry): [string, ToolEntry] => [entry.name, entry]),",
    ");",
    "",
    "/** Nachschlagen nach dem unveränderten Spezifikationspfad. Bei den vier Endpunkten mit",
    " *  Pfadvorlage ist das specPath und nicht der gebaute Pfad (Plan 4.6). */",
    "export const TOOL_BY_SPEC_PATH: ReadonlyMap<string, ToolEntry> = new Map(",
    "  TOOL_ENTRIES.map((entry): [string, ToolEntry] => [",
    '    "literal" in entry.path ? entry.path.literal : entry.path.specPath,',
    "    entry,",
    "  ]),",
    ");",
    "",
  );

  return lines.join("\n");
}

const files = readToolFiles();
const toolNames: string[] = [];

for (const fileName of files) {
  const toolName = fileName.slice(0, -".ts".length);

  if (!TOOL_NAME_PATTERN.test(toolName) || toolName.length > MAX_TOOL_NAME_LENGTH) {
    errors.push(
      `${fileName}: "${toolName}" erfüllt das Namensschema ^bb_[a-z][a-z0-9_]{2,37}$ mit höchstens ${String(MAX_TOOL_NAME_LENGTH)} Zeichen nicht (Plan 3.1).`,
    );
    continue;
  }

  checkFile(fileName, toolName);
  toolNames.push(toolName);
}

if (errors.length > 0) {
  for (const message of errors) {
    process.stderr.write(`${message}\n`);
  }
  process.stderr.write(
    `${String(errors.length)} Beanstandung(en); src/registry/index.generated.ts wurde nicht geschrieben.\n`,
  );
  process.exitCode = 1;
} else {
  const next = render(toolNames);

  let current: string | undefined;
  try {
    current = readFileSync(outFile, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      throw cause;
    }
  }

  if (current === next) {
    process.stderr.write(
      `src/registry/index.generated.ts ist aktuell (${String(toolNames.length)} Werkzeuge).\n`,
    );
  } else {
    writeFileSync(outFile, next, "utf8");
    process.stderr.write(
      `src/registry/index.generated.ts geschrieben (${String(toolNames.length)} Werkzeuge).\n`,
    );
  }
  process.exitCode = 0;
}
