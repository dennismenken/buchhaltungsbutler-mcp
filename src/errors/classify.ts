/**
 * Einordnung einer Fehlerantwort in eine der fünf Klassen aus Plan 5.6.
 *
 * **Die Weiche hängt am Tripel (`specPath`, `error_code`, HTTP-Status) und an keiner Stelle
 * an einem Vergleich gegen einen Meldungstext.** Das ist gemessen begründet (Plan 0.3
 * Befund L6): `/receipts/get` liefert zu Code 15 live `invalid field specified` und damit
 * weder den Text der `description` (`invalid sort field is specified`) noch den des
 * `message`-Enums (`invalid sort field specified`). Eine Weiche auf einen dieser Texte wäre
 * ein stiller Fehlschlag in Wartestellung — sie griffe einfach nie.
 *
 * Wo der Meldungstext überhaupt ausgewertet wird, nämlich bei der Klasse `special`, geschieht
 * das über **Teilzeichenketten ohne Rücksicht auf Groß- und Kleinschreibung** und niemals
 * über Gleichheit. Dafür gibt es in dieser Datei genau eine Funktion,
 * {@link containsInsensitive}, und genau einen `toLowerCase`-Aufruf; ein Test hält beides
 * fest (`test/unit/errors-classify.test.ts`).
 *
 * Die Klasse steht als `cls` im Generat und wird dort beim Erzeugen bestimmt (AP03). Diese
 * Datei schlägt sie nach, setzt ihr aber für die Codes, an denen der **HTTP-Status** die
 * Bedeutung entscheidet, eine eigene, von Hand gepflegte Regeltabelle voran. Das ist keine
 * Doppelung aus Bequemlichkeit: Der Katalog führt je Paar genau einen Status, die Antwort
 * trägt aber den tatsächlichen. Weichen beide voneinander ab, gilt die Regel, die den
 * **gemessenen** Status auswertet, und nicht der Katalogwert. Für die Paare, bei denen Regel
 * und Katalog beide greifen, prüft ein Test über alle 786 Paare, dass sie dasselbe sagen.
 */

import { logWarn } from "../logging/stderr.js";
import {
  type ErrorCatalog,
  type ErrorClass,
  type ErrorEntry,
  loadErrorCatalog,
  lookupInCatalog,
} from "./catalog.js";

/**
 * Die zehn Pfade, die `error_code` 15 mit HTTP 403 als vorübergehende Drosselung führen
 * (Plan 5.6, Fußnote; `grundlagen.md` 7.3 nennt dieselben zehn).
 *
 * Die Liste ist hier **absichtlich ein zweites Mal** gepflegt, unabhängig von der Liste im
 * Generator. Sie entscheidet über Retry ja oder nein, und eine Liste, die nur an einer Stelle
 * steht, lässt sich nicht gegenprüfen; `test/unit/errors-class-review.test.ts` hält beide
 * gegen den Katalog.
 *
 * `/transactions/add` ist der Pfad, der leicht durchrutscht: Er ist weder Stapel- noch
 * Upload-Endpunkt, trägt aber dieselbe Drosselung mit derselben Meldung. Eine Regel, die nur
 * Stapel und Upload nennt, stufte ihn als `final` ein — und der Agent läse bei einer echten,
 * vorübergehenden Drosselung, ein späterer Versuch helfe nicht.
 */
export const THROTTLE_PATHS: readonly string[] = [
  "/receipts/addBatch",
  "/receipts/upload",
  "/transactions/add",
  "/transactions/addBatch",
  "/transactions/assign-batch/receipt",
  "/postings/add-batch/receipts",
  "/postings/add-batch/transactions",
  "/postings/add-batch/free",
  "/settings/add-batch/debtors",
  "/settings/add-batch/creditors",
];

/** Der `error_code`, der an zehn schreibenden Pfaden mit HTTP 403 Drosselung bedeutet. */
export const THROTTLE_ERROR_CODE = 15;

/** Woher die Klasse stammt. Sie steht in der Audit-Zeile und macht Tests aussagekräftig. */
export type ClassOrigin = "catalog" | "runtime-rule" | "fallback";

