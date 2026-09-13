import dns from "node:dns/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertUrlShapeAllowed,
  classifyAddress,
  createGuardedLookup,
  fetchRemoteFile,
  fileNameFromDisposition,
  fileNameFromPath,
  hostnameAsAddress,
  MAX_REDIRECTS,
  systemDnsLookup,
  type DnsLookupAll,
  type RemoteFetch,
  type RemoteResponse,
  type ResolvedAddress,
} from "../../src/upload/ssrf.js";
import { UploadSourceError } from "../../src/upload/sniff.js";

// Alle Adressen und Inhalte dieser Tests sind erfunden. Es geht kein echter Netzaufruf
// hinaus: Der Abrufer wird eingespeist, und der Testlauf sperrt das Netz ohnehin.

const PDF = new Uint8Array(Buffer.from("%PDF-1.7\n% erfundener Beleg\n", "ascii"));

/** Eine öffentliche Adresse aus dem Dokumentationsbereich gibt es nicht; 93.184.216.34 ist
 *  eine gewöhnliche öffentliche Adresse und wird hier nur als Zeichenkette benutzt. */
const PUBLIC_ADDRESSES: ResolvedAddress[] = [{ address: "93.184.216.34", family: 4 }];

function lookupReturning(addresses: readonly ResolvedAddress[]): DnsLookupAll {
  return () => Promise.resolve(addresses);
}

function streamOf(
  chunks: readonly Uint8Array[],
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      onCancel?.();
    },
  });
}

function response(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: ReadableStream<Uint8Array> | null;
}): RemoteResponse {
  const headers = new Headers(init.headers ?? {});
  return {
    status: init.status ?? 200,
    headers: { get: (name: string) => headers.get(name) },
    body: init.body ?? null,
  };
}

async function failing(promise: Promise<unknown>): Promise<UploadSourceError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UploadSourceError);
    return error as UploadSourceError;
  }
  throw new Error("Der Abruf hätte scheitern müssen, war aber erfolgreich.");
}

describe("classifyAddress", () => {
  it("sperrt die privaten, lokalen und reservierten IPv4-Bereiche", () => {
    const blocked = [
      "0.0.0.0",
      "127.0.0.1",
      "127.10.20.30",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.178.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.0.1",
      "192.0.2.7",
      "198.18.0.1",
      "198.51.100.7",
      "203.0.113.7",
      "192.88.99.1",
      "224.0.0.1",
      "255.255.255.255",
    ];
    for (const address of blocked) {
      expect(classifyAddress(address), address).not.toBeNull();
    }
  });

  it("sperrt die lokalen und reservierten IPv6-Bereiche", () => {
    const blocked = [
      "::",
      "::1",
      "::ffff:10.0.0.1",
      "::ffff:93.184.216.34",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "fec0::1",
      "ff02::1",
      "2001:db8::1",
      "2001::1",
      "2002::1",
      "64:ff9b::1",
      "100::1",
    ];
    for (const address of blocked) {
      expect(classifyAddress(address), address).not.toBeNull();
    }
  });

  it("lässt gewöhnliche öffentliche Adressen durch", () => {
    expect(classifyAddress("93.184.216.34")).toBeNull();
    expect(classifyAddress("8.8.8.8")).toBeNull();
    expect(classifyAddress("172.32.0.1")).toBeNull();
    expect(classifyAddress("2606:2800:220:1:248:1893:25c8:1946")).toBeNull();
  });

  it("sperrt, was sich nicht als Adresse lesen lässt", () => {
    expect(classifyAddress("keine-adresse")).not.toBeNull();
    expect(classifyAddress("")).not.toBeNull();
    expect(classifyAddress("999.1.1.1")).not.toBeNull();
  });
});

