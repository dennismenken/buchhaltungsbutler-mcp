// Zugriff auf die Golden-Dateien (Plan 9.4).
//
// Jede Datei trägt eine Herkunftszeile: welcher Endpunkt, welches Datum, welche Quelle. **Die
// Geschäftsdaten sind erfunden, die Struktur nicht.** Diese Datei liest sie und macht daraus
// eine Antwort für die HTTP-Nachbildung; die Form ist in README.md beschrieben.
//
// Der Grund für den Umweg über eine Datei statt eines Objektliteral im Test: Ein Mock, der die
// Annahme des Codes wiederholt, prüft nichts (Plan 9.4). Eine Datei mit Herkunftszeile lässt
// sich gegen die Quelle halten, ein Literal im Test nicht.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { MockReply } from "../helpers/mock-api.js";

export const GOLDEN_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Eine Golden-Datei, wie sie auf der Platte liegt. */
export interface GoldenFile {
  /** Dateiname ohne `.json`. */
  readonly name: string;
  /** Endpunkt, Messdatum, Quelle und die Kennzeichnung der erfundenen Geschäftsdaten. */
  readonly herkunft: string;
  /** Was dieser Fall prüft. */
  readonly zweck: string;
  readonly http: { readonly status: number; readonly contentType: string };
  /** Der Antwortkörper als JSON. Genau eines von `body` und `bodyText` ist gesetzt. */
  readonly body?: unknown;
  /** Der rohe Körper, für HTML und für absichtlich kaputtes JSON. */
  readonly bodyText?: string;
}

interface RawGolden {
  readonly _herkunft?: unknown;
  readonly _zweck?: unknown;
  readonly http?: { readonly status?: unknown; readonly contentType?: unknown };
  readonly body?: unknown;
  readonly bodyText?: unknown;
}

/** Die Namen aller Golden-Dateien, in Codepunktfolge. */
export function goldenNames(): string[] {
  return readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Lädt eine Golden-Datei.
 *
 * Eine fehlende Herkunftszeile ist ein Fehler und keine Nachlässigkeit: Ohne sie ist der
 * Antwortkörper eine Behauptung ohne Quelle, und genau das schließt Plan 9.4 aus.
 */
export function loadGolden(name: string): GoldenFile {
  const file = `${GOLDEN_DIR}${name}.json`;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as RawGolden;

  if (typeof parsed._herkunft !== "string" || parsed._herkunft.trim() === "") {
    throw new Error(`${name}.json trägt keine Herkunftszeile _herkunft (Plan 9.4).`);
  }
  if (typeof parsed._zweck !== "string" || parsed._zweck.trim() === "") {
    throw new Error(`${name}.json sagt in _zweck nicht, welchen Fall es prüft (Plan 9.4).`);
  }
  const status = parsed.http?.status;
  const contentType = parsed.http?.contentType;
  if (typeof status !== "number" || typeof contentType !== "string") {
    throw new Error(`${name}.json trägt keinen vollständigen Block http (status, contentType).`);
  }
  const hasBody = "body" in parsed;
  const hasText = typeof parsed.bodyText === "string";
  if (hasBody === hasText) {
    throw new Error(`${name}.json muss genau eines von body und bodyText tragen.`);
  }

  return {
    name,
    herkunft: parsed._herkunft,
    zweck: parsed._zweck,
    http: { status, contentType },
    ...(hasBody ? { body: parsed.body } : {}),
    ...(hasText ? { bodyText: parsed.bodyText } : {}),
  };
}

/** Der Antwortkörper einer Golden-Datei als JSON-Objekt. Wirft bei einer Rohtextdatei. */
export function goldenBody(name: string): Record<string, unknown> {
  const golden = loadGolden(name);
  if (golden.body === undefined) {
    throw new Error(`${name}.json trägt nur bodyText; für diesen Fall gibt es keinen JSON-Körper.`);
  }
  return golden.body as Record<string, unknown>;
}

/** Die Zeilen einer Listenantwort, unverändert. */
export function goldenRows(name: string): Record<string, unknown>[] {
  const data = goldenBody(name).data;
  if (!Array.isArray(data)) {
    throw new Error(`${name}.json trägt kein Array in data.`);
  }
  return data as Record<string, unknown>[];
}

/** Die Golden-Datei als eingerichtete Antwort für die HTTP-Nachbildung (`mockApi().post`). */
export function goldenReply(name: string): MockReply {
  const golden = loadGolden(name);
  if (golden.bodyText !== undefined) {
    return {
      status: golden.http.status,
      body: golden.bodyText,
      contentType: golden.http.contentType,
    };
  }
  return { status: golden.http.status, json: golden.body, contentType: golden.http.contentType };
}
