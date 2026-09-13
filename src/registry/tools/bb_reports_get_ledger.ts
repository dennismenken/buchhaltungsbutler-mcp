// Werkzeug 52: `/reports/get/sums/ledger`, das Kontenblatt eines Sachkontos.
//
// Der Endpunkt liegt unterhalb von `/reports/get/sums/`, gehört aber **nicht** zum
// zweistufigen Muster aus Erzeugen und Abholen: Die Spezifikation sagt ausdrücklich „the
// ledger is created on the fly", und live bestätigt ist ein Abruf ohne jeden zuvor erzeugten
// Bericht (berichte.md 2.1 und 8.8 Punkt 1). Er ist damit das einzige Berichtswerkzeug, das
// bei aktivem `BB_MCP_READ_ONLY` vollständig nutzbar bleibt.
//
// **Q1 trägt dieses Werkzeug sehr wohl**: `date_from` und `date_to` sind hier
// eigene Pflichtparameter, anders als bei `bb_reports_get_bwa` und `bb_reports_get_sums`.
//
// Zeitlimitstufe `long` wie alle fünf Berichtswerkzeuge: Die Spezifikation warnt,
// dass ein stark bebuchtes Konto „may take a while" braucht. Paginierung gibt es nicht.
//
// **Der Antwortvertrag bleibt leer, und das ist ein Befund:** Die Nutzdaten stehen im
// untypisierten Objekt `report_sums_postingaccount_ledger`, und `ContractFieldType`
// kennt keinen Typ für ein Objekt. So läuft das Feld als unbekannt unverändert
// durch, statt bei jedem Aufruf eine `_contract_warnings`-Zeile zu
// erzeugen.

import { z } from "zod";

import { dateValue, identifierValue } from "../../schema/primitives.js";
import { EMPTY_STRING_SENTENCE, responseFormat } from "../../schema/vocab.js";
import type { ToolEntry } from "../types.js";

const POSTINGACCOUNT_DESCRIPTION =
  "Nummer des Sachkontos, dessen Kontenblatt geliefert wird, zum Beispiel 4920, als ganze " +
  "Zahl ohne Anführungszeichen. Nachschlagen mit bb_postingaccounts_search. Zu einem Konto, " +
  "das es nicht gibt, antwortet die API mit error_code 16.";

const DATE_FROM_DESCRIPTION =
  `Erster Tag des Zeitraums als YYYY-MM-DD, zum Beispiel 2026-01-01. ${EMPTY_STRING_SENTENCE} ` +
  "Der Zeitraum schließt diesen Tag ein.";

const DATE_TO_DESCRIPTION =
  `Letzter Tag des Zeitraums als YYYY-MM-DD, zum Beispiel 2026-03-31. ${EMPTY_STRING_SENTENCE} ` +
  "Der Zeitraum schließt diesen Tag ein.";

const BASE_DESCRIPTION =
  "Datum der Periodenzuordnung: 'date' Buchungsdatum, 'date_delivery_else_date' " +
  "Leistungsdatum und ersatzweise Buchungsdatum. Ohne Angabe 'date'. Mit dem zweiten Wert " +
  "können Buchungen außerhalb des Rechnungsdatums erscheinen; nicht verifiziert.";

/** Werkzeug 52: `/reports/get/sums/ledger`. */
export const bb_reports_get_ledger: ToolEntry = {
  name: "bb_reports_get_ledger",
  title: "Kontenblatt abrufen",
  group: "reports",
  path: { literal: "/reports/get/sums/ledger" },
  effect: "read",
  toolClass: "R",
  tier: 3,
  description:
    "Liefert das Kontenblatt eines Sachkontos aus BuchhaltungsButler für einen Zeitraum, also " +
    "dessen Buchungen mit laufendem Saldo. Anders als bb_reports_get_bwa und " +
    "bb_reports_get_sums braucht es keinen Erzeugungsschritt und bleibt auch bei aktivem " +
    "BB_MCP_READ_ONLY nutzbar. Weder limit noch offset: Ein stark bebuchtes Konto liefert " +
    "alles auf einmal, lange Zeiträume also in Monatsfenster zerlegen. Ein leeres " +
    "Kontenblatt ist kein Fehler, sondern ein Konto ohne Buchung.",
  fields: [
    {
      name: "postingaccount_number",
      apiNames: ["postingaccount_number"],
      source: "body",
      required: true,
      description: POSTINGACCOUNT_DESCRIPTION,
      schema: identifierValue(POSTINGACCOUNT_DESCRIPTION),
    },
    {
      name: "date_from",
      apiNames: ["date_from"],
      source: "body",
      required: true,
      description: DATE_FROM_DESCRIPTION,
      schema: dateValue(DATE_FROM_DESCRIPTION),
    },
    {
      name: "date_to",
      apiNames: ["date_to"],
      source: "body",
      required: true,
      description: DATE_TO_DESCRIPTION,
      schema: dateValue(DATE_TO_DESCRIPTION),
    },
    {
      name: "base",
      apiNames: ["base"],
      source: "body",
      required: false,
      description: BASE_DESCRIPTION,
      schema: z.enum(["date", "date_delivery_else_date"]).describe(BASE_DESCRIPTION),
    },
    {
      name: "response_format",
      apiNames: [],
      source: "server",
      required: false,
      description: responseFormat().description ?? "",
      schema: responseFormat(),
    },
  ],
  serverOnlyFields: ["response_format"],
  omitted: [{ apiName: "api_key", reason: "Zugangsdatum, wird vom Server gesetzt." }],
  // Das Wrapper-Feld heißt `report_sums_postingaccount_ledger` und folgt weder dem
  // `data`-Muster der Listen noch dem `report`-Muster der beiden anderen Abholwerkzeuge
  // (berichte.md 8.8 Punkt 3); es steht auf oberster Ebene des Umschlags.
  // Der Vertragslauf kann diesen Endpunkt aufrufen — er ist der einzige der
  // drei Abholwerkzeuge ohne schreibende Vorbedingung —, hat es am 2026-09-13 aber nicht getan:
  // Der Lauf war auf acht Aufrufe begrenzt, und die gingen an die acht Endpunkte mit einem
  // nicht leeren Antwortvertrag. Hier ist nichts nachzutragen, weil `fields` leer ist und
  // `ContractFieldType` für ein untypisiertes Wrapper-Objekt keinen Typ kennt. Der Eintrag
  // steht im Ablaufplan von `scripts/contract-read.ts` und läuft beim nächsten vollen
  // Durchgang mit.
  responseContract: { container: "none", fields: {}, source: "dokumentiert" },
  shape: "ack",
  concise: [],
  bucket: "default",
  timeoutTier: "long",
  crossChecks: ["Q1", "Q3"],
  invalidatesCache: [],
};
