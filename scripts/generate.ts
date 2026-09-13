// Ruft alle Untergeneratoren des Projekts auf.
//
// Die Liste der Untergeneratoren ist NICHT fest verdrahtet, sondern eine Verzeichnisabfrage:
// Gelesen wird scripts/, genommen wird jede Datei nach dem Muster gen-*.ts, aufgerufen wird
// in alphabetischer Reihenfolge. Grund ist die Arbeitsteilung: Die Untergeneratoren entstehen
// und ändern sich unabhängig voneinander. Eine verdrahtete Liste zwänge jeden Beitrag an einem
// Untergenerator, zusätzlich diese Datei anzufassen, und erzeugte genau den
// Zusammenführungskonflikt, den die Verzeichnisabfrage vermeidet.
//
// Fehlt jeder Untergenerator, endet dieses Skript trotzdem mit Rückgabewert 0. Das ist die
// Platzhalterregel und notwendig, weil build, test und typecheck `pnpm generate`
// als ersten Schritt aufrufen: Ohne Untergenerator gibt es nichts zu erzeugen, und das ist
// kein Fehler.
//
// Scheitert dagegen ein vorhandener Untergenerator, scheitert auch dieses Skript. Ein
// halb erzeugtes Generat, das unbemerkt durchläuft, wäre der schlimmere Ausgang.
//
// Node führt diese Datei direkt aus und entfernt die Typannotationen selbst; ab der
// festgelegten Untergrenze >=22.19.0 braucht es dafür keinen TypeScript-Starter.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));

// generate.ts selbst passt nicht auf das Muster: Es verlangt den Bindestrich nach „gen".
const SUBGENERATOR = /^gen-[A-Za-z0-9-]+\.ts$/;

function listSubgenerators(): string[] {
  const entries = readdirSync(SCRIPTS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SUBGENERATOR.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const subgenerators = listSubgenerators();

if (subgenerators.length === 0) {
  process.stderr.write(
    "generate: kein Untergenerator unter scripts/gen-*.ts gefunden; es ist nichts zu erzeugen.\n",
  );
  process.exitCode = 0;
} else {
  let failed = 0;
  for (const name of subgenerators) {
    // Jeder Untergenerator läuft als eigener Prozess. Das trennt die Rückgabewerte sauber
    // und hält die Generatoren voneinander unabhängig; ein Import würde sie in denselben
    // Modulgraphen zwingen.
    const result = spawnSync(process.execPath, [`${SCRIPTS_DIR}${name}`], {
      stdio: "inherit",
      encoding: "utf8",
    });
    if (result.error !== undefined) {
      // Verschwindet eine Datei zwischen Auflistung und Aufruf, wird sie übersprungen und
      // nicht zum Abbruch erhoben.
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        process.stderr.write(`generate: ${name} ist nicht mehr vorhanden, übersprungen.\n`);
        continue;
      }
      process.stderr.write(
        `generate: ${name} konnte nicht gestartet werden (${result.error.message}).\n`,
      );
      failed += 1;
      continue;
    }
    if (result.status !== 0) {
      process.stderr.write(
        `generate: ${name} endete mit Rückgabewert ${String(result.status)}${
          result.signal === null ? "" : ` (Signal ${result.signal})`
        }.\n`,
      );
      failed += 1;
    }
  }
  if (failed > 0) {
    process.stderr.write(
      `generate: ${failed} von ${subgenerators.length} Generatoren scheiterten.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stderr.write(`generate: ${subgenerators.length} Generatoren durchgelaufen.\n`);
    process.exitCode = 0;
  }
}
