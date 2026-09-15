// `bb_reports_run`: das einzige schreibende Bündel.
//
// **Der gesamte schreibende Pfad wird ausschließlich gegen die Nachbildung geprüft.**
// `/reports/create/bwa` und `/reports/create/sums` erzeugen serverseitig einen Bericht und
// ERSETZEN den zuvor erzeugten desselben Typs; ein Testlauf gegen die echte Buchhaltung wäre
// ein Datenverlust im Mandanten des Projektinhabers. `test/setup.ts` sperrt das Netz
// zusätzlich (`disableNetConnect`), und die Basis-URL des Testlaufs zeigt auf einen nicht
// auflösbaren Namen.
//
// Geprüft wird, was an diesem Bündel schiefgehen kann und teuer wäre:
//
//   1. Der Erfolgsfall trägt `bundle.written` — auch dann, wenn alles geklappt hat.
//   2. Die Warteschleife hält `error_code` 8 aus und setzt dabei genau EIN `create` ab.
//   3. Das Zeitlimit ist ein **Erfolg** mit `complete` = false, Kennung, Lücke und Anschluss —
//      und kein Fehlschlag, denn der vorherige Bericht ist weg.
//   4. `error_code` 12 führt zu keinem zweiten `create`, und der Text sagt wörtlich, dass
//      nichts erzeugt und nichts ersetzt wurde.
//   5. `error_code` 7 in der Warteschleife beendet den Lauf sofort, ohne erneutes Anlegen.
//   6. Der Nur-Lesen-Schalter sperrt das Werkzeug, bevor irgendetwas hinausgeht.
//   7. `base` bei `report_type` 'bwa' und ein vertauschter Zeitraum werden vor dem ersten
//      Request abgelehnt.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { STATE_NOTHING_SENT, STATE_REJECTED, STATE_UNKNOWN } from "../../src/errors/render.js";
import { READ_ONLY_VAR } from "../../src/guards/read-only.js";
import { RateLimiter, type RateLimiterClock } from "../../src/http/rate-limiter.js";
import { SERVER_NAME } from "../../src/cli/clients/types.js";
import { BundleRunner } from "../../src/bundles/runtime.js";
import type { BundleArguments, BundleOutcome } from "../../src/bundles/types.js";
import {
  bb_reports_run,
  MAX_POLL_ATTEMPTS,
  qualityWarning,
  readReportId,
  resetCreationLocksForTests,
  shortenReport,
  WAIT_PLAN_SECONDS,
  writtenSentence,
} from "../../src/bundles/tools/bb_reports_run.js";
import { DESCRIPTION_CHAR_BUDGET_BY_TIER } from "../../src/registry/budget.js";
import { MANDATORY_SENTENCES } from "../../src/registry/mandatory-sentences.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

const CREATE_BWA = "/reports/create/bwa";
const GET_BWA = "/reports/get/bwa";
const CREATE_SUMS = "/reports/create/sums";
const GET_SUMS = "/reports/get/sums";

/** Eine Antwort der API auf ein erfolgreiches Anlegen. `id_by_customer` kommt als String. */
function createdReply(id: string): { status: number; json: Record<string, unknown> } {
  return { status: 200, json: { success: true, message: "", id_by_customer: id } };
}

/** Eine Fehlerantwort der API, HTTP 400 mit `error_code`. */
function apiError(
  code: number,
  message: string,
): { status: number; json: Record<string, unknown> } {
  return { status: 400, json: { success: false, error_code: code, message } };
}

/**
 * Ein fertiger BWA-Bericht in der gemessenen Form (Befund L7 in docs/api/live-befunde.md), hier
 * ohne Gruppen: Gruppen und Ergebniszeilen sind Objekte, nicht Listen.
 */
function bwaReport(overrides: Record<string, unknown> = {}): {
  status: number;
  json: Record<string, unknown>;
} {
  return {
    status: 200,
    json: {
      success: true,
      message: "",
      report: {
        integrityError: false,
        standardChart: "skr03",
        postingsRecordsCount: 42,
        uncompletedPostingsCount: 0,
        groups: {},
        totals: {},
        ...overrides,
      },
    },
  };
}

