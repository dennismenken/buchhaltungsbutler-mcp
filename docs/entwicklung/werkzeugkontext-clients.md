# Wie MCP-Clients Werkzeugdefinitionen in den Kontext laden

**Stand: 2026-09-13.** Zusammengetragen aus fünf unabhängigen Recherchen (Claude Desktop,
Claude Code, OpenAI-Familie, übrige README-Clients, Protokoll- und SDK-Ebene).

Jede Aussage in diesem Dossier trägt eine von drei Belegstufen. Sie sind unverändert aus den
Recherchen übernommen und wurden nirgends hochgestuft.

| Stufe | Bedeutung |
| --- | --- |
| **GEMESSEN** | Ein Rechercheur hat es selbst ausgeführt und die Ausgabe gesehen. |
| **BELEGT** | Es steht in einer offiziellen Quelle, die abgerufen wurde, mit URL und Datum. |
| **VERMUTUNG** | Alles andere, einschließlich Vorwissen und unbestätigter Nutzerberichte. |

---

## 1. Die Frage und warum sie für dieses Projekt zählt

Der Server bietet 54 Werkzeuge an; die Definitionen wiegen zusammen 48.305 Token, die
Server-`instructions` weitere 1.259 Token, gemessen am 2026-09-13 mit `gpt-tokenizer@4.0.0` in
der Kodierung `o200k_base` (siehe `docs/entwicklung/befund-tokenbudget.md`). Zusammen sind das
49.564 Token, die ein Client beim Verbinden vorgelegt bekommt. Die entscheidende Frage ist
nicht, ob das Protokoll diese Menge überträgt (das tut es immer), sondern ob der Client sie in
jede einzelne Modellanfrage legt oder erst dann, wenn ein Werkzeug gebraucht wird. Die Antwort
entscheidet, ob dieser Server rund ein Viertel eines 200k-Kontextfensters verbraucht, bevor der
Nutzer das erste Wort schreibt, oder rund zwei Prozent. Sie fällt je Client anders aus, und sie
hat sich bei den wichtigsten Clients innerhalb der letzten zwölf Monate gedreht.

---

## 2. Übersicht

„Ladeverhalten“ meint ausschließlich, was in den **Modellkontext** gelangt, nicht was über die
Leitung geht. Die Unterscheidung ist wesentlich und wird in Abschnitt 4.3 erklärt.

| Client | Version | Ladeverhalten | Belegstufe | Obergrenze Werkzeuge | Werkzeuge abschaltbar | Werkzeugsuche |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Desktop, Chat | 1.52386.3 (macOS) | gemischt (Modus `Auto` ist Default und undokumentiert) | BELEGT | keine dokumentiert; harte Wand bei Kontextüberlauf | ja, ganze Connectors je Konversation; Einzelwerkzeuge nur Team/Enterprise | ja als Modus `On demand`, Wirksamkeit im Chat bestritten (VERMUTUNG) |
| Claude Desktop, eingebettete Code-/Cowork-Sessions | 1.52386.3 | bei Bedarf | BELEGT | keine | ja, servergranular über `managed-mcp.json` | ja, `tool-search-tool-2025-10-19`, per Default an |
| Claude Code (CLI) | 2.1.270 | bei Bedarf, bedingungslos | GEMESSEN | keine (API-seitig 10.000 deferred tools); 20 Seiten bei Paginierung | ja, ganze Server im `/mcp`-Panel; Einzelwerkzeuge nur über `--disallowedTools`/managed settings | ja, `ToolSearch`, per Default an |
| Codex CLI | 0.153.4 | bei Bedarf | GEMESSEN | keine dokumentiert | ja, `enabled`, `enabled_tools`, `disabled_tools` je Server | ja, serverseitig gehostet, kein sichtbares Werkzeug |
| ChatGPT Desktop App (Codex-Host) | Build 26.903.71938 | bei Bedarf | BELEGT | keine dokumentiert | wie Codex CLI, gemeinsame `config.toml` | wie Codex CLI |
| ChatGPT Web (Connectors/Plugins) | Doku-Stand 2026-09-13 | nicht ermittelbar | BELEGT | nicht ermittelt; kursierende 5.000 Token unbestätigt (VERMUTUNG) | ja, Verbindung je Unterhaltung; Einzelwerkzeuge nur Drittberichte | nicht dokumentiert |
| Cursor | Blog-Stand 2026-01-06, CLI 3.11.19 | bei Bedarf | BELEGT | 40 (Staff, 2025-06-24); aktueller Stand unklar, siehe 3.7 | ja, ganze Server; Einzelwerkzeuge laut älterer Staff-Aussage | ja, funktional über Dateisynchronisation (Dynamic Context Discovery) |
| VS Code mit GitHub Copilot | VS Code 1.137.0, copilot-chat 0.65.0 | gemischt, hängt an der Modellfähigkeit | GEMESSEN | 128 pro Anfrage, hart und sichtbar; entfällt bei `supportsToolSearch` | ja, einzelne Werkzeuge und Gruppen, wirkt auf den Kontext | ja, clientseitiges `tool_search` plus Virtual Tools ab Schwelle 128 |
| Windsurf (Cascade) | unbekannt, Doku-Stand 2026-09-13 | sofort alle | **VERMUTUNG** | 100 insgesamt (BELEGT) | ja, einzelne Werkzeuge je MCP | keine gefunden |
| Cline | main, 2026-09-12 | sofort alle | BELEGT | keine | **nur ganze Server** | keine |
| LM Studio | MCP-Host ab 0.3.17 | sofort alle | BELEGT | keine dokumentiert; faktisch das lokale Kontextfenster | ja, `allowed_tools` je Server, mit belegter Kontextwirkung | keine gefunden |
| Zed | main, 2026-09-13 | sofort alle | BELEGT | keine | ja, je Werkzeug über Agent-Profile | keine |
| Continue | main, 2026-09-13 | sofort alle | BELEGT | keine | ja, je Werkzeug und je Gruppe (Gruppe = Servername) | keine |
| Jan | main, 2026-09-11 | gemischt, praktisch sofort alle | BELEGT | keine für Werkzeuge; 5 geroutete Server | ja, `disabledToolKeys` | nur Serverauswahl je Turn, erst ab 6 Servern aktiv |
| MCP-Spezifikation 2026-07-28 | veröffentlichte Revision | nicht ermittelbar (regelt es nicht) | BELEGT | keine; Namen 1 bis 128 Zeichen | kennt das Protokoll nicht | im Protokoll nicht vorhanden |
| MCP-Spezifikation, Entwurf | draft, 2026-09-13 | nicht ermittelbar | BELEGT | keine | unverändert | nicht vorhanden; `progressive discovery` auf der Roadmap |
| `@modelcontextprotocol/server` | 2.0.0 (in diesem Projekt) | sofort alle | GEMESSEN | keine | `enabled` je Werkzeug, filtert `tools/list` | keine |
| `@modelcontextprotocol/client` | 2.0.0 | sofort alle | GEMESSEN | 64 Seiten im Aggregationspfad | Sache der Anwendung | keine |
| Claude Messages API (`tool_search_tool`, MCP-Connector) | `*_20251119`, `mcp-client-2025-11-20` | gemischt, Default `defer_loading: false` | BELEGT | 10.000 deferred tools je Anfrage | ja, `mcp_toolset` mit `enabled` und `defer_loading` | ja, Regex- und BM25-Variante |

**Wie die Tabelle zu lesen ist.** Nur zwei Zeilen sind GEMESSEN im Sinn einer eigenen
Ausführung mit sichtbarer Ausgabe: Claude Code und Codex CLI, dazu die Codeanalyse von VS Code.
Alles Übrige ruht auf Dokumentation oder auf gelesenem Quelltext. Genau eine Zeile ist reine
VERMUTUNG, und ausgerechnet die ist für uns unangenehm: Windsurf.

---

## 3. Die Clients im Einzelnen

### 3.1 Claude Desktop, Chat-Oberfläche

**Ladeverhalten: gemischt. Belegstufe BELEGT.**

Der Befund zerfällt in drei Teile, und sie widersprechen sich teilweise.

GEMESSEN aus `~/Library/Logs/Claude/mcp.log` (41 `tools/list`-Aufrufe, 2026-09-05 bis
2026-09-11, vier lokale stdio-Server): Claude Desktop ruft `tools/list` genau **einmal pro
Server pro App-Start** auf, immer mit `id=1` unmittelbar nach `initialize`. Kein Aufruf je Chat,
je Nachricht oder je Konversation.

Das ist aber **nicht** die Antwort auf unsere Frage, und es wäre ein Fehler, es dafür zu halten.
Die offizielle MCP-Client-Doku sagt ausdrücklich: „Cache tool definitions. Once fetched from a
server, memoize the definition host-side [...] This is separate from what's currently in the
model's context.“ Die Aufruffrequenz misst das Protokoll, nicht den Modellkontext. Der Kontext
wird bei Claude Desktop serverseitig bei claude.ai zusammengesetzt und ist lokal nicht
beobachtbar.

BELEGT sind dagegen drei Modi, ausdrücklich auch für Claude Desktop:

- `Always available`: „All your connectors are loaded at the start of every conversation.“
- `Auto` (Default): „Claude decides dynamically which connectors to load based on what you're
  working on.“
- `On demand`: „Connectors aren't loaded until Claude searches for the right one based on your
  request.“

Die Einstellung gilt je Konversation: „Your selection only applies to that conversation.“

BELEGT ist ferner, dass Werkzeuge das Kontextfenster überhaupt belasten: „Tools and connectors
are token-intensive, so managing them helps both maximize your available context window and
optimize your usage limits.“ Und auf der darunterliegenden API-Ebene zählt der `tools`-Parameter
bei jeder Anfrage als Input-Token.

**Die offene Stelle ist der Auslieferungszustand.** Was `Auto` konkret tut, dokumentiert
Anthropic nicht: weder die Entscheidungsregel noch einen Schwellwert noch die Granularität
(ganzer Connector oder einzelnes Werkzeug). Im Modus `Always available` sind es garantiert alle,
bei jeder Anfrage.

**VERMUTUNG, zwei unabhängige Nutzerberichte:** `anthropics/claude-ai-mcp#401` (offen seit
2026-06-04, Autor-Assoziation NONE, keine Anthropic-Antwort) und `anthropics/claude-code#25892`
(2026-02-15, als `invalid` geschlossen, weil im falschen Repo, ~110 Tools in Desktop) behaupten
übereinstimmend, `On demand` deferre im Chat faktisch nicht; die vollen JSON-Definitionen würden
unabhängig vom Schalter geladen. #25892 ergänzt, der `tool_search`-Mechanismus erscheine
**zusätzlich** zu den vollen Definitionen statt an ihrer Stelle, und die Einstellung setze sich
vor der ersten Nachricht eines neuen Chats stillschweigend auf `Auto` zurück. Beides ist
unbestätigt und wurde von keinem Rechercheur nachgemessen.

**Obergrenze.** Keine dokumentierte Obergrenze für die Werkzeugzahl; GEMESSEN enthält das
App-Bundle keine passende Konstante (`maxTools`, `MAX_TOOLS`, `toolLimit`, `tooManyTools`,
`toolsTruncated`: je 0 Treffer). Was beim Überschreiten passiert, ist dagegen hart und BELEGT:
„This conversation is too long to continue. Start a new chat, or remove some tools to free up
space.“ In Desktop gibt es kein `/compact`; die Konversation ist verloren
(`anthropics/claude-code#48964`). Der Satzteil „remove some tools to free up space“ stammt von
Anthropic selbst und belegt, dass Werkzeuge und Gespräch aus demselben Budget leben.

Eine echte harte Grenze existiert bei der **Länge des Werkzeugnamens**: 64 Zeichen im API-Muster
der Messages API. `anthropics/claude-code#19770` dokumentiert Marketplace-Tools mit 65 bis 72
Zeichen, die dadurch ausfallen. Bei 54 Werkzeugen mit Serverpräfix lohnt die Prüfung der
längsten Namen.

**Schaltbarkeit.** Ganze Connectors je Konversation über das Plus-Menü. BELEGT mit
Kontextwirkung: „Temporarily disable non-critical tools and connectors [...] when they're not
needed for specific conversations“, und das steht im Artikel über Längen- und Nutzungsgrenzen.
Einzelne Werkzeuge einzuschränken ist als „Restrict actions within connected services“
dokumentiert, aber als Team-/Enterprise-Administrationsfunktion; ob das die Definition aus dem
Kontext nimmt oder nur den Aufruf blockiert, ist **nicht belegt**.

**Paginierung: nein.** GEMESSEN: In allen 41 `tools/list`-Aufrufen kommt kein `cursor` vor.
BELEGT durch Codeanalyse des Bundles: Alle 15 Aufrufstellen von `listTools` rufen entweder
`listTools()` ohne Argument oder `listTools(void 0, options)`; der Cursor-Parameter ist
ausnahmslos leer, und es existiert keine Schleife über `nextCursor`. Das Antwortschema kennt
`nextCursor`, `ttlMs` und `cacheScope` durchaus, der Client folgt dem Cursor aber nicht.
**Konsequenz: Paginierung macht bei Claude Desktop Werkzeuge unsichtbar, sie spart nichts.**

**`notifications/tools/list_changed`:** BELEGT durch Codeanalyse. Handler nur, wenn der Server
`tools.listChanged` annonciert (`this._serverCapabilities?.tools?.listChanged`), dann
`autoRefresh` mit Default `true`, Debounce 300 ms, Neuholung mit
`listTools(void 0, {cacheMode:'refresh'})`. GEMESSEN: In den Logs kein einziges `list_changed`.

**Herstellerempfehlung.** BELEGT: unter 10 Connectors `Always available`; 10 bis 30 Tools bei
gemischter Nutzung `Auto`; ab 30+ Tools `On demand` oder `Auto`. Ferner: „If you have 10 or more
connectors active, consider switching to On demand to give your conversations more room.“ Das
sind Empfehlungen an den Nutzer, nicht an den Serverentwickler. Eine Aussage der Form „ein
Server sollte höchstens N Werkzeuge anbieten“ wurde **nicht gefunden**.

Quellen: `support.claude.com/en/articles/13730515`, `.../11647753`, `.../11176164`,
`platform.claude.com/docs/en/agents-and-tools/tool-use/overview`,
`modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices`, GitHub-Issues
`claude-ai-mcp#401`, `claude-code#25892`, `#48964`, `#19770`, lokale Log- und Bundle-Analyse
(nur lesend).

---

### 3.2 Claude Desktop, eingebettete Claude-Code- und Cowork-Sessions

**Ladeverhalten: bei Bedarf. Belegstufe BELEGT.**

Getrennt geführt, weil es für die Produktentscheidung zählt: Ein per `.mcpb` installierter
Server taucht in Claude Desktop nicht nur im Chat auf, sondern auch in den eingebetteten
Claude-Code- und Cowork-Sessions, und dort gilt ein anderes Ladeverhalten.

