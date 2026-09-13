// P10 aus Plan 9.2: Sind die schreibenden Einträge vollständig ausgestattet?
//
// Drei Dinge entscheiden nach einem Zeitlimit darüber, ob ein Agent den Vorgang ein zweites
// Mal auslöst und damit eine Doppelbuchung erzeugt: ein Prüfweg (`verifyWith`), eine
// Mengengrenze an jedem Behälterfeld und die richtige Zeitlimitstufe. Die API kennt keinen
// Idempotenzschlüssel; wer einen schreibenden Aufruf trotzdem wiederholt, bucht doppelt.

import { describe, expect, it } from "vitest";

import type { CrossCheckId, ToolEntry } from "../../src/registry/types.js";
import {
  REGISTRY,
  containerFields,
  entryByName,
  jsonSchemaFor,
  missingEntry,
  topLevelMaxItems,
} from "../helpers/registry-fixtures.js";
import {
  EXPECTED_READING_TOOL_NAMES,
  EXPECTED_TOOL_NAMES,
  EXPECTED_WRITING_TOOL_NAMES,
} from "./class-list.js";

/**
 * Die vier Endpunkte ohne lesendes Gegenstück (Plan 2.1). Für sie trägt `verifyWith` die
 * Form `{ kind: "none", reason: … }` und sagt ausdrücklich, dass die API keinen Leseweg
 * anbietet und in der Weboberfläche nachzusehen ist.
 */
const NO_READ_COUNTERPART_TOOLS: readonly string[] = [
  "bb_comments_create",
  "bb_invoices_create",
  "bb_invoices_create_draft",
  "bb_invoices_create_einvoice",
];

/** Die acht Stapelwerkzeuge. Ihr Eimer ist `batch`, ihre Zeitlimitstufe `long` (Plan 5.2, 5.4). */
const BATCH_TOOLS: readonly string[] = [
  "bb_receipts_create_batch",
  "bb_transactions_create_batch",
  "bb_transactions_assign_receipt_batch",
  "bb_postings_create_for_receipt_batch",
  "bb_postings_create_for_transaction_batch",
  "bb_postings_create_free_batch",
  "bb_debtors_create_batch",
  "bb_creditors_create_batch",
];

/** Die fünf Berichtswerkzeuge. Zeitlimitstufe `long`, die beiden erzeugenden zusätzlich im
 *  Eimer `reports` — keine API-Regel, sondern eine Bremse gegen das Muster „create, sofort
 *  get, error_code 8, sofort wieder create" (Plan 5.4). */
const REPORT_TOOLS: readonly string[] = [
  "bb_reports_get_bwa",
  "bb_reports_get_sums",
  "bb_reports_get_ledger",
  "bb_reports_create_bwa",
  "bb_reports_create_sums",
];

const UPLOAD_TOOL = "bb_receipts_upload";

/** Die dreizehn Werkzeuge aus Plan 4.7 Q4: Stapelbehälter, Positionslisten und beides
 *  zugleich. Es ist genau die Menge der Werkzeuge mit einem Feld, das `itemFields` trägt. */
const Q4_TOOLS: readonly string[] = [
  "bb_receipts_create_batch",
  "bb_transactions_create_batch",
  "bb_transactions_assign_receipt_batch",
  "bb_invoices_create",
  "bb_invoices_create_draft",
  "bb_invoices_create_einvoice",
  "bb_postings_create_for_receipt",
  "bb_postings_create_for_receipt_batch",
  "bb_postings_create_for_transaction",
  "bb_postings_create_for_transaction_batch",
  "bb_postings_create_free_batch",
  "bb_debtors_create_batch",
  "bb_creditors_create_batch",
];

/** Das API-Maximum aus Plan 4.7. Der wirksame Wert ist min(50, BB_MCP_MAX_BATCH); im
 *  Auslieferungszustand fallen beide Faktoren auf 50 zusammen. */
const MAX_BATCH = 50;

