/**
 * Der gefährlichste Zustand der ganzen Anwendung: ein **schreibender** Aufruf ohne verwertbare
 * Antwort (Plan 5.7).
 *
 * Auslöser sind Zeitlimit, Verbindungsabbruch, HTTP 5xx und jede Antwort, die dieser Server
 * nicht als Antwort der API lesen konnte, an einem Werkzeug der Klassen A, AR, M, D oder B.
 * Dazu kommt die Klasse `transient` an einem schreibenden Werkzeug (Plan 5.6): Ob eine
 * Drosselung vor oder nach dem Schreiben gegriffen hat, ist nicht belegt.
 *
 * Vier Eigenschaften des Textes sind Absicht und werden von `errors-write-uncertainty.test.ts`
 * einzeln geprüft:
 *
 * 1. Er behauptet **keinen Fehlschlag**. Der Ausgang ist offen, und genau das steht da.
 * 2. Er nennt den Grund für den fehlenden Retry: Die API kennt keinen Idempotenzschlüssel.
 * 3. Er nennt das Prüfwerkzeug **mit den konkreten Werten aus dem fehlgeschlagenen Aufruf**.
 * 4. Er sagt **beide** Ausgänge der Prüfung durch. Ohne den letzten Satz wiederholt ein
 *    vorsichtiger Agent gar nichts und ein unvorsichtiger sofort.
 */

import { redact } from "../config/redact.js";
import type { VerifySpec } from "../registry/types.js";

/** Die Überschrift. Sie steht am Anfang und ist der Anker für Tests und für den Menschen. */
export const UNCERTAINTY_HEADLINE = "UNGEWISSER AUSGANG.";

/**
 * Argumentnamen, deren **Wert** unter keinen Umständen in einen Text gelangt (Plan 5.8, P9).
 *
 * Der `api_key` kommt planmäßig nie in den Argumenten vor — der Client setzt ihn, und Guard 3
 * weist ihn in den Argumenten ab. Die Liste ist trotzdem da: Sie kostet nichts, und die Zusage
 * „kein Geheimnis in einem Fehlertext" darf nicht davon abhängen, dass eine andere Schicht
 * ihre Zusage hält.
 */
const SECRET_ARGUMENT_NAMES = /^(api_key|api_client|api_secret|authorization|password|secret)$/i;

/** Obergrenze für einen einzelnen dargestellten Wert. */
const VALUE_LIMIT = 120;

/**
 * Ein einzelner Argumentwert, kurz und gefahrlos dargestellt.
 *
 * Zeichenketten stehen in Anführungszeichen, Zahlen und Booleans nackt. Listen und Objekte
 * werden **zusammengefasst und nicht ausgeschrieben**: In einen Fehlertext gehört der
 * konkrete Wert, der das Problem verursacht hat, und niemals der vollständige Request-Körper
 * (Plan 5.8).
 */