/** Die Tatsachen, über die eingeordnet wird. Ein Meldungstext ist nur bei `special` dabei. */
export interface FailureFacts {
  /** Der unveränderte Spezifikationspfad, niemals der gebaute Pfad (Plan 4.6 Regel 6). */
  readonly specPath: string;
  readonly errorCode: number | null;
  /** Der **tatsächliche** HTTP-Status der Antwort; `null`, wenn keine Antwort zustande kam. */
  readonly status: number | null;
  /** Der Wortlaut der Antwort. Wird ausschließlich über Teilzeichenketten geprüft. */
  readonly apiMessage: string | null;
}

/** Eine der Lesarten eines Paares, dessen Bedeutung ohne den Meldungstext offen ist. */
export interface SpecialReading {
  /** Maschinenlesbare Kennung der Lesart, für Tests und für die Audit-Zeile. */
  readonly id: string;
  /** Der Parameter, auf den sich diese Lesart bezieht, sofern der Endpunkt ihn führt. */
  readonly field?: string;
  /** Deutscher Hinweis für den Block `[Wie]`. */
  readonly guidance: string;
}

export interface Classification {
  readonly cls: ErrorClass;
  readonly origin: ClassOrigin;
  /** Der Katalogeintrag, oder `null`, wenn die Spezifikation dieses Paar nicht führt. */
  readonly entry: ErrorEntry | null;
  /** Der beanstandete Parameter, soweit eindeutig; sonst `null`. */
  readonly field: string | null;
  /** Bei `special` die erkannte Lesart; `null`, wenn kein Muster griff. */
  readonly reading: SpecialReading | null;
  /** Der Sonderfalltext zu diesem Paar aus Plan 5.6, unabhängig von der Klasse. */
  readonly guidance: string | null;
  /**
   * `true`, wenn die Rückfallregel gegriffen hat: Das Paar fehlt im Katalog, oder es ist als
   * `special` geführt, und kein Muster passte auf den gelieferten Text. Beides wird als
   * `final` behandelt, der Originaltext wörtlich zitiert und eine `warn`-Zeile geschrieben.
   */
  readonly fallback: boolean;
}

// ---------------------------------------------------------------------------------------
// Handgepflegte Regeltabelle: die Codes, bei denen der HTTP-Status die Bedeutung entscheidet
// (Plan 5.3, 5.6). Reihenfolge ist bedeutsam, die erste passende Regel gewinnt.
// ---------------------------------------------------------------------------------------

interface StatusRule {
  readonly id: string;
  readonly code: number;
  /** Der verlangte HTTP-Status; `null`, wenn die Regel für jeden Status gilt. */
  readonly status: number | null;
  /** Die Pfade, für die die Regel gilt; `null` heißt endpunktübergreifend. */
  readonly paths: readonly string[] | null;
  readonly cls: ErrorClass;
}

const STATUS_RULES: readonly StatusRule[] = [
  // Zugangsdaten und Mandantenstatus. Diese drei Codes tragen endpunktübergreifend dieselbe
  // Bedeutung (Plan 5.6, `fehlercodes.md` A) und sind deshalb vom Status unabhängig.
  { id: "credentials", code: 3, status: null, paths: null, cls: "config" },
  { id: "customer", code: 4, status: null, paths: null, cls: "config" },
  { id: "customer-inactive", code: 11, status: null, paths: null, cls: "config" },
  // Vorübergehende Zustände. Code 0 gehört zu HTTP 500, Code 30 zu HTTP 504.
  { id: "server-internal", code: 0, status: 500, paths: null, cls: "transient" },
  { id: "gateway-timeout", code: 30, status: 504, paths: null, cls: "transient" },
  // Die zehn Drosselungspaare. Unterschieden wird über den STATUS, nicht über den Wortlaut:
  // Der Katalog führt dort `adding temporarily restricted` beziehungsweise
  // `upload temporarily restricted`, an `/receipts/get` dagegen `invalid sort field
  // specified` — und live kam dort ein dritter Text (L6).
  {
    id: "throttle",
    code: THROTTLE_ERROR_CODE,
    status: 403,
    paths: THROTTLE_PATHS,
    cls: "transient",
  },
  // Das elfte Paar mit Code 15: `/receipts/get` mit HTTP 400. Es bleibt eine Eingabeprüfung
  // und wird nie wiederholt. Es ist der einzige Pfad, an dem Code 15 nicht 403 ist.
  { id: "sort-field", code: THROTTLE_ERROR_CODE, status: 400, paths: null, cls: "input" },
];

