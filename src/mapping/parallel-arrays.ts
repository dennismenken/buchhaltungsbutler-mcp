// Positionsliste → parallele Arrays, mit positionsgenauen Fehlermeldungen.
//
// **Genau fünf Endpunkte** erwarten zusammengehörige Werte als mehrere gleich lange Arrays auf
// oberster Ebene, **zwei weitere** je Stapelelement. Überall sonst findet keine Umformung
// statt, auch dort nicht, wo man sie vermuten würde: `/postings/add/free` ist skalar, und
// `/postings/add-batch/free`, `/postings/add-batch/receipts` (auf oberster Ebene),
// `/postings/add-batch/transactions` (auf oberster Ebene), `/receipts/addBatch`,
// `/transactions/addBatch`, `/settings/add-batch/debtors`, `/settings/add-batch/creditors` und
// `/transactions/assign-batch/receipt` sind **bereits Objektlisten** (maschinell
// belegt).
//
// Die Spaltenliste wird **aus dem Registereintrag abgeleitet** und nicht zweitens hier
// gepflegt: Jedes Feld des Positionsobjekts trägt in `apiNames` genau den Namen des parallelen
// Arrays, das es erzeugt. Eine zweite Liste wäre die Stelle, an der die
// Längeninvariante später doch wieder auseinanderfällt — zum Beispiel an der abweichenden
// Schreibweise `postingstexts` innerhalb von `ReceiptPostings` (Spezifikationsfehler).
//
// Die Längeninvariante ist **konstruktiv** erfüllt: Jedes erzeugte Array entsteht aus derselben
// Schleife über dieselbe Liste. Es gibt keinen Zweig, in dem ein Array kürzer sein könnte.

import type { FieldSpec } from "../registry/types.js";

/** Eine Spalte der Umformung: ein Feld des Positionsobjekts und sein paralleles Array. */
export interface PositionColumn {
  readonly field: string;
  readonly apiName: string;
  /** `true`, wenn die API das Array immer erwartet; dann wird es auch mit `null` gefüllt. */
  readonly required: boolean;
}

/**
 * Die fünf Endpunkte mit parallelen Arrays **auf oberster Ebene**. Mehr gibt es
 * nicht; die Summe ihrer Array-Parameter ist genau die gezählte Menge von 32.
 */
export const PARALLEL_ARRAY_TOP_LEVEL_PATHS: readonly string[] = Object.freeze([
  "/postings/add/receipt",
  "/postings/add/transaction",
  "/invoices/create",
  "/invoices/create/draft",
  "/invoices/create/e-invoice",
]);

/**
 * Die zwei Endpunkte mit parallelen Arrays **innerhalb jedes Stapelelements**. Auf
 * oberster Ebene findet dort keine Umformung statt: Der Behälter ist eine Objektliste.
 */
export const PARALLEL_ARRAY_NESTED_PATHS: readonly string[] = Object.freeze([
  "/postings/add-batch/receipts",
  "/postings/add-batch/transactions",
]);

/**
 * Die Endpunkte, an denen ausdrücklich **keine** Umformung stattfindet, obwohl sie Mengen
 * entgegennehmen. Die Liste steht hier, damit die Zusicherung prüfbar ist und
 * nicht nur in der Prosa behauptet wird.
 */
export const NO_PARALLEL_ARRAY_PATHS: readonly string[] = Object.freeze([
  "/postings/add/free",
  "/postings/add-batch/free",
  "/receipts/addBatch",
  "/transactions/addBatch",
  "/settings/add-batch/debtors",
  "/settings/add-batch/creditors",
  "/transactions/assign-batch/receipt",
]);

/** Eine Positionsliste, die so nicht umformbar ist. Die Meldung nennt die Position. */
export class PositionMappingError extends Error {
  readonly toolName: string;
  /** Pfad des Feldes im Werkzeugschema, zum Beispiel `positions` oder `receipts (Position 1).positions`. */
  readonly fieldPath: string;
  /** Die betroffene Position, 1-basiert wie in der Meldung; `null`, wenn es die Liste selbst ist. */
  readonly position: number | null;

