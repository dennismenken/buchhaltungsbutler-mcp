// Vertragstest D1 h) bis j): Anmeldung, Prüfbarkeit und Startfehler.
//
// h) tools/list meldet im Modus discovery mit Vorgabegruppen genau die fünf Gateways
//    mit den vorgegebenen Annotationen plus die fünf Bündel; der Modus direct meldet
//    unverändert 61 und 5.
// i) Ein Client, der structuredContent gegen das angekündigte outputSchema prüft,
//    akzeptiert die Antworten aller fünf Gateways, auch die eines Schreibwerkzeugs.
// j) Ein unbrauchbarer BB_MCP_TOOL_MODE bricht den Start ab.

import { afterEach, describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { ConfigError } from "../../src/config/env.js";
import { resolveConfig } from "../../src/config/resolve.js";
import { TOOL_CLASSES } from "../../src/registry/classes.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import {
  DESCRIBE_TOOL,
  DISCOVER_TOOL,
  GATEWAY_TOOL_NAMES,
  INVOKE_DESTRUCTIVE_TOOL,
  INVOKE_READ_TOOL,
  INVOKE_WRITE_TOOL,
} from "../../src/server/discovery.js";
import {
  startDiscoveryServer,
  startTestServer,
  type RunningDiscoveryServer,
} from "../helpers/discovery.js";
import { mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

let api: ApiMock;
let server: RunningDiscoveryServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  api?.close();
  resetTestConfig();
});

