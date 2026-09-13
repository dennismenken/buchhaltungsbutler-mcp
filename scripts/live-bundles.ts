// Der lesende Live-Lauf der Bündelwerkzeuge. Aufruf: `node scripts/live-bundles.ts`.
//
// Er ruft die LESENDEN Bündel einmal gegen die echte API auf und zeigt, was sie liefern:
// `bundle.complete`, `bundle.api_calls`, die Schrittliste und die ersten Zeilen des Textblocks.
// Geschäftsdaten werden dabei nicht ausgeschrieben; ausgegeben werden Kennzahlen, Feldnamen und
// die ersten 400 Zeichen des Textblocks.
//
// **Die Grenze dieses Laufs ist seine Substanz.** Er ist wie `scripts/contract-read.ts` eine
// Ausnahme und läuft gegen eine echte, produktive Buchhaltung. Drei Festlegungen
// halten ihn lesend, und jede einzelne wirkt VOR dem ersten Byte:
//
//  1. `BB_MCP_READ_ONLY=true` wird für diesen Lauf erzwungen. Damit ist jedes Bündel, das nicht
//     Klasse R ist, durch Guard 2 gesperrt — `bb_reports_run` läuft hier nie, und
//     `/reports/create/*` wird nicht berührt.
//  2. Jeder Schritt jedes ausgewählten Bündels wird gegen eine Erlaubnisliste gehalten. Steht
//     ein Spezifikationspfad nicht darin, bricht der Lauf ab, bevor er irgendetwas aufruft.
//  3. Ohne Zugangsdaten wird der Lauf übersprungen und endet mit 0. Er ist damit in einer
//     fremden Arbeitskopie kein Fehlschlag, sondern eine Meldung.
//
// **Rückgabewerte:** 0 durchgelaufen oder übersprungen; 1 ein Bündel hat einen Fehler gemeldet;
// 2 der Lauf war nicht durchführbar (Wächter hat geworfen, Aufruf gescheitert).

import { register } from "node:module";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import type { BundleEntry } from "../src/bundles/types.js";

/**
 * Node führt diese Datei direkt aus und entfernt die Typannotationen selbst. Was es NICHT tut:
 * einen Import auf `./x.js` auf die daneben liegende `x.ts` abbilden — genau die Schreibweise,
 * die `verbatimModuleSyntax` im ganzen `src/`-Baum verlangt. Der Haken schließt diese Lücke und
 * wird ausschließlich in {@link main} angemeldet; deshalb steht in dieser Datei kein einziger
 * ausführbarer Import aus `src/`. Wortgleich mit `scripts/contract-read.ts`.
 */
