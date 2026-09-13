/**
 * Die Belegquelle für `/receipts/upload`: **base64 als Vorgabe**, `https://` und `file://`
 * nur mit ausdrücklicher Freischaltung (Plan 11.2 AP13, 6.2).
 *
 * Dieses Modul ist die einzige Stelle, an der dieser Server Daten von außerhalb der API
 * entgegennimmt. Es liefert dem Request-Mapper den fertigen Inhalt, den erkannten Typ und den
 * bereinigten Dateinamen; es kennt weder das Register noch die Werkzeugnamen.
 *
 * **Drei ausdrücklich gestaffelte Vertrauensstufen:**
 *
 * | Quelle | Schalter | Was der Server dabei tut |
 * | --- | --- | --- |
 * | base64 | keiner, **Vorgabe** | dekodiert einen Wert, der ohnehin im Aufruf steht |
 * | `https://` | `BB_MCP_UPLOAD_FROM_URL` | stellt eine Verbindung ins Netz her (`ssrf.ts`) |
 * | `file://` | `BB_MCP_UPLOAD_DIRS` | liest aus dem Dateisystem des Betreibers (`local-file.ts`) |
 *
 * Die Staffelung ist keine Bequemlichkeitsfrage. Base64 kostet den Server keine eigene
 * Berechtigung: Der Inhalt liegt schon im Aufruf. Die beiden anderen Wege lassen den Agenten
 * über Ressourcen verfügen, die **der Betreiber** hat und der Agent nicht — das Netz hinter
 * der Unternehmens-Firewall und die Festplatte des Rechners, auf dem der Server läuft. Beides
 * ist deshalb im Auslieferungszustand aus.
 *
 * **Der Dateityp kommt aus den Magic Bytes** (`sniff.ts`), niemals aus einem gemeldeten
 * Content-Type und niemals aus der Endung.
 *
 * **Keine Fehlermeldung dieses Moduls enthält einen Dateisystempfad**; von einer Adresse wird
 * höchstens der Rechnername genannt, nie Pfad, Abfrage oder Anmeldeteil. Die Meldung geht an
 * den Agenten und landet damit potenziell in einem Transkript (Risiko R10).
 */

import { getConfig, type ResolvedConfig } from "../config/resolve.js";
import { logDebug } from "../logging/stderr.js";
import { readLocalFile } from "./local-file.js";
import {
  API_ACCEPTED_MEDIA_TYPES,
  sanitizeFileName,
  sniffMediaType,
  TYPE_NOT_DETECTED_MESSAGE,
  UploadSourceError,
  type UploadMediaType,
} from "./sniff.js";
import { fetchRemoteFile, type DnsLookupAll, type RemoteFetch } from "./ssrf.js";

export {
  API_ACCEPTED_MEDIA_TYPES,
  DETECTABLE_MEDIA_TYPES,
  isUploadSourceError,
  MEDIA_TYPE_EXTENSIONS,
  sanitizeFileName,
  sniffMediaType,
  UploadSourceError,
  type UploadMediaType,
  type UploadSourceReason,
} from "./sniff.js";

/**
 * Obergrenze der Belegdatei in Bytes, **eigene Annahme dieses Servers**.
 *
 * BuchhaltungsButler beziffert die eigene Grenze in der Spezifikation nicht; sie erscheint
 * erst zur Laufzeit im Text von `error_code` 7 (`belege.md` 7.3). 10 MB sind der Wert aus
 * Plan 14.2, und er ist an jeder Stelle, an der er auftaucht, als Annahme gekennzeichnet.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Die Konfigurationswerte, die dieses Modul liest. Aus dem eingefrorenen Objekt aus 6.4. */
export type UploadConfig = Pick<ResolvedConfig, "uploadDirs" | "uploadFromUrl" | "timeoutMs">;

/** Woher der Inhalt stammt. Sie steht in der Antwort und in der Protokollzeile. */
export type UploadOrigin = "base64" | "url" | "file";

