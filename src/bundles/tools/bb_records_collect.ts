// Bündel 2: über alle Seiten laufen und Kennzahlen statt Zeilen liefern (Bauvorlage 4.2, N3b
// und drei Vorschläge aus N4).
//
// **Der wichtigste Tokenentscheid steht im Schema: `max_rows` hat die Vorgabe 0.** „Alle
// Zeilen" ist bei realen Beständen keine erfüllbare Zusage — eine volle Belegseite wiegt
// gemessen rund 209 KB —, „die Auswertung über alle gelesenen Zeilen" ist eine.
//
// **Verbindlich und gemessen (M2, M3): kein Zahlungsstatus aus `amount_paid`.** Das Feld ist
// in diesem Mandanten auch bei bezahlten Belegen "0.00"; die Rechnung `amount` minus
// `amount_paid` meldete jede bezahlte Rechnung als offen. Verlässlich sind allein der
// Serverfilter `payment_status` und das Feld `payment_date`.
//
// **Keine Kennzahl ohne Vollständigkeit (R1):** Summen und Gruppen erscheinen nur, wenn das
// Blättern das Ende erreicht hat. Eine Zahl mit Fußnote wird zitiert, die Fußnote nicht.
//
// **Die Richtung steht AN der Belegzeile (R8), und sie kommt von hier.** `/receipts/get`
// verlangt `list_direction` als Pflichtfilter und gibt das Feld je Zeile nicht zurück; gemessen
// sind es 16 Felder, keines davon heißt so. Die Richtung steckt in der API allein im Feld
// `type` ("invoice inbound"), und das führt die Projektion `concise` nicht. Bei `both` wird
// zweimal gelesen: Ohne Marke wäre einer zusammengeführten Zeile nicht anzusehen, aus welchem
// Durchlauf sie stammt. Deshalb stempelt {@link collectStream} je Zeile die Richtung, unter der
// sie gelesen wurde, und die Projektion DIESES Schrittes führt sie als erste Spalte. Ein
// gleichnamiges Feld der API hätte Vorrang und wird nicht überschrieben.
//
// **Die Summe je Richtung steht daneben.** `sum_of_rows_read` zählt bei `both` Eingangs- und
// Ausgangsbelege zusammen, also Verbindlichkeiten und Forderungen in einer Zahl. Das ist keine
// auswertbare Größe, deshalb trägt jede Richtung im Block `directions` ihre eigene Summe — und
// zwar nach R1 nur dann, wenn genau diese Richtung vollständig gelesen wurde.
import { z } from "zod";

import { bb_payment_accounts_list } from "../../registry/tools/bb_payment_accounts_list.js";
import { bb_postings_search } from "../../registry/tools/bb_postings_search.js";
import { bb_receipts_search } from "../../registry/tools/bb_receipts_search.js";
import { bb_transactions_search } from "../../registry/tools/bb_transactions_search.js";
import { BUNDLE_TOOL_GROUP } from "../../registry/groups.js";
import { boundedText, dateValue } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE } from "../../schema/vocab.js";
import { renderTable } from "../../response/table.js";
import { truncationNote } from "../../response/truncate.js";
import {
  contractWarnings,
  dedupeById,
  fitToBudget,
  groupRows,
  monthOf,
  responseFormatField,
  sumAmounts,
  textOf,
  type RowGroup,
} from "../common.js";
import { projectRows, rawRows } from "../mapping.js";
import { rowsSchema } from "../output-schema.js";
import { stepFromTool } from "../steps.js";
import type { BundleContext, BundleEntry, BundleOutcome, BundleStep } from "../types.js";

type Resource = "receipts" | "transactions" | "postings";
type Direction = "inbound" | "outbound";

/** Zeilen je Seite, je Ressource. Fest im Code, weil die Maxima je Endpunkt verschieden sind. */
const PAGE_SIZE: Readonly<Record<Resource, number>> = Object.freeze({
  receipts: 500,
  transactions: 500,
  postings: 1000,
});

/** Das Betragsfeld je Ressource. */
const AMOUNT_FIELD: Readonly<Record<Resource, string>> = Object.freeze({
  receipts: "amount",
  transactions: "amount",
  postings: "amount",
});

/** Das Datumsfeld je Ressource; bei Zahlungen das Buchungsdatum. */
const DATE_FIELD: Readonly<Record<Resource, string>> = Object.freeze({
  receipts: "date",
  transactions: "booking_date",
  postings: "date",
});

/** Das Feld der Gegenpartei; Buchungen führen keines (Querprüfung B4). */
const COUNTERPARTY_FIELD: Readonly<Record<Resource, string>> = Object.freeze({
  receipts: "counterparty",
  transactions: "to_from",
  postings: "",
});

