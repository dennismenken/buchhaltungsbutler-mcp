/**
 * Content-Type-Prüfung und Umschlagzerlegung, vier Stufen in fester Reihenfolge.
 *
 * 1. **Content-Type.** Beginnt der Wert nicht mit `application/json`, wird der Körper nicht
 *    geparst, sondern ein {@link NonJsonResponseError} geworfen. Die Prüfung läuft über den
 *    Header und nicht über ein `try` um `JSON.parse`: Ein `try` fängt den Fehler zwar auch,
 *    verliert aber die Information, dass die Gegenstelle gar nicht als API geantwortet hat.
 *    Der Fall ist belegt — der literale Pfad `/transactions/get/id_by_customer` liefert eine
 *    HTML-Fehlerseite (Befund L1 in docs/api/live-befunde.md).
 * 2. **JSON-Zerlegung.**
 * 3. **Umschlagform.** Objekt mit booleschem `success`.
 * 4. **Erfolg oder Fehler.** Geprüft wird `success === false`, nicht das Vorhandensein von
 *    `error_code`; zusätzlich gilt jeder Status außerhalb von 2xx als Fehler.
 *
 * Bei Erfolg wird die Form gegen das Feld `shape` des Registereintrags gehalten: `list`
 * erwartet ein Array in `data`, `object` ein Objekt (der Einzelabruf liefert **kein** `rows`,
 * Befund L2 in docs/api/live-befunde.md), `ack` gar keine Nutzdaten.
 */

import { redact } from "../config/redact.js";
import type { ToolEntry } from "../registry/types.js";
import {
  ApiResponseError,
  EnvelopeContractError,
  MalformedJsonError,
  NonJsonResponseError,
  type TransportErrorContext,
} from "./transport-error.js";

/** Die drei erwarteten Umschlagformen aus dem Registereintrag. */
export type EnvelopeShape = ToolEntry["shape"];

/** Zahl der Zeichen, die aus einem nicht verwertbaren Körper übernommen werden. */
export const FOREIGN_TEXT_LIMIT = 200;

/**
 * Eine Abweichung, die den Aufruf nicht scheitern lässt, aber in der Antwort auftaucht.
 *
 * Die Grenze zum {@link EnvelopeContractError} ist bewusst gezogen: Die **Form** der
 * Nutzdaten ist der Vertrag und wird erzwungen, weil eine Liste, die als Objekt kommt, jede
 * weitere Verarbeitung falsch macht. Begleitangaben wie `rows` werden dagegen gemeldet und
 * ersetzt, nicht zum Abbruch erhoben: Ein fehlendes `rows` macht die Zeilen nicht unbrauchbar,
 * und ein Abbruch dafür nähme dem Agenten Daten weg, die er schon hat.
 */
export interface EnvelopeWarning {
  readonly code: string;
  readonly text: string;
}

