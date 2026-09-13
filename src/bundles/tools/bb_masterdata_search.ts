// Bündel 1: Stammdaten über den Namen finden; ohne Suchbegriff der Arbeitskontext für den
// Sitzungsanfang.
//
// Drei Befunde tragen den Entwurf. Kein Stammdatenendpunkt kennt einen Namensfilter, und der
// Kontenrahmen dieses Mandanten wiegt gemessen 1.281 Zeilen und grob 60.000 Token — das
// Dreifache der harten Antwortgrenze; gefiltert und gezählt wird deshalb serverseitig, und die
// Einzelkonten kommen ohne Suchbegriff NIE mit. Die Personenkonten stehen mit Nummer und Name
// bereits im Kontenrahmen (M1), weshalb /settings/get/debtors und /settings/get/creditors
// entfallen und zwei Requests je Aufruf sparen.
import { z } from "zod";

import { BUNDLE_TOOL_GROUP } from "../../registry/groups.js";
import { bb_cost_locations_search } from "../../registry/tools/bb_cost_locations_search.js";
import { bb_payment_accounts_list } from "../../registry/tools/bb_payment_accounts_list.js";
import { bb_postingaccounts_search } from "../../registry/tools/bb_postingaccounts_search.js";
import { renderTable } from "../../response/table.js";
import { truncationNote } from "../../response/truncate.js";
import { enumerate, fitToBudget, matchesQuery, responseFormatField, textOf } from "../common.js";
import { projectRows, rawRows } from "../mapping.js";
import { stepFromTool } from "../steps.js";
import { areaBlockSchema } from "../output-schema.js";
import type {
  BundleContext,
  BundleEntry,
  BundleOutcome,
  BundleStep,
  StepResult,
} from "../types.js";

/** Die fünf Bereiche. Reihenfolge der Ausgabe, nicht der Aufrufe. */
const AREAS = [
  "payment_accounts",
  "posting_accounts",
  "debtors",
  "creditors",
  "cost_locations",
] as const;

type Area = (typeof AREAS)[number];

/** Zeilen je Seite des Kontenrahmens. Gemessen zulässig und beantwortet (M1). */
const CHART_PAGE_SIZE = 1000;

/** Seiten des Kontenrahmens, höchstens. Gemessen sind es bei diesem Mandanten genau 2. */
const CHART_MAX_PAGES = 3;

/** Zeilen der Kostenstellenliste je Aufruf. Die Spezifikation nennt 1000 ausdrücklich. */
const COST_LOCATION_PAGE_SIZE = 1000;

const DEFAULT_MAX_HITS = 20;

/** Zeichen, die der übrige Textblock dieses Bündels grob belegt: Abgrenzungen, Kopfzeilen. */
const RESERVED_CHARS = 3_000;

/** Die beiden Felder, gegen die in den Kontolisten gesucht wird. */
const NAME_AND_NUMBER: readonly string[] = Object.freeze(["name", "postingaccount_number"]);

const ENTRY_NAME = "bb_masterdata_search";

/** Beispielnamen je Nummernblock der Zusammenfassung. */
const EXAMPLES_PER_BLOCK = 3;

const QUERY_DESCRIPTION =
  "Suchbegriff, 2 bis 100 Zeichen. Teilzeichenkette ohne Beachtung der Groß- und " +
  "Kleinschreibung, geprüft gegen den Namen und gegen die Kontonummer beziehungsweise den " +
  "code. Beispiel: PayPal, Müller GmbH, 1200. Ohne Angabe kommt der Überblick über die " +
  "Stammdaten statt einer Trefferliste.";

const AREAS_DESCRIPTION =
  "Bereiche, in denen gesucht wird; ohne Angabe alle fünf. payment_accounts sind die " +
  "Zahlungskonten (Kassen, Bank- und Kreditkartenkonten), posting_accounts die Sachkonten des " +
  "Kontenrahmens, debtors die Kundenkonten, creditors die Lieferantenkonten, cost_locations " +
  "die Kostenstellen. posting_accounts, debtors und creditors stammen aus demselben Endpunkt " +
  "und kosten gemeinsam nicht mehr als einer davon.";

const MAX_HITS_DESCRIPTION =
  "Höchstzahl der Treffer JE BEREICH, nicht insgesamt, 1 bis 100, Vorgabe 20. Der Wert wirkt " +
  "serverseitig und geht nicht an die API; gesucht wird immer im vollständig gelesenen " +
  "Bestand, gekappt wird erst die Ausgabe.";

