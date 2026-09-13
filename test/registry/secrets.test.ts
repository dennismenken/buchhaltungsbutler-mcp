// P9: Geheimnisfreiheit.
//
// `api_key`, `api_client`, `api_secret` und `authorization` kommen in keiner
// Werkzeugdefinition, keinem Schema, keiner Beschreibung, keiner Golden-Antwort, keiner
// Fehlermeldung und keinem Resource-Inhalt vor. Ein Treffer lässt den Test fehlschlagen.
//
// Die einzige erlaubte Stelle ist das Feld `omitted` des Registereintrags: Dort steht
// api_key mit der Begründung, dass der Server ihn setzt. `omitted` ist
// Registerbuchhaltung und wird dem Client nie geschickt; geprüft wird deshalb die
// gerenderte Definition und nicht der rohe Eintrag.
//
// Zusätzlich sucht diese Prüfung nach Zeichenketten, die wie ein echtes Zugangsdatum
// aussehen. Der teuerste Fehler dieses Projekts wäre ein Produktivschlüssel, den jemand
// beim Schreiben eines Registereintrags oder einer Golden-Datei hineinkopiert.

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GOLDEN_DIR,
  ROOT,
  definitionJson,
  entryByName,
  filesUnder,
  flatFields,
  missingEntry,
} from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "./class-list.js";

/** Die vier Bezeichner, ohne Rücksicht auf Groß- und Kleinschreibung. */
const CREDENTIAL_NAMES: readonly string[] = [
  "api_key",
  "api_client",
  "api_secret",
  "authorization",
];

/**
 * Eine Zeichenkette, die wie ein Schlüssel aussieht: mindestens 32 Zeichen aus dem
 * üblichen Vorrat, mit Ziffer, Klein- und Großbuchstabe. Deutscher Fließtext und
 * Feldnamen erfüllen das nicht.
 */
const KEY_LIKE_PATTERN = /[A-Za-z0-9+/=_-]{32,}/g;

/**
 * Ein Zugangsdatum in **Schlüsselposition**, also mit zugewiesenem Wert: `"api_key": "…"`,
 * `api_key = "…"`, `authorization: "Basic …"`. Genau diese Form hätte ein hineinkopierter
 * Produktivschlüssel.
 *
 * Der Bezeichner als **Wert** (`{ apiName: "api_key", reason: … }`) ist dagegen
 * Registerbuchhaltung und keine Preisgabe — dieselbe Ausnahme, die der Kopf dieser Datei
 * für das Feld `omitted` schon benennt. Für die 54 **ausgelieferten** Definitionen bleibt
 * es bei der strengeren Regel: dort darf das Wort überhaupt nicht vorkommen.
 */
const CREDENTIAL_IN_KEY_POSITION = new RegExp(
  `["']?(?:${CREDENTIAL_NAMES.join("|")})["']?\\s*[:=]`,
  "i",
);

/**
 * Schlüssel, deren Wert bauartbedingt ein Dateiinhalt ist: der Base64-Block eines Belegs
 * (`file`, `file_content`) und die Dateien einer Berichtsantwort (`files.pdf`,
 * `files.csv`). Ihr Inhalt ist lang und undurchsichtig, ohne ein Zugangsdatum zu sein.
 */
const FILE_CONTENT_KEYS: readonly string[] = ["file", "file_content"];

/**
 * Ab dieser Länge gilt ein reiner Base64-Block in einem Dateiinhaltsfeld als Nutzlast und
 * nicht mehr als Schlüssel. Ein Zugangsdatum dieser API ist zwei Größenordnungen kürzer;
 * ein dort hineinkopierter Schlüssel bleibt damit auffällig.
 *
 * Ehrliche Grenze der Prüfung: Wer einen Schlüssel absichtlich als 200 Zeichen langen
 * Base64-Block in ein Dateifeld legt, wird hier nicht gefasst. Das ist der Preis dafür,
 * dass Golden-Dateien überhaupt Dateiinhalte tragen dürfen, und wird benannt statt
 * verschwiegen.
 */
const PAYLOAD_MIN_LENGTH = 200;

/** Reines Base64 ohne Trennzeichen. */
const BASE64_BLOCK = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Die geschärfte Form für die Attrappen: derselbe Mindestumfang, aber **ohne `_` und `-`**.
 *
 * Begründung: Ein Zugangsdatum ist ein zusammenhängender, undurchsichtiger Block. Unterstrich
 * und Bindestrich trennen dagegen lesbare Bestandteile — der Dateiname, den diese API
 * zurückliefert, hat bauartbedingt keine Endung und sieht aus wie
 * `2026-01-04_Eingangsrechnung_ER-2026-0001` (Spezifikationsbeispiel in docs/api/belege.md).
 * Als ein Block gelesen erfüllt er jedes Schlüsselmerkmal, in seine Bestandteile zerlegt
 * keines davon.
 *
 * Ein Schlüssel mit Präfix (`sk-proj-<Block>`) bleibt gefasst, weil sein Rumpf weiterhin ein
 * ununterbrochener Lauf von 32 Zeichen ist.
 */
