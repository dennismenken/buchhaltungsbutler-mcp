// Das Größenbudget des Pakets: `pnpm check-size`.
//
// Geprüft werden **zwei** Zahlen gegen **zwei** feste Obergrenzen, und beide stammen aus
// **einem** Aufruf von `npm pack --json`: `size` (das gepackte Tarball) und `unpackedSize`
// (der entpackte Inhalt). Derselbe Aufruf liefert unter `files[]` je Datei `path` und `size`;
// die Liste der größten Dateien braucht deshalb kein zweites Werkzeug und keine zusätzliche
// Abhängigkeit.
//
// **Dieses Skript veröffentlicht nichts.** `npm pack` packt ausschließlich lokal, und der
// Aufruf läuft hier zusätzlich mit `--dry-run`: npm misst, schreibt aber kein Archiv in das
// Arbeitsverzeichnis. Ein veröffentlichender Befehl kommt in dieser Datei nicht vor.
//
// **Was bei Überschreitung geschieht, steht und ist nicht verhandelbar:**
// Rückgabewert 1, beide gemessenen Zahlen, beide Grenzen und die zehn größten Dateien im
// Protokoll. Zuerst wird die Ursache gesucht (Dateiliste, größte Dateien, Bündelergebnis);
// **die Grenze anzuheben ist kein Schritt, den ein Implementierungs-Agent geht** — sie ist
// eine Zahl des Projektinhabers und braucht einen Eintrag in `CHANGELOG.md`.
//
// Node führt diese Datei direkt aus und entfernt die Typannotationen selbst.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Obergrenze des gepackten Tarballs: 1 MiB. */
const MAX_PACKED_BYTES = 1_048_576;

/** Obergrenze des entpackten Inhalts: 3 MiB. */
const MAX_UNPACKED_BYTES = 3_145_728;

/** So viele der größten Dateien nennt das Protokoll. */
const LARGEST_FILES_COUNT = 10;

/** Eine Datei des Tarballs, wie `npm pack --json` sie meldet. */
interface PackedFile {
  readonly path: string;
  readonly size: number;
}

/** Das Messergebnis eines Packlaufs. */
interface PackMeasurement {
  readonly size: number;
  readonly unpackedSize: number;
  readonly files: readonly PackedFile[];
}

/**
 * Die JSON-Ausgabe von `npm pack --json` aus der Standardausgabe herausschneiden.
 *
 * npm schreibt Hinweiszeilen nach stderr, hat sich dabei aber über die Hauptversionen hinweg
 * nicht immer gleich verhalten. Die Ausgabe wird deshalb nicht blind zerlegt, sondern ab der
 * ersten eckigen Klammer bis zur letzten gelesen. Kommt dabei nichts Verwertbares heraus, ist
 * das ein Fehlschlag mit einer Meldung, die den Rohtext nennt — und kein stillschweigendes 0.
 */
function extractPackJson(stdout: string): unknown {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "npm pack --json hat keine JSON-Liste geliefert. Ausgabe war:\n" +
        (stdout.trim() === "" ? "(leer)" : stdout.trim()),
    );
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

/** Das Messergebnis aus der zerlegten JSON-Ausgabe lesen. */
function toMeasurement(parsed: unknown): PackMeasurement {
  const first = Array.isArray(parsed)
    ? (parsed[0] as Record<string, unknown> | undefined)
    : undefined;
  if (first === undefined) {
    throw new Error("npm pack --json hat eine leere Liste geliefert; es wurde nichts gemessen.");
  }
  const size = first.size;
  const unpackedSize = first.unpackedSize;
  if (typeof size !== "number" || typeof unpackedSize !== "number") {
    throw new Error(
      "npm pack --json hat size oder unpackedSize nicht als Zahl geliefert. " +
        `Gelesen wurde: size=${String(size)}, unpackedSize=${String(unpackedSize)}.`,
    );
  }
  const rawFiles = Array.isArray(first.files) ? first.files : [];
  const files: PackedFile[] = [];
  for (const raw of rawFiles) {
    const file = raw as Record<string, unknown>;
    if (typeof file.path === "string" && typeof file.size === "number") {
      files.push({ path: file.path, size: file.size });
    }
  }
  return { size, unpackedSize, files };
}

/** Die größten Dateien zuerst. Bei gleicher Größe entscheidet der Pfad, damit die Liste stabil ist. */
function largestFiles(
  files: readonly PackedFile[],
  count: number = LARGEST_FILES_COUNT,
): readonly PackedFile[] {
  return [...files]
    .sort((a, b) => (b.size - a.size !== 0 ? b.size - a.size : a.path < b.path ? -1 : 1))
    .slice(0, count);
}

/** Eine Bytezahl mit Tausenderpunkten und der Größenordnung dahinter. */
function formatBytes(bytes: number): string {
  const grouped = bytes.toLocaleString("de-DE");
  const kib = bytes / 1024;
  const readable = kib < 1024 ? `${kib.toFixed(1)} KiB` : `${(kib / 1024).toFixed(2)} MiB`;
  return `${grouped} Bytes (${readable})`;
}

