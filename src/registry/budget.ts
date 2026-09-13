// Die Budgets.
//
// Diese Datei gehört dem Projektinhaber. Die Grenzen 2.100, 900, 700 und 480 werden von keinem
// Beitrag geändert; reißt die echte Messung sie, gilt die feste Reihenfolge (S1 bis S6
// nachziehen, Beschreibungen der Stufe 3 kürzen, Inhalte in Resources verschieben), und danach
// ist es ein Befund für den Projektinhaber und keine Zahl, die ein Agent anhebt. Dasselbe
// gilt für das Gesamtbudget unten; ausgenommen von der Sperre ist
// allein CHARS_PER_TOKEN am Ende dieser Datei.
//
// Stand 2026-09-13: Das Gesamtbudget stand auf 32.000 Token und war gerissen. Die Messung vom
// 2026-09-12 ergab 48.305 Token für die 54 Werkzeugdefinitionen. Die feste Reihenfolge
// schließt die Lücke von 16.305 Token nicht, und das ist nachgerechnet
// und nicht behauptet; die Rechnung steht unten am Gesamtbudget. Der Projektinhaber hat
// daraufhin den Weg gewählt, der für genau diesen Fall vorgesehen ist: das Budget mit
// Begründung und Eintrag in CHANGELOG.md auf den gemessenen Stand anheben. Seither steht hier
// 49.000, und P11 bricht wieder hart daran ab statt nur zu warnen.
//
// Die zuvor eingeführte Sperrgrenze TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT ist damit entfallen:
// Sie war der Ersatz für ein Budget, das nur noch warnte. Zwei harte Zahlen nebeneinander wären
// dieselbe Grenze zweimal.

import type { DescriptionTier } from "./types.js";

/**
 * Obergrenze für alle 54 Werkzeugdefinitionen zusammen, in Token. P11 bricht hart daran ab.
 *
 * **49.000 ist die ausdrückliche Entscheidung des Projektinhabers vom 2026-09-13**, festgehalten
 * in CHANGELOG.md, und keine Zahl, die ein Agent nebenbei angehoben hat. Sie ist der am
 * 2026-09-12 gemessene Stand von 48.305 Token (`gpt-tokenizer@4.0.0`, Kodierung `o200k_base`)
 * zuzüglich 695 Token Luft. Den jeweils aktuellen Stand führt
 * `MEASURED_TOOL_DEFINITION_TOKENS` in `src/registry/definition.ts`, und
 * `pnpm measure-tokens` schreibt ihn nach docs/entwicklung/tokenbudget.md fort.
 *
 * **Wie es dazu kam.** Der frühere Wert 32.000 ist aus 96.798 Zeichen nach den sechs
 * Sparmaßnahmen S1 bis S6 hergeleitet. Die Herleitung hat zwei Posten grob unterschätzt, die
 * Schemarümpfe und die Parameterbeschreibungen; die Postentabelle im Befund beziffert das
 * Zeichen für Zeichen (+52.445 und +28.761 Zeichen gegenüber dem Ansatz). S6 ist nachweislich
 * umgesetzt, nämlich 0 Zeichen Feldbeschreibung in allen 54 Ausgabeschemata.
 *
 * **Warum die Reihenfolge die Lücke nicht schließen kann, ausgerechnet statt
 * behauptet.** 16.305 Token sind bei den gemessenen 4,09 Zeichen je Token rund 66.700 Zeichen.
 * Alle 54 Werkzeugbeschreibungen zusammen sind 32.654 Zeichen lang (Stufe 1: 16.076, Stufe 2:
 * 10.637, Stufe 3: 5.941). Selbst wenn jede einzelne von ihnen vollständig in die Resources
 * wanderte, wären das rund 7.980 Token und damit weniger als die Hälfte der Lücke; der
 * dritte Schritt reicht also nicht heran, der zweite noch weniger. Übrig bliebe allein
 * der Posten Parameterbeschreibungen mit 67.161 Zeichen: Der Zielwert wäre nur zu halten, wenn
 * praktisch jede Parameterbeschreibung entfiele. Das widerspricht der Vorgabe, dass jeder
 * Parameter eines Endpunkts genau einmal im Werkzeug erscheint, und dem Aufbau, so wie
 * Werkzeuge zu streichen oder zusammenzulegen der Vorgabe widerspricht, genau ein Werkzeug
 * je Endpunkt auszuliefern (CONTRIBUTING.md Abschnitt 2). Übrig blieb die Wahl
 * zwischen einem Zielwert, den jeder Testlauf als gerissen meldet, und einer Zahl, die den
 * wirklichen Stand nennt und wieder erzwungen wird. Entschieden wurde die zweite.
 *
 * **Was die Zahl nicht ist: eine Erlaubnis zu wachsen.** Die Luft von 695 Token ist mit Absicht
 * klein; nach der Messung vom 2026-09-13 — 48.368 Token, siehe
 * `MEASURED_TOOL_DEFINITION_TOKENS` — sind davon noch 632 Token übrig. Sie trägt eine
 * Umformulierung, aber weder ein weiteres Werkzeug noch ein Schemafeld
 * von Gewicht. Reißt sie, gilt wieder die Reihenfolge: erst kürzen, dann dem
 * Projektinhaber vorlegen. **Diese Zahl darf ein Agent senken, niemals anheben.** Sinkt die
 * gemessene Summe dauerhaft, wird sie nachgezogen.
 *
 * **Was sie kostet, offen genannt:** rund 48.000 Token je Sitzung allein für diesen Server,
 * sobald ein Client ihn verbindet. Abschnitt 13 der README nennt die Zahl dem Nutzer, damit er
 * sie gegen sein Kontextfenster halten kann. Das ist die teuerste Folge der Vorgabe, genau
 * ein Werkzeug je Endpunkt auszuliefern, und so beziffert.
 *
 * P11 (test/registry/token-budget.test.ts) zählt hier mit dem echten Tokenizer und
 * ausdrücklich nicht über CHARS_PER_TOKEN: Ein Budget, das über einen Schätzfaktor erzwungen
 * wird, erzwingt die Schätzung und nicht das Budget.
 */