BELEGT durch Codeanalyse des App-Bundles. Es enthält eine Einstellung `toolSearchEnabled` mit
dem Kurztext „Load MCP tool schemas on demand (tool search) instead of inlining every schema
into context.“ Der Langtext nennt alle drei Oberflächen: „When enabled, Cowork, Code, and Chat
sessions place only tool names in context up front, and Claude fetches a tool's full schema the
first time it needs it. Use this when many MCP tools are configured and their inlined schemas
crowd out the context window.“

Entscheidend für den Normalfall: „Claude API, Vertex AI, Bedrock, or Bedrock Mantle with no
custom base URL: not needed. The app leaves Claude Code's experimental betas on there, as
terminal Claude Code does, so tool search is on by default.“ Die Einstellung selbst ist auf
Drittanbieter-Deployments (Gateway, Foundry, eigene Base-URL) beschränkt und steht dort auf
`false`.

Der Beta-Bezeichner ist im Bundle genannt: `tool-search-tool-2025-10-19`, zusammen mit „deferred
tool loading“ und „tool_reference content blocks“.

**Warnung zum Steuerhebel:** Er ist die Umgebungsvariable `ENABLE_TOOL_SEARCH` in den OS-weiten
Claude-Code-Managed-Settings, **nicht** der `env`-Block von `claude_desktop_config.json`. Ein
Melder formuliert es richtig: „The claude_desktop_config.json env block passes variables to MCP
server processes, not to the client's tool-loading logic.“ Wer unseren Server dort mit
Umgebungsvariablen zähmen will, erreicht nichts.

**VERMUTUNG:** Dass der Kurztext „Chat“ mitnennt, könnte bedeuten, dass die Werkzeugsuche auch
die Desktop-Chat-Oberfläche erfasst, zumindest in Drittanbieter-Deployments. Ob das für normale
Consumer-Konten gilt, geht aus dem Text nicht hervor, und die Nutzerberichte aus 3.1 sprechen
dagegen. **Ungeklärt.**

**Obergrenze.** Keine Anzahlgrenze im Bundle. Drittquellen berichten von einer Anteilsschwelle
(10 Prozent des Kontextfensters ab Version 2.1.7) — das ist VERMUTUNG und wurde in keiner
offiziellen Quelle bestätigt. GEMESSEN: `MAX_MCP_OUTPUT_TOKENS` existiert, begrenzt aber die
Ausgabe eines Werkzeugaufrufs.

**Schaltbarkeit.** Servergranular über eine `managed-mcp.json` in den
Claude-Code-Managed-Settings. Bemerkenswert und für uns relevant: Es gibt derzeit **keine**
saubere Möglichkeit, einen Server nur dem Chat und nicht den Code-Sessions anzubieten.

---

### 3.3 Claude Code (CLI), Version 2.1.270

**Ladeverhalten: bei Bedarf, bedingungslos. Belegstufe GEMESSEN.**

Das ist der am besten belegte Befund des ganzen Dossiers, und er fällt stärker aus als erwartet:
Die Deferral greift **ohne Schwelle**.

GEMESSEN, erste Hand in einer laufenden Sitzung: Der Systemkontext enthält wörtlich „The
following deferred tools are now available via ToolSearch. Their schemas are NOT loaded -
calling them directly will fail with InputValidationError.“, gefolgt von rund 700 MCP-
Werkzeugnamen. `ToolSearch` mit `query "select:WebSearch,WebFetch"` lieferte die vollen
JSONSchema-Definitionen zurück; erst danach waren die Werkzeuge aufrufbar.

GEMESSEN im ausgelieferten Binary (Bun-kompiliertes Mach-O, 207.500.480 Byte, eingebetteter
JS-Quelltext per Offset-Extraktion). Die Entscheidungsfunktion lautet wörtlich:

```
function SY(e){if(e.alwaysLoad===!0)return!1;if(Tt(e))return!1;if(e.isMcp===!0)return!Xye();return e.shouldDefer===!0}
function Xye(){return!1}
```

Daraus folgt zwingend: Für jedes Werkzeug mit `isMcp===true` liefert `SY` den Wert `true`, also
„deferrable“. Keine Zählung, keine Tokenmessung, keine Schwelle. Ein MCP-Server mit einem
einzigen Werkzeug wird behandelt wie einer mit 54 oder 700.

GEMESSEN die Moduswahl:

```
function GWe(){if(est())return"standard";if(u())return"tst";let e=process.env.ENABLE_TOOL_SEARCH,r=e?zMn(e):null;if(r===0)return"tst";if(r===100)return"standard";if(m(e))return"tst-auto";if(Ie(e))return"tst";if(fo(e))return"standard";return"tst"}
```

Der letzte `return` ist der Default bei nicht gesetzter Variable: `tst`, also Tool Search aktiv,
und in der Auswertung `case"tst":return v(!0,P,"tst_enabled"),!0` ohne weitere Prüfung. Nur der
Zweig `tst-auto` ruft überhaupt eine Schwellwertrechnung auf.

GEMESSEN am eigenen Server: Ein direkter JSON-RPC-Handshake gegen `dist/cli.js` (`initialize`,
`notifications/initialized`, `tools/list`) lieferte exakt 54 Werkzeuge, keinen `nextCursor`,
`capabilities {tools:{listChanged:false},resources:{listChanged:false}}` und `instructions` mit
5.336 Zeichen.

BELEGT: „Tool search is on by default.“ und „When it is active, tool definitions are withheld
from the context window.“

**Die wichtige Präzisierung**, BELEGT aus der API-Doku: „defer_loading controls what enters the
context window, not what you send in the request: You still send every tool's full definition in
the tools array on every request, including the deferred ones.“ Und: „Internally, the API
excludes deferred tools from the system-prompt prefix.“ Die 48.305 Token gehen also weiterhin
bei jeder Anfrage über die Leitung, landen aber nicht im Modellkontext und zählen nicht als
Input-Token.

Was trotz Deferral dauerhaft im Kontext liegt, GEMESSEN: die Werkzeugnamen (als
`deferred_tools_delta`-Attachment) und die Server-`instructions` (eigener Abschnitt
`# MCP Server Instructions`).

**Obergrenze.** Keine Werkzeuganzahlgrenze im Binary oder in der Doku. API-seitig BELEGT:
„Maximum deferred tools: 10,000 tools with defer_loading: true per request“. GEMESSEN die
einzige harte Grenze, und sie betrifft nur paginierende Server: `var ar=20` mit
`if(S=U.nextCursor,S&&P>=ar){L=!0;break}` und der Debug-Zeile „tools/list still returning
nextCursor after 20 pages; stopping“. Ein Server jenseits von 20 Seiten wird stillschweigend
abgeschnitten.

**Schaltbarkeit.** Ganze Server über `/mcp` (`disabledMcpServers` in `~/.claude.json`); da keine
Verbindung aufgebaut wird, verschwinden Namensliste und `instructions`, also die verbleibenden
rund 2.000 Token. Einzelne Werkzeuge nur über `--disallowedTools` oder managed settings; da die
Schemata ohnehin nicht geladen sind, spart das nur den Namen, GEMESSEN rund 11 Token.

**Deferral gezielt aufheben:** `SY()` prüft zuerst `e.alwaysLoad===!0`. Gesetzt wird das je
Server in der Konfiguration (`alwaysLoad`) oder je Werkzeug über `_meta`. Die Metadatenschlüssel
sind im Binary hinterlegt:
`jZ={searchHint:"anthropic/searchHint",alwaysLoad:"anthropic/alwaysLoad",maxResultSizeChars:"anthropic/maxResultSizeChars",requiresUserInteraction:"anthropic/requiresUserInteraction"}`.

**Der wichtigste Stolperstein**, BELEGT und GEMESSEN: Ein nicht erstanbieterlicher
`ANTHROPIC_BASE_URL` deaktiviert Tool Search automatisch, mit der Debug-Meldung
„[ToolSearch:optimistic] disabled: ANTHROPIC_BASE_URL=... is not a first-party Anthropic host.“
Wer über einen Proxy oder ein Gateway fährt, bekommt unbemerkt wieder die vollen Definitionen in
den Kontext. Dasselbe gilt bei `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` und bei
Foundry-Deployments auf Azure.

**Paginierung: ja, automatisch und vollständig bis 20 Seiten.** GEMESSEN die Schleife folgt
`nextCursor` selbsttätig und fügt die Seiten zu einer Liste zusammen; fehlerhafte Seiten werden
mit Backoff `[250,500,1000]` bis zu dreimal wiederholt.

**Werkzeugsuche: `ToolSearch`.** GEMESSEN das Eingabeschema (`query`, `max_results` Default 5).
Die Suchlogik ist clientseitig und dreistufig: exakter Namenstreffer, dann Präfixtreffer für
Anfragen, die mit `mcp__` beginnen und länger als fünf Zeichen sind, sonst gewichtete
Stichwortsuche. Gewichtung: Namensteil bei MCP-Werkzeugen 12 Punkte, Teiltreffer 6,
`searchHint` 4, Beschreibung 2. **Praktisch relevant für uns:** Der `mcp__`-Zweig fängt alle
Werkzeuge eines Servers auf einmal ab, begrenzt durch `max_results`. Unser durchgängiges
`bb_`-Präfix passt genau zur Herstellerempfehlung.

**`notifications/tools/list_changed`:** BELEGT unterstützt. GEMESSEN im Binary
`_pendingListChangedConfig` und der Attachment-Typ `deferred_tools_delta` mit `addedNames`,
`removedNames`, `wireHiddenNames`, `surfacedNames` und weiteren Feldern; dazu die Hilfswerkzeuge
`RefreshMcpTools` und `WaitForMcpServers`. Unser Server meldet GEMESSEN `tools.listChanged=false`.

**Herstellerempfehlung.** BELEGT: „Claude's ability to pick the right tool degrades once you
exceed 30-50 available tools.“ Tool Search lohnt ab „10 or more tools“, ab „more than 10k
tokens“ Definitionen oder bei aggregierten Servern. Optimierungshinweise, die unmittelbar
anwendbar sind: „Keep your 3-5 most frequently used tools non-deferred.“, „Use consistent
namespacing in tool names“, „Use keywords in descriptions that match how users describe tasks.“
Und zur Größenordnung: „50 tools can use 10-20K tokens“ — unser Server liegt mit rund 690 bis
895 Token je Werkzeug deutlich darüber.

---

### 3.4 Codex CLI, Version 0.153.4

**Ladeverhalten: bei Bedarf. Belegstufe GEMESSEN.**

GEMESSEN im Eigenversuch: Der Server (`dist/cli.js`, 54 Werkzeuge) wurde per CLI-Override
(`-c mcp_servers.bbprobe.*`) in eine ephemere, schreibgeschützte Codex-Session eingehängt, ohne
die Konfiguration des Nutzers zu ändern. Ergebnis:

1. Das Modell nennt auf Nachfrage **alle 54 Werkzeugnamen exakt**, Präfix `mcp__bbprobe__`. Die
   Namen stehen also im Kontext.
2. Auf die Bitte, für `mcp__bbprobe__bb_cost_locations_search` den ersten Satz der Beschreibung
   und die Parameternamen des `inputSchema` wörtlich wiederzugeben, antwortet es exakt mit dem
   vorher vereinbarten Codewort „NICHT VORHANDEN“. Beschreibungen und Schemata liegen **nicht**
   vor.
3. Größenkontrolle am Server: vollständige Definitionen 206.577 Zeichen, nur Namen 1.508 Zeichen
   (~377 Token), Namen plus Beschreibungen 35.728 Zeichen (~8.900 Token).
4. Der gemessene Zuwachs der gemeldeten Tokenzahl lag bei rund 440 Token, passt also auf
   „nur Namen“.

**Warnung zur Sorgfalt, vom Rechercheur selbst benannt:** In einem streng gleich formulierten
Kontrolllauf („Antworte nur mit dem Wort OK.“) meldete Codex mit und ohne den Server identisch
4.083 Token. Das kann bedeuten, dass der angezeigte Zähler die `tools`-Sektion gar nicht
mitzählt. Die Aussage „Schemata sind nicht im Kontext“ ruht deshalb auf der Selbstauskunft des
Modells plus der Namensaufzählung, **nicht** auf dem Zähler.

BELEGT flankierend: PR `openai/codex#29486` „[codex] Use tool search for MCP tools by default“,
gemerged 2026-06-22, beschreibt „Defer all effective MCP tools when tool_search and namespaced
tools are supported“. GEMESSEN passend dazu zeigt `codex features list` das Flag
`tool_search_always_defer_mcp_tools` mit Stufe `removed` und Zustand `true`. Im Binary
`/Applications/ChatGPT.app/Contents/Resources/codex` finden sich GEMESSEN die Zeichenketten
„Searches over deferred tool metadata with BM25 and exposes matching tools for the next model
call.“ und „For MCP tool discovery, always use tool_search instead of list_mcp_resources“.

**Die Rückfallebene ist real**, BELEGT aus PR #29486: „Keep exposing MCP tools directly when
search cannot be used, so older or unsupported model/provider combinations still work.“ Mit
einem Modell älter als gpt-5.4 oder einem Provider ohne `tool_search` wandern die Definitionen
wieder vollständig in den Kontext.

**Obergrenze.** Keine dokumentierte Obergrenze. Historisch relevant: Laut PR #29486 wurden
MCP-Werkzeuge früher nur hinter `tool_search` gelegt, wenn ein Feature-Flag gesetzt war **oder
mindestens 100 Werkzeuge** vorlagen; diese 100er-Schwelle ist mit dem Merge entfallen. Im Binary
stehen Kappungshinweise („additional namespaces omitted.“, „- Additional plugin capabilities
omitted to fit the context limit.“); der auslösende Schwellwert ließ sich **nicht** ermitteln.

**Schaltbarkeit.** BELEGT: `enabled` (ganzer Server), `enabled_tools` (Allow-Liste),
`disabled_tools` (Deny-Liste, nach `enabled_tools` angewandt), `required`,
`default_tools_approval_mode`, `tools.<tool>.approval_mode`, `tools.<tool>.output_token_limit`.
Wirkung auf den Kontext: Da nur die Namen im Kontext liegen, spart ein abgeschaltetes Werkzeug
rund 7 Token. Ein ganzer Server auf `enabled=false` spart den Namespace samt Namen.

**Paginierung: nicht ermittelt.** Unser Server bietet keine an, der Fall ließ sich nicht
auslösen. Im Binary stecken die vollständigen MCP-Schematypen der `rmcp`-Rust-Bibliothek
inklusive `nextCursor`. VERMUTUNG, dass Codex das paginierende `list_all_tools` nutzt.

**`notifications/tools/list_changed`: nicht ermittelt.** Ein Handler ließ sich per `strings`
nicht nachweisen; unser Server meldet `listChanged=false` und bietet die Benachrichtigung gar
nicht erst an.

**Herstellerempfehlung.** BELEGT und mit Zahl, aber je Namespace, nicht je Server: „As a best
practice, aim to keep each namespace to fewer than 10 functions for better token efficiency and
model performance.“ Ferner: „we recommend grouping deferred functions into namespaces or MCP
servers with clear, high-level descriptions“ und „Avoid overly long descriptions. Instead, put
richer detail in the deferred function descriptions that are loaded only when needed.“ Zu den
`instructions`: „Keep the first 512 characters self-contained so the most important guidance is
available when Codex is deciding how to use the server.“ Zum Werkzeugschnitt: „Create one tool
for each distinct action the plugin must support. Prefer focused operations such as
list_projects, get_project, and update_project over one tool with many unrelated modes.“

