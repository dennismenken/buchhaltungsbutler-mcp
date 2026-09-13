// Baut das `.mcpb`-Bundle für Claude Desktop: `pnpm build-mcpb`.
//
// **Dieses Skript veröffentlicht nichts.** Es erzeugt eine Datei im Projektverzeichnis und
// setzt keinen einzigen Netzwerkaufruf ab. Weder `npm publish` noch `git tag` noch `git push`
// kommen hier vor; beide unumkehrbaren Schritte führt der Projektinhaber selbst aus.
//
// **Das Verpackungswerkzeug wird ausschließlich aus `node_modules` aufgerufen, niemals über
// `npx`**. Der Grund ist ein Befund und keine Vorliebe: Das Bundle-Werkzeug heißt
// `@anthropic-ai/mcpb` und liefert ein `bin` namens `mcpb`. Der **unscoped** Name `mcpb`
// existiert auf npm am 2026-09-12 nicht (`npm view mcpb` → HTTP 404). `npx mcpb` bräche heute
// also ab — und führte, sobald jemand den freien Namen registriert, in einem
// Veröffentlichungsjob fremden Code aus, dessen Herkunft dieses Projekt nicht kontrolliert.
// Der Name ist unbesetzt und damit besetzbar. Aufgerufen wird deshalb die Datei, die der
// Auflöser unter dem gescopten Namen findet, und nur sie.
//
// **Die Werkzeugliste des Manifests wird aus dem Register erzeugt und nie von Hand gepflegt**.
// Die Vorlage `.mcpb/manifest.template.json` trägt dafür eine leere Liste und
// eine Platzhalterversion; dieses Skript setzt beides ein und bricht ab, wenn die Vorlage die
// Platzhalter nicht mehr trägt. `test/contract/mcpb-tools.test.ts` prüft das Ergebnis
// anschließend gegen das Register.
//
// **Die Liste führt beide Werkzeugmengen: die 54 Endpunktwerkzeuge und die 5 Bündelwerkzeuge**
// Die 54 bleiben neben den Bündeln unverändert bestehen. Das Manifest trägt
// `tools_generated: false` und behauptet damit eine vollständige
// Liste; führte sie nur `TOOL_ENTRIES`, läse der Nutzer im Installationsdialog von Claude
// Desktop 54 Werkzeuge, während der Server 59 anmeldet. Registriert werden beide Mengen in
// `src/server/create-server.ts`, und `dist/index.js` führt beide aus.
//
// Aufruf:
//
//   node scripts/build-mcpb.ts [--out <datei>] [--keep-staging]
//
//   --out <datei>     Zielpfad des Bundles. Vorgabe: <wurzel>/bbutler-mcp-<version>.mcpb
//   --keep-staging    das Aufbauverzeichnis stehen lassen, statt es zu löschen. Für die
//                     Fehlersuche an einem Bundle, das sich nicht installieren lässt.
//   --help            diese Übersicht.
//
// Node führt diese Datei direkt aus und entfernt die Typannotationen selbst.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMPLATE_FILE = join(ROOT, ".mcpb", "manifest.template.json");

/** Der Platzhalter, den die Vorlage im Feld `version` trägt (siehe Dateikopf). */
const VERSION_PLACEHOLDER = "0.0.0-vorlage";

/** Der Bundle-Name aus der Vorlage. Er benennt auch die erzeugte Datei. */
const BUNDLE_FILE_PREFIX = "bbutler-mcp";

// ---------------------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------------------

/** Ein Eintrag der Werkzeugliste des Manifests. Mehr Felder lässt das Schema nicht zu. */
export interface ManifestTool {
  readonly name: string;
  readonly description: string;
}

/** So viel eines Registereintrags braucht die Werkzeugliste. */
export interface ToolListSource {
  readonly name: string;
  readonly description: string;
}

/** Das Manifest als lose Abbildung. Verbindlich ist das Schema von `@anthropic-ai/mcpb`. */
export type Manifest = Record<string, unknown>;

// ---------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------

