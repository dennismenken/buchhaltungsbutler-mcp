// Bündel 3: ein Vorgang samt seinen Zuordnungen, aus beiden Richtungen mit einer Definition
// Zuordnungen in beide Richtungen.
//
// **Die wichtigste Einzelregel des Satzes steht hier.** Scheitert der Zuordnungsabruf, während
// der Hauptsatz geladen wurde, ist `assignments` NULL und nicht das leere Array,
// `assignments_status` ist `error`, und der Textblock sagt, dass es nicht ermittelt werden
// konnte. Zwei unabhängige Signale, weil eines übersehen werden kann: Eine fälschlich als
// unbezahlt gemeldete Rechnung führt zu einer doppelten Zahlung. Ein Beleg OHNE Zuordnung ist
// dagegen kein Fehlerfall, sondern ein gemessener Positivbefund (success true, rows 0).
//
// Scheitert der Hauptabruf, unterbleibt Schritt 2 (Modus abort): Eine Zuordnungsliste zu einem
// Vorgang, den es nicht gibt, ist irreführender als gar keine Antwort.
//
// Die Zahl der Zuordnungen ist nach oben offen: Gemessen gegen die Nachbildung wiegt eine
// Zahlung mit 300 zugeordneten Belegen rund 12.400 Token. Gekürzt wird deshalb zweistufig,
// erst über `max_rows`, dann über BB_MCP_MAX_RESPONSE_TOKENS — und beides steht in der Antwort,
// samt Lücke mit dem Einzelwerkzeug, das den Rest liefert. `assignment_count` nennt dabei
// weiter ALLE geladenen Zuordnungen: Die Kürzung darf die Antwort auf „wie viele gehören dazu"
// nicht verfälschen.
import { z } from "zod";

import { bb_receipts_get } from "../../registry/tools/bb_receipts_get.js";
import { bb_receipts_list_transactions } from "../../registry/tools/bb_receipts_list_transactions.js";
import { bb_transactions_get } from "../../registry/tools/bb_transactions_get.js";
import { bb_transactions_list_receipts } from "../../registry/tools/bb_transactions_list_receipts.js";
import { BUNDLE_TOOL_GROUP } from "../../registry/groups.js";
import { renderRecordInline, renderTable } from "../../response/table.js";
import { truncationNote } from "../../response/truncate.js";
import { idByCustomer } from "../../schema/vocab.js";
import { contractWarnings, fitToBudget, responseFormatField, textOf } from "../common.js";
import { mapStepResponse, projectRows, rawRows } from "../mapping.js";
import { rowsSchema } from "../output-schema.js";
import { stepFromTool } from "../steps.js";
import type { BundleContext, BundleEntry, BundleOutcome, BundleStep } from "../types.js";

const ENTRY_NAME = "bb_assignments_get";

/** Höchstens drei bedingte Anreicherungen. Angereichert wird nur, was Felder vermissen lässt. */
const MAX_ENRICHMENTS = 3;

/** Angezeigte Zuordnungszeilen ohne Angabe von `max_rows`. */
const DEFAULT_MAX_ROWS = 50;

/** Zeichen, die der übrige Textblock dieses Bündels grob belegt. */
const RESERVED_CHARS = 2_500;

/**
 * Die fachlich nötigen Felder einer Zuordnungszeile, je Richtung.
 *
 * Fehlen sie, ist die Zeile für eine Buchhalterin wertlos: Ein Dateiname nennt weder
 * Gegenpartei noch Betrag. Entschieden wird an der tatsächlich zurückgekommenen Zeile und
 * nicht an der Spezifikation — Befund L2 in docs/api/live-befunde.md hat gezeigt, dass die
 * Spezifikation Antwortfelder
 * unterschlägt, und die Feldmenge von `/transactions/assigned-receipts/get` ist in diesem
 * Projekt nicht gemessen.
 */
const NEEDED_FIELDS: Readonly<Record<"receipt" | "transaction", readonly string[]>> = Object.freeze(
  {
    // Zuordnungszeilen zu einem Beleg sind Zahlungen.
    receipt: ["to_from", "amount", "booking_date"],
    // Zuordnungszeilen zu einer Zahlung sind Belege.
    transaction: ["counterparty", "amount", "date"],
  },
);

const RECEIPT_ID_DESCRIPTION =
  "Die mandantenbezogene Belegnummer, zu finden über bb_records_collect oder " +
  "bb_receipts_search. Genau eines der beiden Kennungsfelder ist zu setzen. In " +
  "Suchergebnissen erscheint die Nummer als Zeichenkette; hier ohne Anführungszeichen " +
  "übergeben. Beleg 1590 und Zahlung 1590 sind verschiedene Vorgänge.";