/** Die Abgrenzung der vier Kontoarten. Sie steht in jeder Antwort, auch bei einem Treffer. */
const NOTES: readonly string[] = Object.freeze([
  "Zahlungskonto (payment_accounts): Kasse, Bank- oder Kreditkartenkonto. Die API nennt diese " +
    "Objekte 'accounts'. Seine Nummer steht in postingaccount_number und gehört in das Feld " +
    "payment_account_number von bb_receipts_create, bb_receipts_upload und bb_transactions_create.",
  "Sachkonto (posting_accounts): Konto des Kontenrahmens, auf das gebucht wird, zum Beispiel " +
    "4980 Bürobedarf. Anlegen und ändern über bb_postingaccounts_create und " +
    "bb_postingaccounts_update, das Kontenblatt liefert bb_balances_get.",
  "Debitor (debtors): Personenkonto eines Kunden. Adresse und Bankverbindung liefert nur " +
    "bb_debtors_search, hier kommen ausschließlich Nummer und Name.",
  "Kreditor (creditors): Personenkonto eines Lieferanten. Adresse und Bankverbindung liefert " +
    "nur bb_creditors_search.",
  "Kostenstelle (cost_locations): Ihr Schlüssel ist code, eine numerische Kennung gibt es nicht.",
]);

interface AreaBlock {
  rows_read: number;
  complete: boolean;
  stopped_because: string | null;
  hits_state: "listed" | "summarized" | "error";
  hits: Record<string, unknown>[] | null;
  matched: number | null;
  summary: Record<string, unknown> | null;
}

function emptyBlock(): AreaBlock {
  return {
    rows_read: 0,
    complete: true,
    stopped_because: null,
    hits_state: "listed",
    hits: [],
    matched: null,
    summary: null,
  };
}

/**
 * Der Block eines Bereichs, der nicht ermittelt werden konnte.
 *
 * `hits` ist **null** und nicht das leere Array: null heißt nicht ermittelt, das leere Array
 * heißt nachweislich keine (R5). Ein Bündel, das die beiden verwechselt, meldet einen
 * vorhandenen Eintrag als nicht vorhanden.
 */
function failedBlock(reason: "error" | "page_limit" | "rate_limit"): AreaBlock {
  return {
    rows_read: 0,
    complete: false,
    stopped_because: reason,
    hits_state: "error",
    hits: null,
    matched: null,
    summary: null,
  };
}

/** Der Grund eines Fehlschlags in der Sprache des Blocks `bundle`. */
function reasonOf(result: StepResult & { ok: false }): "error" | "page_limit" | "rate_limit" {
  return result.kind === "budget"
    ? "page_limit"
    : result.kind === "rate_limit"
      ? "rate_limit"
      : "error";
}

/** Wohin eine Kontenrahmenzeile gehört. Gemessene Werte von `type` aus M1. */
function chartAreaOf(type: string): Area {
  const normalized = type.toLowerCase();
  if (normalized.startsWith("debtor")) {
    return "debtors";
  }
  if (normalized.startsWith("creditor")) {
    return "creditors";
  }
  return "posting_accounts";
}

/** Der Tausenderblock einer Kontonummer, zum Beispiel `4000-4999`. */
function blockOf(numberText: string): string {
  const value = Number.parseInt(numberText, 10);
  if (!Number.isFinite(value)) {
    return "(nicht numerisch)";
  }
  const start = Math.floor(value / 1000) * 1000;
  return `${String(start)}-${String(start + 999)}`;
}

