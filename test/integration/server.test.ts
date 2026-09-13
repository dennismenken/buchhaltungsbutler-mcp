// Der Integrationstest aus Plan 9.6 (AP16).
//
// Geprüft wird der **gebaute** Server als Unterprozess, nicht der Quelltext im selben
// Prozess: Ein `tsc --noEmit` fängt die Importpfad- und Verpackungsfallstricke nicht, und
// genau die sind der Unterschied zwischen „die Tests sind grün" und „der Client startet den
// Server". Ein echter MCP-Client verbindet sich über stdio und führt `initialize`,
// `tools/list` und mindestens einen `tools/call` **je Klasse** aus.
//
// **Kein Aufruf geht an BuchhaltungsButler.** Der Unterprozess bekommt über `BB_BASE_URL`
// einen lokalen Nachbau auf 127.0.0.1, Platzhalter als Zugangsdaten und über `BB_CONFIG_DIR`
// ein leeres Wegwerfverzeichnis, damit keine Zugangsdatendatei des Entwicklerrechners gelesen
// wird. Die Netzsperre aus `test/setup.ts` wirkt nur in diesem Prozess; der Nachbau ist
// deshalb ein echter HTTP-Server auf der Rückschleife und keine Ausnahme von 9.1.
//
// Der zweite Teil prüft die Zusage aus Plan 1.5: **stdout trägt ausschließlich JSON-RPC.**
// Dafür wird der Unterprozess ohne SDK-Client gefahren und jede Zeile seiner Standardausgabe
// einzeln zerlegt. Der SDK-Client verwirft eine unlesbare Zeile still; nur der rohe Blick auf
// den Strom beantwortet die Frage.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BUILT_CLI = join(ROOT, "dist", "cli.js");

/** Die vier Hints, die jeder Eintrag tragen muss (Plan 3.3, P7). */
const REQUIRED_HINTS = [
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
] as const;

/**
 * Platzhalter, niemals echte Zugangsdaten. Der Nachbau prüft sie nicht; sie sind nur da, damit
 * der Server sich als konfiguriert versteht und Guard 1 nicht greift.
 */
const PLACEHOLDER_CREDENTIALS = {
  BB_API_CLIENT: "integrationstest-client",
  BB_API_SECRET: "integrationstest-secret",
  BB_API_KEY: "integrationstest-key",
} as const;

// --- Der lokale Nachbau ----------------------------------------------------------------

interface ApiStandIn {
  readonly baseUrl: string;
  /** Die Pfade, die der Unterprozess angesprochen hat, in Reihenfolge. */
  readonly paths: readonly string[];
  close(): Promise<void>;
}

/**
 * Ein Nachbau der API auf 127.0.0.1.
 *
 * Er antwortet nach der **Umschlagform** des angesprochenen Endpunkts: Listenabrufe bekommen
 * `rows` und ein Array, alles Übrige die Quittungsform. Eine Antwort in der falschen Form
 * würde von `http/envelope.ts` zu Recht als Umschlagbruch abgewiesen; der Nachbau soll den
 * Weg prüfen und nicht den Fehlerzweig.
 */
