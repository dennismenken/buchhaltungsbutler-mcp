// Die Wirkungstabelle für P6.
//
// Von Hand aus docs/api/grundlagen.md Abschnitt 7.3 abgeschrieben, Spalte „Wirkung", und
// bewusst GETRENNT vom Register geführt: Eine Prüfung, die die Wirkung aus demselben Eintrag
// liest, den sie prüft, kann nicht mehr fangen, dass Implementierung und Dossier
// auseinanderlaufen. Genau das ist die Aufgabe von P6.
//
// Geschlüsselt ist nach dem SPEZIFIKATIONSPFAD und nicht nach dem Werkzeugnamen, weil
// grundlagen.md 7.3 Endpunkte einstuft und keine Werkzeuge. Bei den vier Endpunkten mit
// Pfadvorlage steht hier deshalb der unveränderte Schlüssel der Spezifikation, also
// /receipts/get/id_by_customer und nicht die Vorlage.
//
// HINWEIS zu den beiden Einzelabruf-Endpunkten: grundlagen.md 7.3 vermerkt bei
// /receipts/get/id_by_customer und /transactions/get/id_by_customer „live nicht benutzbar".
// Dieser Vermerk ist durch die Messung L1 widerlegt; er
// betrifft ohnehin nur die Benutzbarkeit und nicht die Wirkung. Übernommen wird hier allein
// die Spalte „Wirkung", und die ist in beiden Fällen „lesend".

import type { ToolEffect } from "../../src/registry/types.js";

/**
 * Spezifikationspfad zu Wirkung, alle 54 Endpunkte, in der Gliederung von
 * grundlagen.md 7.3 (Receipts, Transactions, Invoices, Postings, Settings, Accounts und
 * Comments und Cost Locations, Reports).
 */
export const EXPECTED_ENDPOINT_EFFECTS = {
  // Receipts
  "/receipts/get": "read",
  "/receipts/get/id_by_customer": "read",
  "/receipts/assigned-transactions/get": "read",
  "/receipts/add": "create",
  "/receipts/addBatch": "create",
  "/receipts/upload": "create",
  "/receipts/delete/id_by_customer": "delete",
  "/receipts/restore/id_by_customer": "modify",

  // Transactions
  "/transactions/get": "read",
  "/transactions/get/id_by_customer": "read",
  "/transactions/assigned-receipts/get": "read",
  "/transactions/add": "create",
  "/transactions/addBatch": "create",
  "/transactions/assign/receipt": "modify",
  "/transactions/assign-batch/receipt": "modify",
  "/transactions/unassign/receipt": "delete",

  // Invoices
  "/invoices/create": "create",
  "/invoices/create/e-invoice": "create",
  "/invoices/create/draft": "create",

  // Postings
  "/postings/get": "read",
  "/postings/add/receipt": "create",
  "/postings/add-batch/receipts": "create",
  "/postings/add/transaction": "create",
  "/postings/add-batch/transactions": "create",
  "/postings/add/free": "create",
  "/postings/add-batch/free": "create",
  "/postings/unconfirm/receipt": "delete",
  "/postings/unconfirm/transaction": "delete",
  "/postings/unconfirm/free": "delete",
  "/postings/assign/receipt-to-free-posting": "modify",
  "/postings/cancel": "delete",

  // Settings
  "/settings/get/debtors": "read",
  "/settings/get/creditors": "read",
  "/settings/get/postingaccounts": "read",
  "/settings/add/debtor": "create",
  "/settings/add-batch/debtors": "create",
  "/settings/add/creditor": "create",
  "/settings/add-batch/creditors": "create",
  "/settings/add/postingaccount": "create",
  "/settings/update/debtor": "modify",
  "/settings/update/creditor": "modify",
  "/settings/update/postingaccount": "modify",

  // Accounts, Comments, Cost Locations
  "/accounts/get": "read",
  "/accounts/add": "create",
  "/comments/add": "create",
  "/cost-locations/get": "read",
  "/cost-locations/add": "create",
  "/cost-locations/update": "modify",
  "/cost-locations/delete": "delete",

  // Reports
  "/reports/get/bwa": "read",
  "/reports/get/sums": "read",
  "/reports/get/sums/ledger": "read",
  "/reports/create/bwa": "create",
  "/reports/create/sums": "create",
} as const satisfies Record<string, ToolEffect>;

/**
 * Die Auszählung aus grundlagen.md 7.3, Abschnitt „Zusammenfassung für einen
 * Nur-Lesen-Modus", von Hand abgeschrieben. Summe 54. Sie ist die Quersumme zur Tabelle
 * oben: Eine verrutschte Zeile dort fällt hier auf.
 */
export const EXPECTED_EFFECT_COUNTS = {
  read: 15,
  create: 24,
  modify: 8,
  delete: 7,
} as const satisfies Record<ToolEffect, number>;

/** Alle 54 Spezifikationspfade. Abgeleitet aus der Tabelle oben, keine zweite Quelle. */
export const EXPECTED_SPEC_PATHS: readonly string[] = Object.keys(EXPECTED_ENDPOINT_EFFECTS);

/**
 * Die 15 lesenden Endpunkte, und nur diese, dürfen in einem Nur-Lesen-Modus freigeschaltet
 * sein (grundlagen.md 7.3). Abgeleitet, keine zweite Quelle.
 */
export const EXPECTED_READ_ONLY_SPEC_PATHS: readonly string[] = EXPECTED_SPEC_PATHS.filter(
  (path) => EXPECTED_ENDPOINT_EFFECTS[path as keyof typeof EXPECTED_ENDPOINT_EFFECTS] === "read",
);

/** Die erwartete Wirkung eines Endpunkts, oder `undefined` für einen unbekannten Pfad. */
export function expectedEffectOf(path: string): ToolEffect | undefined {
  return (EXPECTED_ENDPOINT_EFFECTS as Readonly<Record<string, ToolEffect>>)[path];
}
