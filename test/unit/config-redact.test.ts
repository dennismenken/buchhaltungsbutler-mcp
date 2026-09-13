/**
 * Prüfungen zu `src/config/redact.ts`: Schwärzung, abgeleitete Suchformen, zu kurze Werte.
 *
 * Diese Datei ist aus der Zusammenführung zweier früherer Testdateien entstanden, die
 * dieselbe Einheit von zwei Seiten geprüft haben. Beim Zusammenlegen sind drei belegte
 * Dubletten entfallen, also Fälle, die einen bereits abgedeckten Ablauf ein zweites Mal
 * durchgespielt haben. Die zusätzlichen Zusicherungen dieser drei Fälle wurden in die
 * jeweils behaltenen Fälle übernommen; geprüft wird also nicht weniger als vorher, es wird
 * nur nicht mehr doppelt geprüft. Die Gesamtzahl der Prüfungen im Projekt sinkt dadurch um
 * drei und steigt durch einen neu ergänzten Fall wieder um eins. Wer die Zahl über die
 * Historie vergleicht, sieht also eine Verschiebung und keinen Verlust an Abdeckung.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MIN_SECRET_LENGTH,
  REDACTED,
  clearSecrets,
  redact,
  registerSecret,
  registerSecrets,
  registeredSecretCount,
} from "../../src/config/redact.js";
import { resetLoggingForTests, setLogLevel } from "../../src/logging/stderr.js";

// Ausschließlich Platzhalter. Echte Zugangsdaten stehen in keinem Test.
const CLIENT = "PLATZHALTER_API_CLIENT_7f3a1c";
const SECRET = "PLATZHALTER_API_SECRET_9b2c4d";
const KEY = "PLATZHALTER_API_KEY_4d1e6f";

/**
 * Meldet die drei Geheimnisse an, dazu die Paarung aus Client und Secret. Genau diese
 * Paarung steht im `Basic`-Header, und zwar als ein einziger base64-Block.
 */
function registerAll(): void {
  registerSecrets([CLIENT, SECRET, KEY, `${CLIENT}:${SECRET}`]);
}

let stderrChunks: string[] = [];

function writtenToStderr(): string {
  return stderrChunks.join("");
}

beforeEach(() => {
  resetLoggingForTests();
  clearSecrets();
  stderrChunks = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLoggingForTests();
  clearSecrets();
});

describe("Schwärzung: Normalfall", () => {
  it("ersetzt ein angemeldetes Geheimnis und lässt den Rest der Meldung stehen", () => {
    registerSecret(KEY);
    const text = `bb_payment_accounts_list: BuchhaltungsButler meldet einen Fehler (api_key=${KEY}).`;

    expect(redact(text)).toBe(
      `bb_payment_accounts_list: BuchhaltungsButler meldet einen Fehler (api_key=${REDACTED}).`,
    );
    expect(writtenToStderr()).toBe("");
  });

  it("ersetzt jedes Vorkommen desselben Geheimnisses", () => {
    registerSecret(KEY);

    expect(redact(`${KEY} und nochmal ${KEY}`)).toBe(`${REDACTED} und nochmal ${REDACTED}`);
  });

  it("lässt Text unverändert, solange nichts angemeldet ist", () => {
    expect(registeredSecretCount()).toBe(0);
    expect(redact(`api_key=${KEY}`)).toBe(`api_key=${KEY}`);
    expect(redact(`Client ${CLIENT}`)).toBe(`Client ${CLIENT}`);
  });
});

