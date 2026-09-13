// Die Meldungen von Guard 3 an den **echten** 54 Werkzeugen (Plan 1.4 Schritt 4, 5.8; AP10).
//
// Geprüft wird das, wovon der Agent seinen nächsten Aufruf ableitet: Sagt die Absage, ob er
// etwas **nachtragen** oder etwas **umformen** muss, und benennt sie die Stelle so, dass er
// sie ohne Raten findet? Zwei Befunde stehen dahinter:
//
//   Enum-Felder    Zod 4 erzeugt an jedem Enum den Code `invalid_value` und dazu den
//                  englischen Rohtext „Invalid option: expected one of …" — auch dann, wenn
//                  das Pflichtfeld schlicht fehlt. 54 Enum-Felder in 31 der 54 Werkzeuge
//                  fielen damit aus der deutschen Fehlersprache heraus (E4) und verschwiegen
//                  zugleich, was übergeben wurde.
//   Listenstellen  Die frühere Klammernotation zählte ab 1 und schrieb damit `items[2]` für
//                  das zweite Element. In JSON und JavaScript ist das ausnahmslos das dritte;
//                  eine an der falschen Stelle korrigierte Rechnungsposition ergibt eine
//                  formal gültige und inhaltlich falsche Buchung.
//
// Der Server wird mit dem vollständigen Register aufgebaut und über eine Verbindung im
// Speicher angesprochen: Die Meldung, die dieser Test liest, ist die, die ein Client sieht.
// Es geht dabei kein einziger Request hinaus, denn Guard 3 liegt vor jedem Netzaufruf.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ToolEntry } from "../../src/registry/types.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

interface RunningTestServer {
  readonly client: Client;
  close(): Promise<void>;
}

/** Der Server mit dem echten Register: `entries` bleibt weg, dann gilt `TOOL_ENTRIES`. */
async function startServer(): Promise<RunningTestServer> {
  const config = installTestConfig({});
  const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "schema-message-test", version: "0.0.0" });
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

/**
 * Der Block `[Warum]` ohne seine Beschriftung.
 *
 * Er steht laut Plan 5.8 auf genau einer Zeile; die Befunde eines Aufrufs stehen also alle in
 * dieser einen Zeile und müssen sich dort voneinander abheben.
 */
function reasonOf(text: string): string {
  const line = text.split("\n").find((candidateLine) => candidateLine.startsWith("[Warum] "));
  return line === undefined ? "" : line.slice("[Warum] ".length);
}

let api: ApiMock;
let server: RunningTestServer;

beforeEach(async () => {
  api = mockApi();
  server = await startServer();
});

afterEach(async () => {
  await server.close();
  api.close();
  resetTestConfig();
});

/** Eine gültige Rechnungsposition. Nur das, was sie zu einer gültigen macht. */
function position(name: string, amount: string): Record<string, unknown> {
  return {
    item_name: name,
    item_amount: amount,
    item_unit: "Stück",
    item_vat: "19",
    item_single_price: "100.00",
  };
}

