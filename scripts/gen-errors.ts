// Erzeugt src/generated/errors.ts aus docs/openapi/buchhaltungsbutler-v1.json.
//
// Der Schlüssel des Katalogs ist IMMER das Paar (Pfad, error_code) und nie der Code allein.
// Über die 786 referenzierten Paare trägt Code 7 achtundzwanzig verschiedene Bedeutungen,
// und Code 15 heißt an /receipts/get „invalid sort field specified" (HTTP 400), an zehn
// schreibenden Pfaden dagegen „adding temporarily restricted" (HTTP 403). Wer ihn global
// als Drosselung behandelt, wartet bei einem Tippfehler im Sortierfeld 60 Sekunden.
//
// Grundmenge sind die 786 in `responses` REFERENZIERTEN Paare, nicht die 718
// Definitionsnamen: 42 Definitionen kommen in keinem responses-Block vor und sind damit
// kein belegtes Serververhalten.
//
// Je Paar entstehen ZWEI Texte, und keiner wird aus dem anderen abgeleitet:
//   message: properties.message.enum[0] der über $ref aufgelösten Definition — die einzige
//            Angabe der Datei über den WERT des Antwortfeldes `message`. Verbindliche Quelle.
//   summary: responses[…].description — die kürzere Fassung für den Block [Was].
// Der Generator gibt die Zahl der Paare aus, bei denen beide abweichen; ein Test hält sie
// fest, weil eine veränderte Zahl eine veränderte Spezifikationsdatei anzeigt.
//
// KEINER der beiden Texte darf als Wortlaut der API ausgegeben werden: Live gemessen kam an
// /receipts/get zu Code 15 der Text „invalid field specified" und damit keine der beiden
// Quellen.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SPEC_FILE = `${ROOT}docs/openapi/buchhaltungsbutler-v1.json`;
const TARGET = `${ROOT}src/generated/errors.ts`;

interface SpecSchema {
  readonly $ref?: string;
  readonly type?: string;
  readonly properties?: Readonly<Record<string, SpecSchema>>;
  readonly enum?: readonly unknown[];
}

interface SpecResponse {
  readonly description?: string;
  readonly schema?: SpecSchema;
}

interface SpecParameter {
  readonly name?: string;
}

interface SpecOperation {
  readonly parameters?: readonly SpecParameter[];
  readonly responses?: Readonly<Record<string, SpecResponse>>;
}

interface Spec {
  readonly info?: { readonly version?: string };
  readonly paths?: Readonly<Record<string, { readonly post?: SpecOperation }>>;
  readonly definitions?: Readonly<Record<string, SpecSchema>>;
}

type ErrorClass = "config" | "input" | "transient" | "final" | "special";

