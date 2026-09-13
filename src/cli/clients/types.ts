/**
 * Was ein Clientadapter können muss (Plan 8.3, 2 Dateibaum).
 *
 * Hier steht der Vertrag, die Wirtsumgebung und der gemeinsame Bauplan der JSON-Adapter.
 * Die **Liste** der Adapter steht dagegen in `src/cli/run.ts`: Diese Datei darf keinen
 * Adapter laden, weil jeder Adapter sie lädt; eine Liste hier ergäbe einen Ringschluss.
 *
 * Zwei Festlegungen tragen alles Weitere:
 *
 * 1. **Ein Adapter rechnet, er schreibt nicht von sich aus auf das Terminal.** Er gibt
 *    {@link ClientPreview} und {@link WriteOutcome} zurück; ausgegeben wird im Unterbefehl.
 *    Damit ist jeder Adapter ohne Terminal prüfbar.
 * 2. **Jeder Dateizugriff läuft über {@link ClientHost}.** `writeText` legt vor jeder
 *    Änderung an einer bestehenden Datei eine Sicherung an und nennt deren Pfad. Die Zusage
 *    aus 8.2 Schritt 7 hängt damit an einer Stelle und nicht an zehn Adaptern.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PACKAGE_NAME } from "../../generated/version.js";
import type { CredentialVarName } from "../../config/env.js";

/** Der Name, unter dem dieser Server in jeder Clientkonfiguration steht. */
export const SERVER_NAME = "buchhaltungsbutler";

/** Das Paket, das `npx` lädt. Genau der Name aus der `package.json`. */
export const PACKAGE_SPEC = PACKAGE_NAME;

/** Der Binärname des Pakets (Plan 13.7). */
export const BINARY_NAME = "bbutler-mcp";

/** Die zwölf Clientkürzel aus Plan 8.1, in der Reihenfolge des Plans. */
export const CLIENT_KEYS = [
  "claude-code",
  "claude-desktop",
  "codex",
  "grok",
  "vscode",
  "cursor",
  "windsurf",
  "lmstudio",
  "cline",
  "zed",
  "continue",
  "jan",
] as const;

export type ClientKey = (typeof CLIENT_KEYS)[number];

/** `true`, wenn die Zeichenkette eines der zwölf Kürzel ist. */
export function isClientKey(value: string): value is ClientKey {
  return (CLIENT_KEYS as readonly string[]).includes(value);
}

export type ConfigScope = "user" | "project";

/** Die beiden Startvarianten aus Plan 8.2 Schritt 5. */
export type StartVariant = "npx" | "global";

