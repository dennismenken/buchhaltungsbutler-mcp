// Die `instructions` des Servers nach Plan 6.7 (AP14).
//
// Dies ist das einzige Dokument, das jeder Agent ohnehin sieht. Es trägt deshalb alles, was
// für alle 54 Werkzeuge gleich gilt, **genau einmal** statt 54-mal in den Definitionen
// (Plan 1.1, Sparmaßnahme S1 aus 4.10): Zustand, Selbstauskunft, Kontenkunde,
// Querschnittsregeln, Paginierung, Buchungswegweiser, Schreibhinweis, Resource-Liste.
//
// Zwei Grenzen halten diesen Text kurz, und beide sind gemessen und nicht geschätzt:
// 2.100 Token (INSTRUCTIONS_TOKEN_BUDGET, geprüft in P11 mit dem echten Tokenizer aus
// Plan 13.9) und die Regel aus 4.10, dass alles Weitere in eine Resource gehört, weil eine
// Resource nur dann Kontext kostet, wenn der Agent sie liest.
//
// Die Datei kennt den Schalterzustand und **nicht** die Endpunkte (Plan 2, Dateibaum). Sie
// importiert deshalb nichts aus dem Register und nichts aus dem SDK. Den Buchungswegweiser
// holt sie aus `resources.ts`, wo er als Resource `bb://guide/postings` ohnehin steht; damit
// wird die Regel an einer Stelle gepflegt (Plan 3.7: „Der Wegweiser steht genau einmal").
//
// **Diese Datei exportiert bewusst keine Zeichenkette, sondern nur die Funktion.** P11
// (`test/registry/token-budget.test.ts`) tastet die Exporte dieses Moduls ab und misst den
// ersten String, den es findet; ein exportierter Textbaustein würde dort an die Stelle der
// `instructions` treten, und das Budget wäre gegen den falschen Text geprüft.

import type { ResolvedConfig } from "../config/resolve.js";
import { NOT_CONFIGURED_INSTRUCTIONS_PREFIX } from "../config/resolve.js";
import { API_MAX_BATCH } from "../schema/line-items.js";
import { POSTINGS_GUIDE } from "./resources.js";

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
function stateBlock(config: ResolvedConfig): string {
  const lines: string[] = ["ZUSTAND DIESES SERVERS"];

  lines.push(
    config.configured
      ? "Zugangsdaten: vorhanden. Sie wurden einmal beim Serverstart gelesen."
      : // Der Wortlaut steht bereits als Vorspann am Anfang der instructions; hier genügt
        // die Zustandszeile, damit der Block in sich vollständig bleibt.
        "Zugangsdaten: fehlen. Siehe die Ansage am Anfang dieses Textes.",
  );

  lines.push(
    config.readOnly
      ? "Nur-Lesen-Schalter: AN (BB_MCP_READ_ONLY=true). Nur die 15 lesenden Werkzeuge laufen; " +
          "die 39 schreibenden lehnen ab, bevor ein Request abgeht. Die Werkzeugliste bleibt " +
          "vollständig. BWA und Summen- und Saldenliste brauchen den gesperrten ersten Schritt; " +
          "ohne Serverneustart liefert nur bb_reports_get_ledger eine Auswertung."
      : "Nur-Lesen-Schalter: aus. Alle 54 Werkzeuge sind aufrufbar, die 39 schreibenden " +
          "eingeschlossen. Die Freigabe liegt beim Client, nicht bei diesem Server.",
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
      : "Duplikatsprüfung: aus. Ein Werkzeugaufruf ist genau ein Aufruf an BuchhaltungsButler.",
  );

  return lines.join("\n");
}

