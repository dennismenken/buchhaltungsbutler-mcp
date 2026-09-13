/**
 * `file://` als Belegquelle: `realpath`, `O_NOFOLLOW` und **alle Prüfungen am selben
 * Deskriptor** (Plan 11.2 AP13).
 *
 * Der Schalter `BB_MCP_UPLOAD_DIRS` ist standardmäßig leer, und dann gibt es **keinen**
 * Dateisystemzugriff (6.2). Trägt der Betreiber Verzeichnisse ein, liest dieser Server eine
 * Datei, deren Pfad der Agent bestimmt — und der Agent hat seine Eingaben von Dritten. Ohne
 * Schutz wäre das ein Weg, beliebige Dateien des Betreibers in eine Buchhaltung und damit in
 * einen Modellkontext zu heben.
 *
 * Die Reihenfolge ist die eigentliche Schutzmaßnahme:
 *
 * 1. **`realpath` zuerst.** Damit sind `..`, Symlinks und doppelte Trenner aufgelöst, bevor
 *    irgendetwas geprüft wird. Die erlaubten Verzeichnisse werden ebenfalls über `realpath`
 *    aufgelöst, sonst scheiterte der Vergleich auf Systemen, die selbst mit Symlinks arbeiten
 *    (macOS: `/tmp` zeigt auf `/private/tmp`).
 * 2. **Enthaltenseinsprüfung** gegen die aufgelösten Verzeichnisse, mit Trennzeichengrenze;
 *    `/erlaubt-nicht` liegt nicht in `/erlaubt`.
 * 3. **Öffnen mit `O_NOFOLLOW`.** Wird der letzte Pfadbestandteil zwischen `realpath` und dem
 *    Öffnen gegen einen Symlink getauscht, scheitert das Öffnen statt dem Angreifer zu folgen.
 * 4. **Alle weiteren Prüfungen am offenen Deskriptor**: Dateiart, Größe und Inhalt kommen aus
 *    `fstat` und aus Lesevorgängen auf **diesem** Deskriptor. Ein zweites Öffnen nach der
 *    Prüfung wäre eine Wettlaufbedingung: Zwischen Prüfung und Öffnen könnte die Datei
 *    ausgetauscht werden, und geprüft wäre dann eine andere als die gelesene.
 * 5. **Abgleich der Dateikennung.** Nach dem Öffnen wird verglichen, ob Gerät und Inode des
 *    Deskriptors noch zu dem Namen gehören, der geprüft wurde. Das deckt einen Austausch
 *    zwischen Schritt 1 und Schritt 3 auf.
 *
 * **Benannte Restunsicherheit.** Node bietet kein `openat`. Ein Austausch eines
 * **Verzeichnis**bestandteils zwischen `realpath` und dem Öffnen lässt sich damit nicht
 * vollständig ausschließen; Schritt 5 macht ihn erkennbar, verhindert ihn aber nicht in jedem
 * Fall. Wer diese Restunsicherheit nicht tragen will, lässt `BB_MCP_UPLOAD_DIRS` leer und
 * übergibt die Datei base64-kodiert.
 *
 * **Kein Meldungstext dieses Moduls enthält einen Pfad**, auch nicht den angefragten. Die
 * Meldung geht an den Agenten und landet damit potenziell in einem Transkript.
 */

import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logDebug } from "../logging/stderr.js";
import { UploadSourceError } from "./sniff.js";

/**
 * `O_NOFOLLOW` gibt es auf POSIX-Systemen. Unter Windows führt Node die Konstante nicht; dort
 * tragen die Auflösung über `realpath`, die Enthaltenseinsprüfung und der Abgleich der
 * Dateikennung den Schutz. Das ist eine benannte Einschränkung und kein stilles Weglassen.
 */
const NOFOLLOW_FLAG: number =
  typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;

/** `true`, wenn die Plattform `O_NOFOLLOW` führt. */
export function supportsNoFollow(): boolean {
  return NOFOLLOW_FLAG !== 0;
}

export interface LocalFileSource {
  readonly bytes: Uint8Array;
  /** Der letzte Pfadbestandteil als Namensvorschlag; noch **nicht** bereinigt. */
  readonly nameHint: string;
}

export interface LocalFileOptions {
  /** Die Verzeichnisse aus `BB_MCP_UPLOAD_DIRS`, bereits absolut (6.2). */
  readonly allowedDirs: readonly string[];
  /** Obergrenze der gelesenen Bytes. */
  readonly maxBytes: number;
}

