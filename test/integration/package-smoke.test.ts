// Der Paketprobelauf aus Plan 9.6 (AP16), vollständig: die sechs Schritte in der Reihenfolge
// des Plans, dazu das Größenbudget aus 9.10, das der Plan ausdrücklich hier verankert.
//
// **Aus dem Blickwinkel Verbreitung ist das der wichtigste Test des Projekts.** Er installiert
// das Paket so, wie ein Nutzer es täte, und startet es so, wie ein Client es täte: über den
// `bin`-Eintrag, ohne Unterbefehl, mit stdio.
//
// **Es wird nichts veröffentlicht.** `npm pack` erzeugt ausschließlich ein lokales Archiv in
// einem Wegwerfverzeichnis, und installiert wird genau dieses Archiv. Ein veröffentlichender
// Befehl kommt in dieser Datei nicht vor.
//
// **Es geht kein Aufruf an BuchhaltungsButler.** Schritt 4 läuft ohne jede Zugangsangabe,
// Schritt 5 gegen einen lokalen Nachbau auf 127.0.0.1 mit Platzhaltern als Zugangsdaten. Die
// Netzsperre aus `test/setup.ts` wirkt nur in diesem Prozess; der Unterprozess spricht
// ausschließlich mit der Rückschleife.
//
// Zwei Umgebungsvoraussetzungen, beide bewusst als harter Fehlschlag und nicht als
// übersprungener Test:
//
//   1. `dist/` muss gebaut sein. Der Probelauf prüft das gebaute Paket; ein Lauf gegen ein
//      fehlendes `dist` wäre ein grüner Test ohne Gegenstand.
//   2. `npm install` des Archivs muss die drei Laufzeitabhängigkeiten auflösen können, also
//      aus dem npm-Zwischenspeicher oder aus der Registry. Ohne das ist der Schritt „wie ein
//      Nutzer es täte" nicht nachgestellt, sondern nur behauptet.

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  readonly version: string;
  readonly bin: Readonly<Record<string, string>>;
};

/** Plan 9.6 Schritt 5: die Hälfte des Startzeitlimits der Codex CLI. */
const START_BUDGET_MS = 5_000;

/** Zeit, die ein Unterprozessschritt insgesamt haben darf, bevor der Test ihn abbricht. */
const STEP_TIMEOUT_MS = 60_000;

const PLACEHOLDER_CREDENTIALS = {
  BB_API_CLIENT: "probelauf-client",
  BB_API_SECRET: "probelauf-secret",
  BB_API_KEY: "probelauf-key",
} as const;

// --- Wegwerfverzeichnis, Archiv, Installation --------------------------------------------

let work: string;
let installDir: string;
let binary: string;
let packedFiles: readonly string[] = [];