describe("createGuardedLookup", () => {
  it("reicht eine erlaubte Auflösung durch, einzeln und als Liste", async () => {
    const lookup = createGuardedLookup(lookupReturning(PUBLIC_ADDRESSES));

    const single = await new Promise<{ address: unknown; family: unknown }>((resolve, reject) => {
      lookup("beispiel.invalid", {}, (error, address, family) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve({ address, family });
      });
    });
    expect(single.address).toBe("93.184.216.34");
    expect(single.family).toBe(4);

    const allAddresses = await new Promise<unknown>((resolve, reject) => {
      lookup("beispiel.invalid", { all: true }, (error, address) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(address);
      });
    });
    expect(allAddresses).toEqual(PUBLIC_ADDRESSES);
  });

  it("meldet einen Fehler, sobald eine einzige Adresse gesperrt ist", async () => {
    const lookup = createGuardedLookup(
      lookupReturning([
        { address: "93.184.216.34", family: 4 },
        { address: "10.1.2.3", family: 4 },
      ]),
    );
    const error = await new Promise<unknown>((resolve) => {
      lookup("beispiel.invalid", { all: true }, (err) => resolve(err));
    });
    expect(error).toBeInstanceOf(UploadSourceError);
    expect((error as UploadSourceError).reason).toBe("url-blocked-address");
  });

  it("meldet eine leere Auflösung als Fehler statt als Erfolg", async () => {
    const lookup = createGuardedLookup(lookupReturning([]));
    const error = await new Promise<unknown>((resolve) => {
      lookup("beispiel.invalid", {}, (err) => resolve(err));
    });
    expect((error as UploadSourceError).reason).toBe("url-dns-failed");
  });
});

