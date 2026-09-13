/**
 * Der globale undici-Dispatcher: Keep-Alive und Proxy-Unterstützung aus der Umgebung
 * (Plan 5.1).
 *
 * Es gibt keinen zweiten HTTP-Stack. Gesprochen wird ausschließlich über das eingebaute
 * `fetch` von Node; `undici` liefert nur den Dispatcher darunter. `setGlobalDispatcher` ist
 * der offiziell dokumentierte Weg, dieses `fetch` zu konfigurieren.
 *
 * **`EnvHttpProxyAgent` statt eines eigenen Agents**, weil sonst hinter einem
 * Unternehmensproxy nichts mehr funktioniert: Er liest `HTTP_PROXY`, `HTTPS_PROXY` und
 * `NO_PROXY` selbst aus und verhält sich ohne diese Variablen wie ein gewöhnlicher Agent mit
 * Keep-Alive. Die Auswertung der Proxy-Variablen durch Node selbst ist experimentell und
 * flaggenabhängig und deshalb keine Grundlage (Plan 13.1).
 *
 * **Kein Cookie-Jar.** Das eingebaute `fetch` führt keinen, und es wird keiner nachgerüstet:
 * Die API setzt Sitzungs- und Load-Balancer-Cookies (`grundlagen.md` 3.3), und eine über
 * Mandanten hinweg geteilte Sitzung wäre ein Risiko. `Set-Cookie` wird damit verworfen.
 */

import {
  Agent,
  EnvHttpProxyAgent,
  getGlobalDispatcher,
  MockAgent,
  setGlobalDispatcher,
} from "undici";

import { logDebug } from "../logging/stderr.js";

/**
 * Keep-Alive-Einstellungen.
 *
 * Ein MCP-Server ruft in Schüben auf: Ein Agent stellt drei Fragen hintereinander, dann ist
 * Minuten Ruhe. 30 Sekunden offenhalten erspart jedem Schub nach dem ersten Aufruf den
 * TLS-Handschlag; länger offenhalten bringt nichts, weil die Gegenstelle die Verbindung
 * ohnehin irgendwann schließt. Die Obergrenze der gleichzeitigen Verbindungen ist bewusst
 * klein: Der Rate-Limiter (5.4) begrenzt die Gleichzeitigkeit schon, und mehr Verbindungen
 * würden nur das Minutenkontingent des Mandanten schneller verbrauchen.
 */
export const KEEP_ALIVE_OPTIONS: Agent.Options = {
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 8,
};

let installed = false;

/** `true`, wenn {@link installGlobalDispatcher} in diesem Prozess schon gewirkt hat. */
export function isDispatcherInstalled(): boolean {
  return installed;
}

/**
 * Setzt den globalen Dispatcher. Genau einmal je Prozess, beim Aufbau des Servers
 * beziehungsweise vor dem ersten Unterbefehl, der die API anspricht.
 *
 * Zwei Fälle lassen die Funktion bewusst nichts tun:
 *
 * - Sie wurde schon aufgerufen. Ein zweiter Agent würde die offenen Verbindungen des ersten
 *   hinter sich lassen, ohne sie zu schließen.
 * - Es ist ein `MockAgent` installiert. Das ist der Testaufbau aus 9.1, dessen
 *   `disableNetConnect()` jeden echten Netzzugriff verhindert. Ihn zu ersetzen würde die
 *   Netzsperre des Testlaufs stillschweigend aufheben — genau das, was nicht passieren darf.
 *
 * @returns `true`, wenn der Dispatcher gesetzt wurde.
 */
export function installGlobalDispatcher(): boolean {
  if (installed) {
    return false;
  }
  if (getGlobalDispatcher() instanceof MockAgent) {
    logDebug(
      "Es ist ein MockAgent als globaler Dispatcher eingehängt; der Proxy- und " +
        "Keep-Alive-Dispatcher wird nicht gesetzt.",
    );
    return false;
  }
  setGlobalDispatcher(new EnvHttpProxyAgent(KEEP_ALIVE_OPTIONS));
  installed = true;
  logDebug("Globaler Dispatcher gesetzt: EnvHttpProxyAgent mit Keep-Alive.");
  return true;
}

/** Vergisst, dass der Dispatcher gesetzt wurde. Ausschließlich für Tests. */
export function resetDispatcherStateForTests(): void {
  installed = false;
}
