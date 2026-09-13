import { MockAgent, setGlobalDispatcher } from "undici";

// Globaler Testaufbau. Er läuft vor jeder Testdatei und ist die erste der drei Sicherungen:
// Kein Test der normalen Testläufe setzt einen Netzwerkaufruf gegen die echte
// API ab. disableNetConnect() lässt jeden nicht abgefangenen Versuch sofort scheitern.
//
// setGlobalDispatcher aus dem installierten undici-Paket wirkt laut Node-Dokumentation auch
// auf das eingebaute globale fetch, obwohl Node intern eine eigene, ältere undici-Fassung
// bündelt (toolchain.md 5.2). Genau das ist dort als noch nicht durch einen Testlauf belegt
// gekennzeichnet; test/unit/net-connect.test.ts weist es nach.

const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

/** Der gemeinsame MockAgent des Testlaufs. Abfragen und Erwartungen hängen sich hier ein. */
export function getMockAgent(): MockAgent {
  return mockAgent;
}