/**
 * Liest `.mcpb/manifest.template.json` und prüft, dass die Vorlage noch Vorlage ist.
 *
 * Die beiden Platzhalter sind der ganze Schutz dieser Datei: Wer die Werkzeugliste von Hand
 * einträgt, hat eine zweite Quelle geschaffen, die zwangsläufig von den Registerdateien und
 * dem Bündelverzeichnis abdriftet. Ein Abbruch hier ist billiger als ein Bundle, dessen Liste
 * nicht stimmt.
 */
export function readManifestTemplate(file: string = TEMPLATE_FILE): Manifest {
  const raw = readFileSync(file, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} enthält kein JSON-Objekt.`);
  }
  const template = parsed as Manifest;

  if (template["version"] !== VERSION_PLACEHOLDER) {
    throw new Error(
      `${file}: Das Feld version muss den Platzhalter ${VERSION_PLACEHOLDER} tragen. ` +
        "Die Version wird beim Bau aus package.json eingesetzt und nicht in der Vorlage gepflegt.",
    );
  }

  const tools = template["tools"];
  if (!Array.isArray(tools) || tools.length > 0) {
    throw new Error(
      `${file}: Das Feld tools muss eine leere Liste sein. Die Werkzeugliste wird aus dem ` +
        "Register erzeugt; eine von Hand gepflegte Liste wäre eine zweite Quelle.",
    );
  }

  return template;
}

/**
 * Erzeugt die Werkzeugliste des Manifests aus dem Register.
 *
 * Übernommen werden `name` und `description` unverändert. Gekürzt wird nichts: Was der Nutzer
 * vor der Installation liest, ist derselbe Text, den der Agent nach der Installation sieht
 * (Vollständigkeit vor Bequemlichkeit). Sortiert wird nach Name in Codepunktfolge, damit
 * zwei Bauläufe zeichengleiche Manifeste ergeben.
 */
export function buildToolList(entries: readonly ToolListSource[]): ManifestTool[] {
  const seenNames = new Set<string>();
  for (const entry of entries) {
    if (seenNames.has(entry.name)) {
      throw new Error(`Das Register führt ${entry.name} zweimal.`);
    }
    seenNames.add(entry.name);
  }

  return entries
    .map((entry) => ({ name: entry.name, description: entry.description }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Setzt Version und Werkzeugliste in die Vorlage ein. Alles Übrige bleibt unangetastet. */
export function renderManifest(
  template: Manifest,
  version: string,
  tools: readonly ManifestTool[],
): Manifest {
  return { ...template, version, tools: [...tools] };
}

// ---------------------------------------------------------------------------------------
// Laufzeitabhängigkeiten
// ---------------------------------------------------------------------------------------

/**
 * Findet das Verzeichnis eines Pakets, indem sie von `fromDir` aus die `node_modules`-Kette
 * nach oben geht — also genau so, wie Node selbst auflöst.
 *
 * Warum nicht `require.resolve`: Ein Paket mit `exports`-Feld muss `./package.json` nicht
 * freigeben, und `@modelcontextprotocol/server@2.0.0` tut es nicht. Über den Verzeichnisweg
 * ist das Paketverzeichnis unabhängig von der Exportkarte zu finden, und der Weg funktioniert
 * sowohl bei der verschachtelten Ablage von pnpm als auch bei der flachen von npm.
 */
function findPackageDir(name: string, fromDir: string): string {
  let current = fromDir;
  for (;;) {
    const candidate = join(current, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Die Laufzeitabhängigkeit ${name} ist von ${fromDir} aus nicht auflösbar. ` +
          "Zuerst pnpm install --frozen-lockfile ausführen.",
      );
    }
    current = parent;
  }
}

