// Die `instructions` gegen den Serverstart, der sie mitschickt.
//
// **Warum es diesen Test gibt.** Der Servertext trug seine Werkzeugzahlen als Literale — 54,
// 15, 39 — und den unbedingten Satz „Ein Werkzeugaufruf ist genau ein Aufruf an die API.
// Dieser Server fasst nichts zusammen, blättert nicht selbsttätig". Mit den fünf
// Bündelwerkzeugen war beides falsch: Gemessen meldet dieser Server 59 Werkzeuge an, 19
// lesende und 40 schreibende, und `bb_records_collect` blättert selbsttätig über Seiten.
// Falsch war es an der teuersten Stelle überhaupt, denn die `instructions` liest jedes Modell
// vor jedem Aufruf, und unter `BB_MCP_TOOL_GROUPS=bundles` galt der Satz für kein einziges
// angemeldetes Werkzeug.
//
// Geprüft wird deshalb nicht der Wortlaut gegen eine zweite gepflegte Zahl — das wäre
// dieselbe alternde Stelle noch einmal —, sondern der Text gegen **denselben Serverstart**:
// `initialize` liefert die `instructions`, `tools/list` die tatsächlich angemeldeten
// Werkzeuge samt ihren Annotationen. Weichen beide voneinander ab, ist das ein Fehler.

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";
import { createServer } from "../../src/server/create-server.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

const ENDPOINT_NAMES: ReadonlySet<string> = new Set(TOOL_ENTRIES.map((entry) => entry.name));
const BUNDLE_NAMES: ReadonlySet<string> = new Set(BUNDLE_ENTRIES.map((entry) => entry.name));

/** Was dieser Serverstart wirklich anbietet, aus `tools/list` und nicht aus dem Register. */
interface Listed {
  readonly total: number;
  readonly readOnly: number;
  readonly writing: number;
  readonly endpoints: number;
  readonly bundles: number;
}

interface Started {
  /** Der Text, wie ihn `initialize` ausgeliefert hat, auf einfachen Leerraum normalisiert. */
  readonly instructions: string;
  readonly listed: Listed;
  /** Die Namen aus `tools/list` desselben Starts, gegen die jeder genannte Name gehalten wird. */
  readonly names: ReadonlySet<string>;
}

/**
 * Startet den Server über eine echte MCP-Verbindung und liest beides ab.
 *
 * Der Text kommt aus `client.getInstructions()` und damit aus der `initialize`-Antwort; die
 * Zeilenumbrüche des Servertextes werden zu Leerzeichen, weil jeder Satz über mehrere Zeilen
 * laufen darf und keine Prüfung an einer Umbruchstelle hängen soll.
 */
