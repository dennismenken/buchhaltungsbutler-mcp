// Werkzeug 25, `/postings/add/free`: die freie Buchung, ein vollständiger Buchungssatz ohne
// Beleg- und Zahlungsbezug (Plan 3.8, 4.8, AP12c).
//
// **Dieses Werkzeug trägt ausdrücklich KEINE Positionsliste.** Der Endpunkt führt acht rein
// skalare Felder, alle im Singular: `date`, `postingtext`, `amount`, `postingaccount_debit`,
// `postingaccount_credit`, `vat`, `cost_location`, `cost_location_two`. Sie stehen eins zu
// eins im Schema. Der Aufruf legt genau **eine** Buchungszeile an; eine Splitbuchung über
// mehrere Zeilen nehmen bb_postings_create_for_receipt und bb_postings_create_for_transaction
// über ihre Positionsliste entgegen (Plan 4.8, Tabelle am Ende).
//
// **Es ist das einzige Buchungswerkzeug, an dem Soll und Haben ausdrücklich angegeben werden.**
// Bei Beleg- und Zahlungsbuchung kommt die Richtung aus dem Beleg beziehungsweise der Zahlung
// (`buchungen.md` 3.1 und 3.2). In der Leseantwort von `/postings/get` heißen dieselben Konten
// `debit_postingaccount_number` und `credit_postingaccount_number`; die Namen dieses
// Eingabeschemas stehen in keiner Antwort (Plan 7.4).
//
// **Q5 (Betrag ungleich 0.00) hängt hier ausdrücklich nicht.** Die Querprüfung gilt nach
// Plan 4.7 genau an den Werkzeugen 4, 5, 6, 12 und 13, weil die Spezifikation den Betrag 0 nur
// dort ausdrücklich für ungültig erklärt. Eine erfundene Schranke lehnte gültige Aufrufe
// unsichtbar vor dem Request ab (R4); dass negative Beträge abgelehnt werden, steht deshalb im
// Beschreibungstext von `amount` und nicht in einer Prüfung.
//
// Klasse B mit `destructiveHint: false`: Es entsteht eine neue Buchungszeile, nichts wird
// überschrieben. Die Warnung läuft über U3 und den `title` (Plan 3.3, 3.5).

import { amountValue, boundedText, unwrapSchema } from "../../schema/primitives.js";
import { costLocation, date, postingAccountNumber, vatKey } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt (Plan 4.5). */
function field(spec: {
  name: string;
  schema: FieldSpec["schema"];
  required?: boolean;
  description?: string;
}): FieldSpec {
  const described = unwrapSchema(spec.schema) ?? spec.schema;
  const description = spec.description ?? described.description;
  if (description === undefined || description.trim() === "") {
    throw new Error(`${spec.name}: weder Eintrag noch Schemabaustein trägt eine Beschreibung.`);
  }
  return {
    name: spec.name,
    apiNames: [spec.name],
    source: "body",
    required: spec.required ?? false,
    description,
    schema: spec.schema,
  };
}

const DATE_SCHEMA = date("Buchungsdatum der freien Buchung");

const DATE_DESCRIPTION =
  `${DATE_SCHEMA.description ?? ""} Die Parameterbeschreibung der Spezifikation nennt hier kein ` +
  "Format; YYYY-MM-DD ist aus dem Beispiel der Stapeldefinition abgeleitet.";

const AMOUNT_DESCRIPTION =
  "Betrag der Buchungszeile. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel 123.99. " +
  "Negative Beträge lehnt BuchhaltungsButler ab; eine Gegenbuchung entsteht durch Vertauschen " +
  "von postingaccount_debit und postingaccount_credit.";

const DEBIT_DESCRIPTION =
  "Sollkonto der Buchung als Sachkontonummer, zum Beispiel 4980. Nachschlagen mit " +
  "bb_postingaccounts_search. In der Leseantwort von bb_postings_search heißt dasselbe Konto " +
  "debit_postingaccount_number.";

