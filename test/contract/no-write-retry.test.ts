// Vertragstest: **kein automatischer Wiederholungsversuch bei schreibenden
// Werkzeugen.** Für jedes der 39 schreibenden Werkzeuge liefert die HTTP-Nachbildung einmal
// HTTP 504. Erwartet wird genau **ein** Request, kein zweiter, und eine Meldung, die den
// Prüfweg aus `verifyWith` nennt und den Zustandssatz 3 trägt.
//
// **Warum dieser Test außerhalb des Registers steht.** Er prüft keine Daten, sondern eine
// Zusage über das Verhalten: Die Regel ist bauartbedingt (der Retry-Zweig wird über
// `toolClass === "R"` freigeschaltet) und **nicht konfigurierbar**. Die API kennt keinen
// Idempotenzschlüssel; wer einen schreibenden Aufruf trotzdem wiederholt, bucht doppelt. Ein
// Test, der das nur an einem Beispiel prüfte, ließe 38 Werkzeuge ungeprüft.
//
// **Die Gegenprobe gehört dazu.** Ein lesendes Werkzeug bekommt dasselbe HTTP 504 und muss
// dreimal fragen. Ohne sie wäre „genau ein Request" auch dann grün, wenn die Nachbildung
// einen zweiten Versuch gar nicht beantworten könnte — der Test würde nichts belegen.
//
// Dieser Lauf belegt zugleich die zweite Hälfte von `read-only.test.ts`: Er läuft **ohne**
// `BB_MCP_READ_ONLY`, und alle 39 schreibenden Werkzeuge kommen dabei bis zur HTTP-Schicht.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import { STATE_UNKNOWN } from "../../src/errors/render.js";
import { resetRateLimiterForTests } from "../../src/http/rate-limiter.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { buildZodSchema, toJsonSchema } from "../../src/schema/build.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// ---------------------------------------------------------------------------------------
// Minimalargumente aus dem Eingabeschema
// ---------------------------------------------------------------------------------------
//
// Die Argumente werden **aus dem erzeugten JSON Schema abgeleitet** und nicht 39-mal von Hand
// geschrieben. Das hat einen inhaltlichen Grund und nicht nur einen der Bequemlichkeit: Eine
// Handtabelle veraltet still, sobald ein Pflichtfeld hinzukommt — der Aufruf scheiterte dann
// an Guard 3, es ginge kein Request hinaus, und „genau ein Request" wäre grün, ohne dass der
// Retry-Zweig überhaupt erreicht worden wäre. Die Ableitung kann das nicht: Sie folgt dem
// Schema, und wenn sie einen Wert nicht erzeugen kann, wirft sie.
//
// Erzeugt wird ausschließlich das **Pflichtfeld**-Minimum. Optionale Felder bleiben weg; wo
// eine Querprüfung an einem optionalen Feld hängt, steht der Wert in OVERRIDES.

/** Ein JSON-Schema-Knoten, soweit `schema/build.ts` ihn erzeugt. */
interface SchemaNode {
  readonly type?: string | readonly string[];
  readonly enum?: readonly unknown[];
  readonly anyOf?: readonly SchemaNode[];
  readonly const?: unknown;
  readonly pattern?: string;
  readonly format?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly items?: SchemaNode;
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
}

/**
 * Kandidaten für ein Zeichenkettenfeld **mit** Muster, in der Reihenfolge des Ausprobierens.
 *
 * Der Weg über Kandidaten und eine echte Prüfung gegen das Muster ist Absicht: Eine Tabelle
 * „Muster → Wert" müsste jedes Muster kennen, und ein unbekanntes Muster ergäbe stillschweigend
 * einen ungültigen Wert. So prüft der Erzeuger sein Ergebnis selbst und wirft, wenn keiner der
 * Kandidaten passt.
 */
const PATTERNED_CANDIDATES: readonly string[] = [
  "2026-01-15",
  "2026-01-15 09:30:00",
  // Die 19 steht vor jedem größeren Betrag, und zwar mit Grund: Einige Felder tragen über
  // das Muster hinaus eine Bereichsprüfung, die im JSON Schema nicht steht — `item_vat`
  // erlaubt nur Sätze zwischen 0 und 100. Ein Kandidat, der beides erfüllt, hält den
  // Erzeuger frei von einer Sonderregel je Feld.
  "19",
  "119.00",
  "beispiel",
];

/** Ein Text ohne Muster, auf die erlaubte Länge gebracht. */
function plainText(node: SchemaNode): string {
  const base = "Beispielwert";
  const min = node.minLength ?? 1;
  const max = node.maxLength ?? Math.max(base.length, min);
  const padded = base.length < min ? base.padEnd(min, "x") : base;
  return padded.slice(0, Math.max(min, Math.min(max, padded.length)));
}

