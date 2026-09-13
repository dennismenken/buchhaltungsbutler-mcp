/**
 * Dateityp aus den **Magic Bytes** und Bereinigung des Dateinamens (Plan 11.2 AP13).
 *
 * Zwei Regeln, die über allem stehen:
 *
 * 1. **Der Typ kommt aus dem Inhalt, nie aus dem gemeldeten Content-Type.** Ein
 *    `Content-Type`-Header ist eine Behauptung der Gegenstelle, die Endung eines Dateinamens
 *    eine Behauptung des Aufrufers. Beides lässt sich frei setzen. Die API nimmt nur sieben
 *    MIME-Typen an (`belege.md` 7.1) und lehnt alles andere mit `error_code` 6 ab; erkennt
 *    dieser Server den Typ schon vor dem Absenden, spart das einen schreibenden Aufruf und
 *    verhindert, dass eine HTML-Seite als Beleg hochgeladen wird.
 * 2. **Der Dateiname ist Fremdtext.** Er stammt aus dem Argument des Agenten, aus einem
 *    `Content-Disposition`-Header oder aus einem Pfad und landet über die Belegliste wieder
 *    im Modellkontext (Risiko R10). Pfadanteile, Steuer- und Bidi-Zeichen werden deshalb
 *    entfernt, bevor der Name irgendwohin weitergereicht wird.
 *
 * **Warum die Fehlerklasse hier steht und nicht in `source.ts`:** Alle drei Quellen werfen
 * sie, und `source.ts` lädt alle drei. Läge die Klasse dort, entstünde ein Importzyklus.
 * `source.ts` exportiert sie weiter, damit Aufrufer nur ein Modul kennen müssen.
 */

/** Die von der API akzeptierten MIME-Typen, wörtlich aus der Spezifikation (`belege.md` 7.1). */
export const API_ACCEPTED_MEDIA_TYPES = [
  "application/pdf",
  "text/xml",
  "application/xml",
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/tiff",
] as const;

/**
 * Die Typen, die dieses Modul aus dem Inhalt bestimmt.
 *
 * `text/xml` fehlt bewusst: Es ist derselbe Inhalt wie `application/xml`, und am Byte-Muster
 * sind die beiden nicht zu unterscheiden. Gemeldet wird deshalb immer `application/xml`,
 * das die API ebenfalls annimmt.
 */
export const DETECTABLE_MEDIA_TYPES = [
  "application/pdf",
  "application/xml",
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/tiff",
] as const;

export type UploadMediaType = (typeof DETECTABLE_MEDIA_TYPES)[number];

/**
 * Die Endungen je Typ. Das erste Element ist die kanonische Endung; sie wird angehängt, wenn
 * der übergebene Name keine passende trägt. Die API verlangt bei base64 einen Dateinamen
 * (`error_code` 33) und legt die Datei darunter ab, weshalb eine irreführende Endung dort
 * dauerhaft stehen bliebe.
 */
