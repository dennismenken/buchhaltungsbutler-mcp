/**
 * Der Gruppenschalter: `BB_MCP_TOOL_GROUPS` und `BB_MCP_TOOL_GROUPS_EXCLUDE` (Entscheidung N5,
 * `docs/entwicklung/buendelwerkzeuge.md` Abschnitt 7).
 *
 * Zwei Variablen statt einer, weil beide typischen Fälle ohne Aufzählung gehen sollen: „nur
 * diese drei" und „alles außer `invoices`".
 *
 * **Entschieden wird einmal beim Serverstart, aus der eingefrorenen Konfiguration.** Das ist
 * protokollrechtlich sauber: Die MUST-NOT-vary-Klausel verbietet eine Werkzeugliste, die je
 * Verbindung oder als Nebenwirkung anderer Anfragen schwankt, nicht eine
 * Konfigurationsentscheidung. Über die gesamte Verbindung bleibt die Liste stabil.
 *
 * **Abgeschaltete Werkzeuge werden gar nicht erst registriert** statt mit `enabled: false`
 * geführt. Das ist der bewusste Gegensatz zum Nur-Lesen-Schalter, der gesperrte Werkzeuge
 * ausdrücklich sichtbar lässt: Der Gruppenschalter existiert, um Kontext zu sparen, der
 * Nur-Lesen-Schalter, um einen Agenten aufzuklären. Beide sind vollständig orthogonal — Gruppen
 * steuern die Registrierung, `BB_MCP_READ_ONLY` die Ausführung.
 *
 * **Ein leerer Wert einer gesetzten Variable ist ausdrücklich kein Fehler**, sondern gilt als
 * nicht gesetzt; `config/env.ts` behandelt ihn bereits so und meldet ihn als Warnung. Das
 * Desktop-Bundle setzt die Variable über `${user_config.tool_groups}`, und ein optionales, vom
 * Nutzer leer gelassenes Feld expandiert damit auf einen leeren Wert. Ein Startfehler darauf
 * machte das Bundle für jeden unstartbar, der das Feld nicht ausfüllt. **Nicht verifiziert**
 * ist, ob eine leere optionale `user_config`-Zeichenkette tatsächlich leer expandiert oder ob
 * der Schlüssel entfällt; die gewählte Behandlung ist unter beiden Ausgängen sicher.
 */

import { closestAllowedValue } from "../errors/render.js";
import {
  BUNDLE_TOOL_GROUP,
  TOOL_GROUPS,
  TOOL_GROUP_NAMES,
  isToolGroup,
  measuredTokensOf,
  type ToolGroup,
} from "../registry/groups.js";
import { ConfigError } from "./env.js";

/** Die beiden Variablennamen. Sie stehen genau hier und werden nirgends neu geschrieben. */
export const TOOL_GROUPS_VAR = "BB_MCP_TOOL_GROUPS";
export const TOOL_GROUPS_EXCLUDE_VAR = "BB_MCP_TOOL_GROUPS_EXCLUDE";

export type ToolGroupVariable = typeof TOOL_GROUPS_VAR | typeof TOOL_GROUPS_EXCLUDE_VAR;

/** Eine abgeschaltete Gruppe samt der Variable, die sie abgeschaltet hat. */
export interface InactiveToolGroup {
  readonly group: ToolGroup;
  readonly because: ToolGroupVariable;
}

export interface ToolGroupSelection {
  /** Die aktiven Gruppen, in der Reihenfolge aus {@link TOOL_GROUP_NAMES}. */
  readonly active: readonly ToolGroup[];
  /** Die inaktiven Gruppen mit der Variable, die sie abgeschaltet hat. */
  readonly inactive: readonly InactiveToolGroup[];
  /** Die Positivliste, oder `null`, wenn die Variable nicht gesetzt war. */
  readonly include: readonly ToolGroup[] | null;
  /** Die Negativliste; leer, wenn die Variable nicht gesetzt war. */
  readonly exclude: readonly ToolGroup[];
  /** `true`, sobald mindestens eine Gruppe abgeschaltet ist. */
  readonly restricted: boolean;
}

/** Der Schlusssatz jeder Abbruchmeldung dieses Servers, wörtlich wie in `resolve.ts`. */
const NOTHING_HAPPENED =
  "Der Server ist nicht gestartet. Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.";

/** Die zwölf gültigen Namen, wie sie in jeder Fehlermeldung erscheinen. */
function validNamesLine(): string {
  return `Gültig sind genau zwölf Namen: ${TOOL_GROUP_NAMES.join(", ")}.`;
}

