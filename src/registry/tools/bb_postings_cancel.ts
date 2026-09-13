// Werkzeug 31, `/postings/cancel`: storniert eine einzelne Buchungszeile.
//
// **Zwei völlig verschiedene Wirkungen hinter einem Aufruf**, gesteuert allein durch `fixed`:
// War die Buchung festgeschrieben, entsteht eine dauerhaft sichtbare Stornobuchung; war sie es
// nicht, verschwindet sie. Der Aufrufer hat keinen Schalter, um eine der beiden Wirkungen zu
// erzwingen, und **die Antwort unterscheidet sie nicht** (`buchungen.md` 20.3 und 20.6). Wer
// wissen will, was geschehen ist, liest `fixed` vorher und prüft hinterher erneut.
//
// **`idempotentHint: false`** kommt aus der Klasse D und ist hier keine Vorsicht auf
// Vorrat: Eine Stornobuchung lässt sich nicht erneut stornieren, die API antwortet dann mit
// `error_code` 8. Ein `true` lüde einen Host zum automatischen Wiederholen ein, und die
// Wiederholung träfe einen anderen Zustand als der erste Aufruf.
//
// **Die Codes 8 und 9 unterscheiden sich im Englischen nur durch ein Wort** („cannot" gegen
// „could not") und bedeuten Verschiedenes: 8 ist eine fachliche Ablehnung, 9 ein technisches
// Scheitern. Nur bei 9 ist eine Wiederholung sinnvoll; die Unterscheidung leistet der
// Fehlerkatalog und nicht dieser Eintrag.

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
  "Die mandantenbezogene Nummer der zu stornierenden Buchungszeile, zu finden über " +
  "bb_postings_search. Das Feld fixed derselben Zeile sagt vorher, welche der beiden Wirkungen " +
  `eintritt: Storno bei '1', ersatzloses Entfernen bei '0'. ${ID_STRING_SENTENCE}`;

/** Werkzeug 31: `/postings/cancel`. */
export const bb_postings_cancel: ToolEntry = {
  name: "bb_postings_cancel",
  title: "Buchung stornieren",
  group: "postings",
  path: { literal: "/postings/cancel" },
  effect: "delete",
  toolClass: "D",
  tier: 1,
  description:
    "Storniert in BuchhaltungsButler eine einzelne Buchungszeile. Zu nehmen, wenn eine " +
    "festgeschriebene Buchung zu korrigieren ist; eine nicht festgeschriebene entfernen " +
    "bb_postings_unconfirm_for_receipt, bb_postings_unconfirm_for_transaction und " +
    "bb_postings_unconfirm_free rückstandslos. War die Buchung festgeschrieben, entsteht eine " +
    "dauerhaft sichtbare Stornobuchung, sonst verschwindet sie; die Antwort unterscheidet " +
    "beides nicht, deshalb vorher fixed mit bb_postings_search lesen. Storniert genau eine " +
    "Zeile: eine Splitbuchung mit fünf Zeilen braucht fünf Aufrufe, und ein Zwischenstand ist " +
    "ein unausgeglichener Buchungsstand. Entfernt Daten aus dem echten Mandanten von " +
    "BuchhaltungsButler: die genannte Buchungszeile. Die betroffenen Datensätze vorher lesen " +
    "und dem Nutzer vorlegen.",
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
  // Erfolgsantwort `{ "success": true, "message": "" }`, ohne `data` und ohne Angabe darüber,
  // ob storniert oder entfernt wurde (buchungen.md 20.3).
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
      "date_from und date_to auf den Zeitraum der Buchung setzen; ist die Zeile mit " +
      "id_by_customer {posting_id_by_customer} verschwunden oder steht ihr eine Stornobuchung " +
      "gegenüber, hat der Aufruf gewirkt. Nicht blind wiederholen: Eine Stornobuchung lässt " +
      "sich nicht erneut stornieren",
  },
  crossChecks: ["Q3"],
  invalidatesCache: [],
};
