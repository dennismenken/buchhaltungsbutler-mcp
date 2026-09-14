// P13: Antwortvertrag gegen Projektion.
//
// P13 prüft Daten und nicht Text: Jeder Name in `concise` muss als Schlüssel in
// `responseContract.fields` desselben Eintrags vorkommen. Ohne P13 wäre die Projektion der
// einzige Teil eines Registereintrags, dessen Inhalt keine Prüfung berührt — und
// ein Projektionsfeld, das es in der Antwort nicht gibt, fällt zur Laufzeit nicht auf: Es
// fehlt einfach still in der Ausgabe.
//
// Der Antwortvertrag gilt JE ENDPUNKT und nie je Fachobjekt. Wer einen gemeinsamen
// Receipt-Typ baut, erzeugt genau den stillen Datenfehler, den ein Buchhaltungswerkzeug nicht
// machen darf: ein due_date, das beim Einzelabruf immer leer aussieht, weil das Feld dort
// date_payment_due heißt.

import { describe, expect, it } from "vitest";

import { REGISTRY, entryByName, missingEntry, specPathOf } from "../helpers/registry-fixtures.js";

/**
 * Die Projektionslisten, von Hand abgeschrieben. Jeder Eintrag ist ein exakter
 * API-Feldname und keine Umschreibung. Die vier ersten Listen stammen aus den GEMESSENEN
 * Feldmengen, die übrigen aus den Feldtabellen der Dossiers.
 *
 * `type` und `subtype` bleiben bei bb_postingaccounts_search immer in der Projektion; das ist
 * Maßnahme 4 und nicht verhandelbar: Wer die Liste liest, sieht sofort, dass
 * 1200 ein Zahlungskonto und 4980 ein Sachkonto ist.
 *
 * **Eine Zeile weicht bewusst von der Tabelle ab.** `bb_postings_search` führt
 * zusätzlich `cost_location` und `transaction_id_by_customer`. Die ursprüngliche Tabelle
 * ist vor dem Evaluationslauf entstanden; dieser hat die Lücke dann gemessen: Ohne
 * `cost_location` ist die gefilterte Kostenstelle
 * in der Antwort nicht ablesbar und Aufgabe 7 braucht einen Aufruf je Kostenstelle; ohne
 * `transaction_id_by_customer` weicht Aufgabe 11 auf `response_format="detailed"` mit 38
 * Feldern je Zeile aus. Die Erwartung steht hier deshalb auf dem korrigierten Stand und
 * nicht auf dem der ursprünglichen Tabelle — P13 soll die geltende Projektion festhalten,
 * nicht eine überholte. Begründung im Kopf von src/registry/tools/bb_postings_search.ts.
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
  // Abweichung, siehe den Kommentar oben: cost_location und
  // transaction_id_by_customer sind nach dem Evaluationslauf nachgetragen.
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
 * Die Endpunkte, deren Antwortvertrag live gemessen wurde: die vier Beleg- und
 * Zahlungsendpunkte am 2026-09-12, die drei Berichte am 2026-09-14 (Befund L7 in
 * docs/api/live-befunde.md). Nur sie dürfen `source: "gemessen"` tragen; bei allen übrigen ist
 * der Vertrag aus den Dossiers übernommen und durch den Vertragslauf zu bestätigen.
 */
