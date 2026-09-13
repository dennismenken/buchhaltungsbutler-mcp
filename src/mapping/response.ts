// Der Antwortvertrag, angewandt **je Endpunkt**, plus Normalisierung und
// die beiden Projektionen `concise` und `detailed`.
//
// Warum je Endpunkt und nicht je Fachobjekt — gemessen, nicht gemeint:
// `/receipts/get` liefert 16 Felder mit `delivery_date` und `due_date`, `/receipts/get/<id>`
// liefert 23 Felder mit `date_delivery` und `date_payment_due`; `/transactions/get` liefert 6
// Felder, der Einzelabruf 13; und dieselbe Kennung ist bei `receipts` ein String und bei
// `transactions` eine Zahl. Wer daraus einen gemeinsamen `Receipt`-Typ baut, erzeugt ein
// `due_date`, das beim Einzelabruf immer leer aussieht — in einer Buchhaltung der Unterschied
// zwischen einer richtigen und einer falschen Mahnliste.
//
// Dieses Modul ist zugleich der einzige Leser des Stammdatenspeichers im Ausführungspfad: Es
// löst Kontonummern in sprechende Bezeichnungen auf, **sofern** der Kontenrahmen im Speicher
// liegt. Die Rohnummer bleibt dabei stehen, weil sie der
// Parameterwert des nächsten Aufrufs ist.

import { getMasterDataStore, POSTINGACCOUNTS_TOOL, type MasterDataStore } from "../cache/store.js";
import type { EnvelopeWarning, SuccessEnvelope } from "../http/envelope.js";
import { logOnce, logWarn } from "../logging/stderr.js";
import type { ToolEntry } from "../registry/types.js";
import { coerceRecord, centsFieldName } from "./coerce.js";
import {
  aggregateWarnings,
  contractWarningLogLine,
  type AggregatedWarning,
  type ContractWarning,
} from "./contract-violation.js";
import { specPathOf } from "./path.js";

/** Die beiden Projektionen. Vorgabe ist `concise`. */
export type Projection = "concise" | "detailed";

/** Das rein serverseitige Feld, das die Projektion wählt. Es geht nie an die API. */
export const RESPONSE_FORMAT_FIELD = "response_format";

export const DEFAULT_PROJECTION: Projection = "concise";

/**
 * Die Felder, zu denen eine sprechende Kontobezeichnung ergänzt wird, und der Name des
 * ergänzten Feldes.
 *
 * Bewusst nur diese drei: Sie tragen nachweislich eine Sachkontonummer. `account` bleibt
 * außen vor, weil derselbe Name je Endpunkt Verschiedenes bedeutet — an `/postings/get` eine
 * kommagetrennte Filterliste, an `/transactions/get` ein Zahlungskonto.
 * Eine Auflösung, die an einer Stelle richtig und an einer anderen falsch wäre, unterbleibt.
 */
export const ACCOUNT_LABEL_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  postingaccount_number: "postingaccount",
  debit_postingaccount_number: "debit_postingaccount",
  credit_postingaccount_number: "credit_postingaccount",
});

export interface MapResponseOptions {
  /** Aus dem serverseitigen Feld `response_format`; Vorgabe `concise`. */
  readonly projection?: Projection;
  /** Die serverseitigen Felder des Aufrufs, wie `mapping/request.ts` sie liefert. */
  readonly serverOnly?: Readonly<Record<string, unknown>>;
  /** Fertige Kontobezeichnungen. Ohne Angabe wird der Stammdatenspeicher befragt. */
  readonly accountLabels?: ReadonlyMap<string, string>;
  /** Abweichender Speicher. Im Betrieb der prozessweite. */
  readonly store?: Pick<MasterDataStore, "read" | "isEnabled">;
}

export interface MappedResponse {
  readonly toolName: string;
  /** Der Spezifikationspfad, niemals der gebaute Pfad. */
  readonly endpoint: string;
  readonly shape: ToolEntry["shape"];
  readonly projection: Projection;
  /** Das Feld `message` der Antwort, wörtlich und geschwärzt; `null`, wenn es fehlte. */
  readonly message: string | null;
  /**
   * Die Zeilenzahl **dieser** Antwort; `null` außerhalb der Listenform
   * (Befund L5 in docs/api/live-befunde.md).
   */
  readonly rowsReturned: number | null;
  /** Die normalisierten Zeilen der Listenform. */
  readonly items: readonly Record<string, unknown>[];
  /** Das normalisierte Einzelobjekt, sonst `null`. */
  readonly object: Record<string, unknown> | null;
  /** Was eine Quittung ausnahmsweise mitliefert. */
  readonly ackData: unknown;
  readonly warnings: readonly AggregatedWarning[];
  readonly unknownFields: readonly string[];
  readonly envelopeWarnings: readonly EnvelopeWarning[];
  /** `true`, wenn Kontobezeichnungen aus dem Stammdatenspeicher ergänzt wurden. */
  readonly labelsFromCache: boolean;
}