function countBy(
  rows: readonly Record<string, unknown>[],
  field: string,
  fallback: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = textOf(row[field]) === "" ? fallback : textOf(row[field]);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Die Zusammenfassung statt der Liste: Aufriss nach type und subtype, dazu Nummernblöcke. */
function summarize(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  const blocks = new Map<string, { count: number; examples: string[] }>();
  for (const row of rows) {
    const key = blockOf(textOf(row["postingaccount_number"]));
    const bucket = blocks.get(key) ?? { count: 0, examples: [] };
    bucket.count += 1;
    if (bucket.examples.length < EXAMPLES_PER_BLOCK) {
      bucket.examples.push(textOf(row["name"]));
    }
    blocks.set(key, bucket);
  }
  return {
    by_type: countBy(rows, "type", "(ohne type)"),
    by_subtype: countBy(rows, "subtype", "(ohne subtype)"),
    blocks: [...blocks.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([range, bucket]) => ({ range, count: bucket.count, examples: bucket.examples })),
  };
}

/** Die Zeilen eines Bereichs auf die Projektion des Endpunktwerkzeugs bringen. */
type Project = (rows: readonly Record<string, unknown>[]) => readonly Record<string, unknown>[];

/** Trefferliste oder Zusammenfassung, je nachdem, ob gesucht wurde. */
function fill(
  block: AreaBlock,
  rows: readonly Record<string, unknown>[],
  query: string | null,
  maxHits: number,
  fields: readonly string[],
  summarizeWithoutQuery: boolean,
  project: Project,
): void {
  block.rows_read = rows.length;
  if (query === null && summarizeWithoutQuery) {
    block.hits_state = "summarized";
    block.hits = null;
    block.summary = summarize(rows);
    return;
  }
  const matched =
    query === null
      ? [...rows]
      : rows.filter((row) =>
          matchesQuery(
            query,
            fields.map((field) => row[field]),
          ),
        );
  block.matched = matched.length;
  block.hits_state = "listed";
  // Gefiltert wird auf den Rohzeilen, ausgegeben wird die Projektion des Endpunktwerkzeugs:
  // Ein Agent, der zwischen Bündel und Einzelwerkzeug wechselt, sieht dieselben Spalten.
  block.hits = project(matched.slice(0, maxHits)).map((row) => ({ ...row }));
  if (matched.length > maxHits) {
    block.complete = false;
    block.stopped_because = "row_limit";
  }
}

function readAreas(value: unknown): readonly Area[] {
  if (!Array.isArray(value) || value.length === 0) {
    return AREAS;
  }
  return AREAS.filter((area) => value.includes(area));
}

/** Die Bereiche, die aus dem Kontenrahmen kommen. */
const CHART_AREAS: readonly Area[] = Object.freeze(["posting_accounts", "debtors", "creditors"]);

async function run(ctx: BundleContext, args: Record<string, unknown>): Promise<BundleOutcome> {
  const rawQuery = typeof args["query"] === "string" ? args["query"] : null;
  const query = rawQuery === null || rawQuery.trim() === "" ? null : rawQuery;
  const areas = readAreas(args["areas"]);
  const maxHits = typeof args["max_hits"] === "number" ? args["max_hits"] : DEFAULT_MAX_HITS;
  const blocks: Partial<Record<Area, AreaBlock>> = {};
  const lines: string[] = [];
  const additional = (): boolean => ctx.callsUsed() > 0;
  // Drei Lagen beenden den Lauf sofort, in jedem Modus: error_code 3 und 4 (Zugangsdaten,
  // Mandant), error_code 11 (Mandant inaktiv) sowie zwei aufeinanderfolgende 5xx desselben
  // Endpunkts. Die werden innerhalb desselben Aufrufs nicht besser, und weitere Aufrufe gegen
  // dieselbe abgelehnte Anmeldung verbrennen nur Minutenkontingent (`FATAL_ERROR_CODES` und
  // `CONSECUTIVE_SERVER_ERRORS_UNTIL_STOP` in src/bundles/runtime.ts).
  let halted = false;

  // --- Zahlungskonten: ein Aufruf, keine Paginierung, konstruktiv vollständig -----------
  if (areas.includes("payment_accounts")) {
    const result = await ctx.call({ step: "accounts", additional: additional() });
    const block = result.ok ? emptyBlock() : failedBlock(reasonOf(result));
    if (result.ok) {
      fill(block, rawRows(result.envelope), query, maxHits, NAME_AND_NUMBER, false, (rows) =>
        projectRows(ENTRY_NAME, stepOf("accounts"), rows, ctx.projection).rows.map((row) => ({
          ...row,
        })),
      );
    } else {
      halted = halted || result.fatal;
      noteGap(ctx, result, "die Zahlungskonten", "bb_payment_accounts_list");
    }
    blocks.payment_accounts = block;
  }

  // --- Kostenstellen: ein Aufruf mit limit 1000 ---------------------------------------
  if (!halted && areas.includes("cost_locations")) {
    const result = await ctx.call({
      step: "cost_locations",
      body: { limit: COST_LOCATION_PAGE_SIZE },
      additional: additional(),
    });
    const block = result.ok ? emptyBlock() : failedBlock(reasonOf(result));
    if (result.ok) {
      const rows = rawRows(result.envelope);
      fill(
        block,
        rows,
        query,
        maxHits,
        ["name", "code"],
        false,
        (page) => projectRows(ENTRY_NAME, stepOf("cost_locations"), page, ctx.projection).rows,
      );
      if (rows.length >= COST_LOCATION_PAGE_SIZE) {
        // Eine volle Seite heißt: wahrscheinlich mehr. Das Ende wird ausschließlich daran
        // erkannt, dass eine Seite weniger Zeilen liefert als angefordert (R3).
        block.complete = false;
        block.stopped_because = "page_limit";
        ctx.gap({
          what: "Die Kostenstellenliste ist möglicherweise unvollständig.",
          why: `Die erste Seite war mit ${String(rows.length)} Zeilen voll; dieses Bündel holt von den Kostenstellen nur eine Seite.`,
          next_step: `bb_cost_locations_search mit limit=1000 und offset=${String(rows.length)}`,
        });
      }
    } else {
      halted = halted || result.fatal;
      noteGap(ctx, result, "die Kostenstellen", "bb_cost_locations_search");
    }
    blocks.cost_locations = block;
  }

  // --- Kontenrahmen: seitenweise, höchstens drei Seiten, Modus prefix ------------------
  const wantsChart = CHART_AREAS.some((area) => areas.includes(area));
  if (!halted && wantsChart) {
    const chart = await readChart(ctx);
    for (const area of CHART_AREAS) {
      if (!areas.includes(area)) {
        continue;
      }
      const block =
        chart.failed && chart.rows.length === 0
          ? failedBlock(chart.stopped ?? "error")
          : emptyBlock();
      if (!(chart.failed && chart.rows.length === 0)) {
        const rows = chart.rows.filter((row) => chartAreaOf(textOf(row["type"])) === area);
        fill(
          block,
          rows,
          query,
          maxHits,
          NAME_AND_NUMBER,
          true,
          (page) => projectRows(ENTRY_NAME, stepOf("chart"), page, ctx.projection).rows,
        );
        if (!chart.complete) {
          block.complete = false;
          block.stopped_because ??= chart.stopped;
        }
      }
      blocks[area] = block;
    }
  }

  // Ein Bereich, der nach einem Abbruch gar nicht mehr abgerufen wurde, fehlt nicht still:
  // Er bekommt seinen Block mit `hits` = null und eine Lücke.
  if (halted) {
    for (const area of areas) {
      if (blocks[area] !== undefined) {
        continue;
      }
      blocks[area] = failedBlock("error");
      ctx.gap({
        what: `${AREA_LABELS[area]}: nicht abgerufen.`,
        why: "Der Lauf ist vorher beendet worden; weitere Aufrufe wären in dieser Lage aussichtslos.",
        next_step: `${AREA_TOOLS[area]} einzeln aufrufen, sobald die Ursache behoben ist`,
      });
    }
  }

  // --- Antwortbudget über alle Bereiche zusammen ---------------------------------------
  const truncation = fitBlocksToBudget(ctx, blocks, query);

  // --- Textblock ----------------------------------------------------------------------
  for (const area of AREAS) {
    const block = blocks[area];
    if (block === undefined) {
      continue;
    }
    lines.push(sectionFor(area, block, query));
  }
  if (truncation !== null) {
    lines.push(truncation);
  }
  lines.push(NOTES.join("\n"));
  lines.push(closingLine(blocks, query, areas));

  const data: Record<string, unknown> = {
    query,
    areas: [...areas],
    notes: [...NOTES],
  };
  for (const area of AREAS) {
    data[area] = blocks[area] ?? null;
  }

  return { kind: "ok", data, lines };
}

/** Eine kürzbare Zeilenliste eines Bereichs: seine Treffer oder die Blöcke seiner Zusammenfassung. */
interface CuttableList {
  readonly area: Area;
  readonly kind: "hits" | "blocks";
  readonly rows: readonly Record<string, unknown>[];
}

/** Die Nummernblöcke einer Zusammenfassung, falls sie welche trägt. */
function summaryBlocksOf(summary: Record<string, unknown> | null): Record<string, unknown>[] {
  const raw = summary === null ? null : summary["blocks"];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

/**
 * Kürzt ALLES, was dieses Bündel an Zeilen ausgibt, zusammen auf BB_MCP_MAX_RESPONSE_TOKENS.
 *
 * `max_hits` begrenzt je Bereich und lässt fünf Bereiche zu je 100 Treffern zu; gemessen sind
 * das rund 10.400 Token und damit das Doppelte der Vorgabe. Die Grenze gilt aber je ANTWORT,
 * also muss sie über die Bereiche hinweg gezogen werden. Mitgekürzt werden die Nummernblöcke
 * der Zusammenfassung: Ohne Suchbegriff sind sie der größte Posten der Antwort — gemessen
 * rund 10.700 Token bei einem Kontenrahmen über viele Tausenderblöcke — und eine Grenze, die
 * gerade den größten Posten auslässt, ist keine.
 *
 * **Gekürzt wird reihum und nicht von hinten.** Die Listen werden abwechselnd eingereiht, und
 * das Budget wird auf diese Reihung angewandt; jede behält damit ihren Anteil. Der
 * naheliegende Weg — die Listen der Reihe nach füllen — verbrauchte an der ersten das ganze
 * Budget, und die übrigen meldeten null Zeilen, obwohl sie welche haben. Innerhalb einer Liste
 * bleibt die Reihenfolge erhalten.
 *
 * Jeder betroffene Bereich bekommt seine eigene Lücke mit dem Einzelwerkzeug, das ihn
 * vollständig liefert (R7).
 *
 * @returns Die Kürzungsmeldung für den Textblock, oder `null`, wenn nichts gekürzt wurde.
 */
function fitBlocksToBudget(
  ctx: BundleContext,
  blocks: Partial<Record<Area, AreaBlock>>,
  query: string | null,
): string | null {
  let reservedChars = RESERVED_CHARS;
  const lists: CuttableList[] = [];
  for (const area of AREAS) {
    const block = blocks[area];
    if (block === undefined) {
      continue;
    }
    if (block.summary !== null) {
      // Aufriss nach type und subtype: klein, fest und nicht kürzbar, deshalb reserviert.
      const fixed = Object.fromEntries(
        Object.entries(block.summary).filter(([key]) => key !== "blocks"),
      );
      reservedChars += (JSON.stringify(fixed) ?? "").length * 2;
      const summaryBlocks = summaryBlocksOf(block.summary);
      if (summaryBlocks.length > 0) {
        lists.push({ area, kind: "blocks", rows: summaryBlocks });
      }
    }
    if (block.hits !== null && block.hits.length > 0) {
      lists.push({ area, kind: "hits", rows: block.hits });
    }
  }

  const interleaved: { readonly list: CuttableList; readonly row: Record<string, unknown> }[] = [];
  const longest = lists.reduce((max, entry) => Math.max(max, entry.rows.length), 0);
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const row = list.rows[index];
      if (row !== undefined) {
        interleaved.push({ list, row });
      }
    }
  }

  const fit = fitToBudget(
    interleaved.map((entry) => entry.row),
    ctx.maxResponseTokens,
    reservedChars,
  );
  if (!fit.truncated) {
    return null;
  }

  // VOR den Lücken dieser Kürzung gelesen: Sonst nennte die Meldung den Bestand unvollständig,
  // obwohl allein die Anzeige gekürzt wurde.
  const stockIncomplete = !ctx.isComplete();
  ctx.stop("response_size");

  const keep = new Map<CuttableList, number>();
  for (const entry of interleaved.slice(0, fit.count)) {
    keep.set(entry.list, (keep.get(entry.list) ?? 0) + 1);
  }
  for (const list of lists) {
    const kept = keep.get(list) ?? 0;
    if (kept === list.rows.length) {
      continue;
    }
    const block = blocks[list.area];
    if (block === undefined) {
      continue;
    }
    const dropped = list.rows.length - kept;
    if (list.kind === "hits") {
      block.hits = list.rows.slice(0, kept).map((row) => ({ ...row }));
    } else if (block.summary !== null) {
      block.summary = {
        ...block.summary,
        blocks: list.rows.slice(0, kept).map((row) => ({ ...row })),
        blocks_omitted: dropped,
      };
    }
    block.complete = false;
    block.stopped_because = "response_size";
    ctx.gap({
      what:
        list.kind === "hits"
          ? `${AREA_LABELS[list.area]}: ${String(dropped)} bereits gefundene Treffer stehen nicht in dieser Antwort.`
          : `${AREA_LABELS[list.area]}: ${String(dropped)} Nummernblöcke der Zusammenfassung stehen nicht in dieser Antwort.`,
      why: "Die Antwort hätte sonst das Antwortbudget dieses Servers überschritten (BB_MCP_MAX_RESPONSE_TOKENS).",
      // Ohne Suchbegriff wäre der Rat, ihn zu verengen, ins Leere gesprochen.
      next_step:
        query === null
          ? `${AREA_TOOLS[list.area]} einzeln aufrufen oder areas auf diesen Bereich setzen`
          : `${AREA_TOOLS[list.area]} einzeln aufrufen oder den Suchbegriff verengen`,
    });
  }

  return truncationNote(fit.count, interleaved.length, fit.budgetTokens, ctx.projection, {
    stockIncomplete,
  });
}

