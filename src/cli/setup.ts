/**
 * Der Einrichtungsassistent, neun Schritte.
 *
 * Die Reihenfolge der Ausführung weicht an **einer** Stelle von der Nummerierung ab,
 * und zwar zwingend: Die Frage nach dem Nur-Lesen-Schalter ist dort Schritt 9, ihre Antwort
 * wird aber in die Konfiguration geschrieben, die Schritt 7 anlegt. Sie wird deshalb vor
 * Schritt 7 gestellt und in der Ausgabe ausdrücklich als vorgezogener Schritt 9 benannt. Alle
 * neun Schritte finden statt, keiner entfällt.
 *
 * Drei Zusagen, die für den ganzen Ablauf gelten:
 *
 * - **Kein Wert wird angezeigt.** Weder bei der Eingabe (maskiert) noch in der Vorschau
 *   (Platzhalter) noch in einer Meldung.
 * - **Kein Wert kommt als Argument herein.** Nicht interaktiv werden ausschließlich
 *   `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` gelesen.
 * - **Vor jeder Änderung an einer bestehenden Datei entsteht eine Sicherung**, und ihr Pfad
 *   steht in der Ausgabe.
 */

import { writeProfile } from "../config/credentials-file.js";
import { CREDENTIAL_VARS } from "../config/env.js";
import { registerSecrets } from "../config/redact.js";
import { resolveConfig, type ResolvedConfig } from "../config/resolve.js";
import {
  BINARY_NAME,
  buildPlan,
  placeholderCredentials,
  serverLaunch,
  type ClientAdapter,
  type ClientHost,
  type ClientPlan,
  type ConfigScope,
  type CredentialPlacement,
  type StartVariant,
} from "./clients/types.js";
import { askCredential } from "./profiles.js";
import { printPreview } from "./print-config.js";
import { PromptUnavailableError, type Choice, type Terminal } from "./prompt.js";
import {
  ALL_ADAPTERS,
  boolFlag,
  findAdapter,
  loadCliConfig,
  parseArgs,
  scopeFlag,
  startFlag,
  stringFlag,
  UsageError,
} from "./run.js";
import { printConnectionTest, runConnectionTest } from "./test.js";
import { printOutcome } from "./uninstall.js";

/** Wohin die Zugangsdaten gehen. */
type CredentialTarget = "file" | "client" | "none";

/** Der Satz, den der Nutzer in seinen Client tippen kann. */
export const VERIFICATION_SENTENCE = "Liste meine Zahlungskonten in BuchhaltungsButler.";

const WHERE_TO_FIND =
  "Die drei Werte stehen in BuchhaltungsButler unter Einstellungen, Schnittstellen und " +
  "API-Zugang, nachdem die API dort aktiviert wurde. Eine zweite Quelle nennt für den " +
  "api_key zusätzlich die Firmendaten-Einstellungen; welche der beiden Stellen die " +
  "Oberfläche heute zeigt, ist nicht verifiziert. Deshalb hier beide.";

export interface RunSetupOptions {
  readonly argv: readonly string[];
  readonly terminal: Terminal;
  readonly host: ClientHost;
  readonly env?: NodeJS.ProcessEnv;
}

interface Credentials {
  readonly apiClient: string;
  readonly apiSecret: string;
  readonly apiKey: string;
}

function heading(terminal: Terminal, text: string): void {
  terminal.write("");
  terminal.write(text);
  terminal.write("-".repeat(Math.min(text.length, 76)));
}

