import { existsSync, readFileSync } from "node:fs";
import { chmod, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

// Bauplan des Pakets. Erzeugt dist/cli.js (bin-Einstieg, Shebang, Dateimodus 755) und
// dist/index.js (programmatischer Export). Die Datei gehört AP01; kein späteres Paket ändert sie.

const root = dirname(fileURLToPath(import.meta.url));

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  version: string;
};

// src/index.ts entsteht erst in AP10. Bis dahin wird nur der bin-Einstieg gebaut, sonst
// scheiterte der Bau in AP01 an einer Datei, die es planmäßig noch nicht gibt.
const entry = ["src/cli.ts"];
if (existsSync(resolve(root, "src/index.ts"))) {
  entry.push("src/index.ts");
}

const binaryFile = resolve(root, "dist/cli.js");

export default defineConfig({
  entry,
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  // tsdown vergibt für platform "node" sonst die Endung .mjs. Das Paket ist über
  // "type": "module" ohnehin reines ESM, und bin sowie exports zeigen auf dist/cli.js
  // beziehungsweise dist/index.js (Plan 13.7).
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  clean: true,
  // Die Version wird beim Bau eingesetzt. Zur Laufzeit wird kein JSON gelesen; das ist die
  // Zwischenlösung bis AP15, das die Zeile auf src/generated/version.ts umstellt (AP01, AP03).
  define: {
    __BB_VERSION__: JSON.stringify(packageJson.version),
  },
  // tsdown setzt den Dateimodus einer Ausgabedatei mit Shebang selbst auf 755. Geprüft wird
  // es trotzdem: Die Zusage aus 13.7 hängt an genau dieser einen Datei, und ein stiller
  // Fehlschlag fiele erst beim ersten npx-Aufruf eines fremden Rechners auf.
  onSuccess: async () => {
    const mode = (await stat(binaryFile)).mode & 0o777;
    if (mode !== 0o755) {
      await chmod(binaryFile, 0o755);
    }
  },
});
