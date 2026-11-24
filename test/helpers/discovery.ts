// Der Aufbau eines Discovery-Servers für die Vertragstests des Pakets D1.
//
// Der Server läuft über eine Verbindung im Speicher gegen die HTTP-Nachbildung aus
// `mock-api.ts`: Es geht kein einziger Request hinaus, der nicht zuvor mit `api.post`
// eingerichtet wurde. Die Konfiguration trägt `BB_MCP_TOOL_MODE=discovery`, dazu die
// Platzhalter-Zugangsdaten derselben Nachbildung.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import type { BuiltServer } from "../../src/server/create-server.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, resetTestConfig } from "./mock-api.js";

export interface RunningDiscoveryServer {
  readonly client: Client;
  readonly built: BuiltServer;
  readonly config: ResolvedConfig;
  close(): Promise<void>;
}

/** Meldet den Server im Modus discovery mit dieser Gruppenlage an. */
export async function startDiscoveryServer(
  env: Record<string, string> = {},
): Promise<RunningDiscoveryServer> {
  return startTestServer({ BB_MCP_TOOL_MODE: "discovery", ...env });
}

/** Meldet den Server mit dieser Umgebung an, ohne den Modus vorzugeben. */
export async function startTestServer(
  env: Record<string, string> = {},
): Promise<RunningDiscoveryServer> {
  const config = installTestConfig(env);
  const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "discovery-test", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    built,
    config,
    close: async () => {
      await client.close();
      await built.server.close();
      resetTestConfig();
    },
  };
}

/** Der Textblock einer Werkzeugantwort, Blöcke mit Leerzeile verbunden. */
export function textOf(result: { content?: unknown }): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks
    .map((block) =>
      typeof block === "object" && block !== null && "text" in block
        ? String((block as { text: unknown }).text)
        : "",
    )
    .join("\n");
}

/** Das `structuredContent` einer Antwort als Datensatz. */
export function structuredOf(result: { structuredContent?: unknown }): Record<string, unknown> {
  const structured = result.structuredContent;
  if (typeof structured !== "object" || structured === null || Array.isArray(structured)) {
    throw new Error("Die Antwort trägt kein strukturiertes Objekt.");
  }
  return structured as Record<string, unknown>;
}
