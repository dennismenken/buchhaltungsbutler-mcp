// Der Block `bundle`, den jede Bündelantwort trägt — immer, mit denselben Schlüsseln (3).
//
// **Leitsatz: Ein Bündel gibt niemals eine Teilmenge als Ganzes aus.** Dieser Block setzt ihn
// durch: `complete` und `stopped_because` sind Pflicht, `gaps` ist bei Vollständigkeit ein
// leeres Array und niemals abwesend, und `api_calls` neben `api_calls_limit` macht sichtbar,
// was der Aufruf am Minutenkontingent verbraucht hat. Feldbeschreibungen entfallen wie bei den
// 54 Werkzeugen (S6).

/** Die Gründe, aus denen ein Bündel aufhört. Wortgleich mit {@link BundleStopReason}. */
const STOP_REASONS = [
  "page_limit",
  "row_limit",
  "rate_limit",
  "response_size",
  "time_limit",
  "error",
] as const;

/** Eine Zeile der Schrittliste: ein Teilaufruf mit seinem Ausgang. */
const STEP_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    no: { type: "integer" },
    endpoint: { type: "string" },
    state: { type: "string", enum: ["ok", "failed", "skipped"] },
    rows: { type: ["integer", "null"] },
    duration_ms: { type: "integer" },
    error: { type: ["string", "null"] },
  },
  required: ["no", "endpoint", "state"],
  additionalProperties: true,
});

/** Eine Lücke: was fehlt, warum, und der Einzelaufruf, der sie schließt (R7). */
const GAP_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    what: { type: "string" },
    why: { type: "string" },
    next_step: { type: "string" },
  },
  required: ["what", "why", "next_step"],
  additionalProperties: true,
});

/** Der Pflichtblock aus Abschnitt 3 der Bauvorlage. */
export const BUNDLE_BLOCK_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    complete: { type: "boolean" },
    stopped_because: { type: ["string", "null"], enum: [...STOP_REASONS, null] },
    steps: { type: "array", items: STEP_SCHEMA },
    api_calls: { type: "integer" },
    api_calls_limit: { type: "integer" },
    gaps: { type: "array", items: GAP_SCHEMA },
    written: { type: "string" },
    continuation: { type: ["object", "null"], additionalProperties: true },
  },
  required: [
    "complete",
    "stopped_because",
    "steps",
    "api_calls",
    "api_calls_limit",
    "gaps",
    "written",
    "continuation",
  ],
  additionalProperties: true,
});

/**
 * Ein Bereichsblock, wie ihn `bb_masterdata_search` je Bereich ausgibt.
 *
 * `hits` ist bewusst eine Liste offener Objekte: Die Zeilen sind die `concise`-Projektion des
 * jeweiligen Endpunktwerkzeugs, und die Feldliste ein zweites Mal auszuschreiben wäre eine
 * zweite Quelle der Wahrheit — und teurer Definitionstext obendrein. `null` heißt nicht
 * ermittelt, das leere Array heißt nachweislich keine (R5).
 */
export function areaBlockSchema(): unknown {
  return {
    type: ["object", "null"],
    // Nur die vier Felder, auf die sich ein Modell verlassen können MUSS. `matched`,
    // `stopped_because` und `summary` stehen in der Antwort und sind durch
    // `additionalProperties: true` gedeckt; sie hier auszuschreiben kostete in fünf Blöcken
    // je Aufruf Definitionstoken, ohne eine Zusage hinzuzufügen.
    properties: {
      rows_read: { type: "integer" },
      complete: { type: "boolean" },
      hits_state: { type: "string", enum: ["listed", "summarized", "error"] },
      hits: { type: ["array", "null"], items: { type: "object", additionalProperties: true } },
    },
    required: ["rows_read", "complete", "hits_state", "hits"],
    additionalProperties: true,
  };
}

/** Eine Zeilenliste mit offenen Datensätzen, wie die Bündel sie ausgeben. */
export function rowsSchema(): unknown {
  return {
    type: ["array", "null"],
    items: { type: "object", additionalProperties: true },
  };
}
