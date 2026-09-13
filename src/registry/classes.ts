// Die sechs Werkzeugklassen und die Wirkungstabelle, beide als Daten (Plan 3.3, 2.1).
//
// Die Klasse wird NIEMALS aus dem Namen abgeleitet: bb_postings_assign_receipt endet auf
// _receipt und ist buchend, bb_reports_get_ledger endet auf _ledger und ist lesend. Jeder
// Registereintrag trägt sie ausdrücklich, und diese Datei übersetzt sie in die vier
// MCP-Annotationen. Deshalb steht hier eine Tabelle und keine Verzweigung: Ein zusätzlicher
// Endpunkt bekommt seine Annotationen dadurch, dass er eine Klasse trägt, und nicht dadurch,
// dass jemand einen Codepfad erweitert.

import type { ToolClass, ToolEffect } from "./types.js";

/** Die vier MCP-Annotationen eines Werkzeugs. Alle vier werden immer ausdrücklich gesetzt (P7). */
export interface ToolClassAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  /** Überall true: Der Datenbestand ändert sich unabhängig von diesem Server. */
  readonly openWorldHint: boolean;
}

export interface ToolClassDefinition {
  /** Deutsche Bedeutung der Klasse, Wortlaut aus der Tabelle in Plan 3.3. */
  readonly meaning: string;
  readonly annotations: ToolClassAnnotations;
  /** Anzahl der Werkzeuge dieser Klasse im Auslieferungszustand (Plan 3.3, 3.9). */
  readonly count: number;
}

/**
 * Die sechs Klassen mit ihren vier Annotationswerten.
 *
 * Zwei Zeilen sind unbequem und deshalb ausgeschrieben statt stillschweigend gesetzt:
 *
 * - Klasse M trägt destructiveHint: true, obwohl tool-design.md 9.3 false vorsieht. Das
 *   MCP-Schema definiert den Hint mit „If false, the tool performs only additive updates";
 *   ein Überschreiben ist nicht additiv, und kein Endpunkt liefert den Vorzustand zurück
 *   (grundlagen.md 7.3). Ein zu strenger Hint kostet eine Rückfrage, ein zu milder einen
 *   unbemerkten Stammdatenverlust (Plan 3.3, Streitfrage S5).
 * - Klasse B trägt destructiveHint: false, obwohl sie die folgenreichste Klasse ist. Ihre
 *   zehn Werkzeuge legen neue Buchungszeilen, Rechnungen oder Belegbindungen an; sie
 *   überschreiben nichts und löschen nichts. Unumkehrbarkeit und Destruktivität fallen hier
 *   auseinander. Die Warnung läuft über die Pflichtsätze U3 und U4 (3.5) und den title (3.6).
 *
 * idempotentHint ist nur bei R und M true, also nur dort, wo eine Wiederholung beweisbar
 * denselben Zustand ergibt. Bei delete, restore, unconfirm, unassign und cancel ist das
 * plausibel, aber nicht verifiziert, und ein falsches true lädt einen Host zum automatischen
 * Wiederholen ein (Streitfrage S6).
 *
 * Die Zahlen beschreiben den Auslieferungszustand. Belegt AP19 ein Wiederholungsverhalten
 * oder dass bb_postings_assign_receipt einen bestehenden Belegbezug ersetzt, zieht AP19b
 * diese Tabelle, die zweite Liste in test/registry/ und annotations.test.ts gemeinsam nach;
 * ab dann gelten die Zahlen aus docs/entwicklung/befund-schreibend.md (Plan 3.3).
 */
export const TOOL_CLASSES = {
  R: {
    meaning: "lesend",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    count: 15,
  },
  A: {
    meaning: "additiv; legt an oder stellt eine umkehrbare Zuordnung her",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    count: 16,
  },
  AR: {
    meaning: "erzeugt eine Auswertung und ersetzt die vorherige",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    count: 2,
  },
  M: {
    meaning: "überschreibt einen bestehenden Stammdatensatz",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    count: 4,
  },
  D: {
    meaning: "löscht, storniert, hebt Bestätigung oder Zuordnung auf",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    count: 7,
  },
  B: {
    meaning: "buchend oder belegbindend, ohne Weg zurück in der API",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    count: 10,
  },
} as const satisfies Record<ToolClass, ToolClassDefinition>;

/** Die Klasse, die den Nur-Lesen-Schalter passieren darf. Sie ist genau die Menge der
 *  lesenden Endpunkte (Plan 3.9), weshalb der Schalter keine zweite Pfadliste braucht. */
export const READ_ONLY_TOOL_CLASS = "R" as const satisfies ToolClass;

export interface ToolEffectDefinition {
  /** Die deutsche Wirkungsbenennung aus dem Fließtext und aus grundlagen.md 7.3. */
  readonly german: string;
  /** Anzahl der Endpunkte dieser Wirkung; deckungsgleich mit grundlagen.md 7.3 (P6). */
  readonly count: number;
}

/**
 * Die eineindeutige Zuordnung der englischen effect-Werte zur deutschen Wirkungsbenennung
 * (Plan 2.1). Bezeichner und Aufzählungswerte im Code sind englisch (E4), jeder vom Agenten
 * gelesene Text ist deutsch; diese Tabelle ist die einzige Stelle, an der beides zusammenfindet.
 */
export const TOOL_EFFECTS = {
  read: { german: "lesend", count: 15 },
  create: { german: "anlegend", count: 24 },
  modify: { german: "ändernd", count: 8 },
  delete: { german: "löschend", count: 7 },
} as const satisfies Record<ToolEffect, ToolEffectDefinition>;