describe("Schwärzung: abgeleitete Formen", () => {
  it("erwischt die drei Geheimnisse base64-kodiert", () => {
    registerAll();
    for (const value of [CLIENT, SECRET, KEY]) {
      const encoded = Buffer.from(value, "utf8").toString("base64");
      const out = redact(`Payload: ${encoded}`);
      expect(out).not.toContain(encoded);
      expect(out).toContain(REDACTED);
    }
  });

  it("erwischt den Basic-Header, in dem Client und Secret gemeinsam kodiert sind", () => {
    registerAll();
    const header = `Authorization: Basic ${Buffer.from(`${CLIENT}:${SECRET}`, "utf8").toString("base64")}`;
    const out = redact(header);

    expect(out).toBe(`Authorization: Basic ${REDACTED}`);
  });

  it("erwischt ein Geheimnis, das versetzt in einem größeren base64-Block steht", () => {
    registerAll();
    // Ein Byte Vorspann verschiebt die Kodierung gegen die Dreiergrenze.
    const blob = Buffer.from(`X${KEY}Y`, "utf8").toString("base64");
    const out = redact(`data: ${blob}`);

    expect(out).toContain(REDACTED);
    expect(out).not.toBe(`data: ${blob}`);
  });

  it("erwischt die drei Geheimnisse in einer URL", () => {
    registerAll();
    const url = `https://example.invalid/api?api_key=${encodeURIComponent(KEY)}`;
    const userinfo = `https://${encodeURIComponent(CLIENT)}:${encodeURIComponent(SECRET)}@example.invalid/`;

    expect(redact(url)).not.toContain(KEY);
    expect(redact(url)).toContain(REDACTED);
    expect(redact(userinfo)).not.toContain(CLIENT);
    expect(redact(userinfo)).not.toContain(SECRET);
  });

  it("erwischt ein prozentkodiertes Geheimnis mit Sonderzeichen", () => {
    const tricky = "PLATZHALTER SECRET/mit+zeichen";
    registerSecret(tricky);
    const encoded = encodeURIComponent(tricky);

    expect(encoded).not.toBe(tricky);
    expect(redact(`?v=${encoded}`)).toBe(`?v=${REDACTED}`);
  });

  it("erwischt die drei Geheimnisse in einem JSON-Fragment", () => {
    registerAll();
    const fragment = JSON.stringify({ api_key: KEY, api_client: CLIENT, api_secret: SECRET });
    const out = redact(fragment);

    expect(out).not.toContain(CLIENT);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(KEY);
    expect(out).toContain(REDACTED);
  });

  it("erwischt ein JSON-maskiertes Geheimnis mit Anführungszeichen und Rückstrich", () => {
    const tricky = 'PLATZHALTER"API\\KEY';
    registerSecret(tricky);
    const fragment = JSON.stringify({ api_key: tricky });

    expect(fragment).not.toContain(tricky);
    expect(redact(fragment)).not.toContain(JSON.stringify(tricky).slice(1, -1));
    expect(redact(fragment)).toContain(REDACTED);
  });
});

describe("Schwärzung: mehrere Geheimnisse und Mehrfachanwendung", () => {
  it("erwischt alle drei Geheimnisse in einer Meldung", () => {
    registerSecrets([CLIENT, SECRET, KEY]);
    const text = `client=${CLIENT} secret=${SECRET} api_key=${KEY}`;

    expect(redact(text)).toBe(`client=${REDACTED} secret=${REDACTED} api_key=${REDACTED}`);
    expect(registeredSecretCount()).toBe(3);
  });

  it("bevorzugt das längere Geheimnis, wenn ein kürzeres darin steckt", () => {
    const shortSecret = "PLATZHALTER_TEIL";
    const longSecret = `${shortSecret}_LANG`;
    registerSecrets([shortSecret, longSecret]);

    // Ohne Längenvorrang bliebe hier `[redacted]_LANG` stehen und gäbe den Rest preis.
    expect(redact(`wert=${longSecret}`)).toBe(`wert=${REDACTED}`);
    expect(redact(`wert=${shortSecret}`)).toBe(`wert=${REDACTED}`);
  });

  it("greift nicht in eine schon gesetzte Marke hinein", () => {
    // "redacted" steht in der Ersatzmarke selbst. Eine Schleife über den jeweils schon
    // ersetzten Text machte aus dem ersten Ersatz `[[redacted]]`.
    registerSecrets([CLIENT, "redacted"]);

    expect(redact(`client=${CLIENT}`)).toBe(`client=${REDACTED}`);
    expect(redact(`client=${CLIENT}`)).not.toContain("[[redacted]]");
  });

  it("schwärzt einen Wert, der in der Ersatzmarke vorkommt, genau einmal", () => {
    registerSecret("redacted");

    expect(redact("wert=redacted")).toBe(`wert=${REDACTED}`);
    expect(redact("a=redacted b=redacted")).toBe(`a=${REDACTED} b=${REDACTED}`);
  });

  it("schwärzt die vollständige Marke, wenn genau sie das Geheimnis ist", () => {
    registerSecret(REDACTED);

    expect(redact(`wert=${REDACTED}`)).toBe(`wert=${REDACTED}`);
  });

  it("lässt eine schon gesetzte Marke stehen, wenn derselbe Text erneut geschwärzt wird", () => {
    // Auf dem Weg einer Fehlermeldung läuft der Fremdtext zweimal durch die Schwärzung: einmal
    // beim Lesen des Umschlags, einmal beim Ausgeben. Der zweite Lauf darf aus `[redacted]`
    // kein `[[redacted]]` machen.
    registerSecret("redacted");
    const redactedOnce = redact("Der übergebene api_key redacted ist nicht freigeschaltet.");

    expect(redactedOnce).toBe(`Der übergebene api_key ${REDACTED} ist nicht freigeschaltet.`);
    expect(redact(redactedOnce)).toBe(redactedOnce);
  });

  it("ist bei gewöhnlichen Geheimnissen mehrfach anwendbar", () => {
    registerSecrets([CLIENT, SECRET, KEY]);
    const redactedOnce = redact(`client=${CLIENT} secret=${SECRET} api_key=${KEY}`);

    expect(redact(redactedOnce)).toBe(redactedOnce);
    expect(redact(redact(redactedOnce))).toBe(redactedOnce);
  });
});

