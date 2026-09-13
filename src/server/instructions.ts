// Die `instructions` des Servers nach Plan 6.7 (AP14).
//
// Dies ist das einzige Dokument, das jeder Agent ohnehin sieht. Es trägt deshalb alles, was
// für jedes Werkzeug gleich gilt, **genau einmal** statt einmal je Definition
// (Plan 1.1, Sparmaßnahme S1 aus 4.10): Zustand, Selbstauskunft, Kontenkunde,
// Querschnittsregeln, Paginierung, Buchungswegweiser, Schreibhinweis, Resource-Liste.
//
// Zwei Grenzen halten diesen Text kurz, und beide sind gemessen und nicht geschätzt:
// 2.100 Token (INSTRUCTIONS_TOKEN_BUDGET, geprüft in P11 mit dem echten Tokenizer aus
// Plan 13.9) und die Regel aus 4.10, dass alles Weitere in eine Resource gehört, weil eine
// Resource nur dann Kontext kostet, wenn der Agent sie liest.
//
// Die Datei kennt den Schalterzustand und **keinen einzigen Endpunkt** (Plan 2, Dateibaum);
// sie importiert nichts aus dem SDK. Aus den beiden Registern holt sie ausschließlich
// **Zahlen** — wie viele Werkzeuge diese Installation anmeldet und wie viele davon lesend
// sind. Das ist neu und hat einen belegten Grund: Die Zahlen standen hier als Literale (54,
// 15, 39) und waren mit den fünf Bündelwerkzeugen aus `src/bundles/` falsch geworden,
// gemessen 59, 19 und 40. Eine falsche Zahl im Servertext ist teurer als anderswo, weil sie
// ganz oben steht und zitiert wird. Gerechnet wird deshalb aus `TOOL_ENTRIES`,
// `BUNDLE_ENTRIES` und `TOOL_CLASSES`, gefiltert nach denselben aktiven Gruppen, nach denen
// `register-tools.ts` und `bundles/register.ts` registrieren;
// `test/unit/server-instructions.test.ts` hält den Text gegen `tools/list` desselben
// Serverstarts. Endpunktnamen, Pfade und Parameter bleiben draußen.
//
// Den Buchungswegweiser holt sie aus `resources.ts`, wo er als Resource `bb://guide/postings`
// ohnehin steht; damit wird die Regel an einer Stelle gepflegt (Plan 3.7: „Der Wegweiser steht
// genau einmal"). Den Gruppenblock holt sie aus `config/tool-groups.ts`: Der Gruppenschalter
// ist ein Schalterzustand, und sein Wortlaut steht dort einmal für Startmeldung, `doctor` und
// diesen Text (N5).
//
// **Jeder Werkzeugname in diesem Text hängt an seiner Gruppe.** Das ist keine Feinheit, sondern
// dieselbe Rückmeldungslücke, gegen die N5 gebaut wurde, nur von der anderen Seite: Der
// Gruppenblock sagt „Werkzeuge dieser Gruppen gibt es hier nicht“, und drei Absätze weiter
// stand bis eben eine Tabelle mit zehn `bb_postings_*`-Zeilen, die unter
// `BB_MCP_TOOL_GROUPS=bundles` kein einziges angemeldetes Werkzeug bezeichnete — gemessen elf
// nicht angemeldete Namen in diesem Profil, neun unter `BB_MCP_TOOL_GROUPS_EXCLUDE=postings`.
// Ein Agent, der ein Werkzeug aus `tools/list` nicht findet, baut Umwege oder behauptet eine
// fehlende Fähigkeit der API; in der Zielumgebung Claude Desktop (N2) wiegt der Wegweiser
// obendrein in jeder Anfrage. Genannt wird deshalb nur, was diese Installation auch anmeldet:
// der Wegweiser nur bei aktiver Gruppe `postings`, die Nachschlagewerkzeuge der Kontenkunde je
// nach `payment_accounts` beziehungsweise `postingaccounts` und sonst das Bündel
// `bb_masterdata_search`, und die Auswertung im Nur-Lesen-Satz je nach `reports` und `bundles`.
// `test/unit/server-instructions.test.ts` liest jeden Namen mit /bb_[a-z_]+/ aus dem Text und
// hält ihn gegen `tools/list` desselben Serverstarts.
//
// **Diese Datei exportiert bewusst keine Zeichenkette, sondern nur die Funktion.** P11
// (`test/registry/token-budget.test.ts`) tastet die Exporte dieses Moduls ab und misst den
// ersten String, den es findet; ein exportierter Textbaustein würde dort an die Stelle der
// `instructions` treten, und das Budget wäre gegen den falschen Text geprüft.

