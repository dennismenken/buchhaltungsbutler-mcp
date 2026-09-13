// Werkzeug 21, `/postings/add/receipt`: Buchungssätze zu einem vorhandenen Beleg (Plan 3.8,
// 4.8, AP12c).
//
// Einer der **fünf** Endpunkte mit parallelen Arrays auf oberster Ebene (Plan 4.8). Das
// Werkzeug nimmt stattdessen eine Positionsliste `positions` mit sechs `apiNames`; die
// Umformung erzeugt `mapping/parallel-arrays.ts`, und der Deklarationssatz aus 4.8 steht
// wörtlich in der Feldbeschreibung. Damit ist die Längeninvariante der Arrays konstruktiv
// erfüllt und die Umformung deklariert statt verborgen (E1).
//
// **Es gibt keine Querprüfung „Summe der Positionsbeträge"** (Plan 4.7). Der Belegbetrag ist
// an diesem Endpunkt kein Argument; die Prüfung wäre nur mit einem zusätzlichen lesenden
// Aufruf möglich, und der widerspräche Regel 2 aus 7.5. Die API prüft die Summe selbst, und
// ihre Meldung steht im Fehlerkatalog.
//
// **`creditor` und `debtor` sind beide Pflicht.** Die Spezifikation führt beide als
// `required: true`, ihre eigenen Beschreibungen sagen dagegen „only required, if …"
// (`buchungen.md` 10.1). `required` darf gegenüber der Spezifikation verschärft, nie
// gelockert werden (Plan 4.3), deshalb bleiben beide Pflicht; der Widerspruch steht in ihren
// Beschreibungen, damit ein Agent die Ablehnung mit `error_code` 8 einordnen kann.
//
// Klasse B: Das Werkzeug legt neue Buchungszeilen an und überschreibt nichts, trägt deshalb
// `destructiveHint: false`. Die Warnung vor der Unumkehrbarkeit läuft über den Pflichtsatz U3
// und den `title` im Freigabedialog (Plan 3.3, 3.5).

import { isConfigLoaded } from "../../config/resolve.js";
import {
  API_MAX_BATCH,
  POSTINGS_RECEIPT_COLUMNS,
  batchLimit,
  declarationSentence,
  postingPositionItem,
  postingPositions,
} from "../../schema/line-items.js";
import { unwrapSchema } from "../../schema/primitives.js";
import { idByCustomer, postingAccountNumber } from "../../schema/vocab.js";
import type { FieldSpec, ToolEntry } from "../types.js";

/**
 * Die Mengengrenze der Positionsliste: `min(50, BB_MCP_MAX_BATCH)`, sobald die Konfiguration
 * aufgelöst ist (Plan 4.7 Q4, 4.8).
 *
 * Die Abfrage auf `isConfigLoaded()` ist kein Zierrat: Das Register wird auch ohne aufgelöste
 * Konfiguration geladen, nämlich von den dreizehn Registerprüfungen, und `batchLimit()` wirft
 * dann (Plan 6.4 Punkt 7). Ohne Konfiguration gilt deshalb das API-Maximum. Die **wirksame**
 * Grenze erzwingt ohnehin Q4 zur Laufzeit aus der eingefrorenen Konfiguration.
 */
const POSITION_LIMIT = isConfigLoaded() ? batchLimit() : API_MAX_BATCH;

/** Ein Feld aus einem Schemabaustein; die Beschreibung kommt aus dem Baustein, wenn der
 *  Eintrag keine eigene nennt. Das hält Schema und Registereintrag an einer Quelle (4.5). */
function field(spec: {
  name: string;
  schema: FieldSpec["schema"];
  required?: boolean;
  apiName?: string;
  description?: string;
}): FieldSpec {
  const described = unwrapSchema(spec.schema) ?? spec.schema;
  const description = spec.description ?? described.description;
  if (description === undefined || description.trim() === "") {
    throw new Error(`${spec.name}: weder Eintrag noch Schemabaustein trägt eine Beschreibung.`);
  }
  return {
    name: spec.name,
    apiNames: [spec.apiName ?? spec.name],
    source: "body",
    required: spec.required ?? false,
    description,
    schema: spec.schema,
  };
}

const POSITIONS_PURPOSE =
  "Die Buchungssätze zu diesem Beleg, je Eintrag eine Zeile. Mehrere Einträge ergeben eine " +
  "Splitbuchung; die Summe der Zeilenbeträge muss dem Belegbetrag entsprechen, sonst lehnt " +
  "BuchhaltungsButler den Aufruf ab.";

const POSITIONS_DESCRIPTION = `${POSITIONS_PURPOSE} ${declarationSentence(POSTINGS_RECEIPT_COLUMNS)}`;

const CONDITIONAL_PERSON_ACCOUNT_SENTENCE =
  "Die Spezifikation führt das Feld als Pflicht, seine eigene Beschreibung nennt es nur bei " +
  "passender Belegrichtung nötig; dieser Widerspruch ist nicht aufgelöst. Passt das Konto " +
  "nicht zur Belegrichtung, antwortet die API mit error_code 8.";

const position = postingPositionItem(false).shape;

