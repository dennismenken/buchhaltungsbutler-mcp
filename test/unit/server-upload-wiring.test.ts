// Die Belegquelle im Ausführungspfad.
//
// `src/upload/source.ts` war vollständig gebaut und getestet, wurde aber von niemandem
// aufgerufen: Der Wert des Arguments `file` ging unverändert als Body-Feld hinaus. Damit
// liefen die drei zugesagten Formen, die Typbestimmung über Magic Bytes, die Größengrenze
// und die Bereinigung des Dateinamens ins Leere, obwohl die Werkzeugbeschreibung sie nennt.
//
// Diese Datei prüft die Verdrahtung selbst und nicht noch einmal das Upload-Modul: Kommt am
// Endpunkt der aufgelöste Inhalt an, und scheitert eine gesperrte Form, **bevor** ein Byte
// hinausgeht?

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../../src/config/resolve.js";
import { TOOL_BY_NAME } from "../../src/registry/index.generated.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { createServer } from "../../src/server/create-server.js";
import { type ApiMock, installTestConfig, mockApi, resetTestConfig } from "../helpers/mock-api.js";

/** Der echte Registereintrag, nicht eine Attrappe: Geprüft wird der ausgelieferte Weg. */
const UPLOAD_ENTRY: ToolEntry = (() => {
  const entry = TOOL_BY_NAME.get("bb_receipts_upload");
  if (entry === undefined) {
    throw new Error("bb_receipts_upload fehlt im Register; pnpm generate ausführen.");
  }
  return entry;
})();

/** Ein erfundener, aber gültiger PDF-Anfang. Die Magic Bytes sind das, was zählt. */
const PDF_BYTES = Buffer.from("%PDF-1.4\nErfundener Beleginhalt für den Test.\n%%EOF\n", "utf8");
const PDF_BASE64 = PDF_BYTES.toString("base64");

const ACK = { success: true, message: "", id_by_customer: "8815", filename: "beleg" };

interface RunningTestServer {
  readonly client: Client;
  close(): Promise<void>;
}

async function startServer(config: ResolvedConfig): Promise<RunningTestServer> {
  const built = createServer({ config, entries: [UPLOAD_ENTRY] });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "upload-wiring", version: "0.0.0" });
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

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("bb_receipts_upload: die Belegquelle wird aufgelöst", () => {
  it("schickt den base64-Inhalt und einen aus dem Inhalt gebildeten Dateinamen", async () => {
    api.post("/receipts/upload", { json: ACK });
    const server = await startServer(installTestConfig());
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_upload",
        arguments: { file: PDF_BASE64, receipt_type: "invoice inbound" },
      });
      expect(result.isError ?? false, textOf(result)).toBe(false);

      const { body } = await api.lastRequest("/receipts/upload");

      // Der Inhalt kommt kanonisch kodiert an und ist derselbe wie der übergebene.
      expect(body.file).toBe(PDF_BASE64);
      // Ohne file_name bildet der Server einen Namen aus dem erkannten Typ. Ohne die
      // Verdrahtung stünde hier gar nichts.
      expect(typeof body.file_name).toBe("string");
      expect(String(body.file_name)).toMatch(/\.pdf$/);
      expect(body.type).toBe("invoice inbound");
      // Der Schlüssel setzt der Server, nicht das Werkzeug.
      expect(body.api_key).toBeDefined();
    } finally {
      await server.close();
    }
  });

  it("entfernt Pfadanteile aus einem übergebenen Dateinamen", async () => {
    api.post("/receipts/upload", { json: ACK });
    const server = await startServer(installTestConfig());
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_upload",
        arguments: {
          file: PDF_BASE64,
          receipt_type: "invoice inbound",
          file_name: "../../etc/rechnung 2026.pdf",
        },
      });
      expect(result.isError ?? false, textOf(result)).toBe(false);

      const { body } = await api.lastRequest("/receipts/upload");
      expect(String(body.file_name)).not.toContain("..");
      expect(String(body.file_name)).not.toContain("/");
      expect(String(body.file_name)).toMatch(/\.pdf$/);
    } finally {
      await server.close();
    }
  });

  it("lehnt eine https-Adresse ab, solange der Schalter aus ist, und schickt nichts", async () => {
    api.post("/receipts/upload", { json: ACK });
    const server = await startServer(installTestConfig());
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_upload",
        arguments: {
          file: "https://example.invalid/beleg.pdf",
          receipt_type: "invoice inbound",
        },
      });
      expect(result.isError).toBe(true);
      const text = textOf(result);
      expect(text).toContain("BB_MCP_UPLOAD_FROM_URL");
      expect(text).toContain("Es ging nichts an BuchhaltungsButler hinaus");
      // Der entscheidende Nachweis: kein Request. Ohne die Verdrahtung wäre die Adresse als
      // Dateiinhalt an die echte Buchhaltung gegangen.
      expect(api.count("/receipts/upload")).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("lehnt eine file-Adresse ab, solange kein Verzeichnis freigegeben ist", async () => {
    api.post("/receipts/upload", { json: ACK });
    const server = await startServer(installTestConfig());
    try {
      const result = await server.client.callTool({
        name: "bb_receipts_upload",
        arguments: { file: "file:///tmp/beleg.pdf", receipt_type: "invoice inbound" },
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("BB_MCP_UPLOAD_DIRS");
      expect(api.count("/receipts/upload")).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("lässt jedes andere Werkzeug unberührt", () => {
    // Gegenprobe zur Zuordnung über den Spezifikationspfad: Ein Werkzeug ohne Dateifeld darf
    // von diesem Schritt nichts merken. Geprüft am Register, ohne Aufruf.
    const others = [...TOOL_BY_NAME.values()].filter(
      (entry) => "literal" in entry.path && entry.path.literal === "/receipts/upload",
    );
    expect(others).toHaveLength(1);
  });
});
