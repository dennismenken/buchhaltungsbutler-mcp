// Vertragstest aus Plan 9.3: **der optionale Nur-Lesen-Schalter** (Plan 6.6).
//
// Geprüft werden vier Zusagen, und jede einzelne ist eine, an der ein Nutzer den Server misst,
// der ihn ausdrücklich eingeschränkt hat:
//
//  1. Mit `BB_MCP_READ_ONLY=true` lehnt **jedes** der 39 schreibenden Werkzeuge ab, und zwar
//     **bevor** ein Request abgeht. Nachgewiesen wird das nicht am Text allein, sondern am
//     MockAgent: Er darf keinen einzigen Aufruf sehen. Die Absage nennt die Variable mit ihrem
//     Zielwert.
//  2. Die **15 lesenden** Werkzeuge laufen dabei weiter.
//  3. **Die Werkzeugliste ist in beiden Läufen identisch** — Namen, Annotationen und Schemata.
//     Ein Agent, der ein Werkzeug nicht sieht, schließt auf eine fehlende Fähigkeit und sucht
//     Umwege; ein Agent, der eine klare Absage liest, kann sie dem Nutzer erklären (6.6).
//  4. Die Berichtszeile: Mit Schalter antworten die drei `bb_reports_get_*` weiter, die beiden
//     `bb_reports_create_*` sagen ab, und die `instructions` nennen die Einschränkung.
//
// **Zur zweiten Hälfte von 9.3 („ohne die Variable führen dieselben 39 aus").** Sie wird hier
// über den Schalter selbst geprüft: Ohne die Variable meldet der Server für alle 54 Einträge
// `blockedByReadOnly: false`, kein einziger der 39 Aufrufe endet in der Absage aus 6.6, und
// fünf Werkzeuge — eines je schreibender Klasse — laufen vollständig bis zur Antwort durch.
// **Dass alle 39 ohne den Schalter wirklich bis zur HTTP-Schicht kommen, belegt
// `test/contract/no-write-retry.test.ts`**, das ohne `BB_MCP_READ_ONLY` läuft und für jedes
// der 39 einen Request am MockAgent nachzählt. Diese Datei wiederholt das nicht; zwei Tests
// mit derselben Aussage sind kein doppelter Nachweis, sondern doppelte Pflege.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { STATE_NOTHING_SENT } from "../../src/errors/render.js";
import { READ_ONLY_VAR } from "../../src/guards/read-only.js";
import { resetRateLimiterForTests } from "../../src/http/rate-limiter.js";
import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { createServer } from "../../src/server/create-server.js";
import type { RegisteredToolInfo } from "../../src/server/register-tools.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

const WRITE_ENTRIES = TOOL_ENTRIES.filter((entry) => entry.toolClass !== "R");
const READ_ENTRIES = TOOL_ENTRIES.filter((entry) => entry.toolClass === "R");

/**
 * Die Argumente der 15 lesenden Werkzeuge, von Hand und vollständig.
 *
 * Sie stehen hier ausgeschrieben, weil dieser Test genau **diese** 15 meint: Eine erzeugte
 * Liste würde stillschweigend kleiner, wenn ein Werkzeug aus dem Register fiele. Der Abgleich
 * unten stellt sicher, dass die Tabelle und das Register dieselben Namen führen.
 */
const READ_ARGUMENTS: Readonly<Record<string, Record<string, unknown>>> = {
  bb_cost_locations_search: {},
  bb_creditors_search: {},
  bb_debtors_search: {},
  bb_payment_accounts_list: {},
  bb_postingaccounts_search: {},
  bb_postings_search: { date_from: "2026-01-01", date_to: "2026-01-31" },
  bb_receipts_get: { receipt_id_by_customer: 4711 },
  bb_receipts_list_transactions: { receipt_id_by_customer: 4711 },
  bb_receipts_search: { list_direction: "inbound" },
  bb_reports_get_bwa: { report_id_by_customer: 12 },
  bb_reports_get_ledger: {
    postingaccount_number: 1600,
    date_from: "2026-01-01",
    date_to: "2026-01-31",
  },
  bb_reports_get_sums: { report_id_by_customer: 12 },
  bb_transactions_get: { transaction_id_by_customer: 815 },
  bb_transactions_list_receipts: { transaction_id_by_customer: 815 },
  bb_transactions_search: {},
};

