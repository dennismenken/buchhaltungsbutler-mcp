import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_DIR_NAME,
  ConfigError,
  DEFAULT_BASE_URL,
  KNOWN_ENV_VARS,
  checkBaseUrl,
  defaultConfigDir,
  findUnknownBbVars,
  levenshtein,
  nearestKnownVar,
  parseEnv,
} from "../../src/config/env.js";

function parse(env: Record<string, string>) {
  return parseEnv(env).values;
}

function expectReject(env: Record<string, string>, part: string): void {
  let thrown: unknown;
  try {
    parseEnv(env);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ConfigError);
  expect((thrown as ConfigError).code).toBe("invalid-env");
  expect((thrown as ConfigError).message).toContain(part);
}

describe("bekannte Variablen", () => {
  it("kennt die neunzehn Variablen sowie den veralteten Namen", () => {
    expect([...KNOWN_ENV_VARS].sort()).toEqual(
      [
        "BB_API_CLIENT",
        "BB_API_KEY",
        "BB_API_SECRET",
        "BB_BASE_URL",
        "BB_CONFIG_DIR",
        "BB_MCP_CACHE_TTL_MS",
        "BB_MCP_DUPLICATE_CHECK",
        "BB_MCP_LOG_LEVEL",
        "BB_MCP_MAX_AMOUNT",
        "BB_MCP_MAX_BATCH",
        "BB_MCP_MAX_RESPONSE_TOKENS",
        "BB_MCP_RATE_LIMIT",
        "BB_MCP_READ_ONLY",
        "BB_MCP_TIMEOUT_MS",
        // Der Gruppenschalter; beide Namen im bestehenden Schema BB_MCP_*.
        "BB_MCP_TOOL_GROUPS",
        "BB_MCP_TOOL_GROUPS_EXCLUDE",
        "BB_MCP_UPLOAD_DIRS",
        "BB_MCP_UPLOAD_FROM_URL",
        "BB_PROFILE",
        "BB_READ_ONLY",
      ].sort(),
    );
    expect(KNOWN_ENV_VARS).toHaveLength(20);
  });
});

describe("Vorgaben", () => {
  it("setzt jede Vorgabe, wenn nichts gesetzt ist", () => {
    const values = parse({});

    expect(values.BB_BASE_URL).toBe(DEFAULT_BASE_URL);
    expect(values.BB_PROFILE).toBe("default");
    expect(values.BB_CONFIG_DIR).toBeUndefined();
    expect(values.BB_MCP_READ_ONLY).toBeUndefined();
    expect(values.BB_MCP_MAX_BATCH).toBe(50);
    expect(values.BB_MCP_MAX_AMOUNT).toBeUndefined();
    expect(values.BB_MCP_RATE_LIMIT).toBe(60);
    expect(values.BB_MCP_TIMEOUT_MS).toBe(30_000);
    expect(values.BB_MCP_DUPLICATE_CHECK).toBe("off");
    expect(values.BB_MCP_MAX_RESPONSE_TOKENS).toBe(5_000);
    expect(values.BB_MCP_CACHE_TTL_MS).toBe(0);
    expect(values.BB_MCP_UPLOAD_DIRS).toEqual([]);
    expect(values.BB_MCP_UPLOAD_FROM_URL).toBe(false);
    expect(values.BB_MCP_LOG_LEVEL).toBe("warn");
  });

  it("behandelt eine leer gesetzte Variable wie nicht gesetzt und meldet das", () => {
    const parsed = parseEnv({ BB_API_KEY: "", BB_MCP_MAX_BATCH: "   " });

    expect(parsed.values.BB_API_KEY).toBeUndefined();
    expect(parsed.values.BB_MCP_MAX_BATCH).toBe(50);
    expect(parsed.emptyVars).toEqual(["BB_API_KEY", "BB_MCP_MAX_BATCH"]);
  });
});