/**
 * Eine Uhr, die nicht wartet, sondern mitzählt.
 *
 * Eine Warteschleife, die im Test wirklich bis zu 240 Sekunden schliefe, wäre nicht prüfbar.
 * Gezählt wird trotzdem: Die Summe der Wartezeiten ist eine Zusage dieses Bündels.
 */
function countingClock(): RateLimiterClock & { readonly waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    now: () => 0,
    sleep: async (ms: number) => {
      waits.push(ms);
      await Promise.resolve();
    },
  };
}

interface RunOutput {
  readonly outcome: BundleOutcome;
  readonly runner: BundleRunner;
  readonly block: Record<string, unknown>;
  readonly waits: readonly number[];
}

/** Führt den Ablauf mit gesteuerter Uhr aus, ohne den MCP-Server dazwischen. */
async function runBundle(config: ResolvedConfig, args: BundleArguments): Promise<RunOutput> {
  const clock = countingClock();
  const runner = new BundleRunner({
    entry: bb_reports_run,
    config,
    signal: new AbortController().signal,
    projection: "concise",
    args,
    limiter: new RateLimiter({ ratePerMinute: config.rateLimitPerMinute }),
    clock,
    now: () => 0,
  });
  const outcome = await bb_reports_run.run(runner, args);
  return { outcome, runner, block: runner.bundleBlock(), waits: clock.waits };
}

function dataOf(outcome: BundleOutcome): Record<string, unknown> {
  if (outcome.kind !== "ok") {
    throw new Error(`Erwartet wurde ein Erfolg, geliefert wurde: ${outcome.text}`);
  }
  return outcome.data;
}

function textOf(outcome: BundleOutcome): string {
  return outcome.kind === "ok" ? outcome.lines.join("\n\n") : outcome.text;
}

function blockValue<T>(block: Record<string, unknown>, key: string): T {
  return block[key] as T;
}

let api: ApiMock | undefined;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api?.close();
  api = undefined;
  resetCreationLocksForTests();
  resetTestConfig();
});

// --- Der Erfolgsfall ----------------------------------------------------------------------

