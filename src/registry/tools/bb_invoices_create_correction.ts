// Werkzeug 21 von 61: `/invoices/invoice_correction/create`.
//
// Vorbild ist bb_invoices_create: derselbe Bereich `/invoices/`, dieselbe Wirkung anlegend
// und dieselbe Antwortform. Klasse B: Das Werkzeug legt ein neues, nummeriertes Dokument an
// und überschreibt nichts, trägt deshalb `destructiveHint: false` — die Warnung läuft über
// den Pflichtsatz U4 und den `title` im Freigabedialog.
//
// **Was eine Rechnungskorrektur fachlich ist:** Sie ist **keine Änderung** der Ursprungsrechnung
// und **kein Storno** von ihr, sondern eine **neue Ausgangsrechnung**. Sie übernimmt alle
// Daten der Ursprungsrechnung mit negierten Positionspreisen und setzt dem Positionsnamen
// das Präfix „Gutschrift“ vor. Sie trägt das aktuelle Datum, und ihr Anschreiben verweist auf
// die Ursprungsrechnung. Die Ursprungsrechnung selbst bleibt unverändert bestehen; beide
// Rechnungen laufen nebeneinander in der Buchhaltung.
//
// **Die Rechnungsnummer** vergibt BuchhaltungsButler ohne Angabe aus den Einstellungen des
// Nummernkreises des Mandanten; nur mit Angabe wird die eigene Nummer verwendet.
//
// **Die Nummernkreiseinstellung selbst kennt die API nicht.** Welche Nummer als nächste
// vergeben wird, ist aus der API nicht abfragbar.
//
// `verifyWith` trägt `{ kind: "none" }`: Die API führt unterhalb von `/invoices/` keinen
// lesenden Pfad, und `bb_receipts_get` liefert die **Ursprungsrechnung**, nicht die
// Korrektur; die Korrektur ist über die API nicht abrufbar. Nach einem Zeitlimit bleibt die
// Weboberfläche.
//
// **Nicht live verifiziert:** Der Endpunkt ist schreibend und wurde nicht gegen die echte API
// getestet; die Aufrufform folgt der Spezifikation.
//
// **Abweichung von `/invoices/create`:** Die Spezifikation nennt das Dateinamenfeld hier
// `filename`, bei `/invoices/create` dagegen `file_name`. Der Antwortvertrag übernimmt das
// so, wie es dasteht.

import { boundedText } from "../../schema/primitives.js";
import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const RECEIPT_DESCRIPTION =
  "Die mandantenbezogene Nummer der zu korrigierenden Ausgangsrechnung, zu finden mit " +
  "bb_receipts_search. Keine globale Kennung.";
const NUMBER_DESCRIPTION =
  "Rechnungsnummer der Korrektur aus einem eigenen Nummernkreis. Ohne Angabe vergibt " +
  "BuchhaltungsButler sie aus den Einstellungen des Nummernkreises.";

export const bb_invoices_create_correction: ToolEntry = {
  name: "bb_invoices_create_correction",
  title: "Rechnungskorrektur erzeugen",
  group: "invoices",
  path: { literal: "/invoices/invoice_correction/create" },
  effect: "create",
  toolClass: "B",
  tier: 2,
  description:
    "Erzeugt in BuchhaltungsButler eine Rechnungskorrektur zu einer bestehenden " +
    "Ausgangsrechnung. Die Korrektur ist eine neue Ausgangsrechnung: Sie übernimmt alle Daten " +
    "der Ursprungsrechnung mit negierten Positionspreisen und mit dem Präfix „Gutschrift“ vor " +
    "den Positionsnamen. Sie trägt das aktuelle Datum, und ihr Anschreiben verweist auf die " +
    "Ursprungsrechnung, die unverändert bleibt. Welche Rechnung korrigiert wird, sagt " +
    "receipt_id_by_customer, die Nummer findet bb_receipts_search. Ohne Rechnungsnummer " +
    "vergibt BuchhaltungsButler die nächste. Nicht rückgängig zu machen. Schreibt in die " +
    "echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das " +
    "rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    {
      name: "receipt_id_by_customer",
      apiNames: ["receipt_id_by_customer"],
      source: "body",
      required: true,
      description: RECEIPT_DESCRIPTION,
      schema: idByCustomer("der Ausgangsrechnung", "bb_receipts_search"),
    },
    {
      name: "invoicenumber",
      apiNames: ["invoicenumber"],
      source: "body",
      required: false,
      description: NUMBER_DESCRIPTION,
      schema: boundedText(NUMBER_DESCRIPTION),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt." }],
  // Die drei Felder stehen **auf oberster Ebene** des Umschlags und nicht unter `data`
  // (Spezifikation `InvoicesInvoiceCorrectionCreate_Success`); deshalb `container: "none"`.
  // Das Feld heißt hier `filename` und nicht `file_name` wie bei `/invoices/create`; die
  // Spezifikation führt es an beiden Pfaden verschieden, und der Vertrag gilt je Endpunkt.
  responseContract: {
    container: "none",
    fields: {
      id_by_customer: "id-string",
      invoicenumber: "string",
      filename: "string",
    },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "none",
    reason:
      "Die API führt unterhalb von /invoices/ keinen lesenden Pfad; eine erzeugte " +
      "Rechnungskorrektur ist über die API nicht abrufbar. In der Weboberfläche von " +
      "BuchhaltungsButler unter Rechnungsstellung nachsehen, ob die Korrektur vorliegt.",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
