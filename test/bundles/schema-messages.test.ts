// Die Schemameldungen der fünf Bündel: deutsch, und mit derselben Aussage wie bei den 54.
//
// **Der Befund, der diese Datei ausgelöst hat.** Die Bündel hatten eine eigene, knappere
// Aufbereitung der Zod-Befunde und reichten `issue.message` unverändert durch. Damit antwortete
// `bb_transactions_get` auf eine Zeichenkette im Zahlenfeld mit „transaction_id_by_customer:
// erwartet wird number, übergeben wurde die Zeichenkette '930'.", `bb_assignments_get` bei
// wörtlich derselben Eingabe dagegen mit „Invalid input: expected number, received string".
// Zweierlei war daran falsch: die Sprache — jeder Text, den Agent und Nutzer lesen, ist in
// diesem Projekt deutsch —, und schwerer wiegend der Informationsverlust. „Invalid input:
// expected string, received undefined" sagt bei einem **fehlenden** Pflichtfeld dasselbe wie
// bei einem Typfehler, während die deutsche Fassung „das Feld fehlt" schreibt. Der Unterschied
// zwischen „nachtragen" und „umformen" ist der ganze Zweck der Meldung; im Evaluationslauf
// hat genau diese Verwechslung einen Irrweg erzeugt.
//
// Seitdem benutzen beide Registrierpfade `src/errors/zod-issue.ts`. Diese Datei ist der
// Regressionsschutz dagegen, dass der Bündelpfad wieder eine eigene Fassung bekommt.
//
// Geprüft wird über echte `tools/call`-Aufrufe und nicht am Modul: Ein Test am Modul bliebe
// grün, wenn `bundles/register.ts` es nicht mehr aufriefe.
//
// **Es geht bei keinem Fall ein Request hinaus.** Alle Aufrufe scheitern an Guard 3 oder
// Guard 4, also vor dem ersten Byte; das gilt ausdrücklich auch für das schreibende
// `bb_reports_run`, dessen `create`-Schritt hier nie erreicht wird.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { startBundleServer, type RunningBundleServer } from "../helpers/bundle-server.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";
import { EXPECTED_BUNDLE_NAMES } from "./bundle-list.js";

/**
 * Die englischen Wendungen, die Zod ohne eigene Aufbereitung erzeugt.
 *
 * Sie stehen hier wörtlich und nicht als Muster über „Invalid": Der Auftrag nennt genau diese
 * drei Zeichenfolgen, und eine Prüfung auf ein weiter gefasstes Muster verschöbe die Aussage.
 */
const ENGLISH_MARKERS: readonly string[] = ["Invalid input", "Invalid option", "Unrecognized key"];

/** Die vier Fälle, die jedes Bündel abdecken muss. */
type Category = "invalid_type" | "invalid_value" | "unrecognized_keys" | "pflichtangabe";

interface RefusalCase {
  readonly category: Category;
  /** Was der Fall auslöst, in einem Halbsatz — er steht im Namen des Testfalls. */
  readonly what: string;
  readonly args: Record<string, unknown>;
  /**
   * Belege, die die Antwort führen muss. Sie prüfen die Aussage und nicht nur die Sprache:
   * Eine Meldung ohne englische Wendung, die aber auch nicht mehr sagt, welches Feld fehlt,
   * wäre derselbe Verlust in anderer Verpackung.
   */
  readonly expected: readonly string[];
}

const FROM = "2026-01-01";
const TO = "2026-03-31";

/**
 * Die Fälle je Bündel.
 *
 * `bb_masterdata_search` und `bb_assignments_get` führen **kein** Pflichtfeld im Schema; bei
 * ihnen ist die vierte Zeile deshalb die fehlende Pflicht**angabe**, die das Bündel selbst
 * verlangt: bei `bb_assignments_get` genau eine der beiden Kennungen (Querprüfung B3), bei
 * `bb_masterdata_search` mindestens ein Bereich in einem gesetzten `areas`. Der zweite Fall
 * läuft über den `default`-Zweig der Aufbereitung und ist damit genau die Stelle, an der eine
 * englische Bibliotheksmeldung durchschlüge, wenn der Schemabaustein keinen eigenen Text
 * trüge.
 */