const TRANSACTION_ID_DESCRIPTION =
  "Die mandantenbezogene Nummer einer Zahlung, zu finden über bb_records_collect oder " +
  "bb_transactions_search. Genau eines der beiden Kennungsfelder ist zu setzen. Der " +
  "Nummernraum ist von dem der Belege getrennt.";

const MAX_ROWS_DESCRIPTION =
  "Höchstzahl der angezeigten Zuordnungszeilen, 1 bis 200, Vorgabe 50. Wirkt serverseitig und " +
  "geht nicht an die API; assignment_count nennt weiterhin alle gefundenen Zuordnungen.";

const CONFIRMED_ONLY_DESCRIPTION =
  "Wenn true, liefert die API nur bestätigte Zuordnungen, also solche, hinter denen eine " +
  "bestätigte Buchung steht. Ohne Angabe kommen alle. Der Bestätigungsstand selbst steht in " +
  "keiner Antwortzeile; dieses Werkzeug weist ihn deshalb nicht aus.";

interface Plan {
  readonly kind: "receipt" | "transaction";
  readonly id: number;
  readonly recordStep: string;
  readonly assignmentStep: string;
  readonly assignmentBodyField: string;
  readonly recordTool: string;
  readonly assignmentTool: string;
  readonly assignmentLabel: string;
}

function planFor(args: Record<string, unknown>): Plan {
  const receiptId = args["receipt_id_by_customer"];
  if (typeof receiptId === "number") {
    return {
      kind: "receipt",
      id: receiptId,
      recordStep: "receipt",
      assignmentStep: "receipt_assignments",
      assignmentBodyField: "receipt_id_by_customer",
      recordTool: "bb_receipts_get",
      assignmentTool: "bb_receipts_list_transactions",
      assignmentLabel: "Zahlungen",
    };
  }
  return {
    kind: "transaction",
    id:
      typeof args["transaction_id_by_customer"] === "number"
        ? args["transaction_id_by_customer"]
        : 0,
    recordStep: "transaction",
    assignmentStep: "transaction_assignments",
    assignmentBodyField: "transaction_id_by_customer",
    recordTool: "bb_transactions_get",
    assignmentTool: "bb_transactions_list_receipts",
    assignmentLabel: "Belege",
  };
}

/** Die gewünschte Zeilenzahl, oder die Vorgabe. */
function maxRowsOf(args: Record<string, unknown>): number {
  return typeof args["max_rows"] === "number" ? args["max_rows"] : DEFAULT_MAX_ROWS;
}

/** `true`, wenn der Zeile mindestens eines der fachlich nötigen Felder fehlt. */
function needsEnrichment(row: Record<string, unknown>, kind: Plan["kind"]): boolean {
  return NEEDED_FIELDS[kind].some((field) => textOf(row[field]) === "");
}

