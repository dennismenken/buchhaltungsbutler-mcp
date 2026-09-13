// Werkzeug 10, `/transactions/get/id_by_customer`: eine einzelne Zahlung holen.
//
// Dieser Eintrag ist einer der vier mit Pfadvorlage. Das Segment `id_by_customer` im
// Pfad der Spezifikation ist ein PLATZHALTER für den Wert und kein literales Segment; live
// bestätigt am 2026-09-12 mit HTTP 200 (Befund L1 in docs/api/live-befunde.md). Der
// dokumentierte Aufruf mit dem literalen Pfad scheitert dort nachweislich mit
// einer HTML-Fehlerseite, weil dieser Pfad gar nicht existiert.
//
// Daraus folgt dreierlei für diesen Eintrag:
//
//   1. `path` trägt `template`, `params` und `specPath`. Gesendet wird der gebaute Pfad,
//      nachgeschlagen wird immer mit `specPath` (Fehlerkatalog, Deckungstest, Audit-Zeile).
//   2. Das Identifikatorfeld trägt `source: "path"` und ein LEERES `apiNames`; die
//      Spezifikation führt an diesem Pfad nur `api_key`. Ein Body-Feld `id_by_customer` gibt
//      es nicht, und der Request-Mapper darf den Wert niemals in den Body schreiben.
//   3. Die Aufrufform ist gemessen, nicht abgeleitet. Der Eintrag trägt deshalb KEIN
//      `verified: false` und die Beschreibung keinen Einschränkungssatz.
//
// Der Einzelabruf liefert 13 Felder, die Liste nur sechs. Beide Feldzahlen stehen mitsamt den
// Feldnamen in docs/api/grundlagen.md, Abschnitt 4.5 („Antwortfelder der Belege und
// Zahlungen"), gemessen am 2026-09-12. Befund L2 in docs/api/live-befunde.md belegt, DASS
// Einzelabruf und Liste getrennte Antwortverträge haben; die beiden Feldzahlen selbst führt L2
// nicht. `account` kommt hier als JSON-Zahl (Befund L3 ebenda) und geht als String hinaus, wie
// jede Kennung dieses Servers (Umwandlungsregel 2 im Kopf von src/mapping/coerce.ts).

import { idByCustomer, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const RESPONSE_FORMAT = responseFormat();
const TRANSACTION_ID = idByCustomer("der Zahlung", "bb_transactions_search");

export const bb_transactions_get: ToolEntry = {
  name: "bb_transactions_get",
  title: "Zahlung holen",
  group: "transactions",
  path: {
    template: "/transactions/get/{transaction_id_by_customer}",
    params: ["transaction_id_by_customer"],
    specPath: "/transactions/get/id_by_customer",
  },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Holt genau eine Zahlung aus BuchhaltungsButler über ihre mandantenbezogene Nummer. Zu " +
    "nehmen, sobald die id_by_customer einer Zahlung vorliegt, etwa aus einem Ergebnis von " +
    "bb_transactions_search. Dieser Einzelabruf liefert 13 Felder, darunter account, currency " +
    "und die Bankdaten der Gegenseite; die Liste aus bb_transactions_search führt nur sechs " +
    "davon. Er sucht nicht und blättert nicht: genau eine Zahlung je Aufruf.",
  fields: [
    {
      name: "transaction_id_by_customer",
      // Leeres apiNames und source "path": Der Wert wird in den Pfad eingesetzt und nie in den
      // Body geschrieben. Der Deckungstest P3 nimmt das Feld deshalb aus.
      apiNames: [],
      source: "path",
      required: true,
      description: TRANSACTION_ID.description ?? "",
      schema: TRANSACTION_ID,
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
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  // Gemessen am 2026-09-12, am 2026-09-13 lesend erneut bestätigt: 13 Felder, `data` als Objekt
  // ohne `rows`, `account` als JSON-Zahl.
  // Der Vertrag gehört zu DIESEM Endpunkt und nicht zu dem
  // der Liste; wer den Vertrag der Liste kopiert, verliert hier sieben Felder.
  responseContract: {
    container: "data",
    fields: {
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
    },
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
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