interface EnvelopeBase {
  readonly status: number;
  /** Das Feld `message` der Antwort, wörtlich; `null`, wenn es fehlte oder leer war. */
  readonly message: string | null;
  /** Der vollständige Antwortkörper. Unbekannte Felder bleiben erhalten, nichts entfällt. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly warnings: readonly EnvelopeWarning[];
}

/** Eine Erfolgsantwort, aufgeschlüsselt nach der im Register erwarteten Form. */
export type SuccessEnvelope =
  | (EnvelopeBase & {
      readonly shape: "list";
      /**
       * Die Zeilenzahl **dieser Antwort**, niemals eine Gesamttrefferzahl
       * (Befund L5 in docs/api/live-befunde.md).
       */
      readonly rows: number;
      readonly data: readonly unknown[];
    })
  | (EnvelopeBase & {
      readonly shape: "object";
      readonly data: Readonly<Record<string, unknown>>;
    })
  | (EnvelopeBase & {
      readonly shape: "ack";
      /** Reine Aktionsendpunkte liefern nichts; kommt doch etwas, wird es durchgereicht. */
      readonly data: unknown;
    });

/** `true`, wenn der Content-Type JSON ankündigt. Zusätze wie `; charset=utf-8` sind erlaubt. */
export function isJsonContentType(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  // Die API antwortet mit application/json; +json deckt Varianten wie application/problem+json
  // ab, die ein Zwischenknoten einsetzen könnte und die zerlegbar sind.
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

/**
 * Entfernt Zeichen, die in einem Text nichts zu suchen haben, der später in eine Meldung
 * oder in eine Antwort gelangt: Steuerzeichen und die Bidi-Steuerzeichen, mit denen sich
 * Text optisch umsortieren lässt. Zeilenumbrüche und Tabulatoren werden zu Leerzeichen.
 *
 * Der Wortlaut bleibt dabei erhalten; es wird kein Zeichen ersetzt, das etwas bedeutet. Die
 * vollständige Neutralisierung von Fremdtext in Antworten ist Sache von `response/sanitize.ts`;
 * hier geschieht nur das Nötige, damit ein Fehlertext nicht manipulierbar ist.
 */
export function stripUnsafeCharacters(text: string): string {
  // Zuerst die Zeilenstruktur: Tabulator, Zeilenumbruch und Wagenrücklauf werden zu einem
  // Leerzeichen, damit aus einer mehrzeiligen Fremdmeldung eine Zeile wird.
  const singleLine = text.replace(/[\t\n\r]+/g, " ");
  let out = "";
  for (const char of singleLine) {
    if (!isUnsafeCodePoint(char.codePointAt(0) ?? 0)) {
      out += char;
    }
  }
  return out;
}

/**
 * Die Zeichen, die aus Fremdtext verschwinden.
 *
 * Geprüft wird über Codepunkte und nicht über eine Zeichenklasse im Quelltext: Ein
 * Steuerzeichen oder ein Bidi-Zeichen **wörtlich** in einer Quelldatei ist unsichtbar und
 * damit selbst die Art Fallstrick, gegen die diese Funktion gebaut ist.
 */
function isUnsafeCodePoint(code: number): boolean {
  // C0-Steuerzeichen, DEL und die C1-Steuerzeichen. Tabulator, Zeilenumbruch und
  // Wagenrücklauf sind an dieser Stelle schon Leerzeichen.
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
    return true;
  }
  // Bidi-Steuerzeichen: Mit ihnen lässt sich angezeigter Text umsortieren, ohne dass es im
  // Zeichenbestand auffällt — ein Weg, einem Agenten etwas anderes zu zeigen als dasteht.
  if (code === 0x200e || code === 0x200f) {
    return true;
  }
  if (code >= 0x202a && code <= 0x202e) {
    return true;
  }
  if (code >= 0x2066 && code <= 0x2069) {
    return true;
  }
  return false;
}

/**
 * Macht aus einem nicht verwertbaren Antwortkörper einen kurzen, gefahrlosen Auszug:
 * Markup entfernen, Steuerzeichen entfernen, Leerraum zusammenfassen, auf
 * {@link FOREIGN_TEXT_LIMIT} Zeichen kürzen, schwärzen.
 *
 * Das Entfernen von Markup ist kein Schönheitsschritt: Eine HTML-Fehlerseite besteht in den
 * ersten 200 Zeichen fast nur aus `<!DOCTYPE html><head><meta …>` und sagt dem Agenten dann
 * nichts. Ohne Markup steht dort die Meldung.
 */
export function foreignTextExcerpt(raw: string, limit: number = FOREIGN_TEXT_LIMIT): string {
  const withoutMarkup = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const collapsed = stripUnsafeCharacters(withoutMarkup).replace(/\s+/g, " ").trim();
  const cut = collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
  return redact(cut === "" ? "(leerer Körper)" : cut);
}

/** Der Wortlaut des Feldes `message`, von Steuerzeichen befreit und geschwärzt. */
function readMessage(body: Record<string, unknown>): string | null {
  const raw = body.message;
  if (typeof raw !== "string") {
    return null;
  }
  const cleaned = redact(stripUnsafeCharacters(raw)).trim();
  return cleaned === "" ? null : cleaned;
}

/**
 * Der `error_code` der Antwort.
 *
 * Gemessen liefert die API eine JSON-Zahl. Eine Zahl in Anführungszeichen wird trotzdem
 * angenommen, weil dieselbe API Beträge, Kennungen und Booleans als Zeichenketten führt
 * (Befund L3 in docs/api/live-befunde.md) und ein hier verworfener Code den ganzen
 * Fehlerkatalog umgehen würde.
 */
function readErrorCode(body: Record<string, unknown>): number | null {
  const raw = body.error_code;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
    return Number.parseInt(raw.trim(), 10);
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `ein Array mit ${value.length} Element(en)`;
  }
  if (value === undefined) {
    return "nicht vorhanden";
  }
  return typeof value === "object" ? "ein Objekt" : `vom Typ ${typeof value}`;
}

