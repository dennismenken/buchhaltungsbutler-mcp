// Die Werkzeugzahlen der Nutzertexte (src/cli/tool-counts.ts) gegen die unabhängig gepflegten
// Listen. Die Zahlen selbst stehen hier nicht: Eine eingetragene Zahl stimmt nur gegen sich
// selbst, und genau das hatte die festen Angaben in Einrichtung und Client-Hinweisen veralten
// lassen.

import { describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import {
  BUNDLE_TOOL_TOTAL,
  ENDPOINT_TOOL_COUNT,
  READING_ENDPOINT_TOOL_COUNT,
  TOTAL_TOOL_COUNT,
  WRITING_ENDPOINT_TOOL_COUNT,
  WRITING_TOOL_COUNT,
} from "../../src/cli/tool-counts.js";
import { EXPECTED_BUNDLE_COUNT } from "../bundles/bundle-list.js";
import { EXPECTED_TOOL_NAMES, EXPECTED_WRITING_TOOL_NAMES } from "../registry/class-list.js";

describe("Werkzeugzahlen der Nutzertexte", () => {
  it("zählt die Endpunktwerkzeuge wie die zweite, unabhängig gepflegte Liste", () => {
    expect(ENDPOINT_TOOL_COUNT).toBe(EXPECTED_TOOL_NAMES.length);
    expect(WRITING_ENDPOINT_TOOL_COUNT).toBe(EXPECTED_WRITING_TOOL_NAMES.length);
    expect(READING_ENDPOINT_TOOL_COUNT + WRITING_ENDPOINT_TOOL_COUNT).toBe(ENDPOINT_TOOL_COUNT);
  });

  it("zählt die Bündel und die Gesamtzahl", () => {
    expect(BUNDLE_TOOL_TOTAL).toBe(EXPECTED_BUNDLE_COUNT);
    expect(TOTAL_TOOL_COUNT).toBe(EXPECTED_TOOL_NAMES.length + EXPECTED_BUNDLE_COUNT);
  });

  it("rechnet die schreibenden Bündel zu den schreibenden Werkzeugen", () => {
    const writingBundles = BUNDLE_ENTRIES.filter((entry) => entry.effect !== "read").length;
    expect(writingBundles).toBeGreaterThan(0);
    expect(WRITING_TOOL_COUNT).toBe(EXPECTED_WRITING_TOOL_NAMES.length + writingBundles);
  });
});
