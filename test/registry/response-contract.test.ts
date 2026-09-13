// P13 aus Plan 9.2: Antwortvertrag gegen Projektion.
//
// P13 prüft Daten und nicht Text: Jeder Name in `concise` muss als Schlüssel in
// `responseContract.fields` desselben Eintrags vorkommen. Ohne P13 wäre die Projektion aus
// Plan 7.4 der einzige Teil eines Registereintrags, dessen Inhalt keine Prüfung berührt — und
// ein Projektionsfeld, das es in der Antwort nicht gibt, fällt zur Laufzeit nicht auf: Es
// fehlt einfach still in der Ausgabe.
//
// Der Antwortvertrag gilt JE ENDPUNKT und nie je Fachobjekt (Plan 7.2). Wer einen gemeinsamen
// Receipt-Typ baut, erzeugt genau den stillen Datenfehler, den ein Buchhaltungswerkzeug nicht
// machen darf: ein due_date, das beim Einzelabruf immer leer aussieht, weil das Feld dort
// date_payment_due heißt (Plan 0.3 Befund L2).

import { describe, expect, it } from "vitest";

import { REGISTRY, entryByName, missingEntry, specPathOf } from "../helpers/registry-fixtures.js";

/**
 * Die Projektionslisten aus Plan 7.4, von Hand abgeschrieben. Jeder Eintrag ist ein exakter
 * API-Feldname und keine Umschreibung. Die vier ersten Listen stammen aus den GEMESSENEN
 * Feldmengen (Plan 0.3 Befund L2), die übrigen aus den Feldtabellen der Dossiers.
 *
 * `type` und `subtype` bleiben bei bb_postingaccounts_search immer in der Projektion; das ist
 * Maßnahme 4 aus Plan 3.4 und nicht verhandelbar: Wer die Liste liest, sieht sofort, dass
 * 1200 ein Zahlungskonto und 4980 ein Sachkonto ist.
 *
 * **Eine Zeile weicht bewusst von der Tabelle in Plan 7.4 ab.** `bb_postings_search` führt
 * zusätzlich `cost_location` und `transaction_id_by_customer`. Die Tabelle des Plans ist vor
 * dem Evaluationslauf entstanden; dieser hat die Lücke dann gemessen (Befund V5 in
 * docs/entwicklung/befund-evaluation.md, erneut als S8 in
 * docs/entwicklung/skeptiker-befunde.md): Ohne `cost_location` ist die gefilterte Kostenstelle
 * in der Antwort nicht ablesbar und Aufgabe 7 braucht einen Aufruf je Kostenstelle; ohne
 * `transaction_id_by_customer` weicht Aufgabe 11 auf `response_format="detailed"` mit 38
 * Feldern je Zeile aus. Die Erwartung steht hier deshalb auf dem korrigierten Stand und nicht
 * auf dem der Plantabelle — P13 soll die geltende Projektion festhalten, nicht eine
 * überholte. Begründung im Kopf von src/registry/tools/bb_postings_search.ts.
 */
const PROJECTIONS: Readonly<Record<string, readonly string[]>> = {
  bb_receipts_search: [
    "id_by_customer",
    "date",
    "counterparty",
    "invoicenumber",
    "amount",
    "payment_date",
    "due_date",
    "account",
    "amount_paid",
    "deleted",
  ],
  bb_receipts_get: [
    "id_by_customer",
    "date",
    "counterparty",
    "invoicenumber",
    "amount",
    "currency",
    "vat",
    "account",
    "type",
    "payment_date",
    "date_payment_due",
    "deleted",
  ],
  bb_transactions_search: [
    "id_by_customer",
    "to_from",
    "amount",
    "booking_date",
    "value_date",
    "purpose",
  ],
  bb_transactions_get: [
    "id_by_customer",
    "account",
    "to_from",
    "booking_date",
    "value_date",
    "amount",
    "currency",
    "purpose",
  ],
  // Abweichung von Plan 7.4, siehe den Kommentar oben: cost_location und
  // transaction_id_by_customer sind nach Befund V5 nachgetragen.
  bb_postings_search: [
    "id_by_customer",
    "date",
    "postingtext",
    "amount",
    "debit_postingaccount_number",
    "credit_postingaccount_number",
    "tax_key",
    "cost_location",
    "fixed",
    "receipt_id_by_customer",
    "transaction_id_by_customer",
  ],
  bb_postingaccounts_search: ["postingaccount_number", "name", "type", "subtype"],
  bb_payment_accounts_list: ["postingaccount_number", "name"],
  bb_debtors_search: ["postingaccount_number", "name", "customer_number", "city"],
  bb_creditors_search: ["postingaccount_number", "name", "customer_number", "city"],
  bb_cost_locations_search: ["code", "name"],
};

