// Der Discovery-Modus: fünf Gatewaywerkzeuge statt 61 Endpunktwerkzeuge.
//
// Im Modus `direct` meldet `register-tools.ts` jeden Eintrag einzeln an; im Modus
// `discovery` meldet diese Datei stattdessen genau fünf Werkzeuge an, die denselben
// Katalog und denselben Ausführungsweg benutzen. Der Katalog bleibt das Register
// (`src/registry/tools/`): Katalog, Beschreibung und Aufruf kennen nur Einträge aktiver
// Gruppen, und ein abgeschaltetes Werkzeug ist hier genauso wenig erreichbar wie dort.
// Der Ausführungsweg ist ab geprüften Argumenten derselbe Code (`register-tools.ts`):
// Guard 1 und Guard 2, Schema und Querprüfungen, Grenze, Duplikatshinweis, Speicher,
// Request, Antwort und Audit. Eine zweite Kopie daneben wäre ein zweiter Weg, der
// auseinanderlaufen kann.
//
// Die Gateway-Prüfungen davor sind neu und gehören hierher, weil es sie im direkten
// Modus nicht gibt: bekannt, aktiv, zuständig. Ihre Reihenfolge steht bei
// `runInvokeTarget`: erst bekannt und aktiv (ohne Eintrag gibt es nichts zu prüfen),
// dann Guard 1 und Guard 2 über den gemeinsamen Weg, dann die Zuständigkeit, dann das
// Schema des Ziels.
//
// **Die Schemaprüfung des Gateways selbst liegt wie im direkten Modus im Handler und
// nicht im SDK** (Begründung im Kopf von `register-tools.ts`): Angekündigt wird das
// erzeugte JSON Schema, geprüft wird mit dem Zod-Schema, aus dem es entstanden ist.
// Die Darstellung der Schemameldung ist dieselbe (`schemaRefusalText`), nur der
// Werkzeugname ist das Zielwerkzeug und das Eingabeschema des Ziels hängt an.
//
// **Die Antwort eines erfolgreichen Aufrufs ist genau das `CallToolResult` des
// Zielwerkzeugs.** Weder der Text noch `structuredContent` werden umgeschrieben; ein
// Aufruf über das Gateway liefert dieselbe Antwort wie der direkte Aufruf.
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { MasterDataStore } from "../cache/store.js";
import { getMasterDataStore } from "../cache/store.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { getConfig } from "../config/resolve.js";
import { TOOL_GROUPS_VAR } from "../config/tool-groups.js";
import { closestAllowedValue, renderRejectedBeforeRequest } from "../errors/render.js";
import { READ_ONLY_TOOL_CLASS, TOOL_CLASSES } from "../registry/classes.js";
import {
  BUNDLE_TOOL_GROUP,
  isToolGroup,
  TOOL_GROUP_NAMES,
  TOOL_GROUPS,
} from "../registry/groups.js";
import type { ToolGroup } from "../registry/groups.js";
import { TOOL_ENTRIES } from "../registry/index.generated.js";
import type { ToolClass, ToolEntry } from "../registry/types.js";
import { buildOutputSchema } from "../response/output-schema.js";
import { toJsonSchema } from "../schema/build.js";
import { strictObject } from "../schema/primitives.js";
import { READ_ONLY_VAR } from "../guards/read-only.js";
import {
  checkEarlyGuards,
  createToolRuntime,
  refuseCall,
  runAfterValidation,
  schemaRefusalText,
  unexpectedFailure,
  validateToolArgs,
  type AuditHead,
  type ToolArguments,
  type ToolRuntime,
} from "./register-tools.js";

/** Die fünf Gatewaywerkzeuge, abschließend. Die Namen stehen in der Vorgabe. */
export const DISCOVER_TOOL = "bb_tools_discover";
export const DESCRIBE_TOOL = "bb_tools_describe";
export const INVOKE_READ_TOOL = "bb_tools_invoke_read";
export const INVOKE_WRITE_TOOL = "bb_tools_invoke_write";
export const INVOKE_DESTRUCTIVE_TOOL = "bb_tools_invoke_destructive";

/** Alle fünf in Anmeldereihenfolge: erst finden, dann verstehen, dann aufrufen. */
export const GATEWAY_TOOL_NAMES: readonly string[] = Object.freeze([
  DISCOVER_TOOL,
  DESCRIBE_TOOL,
  INVOKE_READ_TOOL,
  INVOKE_WRITE_TOOL,
  INVOKE_DESTRUCTIVE_TOOL,
]);

/**
 * Die Zuordnung Klasse zu Aufrufwerkzeug, fest aus der Vorgabe: R läuft über
 * `invoke_read`; A und B über `invoke_write`; M, D und AR über `invoke_destructive`.
 * Sie wird niemals aus dem Namen abgeleitet, sondern schlüsselt über die Klasse des
 * Eintrags — dieselbe Regel wie in `registry/classes.ts`.
 */
export function invokeToolForClass(toolClass: ToolClass): string {
  switch (toolClass) {
    case "R":
      return INVOKE_READ_TOOL;
    case "A":
    case "B":
      return INVOKE_WRITE_TOOL;
    case "M":
    case "D":
    case "AR":
      return INVOKE_DESTRUCTIVE_TOOL;
  }
}

/**
 * Die Annotationen der beiden schreibenden Aufrufwerkzeuge.
 *
 * `invoke_write` trägt die Annotationen der Klasse A, `invoke_destructive` die der
 * Klasse D: Ein Aufrufwerkzeug erbt die Zusage der Klasse, die es ausführt. Die drei
 * übrigen Gateways tragen die Annotationen der Klasse R.
 */
const INVOKE_WRITE_ANNOTATIONS = { ...TOOL_CLASSES.A.annotations };
const INVOKE_DESTRUCTIVE_ANNOTATIONS = { ...TOOL_CLASSES.D.annotations };

function annotationsOfGateway(name: string): Record<string, boolean> {
  if (name === INVOKE_WRITE_TOOL) {
    return { ...INVOKE_WRITE_ANNOTATIONS };
  }
  if (name === INVOKE_DESTRUCTIVE_TOOL) {
    return { ...INVOKE_DESTRUCTIVE_ANNOTATIONS };
  }
  return { ...TOOL_CLASSES.R.annotations };
}

