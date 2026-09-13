import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isInsideDirectory, readLocalFile, supportsNoFollow } from "../../src/upload/local-file.js";
import { UploadSourceError } from "../../src/upload/sniff.js";

// Alle Dateien dieser Tests entstehen in einem Wegwerfverzeichnis und tragen erfundenen
// Inhalt. Es wird nichts aus dem echten Dateisystem gelesen.

const PDF = Buffer.from("%PDF-1.7\n% erfundener Testbeleg\n", "ascii");

let root = "";
let allowedDir = "";
let forbiddenDir = "";
let receipt = "";

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "bbmcp-upload-")));
  allowedDir = path.join(root, "erlaubt");
  forbiddenDir = path.join(root, "verboten");
  await fs.mkdir(allowedDir);
  await fs.mkdir(forbiddenDir);
  receipt = path.join(allowedDir, "rechnung.pdf");
  await fs.writeFile(receipt, PDF);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function options(dirs: readonly string[], maxBytes = 1024 * 1024) {
  return { allowedDirs: dirs, maxBytes };
}

async function reasonOf(promise: Promise<unknown>): Promise<UploadSourceError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UploadSourceError);
    return error as UploadSourceError;
  }
  throw new Error("Der Aufruf hätte scheitern müssen, war aber erfolgreich.");
}

/**
 * Prüft die Kernzusage aus AP13: In keiner Meldung steht ein Dateisystempfad. Übrig bleiben
 * dürfen nur die Schemabeispiele, die hier namentlich abgezogen werden.
 */
function expectNoFilesystemPath(message: string): void {
  expect(message).not.toContain(root);
  expect(message).not.toContain(allowedDir);
  expect(message).not.toContain(forbiddenDir);
  expect(message).not.toContain(path.basename(receipt));
  expect(message).not.toContain(os.tmpdir());

  const withoutExamples = message
    .replaceAll("file:///verzeichnis/datei.pdf", "")
    .replaceAll("file://", "")
    .replaceAll("https://", "")
    .replaceAll("http://", "");
  expect(withoutExamples).not.toContain("/");
}

describe("readLocalFile, erlaubter Fall", () => {
  it("liest eine Datei aus einem freigegebenen Verzeichnis", async () => {
    const result = await readLocalFile(pathToFileURL(receipt), options([allowedDir]));
    expect(Buffer.from(result.bytes).equals(PDF)).toBe(true);
    expect(result.nameHint).toBe("rechnung.pdf");
  });

  it("liest auch aus einem Unterverzeichnis des freigegebenen Verzeichnisses", async () => {
    const subDir = path.join(allowedDir, "2024", "q1");
    await fs.mkdir(subDir, { recursive: true });
    const file = path.join(subDir, "beleg.pdf");
    await fs.writeFile(file, PDF);
    const result = await readLocalFile(pathToFileURL(file), options([allowedDir]));
    expect(result.bytes.byteLength).toBe(PDF.byteLength);
  });

  it("folgt einer Verknüpfung, deren Ziel selbst freigegeben ist", async () => {
    const link = path.join(allowedDir, "aktuell.pdf");
    await fs.symlink(receipt, link);
    const result = await readLocalFile(pathToFileURL(link), options([allowedDir]));
    expect(result.bytes.byteLength).toBe(PDF.byteLength);
    // Der Namensvorschlag kommt vom aufgelösten Ziel, nicht von der Verknüpfung.
    expect(result.nameHint).toBe("rechnung.pdf");
  });

  it("führt O_NOFOLLOW auf dieser Plattform", () => {
    // Unter Windows fehlt die Konstante; dort tragen realpath und der Kennungsabgleich.
    expect(supportsNoFollow()).toBe(process.platform !== "win32");
  });
});