// ---------------------------------------------------------------------------------------
// Die vier Sonderfälle aus Plan 5.6, ausformuliert. Schlüssel ist `<specPath>|<error_code>`.
//
// Die Werkzeugnamen stammen aus der Tabelle in Plan 3.8. Sie stehen hier wörtlich, weil der
// Hinweis ein ANDERES Werkzeug nennt als das aufgerufene und der Registereintrag des
// aufgerufenen Werkzeugs diesen Verweis nicht kennt.
// ---------------------------------------------------------------------------------------

const SPECIAL_CASE_TEXTS: ReadonlyMap<string, string> = new Map([
  // Sonderfall 1: Code 8 an den beiden Abholpfaden ist kein Fehler, sondern ein Zwischenstand.
  [
    "/reports/get/bwa|8",
    "Die Auswertung wird noch erzeugt. Etwa zwei Sekunden warten und bb_reports_get_bwa mit " +
      "denselben Argumenten erneut aufrufen. bb_reports_create_bwa nicht noch einmal aufrufen, " +
      "das würde die laufende Erzeugung verwerfen.",
  ],
  [
    "/reports/get/sums|8",
    "Die Auswertung wird noch erzeugt. Etwa zwei Sekunden warten und bb_reports_get_sums mit " +
      "denselben Argumenten erneut aufrufen. bb_reports_create_sums nicht noch einmal aufrufen, " +
      "das würde die laufende Erzeugung verwerfen.",
  ],
  // Sonderfall 2: Code 7 an denselben Pfaden nennt die Vorbedingung und den Schalter, der sie
  // sperrt. Die Klasse bleibt `final` — es fehlt ein Zustand, nicht ein Eingabewert.
  [
    "/reports/get/bwa|7",
    "Für diesen Mandanten liegt keine erzeugte BWA vor. bb_reports_create_bwa ist die " +
      "Vorbedingung und muss zuerst laufen; danach bb_reports_get_bwa mit denselben Argumenten " +
      "erneut aufrufen. Ist BB_MCP_READ_ONLY gesetzt, ist bb_reports_create_bwa gesperrt, und " +
      "die BWA ist über diesen Server nicht zu erzeugen.",
  ],
  [
    "/reports/get/sums|7",
    "Für diesen Mandanten liegt keine erzeugte Summen- und Saldenliste vor. " +
      "bb_reports_create_sums ist die Vorbedingung und muss zuerst laufen; danach " +
      "bb_reports_get_sums mit denselben Argumenten erneut aufrufen. Ist BB_MCP_READ_ONLY " +
      "gesetzt, ist bb_reports_create_sums gesperrt, und die Liste ist über diesen Server nicht " +
      "zu erzeugen.",
  ],
  // Sonderfall 3: Code 12 an den beiden Erzeugungspfaden. Warten und abholen, nicht erneut
  // erzeugen — ein zweiter Erzeugungsaufruf verwirft den laufenden.
  [
    "/reports/create/bwa|12",
    "Eine BWA-Erzeugung läuft bereits. Etwa zwei Sekunden warten und das Ergebnis mit " +
      "bb_reports_get_bwa abholen. bb_reports_create_bwa nicht erneut aufrufen: Das verwirft die " +
      "laufende Erzeugung und fängt von vorn an.",
  ],
  [
    "/reports/create/sums|12",
    "Eine Erzeugung der Summen- und Saldenliste läuft bereits. Etwa zwei Sekunden warten und " +
      "das Ergebnis mit bb_reports_get_sums abholen. bb_reports_create_sums nicht erneut " +
      "aufrufen: Das verwirft die laufende Erzeugung und fängt von vorn an.",
  ],
  // Sonderfall 4: Tarifkontingent, kein Minutenlimit. Die drei Paare sind maschinell gegen die
  // Spezifikation geprüft: An `/receipts/upload` trägt das Kontingent den Code 12 (HTTP 403),
  // Code 33 heißt dort `file name is not specified` (HTTP 400). `/invoices/create/draft` führt
  // überhaupt keinen Code 33. Eine Regel „Code 33 an allen /invoices/create*" träfe also den
  // falschen Pfad und ein Paar, das es nicht gibt.
  [
    "/receipts/upload|12",
    "Das Upload-Kontingent des Tarifs ist erschöpft. Das ist kein Minutenlimit: Ein späterer " +
      "Versuch hilft nicht, solange das Kontingent nicht erhöht oder der Abrechnungszeitraum " +
      "nicht gewechselt ist. Der Tarif ist in BuchhaltungsButler zu prüfen; dieser Server kann " +
      "daran nichts ändern. Ein Beleg ohne Datei lässt sich weiter über bb_receipts_create " +
      "anlegen.",
  ],
  [
    "/invoices/create|33",
    "Das Kontingent des Tarifs ist erschöpft. Das ist kein Minutenlimit: Ein späterer Versuch " +
      "hilft nicht, solange das Kontingent nicht erhöht oder der Abrechnungszeitraum nicht " +
      "gewechselt ist. Der Tarif ist in BuchhaltungsButler zu prüfen; dieser Server kann daran " +
      "nichts ändern.",
  ],
  [
    "/invoices/create/e-invoice|33",
    "Das Kontingent des Tarifs ist erschöpft. Das ist kein Minutenlimit: Ein späterer Versuch " +
      "hilft nicht, solange das Kontingent nicht erhöht oder der Abrechnungszeitraum nicht " +
      "gewechselt ist. Der Tarif ist in BuchhaltungsButler zu prüfen; dieser Server kann daran " +
      "nichts ändern.",
  ],
]);