describe("bb_reports_run im Erfolgsfall", () => {
  it("legt einmal an, holt einmal ab und sagt trotzdem, dass ersetzt wurde", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("123"));
    api?.post(GET_BWA, bwaReport());

    const { outcome, block, waits } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-03-31",
    });

    expect(api?.count(CREATE_BWA)).toBe(1);
    expect(api?.count(GET_BWA)).toBe(1);
    expect(waits).toEqual([]);

    const data = dataOf(outcome);
    expect(data.status).toBe("done");
    expect(data.report_type).toBe("bwa");
    // Ausgehend immer String, obwohl der Abholendpunkt eine Ganzzahl verlangt.
    expect(data.report_id_by_customer).toBe("123");
    expect(data.attempts).toBe(1);
    expect(data.integrity_error).toBe(false);
    expect(data.uncompletedPostingsCount).toBe(0);

    // Der Kern dieses Werkzeugs: Auch der Erfolg sagt, dass der Vorgänger weg ist.
    expect(block.written).toBe(writtenSentence("bwa"));
    expect(blockValue<boolean>(block, "complete")).toBe(true);
    expect(block.stopped_because).toBeNull();
    expect(block.api_calls).toBe(2);
    expect(blockValue<unknown[]>(block, "gaps")).toHaveLength(0);
    expect(textOf(outcome)).toContain("der zuvor erzeugte Bericht desselben Typs ist ersetzt");
  });

  it("zeigt die BWA in der Kurzform als Tabelle bis auf die Konten", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("124"));
    api?.post(
      GET_BWA,
      bwaReport({
        groups: {
          Gesamtkosten: {
            groupName: "Gesamtkosten",
            groupDisplayName: "Gesamtkosten",
            empty: false,
            amountsSum: 400,
            classes: {
              Raumkosten: {
                className: "Raumkosten",
                classDisplayName: "Raumkosten",
                empty: false,
                amountsSum: 400,
                postingaccounts: { "4210": { name: "Miete", amountsSum: 400 } },
              },
            },
          },
        },
        totals: {
          Ergebnis: {
            totalName: "Ergebnis",
            totalDisplayName: "Ergebnis",
            amountsSum: -400,
            after: null,
          },
        },
      }),
    );

    const { outcome } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2024-01-01",
      date_to: "2024-12-31",
    });

    const text = textOf(outcome);
    expect(text).toContain("| level | group | class | postingaccount_number | name | amountsSum |");
    expect(text).toContain("| account | Gesamtkosten | Raumkosten | 4210 | Miete | 400 |");
    expect(text).toContain("| total |");
    // Die Übersicht der obersten Ebene ist durch die Tabelle ersetzt, nicht ergänzt.
    expect(text).not.toContain("Objekt mit");
  });

  it("schickt den Zeitraum und base an /reports/create/sums", async () => {
    const config = installTestConfig();
    api?.post(CREATE_SUMS, createdReply("7"));
    api?.post(GET_SUMS, {
      status: 200,
      json: { success: true, message: "", report: { integrityError: false, sums: {} } },
    });

    const { outcome } = await runBundle(config, {
      report_type: "sums",
      date_from: "2026-01-01",
      date_to: "2026-12-31",
      base: "date_delivery_else_date",
    });

    const request = await (api as ApiMock).lastRequest(CREATE_SUMS);
    expect(request.body.date_from).toBe("2026-01-01");
    expect(request.body.date_to).toBe("2026-12-31");
    expect(request.body.base).toBe("date_delivery_else_date");
    // Dateien fordert dieses Bündel nie an: Sie kommen base64 und sprengen jede Antwort.
    expect(request.body.file_pdf).toBeUndefined();
    expect(request.body.file_csv).toBeUndefined();
    expect(request.body.archive_export).toBeUndefined();

    const getRequest = await (api as ApiMock).lastRequest(GET_SUMS);
    // Die Kennung geht als Ganzzahl hinaus, obwohl create sie als String geliefert hat.
    expect(getRequest.body.report_id_by_customer).toBe(7);
    expect(getRequest.body.get_files).toBeUndefined();

    expect(dataOf(outcome).status).toBe("done");
  });

  it("stellt eine unbestätigte Buchung als ersten Satz voran", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("5"));
    api?.post(GET_BWA, bwaReport({ uncompletedPostingsCount: 3, integrityError: true }));

    const { outcome } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    const text = textOf(outcome);
    expect(text.startsWith("ACHTUNG:")).toBe(true);
    expect(text).toContain("uncompletedPostingsCount ist 3");
    expect(text).toContain("NICHT das endgültige Ergebnis");
    expect(dataOf(outcome).uncompletedPostingsCount).toBe(3);
    expect(dataOf(outcome).integrity_error).toBe(true);
  });
});

// --- Die Warteschleife --------------------------------------------------------------------

