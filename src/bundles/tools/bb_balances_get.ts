// Bündel 4: das Kontenblatt eines Kontos mit fortgeschriebenem Saldo (Bauvorlage 4.5).
//
// **Der einzige Weg zum Kontostand, bei dem die Kürzung nicht genau die Zeile wegwirft, in der
// er steht.** Gemessen (M5) wiegt ein Kontenblatt über sieben Jahre 828 Zeilen zu je 723 Byte,
// also rund 146.000 Token; `bb_reports_get_ledger` trägt `concise: []` und wird generisch am
// ENDE abgeschnitten. Hier wird in der Mitte gekürzt, die letzten fünf Zeilen bleiben stehen.
//
// **Vertretbar erst durch M6:** Dieselbe Buchung trägt ab 2020-01-01 und ab 2025-01-01
// denselben fortgeschriebenen Saldo. Der Eröffnungssaldo vor `date_from` ist also enthalten,
// und die letzte Zeile ist ein echter Kontostand. Die Namensauflösung geht ausschließlich über
// /accounts/get: drei Kontenrahmenseiten zu je 196 KB für ein Wort wären der teuerste Weg zu
// einer Kontonummer, den dieser Server hat.
import { z } from "zod";

import { bb_payment_accounts_list } from "../../registry/tools/bb_payment_accounts_list.js";
import { bb_reports_get_ledger } from "../../registry/tools/bb_reports_get_ledger.js";
import { BUNDLE_TOOL_GROUP } from "../../registry/groups.js";
import { boundedText, dateValue } from "../../schema/primitives.js";
import { renderTable } from "../../response/table.js";
import { truncationNote } from "../../response/truncate.js";
import { fitToBudget, responseFormatField, textOf } from "../common.js";
import { rawRows } from "../mapping.js";
import { rowsSchema } from "../output-schema.js";
import { stepFromTool } from "../steps.js";
import type { BundleContext, BundleEntry, BundleOutcome, BundleStep } from "../types.js";

const ENTRY_NAME = "bb_balances_get";

/** Zeilen, die am Ende IMMER stehen bleiben. In der letzten steht der Saldo. */
const KEEP_LAST_ROWS = 5;

const DEFAULT_MAX_ROWS = 50;

/** Zeichen, die der übrige Textblock dieses Bündels grob belegt. */
const RESERVED_CHARS = 2_000;

/** Die Felder einer Kontenblattzeile, die dieses Werkzeug ausgibt (gemessen, M5). */
const LEDGER_FIELDS: readonly string[] = Object.freeze([
  "date",
  "postingTextFull",
  "counterRecordPostingaccountNumber",
  "record_side",
  "record_amount",
  "balanceAfterAbsolute",
  "balanceAfterSide",
  "cost_location",
  "receipts_id_by_customer",
  "transactions_id_by_customer",
]);

const ACCOUNT_DESCRIPTION =
  "Das Konto. Kontonummer ODER Name eines Zahlungskontos, zum Beispiel 1200 oder PayPal. Eine " +
  "rein numerische Angabe wird unverändert als Kontonummer gesendet; ein Name wird über die " +
  "Liste der Zahlungskonten aufgelöst und bei mehreren oder keinem Treffer abgelehnt, statt " +
  "geraten. Sachkonten stehen nicht in dieser Liste: Ihre Nummer zuerst mit " +
  "bb_masterdata_search nachschlagen und hier als Zahl eintragen. Entspricht " +
  "postingaccount_number in bb_reports_get_ledger.";

const DATE_FROM_DESCRIPTION =
  "Erster Tag des Zeitraums, eingeschlossen, als YYYY-MM-DD. Der Zeitraum darf eng sein: Der " +
  "Saldo der letzten Zeile enthält gemessen auch den Bestand vor date_from.";

const DATE_TO_DESCRIPTION =
  "Letzter Tag des Zeitraums, eingeschlossen, als YYYY-MM-DD. Für den heutigen Bestand das " +
  "heutige Datum setzen.";

const BASE_DESCRIPTION =
  "Datumsgrundlage. 'date' ist das Buchungs- oder Rechnungsdatum, 'date_delivery_else_date' " +
  "das Leistungsdatum und hilfsweise das Buchungsdatum. Vorgabe ist 'date'.";

const MAX_ROWS_DESCRIPTION =
  "Höchstzahl der angezeigten Buchungszeilen, 1 bis 200, Vorgabe 50. Gekürzt wird in der " +
  "MITTE: Die letzten fünf Zeilen bleiben immer stehen, weil in der letzten der Saldo steht. " +
  "Der Wert wirkt serverseitig und geht nicht an die API.";

interface Resolved {
  readonly number: string;
  readonly name: string | null;
  readonly via: "number" | "name";
}

