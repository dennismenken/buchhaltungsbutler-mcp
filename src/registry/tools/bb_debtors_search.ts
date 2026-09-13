// Werkzeug 32 von 54: `/settings/get/debtors` (Plan 3.8, Arbeitspaket AP12d).
//
// Debitoren sind die Kundenkonten des Mandanten. Der Endpunkt führt außer dem Zugangsdatum
// nur `limit` und `offset`: Es gibt keinen Namens- und keinen Nummernfilter, gesucht wird in
// der gelieferten Liste.
//
// Drei Eigenheiten stehen hier und nicht in der Beschreibung, weil sie das Kontextbudget aus
// Plan 4.10 kosten würden, ohne dem Agenten beim Aufruf zu helfen:
//
//  1. **Kein `maximum` für `limit`, und deshalb auch kein Q2.** Die Obergrenze ist nicht
//     dokumentiert und nicht verifiziert (Plan 7.5, 14.2). Ein erfundenes Maximum lehnte
//     gültige Aufrufe unsichtbar vor dem Request ab; ohne belegte Schranke gibt es zugleich
//     nichts, wogegen Q2 prüfen könnte (Plan 4.7). Statt der Prüfung trägt die
//     Feldbeschreibung den Warnsatz aus `pagination.ts`.
//  2. **Der Serverstandard beträgt 25 Zeilen.** Deshalb sendet dieser Server `limit` immer
//     mit (Plan 7.5 Regel 1); 25 Zeilen sähen sonst aus wie das vollständige Ergebnis.
//  3. **Schreib- und Lesename weichen ab** (Plan 7.2): Geschrieben wird
//     `additional_address_line` und `sales_tax_id`, gelesen `additional_addressline` und
//     `sales_tax_id_eu`. Der Antwortvertrag trägt die Lesenamen; ein gemeinsamer Fachtyp über
//     Schreib- und Leseseite erzeugte hier stille Datenverluste.

import { paginationFor, SMALL_API_DEFAULT_SENTENCE } from "../../schema/pagination.js";
import { responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const pagination = paginationFor("/settings/get/debtors");

export const bb_debtors_search: ToolEntry = {
  name: "bb_debtors_search",
  title: "Debitoren auflisten",
  path: { literal: "/settings/get/debtors" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Listet die Debitorenkonten des Mandanten in BuchhaltungsButler auf, also die " +
    "Kundenkonten, mit Kontonummer, Name, Kundennummer und Anschrift. Gedacht zum " +
    "Nachschlagen, bevor eine Ausgangsrechnung einem Kunden zugeordnet wird. Sachkonten, " +
    "Zahlungskonten und Kreditoren liefert dieser Endpunkt nicht; dafür " +
    "bb_postingaccounts_search. Einen Filter kennt er nicht, gesucht wird in der " +
    "gelieferten Liste. Ohne ausdrückliches limit liefert die API nur 25 Zeilen.",
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Die 16 Feldnamen stammen aus `docs/api/stammdaten.md` und decken sich mit einem lesenden
  // Kontrollaufruf vom 2026-09-12. `source` bleibt trotzdem "dokumentiert": Plan 2.1 und P13
  // behalten den Wert "gemessen" ausschließlich den vier in Plan 0.3 gemessenen Endpunkten
  // vor. `uid_ch` kam live durchgehend als null, `import_pending` als Zahl.
  //
  // Der Vertragslauf (AP17, Plan 9.7) hat diesen Vertrag am 2026-09-13 gegen die echte API
  // gehalten: kein neues, kein fehlendes und kein typverändertes Feld. `import_pending` kam
  // erneut als JSON-Zahl, `uid_ch` erneut durchgehend als null. Anders als bei den Kreditoren
  // war `customer_number` hier gesetzt — das ist der Unterschied, den Plan 7.4 benennt.
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
