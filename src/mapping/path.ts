// Pfadbau bei den vier Endpunkten mit Platzhaltersegment (Plan 4.6).
//
// Live gemessen (Plan 0.3 Befund L1, `docs/api/live-befunde-orchestrator.md` Befund 1): Das
// Segment `id_by_customer` im Pfad der Spezifikation ist ein **Platzhalter für den Wert**,
// kein literales Segment und kein Body-Feld. Der dokumentierte Aufruf scheitert nachweislich:
// `POST /receipts/get/id_by_customer` mit dem Body-Feld `id_by_customer` antwortet mit
// HTTP 400 und `error_code` 5, `POST /transactions/get/id_by_customer` sogar mit einer
// HTML-Fehlerseite, weil dieser Pfad gar nicht existiert. Mit dem Wert im Pfad antworten
// beide mit HTTP 200.
//
// Dieses Modul gibt deshalb **immer ein Paar** zurück und nie eine einzelne Zeichenkette
// (Regel 6): Gesendet wird der gebaute Pfad, nachgeschlagen und protokolliert wird
// `specPath`. Fehlerkatalog, Deckungstest und Audit-Zeile schlüsseln nach `specPath`; mit dem
// gebauten Pfad fiele jeder Fehler dieser vier Werkzeuge auf „Paar fehlt" zurück, und die
// eingesetzte Geschäftskennung stünde im Protokoll.

import type { PathSpec, ToolEntry } from "../registry/types.js";

/**
 * Der erlaubte Wertevorrat eines Pfadsegments (Regel 1): ausschließlich Ziffern, ein bis
 * achtzehn Stellen. Kein Bindestrich, kein Punkt, kein Schrägstrich, keine leere
 * Zeichenkette. Achtzehn Stellen, weil eine längere Dezimalzahl den verlustfreien
 * Ganzzahlbereich von JavaScript verlässt und damit keine Kennung mehr wäre.
 */
export const PATH_SEGMENT_PATTERN = /^[0-9]{1,18}$/;

/** Das Ergebnis des Pfadbaus. Beide Werte werden im Code nie gegeneinander getauscht. */
export interface BuiltPath {
  /** Der tatsächlich gesendete Pfad, zum Beispiel `/receipts/get/4711`. */
  readonly requestPath: string;
  /** Der unveränderte Spezifikationspfad, zum Beispiel `/receipts/get/id_by_customer`. */
  readonly specPath: string;
}

/** Ein Pfad, der so nicht absetzbar ist. Es geht kein Byte hinaus (Regel 3). */
export class PathBuildError extends Error {
  readonly toolName: string;
  readonly specPath: string;
  /** Der Name des Pfadparameters, der den Fehler ausgelöst hat; leer, wenn keiner. */
  readonly param: string;

  constructor(toolName: string, specPath: string, param: string, detail: string) {
    super(detail);
    this.name = "PathBuildError";
    this.toolName = toolName;
    this.specPath = specPath;
    this.param = param;
  }
}

/** Der Spezifikationspfad eines Eintrags, für beide Zweige der Union (Plan 4.6 Regel 4). */
export function specPathOf(path: PathSpec): string {
  return "literal" in path ? path.literal : path.specPath;
}

/** `true`, wenn der Eintrag eine Pfadvorlage trägt, also einer der vier Endpunkte ist. */
export function hasPathTemplate(path: PathSpec): boolean {
  return !("literal" in path);
}

/**
 * Die Zahl der Segmente eines Pfades. Ein Pfad beginnt mit `/`; führende und doppelte
 * Schrägstriche zählen nicht als Segment.
 */
function segmentCount(path: string): number {
  return path.split("/").filter((segment) => segment !== "").length;
}

/**
 * Der Vorlagenstamm: die Vorlage ohne ihre Platzhaltersegmente. Aus
 * `/receipts/get/{receipt_id_by_customer}` wird `/receipts/get`.
 */
function templateStem(template: string): string {
  const kept = template
    .split("/")
    .filter((segment) => segment !== "" && !(segment.startsWith("{") && segment.endsWith("}")));
  return `/${kept.join("/")}`;
}

/**
 * Baut den Pfad eines Werkzeugaufrufs.
 *
 * Die sechs Regeln aus Plan 4.6, alle Pflicht und alle hier:
 *
 *  1. Der einzusetzende Wert wird **vor** dem Einsetzen gegen {@link PATH_SEGMENT_PATTERN}
 *     geprüft.
 *  2. Der Wert läuft anschließend durch `encodeURIComponent`. Nach Regel 1 ist das
 *     wirkungslos und genau deshalb richtig: Es ist die Absicherung gegen eine spätere
 *     Lockerung von Regel 1. Wer sich allein auf die Musterprüfung verlässt und das
 *     Kodieren weglässt, hat beim ersten gelockerten Muster eine Einsetzstelle für
 *     Pfadsegmente, die der Aufrufer bestimmt.
 *  3. Der gebaute Pfad wird gegen die Vorlage zurückgeprüft: genau ein Segment mehr als der
 *     Vorlagenstamm je Platzhalter. Schlägt das fehl, geht kein Request ab.
 *  4. Die übrigen 50 Endpunkte tragen `literal` und können bauartbedingt keinen
 *     interpolierten Pfad erzeugen.
 *  5. Der Body trägt kein Feld für den Identifikator. Das erzwingt
 *     {@link assertNoPathFieldInBody} und der Request-Mapper über `source: "path"`.
 *  6. Nachgeschlagen wird immer mit `specPath`, gesendet immer mit dem gebauten Pfad; deshalb
 *     ein Paar als Rückgabewert.
 *
 * @param args Die **geprüften** Werkzeugargumente. Gelesen wird ausschließlich der Wert zum
 *             Namen des Pfadparameters.
 */
