// Die Auflösung der beiden Gruppenvariablen und die vier Startfehler (N5,
// `docs/entwicklung/buendelwerkzeuge.md` Abschnitt 7).
//
// Der teuerste Zustand dieses Schalters ist nicht der Abbruch, sondern die stille Wirkung: ein
// Tippfehler, der die halbe Werkzeugliste abschaltet und nichts sagt. Jede Prüfung hier hängt
// deshalb an einer Meldung und nicht nur an einem Rückgabewert.

import { describe, expect, it } from "vitest";

import { ConfigError } from "../../src/config/env.js";
import { resolveConfig } from "../../src/config/resolve.js";
import {
  ALL_TOOL_GROUPS,
  TOOL_GROUPS_EXCLUDE_VAR,
  TOOL_GROUPS_VAR,
  parseToolGroupList,
  resolveToolGroups,
  toolGroupInstructionLines,
  toolGroupReportLines,
} from "../../src/config/tool-groups.js";
import { TOOL_GROUP_NAMES, TOOL_GROUPS } from "../../src/registry/groups.js";

/** Zugangsdaten als Platzhalter: `resolveConfig` soll keine Datei des Betreibers lesen. */
const CREDENTIALS = {
  BB_API_CLIENT: "PLATZHALTER",
  BB_API_SECRET: "PLATZHALTER",
  BB_API_KEY: "PLATZHALTER",
} as const;

function resolve(env: Record<string, string>) {
  return resolveConfig({
    env: { ...CREDENTIALS, ...env },
    platform: "linux",
    homeDir: "/nicht/vorhanden",
    nodeVersion: process.versions.node,
  });
}

/** Der ConfigError eines Aufrufs, oder `undefined`, wenn keiner geworfen wurde. */
function configErrorOf(run: () => unknown): ConfigError | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
}

describe("Zerlegen der Kommaliste", () => {
  it("nimmt Leerraum, Großschreibung, doppelte Kommas und ein nachgestelltes Komma an", () => {
    expect(parseToolGroupList("  RECEIPTS , postings,, Reports, ", TOOL_GROUPS_VAR)).toEqual([
      "receipts",
      "postings",
      "reports",
    ]);
  });

  it("zieht einen mehrfach genannten Namen auf sein erstes Vorkommen zusammen", () => {
    expect(parseToolGroupList("reports,receipts,reports", TOOL_GROUPS_VAR)).toEqual([
      "reports",
      "receipts",
    ]);
  });

  it("ergibt für eine Liste aus lauter leeren Teilstücken die leere Menge", () => {
    expect(parseToolGroupList(",,,", TOOL_GROUPS_VAR)).toEqual([]);
  });
});

describe("Startfehler 1: unbekannter Gruppenname", () => {
  it("nennt Wert, Variable, alle zwölf gültigen Namen und den wahrscheinlich gemeinten", () => {
    const error = configErrorOf(() => parseToolGroupList("recipts", TOOL_GROUPS_VAR));
    expect(error?.code).toBe("tool-groups-unknown");
    expect(error?.message).toContain('"recipts"');
    expect(error?.message).toContain(TOOL_GROUPS_VAR);
    for (const name of TOOL_GROUP_NAMES) {
      expect(error?.message).toContain(name);
    }
    expect(error?.message).toContain("Gemeint war wahrscheinlich receipts.");
  });

  it("führt bei den abgekürzten Namen aus der Messtabelle den ausgeschriebenen Namen auf", () => {
    // `cost` und `payment` sind die beiden Namen, die ein Zerlegen am zweiten Unterstrich
    // ergäbe. Sie liegen zu weit von der ausgeschriebenen Form entfernt für einen Vorschlag
    // (Levenshtein-Abstand über 2), stehen aber in der vollständigen Namensliste der Meldung.
    const cost = configErrorOf(() => parseToolGroupList("cost", TOOL_GROUPS_VAR));
    expect(cost?.code).toBe("tool-groups-unknown");
    expect(cost?.message).toContain("cost_locations");

    const payment = configErrorOf(() => parseToolGroupList("payment", TOOL_GROUPS_EXCLUDE_VAR));
    expect(payment?.message).toContain(TOOL_GROUPS_EXCLUDE_VAR);
    expect(payment?.message).toContain("payment_accounts");
  });

  it("lässt den Vorschlag weg, wenn der Wert nichts Ähnlichem gleicht", () => {
    const error = configErrorOf(() => parseToolGroupList("zebra", TOOL_GROUPS_VAR));
    expect(error?.message).not.toContain("Gemeint war wahrscheinlich");
  });

  it("bricht den Serverstart ab, statt den Namen zu übergehen", () => {
    const error = configErrorOf(() => resolve({ BB_MCP_TOOL_GROUPS: "receipts,tippfehler" }));
    expect(error?.code).toBe("tool-groups-unknown");
    expect(error?.message).toContain("Der Server ist nicht gestartet.");
  });
});

