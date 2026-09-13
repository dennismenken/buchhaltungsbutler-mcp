// P8 aus Plan 9.2: Beschreibungen, Pflichtsätze, Stufen und Verweise.
//
// Für die zehn Werkzeuge der Klasse B und die sieben der Klasse D ist Punkt 5 des Aufbaus
// aus Plan 4.9 die wichtigste Zeile des ganzen Servers: Unter E2 sperrt der Server nichts,
// und der Pflichtsatz ist bei dreizehn Werkzeugen die einzige Warnung, die vor dem Aufruf
// überhaupt erscheint. Deshalb wird er hier zeichengenau gegen
// src/registry/mandatory-sentences.ts geprüft und nicht sinngemäß.
//
// Der Verweistest ist wichtiger, als er klingt: Ein Abgrenzungssatz, der auf ein nicht
// existierendes Werkzeug zeigt, lenkt den Agenten in einen garantierten Fehlschlag.

import { describe, expect, it } from "vitest";

import { DESCRIPTION_CHAR_BUDGET_BY_TIER, TOOL_NAMES_BY_TIER } from "../../src/registry/budget.js";
import {
  MANDATORY_SENTENCES,
  MANDATORY_SENTENCE_PLACEHOLDERS,
} from "../../src/registry/mandatory-sentences.js";
import type { DescriptionTier, MandatorySentenceId, ToolEntry } from "../../src/registry/types.js";
import { REGISTRY, entryByName, flatFields, missingEntry } from "../helpers/registry-fixtures.js";
import { EXPECTED_TOOL_NAMES, EXPECTED_WRITING_TOOL_NAMES } from "./class-list.js";

const TIERS: readonly DescriptionTier[] = [1, 2, 3];
const MANDATORY_SENTENCE_IDS: readonly MandatorySentenceId[] = [
  "U1",
  "U2",
  "U3",
  "U4",
  "U5",
  "U6",
  "U7",
];

/**
 * Die namentliche Zuordnung der Pflichtsätze aus Plan 3.5, von Hand abgeschrieben.
 * Prüfsumme 6 + 3 + 6 + 13 + 4 + 5 + 2 = 39, also genau die 39 Werkzeuge mit den Wirkungen
 * anlegend, ändernd und löschend. Die 15 lesenden tragen keinen dieser Sätze; der Test prüft
 * beide Richtungen.
 */
const MANDATORY_SENTENCE_BY_TOOL: Readonly<Record<string, MandatorySentenceId>> = {
  // U1, umkehrbar mit genau einem Werkzeug
  bb_receipts_delete: "U1",
  bb_receipts_restore: "U1",
  bb_transactions_assign_receipt: "U1",
  bb_transactions_assign_receipt_batch: "U1",
  bb_transactions_unassign_receipt: "U1",
  bb_cost_locations_create: "U1",

  // U2, nur als Löschmarkierung umkehrbar
  bb_receipts_create: "U2",
  bb_receipts_create_batch: "U2",
  bb_receipts_upload: "U2",

  // U3, nur durch Storno korrigierbar
  bb_postings_create_for_receipt: "U3",
  bb_postings_create_for_receipt_batch: "U3",
  bb_postings_create_for_transaction: "U3",
  bb_postings_create_for_transaction_batch: "U3",
  bb_postings_create_free: "U3",
  bb_postings_create_free_batch: "U3",

  // U4, über die API gar nicht umkehrbar
  bb_transactions_create: "U4",
  bb_transactions_create_batch: "U4",
  bb_invoices_create: "U4",
  bb_invoices_create_draft: "U4",
  bb_invoices_create_einvoice: "U4",
  bb_postings_assign_receipt: "U4",
  bb_debtors_create: "U4",
  bb_debtors_create_batch: "U4",
  bb_creditors_create: "U4",
  bb_creditors_create_batch: "U4",
  bb_postingaccounts_create: "U4",
  bb_payment_accounts_create: "U4",
  bb_comments_create: "U4",

  // U5, überschreibt ohne abrufbaren Vorzustand
  bb_debtors_update: "U5",
  bb_creditors_update: "U5",
  bb_postingaccounts_update: "U5",
  bb_cost_locations_update: "U5",

  // U6, entfernt Bestehendes
  bb_postings_unconfirm_for_receipt: "U6",
  bb_postings_unconfirm_for_transaction: "U6",
  bb_postings_unconfirm_free: "U6",
  bb_postings_cancel: "U6",
  bb_cost_locations_delete: "U6",

  // U7, ersetzt eine Auswertung
  bb_reports_create_bwa: "U7",
  bb_reports_create_sums: "U7",
};