const CASES: Readonly<Record<string, readonly RefusalCase[]>> = {
  bb_masterdata_search: [
    {
      category: "invalid_type",
      what: "max_hits als Zeichenkette",
      args: { query: "Telekom", max_hits: "20" },
      expected: ["max_hits", "erwartet wird number", 'übergeben wurde die Zeichenkette "20"'],
    },
    {
      category: "invalid_value",
      what: "response_format mit einem unbekannten Wert",
      args: { query: "Telekom", response_format: "kurz" },
      expected: ["response_format", "erlaubt sind", "'concise'", "'detailed'"],
    },
    {
      category: "unrecognized_keys",
      what: "ein Tippfehler im Feldnamen",
      args: { query: "Telekom", tippfehler: 1 },
      expected: ["unbekannte Felder tippfehler", "Das Schema ist streng"],
    },
    {
      category: "pflichtangabe",
      what: "areas ohne einen einzigen Bereich",
      args: { areas: [] },
      expected: ["areas", "mindestens ein Bereich"],
    },
  ],
  bb_records_collect: [
    {
      category: "invalid_type",
      what: "max_rows als Zeichenkette",
      args: { resource: "receipts", max_rows: "50" },
      expected: ["max_rows", "erwartet wird number", 'übergeben wurde die Zeichenkette "50"'],
    },
    {
      category: "invalid_value",
      what: "resource mit einem deutschen Wort",
      args: { resource: "belege" },
      expected: ["resource", "erlaubt sind", "'receipts'", "'postings'"],
    },
    {
      category: "unrecognized_keys",
      what: "ein Tippfehler im Feldnamen",
      args: { resource: "receipts", tippfehler: "x" },
      expected: ["unbekannte Felder tippfehler", "Das Schema ist streng"],
    },
    {
      category: "pflichtangabe",
      what: "resource fehlt",
      args: { date_from: FROM, date_to: TO },
      expected: ["resource", "das Feld fehlt"],
    },
  ],
  bb_assignments_get: [
    {
      category: "invalid_type",
      what: "transaction_id_by_customer als Zeichenkette",
      args: { transaction_id_by_customer: "930" },
      expected: [
        "transaction_id_by_customer",
        "erwartet wird number",
        'übergeben wurde die Zeichenkette "930"',
      ],
    },
    {
      category: "invalid_value",
      what: "response_format mit einem unbekannten Wert",
      args: { receipt_id_by_customer: 4711, response_format: "kurz" },
      expected: ["response_format", "erlaubt sind", "'concise'", "'detailed'"],
    },
    {
      category: "unrecognized_keys",
      what: "ein Tippfehler im Feldnamen",
      args: { receipt_id_by_customer: 4711, tippfehler: true },
      expected: ["unbekannte Felder tippfehler", "Das Schema ist streng"],
    },
    {
      category: "pflichtangabe",
      what: "keine der beiden Kennungen gesetzt",
      args: {},
      expected: ["receipt_id_by_customer", "transaction_id_by_customer", "schließen einander aus"],
    },
  ],
  bb_reports_run: [
    {
      category: "invalid_type",
      what: "max_wait_seconds als Zeichenkette",
      args: { report_type: "bwa", date_from: FROM, date_to: TO, max_wait_seconds: "30" },
      expected: ["max_wait_seconds", "erwartet wird number"],
    },
    {
      category: "invalid_value",
      what: "report_type mit einem unbekannten Berichtsnamen",
      args: { report_type: "guv", date_from: FROM, date_to: TO },
      expected: ["report_type", "erlaubt sind", "'bwa'", "'sums'"],
    },
    {
      category: "unrecognized_keys",
      what: "ein Tippfehler im Feldnamen",
      args: { report_type: "bwa", date_from: FROM, date_to: TO, tippfehler: 1 },
      expected: ["unbekannte Felder tippfehler", "Das Schema ist streng"],
    },
    {
      category: "pflichtangabe",
      what: "date_from fehlt",
      args: { report_type: "bwa", date_to: TO },
      expected: ["date_from", "das Feld fehlt"],
    },
  ],
  bb_balances_get: [
    {
      category: "invalid_type",
      what: "max_rows als Zeichenkette",
      args: { account: "1201", date_from: FROM, date_to: TO, max_rows: "50" },
      expected: ["max_rows", "erwartet wird number", 'übergeben wurde die Zeichenkette "50"'],
    },
    {
      category: "invalid_value",
      what: "base mit einem deutschen Wort",
      args: { account: "1201", date_from: FROM, date_to: TO, base: "monat" },
      expected: ["base", "erlaubt sind", "'date'", "'date_delivery_else_date'"],
    },
    {
      category: "unrecognized_keys",
      what: "ein Tippfehler im Feldnamen",
      args: { account: "1201", date_from: FROM, date_to: TO, tippfehler: "x" },
      expected: ["unbekannte Felder tippfehler", "Das Schema ist streng"],
    },
    {
      category: "pflichtangabe",
      what: "date_from fehlt",
      args: { account: "1201", date_to: TO },
      expected: ["date_from", "das Feld fehlt"],
    },
  ],
};

