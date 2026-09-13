// Registerhilfen für die dreizehn Registerprüfungen P1 bis P13 (Plan 9.2).
//
// Diese Datei enthält keine Erwartungswerte. Sie stellt ausschließlich Zugriffe bereit:
// auf das Register, auf die Spezifikationsdatei, auf das Verzeichnis der Registerdateien
// und auf die beiden Messgrößen, die die Prüfungen brauchen (JSON-Schema eines Feldes,
// Tokenzahl einer Definition). Die Erwartungen selbst stehen in den Prüfdateien sowie in
// den beiden unabhängig gepflegten Listen test/registry/class-list.ts und
// test/registry/effect-list.ts.
//
// Warum hier überhaupt ein JSON-Schema gebaut wird, obwohl src/schema/build.ts das zur
// Laufzeit tut: AP11 läuft vor AP05 und AP08. P10 braucht trotzdem die Information, ob ein
// Behälterfeld eine Mengengrenze trägt, und P11 braucht die Zeichen- und Tokenmenge der
// Definition, die der Client beim Verbinden sieht. Beides wird deshalb hier aus dem
// Registereintrag aufgebaut, nach den Postenlisten aus Plan 4.10 und der Sparmaßnahme S6
// (outputSchema ohne Feldbeschreibungen). Das ist eine Messung der Definition, keine
// zweite Implementierung des Auslieferungsschemas: Gesendet wird ausschließlich, was
// src/schema/build.ts erzeugt.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { encode } from "gpt-tokenizer/encoding/o200k_base";
import { z } from "zod";

import { ENDPOINTS, ENDPOINTS_BY_PATH } from "../../src/generated/endpoints.js";
import type { GeneratedEndpoint, GeneratedParameter } from "../../src/generated/endpoints.js";
import { TOOL_CLASSES } from "../../src/registry/classes.js";
import type { ToolClassAnnotations } from "../../src/registry/classes.js";
import {
  renderToolDefinition,
  toolDefinitionJson,
  type RenderedToolDefinition,
} from "../../src/registry/definition.js";
import {
  TOOL_BY_NAME,
  TOOL_BY_SPEC_PATH,
  TOOL_ENTRIES,
} from "../../src/registry/index.generated.js";
import type { FieldSpec, SchemaFragment, ToolEntry } from "../../src/registry/types.js";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const TOOLS_DIR = `${ROOT}src/registry/tools`;
export const SPEC_FILE = `${ROOT}docs/openapi/buchhaltungsbutler-v1.json`;
export const GOLDEN_DIR = `${ROOT}test/golden`;
export const INSTRUCTIONS_MODULE = `${ROOT}src/server/instructions.ts`;

export { ENDPOINTS, ENDPOINTS_BY_PATH, TOOL_BY_NAME, TOOL_BY_SPEC_PATH };

/** Das Register, so wie der erzeugte Index es liefert. Zu Beginn von AP11 ist es leer. */
export const REGISTRY: readonly ToolEntry[] = TOOL_ENTRIES;

/**
 * Der Spezifikationspfad eines Eintrags. Bei den vier Endpunkten mit Pfadvorlage ist das
 * `specPath` und niemals die Vorlage (Plan 4.6): Fehlerkatalog, Deckungstest und Audit-Zeile
 * schlüsseln nach dem unveränderten Schlüssel der Spezifikation.
 */
export function specPathOf(tool: ToolEntry): string {
  return "literal" in tool.path ? tool.path.literal : tool.path.specPath;
}

/** Nachschlagen nach Werkzeugname, ohne Umweg über die Karte des Index. */
export function entryByName(name: string): ToolEntry | undefined {
  return REGISTRY.find((tool) => tool.name === name);
}

/** Nachschlagen nach Spezifikationspfad. */
export function entryBySpecPath(path: string): ToolEntry | undefined {
  return REGISTRY.find((tool) => specPathOf(tool) === path);
}

/**
 * Die Fehlermeldung für einen Eintrag, den es noch nicht gibt. Sie nennt Dateinamen und
 * zuständiges Arbeitspaket, damit die rote Prüfung beim Befüllen als Arbeitsliste taugt
 * (AP11, Definition of Done).
 */
export function missingEntry(name: string): string {
  return `${name}: kein Registereintrag. Erwartet wird src/registry/tools/${name}.ts (AP12a bis AP12e).`;
}

/** Ein Feld mit seinem Pfad im Werkzeugschema. */
export interface FlatField {
  /** Pfad im Werkzeugschema, z. B. `positions` oder `receipts[].positions[].amount`. */
  readonly path: string;
  readonly field: FieldSpec;
  /** 0 für die oberste Ebene, 1 innerhalb eines Behälterelements, und so weiter. */
  readonly depth: number;
}

/** Alle Felder eines Eintrags, einschließlich der geschachtelten `itemFields`. */
export function flatFields(tool: ToolEntry): FlatField[] {
  const out: FlatField[] = [];

  const walk = (fields: readonly FieldSpec[], prefix: string, depth: number): void => {
    for (const field of fields) {
      const path = prefix === "" ? field.name : `${prefix}[].${field.name}`;
      out.push({ path, field, depth });
      if (field.itemFields !== undefined) {
        walk(field.itemFields, path, depth + 1);
      }
    }
  };

  walk(tool.fields, "", 0);
  return out;
}

