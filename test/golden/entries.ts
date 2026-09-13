// Registereinträge als **Test-Attrappe** zu den Golden-Dateien.
//
// Ein Golden-Körper ist ohne seinen Antwortvertrag nicht lesbar: Erst der Eintrag sagt, welche
// Felder bekannt sind, welchen Typ sie haben, welche Form der Umschlag hat und welche Felder
// `concise` zeigt (Plan 2.1, 7.2). Die echten 54 Einträge entstehen in AP12a bis AP12e; bis
// dahin stehen hier die wenigen, die AP09 zum Prüfen braucht.
//
// **Das sind keine Registereinträge.** Sie liegen bewusst unter `test/` und werden nie
// ausgeliefert. Ihre Feldmengen und Typen stammen aus denselben Quellen wie die Golden-Dateien
// (Plan 0.3 L2 und L3, die Projektionen aus 7.4); wo der echte Eintrag später abweicht, ist das
// kein Widerspruch, solange diese Tests weiter das prüfen, was sie prüfen sollen.

import { z } from "zod";

import { einvoiceItems, invoiceItems, postingPositions } from "../../src/schema/line-items.js";
import { limit, offset } from "../../src/schema/pagination.js";
import { amountValue, strictObject } from "../../src/schema/primitives.js";
import {
  costLocation,
  date,
  idByCustomer,
  postingAccountNumber,
  responseFormat,
  vatKey,
} from "../../src/schema/vocab.js";
import type { ContractFieldType, FieldSpec, ToolEntry } from "../../src/registry/types.js";

/** Die Mengengrenze der Positionslisten in den Attrappen: die Vorgabe aus 6.2. */
export const TEST_MAX_ITEMS = 50;

function field(spec: Partial<FieldSpec> & Pick<FieldSpec, "name" | "schema">): FieldSpec {
  return {
    apiNames: [spec.name],
    source: "body",
    required: false,
    description: `Testfeld ${spec.name}.`,
    ...spec,
  };
}

function entry(spec: Partial<ToolEntry> & Pick<ToolEntry, "name" | "path">): ToolEntry {
  return {
    title: `Attrappe ${spec.name}`,
    // Die Gruppe der Attrappe ist beliebig, aber Pflicht: `group` ist ein Feld von ToolEntry
    // und wird niemals aus dem Namen abgeleitet (src/registry/groups.ts).
    group: "receipts",
    effect: "read",
    toolClass: "R",
    tier: 2,
    description: `Attrappe für ${spec.name}.`,
    fields: [],
    serverOnlyFields: [],
    omitted: [{ apiName: "api_key", reason: "kommt aus der Konfiguration (Plan 6.2)" }],
    responseContract: {
      container: "data",
      fields: {},
      source: "gemessen",
      measuredOn: "2026-09-12",
    },
    shape: "list",
    concise: [],
    bucket: "default",
    timeoutTier: "normal",
    crossChecks: [],
    invalidatesCache: [],
    ...spec,
  };
}

// --- Antwortverträge ----------------------------------------------------------------

/** `/receipts/get`, 16 gemessene Felder (Plan 0.3 Befund L2, L3). */
export const RECEIPTS_LIST_FIELDS: Readonly<Record<string, ContractFieldType>> = Object.freeze({
  filename: "string",
  id_by_customer: "id-string",
  type: "string",
  date: "string",
  delivery_date: "null-or-string",
  date_uploaded: "null-or-string",
  counterparty: "string",
  invoicenumber: "string",
  amount: "amount-string",
  payment_date: "null-or-string",
  due_date: "null-or-string",
  account: "string",
  amount_paid: "amount-string",
  amount_paid_fixed: "amount-string",
  deleted: "bool-string",
  link_to_receipt_id_by_customer: "null-or-string",
});

/** `/receipts/get/{wert}`, 23 gemessene Felder. `e_invoice_type` kam als Zahl (Befund L3). */
export const RECEIPTS_SINGLE_FIELDS: Readonly<Record<string, ContractFieldType>> = Object.freeze({
  filename: "string",
  id_by_customer: "id-string",
  type: "string",
  date: "string",
  counterparty: "string",
  invoicenumber: "string",
  amount: "amount-string",
  amount_original: "amount-string",
  currency: "string",
  currency_original: "string",
  exchangerate: "string",
  vat: "string",
  payment_date: "null-or-string",
  account: "string",
  e_invoice_type: "number",
  list_direction: "string",
  payment_reference: "null-or-string",
  date_delivery: "null-or-string",
  date_payment_due: "null-or-string",
  amount_paid: "amount-string",
  amount_paid_fixed: "amount-string",
  deleted: "bool-string",
  link_to_receipt_id_by_customer: "null-or-string",
});

