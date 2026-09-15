// Integrationstest: Der gebaute Server startet so, wie Claude Desktop ein .mcpb-Bundle startet.
//
// Der Anlass: Am 2026-09-15 beendete sich der Server nach der Installation des Bundles in Claude
// Desktop rund 110 Millisekunden nach dem Start. Claude Desktop ersetzt `${user_config.<feld>}`
// nur für Felder mit einem Wert oder einer Vorgabe im Manifest. Das optionale Feld
// „Werkzeuggruppen" hatte keine Vorgabe und war leer gelassen, der Platzhalter kam wörtlich an
// und galt als unbekannter Gruppenname, und der Server brach beim Start ab. Kein Test hatte den
// Weg über den Bundle-Host je nachgestellt.
//
// Die Ersetzung stammt hier aus `getMcpConfigForManifest` von `@anthropic-ai/mcpb`, derselben
// Referenzimplementierung, die das Verhalten belegt. Geprüft werden beide Hälften der
// Behebung: Die Vorlage trägt Vorgaben für jedes optionale Feld, und der Server übersteht einen
// Host, der den Platzhalter trotzdem nicht ersetzt.
//
// Kein Aufruf geht an BuchhaltungsButler: `initialize` ruft die API nicht auf, und `BB_BASE_URL`
// zeigt zusätzlich auf einen Port, an dem nichts lauscht.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getMcpConfigForManifest, VERSIONED_MANIFEST_SCHEMAS } from "@anthropic-ai/mcpb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BUILT_CLI = join(ROOT, "dist", "cli.js");
const TEMPLATE = join(ROOT, ".mcpb", "manifest.template.json");

/** Nur die drei Pflichtfelder, so wie ein Nutzer, der alles Optionale leer lässt. */
const REQUIRED_ONLY = {
  api_client: "testclient",
  api_secret: "testsecret",
  api_key: "testschluessel-ohne-bedeutung",
};

let home = "";

/**
 * Die Umgebung, die der Bundle-Host aus der Vorlage erzeugt. Die Vorlage wird dabei gegen das
 * Manifestschema von `@anthropic-ai/mcpb` gelesen; eine ungültige Vorlage scheitert hier und
 * nicht erst beim Nutzer.
 */
async function hostEnv(): Promise<Record<string, string>> {
  const raw: unknown = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  const manifest = VERSIONED_MANIFEST_SCHEMAS["0.4"].parse(raw);
  const config = await getMcpConfigForManifest({
    manifest,
    extensionPath: "/erweiterung",
    systemDirs: {},
    userConfig: REQUIRED_ONLY,
    pathSeparator: "/",
  });
  if (config === undefined) {
    throw new Error("Der Host erzeugt aus der Vorlage keine Serverkonfiguration.");
  }
  return config.env ?? {};
}

beforeAll(() => {
  if (!existsSync(BUILT_CLI)) {
    throw new Error(
      "dist/cli.js fehlt. Dieser Test prüft das GEBAUTE Paket: zuerst pnpm build ausführen.",
    );
  }
  home = mkdtempSync(join(tmpdir(), "bb-mcpb-host-"));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

interface StartResult {
  readonly exitCode: number | null;
  readonly initialized: boolean;
  readonly stderr: string;
}

/** Startet den gebauten Server mit der gegebenen Umgebung und schickt ein initialize. */
function startWithEnv(env: Record<string, string>): Promise<StartResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUILT_CLI], {
      env: {
        HOME: home,
        PATH: process.env["PATH"] ?? "",
        BB_CONFIG_DIR: join(home, "config"),
        BB_BASE_URL: "http://127.0.0.1:9/api/v1",
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: StartResult): void => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve(result);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.includes('"id":0') && stdout.includes('"serverInfo"')) {
        finish({ exitCode: null, initialized: true, stderr });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      finish({ exitCode: code, initialized: false, stderr });
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "bundle-host-test", version: "1" },
        },
      })}\n`,
    );
    setTimeout(() => {
      finish({ exitCode: null, initialized: false, stderr });
    }, 15_000);
  });
}

describe("der Server hinter einem .mcpb-Host", () => {
  it("setzt jeden Platzhalter der Vorlage ein, wenn nur die Pflichtfelder ausgefüllt sind", async () => {
    const leftovers = Object.entries(await hostEnv()).filter(([, value]) =>
      value.includes("${user_config."),
    );
    expect(leftovers, "Diese Variablen trügen den Platzhalter wörtlich in den Server.").toEqual([]);
  });

  it("startet mit der so erzeugten Umgebung und beantwortet initialize", {
    timeout: 30_000,
  }, async () => {
    const result = await startWithEnv(await hostEnv());
    expect(result.exitCode, result.stderr).toBeNull();
    expect(result.initialized, result.stderr).toBe(true);
  });

  it("übersteht einen Host, der die Platzhalter optionaler Felder nicht ersetzt", {
    timeout: 30_000,
  }, async () => {
    const result = await startWithEnv({
      BB_API_CLIENT: REQUIRED_ONLY.api_client,
      BB_API_SECRET: REQUIRED_ONLY.api_secret,
      BB_API_KEY: REQUIRED_ONLY.api_key,
      BB_MCP_READ_ONLY: "${user_config.read_only}",
      BB_MCP_TOOL_GROUPS: "${user_config.tool_groups}",
    });

    expect(result.exitCode, result.stderr).toBeNull();
    expect(result.initialized, result.stderr).toBe(true);
    expect(result.stderr).toContain("nicht ersetzten Platzhalter");
  });
});
