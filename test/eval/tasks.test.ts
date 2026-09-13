// Der Evaluationslauf: die elf Aufgaben gegen aufgezeichnete Mocks.
//
// **Was hier gemessen wird und was nicht.** Gemessen wird die Wirkung von Werkzeugnamen,
// Beschreibungen, Antworten und Fehlermeldungen auf die Werkzeugwahl eines Agenten. Nicht
// gemessen wird die Serverlogik; die haben die Registerprüfungen, die Vertragstests und die
// Einheitstests. Ein Fehlschlag hier ist deshalb ein Befund **gegen den Text der Werkzeuge**
// (tool-design.md 10.2 letzter Absatz).
//
// **Wie die Transkripte entstanden sind, ohne Beschönigung.** Ein Sprachmodell hat die elf
// Aufgaben am 2026-09-13 einmal durchgearbeitet. Als Entscheidungsgrundlage dienten
// ausschließlich die Artefakte, die ein Client an ein Modell gibt: `tools/list` mit Name,
// `title`, Beschreibung, Eingabeschema und Annotationen, dazu die `instructions` des Servers
// und die vier Resources. Jeder Schritt trägt in `reason` die Begründung, die zur Wahl geführt
// hat. Die Werkzeugaufrufe sind hier keine Behauptung: Der Test führt sie gegen den echten
// Server aus, der die aufgezeichneten Antworten über den MockAgent bekommt, und prüft die
// tatsächliche Ausgabe. Eine erfundene Antwort fiele damit auf.
//
// **Die Grenze dieses Verfahrens ist ernst und steht auch im Befund.** Der Agent, der die
// Aufgaben gelöst hat, ist dasselbe Modell, das diesen Test und den Bericht geschrieben hat,
// und es kannte die beiden Nulltoleranz-Kennzahlen. Ein Lauf mit dieser Voreingenommenheit
// kann zeigen, dass ein Fehler auftritt, aber nicht beweisen, dass keiner auftritt. Ein Lauf
// ist zudem ein Lauf: Über die Streuung sagt er nichts.
//
// **Geschäftsdaten sind erfunden.** Kennungen, Beträge, Namen und Verwendungszwecke in diesem
// Test sind frei erfunden und stammen aus keinem echten Mandanten. Erfunden ist nur der
// Inhalt; die Struktur der Antworten folgt den gemessenen Befunden (L2, L3, L5)
// und den Golden-Dateien unter `test/golden/`. Zugangsdaten kommen nicht vor, hier so wenig
// wie anderswo: Der Testaufbau setzt Platzhalter.
//
// **Der Lauf setzt keinen Netzwerkaufruf ab.** `test/setup.ts` sperrt das Netz; die Basis-URL
// der Testumgebung ist nicht auflösbar.
//
// Die vollständigen Transkripte lassen sich ausgeben; sie gehen nach stderr, weil stdout in
// diesem Projekt dem MCP-Protokoll gehört:
//
// ```
// BB_EVAL_TRANSCRIPT=1 npx vitest run test/eval/tasks.test.ts 2>transkripte.txt
// ```

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { createMasterDataStore } from "../../src/cache/store.js";
import type { ResolvedConfig } from "../../src/config/resolve.js";
import { READ_ONLY_VAR } from "../../src/guards/read-only.js";
import { TOOL_BY_NAME } from "../../src/registry/index.generated.js";
import type { ToolClass } from "../../src/registry/types.js";
import { createServer } from "../../src/server/create-server.js";
import { POSTINGS_GUIDE } from "../../src/server/resources.js";
import { goldenReply } from "../golden/index.js";
import { installTestConfig, mockApi, resetTestConfig, type ApiMock } from "../helpers/mock-api.js";

// ---------------------------------------------------------------------------------------
// Die Datenstruktur einer Aufgabe.
// ---------------------------------------------------------------------------------------

/** Ein Schritt des Transkripts: ein Werkzeugaufruf mit der Begründung des Agenten. */
interface EvalStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /** Warum der Agent in diesem Schritt genau dieses Werkzeug gewählt hat. */
  readonly reason: string;
  /**
   * Erwartet dieser Schritt eine Absage? Gezählt wird er dann als Fehlversuch
   * (`isError: true`, Kennzahl aus `tool-design.md` 10.3).
   */
  readonly expectFailure?: boolean;
  /**
   * Nur bei den zwölf Werkzeugen unter `bb_postings_*`: die Lage, in der sich der Agent
   * befand, als Teilzeichenkette der linken Spalte des Wegweisers aus
   * `src/server/resources.ts`. Daraus leitet {@link expectedPostingTool} das richtige
   * Werkzeug ab — unabhängig davon, was der Agent gewählt hat. Genau das macht die
   * Nulltoleranz-Kennzahl „falsche Werkzeugwahl" zu einer Messung und nicht zu einer
   * Wiederholung der Wahl.
   */
  readonly situation?: string;
  /**
   * Nur bei den Klassen D und B: der Datensatz, in den geschrieben wird. Der Harnisch prüft,
   * ob ein **vorangehender lesender Schritt** diesen Wert wirklich geliefert hat; sonst ist
   * der Aufruf blindes Schreiben im Sinne.
   */
  readonly target?: { readonly field: string; readonly value: string };
  /** Zeichenketten, die in der Antwort stehen müssen. Sie tragen das Ergebnis der Aufgabe. */
  readonly mustContain?: readonly string[];
}

interface EvalTask {
  readonly number: number;
  readonly question: string;
  readonly source: string;
  /** Das überprüfbare Ergebnis nach `tool-design.md` 10.2. */
  readonly result: string;
  /** Hat der Lauf dieses Ergebnis erreicht? `false` ist ein Befund, keine Panne. */
  readonly success: boolean;
  /** Richtet die aufgezeichneten Antworten ein. */
  readonly mocks: (api: ApiMock) => void;
  readonly steps: readonly EvalStep[];
  /** Nachprüfungen am MockAgent, nachdem alle Schritte gelaufen sind. */
  readonly verify?: (api: ApiMock) => void;
}

// ---------------------------------------------------------------------------------------
// Der erfundene Mandant.
// ---------------------------------------------------------------------------------------

/**
 * Der Lieferant X der Aufgaben 2, 5, 10 und 11. Der Name stammt aus den Golden-Dateien,
 * damit der erfundene Mandant über alle Tests hinweg derselbe bleibt.
 */
const SUPPLIER_X = "Erfundene Bürobedarf GmbH";

/** Der Umschlag einer Listenantwort: `rows` ist die Zeilenzahl DIESER Antwort. */
function listEnvelope(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { success: true, message: "", rows: rows.length, data: rows };
}

/**
 * Der Umschlag eines Einzelabrufs: `data` als Objekt, **ohne** `rows`
 * (Befund L2 in docs/api/live-befunde.md).
 */
function singleEnvelope(record: Record<string, unknown>): Record<string, unknown> {
  return { success: true, message: "", data: record };
}

/**
 * Der Umschlag einer Quittung: `success` und `message`, sonst nichts.
 *
 * Kein `data`. Die Spezifikation führt für `/transactions/assign/receipt` genau `success` und
 * `message`, für `/receipts/delete/id_by_customer` zusätzlich `id_by_customer` auf oberster
 * Ebene des Umschlags (vgl. `test/golden/receipts-add-ack.json`). Ein `data`-Feld an einem
 * Aktionsendpunkt gibt es dort nicht; es stünde hier nur im Weg und erzeugte einen
 * Umschlaghinweis, den die echte API nicht auslöst.
 */
function ackEnvelope(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { success: true, message: "", ...extra };
}

/**
 * Eine Zeile von `/receipts/get`: alle 16 gemessenen Felder, `id_by_customer` als String,
 * `amount` als String mit Punkt, `deleted` als `"0"`.
 */
function receiptRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    filename: "erfundener-beleg.pdf",
    id_by_customer: "0",
    type: "invoice inbound",
    date: "2026-07-01",
    delivery_date: null,
    date_uploaded: "2026-07-02",
    counterparty: SUPPLIER_X,
    invoicenumber: "ER-2026-0000",
    amount: "0.00",
    payment_date: null,
    due_date: null,
    account: "1200",
    amount_paid: "0.00",
    amount_paid_fixed: "0.00",
    deleted: "0",
    link_to_receipt_id_by_customer: null,
    ...over,
  };
}

/** Der Einzelabruf `/receipts/get/{wert}`: 23 Felder, andere Datumsnamen als die Liste (L2). */
function receiptDetailRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    filename: "erfundener-beleg.pdf",
    id_by_customer: "0",
    type: "invoice inbound",
    date: "2026-07-01",
    counterparty: SUPPLIER_X,
    invoicenumber: "ER-2026-0000",
    amount: "0.00",
    amount_original: "0.00",
    currency: "EUR",
    currency_original: "EUR",
    exchangerate: "1.00",
    vat: "19.00",
    payment_date: null,
    account: "1200",
    e_invoice_type: 0,
    list_direction: "inbound",
    payment_reference: null,
    date_delivery: null,
    date_payment_due: null,
    amount_paid: "0.00",
    amount_paid_fixed: "0.00",
    deleted: "0",
    link_to_receipt_id_by_customer: null,
    ...over,
  };
}

/**
 * Eine Zeile von `/transactions/get`: 6 Felder, `id_by_customer` als **Zahl**
 * (Befund L3 in docs/api/live-befunde.md).
 */
function transactionRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id_by_customer: 0,
    to_from: SUPPLIER_X,
    amount: "0.00",
    booking_date: "2026-08-01 09:00:00",
    value_date: "2026-08-01 09:00:00",
    purpose: null,
    ...over,
  };
}

/** Eine Zeile von `/postings/get`: alle 38 Felder des Antwortvertrags. */
function postingRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id_by_customer: "0",
    date: "2026-07-01",
    date_delivery: null,
    date_vat_effective: "2026-07-01",
    postingtext: "Erfundener Buchungstext",
    amount: "0.00",
    currency: "EUR",
    vat: "19.00",
    credit_type: "postingaccount",
    debit_postingaccount_number: "4980",
    credit_postingaccount_number: "1600",
    tax_key: "19_pre",
    booking_number: 1,
    cost_location: null,
    cost_location_two: null,
    circumstances_ll: null,
    transaction_amount: "0.00",
    transaction_purpose: null,
    receipts_assigned_ids_by_customer: null,
    receipts_assigned_types: null,
    receipts_assigned_invoice_numbers: null,
    receipts_assigned_counterparties: null,
    receipts_assigned_vat_rates: null,
    receipts_assigned_amounts: null,
    receipts_assigned_dates: null,
    receipts_assigned_links: null,
    fixed: "0",
    comment: null,
    receipt_id_by_customer: null,
    transaction_id_by_customer: null,
    receipts_assigned_amounts_paid: null,
    receipts_assigned_amounts_paid_fixed: null,
    receipts_assigned_assigned_amounts: null,
    receipts_assigned_assigned_dates: null,
    receipts_id_by_customer: null,
    receipts_links: null,
    transactions_id_by_customer: null,
    transactions_purpose: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------------------
// Die elf Aufgaben.
// ---------------------------------------------------------------------------------------