/** Das Einzelwerkzeug je Ressource. Es steht in jeder Lücke und in jedem Anschlusssatz (R7). */
const TOOL_FOR: Readonly<Record<Resource, string>> = Object.freeze({
  receipts: "bb_receipts_search",
  transactions: "bb_transactions_search",
  postings: "bb_postings_search",
});

const DEFAULT_MAX_ROWS = 0;

/** Zeichen, die der übrige Textblock dieses Bündels grob belegt. */
const RESERVED_CHARS = 2_500;

const RESOURCE_DESCRIPTION =
  "Was gezählt wird. 'receipts' sind Belege, also Eingangs- und Ausgangsrechnungen; " +
  "'transactions' sind Zahlungen, also Kontoumsätze; 'postings' sind Buchungssätze. " +
  "Pflichtangabe. Bei 'postings' sind date_from und date_to ebenfalls Pflicht.";

const LIST_DIRECTION_DESCRIPTION =
  "Richtung der Belegliste, nur bei resource 'receipts'. 'inbound' sind Eingangsbelege, also " +
  "Rechnungen, die der Mandant erhalten hat; 'outbound' sind Ausgangsbelege, also Rechnungen, " +
  "die der Mandant stellt; 'both' läuft über beide Richtungen und verdoppelt dabei die Zahl " +
  "der Aufrufe. Vorgabe ist 'both'. Die API kennt nur die beiden Einzelwerte; 'both' ist eine " +
  "Zutat dieses Servers und wird in zwei getrennten Läufen abgebildet.";

const ACCOUNT_DESCRIPTION =
  "Zahlungskonto, nur bei resource 'transactions'. Kontoname ODER Kontonummer, zum Beispiel " +
  "PayPal oder 1201. Ein Name wird über die Kontenliste aufgelöst; bei mehreren oder keinem " +
  "Treffer bricht der Aufruf vor dem ersten Listenabruf ab und nennt die Kandidaten, statt zu " +
  "raten. Entspricht payment_account_number in bb_transactions_search, nimmt aber zusätzlich " +
  "einen Namen entgegen.";

const PAYMENT_STATUS_DESCRIPTION =
  "Zahlungsstand als Filter, nur bei resource 'receipts'. 'unpaid' ist die Antwort auf die " +
  "Frage nach den offenen Belegen, 'paid' auf die nach den bezahlten. Der Filter arbeitet auf " +
  "dem Server von BuchhaltungsButler. Ein offener Betrag wird daraus NICHT abgeleitet: Die " +
  "Felder amount_paid und amount_paid_fixed sind in diesem Mandanten gemessen auch bei " +
  "bezahlten Belegen 0.00, und Teilzahlungen sind in der Belegliste nicht erkennbar.";

const COUNTERPARTY_DESCRIPTION =
  "Gegenpartei als Filter, nur bei resource 'receipts'. Bei Eingangsbelegen der " +
  "Rechnungssteller, bei Ausgangsbelegen der Empfänger. Freitext des Belegs; die Schreibweise " +
  "kann von der des Kontonamens abweichen.";

const INVOICENUMBER_DESCRIPTION =
  "Rechnungsnummer als Filter, nur bei resource 'receipts'. Zusammen mit list_direction 'both' " +
  "ist das der Weg, eine Rechnung zu finden, ohne ihre Richtung zu kennen.";

const GROUP_BY_DESCRIPTION =
  "Serverseitige Gruppierung der gelesenen Zeilen. 'month' fasst nach Kalendermonat zusammen, " +
  "'counterparty' nach Gegenpartei (nicht bei 'postings'), 'none' liefert keine Gruppen. " +
  "Vorgabe ist 'month'. Gruppen und Summen erscheinen nur, wenn der Bestand vollständig " +
  "gelesen wurde.";

const MAX_ROWS_DESCRIPTION =
  "Höchstzahl der Einzelzeilen in der Antwort, 0 bis 200, VORGABE 0. Null heißt: nur " +
  "Kennzahlen, keine Einzelzeilen. Für eine Kontoauszugsansicht auf 50 setzen. Der Wert wirkt " +
  "serverseitig; gelesen und ausgewertet werden immer alle Seiten bis zur Aufrufobergrenze.";

const DATE_FROM_DESCRIPTION =
  "Frühestes Datum, eingeschlossen, als YYYY-MM-DD, zum Beispiel 2026-01-01. Bei resource " +
  `'postings' Pflicht, sonst dringend empfohlen: Ohne Zeitraum läuft das Blättern gegen die ` +
  `Aufrufobergrenze. ${EMPTY_STRING_SENTENCE}`;