import { BUNDLE_ENTRIES } from "../bundles/index.js";
import type { BundleEntry } from "../bundles/types.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { NOT_CONFIGURED_INSTRUCTIONS_PREFIX } from "../config/resolve.js";
import { toolGroupInstructionLines } from "../config/tool-groups.js";
import { TOOL_CLASSES } from "../registry/classes.js";
import { BUNDLE_TOOL_GROUP, type ToolGroup } from "../registry/groups.js";
import { TOOL_ENTRIES } from "../registry/index.generated.js";
import type { ToolEntry } from "../registry/types.js";
import { API_MAX_BATCH } from "../schema/line-items.js";
import { POSTINGS_GUIDE } from "./resources.js";

/** Die Werkzeugzahlen, die der Servertext nennt. Alle fünf sind gerechnet, keine ist gepflegt. */
interface ToolCounts {
  /** Endpunktwerkzeuge, also je eines aus `src/registry/tools/`. */
  readonly endpoints: number;
  /** Bündelwerkzeuge aus `src/bundles/tools/`. */
  readonly bundles: number;
  readonly total: number;
  /** Werkzeuge mit `readOnlyHint: true` — genau die, die der Nur-Lesen-Schalter durchlässt. */
  readonly readOnly: number;
  readonly writing: number;
}

/**
 * Zählt beide Register über **eine** Quelle für „lesend": die Annotationstabelle.
 *
 * `TOOL_CLASSES[...].annotations.readOnlyHint` ist derselbe Wert, den `tools/list` ausliefert.
 * Eine zweite Liste lesender Werkzeuge gibt es hier deshalb nicht; sie wäre die nächste, die
 * altert.
 */
function countTools(
  endpointEntries: readonly ToolEntry[],
  bundleEntries: readonly BundleEntry[],
): ToolCounts {
  const all: readonly (ToolEntry | BundleEntry)[] = [...endpointEntries, ...bundleEntries];
  const readOnly = all.filter(
    (entry) => TOOL_CLASSES[entry.toolClass].annotations.readOnlyHint,
  ).length;
  return {
    endpoints: endpointEntries.length,
    bundles: bundleEntries.length,
    total: all.length,
    readOnly,
    writing: all.length - readOnly,
  };
}

/**
 * Was diese Installation anmeldet.
 *
 * Gefiltert wird nach `config.toolGroups.active`, also nach genau demselben Kriterium, das
 * `registerTools` und `registerBundles` anlegen. Steht hier eine andere Menge als in
 * `tools/list`, ist das ein Fehler und kein Rundungsunterschied.
 */
function registeredTools(config: ResolvedConfig): ToolCounts {
  const active = new Set(config.toolGroups.active);
  return countTools(
    TOOL_ENTRIES.filter((entry) => active.has(entry.group)),
    BUNDLE_ENTRIES.filter((entry) => active.has(entry.group)),
  );
}

/** Der volle Satz, ohne jeden Gruppenschalter. Nur die eingeschränkte Fassung nennt ihn. */
const ALL_TOOLS: ToolCounts = countTools(TOOL_ENTRIES, BUNDLE_ENTRIES);

/**
 * Die aktiven Gruppen als Menge.
 *
 * Dieselbe Menge, nach der `register-tools.ts` und `bundles/register.ts` registrieren. Jeder
 * Werkzeugname im Text wird gegen sie geprüft, bevor er geschrieben wird.
 */
function activeGroups(config: ResolvedConfig): ReadonlySet<ToolGroup> {
  return new Set(config.toolGroups.active);
}