/** Befehl und Argumente, mit denen der Client diesen Server startet. */
export interface ServerLaunch {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Wie die Zugangsdaten in den Eintrag kommen (Plan 8.2 Schritt 6).
 *
 * - `none`: Der Eintrag enthält keine Zugangsdaten. Der Server liest sie aus der
 *   Zugangsdatendatei. Das ist die Vorgabe und die Empfehlung.
 * - `values`: Die Werte stehen im Eintrag. Für die Vorschau und für `print-config` werden
 *   hier **Platzhalter** übergeben; den Unterschied entscheidet der Aufrufer, nicht der
 *   Adapter. So kann kein Adapter versehentlich ein Geheimnis anzeigen.
 * - `reference`: Der Eintrag verweist auf Umgebungsvariablen, in der Schreibweise des
 *   jeweiligen Clients. Kennt der Client keine Ersetzung, bleibt der Eintrag leer und der
 *   Adapter sagt das in seiner Anmerkung.
 */
export type CredentialPlacement =
  | { readonly mode: "none" }
  | { readonly mode: "values"; readonly values: Readonly<Record<CredentialVarName, string>> }
  | { readonly mode: "reference" };

/** Die Platzhalter, die an die Stelle der drei Werte treten. Niemals ein echter Wert. */
export const CREDENTIAL_PLACEHOLDERS: Readonly<Record<CredentialVarName, string>> = Object.freeze({
  BB_API_CLIENT: "PLATZHALTER_API_CLIENT",
  BB_API_SECRET: "PLATZHALTER_API_SECRET",
  BB_API_KEY: "PLATZHALTER_API_KEY",
});

/** Eine Belegung mit Platzhaltern, für Vorschau und `print-config`. */
export function placeholderCredentials(): CredentialPlacement {
  return { mode: "values", values: CREDENTIAL_PLACEHOLDERS };
}

/** Alles, was ein Adapter braucht, um einen Eintrag zu bauen. */
export interface ClientPlan {
  readonly serverName: string;
  readonly launch: ServerLaunch;
  readonly scope: ConfigScope;
  readonly credentials: CredentialPlacement;
  /** Weitere Variablen des Eintrags, niemals geheim: `BB_MCP_READ_ONLY`, `BB_PROFILE`. */
  readonly extraEnv: Readonly<Record<string, string>>;
  /** `true` erlaubt, einen bestehenden Eintrag zu ersetzen (Plan 8.2 Schritt 7). */
  readonly allowOverwrite: boolean;
}

export interface ClientPlanOptions {
  readonly launch: ServerLaunch;
  readonly scope?: ConfigScope;
  readonly credentials?: CredentialPlacement;
  readonly extraEnv?: Readonly<Record<string, string>>;
  readonly allowOverwrite?: boolean;
}

/** Ein Plan mit den Vorgaben: Benutzerebene, keine Zugangsdaten im Eintrag, kein Ersetzen. */
export function buildPlan(options: ClientPlanOptions): ClientPlan {
  return {
    serverName: SERVER_NAME,
    launch: options.launch,
    scope: options.scope ?? "user",
    credentials: options.credentials ?? { mode: "none" },
    extraEnv: options.extraEnv ?? {},
    allowOverwrite: options.allowOverwrite ?? false,
  };
}

/** Der Startbefehl für die gewählte Variante. */
export function serverLaunch(variant: StartVariant, binaryPath: string | null): ServerLaunch {
  if (variant === "global") {
    // Der absolute Pfad, nicht der bloße Name: Desktop-Anwendungen starten nicht aus einer
    // Login-Shell und haben deshalb oft ein anderes PATH (Plan 8.2 Schritt 5).
    return { command: binaryPath ?? BINARY_NAME, args: [] };
  }
  return { command: "npx", args: ["-y", PACKAGE_SPEC] };
}

export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Grund, wenn der Prozess gar nicht startete; sonst `null`. */
  readonly failure: string | null;
}

export interface WriteTextResult {
  /** Pfad der angelegten Sicherung; `null`, wenn die Datei neu entstanden ist. */
  readonly backupPath: string | null;
}

/**
 * Die Umgebung, in der ein Adapter arbeitet. Alles, was den Rechner berührt, steht hier
 * und nirgendwo sonst — deshalb braucht ein Einheitstest weder Dateisystem noch Unterprozess.
 */
export interface ClientHost {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly cwd: string;
  /** Zeitpunkt für den Namen der Sicherung. */
  now(): Date;
  exists(target: string): boolean;
  /** Der Inhalt, oder `null`, wenn es die Datei nicht gibt. */
  readText(target: string): string | null;
  /**
   * Schreibt die Datei. Existiert sie, entsteht vorher `<datei>.bak-<zeitstempel>`, und der
   * Pfad der Sicherung steht im Ergebnis (Plan 8.2 Schritt 7).
   */
  writeText(target: string, content: string): WriteTextResult;
  /** Der absolute Pfad eines Programms im Suchpfad, oder `null`. */
  which(command: string): string | null;
  run(command: string, args: readonly string[]): CommandResult;
}

/** Zeitstempel der Sicherung: sortierbar, ohne Zeichen, die ein Dateisystem stören. */
export function backupSuffix(when: Date): string {
  return when.toISOString().replace(/[:.]/g, "-");
}

export interface CreateClientHostOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly cwd?: string;
}

