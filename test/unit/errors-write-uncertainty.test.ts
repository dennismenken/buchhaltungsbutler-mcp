import { afterEach, describe, expect, it } from "vitest";

import { clearSecrets, registerSecret } from "../../src/config/redact.js";
import {
  buildWriteUncertainty,
  fillHint,
  formatArgumentValue,
  UNCERTAINTY_HEADLINE,
} from "../../src/errors/write-uncertainty.js";
import type { VerifySpec } from "../../src/registry/types.js";

const VERIFY_PATH: VerifySpec = {
  kind: "tool",
  tool: "bb_postings_search",
  argsFrom: { date_from: "date", date_to: "date" },
  hint: "nach postingtext {postingtext} mit amount {amount} suchen",
};

const ARGUMENTS = {
  date: "2026-08-14",
  postingtext: "Büromaterial August",
  amount: "1190.00",
};

afterEach(() => {
  clearSecrets();
});

describe("Der Text aus Plan 5.7", () => {
  const uncertainty = buildWriteUncertainty({
    toolName: "bb_postings_create_free",
    specPath: "/postings/add/free",
    cause: { kind: "timeout", timeoutMs: 30_000 },
    verifyWith: VERIFY_PATH,
    args: ARGUMENTS,
  });

  it("behauptet keinen Fehlschlag", () => {
    expect(uncertainty.text).toContain(UNCERTAINTY_HEADLINE);
    expect(uncertainty.text).toContain("möglicherweise ausgeführt, möglicherweise nicht");
    expect(uncertainty.text).not.toContain("fehlgeschlagen");
    expect(uncertainty.text).not.toContain("wurde nicht angelegt");
  });

  it("nennt den Grund für den fehlenden Retry", () => {
    expect(uncertainty.text).toContain("keinen Idempotenzschlüssel");
    expect(uncertainty.text).toContain("NICHT erneut gesendet");
    expect(uncertainty.text).toContain("bb_postings_create_free jetzt nicht noch einmal aufrufen");
  });

  it("nennt das Prüfwerkzeug mit den konkreten Werten des fehlgeschlagenen Aufrufs", () => {
    expect(uncertainty.hasReadPath).toBe(true);
    expect(uncertainty.verification).toContain("bb_postings_search aufrufen");
    expect(uncertainty.verification).toContain('date_from="2026-08-14"');
    expect(uncertainty.verification).toContain('date_to="2026-08-14"');
    expect(uncertainty.verification).toContain('postingtext "Büromaterial August"');
    expect(uncertainty.verification).toContain('amount "1190.00"');
  });

  it("sagt beide Ausgänge der Prüfung durch", () => {
    expect(uncertainty.verification).toContain("Ist der Vorgang vorhanden");
    expect(uncertainty.verification).toContain("Ist er nicht vorhanden");
    expect(uncertainty.verification).toContain(
      "darf der ursprüngliche Aufruf mit denselben Argumenten wiederholt werden",
    );
  });

  it("nennt den Auslöser und den Endpunkt", () => {
    expect(uncertainty.headline).toContain("lief nach 30 s in das Zeitlimit");
    expect(uncertainty.headline).toContain("/postings/add/free");
  });
});

describe("Die Auslöser", () => {
  function build(cause: Parameters<typeof buildWriteUncertainty>[0]["cause"]) {
    return buildWriteUncertainty({
      toolName: "bb_receipts_upload",
      specPath: "/receipts/upload",
      cause,
      verifyWith: VERIFY_PATH,
      args: ARGUMENTS,
    });
  }

  it("benennt Zeitlimit, Netzwerkabbruch, Serverfehler, Drosselung und unklare Antwort", () => {
    expect(build({ kind: "timeout", timeoutMs: 120_000 }).headline).toContain("120 s");
    expect(build({ kind: "network", detail: "ECONNRESET" }).headline).toContain("ECONNRESET");
    expect(build({ kind: "server-error", status: 500, errorCode: 0 }).headline).toContain(
      "HTTP 500",
    );
    expect(build({ kind: "server-error", status: 500, errorCode: 0 }).headline).toContain(
      "error_code 0",
    );
    expect(build({ kind: "throttle", status: 403 }).headline).toContain("vorübergehend");
    expect(build({ kind: "unclear-response", detail: "kein JSON" }).headline).toContain(
      "keine verwertbare Antwort",
    );
  });

  it("sagt bei einer Drosselung ausdrücklich, dass der Zeitpunkt nicht belegt ist", () => {
    expect(build({ kind: "throttle", status: 403 }).reason).toContain("nicht belegt");
  });
});