describe("Startfehler 2: derselbe Name in beiden Variablen", () => {
  it("meldet den Widerspruch, statt eine Seite gewinnen zu lassen", () => {
    const error = configErrorOf(() =>
      resolve({
        BB_MCP_TOOL_GROUPS: "receipts,reports",
        BB_MCP_TOOL_GROUPS_EXCLUDE: "reports",
      }),
    );
    expect(error?.code).toBe("tool-groups-conflict");
    expect(error?.message).toContain("reports");
    expect(error?.message).toContain(TOOL_GROUPS_VAR);
    expect(error?.message).toContain(TOOL_GROUPS_EXCLUDE_VAR);
  });
});

describe("Startfehler 3: ein Ausschluss ohne Wirkung", () => {
  it("meldet einen Namen der Negativliste, der ohnehin nicht aktiv ist", () => {
    const error = configErrorOf(() =>
      resolve({
        BB_MCP_TOOL_GROUPS: "receipts",
        BB_MCP_TOOL_GROUPS_EXCLUDE: "postings",
      }),
    );
    expect(error?.code).toBe("tool-groups-exclude-without-effect");
    expect(error?.message).toContain("postings");
  });

  it("macht damit beide Variablen zugleich zu einem Startfehler", () => {
    // Aus Startfehler 2 und 3 zusammen folgt: Positiv- und Negativliste gleichzeitig gesetzt
    // sind immer ein Abbruch. Der Unterschied liegt allein in der Diagnose.
    const sameName = configErrorOf(() =>
      resolve({ BB_MCP_TOOL_GROUPS: "receipts", BB_MCP_TOOL_GROUPS_EXCLUDE: "receipts" }),
    );
    const otherName = configErrorOf(() =>
      resolve({ BB_MCP_TOOL_GROUPS: "receipts", BB_MCP_TOOL_GROUPS_EXCLUDE: "reports" }),
    );
    expect(sameName?.code).toBe("tool-groups-conflict");
    expect(otherName?.code).toBe("tool-groups-exclude-without-effect");
  });
});

describe("Startfehler 4: die leere wirksame Menge", () => {
  it("lehnt eine Negativliste ab, die alle zwölf Gruppen nennt", () => {
    const error = configErrorOf(() =>
      resolve({ BB_MCP_TOOL_GROUPS_EXCLUDE: TOOL_GROUP_NAMES.join(",") }),
    );
    expect(error?.code).toBe("tool-groups-empty");
    expect(error?.message).toContain("kein Werkzeug anbietet");
  });

  it("lehnt eine Positivliste ab, die nur aus leeren Teilstücken besteht", () => {
    // `,,` überlebt `parseEnv` (der Wert ist nicht leer), zerfällt aber in nichts.
    const error = configErrorOf(() => resolve({ BB_MCP_TOOL_GROUPS: ",," }));
    expect(error?.code).toBe("tool-groups-empty");
  });
});

describe("der leere Wert", () => {
  it("gilt als nicht gesetzt und ist ausdrücklich kein Fehler", () => {
    // Das Desktop-Bundle setzt die Variable über ${user_config.tool_groups}; ein leer
    // gelassenes optionales Feld darf den Server nicht unstartbar machen.
    const outcome = resolve({ BB_MCP_TOOL_GROUPS: "", BB_MCP_TOOL_GROUPS_EXCLUDE: "   " });
    expect(outcome.config.toolGroups.active).toEqual(TOOL_GROUP_NAMES);
    expect(outcome.config.toolGroups.restricted).toBe(false);
    expect(outcome.warnings.map((warning) => warning.code)).toContain("empty-env-var");
  });
});

describe("die wirksame Menge", () => {
  it("ist ohne beide Variablen die volle Zwölf", () => {
    const outcome = resolve({});
    expect(outcome.config.toolGroups.active).toEqual(TOOL_GROUP_NAMES);
    expect(outcome.config.toolGroups.include).toBeNull();
    expect(outcome.config.toolGroups.exclude).toEqual([]);
    expect(outcome.config.toolGroups.inactive).toEqual([]);
    expect(ALL_TOOL_GROUPS.active).toEqual(TOOL_GROUP_NAMES);
  });

  it("ist mit Positivliste genau diese Gruppen, in der Reihenfolge der Tabelle", () => {
    const { toolGroups } = resolve({ BB_MCP_TOOL_GROUPS: "reports,bundles,receipts" }).config;
    expect(toolGroups.active).toEqual(["receipts", "reports", "bundles"]);
    expect(toolGroups.restricted).toBe(true);
    expect(toolGroups.inactive.every((entry) => entry.because === TOOL_GROUPS_VAR)).toBe(true);
  });

  it("ist mit Negativliste alles außer diesen Gruppen", () => {
    const { toolGroups } = resolve({ BB_MCP_TOOL_GROUPS_EXCLUDE: "invoices" }).config;
    expect(toolGroups.active).toHaveLength(TOOL_GROUP_NAMES.length - 1);
    expect(toolGroups.active).not.toContain("invoices");
    expect(toolGroups.inactive).toEqual([{ group: "invoices", because: TOOL_GROUPS_EXCLUDE_VAR }]);
  });

  it("liegt eingefroren in der Konfiguration", () => {
    const { toolGroups } = resolve({ BB_MCP_TOOL_GROUPS: "receipts" }).config;
    expect(Object.isFrozen(toolGroups)).toBe(true);
    expect(Object.isFrozen(toolGroups.active)).toBe(true);
  });

  it("bleibt orthogonal zum Nur-Lesen-Schalter", () => {
    // Der eine steuert die Registrierung, der andere die Ausführung. Beide zusammen sind kein
    // Widerspruch, sondern das empfohlene Profil „nur auswerten".
    const { config } = resolve({ BB_MCP_TOOL_GROUPS: "bundles,reports", BB_MCP_READ_ONLY: "true" });
    expect(config.readOnly).toBe(true);
    expect(config.toolGroups.active).toEqual(["reports", "bundles"]);
  });
});