export interface UploadPayload {
  /** Der Inhalt, kanonisch base64-kodiert; genau der Wert für das Body-Feld `file`. */
  readonly base64: string;
  /** Die Zahl der Bytes **vor** der Kodierung. */
  readonly byteLength: number;
  /** Der aus dem Inhalt bestimmte Typ. */
  readonly mediaType: UploadMediaType;
  /** Der bereinigte Dateiname; genau der Wert für das Body-Feld `file_name`. */
  readonly fileName: string;
  readonly origin: UploadOrigin;
}

export interface UploadSourceInput {
  /** Der Wert des Werkzeugarguments: base64-Inhalt, `https://`-Adresse oder `file://`-Adresse. */
  readonly source: string;
  /** Der vom Aufrufer gewünschte Dateiname, falls angegeben. */
  readonly fileName?: string | null;
}

export interface ResolveUploadOptions {
  /** Abweichende Konfiguration. Im Betrieb die eingefrorene aus `config/resolve.ts`. */
  readonly config?: UploadConfig;
  /** Abweichende Obergrenze. Im Betrieb {@link MAX_UPLOAD_BYTES}. */
  readonly maxBytes?: number;
  /** Abbruchsignal des Clients (`extra.signal`), unverändert durchgereicht. */
  readonly signal?: AbortSignal;
  /** Abweichender Abrufer für `https://`. Im Betrieb nicht gesetzt (Einspeisung für Tests). */
  readonly fetchImpl?: RemoteFetch;
  /** Abweichende Namensauflösung. Im Betrieb nicht gesetzt (Einspeisung für Tests). */
  readonly dnsLookup?: DnsLookupAll;
}

const SUPPORTED_FORMS = [
  "Erlaubt sind drei Formen:",
  "der base64-kodierte Inhalt der Datei (Vorgabe, immer möglich),",
  "eine https-Adresse (nur wenn der Betreiber BB_MCP_UPLOAD_FROM_URL gesetzt hat)",
  "und eine file-Adresse (nur wenn der Betreiber BB_MCP_UPLOAD_DIRS gesetzt hat).",
].join(" ");

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const DATA_URL = /^data:([^,]*),/i;
const LOOKS_LIKE_PATH = /^(?:[A-Za-z]:[\\/]|[\\/]|~[\\/]|\.{1,2}[\\/])/;

/**
 * Beschafft den Inhalt der Belegdatei.
 *
 * @throws UploadSourceError bei jeder Absage. Es ging dabei nichts an BuchhaltungsButler
 *         hinaus: Dieser Schritt läuft vor dem ersten Byte an die API.
 */
export async function resolveUploadSource(
  input: UploadSourceInput,
  options: ResolveUploadOptions = {},
): Promise<UploadPayload> {
  const config = options.config ?? getConfig();
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  const raw = input.source.trim();

  if (raw === "") {
    throw new UploadSourceError(
      "empty-source",
      `Es wurde keine Belegdatei übergeben. ${SUPPORTED_FORMS}`,
    );
  }

  const requestedName = input.fileName ?? null;
  const scheme = SCHEME.exec(raw)?.[1]?.toLowerCase() ?? null;

  if (scheme === "https") {
    return await fromUrl(raw, requestedName, config, maxBytes, options);
  }
  if (scheme === "http") {
    throw new UploadSourceError(
      "url-insecure-scheme",
      "http:// ist als Belegquelle nicht erlaubt, auch nicht mit BB_MCP_UPLOAD_FROM_URL. " +
        "Eine unverschlüsselte Verbindung lässt den Inhalt des Belegs unterwegs verändern. " +
        "Eine https-Adresse verwenden oder die Datei base64-kodiert übergeben.",
    );
  }
  if (scheme === "file") {
    return await fromFile(raw, requestedName, config, maxBytes);
  }
  if (scheme === "data") {
    return fromDataUrl(raw, requestedName, maxBytes);
  }
  // Vor der Schemaweiche, weil ein Windows-Pfad wie C:\ordner\beleg.pdf sonst als Schema „c"
  // gelesen würde. Der Pfad selbst wird nicht wiederholt: Er stünde sonst in der Meldung.
  if (LOOKS_LIKE_PATH.test(raw)) {
    throw new UploadSourceError(
      "plain-path",
      `Ein Dateisystempfad wird als Belegquelle nicht angenommen. ${SUPPORTED_FORMS}`,
    );
  }
  if (scheme !== null) {
    // Ein base64-Wert kann keinen Doppelpunkt enthalten; ein Schema ist hier also nie eine
    // Fehldeutung eines echten Inhalts.
    throw new UploadSourceError(
      "unknown-scheme",
      `Das Schema ${scheme}: ist als Belegquelle nicht vorgesehen. ${SUPPORTED_FORMS}`,
    );
  }

  return fromBase64(raw, requestedName, maxBytes, "base64");
}

