// Der Geschwistertyp zu `ToolEntry`: ein Bündelwerkzeug (Bauvorlage 9 Punkt 1).
//
// **Warum ein eigener Typ.** `ToolEntry` bindet genau einen Endpunkt: `path`,
// `responseContract`, `concise`, `bucket` und `timeoutTier` sind allesamt Singular. Ein Bündel
// in diesen Typ zu zwingen machte jedes dieser Felder mehrdeutig und brächte eine Verzweigung
// in den EINEN generischen Handler (Plan 1.2). Die 54 Endpunktwerkzeuge bleiben nach N1
// unverändert; dieser Typ liegt daneben und nicht darüber.
//
// Bezeichner und Aufzählungswerte sind englisch (E4); deutsch sind nur die Texte, die ein
// Agent liest.
import type { EnvelopeShape, SuccessEnvelope } from "../http/envelope.js";
import type { BucketName } from "../http/rate-limiter.js";
import type { TimeoutTier } from "../http/client.js";
import type { BUNDLE_TOOL_GROUP } from "../registry/groups.js";
import type {
  CrossCheckId,
  DescriptionTier,
  FieldSpec,
  MandatorySentenceId,
  PathSpec,
  ResponseContract,
  ToolClass,
  ToolEffect,
} from "../registry/types.js";
import type { BundleCheckId } from "./cross-checks.js";

/** Die geprüften Argumente eines Bündelaufrufs. */
export type BundleArguments = Record<string, unknown>;

/**
 * Die drei Fehlermodi aus Abschnitt 5 der Bauvorlage. Der Modus steht als Feld im Register
 * und nicht im Code eines Handlers: Ein Bündel improvisiert im Fehlerfall nichts.
 */
export type BundleFailureMode = "abort" | "independent" | "prefix";

/**
 * Die Gründe, aus denen ein Bündel vorzeitig aufhört. Abschließend, aus Abschnitt 3.
 *
 * **`time_limit` ist ein Wert mehr, als Abschnitt 3 aufzählt**, und er ist begründet:
 * `bb_reports_run` wartet auf eine serverseitige Berechnung und hört auf, wenn sein Zeitbudget
 * (`max_wait_seconds`) erschöpft ist. Das ist weder `rate_limit` noch `error` — den Lauf als
 * `error` zu bezeichnen behauptete einen Fehler, wo keiner vorliegt, und der Bericht wird in
 * aller Regel gerade fertig. Die fünf Werte der Bauvorlage stehen unverändert; kein anderes
 * Bündel muss den Zusatz benutzen.
 */
export type BundleStopReason =
  | "page_limit"
  | "row_limit"
  | "rate_limit"
  | "response_size"
  | "time_limit"
  | "error";

/**
 * Ein Schritt eines Bündels. Er trägt seinen eigenen Endpunkt und seinen eigenen Vertrag.
 *
 * `fallbackTool` ist Regel R7: Jede Lücke trägt den Einzelaufruf, der sie schließt. Die 54
 * Endpunktwerkzeuge bleiben nach N1 bestehen; ein Bündel ist nie die einzige Tür.
 */
export interface BundleStep {
  /** Interner Schlüssel, über den der Ablauf seinen Schritt nachschlägt. */
  readonly id: string;
  readonly path: PathSpec;
  readonly role: "required" | "optional" | "enrichment";
  readonly shape: EnvelopeShape;
  readonly responseContract: ResponseContract;
  readonly concise: readonly string[];
  readonly bucket: BucketName;
  readonly timeoutTier: TimeoutTier;
  /** Die Klasse DIESES Schritts. Die Klasse des Bündels ist die schärfste seiner Schritte. */
  readonly toolClass: ToolClass;
  /** Das Endpunktwerkzeug hinter demselben Pfad, für Lücken und Anschlusssätze (R7). */
  readonly fallbackTool: string;
}

/** Was ein Bündel in `structuredContent` legt, und die Zeilen seines Textblocks. */
export type BundleOutcome =
  | {
      readonly kind: "ok";
      /** Die eigenen Blöcke. Der Block `bundle` kommt vom Ablauf und nicht von hier. */
      readonly data: Record<string, unknown>;
      /**
       * Die Zeilen nach Warnung und Lücken, in der Reihenfolge aus R6: erst Herkunft, dann
       * Daten, dann Bestand, dann Anschluss. Leere Zeichenketten entfallen.
       */
      readonly lines: readonly string[];
      /**
       * Der Mittelteil der Unvollständigkeitszeile aus R6, zum Beispiel „abgebrochen bei
       * offset 1000 nach 2 Seiten". Ohne Angabe nennt der Ablauf die Zahl der Aufrufe.
       */
      readonly incompleteDetail?: string;
    }
  | {
      /** Es gibt nichts zu berichten: kein einziger Schritt war erfolgreich (Abschnitt 5). */
      readonly kind: "error";
      readonly text: string;
    };

