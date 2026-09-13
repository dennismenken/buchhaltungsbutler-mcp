/**
 * Schwärzung der drei Geheimnisse.
 *
 * Jede Zeichenkette, die diesen Prozess verlässt — stderr-Protokoll, Fehlertext eines
 * Werkzeugs, Antworttext, Resource-Inhalt — läuft durch {@link redact} (Plan 5.8).
 *
 * Ein Geheimnis kann in mehr als einer Verpackung auftreten, und genau daran scheitert eine
 * naive Suche nach dem Klartext: Der API Client und das API Secret stehen im
 * `Authorization`-Header base64-kodiert, ein Wert in einer URL steht prozentkodiert, und ein
 * Wert in einem JSON-Fragment steht mit JSON-Maskierung. Für jedes registrierte Geheimnis
 * werden deshalb alle diese Formen erzeugt und gesucht.
 *
 * Gesucht wird in **einem** Durchgang über den Originaltext, und die Ersatzmarke selbst ist
 * eine Alternative des Suchmusters, die unverändert stehen bleibt. Beides zusammen sorgt
 * dafür, dass eine einmal gesetzte Marke nie wieder durchsucht wird — weder innerhalb eines
 * Durchgangs noch beim zweiten Aufruf von {@link redact} auf denselben Text. Ohne das würde
 * aus `[redacted]` ein `[[redacted]]`, sobald ein Geheimnis zufällig in der Marke steht; auf
 * dem Weg einer Fehlermeldung ist genau das der Normalfall, weil der Fremdtext einmal beim
 * Lesen des Umschlags und ein zweites Mal beim Ausgeben geschwärzt wird.
 */

import { logWarnAlways } from "../logging/stderr.js";

/** Ersatztext. Er steht genau so in jeder geschwärzten Ausgabe. */
export const REDACTED = "[redacted]";

/**
 * Kürzester Wert, der überhaupt als Geheimnis angenommen wird.
 *
 * Die Schwärzung ersetzt jedes Vorkommen einer Zeichenfolge, auch mitten im Wort. Bei einem
 * degenerierten Wert kippt das ins Gegenteil: Mit `BB_API_KEY="e"` wird aus einer Meldung
 * `bb_paym[redacted]nt_accounts_list: BuchhaltungsButl[redacted]r m[redacted]ld[redacted]t …`,
 * also genau dort Unlesbarkeit, wo die Meldung gebraucht wird — bei falscher Konfiguration.
 * Geschützt wird dabei nichts: Ein einzelnes Zeichen ist kein Geheimnis, es steht ohnehin in
 * jedem Text.
 *
 * Acht Zeichen als Grenze. Sie ist eine Abwägung und keine gemessene Eigenschaft der API:
 * Welche Länge BuchhaltungsButler für API Client, API Secret und api_key vergibt, ist hier
 * nicht hinterlegt und wird nicht angenommen. Die Grenze ist deshalb bewusst niedrig gewählt.
 * Sieben Zeichen sind selbst über ein großes Alphabet höchstens rund 42 Bit und damit unter
 * jeder Länge, die als Schlüssel noch tragen würde; ein so kurzer Wert in der Konfiguration
 * ist fast immer ein Tippfehler oder ein Platzhalter. Zugleich kommen ein bis sieben Zeichen
 * als Teilstück in gewöhnlichem Text, in Werkzeugnamen und in Bezeichnern vor, und dort
 * richtet die Schwärzung nur Schaden an. Die Grenze trennt also nicht Geheimnis von
 * Nicht-Geheimnis, sondern „kann ein echtes Zugangsdatum sein" von „zerstört mit Sicherheit
 * die Ausgabe". Wer sie verschiebt, verschiebt genau diese Abwägung.
 *
 * Ein zu kurzer Wert geht nicht stillschweigend durch: {@link warnAboutShortSecret} meldet
 * ihn auf stderr, ohne ihn zu nennen, und unabhängig von der eingestellten Protokollstufe.
 */
export const MIN_SECRET_LENGTH = 8;

/**
 * Kürzeste abgeleitete Variante, die noch gesucht wird. Für die abgeleiteten Formen (base64,
 * Prozentkodierung) gilt eine eigene Untergrenze, weil deren Abschneiden an der Vierergruppe
 * (siehe {@link base64Variants}) auch aus einem langen Wert ein kurzes Reststück machen kann
 * und eine zwei Zeichen lange base64-Gruppe in beliebigem Text vorkommt.
 */
const MIN_DERIVED_LENGTH = 4;

/** Die registrierten Klartexte, in Registrierungsreihenfolge. */
const secrets = new Set<string>();

/** Bereits gemeldete zu kurze Werte. Verhindert, dass dieselbe Warnung mehrfach erscheint. */
const shortSecrets = new Set<string>();