/** Die Projektion aus den serverseitigen Feldern lesen, mit der hinterlegten Vorgabe. */
export function projectionFrom(
  serverOnly: Readonly<Record<string, unknown>> | undefined,
): Projection {
  const raw = serverOnly?.[RESPONSE_FORMAT_FIELD];
  return raw === "detailed" ? "detailed" : DEFAULT_PROJECTION;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Baut die Zuordnung Kontonummer → „Nummer Name" aus einem Kontenrahmen.
 *
 * Erwartet wird die Nutzlast von `bb_postingaccounts_search`, also eine Liste mit
 * `postingaccount_number` und `name`. Alles andere ergibt eine leere Zuordnung; ein
 * fehlender Kontenrahmen ist kein Fehler, sondern der Normalfall (der Speicher ist aus).
 */
export function accountLabelsFrom(payload: unknown): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  if (!Array.isArray(payload)) {
    return labels;
  }
  for (const row of payload) {
    if (!isPlainObject(row)) {
      continue;
    }
    const number = row.postingaccount_number;
    const name = row.name;
    if (typeof number !== "string" && typeof number !== "number") {
      continue;
    }
    if (typeof name !== "string" || name === "") {
      continue;
    }
    const key = String(number);
    labels.set(key, `${key} ${name}`);
  }
  return labels;
}

/** Der Kontenrahmen aus dem Stammdatenspeicher, falls einer darin liegt. */
export function accountLabelsFromStore(
  store: Pick<MasterDataStore, "read" | "isEnabled">,
): ReadonlyMap<string, string> | undefined {
  if (!store.isEnabled()) {
    return undefined;
  }
  const hit = store.read(POSTINGACCOUNTS_TOOL);
  if (hit === undefined) {
    return undefined;
  }
  const labels = accountLabelsFrom(hit.payload);
  return labels.size === 0 ? undefined : labels;
}

/**
 * Wendet die Projektion an. `detailed` liefert alles, `concise` genau die Felder aus dem
 * Registereintrag — **und zu jedem Betragsfeld dessen Centfeld**, weil ein Betrag ohne seine
 * verlustfreie Ganzzahlform nur die halbe Auskunft ist.
 *
 * Kennt der Eintrag keine Projektion (`concise` leer), bleibt der Datensatz vollständig: Ein
 * leerer Filter darf nie eine leere Zeile erzeugen.
 */
function project(
  record: Readonly<Record<string, unknown>>,
  concise: readonly string[],
  projection: Projection,
): Record<string, unknown> {
  if (projection === "detailed" || concise.length === 0) {
    return { ...record };
  }
  const out: Record<string, unknown> = {};
  for (const field of concise) {
    if (field in record) {
      out[field] = record[field];
    }
    const cents = centsFieldName(field);
    if (cents in record) {
      out[cents] = record[cents];
    }
  }
  return out;
}

/**
 * Ergänzt sprechende Kontobezeichnungen. Die Rohnummer bleibt **zusätzlich** stehen, weil sie
 * der Parameterwert des nächsten Aufrufs ist.
 *
 * @returns `true`, wenn mindestens eine Bezeichnung ergänzt wurde.
 */
function resolveAccountLabels(
  record: Record<string, unknown>,
  labels: ReadonlyMap<string, string>,
): boolean {
  let used = false;
  for (const [numberField, labelField] of Object.entries(ACCOUNT_LABEL_FIELDS)) {
    const value = record[numberField];
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }
    const label = labels.get(String(value));
    if (label === undefined || labelField in record) {
      continue;
    }
    record[labelField] = label;
    used = true;
  }
  return used;
}

/**
 * Wendet den Antwortvertrag des Endpunkts an.
 *
 * Bekannte Felder werden typisiert, unbekannte unverändert durchgereicht, fehlende oder
 * typwidrige bekannte Felder als `_contract_warnings` gemeldet — in **derselben Antwort, die
 * der Agent liest**. Der Aufruf scheitert daran nicht: Die Spezifikation ist
 * nachweislich falsch, und ein harter Abbruch machte den Server bei jeder Anbieteränderung
 * bei allen Nutzern gleichzeitig unbrauchbar.
 */
