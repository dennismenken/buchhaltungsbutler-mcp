/**
 * `https://` als Belegquelle: Adressprüfung **je Weiterleitungssprung**, Sperre der privaten
 * Netzbereiche und Link-Local-Adressen, laufende Bytezählung.
 *
 * Der Schalter `BB_MCP_UPLOAD_FROM_URL` ist standardmäßig aus. Ist er an, holt dieser
 * Server eine Datei von einer Adresse, die der Agent bestimmt — und der Agent hat seine
 * Eingaben von Dritten. Ohne Schutz wäre das eine Abfrage aus dem Netz des Betreibers heraus
 * (SSRF): Ein Nachbardienst, ein Router auf `192.168.*` oder der Metadatendienst einer Cloud
 * auf `169.254.169.254` ist von dort aus erreichbar, vom Angreifer aber nicht.
 *
 * Vier Maßnahmen, und jede einzelne ist nötig:
 *
 * 1. **Jeder Sprung wird geprüft, nicht nur der erste.** Weiterleitungen werden von Hand
 *    gelaufen (`redirect: "manual"`). Eine Adresse, die beim ersten Aufruf harmlos aussieht,
 *    darf nicht über `302` auf `127.0.0.1` führen.
 * 2. **Die Prüfung hängt an der aufgelösten IP-Adresse, nicht am Namen.** Ein Name lässt sich
 *    auf jede Adresse zeigen. Jede Adresse, die die Namensauflösung liefert, wird geprüft;
 *    eine einzige gesperrte Adresse genügt für die Absage.
 * 3. **Geprüft und verbunden wird mit demselben Ergebnis der Namensauflösung.** Die Prüfung
 *    sitzt in der `lookup`-Funktion des Verbindungsaufbaus. Eine zweite Auflösung beim
 *    Verbinden könnte eine andere Antwort bekommen (DNS-Rebinding); diese gibt es hier nicht.
 * 4. **Die Bytezählung läuft mit und bricht ab, sobald die Grenze gerissen ist.** Der Körper
 *    wird strömend gelesen, nicht erst vollständig geholt und danach gemessen. Eine
 *    `Content-Length` über der Grenze führt zur Absage, bevor der Körper überhaupt beginnt.
 *
 * **Bewusst kein Proxy.** Dieser Weg benutzt den `EnvHttpProxyAgent` aus `http/dispatcher.ts`
 * nicht. Über einen Proxy löst der Proxy den Namen auf, und die Adressprüfung dieses Moduls
 * wäre wirkungslos. `https://` als Belegquelle funktioniert hinter einem Unternehmensproxy
 * deshalb nicht; base64 und `file://` sind davon nicht betroffen.
 */

import dns from "node:dns/promises";
import net from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

import { VERSION } from "../generated/version.js";
import { logDebug } from "../logging/stderr.js";
import { UploadSourceError } from "./sniff.js";

/** Der `User-Agent`, mit dem die Belegquelle abgerufen wird. */
export const UPLOAD_USER_AGENT = `buchhaltungsbutler-mcp/${VERSION}`;

/** Obergrenze der Weiterleitungen. Mehr deutet auf eine Schleife oder eine Umleitungskette. */
export const MAX_REDIRECTS = 5;

/** Zeitlimit des Verbindungsaufbaus je Sprung. */
const CONNECT_TIMEOUT_MS = 10_000;

// --- Adressprüfung -------------------------------------------------------------------

/** Zerlegt eine IPv4-Adresse in vier Bytes. Erwartet die von `net.isIPv4` geprüfte Form. */
function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const byte = Number.parseInt(part, 10);
    if (byte > 255) {
      return null;
    }
    bytes.push(byte);
  }
  return bytes;
}

/**
 * Zerlegt eine IPv6-Adresse in 16 Bytes. Erwartet die von `net.isIPv6` geprüfte Form und
 * versteht die eingebettete IPv4-Schreibweise (`::ffff:192.168.0.1`).
 */