/**
 * Zerlegt den Wert einer der beiden Variablen in Gruppennamen.
 *
 * Getrimmt, kleingeschrieben, an Kommas zerlegt; Leerraum um die Namen entfällt,
 * Großschreibung wird angenommen, ein nachgestelltes Komma ist kein Fehler. Leere Teilstücke
 * aus doppelten Kommas werden verworfen, weil sie keine Funktionalität verstecken können.
 * Ein mehrfach genannter Name wird auf sein erstes Vorkommen zusammengezogen.
 *
 * @throws ConfigError bei jedem Namen, der keine der zwölf Gruppen ist.
 */
export function parseToolGroupList(raw: string, variable: ToolGroupVariable): readonly ToolGroup[] {
  const groups: ToolGroup[] = [];
  for (const part of raw.split(",")) {
    const candidate = part.trim().toLowerCase();
    if (candidate === "") {
      continue;
    }
    if (!isToolGroup(candidate)) {
      const probablyMeant = closestAllowedValue(candidate, TOOL_GROUP_NAMES);
      throw new ConfigError(
        "tool-groups-unknown",
        [
          `Abbruch: ${variable} nennt die unbekannte Werkzeuggruppe "${candidate}".`,
          validNamesLine(),
          ...(probablyMeant === null ? [] : [`Gemeint war wahrscheinlich ${probablyMeant}.`]),
          "Ein Tippfehler wird hier nicht stillschweigend übergangen: Er schaltete sonst " +
            "Werkzeuge ab, ohne dass es jemand merkt.",
          NOTHING_HAPPENED,
        ].join("\n"),
      );
    }
    if (!groups.includes(candidate)) {
      groups.push(candidate);
    }
  }
  return groups;
}

/** Die Namen in der Reihenfolge der Tabelle, damit jede Ausgabe dieselbe Sortierung hat. */
function inTableOrder(groups: readonly ToolGroup[]): readonly ToolGroup[] {
  return TOOL_GROUP_NAMES.filter((group) => groups.includes(group));
}

export interface ResolveToolGroupsInput {
  /** Rohwert von `BB_MCP_TOOL_GROUPS`; `undefined`, wenn nicht oder leer gesetzt. */
  readonly include?: string | undefined;
  /** Rohwert von `BB_MCP_TOOL_GROUPS_EXCLUDE`; `undefined`, wenn nicht oder leer gesetzt. */
  readonly exclude?: string | undefined;
}

/**
 * Löst beide Variablen zur wirksamen Menge auf.
 *
 * Reihenfolge: zerlegen und prüfen, dann Widerspruch, dann wirkungsloser Ausschluss, dann die
 * leere Menge. Aktiv ist die Positivliste, sonst alle zwölf, jeweils abzüglich der Negativliste.
 *
 * @throws ConfigError in den vier Startfehlern aus Abschnitt 7 der Bauvorlage.
 */