describe("assertUrlShapeAllowed", () => {
  it("lässt eine gewöhnliche https-Adresse durch", () => {
    expect(() =>
      assertUrlShapeAllowed(new URL("https://beispiel.invalid/beleg.pdf")),
    ).not.toThrow();
  });

  it("lehnt http ab", () => {
    try {
      assertUrlShapeAllowed(new URL("http://beispiel.invalid/beleg.pdf"));
      throw new Error("hätte scheitern müssen");
    } catch (error) {
      expect((error as UploadSourceError).reason).toBe("url-insecure-scheme");
    }
  });

  it("lehnt einen Anmeldeteil in der Adresse ab", () => {
    try {
      assertUrlShapeAllowed(new URL("https://nutzer:geheim@beispiel.invalid/beleg.pdf"));
      throw new Error("hätte scheitern müssen");
    } catch (error) {
      expect((error as UploadSourceError).reason).toBe("url-credentials");
      expect((error as UploadSourceError).message).not.toContain("geheim");
    }
  });

  it("lehnt eine gesperrte Adresse ab, auch in Kurzschreibweise", () => {
    // Die URL-Zerlegung normalisiert 2130706433 und 0177.0.0.1 zu 127.0.0.1.
    for (const raw of [
      "https://127.0.0.1/beleg.pdf",
      "https://2130706433/beleg.pdf",
      "https://0177.0.0.1/beleg.pdf",
      "https://[::1]/beleg.pdf",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      try {
        assertUrlShapeAllowed(new URL(raw));
        throw new Error(`hätte scheitern müssen: ${raw}`);
      } catch (error) {
        expect(error, raw).toBeInstanceOf(UploadSourceError);
        expect((error as UploadSourceError).reason, raw).toBe("url-blocked-address");
      }
    }
  });
});

describe("fetchRemoteFile", () => {
  const baseOptions = { maxBytes: 1024, timeoutMs: 5000 };

  it("holt die Datei und liest den Namensvorschlag aus dem Header", async () => {
    const fetchImpl: RemoteFetch = () =>
      Promise.resolve(
        response({
          headers: {
            "content-type": "text/html",
            "content-disposition": 'attachment; filename="rechnung mai.pdf"',
          },
          body: streamOf([PDF]),
        }),
      );

    const result = await fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
      ...baseOptions,
      fetchImpl,
      dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
    });
    expect(Buffer.from(result.bytes).equals(Buffer.from(PDF))).toBe(true);
    expect(result.nameHint).toBe("rechnung mai.pdf");
    expect(result.redirects).toBe(0);
  });

  it("setzt keinen Request ab, wenn der Name auf eine gesperrte Adresse zeigt", async () => {
    const calls: string[] = [];
    const fetchImpl: RemoteFetch = (url) => {
      calls.push(url);
      return Promise.resolve(response({ body: streamOf([PDF]) }));
    };

    const error = await failing(
      fetchRemoteFile(new URL("https://intern.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning([{ address: "192.168.10.10", family: 4 }]),
      }),
    );
    expect(error.reason).toBe("url-blocked-address");
    expect(calls).toEqual([]);
  });

  it("prüft jeden Weiterleitungssprung und nicht nur den ersten", async () => {
    const calls: string[] = [];
    const fetchImpl: RemoteFetch = (url) => {
      calls.push(url);
      if (calls.length === 1) {
        return Promise.resolve(
          response({ status: 302, headers: { location: "https://zweitrechner.invalid/b.pdf" } }),
        );
      }
      return Promise.resolve(response({ body: streamOf([PDF]) }));
    };

    // Der erste Rechner ist erlaubt, der zweite löst in ein privates Netz auf.
    const dnsLookup: DnsLookupAll = (hostname) =>
      Promise.resolve(
        hostname === "beispiel.invalid" ? PUBLIC_ADDRESSES : [{ address: "10.0.0.5", family: 4 }],
      );

    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup,
      }),
    );
    expect(error.reason).toBe("url-blocked-address");
    expect(calls).toHaveLength(1);
  });

  it("folgt einer erlaubten Weiterleitung", async () => {
    const calls: string[] = [];
    const fetchImpl: RemoteFetch = (url) => {
      calls.push(url);
      if (calls.length === 1) {
        return Promise.resolve(response({ status: 301, headers: { location: "/echt/b.pdf" } }));
      }
      return Promise.resolve(response({ body: streamOf([PDF]) }));
    };

    const result = await fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
      ...baseOptions,
      fetchImpl,
      dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
    });
    expect(calls[1]).toBe("https://beispiel.invalid/echt/b.pdf");
    expect(result.redirects).toBe(1);
    expect(result.nameHint).toBe("b.pdf");
  });

  it("folgt keiner Weiterleitung auf http", async () => {
    const fetchImpl: RemoteFetch = () =>
      Promise.resolve(
        response({ status: 302, headers: { location: "http://beispiel.invalid/b.pdf" } }),
      );
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-insecure-scheme");
  });

  it("folgt keiner Weiterleitung auf eine gesperrte Adresse", async () => {
    const fetchImpl: RemoteFetch = () =>
      Promise.resolve(
        response({ status: 307, headers: { location: "https://169.254.169.254/meta" } }),
      );
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-blocked-address");
  });

  it("gibt nach zu vielen Weiterleitungen auf", async () => {
    let counter = 0;
    const fetchImpl: RemoteFetch = () => {
      counter += 1;
      return Promise.resolve(
        response({ status: 302, headers: { location: `https://beispiel.invalid/${counter}` } }),
      );
    };
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-too-many-redirects");
    expect(counter).toBe(MAX_REDIRECTS + 1);
  });

  it("meldet eine Weiterleitung ohne Ziel", async () => {
    const fetchImpl: RemoteFetch = () => Promise.resolve(response({ status: 302 }));
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-redirect-invalid");
  });

  it("meldet einen Fehlerstatus mit Rechnername, aber ohne Pfad", async () => {
    const fetchImpl: RemoteFetch = () => Promise.resolve(response({ status: 404 }));
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/geheimer/pfad.pdf"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-status");
    expect(error.message).toContain("beispiel.invalid");
    expect(error.message).not.toContain("geheimer");
  });

  it("lehnt eine angekündigte Größe über der Grenze ab und schließt die Leitung", async () => {
    let cancelled = false;
    const fetchImpl: RemoteFetch = () =>
      Promise.resolve(
        response({
          headers: { "content-length": "999999" },
          body: new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(400));
            },
            cancel() {
              cancelled = true;
            },
          }),
        }),
      );
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("too-large");
    // Der Körper wird nicht eingesammelt, sondern die Leitung geschlossen.
    expect(cancelled).toBe(true);
  });

  it("bricht die laufende Übertragung ab, sobald die Grenze gerissen würde", async () => {
    let cancelled = false;
    let delivered = 0;
    const chunk = new Uint8Array(400);
    const fetchImpl: RemoteFetch = () =>
      Promise.resolve(
        response({
          body: new ReadableStream<Uint8Array>({
            pull(controller) {
              delivered += 1;
              controller.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            },
          }),
        }),
      );

    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        maxBytes: 1000,
        timeoutMs: 5000,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("too-large");
    expect(cancelled).toBe(true);
    // Der Strom liefert unbegrenzt weiter; dass dieser Test überhaupt endet, ist der Nachweis
    // der laufenden Zählung. Zwei Abschnitte passen (800 Bytes), der dritte reißt die Grenze;
    // ein weiterer liegt im Vorlauf des Stroms, den dieser selbst anlegt.
    expect(delivered).toBeLessThanOrEqual(4);
  });

  it("meldet eine leere Antwort", async () => {
    const fetchImpl: RemoteFetch = () => Promise.resolve(response({ body: streamOf([]) }));
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-empty-body");
  });

  it("meldet eine gescheiterte Namensauflösung", async () => {
    const fetchImpl: RemoteFetch = () => Promise.resolve(response({ body: streamOf([PDF]) }));
    const error = await failing(
      fetchRemoteFile(new URL("https://gibtesnicht.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOTFOUND" })),
      }),
    );
    expect(error.reason).toBe("url-dns-failed");
    expect(error.message).toContain("ENOTFOUND");
  });

  it("übersetzt einen Verbindungsfehler, ohne den Pfad zu nennen", async () => {
    const fetchImpl: RemoteFetch = () =>
      Promise.reject(Object.assign(new Error("kaputt"), { code: "ECONNREFUSED" }));
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/geheimer/pfad.pdf"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error.reason).toBe("url-network");
    expect(error.message).not.toContain("geheimer");
  });

  it("unterscheidet Zeitlimit und Abbruch durch den Client", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const abortingFetch: RemoteFetch = () =>
      Promise.reject(Object.assign(new Error("abgebrochen"), { name: "AbortError" }));

    const fromClient = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl: abortingFetch,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
        signal: abortController.signal,
      }),
    );
    expect(fromClient.reason).toBe("url-cancelled");

    const timedOut = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl: () =>
          Promise.reject(Object.assign(new Error("zu spät"), { name: "TimeoutError" })),
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(timedOut.reason).toBe("url-timeout");
  });

  it("behält die Meldung der Adressprüfung aus der Verbindungsschicht", async () => {
    // undici verpackt den Fehler der lookup-Funktion; er muss ausgepackt werden.
    const inner = new UploadSourceError("url-blocked-address", "Adresse im privaten Netzbereich.");
    const fetchImpl: RemoteFetch = () =>
      Promise.reject(new Error("fetch failed", { cause: inner }));
    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.invalid/b"), {
        ...baseOptions,
        fetchImpl,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
      }),
    );
    expect(error).toBe(inner);
  });
});