describe("die Warteschleife", () => {
  it("hält error_code 8 aus und legt dabei genau einmal an", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("9"));
    api?.post(GET_BWA, [
      apiError(8, "report generation has not been finished yet"),
      apiError(8, "report generation has not been finished yet"),
      bwaReport(),
    ]);

    const { outcome, block, waits } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(api?.count(CREATE_BWA)).toBe(1);
    expect(api?.count(GET_BWA)).toBe(3);
    // Zwei Wartetakte nach dem Warteplan: 2 s und 4 s.
    expect(waits).toEqual([WAIT_PLAN_SECONDS[0] * 1000, WAIT_PLAN_SECONDS[1] * 1000]);

    const data = dataOf(outcome);
    expect(data.status).toBe("done");
    expect(data.attempts).toBe(3);
    expect(data.wait_ms).toBe(6000);
    expect(blockValue<boolean>(block, "complete")).toBe(true);

    // error_code 8 ist ein Zustand, kein Fehler: Die Schritte stehen als ok in der Liste.
    const steps = blockValue<{ state: string; error?: string }[]>(block, "steps");
    expect(steps).toHaveLength(4);
    expect(steps.every((step) => step.state === "ok")).toBe(true);
    expect(steps[1]?.error).toContain("error_code 8");
  });

  it("meldet das Zeitlimit als Erfolg mit Lücke und Anschluss, nicht als Fehlschlag", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("4711"));
    api?.post(GET_BWA, apiError(8, "report generation has not been finished yet"));

    const { outcome, block, waits } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      max_wait_seconds: 10,
    });

    expect(outcome.kind).toBe("ok");
    expect(api?.count(CREATE_BWA)).toBe(1);
    // Zwei Versuche: der erste sofort, der zweite nach 2 s. Der dritte bräuchte 4 s mehr und
    // risse die zugesagten 10 s nicht — er läuft, der vierte nicht mehr (2+4+7 > 10).
    expect(waits.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(10_000);

    const data = dataOf(outcome);
    expect(data.status).toBe("still_running");
    expect(data.report_id_by_customer).toBe("4711");

    expect(blockValue<boolean>(block, "complete")).toBe(false);
    expect(block.stopped_because).toBe("time_limit");
    expect(block.written).toBe(writtenSentence("bwa"));

    const gaps = blockValue<{ next_step: string; why: string }[]>(block, "gaps");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.next_step).toContain("bb_reports_get_bwa");
    expect(gaps[0]?.next_step).toContain("4711");
    expect(gaps[0]?.why).toContain("Angelegt und damit ersetzt ist der Bericht trotzdem");

    expect(block.continuation).toEqual({
      tool: "bb_reports_get_bwa",
      report_id_by_customer: 4711,
    });
  });

  it("bleibt innerhalb der Aufrufobergrenze von 10", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("1"));
    api?.post(GET_BWA, apiError(8, "report generation has not been finished yet"));

    const { block } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      max_wait_seconds: 240,
    });

    expect(api?.count(CREATE_BWA)).toBe(1);
    expect(api?.count(GET_BWA)).toBe(MAX_POLL_ATTEMPTS);
    expect(block.api_calls).toBe(1 + MAX_POLL_ATTEMPTS);
    expect(block.api_calls).toBeLessThanOrEqual(bb_reports_run.maxCalls);
  });

  it("hört an der Aufrufobergrenze des Betreibers auf und erfindet dafür keinen Grund", async () => {
    // Ein Bündel darf höchstens ein Drittel des Minutenbudgets verbrauchen;
    // BB_MCP_RATE_LIMIT=10 ergibt damit eine wirksame Obergrenze von floor(10/3) = 3
    // Aufrufen: ein Anlegen und zwei Abholversuche.
    const config = installTestConfig({ BB_MCP_RATE_LIMIT: "10" });
    api?.post(CREATE_BWA, createdReply("77"));
    api?.post(GET_BWA, apiError(8, "report generation has not been finished yet"));

    const { outcome, block } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      max_wait_seconds: 240,
    });

    expect(api?.count(CREATE_BWA)).toBe(1);
    expect(api?.count(GET_BWA)).toBe(2);
    expect(block.api_calls).toBe(3);
    expect(block.api_calls_limit).toBe(3);
    expect(block.stopped_because).toBe("page_limit");

    expect(dataOf(outcome).status).toBe("still_running");
    const gaps = blockValue<{ why: string }[]>(block, "gaps");
    // Der letzte Versuch kam nicht zustande; die Antwort behauptet deshalb keine Auskunft
    // der Gegenstelle.
    expect(gaps[0]?.why).toContain("Der letzte Abholversuch kam nicht zustande");
    expect(gaps[0]?.why).not.toContain("meldete zuletzt error_code 8");
  });
});

// --- Die beiden Nebenläufigkeitsfälle -----------------------------------------------------

