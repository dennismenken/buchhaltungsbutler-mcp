// Werkzeug 20, `/postings/get`: das einzige LESENDE der zwölf Buchungswerkzeuge.
//
// Drei Eigenheiten tragen diesen Eintrag:
//
//   1. **`order` ist case sensitive.** Die Spezifikation sagt das wörtlich („Please not that
//      the validation of the specified value is case sensitive!"). Das Enum aus `order.ts`
//      führt deshalb alle SIEBEN Werte in der Schreibweise der Spezifikation; ein kürzeres
//      Enum lehnte gültige Sortierungen unsichtbar vor dem Request ab.
//   2. **`account` und `postingaccount` sind hier keine Konten, sondern Filterlisten** mit
//      Schlüsselwörtern. Sie heißen im Werkzeugschema `account_filter` und
//      `postingaccount_filter` (Anhang A); `postingaccount` bleibt ausdrücklich optional,
//      denn seine Vorgabe ist 'all' — als Pflichtfeld scheiterte das Werkzeug ohne Not und
//      unsichtbar vor dem Request.
//   3. **Die Antwort trägt 38 Felder, acht davon kennt die Spezifikation nicht**
//      (`buchungen.md` 9.2). Der Antwortvertrag führt alle 38: unbekannte Felder werden
//      durchgereicht, bekannte typisiert, und genau deshalb steht hier die vollständige Liste
//      und nicht die halbe der Spezifikation.
//
// Der Buchungswegweiser steht NICHT hier, sondern genau einmal in den
// `instructions` und in der Resource `bb://guide/postings`.

import { z } from "zod";

import { postingsOrder } from "../../schema/order.js";
import { paginationFor } from "../../schema/pagination.js";
import { boundedText } from "../../schema/primitives.js";
import { costLocation, date, responseFormat } from "../../schema/vocab.js";
import type { ContractFieldType, ToolEntry } from "../types.js";

// `limit` und `offset` kommen aus der Tabelle in pagination.ts und nicht aus diesem Eintrag:
// Schema, Querprüfung Q2 und Bestandszeile der Antwort brauchen dieselbe Zahl.
const { limit, offset } = paginationFor("/postings/get");

const RESPONSE_FORMAT = responseFormat();
const ORDER = postingsOrder();
const DATE_FROM = date("Frühestes Buchungsdatum der gesuchten Buchungen");
const DATE_TO = date("Spätestes Buchungsdatum der gesuchten Buchungen");
const LAST_ACTION_FROM = date("Frühester Zeitpunkt der Anlage oder Statusänderung");
const LAST_ACTION_TO = date("Spätester Zeitpunkt der Anlage oder Statusänderung");

const BOUNDARY_SENTENCE = "Die Grenze ist eingeschlossen.";

const LAST_ACTION_SENTENCE =
  "Gemeint ist die Anlage oder die Statusänderung nach 'confirmed' oder 'fixed', nicht das " +
  "Buchungsdatum. Nach einem Schreibvorgang ist das der Weg, die eben entstandenen Buchungen " +
  "zu finden.";

const ACCOUNT_FILTER_DESCRIPTION =
  "Kommagetrennte Liste von Konten, auf die die Treffer eingegrenzt werden. Erlaubt sind die " +
  "Schlüsselwörter 'all', 'all financial accounts' und 'free booking' sowie Nummern von " +
  "Zahlungskonten, zum Beispiel '1200'. Ohne Angabe gilt 'all'. Der Body-Parameter der API " +
  "heißt account und meint hier kein einzelnes Zahlungskonto, sondern eine Filterliste; " +
  "Zahlungskonten auflisten mit bb_payment_accounts_list.";