export const MEDIA_TYPE_EXTENSIONS: Readonly<Record<UploadMediaType, readonly string[]>> =
  Object.freeze({
    "application/pdf": ["pdf"],
    "application/xml": ["xml"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/bmp": ["bmp"],
    "image/tiff": ["tif", "tiff"],
  });

/** Kurzkennung der verletzten Regel. Sie ist in Tests prüfbar und erscheint im Protokoll. */
export type UploadSourceReason =
  // Form der Angabe
  | "empty-source"
  | "unknown-scheme"
  | "plain-path"
  | "invalid-base64"
  | "too-large"
  | "type-not-detected"
  // https://
  | "url-disabled"
  | "url-insecure-scheme"
  | "url-invalid"
  | "url-credentials"
  | "url-blocked-address"
  | "url-dns-failed"
  | "url-redirect-invalid"
  | "url-too-many-redirects"
  | "url-status"
  | "url-empty-body"
  | "url-network"
  | "url-timeout"
  | "url-cancelled"
  // file://
  | "file-disabled"
  | "file-invalid-url"
  | "file-dirs-unusable"
  | "file-outside-allowed-dirs"
  | "file-symlink"
  | "file-not-regular"
  | "file-not-found"
  | "file-unreadable"
  | "file-empty"
  | "file-changed";

/**
 * Ein Fehler beim Beschaffen der Belegdatei. Es ging dabei **nichts** an BuchhaltungsButler
 * hinaus: Diese Schicht läuft im Request-Mapper, also vor dem ersten Byte an die API.
 *
 * **Der Meldungstext enthält niemals einen Dateisystempfad** und niemals Pfad, Abfrage oder
 * Anmeldeteil einer URL. Er landet beim Agenten und damit potenziell in einem Transkript
 * (Plan 11.2 AP13, Risiko R10). Ein Rechnername ist erlaubt, weil der Agent ihn selbst
 * angegeben hat und ihn zum Beheben braucht.
 */
export class UploadSourceError extends Error {
  readonly reason: UploadSourceReason;

  constructor(reason: UploadSourceReason, message: string) {
    super(message);
    this.name = "UploadSourceError";
    this.reason = reason;
  }
}

/** `true`, wenn der Wert ein Fehler dieses Moduls ist. */
export function isUploadSourceError(value: unknown): value is UploadSourceError {
  return value instanceof UploadSourceError;
}

// --- Magic Bytes ---------------------------------------------------------------------

export interface SniffResult {
  readonly mediaType: UploadMediaType;
  /** Die kanonische Endung des erkannten Typs, ohne Punkt. */
  readonly extension: string;
}

/** Prüft ein Bytemuster an einer Stelle. Fehlende Bytes gelten als Fehlschlag. */
function matches(bytes: Uint8Array, pattern: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + pattern.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

const SIGNATURES: readonly {
  readonly mediaType: UploadMediaType;
  readonly magic: readonly number[];
}[] = [
  // "%PDF-" am Dateianfang. Die Spezifikation von PDF erlaubt Vorsatzbytes; dieser Server
  // verlangt den Anfang, weil ein Vorsatz in einem Beleg nichts zu suchen hat und die
  // Alternative eine Suche über den ganzen Puffer wäre.
  { mediaType: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mediaType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mediaType: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: "image/bmp", magic: [0x42, 0x4d] },
  // TIFF, beide Bytefolgen: "II*\0" (Intel) und "MM\0*" (Motorola).
  { mediaType: "image/tiff", magic: [0x49, 0x49, 0x2a, 0x00] },
  { mediaType: "image/tiff", magic: [0x4d, 0x4d, 0x00, 0x2a] },
];

/** Kodierung, die aus einer Bytereihenfolgemarke hervorgeht. */
type XmlWidth = "none" | "le" | "be";

/**
 * Liest das `index`-te Zeichen ab `offset`. Bei UTF-16 zählt ein Zeichen zwei Bytes.
 * Ein Zeichen außerhalb von ASCII liefert `0x100` und passt damit auf kein erwartetes
 * Zeichen; fehlende Bytes liefern `null`.
 */
function charCodeAt(
  bytes: Uint8Array,
  index: number,
  width: XmlWidth,
  offset: number,
): number | null {
  if (width === "none") {
    return bytes[offset + index] ?? null;
  }
  const base = offset + index * 2;
  const first = bytes[base];
  const second = bytes[base + 1];
  if (first === undefined || second === undefined) {
    return null;
  }
  const low = width === "le" ? first : second;
  const high = width === "le" ? second : first;
  return high === 0 ? low : 0x100;
}

const XML_DECLARATION = "<?xml";
const ASCII_WHITESPACE = new Set([0x09, 0x0a, 0x0d, 0x20]);

/**
 * XML wird an der Deklaration `<?xml` erkannt, nach einer optionalen Bytereihenfolgemarke
 * und optionalen Leerzeichen.
 *
 * **Bewusst streng.** Eine Erkennung an einem bloßen `<` würde jede HTML-Seite als XML
 * durchgehen lassen — genau der Fall, der bei `https://` als Belegquelle droht, wenn eine
 * Anmeldeseite statt der Datei geliefert wird. E-Rechnungen (ZUGFeRD, XRechnung) tragen die
 * Deklaration; fehlt sie, nennt die Fehlermeldung den Grund.
 */
function looksLikeXml(bytes: Uint8Array): boolean {
  let offset = 0;
  let width: XmlWidth = "none";
  if (matches(bytes, [0xef, 0xbb, 0xbf])) {
    offset = 3;
  } else if (matches(bytes, [0xff, 0xfe])) {
    offset = 2;
    width = "le";
  } else if (matches(bytes, [0xfe, 0xff])) {
    offset = 2;
    width = "be";
  }

  let index = 0;
  for (;;) {
    const code = charCodeAt(bytes, index, width, offset);
    if (code === null) {
      return false;
    }
    if (!ASCII_WHITESPACE.has(code)) {
      break;
    }
    index++;
  }

  for (let i = 0; i < XML_DECLARATION.length; i++) {
    if (charCodeAt(bytes, index + i, width, offset) !== XML_DECLARATION.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/**
 * Bestimmt den Typ aus dem Inhalt.
 *
 * @returns den erkannten Typ, oder `null`, wenn der Inhalt auf keinen der von der API
 *          angenommenen Typen passt.
 */
export function sniffMediaType(bytes: Uint8Array): SniffResult | null {
  for (const signature of SIGNATURES) {
    if (matches(bytes, signature.magic)) {
      return { mediaType: signature.mediaType, extension: canonicalExtension(signature.mediaType) };
    }
  }
  if (looksLikeXml(bytes)) {
    return { mediaType: "application/xml", extension: canonicalExtension("application/xml") };
  }
  return null;
}

/** Die kanonische Endung eines Typs, ohne Punkt. */
export function canonicalExtension(mediaType: UploadMediaType): string {
  const extensions = MEDIA_TYPE_EXTENSIONS[mediaType];
  return extensions[0] ?? "bin";
}

/**
 * Der Satz, der dem Agenten nach einem nicht erkannten Typ sagt, was die API annimmt. Er
 * nennt keine Bytes und keinen Pfad.
 */
export const TYPE_NOT_DETECTED_MESSAGE = [
  "Der Inhalt passt auf keinen Dateityp, den BuchhaltungsButler annimmt.",
  `Angenommen werden ${API_ACCEPTED_MEDIA_TYPES.join(", ")}.`,
  "Der Typ wird aus dem Inhalt bestimmt, nicht aus der Endung und nicht aus einem gemeldeten",
  "Content-Type. Häufige Ursachen: die Datei ist ein anderes Format als ihr Name sagt, der",
  "base64-Inhalt ist unvollständig, oder hinter der Adresse lag eine HTML-Seite statt der",
  "Datei. XML-Belege müssen mit der Deklaration <?xml beginnen.",
].join(" ");

// --- Dateiname -----------------------------------------------------------------------

/**
 * Steuer- und unsichtbare Zeichen, die aus einem Dateinamen entfernt werden:
 * C0-Steuerzeichen und DEL, C1-Steuerzeichen, weiches Trennzeichen, Arabic Letter Mark,
 * Mongolian Vowel Separator, die Null-Breite- und Bidi-Gruppe U+200B bis U+200F, Zeilen- und
 * Absatztrenner samt Bidi-Einbettungen U+2028 bis U+202E, die unsichtbaren Operatoren und
 * Isolate U+2060 bis U+206F, Variantenselektoren und U+FEFF.
 */
const INVISIBLE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff]/g;

/** Halbe Ersatzzeichen ohne Partner. Sie würden sonst als „?" im Namen landen. */
const LONE_SURROGATES = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Obergrenze des bereinigten Namens einschließlich Endung. */
export const MAX_FILE_NAME_LENGTH = 100;

/** Name, wenn nach der Bereinigung nichts Brauchbares übrig bleibt. */
export const DEFAULT_FILE_STEM = "beleg";

function stripTrailingDots(value: string): string {
  return value.replace(/[.\s]+$/, "");
}

/**
 * Entfernt Pfadanteile, Steuer- und Bidi-Zeichen und alles, was den Namen zu einem Pfad oder
 * zu einem versteckten Eintrag machen könnte.
 */
function cleanName(raw: string): string {
  // NFC zuerst: Nach dem Entfernen einzelner Zeichen wäre eine zerlegte Form sonst ein
  // anderer Name als der, der geprüft wurde.
  let name = raw.normalize("NFC").replace(LONE_SURROGATES, "").replace(INVISIBLE_CHARACTERS, "");
  // Windows-Laufwerksbuchstabe, sonst bliebe aus "C:\x\y.pdf" ein "C:" stehen.
  name = name.replace(/^[A-Za-z]:/, "");
  const parts = name.split(/[\\/]/);
  name = parts[parts.length - 1] ?? "";
  // Doppelpunkt trennt unter NTFS einen alternativen Datenstrom ab.
  name = name.replace(/:/g, "");
  name = name.replace(/\s+/g, " ").trim();
  // Kein führender Punkt: weder versteckte Namen noch "." oder "..".
  name = name.replace(/^\.+/, "");
  return name.trim();
}

/**
 * Der bereinigte Dateiname, der an die API geht.
 *
 * Die Endung richtet sich nach dem **erkannten** Typ: Trägt der Name keine oder eine, die
 * nicht zu diesem Typ gehört, wird die kanonische Endung angehängt. Die API legt die Datei
 * unter diesem Namen ab, und eine Endung, die den Inhalt falsch beschreibt, bliebe dort
 * dauerhaft stehen.
 *
 * @param raw      der rohe Name aus Argument, Header oder Pfad; `null`, wenn keiner vorliegt.
 * @param mediaType der aus dem Inhalt bestimmte Typ.
 */
export function sanitizeFileName(raw: string | null, mediaType: UploadMediaType): string {
  const cleaned = cleanName(raw ?? "");
  const extensions = MEDIA_TYPE_EXTENSIONS[mediaType];
  const canonical = canonicalExtension(mediaType);

  const dot = cleaned.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < cleaned.length - 1;
  const givenExtension = hasExtension ? cleaned.slice(dot + 1).toLowerCase() : "";
  // Passt die vorhandene Endung zum erkannten Typ, bleibt sie stehen. Passt sie nicht, wird
  // sie **nicht** weggeworfen, sondern die richtige angehängt: Der übergebene Name könnte
  // sonst einen Teil verlieren, der gar keine Endung war ("rechnung.2024").
  const extensionMatches = hasExtension && extensions.includes(givenExtension);
  const extension = extensionMatches ? givenExtension : canonical;

  let stem = stripTrailingDots(extensionMatches ? cleaned.slice(0, dot) : cleaned);
  if (stem === "") {
    stem = DEFAULT_FILE_STEM;
  }

  const room = MAX_FILE_NAME_LENGTH - extension.length - 1;
  if (stem.length > room) {
    stem = stripTrailingDots(stem.slice(0, room));
    if (stem === "") {
      stem = DEFAULT_FILE_STEM;
    }
  }

  return `${stem}.${extension}`;
}