async function run(ctx: BundleContext, args: Record<string, unknown>): Promise<BundleOutcome> {
  const plan = planFor(args);

  // --- Schritt 1: der Vorgang selbst. Modus abort ------------------------------------
  const primary = await ctx.call({ step: plan.recordStep, pathValue: plan.id });
  if (!primary.ok) {
    return ctx.errorOutcome(primary);
  }
  const record = mapStepResponse(
    ENTRY_NAME,
    stepOf(plan.recordStep),
    primary.envelope,
    ctx.projection,
  );

  // --- Schritt 2: die Zuordnungen. Modus tolerant ------------------------------------
  const assignmentBody: Record<string, unknown> = { [plan.assignmentBodyField]: plan.id };
  if (args["confirmed_only"] === true) {
    assignmentBody["confirmed_only"] = true;
  }
  const assignmentResult = await ctx.call({
    step: plan.assignmentStep,
    body: assignmentBody,
    additional: true,
  });

  let assignments: Record<string, unknown>[] | null = null;
  let status: "loaded" | "error" | "not_requested" = "error";
  let enriched = 0;
  let notEnriched = 0;

  if (assignmentResult.ok) {
    status = "loaded";
    const rows = rawRows(assignmentResult.envelope).map((row) => ({ ...row }));

    // --- Bedingte Anreicherung, höchstens drei Aufrufe -------------------------------
    if (plan.kind === "transaction") {
      for (const row of rows) {
        if (!needsEnrichment(row, plan.kind)) {
          continue;
        }
        if (enriched >= MAX_ENRICHMENTS) {
          notEnriched += 1;
          continue;
        }
        const id = Number.parseInt(textOf(row["id_by_customer"]), 10);
        if (!Number.isFinite(id) || id <= 0) {
          notEnriched += 1;
          continue;
        }
        const extra = await ctx.call({ step: "receipt", pathValue: id, additional: true });
        if (!extra.ok) {
          notEnriched += 1;
          ctx.gap({
            what: `Der zugeordnete Beleg ${String(id)} konnte nicht angereichert werden.`,
            why: extra.summary,
            next_step: `bb_receipts_get mit receipt_id_by_customer=${String(id)}`,
          });
          if (extra.fatal) {
            break;
          }
          continue;
        }
        const extraRecord = mapStepResponse(
          ENTRY_NAME,
          stepOf("receipt"),
          extra.envelope,
          ctx.projection,
        );
        Object.assign(row, extraRecord.object ?? {});
        enriched += 1;
      }
    } else {
      const missing = rows.filter((row) => needsEnrichment(row, plan.kind));
      if (missing.length > 0) {
        notEnriched = missing.length;
        ctx.gap({
          what: `${String(missing.length)} Zuordnungszeilen tragen nicht alle fachlich nötigen Felder.`,
          why:
            "Angereichert wird in diesem Bündel nur der Weg über Belege; für eine Zahlung " +
            "liefert erst der Einzelabruf alle Felder.",
          next_step: "bb_transactions_get mit der id_by_customer der jeweiligen Zeile",
        });
      }
    }
    assignments = rows;
  } else {
    // R5 in Reinform: null heißt nicht ermittelt. Dazu ein eigenes Statusfeld, damit zwei
    // unabhängige Signale dieselbe Tatsache sagen.
    ctx.gap({
      what: `Ob ${plan.assignmentLabel} zugeordnet sind, konnte nicht ermittelt werden.`,
      why: assignmentResult.summary,
      next_step: `${plan.assignmentTool} mit ${plan.assignmentBodyField}=${String(plan.id)}`,
    });
  }

  const mappedAssignments =
    assignments === null
      ? null
      : projectRows(ENTRY_NAME, stepOf(plan.assignmentStep), assignments, ctx.projection);
  const allRows = mappedAssignments === null ? null : mappedAssignments.rows;
  const violations =
    mappedAssignments === null
      ? null
      : contractWarnings(mappedAssignments.warnings, mappedAssignments.rows.length);

  // Erst die Zeilenzahl des Aufrufers, dann das Antwortbudget: 300 zugeordnete Belege sind
  // gemessen rund 12.400 Token und damit das Zweieinhalbfache der Vorgabe. Ein Betreiber, der
  // BB_MCP_MAX_RESPONSE_TOKENS senkt, bekommt hier denselben Schutz wie bei den 54
  // Endpunktwerkzeugen — samt Meldung, statt stillschweigend.
  const total = allRows === null ? 0 : allRows.length;
  const byRows = allRows === null ? null : allRows.slice(0, maxRowsOf(args));
  const fit = byRows === null ? null : fitToBudget(byRows, ctx.maxResponseTokens, RESERVED_CHARS);
  const projected = byRows === null || fit === null ? null : byRows.slice(0, fit.count);
  const omitted = projected === null ? null : total - projected.length;
  // VOR den Lücken dieser Kürzung gelesen: Sonst nennte die Kürzungsmeldung den Bestand
  // unvollständig, obwohl allein die Anzeige gekürzt wurde.
  const stockIncomplete = !ctx.isComplete();
  if (omitted !== null && omitted > 0) {
    ctx.stop(fit?.truncated === true ? "response_size" : "row_limit");
    ctx.gap({
      what:
        `${String(omitted)} der ${String(total)} zugeordneten ${plan.assignmentLabel} stehen ` +
        "nicht in dieser Antwort.",
      why:
        fit?.truncated === true
          ? "Die Antwort hätte sonst das Antwortbudget dieses Servers überschritten " +
            "(BB_MCP_MAX_RESPONSE_TOKENS)."
          : `max_rows stand auf ${String(maxRowsOf(args))}.`,
      next_step: `${plan.assignmentTool} mit ${plan.assignmentBodyField}=${String(plan.id)}`,
    });
  }

  const data: Record<string, unknown> = {
    kind: plan.kind,
    id_by_customer: String(plan.id),
    record: record.object ?? {},
    assignments: projected,
    assignments_status: status,
    assignment_count: allRows === null ? null : total,
    assignments_omitted: omitted,
    enriched,
    not_enriched: notEnriched,
    confirmed_only: args["confirmed_only"] === true,
    ...(violations === null ? {} : violations.structured),
  };

  const lines: string[] = [
    ...(violations === null ? [] : [violations.line]),
    `Vorgang: ${plan.kind === "receipt" ? "Beleg" : "Zahlung"} ${String(plan.id)} ` +
      `(kind '${plan.kind}'). Die beiden Nummernräume sind getrennt.`,
    renderRecordInline(record.object ?? {}),
    assignmentLine(plan, total, projected, status, enriched, notEnriched),
  ];
  if (projected !== null && projected.length > 0) {
    lines.push(renderTable(projected));
  }
  if (omitted !== null && omitted > 0 && projected !== null && fit !== null) {
    lines.push(
      `Angezeigt werden ${String(projected.length)} der ${String(total)} zugeordneten ` +
        `${plan.assignmentLabel}; assignment_count nennt weiterhin alle, assignments trägt nur ` +
        "die angezeigten.",
    );
    lines.push(
      fit.truncated
        ? truncationNote(projected.length, total, fit.budgetTokens, ctx.projection, {
            stockIncomplete,
          })
        : "Gekürzt hat max_rows; ein höherer Wert zeigt mehr, begrenzt durch das Antwortbudget.",
    );
  }
  lines.push(
    args["confirmed_only"] === true
      ? "confirmed_only war gesetzt: Die Liste ist gefiltert. Einen Bestätigungsstatus weist " +
          "die API je Zeile nicht aus, dieses Werkzeug behauptet ihn deshalb nicht."
      : "confirmed_only war nicht gesetzt: Die Liste enthält bestätigte und unbestätigte " +
          "Zuordnungen. Einen Bestätigungsstatus weist die API je Zeile nicht aus.",
  );
  lines.push(
    "Ob der Vorgang gebucht ist, sagt dieses Werkzeug NICHT: /postings/get kennt keinen Filter " +
      "auf receipt_id_by_customer oder transaction_id_by_customer, obwohl die Felder in der " +
      "Antwort stehen. Dafür bb_records_collect mit resource='postings' und einem Zeitraum " +
      "nehmen und dort auf die Kennung sehen.",
  );
  lines.push(ctx.callBudgetLine());

  // Ist die Kürzung der EINZIGE Grund für `complete` = false, sagt die erste Zeile das auch:
  // „abgebrochen nach 2 Aufrufen" legte sonst einen abgebrochenen Abruf nahe, wo alles geholt
  // und nur die Anzeige gekürzt wurde.
  const truncationOnly = omitted !== null && omitted > 0 && !stockIncomplete;

  return {
    kind: "ok",
    data,
    lines,
    ...(truncationOnly
      ? { incompleteDetail: "die Zuordnungen sind vollständig geholt, gekürzt ist die Anzeige" }
      : {}),
  };
}