const POSTINGACCOUNT_FILTER_DESCRIPTION =
  "Kommagetrennte Liste von Sachkonten, auf die die Treffer eingegrenzt werden. Erlaubt sind " +
  "die Schlüsselwörter 'all', 'all postingaccounts', 'all debtors' und 'all creditors' sowie " +
  "Kontonummern, zum Beispiel '4980'. Ohne Angabe gilt 'all'. Der Body-Parameter der API " +
  "heißt postingaccount; nachschlagen mit bb_postingaccounts_search.";

const POSTING_STATUS_DESCRIPTION =
  "Festschreibungsstatus der Treffer: 'all' liefert alles, 'fixed' nur festgeschriebene, " +
  "'unfixed' nur nicht festgeschriebene Buchungen. Ohne Angabe gilt 'all'.";

const COST_LOCATION_DESCRIPTION =
  "Genau eine Kostenstelle als Filter; geliefert werden dann nur Buchungen auf diese " +
  "Kostenstelle. Mandantenbezogen, nachschlagen mit bb_cost_locations_search.";

/**
 * Der Antwortvertrag von `/postings/get`: **38 Felder**, dreißig aus der Spezifikation und
 * acht, die sie nicht kennt (`buchungen.md` 9.2, 200 live gelesene Zeilen).
 *
 * Zwei Typentscheidungen sind gegen die Spezifikation getroffen und deshalb hier begründet:
 *
 *   - `booking_number` steht als `number`. Die Spezifikation deklariert `string`, live kam in
 *     allen 200 Zeilen eine JSON-Zahl. Der Vertrag beschreibt, was die API liefert, nicht was
 *     sie verspricht.
 *   - Die Felder mit dem Namensanfang `receipts_assigned` sind **keine** Beträge, sondern mit
 *     `", "` verkettete Zeichenketten. Ein `amount-string` erzeugte dort ein sinnloses
 *     Centfeld; sie stehen deshalb als `string`.
 *
 * `date_delivery`, `comment`, die beiden Kostenstellen und `circumstances_ll` waren in der
 * Stichprobe durchgehend leer; sie stehen als `null-or-string`, weil `null` an einem bekannten
 * Feld keine Warnung erzeugt, ein falscher Typ dagegen schon.
 *
 * **Der Vertragslauf hat diese 38 Felder am 2026-09-13 gegen die echte API
 * gehalten: kein neues, kein fehlendes und kein typverändertes Feld.** Das ist der stärkste
 * Einzelbefund des Laufs, denn dieser Endpunkt trägt den größten Vertrag des Registers und
 * acht Felder, die die Spezifikation nicht führt. Zwei Beobachtungen dazu, beide unkritisch:
 * `date_delivery` war erneut durchgehend null, und `transaction_amount` war in der Mehrheit
 * der Zeilen null — eine freie Buchung hat keine Zahlung. Der Typ bleibt `amount-string`:
 * `null` geht bei jedem Vertragstyp ohne Warnung durch (`src/mapping/coerce.ts`), während
 * `null-or-string` das Centfeld und damit die einzige verlustfreie Summenbildung wegnähme.
 */
