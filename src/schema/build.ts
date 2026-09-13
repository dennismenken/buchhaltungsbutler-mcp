// ToolEntry → Zod-Objekt → JSON Schema. Die einzige Stelle, an der aus einem
// Registereintrag ein Eingabeschema wird (Plan 2 Dateibaum, 4.1, Streitfrage S13).
//
// Drei Dinge passieren hier und nirgends sonst:
//
//   1. Das Werkzeugobjekt entsteht, und zwar strikt: `additionalProperties: false` über
//      {@link strictObject}. Die API ignoriert unbekannte Body-Felder kommentarlos; ohne
//      strenge Validierung wäre ein Tippfehler im Feldnamen ein stiller Datenfehler
//      (Guard 3, Plan 1.4).
//   2. Die Vollständigkeit gegenüber dem Eintrag wird erzwungen. Was der Eintrag behauptet,
//      muss das Schema hergeben — sonst wirft der Bau, und zwar beim Serverstart und nicht
//      beim ersten Werkzeugaufruf.
//   3. Die Querprüfungen Q1 bis Q8 werden angehängt (Plan 4.7).
//
// Was hier ausdrücklich **nicht** geprüft wird, weil es gegen die Spezifikation und nicht
// gegen den Eintrag läuft: die Parameterdeckung P1 bis P3, die Pflichtfelder P5 und die
// Pflichtsätze P8. Das ist Sache der Registerprüfungen in `test/registry/` (Plan 4.4, 9.2).
// Diese Schicht kennt die OpenAPI-Datei nicht und soll sie nicht kennen.

import { z } from "zod";

import type { FieldSpec, ToolEntry } from "../registry/types.js";
import { applyCrossChecks, type CrossCheckTool } from "./cross-checks.js";
import { API_MAX_BATCH, batchLimit } from "./line-items.js";
import { strictObject, stripInternalMeta, unwrapSchema } from "./primitives.js";

export { strictObject } from "./primitives.js";

/** Die Dialektangabe des erzeugten Schemas. */
export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** Das Ergebnis eines Baus. */
export interface BuiltToolSchema {
  /** Das strikte Zod-Objekt mit den Querprüfungen. Damit validiert Guard 3 und Guard 4. */
  readonly zod: z.ZodType;
  /** Dasselbe Schema als JSON Schema Draft 2020-12, für `tools/list`. */
  readonly jsonSchema: Record<string, unknown>;
}

export interface BuildOptions {
  /**
   * Die Mengengrenze `min(50, BB_MCP_MAX_BATCH)` für Q4. Ohne Angabe wird sie aus der
   * eingefrorenen Konfiguration gelesen (Plan 6.4 Punkt 7).
   */
  readonly maxItems?: number;
}

// --- Vollständigkeit gegenüber dem Eintrag -------------------------------------------

/** Der Fehler, mit dem ein widersprüchlicher Registereintrag den Bau abbricht. */
export class SchemaBuildError extends Error {
  readonly tool: string;

  constructor(tool: string, message: string) {
    super(`${tool}: ${message}`);
    this.name = "SchemaBuildError";
    this.tool = tool;
  }
}

/**
 * Spuren der Spezifikation, die in keine ausgelieferte Beschreibung gehören.
 *
 * Die Beschreibungen der Spezifikation enthalten HTML und Entities (`<br/>`, `&ldquo;`).
 * Wer eine davon abschreibt, statt sie auf Deutsch neu zu formulieren, liefert Markup im
 * Werkzeugschema aus (Plan 4.1, `grundlagen.md` 8.26). Die Liste ist absichtlich eng: Ein
 * blanker Kleiner-als-Vergleich wie `date_delivery <= date` ist erlaubt.
 */
const MARKUP_FRAGMENTS = ["<br", "</", "<b>", "<i>", "<strong", "&ldquo;", "&rdquo;", "&nbsp;"];