/** Alle Behälterfelder eines Eintrags, also jedes Feld mit `itemFields`, auf jeder Ebene. */
export function containerFields(tool: ToolEntry): FlatField[] {
  return flatFields(tool).filter(({ field }) => field.itemFields !== undefined);
}

/** Die Vereinigung aller `apiNames` der obersten Feldebene, mit Doppelungen. */
export function topLevelApiNames(tool: ToolEntry): string[] {
  return tool.fields.flatMap((field) => [...field.apiNames]);
}

// ---------------------------------------------------------------------------------------
// JSON-Schema eines Feldes
// ---------------------------------------------------------------------------------------

/**
 * Das JSON-Schema eines Zod-Fragments. `unrepresentable: "any"` statt eines Abbruchs: Ein
 * Baustein, den JSON Schema nicht ausdrücken kann, ist kein Fehlschlag dieser Prüfung — die
 * Prüfung will wissen, ob eine Mengengrenze gesetzt ist und wie groß die Definition wird.
 * `io: "input"` ist die richtige Richtung, weil hier Eingabeschemata gemessen werden.
 */
export function jsonSchemaFor(fragment: SchemaFragment, context: string): Record<string, unknown> {
  try {
    const schema = z.toJSONSchema(fragment, { io: "input", unrepresentable: "any" }) as Record<
      string,
      unknown
    >;
    delete schema.$schema;
    return schema;
  } catch (cause) {
    throw new Error(
      `${context}: das Zod-Fragment lässt sich nicht in ein JSON-Schema übersetzen. Genau diese Übersetzung braucht auch src/schema/build.ts beim Serverstart.`,
      { cause },
    );
  }
}

/**
 * Die Mengengrenze eines Behälterfeldes, also `maxItems` auf der obersten Ebene des
 * Schemas. Absichtlich nicht rekursiv: Die Grenze eines geschachtelten Arrays gehört zu
 * dessen eigenem Feld und wird dort getrennt geprüft (Plan 4.7 Q4, „beide Grenzen gelten
 * unabhängig voneinander").
 */