/**
 * Die Annotationsklasse eines Gateways: die Zusage, die `tools/list` ausliefert.
 *
 * Exportiert, weil der Servertext im Discovery-Modus über dieselben Klassen zählt wie
 * die Anmeldung: drei lesende Gateways und zwei schreibende.
 */
export function gatewayToolClass(name: string): ToolClass {
  if (name === INVOKE_WRITE_TOOL) {
    return "A";
  }
  if (name === INVOKE_DESTRUCTIVE_TOOL) {
    return "D";
  }
  return "R";
}

/**
 * Das offene Ausgabeschema der drei Aufrufwerkzeuge.
 *
 * **Offen und ohne Pflichtfelder mit Absicht.** Welches Ziel hinter `name` steht, weiß
 * erst der Aufruf; das Zielschema liefert `bb_tools_describe` vorab. Ein Pflichtfeld
 * hier ließe einen validierenden Client jede Antwort verwerfen, deren Ziel ein anderes
 * Feld trägt — gemessen am 2026-09-13 mit drei Update-Werkzeugen, deren Antwort kein
 * `data` trägt, obwohl das Ausgabeschema es verlangte (Fehler aus 0.1.2, dort
 * 689b10b). Dasselbe offene Muster tragen die übrigen Ausgabeschemata des Projekts.
 */
const OPEN_OBJECT_SCHEMA: Record<string, unknown> = Object.freeze({
  type: "object",
  additionalProperties: true,
});

/** Herkunftskennung der Schematräger, wie in `register-tools.ts`. */
const SCHEMA_VENDOR = "buchhaltungsbutler-mcp";

/** Schematräger für das SDK: Er kündigt an und prüft nicht (Begründung dort). */
function advertise(
  jsonSchema: Record<string, unknown>,
): StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>> {
  return {
    "~standard": {
      version: 1,
      vendor: SCHEMA_VENDOR,
      validate: (value: unknown) => ({ value: value as Record<string, unknown> }),
      jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
    },
  };
}

export interface RegisterDiscoveryOptions {
  /** Die Einträge. Ohne Angabe das vollständige Register aus `index.generated.ts`. */
  readonly entries?: readonly ToolEntry[];
  /** Die aufgelöste Konfiguration. Ohne Angabe die eingefrorene des Prozesses. */
  readonly config?: ResolvedConfig;
  /** Der Stammdatenspeicher. Ohne Angabe der prozessweite aus `cache/store.ts`. */
  readonly store?: MasterDataStore;
  /** Die Uhr der Audit-Dauer. Monoton, nicht die Wanduhr. */
  readonly now?: () => number;
}

export interface RegisteredGatewayInfo {
  readonly name: string;
  /** Kennzeichnet die Zeile als Gateway und nicht als Endpunktwerkzeug. */
  readonly gateway: true;
  /** Die Annotationsklasse, also die Zusage, die `tools/list` ausliefert. */
  readonly toolClass: ToolClass;
  /**
   * `false` für alle fünf: Die Gateways bleiben angemeldet, gleich ob der
   * Nur-Lesen-Schalter steht. Gesperrt wird das schreibende **Ziel** beim Aufruf, mit
   * derselben Absage wie im direkten Modus.
   */
  readonly blockedByReadOnly: false;
}

/** Der Zustand, den alle fünf Handler teilen. Einmal beim Registrieren gebaut. */
interface DiscoveryContext {
  /** Alle übergebenen Einträge, aktiv oder nicht: zum Nachschlagen und Vorschlagen. */
  readonly byName: ReadonlyMap<string, ToolEntry>;
  /** Die Laufzeiten der aktiven Einträge, in Registerreihenfolge. */
  readonly runtimes: ReadonlyMap<string, ToolRuntime>;
  /** Die Einträge aktiver Gruppen, in Registerreihenfolge. */
  readonly activeEntries: readonly ToolEntry[];
  /** Die aktiven Endpunktgruppen, also ohne `bundles`, in Tabellenreihenfolge. */
  readonly activeEndpointGroups: readonly ToolGroup[];
  readonly config: ResolvedConfig;
  readonly now: () => number;
}

/** Der Kopf der Audit-Zeile eines Gateways: das Gateway selbst als Werkzeug. */
function gatewayHead(gatewayName: string, now: () => number): AuditHead {
  return {
    entry: { name: gatewayName, toolClass: gatewayToolClass(gatewayName) },
    specPath: "(gateway)",
    now,
  };
}

/**
 * Die Absage einer gateway-eigenen Schemaverletzung, im selben Vierblock wie direkt.
 *
 * Dieselbe Darstellung wie im direkten Modus: derselbe Satzbau, derselbe Befundtext aus
 * `errors/zod-issue.ts`. Der Werkzeugname ist das Gateway, dessen Schema verletzt ist.
 */
/**
 * Die Absage einer gateway-eigenen Schemaverletzung, im selben Vierblock wie direkt.
 *
 * Dieselbe Darstellung wie im direkten Modus: derselbe Satzbau, derselbe Befundtext aus
 * `errors/zod-issue.ts`. Der Werkzeugname ist das Gateway, dessen Schema verletzt ist.
 * Das strukturierte Datum nennt den Misserfolg, damit auch eine Absage gegen das
 * Ausgabeschema prüft.
 */
function gatewaySchemaRefusal(
  head: AuditHead,
  gatewayName: string,
  rawArgs: ToolArguments,
  startedAt: number,
  issues: readonly z.core.$ZodIssue[],
): CallToolResult {
  return {
    ...refuseCall(
      head,
      rawArgs,
      startedAt,
      "schema",
      schemaRefusalText(
        gatewayName,
        issues,
        "Die Argumente entsprechen nicht dem Eingabeschema dieses Werkzeugs.",
        rawArgs,
      ),
      gatewayName,
    ),
    structuredContent: { success: false, gateway: gatewayName },
  };
}

/**
 * Eine Absage des Gateways selbst, mit Audit-Zeile wie jede Ablehnung vor dem Request.
 *
 * Das strukturierte Datum nennt den Misserfolg: Auch die Absage prüft gegen das offene
 * Ausgabeschema und bleibt damit für einen validierenden Client lesbar.
 */