const BUCKETS = ["default", "upload", "batch", "reports"] as const;
const TIMEOUT_TIERS = ["short", "normal", "long"] as const;
const CROSS_CHECKS: readonly CrossCheckId[] = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Q5",
  "Q6",
  "Q7",
  "Q8",
  "Q9",
];

/**
 * Die beiden Werkzeuge, deren Aufrufform abgeleitet und nicht gemessen ist: Sie verwenden
 * dieselbe Pfadsegmentform wie die live bestätigten Einzelabrufe, sind aber schreibend und
 * wurden deshalb nicht getestet (Plan 4.6, Klärung in AP19, Nachziehen in AP19b).
 */
const NOT_VERIFIED: readonly string[] = ["bb_receipts_delete", "bb_receipts_restore"];

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

/** Der erwartete Eimer eines Werkzeugs nach der Tabelle in Plan 5.4. */
function expectedBucket(name: string): string {
  if (name === UPLOAD_TOOL) return "upload";
  if (BATCH_TOOLS.includes(name)) return "batch";
  if (name === "bb_reports_create_bwa" || name === "bb_reports_create_sums") return "reports";
  return "default";
}

/** Die erwartete Zeitlimitstufe nach der Tabelle in Plan 5.2. */
function expectedTimeoutTier(tool: ToolEntry): string {
  if (
    tool.name === UPLOAD_TOOL ||
    BATCH_TOOLS.includes(tool.name) ||
    REPORT_TOOLS.includes(tool.name)
  ) {
    return "long";
  }
  return tool.effect === "read" ? "short" : "normal";
}

