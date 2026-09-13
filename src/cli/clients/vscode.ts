/**
 * Visual Studio Code mit GitHub Copilot (Plan 8.3).
 *
 * Zwei Wege, je Ebene einer:
 *
 * - **Benutzerprofil**: `code --add-mcp "<json>"`. Der Pfad der Profildatei hängt vom aktiven
 *   Profil ab und ist nicht als fester Pfad dokumentiert; ihn zu raten wäre eine Erfindung
 *   (`distribution.md` 9.1). Also die Kommandozeile.
 * - **Arbeitsbereich**: `.vscode/mcp.json`. Nur dieser Weg kann `inputs` tragen, und nur
 *   dieser Weg kommt ohne Klartext-Zugangsdaten aus.
 *
 * **Der Wrapper-Schlüssel heißt `servers`, nicht `mcpServers`** — der häufigste Kopierfehler
 * zwischen VS Code und allen übrigen Clients (`distribution.md` 9.2).
 *
 * **Zugangsdaten werden nie als Wert geschrieben.** Verlangt der Plan sie im Eintrag, entsteht
 * stattdessen der von VS Code vorgesehene `inputs`-Block mit `password: true`: VS Code fragt
 * beim ersten Start und legt die Werte danach selbst sicher ab. Die Datei bleibt damit
 * einscheckbar. Einschränkung aus derselben Quelle: Auf dem Agent Host werden Server mit
 * `${input:...}` nicht weitergereicht.
 */

import path from "node:path";

import { CREDENTIAL_VARS } from "../../config/env.js";
import {
  existingEntryReason,
  legacyEntryNames,
  LEGACY_ENTRY_NOTE,
  LEGACY_SERVER_NAMES,
  removableEntryNames,
  renderJson,
  writtenDetail,
  type ClientAdapter,
  type ClientHost,
  type ClientPlan,
  type ClientPreview,
  type WriteOutcome,
} from "./types.js";

const WRAPPER_KEY = "servers";

/** Die Kennung einer Eingabe, aus dem Variablennamen abgeleitet: `BB_API_KEY` → `bb-api-key`. */
function inputId(name: string): string {
  return name.toLowerCase().replace(/_/g, "-");
}

const INPUT_LABELS: Readonly<Record<string, string>> = {
  BB_API_CLIENT: "BuchhaltungsButler API Client",
  BB_API_SECRET: "BuchhaltungsButler API Secret",
  BB_API_KEY: "BuchhaltungsButler API Key, er wählt den Mandanten",
};