const DATE_TO_DESCRIPTION =
  "Spätestes Datum, eingeschlossen, als YYYY-MM-DD, zum Beispiel 2026-01-31. Bei resource " +
  `'postings' Pflicht, sonst dringend empfohlen. ${EMPTY_STRING_SENTENCE}`;

/** Der Bestandsstand einer Teilmenge. Bei Belegen je Richtung getrennt (R8). */
interface StreamState {
  readonly key: string;
  rows_read: number;
  offset_reached: number;
  pages: number;
  complete: boolean;
  stopped_because: string | null;
  /**
   * Die Summe DIESER Teilmenge, `null` solange sie nicht vollständig gelesen ist. R1 gilt je
   * Teilmenge: Fällt die zweite Richtung aus, bleibt die Zahl der ersten trotzdem belastbar.
   */
  sum: string | null;
  sum_cents: number | null;
  /** Zeilen dieser Teilmenge ohne zerlegbaren Betrag; sie stecken NICHT in `sum`. */
  rows_without_amount: number | null;
}

interface CollectResult {
  readonly rows: Record<string, unknown>[];
  readonly states: StreamState[];
  discarded: number;
  halted: boolean;
}

function filterBody(
  resource: Resource,
  args: Record<string, unknown>,
  account: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const name of ["date_from", "date_to"] as const) {
    if (typeof args[name] === "string") {
      body[name] = args[name];
    }
  }
  if (resource === "receipts") {
    for (const name of ["payment_status", "counterparty", "invoicenumber"] as const) {
      if (typeof args[name] === "string") {
        body[name] = args[name];
      }
    }
  }
  if (resource === "transactions" && account !== null) {
    // Der Body-Parameter der API heißt `account`; in bb_transactions_search trägt das Feld
    // den sprechenderen Namen payment_account_number.
    body["account"] = account;
  }
  return body;
}

/**
 * Eine Teilmenge seitenweise lesen. Modus prefix: Beim ersten Fehler stoppt die Schleife
 * sofort, die bereits geholten Seiten bleiben gültig, und die Lücke nennt das genaue `offset`.
 * Das Ende wird ausschließlich daran erkannt, dass eine Seite weniger Zeilen liefert als
 * angefordert (R3) — nie am Feld `rows`.
 */
async function collectStream(
  ctx: BundleContext,
  resource: Resource,
  key: string,
  body: Readonly<Record<string, unknown>>,
  result: CollectResult,
): Promise<void> {
  const limit = PAGE_SIZE[resource];
  const state: StreamState = {
    key,
    rows_read: 0,
    offset_reached: 0,
    pages: 0,
    complete: false,
    stopped_because: null,
    sum: null,
    sum_cents: null,
    rows_without_amount: null,
  };
  result.states.push(state);
  const collected: Record<string, unknown>[] = [];

  for (;;) {
    const page = await ctx.call({
      step: resource,
      body: { ...body, limit, offset: state.offset_reached },
      additional: ctx.callsUsed() > 0,
    });
    if (!page.ok) {
      state.stopped_because =
        page.kind === "budget" ? "page_limit" : page.kind === "rate_limit" ? "rate_limit" : "error";
      result.halted = result.halted || page.fatal;
      ctx.gap({
        what: `${key}: ab offset ${String(state.offset_reached)} nicht gelesen.`,
        why: page.summary,
        next_step: continuationCall(resource, body, state.offset_reached, limit),
      });
      ctx.continueWith({
        tool: TOOL_FOR[resource],
        resource,
        ...body,
        limit,
        offset: state.offset_reached,
      });
      break;
    }
    state.pages += 1;
    const rows = rawRows(page.envelope);
    collected.push(...rows.map((row) => withOrigin(resource, key, row)));
    state.rows_read += rows.length;
    state.offset_reached += rows.length;
    if (rows.length < limit) {
      state.complete = true;
      break;
    }
  }

  const deduped = dedupeById(collected);
  if (deduped.discarded > 0) {
    // Eine Zahl größer null ist der Beweis, dass sich die Liste unter dem Blättern bewegt hat.
    result.discarded += deduped.discarded;
    state.complete = false;
    state.stopped_because ??= "error";
    ctx.gap({
      what: `${key}: ${String(deduped.discarded)} doppelte Zeilen beim Blättern verworfen.`,
      why:
        "Zwischen zwei Seiten hat sich der Bestand verändert; die API kennt keinen Cursor, " +
        "sondern nur offset. Eine übersprungene Zeile ist damit ebenfalls möglich.",
      next_step: `${TOOL_FOR[resource]} mit engeren Filtern erneut aufrufen`,
    });
  }
  result.rows.push(...deduped.rows);
  if (state.complete) {
    // R1 je Teilmenge: Diese Zahl steht für genau diese Richtung und nur, wenn deren Blättern
    // das Ende erreicht hat. Die Gesamtsumme hängt dagegen an der Vollständigkeit des Laufs.
    const streamSum = sumAmounts(deduped.rows, AMOUNT_FIELD[resource]);
    state.sum = streamSum.formatted;
    state.sum_cents = streamSum.cents;
    state.rows_without_amount = streamSum.unparsed;
  } else {
    ctx.stop(
      state.stopped_because === "rate_limit"
        ? "rate_limit"
        : state.stopped_because === "page_limit"
          ? "page_limit"
          : "error",
    );
  }
}