/**
 * Alle Suchformen in einem Ausdruck, nach Länge absteigend, und zusätzlich {@link REDACTED}
 * selbst. Die Alternativen werden je Fundstelle in dieser Reihenfolge geprüft; die längste
 * zuerst, damit keine Teilform zuschlägt, solange die vollständige passt. `null`, solange
 * nichts angemeldet ist.
 */
let pattern: RegExp | null = null;

/** Maskiert die Sonderzeichen eines regulären Ausdrucks, damit die Suchform wörtlich gilt. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Erzeugt die base64-Formen eines Wertes.
 *
 * Steht das Geheimnis in einem größeren base64-Block (`Basic`-Header, base64-kodierter
 * Body), beginnt seine Kodierung nicht zwingend an einer Dreiergrenze. Deshalb werden alle
 * drei möglichen Versätze erzeugt und der vom Versatz mitbestimmte Kopf sowie die
 * Füllzeichen tragende letzte Vierergruppe abgeschnitten.
 */
function base64Variants(value: string): string[] {
  const out: string[] = [];
  const bytes = Buffer.from(value, "utf8");

  for (let offset = 0; offset < 3; offset++) {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString("base64");
    // Beim Versatz 0 ist die vollständige Kodierung selbst eine gültige Suchform; sie ist
    // der häufigste Fall (ein Feld, das genau dieses Geheimnis trägt).
    if (offset === 0) {
      out.push(encoded);
      out.push(encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    }
    // Die erste Vierergruppe kodiert bei Versatz 1 und 2 auch Füllbytes und gehört nicht
    // zum Wert.
    let usable = offset === 0 ? encoded : encoded.slice(4);
    // Die letzte Vierergruppe trägt Füllzeichen, sobald die Gesamtlänge kein Vielfaches
    // von drei ist. In einem größeren Block stünde dort etwas anderes.
    if (usable.endsWith("=")) {
      usable = usable.slice(0, Math.max(0, usable.length - 4));
    }
    out.push(usable);
  }

  return out;
}

/** Erzeugt alle Suchformen eines Geheimnisses. */
function buildVariants(value: string): string[] {
  const derived = [
    ...base64Variants(value),
    // In einer URL: als Pfadsegment, als Abfragewert und als Anmeldeteil.
    encodeURIComponent(value),
    encodeURI(value),
    // In einem JSON-Fragment: der Wert steht dort mit JSON-Maskierung, also mit
    // verdoppelten Rückstrichen und maskierten Anführungszeichen.
    JSON.stringify(value).slice(1, -1),
  ];

  const out = new Set<string>([value]);
  for (const form of derived) {
    if (form.length >= MIN_DERIVED_LENGTH) {
      out.add(form);
    }
  }
  return [...out];
}

/**
 * Baut das Suchmuster neu.
 *
 * Läuft ausschließlich nach einer angenommenen Anmeldung und damit nie über ein leeres
 * {@link secrets}. Eine leere Suchform passte an jeder Stelle und ersetzte den ganzen Text;
 * dass keine entsteht, sichern die beiden Untergrenzen {@link MIN_SECRET_LENGTH} und
 * {@link MIN_DERIVED_LENGTH} zu.
 *
 * Die Ersatzmarke steht als eigene Alternative im Muster und wird beim Ersetzen unverändert
 * durchgereicht. Damit überspringt der Durchgang eine schon gesetzte Marke, statt in sie
 * hineinzugreifen — auch dann, wenn derselbe Text ein zweites Mal durch {@link redact} läuft.
 * Einsortiert wird sie nach Länge wie jede andere Alternative: Eine längere Suchform, die an
 * derselben Stelle beginnt, behält so den Vortritt und kann kein Geheimnis freilegen.
 */
function rebuild(): void {
  const all = new Set<string>([REDACTED]);
  for (const secret of secrets) {
    for (const variant of buildVariants(secret)) {
      all.add(variant);
    }
  }

  const ordered = [...all].sort((a, b) => b.length - a.length);
  pattern = new RegExp(ordered.map(escapeForRegExp).join("|"), "g");
}

/**
 * Meldet einen auffällig kurzen Wert auf stderr — höchstens einmal je Wert und Prozesslauf.
 *
 * Die Meldung nennt den Wert nicht und auch seine Länge nicht, sondern nur die Grenze. Sie
 * geht nach stderr, denn stdout gehört dem MCP-Protokoll (Plan 1.3).
 *
 * Genannt werden beide möglichen Fundorte. Ein zu kurzer Wert kann aus einer der drei
 * Umgebungsvariablen stammen, genauso aber aus dem verwendeten Profil der Zugangsdatendatei;
 * letzteres ist sogar der vom Einrichtungsassistenten empfohlene Weg. Nennte die Meldung nur
 * die Umgebungsvariablen, suchte wer die Datei benutzt an der falschen Stelle.
 *
 * Geschrieben wird mit `logWarnAlways` statt mit `logWarn`, die Warnung erscheint also
 * unabhängig von der eingestellten Protokollstufe und damit auch bei
 * `BB_MCP_LOG_LEVEL=error`. Auf die Reihenfolge der Aufrufer ist dabei bewusst kein Verlass:
 * Beim Serverstart meldet `initConfig` (`src/config/resolve.ts`) die Geheimnisse noch vor
 * `setLogLevel` an, dort erschiene die Zeile auch über `logWarn`. Der
 * Einrichtungsassistent (`src/cli/setup.ts`) arbeitet aber umgekehrt: Er lädt zuerst die
 * Konfiguration, womit die Stufe steht, und meldet die eingegebenen Werte erst danach an.
 * Über `logWarn` fiele die Warnung dort bei `error` still aus — ausgerechnet für die
 * Zugangsdatendatei, den vom Assistenten empfohlenen Weg. Eine sicherheitsnahe Meldung
 * darüber, dass ein Zugangsdatum *nicht* geschwärzt wird, soll sich nicht stummschalten
 * lassen, und zwar auf jedem Weg in diese Funktion.
 */
function warnAboutShortSecret(value: string): void {
  if (shortSecrets.has(value)) {
    return;
  }
  shortSecrets.add(value);
  logWarnAlways(
    `Ein konfiguriertes Zugangsdatum ist kürzer als ${MIN_SECRET_LENGTH} Zeichen und wird ` +
      "deshalb nicht geschwärzt. Eine so kurze Zeichenfolge steht in beinahe jedem Text und " +
      "machte jede Meldung unlesbar, ohne etwas zu schützen. Der Wert kann aus der Umgebung " +
      "oder aus der Zugangsdatendatei stammen: Bitte BB_API_CLIENT, BB_API_SECRET und " +
      "BB_API_KEY prüfen sowie im verwendeten Profil der Zugangsdatendatei die Felder " +
      "api_client, api_secret und api_key; der Wert selbst wird hier nicht genannt.",
  );
}

/**
 * Entscheidet, ob ein Wert als Geheimnis aufgenommen wird, und meldet einen zu kurzen Wert.
 *
 * @returns `true`, wenn der Wert neu und lang genug ist.
 */
function acceptSecret(value: string | null | undefined): value is string {
  // Eine leere Zeichenkette würde jede Ausgabe vollständig ersetzen.
  if (typeof value !== "string" || value.length === 0 || secrets.has(value)) {
    return false;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    warnAboutShortSecret(value);
    return false;
  }
  return true;
}

/**
 * Meldet ein Geheimnis zur Schwärzung an. Leere und auffällig kurze Zeichenketten werden
 * abgewiesen; ein zu kurzer Wert erzeugt dabei eine Warnung auf stderr
 * ({@link MIN_SECRET_LENGTH}).
 */
export function registerSecret(value: string | null | undefined): void {
  if (!acceptSecret(value)) {
    return;
  }
  secrets.add(value);
  rebuild();
}

/** Meldet mehrere Geheimnisse an. */
export function registerSecrets(values: Iterable<string | null | undefined>): void {
  let changed = false;
  for (const value of values) {
    if (acceptSecret(value)) {
      secrets.add(value);
      changed = true;
    }
  }
  if (changed) {
    rebuild();
  }
}

/** Vergisst alle Geheimnisse. Gedacht für Tests und für einen Profilwechsel im Assistenten. */
export function clearSecrets(): void {
  secrets.clear();
  shortSecrets.clear();
  pattern = null;
}

/**
 * Zahl der angemeldeten Geheimnisse. Nur für Diagnose; die Werte selbst gibt es nirgends.
 * Abgewiesene Werte — leer oder kürzer als {@link MIN_SECRET_LENGTH} — zählen nicht mit.
 */
export function registeredSecretCount(): number {
  return secrets.size;
}

/** Ersetzt jedes Vorkommen jedes angemeldeten Geheimnisses durch {@link REDACTED}. */
export function redact(text: string): string {
  if (pattern === null) {
    return text;
  }
  // Ein einziger Durchgang über den Originaltext: `String.prototype.replace` setzt die Suche
  // hinter der Fundstelle im Original fort, nicht im Ergebnis. Die eingesetzte Marke wird
  // damit nie wieder durchsucht. Eine bereits im Text stehende Marke bleibt stehen, statt
  // erneut ersetzt zu werden; redact ist dadurch mehrfach anwendbar. Der Ersatz steht als
  // Funktion, damit `$`-Folgen nicht als Rückverweis gelesen würden.
  return text.replace(pattern, (match) => (match === REDACTED ? match : REDACTED));
}