function assertFieldConsistency(entry: ToolEntry, field: FieldSpec, path: string): void {
  const fail = (message: string): never => {
    throw new SchemaBuildError(entry.name, `Feld ${path}: ${message}`);
  };

  if (field.name.trim() === "") {
    fail("Der Feldname ist leer.");
  }
  if (field.description.trim() === "") {
    fail("Die Beschreibung ist leer. Jedes Feld trägt eine deutsche Beschreibung (Plan 4.9).");
  }
  for (const fragment of MARKUP_FRAGMENTS) {
    if (field.description.includes(fragment)) {
      fail(
        `Die Beschreibung enthält "${fragment}". Beschreibungen sind deutscher Fließtext ` +
          "ohne Markup; der HTML-Rest der Spezifikation gehört nicht in das Schema.",
      );
    }
  }
  if (field.requiredReason !== undefined && field.requiredReason.trim() === "") {
    fail("requiredReason ist gesetzt, aber leer. Eine Verschärfung nennt ihre Belegstelle.");
  }

  const unwrapped = unwrapSchema(field.schema);
  if (unwrapped === undefined) {
    fail("Das Schemafragment ist kein Zod-Schema.");
  }

  // Eine Hülle .optional() am Fragment und required: true im Eintrag widersprechen sich.
  // Welche der beiden Angaben dann gälte, wäre nicht mehr abzulesen.
  if (field.required && field.schema instanceof z.ZodOptional) {
    fail("required: true, aber das Fragment ist .optional(). Die beiden widersprechen sich.");
  }

  switch (field.source) {
    case "server":
      if (field.apiNames.length !== 0) {
        fail('source: "server" verlangt ein leeres apiNames; der Wert verlässt den Prozess nie.');
      }
      if (!entry.serverOnlyFields.includes(field.name)) {
        fail('source: "server", aber der Name fehlt in serverOnlyFields (Plan 4.3).');
      }
      break;
    case "path":
      if (field.apiNames.length !== 0) {
        fail(
          'source: "path" verlangt ein leeres apiNames. Die Spezifikation führt den ' +
            "Identifikator dieser vier Endpunkte überhaupt nicht (Plan 4.6).",
        );
      }
      if (!("template" in entry.path)) {
        fail('source: "path", aber der Eintrag trägt einen literalen Pfad ohne Platzhalter.');
      } else if (!entry.path.params.includes(field.name)) {
        fail(`source: "path", aber ${field.name} steht nicht in path.params.`);
      }
      break;
    case "body":
      if (field.apiNames.length === 0) {
        fail(
          'source: "body" verlangt mindestens einen Eintrag in apiNames. Ein Feld ohne ' +
            "API-Namen wäre im Deckungstest unsichtbar (Plan 4.4 Punkt 3).",
        );
      }
      break;
  }

  if (field.transform === "parallel-arrays" || field.transform === "object-list") {
    if (field.itemFields === undefined || field.itemFields.length === 0) {
      fail(`transform: "${field.transform}" verlangt itemFields.`);
    }
    const inner = unwrapSchema(field.schema);
    if (!(inner instanceof z.ZodArray)) {
      fail(`transform: "${field.transform}" verlangt ein Arrayschema.`);
    }
  }

  for (const itemField of field.itemFields ?? []) {
    assertItemFieldConsistency(entry, itemField, `${path}.${itemField.name}`);
  }
}

/**
 * Ein Feld eines Stapelelements oder einer Position.
 *
 * Dort gelten zwei Regeln nicht: `apiNames` zielt auf die Eigenschaften der
 * Elementdefinition beziehungsweise auf die parallelen Array-Parameter und nicht auf
 * Body-Parameter (Plan 2.1, 4.4 Punkt 3), und `source` ist dort immer `"body"`.
 */
