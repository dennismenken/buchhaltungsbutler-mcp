/**
 * Die Umgebungsvariablen des Servers, vollständig nach Plan 6.2.
 *
 * Jede Variable steht genau einmal in diesem Modul, mit Typ, Vorgabe und Prüfregel. Daraus
 * ergibt sich beides: das Zod-Schema für die Werteprüfung (6.4 Punkt 3) und die Liste der
 * bekannten Namen, gegen die jede unbekannte `BB_*`-Variable gehalten wird (6.4 Punkt 2).
 *
 * Grundregel aus 6.4: Ein **unbrauchbarer Wert führt zum Abbruch**, nicht zum stillen
 * Zurückfallen auf die Vorgabe. `BB_MCP_READ_ONLY=ture` darf nicht „aus" bedeuten.
 */

import path from "node:path";
import { z } from "zod";

import { LOG_LEVELS, type LogLevel } from "../logging/stderr.js";

/** Basis-URL der API, wenn `BB_BASE_URL` nicht gesetzt ist (6.2). */
export const DEFAULT_BASE_URL = "https://webapp.buchhaltungsbutler.de/api/v1";

/** Verzeichnisname der Zugangsdatendatei unter dem Konfigurationsort des Systems. */
export const CONFIG_DIR_NAME = "buchhaltungsbutler-mcp";

/** Die drei Zugangsdaten. Ihr Wert erscheint in keiner Meldung, auch nicht gekürzt (6.5). */
export const CREDENTIAL_VARS = ["BB_API_CLIENT", "BB_API_SECRET", "BB_API_KEY"] as const;

export type CredentialVarName = (typeof CREDENTIAL_VARS)[number];

/**
 * Der veraltete Name des Nur-Lesen-Schalters aus `distribution.md` 13.2. Er wird weiter
 * akzeptiert, erzeugt aber eine Warnung; kanonisch ist `BB_MCP_READ_ONLY` (6.1).
 */
export const DEPRECATED_READ_ONLY_VAR = "BB_READ_ONLY";

/** Ein Konfigurationsfehler, der den Start abbricht. Der Text ist fertig für stderr. */
export class ConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

// --- Bausteine -----------------------------------------------------------------------

const TRUE_LITERALS = ["true", "1", "yes", "on"] as const;
const FALSE_LITERALS = ["false", "0", "no", "off"] as const;

function booleanVar() {
  return z
    .string()
    .trim()
    .transform((raw) => raw.toLowerCase())
    .refine(
      (raw) =>
        (TRUE_LITERALS as readonly string[]).includes(raw) ||
        (FALSE_LITERALS as readonly string[]).includes(raw),
      {
        error: `kein Wahrheitswert. Erlaubt sind ${TRUE_LITERALS.join(", ")} für an und ${FALSE_LITERALS.join(", ")} für aus`,
      },
    )
    .transform((raw) => (TRUE_LITERALS as readonly string[]).includes(raw));
}

function integerVar(options: { min: number; max: number; hint: string }) {
  return z
    .string()
    .trim()
    .refine((raw) => /^\d+$/.test(raw), {
      error: "keine ganze Zahl ohne Vorzeichen",
    })
    .transform((raw) => Number.parseInt(raw, 10))
    .refine((value) => Number.isSafeInteger(value), { error: "zu groß für eine ganze Zahl" })
    .refine((value) => value >= options.min && value <= options.max, {
      error: options.hint,
    });
}

/**
 * Prüft die Basis-URL: `https:` ist Pflicht, `http:` nur gegen `localhost` (5.1). Ein
 * Anmeldeteil in der URL ist verboten, weil er ein zweites, unbeachtetes Geheimnis wäre;
 * Abfrage und Fragment sind verboten, weil der Pfad der 54 Endpunkte hinten angehängt wird.
 */
export function checkBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "keine gültige URL";
  }
  if (url.username !== "" || url.password !== "") {
    return "enthält einen Anmeldeteil; Zugangsdaten gehören in BB_API_CLIENT und BB_API_SECRET";
  }
  if (url.search !== "" || url.hash !== "") {
    return "enthält eine Abfrage oder ein Fragment; erlaubt ist nur ein Schema mit Host und Pfad";
  }
  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol === "http:" && !isLocal) {
    return "http: ist nur gegen localhost erlaubt; sonst https: verwenden";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `Schema ${url.protocol} ist nicht erlaubt; erlaubt sind https: und, gegen localhost, http:`;
  }
  return "";
}

function normalizeBaseUrl(raw: string): string {
  // Der Pfad der Endpunkte wird angehängt. Ein abschließender Schrägstrich erzeugte sonst
  // einen doppelten Trenner, den manche Server als anderen Pfad behandeln.
  return raw.trim().replace(/\/+$/, "");
}

// --- Schema --------------------------------------------------------------------------