/**
 * Die Kopie einer Zeile samt ihrer Herkunft (R8).
 *
 * Bei Belegen trägt jede Zeile die `list_direction`, unter der sie gelesen wurde. Das Feld ist
 * serverseitig: `/receipts/get` nimmt `list_direction` als Pflichtfilter entgegen und gibt es
 * je Zeile nicht zurück. Ohne die Marke wäre bei `list_direction` 'both' aus einer Zeile der
 * zusammengeführten Liste nicht zu erkennen, aus welchem der beiden Durchläufe sie stammt —
 * und das ist der Unterschied zwischen Verbindlichkeit und Forderung.
 *
 * Der Wert der API hat Vorrang: Führt die Liste eines Tages ein eigenes Feld dieses Namens,
 * überschreibt der Stempel es nicht, weil die Zeile nach dem Stempel gespreizt wird.
 */
function withOrigin(
  resource: Resource,
  key: string,
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return resource === "receipts" ? { list_direction: key, ...row } : { ...row };
}

/** Der Einzelaufruf, der genau dort weitermacht, wo dieser Lauf aufgehört hat (R7). */
function continuationCall(
  resource: Resource,
  body: Readonly<Record<string, unknown>>,
  offset: number,
  limit: number,
): string {
  const parts = Object.entries(body)
    .map(([name, value]) => `${name}=${textOf(value)}`)
    .concat([`limit=${String(limit)}`, `offset=${String(offset)}`]);
  return `${TOOL_FOR[resource]} mit ${parts.join(", ")}`;
}

/** Der aufgelöste Kontobezug. `via` sagt, welcher Weg gegriffen hat. */
interface ResolvedAccount {
  readonly number: string;
  readonly name: string;
  readonly via: "number" | "name";
}

type Resolution =
  | { readonly ok: true; readonly account: ResolvedAccount }
  | { readonly ok: false; readonly outcome: BundleOutcome };

/**
 * Löst einen Kontonamen über `/accounts/get` auf. Die Auflösung rät nie.
 *
 * Mehrere Treffer beenden den Aufruf vor dem ersten Listenabruf mit der Kandidatenliste, kein
 * Treffer mit der vollständigen Kontenliste (gemessen 5 Zeilen, 343 Byte, also billig genug,
 * sie immer mitzugeben). Ein Agent, der „PayPal" hört und 1200 rät, bekommt eine plausible,
 * vollständige, falsche Liste, und in der Buchhaltung ist eine falsche Antwort teurer als eine
 * fehlende. Gemessen enthält ein Kontoname eine Kontonummer im Klartext (M4), deshalb wird ein
 * rein numerisches `account` zuerst als Kontonummer behandelt und erst danach als
 * Namensbestandteil.
 */
async function resolveAccount(ctx: BundleContext, wanted: string): Promise<Resolution> {
  const result = await ctx.call({ step: "accounts" });
  if (!result.ok) {
    return { ok: false, outcome: ctx.errorOutcome(result) };
  }
  const rows = rawRows(result.envelope);
  const table = rows.map((row) => ({
    postingaccount_number: textOf(row["postingaccount_number"]),
    name: textOf(row["name"]),
  }));

  const byNumber = table.filter((row) => row.postingaccount_number === wanted);
  const first = byNumber[0];
  if (first !== undefined) {
    return {
      ok: true,
      account: { number: first.postingaccount_number, name: first.name, via: "number" },
    };
  }

  const needle = wanted.toLowerCase();
  const byName = table.filter((row) => row.name.toLowerCase().includes(needle));
  const single = byName[0];
  if (byName.length === 1 && single !== undefined) {
    return {
      ok: true,
      account: { number: single.postingaccount_number, name: single.name, via: "name" },
    };
  }

  const candidates = byName.length === 0 ? table : byName;
  const what =
    byName.length === 0
      ? `Kein Zahlungskonto passt zu account "${wanted}".`
      : `Mehrere Zahlungskonten passen zu account "${wanted}".`;
  ctx.stop("error");
  ctx.gap({
    what,
    why:
      "Die Auflösung rät nicht: Eine Zahlungsliste zum falschen Konto wäre plausibel, " +
      "vollständig und falsch. Es ist deshalb keine Zeile geholt worden.",
    next_step:
      "bb_records_collect mit resource='transactions' und account gleich einer der " +
      "postingaccount_number aus der Liste unten erneut aufrufen",
  });
  return {
    ok: false,
    outcome: {
      kind: "ok",
      incompleteDetail: "der Kontoname ließ sich nicht eindeutig auflösen",
      data: {
        resource: "transactions",
        account: null,
        account_candidates: candidates,
        rows_read: 0,
        sum_of_rows_read: null,
        groups: null,
        rows: [],
        directions: null,
        duplicates_discarded: 0,
      },
      lines: [
        `${what} Geholt wurde nichts.`,
        renderTable(candidates),
        "Die Kontonummer aus der Spalte postingaccount_number in account einsetzen und erneut " +
          "aufrufen. Sachkonten stehen nicht in dieser Liste; ihre Nummer findet " +
          "bb_masterdata_search.",
      ],
    },
  };
}

