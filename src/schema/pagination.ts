// `limit` und `offset` je Endpunkt, mit eigenem Maximum und konservativer Vorgabe.
//
// Die Tabelle steht hier und nicht in den sieben Registereinträgen, weil drei Stellen
// dieselbe Zahl brauchen: das Schema (`maximum`, `default`), die Querprüfung Q2
// und die Bestandszeile der Antwort. Eine zweite Liste wäre eine zweite Wahrheit.
//
// **Es gibt keine Gesamttrefferzahl.** `rows` ist die Zeilenzahl DIESER Antwort, live
// gemessen (`docs/api/grundlagen.md`). Die Abbruchbedingung beim Blättern ist „weniger
// Zeilen als limit“, nicht `rows`.
// Dieses Modul liefert dafür nur die Zahlen; die Sätze selbst baut
// `src/response/pagination-note.ts`.

import { z } from "zod";

/**
 * Was ein Endpunkt mit `limit` und `offset` anstellt.
 *
 * `limitMaximum: null` heißt: **nicht dokumentiert und nicht verifiziert**. Dann steht im
 * Schema kein `maximum`, denn ein zu enges Maximum lehnt gültige Aufrufe ab, bevor ein
 * Request abgeht, und zwar unsichtbar. Ein fehlendes Maximum kostet im
 * schlimmsten Fall einen abgelehnten Request, dessen Fehlermeldung die echte Grenze nennt.
 */
export interface PaginationSpec {
  /** Vorgabe der API, wenn der Aufrufer nichts sendet. `null`, wenn die API keine kennt. */
  readonly apiDefault: number | null;
  /** Unsere Vorgabe. Sie wird immer gesendet, auch wenn der Aufrufer sie weglässt. */
  readonly limitDefault: number;
  /** Belegte Obergrenze, oder `null`, wenn keine dokumentiert ist. */
  readonly limitMaximum: number | null;
}

/**
 * Die sieben Endpunkte mit `limit`/`offset`, maschinell aus der Spezifikation ermittelt.
 * Geschlüsselt ist nach dem **Spezifikationspfad**, nicht nach dem gebauten
 * Pfad: Bei den vier Endpunkten mit Platzhalter wäre der gebaute Pfad nicht konstant
 * — sie führen allerdings ohnehin keine Paginierung.
 *
 * Die drei `settings`-Listen tragen bewusst kein Maximum; die Begründung steht oben bei
 * {@link PaginationSpec} und. Sobald ein lesender Aufruf eine dieser Grenzen
 * klärt, wird sie hier nachgetragen **und** das betroffene Werkzeug in Q2 aufgenommen;
 * beides gehört zusammen.
 */
export const PAGINATION_BY_PATH: Readonly<Record<string, PaginationSpec>> = Object.freeze({
  "/receipts/get": { apiDefault: 500, limitDefault: 100, limitMaximum: 500 },
  "/transactions/get": { apiDefault: 500, limitDefault: 100, limitMaximum: 500 },
  "/postings/get": { apiDefault: null, limitDefault: 100, limitMaximum: 1000 },
  "/cost-locations/get": { apiDefault: null, limitDefault: 200, limitMaximum: 1000 },
  "/settings/get/debtors": { apiDefault: 25, limitDefault: 100, limitMaximum: null },
  "/settings/get/creditors": { apiDefault: 25, limitDefault: 100, limitMaximum: null },
  "/settings/get/postingaccounts": { apiDefault: 1000, limitDefault: 200, limitMaximum: null },
});

/**
 * Der Warnsatz für die drei Listen ohne dokumentierte Obergrenze, wörtlich.
 * Er ersetzt dort die Querprüfung Q2, die ohne belegte Schranke nichts prüfen könnte.
 */
export const UNDOCUMENTED_LIMIT_SENTENCE =
  "Die API dokumentiert hier keine Obergrenze für limit. Wird der Aufruf mit " +
  "'invalid limit specified' abgelehnt, den Wert halbieren.";

/**
 * Der Warnsatz für die beiden Listen, deren Serverstandard 25 Zeilen beträgt.
 *
 * Ohne ausdrückliches `limit` sähen 25 Zeilen aus wie das vollständige Ergebnis. Genau
 * deshalb sendet der Server `limit` immer mit; der Satz sagt dem
 * Aufrufer, warum die Vorgabe hier nicht die der API ist.
 */