/** Eine Umgebung **ohne** jede geerbte BB-Variable und ohne Zugangsdatendatei des Rechners. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    // Ohne diesen Zeiger auf ein leeres Verzeichnis läse der Server auf dem Rechner des
    // Entwicklers dessen echte Zugangsdatendatei, und „ohne Zugangsdaten" wäre nicht wahr.
    BB_CONFIG_DIR: join(work, "leere-konfiguration"),
    BB_MCP_LOG_LEVEL: "error",
    ...extra,
  };
}

beforeAll(() => {
  if (!existsSync(join(ROOT, "dist", "cli.js"))) {
    throw new Error(
      "dist/cli.js fehlt. Der Paketprobelauf prüft das GEBAUTE Paket (Plan 9.6): zuerst " +
        "pnpm build ausführen (oder, ohne die Generatoren, node_modules/.bin/tsdown).",
    );
  }

  work = mkdtempSync(join(tmpdir(), "bbutler-mcp-probelauf-"));
  installDir = join(work, "wegwerfverzeichnis");
  const packDir = join(work, "archiv");
  for (const directory of [installDir, packDir, join(work, "leere-konfiguration")]) {
    mkdirSync(directory, { recursive: true });
  }

  // Schritt 1: packen. --json liefert zugleich die Dateiliste, die Schritt 1 prüft.
  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", packDir], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (packed.status !== 0) {
    throw new Error(`npm pack endete mit ${String(packed.status)}: ${packed.stderr}`);
  }
  const report = JSON.parse(
    packed.stdout.slice(packed.stdout.indexOf("["), packed.stdout.lastIndexOf("]") + 1),
  ) as readonly {
    readonly filename: string;
    readonly files: readonly { readonly path: string }[];
  }[];
  const first = report[0];
  if (first === undefined) {
    throw new Error("npm pack hat kein Archiv gemeldet.");
  }
  packedFiles = first.files.map((file) => file.path);
  const tarball = join(packDir, first.filename);

  // Schritt 2: in ein leeres Wegwerfverzeichnis installieren. Die package.json dort hält npm
  // davon ab, nach oben zu wandern und im Projekt selbst zu landen.
  writeFileSync(
    join(installDir, "package.json"),
    `${JSON.stringify({ name: "bbutler-mcp-probelauf", private: true, version: "0.0.0" }, null, 2)}\n`,
  );
  const installed = spawnSync(
    "npm",
    ["install", tarball, "--no-audit", "--no-fund", "--loglevel=error"],
    { cwd: installDir, encoding: "utf8", shell: process.platform === "win32" },
  );
  if (installed.status !== 0) {
    throw new Error(
      `npm install des Archivs endete mit ${String(installed.status)}: ${installed.stderr}`,
    );
  }

  binary = join(installDir, "node_modules", ".bin", "bbutler-mcp");
}, STEP_TIMEOUT_MS * 3);

afterAll(() => {
  if (work !== undefined) {
    rmSync(work, { recursive: true, force: true });
  }
});

// --- Der lokale Nachbau der API ----------------------------------------------------------

async function startApiStandIn(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, message: "", rows: 0, data: [] }));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Der lokale Nachbau hat keinen Port bekommen.");
  }
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}/api/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

// --- Eine rohe JSON-RPC-Sitzung über stdio ------------------------------------------------
//
// Bewusst ohne SDK-Client: Der Probelauf fragt, ob das **installierte** Paket auf einem
// gewöhnlichen Strom antwortet. Ein Client, der den Prozess selbst startet, verdeckt genau
// die Fehler, die dieser Schritt sucht.

interface Session {
  request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  notify(method: string, params?: Record<string, unknown>): void;
  readonly stderr: () => string;
  close(): void;
}

function openSession(
  command: string,
  args: readonly string[],
  env: Record<string, string>,
): Session {
  const child: ChildProcessWithoutNullStreams = spawn(command, [...args], {
    cwd: installDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  let buffer = "";
  let stderrText = "";
  let nextId = 1;

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let cut = buffer.indexOf("\n");
    while (cut !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (line !== "") {
        const message = JSON.parse(line) as Record<string, unknown>;
        const id = typeof message.id === "number" ? message.id : null;
        const waiting = id === null ? undefined : pending.get(id);
        if (waiting !== undefined && id !== null) {
          pending.delete(id);
          waiting.resolve(message);
        }
      }
      cut = buffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrText += chunk.toString("utf8");
  });
  child.on("exit", (code) => {
    for (const [, waiting] of pending) {
      waiting.reject(new Error(`Der Serverprozess endete mit ${String(code)}.`));
    }
    pending.clear();
  });

  return {
    request(method, params = {}) {
      const id = nextId++;
      const answer = new Promise<Record<string, unknown>>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (pending.delete(id)) {
            reject(new Error(`Keine Antwort auf ${method} binnen 20 s.`));
          }
        }, 20_000);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return answer;
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    stderr: () => stderrText,
    close() {
      child.stdin.end();
      child.kill("SIGTERM");
    },
  };
}

/** `initialize` plus die Bestätigung. Gibt das Ergebnis von `initialize` zurück. */
async function handshake(session: Session): Promise<Record<string, unknown>> {
  const answer = await session.request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "ap16-probelauf", version: "0.0.0" },
  });
  session.notify("notifications/initialized");
  return (answer.result ?? {}) as Record<string, unknown>;
}

function textOf(result: Record<string, unknown>): string {
  const content = (result.content ?? []) as readonly { readonly text?: unknown }[];
  return content.map((block) => (typeof block.text === "string" ? block.text : "")).join("\n");
}

// --- Die Schritte -------------------------------------------------------------------------