/** Eine Lücke zu einem ausgefallenen Bereich. Der Ausfall reißt die übrigen nicht mit. */
function noteGap(
  ctx: BundleContext,
  result: StepResult & { ok: false },
  what: string,
  tool: string,
): void {
  ctx.gap({
    what: `${what} konnten nicht gelesen werden; die Trefferliste dieses Bereichs ist null und nicht leer.`,
    why: result.summary,
    next_step: `${tool} einzeln aufrufen`,
  });
}

interface ChartResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly complete: boolean;
  readonly failed: boolean;
  readonly stopped: "error" | "page_limit" | "rate_limit" | null;
}

/**
 * Der Kontenrahmen, seitenweise. Modus prefix: Beim ersten Fehler stoppt die Schleife sofort,
 * die bereits geholten Seiten sind gültig, und die Lücke nennt das genaue `offset`. Eine kaputte
 * Seite wird NIE übersprungen; sonst wäre der Bestand löchrig, ohne dass es jemand merkt.
 */
async function readChart(ctx: BundleContext): Promise<ChartResult> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  let pages = 0;
  let failed = false;
  let stopped: "error" | "page_limit" | "rate_limit" | null = null;

  while (pages < CHART_MAX_PAGES) {
    const result = await ctx.call({
      step: "chart",
      body: { limit: CHART_PAGE_SIZE, offset },
      additional: ctx.callsUsed() > 0,
    });
    if (!result.ok) {
      failed = true;
      stopped = reasonOf(result);
      ctx.gap({
        what: `Der Kontenrahmen ist ab offset ${String(offset)} nicht gelesen worden.`,
        why: result.summary,
        next_step: `bb_postingaccounts_search mit limit=1000 und offset=${String(offset)}`,
      });
      return { rows, complete: false, failed, stopped };
    }
    pages += 1;
    const page = rawRows(result.envelope);
    rows.push(...page.map((row) => ({ ...row })));
    if (page.length < CHART_PAGE_SIZE) {
      return { rows, complete: true, failed: false, stopped: null };
    }
    offset += page.length;
  }

  ctx.stop("page_limit");
  ctx.continueWith({ tool: "bb_postingaccounts_search", limit: CHART_PAGE_SIZE, offset });
  ctx.gap({
    what: `Der Kontenrahmen ist nach ${String(CHART_MAX_PAGES)} Seiten abgebrochen worden.`,
    why:
      `Die Seitenobergrenze dieses Bündels ist ${String(CHART_MAX_PAGES)}; die dritte Seite war ` +
      "noch voll, es gibt also wahrscheinlich weitere Konten.",
    next_step: `bb_postingaccounts_search mit limit=1000 und offset=${String(offset)}`,
  });
  return { rows, complete: false, failed: false, stopped: "page_limit" };
}