export const TOTAL_TOOL_DEFINITION_TOKEN_BUDGET = 49_000;

/**
 * Obergrenze für die Definitionen der Gruppe `bundles`, in Token. Eine **zweite, getrennte,
 * ebenfalls harte** Zahl neben {@link TOTAL_TOOL_DEFINITION_TOKEN_BUDGET}. Beide werden einzeln
 * erzwungen, damit sichtbar bleibt, was die Ergänzung wirklich kostet: das Gesamtbudget in P11
 * (test/registry/token-budget.test.ts), diese Grenze in test/bundles/read-bundles-contract.test.ts
 * über `bundleDefinitionJson`. `pnpm measure-tokens` weist beide zusätzlich im Bericht aus.
 *
 * **Warum getrennt und nicht aufgeschlagen.** Die 49.000 sind die dokumentierte Entscheidung
 * des Projektinhabers über die 54 Endpunktwerkzeuge, also über die Vorgabe, genau ein Werkzeug
 * je Endpunkt auszuliefern. Eine als Ganzes über `BB_MCP_TOOL_GROUPS` abschaltbare
 * Bündelgruppe ist ein anderer Gegenstand und verdient eine eigene, sichtbare Zahl, statt sich
 * in einer fremden zu verstecken. Das Hauptbudget bleibt bei 49.000 und deckt weiterhin
 * genau die 54 Endpunktwerkzeuge.
 *
 * **6.950 stehen auf einer Messung, und die Messung steht nur an EINER Stelle.** Die gemessene
 * Tokenzahl der fünf Bündeldefinitionen und ihre fünf Summanden führt `src/registry/groups.ts`
 * bei `bundles` (`TOOL_GROUPS.bundles.measuredTokens`, Stand 2026-09-13: **6.852 Token**,
 * `gpt-tokenizer@4.0.0` in der Kodierung `o200k_base` über `bundleDefinitionJson`). Hier stehen
 * die Summanden mit Absicht nicht noch einmal: Sie standen schon einmal an beiden Stellen, und
 * genau das ist auseinandergelaufen — der Kommentar nannte 6.675 und zwei veraltete Summanden,
 * während die Tabelle längst 6.852 führte. `test/registry/groups.test.ts` rechnet den Eintrag in
 * der Tabelle bei jedem Lauf mit dem echten Tokenizer nach, und
 * `test/bundles/read-bundles-contract.test.ts` hält diese Grenze gegen genau diese Zahl; keine
 * der beiden kann damit unbemerkt veralten.
 *
 * **Wie die Zahl zustande kam.** Für die Bündelwerkzeuge waren zunächst 7.000 angesetzt,
 * ausdrücklich als Schätzung mit großzügiger Luft, weil die Bündel
 * dort noch nicht geschrieben waren, und verlangt ebenso ausdrücklich, diese Zahl nach dem ersten
 * Lauf von `pnpm measure-tokens` **auf den gemessenen Stand zuzüglich einer kleinen Marge zu
 * senken**. Genau das sind die 6.950: 6.852 gemessen, 98 Token Marge. Das ist dasselbe Maß, in
 * dem das Hauptbudget bei seiner Festlegung am 2026-09-13 Luft ließ, nämlich rund 1,4 Prozent des
 * gemessenen Standes (dort 695 von 48.305).
 *
 * **Der Zwischenstand 6.800 lag unter dem gemessenen Stand.** Er sollte dieselbe Senkung
 * vollziehen, stand aber auf einer Messung, die zwei der fünf Summanden nicht mehr traf: 6.675
 * statt 6.852, weil `bb_assignments_get` und `bb_reports_run` danach gewachsen sind. Der
 * Testlauf blieb damit rot. Offen gesagt, was diese Zeile tut: Gegenüber dem Zwischenstand 6.800
 * ist 6.950 eine Anhebung um 150 Token, gegenüber den zunächst angesetzten 7.000 eine
 * Senkung um 50. Die Sperre unten gilt einer Grenze, die auf
 * einer Messung steht; die 6.800 taten das nie. Der Eintrag dazu steht in CHANGELOG.md, genau
 * wie bei den 49.000.
 *
 * **Was die Zahl nicht ist: eine Erlaubnis zu wachsen.** Die Luft von 98 Token trägt eine
 * Umformulierung, aber weder ein sechstes Bündel noch einen weiteren Parameter von Gewicht.
 * Reißt sie, wird gekürzt.
 *
 * **Diese Zahl darf ein Agent senken, niemals anheben.** Sinkt die gemessene Summe dauerhaft,
 * wird sie nachgezogen. Anheben ist eine Entscheidung des Projektinhabers mit Eintrag in
 * CHANGELOG.md, genau wie bei den 49.000.
 */