export function mapResponse(
  entry: ToolEntry,
  envelope: SuccessEnvelope,
  options: MapResponseOptions = {},
): MappedResponse {
  const endpoint = specPathOf(entry.path);
  const projection = options.projection ?? projectionFrom(options.serverOnly);
  const contractFields = entry.responseContract.fields;
  const labels =
    options.accountLabels ?? accountLabelsFromStore(options.store ?? getMasterDataStore());

  const warnings: ContractWarning[] = [];
  const unknownFields = new Set<string>();
  let labelsFromCache = false;

  const normalize = (row: Readonly<Record<string, unknown>>): Record<string, unknown> => {
    const coerced = coerceRecord(contractFields, row);
    warnings.push(...coerced.warnings);
    for (const field of coerced.unknownFields) {
      unknownFields.add(field);
    }
    const projected = project(coerced.values, entry.concise, projection);
    if (labels !== undefined && resolveAccountLabels(projected, labels)) {
      labelsFromCache = true;
    }
    return projected;
  };

  let items: Record<string, unknown>[] = [];
  let object: Record<string, unknown> | null = null;
  let ackData: unknown = null;
  let rowsReturned: number | null = null;

  switch (envelope.shape) {
    case "list": {
      rowsReturned = envelope.data.length;
      items = envelope.data.map((row) =>
        isPlainObject(row)
          ? normalize(row)
          : // Eine Zeile, die kein Objekt ist, wird nicht verworfen: Sie wandert als Wert
            // durch und wird gemeldet, damit der Agent sie sieht statt sie zu vermissen.
            fallbackRow(row, warnings),
      );
      break;
    }
    case "object": {
      object =
        entry.responseContract.container === "data"
          ? normalize(envelope.data)
          : normalize(stripEnvelopeKeys(envelope.body));
      break;
    }
    case "ack": {
      // Bei `container: "none"` stehen die Felder der Schreibantwort **auf oberster Ebene**
      // des Umschlags und nicht unter `data`; die Spezifikation führt das so, etwa bei
      // `InvoicesCreate_Success` mit `id_by_customer`, `invoicenumber` und `file_name`.
      // Dort ist der Umschlag selbst der Datensatz.
      if (entry.responseContract.container === "none") {
        object = normalize(stripEnvelopeKeys(envelope.body));
      } else {
        ackData = envelope.data;
      }
      break;
    }
  }

  const aggregated = aggregateWarnings(warnings);
  if (aggregated.length > 0) {
    logWarn(contractWarningLogLine(entry.name, endpoint, aggregated));
  }
  if (unknownFields.size > 0) {
    // Einmal je Prozesslauf und Feldmenge, Stufe debug.
    const names = [...unknownFields].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    logOnce(
      `unknown-fields:${entry.name}:${names.join(",")}`,
      "debug",
      `${entry.name} ${endpoint}: Felder ohne Eintrag im Antwortvertrag: ${names.join(", ")}. ` +
        "Sie werden unverändert durchgereicht.",
    );
  }

  return {
    toolName: entry.name,
    endpoint,
    shape: entry.shape,
    projection,
    message: envelope.message,
    rowsReturned,
    items,
    object,
    ackData,
    warnings: aggregated,
    unknownFields: [...unknownFields],
    envelopeWarnings: envelope.warnings,
    labelsFromCache,
  };
}

/**
 * Die Felder des Umschlags, die keine Nutzdaten sind.
 *
 * Sie werden abgetrennt, bevor der Umschlag selbst als Datensatz gelesen wird; sonst stünden
 * `success` und `message` als „unbekannte Felder" im Datensatz und verdeckten die echten.
 */
const ENVELOPE_KEYS: readonly string[] = Object.freeze(["success", "message", "rows", "data"]);

function stripEnvelopeKeys(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ENVELOPE_KEYS.includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

/** Eine Zeile, die kein Objekt ist: durchreichen und melden, nicht verwerfen. */
function fallbackRow(row: unknown, warnings: ContractWarning[]): Record<string, unknown> {
  warnings.push({
    field: "(Zeile)",
    expected: "object",
    seen: row === null ? "null" : Array.isArray(row) ? "array" : typeof row,
  });
  return { value: row };
}