describe("Schwärzung: zu kurze Werte", () => {
  it("zerstört die Meldung nicht, wenn das Zugangsdatum ein einziges Zeichen ist", () => {
    registerSecret("e");
    const text = "bb_payment_accounts_list: BuchhaltungsButler meldet einen Fehler.";

    expect(redact(text)).toBe(text);
    expect(registeredSecretCount()).toBe(0);
  });

  it("meldet einen zu kurzen Wert auf stderr, ohne ihn zu nennen", () => {
    registerSecret("xq7");
    const warning = writtenToStderr();

    expect(warning).toContain(`kürzer als ${MIN_SECRET_LENGTH} Zeichen`);
    expect(warning).toContain("nicht geschwärzt");
    expect(warning).not.toContain("xq7");
  });

  it("nennt beide Fundorte: die Umgebungsvariablen und die Zugangsdatendatei", () => {
    // Der empfohlene Weg ist die Zugangsdatendatei. Nennte die Warnung nur die
    // Umgebungsvariablen, suchte wer die Datei benutzt an der falschen Stelle.
    registerSecret("xq7");
    const warning = writtenToStderr();

    for (const envVar of ["BB_API_CLIENT", "BB_API_SECRET", "BB_API_KEY"]) {
      expect(warning).toContain(envVar);
    }
    expect(warning).toContain("Zugangsdatendatei");
    for (const field of ["api_client", "api_secret", "api_key"]) {
      expect(warning).toContain(field);
    }
  });

  it("warnt auch dann, wenn die Protokollstufe vor der Anmeldung auf error steht", () => {
    // Der Einrichtungsassistent arbeitet in genau dieser Reihenfolge: Er lädt zuerst die
    // Konfiguration, womit `setLogLevel` die Stufe setzt, und meldet die eingegebenen
    // Zugangsdaten erst danach an. Über den gewöhnlichen Warnweg fiele die Zeile bei `error`
    // still aus, und niemand erführe, dass sein Zugangsdatum ungeschwärzt bleibt.
    setLogLevel("error");
    registerSecret("xq7");
    const warning = writtenToStderr();

    expect(warning).toContain("bbutler-mcp warn: ");
    expect(warning).toContain(`kürzer als ${MIN_SECRET_LENGTH} Zeichen`);
    expect(warning).toContain("nicht geschwärzt");
    expect(warning).not.toContain("xq7");
    expect(registeredSecretCount()).toBe(0);
  });

  it("meldet denselben zu kurzen Wert nur einmal", () => {
    registerSecret("xq7");
    const afterFirst = writtenToStderr();
    registerSecret("xq7");
    registerSecrets(["xq7"]);

    expect(writtenToStderr()).toBe(afterFirst);
  });

  it("meldet jeden zu kurzen Wert einer Sammelanmeldung", () => {
    registerSecrets(["ab", "cd", KEY]);

    expect(writtenToStderr().split("kürzer als").length - 1).toBe(2);
    expect(registeredSecretCount()).toBe(1);
  });

  it("schweigt bei leeren und fehlenden Werten, statt sie als zu kurz zu melden", () => {
    registerSecret("");
    registerSecret(null);
    registerSecret(undefined);

    expect(writtenToStderr()).toBe("");
    expect(registeredSecretCount()).toBe(0);
    // Eine leere Suchform passte an jeder Stelle und ersetzte den ganzen Text.
    expect(redact("unverändert")).toBe("unverändert");
  });

  it("nimmt einen Wert genau ab der Mindestlänge an", () => {
    const atMinLength = "a".repeat(MIN_SECRET_LENGTH);
    const tooShort = "b".repeat(MIN_SECRET_LENGTH - 1);
    registerSecrets([atMinLength, tooShort]);

    expect(registeredSecretCount()).toBe(1);
    expect(redact(`x=${atMinLength}`)).toBe(`x=${REDACTED}`);
    expect(redact(`y=${tooShort}`)).toBe(`y=${tooShort}`);
  });

  it("vergisst mit clearSecrets auch das Gedächtnis der Warnungen", () => {
    registerSecret("xq7");
    expect(writtenToStderr()).not.toBe("");

    clearSecrets();
    stderrChunks = [];
    registerSecret("xq7");

    expect(writtenToStderr()).toContain(`kürzer als ${MIN_SECRET_LENGTH} Zeichen`);
  });
});

describe("Schwärzung: Verwaltung der angemeldeten Geheimnisse", () => {
  it("vergisst Geheimnisse mit clearSecrets", () => {
    registerAll();
    expect(registeredSecretCount()).toBe(4);
    clearSecrets();

    expect(registeredSecretCount()).toBe(0);
    expect(redact(`api_key=${KEY}`)).toBe(`api_key=${KEY}`);
  });
});