function gatewayRefusal(
  head: AuditHead,
  gatewayName: string,
  rawArgs: ToolArguments,
  startedAt: number,
  outcome: string,
  text: string,
): CallToolResult {
  return {
    ...refuseCall(head, rawArgs, startedAt, outcome, text, gatewayName),
    structuredContent: { success: false, gateway: gatewayName },
  };
}

// ---------------------------------------------------------------------------------------
// Die Stichwortsuche.
// ---------------------------------------------------------------------------------------

/**
 * Faltet die Schreibung für den Vergleich: klein und ohne Umlaute.
 *
 * `ä` und `ae` fallen auf dasselbe Zeichen, ebenso `ö`/`oe`, `ü`/`ue` und `ß`/`ss`.
 * Gefaltet wird auf beiden Seiten, Abfrage wie Katalog, damit keine Seite raten muss,
 * wie die andere schreibt.
 */
function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

/** Zerlegt die Abfrage in Wörter. Trennzeichen ist alles außer Buchstaben und Ziffern. */
function searchWords(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

/**
 * Die Wörter, die keinen Satz beenden. „z. B." steht mitten im Satz und darf ihn beim
 * Kürzen auf den ersten Satz nicht abschneiden; dasselbe gilt für die geläufigen
 * Kurzformen. Geprüft wird kleingeschrieben und ohne den Punkt.
 */
const SENTENCE_ABBREVIATIONS: readonly string[] = Object.freeze([
  "ca",
  "ggf",
  "bzw",
  "inkl",
  "exkl",
  "nr",
  "sog",
  "evtl",
  "usw",
  "etc",
]);

/**
 * Der erste Satz einer Werkzeugbeschreibung.
 *
 * Das Satzende ist ein Satzzeichen mit Abstand oder Textende; ein einzelner Buchstabe
 * davor („z.", „B.") und die Kurzformen oben beenden keinen Satz. Ohne Satzende kommt
 * der ganze Text zurück: Eine Beschreibung ohne Punkt ist kurz und kein Fall für das
 * Kürzen.
 */
function firstSentence(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  const endPattern = /[.!?…]+(\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = endPattern.exec(single)) !== null) {
    const token = (single.slice(0, match.index).trimEnd().split(" ").pop() ?? "").toLowerCase();
    if (token.length <= 1 || SENTENCE_ABBREVIATIONS.includes(token)) {
      continue;
    }
    return single.slice(0, match.index + match[0].length).trimEnd();
  }
  return single;
}

/** „1 Werkzeug" oder „N Werkzeuge". */
function toolWord(count: number): string {
  return count === 1 ? "1 Werkzeug" : `${String(count)} Werkzeuge`;
}

/**
 * Die Trefferpunkte eines Eintrags für die zerlegte Abfrage.
 *
 * Name und Titel wiegen schwerer als die Beschreibung: Wer einen Namen oder Titelteil
 * tippt, meint dieses Werkzeug; wer nur ein Beschreibungswort trifft, meint vielleicht
 * ein Nachbarwerkzeug. Bei Gleichstand entscheidet die Registerreihenfolge, weil sie
 * keine weitere Behauptung aufstellt.
 */