/** Das Bündel, das Zahlungskonten, Sachkonten und Personenkonten in einem Aufruf durchsucht. */
const MASTERDATA_SEARCH = "bb_masterdata_search";

/**
 * Das Werkzeug, mit dem diese Installation eine Kontoart nachschlägt — oder `null`.
 *
 * Erste Wahl ist das Endpunktwerkzeug der eigenen Gruppe. Ist sie abgeschaltet, übernimmt
 * {@link MASTERDATA_SEARCH}: Das Bündel liest Zahlungskonten und den Kontenrahmen unmittelbar
 * über die API und hängt an keiner Endpunktgruppe (`registry/groups.ts`, BUNDLE_TOOL_GROUP).
 * Ist auch `bundles` aus, gibt es hier kein Nachschlagewerkzeug; dann wird keines genannt,
 * statt eines zu nennen, das in `tools/list` fehlt.
 */
function lookupTool(
  active: ReadonlySet<ToolGroup>,
  group: ToolGroup,
  endpointTool: string,
): string | null {
  if (active.has(group)) {
    return endpointTool;
  }
  return active.has(BUNDLE_TOOL_GROUP) ? MASTERDATA_SEARCH : null;
}

/**
 * „1 Werkzeug" oder „59 Werkzeuge".
 *
 * Die Zahl kommt aus dem Register und kann 1 sein: Unter `BB_MCP_TOOL_GROUPS=comments` meldet
 * dieser Server genau ein Werkzeug an. Ein Satz, der stillschweigend Mehrzahl annimmt, steht
 * dort falsch geschrieben im Text, den jedes Modell liest.
 */
function toolWord(count: number): string {
  return count === 1 ? "1 Werkzeug" : `${String(count)} Werkzeuge`;
}

/**
 * Der Zustandsblock aus Plan 6.7 Punkt 1.
 *
 * Er nennt, was der Agent nicht erraten kann und was ihm sonst 54 Werkzeugbeschreibungen
 * einzeln sagen müssten: ob der Server konfiguriert ist, ob der Nur-Lesen-Schalter greift,
 * welche Grenzen der Betreiber gesetzt hat, ob der Stammdatenspeicher läuft und ob die
 * Duplikatsprüfung ein zweites Token je anlegendem Aufruf verbraucht.
 *
 * Zwei Angaben erscheinen nur, wenn sie zutreffen. Die Betragsgrenze ist im
 * Auslieferungszustand nicht gesetzt, und die Mengengrenze liegt dann auf dem Maximum der API;
 * beide zu nennen, wenn sie nichts einschränken, wäre Text ohne Aussage.
 */
/**
 * Der Nachsatz zum Nur-Lesen-Schalter über die Berichte.
 *
 * BWA und Summen- und Saldenliste entstehen in zwei Schritten, und der erste legt serverseitig
 * einen Bericht an; er ist schreibend und damit gesperrt — gleich, ob er über
 * `bb_reports_create_bwa` oder über das Bündel `bb_reports_run` geht. Was dann noch eine
 * Auswertung liefert, hängt an der Gruppe: das Kontenblatt aus `reports`, der Kontostand aus
 * `bundles`, beides oder nichts. Ohne beide Gruppen entfällt der Satz, statt ein Werkzeug zu
 * nennen, das diese Installation nicht anmeldet.
 */
function readOnlyReportsSentence(active: ReadonlySet<ToolGroup>): string {
  const tools: string[] = [];
  if (active.has("reports")) {
    tools.push("bb_reports_get_ledger");
  }
  if (active.has(BUNDLE_TOOL_GROUP)) {
    tools.push("bb_balances_get");
  }
  if (tools.length === 0) {
    return "";
  }
  return (
    "BWA und Summen- und Saldenliste brauchen den gesperrten ersten Schritt; ohne " +
    `Serverneustart ${tools.length === 1 ? "liefert" : "liefern"} nur ${tools.join(" und ")} ` +
    "eine Auswertung."
  );
}

