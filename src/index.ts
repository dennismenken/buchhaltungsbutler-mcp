// Der programmatische Export des Pakets (Plan 2, Dateibaum).
//
// **Seiteneffektfrei.** Dieses Modul führt beim Laden nichts aus: Es löst keine Konfiguration
// auf, setzt keinen Dispatcher, hängt keinen Signallauscher ein und schreibt keine Zeile. Wer
// es importiert, bekommt Bausteine und keine laufende Anwendung. Der Prozesseinstieg ist
// `src/cli.ts` (AP15), und er ruft {@link runStdioServer}.
//
// Exportiert wird, was ein Einbettender braucht: der Aufbau des Servers, das Register samt
// seinen Typen und die Stellen, an denen die Konfiguration aufgelöst wird. Bewusst **nicht**
// exportiert sind die inneren Schichten — HTTP-Client, Fehlerkatalog, Schemabau, Guards. Sie
// sind die Ablauflogik dieses Servers, und ein Export machte jede Änderung daran zu einer
// Änderung der öffentlichen Schnittstelle.

// --- Aufbau und Betrieb des Servers --------------------------------------------------

export {
  createServer,
  runStdioServer,
  type BuiltServer,
  type CreateServerOptions,
  type RunStdioServerOptions,
  type RunningServer,
} from "./server/create-server.js";

export {
  registerTools,
  type RegisteredToolInfo,
  type RegisterToolsOptions,
} from "./server/register-tools.js";

export { buildInstructions } from "./server/instructions.js";

export { registerResources, type RegisterResourcesOptions } from "./server/resources.js";

export {
  installProcessErrorHandlers,
  installShutdown,
  SHUTDOWN_SIGNALS,
  type InstallShutdownOptions,
  type ShutdownCloseable,
  type ShutdownHandle,
} from "./server/shutdown.js";

// --- Das Register ---------------------------------------------------------------------

export { TOOL_BY_NAME, TOOL_BY_SPEC_PATH, TOOL_ENTRIES } from "./registry/index.generated.js";

export {
  READ_ONLY_TOOL_CLASS,
  TOOL_CLASSES,
  TOOL_EFFECTS,
  type ToolClassAnnotations,
  type ToolClassDefinition,
  type ToolEffectDefinition,
} from "./registry/classes.js";

export type {
  ContractFieldType,
  CrossCheckId,
  DescriptionTier,
  DuplicateSpec,
  FieldSpec,
  MandatorySentenceId,
  PathSpec,
  ResponseContract,
  SchemaFragment,
  ToolClass,
  ToolEffect,
  ToolEntry,
  VerifySpec,
} from "./registry/types.js";

// --- Konfiguration --------------------------------------------------------------------

export {
  getConfig,
  initConfig,
  isConfigLoaded,
  loadConfigOrExit,
  resolveConfig,
  ConfigError,
  type ResolvedConfig,
  type ResolvedCredentials,
  type ResolveOptions,
  type ResolveOutcome,
} from "./config/resolve.js";

// --- Version --------------------------------------------------------------------------

export { PACKAGE_NAME, SERVER_INFO, VERSION } from "./generated/version.js";
