// Werkzeug 29, `/postings/unconfirm/free`: entfernt eine einzelne, nicht festgeschriebene freie
// Buchung.
//
// **Dieses Werkzeug adressiert als einziges der drei `unconfirm`-Werkzeuge die Buchung selbst**
// und nicht ihr übergeordnetes Objekt. Der Parameter heißt deshalb `posting_id_by_customer` und
// nicht `receipt_id_by_customer` oder `transaction_id_by_customer`; diese Uneinheitlichkeit ist
// eine klassische Fehlerquelle (`buchungen.md` 18.6).
//
// **`error_code` 7 bedeutet hier etwas anderes als an den beiden Schwesterendpunkten:** hier
// „die Buchung ist keine freie Buchung", dort „es war nichts zu tun". Deshalb steht in der
// Beschreibung, woran sich eine freie Buchung erkennen lässt.
//
// Klasse D: `destructiveHint: true`, `idempotentHint: false` — eine wirkungslose Wiederholung
// ist plausibel, aber **nicht verifiziert**.

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
  "Die mandantenbezogene Nummer der freien Buchung, zu finden über bb_postings_search. Eine " +
  "freie Buchung erkennt man daran, dass receipt_id_by_customer und transaction_id_by_customer " +
  `beide null sind, oder am Filter account_filter mit dem Wert 'free booking'. ${ID_STRING_SENTENCE}`;

/** Werkzeug 29: `/postings/unconfirm/free`. */
export const bb_postings_unconfirm_free: ToolEntry = {
  name: "bb_postings_unconfirm_free",
  title: "Freie Buchung entfernen",
  group: "postings",
  path: { literal: "/postings/unconfirm/free" },
  effect: "delete",
  toolClass: "D",
  tier: 1,
  description:
    "Hebt in BuchhaltungsButler die Bestätigung einer einzelnen freien Buchung auf und " +
    "entfernt sie damit. Zu nehmen, um eine falsche freie Buchung zurückzunehmen, solange sie " +
    "nicht festgeschrieben ist; für die Buchungen eines Belegs ist " +
    "bb_postings_unconfirm_for_receipt zuständig, für die einer Zahlung " +
    "bb_postings_unconfirm_for_transaction. Adressiert wird die Buchung selbst, deshalb " +
    "posting_id_by_customer und nicht die Nummer eines Belegs. Zeigt der Wert auf eine Beleg- " +
    "oder Zahlungsbuchung, lehnt die API mit error_code 7 ab; ist die Buchung " +
    "festgeschrieben, hilft nur bb_postings_cancel. Entfernt Daten aus dem echten Mandanten " +
    "von BuchhaltungsButler: die genannte freie Buchung. Die betroffenen Datensätze vorher " +
    "lesen und dem Nutzer vorlegen.",
  mandatorySentence: "U6",
  fields: [
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
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` (buchungen.md 18.3).
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
      "date_from und date_to auf den Zeitraum der Buchung setzen und account_filter auf " +
      "'free booking' stellen; ist die Zeile mit id_by_customer {posting_id_by_customer} nicht " +
      "mehr zu sehen, hat der Aufruf gewirkt",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