/** Der Anteil an der Obergrenze, auf eine Nachkommastelle. */
function share(value: number, limit: number): string {
  return `${((value / limit) * 100).toFixed(1)} Prozent der Grenze`;
}

/**
 * Der Bericht. Er nennt **immer** beide Zahlen, beide Grenzen und die zehn größten Dateien —
 * auch im grünen Fall, denn die Zahlen sollen über die Versionen hinweg verfolgbar
 * bleiben und nicht erst dann sichtbar werden, wenn das Budget schon gerissen ist.
 */
function buildReport(measurement: PackMeasurement): {
  readonly lines: readonly string[];
  readonly exceeded: boolean;
} {
  const packedExceeded = measurement.size > MAX_PACKED_BYTES;
  const unpackedExceeded = measurement.unpackedSize > MAX_UNPACKED_BYTES;
  const exceeded = packedExceeded || unpackedExceeded;

  const lines: string[] = [
    "Größenbudget des Pakets, gemessen mit npm pack --json:",
    "",
    `  gepackt   ${formatBytes(measurement.size)}` +
      `  Grenze ${formatBytes(MAX_PACKED_BYTES)}` +
      `  ${share(measurement.size, MAX_PACKED_BYTES)}` +
      `  ${packedExceeded ? "ÜBERSCHRITTEN" : "eingehalten"}`,
    `  entpackt  ${formatBytes(measurement.unpackedSize)}` +
      `  Grenze ${formatBytes(MAX_UNPACKED_BYTES)}` +
      `  ${share(measurement.unpackedSize, MAX_UNPACKED_BYTES)}` +
      `  ${unpackedExceeded ? "ÜBERSCHRITTEN" : "eingehalten"}`,
    "",
    `Die ${String(LARGEST_FILES_COUNT)} größten Dateien des Tarballs ` +
      `(von ${String(measurement.files.length)} insgesamt):`,
  ];

  const largest = largestFiles(measurement.files);
  if (largest.length === 0) {
    lines.push("  (npm pack hat keine Dateiliste geliefert)");
  } else {
    largest.forEach((file, index) => {
      lines.push(
        `  ${String(index + 1).padStart(2, " ")}. ${formatBytes(file.size)}  ${file.path}`,
      );
    });
  }

  if (exceeded) {
    lines.push(
      "",
      "Das Budget ist gerissen. Die Reihenfolge unten gilt, und sie beginnt nicht bei der Grenze:",
      "  1. Dateiliste gegen den Paketprobelauf halten: kein src, kein test,",
      "     kein docs, keine .env, keine Karte außer den Sourcemaps.",
      "  2. Die zehn größten Dateien oben lesen. Eine Spezifikations- oder Generatdatei in dist",
      "     ist der häufigste Fall.",
      "  3. Das Bündelergebnis prüfen: eine Laufzeitabhängigkeit, die der Bündler in dist",
      "     einrechnet, statt sie als dependency zu belassen, lässt die Dateiliste unverändert.",
      "Die Grenze anzuheben ist kein Schritt dieses Laufs. Sie ist eine Zahl des Projektinhabers",
      "und braucht seine Entscheidung sowie einen Eintrag in CHANGELOG.md, der Zahl und Grund nennt.",
    );
  }

  return { lines, exceeded };
}

/** Misst das Paket. Ausgelagert, damit der Ablauf unten nur noch entscheidet und ausgibt. */
function measurePackage(): PackMeasurement {
  const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
    cwd: ROOT,
    encoding: "utf8",
    // Windows löst npm über die Shell auf; ohne diesen Schalter scheitert der Aufruf dort.
    shell: process.platform === "win32",
  });

  if (result.error !== undefined) {
    throw new Error(`npm pack ließ sich nicht ausführen: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `npm pack endete mit Rückgabewert ${String(result.status)}.\n${result.stderr.trim()}`,
    );
  }
  return toMeasurement(extractPackJson(result.stdout));
}

// --- Ablauf ---------------------------------------------------------------------------

// Ohne Bau misst dieser Lauf ein Paket ohne Inhalt und meldete ein eingehaltenes Budget.
// Ein grüner Lauf, der nichts gemessen hat, ist schlimmer als ein roter.
if (!existsSync(`${ROOT}dist/cli.js`)) {
  console.error(
    "dist/cli.js fehlt. Das Größenbudget misst das gebaute Paket; ohne Bau wäre die Messung " +
      "wertlos. Zuerst pnpm build ausführen, dann pnpm check-size.",
  );
  process.exit(1);
}

let measurement: PackMeasurement;
try {
  measurement = measurePackage();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const report = buildReport(measurement);
console.log(report.lines.join("\n"));
process.exit(report.exceeded ? 1 : 0);
