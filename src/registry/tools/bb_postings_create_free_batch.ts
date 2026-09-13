// Werkzeug 26, `/postings/add-batch/free`: mehrere freie Buchungen in einem Aufruf (Plan 3.8,
// 4.8, AP12c).
//
// **Hier findet keinerlei Umformung statt.** Der Endpunkt führt genau einen Parameter
// `free_postings`, und der ist laut Definition `PostingsFree` **bereits** eine Objektliste aus
// denselben acht skalaren Feldern, die auch `/postings/add/free` führt. Der Behälter behält
// deshalb seinen API-Namen, und es gibt weder eine Positionsliste noch parallele Arrays
// (Plan 4.8, Tabelle am Ende; Anhang A: nicht umbenannt).
//
// **`PostingsFree` ist der einzige der acht Stapelbehälter, der seine Eigenschaften inline
// unter `.items` führt** statt über ein `$ref` auf eine eigene Elementdefinition (Plan 4.4
// Punkt 3).
//
// **Der zweite benannte Spezifikationsfehler aus Plan 0.5 sitzt hier:**
// `PostingsFree.items.required` nennt `amounts` im Plural, eine Eigenschaft dieses Namens gibt
// es nicht — sie heißt `amount`. Der Fehler betrifft `required` und nicht die
// Eigenschaftsmenge; im Schema ist `amount` Pflicht, weil der Betrag einer Buchung fachlich
// zweifellos Pflicht ist und der Einzelendpunkt ihn als solche führt.
//
// **Der Stapel ist nicht transaktional**: `success: true` auf oberster Ebene sagt nichts über
// die einzelnen Einträge; das Array `errors` nennt die gescheiterten (`buchungen.md` 15.3).

import { isConfigLoaded } from "../../config/resolve.js";
import { batchContainer } from "../../schema/batch.js";
import { API_MAX_BATCH, batchLimit } from "../../schema/line-items.js";
import { amountValue, boundedText, strictObject, unwrapSchema } from "../../schema/primitives.js";
import { costLocation, date, postingAccountNumber, vatKey } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Mengengrenze des Stapels: `min(50, BB_MCP_MAX_BATCH)`, sobald die Konfiguration aufgelöst
 *  ist; sonst das API-Maximum, weil das Register auch ohne sie geladen wird (Plan 4.7 Q4). */
const ITEM_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

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

const DATE_SCHEMA = date("Buchungsdatum dieser freien Buchung");

const DATE_DESCRIPTION = `${DATE_SCHEMA.description ?? ""} Das Beispiel der Definition PostingsFree zeigt dieses Format.`;

const AMOUNT_DESCRIPTION =
  "Betrag der Buchungszeile. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel 123.99. " +
  "Negative Beträge lehnt BuchhaltungsButler ab; eine Gegenbuchung entsteht durch Vertauschen " +
  "von postingaccount_debit und postingaccount_credit. Die Definition deklariert das Feld als " +
  "Zahl, der Einzelendpunkt als Zeichenkette; dieses Werkzeug nimmt die Zeichenkette und " +
  "wandelt sie am Rand um, damit kein Betrag über Gleitkomma läuft.";

const DEBIT_DESCRIPTION =
  "Sollkonto dieser Buchung als Sachkontonummer, zum Beispiel 4980. Nachschlagen mit " +
  "bb_postingaccounts_search.";

const CREDIT_DESCRIPTION =
  "Habenkonto dieser Buchung als Sachkontonummer, zum Beispiel 1600. Muss sich vom Sollkonto " +
  "unterscheiden. Nachschlagen mit bb_postingaccounts_search.";

const POSTINGTEXT_SCHEMA = boundedText("Buchungstext der Zeile, höchstens 128 Zeichen.", 128);
const COST_LOCATION_SCHEMA = costLocation();

const COST_LOCATION_TWO_DESCRIPTION =
  "Kostenstelle der zweiten Ebene, mandantenbezogen, nachschlagen mit " +
  "bb_cost_locations_search. Höchstens 10 Zeichen.";