function readDirections(args: Record<string, unknown>): readonly Direction[] {
  const value = args["list_direction"];
  if (value === "inbound" || value === "outbound") {
    return [value];
  }
  return ["inbound", "outbound"];
}

async function run(ctx: BundleContext, args: Record<string, unknown>): Promise<BundleOutcome> {
  const resource = args["resource"] as Resource;
  const maxRows = typeof args["max_rows"] === "number" ? args["max_rows"] : DEFAULT_MAX_ROWS;
  const groupBy = typeof args["group_by"] === "string" ? args["group_by"] : "month";

  let account: ResolvedAccount | null = null;
  if (resource === "transactions" && typeof args["account"] === "string") {
    const resolution = await resolveAccount(ctx, args["account"]);
    if (!resolution.ok) {
      return resolution.outcome;
    }
    account = resolution.account;
  }

  const body = filterBody(resource, args, account?.number ?? null);
  const result: CollectResult = { rows: [], states: [], discarded: 0, halted: false };

  if (resource === "receipts") {
    // Modus independent über die beiden Richtungen: Fällt eine aus, kommt die andere. Der
    // Bestandsstand bleibt je Richtung getrennt, ein gemeinsames offset wäre frei erfunden (R8).
    for (const direction of readDirections(args)) {
      if (result.halted) {
        break;
      }
      await collectStream(ctx, resource, direction, { ...body, list_direction: direction }, result);
    }
  } else {
    await collectStream(ctx, resource, resource, body, result);
  }

  const complete = ctx.isComplete();
  const sum = sumAmounts(result.rows, AMOUNT_FIELD[resource]);
  const groups = complete ? buildGroups(result.rows, resource, groupBy) : null;
  const step = stepOf(resource);
  const selected = maxRows > 0 ? result.rows.slice(0, maxRows) : [];
  const projected =
    selected.length === 0
      ? { rows: [], warnings: [] }
      : projectRows(ENTRY_NAME, step, selected, ctx.projection);
  const projectedRows = projected.rows;
  // Auch 200 projizierte Zeilen können das Antwortbudget reißen; eine Buchungszeile ist breit.
  const fit = fitToBudget(projectedRows, ctx.maxResponseTokens, RESERVED_CHARS);
  const rows = projectedRows.slice(0, fit.count);
  const violations = contractWarnings(projected.warnings, rows.length);

  const notes = notesFor(resource, account, result.states, rows.length);
  const data: Record<string, unknown> = {
    resource,
    filter: {
      ...body,
      ...(resource === "receipts" ? { list_direction: directionLabel(args) } : {}),
    },
    account:
      account === null
        ? null
        : { postingaccount_number: account.number, name: account.name, resolved_via: account.via },
    rows_read: result.rows.length,
    sum_of_rows_read: complete ? sum.formatted : null,
    sum_of_rows_read_cents: complete ? sum.cents : null,
    groups,
    rows,
    directions: resource === "receipts" ? result.states.map((state) => ({ ...state })) : null,
    duplicates_discarded: result.discarded,
    notes: [...notes],
    ...(violations === null ? {} : violations.structured),
  };

  const lines: string[] = [];
  // Die Vertragsverletzung zuerst: Sie betrifft die Zahlen, die danach kommen (Plan 7.3).
  if (violations !== null) {
    lines.push(violations.line);
  }
  if (rows.length > 0) {
    lines.push(renderTable(rows));
  }
  if (fit.truncated) {
    lines.push(
      truncationNote(rows.length, projectedRows.length, fit.budgetTokens, ctx.projection, {
        stockIncomplete: !complete,
      }),
    );
  }
  if (groups !== null && groups.length > 0) {
    lines.push(renderTable(groups.map((group) => ({ ...group }))));
  }
  lines.push(stockLine(result, complete, sum, maxRows));
  for (const note of notes) {
    lines.push(note);
  }
  lines.push(ctx.callBudgetLine());
  lines.push(nextStepLine(resource, result, complete, maxRows));

  return {
    kind: "ok",
    data,
    lines,
    ...(complete ? {} : { incompleteDetail: describeStop(result) }),
  };
}