function stateBlock(config: ResolvedConfig): string {
  const lines: string[] = ["ZUSTAND DIESES SERVERS"];

  lines.push(
    config.configured
      ? "Zugangsdaten: vorhanden. Sie wurden einmal beim Serverstart gelesen."
      : // Der Wortlaut steht bereits als Vorspann am Anfang der instructions; hier genügt
        // die Zustandszeile, damit der Block in sich vollständig bleibt.
        "Zugangsdaten: fehlen. Siehe die Ansage am Anfang dieses Textes.",
  );

  // Die drei Zahlen sind gerechnet und nicht gepflegt: Sie beschreiben genau die Werkzeuge,
  // die dieser Start angemeldet hat, Bündel eingeschlossen. Der Satzbau ist deshalb so
  // gewählt, dass er auch bei einer einzigen angemeldeten Gruppe trägt — dort kann „lesend"
  // null sein, und das ist eine Angabe, die ein Agent braucht, keine, die man wegkürzt.
  const counts = registeredTools(config);
  const inventory =
    `Angemeldet: ${toolWord(counts.total)}, davon ${String(counts.readOnly)} lesend und ` +
    `${String(counts.writing)} schreibend. `;
  // Der Nachsatz über die Berichte entfällt, wo weder `reports` noch `bundles` angemeldet ist;
  // angehängt wird er deshalb erst, wenn er Text hat, statt ein Leerzeichen zurückzulassen.
  const reportsSentence = readOnlyReportsSentence(activeGroups(config));
  lines.push(
    config.readOnly
      ? "Nur-Lesen-Schalter: AN (BB_MCP_READ_ONLY=true). " +
          inventory +
          "Nur die lesenden laufen; die schreibenden lehnen ab, bevor ein Request abgeht. " +
          "Der Schalter nimmt kein Werkzeug aus der Liste." +
          (reportsSentence === "" ? "" : ` ${reportsSentence}`)
      : "Nur-Lesen-Schalter: aus. " +
          inventory +
          "Alle sind aufrufbar, die schreibenden eingeschlossen. " +
          "Die Freigabe liegt beim Client, nicht bei diesem Server.",
  );

  if (typeof config.maxAmount === "string") {
    lines.push(
      `Betragsgrenze: ${config.maxAmount}. Ein anlegendes oder buchendes Werkzeug lehnt einen ` +
        "größeren Betrag ab, bevor ein Request abgeht.",
    );
  }
  if (config.maxBatch < API_MAX_BATCH) {
    lines.push(
      `Mengengrenze: ${String(config.maxBatch)} Einträge je Stapel- und Positionsliste, statt ` +
        `der ${String(API_MAX_BATCH)} der API. Sie gilt je Liste und je Ebene; es wird nichts ` +
        "aufsummiert.",
    );
  }

  lines.push(
    config.cacheTtlMs > 0
      ? `Stammdatenspeicher: an (${String(config.cacheTtlMs)} ms). Vier Stammdatenabfragen können ` +
          "aus dem Speicher dieses Serverprozesses kommen; eine solche Antwort weist das aus."
      : "Stammdatenspeicher: aus. Jede Abfrage holt frische Daten.",
  );

  lines.push(
    config.duplicateCheck === "on"
      ? "Duplikatsprüfung: AN. Jeder anlegende Aufruf setzt vorher einen zusätzlichen lesenden " +
          "Request ab und verbraucht damit ein zweites Token aus dem Minutenkontingent des " +
          "Mandanten. Ein Treffer blockiert nicht, er steht in der Antwort."
      : // Der frühere Wortlaut lautete „Ein Werkzeugaufruf ist genau ein Aufruf an
        // BuchhaltungsButler" und war mit den Bündelwerkzeugen falsch. Gesagt wird jetzt, was
        // der Schalter wirklich bedeutet: kein zusätzlicher Request vor dem Anlegen. Wie viele
        // Requests ein Aufruf absetzt, sagt WAS DIESER SERVER IST.
        "Duplikatsprüfung: aus. Kein anlegender Aufruf setzt vorher einen zusätzlichen lesenden " +
          "Request ab.",
  );

  return lines.join("\n");
}