/** Werkzeug 21: `/postings/add/receipt`. */
export const bb_postings_create_for_receipt: ToolEntry = {
  name: "bb_postings_create_for_receipt",
  title: "Buchungen zu Beleg anlegen",
  path: { literal: "/postings/add/receipt" },
  effect: "create",
  toolClass: "B",
  tier: 1,
  description:
    "Legt die Buchungssätze zu einem bereits vorhandenen Beleg in BuchhaltungsButler an. Zu " +
    "nehmen, wenn die id_by_customer eines Belegs vorliegt und dieser gebucht werden soll; " +
    "bb_postings_create_for_transaction, wenn stattdessen eine Zahlung der Ausgangspunkt " +
    "ist, und bb_postings_create_free, wenn weder Beleg noch Zahlung vorliegt. Buchungsdatum " +
    "und Buchungsrichtung kommen vom Beleg und sind keine Argumente. Setzt voraus, dass im " +
    "Mandanten die Kreditoren- oder Debitorenbuchung eingeschaltet ist. Die Antwort nennt " +
    "die erzeugten Buchungen nicht; nachsehen mit bb_postings_search. Schreibt in die echten " +
    "Buchhaltungsdaten von BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich " +
    "nicht löschen, sondern nur mit bb_postings_cancel stornieren; der Storno bleibt " +
    "dauerhaft sichtbar.",
  mandatorySentence: "U3",
  fields: [
    field({
      name: "receipt_id_by_customer",
      required: true,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    }),
    {
      name: "positions",
      apiNames: [
        "postingaccounts",
        "postingtexts",
        "vats",
        "cost_locations",
        "cost_locations_two",
        "amounts",
      ],
      source: "body",
      required: true,
      description: POSITIONS_DESCRIPTION,
      schema: postingPositions("receipt", {
        description: POSITIONS_PURPOSE,
        maxItems: POSITION_LIMIT,
      }),
      transform: "parallel-arrays",
      // Die `apiNames` der Positionsfelder zielen auf die parallelen Array-Parameter des
      // Endpunkts und nicht auf ein Body-Feld gleichen Namens (Plan 2.1, 4.8). Aus derselben
      // Liste leitet `mapping/parallel-arrays.ts` die Spalten der Umformung ab; eine zweite
      // Liste wäre die Stelle, an der die Längeninvariante später auseinanderfiele.
      itemFields: [
        field({
          name: "postingaccount",
          apiName: "postingaccounts",
          required: true,
          schema: position.postingaccount,
        }),
        field({
          name: "postingtext",
          apiName: "postingtexts",
          required: true,
          schema: position.postingtext,
        }),
        field({ name: "vat", apiName: "vats", required: true, schema: position.vat }),
        field({
          name: "cost_location",
          apiName: "cost_locations",
          schema: position.cost_location,
        }),
        field({
          name: "cost_location_two",
          apiName: "cost_locations_two",
          schema: position.cost_location_two,
        }),
        field({ name: "amount", apiName: "amounts", required: true, schema: position.amount }),
      ],
    },
    field({
      name: "creditor",
      required: true,
      description:
        "Kreditorenkonto als Gegenkonto, zum Beispiel 70001. Gilt für Eingangsrechnungen und " +
        `setzt die eingeschaltete Kreditorenbuchung voraus. ${CONDITIONAL_PERSON_ACCOUNT_SENTENCE} ` +
        "Kreditoren nachschlagen mit bb_creditors_search.",
      schema: postingAccountNumber(),
    }),
    field({
      name: "debtor",
      required: true,
      description:
        "Debitorenkonto als Gegenkonto, zum Beispiel 10001. Gilt für Ausgangsrechnungen und " +
        `setzt die eingeschaltete Debitorenbuchung voraus. ${CONDITIONAL_PERSON_ACCOUNT_SENTENCE} ` +
        "Debitoren nachschlagen mit bb_debtors_search.",
      schema: postingAccountNumber(),
    }),
  ],
  serverOnlyFields: [],
  omitted: [
    {
      apiName: "api_key",
      reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3, 1.4 Schritt 8).",
    },
  ],
  // Die Erfolgsantwort ist `{ "success": true, "message": "" }` ohne `data` und ohne die
  // erzeugten Kennungen (buchungen.md 10.3). Ein Vertrag mit Feldern gäbe es hier nicht zu
  // prüfen; die Auflösung der Schreibantwort speist sich deshalb allein aus den Argumenten
  // des Aufrufs (Plan 7.6).
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "tool",
    tool: "bb_postings_search",
    // Das Buchungsdatum kommt an diesem Endpunkt vom Beleg und ist kein Argument. Der
    // Prüfaufruf nennt das Pflichtpaar trotzdem, damit er vollständig dasteht; ohne Wert
    // erscheint dort „(nicht gesendet)" und nichts Erfundenes. Woraus der Zeitraum zu bilden
    // ist, sagt der hint.
    argsFrom: { date_from: "date", date_to: "date" },
    hint:
      "date_from und date_to auf das Belegdatum setzen, zusätzlich date_last_action_from auf " +
      "den heutigen Tag; die gesuchten Zeilen tragen receipt_id_by_customer " +
      "{receipt_id_by_customer}",
  },
  // Kein duplicateCheck: bb_postings_search nimmt weder receipt_id_by_customer noch einen
  // Buchungstext als Filter an und verlangt zugleich einen Zeitraum, den dieser Aufruf nicht
  // trägt. Ein Schlüssel, der sich nicht abfragen lässt, wäre keiner (Plan 2.1).
  crossChecks: ["Q3", "Q4"],
  invalidatesCache: [],
};
