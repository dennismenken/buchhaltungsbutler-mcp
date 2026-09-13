// Werkzeug 1 von 54 (Plan 3.8): `/receipts/get`, die Belegsuche.
//
// Drei Dinge an diesem Eintrag sind nicht beliebig:
//
//  1. Der Antwortvertrag ist GEMESSEN (Plan 0.3 Befund L2, 2026-09-12) und gilt
//     ausschließlich für diesen Endpunkt. Das Leistungsdatum heißt hier `delivery_date`,
//     die Fälligkeit `due_date`; der Einzelabruf bb_receipts_get nennt dieselben
//     Sachverhalte `date_delivery` und `date_payment_due`. Ein gemeinsamer Belegtyp über
//     beide Endpunkte erzeugte genau hier eine still leere Fälligkeit (Plan 7.2).
//  2. `amount_paid` und `amount_paid_fixed` stehen im Vertrag, obwohl die Spezifikation
//     sie nicht führt: Die API liefert sie an beiden Belegendpunkten (Befund L4). **Beide
//     sind in diesem Mandanten funktionslos**, und zwar gemessen: Am 2026-09-13 lieferte
//     `/receipts/get` mit `list_direction` 'inbound' und `limit` 50 genau 50 Zeilen, alle
//     50 mit gesetztem `payment_date` und alle 50 mit `amount_paid` **und**
//     `amount_paid_fixed` durchgehend `"0.00"`; dieselben Werte zeigten die Messungen M2
//     und M3 (Befunde B2 und B3 in docs/entwicklung/buendelwerkzeuge.md Abschnitt 12).
//     Weder eine Teilzahlung noch ein offener Betrag folgt daraus. Deshalb trägt die
//     Werkzeugbeschreibung den Warnsatz: Ein Modell, das `amount_paid` für bare Münze
//     nimmt, meldet jeden bezahlten Beleg als unbezahlt. Die **Bedeutung** von
//     `amount_paid_fixed` ist NICHT ERMITTELT; es steht im Vertrag, damit es nicht als
//     unbekanntes Feld in `_contract_warnings` auftaucht, und nicht, weil es gedeutet
//     wäre. Ob andere Mandanten die beiden Felder füllen, ist ebenfalls nicht ermittelt —
//     gemessen ist genau einer.
//  3. Das Schema des Parameters `order` ist in der Spezifikation ein Platzhalter, nämlich
//     eine einzige Eigenschaft `field` mit dem Enum ['ASC','DESC']; daraus erzeugte ein
//     Generator {"field": "ASC"}, was die API ablehnt. Der Platzhalter ist verworfen, der
//     Wertevorrat stammt aus dem Beschreibungstext (Plan 4.1, Anhang B Punkt 47). Der
//     Baustein steht in src/schema/order.ts.
//
// Zur Beschreibung des Feldes `order`: Sie nennt `invoicingparty` ausdrücklich als den
// Sortierschlüssel, der in der Antwort `counterparty` heißt, und sagt über `invoicenumber`
// KEINE Umbenennung. Das ist Absicht: Gemessen liefert dieser Endpunkt das Feld
// `invoicenumber` (Befund L2), während der Baustein in src/schema/order.ts dem Text der
// Spezifikation folgt und `invoice_number` behauptet. Die Messung geht vor (Plan 0.1).

import { z } from "zod";

import { limit, offset } from "../../schema/pagination.js";
import { receiptsOrder } from "../../schema/order.js";
import { boundedText, dateTimeValue, dateValue } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

/** Das serverseitige Feld der Projektion. Sein Text ist der des Bausteins (Plan 4.5). */
const RESPONSE_FORMAT_TEXT =
  "'concise' liefert nur die Felder, die einen Datensatz erkennbar machen und den nächsten " +
  "Schritt erlauben. 'detailed' liefert den Datensatz so, wie die BuchhaltungsButler-API ihn " +
  "ausgibt. Mit 'concise' beginnen und nur für die wenigen Datensätze auf 'detailed' wechseln, " +
  "die wirklich geprüft werden müssen. Dieses Feld ist serverseitig und geht nicht an die API.";