export function topLevelMaxItems(schema: Record<string, unknown>): number | undefined {
  const direct = schema.maxItems;
  if (typeof direct === "number") return direct;

  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const branches = schema[key];
    if (!Array.isArray(branches)) continue;
    for (const branch of branches) {
      if (typeof branch !== "object" || branch === null) continue;
      const found = topLevelMaxItems(branch as Record<string, unknown>);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------------------
// Die Werkzeugdefinition, wie der Client sie beim Verbinden sieht
// ---------------------------------------------------------------------------------------

export type { RenderedToolDefinition };

/** Die vier Annotationen eines Eintrags, aus der Klassentabelle (Plan 3.3). */
export function annotationsOf(tool: ToolEntry): ToolClassAnnotations {
  return TOOL_CLASSES[tool.toolClass].annotations;
}

/**
 * Die Werkzeugdefinition eines Eintrags, **genau so, wie der Client sie in `tools/list`
 * bekommt**: Name, Titel, Annotationen, Beschreibung, Eingabeschema, Ausgabeschema.
 *
 * Gebaut wird sie nicht mehr hier, sondern in `src/registry/definition.ts` — derselben Datei,
 * aus der auch `scripts/measure-tokens.ts` und `doctor` (8.4) ihre Zahlen ziehen. Zu Beginn
 * von AP11 war das nicht möglich: Die Module gab es noch nicht, und die Definition wurde hier
 * nachgebaut. Der Nachbau maß danach einen anderen Gegenstand als den ausgelieferten, und
 * solange es drei Nachbildungen gab, konnten sie auseinanderlaufen — was in `doctor`
 * nachweislich geschehen ist. Diese Funktion bleibt als Zugriff der Registerprüfungen stehen
 * und stellt nichts mehr selbst her.
 */
export function renderedDefinition(tool: ToolEntry): RenderedToolDefinition {
  return renderToolDefinition(tool);
}

/** Die Definition als JSON-Text. Grundlage der Zeichen- und Tokenmessung in P11 und P9. */
export function definitionJson(tool: ToolEntry): string {
  return toolDefinitionJson(tool);
}

/**
 * Die Tokenzahl eines Textes, gezählt mit dem Tokenizer aus Plan 13.9
 * (`gpt-tokenizer@4.0.0`, Kodierung `o200k_base`), niemals über `CHARS_PER_TOKEN`: Ein
 * Budget, das über einen Schätzfaktor erzwungen wird, erzwingt die Schätzung und nicht das
 * Budget (Plan 4.10).
 *
 * `o200k_base` ist die tatsächliche Kodierung der GPT-4o-Linie. Für andere Modellfamilien,
 * die Claude-Linie eingeschlossen, ist der Tokenizer nicht öffentlich dokumentiert; die Zahl
 * ist dort eine belastbare Größenordnung und keine exakte Zahl (Plan 13.9).
 */
export function tokenCount(text: string): number {
  return encode(text).length;
}

// ---------------------------------------------------------------------------------------
// Die Spezifikationsdatei
// ---------------------------------------------------------------------------------------

interface SpecSchema {
  readonly $ref?: string;
  readonly type?: string;
  readonly properties?: Readonly<Record<string, SpecSchema>>;
  readonly required?: readonly string[];
  readonly items?: SpecSchema;
}

interface SpecDocument {
  readonly definitions?: Readonly<Record<string, SpecSchema>>;
}

let cachedSpec: SpecDocument | undefined;

/** Die Spezifikationsdatei, einmal gelesen. Sie ist die Grundwahrheit über den Umfang der API. */
export function readSpec(): SpecDocument {
  cachedSpec ??= JSON.parse(readFileSync(SPEC_FILE, "utf8")) as SpecDocument;
  return cachedSpec;
}

/** Der Definitionsname eines `$ref`, also „Receipts" aus „#/definitions/Receipts". */
export function definitionName(ref: string): string {
  return ref.replace("#/definitions/", "");
}

/** Eine Definition der Spezifikation. */
export function definitionOf(name: string): SpecSchema | undefined {
  return readSpec().definitions?.[name];
}

/**
 * Das Ergebnis der Auflösung einer Behälterdefinition auf ihre Elementeigenschaften
 * (Plan 4.4 Punkt 3). Der Zweig ist Teil des Ergebnisses, weil der Test beide Zweige
 * abdecken muss: sieben der acht Behälter tragen unter `.items` ausschließlich ein `$ref`,
 * nur `PostingsFree` führt seine Eigenschaften inline.
 */
export type ElementResolution =
  | {
      readonly branch: "ref";
      readonly elementDefinition: string;
      readonly properties: readonly string[];
      readonly required: readonly string[];
    }
  | {
      readonly branch: "inline";
      readonly properties: readonly string[];
      readonly required: readonly string[];
    }
  | { readonly branch: "none"; readonly reason: string };

/**
 * Die Auflösungsregel aus Plan 4.4 Punkt 3, vollständig und in der dort festgelegten
 * Reihenfolge. Sie ist Pflicht und nicht abkürzbar: Ein Test, der stumpf
 * `.items.properties` liest, findet an sieben von acht Stellen ein leeres Objekt und meldet
 * entweder alles oder nichts als Fehler.
 *
 *   1. `.items` der Behälterdefinition lesen.
 *   2. Trägt `.items` ein `$ref`, wird es zuerst aufgelöst; verglichen wird gegen
 *      `properties` der aufgelösten Elementdefinition.
 *   3. Trägt `.items` kein `$ref`, sondern `properties`, wird direkt dagegen verglichen.
 *   4. Weder `$ref` noch `properties` ist ein Fehlschlag und keine leere Menge.
 */
export function resolveElementProperties(containerRef: string): ElementResolution {
  const containerName = definitionName(containerRef);
  const container = definitionOf(containerName);
  if (container === undefined) {
    return {
      branch: "none",
      reason: `die Behälterdefinition ${containerName} steht nicht in docs/openapi/buchhaltungsbutler-v1.json`,
    };
  }

  const items = container.items;
  if (items === undefined) {
    return { branch: "none", reason: `${containerName} trägt kein .items` };
  }

  if (items.$ref !== undefined) {
    const elementName = definitionName(items.$ref);
    const element = definitionOf(elementName);
    if (element?.properties === undefined) {
      return {
        branch: "none",
        reason: `${containerName}.items verweist auf ${elementName}, und diese Definition trägt kein properties`,
      };
    }
    return {
      branch: "ref",
      elementDefinition: elementName,
      properties: Object.keys(element.properties),
      required: [...(element.required ?? [])],
    };
  }

  if (items.properties !== undefined) {
    return {
      branch: "inline",
      properties: Object.keys(items.properties),
      required: [...(items.required ?? [])],
    };
  }

  return {
    branch: "none",
    reason: `${containerName}.items trägt weder $ref noch properties`,
  };
}

/** Der Parameter eines Endpunkts, nach Name. */
export function parameterOf(path: string, name: string): GeneratedParameter | undefined {
  return ENDPOINTS_BY_PATH.get(path)?.parameters.find((parameter) => parameter.name === name);
}

/** Ein Endpunkt des Generats. */
export function endpointOf(path: string): GeneratedEndpoint | undefined {
  return ENDPOINTS_BY_PATH.get(path);
}

// ---------------------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------------------

/**
 * Die Dateinamen in `src/registry/tools/`, ohne `.ts`, in Codepunktfolge. Ein fehlendes
 * Verzeichnis ist eine leere Liste und kein Absturz: Zu Beginn von AP11 gibt es noch keinen
 * einzigen Registereintrag, und genau dagegen laufen die dreizehn Prüfungen rot.
 */
export function registryFileNames(): string[] {
  if (!existsSync(TOOLS_DIR)) return [];
  return readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => entry.name.slice(0, -".ts".length))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Alle Dateien eines Verzeichnisbaums, absolut. Leere Liste, wenn es ihn nicht gibt. */
export function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}/${entry.name}`);
}