/** `true`, wenn die Angabe rein numerisch ist und damit als Kontonummer gilt. */
function isAccountNumber(value: string): boolean {
  return /^[0-9]{1,18}$/.test(value);
}

async function run(ctx: BundleContext, args: Record<string, unknown>): Promise<BundleOutcome> {
  const wanted = typeof args["account"] === "string" ? args["account"] : "";
  const maxRows = typeof args["max_rows"] === "number" ? args["max_rows"] : DEFAULT_MAX_ROWS;
  let account: Resolved = { number: wanted, name: null, via: "number" };

  // --- Schritt 1: Namensauflösung, nur bei nicht-numerischem account. Modus abort -------
  if (!isAccountNumber(wanted)) {
    const result = await ctx.call({ step: "accounts" });
    if (!result.ok) {
      return ctx.errorOutcome(result);
    }
    const table = rawRows(result.envelope).map((row) => ({
      postingaccount_number: textOf(row["postingaccount_number"]),
      name: textOf(row["name"]),
    }));
    const needle = wanted.toLowerCase();
    const hits = table.filter((row) => row.name.toLowerCase().includes(needle));
    const single = hits[0];
    if (hits.length !== 1 || single === undefined) {
      // Die Auflösung rät nie: Ein Agent, der „PayPal" hört und 1200 rät, bekommt eine
      // plausible, vollständige, falsche Liste. In der Buchhaltung ist eine falsche Antwort
      // teurer als eine fehlende.
      const what =
        hits.length === 0
          ? `Kein Zahlungskonto passt zum Namen "${wanted}".`
          : `Mehrere Zahlungskonten passen zum Namen "${wanted}".`;
      ctx.stop("error");
      ctx.gap({
        what,
        why: "Das Kontenblatt ist deshalb nicht geholt worden; geraten wird hier nicht.",
        next_step:
          "bb_balances_get mit account gleich einer postingaccount_number aus der Liste unten, " +
          "oder bb_masterdata_search für ein Sachkonto",
      });
      return {
        kind: "ok",
        incompleteDetail: "der Kontoname ließ sich nicht eindeutig auflösen",
        data: {
          account: null,
          account_candidates: hits.length === 0 ? table : hits,
          balance_end: null,
          standard_chart: null,
          integrity_error: null,
          posting_count: null,
          rows: null,
        },
        lines: [
          `${what} Es ist kein Kontenblatt abgerufen worden.`,
          renderTable(hits.length === 0 ? table : hits),
          "Diese Liste enthält ausschließlich Zahlungskonten. Die Nummer eines Sachkontos " +
            "liefert bb_masterdata_search.",
        ],
      };
    }
    account = { number: single.postingaccount_number, name: single.name, via: "name" };
  }

  // --- Schritt 2: das Kontenblatt -----------------------------------------------------
  const body: Record<string, unknown> = {
    postingaccount_number: account.number,
    date_from: args["date_from"],
    date_to: args["date_to"],
  };
  if (typeof args["base"] === "string") {
    body["base"] = args["base"];
  }
  const ledgerResult = await ctx.call({
    step: "ledger",
    body,
    additional: ctx.callsUsed() > 0,
  });
  if (!ledgerResult.ok) {
    // Die Auflösungsarbeit geht nie verloren: Die ermittelte Nummer kommt zurück, und die
    // Lücke nennt den Einzelaufruf mit genau dieser Nummer.
    ctx.gap({
      what: `Das Kontenblatt zu ${account.number} konnte nicht geholt werden.`,
      why: ledgerResult.summary,
      next_step:
        `bb_reports_get_ledger mit postingaccount_number=${account.number}, ` +
        `date_from=${textOf(args["date_from"])} und date_to=${textOf(args["date_to"])}`,
    });
    return {
      kind: "ok",
      incompleteDetail: "das Kontenblatt fehlt, die Kontonummer steht fest",
      data: {
        account: {
          postingaccount_number: account.number,
          name: account.name,
          resolved_via: account.via,
        },
        balance_end: null,
        standard_chart: null,
        integrity_error: null,
        posting_count: null,
        rows: null,
      },
      lines: [
        `Das Konto ist aufgelöst: ${account.number}${account.name === null ? "" : ` (${account.name})`}. ` +
          "Das Kontenblatt selbst fehlt; die Zeilenliste ist null und nicht leer.",
      ],
    };
  }

  const payload = ledgerResult.envelope.body["report_sums_postingaccount_ledger"];
  const wrapper = isRecord(payload) ? payload : {};
  const ledgerRaw = wrapper["postingaccountLedger"];
  const ledger = Array.isArray(ledgerRaw) ? ledgerRaw.filter(isRecord) : [];
  const integrityError = wrapper["integrityError"] === true;
  const standardChart = ledger.length === 0 ? null : textOf(ledger[0]?.["standard_chart"]);

  const projected = ledger.map((row) => projectLedgerRow(row));
  // Erst nach max_rows kürzen, dann gegen das Antwortbudget prüfen. Bleibt das Budget die
  // engere Grenze, wird die Mittenkürzung mit der kleineren Zahl WIEDERHOLT: So bleiben die
  // letzten fünf Zeilen auch dann stehen, wenn das Budget greift — und in der letzten steht
  // der Saldo.
  const byRows = shorten(projected, maxRows);
  const fit = fitToBudget(byRows.rows, ctx.maxResponseTokens, RESERVED_CHARS);
  const shown = fit.truncated
    ? shorten(projected, Math.max(KEEP_LAST_ROWS + 1, fit.count))
    : byRows;
  const last = projected[projected.length - 1];

  const balance =
    last === undefined
      ? null
      : {
          amount: textOf(last["balanceAfterAbsolute"]),
          side: textOf(last["balanceAfterSide"]),
          source: "balanceAfterAbsolute und balanceAfterSide der letzten Zeile des Kontenblatts",
        };

  const data: Record<string, unknown> = {
    account: {
      postingaccount_number: account.number,
      name: account.name,
      resolved_via: account.via,
    },
    period: {
      date_from: args["date_from"],
      date_to: args["date_to"],
      base: args["base"] ?? "date",
    },
    balance_end: balance,
    standard_chart: standardChart,
    integrity_error: integrityError,
    posting_count: projected.length,
    rows: shown.rows,
    rows_shown: shown.rows.length,
    rows_omitted: shown.omitted,
  };

  const lines: string[] = [];
  if (integrityError) {
    lines.push(
      "ACHTUNG: Das Kontenblatt meldet integrityError. Die Zahlen unten sind unter diesem " +
        "Vorbehalt zu lesen; die Ursache klärt die Weboberfläche von BuchhaltungsButler.",
    );
  }
  lines.push(
    `Konto ${account.number}${account.name === null ? "" : ` (${account.name})`}, ` +
      `${account.via === "number" ? "als Kontonummer übernommen" : "über den Namen aufgelöst"}. ` +
      `Zeitraum ${textOf(args["date_from"])} bis ${textOf(args["date_to"])}` +
      `${standardChart === null || standardChart === "" ? "" : `, Kontenrahmen ${standardChart}`}.`,
  );
  lines.push(balanceLine(balance, projected.length));
  if (shown.rows.length > 0) {
    lines.push(renderTable(shown.rows));
  }
  if (shown.omitted > 0) {
    lines.push(
      `Von ${String(projected.length)} Buchungszeilen werden ${String(shown.rows.length)} ` +
        `angezeigt; ${String(shown.omitted)} Zeilen aus der MITTE sind weggelassen. Die letzten ` +
        `${String(KEEP_LAST_ROWS)} Zeilen bleiben immer stehen, weil in der letzten der Saldo ` +
        "steht.",
    );
    // Der Grund der Kürzung muss stimmen: `fit` ist über die BEREITS auf max_rows gekürzten
    // Zeilen gerechnet, also kürzt allein max_rows, solange `fit.truncated` false ist. Die
    // Budgetmeldung an dieser Stelle nennte sonst einen Grund, den es nicht gab, und schickte
    // den Aufrufer auf den falschen Hebel („enger filtern" statt max_rows erhöhen).
    lines.push(
      fit.truncated
        ? truncationNote(shown.rows.length, projected.length, fit.budgetTokens, ctx.projection, {
            stockIncomplete: !ctx.isComplete(),
          })
        : "Gekürzt hat max_rows; ein höherer Wert zeigt mehr, begrenzt durch das Antwortbudget.",
    );
  }
  lines.push(
    "Das Kontenblatt zeigt nur Gebuchtes. Die Differenz zum Kontoauszug aus bb_records_collect " +
      "mit resource='transactions' ist genau das noch nicht Gebuchte. Alle 24 Felder je Zeile " +
      "liefert bb_reports_get_ledger.",
  );
  lines.push(ctx.callBudgetLine());

  return { kind: "ok", data, lines };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectLedgerRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of LEDGER_FIELDS) {
    if (field in row) {
      out[field] = row[field];
    }
  }
  return out;
}

