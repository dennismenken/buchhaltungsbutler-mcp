/**
 * `doctor`: die Diagnose, die in einen Fehlerbericht gehört.
 *
 * Die Ausgabe enthält **garantiert kein Geheimnis**. Genannt wird, welcher der drei Werte
 * gesetzt ist und woher er kommt — nie ein Wert, auch nicht gekürzt und nicht maskiert.
 *
 * **`doctor` lädt keinen Tokenizer.** Ein Tokenizer im ausgelieferten Paket wäre eine vierte
 * Laufzeitabhängigkeit. Gezählt werden zur Laufzeit die **Zeichen** der 54
 * Definitionen — vollständig, einschließlich Annotationen, Eingabe- und Ausgabeschema, also
 * genau das, was `tools/list` ausliefert (`registry/definition.ts`). Die **Tokenzahl** daneben
 * ist die eingecheckte Messung von `pnpm measure-tokens`; nur wenn die Zeichenzahl nicht
 * mehr zu ihr passt, tritt die Schätzung über `CHARS_PER_TOKEN` an ihre Stelle. Die
 * Ausgabezeile sagt jedes Mal, welcher der beiden Fälle vorliegt, und behauptet nichts anderes.
 */

import { BUNDLE_TOOL_COUNT, registeredBundleCount } from "../bundles/register.js";
import { inspectCredentialsPermissions, type ResolvedConfig } from "../config/resolve.js";
import {
  TOOL_GROUPS_EXCLUDE_VAR,
  TOOL_GROUPS_VAR,
  toolGroupReportLines,
} from "../config/tool-groups.js";
import { PACKAGE_NAME, VERSION } from "../generated/version.js";
import { CHARS_PER_TOKEN } from "../registry/budget.js";
import {
  MEASURED_TOOL_DEFINITION_CHARS,
  MEASURED_TOOL_DEFINITION_TOKENS,
  measureToolDefinitionChars,
} from "../registry/definition.js";
import { TOOL_ENTRIES } from "../registry/index.generated.js";
import type { ToolEffect, ToolEntry, ToolGroup } from "../registry/types.js";
import { CHATGPT_BROWSER_NOTE } from "./clients/print-only.js";
import { BINARY_NAME, type ClientHost } from "./clients/types.js";
import type { Terminal } from "./prompt.js";
import { ALL_ADAPTERS, loadCliConfig, parseArgs } from "./run.js";
import { printConnectionTest, runConnectionTest } from "./test.js";

/** Die Wirkungen in der Reihenfolge, in der die Diagnose sie nennt. */
const EFFECT_LABELS: Readonly<Record<ToolEffect, string>> = {
  read: "lesend",
  create: "anlegend",
  modify: "ändernd",
  delete: "löschend",
};

/** Eine Zahl in deutscher Schreibweise, mit Tausenderpunkt. */
function de(value: number): string {
  return value.toLocaleString("de-DE");
}

/**
 * Eine gezählte Werkzeugmenge als deutscher Satzteil: „54 Endpunktwerkzeuge",
 * „1 Bündelwerkzeug", „kein Bündelwerkzeug". Die Null bekommt ihr eigenes Wort, weil
 * „0 Bündelwerkzeuge" im Fließtext wie ein abgeschnittener Wert aussieht.
 */
