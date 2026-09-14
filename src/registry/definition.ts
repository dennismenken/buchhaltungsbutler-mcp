// Die Werkzeugdefinition, **wie der Client sie in `tools/list` bekommt** — an genau einer
// Stelle.
//
// Vorher gab es drei Nachbildungen davon: eine in `scripts/measure-tokens.ts`, eine in
// `test/helpers/registry-fixtures.ts` und eine in `src/cli/doctor.ts`. Die ersten beiden
// stimmten überein, die dritte zählte nur Name, Titel, Beschreibung und die Feldtexte und
// ließ die Schemarümpfe und das gesamte `outputSchema` weg. `doctor` nannte deshalb 104.779
// Zeichen und rund 26.195 Token, während der Client nach der Messung vom 2026-09-12
// 197.528 Zeichen und 48.305 Token bekam — die Zeile, an der ein Nutzer nachsieht, warum sein
// Kontextfenster voll ist, unterschlug 46 Prozent. Den jeweils aktuellen Stand nennen
// `MEASURED_TOOL_DEFINITION_CHARS` und `MEASURED_TOOL_DEFINITION_TOKENS` weiter unten in dieser
// Datei; beide werden in `test/unit/cli-doctor.test.ts` bei jedem Lauf nachgerechnet und können
// deshalb nicht unbemerkt veralten. Drei Nachbildungen sind zwei zu viel; seither ist diese
// Datei die Grundlage aller drei Messstellen.
//
// **Gebaut wird aus denselben Bausteinen, die `server/register-tools.ts` an `registerTool`
// übergibt**: dem JSON Schema aus `schema/build.ts`, dem offenen Ausgabeschema aus
// `response/output-schema.ts` und den Annotationen der Klasse aus `registry/classes.ts`. Die
// Schlüsselreihenfolge des JSON ist Teil der Messgröße und wird nicht umgestellt.

import { buildOutputSchema } from "../response/output-schema.js";
import { buildToolSchema } from "../schema/build.js";
import { API_MAX_BATCH } from "../schema/line-items.js";
import { TOOL_CLASSES, type ToolClassAnnotations } from "./classes.js";
import type { ToolEntry } from "./types.js";

/** Die sechs Bestandteile einer Werkzeugdefinition, in der Reihenfolge des gesendeten JSON. */
export interface RenderedToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly annotations: ToolClassAnnotations;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
}

/**
 * Die Definition eines Eintrags, wie `tools/list` sie ausliefert.
 *
 * `maxItems` wird ausdrücklich auf das API-Maximum gesetzt und nicht aus der Konfiguration
 * geholt: Gemessen wird der Auslieferungszustand und nicht die Einstellung dessen, der gerade
 * `doctor` aufruft. Zur Laufzeit wirkt die konfigurierte Grenze über Q4 und Guard 5;
 * sie verschiebt die Zeichenzahl um wenige Stellen und würde die Zahl nur
 * unvergleichbar machen.
 */
export function renderToolDefinition(entry: ToolEntry): RenderedToolDefinition {
  return {
    name: entry.name,
    title: entry.title,
    description: entry.description,
    annotations: TOOL_CLASSES[entry.toolClass].annotations,
    inputSchema: buildToolSchema(entry, { maxItems: API_MAX_BATCH }).jsonSchema,
    outputSchema: buildOutputSchema(entry),
  };
}

/** Die Definition als JSON-Text. Grundlage jeder Zeichen- und Tokenmessung. */
export function toolDefinitionJson(entry: ToolEntry): string {
  return JSON.stringify(renderToolDefinition(entry));
}

/** Die Zeichenzahl der übergebenen Definitionen zusammen, vollständig serialisiert. */
export function measureToolDefinitionChars(entries: readonly ToolEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    total += toolDefinitionJson(entry).length;
  }
  return total;
}

/**
 * Die Zeichenzahl der 54 ausgelieferten Definitionen, wie sie am 2026-09-13 gemessen wurde.
 *
 * Eingecheckt, damit `doctor` erkennt, ob die Tokenmessung daneben noch zu diesem
 * Registerstand gehört. Die Zahl wird nicht von Hand gepflegt: `test/unit/cli-doctor.test.ts`
 * rechnet sie bei jedem Testlauf nach und schlägt fehl, sobald sich eine Beschreibung oder
 * ein Schema ändert.
 */
export const MEASURED_TOOL_DEFINITION_CHARS = 200_265;

/**
 * Die Tokenzahl derselben 54 Definitionen, **gemessen** mit `gpt-tokenizer@4.0.0` in der
 * Kodierung `o200k_base`, nicht über `CHARS_PER_TOKEN` geschätzt.
 *
 * Sie steht hier eingecheckt, weil ein Tokenizer im ausgelieferten Paket eine vierte
 * Laufzeitabhängigkeit wäre: Die Definitionen liegen zum
 * Auslieferungszeitpunkt fest, also ist ihre Tokenzahl eine Tatsache dieses Stands und keine
 * Größe, die jeder Aufruf neu ausrechnen müsste. Dieselbe Zahl nennen
 * `docs/entwicklung/tokenbudget.md`, die Meldung von P11, `CHANGELOG.md` und
 * Abschnitt 17 der README.
 *
 * Nachgerechnet wird sie in `test/unit/cli-doctor.test.ts` mit dem echten Tokenizer; ein
 * Auseinanderlaufen von Messung, Ausgabe und Dokumentation fällt dort auf und nicht beim
 * Nutzer.
 */
export const MEASURED_TOOL_DEFINITION_TOKENS = 48_946;