export function resolveToolGroups(input: ResolveToolGroupsInput = {}): ToolGroupSelection {
  const include =
    input.include === undefined ? null : parseToolGroupList(input.include, TOOL_GROUPS_VAR);
  const exclude =
    input.exclude === undefined ? [] : parseToolGroupList(input.exclude, TOOL_GROUPS_EXCLUDE_VAR);

  // Startfehler 2: derselbe Name in beiden Variablen. Über dieselbe Gruppe wurde „nur diese"
  // und „diese nicht" gesagt; kein stilles Gewinnen einer Seite.
  if (include !== null) {
    const both = inTableOrder(exclude.filter((group) => include.includes(group)));
    if (both.length > 0) {
      throw new ConfigError(
        "tool-groups-conflict",
        [
          `Abbruch: ${TOOL_GROUPS_VAR} und ${TOOL_GROUPS_EXCLUDE_VAR} widersprechen sich.`,
          `In beiden Variablen steht: ${both.join(", ")}.`,
          "Damit wurde über dieselbe Gruppe zugleich „nur diese“ und „diese nicht“ gesagt. " +
            "Keine der beiden Seiten gewinnt stillschweigend.",
          `Abhilfe: den Namen aus einer der beiden Variablen entfernen. ${TOOL_GROUPS_VAR} allein ` +
            `genügt für „nur diese“, ${TOOL_GROUPS_EXCLUDE_VAR} allein für „alles außer diesen“.`,
          NOTHING_HAPPENED,
        ].join("\n"),
      );
    }
  }

  const base = include ?? TOOL_GROUP_NAMES;

  // Startfehler 3: ein Ausschluss, der nichts ausschließt. Ein Schalter ohne Wirkung ist genau
  // die Rückmeldungslücke, gegen die dieser Abschnitt gebaut ist.
  const withoutEffect = inTableOrder(exclude.filter((group) => !base.includes(group)));
  if (withoutEffect.length > 0) {
    throw new ConfigError(
      "tool-groups-exclude-without-effect",
      [
        `Abbruch: ${TOOL_GROUPS_EXCLUDE_VAR} nennt Gruppen, die ohnehin nicht aktiv sind: ${withoutEffect.join(", ")}.`,
        include === null
          ? "Das kann nicht sein, solange die Positivliste nicht gesetzt ist; bitte den Wert prüfen."
          : `Aktiv sind durch ${TOOL_GROUPS_VAR} nur: ${include.join(", ")}. Ein Ausschluss ` +
            "außerhalb dieser Menge bewirkt nichts.",
        "Ein Schalter, der nichts bewirkt, wird hier nicht hingenommen: Er sieht aus wie eine " +
          "getroffene Entscheidung und ist keine.",
        NOTHING_HAPPENED,
      ].join("\n"),
    );
  }

  const active = inTableOrder(base.filter((group) => !exclude.includes(group)));

  // Startfehler 4: ein Server ohne Werkzeuge ist kein Server.
  if (active.length === 0) {
    throw new ConfigError(
      "tool-groups-empty",
      [
        "Abbruch: Die Einstellung lässt keine einzige Werkzeuggruppe übrig.",
        `${TOOL_GROUPS_VAR}=${input.include ?? "(nicht gesetzt)"}`,
        `${TOOL_GROUPS_EXCLUDE_VAR}=${input.exclude ?? "(nicht gesetzt)"}`,
        "Ein Server, der kein Werkzeug anbietet, ist kein Server. Mindestens eine Gruppe muss " +
          "aktiv bleiben.",
        validNamesLine(),
        NOTHING_HAPPENED,
      ].join("\n"),
    );
  }

  const inactive: InactiveToolGroup[] = [];
  for (const group of TOOL_GROUP_NAMES) {
    if (active.includes(group)) {
      continue;
    }
    inactive.push({
      group,
      // Die Negativliste ist der genauere Grund: Ein Name, der dort steht, wäre sonst aktiv.
      because: exclude.includes(group) ? TOOL_GROUPS_EXCLUDE_VAR : TOOL_GROUPS_VAR,
    });
  }

  return Object.freeze({
    active: Object.freeze(active),
    inactive: Object.freeze(inactive),
    include: include === null ? null : Object.freeze([...inTableOrder(include)]),
    exclude: Object.freeze([...inTableOrder(exclude)]),
    restricted: inactive.length > 0,
  });
}

/** Die Auswahl ohne jede Einschränkung: alle zwölf Gruppen aktiv. Die Vorgabe des Servers. */
export const ALL_TOOL_GROUPS: ToolGroupSelection = resolveToolGroups();

/**
 * Die Rückmeldung zum Gruppenschalter, als Zeilen ohne Einrückung.
 *
 * Ohne sie kann niemand den Hebel einstellen: Eine Werkzeugliste, die aus unsichtbaren Gründen
 * kürzer ist als erwartet, ist der teuerste Zustand dieses Schalters. Dieselben Zeilen nehmen
 * die Startmeldung, `doctor` und `print-config`; drei Stellen, ein Wortlaut.
 *
 * @param registeredTools Die Zahl der tatsächlich registrierten Werkzeuge, nicht geschätzt.
 */