export async function runSetup(options: RunSetupOptions): Promise<number> {
  const { terminal, host } = options;
  const env = options.env ?? process.env;
  const args = parseArgs(options.argv, {
    booleans: ["non-interactive", "print-only", "read-only", "overwrite", "yes"],
    strings: ["client", "scope", "start", "profile", "credentials"],
  });

  const nonInteractive = boolFlag(args, "non-interactive") || !terminal.interactive;
  const printOnly = boolFlag(args, "print-only");
  const assumeYes = boolFlag(args, "yes");

  // --- Schritt 1: Vorprüfung ----------------------------------------------------------
  // Die Node-Version prüft `resolveConfig` als Erstes; eine Unterschreitung endet dort mit
  // einem ConfigError, den `runCli` ausgibt.
  const { config } = loadCliConfig(env);
  const profileName = stringFlag(args, "profile") ?? config.profile;

  heading(terminal, `Schritt 1 von 9: Vorprüfung`);
  terminal.write(`Node ${process.versions.node} auf ${process.platform} — in Ordnung.`);
  const detections = ALL_ADAPTERS.map((adapter) => ({
    adapter,
    detection: adapter.detect(host),
  }));
  const found = detections.filter((entry) => entry.detection.found);
  terminal.write(
    found.length === 0
      ? "Auf diesem Rechner wurde keiner der unterstützten Clients gefunden."
      : `Gefunden: ${found.map((entry) => entry.adapter.label).join(", ")}.`,
  );

  // --- Schritt 2: Zugangsdaten erfragen ------------------------------------------------
  heading(terminal, "Schritt 2 von 9: Zugangsdaten");
  const credentials = await collectCredentials({
    terminal,
    env,
    config,
    nonInteractive,
    printOnly,
  });
  if (credentials !== null) {
    registerSecrets([
      credentials.apiClient,
      credentials.apiSecret,
      credentials.apiKey,
      `${credentials.apiClient}:${credentials.apiSecret}`,
    ]);
  }

  // --- Schritt 3: Verbindung testen ----------------------------------------------------
  heading(terminal, "Schritt 3 von 9: Verbindung testen");
  let accountsForConfirmation: readonly { name: string; postingAccountNumber: string }[] = [];
  if (credentials === null) {
    terminal.write(
      "Übersprungen: Es liegen keine Zugangsdaten vor. Ohne sie lässt sich nichts prüfen.",
    );
  } else {
    const testConfig = configWithCredentials(env, credentials);
    const result = await runConnectionTest(testConfig);
    printConnectionTest(terminal, result);
    if (!result.ok) {
      if (nonInteractive || assumeYes) {
        terminal.writeError("Der Verbindungstest ist gescheitert. Es wurde nichts geschrieben.");
        return 1;
      }
      const carryOn = await terminal.confirm(
        "Trotzdem fortfahren und die Konfiguration schreiben?",
        false,
      );
      if (!carryOn) {
        terminal.write("Abgebrochen. Es wurde nichts geschrieben.");
        return 1;
      }
    } else if (result.outcome.kind === "ok") {
      accountsForConfirmation = result.outcome.accounts;
    }
  }

  // --- Schritt 4: Mandant bestätigen ---------------------------------------------------
  heading(terminal, "Schritt 4 von 9: Mandant bestätigen");
  if (accountsForConfirmation.length === 0) {
    terminal.write(
      "Es liegen keine Zahlungskonten zur Bestätigung vor; der Mandant lässt sich damit nicht " +
        "gegenprüfen.",
    );
  } else {
    // `/accounts/get` liefert keinen Mandantennamen — live belegt sind je Zeile genau `name`
    // und `postingaccount_number`. Die Kontenliste ist deshalb das verfügbare Mittel, den
    // teuersten Einrichtungsfehler zu verhindern: den api_key eines fremden Mandanten.
    terminal.write(`Gefunden: ${String(accountsForConfirmation.length)} Zahlungskonten.`);
    for (const account of accountsForConfirmation) {
      terminal.write(`  ${account.postingAccountNumber.padEnd(6, " ")}${account.name}`);
    }
    if (nonInteractive) {
      terminal.write(
        "Nicht interaktiver Betrieb: Die Rückfrage entfällt. Diese Konten müssen zu dem " +
          "Mandanten gehören, der verbunden werden soll — sonst ist der api_key der falsche.",
      );
    } else {
      const rightTenant = await terminal.confirm(
        "Gehören diese Konten zu dem Mandanten, den Sie verbinden wollen?",
        true,
      );
      if (!rightTenant) {
        terminal.writeError(
          "Dann ist der api_key der falsche: Er wählt den Mandanten aus. API Client und API " +
            "Secret können stimmen und trotzdem auf eine fremde Buchhaltung zeigen. Den api_key " +
            "des richtigen Mandanten holen und setup erneut ausführen. Es wurde nichts geschrieben.",
        );
        return 1;
      }
    }
  }

  // --- Schritt 5: Startvariante --------------------------------------------------------
  heading(terminal, "Schritt 5 von 9: Startvariante");
  const start = await chooseStart({ terminal, host, args, nonInteractive });
  const binaryPath = host.which(BINARY_NAME);
  if (start === "global" && binaryPath === null) {
    terminal.write(
      `${BINARY_NAME} ist nicht im Suchpfad. In die Konfiguration geht deshalb der bloße Name; ` +
        "startet der Client nicht aus einer Login-Shell, findet er ihn womöglich nicht. Dann " +
        "hilft der absolute Pfad oder die Variante npx.",
    );
  }
  const launch = serverLaunch(start, binaryPath);
  terminal.write(`Start: ${launch.command} ${launch.args.join(" ")}`.trimEnd());

  // --- Schritt 6: Ablageort der Zugangsdaten -------------------------------------------
  heading(terminal, "Schritt 6 von 9: Ablageort der Zugangsdaten");
  const target = await chooseCredentialTarget({ terminal, args, nonInteractive, credentials });
  let label: string | null = null;
  if (target === "file" && credentials !== null && !printOnly) {
    if (!nonInteractive) {
      const answer = await terminal.ask(
        "Anzeigename des Mandanten für die Zugangsdatendatei (optional, kein Geheimnis):",
        "",
      );
      label = answer === "" ? null : answer;
    }
    writeProfile(config.credentialsFile, profileName, {
      apiClient: credentials.apiClient,
      apiSecret: credentials.apiSecret,
      apiKey: credentials.apiKey,
      ...(label === null ? {} : { label }),
    });
    terminal.write(
      `Profil "${profileName}" in ${config.credentialsFile} gespeichert (Datei 0600, Verzeichnis 0700).`,
    );
    terminal.write("Die Clientkonfigurationen enthalten damit kein Geheimnis.");
  } else if (target === "file") {
    terminal.write(
      printOnly
        ? "Nur ausgeben: Es wird keine Zugangsdatendatei geschrieben."
        : "Es liegen keine Zugangsdaten vor; die Zugangsdatendatei bleibt unberührt.",
    );
  } else if (target === "client") {
    terminal.write(
      "Die Werte gehen in die Clientkonfiguration. Diese Datei wird damit schutzbedürftig: " +
        "Sie liegt im Benutzerprofil, wandert in Sicherungen und in Einstellungsabgleiche.",
    );
  } else {
    terminal.write(
      `Es wird nichts hinterlegt. Die drei Variablen ${CREDENTIAL_VARS.join(", ")} müssen dann in ` +
        "der Umgebung stehen, in der der Client den Server startet.",
    );
  }

  // --- Schritt 9, vorgezogen: Nur-Lesen-Schalter ---------------------------------------
  heading(terminal, "Schritt 9 von 9 (vorgezogen): Nur-Lesen-Schalter");
  terminal.write(
    "Die Antwort wird in die Konfiguration geschrieben, die Schritt 7 anlegt; deshalb steht " +
      "die Frage hier.",
  );
  const readOnly = boolFlag(args, "read-only")
    ? true
    : nonInteractive
      ? false
      : await terminal.confirm("Soll dieser Server zunächst nur lesen dürfen?", false);
  if (readOnly) {
    terminal.write(
      "BB_MCP_READ_ONLY=true geht in die Konfiguration. Dann laufen die 15 lesenden Werkzeuge; " +
        "die übrigen 39 lehnen ab, bevor ein Request abgeht. Folge für Berichte: Das Kontenblatt " +
        "lässt sich abrufen, BWA und Summen- und Saldenliste nicht, weil deren erster Schritt " +
        "einen Bericht erzeugt und damit den Vorgängerbericht ersetzt.",
    );
  } else {
    terminal.write("Alle 54 Werkzeuge bleiben aufrufbar. Die Freigabe liegt beim Client.");
  }

  // --- Schritt 7: Clients auswählen und Vorschau ---------------------------------------
  heading(terminal, "Schritt 7 von 9: Clients auswählen und Vorschau");
  const chosen = await chooseClients({ terminal, args, nonInteractive, detections });
  if (chosen.length === 0) {
    terminal.write("Kein Client ausgewählt. Es wurde nichts geschrieben.");
    return 0;
  }

  const extraEnv: Record<string, string> = {};
  if (readOnly) {
    extraEnv.BB_MCP_READ_ONLY = "true";
  }
  if (profileName !== "default") {
    extraEnv.BB_PROFILE = profileName;
  }

  let failures = 0;
  const written: ClientAdapter[] = [];

  for (const adapter of chosen) {
    const scope = pickScope(adapter, args);
    const previewPlan = buildPlan({
      launch,
      scope,
      extraEnv,
      // Die Vorschau bekommt **immer** Platzhalter. Ein echter Wert kann hier nicht
      // durchrutschen, weil er gar nicht erst in den Vorschauplan gelangt.
      credentials: credentialPlacement(target, null),
      allowOverwrite: boolFlag(args, "overwrite"),
    });
    terminal.write("");
    printPreview(terminal, adapter, adapter.preview(previewPlan, host));

    if (printOnly) {
      continue;
    }
    if (!adapter.automatic) {
      terminal.write(
        `  ${adapter.label} wird nicht automatisch konfiguriert; der Block oben ist von Hand ` +
          "einzufügen.",
      );
      continue;
    }
    if (!nonInteractive && !assumeYes) {
      const go = await terminal.confirm(`Diesen Eintrag bei ${adapter.label} schreiben?`, true);
      if (!go) {
        terminal.write(`  ${adapter.label}: übersprungen.`);
        continue;
      }
    }

    const writePlan = buildPlan({
      launch,
      scope,
      extraEnv,
      credentials: credentialPlacement(target, credentials),
      allowOverwrite: boolFlag(args, "overwrite"),
    });
    const outcome = adapter.apply(writePlan, host);
    printOutcome(terminal, adapter.label, outcome);
    if (outcome.kind === "failed") {
      failures += 1;
    } else if (outcome.kind === "written") {
      written.push(adapter);
    }
  }

  // --- Schritt 8: Abschluss und Verifikation -------------------------------------------
  heading(terminal, "Schritt 8 von 9: Abschluss");
  if (printOnly) {
    terminal.write("Nur ausgeben: Es wurde keine Datei geändert und kein Befehl ausgeführt.");
  }
  for (const adapter of chosen) {
    terminal.write(`${adapter.label}: ${adapter.finishNote}`);
    if (adapter.verifyCommand !== null) {
      terminal.write(`  Prüfen: ${adapter.verifyCommand}`);
    }
  }
  terminal.write("");
  terminal.write("Nachweis, dass es wirklich läuft — diesen Satz in den Client tippen:");
  terminal.write(`  „${VERIFICATION_SENTENCE}"`);
  terminal.write("");
  terminal.write(`Diagnose bei Problemen: ${BINARY_NAME} doctor`);

  if (failures > 0) {
    terminal.writeError(
      `${String(failures)} Client${failures === 1 ? "" : "s"} ließ sich nicht schreiben; die ` +
        "Meldungen stehen oben.",
    );
    return 1;
  }
  if (written.length === 0 && !printOnly) {
    terminal.write("Es wurde keine Clientkonfiguration geändert.");
  }
  return 0;
}

