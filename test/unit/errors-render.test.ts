import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSecrets, registerSecret } from "../../src/config/redact.js";
import {
  composeMessage,
  type ErrorMessage,
  renderRejectedBeforeRequest,
  renderTransportFailure,
  SPEC_TEXT_NOTE,
  STATE_NOTHING_SENT,
  STATE_REJECTED,
  STATE_SENTENCES,
  STATE_UNKNOWN,
  selectStateSentence,
} from "../../src/errors/render.js";
import {
  ApiResponseError,
  CancelledError,
  EnvelopeContractError,
  InvalidRequestError,
  MalformedJsonError,
  NetworkError,
  NonJsonResponseError,
  RateLimitGiveUpError,
  TimeoutError,
  type TransportErrorContext,
} from "../../src/http/transport-error.js";
import type { VerifySpec } from "../../src/registry/types.js";

const READ_CONTEXT: TransportErrorContext = {
  toolName: "bb_receipts_search",
  specPath: "/receipts/get",
  toolClass: "R",
};

const WRITE_CONTEXT: TransportErrorContext = {
  toolName: "bb_postings_create_free",
  specPath: "/postings/add/free",
  toolClass: "B",
};

const VERIFY_PATH: VerifySpec = {
  kind: "tool",
  tool: "bb_postings_search",
  argsFrom: { date_from: "date", date_to: "date" },
  hint: "nach postingtext {postingtext} mit amount {amount} suchen",
};

function apiError(
  context: TransportErrorContext,
  status: number,
  errorCode: number | null,
  apiMessage: string | null,
): ApiResponseError {
  return new ApiResponseError(context, {
    status,
    errorCode,
    apiMessage,
    body: { success: false, error_code: errorCode, message: apiMessage },
  });
}

/** Die Zeile des Blocks `[Zustand]`, ohne Beschriftung. */
function stateLine(message: ErrorMessage): string {
  const line = message.text.split("\n").find((z) => z.startsWith("[Zustand] "));
  return line === undefined ? "" : line.slice("[Zustand] ".length);
}

afterEach(() => {
  clearSecrets();
  vi.restoreAllMocks();
});

describe("Der Vierblock", () => {
  it("trägt vier Blöcke in fester Reihenfolge", async () => {
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified"),
    );
    const lines = message.text.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]?.startsWith("[Was] ")).toBe(true);
    expect(lines[1]?.startsWith("[Warum] ")).toBe(true);
    expect(lines[2]?.startsWith("[Wie] ")).toBe(true);
    expect(lines[3]?.startsWith("[Zustand] ")).toBe(true);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(12);
    }
  });

  it("setzt die Blöcke immer über composeMessage zusammen", () => {
    const text = composeMessage({
      was: "a",
      warum: "b",
      wie: "c",
      zustand: STATE_NOTHING_SENT,
    });
    expect(text).toBe(`[Was] a\n[Warum] b\n[Wie] c\n[Zustand] ${STATE_NOTHING_SENT}`);
  });
});

