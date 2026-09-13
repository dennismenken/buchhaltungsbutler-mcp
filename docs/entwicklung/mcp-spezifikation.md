# Model Context Protocol, aktueller Stand der Spezifikation

**Recherchestand und Abrufdatum aller Quellen: 2026-09-12.**
**Aktuelle Protokollversion zu diesem Zeitpunkt: `2026-07-28`.**

Dieses Dossier ist Nachschlagewerk für die Implementierung des inoffiziellen
BuchhaltungsButler-MCP-Servers. Es beschreibt den normativen Stand der Spezifikation, nicht
Wunschverhalten. Alle Aussagen sind mit Fundstelle belegt. Wo eine Aussage nicht belegbar war,
ist sie ausdrücklich als **nicht verifiziert** oder **Annahme** gekennzeichnet.

Die Spezifikation verwendet die Schlüsselwörter nach BCP 14 (RFC 2119, RFC 8174). Dieses
Dokument übernimmt die Unterscheidung: **MUSS** und **MÜSSEN** entsprechen MUST,
**DARF NICHT** und **DÜRFEN NICHT** entsprechen MUST NOT, **SOLLTE** und **SOLLTEN**
entsprechen SHOULD, **SOLLTE NICHT** und **SOLLTEN NICHT** entsprechen SHOULD NOT,
**KANN** und **KÖNNEN** entsprechen MAY. Englische Bezeichner (Feldnamen, Methodennamen, Typnamen, HTTP-Begriffe)
bleiben im Original.

> **Warnung an Implementierungs-Agenten:** Trainiertes Vorwissen zu MCP ist mit hoher
> Wahrscheinlichkeit veraltet. Die Revision `2026-07-28` hat den `initialize`-Handshake, die
> Sessions, `resources/subscribe`, `ping` und `logging/setLevel` entfernt und
> server-initiierte Requests durch ein Retry-Muster ersetzt. Code, der nach Gedächtnis
> geschrieben wird, ist mit hoher Wahrscheinlichkeit falsch.
>
> **Ebenso wichtig:** Diese Revision ist der Stand der Spezifikation, nicht der Stand der
> verfügbaren SDKs. Am 2026-09-12 melden beide TypeScript-SDK-Linien
> `LATEST_PROTOCOL_VERSION = 2025-11-25`. Welche Revision die Implementierung tatsächlich
> anzielt, regelt verbindlich Abschnitt 11.1a.

---

## 1. Aktuelle Protokollversion, Datum, Fundstelle

**Quellen (abgerufen 2026-09-12):**

- https://modelcontextprotocol.io/specification
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://raw.githubusercontent.com/modelcontextprotocol/specification/main/schema/2026-07-28/schema.ts
- https://blog.modelcontextprotocol.io/posts/2026-07-28/

### 1.1 Versionskennung und Beleg

Die Versionskennung ist ein Datumsstring im Format `YYYY-MM-DD`. Sie wird im Protokoll an drei
Stellen verwendet:

| Ort | Feld / Header | Beispielwert |
| --- | --- | --- |
| Jeder Request (alle Transporte) | `params._meta["io.modelcontextprotocol/protocolVersion"]` | `"2026-07-28"` |
| Streamable HTTP, jeder POST | HTTP-Header `MCP-Protocol-Version` | `2026-07-28` |
| `server/discover`-Antwort | `result.supportedVersions[]` | `["2026-07-28"]` |

Beleg aus dem TypeScript-Schema, das die Spezifikation ausdrücklich als Source of Truth
bezeichnet (`schema/2026-07-28/schema.ts`, Zeile 30):

```typescript
export const LATEST_PROTOCOL_VERSION = "2026-07-28";
```

Die Übersichtsseite https://modelcontextprotocol.io/specification verlinkt die
Unterabschnitte durchgängig unter `/specification/2026-07-28/...` und referenziert das Schema
unter `schema/2026-07-28/schema.ts`.

### 1.2 Ausdrückliche Prüfung: gibt es etwas Neueres als 2025-06-18?

Ja, zwei Revisionen. Seit `2025-06-18` sind erschienen:

1. `2025-11-25` (Changelog: https://modelcontextprotocol.io/specification/2025-11-25/changelog)
2. `2026-07-28` (Changelog: https://modelcontextprotocol.io/specification/2026-07-28/changelog)

`2026-07-28` ist die aktuelle Revision. Eine neuere stabile Revision war am 2026-09-12 nicht
auffindbar. Ein `draft`-Zweig existiert weiterhin unter `/specification/draft`, dessen Inhalt
wurde für dieses Dossier **nicht geprüft** und ist für die Implementierung irrelevant.

### 1.3 Versionsliste mit den wichtigsten Änderungen

#### `2026-07-28` (aktuell)

Die größte Revision seit dem Start des Protokolls. Quelle:
https://modelcontextprotocol.io/specification/2026-07-28/changelog

Wesentliche Änderungen (Abschnitt „Major changes"):

1. **Protokoll-Sessions entfernt.** Der `Mcp-Session-Id`-Header fällt aus dem Streamable-HTTP-
   Transport weg. Listen-Endpunkte (`tools/list`, `resources/list`, `prompts/list`) dürfen
   nicht mehr pro Verbindung variieren. Server, die verbindungsübergreifenden Zustand
   brauchen, nutzen explizite, servergenerierte Handles als gewöhnliche Tool-Argumente
   (SEP-2567).
2. **MCP ist zustandslos.** Der `initialize`/`notifications/initialized`-Handshake ist
   entfernt. Jeder Request trägt Protokollversion und Client-Capabilities in `_meta`
   (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`).
   Clients SOLLTEN sich pro Request identifizieren (`io.modelcontextprotocol/clientInfo`),
   Server SOLLTEN sich in jedem Result-`_meta` identifizieren
   (`io.modelcontextprotocol/serverInfo`). Versionskonflikte werden mit
   `UnsupportedProtocolVersionError` beantwortet (SEP-2575).
3. **`server/discover` neu.** Server MÜSSEN diese RPC implementieren, um unterstützte
   Protokollversionen, Capabilities und Identität zu veröffentlichen (SEP-2575).
4. **`subscriptions/listen` ersetzt den HTTP-GET-Endpunkt sowie
   `resources/subscribe`/`resources/unsubscribe`.** Ein einzelner langlebiger POST-Response-
   Stream trägt die abonnierten Änderungsbenachrichtigungen (SEP-2575).
5. **`ping`, `logging/setLevel` und `notifications/roots/list_changed` entfernt.** Das Log-
   Level wird pro Request über `io.modelcontextprotocol/logLevel` in `_meta` gesetzt; Server
   DÜRFEN NICHT `notifications/message` für Requests senden, die dieses Feld nicht enthalten
   (SEP-2575).
6. **Tasks aus dem Kern in eine offizielle Extension verschoben**
   (`io.modelcontextprotocol/tasks`), mit `tasks/get` (Polling) und `tasks/update` statt
   blockierendem `tasks/result` (SEP-2663).
7. **Multi Round-Trip Requests (MRTR)** ersetzen server-initiierte Requests
   (`roots/list`, `sampling/createMessage`, `elicitation/create`). Server antworten mit einem
   `InputRequiredResult` (`resultType: "input_required"`), der Client liefert die Antworten
   beim Retry des Originalrequests in `inputResponses` (SEP-2322).
8. **Alle Results tragen ein Pflichtfeld `resultType`** (`"complete"` oder `"input_required"`).
   Clients MÜSSEN ein fehlendes `resultType` von älteren Servern als `"complete"` behandeln
   (SEP-2322).
9. **SSE-Resumability entfernt** (`Last-Event-ID`, SSE-Event-IDs). Ein abgebrochener Response-
   Stream verliert den laufenden Request; Clients MÜSSEN ihn als neuen Request mit neuer
   Request-ID wiederholen (SEP-2575).

Wichtige Minor Changes:

- `extensions`-Feld in `ClientCapabilities` und `ServerCapabilities`.
- OpenTelemetry-Trace-Kontext (`traceparent`, `tracestate`, `baggage`) in `_meta` dokumentiert
  (SEP-414).
- Server SOLLTEN `tools/list` in deterministischer Reihenfolge liefern.
- Pflicht-Header `Mcp-Method` und `Mcp-Name` auf Streamable-HTTP-POSTs, plus `x-mcp-header`
  zum Spiegeln von Tool-Parametern in HTTP-Header (SEP-2243).
- `ttlMs` und `cacheScope` (`CacheableResult`) auf den Ergebnissen von `tools/list`,
  `prompts/list`, `resources/list`, `resources/read`, `resources/templates/list` (SEP-2549).
- Fehlercode für „Resource nicht gefunden" von `-32002` auf `-32602` geändert.
- `inputSchema`/`outputSchema` für beliebige JSON-Schema-2020-12-Keywords geöffnet,
  `structuredContent` für beliebige JSON-Werte; `$ref`-Auflösungsregeln und Ressourcengrenzen
  für Kompositions-Keywords ergänzt (SEP-2106).
- Fehlercode-Vergabepolitik: `-32000` bis `-32019` bleibt implementierungsdefiniert,
  `-32020` bis `-32099` ist der Spezifikation vorbehalten. Umnummerierung:
  `HeaderMismatch` `-32001` auf `-32020`, `MissingRequiredClientCapability` `-32003` auf
  `-32021`, `UnsupportedProtocolVersion` `-32004` auf `-32022`.

Deprecations in dieser Revision (siehe Abschnitt 8.9):
Roots, Sampling, Logging, Dynamic Client Registration, HTTP+SSE-Transport,
`includeContext: "thisServer"` / `"allServers"`.

#### `2025-11-25`

Quelle: https://modelcontextprotocol.io/specification/2025-11-25/changelog

- Authorization-Server-Discovery mit OpenID Connect Discovery 1.0.
- `icons` als Metadatum für Tools, Resources, Resource Templates und Prompts (SEP-973).
- Inkrementelle Scope-Zustimmung über `WWW-Authenticate` (SEP-835).
- Guidance zu Tool-Namen (SEP-986).
- `ElicitResult` und `EnumSchema` standardnäher, mit titled/untitled und
  single-/multi-select Enums (SEP-1330).
- URL-Mode-Elicitation (SEP-1036).
- Tool-Aufrufe in Sampling über `tools` und `toolChoice` (SEP-1577).
- OAuth Client ID Metadata Documents als empfohlener Registrierungsmechanismus (SEP-991).
- Experimentelle Tasks für langlaufende Requests (SEP-1686).
- Klarstellung: Server auf stdio dürfen `stderr` für jede Art von Logging nutzen, nicht nur
  für Fehler.
- Klarstellung: Eingabevalidierungsfehler gehören als Tool Execution Error zurück, nicht als
  Protocol Error, damit das Modell sich selbst korrigieren kann (SEP-1303).
- JSON Schema 2020-12 als Default-Dialekt (SEP-1613).

#### `2025-06-18`

Quelle: https://modelcontextprotocol.io/specification/2025-06-18/changelog

- JSON-RPC-Batching entfernt.
- Structured Tool Output (`structuredContent`, `outputSchema`).
- MCP-Server als OAuth Resource Server klassifiziert, Protected Resource Metadata.
- Resource Indicators nach RFC 8707 für Clients verpflichtend.
- Elicitation eingeführt.
- Resource Links in Tool-Ergebnissen.
- `MCP-Protocol-Version`-Header auf HTTP verpflichtend.
- `title`-Feld für anzeigefreundliche Namen, `name` bleibt programmatischer Identifier.
- `context`-Feld in `CompletionRequest`.

#### `2025-03-26`

Quelle: https://modelcontextprotocol.io/specification/2025-03-26/changelog

- OAuth-2.1-basiertes Authorization-Framework.
- Streamable HTTP ersetzt HTTP+SSE.
- JSON-RPC-Batching eingeführt (in `2025-06-18` wieder entfernt).
- Tool Annotations (read-only, destructive und so weiter).
- `message`-Feld in `ProgressNotification`, Audio-Content, `completions`-Capability.

#### `2024-11-05`

Erste veröffentlichte Revision. HTTP+SSE-Transport, seit `2025-03-26` deprecated.

### 1.4 Widersprüche und Unschärfen in den Quellen

Diese Punkte sind nicht geglättet, sondern benannt:

1. **Repository-Namen.** Die Seite `/specification` verweist auf
   `github.com/modelcontextprotocol/specification`, der Changelog derselben Revision verweist
   auf `github.com/modelcontextprotocol/modelcontextprotocol`. Eigener Test am 2026-09-12: der
   Abruf von `schema/2026-07-28/schema.ts` über `raw.githubusercontent.com` liefert bei beiden
   Namen HTTP 200 und byteidentische 98426 Bytes. Die Namen sind offenbar austauschbar
   (Umbenennung mit Redirect). **Nicht verifiziert**, welcher Name der kanonische ist.
2. **Caching-Pflicht gegen Abwesenheitsregel.** Die Caching-Seite sagt: „Servers MUST include
   caching hints on results with `resultType: "complete"`" für sechs Operationen, und
   `CacheableResult` deklariert `ttlMs` und `cacheScope` als Pflichtfelder. Dieselbe Seite
   beschreibt gleichzeitig das Verhalten bei fehlendem `ttlMs` und merkt an, das solle nur bei
   älteren Serverversionen vorkommen. Für die Implementierung gilt die Pflicht.
3. **Header-Pflicht für Notification-POSTs.** Streamable HTTP nennt `Mcp-Method` und
   `Mcp-Name` „REQUIRED for compliance" und listet fehlende Standard-Header als
   Validierungsfehler, notiert an anderer Stelle aber, dass Header-Anforderungen für
   Notification-POSTs in dieser Revision nicht definiert sind. Für unseren Server (stdio)
   ohne Belang.
4. **Frist für HTTP+SSE.** Die Deprecation-Policy nennt ein Minimum von zwölf Monaten; das
   Deprecated-Register führt für den HTTP+SSE-Transport „Three months after SEP-2596 reaches
   Final" als frühestmögliche Entfernung. Die Übergangsbestimmungen der Policy erklären
   das; die Policy-Seite selbst wurde **nicht im Volltext geprüft**.
5. **Sprachliche Abweichung bei listChanged.** Die Tools- und Prompts-Seite formuliert die
   Benachrichtigung als „SHOULD send a notification to clients that have opened a
   `subscriptions/listen` stream with `toolsListChanged: true`". Die Resources-Seite formuliert
   nur „SHOULD send a notification". Inhaltlich identisch, da Notifications ausschließlich auf
   dem `subscriptions/listen`-Stream transportiert werden.

### 1.5 Stand der SDKs (eigene Prüfung am 2026-09-12)

Der Blogbeitrag zur Revision nennt aktualisierte Tier-1-SDKs für TypeScript, Python, Go und
C#, sowie Rust im Beta-Status. Eigene Prüfung nur für TypeScript, über die npm-Registry und
die GitHub-Releases von `modelcontextprotocol/typescript-sdk`:

| Paket | Neueste Version | Veröffentlicht |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.30.0 | 2026-07-27 |
| `@modelcontextprotocol/server` | 2.0.0 | 2026-07-27 |
| `@modelcontextprotocol/client` | 2.0.0 | 2026-07-27 |
| `@modelcontextprotocol/node` | 2.0.0 | 2026-07-27 |
| `@modelcontextprotocol/hono` | 2.0.0 | 2026-07-27 |
| `@modelcontextprotocol/server-legacy` | 2.0.0 | 2026-07-27 |

Die README des `main`-Zweigs beschreibt `main` als v2 des SDK mit Implementierung der Spec
`2026-07-28`; neue Server sollen `@modelcontextprotocol/server` verwenden. Für v1 (`sdk@1.x`)
sind laut README Bugfixes und Security-Updates für mindestens sechs Monate nach dem v2-Release
zugesagt. `@modelcontextprotocol/server-legacy` enthält den eingefrorenen v1-SSE-Transport und
OAuth-Authorization-Server-Helfer.

**Nicht verifiziert:** der Funktionsumfang von `@modelcontextprotocol/server@2.0.0` im Detail,
der Stand der Python-, Go-, C#- und Rust-SDKs, sowie die Frage, welche Host-Anwendungen
(Claude Desktop, Claude Code, IDE-Clients und andere) am 2026-09-12 bereits `2026-07-28`
sprechen. Der letzte Punkt ist die wichtigste offene Frage für unsere Zielversionsentscheidung
(siehe Abschnitte 11.1 und 11.1a).

---

## 2. Architektur

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/architecture, abgerufen 2026-09-12.**

MCP folgt einer Client-Host-Server-Architektur. MCP ist ein zustandsloses Protokoll: jeder
Request ist selbsttragend und führt seine eigene Protokollversion und seine Capabilities mit.

### 2.1 Host

Der Host-Prozess ist Container und Koordinator:

- erzeugt und verwaltet mehrere Client-Instanzen,
- steuert Verbindungsrechte und Lebenszyklus der Clients,
- setzt Sicherheitsrichtlinien und Zustimmungspflichten durch,
- trifft die Autorisierungsentscheidungen des Nutzers,
- koordiniert die LLM-Anbindung und Sampling,
- aggregiert Kontext über alle Clients.

### 2.2 Client

Jeder Client wird vom Host erzeugt und kommuniziert mit genau einem Server (1:1):

- hängt Protokollversion und Capabilities an jeden Request,
- routet Protokollnachrichten bidirektional,
- verwaltet Subscriptions und Notifications,
- hält die Sicherheitsgrenzen zwischen Servern aufrecht.

### 2.3 Server, und was ein Server liefern darf

Server stellen spezialisierten Kontext und Fähigkeiten bereit:

- exponieren **Resources, Tools und Prompts** über die MCP-Primitive,
- arbeiten unabhängig mit eng umrissener Verantwortung,
- fordern Client-Eingaben (Sampling, Elicitation, Roots) über `InputRequiredResult` innerhalb
  einer Antwort an,
- MÜSSEN Sicherheitsvorgaben respektieren,
- können lokale Prozesse oder Remote-Dienste sein.

Die Übersichtsseite fasst die Rollenverteilung zusammen: Server bieten Resources, Prompts und
Tools an; Clients bieten Elicitation an (Quelle: https://modelcontextprotocol.io/specification).
Sampling und Roots sind weitere Client-Fähigkeiten, in `2026-07-28` jedoch deprecated
(Abschnitt 8).

### 2.4 Designprinzipien

1. Server sollen extrem einfach zu bauen sein; die Orchestrierung liegt beim Host.
2. Server sollen hochgradig komponierbar sein; jeder Server liefert eng umrissene
   Funktionalität isoliert.
3. Server sollen weder die gesamte Konversation lesen noch in andere Server hineinsehen
   können. Die vollständige Historie bleibt beim Host, der die Sicherheitsgrenzen
   durchsetzt.
4. Fähigkeiten sind progressiv erweiterbar; der Kern bleibt minimal, Zusätzliches wird
   ausgehandelt.

### 2.5 Capability-Negotiation

Es gibt keinen Handshake. Clients senden ihre Capabilities in
`_meta["io.modelcontextprotocol/clientCapabilities"]` auf **jedem** Request. Server
veröffentlichen ihre Capabilities in der Antwort auf `server/discover`, die ein Client vor
allen anderen Requests aufrufen KANN.

Beide Seiten MÜSSEN die deklarierten Capabilities durchgängig respektieren. Ein Server MUSS
NICHT auf Capabilities bauen, die der Client nicht deklariert hat; fehlt eine nötige
Capability, MUSS der Server `MissingRequiredClientCapabilityError` (`-32021`) zurückgeben,
dessen `data.requiredCapabilities` die fehlenden Capabilities nennt. Auf HTTP MUSS der Status
`400 Bad Request` sein.

`ServerCapabilities` laut Schema (`schema.ts`):

```typescript
export interface ServerCapabilities {
  experimental?: { [key: string]: JSONObject };
  logging?: JSONObject;      // @deprecated ab 2026-07-28 (SEP-2577)
  completions?: JSONObject;
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  tools?: { listChanged?: boolean };
  extensions?: { [key: string]: JSONObject };
}
```

`ClientCapabilities` laut Schema:

```typescript
export interface ClientCapabilities {
  experimental?: { [key: string]: JSONObject };
  roots?: {};                                   // @deprecated ab 2026-07-28
  sampling?: { context?: JSONObject; tools?: JSONObject };  // @deprecated ab 2026-07-28
  elicitation?: { form?: JSONObject; url?: JSONObject };
  extensions?: { [key: string]: JSONObject };
}
```

---

## 3. Lifecycle: Statelessness, Versionsaushandlung, Shutdown

**Quellen (abgerufen 2026-09-12):**

- https://modelcontextprotocol.io/specification/2026-07-28/basic
- https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
- https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio

### 3.1 `initialize` und `initialized` gibt es nicht mehr

Der Handshake ist ersatzlos entfernt. Es gibt keine Session, keine Sitzungs-ID und keine
verbindungsgebundene Zustandsableitung. Wer heute `initialize` implementiert, implementiert
eine Legacy-Revision (`2025-11-25` oder älter).

### 3.2 Statelessness, normativ

Aus dem Abschnitt „Statelessness" der Base-Protocol-Seite:

- Server DÜRFEN NICHT auf vorherige Requests derselben Verbindung bauen, um Kontext
  herzustellen (Capabilities, Protokollversion, Client-Identität). Jeder Request liefert diese
  Metadaten in seinem `_meta`.
- Server SOLLTEN darauf vorbereitet sein, Requests aus mehreren Tasks, Threads oder
  Konversationen zu bedienen.
- Server SOLLTEN NICHT verlangen, dass ein Client für zusammenhängende Operationen dieselbe
  Verbindung oder denselben Prozess verwendet.
- Clients SOLLTEN NICHT einen einzelnen Task, Thread oder eine Konversation als Lebensdauer-
  Grenze des stdio-Prozesses verwenden.
- Zustand über mehrere Requests hinweg MUSS über einen expliziten Identifier referenziert
  werden, den der Client bei jedem Request mitgibt.

Ausdrücklicher Hinweis der Spezifikation: eine offene Verbindung, auch ein stdio-Prozess, ist
keine Konversation und keine Session. Clients dürfen unzusammenhängende Requests auf
demselben Transport verschachteln.

### 3.3 Pflichtfelder pro Request

| Key in `params._meta` | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `io.modelcontextprotocol/protocolVersion` | `string` | ja | Protokollversion dieses Requests |
| `io.modelcontextprotocol/clientCapabilities` | `ClientCapabilities` | ja | Client-Capabilities für diesen Request |
| `io.modelcontextprotocol/clientInfo` | `Implementation` | nein | Name und Version des Clients |
| `io.modelcontextprotocol/logLevel` | `LoggingLevel` | nein | minimales Log-Level für diesen Request |

Ein Request ohne ein Pflichtfeld ist malformed; der Server MUSS ihn mit JSON-RPC-Fehlercode
`-32602` (Invalid params) ablehnen, auf HTTP mit Status `400 Bad Request`.

Clients SOLLTEN `clientInfo` auf jedem Request mitschicken, sofern nicht ausdrücklich anders
konfiguriert. Server SOLLTEN `io.modelcontextprotocol/serverInfo` in jedem Result-`_meta`
mitschicken.

`clientInfo` und `serverInfo` sind selbstberichtet und werden vom Protokoll nicht geprüft.
Implementierungen SOLLTEN NICHT ihr Verhalten daran ändern und SOLLTEN NICHT
Sicherheitsentscheidungen darauf stützen.

### 3.4 Versionsaushandlung und Verhalten bei nicht unterstützter Version

Es gibt keinen Aushandlungs-Handshake. Jeder Request deklariert seine Version, der Server
akzeptiert oder lehnt jeden Request einzeln ab.

Unterstützt der Server die angeforderte Version nicht, egal ob sie unbekannt ist oder bewusst
nicht unterstützt wird, MUSS er mit `UnsupportedProtocolVersionError` (`-32022`) antworten und
dabei die unterstützten Versionen nennen:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version",
    "data": {
      "supported": ["2026-07-28", "2025-11-25"],
      "requested": "1900-01-01"
    }
  }
}
```

Der Client SOLLTE eine beidseitig unterstützte Version aus `supported` wählen und den Request
wiederholen, oder dem Nutzer einen Fehler anzeigen, wenn keine kompatible Version existiert.

Auf Streamable HTTP MUSS der Statuscode dieser Antwort `400 Bad Request` sein. Zusätzlich MUSS
der Wert des Headers `MCP-Protocol-Version` mit `_meta["io.modelcontextprotocol/protocolVersion"]`
übereinstimmen; sonst MUSS der Server mit `400` und `HeaderMismatch` (`-32020`) ablehnen.

### 3.5 `server/discover`

Server MÜSSEN `server/discover` implementieren. Der Request hat außer dem Standard-`_meta`
keine Parameter:

```json
{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "ExampleClient", "version": "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Antwort:

```json
{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": { "tools": {}, "resources": {} },
    "_meta": {
      "io.modelcontextprotocol/serverInfo": { "name": "ExampleServer", "version": "1.0.0" }
    },
    "instructions": "This server provides weather and resource utilities.",
    "ttlMs": 3600000,
    "cacheScope": "public"
  }
}
```

`DiscoverResult` erbt von `CacheableResult`, `ttlMs` und `cacheScope` sind also Pflicht.
`instructions` ist optionale natürlichsprachliche Anleitung für das LLM; sie SOLLTE helfen,
den Server effektiv zu nutzen, und SOLLTE Tool-Beschreibungen nicht duplizieren.

Der Aufruf ist für Clients optional. Er ist nützlich, um Serverinformationen in einem Request
zu erhalten, und als Backward-Compatibility-Probe auf stdio.

### 3.6 Rückwärtskompatibilität: modern gegen legacy

Terminologie der Spezifikation:

- **modern**: Versionen, die Version, Identität und Capabilities pro Request in `_meta`
  transportieren (`2026-07-28` und später).
- **legacy**: Versionen mit `initialize`-Handshake (`2025-11-25` und älter).
- **dual-era**: Implementierung, die beides unterstützt.

Auf stdio SOLLTE ein dual-era-Client mit `server/discover` proben. Drei Ausgänge:

1. Server liefert `DiscoverResult`: modern, Version aus `supportedVersions` wählen.
2. Server liefert einen erkannten modernen JSON-RPC-Fehler wie
   `UnsupportedProtocolVersionError`: modern, aber ohne die angefragte Version. **Kein**
   Fallback auf `initialize`.
3. Server liefert irgendeinen anderen Fehler oder antwortet nicht innerhalb eines sinnvollen
   Timeouts: legacy, Fallback auf `initialize`.

Der Fallback DARF NICHT an einen bestimmten Fehlercode gebunden werden; legacy-Server antworten
auf unbekannte Pre-`initialize`-Requests mit implementierungsdefinierten Fehlern (oft `-32601`
oder `-32602`) oder gar nicht.

Auf Streamable HTTP probiert der Client zuerst einen modernen Request und inspiziert bei
`400 Bad Request` den Body: ein erkannter moderner JSON-RPC-Fehler bedeutet moderner Server
(korrigieren und erneut versuchen), sonst Fallback auf `initialize`.

Die Ära-Bestimmung ist Eigenschaft des Servers, nicht des Requests. Clients SOLLTEN sie für
die Lebensdauer des Serverprozesses (stdio) oder des Origin (HTTP) cachen und KÖNNEN sie über
Neustarts derselben Konfiguration persistieren.

Ein Server, der nur moderne Versionen unterstützt, SOLLTE die unterstützten Versionen in
jedem Fehler nennen, den er auf einen `initialize`-Request zurückgibt, weil legacy-Clients
keinen Fall-Forward-Mechanismus haben.

Kompatibilitätsmatrix (verkürzt, Quelle Versioning-Seite):

| Client | Server | Ergebnis |
| --- | --- | --- |
| modern | modern | funktioniert |
| modern | legacy | schlägt fehl; auf stdio mit `server/discover` deterministisch scheitern |
| dual-era | modern | funktioniert, Client bleibt modern |
| dual-era | legacy | funktioniert über Fallback auf `initialize` |
| legacy | modern | schlägt fehl; legacy-Clients können nicht nach vorn fallen |
| legacy | dual-era | funktioniert nach legacy-Revision |
| legacy | legacy | funktioniert nach legacy-Revision |

Ein dual-era-**Server** wählt sein Verhalten danach, wie der Client eröffnet: ein Request mit
modernem `_meta` wird zustandslos nach dieser Revision bedient, ein `initialize`-Request wählt
Legacy-Semantik. Ein dual-era-Server KANN beide Ären gleichzeitig auf demselben Endpunkt oder
Prozess bedienen.

### 3.7 Shutdown

Es gibt keinen Protokoll-Shutdown mehr; Beendigung ist Sache des Transports.

**stdio:** Der Client SOLLTE den Shutdown so einleiten:

1. Eingabestream zum Kindprozess schließen,
2. auf Beendigung des Servers warten,
3. falls der Server nicht in angemessener Zeit endet, den Prozess mit den Mitteln des
   Betriebssystems zwangsweise beenden (POSIX typischerweise `SIGTERM`, dann `SIGKILL`;
   Windows `TerminateProcess` oder Job Objects).

Server SOLLTEN unverzüglich beenden, wenn ihr Standardeingabestream geschlossen wird oder Lesen
EOF liefert. Das ist das primäre und einzige portable Signal für geordneten Shutdown. Der
Server KANN den Shutdown selbst einleiten, indem er seinen Ausgabestream schließt und endet.

**Unerwartete Beendigung:** Stirbt der Serverprozess unerwartet, SOLLTE der Client ihn neu
starten. Da das Protokoll zustandslos ist, gehen laufende Requests einfach verloren und können
gegen den frischen Prozess wiederholt werden. Aktive `subscriptions/listen`-Streams müssen nach
dem Neustart neu aufgebaut werden.

---

## 4. Transporte

**Quellen (abgerufen 2026-09-12):**

- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http

### 4.1 stdio

Der Client startet den MCP-Server als Kindprozess. Die Kommunikation läuft über die
Standardstreams des Kindprozesses.

Normative Regeln, wörtlich übernommen in der Substanz:

- Der Server liest JSON-RPC-Nachrichten von `stdin` und schreibt JSON-RPC-Nachrichten auf
  `stdout`.
- Jede Nachricht ist ein einzelner JSON-RPC-Request, eine Notification oder eine Response.
- Nachrichten sind durch Newlines getrennt und DÜRFEN KEINE eingebetteten Newlines enthalten.
- Der Server KANN UTF-8-Strings auf `stderr` schreiben, für jede Art von Logging, inklusive
  informativer, Debug- und Fehlermeldungen.
- Der Client KANN `stderr` mitschneiden, weiterleiten oder ignorieren und SOLLTE NICHT
  annehmen, dass `stderr`-Ausgabe einen Fehlerzustand anzeigt.
- **Der Server DARF NICHTS auf sein `stdout` schreiben, das keine gültige MCP-Nachricht
  ist.**
- Der Client DARF NICHTS auf das `stdin` des Servers schreiben, das keine gültige
  MCP-Nachricht ist.

Die Regel zu `stdout` ist die härteste Betriebsanforderung an einen lokalen Server. Eine
einzige `console.log`-Zeile, eine Startmeldung einer Bibliothek, ein Deprecation-Warnhinweis
oder ein Stacktrace auf `stdout` zerstört den Nachrichtenstrom und bricht die Verbindung.
Logging gehört ausschließlich auf `stderr`.

Weitere stdio-Regeln:

- Der Client schreibt nur Requests und Notifications auf `stdin`; er DARF NICHT JSON-RPC-
  Responses schreiben.
- Der Server schreibt Responses, request-bezogene Notifications (`notifications/progress`,
  `notifications/message`) und Notifications aktiver `subscriptions/listen`-Requests. Er MUSS
  NICHT JSON-RPC-Requests auf `stdout` schreiben. Server-zu-Client-Interaktionen laufen
  ausschließlich über `InputRequiredResult` (MRTR).
- Alle Nachrichten teilen sich diesen einen Kanal. Es gibt keine Per-Request-Streams. Clients
  MÜSSEN Notifications über `_meta["io.modelcontextprotocol/subscriptionId"]` ihrer
  Subscription zuordnen.
- Es gibt keine Header-Schicht. Protokollversion, Capabilities und Client-Identität liegen in
  `_meta`.
- Abbruch: Der Client MUSS `notifications/cancelled` mit der Request-ID senden. Server SOLLTEN
  die Arbeit so bald wie praktikabel einstellen und DÜRFEN NICHT weitere Nachrichten zu diesem
  Request senden.

Das Wire-Format (eine newline-getrennte JSON-RPC-Nachricht pro Zeile über einen
zuverlässigen bidirektionalen Bytestrom) funktioniert unverändert über Unix Domain Sockets,
TCP und ähnliche Kanäle; Custom Transports SOLLTEN dieses Framing und diese
Nachrichtenregeln übernehmen.

### 4.2 Streamable HTTP

Kurzfassung, da für einen lokal installierten Server nicht der richtige Transport ist
(Begründung in 4.3). Die Anforderungen im Überblick:

- Der Server MUSS genau einen HTTP-Endpunktpfad bereitstellen, der POST unterstützt.
- Der Client MUSS jede JSON-RPC-Nachricht als eigenen HTTP-POST senden, MUSS einen
  `Accept`-Header mit `application/json` **und** `text/event-stream` setzen und MUSS die
  Request-Metadaten-Header mitschicken.
- Der Body MUSS ein einzelner JSON-RPC-Request oder eine Notification sein. Der Client MUSS
  NICHT Responses senden.
- Auf eine Notification antwortet der Server mit `202 Accepted` ohne Body, oder mit einem
  HTTP-Fehlerstatus.
- Auf einen Request antwortet der Server entweder mit `Content-Type: application/json` (ein
  JSON-Objekt) oder mit `Content-Type: text/event-stream` (SSE-Stream für diesen Request).
  Der Client MUSS beides unterstützen.
- Auf einem SSE-Stream KANN der Server Notifications senden, die sich auf den auslösenden
  Request beziehen. Er DARF NICHT eigenständige JSON-RPC-Requests auf diesem Stream senden.
  Die finale Response SOLLTE den Stream beenden.
- Beim Eröffnen eines SSE-Streams SOLLTE der Server `X-Accel-Buffering: no` setzen.
- Resumierbare SSE-Streams über `Last-Event-ID` werden nicht unterstützt.
- Abbruch: Das Schließen des SSE-Response-Streams MUSS vom Server als Abbruch dieses Requests
  gewertet werden. Kein `notifications/cancelled` nötig oder erwartet.

Pflicht-Header:

| Header | Quelle im Body | Pflicht für |
| --- | --- | --- |
| `MCP-Protocol-Version` | `_meta["io.modelcontextprotocol/protocolVersion"]` | jeden POST |
| `Mcp-Method` | `method` | alle Requests |
| `Mcp-Name` | `params.name` oder `params.uri` | `tools/call`, `resources/read`, `prompts/get` |
| `Mcp-Param-{Name}` | per `x-mcp-header` markierter Tool-Parameter | wenn im `inputSchema` markiert |

Server, die den Body verarbeiten, MÜSSEN ablehnen, wenn Header- und Body-Werte nicht
übereinstimmen, mit `400 Bad Request` und `-32020` (`HeaderMismatch`). Werte, die nicht als
reines ASCII darstellbar sind, MÜSSEN im Sentinel-Format `=?base64?{Base64}?=` übertragen
werden.

Sicherheit und Endpunkt:

1. Server MÜSSEN den `Origin`-Header prüfen, um DNS-Rebinding-Angriffe zu verhindern. Bei
   vorhandenem, ungültigem `Origin` MÜSSEN sie mit `403 Forbidden` antworten.
2. Lokal laufende Server SOLLTEN nur an localhost (127.0.0.1) binden, nicht an 0.0.0.0.
3. Server SOLLTEN ordentliche Authentifizierung für alle Verbindungen implementieren.

Der HTTP+SSE-Transport aus `2024-11-05` ist seit `2025-03-26` deprecated und in `2026-07-28`
formal als Deprecated klassifiziert. Neue Implementierungen SOLLTEN ihn NICHT übernehmen.

### 4.3 Welcher Transport für einen lokal installierten Server

**stdio.** Begründung aus der Spezifikation:

1. Die Security-Best-Practices-Seite empfiehlt für lokal betriebene Server ausdrücklich:
   „Use the `stdio` transport to limit access to just the MCP client". HTTP-Transporte lokal
   erfordern zusätzliche Absicherung (Authorization-Token, Unix Domain Sockets oder andere IPC
   mit eingeschränktem Zugriff).
2. Die Base-Protocol-Seite stellt für Auth klar: Implementierungen auf HTTP-Transporten
   SOLLTEN dem Authorization-Framework folgen, Implementierungen auf stdio SOLLTEN es NICHT,
   sondern Zugangsdaten aus der Umgebung beziehen. Für einen lokalen Server mit
   API-Zugangsdaten in Umgebungsvariablen ist das genau der vorgesehene Weg.
3. Streamable HTTP bringt den gesamten Header-Spiegelungs-, Origin-Validierungs- und
   Caching-Apparat mit, der für einen Ein-Nutzer-Prozess auf demselben Rechner keinen Nutzen
   bringt, aber Angriffsfläche schafft (DNS-Rebinding, offener localhost-Port).

Gegen stdio spricht nur der Fall, dass mehrere Hosts gleichzeitig auf denselben Serverprozess
zugreifen sollen oder ein Remote-Deployment geplant ist. Beides ist für diesen Server nicht
vorgesehen.

---

## 5. Tools

**Quellen (abgerufen 2026-09-12):**

- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- `schema/2026-07-28/schema.ts`

### 5.1 Interaktionsmodell und Capability

Tools sind **model-controlled**: das LLM entdeckt und ruft sie auf Basis seines Kontextverständnisses auf.
Für Trust and Safety SOLLTE immer ein Mensch in der Schleife sein, der Tool-Aufrufe ablehnen
kann. Anwendungen SOLLTEN sichtbar machen, welche Tools dem Modell exponiert sind, Aufrufe
visuell markieren und Bestätigungsdialoge zeigen.

Server, die Tools unterstützen, MÜSSEN die `tools`-Capability deklarieren:

```json
{ "capabilities": { "tools": { "listChanged": true } } }
```

Server, die `tools` deklarieren, MÜSSEN auf `tools/list` mit der Menge der aktuell
verfügbaren Tools antworten. Diese Menge KANN leer sein und KANN sich ändern, sie DARF NICHT
pro Verbindung variieren oder sich als Seiteneffekt anderer Requests auf derselben Verbindung
ändern. Sie KANN nach der mitgelieferten Autorisierung variieren, weil Credentials
Per-Request-Eingabe sind und kein Verbindungszustand.

Server SOLLTEN Tools in deterministischer Reihenfolge liefern, damit Clients zuverlässig
cachen können und Prompt-Cache-Treffer beim LLM steigen.

### 5.2 Tool-Definition

```typescript
export interface Tool extends BaseMetadata, Icons {
  description?: string;
  inputSchema: { $schema?: string; type: "object"; [key: string]: unknown };
  outputSchema?: { $schema?: string; [key: string]: unknown };
  annotations?: ToolAnnotations;
  _meta?: MetaObject;
}
```

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `name` | ja | eindeutiger Identifier (aus `BaseMetadata`) |
| `title` | nein | menschenlesbarer Anzeigename |
| `description` | nein | Beschreibung der Funktionalität, als Hinweis für das Modell |
| `icons` | nein | Icons für die Anzeige |
| `inputSchema` | ja | JSON Schema der erwarteten Parameter, Wurzel `type: "object"` |
| `outputSchema` | nein | JSON Schema für `structuredContent` |
| `annotations` | nein | Verhaltenshinweise |

Anzeigereihenfolge laut Schema-Kommentar: `title`, dann `annotations.title`, dann `name`.

Zum `inputSchema`:

- folgt den JSON-Schema-Regeln der Base-Protocol-Seite, Default-Dialekt 2020-12,
- MUSS ein gültiges JSON-Schema-Objekt sein, nicht `null`,
- für Tools ohne Parameter sind gültig: `{ "type": "object", "additionalProperties": false }`
  (empfohlen, akzeptiert nur leere Objekte) oder `{ "type": "object" }` (akzeptiert jedes
  Objekt),
- neben `type` darf jedes JSON-Schema-2020-12-Keyword stehen, auch `oneOf`, `anyOf`, `allOf`,
  `not`, `if`/`then`/`else`, `$ref`, `$defs`, `$anchor`.

Zu `$ref` gelten Sicherheitsregeln aus der Base-Protocol-Seite: Implementierungen DÜRFEN NICHT
`$ref`-Werte automatisch dereferenzieren, die auf Netzwerk-URIs zeigen. Ein Opt-in-Modus KANN
angeboten werden, MUSS aber standardmäßig deaktiviert sein und SOLLTE eine Host-Allowlist
erzwingen, Loopback-, Link-Local- und private Adressen ablehnen, Timeouts und Größenlimits
setzen und dereferenzierte URIs protokollieren. Schemas, die wegen eines nicht auflösbaren
externen `$ref` nicht validieren, SOLLTEN abgelehnt statt permissiv behandelt werden.
Für Kompositions-Keywords und `$defs` SOLLTEN Implementierungen Grenzen setzen (maximale
Schematiefe, Obergrenze für Subschemas, Zeitbudget pro Validierung), um DoS gegen den Validator
zu verhindern.

### 5.3 Namenskonventionen

- Tool-Namen SOLLTEN zwischen 1 und 128 Zeichen lang sein.
- Tool-Namen SOLLTEN als case-sensitiv betrachtet werden.
- Erlaubt SOLLTEN ausschließlich sein: `A-Z`, `a-z`, `0-9`, Unterstrich, Bindestrich, Punkt.
- Tool-Namen SOLLTEN KEINE Leerzeichen, Kommata oder sonstigen Sonderzeichen enthalten.
- Tool-Namen SOLLTEN innerhalb eines Servers eindeutig sein.
- Beispiele aus der Spezifikation: `getUser`, `DATA_EXPORT_v2`, `admin.tools.list`.

Eindeutigkeit gilt nur serverweit. Clients oder Proxies, die Tools mehrerer Server aggregieren,
SOLLTEN eine Disambiguierungsstrategie implementieren, etwa Präfixe mit einer Server-Kennung.
Der Servername aus `serverInfo` ist nicht garantiert eindeutig und SOLLTE NICHT zur
Disambiguierung verwendet werden.

### 5.4 Annotations

Aus dem Schema, inklusive Defaults:

```typescript
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;     // Default: false
  destructiveHint?: boolean;  // Default: true   (nur sinnvoll wenn readOnlyHint == false)
  idempotentHint?: boolean;   // Default: false  (nur sinnvoll wenn readOnlyHint == false)
  openWorldHint?: boolean;    // Default: true
}
```

| Hint | Bedeutung |
| --- | --- |
| `readOnlyHint` | wenn `true`: das Tool verändert seine Umgebung nicht |
| `destructiveHint` | wenn `true`: das Tool kann destruktive Aktualisierungen vornehmen; wenn `false`: nur additive |
| `idempotentHint` | wenn `true`: wiederholte Aufrufe mit denselben Argumenten haben keine zusätzliche Wirkung |
| `openWorldHint` | wenn `true`: das Tool interagiert mit einer offenen Welt externer Entitäten |

Der Schema-Kommentar ist explizit: alle Eigenschaften in `ToolAnnotations` sind **Hinweise**.
Sie garantieren keine wahrheitsgemäße Beschreibung des Verhaltens, auch nicht die
deskriptiven wie `title`. Clients SOLLTEN NIEMALS Tool-Nutzungsentscheidungen auf Annotations
von nicht vertrauenswürdigen Servern stützen. Die Tools-Seite formuliert es als MUSS: Clients
MÜSSEN Tool-Annotations als nicht vertrauenswürdig behandeln, sofern sie nicht von
vertrauenswürdigen Servern stammen.

Die Defaults sind der praktisch wichtigste Punkt: Wer `destructiveHint` und `openWorldHint`
nicht setzt, bekommt `true`. Ein reines Lese-Tool ohne Annotations wird also als potenziell
destruktiv und offen behandelt.

### 5.5 `tools/list`

Unterstützt Pagination und Caching.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": { "cursor": "optional-cursor-value" }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "tools": [
      {
        "name": "get_weather",
        "title": "Weather Information Provider",
        "description": "Get current weather information for a location",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": { "type": "string", "description": "City name or zip code" }
          },
          "required": ["location"]
        }
      }
    ],
    "nextCursor": "next-page-cursor",
    "ttlMs": 300000,
    "cacheScope": "public"
  }
}
```

### 5.6 `tools/call`

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { "name": "get_weather", "arguments": { "location": "New York" } }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "content": [
      { "type": "text", "text": "Current weather in New York: 22 C, partly cloudy" }
    ],
    "isError": false
  }
}
```

Server KÖNNEN auf `tools/call` mit einem `InputRequiredResult` antworten (Abschnitt 8.2).
Beim Retry sendet der Client `inputResponses` und, falls vom Server geliefert, `requestState`
in den Request-Parametern. Die JSON-RPC-`id` MUSS zwischen Ursprungsrequest und Retry
unterschiedlich sein.

### 5.7 Content-Typen im Ergebnis

`CallToolResult`:

```typescript
export interface CallToolResult extends Result {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
}
```

Unstrukturierter Inhalt steht in `content` und kann mehrere Blöcke unterschiedlichen Typs
enthalten. Alle Content-Typen unterstützen optionale `annotations` (`audience`, `priority`,
`lastModified`), dasselbe Format wie bei Resources und Prompts.

| Typ | Felder |
| --- | --- |
| `text` | `text` |
| `image` | `data` (base64), `mimeType` |
| `audio` | `data` (base64), `mimeType` |
| `resource_link` | `uri`, `name`, `description`, `mimeType` |
| `resource` | `resource` mit `uri`, `mimeType`, `text` oder `blob` |

Zu `resource_link`: Ein Tool KANN Links auf Resources zurückgeben. Von Tools zurückgegebene
Resource-Links erscheinen nicht zwingend im Ergebnis von `resources/list`.

Zu eingebetteten Resources: Server, die eingebettete Resources nutzen, SOLLTEN die
`resources`-Capability implementieren.

### 5.8 `structuredContent` und `outputSchema`

`structuredContent` ist ein beliebiger JSON-Wert (Objekt, Array, String, Zahl, Boolean, null),
der dem `outputSchema` entspricht, falls eines definiert ist. Für Rückwärtskompatibilität
SOLLTE ein Tool, das strukturierten Inhalt liefert, zusätzlich das serialisierte JSON in einem
`TextContent`-Block zurückgeben.

Wenn ein `outputSchema` angegeben ist:

- Server MÜSSEN strukturierte Ergebnisse liefern, die dem Schema entsprechen.
- Clients SOLLTEN strukturierte Ergebnisse gegen das Schema validieren.

Hinweis der Spezifikation: `structuredContent` ist servererzeugte Ergebnisdaten und hat nichts
mit „structured outputs" im Sinne schema-beschränkter Modellgenerierung zu tun.

### 5.9 `isError`-Semantik

Aus dem Schema-Kommentar zu `isError`:

> Fehler, die aus dem Tool selbst stammen, SOLLTEN im Result-Objekt mit `isError: true`
> gemeldet werden, **nicht** als MCP-Fehlerantwort auf Protokollebene. Sonst kann das LLM den
> Fehler nicht sehen und sich nicht selbst korrigieren. Fehler beim **Finden** des Tools,
> Fehler, die anzeigen, dass der Server keine Tool-Aufrufe unterstützt, und andere
> Ausnahmezustände SOLLTEN als MCP-Fehlerantwort gemeldet werden.

Ist `isError` nicht gesetzt, gilt `false`.

Details in Abschnitt 9.

### 5.10 `listChanged`

Ändert sich die Tool-Liste, SOLLTEN Server, die `listChanged` deklariert haben, eine
Benachrichtigung an Clients senden, die einen `subscriptions/listen`-Stream mit
`toolsListChanged: true` geöffnet haben:

```json
{ "jsonrpc": "2.0", "method": "notifications/tools/list_changed" }
```

Die Notification trägt in `_meta` die `io.modelcontextprotocol/subscriptionId`.

### 5.11 Zustandsbehaftete Tools

Nicht-normative Anleitung der Spezifikation: MCP hat keine Protokoll-Session, ein Server kann
also keinen impliziten verbindungsgebundenen Zustand zwischen Tool-Aufrufen nutzen. Wer Zustand
braucht, gibt aus einem Erzeugungs-Tool ein explizites Handle zurück und nimmt es bei
Folgeaufrufen als Argument entgegen.

Beim Entwurf solcher Handles sind zu beachten:

- **Autorisierung.** Bei authentifizierten Servern ist ein Handle ein Name, keine Berechtigung.
  Der Server sollte die Autorisierung des Aufrufers bei jedem Aufruf gegen das Handle prüfen.
  Bei nicht authentifizierten Servern ist das Handle notwendigerweise ein Bearer-Token und
  sollte mit ausreichender Entropie erzeugt werden (etwa UUIDv4) und eine begrenzte Lebensdauer
  haben.
- **Opazität.** Handles, die interne Struktur kodieren, laden zum Parsen oder Raten ein.
- **Lebensdauer.** Die Aufbewahrungspolitik sollte in der Beschreibung des Erzeugungs-Tools
  stehen, damit das Modell sie sieht.
- **Ablauf-Fehler.** Ein Aufruf gegen ein abgelaufenes oder unbekanntes Handle sollte einen
  Tool Execution Error liefern, der das benennt.

### 5.12 Sicherheitsanforderungen zu Tools

Server MÜSSEN:

- alle Tool-Eingaben validieren,
- ordentliche Zugriffskontrollen implementieren,
- Tool-Aufrufe rate-limiten,
- Tool-Ausgaben bereinigen.

Clients SOLLTEN:

- bei sensiblen Operationen Nutzerbestätigung einholen,
- Tool-Eingaben vor dem Aufruf anzeigen, um bösartige oder versehentliche Datenexfiltration zu
  vermeiden,
- Tool-Ergebnisse vor der Weitergabe an das LLM validieren,
- die `$ref`-Auflösungsregeln bei der Validierung gegen `inputSchema` und `outputSchema`
  befolgen,
- Timeouts für Tool-Aufrufe implementieren,
- Tool-Nutzung für Audits protokollieren.

---

## 6. Resources

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/server/resources, abgerufen 2026-09-12.**

### 6.1 Interaktionsmodell und Capability

Resources sind **application-driven**: die Host-Anwendung entscheidet, wie sie Kontext
einbindet, etwa über einen Resource-Picker, Suche und Filter oder automatische Einbindung nach
Heuristik.

```json
{ "capabilities": { "resources": { "listChanged": true, "subscribe": true } } }
```

- `listChanged`: der Server sendet Benachrichtigungen, wenn sich die Resource-Liste ändert.
- `subscribe`: der Server unterstützt ressourcenspezifische Aktualisierungsbenachrichtigungen
  für Resources, die über `subscriptions/listen` mit dem Filter `resourceSubscriptions`
  angefordert werden.

Beide Merkmale sind unabhängig voneinander deklarierbar. Unterstützt ein Server keines von
beiden, genügt `{ "capabilities": { "resources": {} } }`.

Wie bei Tools: Die Menge der Resources DARF NICHT pro Verbindung variieren, KANN aber nach der
mitgelieferten Autorisierung variieren.

### 6.2 `resources/list`

Unterstützt Pagination und Caching.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "resources": [
      {
        "uri": "file:///project/src/main.rs",
        "name": "main.rs",
        "title": "Rust Software Application Main File",
        "description": "Primary application entry point",
        "mimeType": "text/x-rust"
      }
    ],
    "nextCursor": "next-page-cursor",
    "ttlMs": 300000,
    "cacheScope": "public"
  }
}
```

