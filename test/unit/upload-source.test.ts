import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSecrets } from "../../src/config/redact.js";
import { initConfig, resetConfigForTests } from "../../src/config/resolve.js";
import { resetLoggingForTests } from "../../src/logging/stderr.js";
import {
  MAX_UPLOAD_BYTES,
  resolveUploadSource,
  UploadSourceError,
  type UploadConfig,
} from "../../src/upload/source.js";
import type { RemoteFetch, RemoteResponse } from "../../src/upload/ssrf.js";

// Alle Inhalte, Adressen und Dateinamen dieser Tests sind erfunden. Es geht kein echter
// Netzaufruf hinaus; der Abrufer wird eingespeist.

const PDF = Buffer.from("%PDF-1.7\n% erfundener Testbeleg\n", "ascii");
const PDF_BASE64 = PDF.toString("base64");
const HTML = Buffer.from("<!DOCTYPE html><html><body>Bitte anmelden</body></html>", "ascii");

let root = "";
let allowedDir = "";
let receiptPath = "";

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "bbmcp-source-")));
  allowedDir = path.join(root, "belege");
  await fs.mkdir(allowedDir);
  receiptPath = path.join(allowedDir, "rechnung.pdf");
  await fs.writeFile(receiptPath, PDF);
  resetConfigForTests();
  resetLoggingForTests();
  clearSecrets();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
  resetConfigForTests();
  resetLoggingForTests();
  clearSecrets();
});

function config(overrides: Partial<UploadConfig> = {}): UploadConfig {
  return { uploadDirs: [], uploadFromUrl: false, timeoutMs: 30_000, ...overrides };
}

function respondWith(body: Buffer, headers: Record<string, string> = {}): RemoteFetch {
  return () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(body));
        controller.close();
      },
    });
    const heads = new Headers(headers);
    const response: RemoteResponse = {
      status: 200,
      headers: { get: (name: string) => heads.get(name) },
      body: stream,
    };
    return Promise.resolve(response);
  };
}

async function failing(promise: Promise<unknown>): Promise<UploadSourceError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UploadSourceError);
    return error as UploadSourceError;
  }
  throw new Error("Der Aufruf hätte scheitern müssen, war aber erfolgreich.");
}

