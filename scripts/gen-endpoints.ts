// Erzeugt src/generated/endpoints.ts aus docs/openapi/buchhaltungsbutler-v1.json.
//
// Der Generator zählt, er urteilt nicht. Er nimmt die Spezifikation so, wie sie
// ist — einschließlich ihrer bekannten Fehler — und macht die Fehler sichtbar, statt sie zu
// glätten: Array-Parameter ohne `items` werden markiert (32 Fälle), Parameter mit `schema`
// statt `type` werden aufgelöst und mit ihren Elementfeldern ausgegeben (9 Fälle), und aus
// den Beschreibungstexten wird ein Wertevorschlag gelesen, der ausdrücklich kein Schema ist.
//
// Was dieser Generator NICHT tut: Er erzeugt kein Zod-Schema und keinen Werkzeugeintrag.
// Die 54 Registerdateien werden von Hand geschrieben und gegen dieses Generat geprüft.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SPEC_FILE = `${ROOT}docs/openapi/buchhaltungsbutler-v1.json`;
const TARGET = `${ROOT}src/generated/endpoints.ts`;

// ---------------------------------------------------------------------------------------
// Die Teilmenge der Spezifikation, die dieser Generator liest. Bewusst eng getippt: Die
// Datei ist handgepflegt, und jede Annahme über ihren Aufbau soll hier stehen und nicht
// verstreut im Code.
// ---------------------------------------------------------------------------------------

interface SpecSchema {
  readonly $ref?: string;
  readonly type?: string;
  readonly format?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, SpecSchema>>;
  readonly required?: readonly string[];
  readonly items?: SpecSchema;
  readonly enum?: readonly unknown[];
}

interface SpecParameter {
  readonly in?: string;
  readonly name?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly type?: string;
  readonly format?: string;
  readonly default?: unknown;
  readonly items?: SpecSchema;
  readonly schema?: SpecSchema;
}

interface SpecResponse {
  readonly description?: string;
  readonly schema?: SpecSchema;
}

interface SpecOperation {
  readonly summary?: string;
  readonly description?: string;
  readonly parameters?: readonly SpecParameter[];
  readonly responses?: Readonly<Record<string, SpecResponse>>;
}

interface Spec {
  readonly info?: { readonly version?: string };
  readonly paths?: Readonly<Record<string, { readonly post?: SpecOperation }>>;
  readonly definitions?: Readonly<Record<string, SpecSchema>>;
}

function fail(message: string): never {
  process.stderr.write(`gen-endpoints: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------
// Textbereinigung
// ---------------------------------------------------------------------------------------

// Die Beschreibungen der Spezifikation enthalten HTML (`<br/>`, `<i>`, `<strong>`) und
// Entities (`&ldquo;`, `&auml;`). Beides gehört nicht in eine Werkzeugbeschreibung
// (grundlagen.md 8.26).
//
// Entfernt wird ausschließlich eine ABGESCHLOSSENE LISTE bekannter HTML-Elemente und nicht
// alles zwischen spitzen Klammern. Grund: Die Spezifikation verwendet spitze Klammern auch
// als Wertplatzhalter in Meldungstexten (`maximum file size is <max>MB`, `a receipt of type
// '<type>'`). Ein pauschales /<[^>]*>/ würde diese Platzhalter verschlucken und aus einer
// verständlichen Meldung eine unverständliche machen.
const HTML_TAG =
  /<\/?(?:br|i|b|em|strong|u|p|ul|ol|li|a|span|div|code|pre|small|sup|sub|h[1-6]|table|thead|tbody|tr|td|th|font)(?:\s[^<>]*)?\/?>/gi;
const LINE_BREAK_TAG = /<\s*\/?\s*br\s*\/?\s*>/gi;

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["ldquo", "“"],
  ["rdquo", "”"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ndash", "–"],
  ["mdash", "—"],
  ["hellip", "…"],
  ["auml", "ä"],
  ["ouml", "ö"],
  ["uuml", "ü"],
  ["Auml", "Ä"],
  ["Ouml", "Ö"],
  ["Uuml", "Ü"],
  ["szlig", "ß"],
  ["euro", "€"],
]);

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES.get(body) ?? whole;
  });
}

