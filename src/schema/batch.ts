// Die Objektarrays der acht Stapelendpunkte (Plan 2 Dateibaum, 4.4 Punkt 3, 4.8).
//
// Acht Body-Parameter verweisen statt auf einen Typ auf eine Definition, und jede dieser
// Definitionen ist ein Array von Objekten. Dieses Modul trägt die Tabelle dazu und baut den
// Behälter; die Felder **eines Elements** stehen im Registereintrag, weil sie dort ihre
// deutschen Beschreibungen tragen und je Ressource verschieden sind (AP12a bis AP12e).
//
// Behälter und Element unterscheiden sich in der Spezifikation oft nur durch ein `s`
// (`Receipts` gegen `Receipt`, `ReceiptsPostings` gegen `ReceiptPostings`). Wer die falsche
// Definition liest, hält ein Array für ein Objekt; deshalb steht hier beides getrennt in der
// Tabelle und nicht ein Pfeil je Zeile (Plan 4.4).
//
// `maxItems` ist derselbe Wert wie bei den Positionslisten, nämlich `min(50,
// BB_MCP_MAX_BATCH)`. Er kommt aus `line-items.ts#batchLimit`, damit es ihn genau einmal
// gibt (Plan 4.7 Q4).

import { z } from "zod";

import { markSchemaKind, strictObject } from "./primitives.js";
import { batchLimit } from "./line-items.js";
import { idByCustomer } from "./vocab.js";

/** Ein Stapelendpunkt, vollständig beschrieben. */
export interface BatchContainerSpec {
  /** Werkzeugname aus Plan 3.8. */
  readonly tool: string;
  /** Feldname im Werkzeugschema. */
  readonly field: string;
  /** Name des Body-Parameters. Er wird nur an einem der acht Endpunkte umbenannt. */
  readonly apiName: string;
  /** Der unveränderte Spezifikationspfad. */
  readonly specPath: string;
  /** Name der Behälterdefinition, also des Arrays. */
  readonly containerDefinition: string;
  /**
   * Name der Elementdefinition, oder `null`, wenn die Eigenschaften inline unter `.items`
   * liegen. Genau ein Fall ist inline: `PostingsFree`.
   */
  readonly itemDefinition: string | null;
  /** Zahl der Eigenschaften der Elementdefinition, maschinell gezählt am 2026-09-12. */
  readonly itemProperties: number;
  /**
   * `true`, wenn die Spezifikation die Obergrenze 50 für diesen Endpunkt ausdrücklich
   * nennt. Bei `false` ist sie **nicht verifiziert** und defensiv übernommen (Plan 14.2).
   */
  readonly maxDocumented: boolean;
}

/**
 * Die Tabelle der acht Stapelendpunkte.
 *
 * Sieben der acht Behälter heißen im Werkzeugschema wie in der Spezifikation; sie sind
 * bereits Objektlisten, und ein zweiter Name für dasselbe wäre eine Umbenennung ohne
 * Gewinn. Der einzige umbenannte Behälter ist `transactions_to_receipts` zu `assignments`
 * (Anhang A).
 *
 * `as const satisfies` statt einer Typannotation: Nur so trägt {@link BatchContainerId} die
 * acht Werkzeugnamen und nicht `string`.
 */
const CONTAINERS = {
  bb_receipts_create_batch: {
    tool: "bb_receipts_create_batch",
    field: "receipts",
    apiName: "receipts",
    specPath: "/receipts/addBatch",
    containerDefinition: "Receipts",
    itemDefinition: "Receipt",
    itemProperties: 13,
    maxDocumented: true,
  },
  bb_transactions_create_batch: {
    tool: "bb_transactions_create_batch",
    field: "transactions",
    apiName: "transactions",
    specPath: "/transactions/addBatch",
    containerDefinition: "Transactions",
    itemDefinition: "Transaction",
    itemProperties: 13,
    maxDocumented: true,
  },
  bb_transactions_assign_receipt_batch: {
    tool: "bb_transactions_assign_receipt_batch",
    field: "assignments",
    apiName: "transactions_to_receipts",
    specPath: "/transactions/assign-batch/receipt",
    containerDefinition: "TransactionsToReceipts",
    itemDefinition: "TransactionToReceipt",
    itemProperties: 2,
    maxDocumented: true,
  },
  bb_postings_create_for_receipt_batch: {
    tool: "bb_postings_create_for_receipt_batch",
    field: "receipts",
    apiName: "receipts",
    specPath: "/postings/add-batch/receipts",
    containerDefinition: "ReceiptsPostings",
    itemDefinition: "ReceiptPostings",
    itemProperties: 9,
    maxDocumented: false,
  },
  bb_postings_create_for_transaction_batch: {
    tool: "bb_postings_create_for_transaction_batch",
    field: "transactions",
    apiName: "transactions",
    specPath: "/postings/add-batch/transactions",
    containerDefinition: "TransactionsPostings",
    itemDefinition: "TransactionPostings",
    itemProperties: 8,
    maxDocumented: false,
  },
  bb_postings_create_free_batch: {
    tool: "bb_postings_create_free_batch",
    field: "free_postings",
    apiName: "free_postings",
    specPath: "/postings/add-batch/free",
    containerDefinition: "PostingsFree",
    itemDefinition: null,
    itemProperties: 8,
    maxDocumented: false,
  },
  bb_debtors_create_batch: {
    tool: "bb_debtors_create_batch",
    field: "debtors",
    apiName: "debtors",
    specPath: "/settings/add-batch/debtors",
    containerDefinition: "SettingsDebtors",
    itemDefinition: "SettingsDebtor",
    itemProperties: 12,
    maxDocumented: false,
  },
  bb_creditors_create_batch: {
    tool: "bb_creditors_create_batch",
    field: "creditors",
    apiName: "creditors",
    specPath: "/settings/add-batch/creditors",
    containerDefinition: "SettingsCreditors",
    itemDefinition: "SettingsCreditor",
    itemProperties: 12,
    maxDocumented: false,
  },
} as const satisfies Record<string, BatchContainerSpec>;