const HOOK_SOURCE = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && specifier.endsWith(".js") && context.parentURL !== undefined) {
    const candidateUrl = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
    if (candidateUrl.protocol === "file:" && existsSync(fileURLToPath(candidateUrl))) {
      return { url: candidateUrl.href, format: "module-typescript", shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
`;

/**
 * Die erlaubten Pfade, abschließend. Sie sind die lesende Freigabe des Projektinhabers für
 * Läufe gegen den Produktivmandanten; `/reports/create/bwa` und `/reports/create/sums` stehen
 * ausdrücklich NICHT darin.
 */
const ALLOWED_PATHS: readonly string[] = [
  "/accounts/get",
  "/cost-locations/get",
  "/settings/get/postingaccounts",
  "/receipts/get",
  "/receipts/get/id_by_customer",
  "/receipts/assigned-transactions/get",
  "/transactions/get",
  "/transactions/get/id_by_customer",
  "/transactions/assigned-receipts/get",
  "/postings/get",
  "/reports/get/sums/ledger",
];

/** Ein Aufruf des Laufs: Werkzeug und Argumente, von Hand und ohne Schreibwirkung. */
interface LiveCall {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly note: string;
}

function specPathOf(entry: BundleEntry, index: number): string {
  const step = entry.steps[index];
  if (step === undefined) {
    return "";
  }
  return "template" in step.path ? step.path.specPath : step.path.literal;
}

/** Wirft, sobald ein Bündel einen Pfad außerhalb der Erlaubnisliste führt. */
function assertReadOnlyPaths(entries: readonly BundleEntry[]): void {
  for (const entry of entries) {
    if (entry.toolClass !== "R") {
      throw new Error(
        `${entry.name} ist Klasse ${entry.toolClass} und gehört nicht in einen lesenden Lauf.`,
      );
    }
    entry.steps.forEach((_step, index) => {
      const path = specPathOf(entry, index);
      if (!ALLOWED_PATHS.includes(path)) {
        throw new Error(
          `${entry.name} führt den Schritt ${path}, und der steht nicht in der Erlaubnisliste ` +
            "dieses Laufs. Abgebrochen, bevor irgendetwas hinausgegangen ist.",
        );
      }
    });
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex === -1 ? null : (argv[onlyIndex + 1] ?? null);

  register(`data:text/javascript,${encodeURIComponent(HOOK_SOURCE)}`);
  const { BUNDLE_ENTRIES } = await import("../src/bundles/index.js");
  const { registerBundles } = await import("../src/bundles/register.js");
  const { initConfig } = await import("../src/config/resolve.js");
  const { SERVER_INFO } = await import("../src/generated/version.js");

  const config = initConfig({
    env: { ...process.env, BB_MCP_READ_ONLY: "true" },
    platform: process.platform,
    homeDir: process.env.HOME ?? "",
    nodeVersion: process.versions.node,
  });
  if (!config.configured) {
    process.stdout.write(
      "Übersprungen: Es sind keine Zugangsdaten gesetzt. Dieser Lauf braucht BB_API_CLIENT, " +
        "BB_API_SECRET und BB_API_KEY und ist ohne sie kein Fehlschlag.\n",
    );
    return 0;
  }

  const readEntries = BUNDLE_ENTRIES.filter((entry) => entry.toolClass === "R");
  assertReadOnlyPaths(readEntries);

  const today = new Date().toISOString().slice(0, 10);
  const calls: readonly LiveCall[] = [
    {
      tool: "bb_masterdata_search",
      args: { query: "paypal", areas: ["payment_accounts", "posting_accounts"] },
      note: "Namenssuche über Zahlungskonten und Kontenrahmen",
    },
    {
      tool: "bb_records_collect",
      args: {
        resource: "receipts",
        list_direction: "inbound",
        payment_status: "unpaid",
        max_rows: 3,
      },
      note: "offene Eingangsbelege, Kennzahlen und drei Zeilen",
    },
    {
      tool: "bb_balances_get",
      args: {
        account: "1200",
        date_from: `${today.slice(0, 4)}-01-01`,
        date_to: today,
        max_rows: 5,
      },
      note: "Kontostand des Kontos 1200 im laufenden Jahr",
    },
  ];

  // bb_assignments_get braucht eine echte Belegnummer. Sie steht bewusst NICHT im Quelltext:
  // Eine Geschäftskennung dieses Mandanten gehört nicht ins Repository. Ohne --receipt bleibt
  // der Schritt aus, und der Lauf sagt das.
  const receiptIndex = argv.indexOf("--receipt");
  const receiptId = receiptIndex === -1 ? null : Number.parseInt(argv[receiptIndex + 1] ?? "", 10);
  const allCalls: LiveCall[] = [...calls];
  if (receiptId !== null && Number.isFinite(receiptId) && receiptId > 0) {
    allCalls.push({
      tool: "bb_assignments_get",
      args: { receipt_id_by_customer: receiptId },
      note: "Beleg samt zugeordneten Zahlungen",
    });
  } else {
    process.stdout.write(
      "\nHinweis: bb_assignments_get bleibt aus. Mit --receipt <id_by_customer> läuft es mit.\n",
    );
  }

  const server = new McpServer(SERVER_INFO, { capabilities: { tools: { listChanged: false } } });
  registerBundles(server, { config, entries: readEntries });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "live-bundles", version: "0.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);

  let failures = 0;
  try {
    for (const call of allCalls) {
      if (only !== null && call.tool !== only) {
        continue;
      }
      process.stdout.write(`\n=== ${call.tool}: ${call.note}\n`);
      const result = await client.callTool({ name: call.tool, arguments: call.args });
      const structured = isRecord(result.structuredContent) ? result.structuredContent : {};
      const bundle = isRecord(structured["bundle"]) ? structured["bundle"] : {};
      if (result.isError === true) {
        failures += 1;
        process.stdout.write(`FEHLER:\n${textOf(result).slice(0, 600)}\n`);
        continue;
      }
      process.stdout.write(
        `complete=${String(bundle["complete"])} ` +
          `stopped_because=${String(bundle["stopped_because"])} ` +
          `api_calls=${String(bundle["api_calls"])}/${String(bundle["api_calls_limit"])} ` +
          `gaps=${String(Array.isArray(bundle["gaps"]) ? bundle["gaps"].length : 0)}\n`,
      );
      const steps = Array.isArray(bundle["steps"]) ? bundle["steps"] : [];
      for (const step of steps) {
        if (!isRecord(step)) continue;
        process.stdout.write(
          `  Schritt ${String(step["no"])}: ${String(step["endpoint"])} ` +
            `${String(step["state"])}, rows=${String(step["rows"])}, ${String(step["duration_ms"])} ms\n`,
        );
      }
      process.stdout.write(`  Textblock (Anfang): ${textOf(result).slice(0, 400)}\n`);
    }
  } finally {
    await client.close();
    await server.close();
  }
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
