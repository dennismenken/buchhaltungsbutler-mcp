#!/usr/bin/env node
// Der bin-Einstieg des Pakets.
//
// Die Weiche hat genau zwei Ausgänge, und die Trennung ist der ganze Zweck dieser Datei:
//
//   ohne Unterbefehl   → MCP-Server auf stdio, über src/server/create-server.ts. Das ist der
//                        Normalfall und der Grund, warum in keiner Clientkonfiguration ein
//                        Argument hinter dem Paketnamen steht.
//   mit Unterbefehl    → src/cli/run.ts, **dynamisch** geladen.
//
// Der dynamische Import ist keine Stilfrage: Ein Serverstart lädt damit keine Zeile CLI-Code,
// und umgekehrt lädt kein Unterbefehl den Server. Das ist die Startzeit, die der
// Paketprobelauf misst, und zugleich die Zusage, dass ein Unterbefehl niemals
// in eine laufende MCP-Verbindung schreibt.
//
// `--version` liest src/generated/version.ts — die einzige Versionsquelle zur Laufzeit, kein
// JSON-Lesen.
// `--help` geht über src/cli/run.ts, weil die Hilfe die zwölf Clientkürzel aus der
// Adapterliste nennt und diese Liste nur einmal existieren darf.

import { VERSION } from "./generated/version.js";

/**
 * @returns Den Rückgabewert des Prozesses, oder `null`, wenn der Server läuft und der Prozess
 *   weiterlaufen muss.
 */
async function main(argv: readonly string[]): Promise<number | null> {
  const first = argv[0];

  if (argv.length === 1 && (first === "--version" || first === "-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === undefined) {
    const { runStdioServer } = await import("./server/create-server.js");
    await runStdioServer();
    return null;
  }

  const { runCli } = await import("./cli/run.js");
  return await runCli(argv);
}

try {
  const code = await main(process.argv.slice(2));
  if (code !== null) {
    process.exitCode = code;
  }
} catch (error) {
  // Bis hierher kommt nur, was kein Unterbefehl und kein Serverstart behandelt hat. Der Text
  // geht nach stderr: stdout gehört dem MCP-Protokoll.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
