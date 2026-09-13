/**
 * `uninstall --client <name>`: den eigenen Eintrag beim genannten Client entfernen (Plan 8.1).
 *
 * Entfernt wird ausschließlich der Eintrag **dieses** Servers und nichts sonst. Bei den
 * Adaptern, die eine Datei anfassen, entsteht vorher eine Sicherung, und ihr Pfad steht in
 * der Ausgabe — dieselbe Zusage wie beim Schreiben (Plan 8.2 Schritt 7).
 */

import { buildPlan, serverLaunch, type ClientHost, type WriteOutcome } from "./clients/types.js";
import type { Terminal } from "./prompt.js";
import { boolFlag, parseArgs, requireAdapter, scopeFlag } from "./run.js";

export interface RunUninstallOptions {
  readonly argv: readonly string[];
  readonly terminal: Terminal;
  readonly host: ClientHost;
  readonly env?: NodeJS.ProcessEnv;
}

/** Gibt ein Schreib- oder Entfernergebnis aus, einschließlich des Sicherungspfades. */
export function printOutcome(terminal: Terminal, label: string, outcome: WriteOutcome): void {
  switch (outcome.kind) {
    case "written":
      terminal.write(`${label}: ${outcome.detail}`);
      if (outcome.path !== null) {
        terminal.write(`  Datei: ${outcome.path}`);
      }
      if (outcome.backupPath !== null) {
        terminal.write(`  Sicherung: ${outcome.backupPath}`);
      }
      break;
    case "removed":
      terminal.write(`${label}: Der Eintrag wurde entfernt.`);
      if (outcome.path !== null) {
        terminal.write(`  Datei: ${outcome.path}`);
      }
      if (outcome.backupPath !== null) {
        terminal.write(`  Sicherung: ${outcome.backupPath}`);
      }
      break;
    case "unchanged":
      terminal.write(`${label}: nichts geändert. ${outcome.reason}`);
      break;
    case "manual":
      terminal.write(`${label}: von Hand zu erledigen. ${outcome.reason}`);
      break;
    case "failed":
      terminal.writeError(`${label}: fehlgeschlagen. ${outcome.reason}`);
      break;
  }
}

export async function runUninstall(options: RunUninstallOptions): Promise<number> {
  const { terminal, host } = options;
  const args = parseArgs(options.argv, {
    booleans: ["yes", "non-interactive"],
    strings: ["client", "scope"],
  });
  const adapter = requireAdapter(args);
  const scope = scopeFlag(args, adapter.scopes[0] ?? "user");

  if (!boolFlag(args, "yes") && terminal.interactive && !boolFlag(args, "non-interactive")) {
    const sure = await terminal.confirm(
      `Den Eintrag "buchhaltungsbutler" bei ${adapter.label} (Ebene ${scope}) entfernen?`,
      false,
    );
    if (!sure) {
      terminal.write("Nichts geändert.");
      return 1;
    }
  }

  // Für das Entfernen zählt nur der Name des Eintrags; Startvariante und Zugangsdaten spielen
  // keine Rolle. Der Plan wird trotzdem vollständig gebaut, damit die Adapter eine einzige
  // Schnittstelle haben.
  const plan = buildPlan({ launch: serverLaunch("npx", null), scope });
  const outcome = adapter.remove(plan, host);
  printOutcome(terminal, adapter.label, outcome);

  switch (outcome.kind) {
    case "removed":
      terminal.write(`Danach: ${adapter.finishNote}`);
      return 0;
    case "unchanged":
    case "manual":
      return 0;
    case "written":
      return 0;
    case "failed":
      return 1;
  }
}
