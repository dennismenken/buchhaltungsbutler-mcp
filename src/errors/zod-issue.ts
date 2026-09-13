// Die deutsche Aufbereitung eines Zod-Befundes. Eine Stelle für beide Registrierpfade.
//
// **Warum das Modul existiert.** Der Text eines Schemaverstoßes entsteht an zwei Stellen: in
// `src/server/register-tools.ts` für die 54 Endpunktwerkzeuge und in `src/bundles/register.ts`
// für die fünf Bündelwerkzeuge. Solange beide ihre eigene Fassung hatten, lieferte derselbe
// Fehler zwei verschiedene Antworten: `bb_transactions_get` schrieb
// „transaction_id_by_customer: erwartet wird number, übergeben wurde die Zeichenkette '930'.",
// `bb_assignments_get` bei wörtlich derselben Eingabe „Invalid input: expected number, received
// string". Das ist zweierlei — ein Bruch der Sprachregel, und schwerer wiegend
// ein Verlust an Information: Die englische Fassung sagt bei einem fehlenden Pflichtfeld
// „expected string, received undefined" und damit dasselbe wie bei einem Typfehler, während
// die deutsche „das Feld fehlt" schreibt. Genau diese Unterscheidung zwischen „nachtragen" und
// „umformen" ist der Zweck der Meldung; ihr Fehlen hat im Evaluationslauf den Irrweg aus
// im Evaluationslauf beobachtet.
//
// Deshalb gibt es diese Aufbereitung ab hier genau einmal. Beide Registrierpfade rufen
// {@link joinIssues} mit ihren Rohargumenten auf; eine zweite Fassung entsteht nicht wieder.
//
// Das Modul kennt weder Werkzeug noch Eintrag: Es bekommt Befunde und die Rohargumente und
// gibt Text zurück. Der Vierblockaufbau der Absage bleibt Sache der beiden Aufrufer.
//
// **Zur Schwärzung.** Die beiden zusammengeführten Fassungen waren hier verschieden: Der
// Bündelpfad ließ jeden Befundtext durch `sanitizeText`, der Endpunktpfad keinen. Übernommen
// ist die jeweils strengere Handhabung, damit keiner der beiden Pfade durch das Zusammenlegen
// eine Absicherung verliert. Sie trifft genau die zwei Stellen, an denen Text des Aufrufers in
// die Meldung gerät: die Schlüsselnamen eines `unrecognized_keys` und den Meldungstext im
// `default`-Zweig, in den die Querprüfungen übergebene Werte einsetzen (Q1 nennt `date_from`
// und `date_to` wörtlich). Ohne sie könnte ein Feldname mit Zeilenumbruch einen weiteren
// `[Wie]`-Block vortäuschen oder ein Pipe-Zeichen das Trennzeichen {@link ISSUE_SEPARATOR}
// nachahmen. Für gewöhnliche Bezeichner und die deutschen Texte der Schemaschicht ändert
// `sanitizeText` nichts.

import type { z } from "zod";

import { sanitizeText } from "../response/sanitize.js";
import { pathLabel } from "./path-label.js";

/**
 * Der Ort eines Schemaverstoßes in der Schreibweise des Werkzeugschemas.
 *
 * Die Schreibweise steht in `errors/path-label.ts` und gilt für jede Meldung dieses Servers:
 * `items (Position 2).item_amount` und niemals `items[2]`. Eine Klammer, die ab 1 zählt, sagt
 * einem Sprachmodell das dritte Element, wenn sie das zweite meint.
 */
function issueLocation(path: readonly (string | number | symbol)[]): string {
  return path.length === 0 ? "der Aufruf" : pathLabel(path);
}

/**
 * Der tatsächlich übergebene Wert an der Stelle, die ein Befund nennt.
 *
 * Zod 4 führt den Wert im fertigen Issue **nicht** mehr; `issue.input` ist zur Laufzeit
 * `undefined`, und eine Meldung daraus behauptete an jedem Typfehler, das Feld fehle. Der
 * Wert wird deshalb über `issue.path` aus den Rohargumenten nachgeschlagen — dort steht er
 * unverändert, weil die Schemaprüfung in beiden Pfaden vor jeder Umformung läuft.
 */
function valueAtPath(root: unknown, path: readonly (string | number | symbol)[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      current = (current as Record<string, unknown>)[String(segment)];
    }
  }
  return current;
}

/** Die längste Wiedergabe eines übergebenen Wertes in einer Fehlermeldung. */
const VALUE_EXCERPT_LENGTH = 40;

/**
 * Der übergebene Wert als deutscher Halbsatz.
 *
 * Der Unterschied zwischen „das Feld fehlt" und „das Feld hat den falschen Typ" ist der
 * ganze Zweck: Der Agent liest aus dem einen, er müsse etwas nachtragen, aus dem anderen, er
 * müsse etwas umformen. Beides mit demselben Satz zu beantworten hat im Evaluationslauf
 * genau diesen Irrweg erzeugt; beobachtet im Evaluationslauf.
 */