/**
 * Zwei Pflichtsätze auf PARAMETER-Ebene, wörtlich aus Plan 4.7 und Plan 4.3. Sie ersetzen
 * je eine gestrichene Querprüfung: Eine Prüfung, die die von der API ausdrücklich erlaubte
 * Kombination abwiese, würde einen gültigen Aufruf unsichtbar vor dem Request verwerfen.
 */
const MANDATORY_SENTENCE_BY_PARAMETER = [
  {
    tool: "bb_transactions_search",
    fields: ["id_by_customer_from", "id_by_customer_to"],
    sentence:
      "Setzt die Sortierung auf id_by_customer ASC, auch in Kombination mit date_from und date_to.",
    source: "Plan 4.7, Ersatz für die gestrichene Sortierprüfung",
  },
  {
    tool: "bb_transactions_create",
    fields: ["currency"],
    sentence:
      "Ohne Angabe bucht BuchhaltungsButler in der Währung des Zahlungskontos; die Spezifikation beschreibt den Betrag ausdrücklich als Betrag in der Kontowährung. Welche Währung ein Zahlungskonto führt, gibt die API an keiner Stelle preis — diesen Wert also nur setzen, wenn er aus dem Vorgang bekannt ist.",
    source: "Plan 4.3, Ersatz für die zurückgenommene Verschärfung",
  },
  {
    tool: "bb_transactions_create_batch",
    fields: ["currency"],
    sentence:
      "Ohne Angabe bucht BuchhaltungsButler in der Währung des Zahlungskontos; die Spezifikation beschreibt den Betrag ausdrücklich als Betrag in der Kontowährung. Welche Währung ein Zahlungskonto führt, gibt die API an keiner Stelle preis — diesen Wert also nur setzen, wenn er aus dem Vorgang bekannt ist.",
    source: "Plan 4.3, Ersatz für die zurückgenommene Verschärfung",
  },
] as const;

/**
 * Die Verbotsliste englischer Funktionswörter aus Plan 9.2. Sie enthält ausdrücklich KEIN
 * Wort, das auch deutsch ist: `die`, `was`, `man`, `will`, `hat`, `not` und `also` fehlen
 * deshalb. Die Prüfung erkennt keinen einzelnen englischen Fachbegriff und soll das auch
 * nicht — sie fängt den Fall ab, dass eine Beschreibung insgesamt englisch geschrieben wurde.
 */
const ENGLISH_FUNCTION_WORDS: readonly string[] = [
  "the",
  "this",
  "that",
  "these",
  "with",
  "and",
  "for",
  "from",
  "your",
  "you",
  "which",
  "into",
  "only",
  "does",
  "must",
  "should",
  "use",
  "when",
  "where",
  "cannot",
  "about",
  "after",
  "before",
  "there",
];

function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

/**
 * Der Sprachtest aus Plan 9.2, in der dort festgelegten Reihenfolge: erst die Spannen in
 * einfachen Anführungszeichen entfernen (dort stehen Enum-Werte und wörtlich zitierte
 * API-Werte), dann alle Wörter mit `bb_`-Anfang und alle Wörter mit Unterstrich
 * (API-Feldnamen wie id_by_customer, date_from, to_from), dann die Verbotsliste.
 */
function englishWords(text: string): string[] {
  const withoutQuotes = text.replace(/'[^']*'/g, " ");
  const withoutIdentifiers = withoutQuotes
    .split(/\s+/)
    .filter((word) => !word.startsWith("bb_") && !word.includes("_"))
    .join(" ");

  return ENGLISH_FUNCTION_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(withoutIdentifiers),
  );
}

/** Steht der Pflichtsatz mit diesem Bezeichner im Text? Platzhalter werden dabei matched
 *  behandelt: U1 trägt `<tool>`, U6 trägt `<was genau>`. */
function mandatorySentenceMatch(text: string, id: MandatorySentenceId): string | undefined {
  const sentence = MANDATORY_SENTENCES[id];
  const placeholder = MANDATORY_SENTENCE_PLACEHOLDERS[id].at(0);

  if (placeholder === undefined) {
    return text.includes(sentence) ? "" : undefined;
  }

  const [before, after] = sentence.split(placeholder);
  if (before === undefined || after === undefined) return undefined;

  const start = text.indexOf(before);
  if (start < 0) return undefined;

  const rest = text.slice(start + before.length);
  const end = rest.indexOf(after);
  if (end < 0) return undefined;

  return rest.slice(0, end);
}

