// Die zwölf Werkzeuggruppen als Daten.
//
// **Die Gruppe wird NIEMALS aus dem Werkzeugnamen abgeleitet.** Das ist dieselbe Regel, die
// `classes.ts` für die Werkzeugklasse aufstellt, und sie hat hier zwei belegbare Gründe: Ein
// Zerlegen am zweiten Unterstrich ergäbe `cost` statt `cost_locations` und `payment` statt
// `payment_accounts`, und `bb_records_collect` beginnt nicht mit `bb_bundles_` und liegt
// trotzdem in `bundles`. Jeder Registereintrag trägt seine Gruppe deshalb ausdrücklich im
// Feld `group`; eine fehlende Zeile ist danach ein Übersetzungsfehler und kein stiller
// Ausfall.
//
// Diese Datei enthält ausschließlich die Tabelle. Das Auflösen der beiden Umgebungsvariablen
// und die vier Startfehler stehen in `src/config/tool-groups.ts`, damit das Register nicht von
// der Konfiguration abhängt.
//
// **Zwei Namen sind gegenüber der Messtabelle in `docs/entwicklung/werkzeugkontext-clients.md`
// Abschnitt 5 ausgeschrieben:** `cost_locations` statt `cost` und `payment_accounts` statt
// `payment`. Die Variable tippt ein Mensch, der die Werkzeugnamen `bb_cost_locations_*` und
// `bb_payment_accounts_*` sieht und nicht die Messtabelle; `payment` ließe sich mit Zahlungen
// und Buchungen verwechseln, `cost` mit Kosten allgemein.

export interface ToolGroupDefinition {
  /** Deutscher Anzeigename der Gruppe. Erscheint in Startmeldung, `doctor` und README. */
  readonly label: string;
  /**
   * Was diese Installation nicht mehr beantworten kann, wenn die Gruppe abgeschaltet ist.
   * Steht bei abgeschalteter Gruppe wörtlich in den `instructions`, damit ein Agent nicht
   * nach Werkzeugen sucht, die es hier nicht gibt.
   */
  readonly withoutIt: string;
  /**
   * Die gemessene Tokenzahl der Werkzeugdefinitionen dieser Gruppe, Stand 2026-09-13,
   * `gpt-tokenizer@4.0.0` in der Kodierung `o200k_base`. Die elf Endpunktgruppen sind über
   * `TOOL_ENTRIES` gemessen, `bundles` über `BUNDLE_ENTRIES`.
   *
   * `null` heißt **nicht gemessen**, nicht „null Token"; in diesem Stand trägt jede der zwölf
   * Gruppen eine Zahl. `test/registry/groups.test.ts` rechnet jede davon mit dem echten
   * Tokenizer nach und verlangt eine Zahl, sobald die Gruppe Werkzeuge führt; die Tabelle kann
   * damit nicht unbemerkt veralten. `pnpm measure-tokens` weist die Werte je Gruppe aus.
   */
  readonly measuredTokens: number | null;
}

/**
 * Die zwölf Gruppen, abschließend. Die Reihenfolge ist die der gemessenen Tokenlast, absteigend;
 * `bundles` steht am Ende, weil es als einzige Gruppe keine Endpunktwerkzeuge führt.
 *
 * Eine zusätzliche Gruppe ist eine Entscheidung des Projektinhabers und keine Zeile, die ein
 * Agent nebenbei einfügt: Jeder Name hier wird zum gültigen Wert zweier Umgebungsvariablen und
 * damit zu einer Zusage an jeden, der sie gesetzt hat.
 */