function parseIpv6(value: string): number[] | null {
  const [head, tail, ...rest] = value.split("::");
  if (rest.length > 0 || head === undefined) {
    return null;
  }

  const expand = (section: string): number[] | null => {
    if (section === "") {
      return [];
    }
    const bytes: number[] = [];
    const groups = section.split(":");
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i] ?? "";
      if (group.includes(".")) {
        // Eingebettete IPv4-Schreibweise, nur als letzte Gruppe zulässig.
        if (i !== groups.length - 1) {
          return null;
        }
        const embedded = parseIpv4(group);
        if (embedded === null) {
          return null;
        }
        bytes.push(...embedded);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
        return null;
      }
      const word = Number.parseInt(group, 16);
      bytes.push((word >> 8) & 0xff, word & 0xff);
    }
    return bytes;
  };

  const left = expand(head);
  const right = tail === undefined ? [] : expand(tail);
  if (left === null || right === null) {
    return null;
  }
  if (tail === undefined) {
    return left.length === 16 ? left : null;
  }
  const fill = 16 - left.length - right.length;
  if (fill < 0) {
    return null;
  }
  return [...left, ...new Array<number>(fill).fill(0), ...right];
}

/**
 * Einordnung einer IPv4-Adresse.
 *
 * @returns den Grund der Sperre auf Deutsch, oder `null`, wenn die Adresse erlaubt ist.
 */
function classifyIpv4(bytes: readonly number[]): string | null {
  const [a = 0, b = 0, c = 0] = bytes;
  if (a === 0) {
    return "Netz 0.0.0.0/8, das dieser Rechner selbst ist";
  }
  if (a === 127) {
    return "Loopback-Bereich 127.0.0.0/8";
  }
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return "privater Netzbereich nach RFC 1918";
  }
  if (a === 169 && b === 254) {
    // Darin liegt 169.254.169.254, der Metadatendienst der großen Cloud-Anbieter.
    return "Link-Local-Bereich 169.254.0.0/16";
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return "Trägernetzbereich 100.64.0.0/10";
  }
  if (a === 192 && b === 0 && c === 0) {
    return "für Protokollzwecke reservierter Bereich 192.0.0.0/24";
  }
  if (
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return "Dokumentationsbereich ohne erreichbare Gegenstelle";
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return "Messbereich 198.18.0.0/15";
  }
  if (a === 192 && b === 88 && c === 99) {
    return "6to4-Anycast-Bereich 192.88.99.0/24";
  }
  if (a >= 224 && a <= 239) {
    return "Multicast-Bereich 224.0.0.0/4";
  }
  if (a >= 240) {
    return "reservierter Bereich ab 240.0.0.0/4 einschließlich der Rundrufadresse";
  }
  return null;
}

/**
 * Einordnung einer IPv6-Adresse.
 *
 * @returns den Grund der Sperre auf Deutsch, oder `null`, wenn die Adresse erlaubt ist.
 */
function classifyIpv6(bytes: readonly number[]): string | null {
  const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = bytes;

  if (bytes.every((byte) => byte === 0)) {
    return "unbestimmte Adresse ::";
  }
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return "Loopback-Adresse ::1";
  }
  // ::ffff:0:0/96 und ::/96: eine IPv4-Adresse im IPv6-Gewand. Sie wird grundsätzlich
  // abgelehnt, weil sie ein Weg ist, die IPv4-Prüfung zu umgehen.
  if (bytes.slice(0, 10).every((byte) => byte === 0)) {
    return "IPv4-Adresse in IPv6-Schreibweise";
  }
  if ((b0 & 0xfe) === 0xfc) {
    return "privater Bereich fc00::/7";
  }
  if (b0 === 0xfe && (b1 & 0xc0) === 0x80) {
    return "Link-Local-Bereich fe80::/10";
  }
  if (b0 === 0xfe && (b1 & 0xc0) === 0xc0) {
    return "früherer Site-Local-Bereich fec0::/10";
  }
  if (b0 === 0xff) {
    return "Multicast-Bereich ff00::/8";
  }
  if (b0 === 0x20 && b1 === 0x01 && b2 === 0x0d && b3 === 0xb8) {
    return "Dokumentationsbereich 2001:db8::/32";
  }
  if (b0 === 0x20 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) {
    return "Teredo-Bereich 2001::/32";
  }
  if (b0 === 0x20 && b1 === 0x02) {
    return "6to4-Bereich 2002::/16";
  }
  if (b0 === 0x00 && b1 === 0x64 && b2 === 0xff && b3 === 0x9b) {
    return "NAT64-Bereich 64:ff9b::/96";
  }
  if (b0 === 0x01 && b1 === 0x00 && bytes.slice(2, 8).every((byte) => byte === 0)) {
    return "Verwurfsbereich 100::/64";
  }
  return null;
}

