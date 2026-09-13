// Ein Bündelschritt aus dem Registereintrag des Endpunktwerkzeugs, das denselben Pfad bedient.
//
// **Eine Quelle der Wahrheit, nicht zwei.** Antwortvertrag, Projektion, Eimer und Zeitlimit
// stehen bereits im Register; sie hier abzuschreiben ergäbe eine zweite Liste, die beim nächsten
// gemessenen Feld unbemerkt auseinanderliefe. Ein Bündel liest diese DATEN aus dem Eintrag und
// ruft trotzdem nicht das Werkzeug auf; es spricht unmittelbar mit der HTTP-Schicht, und der
// Gruppenschalter berührt es deshalb nicht. Nebenwirkung mit Absicht: Ein Agent, der
// zwischen Bündel und Einzelwerkzeug wechselt, sieht dieselben Spalten.

import type { ToolEntry } from "../registry/types.js";
import type { BundleStep } from "./types.js";

export interface StepOverrides {
  /** Eine abweichende Projektion, wo das Bündel eine andere Feldauswahl braucht. */
  readonly concise?: readonly string[];
  /** Ein abweichendes Zeitlimit, wo das Bündel einen anderen Antwortumfang erwartet. */
  readonly timeoutTier?: ToolEntry["timeoutTier"];
}

/** Der Schritt zu einem Endpunktwerkzeug. `fallbackTool` ist dessen Name (R7). */
export function stepFromTool(
  tool: ToolEntry,
  id: string,
  role: BundleStep["role"],
  overrides: StepOverrides = {},
): BundleStep {
  return {
    id,
    path: tool.path,
    role,
    shape: tool.shape,
    responseContract: tool.responseContract,
    concise: overrides.concise ?? tool.concise,
    bucket: tool.bucket,
    timeoutTier: overrides.timeoutTier ?? tool.timeoutTier,
    toolClass: tool.toolClass,
    fallbackTool: tool.name,
  };
}