/**
 * Kürzt in der Mitte. Die letzten {@link KEEP_LAST_ROWS} Zeilen bleiben immer stehen, weil in
 * der letzten der Saldo steht — genau die Zeile, wegen der das Werkzeug aufgerufen wurde.
 */
function shorten(
  rows: readonly Record<string, unknown>[],
  maxRows: number,
): { readonly rows: Record<string, unknown>[]; readonly omitted: number } {
  if (rows.length <= maxRows) {
    return { rows: rows.map((row) => ({ ...row })), omitted: 0 };
  }
  const tail = Math.min(KEEP_LAST_ROWS, maxRows);
  const head = maxRows - tail;
  const kept = [...rows.slice(0, head), ...rows.slice(rows.length - tail)];
  return { rows: kept.map((row) => ({ ...row })), omitted: rows.length - kept.length };
}

function balanceLine(
  balance: { readonly amount: string; readonly side: string } | null,
  postingCount: number,
): string {
  if (balance === null || postingCount === 0) {
    return (
      "Keine Buchungen im Zeitraum. Daraus lässt sich KEIN Saldo ableiten: Ein leeres " +
      "Kontenblatt ist nicht dasselbe wie ein Saldo von 0,00. Zeitraum weiter fassen oder " +
      "prüfen, ob die Kontonummer stimmt."
    );
  }
  const side =
    balance.side === "debit" ? "Soll" : balance.side === "credit" ? "Haben" : balance.side;
  return (
    "Saldo laut Kontenblatt nach der letzten Buchung im Zeitraum, einschließlich des Bestands " +
    `vor date_from: ${balance.amount} ${side}. Das ist damit ein echter Kontostand und keine ` +
    "bloße Bewegungssumme; die Quelle sind balanceAfterAbsolute und balanceAfterSide der " +
    `letzten Zeile. Gezählt wurden ${String(postingCount)} Buchungszeilen.`
  );
}