/** `/transactions/get`, 6 gemessene Felder; `id_by_customer` kam als Zahl. */
export const TRANSACTIONS_LIST_FIELDS: Readonly<Record<string, ContractFieldType>> = Object.freeze({
  id_by_customer: "id-string",
  to_from: "string",
  amount: "amount-string",
  booking_date: "string",
  value_date: "string",
  purpose: "null-or-string",
});

/** `/transactions/get/{wert}`, 13 gemessene Felder; `account` kam als Zahl. */
export const TRANSACTIONS_SINGLE_FIELDS: Readonly<Record<string, ContractFieldType>> =
  Object.freeze({
    id_by_customer: "id-string",
    account: "id-string",
    to_from: "string",
    booking_date: "string",
    value_date: "string",
    amount: "amount-string",
    currency: "string",
    account_number: "null-or-string",
    bank_code: "null-or-string",
    bank_name: "null-or-string",
    purpose: "null-or-string",
    type: "null-or-string",
    booking_text: "null-or-string",
  });

// --- Die Attrappen ------------------------------------------------------------------

/** Werkzeug 1, `/receipts/get`: Liste mit Paginierung, Filtern und Projektion. */
export const RECEIPTS_SEARCH: ToolEntry = entry({
  name: "bb_receipts_search",
  title: "Belege suchen",
  path: { literal: "/receipts/get" },
  fields: [
    field({ name: "list_direction", required: true, schema: z.enum(["inbound", "outbound"]) }),
    field({ name: "date_from", schema: date("Beginn") }),
    field({ name: "date_to", schema: date("Ende") }),
    field({ name: "counterparty", schema: z.string().min(1) }),
    field({ name: "limit", required: true, schema: limit(500, 100) }),
    field({ name: "offset", required: true, schema: offset() }),
    field({
      name: "response_format",
      apiNames: [],
      source: "server",
      schema: responseFormat(),
    }),
  ],
  serverOnlyFields: ["response_format"],
  responseContract: {
    container: "data",
    fields: RECEIPTS_LIST_FIELDS,
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  concise: [
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
});

/** Werkzeug 2, `/receipts/get/id_by_customer`: Pfadvorlage, `data` als Objekt ohne `rows`. */
export const RECEIPTS_GET: ToolEntry = entry({
  name: "bb_receipts_get",
  title: "Beleg holen",
  path: {
    template: "/receipts/get/{receipt_id_by_customer}",
    params: ["receipt_id_by_customer"],
    specPath: "/receipts/get/id_by_customer",
  },
  fields: [
    field({
      name: "receipt_id_by_customer",
      apiNames: [],
      source: "path",
      required: true,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    }),
    field({ name: "get_file", schema: z.boolean() }),
    field({ name: "response_format", apiNames: [], source: "server", schema: responseFormat() }),
  ],
  serverOnlyFields: ["response_format"],
  responseContract: {
    container: "data",
    fields: RECEIPTS_SINGLE_FIELDS,
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "object",
  concise: [
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
});

/** Werkzeug 7, `/receipts/delete/id_by_customer`: dieselbe Pfadform, aber schreibend. */
export const RECEIPTS_DELETE: ToolEntry = entry({
  name: "bb_receipts_delete",
  title: "Beleg als gelöscht markieren",
  path: {
    template: "/receipts/delete/{receipt_id_by_customer}",
    params: ["receipt_id_by_customer"],
    specPath: "/receipts/delete/id_by_customer",
  },
  effect: "delete",
  toolClass: "D",
  tier: 1,
  mandatorySentence: "U3",
  fields: [
    field({
      name: "receipt_id_by_customer",
      apiNames: [],
      source: "path",
      required: true,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    }),
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_get",
    argsFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
    hint: "Das Feld deleted zeigt danach 1.",
  },
  // Aufrufform aus L1 abgeleitet, schreibend und deshalb nicht getestet (Plan 4.6).
  verified: false,
});

/** Werkzeug 10, `/transactions/get/id_by_customer`. */
export const TRANSACTIONS_GET: ToolEntry = entry({
  name: "bb_transactions_get",
  title: "Zahlung holen",
  path: {
    template: "/transactions/get/{transaction_id_by_customer}",
    params: ["transaction_id_by_customer"],
    specPath: "/transactions/get/id_by_customer",
  },
  tier: 3,
  fields: [
    field({
      name: "transaction_id_by_customer",
      apiNames: [],
      source: "path",
      required: true,
      schema: idByCustomer("der Zahlung", "bb_transactions_search"),
    }),
    field({ name: "response_format", apiNames: [], source: "server", schema: responseFormat() }),
  ],
  serverOnlyFields: ["response_format"],
  responseContract: {
    container: "data",
    fields: TRANSACTIONS_SINGLE_FIELDS,
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "object",
  concise: [
    "id_by_customer",
    "account",
    "to_from",
    "booking_date",
    "value_date",
    "amount",
    "currency",
    "purpose",
  ],
});

/** Werkzeug 9, `/transactions/get`. */
export const TRANSACTIONS_SEARCH: ToolEntry = entry({
  name: "bb_transactions_search",
  title: "Zahlungen suchen",
  path: { literal: "/transactions/get" },
  fields: [
    field({ name: "date_from", schema: date("Beginn") }),
    field({ name: "date_to", schema: date("Ende") }),
    field({
      name: "payment_account_number",
      apiNames: ["account"],
      schema: postingAccountNumber(),
    }),
    field({ name: "to_from", schema: z.string().min(1) }),
    field({ name: "limit", required: true, schema: limit(500, 100) }),
    field({ name: "offset", required: true, schema: offset() }),
  ],
  responseContract: {
    container: "data",
    fields: TRANSACTIONS_LIST_FIELDS,
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  concise: ["id_by_customer", "to_from", "amount", "booking_date", "value_date", "purpose"],
});

/** Werkzeug 43, `/accounts/get`: ohne Paginierung, nie zwischengespeichert (Plan 7.5, 7.8). */
export const PAYMENT_ACCOUNTS_LIST: ToolEntry = entry({
  name: "bb_payment_accounts_list",
  title: "Zahlungskonten auflisten",
  path: { literal: "/accounts/get" },
  tier: 1,
  fields: [],
  responseContract: {
    container: "data",
    fields: { name: "string", postingaccount_number: "string" },
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  concise: ["postingaccount_number", "name"],
});

/** Werkzeug 40, `/settings/get/postingaccounts`: speicherfähig (Plan 7.8). */
export const POSTINGACCOUNTS_SEARCH: ToolEntry = entry({
  name: "bb_postingaccounts_search",
  title: "Konten suchen",
  path: { literal: "/settings/get/postingaccounts" },
  tier: 1,
  fields: [
    field({ name: "limit", required: true, schema: limit(null, 200) }),
    field({ name: "offset", required: true, schema: offset() }),
  ],
  responseContract: {
    container: "data",
    fields: {
      postingaccount_number: "string",
      name: "string",
      type: "string",
      subtype: "null-or-string",
    },
    source: "dokumentiert",
  },
  shape: "list",
  concise: ["postingaccount_number", "name", "type", "subtype"],
  invalidatesCache: [],
});

/** Werkzeug 20, `/postings/get`: trägt die beiden Filterumbenennungen aus Anhang A. */
export const POSTINGS_SEARCH: ToolEntry = entry({
  name: "bb_postings_search",
  title: "Buchungen suchen",
  path: { literal: "/postings/get" },
  tier: 1,
  fields: [
    field({ name: "date_from", required: true, schema: date("Beginn") }),
    field({ name: "date_to", required: true, schema: date("Ende") }),
    field({ name: "account_filter", apiNames: ["account"], schema: z.string().min(1) }),
    field({
      name: "postingaccount_filter",
      apiNames: ["postingaccount"],
      schema: z.string().min(1),
    }),
    field({ name: "limit", required: true, schema: limit(1000, 100) }),
    field({ name: "offset", required: true, schema: offset() }),
  ],
  responseContract: {
    container: "data",
    fields: {
      id_by_customer: "id-string",
      date: "string",
      postingtext: "string",
      amount: "amount-string",
      debit_postingaccount_number: "string",
      credit_postingaccount_number: "string",
      tax_key: "number",
      fixed: "bool-string",
      receipt_id_by_customer: "null-or-string",
    },
    source: "dokumentiert",
  },
  shape: "list",
  concise: [
    "id_by_customer",
    "date",
    "postingtext",
    "amount",
    "debit_postingaccount_number",
    "credit_postingaccount_number",
    "tax_key",
    "fixed",
    "receipt_id_by_customer",
  ],
});

/** Werkzeug 25, `/postings/add/free`: acht **skalare** Felder, keine Positionsliste (Plan 4.8). */
export const POSTINGS_CREATE_FREE: ToolEntry = entry({
  name: "bb_postings_create_free",
  title: "Freie Buchung anlegen",
  path: { literal: "/postings/add/free" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  mandatorySentence: "U1",
  fields: [
    field({ name: "date", required: true, schema: date("Buchungsdatum") }),
    field({ name: "postingtext", required: true, schema: z.string().min(1).max(128) }),
    field({ name: "amount", required: true, schema: amountValue("Betrag der Buchung.") }),
    field({ name: "postingaccount_debit", required: true, schema: postingAccountNumber() }),
    field({ name: "postingaccount_credit", required: true, schema: postingAccountNumber() }),
    field({ name: "vat", required: true, schema: vatKey() }),
    field({ name: "cost_location", schema: costLocation() }),
    field({ name: "cost_location_two", schema: costLocation() }),
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    argsFrom: { date_from: "date", date_to: "date" },
    hint: "Nach postingtext und amount suchen.",
  },
});

/** Werkzeug 21, `/postings/add/receipt`: Positionsliste auf oberster Ebene (Plan 4.8). */
export const POSTINGS_CREATE_FOR_RECEIPT: ToolEntry = entry({
  name: "bb_postings_create_for_receipt",
  title: "Buchungen zu Beleg anlegen",
  path: { literal: "/postings/add/receipt" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  mandatorySentence: "U1",
  fields: [
    field({
      name: "receipt_id_by_customer",
      required: true,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    }),
    field({ name: "creditor", schema: postingAccountNumber() }),
    field({ name: "debtor", schema: postingAccountNumber() }),
    {
      name: "positions",
      apiNames: [
        "postingaccounts",
        "postingtexts",
        "vats",
        "cost_locations",
        "cost_locations_two",
        "amounts",
      ],
      source: "body",
      required: true,
      description: "Die Buchungssätze zu diesem Beleg.",
      schema: postingPositions("receipt", {
        description: "Die Buchungssätze zu diesem Beleg.",
        maxItems: TEST_MAX_ITEMS,
      }),
      transform: "parallel-arrays",
      itemFields: POSITION_FIELDS("receipt"),
    },
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    argsFrom: { date_from: "date" },
    hint: "Buchungen des Belegs prüfen.",
  },
});

/** Werkzeug 22, `/postings/add-batch/receipts`: Objektliste mit **geschachtelter** Positionsliste. */
export const POSTINGS_CREATE_FOR_RECEIPT_BATCH: ToolEntry = entry({
  name: "bb_postings_create_for_receipt_batch",
  title: "Buchungen zu Belegen anlegen",
  path: { literal: "/postings/add-batch/receipts" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  mandatorySentence: "U1",
  fields: [
    {
      name: "receipts",
      apiNames: ["receipts"],
      source: "body",
      required: true,
      description: "Die Belege mit ihren Buchungssätzen.",
      schema: z.array(
        strictObject({
          receipt_id_by_customer: idByCustomer("des Belegs", "bb_receipts_search"),
          creditor: postingAccountNumber().optional(),
          debtor: postingAccountNumber().optional(),
          positions: postingPositions("receipt-batch", {
            description: "Die Buchungssätze zu diesem Beleg.",
            maxItems: TEST_MAX_ITEMS,
          }),
        }),
      ),
      transform: "object-list",
      itemFields: [
        field({
          name: "receipt_id_by_customer",
          required: true,
          schema: idByCustomer("des Belegs", "bb_receipts_search"),
        }),
        field({ name: "creditor", schema: postingAccountNumber() }),
        field({ name: "debtor", schema: postingAccountNumber() }),
        {
          name: "positions",
          apiNames: [
            "postingaccounts",
            // Spezifikationsfehler aus Plan 0.5: ReceiptPostings trägt postingstexts.
            "postingstexts",
            "vats",
            "cost_locations",
            "cost_locations_two",
            "amounts",
          ],
          source: "body",
          required: true,
          description: "Die Buchungssätze zu diesem Beleg.",
          schema: postingPositions("receipt-batch", {
            description: "Die Buchungssätze zu diesem Beleg.",
            maxItems: TEST_MAX_ITEMS,
          }),
          transform: "parallel-arrays",
          itemFields: POSITION_FIELDS("receipt-batch"),
        },
      ],
    },
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: { kind: "none", reason: "Die API bietet keinen Leseweg je Stapel." },
});

/** Werkzeug 23, `/postings/add/transaction`: sieben Spalten, `null` je Position erlaubt. */
export const POSTINGS_CREATE_FOR_TRANSACTION: ToolEntry = entry({
  name: "bb_postings_create_for_transaction",
  title: "Buchungen zu Zahlung anlegen",
  path: { literal: "/postings/add/transaction" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  mandatorySentence: "U1",
  fields: [
    field({
      name: "transaction_id_by_customer",
      required: true,
      schema: idByCustomer("der Zahlung", "bb_transactions_search"),
    }),
    {
      name: "positions",
      apiNames: [
        "postingaccounts",
        "postingtexts",
        "vats",
        "cost_locations",
        "cost_locations_two",
        "amounts",
        "oi_receipts_ids_by_customer",
      ],
      source: "body",
      required: true,
      description: "Die Buchungssätze zu dieser Zahlung.",
      schema: postingPositions("transaction", {
        description: "Die Buchungssätze zu dieser Zahlung.",
        maxItems: TEST_MAX_ITEMS,
      }),
      transform: "parallel-arrays",
      itemFields: POSITION_FIELDS("transaction"),
    },
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    argsFrom: { date_from: "date" },
    hint: "Buchungen der Zahlung prüfen.",
  },
});

/** Werkzeug 17, `/invoices/create`: Positionsliste `items`, kein Weg zurück. */
export const INVOICES_CREATE: ToolEntry = entry({
  name: "bb_invoices_create",
  title: "Rechnung erzeugen",
  path: { literal: "/invoices/create" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  mandatorySentence: "U2",
  fields: [
    field({ name: "invoice_type", apiNames: ["type"], required: true, schema: z.string().min(1) }),
    field({ name: "date", required: true, schema: date("Rechnungsdatum") }),
    {
      name: "items",
      apiNames: [
        "item_name",
        "item_amount",
        "item_unit",
        "item_vat",
        "item_single_price",
        "item_description",
      ],
      source: "body",
      required: true,
      description: "Die Rechnungspositionen.",
      schema: invoiceItems({ description: "Die Rechnungspositionen.", maxItems: TEST_MAX_ITEMS }),
      transform: "parallel-arrays",
      itemFields: [
        field({ name: "item_name", required: true, schema: z.string().min(1) }),
        field({ name: "item_amount", required: true, schema: z.string().min(1) }),
        field({ name: "item_unit", required: true, schema: z.string().min(1) }),
        field({ name: "item_vat", required: true, schema: z.string().min(1) }),
        field({
          name: "item_single_price",
          required: true,
          schema: amountValue("Einzelpreis der Position."),
        }),
        field({ name: "item_description", schema: z.string().min(1) }),
      ],
    },
  ],
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string", invoicenumber: "string", file_name: "string" },
    source: "dokumentiert",
  },
  shape: "ack",
  verifyWith: {
    kind: "none",
    reason: "Die API bietet keinen Leseweg für Rechnungen; in der Weboberfläche nachsehen.",
  },
});

/** Werkzeug 19, `/invoices/create/e-invoice`: sieben Spalten mit Steuerart. */
export const INVOICES_CREATE_EINVOICE: ToolEntry = entry({
  name: "bb_invoices_create_einvoice",
  title: "E-Rechnung erzeugen",
  path: { literal: "/invoices/create/e-invoice" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  mandatorySentence: "U2",
  fields: [
    {
      name: "items",
      apiNames: [
        "item_name",
        "item_amount",
        "item_unit",
        "item_tax_type",
        "item_tax_amount",
        "item_single_price",
        "item_description",
      ],
      source: "body",
      required: true,
      description: "Die Positionen der E-Rechnung.",
      schema: einvoiceItems({
        description: "Die Positionen der E-Rechnung.",
        maxItems: TEST_MAX_ITEMS,
      }),
      transform: "parallel-arrays",
      itemFields: [
        field({ name: "item_name", required: true, schema: z.string().min(1) }),
        field({ name: "item_amount", required: true, schema: z.string().min(1) }),
        field({ name: "item_unit", required: true, schema: z.string().min(1) }),
        field({ name: "item_tax_type", required: true, schema: z.string().min(1) }),
        field({ name: "item_tax_amount", required: true, schema: z.string().min(1) }),
        field({
          name: "item_single_price",
          required: true,
          schema: amountValue("Einzelpreis der Position."),
        }),
        field({ name: "item_description", schema: z.string().min(1) }),
      ],
    },
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: { kind: "none", reason: "Kein Leseweg über die API." },
});

/** Werkzeug 15, `/transactions/assign-batch/receipt`: reine Umbenennung, keine Umformung. */
export const TRANSACTIONS_ASSIGN_RECEIPT_BATCH: ToolEntry = entry({
  name: "bb_transactions_assign_receipt_batch",
  title: "Belege Zahlungen zuordnen",
  path: { literal: "/transactions/assign-batch/receipt" },
  effect: "modify",
  toolClass: "A",
  tier: 3,
  mandatorySentence: "U4",
  fields: [
    {
      name: "assignments",
      apiNames: ["transactions_to_receipts"],
      source: "body",
      required: true,
      description: "Die Zuordnungen aus Beleg und Zahlung.",
      schema: z.array(
        strictObject({
          receipt_id_by_customer: idByCustomer("des Belegs", "bb_receipts_search"),
          transaction_id_by_customer: idByCustomer("der Zahlung", "bb_transactions_search"),
        }),
      ),
      transform: "object-list",
      itemFields: [
        field({
          name: "receipt_id_by_customer",
          required: true,
          schema: idByCustomer("des Belegs", "bb_receipts_search"),
        }),
        field({
          name: "transaction_id_by_customer",
          required: true,
          schema: idByCustomer("der Zahlung", "bb_transactions_search"),
        }),
      ],
    },
  ],
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  verifyWith: {
    kind: "tool",
    tool: "bb_transactions_list_receipts",
    argsFrom: {},
    hint: "Zuordnungen je Zahlung prüfen.",
  },
});

/** Werkzeug 4, `/receipts/add`: Umbenennungen `payment_account_number` und `receipt_type`. */
export const RECEIPTS_CREATE: ToolEntry = entry({
  name: "bb_receipts_create",
  title: "Beleg anlegen",
  path: { literal: "/receipts/add" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  mandatorySentence: "U1",
  fields: [
    field({ name: "counterparty", required: true, schema: z.string().min(1) }),
    field({ name: "invoicenumber", required: true, schema: z.string().min(1) }),
    field({ name: "date", required: true, schema: date("Belegdatum") }),
    field({ name: "amount", required: true, schema: amountValue("Bruttobetrag des Belegs.") }),
    field({ name: "currency", required: true, schema: z.string().min(1) }),
    field({ name: "receipt_type", apiNames: ["type"], required: true, schema: z.string().min(1) }),
    field({
      name: "payment_account_number",
      apiNames: ["account"],
      schema: postingAccountNumber(),
    }),
  ],
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_search",
    argsFrom: { date_from: "date", date_to: "date" },
    hint: "Nach counterparty und amount suchen.",
  },
  duplicateCheck: {
    tool: "bb_receipts_search",
    keyFields: ["date", "amount", "counterparty"],
    perBatch: true,
  },
});

/** Werkzeug 53, `/reports/create/bwa`: der Anschlusshinweis aus 7.6. */
export const REPORTS_CREATE_BWA: ToolEntry = entry({
  name: "bb_reports_create_bwa",
  title: "BWA anfordern",
  path: { literal: "/reports/create/bwa" },
  effect: "create",
  toolClass: "AR",
  tier: 2,
  mandatorySentence: "U5",
  fields: [
    field({ name: "date_from", required: true, schema: date("Beginn") }),
    field({ name: "date_to", required: true, schema: date("Ende") }),
  ],
  responseContract: {
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  bucket: "reports",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_reports_get_bwa",
    argsFrom: { report_id_by_customer: "id_by_customer" },
    hint: "Die Auswertung abholen.",
  },
});

/**
 * Werkzeug 50, `/reports/get/bwa`: Bericht mit Dateien im Objekt `files`.
 *
 * `shape: "ack"` zusammen mit `container: "none"` ist hier kein Schreibfehler, sondern die
 * einzige Kombination, die die Antwort trifft: Die Nutzdaten stehen **auf oberster Ebene**
 * unter `report` und `files` und nicht unter `data` (Spezifikation `ReportsGetBwa_Success`).
 * `shape: "object"` verlangt in `http/envelope.ts` ein `data`-Objekt und scheiterte hier.
 */
export const REPORTS_GET_BWA: ToolEntry = entry({
  name: "bb_reports_get_bwa",
  title: "BWA abholen",
  path: { literal: "/reports/get/bwa" },
  tier: 3,
  fields: [
    field({
      name: "report_id_by_customer",
      required: true,
      schema: idByCustomer("der Auswertung", "bb_reports_create_bwa"),
    }),
    field({ name: "get_files", schema: z.boolean() }),
  ],
  // Der Antwortvertrag bleibt hier leer, und das ist ein **Befund**, keine Bequemlichkeit:
  // `report` und `files` sind Objekte, und `ContractFieldType` (Plan 2.1) kennt keinen Typ
  // dafür. Mit `"string"` erzeugte jeder erfolgreiche Aufruf zwei `_contract_warnings`; mit
  // leerem Vertrag laufen beide Felder als „unbekannt" unverändert durch (Plan 7.3, letzter
  // Fall). AP12e braucht dafür entweder einen Typ `object` im Register oder diese Lösung.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
});

/**
 * Die Felder eines Positionsobjekts, nach Variante (Plan 4.8).
 *
 * Die Funktion steht am Ende der Datei, weil sie nur von den Attrappen oben gebraucht wird;
 * Funktionsdeklarationen sind vorgezogen und damit oben verfügbar.
 */
function POSITION_FIELDS(
  variant: "receipt" | "transaction" | "receipt-batch" | "transaction-batch",
): FieldSpec[] {
  const withOpenItem = variant === "transaction" || variant === "transaction-batch";
  // Die abweichende Schreibweise `postingstexts` innerhalb von `ReceiptPostings` ist der
  // benannte Spezifikationsfehler aus Plan 0.5 und hier bewusst nicht geglättet.
  const textApiName = variant === "receipt-batch" ? "postingstexts" : "postingtexts";
  const fields: FieldSpec[] = [
    field({
      name: "postingaccount",
      apiNames: ["postingaccounts"],
      required: true,
      schema: postingAccountNumber(),
    }),
    field({
      name: "postingtext",
      apiNames: [textApiName],
      required: true,
      schema: z.string().min(1).max(128),
    }),
    field({ name: "vat", apiNames: ["vats"], required: true, schema: vatKey() }),
    field({
      name: "cost_location",
      apiNames: ["cost_locations"],
      schema: costLocation().optional(),
    }),
    field({
      name: "cost_location_two",
      apiNames: ["cost_locations_two"],
      schema: costLocation().optional(),
    }),
    // Markiert als Betrag: Nur darüber findet der Request-Mapper die Umwandlung in die
    // JSON-Zahl, und Guard 5 die Betragsgrenze (Plan 4.5).
    field({
      name: "amount",
      apiNames: ["amounts"],
      required: true,
      schema: amountValue("Betrag dieser Buchungszeile."),
    }),
  ];
  if (withOpenItem) {
    fields.push(
      field({
        name: "open_item_receipt_id_by_customer",
        apiNames: ["oi_receipts_ids_by_customer"],
        required: true,
        // `null` ist hier ein Wert und keine Lücke: „dieser Position keinen Beleg zuordnen".
        schema: idByCustomer("des Belegs", "bb_receipts_search").nullable(),
      }),
    );
  }
  return fields;
}