/**
 * Prüft eine einzelne IP-Adresse.
 *
 * @returns den Grund der Sperre auf Deutsch, oder `null`, wenn die Adresse erlaubt ist. Eine
 *          Adresse, die sich nicht lesen lässt, gilt als gesperrt: Was dieser Server nicht
 *          einordnen kann, ruft er nicht auf.
 */
export function classifyAddress(address: string): string | null {
  if (net.isIPv4(address)) {
    const bytes = parseIpv4(address);
    return bytes === null ? "keine lesbare IP-Adresse" : classifyIpv4(bytes);
  }
  if (net.isIPv6(address)) {
    const bytes = parseIpv6(address);
    return bytes === null ? "keine lesbare IP-Adresse" : classifyIpv6(bytes);
  }
  return "keine lesbare IP-Adresse";
}

/** `true`, wenn der Rechnername selbst eine IP-Adresse ist (auch in Klammern bei IPv6). */
export function hostnameAsAddress(hostname: string): string | null {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return net.isIP(bare) === 0 ? null : bare;
}

/** Eine aufgelöste Adresse, wie sie die Namensauflösung liefert. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/** Die Namensauflösung, die dieses Modul benutzt. Für Tests einspeisbar. */
export type DnsLookupAll = (
  hostname: string,
  options: { readonly all: true; readonly family?: number; readonly hints?: number },
) => Promise<readonly ResolvedAddress[]>;

/** Die echte Namensauflösung. */
export const systemDnsLookup: DnsLookupAll = async (hostname, options) =>
  dns.lookup(hostname, {
    all: true,
    ...(options.family === undefined ? {} : { family: options.family }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
  });

function blockedAddressError(hostname: string, reason: string): UploadSourceError {
  return new UploadSourceError(
    "url-blocked-address",
    [
      `Der Rechner ${hostname} löst auf eine Adresse im ${reason} auf.`,
      "Dieser Server ruft aus Sicherheitsgründen nur öffentliche Adressen ab:",
      "Ein Dienst im eigenen Netz des Betreibers wäre von hier aus erreichbar, von außen nicht.",
      "Die Datei stattdessen base64-kodiert übergeben.",
    ].join(" "),
  );
}

/**
 * Prüft alle Adressen einer Auflösung.
 *
 * @throws UploadSourceError bei der ersten gesperrten Adresse und bei einer leeren Antwort.
 */
export function assertAddressesAllowed(
  hostname: string,
  addresses: readonly ResolvedAddress[],
): void {
  if (addresses.length === 0) {
    throw new UploadSourceError(
      "url-dns-failed",
      `Der Rechner ${hostname} ließ sich nicht auflösen; die Namensauflösung lieferte keine Adresse.`,
    );
  }
  for (const entry of addresses) {
    const reason = classifyAddress(entry.address);
    if (reason !== null) {
      throw blockedAddressError(hostname, reason);
    }
  }
}

/**
 * Die Signatur, die `net.connect` und damit der undici-Connector erwartet. Sie ist bewusst
 * hier ausgeschrieben und nicht aus `node:net` übernommen: Die Rückgabeliste ist dort
 * veränderlich, und dieses Modul soll seine eigene Liste nicht aus der Hand geben.
 */
export type GuardedLookup = (
  hostname: string,
  // Die drei Felder tragen `| undefined` ausdrücklich, weil `exactOptionalPropertyTypes` sonst
  // verhindert, dass `LookupOptions` aus node:dns (dort `family?: … | undefined`) auf diese
  // Signatur passt und der Wächter damit nicht als `LookupFunction` an undici übergeben werden kann.
  options: {
    readonly family?: number | string | undefined;
    readonly hints?: number | undefined;
    readonly all?: boolean | undefined;
  },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | ResolvedAddress[],
    family?: number,
  ) => void,
) => void;

