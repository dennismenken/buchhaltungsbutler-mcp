// Werkzeug 30, `/postings/assign/receipt-to-free-posting`: bindet einen vorhandenen Beleg an
// eine vorhandene freie Buchung.
//
// **Der Sonderfall innerhalb der Klasse B**: Es ist das einzige Werkzeug mit der
// Wirkung „ändernd", für das die API keinen Weg zurück anbietet — unterhalb von `/postings/`
// gibt es keinen `unassign`-Pfad, und genau das sagt der Pflichtsatz U4. Es bleibt trotzdem bei
// `destructiveHint: false`, weil es eine Bindung **herstellt** und keinen Wert überschreibt.
// Sobald eine Messung belegt, dass der Aufruf einen bestehenden Belegbezug ersetzt statt
// ihn nur zu ergänzen, ist die Annotation umzustellen.
//
// **Die Verwechslungsgefahr steckt in `posting_id_by_customer`:** `/postings/get` liefert alle
// Buchungsarten in derselben Liste mit demselben Feldnamen `id_by_customer`. Zeigt der Wert
// nicht auf eine freie Buchung, scheitert der Aufruf mit `error_code` 10, einem Sammelfehler
// ohne inhaltliche Begründung (`buchungen.md` 19.6). Deshalb nennt die Feldbeschreibung beide
// Erkennungswege.
//
// **Der Ablauf ist zweistufig und das ist eine Zumutung der API:** bb_postings_create_free
// liefert die erzeugte `id_by_customer` nicht zurück, sie ist erst über bb_postings_search zu
// finden (`buchungen.md` 14.3).

import { unwrapSchema } from "../../schema/primitives.js";
import { ID_STRING_SENTENCE, idByCustomer } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt. */
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

const POSTING_ID_DESCRIPTION =
  "Die mandantenbezogene Nummer der freien Buchung, an die der Beleg gebunden wird, zu finden " +
  "über bb_postings_search. Der Wert muss auf eine freie Buchung zeigen: Sie erkennt man daran, " +
  "dass receipt_id_by_customer und transaction_id_by_customer beide null sind, oder am Filter " +
  `account_filter mit dem Wert 'free booking'. ${ID_STRING_SENTENCE}`;

/** Werkzeug 30: `/postings/assign/receipt-to-free-posting`. */
export const bb_postings_assign_receipt: ToolEntry = {
  name: "bb_postings_assign_receipt",
  title: "Beleg an freie Buchung binden",
  group: "postings",
  path: { literal: "/postings/assign/receipt-to-free-posting" },
  effect: "modify",
  toolClass: "B",
  tier: 1,
  description:
    "Bindet in BuchhaltungsButler einen vorhandenen Beleg an eine vorhandene freie Buchung. Zu " +
    "nehmen, wenn eine freie Buchung nachträglich ihren Beleg bekommen soll, etwa weil " +
    "bb_postings_create_free ohne Belegbezug gebucht hat; die Zuordnung eines Belegs zu einer " +
    "Zahlung leistet stattdessen bb_transactions_assign_receipt. Ändert den Buchungssatz " +
    "nicht, sondern nur die Verknüpfung, und legt keine Buchung an. posting_id_by_customer " +
    "muss auf eine freie Buchung zeigen, sonst lehnt die API mit error_code 10 ab. Schreibt in " +
    "die echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das " +
    "rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    field({
      name: "receipt_id_by_customer",
      required: true,
      description:
        "Die mandantenbezogene Nummer des Belegs, der gebunden wird, zu finden über " +
        `bb_receipts_search. ${ID_STRING_SENTENCE}`,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    }),
    field({
      name: "posting_id_by_customer",
      required: true,
      description: POSTING_ID_DESCRIPTION,
      schema: idByCustomer("der Buchung", "bb_postings_search"),
    }),
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt.",
    },
  ],
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` (buchungen.md 19.3).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Der Zeitraum ist kein Argument dieses Werkzeugs; ohne Wert erscheint im Prüfaufruf
    // „(nicht gesendet)", und der hint sagt, woraus er zu bilden ist.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf den Zeitraum der freien Buchung setzen; trägt die Zeile mit " +
      "id_by_customer {posting_id_by_customer} danach receipt_id_by_customer " +
      "{receipt_id_by_customer}, hat der Aufruf gewirkt",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