describe("D1 h) tools/list", () => {
  it("meldet im Modus discovery genau 5 Gateways und 5 Bündel", async () => {
    api = mockApi();
    server = await startDiscoveryServer();

    expect(server.built.tools).toHaveLength(0);
    expect(server.built.gateways.map((gateway) => gateway.name)).toEqual([...GATEWAY_TOOL_NAMES]);

    const listed = await server.client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual([
      DISCOVER_TOOL,
      DESCRIBE_TOOL,
      INVOKE_READ_TOOL,
      INVOKE_WRITE_TOOL,
      INVOKE_DESTRUCTIVE_TOOL,
      ...BUNDLE_ENTRIES.map((entry) => entry.name),
    ]);

    const annotationsOf = (name: string): unknown =>
      listed.tools.find((tool) => tool.name === name)?.annotations;
    expect(annotationsOf(DISCOVER_TOOL)).toEqual(TOOL_CLASSES.R.annotations);
    expect(annotationsOf(DESCRIBE_TOOL)).toEqual(TOOL_CLASSES.R.annotations);
    expect(annotationsOf(INVOKE_READ_TOOL)).toEqual(TOOL_CLASSES.R.annotations);
    expect(annotationsOf(INVOKE_WRITE_TOOL)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(annotationsOf(INVOKE_DESTRUCTIVE_TOOL)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("meldet im Modus direct unverändert 61 und 5", async () => {
    api = mockApi();
    const direct = await startTestServer();
    try {
      const listed = await direct.client.listTools();
      expect(listed.tools).toHaveLength(TOOL_ENTRIES.length + BUNDLE_ENTRIES.length);
      expect(direct.built.gateways).toEqual([]);
    } finally {
      await direct.close();
    }
  });
});

// ---------------------------------------------------------------------------------------
// D1 i): der Client, der validiert
// ---------------------------------------------------------------------------------------

// Ein kleiner JSON-Schema-Prüfer für genau das, was die Gateways ankündigen: Objekte,
// Pflichtfelder, Typen und überall `additionalProperties: true`. Die Form folgt
// test/contract/output-schema.test.ts: Was er nicht kennt, weist er zurück, statt es
// still durchzuwinken.

interface SchemaNode {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: SchemaNode;
  readonly additionalProperties?: boolean;
}

function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function validate(node: SchemaNode, value: unknown, path: string): string[] {
  const findings: string[] = [];
  const actual = jsonTypeOf(value);
  if (node.type !== undefined) {
    const allowed: readonly string[] = typeof node.type === "string" ? [node.type] : node.type;
    const matches =
      allowed.includes(actual) || (allowed.includes("number") && actual === "integer");
    if (!matches) {
      return [`${path}: erwartet ${allowed.join(" oder ")}, geliefert ${actual}`];
    }
  }
  if (actual === "object") {
    const record = value as Record<string, unknown>;
    for (const name of node.required ?? []) {
      if (!(name in record)) {
        findings.push(`${path}.${name}: Pflichtfeld fehlt`);
      }
    }
    for (const [name, child] of Object.entries(node.properties ?? {})) {
      if (name in record) {
        findings.push(...validate(child, record[name], `${path}.${name}`));
      }
    }
  }
  if (actual === "array" && node.items !== undefined) {
    (value as readonly unknown[]).forEach((element, index) => {
      findings.push(...validate(node.items as SchemaNode, element, `${path}[${String(index)}]`));
    });
  }
  return findings;
}

describe("D1 i) der validierende Client", () => {
  it("akzeptiert die Antworten aller fünf Gateways, auch die eines Schreibwerkzeugs", async () => {
    api = mockApi();
    api.post("/receipts/get", { json: { success: true, message: "", rows: 0, data: [] } });
    api.post("/receipts/add", { json: { success: true, message: "", id_by_customer: "4716" } });
    api.post("/cost-locations/delete", { json: { success: true, message: "", data: [] } });
    server = await startDiscoveryServer();

    const listed = await server.client.listTools();
    const schemaOf = (name: string): SchemaNode => {
      const tool = listed.tools.find((candidate) => candidate.name === name);
      if (tool?.outputSchema === undefined) {
        throw new Error(`Kein outputSchema für ${name} angekündigt.`);
      }
      return tool.outputSchema as unknown as SchemaNode;
    };

    const problems: string[] = [];
    const check = async (gateway: string, args: Record<string, unknown>): Promise<void> => {
      const result = await server?.client.callTool({ name: gateway, arguments: args });
      if (result?.isError === true || result?.structuredContent === undefined) {
        problems.push(`${gateway}: keine prüfbare Antwort.`);
        return;
      }
      const findings = validate(schemaOf(gateway), result.structuredContent, "structuredContent");
      if (findings.length > 0) {
        problems.push(`${gateway}: ${findings.join(" | ")}`);
      }
    };

    await check(DISCOVER_TOOL, {});
    await check(DESCRIBE_TOOL, { names: ["bb_receipts_search"] });
    await check(INVOKE_READ_TOOL, {
      name: "bb_receipts_search",
      arguments: { list_direction: "inbound" },
    });
    // Das Schreibwerkzeug: Die Antwort trägt den aufgelösten Datensatz unter dem
    // Wirkungsschlüssel und kein Pflichtfeld, das sie einem offenen Schema nähme.
    await check(INVOKE_WRITE_TOOL, {
      name: "bb_receipts_create",
      arguments: {
        receipt_type: "invoice inbound",
        counterparty: "Erfundene Bürobedarf GmbH",
        invoice_number: "ER-2026-0001",
        date: "2026-01-04",
        amount: "119.00",
        currency: "EUR",
      },
    });
    await check(INVOKE_DESTRUCTIVE_TOOL, {
      name: "bb_cost_locations_delete",
      arguments: { code: "ro0001" },
    });
    await check(DESCRIBE_TOOL, { names: ["bb_receipts_delete", "unbekanntes_werkzeug"] });

    expect(problems.join("\n")).toBe("");
  }, 30_000);
});

describe("D1 j) Startfehler", () => {
  it("bricht bei ungültigem BB_MCP_TOOL_MODE mit den gültigen Werten ab", () => {
    let thrown: unknown;
    try {
      resolveConfig({
        env: { BB_MCP_TOOL_MODE: "finden" },
        platform: "linux",
        homeDir: "/nicht/vorhanden",
        nodeVersion: process.versions.node,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).message).toContain("BB_MCP_TOOL_MODE");
    expect((thrown as ConfigError).message).toContain("Gültig sind: direct, discovery.");
  });
});