function errorCode(error: unknown): string | null {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ?? null;
  }
  return null;
}

const DISABLED_MESSAGE = [
  "file:// als Belegquelle ist nicht freigeschaltet.",
  "Der Betreiber dieses Servers schaltet sie frei, indem er BB_MCP_UPLOAD_DIRS auf die",
  "erlaubten Verzeichnisse setzt; ohne diese Angabe greift der Server auf kein Dateisystem zu.",
  "Die Datei stattdessen base64-kodiert übergeben.",
].join(" ");

const OUTSIDE_MESSAGE = [
  "Die angegebene Datei liegt nicht in einem der Verzeichnisse, die der Betreiber in",
  "BB_MCP_UPLOAD_DIRS freigegeben hat, oder sie wird über eine Verknüpfung dorthin geführt.",
  "Geprüft wird der aufgelöste Pfad, nicht der angegebene.",
  "Den Nutzer nach einem Ablageort innerhalb der freigegebenen Verzeichnisse fragen oder die",
  "Datei base64-kodiert übergeben.",
].join(" ");

/** Löst die erlaubten Verzeichnisse auf. Nicht vorhandene oder unlesbare werden übersprungen. */
async function resolveAllowedDirs(allowedDirs: readonly string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const dir of allowedDirs) {
    try {
      const real = await fs.realpath(dir);
      const stat = await fs.stat(real);
      if (stat.isDirectory()) {
        resolved.push(real);
      }
    } catch {
      // Ein Eintrag, der nicht existiert, ist ein Konfigurationsirrtum des Betreibers und
      // keine Absage an diesen Aufruf. Er wird übersprungen; gibt es danach keinen Eintrag
      // mehr, endet der Aufruf mit "file-dirs-unusable".
      continue;
    }
  }
  return resolved;
}

