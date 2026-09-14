// Die Umformung der drei Berichtsantworten in flache Zeilen.
//
// Die Attrappen folgen dem gemessenen Aufbau (Befund L7 in docs/api/live-befunde.md); die Werte
// sind erfunden. Geprüft wird, dass nichts verloren geht: jede Zeile, jede Kopfangabe, die
// Berichtsdateien und bei unerwarteter Form der ganze Bericht.

import { describe, expect, it } from "vitest";

import { reportRowsOf } from "../../src/mapping/report-rows.js";

describe("Kontenblatt", () => {
  const body = {
    success: true,
    message: "",
    report_sums_postingaccount_ledger: {
      integrityError: false,
      postingaccount_number: "1200",
      postingaccountLedger: [
        {
          id_by_customer: 1,
          record_side: "debit",
          record_amount: "10.00",
          balanceAfterAbsolute: 10,
        },
        {
          id_by_customer: 2,
          record_side: "credit",
          record_amount: "4.50",
          balanceAfterAbsolute: 5.5,
        },
      ],
    },
  };

  it("liefert die Buchungszeilen unverändert und die Kopfangaben getrennt", () => {
    const report = reportRowsOf("ledger", body);
    expect(report?.rows).toHaveLength(2);
    expect(report?.rows[1]).toEqual(body.report_sums_postingaccount_ledger.postingaccountLedger[1]);
    expect(report?.summary).toEqual({ postingaccount_number: "1200", integrityError: false });
  });

  it("liefert null, wenn die Buchungsliste fehlt", () => {
    expect(
      reportRowsOf("ledger", { success: true, report_sums_postingaccount_ledger: {} }),
    ).toBeNull();
    expect(reportRowsOf("ledger", { success: true })).toBeNull();
  });
});

describe("Summen- und Saldenliste", () => {
  const body = {
    success: true,
    report: {
      integrityError: false,
      countPostingsWithDateVatEffectiveNotConsideredInReport: 0,
      sums: {
        "1200": {
          postingaccount: {
            name: "Bank",
            postingaccount_number: 1200,
            class: "Aktiva",
            type: "account",
          },
          balanceBeforeAbsolute: 100,
          balanceBeforeSide: "debit",
          sumPeriodDebit: null,
          balanceAfterAbsolute: 120.5,
          balanceAfterSide: "debit",
        },
        "4980": { balanceAfterAbsolute: 7, balanceAfterSide: "debit" },
        "9999": "kein Objekt",
      },
    },
    files: { pdf: "JVBERi0xLjQK" },
  };

  it("macht aus jedem Konto eine Zeile mit Kontoangaben und Salden", () => {
    const report = reportRowsOf("sums", body);
    expect(report?.rows).toHaveLength(3);
    expect(report?.rows[0]).toEqual({
      postingaccount_number: 1200,
      name: "Bank",
      class: "Aktiva",
      type: "account",
      balanceBeforeAbsolute: 100,
      balanceBeforeSide: "debit",
      sumPeriodDebit: null,
      balanceAfterAbsolute: 120.5,
      balanceAfterSide: "debit",
    });
  });

  it("nimmt die Kontonummer aus dem Schlüssel, wenn die Kontoangaben fehlen", () => {
    const report = reportRowsOf("sums", body);
    expect(report?.rows[1]).toMatchObject({ postingaccount_number: "4980", name: null });
  });

  it("verwirft keinen Eintrag, der kein Objekt ist", () => {
    expect(reportRowsOf("sums", body)?.rows[2]).toBe("kein Objekt");
  });

  it("trägt die Berichtsdateien in die Kopfangaben", () => {
    expect(reportRowsOf("sums", body)?.summary).toEqual({
      integrityError: false,
      countPostingsWithDateVatEffectiveNotConsideredInReport: 0,
      files: { pdf: "JVBERi0xLjQK" },
    });
  });

  it("liefert null ohne sums", () => {
    expect(reportRowsOf("sums", { success: true, report: {} })).toBeNull();
  });
});

describe("BWA", () => {
  const group = (name: string, sum: number, classes: Record<string, unknown>) => ({
    groupName: name,
    groupDisplayName: name,
    empty: sum === 0,
    amountsSum: sum,
    classes,
  });
  const cls = (name: string, sum: number) => ({
    className: name,
    classDisplayName: name,
    empty: sum === 0,
    amountsSum: sum,
    postingaccounts: [],
  });
  const body = {
    success: true,
    report: {
      integrityError: false,
      standardChart: "skr03",
      postingsRecordsCount: 3,
      uncompletedPostingsCount: 0,
      usedPostingaccountsNumbers: ["8400", "4210"],
      usedCostLocations: [],
      groups: {
        Gesamtleistung: group("Gesamtleistung", 1000, { Umsatzerlöse: cls("Umsatzerlöse", 1000) }),
        Gesamtkosten: group("Gesamtkosten", 400, { Raumkosten: cls("Raumkosten", 400) }),
        "Neutraler Ertrag": group("Neutraler Ertrag", 0, {}),
      },
      totals: {
        Betriebsergebnis: {
          totalName: "Betriebsergebnis",
          totalDisplayName: "Betriebsergebnis",
          empty: false,
          amountsSum: 600,
          after: "Gesamtkosten",
        },
        Ergebnis: {
          totalName: "Ergebnis",
          totalDisplayName: "Ergebnis",
          empty: false,
          amountsSum: 600,
          after: null,
        },
        Verwaist: { totalName: "Verwaist", amountsSum: 1, after: "Gibt es nicht" },
      },
    },
  };

  it("legt Gruppen, Klassen und Ergebniszeilen in Lesereihenfolge flach", () => {
    const rows = reportRowsOf("bwa", body)?.rows as Record<string, unknown>[];
    expect(rows.map((row) => `${String(row["level"])}:${String(row["name"])}`)).toEqual([
      "group:Gesamtleistung",
      "class:Umsatzerlöse",
      "group:Gesamtkosten",
      "class:Raumkosten",
      "total:Betriebsergebnis",
      "group:Neutraler Ertrag",
      "total:Verwaist",
      "total:Ergebnis",
    ]);
    expect(rows[3]).toEqual({
      level: "class",
      group: "Gesamtkosten",
      name: "Raumkosten",
      amountsSum: 400,
      empty: false,
      postingaccounts: [],
    });
  });

  it("übernimmt die Kopfangaben ohne die Gruppen", () => {
    expect(reportRowsOf("bwa", body)?.summary).toEqual({
      standardChart: "skr03",
      integrityError: false,
      postingsRecordsCount: 3,
      uncompletedPostingsCount: 0,
      usedPostingaccountsNumbers: ["8400", "4210"],
      usedCostLocations: [],
    });
  });

  it("liefert null ohne groups", () => {
    expect(reportRowsOf("bwa", { success: true, report: { totals: {} } })).toBeNull();
  });
});