describe("readLocalFile, Absagen", () => {
  it("liest ohne BB_MCP_UPLOAD_DIRS gar nichts", async () => {
    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([])));
    expect(error.reason).toBe("file-disabled");
    expect(error.message).toContain("BB_MCP_UPLOAD_DIRS");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt eine Datei außerhalb der freigegebenen Verzeichnisse ab", async () => {
    const outsideFile = path.join(forbiddenDir, "fremd.pdf");
    await fs.writeFile(outsideFile, PDF);
    const error = await reasonOf(readLocalFile(pathToFileURL(outsideFile), options([allowedDir])));
    expect(error.reason).toBe("file-outside-allowed-dirs");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt ein Nachbarverzeichnis mit gleichem Namensanfang ab", async () => {
    // "erlaubt-nicht" beginnt mit "erlaubt", liegt aber nicht darin.
    const sibling = `${allowedDir}-nicht`;
    await fs.mkdir(sibling);
    const file = path.join(sibling, "beleg.pdf");
    await fs.writeFile(file, PDF);
    const error = await reasonOf(readLocalFile(pathToFileURL(file), options([allowedDir])));
    expect(error.reason).toBe("file-outside-allowed-dirs");
  });

  it("folgt keiner Verknüpfung aus dem freigegebenen Verzeichnis heraus", async () => {
    const target = path.join(forbiddenDir, "geheim.pdf");
    await fs.writeFile(target, PDF);
    const link = path.join(allowedDir, "harmlos.pdf");
    await fs.symlink(target, link);
    const error = await reasonOf(readLocalFile(pathToFileURL(link), options([allowedDir])));
    expect(error.reason).toBe("file-outside-allowed-dirs");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt einen Pfad mit .. ab, der aus dem Verzeichnis herausführt", async () => {
    const target = path.join(forbiddenDir, "geheim.pdf");
    await fs.writeFile(target, PDF);
    const url = pathToFileURL(path.join(allowedDir, "..", "verboten", "geheim.pdf"));
    const error = await reasonOf(readLocalFile(url, options([allowedDir])));
    expect(error.reason).toBe("file-outside-allowed-dirs");
  });

  it("meldet eine fehlende Datei ohne Pfad", async () => {
    const url = pathToFileURL(path.join(allowedDir, "gibtesnicht.pdf"));
    const error = await reasonOf(readLocalFile(url, options([allowedDir])));
    expect(error.reason).toBe("file-not-found");
    expectNoFilesystemPath(error.message);
  });

  it("meldet eine Verknüpfung ins Leere als fehlende Datei", async () => {
    const link = path.join(allowedDir, "kaputt.pdf");
    await fs.symlink(path.join(allowedDir, "gibtesnicht.pdf"), link);
    const error = await reasonOf(readLocalFile(pathToFileURL(link), options([allowedDir])));
    expect(error.reason).toBe("file-not-found");
  });

  it("liest kein Verzeichnis", async () => {
    const error = await reasonOf(readLocalFile(pathToFileURL(allowedDir), options([allowedDir])));
    // Das Verzeichnis selbst liegt nicht *in* sich; die Absage kommt schon aus der
    // Enthaltenseinsprüfung.
    expect(error.reason).toBe("file-outside-allowed-dirs");

    const subDir = path.join(allowedDir, "ordner");
    await fs.mkdir(subDir);
    const second = await reasonOf(readLocalFile(pathToFileURL(subDir), options([allowedDir])));
    expect(second.reason).toBe("file-not-regular");
    expectNoFilesystemPath(second.message);
  });

  it("lehnt eine leere Datei ab", async () => {
    const emptyFile = path.join(allowedDir, "leer.pdf");
    await fs.writeFile(emptyFile, "");
    const error = await reasonOf(readLocalFile(pathToFileURL(emptyFile), options([allowedDir])));
    expect(error.reason).toBe("file-empty");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt eine Datei über der Grenze ab und nennt die Grenze als eigene Annahme", async () => {
    const oversized = path.join(allowedDir, "oversized.pdf");
    await fs.writeFile(oversized, Buffer.alloc(2048, 0x41));
    // 2048 Bytes gegen eine Grenze von 1024 Bytes.
    const error = await reasonOf(
      readLocalFile(pathToFileURL(oversized), options([allowedDir], 1024)),
    );
    expect(error.reason).toBe("too-large");
    expect(error.message).toContain("Annahme");
    expectNoFilesystemPath(error.message);

    // Unterhalb der Grenze liest derselbe Aufruf die Datei.
    const inside = await readLocalFile(pathToFileURL(oversized), options([allowedDir], 4096));
    expect(inside.bytes.byteLength).toBe(2048);
  });

  it("meldet einen Einrichtungsfehler, wenn kein freigegebenes Verzeichnis existiert", async () => {
    const error = await reasonOf(
      readLocalFile(pathToFileURL(receipt), options([path.join(root, "gibtesnicht")])),
    );
    expect(error.reason).toBe("file-dirs-unusable");
    expectNoFilesystemPath(error.message);
  });

  it("überspringt einen Eintrag aus BB_MCP_UPLOAD_DIRS, der kein Verzeichnis ist", async () => {
    const notADirectory = path.join(root, "liste.txt");
    await fs.writeFile(notADirectory, "erfundener Inhalt");
    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([notADirectory])));
    expect(error.reason).toBe("file-dirs-unusable");
    expectNoFilesystemPath(error.message);
  });

  it("meldet eine nicht lesbare Datei ohne Pfad", async () => {
    const withoutPermissions = path.join(allowedDir, "gesperrt.pdf");
    await fs.writeFile(withoutPermissions, PDF);
    await fs.chmod(withoutPermissions, 0o000);
    if (process.platform === "win32" || process.getuid?.() === 0) {
      // Unter Windows und als Systemverwalter greifen Dateirechte nicht wie hier erwartet.
      return;
    }
    const error = await reasonOf(
      readLocalFile(pathToFileURL(withoutPermissions), options([allowedDir])),
    );
    expect(error.reason).toBe("file-unreadable");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt eine file-Adresse mit fremdem Rechnernamen ab", async () => {
    const error = await reasonOf(
      readLocalFile(new URL("file://fremder-rechner/erlaubt/rechnung.pdf"), options([allowedDir])),
    );
    expect(error.reason).toBe("file-invalid-url");
    expectNoFilesystemPath(error.message);
  });
});