// --- base64 --------------------------------------------------------------------------

const BASE64_ALPHABET = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Dekodiert base64 streng.
 *
 * `Buffer.from(value, "base64")` überspringt ungültige Zeichen kommentarlos: Aus einem
 * versehentlich übergebenen Fließtext entstünde dabei ein kurzer Bytesalat, der später als
 * „Dateityp nicht erkannt" aufschlüge. Deshalb wird der Vorrat vorher geprüft.
 */
export function decodeBase64(value: string, maxBytes: number): Uint8Array {
  // Zeilenumbrüche sind in base64-Blöcken üblich; base64url tauscht zwei Zeichen aus.
  const compact = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (compact === "") {
    throw new UploadSourceError("empty-source", "Der übergebene base64-Inhalt ist leer.");
  }

  const withoutPadding = compact.replace(/=+$/, "");
  const remainder = withoutPadding.length % 4;
  if (remainder === 1) {
    throw new UploadSourceError(
      "invalid-base64",
      "Der übergebene Inhalt ist kein vollständiges base64: Die Länge passt zu keiner " +
        "Bytefolge. Wahrscheinlich fehlt ein Teil des Inhalts.",
    );
  }
  const padded = withoutPadding + "=".repeat(remainder === 0 ? 0 : 4 - remainder);

  if (!BASE64_ALPHABET.test(padded)) {
    throw new UploadSourceError(
      "invalid-base64",
      `Der übergebene Inhalt ist kein base64. ${SUPPORTED_FORMS}`,
    );
  }

  // Größe zuerst rechnen, dann dekodieren: Ein zu großer Inhalt soll nicht erst ein zweites
  // Mal vollständig im Speicher stehen.
  const estimated = (padded.length / 4) * 3 - (padded.length - withoutPadding.length);
  if (estimated > maxBytes) {
    throw tooLargeError(maxBytes);
  }

  const bytes = new Uint8Array(Buffer.from(padded, "base64"));
  if (bytes.byteLength === 0) {
    throw new UploadSourceError("empty-source", "Der übergebene base64-Inhalt ist leer.");
  }
  if (bytes.byteLength > maxBytes) {
    throw tooLargeError(maxBytes);
  }
  return bytes;
}

function fromBase64(
  value: string,
  requestedName: string | null,
  maxBytes: number,
  origin: UploadOrigin,
): UploadPayload {
  return buildPayload(decodeBase64(value, maxBytes), requestedName, origin);
}

/**
 * `data:`-Adressen mit base64-Nutzlast.
 *
 * Sie sind nichts anderes als base64 mit Vorsatz — kein Netz, kein Dateisystem — und brauchen
 * deshalb keinen Schalter. Ohne diesen Zweig liefe eine solche Angabe in die Meldung „kein
 * base64", und der Agent müsste raten, woran es lag. Der gemeldete Typ im Vorsatz wird
 * **nicht** übernommen; auch hier entscheiden die Magic Bytes.
 */