/** Der Mittelteil der Unvollständigkeitszeile: abgebrochen bei offset N nach M Seiten. */
function describeStop(result: CollectResult): string {
  const broken = result.states.find((state) => !state.complete);
  if (broken === undefined) {
    return "der Bestand ist nicht vollständig gelesen";
  }
  return (
    `abgebrochen bei offset ${String(broken.offset_reached)} nach ${String(broken.pages)} ` +
    `Seiten (${broken.key})`
  );
}

function directionLabel(args: Record<string, unknown>): string {
  const value = args["list_direction"];
  return value === "inbound" || value === "outbound" ? value : "both";
}

function buildGroups(
  rows: readonly Record<string, unknown>[],
  resource: Resource,
  groupBy: string,
): readonly RowGroup[] | null {
  if (groupBy === "none") {
    return [];
  }
  if (groupBy === "counterparty") {
    return groupRows(rows, COUNTERPARTY_FIELD[resource], AMOUNT_FIELD[resource]);
  }
  return groupRows(rows, DATE_FIELD[resource], AMOUNT_FIELD[resource], monthOf);
}

function stockLine(
  result: CollectResult,
  complete: boolean,
  sum: { readonly formatted: string; readonly unparsed: number },
  maxRows: number,
): string {
  // Die Summe je Teilmenge steht nur dort im Text, wo es mehr als eine gibt; bei einer einzigen
  // wiederholte sie die Gesamtsumme aus demselben Satz.
  const withSums = result.states.length > 1;
  const perStream = result.states
    .map((state) => {
      const head =
        `${state.key}: ${String(state.rows_read)} Zeilen, offset ${String(state.offset_reached)}, ` +
        `${String(state.pages)} Seiten, ${state.complete ? "vollständig" : "unvollständig"}`;
      if (!withSums || state.sum === null) {
        return head;
      }
      const missing =
        state.rows_without_amount === null || state.rows_without_amount === 0
          ? ""
          : ` (${String(state.rows_without_amount)} Zeilen ohne zerlegbaren Betrag bleiben draußen)`;
      return `${head}, Summe ${state.sum}${missing}`;
    })
    .join("; ");
  const head = `${String(result.rows.length)} Zeilen gelesen (${perStream}).`;
  const rowsNote =
    maxRows === 0
      ? "Einzelzeilen sind nicht enthalten: max_rows steht auf 0. Für eine Ansicht der Zeilen " +
        "max_rows setzen."
      : `Angezeigt werden höchstens ${String(maxRows)} Zeilen.`;
  if (!complete) {
    // Der Satz sagt „über alle Zeilen", weil oben bei mehreren Teilmengen sehr wohl eine Zahl
    // stehen kann: die einer Richtung, die für sich vollständig gelesen wurde.
    const partial = withSums
      ? " Eine Summe steht oben nur bei den Teilmengen, die vollständig gelesen wurden."
      : "";
    return (
      `${head} Es gibt KEINE Summe über alle Zeilen und keine Gruppen, weil der Bestand nicht ` +
      `vollständig gelesen wurde; ausgegeben wird ausschließlich, was gelesen wurde.${partial} ` +
      rowsNote
    );
  }
  const unparsed =
    sum.unparsed === 0
      ? ""
      : ` ${String(sum.unparsed)} Zeilen tragen keinen zerlegbaren Betrag und stecken NICHT in der Summe.`;
  return (
    `${head} Summe über die gelesenen Zeilen: ${sum.formatted}. Ohne Aufteilung nach Währung: ` +
    `Die Liste führt gemessen kein Feld currency.${unparsed} ${rowsNote}`
  );
}