---

### 3.5 ChatGPT Desktop App als Codex-Host und Codex-IDE-Extension

**Ladeverhalten: bei Bedarf. Belegstufe BELEGT.**

BELEGT: „The ChatGPT desktop app, Codex CLI, and IDE extension support MCP servers and share MCP
configuration for the same Codex host.“ GEMESSEN als Stütze: Das auf dem Rechner ausgeführte
`codex`-Binary liegt unter `/Applications/ChatGPT.app/Contents/Resources/codex`; Desktop-App und
CLI teilen denselben Code und dieselbe `~/.codex/config.toml`. Lokale stdio-Server sind hier
möglich, anders als im Web. Das Codex-Ergebnis überträgt sich mit hoher Wahrscheinlichkeit,
wurde dort aber nicht separat gemessen, daher BELEGT und nicht GEMESSEN.

---

### 3.6 ChatGPT Web (Connectors/Plugins)

**Ladeverhalten: nicht ermittelbar. Belegstufe BELEGT (für das, was belegt ist).**

BELEGT: „ChatGPT web can use remote MCP-backed tools supplied by plugins. Local Codex clients can
also connect directly to MCP servers and share their configuration.“ **Lokale stdio-Server sind
im Web also nicht anbindbar**; es geht ausschließlich über entfernte, per HTTPS erreichbare
Server als Plugin beziehungsweise Connector. Verbindungsweg: Developer mode unter Settings,
Security and login, dann unter `chatgpt.com/plugins` eine Verbindung anlegen. Für
veröffentlichte Plugins gilt ein eingefrorener Metadaten-Snapshot statt Live-Abfrage.

**Wie die Werkzeuge dort in den Modellkontext gelangen, ist nicht dokumentiert und von außen
nicht messbar.** VERMUTUNG, ausdrücklich nicht belegt: Da ChatGPT auf derselben
Responses-/Agents-Infrastruktur läuft und die Agents-API-Doku sagt „The runtime defers MCP tools
and adds tool search when searchable deferred tools are available. This applies to remote MCPs,
executor MCPs, and MCP tools supplied by plugins“, liegt dasselbe Deferral nahe. Nicht gemessen,
nicht als Entscheidungsgrundlage tauglich.

**Obergrenze: nicht ermittelt.** Zwei kursierende Zahlen ließen sich **nicht** belegen und sind
reine VERMUTUNG Dritter aus dem OpenAI-Community-Forum ohne Antwort von OpenAI: erstens eine
Grenze von 5.000 Token für alle Werkzeuge zusammen, zweitens rund 19.700 Zeichen je
Werkzeugbeschreibung. Wäre die erste Zahl richtig, wäre dieser Server dort um eine
Größenordnung zu groß. Das ist eine Vermutung, keine Grundlage für eine Entscheidung.

---

### 3.7 Cursor

**Ladeverhalten: bei Bedarf. Belegstufe BELEGT.**

BELEGT aus dem Cursor-Blog „Dynamic context discovery“ vom 2026-01-06: „Some MCP servers include
many tools, often with long descriptions, which can significantly bloat the context window. Most
of these tools go unused even though they are always included in the prompt.“ Und die Lösung:
„In Cursor, we support dynamic context discovery for MCP by syncing tool descriptions to a
folder. The agent now only receives a small bit of static context, including names of the tools,
prompting it to look up tools when the task calls for it. In an A/B test, we found that in runs
that called an MCP tool, this strategy reduced total agent tokens by 46.9%.“

Bestätigend Cursor-Staff im Forum-Thread 165642: am 2026-07-14 „The CLI currently sends all
configured MCP tool definitions in a single request, while the IDE effectively sends a lot
fewer.“, am 2026-09-09 „The CLI now loads MCP tool definitions only when needed, instead of
sending all schemas at the start of the session, similar to how the app works.“

In den Modellkontext gehen damit nur Werkzeugnamen plus Verweis auf Dateien; die vollen
Beschreibungen und Schemata liest der Agent per Datei-Werkzeug nach. **Nicht selbst gemessen**,
da Cursor auf dem Rechner nicht installiert ist und nichts installiert werden durfte.

**Obergrenze: die kritischste offene Frage des ganzen Dossiers.**

Historisch BELEGT: 40 Werkzeuge über alle Server. Cursor-Staff Condor am 2025-06-24: „Currently
the MCP tool limit is 40 tools“. Staff Dean Rie am selben Tag: „The 40 tool limit is actually
there for a good reason - if we increased it, the AI would struggle to effectively choose between
all the available tools.“ Verhalten beim Überschreiten laut Community (Thread 107844,
2025-06-23): „Cursor cannot see the 41st tool“, also **stillschweigendes Weglassen ohne
Meldung**.

Aktueller Stand **unklar**. Die offizielle MCP-Dokumentation (gecrawlt 2026-09-13) nennt
keinerlei Werkzeug-Obergrenze. Ein Cursor-Ambassador (kein Staff) berichtet am 2026-03-03, er
fahre „more than 80 tools enabled, and there's no warning message at all“, und führt das auf
Dynamic Context Discovery zurück. Eine Forum-Suche nach Beiträgen seit 2026-05 ergab keinen
einzigen neuen Bericht über eine 40er-Grenze in der IDE.

**Einschätzung des Rechercheurs, ausdrücklich als VERMUTUNG gekennzeichnet:** Die 40er-Grenze
dürfte mit der Umstellung auf Dynamic Context Discovery gegenstandslos geworden sein. Ein
offizielles Dementi oder eine neue Zahl gibt es nicht.

Getrennt davon existiert weiterhin eine modellseitige Obergrenze für die Zahl der Werkzeuge pro
Request; die CLI lief in den Fehler „Too many MCP tools are enabled for this model. Please
disable some MCP servers and try again.“ (Thread 165642, 2026-07-13).

**Schaltbarkeit.** Server ein- und ausschaltbar, BELEGT: „Toggle servers on/off without removing
them [...] Disabled servers won't load or appear in chat.“ Damit wirkt es auf den Kontext.
Einzelne Werkzeuge: Staff sagte 2025-06-24, das gehe in den MCP-Einstellungen; die heutige Doku
erwähnt nur noch den Serverschalter. Enterprise-Admins können Tool-Allowlists pflegen, das ist
eine Ausführungs-, keine Kontextbeschränkung.

**Paginierung: nicht ermittelt.** Nicht quelloffen, keine Doku.
**`notifications/tools/list_changed`: nicht ermittelt.**

**Herstellerempfehlung.** Keine Zahl, dafür eine Zuständigkeitsaussage aus dem Blog: „It's not
feasible to expect every MCP server to optimize for this. We believe it's the responsibility of
the coding agents to reduce context usage.“ Cursor erwartet ausdrücklich **nicht**, dass ein
Server seine Werkzeugzahl klein hält.

---

### 3.8 VS Code mit GitHub Copilot

**Ladeverhalten: gemischt, hängt an der Modellfähigkeit. Belegstufe GEMESSEN.**

GEMESSEN durch Lesen des ausgelieferten Codes der lokalen Installation (VS Code 1.137.0, Commit
`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`, Build 2026-09-08, copilot-chat 0.65.0). Zwei Fälle:

**Fall 1, Modell ohne Tool-Search-Fähigkeit:** Alle aktivierten Werkzeuge gehen als vollständige
Definitionen in **jeden** Request. Im Code wörtlich:

```
if(o.tools&&o.tools.length>128&&!n.supportsToolSearch)throw new Error("Cannot have more than 128 tools per request.")
```

**Fall 2, Modell mit Tool-Search-Fähigkeit** (`supportsToolSearch`, gespeist aus
`capabilities.supports.tool_search`; bei Anthropic mit dem Beta-Header
`advanced-tool-use-2025-11-20`): Werkzeuge werden verzögert geladen. Für die
Anthropic-Messages-API wird je Werkzeug `defer_loading: true` gesetzt; für die
OpenAI-Responses-API werden die verzögerten Werkzeuge ganz aus dem `tools`-Array entfernt und
ein clientseitiges Werkzeug vorangestellt:

```
{type:"tool_search",execution:"client",description:"Search for relevant tools by describing what you need. Returns tool definitions for tools matching your query.",parameters:{...query...}}
```

Im System-Prompt steht dann „Available deferred tools (must be loaded with <tool_search> before
use):“ gefolgt von der reinen Namensliste.

Welche Werkzeuge nicht verzögert werden, entscheidet `isNonDeferredTool` mit einer festen Menge
(`run_in_terminal`, `runTests`, `tool_search`, `task_complete` und weitere). **MCP-Werkzeuge
(Namensschema `mcp__<server>__<tool>`) stehen nicht auf dieser Liste, sind also verzögerbar.**

**Obergrenze: 128 Werkzeuge pro Request, hart.** GEMESSEN im Code (Zitat oben) und BELEGT in der
Doku: „A chat request can have a maximum of 128 tools enabled at a time.“ Beim Überschreiten gibt
es **kein** stilles Weglassen, sondern eine sichtbare Fehlermeldung. Die Grenze entfällt, wenn
das Modell Tool Search unterstützt.

Zweite Entlastungsstufe: **Virtual Tools.** GEMESSEN in der `package.json`:
`github.copilot.chat.virtualTools.threshold`, Typ number, min 0, max 128, **Default 128**, Tag
`experimental`. Beschreibungstext: „Virtual tools group similar sets of tools together and they
allow the model to activate them on-demand. [...] We are actively developing this feature and you
experience degraded tool calling once the threshold is hit.“ Die virtuellen Werkzeuge tragen das
Präfix `activate_`.

**Schaltbarkeit: ja, auf beiden Ebenen, mit Kontextwirkung.** BELEGT: „When an MCP server is
disabled, it does not start and its tools, prompts, resources, and MCP apps are excluded from
chat.“ Und je Werkzeug: „Select the Configure Tools button in the chat input to see all available
tools [...] and toggle specific tools on or off“, zusätzlich gruppenweise. Da die 128er-Zählung
auf dem `tools`-Array des Requests arbeitet, reduziert Abwählen nachweislich den Kontext.
Bekanntes Ärgernis: Neu entdeckte MCP-Werkzeuge sind standardmäßig vorausgewählt
(`microsoft/vscode#248368`).

**Paginierung: ja, vollständig implementiert, aber ohne Kontextnutzen.** GEMESSEN:

```
listTools(e,t){return Dt.asyncToArrayFlat(this.sendRequestPaginated("tools/list",i=>i.tools,e,t))}
sendRequestPaginated(e,t,i,n){let r;do{let a={...i,cursor:r},c=await this.sendRequest({method:e,params:a},n);yield t(c),r=c.nextCursor}while(r!==void 0&&!n.isCancellationRequested)}
```

VS Code läuft alle Seiten durch und flacht sie zu einer Liste ab. Keine Seitenbegrenzung.

**`notifications/tools/list_changed`:** GEMESSEN
`case "notifications/tools/list_changed": this._onDidChangeToolList.fire();` — VS Code reagiert.
Der Prompt weist das Modell zusätzlich darauf hin, nach neuen Werkzeugen zu suchen.

**Herstellerempfehlung.** Keine Zahl. Der MCP-Entwicklerleitfaden bleibt qualitativ: „Keep tool
operations focused and atomic to avoid complex interactions“ und „Document your tools clearly
with descriptions that help users understand when to use them“.

---

### 3.9 Windsurf (Cascade)

**Ladeverhalten: sofort alle. Belegstufe VERMUTUNG.**

Das ist die einzige Zeile der Übersicht, deren Ladeverhalten reine VERMUTUNG ist, und das muss
so stehen bleiben. Die offizielle Doku beschreibt das Ladeverhalten **nicht**. Sie sagt nur,
wörtlich: „Cascade has a limit of 100 total tools that it has access to at any given time.“ Die
Formulierung „has access to at any given time“ und die Tatsache, dass die Entlastung über
manuelle Werkzeugschalter je MCP läuft, sprechen für eine statische Liste im Kontext ohne
Nachladen. Es gibt in der Doku keinen Hinweis auf Deferral, Tool Search oder Gruppierung.
Windsurf ist nicht quelloffen und war nicht installiert; **gemessen wurde nichts.**

**Obergrenze: 100 Werkzeuge insgesamt, BELEGT.** Früher lag die Grenze bei 50; die Erhöhung auf
100 ist sekundär belegt, aber nicht in einer datierten Primärquelle verifiziert. Verhalten beim
Überschreiten: Die Doku sagt es nicht. Es gibt eine dokumentierte Fehlermeldung aus der Praxis
(Appwrite-Thread, 2025-04-20): „Error: Adding this instance would exceed the max allowed tools.
Check your configuration.“ Das deutet auf eine harte, sichtbare Ablehnung beim **Hinzufügen**
eines weiteren Servers hin, nicht auf stilles Abschneiden. Ob das heute noch so aussieht: nicht
ermittelt. Getrennt davon ein Limit von 20 Tool-Calls pro Prompt (sekundär belegt).

**Schaltbarkeit: ja, bis auf Werkzeugebene**, über das MCPs-Symbol im Cascade-Panel. Ob das
Abwählen den Kontext reduziert oder nur die Aufrufbarkeit, sagt die Doku **nicht**; da es
ausdrücklich als Mittel gegen die 100er-Grenze dient, ist eine Kontextwirkung naheliegend, aber
nicht belegt.

**Paginierung, `list_changed`, Werkzeugsuche: nicht ermittelt beziehungsweise keine gefunden.**

Die Windsurf-Doku wird inzwischen per 307 auf `docs.devin.ai/desktop/cascade/mcp` (Cognition)
umgeleitet.

---

### 3.10 Cline

**Ladeverhalten: sofort alle. Belegstufe BELEGT** (Quelltext main-Branch, Stand 2026-09-12).

In `apps/vscode/src/services/mcp/McpHub.ts` werden die Werkzeuge je Server beim Verbinden
einmal geholt und in der Server-Struktur gehalten; von dort gehen sie geschlossen in die Session.
Der Sitzungsaufbau bindet sie fest: `apps/vscode/src/sdk/sdk-mcp-coordinator.ts` reagiert auf
eine Änderung der Werkzeugliste nicht mit Nachladen, sondern mit einem **kompletten Neustart der
Sitzung**:

```
handleToolListChanged(): void { Logger.log("[SdkController] MCP tool list changed"); ... this.options.rebuilds.request("mcpTools", () => this.restartSessionForMcpTools()); }
```

Ein Mechanismus für bedarfsweises Nachladen existiert nicht.

**Obergrenze:** keine. **Schaltbarkeit: nur auf Serverebene** (`config.disabled`; für
deaktivierte Server wird gar kein Client erzeugt, `getServers()` filtert sie heraus). Einzelne
Werkzeuge lassen sich **nicht** abschalten; `autoApprove` je Werkzeugname betrifft nur die
Rückfrage vor der Ausführung.