describe("Namensvorschläge", () => {
  it("liest filename und filename* aus Content-Disposition", () => {
    expect(fileNameFromDisposition('attachment; filename="rechnung.pdf"')).toBe("rechnung.pdf");
    expect(fileNameFromDisposition("attachment; filename=rechnung.pdf")).toBe("rechnung.pdf");
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''rechnung%20m%C3%A4rz.pdf")).toBe(
      "rechnung märz.pdf",
    );
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition("attachment")).toBeNull();
  });

  it("nimmt sonst den letzten Bestandteil des Pfades", () => {
    expect(fileNameFromPath(new URL("https://beispiel.invalid/a/b/rechnung%20mai.pdf"))).toBe(
      "rechnung mai.pdf",
    );
    expect(fileNameFromPath(new URL("https://beispiel.invalid/"))).toBeNull();
  });
});

// --- Randfälle, die neben den Regelfällen oben stehen ------------------------------------
//
// Was hier steht, ist bewusst nicht in die Blöcke darüber eingemischt: Es sind die Zweige, die
// erst greifen, wenn eine Gegenstelle sich ungewöhnlich verhält — ein Header ohne verwertbaren
// Wert, ein Abschnitt ohne Inhalt, ein Fehler ohne Fehlercode. Genau die entscheiden darüber,
// ob die Absage noch eine brauchbare Meldung trägt oder als Ausnahme aus dem Modul fällt.