/** Der Beschreibungstext eines Eintrags samt aller Feldbeschreibungen. */
function allTexts(tool: ToolEntry): { source: string; text: string }[] {
  return [
    { source: "description", text: tool.description },
    ...flatFields(tool).map(({ path, field }) => ({
      source: `Feld ${path}`,
      text: field.description,
    })),
  ];
}

describe("P8 Beschreibungsstufen", () => {
  it("deckt sich mit der namentlichen Zuordnung aus Plan 4.9", () => {
    const problems: string[] = [];

    for (const tier of TIERS) {
      for (const name of TOOL_NAMES_BY_TIER[tier]) {
        const tool = entryByName(name);
        if (tool === undefined) {
          problems.push(`${missingEntry(name)} Erwartete Stufe: ${String(tier)}.`);
          continue;
        }
        if (tool.tier !== tier) {
          problems.push(
            `${name}: tier ${String(tool.tier)}, nach Plan 4.9 gehört es in Stufe ${String(tier)}.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("hält jede Beschreibung innerhalb des Stufenbudgets", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const limit = DESCRIPTION_CHAR_BUDGET_BY_TIER[tool.tier];
      if (tool.description.length > limit) {
        problems.push(
          `${tool.name}: Beschreibung ${String(tool.description.length)} Zeichen, Stufe ${String(tool.tier)} erlaubt ${String(limit)}.`,
        );
      }
      if (tool.description.trim() === "") {
        problems.push(`${tool.name}: keine Beschreibung.`);
      }
    }

    expectNoIssues(problems);
  });

  it("nennt in jeder Beschreibung das Wort BuchhaltungsButler", () => {
    const problems = REGISTRY.filter(
      (tool) => !tool.description.includes("BuchhaltungsButler"),
    ).map(
      (tool) => `${tool.name}: die Beschreibung nennt BuchhaltungsButler nicht (Plan 4.9 Punkt 1).`,
    );

    expectNoIssues(problems);
  });
});

describe("P8 Sprache", () => {
  it("schreibt Werkzeug- und Parameterbeschreibungen auf Deutsch", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const { source, text } of allTexts(tool)) {
        const matches = englishWords(text);
        if (matches.length > 0) {
          problems.push(
            `${tool.name}, ${source}: englische Funktionswörter (${matches.join(", ")}). Der Fließtext ist deutsch; API-Feldnamen, Werkzeugnamen und Enum-Werte bleiben im Original (Plan 4.9, E4).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("gibt jedem Parameter eine Beschreibung", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const { path, field } of flatFields(tool)) {
        if (field.description.trim() === "") {
          problems.push(`${tool.name}, Feld ${path}: keine description (Plan 9.2 P8).`);
        }
      }
    }

    expectNoIssues(problems);
  });

  it("führt keinen Parameter confirm", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const { path, field } of flatFields(tool)) {
        if (field.name === "confirm") {
          problems.push(
            `${tool.name}, Feld ${path}: kein confirm-Parameter. Der Server fragt nicht nach; die Freigabe liegt beim Client (E2, Plan 1.5).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });
});

describe("P8 Pflichtsätze", () => {
  it("ordnet genau den 39 schreibenden Werkzeugen einen Pflichtsatz zu", () => {
    // Selbstprüfung der Abschrift aus Plan 3.5 gegen die zweite Klassenliste: Beide Listen
    // sind von Hand geführt, und genau deshalb werden sie gegeneinander gehalten.
    expect([...Object.keys(MANDATORY_SENTENCE_BY_TOOL)].sort()).toEqual(
      [...EXPECTED_WRITING_TOOL_NAMES].sort(),
    );
    expect(Object.keys(MANDATORY_SENTENCE_BY_TOOL)).toHaveLength(39);
  });

  it("trägt bei jedem schreibenden Werkzeug den zutreffenden Satz, zeichengenau", () => {
    const problems: string[] = [];

    for (const [name, id] of Object.entries(MANDATORY_SENTENCE_BY_TOOL)) {
      const tool = entryByName(name);
      if (tool === undefined) {
        problems.push(`${missingEntry(name)} Erwarteter Pflichtsatz: ${id}.`);
        continue;
      }

      if (tool.mandatorySentence !== id) {
        problems.push(
          `${name}: mandatorySentence ist ${String(tool.mandatorySentence)}, nach Plan 3.5 ist es ${id}.`,
        );
      }

      const matched = mandatorySentenceMatch(tool.description, id);
      if (matched === undefined) {
        problems.push(
          `${name}: der Pflichtsatz ${id} steht nicht wörtlich in der Beschreibung (Plan 3.5, src/registry/mandatory-sentences.ts).`,
        );
        continue;
      }
      if (matched.trim() === "") {
        const placeholder = MANDATORY_SENTENCE_PLACEHOLDERS[id].at(0);
        if (placeholder !== undefined) {
          problems.push(`${name}: der Platzhalter ${placeholder} in ${id} ist nicht ersetzt.`);
        }
        continue;
      }
      if (id === "U1" && entryByName(matched) === undefined) {
        problems.push(
          `${name}: U1 nennt "${matched}" als Umkehrweg; ein Werkzeug dieses Namens gibt es nicht.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt je schreibendem Werkzeug genau einen der sieben Sätze", () => {
    const problems: string[] = [];

    for (const name of EXPECTED_WRITING_TOOL_NAMES) {
      const tool = entryByName(name);
      if (tool === undefined) continue;
      const matches = MANDATORY_SENTENCE_IDS.filter(
        (id) => mandatorySentenceMatch(tool.description, id) !== undefined,
      );
      if (matches.length !== 1) {
        problems.push(
          `${name}: ${String(matches.length)} Pflichtsätze in der Beschreibung (${matches.join(", ")}), erwartet ist genau einer.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt bei keinem der 15 lesenden Werkzeuge einen Pflichtsatz", () => {
    const problems: string[] = [];
    const writingToolNames = new Set(EXPECTED_WRITING_TOOL_NAMES);

    for (const tool of REGISTRY) {
      if (writingToolNames.has(tool.name)) continue;
      if (tool.mandatorySentence !== undefined) {
        problems.push(
          `${tool.name}: lesendes Werkzeug mit mandatorySentence ${tool.mandatorySentence}.`,
        );
      }
      const matches = MANDATORY_SENTENCE_IDS.filter(
        (id) => mandatorySentenceMatch(tool.description, id) !== undefined,
      );
      if (matches.length > 0) {
        problems.push(
          `${tool.name}: lesendes Werkzeug, dessen Beschreibung den Pflichtsatz ${matches.join(", ")} trägt. Eine Warnung, die überall steht, warnt nirgends.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("trägt die beiden Pflichtsätze auf Parameterebene aus Plan 4.7 und 4.3", () => {
    const problems: string[] = [];

    for (const paramRule of MANDATORY_SENTENCE_BY_PARAMETER) {
      const tool = entryByName(paramRule.tool);
      if (tool === undefined) {
        problems.push(
          `${missingEntry(paramRule.tool)} Erwartet wird an ${paramRule.fields.join(" und ")} der Satz aus ${paramRule.source}.`,
        );
        continue;
      }

      for (const fieldName of paramRule.fields) {
        const fields = flatFields(tool).filter(({ field }) => field.name === fieldName);
        if (fields.length === 0) {
          problems.push(`${paramRule.tool}: kein Feld ${fieldName}.`);
          continue;
        }
        for (const { path, field } of fields) {
          if (!field.description.includes(paramRule.sentence)) {
            problems.push(
              `${paramRule.tool}, Feld ${path}: der Pflichtsatz aus ${paramRule.source} fehlt wörtlich.`,
            );
          }
        }
      }
    }

    expectNoIssues(problems);
  });
});

describe("P8 Verweise", () => {
  it("nennt in jedem Verweis einen Werkzeugnamen, den es gibt", () => {
    const problems: string[] = [];
    // Geprüft wird gegen die erwarteten 54 Namen und nicht gegen das Register: Sonst wäre
    // ein richtiger Verweis solange falsch, wie das Zielwerkzeug noch nicht geschrieben ist,
    // und die fünf Registerpakete müssten sich abstimmen.
    const knownNames = new Set(EXPECTED_TOOL_NAMES);

    for (const tool of REGISTRY) {
      for (const { source, text } of allTexts(tool)) {
        for (const reference of text.match(/\bbb_[a-z0-9_]+/g) ?? []) {
          if (!knownNames.has(reference)) {
            problems.push(
              `${tool.name}, ${source}: Verweis auf ${reference}; ein Werkzeug dieses Namens gibt es nicht (Plan 9.2 P8).`,
            );
          }
        }
      }
    }

    expectNoIssues(problems);
  });

  it("verweist in keinem Werkzeug auf sich selbst als Alternative", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      // Der Selbstverweis ist erlaubt, wo er den Anschlussaufruf meint (Paginierung), aber
      // nie im Pflichtsatz U1: „Rückgängig zu machen mit sich selbst" ist keine Aussage.
      const matched = mandatorySentenceMatch(tool.description, "U1");
      if (matched !== undefined && matched === tool.name) {
        problems.push(`${tool.name}: U1 nennt das Werkzeug selbst als Umkehrweg.`);
      }
    }

    expectNoIssues(problems);
  });
});