function normalizeFamily(family: number | string | undefined): number {
  if (family === 4 || family === "IPv4") {
    return 4;
  }
  if (family === 6 || family === "IPv6") {
    return 6;
  }
  return 0;
}

/**
 * Baut die `lookup`-Funktion des Verbindungsaufbaus.
 *
 * Hier sitzt der Schutz gegen DNS-Rebinding: Geprüft werden genau die Adressen, mit denen
 * anschließend verbunden wird. Eine gesperrte Adresse führt zum Fehler, bevor ein Socket
 * entsteht.
 */
export function createGuardedLookup(dnsLookup: DnsLookupAll = systemDnsLookup): GuardedLookup {
  return (hostname, options, callback) => {
    const family = normalizeFamily(options.family);
    dnsLookup(hostname, {
      all: true,
      ...(family === 0 ? {} : { family }),
      ...(options.hints === undefined ? {} : { hints: options.hints }),
    }).then(
      (addresses) => {
        try {
          assertAddressesAllowed(hostname, addresses);
        } catch (error) {
          callback(error as NodeJS.ErrnoException, "");
          return;
        }
        if (options.all === true) {
          // Eine eigene Kopie: Der Aufrufer aus der Verbindungsschicht sortiert die Liste.
          callback(null, [...addresses]);
          return;
        }
        const first = addresses[0];
        // assertAddressesAllowed hat die leere Antwort bereits ausgeschlossen.
        callback(null, first?.address ?? "", first?.family);
      },
      (error: unknown) => {
        callback(
          new UploadSourceError(
            "url-dns-failed",
            `Der Rechner ${hostname} ließ sich nicht auflösen: ${describeCause(error)}.`,
          ),
          "",
        );
      },
    );
  };
}

// --- Abruf ---------------------------------------------------------------------------

/** Die Antwort, soweit dieses Modul sie braucht. Absichtlich kleiner als `Response`. */
export interface RemoteResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: ReadableStream<Uint8Array> | null;
}

/** Der Abrufer. Im Betrieb undici mit festgelegter Namensauflösung, im Test eine Attrappe. */
export type RemoteFetch = (
  url: string,
  init: {
    readonly method: "GET";
    readonly redirect: "manual";
    readonly signal: AbortSignal;
    readonly headers: Readonly<Record<string, string>>;
  },
) => Promise<RemoteResponse>;

export interface RemoteFetchOptions {
  /** Obergrenze der gelesenen Bytes. Wird sie gerissen, bricht der Abruf ab. */
  readonly maxBytes: number;
  /** Zeitlimit über den ganzen Abruf, alle Sprünge und den Körper eingeschlossen. */
  readonly timeoutMs: number;
  /** Abbruchsignal des Clients, unverändert durchgereicht. */
  readonly signal?: AbortSignal;
  /** Abweichender Abrufer. Im Betrieb nicht gesetzt. */
  readonly fetchImpl?: RemoteFetch;
  /** Abweichende Namensauflösung. Im Betrieb nicht gesetzt. */
  readonly dnsLookup?: DnsLookupAll;
  /** Obergrenze der Weiterleitungen. Vorgabe {@link MAX_REDIRECTS}. */
  readonly maxRedirects?: number;
}

export interface RemoteSource {
  readonly bytes: Uint8Array;
  /** Namensvorschlag aus `Content-Disposition` oder aus dem Pfad; noch **nicht** bereinigt. */
  readonly nameHint: string | null;
  /** Zahl der gefolgten Weiterleitungen. */
  readonly redirects: number;
}

/**
 * Kurzbeschreibung der Ursache: nach Möglichkeit der Fehlercode des Betriebssystems, sonst
 * die Meldung, auf 120 Zeichen gekürzt. Der Text kann von einer fremden Stelle stammen und
 * steht deshalb nie unbegrenzt und nie als eigener Satz in der Meldung.
 */
