/**
 * Die Zugangsdatendatei mit den Mandantenprofilen.
 *
 * Ablageort `<BB_CONFIG_DIR>/credentials.json`, Dateirechte `0600`, Verzeichnisrechte `0700`
 * (`distribution.md` 13.2). Das Format ist dasselbe, das der Einrichtungsassistent
 * schreibt:
 *
 * ```json
 * {
 *   "version": 1,
 *   "profiles": {
 *     "default": {
 *       "api_client": "PLATZHALTER_API_CLIENT",
 *       "api_secret": "PLATZHALTER_API_SECRET",
 *       "api_key": "PLATZHALTER_API_KEY",
 *       "label": "Musterfirma GmbH"
 *     }
 *   }
 * }
 * ```
 *
 * Der Inhalt dieser Datei verlässt dieses Modul nur als Wert, nie als Text in einer Meldung.
 */

import fs from "node:fs";
import path from "node:path";

import { ConfigError } from "./env.js";

/** Dateiname innerhalb des Konfigurationsverzeichnisses. */
export const CREDENTIALS_FILE_NAME = "credentials.json";

/** Aktuelle Formatversion. Eine höhere Version wird abgelehnt, nicht geraten. */
export const CREDENTIALS_FILE_VERSION = 1;

const PROFILE_KEYS = ["api_client", "api_secret", "api_key", "label"] as const;

export interface CredentialsProfile {
  readonly apiClient: string | null;
  readonly apiSecret: string | null;
  readonly apiKey: string | null;
  /** Freier Anzeigename des Mandanten, etwa „Musterfirma GmbH". Kein Geheimnis. */
  readonly label: string | null;
}

export interface CredentialsFileWarning {
  readonly code: string;
  readonly text: string;
}

export interface ReadProfileResult {
  /** `null`, wenn es die Datei nicht gibt oder sie das Profil nicht führt. */
  readonly profile: CredentialsProfile | null;
  readonly fileExists: boolean;
  readonly profileNames: readonly string[];
  readonly warnings: readonly CredentialsFileWarning[];
}

