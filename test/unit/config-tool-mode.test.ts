// Der Betriebsmodus: `BB_MCP_TOOL_MODE` mit den Werten `direct` und `discovery`.
//
// Geprüft wird die Auflösung selbst und ihr Platz in der Startprüfung: Die Vorgabe ist
// `direct`, `discovery` meldet die fünf Gatewaywerkzeuge an, und ein unbrauchbarer Wert
// bricht den Start mit den gültigen Werten ab, statt still auf die Vorgabe zu fallen.

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError } from "../../src/config/env.js";
import { TOOL_MODE_VAR, resolveToolMode } from "../../src/config/tool-mode.js";
import { installTestConfig, resetTestConfig } from "../helpers/mock-api.js";

afterEach(() => {
  resetTestConfig();
});

describe("resolveToolMode", () => {
  it("nimmt direct und discovery an", () => {
    expect(resolveToolMode("direct")).toBe("direct");
    expect(resolveToolMode("discovery")).toBe("discovery");
  });

  it("gibt ohne Wert die Vorgabe direct", () => {
    expect(resolveToolMode(undefined)).toBe("direct");
  });

  it("nimmt Großschreibung und Leerraum an", () => {
    expect(resolveToolMode("Discovery")).toBe("discovery");
    expect(resolveToolMode("  DIRECT  ")).toBe("direct");
  });

  it("behandelt einen leeren Wert wie nicht gesetzt", () => {
    expect(resolveToolMode("")).toBe("direct");
    expect(resolveToolMode("   ")).toBe("direct");
  });

  it("bricht bei einem unbekannten Wert mit den gültigen Werten ab", () => {
    let thrown: unknown;
    try {
      resolveToolMode("suchen");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).code).toBe("tool-mode-unknown");
    expect((thrown as ConfigError).message).toContain(TOOL_MODE_VAR);
    expect((thrown as ConfigError).message).toContain("direct");
    expect((thrown as ConfigError).message).toContain("discovery");
    expect((thrown as ConfigError).message).toContain(
      "Es ging nichts an BuchhaltungsButler hinaus",
    );
  });
});

describe("toolMode in der aufgelösten Konfiguration", () => {
  it("trägt ohne die Variable die Vorgabe direct", () => {
    expect(installTestConfig().toolMode).toBe("direct");
  });

  it("trägt discovery, wenn die Variable es sagt", () => {
    expect(installTestConfig({ BB_MCP_TOOL_MODE: "discovery" }).toolMode).toBe("discovery");
  });

  it("behandelt einen nicht ersetzten Platzhalter der Erweiterung wie nicht gesetzt", () => {
    // Genauso wie bei den anderen Feldern: Ein nicht ersetzter
    // `${user_config.…}`-Platzhalter heißt „nicht ausgefüllt" und bricht den Start nicht ab.
    const config = installTestConfig({ BB_MCP_TOOL_MODE: "${user_config.tool_mode}" });
    expect(config.toolMode).toBe("direct");
  });

  it("behandelt eine leer gesetzte Variable wie nicht gesetzt", () => {
    expect(installTestConfig({ BB_MCP_TOOL_MODE: "   " }).toolMode).toBe("direct");
  });

  it("bricht den Start bei einem unbrauchbaren Wert ab", () => {
    let thrown: unknown;
    try {
      installTestConfig({ BB_MCP_TOOL_MODE: "finden" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).message).toContain("Gültig sind: direct, discovery.");
  });
});