export const BUNDLE_DEFINITION_TOKEN_BUDGET = 6_950;

/** Obergrenze für die instructions des Servers, in Token. Sie tragen alles
 *  Querschnittliche genau einmal statt 54-mal und sind deshalb getrennt budgetiert. */
export const INSTRUCTIONS_TOKEN_BUDGET = 2_100;

/**
 * Obergrenze der Werkzeugbeschreibung je Stufe, in ZEICHEN. Zeichengrenzen
 * brauchen keinen Tokenizer; P11 prüft sie deshalb zusätzlich zum Gesamtbudget, damit eine
 * Überschreitung nicht erst in der Summe auffällt.
 *
 * Stufe 3 liegt bei 480 und nicht bei 380 Zeichen, weil der Pflichtsatz U2 dort 217 Zeichen
 * belegt und für die Punkte 1 bis 4 des Aufbaus sonst nur 163 Zeichen blieben.
 */
export const DESCRIPTION_CHAR_BUDGET_BY_TIER = {
  1: 900,
  2: 700,
  3: 480,
} as const satisfies Record<DescriptionTier, number>;

/**
 * Die namentliche Zuordnung aller 54 Werkzeuge zu ihrer Beschreibungsstufe.
 * P8 prüft die Stufe jedes Registereintrags gegen diese drei Listen, P11 zusätzlich die
 * Prüfsumme 22 + 18 + 14 = 54.
 *
 * Die Listen stehen vollständig hier und nicht verteilt in den Registereinträgen, weil die
 * fünf Registerpakete parallel entstehen können: Jeder Bearbeiter muss die Stufe
 * seiner Werkzeuge setzen können, ohne die Verteilung der anderen vier zu kennen. Ohne diese
 * Liste verfehlen fünf unabhängige Bearbeiter die Prüfsumme mit hoher Wahrscheinlichkeit.
 *
 * Die Reihenfolge folgt den Werkzeugnummern aus der Tabelle.
 */
