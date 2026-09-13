// Guard 6: der Duplikatshinweis. **Im Auslieferungszustand abgeschaltet**
// (`BB_MCP_DUPLICATE_CHECK=off`).
//
// Vier Eigenschaften sind verbindlich und alle vier stehen als Code in diesem Modul:
//
//  1. **Er blockiert nie.** Ein Treffer wandert in die Antwort, der Aufruf läuft weiter. Eine
//     serverseitige Sperre, die der Nutzer aus dem Gespräch heraus nicht aufheben kann,
//     widerspricht der Festlegung, dass die Freigabe beim Client liegt und nicht im Server
//     (`tool-design.md` 9.4); zwei fachlich gleiche Belege am selben Tag sind zudem ein
//     zulässiger Fall (`tool-design.md` 9.6 Punkt 4).
//  2. **Er läuft bei Stapelwerkzeugen genau einmal für den ganzen Stapel** (`perBatch: true`),
//     nicht je Element. Ein Stapel mit 50 Belegen darf nicht 50 Zusatzaufrufe auslösen.
//  3. **Ist der Schalter aus, geht kein Zusatzaufruf hinaus.** Dann bleibt ein Werkzeugaufruf
//     genau ein API-Aufruf.
//  4. **Er scheitert nie laut.** Jeder Fehler der Nachschlage-Abfrage endet als Zeile auf
//     stderr und nicht als Fehler des eigentlichen Aufrufs: Der Hinweis ist eine Zugabe, und
//     eine Zugabe darf den Vorgang nicht kippen.
//
// Der Preis ist benannt und steht im Zustandsblock der `instructions`: Bei
// `on` verbraucht jeder anlegende Aufruf ein zweites Token aus dem Minutenkontingent des
// Mandanten.

import type { ResolvedConfig } from "../config/resolve.js";
import { amountToCents } from "../mapping/decimal.js";
import { logDebug } from "../logging/stderr.js";
import type { DuplicateSpec, FieldSpec, ToolEntry } from "../registry/types.js";

/**
 * Die Nachschlage-Abfrage. Sie wird von `server/register-tools.ts` gestellt, damit es für den
 * Weg zur API genau eine Stelle gibt und dieser Guard keinen zweiten Ausführungspfad aufmacht.
 *
 * @returns Die Zeilen der Antwort des lesenden Werkzeugs.
 */
export type DuplicateLookup = (
  readEntry: ToolEntry,
  args: Readonly<Record<string, unknown>>,
) => Promise<readonly unknown[]>;

export interface DuplicateCheckInput {
  readonly entry: ToolEntry;
  /** Die geprüften Argumente des anlegenden Aufrufs. */
  readonly args: Readonly<Record<string, unknown>>;
  readonly config: ResolvedConfig;
  /** Nachschlagen des lesenden Werkzeugs im Register. */
  readonly resolveEntry: (name: string) => ToolEntry | undefined;
  readonly lookup: DuplicateLookup;
}

/** Ein fachlicher Schlüssel: die Werte der `keyFields` eines Datensatzes des Aufrufs. */
type KeyTuple = ReadonlyMap<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Das erste Behälterfeld des Eintrags, also der Stapel beziehungsweise die Positionsliste. */
function containerField(entry: ToolEntry): FieldSpec | undefined {
  return entry.fields.find((field) => field.itemFields !== undefined);
}

/**
 * Baut die fachlichen Schlüssel des Aufrufs: einen je Stapelelement, sonst genau einen.
 *
 * Ein Schlüsselfeld, das im Element fehlt, wird auf der obersten Ebene gesucht. Das ist der
 * Normalfall bei Stapelaufrufen, deren gemeinsame Angaben außerhalb des Behälters stehen.
 */
