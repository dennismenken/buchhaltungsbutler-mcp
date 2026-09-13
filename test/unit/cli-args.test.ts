import { describe, expect, it } from "vitest";

import { CREDENTIAL_VARS } from "../../src/config/env.js";
import { CLIENT_KEYS } from "../../src/cli/clients/types.js";
import {
  ALL_ADAPTERS,
  buildHelp,
  findAdapter,
  isSubcommand,
  parseArgs,
  scopeFlag,
  startFlag,
  stringFlag,
  UsageError,
} from "../../src/cli/run.js";

describe("parseArgs", () => {
  it("liest Werte in beiden Schreibweisen und sammelt Positionsargumente", () => {
    const args = parseArgs(["add", "--client=cursor", "--scope", "project", "--yes"], {
      booleans: ["yes"],
      strings: ["client", "scope"],
    });

    expect(args.positionals).toEqual(["add"]);
    expect(stringFlag(args, "client")).toBe("cursor");
    expect(scopeFlag(args)).toBe("project");
    expect(args.flags.get("yes")).toBe(true);
  });

  it("weist eine unbekannte Option zurück, statt sie zu übergehen", () => {
    expect(() => parseArgs(["--pint-only"], { booleans: ["print-only"] })).toThrow(UsageError);
  });

  it("verlangt für einen Schalter mit Wert auch einen Wert", () => {
    expect(() => parseArgs(["--client"], { strings: ["client"] })).toThrow(/braucht einen Wert/);
  });

  it("lehnt jede Option ab, die nach einem Geheimnis aussieht", () => {
    for (const name of [
      "--api-key",
      "--api_secret",
      "--apiclient",
      "--secret",
      "--token",
      "--password",
    ]) {
      expect(() => parseArgs([name, "wert"], { strings: [name.slice(2)] })).toThrow(
        /Zugangsdaten nimmt kein Unterbefehl als Argument entgegen/,
      );
    }
  });

  it("nennt in der Absage die drei Umgebungsvariablen", () => {
    try {
      parseArgs(["--api-key=PLATZHALTER"], {});
      expect.unreachable("Die Option hätte abgelehnt werden müssen.");
    } catch (error) {
      const message = (error as Error).message;
      for (const name of CREDENTIAL_VARS) {
        expect(message).toContain(name);
      }
    }
  });

  it("kennt nur die beiden Ebenen und die beiden Startvarianten", () => {
    expect(() => scopeFlag(parseArgs(["--scope=global"], { strings: ["scope"] }))).toThrow(
      UsageError,
    );
    expect(() => startFlag(parseArgs(["--start=bun"], { strings: ["start"] }))).toThrow(UsageError);
    expect(startFlag(parseArgs([], {}))).toBe("npx");
  });
});

describe("buildHelp", () => {
  const help = buildHelp();

  it("nennt alle Unterbefehle aus 8.1", () => {
    for (const command of [
      "setup",
      "doctor",
      "test",
      "profiles list|add|remove",
      "print-config --client <name>",
      "uninstall --client <name>",
      "--version",
      "--help",
    ]) {
      expect(help).toContain(command);
    }
  });

  it("nennt alle zwölf Clientkürzel", () => {
    expect(CLIENT_KEYS).toHaveLength(12);
    for (const key of CLIENT_KEYS) {
      expect(help).toContain(key);
    }
  });

  it("sagt, dass ohne Unterbefehl der Server startet", () => {
    expect(help).toMatch(/startet den MCP-Server auf stdio/);
  });

  it("enthält keinen Platzhalter, der wie ein echtes Geheimnis aussieht", () => {
    expect(help).not.toMatch(/BB_API_(CLIENT|SECRET|KEY)=\S/);
  });
});

describe("Unterbefehle und Adapter", () => {
  it("erkennt genau die sechs Unterbefehle", () => {
    for (const name of ["setup", "doctor", "test", "profiles", "print-config", "uninstall"]) {
      expect(isSubcommand(name)).toBe(true);
    }
    expect(isSubcommand("--help")).toBe(false);
    expect(isSubcommand("start")).toBe(false);
  });

  it("bildet die zwölf Kürzel vollständig auf Adapter ab", () => {
    for (const key of CLIENT_KEYS) {
      expect(findAdapter(key)?.key).toBe(key);
    }
    expect(findAdapter("emacs")).toBeNull();
    expect(ALL_ADAPTERS).toHaveLength(CLIENT_KEYS.length);
  });
});
