import { describe, expect, it } from "vitest";

import {
  FOREIGN_TEXT_LIMIT,
  foreignTextExcerpt,
  isJsonContentType,
  parseEnvelope,
  stripUnsafeCharacters,
  type EnvelopeShape,
} from "../../src/http/envelope.js";
import {
  ApiResponseError,
  EnvelopeContractError,
  FOREIGN_TEXT_MARKER,
  MalformedJsonError,
  NonJsonResponseError,
} from "../../src/http/transport-error.js";

// Die vier Stufen in ihrer Reihenfolge. Die Fälle sind aus den Live-Befunden
// abgeleitet: Der Listenabruf trägt `rows`, der Einzelabruf nicht (L2), und ein
// unbekannter Pfad liefert HTML statt JSON (Befund 1 der Live-Befunde).

const READING_CONTEXT = {
  toolName: "bb_receipts_search",
  specPath: "/receipts/get",
  toolClass: "R",
} as const;
const WRITING_CONTEXT = {
  toolName: "bb_postings_create_free",
  specPath: "/postings/add/free",
  toolClass: "B",
} as const;

function parse(options: {
  status?: number;
  contentType?: string | null;
  bodyText: string;
  shape?: EnvelopeShape;
  context?: typeof READING_CONTEXT | typeof WRITING_CONTEXT;
}) {
  return parseEnvelope({
    status: options.status ?? 200,
    contentType: options.contentType === undefined ? "application/json" : options.contentType,
    bodyText: options.bodyText,
    shape: options.shape ?? "list",
    context: options.context ?? READING_CONTEXT,
  });
}

describe("Stufe 1: Content-Type vor dem Parsen", () => {
  it("erkennt application/json mit und ohne Zusatz", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("APPLICATION/JSON")).toBe(true);
    expect(isJsonContentType("application/problem+json")).toBe(true);
    expect(isJsonContentType("text/html; charset=UTF-8")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });

  it("parst eine HTML-Fehlerseite nicht, sondern meldet sie als Fremdtext", () => {
    // Der gemessene Fall: der literale Pfad /transactions/get/id_by_customer existiert nicht
    // und liefert HTML (Live-Befunde, Befund 1). Ein JSON.parse darauf ergäbe eine
    // irreführende Meldung über eine unerwartete Zeichenfolge.
    const html =
      "<!DOCTYPE html><html><head><title>404 Not Found</title></head>" +
      "<body><h1>Not Found</h1><p>The requested URL was not found on this server.</p></body></html>";
    let caughtError: unknown;
    try {
      parse({ status: 404, contentType: "text/html; charset=UTF-8", bodyText: html });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(NonJsonResponseError);
    const nonJson = caughtError as NonJsonResponseError;
    expect(nonJson.status).toBe(404);
    expect(nonJson.contentType).toBe("text/html; charset=UTF-8");
    expect(nonJson.bodyExcerpt).toContain("404 Not Found");
    expect(nonJson.bodyExcerpt).not.toContain("<");
    expect(nonJson.message).toContain(FOREIGN_TEXT_MARKER);
    expect(nonJson.code).toBe("non-json-response");
  });

  it("behandelt eine fehlende Content-Type-Angabe wie eine fremde Antwort", () => {
    expect(() => parse({ contentType: null, bodyText: '{"success":true}' })).toThrow(
      NonJsonResponseError,
    );
  });
});

describe("foreignTextExcerpt", () => {
  it("kürzt auf 200 Zeichen und entfernt Markup", () => {
    const excerpt = foreignTextExcerpt(`<p>${"a".repeat(500)}</p>`);
    expect(excerpt.length).toBe(FOREIGN_TEXT_LIMIT + 1); // 200 Zeichen plus Auslassungszeichen
    expect(excerpt.startsWith("a")).toBe(true);
  });

  it("wirft Skript- und Stilinhalte weg statt sie zu zitieren", () => {
    const excerpt = foreignTextExcerpt(
      "<script>alert('x')</script><style>b{}</style><p>Wartung</p>",
    );
    expect(excerpt).toBe("Wartung");
  });

  it("entfernt Steuer- und Bidi-Zeichen", () => {
    // Aus Codepunkten gebaut: Ein Steuer- oder Bidi-Zeichen wörtlich in der Quelldatei
    // wäre unsichtbar und damit selbst eine Falle.
    const controlChar = String.fromCodePoint(0);
    const bidi = String.fromCodePoint(0x202e);
    expect(stripUnsafeCharacters(`a${controlChar}b${bidi}c`)).toBe("abc");
    expect(stripUnsafeCharacters("Zeile 1\nZeile 2")).toBe("Zeile 1 Zeile 2");
  });

  it("nennt einen leeren Körper ausdrücklich", () => {
    expect(foreignTextExcerpt("")).toBe("(leerer Körper)");
  });
});