export interface ParseEnvelopeInput {
  readonly status: number;
  readonly contentType: string | null;
  readonly bodyText: string;
  /** Die im Registereintrag erwartete Form. */
  readonly shape: EnvelopeShape;
  readonly context: TransportErrorContext;
}

/**
 * Zerlegt die Antwort in vier Stufen.
 *
 * @returns Die Erfolgsantwort, passend zur erwarteten Form.
 * @throws {NonJsonResponseError} Stufe 1.
 * @throws {MalformedJsonError} Stufe 2.
 * @throws {EnvelopeContractError} Stufe 3, der Widerspruch aus Stufe 4 und eine Form, die
 *         nicht zum `shape` des Eintrags passt.
 * @throws {ApiResponseError} Stufe 4, wenn die API ablehnt: `success: false` oder ein
 *         HTTP-Status außerhalb von 2xx.
 */
export function parseEnvelope(input: ParseEnvelopeInput): SuccessEnvelope {
  const { status, contentType, bodyText, shape, context } = input;
  const ok = status >= 200 && status < 300;

  // Stufe 1: Content-Type, vor jedem Parsen.
  if (!isJsonContentType(contentType)) {
    throw new NonJsonResponseError(context, {
      status,
      contentType,
      bodyExcerpt: foreignTextExcerpt(bodyText),
    });
  }

  // Stufe 2: Zerlegung.
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new MalformedJsonError(context, { status, bodyExcerpt: foreignTextExcerpt(bodyText) });
  }

  // Stufe 3: Umschlagform.
  if (!isPlainObject(parsed)) {
    throw new EnvelopeContractError(
      `Die Antwort auf ${context.specPath} ist kein JSON-Objekt, sondern ${describeValue(parsed)}. ` +
        "Eine Antwort ohne Umschlag darf nicht als Erfolg durchgehen.",
      context,
      { status, violation: "not-an-object" },
    );
  }
  const body: Record<string, unknown> = parsed;

  if (!("success" in body)) {
    throw new EnvelopeContractError(
      `Die Antwort auf ${context.specPath} trägt kein Feld success (HTTP ${status}). ` +
        "Das ist entweder eine andere Schnittstelle oder ein Zwischenknoten; beides darf nicht " +
        "als Erfolg durchgehen.",
      context,
      { status, violation: "success-missing" },
    );
  }
  if (typeof body.success !== "boolean") {
    throw new EnvelopeContractError(
      `Das Feld success der Antwort auf ${context.specPath} ist kein Boolean, sondern ` +
        `${describeValue(body.success)}.`,
      context,
      { status, violation: "success-not-boolean" },
    );
  }

  const message = readMessage(body);

  // Stufe 4: Erfolg oder Fehler. Beide Merkmale werden ausgewertet, nicht nur eines.
  if (!body.success) {
    throw new ApiResponseError(context, {
      status,
      errorCode: readErrorCode(body),
      apiMessage: message,
      body: Object.freeze({ ...body }),
    });
  }
  if (!ok) {
    // Ein HTTP 400 mit success: true ist ein Widerspruch. Er wird gemeldet und nicht zugunsten
    // einer der beiden Angaben aufgelöst, weil jede Auflösung eine Tatsachenbehauptung wäre.
    throw new EnvelopeContractError(
      `Die Antwort auf ${context.specPath} meldet success: true, der HTTP-Status ist aber ${status}. ` +
        "Status und Umschlag widersprechen sich; der Aufruf wird nicht als Erfolg behandelt.",
      context,
      { status, violation: "ok-contradiction" },
    );
  }

  const warnings: EnvelopeWarning[] = [];
  const data = body.data;

  switch (shape) {
    case "list": {
      if (!Array.isArray(data)) {
        throw new EnvelopeContractError(
          `${context.toolName} erwartet eine Liste in data; geliefert wurde ${describeValue(data)} ` +
            `(${context.specPath}).`,
          context,
          { status, violation: "shape-mismatch" },
        );
      }
      const rawRows = body.rows;
      let rows: number;
      if (typeof rawRows === "number" && Number.isInteger(rawRows) && rawRows >= 0) {
        rows = rawRows;
        if (rows !== data.length) {
          warnings.push({
            code: "rows-mismatch",
            text:
              `Die Antwort meldet rows: ${rows}, enthält aber ${data.length} Zeile(n). ` +
              "Maßgeblich sind die gelieferten Zeilen.",
          });
        }
      } else if (typeof rawRows === "string" && /^\d+$/.test(rawRows.trim())) {
        // Dieselbe API liefert Beträge, Kennungen und Booleans als Zeichenketten (L3); eine
        // Zahl in Anführungszeichen ist hier kein Grund, die Zeilen zu verwerfen.
        rows = Number.parseInt(rawRows.trim(), 10);
      } else {
        rows = data.length;
        warnings.push({
          code: "rows-missing",
          text:
            "Die Listenantwort trägt kein brauchbares Feld rows; die Zeilenzahl stammt aus der " +
            "gelieferten Liste selbst.",
        });
      }
      return { status, message, body: Object.freeze({ ...body }), warnings, shape, rows, data };
    }
    case "object": {
      if (!isPlainObject(data)) {
        throw new EnvelopeContractError(
          `${context.toolName} erwartet ein Objekt in data; geliefert wurde ${describeValue(data)} ` +
            `(${context.specPath}).`,
          context,
          { status, violation: "shape-mismatch" },
        );
      }
      if ("rows" in body) {
        // Gemessen trägt der Einzelabruf kein rows (L2). Taucht es auf, ist das ein Hinweis auf
        // eine Änderung der API und gehört gemeldet, nicht verschwiegen.
        warnings.push({
          code: "rows-unexpected",
          text: `Der Einzelabruf ${context.specPath} liefert unerwartet ein Feld rows.`,
        });
      }
      return {
        status,
        message,
        body: Object.freeze({ ...body }),
        warnings,
        shape,
        data: Object.freeze({ ...data }),
      };
    }
    case "ack": {
      if (data !== undefined && data !== null) {
        // Nicht als Vertragsbruch: Zusätzliche Nutzdaten wegzuwerfen oder den Aufruf dafür
        // scheitern zu lassen, wäre beides schlechter als sie zu melden und mitzugeben.
        warnings.push({
          code: "ack-data-unexpected",
          text:
            `${context.specPath} ist ein reiner Aktionsendpunkt, liefert hier aber Nutzdaten ` +
            `(${describeValue(data)}). Sie werden unverändert weitergegeben.`,
        });
      }
      return {
        status,
        message,
        body: Object.freeze({ ...body }),
        warnings,
        shape,
        data: data ?? null,
      };
    }
  }
}