/**
 * Sammelt die Laufzeitabhängigkeiten samt ihrer eigenen Abhängigkeiten.
 *
 * Das Bundle wird ohne Installationsschritt ausgeführt: Claude Desktop startet `node` auf den
 * mitgelieferten Dateien und ruft kein `npm install` auf. Alles, was `dist/` importiert, muss
 * deshalb im Bundle liegen. Verfolgt wird ausschließlich das Feld `dependencies`; keines der
 * vier beteiligten Pakete führt am 2026-09-13 `optionalDependencies` oder
 * `peerDependencies` (`@modelcontextprotocol/server`, `@modelcontextprotocol/core`, `undici`,
 * `zod` — nachgesehen in node_modules).
 *
 * Zwei Fassungen desselben Namens sind ein Abbruch und keine stille Auswahl: Die Ablage im
 * Bundle ist flach, und eine stillschweigend gewählte Fassung wäre genau der Fehler, den
 * niemand im Bundle sucht.
 */
export function collectRuntimePackages(
  dependencyNames: readonly string[],
  fromDir: string = ROOT,
): Map<string, string> {
  const found = new Map<string, string>();
  const pending: { name: string; from: string }[] = dependencyNames.map((name) => ({
    name,
    from: fromDir,
  }));

  for (;;) {
    const item = pending.pop();
    if (item === undefined) {
      break;
    }

    const directory = findPackageDir(item.name, item.from);
    const existing = found.get(item.name);
    if (existing !== undefined) {
      if (existing !== directory) {
        throw new Error(
          `${item.name} liegt in zwei Fassungen vor:\n  ${existing}\n  ${directory}\n` +
            "Ein Bundle legt die Pakete flach ab; eine der beiden Fassungen ginge verloren.",
        );
      }
      continue;
    }
    found.set(item.name, directory);

    const manifest = readJsonObject(join(directory, "package.json"));
    const deps = manifest["dependencies"];
    if (typeof deps === "object" && deps !== null && !Array.isArray(deps)) {
      for (const name of Object.keys(deps)) {
        pending.push({ name, from: directory });
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------------------------
// Hilfsmittel
// ---------------------------------------------------------------------------------------

function readJsonObject(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} enthält kein JSON-Objekt.`);
  }
  return parsed as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string, file: string): string {
  const value = source[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${file}: Das Feld ${key} fehlt oder ist keine nicht-leere Zeichenkette.`);
  }
  return value;
}

/** Menschenlesbare Größe. Nur für das Protokoll; gerechnet wird mit der Bytezahl. */
function formatBytes(bytes: number): string {
  const mib = bytes / 1_048_576;
  return `${bytes.toLocaleString("de-DE")} Bytes (${mib.toFixed(2)} MiB)`;
}

/**
 * Der Pfad zur `bin`-Datei von `@anthropic-ai/mcpb` im eigenen `node_modules`.
 *
 * Aufgelöst wird über den Haupteinstieg (`exports` gibt `.` frei), von dort geht es ein
 * Verzeichnis nach oben zur `package.json` des Pakets, und deren Feld `bin` nennt die Datei.
 * Ein fest verdrahteter Pfad wäre bei einer neuen Fassung des Werkzeugs still falsch.
 */
export function resolveMcpbCli(): string {
  const require_ = createRequire(join(ROOT, "scripts", "build-mcpb.ts"));

  let entryPoint: string;
  try {
    entryPoint = require_.resolve("@anthropic-ai/mcpb");
  } catch {
    throw new Error(
      "@anthropic-ai/mcpb liegt nicht in node_modules. Das Bundle wird ausschließlich mit dem " +
        "installierten Werkzeug gebaut, nie über npx. Zuerst " +
        "pnpm install --frozen-lockfile ausführen.",
    );
  }

  const packageRoot = resolve(dirname(entryPoint), "..");
  const mcpbPackageJson = readJsonObject(join(packageRoot, "package.json"));
  const bin = mcpbPackageJson["bin"];
  const relativeBinPath =
    typeof bin === "string"
      ? bin
      : typeof bin === "object" &&
          bin !== null &&
          typeof (bin as Record<string, unknown>)["mcpb"] === "string"
        ? ((bin as Record<string, unknown>)["mcpb"] as string)
        : undefined;

  if (relativeBinPath === undefined) {
    throw new Error(`${packageRoot}/package.json nennt kein bin. Das Werkzeug ist unbrauchbar.`);
  }

  const binFile = join(packageRoot, relativeBinPath);
  if (!existsSync(binFile)) {
    throw new Error(`${binFile} fehlt. Das installierte @anthropic-ai/mcpb ist unvollständig.`);
  }
  return binFile;
}

/**
 * Ruft das Bundle-Werkzeug auf. Immer über `process.execPath`, also dieselbe Node-Fassung, die
 * diesen Lauf ausführt — und ohne Shell, damit kein Pfad interpretiert wird.
 */
function runMcpb(cli: string, args: readonly string[]): void {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit" });
  if (result.error !== undefined) {
    throw new Error(`mcpb ${args[0] ?? ""} ließ sich nicht ausführen: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`mcpb ${args[0] ?? ""} endete mit Rückgabewert ${String(result.status)}.`);
  }
}

// ---------------------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------------------

interface Options {
  readonly out: string | undefined;
  readonly keepStaging: boolean;
  readonly help: boolean;
}

export function parseArgs(argv: readonly string[]): Options {
  let out: string | undefined;
  let keepStaging = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--keep-staging") {
      keepStaging = true;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error("--out erwartet einen Dateipfad.");
      }
      out = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unbekannte Option ${String(arg)}. --help nennt die zulässigen Optionen.`);
    }
  }

  return { out, keepStaging, help };
}

