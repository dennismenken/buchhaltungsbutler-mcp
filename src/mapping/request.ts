// Werkzeugargumente → API-Body (Plan 1.4 Schritt 8, Anhang A).
//
// Vier Dinge geschehen hier und sonst nirgends:
//
//  1. **Die Umbenennungen aus Anhang A werden zurückübersetzt.** Die Zuordnung steht je Feld
//     im Registereintrag (`FieldSpec.apiNames`), nicht in einer zweiten Tabelle in diesem
//     Modul; {@link ANNEX_A_RENAMES} führt sie trotzdem vollständig auf, damit sie prüfbar
//     bleibt und nicht nur in der Prosa des Plans steht.
//  2. **Positionslisten werden zu parallelen Arrays** — ausschließlich an den sieben Stellen
//     aus Plan 4.8, und `mapping/parallel-arrays.ts` weist jede andere ab.
//  3. **Betragszeichenketten werden zu JSON-Zahlen.** Das Werkzeugschema nimmt die
//     Zeichenkette, die API erwartet eine Zahl (Plan 4.5, Baustein `amountIn()`); die
//     Umwandlung gehört an den Rand und läuft über Ganzzahl-Cent, nie über `parseFloat`.
//  4. **Der Pfad wird gebaut**, falls der Eintrag eine Vorlage trägt, und der Identifikator
//     landet dabei **nicht** im Body (Plan 4.6 Regel 5).
//
// **Zum `api_key`:** Er kommt ausschließlich aus der Konfiguration und niemals aus den
// Argumenten. Eingesetzt wird er an genau einer Stelle, nämlich in `src/http/client.ts`
// unmittelbar vor dem Serialisieren — dort steht er hinter dem Body, sodass kein Argument den
// Mandanten umlenken kann, und dort weist der Client einen Body, der bereits ein Feld
// `api_key` trägt, ohne Request zurück. Dieses Modul erzeugt den Body deshalb **ohne**
// `api_key` und sorgt mit {@link assertNoApiKeyInArguments} dafür, dass auch kein Argument
// ihn einschleusen kann. Zwei Stellen, an denen das Geheimnis den Body berührt, wären eine
// Stelle zu viel.

import { elementLabel } from "../errors/path-label.js";
import { isAmountSchema } from "../schema/primitives.js";
import type { FieldSpec, ToolEntry } from "../registry/types.js";
import { amountStringToApiNumber } from "./decimal.js";
import {
  assertTransformAllowed,
  buildParallelArrays,
  PositionMappingError,
} from "./parallel-arrays.js";
import { assertNoPathFieldInBody, buildPath, PathBuildError, specPathOf } from "./path.js";
import { resolveUploadSource } from "../upload/source.js";

export { PathBuildError, PositionMappingError };

/** Das Feld, das den Mandanten wählt. Es kommt nie aus den Argumenten (Plan 6.2, 6.3). */
export const API_KEY_FIELD = "api_key";

/**
 * Anhang A, vollständig: jede Umbenennung zwischen Werkzeugfeld und API-Feld.
 *
 * Die Tabelle ist **Nachweis und Prüfgrundlage**, nicht der Ausführungsweg: Übersetzt wird
 * über `FieldSpec.apiNames` des Registereintrags, damit die Zuordnung dort steht, wo auch
 * Beschreibung, Schema und Deckungstest hängen. Wer eine Umbenennung ergänzt, ergänzt sie im
 * Registereintrag; diese Tabelle hält fest, welche der Plan kennt.
 *
 * „Mehr Umbenennungen als diese gibt es nicht; alle übrigen rund 300 Felder tragen den Namen
 * der Spezifikation" (Anhang A).
 */
export interface AnnexARename {
  /** Name im Werkzeugschema. */
  readonly field: string;
  /** Die abgedeckten API-Namen, in der Reihenfolge des Anhangs. Leer beim Pfadsegment. */
  readonly apiNames: readonly string[];
  /** Die Endpunkte, an denen die Umbenennung gilt. */
  readonly specPaths: readonly string[];
  readonly reason: string;
}

const POSTING_POSITION_API_NAMES = [
  "postingaccounts",
  "postingtexts",
  "vats",
  "cost_locations",
  "cost_locations_two",
  "amounts",
] as const;