const ALL_CATEGORIES: readonly Category[] = [
  "invalid_type",
  "invalid_value",
  "unrecognized_keys",
  "pflichtangabe",
];

let config: ResolvedConfig;
let server: RunningBundleServer;

beforeEach(async () => {
  config = installTestConfig();
  server = await startBundleServer({ config });
});

afterEach(async () => {
  await server.close();
  resetTestConfig();
});

describe("Die Falltabelle deckt jedes Bündel ab", () => {
  it("führt für jedes der fünf Bündel alle vier Fälle", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_BUNDLE_NAMES) {
      const cases = CASES[name];
      if (cases === undefined) {
        problems.push(
          `${name}: In CASES steht keine Zeile. Ein neues Bündel bekommt seine vier Fälle hier, sonst prüft diese Datei es nicht.`,
        );
        continue;
      }
      for (const category of ALL_CATEGORIES) {
        if (!cases.some((entry) => entry.category === category)) {
          problems.push(`${name}: Der Fall ${category} fehlt in CASES.`);
        }
      }
    }
    for (const name of Object.keys(CASES)) {
      if (!EXPECTED_BUNDLE_NAMES.includes(name)) {
        problems.push(`${name}: steht in CASES, ist aber kein Bündel dieses Servers.`);
      }
    }

    expect(problems.join("\n")).toBe("");
    expect(BUNDLE_ENTRIES).toHaveLength(EXPECTED_BUNDLE_NAMES.length);
  });
});

for (const name of EXPECTED_BUNDLE_NAMES) {
  describe(`${name}: Schemameldungen auf Deutsch`, () => {
    for (const testCase of CASES[name] ?? []) {
      it(`meldet ${testCase.category} deutsch (${testCase.what})`, async () => {
        const result = await server.call(name, testCase.args);

        expect(result.isError).toBe(true);
        for (const marker of ENGLISH_MARKERS) {
          expect(
            result.text.includes(marker)
              ? `${name} (${testCase.category}) antwortet englisch mit "${marker}":\n${result.text}`
              : "",
          ).toBe("");
        }
        for (const fragment of testCase.expected) {
          expect(
            result.text.includes(fragment)
              ? ""
              : `${name} (${testCase.category}): In der Antwort fehlt "${fragment}":\n${result.text}`,
          ).toBe("");
        }
        // Der Vierblockaufbau bleibt auch bei einer Schemaabsage erhalten.
        expect(result.text).toContain("[Warum]");
        expect(result.text).toContain("[Zustand]");
      });
    }
  });
}