/** Die echte Wirtsumgebung. Im Betrieb die einzige; Tests geben eine eigene mit. */
export function createClientHost(options: CreateClientHostOptions = {}): ClientHost {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  return {
    env,
    platform,
    homeDir: options.homeDir ?? os.homedir(),
    cwd: options.cwd ?? process.cwd(),
    now: () => new Date(),
    exists: (target) => fs.existsSync(target),
    readText: (target) => {
      try {
        return fs.readFileSync(target, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    writeText: (target, content) => {
      let backupPath: string | null = null;
      if (fs.existsSync(target)) {
        backupPath = `${target}.bak-${backupSuffix(new Date())}`;
        fs.copyFileSync(target, backupPath);
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
      }
      fs.writeFileSync(target, content, "utf8");
      return { backupPath };
    },
    which: (command) => {
      // Kein `which`-Unterprozess: Der Suchpfad wird selbst durchgegangen. Das ist auf allen
      // drei Plattformen dasselbe Verfahren und braucht keine fremde Shell.
      const pathValue = env.PATH ?? env.Path ?? "";
      const separator = platform === "win32" ? ";" : ":";
      const extensions =
        platform === "win32" ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
      for (const directory of pathValue.split(separator)) {
        if (directory === "") {
          continue;
        }
        for (const extension of extensions) {
          const candidate = path.join(directory, `${command}${extension}`);
          try {
            const stats = fs.statSync(candidate);
            if (stats.isFile()) {
              return candidate;
            }
          } catch {
            // Nicht vorhanden oder nicht lesbar: der nächste Kandidat.
          }
        }
      }
      return null;
    },
    run: (command, args) => {
      // Unter Windows sind die CLIs der Clients Stapeldateien; `spawnSync` führt sie nur über
      // die Shell aus, und erst seit Node 20.12 maskiert Node deren Argumente selbst.
      // **Nicht verifiziert**: Für diese Arbeit stand kein Windows zur Verfügung.
      const result = spawnSync(command, [...args], {
        encoding: "utf8",
        shell: platform === "win32",
      });
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        failure: result.error === undefined ? null : result.error.message,
      };
    },
  };
}

export type ConfigFormat = "json" | "toml" | "yaml" | "text";

/** Der fertige Block samt Ort. Schreibt nichts und enthält kein Geheimnis. */
export interface ClientPreview {
  /** Der Pfad, in den der Block gehört; `null`, wenn es keinen dokumentierten Pfad gibt. */
  readonly path: string | null;
  /** Wo der Block einzufügen ist, in Worten. Immer gesetzt. */
  readonly pathNote: string;
  readonly format: ConfigFormat;
  readonly block: string;
  /** Vorbehalte: unverifizierter Pfad, fehlende Variablenersetzung, Kommentare im Format. */
  readonly notes: readonly string[];
}

/** Das Ergebnis eines Schreib- oder Entfernversuchs. */
export type WriteOutcome =
  | {
      readonly kind: "written";
      readonly path: string | null;
      readonly backupPath: string | null;
      readonly detail: string;
    }
  | { readonly kind: "removed"; readonly path: string | null; readonly backupPath: string | null }
  | { readonly kind: "unchanged"; readonly reason: string }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "failed"; readonly reason: string };

export interface ClientDetection {
  readonly found: boolean;
  /** Woran es erkannt wurde, für die Ausgabe von `setup` und `doctor`. */
  readonly how: string;
  /** Der gefundene Konfigurationspfad, falls es einen gibt. */
  readonly path: string | null;
}

export interface ClientAdapter {
  readonly key: ClientKey;
  readonly label: string;
  /** Der Weg in einem Halbsatz, wie in der Tabelle aus 8.3. */
  readonly way: string;
  /** `false` bei den Einträgen, die nur ausgegeben werden (Zed, Continue, Jan). */
  readonly automatic: boolean;
  readonly scopes: readonly ConfigScope[];
  /** `true`, wenn dieser Weg Zugangsdaten sicher in den Eintrag schreiben kann. */
  readonly inlineSecrets: boolean;
  /** Die Schreibweise einer Variablenreferenz dieses Clients, oder `null`. */
  envReference(name: string): string | null;
  detect(host: ClientHost): ClientDetection;
  preview(plan: ClientPlan, host: ClientHost): ClientPreview;
  apply(plan: ClientPlan, host: ClientHost): WriteOutcome;
  remove(plan: ClientPlan, host: ClientHost): WriteOutcome;
  /** Was nach dem Schreiben zu tun ist, damit die Änderung wirkt (Plan 8.2 Schritt 8). */
  readonly finishNote: string;
  /** Die Prüfzeile des Clients, falls es eine gibt. */
  readonly verifyCommand: string | null;
}

// --- Gemeinsame Bausteine der Adapter -------------------------------------------------

/**
 * Die Umgebungsvariablen des Eintrags.
 *
 * Die Reihenfolge ist fest: zuerst die drei Zugangsdaten, dann die übrigen. Das hält die
 * erzeugten Blöcke über Läufe hinweg vergleichbar.
 */
export function entryEnv(
  plan: ClientPlan,
  adapter: Pick<ClientAdapter, "envReference" | "inlineSecrets">,
): { readonly env: Record<string, string>; readonly notes: readonly string[] } {
  const env: Record<string, string> = {};
  const notes: string[] = [];

  if (plan.credentials.mode === "values") {
    if (adapter.inlineSecrets) {
      for (const [name, value] of Object.entries(plan.credentials.values)) {
        env[name] = value;
      }
    } else {
      notes.push(
        "Dieser Weg schreibt keine Zugangsdaten in den Eintrag: Er ruft die Kommandozeile des " +
          "Clients als Unterprozess auf, und Argumente eines Prozesses sind für andere Prozesse " +
          "desselben Benutzers lesbar. Die Werte gehören in die Zugangsdatendatei.",
      );
    }
  } else if (plan.credentials.mode === "reference") {
    const references = (["BB_API_CLIENT", "BB_API_SECRET", "BB_API_KEY"] as const).map(
      (name) => [name, adapter.envReference(name)] as const,
    );
    if (references.every(([, reference]) => reference !== null)) {
      for (const [name, reference] of references) {
        env[name] = reference ?? "";
      }
    } else {
      notes.push(
        "Dieser Client kennt keine Variablenersetzung in der Konfiguration. Die drei Werte " +
          "müssen in der Umgebung stehen, in der der Client startet, oder in der " +
          "Zugangsdatendatei.",
      );
    }
  }

  for (const [name, value] of Object.entries(plan.extraEnv)) {
    env[name] = value;
  }
  return { env, notes };
}

/** Ein JSON-Block mit zwei Leerzeichen Einzug und abschließendem Zeilenumbruch. */
export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface JsonFileAdapterSpec {
  readonly key: ClientKey;
  readonly label: string;
  readonly way: string;
  /** `mcpServers`, `servers` oder `context_servers`. Der häufigste Kopierfehler. */
  readonly wrapperKey: string;
  /** `"type": "stdio"` mitschreiben. */
  readonly includeType: boolean;
  /** Weitere Felder des Eintrags, etwa `disabled` und `autoApprove` bei Cline. */
  readonly extraEntryFields?: Readonly<Record<string, unknown>>;
  readonly inlineSecrets: boolean;
  readonly envReference: ((name: string) => string) | null;
  readonly scopes: readonly ConfigScope[];
  /** Der Pfad je Ebene. `null`, wenn es für diese Plattform keinen belegten Pfad gibt. */
  resolvePath(host: ClientHost, scope: ConfigScope): string | null;
  /** Wie die Datei zu erreichen ist, wenn der Pfad fehlt oder die Datei nicht existiert. */
  readonly reachHint: string;
  /** Vorbehalte, die immer mitgehen: unverifizierter Pfad und Ähnliches. */
  readonly standingNotes?: readonly string[];
  /**
   * Die Ebenen, in denen die Datei angelegt werden darf. Vorgesehen ist ausschließlich
   * `project`: Der Ort einer Projektdatei ist durch die Konvention im aktuellen Verzeichnis
   * festgelegt und nicht geraten. Für Dateien im Benutzerprofil bleibt es bei der Regel aus
   * 8.3, dass nur ausgegeben wird, solange die Datei fehlt.
   */
  readonly createInScopes?: readonly ConfigScope[];
  readonly finishNote: string;
  readonly verifyCommand?: string | null;
  readonly detectExtra?: (host: ClientHost) => ClientDetection | null;
}

/**
 * Der gemeinsame Bauplan der sechs Adapter, die reines JSON schreiben.
 *
 * Reines JSON ist verlustfrei änderbar, deshalb wird hier geschrieben und nicht nur
 * ausgegeben (Plan 8.3). Die Datei wird vollständig neu formatiert; das ist der Preis und
 * der Grund, warum Zed mit seinem JSONC ausdrücklich **nicht** so behandelt wird.
 */
function mayCreate(spec: JsonFileAdapterSpec, scope: ConfigScope): boolean {
  return (spec.createInScopes ?? []).includes(scope);
}

export function createJsonFileAdapter(spec: JsonFileAdapterSpec): ClientAdapter {
  const envReference = (name: string): string | null => spec.envReference?.(name) ?? null;

  const buildEntry = (plan: ClientPlan): { entry: Record<string, unknown>; notes: string[] } => {
    const { env, notes } = entryEnv(plan, { envReference, inlineSecrets: spec.inlineSecrets });
    const entry: Record<string, unknown> = {};
    if (spec.includeType) {
      entry.type = "stdio";
    }
    entry.command = plan.launch.command;
    entry.args = [...plan.launch.args];
    if (Object.keys(env).length > 0) {
      entry.env = env;
    }
    for (const [name, value] of Object.entries(spec.extraEntryFields ?? {})) {
      entry[name] = value;
    }
    return { entry, notes: [...notes] };
  };

  const readDocument = (
    host: ClientHost,
    target: string,
  ): { document: Record<string, unknown> } | { error: string } => {
    const text = host.readText(target);
    if (text === null || text.trim() === "") {
      return { document: {} };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return {
        error:
          `${target} ist kein gültiges JSON (${(error as Error).message}). ` +
          "Es wurde nichts geändert; die Datei muss erst von Hand in Ordnung gebracht werden.",
      };
    }
    if (!isRecord(parsed)) {
      return { error: `${target} enthält kein JSON-Objekt. Es wurde nichts geändert.` };
    }
    return { document: parsed };
  };

  return {
    key: spec.key,
    label: spec.label,
    way: spec.way,
    automatic: true,
    scopes: spec.scopes,
    inlineSecrets: spec.inlineSecrets,
    envReference,
    finishNote: spec.finishNote,
    verifyCommand: spec.verifyCommand ?? null,

    detect(host) {
      const extra = spec.detectExtra?.(host);
      if (extra !== null && extra !== undefined) {
        return extra;
      }
      for (const scope of spec.scopes) {
        const target = spec.resolvePath(host, scope);
        if (target !== null && host.exists(target)) {
          return { found: true, how: `Konfigurationsdatei gefunden: ${target}`, path: target };
        }
      }
      const first = spec.resolvePath(host, spec.scopes[0] ?? "user");
      return {
        found: false,
        how:
          first === null
            ? "kein belegter Konfigurationspfad für diese Plattform"
            : `keine Konfigurationsdatei unter ${first}`,
        path: first,
      };
    },

    preview(plan, host) {
      const target = spec.resolvePath(host, plan.scope);
      const { entry, notes } = buildEntry(plan);
      if (spec.standingNotes !== undefined) {
        notes.push(...spec.standingNotes);
      }
      if (target === null) {
        notes.push(spec.reachHint);
      } else if (!host.exists(target)) {
        notes.push(
          mayCreate(spec, plan.scope)
            ? `${target} existiert noch nicht und wird angelegt.`
            : `${target} existiert nicht. Der Block wird deshalb nur ausgegeben. ${spec.reachHint}`,
        );
      }
      return {
        path: target,
        pathNote:
          target === null
            ? spec.reachHint
            : `Der Block gehört in ${target}, in das Objekt "${spec.wrapperKey}".`,
        format: "json",
        block: renderJson({ [spec.wrapperKey]: { [plan.serverName]: entry } }),
        notes,
      };
    },

    apply(plan, host) {
      const target = spec.resolvePath(host, plan.scope);
      if (target === null) {
        return {
          kind: "manual",
          reason: `Für ${spec.label} gibt es auf dieser Plattform keinen belegten Konfigurationspfad. ${spec.reachHint}`,
        };
      }
      if (!host.exists(target) && !mayCreate(spec, plan.scope)) {
        // 8.3: Jeder Adapter prüft vor dem Schreiben, ob die Datei existiert, und gibt sonst
        // nur aus. Eine Datei im Benutzerprofil anzulegen, deren Ort nicht gemessen ist,
        // wäre genau das Raten, das der Plan ausschließt.
        return {
          kind: "manual",
          reason:
            `${target} existiert nicht. ${spec.reachHint} ` +
            `Danach "${BINARY_NAME} setup" erneut ausführen.`,
        };
      }

      const read = readDocument(host, target);
      if ("error" in read) {
        return { kind: "failed", reason: read.error };
      }
      const document = read.document;
      const container = isRecord(document[spec.wrapperKey])
        ? { ...(document[spec.wrapperKey] as Record<string, unknown>) }
        : {};
      const existed = container[plan.serverName] !== undefined;
      if (existed && !plan.allowOverwrite) {
        return {
          kind: "unchanged",
          reason:
            `${target} führt bereits einen Eintrag "${plan.serverName}". Er wurde nicht ` +
            "angetastet. Mit --overwrite wird er ersetzt.",
        };
      }

      const { entry } = buildEntry(plan);
      container[plan.serverName] = entry;
      const next = { ...document, [spec.wrapperKey]: container };
      let written: WriteTextResult;
      try {
        written = host.writeText(target, renderJson(next));
      } catch (error) {
        return {
          kind: "failed",
          reason: `${target} ließ sich nicht schreiben: ${(error as Error).message}`,
        };
      }
      return {
        kind: "written",
        path: target,
        backupPath: written.backupPath,
        detail: existed
          ? `Der bestehende Eintrag "${plan.serverName}" wurde ersetzt.`
          : `Der Eintrag "${plan.serverName}" wurde hinzugefügt.`,
      };
    },

    remove(plan, host) {
      const target = spec.resolvePath(host, plan.scope);
      if (target === null || !host.exists(target)) {
        return {
          kind: "unchanged",
          reason:
            target === null
              ? `Für ${spec.label} gibt es auf dieser Plattform keinen belegten Konfigurationspfad.`
              : `${target} existiert nicht; es war nichts zu entfernen.`,
        };
      }
      const read = readDocument(host, target);
      if ("error" in read) {
        return { kind: "failed", reason: read.error };
      }
      const document = read.document;
      const raw = document[spec.wrapperKey];
      if (!isRecord(raw) || raw[plan.serverName] === undefined) {
        return {
          kind: "unchanged",
          reason: `${target} führt keinen Eintrag "${plan.serverName}"; es war nichts zu entfernen.`,
        };
      }
      const container = { ...raw };
      delete container[plan.serverName];
      let written: WriteTextResult;
      try {
        written = host.writeText(target, renderJson({ ...document, [spec.wrapperKey]: container }));
      } catch (error) {
        return {
          kind: "failed",
          reason: `${target} ließ sich nicht schreiben: ${(error as Error).message}`,
        };
      }
      return { kind: "removed", path: target, backupPath: written.backupPath };
    },
  };
}

/** Der Pfad einer Datei im Heimatverzeichnis, plattformunabhängig zusammengesetzt. */
export function homePath(host: ClientHost, ...parts: readonly string[]): string {
  return path.join(host.homeDir, ...parts);
}

/** Der Pfad einer Projektdatei im aktuellen Verzeichnis. */
export function projectPath(host: ClientHost, ...parts: readonly string[]): string {
  return path.join(host.cwd, ...parts);
}