**Paginierung: nein.** `tools/list` wird mit einem einzigen Request ohne Cursor abgesetzt, keine
Schleife. Ein paginierender Server verliert hier alles ab Seite zwei.

**`list_changed`:** wird verarbeitet, Refreshes werden sogar bewusst zusammengefasst.

---

### 3.11 LM Studio

**Ladeverhalten: sofort alle. Belegstufe BELEGT.**

Die Entwicklerdoku begründet die Beschränkungsmöglichkeit ausdrücklich damit, dass sonst alle
Definitionen im Prompt landen: Einschränken sei sinnvoll, „if you do not want certain tools from
an MCP server to be used, and can speed up prompt processing due to the model receiving fewer
tool definitions“. Ohne `allowed_tools` gilt: „all tools from the server are available to the
model.“

Die App-Doku warnt zusätzlich: „Some MCP servers were designed to be used with Claude, ChatGPT,
Gemini and might use excessive amounts of tokens“ und „Watch out for this. It may quickly bog
down your local model and trigger frequent context overflows.“

**Das ist für uns der kritischste Fall unter allen untersuchten Clients**, weil hier ein lokales
Modell mit kleinem Kontextfenster arbeitet.

**Obergrenze:** keine dokumentierte Zahl; faktisch das Kontextfenster des geladenen Modells.
**Schaltbarkeit: ja, auf Werkzeugebene** über `allowed_tools`, mit belegter Kontextwirkung.
**Paginierung, `list_changed`, Werkzeugsuche: nicht ermittelt beziehungsweise keine gefunden.**

---

### 3.12 Zed

**Ladeverhalten: sofort alle. Belegstufe BELEGT** (Quelltext main-Branch, Stand 2026-09-13).

In `crates/agent/src/tools/context_server_registry.rs` werden beim Start jedes laufenden Servers
alle Werkzeuge geholt und als reguläre Agent-Werkzeuge registriert:

```
let response = client.request::<context_server::types::requests::ListTools>(()).await;
for tool in response.tools { let tool = Arc::new(ContextServerTool::new(...)); registered_server.tools.insert(tool.name(), tool); }
```

Die registrierten Werkzeuge sind von den eingebauten nicht unterscheidbar und gehen mit dem
Request an das Modell. Kein Deferral- oder Nachladepfad.

**Obergrenze:** keine.

**Schaltbarkeit: ja, sehr feingranular über Agent-Profile.** `AgentProfileSettings` mit
`tools: IndexMap<Arc<str>, bool>`, `enable_all_context_servers: bool` und
`context_servers: IndexMap<Arc<str>, ContextServerPreset>`. Werkzeug-IDs haben das Format
`mcp:<server_id>:<tool_name>`. **Wichtig:** In `assets/settings/default.json` gilt für das
Standardprofil `write` `"enable_all_context_servers": true` — alle 54 Werkzeuge sind sofort
aktiv. Für `ask` ist die Zeile auskommentiert („We don't know which of the context server tools
are safe for the Ask profile“), `minimal` hat `false`.

**Paginierung: nein.** Der `ListTools`-Request wird mit dem Unit-Parameter `()` abgesetzt, keine
Schleife über `nextCursor`.

**`list_changed`:** wird ausgewertet (`client.on_notification("notifications/tools/list_changed", ...)`
mit anschließendem `reload_tools_for_server`).

---

### 3.13 Continue

**Ladeverhalten: sofort alle. Belegstufe BELEGT** (Quelltext main-Branch, Stand 2026-09-13).

Beim Laden der Konfiguration werden die Werkzeuge aller verbundenen Server in die globale
Werkzeugliste geschoben (`core/config/profile/doLoadConfig.ts`, `newConfig.tools.push(...serverTools)`).
Beim Request wird in `gui/src/redux/selectors/selectActiveTools.ts` gefiltert: im Modus `chat`
gar keine Werkzeuge, sonst alle, deren Policy nicht `disabled` und deren Gruppe nicht `exclude`
ist. Die so ermittelte Liste geht vollständig mit. Kein Nachladen, kein Deferral.

**Obergrenze:** keine; die Zählung dient nur dem Erkennen von Namensdubletten.

**Schaltbarkeit: ja, auf Werkzeug- und Gruppenebene, mit Kontextwirkung.** Jedes MCP-Werkzeug
bekommt `group: server.name`, ein ganzer Server lässt sich also über die Gruppenpolicy
ausschließen. Der Modus `chat` ist ein Totalschalter.

**Paginierung: nein.** `const { tools } = await this.client.listTools({}, {...})`, ein einziger
Aufruf ohne Cursor.

**`list_changed`: nicht abschließend ermittelt**; in `MCPConnection.ts` nicht gefunden, Continue
lädt die Konfiguration bei Zustandsänderungen neu.

---

### 3.14 Jan

**Ladeverhalten: gemischt, für uns praktisch sofort alle. Belegstufe BELEGT** (main-Branch,
Stand 2026-09-11).

Jan hat ein Feature „Smart MCP tool routing“, das **je Server** auswählt, nicht je Werkzeug:
„With Smart MCP tool routing enabled, Jan may load tools from only some MCP servers each turn
instead of all of them.“ Entscheidend ist die Schwelle. In
`web-app/src/lib/mcp-orchestrator/intent-classifier.ts`:

```
// Skip routing when connected servers are at or below this count.
export const ROUTING_THRESHOLD = 5
export const MAX_ROUTED_SERVERS = 5
if (servers.length <= threshold) return servers.map((s) => s.name)
```

Die Telemetriedoku bestätigt: `bypassedRouting` ist „true when at or below that threshold - full
tool list, no server picking“. **Für einen Nutzer mit höchstens fünf verbundenen Servern, also
praktisch jeden, der nur unseren Server fährt, wird das Routing übersprungen und die volle
Werkzeugliste geladen.** Ein Nachladen einzelner Definitionen innerhalb eines Servers gibt es
nicht.

**Obergrenze:** keine für Werkzeuge; `MAX_ROUTED_SERVERS = 5` betrifft Server.
**Schaltbarkeit:** `disabledToolKeys` je Werkzeug; ob deaktivierte Werkzeuge ganz aus dem Request
fallen, wurde **nicht** bis in den Request hinein verfolgt.
**Paginierung und `list_changed`: nicht ermittelt.**

---

### 3.15 Protokollebene: MCP-Spezifikation 2026-07-28 und Entwurf

**Ladeverhalten: nicht ermittelbar, weil die Spezifikation es nicht regelt. Belegstufe BELEGT.**

Die Spezifikation regelt ausschließlich, was über die Leitung geht, nicht was der Client in den
Modellkontext legt. Sie enthält dazu keinen Satz. Zwei Klauseln sind neu in dieser Revision und
für uns wichtig:

- „Servers that declare the tools capability MUST respond to tools/list requests with the set of
  tools currently available to the requesting client. This set MAY be empty and MAY change over
  time [...], but **MUST NOT vary per-connection or as a side effect of other requests on the
  connection**.“
- „Servers SHOULD return tools in a deterministic order [...] improves LLM prompt cache hit rates
  when tools are included in model context.“

GEMESSEN: Beide Sätze fehlen in den Revisionen 2025-06-18 und 2025-11-25.

**Obergrenze:** keine für die Werkzeugzahl. Begrenzt sind nur Namen („SHOULD be between 1 and 128
characters“) und, als weiche Schranke gegen Denial of Service, Schematiefe und Zahl der
Teilschemata.

**Paginierung:** `tools/list` steht in der Liste der paginierten Operationen. Der Cursor ist
opak, „Page size is determined by the server“, Clients „SHOULD support both paginated and
non-paginated flows“. Neu in 2026-07-28: jede Seite trägt eigene `ttlMs` und `cacheScope`.

**Werkzeugsuche: im Protokoll nichts.** Kein Feld, das ein Werkzeug als zurückgestellt markiert,
keine Methode für Namen ohne Schema, kein Detailgrad an `tools/list`. Die Herstellerdoku
beschreibt das Muster ausdrücklich als Sache des Hosts: „The host fetches tool definitions via
tools/list as normal, but defers injecting them into the model's context.“

**Entwurf:** an den relevanten Stellen wortgleich. Neu und für einen Sparansatz entscheidend:
„JSON Schema 2020-12 permits $ref to point at an absolute URI. Implementations MUST NOT
automatically dereference $ref values that resolve to a network URI.“ Und: „Schemas that fail to
validate due to an unresolved external $ref SHOULD be rejected rather than silently treated as
permissive.“ Ein serverweit gemeinsames, über eine URL referenziertes Schema ist damit
protokollseitig ausgeschlossen.

**Roadmap:** „Progressive discovery“ steht als Arbeitspaket der Core Primitives WG (Seitenstand
2026-08-22): „Clients learn a server's tools and resources as they need them instead of ingesting
the full catalog up front.“ Ausdrücklich ein Vorhabenstand: „we're starting a dedicated effort
[...] to define what an experimental server-side discovery mechanism would look like.“ Dazu
SEP #1888 (Draft, eröffnet 2025-11-24, seither ohne Bewegung). **VERMUTUNG: Bis dahin ist mit
keiner Protokolllösung zu rechnen.**

**Herstellerempfehlung: keine.** GEMESSEN: Suche nach „number of tools“, „too many tools“,
„context window“, „token“, „paginat“ in `learn/server-concepts`, `develop/build-server` und
`develop/build-with-agent-skills` liefert keinen einzigen einschlägigen Treffer.

---

### 3.16 Die offiziellen TypeScript-SDKs, Version 2.0.0

**Serverseite (`@modelcontextprotocol/server`, das Paket dieses Projekts): sofort alle,
GEMESSEN.** Der Handler im ausgelieferten Bundle lautet wörtlich:

```
this.server.setRequestHandler('tools/list', () => ({ tools: Object.entries(this._registeredTools).filter(([, tool]) => tool.enabled).map(...) }))
```

Er nimmt den `cursor`-Parameter nicht entgegen, wertet ihn nicht aus und setzt nie ein
`nextCursor`. **Paginierung wäre für diesen Server Handarbeit auf dem Low-Level-Pfad.**

GEMESSEN ferner: Jeder Registereintrag hat ein Feld `enabled`; der `tools/list`-Handler filtert
darauf, `tools/call` lehnt ein abgeschaltetes Werkzeug mit `InvalidParams` und „Tool X disabled“
ab. **Ein abgeschaltetes Werkzeug verschwindet vollständig aus `tools/list`.** Das SDK setzt beim
ersten `registerTool` ungefragt `tools: { listChanged: true }`.

**Clientseite (`@modelcontextprotocol/client`): sofort alle, GEMESSEN.** `listTools(params,
options)` fährt zweigleisig: mit ausdrücklichem `{ cursor }` genau eine Seite, ohne Cursor
`_listAllPages('tools/list', ...)` mit Aggregation aller Seiten. Die Doku im Bundle sagt es
wörtlich: „Called without a cursor (the common case), this walks every page and returns the
complete aggregated list with no nextCursor.“ Obergrenze `listMaxPages`, Default 64.

**Das ist der belastbarste Beleg dafür, dass Paginierung dem Kontext nichts bringt: der Normalfall
holt alle Seiten.**

`list_changed`: `_setupListChangedHandlers` registriert einen Handler und lädt daraufhin
`listTools(undefined, { cacheMode: 'refresh' })`, aber nur bei angekündigter Capability. Der
Handler holt die **ganze** Liste erneut.

---

### 3.17 Claude Messages API: `tool_search_tool` und MCP-Connector

**Ladeverhalten: gemischt, Default `defer_loading: false`. Belegstufe BELEGT.**

Standard ist sofort alle: Beim MCP-Connector hat `defer_loading` den Vorgabewert `false`. Wird
das tool search tool eingesetzt, wird bei Bedarf geladen: „Internally, the API excludes deferred
tools from the system-prompt prefix. When Claude discovers a deferred tool through tool search,
the API appends a tool_reference block inline in the conversation, then expands it into the full
tool definition before passing it to Claude. The prefix is untouched, so prompt caching is
preserved.“

**Wichtig für einen Serverbetreiber:** „You still send every tool's full definition in the tools
array on every request, including the deferred ones.“ **Das Zurückstellen ist eine Entscheidung
des Aufrufers, nicht des Servers. Der Server kann sie weder erklären noch erzwingen.**

**Obergrenze:** „Maximum deferred tools: 10,000 tools with defer_loading: true per request“.
Jede Suche liefert vorgabegemäß bis zu 5 Treffer; Claude kann `limit` zwischen 1 und 10.000
setzen. Regex-Muster höchstens 200 Zeichen, BM25-Anfragen höchstens 500. Harte Fehler: „At least
one tool must have defer_loading=false.“ Ein zurückgestelltes Werkzeug darf kein `cache_control`
tragen.

**Schaltbarkeit: zweistufig über `mcp_toolset`** mit `default_config` für den ganzen Server und
`configs` je Werkzeug, Felder `enabled` (Vorgabe true) und `defer_loading` (Vorgabe false).
Allowlist und Denylist sind vorgesehen.

**Nebenwirkung, BELEGT:** „Adding or removing tool definitions mid-conversation invalidates that
cache, and the resulting miss can cost more tokens than the definitions you removed.“

**Werkzeugsuche:** zwei Varianten, `tool_search_tool_regex_20251119` und
`tool_search_tool_bm25_20251119`. Beide durchsuchen „tool names, descriptions, argument names,
and argument descriptions“. **Konsequenz für uns: Parameterbeschreibungen ersatzlos zu streichen
verschlechtert die Auffindbarkeit unter genau diesem Mechanismus.**

**Paginierung: VERMUTUNG.** Wie der Connector `tools/list` gegen einen paginierenden Server
abholt, steht nicht in der Doku und wurde nicht gemessen.

---

## 4. Was das für unsere 54 Werkzeuge bedeutet

### 4.1 Die Ausgangszahlen und ein Widerspruch in den Messungen

| Größe | Zeichen | Token | Quelle |
| --- | --- | --- | --- |
| 54 Werkzeugdefinitionen, wie ausgeliefert | 197.528 | **48.305** | Projektmessung `scripts/measure-tokens.ts` |
| dieselben, rohes `tools`-Array als JSON | 197.583 | 48.307 | Rechercheur Claude Code, unabhängig reproduziert |
| dieselben, aus dem stdio-Handshake | **206.577** | ~51.600 geschätzt | Rechercheur OpenAI-Familie |
| dieselben, nur was ins `tools`-Array ginge (Name, `description`, `input_schema`) | — | 37.224 | Rechercheur Claude Code |
| `instructions`, Auslieferungszustand | 5.092 | **1.259** | Projektmessung |
| `instructions`, alle Schalter an | 5.760 | 1.419 | Projektmessung |
| `instructions`, am laufenden Server | 5.336 | 1.329 | zwei Rechercheure unabhängig |

