// Werkzeug 8 von 54: `/receipts/restore/id_by_customer`, Löschmarkierung zurücknehmen.
//
// **Pfadvorlage statt literalem Pfad.** Wie bei bb_receipts_delete ist das Segment
// `id_by_customer` ein Platzhalter für den Wert; der Eintrag trägt `template`, `params` und
// `specPath` mit dem unveränderten Schlüssel der Spezifikation. Das Identifikatorfeld hat
// `source: "path"` und ein leeres `apiNames`, und **ein Body-Feld `id_by_customer` gibt es
// nicht** — die Spezifikation führt an diesem Pfad ohnehin nur einen einzigen Parameter.
//
// **`verified: false`.** Die Aufrufform ist dieselbe wie bei den beiden am 2026-09-12
// gemessenen Einzelabrufen (Befund L1 in docs/api/live-befunde.md), dieser Endpunkt ist aber
// schreibend und wurde deshalb
// **nicht** getestet: „gleiche Form wie L1, schreibend, nicht getestet". Die Beschreibung
// bezeichnet die Aufrufform folgerichtig nicht als gemessen; die Klärung braucht ein
// Testmandat außerhalb der Produktivbuchhaltung.
//
// **Die Wirkung ist ändernd, nicht anlegend** (grundlagen.md 7.3): Der Beleg
// existiert bereits, es wird allein seine Löschmarkierung zurückgenommen. Die Klasse ist
// deshalb A und nicht D, und der Pflichtsatz ist U1 mit bb_receipts_delete als Umkehrweg.

import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

export const bb_receipts_restore: ToolEntry = {
  name: "bb_receipts_restore",
  title: "Beleg wiederherstellen",
  group: "receipts",
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
      // Body geschrieben. Die Spezifikation führt ihn an diesem Pfad nicht.
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
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
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
  // Aufrufform aus Befund L1 in docs/api/live-befunde.md abgeleitet, schreibend und deshalb
  // nicht getestet.
  verified: false,
};
