// Der optionale Stammdatenspeicher (Plan 7.8, Streitfrage S23).
//
// **Im Auslieferungszustand ist er vollständig aus** (`BB_MCP_CACHE_TTL_MS=0`, Plan 6.2).
// Begründung: Ein veralteter Stammdatensatz ist in einer Buchhaltung ein schwer zu findender
// Fehler, und die Ersparnis lohnt erst, wenn ein Agent in einer Schleife nachschlägt. Der
// Schalter ist da, wenn das Minutenlimit drückt; er drängt sich niemandem auf.
//
// Drei Festlegungen, die dieses Modul bindend umsetzt:
//
//  1. **Speicherfähig sind ausschließlich die vier Werkzeuge aus der Tabelle in 7.8.**
//     `/accounts/get` und alle Bewegungsdaten werden **nie** zwischengespeichert; ein
//     `write` für ein anderes Werkzeug legt nichts ab und meldet das zurück.
//  2. **Die Invalidierung kommt aus dem Register** (`ToolEntry.invalidatesCache`) und wird
//     hier nicht wiederholt. Das Modul bekommt Werkzeugnamen übergeben und verwirft genau
//     diese. Die nicht offensichtliche Zeile — jedes Debitoren- und Kreditorenwerkzeug
//     verwirft auch den Sachkontenstand, weil `/settings/get/postingaccounts` eine
//     Vereinigungsliste ist — steht deshalb dort und nicht hier.
//  3. **Der Ablauf läuft über eine einspeisbare Uhr**, nicht über `Date.now()` im Modul,
//     damit er ohne Warten prüfbar ist.
//
// Der Speicher ist prozesslokal, überlebt keinen Neustart, wird nicht auf die Platte
// geschrieben und von zwei Clients nicht geteilt (Plan 7.8 Punkt 5).

import { getConfig } from "../config/resolve.js";
import { logDebug } from "../logging/stderr.js";

/** Die Uhr des Speichers. Im Betrieb die monotone Systemuhr, im Test eine gestellte. */
export interface CacheClock {
  now(): number;
}

/** Die Systemuhr. `performance.now()` ist monoton und springt nicht bei einer Zeitumstellung. */
export const systemCacheClock: CacheClock = {
  now: () => performance.now(),
};

/**
 * Die vier speicherfähigen Werkzeuge (Plan 7.8, erste Spalte der Invalidierungstabelle).
 *
 * `bb_payment_accounts_list` steht hier **bewusst nicht**: Es ist das Werkzeug zu
 * `/accounts/get`, und dafür gilt der Satz aus 7.8 ohne Ausnahme. Die Kontenliste des
 * Mandanten ist die Grundlage jeder Zahlungszuordnung; ein veralteter Stand wäre hier am
 * teuersten.
 */
export const CACHEABLE_TOOLS: readonly string[] = Object.freeze([
  "bb_postingaccounts_search",
  "bb_debtors_search",
  "bb_creditors_search",
  "bb_cost_locations_search",
]);

/** Das Werkzeug hinter der Resource `bb://postingaccounts` (Plan 7.7). */
export const POSTINGACCOUNTS_TOOL = "bb_postingaccounts_search";

/** `true`, wenn dieses Werkzeug überhaupt zwischengespeichert werden darf. */
export function isCacheableTool(tool: string): boolean {
  return CACHEABLE_TOOLS.includes(tool);
}

/** Ein Treffer. `ageMs` ist die Zeit seit dem Ablegen; sie steht wörtlich in der Antwort. */
export interface CacheHit {
  readonly payload: unknown;
  readonly ageMs: number;
}

/**
 * Die Schnittstelle des Speichers, bewusst schmal: ablegen, lesen, verwerfen, und die Frage
 * „ist er eingeschaltet". Mehr braucht weder der generische Handler (AP10) noch die Resource
 * `bb://postingaccounts` (AP14); damit muss keines der beiden Pakete diese Datei ändern.
 */
export interface MasterDataStore {
  /** `false` bei `BB_MCP_CACHE_TTL_MS=0`, also im Auslieferungszustand. */
  isEnabled(): boolean;
  /** Die eingestellte Haltbarkeit in Millisekunden; `0` heißt abgeschaltet. */
  ttlMs(): number;
  isCacheable(tool: string): boolean;
  /** Ein Treffer oder `undefined`. Ein abgelaufener Eintrag ist niemals ein Treffer. */
  read(tool: string): CacheHit | undefined;
  /** @returns `true`, wenn wirklich abgelegt wurde. `false` bei aus oder nicht speicherfähig. */
  write(tool: string, payload: unknown): boolean;
  /** Verwirft die genannten Werkzeugstände. @returns die tatsächlich verworfenen Namen. */
  invalidate(tools: readonly string[]): readonly string[];
  clear(): void;
  /** Zahl der abgelegten Stände. Für Tests und für `doctor`. */
  size(): number;
}