describe("classifyAddress, weitere Bereiche", () => {
  it("sperrt den für Protokollzwecke reservierten Bereich 192.0.0.0/24", () => {
    expect(classifyAddress("192.0.0.1")).toContain("192.0.0.0/24");
    // Der Nachbarbereich ist davon nicht betroffen.
    expect(classifyAddress("192.0.1.1")).toBeNull();
  });

  it("liest auch eine IPv6-Adresse ohne Kurzschreibweise", () => {
    // Ausgeschrieben, also ohne "::". Das ist der andere Zweig der Zerlegung.
    expect(classifyAddress("2001:0db8:0000:0000:0000:0000:0000:0001")).toContain("2001:db8::/32");
    expect(classifyAddress("2a00:1450:4001:0081:0000:0000:0000:2004")).toBeNull();
  });
});

describe("hostnameAsAddress", () => {
  it("erkennt ein Adressliteral, auch in eckigen Klammern", () => {
    expect(hostnameAsAddress("93.184.216.34")).toBe("93.184.216.34");
    expect(hostnameAsAddress("[::1]")).toBe("::1");
    expect(hostnameAsAddress("beispiel.test")).toBeNull();
  });
});

describe("systemDnsLookup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reicht family und hints nur weiter, wenn sie gesetzt sind", async () => {
    const calls: unknown[] = [];
    vi.spyOn(dns, "lookup").mockImplementation(((_hostname: string, options: unknown) => {
      calls.push(options);
      return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
    }) as unknown as typeof dns.lookup);

    await systemDnsLookup("beispiel.test", { all: true });
    await systemDnsLookup("beispiel.test", { all: true, family: 6, hints: 1024 });

    // Ohne Angabe steht family gar nicht im Aufruf; ein gesetztes 0 hätte eine andere
    // Bedeutung als das Weglassen.
    expect(calls[0]).toEqual({ all: true });
    expect(calls[1]).toEqual({ all: true, family: 6, hints: 1024 });
  });
});