export function formatArgumentValue(name: string, value: unknown): string {
  if (SECRET_ARGUMENT_NAMES.test(name)) {
    return "[redacted]";
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "(nicht gesendet)";
  }
  if (typeof value === "string") {
    const shortened = value.length > VALUE_LIMIT ? `${value.slice(0, VALUE_LIMIT)}…` : value;
    return `"${shortened}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `Liste mit ${value.length} Eintrag/Einträgen`;
  }
  if (typeof value === "object") {
    const fields = value as Record<string, unknown>;
    const entries = Object.entries(fields);
    if (entries.length <= 3) {
      // Ein kleines Objekt sagt als Ganzes mehr als eine Zusammenfassung; der `order`-Parameter
      // ist der Regelfall und besteht aus einem einzigen Paar.
      const pairs = entries.map(([key, content]) => `${key}: ${formatArgumentValue(key, content)}`);
      return `{ ${pairs.join(", ")} }`;
    }
    return `Objekt mit ${entries.length} Feldern`;
  }
  return "(nicht darstellbar)";
}

/** `name="wert"`, wie es im Prüfaufruf steht. */
function formatArgumentPair(name: string, value: unknown): string {
  return `${name}=${formatArgumentValue(name, value)}`;
}

/**
 * Setzt die Platzhalter `{feld}` eines `hint` aus den Argumenten des fehlgeschlagenen Aufrufs.
 *
 * Der Hinweis im Registereintrag ist ein deutscher Satzteil und trägt die fachlichen Werte als
 * Platzhalter, weil nur der Registereintrag weiß, welche Felder einen Vorgang wiedererkennbar
 * machen — bei einer freien Buchung sind das `postingtext` und `amount`, bei einem Beleg die
 * Belegnummer. Ein Platzhalter ohne Argument wird zu `(nicht gesendet)`; erfunden wird nichts.
 */
export function fillHint(hint: string, args: Readonly<Record<string, unknown>>): string {
  return hint.replace(/\{([a-z0-9_]+)\}/gi, (_treffer, name: string) =>
    formatArgumentValue(name, args[name]),
  );
}

/** Warum dieser Aufruf ohne verwertbare Antwort geblieben ist. */
export type WriteUncertaintyCause =
  | { readonly kind: "timeout"; readonly timeoutMs: number }
  | { readonly kind: "network"; readonly detail: string }
  | { readonly kind: "server-error"; readonly status: number; readonly errorCode: number | null }
  | { readonly kind: "throttle"; readonly status: number }
  | { readonly kind: "unclear-response"; readonly detail: string };

export interface WriteUncertaintyInput {
  readonly toolName: string;
  /** Der unveränderte Spezifikationspfad (Plan 4.6 Regel 6). */
  readonly specPath: string;
  readonly cause: WriteUncertaintyCause;
  /** Der Prüfweg aus dem Registereintrag. Pflichtfeld bei jedem schreibenden Werkzeug (P10). */
  readonly verifyWith?: VerifySpec;
  /** Die Argumente des fehlgeschlagenen Aufrufs, ohne `api_key`. */
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface WriteUncertainty {
  /** Überschrift plus der Satz, was geschehen ist. Geht in den Block `[Was]` (Plan 5.8). */
  readonly headline: string;
  /** Warum dieser Server nicht erneut gesendet hat. Geht in den Block `[Warum]`. */
  readonly reason: string;
  /** Der Prüfweg mit konkreten Werten und beiden Ausgängen. Geht in den Block `[Wie]`. */
  readonly verification: string;
  /** Der zusammenhängende Text aus Plan 5.7, für Protokoll und Tests. */
  readonly text: string;
  /** `true`, wenn der Prüfweg ein Werkzeug nennt; `false` bei der Weboberfläche. */
  readonly hasReadPath: boolean;
}

function describeCause(input: WriteUncertaintyInput): string {
  const { toolName, specPath, cause } = input;
  switch (cause.kind) {
    case "timeout":
      return `${toolName} lief nach ${Math.round(cause.timeoutMs / 1000)} s in das Zeitlimit, während ${specPath} aufgerufen wurde.`;
    case "network":
      return `Die Verbindung brach ab, während ${toolName} den Endpunkt ${specPath} aufgerufen hat: ${cause.detail}`;
    case "server-error":
      return (
        `BuchhaltungsButler hat auf ${specPath} mit HTTP ${cause.status} geantwortet` +
        `${cause.errorCode === null ? "" : ` (error_code ${cause.errorCode})`}, während ${toolName} lief.`
      );
    case "throttle":
      return `BuchhaltungsButler hat ${specPath} mit HTTP ${cause.status} als vorübergehend eingeschränkt gemeldet, während ${toolName} lief.`;
    case "unclear-response":
      return `${toolName} hat auf ${specPath} keine verwertbare Antwort erhalten: ${cause.detail}`;
  }
}

function describeReason(input: WriteUncertaintyInput): string {
  const base =
    `BuchhaltungsButler hat den Vorgang möglicherweise ausgeführt, möglicherweise nicht; die API ` +
    `kennt keinen Idempotenzschlüssel, deshalb hat dieser Server NICHT erneut gesendet. ` +
    `${input.toolName} jetzt nicht noch einmal aufrufen.`;
  if (input.cause.kind === "throttle") {
    // Die Drosselung ist der einzige Auslöser, bei dem die API sauber geantwortet hat. Ob sie
    // vor oder nach dem Schreiben gegriffen hat, ist nicht belegt — und genau deshalb steht der
    // Ausgang auch hier als offen da (Plan 5.6, Zeile `transient`).
    return `${base} Die Einschränkung ist vorübergehend; ob sie vor oder nach dem Schreiben gegriffen hat, ist nicht belegt.`;
  }
  return base;
}

/** Der Satz, der beide Ausgänge der Prüfung durchsagt. Er fehlt nie. */
const BOTH_OUTCOMES =
  "Ist der Vorgang vorhanden, war der Aufruf erfolgreich und es ist nichts weiter zu tun. " +
  "Ist er nicht vorhanden, darf der ursprüngliche Aufruf mit denselben Argumenten wiederholt werden.";

function describeVerification(input: WriteUncertaintyInput): {
  text: string;
  hasReadPath: boolean;
} {
  const args = input.args ?? {};
  const verifyWith = input.verifyWith;

  if (verifyWith === undefined) {
    return {
      text:
        "Für dieses Werkzeug ist kein Prüfweg hinterlegt. Vor jedem weiteren Aufruf in der " +
        `Weboberfläche von BuchhaltungsButler nachsehen, ob ${input.specPath} gewirkt hat. ` +
        BOTH_OUTCOMES,
      hasReadPath: false,
    };
  }

  if (verifyWith.kind === "none") {
    return {
      text:
        `Die API bietet für diesen Vorgang keinen Leseweg: ${verifyWith.reason} In der ` +
        "Weboberfläche von BuchhaltungsButler nachsehen. " +
        BOTH_OUTCOMES,
      hasReadPath: false,
    };
  }

  const pairs = Object.entries(verifyWith.argsFrom).map(([targetName, sourceName]) =>
    formatArgumentPair(targetName, args[sourceName]),
  );
  const withValues = pairs.length === 0 ? "" : ` mit ${pairs.join(", ")}`;
  const hint = verifyWith.hint.trim();
  const extra = hint.length === 0 ? "" : ` und ${fillHint(hint, args)}`;
  return {
    text:
      `Zuerst prüfen, ob der Aufruf gewirkt hat: ${verifyWith.tool} aufrufen${withValues}${extra}. ` +
      BOTH_OUTCOMES,
    hasReadPath: true,
  };
}

/**
 * Erzeugt den Text aus Plan 5.7 aus `verifyWith` und den Argumenten des fehlgeschlagenen
 * Aufrufs.
 */
export function buildWriteUncertainty(input: WriteUncertaintyInput): WriteUncertainty {
  const headline = redact(`${UNCERTAINTY_HEADLINE} ${describeCause(input)}`);
  const reason = redact(describeReason(input));
  const verification = describeVerification(input);
  const verificationText = redact(verification.text);
  return {
    headline,
    reason,
    verification: verificationText,
    text: [headline, reason, verificationText].join("\n"),
    hasReadPath: verification.hasReadPath,
  };
}