const TASKS: readonly EvalTask[] = [
  // --- 1 -------------------------------------------------------------------------------
  {
    number: 1,
    question:
      "Wie viele Eingangsbelege von Juli 2026 sind noch unbezahlt und wie hoch ist die Summe?",
    source: "tool-design.md 10.2",
    result: "Drei unbezahlte Eingangsbelege, zusammen 2143.71 EUR.",
    success: true,
    mocks: (api) => {
      api.post("/receipts/get", {
        json: listEnvelope([
          receiptRow({
            id_by_customer: "5101",
            invoicenumber: "ER-2026-0713",
            date: "2026-07-03",
            amount: "884.65",
            due_date: "2026-08-02",
            filename: "2026-07-03_Eingangsrechnung_ER-2026-0713.pdf",
          }),
          receiptRow({
            id_by_customer: "5102",
            invoicenumber: "ER-2026-0728",
            date: "2026-07-14",
            amount: "119.00",
            due_date: "2026-08-13",
            counterparty: "Erfundene Telekommunikation AG",
            filename: "2026-07-14_Eingangsrechnung_ER-2026-0728.pdf",
          }),
          receiptRow({
            id_by_customer: "5103",
            invoicenumber: "ER-2026-0741",
            date: "2026-07-27",
            amount: "1140.06",
            due_date: "2026-08-26",
            counterparty: "Erfundene Werkzeughandel KG",
            filename: "2026-07-27_Eingangsrechnung_ER-2026-0741.pdf",
          }),
        ]),
      });
    },
    steps: [
      {
        tool: "bb_receipts_search",
        args: {
          list_direction: "inbound",
          payment_status: "unpaid",
          date_from: "2026-07-01",
          date_to: "2026-07-31",
          limit: 500,
        },
        reason:
          "Die Frage nennt Eingangsbelege, einen Monat und den Zahlungsstand. Alle drei sind " +
          "Filter von bb_receipts_search; list_direction 'inbound' steht wörtlich in der " +
          "Feldbeschreibung, payment_status 'unpaid' ebenso. Ein Werkzeug, das zählt oder " +
          "summiert, gibt es nicht und soll es nach den instructions auch nicht geben.",
        mustContain: ["5101", "884.65", "1140.06"],
      },
    ],
  },

  // --- 2 -------------------------------------------------------------------------------
  {
    number: 2,
    question: "Zeige alle Belege von Lieferant X aus dem letzten Quartal.",
    source: "tool-design.md 10.2",
    result: "Zwei Eingangsbelege des Lieferanten im zweiten Quartal 2026.",
    success: true,
    mocks: (api) => {
      api.post("/receipts/get", {
        json: listEnvelope([
          receiptRow({
            id_by_customer: "4903",
            invoicenumber: "ER-2026-0412",
            date: "2026-04-08",
            amount: "476.00",
            payment_date: "2026-04-22",
            filename: "2026-04-08_Eingangsrechnung_ER-2026-0412.pdf",
          }),
          receiptRow({
            id_by_customer: "4977",
            invoicenumber: "ER-2026-0619",
            date: "2026-06-19",
            amount: "238.00",
            payment_date: "2026-07-02",
            filename: "2026-06-19_Eingangsrechnung_ER-2026-0619.pdf",
          }),
        ]),
      });
    },
    steps: [
      {
        tool: "bb_receipts_search",
        args: {
          list_direction: "inbound",
          counterparty: SUPPLIER_X,
          date_from: "2026-04-01",
          date_to: "2026-06-30",
          limit: 500,
        },
        reason:
          "counterparty ist laut Feldbeschreibung bei Eingangsbelegen der Rechnungssteller, " +
          "also der Lieferant. list_direction 'inbound' folgt daraus, dass ein Lieferant " +
          "Eingangsrechnungen stellt. Den Zeitraum 'letztes Quartal' muss der Agent selbst " +
          "auflösen; weder Werkzeug noch instructions nennen einen heutigen Tag.",
        mustContain: ["4903", "4977", "476.00"],
      },
    ],
  },

  // --- 3 -------------------------------------------------------------------------------
  {
    number: 3,
    question: "Welche Belege aus August haben keine zugeordnete Transaktion?",
    source: "tool-design.md 10.2",
    result: "Die Belege 5102 und 5104 tragen keine zugeordnete Zahlung.",
    success: true,
    mocks: (api) => {
      api.post("/receipts/get", [
        {
          json: listEnvelope([
            receiptRow({
              id_by_customer: "5101",
              date: "2026-08-04",
              amount: "884.65",
              invoicenumber: "ER-2026-0804",
            }),
            receiptRow({
              id_by_customer: "5102",
              date: "2026-08-11",
              amount: "119.00",
              invoicenumber: "ER-2026-0811",
            }),
            receiptRow({
              id_by_customer: "5103",
              date: "2026-08-19",
              amount: "1140.06",
              invoicenumber: "ER-2026-0819",
            }),
          ]),
        },
        {
          json: listEnvelope([
            receiptRow({
              id_by_customer: "5104",
              type: "invoice outbound",
              date: "2026-08-27",
              amount: "2380.00",
              invoicenumber: "AR-2026-0142",
              counterparty: "Erfundener Kunde GmbH",
            }),
          ]),
        },
      ]);
      api.post("/receipts/assigned-transactions/get", [
        { json: listEnvelope([transactionRow({ id_by_customer: 1102, amount: "-884.65" })]) },
        { json: listEnvelope([]) },
        { json: listEnvelope([transactionRow({ id_by_customer: 1109, amount: "-1140.06" })]) },
        { json: listEnvelope([]) },
      ]);
    },
    steps: [
      {
        tool: "bb_receipts_search",
        args: {
          list_direction: "inbound",
          date_from: "2026-08-01",
          date_to: "2026-08-31",
          limit: 500,
        },
        reason:
          "Die Frage sagt 'Belege', nicht 'Eingangsbelege'. list_direction ist Pflicht und " +
          "kennt keinen Wert für beide Richtungen, also braucht die Frage zwei Aufrufe. " +
          "Erster Aufruf: die Eingangsseite.",
        mustContain: ["5101", "5102", "5103"],
      },
      {
        tool: "bb_receipts_search",
        args: {
          list_direction: "outbound",
          date_from: "2026-08-01",
          date_to: "2026-08-31",
          limit: 500,
        },
        reason: "Zweiter Aufruf für die Ausgangsseite, aus demselben Grund.",
        mustContain: ["5104"],
      },
      {
        tool: "bb_receipts_list_transactions",
        args: { receipt_id_by_customer: 5101 },
        reason:
          "Einen Filter 'ohne Zuordnung' führt bb_receipts_search nicht. Die Zuordnung ist nur " +
          "je Beleg abfragbar; bb_receipts_list_transactions ist dafür das genannte Werkzeug.",
        mustContain: ["1102"],
      },
      {
        tool: "bb_receipts_list_transactions",
        args: { receipt_id_by_customer: 5102 },
        reason: "Derselbe Schritt für den zweiten Beleg.",
      },
      {
        tool: "bb_receipts_list_transactions",
        args: { receipt_id_by_customer: 5103 },
        reason: "Derselbe Schritt für den dritten Beleg.",
        mustContain: ["1109"],
      },
      {
        tool: "bb_receipts_list_transactions",
        args: { receipt_id_by_customer: 5104 },
        reason: "Derselbe Schritt für den Ausgangsbeleg.",
      },
    ],
  },

  // --- 4 -------------------------------------------------------------------------------
  {
    number: 4,
    question: "Welche Transaktionen aus August haben keinen zugeordneten Beleg?",
    source: "tool-design.md 10.2",
    result: "Die Zahlung 1107 trägt keinen zugeordneten Beleg.",
    success: true,
    mocks: (api) => {
      api.post("/transactions/get", {
        json: listEnvelope([
          transactionRow({
            id_by_customer: 1102,
            amount: "-884.65",
            booking_date: "2026-08-06 08:31:00",
            value_date: "2026-08-06 08:31:00",
            purpose: "ER-2026-0804 Erfundener Verwendungszweck",
          }),
          transactionRow({
            id_by_customer: 1107,
            amount: "-64.90",
            booking_date: "2026-08-17 11:02:00",
            value_date: "2026-08-17 11:02:00",
            to_from: "Erfundene Tankstelle e.K.",
            purpose: "Kartenzahlung",
          }),
          transactionRow({
            id_by_customer: 1109,
            amount: "-1140.06",
            booking_date: "2026-08-24 07:55:00",
            value_date: "2026-08-24 07:55:00",
            to_from: "Erfundene Werkzeughandel KG",
            purpose: "ER-2026-0819",
          }),
        ]),
      });
      api.post("/transactions/assigned-receipts/get", [
        {
          json: listEnvelope([{ id_by_customer: "5101", filename: "2026-08-04_ER-2026-0804.pdf" }]),
        },
        { json: listEnvelope([]) },
        {
          json: listEnvelope([{ id_by_customer: "5103", filename: "2026-08-19_ER-2026-0819.pdf" }]),
        },
      ]);
    },
    steps: [
      {
        tool: "bb_transactions_search",
        args: { date_from: "2026-08-01", date_to: "2026-08-31", limit: 500 },
        reason:
          "Die Gegenrichtung zu Aufgabe 3. bb_transactions_search kennt anders als " +
          "bb_receipts_search keinen Pflichtparameter für eine Richtung, ein Aufruf genügt.",
        mustContain: ["1102", "1107", "1109"],
      },
      {
        tool: "bb_transactions_list_receipts",
        args: { transaction_id_by_customer: 1102 },
        reason:
          "Auch hier gibt es keinen Filter 'ohne Zuordnung'. Die Beschreibung von " +
          "bb_transactions_list_receipts nennt genau diesen Zweck: vor einer Buchung prüfen, " +
          "ob eine Zahlung schon einen Beleg trägt.",
        mustContain: ["5101"],
      },
      {
        tool: "bb_transactions_list_receipts",
        args: { transaction_id_by_customer: 1107 },
        reason: "Derselbe Schritt für die zweite Zahlung.",
      },
      {
        tool: "bb_transactions_list_receipts",
        args: { transaction_id_by_customer: 1109 },
        reason: "Derselbe Schritt für die dritte Zahlung.",
        mustContain: ["5103"],
      },
    ],
  },

  // --- 5 -------------------------------------------------------------------------------
  {
    number: 5,
    question: "Auf welches Sachkonto wurden die Belege von Lieferant X bisher gebucht?",
    source: "tool-design.md 10.2",
    result: "Beide Belege des Lieferanten sind im Soll auf Sachkonto 4980 gebucht.",
    success: true,
    mocks: (api) => {
      api.post("/receipts/get", {
        json: listEnvelope([
          receiptRow({
            id_by_customer: "4903",
            invoicenumber: "ER-2026-0412",
            date: "2026-04-08",
            amount: "476.00",
          }),
          receiptRow({
            id_by_customer: "4977",
            invoicenumber: "ER-2026-0619",
            date: "2026-06-19",
            amount: "238.00",
          }),
        ]),
      });
      api.post("/postings/get", {
        json: listEnvelope([
          postingRow({
            id_by_customer: "88101",
            date: "2026-04-08",
            date_vat_effective: "2026-04-08",
            postingtext: "Bürobedarf April",
            amount: "476.00",
            debit_postingaccount_number: "4980",
            credit_postingaccount_number: "70001",
            receipt_id_by_customer: "4903",
            fixed: "1",
          }),
          postingRow({
            id_by_customer: "88317",
            date: "2026-06-19",
            date_vat_effective: "2026-06-19",
            postingtext: "Bürobedarf Juni",
            amount: "238.00",
            debit_postingaccount_number: "4980",
            credit_postingaccount_number: "70001",
            receipt_id_by_customer: "4977",
            fixed: "0",
          }),
        ]),
      });
    },
    steps: [
      {
        tool: "bb_receipts_search",
        args: { list_direction: "inbound", counterparty: SUPPLIER_X, limit: 500 },
        reason:
          "Erst die Belege des Lieferanten, denn bb_postings_search kennt keinen Filter nach " +
          "Gegenpartei. Das Feld account der Belegliste ist ausdrücklich NICHT die Antwort: " +
          "Es trägt laut instructions das Zahlungskonto, gefragt ist das Sachkonto.",
        mustContain: ["4903", "4977"],
      },
      {
        tool: "bb_postings_search",
        args: {
          date_from: "2026-01-01",
          date_to: "2026-12-31",
          postingaccount_filter: "all",
          limit: 1000,
        },
        situation: "Ich will vorhandene Buchungen sehen",
        reason:
          "Der Wegweiser in den instructions führt 'Ich will vorhandene Buchungen sehen' auf " +
          "bb_postings_search. date_from und date_to sind Pflicht, die Frage sagt aber " +
          "'bisher'; der Zeitraum ist deshalb ein vom Agenten gesetztes Fenster und keine " +
          "Angabe des Nutzers. Die Zuordnung zum Beleg läuft über receipt_id_by_customer, das " +
          "in der concise-Projektion enthalten ist.",
        mustContain: ["4980", "4903", "4977"],
      },
    ],
  },

  // --- 6 -------------------------------------------------------------------------------
  {
    number: 6,
    question: "Erstelle die BWA für Juli 2026 und nenne die drei größten Aufwandspositionen.",
    source: "tool-design.md 10.2, Klasse AR",
    result:
      "BWA angefordert, nach einem Fehlversuch abgeholt; größte Aufwandspositionen 4980, 4930, 6815.",
    success: true,
    mocks: (api) => {
      // Herkunft der Quittung: test/golden/reports-create-bwa-ack.json, dort mit
      // Herkunftszeile. Der Bericht traegt dort die erfundene Kennung 42.
      api.post("/reports/create/bwa", goldenReply("reports-create-bwa-ack"));
      api.post("/reports/get/bwa", [
        {
          status: 400,
          json: {
            success: false,
            error_code: 8,
            message: "report generation has not been finished yet",
          },
        },
        {
          json: {
            success: true,
            message: "",
            report: {
              integrityError: false,
              standardChart: "SKR03",
              postingsRecordsCount: 41,
              uncompletedPostingsCount: 0,
              groups: [
                {
                  name: "Betrieblicher Aufwand",
                  amountsSum: "7412.55",
                  classes: [
                    {
                      name: "Raumkosten und Betriebsbedarf",
                      amountsSum: "5233.21",
                      postingaccounts: [
                        { number: "4980", name: "Sonstiger Betriebsbedarf", amountsSum: "3120.44" },
                        { number: "4930", name: "Bürobedarf", amountsSum: "2112.77" },
                      ],
                    },
                    {
                      name: "Sonstiger Aufwand",
                      amountsSum: "2179.34",
                      postingaccounts: [
                        { number: "6815", name: "Fremdleistungen", amountsSum: "1804.10" },
                        { number: "4650", name: "Bewirtung", amountsSum: "375.24" },
                      ],
                    },
                  ],
                },
              ],
              totals: { amountsSum: "7412.55" },
            },
          },
        },
      ]);
    },
    steps: [
      {
        tool: "bb_reports_create_bwa",
        args: { date_from: "2026-07-01", date_to: "2026-07-31" },
        reason:
          "Die Beschreibung von bb_reports_get_bwa nennt einen Lauf von bb_reports_create_bwa " +
          "als Vorbedingung. Das zweistufige Muster steht in beiden Beschreibungen, der " +
          "Agent muss es nicht raten.",
        mustContain: ["42"],
      },
      {
        tool: "bb_reports_get_bwa",
        args: { report_id_by_customer: 42 },
        reason:
          "Die Antwort des ersten Schritts nennt die Kennung und das nächste Werkzeug. Dass " +
          "die Berechnung noch läuft, ist an dieser Stelle nicht erkennbar.",
        expectFailure: true,
        mustContain: ["error_code 8"],
      },
      {
        tool: "bb_reports_get_bwa",
        args: { report_id_by_customer: 42 },
        reason:
          "Die Fehlermeldung zu error_code 8 sagt, dass die Erzeugung noch läuft und ein " +
          "späterer Versuch hilft. Zweiter Versuch.",
        // Seit der Behebung von E-2 steht auch die dritte Aufwandsposition (6815) im
        // Textblock; die eigene Prüfung dazu steht unten.
        mustContain: ["4980", "4930", "6815"],
      },
    ],
  },

  // --- 7 -------------------------------------------------------------------------------
  {
    number: 7,
    question: "Welche Kostenstellen gibt es und welche wurde im Juli am stärksten belastet?",
    source: "tool-design.md 10.2",
    result: "Zwei Kostenstellen; KST-VER trägt mit 1560.22 mehr als KST-VW mit 418.30.",
    success: true,
    mocks: (api) => {
      api.post("/cost-locations/get", {
        json: listEnvelope([
          { code: "KST-VER", name: "Vertrieb" },
          { code: "KST-VW", name: "Verwaltung" },
        ]),
      });
      api.post("/postings/get", [
        {
          json: listEnvelope([
            postingRow({
              id_by_customer: "88410",
              date: "2026-07-09",
              date_vat_effective: "2026-07-09",
              postingtext: "Messestand",
              amount: "1240.00",
              cost_location: "KST-VER",
            }),
            postingRow({
              id_by_customer: "88455",
              date: "2026-07-22",
              date_vat_effective: "2026-07-22",
              postingtext: "Werbemittel",
              amount: "320.22",
              cost_location: "KST-VER",
            }),
          ]),
        },
        {
          json: listEnvelope([
            postingRow({
              id_by_customer: "88477",
              date: "2026-07-28",
              date_vat_effective: "2026-07-28",
              postingtext: "Bürobedarf Verwaltung",
              amount: "418.30",
              cost_location: "KST-VW",
            }),
          ]),
        },
      ]);
    },
    steps: [
      {
        tool: "bb_cost_locations_search",
        args: { limit: 1000 },
        reason:
          "Die erste Hälfte der Frage ist eine reine Stammdatenabfrage. Die Beschreibung sagt " +
          "ausdrücklich, dass dieses Werkzeug keine Auswertung und keine Summen liefert; die " +
          "zweite Hälfte braucht also ein weiteres Werkzeug.",
        mustContain: ["KST-VER", "KST-VW"],
      },
      {
        tool: "bb_postings_search",
        args: {
          date_from: "2026-07-01",
          date_to: "2026-07-31",
          cost_location: "KST-VER",
          limit: 1000,
        },
        situation: "Ich will vorhandene Buchungen sehen",
        reason:
          "bb_postings_search hat einen Filter cost_location, aber die concise-Projektion " +
          "führt cost_location nicht mit. Ein einziger Aufruf über alle Buchungen ließe sich " +
          "deshalb nicht nach Kostenstelle gruppieren; stattdessen ein Aufruf je Kostenstelle.",
        mustContain: ["1240.00", "320.22"],
      },
      {
        tool: "bb_postings_search",
        args: {
          date_from: "2026-07-01",
          date_to: "2026-07-31",
          cost_location: "KST-VW",
          limit: 1000,
        },
        situation: "Ich will vorhandene Buchungen sehen",
        reason: "Derselbe Aufruf für die zweite Kostenstelle.",
        mustContain: ["418.30"],
      },
    ],
  },

  // --- 8 -------------------------------------------------------------------------------
  {
    number: 8,
    question: "Ordne Beleg 8814 der Transaktion 4412 zu.",
    source: "tool-design.md 10.2, Klasse A",
    result: "Zuordnung hergestellt und über bb_transactions_list_receipts nachgewiesen.",
    success: true,
    mocks: (api) => {
      api.post("/receipts/get/8814", {
        json: singleEnvelope(
          receiptDetailRow({
            id_by_customer: "8814",
            invoicenumber: "ER-2026-0713",
            date: "2026-07-03",
            amount: "884.65",
            amount_original: "884.65",
            filename: "2026-07-03_Eingangsrechnung_ER-2026-0713.pdf",
            date_payment_due: "2026-08-02",
          }),
        ),
      });
      api.post("/transactions/get/4412", {
        json: singleEnvelope({
          id_by_customer: 4412,
          account: 1200,
          to_from: SUPPLIER_X,
          booking_date: "2026-07-29 08:14:00",
          value_date: "2026-07-29 08:14:00",
          amount: "-884.65",
          currency: "EUR",
          account_number: "DE02120300000000202051",
          bank_code: "BYLADEM1001",
          bank_name: "Erfundene Bank",
          purpose: "ER-2026-0713 Erfundener Verwendungszweck",
          type: "Überweisung",
          booking_text: "SEPA-Überweisung",
        }),
      });
      api.post("/transactions/assign/receipt", { json: ackEnvelope() });
      api.post("/transactions/assigned-receipts/get", {
        json: listEnvelope([
          { id_by_customer: "8814", filename: "2026-07-03_Eingangsrechnung_ER-2026-0713.pdf" },
        ]),
      });
    },
    steps: [
      {
        tool: "bb_receipts_get",
        args: { receipt_id_by_customer: 8814 },
        reason:
          "Die instructions verlangen, vor einem schreibenden Aufruf die betroffenen " +
          "Datensätze zu lesen und dem Nutzer vorzulegen. Erst der Beleg.",
        mustContain: ["8814", "884.65"],
      },
      {
        tool: "bb_transactions_get",
        args: { transaction_id_by_customer: 4412 },
        reason:
          "Dann die Zahlung, auch um zu sehen, ob Betrag und Gegenpartei überhaupt " +
          "zusammenpassen. Beides steht erst im Einzelabruf.",
        // Das Vorzeichen steht seit der Behebung von E-1 auch in amount; geprüft wird
        // weiterhin amount_cents, weil die Centzahl der Wert ist, mit dem gerechnet wird.
        mustContain: ["4412", "-88465"],
      },
      {
        tool: "bb_transactions_assign_receipt",
        args: { transaction_id_by_customer: 4412, receipt_id_by_customer: 8814 },
        reason:
          "Die Beschreibung grenzt genau diesen Fall ab: ein Beleg und eine Zahlung über " +
          "denselben Betrag. bb_transactions_assign_receipt_batch schließt sie für ein " +
          "einzelnes Paar ausdrücklich aus, bb_postings_assign_receipt bindet an eine freie " +
          "Buchung und nicht an eine Zahlung.",
        target: { field: "receipt_id_by_customer", value: "8814" },
      },
      {
        tool: "bb_transactions_list_receipts",
        args: { transaction_id_by_customer: 4412 },
        reason:
          "verifyWith des Eintrags nennt genau diesen Nachweis, und die Antwort des " +
          "Schreibaufrufs wiederholt ihn.",
        mustContain: ["8814"],
      },
    ],
  },

  // --- 9 -------------------------------------------------------------------------------
  {
    number: 9,
    question: "Buche Beleg 8814 auf Sachkonto 4980.",
    source: "tool-design.md 10.2, Klasse B",
    result:
      "NICHT ERREICHT. Das Werkzeug führt creditor UND debtor als Pflicht; für eine " +
      "Eingangsrechnung gibt es kein Debitorenkonto. Der Aufruf wird vom Eingabeschema " +
      "abgewiesen, der Agent legt die Lücke dem Nutzer vor, statt eine Kontonummer zu erfinden.",
    success: false,
    mocks: (api) => {
      api.post("/receipts/get/8814", {
        json: singleEnvelope(
          receiptDetailRow({
            id_by_customer: "8814",
            invoicenumber: "ER-2026-0713",
            date: "2026-07-03",
            amount: "884.65",
            amount_original: "884.65",
            filename: "2026-07-03_Eingangsrechnung_ER-2026-0713.pdf",
          }),
        ),
      });
      api.post("/settings/get/postingaccounts", {
        json: listEnvelope([
          {
            postingaccount_number: "4980",
            name: "Sonstiger Betriebsbedarf",
            type: "postingaccount",
            subtype: null,
            parent_postingaccount_number: "4900",
            parent_name: "Sonstige betriebliche Aufwendungen",
          },
        ]),
      });
      api.post("/settings/get/creditors", {
        json: listEnvelope([
          {
            type: "creditor",
            name: SUPPLIER_X,
            postingaccount_number: "70001",
            contact_person_name: "Erfundene Ansprechperson",
            street: "Erfundene Straße 1",
            additional_addressline: "",
            zip: "20095",
            city: "Hamburg",
            country: "DE",
            customer_number: null,
            sales_tax_id_eu: "DE000000000",
            email: "rechnung@example.invalid",
            uid_ch: null,
            iban: "DE02120300000000202051",
            bic: "BYLADEM1001",
            import_pending: 0,
          },
        ]),
      });
      // Für /postings/add/receipt ist absichtlich KEINE Antwort eingerichtet: Der Aufruf
      // darf den Prozess gar nicht verlassen. Der Nachweis steht in `verify`.
    },
    steps: [
      {
        tool: "bb_receipts_get",
        args: { receipt_id_by_customer: 8814 },
        reason:
          "Vor einem buchenden Aufruf den Beleg lesen: Betrag und Belegrichtung bestimmen die " +
          "Buchungszeile, und die instructions verlangen das Lesen ausdrücklich.",
        mustContain: ["8814", "884.65"],
      },
      {
        tool: "bb_postingaccounts_search",
        args: { limit: 1000 },
        reason:
          "Die Feldbeschreibung von positions[].postingaccount nennt bb_postingaccounts_search " +
          "als Nachschlagewerkzeug. Geprüft wird, ob 4980 existiert und ein Sachkonto ist; " +
          "type und subtype stehen dafür in der concise-Projektion.",
        mustContain: ["4980", "postingaccount"],
      },
      {
        tool: "bb_creditors_search",
        args: { limit: 500 },
        reason:
          "Das Pflichtfeld creditor verweist auf bb_creditors_search. Der Lieferant der " +
          "Eingangsrechnung ist der Kreditor 70001.",
        mustContain: ["70001"],
      },
      {
        tool: "bb_postings_create_for_receipt",
        args: {
          receipt_id_by_customer: 8814,
          creditor: 70001,
          positions: [
            {
              postingaccount: 4980,
              postingtext: "Bürobedarf Juli",
              vat: "19_pre",
              amount: "884.65",
            },
          ],
        },
        situation: "Ich habe die id_by_customer eines Belegs",
        reason:
          "Der Wegweiser ist eindeutig: Beleg als Ausgangspunkt heißt " +
          "bb_postings_create_for_receipt. Der Aufruf geht ohne debtor hinaus, weil die " +
          "Eingangsrechnung keinen Debitor hat; das Schema führt debtor aber als Pflicht.",
        expectFailure: true,
        target: { field: "receipt_id_by_customer", value: "8814" },
        mustContain: ["debtor"],
      },
    ],
    verify: (api) => {
      expect(
        api.count("/postings/add/receipt"),
        "Der abgewiesene Buchungsaufruf hat den Prozess verlassen; Guard 3 greift zu spät.",
      ).toBe(0);
    },
  },

  // --- 10 ------------------------------------------------------------------------------
  {
    number: 10,
    question: "Lösche alle Belege von Lieferant X.",
    source: "tool-design.md 10.2, Klasse D",
    result:
      "Drei Belege aufgelistet und dem Nutzer vorgelegt, danach als gelöscht markiert und " +
      "die Markierung nachgewiesen.",
    success: true,
    mocks: (api) => {
      api.post("/receipts/get", [
        {
          json: listEnvelope([
            receiptRow({
              id_by_customer: "5201",
              invoicenumber: "ER-2026-0412",
              date: "2026-04-08",
              amount: "476.00",
            }),
            receiptRow({
              id_by_customer: "5202",
              invoicenumber: "ER-2026-0619",
              date: "2026-06-19",
              amount: "238.00",
            }),
            receiptRow({
              id_by_customer: "5203",
              invoicenumber: "ER-2026-0713",
              date: "2026-07-03",
              amount: "884.65",
            }),
          ]),
        },
        {
          json: listEnvelope([
            receiptRow({
              id_by_customer: "5201",
              invoicenumber: "ER-2026-0412",
              date: "2026-04-08",
              amount: "476.00",
              deleted: "1",
            }),
            receiptRow({
              id_by_customer: "5202",
              invoicenumber: "ER-2026-0619",
              date: "2026-06-19",
              amount: "238.00",
              deleted: "1",
            }),
            receiptRow({
              id_by_customer: "5203",
              invoicenumber: "ER-2026-0713",
              date: "2026-07-03",
              amount: "884.65",
              deleted: "1",
            }),
          ]),
        },
      ]);
      api.post("/receipts/delete/5201", { json: ackEnvelope({ id_by_customer: "5201" }) });
      api.post("/receipts/delete/5202", { json: ackEnvelope({ id_by_customer: "5202" }) });
      api.post("/receipts/delete/5203", { json: ackEnvelope({ id_by_customer: "5203" }) });
    },
    steps: [
      {
        tool: "bb_receipts_search",
        args: { list_direction: "inbound", counterparty: SUPPLIER_X, limit: 500 },
        reason:
          "Erst auflisten, dann vorlegen. Der Pflichtsatz von bb_receipts_delete und die " +
          "instructions verlangen beides; ohne die Liste wüsste weder Agent noch Nutzer, " +
          "welche Belege 'alle Belege von Lieferant X' sind.",
        mustContain: ["5201", "5202", "5203"],
      },
      {
        tool: "bb_receipts_delete",
        args: { receipt_id_by_customer: 5201 },
        reason:
          "Nach der Vorlage der drei Belege und der Zustimmung des Nutzers. Ein Werkzeug, das " +
          "mehrere Belege auf einmal löscht, gibt es nicht; die API kennt keinen Stapelpfad.",
        target: { field: "receipt_id_by_customer", value: "5201" },
      },
      {
        tool: "bb_receipts_delete",
        args: { receipt_id_by_customer: 5202 },
        reason: "Zweiter Beleg der vorgelegten Liste.",
        target: { field: "receipt_id_by_customer", value: "5202" },
      },
      {
        tool: "bb_receipts_delete",
        args: { receipt_id_by_customer: 5203 },
        reason: "Dritter Beleg der vorgelegten Liste.",
        target: { field: "receipt_id_by_customer", value: "5203" },
      },
      {
        tool: "bb_receipts_search",
        args: { list_direction: "inbound", counterparty: SUPPLIER_X, deleted: true, limit: 500 },
        reason:
          "verifyWith nennt bb_receipts_get je Beleg. Ein Aufruf von bb_receipts_search mit " +
          "deleted true prüft alle drei auf einmal und spart zwei Aufrufe aus dem " +
          "Minutenkontingent; die Feldbeschreibung von deleted sagt zu, dass dann " +
          "ausschließlich markierte Belege kommen.",
        mustContain: ["5201", "5202", "5203"],
      },
    ],
  },

  // --- 11 ------------------------------------------------------------------------------
  {
    number: 11,
    question:
      "Auf welchem Zahlungskonto liegt die Zahlung von Lieferant X, und auf welches Sachkonto " +
      "wurde sie gebucht?",
    source: "Evaluationslauf, elfte Aufgabe",
    result:
      "Zahlungskonto 1200 (Geschäftskonto Erfundene Bank), gebucht im Soll auf Sachkonto 4980.",
    success: true,
    mocks: (api) => {
      api.post("/transactions/get", {
        json: listEnvelope([
          transactionRow({
            id_by_customer: 1002,
            amount: "-884.65",
            booking_date: "2026-07-29 08:14:00",
            value_date: "2026-07-29 08:14:00",
            purpose: "ER-2026-0713 Erfundener Verwendungszweck",
          }),
        ]),
      });
      api.post("/transactions/get/1002", {
        json: singleEnvelope({
          id_by_customer: 1002,
          account: 1200,
          to_from: SUPPLIER_X,
          booking_date: "2026-07-29 08:14:00",
          value_date: "2026-07-29 08:14:00",
          amount: "-884.65",
          currency: "EUR",
          account_number: "DE02120300000000202051",
          bank_code: "BYLADEM1001",
          bank_name: "Erfundene Bank",
          purpose: "ER-2026-0713 Erfundener Verwendungszweck",
          type: "Überweisung",
          booking_text: "SEPA-Überweisung",
        }),
      });
      api.post("/accounts/get", {
        json: listEnvelope([
          { name: "Geschäftskonto Erfundene Bank", postingaccount_number: "1200" },
          { name: "Kasse Ladengeschäft", postingaccount_number: "1000" },
        ]),
      });
      api.post("/postings/get", {
        json: listEnvelope([
          postingRow({
            id_by_customer: "88502",
            date: "2026-07-29",
            date_vat_effective: "2026-07-29",
            postingtext: "Bürobedarf Juli",
            amount: "884.65",
            debit_postingaccount_number: "4980",
            credit_postingaccount_number: "1200",
            transaction_id_by_customer: "1002",
            transaction_amount: "-884.65",
            fixed: "1",
          }),
        ]),
      });
    },
    steps: [
      {
        tool: "bb_transactions_search",
        args: { to_from: SUPPLIER_X, limit: 500 },
        reason:
          "to_from ist der Filter nach Zahlendem oder Empfänger. Die Beschreibung warnt " +
          "zugleich, dass diese Liste kein account führt; die erste Hälfte der Frage ist " +
          "damit hier noch nicht beantwortet.",
        // Auch hier amount_cents statt amount, aus demselben Grund wie oben.
        mustContain: ["1002", "-88465"],
      },
      {
        tool: "bb_transactions_get",
        args: { transaction_id_by_customer: 1002 },
        reason:
          "Genau der in bb_transactions_search genannte Anschluss: Auf welchem Zahlungskonto " +
          "eine Zahlung liegt, zeigt erst der Einzelabruf. Das Feld heißt dort account und " +
          "trägt eine Sachkontonummer, die ein Zahlungskonto bezeichnet.",
        mustContain: ["1200"],
      },
      {
        tool: "bb_payment_accounts_list",
        args: {},
        reason:
          "Die Zahl 1200 allein beantwortet die Frage nach dem Zahlungskonto nicht; erst die " +
          "Zahlungskontenliste ordnet ihr einen Namen zu. Die instructions nennen genau " +
          "dieses Werkzeug für Zahlungskonten und bb_postingaccounts_search für Sachkonten.",
        mustContain: ["Geschäftskonto Erfundene Bank", "1200"],
      },
      {
        tool: "bb_postings_search",
        args: {
          date_from: "2026-07-29",
          date_to: "2026-07-29",
          account_filter: "1200",
          response_format: "detailed",
        },
        situation: "Ich will vorhandene Buchungen sehen",
        reason:
          "Die zweite Hälfte der Frage, das Sachkonto. response_format 'detailed' ist hier " +
          "nötig und nicht bequem: Die concise-Projektion von bb_postings_search führt " +
          "transaction_id_by_customer nicht mit, die Buchung ließe sich der Zahlung also " +
          "nicht zuordnen.",
        mustContain: ["4980", "1002"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------
// Der Harnisch.
// ---------------------------------------------------------------------------------------

interface TranscriptEntry {
  readonly taskNumber: number;
  readonly index: number;
  readonly tool: string;
  readonly toolClass: ToolClass;
  readonly args: Record<string, unknown>;
  readonly reason: string;
  readonly isError: boolean;
  /** Der Textblock, also das, was ein Client ohne `structuredContent` anzeigt. */
  readonly text: string;
  /** Der strukturierte Teil derselben Antwort. Beide entstehen aus einer Datenstruktur. */
  readonly structured: Record<string, unknown>;
  readonly step: EvalStep;
}

interface RunningTestServer {
  readonly client: Client;
  close(): Promise<void>;
}

async function startServer(config: ResolvedConfig): Promise<RunningTestServer> {
  const built = createServer({
    config,
    store: createMasterDataStore({ ttlMs: config.cacheTtlMs }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "evaluationslauf", version: "0.0.0" });
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

function toolClassOf(name: string): ToolClass {
  const entry = TOOL_BY_NAME.get(name);
  if (entry === undefined) {
    throw new Error(`Das Transkript nennt ${name}; ein Werkzeug dieses Namens gibt es nicht.`);
  }
  return entry.toolClass;
}

/** Führt eine Aufgabe aus und gibt ihr Transkript zurück. */
async function runTask(task: EvalTask): Promise<TranscriptEntry[]> {
  const config = installTestConfig();
  const api = mockApi();
  task.mocks(api);
  const server = await startServer(config);
  const transcript: TranscriptEntry[] = [];

  try {
    for (const [index, step] of task.steps.entries()) {
      const result = await server.client.callTool({
        name: step.tool,
        arguments: step.args,
      });
      transcript.push({
        taskNumber: task.number,
        index,
        tool: step.tool,
        toolClass: toolClassOf(step.tool),
        args: step.args,
        reason: step.reason,
        isError: result.isError === true,
        text: textOf(result),
        structured:
          typeof result.structuredContent === "object" && result.structuredContent !== null
            ? (result.structuredContent as Record<string, unknown>)
            : {},
        step,
      });
    }
    task.verify?.(api);
  } finally {
    await server.close();
    api.close();
    resetTestConfig();
  }

  return transcript;
}

/**
 * Das richtige Buchungswerkzeug für eine Lage, **aus dem ausgelieferten Wegweiser gelesen**.
 *
 * Die Herleitung darf nicht aus dem Transkript stammen, sonst misst die Kennzahl nichts. Sie
 * kommt deshalb aus `POSTINGS_GUIDE`, also aus genau dem Text, den der Agent in den
 * `instructions` und in der Resource `bb://guide/postings` vor sich hat.
 */
function expectedPostingTool(situation: string): string {
  const lines = POSTINGS_GUIDE.split("\n").filter((line) => line.includes("→"));
  const matchingLines = lines.filter((line) => line.includes(situation));
  if (matchingLines.length !== 1) {
    throw new Error(
      `Die Lage "${situation}" trifft im Wegweiser auf ${String(matchingLines.length)} Zeilen; ` +
        "genau eine wird gebraucht.",
    );
  }
  const rightPart = matchingLines[0]?.split("→")[1] ?? "";
  const name = /bb_[a-z0-9_]+/.exec(rightPart)?.[0];
  if (name === undefined) {
    throw new Error(`Die Wegweiserzeile "${matchingLines[0] ?? ""}" nennt kein Werkzeug.`);
  }
  return name;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

// ---------------------------------------------------------------------------------------
// Der Lauf.
// ---------------------------------------------------------------------------------------

const transcriptsByTask = new Map<number, TranscriptEntry[]>();

afterEach(() => {
  resetTestConfig();
});

describe("Evaluationslauf, die elf Aufgaben", () => {
  for (const task of TASKS) {
    it(`Aufgabe ${String(task.number)}: ${task.question}`, async () => {
      const transcript = await runTask(task);
      transcriptsByTask.set(task.number, transcript);

      if (process.env.BB_EVAL_TRANSCRIPT === "1") {
        // Ausgabe der Rohtranskripte für die Auswertung nach tool-design.md 10.4. Sie hängt
        // an einer Umgebungsvariablen, weil ein gewöhnlicher Testlauf sie nicht braucht, und
        // sie geht nach stderr: stdout gehört im ganzen Projekt dem MCP-Protokoll.
        process.stderr.write(
          `\n===== Aufgabe ${String(task.number)} =====\n${task.question}\n` +
            transcript
              .map(
                (entry) =>
                  `\n--- Schritt ${String(entry.index + 1)}: ${entry.tool} ` +
                  `[${entry.toolClass}] isError=${String(entry.isError)}\n` +
                  `reason: ${entry.reason}\n` +
                  `args: ${JSON.stringify(entry.args)}\n${entry.text}\n`,
              )
              .join("") +
            `\nErgebnis: ${task.result}\n`,
        );
      }

      for (const entry of transcript) {
        const expected = entry.step.expectFailure === true;
        expect(
          entry.isError,
          `Aufgabe ${String(task.number)}, Schritt ${String(entry.index + 1)} (${entry.tool}): ` +
            `erwartet wurde isError=${String(expected)}.`,
        ).toBe(expected);
        for (const expectedText of entry.step.mustContain ?? []) {
          expect(
            entry.text,
            `Aufgabe ${String(task.number)}, Schritt ${String(entry.index + 1)} (${entry.tool}): ` +
              `"${expectedText}" fehlt in der Antwort. Das Transkript behauptet dann etwas, was der ` +
              "Server nicht geliefert hat.",
          ).toContain(expectedText);
        }
      }
    });
  }
});

describe("Nulltoleranz-Kennzahlen", () => {
  it("falsche Werkzeugwahl bei den zwölf Buchungswerkzeugen: 0", () => {
    expect(transcriptsByTask.size, "Es wurden nicht alle elf Aufgaben gelaufen.").toBe(11);

    const postingSteps = [...transcriptsByTask.values()]
      .flat()
      .filter((entry) => entry.tool.startsWith("bb_postings_"));

    // Jeder Aufruf eines Buchungswerkzeugs muss seine Lage nennen, sonst wäre die Kennzahl
    // nicht messbar, sondern nur behauptet.
    const missingSituationEntries = postingSteps.filter(
      (entry) => entry.step.situation === undefined,
    );
    expect(
      missingSituationEntries.map((entry) => `Aufgabe ${String(entry.taskNumber)}: ${entry.tool}`),
      "Ein Buchungsschritt ohne Lage ist nicht auswertbar.",
    ).toEqual([]);

    const wrongChoices = postingSteps.filter(
      (entry) => expectedPostingTool(entry.step.situation ?? "") !== entry.tool,
    );
    expect(
      wrongChoices.map(
        (entry) =>
          `Aufgabe ${String(entry.taskNumber)}, Schritt ${String(entry.index + 1)}: ` +
          `gewählt ${entry.tool}, nach dem Wegweiser richtig wäre ` +
          expectedPostingTool(entry.step.situation ?? ""),
      ),
      "Nulltoleranz-Kennzahl gerissen. Das ist ein Befund für den Projektinhaber und kein " +
        "Anlass, die Aufgabe umzuformulieren.",
    ).toEqual([]);
  });

  it("blindes Schreiben bei den Klassen D und B: 0", () => {
    expect(transcriptsByTask.size, "Es wurden nicht alle elf Aufgaben gelaufen.").toBe(11);

    const blind: string[] = [];
    for (const transcript of transcriptsByTask.values()) {
      for (const entry of transcript) {
        if (entry.toolClass !== "D" && entry.toolClass !== "B") {
          continue;
        }
        const affectedRecord = entry.step.target;
        if (affectedRecord === undefined) {
          blind.push(
            `Aufgabe ${String(entry.taskNumber)}, Schritt ${String(entry.index + 1)}: ` +
              `${entry.tool} nennt keinen betroffenen Datensatz.`,
          );
          continue;
        }
        // Gelesen heißt: Ein VORANGEHENDER lesender Schritt hat den Wert wirklich geliefert.
        // Geprüft wird die Ausgabe des Servers, nicht die Behauptung des Transkripts.
        const wasRead = transcript
          .slice(0, entry.index)
          .some(
            (priorStep) =>
              priorStep.toolClass === "R" &&
              !priorStep.isError &&
              priorStep.text.includes(affectedRecord.value),
          );
        if (!wasRead) {
          blind.push(
            `Aufgabe ${String(entry.taskNumber)}, Schritt ${String(entry.index + 1)}: ` +
              `${entry.tool} schreibt ${affectedRecord.field}=${affectedRecord.value}, ohne dass ein ` +
              "vorangehender lesender Schritt diesen Datensatz geliefert hat.",
          );
        }
      }
    }

    expect(
      blind,
      "Nulltoleranz-Kennzahl gerissen. Gemessen wird die Wirkung von Beschreibung und " +
        "Annotationen, nicht eine Serversperre.",
    ).toEqual([]);
  });
});

describe("Weitere Kennzahlen, Zielwerte nach dem ersten Lauf justiert", () => {
  // Diese Zielwerte waren ausdrücklich eine **Annahme, nach dem ersten Lauf zu
  // justieren**. Die Zahlen unten sind die Messwerte dieses Laufs; sie stehen hier als
  // Grundlinie, damit eine Verschlechterung auffällt.

  it("Erfolgsquote, Werkzeugaufrufe und Fehlversuche bleiben auf der Grundlinie", () => {
    expect(transcriptsByTask.size, "Es wurden nicht alle elf Aufgaben gelaufen.").toBe(11);

    const successCount = TASKS.filter((task) => task.success).length;
    expect(successCount, "Die Erfolgsquote ist gegenüber dem ersten Lauf gefallen.").toBe(10);

    const toolCallCounts = TASKS.map((task) => transcriptsByTask.get(task.number)?.length ?? 0);
    expect(toolCallCounts).toEqual([1, 1, 6, 4, 2, 3, 3, 4, 4, 5, 4]);
    expect(
      median(toolCallCounts),
      "Median der Werkzeugaufrufe über der Grundlinie.",
    ).toBeLessThanOrEqual(4);

    const failedAttemptCounts = TASKS.map(
      (task) => transcriptsByTask.get(task.number)?.filter((entry) => entry.isError).length ?? 0,
    );
    expect(median(failedAttemptCounts), "Median der Fehlversuche über der Grundlinie.").toBe(0);
    expect(Math.max(...failedAttemptCounts), "Mehr Fehlversuche als im ersten Lauf.").toBe(1);
  });
});

describe("Befunde dieses Laufs, als Prüfung festgehalten", () => {
  // **Diese drei Prüfungen hielten ursprünglich einen Mangel fest.** Alle drei Mängel sind
  // inzwischen behoben; die Prüfungen sind deshalb umgedreht und sichern jetzt das richtige
  // Verhalten. Sie bleiben an dieser Stelle, weil ein Befund, der ausschließlich in einem
  // Dokument steht, beim nächsten Umbau still zurückkehrt.
  //
  // Die drei Mängel und ihre Behebung:
  //   E-1  Vorzeichenverlust, src/response/sanitize.ts — behoben: Ein Vorzeichen unmittelbar
  //        vor einer Ziffer gilt nicht mehr als Markdown am Zeilenanfang.
  //   E-2  Kürzung der Berichtsnutzdaten, src/response/table.ts — behoben: Die Grenze je Feld
  //        folgt dem Tokenbudget, und jede Kürzung wird beziffert.
  //   E-3  Schemameldung nennt Werte „undefined", src/server/register-tools.ts — behoben: Der
  //        übergebene Wert wird über `issue.path` aus den Rohargumenten nachgeschlagen, statt
  //        aus `issue.input`, das Zod 4 nicht mehr führt.

  function stepAt(taskNumber: number, index: number): TranscriptEntry {
    const entry = transcriptsByTask.get(taskNumber)?.[index];
    if (entry === undefined) {
      throw new Error(`Aufgabe ${String(taskNumber)}, Schritt ${String(index + 1)} fehlt.`);
    }
    return entry;
  }

  it("E-1: ein negativer Betrag behält im Textblock sein Vorzeichen", () => {
    const entry = stepAt(8, 1);
    expect(entry.tool).toBe("bb_transactions_get");

    // Die aufgezeichnete Antwort trägt "-884.65". Der Betrag steht jetzt mit Minuszeichen
    // im Textblock, nicht nur in amount_cents und im strukturierten Teil. Vorher las der
    // Agent hier eine Einnahme, wo eine Ausgabe steht.
    expect(entry.text).toContain("amount: -884.65");
    expect(entry.text).toContain("amount_cents: -88465");
    expect(JSON.stringify(entry.structured)).toContain("-884.65");
  });

  it("E-2: die Nutzdaten der BWA stehen vollständig im Textblock", () => {
    const entry = stepAt(6, 2);
    expect(entry.tool).toBe("bb_reports_get_bwa");

    // Bei einer Berichtsantwort IST die eine Zelle die gesamte Auskunft. Alle drei erfragten
    // Aufwandspositionen stehen jetzt im Textblock; vorher fiel die dritte hinter der festen
    // Grenze von 400 Zeichen heraus, ohne dass der Verlust beziffert worden wäre.
    expect(entry.text).toContain("4980");
    expect(entry.text).toContain("4930");
    expect(entry.text).toContain("6815");
    expect(entry.text).not.toContain("gekürzt:");
    expect(JSON.stringify(entry.structured)).toContain("6815");
  });

  it("E-3: die Schemameldung unterscheidet falschen Typ und fehlendes Feld", () => {
    const entry = stepAt(9, 3);
    expect(entry.tool).toBe("bb_postings_create_for_receipt");
    expect(entry.args.creditor).toBe(70001);

    // creditor wurde als Zahl 70001 übergeben, das Schema verlangt eine Zeichenkette; debtor
    // fehlt wirklich. Beide Fälle tragen jetzt verschiedene Sätze, und der genannte Wert ist
    // der tatsächlich übergebene. Vorher stand an beiden „übergeben wurde undefined", und der
    // Agent trug ein Feld nach, das er längst gesetzt hatte.
    expect(entry.text).toContain("creditor: erwartet wird string, übergeben wurde die Zahl 70001.");
    expect(entry.text).toContain("debtor: erwartet wird string, das Feld fehlt.");
    expect(entry.text).toContain(
      "positions (Position 1).postingaccount: erwartet wird string, übergeben wurde die Zahl 4980.",
    );
  });
});

describe("Gegenprobe mit dem Nur-Lesen-Schalter", () => {
  // tool-design.md 10.2 weist die Aufgaben 6 und 8 bis 10 ausdrücklich als Gegenprobe für den
  // Schalter aus. Geprüft wird hier nur die Frage, die zur Evaluation gehört: Erfährt der
  // Agent, warum die Aufgabe nicht lösbar ist? Die vollständige Absicherung des Schalters über
  // alle 39 schreibenden Werkzeuge steht in test/contract/read-only.test.ts.

  const blockedCalls: readonly { readonly taskNumber: number; readonly tool: string }[] = [
    { taskNumber: 6, tool: "bb_reports_create_bwa" },
    { taskNumber: 8, tool: "bb_transactions_assign_receipt" },
    { taskNumber: 9, tool: "bb_postings_create_for_receipt" },
    { taskNumber: 10, tool: "bb_receipts_delete" },
  ];

  it("nennt bei den Aufgaben 6, 8, 9 und 10 den Grund und setzt keinen Request ab", async () => {
    const config = installTestConfig({ BB_MCP_READ_ONLY: "true" });
    const api = mockApi();
    const server = await startServer(config);

    try {
      for (const { taskNumber, tool } of blockedCalls) {
        const step = TASKS.find((task) => task.number === taskNumber)?.steps.find(
          (candidate) => candidate.tool === tool,
        );
        expect(step, `Aufgabe ${String(taskNumber)} ruft ${tool} nicht auf.`).toBeDefined();

        const result = await server.client.callTool({
          name: tool,
          arguments: step?.args ?? {},
        });
        const text = textOf(result);
        expect(result.isError, `${tool} lief trotz Schalter durch.`).toBe(true);
        expect(text).toContain(`${tool} ist gesperrt`);
        expect(text).toContain(`${READ_ONLY_VAR}=true`);
      }

      expect(api.count(), "Bei aktivem Nur-Lesen-Schalter ging ein Request hinaus.").toBe(0);
    } finally {
      await server.close();
      api.close();
      resetTestConfig();
    }
  });

  it("lässt die drei lesenden Berichtswerkzeuge und die Aufgaben 1 bis 5, 7 und 11 zu", () => {
    const readOnlyTaskNumbers = TASKS.filter((task) =>
      task.steps.every((step) => toolClassOf(step.tool) === "R"),
    ).map((task) => task.number);
    // Aufgabe 6 braucht Klasse AR, die Aufgaben 8 bis 10 schreibende Werkzeuge
    // (tool-design.md 10.2).
    expect(readOnlyTaskNumbers).toEqual([1, 2, 3, 4, 5, 7, 11]);
  });
});
