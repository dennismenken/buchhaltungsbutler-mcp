/**
 * `print-config --client <name>`: den fertigen Block ausgeben, nichts schreiben (Plan 8.1).
 *
 * Der Block enthält **niemals** einen echten Wert. Wo Zugangsdaten hingehören, stehen
 * Platzhalter oder — wo der Client eine Ersetzung kennt — eine Variablenreferenz. Das ist
 * keine Bequemlichkeit, sondern die Voraussetzung dafür, dass die Ausgabe in ein Ticket,
 * eine README oder ein Bildschirmfoto darf.
 */

import {
  buildPlan,
  placeholderCredentials,
  serverLaunch,
  type ClientAdapter,
  type ClientHost,
  type ClientPlan,
  type ClientPreview,
} from "./clients/types.js";
import type { Terminal } from "./prompt.js";
import {
  boolFlag,
  loadCliConfig,
  parseArgs,
  requireAdapter,
  scopeFlag,
  startFlag,
  stringFlag,
} from "./run.js";

export interface RunPrintConfigOptions {
  readonly argv: readonly string[];
  readonly terminal: Terminal;
  readonly host: ClientHost;
  readonly env?: NodeJS.ProcessEnv;
}

/** Gibt Pfad, Vorbehalte und den Block aus. Die eine Darstellung für alle Unterbefehle. */
export function printPreview(
  terminal: Terminal,
  adapter: ClientAdapter,
  preview: ClientPreview,
): void {
  terminal.write(`${adapter.label} (${adapter.key})`);
  terminal.write(`  Weg: ${adapter.way}`);
  terminal.write(`  ${preview.pathNote}`);
  for (const note of preview.notes) {
    terminal.write(`  Hinweis: ${note}`);
  }
  terminal.write("");
  terminal.write(preview.block.replace(/\n$/, ""));
  terminal.write("");
  terminal.write(`  Danach: ${adapter.finishNote}`);
  if (adapter.verifyCommand !== null) {
    terminal.write(`  Prüfen: ${adapter.verifyCommand}`);
  }
}

/** Baut den Plan, den `print-config` und die Vorschau von `setup` benutzen. */
export function previewPlan(options: {
  readonly host: ClientHost;
  readonly scope: ClientPlan["scope"];
  readonly start: "npx" | "global";
  readonly readOnly: boolean;
  readonly profile: string | null;
  readonly withCredentials: boolean;
}): ClientPlan {
  const extraEnv: Record<string, string> = {};
  if (options.readOnly) {
    extraEnv.BB_MCP_READ_ONLY = "true";
  }
  if (options.profile !== null && options.profile !== "default") {
    extraEnv.BB_PROFILE = options.profile;
  }
  return buildPlan({
    launch: serverLaunch(options.start, options.host.which("bbutler-mcp")),
    scope: options.scope,
    credentials: options.withCredentials ? placeholderCredentials() : { mode: "none" },
    extraEnv,
  });
}

export function runPrintConfig(options: RunPrintConfigOptions): Promise<number> {
  const { terminal, host } = options;
  const args = parseArgs(options.argv, {
    booleans: ["read-only", "with-credentials"],
    strings: ["client", "scope", "start", "profile"],
  });
  const adapter = requireAdapter(args);
  const scope = scopeFlag(args, adapter.scopes[0] ?? "user");
  if (!adapter.scopes.includes(scope)) {
    terminal.writeError(
      `${adapter.label} kennt die Ebene "${scope}" nicht; möglich ist ${adapter.scopes.join(" und ")}.`,
    );
    return Promise.resolve(2);
  }

  const { config } = loadCliConfig(options.env ?? process.env);
  // Ohne --with-credentials steht im Block gar keine Zugangsangabe: Der Server liest sie
  // dann aus der Zugangsdatendatei, und die Clientkonfiguration bleibt harmlos.
  const withCredentials = boolFlag(args, "with-credentials");
  const plan = previewPlan({
    host,
    scope,
    start: startFlag(args),
    readOnly: boolFlag(args, "read-only") || config.readOnly,
    profile: stringFlag(args, "profile") ?? config.profile,
    withCredentials,
  });

  printPreview(terminal, adapter, adapter.preview(plan, host));
  terminal.write("");
  // Der Schlusssatz muss zum ausgegebenen Block passen. Nur mit --with-credentials stehen
  // überhaupt Platzhalter darin; ohne den Schalter gäbe ein Hinweis auf zu ersetzende
  // Platzhalter dem Leser die Anweisung, etwas zu suchen, was gar nicht da ist.
  terminal.write(
    withCredentials
      ? "Es wurde nichts geschrieben. Die Platzhalter sind durch die echten Werte zu " +
          'ersetzen, oder besser: weglassen und die Werte mit "bbutler-mcp setup" in die ' +
          "Zugangsdatendatei legen."
      : "Es wurde nichts geschrieben. Der Block enthält keine Zugangsdaten; der Server holt " +
          'sie aus der Zugangsdatendatei, die "bbutler-mcp setup" anlegt.',
  );
  return Promise.resolve(0);
}