function assignmentLine(
  plan: Plan,
  total: number,
  assignments: readonly Record<string, unknown>[] | null,
  status: "loaded" | "error" | "not_requested",
  enriched: number,
  notEnriched: number,
): string {
  if (assignments === null || status !== "loaded") {
    return (
      `Ob ${plan.assignmentLabel} zugeordnet sind, konnte nicht ermittelt werden. Das Feld ` +
      "assignments ist null und nicht das leere Array, assignments_status steht auf 'error'. " +
      "Das ist ausdrücklich NICHT dasselbe wie 'keine Zuordnungen': Eine fälschlich als " +
      "unbezahlt gemeldete Rechnung führt zu einer doppelten Zahlung."
    );
  }
  if (total === 0) {
    return (
      `Keine ${plan.assignmentLabel} zugeordnet. Das ist ein Positivbefund und kein Fehler: ` +
      "Die API hat mit success true und null Zeilen geantwortet."
    );
  }
  const enrichment =
    enriched === 0 && notEnriched === 0
      ? ""
      : ` Angereichert wurden ${String(enriched)} Zeilen, ${String(notEnriched)} blieben ohne Anreicherung.`;
  return `${String(total)} zugeordnete ${plan.assignmentLabel}.${enrichment}`;
}

const STEPS: readonly BundleStep[] = Object.freeze([
  stepFromTool(bb_receipts_get, "receipt", "required"),
  stepFromTool(bb_transactions_get, "transaction", "required"),
  stepFromTool(bb_receipts_list_transactions, "receipt_assignments", "optional", {
    // Der Registereintrag trägt `concise: []`, liefert also alle Felder. Für die Zuordnungen
    // genügen die sechs, die eine Buchhalterin braucht.
    concise: ["id_by_customer", "to_from", "amount", "booking_date", "value_date", "purpose"],
  }),
  stepFromTool(bb_transactions_list_receipts, "transaction_assignments", "optional", {
    // Der Endpunkt liefert laut Spezifikation nur id_by_customer und filename. Die Projektion
    // führt zusätzlich die Felder, die eine BEDINGTE Anreicherung nachträgt; ohne sie fielen
    // gerade die nachgeholten Angaben der Projektion zum Opfer. Sind sie nicht da, erscheinen
    // sie auch nicht — die Projektion nimmt nur, was in der Zeile steht.
    concise: [
      "id_by_customer",
      "filename",
      "date",
      "counterparty",
      "invoicenumber",
      "amount",
      "payment_date",
    ],
  }),
]);