/**
 * Das Schema aller Umgebungsvariablen aus 6.2.
 *
 * Zwei Vorgaben stehen bewusst **nicht** hier, sondern in {@link ENV_DEFAULTS}:
 * `BB_MCP_READ_ONLY`, weil `resolve.ts` unterscheiden muss, ob der Schalter gesetzt war
 * (Widerspruchsprüfung mit `BB_READ_ONLY`, 6.1), und `BB_CONFIG_DIR`, weil die Vorgabe vom
 * Betriebssystem abhängt.
 */
export const envSchema = z.object({
  BB_API_CLIENT: z.string().min(1, { error: "darf nicht leer sein" }).optional(),
  BB_API_SECRET: z.string().min(1, { error: "darf nicht leer sein" }).optional(),
  BB_API_KEY: z.string().min(1, { error: "darf nicht leer sein" }).optional(),

  BB_BASE_URL: z
    .string()
    .trim()
    .superRefine((raw, ctx) => {
      const problem = checkBaseUrl(raw);
      if (problem !== "") {
        ctx.addIssue({ code: "custom", message: problem });
      }
    })
    .transform(normalizeBaseUrl)
    .default(DEFAULT_BASE_URL),

  BB_PROFILE: z
    .string()
    .trim()
    .refine((raw) => /^[A-Za-z0-9._-]{1,64}$/.test(raw) && raw !== "." && raw !== "..", {
      error:
        "erlaubt sind 1 bis 64 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich",
    })
    .default("default"),

  BB_CONFIG_DIR: z
    .string()
    .trim()
    .min(1, { error: "darf nicht leer sein" })
    // Ein relativer Pfad hinge am Arbeitsverzeichnis des Clients, das niemand kennt.
    .transform((raw) => path.resolve(raw))
    .optional(),

  BB_MCP_READ_ONLY: booleanVar().optional(),
  BB_READ_ONLY: booleanVar().optional(),

  BB_MCP_MAX_BATCH: integerVar({ min: 1, max: 50, hint: "muss zwischen 1 und 50 liegen" }).default(
    50,
  ),

  // Dezimalzeichenkette, nie Gleitkomma: Beträge werden in Ganzzahl-Cent gerechnet (Plan 5.9,
  // mapping/decimal.ts). Dreizehn Vorkommastellen halten den Centwert im sicheren
  // Ganzzahlbereich von JavaScript.
  BB_MCP_MAX_AMOUNT: z
    .string()
    .trim()
    .refine((raw) => /^\d{1,13}(\.\d{1,2})?$/.test(raw), {
      error:
        "keine Dezimalzeichenkette mit Punkt und höchstens zwei Nachkommastellen, zum Beispiel 2500.00",
    })
    .refine((raw) => Number.parseFloat(raw) > 0, { error: "muss größer als 0 sein" })
    .optional(),

  BB_MCP_RATE_LIMIT: integerVar({
    min: 10,
    max: 100,
    hint: "muss zwischen 10 und 100 liegen; Werte über 100 werden abgelehnt, nicht gekappt",
  }).default(60),

  BB_MCP_TIMEOUT_MS: integerVar({
    min: 5000,
    // Obergrenze ist die technische Grenze von AbortSignal.timeout, nicht eine fachliche.
    max: 2_147_483_647,
    hint: "muss mindestens 5000 betragen",
  }).default(30_000),

  BB_MCP_DUPLICATE_CHECK: z
    .string()
    .trim()
    .transform((raw) => raw.toLowerCase())
    .refine((raw) => raw === "on" || raw === "off", { error: "erlaubt sind on und off" })
    .transform((raw) => (raw === "on" ? "on" : "off"))
    .default("off"),

  BB_MCP_MAX_RESPONSE_TOKENS: integerVar({
    // Unter 100 Token bliebe von keiner Antwort etwas übrig; über 20.000 greift ohnehin die
    // harte Grenze aus 7.6.
    min: 100,
    max: 20_000,
    hint: "muss zwischen 100 und 20000 liegen; ab 20000 greift die harte Grenze aus dem Plan",
  }).default(5_000),

  BB_MCP_CACHE_TTL_MS: integerVar({
    min: 0,
    max: 2_147_483_647,
    hint: "muss 0 oder größer sein; 0 schaltet den Stammdatenspeicher ab",
  }).default(0),

  BB_MCP_UPLOAD_DIRS: z
    .string()
    .transform((raw) =>
      raw
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
    )
    .superRefine((entries, ctx) => {
      for (const entry of entries) {
        if (entry.startsWith("~")) {
          ctx.addIssue({
            code: "custom",
            message: `"${entry}" beginnt mit ~; die Tilde wird nicht aufgelöst, bitte den vollständigen Pfad angeben`,
          });
        } else if (!path.isAbsolute(entry)) {
          ctx.addIssue({
            code: "custom",
            message: `"${entry}" ist kein absoluter Pfad`,
          });
        }
      }
    })
    .transform((entries) => entries.map((entry) => path.resolve(entry)))
    .default([]),

  BB_MCP_UPLOAD_FROM_URL: booleanVar().default(false),

  BB_MCP_LOG_LEVEL: z
    .string()
    .trim()
    .transform((raw) => raw.toLowerCase())
    .refine((raw) => (LOG_LEVELS as readonly string[]).includes(raw), {
      error: `erlaubt sind ${LOG_LEVELS.join(", ")}`,
    })
    .transform((raw) => raw as LogLevel)
    .default("warn"),
});

