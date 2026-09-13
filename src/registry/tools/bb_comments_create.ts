// Werkzeug 45 von 54: `/comments/add` (Plan 3.8, Arbeitspaket AP12d).
//
// **Einer von vier Endpunkten ohne lesendes Gegenstück** (Plan 2.1, 5.7). `verifyWith` trägt
// deshalb `{ kind: "none", … }`: Die API kennt keinen Endpunkt, der Kommentare liest, ändert
// oder löscht, und die Antwort nennt nicht einmal eine Kennung des angelegten Kommentars.
// Nach einem Zeitlimit bleibt nur die Weboberfläche.
//
// **Die Entweder-oder-Regel setzt die Querprüfung Q9 durch** (Plan 4.7). Die Spezifikation
// schreibt wörtlich, es sei entweder `transaction_id_by_customer` oder
// `receipt_id_by_customer` zu senden; belegt ist das durch zwei eigene Fehlercodes, Code 8
// ohne eine der beiden Kennungen und Code 7 mit beiden. Beide Felder sind für sich optional,
// ein JSON Schema kann die Regel also nicht ausdrücken. Sie steht deshalb in der
// Werkzeugbeschreibung und in beiden Feldbeschreibungen **und** wird von Q9 vor dem Request
// geprüft: Ohne diese Prüfung ginge als einziger Fall dieses Servers ein schreibender Request
// gegen die echte Buchhaltung hinaus, von dem vorher feststeht, dass er scheitert.

import { z } from "zod";

import { idByCustomer } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const TEXT_DESCRIPTION =
  "Der Kommentartext, 2 bis 210 Zeichen. Für alle Nutzer des Mandanten sichtbar und über " +
  "die API weder änderbar noch löschbar.";
const EITHER_OR =
  "Genau eine der beiden Kennungen receipt_id_by_customer und transaction_id_by_customer " +
  "angeben; die API lehnt den Aufruf sonst ab.";

export const bb_comments_create: ToolEntry = {
  name: "bb_comments_create",
  title: "Kommentar anhängen",
  path: { literal: "/comments/add" },
  effect: "create",
  toolClass: "A",
  tier: 2,
  description:
    "Hängt einen Kommentar an einen Beleg oder an eine Zahlung in BuchhaltungsButler. " +
    "Gedacht für einen Hinweis an die Buchhaltung, etwa warum ein Beleg noch offen ist. " +
    "Genau eine der beiden Kennungen receipt_id_by_customer und transaction_id_by_customer " +
    "angeben; die API lehnt den Aufruf sonst ab. Der Kommentar ist für alle Nutzer des " +
    "Mandanten sichtbar. Die API kennt keinen Endpunkt, Kommentare zu lesen, zu ändern oder " +
    "zu entfernen, und die Antwort nennt auch keine Kennung des angelegten Kommentars. " +
    "Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen " +
    "Endpunkt, das rückgängig zu machen.",
  mandatorySentence: "U4",
  fields: [
    {
      name: "comment_text",
      apiNames: ["comment_text"],
      source: "body",
      required: true,
      description: TEXT_DESCRIPTION,
      schema: z
        .string()
        .min(2, { error: "mindestens 2 Zeichen" })
        .max(210, { error: "höchstens 210 Zeichen" })
        .describe(TEXT_DESCRIPTION),
    },
    {
      name: "transaction_id_by_customer",
      apiNames: ["transaction_id_by_customer"],
      source: "body",
      required: false,
      description: `${idByCustomer("der Zahlung", "bb_transactions_search").description ?? ""} ${EITHER_OR}`,
      schema: idByCustomer("der Zahlung", "bb_transactions_search"),
    },
    {
      name: "receipt_id_by_customer",
      apiNames: ["receipt_id_by_customer"],
      source: "body",
      required: false,
      description: `${idByCustomer("des Belegs", "bb_receipts_search").description ?? ""} ${EITHER_OR}`,
      schema: idByCustomer("des Belegs", "bb_receipts_search"),
    },
  ],
  serverOnlyFields: [],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt (Plan 4.3)" }],
  // Die Antwort trägt ausschließlich `success` und `message`: kein `data`, kein `rows`, keine
  // Kennung. Der Aufrufer kann nicht feststellen, welcher Kommentar entstanden ist.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "normal",
  verifyWith: {
    kind: "none",
    reason:
      "Die API kennt keinen Endpunkt, der Kommentare liest; die Antwort nennt auch keine " +
      "Kennung des angelegten Kommentars.",
  },
  crossChecks: ["Q3", "Q9"],
  invalidatesCache: [],
};
