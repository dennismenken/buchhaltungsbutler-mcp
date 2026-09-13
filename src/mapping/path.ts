// Pfadbau bei den vier Endpunkten mit Platzhaltersegment.
//
// Live gemessen (Befund L1 in docs/api/live-befunde.md): Das
// Segment `id_by_customer` im Pfad der Spezifikation ist ein **Platzhalter für den Wert**,
// kein literales Segment und kein Body-Feld. Der dokumentierte Aufruf scheitert nachweislich:
// `POST /receipts/get/id_by_customer` mit dem Body-Feld `id_by_customer` antwortet mit
// HTTP 400 und `error_code` 5, `POST /transactions/get/id_by_customer` sogar mit einer
// HTML-Fehlerseite, weil dieser Pfad gar nicht existiert. Mit dem Wert im Pfad antworten
// beide mit HTTP 200.
//
// ## Die sechs Pfadregeln
//
// Diese sechs Zusicherungen sind hier definiert und werden im übrigen Quelltext als
// „Pfadregel N (Kopf von src/mapping/path.ts)" zitiert. Alle sechs sind Pflicht, keine ist
// eine Empfehlung.
//
//  1. **Wertevorrat.** Der einzusetzende Wert wird **vor** dem Einsetzen gegen
//     `PATH_SEGMENT_PATTERN` geprüft: ein bis achtzehn Ziffern, sonst nichts.
//  2. **Kodierung.** Der Wert läuft anschließend durch `encodeURIComponent`. Nach Pfadregel 1
//     ist das wirkungslos und genau deshalb richtig: Es ist die Absicherung gegen eine
//     spätere Lockerung des Musters. Wer sich allein auf die Musterprüfung verlässt und das
//     Kodieren weglässt, hat beim ersten gelockerten Muster eine Einsetzstelle für
//     Pfadsegmente, die der Aufrufer bestimmt.
//  3. **Rückprüfung.** Der gebaute Pfad wird gegen die Vorlage zurückgeprüft: genau ein
//     Segment mehr als der Vorlagenstamm je Platzhalter. Schlägt das fehl, geht kein Byte
//     hinaus.
//  4. **Literale Pfade.** Die übrigen 50 Endpunkte tragen `literal` und können bauartbedingt
//     keinen interpolierten Pfad erzeugen.
//  5. **Kein Body-Feld.** Der Body trägt kein Feld für den Identifikator. Das erzwingen
//     `assertNoPathFieldInBody` und der Request-Mapper über `source: "path"`.
//  6. **Paar statt Zeichenkette.** Nachgeschlagen wird immer mit `specPath`, gesendet immer
//     mit dem gebauten Pfad; deshalb ein Paar als Rückgabewert.
//
// Pfadregel 6 ist der Grund, warum dieses Modul **immer ein Paar** zurückgibt und nie eine
// einzelne Zeichenkette: Fehlerkatalog, Deckungstest und Audit-Zeile schlüsseln nach
// `specPath`; mit dem gebauten Pfad fiele jeder Fehler dieser vier Werkzeuge auf
// „Paar fehlt" zurück, und die eingesetzte Geschäftskennung stünde im Protokoll.

import type { PathSpec, ToolEntry } from "../registry/types.js";

/**
 * Der erlaubte Wertevorrat eines Pfadsegments (Pfadregel 1): ausschließlich Ziffern, ein bis
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

/** Ein Pfad, der so nicht absetzbar ist. Es geht kein Byte hinaus (Pfadregel 3). */
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

/** Der Spezifikationspfad eines Eintrags, für beide Zweige der Union. */
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
 * Setzt die sechs Pfadregeln um, die im Kopf dieser Datei definiert sind: Musterprüfung vor
 * dem Einsetzen (1), `encodeURIComponent` danach (2), Rückprüfung des gebauten Pfades gegen
 * den Vorlagenstamm (3), literaler Zweig ohne Einsetzstelle (4), kein Identifikator im Body
 * (5, durchgesetzt von {@link assertNoPathFieldInBody}) und ein Paar aus gesendetem Pfad und
 * `specPath` als Rückgabewert (6). Jede der sechs Stellen im Rumpf nennt ihre Nummer.
 *
 * @param args Die **geprüften** Werkzeugargumente. Gelesen wird ausschließlich der Wert zum
 *             Namen des Pfadparameters.
 */
export function buildPath(
  entry: Pick<ToolEntry, "name" | "path">,
  args: Readonly<Record<string, unknown>>,
): BuiltPath {
  const specPath = specPathOf(entry.path);

  // Pfadregel 4: Der literale Zweig hat keine Vorlage und damit keine Einsetzstelle.
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

    // Pfadregel 1. Eine Zahl wird vorher in ihre Dezimalschreibweise überführt, weil das
    // Eingabeschema der Kennung `integer` ist und `4711` denselben Pfad ergibt wie
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

    // Pfadregel 2.
    requestPath = requestPath.replace(placeholder, encodeURIComponent(value));
  }

  // Pfadregel 3: Rückprüfung gegen den Vorlagenstamm.
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
 * Pfadregel 5 als Zusicherung: An den vier Endpunkten mit Pfadvorlage trägt der Body **kein**
 * Feld für den Identifikator.
 *
 * Das ist keine Auslassung, sondern deckungsgleich mit der Spezifikation: Maschinell geprüft
 * führt `/receipts/get/id_by_customer` als Parameter nur `api_key` und `get_file`, die drei
 * übrigen nur `api_key`. Der Identifikator kommt in der Parameterliste dieser vier Pfade
 * überhaupt nicht vor.
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
            "mit error_code 5 abgelehnt (live gemessen).",
        );
      }
    }
  }
}