// --- Bausteine --------------------------------------------------------------------------

function credentialPlacement(
  target: CredentialTarget,
  credentials: Credentials | null,
): CredentialPlacement {
  if (target === "none") {
    return { mode: "reference" };
  }
  if (target === "file") {
    return { mode: "none" };
  }
  if (credentials === null) {
    return placeholderCredentials();
  }
  return {
    mode: "values",
    values: {
      BB_API_CLIENT: credentials.apiClient,
      BB_API_SECRET: credentials.apiSecret,
      BB_API_KEY: credentials.apiKey,
    },
  };
}

/** Eine Konfiguration mit den eben eingegebenen Werten, für den Verbindungstest. */
function configWithCredentials(env: NodeJS.ProcessEnv, credentials: Credentials): ResolvedConfig {
  // Über `resolveConfig` und nicht von Hand zusammengesetzt: Damit gelten für den Testaufruf
  // dieselben Prüfungen und dieselbe Basis-URL wie später für den Server.
  return resolveConfig({
    env: {
      ...env,
      BB_API_CLIENT: credentials.apiClient,
      BB_API_SECRET: credentials.apiSecret,
      BB_API_KEY: credentials.apiKey,
    },
  }).config;
}

interface CollectOptions {
  readonly terminal: Terminal;
  readonly env: NodeJS.ProcessEnv;
  readonly config: ResolvedConfig;
  readonly nonInteractive: boolean;
  readonly printOnly: boolean;
}

