import { describe, expect, it } from "vitest";

import {
  cancelledFixedPostingNote,
  duplicateFoundNote,
  fullPostingAccountPageNote,
  reportRequestedNote,
  REVERSAL_BY_TOOL,
  reversalFor,
  reversalText,
} from "../../src/response/next-step.js";

// Jede Antwort eines schreibenden Werkzeugs nennt den Weg zurück, „sofern es einen
// gibt, und ausdrücklich dessen Fehlen, wo es keinen gibt". Die Tabelle folgt der
// Werkzeugtabelle und dem Buchungswegweiser.

/** Die 39 schreibenden Werkzeuge (24 anlegend, 8 ändernd, 7 löschend). */
const WRITING_TOOLS = [
  "bb_receipts_create",
  "bb_receipts_create_batch",
  "bb_receipts_upload",
  "bb_receipts_delete",
  "bb_receipts_restore",
  "bb_transactions_create",
  "bb_transactions_create_batch",
  "bb_transactions_assign_receipt",
  "bb_transactions_assign_receipt_batch",
  "bb_transactions_unassign_receipt",
  "bb_invoices_create",
  "bb_invoices_create_draft",
  "bb_invoices_create_einvoice",
  "bb_postings_create_for_receipt",
  "bb_postings_create_for_receipt_batch",
  "bb_postings_create_for_transaction",
  "bb_postings_create_for_transaction_batch",
  "bb_postings_create_free",
  "bb_postings_create_free_batch",
  "bb_postings_unconfirm_for_receipt",
  "bb_postings_unconfirm_for_transaction",
  "bb_postings_unconfirm_free",
  "bb_postings_assign_receipt",
  "bb_postings_cancel",
  "bb_debtors_create",
  "bb_debtors_create_batch",
  "bb_debtors_update",
  "bb_creditors_create",
  "bb_creditors_create_batch",
  "bb_creditors_update",
  "bb_postingaccounts_create",
  "bb_postingaccounts_update",
  "bb_payment_accounts_create",
  "bb_comments_create",
  "bb_cost_locations_create",
  "bb_cost_locations_update",
  "bb_cost_locations_delete",
  "bb_reports_create_bwa",
  "bb_reports_create_sums",
] as const;

/** Die 15 lesenden Werkzeuge. Sie tragen keinen Weg zurück. */
const READING_TOOLS = [
  "bb_receipts_search",
  "bb_receipts_get",
  "bb_receipts_list_transactions",
  "bb_transactions_search",
  "bb_transactions_get",
  "bb_transactions_list_receipts",
  "bb_postings_search",
  "bb_debtors_search",
  "bb_creditors_search",
  "bb_postingaccounts_search",
  "bb_payment_accounts_list",
  "bb_cost_locations_search",
  "bb_reports_get_bwa",
  "bb_reports_get_sums",
  "bb_reports_get_ledger",
] as const;

describe("Die Tabelle deckt alle schreibenden Werkzeuge ab", () => {
  it("führt genau die 39 schreibenden Werkzeuge", () => {
    expect(Object.keys(REVERSAL_BY_TOOL).sort()).toEqual([...WRITING_TOOLS].sort());
    expect(WRITING_TOOLS).toHaveLength(39);
  });

  it("führt kein lesendes Werkzeug", () => {
    for (const name of READING_TOOLS) {
      expect(reversalFor(name)).toBeUndefined();
    }
  });

  it("nennt bei jedem Eintrag eine Begründung beziehungsweise eine Wirkung", () => {
    for (const [name, reversal] of Object.entries(REVERSAL_BY_TOOL)) {
      expect(reversal.note.length, name).toBeGreaterThan(20);
      if (reversal.kind === "tool") {
        expect(reversal.tool, name).toMatch(/^bb_/);
      }
    }
  });

  it("nennt das Fehlen ausdrücklich, wo die API keinen Weg zurück kennt", () => {
    const reversalMissingTools = Object.entries(REVERSAL_BY_TOOL)
      .filter(([, reversal]) => reversal.kind === "none")
      .map(([name]) => name);
    // Belegt: Rechnungen, Zuordnung an freie Buchung, Storno, Debitoren,
    // Kreditoren, Sachkonten, Zahlungskonten, Kommentare, Berichte, Zahlungen, Updates.
    expect(reversalMissingTools).toContain("bb_invoices_create");
    expect(reversalMissingTools).toContain("bb_postings_assign_receipt");
    expect(reversalMissingTools).toContain("bb_postings_cancel");
    expect(reversalMissingTools).toContain("bb_transactions_create");
    expect(reversalMissingTools).toContain("bb_comments_create");
    expect(reversalMissingTools).toContain("bb_debtors_update");
    expect(reversalMissingTools).toContain("bb_reports_create_bwa");
  });
});

