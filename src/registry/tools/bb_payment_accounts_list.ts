// Werkzeug 43 von 54: `/accounts/get` (Plan 3.8, Arbeitspaket AP12d).
//
// Stufe 1 des Beschreibungsbudgets, weil hier die Namensentscheidung aus Plan 3.4 trägt:
// Die API nennt diese Objekte „accounts", gemeint sind **Zahlungskonten** (Kassen, Bank- und
// Kreditkartenkonten). Sie heißen deshalb `bb_payment_accounts_*` und nicht `bb_accounts_*`;
// `bb_accounts_list` und `bb_postingaccounts_search` hätten sich um ein Wort unterschieden
// und in jeder alphabetischen Liste nebeneinander gestanden.
//
// **Der Endpunkt führt außer dem Zugangsdatum keinen einzigen Parameter.** Kein `limit`, kein
// `offset`, keinen Filter: Er liefert immer alle Konten (Plan 7.5 Regel 4). Das Werkzeug
// trägt deshalb nur das serverseitige `response_format`, das nie an die API geht.
//
// **Er wird nie zwischengespeichert** (Plan 7.8): Die Kontenliste des Mandanten ist die
// Grundlage jeder Zahlungszuordnung, und ein veralteter Stand wäre hier am teuersten. Deshalb
// steht dieses Werkzeug in keiner Invalidierungszeile, und `bb_payment_accounts_create` trägt
// ein leeres `invalidatesCache`.
//
// Je Konto kommen genau zwei Felder, live bestätigt am 2026-09-12: `name` und
// `postingaccount_number`. **Kein `type`, kein `subtype`, keine Kennung, kein Kontostand,
// keine Währung.** Wer die Kontoart braucht, liest `subtype` in
// `bb_postingaccounts_search`; die Währung eines Zahlungskontos gibt die API an keiner
// Stelle preis (Plan 4.3, Anhang B Punkt 12).

import { responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

export const bb_payment_accounts_list: ToolEntry = {
  name: "bb_payment_accounts_list",
  title: "Zahlungskonten auflisten",
  path: { literal: "/accounts/get" },
  effect: "read",
  toolClass: "R",
  tier: 1,
  description:
    "Listet die Zahlungskonten des Mandanten in BuchhaltungsButler auf, also Kassen, Bank- " +
    "und Kreditkartenkonten. Je Konto kommen genau zwei Felder: name und " +
    "postingaccount_number. Diese Nummer ist eine Sachkontonummer und bezeichnet trotzdem " +
    "ein Zahlungskonto; genau dieser Wert gehört in das Feld payment_account_number von " +
    "bb_receipts_create, bb_receipts_upload und bb_transactions_create. Gedacht zum " +
    "Nachschlagen, bevor eine Zahlung oder ein Beleg einem Konto zugeordnet wird. Der " +
    "Endpunkt kennt weder limit noch offset und liefert immer alle Konten. Kontoart, " +
    "Kontostand und Währung liefert er nicht: Die Kontoart steht als subtype in " +
    "bb_postingaccounts_search, die Währung gibt die API an keiner Stelle preis.",
  fields: [
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
  // Zwei Felder, live geprüft am 2026-09-12 und deckungsgleich mit
  // `docs/api/stammdaten.md`. `source` bleibt "dokumentiert", weil Plan 2.1 und P13 den Wert
  // "gemessen" ausschließlich den vier in Plan 0.3 gemessenen Endpunkten vorbehalten.
  //
  // Der Vertragslauf (AP17, Plan 9.7) hat diesen Vertrag am 2026-09-13 gegen die echte API
  // gehalten: kein neues, kein fehlendes und kein typverändertes Feld.
  responseContract: {
    container: "data",
    fields: { name: "string", postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "list",
  concise: ["postingaccount_number", "name"],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