/** Das Einzelwerkzeug je Bereich. Es steht in jeder Lücke dieses Bündels (R7). */
const AREA_TOOLS: Readonly<Record<Area, string>> = Object.freeze({
  payment_accounts: "bb_payment_accounts_list",
  posting_accounts: "bb_postingaccounts_search",
  debtors: "bb_debtors_search",
  creditors: "bb_creditors_search",
  cost_locations: "bb_cost_locations_search",
});

/** Die deutsche Benennung eines Bereichs. */
const AREA_LABELS: Readonly<Record<Area, string>> = Object.freeze({
  payment_accounts: "Zahlungskonten",
  posting_accounts: "Sachkonten",
  debtors: "Debitoren",
  creditors: "Kreditoren",
  cost_locations: "Kostenstellen",
});

function sectionFor(area: Area, block: AreaBlock, query: string | null): string {
  const label = AREA_LABELS[area];
  if (block.hits_state === "error") {
    const cause =
      block.stopped_because === "page_limit"
        ? "Die Aufrufobergrenze dieses Bündels war erreicht."
        : block.stopped_because === "rate_limit"
          ? "Der Aufruf hätte zu lange auf das Minutenkontingent gewartet."
          : "Der Abruf ist gescheitert.";
    return (
      `${label}: nicht ermittelt. ${cause} Die Trefferliste dieses Bereichs ist null und nicht ` +
      "leer: 'kein Treffer' wäre hier eine Behauptung ohne Grundlage."
    );
  }
  if (block.hits_state === "summarized") {
    const summary = block.summary ?? {};
    const blocksList = Array.isArray(summary["blocks"]) ? summary["blocks"] : [];
    const table = renderTable(blocksList as Record<string, unknown>[]);
    const omittedBlocks = summary["blocks_omitted"];
    // Auch die Zusammenfassung kann das Antwortbudget reißen. Dann fehlen Nummernblöcke, und
    // das steht hier: Eine unvollständige Übersicht, die sich vollständig gibt, ist schlimmer
    // als eine kurze.
    const cut =
      typeof omittedBlocks === "number" && omittedBlocks > 0
        ? ` ${String(omittedBlocks)} weitere Nummernblöcke passten nicht in das Antwortbudget ` +
          "und fehlen in dieser Übersicht."
        : "";
    return (
      `${label}: ${String(block.rows_read)} Einträge gelesen. Ohne Suchbegriff kommt hier eine ` +
      "Zusammenfassung; die Einzelkonten sind NICHT enthalten, weil der vollständige " +
      "Kontenrahmen dieses Mandanten grob 60.000 Token wiegt und damit das Dreifache der harten " +
      "Antwortgrenze. Mit query kommen die Treffer, den ganzen Kontenrahmen blättert " +
      `bb_postingaccounts_search.${cut}\n${table}`
    );
  }
  const hits = block.hits ?? [];
  if (hits.length === 0 && block.matched !== null && block.matched > 0) {
    // Vorhanden und trotzdem nichts gezeigt. „Kein Treffer" wäre hier eine Unwahrheit.
    return (
      `${label}: ${String(block.matched)} ${query === null ? "Einträge" : "Treffer"} gefunden, ` +
      "aber keine Zeile steht in dieser Antwort — das Antwortbudget dieses Servers war vorher " +
      `erschöpft. ${query === null ? "Mit areas einen Bereich allein abfragen" : "Den Suchbegriff verengen"} ` +
      `oder ${AREA_TOOLS[area]} einzeln aufrufen.`
    );
  }
  if (hits.length === 0) {
    const scope = `in den ${String(block.rows_read)} durchsuchten Einträgen`;
    return block.complete
      ? `${label}: ${scope} kein Treffer.`
      : `${label}: ${scope} kein Treffer; ein Treffer außerhalb ist nicht ausgeschlossen, weil ` +
          "dieser Bereich nicht vollständig gelesen werden konnte.";
  }
  // Die Zeile über die Kürzung hängt an BEIDEN Zweigen, auch an dem ohne Suchbegriff: Eine
  // Tabelle mit 11 Zeilen unter der Überschrift „30 Einträge" ist eine stille Lücke.
  const capped =
    block.matched !== null && block.matched > hits.length
      ? ` Angezeigt werden ${String(hits.length)} von ${String(block.matched)} ` +
        `${query === null ? "Zeilen" : "passenden Zeilen"}; ` +
        (block.stopped_because === "response_size"
          ? // Hier hilft ein höheres max_hits gerade nicht: Es war das Antwortbudget. Und ohne
            // Suchbegriff hilft auch der Rat, ihn zu verengen, nicht.
            "gekürzt hat das Antwortbudget dieses Servers, nicht max_hits. " +
            (query === null
              ? `Mit areas einen Bereich allein abfragen oder ${AREA_TOOLS[area]} nehmen.`
              : "Den Suchbegriff verengen oder mit areas einen Bereich allein durchsuchen.")
          : query === null
            ? "max_hits erhöhen."
            : "max_hits erhöhen oder den Suchbegriff verengen.")
      : "";
  const head =
    query === null
      ? `${label}: ${String(block.rows_read)} Einträge.${capped}`
      : // Gezählt wird, was gefunden wurde, und nicht, was angezeigt wird: Sonst nennte die
        // Kopfzeile bei einer Kürzung eine kleinere Trefferzahl, als es Treffer gibt.
        `${label}: ${String(block.matched ?? hits.length)} Treffer unter ${String(block.rows_read)} gelesenen Einträgen.${capped}`;
  return `${head}\n${renderTable(hits)}`;
}

