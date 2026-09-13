// Werkzeug 11, `/transactions/assigned-receipts/get`: die Belege einer Zahlung.
//
// Der Endpunkt liefert je zugeordnetem Beleg nur `id_by_customer` und `filename` und keine
// Beträge. Der Antwortvertrag ist deshalb `dokumentiert` und nicht `gemessen`: Er ist aus der
// Spezifikation übernommen und wird durch den Vertragslauf bestätigt oder berichtigt.
// Gemessen sind ausschließlich die vier Endpunkte.
//
// Die Kennung steht hier im BODY und nicht im Pfad: Dieser Endpunkt trägt den Parameter
// `transaction_id_by_customer` laut Spezifikation selbst und gehört nicht zu den vier
// Endpunkten mit Pfadvorlage.

import { z } from "zod";

import { idByCustomer, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const RESPONSE_FORMAT = responseFormat();
const TRANSACTION_ID = idByCustomer("der Zahlung", "bb_transactions_search");

const CONFIRMED_ONLY_DESCRIPTION =
  "Nur bestätigte Zuordnungen liefern. Ohne Angabe liefert die API auch unbestätigte; die " +
  "Vorgabe der Spezifikation ist 'false'.";

export const bb_transactions_list_receipts: ToolEntry = {
  name: "bb_transactions_list_receipts",
  title: "Belege einer Zahlung auflisten",
  group: "transactions",
  path: { literal: "/transactions/assigned-receipts/get" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Listet die Belege auf, die in BuchhaltungsButler einer bestimmten Zahlung zugeordnet " +
    "sind. Zu nehmen, um vor einer Buchung zu prüfen, ob eine Zahlung schon einen Beleg " +
    "trägt. Die Gegenrichtung, also die Zahlungen eines Belegs, liefert " +
    "bb_receipts_list_transactions. Geliefert werden je Beleg nur id_by_customer und " +
    "filename, keine Beträge; den Beleg selbst holt bb_receipts_get.",
  fields: [
    {
      name: "transaction_id_by_customer",
      apiNames: ["transaction_id_by_customer"],
      source: "body",
      required: true,
      description: TRANSACTION_ID.description ?? "",
      schema: TRANSACTION_ID,
    },
    {
      name: "confirmed_only",
      apiNames: ["confirmed_only"],
      source: "body",
      required: false,
      description: CONFIRMED_ONLY_DESCRIPTION,
      // Ohne .default(): Ein serverseitig gesetztes false wäre eine Angabe, die der Aufrufer
      // nicht gemacht hat. Fehlt das Feld, gilt die Vorgabe der API.
      schema: z.boolean().describe(CONFIRMED_ONLY_DESCRIPTION),
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
  // Der Vertragslauf hat diesen Vertrag am 2026-09-13 gegen die echte API
  // gehalten: kein neues, kein fehlendes und kein typverändertes Feld. Der Endpunkt liefert
  // tatsächlich nur diese beiden Felder und nicht den vollen Belegdatensatz — wer aus der
  // Zuordnung Betrag oder Gegenpartei ablesen will, braucht zusätzlich bb_receipts_get.
  responseContract: {
    container: "data",
    fields: {
      id_by_customer: "id-string",
      filename: "string",
    },
    source: "dokumentiert",
  },
  shape: "list",
  // Beide gelieferten Felder. Die Projektion ändert hier nichts und steht trotzdem, damit
  // response_format an diesem Werkzeug eine bestimmte Bedeutung hat.
  concise: ["id_by_customer", "filename"],
  bucket: "default",
  timeoutTier: "short",
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