describe("gültige Werte", () => {
  it("nimmt Wahrheitswerte in beiden Schreibweisen", () => {
    expect(parse({ BB_MCP_READ_ONLY: "true" }).BB_MCP_READ_ONLY).toBe(true);
    expect(parse({ BB_MCP_READ_ONLY: "1" }).BB_MCP_READ_ONLY).toBe(true);
    expect(parse({ BB_MCP_READ_ONLY: "ON" }).BB_MCP_READ_ONLY).toBe(true);
    expect(parse({ BB_MCP_READ_ONLY: "false" }).BB_MCP_READ_ONLY).toBe(false);
    expect(parse({ BB_MCP_READ_ONLY: "0" }).BB_MCP_READ_ONLY).toBe(false);
    expect(parse({ BB_READ_ONLY: "yes" }).BB_READ_ONLY).toBe(true);
  });

  it("nimmt die Grenzwerte der Zahlenvariablen an den Rändern", () => {
    expect(parse({ BB_MCP_MAX_BATCH: "1" }).BB_MCP_MAX_BATCH).toBe(1);
    expect(parse({ BB_MCP_MAX_BATCH: "50" }).BB_MCP_MAX_BATCH).toBe(50);
    expect(parse({ BB_MCP_RATE_LIMIT: "10" }).BB_MCP_RATE_LIMIT).toBe(10);
    expect(parse({ BB_MCP_RATE_LIMIT: "100" }).BB_MCP_RATE_LIMIT).toBe(100);
    expect(parse({ BB_MCP_TIMEOUT_MS: "5000" }).BB_MCP_TIMEOUT_MS).toBe(5000);
    expect(parse({ BB_MCP_CACHE_TTL_MS: "0" }).BB_MCP_CACHE_TTL_MS).toBe(0);
    expect(parse({ BB_MCP_MAX_RESPONSE_TOKENS: "20000" }).BB_MCP_MAX_RESPONSE_TOKENS).toBe(20_000);
  });

  it("nimmt eine Betragsgrenze als Dezimalzeichenkette", () => {
    expect(parse({ BB_MCP_MAX_AMOUNT: "2500.00" }).BB_MCP_MAX_AMOUNT).toBe("2500.00");
    expect(parse({ BB_MCP_MAX_AMOUNT: "0.01" }).BB_MCP_MAX_AMOUNT).toBe("0.01");
    expect(parse({ BB_MCP_MAX_AMOUNT: "999" }).BB_MCP_MAX_AMOUNT).toBe("999");
  });

  it("zerlegt die Upload-Verzeichnisse am Trenner des Betriebssystems", () => {
    const raw = [path.resolve("/tmp/a"), path.resolve("/tmp/b")].join(path.delimiter);

    expect(parse({ BB_MCP_UPLOAD_DIRS: raw }).BB_MCP_UPLOAD_DIRS).toEqual([
      path.resolve("/tmp/a"),
      path.resolve("/tmp/b"),
    ]);
  });

  it("nimmt eine eigene Basis-URL und schneidet den abschließenden Schrägstrich ab", () => {
    expect(parse({ BB_BASE_URL: "https://beispiel.invalid/api/v1/" }).BB_BASE_URL).toBe(
      "https://beispiel.invalid/api/v1",
    );
    expect(parse({ BB_BASE_URL: "http://localhost:8080/api/v1" }).BB_BASE_URL).toBe(
      "http://localhost:8080/api/v1",
    );
  });
});