const OPAQUE_FORM = /[A-Za-z0-9+/=]{32,}/g;

/** Ein erfundener Dateiname: Der Wert endet auf eine Dateiendung. */
const FILENAME_PATTERN = /\.[A-Za-z0-9]{2,5}$/;

/** Trägt der Kandidat Ziffer, Klein- und Großbuchstabe, ist er undurchsichtig genug. */
function isOpaque(candidate: string): boolean {
  return /[0-9]/.test(candidate) && /[a-z]/.test(candidate) && /[A-Z]/.test(candidate);
}

/**
 * Dateien außerhalb des Registers, die ebenfalls kein Zugangsdatum tragen dürfen.
 *
 * Alle drei liegen vor: `src/generated/errors.ts` wird aus der Spezifikation erzeugt und
 * eingecheckt, `src/server/instructions.ts` und `src/server/resources.ts` sind Quelltext.
 * Die Prüfung liest sie also tatsächlich; ein grüner Lauf ist hier eine Aussage über den
 * Inhalt dieser Dateien und kein übersprungener Leerlauf.
 *
 * Der `existsSync`-Zweig weiter unten bleibt trotzdem stehen. Er ist die Vorsichtsmaßnahme
 * für den Fall, dass eine der Dateien einmal nicht am erwarteten Ort liegt — ein
 * abgebrochener Generatorlauf, eine Umbenennung —, damit die Sicherheitsprüfung dann nicht
 * mit einem Lesefehler abbricht statt die übrigen Dateien zu prüfen. Ehrliche Grenze: Eine
 * verschobene Datei wird damit stillschweigend übersprungen. Wer eine dieser drei Dateien
 * verschiebt oder umbenennt, führt diese Liste mit.
 */
const ADDITIONAL_FILES: readonly string[] = [
  `${ROOT}src/generated/errors.ts`,
  `${ROOT}src/server/instructions.ts`,
  `${ROOT}src/server/resources.ts`,
];

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

function matchesIn(text: string): string[] {
  const found: string[] = [];

  for (const credentialName of CREDENTIAL_NAMES) {
    if (new RegExp(credentialName, "i").test(text)) {
      found.push(credentialName);
    }
  }

  for (const candidate of text.match(KEY_LIKE_PATTERN) ?? []) {
    if (isOpaque(candidate)) {
      found.push(`schlüsselartige Zeichenkette der Länge ${String(candidate.length)}`);
    }
  }

  return found;
}

/**
 * Dieselbe Suche für **Attrappen im Verzeichnis der Golden-Dateien**. Sie ist strukturbewusst
 * statt volltextbasiert, weil eine dauerhaft rote Sicherheitsprüfung überlesen wird und dann
 * den echten Fall nicht mehr fängt (S5).
 *
 * Drei Unterschiede zu `matchesIn`, jeder mit Begründung:
 *
 * 1. Ein Zugangsdatum zählt nur in **Schlüsselposition**, also mit zugewiesenem Wert. Der
 *    Bezeichner als Wert in einem `omitted`-Eintrag ist ausdrücklich erlaubt (Kopf dieser
 *    Datei).
 * 2. Ein Wert, der auf eine **Dateiendung** endet, ist ein erfundener Dateiname und kein
 *    Schlüssel.
 * 3. Ein reiner **Base64-Block ab 200 Zeichen** in einem Dateiinhaltsfeld ist eine Nutzlast.
 *
 * Für `.json` wird der Baum durchlaufen, damit der Schlüssel jedes Wertes bekannt ist; jede
 * Beanstandung nennt den Pfad. Andere Dateien werden im Volltext geprüft, wobei ein
 * Kandidat mit unmittelbar folgender Dateiendung als Dateiname gilt.
 */
function matchesInFixture(file: string, text: string): string[] {
  if (file.endsWith(".json")) {
    let tree: unknown;
    try {
      tree = JSON.parse(text);
    } catch {
      return [`ist kein gültiges JSON und kann nicht geprüft werden`];
    }
    return matchesInTree(tree, "");
  }

  const found: string[] = [];

  if (CREDENTIAL_IN_KEY_POSITION.test(text)) {
    found.push("ein Zugangsdatum in Schlüsselposition");
  }

  for (const matches of text.matchAll(OPAQUE_FORM)) {
    const candidate = matches[0];
    if (!isOpaque(candidate)) continue;
    // Ein Dateiname: unmittelbar hinter dem Kandidaten steht die Endung.
    if (/^\.[A-Za-z0-9]{2,5}\b/.test(text.slice(matches.index + candidate.length))) continue;
    found.push(`schlüsselartige Zeichenkette der Länge ${String(candidate.length)}`);
  }

  return found;
}

