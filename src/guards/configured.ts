// Guard 1 aus Plan 1.4: Zustand „nicht konfiguriert".
//
// Der erste Guard der Reihenfolge, und das aus einem Grund: Ohne Zugangsdaten scheitert jeder
// Werkzeugaufruf, und zwar unabhängig davon, ob die Argumente gültig sind. Ein Agent, der
// zuerst eine Schemameldung liest, sucht den Fehler in seinem Aufruf statt in der Einrichtung
// des Servers (Plan 6.5).
//
// Der Text ist nicht hier formuliert. Er steht wörtlich nach 6.5 Punkt 4 in
// `config/resolve.ts#formatNotConfiguredToolError`, damit er genau einen Ort hat und nicht in
// 54 Werkzeugen neu entsteht. Dieser Guard entscheidet nur, ob er greift.

import type { ResolvedConfig } from "../config/resolve.js";
import { formatNotConfiguredToolError } from "../config/resolve.js";

/**
 * Prüft, ob der Server überhaupt mit BuchhaltungsButler sprechen kann.
 *
 * @returns Die Absage aus 6.5 Punkt 4, oder `undefined`, wenn der Aufruf weiterlaufen darf.
 *          Die Absage trägt den Zustandssatz 1 aus 5.8 bereits in sich; es geht nichts hinaus.
 */
export function checkConfigured(toolName: string, config: ResolvedConfig): string | undefined {
  // Beide Bedingungen werden geprüft, obwohl `configured` die zweite nach sich zieht: Die
  // HTTP-Schicht liest `credentials` und nicht `configured`, und ein Guard, der eine andere
  // Frage beantwortet als die Schicht hinter ihm, schützt nichts (vgl. `http/client.ts`).
  if (config.configured && config.credentials !== null) {
    return undefined;
  }
  return formatNotConfiguredToolError(toolName, config);
}
