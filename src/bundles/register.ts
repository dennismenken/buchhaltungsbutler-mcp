// Die Registrierung der Bündelwerkzeuge und der ZWEITE generische Handler.
//
// Die Guards laufen unverändert und in derselben Reihenfolge wie in
// `src/server/register-tools.ts`: Konfiguration, Nur-Lesen-Schalter, Schema, Querprüfungen.
// Guard 5 und Guard 6 entfallen, weil kein Bündel einen Betrag, einen Stapel oder einen
// anlegenden Schritt führt. Danach kommt ein fünfter Schritt, den nur ein Bündel braucht: die
// Vorabprüfung am Token-Eimer.
//
// **Der Gruppenschalter `BB_MCP_TOOL_GROUPS` entscheidet über die Registrierung, der
// Nur-Lesen-Schalter `BB_MCP_READ_ONLY` über die Ausführung.** Die Bündel hängen an keiner
// Endpunktgruppe: Ein Bündel ruft die HTTP-Schicht auf und nicht die Endpunktwerkzeuge.
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

import type { ToolGroupSelection } from "../config/tool-groups.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { getConfig } from "../config/resolve.js";
import { renderRejectedBeforeRequest } from "../errors/render.js";
import { joinIssues } from "../errors/zod-issue.js";
import { checkConfigured } from "../guards/configured.js";
import { formatReadOnlyRefusal } from "../guards/read-only.js";
import { getRateLimiter, type RateLimiter } from "../http/rate-limiter.js";
import { logError, writeStderrBlock } from "../logging/stderr.js";
import { projectionFrom } from "../mapping/response.js";
import { READ_ONLY_TOOL_CLASS, TOOL_CLASSES } from "../registry/classes.js";
import { BUNDLE_TOOL_GROUP } from "../registry/groups.js";
import { BUNDLE_ENTRIES } from "./index.js";
import { BundleRunner, formatSeconds } from "./runtime.js";
import { buildBundleJsonSchema, buildBundleOutputSchema, buildBundleZodSchema } from "./schema.js";
import type { BundleArguments, BundleEntry } from "./types.js";

/** Herkunftskennung der Schematräger, wie in `register-tools.ts`. */
const SCHEMA_VENDOR = "buchhaltungsbutler-mcp";

/** Schematräger für das SDK: Er kündigt an und prüft nicht (Begründung in register-tools.ts). */
function advertise(
  jsonSchema: Record<string, unknown>,
): StandardSchemaWithJSON<BundleArguments, BundleArguments> {
  return {
    "~standard": {
      version: 1,
      vendor: SCHEMA_VENDOR,
      validate: (value: unknown) => ({ value: value as BundleArguments }),
      jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
    },
  };
}

export interface RegisteredBundleInfo {
  readonly name: string;
  readonly group: typeof BUNDLE_TOOL_GROUP;
  readonly maxCalls: number;
  readonly blockedByReadOnly: boolean;
}

export interface RegisterBundlesOptions {
  /** Die Einträge. Ohne Angabe alle aus `src/bundles/index.ts`. */
  readonly entries?: readonly BundleEntry[];
  readonly config?: ResolvedConfig;
  /** Die aktiven Werkzeuggruppen. Ohne Angabe die Auswahl der übergebenen Konfiguration. */
  readonly groups?: ToolGroupSelection;
  readonly limiter?: RateLimiter;
  /** Die Uhr der Audit-Dauer. Monoton, nicht die Wanduhr. */
  readonly now?: () => number;
}

interface BundleRuntime {
  readonly entry: BundleEntry;
  /** Guard 3: das Objektschema **ohne** die Querprüfungen. */
  readonly baseSchema: z.ZodType;
  /** Guard 4: dasselbe Schema **mit** den Querprüfungen. */
  readonly fullSchema: z.ZodType;
  readonly config: ResolvedConfig;
  readonly limiter: RateLimiter;
  readonly now: () => number;
}