function keyTuples(
  entry: ToolEntry,
  args: Readonly<Record<string, unknown>>,
  keyFields: readonly string[],
): readonly KeyTuple[] {
  const container = containerField(entry);
  const elements = container === undefined ? undefined : args[container.name];

  if (container !== undefined && Array.isArray(elements)) {
    return elements.filter(isPlainObject).map((element) => {
      const tuple = new Map<string, unknown>();
      for (const key of keyFields) {
        const value = element[key] ?? args[key];
        if (value !== undefined) {
          tuple.set(key, value);
        }
      }
      return tuple;
    });
  }

  const tuple = new Map<string, unknown>();
  for (const key of keyFields) {
    const value = args[key];
    if (value !== undefined) {
      tuple.set(key, value);
    }
  }
  return [tuple];
}

/**
 * Vergleicht zwei Werte fachlich.
 *
 * Zwei Formen sind gemessen verschieden und bedeuten dasselbe: Kennungen
 * kommen bei `receipts` als Zeichenkette und bei `transactions` als Zahl zurück, und Beträge
 * kommen durchgehend als Zeichenkette. Deshalb wird ein Betrag in Ganzzahl-Cent verglichen und
 * alles andere als Zeichenkette; auf Gleitkomma wird nie gerechnet.
 */
function valuesMatch(left: unknown, right: unknown): boolean {
  const leftText = scalarText(left);
  const rightText = scalarText(right);
  if (leftText === undefined || rightText === undefined) {
    return false;
  }
  if (leftText === rightText) {
    return true;
  }
  const leftCents = amountToCents(leftText);
  const rightCents = amountToCents(rightText);
  return leftCents !== null && rightCents !== null && leftCents === rightCents;
}

/**
 * Ein Wert als vergleichbarer Text, oder `undefined`.
 *
 * Ein Objekt oder eine Liste ist kein fachlicher Schlüssel. Sie über die
 * Zeichenkettenumwandlung laufen zu lassen ergäbe `[object Object]`, und zwei verschiedene
 * Objekte sähen damit gleich aus — ein Duplikatshinweis auf eine erfundene Gleichheit.
 */
function scalarText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

/**
 * Baut die Argumente der Nachschlage-Abfrage.
 *
 * Übergeben wird ein Schlüsselfeld nur dann, wenn der ganze Aufruf darin **einen** Wert trägt
 * und das lesende Werkzeug ein Feld dieses Namens führt. Bei mehreren Werten wird das Feld
 * weggelassen, die Suche also bewusst weiter gefasst; der Abgleich unten filtert wieder
 * zusammen. Ein erfundener Bereichsfilter wäre die Alternative, und der lehnte im Zweifel
 * einen gültigen Aufruf ab.
 */
function lookupArgs(
  readEntry: ToolEntry,
  tuples: readonly KeyTuple[],
  keyFields: readonly string[],
): Record<string, unknown> {
  const accepted = new Set(readEntry.fields.map((field) => field.name));
  const out: Record<string, unknown> = {};
  for (const key of keyFields) {
    if (!accepted.has(key)) {
      continue;
    }
    const values = tuples.map((tuple) => tuple.get(key)).filter((value) => value !== undefined);
    if (values.length !== tuples.length || values.length === 0) {
      continue;
    }
    const first = values[0];
    if (values.every((value) => valuesMatch(value, first))) {
      out[key] = first;
    }
  }
  return out;
}

/** Ein gefundener Datensatz und der Schlüssel, auf den er passt. */
interface DuplicateMatch {
  readonly row: Record<string, unknown>;
  readonly matchedOn: readonly string[];
}

/**
 * Sucht in den gelesenen Zeilen die Datensätze, die auf einen der Schlüssel passen.
 *
 * Ein Feld, das die Antwort nicht führt, gilt als nicht vergleichbar und nicht als Treffer.
 * Passt kein einziges Feld vergleichbar zusammen, ist es kein Treffer: Sonst wäre jede Zeile
 * einer weit gefassten Suche ein Duplikat.
 */
function findMatches(
  rows: readonly unknown[],
  tuples: readonly KeyTuple[],
): readonly DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const raw of rows) {
    if (!isPlainObject(raw)) {
      continue;
    }
    for (const tuple of tuples) {
      const comparable: string[] = [];
      let allMatch = true;
      for (const [key, value] of tuple) {
        if (!(key in raw)) {
          continue;
        }
        comparable.push(key);
        if (!valuesMatch(raw[key], value)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch && comparable.length > 0) {
        matches.push({ row: raw, matchedOn: comparable });
        break;
      }
    }
  }
  return matches;
}

