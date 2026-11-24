// Der Aufbau des Servers: McpServer bauen, `instructions` übergeben, Werkzeuge und Resources
// registrieren, Signal- und Fehlerbehandlung einhängen (Dateibaum).
//
// Die Datei hält zwei Einstiegspunkte auseinander, und zwar mit Absicht:
//
//   createServer()     baut und registriert, rührt den Prozess aber nicht an. Das ist der
//                      programmatische Weg aus `src/index.ts` und der Weg, den die Tests gehen.
//   runStdioServer()   ist der Prozesseinstieg: Konfiguration auflösen (und bei unbrauchbarem
//                      Wert abbrechen), Transport öffnen, Signale und Prozessfehler einhängen.
//
// Ohne diese Trennung müsste ein Test entweder den Prozess anfassen oder der programmatische
// Export Signallauscher hinterlassen.

import { McpServer } from "@modelcontextprotocol/server";
import type { Transport } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import type { RegisteredBundleInfo } from "../bundles/register.js";
import { registerBundles } from "../bundles/register.js";
import type { RegisteredGatewayInfo } from "./discovery.js";
import { registerDiscoveryTools } from "./discovery.js";
import type { BundleEntry } from "../bundles/types.js";
import type { MasterDataStore } from "../cache/store.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { getConfig, isConfigLoaded, loadConfigOrExit } from "../config/resolve.js";
import { toolGroupReportLines } from "../config/tool-groups.js";
import { installGlobalDispatcher } from "../http/dispatcher.js";
import { logInfo, writeStderrBlock } from "../logging/stderr.js";
import type { ToolEntry } from "../registry/types.js";
import { SERVER_INFO } from "../generated/version.js";
import { buildInstructions } from "./instructions.js";
import type { RegisteredToolInfo } from "./register-tools.js";
import { registerTools } from "./register-tools.js";
import { registerResources } from "./resources.js";
import type { ShutdownHandle } from "./shutdown.js";
import { installProcessErrorHandlers, installShutdown } from "./shutdown.js";

export interface CreateServerOptions {
  /** Die aufgelöste Konfiguration. Ohne Angabe die eingefrorene des Prozesses. */
  readonly config?: ResolvedConfig;
  /** Die Registereinträge. Ohne Angabe das vollständige Register. */
  readonly entries?: readonly ToolEntry[];
  /**
   * Die Bündelwerkzeuge. Ohne Angabe alle aus `src/bundles/index.ts`; ein leeres Array meldet
   * keines an. Gedacht für Tests, die einen Server mit genau einer Werkzeugliste prüfen.
   */
  readonly bundles?: readonly BundleEntry[];
  readonly store?: MasterDataStore;
  /**
   * Ersetzt den Text aus `instructions.ts`. Gedacht für Tests und für einen Einbettenden, der
   * eigene Hinweise mitgibt; im Betrieb bleibt das Feld leer.
   */
  readonly instructions?: string;
  /** Die Uhr der Audit-Dauer. Monoton, nicht die Wanduhr. */
  readonly now?: () => number;
}

export interface BuiltServer {
  readonly server: McpServer;
  /**
   * Eine Zeile je registriertem Endpunktwerkzeug, in Registrierreihenfolge. Im Modus
   * `discovery` leer: Dort melden die Gateways an, nicht die Endpunktwerkzeuge.
   */
  readonly tools: readonly RegisteredToolInfo[];
  /**
   * Die fünf Gatewaywerkzeuge im Modus `discovery`; leer im Modus `direct`. Jede Zeile
   * nennt das Gateway und seine Annotationsklasse.
   */
  readonly gateways: readonly RegisteredGatewayInfo[];
  /** Eine Zeile je registriertem Bündelwerkzeug; leer, wenn die Gruppe `bundles` aus ist. */
  readonly bundles: readonly RegisteredBundleInfo[];
  /** Die URIs der registrierten Resources. */
  readonly resources: readonly string[];
  /** Der Text, der bei `initialize` mitgeht. */
  readonly instructions: string;
}

