// Werkzeug 50 von 61: `/accounts/update`.
//
// Klasse M, also `destructiveHint: true` und `idempotentHint: true` (die Begründung steht
// bei `TOOL_CLASSES` in src/registry/classes.ts): Der Aufruf überschreibt Stammdaten, und
// kein Endpunkt der API liefert den Vorzustand zurück.
//
// **Drei Eigenheiten dieses Endpunkts:**
//
//  1. `postingaccount_number` ist hier eine **Ganzzahl** laut Spezifikation. Die Kontonummer
//     selbst lässt sich nicht ändern; einen Parameter für eine neue Nummer gibt es nicht.
//  2. **Die Spezifikation sagt ausdrücklich, dass nicht gesendete Felder ihren Wert
//     behalten.** Das ist der Unterschied zu bb_debtors_update, wo dieselbe Frage
//     undokumentiert ist und deshalb der vollständige Datensatz empfohlen wird. Hier ist die
//     Teilaktualisierung dokumentiert.
//  3. `is_revision_safe` lässt sich über die API **nicht** ändern. Der Endpunkt führt den
//     Parameter nicht; er bleibt, wie er ist.
//
// `invalidatesCache` nennt `bb_postingaccounts_search`: `/accounts/get` selbst wird nie
// zwischengespeichert, aber ein umbenanntes Zahlungskonto steht auch in der vereinigten
// Kontenliste von `/settings/get/postingaccounts` (type 'account').

import { z } from "zod";

import { boundedText, identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

const NUMBER_DESCRIPTION =
  "Kontonummer des zu ändernden Zahlungskontos als ganze Zahl, zum Beispiel 1000 für eine " +
  "Kasse. Sie ist der Identifikator und lässt sich nicht ändern. Nachschlagen mit " +
  "bb_payment_accounts_list.";
const NAME_DESCRIPTION = "Neuer Name des Zahlungskontos, zum Beispiel Kasse Ladengeschäft.";
const RECEIPT_DESCRIPTION =
  "true erzeugt zu jedem Beleg, der diesem Zahlungskonto zugeordnet wird, selbsttätig eine " +
  "Transaktion. Laut Spezifikation wirkt die Angabe nur bei manuell geführten Konten.";
const DISABLED_DESCRIPTION = "true blendet das Konto in der Auswahlliste der Zahlungskonten aus.";

export const bb_payment_accounts_update: ToolEntry = {
  name: "bb_payment_accounts_update",
  title: "Zahlungskonto ändern",
  group: "payment_accounts",
  path: { literal: "/accounts/update" },
  effect: "modify",
  toolClass: "M",
  tier: 2,
  description:
    "Ändert die Stammdaten eines Zahlungskontos in BuchhaltungsButler, etwa den Namen einer " +
    "Kasse. Angesprochen wird das Konto über postingaccount_number; die Nummer selbst " +
    "lässt sich nicht ändern. Felder, die nicht gesendet werden, behalten laut Spezifikation " +
    "ihren Wert. is_revision_safe lässt sich über die API nicht ändern. Vorher lesen mit " +
    "bb_payment_accounts_list. Überschreibt Stammdaten im echten Mandanten von " +
    "BuchhaltungsButler. Die API liefert die vorherigen Werte nicht zurück; ohne vorher " +
    "gelesenen Datensatz ist die Änderung nicht rückgängig zu machen.",
  mandatorySentence: "U5",
  fields: [
    {
      name: "postingaccount_number",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: NUMBER_DESCRIPTION,
      schema: identifierValue(NUMBER_DESCRIPTION),
    },
    {
      name: "name",
      apiNames: ["name"],
      source: "body",
      required: false,
      description: NAME_DESCRIPTION,
      schema: boundedText(NAME_DESCRIPTION),
    },
    {
      name: "receipt_creates_transaction",
      apiNames: ["receipt_creates_transaction"],
      source: "body",
      required: false,
      description: RECEIPT_DESCRIPTION,
      schema: z.boolean().describe(RECEIPT_DESCRIPTION),
    },
    {
      name: "is_disabled_in_select",
      apiNames: ["is_disabled_in_select"],
      source: "body",
      required: false,
      description: DISABLED_DESCRIPTION,
      schema: z.boolean().describe(DISABLED_DESCRIPTION),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt" }],
  // Kein `data`: Die Kontonummer steht auf oberster Ebene des Umschlags.
  responseContract: {
    container: "none",
    fields: { postingaccount_number: "id-string" },
    source: "dokumentiert",
  },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  // `bb_payment_accounts_list` nimmt überhaupt keinen Parameter an; `argsFrom` nennt deshalb
  // den gesuchten Wert und keinen Suchparameter.
  verifyWith: {
    kind: "tool",
    tool: "bb_payment_accounts_list",
    argsFrom: { postingaccount_number: "postingaccount_number" },
    hint: "in der vollständigen Kontenliste nach dieser Nummer suchen; der Endpunkt nimmt keinen Parameter an",
  },
  crossChecks: ["Q3"],
  // Leer: `/accounts/get` wird nie zwischengespeichert.
  invalidatesCache: ["bb_postingaccounts_search"],
};