export const ANNEX_A_RENAMES: readonly AnnexARename[] = Object.freeze([
  {
    field: "payment_account_number",
    apiNames: ["account"],
    specPaths: ["/receipts/add", "/receipts/upload", "/transactions/add", "/transactions/get"],
    reason:
      "account erwartet eine Sachkontonummer, meint aber ein Zahlungskonto. Der Name sagt " +
      "beides nicht (Plan 3.4).",
  },
  {
    field: "account_filter",
    apiNames: ["account"],
    specPaths: ["/postings/get"],
    reason: "Dort ist es kein Konto, sondern eine kommagetrennte Filterliste mit Schlüsselwörtern.",
  },
  {
    field: "postingaccount_filter",
    apiNames: ["postingaccount"],
    specPaths: ["/postings/get"],
    reason: "Analog zu account_filter, ebenfalls eine Filterliste mit Schlüsselwörtern.",
  },
  {
    field: "receipt_type",
    apiNames: ["type"],
    specPaths: ["/receipts/add", "/receipts/upload"],
    reason: "type ist in der Spezifikation siebenfach mit unterschiedlicher Bedeutung belegt.",
  },
  {
    field: "invoice_type",
    apiNames: ["type"],
    specPaths: ["/invoices/create", "/invoices/create/e-invoice", "/invoices/create/draft"],
    reason: "dito",
  },
  {
    field: "transaction_type",
    apiNames: ["type"],
    specPaths: ["/transactions/add"],
    reason: "dito",
  },
  {
    field: "payment_account_type",
    apiNames: ["type"],
    specPaths: ["/accounts/add"],
    reason: "dito; Werte cash, bank/institution, other",
  },
  {
    field: "positions",
    apiNames: [...POSTING_POSITION_API_NAMES],
    specPaths: ["/postings/add/receipt"],
    reason:
      "Objektorientierte Positionsliste statt paralleler Arrays, Längeninvariante " +
      "konstruktiv erfüllt (Plan 4.8).",
  },
  {
    field: "positions",
    apiNames: [...POSTING_POSITION_API_NAMES, "oi_receipts_ids_by_customer"],
    specPaths: ["/postings/add/transaction"],
    reason: "dito, zusätzlich die Zuordnung offener Posten je Position.",
  },
  {
    field: "positions",
    apiNames: [
      "postingaccounts",
      // Der eingeschobene Buchstabe ist der benannte Spezifikationsfehler aus Plan 0.5:
      // ReceiptPostings trägt postingstexts, der Einzelendpunkt postingtexts.
      "postingstexts",
      "vats",
      "cost_locations",
      "cost_locations_two",
      "amounts",
    ],
    specPaths: ["/postings/add-batch/receipts"],
    reason:
      "dito, aber innerhalb jedes Stapelelements; der Behälter receipts selbst wird nicht " +
      "umbenannt.",
  },
  {
    field: "positions",
    apiNames: [...POSTING_POSITION_API_NAMES, "oi_receipts_ids_by_customer"],
    specPaths: ["/postings/add-batch/transactions"],
    reason: "dito; der Behälter transactions wird nicht umbenannt.",
  },
  {
    field: "items",
    apiNames: [
      "item_name",
      "item_amount",
      "item_unit",
      "item_vat",
      "item_single_price",
      "item_description",
    ],
    specPaths: ["/invoices/create", "/invoices/create/draft"],
    reason: "Positionsliste statt paralleler Arrays, für Rechnungspositionen.",
  },
  {
    field: "items",
    apiNames: [
      "item_name",
      "item_amount",
      "item_unit",
      "item_tax_type",
      "item_tax_amount",
      "item_single_price",
      "item_description",
    ],
    specPaths: ["/invoices/create/e-invoice"],
    reason: "dito; item_tax_type und item_tax_amount statt item_vat.",
  },
  {
    field: "assignments",
    apiNames: ["transactions_to_receipts"],
    specPaths: ["/transactions/assign-batch/receipt"],
    reason:
      "Keine Umformung, reine Umbenennung: Der Parameter ist bereits eine Objektliste aus " +
      "receipt_id_by_customer und transaction_id_by_customer.",
  },
  {
    field: "receipt_id_by_customer",
    apiNames: [],
    specPaths: [
      "/receipts/get/id_by_customer",
      "/receipts/delete/id_by_customer",
      "/receipts/restore/id_by_customer",
    ],
    reason:
      "Pfadsegment. Der Identifikator fehlt in der Spezifikation ganz (Plan 4.6): " +
      "source path, leeres apiNames, kein Body-Feld.",
  },
  {
    field: "transaction_id_by_customer",
    apiNames: [],
    specPaths: ["/transactions/get/id_by_customer"],
    reason: "dito",
  },
]);

/**
 * Die in Anhang A vorgesehenen API-Namen eines Werkzeugfeldes, oder `undefined`, wenn der
 * Anhang zu diesem Paar nichts sagt. Für Prüfungen gedacht, nicht für den Ausführungsweg.
 */