function cleanText(raw: string | undefined): string {
  if (raw === undefined) return "";
  // Reihenfolge ist bindend: erst Umbruch-Tags, dann übrige Tags, dann Entities. Würden die
  // Entities zuerst aufgelöst, könnte aus `&lt;br&gt;` ein Tag entstehen, das anschließend
  // entfernt würde — aus Text würde Markup.
  let text = raw.replace(LINE_BREAK_TAG, "\n").replace(HTML_TAG, "");
  text = decodeEntities(text);
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// ---------------------------------------------------------------------------------------
// Wertevorschlag aus dem Beschreibungstext
// ---------------------------------------------------------------------------------------

// Die Spezifikation führt keinen einzigen Parameter-`enum`. Wertevorräte stehen
// ausschließlich im Fließtext. Was hier herausgelesen wird, ist deshalb ein VORSCHLAG für
// den Menschen, der den Registereintrag schreibt, und niemals ein Schema.
// Ein zu enges Enum lehnt gültige Vorgänge schon vor dem Netzaufruf ab.
//
// Drei Quellen, in dieser Reihenfolge: eine Aufzählung mit „- " (der Wert steht dort vorn,
// die deutsche Bezeichnung dahinter in Klammern), ein Signalwort wie „Accepted values", und
// zuletzt ein Paar in geraden Anführungszeichen, das mit „or" oder „and" verbunden ist.
//
// Nicht gelesen werden Aufrufbeispiele. Ein Block, der mit „Usage:" oder „Example:" beginnt,
// zeigt die FORM des Parameters und nennt Platzhalter wie „Item 1"; würden sie als Vorschlag
// ausgegeben, führte das geradewegs zu einem Enum aus Beispieltext.
const VALUE_TRIGGERS =
  /((?<!cannot |can not )can be either|accepted values?|possible values?|allowed values?|possible fields are|valid values?|must be one of|has to be|we support the following [a-z]+|(?<!cannot |can not )we accept)/i;

const EXAMPLE_BLOCK = /^(?:usage|example|examples|beispiel|beispiele)\b\s*:?/i;
const LIST_ITEM = /^-\s+([^\s(]{1,40})/;
const QUOTED = /'([^'\n]{1,40})'|"([^"\n]{1,40})"/g;
const PLAIN_VALUE = /^[A-Za-z0-9_][A-Za-z0-9_ /.+-]{0,39}$/;

function extractValuesFromText(text: string, ownName: string): string[] {
  if (text.length === 0) return [];
  const found: string[] = [];
  const push = (value: string): void => {
    const trimmed = value
      .trim()
      .replace(/[.,;:]+$/, "")
      .trim();
    if (trimmed.length === 0 || trimmed.length > 40) return;
    // Der eigene Parametername ist kein Wert. Er steht in den Aufrufbeispielen der
    // Spezifikation als Schlüssel und würde sonst als erster Vorschlag erscheinen.
    if (trimmed === ownName) return;
    if (!found.includes(trimmed)) found.push(trimmed);
  };

  const kept = text
    .split("\n\n")
    .filter((block) => !EXAMPLE_BLOCK.test(block.trimStart()))
    .join("\n\n");
  if (kept.length === 0) return [];

  // 1. Aufzählung mit „- ". Sie trägt den maschinenlesbaren Wert vorn; die Klammer dahinter
  //    ist die Anzeigebezeichnung und ausdrücklich NICHT der zu sendende Wert.
  const listValues: string[] = [];
  for (const line of kept.split("\n")) {
    const match = LIST_ITEM.exec(line.trim());
    const value = match?.[1];
    if (value !== undefined) listValues.push(value);
  }
  if (listValues.length >= 2) {
    for (const value of listValues) push(value);
    return found.slice(0, 60);
  }

  // 2. Der Abschnitt hinter einem Signalwort bis zur nächsten Leerzeile.
  const trigger = VALUE_TRIGGERS.exec(kept);
  if (trigger !== null) {
    const rest = kept.slice(trigger.index);
    const block = rest.split("\n\n")[0] ?? rest;
    const quoted = [...block.matchAll(QUOTED)];
    if (quoted.length > 0) {
      for (const match of quoted) {
        const value = match[1] ?? match[2];
        if (value !== undefined) push(value);
      }
    } else {
      const head = block.replace(VALUE_TRIGGERS, "").replace(/^\s*(?:are|is)?\s*:?\s*/i, "");
      for (const raw of head.split(/[,\n]|\band\b|\bor\b/)) {
        const candidate = raw.replace(/^[-\s]+/, "").trim();
        if (PLAIN_VALUE.test(candidate)) push(candidate);
      }
    }
    if (found.length > 0) return found.slice(0, 60);
  }

  // 3. Ein Paar in geraden Anführungszeichen, verbunden mit „or" oder „and". Typografische
  //    Anführungszeichen aus &ldquo;/&rdquo; bleiben außen vor: Sie umschließen in dieser
  //    Spezifikation deutsche Übersetzungen („Eingangsbelege"), keine Werte.
  if (/'[^'\n]{1,40}'\s*(?:,|or|and)\s*'/i.test(kept)) {
    for (const match of kept.matchAll(QUOTED)) {
      const value = match[1] ?? match[2];
      if (value !== undefined) push(value);
    }
  }

  return found.slice(0, 60);
}