async function start(config: ResolvedConfig): Promise<Started> {
  const built = createServer({ config, store: createMasterDataStore({ ttlMs: 0 }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "instructions-test", version: "0.0.0" });
  await built.server.connect(serverSide);
  await client.connect(clientSide);
  try {
    const instructions = client.getInstructions();
    expect(instructions, "initialize hat keine instructions mitgeschickt").toBeTypeOf("string");

    const tools = (await client.listTools()).tools;
    const readOnly = tools.filter((tool) => tool.annotations?.readOnlyHint === true).length;

    return {
      instructions: (instructions ?? "").replace(/\s+/gu, " "),
      listed: {
        total: tools.length,
        readOnly,
        writing: tools.length - readOnly,
        endpoints: tools.filter((tool) => ENDPOINT_NAMES.has(tool.name)).length,
        bundles: tools.filter((tool) => BUNDLE_NAMES.has(tool.name)).length,
      },
      names: new Set(tools.map((tool) => tool.name)),
    };
  } finally {
    await client.close();
    await built.server.close();
  }
}

/** Die Zahlen einer Fundstelle, oder eine sprechende Fehlschlagmeldung statt `null`. */
function numbersOf(text: string, pattern: RegExp, what: string): number[] {
  const match = pattern.exec(text);
  expect(
    match,
    `Die instructions nennen ${what} nicht. Gesucht wurde ${pattern.source} in:\n${text}`,
  ).not.toBeNull();
  return (match ?? []).slice(1).map((value) => Number(value));
}

/** „Angemeldet: 59 Werkzeuge, davon 19 lesend und 40 schreibend." */
const INVENTORY = /Angemeldet: (\d+) Werkzeuge?, davon (\d+) lesend und (\d+) schreibend/u;

/** Die Bestandszeile des Zustandsblocks gegen `tools/list` desselben Starts. */
function expectInventory(started: Started): void {
  const [total, readOnly, writing] = numbersOf(
    started.instructions,
    INVENTORY,
    "ihren Werkzeugbestand",
  );
  expect([total, readOnly, writing]).toEqual([
    started.listed.total,
    started.listed.readOnly,
    started.listed.writing,
  ]);
}

let api: ApiMock;

beforeEach(() => {
  api = mockApi();
});

afterEach(() => {
  api.close();
  resetTestConfig();
});

describe("der Werkzeugbestand im Servertext", () => {
  it("stimmt ohne Gruppenschalter mit tools/list überein", async () => {
    const started = await start(installTestConfig());
    expectInventory(started);

    const [total, endpoints, bundles] = numbersOf(
      started.instructions,
      /(\d+) Werkzeuge?: (\d+) Endpunktwerkzeuge, genau eines je API-Endpunkt, und (\d+) Bündelwerkzeuge/u,
      "die Aufteilung in Endpunkt- und Bündelwerkzeuge",
    );
    expect([total, endpoints, bundles]).toEqual([
      started.listed.total,
      started.listed.endpoints,
      started.listed.bundles,
    ]);
  });

  it("stimmt mit dem Nur-Lesen-Schalter überein", async () => {
    const started = await start(installTestConfig({ BB_MCP_READ_ONLY: "true" }));
    expectInventory(started);
    // Der Nur-Lesen-Schalter nimmt kein Werkzeug aus der Liste; die Bestandszahl bleibt die
    // volle, und gesperrt ist nicht versteckt.
    expect(started.listed.total).toBe(TOOL_ENTRIES.length + BUNDLE_ENTRIES.length);
    expect(started.instructions).toContain("Nur die lesenden laufen");
  });

  it("nennt bei abgeschalteten Gruppen den vollen Umfang und den eigenen Bestand getrennt", async () => {
    const started = await start(installTestConfig({ BB_MCP_TOOL_GROUPS: "reports" }));
    expectInventory(started);

    const [allEndpoints, allBundles, own] = numbersOf(
      started.instructions,
      /im vollen Umfang (\d+) Endpunktwerkzeuge und (\d+) Bündelwerkzeuge\. Diese Installation meldet davon (\d+) Werkzeuge? an/u,
      "den vollen Umfang neben dem eigenen Bestand",
    );
    expect([allEndpoints, allBundles]).toEqual([TOOL_ENTRIES.length, BUNDLE_ENTRIES.length]);
    expect(own).toBe(started.listed.total);
    expect(own).toBeLessThan(allEndpoints + allBundles);
  });

  it("trägt auch das Profil mit genau einem Werkzeug in richtiger Zahlform", async () => {
    // `comments` führt ein einziges, schreibendes Werkzeug. Genau hier fiele eine
    // stillschweigend angenommene Mehrzahl auf, und „0 lesend" ist eine Angabe, die ein Agent
    // braucht, statt einer, die man wegkürzt.
    const started = await start(installTestConfig({ BB_MCP_TOOL_GROUPS: "comments" }));
    expect(started.listed).toMatchObject({ total: 1, readOnly: 0, writing: 1, bundles: 0 });
    expect(started.instructions).toContain(
      "Angemeldet: 1 Werkzeug, davon 0 lesend und 1 schreibend",
    );
  });
});

describe("die Selbstauskunft über das Verhalten", () => {
  it("behauptet nirgends mehr, dieser Server fasse nichts zusammen", async () => {
    const profiles: readonly Record<string, string>[] = [
      {},
      { BB_MCP_READ_ONLY: "true" },
      { BB_MCP_TOOL_GROUPS: "bundles" },
      { BB_MCP_TOOL_GROUPS: "reports" },
      { BB_MCP_TOOL_GROUPS: "comments" },
    ];
    for (const env of profiles) {
      const started = await start(installTestConfig(env));
      const profil = `Profil ${JSON.stringify(env)}`;
      expect(started.instructions, `${profil} behauptet noch den unbedingten Satz.`).not.toContain(
        "Dieser Server fasst nichts zusammen",
      );
      // Dieselbe Behauptung stand ein zweites Mal im Zustandsblock, an der Duplikatsprüfung.
      // Ein Bündelaufruf setzt mehrere Requests ab; unbedingt gesagt ist der Satz falsch.
      expect(
        started.instructions,
        `${profil} behauptet an der Duplikatsprüfung noch „ein Werkzeugaufruf, ein Request".`,
      ).not.toContain("Ein Werkzeugaufruf ist genau ein Aufruf");
      resetTestConfig();
    }
  });

  it("weist die Bündel als Ausnahme samt ihrer Buchführung aus, wo sie angemeldet sind", async () => {
    const started = await start(installTestConfig());
    expect(started.listed.bundles).toBeGreaterThan(0);
    expect(started.instructions).toContain("Die Bündelwerkzeuge sind die Ausnahme");
    expect(started.instructions).toContain("blättern selbsttätig über Seiten");
    // Die fünf Felder des Pflichtblocks, wörtlich wie im outputSchema (src/bundles/output-schema.ts).
    expect(started.instructions).toContain(
      "im Block bundle aus: complete, stopped_because, api_calls, gaps und written",
    );
  });

  it("schweigt über Bündel, wo keines angemeldet ist", async () => {
    const started = await start(installTestConfig({ BB_MCP_TOOL_GROUPS: "reports" }));
    expect(started.listed.bundles).toBe(0);
    expect(started.instructions).not.toContain("Die Bündelwerkzeuge sind die Ausnahme");
    expect(started.instructions).toContain(
      "Ein Aufruf eines Endpunktwerkzeugs ist genau ein Aufruf an die API",
    );
  });

  it("lässt den Satz über Endpunktwerkzeuge im Profil bundles ganz weg", async () => {
    // Das Profil, das die README für Claude Desktop empfiehlt: kein einziges
    // Endpunktwerkzeug ist aktiv. Ein Satz über Endpunktwerkzeuge beschriebe dort nichts.
    const started = await start(installTestConfig({ BB_MCP_TOOL_GROUPS: "bundles" }));
    expect(started.listed.endpoints).toBe(0);
    expect(started.listed.bundles).toBe(BUNDLE_ENTRIES.length);
    expect(started.instructions).not.toContain("Ein Aufruf eines Endpunktwerkzeugs");
    expect(started.instructions).toContain("Die Bündelwerkzeuge sind die Ausnahme");
    expectInventory(started);
  });
});

// ---------------------------------------------------------------------------------------
// Jeder genannte Werkzeugname gegen tools/list desselben Starts
// ---------------------------------------------------------------------------------------

/**
 * Jeder Name, den der Servertext nennt, ohne Doppelte.
 *
 * Das Muster ist absichtlich so grob: Es findet jeden Namen, gleich in welchem Block er steht
 * und ob er je jemandem auffällt. Ziffern kommen in keinem der 59 Namen vor (geprüft in
 * `test/registry/names.test.ts`), Umgebungsvariablen wie BB_MCP_READ_ONLY sind großgeschrieben
 * und werden nicht getroffen, und `bb://guide/postings` hat keinen Unterstrich.
 */
function namesIn(text: string): readonly string[] {
  return [...new Set(text.match(/bb_[a-z_]+/gu) ?? [])];
}

/** Ein Profil, das der Betreiber so setzen kann, mit seinem Namen für die Fehlermeldung. */
interface NameProfile {
  readonly label: string;
  readonly env: Record<string, string>;
}

/**
 * Die Profile, in denen jeder genannte Name gegen `tools/list` gehalten wird.
 *
 * Die ersten vier sind die aus dem Befund: der unbeschränkte Standard, das von der README für
 * Claude Desktop empfohlene Profil `bundles`, ein gemischtes Profil und ein Ausschluss. Dazu
 * zwei, die die Ränder abdecken — der Nur-Lesen-Schalter, der einen eigenen Satz mit einem
 * Werkzeugnamen trägt, und `comments`: eine Installation, in der es zu keinem einzigen der
 * genannten Werkzeuge ein angemeldetes Gegenstück gibt.
 */
const NAME_PROFILES: readonly NameProfile[] = [
  { label: "alle zwölf Gruppen", env: {} },
  { label: "nur bundles", env: { BB_MCP_TOOL_GROUPS: "bundles" } },
  {
    label: "bundles, receipts und payment_accounts",
    env: { BB_MCP_TOOL_GROUPS: "bundles,receipts,payment_accounts" },
  },
  {
    label: "bundles und reports mit Nur-Lesen-Schalter",
    env: { BB_MCP_TOOL_GROUPS: "bundles,reports", BB_MCP_READ_ONLY: "true" },
  },
  { label: "alles außer postings", env: { BB_MCP_TOOL_GROUPS_EXCLUDE: "postings" } },
  { label: "nur comments", env: { BB_MCP_TOOL_GROUPS: "comments" } },
];

describe("die Werkzeugnamen im Servertext", () => {
  // Der Befund, gegen den dieser Block steht: Unter BB_MCP_TOOL_GROUPS=bundles standen elf
  // nicht angemeldete Namen im Text — der vollständige Buchungswegweiser samt seinen neun
  // bb_postings_-Namen sowie bb_payment_accounts_list und bb_postingaccounts_search aus der
  // Kontenkunde; unter BB_MCP_TOOL_GROUPS_EXCLUDE=postings neun. Der Gruppenblock sagte drei
  // Absätze vorher „Werkzeuge dieser Gruppen gibt es hier nicht. Nicht danach suchen und
  // keinen Umweg bauen". Ein Agent, der dem Text folgt, ruft ein Werkzeug auf, das tools/list
  // nicht führt, und das ist genau die Rückmeldungslücke, gegen die der Gruppenblock steht.
  for (const profile of NAME_PROFILES) {
    it(`nennt im Profil „${profile.label}" nur angemeldete Werkzeuge`, async () => {
      const started = await start(installTestConfig(profile.env));
      const named = namesIn(started.instructions);
      const missing = named.filter((name) => !started.names.has(name));

      expect(
        missing,
        `Der Servertext nennt im Profil ${JSON.stringify(profile.env)} ${String(missing.length)} ` +
          `Werkzeug(e), die dieser Serverstart nicht anmeldet: ${missing.join(", ")}. ` +
          `Angemeldet sind ${String(started.names.size)}. Jeder Name in den instructions ` +
          "gehört an seine Gruppe gebunden; wo die Gruppe aus ist, gehört der Satz weg oder " +
          "auf ein angemeldetes Werkzeug umgestellt.",
      ).toEqual([]);
    });
  }

  it("nennt im vollen Umfang weiterhin die Werkzeuge, um die es geht", async () => {
    // Die Gegenprobe zur Prüfung oben: Ein Text ganz ohne Werkzeugnamen bestünde sie
    // mühelos und wäre der schlechtere Zustand.
    const started = await start(installTestConfig());
    const named = namesIn(started.instructions);
    expect(named).toContain("bb_payment_accounts_list");
    expect(named).toContain("bb_postingaccounts_search");
    expect(named).toContain("bb_postings_create_for_receipt");
    expect(named.length).toBeGreaterThanOrEqual(11);
  });
});

describe("die Blöcke, die an einer Gruppe hängen", () => {
  it("trägt den Buchungswegweiser nur bei aktiver Gruppe postings", async () => {
    const withPostings = await start(installTestConfig());
    expect(withPostings.instructions).toContain("Welches Buchungswerkzeug brauche ich?");
    expect(withPostings.instructions).toContain("bb://guide/postings");
    resetTestConfig();

    const without = await start(installTestConfig({ BB_MCP_TOOL_GROUPS_EXCLUDE: "postings" }));
    expect(without.instructions).not.toContain("Welches Buchungswerkzeug brauche ich?");
    expect(without.instructions).not.toContain("bb_postings_");
    // Der Verweis auf die Resource nimmt Bezug auf „der Wegweiser oben"; ohne den Block
    // oben wäre er eine Zeile über etwas, das dieser Text nicht enthält.
    expect(without.instructions).not.toContain("bb://guide/postings");
  });

  it("nennt die Nachschlagewerkzeuge der Kontenkunde nach ihrer Gruppe", async () => {
    const full = await start(installTestConfig());
    expect(full.instructions).toContain("Nachschlagen mit bb_payment_accounts_list.");
    expect(full.instructions).toContain("Nachschlagen mit bb_postingaccounts_search.");
    resetTestConfig();

    // Zahlungskonten an, Sachkonten aus: ein Endpunktwerkzeug, ein Bündel.
    const mixed = await start(
      installTestConfig({ BB_MCP_TOOL_GROUPS: "bundles,receipts,payment_accounts" }),
    );
    expect(mixed.instructions).toContain("Nachschlagen mit bb_payment_accounts_list.");
    expect(mixed.instructions).toContain("Nachschlagen mit bb_masterdata_search.");
    expect(mixed.instructions).not.toContain("bb_postingaccounts_search");
    resetTestConfig();

    // Beide Gruppen aus, Bündel an: ein Satz statt zweier gleichlautender.
    const bundles = await start(installTestConfig({ BB_MCP_TOOL_GROUPS: "bundles" }));
    expect(bundles.instructions).toContain("Beide schlägt bb_masterdata_search nach.");
    resetTestConfig();

    // Weder die eigenen Gruppen noch die Bündel: dann wird kein Werkzeug genannt.
    const none = await start(installTestConfig({ BB_MCP_TOOL_GROUPS: "comments" }));
    expect(none.instructions).toContain("KONTEN AUSEINANDERHALTEN");
    expect(namesIn(none.instructions)).toEqual([]);
  });

  it("nennt im Nur-Lesen-Modus nur die Auswertungen, die es hier gibt", async () => {
    const both = await start(
      installTestConfig({ BB_MCP_READ_ONLY: "true", BB_MCP_TOOL_GROUPS: "bundles,reports" }),
    );
    expect(both.instructions).toContain(
      "liefern nur bb_reports_get_ledger und bb_balances_get eine Auswertung",
    );
    resetTestConfig();

    const bundlesOnly = await start(
      installTestConfig({ BB_MCP_READ_ONLY: "true", BB_MCP_TOOL_GROUPS: "bundles" }),
    );
    expect(bundlesOnly.instructions).toContain("liefert nur bb_balances_get eine Auswertung");
    resetTestConfig();

    const reportsOnly = await start(
      installTestConfig({ BB_MCP_READ_ONLY: "true", BB_MCP_TOOL_GROUPS: "reports" }),
    );
    expect(reportsOnly.instructions).toContain("liefert nur bb_reports_get_ledger eine Auswertung");
    resetTestConfig();

    // Ohne beide Gruppen gibt es hier keine Auswertung; dann steht der Satz nicht da.
    const neither = await start(
      installTestConfig({ BB_MCP_READ_ONLY: "true", BB_MCP_TOOL_GROUPS: "comments" }),
    );
    expect(neither.instructions).toContain("Der Schalter nimmt kein Werkzeug aus der Liste.");
    expect(neither.instructions).not.toContain("eine Auswertung");
  });
});