describe("Die drei Zustandsformulierungen", () => {
  it("kennt genau drei", () => {
    expect(STATE_SENTENCES).toHaveLength(3);
    expect(new Set(STATE_SENTENCES).size).toBe(3);
  });

  it("wählt sie nach der Lage des Fehlers", () => {
    expect(selectStateSentence("not-sent", false)).toBe(STATE_NOTHING_SENT);
    expect(selectStateSentence("rejected", false)).toBe(STATE_REJECTED);
    expect(selectStateSentence("unclear", false)).toBe(STATE_UNKNOWN);
    // Ein vorübergehender Zustand an einem schreibenden Werkzeug weitet die Lage auf.
    expect(selectStateSentence("rejected", true)).toBe(STATE_UNKNOWN);
  });

  it("benutzt über die ganze Bandbreite an Fehlern nur diese drei, zeichengenau", async () => {
    const messages = await Promise.all([
      renderTransportFailure(apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified")),
      renderTransportFailure(apiError(READ_CONTEXT, 401, 3, "API credentials unknown or invalid")),
      renderTransportFailure(apiError(READ_CONTEXT, 500, 0, "error while processing the request")),
      renderTransportFailure(apiError(WRITE_CONTEXT, 400, 6, "no date specified"), {
        verifyWith: VERIFY_PATH,
      }),
      renderTransportFailure(new TimeoutError(READ_CONTEXT, 15_000)),
      renderTransportFailure(new TimeoutError(WRITE_CONTEXT, 30_000), { verifyWith: VERIFY_PATH }),
      renderTransportFailure(new NetworkError(READ_CONTEXT, "ECONNRESET")),
      renderTransportFailure(new CancelledError(READ_CONTEXT, "before-request")),
      renderTransportFailure(new CancelledError(WRITE_CONTEXT, "in-flight"), {
        verifyWith: VERIFY_PATH,
      }),
      renderTransportFailure(
        new InvalidRequestError("Zugangsdaten fehlen.", READ_CONTEXT, "no-credentials"),
      ),
      renderTransportFailure(
        new RateLimitGiveUpError(READ_CONTEXT, {
          bucket: "default",
          waitMs: 31_000,
          limitMs: 30_000,
        }),
      ),
      renderTransportFailure(
        new NonJsonResponseError(READ_CONTEXT, {
          status: 404,
          contentType: "text/html",
          bodyExcerpt: "Not Found",
        }),
      ),
      renderTransportFailure(
        new MalformedJsonError(READ_CONTEXT, { status: 200, bodyExcerpt: "{kaputt" }),
      ),
      renderTransportFailure(
        new EnvelopeContractError("Kein success.", READ_CONTEXT, {
          status: 200,
          violation: "success-missing",
        }),
      ),
    ]);
    const seen = new Set(messages.map(stateLine));
    for (const sentence of seen) {
      expect(STATE_SENTENCES as readonly string[]).toContain(sentence);
    }
    // Alle drei kommen vor; ein Satz, den nichts auslöst, wäre toter Text.
    expect(seen.size).toBe(3);
  });

  it("lehnt jede vierte Formulierung ab", async () => {
    const forbidden = [
      // Inhaltlich dasselbe, anderer Wortlaut: schlägt fehl, und das ist Absicht.
      "Es wurde nichts geändert.",
      "Der Aufruf ist fehlgeschlagen.",
      "Möglicherweise wurde etwas geändert.",
      // Nur die Großschreibung weicht ab. Der Vergleich ist zeichengenau.
      "Es ist unbekannt, ob BuchhaltungsButler diese Anfrage verarbeitet hat.",
    ];
    const messages = await Promise.all([
      renderTransportFailure(apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified")),
      renderTransportFailure(new TimeoutError(WRITE_CONTEXT, 30_000), { verifyWith: VERIFY_PATH }),
      Promise.resolve(
        renderRejectedBeforeRequest({
          toolName: "bb_receipts_create",
          was: "Der Nur-Lesen-Schalter ist gesetzt.",
          warum: "BB_MCP_READ_ONLY steht auf true.",
          wie: "Den Schalter entfernen oder ein lesendes Werkzeug wählen.",
        }),
      ),
    ]);
    for (const message of messages) {
      for (const sentence of forbidden) {
        expect(stateLine(message)).not.toBe(sentence);
      }
    }
  });

  it("nimmt bei einer Ablehnung vor dem Request Satz 1", () => {
    const message = renderRejectedBeforeRequest({
      toolName: "bb_receipts_create",
      was: "Der Nur-Lesen-Schalter ist gesetzt.",
      warum: "BB_MCP_READ_ONLY steht auf true.",
      wie: "Den Schalter entfernen oder bb_receipts_search benutzen.",
    });
    expect(stateLine(message)).toBe(STATE_NOTHING_SENT);
    expect(message.uncertainWrite).toBe(false);
  });
});

describe("Der Wortlaut der Antwort gewinnt", () => {
  it("zitiert den live gemessenen Text, der in keiner Spezifikationsquelle steht", async () => {
    // Befund L6 in docs/api/live-befunde.md: /receipts/get lieferte zu Code 15 den Text
    // `invalid field specified` — weder
    // die description (`invalid sort field is specified`) noch das message-Enum
    // (`invalid sort field specified`).
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 15, "invalid field specified"),
      { args: { order: { nicht_existierendes_feld: "ASC" } } },
    );
    expect(message.text).toContain('"invalid field specified"');
    expect(message.text).toContain("Fremdtext der Gegenstelle");
    // Der Katalogtext tritt NICHT an die Stelle des Wortlauts, und der Zusatz für den
    // Ersatzfall steht deshalb auch nicht da.
    expect(message.text).not.toContain(SPEC_TEXT_NOTE);
    expect(message.cls).toBe("input");
  });

  it("setzt den Katalogtext nur ein, wenn die Antwort keinen Text trägt, und kennzeichnet ihn", async () => {
    const message = await renderTransportFailure(apiError(READ_CONTEXT, 400, 15, null));
    expect(message.text).toContain("invalid sort field specified");
    expect(message.text).toContain(SPEC_TEXT_NOTE);
  });

  it("nennt die Kurzfassung der Spezifikation nur, wenn sie abweicht", async () => {
    const differing = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 15, "invalid field specified"),
    );
    expect(differing.text).toContain("invalid sort field is specified");
    const matching = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified"),
    );
    expect(matching.text).not.toContain("Kurzfassung laut Spezifikation");
  });
});