export function toolGroupReportLines(
  selection: ToolGroupSelection,
  registeredTools: number,
): readonly string[] {
  const { tokens, unmeasured } = measuredTokensOf(selection.active);
  const count = `${String(selection.active.length)} von ${String(TOOL_GROUP_NAMES.length)}`;
  const lines: string[] = [
    selection.restricted
      ? `Aktive Gruppen (${count}): ${selection.active.join(", ")}`
      : `Aktive Gruppen: alle ${String(TOOL_GROUP_NAMES.length)} — ${selection.active.join(", ")}`,
    `Registriert: ${String(registeredTools)} Werkzeuge, rund ${tokens.toLocaleString("de-DE")} Token an Definitionen` +
      (unmeasured.length === 0
        ? " (gemessen, Stand 2026-09-13)."
        : `, ohne ${unmeasured.join(", ")} — für diese Gruppe liegt noch keine Messung vor.`),
  ];

  for (const variable of [TOOL_GROUPS_VAR, TOOL_GROUPS_EXCLUDE_VAR] as const) {
    const off = selection.inactive
      .filter((entry) => entry.because === variable)
      .map((entry) => entry.group);
    if (off.length === 0) {
      continue;
    }
    // Die abgeschalteten Gruppen tragen ihren deutschen Anzeigenamen mit. Der Gruppenname ist
    // das, was getippt wird; das Label ist das, was ein Buchhalter wiedererkennt, und N2 nennt
    // ihn als Zielgruppe. Die aktiven Gruppen stehen dagegen nackt da: Sie sollen zum
    // Abschreiben in die Variable taugen.
    const named = off.map((group) => `${group} (${TOOL_GROUPS[group].label})`).join(", ");
    lines.push(
      variable === TOOL_GROUPS_VAR
        ? `Abgeschaltet, weil nicht in ${variable}: ${named}`
        : `Abgeschaltet durch ${variable}: ${named}`,
    );
  }

  if (selection.restricted) {
    lines.push(
      "Was damit unbeantwortbar ist: " +
        selection.inactive.map((entry) => TOOL_GROUPS[entry.group].withoutIt).join("; ") +
        ".",
    );
    lines.push(
      "Der Gruppenschalter spart Kontext, er begrenzt keinen Zugriff. Bündel greifen " +
        "unmittelbar auf die API zu und sind von den Endpunktgruppen nicht eingeschränkt; wer " +
        "den Zugriff begrenzen will, nimmt BB_MCP_READ_ONLY.",
    );
  }

  lines.push(
    `Beide Variablen werden einmal beim Start gelesen. Ein leerer Wert gilt als nicht gesetzt; ` +
      `ohne Angabe sind alle ${String(TOOL_GROUP_NAMES.length)} Gruppen aktiv.`,
  );

  return lines;
}

/**
 * Die Zeilen über die Werkzeuggruppen für die `instructions` (N5, Rückmeldung Stelle 3).
 *
 * Ein Agent, der ein Werkzeug nicht findet, baut Umwege oder behauptet eine fehlende Fähigkeit
 * der API. Deshalb stehen die aktiven Gruppen immer namentlich im Servertext, und bei
 * abgeschalteter Gruppe zusätzlich, welche Fragen diese Installation damit nicht beantworten
 * kann. Der Text nennt keine Werkzeugnamen: Sie stehen in `tools/list` und wären hier eine
 * zweite, alternde Liste.
 */
export function toolGroupInstructionLines(selection: ToolGroupSelection): readonly string[] {
  const total = String(TOOL_GROUP_NAMES.length);
  const lines: string[] = ["WERKZEUGGRUPPEN DIESER INSTALLATION"];

  if (!selection.restricted) {
    lines.push(`Angemeldet sind alle ${total} Gruppen: ${selection.active.join(", ")}.`);
    return lines;
  }

  lines.push(
    `Angemeldet sind ${String(selection.active.length)} von ${total} Gruppen: ${selection.active.join(", ")}.`,
  );
  lines.push(
    `Abgeschaltet: ${selection.inactive.map((entry) => entry.group).join(", ")}. Werkzeuge dieser`,
  );
  lines.push(
    "Gruppen gibt es hier nicht. Nicht danach suchen und keinen Umweg bauen; die Aufgabe ist in",
  );
  lines.push("dieser Installation nicht lösbar, und das ist kein Fehler der API.");
  lines.push(
    `Nicht beantwortbar ist damit: ${selection.inactive
      .map((entry) => TOOL_GROUPS[entry.group].withoutIt)
      .join("; ")}.`,
  );
  lines.push(
    "Der Betreiber schaltet eine Gruppe über BB_MCP_TOOL_GROUPS wieder zu; das wirkt erst nach",
  );
  lines.push("einem Neustart des Servers und ist aus einem Gespräch heraus nicht möglich.");

  if (selection.active.includes(BUNDLE_TOOL_GROUP)) {
    lines.push(
      "Die Bündelwerkzeuge greifen unmittelbar auf die API zu; sie sind von den abgeschalteten",
    );
    lines.push("Endpunktgruppen nicht eingeschränkt.");
  }

  return lines;
}
