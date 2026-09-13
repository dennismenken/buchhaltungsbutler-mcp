/**
 * `profiles list|add|remove`: die Mandantenprofile in der Zugangsdatendatei.
 *
 * Der Fall, für den es diese Datei gibt: Ein Steuerberater oder eine Agentur betreut mehrere
 * Mandanten mit demselben Client-Secret-Paar und wechselndem `api_key`. Ein Profil je Mandant
 * bildet das ab, ohne in jedem Client eine eigene Serverinstanz einzutragen; gewählt wird
 * über `BB_PROFILE`.
 *
 * **Kein Wert wird je ausgegeben**, auch nicht gekürzt. `list` zeigt Namen, Anzeigenamen und
 * ob die drei Werte vorhanden sind — mehr braucht niemand, und mehr darf in kein Bildschirmfoto.
 *
 * **Kein Wert kommt als Argument herein.** Interaktiv wird maskiert gefragt, nicht interaktiv
 * ausschließlich aus `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` gelesen.
 */

import { CREDENTIAL_VARS } from "../config/env.js";
import {
  listProfileNames,
  readProfile,
  removeProfile,
  writeProfile,
} from "../config/credentials-file.js";
import { BINARY_NAME } from "./clients/types.js";
import { PromptUnavailableError, type Terminal } from "./prompt.js";
import { boolFlag, loadCliConfig, parseArgs, stringFlag, UsageError } from "./run.js";

export interface RunProfilesOptions {
  readonly argv: readonly string[];
  readonly terminal: Terminal;
  readonly env?: NodeJS.ProcessEnv;
}

const HINT_WHERE =
  "Die drei Werte stehen in BuchhaltungsButler unter Einstellungen, Schnittstellen und " +
  "API-Zugang, nachdem die API dort aktiviert wurde. Für den api_key nennt die zweite Quelle " +
  "zusätzlich die Firmendaten-Einstellungen; welche der beiden Stellen die Oberfläche heute " +
  "zeigt, ist nicht verifiziert.";

