// Der Vergleich zweier OpenAPI-Spezifikationen: `scripts/spec-drift.ts`.
//
// Diese Datei enthält REINE LOGIK. Sie kennt weder das Netz noch das Dateisystem, liest
// keine Datei und schreibt keine. Das ist Absicht und keine Bequemlichkeit: Der Vergleich
// wird von zwei Stellen aus aufgerufen, von der Kommandozeile (`scripts/check-spec-drift.ts`)
// und aus dem Testlauf (`test/unit/spec-drift.test.ts`). Eine Datei, die beim Import schon
// etwas ins Netz schickt, wäre aus dem Testlauf heraus nicht prüfbar.
//
// **Was verglichen wird.** Die Spezifikation des Anbieters hat einen Aufbau, den die
// Datei `docs/openapi/buchhaltungsbutler-v1.json` genau abbildet: eine Versionsangabe unter
// `info.version`, die Pfade unter `paths` und die Datentypen unter `definitions`. Alles
// andere auf der obersten Ebene (etwa `host`, `basePath`, `schemes`) wird mitgezählt, aber
// getrennt ausgewiesen.
//
// **Der Vergleich ist semantisch.** Zwei gleichlautende Objekte gelten als gleich, auch
// wenn ihre Schlüssel in anderer Reihenfolge stehen: JSON-Objekte sind ungeordnet, und die
// Reihenfolge einer Datei ist kein Sachverhalt. Zwei Arrays gelten nur dann als gleich, wenn
// sie in gleicher Reihenfolge stehen: Hier trägt die Position eine Bedeutung, etwa bei der
// Reihenfolge der Parameter eines Aufrufs.
//
// **Warum es diese Datei überhaupt gibt.** Der Anbieter hat die Spezifikation geändert
// (neue Pfade, geänderte Parameter), ohne die Versionsnummer zu erhöhen. Ein Vergleich nur
// über die Versionsnummer fände das nicht; ein Vergleich des vollständigen Inhalts schon.

/** Die obersten Schlüssel, die je Spezifikation für sich ausgewiesen werden. */
const PATHS_KEY = "paths";

/** Die obersten Schlüssel, die je Definition für sich ausgewiesen werden. */
const DEFINITIONS_KEY = "definitions";

/**
 * Das Ergebnis eines Vergleichs zweier Spezifikationen.
 *
 * Alle Listen sind sortiert, damit die Ausgabe zweier Läufe über dieselben Daten
 * zeichengleich ist.
 */
export interface SpecDiff {
  /** Die Versionsangabe der eingecheckten Spezifikation (`info.version`), sonst null. */
  readonly versionLocal: string | null;
  /** Die Versionsangabe der Live-Spezifikation (`info.version`), sonst null. */
  readonly versionLive: string | null;
  /** Pfade, die nur in der Live-Spezifikation stehen. */
  readonly addedPaths: readonly string[];
  /** Pfade, die nur in der eingecheckten Spezifikation stehen. */
  readonly removedPaths: readonly string[];
  /** Pfade, die auf beiden Seiten stehen, deren Inhalt sich aber unterscheidet. */
  readonly changedPaths: readonly string[];
  /** Datentypen, die nur in der Live-Spezifikation stehen. */
  readonly addedDefinitions: readonly string[];
  /** Datentypen, die nur in der eingecheckten Spezifikation stehen. */
  readonly removedDefinitions: readonly string[];
  /** Datentypen, die auf beiden Seiten stehen, deren Inhalt sich aber unterscheidet. */
  readonly changedDefinitions: readonly string[];
  /** Übrige Schlüssel der obersten Ebene, deren Inhalt sich unterscheidet. */
  readonly changedTopLevelKeys: readonly string[];
  /** Ob beide Spezifikationen inhaltlich gleich sind. */
  readonly identical: boolean;
}

