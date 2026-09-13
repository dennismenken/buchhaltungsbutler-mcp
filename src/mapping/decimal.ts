// Betragsrechnung ausschließlich in Ganzzahl-Cent (Plan 7.4, Streitfrage S9).
//
// Die Regel dieses Moduls in einem Satz: **Es wird nie auf Gleitkomma gerechnet.** Jeder
// Betrag wird aus seiner Zeichenkette in Ganzzahl-Cent überführt, und jede Summe, jeder
// Vergleich und jede Grenzprüfung läuft auf diesen Ganzzahlen. Die einzige Stelle, an der
// überhaupt eine Gleitkommazahl entsteht, ist {@link amountStringToApiNumber}: Die API
// erwartet beim Schreiben eine JSON-Zahl (Plan 4.5, `amountIn()`), und eine JSON-Zahl ist in
// JavaScript zwangsläufig ein `double`. Dort wird nicht gerechnet, sondern einmal umgewandelt
// und sofort serialisiert.
//
// Warum nicht einfach `parseFloat`: `parseFloat("884.65") * 100` ergibt 88464.99999999999.
// Eine stille Rundung ist in einer Buchhaltung der schlimmste denkbare Ausgang (Plan 7.4):
// Der Betrag sieht danach weiterhin richtig aus, ist es aber nicht mehr, und nichts in der
// Antwort weist darauf hin.

/** Cent je Währungseinheit. */
export const CENTS_PER_UNIT = 100;

/**
 * Die größte Centzahl, die sich noch verlustfrei als JavaScript-Ganzzahl halten lässt.
 *
 * Alles darüber wird **nicht** gerundet, sondern als unbrauchbar gemeldet: Ein Betrag, der
 * die Ganzzahlgenauigkeit verlässt, ist kein Betrag mehr, sondern eine Schätzung.
 */
export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * Warum eine Betragszeichenkette nicht in Cent überführt werden konnte. Der Grund wandert in
 * die Begründung eines `_contract_warnings`-Eintrags (Plan 7.3) beziehungsweise in die
 * Fehlermeldung des Request-Mappers; ein `null` ohne Grund wäre dort nicht erklärbar.
 */
export type AmountProblem =
  | "leer"
  | "kein Betragsformat"
  | "mehrdeutiges Trennzeichen"
  | "mehr als zwei Nachkommastellen"
  | "zu groß für eine verlustfreie Ganzzahl";

export type AmountResult =
  | { readonly ok: true; readonly cents: number }
  | { readonly ok: false; readonly problem: AmountProblem };

const SIGN_PATTERN = /^[+-]/;
const DIGITS_ONLY = /^\d+$/;

/** Ein Gruppentrennzeichen trennt Dreierblöcke: `1.234.567`, erster Block 1 bis 3 Stellen. */
function isValidGrouping(parts: readonly string[]): boolean {
  const first = parts[0] ?? "";
  if (first.length < 1 || first.length > 3 || !DIGITS_ONLY.test(first)) {
    return false;
  }
  return parts.slice(1).every((part) => part.length === 3 && DIGITS_ONLY.test(part));
}

/**
 * Zerlegt den Zahlenteil in Vorkomma- und Nachkommastellen.
 *
 * Die Entscheidung, welches Zeichen das Dezimaltrennzeichen ist, wird nicht geraten:
 *
 * - Kommen Punkt und Komma zusammen vor, ist das **zuletzt** stehende das Dezimaltrennzeichen
 *   und das andere das Gruppentrennzeichen (`1.234,56` und `1,234.56`).
 * - Kommt nur eine Art vor und mehr als einmal, ist sie Gruppentrennzeichen (`1.234.567`).
 * - Kommt sie genau einmal vor, entscheidet die Zahl der Stellen dahinter: eine oder zwei
 *   Stellen sind Nachkommastellen, mehr als drei sind ein Betrag mit zu vielen
 *   Nachkommastellen, und **genau drei Stellen sind mehrdeutig** (`1.234` kann 1234 oder
 *   1,234 bedeuten) und werden abgelehnt statt geraten.
 */
function splitNumberPart(
  digits: string,
): { readonly whole: string; readonly fraction: string } | AmountProblem {
  const dots = (digits.match(/\./g) ?? []).length;
  const commas = (digits.match(/,/g) ?? []).length;

  if (dots > 0 && commas > 0) {
    const lastDot = digits.lastIndexOf(".");
    const lastComma = digits.lastIndexOf(",");
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const groupSeparator = decimalSeparator === "." ? "," : ".";
    const cut = digits.lastIndexOf(decimalSeparator);
    const wholeRaw = digits.slice(0, cut);
    const fraction = digits.slice(cut + 1);
    if (wholeRaw.includes(decimalSeparator)) {
      return "kein Betragsformat";
    }
    if (!isValidGrouping(wholeRaw.split(groupSeparator))) {
      return "kein Betragsformat";
    }
    if (fraction.length === 0 || !DIGITS_ONLY.test(fraction)) {
      return "kein Betragsformat";
    }
    if (fraction.length > 2) {
      return "mehr als zwei Nachkommastellen";
    }
    return { whole: wholeRaw.split(groupSeparator).join(""), fraction };
  }

  const separator = dots > 0 ? "." : commas > 0 ? "," : "";
  if (separator === "") {
    return DIGITS_ONLY.test(digits) ? { whole: digits, fraction: "" } : "kein Betragsformat";
  }

  const parts = digits.split(separator);
  if (parts.length > 2) {
    return isValidGrouping(parts) ? { whole: parts.join(""), fraction: "" } : "kein Betragsformat";
  }

  const whole = parts[0] ?? "";
  const fraction = parts[1] ?? "";
  // `DIGITS_ONLY` verlangt mindestens eine Ziffer; eine leere Nachkommastelle wie in "12."
  // scheitert damit schon hier und braucht keinen eigenen Zweig.
  if (!DIGITS_ONLY.test(whole) || !DIGITS_ONLY.test(fraction)) {
    return "kein Betragsformat";
  }
  if (fraction.length === 3) {
    // Genau hier liegt der gefährliche Fall, und genau hier wird nicht geraten.
    return "mehrdeutiges Trennzeichen";
  }
  if (fraction.length > 3) {
    return "mehr als zwei Nachkommastellen";
  }
  return { whole, fraction };
}

