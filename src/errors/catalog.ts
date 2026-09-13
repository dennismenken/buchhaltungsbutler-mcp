/**
 * Dünne Hülle um das Generat `src/generated/errors.ts`.
 *
 * Drei Eigenschaften sind der ganze Zweck dieser Datei:
 *
 * 1. **Der Katalog wird dynamisch geladen.** Der `import` unten steht in einer Funktion und
 *    nicht am Dateikopf. Im Normalbetrieb tritt kein Fehler auf, und dann kostet der größte
 *    einzelne Datenblock des Pakets null Ladezeit und null Speicher. Es ist der einzige
 *    dynamische Import des Projekts.
 * 2. **Der Schlüssel ist immer das Paar (`specPath`, `error_code`)**, nie der Code allein:
 *    Über die 786 referenzierten Paare trägt Code 7 achtundzwanzig verschiedene Bedeutungen.
 *    Bei den vier Werkzeugen mit Pfadvorlage ist die erste Ebene der **unveränderte
 *    Spezifikationspfad** (`path.specPath`) und niemals der gebaute Pfad: Der
 *    Schlüssel `/receipts/get/2` steht in keiner Tabelle, und jeder Fehler dieser vier
 *    Werkzeuge fiele sonst auf die Rückfallregel zurück.
 * 3. **Es gelangt immer nur der eine passende Eintrag nach draußen**, nie die Tabelle.
 *
 * Der Typ-Import am Dateikopf ist ausdrücklich `import type`. Er wird beim Übersetzen
 * vollständig entfernt (`verbatimModuleSyntax`) und lädt zur Laufzeit nichts nach; ein
 * gewöhnlicher `import` an dieser Stelle hätte die Zusage aus Punkt 1 stillschweigend
 * aufgehoben.
 */

import type { ErrorClass, ErrorEntry } from "../generated/errors.js";

export type { ErrorClass, ErrorEntry };

/** Der Katalog, wie ihn das Generat liefert: Pfad → `error_code` → Eintrag. */
export type ErrorCatalog = Readonly<Record<string, Readonly<Record<number, ErrorEntry>>>>;

/**
 * Die Abnahmezahlen. Sie sind am 2026-09-12 maschinell gegen
 * `docs/openapi/buchhaltungsbutler-v1.json` ausgezählt: 786 **referenzierte** Paare über 54
 * Pfade. Ausdrücklich nicht 718 — das sind Definitionsnamen, von denen 42 in keinem
 * `responses`-Block vorkommen und damit kein belegtes Serververhalten sind.
 */
export const EXPECTED_PAIR_COUNT = 786;
export const EXPECTED_PATH_COUNT = 54;

let cached: Promise<ErrorCatalog> | null = null;

/**
 * Lädt den Katalog beim ersten Fehler und hält ihn danach.
 *
 * Scheitert das Laden, wird der Zwischenspeicher geleert, damit ein zweiter Fehler es erneut
 * versuchen kann. Ein dauerhaft gemerktes abgelehntes Promise machte aus einem
 * vorübergehenden Ladefehler einen Dauerschaden.
 */
export function loadErrorCatalog(): Promise<ErrorCatalog> {
  if (cached !== null) {
    return cached;
  }
  const pending = import("../generated/errors.js").then(
    (imported): ErrorCatalog => imported.ERRORS as ErrorCatalog,
  );
  cached = pending;
  void pending.catch(() => {
    if (cached === pending) {
      cached = null;
    }
  });
  return pending;
}

/** `true`, sobald der Katalog geladen ist. Nur für Tests und für die Audit-Zeile. */
export function isErrorCatalogLoaded(): boolean {
  return cached !== null;
}

/** Leert den Zwischenspeicher. Ausschließlich für Tests. */
export function resetErrorCatalogForTests(): void {
  cached = null;
}

/**
 * Der Eintrag zum Paar (`specPath`, `error_code`), oder `null`.
 *
 * `null` heißt: Die Spezifikation kennt diesen Code für diesen Pfad nicht. Daraus wird in
 * `classify.ts` die Rückfallregel — **kein Raten und keine Zuordnung zu einem gleichnamigen
 * Code eines anderen Pfades**.
 */
export function lookupInCatalog(
  catalog: ErrorCatalog,
  specPath: string,
  errorCode: number | null,
): ErrorEntry | null {
  if (errorCode === null) {
    return null;
  }
  return catalog[specPath]?.[errorCode] ?? null;
}

/** Wie {@link lookupInCatalog}, lädt den Katalog aber selbst nach. */
export async function lookupErrorEntry(
  specPath: string,
  errorCode: number | null,
): Promise<ErrorEntry | null> {
  if (errorCode === null) {
    // Ohne Code gibt es kein Paar, und ohne Paar gibt es nichts nachzuschlagen. Der Katalog
    // bleibt dann ungeladen; das ist der häufigste Fehlerfall ohne Antwortkörper.
    return null;
  }
  return lookupInCatalog(await loadErrorCatalog(), specPath, errorCode);
}

/** Die Zahl der Paare im Katalog. Grundlage der Abnahmebedingung. */
export function countCatalogPairs(catalog: ErrorCatalog): number {
  let total = 0;
  for (const codes of Object.values(catalog)) {
    total += Object.keys(codes).length;
  }
  return total;
}

/** Alle Paare des Katalogs als flache Liste. Für die Prüfungen der Fehlerschicht. */
export function listCatalogPairs(
  catalog: ErrorCatalog,
): { specPath: string; errorCode: number; entry: ErrorEntry }[] {
  const pairs: { specPath: string; errorCode: number; entry: ErrorEntry }[] = [];
  for (const [specPath, codes] of Object.entries(catalog)) {
    for (const [code, entry] of Object.entries(codes)) {
      pairs.push({ specPath, errorCode: Number.parseInt(code, 10), entry });
    }
  }
  return pairs;
}