function assertItemFieldConsistency(entry: ToolEntry, field: FieldSpec, path: string): void {
  if (field.source !== "body") {
    throw new SchemaBuildError(
      entry.name,
      `Feld ${path}: Ein Feld innerhalb eines Behälters trägt immer source: "body".`,
    );
  }
  if (field.description.trim() === "") {
    throw new SchemaBuildError(entry.name, `Feld ${path}: Die Beschreibung ist leer.`);
  }
  for (const itemField of field.itemFields ?? []) {
    assertItemFieldConsistency(entry, itemField, `${path}.${itemField.name}`);
  }
}

function assertEntryConsistency(entry: ToolEntry): void {
  const fail = (message: string): never => {
    throw new SchemaBuildError(entry.name, message);
  };

  // Eine leere Feldliste ist ausdrücklich erlaubt und kein Fehler: Vier Endpunkte führen
  // laut Spezifikation ausschließlich api_key, und dieser wird nie ein Feld (Plan 4.3).
  // Ein Werkzeug ohne jedes Feld liefert ein leeres striktes Objekt, und das ist richtig.
  const names = new Set<string>();
  for (const field of entry.fields) {
    if (names.has(field.name)) {
      fail(`Das Feld ${field.name} steht zweimal in fields. Jedes Feld erscheint genau einmal.`);
    }
    names.add(field.name);
  }

  // serverOnlyFields und die Felder mit source: "server" sind dieselbe Menge. Sonst stünde
  // ein serverseitiges Feld im Body oder ein Body-Feld in der Liste der serverseitigen.
  for (const name of entry.serverOnlyFields) {
    const field = entry.fields.find((candidate) => candidate.name === name);
    if (field === undefined) {
      fail(`serverOnlyFields nennt ${name}, aber fields führt das Feld nicht.`);
    } else if (field.source !== "server") {
      fail(`serverOnlyFields nennt ${name}, aber das Feld trägt source: "${field.source}".`);
    }
  }

  // Jeder Platzhalter des Pfades braucht sein Feld, sonst entstünde ein Pfad mit einem
  // nicht ersetzten Platzhalter (Plan 4.6 Regel 3).
  if ("template" in entry.path) {
    for (const param of entry.path.params) {
      const field = entry.fields.find((candidate) => candidate.name === param);
      if (field === undefined) {
        fail(`path.params nennt ${param}, aber fields führt kein solches Feld.`);
      } else if (field.source !== "path") {
        fail(`${param} ist ein Pfadsegment, trägt aber source: "${field.source}".`);
      } else if (!field.required) {
        fail(`${param} ist ein Pfadsegment und deshalb immer Pflicht.`);
      }
    }
  } else {
    const pathField = entry.fields.find((candidate) => candidate.source === "path");
    if (pathField !== undefined) {
      fail(
        `${pathField.name} trägt source: "path", aber der Eintrag führt einen literalen Pfad. ` +
          "Die übrigen 50 Endpunkte können bauartbedingt keinen interpolierten Pfad erzeugen.",
      );
    }
  }

  for (const field of entry.fields) {
    assertFieldConsistency(entry, field, field.name);
  }
}

// --- Bau -----------------------------------------------------------------------------

/** Der Spezifikationspfad eines Eintrags. Nachgeschlagen wird immer damit (Plan 4.6). */
export function specPathOf(entry: ToolEntry): string {
  return "template" in entry.path ? entry.path.specPath : entry.path.literal;
}

/**
 * Das Zod-Objekt eines Eintrags: strikt, mit `.optional()` nach `required` und mit den
 * Querprüfungen aus `crossChecks`.
 *
 * Die Optionalität setzt diese Funktion und nicht der Registereintrag. Damit gibt es genau
 * eine Stelle, an der aus `required: false` ein optionales Feld wird, und `required` bleibt
 * die einzige Wahrheit darüber — auch für den Deckungstest P5, der dasselbe Feld gegen die
 * Spezifikation hält.
 */