**Widerspruch 1, Zeichenzahl der Definitionen.** 197.528/197.583 gegen 206.577 Zeichen, eine
Abweichung von rund 4,5 Prozent. **Nicht aufgelöst.** Besser belegt sind die beiden ersten
Zeilen: Sie wurden unabhängig voneinander mit demselben Tokenizer erzeugt und treffen die
Kontrollsumme 48.305 beziehungsweise 48.307 auf zwei Token genau; ein dritter Rechercheur hat
dieselbe Zahl aus dem Projektcode heraus ein drittes Mal reproduziert. Die 206.577 Zeichen
wurden nur in Zeichen gemessen und die Tokenzahl daraus per Faktor geschätzt. **Wir rechnen mit
48.305.**

**Widerspruch 2, `instructions`.** 5.336 Zeichen am laufenden Server liegen zwischen den
Projektwerten 5.092 (Auslieferungszustand) und 5.760 (alle Schalter an). Das ist **kein echter
Widerspruch**, sondern durch den Schalterstand der jeweils gestarteten Instanz erklärbar. Für
das Dossier gilt der Auslieferungszustand: **1.259 Token.**

**Widerspruch 3, was „Definition“ heißt.** 48.305 Token misst die vollständige Definition
einschließlich `outputSchema` und `annotations`. 37.224 Token misst nur, was in ein
`tools`-Array der Messages API ginge. Beide Zahlen sind richtig, sie messen Verschiedenes. Für
den Vergleich mit dem Kontextfenster eines MCP-Clients ist **48.305** die richtige Zahl, weil
MCP-Clients die volle Definition erhalten; für den Vergleich mit Anthropics eigenen
Tokenangaben ist 37.224 die ehrlichere.

**Summe für dieses Dossier: 48.305 + 1.259 = 49.564 Token**, aufgerundet **rund 49.500 bis
49.600 Token je Anfrage** in einem Client, der alles sofort lädt.

Je Werkzeug: **Mittelwert 895 Token, Median 742, Spanne 376 bis 2.119** (volle Definition,
GEMESSEN). In der schmaleren Rechenweise: Mittelwert 689, Spanne 208 (`bb_cost_locations_delete`)
bis 1.949 (`bb_invoices_create_einvoice`).

### 4.2 Die teuren Clients: Cline, Continue, Zed, LM Studio, Jan, vermutlich Windsurf

Hier gehen 49.564 Token bei **jeder einzelnen Anfrage** mit. Ins Verhältnis gesetzt:

| Kontextfenster (Größenordnung, VERMUTUNG aus Vorwissen) | Anteil unseres Servers | Was übrig bleibt |
| --- | --- | --- |
| 1.000.000 Token | 5,0 % | 950.436 Token |
| 200.000 Token | **24,8 %** | 150.436 Token |
| 128.000 Token | **38,7 %** | 78.436 Token |
| 65.536 Token | **75,6 %** | 15.972 Token |
| 32.768 Token | **151 %** | passt nicht |

Die Kontextfenstergrößen sind **VERMUTUNG** (Vorwissen, nicht belegt und nicht gemessen); sie
dienen nur der Größenordnung. Die Prozentwerte darüber sind reine Division.

Konkret je Client:

- **LM Studio** ist der härteste Fall. Lokale Modelle laufen häufig mit 32k oder weniger. Bei
  32.768 Token passt unser Server schlicht nicht hinein, und die LM-Studio-Doku warnt selbst vor
  „frequent context overflows“. Ohne `allowed_tools` ist der Server dort unbrauchbar.
- **Zed** aktiviert im Standardprofil `write` alle Kontextserver (`enable_all_context_servers: true`).
  Die 54 Werkzeuge sind sofort und vollständig aktiv.
- **Jan** greift für uns praktisch immer im Bypass: Wer nur unseren Server fährt, liegt unter der
  Schwelle von fünf Servern und bekommt die volle Liste.
- **Cline** kann nur ganze Server abschalten, nicht einzelne Werkzeuge. Entweder alles oder nichts.
- **Continue** filtert zwar je Werkzeug und je Gruppe, lädt aber die gefilterte Menge vollständig.
- **Windsurf**: VERMUTUNG, siehe 3.9. Sicher ist nur die Obergrenze 100, von der wir 54 belegen.

### 4.3 Die günstigen Clients: Claude Code, Codex, Cursor, VS Code mit Tool Search

Hier liegt im Leerlauf nur eine Namensliste plus die `instructions` im Kontext.

| Client | Im Leerlauf im Kontext | Anteil an 49.564 | Ersparnis |
| --- | --- | --- | --- |
| Claude Code 2.1.270 | 691 Token Namensblock + 1.259 `instructions` = **1.950** | 3,9 % | **96,1 %** |
| Codex CLI 0.153.4 | ~380 bis 450 Token Namen + 1.259 `instructions` = **~1.640 bis 1.710** | 3,3 bis 3,5 % | **96,5 bis 96,7 %** |
| Cursor | nur Namen plus Dateiverweis; absolute Zahl nicht ermittelt | — | im A/B-Test 46,9 % weniger Agent-Token insgesamt |
| VS Code mit `supportsToolSearch` | Namensliste plus `tool_search`-Werkzeug; absolute Zahl nicht ermittelt | — | — |

Der Claude-Code-Rechercheur rechnete mit 1.329 Token `instructions` und kam auf rund 2.020 Token
im Leerlauf. Mit dem Projektwert 1.259 sind es 1.950. Die Differenz ist der Schalterstand, siehe
4.1.

**Wenn ein Werkzeug tatsächlich gebraucht wird**, kommt dessen Definition hinzu: im Mittel 689
bis 895 Token, ein `ToolSearch`-Aufruf liefert voreingestellt bis zu fünf Werkzeuge. Ein
typischer Arbeitsschritt kostet also grob **700 bis 4.500 Token zusätzlich**, plus eine
zusätzliche Modellrunde je Suche. Einmal geladen, bleibt ein Werkzeug für den Rest der Sitzung
verfügbar, bis eine Kompaktierung die Fundstelle entfernt.

**Nach der Deferral ist der größte Einzelposten unseres Servers nicht mehr das Schema, sondern
die `instructions` mit 1.259 Token.** Sie liegen in jedem Fall vollständig im Systemprompt.

### 4.4 Der Unterschied zwischen „im Kontext“ und „übertragen“

Das ist der Punkt, an dem sich leicht falsche Beruhigung einstellt, und er ist BELEGT:

- **Über die Leitung** gehen die vollen 48.305 Token bei jeder Anfrage weiter, auch bei
  aktivierter Deferral. Die API braucht sie serverseitig für Suche und Expansion.
- **Im Modellkontext** landen sie nicht und zählen nicht als Input-Token.

Wer die 48.305 Token als Übertragungsvolumen betrachtet, hat weiterhin recht; wer sie als
Kontextbelastung betrachtet, hat in Claude Code und Codex seit Tool Search unrecht.

Ebenso getrennt zu halten: Claude Desktop ruft `tools/list` GEMESSEN nur einmal pro App-Start
auf. Das sagt nichts über den Modellkontext. Die MCP-Doku formuliert es ausdrücklich: „This is
separate from what's currently in the model's context.“

### 4.5 Die Deferral hängt an Bedingungen, die wir nicht kontrollieren

Jede Zusage zum Kontextverbrauch muss an diese Bedingungen geknüpft werden:

- **Claude Code:** Ein nicht erstanbieterlicher `ANTHROPIC_BASE_URL` (jeder Proxy, jedes
  Gateway) schaltet Tool Search **still** ab. Ebenso
  `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`, ältere Modelle und Foundry auf Azure. GEMESSEN und
  BELEGT.
- **Codex:** Modelle älter als gpt-5.4 oder ein Provider ohne `tool_search` fallen auf die
  vollständige Einspielung zurück. BELEGT aus dem gemergten PR.
- **VS Code:** Meldet der Modellendpunkt kein `capabilities.supports.tool_search`, gehen alle 54
  Definitionen bei jeder Anfrage mit, und die 128er-Grenze gilt wieder. GEMESSEN im Code;
  **welche Modelle das heute melden, wurde nicht geprüft.**
- **Claude Desktop Chat:** Der Default `Auto` ist undokumentiert; `On demand` ist nicht der
  Default und liegt drei Klicks tief im Plus-Menü.

Ein Kunde hinter einem Unternehmensproxy erlebt unseren Server also anders als wir.

---

## 5. Hebel auf Serverseite

Grundlage der Prozentwerte ist die GEMESSENE Postenverteilung der 48.305 Token:

| Posten | Token | Anteil |
| --- | --- | --- |
| `inputSchema` als JSON | 28.643 | 59,3 % |
| davon reiner Beschreibungstext der Parameter | 16.670 | 34,5 % |
| `outputSchema` als JSON | 9.358 | 19,4 % |
| Werkzeugbeschreibungen | 7.561 | 15,7 % |
| `annotations` | 1.404 | 2,9 % |
| `name` und `title` | 583 | 1,2 % |
| JSON-Rumpf der Definition | ~756 | 1,6 % |

Gruppengewichte, GEMESSEN, Summe exakt 48.305:

| Gruppe | Werkzeuge | Token | Anteil |
| --- | --- | --- | --- |
| `postings` | 12 | 12.213 | 25,3 % |
| `receipts` | 8 | 8.466 | 17,5 % |
| `transactions` | 8 | 6.661 | 13,8 % |
| `invoices` | 3 | 5.766 | 11,9 % |
| `creditors` | 4 | 3.341 | 6,9 % |
| `reports` | 5 | 3.203 | 6,6 % |
| `debtors` | 4 | 3.198 | 6,6 % |
| `postingaccounts` | 3 | 1.877 | 3,9 % |
| `cost_locations` | 4 | 1.839 | 3,8 % |
| `payment_accounts` | 2 | 1.142 | 2,4 % |
| `comments` | 1 | 599 | 1,2 % |

Die beiden Gruppennamen `cost_locations` und `payment_accounts` sind seit dem Bau des
Gruppenschalters ausgeschrieben; frühere Fassungen dieser Tabelle führten sie als `cost` und
`payment`. Grund: Die Variable `BB_MCP_TOOL_GROUPS` tippt ein Mensch, der die Werkzeugnamen
`bb_cost_locations_*` und `bb_payment_accounts_*` sieht und nicht diese Tabelle; „payment" ließe
sich zudem mit Zahlungen und Buchungen verwechseln, „cost" mit Kosten allgemein. Die zwölf
gültigen Namen stehen abschließend in `src/registry/groups.ts`.

### H1 — Werkzeuggruppen über eine Umgebungsvariable abschaltbar machen

**Einsparung: linear und garantiert, bis zu 12.213 Token (25,3 %) in einem Schritt.** GEMESSEN.
**Preis:** Die abgeschalteten Funktionen sind in dieser Sitzung nicht verfügbar. Das ist ehrlich
und beherrschbar.

Mechanik ist im SDK bereits vorhanden: Der `tools/list`-Handler filtert auf `enabled`, ein
abgeschaltetes Werkzeug erscheint gar nicht erst in der Antwort. **Protokollrechtlich sauber:**
Beim Serverstart aus der Konfiguration heraus zu entscheiden, ist von der
MUST-NOT-vary-Klausel nicht betroffen; die verbietet Variation je Verbindung und als
Nebenwirkung anderer Anfragen, nicht eine Konfigurationsentscheidung.

**Der einzige Hebel mit garantierter, großer Wirkung.** Wirkt in allen Clients der teuren
Gruppe und zusätzlich gegen die Werkzeugzahl-Obergrenzen von Cursor, Windsurf und VS Code.

### H2 — Parameterbeschreibungen kürzen (nicht streichen)

**Einsparung: Obergrenze 16.670 Token (34,5 %); bei 40 Prozent Kürzung rund 6.700 Token
(13,9 %).** Die Obergrenze ist GEMESSEN, die 40 Prozent sind **VERMUTUNG** auf gemessener
Grundlage; es wurde keine gekürzte Fassung erzeugt und gegengemessen.

**Preis, und der Einwand zählt:** BELEGT durchsucht das tool search tool „tool names,
descriptions, argument names, and argument descriptions“. Wer Parameterbeschreibungen streicht,
verschlechtert die Auffindbarkeit ausgerechnet unter dem Mechanismus, der das Problem löst.
**Kürzen ja, entkernen nein.**

### H3 — Den wiederholten Umschlag der Ausgabeschemata verschlanken

**Einsparung: `outputSchema` wiegt insgesamt 9.358 Token (19,4 %); allein der identische
`_contract_warnings`-Block steckt 54-mal in 54 Ausgabeschemata, je 40 Token, zusammen 2.160
Token (4,5 %).** GEMESSEN.

**Preis:** Wer den Umschlag verschlankt, verliert keine Zusage. Wer `outputSchema` ganz streicht,
spart ein Fünftel, verliert aber die Zusagen aus Plan 7.1 und 7.6, die Typisierung und die
Grundlage für programmatic tool calling („The real fix is for server authors to provide
outputSchema“). **BELEGT ist `outputSchema` in der Spezifikation optional.**

Nach H1 und H2 der drittgrößte Posten und der mit dem besten Verhältnis von Ertrag zu Risiko.

### H4 — Werkzeugbeschreibungen kürzen

**Einsparung: Obergrenze 7.561 Token (15,7 %); bei 30 Prozent Kürzung rund 2.300 Token (4,8 %).**
Obergrenze GEMESSEN, die 30 Prozent sind **VERMUTUNG**.

**Preis:** Die Beschreibung ist genau das Feld, an dem ein Modell das Werkzeug auswählt, und
unter tool search auch das Feld, über das es gefunden wird. Mittleres Verhältnis von Ertrag zu
Risiko.

### H5 — Die `instructions` straffen

**Einsparung: bis 1.259 Token.** GEMESSEN. In den günstigen Clients ist das nach der Deferral
der **größte Einzelposten** unseres Servers, größer als die gesamte Namensliste. In den teuren
Clients sind es 2,5 Prozent des Gesamten.

**Preis:** gering, solange die Kernaussagen bleiben. BELEGT empfiehlt OpenAI, „the first 512
characters self-contained“ zu halten, und rät ausdrücklich davon ab, Werkzeugbeschreibungen zu
wiederholen.

### H6 — `anthropic/searchHint` setzen und `alwaysLoad` für drei bis fünf Kernwerkzeuge

**Einsparung: null, im Gegenteil ein kleiner Aufschlag.** **Nutzen:** Trefferqualität der
Werkzeugsuche. GEMESSEN gewichtet die Suche in Claude Code Namensbestandteile mit 12 Punkten,
`searchHint` mit 4, Beschreibungstext mit 2. BELEGT empfiehlt Anthropic: „Keep your 3-5 most
frequently used tools non-deferred.“

**Preis:** `alwaysLoad`-Werkzeuge landen wieder vollständig im Kontext, je Werkzeug 689 bis 895
Token. Höchstens drei bis fünf, und nur solche, die in fast jeder Sitzung gebraucht werden.

### H7 — `$ref` und gemeinsame `$defs`

**Einsparung: gemessene 80 Token bei 12 Vorkommen, also 0,17 Prozent. Praktisch null.**