Felder einer Resource: `uri` (Pflicht, eindeutig), `name`, `title` (optional), `description`
(optional), `icons` (optional), `mimeType` (optional), `size` in Bytes (optional).

### 6.3 `resources/read`

Unterstützt Caching.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": { "uri": "file:///project/src/main.rs" }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "contents": [
      {
        "uri": "file:///project/src/main.rs",
        "mimeType": "text/x-rust",
        "text": "fn main() { }"
      }
    ],
    "ttlMs": 60000,
    "cacheScope": "private"
  }
}
```

Server KÖNNEN mehrere Resource-Inhalte in einer Antwort liefern, etwa alle Dateien eines
Verzeichnisses. Inhalte sind entweder `text` oder `blob` (base64). Server KÖNNEN auf
`resources/read` auch mit einem `InputRequiredResult` antworten.

### 6.4 Resource Templates

`resources/templates/list` liefert parametrisierte Resources über URI-Templates nach RFC 6570.
Argumente können über die Completion-API vervollständigt werden. Unterstützt Pagination und
Caching.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resultType": "complete",
    "resourceTemplates": [
      {
        "uriTemplate": "file:///{path}",
        "name": "Project Files",
        "title": "Project Files",
        "description": "Access files in the project directory",
        "mimeType": "application/octet-stream"
      }
    ],
    "nextCursor": "next-page-cursor",
    "ttlMs": 300000,
    "cacheScope": "public"
  }
}
```