describe("Stufe 2: Zerlegung", () => {
  it("meldet kaputtes JSON getrennt vom falschen Content-Type", () => {
    let caughtError: unknown;
    try {
      parse({ bodyText: '{"success": tru' });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(MalformedJsonError);
    expect((caughtError as MalformedJsonError).bodyExcerpt).toContain('{"success": tru');
  });
});

describe("Stufe 3: Umschlagform", () => {
  it("lehnt einen Körper ohne success ab", () => {
    let caughtError: unknown;
    try {
      parse({ bodyText: '{"rows":1,"data":[]}' });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(EnvelopeContractError);
    expect((caughtError as EnvelopeContractError).violation).toBe("success-missing");
  });

  it("lehnt ein nicht boolesches success ab", () => {
    let caughtError: unknown;
    try {
      parse({ bodyText: '{"success":"true","data":[]}' });
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as EnvelopeContractError).violation).toBe("success-not-boolean");
  });

  it("lehnt eine Antwort ab, die kein Objekt ist", () => {
    let caughtError: unknown;
    try {
      parse({ bodyText: "[1,2,3]" });
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as EnvelopeContractError).violation).toBe("not-an-object");
  });
});

describe("Stufe 4: Erfolg oder Fehler", () => {
  it("behandelt HTTP 200 mit success: false als Fehler", () => {
    // Geprüft wird success, nicht das Vorhandensein von error_code, und nicht nur der Status.
    let caughtError: unknown;
    try {
      parse({
        status: 200,
        bodyText: '{"success":false,"error_code":5,"message":"invalid list_direction specified"}',
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(ApiResponseError);
    const api = caughtError as ApiResponseError;
    expect(api.status).toBe(200);
    expect(api.errorCode).toBe(5);
    expect(api.apiMessage).toBe("invalid list_direction specified");
  });

  it("nimmt einen error_code auch als Zeichenkette an", () => {
    // Dieselbe API liefert Beträge, Kennungen und Booleans als Zeichenketten (L3).
    let caughtError: unknown;
    try {
      parse({
        status: 400,
        bodyText: '{"success":false,"error_code":"15","message":"invalid field specified"}',
      });
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as ApiResponseError).errorCode).toBe(15);
  });

  it("meldet einen Widerspruch zwischen Status und success", () => {
    let caughtError: unknown;
    try {
      parse({ status: 400, bodyText: '{"success":true,"rows":0,"data":[]}' });
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as EnvelopeContractError).violation).toBe("ok-contradiction");
  });

  it("trägt bei einem schreibenden Werkzeug ab HTTP 500 den Zustand unbekannt", () => {
    const errorFor = (status: number): ApiResponseError => {
      try {
        parse({
          status,
          bodyText: `{"success":false,"error_code":${status === 504 ? 30 : 15},"message":"x"}`,
          context: WRITING_CONTEXT,
        });
      } catch (error) {
        return error as ApiResponseError;
      }
      throw new Error("Es wurde kein Fehler geworfen.");
    };
    expect(errorFor(403).changed).toBe("nein");
    expect(errorFor(504).changed).toBe("unbekannt");
    // Lesend ändert sich nie etwas, gleich wie der Aufruf ausgeht.
    let readOnlyError: ApiResponseError | null = null;
    try {
      parse({ status: 504, bodyText: '{"success":false,"error_code":30,"message":"timeout"}' });
    } catch (error) {
      readOnlyError = error as ApiResponseError;
    }
    expect(readOnlyError?.changed).toBe("nein");
  });
});

describe("Formabgleich gegen das Feld shape", () => {
  it("nimmt die Listenform mit rows an", () => {
    const envelope = parse({
      bodyText: '{"success":true,"message":"","rows":1,"data":[{"id_by_customer":"2"}]}',
      shape: "list",
    });
    expect(envelope.shape).toBe("list");
    if (envelope.shape === "list") {
      expect(envelope.rows).toBe(1);
      expect(envelope.data).toHaveLength(1);
    }
    expect(envelope.warnings).toHaveLength(0);
  });

  it("nimmt die leere Seite an", () => {
    const envelope = parse({ bodyText: '{"success":true,"rows":0,"data":[]}', shape: "list" });
    if (envelope.shape === "list") {
      expect(envelope.rows).toBe(0);
      expect(envelope.data).toHaveLength(0);
    }
  });

  it("meldet ein fehlendes rows, ohne die Zeilen zu verwerfen", () => {
    const envelope = parse({
      bodyText: '{"success":true,"data":[{"a":1},{"a":2}]}',
      shape: "list",
    });
    if (envelope.shape === "list") {
      expect(envelope.rows).toBe(2);
    }
    expect(envelope.warnings.map((warning) => warning.code)).toContain("rows-missing");
  });

  it("nimmt rows auch als Zeichenkette an", () => {
    const envelope = parse({
      bodyText: '{"success":true,"rows":"2","data":[{"a":1},{"a":2}]}',
      shape: "list",
    });
    if (envelope.shape === "list") {
      expect(envelope.rows).toBe(2);
    }
    expect(envelope.warnings).toHaveLength(0);
  });

  it("nennt in der Meldung, was statt der erwarteten Form kam", () => {
    const reasonFor = (bodyText: string, shape: EnvelopeShape): string => {
      try {
        parse({ bodyText, shape });
      } catch (error) {
        return (error as EnvelopeContractError).message;
      }
      throw new Error("Es wurde kein Fehler geworfen.");
    };
    expect(reasonFor('{"success":true,"data":null}', "list")).toContain("null");
    expect(reasonFor('{"success":true}', "list")).toContain("nicht vorhanden");
    expect(reasonFor('{"success":true,"data":"text"}', "object")).toContain("vom Typ string");
    expect(reasonFor('{"success":true,"data":[1,2]}', "object")).toContain("Array mit 2");
    expect(reasonFor('{"success":true,"data":{}}', "list")).toContain("ein Objekt");
  });

  it("meldet ein rows, das nicht zur Zeilenzahl passt", () => {
    const envelope = parse({
      bodyText: '{"success":true,"rows":7,"data":[{"a":1}]}',
      shape: "list",
    });
    expect(envelope.warnings.map((warning) => warning.code)).toContain("rows-mismatch");
  });

  it("lehnt ein Objekt ab, wo eine Liste erwartet wird", () => {
    let caughtError: unknown;
    try {
      parse({ bodyText: '{"success":true,"data":{"id_by_customer":"2"}}', shape: "list" });
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as EnvelopeContractError).violation).toBe("shape-mismatch");
  });

  it("nimmt den Einzelabruf als Objekt ohne rows an", () => {
    // Gemessen (L2): Der Einzelabruf liefert data als Objekt und trägt kein rows.
    const envelope = parse({
      bodyText: '{"success":true,"message":"","data":{"id_by_customer":"2","amount":"884.65"}}',
      shape: "object",
    });
    expect(envelope.shape).toBe("object");
    if (envelope.shape === "object") {
      expect(envelope.data.amount).toBe("884.65");
    }
    expect(envelope.warnings).toHaveLength(0);
  });

  it("meldet ein unerwartetes rows am Einzelabruf", () => {
    const envelope = parse({
      bodyText: '{"success":true,"rows":1,"data":{"id_by_customer":"2"}}',
      shape: "object",
    });
    expect(envelope.warnings.map((warning) => warning.code)).toContain("rows-unexpected");
  });

  it("lehnt eine Liste ab, wo ein Objekt erwartet wird", () => {
    let caughtError: unknown;
    try {
      parse({ bodyText: '{"success":true,"data":[]}', shape: "object" });
    } catch (error) {
      caughtError = error;
    }
    expect((caughtError as EnvelopeContractError).violation).toBe("shape-mismatch");
  });

  it("nimmt die reine Bestätigung ohne Nutzdaten an", () => {
    const envelope = parse({ bodyText: '{"success":true,"message":"ok"}', shape: "ack" });
    expect(envelope.shape).toBe("ack");
    expect(envelope.message).toBe("ok");
    expect(envelope.warnings).toHaveLength(0);
  });

  it("reicht unerwartete Nutzdaten einer Bestätigung weiter und meldet sie", () => {
    const envelope = parse({ bodyText: '{"success":true,"data":{"id":1}}', shape: "ack" });
    expect(envelope.warnings.map((warning) => warning.code)).toContain("ack-data-unexpected");
    if (envelope.shape === "ack") {
      expect(envelope.data).toEqual({ id: 1 });
    }
  });
});

describe("Der vollständige Körper bleibt erhalten", () => {
  it("reicht Felder durch, die die Spezifikation nicht kennt", () => {
    // Belegt (Befund L4 in docs/api/live-befunde.md): amount_paid und amount_paid_fixed
    // kommen, obwohl die Spezifikation sie nicht führt. Ein geschlossenes Schema machte den
    // Server bei der nächsten Änderung unbrauchbar.
    const envelope = parse({
      bodyText:
        '{"success":true,"rows":1,"data":[{"amount":"119.00","amount_paid":"0.00","amount_paid_fixed":"0"}]}',
      shape: "list",
    });
    if (envelope.shape === "list") {
      expect(envelope.data[0]).toHaveProperty("amount_paid_fixed", "0");
    }
    expect(envelope.body).toHaveProperty("rows", 1);
  });
});
