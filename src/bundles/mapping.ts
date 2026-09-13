// Die Antwort eines Teilaufrufs, aufbereitet mit derselben Schicht wie die der 54
// Endpunktwerkzeuge.
//
// Ein Bündel baut seine Normalisierung nicht nach: `mapping/response.ts` typisiert die Felder
// des Antwortvertrags, erzeugt die Ganzzahl-Cent-Form, normalisiert "0"/"1" zu Booleans, meldet
// Vertragsverletzungen und projiziert. Der Umweg über einen zusammengesetzten `ToolEntry` ist
// die schmalste Stelle: `mapResponse` liest daraus nur `name`, `path`, `responseContract`,
// `concise` und `shape` — genau die fünf Angaben, die ein {@link BundleStep} selbst trägt.

import type { SuccessEnvelope } from "../http/envelope.js";
import type { AggregatedWarning } from "../mapping/contract-violation.js";
import { mapResponse, type MappedResponse, type Projection } from "../mapping/response.js";
import { BUNDLE_TOOL_GROUP } from "../registry/groups.js";
import type { ToolEntry } from "../registry/types.js";
import type { BundleStep } from "./types.js";

/**
 * Der Eintrag, mit dem `mapResponse` arbeitet. Er verlässt diese Datei nicht und wird nirgends
 * registriert; er ist die Übersetzung eines Schrittes in die Form, die die Abbildungsschicht
 * erwartet.
 */
function entryForStep(bundleName: string, step: BundleStep): ToolEntry {
  return {
    name: bundleName,
    title: "",
    group: BUNDLE_TOOL_GROUP,
    path: step.path,
    effect: "read",
    toolClass: step.toolClass,
    tier: 1,
    description: "",
    fields: [],
    serverOnlyFields: [],
    omitted: [],
    responseContract: step.responseContract,
    shape: step.shape,
    concise: [...step.concise],
    bucket: step.bucket,
    timeoutTier: step.timeoutTier,
    crossChecks: [],
    invalidatesCache: [],
  };
}

/** Die normalisierte und projizierte Antwort eines Schrittes. */
export function mapStepResponse(
  bundleName: string,
  step: BundleStep,
  envelope: SuccessEnvelope,
  projection: Projection,
): MappedResponse {
  return mapResponse(entryForStep(bundleName, step), envelope, { projection });
}

/** Die Zeilen eines Listenschrittes, normalisiert und projiziert. */
export function mapStepRows(
  bundleName: string,
  step: BundleStep,
  envelope: SuccessEnvelope,
  projection: Projection,
): readonly Record<string, unknown>[] {
  return mapStepResponse(bundleName, step, envelope, projection).items;
}

/** Die Rohzeilen eines Listenschrittes, ohne Projektion. Für serverseitiges Filtern. */
export function rawRows(envelope: SuccessEnvelope): readonly Record<string, unknown>[] {
  if (envelope.shape !== "list") {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const row of envelope.data) {
    if (typeof row === "object" && row !== null && !Array.isArray(row)) {
      rows.push(row as Record<string, unknown>);
    }
  }
  return rows;
}

/**
 * Projiziert bereits gesammelte Rohzeilen, ohne einen weiteren Request.
 *
 * Die Zeilen laufen durch dieselbe Normalisierung wie eine frisch geholte Seite: Der Umschlag
 * wird dafür aus den Zeilen zusammengesetzt. Damit tragen die Zeilen einer Bündelantwort
 * dieselben Feldnamen, dieselbe Ganzzahl-Cent-Form und dieselbe Projektion wie die des
 * Endpunktwerkzeugs, das dieselbe Frage einzeln beantwortet.
 */
export function projectRows(
  bundleName: string,
  step: BundleStep,
  rows: readonly Record<string, unknown>[],
  projection: Projection,
): ProjectedRows {
  const envelope: SuccessEnvelope = {
    shape: "list",
    status: 200,
    message: null,
    body: {},
    warnings: [],
    rows: rows.length,
    data: rows,
  };
  const mapped = mapStepResponse(bundleName, step, envelope, projection);
  return { rows: mapped.items, warnings: mapped.warnings };
}

/** Projizierte Zeilen samt den Vertragsverletzungen, die dabei aufgefallen sind. */
export interface ProjectedRows {
  readonly rows: readonly Record<string, unknown>[];
  readonly warnings: readonly AggregatedWarning[];
}