/**
 * Punkt 2 aus 6.7: was dieser Server ist. Kurz und ohne Werbung.
 *
 * Zwei Angaben hängen am Gruppenschalter, und beide sind gerechnet. Die Werkzeugzahl: Bei
 * abgeschalteter Gruppe meldet diese Installation weniger an als den vollen Umfang, und beide
 * Zahlen werden dann als das benannt, was sie sind. Und der Satz darüber, was ein Aufruf tut:
 * Er galt unbedingt und war mit den Bündelwerkzeugen falsch — ein Bündel fasst mehrere
 * Endpunkte zusammen und blättert selbsttätig. Getrennt gesagt wird deshalb, was für
 * Endpunktwerkzeuge gilt und was für Bündel, und jeder der beiden Sätze erscheint nur, wenn
 * diese Installation Werkzeuge der Art auch anmeldet. Unter `BB_MCP_TOOL_GROUPS=bundles` ist
 * kein einziges Endpunktwerkzeug aktiv; der Endpunktsatz entfällt dort vollständig.
 */
function identityBlock(config: ResolvedConfig): string {
  const counts = registeredTools(config);

  const scope = config.toolGroups.restricted
    ? [
        `Genau ein Werkzeug je API-Endpunkt; im vollen Umfang ${String(ALL_TOOLS.endpoints)} Endpunktwerkzeuge`,
        `und ${String(ALL_TOOLS.bundles)} Bündelwerkzeuge. Diese Installation meldet davon ${toolWord(counts.total)} an,`,
        "siehe WERKZEUGGRUPPEN.",
      ]
    : [
        `${toolWord(counts.total)}: ${String(counts.endpoints)} Endpunktwerkzeuge, genau eines je API-Endpunkt,`,
        `und ${String(counts.bundles)} Bündelwerkzeuge.`,
      ];

  const behaviour: string[] = [];
  if (counts.endpoints > 0) {
    behaviour.push(
      "Ein Aufruf eines Endpunktwerkzeugs ist genau ein Aufruf an die API: Es fasst nichts",
      "zusammen, blättert nicht selbsttätig und wiederholt keinen schreibenden Aufruf.",
    );
  }
  if (counts.bundles > 0) {
    behaviour.push(
      "Die Bündelwerkzeuge sind die Ausnahme: Sie fassen mehrere Endpunkte in einem Aufruf",
      "zusammen und blättern selbsttätig über Seiten. Was ein Lauf getan hat, weist jede",
      "Bündelantwort im Block bundle aus: complete, stopped_because, api_calls, gaps und",
      "written. Auch ein Bündel wiederholt keinen schreibenden Aufruf.",
    );
  }

  return [
    "WAS DIESER SERVER IST",
    "Ein inoffizieller MCP-Server für die BuchhaltungsButler-API, nicht vom Anbieter betrieben.",
    "Er arbeitet auf dem echten Mandanten des Nutzers; eine Testumgebung gibt es nicht.",
    ...scope,
    ...behaviour,
  ].join("\n");
}

/**
 * Punkt 3 aus 6.7: die Kontenkunde in fünf Zeilen, Maßnahme 5 aus Plan 3.4.
 *
 * Der gefährlichste Verwechslungsfall der ganzen API steht damit im Servertext und nicht in
 * den Beschreibungen der neun Werkzeuge, die eine Kontonummer entgegennehmen. Die lange
 * Fassung liegt in `bb://guide/accounts`.
 *
 * Die Abgrenzung der vier Begriffe gilt immer; die beiden Nachschlagewerkzeuge tun es nicht.
 * Sie stehen deshalb hinter {@link lookupTool}: das Endpunktwerkzeug der eigenen Gruppe, sonst
 * das Bündel, sonst gar keine Nennung. Ein Satz wie „Nachschlagen mit
 * bb_postingaccounts_search" ist in einer Installation ohne die Gruppe `postingaccounts` kein
 * Hinweis, sondern eine Sackgasse.
 */