const CREDIT_DESCRIPTION =
  "Habenkonto der Buchung als Sachkontonummer, zum Beispiel 1600. Muss sich vom Sollkonto " +
  "unterscheiden. Nachschlagen mit bb_postingaccounts_search. In der Leseantwort von " +
  "bb_postings_search heißt dasselbe Konto credit_postingaccount_number.";

/** Werkzeug 25: `/postings/add/free`. */
export const bb_postings_create_free: ToolEntry = {
  name: "bb_postings_create_free",
  title: "Freie Buchung anlegen",
  group: "postings",
  path: { literal: "/postings/add/free" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Legt in BuchhaltungsButler eine freie Buchung an, also einen vollständigen Buchungssatz " +
    "ohne Beleg- und Zahlungsbezug, etwa eine Umbuchung zwischen zwei Sachkonten. Zu nehmen, " +
    "wenn weder ein Beleg noch eine Zahlung vorliegt; liegt ein Beleg vor, ist " +
    "bb_postings_create_for_receipt richtig, liegt eine Zahlung vor, " +
    "bb_postings_create_for_transaction. Der Aufruf erzeugt genau eine Buchungszeile; eine " +
    "Splitbuchung über mehrere Zeilen nehmen die beiden genannten Werkzeuge über ihre " +
    "Positionsliste entgegen. Soll- und Habenkonto werden hier ausdrücklich angegeben. Die " +
    "Antwort nennt die erzeugte id_by_customer nicht. Schreibt in die echten " +
    "Buchhaltungsdaten von BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich nicht " +
    "löschen, sondern nur mit bb_postings_cancel stornieren; der Storno bleibt dauerhaft " +
    "sichtbar.",
  mandatorySentence: "U3",
  fields: [
    field({ name: "date", required: true, description: DATE_DESCRIPTION, schema: DATE_SCHEMA }),
    field({
      name: "postingtext",
      required: true,
      schema: boundedText("Buchungstext der Zeile, höchstens 128 Zeichen.", 128),
    }),
    // Als Betrag markiert: Nur darüber findet der Request-Mapper die Umwandlung in die
    // JSON-Zahl und Guard 5 die Betragsgrenze BB_MCP_MAX_AMOUNT (Plan 4.5).
    field({
      name: "amount",
      required: true,
      description: AMOUNT_DESCRIPTION,
      schema: amountValue(AMOUNT_DESCRIPTION),
    }),
    field({
      name: "postingaccount_debit",
      required: true,
      description: DEBIT_DESCRIPTION,
      schema: postingAccountNumber(),
    }),
    field({
      name: "postingaccount_credit",
      required: true,
      description: CREDIT_DESCRIPTION,
      schema: postingAccountNumber(),
    }),
    field({ name: "vat", required: true, schema: vatKey() }),
    field({ name: "cost_location", schema: costLocation() }),
    field({
      name: "cost_location_two",
      description:
        "Kostenstelle der zweiten Ebene, mandantenbezogen, nachschlagen mit " +
        "bb_cost_locations_search. Höchstens 10 Zeichen.",
      schema: costLocation(),
    }),
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` und ohne die erzeugte
  // id_by_customer (buchungen.md 14.3). Genau deshalb braucht die Weiterverwendung über
  // bb_postings_assign_receipt den Umweg über bb_postings_search.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "die Treffer mit postingaccount_filter auf {postingaccount_debit} eingrenzen; die " +
      "angelegte Zeile ist an postingtext {postingtext} und amount {amount} zu erkennen",
  },
  // Kein duplicateCheck: Ein fachlicher Schlüssel aus date, postingtext und amount ließe sich
  // zwar bilden, aber bb_postings_search nimmt keines dieser Felder als Filter an, und die
  // Nachschlage-Abfrage übergibt nur Felder, die das lesende Werkzeug führt. Ein Schlüssel,
  // der sich nicht abfragen lässt, wäre keiner (Plan 2.1, Guard 6).
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