/**
 * Die vier Endpunkte, deren Antwortvertrag am 2026-09-12 live gemessen wurde (Plan 0.3).
 * Nur sie dürfen `source: "gemessen"` tragen; bei allen übrigen ist der Vertrag aus den
 * Dossiers übernommen und durch den Vertragslauf in AP17 zu bestätigen.
 */
const MEASURED_TOOLS: readonly string[] = [
  "bb_receipts_search",
  "bb_receipts_get",
  "bb_transactions_search",
  "bb_transactions_get",
];

const MEASUREMENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

describe("P13 Antwortvertrag gegen Projektion", () => {
  it("kennt jeden Namen in concise als Schlüssel in responseContract.fields", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const known = Object.keys(tool.responseContract.fields);
      for (const field of tool.concise) {
        if (!known.includes(field)) {
          problems.push(
            `${tool.name}: concise nennt ${field}; dieses Feld steht nicht in responseContract.fields (${known.join(", ") || "leer"}).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("nennt kein Projektionsfeld zweimal", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const duplicates = tool.concise.filter(
        (field, index) => tool.concise.indexOf(field) !== index,
      );
      for (const field of new Set(duplicates)) {
        problems.push(`${tool.name}: concise nennt ${field} mehrfach.`);
      }
    }

    expectNoIssues(problems);
  });

  it("trägt bei den zehn Werkzeugen aus Plan 7.4 genau die dort festgelegte Projektion", () => {
    const problems: string[] = [];

    for (const [name, expected] of Object.entries(PROJECTIONS)) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(`${missingEntry(name)} Erwartetes concise: ${expected.join(", ")}.`);
        continue;
      }
      if (tool.concise.length === 0) {
        problems.push(
          `${name}: leeres concise. Plan 7.4 legt für dieses Werkzeug ${expected.join(", ")} fest.`,
        );
        continue;
      }

      const missing = expected.filter((field) => !tool.concise.includes(field));
      const extra = tool.concise.filter((field) => !expected.includes(field));
      if (missing.length > 0) {
        problems.push(`${name}: concise missing ${missing.join(", ")} (Plan 7.4).`);
      }
      if (extra.length > 0) {
        problems.push(`${name}: concise nennt zusätzlich ${extra.join(", ")} (Plan 7.4).`);
      }
    }

    expectNoIssues(problems);
    expect(Object.keys(PROJECTIONS)).toHaveLength(10);
  });

  it("setzt eine Projektion nur dort, wo die Antwort einen Datenbehälter hat", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      if (tool.concise.length > 0 && tool.responseContract.container !== "data") {
        problems.push(
          `${tool.name}: concise ist gesetzt, aber container ist "${tool.responseContract.container}". Eine Projektion ohne Datenbehälter projiziert nichts (Plan 7.4).`,
        );
      }
      if (
        tool.responseContract.container === "data" &&
        Object.keys(tool.responseContract.fields).length === 0
      ) {
        problems.push(
          `${tool.name}: container "data" ohne ein einziges Feld im Antwortvertrag. Bekannte Felder werden typisiert, unbekannte durchgereicht — ohne bekannte Felder gibt es keinen Vertrag (Plan 7.2, 1.2).`,
        );
      }
    }

    expectNoIssues(problems);
  });
});

describe("P13 Herkunft des Antwortvertrags", () => {
  it("kennzeichnet genau die vier live gemessenen Endpunkte als gemessen", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const shouldBeMeasured = MEASURED_TOOLS.includes(tool.name);
      const isMeasured = tool.responseContract.source === "gemessen";

      if (shouldBeMeasured && !isMeasured) {
        problems.push(
          `${tool.name} (${specPathOf(tool)}): source "${tool.responseContract.source}". Die Feldmenge dieses Endpunkts ist am 2026-09-12 gemessen (Plan 0.3 Befund L2).`,
        );
      }
      if (!shouldBeMeasured && isMeasured) {
        problems.push(
          `${tool.name}: source "gemessen", obwohl für diesen Endpunkt keine Messung vorliegt. Gemessen sind ausschließlich ${MEASURED_TOOLS.join(", ")} (Plan 0.3).`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("nennt bei jedem gemessenen Vertrag das Messdatum", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      if (tool.responseContract.source !== "gemessen") continue;
      const measuredDate = tool.responseContract.measuredOn;
      if (measuredDate === undefined || !MEASUREMENT_DATE_PATTERN.test(measuredDate)) {
        problems.push(
          `${tool.name}: measuredOn ist ${String(measuredDate)}. Bei source "gemessen" ist das ISO-Datum der Messung Pflicht (Plan 2.1).`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt bei den vier gemessenen Endpunkten die getrennten Feldnamen aus Befund L2", () => {
    const problems: string[] = [];

    // Die Listenform nennt delivery_date und due_date, der Einzelabruf date_delivery und
    // date_payment_due. Wer beide Endpunkte über einen gemeinsamen Fachtyp abbildet, verliert
    // genau hier Daten (Plan 0.3 Befund L2, 7.2).
    const splitFieldRows = [
      {
        tool: "bb_receipts_search",
        included: ["due_date", "delivery_date"],
        forbidden: ["date_payment_due", "date_delivery"],
      },
      {
        tool: "bb_receipts_get",
        included: ["date_payment_due", "date_delivery"],
        forbidden: ["due_date", "delivery_date"],
      },
    ];

    for (const row of splitFieldRows) {
      const tool = entryByName(row.tool);
      if (tool === undefined) {
        problems.push(`${missingEntry(row.tool)} Erwartete Felder: ${row.included.join(", ")}.`);
        continue;
      }
      const fieldNames = Object.keys(tool.responseContract.fields);
      for (const field of row.included) {
        if (!fieldNames.includes(field)) {
          problems.push(
            `${row.tool}: responseContract.fields führt ${field} nicht, obwohl der Endpunkt es liefert (Plan 0.3 Befund L2).`,
          );
        }
      }
      for (const field of row.forbidden) {
        if (fieldNames.includes(field)) {
          problems.push(
            `${row.tool}: responseContract.fields führt ${field}; dieses Feld liefert der andere Endpunkt, nicht dieser (Plan 0.3 Befund L2, 7.2).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("führt die Fremdwährungsfelder des Belegeinzelabrufs, die die Liste nicht liefert", () => {
    const problems: string[] = [];
    const tool = entryByName("bb_receipts_get");

    if (tool === undefined) {
      problems.push(
        `${missingEntry("bb_receipts_get")} Erwartet werden amount_original und currency_original im Antwortvertrag (Plan 4.6, 0.3 Befund L2).`,
      );
    } else {
      const fieldNames = Object.keys(tool.responseContract.fields);
      for (const field of ["amount_original", "currency_original"]) {
        if (!fieldNames.includes(field)) {
          problems.push(
            `bb_receipts_get: responseContract.fields führt ${field} nicht. Die Spezifikation kennt das Feld nicht, der Endpunkt liefert es (Plan 0.3 Befunde L2 und L4).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });
});
