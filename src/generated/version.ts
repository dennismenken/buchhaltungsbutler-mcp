// ERZEUGT von scripts/gen-version.ts aus package.json. NICHT VON HAND ÄNDERN.
// Änderungen entstehen ausschließlich über `pnpm generate`; der CI-Schritt verlangt danach
// eine leere git-Differenz.
//
// Diese Datei ist der einzige Weg, auf dem die Paketversion zur Laufzeit bekannt wird.
// Es wird bewusst kein JSON gelesen und package.json nicht importiert.

/** Der Paketname aus package.json, wörtlich. */
export const PACKAGE_NAME = "@dennismenken/buchhaltungsbutler-mcp";

/** Die Paketversion aus package.json, wörtlich. */
export const VERSION = "0.1.1";

/** Name und Version in der Form, die der MCP-Server bei `initialize` meldet. */
export const SERVER_INFO = {
  name: PACKAGE_NAME,
  version: VERSION,
} as const;
