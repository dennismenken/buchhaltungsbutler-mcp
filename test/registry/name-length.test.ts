// Die 64-Zeichen-Grenze der Messages API, geprüft für JEDES ausgelieferte Werkzeug.
//
// Ein Client hängt den Namen des Servereintrags vor den Werkzeugnamen: Aus `bb_receipts_get`
// wird beim Wirt `mcp__<servername>__bb_receipts_get`. Die Messages API lässt für einen
// Werkzeugnamen höchstens 64 Zeichen zu. Wird die Grenze gerissen, fällt genau dieses eine
// Werkzeug aus, und zwar erfahrungsgemäß ohne sprechende Meldung — der Server startet, die
// Liste sieht vollständig aus, und der Aufruf geht ins Leere.
//
// Deshalb hängt die Prüfung hier an der Konstanten `SERVER_NAME` und an den beiden
// Verzeichnissen und nicht an einer abgeschriebenen Zahl: Wer den Servernamen verlängert oder
// ein Werkzeug mit langem Namen ergänzt, bekommt es an dieser Stelle gesagt und nicht beim
// Anwender. Vorher war die Grenze nur für `bb_reports_run` und die fünf Bündel geprüft; die
// 54 Endpunktwerkzeuge prüfte niemand, und genau dort lag der gemessene Verstoß.
//
// Die Prüfung schreibt den längsten Namen bei jedem Lauf auf stderr, damit sichtbar bleibt,
// wie viel Luft bis zur Grenze noch ist.

import { describe, expect, it } from "vitest";

import { BUNDLE_ENTRIES } from "../../src/bundles/index.js";
import { SERVER_NAME } from "../../src/cli/clients/types.js";
import { TOOL_ENTRIES } from "../../src/registry/index.generated.js";

/** Die Grenze der Messages API für einen Werkzeugnamen, in Zeichen. */
const MESSAGES_API_NAME_LIMIT = 64;

/** Das Präfix, das jeder Client aus dem Namen des Servereintrags bildet. */
const CLIENT_PREFIX = `mcp__${SERVER_NAME}__`;

interface MeasuredName {
  /** Der ausgelieferte Werkzeugname, ohne Präfix. */
  readonly name: string;
  /** Woher der Eintrag stammt, für die Fehlermeldung. */
  readonly origin: "Endpunktwerkzeug" | "Bündelwerkzeug";
  /** Der Name, wie der Wirt ihn sieht. */
  readonly prefixed: string;
}

/** Alle ausgelieferten Namen, der längste zuerst. */
const MEASURED: readonly MeasuredName[] = [
  ...TOOL_ENTRIES.map(
    (entry): MeasuredName => ({
      name: entry.name,
      origin: "Endpunktwerkzeug",
      prefixed: `${CLIENT_PREFIX}${entry.name}`,
    }),
  ),
  ...BUNDLE_ENTRIES.map(
    (entry): MeasuredName => ({
      name: entry.name,
      origin: "Bündelwerkzeug",
      prefixed: `${CLIENT_PREFIX}${entry.name}`,
    }),
  ),
].sort((left, right) => right.prefixed.length - left.prefixed.length);

/** Der längste Name des Satzes. Der Satz ist nie leer, das prüft die erste Zusicherung. */
function longest(): MeasuredName {
  const first = MEASURED[0];
  if (first === undefined) {
    throw new Error("Kein einziger Werkzeugname gefunden; die Prüfung liefe sonst ins Leere.");
  }
  return first;
}

/** Eine Zeile je Name: der präfixierte Name, seine Länge und der Abstand zur Grenze. */
function describeName(measured: MeasuredName): string {
  const length = measured.prefixed.length;
  return (
    `${measured.prefixed} = ${String(length)} Zeichen ` +
    `(${measured.origin}, Grenze ${String(MESSAGES_API_NAME_LIMIT)}, ` +
    `Abstand ${String(MESSAGES_API_NAME_LIMIT - length)})`
  );
}

describe("die 64-Zeichen-Grenze der Messages API", () => {
  it("misst überhaupt etwas: beide Verzeichnisse sind gefüllt", () => {
    // Ohne diese Zusicherung ginge die eigentliche Prüfung über eine leere Liste grün durch.
    expect(TOOL_ENTRIES.length).toBeGreaterThan(0);
    expect(BUNDLE_ENTRIES.length).toBeGreaterThan(0);
    expect(MEASURED.length).toBe(TOOL_ENTRIES.length + BUNDLE_ENTRIES.length);
  });

  it("hält sie für jedes Werkzeug aus TOOL_ENTRIES und BUNDLE_ENTRIES ein", () => {
    const worst = longest();
    process.stderr.write(
      `[Namenslänge] ${String(MEASURED.length)} Werkzeuge, Präfix "${CLIENT_PREFIX}" ` +
        `(${String(CLIENT_PREFIX.length)} Zeichen). Längster Name: ${describeName(worst)}.\n`,
    );

    const violations = MEASURED.filter(
      (measured) => measured.prefixed.length > MESSAGES_API_NAME_LIMIT,
    );
    const report =
      violations.length === 0
        ? ""
        : [
            `${String(violations.length)} von ${String(MEASURED.length)} Werkzeugnamen reißen ` +
              `mit dem Clientpräfix die Grenze von ${String(MESSAGES_API_NAME_LIMIT)} Zeichen.`,
            `Längster Name: ${describeName(worst)}.`,
            "Betroffen:",
            ...violations.map((measured) => `  ${describeName(measured)}`),
            `Hebel: SERVER_NAME in src/cli/clients/types.ts kürzen (derzeit "${SERVER_NAME}", ` +
              `${String(SERVER_NAME.length)} Zeichen) — das wirkt auf alle Namen zugleich.`,
          ].join("\n");
    expect(report).toBe("");
  });

  it("nennt in der Fehlermeldung den längsten Namen samt Länge", () => {
    // Die Meldung ist selbst ein Erzeugnis und wird deshalb mitgeprüft: Sie muss den längsten
    // Namen und seine Länge tragen, sonst nützt sie dem, der sie liest, nichts.
    const worst = longest();
    const line = describeName(worst);
    expect(line).toContain(worst.prefixed);
    expect(line).toContain(String(worst.prefixed.length));
  });
});
