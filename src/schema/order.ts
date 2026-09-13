// Die drei `order`-Formen als drei getrennte Schemata, ohne gemeinsame Abstraktion.
//
// Drei Endpunkte führen `order`, und alle drei mit einer anderen Syntax: ein Objekt aus
// Feld und Richtung, eine Zeichenkette aus Feld und Richtung, und dieselbe Zeichenkette mit
// einem anderen Wertevorrat und zusätzlich dem Wert 'default'. Eine Vereinheitlichung wäre
// genau die verborgene Logik, die dieser Server ausschließt: Der Aufrufer schickte eine Form,
// der Server baute eine andere. Deshalb steht hier dreimal dasselbe Muster ausgeschrieben und
// keine Fabrik.
//
// `/transactions/get` führt ausdrücklich **keinen** `order`-Parameter. Die Sortierung
// wechselt dort auf `id_by_customer ASC`, sobald `id_by_customer_from` oder `_to` gesetzt
// ist; das ist eine Nebenwirkung und kein Parameter (gestrichene Prüfung).

import { z } from "zod";

import { strictObject } from "./primitives.js";

/** Die beiden Richtungen. Sie stehen an allen drei Formen im Original. */
export const ORDER_DIRECTIONS = ["ASC", "DESC"] as const;

// --- /receipts/get -------------------------------------------------------------------

/**
 * Die vier sortierbaren Felder von `/receipts/get`, aus dem Beschreibungstext des
 * Parameters entnommen (maschinell am 2026-09-12).
 *
 * Die Spezifikation nennt zu zweien den Antwortfeldnamen in Klammern: `invoicenumber`
 * (Antwort `invoice_number`) und `invoicingparty` (Antwort `counterparty`). Gesendet wird
 * der Name aus dieser Liste; die Klammernamen stehen in der Parameterbeschreibung des
 * Registereintrags, damit niemand den Antwortnamen sendet.
 */
export const RECEIPTS_ORDER_FIELDS = ["date", "amount", "invoicenumber", "invoicingparty"] as const;

/**
 * `order` an `/receipts/get`: ein Objekt aus Sortierfeld und Richtung, mehrere Kriterien
 * erlaubt, Reihenfolge der Schlüssel entscheidet.
 *
 * Das Schema der Spezifikation ist ein Platzhalter: Es führt eine einzige Eigenschaft
 * namens `field` mit dem Enum `['ASC','DESC']` und `required: ['field']`. Ein Generator
 * erzeugte daraus ein Objekt `{ "field": "ASC" }`, das die API ablehnt. Der Platzhalter
 * wird deshalb verworfen und durch die vier Felder aus dem Beschreibungstext ersetzt.
 *
 * Ein **leeres** Objekt ist syntaktisch gültig, fachlich aber sinnlos; Q7 fängt es ab.
 */
export function receiptsOrder() {
  return strictObject({
    date: z.enum(ORDER_DIRECTIONS).optional(),
    amount: z.enum(ORDER_DIRECTIONS).optional(),
    invoicenumber: z.enum(ORDER_DIRECTIONS).optional(),
    invoicingparty: z.enum(ORDER_DIRECTIONS).optional(),
  }).describe(
    'Sortierung als Objekt aus Sortierfeld und Richtung, zum Beispiel {"date": "ASC"} ' +
      'oder {"date": "ASC", "amount": "DESC"}. Sortierbar sind date, amount, ' +
      "invoicenumber (heißt in der Antwort invoice_number) und invoicingparty (heißt in der " +
      "Antwort counterparty). Mindestens ein Feld angeben oder das Feld weglassen.",
  );
}

// --- /postings/get -------------------------------------------------------------------

/**
 * Die **sieben** erlaubten Werte von `order` an `/postings/get`, exakt in der Schreibweise
 * der Spezifikation.
 *
 * Die Validierung der API ist ausdrücklich case sensitive („Please not that the validation
 * of the specified value is case sensitive!“ — Tippfehler im Original). Das Enum fängt den
 * Fall vor dem Request ab. **Ein kürzeres Enum lehnte gültige Sortierungen unsichtbar ab**
 * (R4), deshalb stehen hier alle sieben und nicht nur die gebräuchlichen.
 */
export const POSTINGS_ORDER_VALUES = [
  "default",
  "date ASC",
  "date DESC",
  "date_last_action ASC",
  "date_last_action DESC",
  "id_by_customer ASC",
  "id_by_customer DESC",
] as const;

/** `order` an `/postings/get`: eine Zeichenkette aus den sieben Werten. */
export function postingsOrder() {
  return z
    .enum(POSTINGS_ORDER_VALUES)
    .describe(
      "Sortierung als Zeichenkette. 'default' sortiert aufsteigend nach date und, als " +
        "zweites Kriterium, nach date_last_action. Die Schreibweise ist case sensitive; die " +
        "Werte stehen genau so im Enum, wie die API sie erwartet.",
    );
}

// --- /settings/get/postingaccounts ---------------------------------------------------

/**
 * Die sechs erlaubten Werte von `order` an `/settings/get/postingaccounts`.
 *
 * Die Spezifikation schreibt sie als `postingaccount_number ASC | DESC`, `name ASC | DESC`
 * und `type ASC | DESC`; ausgeschrieben sind das die sechs Kombinationen hier.
 */
export const POSTING_ACCOUNTS_ORDER_VALUES = [
  "postingaccount_number ASC",
  "postingaccount_number DESC",
  "name ASC",
  "name DESC",
  "type ASC",
  "type DESC",
] as const;

/** `order` an `/settings/get/postingaccounts`: eine Zeichenkette aus den sechs Werten. */
export function postingAccountsOrder() {
  return z
    .enum(POSTING_ACCOUNTS_ORDER_VALUES)
    .describe(
      "Sortierung als Zeichenkette, zum Beispiel 'postingaccount_number ASC'. Sortierbar " +
        "sind postingaccount_number, name und type, jeweils ASC oder DESC.",
    );
}

// --- Zuordnung für die Querprüfung Q7 ------------------------------------------------

/** Welche Form `order` an welchem Endpunkt hat. Grundlage von Q7. */
export type OrderForm = "receipts-object" | "postings-string" | "postingaccounts-string";

/**
 * Die drei Endpunkte mit `order`, nach Spezifikationspfad.
 *
 * Q7 prüft damit, dass ein Wert zur Form **dieses** Endpunkts gehört. Das ist keine
 * Doppelung des Enums: Es fängt den Fall ab, dass ein Registereintrag versehentlich den
 * Baustein des falschen Endpunkts verdrahtet — `'name ASC'` ist an
 * `/settings/get/postingaccounts` gültig und an `/postings/get` nicht.
 */
export const ORDER_FORM_BY_PATH: Readonly<Record<string, OrderForm>> = Object.freeze({
  "/receipts/get": "receipts-object",
  "/postings/get": "postings-string",
  "/settings/get/postingaccounts": "postingaccounts-string",
});
