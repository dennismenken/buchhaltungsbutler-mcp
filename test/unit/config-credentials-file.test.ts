import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "../../src/config/env.js";
import {
  CREDENTIALS_FILE_NAME,
  checkCredentialsPermissions,
  credentialsFilePath,
  listProfileNames,
  readProfile,
  removeProfile,
  writeProfile,
} from "../../src/config/credentials-file.js";

// Ausschließlich Platzhalter, niemals echte Zugangsdaten.
const PROFILE = {
  apiClient: "PLATZHALTER_API_CLIENT",
  apiSecret: "PLATZHALTER_API_SECRET",
  apiKey: "PLATZHALTER_API_KEY",
  label: "Musterfirma GmbH",
} as const;

const isWindows = process.platform === "win32";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-creds-"));
  file = credentialsFilePath(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeRaw(content: string): void {
  fs.writeFileSync(file, content, { mode: 0o600 });
}

describe("Ablageort", () => {
  it("hängt credentials.json an das Konfigurationsverzeichnis", () => {
    expect(credentialsFilePath("/x/cfg")).toBe(path.join("/x/cfg", CREDENTIALS_FILE_NAME));
  });
});

describe("schreiben und lesen", () => {
  it("legt Datei und Verzeichnis mit 0600 und 0700 an", () => {
    const nested = path.join(dir, "tief", "unten");
    const target = credentialsFilePath(nested);
    writeProfile(target, "default", PROFILE);

    expect(fs.existsSync(target)).toBe(true);
    if (!isWindows) {
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
      expect(fs.statSync(nested).mode & 0o777).toBe(0o700);
    }
  });

  it("liest das geschriebene Profil zurück", () => {
    writeProfile(file, "default", PROFILE);
    const result = readProfile(file, "default");

    expect(result.fileExists).toBe(true);
    expect(result.profile).toEqual({
      apiClient: PROFILE.apiClient,
      apiSecret: PROFILE.apiSecret,
      apiKey: PROFILE.apiKey,
      label: PROFILE.label,
    });
    expect(result.warnings).toEqual([]);
  });

  it("behält vorhandene Profile beim Schreiben eines weiteren", () => {
    writeProfile(file, "default", PROFILE);
    writeProfile(file, "kanzlei", { ...PROFILE, label: null });

    expect(listProfileNames(file)).toEqual(["default", "kanzlei"]);
    expect(readProfile(file, "default").profile?.label).toBe("Musterfirma GmbH");
    expect(readProfile(file, "kanzlei").profile?.label).toBeNull();
  });

  it("entfernt ein Profil und meldet ein unbekanntes", () => {
    writeProfile(file, "default", PROFILE);

    expect(removeProfile(file, "gibtsnicht")).toBe(false);
    expect(removeProfile(file, "default")).toBe(true);
    expect(listProfileNames(file)).toEqual([]);
  });

  it("liefert kein Profil, wenn es die Datei nicht gibt", () => {
    const result = readProfile(file, "default");

    expect(result.fileExists).toBe(false);
    expect(result.profile).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});

describe("Rechteprüfung 0600", () => {
  it.skipIf(isWindows)("warnt mit Pfad und Korrekturbefehl, wenn die Datei zu offen liegt", () => {
    writeProfile(file, "default", PROFILE);
    fs.chmodSync(file, 0o644);

    const warnings = checkCredentialsPermissions(file, "linux");
    const text = warnings.map((warning) => warning.text).join("\n");

    expect(warnings.some((warning) => warning.code === "credentials-file-permissions")).toBe(true);
    expect(text).toContain(file);
    expect(text).toContain("chmod 600");
  });

  it.skipIf(isWindows)("warnt auch für ein zu offenes Verzeichnis", () => {
    writeProfile(file, "default", PROFILE);
    fs.chmodSync(dir, 0o755);

    const warnings = checkCredentialsPermissions(file, "linux");

    expect(warnings.some((warning) => warning.code === "credentials-dir-permissions")).toBe(true);
    expect(warnings.map((warning) => warning.text).join("\n")).toContain("chmod 700");
  });

  it.skipIf(isWindows)("schweigt bei korrekten Rechten und bricht nie ab", () => {
    writeProfile(file, "default", PROFILE);
    fs.chmodSync(dir, 0o700);

    expect(checkCredentialsPermissions(file, "linux")).toEqual([]);
    // Windows kennt keine Entsprechung; dort wird gar nicht geprüft.
    fs.chmodSync(file, 0o666);
    expect(checkCredentialsPermissions(file, "win32")).toEqual([]);
    expect(readProfile(file, "default", "linux").profile).not.toBeNull();
  });
});

describe("unbrauchbare Datei", () => {
  it("bricht bei kaputtem JSON ab", () => {
    writeRaw("{ das ist kein JSON");

    expect(() => readProfile(file, "default")).toThrow(ConfigError);
    expect(() => readProfile(file, "default")).toThrow(/kein gültiges JSON/);
  });

  it("bricht bei einer fremden Formatversion ab", () => {
    writeRaw(JSON.stringify({ version: 2, profiles: {} }));

    expect(() => readProfile(file, "default")).toThrow(/Formatversion 2/);
  });

  it("bricht ab, wenn profiles fehlt", () => {
    writeRaw(JSON.stringify({ version: 1 }));

    expect(() => readProfile(file, "default")).toThrow(/profiles/);
  });
});

describe("Warnungen statt Abbruch", () => {
  it("meldet ein fehlendes Profil und nennt die vorhandenen", () => {
    writeProfile(file, "default", PROFILE);
    const result = readProfile(file, "kanzlei");

    expect(result.profile).toBeNull();
    expect(result.warnings[0]?.code).toBe("profile-not-found");
    expect(result.warnings[0]?.text).toContain("default");
  });

  it("meldet einen unbekannten Schlüssel im Profil", () => {
    writeRaw(
      JSON.stringify({
        version: 1,
        profiles: { default: { api_client: "PLATZHALTER", api_sercet: "PLATZHALTER" } },
      }),
    );
    const result = readProfile(file, "default");

    expect(result.warnings.some((warning) => warning.code === "unknown-profile-key")).toBe(true);
    expect(result.profile?.apiSecret).toBeNull();
  });

  it("wertet ein unvollständiges Profil aus, ohne abzubrechen", () => {
    writeRaw(
      JSON.stringify({
        version: 1,
        profiles: { default: { api_client: "PLATZHALTER_API_CLIENT", api_secret: "  " } },
      }),
    );
    const result = readProfile(file, "default");

    expect(result.profile?.apiClient).toBe("PLATZHALTER_API_CLIENT");
    expect(result.profile?.apiSecret).toBeNull();
    expect(result.profile?.apiKey).toBeNull();
  });
});

describe("weitere Abbruchfälle", () => {
  it("bricht ab, wenn ein Profil kein Objekt ist", () => {
    writeRaw(JSON.stringify({ version: 1, profiles: { default: "PLATZHALTER" } }));

    expect(() => readProfile(file, "default")).toThrow(/kein JSON-Objekt/);
  });

  it("bricht ab, wenn an der Stelle der Datei ein Verzeichnis liegt", () => {
    fs.mkdirSync(file);

    expect(() => readProfile(file, "default")).toThrow(ConfigError);
  });

  it("meldet einen fehlgeschlagenen Schreibversuch als ConfigError", () => {
    // Ein Verzeichnis an der Stelle der Datei lässt rename scheitern.
    fs.mkdirSync(file);

    expect(() => writeProfile(file, "default", PROFILE)).toThrow(ConfigError);
  });
});
