// Werkzeug 9, `/transactions/get`: Zahlungen filtern und seitenweise auflisten (Plan 3.8, AP12b).
//
// Zwei gemessene Eigenheiten tragen diesen Eintrag:
//
//   1. Die Liste liefert genau SECHS Felder und darunter KEIN `account` (Plan 0.3 Befund L2).
//      Wer das Zahlungskonto einer Zahlung braucht, holt sie einzeln mit bb_transactions_get.
//   2. `id_by_customer` kommt hier als JSON-Zahl, bei den Belegen als String (Befund L3). Der
//      Antwortvertrag führt das Feld deshalb als `id-string`: ausgehend immer String (S10).
//
// Eine Querprüfung zum Zusammenspiel von `id_by_customer_from`/`_to` und der Sortierung gibt es
// ausdrücklich NICHT: `/transactions/get` führt überhaupt keinen `order`-Parameter, und die
// Spezifikation erlaubt die Kombination mit den Datumsfeldern wörtlich. Ersatz ist der
// Pflichtsatz aus Plan 4.7 an beiden Feldern, den P8 prüft.
//
// Die Umbenennung `account` → `payment_account_number` ist die Zeile aus Anhang A: Der
// Parameter erwartet eine Sachkontonummer, meint aber ein Zahlungskonto (Plan 3.4).

import { paginationFor } from "../../schema/pagination.js";
import { boundedText, identifierValue } from "../../schema/primitives.js";
import {
  ID_STRING_SENTENCE,
  date,
  dateTime,
  paymentAccountNumber,
  responseFormat,
} from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

/**
 * Der Pflichtsatz aus Plan 4.7, wörtlich. Er steht an `id_by_customer_from` UND an
 * `id_by_customer_to` und ersetzt die gestrichene Sortierprüfung; P8 prüft ihn an beiden.
 */
const SORT_SIDE_EFFECT_SENTENCE =
  "Setzt die Sortierung auf id_by_customer ASC, auch in Kombination mit date_from und date_to.";

// `limit` und `offset` kommen aus der Tabelle in pagination.ts und nicht aus diesem Eintrag:
// Schema, Querprüfung Q2 und Bestandszeile der Antwort brauchen dieselbe Zahl (Plan 7.5).
const { limit, offset } = paginationFor("/transactions/get");

const RESPONSE_FORMAT = responseFormat();
const DATE_FROM = date("Frühestes Buchungsdatum der gesuchten Zahlungen");
const DATE_TO = date("Spätestes Buchungsdatum der gesuchten Zahlungen");
const SINCE_LAST_MODIFIED = dateTime("Untere Grenze für date_updated der Zahlung");

const ID_FROM_DESCRIPTION =
  "Untere Grenze der mandantenbezogenen Nummer id_by_customer. Geliefert werden Zahlungen mit " +
  `größerer Nummer; die Zahlung mit genau diesem Wert nicht. ${SORT_SIDE_EFFECT_SENTENCE} ` +
  ID_STRING_SENTENCE;

const ID_TO_DESCRIPTION =
  "Obere Grenze der mandantenbezogenen Nummer id_by_customer. Geliefert werden Zahlungen mit " +
  `kleinerer Nummer; die Zahlung mit genau diesem Wert nicht. ${SORT_SIDE_EFFECT_SENTENCE} ` +
  ID_STRING_SENTENCE;

const PAYMENT_ACCOUNT_DESCRIPTION =
  "Nur Zahlungen dieses Zahlungskontos. Sachkontonummer, die ein Zahlungskonto bezeichnet, " +
  "zum Beispiel '1200'. Nicht das Sachkonto, auf das gebucht wird. Zahlungskonten auflisten " +
  "mit bb_payment_accounts_list. Der Body-Parameter der API heißt account.";

const TO_FROM_DESCRIPTION =
  "Nur Zahlungen dieses Zahlenden oder Empfängers, zum Beispiel 'Muster GmbH'. Ob die API " +
  "dabei auf Teilwörter vergleicht, sagt die Spezifikation nicht.";