/**
 * Ein vollständiger schreibender Aufruf je Klasse (A, AR, M, D, B).
 *
 * Fünf Aufrufe und nicht 39: Die vollständige Durchsicht aller 39 ohne Schalter steht in
 * `no-write-retry.test.ts` (siehe Dateikopf). Hier geht es um die Frage, ob ohne den Schalter
 * wirklich **ausgeführt** und nicht nur „nicht gesperrt" wird, und dafür ist je Klasse ein
 * Beleg der richtige Zuschnitt.
 */
const WRITE_SAMPLES: readonly {
  readonly name: string;
  readonly args: Record<string, unknown>;
}[] = [
  { name: "bb_cost_locations_create", args: { code: "ro0001", name: "Kostenstelle Test" } },
  { name: "bb_reports_create_bwa", args: { date_from: "2026-01-01", date_to: "2026-01-31" } },
  {
    name: "bb_cost_locations_update",
    args: { code: "ro0001", name: "Kostenstelle Test, geändert" },
  },
  { name: "bb_cost_locations_delete", args: { code: "ro0001" } },
  {
    name: "bb_postings_create_free",
    args: {
      date: "2026-01-15",
      postingtext: "Vertragstest",
      amount: "119.00",
      postingaccount_debit: "6815",
      postingaccount_credit: "1600",
      vat: "19_vat",
    },
  },
];

// --- Aufbau -----------------------------------------------------------------------------

interface RunningTestServer {
  readonly client: Client;
  readonly tools: readonly RegisteredToolInfo[];
  readonly instructions: string;
  close(): Promise<void>;
}

