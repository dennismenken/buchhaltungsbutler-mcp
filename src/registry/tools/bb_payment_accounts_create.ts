// Werkzeug 44 von 54: `/accounts/add` (Plan 3.8, Arbeitspaket AP12d).
//
// **Umbenennung nach Anhang A:** Der Parameter `type` heißt im Werkzeugschema
// `payment_account_type`. `type` ist in der Spezifikation siebenfach mit unterschiedlicher
// Bedeutung belegt; ein Feld dieses Namens sagt dem Aufrufer nichts.
//
// **Der Wertevorrat ist hier ein echtes Enum** (Plan 4.3): 'cash', 'bank/institution' und
// 'other' sind abzählbar, mandantenunabhängig und in der Parameterbeschreibung der
// Spezifikation wörtlich aufgezählt. Mandantendaten wie die Kontonummer sind dagegen nie ein
// Enum, sondern tragen den Verweis auf das Nachschlagewerkzeug.
//
// **`is_revision_safe` ist die folgenreichste Angabe dieses Aufrufs** und laut Spezifikation
// dauerhaft: Bei einer Kasse bedeutet sie, dass gespeicherte Zahlungen nur noch über eine
// Stornozahlung verschwinden. Die Spezifikation schreibt ausdrücklich, dass die Angabe nur
// bei Kassen wirkt.
//
// **`invalidatesCache` ist leer, und das ist eine Vorgabe des Plans** (7.8, AP12d):
// `/accounts/get` wird nie zwischengespeichert, deshalb gibt es dort nichts zu verwerfen.
// Zu bedenken bleibt, dass ein neues Zahlungskonto auch in der vereinigten Kontenliste von
// `/settings/get/postingaccounts` erscheint (dort als type 'account'); der Plan führt diesen
// Fall in der Invalidierungstabelle nicht, und er wird hier nicht eigenmächtig ergänzt.

import { z } from "zod";

import { boundedText, identifierValue } from "../../schema/primitives.js";
import type { ToolEntry } from "../types.js";

/** Die drei Kontoarten, wörtlich aus der Parameterbeschreibung der Spezifikation. */
const PAYMENT_ACCOUNT_TYPES = ["cash", "bank/institution", "other"] as const;

const TYPE_DESCRIPTION =
  "Art des Zahlungskontos: 'cash' für eine Kasse, 'bank/institution' für ein Bank- oder " +
  "Geldinstitutskonto, 'other' für alles Übrige, etwa eine Kreditkarte. Der API-Parameter " +
  "heißt type.";
const NAME_DESCRIPTION = "Bezeichnung des Zahlungskontos, zum Beispiel Kasse Ladengeschäft.";
const NUMBER_DESCRIPTION =
  "Sachkontonummer des neuen Zahlungskontos als ganze Zahl, zum Beispiel 1000 für eine " +
  "Kasse. Welche Nummern der Mandant schon belegt, zeigt bb_payment_accounts_list.";
const RECEIPT_DESCRIPTION =
  "true legt zu jedem Beleg, der diesem Zahlungskonto zugeordnet wird, selbsttätig eine " +
  "Zahlung an.";
const REVISION_DESCRIPTION =
  "true macht eine Kasse revisionssicher: Gespeicherte Zahlungen verschwinden dann nur noch " +
  "über eine Stornozahlung. Laut Spezifikation wirkt die Angabe nur bei 'cash' und legt " +
  "dauerhaftes Verhalten fest.";

export const bb_payment_accounts_create: ToolEntry = {
  name: "bb_payment_accounts_create",
  title: "Zahlungskonto anlegen",
  path: { literal: "/accounts/add" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description:
    "Legt ein manuell geführtes Zahlungskonto in BuchhaltungsButler an, etwa eine Kasse oder " +
    "ein Kreditkartenkonto. Gedacht für ein Konto ohne Bankanbindung. Die " +
    "postingaccount_number muss zur gewählten Art passen; die bestehenden Konten und ihre " +
    "Nummern zeigt bb_payment_accounts_list. Ein Aufwands- oder Ertragskonto ist kein " +
    "Zahlungskonto und gehört zu bb_postingaccounts_create. is_revision_safe wirkt nur bei " +
    "einer Kasse und legt dauerhaftes Verhalten fest. Schreibt in die echten " +
    "Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das " +
    "rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    {
      name: "payment_account_type",
      apiNames: ["type"],
      source: "body",
      required: true,
      description: TYPE_DESCRIPTION,
      schema: z.enum(PAYMENT_ACCOUNT_TYPES).describe(TYPE_DESCRIPTION),
    },
    {
      name: "name",
      apiNames: ["name"],
      source: "body",
      required: true,
      description: NAME_DESCRIPTION,
      schema: boundedText(NAME_DESCRIPTION),
    },
    {
      name: "postingaccount_number",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: NUMBER_DESCRIPTION,
      schema: identifierValue(NUMBER_DESCRIPTION),
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
      name: "is_revision_safe",
      apiNames: ["is_revision_safe"],
      source: "body",
      required: false,
      description: REVISION_DESCRIPTION,
      schema: z.boolean().describe(REVISION_DESCRIPTION),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
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
  duplicateCheck: {
    tool: "bb_payment_accounts_list",
    keyFields: ["postingaccount_number"],
    perBatch: true,
  },
  crossChecks: ["Q3"],
  // Leer nach Plan 7.8: `/accounts/get` wird nie zwischengespeichert.
  invalidatesCache: [],
};