describe("Guard 3 an Enum-Feldern", () => {
  it("nennt bei einem fehlenden Enum-Pflichtfeld deutsch, dass es fehlt", async () => {
    const result = await server.client.callTool({
      name: "bb_receipts_search",
      arguments: { limit: 10 },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain(
      "list_direction: erlaubt sind 'inbound' und 'outbound', das Feld fehlt.",
    );
    // Kein englischer Rohtext der Bibliothek, und keine Behauptung über einen Wert, den es
    // nicht gibt.
    expect(text).not.toContain("Invalid option");
    expect(text).not.toContain("expected one of");
    expect(api.count()).toBe(0);
  });

  it("nennt bei einem falsch belegten Enum den übergebenen Wert und den Vorrat", async () => {
    const result = await server.client.callTool({
      name: "bb_receipts_search",
      arguments: { list_direction: "eingehend" },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain(
      "list_direction: erlaubt sind 'inbound' und 'outbound', übergeben wurde die Zeichenkette \"eingehend\".",
    );
    expect(text).not.toContain("Invalid option");
    expect(api.count()).toBe(0);
  });

  it("sagt auch dann, was übergeben wurde, wenn es gar keine Zeichenkette war", async () => {
    const result = await server.client.callTool({
      name: "bb_postings_search",
      arguments: { date_from: "2026-01-01", date_to: "2026-01-31", order: { date: "ASC" } },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain("order: erlaubt sind 'default'");
    expect(text).toContain("übergeben wurde ein Objekt.");
    expect(api.count()).toBe(0);
  });

  it("unterscheidet im selben Aufruf fehlendes Enum und fehlendes Textfeld", async () => {
    const result = await server.client.callTool({
      name: "bb_invoices_create",
      arguments: {
        invoice_type: "invoice",
        date: "2026-04-26",
        items: [position("Beratung", "1")],
      },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain("show_prices_type: erlaubt sind 'net' und 'gross', das Feld fehlt.");
    expect(text).toContain("company_name: erwartet wird string, das Feld fehlt.");
    expect(text).not.toContain("Invalid option");
    expect(api.count()).toBe(0);
  });
});

describe("Guard 3 an Listenstellen", () => {
  it("benennt die zweite Position als Position 2 und nicht als items[2]", async () => {
    const result = await server.client.callTool({
      name: "bb_invoices_create",
      arguments: {
        invoice_type: "invoice",
        show_prices_type: "net",
        company_name: "Erfundene Bürobedarf GmbH",
        date: "2026-04-26",
        items: [
          position("Beratung", "1"),
          // Nur diese Position ist falsch: item_amount ist eine Zahl statt einer Zeichenkette.
          { ...position("Schulung", "2"), item_amount: 2 },
          position("Nachbereitung", "3"),
        ],
      },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain(
      "items (Position 2).item_amount: erwartet wird string, übergeben wurde die Zahl 2.",
    );
    // Die Klammernotation ist verschwunden; sie meinte für jeden JSON-Leser die dritte
    // Position, während der Befund an der zweiten liegt.
    expect(text).not.toContain("items[2]");
    expect(text).not.toContain("items[1]");
    expect(api.count()).toBe(0);
  });

  it("nennt die Zählweise einmal in den instructions, damit sie niemand raten muss", () => {
    const config = installTestConfig({});
    const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
    expect(built.instructions).toContain("feld (Position 2)");
    expect(built.instructions).toContain("Position 1 ist das erste Element der Liste.");
    // Und ebenso, dass die Zählung ab 0 dort weiter gilt, wo sie hingehört: in der Antwort.
    expect(built.instructions).toContain("JSON-Pfade und zählen wie in JSON ab 0");
  });
});

// --- Mehrere Befunde in einem Aufruf ---------------------------------------------------
//
// Ein Aufruf verletzt das Schema regelmäßig an mehreren Feldern zugleich. Der Block `[Warum]`
// ist der Kanal, über den der Agent erkennt, welches Feld er nachzutragen und welches er
// umzuformen hat — verschmelzen zwei Befunde zu einem Satz, ist genau diese Unterscheidung
// verloren. Gemessen war: `limit: muss mindestens 1 sein offset: muss 0 oder größer sein`.

describe("Guard 3 bei mehreren Befunden zugleich", () => {
  it("grenzt jeden Einzelbefund sichtbar ab, statt sie ineinanderlaufen zu lassen", async () => {
    const result = await server.client.callTool({
      name: "bb_receipts_search",
      // Vier Befunde auf einmal: ein fehlendes Pflichtfeld (nachtragen), zwei verletzte
      // Grenzen und ein unbekanntes Feld im verschachtelten Objekt (umformen).
      arguments: { limit: 0, offset: -1, order: { feld: "x" } },
    });
    const text = textOf(result);
    const reason = reasonOf(text);

    expect(result.isError).toBe(true);

    // Zeichengenau: vier Teile, getrennt durch genau dieses Trennzeichen, jeder mit einem
    // Satzzeichen abgeschlossen. Die Grenzen liegen dort, wo sie liegen sollen, und nirgends
    // sonst.
    const findings = reason.split(" | ");
    expect(findings).toHaveLength(4);
    expect(findings[0]).toBe(
      "list_direction: erlaubt sind 'inbound' und 'outbound', das Feld fehlt.",
    );
    expect(findings[1]).toBe("limit: muss mindestens 1 sein.");
    expect(findings[2]).toBe("offset: muss 0 oder größer sein.");
    expect(findings[3]).toBe(
      "order: unbekannte Felder feld. Das Schema ist streng (additionalProperties: false), " +
        "weil die API unbekannte Body-Felder kommentarlos ignoriert und ein Tippfehler im " +
        "Feldnamen sonst ein stiller Datenfehler wäre.",
    );

    // Und dasselbe noch einmal als ein Stück, damit die Grenze zwischen zwei kurzen Befunden
    // zeichengenau festgehalten ist und nicht nur ihre Anzahl.
    expect(text).toContain(
      "[Warum] list_direction: erlaubt sind 'inbound' und 'outbound', das Feld fehlt. | " +
        "limit: muss mindestens 1 sein. | offset: muss 0 oder größer sein. | order:",
    );

    // Die verschmolzene Form von zuvor gibt es an keiner der drei Fügestellen mehr.
    expect(reason).not.toContain("fehlt limit");
    expect(reason).not.toContain("sein offset");
    expect(reason).not.toContain("sein order");
    expect(api.count()).toBe(0);
  });

  it("schließt auch einen einzelnen Befund ab, der selbst kein Satzzeichen mitbringt", async () => {
    const result = await server.client.callTool({
      name: "bb_invoices_create",
      arguments: {
        invoice_type: "invoice",
        show_prices_type: "net",
        company_name: "Erfundene Bürobedarf GmbH",
        // Formal ein YYYY-MM-DD, aber den 30. Februar gibt es nicht.
        date: "2026-02-30",
        items: [position("Beratung", "1")],
      },
    });
    const reason = reasonOf(textOf(result));

    expect(result.isError).toBe(true);
    // Der Text stammt unverändert aus dem Schemabaustein und endet dort ohne Satzzeichen; der
    // Punkt entsteht erst beim Verbinden.
    expect(reason).toBe("date: kein existierender Kalendertag.");
    expect(api.count()).toBe(0);
  });
});

// --- Die Vereinigung -------------------------------------------------------------------
//
// Das Register führt heute keine Vereinigung; `invalid_union` ist deshalb der einzige der vier
// selbst formulierten Codes, den keines der 54 Werkzeuge auslösen kann. Ein Zweig, den nichts
// prüft, ist aber kein Schutz, sondern eine Behauptung: Dieser Test baut deshalb ein Werkzeug
// mit einer Vereinigung und geht damit denselben Weg durch den Server.

const UNION_ENTRY: ToolEntry = {
  name: "bb_union_probe",
  title: "Probe mit einer Vereinigung",
  group: "receipts",
  path: { literal: "/receipts/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description: "Nur für diesen Test: ein Feld mit zwei erlaubten Formen.",
  fields: [
    {
      name: "grenze",
      apiNames: ["grenze"],
      source: "body",
      required: true,
      description: "Entweder eine Zahl oder eines der beiden Schlüsselwörter.",
      schema: z
        .union([z.number(), z.enum(["alle", "offene"])])
        .describe("Entweder eine Zahl oder eines der beiden Schlüsselwörter."),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration dieses Servers" }],
  responseContract: { container: "data", fields: {}, source: "dokumentiert" },
  shape: "list",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  crossChecks: [],
  invalidatesCache: [],
};

describe("Guard 3 an einer Vereinigung", () => {
  it("nennt beide erlaubten Formen und den übergebenen Wert auf Deutsch", async () => {
    const config = installTestConfig({});
    const built = createServer({
      config,
      entries: [UNION_ENTRY],
      store: createMasterDataStore({ ttlMs: 0 }),
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "union-probe", version: "0.0.0" });
    await built.server.connect(serverSide);
    await client.connect(clientSide);

    try {
      const result = await client.callTool({
        name: "bb_union_probe",
        arguments: { grenze: true },
      });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain(
        "grenze: erwartet wird ein Wert vom Typ number oder einer der Werte 'alle' und " +
          "'offene', übergeben wurde der Wahrheitswert true.",
      );
      expect(text).not.toContain("Invalid input");
      expect(api.count()).toBe(0);
    } finally {
      await client.close();
      await built.server.close();
    }
  });
});
