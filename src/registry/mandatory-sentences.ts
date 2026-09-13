// Die sieben Pflichtsätze U1 bis U7, wörtlich und auf Deutsch (CONTRIBUTING.md Abschnitt 5).
//
// Jedes Werkzeug mit der Wirkung anlegend, ändernd oder löschend trägt genau einen dieser
// Sätze, und zwar den zutreffenden; die 15 lesenden Werkzeuge tragen keinen. Welcher Satz
// gilt, steht im Registereintrag als mandatorySentence, der Text ausschließlich hier.
// P8 (test/registry/descriptions.test.ts) vergleicht zeichengenau gegen diese Datei und
// prüft beide Richtungen, also auch die Abwesenheit bei den lesenden Werkzeugen.
//
// Warum der Wortlaut hier eingefroren ist: Der Server sperrt keinen Aufruf, und der
// Freigabedialog des Clients ist damit die einzige menschliche Kontrolle
// (`docs/entwicklung/tool-design.md` 9.4). Für die 13 Werkzeuge mit U4 ist dieser Satz die einzige
// Warnung, die vor dem Aufruf überhaupt erscheint, weil die API für diese acht Objektarten
// keinen Lösch-, Storno- oder Aufhebungsendpunkt kennt.
//
// Werkzeug- und Feldnamen stehen unverändert im Original und werden nicht eingedeutscht.
// Die Zeichenzahl jedes Satzes zählt in das Stufenbudget hinein; bei
// Stufe 3 bleibt neben U2 der engste Spielraum, weshalb die Obergrenze dort 480 und nicht
// 380 Zeichen beträgt (budget.ts).

import type { MandatorySentenceId } from "./types.js";

/** Platzhalter in U1: der Name des Werkzeugs, das den Vorgang zurücknimmt. */
export const MANDATORY_SENTENCE_TOOL_PLACEHOLDER = "<tool>";

/** Platzhalter in U6: was genau entfernt wird, in deutschem Fließtext. */
export const MANDATORY_SENTENCE_SCOPE_PLACEHOLDER = "<was genau>";

/**
 * Die sieben Pflichtsätze. U1 und U6 tragen einen Platzhalter, der im Registereintrag
 * ersetzt wird; die übrigen fünf stehen wörtlich in der Beschreibung.
 *
 * - U1: umkehrbar mit genau einem Werkzeug (6 Werkzeuge)
 * - U2: nur als Löschmarkierung umkehrbar (3 Werkzeuge)
 * - U3: nur durch Storno korrigierbar (6 Werkzeuge)
 * - U4: über die API gar nicht umkehrbar (13 Werkzeuge)
 * - U5: überschreibt ohne abrufbaren Vorzustand (4 Werkzeuge)
 * - U6: entfernt Bestehendes (5 Werkzeuge)
 * - U7: ersetzt eine Auswertung (2 Werkzeuge)
 *
 * Prüfsumme 6 + 3 + 6 + 13 + 4 + 5 + 2 = 39, also genau die 39 schreibenden Werkzeuge.
 * Die namentliche Zuordnung steht und in den Registereinträgen selbst, nicht
 * hier: P8 prüft sie gegen den Registereintrag, und eine zweite Namensliste an dieser
 * Stelle wäre eine konkurrierende Quelle.
 */
export const MANDATORY_SENTENCES = {
  U1: "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig zu machen mit <tool>.",
  U2: "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig nur mit bb_receipts_delete, das den Beleg lediglich als gelöscht markiert; die API kennt keinen Endpunkt, der einen Beleg endgültig entfernt.",
  U3: "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich nicht löschen, sondern nur mit bb_postings_cancel stornieren; der Storno bleibt dauerhaft sichtbar.",
  U4: "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das rückgängig zu machen.",
  U5: "Überschreibt Stammdaten im echten Mandanten von BuchhaltungsButler. Die API liefert die vorherigen Werte nicht zurück; ohne vorher gelesenen Datensatz ist die Änderung nicht rückgängig zu machen.",
  U6: "Entfernt Daten aus dem echten Mandanten von BuchhaltungsButler: <was genau>. Die betroffenen Datensätze vorher lesen und dem Nutzer vorlegen.",
  U7: "Ersetzt die zuvor in BuchhaltungsButler erzeugte Auswertung desselben Typs. Buchungsdaten ändern sich dabei nicht, und die Auswertung lässt sich jederzeit neu erzeugen.",
} as const satisfies Record<MandatorySentenceId, string>;

/**
 * Welcher Satz welchen Platzhalter trägt. P8 baut daraus den Vergleich für U1 und U6,
 * ohne den Satztext zu zerlegen; für die fünf Sätze ohne Platzhalter ist die Liste leer
 * und der Vergleich ein einfacher Zeichenkettenvergleich.
 */
export const MANDATORY_SENTENCE_PLACEHOLDERS = {
  U1: [MANDATORY_SENTENCE_TOOL_PLACEHOLDER],
  U2: [],
  U3: [],
  U4: [],
  U5: [],
  U6: [MANDATORY_SENTENCE_SCOPE_PLACEHOLDER],
  U7: [],
} as const satisfies Record<MandatorySentenceId, readonly string[]>;
