// Guard 5: Betrags- und Stapelgrenze.
//
// Dieses Modul führt **keine Feldliste**, und das ist seine wichtigste Eigenschaft. Beide
// Grenzen werden über die Struktur des Registereintrags gefunden:
//
//   Mengengrenze  jedes Feld mit `itemFields` — die Behälter der acht Stapelendpunkte und die
//                 Positionslisten `positions` und `items` — und zusätzlich jede geschachtelte
//                 Positionsliste innerhalb eines Stapelelements (Werkzeuge 22 und 24). Beide
//                 Ebenen werden getrennt geprüft, es wird nichts aufsummiert.
//   Betragsgrenze jedes Feld, dessen Schemabaustein die Markierung `amount` trägt, die
//                 `vocab.ts#amountIn()` setzt (`schema/primitives.ts`). Skalar wie
//                 je Position.
//
// Eine zweite, handgepflegte Namensliste gäbe es sonst doppelt: einmal im Register und einmal
// hier. Sie liefe auseinander, und zwar unbemerkt, weil ein Werkzeug mit einem übersehenen
// Betragsfeld nicht scheitert, sondern die Grenze stillschweigend nicht prüft.
//
// Die Grenzen werden hier **erneut** geprüft, obwohl `maxItems` schon im Schema steht
// und Q4 dieselbe Menge prüft: Dieser Guard wertet ohnehin
// `BB_MCP_MAX_AMOUNT` aus, und ein Abbruch an dieser Stelle trägt den Zustandssatz 1.
// Doppelt geprüft ist billiger als die Frage, welche der beiden Stellen im Zweifel gilt.

import type { ResolvedConfig } from "../config/resolve.js";
import { amountToCents, compareCents, formatCents } from "../mapping/decimal.js";
import { elementLabel } from "../errors/path-label.js";
import { renderRejectedBeforeRequest } from "../errors/render.js";
import { isAmountSchema } from "../schema/primitives.js";
import { batchLimit } from "../schema/line-items.js";
import type { FieldSpec, ToolEntry } from "../registry/types.js";

/** Die beiden Klassen mit Betragsfeldern, für die `BB_MCP_MAX_AMOUNT` gilt. */
const AMOUNT_LIMIT_CLASSES: readonly ToolEntry["toolClass"][] = ["A", "B"];

/** Eine gerissene Grenze, positionsgenau. */
export interface LimitViolation {
  readonly kind: "batch" | "amount";
  /**
   * Der Ort im Aufruf, in der Schreibweise aus `errors/path-label.ts`: `positions`,
   * `receipts (Position 2)`, `receipts (Position 2).positions (Position 3).amount`. Die
   * Klammernotation `receipts[2]` gibt es hier nicht: Sie zählte ab 1 und meinte damit für
   * jeden JSON-Leser das dritte Element.
   */
  readonly location: string;
  /** Der gesehene Wert: Länge der Liste beziehungsweise Betrag. */
  readonly seen: string;
  /** Die Grenze, gegen die geprüft wurde. */
  readonly limit: string;
}

export interface LimitCheckResult {
  readonly violations: readonly LimitViolation[];
  /** Die wirksame Mengengrenze dieses Aufrufs, `min(50, BB_MCP_MAX_BATCH)`. */
  readonly maxItems: number;
  /** Die Betragsgrenze in Ganzzahl-Cent, `null` wenn abgeschaltet. */
  readonly maxAmountCents: number | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Prüft eine Ebene: erst die Mengenfelder, dann die Betragsfelder, dann absteigend in die
 * Elemente jedes Mengenfeldes.
 *
 * Die Rekursion ist bewusst nicht auf zwei Ebenen begrenzt, obwohl die Spezifikation heute nur
 * zwei kennt: Eine Tiefenschranke wäre eine zweite Wahrheit über den Aufbau der Einträge, und
 * sie wäre falsch, sobald ein Endpunkt eine dritte Ebene bekommt.
 */
function inspectLevel(
  fields: readonly FieldSpec[],
  values: Readonly<Record<string, unknown>>,
  prefix: string,
  limits: { readonly maxItems: number; readonly maxAmountCents: number | null },
  out: LimitViolation[],
): void {
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined) {
      continue;
    }
    const location = `${prefix}${field.name}`;

    if (field.itemFields !== undefined && Array.isArray(value)) {
      if (value.length > limits.maxItems) {
        out.push({
          kind: "batch",
          location,
          seen: `${String(value.length)} Einträge`,
          limit: `${String(limits.maxItems)} Einträge`,
        });
      }
      // Die Elemente werden auch dann durchgegangen, wenn die Länge schon gerissen ist: Der
      // Agent soll in einem Durchgang alles sehen, was er ändern muss, und nicht nach jeder
      // Korrektur eine neue Meldung bekommen.
      value.forEach((element, index) => {
        if (isPlainObject(element)) {
          inspectLevel(
            field.itemFields ?? [],
            element,
            `${elementLabel(location, index)}.`,
            limits,
            out,
          );
        }
      });
      continue;
    }