/**
 * Prüft, ob zwei Werte inhaltlich gleich sind.
 *
 * Die Reihenfolge der Schlüssel eines Objekts zählt nicht, die Reihenfolge der Elemente
 * eines Arrays zählt. Zwei Werte, die mit `===` übereinstimmen, sind immer gleich; das
 * deckt die grundlegenden JSON-Typen ab und beendet die Suche vorzeitig.
 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) {
    return false;
  }
  if (leftIsArray) {
    const leftItems = left as readonly unknown[];
    const rightItems = right as readonly unknown[];
    if (leftItems.length !== rightItems.length) {
      return false;
    }
    for (let index = 0; index < leftItems.length; index += 1) {
      if (!deepEqual(leftItems[index], rightItems[index])) {
        return false;
      }
    }
    return true;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in rightRecord)) {
      return false;
    }
    if (!deepEqual(leftRecord[key], rightRecord[key])) {
      return false;
    }
  }
  return true;
}

/** Liest ein Objekt aus einem unbekannten Wert, sonst einen leeren Mitschnitt. */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

/** Liest die Versionsangabe aus `info.version`, sonst null. */
function readVersion(spec: unknown): string | null {
  const info = asRecord(asRecord(spec).info);
  const version = info.version;
  return typeof version === "string" ? version : null;
}

/** Liest einen Abschnitt der Spezifikation als Objekt, sonst einen leeren Mitschnitt. */
function readSection(spec: unknown, key: string): Record<string, unknown> {
  return asRecord(asRecord(spec)[key]);
}

/**
 * Vergleicht zwei Schnitte einer Spezifikation.
 *
 * Beide Schnitte sind gleich aufgebaut: Schlüssel gegen Werte. Das Ergebnis ist dreifach
 * geteilt in nur links, nur rechts und auf beiden Seiten, aber mit anderem Inhalt.
 */
function compareSection(
  local: Record<string, unknown>,
  live: Record<string, unknown>,
): { added: string[]; removed: string[]; changed: string[] } {
  const localKeys = Object.keys(local);
  const liveKeys = Object.keys(live);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of localKeys) {
    if (!(key in live)) {
      removed.push(key);
    } else if (!deepEqual(local[key], live[key])) {
      changed.push(key);
    }
  }
  for (const key of liveKeys) {
    if (!(key in local)) {
      added.push(key);
    }
  }

  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed };
}

/**
 * Vergleicht die eingecheckte Spezifikation mit der Live-Spezifikation.
 *
 * Der Vergleich ist rein: Es wird nichts gelesen, nichts geholt und nichts geschrieben.
 */
export function compareSpecs(local: unknown, live: unknown): SpecDiff {
  const paths = compareSection(readSection(local, PATHS_KEY), readSection(live, PATHS_KEY));
  const definitions = compareSection(
    readSection(local, DEFINITIONS_KEY),
    readSection(live, DEFINITIONS_KEY),
  );

  // Die übrigen Schlüssel der obersten Ebene werden gesondert behandelt: Sie stehen
  // weder unter `paths` noch unter `definitions` und haben je einen eigenen Wert.
  const localTop = asRecord(local);
  const liveTop = asRecord(live);
  const changedTopLevelKeys: string[] = [];
  for (const key of Object.keys(localTop)) {
    if (key === PATHS_KEY || key === DEFINITIONS_KEY) {
      continue;
    }
    if (!(key in liveTop)) {
      changedTopLevelKeys.push(key);
    } else if (!deepEqual(localTop[key], liveTop[key])) {
      changedTopLevelKeys.push(key);
    }
  }
  for (const key of Object.keys(liveTop)) {
    if (key === PATHS_KEY || key === DEFINITIONS_KEY) {
      continue;
    }
    if (!(key in localTop)) {
      changedTopLevelKeys.push(key);
    }
  }
  changedTopLevelKeys.sort();

  const identical =
    paths.added.length === 0 &&
    paths.removed.length === 0 &&
    paths.changed.length === 0 &&
    definitions.added.length === 0 &&
    definitions.removed.length === 0 &&
    definitions.changed.length === 0 &&
    changedTopLevelKeys.length === 0;

  return {
    versionLocal: readVersion(local),
    versionLive: readVersion(live),
    addedPaths: paths.added,
    removedPaths: paths.removed,
    changedPaths: paths.changed,
    addedDefinitions: definitions.added,
    removedDefinitions: definitions.removed,
    changedDefinitions: definitions.changed,
    changedTopLevelKeys,
    identical,
  };
}

