// Erzeugt src/generated/version.ts aus package.json (Plan 4.2).
//
// Warum überhaupt ein Generat: Zur Laufzeit soll der Server keine JSON-Datei lesen müssen.
// Ein `import … from "../../package.json"` wäre die naheliegende Alternative, würde aber
// unter NodeNext eine Import-Attribut-Zusicherung verlangen, die package.json in den Bau
// ziehen und den Pfad je nach Ausgabelayout verschieben. Eine erzeugte Konstante hat keinen
// dieser Nachteile und ist im Diff sichtbar, sobald die Version steigt.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_JSON = `${ROOT}package.json`;
const TARGET = `${ROOT}src/generated/version.ts`;

interface PackageJson {
  readonly name?: unknown;
  readonly version?: unknown;
}

function fail(message: string): never {
  process.stderr.write(`gen-version: ${message}\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as PackageJson;

const name = pkg.name;
const version = pkg.version;

// Beide Prüfungen sind der Grund, warum dieser Generator überhaupt eigene Zeilen hat:
// Ein stilles Scheitern würde eine Version "undefined" ausliefern, die niemandem auffällt.
if (typeof name !== "string" || name.length === 0) {
  fail("package.json führt kein nicht leeres Feld name.");
}
if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.test(version)) {
  fail(
    `package.json führt keine gültige semantische Version (gelesen: ${JSON.stringify(version)}).`,
  );
}

const output = `// ERZEUGT von scripts/gen-version.ts aus package.json. NICHT VON HAND ÄNDERN.
// Änderungen entstehen ausschließlich über \`pnpm generate\`; der CI-Schritt verlangt danach
// eine leere git-Differenz (Plan 4.2).
//
// Diese Datei ist der einzige Weg, auf dem die Paketversion zur Laufzeit bekannt wird.
// Es wird bewusst kein JSON gelesen und package.json nicht importiert.

/** Der Paketname aus package.json, wörtlich. */
export const PACKAGE_NAME = ${JSON.stringify(name)};

/** Die Paketversion aus package.json, wörtlich. */
export const VERSION = ${JSON.stringify(version)};

/** Name und Version in der Form, die der MCP-Server bei \`initialize\` meldet. */
export const SERVER_INFO = {
  name: PACKAGE_NAME,
  version: VERSION,
} as const;
`;

// Das Ausgabeverzeichnis kann fehlen — in einem frischen Klon ebenso wie nach einem
// Aufräumen von src/generated. Es wird deshalb vor dem Schreiben angelegt, statt den
// Generator mit ENOENT abbrechen zu lassen.
mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, output, "utf8");
process.stderr.write(`gen-version: src/generated/version.ts geschrieben (Version ${version}).\n`);