### 6.5 Subscriptions

`resources/subscribe` und `resources/unsubscribe` existieren nicht mehr. Clients abonnieren
Änderungen, indem sie `subscriptions/listen` mit den gewünschten URIs in
`notifications.resourceSubscriptions` senden. Der Server liefert auf dem entstehenden Stream
`notifications/resources/updated`:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "_meta": { "io.modelcontextprotocol/subscriptionId": 4 },
    "uri": "file:///project/src/main.rs"
  }
}
```

Mechanik in Abschnitt 8.8.

### 6.6 Annotationen

Resources, Resource Templates und Content-Blöcke unterstützen optionale `annotations`:

| Feld | Bedeutung |
| --- | --- |
| `audience` | Array mit `"user"` und/oder `"assistant"` |
| `priority` | Zahl von 0.0 bis 1.0; 1 heißt „wichtigste", 0 heißt „vollständig optional" |
| `lastModified` | ISO-8601-Zeitstempel der letzten Änderung |

### 6.7 URI-Schemata

Die Liste ist nicht abschließend; eigene Schemata sind erlaubt.

| Schema | Verwendung |
| --- | --- |
| `https://` | Web-Ressource. Server SOLLTEN dieses Schema nur nutzen, wenn der Client die Ressource selbst aus dem Web laden kann, also nicht über den MCP-Server lesen muss. Für andere Fälle SOLLTEN Server ein anderes oder eigenes Schema wählen, auch wenn der Server die Inhalte selbst aus dem Internet lädt. |
| `file://` | Ressourcen mit Dateisystemcharakter; sie müssen nicht auf ein physisches Dateisystem abbilden. Server KÖNNEN XDG-MIME-Typen wie `inode/directory` für Nicht-Regulärdateien nutzen. |
| `git://` | Git-Integration. |
| eigene | MÜSSEN RFC 3986 entsprechen und die obige Anleitung berücksichtigen. |

### 6.8 Fehlerbehandlung

- Existiert die angeforderte Resource nicht, MÜSSEN Server einen JSON-RPC-Fehler mit Code
  `-32602` (Invalid Params) zurückgeben.
- Für interne Fehler SOLLTEN Server `-32603` zurückgeben.
- Für Rückwärtskompatibilität SOLLTEN Clients auch `-32002` als „Resource nicht gefunden"
  akzeptieren, weil früher Protokollversionen diesen Code nutzten.
- Server DÜRFEN NICHT ein leeres `contents`-Array für eine nicht existierende Resource
  zurückgeben. Ein leeres Array ist mehrdeutig.

### 6.9 Sicherheitsanforderungen zu Resources

1. Server MÜSSEN alle Resource-URIs validieren.
2. Zugriffskontrollen SOLLTEN für sensible Resources implementiert werden.
3. Binärdaten MÜSSEN korrekt kodiert werden.
4. Resource-Berechtigungen SOLLTEN vor Operationen geprüft werden.
5. Server MÜSSEN Dateipfade bereinigen, um Directory-Traversal beim Ausliefern von
   `file://`-Resources zu verhindern.

### 6.10 Wann Resources statt Tools das richtige Mittel sind

Die Spezifikation gibt keine Entscheidungsregel vor. Aus den Interaktionsmodellen folgt
folgende Abgrenzung, die als **Ableitung** und nicht als Zitat zu lesen ist:

| Kriterium | Resource | Tool |
| --- | --- | --- |
| Wer entscheidet über die Nutzung | Anwendung bzw. Nutzer (application-driven) | Modell (model-controlled) |
| Charakter | benannter, adressierbarer Inhalt mit stabiler URI | Operation mit Parametern |
| Seiteneffekte | keine, reines Lesen | möglich, bis hin zu destruktiv |
| Wiederholbarkeit | idempotent, cachebar über `ttlMs` | je nach Tool |
| Parametrisierung | über URI-Template, mit Completion | über JSON-Schema-Argumente |
| Änderungsverfolgung | `subscriptions/listen` mit `resourceSubscriptions` | keine |

Praktisch: Resources eignen sich für stabile, benennbare Dokumente, die ein Nutzer in einem
Picker auswählen würde. Sobald Filterung, Suche mit mehreren Parametern oder eine
Schreiboperation im Spiel ist, ist ein Tool das richtige Mittel. Ein Zwischenweg ist ein Tool,
das `resource_link`-Blöcke zurückgibt.

---

## 7. Prompts

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/server/prompts, abgerufen 2026-09-12.**

### 7.1 Interaktionsmodell und Capability

Prompts sind **user-controlled**: sie werden dem Client mit der Absicht exponiert, dass der
Nutzer sie ausdrücklich auswählt. Die Spezifikation stellt klar, dass sich das auf die Frage
bezieht, wer den Einsatz entscheidet, nicht darauf, wer den Inhalt verfasst; der Inhalt wird
vom Server definiert. Typische Umsetzung sind Slash-Kommandos.

Server, die Prompts unterstützen, MÜSSEN die `prompts`-Capability in ihrem `DiscoverResult`
deklarieren:

```json
{ "capabilities": { "prompts": { "listChanged": true } } }
```

Auch hier: Die Menge DARF NICHT pro Verbindung variieren, KANN aber nach Autorisierung
variieren.

### 7.2 `prompts/list`

Unterstützt Pagination und Caching.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "prompts": [
      {
        "name": "code_review",
        "title": "Request Code Review",
        "description": "Asks the LLM to analyze code quality and suggest improvements",
        "arguments": [
          { "name": "code", "description": "The code to review", "required": true }
        ]
      }
    ],
    "nextCursor": "next-page-cursor",
    "ttlMs": 600000,
    "cacheScope": "public"
  }
}
```

Felder eines Prompts: `name` (Pflicht, eindeutig), `title` (optional), `description`
(optional), `icons` (optional), `arguments` (optional).

Ein Argument besteht aus `name`, optionaler `description` und optionalem `required`.
Argumentwerte können über die Completion-API vervollständigt werden.

### 7.3 `prompts/get`

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": { "code": "def hello():\n    print('world')" }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "description": "Code review prompt",
    "messages": [
      {
        "role": "user",
        "content": { "type": "text", "text": "Please review this Python code: ..." }
      }
    ]
  }
}
```

Server KÖNNEN auch hier mit `InputRequiredResult` antworten.

### 7.4 `PromptMessage`

- `role`: `"user"` oder `"assistant"`.
- `content`: `text`, `image`, `audio`, `resource_link` oder `resource`.

Bild- und Audiodaten MÜSSEN base64-kodiert sein und einen gültigen MIME-Typ tragen.
Eingebettete Resources MÜSSEN eine gültige Resource-URI, den passenden MIME-Typ und entweder
Text oder base64-kodierte Blob-Daten enthalten. Alle Content-Typen unterstützen die
Resource-Annotationen.

### 7.5 Fehlerbehandlung, Implementierung, Sicherheit

Server SOLLTEN Standard-JSON-RPC-Fehler nutzen:

- ungültiger Prompt-Name: `-32602`
- fehlende Pflichtargumente: `-32602`
- interne Fehler: `-32603`

Server SOLLTEN Prompt-Argumente vor der Verarbeitung validieren, Clients SOLLTEN Pagination bei
großen Listen behandeln, beide Seiten SOLLTEN die Capability-Aushandlung respektieren.
Implementierungen MÜSSEN alle Prompt-Ein- und -Ausgaben sorgfältig validieren, um
Injection-Angriffe und unbefugten Ressourcenzugriff zu verhindern.

### 7.6 Wann Prompts sinnvoll sind

Ableitung aus dem Interaktionsmodell, nicht wörtliches Zitat: Prompts lohnen sich, wenn ein
wiederkehrender Arbeitsablauf existiert, den der Nutzer bewusst startet und der mehr ist als
ein einzelner Tool-Aufruf, also eine mehrschrittige Anleitung mit fachlicher Vorgabe. Sie
lohnen sich nicht als Umhüllung eines einzelnen Tools, weil das Modell das Tool ohnehin selbst
auswählen kann.

---

## 8. Weitere Fähigkeiten

Zu jeder Fähigkeit: was sie tut, wer sie anbietet, und ob ein lokaler Buchhaltungsserver sie
braucht. Die Spalte „braucht unser Server" ist eine begründete Empfehlung, keine
Spezifikationsaussage.

### 8.0 Überblick

| Fähigkeit | Angeboten von | Status in `2026-07-28` | Braucht unser Server |
| --- | --- | --- | --- |
| Sampling | Client | deprecated | nein |
| Elicitation | Client | aktiv | nein in v1 |
| Roots | Client | deprecated | nein |
| Completion | Server | aktiv | nein |
| Logging (`notifications/message`) | Server | deprecated | nein, stattdessen `stderr` |
| Progress | Server (auf Client-Anforderung) | aktiv | optional, ja bei langen Operationen |
| Cancellation | Client (stdio), Transport (HTTP) | aktiv | ja, verpflichtend zu behandeln |
| Pagination | Server | aktiv | nein für `tools/list` |
| Caching (`ttlMs`, `cacheScope`) | Server | aktiv, Pflicht | ja |
| Subscriptions | Server | aktiv | nein |

### 8.1 Sampling (deprecated)

**Was:** Der Server lässt über den Client eine LLM-Vervollständigung erzeugen
(`sampling/createMessage`), inklusive `modelPreferences`, `systemPrompt`, `maxTokens`, seit
`2025-11-25` auch `tools` und `toolChoice`.

**Wer:** Client-Fähigkeit, deklariert als `sampling` in `ClientCapabilities`.

**Status:** Deprecated seit `2026-07-28` (SEP-2577). Neue Implementierungen SOLLTEN es NICHT
übernehmen. Empfohlener Migrationspfad laut Deprecated-Register: direkte Integration mit den
APIs der LLM-Anbieter. Frühestmögliche Entfernung: erste Revision, die am oder nach dem
2027-07-28 erscheint. Die `includeContext`-Werte `"thisServer"` und `"allServers"` sind
gesondert deprecated; stattdessen Feld weglassen oder `"none"` nutzen.

**Braucht unser Server:** Nein. Ein Buchhaltungsserver soll deterministisch API-Daten liefern,
nicht selbst Modelle aufrufen.

### 8.2 Elicitation und Multi Round-Trip Requests

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr und
https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation, abgerufen 2026-09-12.**

**Was:** Der Server fordert während der Bearbeitung eines Requests zusätzliche Informationen
vom Nutzer an. Seit `2026-07-28` läuft das ausschließlich über MRTR. Die Spezifikation ist
hier eindeutig: Server MÜSSEN Server-zu-Client-Requests (`roots/list`,
`sampling/createMessage`, `elicitation/create`) über das MRTR-Muster senden. Das früher
übliche Muster server-initiierter Requests wird nicht mehr unterstützt. Das ist ein Breaking
Change.

**Ablauf:**

1. Client sendet den Request.
2. Server stellt fest, dass Information fehlt, und antwortet mit `resultType: "input_required"`
   und einem `InputRequiredResult`.
3. Client beschafft die Information und **wiederholt den Originalrequest** mit
   `inputResponses` und, falls vorhanden, `requestState`.
4. Server liefert das Endergebnis.

`InputRequiredResult`:

- `inputRequests` (optional): Map serverseitig vergebener String-Identifier auf
  Request-Objekte. Werte MÜSSEN `ElicitRequest`, `CreateMessageRequest` oder
  `ListRootsRequest` sein. Die Schlüssel MÜSSEN innerhalb des Requests eindeutig sein.
- `requestState` (optional): opaker String, nur für den Server bedeutsam. Clients MÜSSEN
  NICHT hineinsehen, ihn parsen, verändern oder Annahmen über seinen Inhalt treffen.

Unterstützt wird `InputRequiredResult` nur auf `prompts/get`, `resources/read` und
`tools/call`. Auf allen anderen Client-Requests MÜSSEN Server es NICHT senden.

Server-Anforderungen:

- Der Server MUSS mindestens eines von `inputRequests` oder `requestState` in jedem
  `InputRequiredResult` mitschicken.
- Der Server DARF NICHT `inputRequests` senden, für die der Client keine Capability deklariert
  hat.
- Der Server DARF NICHT annehmen, dass der Client die Requests erfüllt oder den Originalrequest
  wiederholt.
- Enthält ein eingehender Request ein `requestState`, MÜSSEN Server es als
  angreiferkontrollierte Eingabe behandeln. Beeinflusst `requestState` Autorisierung,
  Ressourcenzugriff oder Geschäftslogik, MÜSSEN Server seine Integrität schützen (etwa HMAC
  oder AEAD) und manipuliertes State ablehnen. Integritätsschutz KANN nur entfallen, wenn
  Manipulation höchstens zum Scheitern des Requests führen kann.
- Gegen Replay SOLLTEN Server im integritätsgeschützten `requestState` mitführen und prüfen:
  den authentifizierten Principal, eine kurze TTL, und einen Identifier des Ursprungsrequests
  (Methodenname plus Digest der wesentlichen Parameter). Diese Maßnahmen begrenzen das
  Replay-Fenster, garantieren aber keine Einmalverwendung; wo das nötig ist, MÜSSEN Server es
  serverseitig erzwingen.

Client-Anforderungen:

- Enthält das Ergebnis `inputRequests`, MUSS der Client die Eingaben beschaffen, bevor er
  wiederholt. Fehlt `inputRequests`, KANN er sofort wiederholen.
- Enthält das Ergebnis `requestState`, MUSS der Client den exakten Wert beim Retry
  zurückspiegeln. Fehlt es, MUSS er keines mitschicken.
- Die JSON-RPC-`id` MUSS zwischen Originalrequest und Retry unterschiedlich sein.
- Beide Felder betreffen ausschließlich den Retry des Originalrequests und DÜRFEN NICHT für
  andere parallel laufende Requests verwendet werden.

**Elicitation-Modi:** `form` (strukturierte Daten über den Client, mit eingeschränktem
JSON-Schema: flache Objekte mit primitiven Eigenschaften, String-Formate `email`, `uri`,
`date`, `date-time`) und `url` (Out-of-Band-Interaktion über eine URL, deren Inhalt der Client
nicht sieht).

Harte Sicherheitsregel: Server DÜRFEN NICHT Form-Mode-Elicitation nutzen, um sensible
Informationen wie Passwörter, API-Schlüssel, Access-Token oder Zahlungsdaten anzufordern. Für
solche Interaktionen MÜSSEN sie URL-Mode nutzen. Allgemeine Kontakt- oder Profildaten (Name,
E-Mail, Benutzername) sind nicht kategorisch verboten.

Antwortaktionen: `accept` (mit `content` im Form-Mode, ohne im URL-Mode), `decline`
(ausdrückliche Ablehnung), `cancel` (Abbruch ohne Entscheidung).