const POSTINGS_LIST_FIELDS: Readonly<Record<string, ContractFieldType>> = Object.freeze({
  id_by_customer: "id-string",
  date: "string",
  date_delivery: "null-or-string",
  date_vat_effective: "string",
  postingtext: "string",
  amount: "amount-string",
  currency: "string",
  vat: "string",
  credit_type: "string",
  debit_postingaccount_number: "string",
  credit_postingaccount_number: "string",
  tax_key: "string",
  booking_number: "number",
  cost_location: "null-or-string",
  cost_location_two: "null-or-string",
  circumstances_ll: "null-or-string",
  transaction_amount: "amount-string",
  transaction_purpose: "null-or-string",
  receipts_assigned_ids_by_customer: "null-or-string",
  receipts_assigned_types: "null-or-string",
  receipts_assigned_invoice_numbers: "null-or-string",
  receipts_assigned_counterparties: "null-or-string",
  receipts_assigned_vat_rates: "null-or-string",
  receipts_assigned_amounts: "null-or-string",
  receipts_assigned_dates: "null-or-string",
  receipts_assigned_links: "null-or-string",
  fixed: "bool-string",
  comment: "null-or-string",
  receipt_id_by_customer: "null-or-string",
  transaction_id_by_customer: "null-or-string",
  // Die acht Felder, die die Spezifikation nicht führt (docs/api/buchungen.md 9.2). Sie
  // stehen im Vertrag, damit sie nicht als unbekanntes Feld in den Vertragswarnungen
  // auftauchen — dieselbe Behandlung wie `amount_paid` an den Belegendpunkten, wo sie
  // gemessen ist (Befund L4 in docs/api/live-befunde.md). Für `/postings/get` selbst gibt es
  // keine eigene Live-Messung.
  receipts_assigned_amounts_paid: "null-or-string",
  receipts_assigned_amounts_paid_fixed: "null-or-string",
  receipts_assigned_assigned_amounts: "null-or-string",
  receipts_assigned_assigned_dates: "null-or-string",
  receipts_id_by_customer: "null-or-string",
  receipts_links: "null-or-string",
  transactions_id_by_customer: "null-or-string",
  transactions_purpose: "null-or-string",
});