describe("Nebenläufigkeit", () => {
  it("legt bei error_code 12 nichts an und sagt das wörtlich", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, apiError(12, "report generation already in progress"));

    const { outcome, block } = await runBundle(config, {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(outcome.kind).toBe("error");
    // Genau ein Versuch, kein zweites Anlegen, kein Abholen.
    expect(api?.count(CREATE_BWA)).toBe(1);
    expect(api?.count(GET_BWA)).toBe(0);
    // Nichts geschrieben: `written` bleibt leer.
    expect(block.written).toBe("");

    const text = textOf(outcome);
    expect(text).toContain("Diese Erzeugung stammt NICHT aus diesem Aufruf");
    expect(text).toContain("nichts erzeugt und nichts ersetzt");
    expect(text).toContain("keinesfalls ein zweites Anlegen erzwingen");
    // Die API hat geprüft und abgelehnt; das ist Zustandssatz 2 und nicht Satz 1.
    expect(text).toContain(STATE_REJECTED);
  });

  it("sagt nach HTTP 500 beim Anlegen, dass der Ausgang unbekannt ist", async () => {
    const config = installTestConfig();
    api?.post(CREATE_SUMS, {
      status: 500,
      json: { success: false, error_code: 0, message: "error while processing the request" },
    });

    const { outcome, block } = await runBundle(config, {
      report_type: "sums",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(outcome.kind).toBe("error");
    // Genau ein Versuch: Ein schreibender Aufruf wird nie wiederholt, auch nicht
    // nach einem 5xx. Der Bericht kann trotzdem entstanden sein.
    expect(api?.count(CREATE_SUMS)).toBe(1);
    expect(api?.count(GET_SUMS)).toBe(0);
    expect(textOf(outcome)).toContain(STATE_UNKNOWN);
    expect(block.written).toBe("");
  });

  it("serialisiert zwei gleichzeitige Läufe desselben Typs im selben Prozess", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("100"));
    api?.post(GET_BWA, bwaReport());

    const args = {
      report_type: "bwa",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    } satisfies BundleArguments;
    const [first, second] = await Promise.all([runBundle(config, args), runBundle(config, args)]);

    expect(dataOf(first.outcome).status).toBe("done");
    expect(dataOf(second.outcome).status).toBe("done");

    // Der Nachweis ist die Reihenfolge am Draht: erst anlegen und abholen, dann das zweite
    // Mal. Ohne die Sperre stünden beide create-Aufrufe nebeneinander, und der zweite hätte
    // den Bericht des ersten entwertet, bevor er abgeholt war.
    const order = (await (api as ApiMock).requests()).map((request) => request.endpoint);
    expect(order).toEqual([CREATE_BWA, GET_BWA, CREATE_BWA, GET_BWA]);
  });

  it("bricht bei error_code 7 in der Warteschleife sofort ab, ohne erneut anzulegen", async () => {
    const config = installTestConfig();
    api?.post(CREATE_SUMS, createdReply("50"));
    api?.post(GET_SUMS, [
      apiError(8, "report generation has not been finished yet"),
      apiError(7, "report was not found"),
    ]);

    const { outcome, block } = await runBundle(config, {
      report_type: "sums",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(outcome.kind).toBe("ok");
    expect(api?.count(CREATE_SUMS)).toBe(1);
    expect(api?.count(GET_SUMS)).toBe(2);

    const data = dataOf(outcome);
    expect(data.status).toBe("failed");
    expect(blockValue<boolean>(block, "complete")).toBe(false);
    expect(block.written).toBe(writtenSentence("sums"));

    const gaps = blockValue<{ why: string; next_step: string }[]>(block, "gaps");
    expect(gaps[0]?.why).toContain("error_code 7");
    expect(gaps[0]?.why).toContain("entwertet");
    expect(gaps[0]?.next_step).toContain("bb_reports_get_sums");
  });
});

// --- Die Guards ---------------------------------------------------------------------------

interface RunningTestServer {
  readonly client: Client;
  readonly close: () => Promise<void>;
}

async function startServer(config: ResolvedConfig): Promise<RunningTestServer> {
  // `createServer` registriert die Bündel selbst, sobald die Gruppe `bundles` aktiv ist; ein
  // zweiter Aufruf von `registerBundles` meldete dieselben Namen ein zweites Mal an.
  const built = createServer({
    config,
    store: createMasterDataStore({ ttlMs: config.cacheTtlMs }),
  });
  expect(built.bundles.map((bundle) => bundle.name)).toContain("bb_reports_run");
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "bundle-reports-run", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    close: async () => {
      await client.close();
      await built.server.close();
    },
  };
}

function resultText(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((block) => block.text ?? "").join("\n");
}

describe("die Guards vor dem ersten Request", () => {
  it("sperrt das Werkzeug bei BB_MCP_READ_ONLY=true", async () => {
    const config = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    api?.post(CREATE_BWA, createdReply("1"));
    const server = await startServer(config);

    try {
      const result = await server.client.callTool({
        name: "bb_reports_run",
        arguments: { report_type: "bwa", date_from: "2026-01-01", date_to: "2026-01-31" },
      });
      expect(result.isError).toBe(true);
      const text = resultText(result);
      expect(text).toContain("bb_reports_run ist gesperrt");
      expect(text).toContain(`${READ_ONLY_VAR}=true`);
      expect(text).toContain(STATE_NOTHING_SENT);
      // Der Nachweis, der zählt: Es ging nichts hinaus.
      expect(api?.count(CREATE_BWA)).toBe(0);
    } finally {
      await server.close();
    }
  }, 30_000);

  it("lehnt base bei report_type bwa ab, bevor etwas hinausgeht", async () => {
    const config = installTestConfig();
    api?.post(CREATE_BWA, createdReply("1"));
    const server = await startServer(config);

    try {
      const result = await server.client.callTool({
        name: "bb_reports_run",
        arguments: {
          report_type: "bwa",
          date_from: "2026-01-01",
          date_to: "2026-01-31",
          base: "date",
        },
      });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain("base gilt nur für report_type 'sums'");
      expect(resultText(result)).toContain(STATE_NOTHING_SENT);
      expect(api?.count(CREATE_BWA)).toBe(0);
    } finally {
      await server.close();
    }
  }, 30_000);

  it("lehnt einen vertauschten Zeitraum ab, bevor etwas hinausgeht (Q1)", async () => {
    const config = installTestConfig();
    api?.post(CREATE_SUMS, createdReply("1"));
    const server = await startServer(config);

    try {
      const result = await server.client.callTool({
        name: "bb_reports_run",
        arguments: { report_type: "sums", date_from: "2026-03-31", date_to: "2026-01-01" },
      });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain("date_from");
      expect(api?.count(CREATE_SUMS)).toBe(0);
    } finally {
      await server.close();
    }
  }, 30_000);

  it("meldet das Werkzeug mit den Annotationen der Klasse AR an", async () => {
    const config = installTestConfig();
    const server = await startServer(config);

    try {
      const listed = await server.client.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === "bb_reports_run");
      expect(tool, "bb_reports_run steht nicht in tools/list").toBeDefined();
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.destructiveHint).toBe(true);
      expect(tool?.annotations?.idempotentHint).toBe(false);
      expect(tool?.annotations?.openWorldHint).toBe(true);
    } finally {
      await server.close();
    }
  }, 30_000);
});