**Braucht unser Server:** Nein in v1. Begründung: Zugangsdaten kommen bei stdio aus der
Umgebung, nicht aus einer Nutzerabfrage. Fehlende Pflichtparameter gehören als Tool Execution
Error mit klarer Meldung zurück, damit das Modell nachfragt oder korrigiert. Der
`requestState`-Integritätsschutz wäre zusätzlicher Aufwand ohne Gegenwert. Eine servereigene
Bestätigung vor Schreiboperationen ist nach der Entscheidung in 11.3 nicht vorgesehen; wäre sie
es, wäre Elicitation die spezifikationskonforme Lösung.

### 8.3 Roots (deprecated)

**Was:** Der Client teilt dem Server Wurzelverzeichnisse oder -dateien mit (`roots/list`).

**Wer:** Client-Fähigkeit, `roots` in `ClientCapabilities`.

**Status:** Deprecated seit `2026-07-28` (SEP-2577). Zusätzlich wurde
`notifications/roots/list_changed` ersatzlos entfernt. Migrationspfad: Verzeichnisse oder
Dateien über Tool-Parameter, Resource-URIs oder Serverkonfiguration übergeben.

**Braucht unser Server:** Nein. Es gibt keinen Dateisystembezug.

### 8.4 Completion

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/completion.**

**Was:** Autovervollständigung für Argumente von Prompts und Resource Templates über
`completion/complete`.

**Wer:** Server-Fähigkeit. Server, die Completions unterstützen, MÜSSEN die
`completions`-Capability deklarieren.

**Referenztypen:** `ref/prompt` (Prompt nach Name), `ref/resource` (Resource-URI oder
URI-Template).

**Ergebnis:** `completion.values` (maximal 100 Einträge), optional `total`, `hasMore`.
Über `context.arguments` können bereits aufgelöste Argumentwerte mitgegeben werden.

Fehler: `-32601` wenn die Capability fehlt, `-32602` bei ungültigem Prompt-Namen oder
fehlenden Pflichtargumenten, `-32603` intern.

**Braucht unser Server:** Nein, solange wir weder Prompts noch Resource Templates anbieten.
Completion gilt ausschließlich für diese beiden, nicht für Tool-Argumente.

### 8.5 Logging (deprecated)

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging.**

**Was:** Strukturierte Logmeldungen vom Server an den Client über `notifications/message`, mit
Syslog-Schweregraden nach RFC 5424 (`debug`, `info`, `notice`, `warning`, `error`, `critical`,
`alert`, `emergency`).

**Wer:** Server-Fähigkeit, `logging` in `ServerCapabilities`.

**Status:** Deprecated seit `2026-07-28` (SEP-2577). Neue Implementierungen SOLLTEN es NICHT
übernehmen; Migration nach `stderr` bei stdio oder OpenTelemetry für strukturierte
Observability. `logging/setLevel` wurde ersatzlos entfernt.

**Mechanik, solange vorhanden:** Das Log-Level wird pro Request über
`_meta["io.modelcontextprotocol/logLevel"]` gesetzt. Der Server DARF NICHT
`notifications/message` für einen Request senden, der dieses Feld nicht enthält. Die
Notification ist request-scoped: der Server DARF sie NICHT auf einem
`subscriptions/listen`-Stream oder einem anderen Stream als dem Response-Stream des
auslösenden Requests liefern. Ein unbekannter Log-Level-Wert SOLLTE mit `-32602` abgelehnt
werden.

**Sicherheitsregel:** Logmeldungen DÜRFEN NICHT Zugangsdaten oder Geheimnisse,
personenbezogene Daten oder interne Systemdetails enthalten, die Angriffe erleichtern könnten.

**Braucht unser Server:** Nein. Logging geht auf `stderr`, was die stdio-Spezifikation
ausdrücklich für jede Art von Logging erlaubt.

### 8.6 Progress

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress.**

**Was:** Fortschrittsmeldungen für langlaufende Operationen.

**Wer:** Der Client fordert sie an, indem er `progressToken` in `_meta` des Requests setzt; der
Server KANN dann `notifications/progress` senden.

Regeln:

- Progress-Token MÜSSEN ein String oder Integer sein und MÜSSEN über alle aktiven Requests
  hinweg eindeutig sein.
- `progress` MUSS mit jeder Notification steigen, auch wenn `total` unbekannt ist.
- `progress` und `total` KÖNNEN Fließkommazahlen sein.
- `message` SOLLTE eine sinnvolle menschenlesbare Information tragen.
- Progress-Notifications MÜSSEN nur Token referenzieren, die in einem aktiven Request
  übergeben wurden und zu einer laufenden Operation gehören.
- Progress-Notifications MÜSSEN nach Abschluss aufhören.
- Beide Seiten SOLLTEN aktive Token verfolgen und Rate-Limiting implementieren.

Transportregel: Die Notification gehört auf den Response-Stream des auslösenden Requests
(HTTP) beziehungsweise auf den gemeinsamen Kanal (stdio); sie gehört nicht auf den
`subscriptions/listen`-Stream.

**Braucht unser Server:** Optional. Sinnvoll für Tools, die mehrere Seiten der
BuchhaltungsButler-API aggregieren oder Dateien hochladen. Der Aufwand ist gering, der Nutzen
für den Nutzer real.

### 8.7 Cancellation

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation.**

**Was:** Abbruch laufender Requests.

**Transportabhängig:**

- **Streamable HTTP:** Das Schließen des SSE-Response-Streams ist das Abbruchsignal. Der Server
  MUSS eine Client-Trennung als Abbruch dieses Requests werten. Keine
  `notifications/cancelled`-Nachricht nötig oder erwartet.
- **stdio:** Es gibt keinen Per-Request-Stream. Der Client MUSS
  `notifications/cancelled` mit der Request-ID senden.

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/cancelled",
  "params": { "requestId": "123", "reason": "User requested cancellation" }
}
```

Weitere Regeln:

- Ein Server MUSS `notifications/cancelled` mit der ID eines `subscriptions/listen`-Requests
  senden, wenn er diesen Subscription-Stream abbaut. Für jeden anderen Zweck MUSS er
  `notifications/cancelled` NICHT senden.
- Abbruchmeldungen MÜSSEN nur Requests referenzieren, die der Client vorher gesendet hat und
  die vermutlich noch laufen.
- Server, die eine Abbruchmeldung erhalten, SOLLTEN die Verarbeitung stoppen, Ressourcen
  freigeben und **keine** Antwort auf den abgebrochenen Request senden.
- Server KÖNNEN Abbruchmeldungen ignorieren, wenn der Request unbekannt ist, die Verarbeitung
  bereits abgeschlossen ist oder der Request nicht abbrechbar ist.
- Der Client SOLLTE eine später eintreffende Antwort auf den abgebrochenen Request ignorieren.
- Ungültige Abbruchmeldungen SOLLTEN ignoriert werden.

Timeouts: Implementierungen SOLLTEN für alle gesendeten Requests Timeouts setzen. Beim Ablauf
SOLLTE der Sender abbrechen und nicht weiter warten. Implementierungen KÖNNEN die Timeout-Uhr
bei einer Progress-Notification zurücksetzen, SOLLTEN aber immer ein Maximum erzwingen.

**Braucht unser Server:** Ja. Auf stdio muss `notifications/cancelled` behandelt werden, sonst
laufen abgebrochene HTTP-Aufrufe gegen die BuchhaltungsButler-API weiter.

### 8.8 Subscriptions

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions.**

**Was:** `subscriptions/listen` öffnet einen langlebigen Notification-Stream vom Server zum
Client. Es ersetzt `resources/subscribe` und den HTTP-GET-Endpunkt.

Notification-Filter in `params.notifications`:

| Feld | Typ | Wirkung |
| --- | --- | --- |
| `toolsListChanged` | `boolean` | `notifications/tools/list_changed` |
| `promptsListChanged` | `boolean` | `notifications/prompts/list_changed` |
| `resourcesListChanged` | `boolean` | `notifications/resources/list_changed` |
| `resourceSubscriptions` | `string[]` | `notifications/resources/updated` für diese URIs |

Alle Felder sind optional. Der Server DARF NICHT Notification-Typen senden, die der Client
nicht ausdrücklich angefordert hat.

Der Server MUSS `notifications/subscriptions/acknowledged` als erste Nachricht senden, mit der
Subscription-ID in `_meta["io.modelcontextprotocol/subscriptionId"]`, und DARF NICHT vorher
eine Notification auf dieser Subscription senden. Auf stdio gilt diese Reihenfolge pro
Subscription-ID, nicht pro Kanal; Nachrichten anderer Subscriptions KÖNNEN davor
verschachtelt sein. Das `notifications`-Feld der Bestätigung spiegelt die Teilmenge wider, die
der Server zusagt.

Die Subscription-ID ist die JSON-RPC-ID des `subscriptions/listen`-Requests. Auf stdio MÜSSEN
Clients dieses Feld zur Zuordnung verwenden.

Beendigung: Der Client beendet durch Schließen des SSE-Streams (HTTP) oder
`notifications/cancelled` (stdio). Beendet der Server von sich aus, SOLLTE er auf den
ursprünglichen `subscriptions/listen`-Request mit einem `resultType: "complete"`-Result
antworten, bevor er den Stream schließt. Auf stdio MUSS der Client nach einem
Verbindungsabbruch `subscriptions/listen` erneut senden; der Server hält keinen
Subscription-Zustand über Reconnects.

**Braucht unser Server:** Nein. Die Tool-Liste ist statisch, Resources sind nicht geplant.

### 8.9 Deprecated-Register

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/deprecated, abgerufen 2026-09-12.**

Ein deprecated Feature bleibt Teil der Spezifikation, ist aber zur Entfernung vorgesehen. Neue
Implementierungen SOLLTEN es NICHT übernehmen, bestehende SOLLTEN vor der
frühestmöglichen Entfernung migrieren. Die Deprecation-Policy sieht ein Minimum von zwölf
Monaten zwischen Deprecation und frühestmöglicher Entfernung vor.

| Feature | Deprecated in | Migrationspfad | Frühestmögliche Entfernung |
| --- | --- | --- | --- |
| Roots | `2026-07-28` | Verzeichnisse/Dateien über Tool-Parameter, Resource-URIs oder Serverkonfiguration | erste Revision am oder nach 2027-07-28 |
| Sampling | `2026-07-28` | direkte Integration mit LLM-Provider-APIs | erste Revision am oder nach 2027-07-28 |
| Logging | `2026-07-28` | `stderr` bei stdio, OpenTelemetry für Observability | erste Revision am oder nach 2027-07-28 |
| Dynamic Client Registration | `2026-07-28` | Client ID Metadata Documents | erste Revision am oder nach 2027-07-28 |
| `includeContext: "thisServer"` / `"allServers"` | `2025-11-25` | Feld weglassen oder `"none"` | folgt Sampling |
| HTTP+SSE-Transport | `2025-03-26` | Streamable HTTP | drei Monate nachdem SEP-2596 Final erreicht |

Bislang wurde unter dieser Policy kein Feature entfernt.

### 8.10 Caching (neu und verpflichtend)

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching.**

Server MÜSSEN Caching-Hinweise auf Results mit `resultType: "complete"` folgender Operationen
mitschicken:

- `server/discover`
- `tools/list`
- `prompts/list`
- `resources/list`
- `resources/templates/list`
- `resources/read`

Zwischenergebnisse mit `resultType: "input_required"` sind nicht cachebar und tragen keine
Hinweise.

`ttlMs` (Integer, Millisekunden, Semantik analog zu HTTP `Cache-Control: max-age`):

- `0`: sofort veraltet, der Client KANN bei jedem Bedarf neu holen.
- positiv: der Client SOLLTE das Ergebnis so viele Millisekunden als frisch betrachten.
- fehlend: Clients SOLLTEN `0` annehmen; das sollte nur bei älteren Serverversionen vorkommen.
- negativ: Clients SOLLTEN es ignorieren und als `0` behandeln.
- Server MÜSSEN einen Wert `>= 0` liefern.

`cacheScope`:

| Wert | Bedeutung |
| --- | --- |
| `"public"` | keine nutzerspezifischen Daten; jeder Client, jedes Gateway, jeder Caching-Proxy KANN die Antwort speichern und jedem Nutzer ausliefern |
| `"private"` | private Daten; Wiederverwendung nur im selben Autorisierungskontext, Caches DÜRFEN NICHT über Autorisierungskontexte hinweg geteilt werden |

Empfehlung der Spezifikation: `"public"` für Listen von Tools, Prompts und Resource Templates,
wenn sie für alle Nutzer identisch sind; `"private"` für `resources/read`-Ergebnisse, die vom
authentifizierten Nutzer abhängen, und für nutzerabhängig gefilterte Listen.

Cache-Key ist die Methode zusammen mit den ergebnisrelevanten Parametern (etwa `uri`,
`cursor`). Ergebnisse aus MRTR-Retries (Requests mit `inputResponses` oder `requestState`)
DÜRFEN NICHT gecacht werden.

TTL und `listChanged` ergänzen sich: eine empfangene Notification invalidiert einen noch
frischen Cache-Eintrag sofort. Clients SOLLTEN TTL NICHT als Polling-Intervall verstehen; wer
doch pollt, MUSS Jitter und Backoff anwenden.

Bei Pagination ist jede Seite unabhängig cachebar mit eigener `ttlMs`. Server MÜSSEN
denselben `cacheScope` auf alle Seiten einer Listenanfrage anwenden.

Sicherheitshinweis: Server MÜSSEN sich bewusst sein, dass `"public"`-Antworten auch aus
authentifizierten Endpunkten heraus zwischen Aufrufern geteilt werden können. Server MÜSSEN
angemessene Zugriffskontrollen pro Primitive durchsetzen und DÜRFEN NICHT allein auf
`cacheScope` vertrauen, um unbefugten Zugriff zu verhindern.

### 8.11 Pagination

**Quelle: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/pagination.**

Cursor-basiert, nicht seitennummeriert. Der Cursor ist ein opaker String. Die Seitengröße
bestimmt der Server; Clients DÜRFEN NICHT von einer festen Seitengröße ausgehen.

Unterstützt wird Pagination von `resources/list`, `resources/templates/list`, `prompts/list`
und `tools/list`.

- Server SOLLTEN stabile Cursor liefern und ungültige Cursor sauber behandeln.
- Clients SOLLTEN ein fehlendes `nextCursor` als Ende der Ergebnisse werten und beide Varianten
  unterstützen.
- Clients MÜSSEN Cursor als opake Token behandeln: nicht parsen, nicht verändern, keine
  Entscheidung außer „Wert vorhanden oder nicht" darauf stützen. Ein leerer String ist ein
  gültiger Cursor und DARF NICHT als Ende gewertet werden.
- Ungültige Cursor SOLLTEN zu `-32602` (Invalid params) führen.

---

## 9. Fehlerbehandlung: JSON-RPC-Fehler gegen Tool-Fehler

**Quellen (abgerufen 2026-09-12):**

- https://modelcontextprotocol.io/specification/2026-07-28/basic (Abschnitt „Error Codes")
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools (Abschnitt „Error Handling")

### 9.1 Fehlercode-Bereiche

MCP nutzt die Standard-JSON-RPC-2.0-Fehlercodes (`-32700`, `-32600` bis `-32603`) für
allgemeine Protokollfehler. Den von JSON-RPC reservierten Implementierungsbereich `-32000` bis
`-32099` partitioniert MCP:

- **`-32000` bis `-32019`, Legacy.** Codes in diesem Teilbereich wurden von Implementierungen
  vor dieser Politik vergeben. Neue Codes DÜRFEN NICHT hier vergeben werden, neue
  Implementierungen SOLLTEN NICHT Codes daraus verwenden. Außer `-32002` MÜSSEN Empfänger
  keine bestimmte Bedeutung annehmen.
- **`-32020` bis `-32099`, reserviert für die Spezifikation.** Implementierungen MÜSSEN
  NICHT Codes daraus ausgeben, die die Spezifikation nicht definiert, und MÜSSEN definierte
  Codes nur mit der festgelegten Bedeutung verwenden.

Von MCP definierte Codes:

| Code | Name |
| --- | --- |
| `-32020` | `HeaderMismatch` |
| `-32021` | `MissingRequiredClientCapability` |
| `-32022` | `UnsupportedProtocolVersion` |

Reservierte, nicht mehr zu verwendende Codes: `-32002` (Resource nicht gefunden, bis
`2025-11-25`; ersetzt durch `-32602`) und `-32042` (URL-Elicitation erforderlich, nur
`2025-11-25`). Implementierungen dieser Protokollversion DÜRFEN NICHT diese Codes ausgeben.
Clients SOLLTEN `-32002` von älteren Servern weiterhin akzeptieren.

Neue Codes für Zwecke, die die Spezifikation nicht definiert, SOLLTEN außerhalb des
JSON-RPC-Reservatbereichs (`-32768` bis `-32000`) vergeben werden.

Rein lokale Fehler (etwa ein Request-Timeout im SDK) sind derzeit nicht codiert.
Implementierungen, die lokale Fehler in JSON-RPC-Form darstellen, sollten sicherstellen, dass
sie nicht mit Fehlern der Gegenstelle verwechselt werden können.

### 9.2 Entscheidungsregel: Protocol Error oder Tool Execution Error

Die Tools-Seite unterscheidet zwei Mechanismen.

**Protocol Errors** signalisieren Probleme mit der Struktur des Requests, die ein Modell kaum
beheben kann:

- unbekanntes Tool,
- malformed Requests, die das `CallToolRequest`-Schema nicht erfüllen,
- Serverfehler.

Sie werden als gewöhnliche JSON-RPC-Fehler zurückgegeben:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": { "code": -32602, "message": "Unknown tool: invalid_tool_name" }
}
```