export const TOOL_NAMES_BY_TIER = {
  // Stufe 1, 22 Werkzeuge: die Verwechslungs- und Gefahrenzone. Das sind die zwölf
  // bb_postings_* und die drei bb_invoices_* sowie die Werkzeuge 1, 6, 7, 9, 12, 40 und 43.
  1: [
    "bb_receipts_search",
    "bb_receipts_upload",
    "bb_receipts_delete",
    "bb_transactions_search",
    "bb_transactions_create",
    "bb_invoices_create",
    "bb_invoices_create_draft",
    "bb_invoices_create_einvoice",
    "bb_postings_search",
    "bb_postings_create_for_receipt",
    "bb_postings_create_for_receipt_batch",
    "bb_postings_create_for_transaction",
    "bb_postings_create_for_transaction_batch",
    "bb_postings_create_free",
    "bb_postings_create_free_batch",
    "bb_postings_unconfirm_for_receipt",
    "bb_postings_unconfirm_for_transaction",
    "bb_postings_unconfirm_free",
    "bb_postings_assign_receipt",
    "bb_postings_cancel",
    "bb_postingaccounts_search",
    "bb_payment_accounts_list",
  ],
  // Stufe 2, 18 Werkzeuge: fachliche Tiefe, aber kein Verwechslungsrisiko. Kriterium: alle
  // schreibenden Einzelwerkzeuge außerhalb der Stufe 1, dazu der Belegeinzelabruf mit seinen
  // Fremdwährungsfeldern (Werkzeug 2).
  2: [
    "bb_receipts_get",
    "bb_receipts_create",
    "bb_receipts_restore",
    "bb_transactions_assign_receipt",
    "bb_transactions_unassign_receipt",
    "bb_debtors_create",
    "bb_debtors_update",
    "bb_creditors_create",
    "bb_creditors_update",
    "bb_postingaccounts_create",
    "bb_postingaccounts_update",
    "bb_payment_accounts_create",
    "bb_comments_create",
    "bb_cost_locations_create",
    "bb_cost_locations_update",
    "bb_cost_locations_delete",
    "bb_reports_create_bwa",
    "bb_reports_create_sums",
  ],
  // Stufe 3, 14 Werkzeuge: Stapelvarianten, deren Einzelvariante die Fachlichkeit bereits
  // trägt, sowie reine Nachschlage- und Abholwerkzeuge mit höchstens vier Parametern. Fünf
  // davon sind schreibend und tragen deshalb trotzdem einen Pflichtsatz.
  3: [
    "bb_receipts_list_transactions",
    "bb_receipts_create_batch",
    "bb_transactions_get",
    "bb_transactions_list_receipts",
    "bb_transactions_create_batch",
    "bb_transactions_assign_receipt_batch",
    "bb_debtors_search",
    "bb_debtors_create_batch",
    "bb_creditors_search",
    "bb_creditors_create_batch",
    "bb_cost_locations_search",
    "bb_reports_get_bwa",
    "bb_reports_get_sums",
    "bb_reports_get_ledger",
  ],
} as const satisfies Record<DescriptionTier, readonly string[]>;

/**
 * Zeichen je Token, Umrechnungsfaktor für die Laufzeit.
 *
 * **GEMESSEN**, nicht mehr angenommen. `scripts/measure-tokens.ts` hat mit dem echten
 * Tokenizer (`gpt-tokenizer@4.0.0`, Kodierung `o200k_base`) über die 54
 * ausgelieferten Werkzeugdefinitionen und die instructions zusammen **4,09 Zeichen je Token**
 * ermittelt; die Zahlen stehen in docs/entwicklung/tokenbudget.md und entstehen bei
 * jedem Lauf neu. Der frühere Wert 3,2 war eine ausdrücklich gekennzeichnete Annahme und
 * lag zu niedrig: Eine Werkzeugdefinition ist zum größeren Teil JSON-Struktur
 * mit englischen Feldnamen und zerfällt in wenige, lange Token, und auch deutscher Fließtext
 * kommt in dieser Kodierung auf rund vier Zeichen je Token.
 *
 * **Eingetragen ist 4 und nicht 4,09, also abgerundet.** Die Konstante wird zur Laufzeit nur
 * in response/truncate.ts und in doctor benutzt; dort schätzt ein zu kleiner
 * Faktor die Tokenzahl zu hoch und kürzt damit eher zu früh, und genau diese Richtung nennt
 * die harmlose Richtung. Hinzu kommt, dass der Faktor an Definitionen und Servertext gemessen ist,
 * die Kürzung aber Antwortzeilen trifft: Kennungen, Datumswerte und Beträge tokenisieren
 * schlechter als Fließtext.
 *
 * Ein Tokenizer zur Laufzeit wäre eine vierte Laufzeitabhängigkeit. P11
 * und `scripts/measure-tokens.ts` rechnen deshalb nie mit diesem Faktor, sondern immer mit dem
 * echten Tokenizer.
 */
export const CHARS_PER_TOKEN = 4;