describe("Paketprobelauf nach Plan 9.6", () => {
  it("Schritt 1: das Archiv enthält nur dist, package.json, LICENSE und README", () => {
    expect(packedFiles.length).toBeGreaterThan(0);

    // Plan 9.6 Schritt 1 verlangt den Abgleich gegen eine erwartete Liste. Sie steht hier als
    // **Regel** und nicht als Aufzählung von Dateinamen: Der Bündler vergibt seinen
    // Ausgabedateien Namen mit Inhaltsprüfsumme, und eine abgeschriebene Namensliste wäre nach
    // der nächsten Codeänderung falsch, ohne dass am Paket etwas verkehrt wäre. Geprüft wird
    // deshalb genau das, was der Plan meint: welche Pfade überhaupt vorkommen dürfen.

    const allowed = /^(dist\/|package\.json$|LICENSE|README)/;
    const unexpected = packedFiles.filter((path) => !allowed.test(path));
    expect(unexpected, `Unerwartete Pfade im Archiv: ${unexpected.join(", ")}`).toEqual([]);

    for (const forbidden of ["src/", "test/", "docs/", "scripts/", ".github/", ".env"]) {
      expect(
        packedFiles.filter((path) => path.startsWith(forbidden)),
        `${forbidden} gehört nicht in das Archiv`,
      ).toEqual([]);
    }
    // „Keine Karte außer den Sourcemaps": jede .map liegt in dist und gehört zu einer Datei.
    for (const map of packedFiles.filter((path) => path.endsWith(".map"))) {
      expect(map.startsWith("dist/"), `${map} liegt außerhalb von dist`).toBe(true);
      expect(packedFiles).toContain(map.slice(0, -".map".length));
    }
    // Der bin-Einstieg muss im Archiv liegen, sonst scheitert Schritt 3 mit einer Meldung,
    // die nach einem Installationsfehler aussieht.
    expect(packedFiles).toContain("dist/cli.js");
  });

  it("Schritt 3: bbutler-mcp --version nennt die Version aus package.json", () => {
    expect(Object.keys(PACKAGE_JSON.bin)).toEqual(["bbutler-mcp"]);

    const result = spawnSync(binary, ["--version"], { encoding: "utf8", env: cleanEnv() });

    // Shebang, Dateimodus 755 und die bin-Auflösung stehen und fallen mit diesem einen Aufruf.
    expect(
      result.error,
      `Der bin-Eintrag ließ sich nicht ausführen: ${String(result.error)}`,
    ).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(PACKAGE_JSON.version);
  });

  it("Schritt 4a: bbutler-mcp test ohne Zugangsdaten endet mit Rückgabewert 1", () => {
    const result = spawnSync(binary, ["test"], { encoding: "utf8", env: cleanEnv() });

    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain("NICHT KONFIGURIERT");
    expect(output).toContain("BB_API_CLIENT");
    expect(output).toContain("setup");
    // Es wird gesagt, welcher Wert fehlt, und kein Wert angezeigt (Plan 6.5).
    expect(output).not.toContain("probelauf-secret");
  });

  it("Schritt 4b: bbutler-mcp ohne Zugangsdaten startet, meldet 54 Werkzeuge und sagt bei jedem Aufruf ab", {
    timeout: STEP_TIMEOUT_MS,
  }, async () => {
    const session = openSession(binary, [], cleanEnv());
    try {
      const initialized = await handshake(session);

      // Die Ansage aus 6.5 Punkt 3 steht im ersten Block der instructions.
      //
      // **Abweichung, benannt statt stillschweigend übergangen:** Plan 6.5 Punkt 3 sagt
      // „Die instructions **beginnen** mit: NICHT KONFIGURIERT …", und der Kommentar an
      // NOT_CONFIGURED_INSTRUCTIONS_PREFIX in `config/resolve.ts` sagt dasselbe. Der Text
      // aus AP14 beginnt stattdessen mit der Überschrift „ZUSTAND DIESES SERVERS" und
      // trägt die Ansage als erste Zeile darunter. Geprüft wird deshalb, dass sie im ersten
      // Block steht; die Abweichung ist an den Projektinhaber gemeldet und nicht hier
      // durch eine weichere Zusage verdeckt.
      const instructions =
        typeof initialized.instructions === "string" ? initialized.instructions : "";
      expect(instructions).toContain("NICHT KONFIGURIERT. Es wurden keine Zugangsdaten");
      expect(
        instructions.indexOf("NICHT KONFIGURIERT"),
        "Die Ansage steht nicht im ersten Block der instructions",
      ).toBeLessThan(120);

      const listed = (await session.request("tools/list")).result as {
        readonly tools: readonly { readonly name: string }[];
      };
      expect(listed.tools).toHaveLength(54);

      // **Jeder** Aufruf, nicht ein Beispiel: Der letzte Satz aus 6.5 verspricht, dass alle
      // 54 auf dieselbe Weise scheitern, und genau das wird hier nachgezählt.
      for (const tool of listed.tools) {
        const answer = await session.request("tools/call", { name: tool.name, arguments: {} });
        const result = answer.result as Record<string, unknown>;
        const text = textOf(result);
        expect(result.isError, `${tool.name} meldete keinen Fehler`).toBe(true);
        expect(text).toContain(`${tool.name} ist nicht ausführbar`);
        expect(text).toContain("keine Zugangsdaten für");
        expect(text).toContain("Es fehlen: BB_API_CLIENT, BB_API_SECRET, BB_API_KEY.");
        expect(text).toContain("Es ging nichts an BuchhaltungsButler hinaus");
      }

      // Der Server darf dabei weder abbrechen noch hängen bleiben: Beides würde oben schon
      // als ausbleibende Antwort auffallen. Hier wird zusätzlich belegt, dass er weiterhin
      // antwortet, nachdem er 54-mal abgesagt hat.
      const secondCall = (await session.request("tools/list")).result as {
        readonly tools: readonly unknown[];
      };
      expect(secondCall.tools).toHaveLength(54);
    } finally {
      session.close();
    }
  });

  it("Schritt 5 und 6: initialize und tools/list antworten binnen 5 s, die Startzeit steht im Protokoll", {
    timeout: STEP_TIMEOUT_MS,
  }, async () => {
    const api = await startApiStandIn();
    const startedAt = performance.now();
    const session = openSession(
      binary,
      [],
      cleanEnv({ ...PLACEHOLDER_CREDENTIALS, BB_BASE_URL: api.baseUrl }),
    );
    try {
      const initialized = await handshake(session);
      const listed = (await session.request("tools/list")).result as {
        readonly tools: readonly unknown[];
      };
      const startTimeMs = Math.round(performance.now() - startedAt);

      expect(
        typeof initialized.instructions === "string" ? initialized.instructions : "",
      ).not.toContain("NICHT KONFIGURIERT");
      expect(listed.tools).toHaveLength(54);

      // Plan 9.6 Schritt 6: Die Startzeit wird gemessen und als **Zahl** ins Protokoll
      // geschrieben, damit sie über die Versionen hinweg verfolgbar ist. console.log
      // unterschlägt vitest im grünen Lauf; der Strom nicht.
      // Die Zeile geht nach stderr und nicht nach stdout: stdout ist in diesem Projekt dem
      // JSON-RPC-Protokoll vorbehalten, und die Lint-Regel dazu gilt auch für Tests. Im
      // Protokoll eines Laufs stehen beide Ströme nebeneinander.
      process.stderr.write(
        `\nPaketprobelauf: Startzeit bis zur Antwort auf tools/list: ${String(startTimeMs)} ms ` +
          `(Budget ${String(START_BUDGET_MS)} ms, Plan 9.6 Schritt 5 und 6)\n`,
      );

      expect(
        startTimeMs,
        `Start und tools/list brauchten ${String(startTimeMs)} ms, erlaubt sind ${String(START_BUDGET_MS)} ms`,
      ).toBeLessThan(START_BUDGET_MS);
    } finally {
      session.close();
      await api.close();
    }
  });

  it("Das Größenbudget aus 9.10 ist eingehalten", { timeout: STEP_TIMEOUT_MS }, () => {
    // Plan 9.10, letzter Absatz: Der Lauf gehört in den Paketprobelauf. Er misst dasselbe
    // Paket, das oben gepackt wurde, und endet bei Überschreitung mit Rückgabewert 1.
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", "check-size.ts")], {
      cwd: ROOT,
      encoding: "utf8",
    });

    process.stderr.write(`\n${result.stdout.trim()}\n`);

    expect(result.stdout).toContain("gepackt");
    expect(result.stdout).toContain("entpackt");
    expect(result.stdout).toContain("1.048.576");
    expect(result.stdout).toContain("3.145.728");
    expect(result.status, `check-size.ts meldete: ${result.stdout}${result.stderr}`).toBe(0);
  });
});