**Tool Execution Errors** enthalten verwertbares Feedback, mit dem das Modell sich selbst
korrigieren und mit angepassten Parametern erneut versuchen kann:

- API-Fehler,
- Eingabevalidierungsfehler (Datum im falschen Format, Wert außerhalb des zulässigen
  Bereichs),
- Fehler der Geschäftslogik.

Sie stehen im Tool-Ergebnis mit `isError: true`:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "resultType": "complete",
    "content": [
      {
        "type": "text",
        "text": "Invalid departure date: must be in the future. Current date is 2026-09-12."
      }
    ],
    "isError": true
  }
}
```

Clients KÖNNEN Protokollfehler an das Modell weitergeben, was aber selten zur erfolgreichen
Erholung führt. Clients SOLLTEN Tool Execution Errors an das Modell weitergeben, um
Selbstkorrektur zu ermöglichen.

Die Regel in einem Satz: Alles, was aus dem Tool selbst kommt, gehört in das Result mit
`isError: true`; nur Fehler beim Finden des Tools, fehlende Tool-Unterstützung und
Ausnahmezustände gehören in die JSON-RPC-Fehlerantwort.

Seit `2025-11-25` ausdrücklich klargestellt: Eingabevalidierungsfehler gehören zu den Tool
Execution Errors, nicht zu den Protocol Errors.

### 9.3 Fehlercodes nach Kontext

| Situation | Mechanismus | Code |
| --- | --- | --- |
| Pflichtfeld in `_meta` fehlt | JSON-RPC | `-32602`, auf HTTP zusätzlich `400` |
| Client-Capability fehlt | JSON-RPC | `-32021`, auf HTTP zusätzlich `400` |
| Protokollversion nicht unterstützt | JSON-RPC | `-32022`, auf HTTP zusätzlich `400` |
| Header und Body weichen ab (HTTP) | JSON-RPC | `-32020`, HTTP `400` |
| Methode nicht implementiert (HTTP) | JSON-RPC | `-32601`, HTTP `404` |
| Unbekanntes Tool | JSON-RPC | `-32602` |
| Resource nicht gefunden | JSON-RPC | `-32602` |
| Ungültiger Cursor | JSON-RPC | `-32602` |
| Ungültiger Prompt-Name oder fehlendes Pflichtargument | JSON-RPC | `-32602` |
| Ungültiger Log-Level | JSON-RPC | `-32602` |
| Interner Serverfehler | JSON-RPC | `-32603` |
| Fachlicher Fehler im Tool, API-Fehler, Validierungsfehler | Tool-Ergebnis | `isError: true` |
| Ungültiger `Origin` (HTTP) | HTTP-Status | `403 Forbidden` |

---

## 10. Sicherheitsanforderungen der Spezifikation

**Quellen (abgerufen 2026-09-12):**

- https://modelcontextprotocol.io/specification (Abschnitt „Security and Trust and Safety")
- https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices
- die Sicherheitsabschnitte der Tools-, Resources-, Prompts- und Elicitation-Seiten

### 10.1 Grundprinzipien

**Zustimmung und Kontrolle des Nutzers**

- Nutzer müssen jedem Datenzugriff und jeder Operation ausdrücklich zustimmen und sie
  verstehen.
- Nutzer müssen die Kontrolle darüber behalten, welche Daten geteilt und welche Aktionen
  ausgeführt werden.
- Implementierungen sollten klare Oberflächen zur Prüfung und Autorisierung bereitstellen.

**Datenschutz**

- Hosts müssen ausdrückliche Zustimmung einholen, bevor sie Nutzerdaten an Server geben.
- Hosts dürfen Resource-Daten nicht ohne Zustimmung anderswohin übertragen.
- Nutzerdaten sollten mit angemessenen Zugriffskontrollen geschützt werden.

**Tool-Sicherheit**

- Tools stellen die Ausführung beliebigen Codes dar und müssen entsprechend vorsichtig
  behandelt werden.
- **Beschreibungen des Tool-Verhaltens, einschließlich Annotations, sind als nicht
  vertrauenswürdig zu betrachten, sofern sie nicht von einem vertrauenswürdigen Server
  stammen.**
- Hosts müssen ausdrückliche Zustimmung einholen, bevor sie ein Tool aufrufen.
- Nutzer sollten verstehen, was ein Tool tut, bevor sie seine Nutzung autorisieren.

Die Spezifikation stellt selbst fest, dass sie diese Prinzipien nicht auf Protokollebene
erzwingen kann. Implementierungen SOLLTEN robuste Zustimmungs- und Autorisierungsflüsse bauen,
Sicherheitsimplikationen dokumentieren, Zugriffskontrollen und Datenschutz umsetzen,
Sicherheitspraxis befolgen und Datenschutzfolgen im Feature-Design berücksichtigen.

### 10.2 Warum Beschreibungen keine vertrauenswürdigen Anweisungen sind

Der Schema-Kommentar zu `ToolAnnotations` ist der Kernsatz: alle Eigenschaften sind Hinweise,
sie garantieren keine wahrheitsgemäße Beschreibung des Verhaltens, auch nicht die
deskriptiven. Clients sollen niemals Tool-Nutzungsentscheidungen auf Annotations von nicht
vertrauenswürdigen Servern stützen.

Daraus folgen zwei Richtungen, die auseinandergehalten werden müssen:

1. **Als Client:** Eine Tool-Beschreibung eines fremden Servers ist Nutzdatum, nicht
   Anweisung. Ein Server kann in `description` oder `annotations.title` Text unterbringen, der
   das Modell zu unerwünschtem Verhalten bewegen soll (Tool Poisoning). Deshalb die
   Host-Pflicht zu Human-in-the-Loop und Anzeige der Tool-Eingaben vor dem Aufruf.
2. **Als Server:** Alles, was aus der externen API oder aus Nutzerdaten in ein Tool-Ergebnis
   fließt, ist ebenfalls Nutzdatum. Freitextfelder in Belegen, Rechnungspositionen,
   Buchungstexten oder Kontoauszügen sind fremdkontrolliert und können Anweisungen an das
   Modell enthalten (indirekte Prompt Injection). Ein Server darf solche Inhalte nicht als
   Instruktion behandeln und sollte sie erkennbar als Daten liefern.

Ergänzend die Tools-Regeln: Server MÜSSEN alle Eingaben validieren und Ausgaben bereinigen;
Clients SOLLTEN Tool-Ergebnisse validieren, bevor sie sie an das LLM geben.

### 10.3 Confused Deputy

Betrifft MCP-Proxy-Server, die Clients mit Drittanbieter-APIs verbinden und dabei als einzelner
OAuth-Client gegenüber dem Dritten auftreten. Verwundbar ist die Kombination aus:

- statischer Client-ID gegenüber dem Drittanbieter-Authorization-Server,
- dynamischer Registrierung der MCP-Clients (jeder mit eigener `client_id`),
- Consent-Cookie beim Drittanbieter nach der ersten Autorisierung,
- fehlender Per-Client-Zustimmung vor der Weiterleitung.

Angriff: Der Angreifer registriert dynamisch einen Client mit bösartiger `redirect_uri`,
schickt dem Nutzer einen präparierten Link; das vorhandene Consent-Cookie lässt den
Drittanbieter den Zustimmungsdialog überspringen; der MCP-Authorization-Code landet beim
Angreifer.

Gegenmaßnahmen, die die Spezifikation als MUSS formuliert:

- **Per-Client-Consent-Speicher.** Registry der je Nutzer freigegebenen `client_id`-Werte,
  Prüfung **vor** dem Start des Drittanbieter-Flows, sichere Speicherung.
- **Consent-UI.** Nennt den anfragenden Client beim Namen, zeigt die angefragten
  Drittanbieter-Scopes und die registrierte `redirect_uri`, implementiert CSRF-Schutz und
  verhindert Iframing (`frame-ancestors` oder `X-Frame-Options: DENY`).
- **Consent-Cookies.** `__Host-`-Präfix, `Secure`, `HttpOnly`, `SameSite=Lax`, kryptografisch
  signiert oder serverseitige Session, gebunden an die konkrete `client_id`.
- **Redirect-URI-Validierung.** Exakter String-Vergleich gegen die registrierte URI, keine
  Muster, keine Wildcards, Ablehnung bei Änderung ohne Neuregistrierung.
- **OAuth-`state`.** Kryptografisch sicherer Zufallswert pro Request, serverseitig gespeichert
  **erst nach** erteilter Zustimmung, am Callback exakt verglichen, Einmalverwendung, kurze
  Ablaufzeit (etwa zehn Minuten). Das Cookie oder die Session mit dem `state` DARF NICHT vor
  der Zustimmung gesetzt werden, sonst ist der Zustimmungsdialog wirkungslos.

### 10.4 Umgang mit Zugangsdaten

**Token Passthrough ist verboten.** Ein MCP-Server DARF NICHT Token akzeptieren, die nicht
ausdrücklich für ihn ausgestellt wurden. Die zwei Dimensionen des Anti-Patterns:

1. **Fehlende Audience-Prüfung.** Wer nicht prüft, ob ein Token für ihn bestimmt war (etwa
   über den Audience-Claim nach RFC 9068), akzeptiert möglicherweise Token anderer Dienste.
2. **Weiterreichen.** Wer solche Token unverändert an nachgelagerte Dienste weitergibt,
   erzeugt genau das Confused-Deputy-Problem.

Risiken laut Spezifikation: Umgehung von Sicherheitskontrollen (Rate Limiting,
Request-Validierung, Traffic-Monitoring), kaputte Audit-Kette, Vertrauensgrenzverletzungen und
zukünftige Kompatibilitätsrisiken.

**Für stdio gilt:** Implementierungen auf stdio SOLLTEN dem Authorization-Framework NICHT
folgen und Zugangsdaten stattdessen aus der Umgebung beziehen (Base-Protocol-Seite, Abschnitt
„Auth").

**Drittanbieter-Credentials über URL-Mode-Elicitation:** Die Credentials DÜRFEN NICHT durch
den MCP-Client laufen. Der MCP-Server DARF NICHT die Credentials des Clients für den
Drittanbieter verwenden (das wäre Token Passthrough). Der Nutzer MUSS den MCP-Server direkt
autorisieren. Der MCP-Server ist für Speicherung und Verwaltung der Drittanbieter-Token
verantwortlich.

**Logging:** Logmeldungen DÜRFEN NICHT Zugangsdaten, Geheimnisse, personenbezogene Daten oder
interne Systemdetails enthalten.

**HTTP-Header aus Tool-Parametern:** Entwickler SOLLTEN NICHT sensible Parameter (Passwörter,
API-Schlüssel, Token, personenbezogene Daten) mit `x-mcp-header` markieren, weil Header-Werte
für Netzwerkvermittler sichtbar sind.

### 10.5 Tool Poisoning und Prompt Injection

Die Spezifikation behandelt das als Vertrauensproblem, nicht als eigenen Angriffsnamen. Die
normativen Anker sind:

- Beschreibungen des Tool-Verhaltens, einschließlich Annotations, sind als nicht
  vertrauenswürdig zu betrachten, sofern sie nicht von einem vertrauenswürdigen Server
  stammen (Übersichtsseite).
- Clients MÜSSEN Tool-Annotations als nicht vertrauenswürdig behandeln, sofern sie nicht von
  vertrauenswürdigen Servern stammen (Tools-Seite).
- Clients SOLLTEN Tool-Eingaben vor dem Aufruf anzeigen, um bösartige oder versehentliche
  Datenexfiltration zu vermeiden, und Tool-Ergebnisse validieren, bevor sie an das LLM gehen.
- Implementierungen MÜSSEN alle Prompt-Ein- und -Ausgaben sorgfältig validieren, um
  Injection-Angriffe zu verhindern (Prompts-Seite).
- Icon-Metadaten und Icon-Bytes sind als nicht vertrauenswürdige Eingaben zu behandeln; Icons
  dürfen ausführbaren Inhalt tragen (etwa SVG mit eingebettetem JavaScript).

### 10.6 Weitere Angriffsvektoren der Best-Practices-Seite

**Server-Side Request Forgery (SSRF).** Betrifft MCP-Clients, die URLs aus der
OAuth-Metadaten-Discovery abrufen. Clients SOLLTEN HTTPS erzwingen (Ausnahme Loopback in der
Entwicklung), private und reservierte IP-Bereiche blockieren (`10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, `127.0.0.0/8`, `::1`, `169.254.0.0/16`, `fc00::/7`, `fe80::/10`), dieselbe
Validierung auf Redirect-Ziele anwenden und in Serverdeployments Egress-Proxies einsetzen.
Ausdrücklicher Hinweis: IP-Validierung nicht selbst implementieren, weil Angreifer
Kodierungstricks (oktal, hexadezimal, IPv4-mapped IPv6) nutzen.

**State Handle Hijacking.** Da MCP zustandslos ist und Server Zustand über explizite Handles
führen, ist das Erraten oder Abgreifen eines Handles ein Angriffsvektor. Server, die
Autorisierung implementieren, MÜSSEN alle eingehenden Requests prüfen und DÜRFEN NICHT den
Besitz eines Handles als Authentifizierung werten. Server SOLLTEN sichere,
nicht-deterministische Handles aus kryptografisch sicheren Zufallsquellen verwenden und Handles
serverseitig an den authentifizierten Nutzer binden, etwa als `<user_id>:<handle>`, wobei die
Nutzer-ID aus dem verifizierten Token stammt und nicht vom Client geliefert wird.

**Kompromittierung lokaler MCP-Server.** Lokale Server laufen mit den Rechten des Clients.
Unterstützt ein Client die Ein-Klick-Konfiguration lokaler Server, MUSS er vor der Ausführung
eine ordentliche Zustimmung einholen: das exakte Kommando ungekürzt anzeigen, die Operation
klar als potenziell gefährlich kennzeichnen, ausdrückliche Freigabe verlangen, Abbruch
ermöglichen. Clients SOLLTEN zusätzlich gefährliche Kommandomuster hervorheben, vor Zugriff
auf sensible Orte warnen, Server sandboxen und Rechte minimal halten.
**Für Serverautoren relevant:** Server, die lokal laufen sollen, SOLLTEN Maßnahmen gegen
unbefugte Nutzung durch andere Prozesse treffen, insbesondere den stdio-Transport nutzen, um
den Zugriff auf den MCP-Client zu beschränken; bei HTTP-Transport ein Autorisierungstoken
verlangen oder Unix Domain Sockets beziehungsweise andere IPC mit eingeschränktem Zugriff
nutzen.

**OAuth-Authorization-URL-Validierung.** Clients MÜSSEN nur `http://` und `https://` erlauben
(`http://` nur für Loopback in der Entwicklung), MÜSSEN `javascript:`, `data:`, `file:`,
`vbscript:` und ähnliche Schemata ablehnen und DÜRFEN NICHT Shell-Kommandos zum Öffnen von
URLs verwenden.

**Mix-Up-Attacken.** Gegenmaßnahme ist die Authorization-Response-Validierung über den
`iss`-Parameter nach RFC 9207. PKCE allein verhindert den Angriff nicht.

**Scope-Minimierung.** Minimaler Anfangs-Scope, inkrementelle Erhöhung über gezielte
`WWW-Authenticate`-`scope`-Challenges, Toleranz gegenüber reduzierten Scopes. Typische Fehler:
alle möglichen Scopes in `scopes_supported` veröffentlichen, Wildcard- oder Sammel-Scopes
(`*`, `all`, `full-access`), den gesamten Scope-Katalog in jeder Challenge zurückgeben.

---

## 11. Konsequenzen für unseren Server

Dieser Abschnitt ist eine Entscheidungsvorlage, keine Spezifikationsaussage. Kontext:
inoffizieller, quelloffener MCP-Server für die BuchhaltungsButler-API, lokal installiert,
TypeScript/Node (abgeleitet aus `.gitignore` mit `dist/`, `*.tsbuildinfo`, `.vitest/`).
Die getroffenen Empfehlungen sind begründet und umsetzbar; offene Entscheidungen sind als
solche markiert.

### 11.1 Setzen wir um

Diese Tabelle beschreibt den Zielzustand gemessen an `2026-07-28`. Sechs ihrer Fachzeilen sind
mit den am 2026-09-12 verfügbaren SDKs gegenstandslos oder nur eingeschränkt anwendbar, weil
diese SDKs `2025-11-25` aushandeln. **Vor der Umsetzung ist 11.1a zu lesen**; dort steht je
Zeile, ob sie anwendbar ist, und die verbindliche Vorrangregel.