const HELP_TEXT = `Baut das .mcpb-Bundle für Claude Desktop.

  node scripts/build-mcpb.ts [--out <datei>] [--keep-staging]

  --out <datei>     Zielpfad des Bundles. Vorgabe: <wurzel>/${BUNDLE_FILE_PREFIX}-<version>.mcpb
  --keep-staging    das Aufbauverzeichnis stehen lassen, statt es zu löschen.
  --help            diese Übersicht.

Dieses Skript veröffentlicht nichts und setzt keinen Netzwerkaufruf ab.`;

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  // Ohne Bau gäbe es nichts zu verpacken, und ein leeres Bundle fiele erst beim Nutzer auf.
  const cliEntryFile = join(ROOT, "dist", "cli.js");
  if (!existsSync(cliEntryFile)) {
    console.error(
      "dist/cli.js fehlt. Das Bundle enthält den gebauten Server; ohne Bau wäre es leer. " +
        "Zuerst pnpm build ausführen, dann pnpm build-mcpb.",
    );
    return 1;
  }

  const packageJson = readJsonObject(join(ROOT, "package.json"));
  const version = readString(packageJson, "version", "package.json");

  // Das Register kommt aus dem Bau und nicht aus src/: Genau dieser Stand wird verpackt.
  // Weicht die eingebaute Version von package.json ab, ist dist/ veraltet — und ein Manifest
  // aus einem veralteten Register wäre eine Behauptung über Werkzeuge, die so nicht ausgeliefert
  // werden.
  const builtModule = (await import(pathToFileURL(join(ROOT, "dist", "index.js")).href)) as {
    TOOL_ENTRIES?: readonly ToolListSource[];
    BUNDLE_ENTRIES?: readonly ToolListSource[];
    VERSION?: string;
  };
  const entries = builtModule.TOOL_ENTRIES;
  if (entries === undefined) {
    throw new Error("dist/index.js exportiert kein TOOL_ENTRIES. Der Bau ist unvollständig.");
  }
  const bundleEntries = builtModule.BUNDLE_ENTRIES;
  if (bundleEntries === undefined) {
    throw new Error("dist/index.js exportiert kein BUNDLE_ENTRIES. Der Bau ist unvollständig.");
  }
  if (builtModule.VERSION !== version) {
    throw new Error(
      `dist/ trägt die Version ${String(builtModule.VERSION)}, package.json nennt ${version}. ` +
        "Der Bau ist veraltet; zuerst pnpm build ausführen.",
    );
  }

  const manifest = renderManifest(
    readManifestTemplate(),
    version,
    buildToolList([...entries, ...bundleEntries]),
  );

  const outputPath = options.out ?? join(ROOT, `${BUNDLE_FILE_PREFIX}-${version}.mcpb`);
  const staging = mkdtempSync(join(tmpdir(), "bbutler-mcpb-"));

  try {
    // 1. Manifest.
    writeFileSync(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    // 2. Beipackzettel. Beides liegt dem Bundle bei, damit Herkunft und Lizenz auch dann
    //    lesbar sind, wenn jemand die Datei ohne Repository weiterreicht.
    for (const file of ["LICENSE", "README.md", "NOTICE.md"]) {
      cpSync(join(ROOT, file), join(staging, file));
    }

    // 3. Der gebaute Server. Die package.json des Bundles ist eine eigene, kleine Datei:
    //    "type": "module" muss neben dist/ stehen, sonst liest Node die .js-Dateien als
    //    CommonJS. "private": true schließt aus, dass aus dem Aufbauverzeichnis je etwas
    //    veröffentlicht wird.
    const serverDir = join(staging, "server");
    mkdirSync(serverDir, { recursive: true });
    const runtimeDependencies = packageJson["dependencies"];
    writeFileSync(
      join(serverDir, "package.json"),
      `${JSON.stringify(
        {
          name: readString(packageJson, "name", "package.json"),
          version,
          private: true,
          type: "module",
          dependencies: runtimeDependencies ?? {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    cpSync(join(ROOT, "dist"), join(serverDir, "dist"), { recursive: true });

    // 4. Die Laufzeitabhängigkeiten. `dereference` löst die Symlinks von pnpm auf; ein ZIP
    //    mit Symlinks auf Pfade dieses Rechners wäre auf jedem anderen Rechner leer.
    const dependencyNames =
      typeof runtimeDependencies === "object" &&
      runtimeDependencies !== null &&
      !Array.isArray(runtimeDependencies)
        ? Object.keys(runtimeDependencies)
        : [];
    if (dependencyNames.length === 0) {
      throw new Error("package.json führt keine dependencies. Das Bundle wäre nicht lauffähig.");
    }
    const packages = collectRuntimePackages(dependencyNames);
    for (const [name, source] of packages) {
      const destination = join(serverDir, "node_modules", ...name.split("/"));
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(source, destination, { recursive: true, dereference: true });
    }
    console.log(
      `Laufzeitabhängigkeiten im Bundle: ${[...packages.keys()].sort().join(", ")} ` +
        `(${String(packages.size)} Pakete).`,
    );

    // 5. Prüfen und packen, in dieser Reihenfolge: Ein Manifest, das das Schema verletzt,
    //    soll gar nicht erst in ein Archiv geraten.
    const cli = resolveMcpbCli();
    runMcpb(cli, ["validate", join(staging, "manifest.json")]);
    rmSync(outputPath, { force: true });
    runMcpb(cli, ["pack", staging, outputPath]);
  } finally {
    if (options.keepStaging) {
      console.log(`Aufbauverzeichnis bleibt stehen: ${staging}`);
    } else {
      rmSync(staging, { recursive: true, force: true });
    }
  }

  if (!existsSync(outputPath)) {
    throw new Error(`mcpb pack meldete Erfolg, aber ${outputPath} gibt es nicht.`);
  }

  console.log("");
  console.log(`Bundle: ${outputPath}`);
  console.log(`Größe:  ${formatBytes(statSync(outputPath).size)}`);
  console.log(`Werkzeuge im Manifest: ${String((manifest["tools"] as ManifestTool[]).length)}`);
  console.log("");
  console.log(
    "Es wurde nichts veröffentlicht. Die Datei liegt lokal; der Veröffentlichungsweg steht in " +
      "docs/entwicklung/veroeffentlichungs-checkliste.md.",
  );
  return 0;
}

/**
 * Ausgeführt wird nur beim direkten Aufruf. Ein Import aus dem Test baut kein Bundle, legt
 * kein Verzeichnis an und startet keinen Unterprozess.
 */
const invokedScriptPath = process.argv[1];
if (invokedScriptPath !== undefined && import.meta.url === pathToFileURL(invokedScriptPath).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