function describeCause(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== undefined) {
      return code;
    }
    return error.message.length > 120 ? `${error.message.slice(0, 120)}…` : error.message;
  }
  return "unbekannte Ursache";
}

/**
 * Prüft die Form einer Adresse, bevor sie aufgerufen wird. Gilt für den ersten Aufruf **und**
 * für jedes Ziel einer Weiterleitung.
 */
export function assertUrlShapeAllowed(url: URL): void {
  if (url.protocol === "http:") {
    throw new UploadSourceError(
      "url-insecure-scheme",
      "http:// ist als Belegquelle nicht erlaubt, auch nicht mit BB_MCP_UPLOAD_FROM_URL. " +
        "Eine unverschlüsselte Verbindung lässt den Inhalt des Belegs unterwegs verändern. " +
        "Eine https-Adresse verwenden oder die Datei base64-kodiert übergeben.",
    );
  }
  if (url.protocol !== "https:") {
    throw new UploadSourceError(
      "url-invalid",
      `Das Schema ${url.protocol} ist als Belegquelle nicht erlaubt; erlaubt ist ausschließlich https://.`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new UploadSourceError(
      "url-credentials",
      "Die Adresse enthält einen Anmeldeteil. Zugangsdaten in einer Adresse landen im " +
        "Protokoll der Gegenstelle; dieser Server ruft eine solche Adresse nicht ab.",
    );
  }
  const literal = hostnameAsAddress(url.hostname);
  if (literal !== null) {
    const reason = classifyAddress(literal);
    if (reason !== null) {
      throw blockedAddressError(url.hostname, reason);
    }
  }
}

/**
 * Prüft den Rechnernamen eines Sprungs vorab über die Namensauflösung.
 *
 * Das ist die zweite Prüfung neben der in {@link createGuardedLookup}. Sie läuft, damit die
 * Absage eine sprechende Meldung trägt, statt als Verbindungsfehler beim Aufbau aufzutauchen;
 * die Prüfung im Verbindungsaufbau bleibt trotzdem die maßgebliche, weil nur dort Prüfung und
 * Verbindung dasselbe Ergebnis benutzen.
 */
async function assertHostAllowed(url: URL, dnsLookup: DnsLookupAll): Promise<void> {
  if (hostnameAsAddress(url.hostname) !== null) {
    // Ein Adressliteral ist in assertUrlShapeAllowed schon geprüft, und die Namensauflösung
    // wird dafür gar nicht aufgerufen.
    return;
  }
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await dnsLookup(url.hostname, { all: true });
  } catch (error) {
    throw new UploadSourceError(
      "url-dns-failed",
      `Der Rechner ${url.hostname} ließ sich nicht auflösen: ${describeCause(error)}.`,
    );
  }
  assertAddressesAllowed(url.hostname, addresses);
}

const FILENAME_STAR = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i;
const FILENAME_PLAIN = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i;

/**
 * Liest den Namensvorschlag aus `Content-Disposition`. Der Wert ist Fremdtext und wird erst in
 * `sniff.sanitizeFileName` bereinigt.
 */
export function fileNameFromDisposition(header: string | null): string | null {
  if (header === null) {
    return null;
  }
  const starred = FILENAME_STAR.exec(header);
  if (starred !== null) {
    const raw = starred[2]?.trim() ?? "";
    if (raw !== "") {
      try {
        return decodeURIComponent(raw);
      } catch {
        // Eine fehlerhafte Prozentkodierung macht den Vorschlag unbrauchbar, nicht den Abruf.
        return raw;
      }
    }
  }
  const plain = FILENAME_PLAIN.exec(header);
  const value = (plain?.[1] ?? plain?.[2] ?? "").trim();
  return value === "" ? null : value;
}