Das ist das klarste Ergebnis der Protokollrecherche, und es widerspricht der Erwartung. GEMESSEN
stecken in den 54 Definitionen 1.210 Teilschemata unter `properties`, davon 251 verschiedene.
Die Wiederholung ist groß, **liegt aber fast vollständig zwischen den Werkzeugen, nicht innerhalb
eines Werkzeugs.** Eine Faktorisierung über alle Werkzeuge hinweg würde 9.638 Token sparen, ist
aber **nicht ausdrückbar**: Jedes `inputSchema` und jedes `outputSchema` in der Antwort von
`tools/list` ist ein eigenes Schemadokument, es gibt kein gemeinsames Dokument, auf das `$defs`
zeigen könnte, und BELEGT verbietet der Entwurf das automatische Auflösen von `$ref` auf
Netz-URIs.

Dazu kommt unzuverlässige Clientunterstützung, BELEGT durch Fehlerberichte zu Gemini CLI
(2025-11-15, behoben), Codex CLI (`openai/codex#13746`, 2026-03-06, **offen**, verflacht
Array-Elemente hinter `$ref` zu Strings), Bedrock AgentCore Gateway (lehnt `$ref` ab), Kiro und
weitere.

**Empfehlung: nicht tun.** Kompatibilitätsrisiko ohne Gegenwert.

### H8 — Enums durch freie Strings ersetzen

**Einsparung: Obergrenze 1.418 Token (2,9 %), real fast nichts**, weil die erlaubten Werte dann
in der Beschreibung stehen müssen, wo sie in Prosa mehr Platz brauchen als in einem Enum-Array.

**Preis:** BELEGT baut strict tool use eine Grammatik aus dem Schema; ohne Enum fällt die
Zusicherung weg, dass das Modell nur gültige Werte erzeugt, und die Fehler wandern in die
Laufzeit. **Empfehlung: nicht tun.**

### H9 — Paginierung von `tools/list`

**Einsparung: null. Preis: hoch.**

- GEMESSEN holt das offizielle Client-SDK 2.0.0 ohne Cursor automatisch **alle** Seiten.
- GEMESSEN läuft VS Code alle Seiten durch und flacht sie ab.
- GEMESSEN folgt Claude Code dem Cursor bis 20 Seiten.
- GEMESSEN übergibt **Claude Desktop nie einen Cursor** — alles ab Seite 1 bliebe unsichtbar.
- GEMESSEN setzen **Cline, Continue und Zed** nur einen Request ohne Cursor ab — alles ab Seite
  zwei ginge verloren.
- GEMESSEN kann das serverseitige SDK 2.0.0 in der High-Level-API gar nicht paginieren.

**Empfehlung: nicht tun.** Paginierung ist bestenfalls wirkungslos und bei vier Clients aktiv
schädlich: Sie macht Werkzeuge unsichtbar, statt Kontext zu sparen.

### H10 — Werkzeuge zur Laufzeit nachschieben (`notifications/tools/list_changed`)

**Einsparung: null bis negativ. Preis: protokollwidrig und unzuverlässig.**

Vier Einwände, alle BELEGT:

1. Die Revision 2026-07-28 hat den Satz hinzugefügt, die Werkzeugmenge dürfe nicht variieren
   „per-connection or as a side effect of other requests on the connection“. Genau das wäre ein
   Server, der nach einem Werkzeugaufruf weitere einblendet. GEMESSEN: Der Satz fehlt in
   2025-06-18 und 2025-11-25, ist also neu und richtet sich erkennbar gegen dieses Muster.
2. Unter derselben Revision geht die Benachrichtigung nur an Clients mit offenem
   `subscriptions/listen`-Strom, und „The server MUST NOT send notification types the client has
   not explicitly requested.“
3. Das Nachschieben entwertet den Prompt-Cache: „the resulting miss can cost more tokens than the
   definitions you removed.“
4. GEMESSEN reagiert das Client-SDK darauf, indem es die **ganze** Liste neu holt.

**Empfehlung: nicht tun** — außer wofür es gedacht ist: geänderte Berechtigungen, geänderte
Konfiguration, Neuanmeldung.

### H11 — Werkzeuge zusammenlegen

**Einsparung: proportional zur Zahl der wegfallenden Definitionen, im Mittel 895 Token je
gestrichenem Werkzeug.**

**Preis: der Widerspruch zur Projektentscheidung E1.** BELEGT liegt dieser Server mit 54
Werkzeugen über der Schwelle von 30 bis 50, ab der Anthropic die Trefferqualität der
Werkzeugauswahl absinken sieht: „Claude's ability to pick the right tool degrades once you exceed
30-50 available tools.“ OpenAI empfiehlt „fewer than 10 functions“ **je Namespace**. Das ist ein
Argument fürs Zusammenlegen, nicht fürs Kürzen von Text, und es widerspricht E1. **Diesen
Widerspruch löst die Protokollebene nicht auf; er gehört dem Projektinhaber vorgelegt.**

Gegenbefund, ebenfalls BELEGT: Genau dieses Auswahlproblem löst Tool Search laut Hersteller
(„Because tool search loads only a focused set of relevant tools on demand, selection accuracy
stays high even across thousands of tools“). GEMESSEN funktioniert eine Namensliste mit rund 700
Werkzeugen in Claude Code ohne Weiteres. Das Argument gilt also nur für Clients **ohne** Tool
Search, und dort in voller Schärfe.

---

## 6. Empfehlung

### 6a) Müssen wir etwas ändern, damit der Server in den kritischen Clients brauchbar bleibt?

**Ja. Drei Änderungen, und eine Messung vor der Entscheidung.**

**Das Cursor-Problem muss deutlich benannt werden.** Belegt ist eine Obergrenze von **40
Werkzeugen über alle Server**, aus zwei Cursor-Staff-Aussagen vom 2025-06-24, und belegt ist,
dass das Überschreiten **stillschweigend** geschieht: „Cursor cannot see the 41st tool“. Wenn
diese Grenze heute noch gilt, sind **14 unserer 54 Werkzeuge in Cursor unsichtbar, ohne Warnung,
ohne Fehlermeldung, und der Nutzer erfährt es nie.** Das wäre kein Kontextproblem, sondern ein
Funktionsausfall, und er würde uns als Serverfehler zugeschrieben.

Die Gegenbefunde sind real, aber schwächer: Die aktuelle Cursor-Doku nennt keine Zahl; ein
Ambassador (kein Staff) berichtet am 2026-03-03 von über 80 Werkzeugen ohne Warnung; seit
2026-05 gibt es keinen neuen Forenbericht über die 40er-Grenze; und Dynamic Context Discovery vom
2026-01-06 entzieht ihr die Grundlage. Der Rechercheur hält sie für gegenstandslos und
kennzeichnet das ausdrücklich als **VERMUTUNG**. **Ein offizielles Dementi oder eine neue Zahl
existiert nicht.** Wir haben damit eine belegte schlechte Nachricht aus 2025 und eine vermutete
gute aus 2026. Auf eine Vermutung darf diese Entscheidung nicht gebaut werden.

**Vorschlag, in dieser Reihenfolge:**

1. **Vor dem Release in Cursor real messen.** Das ist die billigste Messung des ganzen Dossiers
   und dauert Minuten: Server in Cursor einhängen, das Modell bitten, alle sichtbaren
   `bb_`-Werkzeuge aufzuzählen, und die Zahl mit 54 abgleichen. Kommen 40 zurück, gilt die Grenze;
   kommen 54 zurück, ist sie weg. Ohne diese Messung bleibt die Frage offen, und sie ist die
   einzige im Dossier, die einen echten Funktionsausfall bedeuten kann.
2. **H1 bauen: abschaltbare Werkzeuggruppen** (siehe 6c). Er ist die Antwort auf alle vier
   Clients mit Mengenproblem gleichzeitig: Cursor (40, unklar), Windsurf (100, belegt), VS Code
   (128 pro Anfrage, belegt und sichtbar), LM Studio (faktisch das Kontextfenster). Ein Nutzer,
   der unter eine Grenze kommen muss, kann es dann.
3. ~~**Die 64-Zeichen-Grenze der Werkzeugnamen prüfen.**~~ **Erledigt am 2026-09-13, und die
   Prüfung war fällig: Ein Werkzeug lag darüber.** BELEGT ist das Muster der Messages API, und
   BELEGT fallen Werkzeuge mit 65 bis 72 Zeichen aus. Clients präfixieren unsere Namen
   (`mcp__<server>__bb_...`). Mit dem früheren Eintragsnamen `buchhaltungsbutler` maß
   `mcp__buchhaltungsbutler__bb_postings_create_for_transaction_batch` 65 Zeichen. Behoben wurde
   es am **Eintragsnamen**, nicht am Werkzeugnamen: `SERVER_NAME` steht auf `bbutler`, der
   längste Name misst damit 54 Zeichen. Die Prüfung hängt seither in
   `test/registry/name-length.test.ts` (jedes Werkzeug aus `TOOL_ENTRIES` und `BUNDLE_ENTRIES`)
   und in Abschnitt 1 der Veröffentlichungs-Checkliste.
4. **Die echte Tokenzahl über `count_tokens` der Messages API messen**, statt über
   `gpt-tokenizer`. Unsere 48.305 Token sind in `o200k_base` gemessen; Anthropic tokenisiert
   anders. Die Größenordnung stimmt, die Zahl ist nicht übertragbar.

**Was wir nicht ändern müssen:** Nichts an der Werkzeugzahl wegen Claude Code, Codex oder Cursor
aus Kontextgründen. Dort ist die Deferral in Claude Code GEMESSEN **bedingungslos**: Der Code
prüft bei `isMcp===true` weder Anzahl noch Tokenmenge. Ob wir 54 Werkzeuge anbieten oder 20 oder
120, ändert am Kontextverhalten in Claude Code keinen einzigen Token. **Wer die Werkzeugliste
ausdünnt, um Claude Code zu entlasten, optimiert ins Leere.** Der Schwellwert von 10 Prozent des
Kontextfensters, den man in der Claude-Code-Doku findet, gilt ausschließlich im Modus `auto`
beziehungsweise `auto:N`, und der ist nicht die Voreinstellung.

**Zur Dokumentation statt zur Änderung:** Die Fehlermodi, auf die wir uns einstellen müssen,
sehen für den Nutzer nicht nach einem Kontextproblem aus, sondern nach einem Fehler unseres
Servers. In Claude Desktop gibt es beim Überschreiten keine Kürzung und keine Warnung, sondern
„This conversation is too long to continue. Start a new chat, or remove some tools to free up
space.“ — und kein `/compact`, die Konversation ist verloren. Das gehört in die README, zusammen
mit der Zahl 54, der Tokenzahl und den Gruppennamen.

### 6b) Lohnen sich zusätzliche Bündelwerkzeuge, die mehrere Endpunkte zu einem Ablauf zusammenfassen?

**Ja, aber als Zusammenlegung, nicht als Ergänzung. Drei bis fünf, nicht zehn.**

Die Rechnung, getrennt nach Clientfamilie. Grundlage: ein Bündelwerkzeug kostet als Definition im
Mittel **895 Token** (GEMESSEN, Mittelwert unserer 54); eine gesparte Modellrunde spart einen
vollständigen Durchgang über den Kontext.

**Clientfamilie 1, die teuren Clients (Cline, Continue, Zed, LM Studio, Jan, vermutlich
Windsurf).**

Kosten: `895 × R` Token, wobei `R` die Zahl der Modellanfragen in der Sitzung ist. Die Definition
liegt in jeder Anfrage, ob benutzt oder nicht.
Nutzen: `C × S`, wobei `C` die Kontextgröße zum Zeitpunkt der gesparten Runde ist und `S` die
Zahl der gesparten Runden. In diesen Clients ist `C` mindestens 49.564 Token, weil unsere
Definitionen darin liegen, plus Gesprächshistorie.
Break-even: `R = (C / 895) × S`, mit `C = 50.000` also **rund 56 Anfragen je gesparter Runde**.

Eine typische Sitzung hat weit weniger als 56 Modellanfragen. **Ein Bündelwerkzeug, das pro
Sitzung auch nur einmal greift, zahlt sich in dieser Familie aus** — vorausgesetzt, es greift
wirklich. Greift es nie, kostet es `895 × R` Token für nichts.

Aber: In dieser Familie ist nicht die Tokenzahl das eigentliche Problem, sondern ob überhaupt
etwas hineinpasst. 895 Token zusätzlich zu 49.564 ändern nichts daran, dass der Server in ein
32k-Fenster nicht passt. Und in Cursor und Windsurf zählt die **Anzahl**: Jedes zusätzliche
Werkzeug verbraucht Budget gegen 40 beziehungsweise 100. **Ein Bündelwerkzeug, das drei
Einzelwerkzeuge ersetzt, ist dort dreifach gut; eines, das obendrauf kommt, ist dort schlecht.**

**Clientfamilie 2, die günstigen Clients (Claude Code, Codex, Cursor, VS Code mit Tool Search).**

Kosten im Leerlauf: nur der Name, GEMESSEN rund **7 bis 11 Token**. Kosten bei Nutzung: die
Definition, 895 Token, einmal je Sitzung.
Nutzen: doppelt. Ein Bündelwerkzeug spart nicht nur die Tool-Call-Runden, es spart auch
**`ToolSearch`-Runden**. Jede Suche ist eine eigene Modellrunde, und voreingestellt liefert sie
fünf Werkzeuge; wer einen Ablauf aus vier Einzelwerkzeugen zusammensetzt, braucht im schlechten
Fall zwei Suchen und vier Aufrufrunden, mit einem Bündelwerkzeug eine Suche und eine Runde.

**In dieser Familie lohnen Bündelwerkzeuge deutlich und ohne Vorbehalt.** Der Leerlaufpreis von
7 bis 11 Token ist vernachlässigbar, der Rundengewinn ist echt.

**Zusammengeführte Empfehlung.**

- **Bauen: drei bis fünf Bündelwerkzeuge für die nachweislich häufigsten Abläufe.** Nicht mehr.
  Die Zahl drei bis fünf stammt nicht aus Bequemlichkeit, sondern aus der belegten
  Herstellerempfehlung „Keep your 3-5 most frequently used tools non-deferred“ — dieselben
  Werkzeuge, die ein Bündel verdienen, sind die, die `anthropic/alwaysLoad` verdienen (H6).
- **Wo ein Bündel einen Ablauf vollständig abdeckt, prüfen, ob die feingranularen Einzelwerkzeuge
  weg können.** Das ist die Stelle, an der Bündelwerkzeuge gegen die Obergrenzen von Cursor und
  Windsurf helfen statt zu schaden, und die Stelle, an der sie den Widerspruch zu E1 (H11)
  entschärfen statt zu verschärfen.
- **Vorher messen, welche Abläufe häufig sind.** Ein Bündelwerkzeug, das niemand benutzt, ist in
  Familie 1 reiner Aufschlag. Ohne Nutzungsdaten ist die Auswahl geraten, und geraten ist hier
  teuer.