/** Ein Stapelelement, genau nach den acht Eigenschaften von `PostingsFree.items`. */
const FREE_POSTING_ITEM = strictObject({
  date: DATE_SCHEMA.describe(DATE_DESCRIPTION),
  postingtext: POSTINGTEXT_SCHEMA,
  amount: amountValue(AMOUNT_DESCRIPTION),
  postingaccount_debit: postingAccountNumber().describe(DEBIT_DESCRIPTION),
  postingaccount_credit: postingAccountNumber().describe(CREDIT_DESCRIPTION),
  vat: vatKey(),
  cost_location: COST_LOCATION_SCHEMA.optional(),
  cost_location_two: costLocation().describe(COST_LOCATION_TWO_DESCRIPTION).optional(),
});

const FREE_POSTINGS_PURPOSE =
  "Die freien Buchungen, je Eintrag genau eine Buchungszeile. Der Body-Parameter der API heißt " +
  "ebenfalls free_postings und ist bereits eine Objektliste; umgeformt wird nichts.";

const FREE_POSTINGS_CONTAINER = batchContainer("bb_postings_create_free_batch", FREE_POSTING_ITEM, {
  description: FREE_POSTINGS_PURPOSE,
  maxItems: ITEM_LIMIT,
});

/** Werkzeug 26: `/postings/add-batch/free`. */
export const bb_postings_create_free_batch: ToolEntry = {
  name: "bb_postings_create_free_batch",
  title: "Freie Buchungen anlegen",
  path: { literal: "/postings/add-batch/free" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Legt in BuchhaltungsButler mehrere freie Buchungen in einem Aufruf an, also vollständige " +
    "Buchungssätze ohne Beleg- und Zahlungsbezug. Zu nehmen, wenn viele Umbuchungen auf " +
    "einmal anfallen, etwa Abgrenzungen zum Jahreswechsel; für eine einzelne " +
    "bb_postings_create_free. Jeder Eintrag erzeugt genau eine Buchungszeile, eine Klammer " +
    "über mehrere Zeilen gibt es nicht. Der Stapel ist nicht transaktional: success auf " +
    "oberster Ebene sagt nichts über die einzelnen Einträge, das Array errors der Antwort " +
    "nennt die gescheiterten. Schreibt in die echten Buchhaltungsdaten von " +
    "BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich nicht löschen, sondern nur " +
    "mit bb_postings_cancel stornieren; der Storno bleibt dauerhaft sichtbar.",
  mandatorySentence: "U3",
  fields: [
    {
      name: "free_postings",
      apiNames: ["free_postings"],
      source: "body",
      required: true,
      description: FREE_POSTINGS_CONTAINER.description ?? FREE_POSTINGS_PURPOSE,
      schema: FREE_POSTINGS_CONTAINER,
      transform: "object-list",
      itemFields: [
        field({ name: "date", required: true, description: DATE_DESCRIPTION, schema: DATE_SCHEMA }),
        field({ name: "postingtext", required: true, schema: POSTINGTEXT_SCHEMA }),
        // Pflicht, obwohl `required` der Definition den Plural `amounts` nennt: Die
        // Eigenschaft heißt `amount`, der Plural zeigt ins Leere (Spezifikationsfehler aus
        // Plan 0.5, zweiter SPEC_BUGS-Eintrag).
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
        field({ name: "cost_location", schema: COST_LOCATION_SCHEMA }),
        field({
          name: "cost_location_two",
          description: COST_LOCATION_TWO_DESCRIPTION,
          schema: costLocation(),
        }),
      ],
    },
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Erfolgsantwort mit den Arrays `free_postings` und `errors` und ohne `message`
  // (buchungen.md 15.3). ContractFieldType kennt keinen Typ für ein Objekt oder ein Array;
  // ein erfundener Typ erzeugte bei jedem erfolgreichen Aufruf Vertragswarnungen, mit leerem
  // Vertrag laufen beide Felder als unbekannt unverändert durch (Plan 7.3).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "batch",
  timeoutTier: "long",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Die Buchungsdaten stehen je Eintrag in free_postings und nicht auf oberster Ebene; ohne
    // Wert erscheint im Prüfaufruf „(nicht gesendet)". Der hint sagt, woraus der Zeitraum
    // entsteht.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf den Zeitraum der gesendeten Buchungsdaten setzen und die " +
      "Treffer mit account_filter auf 'free booking' eingrenzen; jede angelegte Zeile ist an " +
      "ihrem postingtext und ihrem amount zu erkennen",
  },
  // Kein duplicateCheck: bb_postings_search nimmt weder postingtext noch amount als Filter an
  // und verlangt einen Zeitraum, den dieser Aufruf nicht auf oberster Ebene trägt (Plan 2.1).
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