function notesFor(
  resource: Resource,
  account: ResolvedAccount | null,
  streams: readonly StreamState[],
  shownRows: number,
): readonly string[] {
  const notes: string[] = [];
  if (resource === "receipts") {
    notes.push(
      "Zum Zahlungsstand: Verlässlich sind allein der Filter payment_status und das Feld " +
        "payment_date. Die Felder amount_paid und amount_paid_fixed sind in diesem Mandanten " +
        "gemessen durchgehend 0.00, auch bei bezahlten Belegen; ein offener Betrag lässt sich " +
        "daraus nicht rechnen, und Teilzahlungen sind in der Belegliste nicht erkennbar.",
    );
    if (shownRows > 0) {
      // Der Satz steht nur dort, wo Zeilen ausgegeben werden: Ohne Zeilen beschriebe er eine
      // Spalte, die in dieser Antwort niemand sieht.
      notes.push(
        "Die Spalte list_direction jeder Zeile kommt nicht von der API, sondern nennt den " +
          "Durchlauf, in dem dieses Werkzeug die Zeile gelesen hat. Die Belegart samt Richtung " +
          "führt die API im Feld type ('invoice inbound'), das response_format='detailed' " +
          "ausgibt. Der Unterschied zwischen Eingangs- und Ausgangsrechnung ist fachlich der " +
          "zwischen Verbindlichkeit und Forderung.",
      );
    }
    if (streams.length > 1) {
      notes.push(
        "Gelesen wurde in zwei getrennten Durchläufen: sum_of_rows_read und die Gruppen zählen " +
          "Eingangs- und Ausgangsbelege zusammen, also Verbindlichkeiten und Forderungen in " +
          "einer Zahl. Getrennt steht die Summe je Richtung im Block directions, und zwar nur " +
          "für die Richtungen, die vollständig gelesen wurden.",
      );
    }
  }
  if (resource === "transactions") {
    notes.push(
      account === null
        ? "Die Zahlungszeilen sind keinem Konto zugeordnet: Die API liefert je Zahlung " +
            "gemessen sechs Felder und darunter kein account. Wer nach Konto auswerten will, " +
            "setzt account und bekommt die Zuordnung aus dem gesendeten Filter."
        : `Die Zuordnung zum Konto ${account.number} folgt allein aus dem gesendeten Filter: ` +
            "Die API liefert je Zahlung gemessen sechs Felder und darunter kein account. Der " +
            `Kontoname wurde ${account.via === "number" ? "als Kontonummer übernommen" : "über die Kontenliste aufgelöst"}.`,
    );
  }
  if (resource === "postings") {
    notes.push(
      "Die Felder mit dem Namensanfang receipts_assigned sind keine Listen, sondern verkettete " +
        "Zeichenketten; sie taugen zur Anzeige, nicht zur Weiterverarbeitung.",
    );
  }
  return notes;
}

function nextStepLine(
  resource: Resource,
  result: CollectResult,
  complete: boolean,
  maxRows: number,
): string {
  const tool = TOOL_FOR[resource];
  if (!complete) {
    const broken = result.states.find((state) => !state.complete);
    const offset = broken === undefined ? 0 : broken.offset_reached;
    return (
      `Weiter geht es mit ${tool} und offset=${String(offset)} bei sonst gleichen Filtern. ` +
      "Enger filtern ist in der Regel billiger als blättern."
    );
  }
  return maxRows === 0
    ? `Die Einzelzeilen liefert ${tool} mit denselben Filtern, oder dieses Werkzeug mit max_rows.`
    : `Alle Felder einer Zeile liefert ${tool} mit denselben Filtern.`;
}

const ENTRY_NAME = "bb_records_collect";

/**
 * Die Projektion der Belegzeilen: die des Einzelwerkzeugs, davor die Richtung.
 *
 * Sie steht vorn, weil sie bei `list_direction` 'both' die erste Frage jeder Zeile beantwortet.
 * Die übrigen Spalten kommen unverändert aus `bb_receipts_search` und werden nicht abgeschrieben
 * — wer zwischen Bündel und Einzelwerkzeug wechselt, sieht dieselben Felder plus dieses eine.
 */
const RECEIPTS_CONCISE: readonly string[] = Object.freeze([
  "list_direction",
  ...bb_receipts_search.concise,
]);

const STEPS: readonly BundleStep[] = Object.freeze([
  stepFromTool(bb_payment_accounts_list, "accounts", "optional"),
  stepFromTool(bb_receipts_search, "receipts", "optional", { concise: RECEIPTS_CONCISE }),
  stepFromTool(bb_transactions_search, "transactions", "optional"),
  stepFromTool(bb_postings_search, "postings", "optional"),
]);

function stepOf(resource: Resource): BundleStep {
  const step = STEPS.find((candidate) => candidate.id === resource);
  if (step === undefined) {
    throw new Error(`${ENTRY_NAME} kennt keinen Schritt ${resource}.`);
  }
  return step;
}