describe("isInsideDirectory", () => {
  it("zählt die Trennzeichengrenze mit", () => {
    expect(isInsideDirectory("/a/b/c.pdf", "/a/b")).toBe(true);
    expect(isInsideDirectory("/a/bc/d.pdf", "/a/b")).toBe(false);
    expect(isInsideDirectory("/a/b", "/a/b")).toBe(false);
    expect(isInsideDirectory("/a/b/../c.pdf", "/a/b")).toBe(false);
  });
});

// --- Die Fehlerübersetzung des Dateisystems ---------------------------------------------
//
// `readLocalFile` übersetzt die Fehlercodes des Betriebssystems in benannte Absagen. Ein Teil
// davon lässt sich am echten Dateisystem herbeiführen; der Rest nicht, weil er entweder eine
// Wettlaufbedingung ist (die Datei wird zwischen `realpath` und dem Öffnen ausgetauscht) oder
// plattformabhängig (Linux meldet beim Öffnen eines Verzeichnisses EISDIR, macOS nicht).
//
// Für genau diese Fälle wird der Aufruf an `node:fs/promises` ersetzt. Ersetzt wird **nur der
// eine Aufruf**, um den es geht: Die Auflösung der freigegebenen Verzeichnisse läuft weiter
// gegen das echte Dateisystem, und die Prüfreihenfolge des Moduls bleibt damit unangetastet.

/** Ein Fehler des Betriebssystems mit gesetztem oder bewusst fehlendem `code`. */
function errnoError(code: string | undefined): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error("erfundener Fehler des Dateisystems");
  if (code !== undefined) {
    error.code = code;
  }
  return error;
}