/** Werkzeug 20: `/postings/get`. */
export const bb_postings_search: ToolEntry = {
  name: "bb_postings_search",
  title: "Buchungen suchen",
  group: "postings",
  path: { literal: "/postings/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Liest die Buchungssätze eines Zeitraums aus der Buchhaltung von BuchhaltungsButler. Zu " +
    "nehmen, um vorhandene Buchungen zu sehen, etwa alle Buchungen des ersten Quartals auf " +
    "dem Sachkonto 4980, oder um nach einem Schreibvorgang nachzusehen, ob er gewirkt hat. " +
    "date_from und date_to sind Pflicht; einen unbegrenzten Abruf gibt es nicht. Liefert " +
    "weder Belege noch Zahlungen, sondern die Buchungszeilen selbst: Belege holt " +
    "bb_receipts_search, Zahlungen bb_transactions_search. Die Felder mit dem Namensanfang " +
    "receipts_assigned sind keine Listen, sondern verkettete Zeichenketten und taugen zur " +
    "Anzeige, nicht zur Weiterverarbeitung. Höchstens 1000 Zeilen je Aufruf; " +
    "rows ist die Zeilenzahl dieser Antwort und nie eine Gesamttrefferzahl, weiter geht es " +
    "über offset. Die Schreibweise von order unterscheidet Groß- und Kleinschreibung.",
  fields: [
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: true,
      description: `${DATE_FROM.description ?? ""} ${BOUNDARY_SENTENCE}`,
      schema: DATE_FROM,
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: true,
      description: `${DATE_TO.description ?? ""} ${BOUNDARY_SENTENCE}`,
      schema: DATE_TO,
    },
    {
      name: "date_last_action_from",
      apiNames: ["date_last_action_from"],
      source: "body",
      required: false,
      description: `${LAST_ACTION_FROM.description ?? ""} ${LAST_ACTION_SENTENCE}`,
      schema: LAST_ACTION_FROM,
    },
    {
      name: "date_last_action_to",
      apiNames: ["date_last_action_to"],
      source: "body",
      required: false,
      description: `${LAST_ACTION_TO.description ?? ""} ${BOUNDARY_SENTENCE}`,
      schema: LAST_ACTION_TO,
    },
    {
      name: "account_filter",
      apiNames: ["account"],
      source: "body",
      required: false,
      description: ACCOUNT_FILTER_DESCRIPTION,
      schema: boundedText(ACCOUNT_FILTER_DESCRIPTION),
    },
    // Bleibt optional, obwohl der Name nach einem Pflichtkonto klingt: Die Vorgabe der API
    // ist 'all', und ein Pflichtfeld ließe bb_postings_search ohne Not scheitern.
    {
      name: "postingaccount_filter",
      apiNames: ["postingaccount"],
      source: "body",
      required: false,
      description: POSTINGACCOUNT_FILTER_DESCRIPTION,
      schema: boundedText(POSTINGACCOUNT_FILTER_DESCRIPTION),
    },
    // Enum statt freiem String: Der Vorrat ist abzählbar, mandantenunabhängig und belegt
    // (Sparmaßnahme S3). Belegstelle: Die Parameterbeschreibung von
    // `posting_status` in docs/openapi/buchhaltungsbutler-v1.json schreibt „You have the
    // following options: all, fixed, unfixed" aus, und `error_code` 9 desselben Endpunkts
    // lehnt jeden anderen Wert mit „invalid posting_status specified" ab
    // (`buchungen.md` 9.1 und 9.3).
    {
      name: "posting_status",
      apiNames: ["posting_status"],
      source: "body",
      required: false,
      description: POSTING_STATUS_DESCRIPTION,
      schema: z.enum(["all", "fixed", "unfixed"]).describe(POSTING_STATUS_DESCRIPTION),
    },
    {
      name: "cost_location",
      apiNames: ["cost_location"],
      source: "body",
      required: false,
      description: COST_LOCATION_DESCRIPTION,
      schema: costLocation(),
    },
    {
      name: "order",
      apiNames: ["order"],
      source: "body",
      required: false,
      description: ORDER.description ?? "",
      schema: ORDER,
    },
    // required: false, obwohl der Server das limit immer mitsendet: Die Vorgabe steckt im
    // Schema, und Zod setzt sie auch unter .optional() ein. Ein
    // required: true wäre eine Verschärfung gegenüber der Spezifikation.
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
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  responseContract: {
    container: "data",
    fields: POSTINGS_LIST_FIELDS,
    source: "dokumentiert",
  },
  shape: "list",
  // Die Projektion, um zwei Felder erweitert. Soll- und Habenkonto heißen in der
  // ANTWORT debit_postingaccount_number und credit_postingaccount_number; postingaccount_debit
  // und postingaccount_credit gehören zum EINGABEschema von bb_postings_create_free. Der
  // Steuerschlüssel ist tax_key; vat ist der Steuersatz in Prozent und bleibt draußen.
  //
  // cost_location und transaction_id_by_customer stehen ZUSÄTZLICH zur Tabelle.
  // Grund ist ein gemessener Befund des Evaluationslaufs: Dieses Werkzeug hat einen Filter
  // cost_location, ließ die gefilterte Kostenstelle aber in der Antwort nicht ablesen —
  // Aufgabe 7 des Evaluationslaufs brauchte deshalb einen Aufruf je Kostenstelle, bei
  // 30 Kostenstellen 30 Aufrufe gegen ein Minutenlimit von 100. Ohne
  // transaction_id_by_customer musste Aufgabe 11 auf response_format="detailed" mit 38 Feldern
  // je Zeile ausweichen. Zwei Felder je Zeile sind billiger als beides. Die Asymmetrie zu
  // receipt_id_by_customer, das von Anfang an in der Liste stand, hatte keine sachliche
  // Begründung: Beide sind Anschlusskennungen derselben Art.
  //
  // Das Tokenbudget P11 bleibt davon unberührt: `concise` steht in keiner ausgelieferten
  // Werkzeugdefinition, weder im Eingabe- noch im Ausgabeschema (src/registry/definition.ts).
  // Die Erweiterung kostet Kontext erst in der ANTWORT und nur dort, wo sie einen zweiten
  // Aufruf oder die 38-Feld-Zeile erspart.
  concise: [
    "id_by_customer",
    "date",
    "postingtext",
    "amount",
    "debit_postingaccount_number",
    "credit_postingaccount_number",
    "tax_key",
    "cost_location",
    "fixed",
    "receipt_id_by_customer",
    "transaction_id_by_customer",
  ],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q1", "Q2", "Q3", "Q7"],
  invalidatesCache: [],
};
