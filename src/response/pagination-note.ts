// Die drei Bestandszeilen aus Plan 7.5, wörtlich und auf Deutsch (E4).
//
// **Die zentrale Ehrlichkeitsregel: Es gibt keine Gesamttrefferzahl.** `rows` ist die
// Zeilenzahl *dieser* Antwort (Plan 0.3 Befund L5). Es gibt kein Feld für die Gesamtzahl,
// keinen Cursor, nur `limit` und `offset`. Jede Formulierung wie „100 von 500" ist eine Lüge:
// Die Gesamtzahl steht in keiner Antwort, sie wäre also frei erfunden.
//
// Die Abbruchbedingung ist **„weniger Zeilen als `limit`"** und nicht `rows` (Plan 7.5 Regel
// 3): `rows` ist ein Begleitfeld der Antwort, die Zeilen sind die Tatsache.
//
// Dieses Modul formuliert; es entscheidet nichts. Ob überhaupt eine Bestandszeile entsteht,
// hängt an der Umschlagform des Registereintrags, und die kennt `build.ts`.

/** Die Lage einer Listenantwort. Sie folgt ausschließlich aus Zeilenzahl und `limit`. */
export type PageState = "full" | "partial" | "empty";

export interface PageFacts {
  /** Die Zeilen **dieser** Antwort. */
  readonly rowsReturned: number;
  /** Das gesendete `limit`. `null` nur dort, wo der Endpunkt keine Paginierung kennt. */
  readonly limitUsed: number | null;
  readonly offsetUsed: number;
}

/** Die Lage aus den Tatsachen. Eine volle Antwort heißt „wahrscheinlich mehr", nicht „mehr". */
export function pageStateOf(facts: PageFacts): PageState {
  if (facts.rowsReturned === 0) {
    return "empty";
  }
  if (facts.limitUsed !== null && facts.rowsReturned >= facts.limitUsed) {
    return "full";
  }
  return "partial";
}

export interface PaginationNoteOptions extends PageFacts {
  /** Der Werkzeugname, der im Folgeaufruf steht. */
  readonly toolName: string;
  /**
   * Die Filter, die sich zum Eingrenzen anbieten, als Text wie `date_from/date_to oder
   * counterparty`. Ohne Angabe wird allgemein auf die Filter des Werkzeugs verwiesen.
   */
  readonly filterHint?: string;
}

/** Der allgemeine Ersatz, wenn der Eintrag keine benennbaren Filterfelder trägt. */
export const GENERIC_FILTER_HINT = "die Filterfelder dieses Werkzeugs";

/**
 * Der Filterhinweis aus den Feldnamen eines Werkzeugs.
 *
 * Genannt wird, was der Aufrufer wirklich setzen kann: Zuerst der Zeitraum, dann das erste
 * vorhandene fachliche Filterfeld. Geraten wird nichts — steht keines der Felder im Schema,
 * bleibt es beim allgemeinen Hinweis.
 */
export function filterHintFromFields(fieldNames: readonly string[]): string {
  const names = new Set(fieldNames);
  const parts: string[] = [];
  if (names.has("date_from") && names.has("date_to")) {
    parts.push("date_from/date_to");
  }
  for (const candidate of [
    "counterparty",
    "to_from",
    "purpose",
    "invoicenumber",
    "account_filter",
    "postingaccount_filter",
    "payment_account_number",
    "name",
  ]) {
    if (names.has(candidate)) {
      parts.push(candidate);
      break;
    }
  }
  if (parts.length === 0) {
    return GENERIC_FILTER_HINT;
  }
  return parts.join(" oder ");
}

/**
 * Die Bestandszeile. Wortlaut nach Plan 7.5; eingesetzt werden ausschließlich Zahlen, der
 * Werkzeugname und der Filterhinweis.
 */
export function paginationNote(options: PaginationNoteOptions): string {
  const { rowsReturned, limitUsed, offsetUsed, toolName } = options;
  const state = pageStateOf(options);

  if (state === "empty") {
    return (
      "0 Zeilen geliefert. Entweder haben die Filter nichts getroffen, oder der offset liegt " +
      "hinter dem Ende des Ergebnisses. Das ist kein Fehler."
    );
  }

  const limitPart = limitUsed === null ? "" : `limit=${String(limitUsed)}, `;
  const head = `${String(rowsReturned)} Zeilen geliefert (${limitPart}offset=${String(offsetUsed)}).`;

  if (state === "partial") {
    return `${head} Weniger Zeilen als das limit, also ist das das vollständige Ergebnis für diese Filter.`;
  }

  const nextOffset = offsetUsed + rowsReturned;
  const filterHint = options.filterHint ?? GENERIC_FILTER_HINT;
  return (
    `${head} Das ist die Zeilenzahl DIESER Antwort; die BuchhaltungsButler-API nennt zu keinem ` +
    "Zeitpunkt eine Gesamttrefferzahl. Die Antwort ist voll, es gibt also wahrscheinlich mehr: " +
    `${toolName} mit denselben Filtern und offset=${String(nextOffset)} erneut aufrufen. Enger ` +
    `filtern über ${filterHint} ist in der Regel billiger als blättern.`
  );
}

/**
 * Der Satz für die Endpunkte ohne Paginierung (Plan 7.5 Regel 4).
 *
 * `/accounts/get` kennt kein `limit` und kein `offset` und liefert immer alles. Die Antwort
 * sagt das ausdrücklich, damit der Agent nicht nach `offset` sucht und die Liste für eine
 * erste Seite hält.
 */
export function noPaginationNote(rowsReturned: number): string {
  return (
    `${String(rowsReturned)} Zeilen geliefert. Dieser Endpunkt kennt keine Paginierung: Er ` +
    "liefert immer alle Zeilen, und es gibt weder limit noch offset. Das ist damit das " +
    "vollständige Ergebnis."
  );
}