/** Lässt `fs.realpath` nur für den angegebenen Pfad scheitern. */
function realpathFailsFor(target: string, thrown: unknown): void {
  const real = fs.realpath.bind(fs);
  vi.spyOn(fs, "realpath").mockImplementation(async (input: Parameters<typeof fs.realpath>[0]) => {
    if (String(input) === target) {
      throw thrown;
    }
    return real(input);
  });
}

/** Lässt `fs.open` scheitern. Aufgerufen wird es im Modul genau einmal. */
function openFailsWith(thrown: unknown): void {
  vi.spyOn(fs, "open").mockRejectedValue(thrown);
}

/**
 * Ersetzt `fs.open` durch einen Griff, der auf derselben echten Datei arbeitet, in `stat()`
 * aber eine abweichende Größe meldet. Damit ist genau der Fall nachstellbar, gegen den
 * `readAll` sichert: Die Datei wächst zwischen `fstat` und dem Lesen.
 */
function openReportingSize(reportedSize: number, options: { closeFails?: boolean } = {}): void {
  const real = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(
    async (filePath: Parameters<typeof fs.open>[0], flags) => {
      const handle = await real(filePath, flags);
      const realStats = await handle.stat();
      const replacement = {
        stat: () =>
          Promise.resolve({
            ...realStats,
            isFile: () => realStats.isFile(),
            dev: realStats.dev,
            ino: realStats.ino,
            size: reportedSize,
          }),
        read: (...args: Parameters<typeof handle.read>) => handle.read(...args),
        close: async (): Promise<void> => {
          await handle.close();
          if (options.closeFails === true) {
            // Das Modul verschluckt einen Fehler beim Schließen bewusst: Er darf ein
            // erfolgreiches Lesen nicht nachträglich zu einer Absage machen.
            throw errnoError("EIO");
          }
        },
      };
      return replacement as unknown as Awaited<ReturnType<typeof fs.open>>;
    },
  );
}