describe("Die Blöcke [Warum] und [Wie] je Klasse", () => {
  it("nennt bei einem Eingabefehler Feld, gesendeten Wert und den erneuten Aufruf", async () => {
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified"),
      { args: { list_direction: "quatsch" } },
    );
    expect(message.text).toContain("list_direction");
    expect(message.text).toContain('Gesendet wurde list_direction="quatsch"');
    expect(message.text).toContain("bb_receipts_search erneut aufrufen");
  });

  it("nennt bei einem ungültigen Wert alle erlaubten und den wahrscheinlich gemeinten", async () => {
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified"),
      {
        args: { list_direction: "incomming" },
        allowedValues: { list_direction: ["incoming", "outgoing"] },
      },
    );
    expect(message.text).toContain("Erlaubt sind: incoming, outgoing.");
    expect(message.text).toContain("Gemeint war wahrscheinlich incoming.");
  });

  it("nennt bei einer überschrittenen Grenze das billigere Aufrufmuster", async () => {
    const batchContext: TransportErrorContext = {
      toolName: "bb_receipts_create_batch",
      specPath: "/receipts/addBatch",
      toolClass: "A",
    };
    const message = await renderTransportFailure(
      apiError(batchContext, 400, 5, "Number of receipts exceeded"),
      { verifyWith: { kind: "none", reason: "Die API bietet keinen Leseweg." } },
    );
    expect(message.text).toContain("Höchstens 50 Belege je Aufruf");
    expect(message.text).toContain("billiger als 50 Einzelaufrufe");
  });

  it("nennt bei einem Zugangsfehler die betroffenen Werte und den Unterbefehl", async () => {
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 401, 3, "API credentials unknown or invalid"),
    );
    expect(message.cls).toBe("config");
    expect(message.text).toContain("api_client");
    expect(message.text).toContain("api_secret");
    expect(message.text).toContain("bbutler-mcp doctor");
  });

  it("nennt bei einem endgültigen Zustand das Werkzeug, mit dem er vorher zu prüfen ist", async () => {
    const context: TransportErrorContext = {
      toolName: "bb_postings_create_for_receipt",
      specPath: "/postings/add/receipt",
      toolClass: "B",
    };
    const message = await renderTransportFailure(apiError(context, 400, 7, "receipt is deleted"), {
      verifyWith: {
        kind: "tool",
        tool: "bb_receipts_get",
        argsFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
        hint: "",
      },
    });
    expect(message.cls).toBe("final");
    expect(message.text).toContain("bb_receipts_get");
  });

  it("trägt bei einem Sonderfall den ausformulierten Hinweis", async () => {
    const bwaContext: TransportErrorContext = {
      toolName: "bb_reports_get_bwa",
      specPath: "/reports/get/bwa",
      toolClass: "R",
    };
    const message = await renderTransportFailure(
      apiError(bwaContext, 400, 8, "report generation has not been finished yet"),
    );
    expect(message.cls).toBe("special");
    expect(message.text).toContain("Etwa zwei Sekunden warten");
    expect(message.text).toContain("bb_reports_create_bwa nicht noch einmal aufrufen");
  });
});