function fail(message: string): never {
  process.stderr.write(`gen-errors: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------
// Handgeprüfte Festlegungen
//
// Die Klassenspalte wird hier aus Pfad, Code, HTTP-Status und Meldungstext BESTIMMT und
// nicht zur Laufzeit geraten. Alles, was nicht aus einem Muster folgt, steht als benannte
// Ausnahme in diesen Tabellen — damit ist die Handprüfung im Diff sichtbar und bleibt
// beim nächsten Generatorlauf erhalten.
// ---------------------------------------------------------------------------------------

// Die zehn Pfade, die error_code 15 mit HTTP 403 als vorübergehende Drosselung führen.
// /transactions/add rutscht leicht durch: Es ist weder Stapel- noch Upload-Endpunkt, trägt
// aber dieselbe Meldung. Eine Regel, die nur Stapel und Upload nennt, stufte es als `final`
// ein und sagte dem Agenten bei einer echten Drosselung, ein späterer Versuch helfe nicht.
const THROTTLE_PATHS: readonly string[] = [
  "/receipts/addBatch",
  "/receipts/upload",
  "/transactions/add",
  "/transactions/addBatch",
  "/transactions/assign-batch/receipt",
  "/postings/add-batch/receipts",
  "/postings/add-batch/transactions",
  "/postings/add-batch/free",
  "/settings/add-batch/debtors",
  "/settings/add-batch/creditors",
];

// Paare, deren Bedeutung ohne den Meldungstext nicht eindeutig ist (Klasse
// `special`). Die Fallunterscheidung in errors/classify.ts läuft über Teilzeichenketten
// ohne Rücksicht auf Groß- und Kleinschreibung, niemals über Gleichheit.
//
// Bei den Berichtspfaden sind die Codes 8 und 12 ABSICHTLICH auf die Pfade eingegrenzt, an
// denen sie den Zwischenstand meinen: Code 8 heißt nur an /reports/get/bwa und
// /reports/get/sums „report generation has not been finished yet", an /reports/create/sums
// dagegen „invalid base specified"; Code 12 heißt nur an /reports/create/bwa und
// /reports/create/sums „report generation already in progress", an /reports/get/sums/ledger
// dagegen „invalid date_from specified". Eine Regel über alle Berichtspfade träfe die
// falschen Paare.
const SPECIAL_PAIRS: ReadonlySet<string> = new Set([
  "/transactions/add|23",
  "/transactions/add|24",
  "/invoices/create/e-invoice|41",
  "/invoices/create/e-invoice|42",
  "/reports/get/bwa|8",
  "/reports/get/sums|8",
  "/reports/create/bwa|12",
  "/reports/create/sums|12",
]);

// Meldungen, die einen Zustand oder ein Kontingent benennen und deshalb `final` sind, auch
// wenn sie zufällig wie eine Eingabeprüfung klingen. Reihenfolge ohne Bedeutung, Vergleich
// ohne Rücksicht auf Groß- und Kleinschreibung.
const FINAL_PATTERNS: readonly string[] = [
  "not found",
  "does not exist",
  "was not found",
  "already exists",
  "already deleted",
  "already been posted",
  "already created",
  "already in progress",
  "reached the upload limit",
  "not processable",
  "ocr processing failed",
  "cannot be",
  "can´t be",
  "can't be",
  "cannot posted",
  "could not be",
  "not allowed",
  "may not be deleted",
  "is deleted",
  "not marked as deleted",
  "restoration of receipt failed",
  "assignment failed",
  "has not been finished",
  "no postings to unconfirm",
  "fixed postings",
  "unavailable",
  "is not available",
  "not be booked manually",
  "must be posted",
  "does not match",
  "not valid",
  "does not allow postings",
  // Betragsprüfungen (Zeile `final`).
  "total amount",
  // Zustand einer Stammdatenzeile, nicht ein falsch getippter Wert.
  "vat option for account",
  "tax key is invalid",
  "creditor/debtor is invalid",
];

// Bewusst NICHT in dieser Liste: das Muster „is invalid" als Ganzes und das Muster
// „exceeded". „the date delivery is invalid" ist eine Feldprüfung, und
// „Number of receipts exceeded" nennt eine überschrittene Stapelgrenze — in beiden Fällen
// hilft dem Agenten die Antwort der Klasse `input` („sende diesen Wert anders"), nicht die
// der Klasse `final` („dieser Zustand lässt sich nicht ändern").

// Der Wortlaut „not activated" ist der Beleg für eine Kontoeinstellung und nicht für eine
// falsche Eingabe. Ein Muster auf „is not activated" fände nur zwei der vier belegten Texte.
const CONFIG_PATTERN = "not activated";

// Ein Feldname, den kein Muster aus dem Meldungstext holen kann: „invalid sort field
// specified" meint den Parameter `order` (Beispieltabelle).
const FIELD_OVERRIDES: ReadonlyMap<string, string> = new Map([["/receipts/get|15", "order"]]);

// ---------------------------------------------------------------------------------------

const spec = JSON.parse(readFileSync(SPEC_FILE, "utf8")) as Spec;
const definitions = spec.definitions ?? {};
const paths = spec.paths ?? {};

function messageOf(ref: string): string {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix)) fail(`Unbekannte Referenzform: ${ref}`);
  // Aufgelöst wird über die $ref und ausdrücklich NICHT über den Definitionsnamen: Die
  // Namensregel der Datei scheitert bei fünf Endpunkten.
  const definition = definitions[ref.slice(prefix.length)];
  if (definition === undefined) fail(`Referenz zeigt ins Leere: ${ref}`);
  const enumValues = definition.properties?.["message"]?.enum;
  if (enumValues === undefined || enumValues.length === 0) {
    fail(`Definition ${ref} führt kein properties.message.enum.`);
  }
  const first = enumValues[0];
  if (typeof first !== "string") fail(`Definition ${ref} führt ein message-enum ohne Text.`);
  return first;
}

function classify(path: string, code: number, status: number, message: string): ErrorClass {
  const lower = message.toLowerCase();
  // 1. Zugangsdaten und Kontoeinstellungen. Codes 3, 4 und 11 tragen endpunktübergreifend
  //    dieselbe Bedeutung; dazu die vier belegten „not activated"-Texte.
  if (code === 3 || code === 4 || code === 11 || lower.includes(CONFIG_PATTERN)) return "config";
  // 2. Vorübergehend. Code 0 mit HTTP 500, Code 30 mit HTTP 504 und Code 15 an den zehn
  //    Pfaden mit HTTP 403. Unterschieden wird über den STATUS, nicht über den Wortlaut.
  if (code === 0 && status === 500) return "transient";
  if (code === 30 && status === 504) return "transient";
  if (code === 15 && status === 403 && THROTTLE_PATHS.includes(path)) return "transient";
  // 3. Benannte Sonderfälle.
  if (SPECIAL_PAIRS.has(`${path}|${code}`)) return "special";
  // 4. Zustände, Konflikte, Kontingente.
  if (FINAL_PATTERNS.some((pattern) => lower.includes(pattern))) return "final";
  // 5. Alles Übrige ist eine Eingabeprüfung — die große Mehrheit ab Code 5.
  return "input";
}

const FIELD_PATTERNS: readonly RegExp[] = [
  /^(?:invalid|no) ([a-zA-Z0-9_ ]+?) specified/,
  /^no or invalid ([a-zA-Z0-9_]+) specified/,
  /^no ([a-zA-Z0-9_]+) is specified/,
  /^[Pp]arameter ([a-zA-Z0-9_]+) (?:must be|is required)/,
];

function fieldOf(
  path: string,
  code: number,
  message: string,
  parameterNames: ReadonlySet<string>,
): string | undefined {
  const override = FIELD_OVERRIDES.get(`${path}|${code}`);
  if (override !== undefined) return override;
  for (const pattern of FIELD_PATTERNS) {
    const match = pattern.exec(message);
    const raw = match?.[1];
    if (raw === undefined) continue;
    // Die Spezifikation schreibt Feldnamen in Meldungen teils als Prosa („payment
    // reference" statt `payment_reference"). Übernommen wird nur, was sich auf einen
    // Parameter DIESES Pfades abbilden lässt; alles andere bleibt leer, statt zu raten.
    for (const candidate of [raw, raw.replace(/ /g, "_"), raw.replace(/ /g, "")]) {
      if (parameterNames.has(candidate)) return candidate;
    }
  }
  return undefined;
}