/** Punkt 2 aus 6.7: was dieser Server ist. Kurz und ohne Werbung. */
const IDENTITY_BLOCK = [
  "WAS DIESER SERVER IST",
  "Ein inoffizieller MCP-Server für die BuchhaltungsButler-API, nicht vom Anbieter betrieben.",
  "Er arbeitet auf dem echten Mandanten des Nutzers; eine Testumgebung gibt es nicht.",
  "54 Werkzeuge, genau eines je API-Endpunkt: 15 lesende und 39 schreibende. Ein",
  "Werkzeugaufruf ist genau ein Aufruf an die API. Dieser Server fasst nichts zusammen,",
  "blättert nicht selbsttätig und wiederholt keinen schreibenden Aufruf.",
].join("\n");

/**
 * Punkt 3 aus 6.7: die Kontenkunde in fünf Zeilen, Maßnahme 5 aus Plan 3.4.
 *
 * Der gefährlichste Verwechslungsfall der ganzen API steht damit im Servertext und nicht in
 * den Beschreibungen der neun Werkzeuge, die eine Kontonummer entgegennehmen. Die lange
 * Fassung liegt in `bb://guide/accounts`.
 */
const ACCOUNTS_BLOCK = [
  "KONTEN AUSEINANDERHALTEN",
  "Zahlungskonto: Bankkonto oder Kasse, über die Geld fließt. Nachschlagen mit",
  "bb_payment_accounts_list.",
  "Sachkonto: Konto der Buchführung, auf das gebucht wird, etwa Aufwand oder Ertrag.",
  "Nachschlagen mit bb_postingaccounts_search.",
  "Debitor ist ein Kunde mit einer Forderung, Kreditor ein Lieferant mit einer",
  "Verbindlichkeit. Beide sind Personenkonten und stehen zusätzlich in der Sachkontenliste;",
  "unterschieden werden sie dort an type und subtype.",
  "Achtung: Ein Zahlungskonto wird über eine Sachkontonummer adressiert, etwa 1200. Das Feld",
  "heißt im Werkzeugschema payment_account_number und meint nie das Sachkonto, auf das",
  "gebucht wird.",
  "Einzelheiten in der Resource bb://guide/accounts.",
].join("\n");

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

/** Punkt 8 aus 6.7: die Liste der vier Resources aus 7.7. */
const RESOURCES_BLOCK = [
  "RESOURCES DIESES SERVERS",
  "bb://guide/accounts   Zahlungskonto, Sachkonto, Debitor, Kreditor: welches Feld welche",
  "                      Nummer erwartet und welches Werkzeug sie nachschlägt",
  "bb://guide/postings   der Wegweiser oben, zum Nachlesen",
  "bb://vat-keys         die 23 Steuerschlüssel mit ihren deutschen Bezeichnungen",
  "bb://postingaccounts  der Kontenrahmen des Mandanten, nur bei eingeschaltetem",
  "                      Stammdatenspeicher; sonst nennt sie das Werkzeug dafür",
].join("\n");

/**
 * Die `instructions`, die der Server bei `initialize` mitschickt.
 *
 * Die Reihenfolge ist die aus Plan 6.7 und keine Geschmacksfrage: Der Zustandsblock steht
 * oben, weil ein Agent, der die Absage eines gesperrten Werkzeugs erst nach dem Aufruf liest,
 * bereits eine Runde verloren hat.
 */
export function buildInstructions(config: ResolvedConfig): string {
  const sections: string[] = [
    // Der Vorspann steht **vor** jeder Überschrift, nicht in der zweiten Zeile unter einer:
    // Plan 6.5 Punkt 3 verlangt ihn am Anfang, und ein Agent, der nur den Anfang liest, soll
    // sofort wissen, dass jeder Aufruf scheitern wird.
    config.configured ? "" : NOT_CONFIGURED_INSTRUCTIONS_PREFIX,
    stateBlock(config),
    IDENTITY_BLOCK,
    ACCOUNTS_BLOCK,
    RULES_BLOCK,
    PAGINATION_BLOCK,
    POSTINGS_GUIDE,
    WRITE_BLOCK,
    RESOURCES_BLOCK,
  ];
  return sections.filter((section) => section !== "").join("\n\n");
}