describe("createGuardedLookup, Vermittlung der Optionen", () => {
  /** Ruft den Wächter auf und liefert, was er an die Namensauflösung weitergereicht hat. */
  async function optionsPassedFor(
    options: Parameters<ReturnType<typeof createGuardedLookup>>[1],
  ): Promise<Record<string, unknown>> {
    let seen: Record<string, unknown> = {};
    const lookup = createGuardedLookup((_hostname, passed) => {
      seen = { ...passed };
      return Promise.resolve(PUBLIC_ADDRESSES);
    });
    await new Promise<void>((resolve, reject) => {
      lookup("beispiel.test", options, (error) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return seen;
  }

  it("übersetzt die Schreibweisen der Adressfamilie", async () => {
    expect(await optionsPassedFor({ family: 4 })).toEqual({ all: true, family: 4 });
    expect(await optionsPassedFor({ family: "IPv4" })).toEqual({ all: true, family: 4 });
    expect(await optionsPassedFor({ family: 6 })).toEqual({ all: true, family: 6 });
    expect(await optionsPassedFor({ family: "IPv6" })).toEqual({ all: true, family: 6 });
  });

  it("lässt family weg, wenn keine oder eine unbekannte Angabe kommt", async () => {
    expect(await optionsPassedFor({})).toEqual({ all: true });
    expect(await optionsPassedFor({ family: 0 })).toEqual({ all: true });
    expect(await optionsPassedFor({ family: "IPv7" })).toEqual({ all: true });
  });

  it("reicht hints unverändert weiter", async () => {
    expect(await optionsPassedFor({ hints: 32 })).toEqual({ all: true, hints: 32 });
  });

  it("liefert eine einzelne Adresse, wenn all nicht ausdrücklich gesetzt ist", async () => {
    const lookup = createGuardedLookup(lookupReturning(PUBLIC_ADDRESSES));
    const result = await new Promise<{ address: string | ResolvedAddress[]; family?: number }>(
      (resolve, reject) => {
        lookup("beispiel.test", { all: false }, (error, address, family) => {
          if (error !== null) {
            reject(error);
            return;
          }
          resolve({ address, ...(family === undefined ? {} : { family }) });
        });
      },
    );
    expect(result.address).toBe("93.184.216.34");
    expect(result.family).toBe(4);
  });
});

describe("assertUrlShapeAllowed, weitere Absagen", () => {
  it("lehnt jedes andere Schema als https ab und nennt es", () => {
    let caught: unknown;
    try {
      assertUrlShapeAllowed(new URL("ftp://beispiel.test/beleg.pdf"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UploadSourceError);
    expect((caught as UploadSourceError).reason).toBe("url-invalid");
    expect((caught as UploadSourceError).message).toContain("ftp:");
  });

  it("lehnt auch einen Anmeldeteil ab, der nur aus einem Kennwort besteht", () => {
    let caught: unknown;
    try {
      assertUrlShapeAllowed(new URL("https://:geheim@beispiel.test/beleg.pdf"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UploadSourceError);
    expect((caught as UploadSourceError).reason).toBe("url-credentials");
    // Das Kennwort steht nicht in der Meldung.
    expect((caught as UploadSourceError).message).not.toContain("geheim");
  });

  it("lässt ein Adressliteral durch, das öffentlich ist", () => {
    expect(() => {
      assertUrlShapeAllowed(new URL("https://93.184.216.34/beleg.pdf"));
    }).not.toThrow();
  });
});

describe("Namensvorschläge, Randfälle", () => {
  it("behält den rohen Wert, wenn die Prozentkodierung fehlerhaft ist", () => {
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A.pdf")).toBe(
      "%E0%A4%A.pdf",
    );
    expect(fileNameFromPath(new URL("https://beispiel.test/ablage/%E0%A4%A.pdf"))).toBe(
      "%E0%A4%A.pdf",
    );
  });

  it("nimmt filename, wenn filename* keinen Wert trägt", () => {
    expect(fileNameFromDisposition(`attachment; filename*=UTF-8''; filename="ersatz.pdf"`)).toBe(
      "ersatz.pdf",
    );
  });

  it("liefert null, wenn der Header keinen Namen trägt oder gar nicht da ist", () => {
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition("inline")).toBeNull();
  });

  it("liefert null, wenn der Pfad auf einen Trenner endet", () => {
    expect(fileNameFromPath(new URL("https://beispiel.test/ablage/"))).toBeNull();
    expect(fileNameFromPath(new URL("https://beispiel.test"))).toBeNull();
  });
});

describe("fetchRemoteFile, Randfälle des Körpers", () => {
  const options = {
    maxBytes: 1024,
    timeoutMs: 1_000,
    dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
  };

  it("liest den Körper trotz einer Content-Length, die keine Zahl ist", async () => {
    const fetchImpl: RemoteFetch = () =>
      Promise.resolve(
        response({ headers: { "content-length": "unbekannt" }, body: streamOf([PDF]) }),
      );

    const source = await fetchRemoteFile(new URL("https://beispiel.test/beleg.pdf"), {
      ...options,
      fetchImpl,
    });
    expect(source.bytes).toEqual(PDF);
    expect(source.redirects).toBe(0);
  });

  it("meldet eine Antwort ganz ohne Körper", async () => {
    const fetchImpl: RemoteFetch = () => Promise.resolve(response({ body: null }));

    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.test/beleg.pdf"), { ...options, fetchImpl }),
    );
    expect(error.reason).toBe("url-empty-body");
    expect(error.message).toContain("keinen Inhalt geliefert");
  });

  it("übergeht einen Abschnitt ohne Inhalt und liest den Rest", async () => {
    // Ein Strom darf undefined liefern; das ist kein Ende und kein Fehler.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(undefined as unknown as Uint8Array);
        controller.enqueue(PDF);
        controller.close();
      },
    });
    const fetchImpl: RemoteFetch = () => Promise.resolve(response({ body }));

    const source = await fetchRemoteFile(new URL("https://beispiel.test/beleg.pdf"), {
      ...options,
      fetchImpl,
    });
    expect(source.bytes).toEqual(PDF);
  });
});

describe("fetchRemoteFile, Ursachen ohne Fehlercode", () => {
  const options = {
    maxBytes: 1024,
    timeoutMs: 1_000,
    dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
  };

  async function failingWith(thrown: unknown): Promise<UploadSourceError> {
    const fetchImpl: RemoteFetch = () => {
      throw thrown;
    };
    return failing(
      fetchRemoteFile(new URL("https://beispiel.test/beleg.pdf"), { ...options, fetchImpl }),
    );
  }

  it("nennt die Meldung, wenn kein Fehlercode vorliegt", async () => {
    const error = await failingWith(new Error("die Gegenstelle hat aufgelegt"));
    expect(error.reason).toBe("url-network");
    expect(error.message).toContain("die Gegenstelle hat aufgelegt");
  });

  it("kürzt eine sehr lange Meldung der Gegenstelle", async () => {
    const error = await failingWith(new Error("x".repeat(400)));
    expect(error.reason).toBe("url-network");
    expect(error.message).toContain("…");
    // Fremdtext steht nie unbegrenzt in der Meldung.
    expect(error.message.length).toBeLessThan(300);
  });

  it("kommt auch mit etwas zurecht, das keine Ausnahme ist", async () => {
    const error = await failingWith("etwas Fremdes");
    expect(error.reason).toBe("url-network");
    expect(error.message).toContain("unbekannte Ursache");
    expect(error.message).not.toContain("etwas Fremdes");
  });
});

describe("fetchRemoteFile ohne eingespeiste Bestandteile", () => {
  it("baut den Agenten selbst und sagt trotzdem ab, bevor ein Socket entsteht", async () => {
    // Ohne fetchImpl und ohne dnsLookup: Es entsteht der echte undici-Agent mit dem Wächter
    // in der lookup-Funktion. Die Adresse ist ein gesperrtes Literal, also greift schon die
    // Formprüfung — es geht kein Request hinaus, und der Agent wird wieder geschlossen.
    const error = await failing(
      fetchRemoteFile(new URL("https://127.0.0.1/beleg.pdf"), {
        maxBytes: 1024,
        timeoutMs: 1_000,
      }),
    );
    expect(error.reason).toBe("url-blocked-address");
    expect(error.message).toContain("Loopback-Bereich");
  });

  it("nimmt ohne Angabe die vorgesehene Obergrenze der Weiterleitungen", async () => {
    let calls = 0;
    const fetchImpl: RemoteFetch = () => {
      calls += 1;
      return Promise.resolve(
        response({ status: 302, headers: { location: "https://beispiel.test/weiter" } }),
      );
    };

    const error = await failing(
      fetchRemoteFile(new URL("https://beispiel.test/beleg.pdf"), {
        maxBytes: 1024,
        timeoutMs: 1_000,
        dnsLookup: lookupReturning(PUBLIC_ADDRESSES),
        fetchImpl,
      }),
    );
    expect(error.reason).toBe("url-too-many-redirects");
    expect(error.message).toContain(String(MAX_REDIRECTS));
    expect(calls).toBe(MAX_REDIRECTS + 1);
  });
});
