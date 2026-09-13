// Werkzeug 7 von 54 (Plan 3.8): `/receipts/delete/id_by_customer`, Beleg als gelöscht markieren.
//
// **Pfadvorlage statt literalem Pfad (Plan 4.6).** Das Segment `id_by_customer` ist ein
// Platzhalter für den Wert; der Eintrag trägt `template`, `params` und `specPath` mit dem
// unveränderten Schlüssel der Spezifikation. Das Identifikatorfeld hat `source: "path"` und ein
// leeres `apiNames`, und **ein Body-Feld `id_by_customer` gibt es nicht** — die Spezifikation
// führt an diesem Pfad ohnehin nur einen einzigen Parameter.
//
// **`verified: false`, und das ist keine Förmlichkeit.** Diese Aufrufform ist dieselbe wie bei
// den beiden Einzelabrufen, die am 2026-09-12 mit HTTP 200 gemessen wurden (Befund L1). Dieser
// Endpunkt ist aber schreibend und wurde deshalb **nicht** getestet: „gleiche Form wie L1,
// schreibend, nicht getestet". Die Beschreibung bezeichnet die Aufrufform folgerichtig nicht
// als gemessen. Die Klärung gehört in AP19, das Nachziehen in AP19b (Plan 4.6, 12 S1).
//
// **Der Vorgang ist umkehrbar und löscht nichts endgültig.** Er setzt eine Löschmarkierung;
// `deleted` steht danach auf 1, und bb_receipts_restore nimmt sie zurück. Einen Endpunkt, der
// einen Beleg endgültig entfernt, kennt die API nicht (Plan 3.5 U1 und U2).

import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

export const bb_receipts_delete: ToolEntry = {
  name: "bb_receipts_delete",
  title: "Beleg als gelöscht markieren",
  path: {
    template: "/receipts/delete/{receipt_id_by_customer}",
    params: ["receipt_id_by_customer"],
    specPath: "/receipts/delete/id_by_customer",
  },
  effect: "delete",
  toolClass: "D",
  tier: 1,
  mandatorySentence: "U1",
  description:
    "Markiert einen Beleg in BuchhaltungsButler als gelöscht, zum Beispiel einen versehentlich " +
    "doppelt angelegten Beleg. Der Beleg bleibt erhalten und ist über bb_receipts_search mit " +
    "deleted true weiter zu finden; für die laufende Buchhaltung zählt er nicht mehr. Entfernt " +
    "keine Buchung und keine Zuordnung zu einer Zahlung: Hängt eine bestätigte Buchung am " +
    "Beleg, lehnt die API den Aufruf ab. Die Zuordnung zwischen Beleg und Zahlung löst " +
    "bb_transactions_unassign_receipt. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Rückgängig zu machen mit bb_receipts_restore.",
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
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  responseContract: {
    // Die Quittung trägt id_by_customer auf oberster Ebene des Umschlags, nicht unter data
    // (docs/api/belege.md 8.2).
    container: "none",
    fields: { id_by_customer: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_receipts_get",
    argsFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
    hint: "das Feld deleted ansehen; nach einer erfolgreichen Markierung steht es auf true",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
  // Aufrufform aus Befund L1 abgeleitet, schreibend und deshalb nicht getestet (Plan 4.6).
  verified: false,
};