interface Entry {
  readonly status: number;
  readonly message: string;
  readonly summary: string;
  readonly cls: ErrorClass;
  readonly field?: string;
}

const catalog: Record<string, Record<string, Entry>> = {};
let pairCount = 0;
let divergingCount = 0;
const byClass: Record<ErrorClass, number> = {
  config: 0,
  input: 0,
  transient: 0,
  final: 0,
  special: 0,
};

const RESPONSE_KEY = /^(\d{3}) \((\d+)\)$/;

for (const [path, item] of Object.entries(paths)) {
  const operation = item.post;
  if (operation === undefined) fail(`Pfad ${path} führt keine post-Operation.`);
  const parameterNames = new Set<string>();
  for (const parameter of operation.parameters ?? []) {
    if (parameter.name !== undefined) parameterNames.add(parameter.name);
  }
  const entries: Record<string, Entry> = {};
  const codes: number[] = [];
  for (const [key, response] of Object.entries(operation.responses ?? {})) {
    // Die Schlüssel haben die Form "400 (5)". Der Schlüssel "200" ist die Erfolgsantwort
    // und gehört nicht in den Fehlerkatalog.
    const match = RESPONSE_KEY.exec(key);
    if (match === null) {
      if (key !== "200") fail(`Pfad ${path} führt den unbekannten Antwortschlüssel ${key}.`);
      continue;
    }
    const status = Number.parseInt(match[1] ?? "", 10);
    const code = Number.parseInt(match[2] ?? "", 10);
    const ref = response.schema?.$ref;
    if (ref === undefined) fail(`Pfad ${path}, Antwort ${key} führt keine $ref.`);
    const message = messageOf(ref);
    const summary = (response.description ?? "").trim();
    if (summary.length === 0) fail(`Pfad ${path}, Antwort ${key} führt keine description.`);
    if (entries[String(code)] !== undefined) {
      fail(`Pfad ${path} führt den error_code ${code} zweimal.`);
    }
    if (message !== summary) divergingCount += 1;
    const cls = classify(path, code, status, message);
    byClass[cls] += 1;
    const field = fieldOf(path, code, message, parameterNames);
    entries[String(code)] = {
      status,
      message,
      summary,
      cls,
      ...(field === undefined ? {} : { field }),
    };
    codes.push(code);
    pairCount += 1;
  }
  // Codes aufsteigend, damit der Katalog lesbar ist und die Reihenfolge nicht an der
  // Reihenfolge der Antwortblöcke in der Spezifikation hängt.
  codes.sort((a, b) => a - b);
  const sorted: Record<string, Entry> = {};
  for (const code of codes) {
    const entry = entries[String(code)];
    if (entry === undefined) fail(`Interner Fehler: Eintrag zu ${path} Code ${code} fehlt.`);
    sorted[String(code)] = entry;
  }
  // Erste Ebene ist der UNVERÄNDERTE Spezifikationspfad — auch bei den vier Pfaden mit dem
  // Platzhaltersegment id_by_customer. Nachgeschlagen wird zur Laufzeit mit path.specPath
  // und nie mit dem gebauten Pfad.
  catalog[path] = sorted;
}