describe("unbrauchbare Werte brechen ab", () => {
  it("lässt einen Tippfehler im Nur-Lesen-Schalter nicht als aus durchgehen", () => {
    expectReject({ BB_MCP_READ_ONLY: "ture" }, "BB_MCP_READ_ONLY");
  });

  it("weist jeden Grenzwert außerhalb seines Bereichs zurück", () => {
    expectReject({ BB_MCP_MAX_BATCH: "0" }, "zwischen 1 und 50");
    expectReject({ BB_MCP_MAX_BATCH: "51" }, "zwischen 1 und 50");
    expectReject({ BB_MCP_RATE_LIMIT: "9" }, "zwischen 10 und 100");
    expectReject({ BB_MCP_RATE_LIMIT: "101" }, "nicht gekappt");
    expectReject({ BB_MCP_TIMEOUT_MS: "4999" }, "mindestens 5000");
    expectReject({ BB_MCP_CACHE_TTL_MS: "-1" }, "ganze Zahl ohne Vorzeichen");
    expectReject({ BB_MCP_MAX_RESPONSE_TOKENS: "20001" }, "BB_MCP_MAX_RESPONSE_TOKENS");
  });

  it("weist eine Betragsgrenze mit Komma oder ohne Wert zurück", () => {
    expectReject({ BB_MCP_MAX_AMOUNT: "2500,00" }, "Dezimalzeichenkette");
    expectReject({ BB_MCP_MAX_AMOUNT: "0" }, "größer als 0");
    expectReject({ BB_MCP_MAX_AMOUNT: "1.234" }, "zwei Nachkommastellen");
  });

  it("weist unerlaubte Basis-URLs zurück", () => {
    expect(checkBaseUrl("https://webapp.buchhaltungsbutler.de/api/v1")).toBe("");
    expect(checkBaseUrl("http://localhost:3000/api/v1")).toBe("");
    expectReject({ BB_BASE_URL: "http://beispiel.invalid/api/v1" }, "nur gegen localhost");
    expectReject({ BB_BASE_URL: "ftp://beispiel.invalid" }, "nicht erlaubt");
    expectReject({ BB_BASE_URL: "https://nutzer:geheim@beispiel.invalid" }, "Anmeldeteil");
    expectReject({ BB_BASE_URL: "https://beispiel.invalid/api?x=1" }, "Abfrage");
    expectReject({ BB_BASE_URL: "kein-url" }, "gültige URL");
  });

  it("weist unbrauchbare Profilnamen, Protokollstufen und Duplikatsschalter zurück", () => {
    expectReject({ BB_PROFILE: "../andere" }, "BB_PROFILE");
    expectReject({ BB_MCP_LOG_LEVEL: "trace" }, "error, warn, info, debug");
    expectReject({ BB_MCP_DUPLICATE_CHECK: "yes" }, "on und off");
  });

  it("weist relative Upload-Verzeichnisse und Tilde-Pfade zurück", () => {
    expectReject({ BB_MCP_UPLOAD_DIRS: "belege" }, "kein absoluter Pfad");
    expectReject({ BB_MCP_UPLOAD_DIRS: "~/belege" }, "Tilde");
  });

  it("nennt jeden fehlerhaften Wert einzeln", () => {
    let thrown: ConfigError | undefined;
    try {
      parseEnv({ BB_MCP_MAX_BATCH: "99", BB_MCP_LOG_LEVEL: "laut" });
    } catch (error) {
      thrown = error as ConfigError;
    }

    expect(thrown?.message).toContain("BB_MCP_MAX_BATCH");
    expect(thrown?.message).toContain("BB_MCP_LOG_LEVEL");
  });
});

describe("unbekannte BB_*-Variablen", () => {
  it("findet sie und nennt den nächstähnlichen bekannten Namen", () => {
    const env = {
      BB_MCP_READ_ONY: "true",
      BB_LOG_LEVEL: "info",
      BB_API_KEY: "PLATZHALTER_API_KEY",
      PATH: "/usr/bin",
    };

    expect(findUnknownBbVars(env)).toEqual(["BB_LOG_LEVEL", "BB_MCP_READ_ONY"]);
    expect(nearestKnownVar("BB_MCP_READ_ONY")).toBe("BB_MCP_READ_ONLY");
    expect(nearestKnownVar("BB_LOG_LEVEL")).toBe("BB_MCP_LOG_LEVEL");
    expect(nearestKnownVar("BB_API_SECRETT")).toBe("BB_API_SECRET");
  });

  it("rechnet den Levenshtein-Abstand richtig", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("Ablageort der Zugangsdatendatei", () => {
  it("folgt XDG_CONFIG_HOME, sonst ~/.config", () => {
    expect(defaultConfigDir({ XDG_CONFIG_HOME: "/x/cfg" }, "linux", "/home/u")).toBe(
      path.join("/x/cfg", CONFIG_DIR_NAME),
    );
    expect(defaultConfigDir({}, "darwin", "/Users/u")).toBe(
      path.join("/Users/u", ".config", CONFIG_DIR_NAME),
    );
  });

  it("folgt unter Windows %APPDATA%", () => {
    expect(
      defaultConfigDir({ APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "win32", "C:\\Users\\u"),
    ).toBe(path.join("C:\\Users\\u\\AppData\\Roaming", CONFIG_DIR_NAME));
  });
});
