// Die wiederverwendbaren Zod-Bausteine der Schemaschicht: Datum, Datumzeit, Betrag und
// Kennung (Plan 2, Dateibaum). Dazu die Markierung, über die Guard 5 die Betragsfelder
// findet, ohne eine zweite Namensliste zu pflegen (Plan 1.4 Schritt 6, AP10).
//
// Arbeitsteilung innerhalb der Schemaschicht, damit jede Zeichenkette genau einen Ort hat:
//
//   primitives.ts  die Schemaform ohne deutschen Text. Jede Funktion nimmt die fertige
//                  Beschreibung als Argument und prüft nichts an ihr.
//   vocab.ts       die deutschen Beschreibungsmuster aus Plan 4.5 und die dort benannten
//                  Bausteine; sie setzen Text und Form hier zusammen.
//
// Deshalb heißen die Funktionen hier `…Value` und in vocab.ts wie in Plan 4.5. Wer einen
// neuen Feldtyp braucht, baut die Form hier und den Text dort.

import { z } from "zod";

// --- Markierung ----------------------------------------------------------------------

/**
 * Der Metadatenschlüssel der internen Markierung.
 *
 * Zod legt Metadaten in `z.globalRegistry` ab und `z.toJSONSchema` schreibt sie
 * unverändert in das erzeugte JSON Schema. Die Markierung hat im ausgelieferten Schema
 * nichts zu suchen; `src/schema/build.ts` entfernt sie deshalb beim Erzeugen wieder
 * (siehe {@link INTERNAL_META_KEYS}).
 */
const KIND_KEY = "bbKind";

/**
 * Die Art eines Schemafragments, soweit eine andere Schicht sie erkennen muss.
 *
 * - `amount` ist die Markierung aus Plan 4.5: Guard 5 prüft `BB_MCP_MAX_AMOUNT` gegen
 *   jedes Betragsfeld der Klassen A und B, skalar wie je Position, und findet sie über
 *   diese Markierung statt über eine zweite, handgepflegte Feldliste (AP10).
 * - `positions` und `batch` markieren die beiden Arten von Mengenfeld aus Q4 (Plan 4.7).
 *   Sie tragen beide dieselbe Obergrenze `min(50, BB_MCP_MAX_BATCH)`; die Markierung macht
 *   den Unterschied zwischen Positionsliste und Stapelarray trotzdem sichtbar, weil die
 *   Herkunft der 50 je Art verschieden ist (API-Regel gegen eigene Mengengrenze).
 */
export type SchemaKind = "amount" | "positions" | "batch";

/** Die Metadatenschlüssel, die nur intern gelten und nie ausgeliefert werden. */
export const INTERNAL_META_KEYS: readonly string[] = Object.freeze([KIND_KEY]);

/**
 * Setzt die Markierung. Die Beschreibung wird danach gesetzt, nicht davor: `.meta()`
 * ersetzt die Metadaten des Schemas, `.describe()` ergänzt sie nur.
 */
export function markSchemaKind<T extends z.ZodType>(schema: T, kind: SchemaKind): T {
  return schema.meta({ [KIND_KEY]: kind });
}

/**
 * Schält die Hüllen ab, die ein Registereintrag um ein Fragment legen darf.
 *
 * `.optional()`, `.nullable()` und `.default()` erzeugen in Zod 4 ein neues Schema, das
 * das eigentliche Fragment einschließt; die Markierung sitzt am eingeschlossenen Schema.
 * Ohne diese Schleife fände Guard 5 jedes optionale Betragsfeld nicht.
 */
export function unwrapSchema(schema: unknown): z.ZodType | undefined {
  let current: unknown = schema;
  for (let depth = 0; depth < 10; depth++) {
    if (!(current instanceof z.ZodType)) {
      return undefined;
    }
    const def: unknown = current.def;
    if (typeof def !== "object" || def === null) {
      return current;
    }
    const inner = (def as { innerType?: unknown }).innerType;
    if (inner === undefined) {
      return current;
    }
    current = inner;
  }
  return undefined;
}

/** Die Art eines Fragments, durch alle Hüllen hindurch. `undefined`, wenn unmarkiert. */
export function schemaKind(schema: unknown): SchemaKind | undefined {
  let current: unknown = schema;
  for (let depth = 0; depth < 10; depth++) {
    if (!(current instanceof z.ZodType)) {
      return undefined;
    }
    const meta = z.globalRegistry.get(current);
    const kind = meta?.[KIND_KEY];
    if (kind === "amount" || kind === "positions" || kind === "batch") {
      return kind;
    }
    const def: unknown = current.def;
    if (typeof def !== "object" || def === null) {
      return undefined;
    }
    const inner = (def as { innerType?: unknown }).innerType;
    if (inner === undefined) {
      return undefined;
    }
    current = inner;
  }
  return undefined;
}

