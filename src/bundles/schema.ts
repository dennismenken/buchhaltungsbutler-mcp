// Vom Bündeleintrag zum Eingabeschema und zum Ausgabeschema.
//
// Derselbe Weg wie in `src/schema/build.ts`, mit denselben Bausteinen (`strictObject`,
// `toJsonSchema`, Querprüfungen). Getrennt, weil `assertEntryConsistency` dort Dinge prüft, die
// es bei einem Bündel nicht gibt: einen einzigen Pfad, Pfadsegmentfelder, `omitted`.

import type { z } from "zod";

import { strictObject, toJsonSchema } from "../schema/build.js";
import type { CrossCheckTool } from "../schema/cross-checks.js";
import { TOOL_CLASSES, type ToolClassAnnotations } from "../registry/classes.js";
import type { FieldSpec } from "../registry/types.js";
import { applyBundleChecks } from "./cross-checks.js";
import { BUNDLE_BLOCK_SCHEMA } from "./output-schema.js";
import type { BundleEntry } from "./types.js";

export class BundleSchemaError extends Error {
  readonly bundleName: string;

  constructor(bundleName: string, message: string) {
    super(`${bundleName}: ${message}`);
    this.name = "BundleSchemaError";
    this.bundleName = bundleName;
  }
}

/**
 * Prüft den Eintrag, bevor daraus ein Schema wird: kein doppelter Feldname, keine leere
 * Beschreibung, `serverOnlyFields` und `source: "server"` decken sich. Ein Bündel hat keine
 * Pfadsegmentfelder; `source: "path"` ist deshalb ein Verdrahtungsfehler.
 */
export function assertBundleConsistency(entry: BundleEntry): void {
  const fail = (message: string): never => {
    throw new BundleSchemaError(entry.name, message);
  };

  const names = new Set<string>();
  for (const field of entry.fields) {
    if (names.has(field.name)) {
      fail(`Das Feld ${field.name} steht zweimal in fields.`);
    }
    names.add(field.name);
    if (field.description.trim() === "") {
      fail(`Feld ${field.name}: Die Beschreibung ist leer.`);
    }
    if (field.source === "path") {
      fail(
        `Feld ${field.name} trägt source: "path". Ein Bündel baut seine Pfade im Ablauf und ` +
          "hat keine Pfadsegmentfelder im Eingabeschema.",
      );
    }
    if (field.source === "server" && !entry.serverOnlyFields.includes(field.name)) {
      fail(`Feld ${field.name}: source "server", aber der Name fehlt in serverOnlyFields.`);
    }
  }
  for (const name of entry.serverOnlyFields) {
    const field = entry.fields.find((candidate) => candidate.name === name);
    if (field === undefined) {
      fail(`serverOnlyFields nennt ${name}, aber fields führt das Feld nicht.`);
    } else if (field.source !== "server") {
      fail(`serverOnlyFields nennt ${name}, aber das Feld trägt source: "${field.source}".`);
    }
  }
  if (entry.steps.length === 0) {
    fail("Ein Bündel ohne Schritt ist kein Bündel.");
  }
  if (entry.maxCalls < 1) {
    fail("maxCalls ist kleiner als 1; dann könnte nicht ein einziger Schritt laufen.");
  }
}

/** Der Kontext, den die gemeinsamen Querprüfungen erwarten. */
function crossCheckTool(entry: BundleEntry): CrossCheckTool {
  const first = entry.steps[0];
  return {
    toolName: entry.name,
    // Nachgeschlagen wird damit nichts: Die Bündel führen ausschließlich Q1 und Q3, und keine
    // der beiden liest den Pfad. Er steht hier, damit eine Meldung eine Herkunft nennen kann.
    specPath: first === undefined ? "" : specPathOfStep(first.path),
    maxItems: 0,
  };
}

function specPathOfStep(path: BundleEntry["steps"][number]["path"]): string {
  return "template" in path ? path.specPath : path.literal;
}

function describedField(field: FieldSpec): z.ZodType {
  const described =
    field.schema.description === field.description
      ? field.schema
      : field.schema.describe(field.description);
  return field.required ? described : described.optional();
}

/**
 * Das Zod-Objekt eines Bündels: strikt, mit `.optional()` nach `required`, mit den
 * Querprüfungen.
 *
 * @param withChecks `false` liefert dasselbe Schema ohne jede Querprüfung. Damit melden
 *        Guard 3 und Guard 4 getrennt, genau wie bei den 54 Endpunktwerkzeugen.
 */
export function buildBundleZodSchema(entry: BundleEntry, withChecks = true): z.ZodType {
  assertBundleConsistency(entry);
  const shape: Record<string, z.ZodType> = {};
  for (const field of entry.fields) {
    shape[field.name] = describedField(field);
  }
  const object = strictObject(shape);
  if (!withChecks) {
    return object;
  }
  return applyBundleChecks(object, entry.crossChecks, entry.bundleChecks, crossCheckTool(entry));
}

/** Eingabeschema als JSON Schema, aus demselben Zod-Schema, mit dem Guard 4 prüft. */
export function buildBundleJsonSchema(entry: BundleEntry): Record<string, unknown> {
  return toJsonSchema(buildBundleZodSchema(entry));
}

/**
 * Das Ausgabeschema eines Bündels: der Pflichtblock `bundle` und die eigenen Blöcke.
 *
 * Offen wie jedes Ausgabeschema dieses Servers (begründet im Kopf von
 * src/response/output-schema.ts), aber mit `bundle` und `success` in
 * `required`: Dass `complete`, `stopped_because` und `gaps` in JEDER Antwort stehen, ist der
 * Kern des Vertrags. Ein Modell soll auf Werte prüfen müssen, nicht auf Schlüssel.
 */
export function buildBundleOutputSchema(entry: BundleEntry): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      success: { type: "boolean" },
      bundle: BUNDLE_BLOCK_SCHEMA,
      ...entry.outputProperties,
    },
    required: ["success", "bundle", ...entry.outputRequired],
    additionalProperties: true,
  };
}

/** Die Bestandteile einer Bündeldefinition, in der Reihenfolge des gesendeten JSON. */
export interface RenderedBundleDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly annotations: ToolClassAnnotations;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
}

/**
 * Die Definition eines Bündels, wie `tools/list` sie ausliefert.
 *
 * Sie entsteht aus denselben beiden Funktionen, die `registerBundles` benutzt; eine zweite
 * Nachbildung gibt es nicht. Das ist dieselbe Regel wie bei `registry/definition.ts`: Solange
 * es mehrere Nachbildungen gab, konnten sie auseinanderlaufen.
 */
export function renderBundleDefinition(entry: BundleEntry): RenderedBundleDefinition {
  return {
    name: entry.name,
    title: entry.title,
    description: entry.description,
    annotations: TOOL_CLASSES[entry.toolClass].annotations,
    inputSchema: buildBundleJsonSchema(entry),
    outputSchema: buildBundleOutputSchema(entry),
  };
}

/** Die Definition als JSON-Text. Grundlage jeder Zeichen- und Tokenmessung der Bündel. */
export function bundleDefinitionJson(entry: BundleEntry): string {
  return JSON.stringify(renderBundleDefinition(entry));
}