- **Nicht bauen: ein Meta- oder Katalogwerkzeug nach dem Dreischichtmuster** (`search_tools`,
  `get_tool_details`) als Ersatz für die 54 Definitionen. Es würde uns vom Ladeverhalten der
  Clients unabhängig machen, aber es verlagert die Werkzeugauswahl in unseren Server, verliert
  jede Schema-Validierung auf Clientseite und bricht mit dem Muster, das alle Clients erwarten.
  Der Nutzen wäre in den vier günstigen Clients null, weil sie das Problem schon lösen; in
  Familie 1 wäre er groß, aber der Preis ist ein eigener, unvalidierter Dispatcher. Wenn dieser
  Weg überhaupt erwogen wird, gehört er als eigene Entscheidung dem Projektinhaber vorgelegt,
  nicht nebenbei entschieden.

### 6c) Sollte eine Abschaltbarkeit der Werkzeuggruppen über eine Umgebungsvariable gebaut werden?

**Ja. Sie ist der einzige Hebel mit garantierter, großer, gemessener Wirkung, und die Mechanik
ist im SDK schon vorhanden. Standard: alle Gruppen an.**

**Warum ja.** GEMESSEN sind die Gruppengewichte linear und groß: `postings` allein nimmt ein
Viertel des Budgets (12.213 Token), `postings` plus `receipts` plus `transactions` nehmen 56,6
Prozent (27.340 Token). Ein Nutzer, der nur Belege lesen will, kann den Server damit von 49.564
auf rund 10.000 Token bringen. Kein anderer Hebel erreicht das, und keiner ist so berechenbar.
Zusätzlich ist es die einzige Antwort auf die Werkzeugzahl-Obergrenzen von Cursor, Windsurf und
VS Code, und die einzige Möglichkeit, den Server in LM Studio überhaupt brauchbar zu machen.

**Standard: alle elf Gruppen an.** Begründung, in dieser Reihenfolge:

1. Ein Default, der Funktionen versteckt, wird als Fehler erlebt. Der Nutzer kann nicht wissen,
   was fehlt, und sucht den Fehler bei uns.
2. In den vier günstigen Clients kostet der Vollumfang GEMESSEN rund 1.950 Token. Dort gibt es
   nichts zu sparen, was einen Default-Verlust rechtfertigen würde.
3. Die Clients mit Problem sind die Minderheit, und dort trifft der Nutzer bereits bewusste
   Entscheidungen (Modellwahl, Kontextgröße, Serverauswahl).

**Granularität: Gruppen, nicht einzelne Werkzeuge.** Eine Variable mit 54 Werkzeugnamen ist
unbenutzbar. Die elf Gruppen sind bereits die fachliche Gliederung des Servers, und sie deckt
sich mit der belegten Empfehlung von OpenAI, nach Namespaces zu gliedern, und mit der von
Anthropic, ein gemeinsames Präfix je Bereich zu nutzen.

**Mechanik, mit Begründung aus der Messung:**

- **Entscheidung beim Serverstart aus der Konfiguration, nicht zur Laufzeit.** GEMESSEN filtert
  der `tools/list`-Handler des SDK auf `enabled`, ein abgeschaltetes Werkzeug erscheint gar nicht
  in der Antwort. BELEGT ist eine Startentscheidung von der MUST-NOT-vary-Klausel der Revision
  2026-07-28 **nicht** betroffen; die verbietet Variation je Verbindung und als Nebenwirkung
  anderer Anfragen.
- **Besser gar nicht registrieren als registrieren und `enabled: false` setzen.** Die Wirkung auf
  `tools/list` ist identisch, aber nicht registrierte Werkzeuge erzeugen keinen toten Code, und
  `doctor` kann klar berichten, was aktiv ist.
- **Zwei Variablen, eine Positiv- und eine Negativliste**, damit beide typischen Fälle ohne
  Aufzählung gehen: „nur diese drei Gruppen“ und „alles außer `invoices`“. Benennung im
  bestehenden Schema des Projekts, Werte als Kommaliste der Gruppennamen.
- **Unbekannte Gruppennamen sind ein Startfehler, keine stille Ignorierung.** Ein Tippfehler, der
  die halbe Funktionalität abschaltet und nichts sagt, ist der schlimmste Fall.
- **`doctor` und die Startmeldung nennen die aktive Gruppenliste, die Zahl der Werkzeuge und den
  gemessenen Tokenpreis.** Ohne diese Rückmeldung kann der Nutzer den Hebel nicht einstellen.
- **Die README führt die Gruppentabelle aus Abschnitt 5 mit Werkzeugzahl und Tokenpreis je
  Gruppe.** Das ist die Information, die der Nutzer braucht, um zu entscheiden, und sie ist
  gemessen.

**Was zu prüfen bleibt, bevor das gebaut wird:** ob die `.mcpb`-Installationsoberfläche von
Claude Desktop eine solche Variable überhaupt abfragen kann. Genau die Nutzer ohne Terminal, für
die das `.mcpb`-Bundle gedacht ist, werden keine Umgebungsvariable setzen. **In diesem Dossier
nicht ermittelt** (siehe Abschnitt 7). Fällt die Antwort negativ aus, bleibt der Hebel für
Desktop-Nutzer wirkungslos, und die Gruppenauswahl müsste im Bundle-Manifest oder über eine
Konfigurationsdatei abfragbar sein.

---

## 7. Nicht ermittelt

Jeder Punkt mit dem Weg, wie man ihn messen würde.

### Zur Kernfrage

1. **Ob Claude Desktop im Default-Modus `Auto` tatsächlich alle 54 Definitionen in jede Anfrage
   legt.** Das ist die Kernfrage für den wichtigsten Zielclient, und sie ist **nicht gemessen**.
   Grund: Der Modellkontext wird serverseitig bei claude.ai zusammengesetzt und ist lokal nicht
   beobachtbar. Der direkte Weg wäre ein abfangender Proxy zwischen Claude Desktop und der
   Anthropic-API mit eigenem CA-Zertifikat, um das `tools`-Array in der ausgehenden Anfrage zu
   sehen; das hätte die Systemkonfiguration des Nutzers verändert und war untersagt.
   **Nicht invasiver Ersatz:** In zwei frischen Chats dieselbe lange Eingabe senden, einmal mit
   verbundenem Connector, einmal mit abgeschaltetem, und zählen, nach wie vielen Nachrichten „This
   conversation is too long to continue“ erscheint. Die Differenz schätzt den Werkzeug-Overhead ab.
2. **Was der Modus `Auto` konkret tut.** Anthropic beschreibt ihn nur als „Claude decides
   dynamically which connectors to load“. Weder Entscheidungsregel noch Schwellenwert noch
   Granularität sind dokumentiert. **Die größte offene Lücke, weil es der Auslieferungszustand
   ist.** Nur durch Herstelleranfrage oder durch den Proxy aus Punkt 1 zu klären.
3. **Ob die Berichte zutreffen, dass `On demand` im Chat faktisch nicht deferrt.** Zwei
   unabhängige Nutzerberichte aus Februar und Juni 2026 sagen es übereinstimmend, keiner ist von
   Anthropic bestätigt, einer wurde als `invalid` geschlossen. Messbar wie Punkt 1, zusätzlich mit
   Umschalten des Modus zwischen den Läufen.

### Zu Cursor, dem kritischsten offenen Punkt

4. **Ob Cursor heute eine harte Obergrenze hat und wo sie liegt.** Belegt ist nur die
   Staff-Aussage von 40 aus Juni 2025. Ohne Installation und ohne Quelltext nicht entscheidbar.
   **Messbar in Minuten:** Server einhängen, Modell alle sichtbaren `bb_`-Werkzeuge aufzählen
   lassen, mit 54 abgleichen. Siehe 6a.
5. **Ob Cursor die Paginierung von `tools/list` nutzt und auf `notifications/tools/list_changed`
   reagiert.** Nicht quelloffen, nicht dokumentiert. Messbar mit einem Testserver, der `tools/list`
   bewusst in zwei Seiten aufteilt beziehungsweise nach dem Start ein Werkzeug nachschiebt.

### Zu den übrigen Clients

6. **Ob in VS Code die Tool-Search-Fähigkeit bei den praktisch genutzten Modellen aktiv ist.** Der
   Code macht sie an `capabilities.supports.tool_search` des Endpunkts fest; welche Modelle das
   heute melden, war ohne laufende Copilot-Sitzung nicht prüfbar. **Das ist der Unterschied
   zwischen 49.564 Token pro Anfrage und einer Namensliste**, und damit der zweitwichtigste offene
   Punkt nach Cursor. Messbar, indem man in einer Copilot-Sitzung mehr als 128 Werkzeuge
   aktiviert: Erscheint der Fehler „Cannot have more than 128 tools per request.“, ist Tool Search
   aus; erscheint er nicht, ist sie an.
7. **Ob Windsurf die Definitionen bei jeder Anfrage vollständig sendet.** Dazu gibt es keine
   Quelle; die Einschätzung „sofort alle“ ist **VERMUTUNG**. Messbar nur mit Installation und
   einem mitschneidenden Proxy vor dem Modellendpunkt.
8. **Ob Windsurf beim Überschreiten der 100 Werkzeuge stillschweigend weglässt oder meldet.** Die
   dokumentierte Fehlermeldung stammt aus 2025 und aus dem Hinzufügen eines Servers, nicht aus dem
   laufenden Betrieb.
9. **Ob Codex einem `nextCursor` in `tools/list` folgt** und **ob Codex auf
   `notifications/tools/list_changed` reagiert.** Unser Server bietet beides nicht an, der Fall
   ließ sich nicht auslösen. Messbar mit einem Testserver, der paginiert beziehungsweise nach dem
   Start ein Werkzeug nachschiebt, und einer Zählung der sichtbaren Namen in der Modellantwort.
10. **Ob der von Codex angezeigte Tokenzähler die `tools`-Sektion mitzählt.** Im gleich
    formulierten Kontrolllauf blieb er mit und ohne den Server bei exakt 4.083. Sauber nur mit
    Einblick in den Request-Body messbar, also mit einem Proxy.
11. **Die Obergrenze, ab der Codex Namespaces stillschweigend abschneidet.** Im Binary stehen
    „additional namespaces omitted.“ und „- Additional plugin capabilities omitted to fit the
    context limit.“; der auslösende Schwellwert ließ sich nicht ermitteln.
12. **Ob `enabled_tools`/`disabled_tools` in Codex nur die Aufrufbarkeit einschränken oder auch
    die Nachladbarkeit über die Suche.** Messbar mit einem Lauf mit `enabled_tools` auf zwei
    Werkzeugen und anschließender Frage, wie viele Namen das Modell sieht.
13. **Wie ChatGPT Web Connector-Werkzeuge in den Modellkontext legt und ob es eine Obergrenze je
    Connector gibt.** Von außen nicht messbar, in keiner offiziellen Quelle beschrieben. Die
    kursierenden 5.000 Token stammen aus dem Community-Forum ohne Bestätigung. Wer ChatGPT Web
    ernsthaft als Ziel erwägt, muss es selbst testen: entfernten Server im Developer mode
    verbinden und prüfen, ob die Verbindung alle Werkzeuge übernimmt.
14. **Paginierung und `list_changed` bei Windsurf, LM Studio und Jan; `list_changed` bei
    Continue.** Nicht quelloffen beziehungsweise nicht tief genug gelesen.
15. **Ob in Jan deaktivierte Werkzeuge tatsächlich ganz aus dem Request fallen.** Die Benennung
    `disabledToolKeys` und die Übergabe vor dem Laden sprechen dafür, bis in den Request hinein
    verfolgt wurde es nicht.
16. **Das Verhalten von Claude Code bei Bedrock, Vertex und Foundry.** Nur der Dokumentation
    entnommen, nicht gemessen. Für den lokalen Einsatz ohne Belang, für Unternehmenskunden
    relevant.
17. **Ob Claude Desktop eine Anzeige des Kontextverbrauchs hat.** Der Feature-Request `#20041`
    wurde im Februar 2026 ohne Umsetzungszusage geschlossen; eine Drittquelle zu einem stillen
    Rollout am 2026-05-09 ist nicht mehr abrufbar (HTTP 410). Im Bundle keine passenden Strings,
    was wenig aussagt, weil die Chat-Oberfläche eine gehostete Web-Ansicht ist. Nachprüfbar durch
    einen Blick in die laufende Anwendung; das wurde bewusst nicht getan, weil dort private
    Gesprächsinhalte sichtbar gewesen wären.
18. **Ob das administrative Einschränken einzelner Aktionen in einem Connector (Team-/Enterprise-
    Funktion „Restrict actions within connected services“) die Definition aus dem Kontext nimmt
    oder nur den Aufruf blockiert.** Relevant, falls wir Kunden mit Enterprise-Plänen haben.

### Zu unseren eigenen Zahlen

19. **Die tatsächliche Tokenzahl im Tokenizer der Claude-Linie.** `o200k_base` ist ein
    Stellvertreter. **Messbar über den `count_tokens`-Endpunkt der Messages API** mit unserem
    `tools`-Array. Das ist billig und sollte vor der Entscheidung geschehen.
20. **Der Widerspruch 197.528/197.583 gegen 206.577 Zeichen** (Abschnitt 4.1), rund 4,5 Prozent.
    **Nicht aufgelöst.** Messbar durch denselben `tools/list`-Handshake mit identischer
    Serialisierung und Zeichenzählung beider Rechenwege in einem Lauf.
21. **Wie groß die Einsparung durch kürzere Beschreibungen wirklich ausfällt.** Gemessen sind nur
    die Obergrenzen; die Prozentangaben in H2 und H4 sind **Schätzungen auf gemessener
    Grundlage**. Messbar, indem man eine gekürzte Fassung erzeugt und mit demselben Tokenizer
    gegenmisst.
22. **Der Zahlenwert der Konstante, ab der Claude Code Server-`instructions` kürzt.** Nur die
    Meldung „Server instructions truncated from X to Y chars“ ist belegt. Unsere 5.092 bis 5.760
    Zeichen liegen nach dem beobachteten Verhalten ungekürzt vor, **gemessen ist das nicht**.
    Messbar, indem man die `instructions` schrittweise verlängert und die Debug-Ausgabe beobachtet.
23. **Ob die `.mcpb`-Installationsoberfläche von Claude Desktop eine Umgebungsvariable für die
    Gruppenauswahl abfragen kann.** Entscheidend für die Wirksamkeit von H1 bei genau der
    Zielgruppe, für die das Bundle gedacht ist. Messbar durch Lesen des aktuellen
    `.mcpb`-Manifest-Schemas und einen Installationsversuch.
24. **Ob der Verlust des Prompt-Caches teurer ist als die eingesparten Definitionen**, wenn ein
    Server seine Werkzeugliste zur Laufzeit ändert. Die Herstellerdoku warnt davor, beziffert es
    aber nicht.
25. **Wie viele Clients die neue Regel aus 2026-07-28 schon umsetzen**, dass `list_changed` nur an
    Clients mit offenem `subscriptions/listen`-Strom geht. Entscheidet, ob eine Laufzeitänderung
    überhaupt irgendwo ankommt.
26. **Ob irgendein Client einen herstellereigenen Hinweis aus dem `_meta`-Feld einer
    Werkzeugdefinition liest, um sie zurückzustellen.** Das Feld existiert, aber es wurde kein
    Client gefunden, der so etwas auswertet, außer Claude Code mit `anthropic/alwaysLoad` und
    `anthropic/searchHint`. **Als allgemeinen Hebel nicht einplanen.**