function describeGivenValue(value: unknown): string {
  if (value === undefined) return "das Feld fehlt";
  if (value === null) return "übergeben wurde null";
  if (Array.isArray(value))
    return `übergeben wurde eine Liste mit ${String(value.length)} Einträgen`;
  if (typeof value === "object") return "übergeben wurde ein Objekt";
  if (typeof value === "string") {
    const sanitized = sanitizeText(value);
    const excerpt =
      sanitized.length > VALUE_EXCERPT_LENGTH
        ? `${sanitized.slice(0, VALUE_EXCERPT_LENGTH)}…`
        : sanitized;
    return `übergeben wurde die Zeichenkette "${excerpt}"`;
  }
  if (typeof value === "number") return `übergeben wurde die Zahl ${String(value)}`;
  if (typeof value === "boolean") return `übergeben wurde der Wahrheitswert ${String(value)}`;
  // bigint, symbol und function kommen aus JSON-RPC nicht an; der Zweig ist reine Vorsorge.
  return `übergeben wurde ein Wert vom Typ ${typeof value}`;
}

/** Die längste Aufzählung erlaubter Werte in einer Fehlermeldung. */
const ALLOWED_VALUES_LIMIT = 8;

/**
 * Ein erlaubter Wert in der Schreibweise der Werkzeugbeschreibungen.
 *
 * Zeichenketten stehen in einfachen Anführungszeichen wie überall sonst, wo dieser Server
 * einen API-Wert wörtlich zitiert (`schema/vocab.ts`, Sprachregel). Geschwärzt
 * wird hier nichts: Die Werte stammen aus dem Enum des eigenen Schemas und nie vom Aufrufer.
 */
function renderAllowedValue(value: unknown): string {
  return typeof value === "string" ? `'${value}'` : String(value);
}

/**
 * Die erlaubten Werte eines Enums als deutsche Aufzählung.
 *
 * Lange Vorräte werden gekürzt: Die Währungsliste hat 48 Einträge, und eine Fehlermeldung, die
 * sie vollständig ausschreibt, verdrängt die Aussage, um die es geht. Der vollständige Vorrat
 * steht ohnehin im angekündigten JSON Schema des Werkzeugs.
 */
function listAllowedValues(values: readonly unknown[]): string {
  if (values.length === 0) {
    // Ein Enum ohne Werte kann dieses Register nicht bauen; der Zweig ist reine Vorsorge.
    return "kein Wert";
  }
  const shown = values.slice(0, ALLOWED_VALUES_LIMIT).map(renderAllowedValue);
  if (values.length > ALLOWED_VALUES_LIMIT) {
    return (
      `${shown.join(", ")} und ${String(values.length - ALLOWED_VALUES_LIMIT)} weitere ` +
      "(der vollständige Vorrat steht im Eingabeschema dieses Werkzeugs)"
    );
  }
  const last = shown[shown.length - 1] ?? "";
  return shown.length === 1 ? last : `${shown.slice(0, -1).join(", ")} und ${last}`;
}

/**
 * Die erlaubten Formen einer Vereinigung, aus den Befunden ihrer Zweige gelesen.
 *
 * Zod meldet zu `invalid_union` keinen erwarteten Typ, sondern die Befunde **jedes** Zweiges.
 * Der erste Befund eines Zweiges sagt, woran dieser Zweig gescheitert ist, und damit, was er
 * erwartet hätte.
 *
 * @returns `undefined`, wenn sich aus den Zweigen nichts Nennbares ergibt.
 */
function describeUnionForms(errors: readonly (readonly z.core.$ZodIssue[])[]): string | undefined {
  const forms: string[] = [];
  for (const branch of errors) {
    const first = branch[0];
    if (first === undefined) {
      continue;
    }
    const form =
      first.code === "invalid_type"
        ? `ein Wert vom Typ ${first.expected}`
        : first.code === "invalid_value"
          ? `einer der Werte ${listAllowedValues(first.values)}`
          : undefined;
    if (form !== undefined && !forms.includes(form)) {
      forms.push(form);
    }
  }
  return forms.length === 0 ? undefined : forms.join(" oder ");
}

/**
 * Ein Zod-Befund als deutscher Satz.
 *
 * Die Bausteine der Schemaschicht tragen ihre Meldungen selbst und auf Deutsch; für die
 * Befunde, die Zod ohne eigenen Text erzeugt, steht der Text hier. Eine englische
 * Bibliotheksmeldung inmitten von 59 deutschen Beschreibungen wäre der größere Bruch.
 *
 * Vier Codes werden deshalb selbst formuliert. `invalid_value` ist der Code, den Zod 4 an
 * jedem Enum erzeugt — 54 Enum-Felder in 31 der 54 Endpunktwerkzeuge, darunter
 * `list_direction`, `invoice_type`, `show_prices_type` und `order`, sowie `report_type`,
 * `resource`, `areas` und `base` in den Bündeln; ohne diesen Zweig fiele die Meldung dort auf
 * „Invalid option: expected one of …" zurück, und zwar **auch** dann, wenn das Pflichtfeld
 * schlicht fehlt. Genau diese Unterscheidung zwischen „nachtragen" und „umformen" ist der
 * Zweck der Meldung; im Evaluationslauf hat genau diese Verwechslung einen Irrweg erzeugt.
 *
 * @param rawArgs Die Rohargumente des Aufrufs, aus denen der übergebene Wert stammt.
 */