async function startServer(config: ResolvedConfig): Promise<RunningTestServer> {
  const built = createServer({
    config,
    entries: TOOL_ENTRIES,
    store: createMasterDataStore({ ttlMs: config.cacheTtlMs }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ap16-read-only", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    tools: built.tools,
    instructions: built.instructions,
    close: async () => {
      await client.close();
      await built.server.close();
    },
  };
}

/** Die Antwort der Nachbildung, passend zur erwarteten Umschlagform des Eintrags (5.5). */
function successReply(entry: ToolEntry): { status: number; json: Record<string, unknown> } {
  const body: Record<string, unknown> =
    entry.shape === "list"
      ? { success: true, message: "", rows: 0, data: [] }
      : entry.shape === "object"
        ? { success: true, message: "", data: {} }
        : { success: true, message: "", data: [] };
  return { status: 200, json: body };
}

/** Der Pfad, an dem der Request erwartet wird; bei Pfadvorlagen der interpolierte (4.6). */
function expectedPath(entry: ToolEntry, args: Readonly<Record<string, unknown>>): string {
  if ("literal" in entry.path) {
    return entry.path.literal;
  }
  let path = entry.path.template;
  for (const param of entry.path.params) {
    path = path.replace(`{${param}}`, encodeURIComponent(String(args[param])));
  }
  return path;
}

function textOf(result: { content?: unknown }): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks
    .map((block) =>
      typeof block === "object" && block !== null && "text" in block
        ? String((block as { text: unknown }).text)
        : "",
    )
    .join("\n");
}

/** Die Werkzeugliste, wie ein Client sie sieht, als vergleichbarer Text. */
async function listedTools(client: Client): Promise<string> {
  const listed = await client.listTools();
  return JSON.stringify(
    [...listed.tools].sort((a, b) => (a.name < b.name ? -1 : 1)),
    null,
    0,
  );
}

let api: ApiMock | null = null;

afterEach(() => {
  api?.close();
  api = null;
  resetTestConfig();
});

// --- Mit Schalter -------------------------------------------------------------------------

describe(`mit ${READ_ONLY_VAR}=true`, () => {
  it("lehnen alle 39 schreibenden Werkzeuge ab, ohne dass ein Request abgeht", async () => {
    expect(WRITE_ENTRIES).toHaveLength(39);
    const config = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    api = mockApi();
    const server = await startServer(config);

    try {
      for (const entry of WRITE_ENTRIES) {
        // Die Argumente sind hier bewusst leer: Guard 2 läuft vor Guard 3 (Plan 1.4), und
        // genau das soll die Absage belegen. Käme stattdessen eine Schemameldung, stünde der
        // Schalter an der falschen Stelle der Kette.
        const result = await server.client.callTool({ name: entry.name, arguments: {} });
        const text = textOf(result);

        expect(result.isError, `${entry.name} meldete keinen Fehler`).toBe(true);
        expect(text).toContain(`${entry.name} ist gesperrt`);
        expect(text).toContain(`${READ_ONLY_VAR}=true`);
        expect(text).toContain(STATE_NOTHING_SENT);
        expect(text).toContain("Keine anderen Werkzeuge dieses Servers ausprobieren");
        expect(text, `${entry.name}: die Absage kam aus einem späteren Guard`).not.toContain(
          "Eingabeschema",
        );
      }

      // Der eigentliche Beweis: Es ging nichts hinaus. Ein Text allein belegt das nicht.
      expect(api.count(), "Bei aktivem Nur-Lesen-Schalter ging ein Request hinaus").toBe(0);

      // Dieselbe Aussage noch einmal aus der Sicht des Servers, über alle 54 Einträge.
      const blocked = server.tools
        .filter((tool) => tool.blockedByReadOnly)
        .map((tool) => tool.name);
      expect(blocked.sort()).toEqual(WRITE_ENTRIES.map((entry) => entry.name).sort());
    } finally {
      await server.close();
    }
  }, 30_000);

  it("führen die 15 lesenden Werkzeuge weiter aus", async () => {
    expect(Object.keys(READ_ARGUMENTS).sort()).toEqual(READ_ENTRIES.map((e) => e.name).sort());

    const config = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    api = mockApi();
    const server = await startServer(config);

    try {
      for (const entry of READ_ENTRIES) {
        // Berichts- und Stapeleimer führen ein Token je 10 beziehungsweise 5 Sekunden
        // (Plan 5.4). Der Limiter hat seinen eigenen Test; hier soll er nicht die Laufzeit
        // bestimmen.
        resetRateLimiterForTests();
        const args = READ_ARGUMENTS[entry.name] ?? {};
        const path = expectedPath(entry, args);
        api.post(path, successReply(entry));

        const result = await server.client.callTool({ name: entry.name, arguments: args });
        const text = textOf(result);

        expect(result.isError, `${entry.name} scheiterte: ${text}`).toBeFalsy();
        expect(api.count(path), `${entry.name} hat ${path} nicht angesprochen`).toBe(1);
      }
    } finally {
      await server.close();
    }
  }, 30_000);

  it("nennen die instructions die Einschränkung und den Weg zur Auswertung", async () => {
    const config = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    const server = await startServer(config);

    try {
      expect(server.instructions).toContain(`${READ_ONLY_VAR}=true`);
      // Die Einschränkung selbst, nicht ihre Zahlen: Wie viele Werkzeuge lesend sind, rechnet
      // der Servertext aus beiden Registern, und `test/unit/server-instructions.test.ts` hält
      // das Ergebnis gegen `tools/list` desselben Starts. Eine zweite, hier gepflegte Zahl
      // wäre genau die Stelle, die beim nächsten Werkzeug wieder altert.
      expect(server.instructions).toContain("Nur die lesenden laufen");
      // Die Folge aus 6.6: BWA und Summen- und Saldenliste brauchen den gesperrten ersten
      // Schritt; ohne Neustart bleibt nur das Hauptbuch.
      expect(server.instructions).toContain("bb_reports_get_ledger");
    } finally {
      await server.close();
    }
  });

  it("antworten die drei lesenden Berichtswerkzeuge, die beiden erzeugenden sagen ab", async () => {
    const config = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    api = mockApi();
    const server = await startServer(config);

    try {
      for (const name of ["bb_reports_get_bwa", "bb_reports_get_sums", "bb_reports_get_ledger"]) {
        resetRateLimiterForTests();
        const entry = TOOL_ENTRIES.find((candidate) => candidate.name === name);
        expect(entry, `${name} fehlt im Register`).toBeDefined();
        const args = READ_ARGUMENTS[name] ?? {};
        api.post(expectedPath(entry as ToolEntry, args), successReply(entry as ToolEntry));

        const result = await server.client.callTool({ name, arguments: args });
        expect(result.isError, `${name} scheiterte: ${textOf(result)}`).toBeFalsy();
      }

      // Sie ändern keinen Buchungsbestand, ersetzen aber den Vorgängerbericht. Ein Server mit
      // ausdrücklichem Schreibverbot, der fremde Berichte überschreibt, bricht seine Zusage
      // (Plan 6.6).
      for (const name of ["bb_reports_create_bwa", "bb_reports_create_sums"]) {
        const result = await server.client.callTool({
          name,
          arguments: { date_from: "2026-01-01", date_to: "2026-01-31" },
        });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain(`${name} ist gesperrt`);
      }
    } finally {
      await server.close();
    }
  }, 30_000);
});

// --- Ohne Schalter --------------------------------------------------------------------------

describe(`ohne ${READ_ONLY_VAR}`, () => {
  it("sperrt der Schalter kein einziges der 54 Werkzeuge", async () => {
    const config = installTestConfig();
    api = mockApi();
    const server = await startServer(config);

    try {
      expect(server.tools).toHaveLength(54);
      expect(server.tools.filter((tool) => tool.blockedByReadOnly)).toEqual([]);

      for (const entry of WRITE_ENTRIES) {
        const result = await server.client.callTool({ name: entry.name, arguments: {} });
        const text = textOf(result);
        // Ohne Schalter darf die Absage aus 6.6 an keinem der 39 auftauchen. Was hier
        // stattdessen kommt, ist die Schemameldung aus Guard 3 — also ein **späterer**
        // Schritt der Kette, den der Schalter vorher abgefangen hätte.
        expect(text, `${entry.name} wurde ohne Schalter gesperrt`).not.toContain("ist gesperrt");
        expect(text, `${entry.name} wurde ohne Schalter gesperrt`).not.toContain(READ_ONLY_VAR);
      }
    } finally {
      await server.close();
    }
  }, 30_000);

  it("laufen die schreibenden Werkzeuge durch, je Klasse eines vollständig", async () => {
    const config = installTestConfig();
    api = mockApi();
    const server = await startServer(config);

    try {
      const seenClasses = new Set<string>();
      for (const sample of WRITE_SAMPLES) {
        resetRateLimiterForTests();
        const entry = TOOL_ENTRIES.find((candidate) => candidate.name === sample.name);
        expect(entry, `${sample.name} fehlt im Register`).toBeDefined();
        const concrete = entry as ToolEntry;
        seenClasses.add(concrete.toolClass);

        const path = expectedPath(concrete, sample.args);
        api.post(path, successReply(concrete));

        const result = await server.client.callTool({ name: sample.name, arguments: sample.args });

        expect(result.isError, `${sample.name} scheiterte: ${textOf(result)}`).toBeFalsy();
        expect(api.count(path), `${sample.name} hat ${path} nicht angesprochen`).toBe(1);
      }

      // Je eine Probe aus jeder der fünf schreibenden Klassen.
      expect([...seenClasses].sort()).toEqual(["A", "AR", "B", "D", "M"]);
    } finally {
      await server.close();
    }
  }, 30_000);
});

// --- Die Werkzeugliste ----------------------------------------------------------------------

describe("die Werkzeugliste", () => {
  it("ist mit und ohne Schalter Zeichen für Zeichen dieselbe", async () => {
    const serverWithFlag = await startServer(installTestConfig({ BB_MCP_READ_ONLY: "true" }));
    let listWithFlag: string;
    try {
      listWithFlag = await listedTools(serverWithFlag.client);
    } finally {
      await serverWithFlag.close();
    }
    resetTestConfig();

    const serverWithoutFlag = await startServer(installTestConfig());
    let listWithoutFlag: string;
    try {
      listWithoutFlag = await listedTools(serverWithoutFlag.client);
    } finally {
      await serverWithoutFlag.close();
    }

    // 54 Endpunktwerkzeuge plus die Bündelwerkzeuge der Gruppe `bundles` (N1: die 54 bleiben
    // unverändert bestehen, die Bündel kommen hinzu). Auch das anlegende Bündel steht in der
    // Liste: Gesperrt ist nicht versteckt.
    expect(JSON.parse(listWithFlag)).toHaveLength(TOOL_ENTRIES.length + BUNDLE_ENTRIES.length);
    // Namen, Beschreibungen, Annotationen und beide Schemata: Die Liste hängt an keinem
    // Schalter und ist über die gesamte Verbindung stabil (Plan 1.5, 6.6).
    expect(listWithFlag).toBe(listWithoutFlag);
  }, 30_000);
});