function countedTools(count: number, singular: string, plural: string): string {
  if (count === 0) {
    return `kein ${singular}`;
  }
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Die beiden Zeilen über die Größe der Werkzeugdefinitionen.
 *
 * Die Zeichenzahl ist **gezählt**, und zwar an der vollständigen Definition: Name, Titel,
 * Beschreibung, Annotationen, Eingabe- und Ausgabeschema. Die frühere Zählung ließ die
 * Schemarümpfe und das gesamte `outputSchema` weg und nannte deshalb eine um 46 Prozent zu
 * kleine Zahl — ausgerechnet an der Stelle, an der ein Nutzer nachsieht, warum sein
 * Kontextfenster voll ist.
 *
 * Die Tokenzahl ist die **gemessene** aus `registry/definition.ts`, solange die gezählten
 * Zeichen zu dem Stand passen, an dem gemessen wurde. Passen sie nicht, ist die eingecheckte
 * Messung veraltet; dann nennt die Zeile die Schätzung über `CHARS_PER_TOKEN`, sagt, dass es
 * eine ist, und verweist auf `pnpm measure-tokens`.
 *
 * @returns Zwei Zeilen ohne Einrückung, in der Reihenfolge der Ausgabe.
 */
export function definitionSizeLines(entries: readonly ToolEntry[]): readonly string[] {
  const chars = measureToolDefinitionChars(entries);
  const estimated = Math.round(chars / CHARS_PER_TOKEN);
  const counted =
    `Werkzeugdefinitionen: ${de(chars)} Zeichen — vollständig gezählt, also Name, Titel, ` +
    "Beschreibung, Annotationen, Eingabe- und Ausgabeschema, so wie tools/list sie ausliefert.";

  if (chars === MEASURED_TOOL_DEFINITION_CHARS) {
    return [
      counted,
      `Tokenzahl: ${de(MEASURED_TOOL_DEFINITION_TOKENS)}, gemessen mit gpt-tokenizer ` +
        "(o200k_base) für genau diesen Stand; geschätzt über den Faktor " +
        `${de(CHARS_PER_TOKEN)} aus budget.ts wären es rund ${de(estimated)}. doctor lädt ` +
        "keinen Tokenizer; pnpm measure-tokens misst neu.",
    ];
  }

  return [
    counted,
    `Tokenzahl: geschätzt rund ${de(estimated)} (Faktor ${de(CHARS_PER_TOKEN)} aus ` +
      `budget.ts). Die eingecheckte Messung — ${de(MEASURED_TOOL_DEFINITION_TOKENS)} Token ` +
      `bei ${de(MEASURED_TOOL_DEFINITION_CHARS)} Zeichen — gehört zu einem anderen ` +
      "Registerstand; pnpm measure-tokens zieht sie nach.",
  ];
}

/** Die Werkzeuge je Wirkung. */
export function countByEffect(entries: readonly ToolEntry[]): Record<ToolEffect, number> {
  const counts: Record<ToolEffect, number> = { read: 0, create: 0, modify: 0, delete: 0 };
  for (const entry of entries) {
    counts[entry.effect] += 1;
  }
  return counts;
}

function credentialSourceLine(config: ResolvedConfig): string {
  if (config.credentials === null) {
    if (config.credentialsSplitAcrossSources) {
      return (
        "Zugangsdaten: unvollständig. Die drei Werte liegen verteilt auf Umgebungsvariablen und " +
        "Zugangsdatendatei; sie werden nicht gemischt."
      );
    }
    return "Zugangsdaten: nicht aufgelöst.";
  }
  return config.credentials.source === "env"
    ? "Zugangsdaten: aus den Umgebungsvariablen."
    : `Zugangsdaten: aus der Zugangsdatendatei, Profil "${config.credentials.profile ?? "default"}"` +
        (config.credentials.label === null ? "." : `, Anzeigename "${config.credentials.label}".`);
}

export interface RunDoctorOptions {
  readonly argv: readonly string[];
  readonly terminal: Terminal;
  readonly host: ClientHost;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Führt die Diagnose aus.
 *
 * Rückgabewert 0, wenn der Server benutzbar ist; 1, wenn er es nicht ist — also bei
 * fehlenden Zugangsdaten oder gescheitertem Verbindungstest. Damit taugt `doctor` auch in
 * einem Skript, ohne dass jemand die Ausgabe lesen muss.
 */
export async function runDoctor(options: RunDoctorOptions): Promise<number> {
  const { terminal, host } = options;
  const args = parseArgs(options.argv, { booleans: ["skip-connection-test"] });
  if (args.positionals.length > 0) {
    terminal.writeError(`doctor kennt kein Argument "${args.positionals[0] ?? ""}".`);
    return 2;
  }

  const { config, warnings } = loadCliConfig(options.env ?? process.env);
  // Zwei Mengen, und sie werden nie vermischt: `entries` ist der volle Satz und damit die
  // Bezugsgröße der eingecheckten Messung; `registered` ist das, was dieser Start anmelden
  // würde. Ohne Gruppenschalter sind beide gleich.
  const entries = TOOL_ENTRIES;
  const activeGroups = new Set<ToolGroup>(config.toolGroups.active);
  const registered = entries.filter((entry) => activeGroups.has(entry.group));
  // Die Bündelwerkzeuge hängen an der Gruppe `bundles` und an keiner Endpunktgruppe. Sie
  // stehen in derselben tools/list-Antwort wie die 54 Endpunktwerkzeuge und gehören deshalb in
  // jede Zahl, die diese Diagnose nennt: Ohne sie meldete `doctor` unter
  // BB_MCP_TOOL_GROUPS=bundles „0 von 54", während der Client fünf Werkzeuge bekommt.
  const registeredBundles = registeredBundleCount(config.toolGroups);
  const registeredTotal = registered.length + registeredBundles;
  const availableTotal = entries.length + BUNDLE_TOOL_COUNT;
  let healthy = true;

  terminal.write(`${BINARY_NAME} — Diagnose`);
  terminal.write("");
  terminal.write(`Paket:      ${PACKAGE_NAME} ${VERSION}`);
  terminal.write(`Node:       ${process.versions.node} auf ${process.platform}/${process.arch}`);
  terminal.write(`Basis-URL:  ${config.baseUrl}`);
  terminal.write("");

  // --- Zugangsdaten -------------------------------------------------------------------
  terminal.write("Zugangsdaten");
  terminal.write(`  ${credentialSourceLine(config)}`);
  terminal.write(
    `  Gesetzt: ${config.presentCredentials.length === 0 ? "keiner der drei Werte" : config.presentCredentials.join(", ")}.`,
  );
  if (config.missingCredentials.length > 0) {
    terminal.write(`  Es fehlen: ${config.missingCredentials.join(", ")}.`);
    healthy = false;
  }
  terminal.write(`  Zugangsdatendatei: ${config.credentialsFile}`);
  if (host.exists(config.credentialsFile)) {
    const permissionWarnings = inspectCredentialsPermissions(config);
    if (permissionWarnings.length === 0) {
      terminal.write("  Dateirechte: in Ordnung (0600 beziehungsweise 0700).");
    } else {
      for (const warning of permissionWarnings) {
        terminal.write(`  Dateirechte: ${warning.text}`);
      }
    }
  } else {
    terminal.write("  Dateirechte: entfällt, die Datei existiert nicht.");
  }
  terminal.write("");

  // --- Schalterlage -------------------------------------------------------------------
  terminal.write("Schalterlage");
  terminal.write(
    `  BB_MCP_READ_ONLY:       ${config.readOnly ? "true, nur lesende Werkzeuge" : "false, alle Werkzeuge"}`,
  );
  terminal.write(`  BB_MCP_MAX_BATCH:       ${String(config.maxBatch)}`);
  terminal.write(`  BB_MCP_MAX_AMOUNT:      ${config.maxAmount ?? "nicht gesetzt, also aus"}`);
  terminal.write(
    `  BB_MCP_CACHE_TTL_MS:    ${config.cacheTtlMs === 0 ? "0, Stammdatenspeicher aus" : String(config.cacheTtlMs)}`,
  );
  terminal.write(
    `  BB_MCP_DUPLICATE_CHECK: ${config.duplicateCheck}${
      config.duplicateCheck === "on"
        ? " — jeder anlegende Aufruf verbraucht einen zusätzlichen lesenden Request"
        : ""
    }`,
  );
  terminal.write(`  BB_MCP_RATE_LIMIT:      ${String(config.rateLimitPerMinute)} je Minute`);
  terminal.write(`  BB_MCP_TIMEOUT_MS:      ${String(config.timeoutMs)}`);
  terminal.write(`  BB_MCP_LOG_LEVEL:       ${config.logLevel}`);
  terminal.write("");

  // --- Werkzeuge ----------------------------------------------------------------------
  const counts = countByEffect(registered);
  terminal.write("Werkzeuge");
  terminal.write(
    `  Registriert: ${String(registeredTotal)}` +
      (registeredTotal === availableTotal ? "" : ` von ${String(availableTotal)}`) +
      ` — ${countedTools(registered.length, "Endpunktwerkzeug", "Endpunktwerkzeuge")} und ` +
      `${countedTools(registeredBundles, "Bündelwerkzeug", "Bündelwerkzeuge")}.`,
  );
  // Die Aufschlüsselung nach Wirkung beschreibt ausdrücklich nur die Endpunktwerkzeuge: Ein
  // Bündel fasst mehrere Endpunkte zusammen, und seine Wirkung ist die schärfste seiner
  // Schritte. Die Zeile sagt das, statt die Zahlen stillschweigend zu vermischen.
  terminal.write(
    "  Die Endpunktwerkzeuge nach Wirkung: " +
      (Object.keys(EFFECT_LABELS) as ToolEffect[])
        .map((effect) => `${String(counts[effect])} ${EFFECT_LABELS[effect]}`)
        .join(", ") +
      ". Die Bündelwerkzeuge sind darin nicht enthalten.",
  );
  // Gezählt wird der volle Satz der Endpunktwerkzeuge, auch bei eingeschränkten Gruppen: Nur
  // er ist mit der eingecheckten Messung vergleichbar. Was diese Installation wirklich sendet,
  // steht im Abschnitt darunter — und die Zeile sagt es, statt die große Zahl unkommentiert
  // danebenzustellen.
  if (registeredTotal !== entries.length) {
    terminal.write(
      `  Die folgenden beiden Zeilen messen den VOLLEN Satz aus ${String(entries.length)} ` +
        "Endpunktwerkzeugen: nicht die Auswahl dieser Installation und ohne die " +
        "Bündeldefinitionen, die in der eingecheckten Messung nicht enthalten sind. Nur so " +
        "bleiben sie vergleichbar. Was hier wirklich gesendet wird, steht unter " +
        "Werkzeuggruppen.",
    );
  }
  for (const line of definitionSizeLines(entries)) {
    terminal.write(`  ${line}`);
  }
  terminal.write("");

  // --- Werkzeuggruppen ------------------------------------------------------------------
  terminal.write("Werkzeuggruppen");
  terminal.write(
    `  ${TOOL_GROUPS_VAR}:         ${config.toolGroups.include === null ? "nicht gesetzt, also alle Gruppen" : config.toolGroups.include.join(", ")}`,
  );
  terminal.write(
    `  ${TOOL_GROUPS_EXCLUDE_VAR}: ${config.toolGroups.exclude.length === 0 ? "nicht gesetzt" : config.toolGroups.exclude.join(", ")}`,
  );
  for (const line of toolGroupReportLines(config.toolGroups, registeredTotal)) {
    terminal.write(`  ${line}`);
  }
  terminal.write("");

  // --- Umgebung -----------------------------------------------------------------------
  const unknownVars = warnings.filter((warning) => warning.code === "unknown-env-var");
  const otherWarnings = warnings.filter(
    (warning) => warning.code !== "unknown-env-var" && warning.code !== "not-configured",
  );
  if (unknownVars.length > 0 || otherWarnings.length > 0) {
    terminal.write("Auffälligkeiten in der Umgebung");
    for (const warning of [...unknownVars, ...otherWarnings]) {
      terminal.write(`  ${warning.text}`);
    }
    terminal.write("");
  }

  // --- Clientkonfigurationen ----------------------------------------------------------
  terminal.write("Gefundene Clients");
  for (const adapter of ALL_ADAPTERS) {
    const detection = adapter.detect(host);
    terminal.write(`  ${detection.found ? "gefunden    " : "nicht gefunden"} ${adapter.label}`);
    terminal.write(`      ${detection.how}`);
  }
  terminal.write(`  Hinweis: ${CHATGPT_BROWSER_NOTE}`);
  terminal.write("");

  // --- Verbindung ---------------------------------------------------------------------
  terminal.write("Verbindung");
  if (!config.configured) {
    terminal.write(
      "  Der Verbindungstest entfällt: Es sind keine vollständigen Zugangsdaten vorhanden.",
    );
    terminal.write(`  Abhilfe: ${BINARY_NAME} setup`);
    healthy = false;
  } else if (args.flags.get("skip-connection-test") === true) {
    terminal.write("  Übersprungen (--skip-connection-test).");
  } else {
    const result = await runConnectionTest(config);
    printConnectionTest(terminal, result, { listAccounts: true });
    healthy = healthy && result.ok;
  }

  return healthy ? 0 : 1;
}