async function collectCredentials(options: CollectOptions): Promise<Credentials | null> {
  const { terminal, env, config, nonInteractive } = options;

  if (nonInteractive) {
    const missing = CREDENTIAL_VARS.filter((name) => {
      const value = env[name];
      return value === undefined || value.trim() === "";
    });
    if (missing.length === 0) {
      terminal.write("Zugangsdaten aus den Umgebungsvariablen übernommen (Werte nicht angezeigt).");
      return {
        apiClient: env.BB_API_CLIENT ?? "",
        apiSecret: env.BB_API_SECRET ?? "",
        apiKey: env.BB_API_KEY ?? "",
      };
    }
    if (config.credentials !== null) {
      terminal.write(
        `Zugangsdaten aus der Zugangsdatendatei übernommen, Profil "${config.credentials.profile ?? "default"}".`,
      );
      return {
        apiClient: config.credentials.apiClient,
        apiSecret: config.credentials.apiSecret,
        apiKey: config.credentials.apiKey,
      };
    }
    if (options.printOnly) {
      terminal.write(
        `Es fehlen ${missing.join(", ")}. Ohne Terminal werden keine Werte erfragt; die Ausgabe ` +
          "bleibt bei Platzhaltern.",
      );
      return null;
    }
    throw new PromptUnavailableError(`Es fehlen ${missing.join(", ")}`);
  }

  if (config.credentials !== null) {
    const source =
      config.credentials.source === "env"
        ? "den Umgebungsvariablen"
        : `der Zugangsdatendatei, Profil "${config.credentials.profile ?? "default"}"`;
    const keep = await terminal.confirm(
      `Es liegen bereits Zugangsdaten in ${source} vor. Diese übernehmen?`,
      true,
    );
    if (keep) {
      return {
        apiClient: config.credentials.apiClient,
        apiSecret: config.credentials.apiSecret,
        apiKey: config.credentials.apiKey,
      };
    }
  }

  terminal.write(WHERE_TO_FIND);
  terminal.write("Die Eingabe wird maskiert. Eine gesetzte Variable übernimmt Enter.");
  const apiClient = await askCredential(terminal, env, "BB_API_CLIENT", "API Client:");
  const apiSecret = await askCredential(terminal, env, "BB_API_SECRET", "API Secret:");
  const apiKey = await askCredential(
    terminal,
    env,
    "BB_API_KEY",
    "API Key (er wählt den Mandanten):",
  );
  if (apiClient === "" || apiSecret === "" || apiKey === "") {
    terminal.write("Es wurden nicht alle drei Werte eingegeben; der Verbindungstest entfällt.");
    return null;
  }
  return { apiClient, apiSecret, apiKey };
}