// --- Der Registereintrag ------------------------------------------------------------------

describe("der Registereintrag", () => {
  it("trägt den Pflichtsatz U7 wörtlich und nennt die Ersetzung im zweiten Satz", () => {
    expect(bb_reports_run.mandatorySentence).toBe("U7");
    expect(bb_reports_run.description).toContain(MANDATORY_SENTENCES.U7);

    const sentences = bb_reports_run.description.split(". ");
    expect(sentences[1]).toContain("Dabei wird geschrieben");
    expect(sentences[1]).toContain("ersetzt");
    expect(bb_reports_run.description).toContain("im ganzen Mandanten");
    expect(bb_reports_run.description).toContain("zweiter Nutzer verliert damit seinen Bericht");
  });

  it("ist Klasse AR, also die schärfste Klasse seiner Schritte", () => {
    expect(bb_reports_run.toolClass).toBe("AR");
    const classes = bb_reports_run.steps.map((step) => step.toolClass);
    expect(classes).toContain("AR");
    expect(classes).toContain("R");
  });

  it("führt die vier Endpunkte und keine Dateifelder", () => {
    const paths = bb_reports_run.steps.map((step) =>
      "template" in step.path ? step.path.specPath : step.path.literal,
    );
    expect(paths).toEqual([CREATE_BWA, CREATE_SUMS, GET_BWA, GET_SUMS]);

    const fieldNames = bb_reports_run.fields.map((field) => field.name);
    expect(fieldNames).toEqual([
      "report_type",
      "date_from",
      "date_to",
      "base",
      "max_wait_seconds",
      "response_format",
    ]);
    for (const forbidden of ["file_pdf", "file_csv", "archive_export", "get_files"]) {
      expect(fieldNames).not.toContain(forbidden);
    }
  });

  it("bleibt im Beschreibungsbudget seiner Stufe und unter der Namensgrenze", () => {
    expect(bb_reports_run.description.length).toBeLessThanOrEqual(
      DESCRIPTION_CHAR_BUDGET_BY_TIER[bb_reports_run.tier],
    );
    // Clients präfixieren mit `mcp__<SERVER_NAME>__`; die Messages API lässt höchstens
    // 64 Zeichen zu. Die abgeschriebene Länge steht hier absichtlich nicht mehr: Sie wanderte
    // mit dem Servernamen. Vollständig für alle 59 Werkzeuge prüft das
    // test/registry/name-length.test.ts.
    expect(`mcp__${SERVER_NAME}__${bb_reports_run.name}`.length).toBeLessThanOrEqual(64);
    expect(bb_reports_run.searchHint.length).toBeGreaterThan(0);
  });

  it("entnimmt nur das Anlegen aus dem Eimer reports", () => {
    const creates = bb_reports_run.steps.filter((step) => step.bucket === "reports");
    expect(creates.map((step) => step.id)).toEqual(["create_bwa", "create_sums"]);
    const gets = bb_reports_run.steps.filter((step) => step.id.startsWith("get_"));
    expect(gets.every((step) => step.bucket === "default")).toBe(true);
  });
});