describe("Die Sonderfälle widersprechen sich nicht selbst", () => {
  it("ersetzt bei einem Zwischenstand den Rat der Klasse final, statt ihn zu ergänzen", async () => {
    const bwaContext: TransportErrorContext = {
      toolName: "bb_reports_get_bwa",
      specPath: "/reports/get/bwa",
      toolClass: "R",
    };
    const message = await renderTransportFailure(
      apiError(bwaContext, 400, 8, "report generation has not been finished yet"),
    );
    // „Ein erneuter Aufruf ändert daran nichts" und „etwa zwei Sekunden warten und erneut
    // aufrufen" im selben Block wären das Gegenteil voneinander.
    expect(message.text).toContain("Etwa zwei Sekunden warten");
    expect(message.text).not.toContain("ändert daran nichts");
  });

  it("nennt keine Kurzfassung, wenn eine Lesart den Text aufgelöst hat", async () => {
    // Der Katalogtext zu (/transactions/add, 23) ist `no post and files content received or
    // declined` und gehört damit zur ANDEREN Lesart. Als Kurzfassung dieser Antwort stünde er
    // falsch da.
    const transactionContext: TransportErrorContext = {
      toolName: "bb_transactions_create",
      specPath: "/transactions/add",
      toolClass: "A",
    };
    const message = await renderTransportFailure(
      apiError(transactionContext, 400, 23, "invalid booking text specified"),
      { args: { booking_text: "Miete Januar" } },
    );
    expect(message.text).not.toContain("Kurzfassung laut Spezifikation");
    expect(message.text).not.toContain("no post and files content received or declined");
    expect(message.text).toContain("am Code allein sind sie nicht zu unterscheiden");
  });

  it("behauptet bei einem unbekannten Paar nicht, ein erneuter Aufruf helfe nicht", async () => {
    // Die warn-Zeile der Rückfallregel ist hier nicht der Prüfgegenstand (das prüft
    // errors-classify.test.ts); sie wird nur aus der Testausgabe gehalten.
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const message = await renderTransportFailure(apiError(READ_CONTEXT, 400, 777, "something new"));
    stderr.mockRestore();
    expect(message.cls).toBe("final");
    expect(message.text).toContain("die Spezifikation für diesen Pfad nicht führt");
    expect(message.text).toContain("keinem gleichnamigen Code eines anderen Pfades");
  });
});