| Thema | Entscheidung | Begründung |
| --- | --- | --- |
| Transport | Ausschließlich stdio | Security Best Practices empfehlen stdio für lokale Server ausdrücklich; kein offener Port, keine Origin-Validierung, keine DNS-Rebinding-Fläche |
| Zielprotokollversion | Normativer Zielzustand: `2026-07-28`. Tatsächlich implementiert wird die Revision, die das eingesetzte SDK nachweislich aushandelt, am 2026-09-12 also `2025-11-25`. Verbindliche Vorrangregel in 11.1a | aktuelle Revision, LATEST_PROTOCOL_VERSION im Schema. Gegenlage: beide TypeScript-SDK-Linien melden am 2026-09-12 `LATEST_PROTOCOL_VERSION = 2025-11-25` (`docs/entwicklung/mcp-sdk-typescript.md`, Abschnitte 1 und 2.1, Laufzeittest Q10) |
| `server/discover` | Implementieren | Server MÜSSEN es implementieren |
| Pflicht-`_meta` | Auf jedem Request prüfen: `protocolVersion` und `clientCapabilities`; fehlt eines, `-32602` | normative Pflicht |
| Versionskonflikt | `UnsupportedProtocolVersionError` (`-32022`) mit `data.supported` und `data.requested` | normative Pflicht |
| `resultType` | Auf jedem Result `"complete"` setzen | Pflichtfeld der Revision |
| `serverInfo` | In jedem Result-`_meta` mitschicken | SOLLTE-Regel, kostenlos |
| stdout-Disziplin | Harte Regel: nichts außer JSON-RPC auf stdout | MUSS-Regel; Verstoß bricht die Verbindung |
| Logging | Ausschließlich `stderr`, kein `logging`-Capability | Logging-Feature ist deprecated, `stderr` ist der vorgesehene Weg |
| Tools | Einziges Primitiv in v1 | passt zum model-controlled Zugriff auf eine parametrisierte REST-API |
| `inputSchema` | JSON Schema 2020-12, Wurzel `type: "object"`; parameterlose Tools mit `{"type":"object","additionalProperties":false}` | Spezifikationsempfehlung |
| `outputSchema` + `structuredContent` | Für alle Tools mit strukturiertem Ergebnis; zusätzlich serialisiertes JSON als `TextContent` | Server MÜSSEN dem `outputSchema` entsprechen; der Textblock ist die empfohlene Rückwärtskompatibilität |
| Annotations | Auf **jedem** Tool alle vier Hints explizit setzen | Defaults sind `destructiveHint: true` und `openWorldHint: true`; wer schweigt, erklärt jedes Lese-Tool als potenziell destruktiv |
| Tool-Namen | `snake_case`, fachliches Präfix, maximal 128 Zeichen, nur `[A-Za-z0-9_.-]`, serverweit eindeutig, deterministische Reihenfolge in `tools/list` | Namenskonventionen und Determinismus-Empfehlung |
| Fehlerbehandlung | API-Fehler, Validierungsfehler und fachliche Fehler als `isError: true` im Result; nur unbekanntes Tool, malformed Request und interne Ausnahmen als JSON-RPC-Fehler | explizite Regel der Tools-Seite und Klarstellung aus `2025-11-25` |
| Caching | `ttlMs` und `cacheScope` auf `tools/list` und `server/discover` | MUSS-Regel; unsere Tool-Liste ist statisch |
| Cancellation | `notifications/cancelled` auf stdio behandeln, laufende HTTP-Aufrufe per `AbortController` abbrechen | MUSS-Regel für den Client, sinnvolle Server-Reaktion; verhindert Weiterlaufen von API-Calls |
| Timeouts | Pro ausgehendem BuchhaltungsButler-Request ein hartes Timeout | SOLLTE-Regel, schützt vor hängenden Tools |
| Eingabevalidierung | Serverseitig gegen das eigene `inputSchema` validieren, nicht auf den Client vertrauen | „Servers MUST validate all tool inputs" |
| Umgang mit API-Antworten | Freitext aus Belegen, Buchungstexten und Kontoauszügen als Daten behandeln, nie als Anweisung; strukturierte Ausgabe bevorzugen | indirekte Prompt Injection ist bei Buchhaltungsdaten ein realer Vektor, weil Belegtexte fremdbestimmt sind |
| Geheimnisse | API-Zugangsdaten ausschließlich aus Umgebungsvariablen; niemals in Tool-Beschreibungen, Ergebnissen, Fehlermeldungen oder Logs | stdio-Auth-Regel und Logging-Sicherheitsregel |
| Doku und Beispiele | Nur Platzhalter, nie echte Zugangsdaten | Projektvorgabe |

**Konkretisierung der Annotations für unsere Tool-Klassen:**

| Tool-Klasse | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- |
| Lesen (Listen, Detailabruf, Suche) | `true` | irrelevant, trotzdem `false` setzen | irrelevant, trotzdem `true` setzen | `true` |
| Anlegen (neue Buchung, neuer Beleg) | `false` | `false` (additiv) | `false` | `true` |
| Aktualisieren (bestehender Datensatz) | `false` | `true` | `false` | `true` |
| Löschen oder Stornieren | `false` | `true` | `false` | `true` |

`openWorldHint` ist durchgängig `true`, weil jeder Aufruf eine externe API erreicht.

**Konkretisierung des Cachings:** `tools/list` liefert bei uns für alle Aufrufer dieselbe
Liste, unabhängig von den Zugangsdaten. Damit ist `cacheScope: "public"` korrekt und ein hoher
`ttlMs` vertretbar (Vorschlag: 3600000, also eine Stunde). Sollte die Tool-Liste später je nach
Mandant oder Berechtigung variieren, MUSS `cacheScope` auf `"private"` wechseln.
Einschränkung: Diese Konkretisierung greift erst, wenn das eingesetzte SDK `2026-07-28`
aushandelt. Unter `2025-11-25` existieren `ttlMs` und `cacheScope` nicht (siehe 11.1a).

### 11.1a Was die verfügbaren SDKs davon tatsächlich können

