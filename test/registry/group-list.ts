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

/** Werkzeugname zu Werkzeuggruppe, alle 54 Endpunktwerkzeuge. */
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

  // Zahlungen, Werkzeuge 9 bis 16
  bb_transactions_search: "transactions",
  bb_transactions_get: "transactions",
  bb_transactions_list_receipts: "transactions",
  bb_transactions_create: "transactions",
  bb_transactions_create_batch: "transactions",
  bb_transactions_assign_receipt: "transactions",
  bb_transactions_assign_receipt_batch: "transactions",
  bb_transactions_unassign_receipt: "transactions",

  // Rechnungen, Werkzeuge 17 bis 19
  bb_invoices_create: "invoices",
  bb_invoices_create_draft: "invoices",
  bb_invoices_create_einvoice: "invoices",

  // Buchungen, Werkzeuge 20 bis 31
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

  // Debitoren, Werkzeuge 32 bis 35
  bb_debtors_search: "debtors",
  bb_debtors_create: "debtors",
  bb_debtors_create_batch: "debtors",
  bb_debtors_update: "debtors",

  // Kreditoren, Werkzeuge 36 bis 39
  bb_creditors_search: "creditors",
  bb_creditors_create: "creditors",
  bb_creditors_create_batch: "creditors",
  bb_creditors_update: "creditors",

  // Sachkonten, Werkzeuge 40 bis 42
  bb_postingaccounts_search: "postingaccounts",
  bb_postingaccounts_create: "postingaccounts",
  bb_postingaccounts_update: "postingaccounts",

  // Zahlungskonten, Werkzeuge 43 und 44
  bb_payment_accounts_list: "payment_accounts",
  bb_payment_accounts_create: "payment_accounts",

  // Kommentare, Werkzeug 45
  bb_comments_create: "comments",

  // Kostenstellen, Werkzeuge 46 bis 49
  bb_cost_locations_search: "cost_locations",
  bb_cost_locations_create: "cost_locations",
  bb_cost_locations_update: "cost_locations",
  bb_cost_locations_delete: "cost_locations",

  // Berichte, Werkzeuge 50 bis 54
  bb_reports_get_bwa: "reports",
  bb_reports_get_sums: "reports",
  bb_reports_get_ledger: "reports",
  bb_reports_create_bwa: "reports",
  bb_reports_create_sums: "reports",
} as const satisfies Record<string, ToolGroup>;

/**
 * Die Anzahl je Gruppe, von Hand abgeschrieben. Summe 54. Sie ist die Quersumme zur Liste
 * oben: Ein Tippfehler dort, der ein Werkzeug verschiebt, fällt hier auf.
 *
 * `bundles` steht **nicht** in dieser Tabelle: Die Gruppe führt kein Endpunktwerkzeug, und ihre
 * Besetzung ist Sache der Bündelwerkzeuge selbst.
 */
export const EXPECTED_GROUP_COUNTS = {
  postings: 12,
  receipts: 8,
  transactions: 8,
  invoices: 3,
  creditors: 4,
  reports: 5,
  debtors: 4,
  postingaccounts: 3,
  cost_locations: 4,
  payment_accounts: 2,
  comments: 1,
} as const satisfies Partial<Record<ToolGroup, number>>;

/**
 * Die gemessene Tokenlast je Gruppe, Stand 2026-09-14, von Hand aus derselben Tabelle
 * abgeschrieben. Summe 48.964, also die gemessene Gesamtzahl der 54 Definitionen.
 *
 * Sie steht hier ein zweites Mal, weil die Zahlen in `src/registry/groups.ts` in Startmeldung,
 * `doctor` und `print-config` als Tatsache ausgegeben werden. Eine ausgegebene Zahl, die nur
 * gegen sich selbst geprüft wird, ist keine Messung.
 */
export const EXPECTED_GROUP_TOKENS = {
  postings: 12_213,
  receipts: 8_529,
  transactions: 6_661,
  invoices: 5_766,
  creditors: 3_341,
  reports: 3_799,
  debtors: 3_198,
  postingaccounts: 1_877,
  cost_locations: 1_839,
  payment_accounts: 1_142,
  comments: 599,
} as const satisfies Partial<Record<ToolGroup, number>>;