function textResult(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

/**
 * Die Audit-Zeile, in derselben Form wie bei den 54 Endpunktwerkzeugen. Als Endpunkt steht dort
 * `(bündel)` samt der Zahl der Teilaufrufe: Ein Bündel hat keinen einen Endpunkt, und der erste
 * seiner Schritte wäre eine Halbwahrheit. Welche Pfade liefen, steht in `bundle.steps`.
 */
function audit(
  runtime: BundleRuntime,
  rawArgs: BundleArguments,
  startedAt: number,
  outcome: string,
  calls: number,
): void {
  const durationMs = Math.round(runtime.now() - startedAt);
  const names = Object.keys(rawArgs).sort();
  writeStderrBlock(
    `audit ${new Date().toISOString()} werkzeug=${runtime.entry.name} ` +
      `klasse=${runtime.entry.toolClass} endpunkt=(bündel) aufrufe=${String(calls)} ` +
      `dauer=${String(durationMs)}ms ergebnis=${outcome} ` +
      `argumente=${names.length === 0 ? "keine" : names.join(",")}`,
  );
}

function refuse(
  runtime: BundleRuntime,
  rawArgs: BundleArguments,
  startedAt: number,
  outcome: string,
  text: string,
): CallToolResult {
  audit(runtime, rawArgs, startedAt, `abgelehnt:${outcome}`, 0);
  return textResult(text, true);
}

/**
 * Die Absage eines Schema- oder Querprüfungsverstoßes, im Vierblockaufbau.
 *
 * Die Befunde bereitet `errors/zod-issue.ts` auf, dieselbe Stelle, die auch die 54
 * Endpunktwerkzeuge benutzen. Eine eigene, knappere Fassung stand hier bis zur Zusammenlegung
 * und reichte `issue.message` unverändert durch; damit kam derselbe Fehler bei einem Bündel auf
 * Englisch heraus („Invalid input: expected number, received string") und bei einem
 * Endpunktwerkzeug auf Deutsch — und ein fehlendes Pflichtfeld war von einem Typfehler nicht
 * mehr zu unterscheiden; im Evaluationslauf hat genau das einen Irrweg erzeugt. `rawArgs`
 * steht dafür unverändert zur Verfügung: Die
 * Guards 3 und 4 laufen hier wie dort vor jeder Umformung.
 */
function schemaRefusal(
  entry: BundleEntry,
  issues: readonly z.core.$ZodIssue[],
  was: string,
  rawArgs: BundleArguments,
): string {
  return renderRejectedBeforeRequest({
    toolName: entry.name,
    was,
    warum: joinIssues(issues, rawArgs),
    wie:
      `Die genannten Felder korrigieren und ${entry.name} erneut aufrufen. Die Feldliste und ` +
      "die erlaubten Werte stehen in der Beschreibung dieses Werkzeugs.",
  }).text;
}

/**
 * Guard 2 für ein Bündel. Die Klasse kommt aus dem Register und niemals aus dem Namen; der
 * Absagetext ist wörtlich derselbe wie bei den Endpunktwerkzeugen.
 */
function checkBundleReadOnly(entry: BundleEntry, config: ResolvedConfig): string | undefined {
  if (!config.readOnly || entry.toolClass === READ_ONLY_TOOL_CLASS) {
    return undefined;
  }
  return formatReadOnlyRefusal(entry.name);
}

async function runBundle(
  runtime: BundleRuntime,
  rawArgs: BundleArguments,
  signal: AbortSignal,
): Promise<CallToolResult> {
  const startedAt = runtime.now();
  try {
    return await runGuardedBundle(runtime, rawArgs, signal, startedAt);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logError(
      `${runtime.entry.name}: unerwarteter Fehler im Bündelhandler: ${detail}` +
        (error instanceof Error && error.stack !== undefined ? `\n${error.stack}` : ""),
    );
    audit(runtime, rawArgs, startedAt, "fehler:unerwartet", 0);
    return textResult(
      renderRejectedBeforeRequest({
        toolName: runtime.entry.name,
        was: "Dieser Server ist in einen unerwarteten Zustand gelaufen.",
        warum: detail,
        wie:
          "Den Aufruf nicht unverändert wiederholen. Der Vorgang ist ein Fehler dieses " +
          "Servers; die Einzelheiten stehen im Protokoll des Serverprozesses (stderr).",
      }).text,
      true,
    );
  }
}

async function runGuardedBundle(
  runtime: BundleRuntime,
  rawArgs: BundleArguments,
  signal: AbortSignal,
  startedAt: number,
): Promise<CallToolResult> {
  const { entry, config } = runtime;

  // --- Guard 1: Konfiguration ---------------------------------------------------------
  const notConfigured = checkConfigured(entry.name, config);
  if (notConfigured !== undefined) {
    return refuse(runtime, rawArgs, startedAt, "konfiguration", notConfigured);
  }

  // --- Guard 2: Nur-Lesen-Schalter ----------------------------------------------------
  const readOnlyRefusal = checkBundleReadOnly(entry, config);
  if (readOnlyRefusal !== undefined) {
    return refuse(runtime, rawArgs, startedAt, "nur-lesen", readOnlyRefusal);
  }

  // --- Guard 3: Schema, streng --------------------------------------------------------
  const parsed = runtime.baseSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return refuse(
      runtime,
      rawArgs,
      startedAt,
      "schema",
      schemaRefusal(
        entry,
        parsed.error.issues,
        "Die Argumente entsprechen nicht dem Eingabeschema dieses Werkzeugs.",
        rawArgs,
      ),
    );
  }

  // --- Guard 4: Querprüfungen ---------------------------------------------------------
  let args = parsed.data as BundleArguments;
  if (entry.crossChecks.length > 0 || entry.bundleChecks.length > 0) {
    const crossChecked = runtime.fullSchema.safeParse(rawArgs);
    if (!crossChecked.success) {
      return refuse(
        runtime,
        rawArgs,
        startedAt,
        "querprüfung",
        schemaRefusal(
          entry,
          crossChecked.error.issues,
          "Eine Querprüfung dieses Bündels ist nicht erfüllt.",
          rawArgs,
        ),
      );
    }
    args = crossChecked.data as BundleArguments;
  }

  const runner = new BundleRunner({
    entry,
    config,
    signal,
    projection: projectionFrom(args),
    args,
    limiter: runtime.limiter,
    now: runtime.now,
  });

  // --- Vorabprüfung am Token-Eimer ----------------------------------------------------
  // Ein Bündel, das nach dem dritten von fünf Aufrufen im Limit hängenbleibt, ist teurer als
  // eines, das gar nicht erst anfängt.
  const seen = runner.peek();
  if (seen.available < entry.minTokens) {
    return refuse(
      runtime,
      rawArgs,
      startedAt,
      "kontingent",
      renderRejectedBeforeRequest({
        toolName: entry.name,
        was:
          `Für diesen Aufruf liegen weniger als ${String(entry.minTokens)} Token des ` +
          "Minutenkontingents bereit.",
        warum:
          `Verfügbar sind ${String(seen.available)} Token ohne Warten; dieses Bündel braucht ` +
          `mindestens ${String(entry.minTokens)} für eine sinnvolle Antwort. Das ` +
          "Minutenkontingent des Mandanten wird mit der Weboberfläche geteilt.",
        wie:
          `Rund ${formatSeconds(Math.max(seen.waitMs, 1000))} warten und ${entry.name} erneut ` +
          "aufrufen. Der Eimer ist prozesslokal; er füllt sich von selbst wieder auf.",
      }).text,
    );
  }

  const outcome = await entry.run(runner, args);

  // Scheitert jeder Schritt, ist die Antwort ein Fehler und keine leere Erfolgsmeldung.
  // Geprüft wird die Tatsache dahinter — kein einziger erfolgreicher Schritt. Dann gibt es
  // nichts zu berichten.
  const failure = runner.firstFailureOrNull();
  if (runner.successCount() === 0 && failure !== null) {
    audit(runtime, rawArgs, startedAt, `fehler:${failure.kind}`, runner.callsUsed());
    const fallback = runner.errorOutcome(failure);
    return textResult(fallback.kind === "error" ? fallback.text : failure.summary, true);
  }

  if (outcome.kind === "error") {
    audit(runtime, rawArgs, startedAt, "fehler:bündel", runner.callsUsed());
    return textResult(outcome.text, true);
  }

  const lines = [
    runner.incompleteLine(outcome.incompleteDetail),
    ...runner.gapLines(),
    ...outcome.lines,
  ].filter((line) => line !== "");

  audit(
    runtime,
    rawArgs,
    startedAt,
    runner.isComplete() ? "ok" : "ok:unvollständig",
    runner.callsUsed(),
  );

  return {
    content: [{ type: "text", text: lines.join("\n\n") }],
    structuredContent: { success: true, bundle: runner.bundleBlock(), ...outcome.data },
  };
}