/**
 * Überführt eine Betragszeichenkette in Ganzzahl-Cent, ohne jede Gleitkommarechnung.
 *
 * Angenommen werden die gemessene Form der API (`"884.65"`, `"-192.44"`, Plan 0.3 Befund L3),
 * die deutsche Schreibweise mit Komma und Formen mit Tausendertrennzeichen. Abgelehnt wird
 * alles, dessen Bedeutung nicht eindeutig ist.
 */
export function parseAmountToCents(raw: string): AmountResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, problem: "leer" };
  }
  // Leerraum innerhalb der Zahl wird nicht als Tausendertrennzeichen gedeutet: Ein
  // geschütztes Leerzeichen ist unsichtbar, und eine unsichtbare Deutung ist eine Annahme.
  if (/\s/.test(trimmed)) {
    return { ok: false, problem: "kein Betragsformat" };
  }

  const negative = trimmed.startsWith("-");
  const digits = SIGN_PATTERN.test(trimmed) ? trimmed.slice(1) : trimmed;
  if (digits === "") {
    return { ok: false, problem: "kein Betragsformat" };
  }
  if (/[^\d.,]/.test(digits)) {
    return { ok: false, problem: "kein Betragsformat" };
  }

  const split = splitNumberPart(digits);
  if (typeof split === "string") {
    return { ok: false, problem: split };
  }

  const padded = split.fraction.padEnd(2, "0");
  const wholeCents = Number.parseInt(split.whole, 10) * CENTS_PER_UNIT;
  const fractionCents = Number.parseInt(padded, 10);
  if (!Number.isSafeInteger(wholeCents) || wholeCents + fractionCents > MAX_SAFE_CENTS) {
    return { ok: false, problem: "zu groß für eine verlustfreie Ganzzahl" };
  }
  const magnitude = wholeCents + fractionCents;
  return { ok: true, cents: negative ? -magnitude : magnitude };
}

/** Wie {@link parseAmountToCents}, aber nur der Centwert; `null` bei jedem Problem. */
export function amountToCents(raw: string): number | null {
  const result = parseAmountToCents(raw);
  return result.ok ? result.cents : null;
}

/**
 * Die kanonische Betragsform eines Centwertes: Punkt als Trennzeichen, immer zwei
 * Nachkommastellen, kein Tausendertrennzeichen. Gerechnet wird ausschließlich auf der
 * Ganzzahl; die Zeichenkette entsteht durch Zusammensetzen, nicht durch Division.
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(
      `formatCents erwartet Ganzzahl-Cent, bekam ${String(cents)}. Beträge werden in diesem ` +
        "Projekt nie als Gleitkommazahl geführt (Plan 7.4).",
    );
  }
  const negative = cents < 0;
  const magnitude = Math.abs(cents);
  const whole = Math.trunc(magnitude / CENTS_PER_UNIT);
  const fraction = magnitude - whole * CENTS_PER_UNIT;
  return `${negative ? "-" : ""}${String(whole)}.${String(fraction).padStart(2, "0")}`;
}

/** Summe in Ganzzahl-Cent. Eine leere Liste ergibt 0. */
export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isInteger(value)) {
      throw new TypeError("sumCents erwartet Ganzzahl-Cent (Plan 7.4).");
    }
    total += value;
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(
      "Die Summe verlässt den verlustfreien Ganzzahlbereich. Ein gerundeter Betrag wird hier " +
        "nicht geliefert (Plan 7.4).",
    );
  }
  return total;
}

/**
 * Die JSON-Zahl, die die API beim Schreiben erwartet (Plan 4.5, Baustein `amountIn()`).
 *
 * **Die einzige Gleitkommastelle des Projekts, und sie rechnet nicht.** Der Centwert wird in
 * die kanonische Zeichenkette zurückgeschrieben und diese einmal nach `number` gewandelt.
 * `JSON.stringify` gibt davon die kürzeste Form aus, die sich verlustfrei zurücklesen lässt;
 * bei höchstens zwei Nachkommastellen ist das zeichengleich die Eingabe. Der Rückgabewert
 * wird ausschließlich serialisiert und nie weiterverrechnet.
 *
 * @returns `null`, wenn die Zeichenkette kein eindeutiger Betrag ist. Der Aufrufer bricht
 *          dann ab, statt eine geratene Zahl zu senden.
 */
export function amountStringToApiNumber(raw: string): number | null {
  const cents = amountToCents(raw);
  if (cents === null) {
    return null;
  }
  return Number(formatCents(cents));
}

/** Vergleich zweier Beträge in Cent. Negative Zahl, 0 oder positive Zahl wie bei `sort`. */
export function compareCents(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