function accountsBlock(config: ResolvedConfig): string {
  const active = activeGroups(config);
  const payment = lookupTool(active, "payment_accounts", "bb_payment_accounts_list");
  const posting = lookupTool(active, "postingaccounts", "bb_postingaccounts_search");

  // Fällt beides auf dasselbe Bündel, steht der Satz einmal statt zweimal: In der Zielumgebung
  // Claude Desktop (N2) liegt dieser Text im ungünstigsten Modus in jeder Anfrage.
  const shared = payment !== null && payment === posting;

  const lines: string[] = [
    "KONTEN AUSEINANDERHALTEN",
    "Zahlungskonto: Bankkonto oder Kasse, über die Geld fließt.",
  ];
  if (payment !== null && !shared) {
    lines.push(`Nachschlagen mit ${payment}.`);
  }
  lines.push("Sachkonto: Konto der Buchführung, auf das gebucht wird, etwa Aufwand oder Ertrag.");
  if (posting !== null && !shared) {
    lines.push(`Nachschlagen mit ${posting}.`);
  }
  if (shared) {
    lines.push(`Beide schlägt ${payment} nach.`);
  }
  lines.push(
    "Debitor ist ein Kunde mit einer Forderung, Kreditor ein Lieferant mit einer",
    "Verbindlichkeit. Beide sind Personenkonten und stehen zusätzlich in der Sachkontenliste;",
    "unterschieden werden sie dort an type und subtype.",
    "Achtung: Ein Zahlungskonto wird über eine Sachkontonummer adressiert, etwa 1200. Das Feld",
    "heißt im Werkzeugschema payment_account_number und meint nie das Sachkonto, auf das",
    "gebucht wird.",
    "Einzelheiten in der Resource bb://guide/accounts.",
  );
  return lines.join("\n");
}

/**
 * Punkt 4 aus 6.7: die Querschnittsregeln.
 *
 * Genau diese sechs Regeln wiederholt die Spezifikation dutzendfach in ihren
 * Parametertexten. Sie stehen deshalb hier und in keinem einzigen Parameter (S1 aus 4.10).
 */
const RULES_BLOCK = [
  "REGELN FÜR ALLE WERKZEUGE",
  "Datum: YYYY-MM-DD. Die Zeitzone der Datumsfelder ist in keiner Quelle dokumentiert; Werte",
  "werden unverändert durchgereicht.",
  "Leere Strings lehnt die API ab. Ein Feld ohne Wert wird weggelassen, nicht leer gesendet.",
  "Beträge werden als Zeichenkette übergeben, mit Punkt als Dezimaltrennzeichen und ohne",
  'Tausendertrennzeichen, zum Beispiel "123.99" und nicht 123.99. Gelesen werden sie ebenso',
  "als Zeichenkette mit zwei Nachkommastellen; zu jedem Betragsfeld liefert die Antwort",
  "zusätzlich <feld>_cents als Ganzzahl.",
  'Wahrheitswerte kommen als "0" und "1" zurück und werden zu true und false normalisiert.',
  "id_by_customer ist je Mandant fortlaufend und keine globale Kennung; dieselbe Nummer",
  "bezeichnet bei Belegen und bei Zahlungen verschiedene Datensätze.",
  "Unbekannte Antwortfelder werden durchgereicht; fehlende oder typwidrige bekannte Felder",
  "meldet die Antwort in _contract_warnings.",
  "Fehlermeldungen benennen eine Stelle im Aufruf als feld (Position 2) und zählen ab 1:",
  "Position 1 ist das erste Element der Liste. Pfade in eine Antwort hinein sind dagegen",
  "JSON-Pfade und zählen wie in JSON ab 0, etwa data[0].file_content.",
].join("\n");

/** Punkt 5 aus 6.7: die Paginierungsregel, die zentrale Ehrlichkeitsregel aus Plan 7.5. */
const PAGINATION_BLOCK = [
  "PAGINIERUNG",
  "Die API nennt zu keinem Zeitpunkt eine Gesamttrefferzahl. rows ist die Zeilenzahl DIESER",
  "Antwort. Eine Angabe wie '100 von 500' wäre erfunden.",
  "So viele Zeilen wie limit heißt: es kann mehr geben. Dann denselben Aufruf mit erhöhtem",
  "offset wiederholen. Weniger Zeilen als limit heißt: das ist das vollständige Ergebnis.",
  "Null Zeilen ist kein Fehler; entweder trafen die Filter nichts, oder der offset liegt",
  "hinter dem Ende.",
  "Enger filtern ist in der Regel billiger als blättern.",
].join("\n");