function stringSample(node: SchemaNode, path: string): string {
  if (node.pattern === undefined && node.format !== "date") {
    return plainText(node);
  }
  const pattern = node.pattern === undefined ? null : new RegExp(node.pattern);
  for (const candidate of PATTERNED_CANDIDATES) {
    if (pattern !== null && !pattern.test(candidate)) {
      continue;
    }
    if (node.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      continue;
    }
    if (node.minLength !== undefined && candidate.length < node.minLength) {
      continue;
    }
    if (node.maxLength !== undefined && candidate.length > node.maxLength) {
      continue;
    }
    return candidate;
  }
  throw new Error(
    `Für ${path} liefert keiner der Kandidaten einen Wert, der zu ${String(node.pattern)} passt. ` +
      "Der Erzeuger der Minimalargumente braucht dafür einen weiteren Kandidaten.",
  );
}

/** Ein gültiger Wert zu einem Schemaknoten. Wirft, wo das Schema nichts hergibt. */
function sampleFor(node: SchemaNode, path: string): unknown {
  if (node.const !== undefined) {
    return node.const;
  }
  if (node.enum !== undefined && node.enum.length > 0) {
    return node.enum[0];
  }
  if (node.anyOf !== undefined) {
    // `null` ist zwar erlaubt, aber der ärmere Fall: Ein Wert prüft mehr als eine Leerstelle.
    const branch = node.anyOf.find((candidate) => candidate.type !== "null") ?? node.anyOf[0];
    if (branch === undefined) {
      throw new Error(`${path}: anyOf ohne Zweig.`);
    }
    return sampleFor(branch, path);
  }

  // `Array.isArray` auf einem readonly-Array liefert dem Typprüfer `any[]` zurück; deshalb
  // wird die Typliste hier von Hand aufgefaltet.
  const types: readonly string[] =
    node.type === undefined ? [] : typeof node.type === "string" ? [node.type] : node.type;
  const type = types.find((value) => value !== "null");
  switch (type) {
    case "string":
      return stringSample(node, path);
    case "integer":
    case "number":
      return Math.max(1, node.minimum ?? 1);
    case "boolean":
      return true;
    case "array": {
      if (node.items === undefined) {
        throw new Error(`${path}: array ohne items.`);
      }
      const count = Math.max(1, node.minItems ?? 1);
      return Array.from({ length: count }, (_unused, index) =>
        sampleFor(node.items as SchemaNode, `${path}[${String(index + 1)}]`),
      );
    }
    case "object": {
      const out: Record<string, unknown> = {};
      for (const name of node.required ?? []) {
        const property = node.properties?.[name];
        if (property === undefined) {
          throw new Error(`${path}: Pflichtfeld ${name} hat keine Definition.`);
        }
        out[name] = sampleFor(property, `${path}.${name}`);
      }
      return out;
    }
    default:
      throw new Error(`${path}: unbekannter Schematyp ${String(node.type)}.`);
  }
}

/**
 * Eine kleine, vollständig begründete PDF-Datei als base64.
 *
 * `/receipts/upload` nimmt den Inhalt entgegen, und `upload/sniff.ts` liest den Dateityp aus
 * den Magic Bytes. Ein Platzhaltertext käme deshalb nie bis zur HTTP-Schicht, und genau die
 * soll dieser Test erreichen.
 */
const MINIMAL_PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n").toString(
  "base64",
);

/**
 * Die Stellen, an denen das Pflichtfeld-Minimum allein nicht durchkommt. Alle drei sind Folgen
 * einer bewussten Regel und keine Nachlässigkeit des Erzeugers.
 */
const OVERRIDES: Readonly<Record<string, (args: Record<string, unknown>) => void>> = {
  // Der Dateiinhalt muss dekodierbar sein und einen erkennbaren Dateityp tragen.
  bb_receipts_upload: (args) => {
    args.file = MINIMAL_PDF_BASE64;
  },
  // Q8: Der erste Wert des Enums `item_tax_type` ist 'S', und 'S' verlangt einen
  // Steuersatz in `item_tax_amount`. Das Feld ist optional, weil die Spezifikation sich hier
  // widerspricht; der Erzeuger setzt optionale Felder nicht.
  bb_invoices_create_einvoice: (args) => {
    const items = args.items as Record<string, unknown>[];
    for (const item of items) {
      item.item_tax_amount = "19";
    }
  },
  // Q9: `/comments/add` verlangt genau eine von `receipt_id_by_customer` und
  // `transaction_id_by_customer`. Beide sind einzeln optional, der Erzeuger setzt optionale
  // Felder nicht, und ohne eine von beiden lehnt Q9 vor dem Request ab.
  bb_comments_create: (args) => {
    args.receipt_id_by_customer = 1;
  },
};

/** Die Minimalargumente eines Eintrags. */
function minimalArguments(entry: ToolEntry): Record<string, unknown> {
  const schema = toJsonSchema(buildZodSchema(entry, { maxItems: 50 })) as SchemaNode;
  const args = sampleFor(schema, entry.name) as Record<string, unknown>;
  OVERRIDES[entry.name]?.(args);
  return args;
}

