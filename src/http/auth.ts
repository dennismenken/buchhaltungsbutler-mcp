/**
 * Der Basic-Auth-Header und der gehashte Mandantenschlüssel.
 *
 * Die API trennt **wer ruft auf** von **für wen wird aufgerufen** (`grundlagen.md` 2.1):
 * API Client und API Secret bilden das Anmeldepaar im `Authorization`-Header, der `api_key`
 * wählt im Body den Mandanten. Dieses Modul erzeugt den Header und den Eimerschlüssel des
 * Rate-Limiters; den `api_key` selbst setzt ausschließlich `client.ts` in den Body.
 *
 * **Der Header wird nie protokolliert.** Damit das auch dann gilt, wenn ihn später jemand
 * versehentlich in eine Meldung schreibt, wird der erzeugte base64-Wert bei der Schwärzung
 * angemeldet (`config/redact.ts`). Ein Leck wäre nicht durch Disziplin zu verhindern.
 */

import { createHash } from "node:crypto";

import { registerSecret } from "../config/redact.js";

/** Der Name des Headers, immer klein geschrieben, damit es nur eine Schreibweise gibt. */
export const AUTHORIZATION_HEADER = "authorization";

/**
 * Prüft das Anmeldepaar, bevor daraus ein Header wird.
 *
 * Ein Doppelpunkt im API Client ist der einzige Fall, der stillschweigend falsch würde:
 * RFC 7617 trennt Benutzername und Passwort am **ersten** Doppelpunkt, die Gegenstelle läse
 * also ein verkürztes Secret und antwortete mit HTTP 401, ohne dass jemand die Ursache sähe.
 * Ebenso verboten sind Steuerzeichen, weil sie in einem Headerwert nicht zulässig sind.
 *
 * @returns Leere Zeichenkette, wenn das Paar brauchbar ist, sonst der Grund. Der Grund
 *          enthält **keinen** der beiden Werte.
 */
export function checkBasicCredentials(apiClient: string, apiSecret: string): string {
  if (apiClient === "") {
    return "Der API Client ist leer.";
  }
  if (apiSecret === "") {
    return "Das API Secret ist leer.";
  }
  if (apiClient.includes(":")) {
    return (
      "Der API Client enthält einen Doppelpunkt. HTTP Basic trennt Benutzername und Passwort " +
      "am ersten Doppelpunkt; die Zugangsdaten wären damit nicht übertragbar."
    );
  }
  if (hasControlCharacter(apiClient) || hasControlCharacter(apiSecret)) {
    return "API Client oder API Secret enthält ein Steuerzeichen und ist als Header nicht übertragbar.";
  }
  return "";
}

/**
 * Baut den vollständigen Headerwert `Basic <base64>`.
 *
 * `Buffer.from(…, "utf8")` statt `btoa`: `btoa` scheitert an jedem Zeichen außerhalb von
 * Latin-1 und ist zeichenweise langsamer. Ein Secret mit Umlaut oder Eurozeichen
 * ist damit kein Sonderfall.
 *
 * @throws Error, wenn {@link checkBasicCredentials} das Paar verwirft. Der Aufrufer prüft
 *         vorher selbst und erzeugt daraus einen Werkzeugfehler; dieser Wurf ist die
 *         Absicherung dagegen, dass die Prüfung später einmal übersprungen wird.
 */
export function basicAuthHeader(apiClient: string, apiSecret: string): string {
  const problem = checkBasicCredentials(apiClient, apiSecret);
  if (problem !== "") {
    throw new Error(`Der Authorization-Header ist nicht baubar: ${problem}`);
  }
  const encoded = Buffer.from(`${apiClient}:${apiSecret}`, "utf8").toString("base64");
  // Ab jetzt kann dieser Wert in keiner Ausgabe mehr auftauchen, auch nicht als Teilstück
  // eines längeren Textes. registerSecret ist ab dem zweiten Aufruf ein Nulltarif.
  registerSecret(encoded);
  return `Basic ${encoded}`;
}

/**
 * `true`, wenn der Wert ein Steuerzeichen enthält.
 *
 * Geprüft wird über Codepunkte und nicht über eine Zeichenklasse im Quelltext: Ein
 * Steuerzeichen **wörtlich** in einer Quelldatei ist unsichtbar und damit selbst ein
 * Fallstrick.
 */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Der Schlüssel, unter dem der Rate-Limiter die Eimer eines Mandanten führt.
 *
 * Das Minutenlimit gilt je Mandant, der Mandant hängt am `api_key`. Gespeichert wird nicht
 * der Schlüssel selbst, sondern sein Hash: Eimernamen landen in Protokollzeilen und in
 * Diagnoseausgaben, und der `api_key` ist ein Geheimnis. 16 Hexzeichen sind 64 Bit und damit
 * für eine Handvoll Profile je Prozess kollisionsfrei.
 */
export function tenantKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex").slice(0, 16);
}