/** `true`, wenn `candidate` unterhalb von `dir` liegt. Die Trennzeichengrenze zählt mit. */
export function isInsideDirectory(candidate: string, dir: string): boolean {
  const relative = path.relative(dir, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Liest eine Belegdatei aus dem Dateisystem.
 *
 * @throws UploadSourceError bei jeder Absage, ohne Pfad im Text.
 */
export async function readLocalFile(url: URL, options: LocalFileOptions): Promise<LocalFileSource> {
  if (options.allowedDirs.length === 0) {
    throw new UploadSourceError("file-disabled", DISABLED_MESSAGE);
  }

  let requestedPath: string;
  try {
    requestedPath = fileURLToPath(url);
  } catch {
    throw new UploadSourceError(
      "file-invalid-url",
      "Die Adresse ist keine brauchbare file-Adresse. Erwartet wird die Form " +
        "file:///verzeichnis/datei.pdf mit absolutem Pfad und ohne Rechnernamen.",
    );
  }

  const allowedDirs = await resolveAllowedDirs(options.allowedDirs);
  if (allowedDirs.length === 0) {
    throw new UploadSourceError(
      "file-dirs-unusable",
      "Keines der Verzeichnisse aus BB_MCP_UPLOAD_DIRS ist ein lesbares Verzeichnis. " +
        "Das ist ein Einrichtungsfehler des Betreibers; bis zu seiner Behebung die Datei " +
        "base64-kodiert übergeben.",
    );
  }

  let realPath: string;
  try {
    realPath = await fs.realpath(requestedPath);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new UploadSourceError(
        "file-not-found",
        "Unter der angegebenen Adresse liegt keine Datei. Den Pfad beim Nutzer erfragen, " +
          "statt ihn zu raten.",
      );
    }
    if (code === "ELOOP") {
      throw new UploadSourceError(
        "file-symlink",
        "Die angegebene Adresse führt über eine Kette von Verknüpfungen, die sich nicht " +
          "auflösen lässt.",
      );
    }
    throw new UploadSourceError(
      "file-unreadable",
      `Die angegebene Datei ließ sich nicht öffnen${code === null ? "" : ` (${code})`}.`,
    );
  }

  if (!allowedDirs.some((dir) => isInsideDirectory(realPath, dir))) {
    throw new UploadSourceError("file-outside-allowed-dirs", OUTSIDE_MESSAGE);
  }

  let handle: FileHandle;
  try {
    handle = await fs.open(realPath, fsConstants.O_RDONLY | NOFOLLOW_FLAG);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ELOOP" || code === "EMLINK") {
      // Genau der Wettlauf: Zwischen realpath und dem Öffnen wurde der letzte
      // Pfadbestandteil gegen eine Verknüpfung getauscht.
      throw new UploadSourceError(
        "file-symlink",
        "Die angegebene Datei ist eine Verknüpfung oder wurde beim Öffnen gegen eine " +
          "Verknüpfung getauscht. Dieser Server folgt dabei nicht.",
      );
    }
    if (code === "ENOENT") {
      throw new UploadSourceError(
        "file-not-found",
        "Die angegebene Datei war beim Öffnen nicht mehr vorhanden.",
      );
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new UploadSourceError(
        "file-unreadable",
        "Dieser Server darf die angegebene Datei nicht lesen. Die Leserechte prüfen oder die " +
          "Datei base64-kodiert übergeben.",
      );
    }
    if (code === "EISDIR") {
      throw new UploadSourceError(
        "file-not-regular",
        "Die angegebene Adresse zeigt auf ein Verzeichnis und nicht auf eine Datei.",
      );
    }
    throw new UploadSourceError(
      "file-unreadable",
      `Die angegebene Datei ließ sich nicht öffnen${code === null ? "" : ` (${code})`}.`,
    );
  }

  try {
    // Ab hier entscheidet ausschließlich dieser Deskriptor. Kein Pfad wird mehr benutzt,
    // außer für den Abgleich der Dateikennung unmittelbar darunter.
    const stat = await handle.stat();

    if (!stat.isFile()) {
      throw new UploadSourceError(
        "file-not-regular",
        "Die angegebene Adresse zeigt nicht auf eine gewöhnliche Datei. Verzeichnisse, " +
          "Gerätedateien und Warteschlangen werden nicht gelesen.",
      );
    }

    const identity = await fs.lstat(realPath);
    if (identity.dev !== stat.dev || identity.ino !== stat.ino) {
      throw new UploadSourceError(
        "file-changed",
        "Die angegebene Datei wurde zwischen Prüfung und Öffnen ausgetauscht. Der Aufruf ist " +
          "abgebrochen; es wurde nichts gelesen und nichts hochgeladen.",
      );
    }

    if (stat.size === 0) {
      throw new UploadSourceError(
        "file-empty",
        "Die angegebene Datei ist leer. BuchhaltungsButler lehnt einen Beleg ohne Inhalt ab.",
      );
    }

    if (stat.size > options.maxBytes) {
      throw tooLargeError(options.maxBytes);
    }

    const bytes = await readAll(handle, stat.size, options.maxBytes);
    logDebug(`Belegquelle aus dem Dateisystem gelesen: ${bytes.byteLength} Bytes.`);
    return { bytes, nameHint: path.basename(realPath) };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** Liest vom offenen Deskriptor, höchstens bis zur Grenze. */
async function readAll(handle: FileHandle, size: number, maxBytes: number): Promise<Uint8Array> {
  // Ein Byte über der Grenze genügt, um ein Wachsen zwischen fstat und Lesen zu erkennen.
  const capacity = Math.min(size, maxBytes) + 1;
  const buffer = Buffer.alloc(capacity);
  let filled = 0;
  while (filled < capacity) {
    const { bytesRead } = await handle.read(buffer, filled, capacity - filled, filled);
    if (bytesRead === 0) {
      break;
    }
    filled += bytesRead;
  }
  if (filled > maxBytes) {
    throw tooLargeError(maxBytes);
  }
  if (filled === 0) {
    throw new UploadSourceError("file-empty", "Die angegebene Datei lieferte keinen Inhalt.");
  }
  return new Uint8Array(buffer.subarray(0, filled));
}

function tooLargeError(maxBytes: number): UploadSourceError {
  const megabytes = Math.round(maxBytes / (1024 * 1024));
  return new UploadSourceError(
    "too-large",
    [
      `Die angegebene Datei ist größer als die Grenze dieses Servers von ${megabytes} MB.`,
      "Die Grenze ist eine eigene Annahme dieses Servers; BuchhaltungsButler beziffert die",
      "eigene Obergrenze in der Spezifikation nicht und nennt sie erst im Fehlerfall.",
    ].join(" "),
  );
}
