/**
 * Der einzige erlaubte Ausgabeweg des Servers neben dem MCP-Protokoll.
 *
 * stdout gehört der Protokollverbindung: Eine einzige fremde Zeile dort zerstört die
 * JSON-RPC-Sitzung (Risiko R8). Alles, was der Server mitzuteilen hat, geht
 * deshalb über dieses Modul nach stderr, und jede Zeile läuft vorher durch die Schwärzung.
 */

import fs from "node:fs";

import { redact } from "../config/redact.js";

/** Protokollstufen, absteigende Dringlichkeit. */
export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const SEVERITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/** Vorgabe aus 6.2. Sie gilt auch, bevor die Konfiguration aufgelöst ist. */
const DEFAULT_LEVEL: LogLevel = "warn";

let currentLevel: LogLevel = DEFAULT_LEVEL;

/** Schlüssel bereits ausgegebener Einmalmeldungen. */
const seenOnce = new Set<string>();

/** Setzt die Protokollstufe. Ruft `resolve.ts` beim Start genau einmal auf. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export function isLevelEnabled(level: LogLevel): boolean {
  return SEVERITY[level] <= SEVERITY[currentLevel];
}

/**
 * Schreibt einen Block unverändert nach stderr, ohne Stufenpräfix, aber geschwärzt.
 * Gedacht für die mehrzeilige Startmeldung und für Abbruchtexte.
 */
export function writeStderrBlock(text: string): void {
  const redacted = redact(text);
  process.stderr.write(redacted.endsWith("\n") ? redacted : `${redacted}\n`);
}

/**
 * Wie {@link writeStderrBlock}, schreibt aber blockierend auf den Dateideskriptor 2.
 *
 * Gedacht für den letzten Text vor `process.exit`: Hängt stderr an einer Pipe — so startet
 * jeder MCP-Client den Server —, dann schreibt Node dorthin auf POSIX asynchron, und ein
 * unmittelbar folgendes `process.exit` verwirft den Puffer. Genau die Abbruchmeldung wäre
 * damit verloren.
 */
export function writeStderrBlockSync(text: string): void {
  const redacted = redact(text);
  const payload = redacted.endsWith("\n") ? redacted : `${redacted}\n`;
  try {
    fs.writeSync(2, payload);
  } catch {
    // Ein nicht blockierender Deskriptor kann EAGAIN melden. Dann bleibt der gewöhnliche Weg.
    process.stderr.write(payload);
  }
}

/**
 * Setzt die fertige Ausgabe einer Protokollmeldung zusammen: geschwärzt, jede Zeile mit dem
 * Stufenpräfix, abgeschlossen mit einem Zeilenumbruch.
 *
 * Steht getrennt vom Schreiben, damit {@link logWarnAlways} dasselbe Format erzeugt wie
 * {@link logWarn}, ohne die Stufenprüfung zu durchlaufen.
 */
function format(level: LogLevel, message: string): string {
  // Jede Zeile trägt das Präfix. Auf stderr laufen mehrere Prozesse zusammen; eine
  // Folgezeile ohne Präfix wäre dort nicht mehr zuzuordnen.
  const prefix = `bbutler-mcp ${level}: `;
  const lines = redact(message).split("\n");
  return `${lines.map((line) => `${prefix}${line}`).join("\n")}\n`;
}

function emit(level: LogLevel, message: string): void {
  if (!isLevelEnabled(level)) {
    return;
  }
  process.stderr.write(format(level, message));
}

export function logError(message: string): void {
  emit("error", message);
}

export function logWarn(message: string): void {
  emit("warn", message);
}

/**
 * Schreibt eine Warnzeile, ohne die Protokollstufe zu befragen. Format und Präfix sind
 * dieselben wie bei {@link logWarn}, die Zeile ist also von einer gewöhnlichen Warnung nicht
 * zu unterscheiden; nur der Weg dorthin führt an {@link isLevelEnabled} vorbei.
 *
 * Es gibt sie, weil eine Zusicherung sonst nur zufällig gilt. Die Warnung über ein zu kurzes,
 * also **nicht** geschwärztes Zugangsdatum (`MIN_SECRET_LENGTH` in `src/config/redact.ts`)
 * erscheint beim Serverstart auch bei `BB_MCP_LOG_LEVEL=error`, weil dort die Anmeldung der
 * Geheimnisse vor `setLogLevel` läuft. Im Einrichtungsassistenten steht die Stufe zum
 * Zeitpunkt der Anmeldung bereits, und dieselbe Warnung fiele bei `error` still aus — und
 * zwar genau für die Zugangsdatendatei, den vom Assistenten empfohlenen Weg. Eine
 * sicherheitsnahe Meldung darf nicht davon abhängen, in welcher Reihenfolge ein Aufrufer
 * zufällig arbeitet.
 *
 * **Sparsam verwenden.** Wer die Stufe auf `error` stellt, will Ruhe haben, und jede weitere
 * unstummbare Zeile nimmt der Einstellung ihre Bedeutung. Begründet ist das nur dort, wo das
 * Verschweigen selbst ein Sicherheitsproblem wäre. Alles andere gehört zu {@link logWarn}.
 */
export function logWarnAlways(message: string): void {
  process.stderr.write(format("warn", message));
}

export function logInfo(message: string): void {
  emit("info", message);
}

export function logDebug(message: string): void {
  emit("debug", message);
}

/**
 * Gibt eine Meldung höchstens einmal je Prozesslauf aus. Für wiederkehrende Befunde, die
 * beim zweiten Mal nur noch Lärm sind — etwa ein unbekanntes Antwortfeld.
 */
export function logOnce(key: string, level: LogLevel, message: string): void {
  if (seenOnce.has(key)) {
    return;
  }
  seenOnce.add(key);
  emit(level, message);
}

/** Setzt Stufe und Einmalgedächtnis zurück. Für Tests. */
export function resetLoggingForTests(): void {
  currentLevel = DEFAULT_LEVEL;
  seenOnce.clear();
}