/** Die Kennung eines gefundenen Datensatzes, soweit die Antwort eine führt. */
function identify(row: Record<string, unknown>): string {
  const id = row["id_by_customer"];
  if (typeof id === "string" || typeof id === "number") {
    return `id_by_customer ${String(id)}`;
  }
  return "ohne id_by_customer in der Antwort";
}

function formatHint(spec: DuplicateSpec, matches: readonly DuplicateMatch[]): string {
  const list = matches
    .slice(0, 5)
    .map((match) => `${identify(match.row)} (gleich in ${match.matchedOn.join(", ")})`)
    .join("; ");
  const more = matches.length > 5 ? ` und ${String(matches.length - 5)} weitere` : "";
  const plural = matches.length === 1 ? "einen Datensatz" : `${String(matches.length)} Datensätze`;
  return (
    `MÖGLICHES DUPLIKAT. Vor diesem Aufruf führte ${spec.tool} bereits ${plural} mit demselben ` +
    `fachlichen Schlüssel (${spec.keyFields.join(", ")}): ${list}${more}. ` +
    "Dieser Aufruf wurde deshalb NICHT blockiert; zwei fachlich gleiche Datensätze am selben " +
    "Tag sind ein zulässiger Fall. Ist hier versehentlich ein Duplikat entstanden, den " +
    "Nutzer darauf hinweisen und den überzähligen Datensatz löschen oder stornieren. " +
    "Dieser Hinweis hat einen zusätzlichen lesenden Aufruf gekostet " +
    "(BB_MCP_DUPLICATE_CHECK=on); mit off entfällt er."
  );
}

/**
 * Schlägt vor einem anlegenden Aufruf nach, ob es den Datensatz schon gibt.
 *
 * @returns Den Hinweis für die Antwort, oder `undefined`. **Niemals eine Absage**: Dieser Guard
 *          blockiert nicht und wirft nicht.
 */
export async function checkDuplicates(input: DuplicateCheckInput): Promise<string | undefined> {
  const spec = input.entry.duplicateCheck;
  if (spec === undefined || input.config.duplicateCheck !== "on") {
    // Der Auslieferungszustand. Hier endet der Guard, ohne etwas zu tun, und vor allem ohne
    // einen Zusatzaufruf: Ein Werkzeugaufruf bleibt genau ein API-Aufruf.
    return undefined;
  }

  const readEntry = input.resolveEntry(spec.tool);
  if (readEntry === undefined) {
    logDebug(
      `Duplikatshinweis zu ${input.entry.name} übersprungen: ${spec.tool} steht nicht im Register.`,
    );
    return undefined;
  }

  const tuples = keyTuples(input.entry, input.args, spec.keyFields);
  const args = lookupArgs(readEntry, tuples, spec.keyFields);
  if (Object.keys(args).length === 0) {
    // Ohne einen einzigen Suchwert wäre die Abfrage eine Seite beliebiger Datensätze, und
    // jeder Treffer darin wäre Zufall. Ein Token dafür wird nicht verbraucht.
    logDebug(
      `Duplikatshinweis zu ${input.entry.name} übersprungen: aus ${spec.keyFields.join(", ")} ` +
        `ließ sich kein eindeutiger Suchwert für ${spec.tool} bilden.`,
    );
    return undefined;
  }

  try {
    const rows = await input.lookup(readEntry, args);
    const matches = findMatches(rows, tuples);
    return matches.length === 0 ? undefined : formatHint(spec, matches);
  } catch (error) {
    // Der Hinweis ist eine Zugabe. Scheitert er, läuft der eigentliche Aufruf weiter, und der
    // Grund steht auf stderr statt in der Antwort des Agenten.
    logDebug(
      `Duplikatshinweis zu ${input.entry.name} nicht möglich: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