**Quelle dieses Abschnitts:** `docs/entwicklung/mcp-sdk-typescript.md`, Abschnitte 1 (samt
Unterabschnitt „Widerspruch, der nicht aufgelöst werden konnte"), 2.1, 9.1, 9.3, 10.1 und 10.4,
gestützt auf den dort dokumentierten eigenen Laufzeittest Q10. Mess- und Abrufdatum: 2026-09-12.

Die Tabelle in 11.1 beschreibt den normativen Zielzustand nach `2026-07-28`. Dieser Abschnitt
hält dagegen, was mit den am 2026-09-12 veröffentlichten TypeScript-SDKs überhaupt erreichbar
ist, und setzt die Vorrangregel für den Konfliktfall. Ohne ihn bekäme ein
Implementierungs-Agent aus 11.1 MUSS-Vorgaben, die er mit den in
`docs/entwicklung/mcp-sdk-typescript.md` empfohlenen Paketen nicht erfüllen kann.

#### (a) Messlage der SDKs

| Paket | gemeldete `LATEST_PROTOCOL_VERSION` | gemeldete `SUPPORTED_PROTOCOL_VERSIONS` | Fundstelle |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk@1.30.0` (v1) | `2025-11-25` | `["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]` | mcp-sdk-typescript.md 2.1 (Q8) |
| `@modelcontextprotocol/server@2.0.0` (v2) | `2025-11-25` | dieselbe Liste | mcp-sdk-typescript.md 1 und 9.1 (Q10) |

Ergänzend belegt:

- Eine echte stdio-Verbindung mit Client und Server auf 1.30.0 handelte
  `"protocolVersion":"2025-11-25"` aus (mcp-sdk-typescript.md 2.1, Q10).
- Die README des v2-`main`-Branch sagt ausdrücklich, v2 implementiere die Spezifikation
  `2026-07-28`. Im Bundle von `@modelcontextprotocol/core@2.0.0` finden sich dazu passende Typen
  und Kommentare (`server/discover`, `subscriptions/listen`, `ResultMetaObject`,
  SEP-2577-Deprecations, ein Era-Begriff `'legacy' | 'modern'`). Wie `2026-07-28` konkret
  ausgehandelt wird, ließ sich aus dem Bundle nicht klären. Der Punkt ist in
  mcp-sdk-typescript.md ausdrücklich als **nicht verifiziert** markiert und bleibt es hier.
- **Nicht verifiziert** ist ebenso, ob irgendeine veröffentlichte SDK-Version oder irgendeine
  Host-Anwendung am 2026-09-12 `2026-07-28` tatsächlich spricht. Beide Dossiers enthalten dafür
  weder Beleg noch Gegenbeleg (siehe auch 1.5).

Folge: Ein Server, der auf einer dieser beiden SDK-Linien aufsetzt, spricht am 2026-09-12
`2025-11-25`. Das ist nach der Terminologie in 3.6 die **legacy**-Ära, also mit
`initialize`-Handshake.

#### (b) Anwendbarkeit der Pflichten aus 11.1 unter `2025-11-25`

| Pflicht aus 11.1 | Unter `2025-11-25` anwendbar | Anmerkung |
| --- | --- | --- |
| Transport ausschließlich stdio | ja | revisionsunabhängig |
| Zielprotokollversion `2026-07-28` | nein | siehe (c); faktisch ausgehandelt wird `2025-11-25` |
| `server/discover` implementieren | **nein** | Die RPC existiert erst in `2026-07-28` (1.3, Punkt 3; 3.5). Unter `2025-11-25` erfüllt das `initialize`-Result dieselbe Aufgabe: `serverInfo`, `capabilities` und `instructions` werden dort einmalig übertragen, im SDK gefüllt aus dem `McpServer`-Konstruktor (mcp-sdk-typescript.md 9.3). Von Hand ist nichts zu bauen |
| Pflicht-`_meta` je Request prüfen (`protocolVersion`, `clientCapabilities`), sonst `-32602` | **nein** | Die Pflichtfelder aus 3.3 gibt es erst in `2026-07-28`. Unter `2025-11-25` kommen Protokollversion und Client-Capabilities einmal aus dem `initialize`-Handshake, den das SDK abwickelt. Eine eigene Prüfung liefe ins Leere und würde konforme Clients abweisen |
| Versionskonflikt mit `UnsupportedProtocolVersionError` (`-32022`) | **nein** | `-32022` ist erst in `2026-07-28` vergeben; unter `2025-11-25` trug derselbe Fehler den Code `-32004` (1.3, Minor Changes, Umnummerierung). Die Aushandlung liegt im `initialize`-Pfad des SDK. Welchen Code die SDKs dort tatsächlich senden, wurde nicht getestet: **nicht verifiziert** |
| `resultType: "complete"` auf jedem Result | **nein** | Pflichtfeld erst in `2026-07-28` (1.3, Punkt 8). Das in mcp-sdk-typescript.md 9.3 beobachtete `tools/call`-Ergebnis von v2 enthält kein `resultType`, und die `McpServer`-API bietet keinen Weg, es zu setzen |
| `serverInfo` in jedem Result-`_meta` | **nein**, nur einmalig | Die Per-Result-Regel stammt aus 3.3. Unter `2025-11-25` überträgt das `initialize`-Result `serverInfo` einmal; das SDK füllt es aus dem Konstruktor |
| stdout-Disziplin | ja | revisionsunabhängige Transportregel (4.1), in mcp-sdk-typescript.md 8.1 als häufigster Fehler dokumentiert |
| Logging ausschließlich `stderr`, keine `logging`-Capability | ja | Die Deprecation stammt zwar aus `2026-07-28`, aber bereits `2025-11-25` erlaubt `stderr` ausdrücklich für jede Art von Logging (1.3). Die Entscheidung trägt in beiden Revisionen |
| Tools als einziges Primitiv | ja | seit `2024-11-05` |
| `inputSchema` als JSON Schema 2020-12 | ja, aber SDK-abhängig | 2020-12 ist seit `2025-11-25` Default-Dialekt (1.3, SEP-1613). v1 erzeugt laut mcp-sdk-typescript.md 3.5 und 10.1 Draft 07, v2 erzeugt 2020-12. Diese Zeile ist nur auf dem v2-Weg einzuhalten |
| `outputSchema` plus `structuredContent` plus serialisierter Textblock | ja | Structured Tool Output seit `2025-06-18` (1.3) |
| Annotations vollständig und explizit setzen | ja | Tool Annotations seit `2025-03-26` (1.3); die Defaults gelten unverändert |
| Tool-Namen und deterministische Reihenfolge in `tools/list` | ja | Namensguidance seit `2025-11-25` (1.3, SEP-986). Die deterministische Reihenfolge ist erst in `2026-07-28` als SOLLTE formuliert, unter `2025-11-25` aber unschädlich und beizubehalten |
| Fehlerbehandlung über `isError` statt JSON-RPC-Fehler | ja | Die Klarstellung zu Eingabevalidierungsfehlern stammt selbst aus `2025-11-25` (1.3, SEP-1303) |
| `ttlMs` und `cacheScope` auf `tools/list` und `server/discover` | **nein** | `CacheableResult` ist neu in `2026-07-28` (1.3 und 8.10, SEP-2549). Unter `2025-11-25` existieren diese Felder nicht, und die `McpServer`-API bietet keinen Weg, sie zu setzen. Die Caching-Konkretisierung am Ende von 11.1 ist damit Zielzustand, keine Umsetzungspflicht |
| Cancellation behandeln, ausgehende HTTP-Aufrufe abbrechen | ja | `notifications/cancelled` existiert in beiden Revisionen; im SDK über `extra.signal` (v1) beziehungsweise `ctx.mcpReq.signal` (v2), siehe mcp-sdk-typescript.md 7.4 und 9.2 |
| Timeout pro ausgehendem BuchhaltungsButler-Request | ja | Implementierungsseite, revisionsunabhängig |
| Serverseitige Eingabevalidierung | ja | revisionsunabhängig |
| API-Freitext als Daten, nie als Anweisung | ja | revisionsunabhängig |
| Geheimnisse ausschließlich aus Umgebungsvariablen | ja | revisionsunabhängig |
| Doku und Beispiele nur mit Platzhaltern | ja | Projektvorgabe, revisionsunabhängig |

Neben der Zeile „Zielprotokollversion" selbst sind damit sechs Fachzeilen der Tabelle 11.1
unter `2025-11-25` gegenstandslos oder nur eingeschränkt anwendbar: `server/discover`, die
Pflicht-`_meta`-Prüfung, die `-32022`-Antwort auf Versionskonflikte, `resultType`, `serverInfo`
je Result und die Caching-Hinweise `ttlMs`/`cacheScope`. Gegenstandslos ist unter `2025-11-25` außerdem die aus 3.1 folgende
Erwartung, dass es `initialize` nicht mehr gibt: dort ist der Handshake der vorgeschriebene
Weg.

#### (c) Vorrangregel

**Vorrangsatz (verbindlich):** Maßgeblich für die Implementierung ist die Protokollrevision,
die das eingesetzte SDK nachweislich zur Laufzeit aushandelt; am 2026-09-12 ist das
`2025-11-25`. Die auf `2026-07-28` bezogenen Pflichten sind bis zu einem gegenteiligen
Laufzeitnachweis Zielzustand und keine Umsetzungspflicht, und der Protokollrahmen wird nicht
am SDK vorbei nachgebaut.

Daraus folgt im Einzelnen:

1. Die Implementierung zielt auf `2025-11-25` und benutzt dafür ausschließlich die
   `McpServer`-API der gewählten SDK-Linie. Die Protokollrevision ist damit eine Eigenschaft der
   Abhängigkeit, keine eigene Entscheidung im Code.
2. Alle in (b) mit **nein** markierten Zeilen aus 11.1 werden in v1 nicht gebaut. Sie bleiben
   als Zielzustand stehen und werden verbindlich, sobald ein Laufzeittest zeigt, dass das
   eingesetzte SDK `2026-07-28` aushandelt. Eine README-Zusage genügt dafür ausdrücklich nicht,
   weil genau diese Zusage der in (a) benannte, ungeklärte Widerspruch ist.
3. Alle in (b) mit **ja** markierten Zeilen gelten unverändert. Sie sind der belastbare Teil
   von 11.1 und decken die Sicherheits-, Fehler- und Betriebsvorgaben vollständig ab.
4. Der Wechsel auf `2026-07-28` ist ein SDK-Update, keine Handarbeit am Protokoll. Ein eigener
   Protokoll-Stack neben dem SDK wird nicht gebaut, auch nicht teilweise. Begründung: doppelte
   Wartung, zusätzliche Angriffsfläche, und ein halb selbst gebauter Protokollrahmen ist
   schlechter als eine ältere, aber vollständig konforme Revision.
5. Dokumentenvorrang: Für Aussagen über das Protokoll gilt dieses Dossier. Für Aussagen
   darüber, was ein SDK kann und wie der Code auszusehen hat, gilt
   `docs/entwicklung/mcp-sdk-typescript.md`. Widersprechen sich beide, gewinnt für die
   Umsetzung die gemessene SDK-Lage und für die Zielsetzung die Spezifikation.

**Restrisiko, offen benannt:** Nach der Kompatibilitätsmatrix in 3.6 scheitert die Kombination
modern-Client gegen legacy-Server, und legacy-Clients haben keinen Fall-Forward-Mechanismus.
Ein Host, der ausschließlich `2026-07-28` spricht, könnte unseren Server also nicht nutzen. Ob
es solche Hosts am 2026-09-12 gibt, ist **nicht verifiziert** (1.5). Die Gegenmaßnahme ist kein
Eigenbau, sondern das SDK-Update nach Punkt 4; die dual-era-Fähigkeit ist Aufgabe des SDK und im
v2-Bundle mit `ProtocolEra` bereits angelegt.

**Wirkung auf 11.4:** Die offene Entscheidung 1 (Dual-Era) ist für v1 damit beantwortet, ohne
dass die dortige Analyse falsch wird: Unser Server spricht, was das SDK spricht, und das ist am
2026-09-12 ausschließlich die legacy-Ära. Die offene Entscheidung 2 (SDK-Wahl) bleibt offen,
verliert aber das Argument „Zielversion": Beide Linien handeln dieselbe Revision aus. Der
Unterschied liegt im JSON-Schema-Dialekt, in der Node-Untergrenze, in der API-Form und in der
Wartungszusage, nicht in der Protokollversion.

#### (d) Der Widerspruch zum Integrationstest über `initialize`

`docs/entwicklung/mcp-sdk-typescript.md`, Abschnitt 10.4, Punkt 12, verlangt einen
CI-Integrationstest, der den gebauten Server startet und per Client `initialize`, `tools/list`
und mindestens einen `tools/call` ausführt. Abschnitt 3.1 dieses Dossiers stellt fest, dass
`initialize` in `2026-07-28` ersatzlos entfernt ist. Beide Aussagen stehen nebeneinander im
selben Dokumentensatz.

**Auflösung:** Der Widerspruch ist ein Datierungsproblem, kein Fehler. Unter der Vorrangregel
aus (c) zielt die Implementierung auf `2025-11-25`. Dort ist `initialize` der vorgeschriebene
Handshake und genau das, was die SDK-Clients ausführen. Punkt 12 ist deshalb korrekt, wie er
dasteht, bleibt unverändert und testet, was der Server tatsächlich spricht. Ein Test, der
stattdessen `server/discover` gegen unseren Server erwartet, wäre am 2026-09-12 falsch: Die
Methode existiert in `2025-11-25` nicht.

**Bedingung für die spätere Änderung.** Sobald ein Laufzeittest belegt, dass das eingesetzte
SDK `2026-07-28` aushandelt, ist Punkt 12 umzuschreiben:

- `initialize` entfällt und wird durch `server/discover` ersetzt (3.5),
- der Test prüft zusätzlich die Pflichtfelder in `params._meta` (3.3), `resultType` auf jedem
  Result (1.3, Punkt 8) sowie `ttlMs` und `cacheScope` auf `tools/list` und `server/discover`
  (8.10),
- ein Negativtest mit einer nicht unterstützten Protokollversion erwartet `-32022` samt
  `data.supported` und `data.requested` (3.4).

**Hinweis zur Doppelführung:** Der Vorrangsatz aus (c) steht wortgleich zusätzlich in
`docs/entwicklung/mcp-sdk-typescript.md`, Abschnitt 10.1 (geprüft 2026-09-12). Ändert sich der
Satz hier, ist die Gegenstelle mitzuändern.

### 11.2 Setzen wir nicht um

| Thema | Entscheidung | Begründung |
| --- | --- | --- |
| Streamable HTTP | Nein | lokaler Ein-Nutzer-Server; HTTP bringt Origin-Validierung, Header-Spiegelung, Authorization-Framework und offenen Port ohne Gegenwert |
| Authorization-Framework (OAuth 2.1, PRM, CIMD) | Nein | Base-Protocol-Seite: stdio-Implementierungen SOLLTEN dem Framework NICHT folgen, sondern Credentials aus der Umgebung beziehen |
| Sampling | Nein | deprecated seit `2026-07-28`; ein Buchhaltungsserver soll nicht das Modell des Hosts aufrufen |
| Roots | Nein | deprecated; kein Dateisystembezug |
| `logging`-Capability | Nein | deprecated; `stderr` ist der vorgesehene Weg bei stdio |
| Subscriptions (`subscriptions/listen`) | Nein | Tool-Liste ist statisch, keine Resources; `listChanged` wird nicht deklariert |
| Completion | Nein | gilt nur für Prompt-Argumente und Resource-Templates, die wir in v1 nicht anbieten |
| Pagination auf `tools/list` | Nein | die Tool-Liste bleibt weit unter jeder sinnvollen Seitengrenze; API-Pagination der BuchhaltungsButler-Endpunkte wird stattdessen als gewöhnliche Tool-Argumente (`offset`, `limit` oder was die API vorgibt) abgebildet |
| Elicitation und MRTR | Nein in v1 | Credentials kommen aus der Umgebung; fehlende Parameter gehören als Tool Execution Error zurück; `requestState` mit HMAC/AEAD-Integritätsschutz wäre Aufwand ohne Gegenwert |
| Zustandsbehaftete Tool-Handles | Nein | jeder Tool-Aufruf ist ein oder mehrere zustandslose API-Aufrufe; wir vermeiden damit den gesamten Themenblock State Handle Hijacking |
| `x-mcp-header` | Nein | nur für Streamable HTTP relevant; auf stdio dürfen Clients die Annotation ignorieren |
| Tasks-, MCP-Apps- oder Skills-Extension | Nein in v1 | zusätzliche Komplexität, kein erkennbarer Bedarf; **nicht verifiziert**, wie weit die Client-Unterstützung reicht |
| Icons | Nein in v1 | reine Kosmetik; falls doch, dann als `data:`-URI, um Netzwerkabrufe und Tracking zu vermeiden |

### 11.3 Empfehlungen mit Vorbehalt

Empfehlungen im Sinne der Überschrift sind nur die drei ersten Punkte: Progress, Prompts und
Resources. Die beiden folgenden Themen, Nur-Lesen-Schalter und Bestätigung vor
Schreiboperationen, sind vom Projektinhaber entschieden. Sie stehen hier nur noch zur
Einordnung und sind weder Empfehlung noch offene Frage.

**Progress.** Empfehlung: umsetzen, aber nur für Tools, die mehrere API-Seiten aggregieren oder
Dateien übertragen. Kosten gering, Nutzen real. Für einfache Einzelabrufe unterlassen, weil
`progress` streng monoton steigen MUSS und die Buchhaltung dafür keine sinnvolle Metrik
liefert.

**Prompts.** Empfehlung: nicht in v1, aber vormerken. Sinnvolle Kandidaten wären
wiederkehrende, mehrschrittige Abläufe wie eine Monatsabschluss-Prüfung oder ein
Belegabgleich. Ein Prompt, der nur ein einzelnes Tool umhüllt, hat keinen Wert.

**Resources.** Empfehlung: nicht in v1. Buchhaltungsdaten sind hochgradig parametrisiert
(Zeitraum, Konto, Mandant, Status) und passen schlecht auf stabile, benennbare URIs. Ein
sinnvoller späterer Einsatz wäre der Abruf einzelner Belegdokumente als
`resource_link`-Blöcke aus einem Such-Tool heraus; dann wäre die `resources`-Capability zu
deklarieren und `resources/read` mit `cacheScope: "private"` zu liefern.

**Nur-Lesen-Schalter, kein Nur-Lesen-Default.** Entschieden: Es gibt **keinen**
Nur-Lesen-Standardmodus. Nach der Installation sind alle Werkzeuge sofort aufrufbar.
Zusätzlich gibt es einen **optionalen, standardmäßig abgeschalteten** Schalter über eine
Umgebungsvariable, mit dem ein vorsichtiger Betreiber den Server auf die 15 lesenden Endpunkte
beschränken kann; die Einteilung der 54 Endpunkte in 15 lesende, 24 anlegende, 8 ändernde und
7 löschende steht in `docs/api/grundlagen.md`, Abschnitt 7.3. Der Schalter ist eine
Zusatzfunktion, kein Default. Maßgebliche Festlegung dazu:
`docs/entwicklung/tool-design.md`, Abschnitt 9.5.

Protokollseitig ist das unbedenklich: Der Schalter wird nur beim Start gelesen. Die Tool-Liste
ändert sich dadurch pro Prozessstart, nicht pro Verbindung, und erfüllt damit die Regel aus
5.1, dass die Menge der Tools nicht pro Verbindung variieren darf. `cacheScope: "public"` aus
der Caching-Konkretisierung in 11.1 bleibt korrekt, weil die Liste innerhalb eines
Serverprozesses für alle Aufrufer identisch ist.

**Bestätigung vor Schreiboperationen.** Entschieden: Es gibt **kein** serverseitig erzwungenes
Bestätigungsmuster und **keinen** `confirm`-Parameter. Die Bestätigung liegt beim Host, dem die
Spezifikation sie ohnehin zuweist (5.1: Human-in-the-Loop, Aufrufe visuell markieren,
Bestätigungsdialoge zeigen; 5.12: Nutzerbestätigung bei sensiblen Operationen und Anzeige der
Tool-Eingaben vor dem Aufruf; 10.1: ausdrückliche Zustimmung vor jedem Tool-Aufruf). Der Server
liefert dafür die Grundlage, indem er auf jedem Werkzeug alle vier Annotationen explizit setzt
(11.1) und in jeder Beschreibung unmissverständlich benennt, was das Werkzeug verändert.
Maßgebliche Festlegung dazu: `docs/entwicklung/tool-design.md`, Abschnitt 9.4. Eine servereigene
Bestätigungsschleife über Elicitation bliebe die spezifikationskonforme Alternative (8.2), wird
aber nicht gebaut.

**Restrisiko dieser Entscheidung, offen benannt:** Die Spezifikation kann die Host-Bestätigung
nicht auf Protokollebene erzwingen und stellt das selbst fest (10.1). Annotationen sind
ausdrücklich Hinweise ohne Verhaltensgarantie, und Clients MÜSSEN sie von nicht
vertrauenswürdigen Servern als nicht vertrauenswürdig behandeln (5.4). Ein Host, der mit
pauschal erteilter Freigabe läuft oder Annotationen ignoriert, ruft damit auch löschende und
stornierende Werkzeuge ohne Rückfrage auf. Verschärfend kommt hinzu, dass die
BuchhaltungsButler-API keinen Idempotenzschlüssel kennt (`docs/api/grundlagen.md`, Abschnitt
7.1): Ein versehentlicher Doppelaufruf eines anlegenden Werkzeugs erzeugt eine Dublette, und ein
blinder Retry nach einem Timeout ist deshalb unzulässig. Diese Lücke bleibt bestehen und wird
bewusst in Kauf genommen. Gegenmittel sind die Werkzeugberechtigungen des Hosts, die
Annotationen und Beschreibungen als Entscheidungsgrundlage sowie, wo der Betreiber ihn will,
der optionale Nur-Lesen-Schalter oben.

**Prüfvermerk 2026-09-12:** `docs/entwicklung/tool-design.md` trägt an den beiden genannten
Stellen derzeit noch den überholten Stand: Abschnitt 9.4 schreibt ein serverseitig erzwungenes
`confirm`-Muster vor, Abschnitt 9.5 führt `read_only` als Default. Beide Stellen sind gegen die
hier wiedergegebene Entscheidung anzugleichen. Bis das geschehen ist, gilt die Entscheidung und
nicht der dortige Wortlaut.

### 11.4 Offene Entscheidungen

1. **Dual-Era-Unterstützung.** Unterstützen wir zusätzlich zu `2026-07-28` eine
   Legacy-Revision (`2025-11-25` mit `initialize`)? Dafür spricht, dass Host-Anwendungen
   unterschiedlich schnell nachziehen; ein Server, der nur modern spricht, ist für
   Legacy-Clients unbenutzbar und diese haben keinen Fall-Forward-Mechanismus. Dagegen spricht
   erheblicher Mehraufwand: zwei Nachrichtenwege, zwei Capability-Modelle,
   server-initiierte Requests gegen MRTR. **Der Stand der Client-Landschaft am 2026-09-12 ist
   nicht verifiziert.** Dies ist vor der Implementierung zu klären. Falls dual-era: Ein
   `initialize`-Request wählt Legacy-Semantik, ein Request mit modernem `_meta` wählt die
   zustandslose Semantik. Falls nur modern: Der Server SOLLTE die unterstützten Versionen im
   Fehler auf `initialize` nennen.
   **Für v1 beantwortet durch 11.1a:** Der Server spricht die Revision, die das SDK aushandelt,
   am 2026-09-12 also ausschließlich `2025-11-25` und damit die legacy-Ära. Die Frage wird erst
   wieder offen, wenn eine SDK-Linie nachweislich `2026-07-28` aushandelt.
2. **SDK-Wahl.** `@modelcontextprotocol/server@2.0.0` (v2, implementiert `2026-07-28`) oder
   `@modelcontextprotocol/sdk@1.30.0` (v1, Bugfixes für mindestens sechs Monate ab
   v2-Release). Bei Entscheidung für `2026-07-28` als Zielversion ist v2 der logische Weg;
   **nicht verifiziert** ist die Reife der v2-API kurz nach Release.
   **Präzisierung durch 11.1a:** Das Argument „Zielversion" trägt nicht, weil beide Linien am
   2026-09-12 `2025-11-25` aushandeln. Die verbleibenden Unterschiede sind JSON-Schema-Dialekt
   (v1 Draft 07, v2 2020-12), Node-Untergrenze, API-Form und Wartungszusage.
3. **Umfang von v1.** Nur Tools, oder zusätzlich Prompts und Resources? Vorschlag oben: nur
   Tools.
4. **Read-only als Default?** **Entschieden, nicht mehr offen: nein.** Standard ist der volle
   Werkzeugumfang, sofort nach der Installation aufrufbar. Die Beschränkung auf die 15 lesenden
   Endpunkte gibt es nur als optionalen, standardmäßig abgeschalteten Schalter über eine
   Umgebungsvariable; Einzelheiten in 11.3, maßgebliche Festlegung in
   `docs/entwicklung/tool-design.md`, Abschnitt 9.5. Beides, Standardverhalten und Schalter,
   gehört prominent in die README. Ebenfalls entschieden und damit hier nicht mehr offen: Es
   gibt kein serverseitig erzwungenes Bestätigungsmuster und keinen `confirm`-Parameter
   (11.3, `docs/entwicklung/tool-design.md` Abschnitt 9.4).
5. **Granularität der Tools.** Ein Tool pro API-Endpunkt gegen wenige generische Tools mit
   Operationsparameter. Nicht Gegenstand dieses Dossiers, aber eine Designentscheidung, die die
   Tool-Namen, `inputSchema` und Annotations unmittelbar bestimmt.
6. **Umgang mit Mandanten.** Falls die BuchhaltungsButler-Zugangsdaten mehrere Mandanten
   umfassen: Wird der Mandant per Umgebungsvariable fixiert oder als Tool-Argument übergeben?
   Zweiteres macht `cacheScope` für `tools/list` weiterhin `"public"`, erfordert aber
   sorgfältige Validierung.

---

## 12. Quellenverzeichnis

Alle Quellen abgerufen am **2026-09-12**.

**Spezifikation, Revision 2026-07-28**

- Übersicht: https://modelcontextprotocol.io/specification
- Changelog: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Architektur: https://modelcontextprotocol.io/specification/2026-07-28/architecture
- Base Protocol: https://modelcontextprotocol.io/specification/2026-07-28/basic
- Versioning: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
- Discovery: https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- Transport stdio: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
- Transport Streamable HTTP: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- Multi Round-Trip Requests: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr
- Subscriptions: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions
- Progress: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress
- Cancellation: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation
- Tools: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- Resources: https://modelcontextprotocol.io/specification/2026-07-28/server/resources
- Prompts: https://modelcontextprotocol.io/specification/2026-07-28/server/prompts
- Pagination: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/pagination
- Caching: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching
- Completion: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/completion
- Logging: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging
- Elicitation: https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation
- Security Best Practices: https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices
- Deprecated Features: https://modelcontextprotocol.io/specification/2026-07-28/deprecated

**Schema**

- `schema/2026-07-28/schema.ts`, abgerufen über
  https://raw.githubusercontent.com/modelcontextprotocol/specification/main/schema/2026-07-28/schema.ts
  sowie byteidentisch über
  https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.ts
  (98426 Bytes, HTTP 200 bei beiden)

**Ältere Revisionen**

- https://modelcontextprotocol.io/specification/2025-11-25/changelog
- https://modelcontextprotocol.io/specification/2025-06-18/changelog
- https://modelcontextprotocol.io/specification/2025-03-26/changelog

**Blog**

- https://blog.modelcontextprotocol.io/posts/2026-07-28/

**SDK-Stand (eigene Abfrage)**

- npm-Registry: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`,
  `@modelcontextprotocol/client`, `@modelcontextprotocol/node`, `@modelcontextprotocol/hono`,
  `@modelcontextprotocol/server-legacy`
- GitHub-Releases: https://github.com/modelcontextprotocol/typescript-sdk
