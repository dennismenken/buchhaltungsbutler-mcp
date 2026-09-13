import { chmod, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

// Bauplan des Pakets. Erzeugt dist/cli.js (bin-Einstieg, Shebang, Dateimodus 755) und
// dist/index.js (programmatischer Export).
//
// Die Paketversion wird hier nicht eingesetzt. Zur Laufzeit kommt sie ausschließlich aus
// src/generated/version.ts, das scripts/gen-version.ts bei jedem `pnpm generate` aus
// package.json schreibt; ein zusätzlicher, beim Bau ersetzter Platzhalter wäre eine zweite
// Quelle derselben Zahl.

const root = dirname(fileURLToPath(import.meta.url));

// Beide Einstiege sind Pflicht: "bin" in package.json zeigt auf dist/cli.js, "exports" auf
// dist/index.js. Fehlte eine der beiden Quelldateien, soll der Bau abbrechen, statt
// stillschweigend ein Paket zu erzeugen, dessen zugesagter Export nicht existiert.
const entry = ["src/cli.ts", "src/index.ts"];

const binaryFile = resolve(root, "dist/cli.js");

export default defineConfig({
  entry,
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  // tsdown vergibt für platform "node" sonst die Endung .mjs. Das Paket ist über
  // "type": "module" ohnehin reines ESM, und bin sowie exports zeigen auf dist/cli.js
  // beziehungsweise dist/index.js.
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  clean: true,
  // Die Sourcemaps bleiben im Paket, aber ohne die eingebetteten Quelltexte. Gemessen am
  // Bau vom 2026-09-13: 2.024.654 Bytes Karten, davon 1.630.728 Bytes allein
  // `sourcesContent`. Mit den Quelltexten riss das entpackte Paket die Obergrenze aus
  // scripts/check-size.ts (3.197.280 von 3.145.728 Bytes); ohne sie liegt es bei rund der
  // Hälfte. Zeilen- und Spaltenzuordnung eines Stacktrace bleibt vollständig erhalten, nur
  // der Quelltext daneben fehlt — und der ist über das öffentliche Repository erreichbar.
  // Die Alternative wäre gewesen, die Grenze anzuheben. Die beiden Grenzen sind Zahlen des
  // Projektinhabers, und vor jeder Änderung daran steht die Ursachensuche; der Kopf von
  // scripts/check-size.ts sagt dasselbe.
  outputOptions: {
    sourcemapExcludeSources: true,
  },
  // tsdown setzt den Dateimodus einer Ausgabedatei mit Shebang selbst auf 755. Geprüft wird
  // es trotzdem: Die Zusage, dass `npx bbutler-mcp` ohne Vorarbeit startet, hängt an genau
  // dieser einen Datei, und ein stiller Fehlschlag fiele erst beim ersten npx-Aufruf eines
  // fremden Rechners auf.
  onSuccess: async () => {
    const mode = (await stat(binaryFile)).mode & 0o777;
    if (mode !== 0o755) {
      await chmod(binaryFile, 0o755);
    }
  },
});