// ---------------------------------------------------------------------------------------
// Auflösung von $ref
// ---------------------------------------------------------------------------------------

const spec = JSON.parse(readFileSync(SPEC_FILE, "utf8")) as Spec;
const definitions = spec.definitions ?? {};
const paths = spec.paths ?? {};

function resolveRef(ref: string): SpecSchema {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix)) fail(`Unbekannte Referenzform: ${ref}`);
  const name = ref.slice(prefix.length);
  const target = definitions[name];
  if (target === undefined) fail(`Referenz zeigt ins Leere: ${ref}`);
  return target;
}

// Folgt einer Kette von $ref bis zum ersten Schema mit eigenem Inhalt. Der Zähler bricht
// eine Referenzschleife ab, statt den Generator hängen zu lassen.
function deref(schema: SpecSchema): SpecSchema {
  let current = schema;
  for (let hop = 0; hop < 10; hop += 1) {
    const ref = current.$ref;
    if (ref === undefined) return current;
    current = resolveRef(ref);
  }
  fail("Referenzkette länger als zehn Sprünge; vermutlich eine Schleife.");
}

// ---------------------------------------------------------------------------------------
// Das Generat
// ---------------------------------------------------------------------------------------

interface ItemField {
  readonly name: string;
  readonly specType: string;
  readonly required: boolean;
  readonly description: string;
  readonly itemsMissing: boolean;
  readonly valuesFromText: readonly string[];
  readonly specEnum?: readonly unknown[];
}

interface SchemaInfo {
  readonly ref?: string;
  readonly containerType: string;
  readonly itemRef?: string;
  readonly itemRequired: readonly string[];
  readonly itemFields: readonly ItemField[];
  readonly requiredWithoutProperty: readonly string[];
}

interface Parameter {
  readonly name: string;
  readonly specType: string;
  readonly required: boolean;
  readonly description: string;
  readonly valuesFromText: readonly string[];
  readonly itemsMissing: boolean;
  readonly format?: string;
  readonly default?: unknown;
  readonly ref?: string;
  readonly schema?: SchemaInfo;
}

interface SuccessField {
  readonly name: string;
  readonly specType: string;
  readonly container: "envelope" | "data";
}

interface Endpoint {
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly parameters: readonly Parameter[];
  readonly successDefinition: string;
  readonly successShape: "list" | "object" | "ack";
  readonly successFields: readonly SuccessField[];
}

function describeItemFields(container: SpecSchema): {
  itemRef?: string;
  itemRequired: string[];
  itemFields: ItemField[];
  requiredWithoutProperty: string[];
} {
  // Der Behälter ist entweder ein Array (acht Stapelparameter) oder ein Objekt (der
  // Platzhalter `order` an /receipts/get). Bei einem Array liegen Eigenschaften und
  // `required` unter `.items`. In docs/openapi/buchhaltungsbutler-v1.json trägt genau ein
  // Knoten `required` unterhalb eines `.items`: `definitions.PostingsFree.items`.
  const rawElement = container.type === "array" ? container.items : container;
  if (rawElement === undefined) {
    return { itemRequired: [], itemFields: [], requiredWithoutProperty: [] };
  }
  const itemRef = rawElement.$ref;
  const element = deref(rawElement);
  const properties = element.properties ?? {};
  const required = [...(element.required ?? [])];
  const fields: ItemField[] = [];
  for (const [name, propertyRaw] of Object.entries(properties)) {
    const property = deref(propertyRaw);
    const description = cleanText(property.description);
    const field: ItemField = {
      name,
      specType: property.type ?? "(schema)",
      required: required.includes(name),
      description,
      itemsMissing: property.type === "array" && property.items === undefined,
      valuesFromText: extractValuesFromText(description, name),
      ...(property.enum === undefined ? {} : { specEnum: [...property.enum] }),
    };
    fields.push(field);
  }
  // PostingsFree führt `amounts` in `required`, hat aber nur `amount`. Der Befund wird
  // nicht stillschweigend geglättet, sondern ausgegeben: Der Deckungstest kennt ihn als
  // benannten Ausnahmeeintrag.
  const requiredWithoutProperty = required.filter((name) => !(name in properties));
  return {
    ...(itemRef === undefined ? {} : { itemRef }),
    itemRequired: required,
    itemFields: fields,
    requiredWithoutProperty,
  };
}