/**
 * Der Pfad, an dem der Request erwartet wird.
 *
 * Bei den vier Werkzeugen mit Pfadvorlage ist das der **interpolierte** Pfad und niemals der
 * Spezifikationspfad: Nur so ist belegt, dass der Pfadbau wirklich durchlaufen
 * wird. Bleibt der Server beim Spezifikationspfad, findet er keine Abfangregel, und der Test
 * wird rot — was genau richtig ist.
 */
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

// ---------------------------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------------------------

const WRITE_ENTRIES = TOOL_ENTRIES.filter((entry) => entry.toolClass !== "R");
const READ_ENTRIES = TOOL_ENTRIES.filter((entry) => entry.toolClass === "R");

/** Die Antwort, die den Ausgang offen lässt: HTTP 504 mit dem dokumentierten `error_code` 30. */
const GATEWAY_TIMEOUT = {
  status: 504,
  json: { success: false, error_code: 30, message: "gateway timeout" },
} as const;

let client: Client;
let close: () => Promise<void>;

beforeAll(async () => {
  const config = installTestConfig();
  const built = createServer({
    config,
    entries: TOOL_ENTRIES,
    store: createMasterDataStore({ ttlMs: config.cacheTtlMs }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "no-write-retry", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  close = async () => {
    await client.close();
    await built.server.close();
  };
});

afterAll(async () => {
  await close();
  resetTestConfig();
});

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

// ---------------------------------------------------------------------------------------
// Der Test
// ---------------------------------------------------------------------------------------

describe("HTTP 504 an einem schreibenden Werkzeug", () => {
  it("die Menge stimmt: 39 schreibende, 15 lesende Einträge", () => {
    expect(WRITE_ENTRIES).toHaveLength(39);
    expect(READ_ENTRIES).toHaveLength(15);
  });

  for (const entry of WRITE_ENTRIES) {
    it(`${entry.name}: genau ein Request, kein zweiter`, { timeout: 30_000 }, async () => {
      const api: ApiMock = mockApi();
      // Der Eimer wird vor jedem Aufruf zurückgesetzt. Stapel- und Berichtseimer führen ein
      // einziges Token je 5 beziehungsweise 10 Sekunden; ohne das Zurücksetzen
      // wartete dieser Lauf minutenlang auf eine Drosselung, die hier nichts prüft. Das
      // Verhalten des Limiters hat seinen eigenen Test.
      resetRateLimiterForTests();

      const args = minimalArguments(entry);
      const path = expectedPath(entry, args);
      api.post(path, GATEWAY_TIMEOUT);

      try {
        const result = await client.callTool({ name: entry.name, arguments: args });
        const text = textOf(result);

        // Der Kern: genau ein Request. Zwei wären eine mögliche Doppelbuchung.
        expect(
          api.count(path),
          `${entry.name}: erwartet wurde genau ein Request an ${path}. Antwort des Servers:\n${text}`,
        ).toBe(1);
        expect(result.isError).toBe(true);

        // Zustandssatz 3, zeichengenau. Ein Text, der Fehlschlag behauptete, wäre eine
        // Unwahrheit: Der Ausgang ist offen.
        expect(text).toContain(STATE_UNKNOWN);
        expect(text).toContain("kennt keinen Idempotenzschlüssel");

        // Der Prüfweg aus dem Registereintrag steht in der Meldung.
        const verifyWith = entry.verifyWith;
        expect(verifyWith, `${entry.name} führt kein verifyWith (P10)`).toBeDefined();
        if (verifyWith?.kind === "tool") {
          expect(text).toContain(verifyWith.tool);
        } else if (verifyWith?.kind === "none") {
          expect(text).toContain("Weboberfläche");
        }
      } finally {
        api.close();
      }
    });
  }
});

describe("Gegenprobe: dasselbe HTTP 504 an einem lesenden Werkzeug", () => {
  it("führt zu drei Versuchen", { timeout: 30_000 }, async () => {
    const api = mockApi();
    resetRateLimiterForTests();

    // /accounts/get, das leichteste lesende Werkzeug: kein Pflichtfeld, keine Paginierung.
    const entry = TOOL_ENTRIES.find((candidate) => candidate.name === "bb_payment_accounts_list");
    if (entry === undefined) {
      throw new Error("Das Register führt bb_payment_accounts_list nicht mehr.");
    }
    expect(entry.toolClass).toBe("R");
    const args = minimalArguments(entry);
    const path = expectedPath(entry, args);
    api.post(path, GATEWAY_TIMEOUT);

    try {
      const result = await client.callTool({ name: entry.name, arguments: args });

      expect(result.isError).toBe(true);
      // Drei Versuche, jeder mit eigenem Token. Damit ist belegt, dass die
      // Nachbildung einen zweiten Versuch sehr wohl beantworten könnte — und dass die
      // schreibenden Werkzeuge oben ihn deshalb wirklich unterlassen.
      expect(api.count(path)).toBe(3);
    } finally {
      api.close();
    }
  });
});