/** Das Ergebnis eines Teilaufrufs, wie der Ablauf es sieht. */
export type StepResult =
  | { readonly ok: true; readonly envelope: SuccessEnvelope; readonly rows: number }
  | {
      readonly ok: false;
      /** `budget`: Aufrufobergrenze; `rate_limit`: Eimer; `error`: die API oder das Netz. */
      readonly kind: "budget" | "rate_limit" | "error";
      /**
       * `true`, wenn der ganze Lauf sofort endet: `error_code` 3, 4 und 11 sowie zwei
       * aufeinanderfolgende 5xx desselben Endpunkts (Abschnitt 5, Regel 3).
       */
      readonly fatal: boolean;
      /** Der vollständige Fehlertext des bestehenden Renderers, Vierblockaufbau aus 5.8. */
      readonly text: string;
      /** Eine Zeile für die Lückenliste, ohne Blöcke. */
      readonly summary: string;
      readonly errorCode: number | null;
    };

/** Ein Teilaufruf, so wie ein Ablauf ihn beauftragt. */
export interface StepCall {
  /** Der Schlüssel aus {@link BundleStep.id}. */
  readonly step: string;
  /** Der Body ohne `api_key`; der setzt ausschließlich die HTTP-Schicht. */
  readonly body?: Readonly<Record<string, unknown>>;
  /** Der Wert des Pfadsegments bei einem Schritt mit Pfadvorlage (Plan 4.6). */
  readonly pathValue?: string | number;
  /** `true` für jeden Aufruf nach dem ersten: nur dort wird auf den Eimer geschaut (6.5). */
  readonly additional?: boolean;
  /**
   * `error_code`-Werte, die für diesen Schritt ein **Zustand** und kein Fehler sind.
   *
   * Sie beenden den Lauf nicht, setzen `stopped_because` nicht und gelten nicht als erster
   * Fehlschlag. Der Schritt steht trotzdem in der Schrittliste, mit seinem Grund. Gebraucht
   * wird das genau einmal: `error_code` 8 an `/reports/get/*` heißt „die Erzeugung läuft
   * noch" und ist nach `docs/api/berichte.md` 6.7 Punkt 6 ausdrücklich kein Fehler im engeren
   * Sinne. Ohne diese Angabe machte die Warteschleife aus jedem Wartetakt einen Fehlschlag.
   */
  readonly tolerate?: readonly number[];
}

/** Eine Lücke: was fehlt, warum, und der Einzelaufruf, der sie schließt (R7). */
export interface BundleGap {
  readonly what: string;
  readonly why: string;
  readonly next_step: string;
}

/**
 * Der Vertrag, den jedes Bündel gegenüber seinem Ablauf erfüllt. Der Ablauf zählt Aufrufe,
 * führt die Schrittliste und entscheidet über `complete`; das Bündel wertet aus. Deshalb kann
 * kein Bündel seine eigene Buchführung vergessen.
 */