export function documentedRename(specPath: string, field: string): AnnexARename | undefined {
  return ANNEX_A_RENAMES.find(
    (rename) => rename.field === field && rename.specPaths.includes(specPath),
  );
}

/** Ein Aufruf, dessen Argumente sich nicht in einen Body übersetzen lassen. */
export class RequestMappingError extends Error {
  readonly toolName: string;
  readonly fieldPath: string;

  constructor(toolName: string, fieldPath: string, detail: string) {
    super(`${fieldPath}: ${detail}`);
    this.name = "RequestMappingError";
    this.toolName = toolName;
    this.fieldPath = fieldPath;
  }
}

/** Das Ergebnis der Hinrichtung. `body` trägt niemals den `api_key`. */
export interface MappedRequest {
  readonly toolName: string;
  /** Der unveränderte Spezifikationspfad: Nachschlagen und Protokollieren (Plan 4.6 Regel 6). */
  readonly specPath: string;
  /** Der tatsächlich gesendete Pfad. Bei 50 der 54 Endpunkte gleich `specPath`. */
  readonly requestPath: string;
  /** Der Body **ohne** `api_key`; den setzt ausschließlich `src/http/client.ts` ein. */
  readonly body: Record<string, unknown>;
  /** Rein serverseitige Felder, allen voran `response_format`. Sie verlassen den Prozess nie. */
  readonly serverOnly: Record<string, unknown>;
}

/**
 * Weist einen Aufruf zurück, der den Mandantenschlüssel mitbringt.
 *
 * Das Eingabeschema ist streng (`additionalProperties: false`) und kennt kein Feld `api_key`;
 * diese Prüfung ist die zweite Linie für den Fall, dass ein Aufrufer den Mapper ohne
 * vorherige Validierung benutzt.
 */