27. **Ob und wie der MCP-Connector von Anthropic die Paginierung von `tools/list` bedient.** Nicht
    dokumentiert, nicht gemessen.
28. **Ob konkrete Clients `$ref` in `inputSchema` auflösen.** Nur öffentliche Fehlerberichte
    gelesen, keiner nachgestellt. Die Berichte reichen für „unzuverlässig“, nicht für eine Aussage
    über einen bestimmten Client zu einem bestimmten Stand.
29. **Keine eigene Laufzeitmessung des tatsächlichen Tokenverbrauchs in Cursor, Windsurf, Cline,
    LM Studio, Zed, Continue und Jan.** Ein solcher Versuch hätte fremde Software installiert oder
    Konfigurationen des Nutzers verändert, was untersagt war. **Messbar so:** den Server hinter
    einen protokollierenden MCP-Proxy hängen und je Client mitschreiben, wann `tools/list`
    aufgerufen wird; bei Clients mit eigenem Netzwerkzugriff genügt ein mitschneidender HTTP-Proxy
    vor dem Modellendpunkt, um das `tools`-Array der Modellanfrage zu sehen.

---

## 8. Die Widersprüche in der Recherche, unglättet

1. **Claude Desktop `On demand`: Doku gegen Nutzerberichte.** BELEGT sagt Anthropic, Connectors
   würden nicht geladen, bis Claude sucht. **VERMUTUNG** zweier unabhängiger Nutzerberichte sagt,
   im Chat passiere das nicht. Besser belegt ist die Doku; besser geprüft ist keines von beiden.
   Für eine Produktentscheidung ist die Lage **unentschieden**, und das ist unbequem, weil es der
   Auslieferungszustand des wichtigsten Zielclients betrifft.
2. **Claude Code: Schwelle oder keine Schwelle?** Eine Drittquelle nennt 10 Prozent des
   Kontextfensters ab Version 2.1.7, und die offizielle Doku enthält den Satz „When the total
   reaches 10% of the window, tool search activates“. GEMESSEN im Binary 2.1.270 prüft der
   Deferral-Zweig für `isMcp===true` **nichts**, und der Default-Modus ist `tst`, nicht
   `tst-auto`. **Die Messung ist besser belegt**: Der 10-Prozent-Satz gehört zum Modus `auto`, der
   nicht die Voreinstellung ist. Wer ihn als allgemeine Regel liest, irrt.
3. **Claude Desktop Chat und die Werkzeugsuche.** Der Bundle-Text nennt ausdrücklich „Cowork,
   Code, and Chat sessions“, was für eine Geltung auch im Chat spricht. Die Nutzerberichte
   sprechen dagegen. Der Bundle-Text steht im Kontext einer Einstellung, die auf
   Drittanbieter-Deployments beschränkt ist. **Ungeklärt**, vom Rechercheur selbst so benannt.
4. **Cursor, 40 Werkzeuge.** BELEGT aus Staff-Aussagen von 2025-06-24, **VERMUTUNG** der
   Gegenstandslosigkeit für 2026. Besser belegt ist die 40; besser plausibel ist die
   Gegenstandslosigkeit. **Das ist genau die Konstellation, in der gemessen werden muss statt
   entschieden.** Siehe 6a.
5. **Zeichenzahl unserer Definitionen**, 197.528/197.583 gegen 206.577. Besser belegt sind die
   ersten beiden (zwei unabhängige Messungen, beide mit Tokenzählung, Kontrollsumme getroffen).
   Siehe 4.1.
6. **Tokenzahl der `instructions`**, 1.259 gegen 1.329. **Kein echter Widerspruch**, sondern
   unterschiedlicher Schalterstand der gemessenen Instanz. Siehe 4.1.
7. **Werkzeuge zusammenlegen oder nicht.** BELEGT fällt die Trefferqualität jenseits von 30 bis 50
   Werkzeugen, was fürs Zusammenlegen spricht und E1 widerspricht. **Ebenfalls BELEGT** löst Tool
   Search genau dieses Problem, und GEMESSEN funktioniert eine Liste von rund 700 Werkzeugen in
   Claude Code. Beides ist richtig; es gilt für verschiedene Clients. Der Widerspruch ist echt und
   **gehört dem Projektinhaber vorgelegt**, nicht im Dossier wegargumentiert.
8. **Eine Drittquelle behauptet, Codex habe kein Deferred Loading** (`getunblocked.com`-Blogbeitrag).
   Das widerspricht der eigenen Messung und dem gemergten PR `openai/codex#29486` und ist
   **vermutlich veraltet**. Besser belegt sind Messung und PR.

---

## 9. Quellen

### Offizielle Dokumentation, alle abgerufen 2026-09-13

- `support.claude.com/en/articles/13730515-manage-claude-s-tool-access` — die drei Tool-Access-Modi,
  Geltung auch für Claude Desktop, Einstellung je Konversation, Schwellenempfehlungen
  unter 10 / 10-30 / 30+
- `support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work` — „Tools and
  connectors are token-intensive“
- `support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities`
- `support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop`
  — **Negativbefund:** keine Aussage zu Werkzeuggrenzen, Kontextverbrauch oder Unterschieden
  zwischen `.mcpb` und manueller Konfiguration
- `platform.claude.com/docs/en/agents-and-tools/tool-use/overview` — der `tools`-Parameter zählt
  als Input-Token
- `platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool` — `defer_loading`,
  30-50-Schwelle, ~55k-Token-Beispiel, 85 Prozent Einsparung, Grenzen 10.000/200/500, Suche über
  `argument names` und `argument descriptions`
- `platform.claude.com/docs/en/agents-and-tools/mcp-connector` — `mcp_toolset`, `default_config`,
  `configs`, `enabled`, `defer_loading`
- `platform.claude.com/docs/en/build-with-claude/structured-outputs` — lokale `$ref`/`$defs`
  unterstützt, externe nicht
- `code.claude.com/docs/en/agent-sdk/tool-search` — „Tool search is on by default“, Wertetabelle
  `ENABLE_TOOL_SEARCH`, „Maximum tools: 10,000“
- `code.claude.com/docs/en/mcp` — `alwaysLoad`, `/mcp`-Panel, `disabledMcpServers`, list_changed,
  `MAX_MCP_OUTPUT_TOKENS`, „Tool set to blocked“
- `anthropic.com/engineering/advanced-tool-use` (2025-11-24) und
  `anthropic.com/engineering/writing-tools-for-agents` (2025-09-11) — „More tools don't always lead
  to better outcomes“, Zusammenlegen, Namensräume, 25.000-Token-Grenze für Antworten
- `developers.openai.com/api/docs/guides/tools-tool-search` — Hosted vs. Client-executed Tool
  Search, „only gpt-5.4 and later models support tool_search“, „aim to keep each namespace to fewer
  than 10 functions“, Agents-API-Abschnitt zum Deferral
- `learn.chatgpt.com/docs/extend/mcp` — alle `mcp_servers`-Schlüssel, „ChatGPT web can use remote
  MCP-backed tools supplied by plugins“, 512-Zeichen-Hinweis zu `instructions`
- `learn.chatgpt.com/docs/config-file/config-advanced`
- `developers.openai.com/plugins/build/mcp-server`, `/plugins/plan/tools`,
  `/plugins/deploy/connect-chatgpt`
- `cursor.com/blog/dynamic-context-discovery` (2026-01-06) und `cursor.com/docs/context/mcp`
- `code.visualstudio.com/docs/copilot/agents/agent-tools` — „A chat request can have a maximum of
  128 tools enabled at a time.“
- `code.visualstudio.com/docs/copilot/customization/mcp-servers`,
  `code.visualstudio.com/api/extension-guides/ai/mcp`
- `docs.devin.ai/desktop/cascade/mcp` — „Cascade has a limit of 100 total tools“
  (`docs.windsurf.com` leitet per 307 dorthin)
- `lmstudio.ai/docs/developer/core/mcp` und `lmstudio.ai/docs/app/mcp` — `allowed_tools`, „fewer
  tool definitions“, Warnung vor „frequent context overflows“
- `modelcontextprotocol.io/specification/2026-07-28/server/tools.md` — MUST-NOT-vary-per-connection,
  deterministische Reihenfolge
- `modelcontextprotocol.io/specification/draft/server/tools` und `.../draft/basic/index` —
  `$ref`-Resolution, „MUST NOT automatically dereference“
- `modelcontextprotocol.io/specification/draft/server/utilities/pagination`,
  `.../2026-07-28/server/utilities/caching.md`, `.../2026-07-28/basic/patterns/subscriptions.md`
- `modelcontextprotocol.io/specification/2025-06-18/server/tools.md` und `.../2025-11-25/...` —
  zum Vergleich, die MUST-NOT-vary-Klausel fehlt dort
- `modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices.md` — progressive
  discovery, Schwelle 1-5 Prozent, Dreischichtmuster, Warnung zur Prompt-Cache-Entwertung
- `modelcontextprotocol.io/development/roadmap` (Seitenstand 2026-08-22) — „Progressive discovery“
- `raw.githubusercontent.com/anthropics/mcpb/main/MANIFEST.md` — das Feld `tools` im
  `.mcpb`-Manifest ist optional und rein deskriptiv

### GitHub, alle per API verifiziert

- `anthropics/claude-ai-mcp#401` (offen, 2026-06-04, Autor-Assoziation NONE, keine
  Anthropic-Antwort) — `On demand` deferre Connector-Schemata nicht
- `anthropics/claude-code#25892` (2026-02-15, geschlossen als `invalid`, falsches Repo) — gleiche
  Behauptung plus UI-Persistenzfehler
- `anthropics/claude-code#48964` (2026-04-16, geschlossen als `stale`) — „This conversation is too
  long to continue.“
- `anthropics/claude-code#19770` (2026-01-21, Duplikat) — Werkzeugnamen über 64 Zeichen
- `anthropics/claude-code#20041` (2026-01-22, geschlossen 2026-02-12) — Kontextanzeige in Desktop
- `openai/codex#29486` (gemerged 2026-06-22) — „Use tool search for MCP tools by default“,
  entfallene 100er-Schwelle, Rückfallebene
- `openai/codex#14507` (2026-03-12, geschlossen) — Ausgangszustand vor dem Deferral
- `openai/codex#13746` (2026-03-06, **offen**) — Array-Elemente hinter `$ref` werden verflacht
- `microsoft/vscode#254933`, `#253539`, `#290356`, `#248368` — 128er-Grenze in der Praxis
- `modelcontextprotocol/modelcontextprotocol#1888` (SEP, Draft, 2025-11-24) — Progressive Disclosure
- `google-gemini/gemini-cli#13142` (2025-11-15, behoben), `awslabs/mcp#2442`, `kirodotdev/Kiro#9165`,
  `mastra-ai/mastra#5583`, `quarkiverse/quarkus-mcp-server#539` — `$ref`-Probleme in Clients
- Cursor-Forum: Threads 165642 (Staff, 2026-07-14 und 2026-09-09), 108637 (Staff, 2025-06-24,
  40er-Grenze), 107844 (2025-06-23, „cannot see the 41st tool“), 153432 (2026-03-03, Ambassador,
  über 80 Werkzeuge)
- `appwrite.io/threads/1363649531752747242` (2025-04-20) — Windsurf-Fehlermeldung

### Gelesener Quelltext, jeweils nur lesend

- `/Applications/Claude.app/Contents/Resources/app.asar`, Version 1.52386.3 — 15 Aufrufstellen von
  `listTools`, kein Cursor, `toolSearchEnabled`, `tool-search-tool-2025-10-19`
- Claude Code 2.1.270, `/Users/dennismenken/.local/share/claude/versions/2.1.270` — `SY()`,
  `Xye()`, `GWe()`, `ToolSearch`-Schema, Paginierungsschleife mit `ar=20`, Metadatenschlüssel `jZ`,
  `/context`-Kategorien
- `/Applications/ChatGPT.app/Contents/Resources/codex` — BM25-Handler, `tools.deferred_namespaces`,
  Prompttext zu `tool_search`
- `/Applications/Visual Studio Code.app/.../extensions/copilot/dist/extension.js`,
  `.../copilot/package.json`, `.../package.nls.json`,
  `.../out/vs/workbench/workbench.desktop.main.js` — 128er-Grenze, `supportsToolSearch`,
  `defer_loading`, `tool_search`, `isNonDeferredTool`, `activate_`-Präfix, `sendRequestPaginated`,
  `notifications/tools/list_changed`
- `raw.githubusercontent.com/cline/cline/main/apps/vscode/src/services/mcp/McpHub.ts` und
  `.../sdk/sdk-mcp-coordinator.ts` (main, 2026-09-12)
- `raw.githubusercontent.com/zed-industries/zed/main/crates/agent/src/tools/context_server_registry.rs`,
  `.../crates/agent_settings/src/agent_profile.rs`, `.../assets/settings/default.json`
  (main, 2026-09-13)
- `raw.githubusercontent.com/continuedev/continue/main/core/config/profile/doLoadConfig.ts`,
  `.../core/context/mcp/MCPConnection.ts`, `.../gui/src/redux/selectors/selectActiveTools.ts`
  (main, 2026-09-13)
- `raw.githubusercontent.com/menloresearch/jan/main/web-app/src/lib/mcp-orchestrator/intent-classifier.ts`,
  `.../docs/src/pages/docs/desktop/mcp-routing-telemetry.mdx` (main, 2026-09-11)
- `node_modules/.pnpm/@modelcontextprotocol+server@2.0.0/.../dist/mcp-DXXb3Vv3.mjs` — `tools/list`
  ohne Cursor, Filter auf `enabled`
- `node_modules/.pnpm/@modelcontextprotocol+client@2.0.0/.../dist/index.mjs` — `_listAllPages`,
  `listMaxPages` Default 64

### Eigene Messungen am 2026-09-13

- `~/Library/Logs/Claude/mcp.log`: 41 `tools/list`-Aufrufe, 2026-09-05 bis 2026-09-11, vier
  stdio-Server, kein Cursor
- Direkter JSON-RPC-Handshake gegen `dist/cli.js`: 54 Werkzeuge, kein `nextCursor`,
  `capabilities {tools:{listChanged:false},resources:{listChanged:false}}`, `instructions` 5.336
  Zeichen
- Laufende Claude-Code-Sitzung 2.1.270: Deferral-Hinweis mit rund 700 Werkzeugnamen, Abschnitt
  `# MCP Server Instructions`, `ToolSearch` ausgeführt
- Vier ephemere `codex exec --ephemeral -s read-only` Sessions mit CLI-Overrides, ohne Änderung an
  der Nutzerkonfiguration; `codex --version` 0.153.4, `codex features list`, `codex mcp list --json`
- `claude mcp add/list/get/remove` in einem Wegwerfverzeichnis, anschließend restlos entfernt
- Tokenmessung mit `gpt-tokenizer@4.0.0`, `o200k_base`, über `renderToolDefinition` und
  `index.generated.ts`: Kontrollsumme 197.528 Zeichen und 48.305 Token getroffen, identisch zu
  `docs/entwicklung/befund-tokenbudget.md`