/** `true`, wenn dieses Fragment ein Betrag im Sinne von Plan 4.5 ist (Guard 5, AP10). */
export function isAmountSchema(schema: unknown): boolean {
  return schemaKind(schema) === "amount";
}

/**
 * Entfernt die internen Markierungen aus einem erzeugten JSON-Schema-Knoten.
 * Aufgerufen wird das ausschließlich von `src/schema/build.ts`, einmal je Knoten.
 */
export function stripInternalMeta(node: Record<string, unknown>): void {
  for (const key of INTERNAL_META_KEYS) {
    if (key in node) {
      delete node[key];
    }
  }
}

// --- Das eine strikte Objekt ---------------------------------------------------------

/**
 * Das einzige `.strict()` des Projekts.
 *
 * Guard 3 verlangt strenge Validierung mit `additionalProperties: false` (Plan 1.4): Die
 * API ignoriert unbekannte Body-Felder kommentarlos, ohne strenge Prüfung wäre ein
 * Tippfehler im Feldnamen also ein stiller Datenfehler. Damit diese Entscheidung nicht an
 * 54 Registereinträgen hängt, gibt es genau diese eine Funktion; `src/schema/build.ts` ist
 * der einzige Ort, der damit das **Werkzeugobjekt** baut, und die geschachtelten Objekte in
 * `order.ts`, `line-items.ts` und `batch.ts` erben die Strenge über denselben Aufruf.
 *
 * Die Funktion steht hier und nicht in `build.ts`, weil `order.ts` und `line-items.ts` sie
 * brauchen und ein Import aus `build.ts` einen Zyklus
 * `build → cross-checks → order → build` erzeugte. Ein Zyklus mit Konstanten auf oberster
 * Ebene fällt je nach Einstiegsmodul in die temporale Totzone und ist damit ein Fehler, der
 * nur in einer von zwei Ladereihenfolgen auftritt.
 */
export function strictObject<T extends z.core.$ZodLooseShape>(shape: T) {
  return z.object(shape).strict();
}

// --- Muster --------------------------------------------------------------------------

/** `YYYY-MM-DD`. Die Kalenderprüfung (Monatslänge, Schaltjahr) läuft zusätzlich als Refine. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD HH:MM:SS` oder nur `YYYY-MM-DD`.
 *
 * Die Spezifikation schreibt an `date_since_last_modified` wörtlich: „If only 'YYYY-MM-DD'
 * is specified, the time defaults to '23:59:59'.“ Beide Formen sind also gültig. An
 * `booking_date` und `value_date` nennt sie das Muster `YYYY-MM-DD HH:II:SS`; `II` ist
 * die PHP-Schreibweise für die Minute und kein zweiter Monat.
 */
export const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/;

/**
 * Betrag als Dezimalzeichenkette: Punkt als Trennzeichen, höchstens zwei Nachkommastellen,
 * Minus erlaubt, kein Tausendertrennzeichen.
 *
 * Die API erwartet beim Schreiben eine JSON-Zahl und liefert beim Lesen einen String
 * (Plan 0.3 L3). Das Werkzeugschema nimmt trotzdem die Zeichenkette: Eine Gleitkommazahl
 * für Geld ist ein Fehler, und die Umwandlung an den Rand gehört in
 * `src/mapping/request.ts` (Plan 4.5).
 */
export const AMOUNT_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

// --- Kalenderprüfung -----------------------------------------------------------------

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/**
 * Prüft einen Datumsteil `YYYY-MM-DD` auf einen existierenden Kalendertag.
 *
 * Das Muster allein ließe `2026-02-30` durch, und ein solches Datum erzeugte einen
 * Request, den die API ablehnt — also einen vermeidbaren Fehlschlag nach dem Netzaufruf.
 */
export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  const day = Number.parseInt(value.slice(8, 10), 10);
  if (month < 1 || month > 12) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Wie {@link isCalendarDate}, zusätzlich mit Uhrzeitprüfung, wenn eine Uhrzeit dabeisteht. */