/** Die Zahl der Bündelwerkzeuge insgesamt, unabhängig vom Gruppenschalter. */
export const BUNDLE_TOOL_COUNT = BUNDLE_ENTRIES.length;

/** `true`, wenn diese Auswahl die Bündelwerkzeuge anmeldet — alle oder keines. */
export function bundlesAreActive(groups: ToolGroupSelection): boolean {
  return groups.active.includes(BUNDLE_TOOL_GROUP);
}

/**
 * Die Zahl der Bündelwerkzeuge, die diese Auswahl anmeldet: alle {@link BUNDLE_TOOL_COUNT}
 * oder keines.
 *
 * Gedacht für die Stellen, die eine Werkzeugzahl **nennen**, ohne einen Server zu bauen:
 * `doctor` und `print-config`. Ohne sie zählten beide nur die Endpunktwerkzeuge und meldeten
 * unter `BB_MCP_TOOL_GROUPS=bundles` „0 von 54", während `tools/list` fünf Werkzeuge
 * ausliefert. Wer ein Profil einstellt, hat keine andere Stelle, an der er nachsieht.
 */
export function registeredBundleCount(groups: ToolGroupSelection): number {
  return bundlesAreActive(groups) ? BUNDLE_TOOL_COUNT : 0;
}

/**
 * Registriert die Bündelwerkzeuge, sofern die Gruppe `bundles` aktiv ist.
 *
 * @returns Eine Zeile je registriertem Bündel; leer, wenn die Gruppe abgeschaltet ist.
 */
