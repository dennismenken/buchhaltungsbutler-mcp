// Die zentrale Datenstruktur des Projekts. Jede der 54 Dateien unter
// src/registry/tools/ exportiert genau ein Objekt vom Typ ToolEntry; der Typ ist die
// verbindliche Antwort auf die Frage, was ein Werkzeug ausmacht.
//
// Bezeichner und Aufzählungswerte sind englisch (CONTRIBUTING.md Abschnitt 5). Deutsch sind
// ausschließlich die
// Texte, die ein Agent liest: description, title, Parameterbeschreibungen, Fehlertexte
// und die instructions.

import type { ToolGroup } from "./groups.js";

export type { ToolGroup } from "./groups.js";

/**
 * Der Pfad eines Endpunkts. Vier der 54 Endpunkte tragen im
 * Spezifikationspfad das Segment `id_by_customer`; live gemessen ist das ein
 * Platzhalter für den Wert und kein literales Segment.
 *
 * `specPath` ist zwingend und nicht redundant: Der gebaute Pfad trägt eine
 * Geschäftskennung und ist damit nicht konstant, während Fehlerkatalog,
 * Deckungstest (P1, P3) und Audit-Zeile nach dem unveränderten Spezifikationspfad
 * schlüsseln. Nachgeschlagen wird immer mit `specPath`, gesendet immer mit dem
 * gebauten Pfad; die beiden Werte werden nie gegeneinander getauscht.
 */
export type PathSpec =
  | { literal: string } // 50 Endpunkte
  | {
      template: string; // z. B. "/receipts/get/{receipt_id_by_customer}"
      params: string[]; // z. B. ["receipt_id_by_customer"]
      specPath: string; // z. B. "/receipts/get/id_by_customer"
    };

export interface ToolEntry {
  name: string; // bb_…, gleich dem Dateinamen ohne .ts
  title: string; // deutscher Anzeigename, höchstens 40 Zeichen
  group: ToolGroup; // abschaltbar über BB_MCP_TOOL_GROUPS; NIEMALS aus dem Namen abgeleitet
  path: PathSpec; // { literal } oder { template, params, specPath }
  effect: "read" | "create" | "modify" | "delete"; // Wirkung nach grundlagen.md 7.3
  toolClass: "R" | "A" | "AR" | "M" | "D" | "B"; // treibt Annotationen, Retry, Schalter
  tier: 1 | 2 | 3; // Beschreibungsbudget
  description: string; // deutsch, englische Bezeichner und API-Feldnamen im Original
  mandatorySentence?: "U1" | "U2" | "U3" | "U4" | "U5" | "U6" | "U7"; // Pflicht bei toolClass !== "R"
  fields: FieldSpec[]; // jedes Feld des Endpunkts außer api_key, genau einmal
  serverOnlyFields: string[]; // ausschließlich "response_format"
  omitted: { apiName: string; reason: string }[]; // leer, außer api_key; Grund Pflicht
  responseContract: ResponseContract; // je Endpunkt, nicht je Fachobjekt
  shape: "list" | "object" | "ack"; // erwartete Umschlagform
  concise: string[]; // Feldliste der concise-Projektion
  bucket: "default" | "upload" | "batch" | "reports"; // Rate-Limit-Eimer
  timeoutTier: "short" | "normal" | "long"; // Zeitlimitstufe
  verifyWith?: VerifySpec; // Pflicht bei toolClass !== "R"
  duplicateCheck?: DuplicateSpec; // nur bei anlegenden Werkzeugen mit tragfähigem Schlüssel
  crossChecks: CrossCheckId[]; // Q1 bis Q9
  invalidatesCache: string[]; // Werkzeugnamen, deren Cachestand dieser Aufruf verwirft
  verified?: boolean; // false: Aufrufform abgeleitet, nicht gemessen
}