describe("P10 Prüfweg nach einem Zeitlimit", () => {
  it("stattet jedes der 39 schreibenden Werkzeuge mit verifyWith aus", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_WRITING_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(`${missingEntry(name)} Erwartet wird ein nicht leeres verifyWith.`);
        continue;
      }
      if (tool.verifyWith === undefined) {
        problems.push(
          `${name}: kein verifyWith. Nach einem Zeitlimit ist ohne Prüfweg nur noch Raten möglich, und Raten heißt hier doppelt buchen (Plan 5.3, 5.7).`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt kind none genau bei den vier Endpunkten ohne lesendes Gegenstück", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_WRITING_TOOL_NAMES) {
      const tool = entryByName(name);
      const verify = tool?.verifyWith;
      if (verify === undefined) continue;

      const expectsNoReadPath = NO_READ_COUNTERPART_TOOLS.includes(name);
      if (expectsNoReadPath && verify.kind !== "none") {
        problems.push(
          `${name}: die API bietet für diesen Endpunkt keinen Leseweg; erwartet ist { kind: "none", reason: … } (Plan 2.1).`,
        );
      }
      if (!expectsNoReadPath && verify.kind === "none") {
        problems.push(
          `${name}: kind "none", obwohl es ein lesendes Gegenstück gibt. Nur ${NO_READ_COUNTERPART_TOOLS.join(", ")} tragen diese Form.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("nennt in jedem Prüfweg ein lesendes Werkzeug, Argumente und einen Hinweis", () => {
    const problems: string[] = [];
    const readingToolNames = new Set(EXPECTED_READING_TOOL_NAMES);

    for (const name of EXPECTED_WRITING_TOOL_NAMES) {
      const verify = entryByName(name)?.verifyWith;
      if (verify === undefined) continue;

      if (verify.kind === "none") {
        if (verify.reason.trim() === "") {
          problems.push(`${name}: verifyWith mit kind "none" ohne reason.`);
        }
        continue;
      }

      if (!readingToolNames.has(verify.tool)) {
        problems.push(
          `${name}: verifyWith nennt ${verify.tool}; das ist keines der 15 lesenden Werkzeuge.`,
        );
      }
      if (Object.keys(verify.argsFrom).length === 0) {
        problems.push(
          `${name}: verifyWith ohne argsFrom. Der Prüfweg sagt, welche Argumente aus dem fehlgeschlagenen Aufruf zu übernehmen sind (Plan 2.1).`,
        );
      }
      if (verify.hint.trim() === "") {
        problems.push(`${name}: verifyWith ohne hint.`);
      }
    }

    expectNoIssues(problems);
  });
});

describe("P10 Mengengrenzen", () => {
  it("setzt an jedem Feld mit itemFields ein maxItems", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const { path, field } of containerFields(tool)) {
        const schema = jsonSchemaFor(field.schema, `${tool.name}, Feld ${path}`);
        const max = topLevelMaxItems(schema);
        if (max === undefined) {
          problems.push(
            `${tool.name}, Feld ${path}: kein maxItems. Stapelbehälter, Positionsliste und geschachtelte Positionsliste tragen die Grenze gleichermaßen (Plan 4.7 Q4, 4.8).`,
          );
          continue;
        }
        if (max > MAX_BATCH) {
          problems.push(
            `${tool.name}, Feld ${path}: maxItems ${String(max)} über dem API-Maximum ${String(MAX_BATCH)}.`,
          );
        }
        if (max < 1) {
          problems.push(
            `${tool.name}, Feld ${path}: maxItems ${String(max)} lässt keinen Eintrag zu.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("führt genau die dreizehn Werkzeuge aus Q4 mit einem Behälterfeld", () => {
    const problems: string[] = [];

    for (const name of Q4_TOOLS) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(`${missingEntry(name)} Erwartet wird ein Feld mit itemFields und Q4.`);
        continue;
      }
      if (containerFields(tool).length === 0) {
        problems.push(
          `${name}: kein Feld mit itemFields, obwohl Plan 4.7 Q4 das Werkzeug führt (Stapelbehälter oder Positionsliste).`,
        );
      }
      if (!tool.crossChecks.includes("Q4")) {
        problems.push(`${name}: crossChecks ohne Q4, obwohl das Werkzeug ein Behälterfeld führt.`);
      }
    }

    for (const tool of REGISTRY) {
      if (containerFields(tool).length > 0 && !Q4_TOOLS.includes(tool.name)) {
        problems.push(
          `${tool.name}: führt ein Behälterfeld, steht aber nicht in der Q4-Liste aus Plan 4.7.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("kennt nur die neun Querprüfungen Q1 bis Q9", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const id of tool.crossChecks) {
        if (!CROSS_CHECKS.includes(id)) {
          problems.push(`${tool.name}: crossChecks nennt ${id}; es gibt nur Q1 bis Q9 (Plan 4.7).`);
        }
      }
      const duplicateIds = tool.crossChecks.filter(
        (id, index) => tool.crossChecks.indexOf(id) !== index,
      );
      if (duplicateIds.length > 0) {
        problems.push(`${tool.name}: crossChecks nennt ${duplicateIds.join(", ")} mehrfach.`);
      }
    }

    expectNoIssues(problems);
  });
});

describe("P10 Eimer und Zeitlimit", () => {
  it("ordnet jedem Eintrag einen der vier Eimer aus Plan 5.4 zu", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(`${missingEntry(name)} Erwarteter Eimer: ${expectedBucket(name)}.`);
        continue;
      }
      if (!BUCKETS.includes(tool.bucket)) {
        problems.push(
          `${name}: bucket "${tool.bucket}" ist keiner der Eimer ${BUCKETS.join(", ")}.`,
        );
        continue;
      }
      const expected = expectedBucket(name);
      if (tool.bucket !== expected) {
        problems.push(`${name}: bucket ${tool.bucket}, nach Plan 5.4 ist es ${expected}.`);
      }
    }

    expectNoIssues(problems);
  });

  it("ordnet jedem Eintrag eine der drei Zeitlimitstufen aus Plan 5.2 zu", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) continue;
      if (!TIMEOUT_TIERS.includes(tool.timeoutTier)) {
        problems.push(
          `${name}: timeoutTier "${tool.timeoutTier}" ist keine der Stufen ${TIMEOUT_TIERS.join(", ")}.`,
        );
        continue;
      }
      const expected = expectedTimeoutTier(tool);
      if (tool.timeoutTier !== expected) {
        problems.push(
          `${name}: timeoutTier ${tool.timeoutTier}, nach Plan 5.2 ist es ${expected}.`,
        );
      }
    }

    expectNoIssues(problems);
  });
});

describe("P10 übrige Ausstattung", () => {
  it("verweist mit invalidatesCache nur auf Werkzeuge, die es gibt", () => {
    const problems: string[] = [];
    const knownNames = new Set(EXPECTED_TOOL_NAMES);

    for (const tool of REGISTRY) {
      for (const name of tool.invalidatesCache) {
        if (!knownNames.has(name)) {
          problems.push(
            `${tool.name}: invalidatesCache nennt ${name}; dieses Werkzeug gibt es nicht.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("führt duplicateCheck nur an anlegenden Werkzeugen und mit vollständigen Angaben", () => {
    const problems: string[] = [];
    const knownNames = new Set(EXPECTED_READING_TOOL_NAMES);

    for (const tool of REGISTRY) {
      const duplicate = tool.duplicateCheck;
      if (duplicate === undefined) continue;

      if (tool.effect !== "create") {
        problems.push(
          `${tool.name}: duplicateCheck an einem Werkzeug mit Wirkung ${tool.effect}. Der Duplikatshinweis gehört zu anlegenden Werkzeugen mit tragfähigem Schlüssel (Plan 2.1).`,
        );
      }
      if (!knownNames.has(duplicate.tool)) {
        problems.push(
          `${tool.name}: duplicateCheck sucht mit ${duplicate.tool}; das ist kein lesendes Werkzeug.`,
        );
      }
      if (duplicate.keyFields.length === 0) {
        problems.push(`${tool.name}: duplicateCheck ohne keyFields.`);
      }
    }

    expectNoIssues(problems);
  });

  it("kennzeichnet genau die beiden schreibenden Pfadsegment-Werkzeuge als nicht verifiziert", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const shouldNotBeVerified = NOT_VERIFIED.includes(tool.name);
      if (shouldNotBeVerified && tool.verified !== false) {
        problems.push(
          `${tool.name}: erwartet ist verified: false. Die Aufrufform ist von der gemessenen abgeleitet, aber schreibend und deshalb nicht getestet (Plan 4.6).`,
        );
      }
      if (!shouldNotBeVerified && tool.verified === false) {
        problems.push(
          `${tool.name}: verified: false ohne Grund. Nur ${NOT_VERIFIED.join(" und ")} tragen den Vermerk (Plan 4.6, AP19).`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("erweitert das Schema ausschließlich um response_format, und nur bei lesenden Werkzeugen", () => {
    const problems: string[] = [];
    const readingToolNames = new Set(EXPECTED_READING_TOOL_NAMES);

    for (const tool of REGISTRY) {
      for (const name of tool.serverOnlyFields) {
        if (name !== "response_format") {
          problems.push(
            `${tool.name}: serverOnlyFields nennt ${name}. response_format ist der einzige erlaubte Name (Plan 4.3).`,
          );
        }
      }
      if (tool.serverOnlyFields.length > 0 && !readingToolNames.has(tool.name)) {
        problems.push(
          `${tool.name}: serverOnlyFields an einem schreibenden Werkzeug. response_format steuert die Projektion einer Antwort (Plan 4.3, 7.4).`,
        );
      }
      for (const name of tool.serverOnlyFields) {
        if (!tool.fields.some((field) => field.name === name && field.source === "server")) {
          problems.push(
            `${tool.name}: serverOnlyFields nennt ${name}, es gibt aber kein Feld dieses Namens mit source "server".`,
          );
        }
      }
      // response_format steht bei JEDEM lesenden Werkzeug (Plan 7.4). /postings/get liefert
      // rund 38 Felder je Buchung; eine Seite mit 100 Buchungen im Rohformat ist ein
      // Kontextfresser ersten Ranges.
      if (readingToolNames.has(tool.name) && !tool.serverOnlyFields.includes("response_format")) {
        problems.push(
          `${tool.name}: lesendes Werkzeug ohne serverseitiges Feld response_format (Plan 7.4).`,
        );
      }
    }

    expectNoIssues(problems);
  });
});
