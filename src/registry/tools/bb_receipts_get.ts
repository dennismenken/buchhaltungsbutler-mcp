// Werkzeug 2 von 54 (Plan 3.8): `/receipts/get/id_by_customer`, der Belegeinzelabruf.
//
// **Pfadvorlage statt literalem Pfad (Plan 4.6).** Das Segment `id_by_customer` im Pfad der
// Spezifikation ist ein Platzhalter für den Wert und kein literales Segment. Gemessen am
// 2026-09-12 (Befund L1): `POST /receipts/get/<wert>` antwortet mit HTTP 200, der
// dokumentierte Aufruf mit dem Body-Feld `id_by_customer` dagegen mit HTTP 400 und
// error_code 5. Der Eintrag trägt deshalb `template`, `params` und zusätzlich `specPath` mit
// dem unveränderten Schlüssel der Spezifikation: Fehlerkatalog, Deckungstest und Audit-Zeile
// schlagen über `specPath` nach, gesendet wird der gebaute Pfad. Das Identifikatorfeld trägt
// `source: "path"` und ein leeres `apiNames`, und **ein Body-Feld `id_by_customer` gibt es
// nicht** — die Spezifikation führt an diesem Pfad ohnehin nur zwei Parameter.
//
// Die Aufrufform ist live bestätigt; dieser Eintrag trägt deshalb **kein** `verified: false`
// und seine Beschreibung keinen Einschränkungssatz (Plan 4.6, Streitfrage S1).
//
// **Der Antwortvertrag ist ein anderer als der des Listenabrufs** und gemessen (Befund L2):
// 23 statt 16 Felder, `data` als Objekt ohne `rows`, `date_delivery` und `date_payment_due`
// statt `delivery_date` und `due_date`. `amount_original`, `currency_original` und
// `exchangerate` kennt die Spezifikation überhaupt nicht; dieser Endpunkt ist die einzige
// Quelle für Fremdwährungsbeträge (Befunde L2 und L4, Plan 7.2).
//
// **`amount_paid` und `amount_paid_fixed` sind auch hier funktionslos**, gemessen wie beim
// Listenabruf: Am 2026-09-13 lieferte `/receipts/get/2` einen Beleg über `"884.65"` mit
// `payment_date` `"2021-03-05"` — und `amount_paid` wie `amount_paid_fixed` mit `"0.00"`. Die
// Begründung steht vollständig im Kopf von bb_receipts_search.ts, Punkt 2; hier gilt sie
// unverändert, weil dieser Endpunkt dieselben beiden Felder liefert. Der Warnsatz in der
// Beschreibung ist der kürzeren Stufe 2 entsprechend knapper gefasst.

// `file_content` und `file_type` stehen bewusst **nicht** im Vertrag. Sie kommen nur bei
// get_file, und der Zweig ist nicht verifiziert (Plan 0.3, „Was ausdrücklich nicht folgt").
// Als Vertragsfelder erzeugten sie bei jedem gewöhnlichen Abruf zwei `_contract_warnings`;
// als unbekannte Felder laufen sie unverändert durch (Plan 7.3, letzter Fall).

import { z } from "zod";

import { idByCustomer, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

/** Das serverseitige Feld der Projektion. Sein Text ist der des Bausteins (Plan 4.5). */
const RESPONSE_FORMAT_TEXT =
  "'concise' liefert nur die Felder, die einen Datensatz erkennbar machen und den nächsten " +
  "Schritt erlauben. 'detailed' liefert den Datensatz so, wie die BuchhaltungsButler-API ihn " +
  "ausgibt. Mit 'concise' beginnen und nur für die wenigen Datensätze auf 'detailed' wechseln, " +
  "die wirklich geprüft werden müssen. Dieses Feld ist serverseitig und geht nicht an die API.";

export const bb_receipts_get: ToolEntry = {
  name: "bb_receipts_get",
  title: "Beleg holen",
  group: "receipts",
  path: {
    template: "/receipts/get/{receipt_id_by_customer}",
    params: ["receipt_id_by_customer"],
    specPath: "/receipts/get/id_by_customer",
  },
  effect: "read",
  toolClass: "R",
  tier: 2,
  description:
    "Holt genau einen Beleg aus BuchhaltungsButler über seine mandantenbezogene Belegnummer " +
    "und liefert mehr Felder als die Suche: Buchungs- und Originalwährung, Umrechnungskurs, " +
    "Steuersatz, Zahlungsreferenz und auf Wunsch die Belegdatei. Beispiel: den Beleg prüfen, " +
    "den bb_receipts_search mit id_by_customer 4711 geliefert hat. Zum Suchen nach Zeitraum " +
    "oder Gegenpartei bb_receipts_search, für die zugeordneten Zahlungen " +
    "bb_receipts_list_transactions. Liefert keine Buchungssätze und keine Liste: Ein Aufruf " +
    "holt einen Beleg, und die Feldnamen weichen von denen der Suche ab. amount_paid und " +
    "amount_paid_fixed sind auch hier gemessen stets '0.00'; den Zahlungsstand trägt allein " +
    "payment_date.",
  fields: [
    {
      name: "receipt_id_by_customer",
      // Leeres apiNames und source "path": Der Wert wird in den Pfad eingesetzt und nie in den
      // Body geschrieben (Plan 4.6 Regel 5). Die Spezifikation führt ihn an diesem Pfad nicht.
      apiNames: [],
      source: "path",
      required: true,
      description:
        "Die mandantenbezogene Nummer des Belegs, zu finden über bb_receipts_search. Keine " +
        "globale Kennung. In Suchergebnissen erscheint sie als String; hier ohne " +
        "Anführungszeichen übergeben.",
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    },
    {
      name: "get_file",
      apiNames: ["get_file"],
      source: "body",
      required: false,
      description:
        "Wenn true, legt die API die Belegdatei als base64-Zeichenkette in die Antwort, dazu " +
        "den Dateityp. Der Inhalt erscheint nie im Textteil der Antwort, sondern nur im " +
        "strukturierten Teil. Große Dateien kosten viel Kontext, deshalb nur setzen, wenn die " +
        "Datei wirklich gebraucht wird. Dass dieser Zweig funktioniert, ist nicht verifiziert.",
      schema: z.boolean(),
    },
    {
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: RESPONSE_FORMAT_TEXT,
      schema: responseFormat(),
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  responseContract: {
    container: "data",
    // Die 23 gemessenen Felder des Einzelabrufs (Plan 0.3 Befunde L2 und L3). `e_invoice_type`
    // kam als JSON-Zahl, obwohl die Spezifikation einen String führt; `vat` ist der
    // Steuersatz in Prozent und heißt im Request `vat_rate`.
    fields: {
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
      // Gemessen durchgehend `"0.00"`, auch bei gesetztem `payment_date`; `amount_paid_fixed`
      // ist zusätzlich in seiner Bedeutung nicht ermittelt. Beide stehen hier, damit sie nicht
      // als unbekannte Felder gemeldet werden — Begründung im Kopf dieser Datei.
      amount_paid: "amount-string",
      amount_paid_fixed: "amount-string",
      deleted: "bool-string",
      link_to_receipt_id_by_customer: "null-or-string",
    },
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
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