// --- Die Hilfsfunktionen ------------------------------------------------------------------

describe("die Hilfsfunktionen", () => {
  it("liest die Kennung als String und als Zahl, sonst null", () => {
    expect(readReportId({ id_by_customer: "123" })).toBe(123);
    expect(readReportId({ id_by_customer: 123 })).toBe(123);
    expect(readReportId({ id_by_customer: "" })).toBeNull();
    expect(readReportId({ id_by_customer: "abc" })).toBeNull();
    expect(readReportId({})).toBeNull();
  });

  it("nennt nicht ermittelte Qualitätsfelder nicht als unauffällig", () => {
    expect(qualityWarning(null, null, null)).toBe("");
    expect(qualityWarning(false, 0, 0)).toBe("");
    expect(qualityWarning(true, null, null)).toContain("integrityError ist true");
    expect(qualityWarning(null, 2, null)).toContain("uncompletedPostingsCount ist 2");
    expect(qualityWarning(null, null, 4)).toContain(
      "countPostingsWithDateVatEffectiveNotConsideredInReport ist 4",
    );
  });

  it("kürzt einen zu großen Bericht sichtbar statt stillschweigend", () => {
    const big = {
      groups: Array.from({ length: 5_000 }, (_, index) => ({ name: `G${String(index)}` })),
    };
    const shortened = shortenReport(big, 100);
    expect(shortened.shortened).toBe(true);
    const value = shortened.value as Record<string, unknown>;
    expect(value._shortened).toBe(true);
    expect(value._top_level_keys).toEqual(["groups"]);

    const small = shortenReport({ a: 1 }, 5_000);
    expect(small.shortened).toBe(false);
    expect(small.value).toEqual({ a: 1 });
  });
});
