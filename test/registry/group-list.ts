// Die zweite, unabhängig gepflegte Gruppenliste für die Prüfung von `BB_MCP_TOOL_GROUPS`.
//
// Sie liegt aus demselben Grund getrennt vom Register wie `class-list.ts`: Eine Prüfung, die
// die Gruppe aus derselben Datei liest, in der sie steht, prüft sich selbst. Erst zwei
// unabhängige Quellen fangen den Fall, dass jemand ein Werkzeug versehentlich umgruppiert und
// es damit unter einem Variablenwert verschwindet, mit dem niemand rechnet.
//
// Die Liste wird niemals aus dem Namen abgeleitet, und sie darf es auch nicht: Ein Zerlegen am
// zweiten Unterstrich ergäbe `cost` statt `cost_locations` und `payment` statt
// `payment_accounts`, und die Bündelwerkzeuge tragen kein `bb_bundles_` im Namen und liegen
// trotzdem in `bundles`.
//
// Reihenfolge und Abschnittsüberschriften sind die der Werkzeugnummern, damit ein
// Abgleich ohne Zählen möglich ist.

import type { ToolGroup } from "../../src/registry/groups.js";

/** Werkzeugname zu Werkzeuggruppe, alle 61 Endpunktwerkzeuge. */
export const EXPECTED_TOOL_GROUPS = {
  // Belege, Werkzeuge 1 bis 8
  bb_receipts_search: "receipts",
  bb_receipts_get: "receipts",
  bb_receipts_list_transactions: "receipts",
  bb_receipts_create: "receipts",
  bb_receipts_create_batch: "receipts",
  bb_receipts_upload: "receipts",
  bb_receipts_delete: "receipts",
  bb_receipts_restore: "receipts",

  // Zahlungen, Werkzeuge 9 bis 17
  bb_transactions_search: "transactions",
  bb_transactions_get: "transactions",
  bb_transactions_list_receipts: "transactions",
  bb_transactions_create: "transactions",
  bb_transactions_create_batch: "transactions",
  bb_transactions_assign_receipt: "transactions",
  bb_transactions_assign_receipt_batch: "transactions",
  bb_transactions_unassign_receipt: "transactions",
  bb_transactions_delete: "transactions",

  // Rechnungen, Werkzeuge 18 bis 21
  bb_invoices_create: "invoices",
  bb_invoices_create_draft: "invoices",
  bb_invoices_create_einvoice: "invoices",
  bb_invoices_create_correction: "invoices",

  // Buchungen, Werkzeuge 22 bis 33
  bb_postings_search: "postings",
  bb_postings_create_for_receipt: "postings",
  bb_postings_create_for_receipt_batch: "postings",
  bb_postings_create_for_transaction: "postings",
  bb_postings_create_for_transaction_batch: "postings",
  bb_postings_create_free: "postings",
  bb_postings_create_free_batch: "postings",
  bb_postings_unconfirm_for_receipt: "postings",
  bb_postings_unconfirm_for_transaction: "postings",
  bb_postings_unconfirm_free: "postings",
  bb_postings_assign_receipt: "postings",
  bb_postings_cancel: "postings",

  // Debitoren, Werkzeuge 34 bis 38
  bb_debtors_search: "debtors",
  bb_debtors_create: "debtors",
  bb_debtors_create_batch: "debtors",
  bb_debtors_update: "debtors",
  bb_debtors_delete: "debtors",

  // Kreditoren, Werkzeuge 39 bis 43
  bb_creditors_search: "creditors",
  bb_creditors_create: "creditors",
  bb_creditors_create_batch: "creditors",
  bb_creditors_update: "creditors",
  bb_creditors_delete: "creditors",

  // Sachkonten, Werkzeuge 44 bis 47
  bb_postingaccounts_search: "postingaccounts",
  bb_postingaccounts_create: "postingaccounts",
  bb_postingaccounts_update: "postingaccounts",
  bb_postingaccounts_delete: "postingaccounts",

  // Zahlungskonten, Werkzeuge 48 bis 51
  bb_payment_accounts_list: "payment_accounts",
  bb_payment_accounts_create: "payment_accounts",
  bb_payment_accounts_update: "payment_accounts",
  bb_payment_accounts_delete: "payment_accounts",

  // Kommentare, Werkzeug 52
  bb_comments_create: "comments",

  // Kostenstellen, Werkzeuge 53 bis 56
  bb_cost_locations_search: "cost_locations",
  bb_cost_locations_create: "cost_locations",
  bb_cost_locations_update: "cost_locations",
  bb_cost_locations_delete: "cost_locations",

  // Berichte, Werkzeuge 57 bis 61
  bb_reports_get_bwa: "reports",
  bb_reports_get_sums: "reports",
  bb_reports_get_ledger: "reports",
  bb_reports_create_bwa: "reports",
  bb_reports_create_sums: "reports",
} as const satisfies Record<string, ToolGroup>;

/**
 * Die Anzahl je Gruppe, von Hand abgeschrieben. Summe 61. Sie ist die Quersumme zur Liste
 * oben: Ein Tippfehler dort, der ein Werkzeug verschiebt, fällt hier auf.
 *
 * `bundles` steht **nicht** in dieser Tabelle: Die Gruppe führt kein Endpunktwerkzeug, und ihre
 * Besetzung ist Sache der Bündelwerkzeuge selbst.
 */
export const EXPECTED_GROUP_COUNTS = {
  postings: 12,
  receipts: 8,
  transactions: 9,
  invoices: 4,
  creditors: 5,
  reports: 5,
  debtors: 5,
  postingaccounts: 4,
  cost_locations: 4,
  payment_accounts: 4,
  comments: 1,
} as const satisfies Partial<Record<ToolGroup, number>>;

/**
 * Die gemessene Tokenlast je Gruppe, Stand 2026-11-26, von Hand aus derselben Tabelle
 * abgeschrieben. Summe 53.143, also die gemessene Gesamtzahl der 61 Definitionen.
 *
 * Sie steht hier ein zweites Mal, weil die Zahlen in `src/registry/groups.ts` in Startmeldung,
 * `doctor` und `print-config` als Tatsache ausgegeben werden. Eine ausgegebene Zahl, die nur
 * gegen sich selbst geprüft wird, ist keine Messung.
 */
export const EXPECTED_GROUP_TOKENS = {
  postings: 14_012,
  receipts: 8_474,
  transactions: 7_024,
  invoices: 6_215,
  creditors: 3_549,
  reports: 3_777,
  debtors: 3_409,
  postingaccounts: 2_239,
  cost_locations: 1_806,
  payment_accounts: 2_050,
  comments: 588,
} as const satisfies Partial<Record<ToolGroup, number>>;