function stepOf(id: string): BundleStep {
  const step = STEPS.find((candidate) => candidate.id === id);
  if (step === undefined) {
    throw new Error(`${ENTRY_NAME} kennt keinen Schritt ${id}.`);
  }
  return step;
}

export const bb_assignments_get: BundleEntry = {
  name: ENTRY_NAME,
  title: "Vorgang mit Zuordnungen holen",
  group: BUNDLE_TOOL_GROUP,
  effect: "read",
  toolClass: "R",
  tier: 2,
  description:
    "Holt einen Beleg oder eine Zahlung samt allen zugeordneten Gegenstücken in einem Aufruf " +
    "und beantwortet damit 'welcher Beleg gehört zu dieser Abbuchung' und 'welche Zahlung hängt " +
    "an dieser Rechnung'. Genau eines der beiden Kennungsfelder setzen. Ersetzt das Paar " +
    "bb_receipts_get und bb_receipts_list_transactions sowie das Paar bb_transactions_get und " +
    "bb_transactions_list_receipts. Konnte die Zuordnungsliste nicht geholt werden, steht dort " +
    "null und nicht das leere Array; 'keine Zuordnung' wird nur behauptet, wenn die API es " +
    "gesagt hat. Die Belegdatei kommt nie mit, dafür bb_receipts_get. Höchstens 5 Aufrufe an " +
    "die API.",
  fields: [
    {
      name: "receipt_id_by_customer",
      apiNames: ["receipt_id_by_customer"],
      source: "body",
      required: false,
      description: RECEIPT_ID_DESCRIPTION,
      schema: idByCustomer("des Belegs", "bb_records_collect").describe(RECEIPT_ID_DESCRIPTION),
    },
    {
      name: "transaction_id_by_customer",
      apiNames: ["transaction_id_by_customer"],
      source: "body",
      required: false,
      description: TRANSACTION_ID_DESCRIPTION,
      schema: idByCustomer("der Zahlung", "bb_records_collect").describe(
        TRANSACTION_ID_DESCRIPTION,
      ),
    },
    {
      name: "confirmed_only",
      apiNames: ["confirmed_only"],
      source: "body",
      required: false,
      description: CONFIRMED_ONLY_DESCRIPTION,
      schema: z.boolean().describe(CONFIRMED_ONLY_DESCRIPTION),
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
  maxCalls: 5,
  minTokens: 2,
  failureMode: "abort",
  crossChecks: ["Q3"],
  bundleChecks: ["B3"],
  searchHint: [
    "Zuordnung",
    "welcher Beleg gehört zu",
    "welche Zahlung",
    "bezahlt",
    "unbezahlt",
    "Abbuchung",
    "Rechnung zuordnen",
  ],
  outputProperties: {
    kind: { type: "string", enum: ["receipt", "transaction"] },
    id_by_customer: { type: "string" },
    record: { type: "object", additionalProperties: true },
    assignments: rowsSchema(),
    assignments_status: { type: "string", enum: ["loaded", "error", "not_requested"] },
    assignment_count: { type: ["integer", "null"] },
    // `assignments_omitted` steht in der Antwort und ist durch `additionalProperties: true`
    // gedeckt, wie `matched` und `stopped_because` bei bb_masterdata_search. Es hier
    // auszuschreiben kostete Definitionstoken, ohne eine Zusage hinzuzufügen: Die Zahl ergibt
    // sich aus assignment_count minus der Länge von assignments, und dass gekürzt wurde, sagen
    // bundle.complete, bundle.stopped_because, die Lückenliste und der Textblock.
    enriched: { type: "integer" },
    not_enriched: { type: "integer" },
    confirmed_only: { type: "boolean" },
  },
  outputRequired: ["kind", "assignments", "assignments_status"],
  run,
};
