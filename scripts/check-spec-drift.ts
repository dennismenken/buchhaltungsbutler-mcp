// Der Abgleich der eingecheckten Spezifikation mit der Live-Spezifikation des Anbieters:
// `pnpm check-spec-drift`.
//
// Gelesen wird `docs/openapi/buchhaltungsbutler-v1.json`, geholt wird
// `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`, verglichen werden beide mit
// `scripts/spec-drift.ts`. Das Ergebnis steht auf stdout, die Rückgabewerte sind:
//
//   0  beide Spezifikationen sind inhaltlich gleich.
//   1  sie weichen voneinander ab; der Bericht nennt jede Abweichung.
//   2  der Lauf war nicht durchführbar: Netzfehler, HTTP-Fehler oder unlesbare Datei.
//
// **Warum es überhaupt einen zweiten Lauf braucht.** Der Generatorlauf prüft, ob der
// eingecheckte Stand zur eingecheckten Spezifikationsdatei passt. Er merkt nicht, dass die
// Datei selbst veraltet ist: Der Anbieter hat seine Spezifikation geändert, ohne die
// Versionsnummer zu erhöhen. Dieser Lauf holt die Live-Datei und stellt beides nebeneinander.
//
// **Der Vergleich selbst ist getrennt.** Die Logik liegt in `scripts/spec-drift.ts` und
// kennt weder das Netz noch das Dateisystem; dieses Skript hier ist der Teil, der liest,
// holt und Rückgabewerte setzt.
//
// Node führt diese Datei direkt aus und entfernt die Typannotationen selbst; ab der
// festgelegten Untergrenze >=22.19.0 braucht es dafür keinen TypeScript-Starter.

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Warum hier der Auflösungshaken steht und der Import dynamisch ist.
 *
 * Node führt TypeScript aus, löst aber einen Spezifizierer `./x.js` nicht auf `./x.ts` auf,
 * und genau so importiert dieses Projekt (`verbatimModuleSyntax`, NodeNext). Ein statischer
 * Import von `./spec-drift.js` würde deshalb zur Laufzeit scheitern, obwohl er typprüft:
 * Statische Importe werden aufgelöst, BEVOR der Rumpf dieser Datei läuft, der Haken wäre
 * dann noch nicht angemeldet. Der Haken unten holt das nach, der Import unten ist deshalb
 * dynamisch. Dasselbe Muster benutzen `scripts/measure-tokens.ts` und
 * `scripts/gen-tool-table.ts`.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.endsWith(".js")) throw error;
      return nextResolve(`${specifier.slice(0, ".js".length)}.ts`, context);
    }
  },
});

const { compareSpecs, formatSpecDiff } = (await import(
  new URL("spec-drift.ts", import.meta.url).href
)) as typeof import("./spec-drift.js");

/** Die eingecheckte Spezifikationsdatei, gegen die verglichen wird. */
const LOCAL_SPEC = "docs/openapi/buchhaltungsbutler-v1.json";

/** Die Live-Spezifikation des Anbieters. */
const DEFAULT_LIVE_URL = "https://app.buchhaltungsbutler.de/docs/api/v1.de.json";

/** Wie lange der Abruf der Live-Spezifikation dauern darf, in Millisekunden. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Liest den Schalter `--url` aus den Argumenten.
 *
 * Der Wert überschreibt die Adresse der Live-Spezifikation. Ohne ihn gilt
 * {@link DEFAULT_LIVE_URL}. Ein unbekannter Schalter ist ein Fehler und kein stillschweigend
 * ignorierter Eintrag.
 */
export function parseUrlOption(args: readonly string[]): string {
  let url = DEFAULT_LIVE_URL;
  const rest = [...args];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === undefined) {
      break;
    }
    if (arg === "--") {
      // `pnpm run check-spec-drift -- --url ...` liefert den Trenner in den Argumenten.
      continue;
    }
    if (arg === "--url") {
      const value = rest.shift();
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Der Schalter --url braucht eine Adresse.");
      }
      url = value;
      continue;
    }
    if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
      if (url === "") {
        throw new Error("Der Schalter --url braucht eine Adresse.");
      }
      continue;
    }
    throw new Error(`Unbekannter Schalter: ${arg}`);
  }
  return url;
}

/**
 * Holt die Live-Spezifikation und parst sie.
 *
 * Der Abruf bricht nach 30 Sekunden ab, damit ein hängender Server den wöchentlichen Lauf
 * nicht bis zum Ende der Frist blockiert.
 */
async function fetchLiveSpec(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(
      `Die Live-Spezifikation unter ${url} antwortete mit HTTP ${String(response.status)}.`,
    );
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `Die Live-Spezifikation unter ${url} ist kein gültiges JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Liest und parst die eingecheckte Spezifikationsdatei. */
function readLocalSpec(): unknown {
  const path = fileURLToPath(new URL(`../${LOCAL_SPEC}`, import.meta.url));
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `${LOCAL_SPEC} ist kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Führt den Abgleich aus und liefert den Rückgabewert.
 *
 * Alle Fehler, die den Lauf verhindern, werden als Ausnahme nach oben gereicht und dort
 * einheitlich behandelt: Meldung auf stderr, Rückgabewert 2.
 */
export async function main(args: readonly string[]): Promise<number> {
  const url = parseUrlOption(args);
  const local = readLocalSpec();
  const live = await fetchLiveSpec(url);
  const diff = compareSpecs(local, live);

  process.stdout.write(`${formatSpecDiff(diff)}\n`);
  return diff.identical ? 0 : 1;
}

/**
 * Ausgeführt wird nur beim direkten Aufruf. Ein Import aus dem Test holt nichts ins Netz.
 */
const invokedScriptPath = process.argv[1];
if (invokedScriptPath !== undefined && import.meta.url === pathToFileURL(invokedScriptPath).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `check-spec-drift: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}
