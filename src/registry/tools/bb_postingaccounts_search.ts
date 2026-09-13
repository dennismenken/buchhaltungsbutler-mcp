// Werkzeug 40 von 54: `/settings/get/postingaccounts` (Plan 3.8, Arbeitspaket AP12d).
//
// Stufe 1 des Beschreibungsbudgets, weil dies der gefährlichste Verwechslungsfall der ganzen
// API ist (Plan 3.4): Die Liste ist eine **Vereinigung** aus Sachkonten, Zahlungskonten,
// Debitoren und Kreditoren. Sie sind nur an `type` und `subtype` zu unterscheiden.
//
// **`type` und `subtype` stehen deshalb immer in `concise`** — Maßnahme 4 aus Plan 3.4 und
// ausdrücklich nicht verhandelbar. Ohne sie sähe eine gekürzte Antwort so aus, als sei 1200
// dasselbe wie 4980.
//
// **Kein `maximum` für `limit`, und deshalb auch kein Q2** (Plan 7.5, 4.7, 14.2): Die API
// nennt hier den Standardwert 1000, aber keine Obergrenze. Ein erfundenes Maximum lehnte
// gültige Aufrufe unsichtbar vor dem Request ab. Statt der Prüfung trägt die Feldbeschreibung
// den Warnsatz aus `pagination.ts`.
//
// **Q7 gilt hier sehr wohl:** `/settings/get/postingaccounts` ist einer der drei Endpunkte
// mit `order`, und jeder der drei hat eine andere Syntax. `'name ASC'` ist hier gültig und an
// `/postings/get` nicht (Plan 4.7).
//
// Beobachtete Werte (live 2026-09-12, `docs/api/stammdaten.md`): `type` war
// 'postingaccount', 'account', 'debtor', 'debtor collective', 'creditor' oder
// 'creditor collective'; `subtype` war 'default', 'cash', 'bank/institution', 'other' oder
// null. Der in der Spezifikation genannte Beispielwert 'default chart' kam **nicht** vor.
// Ein Enum wird daraus nicht gebaut: Die Werte sind nicht abschließend belegt, und sie stehen
// in der **Antwort**, nicht in einem Parameter.

import { z } from "zod";

import { postingAccountsOrder } from "../../schema/order.js";
import { paginationFor } from "../../schema/pagination.js";
import { responseFormat } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

const pagination = paginationFor("/settings/get/postingaccounts");

/** Ein Ausschlussschalter der Ergebnisliste. Alle vier sind gleich gebaut. */
function excludeField(name: string, what: string): FieldSpec {
  const description = `true schließt ${what} aus dem Ergebnis aus.`;
  return {
    name,
    apiNames: [name],
    source: "body",
    required: false,
    description,
    schema: z.boolean().describe(description),
  };
}

export const bb_postingaccounts_search: ToolEntry = {
  name: "bb_postingaccounts_search",
  title: "Kontenrahmen durchsuchen",
  path: { literal: "/settings/get/postingaccounts" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Durchsucht den Kontenrahmen des Mandanten in BuchhaltungsButler. Die Liste ist eine " +
    "Vereinigung: Sachkonten, Zahlungskonten, Debitoren und Kreditoren stehen darin " +
    "nebeneinander und sind nur an type und subtype zu unterscheiden, etwa 'postingaccount' " +
    "gegen 'account'. Beide Felder liefert dieses Werkzeug deshalb immer mit. Gedacht zum " +
    "Nachschlagen einer Sachkontonummer, bevor gebucht wird. Nur die Zahlungskonten mit " +
    "ihrer zugehörigen Sachkontonummer liefert bb_payment_accounts_list; ein neues Sachkonto " +
    "legt bb_postingaccounts_create an. Kontostände und Buchungen liefert dieses Werkzeug " +
    "nicht, dafür bb_reports_get_ledger. Ohne ausdrückliches limit liefert die API 1000 " +
    "Zeilen; eine Obergrenze dokumentiert sie nicht.",
  fields: [
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      description: pagination.limit.description ?? "",
      schema: pagination.limit,
    },
    {
      name: "offset",
      apiNames: ["offset"],
      source: "body",
      required: false,
      description: pagination.offset.description ?? "",
      schema: pagination.offset,
    },
    {
      name: "order",
      apiNames: ["order"],
      source: "body",
      required: false,
      description: postingAccountsOrder().description ?? "",
      schema: postingAccountsOrder(),
    },
    excludeField("exclude_postingaccounts", "alle Sachkonten"),
    excludeField("exclude_accounts", "alle Zahlungskonten, also Kassen und Bankkonten"),
    excludeField("exclude_creditors", "alle Kreditorenkonten"),
    excludeField("exclude_debtors", "alle Debitorenkonten"),
    {
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: responseFormat().description ?? "",
      schema: responseFormat(),
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Sechs Felder, live geprüft am 2026-09-12 und deckungsgleich mit
  // `docs/api/stammdaten.md`. `source` bleibt "dokumentiert", weil Plan 2.1 und P13 den Wert
  // "gemessen" ausschließlich den vier in Plan 0.3 gemessenen Endpunkten vorbehalten.
  // `parent_name` kam durchgehend als null und `parent_postingaccount_number` als leerer
  // String; beide Formen trägt der Vertrag (Plan 7.3, Anhang B Punkt 11).
  //
  // Der Vertragslauf (AP17, Plan 9.7) hat diesen Vertrag am 2026-09-13 gegen die echte API
  // gehalten: kein neues, kein fehlendes und kein typverändertes Feld. `parent_name` war
  // erneut in allen ausgewerteten Zeilen null; der Typ `null-or-string` ist damit weiterhin
  // nicht widerlegt und nicht bestätigt, und `null` erzeugt an einem bekannten Feld ohnehin
  // keine Warnung (`src/mapping/coerce.ts`).
  responseContract: {
    container: "data",
    fields: {
      postingaccount_number: "id-string",
      name: "string",
      type: "string",
      subtype: "null-or-string",
      parent_postingaccount_number: "id-string",
      parent_name: "null-or-string",
    },
    source: "dokumentiert",
  },
  shape: "list",
  concise: ["postingaccount_number", "name", "type", "subtype"],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3", "Q7"],
  invalidatesCache: [],
};