  constructor(toolName: string, fieldPath: string, position: number | null, detail: string) {
    super(
      position === null ? `${fieldPath}: ${detail}` : `Position ${String(position)}: ${detail}`,
    );
    this.name = "PositionMappingError";
    this.toolName = toolName;
    this.fieldPath = fieldPath;
    this.position = position;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Leitet die Spaltenliste aus den `itemFields` des Registereintrags ab.
 *
 * Geprüft wird dabei zweierlei, und beides ist ein Eintragsfehler und kein Aufruffehler:
 * Jedes Feld des Positionsobjekts muss **genau einen** API-Namen tragen, und die Menge dieser
 * Namen muss der Menge in `apiNames` des Behälterfeldes entsprechen. Damit kann ein
 * Registereintrag kein Array erzeugen, das er nicht auch deklariert — und der Deckungstest P3
 * bleibt eine echte Prüfung.
 */
export function columnsOf(toolName: string, field: FieldSpec): readonly PositionColumn[] {
  const itemFields = field.itemFields;
  if (itemFields === undefined || itemFields.length === 0) {
    throw new PositionMappingError(
      toolName,
      field.name,
      null,
      "Das Feld ist als parallele Arrays deklariert, trägt aber keine itemFields. Ohne den " +
        "Aufbau eines Elements gibt es keine Spaltenliste.",
    );
  }

  const columns: PositionColumn[] = [];
  for (const itemField of itemFields) {
    if (itemField.apiNames.length !== 1) {
      throw new PositionMappingError(
        toolName,
        `${field.name}[].${itemField.name}`,
        null,
        `trägt ${String(itemField.apiNames.length)} API-Namen. Ein Feld des Positionsobjekts ` +
          "erzeugt genau ein paralleles Array und muss deshalb genau einen API-Namen tragen.",
      );
    }
    const apiName = itemField.apiNames[0] ?? "";
    columns.push({ field: itemField.name, apiName, required: itemField.required });
  }

  const declared = [...field.apiNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const derived = columns
    .map((column) => column.apiName)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (
    declared.length !== derived.length ||
    declared.some((name, index) => name !== derived[index])
  ) {
    throw new PositionMappingError(
      toolName,
      field.name,
      null,
      `deklariert die Arrays [${field.apiNames.join(", ")}], seine itemFields erzeugen aber ` +
        `[${columns.map((column) => column.apiName).join(", ")}]. Beide Listen müssen ` +
        "übereinstimmen, sonst deckt das Feld Parameter ab, die es nicht erzeugt.",
    );
  }

  return columns;
}

/**
 * Prüft, dass die Umformung an dieser Stelle überhaupt erlaubt ist.
 *
 * @param specPath Der unveränderte Spezifikationspfad des Endpunkts.
 * @param nested `true`, wenn die Positionsliste innerhalb eines Stapelelements liegt.
 * @throws {PositionMappingError} wenn ein Registereintrag die Umformung an einem Endpunkt
 *         verlangt, der keine parallelen Arrays führt. Das wäre eine stille Verfälschung des
 *         Bodys und damit schlimmer als ein Abbruch.
 */
export function assertTransformAllowed(
  toolName: string,
  specPath: string,
  fieldPath: string,
  nested: boolean,
): void {
  const allowed = nested ? PARALLEL_ARRAY_NESTED_PATHS : PARALLEL_ARRAY_TOP_LEVEL_PATHS;
  if (allowed.includes(specPath)) {
    return;
  }
  throw new PositionMappingError(
    toolName,
    fieldPath,
    null,
    `${specPath} führt ${nested ? "je Stapelelement" : "auf oberster Ebene"} keine parallelen ` +
      "Arrays. Die Umformung findet ausschließlich an den benannten Endpunkten " +
      "statt; alle übrigen Mengenfelder sind bereits Objektlisten und gehen unverändert " +
      "hinaus.",
  );
}

/**
 * Erzeugt die parallelen Arrays einer geprüften Positionsliste.
 *
 * Ein **optionales** Array wird ganz weggelassen, solange keine Position es setzt; sobald eine
 * es setzt, wird es vollständig erzeugt, und die übrigen Stellen tragen `null`. Belegt ist das
 * für `oi_receipts_ids_by_customer`, wo die Spezifikation `null` ausdrücklich als „dieser
 * Position keinen Beleg zuordnen" führt; für `cost_locations` und `item_description` ist es
 * **nicht verifiziert** und die defensive Wahl: Ein leerer String wäre dort nachweislich ein
 * Validierungsfehler, und eine Lücke zerstörte die Längengleichheit.
 *
 * @param fieldPath Pfad des Feldes für die Meldung, zum Beispiel
 *                  `receipts (Position 2).positions`.
 */
export function buildParallelArrays(
  toolName: string,
  field: FieldSpec,
  value: unknown,
  fieldPath: string = field.name,
): Record<string, unknown[]> {
  const columns = columnsOf(toolName, field);

  if (!Array.isArray(value)) {
    throw new PositionMappingError(
      toolName,
      fieldPath,
      null,
      `erwartet eine Liste von Positionen, bekam ${value === null ? "null" : typeof value}.`,
    );
  }
  if (value.length === 0) {
    throw new PositionMappingError(
      toolName,
      fieldPath,
      null,
      "ist leer. Mindestens eine Position ist nötig; die API nimmt keine leeren Arrays an.",
    );
  }

  const positions: Record<string, unknown>[] = [];
  value.forEach((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new PositionMappingError(
        toolName,
        fieldPath,
        index + 1,
        `ist kein Objekt, sondern ${raw === null ? "null" : typeof raw}.`,
      );
    }
    for (const column of columns) {
      const cell = raw[column.field];
      if (
        column.required &&
        (cell === undefined || (cell === null && !allowsNull(field, column)))
      ) {
        throw new PositionMappingError(
          toolName,
          fieldPath,
          index + 1,
          `${column.field} fehlt. Das Feld ist Pflicht, weil die API das Array ` +
            `${column.apiName} immer erwartet und alle Arrays gleich lang sein müssen.`,
        );
      }
    }
    positions.push(raw);
  });

  const body: Record<string, unknown[]> = {};
  for (const column of columns) {
    const used = positions.some((position) => position[column.field] !== undefined);
    if (!column.required && !used) {
      continue;
    }
    body[column.apiName] = positions.map((position) => position[column.field] ?? null);
  }
  return body;
}

/**
 * `true`, wenn die Spalte an diesem Feld ausdrücklich `null` tragen darf.
 *
 * Das betrifft genau `oi_receipts_ids_by_customer` an `/postings/add/transaction` und dessen
 * Stapelform: Dort bedeutet `null` „dieser Position ausdrücklich keinen Beleg zuordnen" und
 * ist deshalb ein Wert und keine Lücke.
 *
 * Gefragt wird das Schemafragment des Elementfeldes selbst, nicht eine Namensliste und auch
 * keine Zod-Interna: Wenn das Fragment `null` annimmt, ist `null` dort ein gültiger Wert.
 */
function allowsNull(field: FieldSpec, column: PositionColumn): boolean {
  const itemField = field.itemFields?.find((candidate) => candidate.name === column.field);
  if (itemField === undefined) {
    return false;
  }
  return itemField.schema.safeParse(null).success;
}