export async function runProfiles(options: RunProfilesOptions): Promise<number> {
  const { terminal } = options;
  const env = options.env ?? process.env;
  const args = parseArgs(options.argv, {
    booleans: ["yes", "non-interactive"],
    strings: ["label"],
  });
  const action = args.positionals[0] ?? "";
  const { config } = loadCliConfig(env);
  const file = config.credentialsFile;

  switch (action) {
    case "":
    case "list": {
      const names = listProfileNames(file);
      terminal.write(`Zugangsdatendatei: ${file}`);
      if (names.length === 0) {
        terminal.write("Es ist kein Profil hinterlegt.");
        terminal.write(`Ein Profil anlegen: ${BINARY_NAME} profiles add <name>`);
        return 0;
      }
      terminal.write("");
      for (const name of names) {
        const result = readProfile(file, name);
        const profile = result.profile;
        const present = CREDENTIAL_VARS.filter((variable) =>
          variable === "BB_API_CLIENT"
            ? profile?.apiClient != null
            : variable === "BB_API_SECRET"
              ? profile?.apiSecret != null
              : profile?.apiKey != null,
        );
        const active = name === config.profile ? "  (aktiv über BB_PROFILE)" : "";
        terminal.write(`  ${name}${active}`);
        if (profile?.label != null) {
          terminal.write(`      Anzeigename: ${profile.label}`);
        }
        terminal.write(
          `      Vollständig: ${present.length === 3 ? "ja" : `nein, vorhanden sind ${present.join(", ") || "keine Werte"}`}`,
        );
      }
      terminal.write("");
      terminal.write("Werte werden nicht angezeigt. Gewählt wird ein Profil über BB_PROFILE.");
      return 0;
    }

    case "add": {
      const name = args.positionals[1] ?? config.profile;
      const label = stringFlag(args, "label");
      const nonInteractive = boolFlag(args, "non-interactive") || !terminal.interactive;

      // Die Rückfrage nach dem Ersetzen steht **vor** der Eingabe: Erst drei Werte tippen und
      // danach zu hören, dass nichts geschrieben wird, wäre eine vermeidbare Zumutung.
      const existing = listProfileNames(file);
      if (existing.includes(name) && !boolFlag(args, "yes")) {
        const replace = terminal.interactive
          ? await terminal.confirm(`Das Profil "${name}" gibt es bereits. Ersetzen?`, false)
          : false;
        if (!replace) {
          terminal.write("Nichts geändert.");
          return 1;
        }
      }

      let apiClient: string;
      let apiSecret: string;
      let apiKey: string;

      if (nonInteractive) {
        const missing = CREDENTIAL_VARS.filter((variable) => {
          const value = env[variable];
          return value === undefined || value.trim() === "";
        });
        if (missing.length > 0) {
          throw new PromptUnavailableError(`Es fehlen ${missing.join(", ")}`);
        }
        apiClient = env.BB_API_CLIENT ?? "";
        apiSecret = env.BB_API_SECRET ?? "";
        apiKey = env.BB_API_KEY ?? "";
      } else {
        terminal.write(HINT_WHERE);
        terminal.write(
          "Die Eingabe wird maskiert; leere Eingabe übernimmt eine gesetzte Variable.",
        );
        apiClient = await askCredential(terminal, env, "BB_API_CLIENT", "API Client:");
        apiSecret = await askCredential(terminal, env, "BB_API_SECRET", "API Secret:");
        apiKey = await askCredential(terminal, env, "BB_API_KEY", "API Key (wählt den Mandanten):");
      }

      if (apiClient === "" || apiSecret === "" || apiKey === "") {
        terminal.writeError("Alle drei Werte werden gebraucht; es wurde nichts geschrieben.");
        return 1;
      }

      writeProfile(file, name, {
        apiClient,
        apiSecret,
        apiKey,
        ...(label === null ? {} : { label }),
      });
      terminal.write(`Profil "${name}" in ${file} gespeichert (Rechte 0600).`);
      terminal.write(
        name === "default"
          ? `Prüfen: ${BINARY_NAME} test`
          : `Prüfen: BB_PROFILE=${name} ${BINARY_NAME} test`,
      );
      return 0;
    }

    case "remove": {
      const name = args.positionals[1];
      if (name === undefined || name === "") {
        throw new UsageError(`Es fehlt der Profilname: ${BINARY_NAME} profiles remove <name>`);
      }
      if (!boolFlag(args, "yes") && terminal.interactive) {
        const sure = await terminal.confirm(`Profil "${name}" aus ${file} entfernen?`, false);
        if (!sure) {
          terminal.write("Nichts geändert.");
          return 1;
        }
      }
      const removed = removeProfile(file, name);
      if (!removed) {
        terminal.writeError(`In ${file} gibt es kein Profil "${name}".`);
        return 1;
      }
      terminal.write(`Profil "${name}" entfernt.`);
      return 0;
    }

    default:
      throw new UsageError(`profiles kennt nur list, add und remove, nicht "${action}".`);
  }
}

/**
 * Fragt einen Wert maskiert ab. Eine gesetzte Umgebungsvariable wird als Vorbelegung
 * angeboten — **ohne den Wert anzuzeigen**.
 */
async function askCredential(
  terminal: Terminal,
  env: NodeJS.ProcessEnv,
  variable: string,
  label: string,
): Promise<string> {
  const preset = env[variable];
  const hasPreset = preset !== undefined && preset.trim() !== "";
  const question = hasPreset ? `${label} [${variable} ist gesetzt, Enter übernimmt es]` : label;
  const answer = await terminal.askSecret(question);
  if (answer === "" && hasPreset) {
    return preset ?? "";
  }
  return answer.trim();
}

export { askCredential };
