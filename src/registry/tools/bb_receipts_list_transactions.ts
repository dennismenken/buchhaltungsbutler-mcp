// Werkzeug 3 von 54 (Plan 3.8): `/receipts/assigned-transactions/get`.
//
// Die Antwort trägt **Zahlungen**, nicht Belege: `id_by_customer` ist dort die Nummer der
// Zahlung und nicht die des angefragten Belegs. Wer beides verwechselt, ruft mit einer
// Zahlungsnummer erneut dieses Werkzeug auf und bekommt entweder nichts oder den falschen
// Beleg; deshalb sagt es die Beschreibung des Werkzeugs und die des Feldes ausdrücklich.
//
// Der Antwortvertrag ist **dokumentiert**, nicht gemessen: Gemessen wurden am 2026-09-12 nur
// die vier Endpunkte aus Plan 0.3. Die Feldmenge stammt aus `docs/api/belege.md` 10.2 und ist
// vom Vertragslauf (Plan 9.7, AP17) zu bestätigen. Dort ist auch vermerkt, dass
// `id_by_customer` an den Zahlungsendpunkten live als JSON-Zahl kommt (Befund L3); der Typ
// `id-string` führt beide Formen einheitlich zur Zeichenkette (Plan 7.4, Streitfrage S10).
//
// `concise` bleibt leer, und das ist kein Versäumnis: Der Endpunkt liefert sechs Felder, von
// denen keines entbehrlich ist. Eine Projektion, die fünf von sechs Feldern zeigt, spart
// nichts und verbirgt eines (Plan 7.4).

import { z } from "zod";

import { idByCustomer, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

/** Das serverseitige Feld der Projektion. Sein Text ist der des Bausteins (Plan 4.5). */
const RESPONSE_FORMAT_TEXT =
  "'concise' liefert nur die Felder, die einen Datensatz erkennbar machen und den nächsten " +
  "Schritt erlauben. 'detailed' liefert den Datensatz so, wie die BuchhaltungsButler-API ihn " +
  "ausgibt. Mit 'concise' beginnen und nur für die wenigen Datensätze auf 'detailed' wechseln, " +
  "die wirklich geprüft werden müssen. Dieses Feld ist serverseitig und geht nicht an die API.";

export const bb_receipts_list_transactions: ToolEntry = {
  name: "bb_receipts_list_transactions",
  title: "Zahlungen eines Belegs",
  path: { literal: "/receipts/assigned-transactions/get" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Listet die Zahlungen, die in BuchhaltungsButler einem bestimmten Beleg zugeordnet sind, " +
    "etwa um zu prüfen, ob eine Eingangsrechnung schon bezahlt wurde. Die umgekehrte Richtung " +
    "liefert bb_transactions_list_receipts, den Beleg selbst bb_receipts_get. Liefert keine " +
    "Belegfelder und keinen Zuordnungsstand: Ob eine Zuordnung bestätigt ist, zeigt erst der " +
    "Vergleich zweier Aufrufe mit confirmed_only true und false.",
  fields: [
    {
      name: "receipt_id_by_customer",
      apiNames: ["receipt_id_by_customer"],
      source: "body",
      required: true,
      description:
        "Die mandantenbezogene Nummer des Belegs, zu finden über bb_receipts_search. Keine " +
        "globale Kennung. In Suchergebnissen erscheint sie als String; hier ohne " +
        "Anführungszeichen übergeben. Die Antwort trägt dagegen die Nummern der Zahlungen.",
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    },
    {
      name: "confirmed_only",
      apiNames: ["confirmed_only"],
      source: "body",
      required: false,
      description:
        "Wenn true, liefert die API nur bestätigte Zuordnungen zwischen Beleg und Zahlung, also " +
        "solche, hinter denen eine bestätigte Buchung steht. Ohne Angabe kommen alle " +
        "Zuordnungen.",
      schema: z.boolean(),
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
  // Der Vertragslauf (AP17, Plan 9.7) hat diesen Vertrag am 2026-09-13 gegen die echte API
  // gehalten: kein neues, kein fehlendes und kein typverändertes Feld. Der Beleg dazu stammte
  // aus einer Buchung, die Beleg und Zahlung verbindet — ein Beleg ohne zugeordnete Zahlung
  // liefert hier eine leere Liste und bestätigte keinen einzigen Feldnamen.
  responseContract: {
    container: "data",
    // Sechs Felder je Zeile, Quelle docs/api/belege.md 10.2. Es sind die Felder einer Zahlung.
    fields: {
      id_by_customer: "id-string",
      to_from: "string",
      amount: "amount-string",
      booking_date: "string",
      value_date: "string",
      purpose: "null-or-string",
    },
    source: "dokumentiert",
  },
  shape: "list",
  concise: [],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
