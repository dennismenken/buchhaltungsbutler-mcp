// Werkzeug 36 von 54: `/settings/get/creditors`.
//
// Kreditoren sind die Lieferantenkonten des Mandanten. Der Endpunkt ist strukturell gleich
// `/settings/get/debtors` und führt ebenfalls nur `limit` und `offset`; einen Namens- oder
// Nummernfilter gibt es nicht.
//
// Drei Eigenheiten, die hier und nicht in der Beschreibung stehen:
//
//  1. **Kein `maximum` für `limit`, und deshalb kein Q2**: Die
//     Obergrenze ist nicht dokumentiert und nicht verifiziert. Statt der Prüfung trägt die
//     Feldbeschreibung den Warnsatz aus `pagination.ts`.
//  2. **`due_in_days` ist schreibbar, aber nicht lesbar.** Das Feld lässt sich an
//     bb_creditors_create und bb_creditors_update setzen, erscheint in dieser Antwort aber
//     nicht (live geprüft, `docs/api/stammdaten.md`). Ein sicheres Teilupdate der
//     Zahlungsfrist ist damit über die API nicht möglich.
//  3. **`customer_number` kommt, obwohl es beim Kreditor keinen Schreibparameter dafür
//     gibt**, und war live durchgehend `null`. Der Vertrag führt das Feld deshalb als
//     `null-or-string`; ein String-Typ wäre hier eine Behauptung über ungeprüfte Daten.

import { paginationFor, SMALL_API_DEFAULT_SENTENCE } from "../../schema/pagination.js";
import { responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const pagination = paginationFor("/settings/get/creditors");

export const bb_creditors_search: ToolEntry = {
  name: "bb_creditors_search",
  title: "Kreditoren auflisten",
  group: "creditors",
  path: { literal: "/settings/get/creditors" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Listet die Kreditorenkonten des Mandanten in BuchhaltungsButler auf, also die " +
    "Lieferantenkonten, mit Kontonummer, Name und Anschrift. Gedacht zum Nachschlagen, " +
    "bevor eine Eingangsrechnung einem Lieferanten zugeordnet wird. Sachkonten, " +
    "Zahlungskonten und Debitoren liefert dieser Endpunkt nicht; dafür " +
    "bb_postingaccounts_search. Einen Filter kennt er nicht, und die Zahlungsfrist " +
    "due_in_days liefert er nicht mit. Ohne ausdrückliches limit liefert die API nur 25 " +
    "Zeilen.",
  fields: [
    {
      name: "limit",
      apiNames: ["limit"],
      source: "body",
      required: false,
      description: `${pagination.limit.description ?? ""} ${SMALL_API_DEFAULT_SENTENCE}`,
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
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: responseFormat().description ?? "",
      schema: responseFormat(),
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  // Die 16 Feldnamen stammen aus `docs/api/stammdaten.md` und decken sich mit einem lesenden
  // Kontrollaufruf vom 2026-09-12. `source` bleibt "dokumentiert", weil P13 den
  // Wert "gemessen" ausschließlich den vier live gemessenen Endpunkten vorbehält.
  //
  // Der Vertragslauf hat diesen Vertrag am 2026-09-13 gegen die echte API
  // gehalten: kein neues, kein fehlendes und kein typverändertes Feld. `customer_number` war
  // in allen ausgewerteten Zeilen null und bestätigt damit die Feststellung, dass
  // das Feld bei Kreditoren live durchgehend leer ist. Es bleibt trotzdem im Vertrag und in
  // der Projektion: Es trägt die fachliche Kundennummer, und ein Mandant, der sie bei
  // Kreditoren pflegt, verlöre sie sonst. `uid_ch` war ebenfalls durchgehend null.
  responseContract: {
    container: "data",
    fields: {
      type: "string",
      name: "string",
      postingaccount_number: "id-string",
      contact_person_name: "string",
      street: "string",
      additional_addressline: "string",
      zip: "string",
      city: "string",
      country: "string",
      customer_number: "null-or-string",
      sales_tax_id_eu: "string",
      email: "string",
      uid_ch: "null-or-string",
      iban: "string",
      bic: "string",
      import_pending: "number",
    },
    source: "dokumentiert",
  },
  shape: "list",
  concise: ["postingaccount_number", "name", "customer_number", "city"],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