const MEASURED_TOOLS: readonly string[] = [
  "bb_receipts_search",
  "bb_receipts_get",
  "bb_transactions_search",
  "bb_transactions_get",
  "bb_reports_get_ledger",
  "bb_reports_get_bwa",
  "bb_reports_get_sums",
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

  it("trägt bei den zehn Werkzeugen genau die dort festgelegte Projektion", () => {
    const problems: string[] = [];

    for (const [name, expected] of Object.entries(PROJECTIONS)) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(`${missingEntry(name)} Erwartetes concise: ${expected.join(", ")}.`);
        continue;
      }
      if (tool.concise.length === 0) {
        problems.push(
          `${name}: leeres concise. Für dieses Werkzeug sind ${expected.join(", ")} festgelegt.`,
        );
        continue;
      }

      const missing = expected.filter((field) => !tool.concise.includes(field));
      const extra = tool.concise.filter((field) => !expected.includes(field));
      if (missing.length > 0) {
        problems.push(`${name}: concise missing ${missing.join(", ")}.`);
      }
      if (extra.length > 0) {
        problems.push(`${name}: concise nennt zusätzlich ${extra.join(", ")}.`);
      }
    }

    expectNoIssues(problems);
    expect(Object.keys(PROJECTIONS)).toHaveLength(10);
  });

  it("setzt eine Projektion nur dort, wo die Antwort einen Datenbehälter hat", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      // Ein flach gelegter Bericht hat Zeilen, auch ohne data-Hülle.
      const hasRows =
        tool.responseContract.container === "data" ||
        tool.responseContract.reportRows !== undefined;
      if (tool.concise.length > 0 && !hasRows) {
        problems.push(
          `${tool.name}: concise ist gesetzt, aber container ist "${tool.responseContract.container}". Eine Projektion ohne Datenbehälter projiziert nichts.`,
        );
      }
      if (
        tool.responseContract.container === "data" &&
        Object.keys(tool.responseContract.fields).length === 0
      ) {
        problems.push(
          `${tool.name}: container "data" ohne ein einziges Feld im Antwortvertrag. Bekannte Felder werden typisiert, unbekannte durchgereicht — ohne bekannte Felder gibt es keinen Vertrag.`,
        );
      }
    }

    expectNoIssues(problems);
  });
});

describe("P13 Herkunft des Antwortvertrags", () => {
  it("kennzeichnet genau die live gemessenen Endpunkte als gemessen", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const shouldBeMeasured = MEASURED_TOOLS.includes(tool.name);
      const isMeasured = tool.responseContract.source === "gemessen";

      if (shouldBeMeasured && !isMeasured) {
        problems.push(
          `${tool.name} (${specPathOf(tool)}): source "${tool.responseContract.source}". Die Feldmenge dieses Endpunkts ist live gemessen.`,
        );
      }
      if (!shouldBeMeasured && isMeasured) {
        problems.push(
          `${tool.name}: source "gemessen", obwohl für diesen Endpunkt keine Messung vorliegt. Gemessen sind ausschließlich ${MEASURED_TOOLS.join(", ")}.`,
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
          `${tool.name}: measuredOn ist ${String(measuredDate)}. Bei source "gemessen" ist das ISO-Datum der Messung Pflicht.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  // Befund L2 in docs/api/live-befunde.md: Liste und Einzelabruf benennen denselben
  // Sachverhalt verschieden.
  it("trägt bei den vier gemessenen Endpunkten die getrennten Feldnamen aus Befund L2", () => {
    const problems: string[] = [];

    // Die Listenform nennt delivery_date und due_date, der Einzelabruf date_delivery und
    // date_payment_due. Wer beide Endpunkte über einen gemeinsamen Fachtyp abbildet, verliert
    // genau hier Daten.
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
            `${row.tool}: responseContract.fields führt ${field} nicht, obwohl der Endpunkt es liefert.`,
          );
        }
      }
      for (const field of row.forbidden) {
        if (fieldNames.includes(field)) {
          problems.push(
            `${row.tool}: responseContract.fields führt ${field}; dieses Feld liefert der andere Endpunkt, nicht dieser.`,
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
        `${missingEntry("bb_receipts_get")} Erwartet werden amount_original und currency_original im Antwortvertrag.`,
      );
    } else {
      const fieldNames = Object.keys(tool.responseContract.fields);
      for (const field of ["amount_original", "currency_original"]) {
        if (!fieldNames.includes(field)) {
          problems.push(
            `bb_receipts_get: responseContract.fields führt ${field} nicht. Die Spezifikation kennt das Feld nicht, der Endpunkt liefert es.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });
});