/** Namensvorschlag aus dem Pfad der Adresse. Nur der letzte Bestandteil, nie der Pfad. */
export function fileNameFromPath(url: URL): string | null {
  const segments = url.pathname.split("/");
  const last = segments[segments.length - 1] ?? "";
  if (last === "") {
    return null;
  }
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Liest den Körper mit laufender Zählung.
 *
 * Abgebrochen wird, **sobald** die Grenze gerissen würde: Der überzählige Abschnitt wird nicht
 * mehr aufgenommen, der Strom wird abgebrochen, und der Speicherbedarf bleibt durch die Grenze
 * begrenzt. Eine angekündigte `Content-Length` über der Grenze führt zur Absage, bevor der
 * Körper beginnt.
 */
async function readBodyWithLimit(
  response: RemoteResponse,
  maxBytes: number,
  hostname: string,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim())) {
    const announced = Number.parseInt(declared.trim(), 10);
    if (announced > maxBytes) {
      // Die Leitung wird geschlossen, bevor der Körper gelesen wird: Eine angekündigte Größe
      // über der Grenze macht jedes weitere Byte sinnlos.
      await response.body?.cancel().catch(() => undefined);
      throw tooLargeError(maxBytes, hostname);
    }
  }

  const body = response.body;
  if (body === null) {
    throw new UploadSourceError(
      "url-empty-body",
      `Der Rechner ${hostname} hat keinen Inhalt geliefert.`,
    );
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value === undefined) {
        continue;
      }
      if (total + value.byteLength > maxBytes) {
        throw tooLargeError(maxBytes, hostname);
      }
      total += value.byteLength;
      chunks.push(value);
    }
  } finally {
    // Bricht die Leitung ab, auch wenn die Grenze gerissen wurde: Der Rest wird nicht geladen.
    await reader.cancel().catch(() => undefined);
  }

  if (total === 0) {
    throw new UploadSourceError(
      "url-empty-body",
      `Der Rechner ${hostname} hat eine leere Antwort geliefert.`,
    );
  }

  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return bytes;
}

function tooLargeError(maxBytes: number, hostname: string): UploadSourceError {
  const megabytes = Math.round(maxBytes / (1024 * 1024));
  return new UploadSourceError(
    "too-large",
    [
      `Der Inhalt hinter ${hostname} ist größer als die Grenze dieses Servers von ${megabytes} MB`,
      "und wurde nur bis zu dieser Grenze gelesen.",
      "Die Grenze ist eine eigene Annahme dieses Servers; BuchhaltungsButler beziffert die",
      "eigene Obergrenze in der Spezifikation nicht.",
    ].join(" "),
  );
}

/** Fasst Zeitlimit und Clientsignal zu einem Signal zusammen. */
function combinedSignal(timeoutMs: number, signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([timeout, signal]);
}

/**
 * Holt die Belegdatei von einer https-Adresse.
 *
 * @throws UploadSourceError bei jeder Absage. Der Text nennt höchstens den Rechnernamen,
 *         niemals Pfad, Abfrage oder Anmeldeteil der Adresse.
 */
export async function fetchRemoteFile(
  url: URL,
  options: RemoteFetchOptions,
): Promise<RemoteSource> {
  const dnsLookup = options.dnsLookup ?? systemDnsLookup;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const signal = combinedSignal(options.timeoutMs, options.signal);

  let agent: Agent | null = null;
  let doFetch: RemoteFetch;
  if (options.fetchImpl === undefined) {
    // Der Agent folgt von sich aus keiner Weiterleitung; zusammen mit `redirect: "manual"`
    // am Aufruf bleibt jeder Sprung in der Hand dieses Moduls und wird einzeln geprüft.
    agent = new Agent({
      connect: { lookup: createGuardedLookup(dnsLookup), timeout: CONNECT_TIMEOUT_MS },
    });
    doFetch = undiciFetcher(agent);
  } else {
    doFetch = options.fetchImpl;
  }

  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      assertUrlShapeAllowed(current);
      await assertHostAllowed(current, dnsLookup);

      const response = await callRemote(doFetch, current, signal, options.signal);

      if (response.status >= 300 && response.status < 400) {
        if (hop >= maxRedirects) {
          throw new UploadSourceError(
            "url-too-many-redirects",
            `Die Adresse hinter ${current.hostname} leitet mehr als ${maxRedirects} Mal weiter.`,
          );
        }
        // Erst die Leitung schließen, dann das Ziel lesen: Fehlt das Ziel, bleibt sonst ein
        // offener Körper zurück.
        await response.body?.cancel().catch(() => undefined);
        const next = redirectTarget(response, current);
        logDebug(
          `Belegquelle: Weiterleitung ${response.status} von ${current.hostname} nach ${next.hostname}.`,
        );
        current = next;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel().catch(() => undefined);
        throw new UploadSourceError(
          "url-status",
          `Der Rechner ${current.hostname} hat die Datei nicht geliefert: HTTP ${response.status}.`,
        );
      }

      const bytes = await readBodyWithLimit(response, options.maxBytes, current.hostname);
      const nameHint =
        fileNameFromDisposition(response.headers.get("content-disposition")) ??
        fileNameFromPath(current);
      logDebug(
        `Belegquelle von ${current.hostname} gelesen: ${bytes.byteLength} Bytes, ${hop} Weiterleitungen.`,
      );
      return { bytes, nameHint, redirects: hop };
    }
  } finally {
    await agent?.close();
  }
}