function scoreEntry(entry: ToolEntry, words: readonly string[]): number {
  let score = 0;
  const nameParts = entry.name.split("_");
  const title = normalizeSearchText(entry.title);
  const description = normalizeSearchText(entry.description);
  for (const word of words) {
    if (nameParts.includes(word)) {
      score += 5;
    } else if (
      word.length >= 4 &&
      nameParts.some((part) => part.startsWith(word) || word.startsWith(part))
    ) {
      // Einzahl gegen Mehrzahl („debitor" gegen „debtors"): Der Stamm trifft, das volle
      // Wort nicht. Gewertet wird der Treffer, aber schwächer als das volle Wort.
      score += 3;
    }
    if (title.includes(word)) {
      score += 4;
    } else if (word.length >= 5 && title.includes(word.slice(0, 5))) {
      // Deutsche Beugung („löschen" gegen „löscht"): Der Wortstamm trifft.
      score += 2;
    }
    if (description.includes(word)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Die Stichwortsuche über den Katalog.
 *
 * Deterministisch, ohne Netz und ohne Modell: Wörter falten, werten, bei Gleichstand
 * die Registerreihenfolge. Höchstens `limit` Treffer mit Punkten über null. Steht die
 * Abfrage wörtlich als Werkzeugname im Katalog, steht dieses Werkzeug vorn: Ein exakter
 * Name ist kein Suchfall, sondern ein Griff.
 */
function searchCatalog(
  ctx: DiscoveryContext,
  query: string,
  limit: number,
  onlyGroup?: ToolGroup,
): { readonly entry: ToolEntry; readonly score: number }[] {
  const compact = query.trim().toLowerCase();
  const words = searchWords(query);
  const pool =
    onlyGroup === undefined
      ? ctx.activeEntries
      : ctx.activeEntries.filter((entry) => entry.group === onlyGroup);
  const scored = pool.map((entry) => {
    const bonus = entry.name === compact ? 50 : 0;
    return { entry, score: bonus + scoreEntry(entry, words) };
  });
  const hits = scored.filter((hit) => hit.score > 0);
  // Stabil: Bei gleichen Punkten bleibt die Registerreihenfolge stehen.
  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, limit);
}

// ---------------------------------------------------------------------------------------
// `bb_tools_discover`: Übersicht, Gruppenverzeichnis, Stichwortsuche.
// ---------------------------------------------------------------------------------------

/** Eine Gruppe der Übersicht: Name, deutscher Name, Zahl und was ohne sie fehlt. */
function overviewGroups(ctx: DiscoveryContext): {
  readonly group: string;
  readonly label: string;
  readonly tools: number;
  readonly withoutIt: string;
}[] {
  return ctx.activeEndpointGroups.map((group) => ({
    group,
    label: TOOL_GROUPS[group].label,
    tools: ctx.activeEntries.filter((entry) => entry.group === group).length,
    withoutIt: TOOL_GROUPS[group].withoutIt,
  }));
}

/** Ein Katalogeintrag in Verzeichnis und Suche: Name, Titel, Klasse, Weg und Satz. */
function catalogEntry(entry: ToolEntry): {
  readonly name: string;
  readonly title: string;
  readonly class: ToolClass;
  readonly invokeVia: string;
  readonly summary: string;
} {
  return {
    name: entry.name,
    title: entry.title,
    class: entry.toolClass,
    invokeVia: invokeToolForClass(entry.toolClass),
    summary: firstSentence(entry.description),
  };
}

/**
 * Löst den Gruppenwunsch auf: unbekannt oder abgeschaltet.
 *
 * @returns Die Gruppe, oder die Absage, wenn der Wunsch ins Leere zeigt.
 */
function resolveDiscoverGroup(
  ctx: DiscoveryContext,
  head: AuditHead,
  rawArgs: ToolArguments,
  startedAt: number,
  group: string,
): { readonly group: ToolGroup } | { readonly refusal: CallToolResult } {
  if (!isToolGroup(group) || group === BUNDLE_TOOL_GROUP) {
    const bundlesHint =
      group === BUNDLE_TOOL_GROUP
        ? " Die fünf Bündelwerkzeuge sind direkt nutzbar und stehen nicht im Katalog."
        : "";
    return {
      refusal: gatewayRefusal(
        head,
        DISCOVER_TOOL,
        rawArgs,
        startedAt,
        "unbekannt",
        renderRejectedBeforeRequest({
          toolName: DISCOVER_TOOL,
          was: `Die Werkzeuggruppe "${group}" gibt es hier nicht.${bundlesHint}`,
          warum:
            ctx.activeEndpointGroups.length === 0
              ? "In dieser Installation ist keine Endpunktgruppe aktiv."
              : `Aktiv sind: ${ctx.activeEndpointGroups.join(", ")}.`,
          wie: "Eine aktive Gruppe mit group wählen oder ohne group die Übersicht holen.",
        }).text,
      ),
    };
  }
  if (!ctx.activeEndpointGroups.includes(group)) {
    return {
      refusal: gatewayRefusal(
        head,
        DISCOVER_TOOL,
        rawArgs,
        startedAt,
        "deaktiviert",
        renderRejectedBeforeRequest({
          toolName: DISCOVER_TOOL,
          was: `Die Werkzeuggruppe "${group}" ist in dieser Installation abgeschaltet.`,
          warum:
            `Sie trägt den deutschen Namen "${TOOL_GROUPS[group].label}" und ist über ` +
            `${TOOL_GROUPS_VAR} abgeschaltet.`,
          wie:
            `Die Gruppe über ${TOOL_GROUPS_VAR} zuschalten und den Server neu starten; ` +
            "bis dahin ist in dieser Installation kein Werkzeug dieser Gruppe aufrufbar.",
        }).text,
      ),
    };
  }
  return { group };
}

function runDiscover(
  ctx: DiscoveryContext,
  zodSchema: z.ZodType,
  rawArgs: ToolArguments,
  startedAt: number,
): CallToolResult {
  const head = gatewayHead(DISCOVER_TOOL, ctx.now);
  const parsed = zodSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return gatewaySchemaRefusal(head, DISCOVER_TOOL, rawArgs, startedAt, parsed.error.issues);
  }
  const { query, group, limit } = parsed.data as {
    query?: string;
    group?: string;
    limit?: number;
  };

  let onlyGroup: ToolGroup | undefined;
  if (group !== undefined) {
    const resolved = resolveDiscoverGroup(ctx, head, rawArgs, startedAt, group);
    if ("refusal" in resolved) {
      return resolved.refusal;
    }
    onlyGroup = resolved.group;
  }
  const effectiveLimit = limit ?? 10;

  // --- Die Übersicht: ohne Abfrage und ohne Gruppe ---------------------------------
  if (query === undefined && onlyGroup === undefined) {
    const groups = overviewGroups(ctx);
    const total = groups.reduce((sum, item) => sum + item.tools, 0);
    const lines =
      groups.length === 0
        ? [
            "In dieser Installation ist keine Endpunktgruppe aktiv; der Katalog ist leer.",
            `Die fünf Bündelwerkzeuge sind weiter direkt nutzbar. Gruppen schaltet ${TOOL_GROUPS_VAR} zu; das wirkt erst nach einem Neustart des Servers.`,
          ]
        : [
            `Übersicht: ${String(groups.length)} aktive Endpunktgruppen mit ${toolWord(total)}.`,
            ...groups.map(
              (item) =>
                `${item.group} (${item.label}): ${toolWord(item.tools)}. Ohne diese Gruppe unbeantwortbar: ${item.withoutIt}.`,
            ),
            "Mit group das Verzeichnis einer Gruppe holen oder mit query suchen.",
          ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { success: true, mode: "overview", groups },
    };
  }

  // --- Das Gruppenverzeichnis: alle Werkzeuge der Gruppe ---------------------------
  if (query === undefined && onlyGroup !== undefined) {
    const tools = ctx.activeEntries.filter((entry) => entry.group === onlyGroup).map(catalogEntry);
    const lines = [
      `${toolWord(tools.length)} in der Gruppe ${onlyGroup} (${TOOL_GROUPS[onlyGroup].label}); jedes mit dem zuständigen Aufrufwerkzeug:`,
      ...tools.map(
        (tool) =>
          `${tool.name} — ${tool.title} (Klasse ${tool.class}, über ${tool.invokeVia}): ${tool.summary}`,
      ),
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { success: true, mode: "group", group: onlyGroup, tools },
    };
  }

  // --- Die Suche -------------------------------------------------------------------
  // Mit group und query zusammen sucht die Suche nur in dieser Gruppe.
  const hits = searchCatalog(ctx, query ?? "", effectiveLimit, onlyGroup);
  const tools = hits.map((hit) => catalogEntry(hit.entry));
  if (tools.length === 0) {
    const groups = overviewGroups(ctx);
    const lines = [
      `Keine Treffer für "${query ?? ""}". Die Übersicht:`,
      ...groups.map((item) => `${item.group} (${item.label}): ${toolWord(item.tools)}.`),
      "Mit group das Verzeichnis einer Gruppe holen oder die Abfrage anders fassen.",
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { success: true, mode: "search", query, tools, groups },
    };
  }
  const lines = [
    `${toolWord(tools.length)} Treffer für "${query ?? ""}":`,
    ...tools.map(
      (tool) =>
        `${tool.name} — ${tool.title} (Klasse ${tool.class}, über ${tool.invokeVia}): ${tool.summary}`,
    ),
  ];
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: { success: true, mode: "search", query, tools },
  };
}

