// Vertragstest D1 c): die Zuordnung Klasse zu Aufrufwerkzeug.
//
// Für alle 61 Einträge gegen die zweite, unabhängig gepflegte Liste: R läuft über
// bb_tools_invoke_read, A und B über bb_tools_invoke_write, M, D und AR über
// bb_tools_invoke_destructive. Die Prüfung liest die Klasse aus der unabhängigen Liste
// und den Weg aus der ausgelieferten Funktion; stünden beide in derselben Datei, prüfte
// sie sich selbst.

import { describe, expect, it } from "vitest";

import {
  INVOKE_DESTRUCTIVE_TOOL,
  INVOKE_READ_TOOL,
  INVOKE_WRITE_TOOL,
  invokeToolForClass,
} from "../../src/server/discovery.js";
import type { ToolClass } from "../../src/registry/types.js";
import { EXPECTED_CLASS_COUNTS, EXPECTED_TOOL_CLASSES } from "../registry/class-list.js";

const EXPECTED_GATEWAY: Record<ToolClass, string> = {
  R: INVOKE_READ_TOOL,
  A: INVOKE_WRITE_TOOL,
  B: INVOKE_WRITE_TOOL,
  M: INVOKE_DESTRUCTIVE_TOOL,
  D: INVOKE_DESTRUCTIVE_TOOL,
  AR: INVOKE_DESTRUCTIVE_TOOL,
};

describe("D1 c) Klasse zu Aufrufwerkzeug", () => {
  it("ordnet alle 61 Einträge dem vorgegebenen Aufrufwerkzeug zu", () => {
    const problems: string[] = [];
    for (const [name, toolClass] of Object.entries(EXPECTED_TOOL_CLASSES)) {
      const actual = invokeToolForClass(toolClass);
      if (actual !== EXPECTED_GATEWAY[toolClass]) {
        problems.push(`${name}: ${actual} statt ${EXPECTED_GATEWAY[toolClass]}.`);
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("deckt mit der zweiten Liste alle 61 Einträge ab", () => {
    expect(Object.keys(EXPECTED_TOOL_CLASSES)).toHaveLength(61);
    expect(Object.values(EXPECTED_CLASS_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(61);
  });
});