interface StartOptions {
  readonly terminal: Terminal;
  readonly host: ClientHost;
  readonly args: ReturnType<typeof parseArgs>;
  readonly nonInteractive: boolean;
}

async function chooseStart(options: StartOptions): Promise<StartVariant> {
  const { terminal, host, args, nonInteractive } = options;
  const flagValue = startFlag(args, "npx");
  if (nonInteractive || stringFlag(args, "start") !== null) {
    return flagValue;
  }
  const binaryPath = host.which(BINARY_NAME);
  const choices: Choice<StartVariant>[] = [
    {
      value: "npx",
      label: "npx (Vorgabe)",
      detail: "npx lädt das Paket bei Bedarf; keine Installation nötig, dafür ein Kaltstart.",
    },
    {
      value: "global",
      label: "globale Installation",
      detail:
        binaryPath === null
          ? `${BINARY_NAME} ist derzeit nicht im Suchpfad (npm install -g).`
          : `Absoluter Pfad: ${binaryPath}`,
    },
  ];
  return await terminal.chooseOne("Wie soll der Client den Server starten?", choices, 0);
}

interface TargetOptions {
  readonly terminal: Terminal;
  readonly args: ReturnType<typeof parseArgs>;
  readonly nonInteractive: boolean;
  readonly credentials: Credentials | null;
}