// ---------------------------------------------------------------------------------------
// Klasse `special`: Paare, deren Bedeutung ohne den Meldungstext nicht eindeutig ist.
//
// Bei zwei Paaren ist das nachweisbar und nicht bloß unübersichtlich: Die Spezifikation
// beschriftet zwei verschiedene Antworten mit verschiedenen Schlüsseln, lässt beide
// Definitionen aber denselben `error_code` deklarieren (maschinell geprüft am 2026-09-12,
// ebenso in `docs/api/fehlercodes.md`, Abschnitt „Name/Wert-Widersprüche"):
//
//   /transactions/add          Antwortschlüssel "400 (24)" → Definition deklariert error_code 23
//   /invoices/create/e-invoice Antwortschlüssel "400 (41)" → Definition deklariert error_code 42
//
// Die API kann also zu zwei fachlich völlig verschiedenen Fehlern denselben Code senden, und
// am Code allein sind sie nicht zu unterscheiden. Deshalb — und nur deshalb — wertet diese
// Datei hier den Text aus, über Teilzeichenketten und ohne Rücksicht auf Groß- und
// Kleinschreibung. Greift kein Muster, gilt die Rückfallregel: `final`, Originaltext wörtlich,
// `warn`-Zeile.
//
// Beide Codes eines Paares tragen dieselben Lesarten, damit die Einordnung nicht davon
// abhängt, welchen der beiden Werte die API tatsächlich sendet.
// ---------------------------------------------------------------------------------------

interface SpecialDefinition {
  /** Warum dieses Paar ohne den Text offen ist. Steht im Block `[Was]` der Meldung. */
  readonly ambiguity: string;
  readonly readings: readonly (SpecialReading & { readonly patterns: readonly string[] })[];
}