export type EnvValues = z.infer<typeof envSchema>;

/**
 * Die Vorgabe des Nur-Lesen-Schalters. Sie steht nicht im Schema, weil `resolve.ts` sonst
 * nicht mehr erkennen könnte, ob der Schalter überhaupt gesetzt war (6.1). Die zweite
 * Ausnahme, die Vorgabe von `BB_CONFIG_DIR`, liefert {@link defaultConfigDir}.
 */
export const ENV_DEFAULTS = Object.freeze({
  BB_MCP_READ_ONLY: false,
});

/** Alle Namen, die dieser Server kennt. Grundlage der Warnung aus 6.4 Punkt 2. */
export const KNOWN_ENV_VARS: readonly string[] = Object.freeze(Object.keys(envSchema.shape));

// --- Auswertung ----------------------------------------------------------------------

export interface ParsedEnv {
  readonly values: EnvValues;
  /** Namen, die gesetzt, aber leer waren. Sie gelten als nicht gesetzt. */
  readonly emptyVars: readonly string[];
}

function formatIssues(error: z.ZodError): string {
  const lines: string[] = [];
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "?");
    lines.push(`  ${name}: ${issue.message}`);
  }
  return lines.join("\n");
}

/**
 * Prüft alle bekannten Variablen gegen das Schema und setzt die Vorgaben ein.
 *
 * Eine gesetzte, aber leere Variable gilt als **nicht gesetzt**: Viele Clientkonfigurationen
 * schreiben jeden Schlüssel mit, auch ohne Wert, und ein Abbruch dafür wäre nicht zu
 * erklären. Der Fall wird stattdessen als Warnung zurückgegeben.
 *
 * @throws ConfigError bei jedem unbrauchbaren Wert (6.4 Punkt 3).
 */
export function parseEnv(env: NodeJS.ProcessEnv): ParsedEnv {
  const input: Record<string, string> = {};
  const emptyVars: string[] = [];

  for (const name of KNOWN_ENV_VARS) {
    const raw = env[name];
    if (raw === undefined) {
      continue;
    }
    if (raw.trim() === "") {
      emptyVars.push(name);
      continue;
    }
    input[name] = raw;
  }

  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(
      "invalid-env",
      [
        "Abbruch: Mindestens ein Konfigurationswert ist unbrauchbar.",
        formatIssues(result.error),
        "Der Server ist nicht gestartet. Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.",
        "Ein falsch geschriebener Grenzwert wird nicht stillschweigend durch die Vorgabe ersetzt, weil er sonst unbemerkt eine Schutzschicht abschaltet.",
      ].join("\n"),
    );
  }

  return { values: result.data, emptyVars };
}

// --- Unbekannte Variablen ------------------------------------------------------------

/** Levenshtein-Abstand, iterativ mit einer Zeile. */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }

  return previous[b.length] ?? 0;
}

/** Der bekannte Name mit dem kleinsten Abstand. Bei Gleichstand gewinnt der frühere Name. */
export function nearestKnownVar(name: string): string {
  let best = KNOWN_ENV_VARS[0] ?? "";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of KNOWN_ENV_VARS) {
    const distance = levenshtein(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Alle gesetzten `BB_*`-Variablen, die dieser Server nicht kennt (6.4 Punkt 2). */
export function findUnknownBbVars(env: NodeJS.ProcessEnv): readonly string[] {
  return Object.keys(env)
    .filter((name) => name.startsWith("BB_") && !KNOWN_ENV_VARS.includes(name))
    .sort();
}

// --- Ablageort der Zugangsdatendatei -------------------------------------------------

/**
 * Vorgabe für `BB_CONFIG_DIR` (6.2): unter Windows `%APPDATA%`, sonst
 * `${XDG_CONFIG_HOME:-~/.config}`. Der Verzeichnisname trägt bewusst keinen Namensraum
 * (`distribution.md` 13.2).
 */
export function defaultConfigDir(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homeDir: string,
): string {
  if (platform === "win32") {
    const appData = env.APPDATA;
    const base =
      appData !== undefined && appData.trim() !== ""
        ? appData
        : path.join(homeDir, "AppData", "Roaming");
    return path.join(base, CONFIG_DIR_NAME);
  }

  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg !== undefined && xdg.trim() !== "" ? xdg : path.join(homeDir, ".config");
  return path.join(base, CONFIG_DIR_NAME);
}