export const TOOL_GROUPS = {
  postings: {
    label: "Buchungen",
    withoutIt: "Buchungen suchen, anlegen, stornieren und Belege an Buchungen binden",
    measuredTokens: 12_213,
  },
  receipts: {
    label: "Belege",
    withoutIt: "Belege suchen, hochladen, anlegen, löschen und wiederherstellen",
    measuredTokens: 8_529,
  },
  transactions: {
    label: "Zahlungen",
    withoutIt: "Zahlungen suchen und anlegen sowie Belege an Zahlungen binden",
    measuredTokens: 6_661,
  },
  invoices: {
    label: "Ausgangsrechnungen",
    withoutIt: "Ausgangsrechnungen, Entwürfe und E-Rechnungen schreiben",
    measuredTokens: 5_766,
  },
  creditors: {
    label: "Kreditoren",
    withoutIt: "Lieferanten nachschlagen, anlegen und ändern",
    measuredTokens: 3_341,
  },
  reports: {
    label: "Berichte",
    withoutIt: "BWA, Summen- und Saldenliste und Kontenblatt erzeugen und abholen",
    measuredTokens: 3_799,
  },
  debtors: {
    label: "Debitoren",
    withoutIt: "Kunden nachschlagen, anlegen und ändern",
    measuredTokens: 3_198,
  },
  postingaccounts: {
    label: "Sachkonten",
    withoutIt: "Sachkonten des Kontenrahmens nachschlagen, anlegen und ändern",
    measuredTokens: 1_877,
  },
  cost_locations: {
    label: "Kostenstellen",
    withoutIt: "Kostenstellen nachschlagen, anlegen, ändern und löschen",
    measuredTokens: 1_839,
  },
  payment_accounts: {
    label: "Zahlungskonten",
    withoutIt: "Zahlungskonten auflisten und anlegen",
    measuredTokens: 1_142,
  },
  comments: {
    label: "Kommentare",
    withoutIt: "einen Kommentar an einen Beleg oder eine Zahlung hängen",
    measuredTokens: 599,
  },
  bundles: {
    label: "Bündelwerkzeuge",
    withoutIt:
      "mehrere Endpunkte in einem Aufruf zusammenfassen, also Stammdatensuche über alle " +
      "Listen, vollständiges Blättern mit Kennzahlen, Zuordnungen aus beiden Richtungen, " +
      "Berichte samt Warteschleife und den Kontostand",
    // Gemessen am 2026-09-13 mit `gpt-tokenizer@4.0.0` in der Kodierung `o200k_base` über
    // `bundleDefinitionJson` aus `src/bundles/schema.ts`, also über die Definition, wie
    // `tools/list` sie ausliefert. Die fünf Summanden: `bb_masterdata_search` 1.406,
    // `bb_records_collect` 1.813, `bb_assignments_get` 1.037, `bb_reports_run` 1.405,
    // `bb_balances_get` 1.191.
    //
    // Die Bündelwerkzeuge stehen NICHT in `index.generated.ts`, weil sie einen eigenen
    // Eintragstyp tragen; `test/registry/groups.test.ts` und `scripts/measure-tokens.ts`
    // messen diese eine Gruppe deshalb über `BUNDLE_ENTRIES` statt über `TOOL_ENTRIES`.
    measuredTokens: 6_852,
  },
} as const satisfies Record<string, ToolGroupDefinition>;

/** Der Name einer der zwölf Gruppen. */
export type ToolGroup = keyof typeof TOOL_GROUPS;

/**
 * Alle zwölf Namen in der Reihenfolge der Tabelle. Sie ist zugleich die Reihenfolge, in der
 * Fehlermeldungen, Startmeldung und `doctor` die Gruppen nennen; eine zweite, abweichende
 * Sortierung gibt es nirgends.
 */
export const TOOL_GROUP_NAMES: readonly ToolGroup[] = Object.freeze(
  Object.keys(TOOL_GROUPS) as ToolGroup[],
);

/**
 * Die Gruppe der Bündelwerkzeuge.
 *
 * **Sie hängt an keiner Endpunktgruppe.** Ein Bündel ruft die HTTP-Schicht auf und nicht die
 * Endpunktwerkzeuge; es wird registriert, sobald `bundles` aktiv ist, unabhängig davon, welche
 * Endpunktgruppen aktiv sind. Die Gegenregel wurde geprüft und verworfen: Unter
 * `BB_MCP_TOOL_GROUPS=bundles` ist keine Endpunktgruppe aktiv, und es würde gar nichts
 * registriert — genau das Profil, für das der Schalter gebaut ist. Der Gruppenschalter spart
 * Kontext; wer den **Zugriff** begrenzen will, nimmt `BB_MCP_READ_ONLY`.
 */
export const BUNDLE_TOOL_GROUP = "bundles" as const satisfies ToolGroup;

/** `true`, wenn der Wert einer der zwölf Gruppennamen ist. */
export function isToolGroup(value: string): value is ToolGroup {
  return Object.hasOwn(TOOL_GROUPS, value);
}

/**
 * Die gemessene Tokenlast der übergebenen Gruppen zusammen.
 *
 * Die Zahlen je Gruppe sind Summen über die einzeln gemessenen Werkzeugdefinitionen; die Summe
 * einer Teilmenge ist damit exakt und keine Hochrechnung. `unmeasured` nennt die Gruppen, deren
 * Zahl noch nicht gemessen ist — sie fehlen in `tokens`, und jede Ausgabe sagt das, statt eine
 * fehlende Messung als 0 auszugeben.
 */
export function measuredTokensOf(groups: readonly ToolGroup[]): {
  readonly tokens: number;
  readonly unmeasured: readonly ToolGroup[];
} {
  let tokens = 0;
  const unmeasured: ToolGroup[] = [];
  for (const group of groups) {
    const measured = TOOL_GROUPS[group].measuredTokens;
    if (measured === null) {
      unmeasured.push(group);
    } else {
      tokens += measured;
    }
  }
  return { tokens, unmeasured: Object.freeze(unmeasured) };
}