export function isCalendarDateTime(value: string): boolean {
  if (!DATE_TIME_PATTERN.test(value)) {
    return false;
  }
  if (!isCalendarDate(value.slice(0, 10))) {
    return false;
  }
  if (value.length === 10) {
    return true;
  }
  const hour = Number.parseInt(value.slice(11, 13), 10);
  const minute = Number.parseInt(value.slice(14, 16), 10);
  const second = Number.parseInt(value.slice(17, 19), 10);
  return hour <= 23 && minute <= 59 && second <= 59;
}

// --- Die vier Bausteine --------------------------------------------------------------

/**
 * Datum als `YYYY-MM-DD`.
 *
 * Im JSON Schema steht `format: "date"` neben dem kurzen Muster. Das ist bewusst nicht
 * `z.iso.date()`: Dessen erzeugtes Muster ist rund 250 Zeichen lang, es käme an jedem
 * Datumsfeld aller 54 Werkzeuge erneut vor und kostete das Kontextbudget aus Plan 4.10
 * mehrere Tausend Zeichen, ohne dem Aufrufer etwas zu sagen, was `format: "date"` nicht
 * schon sagt. Die Schaltjahrprüfung geht dabei nicht verloren, sie läuft als Refine.
 */
export function dateValue(description: string): z.ZodString {
  return z
    .string()
    .regex(DATE_PATTERN, {
      error: "erwartet wird ein Datum als YYYY-MM-DD, zum Beispiel 2026-04-26",
    })
    .refine(isCalendarDate, { error: "kein existierender Kalendertag" })
    .meta({ format: "date" })
    .describe(description);
}

/** Datum mit Uhrzeit als `YYYY-MM-DD HH:MM:SS`; ein reines Datum ist ebenfalls gültig. */
export function dateTimeValue(description: string): z.ZodString {
  return z
    .string()
    .regex(DATE_TIME_PATTERN, {
      error:
        "erwartet wird YYYY-MM-DD HH:MM:SS, zum Beispiel 2026-04-26 13:45:00, oder nur YYYY-MM-DD",
    })
    .refine(isCalendarDateTime, { error: "kein existierender Zeitpunkt" })
    .describe(description);
}

/**
 * Betrag als Dezimalzeichenkette. Das erzeugte Fragment ist als Betrag markiert, damit
 * Guard 5 `BB_MCP_MAX_AMOUNT` ohne zweite Namensliste prüfen kann (Plan 4.5, AP10).
 *
 * Die Markierung sitzt auf dem Rückgabewert. Wer die Beschreibung später mit `.describe()`
 * ändert oder das Fragment mit `.optional()` umhüllt, verliert sie nicht:
 * {@link schemaKind} schält die Hüllen ab, und `.describe()` ergänzt die Metadaten.
 */
export function amountValue(description: string): z.ZodString {
  const base = z.string().regex(AMOUNT_PATTERN, {
    error:
      'erwartet wird ein Betrag als Zeichenkette mit Dezimalpunkt und höchstens zwei Nachkommastellen, zum Beispiel "123.99"',
  });
  return markSchemaKind(base, "amount").describe(description);
}

/**
 * Mandantenbezogene Kennung (`id_by_customer`) als positive Ganzzahl.
 *
 * Eingehend `integer`, ausgehend immer String (Plan 12, Streitfrage S10). Die Reibung
 * wird nicht durch Schemagymnastik gelöst, sondern durch einen Satz in der
 * Parameterbeschreibung; den setzt `vocab.ts`.
 */
export function identifierValue(description: string): z.ZodNumber {
  return z
    .number()
    .int({ error: "erwartet wird eine ganze Zahl ohne Anführungszeichen" })
    .min(1, { error: "muss größer als 0 sein" })
    .describe(description);
}

/**
 * Freier Text, nie leer, auf Wunsch längenbegrenzt.
 *
 * Die Untergrenze 1 ist kein Beiwerk: Ein leerer String ist bei dieser API ein
 * Validierungsfehler und bedeutet nicht „nicht gesetzt“ (Plan 4.7 Q3). Q3 prüft denselben
 * Sachverhalt zusätzlich über den ganzen Aufruf, weil ein Registereintrag auch ein
 * Fragment verwenden darf, das nicht von hier kommt.
 */
export function boundedText(description: string, maxLength?: number): z.ZodString {
  const base = z.string().min(1, {
    error: "darf nicht leer sein; das Feld stattdessen weglassen",
  });
  const limited =
    maxLength === undefined
      ? base
      : base.max(maxLength, { error: `höchstens ${String(maxLength)} Zeichen` });
  return limited.describe(description);
}