export function describeIssue(issue: z.core.$ZodIssue, rawArgs: unknown): string {
  const where = issueLocation(issue.path);
  switch (issue.code) {
    case "invalid_type":
      return `${where}: erwartet wird ${issue.expected}, ${describeGivenValue(valueAtPath(rawArgs, issue.path))}.`;
    case "invalid_value": {
      const given = describeGivenValue(valueAtPath(rawArgs, issue.path));
      const verb = issue.values.length === 1 ? "erlaubt ist nur" : "erlaubt sind";
      return `${where}: ${verb} ${listAllowedValues(issue.values)}, ${given}.`;
    }
    case "invalid_union": {
      const given = describeGivenValue(valueAtPath(rawArgs, issue.path));
      const forms = describeUnionForms(issue.errors);
      return forms === undefined
        ? `${where}: der Wert passt zu keiner der erlaubten Formen, ${given}.`
        : `${where}: erwartet wird ${forms}, ${given}.`;
    }
    case "unrecognized_keys":
      return (
        `${where}: unbekannte Felder ${issue.keys.map(sanitizeText).join(", ")}. Das Schema ist ` +
        "streng (additionalProperties: false), weil die API unbekannte Body-Felder " +
        "kommentarlos ignoriert und ein Tippfehler im Feldnamen sonst ein stiller " +
        "Datenfehler wäre."
      );
    default:
      // Der Text stammt aus der Schemaschicht dieses Servers und ist deutsch; geschwärzt wird
      // er trotzdem, weil eine Bibliotheksmeldung den übergebenen Wert einsetzen kann.
      return `${where}: ${sanitizeText(issue.message)}`;
  }
}

/**
 * Die Satzzeichen, die einen Einzelbefund als abgeschlossen ausweisen.
 *
 * Fehlt eines davon, setzt {@link joinIssues} einen Punkt. Der Doppelpunkt und das Semikolon
 * stehen mit in der Liste, weil ein Befundtext mit einem von beiden eine angehängte Aufzählung
 * ankündigt („darf nicht leer sein; das Feld stattdessen weglassen"); ein Punkt dahinter wäre
 * ein zweites Satzzeichen an derselben Stelle.
 */
const ISSUE_END_MARKS: readonly string[] = [".", "!", "?", ":", ";", "…"];

/**
 * Das Trennzeichen zwischen zwei Einzelbefunden im Block `[Warum]`.
 *
 * Es ist bewusst ein Zeichen, das in keinem der deutschen Befundtexte vorkommt. Ein Leerzeichen
 * allein trägt nicht: Bei kurzen Texten ohne Satzzeichen — `muss mindestens 1 sein` — läuft der
 * nächste Befund unsichtbar in den vorigen hinein.
 */
const ISSUE_SEPARATOR = " | ";

/**
 * Mehrere Befunde als ein Block `[Warum]`, jeder Befund für sich abgegrenzt.
 *
 * Ein Aufruf verletzt das Schema regelmäßig an mehreren Feldern zugleich, und der Block
 * `[Warum]` ist der Kanal, über den ein Agent erkennt, welches Feld er **nachzutragen** und
 * welches er **umzuformen** hat. Verschmolzene Befunde machen genau diese Unterscheidung
 * unlesbar: `limit: muss mindestens 1 sein offset: muss 0 oder größer sein` liest sich als ein
 * Satz über ein Feld.
 *
 * Normalisiert wird deshalb **hier**, an der Fügestelle, und nicht in den Einzeltexten: Die
 * Meldungen der Schemabausteine (`schema/primitives.ts`) enden ohne Satzzeichen, weil Zod sie
 * auch einzeln ausgibt, und der `default`-Zweig von {@link describeIssue} reicht sie unverändert
 * durch. Jeder Teil bekommt sein Satzende, und zwischen zwei Teilen steht zusätzlich
 * {@link ISSUE_SEPARATOR}.
 *
 * @param rawArgs Die Rohargumente des Aufrufs, unverändert und vor jeder Umformung.
 */
export function joinIssues(issues: readonly z.core.$ZodIssue[], rawArgs: unknown): string {
  const parts: string[] = [];
  for (const issue of issues) {
    const text = describeIssue(issue, rawArgs).trim();
    if (text === "") {
      // Ein leerer Befundtext entsteht aus keinem Zweig von describeIssue; der Zweig ist
      // Vorsorge dagegen, dass ein leerer Teil ein Trennzeichen ohne Inhalt erzeugt.
      continue;
    }
    parts.push(ISSUE_END_MARKS.some((mark) => text.endsWith(mark)) ? text : `${text}.`);
  }
  return parts.join(ISSUE_SEPARATOR);
}
