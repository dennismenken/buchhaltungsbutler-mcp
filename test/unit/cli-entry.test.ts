import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VERSION } from "../../src/generated/version.js";

// Die Weiche aus `src/cli.ts` in beiden Richtungen (Plan 8.1, AP15 Punkt 5).
//
// Zwei Nachweise, weil einer allein lückenhaft wäre:
//
// 1. **Verhalten**: Ohne Argument wird `runStdioServer` aufgerufen und `runCli` nicht; mit
//    `doctor` genau umgekehrt. Die Zähler der vi.mock-Fabriken belegen zusätzlich für den
//    **ersten** Fall dieser Datei, dass das CLI-Modul gar nicht erst geladen wurde (eine
//    Fabrik läuft nur beim ersten Import, deshalb steht dieser Fall bewusst oben).
// 2. **Quelltext**: `src/cli.ts` hat weder auf `src/cli/*` noch auf `src/server/*` einen
//    statischen Import. Das ist die Eigenschaft, die über die Lebensdauer der Datei halten
//    muss, und sie ist an der Datei selbst prüfbar.

const loaded = vi.hoisted(() => ({
  serverFactory: 0,
  cliFactory: 0,
  started: 0,
  cliCalls: 0,
  lastArgv: [] as string[],
}));

vi.mock("../../src/server/create-server.js", () => {
  loaded.serverFactory += 1;
  return {
    runStdioServer: () => {
      loaded.started += 1;
      return Promise.resolve({});
    },
  };
});

vi.mock("../../src/cli/run.js", () => {
  loaded.cliFactory += 1;
  return {
    runCli: (argv: readonly string[]) => {
      loaded.cliCalls += 1;
      loaded.lastArgv = [...argv];
      return Promise.resolve(0);
    },
  };
});

const originalArgv = process.argv;

async function runEntry(args: readonly string[]): Promise<void> {
  process.argv = ["node", "/pfad/dist/cli.js", ...args];
  vi.resetModules();
  loaded.started = 0;
  loaded.cliCalls = 0;
  loaded.lastArgv = [];
  process.exitCode = undefined;
  await import("../../src/cli.js");
}

// Der Zugriff läuft über `globalThis.process`, nicht über `process`: Die ESLint-Regel, die
// stdout im Servercode verbietet, ist nur für src/cli* gelockert. Hier wird nichts
// ausgegeben — die Ausgabe wird abgefangen, damit `--version` prüfbar ist.
const streams = globalThis.process;
let writtenToStdout: string[] = [];

beforeEach(() => {
  writtenToStdout = [];
  vi.spyOn(streams.stdout, "write").mockImplementation((chunk: unknown) => {
    writtenToStdout.push(String(chunk));
    return true;
  });
  vi.spyOn(streams.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = originalArgv;
  process.exitCode = undefined;
});

describe("src/cli.ts", () => {
  it("startet ohne Argument den Server und lädt keine Zeile CLI-Code", async () => {
    // Muss der erste Fall dieser Datei bleiben: Nur hier sind die Fabrikzähler noch frisch.
    expect(loaded.cliFactory).toBe(0);

    await runEntry([]);

    expect(loaded.started).toBe(1);
    expect(loaded.serverFactory).toBe(1);
    expect(loaded.cliFactory).toBe(0);
    expect(loaded.cliCalls).toBe(0);
    // Der Prozess läuft weiter: Ein Rückgabewert wäre das Ende der MCP-Verbindung.
    expect(process.exitCode).toBeUndefined();
  });

  it("lädt mit doctor die CLI und baut keinen Server", async () => {
    await runEntry(["doctor"]);

    expect(loaded.cliCalls).toBe(1);
    expect(loaded.lastArgv).toEqual(["doctor"]);
    expect(loaded.started).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it("reicht alle Argumente eines Unterbefehls weiter", async () => {
    await runEntry(["print-config", "--client", "cursor"]);

    expect(loaded.lastArgv).toEqual(["print-config", "--client", "cursor"]);
    expect(loaded.started).toBe(0);
  });

  it("gibt --version aus src/generated/version.ts aus, ohne Server und ohne CLI", async () => {
    await runEntry(["--version"]);

    expect(writtenToStdout).toEqual([`${VERSION}\n`]);
    expect(loaded.started).toBe(0);
    expect(loaded.cliCalls).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it("führt --help über die CLI, nicht über den Server", async () => {
    await runEntry(["--help"]);

    expect(loaded.cliCalls).toBe(1);
    expect(loaded.lastArgv).toEqual(["--help"]);
    expect(loaded.started).toBe(0);
  });

  it("hat keinen statischen Import auf den Server oder auf die CLI", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf8");
    const staticImports = [...source.matchAll(/^import[^\n]*from\s+"([^"]+)"/gm)].map(
      (match) => match[1] ?? "",
    );

    expect(staticImports).toEqual(["./generated/version.js"]);
    expect(source).toContain('await import("./server/create-server.js")');
    expect(source).toContain('await import("./cli/run.js")');
  });
});