async function startApiStandIn(): Promise<ApiStandIn> {
  const paths: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = request.url ?? "";
    paths.push(path);
    // Der Körper wird verworfen; geprüft wird hier der Weg, nicht der Inhalt. Er muss
    // trotzdem gelesen werden, sonst bleibt die Verbindung offen.
    request.resume();
    request.on("end", () => {
      // Die Unterscheidung reicht für die sechs Aufrufe dieses Tests: Von ihnen ist allein
      // /receipts/get eine Listenabfrage, alle übrigen quittieren. Käme ein Aufruf hinzu,
      // dessen Form hier falsch geraten würde, meldete http/envelope.ts einen Umschlagbruch —
      // der Test wird dann rot und nicht still falsch.
      const list = path.endsWith("/get");
      const body = list
        ? { success: true, message: "", rows: 0, data: [] }
        : { success: true, message: "", data: [] };
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Der lokale Nachbau hat keinen Port bekommen.");
  }

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}/api/v1`,
    paths,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

// --- Umgebung des Unterprozesses ---------------------------------------------------------

let configDir: string;

/**
 * Die Umgebung des Unterprozesses, ausdrücklich zusammengestellt statt geerbt.
 *
 * `BB_CONFIG_DIR` zeigt auf ein leeres Wegwerfverzeichnis: Sonst läse der Server auf dem
 * Rechner des Entwicklers dessen echte Zugangsdatendatei, und der Test hinge an einer Datei,
 * die in der CI nicht existiert.
 */
function childEnv(baseUrl: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    BB_BASE_URL: baseUrl,
    BB_CONFIG_DIR: configDir,
    BB_MCP_LOG_LEVEL: "error",
    ...PLACEHOLDER_CREDENTIALS,
    ...extra,
  };
}

beforeAll(() => {
  if (!existsSync(BUILT_CLI)) {
    throw new Error(
      "dist/cli.js fehlt. Dieser Test prüft das GEBAUTE Paket (Plan 9.6): zuerst pnpm build " +
        "ausführen (oder, ohne die Generatoren, node_modules/.bin/tsdown), dann den Testlauf.",
    );
  }
  configDir = mkdtempSync(join(tmpdir(), "bbutler-mcp-integration-"));
});

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true });
});

// --- Teil 1: echter Client über stdio ----------------------------------------------------

describe("der gebaute Server über einen echten MCP-Client", () => {
  /** Ein Aufruf je Klasse aus Plan 3.3. Die Argumente sind erfunden und gehen an den Nachbau. */
  const CALLS_BY_CLASS = [
    { toolClass: "R", name: "bb_receipts_search", args: { list_direction: "inbound", limit: 1 } },
    {
      toolClass: "A",
      name: "bb_cost_locations_create",
      args: { code: "int001", name: "Kostenstelle Integrationstest" },
    },
    {
      toolClass: "AR",
      name: "bb_reports_create_bwa",
      args: { date_from: "2026-01-01", date_to: "2026-01-31" },
    },
    {
      toolClass: "M",
      name: "bb_cost_locations_update",
      args: { code: "int001", name: "Kostenstelle Integrationstest, geändert" },
    },
    { toolClass: "D", name: "bb_cost_locations_delete", args: { code: "int001" } },
    {
      toolClass: "B",
      name: "bb_postings_create_free",
      args: {
        date: "2026-01-15",
        postingtext: "Integrationstest",
        amount: "119.00",
        postingaccount_debit: "6815",
        postingaccount_credit: "1600",
        vat: "19_vat",
      },
    },
  ] as const;

  it("beantwortet initialize, meldet genau 54 Werkzeuge mit vier Hints und führt je Klasse einen Aufruf aus", {
    timeout: 60_000,
  }, async () => {
    const api = await startApiStandIn();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BUILT_CLI],
      env: childEnv(api.baseUrl),
      cwd: ROOT,
      stderr: "pipe",
    });
    const client = new Client({ name: "ap16-integrationstest", version: "0.0.0" });

    try {
      // Die Verbindung führt initialize aus; ohne Antwort darauf käme dieser Aufruf nicht
      // zurück. Aus der Antwort wird geprüft, dass sich wirklich dieser Server gemeldet hat
      // und nicht irgendein Prozess, der zufällig auf stdio spricht.
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toContain("buchhaltungsbutler");

      const listed = await client.listTools();

      expect(listed.tools).toHaveLength(54);
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        TOOL_ENTRIES.map((entry) => entry.name).sort(),
      );

      for (const tool of listed.tools) {
        const annotations = tool.annotations;
        expect(annotations, `${tool.name} trägt keine annotations`).toBeDefined();
        for (const hint of REQUIRED_HINTS) {
          expect(
            typeof annotations?.[hint],
            `${tool.name}: Hint ${hint} fehlt oder ist kein Boolean`,
          ).toBe("boolean");
        }
        // Jedes Werkzeug spricht mit einer fremden Buchhaltung; kein Hint darf das leugnen.
        expect(annotations?.openWorldHint, `${tool.name}: openWorldHint`).toBe(true);
        expect(tool.inputSchema, `${tool.name}: inputSchema`).toBeDefined();
        expect(tool.outputSchema, `${tool.name}: outputSchema`).toBeDefined();
      }

      for (const call of CALLS_BY_CLASS) {
        const entry = TOOL_ENTRIES.find((candidate) => candidate.name === call.name);
        expect(entry?.toolClass, `${call.name} hat die erwartete Klasse`).toBe(call.toolClass);

        const result = await client.callTool({ name: call.name, arguments: call.args });
        const text = JSON.stringify(result.content);
        expect(result.isError, `${call.name} scheiterte: ${text}`).toBeFalsy();
        expect(result.structuredContent, `${call.name} ohne structuredContent`).toBeDefined();
      }

      // Jeder der sechs Aufrufe ist wirklich hinausgegangen, und zwar an den Nachbau.
      expect(api.paths).toHaveLength(CALLS_BY_CLASS.length);
      for (const path of api.paths) {
        expect(path.startsWith("/api/v1/")).toBe(true);
      }
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      await api.close();
    }
  });
});

// --- Teil 2: stdout trägt ausschließlich JSON-RPC ----------------------------------------

/** Eine Zeile JSON-RPC, wie sie über stdio geht. */
function rpcLine(payload: Record<string, unknown>): string {
  return `${JSON.stringify(payload)}\n`;
}

interface RawSession {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Fährt den gebauten Server roh, schickt die drei Nachrichten und sammelt beide Ströme.
 *
 * Gewartet wird auf die **Zahl der Antwortzeilen** und nicht auf eine feste Zeitspanne: Eine
 * Wartezeit, die auf einem langsamen Rechner nicht reicht, erzeugt einen Test, der ohne
 * erkennbaren Grund rot wird.
 */
async function runRawSession(baseUrl: string, expectedLines: number): Promise<RawSession> {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [BUILT_CLI], {
    cwd: ROOT,
    env: childEnv(baseUrl),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Der Server hat binnen 20 s nicht ${String(expectedLines)} Zeilen geantwortet. ` +
            `Bisher: ${JSON.stringify(stdout)}`,
        ),
      );
    }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.split("\n").filter((line) => line.trim() !== "").length >= expectedLines) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  child.stdin.write(
    rpcLine({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "ap16-stdout", version: "0.0.0" },
      },
    }),
  );
  child.stdin.write(rpcLine({ jsonrpc: "2.0", method: "notifications/initialized" }));
  child.stdin.write(rpcLine({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
  child.stdin.write(
    rpcLine({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "bb_receipts_search",
        arguments: { list_direction: "inbound", limit: 1 },
      },
    }),
  );

  try {
    await done;
  } finally {
    child.stdin.end();
    child.kill("SIGTERM");
  }
  return { stdout, stderr };
}

describe("die Standardausgabe des Serverprozesses", () => {
  it("trägt ausschließlich gültige JSON-RPC-Zeilen", { timeout: 60_000 }, async () => {
    const api = await startApiStandIn();
    try {
      const session = await runRawSession(api.baseUrl, 3);
      const lines = session.stdout.split("\n").filter((line) => line.trim() !== "");

      expect(lines.length).toBeGreaterThanOrEqual(3);
      for (const line of lines) {
        let parsed: unknown;
        expect(
          () => {
            parsed = JSON.parse(line);
          },
          `Zeile ist kein JSON: ${line.slice(0, 200)}`,
        ).not.toThrow();
        const message = parsed as Record<string, unknown>;
        expect(message.jsonrpc, `Zeile ohne jsonrpc 2.0: ${line.slice(0, 200)}`).toBe("2.0");
      }

      // Die Audit-Zeile aus 1.4 Schritt 14 belegt, dass der Server während dieser Sitzung
      // sehr wohl geschrieben hat — nur eben nach stderr.
      expect(session.stderr).toContain("audit ");
      expect(session.stderr).toContain("werkzeug=bb_receipts_search");
      expect(session.stdout).not.toContain("audit ");
    } finally {
      await api.close();
    }
  });
});