export function assertNoApiKeyInArguments(
  toolName: string,
  args: Readonly<Record<string, unknown>>,
): void {
  if (API_KEY_FIELD in args) {
    throw new RequestMappingError(
      toolName,
      API_KEY_FIELD,
      "Der Mandantenschlüssel kommt ausschließlich aus der Konfiguration dieses Servers und " +
        "niemals aus einem Werkzeugaufruf. Der Aufruf wird nicht abgesetzt.",
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Der eine API-Name eines gewöhnlichen Feldes. */
function singleApiName(toolName: string, field: FieldSpec, fieldPath: string): string {
  if (field.apiNames.length !== 1) {
    throw new RequestMappingError(
      toolName,
      fieldPath,
      `trägt ${String(field.apiNames.length)} API-Namen. Ein Feld ohne Umformung deckt genau ` +
        "einen Body-Parameter ab (Plan 2.1).",
    );
  }
  return field.apiNames[0] ?? "";
}

/**
 * Wandelt einen skalaren Wert in die Form, die die API erwartet.
 *
 * Derzeit gibt es genau eine Umwandlung, und sie betrifft Beträge: Das Werkzeugschema nimmt
 * die Dezimalzeichenkette, die API erwartet eine JSON-Zahl (Plan 4.5). Erkannt wird ein
 * Betrag an der Markierung, die `amountIn()` setzt, und nicht an einer Namensliste — damit
 * gilt dieselbe Regel für skalare Felder und für Felder innerhalb einer Position.
 */
function convertScalar(
  toolName: string,
  field: FieldSpec,
  value: unknown,
  fieldPath: string,
): unknown {
  if (!isAmountSchema(field.schema) || typeof value !== "string") {
    return value;
  }
  const converted = amountStringToApiNumber(value);
  if (converted === null) {
    throw new RequestMappingError(
      toolName,
      fieldPath,
      `"${value}" ist kein eindeutiger Betrag. Erwartet wird eine Dezimalzeichenkette mit ` +
        "Punkt und höchstens zwei Nachkommastellen, zum Beispiel 123.99. Der Aufruf wird " +
        "nicht abgesetzt, damit kein geratener Betrag in die Buchhaltung gelangt.",
    );
  }
  return converted;
}

interface MapContext {
  readonly toolName: string;
  readonly specPath: string;
  /** `true` innerhalb eines Stapelelements: Dort gelten die geschachtelten Regeln aus 4.8. */
  readonly nested: boolean;
}

/**
 * Schreibt die Felder einer Ebene in ihr Ziel: gewöhnliche Felder unter ihrem API-Namen,
 * Objektlisten als Liste umbenannter Objekte, Positionslisten als parallele Arrays.
 */
function mapFieldsInto(
  target: Record<string, unknown>,
  fields: readonly FieldSpec[],
  args: Readonly<Record<string, unknown>>,
  context: MapContext,
  prefix: string,
): void {
  for (const field of fields) {
    const fieldPath = prefix === "" ? field.name : `${prefix}.${field.name}`;

    // Rein serverseitige Felder verlassen den Prozess nie (Plan 4.3, 7.4), und der
    // Identifikator der vier Endpunkte mit Pfadvorlage gehört in den Pfad (4.6 Regel 5).
    if (field.source === "server" || field.source === "path") {
      continue;
    }

    const value = args[field.name];
    if (value === undefined) {
      if (field.required) {
        throw new RequestMappingError(
          context.toolName,
          fieldPath,
          "ist Pflicht, fehlt aber in den Argumenten.",
        );
      }
      continue;
    }

    if (field.transform === "parallel-arrays") {
      assertTransformAllowed(context.toolName, context.specPath, fieldPath, context.nested);
      const positions = convertPositions(field, value, context, fieldPath);
      const arrays = buildParallelArrays(context.toolName, field, positions, fieldPath);
      for (const [apiName, column] of Object.entries(arrays)) {
        assertFree(target, apiName, context.toolName, fieldPath);
        target[apiName] = column;
      }
      continue;
    }

    const apiName = singleApiName(context.toolName, field, fieldPath);
    assertFree(target, apiName, context.toolName, fieldPath);

    if (field.itemFields !== undefined) {
      target[apiName] = mapObjectList(field, value, context, fieldPath);
      continue;
    }

    target[apiName] = convertScalar(context.toolName, field, value, fieldPath);
  }
}

/** Zwei Felder, die denselben Body-Parameter schreiben, wären ein stiller Datenverlust. */
function assertFree(
  target: Readonly<Record<string, unknown>>,
  apiName: string,
  toolName: string,
  fieldPath: string,
): void {
  if (apiName in target) {
    throw new RequestMappingError(
      toolName,
      fieldPath,
      `würde den Body-Parameter ${apiName} ein zweites Mal setzen. Jeder Parameter wird von ` +
        "genau einem Werkzeugfeld abgedeckt (Plan 2.1).",
    );
  }
  if (apiName === API_KEY_FIELD) {
    throw new RequestMappingError(
      toolName,
      fieldPath,
      "würde den Mandantenschlüssel in den Body schreiben. Er kommt ausschließlich aus der " +
        "Konfiguration (Plan 1.4 Schritt 8).",
    );
  }
}

/**
 * Wandelt die Werte innerhalb einer Positionsliste, **ohne** die Feldnamen zu ändern: Die
 * Umbenennung in die parallelen Arrays macht `parallel-arrays.ts` anhand derselben
 * `itemFields`. Zwei Stellen, die Namen vergeben, wären eine zu viel.
 */
function convertPositions(
  field: FieldSpec,
  value: unknown,
  context: MapContext,
  fieldPath: string,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new RequestMappingError(
      context.toolName,
      fieldPath,
      `erwartet eine Liste von Positionen, bekam ${value === null ? "null" : typeof value}.`,
    );
  }
  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new PositionMappingError(
        context.toolName,
        fieldPath,
        index + 1,
        `ist kein Objekt, sondern ${raw === null ? "null" : typeof raw}.`,
      );
    }
    const converted: Record<string, unknown> = {};
    for (const [name, cell] of Object.entries(raw)) {
      const itemField = field.itemFields?.find((candidate) => candidate.name === name);
      converted[name] =
        itemField === undefined
          ? cell
          : convertScalar(
              context.toolName,
              itemField,
              cell,
              `${elementLabel(fieldPath, index)}.${name}`,
            );
    }
    return converted;
  });
}

/**
 * Eine Objektliste: die Behälter der acht Stapelendpunkte. Sie sind **bereits** Objektlisten,
 * hier findet keine Umformung statt (Plan 4.8) — wohl aber die Umbenennung der Felder
 * **innerhalb** eines Elements und, an den Werkzeugen 22 und 24, die geschachtelte
 * Positionsliste.
 */
function mapObjectList(
  field: FieldSpec,
  value: unknown,
  context: MapContext,
  fieldPath: string,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new RequestMappingError(
      context.toolName,
      fieldPath,
      `erwartet eine Liste von Objekten, bekam ${value === null ? "null" : typeof value}.`,
    );
  }
  if (value.length === 0) {
    throw new RequestMappingError(
      context.toolName,
      fieldPath,
      "ist leer. Mindestens ein Element ist nötig; die API nimmt keine leeren Stapel an.",
    );
  }

  const itemFields = field.itemFields ?? [];
  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new RequestMappingError(
        context.toolName,
        elementLabel(fieldPath, index),
        `ist kein Objekt, sondern ${raw === null ? "null" : typeof raw}.`,
      );
    }
    const element: Record<string, unknown> = {};
    mapFieldsInto(
      element,
      itemFields,
      raw,
      { ...context, nested: true },
      elementLabel(fieldPath, index),
    );
    return element;
  });
}