function successInfo(
  response: SpecResponse | undefined,
  path: string,
): {
  successDefinition: string;
  successShape: "list" | "object" | "ack";
  successFields: SuccessField[];
} {
  const ref = response?.schema?.$ref;
  if (ref === undefined) fail(`Pfad ${path} führt keine 200er-Antwort mit $ref.`);
  const definition = resolveRef(ref);
  const properties = definition.properties ?? {};
  const fields: SuccessField[] = [];
  for (const [name, propertyRaw] of Object.entries(properties)) {
    const property = deref(propertyRaw);
    fields.push({ name, specType: property.type ?? "(schema)", container: "envelope" });
  }
  const dataRaw = properties["data"];
  const data = dataRaw === undefined ? undefined : deref(dataRaw);
  let shape: "list" | "object" | "ack" = "ack";
  let payload: SpecSchema | undefined;
  if (data !== undefined && data.type === "array") {
    shape = "list";
    payload = data.items === undefined ? undefined : deref(data.items);
  } else if (data !== undefined) {
    shape = "object";
    payload = data;
  }
  if (payload !== undefined) {
    for (const [name, propertyRaw] of Object.entries(payload.properties ?? {})) {
      const property = deref(propertyRaw);
      fields.push({ name, specType: property.type ?? "(schema)", container: "data" });
    }
  }
  return {
    successDefinition: ref.slice("#/definitions/".length),
    successShape: shape,
    successFields: fields,
  };
}

const endpoints: Endpoint[] = [];
let parameterCount = 0;
let itemsMissingCount = 0;
let schemaParameterCount = 0;

// Die Reihenfolge der Pfade ist die der Spezifikationsdatei. Damit spiegelt der Diff des
// Generats die Änderung der Quelle und nicht eine Umsortierung.
for (const [path, item] of Object.entries(paths)) {
  const operation = item.post;
  if (operation === undefined) fail(`Pfad ${path} führt keine post-Operation.`);
  const parameters: Parameter[] = [];
  for (const raw of operation.parameters ?? []) {
    const name = raw.name;
    if (name === undefined) fail(`Pfad ${path} führt einen Parameter ohne Namen.`);
    const description = cleanText(raw.description);
    const itemsMissing = raw.type === "array" && raw.items === undefined;
    if (itemsMissing) itemsMissingCount += 1;
    const schema = raw.schema;
    if (schema !== undefined) schemaParameterCount += 1;
    const container = schema === undefined ? undefined : deref(schema);
    const parameter: Parameter = {
      name,
      specType: raw.type ?? "(schema)",
      required: raw.required === true,
      description,
      valuesFromText: extractValuesFromText(description, name),
      itemsMissing,
      ...(raw.format === undefined ? {} : { format: raw.format }),
      ...("default" in raw ? { default: raw.default } : {}),
      ...(schema?.$ref === undefined ? {} : { ref: schema.$ref }),
      ...(schema === undefined || container === undefined
        ? {}
        : {
            schema: {
              ...(schema.$ref === undefined ? {} : { ref: schema.$ref }),
              containerType: container.type ?? "(schema)",
              ...describeItemFields(container),
            },
          }),
    };
    parameters.push(parameter);
    parameterCount += 1;
  }
  endpoints.push({
    path,
    summary: cleanText(operation.summary),
    description: cleanText(operation.description),
    parameters,
    ...successInfo(operation.responses?.["200"], path),
  });
}

// ---------------------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------------------

const specVersion = spec.info?.version ?? "unbekannt";