/** Punkt 7 aus 6.7: der Schreibhinweis. */
const WRITE_BLOCK = [
  "SCHREIBENDE AUFRUFE",
  "Dieser Server fragt nicht nach. Es gibt kein confirm und keinen Trockenlauf; die Freigabe",
  "liegt beim Client und damit beim Nutzer.",
  "Vor einem löschenden, stornierenden oder buchenden Aufruf die betroffenen Datensätze erst",
  "lesen und dem Nutzer vorlegen.",
  "Ein schreibender Aufruf wird nie automatisch wiederholt. Bleibt sein Ausgang ungewiss,",
  "nennt die Antwort den Weg zur Nachprüfung; kein blinder zweiter Versuch.",
].join("\n");

/**
 * Punkt 8 aus 6.7: die Liste der vier Resources aus 7.7.
 *
 * Die Zeile zu `bb://guide/postings` verweist mit „der Wegweiser oben" auf einen Block, den es
 * ohne die Gruppe `postings` in diesem Text nicht gibt; sie entfällt dann. Die Resource selbst
 * bleibt am Server angemeldet — `registerResources` kennt den Gruppenschalter nicht —, aber der
 * Servertext schickt niemanden mehr zu einem Wegweiser durch zehn Werkzeuge, die diese
 * Installation nicht anmeldet.
 */
function resourcesBlock(active: ReadonlySet<ToolGroup>): string {
  const lines: string[] = [
    "RESOURCES DIESES SERVERS",
    "bb://guide/accounts   Zahlungskonto, Sachkonto, Debitor, Kreditor: welches Feld welche",
    "                      Nummer erwartet und welches Werkzeug sie nachschlägt",
  ];
  if (active.has("postings")) {
    lines.push("bb://guide/postings   der Wegweiser oben, zum Nachlesen");
  }
  lines.push(
    "bb://vat-keys         die 23 Steuerschlüssel mit ihren deutschen Bezeichnungen",
    "bb://postingaccounts  der Kontenrahmen des Mandanten, nur bei eingeschaltetem",
    "                      Stammdatenspeicher; sonst nennt sie das Werkzeug dafür",
  );
  return lines.join("\n");
}

/**
 * Die `instructions`, die der Server bei `initialize` mitschickt.
 *
 * Die Reihenfolge ist die aus Plan 6.7 und keine Geschmacksfrage: Der Zustandsblock steht
 * oben, weil ein Agent, der die Absage eines gesperrten Werkzeugs erst nach dem Aufruf liest,
 * bereits eine Runde verloren hat.
 *
 * Weggelassen wird ein Block, sobald seine Gruppe abgeschaltet ist. Der Buchungswegweiser ist
 * der teuerste Fall: gemessen 223 der 1.407 Token des Servertextes im Auslieferungszustand,
 * also ein knappes Sechstel, und ohne die Gruppe `postings` bezeichnet keine seiner Zeilen ein
 * angemeldetes Werkzeug.
 */
export function buildInstructions(config: ResolvedConfig): string {
  const active = activeGroups(config);
  const sections: string[] = [
    // Der Vorspann steht **vor** jeder Überschrift, nicht in der zweiten Zeile unter einer:
    // Plan 6.5 Punkt 3 verlangt ihn am Anfang, und ein Agent, der nur den Anfang liest, soll
    // sofort wissen, dass jeder Aufruf scheitern wird.
    config.configured ? "" : NOT_CONFIGURED_INSTRUCTIONS_PREFIX,
    stateBlock(config),
    identityBlock(config),
    toolGroupInstructionLines(config.toolGroups).join("\n"),
    accountsBlock(config),
    RULES_BLOCK,
    PAGINATION_BLOCK,
    active.has("postings") ? POSTINGS_GUIDE : "",
    WRITE_BLOCK,
    resourcesBlock(active),
  ];
  return sections.filter((section) => section !== "").join("\n\n");
}