/**
 * Übersetzt geprüfte Werkzeugargumente in Pfad und Body.
 *
 * @param args Die von Zod geprüften Argumente (Guard 3 aus Plan 1.4). Der Mapper prüft keine
 *             Werte nach, er formt um; die Ausnahmen sind die Pfadprüfung aus 4.6 und die
 *             Betragsumwandlung, weil beide eine Zeichenkette in eine andere Form bringen.
 */
export function mapRequest(
  entry: ToolEntry,
  args: Readonly<Record<string, unknown>>,
): MappedRequest {
  assertNoApiKeyInArguments(entry.name, args);

  const specPath = specPathOf(entry.path);
  const context: MapContext = { toolName: entry.name, specPath, nested: false };

  const body: Record<string, unknown> = {};
  mapFieldsInto(body, entry.fields, args, context, "");

  // Regel 5 aus 4.6 als Zusicherung am Ergebnis, nicht als Vorsatz im Kommentar.
  assertNoPathFieldInBody(entry, body);

  const serverOnly: Record<string, unknown> = {};
  for (const field of entry.fields) {
    if (field.source !== "server") {
      continue;
    }
    const value = args[field.name];
    if (value !== undefined) {
      serverOnly[field.name] = value;
    }
  }

  const { requestPath } = buildPath(entry, args);

  return { toolName: entry.name, specPath, requestPath, body, serverOnly };
}

// ---------------------------------------------------------------------------------------
// Die Belegquelle (Plan 11.2 AP13)
// ---------------------------------------------------------------------------------------

/**
 * Der einzige Endpunkt, der eine Datei entgegennimmt. Die Zuordnung hängt am
 * Spezifikationspfad und nicht am Werkzeugnamen: Der Pfad ist der Schlüssel, mit dem auch
 * Fehlerkatalog, Deckungstest und Audit-Zeile arbeiten (Plan 4.6).
 */
const UPLOAD_SPEC_PATH = "/receipts/upload";

/** Das Argument, das den Inhalt trägt, und das Argument, das den Namen trägt. */
const UPLOAD_SOURCE_FIELD = "file";
const UPLOAD_NAME_FIELD = "file_name";

/**
 * Löst die Belegquelle auf, **bevor** irgendetwas an BuchhaltungsButler geht.
 *
 * Ohne diesen Schritt ginge der Wert von `file` unverändert als Body-Feld hinaus: Die drei
 * zugesagten Formen (base64, `https://`, `file://`), die Typbestimmung über Magic Bytes, die
 * Größengrenze und die Bereinigung des Dateinamens liefen ins Leere, obwohl die
 * Werkzeugbeschreibung sie nennt.
 *
 * Der Schritt liegt hier und nicht in {@link mapRequest}, weil er Netz und Dateisystem
 * berührt und damit asynchron ist; `mapRequest` bleibt eine reine Abbildung.
 *
 * @returns Die Argumente, bei `/receipts/upload` mit aufgelöstem `file` und `file_name`.
 *          Für jedes andere Werkzeug **dasselbe** Objekt, unverändert.
 * @throws UploadSourceError bei jeder Absage. Es ging dabei nichts hinaus.
 */
export async function resolveUploadArguments(
  entry: ToolEntry,
  args: Readonly<Record<string, unknown>>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<Readonly<Record<string, unknown>>> {
  if (specPathOf(entry.path) !== UPLOAD_SPEC_PATH) {
    return args;
  }

  const source = args[UPLOAD_SOURCE_FIELD];
  if (typeof source !== "string") {
    // Das Schema hat das Feld als Pflichtfeld geprüft; kommt hier trotzdem nichts an, ist
    // das kein Fall für diese Schicht, sondern einer für den Aufrufer.
    return args;
  }

  const requestedName = args[UPLOAD_NAME_FIELD];
  const payload = await resolveUploadSource(
    {
      source,
      fileName: typeof requestedName === "string" ? requestedName : null,
    },
    options.signal === undefined ? {} : { signal: options.signal },
  );

  return {
    ...args,
    [UPLOAD_SOURCE_FIELD]: payload.base64,
    [UPLOAD_NAME_FIELD]: payload.fileName,
  };
}