const STEPS: readonly BundleStep[] = Object.freeze([
  stepFromTool(bb_payment_accounts_list, "accounts", "optional"),
  stepFromTool(bb_reports_get_ledger, "ledger", "required"),
]);

export const bb_balances_get: BundleEntry = {
  name: ENTRY_NAME,
  title: "Kontostand und Kontenblatt",
  group: BUNDLE_TOOL_GROUP,
  effect: "read",
  toolClass: "R",
  tier: 2,
  description:
    "Liefert das Kontenblatt eines Kontos mit fortgeschriebenem Saldo und beantwortet damit " +
    "'stimmt mein Kassenbestand' und 'wie viel ist gerade auf PayPal'. account nimmt eine " +
    "Kontonummer oder den Namen eines Zahlungskontos; die Nummer eines Sachkontos liefert " +
    "bb_masterdata_search. Der Saldo steht in der letzten Zeile und enthält gemessen auch den " +
    "Bestand vor date_from; gekürzt wird deshalb in der Mitte und nie am Ende. Ersetzt " +
    "bb_reports_get_ledger für die Frage nach dem Kontostand; alle 24 Felder je Buchungszeile " +
    "liefert weiterhin nur dieses Einzelwerkzeug. Ein leeres Kontenblatt ist kein Saldo von " +
    "0,00. Höchstens 2 Aufrufe an die API.",
  fields: [
    {
      name: "account",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: ACCOUNT_DESCRIPTION,
      schema: boundedText(ACCOUNT_DESCRIPTION, 100),
    },
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: true,
      description: DATE_FROM_DESCRIPTION,
      schema: dateValue(DATE_FROM_DESCRIPTION),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: true,
      description: DATE_TO_DESCRIPTION,
      schema: dateValue(DATE_TO_DESCRIPTION),
    },
    {
      name: "base",
      apiNames: ["base"],
      source: "body",
      required: false,
      description: BASE_DESCRIPTION,
      schema: z.enum(["date", "date_delivery_else_date"]).describe(BASE_DESCRIPTION),
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
        .min(1, { error: "muss mindestens 1 sein" })
        .max(200, { error: "höchstens 200" })
        .describe(MAX_ROWS_DESCRIPTION),
    },
    responseFormatField(),
  ],
  serverOnlyFields: ["max_rows", "response_format"],
  steps: STEPS,
  maxCalls: 2,
  minTokens: 2,
  failureMode: "abort",
  crossChecks: ["Q1", "Q3"],
  bundleChecks: [],
  searchHint: [
    "Kontostand",
    "Saldo",
    "Kassenbestand",
    "Kontenblatt",
    "wie viel ist auf",
    "Bankkonto",
    "PayPal",
  ],
  outputProperties: {
    account: { type: ["object", "null"], additionalProperties: true },
    account_candidates: rowsSchema(),
    period: { type: ["object", "null"], additionalProperties: true },
    balance_end: { type: ["object", "null"], additionalProperties: true },
    standard_chart: { type: ["string", "null"] },
    integrity_error: { type: ["boolean", "null"] },
    posting_count: { type: ["integer", "null"] },
    rows: rowsSchema(),
    rows_shown: { type: "integer" },
    rows_omitted: { type: "integer" },
  },
  outputRequired: ["account", "balance_end", "rows"],
  run,
};