const specVersion = spec.info?.version ?? "unbekannt";

const output = `// ERZEUGT von scripts/gen-errors.ts aus docs/openapi/buchhaltungsbutler-v1.json.
// NICHT VON HAND ÄNDERN. Änderungen entstehen ausschließlich über \`pnpm generate\`; der
// CI-Schritt verlangt danach eine leere git-Differenz.
//
// Quelle: BuchhaltungsButler API, info.version ${specVersion}.
//
// ${pairCount} Paare (Pfad, error_code) über ${Object.keys(catalog).length} Pfade. Bei ${divergingCount} Paaren weichen
// \`message\` und \`summary\` voneinander ab; die Zahl ist ein Driftanzeiger und wird von
// test/unit/generated.test.ts festgehalten.
//
// Verteilung der Klassen: config ${byClass.config}, input ${byClass.input}, transient ${byClass.transient}, final ${byClass.final}, special ${byClass.special}.
//
// ZWEI REGELN FÜR JEDEN, DER DIESEN KATALOG LIEST:
//   1. Kein Text aus dieser Datei wird als Wortlaut der API ausgegeben. Zitiert wird das
//      \`message\`-Feld der TATSÄCHLICHEN Antwort. Der Katalogtext tritt nur ein, wenn die
//      Antwort keinen verwertbaren Text trägt, und dann mit dem Zusatz „Text laut
//      Spezifikation, nicht der Wortlaut dieser Antwort".
//   2. Keine Weiche vergleicht auf Gleichheit mit einem Katalogtext. Klassifikation und
//      Retry entscheiden über (specPath, error_code, HTTP-Status).
//
// Der Katalog wird dynamisch geladen und gelangt nie vollständig in den Modellkontext.

/** Die fünf Fehlerklassen. */
export type ErrorClass = "config" | "input" | "transient" | "final" | "special";

/** Ein Paar (Pfad, error_code) mit beiden Texten der Spezifikation. */
export interface ErrorEntry {
  /** Der HTTP-Status, unter dem die Spezifikation dieses Paar führt. */
  readonly status: number;
  /** properties.message.enum[0] der aufgelösten Definition. Verbindliche Katalogquelle. */
  readonly message: string;
  /** responses[…].description. Kurze Fassung für den Block [Was]. */
  readonly summary: string;
  /** Beim Erzeugen bestimmt, nicht zur Laufzeit geraten. */
  readonly cls: ErrorClass;
  /** Der Parameter dieses Pfades, auf den sich die Meldung bezieht, sofern eindeutig. */
  readonly field?: string;
}

/**
 * Schlüssel der ersten Ebene ist IMMER der Spezifikationspfad, bei den vier Werkzeugen mit
 * Pfadvorlage also \`path.specPath\` und nicht der gebaute Pfad. Schlüssel der
 * zweiten Ebene ist der \`error_code\`.
 */
export const ERRORS: Record<string, Record<number, ErrorEntry>> = ${JSON.stringify(catalog, null, 2)};
`;

// Das Ausgabeverzeichnis kann fehlen — in einem frischen Klon ebenso wie nach einem
// Aufräumen von src/generated. Es wird deshalb vor dem Schreiben angelegt, statt den
// Generator mit ENOENT abbrechen zu lassen.
mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, output, "utf8");

process.stderr.write(
  `gen-errors: src/generated/errors.ts geschrieben — ${pairCount} Paare über ` +
    `${Object.keys(catalog).length} Pfade, ${divergingCount} davon mit message !== summary; ` +
    `Klassen: config ${byClass.config}, input ${byClass.input}, transient ${byClass.transient}, ` +
    `final ${byClass.final}, special ${byClass.special}.\n`,
);