function fromDataUrl(raw: string, requestedName: string | null, maxBytes: number): UploadPayload {
  const match = DATA_URL.exec(raw);
  const meta = match?.[1] ?? "";
  if (match === null || !/;\s*base64\s*$/i.test(meta)) {
    throw new UploadSourceError(
      "unknown-scheme",
      "Eine data-Adresse wird nur in der base64-Form angenommen " +
        `(data:<typ>;base64,<inhalt>). ${SUPPORTED_FORMS}`,
    );
  }
  return fromBase64(raw.slice(match[0].length), requestedName, maxBytes, "base64");
}

// --- https:// ------------------------------------------------------------------------

async function fromUrl(
  raw: string,
  requestedName: string | null,
  config: UploadConfig,
  maxBytes: number,
  options: ResolveUploadOptions,
): Promise<UploadPayload> {
  if (!config.uploadFromUrl) {
    throw new UploadSourceError(
      "url-disabled",
      [
        "https:// als Belegquelle ist nicht freigeschaltet.",
        "Der Betreiber dieses Servers schaltet sie mit BB_MCP_UPLOAD_FROM_URL=true frei;",
        "ohne diesen Schalter stellt der Server keine Verbindung zu fremden Adressen her.",
        "Die Datei stattdessen base64-kodiert übergeben.",
      ].join(" "),
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UploadSourceError(
      "url-invalid",
      "Die angegebene Adresse ließ sich nicht lesen. Erwartet wird eine vollständige " +
        "https-Adresse.",
    );
  }

  const remote = await fetchRemoteFile(url, {
    maxBytes,
    timeoutMs: config.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    ...(options.dnsLookup === undefined ? {} : { dnsLookup: options.dnsLookup }),
  });

  return buildPayload(remote.bytes, requestedName ?? remote.nameHint, "url");
}

// --- file:// -------------------------------------------------------------------------

async function fromFile(
  raw: string,
  requestedName: string | null,
  config: UploadConfig,
  maxBytes: number,
): Promise<UploadPayload> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UploadSourceError(
      "file-invalid-url",
      "Die angegebene file-Adresse ließ sich nicht lesen. Erwartet wird die Form " +
        "file:///verzeichnis/datei.pdf mit absolutem Pfad.",
    );
  }

  const local = await readLocalFile(url, { allowedDirs: config.uploadDirs, maxBytes });
  return buildPayload(local.bytes, requestedName ?? local.nameHint, "file");
}

// --- Gemeinsamer Abschluss -----------------------------------------------------------

function buildPayload(
  bytes: Uint8Array,
  nameHint: string | null,
  origin: UploadOrigin,
): UploadPayload {
  const sniffed = sniffMediaType(bytes);
  if (sniffed === null) {
    throw new UploadSourceError("type-not-detected", TYPE_NOT_DETECTED_MESSAGE);
  }

  const fileName = sanitizeFileName(nameHint, sniffed.mediaType);
  // Kanonisch neu kodieren: Der Wert geht so, wie er hier entsteht, in das Body-Feld `file`,
  // ohne Zeilenumbrüche und ohne base64url-Zeichen.
  const base64 = Buffer.from(bytes).toString("base64");

  logDebug(
    `Belegquelle aufgelöst: Herkunft ${origin}, Typ ${sniffed.mediaType}, ${bytes.byteLength} Bytes.`,
  );

  return { base64, byteLength: bytes.byteLength, mediaType: sniffed.mediaType, fileName, origin };
}

function tooLargeError(maxBytes: number): UploadSourceError {
  const megabytes = Math.round(maxBytes / (1024 * 1024));
  return new UploadSourceError(
    "too-large",
    [
      `Die Belegdatei ist größer als die Grenze dieses Servers von ${megabytes} MB.`,
      "Die Grenze ist eine eigene Annahme dieses Servers; BuchhaltungsButler beziffert die",
      "eigene Obergrenze in der Spezifikation nicht und nennt sie erst im Text von error_code 7.",
      `Angenommen werden ${API_ACCEPTED_MEDIA_TYPES.join(", ")}; ein Bild lässt sich meist`,
      "verkleinern, ein PDF neu erzeugen.",
    ].join(" "),
  );
}