describe("readLocalFile, Fehler des Dateisystems", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("meldet einen Pfadbestandteil, der gar kein Verzeichnis ist, als fehlende Datei", async () => {
    // rechnung.pdf ist eine Datei; ein Bestandteil dahinter kann nicht existieren.
    const impossible = path.join(receipt, "weiter.pdf");
    const error = await reasonOf(readLocalFile(pathToFileURL(impossible), options([allowedDir])));
    expect(error.reason).toBe("file-not-found");
    expectNoFilesystemPath(error.message);
  });

  it("meldet eine Kette von Verknüpfungen, die sich nicht auflöst", async () => {
    const ringA = path.join(allowedDir, "ring-a");
    const ringB = path.join(allowedDir, "ring-b");
    await fs.symlink(ringB, ringA);
    await fs.symlink(ringA, ringB);

    const error = await reasonOf(readLocalFile(pathToFileURL(ringA), options([allowedDir])));
    expect(error.reason).toBe("file-symlink");
    expectNoFilesystemPath(error.message);
  });

  it("nennt einen unbekannten Fehlercode beim Auflösen, ohne den Pfad zu nennen", async () => {
    realpathFailsFor(receipt, errnoError("EIO"));
    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(error.reason).toBe("file-unreadable");
    expect(error.message).toContain("(EIO)");
    expectNoFilesystemPath(error.message);
  });

  it("kommt beim Auflösen auch ohne Fehlercode zurecht", async () => {
    realpathFailsFor(receipt, errnoError(undefined));
    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(error.reason).toBe("file-unreadable");
    expect(error.message).not.toContain("(");
    expectNoFilesystemPath(error.message);
  });

  it("kommt beim Auflösen auch mit etwas zurecht, das keine Ausnahme ist", async () => {
    realpathFailsFor(receipt, "das Dateisystem hat etwas Fremdes geworfen");
    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(error.reason).toBe("file-unreadable");
    expect(error.message).not.toContain("Fremdes");
    expectNoFilesystemPath(error.message);
  });

  it.each([
    ["ELOOP", "file-symlink"],
    ["EMLINK", "file-symlink"],
    ["ENOENT", "file-not-found"],
    ["EACCES", "file-unreadable"],
    ["EPERM", "file-unreadable"],
    ["EISDIR", "file-not-regular"],
  ])("übersetzt %s beim Öffnen in %s", async (code, reason) => {
    openFailsWith(errnoError(code));
    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(error.reason).toBe(reason);
    expectNoFilesystemPath(error.message);
  });

  it("nennt einen unbekannten Fehlercode beim Öffnen und kommt ohne ihn aus", async () => {
    openFailsWith(errnoError("ENOSPC"));
    const withCode = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(withCode.reason).toBe("file-unreadable");
    expect(withCode.message).toContain("(ENOSPC)");
    expectNoFilesystemPath(withCode.message);

    vi.restoreAllMocks();
    openFailsWith(errnoError(undefined));
    const withoutCode = await reasonOf(
      readLocalFile(pathToFileURL(receipt), options([allowedDir])),
    );
    expect(withoutCode.reason).toBe("file-unreadable");
    expect(withoutCode.message).not.toContain("(");
    expectNoFilesystemPath(withoutCode.message);
  });

  it("bricht ab, wenn die Datei zwischen Prüfung und Öffnen ausgetauscht wurde", async () => {
    const realLstat = fs.lstat.bind(fs);
    vi.spyOn(fs, "lstat").mockImplementation(async (input: Parameters<typeof fs.lstat>[0]) => {
      const stats = await realLstat(input);
      // Dieselbe Platte, ein anderer Inode: genau das Kennzeichen eines Austauschs.
      Object.defineProperty(stats, "ino", { value: Number(stats.ino) + 1 });
      return stats;
    });

    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(error.reason).toBe("file-changed");
    expect(error.message).toContain("nichts hochgeladen");
    expectNoFilesystemPath(error.message);
  });

  it("erkennt einen Austausch auch an einer abweichenden Gerätekennung", async () => {
    const realLstat = fs.lstat.bind(fs);
    vi.spyOn(fs, "lstat").mockImplementation(async (input: Parameters<typeof fs.lstat>[0]) => {
      const stats = await realLstat(input);
      Object.defineProperty(stats, "dev", { value: stats.dev + 1 });
      return stats;
    });

    const error = await reasonOf(readLocalFile(pathToFileURL(receipt), options([allowedDir])));
    expect(error.reason).toBe("file-changed");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt eine Datei ab, die nach dem fstat über die Grenze gewachsen ist", async () => {
    const limit = 32;
    const grownFile = path.join(allowedDir, "gewachsen.pdf");
    await fs.writeFile(grownFile, Buffer.alloc(limit * 4, 0x41));
    // Der fstat meldet genau die Grenze; die Prüfung auf stat.size lässt das durch. Erst das
    // Lesen stellt fest, dass mehr da ist.
    openReportingSize(limit);

    const error = await reasonOf(
      readLocalFile(pathToFileURL(grownFile), options([allowedDir], limit)),
    );
    expect(error.reason).toBe("too-large");
    expectNoFilesystemPath(error.message);
  });

  it("lehnt eine Datei ab, die trotz gemeldeter Größe nichts liefert", async () => {
    const emptyFile = path.join(allowedDir, "leer-geworden.pdf");
    await fs.writeFile(emptyFile, "");
    openReportingSize(64);

    const error = await reasonOf(readLocalFile(pathToFileURL(emptyFile), options([allowedDir])));
    expect(error.reason).toBe("file-empty");
    expectNoFilesystemPath(error.message);
  });

  it("liefert die Bytes auch dann, wenn das Schließen des Deskriptors scheitert", async () => {
    openReportingSize(PDF.byteLength, { closeFails: true });

    const result = await readLocalFile(pathToFileURL(receipt), options([allowedDir]));
    expect(Buffer.from(result.bytes).equals(PDF)).toBe(true);
    expect(result.nameHint).toBe("rechnung.pdf");
  });
});