/**
 * Der Abrufer des Betriebs: undici mit festgelegter Namensauflösung.
 *
 * `RemoteResponse` führt bewusst nur die drei Eigenschaften, die dieses Modul benutzt; die
 * Antwort von undici bringt sie alle mit, und die Attrappe der Tests kommt mit drei aus.
 */
function undiciFetcher(agent: Agent): RemoteFetch {
  return (target, init) => undiciFetch(target, { ...init, dispatcher: agent });
}

/** Setzt den Abruf ab und übersetzt die Fehler des Transports. */
async function callRemote(
  doFetch: RemoteFetch,
  url: URL,
  signal: AbortSignal,
  clientSignal: AbortSignal | undefined,
): Promise<RemoteResponse> {
  try {
    return await doFetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { accept: "*/*", "user-agent": UPLOAD_USER_AGENT },
    });
  } catch (error) {
    if (error instanceof UploadSourceError) {
      // Die Absage der Adressprüfung aus der lookup-Funktion behält ihren Text.
      throw error;
    }
    const cause = error instanceof Error ? findUploadSourceError(error) : null;
    if (cause !== null) {
      throw cause;
    }
    if (isAbort(error)) {
      // Der Grund wird benannt, statt beide Fälle in einen Text zu gießen: Ein Zeitlimit ist
      // ein Befund über die Gegenstelle, ein Abbruch des Clients keiner.
      if (clientSignal?.aborted === true) {
        throw new UploadSourceError(
          "url-cancelled",
          `Der Abruf von ${url.hostname} wurde vom Client abgebrochen.`,
        );
      }
      throw new UploadSourceError(
        "url-timeout",
        `Der Abruf von ${url.hostname} lief in das Zeitlimit, bevor die Datei vollständig war.`,
      );
    }
    throw new UploadSourceError(
      "url-network",
      `Die Verbindung zu ${url.hostname} ist gescheitert: ${describeCause(error)}.`,
    );
  }
}

/**
 * Sucht eine {@link UploadSourceError} in der Ursachenkette.
 *
 * undici verpackt den Fehler der `lookup`-Funktion in einen Verbindungsfehler. Ohne dieses
 * Auspacken verlöre die Adressprüfung genau die Meldung, die dem Agenten hilft.
 */
function findUploadSourceError(error: Error): UploadSourceError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current instanceof UploadSourceError) {
      return current;
    }
    current = current.cause;
  }
  return null;
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error.name === "HeadersTimeoutError")
  );
}

/** Das Ziel einer Weiterleitung, geprüft auf Vorhandensein und Lesbarkeit. */
function redirectTarget(response: RemoteResponse, current: URL): URL {
  const location = response.headers.get("location");
  if (location === null || location.trim() === "") {
    throw new UploadSourceError(
      "url-redirect-invalid",
      `Der Rechner ${current.hostname} hat eine Weiterleitung ohne Ziel geschickt.`,
    );
  }
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    throw new UploadSourceError(
      "url-redirect-invalid",
      `Der Rechner ${current.hostname} hat eine Weiterleitung auf eine unlesbare Adresse geschickt.`,
    );
  }
  return next;
}