/** Der Anschlusssatz: bei null Treffern der andere Weg über die Gegenpartei des Belegs. */
function closingLine(
  blocks: Partial<Record<Area, AreaBlock>>,
  query: string | null,
  areas: readonly Area[],
): string {
  if (query === null) {
    return (
      "Das ist der Arbeitskontext für den Sitzungsanfang. Für eine einzelne Nummer dasselbe " +
      "Werkzeug mit query aufrufen."
    );
  }
  const listed = AREAS.filter((area) => blocks[area]?.hits_state === "listed");
  // Gezählt wird, was GEFUNDEN wurde, und nicht, was in die Antwort passte: Ein Bereich, dessen
  // Treffer das Antwortbudget gekostet hat, ist kein „kein Treffer".
  const anyHit = listed.some((area) => (blocks[area]?.matched ?? 0) > 0);
  if (anyHit) {
    return `Durchsucht wurden: ${enumerate(areas.map((area) => AREA_LABELS[area]))}.`;
  }
  return (
    `Kein Treffer für "${query}". Die Suche findet nur, was im Namen des Kontos steht. Der Beleg ` +
    "führt seine Gegenpartei als Freitext im Feld counterparty, und die Schreibweise kann " +
    "abweichen: bb_records_collect mit resource='receipts' und counterparty ist der andere Weg. " +
    "Ohne Suchbegriff liefert dieses Werkzeug den Überblick über alle Stammdaten."
  );
}