/**
 * Baut den Server und registriert alles, was er anbietet.
 *
 * **Die Werkzeugliste hängt an genau einem Schalter, und das ist nicht der Nur-Lesen-Schalter.**
 * Auch bei fehlender Konfiguration und auch bei gesetztem `BB_MCP_READ_ONLY` werden alle
 * übergebenen Einträge registriert; die Absage kommt beim Aufruf und nicht durch Weglassen.
 * Allein der Gruppenschalter `BB_MCP_TOOL_GROUPS` lässt Einträge weg, und er tut es, um
 * Kontext zu sparen; die Begründung steht bei `registerTools`.
 *
 * Beide `listChanged`-Angaben stehen ausdrücklich auf `false`: Werkzeugliste und
 * Resource-Liste sind über die gesamte Verbindung stabil, und dieser Server schickt keine
 * der beiden Benachrichtigungen je. Ohne die zweite Angabe meldete das SDK durch
 * `registerResource` von sich aus `resources: { listChanged: true }` und versprächen dem
 * Client damit eine Benachrichtigung, die nie kommt.
 */
export function createServer(options: CreateServerOptions = {}): BuiltServer {
  const config = options.config ?? getConfig();
  const instructions = options.instructions ?? buildInstructions(config);

  // Keep-Alive und Proxy aus der Umgebung. Der Aufruf ist unter einem MockAgent wirkungslos
  // und lässt die Netzsperre des Testlaufs damit unberührt (`http/dispatcher.ts`).
  installGlobalDispatcher();

  const server = new McpServer(SERVER_INFO, {
    instructions,
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
  });

  // Der Betriebsmodus steht je Serverstart fest: `direct` meldet jedes
  // Endpunktwerkzeug einzeln an, `discovery` stattdessen die fünf Gatewaywerkzeuge. Die
  // Bündel und die Resources sind in beiden Modi dieselben.
  const tools =
    config.toolMode === "discovery"
      ? []
      : registerTools(server, {
          ...(options.entries === undefined ? {} : { entries: options.entries }),
          config,
          ...(options.store === undefined ? {} : { store: options.store }),
          ...(options.now === undefined ? {} : { now: options.now }),
        });
  const gateways =
    config.toolMode === "discovery"
      ? registerDiscoveryTools(server, {
          ...(options.entries === undefined ? {} : { entries: options.entries }),
          config,
          ...(options.store === undefined ? {} : { store: options.store }),
          ...(options.now === undefined ? {} : { now: options.now }),
        })
      : [];
  // Die Bündelwerkzeuge hängen an der Gruppe `bundles` und an keiner Endpunktgruppe: Ein
  // Bündel ruft die HTTP-Schicht auf und nicht die Endpunktwerkzeuge.
  const bundles = registerBundles(server, {
    config,
    ...(options.bundles === undefined ? {} : { entries: options.bundles }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const resources = registerResources(
    server,
    options.store === undefined ? {} : { store: options.store },
  );

  return { server, tools, gateways, bundles, resources, instructions };
}

/**
 * Die Zahl der Werkzeuge, die dieser Start angemeldet hat: Endpunktwerkzeuge, Gateways
 * **und** Bündel.
 *
 * Die Bündel gehören in jede genannte Zahl, denn sie stehen in derselben `tools/list`-Antwort
 * wie die 61 Endpunktwerkzeuge, die unverändert bestehen bleiben. Ohne sie meldete der
 * Start unter
 * `BB_MCP_TOOL_GROUPS=bundles` „0 Werkzeuge", während der Client fünf bekommt — und das ist
 * das empfohlene Profil für Claude Desktop. Die Rückmeldung zum Gruppenschalter ist die
 * einzige Stelle, an der jemand nachsehen kann, was seine Einstellung bewirkt hat; eine Zahl,
 * die dort das Gegenteil der Wahrheit sagt, ist schlimmer als gar keine. Im Modus
 * `discovery` stehen die fünf Gateways an der Stelle der Endpunktwerkzeuge.
 */
export function registeredToolCount(built: BuiltServer): number {
  return built.tools.length + built.gateways.length + built.bundles.length;
}

/**
 * Die Startmeldung zum Gruppenschalter `BB_MCP_TOOL_GROUPS`.
 *
 * **Zwei Wege mit Absicht.** Sind alle zwölf Gruppen aktiv, ist nichts versteckt, und die
 * Zeilen gehen als gewöhnliche `info`-Meldung heraus, die `BB_MCP_LOG_LEVEL` stummschalten
 * darf. Ist mindestens eine Gruppe abgeschaltet, geht der Block ohne Stufenprüfung heraus: Eine
 * Werkzeugliste, die aus unsichtbaren Gründen kürzer ist als erwartet, ist der teuerste Zustand
 * dieses Schalters, und wer ihn gesetzt hat, hat die Meldung selbst veranlasst.
 *
 * @param registeredTools Endpunktwerkzeuge **und** Bündel zusammen, also genau die Länge der
 *   `tools/list`-Antwort dieses Starts. Siehe {@link registeredToolCount}.
 */
function announceToolGroups(config: ResolvedConfig, registeredTools: number): void {
  const lines = toolGroupReportLines(config.toolGroups, registeredTools);
  if (config.toolGroups.restricted) {
    writeStderrBlock(["", "WERKZEUGGRUPPEN", ...lines, ""].join("\n"));
    return;
  }
  logInfo(lines.join("\n"));
}

export interface RunStdioServerOptions extends CreateServerOptions {
  /** Ein eigener Transport. Ohne Angabe stdio über die Ströme dieses Prozesses. */
  readonly transport?: Transport;
}

export interface RunningServer extends BuiltServer {
  readonly transport: Transport;
  readonly shutdown: ShutdownHandle;
  /**
   * Entfernt Signal- und Prozessfehlerlauscher, **ohne** herunterzufahren. Für Tests und für
   * einen Einbettenden, der die Lebensdauer selbst führt; der gewöhnliche Abbau über
   * {@link RunningServer.shutdown} erledigt dasselbe mit.
   */
  readonly dispose: () => void;
}

/**
 * Startet den Server auf stdio. Der Prozesseinstieg, von `src/cli.ts` benutzt.
 *
 * Zur Reihenfolge: Die Konfiguration wird vor dem Öffnen des Transports aufgelöst.
 * Ein unbrauchbarer Wert bricht dort ab, **fehlende Zugangsdaten nicht** — der Server startet,
 * meldet alle Werkzeuge an und erklärt sich bei jedem Aufruf. Ein Verbindungstest
 * beim Start findet nicht statt; er kostete bei jedem Clientneustart ein Token aus dem
 * Minutenkontingent des Mandanten, und der Client zeigt sein Ergebnis nirgends an.
 */
export async function runStdioServer(options: RunStdioServerOptions = {}): Promise<RunningServer> {
  const config = options.config ?? (isConfigLoaded() ? getConfig() : loadConfigOrExit());
  const built = createServer({ ...options, config });
  const transport = options.transport ?? new StdioServerTransport();

  // Die Prozessfehlerlauscher stehen vor dem Herunterfahrgriff, weil der Griff sie beim Abbau
  // wieder entfernt und sie deshalb zuerst existieren müssen. Der Griff wird nachgetragen; eine
  // Ausnahme kann erst auftreten, wenn beides steht, also nach dem Ende dieser Funktion.
  const lifecycle: { handle?: ShutdownHandle } = {};
  const removeErrorHandlers = installProcessErrorHandlers({
    onFatal: (error) => {
      void lifecycle.handle?.shutdown(`unbehandelte Ausnahme: ${error.message}`);
    },
  });

  const shutdown = installShutdown({
    // Der Server schließt den Transport selbst, sobald er ihn besitzt. Er steht hier trotzdem
    // zuerst, damit die Reihenfolge auch dann stimmt, wenn ein Einbettender einen eigenen
    // Transport mitgibt, den der Server nicht übernimmt. Zuletzt verschwinden die
    // Prozessfehlerlauscher, damit eine Diagnose noch bis zum Ende geschrieben wird.
    targets: [built.server, { close: removeErrorHandlers }],
  });
  lifecycle.handle = shutdown;

  const dispose = (): void => {
    removeErrorHandlers();
    shutdown.dispose();
  };

  await built.server.connect(transport);
  const registered = registeredToolCount(built);
  announceToolGroups(config, registered);
  // Im Discovery-Modus stehen die Gateways an der Stelle der Endpunktwerkzeuge; die
  // Meldung nennt, was dieser Start wirklich anmeldet, und keinen der beiden Modi als
  // den anderen.
  const endpointPart =
    built.gateways.length > 0
      ? `${String(built.gateways.length)} Gatewaywerkzeuge`
      : `${String(built.tools.length)} Endpunktwerkzeuge`;
  logInfo(
    `${SERVER_INFO.name} ${SERVER_INFO.version} läuft auf stdio mit ` +
      `${String(registered)} Werkzeugen: ${endpointPart} und ` +
      `${String(built.bundles.length)} Bündel.`,
  );

  return { ...built, transport, shutdown, dispose };
}