const TRANSACTIONS_ADD_SPECIAL: SpecialDefinition = {
  ambiguity:
    "Die Spezifikation führt an /transactions/add zwei verschiedene Fehler mit demselben " +
    "error_code 23; am Code allein sind sie nicht zu unterscheiden.",
  readings: [
    {
      id: "transactions-add-booking-text",
      patterns: ["booking text", "booking_text", "buchungstext"],
      field: "booking_text",
      guidance:
        "BuchhaltungsButler hat den Buchungstext beanstandet. Den Wert von booking_text " +
        "korrigieren — er ist ein freier Text ohne Steuerzeichen — und bb_transactions_create " +
        "erneut aufrufen. Die übrigen Felder der Zahlung bleiben unverändert.",
    },
    {
      id: "transactions-add-no-body",
      patterns: ["post and files", "content received", "declined"],
      guidance:
        "BuchhaltungsButler hat den Rumpf der Anfrage nicht verwertet. Das ist kein Fehler in " +
        "einem einzelnen Feld: Die Pflichtfelder account, to_from, amount und booking_date " +
        "prüfen und bb_transactions_create mit vollständigen Werten erneut aufrufen.",
    },
  ],
};

const EINVOICE_SPECIAL: SpecialDefinition = {
  ambiguity:
    "Die Spezifikation führt an /invoices/create/e-invoice zwei verschiedene Fehler mit " +
    "demselben error_code 42; am Code allein sind sie nicht zu unterscheiden.",
  readings: [
    {
      id: "einvoice-id",
      patterns: ["e_invoice_id"],
      field: "e_invoice_id",
      guidance:
        "BuchhaltungsButler hat e_invoice_id beanstandet. Den Wert korrigieren und " +
        "bb_invoices_create_einvoice erneut aufrufen.",
    },
    {
      id: "einvoice-type",
      // Die Meldung nennt `e_invoice_type`. Ein Parameter dieses Namens existiert an diesem
      // Endpunkt NICHT — maschinell geprüft über alle 54 Pfade und alle Definitionen der
      // Spezifikation; das einzige e_invoice-Feld im Rumpf ist `e_invoice_id`. Der Hinweis
      // nennt deshalb kein Feld, das es nicht gibt, sondern sagt genau das.
      patterns: ["e_invoice_type"],
      guidance:
        "BuchhaltungsButler nennt e_invoice_type. Einen Parameter dieses Namens führt der " +
        "Endpunkt nicht; im Rumpf gibt es nur e_invoice_id. Wahrscheinlich beanstandet die API " +
        "die Art des übergebenen E-Rechnungsdokuments. Die Meldung ist wörtlich oben zitiert und " +
        "in der Weboberfläche von BuchhaltungsButler nachzuvollziehen; dieser Server kann den " +
        "Bezug nicht auflösen, ohne zu raten.",
    },
  ],
};

const SPECIAL_DEFINITIONS: ReadonlyMap<string, SpecialDefinition> = new Map([
  ["/transactions/add|23", TRANSACTIONS_ADD_SPECIAL],
  ["/transactions/add|24", TRANSACTIONS_ADD_SPECIAL],
  ["/invoices/create/e-invoice|41", EINVOICE_SPECIAL],
  ["/invoices/create/e-invoice|42", EINVOICE_SPECIAL],
  // Die vier Berichtspaare sind ebenfalls `special`, ihre Bedeutung ist aber über das Paar
  // eindeutig: Code 8 an den Abholpfaden heißt Zwischenstand, Code 12 an den Erzeugungspfaden
  // heißt „läuft bereits". Hier wird kein Text ausgewertet, weil es nichts zu unterscheiden
  // gibt; der Hinweis kommt aus SPECIAL_CASE_TEXTS.
]);

/** Der einzige Ort dieser Datei, an dem ein Meldungstext überhaupt angesehen wird. */
function containsInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/** Der Schlüssel beider Handtabellen. */
function pairKey(specPath: string, errorCode: number): string {
  return `${specPath}|${errorCode}`;
}

/** Die erste Regel, die auf Code, Status und Pfad passt; sonst `null`. */
function matchStatusRule(
  specPath: string,
  errorCode: number,
  status: number | null,
): StatusRule | null {
  for (const rule of STATUS_RULES) {
    if (rule.code !== errorCode) {
      continue;
    }
    if (rule.status !== null && rule.status !== status) {
      continue;
    }
    if (rule.paths !== null && !rule.paths.includes(specPath)) {
      continue;
    }
    return rule;
  }
  return null;
}