export function buildZodSchema(entry: ToolEntry, options: BuildOptions = {}): z.ZodType {
  assertEntryConsistency(entry);

  const shape: Record<string, z.ZodType> = {};
  for (const field of entry.fields) {
    // Die Beschreibung des Eintrags gewinnt über die des Bausteins. Bei einer
    // Positionsliste ist das eine Falle: Der Deklarationssatz aus 4.8 steckt in der
    // Beschreibung des Bausteins, und wer ihn hier überschreibt, liefert eine Umformung
    // aus, die nirgends deklariert ist. Der Registereintrag übernimmt deshalb entweder die
    // Beschreibung des Bausteins wörtlich oder hängt seinen Text über
    // `line-items.ts#declarationSentence` an. P8 prüft den Satz an allen sieben Werkzeugen.
    const described =
      field.schema.description === field.description
        ? field.schema
        : field.schema.describe(field.description);
    shape[field.name] = field.required ? described : described.optional();
  }

  // Die Mengengrenze liest ausschließlich Q4. Sie wird deshalb nur dann aus der
  // Konfiguration geholt, wenn der Eintrag Q4 führt: Ein Werkzeug ohne Mengenfeld soll
  // kein Schema bauen können, das eine aufgelöste Konfiguration voraussetzt.
  const needsMaxItems = entry.crossChecks.includes("Q4");
  const tool: CrossCheckTool = {
    toolName: entry.name,
    specPath: specPathOf(entry),
    maxItems: needsMaxItems ? batchLimit(options.maxItems) : (options.maxItems ?? API_MAX_BATCH),
  };
  return applyCrossChecks(strictObject(shape), entry.crossChecks, tool);
}

/**
 * Erzeugt das JSON Schema Draft 2020-12 zu einem Zod-Schema.
 *
 * `io: "input"` ist Pflicht: Ein Feld mit `.default()` ist in der **Ausgabe** immer
 * vorhanden und stünde sonst in `required`, obwohl der Aufrufer es weglassen darf.
 *
 * `unrepresentable: "any"` wird ausdrücklich **nicht** gesetzt: Ein Fragment, das sich nicht
 * als JSON Schema ausdrücken lässt, soll den Bau abbrechen und nicht als `{}` im Schema
 * landen — ein leeres Schema akzeptiert jeden Wert und hebelte Guard 3 aus.
 *
 * Die internen Markierungen aus `primitives.ts` werden dabei entfernt; sie dienen Guard 5
 * und haben im ausgelieferten Schema nichts zu suchen.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json: unknown = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    reused: "inline",
    cycles: "throw",
    override: (ctx) => {
      stripInternalMeta(ctx.jsonSchema);
    },
  });
  if (typeof json !== "object" || json === null) {
    throw new Error("z.toJSONSchema hat kein Objekt geliefert.");
  }
  const result = json as Record<string, unknown>;
  if (result["type"] !== "object") {
    throw new Error(
      `Das Eingabeschema eines Werkzeugs ist immer ein Objekt, geliefert wurde ${String(result["type"])}.`,
    );
  }
  if (result["additionalProperties"] !== false) {
    throw new Error(
      "Das erzeugte JSON Schema trägt kein additionalProperties: false. Guard 3 verlangt " +
        "strenge Validierung (Plan 1.4); ohne sie wäre ein Tippfehler im Feldnamen ein " +
        "stiller Datenfehler.",
    );
  }
  return result;
}

/**
 * Der eine Weg von einem Registereintrag zum Eingabeschema: Zod-Objekt und JSON Schema in
 * einem Aufruf, aus derselben Quelle erzeugt.
 *
 * Beide zusammen zurückzugeben ist Absicht. Würden sie an zwei Stellen gebaut, könnten sie
 * auseinanderlaufen, und dann validierte der Server etwas anderes, als er in `tools/list`
 * angekündigt hat.
 */
export function buildToolSchema(entry: ToolEntry, options: BuildOptions = {}): BuiltToolSchema {
  const zodSchema = buildZodSchema(entry, options);
  return { zod: zodSchema, jsonSchema: toJsonSchema(zodSchema) };
}