describe("die Rückmeldung", () => {
  it("nennt ohne Einschränkung alle Gruppen und die Zahl der Werkzeuge", () => {
    const lines = toolGroupReportLines(ALL_TOOL_GROUPS, 54).join("\n");
    expect(lines).toContain("Aktive Gruppen: alle 12");
    expect(lines).toContain("Registriert: 54 Werkzeuge");
    expect(lines).toContain("Ein leerer Wert gilt als nicht gesetzt");
  });

  it("nennt bei Einschränkung jede abgeschaltete Gruppe mit der Variable, die sie abschaltet", () => {
    const { toolGroups } = resolve({ BB_MCP_TOOL_GROUPS_EXCLUDE: "invoices,comments" }).config;
    const lines = toolGroupReportLines(toolGroups, 50).join("\n");
    // Die abgeschaltete Gruppe trägt ihren deutschen Anzeigenamen mit, der Gruppenname bleibt
    // zum Abschreiben daneben stehen.
    expect(lines).toContain(
      `Abgeschaltet durch ${TOOL_GROUPS_EXCLUDE_VAR}: invoices (Ausgangsrechnungen), comments (Kommentare)`,
    );
    expect(lines).toContain("Registriert: 50 Werkzeuge");
    expect(lines).toContain("BB_MCP_READ_ONLY");
  });

  it("rechnet die Bündelgruppe mit, statt sie als ungemessen auszuweisen", () => {
    const { toolGroups } = resolve({ BB_MCP_TOOL_GROUPS: "bundles,receipts" }).config;
    const lines = toolGroupReportLines(toolGroups, 13).join("\n");
    // Die Summe wird aus den eingecheckten Messungen GERECHNET und nicht abgeschrieben: Eine
    // zweite Zahl neben src/registry/groups.ts wäre eine zweite Quelle der Wahrheit und müsste
    // bei jeder Änderung an einer Werkzeugdefinition mitgepflegt werden. Geprüft wird, was
    // diese Zeile zusichert — dass die Bündelgruppe mitgerechnet und nicht als ungemessen
    // ausgewiesen wird; ihre Zahl ist seit dem 2026-09-13 gemessen (über BUNDLE_ENTRIES, nicht
    // über TOOL_ENTRIES), bis dahin stand dort `null`.
    const expected =
      (TOOL_GROUPS.receipts.measuredTokens ?? 0) + (TOOL_GROUPS.bundles.measuredTokens ?? 0);
    expect(lines).toContain(
      `rund ${expected.toLocaleString("de-DE")} Token an Definitionen (gemessen, Stand 2026-09-13)`,
    );
    expect(lines).not.toContain("noch keine Messung");
  });

  it("stellt die aktiven Gruppen in die instructions und sagt, was ohne die anderen fehlt", () => {
    const full = toolGroupInstructionLines(ALL_TOOL_GROUPS).join("\n");
    expect(full).toContain("WERKZEUGGRUPPEN DIESER INSTALLATION");
    expect(full).toContain("Angemeldet sind alle 12 Gruppen");

    const { toolGroups } = resolve({ BB_MCP_TOOL_GROUPS: "bundles,receipts" }).config;
    const reduced = toolGroupInstructionLines(toolGroups).join("\n");
    expect(reduced).toContain("Angemeldet sind 2 von 12 Gruppen");
    expect(reduced).toContain("Nicht beantwortbar ist damit:");
    expect(reduced).toContain("Nicht danach suchen");
    // Bündel hängen nicht an den Endpunktgruppen, und der Servertext sagt das ausdrücklich.
    expect(reduced).toContain("von den abgeschalteten");
  });
});

describe("resolveToolGroups ohne Umgebung", () => {
  it("nimmt beide Listen auch unmittelbar entgegen", () => {
    expect(resolveToolGroups({ exclude: "postings" }).active).not.toContain("postings");
    expect(resolveToolGroups({ include: "comments" }).active).toEqual(["comments"]);
    expect(resolveToolGroups().restricted).toBe(false);
  });
});