/** Die Lesart, deren Muster im gelieferten Text vorkommt; sonst `null`. */
function resolveReading(definition: SpecialDefinition, apiMessage: string | null) {
  if (apiMessage === null) {
    return null;
  }
  for (const reading of definition.readings) {
    for (const pattern of reading.patterns) {
      if (containsInsensitive(apiMessage, pattern)) {
        return reading;
      }
    }
  }
  return null;
}

/** Die Mehrdeutigkeit dieses Paares in einem Satz, sofern es eine benannte gibt. */
export function describeAmbiguity(specPath: string, errorCode: number | null): string | null {
  if (errorCode === null) {
    return null;
  }
  return SPECIAL_DEFINITIONS.get(pairKey(specPath, errorCode))?.ambiguity ?? null;
}

/**
 * Ordnet eine Fehlerantwort ein, mit einem bereits geladenen Katalog.
 *
 * Die Reihenfolge ist Absicht:
 *
 * 1. Fehlt das Paar im Katalog, greift die Rückfallregel. **Kein Raten, keine Zuordnung zu
 *    einem gleichnamigen Code eines anderen Pfades** (Plan 5.6).
 * 2. Passt eine Statusregel, gewinnt sie. Sie wertet den **tatsächlichen** Status aus.
 * 3. Sonst gilt die Klasse des Katalogs. Sie wurde beim Erzeugen bestimmt; ein abweichender
 *    Live-Text kann sie nicht kippen.
 */
export function classifyWithCatalog(catalog: ErrorCatalog, facts: FailureFacts): Classification {
  const { specPath, errorCode, status, apiMessage } = facts;
  const entry = lookupInCatalog(catalog, specPath, errorCode);

  if (entry === null || errorCode === null) {
    logWarn(
      `Unbekanntes Fehlerpaar (${specPath}, error_code ${errorCode ?? "fehlt"}, HTTP ` +
        `${status ?? "ohne Antwort"}). Die Spezifikation führt dieses Paar nicht; der Fall wird ` +
        "als endgültig behandelt und der Originaltext unverändert zitiert.",
    );
    return {
      cls: "final",
      origin: "fallback",
      entry: null,
      field: null,
      reading: null,
      guidance: null,
      fallback: true,
    };
  }

  const key = pairKey(specPath, errorCode);
  const guidance = SPECIAL_CASE_TEXTS.get(key) ?? null;
  const rule = matchStatusRule(specPath, errorCode, status ?? entry.status);
  const cls: ErrorClass = rule?.cls ?? entry.cls;
  const origin: ClassOrigin = rule === null ? "catalog" : "runtime-rule";
  const field = entry.field ?? null;

  const definition = SPECIAL_DEFINITIONS.get(key);
  if (cls === "special" && definition !== undefined) {
    const reading = resolveReading(definition, apiMessage);
    if (reading === null) {
      // Bekanntes Paar, aber kein Muster passte. Dieselbe Rückfallregel wie beim fehlenden
      // Paar: als endgültig behandeln, Originaltext zitieren, `warn` schreiben. Der
      // Katalogeintrag bleibt erhalten, damit die Meldung die Kurzfassung weiter nennen kann.
      logWarn(
        `Sonderfall ohne passendes Muster (${specPath}, error_code ${errorCode}). Der ` +
          "gelieferte Text passt auf keine der bekannten Lesarten; der Fall wird als endgültig " +
          "behandelt und der Originaltext unverändert zitiert.",
      );
      return {
        cls: "final",
        origin: "fallback",
        entry,
        field,
        reading: null,
        guidance,
        fallback: true,
      };
    }
    return {
      cls,
      origin,
      entry,
      field: reading.field ?? field,
      reading,
      guidance,
      fallback: false,
    };
  }

  return { cls, origin, entry, field, reading: null, guidance, fallback: false };
}

/** Wie {@link classifyWithCatalog}, lädt den Katalog aber selbst nach (dynamisch, Plan 5.6). */
export async function classifyFailure(facts: FailureFacts): Promise<Classification> {
  return classifyWithCatalog(await loadErrorCatalog(), facts);
}