export const bb_receipts_search: ToolEntry = {
  name: "bb_receipts_search",
  title: "Belege suchen",
  group: "receipts",
  path: { literal: "/receipts/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Durchsucht die Belege eines Mandanten in BuchhaltungsButler, also Eingangs- und " +
    "Ausgangsrechnungen samt Gutschriften, und liefert sie seitenweise. Beispiel: alle " +
    "Eingangsbelege eines Monats über list_direction 'inbound' zusammen mit date_from und " +
    "date_to. Einen einzelnen Beleg samt Fremdwährungsfeldern holt bb_receipts_get, die einem " +
    "Beleg zugeordneten Zahlungen listet bb_receipts_list_transactions, Buchungssätze liefert " +
    "bb_postings_search. Liefert keine Belegdatei und keinen Filter nach Belegart: Gutschriften " +
    "sind erst am Feld type der Antwort zu erkennen. amount_paid und amount_paid_fixed sind " +
    "gemessen stets '0.00', auch bei bezahlten Belegen: keine Teilzahlung, kein offener Betrag. " +
    "Bezahlt sagt payment_date. Höchstens 500 Zeilen je Aufruf, Vorgabe " +
    "100, weitere Seiten über offset. Eine Gesamttrefferzahl nennt die API nicht; weniger " +
    "Zeilen als limit bedeutet Ende des Ergebnisses.",
  fields: [
    {
      name: "list_direction",
      apiNames: ["list_direction"],
      source: "body",
      required: true,
      description:
        "Richtung der Belegliste. 'inbound' sind Eingangsbelege, also Rechnungen, die der " +
        "Mandant erhalten hat; 'outbound' sind Ausgangsbelege, also Rechnungen, die der Mandant " +
        "stellt. Pflichtangabe der API, einen Wert für beide Richtungen zugleich gibt es nicht.",
      schema: z.enum(["inbound", "outbound"]),
    },
    {
      name: "payment_status",
      apiNames: ["payment_status"],
      source: "body",
      required: false,
      description:
        "Zahlungsstand als Filter. 'paid' liefert nur bezahlte, 'unpaid' nur unbezahlte Belege; " +
        "ohne Angabe liefert die API beide.",
      schema: z.enum(["paid", "unpaid"]),
    },
    {
      name: "counterparty",
      apiNames: ["counterparty"],
      source: "body",
      required: false,
      description:
        "Gegenpartei als Filter. Bei Eingangsbelegen ist das der Rechnungssteller, bei " +
        "Ausgangsbelegen der Empfänger, zum Beispiel Bürobedarf Nordwest GmbH.",
      schema: boundedText("Gegenpartei als Filter."),
    },
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: false,
      description: `Frühestes Belegdatum, eingeschlossen, als YYYY-MM-DD, zum Beispiel 2026-04-26. ${EMPTY_STRING_SENTENCE}`,
      schema: dateValue("Frühestes Belegdatum."),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: false,
      description: `Spätestes Belegdatum, eingeschlossen, als YYYY-MM-DD, zum Beispiel 2026-04-26. ${EMPTY_STRING_SENTENCE}`,
      schema: dateValue("Spätestes Belegdatum."),
    },
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      description:
        "Zeilen je Aufruf, Vorgabe 100. Harte Obergrenze 500. Größere Werte lehnt die API ab, " +
        "sie kappt sie nicht. Der Server sendet den Wert immer mit.",
      schema: limit(500, 100),
    },
    {
      name: "offset",
      apiNames: ["offset"],
      source: "body",
      required: false,
      description:
        "Zahl der zu überspringenden Zeilen. Die zweite Seite einer Suche mit limit=100 holt " +
        "offset=100. Eine volle Seite bedeutet, dass es wahrscheinlich weitere Zeilen gibt.",
      schema: offset(),
    },
    {
      name: "order",
      apiNames: ["order"],
      source: "body",
      required: false,
      description:
        'Sortierung als Objekt aus Sortierfeld und Richtung, zum Beispiel {"date": "ASC"} oder ' +
        '{"date": "ASC", "amount": "DESC"}. Sortierbar sind date, amount, invoicenumber und ' +
        "invoicingparty; invoicingparty heißt in der Antwort counterparty. Die Reihenfolge der " +
        "Schlüssel entscheidet über die Reihenfolge der Kriterien. Mindestens ein Feld angeben " +
        "oder das Feld weglassen.",
      schema: receiptsOrder(),
    },
    {
      name: "include_offers",
      apiNames: ["include_offers"],
      source: "body",
      required: false,
      description: "Wenn true, erscheinen zusätzlich Angebote in der Liste.",
      schema: z.boolean(),
    },
    {
      name: "deleted",
      apiNames: ["deleted"],
      source: "body",
      required: false,
      description:
        "Wenn true, liefert die API ausschließlich als gelöscht markierte Belege, nicht " +
        "zusätzlich zu den aktiven. Wiederherstellen lässt sich ein solcher Beleg mit " +
        "bb_receipts_restore.",
      schema: z.boolean(),
    },
    {
      name: "invoicenumber",
      apiNames: ["invoicenumber"],
      source: "body",
      required: false,
      description:
        "Rechnungsnummer als Filter. Geliefert werden die Belege mit genau dieser " +
        "Rechnungsnummer; in der Antwort heißt das Feld ebenfalls invoicenumber.",
      schema: boundedText("Rechnungsnummer als Filter.", 60),
    },
    {
      name: "due_date",
      apiNames: ["due_date"],
      source: "body",
      required: false,
      description:
        "Fälligkeitsdatum als YYYY-MM-DD, zum Beispiel 2026-04-26. Geliefert werden nur Belege " +
        `mit genau diesem Fälligkeitsdatum; eine Bereichsgrenze ist es nicht. ${EMPTY_STRING_SENTENCE}`,
      schema: dateValue("Fälligkeitsdatum als Gleichheitsfilter."),
    },
    {
      name: "date_since_last_modified",
      apiNames: ["date_since_last_modified"],
      source: "body",
      required: false,
      description:
        "Zeitpunkt der letzten Änderung als YYYY-MM-DD HH:MM:SS, zum Beispiel " +
        "2026-04-26 13:45:00. Geliefert werden die Belege, deren Änderungszeitpunkt später " +
        "liegt. Ein reines Datum YYYY-MM-DD gilt als 23:59:59 dieses Tages; für einen Abgleich " +
        `deshalb immer mit Uhrzeit senden. ${EMPTY_STRING_SENTENCE}`,
      schema: dateTimeValue("Zeitpunkt der letzten Änderung."),
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
    // Die 16 gemessenen Felder des Listenabrufs (Plan 0.3 Befunde L2 und L3). Beträge bleiben
    // als Zeichenkette führend und bekommen zusätzlich ein Ganzzahl-Cent-Feld (Plan 7.4);
    // `deleted` kommt als "0"/"1" und wird zu einem echten Boolean.
    fields: {
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
      // Gemessen durchgehend `"0.00"`, auch bei gesetztem `payment_date`; `amount_paid_fixed`
      // ist zusätzlich in seiner Bedeutung nicht ermittelt. Beide stehen hier, damit sie nicht
      // als unbekannte Felder gemeldet werden — Begründung im Kopf dieser Datei, Punkt 2.
      amount_paid: "amount-string",
      amount_paid_fixed: "amount-string",
      deleted: "bool-string",
      link_to_receipt_id_by_customer: "null-or-string",
    },
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
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q1", "Q2", "Q3", "Q7"],
  invalidatesCache: [],
};