describe("Der Sonderfall 5.7 in der Meldung", () => {
  it("erzeugt ihn bei einem Zeitlimit an einem schreibenden Werkzeug", async () => {
    const message = await renderTransportFailure(new TimeoutError(WRITE_CONTEXT, 30_000), {
      verifyWith: VERIFY_PATH,
      args: { date: "2026-08-14", postingtext: "Büromaterial August", amount: "1190.00" },
    });
    expect(message.uncertainWrite).toBe(true);
    expect(stateLine(message)).toBe(STATE_UNKNOWN);
    expect(message.text).toContain("UNGEWISSER AUSGANG.");
    expect(message.text).toContain("bb_postings_search");
    expect(message.text).toContain('date_from="2026-08-14"');
    expect(message.text).toContain("Büromaterial August");
    expect(message.text).toContain("darf der ursprüngliche Aufruf");
  });

  it("erzeugt ihn bei einer Drosselung an einem schreibenden Werkzeug", async () => {
    // Zeile `transient`: Retry nur bei Klasse R, sonst der Sondertext. Auch bei
    // HTTP 403, weil nicht belegt ist, ob die Einschränkung vor oder nach dem Schreiben griff.
    const context: TransportErrorContext = {
      toolName: "bb_transactions_create",
      specPath: "/transactions/add",
      toolClass: "A",
    };
    const message = await renderTransportFailure(
      apiError(context, 403, 15, "adding temporarily restricted"),
      {
        verifyWith: {
          kind: "tool",
          tool: "bb_transactions_search",
          argsFrom: { date_from: "booking_date", date_to: "booking_date" },
          hint: "nach to_from {to_from} suchen",
        },
        args: { booking_date: "2026-08-14", to_from: "Musterlieferant" },
      },
    );
    expect(message.cls).toBe("transient");
    expect(message.uncertainWrite).toBe(true);
    expect(stateLine(message)).toBe(STATE_UNKNOWN);
    expect(message.text).toContain("bb_transactions_search");
    expect(message.text).toContain("nicht belegt");
  });

  it("erzeugt ihn NICHT an einem lesenden Werkzeug", async () => {
    const message = await renderTransportFailure(new TimeoutError(READ_CONTEXT, 15_000));
    expect(message.uncertainWrite).toBe(false);
    // Satz 3 bleibt trotzdem richtig: Nach einem Zeitlimit ist offen, ob die Anfrage
    // verarbeitet wurde. Geändert hat ein lesender Aufruf dabei nichts.
    expect(stateLine(message)).toBe(STATE_UNKNOWN);
    expect(message.text).not.toContain("UNGEWISSER AUSGANG.");
    expect(message.text).toContain("folgenlos wiederholbar");
  });
});

describe("Was nie in einen Fehlertext gelangt", () => {
  it("gibt keinen angemeldeten Geheimniswert aus", async () => {
    registerSecret("streng-geheimes-secret");
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 401, 3, "API credentials unknown or invalid: streng-geheimes-secret"),
    );
    expect(message.text).not.toContain("streng-geheimes-secret");
    expect(message.text).toContain("[redacted]");
  });

  it("gibt keinen Wert eines Geheimnisfeldes aus, auch wenn er in den Argumenten steht", async () => {
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 5, "invalid list_direction specified"),
      { args: { list_direction: "quatsch", api_key: "abc123" } },
    );
    expect(message.text).not.toContain("abc123");
  });

  it("kürzt einen langen Wert und schreibt den Rumpf nicht aus", async () => {
    const message = await renderTransportFailure(
      apiError(READ_CONTEXT, 400, 9, "invalid counterparty specified"),
      { args: { counterparty: "x".repeat(400), list_direction: "incoming" } },
    );
    // Gekürzt auf 120 Zeichen plus Auslassungszeichen.
    expect(message.text).not.toContain("x".repeat(200));
    expect(message.text).toContain(`${"x".repeat(120)}…`);
    // Nur das beanstandete Feld steht da, nicht der ganze Rumpf.
    expect(message.text).not.toContain("incoming");
  });

  it("nennt bei einem Paar ohne Feldzuordnung keinen geratenen Wert", async () => {
    const context: TransportErrorContext = {
      toolName: "bb_postings_create_for_receipt",
      specPath: "/postings/add/receipt",
      toolClass: "B",
    };
    const message = await renderTransportFailure(
      apiError(context, 400, 5, "invalid posting type specified"),
      { args: { type: "x".repeat(400), positions: [1, 2, 3, 4] } },
    );
    expect(message.text).not.toContain("x".repeat(20));
    expect(message.text).toContain("ordnet diesem Paar kein einzelnes Feld zu");
  });
});