describe("Der Prüfweg ohne lesendes Gegenstück", () => {
  it("verweist auf die Weboberfläche und nennt die Begründung des Registers", () => {
    const uncertainty = buildWriteUncertainty({
      toolName: "bb_comments_create",
      specPath: "/comments/add",
      cause: { kind: "timeout", timeoutMs: 30_000 },
      verifyWith: {
        kind: "none",
        reason: "Die API bietet keinen Endpunkt, Kommentare zu lesen.",
      },
      args: {},
    });
    expect(uncertainty.hasReadPath).toBe(false);
    expect(uncertainty.verification).toContain("keinen Leseweg");
    expect(uncertainty.verification).toContain("Weboberfläche");
    expect(uncertainty.verification).toContain("Ist der Vorgang vorhanden");
  });

  it("sagt es auch, wenn der Registereintrag gar keinen Prüfweg führt", () => {
    const uncertainty = buildWriteUncertainty({
      toolName: "bb_irgendwas",
      specPath: "/irgendwo",
      cause: { kind: "network", detail: "abgebrochen" },
      args: {},
    });
    expect(uncertainty.hasReadPath).toBe(false);
    expect(uncertainty.verification).toContain("kein Prüfweg hinterlegt");
  });
});

describe("Platzhalter und Werte", () => {
  it("setzt Platzhalter aus den Argumenten ein", () => {
    expect(fillHint("nach {postingtext} suchen", ARGUMENTS)).toBe(
      'nach "Büromaterial August" suchen',
    );
  });

  it("erfindet nichts, wenn ein Argument fehlt", () => {
    expect(fillHint("nach {gibt_es_nicht} suchen", ARGUMENTS)).toBe("nach (nicht gesendet) suchen");
  });

  it("stellt Werte kurz und ohne vollständigen Rumpf dar", () => {
    expect(formatArgumentValue("amount", 1190)).toBe("1190");
    expect(formatArgumentValue("deleted", true)).toBe("true");
    expect(formatArgumentValue("counterparty", null)).toBe("null");
    expect(formatArgumentValue("positions", [1, 2, 3])).toBe("Liste mit 3 Eintrag/Einträgen");
    expect(formatArgumentValue("order", { date: "ASC" })).toBe('{ date: "ASC" }');
    expect(formatArgumentValue("gross", { a: 1, b: 2, c: 3, d: 4 })).toBe("Objekt mit 4 Feldern");
    expect(formatArgumentValue("text", "y".repeat(300))).toHaveLength(123);
  });

  it("gibt den Wert eines Geheimnisfeldes nie aus", () => {
    expect(formatArgumentValue("api_key", "abc123")).toBe("[redacted]");
    expect(formatArgumentValue("API_SECRET", "abc123")).toBe("[redacted]");
  });

  it("schwärzt angemeldete Geheimnisse im fertigen Text", () => {
    registerSecret("geheimer-mandantenschluessel");
    const uncertainty = buildWriteUncertainty({
      toolName: "bb_postings_create_free",
      specPath: "/postings/add/free",
      cause: { kind: "network", detail: "Verbindung zu geheimer-mandantenschluessel verloren" },
      verifyWith: VERIFY_PATH,
      args: ARGUMENTS,
    });
    expect(uncertainty.text).not.toContain("geheimer-mandantenschluessel");
    expect(uncertainty.text).toContain("[redacted]");
  });
});