export function vscodeProjectFile(host: ClientHost): string {
  return path.join(host.cwd, ".vscode", "mcp.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Die Kennung einer `inputs`-Eintragung, tolerant gegenüber fremdem Inhalt der Datei. */
function idOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface BuiltEntry {
  readonly entry: Record<string, unknown>;
  readonly inputs: readonly Record<string, unknown>[];
  readonly notes: readonly string[];
}

function buildEntry(plan: ClientPlan, withInputs: boolean): BuiltEntry {
  const env: Record<string, string> = {};
  const inputs: Record<string, unknown>[] = [];
  const notes: string[] = [];

  if (plan.credentials.mode !== "none") {
    if (withInputs) {
      for (const name of CREDENTIAL_VARS) {
        env[name] = `\${input:${inputId(name)}}`;
        inputs.push({
          type: "promptString",
          id: inputId(name),
          description: INPUT_LABELS[name] ?? name,
          password: true,
        });
      }
      notes.push(
        "Die drei Werte stehen nicht in der Datei: VS Code fragt sie beim ersten Start ab " +
          "(`inputs` mit password: true) und legt sie danach selbst ab. Auf dem Agent Host " +
          "werden Server mit ${input:...} nicht weitergereicht.",
      );
    } else {
      notes.push(
        "Die Ebene Benutzerprofil wird über die Kommandozeile eingetragen und kann keine " +
          "Zugangsdaten aufnehmen: Argumente eines Prozesses sind für andere Prozesse lesbar. " +
          "Für Zugangsdaten im Eintrag die Ebene Arbeitsbereich wählen; sonst bleibt die " +
          "Zugangsdatendatei.",
      );
    }
  }
  for (const [name, value] of Object.entries(plan.extraEnv)) {
    env[name] = value;
  }

  const entry: Record<string, unknown> = {
    type: "stdio",
    command: plan.launch.command,
    args: [...plan.launch.args],
  };
  if (Object.keys(env).length > 0) {
    entry.env = env;
  }
  return { entry, inputs, notes };
}

function renderBlock(plan: ClientPlan, built: BuiltEntry): string {
  const document: Record<string, unknown> = {
    [WRAPPER_KEY]: { [plan.serverName]: built.entry },
  };
  if (built.inputs.length > 0) {
    document.inputs = built.inputs;
  }
  return renderJson(document);
}

export const vscodeAdapter: ClientAdapter = {
  key: "vscode",
  label: "Visual Studio Code mit GitHub Copilot",
  way: "code --add-mcp, oder .vscode/mcp.json, wenn inputs gebraucht wird",
  automatic: true,
  scopes: ["user", "project"],
  inlineSecrets: true,
  // VS Code kennt für Geheimnisse `inputs`, keine Ersetzung aus der Umgebung.
  envReference: () => null,
  finishNote:
    "VS Code startet den Server nicht von selbst: In der Befehlspalette MCP: List Servers " +
    "öffnen und den Server starten. Vor dem ersten Start eines Arbeitsbereichsservers fragt " +
    "VS Code nach Vertrauen.",
  verifyCommand: null,

  detect(host) {
    const binary = host.which("code");
    const projectFile = vscodeProjectFile(host);
    if (host.exists(projectFile)) {
      return {
        found: true,
        how: `Arbeitsbereichsdatei gefunden: ${projectFile}`,
        path: projectFile,
      };
    }
    if (binary !== null) {
      return { found: true, how: `code gefunden: ${binary}`, path: null };
    }
    return { found: false, how: "code nicht im Suchpfad", path: null };
  },

  preview(plan, host): ClientPreview {
    const project = plan.scope === "project";
    const built = buildEntry(plan, project);
    if (project) {
      const target = vscodeProjectFile(host);
      return {
        path: target,
        pathNote: `Der Block gehört in ${target}, in das Objekt "${WRAPPER_KEY}".`,
        format: "json",
        block: renderBlock(plan, built),
        notes: [
          ...built.notes,
          ...(host.exists(target) ? [] : [`${target} existiert noch nicht und wird angelegt.`]),
        ],
      };
    }
    const payload = JSON.stringify({
      name: plan.serverName,
      command: plan.launch.command,
      args: [...plan.launch.args],
      ...(built.entry.env === undefined ? {} : { env: built.entry.env }),
    });
    return {
      path: null,
      pathNote:
        'Wird mit "code --add-mcp" in das aktive Benutzerprofil eingetragen. Der Pfad der ' +
        "Profildatei hängt vom Profil ab und ist nicht dokumentiert; der dokumentierte Zugang " +
        "ist der Befehl MCP: Open User Configuration.",
      format: "json",
      block: renderBlock(plan, built),
      notes: [...built.notes, `Aufruf: code --add-mcp '${payload}'`, LEGACY_ENTRY_NOTE],
    };
  },

  apply(plan, host): WriteOutcome {
    if (plan.scope === "project") {
      const target = vscodeProjectFile(host);
      const text = host.readText(target);
      let document: Record<string, unknown> = {};
      if (text !== null && text.trim() !== "") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          return {
            kind: "failed",
            reason:
              `${target} ist kein gültiges JSON (${(error as Error).message}). ` +
              "Es wurde nichts geändert.",
          };
        }
        if (!isRecord(parsed)) {
          return { kind: "failed", reason: `${target} enthält kein JSON-Objekt.` };
        }
        document = parsed;
      }
      const wrapper = document[WRAPPER_KEY];
      const container: Record<string, unknown> = isRecord(wrapper) ? { ...wrapper } : {};
      const existed = container[plan.serverName] !== undefined;
      const legacy = legacyEntryNames(container);
      if ((existed || legacy.length > 0) && !plan.allowOverwrite) {
        return {
          kind: "unchanged",
          reason: existingEntryReason(target, plan.serverName, existed ? [] : legacy),
        };
      }
      const built = buildEntry(plan, true);
      for (const name of legacy) {
        delete container[name];
      }
      container[plan.serverName] = built.entry;
      const next: Record<string, unknown> = { ...document, [WRAPPER_KEY]: container };
      if (built.inputs.length > 0) {
        const existingInputs: unknown[] = Array.isArray(document.inputs)
          ? [...(document.inputs as readonly unknown[])]
          : [];
        const knownIds = new Set(existingInputs.filter(isRecord).map((input) => idOf(input.id)));
        next.inputs = [
          ...existingInputs,
          ...built.inputs.filter((input) => !knownIds.has(idOf(input.id))),
        ];
      }
      try {
        const written = host.writeText(target, renderJson(next));
        return {
          kind: "written",
          path: target,
          backupPath: written.backupPath,
          detail: writtenDetail(plan.serverName, existed, legacy),
        };
      } catch (error) {
        return {
          kind: "failed",
          reason: `${target} ließ sich nicht schreiben: ${(error as Error).message}`,
        };
      }
    }

    if (host.which("code") === null) {
      return {
        kind: "manual",
        reason:
          "code ist nicht im Suchpfad. In VS Code den Befehl \"Shell Command: Install 'code' " +
          'command in PATH" ausführen, oder den Block über MCP: Open User Configuration ' +
          "einfügen.",
      };
    }
    const built = buildEntry(plan, false);
    const payload = JSON.stringify({
      name: plan.serverName,
      command: plan.launch.command,
      args: [...plan.launch.args],
      ...(built.entry.env === undefined ? {} : { env: built.entry.env }),
    });
    const result = host.run("code", ["--add-mcp", payload]);
    if (result.failure !== null) {
      return { kind: "failed", reason: `code ließ sich nicht starten: ${result.failure}` };
    }
    if (result.status !== 0) {
      return {
        kind: "failed",
        reason:
          `code --add-mcp endete mit Rückgabewert ${String(result.status)}. ` +
          `Ausgabe: ${(result.stderr || result.stdout).trim()}`,
      };
    }
    return {
      kind: "written",
      path: null,
      backupPath: null,
      detail: "code --add-mcp hat den Eintrag in das aktive Benutzerprofil geschrieben.",
    };
  },

  remove(plan, host): WriteOutcome {
    if (plan.scope !== "project") {
      return {
        kind: "manual",
        reason:
          "Für das Benutzerprofil gibt es keinen dokumentierten Befehl zum Entfernen. In der " +
          `Befehlspalette MCP: Open User Configuration öffnen und den Eintrag "${plan.serverName}" ` +
          `dort löschen; ältere Konfigurationen führen ihn unter ` +
          `${LEGACY_SERVER_NAMES.map((name) => `"${name}"`).join(" beziehungsweise ")}.`,
      };
    }
    const target = vscodeProjectFile(host);
    const text = host.readText(target);
    if (text === null) {
      return {
        kind: "unchanged",
        reason: `${target} existiert nicht; es war nichts zu entfernen.`,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return {
        kind: "failed",
        reason: `${target} ist kein gültiges JSON (${(error as Error).message}).`,
      };
    }
    if (!isRecord(parsed) || !isRecord(parsed[WRAPPER_KEY])) {
      return { kind: "unchanged", reason: `${target} führt kein Objekt "${WRAPPER_KEY}".` };
    }
    const wrapper = parsed[WRAPPER_KEY];
    const container: Record<string, unknown> = isRecord(wrapper) ? { ...wrapper } : {};
    // Auch hier gilt: der eigene Name und jeder frühere (siehe types.ts).
    const removable = removableEntryNames(container, plan.serverName);
    if (removable.length === 0) {
      return {
        kind: "unchanged",
        reason: `${target} führt keinen Eintrag "${plan.serverName}".`,
      };
    }
    for (const name of removable) {
      delete container[name];
    }
    try {
      const written = host.writeText(target, renderJson({ ...parsed, [WRAPPER_KEY]: container }));
      return { kind: "removed", path: target, backupPath: written.backupPath };
    } catch (error) {
      return {
        kind: "failed",
        reason: `${target} ließ sich nicht schreiben: ${(error as Error).message}`,
      };
    }
  },
};