// ---------------------------------------------------------------------------------------
// `bb_tools_describe`: die vollständige Beschreibung je Name.
// ---------------------------------------------------------------------------------------

/**
 * Ein beschriebener Eintrag: alles, was ein Aufruf braucht — Name, Weg, Beschreibung
 * und beide Schemata. Das Eingabeschema ist genau das JSON Schema, das der direkte
 * Modus anmeldet: Es stammt aus derselben Laufzeit und damit aus demselben Bau.
 */
function describeEntry(
  ctx: DiscoveryContext,
  entry: ToolEntry,
  runtime: ToolRuntime,
): Record<string, unknown> {
  const invokeVia = invokeToolForClass(entry.toolClass);
  const blocked = ctx.config.readOnly && entry.toolClass !== READ_ONLY_TOOL_CLASS;
  return {
    name: entry.name,
    title: entry.title,
    group: entry.group,
    class: entry.toolClass,
    annotations: { ...TOOL_CLASSES[entry.toolClass].annotations },
    invokeVia,
    description: entry.description,
    inputSchema: toJsonSchema(runtime.fullSchema),
    outputSchema: buildOutputSchema(entry),
    // Die Sperre steht beim Eintrag, nicht erst beim Aufruf: Wer die Beschreibung liest,
    // soll den gesperrten Weg nicht erst antreten. Der Text nennt die Variable, wie die
    // Absage des direkten Modus sie nennt.
    ...(blocked
      ? {
          readOnlyNote:
            `Der Nur-Lesen-Schalter (${READ_ONLY_VAR}=true) sperrt dieses Werkzeug; ` +
            `ein Aufruf über ${invokeVia} lehnt ab, bevor ein Request abgeht.`,
        }
      : {}),
  };
}

function runDescribe(
  ctx: DiscoveryContext,
  zodSchema: z.ZodType,
  rawArgs: ToolArguments,
  startedAt: number,
): CallToolResult {
  const head = gatewayHead(DESCRIBE_TOOL, ctx.now);
  const parsed = zodSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return gatewaySchemaRefusal(head, DESCRIBE_TOOL, rawArgs, startedAt, parsed.error.issues);
  }
  const { names } = parsed.data as { names: string[] };

  const tools: Record<string, unknown>[] = [];
  const lines: string[] = [];
  for (const name of names) {
    const entry = ctx.byName.get(name);
    const runtime = ctx.runtimes.get(name);
    if (entry === undefined) {
      // Unbekannter Name: Der Eintrag trägt den Fehlertext und den ähnlichsten Namen.
      // Die Ähnlichkeit liefert dieselbe Funktion wie jede andere „gemeint war"-Stelle.
      const suggestion = closestAllowedValue(name, [...ctx.runtimes.keys()]);
      const error =
        suggestion === null
          ? `Das Werkzeug "${name}" gibt es hier nicht.`
          : `Das Werkzeug "${name}" gibt es hier nicht. Gemeint war wahrscheinlich ${suggestion}.`;
      tools.push({ name, error, ...(suggestion === null ? {} : { suggestion }) });
      lines.push(`${name}: ${error}`);
      continue;
    }
    if (runtime === undefined) {
      // Bekannt, aber in dieser Installation abgeschaltet: Der Text nennt die Gruppe
      // und die Variable, wie es die Übersicht für Gruppen tut.
      const error =
        `Das Werkzeug "${name}" ist in dieser Installation abgeschaltet: Es gehört zur ` +
        `Gruppe "${entry.group}" ("${TOOL_GROUPS[entry.group].label}"), und diese Gruppe ` +
        `ist über ${TOOL_GROUPS_VAR} abgeschaltet.`;
      tools.push({ name, group: entry.group, error });
      lines.push(`${name}: ${error}`);
      continue;
    }
    const described = describeEntry(ctx, entry, runtime);
    tools.push(described);
    lines.push(
      `${entry.name} — ${entry.title} (Gruppe ${entry.group}, Klasse ${entry.toolClass}, über ${invokeToolForClass(entry.toolClass)}):`,
      entry.description,
      ...(typeof described.readOnlyNote === "string" ? [described.readOnlyNote] : []),
      // Das Eingabeschema gehört in den Textblock und nicht nur in structuredContent: Viele
      // Clients reichen dem Modell allein den Text weiter, und die Spezifikation verlangt für
      // strukturierte Ergebnisse ohnehin eine Textfassung. Ohne diese Zeile wüsste der Agent
      // nach dem Beschreiben genau das nicht, wofür er beschrieben hat: die Parameter.
      `Eingabeschema von ${entry.name} (JSON, als arguments an ${invokeToolForClass(entry.toolClass)}): ${JSON.stringify(described.inputSchema)}`,
    );
  }

  // Ganz oder gar nicht gescheitert trägt den Fehler; Teilerfolg ist kein Fehler, sondern
  // eine Antwort mit einem Fehlereintrag darin.
  const success = tools.some((tool) => !("error" in tool));
  lines.push("Die Ausgabeschemata stehen in structuredContent.");
  return {
    content: [{ type: "text", text: lines.join("\n\n") }],
    structuredContent: { success, tools },
    isError: !success,
  };
}

// ---------------------------------------------------------------------------------------
// `bb_tools_invoke_*`: der Aufruf über den gemeinsamen Weg.
// ---------------------------------------------------------------------------------------

/**
 * Führt ein Zielwerkzeug über das genannte Gateway aus.
 *
 * Die Gateway-Prüfungen stehen vor dem gemeinsamen Weg: bekannt, aktiv, zuständig.
 * Danach läuft derselbe Code wie im direkten Modus — frühe Guards, Schema und
 * Querprüfungen, dann der Weg ab geprüften Argumenten — mit dem Gateway-Namen an der
 * Audit-Zeile. Die Antwort eines erfolgreichen Aufrufs ist genau das `CallToolResult`
 * des Zielwerkzeugs.
 */