export const bb_transactions_search: ToolEntry = {
  name: "bb_transactions_search",
  title: "Zahlungen suchen",
  group: "transactions",
  path: { literal: "/transactions/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Sucht Zahlungen, also Kontoumsätze, in BuchhaltungsButler und liefert sie seitenweise. " +
    "Zu nehmen, um den Umsatz zu einem Beleg zu finden, zum Beispiel alle Zahlungen eines " +
    "Zahlungskontos zwischen date_from 2026-01-01 und date_to 2026-01-31. Eine einzelne, " +
    "schon bekannte Zahlung holt bb_transactions_get kürzer; die zugeordneten Belege liefert " +
    "bb_transactions_list_receipts. Diese Liste führt sechs Felder und darunter kein account: " +
    "Auf welchem Zahlungskonto eine Zahlung liegt, zeigt erst bb_transactions_get. Höchstens " +
    "500 Zeilen je Aufruf, danach mit offset weiterblättern; eine Gesamttrefferzahl nennt die " +
    "API zu keinem Zeitpunkt. date_from und date_to schließen den genannten Tag ein, " +
    "id_by_customer_from und id_by_customer_to den genannten Wert dagegen nicht.",
  fields: [
    {
      name: "id_by_customer_from",
      apiNames: ["id_by_customer_from"],
      source: "body",
      required: false,
      description: ID_FROM_DESCRIPTION,
      schema: identifierValue(ID_FROM_DESCRIPTION),
    },
    {
      name: "id_by_customer_to",
      apiNames: ["id_by_customer_to"],
      source: "body",
      required: false,
      description: ID_TO_DESCRIPTION,
      schema: identifierValue(ID_TO_DESCRIPTION),
    },
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: false,
      description: DATE_FROM.description ?? "",
      schema: DATE_FROM,
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: false,
      description: DATE_TO.description ?? "",
      schema: DATE_TO,
    },
    {
      name: "date_since_last_modified",
      apiNames: ["date_since_last_modified"],
      source: "body",
      required: false,
      description: `${SINCE_LAST_MODIFIED.description ?? ""} Geliefert werden nur Zahlungen, die danach geändert wurden.`,
      schema: SINCE_LAST_MODIFIED,
    },
    {
      name: "payment_account_number",
      apiNames: ["account"],
      source: "body",
      required: false,
      description: PAYMENT_ACCOUNT_DESCRIPTION,
      schema: paymentAccountNumber(),
    },
    {
      name: "to_from",
      apiNames: ["to_from"],
      source: "body",
      required: false,
      description: TO_FROM_DESCRIPTION,
      schema: boundedText(TO_FROM_DESCRIPTION),
    },
    // required: false, obwohl der Server das limit immer mitsendet: Die Vorgabe steckt im
    // Schema, und Zod setzt sie auch unter .optional() ein (Plan 7.5 Regel 1). Ein
    // required: true wäre eine Verschärfung gegenüber der Spezifikation (Plan 4.3).
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      description: limit.description ?? "",
      schema: limit,
    },
    {
      name: "offset",
      apiNames: ["offset"],
      source: "body",
      required: false,
      description: offset.description ?? "",
      schema: offset,
    },
    {
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: RESPONSE_FORMAT.description ?? "",
      schema: RESPONSE_FORMAT,
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Gemessen am 2026-09-12: genau sechs Felder, `id_by_customer` als JSON-Zahl, kein `account`
  // (Plan 0.3 Befund L2 und L3). Der Vertrag gilt je Endpunkt und nie je Fachobjekt (7.2).
  responseContract: {
    container: "data",
    fields: {
      id_by_customer: "id-string",
      to_from: "string",
      amount: "amount-string",
      booking_date: "string",
      value_date: "string",
      purpose: "null-or-string",
    },
    source: "gemessen",
    measuredOn: "2026-09-12",
  },
  shape: "list",
  // Alle sechs gelieferten Felder: Eine Projektion wäre hier sinnlos, steht aber in Plan 7.4
  // ausgeschrieben und bleibt deshalb stehen.
  concise: ["id_by_customer", "to_from", "amount", "booking_date", "value_date", "purpose"],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q1", "Q2", "Q3"],
  invalidatesCache: [],
};