export function registerBundles(
  server: McpServer,
  options: RegisterBundlesOptions = {},
): readonly RegisteredBundleInfo[] {
  const entries = options.entries ?? BUNDLE_ENTRIES;
  const config = options.config ?? getConfig();
  const groups = options.groups ?? config.toolGroups;
  const limiter = options.limiter ?? getRateLimiter();
  const now = options.now ?? ((): number => performance.now());

  if (!bundlesAreActive(groups)) {
    return [];
  }

  const registered: RegisteredBundleInfo[] = [];
  for (const entry of entries) {
    const runtime: BundleRuntime = {
      entry,
      baseSchema: buildBundleZodSchema(entry, false),
      fullSchema: buildBundleZodSchema(entry),
      config,
      limiter,
      now,
    };

    server.registerTool(
      entry.name,
      {
        title: entry.title,
        description: entry.description,
        inputSchema: advertise(buildBundleJsonSchema(entry)),
        outputSchema: advertise(buildBundleOutputSchema(entry)),
        annotations: { ...TOOL_CLASSES[entry.toolClass].annotations },
        // Die Wörter, die eine Buchhalterin sagt. Der Hinweis hilft Clients, die Werkzeuge
        // erst bei Bedarf laden, beim Finden. Die genaue erwartete Form dieses Feldes ist in
        // diesem Projekt NICHT verifiziert; ein Client, der den Schlüssel nicht kennt,
        // übergeht ihn. `anthropic/alwaysLoad` setzt hier bewusst kein Bündel: Der Schlüssel
        // hebt das verzögerte Laden auf und legt die vollständige Werkzeugdefinition dauerhaft
        // in den Clientkontext zurück. Ob ein Werkzeug diesen Platz wert ist, entscheidet der
        // Nutzer in seiner Clientkonfiguration, nicht der Server über seine eigene Liste.
        _meta: { "anthropic/searchHint": entry.searchHint.join(", ") },
      },
      (args, ctx) => runBundle(runtime, args, ctx.mcpReq.signal),
    );

    registered.push({
      name: entry.name,
      group: entry.group,
      maxCalls: entry.maxCalls,
      blockedByReadOnly: checkBundleReadOnly(entry, config) !== undefined,
    });
  }

  return registered;
}
