// Ein Server mit ausschließlich den Bündelwerkzeugen, für die Tests.
//
// Er wird über `registerBundles` gebaut und nicht über `createServer`: Die 54
// Endpunktwerkzeuge spielen in diesen Tests keine Rolle, und ein eigener Limiter lässt sich
// nur auf diesem Weg einspeisen. Dass `createServer` die Bündel ebenfalls registriert, prüft
// `test/bundles/read-bundles-contract.test.ts` getrennt.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { registerBundles, type RegisteredBundleInfo } from "../../src/bundles/register.js";
import type { BundleEntry } from "../../src/bundles/types.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { SERVER_INFO } from "../../src/generated/version.js";
import type { RateLimiter } from "../../src/http/rate-limiter.js";

export interface BundleCallResult {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Record<string, unknown>;
  /** Der Pflichtblock `bundle`; ein leeres Objekt, wenn die Antwort keinen trägt. */
  readonly bundle: Record<string, unknown>;
}

export interface RunningBundleServer {
  readonly client: Client;
  readonly registered: readonly RegisteredBundleInfo[];
  call(name: string, args: Record<string, unknown>): Promise<BundleCallResult>;
  listNames(): Promise<string[]>;
  close(): Promise<void>;
}

export interface StartBundleServerOptions {
  readonly config: ResolvedConfig;
  readonly entries?: readonly BundleEntry[];
  readonly limiter?: RateLimiter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(result: { content?: unknown }): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks
    .map((block) =>
      isRecord(block) && "text" in block ? String((block as { text: unknown }).text) : "",
    )
    .join("\n");
}

export async function startBundleServer(
  options: StartBundleServerOptions,
): Promise<RunningBundleServer> {
  const server = new McpServer(SERVER_INFO, {
    instructions: "Testaufbau der Bündelwerkzeuge.",
    capabilities: { tools: { listChanged: false } },
  });
  const registered = registerBundles(server, {
    config: options.config,
    ...(options.entries === undefined ? {} : { entries: options.entries }),
    ...(options.limiter === undefined ? {} : { limiter: options.limiter }),
  });

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "bundle-tests", version: "0.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);

  return {
    client,
    registered,
    async call(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const structured = isRecord(result.structuredContent) ? result.structuredContent : {};
      const bundle = isRecord(structured["bundle"]) ? structured["bundle"] : {};
      return { isError: result.isError === true, text: textOf(result), structured, bundle };
    },
    async listNames() {
      const listed = await client.listTools();
      return listed.tools.map((tool) => tool.name).sort();
    },
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Die Schrittliste einer Antwort, als lesbare Zeilen für Erwartungen. */
export function stepsOf(bundle: Record<string, unknown>): Record<string, unknown>[] {
  const steps = bundle["steps"];
  return Array.isArray(steps) ? steps.filter(isRecord) : [];
}

/** Die Lückenliste einer Antwort. */
export function gapsOf(bundle: Record<string, unknown>): Record<string, unknown>[] {
  const gaps = bundle["gaps"];
  return Array.isArray(gaps) ? gaps.filter(isRecord) : [];
}

/** Eine Liste mit `count` Zeilen, jede mit fortlaufender `id_by_customer`. */
export function pageOf(
  count: number,
  build: (index: number) => Record<string, unknown>,
): unknown[] {
  return Array.from({ length: count }, (_unused, index) => build(index));
}