export const bb_records_collect: BundleEntry = {
  name: ENTRY_NAME,
  title: "Bestand zählen und summieren",
  group: BUNDLE_TOOL_GROUP,
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Läuft serverseitig über alle Seiten von Belegen, Zahlungen oder Buchungen und liefert " +
    "Anzahl und Summe statt aller Zeilen; Einzelzeilen erst ab max_rows. Beantwortet 'wie viele " +
    "offenen Eingangsrechnungen gibt es', 'was ist im März über PayPal gelaufen' und 'finde " +
    "Rechnung 4711 in beiden Richtungen'. Ersetzt für Zählen und Summieren bb_receipts_search, " +
    "bb_transactions_search und bb_postings_search; für einzelne Felder, Sortierung oder " +
    "weitere Filter bleiben diese Werkzeuge zuständig. Summen erscheinen nur, wenn der Bestand " +
    "vollständig gelesen wurde. Höchstens 10 Aufrufe an die API, list_direction 'both' " +
    "verdoppelt sie; der Token-Eimer ist prozesslokal, zwei Clients auf demselben Mandanten " +
    "teilen ihn nicht.",
  fields: [
    {
      name: "resource",
      apiNames: [],
      source: "server",
      required: true,
      description: RESOURCE_DESCRIPTION,
      schema: z.enum(["receipts", "transactions", "postings"]).describe(RESOURCE_DESCRIPTION),
    },
    {
      name: "list_direction",
      apiNames: ["list_direction"],
      source: "body",
      required: false,
      description: LIST_DIRECTION_DESCRIPTION,
      schema: z.enum(["inbound", "outbound", "both"]).describe(LIST_DIRECTION_DESCRIPTION),
    },
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: false,
      description: DATE_FROM_DESCRIPTION,
      schema: dateValue(DATE_FROM_DESCRIPTION),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: false,
      description: DATE_TO_DESCRIPTION,
      schema: dateValue(DATE_TO_DESCRIPTION),
    },
    {
      name: "account",
      apiNames: ["account"],
      source: "body",
      required: false,
      description: ACCOUNT_DESCRIPTION,
      schema: boundedText(ACCOUNT_DESCRIPTION, 100),
    },
    {
      name: "payment_status",
      apiNames: ["payment_status"],
      source: "body",
      required: false,
      description: PAYMENT_STATUS_DESCRIPTION,
      schema: z.enum(["paid", "unpaid"]).describe(PAYMENT_STATUS_DESCRIPTION),
    },
    {
      name: "counterparty",
      apiNames: ["counterparty"],
      source: "body",
      required: false,
      description: COUNTERPARTY_DESCRIPTION,
      schema: boundedText(COUNTERPARTY_DESCRIPTION, 200),
    },
    {
      name: "invoicenumber",
      apiNames: ["invoicenumber"],
      source: "body",
      required: false,
      description: INVOICENUMBER_DESCRIPTION,
      schema: boundedText(INVOICENUMBER_DESCRIPTION, 60),
    },
    {
      name: "group_by",
      apiNames: [],
      source: "server",
      required: false,
      description: GROUP_BY_DESCRIPTION,
      schema: z.enum(["none", "month", "counterparty"]).describe(GROUP_BY_DESCRIPTION),
    },
    {
      name: "max_rows",
      apiNames: [],
      source: "server",
      required: false,
      description: MAX_ROWS_DESCRIPTION,
      schema: z
        .number()
        .int({ error: "erwartet wird eine ganze Zahl ohne Anführungszeichen" })
        .min(0, { error: "muss 0 oder größer sein" })
        .max(200, { error: "höchstens 200" })
        .describe(MAX_ROWS_DESCRIPTION),
    },
    responseFormatField(),
  ],
  serverOnlyFields: ["resource", "group_by", "max_rows", "response_format"],
  steps: STEPS,
  maxCalls: 10,
  minTokens: 1,
  failureMode: "prefix",
  crossChecks: ["Q1", "Q3"],
  bundleChecks: ["B1", "B2", "B4"],
  searchHint: [
    "offene Posten",
    "unbezahlte Rechnungen",
    "Kontoauszug",
    "wie viele Belege",
    "Summe",
    "Umsatz im Monat",
    "Rechnung finden",
    "Buchungen im Zeitraum",
  ],
  outputProperties: {
    resource: { type: "string" },
    filter: { type: "object", additionalProperties: true },
    account: { type: ["object", "null"], additionalProperties: true },
    account_candidates: rowsSchema(),
    rows_read: { type: "integer" },
    sum_of_rows_read: { type: ["string", "null"] },
    sum_of_rows_read_cents: { type: ["integer", "null"] },
    groups: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          rows: { type: "integer" },
          sum: { type: "string" },
          sum_cents: { type: "integer" },
        },
        additionalProperties: true,
      },
    },
    rows: rowsSchema(),
    directions: {
      type: ["array", "null"],
      items: { type: "object", additionalProperties: true },
    },
    duplicates_discarded: { type: "integer" },
    notes: { type: "array", items: { type: "string" } },
  },
  outputRequired: ["resource", "rows_read"],
  run,
};