/** Der Durchlauf durch einen geparsten Golden-Körper. `path` ist der Schlüsselpfad. */
function matchesInTree(node: unknown, path: string): string[] {
  if (typeof node === "string") {
    return matchesInValue(node, path);
  }
  if (Array.isArray(node)) {
    return node.flatMap((element, index) => matchesInTree(element, `${path}[${String(index)}]`));
  }
  if (typeof node === "object" && node !== null) {
    const found: string[] = [];
    for (const [key, value] of Object.entries(node)) {
      const kind = path === "" ? key : `${path}.${key}`;
      for (const credentialName of CREDENTIAL_NAMES) {
        if (key.toLowerCase().includes(credentialName)) {
          found.push(`${kind} ist ein Zugangsdatum in Schlüsselposition`);
        }
      }
      found.push(...matchesInTree(value, kind));
    }
    return found;
  }
  return [];
}

/** Ein einzelner Zeichenkettenwert mit bekanntem Schlüsselpfad. */
function matchesInValue(value: string, path: string): string[] {
  if (CREDENTIAL_IN_KEY_POSITION.test(value)) {
    return [`${path}: enthält ein Zugangsdatum in Schlüsselposition`];
  }
  if (FILENAME_PATTERN.test(value)) return [];
  if (isFileContent(path) && value.length >= PAYLOAD_MIN_LENGTH && BASE64_BLOCK.test(value)) {
    return [];
  }

  const found: string[] = [];
  for (const candidate of value.match(OPAQUE_FORM) ?? []) {
    if (isOpaque(candidate)) {
      found.push(`${path}: schlüsselartige Zeichenkette der Länge ${String(candidate.length)}`);
    }
  }
  return found;
}

/** Liegt der Wert in einem Feld, dessen Inhalt bauartbedingt eine Datei ist? */
function isFileContent(path: string): boolean {
  const parts = path.split(".");
  const leaf = parts.at(-1) ?? "";
  const parent = parts.at(-2) ?? "";
  return FILE_CONTENT_KEYS.includes(leaf) || parent === "files";
}

describe("P9 Geheimnisfreiheit", () => {
  it("trägt in keiner der 54 Werkzeugdefinitionen ein Zugangsdatum", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(missingEntry(name));
        continue;
      }

      const matches = matchesIn(definitionJson(tool));
      if (matches.length > 0) {
        problems.push(
          `${name}: die ausgelieferte Definition enthält ${matches.join(", ")}. Zugangsdaten setzt der Request-Mapper, sie sind nie Teil eines Schemas.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("führt kein Feld, das ein Zugangsdatum abbildet", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) continue;

      for (const { path, field } of flatFields(tool)) {
        for (const credentialName of CREDENTIAL_NAMES) {
          if (field.name.toLowerCase().includes(credentialName)) {
            problems.push(`${name}, Feld ${path}: heißt wie ein Zugangsdatum (${credentialName}).`);
          }
          if (field.apiNames.some((apiName) => apiName.toLowerCase().includes(credentialName))) {
            problems.push(
              `${name}, Feld ${path}: apiName ${field.apiNames.join(", ")} bildet ein Zugangsdatum ab.`,
            );
          }
        }
      }
    }

    expectNoIssues(problems);
  });

  it("nennt api_key ausschließlich in omitted, und dort mit Begründung", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) continue;

      const entry = tool.omitted.find((item) => item.apiName === "api_key");
      if (entry === undefined) {
        problems.push(
          `${name}: api_key steht nicht in omitted. Er ist der einzige Parameter, den ein Werkzeug nicht abbildet, und die Auslassung wird begründet.`,
        );
        continue;
      }
      if (entry.reason.trim() === "") {
        problems.push(`${name}: der omitted-Eintrag api_key trägt keine Begründung.`);
      }
    }

    expectNoIssues(problems);
  });

  it("trägt in keiner Golden-Datei ein Zugangsdatum", () => {
    const problems: string[] = [];

    for (const file of filesUnder(GOLDEN_DIR)) {
      const matches = matchesInFixture(file, readFileSync(file, "utf8"));
      if (matches.length > 0) {
        problems.push(
          `${file.replace(ROOT, "")}: enthält ${matches.join(", ")}. Golden-Dateien tragen erfundene Geschäftsdaten und niemals ein Zugangsdatum.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt in Fehlerkatalog, instructions und Resources kein Zugangsdatum", () => {
    const problems: string[] = [];

    for (const file of ADDITIONAL_FILES) {
      if (!existsSync(file)) continue;
      const matches = matchesIn(readFileSync(file, "utf8"));
      if (matches.length > 0) {
        problems.push(`${file.replace(ROOT, "")}: enthält ${matches.join(", ")}.`);
      }
    }

    expectNoIssues(problems);
  });
});
