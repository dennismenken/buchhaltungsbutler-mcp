import { describe, expect, it } from "vitest";

import {
  filterHintFromFields,
  GENERIC_FILTER_HINT,
  noPaginationNote,
  pageStateOf,
  paginationNote,
} from "../../src/response/pagination-note.js";

// Die drei Bestandszeilen, zeichengenau gegen den festgelegten Wortlaut:
// „der stille Fehler 'Seite für Gesamtergebnis gehalten' entsteht genau hier".

const FULL_NOTE = [
  "100 Zeilen geliefert (limit=100, offset=0). Das ist die Zeilenzahl DIESER Antwort; die",
  "BuchhaltungsButler-API nennt zu keinem Zeitpunkt eine Gesamttrefferzahl. Die Antwort ist",
  "voll, es gibt also wahrscheinlich mehr: bb_receipts_search mit denselben Filtern und",
  "offset=100 erneut aufrufen. Enger filtern über date_from/date_to oder counterparty ist in",
  "der Regel billiger als blättern.",
].join(" ");

const PARTIAL_NOTE = [
  "37 Zeilen geliefert (limit=100, offset=0). Weniger Zeilen als das limit, also ist das das",
  "vollständige Ergebnis für diese Filter.",
].join(" ");

const EMPTY_NOTE = [
  "0 Zeilen geliefert. Entweder haben die Filter nichts getroffen, oder der offset liegt",
  "hinter dem Ende des Ergebnisses. Das ist kein Fehler.",
].join(" ");

describe("Die drei Zustände", () => {
  it("erkennt voll, unvollständig und leer allein aus Zeilenzahl und limit", () => {
    expect(pageStateOf({ rowsReturned: 100, limitUsed: 100, offsetUsed: 0 })).toBe("full");
    expect(pageStateOf({ rowsReturned: 37, limitUsed: 100, offsetUsed: 0 })).toBe("partial");
    expect(pageStateOf({ rowsReturned: 0, limitUsed: 100, offsetUsed: 0 })).toBe("empty");
    // Ohne limit gibt es keine volle Seite: /accounts/get liefert immer alles.
    expect(pageStateOf({ rowsReturned: 5, limitUsed: null, offsetUsed: 0 })).toBe("partial");
  });

  it("hält die Abbruchbedingung an der Zeilenzahl fest, nicht an rows", () => {
    // Mehr Zeilen als das limit wären ein Widerspruch; trotzdem gilt dann „voll".
    expect(pageStateOf({ rowsReturned: 101, limitUsed: 100, offsetUsed: 0 })).toBe("full");
  });
});

describe("Die Bestandszeilen, wörtlich", () => {
  it("schreibt die volle Seite wörtlich", () => {
    expect(
      paginationNote({
        toolName: "bb_receipts_search",
        rowsReturned: 100,
        limitUsed: 100,
        offsetUsed: 0,
        filterHint: "date_from/date_to oder counterparty",
      }),
    ).toBe(FULL_NOTE);
  });

  it("schreibt die unvollständige Seite wörtlich", () => {
    expect(
      paginationNote({
        toolName: "bb_receipts_search",
        rowsReturned: 37,
        limitUsed: 100,
        offsetUsed: 0,
      }),
    ).toBe(PARTIAL_NOTE);
  });

  it("schreibt die leere Seite wörtlich", () => {
    expect(
      paginationNote({
        toolName: "bb_receipts_search",
        rowsReturned: 0,
        limitUsed: 100,
        offsetUsed: 0,
      }),
    ).toBe(EMPTY_NOTE);
  });

  it("nennt nie eine Gesamttrefferzahl", () => {
    const allNotes = [FULL_NOTE, PARTIAL_NOTE, EMPTY_NOTE].join(" ");
    expect(allNotes).not.toMatch(/von \d+ (Treffern|Ergebnissen|insgesamt)/);
    expect(FULL_NOTE).toContain("nennt zu keinem Zeitpunkt eine Gesamttrefferzahl");
  });

  it("rechnet den nächsten offset aus Zeilenzahl und bisherigem offset", () => {
    const line = paginationNote({
      toolName: "bb_postings_search",
      rowsReturned: 100,
      limitUsed: 100,
      offsetUsed: 200,
    });
    expect(line).toContain("offset=300 erneut aufrufen");
    expect(line).toContain("bb_postings_search mit denselben Filtern");
  });

  it("fällt bei fehlendem Filterhinweis auf die allgemeine Form zurück", () => {
    const line = paginationNote({
      toolName: "bb_debtors_search",
      rowsReturned: 100,
      limitUsed: 100,
      offsetUsed: 0,
    });
    expect(line).toContain(GENERIC_FILTER_HINT);
  });
});

describe("Der Filterhinweis entsteht aus den Feldern des Werkzeugs", () => {
  it("nennt den Zeitraum und ein fachliches Filterfeld", () => {
    expect(
      filterHintFromFields(["list_direction", "date_from", "date_to", "counterparty", "limit"]),
    ).toBe("date_from/date_to oder counterparty");
  });

  it("nennt den Zeitraum allein, wenn es kein weiteres Filterfeld gibt", () => {
    expect(filterHintFromFields(["date_from", "date_to", "limit", "offset"])).toBe(
      "date_from/date_to",
    );
  });

  it("nennt ein fachliches Feld allein, wenn es keinen Zeitraum gibt", () => {
    expect(filterHintFromFields(["name", "limit", "offset"])).toBe("name");
    expect(filterHintFromFields(["to_from", "limit"])).toBe("to_from");
  });

  it("fällt auf die allgemeine Form zurück, statt ein Feld zu erfinden", () => {
    expect(filterHintFromFields(["limit", "offset"])).toBe(GENERIC_FILTER_HINT);
    expect(filterHintFromFields([])).toBe(GENERIC_FILTER_HINT);
    // Ein halber Zeitraum ist kein Zeitraum.
    expect(filterHintFromFields(["date_from", "limit"])).toBe(GENERIC_FILTER_HINT);
  });
});

describe("Der Endpunkt ohne Paginierung", () => {
  it("sagt ausdrücklich, dass es weder limit noch offset gibt", () => {
    const line = noPaginationNote(5);
    expect(line).toContain("5 Zeilen geliefert");
    expect(line).toContain("kennt keine Paginierung");
    expect(line).toContain("weder limit noch offset");
    expect(line).toContain("vollständige Ergebnis");
  });
});