async function runInvokeTarget(
  ctx: DiscoveryContext,
  gatewayName: string,
  rawArgs: ToolArguments,
  startedAt: number,
  signal: AbortSignal,
): Promise<CallToolResult> {
  const head = gatewayHead(gatewayName, ctx.now);
  const parsed = invokeArgumentsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return gatewaySchemaRefusal(head, gatewayName, rawArgs, startedAt, parsed.error.issues);
  }
  const { name, arguments: targetArgs } = parsed.data;

  const entry = ctx.byName.get(name);
  if (entry === undefined) {
    const suggestion = closestAllowedValue(name, [...ctx.runtimes.keys()]);
    return gatewayRefusal(
      head,
      gatewayName,
      rawArgs,
      startedAt,
      "unbekannt",
      renderRejectedBeforeRequest({
        toolName: gatewayName,
        was: `Das Werkzeug "${name}" gibt es hier nicht.`,
        warum:
          suggestion === null
            ? "Die aktiven Endpunktwerkzeuge führen diesen Namen nicht."
            : `Die aktiven Endpunktwerkzeuge führen diesen Namen nicht. Gemeint war wahrscheinlich ${suggestion}.`,
        wie: `Mit ${DISCOVER_TOOL} suchen oder den Namen aus der Übersicht wählen.`,
      }).text,
    );
  }

  const runtime = ctx.runtimes.get(name);
  if (runtime === undefined) {
    return gatewayRefusal(
      head,
      gatewayName,
      rawArgs,
      startedAt,
      "deaktiviert",
      renderRejectedBeforeRequest({
        toolName: gatewayName,
        was: `Das Werkzeug "${name}" ist in dieser Installation abgeschaltet.`,
        warum:
          `Es gehört zur Gruppe "${entry.group}" ("${TOOL_GROUPS[entry.group].label}"), ` +
          `und diese Gruppe ist über ${TOOL_GROUPS_VAR} abgeschaltet.`,
        wie:
          `Die Gruppe über ${TOOL_GROUPS_VAR} zuschalten und den Server neu starten; ` +
          "bis dahin ist dieses Werkzeug in dieser Installation nicht aufrufbar.",
      }).text,
    );
  }

  const correct = invokeToolForClass(entry.toolClass);
  if (correct !== gatewayName) {
    return gatewayRefusal(
      head,
      gatewayName,
      rawArgs,
      startedAt,
      "zuständigkeit",
      renderRejectedBeforeRequest({
        toolName: gatewayName,
        was: `Das Werkzeug "${name}" läuft nicht über ${gatewayName}.`,
        warum:
          `Es trägt die Klasse ${entry.toolClass} ("${TOOL_CLASSES[entry.toolClass].meaning}") ` +
          `und ist über ${correct} aufzurufen.`,
        wie: `${name} über ${correct} mit denselben Argumenten aufrufen.`,
      }).text,
    );
  }

  // Ab hier derselbe Weg wie im direkten Modus, mit denselben Texten: Guard 1 und
  // Guard 2 zuerst, dann Schema und Querprüfungen, dann der Aufruf. Die Audit-Zeile nennt
  // das Zielwerkzeug und zusätzlich das Gateway.
  try {
    const early = checkEarlyGuards(runtime, targetArgs, startedAt, gatewayName);
    if (early !== undefined) {
      return early;
    }

    const validated = validateToolArgs(runtime, targetArgs);
    if ("refusal" in validated) {
      // Dieselbe Darstellung wie im direkten Modus, plus das Eingabeschema des Ziels:
      // Im Discovery-Modus steht die Zielbeschreibung nicht im Kontext, also reist das
      // Schema mit der Absage — als Datum in structuredContent, als Hinweis im Text.
      const refusal = refuseCall(
        runtime,
        targetArgs,
        startedAt,
        validated.refusal.outcome,
        schemaRefusalText(entry.name, validated.refusal.issues, validated.refusal.was, targetArgs) +
          `\nDie Feldliste mit den erlaubten Werten steht zusätzlich in ` +
          `structuredContent.inputSchema dieser Antwort; vorab abrufen lässt sie sich mit ` +
          `${DESCRIBE_TOOL}.`,
        gatewayName,
      );
      return {
        ...refusal,
        structuredContent: {
          success: false,
          tool: entry.name,
          gateway: gatewayName,
          inputSchema: toJsonSchema(runtime.fullSchema),
        },
      };
    }

    return await runAfterValidation(
      runtime,
      targetArgs,
      validated.args,
      signal,
      startedAt,
      gatewayName,
    );
  } catch (error) {
    // Der äußere Fangarm wie im direkten Modus: Aus dem Handler entkommt nie eine
    // Ausnahme, und die Audit-Zeile fehlt nie.
    return unexpectedFailure(runtime, targetArgs, startedAt, error, false, gatewayName);
  }
}

// ---------------------------------------------------------------------------------------
// Die Werkzeugdefinitionen und die Registrierung.
// ---------------------------------------------------------------------------------------

/**
 * Das Eingabeschema eines Aufrufwerkzeugs: der Zielname und die Zielargumente.
 *
 * `arguments` trägt die Vorgabe `{}` und nimmt jede Objektform an — geprüft wird erst
 * mit dem Schema des Ziels, hier würde jede Schranke einen gültigen Zielaufruf
 * abweisen. Die Strenge (`strictObject`) gilt nur für die Hülle: Ein Tippfehler in
 * `name` soll als solcher gemeldet werden und nicht als unbekanntes Ziel.
 */