/** Die acht Stapelendpunkte, geschlüsselt nach Werkzeugnamen. */
export const BATCH_CONTAINERS = Object.freeze(CONTAINERS);

/** Die acht Werkzeugnamen mit Stapelbehälter. */
export type BatchContainerId = keyof typeof CONTAINERS;

/**
 * Der Eintrag zu einem Werkzeug.
 *
 * @throws Error bei einem Werkzeug ohne Stapelbehälter. Das ist ein Verdrahtungsfehler und
 *   kein Laufzeitfall; er fällt beim Bau des Schemas auf, nicht beim ersten Aufruf.
 */
export function batchContainerSpec(tool: string): BatchContainerSpec {
  const specs: Record<string, BatchContainerSpec | undefined> = CONTAINERS;
  const spec = specs[tool];
  if (spec === undefined) {
    throw new Error(
      `${tool} führt keinen Stapelbehälter. Stapelendpunkte sind: ${Object.keys(CONTAINERS).join(", ")}.`,
    );
  }
  return spec;
}

export interface BatchArrayOptions {
  /** Die feldeigene Beschreibung. Der Mengensatz wird angehängt. */
  readonly description: string;
  /** Nur für Tests und Aufrufer, die die Mengengrenze schon kennen. */
  readonly maxItems?: number;
}

/**
 * Der Satz zur Mengengrenze, der an jeder Stapelbeschreibung steht.
 *
 * Er nennt die Zahl, weil der Aufrufer sie sonst aus dem Schema ablesen müsste, und er
 * nennt sie nur einmal je Werkzeug.
 */
export function batchSizeSentence(max: number): string {
  return (
    `Höchstens ${String(max)} Einträge je Aufruf. ` +
    "Ein abgelehnter Stapel wird nicht teilweise verarbeitet."
  );
}

/**
 * Baut den Behälter: ein Array aus dem übergebenen Element, mit `minItems: 1` und
 * `maxItems: min(50, BB_MCP_MAX_BATCH)`.
 *
 * Das Element kommt vom Aufrufer, weil seine Felder im Registereintrag stehen. Geprüft wird
 * hier trotzdem, dass es ein Objektschema ist: Ein Array aus Skalaren wäre an einem dieser
 * acht Endpunkte immer ein Fehler, und die Meldung käme sonst erst als HTTP 400.
 */
export function batchArray<T extends z.ZodType>(item: T, options: BatchArrayOptions) {
  if (!(item instanceof z.ZodObject)) {
    throw new Error(
      "Ein Stapelbehälter nimmt ein Objektschema als Element. Die acht Stapelendpunkte " +
        "erwarten ausnahmslos Objektlisten (Plan 4.4 Punkt 3).",
    );
  }
  const max = batchLimit(options.maxItems);
  return markSchemaKind(
    z
      .array(item)
      .min(1, { error: "mindestens ein Eintrag" })
      .max(max, { error: `höchstens ${String(max)} Einträge je Aufruf` }),
    "batch",
  ).describe(`${options.description} ${batchSizeSentence(max)}`);
}

/**
 * Wie {@link batchArray}, aber mit der Tabelle oben verdrahtet: Der Aufrufer nennt das
 * Werkzeug und liefert das Element, und der Behälter trägt danach garantiert dieselbe
 * Mengengrenze wie die übrigen sieben.
 *
 * @throws Error bei einem Werkzeug, das keinen Stapelbehälter führt. Das ist ein
 *   Verdrahtungsfehler und kein Laufzeitfall.
 */
export function batchContainer<T extends z.ZodType>(
  tool: BatchContainerId,
  item: T,
  options: BatchArrayOptions,
) {
  batchContainerSpec(tool);
  return batchArray(item, options);
}

/**
 * Das Element von `/transactions/assign-batch/receipt` (Werkzeug 15), Definition
 * `TransactionToReceipt`.
 *
 * Dieses eine Element steht vollständig hier und nicht im Registereintrag, weil Plan 4.8 es
 * vollständig festlegt: genau zwei Felder, beide Pflicht, keine Umformung, reine
 * Umbenennung des Behälters. Die übrigen sieben Elemente haben zwischen acht und dreizehn
 * Feldern mit ressourceneigenen Beschreibungen und gehören deshalb in die Registerpakete.
 */
export function assignmentItem() {
  return strictObject({
    receipt_id_by_customer: idByCustomer("des Belegs", "bb_receipts_search"),
    transaction_id_by_customer: idByCustomer("der Zahlung", "bb_transactions_search"),
  });
}

/**
 * Der vollständige Behälter `assignments` von Werkzeug 15.
 *
 * @param maxItems Nur für Tests und Aufrufer, die die Mengengrenze schon kennen.
 */
export function assignments(maxItems?: number) {
  return batchContainer(
    "bb_transactions_assign_receipt_batch",
    assignmentItem(),
    maxItems === undefined
      ? { description: ASSIGNMENTS_DESCRIPTION }
      : { description: ASSIGNMENTS_DESCRIPTION, maxItems },
  );
}

/** Die Beschreibung des Behälters `assignments`. */
const ASSIGNMENTS_DESCRIPTION =
  "Die Paare aus Beleg und Zahlung, die einander zugeordnet werden sollen. Der " +
  "Body-Parameter der API heißt transactions_to_receipts.";