describe("base64, die Vorgabe ohne jeden Schalter", () => {
  it("nimmt base64 an, auch wenn beide Schalter aus sind", async () => {
    const payload = await resolveUploadSource(
      { source: PDF_BASE64, fileName: "rechnung.pdf" },
      { config: config() },
    );
    expect(payload.origin).toBe("base64");
    expect(payload.mediaType).toBe("application/pdf");
    expect(payload.fileName).toBe("rechnung.pdf");
    expect(payload.byteLength).toBe(PDF.byteLength);
    expect(Buffer.from(payload.base64, "base64").equals(PDF)).toBe(true);
  });

  it("verträgt Zeilenumbrüche und die base64url-Schreibweise", async () => {
    const wrapped = PDF_BASE64.replace(/(.{12})/g, "$1\n");
    const payload = await resolveUploadSource({ source: wrapped }, { config: config() });
    expect(Buffer.from(payload.base64, "base64").equals(PDF)).toBe(true);

    const urlform = Buffer.from([0xff, 0xd8, 0xff, 0xfb, 0xff, 0xbf])
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const jpeg = await resolveUploadSource({ source: urlform }, { config: config() });
    expect(jpeg.mediaType).toBe("image/jpeg");
  });

  it("setzt einen Dateinamen, wenn keiner übergeben wurde", async () => {
    const payload = await resolveUploadSource({ source: PDF_BASE64 }, { config: config() });
    // Die API verlangt bei base64 einen Namen (error_code 33); geraten wird er nicht, aber
    // ein neutraler Name mit der richtigen Endung ist besser als eine Absage.
    expect(payload.fileName).toBe("beleg.pdf");
  });

  it("bereinigt einen übergebenen Namen mit Pfadanteil und Steuerzeichen", async () => {
    const payload = await resolveUploadSource(
      { source: PDF_BASE64, fileName: "/erfunden/ordner/rech\u202Enung\u0007.pdf" },
      { config: config() },
    );
    expect(payload.fileName).toBe("rechnung.pdf");
  });

  it("nimmt eine data-Adresse mit base64-Nutzlast an", async () => {
    const payload = await resolveUploadSource(
      { source: `data:application/pdf;base64,${PDF_BASE64}` },
      { config: config() },
    );
    expect(payload.origin).toBe("base64");
    expect(payload.mediaType).toBe("application/pdf");
  });

  it("lehnt eine data-Adresse ohne base64-Nutzlast ab", async () => {
    const error = await failing(
      resolveUploadSource({ source: "data:text/plain,Guten%20Tag" }, { config: config() }),
    );
    expect(error.reason).toBe("unknown-scheme");
  });

  it("lehnt einen leeren Wert ab", async () => {
    const error = await failing(resolveUploadSource({ source: "   " }, { config: config() }));
    expect(error.reason).toBe("empty-source");
  });

  it("lehnt ab, was kein base64 ist, statt Bytesalat zu erzeugen", async () => {
    const error = await failing(
      resolveUploadSource({ source: "das ist kein base64!!" }, { config: config() }),
    );
    expect(error.reason).toBe("invalid-base64");
  });

  it("lehnt einen abgeschnittenen base64-Block ab", async () => {
    const error = await failing(
      resolveUploadSource({ source: `${PDF_BASE64}A` }, { config: config() }),
    );
    expect(error.reason).toBe("invalid-base64");
  });

  it("lehnt einen Inhalt ab, den die API nicht annimmt", async () => {
    const error = await failing(
      resolveUploadSource(
        { source: HTML.toString("base64"), fileName: "rechnung.pdf" },
        { config: config() },
      ),
    );
    expect(error.reason).toBe("type-not-detected");
    // Der gemeldete Name behauptet ein PDF; entschieden haben die Magic Bytes.
    expect(error.message).toContain("application/pdf");
  });

  it("lehnt einen Inhalt über der Grenze ab, bevor er zweimal im Speicher steht", async () => {
    const error = await failing(
      resolveUploadSource({ source: PDF_BASE64 }, { config: config(), maxBytes: 8 }),
    );
    expect(error.reason).toBe("too-large");
  });

  it("führt eine Grenze von 10 MB als eigene Annahme", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("https:// nur mit BB_MCP_UPLOAD_FROM_URL", () => {
  it("ruft ohne Schalter keine Adresse ab", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(respondWith(PDF));
    const error = await failing(
      resolveUploadSource(
        { source: "https://beispiel.invalid/rechnung.pdf" },
        { config: config({ uploadFromUrl: false }), fetchImpl },
      ),
    );
    expect(error.reason).toBe("url-disabled");
    expect(error.message).toContain("BB_MCP_UPLOAD_FROM_URL");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holt die Datei mit Schalter und bestimmt den Typ aus dem Inhalt", async () => {
    const payload = await resolveUploadSource(
      { source: "https://beispiel.invalid/unterlagen/rechnung.pdf" },
      {
        config: config({ uploadFromUrl: true }),
        // Der gemeldete Content-Type behauptet etwas anderes als der Inhalt; entscheidend ist
        // der Inhalt.
        fetchImpl: respondWith(PDF, { "content-type": "application/octet-stream" }),
        dnsLookup: () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
      },
    );
    expect(payload.origin).toBe("url");
    expect(payload.mediaType).toBe("application/pdf");
    expect(payload.fileName).toBe("rechnung.pdf");
  });

  it("bereinigt den Namen aus Content-Disposition und lässt das Argument vorgehen", async () => {
    // Der Header kommt als Bytefolge an; die Steuerzeichen stecken in der Prozentkodierung
    // von filename*, genau wie ein Angreifer sie schicken würde.
    const fetchImpl = respondWith(PDF, {
      "content-disposition": "attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpas%E2%80%AEswd",
    });
    const lookup = () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

    const fromHeader = await resolveUploadSource(
      { source: "https://beispiel.invalid/b" },
      { config: config({ uploadFromUrl: true }), fetchImpl, dnsLookup: lookup },
    );
    expect(fromHeader.fileName).toBe("passwd.pdf");

    const fromArgument = await resolveUploadSource(
      { source: "https://beispiel.invalid/b", fileName: "eingang-2024-03.pdf" },
      { config: config({ uploadFromUrl: true }), fetchImpl, dnsLookup: lookup },
    );
    expect(fromArgument.fileName).toBe("eingang-2024-03.pdf");
  });

  it("lehnt eine HTML-Seite hinter der Adresse ab", async () => {
    const error = await failing(
      resolveUploadSource(
        { source: "https://beispiel.invalid/rechnung.pdf" },
        {
          config: config({ uploadFromUrl: true }),
          fetchImpl: respondWith(HTML, { "content-type": "application/pdf" }),
          dnsLookup: () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
        },
      ),
    );
    expect(error.reason).toBe("type-not-detected");
  });

  it("lehnt http auch mit gesetztem Schalter ab", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(respondWith(PDF));
    const error = await failing(
      resolveUploadSource(
        { source: "http://beispiel.invalid/rechnung.pdf" },
        { config: config({ uploadFromUrl: true }), fetchImpl },
      ),
    );
    expect(error.reason).toBe("url-insecure-scheme");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lehnt eine unlesbare Adresse ab", async () => {
    const error = await failing(
      resolveUploadSource(
        { source: "https://" },
        { config: config({ uploadFromUrl: true }), fetchImpl: respondWith(PDF) },
      ),
    );
    expect(error.reason).toBe("url-invalid");
  });
});

describe("file:// nur mit BB_MCP_UPLOAD_DIRS", () => {
  it("liest ohne Schalter keine Datei", async () => {
    const error = await failing(
      resolveUploadSource({ source: pathToFileURL(receiptPath).href }, { config: config() }),
    );
    expect(error.reason).toBe("file-disabled");
    expect(error.message).toContain("BB_MCP_UPLOAD_DIRS");
  });

  it("liest mit Schalter und nimmt den Dateinamen aus dem Pfad", async () => {
    const payload = await resolveUploadSource(
      { source: pathToFileURL(receiptPath).href },
      { config: config({ uploadDirs: [allowedDir] }) },
    );
    expect(payload.origin).toBe("file");
    expect(payload.mediaType).toBe("application/pdf");
    expect(payload.fileName).toBe("rechnung.pdf");
    expect(Buffer.from(payload.base64, "base64").equals(PDF)).toBe(true);
  });

  it("lässt das übergebene Argument dem Pfadnamen vorgehen", async () => {
    const payload = await resolveUploadSource(
      { source: pathToFileURL(receiptPath).href, fileName: "eingang.pdf" },
      { config: config({ uploadDirs: [allowedDir] }) },
    );
    expect(payload.fileName).toBe("eingang.pdf");
  });

  it("lehnt eine Datei außerhalb der freigegebenen Verzeichnisse ab", async () => {
    const outsidePath = path.join(root, "outsidePath.pdf");
    await fs.writeFile(outsidePath, PDF);
    const error = await failing(
      resolveUploadSource(
        { source: pathToFileURL(outsidePath).href },
        { config: config({ uploadDirs: [allowedDir] }) },
      ),
    );
    expect(error.reason).toBe("file-outside-allowed-dirs");
  });

  it("nimmt keinen nackten Pfad und kein fremdes Schema an", async () => {
    const plainPathError = await failing(
      resolveUploadSource(
        { source: receiptPath },
        { config: config({ uploadDirs: [allowedDir] }) },
      ),
    );
    expect(plainPathError.reason).toBe("plain-path");

    // Ein Windows-Pfad darf nicht als Schema „c" gelesen werden.
    const windows = await failing(
      resolveUploadSource(
        { source: "C:\\Erfunden\\beleg.pdf" },
        { config: config({ uploadDirs: [allowedDir] }) },
      ),
    );
    expect(windows.reason).toBe("plain-path");

    const unknownSchemeError = await failing(
      resolveUploadSource(
        { source: "ftp://beispiel.invalid/rechnung.pdf" },
        { config: config({ uploadDirs: [allowedDir] }) },
      ),
    );
    expect(unknownSchemeError.reason).toBe("unknown-scheme");
  });
});

describe("Keine Fehlermeldung enthält einen Dateisystempfad", () => {
  it("gilt für jede Absage der drei Quellen", async () => {
    const withDirectory = config({ uploadDirs: [allowedDir], uploadFromUrl: true });
    const fetchImpl = respondWith(HTML);
    const lookup = () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

    // Als Thunks, damit jede Absage einzeln entsteht und keine unbehandelt liegen bleibt.
    const cases: (() => Promise<unknown>)[] = [
      () => resolveUploadSource({ source: receiptPath }, { config: withDirectory }),
      () =>
        resolveUploadSource(
          { source: "file://fremder-rechner/belege/rechnung.pdf" },
          { config: withDirectory },
        ),
      () => resolveUploadSource({ source: pathToFileURL(receiptPath).href }, { config: config() }),
      () =>
        resolveUploadSource(
          { source: pathToFileURL(path.join(root, "outsidePath.pdf")).href },
          { config: withDirectory },
        ),
      () =>
        resolveUploadSource(
          { source: pathToFileURL(path.join(allowedDir, "fehlt.pdf")).href },
          { config: withDirectory },
        ),
      () =>
        resolveUploadSource({ source: pathToFileURL(allowedDir).href }, { config: withDirectory }),
      () =>
        resolveUploadSource(
          { source: HTML.toString("base64"), fileName: receiptPath },
          { config: withDirectory },
        ),
      () =>
        resolveUploadSource(
          { source: `https://beispiel.invalid${pathToFileURL(receiptPath).pathname}` },
          { config: withDirectory, fetchImpl, dnsLookup: lookup },
        ),
    ];

    for (const testCase of cases) {
      const error = await failing(testCase());
      expect(error.message).not.toContain(root);
      expect(error.message).not.toContain(allowedDir);
      expect(error.message).not.toContain(os.tmpdir());
      expect(error.message).not.toContain("rechnung.pdf");

      // Übrig bleiben dürfen nur die Schemabeispiele der Hilfetexte, hier namentlich abgezogen.
      const withoutExamples = error.message
        .replaceAll("file:///verzeichnis/datei.pdf", "")
        .replaceAll("file://", "")
        .replaceAll("https://", "")
        .replaceAll("http://", "")
        .replaceAll("application/pdf", "")
        .replaceAll("text/xml", "")
        .replaceAll("application/xml", "")
        .replaceAll("image/jpeg", "")
        .replaceAll("image/png", "")
        .replaceAll("image/bmp", "")
        .replaceAll("image/tiff", "");
      expect(withoutExamples, error.reason).not.toContain("/");
    }
  });
});

describe("Konfiguration aus dem eingefrorenen Objekt", () => {
  it("liest die Schalter aus der aufgelösten Konfiguration, wenn keine übergeben wird", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    initConfig({ env: { BB_MCP_UPLOAD_FROM_URL: "true" } });
    const payload = await resolveUploadSource(
      { source: "https://beispiel.invalid/rechnung.pdf" },
      {
        fetchImpl: respondWith(PDF),
        dnsLookup: () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
      },
    );
    expect(payload.origin).toBe("url");

    resetConfigForTests();
    initConfig({ env: {} });
    const error = await failing(
      resolveUploadSource(
        { source: "https://beispiel.invalid/rechnung.pdf" },
        { fetchImpl: respondWith(PDF) },
      ),
    );
    expect(error.reason).toBe("url-disabled");
  });

  it("liest die freigegebenen Verzeichnisse aus der aufgelösten Konfiguration", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    initConfig({ env: { BB_MCP_UPLOAD_DIRS: allowedDir } });
    const payload = await resolveUploadSource({ source: pathToFileURL(receiptPath).href });
    expect(payload.origin).toBe("file");
  });
});

describe("Belegquellen, die gar nicht erst zu einem Inhalt führen", () => {
  it("meldet eine data-Adresse ohne Nutzlast als leeren Inhalt", async () => {
    // Der Vorsatz ist vollständig, dahinter steht aber nichts. Ohne diesen Zweig liefe die
    // Angabe in die Meldung "kein base64", und der Agent suchte den Fehler am falschen Ende.
    const error = await failing(
      resolveUploadSource({ source: "data:application/pdf;base64," }, { config: config() }),
    );
    expect(error.reason).toBe("empty-source");
    expect(error.message).toContain("leer");
  });

  it("meldet eine file-Adresse, die sich nicht lesen lässt, ohne sie zu wiederholen", async () => {
    // Schema "file", aber kein gültiger Rechnerteil: Die Adresse scheitert schon am Zerlegen,
    // noch bevor das Dateisystem überhaupt befragt wird.
    const error = await failing(
      resolveUploadSource({ source: "file://%" }, { config: config({ uploadDirs: [allowedDir] }) }),
    );
    expect(error.reason).toBe("file-invalid-url");
    expect(error.message).toContain("file:///verzeichnis/datei.pdf");
  });
});