export function buildPath(
  entry: Pick<ToolEntry, "name" | "path">,
  args: Readonly<Record<string, unknown>>,
): BuiltPath {
  const specPath = specPathOf(entry.path);

  // Regel 4: Der literale Zweig hat keine Vorlage und damit keine Einsetzstelle.
  if ("literal" in entry.path) {
    return { requestPath: entry.path.literal, specPath };
  }

  const { template, params } = entry.path;
  if (params.length === 0) {
    throw new PathBuildError(
      entry.name,
      specPath,
      "",
      "Der Registereintrag trägt eine Pfadvorlage ohne Parameter. Eine Vorlage ohne " +
        "Einsetzstelle ist ein Eintragsfehler und kein Aufruf, der absetzbar wäre.",
    );
  }

  let requestPath = template;
  for (const param of params) {
    const placeholder = `{${param}}`;
    if (!requestPath.includes(placeholder)) {
      throw new PathBuildError(
        entry.name,
        specPath,
        param,
        `Die Pfadvorlage ${template} enthält kein Segment ${placeholder}. Vorlage und ` +
          "Parameterliste des Registereintrags widersprechen sich.",
      );
    }

    const raw = args[param];
    if (raw === undefined || raw === null) {
      throw new PathBuildError(
        entry.name,
        specPath,
        param,
        `${param} fehlt. Der Wert gehört bei diesem Endpunkt in den Pfad und nicht in den ` +
          "Body; ohne ihn gibt es keinen Pfad, der aufrufbar wäre.",
      );
    }

    // Regel 1. Eine Zahl wird vorher in ihre Dezimalschreibweise überführt, weil das
    // Eingabeschema der Kennung `integer` ist (S10) und `4711` denselben Pfad ergibt wie
    // `"4711"`. Alles andere als Zahl oder Zeichenkette wird zur leeren Zeichenkette und
    // scheitert damit am Muster; ein Objekt wird nicht stillschweigend zu [object Object].
    const value =
      typeof raw === "number" && Number.isInteger(raw)
        ? String(raw)
        : typeof raw === "string"
          ? raw.trim()
          : "";
    if (!PATH_SEGMENT_PATTERN.test(value)) {
      throw new PathBuildError(
        entry.name,
        specPath,
        param,
        `${param} ist keine Kennung aus eins bis achtzehn Ziffern. Erlaubt sind ` +
          "ausschließlich Ziffern: kein Bindestrich, kein Punkt, kein Schrägstrich, keine " +
          "leere Zeichenkette. Der Wert wird in den Pfad eingesetzt, deshalb geht ohne diese " +
          "Prüfung kein Request hinaus.",
      );
    }

    // Regel 2.
    requestPath = requestPath.replace(placeholder, encodeURIComponent(value));
  }

  // Regel 3: Rückprüfung gegen den Vorlagenstamm.
  const expected = segmentCount(templateStem(template)) + params.length;
  if (segmentCount(requestPath) !== expected || requestPath.includes("{")) {
    throw new PathBuildError(
      entry.name,
      specPath,
      "",
      `Der gebaute Pfad ${requestPath} hat nicht die erwartete Segmentzahl ${String(expected)} ` +
        `zur Vorlage ${template}. Der Aufruf wird nicht abgesetzt.`,
    );
  }

  return { requestPath, specPath };
}

/**
 * Regel 5 als Zusicherung: An den vier Endpunkten mit Pfadvorlage trägt der Body **kein**
 * Feld für den Identifikator.
 *
 * Das ist keine Auslassung, sondern deckungsgleich mit der Spezifikation: Maschinell geprüft
 * führt `/receipts/get/id_by_customer` als Parameter nur `api_key` und `get_file`, die drei
 * übrigen nur `api_key`. Der Identifikator kommt in der Parameterliste dieser vier Pfade
 * überhaupt nicht vor (Plan 4.6, Anhang A).
 *
 * @throws {PathBuildError} wenn ein Pfadparameter im Body gelandet ist. Das wäre ein Fehler
 *         im Request-Mapper, und er darf nicht über die Leitung gehen.
 */
export function assertNoPathFieldInBody(
  entry: Pick<ToolEntry, "name" | "path" | "fields">,
  body: Readonly<Record<string, unknown>>,
): void {
  const specPath = specPathOf(entry.path);
  const pathFields = entry.fields.filter((field) => field.source === "path");
  for (const field of pathFields) {
    for (const name of [field.name, ...field.apiNames, "id_by_customer"]) {
      if (name in body) {
        throw new PathBuildError(
          entry.name,
          specPath,
          field.name,
          `Der Body trägt das Feld ${name}. Bei ${specPath} gehört der Identifikator ` +
            "ausschließlich in den Pfad; ein Body-Feld dieses Namens wird an diesem Endpunkt " +
            "mit error_code 5 abgelehnt (Plan 4.6 Regel 5, live gemessen).",
        );
      }
    }
  }
}