const invokeArgumentsSchema = strictObject({
  name: z.string().min(1, { error: "darf nicht leer sein; das Feld stattdessen weglassen" }),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Das Eingabeschema der Beschreibung: eine Liste von einem bis zehn Werkzeugnamen. */
const describeArgumentsSchema = strictObject({
  names: z
    .array(z.string().min(1, { error: "darf nicht leer sein" }))
    .min(1, { error: "mindestens ein Name" })
    .max(10, { error: "höchstens zehn Namen" }),
});

/**
 * Das Eingabeschema der Suche.
 *
 * `group` zählt nur die aktiven Endpunktgruppen auf: Nur sie kennt der Katalog, und
 * nur sie meldet das Eingabeschema dem Client. Sind gar keine aktiv, bleibt ein freier
 * Text, und der Handler meldet den leeren Katalog statt des Schemas.
 */
function discoverArgumentsSchema(activeEndpointGroups: readonly ToolGroup[]): z.ZodType {
  return strictObject({
    query: z
      .string()
      .min(1, { error: "darf nicht leer sein; das Feld stattdessen weglassen" })
      .max(200, { error: "höchstens 200 Zeichen" })
      .optional(),
    group: (activeEndpointGroups.length > 0
      ? z.enum(activeEndpointGroups as [ToolGroup, ...ToolGroup[]])
      : z.string()
    ).optional(),
    limit: z
      .number()
      .int()
      .min(1, { error: "mindestens 1" })
      .max(20, { error: "höchstens 20" })
      .optional(),
  });
}

/**
 * Die Ausgabeschemata von Suche und Beschreibung: offen mit benanntem Kern.
 *
 * Wie bei den Aufrufwerkzeugen beschreibt das Schema den Umschlag und zählt nichts
 * auf: `groups` und `tools` wechseln je Modus, und ein Pflichtfeld ließe einen
 * validierenden Client Antworten verwerfen, die er eigentlich versteht.
 */
const DISCOVER_OUTPUT_SCHEMA: Record<string, unknown> = Object.freeze({
  type: "object",
  properties: { success: { type: "boolean" }, mode: { type: "string" } },
  additionalProperties: true,
});

const DESCRIBE_OUTPUT_SCHEMA: Record<string, unknown> = Object.freeze({
  type: "object",
  properties: { success: { type: "boolean" } },
  additionalProperties: true,
});

/** Titel und Beschreibungen der fünf Gateways: deutsch, kurz, echte Umlaute. */
const GATEWAY_TEXTS: Record<string, { readonly title: string; readonly description: string }> =
  Object.freeze({
    [DISCOVER_TOOL]: {
      title: "Werkzeuge suchen",
      description:
        "Sucht im Katalog der Endpunktwerkzeuge dieser Installation. Ohne Angaben als " +
        "Übersicht je aktiver Gruppe, mit group als Verzeichnis einer Gruppe, mit query " +
        "als Stichwortsuche über Namen, Titel und Beschreibung. Jeder Treffer nennt das " +
        "zuständige Aufrufwerkzeug; das Eingabeschema dazu holt bb_tools_describe.",
    },
    [DESCRIBE_TOOL]: {
      title: "Werkzeuge beschreiben",
      description:
        "Beschreibt ein bis zehn Endpunktwerkzeuge vollständig: Titel, Gruppe, Klasse, " +
        "zuständiges Aufrufwerkzeug, Beschreibung sowie Ein- und Ausgabeschema. " +
        "Unbekannte oder abgeschaltete Namen meldet die Antwort je Eintrag.",
    },
    [INVOKE_READ_TOOL]: {
      title: "Lesend aufrufen",
      description:
        "Führt ein lesendes Endpunktwerkzeug (Klasse R) mit den gegebenen Argumenten " +
        "aus und liefert dessen Antwort unverändert. Andere Klassen lehnt das Werkzeug " +
        "ab und nennt das zuständige Aufrufwerkzeug.",
    },
    [INVOKE_WRITE_TOOL]: {
      title: "Anlegend oder buchend aufrufen",
      description:
        "Führt ein anlegendes oder buchendes Endpunktwerkzeug (Klassen A und B) mit den " +
        "gegebenen Argumenten aus und liefert dessen Antwort unverändert. Andere " +
        "Klassen lehnt das Werkzeug ab und nennt das zuständige Aufrufwerkzeug.",
    },
    [INVOKE_DESTRUCTIVE_TOOL]: {
      title: "Ändernd oder löschend aufrufen",
      description:
        "Führt ein überschreibendes, löschendes oder auswertendes Endpunktwerkzeug " +
        "(Klassen M, D und AR) mit den gegebenen Argumenten aus und liefert dessen " +
        "Antwort unverändert. Andere Klassen lehnt das Werkzeug ab und nennt das " +
        "zuständige Aufrufwerkzeug.",
    },
  });

/**
 * Was `tools/list` je Gateway ausliefert, ohne Handler.
 *
 * Eine Quelle für Anmeldung und Messung, wie `renderToolDefinition` bei den
 * Endpunktwerkzeugen: `scripts/measure-tokens.ts` und P11 messen genau das, was
 * `registerDiscoveryTools` anmeldet, und nicht eine zweite, nachgebaute Fassung.
 */
export interface GatewayDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly annotations: Record<string, boolean>;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
}

/** Alle Endpunktgruppen, also der größte Zustand des Gruppenschalters. */
const ALL_ENDPOINT_GROUPS: readonly ToolGroup[] = TOOL_GROUP_NAMES.filter(
  (group) => group !== BUNDLE_TOOL_GROUP,
);

/** Name, Eingabe- und Ausgabeschema der fünf Gateways, in Anmeldereihenfolge. */
function gatewaySchemas(discoverZod: z.ZodType): readonly {
  readonly name: string;
  readonly zodSchema: z.ZodType;
  readonly outputSchema: Record<string, unknown>;
}[] {
  return [
    { name: DISCOVER_TOOL, zodSchema: discoverZod, outputSchema: DISCOVER_OUTPUT_SCHEMA },
    {
      name: DESCRIBE_TOOL,
      zodSchema: describeArgumentsSchema,
      outputSchema: DESCRIBE_OUTPUT_SCHEMA,
    },
    { name: INVOKE_READ_TOOL, zodSchema: invokeArgumentsSchema, outputSchema: OPEN_OBJECT_SCHEMA },
    { name: INVOKE_WRITE_TOOL, zodSchema: invokeArgumentsSchema, outputSchema: OPEN_OBJECT_SCHEMA },
    {
      name: INVOKE_DESTRUCTIVE_TOOL,
      zodSchema: invokeArgumentsSchema,
      outputSchema: OPEN_OBJECT_SCHEMA,
    },
  ];
}

function gatewayDefinition(
  name: string,
  zodSchema: z.ZodType,
  outputSchema: Record<string, unknown>,
): GatewayDefinition {
  const texts = GATEWAY_TEXTS[name];
  if (texts === undefined) {
    throw new Error(`Kein Titel für das Gateway ${name} hinterlegt.`);
  }
  return {
    name,
    title: texts.title,
    description: texts.description,
    annotations: annotationsOfGateway(name),
    inputSchema: toJsonSchema(zodSchema),
    outputSchema,
  };
}

/**
 * Die fünf Gatewaydefinitionen für die übergebenen aktiven Endpunktgruppen.
 *
 * Ohne Argument im größten Zustand, also mit allen Endpunktgruppen: Nur das Eingabeschema
 * von `bb_tools_discover` hängt an den Gruppen (die Aufzählung in `group`), und mit allen
 * Gruppen ist es am längsten. Diesen Zustand misst das Budget.
 */
export function gatewayDefinitions(
  activeEndpointGroups: readonly ToolGroup[] = ALL_ENDPOINT_GROUPS,
): readonly GatewayDefinition[] {
  return gatewaySchemas(discoverArgumentsSchema(activeEndpointGroups)).map((spec) =>
    gatewayDefinition(spec.name, spec.zodSchema, spec.outputSchema),
  );
}

/** Eine Gatewaydefinition als JSON-Text. Grundlage der Zeichen- und Tokenmessung. */
export function gatewayDefinitionJson(definition: GatewayDefinition): string {
  return JSON.stringify(definition);
}

interface GatewaySpec {
  readonly name: string;
  readonly zodSchema: z.ZodType;
  readonly outputSchema: Record<string, unknown>;
  readonly run: (
    rawArgs: ToolArguments,
    startedAt: number,
    signal: AbortSignal,
  ) => CallToolResult | Promise<CallToolResult>;
}

/**
 * Registriert die fünf Gatewaywerkzeuge und hängt je einen Handler daran.
 *
 * Wie im direkten Modus bleiben gesperrte Werkzeuge angemeldet: Der Nur-Lesen-Schalter
 * und die fehlende Konfiguration sagen beim Aufruf ab und nicht durch Weglassen, und
 * eine abgeschaltete Gruppe meldet der Katalog als solche, statt zu schweigen. Die
 * Werkzeugliste bleibt über die gesamte Verbindung stabil; `listChanged` bleibt `false`.
 *
 * Das Nachschlagen für den Duplikatshinweis (Guard 6) geht über **alle** übergebenen
 * Einträge und nicht nur über die aktiven: Der Gruppenschalter spart Kontext, er
 * begrenzt keinen Zugriff — dieselbe Entscheidung wie in `register-tools.ts`.
 *
 * @returns Eine Zeile je registriertem Gateway, in Anmeldereihenfolge.
 */
export function registerDiscoveryTools(
  server: McpServer,
  options: RegisterDiscoveryOptions = {},
): readonly RegisteredGatewayInfo[] {
  const entries = options.entries ?? TOOL_ENTRIES;
  const config = options.config ?? getConfig();
  const store = options.store ?? getMasterDataStore();
  const now = options.now ?? ((): number => performance.now());

  const byName = new Map(entries.map((entry): [string, ToolEntry] => [entry.name, entry]));
  const resolveEntry = (name: string): ToolEntry | undefined => byName.get(name);
  const activeGroups = new Set<ToolGroup>(config.toolGroups.active);
  const activeEntries = entries.filter((entry) => activeGroups.has(entry.group));
  const runtimes = new Map<string, ToolRuntime>();
  for (const entry of activeEntries) {
    runtimes.set(entry.name, createToolRuntime(entry, config, store, resolveEntry, now));
  }
  const ctx: DiscoveryContext = {
    byName,
    runtimes,
    activeEntries,
    activeEndpointGroups: TOOL_GROUP_NAMES.filter(
      (group) => group !== BUNDLE_TOOL_GROUP && activeGroups.has(group),
    ),
    config,
    now,
  };

  const discoverZod = discoverArgumentsSchema(ctx.activeEndpointGroups);
  // Die Handler je Gateway. Name, Eingabe- und Ausgabeschema kommen aus `gatewaySchemas`,
  // derselben Quelle, aus der auch `gatewayDefinitions` für die Messung baut.
  const runs: Readonly<Record<string, GatewaySpec["run"]>> = {
    [DISCOVER_TOOL]: (rawArgs, startedAt) => runDiscover(ctx, discoverZod, rawArgs, startedAt),
    [DESCRIBE_TOOL]: (rawArgs, startedAt) =>
      runDescribe(ctx, describeArgumentsSchema, rawArgs, startedAt),
    [INVOKE_READ_TOOL]: (rawArgs, startedAt, signal) =>
      runInvokeTarget(ctx, INVOKE_READ_TOOL, rawArgs, startedAt, signal),
    [INVOKE_WRITE_TOOL]: (rawArgs, startedAt, signal) =>
      runInvokeTarget(ctx, INVOKE_WRITE_TOOL, rawArgs, startedAt, signal),
    [INVOKE_DESTRUCTIVE_TOOL]: (rawArgs, startedAt, signal) =>
      runInvokeTarget(ctx, INVOKE_DESTRUCTIVE_TOOL, rawArgs, startedAt, signal),
  };
  const specs: readonly GatewaySpec[] = gatewaySchemas(discoverZod).map((schema) => {
    const run = runs[schema.name];
    if (run === undefined) {
      throw new Error(`Kein Handler für das Gateway ${schema.name} hinterlegt.`);
    }
    return { ...schema, run };
  });

  const registered: RegisteredGatewayInfo[] = [];
  for (const spec of specs) {
    // Dieselbe Funktion wie in der Messung: Was hier angemeldet wird, ist genau das, was
    // P11 und `scripts/measure-tokens.ts` zählen.
    const definition = gatewayDefinition(spec.name, spec.zodSchema, spec.outputSchema);
    server.registerTool(
      spec.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: advertise(definition.inputSchema),
        outputSchema: advertise(definition.outputSchema),
        annotations: definition.annotations,
      },
      (args, mcpCtx) => spec.run(args, now(), mcpCtx.mcpReq.signal),
    );

    registered.push({
      name: spec.name,
      gateway: true,
      toolClass: gatewayToolClass(spec.name),
      blockedByReadOnly: false,
    });
  }

  return registered;
}