    if (limits.maxAmountCents !== null && isAmountSchema(field.schema)) {
      checkAmount(value, location, limits.maxAmountCents, out);
    }
  }
}

function checkAmount(
  value: unknown,
  location: string,
  maxAmountCents: number,
  out: LimitViolation[],
): void {
  // Beträge sind im Werkzeugschema Zeichenketten. Ein anderer Typ hat Guard 3
  // nicht passiert und wird hier nicht nachträglich gedeutet.
  if (typeof value !== "string") {
    return;
  }
  const cents = amountToCents(value);
  if (cents === null) {
    return;
  }
  // Verglichen wird der Absolutwert: Eine Gutschrift über -10.000,00 ist derselbe Vorgang in
  // derselben Größe wie eine Rechnung über 10.000,00, und eine Grenze, die nur eine Richtung
  // kennt, schützt die andere nicht.
  if (compareCents(Math.abs(cents), maxAmountCents) > 0) {
    out.push({
      kind: "amount",
      location,
      seen: formatCents(cents),
      limit: formatCents(maxAmountCents),
    });
  }
}

/**
 * Wertet beide Grenzen aus, ohne den Aufruf zu beurteilen.
 *
 * Getrennt von {@link checkLimits}, damit ein Test die gefundenen Verstöße einzeln prüfen kann
 * statt über einen zusammengesetzten Text.
 *
 * @param maxItemsOverride Nur für Tests. Ohne Angabe gilt `min(50, BB_MCP_MAX_BATCH)`.
 */
export function inspectLimits(
  entry: ToolEntry,
  args: Readonly<Record<string, unknown>>,
  config: ResolvedConfig,
  maxItemsOverride?: number,
): LimitCheckResult {
  const maxItems = batchLimit(maxItemsOverride ?? config.maxBatch);
  // Die Betragsgrenze gilt ausschließlich für die Klassen A und B. Ein lesendes
  // Werkzeug mit einem Betragsfilter soll sie nicht spüren: Es ändert nichts, und eine
  // abgelehnte Suche nach einem großen Betrag wäre eine Sperre ohne Schutzwirkung.
  const maxAmountCents = AMOUNT_LIMIT_CLASSES.includes(entry.toolClass)
    ? config.maxAmountCents
    : null;

  const violations: LimitViolation[] = [];
  inspectLevel(entry.fields, args, "", { maxItems, maxAmountCents }, violations);
  return { violations, maxItems, maxAmountCents };
}

/** Der Vierblocktext zu einem Satz Verstöße. */
function formatRefusal(entry: ToolEntry, result: LimitCheckResult): string {
  const batch = result.violations.filter((violation) => violation.kind === "batch");
  const amount = result.violations.filter((violation) => violation.kind === "amount");

  const was =
    batch.length > 0 && amount.length > 0
      ? "Der Aufruf reißt die Mengengrenze und die Betragsgrenze dieses Servers."
      : batch.length > 0
        ? "Der Aufruf reißt die Mengengrenze dieses Servers."
        : "Der Aufruf reißt die Betragsgrenze dieses Servers.";

  const warum = result.violations
    .map((violation) =>
      violation.kind === "batch"
        ? `${violation.location} hat ${violation.seen}, erlaubt sind ${violation.limit}.`
        : `${violation.location} trägt ${violation.seen}, erlaubt sind höchstens ${violation.limit}.`,
    )
    .join(" ");

  const wie: string[] = [];
  if (batch.length > 0) {
    wie.push(
      `Den Aufruf in mehrere Aufrufe mit höchstens ${String(result.maxItems)} Einträgen je Liste aufteilen. ` +
        "Die Grenze gilt je Liste und je Ebene; es wird nichts aufsummiert. " +
        "Sie stammt aus BB_MCP_MAX_BATCH und dem Maximum 50 der API, der kleinere Wert gilt.",
    );
  }
  if (amount.length > 0) {
    wie.push(
      "Den Betrag prüfen. Ist er richtig, muss der Betreiber BB_MCP_MAX_AMOUNT anheben oder " +
        "entfernen und den Server neu starten; aus einem Gespräch heraus lässt sich die " +
        "Grenze nicht aufheben.",
    );
  }

  return renderRejectedBeforeRequest({
    toolName: entry.name,
    was,
    warum,
    wie: wie.join(" "),
  }).text;
}

/**
 * Prüft Mengen- und Betragsgrenze.
 *
 * @returns Die Absage im Vierblockaufbau mit dem Zustandssatz 1, oder `undefined`,
 *          wenn der Aufruf weiterlaufen darf.
 */
export function checkLimits(
  entry: ToolEntry,
  args: Readonly<Record<string, unknown>>,
  config: ResolvedConfig,
  maxItemsOverride?: number,
): string | undefined {
  const result = inspectLimits(entry, args, config, maxItemsOverride);
  return result.violations.length === 0 ? undefined : formatRefusal(entry, result);
}
