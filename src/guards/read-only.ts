// Guard 2 aus Plan 1.4: der optionale Nur-Lesen-Schalter (Plan 6.6).
//
// Drei Festlegungen stecken in diesem kurzen Modul, und alle drei sind begründet:
//
//  1. **Die Klasse kommt aus dem Register**, nicht aus dem Werkzeugnamen und nicht aus einer
//     zweiten Pfadliste. `bb_postings_assign_receipt` endet auf `_receipt` und ist buchend,
//     `bb_reports_get_ledger` endet auf `_ledger` und ist lesend; ein Schalter, der am Namen
//     hängt, liegt bei beiden falsch. Verschiebt sich der Schnitt, verschiebt sich der
//     Schalter mit (Plan 6.6, `registry/classes.ts`).
//  2. **Der Schalter wird nur beim Start gelesen.** Dieses Modul liest ihn aus der
//     eingefrorenen Konfiguration (Plan 6.4 Punkt 7) und kennt keinen Weg, ihn zu ändern.
//     Sonst wäre er kein Schutz, sondern eine Einstellung, die der Agent selbst umlegt.
//  3. **Gesperrte Werkzeuge bleiben in `tools/list`.** Das ist nicht hier sichtbar, sondern
//     in `server/register-tools.ts`: Dort hängt die Registrierung an keiner Bedingung. Ein
//     Agent, der ein Werkzeug nicht sieht, schließt auf eine fehlende Fähigkeit und sucht
//     Umwege; ein Agent, der eine klare Absage liest, kann sie dem Nutzer erklären.

import type { ResolvedConfig } from "../config/resolve.js";
import { STATE_NOTHING_SENT } from "../errors/render.js";
import { READ_ONLY_TOOL_CLASS } from "../registry/classes.js";
import type { ToolEntry } from "../registry/types.js";

/**
 * Der kanonische Name des Schalters (Plan 6.1).
 *
 * Er steht hier und nicht in `config/env.ts`, weil genau dieser Text ihn ausliefert: Der
 * wörtlich vorgeschriebene Absagetext nennt die Variable, und eine Absage, die eine nicht
 * existierende Variable nennt, ist schlimmer als ein längerer Variablenname. `BB_READ_ONLY`
 * bleibt ein akzeptierter Alias, erscheint aber in keinem ausgelieferten Text.
 */
export const READ_ONLY_VAR = "BB_MCP_READ_ONLY";

/**
 * Der Absagetext aus Plan 6.6, deutsche Fassung von `tool-design.md` 9.5.
 *
 * Aufbau und Inhalt folgen dem dort vorgeschriebenen Muster Zeile für Zeile: Werkzeugname,
 * Variable mit ihrem Zielwert, Zustandssatz 1 aus 5.8 **zeichengenau**, der Hinweis auf die
 * Betreibereinstellung, die Handlungsanweisung und der abschließende Satz gegen das Umgehen.
 *
 * Der Text ist bewusst **nicht** im Vierblockaufbau aus 5.8 gehalten: Plan 6.6 schreibt ihn
 * wörtlich vor und verlangt, dass er mit dem Satz gegen das Umgehen **schließt**; im
 * Vierblock stünde dort der Zustandssatz. Er trägt den Zustandssatz deshalb als eigene Zeile
 * in der Mitte, genauso wie der wörtlich vorgeschriebene Text aus 6.5 (Guard 1).
 */
export function formatReadOnlyRefusal(toolName: string): string {
  return [
    `${toolName} ist gesperrt: Dieser Server wurde mit ${READ_ONLY_VAR}=true gestartet und ist`,
    "damit auf die lesenden Endpunkte der BuchhaltungsButler-API beschränkt.",
    STATE_NOTHING_SENT,
    "Das ist eine Einstellung des Betreibers. Sie wird einmal beim Serverstart gelesen, ist",
    "im Auslieferungszustand aus und lässt sich aus einem Gespräch heraus nicht aufheben.",
    "Dem Nutzer sagen, dass dieser Vorgang einen Serverstart mit",
    `${READ_ONLY_VAR}=false oder ohne die Variable braucht.`,
    "Keine anderen Werkzeuge dieses Servers ausprobieren, um das zu umgehen.",
  ].join("\n");
}

/**
 * Prüft den Nur-Lesen-Schalter gegen die Klasse des Werkzeugs.
 *
 * @returns Die Absage aus 6.6, oder `undefined`, wenn der Aufruf weiterlaufen darf.
 */
export function checkReadOnly(entry: ToolEntry, config: ResolvedConfig): string | undefined {
  if (!config.readOnly || entry.toolClass === READ_ONLY_TOOL_CLASS) {
    return undefined;
  }
  return formatReadOnlyRefusal(entry.name);
}