/** Vollständiger Pfad der Zugangsdatendatei. */
export function credentialsFilePath(configDir: string): string {
  return path.join(configDir, CREDENTIALS_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Prüft die Rechte einer Datei oder eines Verzeichnisses.
 *
 * Sind sie weiter als gefordert, entsteht eine Warnung mit Pfad und Korrekturbefehl, aber
 * **kein Abbruch**: Windows kennt keine Entsprechung, und ein Abbruch würde dort jeden
 * Start verhindern.
 */
function checkMode(
  targetPath: string,
  expectedMode: number,
  kind: "Datei" | "Verzeichnis",
  platform: NodeJS.Platform,
): CredentialsFileWarning | null {
  if (platform === "win32") {
    return null;
  }
  let stats: fs.Stats;
  try {
    stats = fs.statSync(targetPath);
  } catch {
    return null;
  }
  const mode = stats.mode & 0o777;
  if ((mode & ~expectedMode) === 0) {
    return null;
  }
  const octal = mode.toString(8).padStart(3, "0");
  const expectedOctal = expectedMode.toString(8).padStart(3, "0");
  return {
    code: kind === "Datei" ? "credentials-file-permissions" : "credentials-dir-permissions",
    text:
      `${kind} ${targetPath} hat die Rechte ${octal}; erwartet sind ${expectedOctal}. ` +
      `Andere Benutzer dieses Rechners können die Zugangsdaten lesen. Korrektur: chmod ${expectedOctal} ${targetPath}`,
  };
}

/** Rechteprüfung der Zugangsdatendatei und ihres Verzeichnisses (0600 und 0700). */
export function checkCredentialsPermissions(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): readonly CredentialsFileWarning[] {
  const warnings: CredentialsFileWarning[] = [];
  const dirWarning = checkMode(path.dirname(filePath), 0o700, "Verzeichnis", platform);
  if (dirWarning !== null) {
    warnings.push(dirWarning);
  }
  const fileWarning = checkMode(filePath, 0o600, "Datei", platform);
  if (fileWarning !== null) {
    warnings.push(fileWarning);
  }
  return warnings;
}

interface RawFile {
  readonly profiles: Record<string, unknown>;
}

/**
 * Liest und prüft die Datei.
 *
 * @returns `null`, wenn die Datei nicht existiert.
 * @throws ConfigError, wenn sie existiert, aber unbrauchbar ist. Das ist derselbe Fall wie
 *   ein unbrauchbarer Umgebungswert: Wer eine Zugangsdatendatei anlegt, will
 *   sie benutzen, und ein stiller Start ohne Zugangsdaten verbärge genau den Fehler, den der
 *   Betreiber sehen muss.
 */
function readRawFile(filePath: string): RawFile | null {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new ConfigError(
        "credentials-file-unreadable",
        `Abbruch: Die Zugangsdatendatei ${filePath} ist vorhanden, aber nicht lesbar (${code}).`,
      );
    }
    throw new ConfigError(
      "credentials-file-unreadable",
      `Abbruch: Die Zugangsdatendatei ${filePath} konnte nicht gelesen werden (${code ?? "unbekannter Fehler"}).`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(
      "credentials-file-invalid",
      [
        `Abbruch: Die Zugangsdatendatei ${filePath} ist kein gültiges JSON.`,
        `  ${(error as Error).message}`,
        'Erwartet wird { "version": 1, "profiles": { "default": { "api_client": "…", "api_secret": "…", "api_key": "…" } } }.',
      ].join("\n"),
    );
  }

  if (!isRecord(parsed)) {
    throw new ConfigError(
      "credentials-file-invalid",
      `Abbruch: Die Zugangsdatendatei ${filePath} enthält kein JSON-Objekt.`,
    );
  }

  const version = parsed.version;
  if (version !== undefined && version !== CREDENTIALS_FILE_VERSION) {
    throw new ConfigError(
      "credentials-file-version",
      `Abbruch: Die Zugangsdatendatei ${filePath} trägt die Formatversion ${JSON.stringify(version)}; diese Fassung kennt nur Version ${CREDENTIALS_FILE_VERSION}.`,
    );
  }

  const profiles = parsed.profiles;
  if (!isRecord(profiles)) {
    throw new ConfigError(
      "credentials-file-invalid",
      `Abbruch: Die Zugangsdatendatei ${filePath} hat kein Objekt unter "profiles".`,
    );
  }

  return { profiles };
}

/** Namen aller Profile in der Datei, alphabetisch. */
export function listProfileNames(filePath: string): readonly string[] {
  const raw = readRawFile(filePath);
  return raw === null ? [] : Object.keys(raw.profiles).sort();
}

/**
 * Liest ein Profil. Fehlende Datei, fehlendes Profil und unvollständiges Profil sind kein
 * Abbruchgrund, sondern führen in den Zustand „nicht konfiguriert".
 */
export function readProfile(
  filePath: string,
  profileName: string,
  platform: NodeJS.Platform = process.platform,
): ReadProfileResult {
  const raw = readRawFile(filePath);
  if (raw === null) {
    return { profile: null, fileExists: false, profileNames: [], warnings: [] };
  }

  const warnings: CredentialsFileWarning[] = [...checkCredentialsPermissions(filePath, platform)];
  const profileNames = Object.keys(raw.profiles).sort();
  const entry = raw.profiles[profileName];

  if (entry === undefined) {
    warnings.push({
      code: "profile-not-found",
      text:
        `Die Zugangsdatendatei ${filePath} führt kein Profil "${profileName}". ` +
        (profileNames.length > 0
          ? `Vorhanden: ${profileNames.join(", ")}. Mit BB_PROFILE eines davon wählen.`
          : "Sie enthält überhaupt kein Profil."),
    });
    return { profile: null, fileExists: true, profileNames, warnings };
  }

  if (!isRecord(entry)) {
    throw new ConfigError(
      "credentials-file-invalid",
      `Abbruch: Das Profil "${profileName}" in ${filePath} ist kein JSON-Objekt.`,
    );
  }

  for (const key of Object.keys(entry)) {
    if (!(PROFILE_KEYS as readonly string[]).includes(key)) {
      warnings.push({
        code: "unknown-profile-key",
        text: `Das Profil "${profileName}" in ${filePath} enthält den unbekannten Schlüssel "${key}"; er wird nicht ausgewertet. Bekannt sind ${PROFILE_KEYS.join(", ")}.`,
      });
    }
  }

  return {
    profile: {
      apiClient: stringOrNull(entry.api_client),
      apiSecret: stringOrNull(entry.api_secret),
      apiKey: stringOrNull(entry.api_key),
      label: stringOrNull(entry.label),
    },
    fileExists: true,
    profileNames,
    warnings,
  };
}

function ensureDir(dirPath: string, platform: NodeJS.Platform): void {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  if (platform !== "win32") {
    // mkdir wendet die umask an; erst chmod setzt die Rechte verbindlich.
    fs.chmodSync(dirPath, 0o700);
  }
}

export interface WritableProfile {
  readonly apiClient: string;
  readonly apiSecret: string;
  readonly apiKey: string;
  readonly label?: string | null;
}

/**
 * Legt ein Profil an oder ersetzt es. Die Datei entsteht mit `0600`, das Verzeichnis mit
 * `0700`. Geschrieben wird über eine Nachbardatei und `rename`, damit ein Abbruch mitten im
 * Schreiben keine halbe Datei hinterlässt.
 */
export function writeProfile(
  filePath: string,
  profileName: string,
  profile: WritableProfile,
  platform: NodeJS.Platform = process.platform,
): void {
  const dirPath = path.dirname(filePath);
  ensureDir(dirPath, platform);

  const existing = readRawFile(filePath);
  const profiles: Record<string, unknown> = existing === null ? {} : { ...existing.profiles };

  const entry: Record<string, string> = {
    api_client: profile.apiClient,
    api_secret: profile.apiSecret,
    api_key: profile.apiKey,
  };
  if (typeof profile.label === "string" && profile.label.trim() !== "") {
    entry.label = profile.label;
  }
  profiles[profileName] = entry;

  const content = `${JSON.stringify({ version: CREDENTIALS_FILE_VERSION, profiles }, null, 2)}\n`;
  const tempPath = path.join(dirPath, `.${CREDENTIALS_FILE_NAME}.${process.pid}.tmp`);

  try {
    fs.writeFileSync(tempPath, content, { mode: 0o600 });
    if (platform !== "win32") {
      // writeFileSync wendet die umask auf mode an; erst chmod setzt 0600 verbindlich.
      fs.chmodSync(tempPath, 0o600);
    }
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Die Aufräumarbeit darf den eigentlichen Fehler nicht verdecken.
    }
    throw new ConfigError(
      "credentials-file-unwritable",
      `Die Zugangsdatendatei ${filePath} konnte nicht geschrieben werden: ${(error as Error).message}`,
    );
  }

  if (platform !== "win32") {
    fs.chmodSync(filePath, 0o600);
  }
}

/** Entfernt ein Profil. Rückgabe `false`, wenn es das Profil nicht gab. */
export function removeProfile(
  filePath: string,
  profileName: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const existing = readRawFile(filePath);
  if (existing === null || existing.profiles[profileName] === undefined) {
    return false;
  }

  const profiles: Record<string, unknown> = { ...existing.profiles };
  delete profiles[profileName];

  const content = `${JSON.stringify({ version: CREDENTIALS_FILE_VERSION, profiles }, null, 2)}\n`;
  const tempPath = path.join(
    path.dirname(filePath),
    `.${CREDENTIALS_FILE_NAME}.${process.pid}.tmp`,
  );

  fs.writeFileSync(tempPath, content, { mode: 0o600 });
  if (platform !== "win32") {
    fs.chmodSync(tempPath, 0o600);
  }
  fs.renameSync(tempPath, filePath);
  if (platform !== "win32") {
    fs.chmodSync(filePath, 0o600);
  }
  return true;
}