/** Genau ein Werkzeugfeld. Deckt einen, mehrere oder keinen API-Parameter ab. */
export interface FieldSpec {
  name: string; // Name im Werkzeugschema, snake_case
  apiNames: string[]; // die abgedeckten Body-Parameter des Endpunkts.
  //   1 Eintrag im Normalfall (auch bei reiner Umbenennung),
  //   6 oder 7 beim Positionsbehälter (Anhang A),
  //   0 nur bei rein serverseitigen Feldern (serverOnlyFields)
  //     und bei Pfadsegmentfeldern, die die Spezifikation
  //     überhaupt nicht führt
  source: "body" | "path" | "server"; // wohin der Wert geht; "server" verlässt den Prozess nie
  required: boolean;
  requiredReason?: string; // Pflicht, sobald required gegenüber der Spezifikation
  //   verschärft ist; nennt die Belegstelle
  description: string; // deutsch, API-Feldnamen und Werkzeugnamen im Original
  schema: SchemaFragment; // Zod-Baustein aus src/schema/*
  itemFields?: FieldSpec[]; // nur bei Behälterfeldern: Aufbau eines Elements.
  //   Deren apiNames zielen bei den acht Stapelbehältern
  //   auf die Eigenschaften der ELEMENTdefinition, nicht
  //   auf Body-Parameter (Deckung zweiter Stufe); bei den
  //   Positionslisten der Werkzeuge
  //   17, 18, 19, 21 und 23 auf die parallelen
  //   Array-Parameter des Endpunkts
  transform?: "parallel-arrays" | "object-list" | "none"; // Umformung, in der
  //   Werkzeugbeschreibung wörtlich deklariert
}

/** Was dieser eine Endpunkt zurückliefert. Gilt je Endpunkt, nie je Fachobjekt. */
export interface ResponseContract {
  container: "data" | "none"; // wo die Nutzdaten liegen
  fields: Record<string, ContractFieldType>; // gemessene oder dokumentierte Feldnamen
  source: "gemessen" | "dokumentiert"; // Herkunft; "gemessen" nur für 0.3
  measuredOn?: string; // ISO-Datum der Messung, Pflicht bei "gemessen"
}

export type ContractFieldType =
  | "string"
  | "number"
  | "boolean"
  | "null-or-string"
  | "amount-string" // Betrag als String; erzeugt zusätzlich <feld>_cents
  | "bool-string" // "0"/"1"; wird zu echtem Boolean normalisiert
  // Kennung; ausgehend immer String (Umwandlungsregel 2 im Kopf von src/mapping/coerce.ts)
  | "id-string";

/** Der Prüfweg nach einem Zeitlimit. Datenstruktur statt Prosa. */
export type VerifySpec =
  | { kind: "tool"; tool: string; argsFrom: Record<string, string>; hint: string }
  | { kind: "none"; reason: string }; // API bietet keinen Leseweg; Weboberfläche

/** Duplikatsabfrage vor einem anlegenden Aufruf (Guard 6). Vorgabe: abgeschaltet. */
export interface DuplicateSpec {
  tool: string; // das lesende Werkzeug, mit dem gesucht wird
  keyFields: readonly string[]; // die Felder, die zusammen den fachlichen Schlüssel bilden
  perBatch: true; // bei Stapelwerkzeugen genau ein Aufruf für den ganzen Stapel
}

export type CrossCheckId = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8" | "Q9";

/** Ein Zod-Schema für genau ein Feld, aus den Bausteinen in src/schema/*. Der Typ
 *  ist absichtlich weit: src/schema/build.ts setzt die Fragmente zum Objektschema zusammen
 *  und erzwingt dort .strict(); die Bausteine selbst sind gewöhnliche Zod-Typen. */
export type SchemaFragment = import("zod").ZodTypeAny;

// Die folgenden Namen sind aus ToolEntry beziehungsweise FieldSpec abgeleitet und keine
// zweite Quelle: Sie ändern sich zwangsläufig mit, wenn oben ein Wert hinzukommt oder
// entfällt. classes.ts, budget.ts und mandatory-sentences.ts schlüsseln ihre Tabellen
// darüber, damit eine fehlende Zeile ein Übersetzungsfehler ist und kein stiller Ausfall.

/** Die Wirkung eines Endpunkts nach grundlagen.md 7.3. */
export type ToolEffect = ToolEntry["effect"];

/** Die sechs Werkzeugklassen. */
export type ToolClass = ToolEntry["toolClass"];

/** Die drei Stufen des Beschreibungsbudgets. */
export type DescriptionTier = ToolEntry["tier"];

/** Die sieben Pflichtsätze. */
export type MandatorySentenceId = NonNullable<ToolEntry["mandatorySentence"]>;