const header = `// ERZEUGT von scripts/gen-endpoints.ts aus docs/openapi/buchhaltungsbutler-v1.json.
// NICHT VON HAND ÄNDERN. Änderungen entstehen ausschließlich über \`pnpm generate\`; der
// CI-Schritt verlangt danach eine leere git-Differenz.
//
// Quelle: BuchhaltungsButler API, info.version ${specVersion}.
//
// Diese Datei ist die maschinelle Wahrheit über den UMFANG der API: ${endpoints.length} Pfade mit
// zusammen ${parameterCount} Body-Parametern. Sie ist ausdrücklich KEIN Auslieferungsschema. Die
// Spezifikation ist handgepflegt und nachweislich fehlerhaft; ihre Fehler sind hier sichtbar
// gemacht statt geglättet:
//
//   - itemsMissing: ${itemsMissingCount} Array-Parameter führen kein \`items\`, darunter alle parallelen Arrays.
//   - schema:      ${schemaParameterCount} Parameter führen \`schema\` statt \`type\`; ihr Elementaufbau ist hier aufgelöst.
//   - valuesFromText: aus dem Fließtext gelesener VORSCHLAG. Die Spezifikation führt keinen
//     einzigen Parameter-\`enum\`; ein zu enges Enum lehnt gültige Vorgänge vor dem Netzaufruf ab.
//   - successFields: Feldname und Typ laut Spezifikation. AUSDRÜCKLICH UNZUVERLÄSSIG — die API
//     liefert nachweislich Felder, die die Spezifikation nicht kennt, und verwendet zwischen
//     Listen- und Einzelabruf verschiedene Namen.
//
// Die vier Pfade mit dem Segment \`id_by_customer\` stehen hier UNVERÄNDERT. Das Segment ist
// ein Platzhalter für den Wert und kein literales Segment; der Pfadbau geschieht
// in src/mapping/path.ts, nachgeschlagen wird weiterhin mit dem Spezifikationspfad.
`;

const types = `
/** Ein Feld eines Stapelelements, aufgelöst über \`$ref\`. */
export interface GeneratedItemField {
  readonly name: string;
  readonly specType: string;
  readonly required: boolean;
  readonly description: string;
  readonly itemsMissing: boolean;
  readonly valuesFromText: readonly string[];
  /** Ein \`enum\` der Spezifikation, sofern vorhanden. Nicht ungeprüft als Wertevorrat übernehmen. */
  readonly specEnum?: readonly unknown[];
}

/** Der aufgelöste Aufbau eines Parameters, der \`schema\` statt \`type\` führt. */
export interface GeneratedSchemaInfo {
  readonly ref?: string;
  readonly containerType: string;
  readonly itemRef?: string;
  readonly itemRequired: readonly string[];
  readonly itemFields: readonly GeneratedItemField[];
  /** Namen aus \`required\`, zu denen es keine Eigenschaft gibt. */
  readonly requiredWithoutProperty: readonly string[];
}

/** Ein Body-Parameter genau so, wie die Spezifikation ihn führt. */
export interface GeneratedParameter {
  readonly name: string;
  readonly specType: string;
  readonly required: boolean;
  readonly description: string;
  readonly valuesFromText: readonly string[];
  readonly itemsMissing: boolean;
  readonly format?: string;
  readonly default?: unknown;
  readonly ref?: string;
  readonly schema?: GeneratedSchemaInfo;
}

/** Ein Feld der 200er-Antwort laut Spezifikation. Unzuverlässig, siehe Dateikopf. */
export interface GeneratedSuccessField {
  readonly name: string;
  readonly specType: string;
  readonly container: "envelope" | "data";
}

/** Ein Endpunkt der Spezifikation. Der Pfad ist unverändert der Spezifikationspfad. */
export interface GeneratedEndpoint {
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly parameters: readonly GeneratedParameter[];
  readonly successDefinition: string;
  readonly successShape: "list" | "object" | "ack";
  readonly successFields: readonly GeneratedSuccessField[];
}
`;

const body = `
/** Alle Endpunkte der Spezifikation, in deren Reihenfolge. */
export const ENDPOINTS: readonly GeneratedEndpoint[] = ${JSON.stringify(endpoints, null, 2)};

/** Nachschlagen nach dem unveränderten Spezifikationspfad. */
export const ENDPOINTS_BY_PATH: ReadonlyMap<string, GeneratedEndpoint> = new Map(
  ENDPOINTS.map((endpoint) => [endpoint.path, endpoint]),
);
`;

// Das Ausgabeverzeichnis kann fehlen — in einem frischen Klon ebenso wie nach einem
// Aufräumen von src/generated. Es wird deshalb vor dem Schreiben angelegt, statt den
// Generator mit ENOENT abbrechen zu lassen.
mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, `${header}${types}${body}`, "utf8");

process.stderr.write(
  `gen-endpoints: src/generated/endpoints.ts geschrieben — ${endpoints.length} Pfade, ` +
    `${parameterCount} Parameter, ${itemsMissingCount} Arrays ohne items, ` +
    `${schemaParameterCount} Parameter mit schema.\n`,
);
