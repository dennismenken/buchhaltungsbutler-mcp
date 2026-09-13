// Das Verzeichnis der Bündelwerkzeuge (Gruppe `bundles`, abschaltbar über `BB_MCP_TOOL_GROUPS`).
//
// Anders als das Register der 54 Endpunktwerkzeuge entsteht diese Liste nicht durch einen
// Generator: Ein Bündel trägt seinen Ablauf als Code, es gibt also ohnehin eine Datei je
// Bündel mit einer benannten Ausfuhr, und der Generator in `scripts/gen-registry-index.ts`
// erwartet in `src/registry/tools/` ausschließlich `ToolEntry`. Die Liste ist kurz und
// abschließend; sie wächst nur mit einer Entscheidung des Projektinhabers.
//
// Die Reihenfolge ist zugleich die Registrierreihenfolge.

import { bb_assignments_get } from "./tools/bb_assignments_get.js";
import { bb_balances_get } from "./tools/bb_balances_get.js";
import { bb_masterdata_search } from "./tools/bb_masterdata_search.js";
import { bb_records_collect } from "./tools/bb_records_collect.js";
import { bb_reports_run } from "./tools/bb_reports_run.js";
import type { BundleEntry } from "./types.js";

export const BUNDLE_ENTRIES: readonly BundleEntry[] = Object.freeze([
  bb_masterdata_search,
  bb_records_collect,
  bb_assignments_get,
  bb_reports_run,
  bb_balances_get,
]);

/** Nachschlagen nach Werkzeugname. */
export const BUNDLE_BY_NAME: ReadonlyMap<string, BundleEntry> = new Map(
  BUNDLE_ENTRIES.map((entry): [string, BundleEntry] => [entry.name, entry]),
);

export {
  bb_assignments_get,
  bb_balances_get,
  bb_masterdata_search,
  bb_records_collect,
  bb_reports_run,
};
