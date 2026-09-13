import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runProfiles } from "../../src/cli/profiles.js";
import { createScriptedTerminal, type ScriptedTerminal } from "../../src/cli/prompt.js";
import { UsageError } from "../../src/cli/run.js";
import { resetTestConfig } from "../helpers/mock-api.js";

// `profiles list|add|remove`. Die Werte heißen TESTWERT_*; echte Zugangsdaten
// kommen in dieser Datei nicht vor.

const VALUES = {
  BB_API_CLIENT: "TESTWERT_CLIENT",
  BB_API_SECRET: "TESTWERT_SECRET",
  BB_API_KEY: "TESTWERT_KEY",
} as const;

let root: string;
let terminal: ScriptedTerminal;

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: "", BB_CONFIG_DIR: path.join(root, "config"), ...extra };
}

function credentialsFile(): string {
  return path.join(root, "config", "credentials.json");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bbmcp-profiles-"));
  terminal = createScriptedTerminal([]);
});

afterEach(() => {
  resetTestConfig();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("profiles list", () => {
  it("sagt bei leerer Datei, wie ein Profil entsteht", async () => {
    expect(await runProfiles({ argv: ["list"], terminal, env: env() })).toBe(0);
    expect(terminal.text()).toContain("Es ist kein Profil hinterlegt.");
    expect(terminal.text()).toContain("bbutler-mcp profiles add");
  });

  it("zeigt Namen und Anzeigename, aber keinen Wert", async () => {
    fs.mkdirSync(path.join(root, "config"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      credentialsFile(),
      JSON.stringify({
        version: 1,
        profiles: {
          default: {
            api_client: VALUES.BB_API_CLIENT,
            api_secret: VALUES.BB_API_SECRET,
            api_key: VALUES.BB_API_KEY,
            label: "Musterfirma GmbH",
          },
          zweitmandant: { api_client: VALUES.BB_API_CLIENT },
        },
      }),
      { mode: 0o600 },
    );

    expect(await runProfiles({ argv: ["list"], terminal, env: env() })).toBe(0);

    const text = terminal.text();
    expect(text).toContain("default");
    expect(text).toContain("(aktiv über BB_PROFILE)");
    expect(text).toContain("Musterfirma GmbH");
    expect(text).toContain("Vollständig: ja");
    expect(text).toContain("Vollständig: nein, vorhanden sind BB_API_CLIENT");
    for (const value of Object.values(VALUES)) {
      expect(text).not.toContain(value);
    }
  });
});

describe("profiles add", () => {
  it("übernimmt im nicht interaktiven Betrieb nur die Umgebungsvariablen", async () => {
    const code = await runProfiles({
      argv: ["add", "zweitmandant", "--non-interactive", "--label", "Zweite GmbH"],
      terminal,
      env: env(VALUES),
    });

    expect(code).toBe(0);
    const written = JSON.parse(fs.readFileSync(credentialsFile(), "utf8")) as {
      version: number;
      profiles: Record<string, Record<string, string>>;
    };
    expect(written.version).toBe(1);
    expect(written.profiles.zweitmandant).toEqual({
      api_client: VALUES.BB_API_CLIENT,
      api_secret: VALUES.BB_API_SECRET,
      api_key: VALUES.BB_API_KEY,
      label: "Zweite GmbH",
    });
    expect(terminal.text()).toContain("BB_PROFILE=zweitmandant bbutler-mcp test");
  });

  it("legt die Datei mit 0600 und das Verzeichnis mit 0700 an", async () => {
    await runProfiles({ argv: ["add", "--non-interactive"], terminal, env: env(VALUES) });

    expect(fs.statSync(credentialsFile()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(root, "config")).mode & 0o777).toBe(0o700);
  });

  it("fragt interaktiv maskiert und zeigt den Wert einer gesetzten Variablen nicht an", async () => {
    terminal = createScriptedTerminal(["", "", "", ""]);

    const code = await runProfiles({
      argv: ["add", "dritter"],
      terminal,
      env: env(VALUES),
    });

    expect(code).toBe(0);
    const text = terminal.text();
    expect(text).toContain("BB_API_CLIENT ist gesetzt, Enter übernimmt es");
    for (const value of Object.values(VALUES)) {
      expect(text).not.toContain(value);
    }
    const written = JSON.parse(fs.readFileSync(credentialsFile(), "utf8")) as {
      profiles: Record<string, Record<string, string>>;
    };
    // Die leere Eingabe hat die Vorbelegung übernommen, ohne sie anzuzeigen.
    expect(written.profiles.dritter?.api_key).toBe(VALUES.BB_API_KEY);
  });

  it("bricht ohne Terminal und ohne Umgebungsvariablen ab, statt zu fragen", async () => {
    await expect(
      runProfiles({ argv: ["add", "--non-interactive"], terminal, env: env() }),
    ).rejects.toThrow(/BB_API_CLIENT/);
  });

  it("ersetzt ein bestehendes Profil nur mit Zustimmung", async () => {
    await runProfiles({ argv: ["add", "--non-interactive"], terminal, env: env(VALUES) });

    const refusing = createScriptedTerminal(["n"]);
    expect(
      await runProfiles({ argv: ["add", "default"], terminal: refusing, env: env(VALUES) }),
    ).toBe(1);
    expect(refusing.text()).toContain("Nichts geändert.");

    const agreeing = createScriptedTerminal(["j", "", "", ""]);
    expect(
      await runProfiles({ argv: ["add", "default"], terminal: agreeing, env: env(VALUES) }),
    ).toBe(0);
  });
});

describe("profiles remove", () => {
  it("entfernt ein Profil mit --yes", async () => {
    await runProfiles({ argv: ["add", "--non-interactive"], terminal, env: env(VALUES) });

    const removing = createScriptedTerminal([]);
    expect(
      await runProfiles({ argv: ["remove", "default", "--yes"], terminal: removing, env: env() }),
    ).toBe(0);

    const written = JSON.parse(fs.readFileSync(credentialsFile(), "utf8")) as {
      profiles: Record<string, unknown>;
    };
    expect(Object.keys(written.profiles)).toEqual([]);
  });

  it("endet mit 1, wenn es das Profil nicht gibt", async () => {
    expect(
      await runProfiles({ argv: ["remove", "gibtsnicht", "--yes"], terminal, env: env() }),
    ).toBe(1);
    expect(terminal.errorLines.join(" ")).toContain("gibtsnicht");
  });

  it("verlangt den Namen", async () => {
    await expect(runProfiles({ argv: ["remove"], terminal, env: env() })).rejects.toBeInstanceOf(
      UsageError,
    );
  });
});

describe("profiles", () => {
  it("kennt nur list, add und remove", async () => {
    await expect(runProfiles({ argv: ["lister"], terminal, env: env() })).rejects.toBeInstanceOf(
      UsageError,
    );
  });

  it("nimmt kein Geheimnis als Argument", async () => {
    await expect(
      runProfiles({ argv: ["add", "--api-secret", "PLATZHALTER"], terminal, env: env() }),
    ).rejects.toThrow(/Zugangsdaten nimmt kein Unterbefehl als Argument entgegen/);
  });
});