interface StoreEntry {
  readonly payload: unknown;
  readonly storedAt: number;
}

export interface CreateStoreOptions {
  /** Abweichende Haltbarkeit. Ohne Angabe die eingefrorene Konfiguration (Plan 6.2, 6.4). */
  readonly ttlMs?: number;
  readonly clock?: CacheClock;
}

/**
 * Baut einen Speicher.
 *
 * Die Haltbarkeit wird **einmal beim Bau** gelesen und danach nicht mehr: Die Konfiguration
 * ist eingefroren (Plan 6.4), und ein Speicher, der seine eigene Grenze zur Laufzeit ändern
 * könnte, wäre nicht prüfbar.
 */
export function createMasterDataStore(options: CreateStoreOptions = {}): MasterDataStore {
  const ttl = options.ttlMs ?? getConfig().cacheTtlMs;
  const clock = options.clock ?? systemCacheClock;
  const enabled = ttl > 0;
  const entries = new Map<string, StoreEntry>();

  return {
    isEnabled(): boolean {
      return enabled;
    },

    ttlMs(): number {
      return ttl;
    },

    isCacheable(tool: string): boolean {
      return isCacheableTool(tool);
    },

    read(tool: string): CacheHit | undefined {
      // Bei ausgeschaltetem Speicher endet die Abfrage hier. Es gibt bewusst keinen Zweig,
      // in dem danach doch noch ein Wert gelesen würde: Bei ttl = 0 ist die Karte leer,
      // und diese Rückgabe ist die einzige mögliche Antwort (Plan 7.8, AP09).
      if (!enabled) {
        return undefined;
      }
      const entry = entries.get(tool);
      if (entry === undefined) {
        return undefined;
      }
      const ageMs = clock.now() - entry.storedAt;
      if (ageMs >= ttl) {
        // Abgelaufen heißt weg. Ein abgelaufener Wert wird nicht „ersatzweise" geliefert.
        entries.delete(tool);
        return undefined;
      }
      return { payload: entry.payload, ageMs };
    },

    write(tool: string, payload: unknown): boolean {
      if (!enabled) {
        return false;
      }
      if (!isCacheableTool(tool)) {
        // Kein Fehler, aber auch keine stille Ablage: Bewegungsdaten und /accounts/get
        // gehören nie in den Speicher (Plan 7.8).
        logDebug(
          `Stammdatenspeicher: ${tool} ist nicht speicherfähig; es wurde nichts abgelegt. ` +
            `Speicherfähig sind ausschließlich ${CACHEABLE_TOOLS.join(", ")}.`,
        );
        return false;
      }
      entries.set(tool, { payload, storedAt: clock.now() });
      return true;
    },

    invalidate(tools: readonly string[]): readonly string[] {
      const discarded: string[] = [];
      for (const tool of tools) {
        if (entries.delete(tool)) {
          discarded.push(tool);
        }
      }
      if (discarded.length > 0) {
        logDebug(`Stammdatenspeicher: verworfen wurde der Stand von ${discarded.join(", ")}.`);
      }
      return discarded;
    },

    clear(): void {
      entries.clear();
    },

    size(): number {
      return entries.size;
    },
  };
}

let processStore: MasterDataStore | undefined;

/**
 * Der prozessweite Speicher. Er entsteht beim ersten Zugriff aus der eingefrorenen
 * Konfiguration und lebt so lange wie der Serverprozess.
 */
export function getMasterDataStore(): MasterDataStore {
  processStore ??= createMasterDataStore();
  return processStore;
}

/** Setzt den prozessweiten Speicher zurück. Ausschließlich für Tests. */
export function resetMasterDataStoreForTests(): void {
  processStore = undefined;
}

/**
 * Der Absagetext der Resource `bb://postingaccounts`, wenn der Speicher aus ist (Plan 7.7).
 *
 * Er steht hier, damit die Resource ihn nicht neu formulieren muss und damit der Name der
 * Variablen an einer Stelle gepflegt wird; geschrieben wird die Resource in AP14.
 */
export function cacheDisabledNotice(): string {
  return (
    "Der Kontenrahmen liegt nicht vor: Der Stammdatenspeicher dieses Serverprozesses ist " +
    "abgeschaltet (BB_MCP_CACHE_TTL_MS=0, die Vorgabe). Die Kontenliste des Mandanten " +
    `stattdessen mit ${POSTINGACCOUNTS_TOOL} abrufen; sie ist dann immer frisch.`
  );
}
