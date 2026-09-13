// Werkzeug 8 von 54 (Plan 3.8): `/receipts/restore/id_by_customer`, Löschmarkierung zurücknehmen.
//
// **Pfadvorlage statt literalem Pfad (Plan 4.6).** Wie bei bb_receipts_delete ist das Segment
// `id_by_customer` ein Platzhalter für den Wert; der Eintrag trägt `template`, `params` und
// `specPath` mit dem unveränderten Schlüssel der Spezifikation. Das Identifikatorfeld hat
// `source: "path"` und ein leeres `apiNames`, und **ein Body-Feld `id_by_customer` gibt es
// nicht** — die Spezifikation führt an diesem Pfad ohnehin nur einen einzigen Parameter.
//
// **`verified: false`.** Die Aufrufform ist dieselbe wie bei den beiden am 2026-09-12
// gemessenen Einzelabrufen (Befund L1), dieser Endpunkt ist aber schreibend und wurde deshalb
// **nicht** getestet: „gleiche Form wie L1, schreibend, nicht getestet". Die Beschreibung
// bezeichnet die Aufrufform folgerichtig nicht als gemessen; die Klärung gehört in AP19, das
// Nachziehen in AP19b (Plan 4.6, 12 S1).
//
// **Die Wirkung ist ändernd, nicht anlegend** (Plan 3.8, grundlagen.md 7.3): Der Beleg
// existiert bereits, es wird allein seine Löschmarkierung zurückgenommen. Die Klasse ist
// deshalb A und nicht D, und der Pflichtsatz ist U1 mit bb_receipts_delete als Umkehrweg.

import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

export const bb_receipts_restore: ToolEntry = {
  name: "bb_receipts_restore",
  title: "Beleg wiederherstellen",
  path: {
    template: "/receipts/restore/{receipt_id_by_customer}",
    params: ["receipt_id_by_customer"],
    specPath: "/receipts/restore/id_by_customer",
  },
  effect: "modify",
  toolClass: "A",
  tier: 2,
  mandatorySentence: "U1",
  description:
    "Nimmt in BuchhaltungsButler die Löschmarkierung eines Belegs zurück, sodass er wieder für " +
    "die Buchhaltung zählt; typischer Fall ist ein versehentlich als gelöscht markierter Beleg. " +
    "Als gelöscht markierte Belege findet bb_receipts_search mit deleted true. Legt keinen " +
    "Beleg an und stellt keine Datei wieder her: Der Beleg war nie weg, nur markiert. " +
    "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig zu machen mit " +
    "bb_receipts_delete.",
  fields: [
    {
      name: "receipt_id_by_customer",
      // Leeres apiNames und source "path": Der Wert wird in den Pfad eingesetzt und nie in den
      // Body geschrieben (Plan 4.6 Regel 5). Die Spezifikation führt ihn an diesem Pfad nicht.
      apiNames: [],
      source: "path",
      required: true,
      description:
        "Die mandantenbezogene Nummer des Belegs, zu finden über bb_receipts_search mit " +
        "deleted true. Keine globale Kennung. In Suchergebnissen erscheint sie als String; hier " +
        "ohne Anführungszeichen übergeben.",
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  responseContract: {
    // Die Quittung trägt id_by_customer auf oberster Ebene des Umschlags, nicht unter data
    // (docs/api/belege.md 9.2).
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
    hint: "das Feld deleted ansehen; nach einer erfolgreichen Wiederherstellung steht es auf false",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
  // Aufrufform aus Befund L1 abgeleitet, schreibend und deshalb nicht getestet (Plan 4.6).
  verified: false,
};