/** Ein Abschnitt des Berichts: eine Überschrift und die darunterliegenden Namen. */
interface DiffSection {
  /** Die Überschrift des Abschnitts im Klartext. */
  readonly title: string;
  /** Die Namen, die unter der Überschrift stehen. */
  readonly names: readonly string[];
}

/** Baut die Abschnitte des Berichts in der Reihenfolge, in der sie ausgegeben werden. */
function diffSections(diff: SpecDiff): DiffSection[] {
  return [
    { title: "Neue Pfade", names: diff.addedPaths },
    { title: "Entfernte Pfade", names: diff.removedPaths },
    { title: "Geänderte Pfade", names: diff.changedPaths },
    { title: "Neue Datentypen", names: diff.addedDefinitions },
    { title: "Entfernte Datentypen", names: diff.removedDefinitions },
    { title: "Geänderte Datentypen", names: diff.changedDefinitions },
    { title: "Geänderte Schlüssel der obersten Ebene", names: diff.changedTopLevelKeys },
  ];
}

/**
 * Formt das Vergleichsergebnis in deutschen Klartext.
 *
 * Bei gleichem Inhalt ist das Ergebnis eine einzige Zeile. Sonst nennt der Text die
 * Versionsangaben beider Seiten, die Namen je Kategorie und, wenn beide Seiten dieselbe
 * Versionsnummer tragen, den Hinweis, dass die Nummer allein nichts über die Gleichheit
 * sagt: Genau dieser Fall war der Anlass für dieses Skript.
 */
export function formatSpecDiff(diff: SpecDiff): string {
  if (diff.identical) {
    // Sind beide Spezifikationen inhaltlich gleich, tragen sie auch dieselbe
    // Versionsnummer; die wird deshalb nur einmal genannt.
    const version = diff.versionLocal ?? diff.versionLive ?? "ohne Angabe";
    return `Die eingecheckte Spezifikation und die Live-Spezifikation sind gleich (Version ${version}).`;
  }

  const lines: string[] = [];
  const localVersion = diff.versionLocal ?? "ohne Angabe";
  const liveVersion = diff.versionLive ?? "ohne Angabe";
  lines.push(
    `Die eingecheckte Spezifikation (Version ${localVersion}) und die Live-Spezifikation ` +
      `(Version ${liveVersion}) weichen voneinander ab.`,
  );

  // Der Hinweis gilt nur, wenn beide Seiten tatsächlich eine Versionsnummer tragen. Fehlt
  // sie auf einer Seite, gibt es nichts zu vergleichen, und der Satz wäre irreführend.
  if (diff.versionLocal !== null && diff.versionLocal === diff.versionLive) {
    lines.push(
      "Beide Seiten tragen dieselbe Versionsnummer. Die Nummer allein sagt nichts über die " +
        "Gleichheit aus: Der Anbieter hat den Inhalt geändert, ohne die Version zu erhöhen.",
    );
  }

  for (const section of diffSections(diff)) {
    if (section.names.length === 0) {
      continue;
    }
    const count = section.names.length;
    const headline = count === 1 ? `${section.title} (1)` : `${section.title} (${count})`;
    lines.push("");
    lines.push(`${headline}:`);
    for (const name of section.names) {
      lines.push(`  ${name}`);
    }
  }

  return lines.join("\n");
}
