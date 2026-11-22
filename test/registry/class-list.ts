// Die zweite, unabhängig gepflegte Klassenliste für P5.
//
// Sie ist von Hand aus der Tabelle abgeschrieben, Spalte „Kl.", und liegt
// bewusst GETRENNT vom Register: Eine Prüfung, die die Klasse aus derselben Datei liest, in
// der sie steht, prüft sich selbst. Erst zwei unabhängige Quellen fangen den Fall, dass
// jemand ein Werkzeug versehentlich umklassifiziert.
//
// Die Liste wird niemals aus dem Namen abgeleitet, und sie darf es auch nicht:
// bb_postings_assign_receipt endet auf _receipt und ist buchend (B),
// bb_reports_get_ledger endet auf _ledger und ist lesend (R).
//
// Ändert sich eine Klasse oder eine Annotation, wird diese Datei gemeinsam mit
// src/registry/classes.ts und annotations.test.ts nachgezogen. Sie ist die
// einzige Stelle in test/, an der die 61 Werkzeugnamen namentlich stehen; die übrigen
// Prüfungen arbeiten gegen EXPECTED_TOOL_NAMES, damit eine fehlende Datei in jeder Prüfung
// denselben Namen nennt.

import type { ToolClass } from "../../src/registry/types.js";

/**
 * Werkzeugname zu Klasse, alle 61 Einträge, in der Reihenfolge der Werkzeugnummern.
 * Die Nummern stehen als Kommentar dabei, damit ein Abgleich ohne Zählen möglich ist.
 */
export const EXPECTED_TOOL_CLASSES = {
  // Belege, Werkzeuge 1 bis 8
  bb_receipts_search: "R",
  bb_receipts_get: "R",
  bb_receipts_list_transactions: "R",
  bb_receipts_create: "A",
  bb_receipts_create_batch: "A",
  bb_receipts_upload: "A",
  bb_receipts_delete: "D",
  bb_receipts_restore: "A",

  // Zahlungen, Werkzeuge 9 bis 17
  bb_transactions_search: "R",
  bb_transactions_get: "R",
  bb_transactions_list_receipts: "R",
  bb_transactions_create: "A",
  bb_transactions_create_batch: "A",
  bb_transactions_assign_receipt: "A",
  bb_transactions_assign_receipt_batch: "A",
  bb_transactions_unassign_receipt: "D",
  bb_transactions_delete: "D",

  // Rechnungen, Werkzeuge 18 bis 21
  bb_invoices_create: "B",
  bb_invoices_create_draft: "B",
  bb_invoices_create_einvoice: "B",
  bb_invoices_create_correction: "B",

  // Buchungen, Werkzeuge 22 bis 33
  bb_postings_search: "R",
  bb_postings_create_for_receipt: "B",
  bb_postings_create_for_receipt_batch: "B",
  bb_postings_create_for_transaction: "B",
  bb_postings_create_for_transaction_batch: "B",
  bb_postings_create_free: "B",
  bb_postings_create_free_batch: "B",
  bb_postings_unconfirm_for_receipt: "D",
  bb_postings_unconfirm_for_transaction: "D",
  bb_postings_unconfirm_free: "D",
  bb_postings_assign_receipt: "B",
  bb_postings_cancel: "D",

  // Debitoren, Werkzeuge 34 bis 38
  bb_debtors_search: "R",
  bb_debtors_create: "A",
  bb_debtors_create_batch: "A",
  bb_debtors_update: "M",
  bb_debtors_delete: "D",

  // Kreditoren, Werkzeuge 39 bis 43
  bb_creditors_search: "R",
  bb_creditors_create: "A",
  bb_creditors_create_batch: "A",
  bb_creditors_update: "M",
  bb_creditors_delete: "D",

  // Sachkonten, Werkzeuge 44 bis 47
  bb_postingaccounts_search: "R",
  bb_postingaccounts_create: "A",
  bb_postingaccounts_update: "M",
  bb_postingaccounts_delete: "D",

  // Zahlungskonten, Werkzeuge 48 bis 51
  bb_payment_accounts_list: "R",
  bb_payment_accounts_create: "A",
  bb_payment_accounts_update: "M",
  bb_payment_accounts_delete: "D",

  // Kommentare, Werkzeug 52
  bb_comments_create: "A",

  // Kostenstellen, Werkzeuge 53 bis 56
  bb_cost_locations_search: "R",
  bb_cost_locations_create: "A",
  bb_cost_locations_update: "M",
  bb_cost_locations_delete: "D",

  // Berichte, Werkzeuge 57 bis 61
  bb_reports_get_bwa: "R",
  bb_reports_get_sums: "R",
  bb_reports_get_ledger: "R",
  bb_reports_create_bwa: "AR",
  bb_reports_create_sums: "AR",
} as const satisfies Record<string, ToolClass>;

/**
 * Die Anzahl je Klasse, ebenfalls von Hand abgeschrieben. Summe 61.
 * Sie ist die Quersumme zur Liste oben: Ein Tippfehler dort, der eine Klasse verschiebt,
 * fällt hier auf.
 */
export const EXPECTED_CLASS_COUNTS = {
  R: 15,
  A: 16,
  AR: 2,
  M: 5,
  D: 12,
  B: 11,
} as const satisfies Record<ToolClass, number>;

/** Die 61 erwarteten Werkzeugnamen. Abgeleitet aus der Liste oben, keine zweite Quelle. */
export const EXPECTED_TOOL_NAMES: readonly string[] = Object.keys(EXPECTED_TOOL_CLASSES);

/**
 * Die 46 schreibenden Werkzeuge, also alles außer Klasse R. Abgeleitet, keine zweite Quelle.
 * Sie sind die Menge, die den Nur-Lesen-Schalter nicht passiert und die ein
 * `verifyWith` sowie einen Pflichtsatz tragen muss (P8, P10).
 */
export const EXPECTED_WRITING_TOOL_NAMES: readonly string[] = EXPECTED_TOOL_NAMES.filter(
  (name) => EXPECTED_TOOL_CLASSES[name as keyof typeof EXPECTED_TOOL_CLASSES] !== "R",
);

/** Die 15 lesenden Werkzeuge. Abgeleitet, keine zweite Quelle. */
export const EXPECTED_READING_TOOL_NAMES: readonly string[] = EXPECTED_TOOL_NAMES.filter(
  (name) => EXPECTED_TOOL_CLASSES[name as keyof typeof EXPECTED_TOOL_CLASSES] === "R",
);

/** Die erwartete Klasse eines Werkzeugs, oder `undefined` für einen unbekannten Namen. */
export function expectedClassOf(name: string): ToolClass | undefined {
  return (EXPECTED_TOOL_CLASSES as Readonly<Record<string, ToolClass>>)[name];
}