const STEPS: readonly BundleStep[] = Object.freeze([
  stepFromTool(bb_payment_accounts_list, "accounts", "optional"),
  stepFromTool(bb_cost_locations_search, "cost_locations", "optional"),
  stepFromTool(bb_postingaccounts_search, "chart", "optional"),
]);

function stepOf(id: string): BundleStep {
  const step = STEPS.find((candidate) => candidate.id === id);
  if (step === undefined) {
    throw new Error(`${ENTRY_NAME} kennt keinen Schritt ${id}.`);
  }
  return step;
}

export const bb_masterdata_search: BundleEntry = {
  name: ENTRY_NAME,
  title: "Stammdaten durchsuchen",
  group: BUNDLE_TOOL_GROUP,
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Findet ein Zahlungskonto, ein Sachkonto, einen Debitor, einen Kreditor oder eine " +
    "Kostenstelle über den Namen oder die Nummer, ohne dass man vorher wissen muss, in welcher " +
    "Liste der Eintrag geführt wird. Ohne query kommt stattdessen der Arbeitskontext für den " +
    "Sitzungsanfang: Zahlungskonten und Kostenstellen als Liste, der Kontenrahmen als " +
    "Zusammenfassung. Ersetzt für die Frage nach einer Nummer bb_payment_accounts_list, " +
    "bb_cost_locations_search, bb_postingaccounts_search, bb_debtors_search und " +
    "bb_creditors_search; Adresse und Bankverbindung liefern weiterhin nur diese " +
    "Einzelwerkzeuge. Die Einzelkonten des Kontenrahmens kommen nie vollständig mit, er wiegt " +
    "grob 60.000 Token. Höchstens 5 Aufrufe an die API; die Antwort sagt in bundle.complete, " +
    "wenn dabei etwas offen geblieben ist.",
  fields: [
    {
      name: "query",
      apiNames: [],
      source: "server",
      required: false,
      description: QUERY_DESCRIPTION,
      schema: z
        .string()
        .min(2, { error: "mindestens 2 Zeichen; kürzere Begriffe treffen fast jede Zeile" })
        .max(100, { error: "höchstens 100 Zeichen" })
        .describe(QUERY_DESCRIPTION),
    },
    {
      name: "areas",
      apiNames: [],
      source: "server",
      required: false,
      description: AREAS_DESCRIPTION,
      schema: z
        .array(z.enum(AREAS))
        .min(1, { error: "mindestens ein Bereich; das Feld sonst weglassen" })
        .max(AREAS.length, { error: `höchstens ${String(AREAS.length)} Bereiche` })
        .describe(AREAS_DESCRIPTION),
    },
    {
      name: "max_hits",
      apiNames: [],
      source: "server",
      required: false,
      description: MAX_HITS_DESCRIPTION,
      schema: z
        .number()
        .int({ error: "erwartet wird eine ganze Zahl ohne Anführungszeichen" })
        .min(1, { error: "muss mindestens 1 sein" })
        .max(100, { error: "höchstens 100" })
        .describe(MAX_HITS_DESCRIPTION),
    },
    responseFormatField(),
  ],
  serverOnlyFields: ["query", "areas", "max_hits", "response_format"],
  steps: STEPS,
  maxCalls: 5,
  minTokens: 1,
  failureMode: "independent",
  crossChecks: ["Q3"],
  bundleChecks: [],
  searchHint: [
    "Kontonummer",
    "Sachkonto",
    "Kontenrahmen",
    "Kunde",
    "Lieferant",
    "Debitor",
    "Kreditor",
    "Kostenstelle",
    "Konto suchen",
    "welches Konto",
  ],
  outputProperties: {
    query: { type: ["string", "null"] },
    areas: { type: "array", items: { type: "string" } },
    payment_accounts: areaBlockSchema(),
    posting_accounts: areaBlockSchema(),
    debtors: areaBlockSchema(),
    creditors: areaBlockSchema(),
    cost_locations: areaBlockSchema(),
    notes: { type: "array", items: { type: "string" } },
  },
  outputRequired: [],
  run,
};