export interface BundleContext {
  readonly entry: BundleEntry;
  /** Die wirksame Obergrenze `min(maxCalls, floor(BB_MCP_RATE_LIMIT / 3))` (6.3). */
  readonly maxCalls: number;
  /** Die Projektion aus `response_format`. */
  readonly projection: "concise" | "detailed";
  /** Die weiche Antwortgrenze in Token (`BB_MCP_MAX_RESPONSE_TOKENS`). */
  readonly maxResponseTokens: number;
  /**
   * Der gehashte `api_key` des verbundenen Mandanten, derselbe Schlüssel wie im Token-Eimer.
   *
   * Er ist kein Geheimnis: Abgelegt wird der Hash und nicht der Schlüssel, damit er in keiner
   * Diagnoseausgabe auftaucht. Gebraucht wird er dort, wo ein Bündel prozesslokal je Mandant
   * serialisieren muss — bei `bb_reports_run`, damit zwei gleichzeitige Läufe desselben
   * Berichtstyps einander nicht den Bericht entwerten.
   */
  readonly tenant: string;
  /** Setzt einen Teilaufruf ab. Zählt ihn, trägt ihn in die Schrittliste ein. */
  call(request: StepCall): Promise<StepResult>;
  /** Nimmt eine Lücke auf und setzt `complete` auf false. */
  gap(gap: BundleGap): void;
  /** Hält fest, warum der Lauf aufgehört hat. Der erste Grund gewinnt. */
  stop(reason: BundleStopReason): void;
  /** Setzt den Folgeaufruf, der genau dort weitermacht, wo dieser Lauf aufgehört hat. */
  continueWith(continuation: Record<string, unknown>): void;
  /** `true`, solange nichts `complete` widerlegt hat. */
  isComplete(): boolean;
  /** Zahl der bisher abgesetzten Teilaufrufe. */
  callsUsed(): number;
  /** Die Bestandszeile des Textblocks: verbrauchte Aufrufe gegen die Obergrenze. */
  callBudgetLine(): string;
  /** Die Antwort, wenn nicht ein einziger Schritt erfolgreich war. */
  errorOutcome(failure: StepResult & { ok: false }): BundleOutcome;
  /**
   * Hält fest, was dieser Lauf im Mandanten verändert hat — Klartext für `bundle.written`.
   *
   * Die vier lesenden Bündel rufen das nie auf; `written` bleibt dann leer, und leer heißt
   * nachweislich „nichts geschrieben". `bb_reports_run` ruft es unmittelbar nach dem
   * erfolgreichen `create` auf, und zwar auch im Erfolgsfall: Ab diesem Augenblick ist der
   * zuvor erzeugte Bericht desselben Typs ersetzt, und jede weitere Antwort dieses Laufs sagt
   * das (Abschnitt 4.4 Risiko 1).
   */
  wrote(text: string): void;
  /**
   * Wartet. Bricht der Client ab, endet das Warten mit einer Ablehnung.
   *
   * Es gibt genau einen Grund, warum ein Bündel schläft: eine serverseitige Berechnung, auf
   * die es pollen muss. Ein Modell kann nicht schlafen, es kann nur erneut aufrufen, und jeder
   * Wartetakt wäre sonst eine eigene Modellrunde.
   */
  sleep(ms: number): Promise<void>;
  /**
   * Ersetzt den Block `[Wie]` der Fehlermeldung, falls dieser Lauf als Fehler endet.
   *
   * Der Vierblockaufbau aus 5.8 bleibt dabei erhalten, ebenso der Zustandssatz: Ersetzt wird
   * ausschließlich die Handlungsanweisung. Gebraucht wird das, wo der allgemeine Katalogtext
   * einen Agenten in die falsche Richtung schickt — bei `error_code` 12 etwa lautet die
   * Anweisung der Spezifikation sinngemäß „warten und erneut anlegen", und genau das
   * entwertete den Bericht, an dem gerade jemand anders arbeitet.
   */
  explainNextStep(text: string): void;
}

/** Der Ablauf eines Bündels. Genau eine Funktion je Bündel, im Registereintrag selbst. */
export type BundleRun = (ctx: BundleContext, args: BundleArguments) => Promise<BundleOutcome>;

/**
 * Ein Bündelwerkzeug, vollständig als Daten — bis auf den Ablauf, der notwendig Code ist.
 *
 * `toolClass` ist die **schärfste Klasse der Schritte** und wird nicht frei gesetzt; der
 * Vertragstest rechnet sie nach. Wer einem lesenden Bündel später einen schreibenden Schritt
 * hinzufügt, bricht den Test, statt den Nur-Lesen-Schalter stillschweigend zu entwerten.
 */
export interface BundleEntry {
  readonly name: string;
  readonly title: string;
  readonly group: typeof BUNDLE_TOOL_GROUP;
  readonly effect: ToolEffect;
  readonly toolClass: ToolClass;
  readonly tier: DescriptionTier;
  readonly description: string;
  readonly mandatorySentence?: MandatorySentenceId;
  readonly fields: readonly FieldSpec[];
  readonly serverOnlyFields: readonly string[];
  readonly steps: readonly BundleStep[];
  /** Die deklarierte Aufrufobergrenze aus Abschnitt 6 Punkt 2. */
  readonly maxCalls: number;
  /** Token, die ohne Warten bereitliegen müssen, sonst Absage vor dem ersten Request (6.4). */
  readonly minTokens: number;
  readonly failureMode: BundleFailureMode;
  readonly crossChecks: readonly CrossCheckId[];
  readonly bundleChecks: readonly BundleCheckId[];
  /** Die Wörter, die eine Buchhalterin sagt. Wird als `anthropic/searchHint` ausgeliefert. */
  readonly searchHint: readonly string[];
  /** Die eigenen Eigenschaften des `outputSchema`; der Block `bundle` kommt automatisch. */
  readonly outputProperties: Readonly<Record<string, unknown>>;
  readonly outputRequired: readonly string[];
  readonly run: BundleRun;
}