async function chooseCredentialTarget(options: TargetOptions): Promise<CredentialTarget> {
  const { terminal, args, nonInteractive, credentials } = options;
  const raw = stringFlag(args, "credentials");
  if (raw !== null) {
    if (raw === "file" || raw === "client" || raw === "none") {
      return raw;
    }
    throw new UsageError(`--credentials kennt nur "file", "client" und "none", nicht "${raw}".`);
  }
  if (credentials === null) {
    return "none";
  }
  if (nonInteractive) {
    return "file";
  }
  const choices: Choice<CredentialTarget>[] = [
    {
      value: "file",
      label: "Zugangsdatendatei mit Rechten 0600 (Vorgabe und Empfehlung)",
      detail: "Die Clientkonfiguration enthält dann kein Geheimnis.",
    },
    {
      value: "client",
      label: "direkt in die Clientkonfiguration",
      detail: "Die Datei wird damit schutzbedürftig; nicht jeder Client kann das sicher.",
    },
    {
      value: "none",
      label: "nichts schreiben",
      detail: "Die drei Variablen setzt der Nutzer selbst in der Umgebung des Clients.",
    },
  ];
  return await terminal.chooseOne("Wo sollen die Zugangsdaten liegen?", choices, 0);
}

interface ClientChoiceOptions {
  readonly terminal: Terminal;
  readonly args: ReturnType<typeof parseArgs>;
  readonly nonInteractive: boolean;
  readonly detections: readonly {
    readonly adapter: ClientAdapter;
    readonly detection: { readonly found: boolean; readonly how: string };
  }[];
}

async function chooseClients(options: ClientChoiceOptions): Promise<ClientAdapter[]> {
  const { terminal, args, nonInteractive, detections } = options;
  const raw = stringFlag(args, "client");
  if (raw !== null) {
    const adapters: ClientAdapter[] = [];
    for (const key of raw.split(",").map((part) => part.trim())) {
      if (key === "") {
        continue;
      }
      const adapter = findAdapter(key);
      if (adapter === null) {
        throw new UsageError(
          `"${key}" ist kein bekanntes Clientkürzel. Bekannt sind: ` +
            `${ALL_ADAPTERS.map((entry) => entry.key).join(", ")}.`,
        );
      }
      adapters.push(adapter);
    }
    return adapters;
  }
  if (nonInteractive) {
    throw new UsageError(
      "Im nicht interaktiven Betrieb muss --client <name> angegeben werden; mehrere durch " +
        "Komma getrennt.",
    );
  }

  // Gefundene Clients zuerst, die übrigen darunter.
  const sorted = [...detections].sort((left, right) =>
    left.detection.found === right.detection.found ? 0 : left.detection.found ? -1 : 1,
  );
  const choices: Choice<ClientAdapter>[] = sorted.map((entry) => ({
    value: entry.adapter,
    label: `${entry.detection.found ? "" : "Weitere: "}${entry.adapter.label}`,
    detail: `${entry.detection.how}${entry.adapter.automatic ? "" : " — wird nur ausgegeben"}`,
  }));
  const preselected = choices
    .map((choice, index) => ({ choice, index }))
    .filter((entry) => sorted[entry.index]?.detection.found === true)
    .map((entry) => entry.index);
  return await terminal.chooseMany(
    "Welche Clients sollen eingerichtet werden?",
    choices,
    preselected,
  );
}

function pickScope(adapter: ClientAdapter, args: ReturnType<typeof parseArgs>): ConfigScope {
  const wanted = scopeFlag(args, adapter.scopes[0] ?? "user");
  return adapter.scopes.includes(wanted) ? wanted : (adapter.scopes[0] ?? "user");
}

/** Nur für Tests: der Plan, den ein Adapter im Ablauf bekäme. */
export function planForTest(options: {
  readonly launch: ClientPlan["launch"];
  readonly scope: ConfigScope;
  readonly target: CredentialTarget;
  readonly credentials: Credentials | null;
  readonly extraEnv?: Record<string, string>;
}): ClientPlan {
  return buildPlan({
    launch: options.launch,
    scope: options.scope,
    credentials: credentialPlacement(options.target, options.credentials),
    extraEnv: options.extraEnv ?? {},
  });
}