export const SMALL_API_DEFAULT_SENTENCE =
  "Ohne ausdrückliches limit liefert die API nur 25 Zeilen; dieses Werkzeug sendet deshalb " +
  "immer ein limit mit.";

/**
 * `limit` mit endpunktspezifischem Maximum und konservativer Vorgabe.
 *
 * Die Vorgabe steht im Schema und nicht im Request-Mapper: Zod setzt sie beim Parsen ein,
 * damit trägt jeder geprüfte Aufruf ein `limit`. Die Zusicherung „kein Listenaufruf geht
 * ohne ausdrückliches `limit` hinaus" ist damit konstruktiv erfüllt statt an einer zweiten
 * Stelle nachgebaut.
 *
 * **Zu `max: null`:** Das erzeugte JSON Schema trägt dann trotzdem ein `maximum`, nämlich
 * `Number.MAX_SAFE_INTEGER`. Das ist die Grenze des JavaScript-Zahlentyps, die Zod an jede
 * Ganzzahl setzt, und ausdrücklich **keine** Aussage über den Endpunkt: Sie kann keinen
 * Aufruf abweisen, den die API annehmen würde. Eine endpunktspezifische Obergrenze steht
 * nur dort, wo sie belegt ist.
 *
 * @param max Belegte Obergrenze oder `null`, wenn keine dokumentiert ist.
 * @param def Unsere Vorgabe.
 */
export function limit(max: number | null, def: number) {
  const base = z
    .number()
    .int({ error: "erwartet wird eine ganze Zahl" })
    .min(1, { error: "muss mindestens 1 sein" });
  // .describe() steht nach .default(), damit `schema.description` die Beschreibung wieder
  // hergibt; im erzeugten JSON Schema landet sie in beiden Reihenfolgen.
  if (max === null) {
    return base.default(def).describe(`Zeilen je Aufruf. ${UNDOCUMENTED_LIMIT_SENTENCE}`);
  }
  return base
    .max(max, { error: `höchstens ${String(max)}` })
    .default(def)
    .describe(
      `Zeilen je Aufruf. Harte Obergrenze ${String(max)}. ` +
        "Größere Werte lehnt die API ab, sie kappt sie nicht.",
    );
}

/** `offset`. Die API kennt keinen Cursor und keine Gesamttrefferzahl. */
export function offset() {
  return z
    .number()
    .int({ error: "erwartet wird eine ganze Zahl" })
    .min(0, { error: "muss 0 oder größer sein" })
    .default(0)
    .describe(
      "Zahl der zu überspringenden Zeilen. Die zweite Seite einer Suche mit limit=100 holt " +
        "offset=100.",
    );
}

/**
 * Die belegte Obergrenze eines Endpunkts, oder `null`. Grundlage der Querprüfung Q2
 * und damit der Grund, warum Q2 an den drei `settings`-Listen ausdrücklich
 * **nicht** hängt.
 */
export function limitMaximumFor(specPath: string): number | null {
  return PAGINATION_BY_PATH[specPath]?.limitMaximum ?? null;
}

/** `true`, wenn dieser Endpunkt überhaupt `limit` und `offset` führt. */
export function hasPagination(specPath: string): boolean {
  return specPath in PAGINATION_BY_PATH;
}

/**
 * Das Paar `limit`/`offset` für einen der sieben Endpunkte.
 *
 * @throws Error bei jedem anderen Pfad. Ein stillschweigend erzeugtes Standardpaar wäre der
 *   falsche Ausweg: Es verdeckt, dass die Tabelle den Pfad nicht führt, und lässt den
 *   Aufrufer glauben, er blättere. Ebenso teuer ist der umgekehrte Fehler, `limit` und
 *   `offset` dort wegzulassen, wo der Endpunkt sie führt: An `/settings/get/postingaccounts`
 *   bleibt der Kontenrahmen dann jenseits der ersten Seite unerreichbar.
 */
export function paginationFor(specPath: string) {
  const spec = PAGINATION_BY_PATH[specPath];
  if (spec === undefined) {
    throw new Error(
      `${specPath} führt laut Spezifikation kein limit und kein offset. ` +
        `Paginierung gibt es an genau diesen Endpunkten: ${Object.keys(PAGINATION_BY_PATH).join(", ")}.`,
    );
  }
  return {
    limit: limit(spec.limitMaximum, spec.limitDefault),
    offset: offset(),
  };
}