describe("Der Satz „Weg zurück“", () => {
  it("nennt Werkzeug und Argumente aus der Schreibantwort", () => {
    const sentence = reversalText("bb_receipts_create", [{ id_by_customer: "4716" }]);
    expect(sentence).toContain("Weg zurück: bb_receipts_delete mit receipt_id_by_customer=4716");
    expect(sentence).toContain("als gelöscht");
  });

  it("greift auf die Argumente des Aufrufs zurück, wenn die Antwort nichts mitliefert", () => {
    const sentence = reversalText("bb_receipts_delete", [{}, { receipt_id_by_customer: 4711 }]);
    expect(sentence).toContain("bb_receipts_restore mit receipt_id_by_customer=4711");
  });

  it("erfindet keinen Wert, sondern markiert die Lücke", () => {
    const sentence = reversalText("bb_receipts_create", []);
    expect(sentence).toContain("receipt_id_by_customer=<nachtragen>");
  });

  it("sagt beim fehlenden Weg zurück ausdrücklich, dass es keinen gibt", () => {
    expect(reversalText("bb_invoices_create")).toMatch(/^Weg zurück: keiner\./);
    expect(reversalText("bb_invoices_create")).toContain("kennt keinen Storno");
    expect(reversalText("bb_postings_cancel")).toContain("dauerhaft in der Historie sichtbar");
  });

  it("liefert für ein lesendes Werkzeug keinen Satz", () => {
    expect(reversalText("bb_receipts_search")).toBe("");
  });

  it("nennt bei Stapeln, dass es je Element ein Aufruf ist", () => {
    expect(reversalText("bb_receipts_create_batch")).toContain("je angelegtem Beleg ein Aufruf");
    expect(reversalText("bb_transactions_assign_receipt_batch")).toContain("je Paar ein Aufruf");
  });
});

describe("Die vier Anschlusshinweise", () => {
  it("schreibt den Hinweis nach einer angeforderten Auswertung wörtlich", () => {
    expect(
      reportRequestedNote({
        reportId: "42",
        createTool: "bb_reports_create_bwa",
        getTool: "bb_reports_get_bwa",
      }),
    ).toBe(
      "Auswertung 42 wurde angefordert. Die Erzeugung läuft im Hintergrund. Abholen mit " +
        "bb_reports_get_bwa und report_id_by_customer=42. Solange sie läuft, antwortet dieser " +
        "Aufruf mit error_code 8; einige Sekunden warten und erneut abholen. " +
        "bb_reports_create_bwa in der Zwischenzeit nicht noch einmal aufrufen, das würde diese " +
        "Auswertung ersetzen.",
    );
  });

  it("schreibt den Duplikatshinweis wörtlich", () => {
    expect(duplicateFoundNote({ existingId: "8801", deleteTool: "bb_receipts_delete" })).toBe(
      "Ein Beleg mit gleichem Datum, gleichem Betrag und gleicher Gegenpartei existiert bereits " +
        "(id_by_customer 8801). War dieser Aufruf eine Wiederholung nach einem Zeitlimit, ist " +
        "damit ein Duplikat entstanden; den neuen Beleg mit bb_receipts_delete als gelöscht " +
        "markieren.",
    );
  });

  it("schreibt den Hinweis nach einem Storno wörtlich", () => {
    expect(cancelledFixedPostingNote("8814")).toBe(
      "Buchung 8814 war festgeschrieben und wurde deshalb nicht entfernt. Stattdessen ist eine " +
        "Stornobuchung entstanden, die dauerhaft in der Historie sichtbar bleibt.",
    );
  });

  it("schreibt den Hinweis auf die volle Kontenseite wörtlich", () => {
    expect(fullPostingAccountPageNote()).toBe(
      "Eine volle Seite wurde geliefert; dieser Mandant kann mehr Konten haben als hier zu " +
        "sehen. Die Liste mischt Sachkonten, Zahlungskonten, Debitoren und Kreditoren; über die " +
        "Spalte type filtern.",
    );
  });

  it("formuliert keinen Hinweis als Anweisung an das Modell", () => {
    const allNotes = [
      reportRequestedNote({ reportId: "1", createTool: "a", getTool: "b" }),
      duplicateFoundNote({ existingId: "1", deleteTool: "a" }),
      cancelledFixedPostingNote("1"),
      fullPostingAccountPageNote(),
    ].join(" ");
    expect(allNotes).not.toMatch(/\bDu (musst|sollst)\b/i);
    expect(allNotes).not.toMatch(/\brufe jetzt\b/i);
  });
});
