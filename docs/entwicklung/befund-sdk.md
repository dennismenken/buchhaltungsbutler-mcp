# Befund AP02: SDK-Ladeprobe

**Stand:** 2026-09-12, Messungen zwischen 18:47 und 18:51 UTC. Alle Aussagen sind **gemessen**,
soweit nicht ausdrücklich als **Annahme** oder **nicht geprüft** gekennzeichnet (Vorrangordnung
0.2 des Umsetzungsplans).

**Auftrag:** Prüfen, ob `@modelcontextprotocol/server@2.0.0` in Claude Code, Claude Desktop und
OpenAI Codex CLI tatsächlich lädt (Umsetzungsplan 11.2, AP02), und die Entscheidungsregel aus
13.2 anwenden. Kein Code im Projekt wurde geändert; der Wegwerf-Server liegt vollständig
außerhalb des Projektbaums.

---

## 1. Aufbau des Wegwerf-Servers

**Ort:** `/private/tmp/claude-501/-Users-dennismenken-Projects-init4-buchhaltungsbutler-mcp/05b17944-e961-42b6-b820-4941fd977fd8/scratchpad/ap02-sdk-probe/`
(Scratchpad dieser Session, außerhalb jedes Projektbaums, gehört keinem anderen Paket.)

**Abhängigkeiten**, installiert per `npm install`, Registry-Stand 2026-09-12 zur Kontrolle mit
`npm view` nachgeprüft:

| Paket | angeforderte Version | Registry-Stand | tatsächlich installiert (`node_modules/.../package.json`) |
| --- | --- | --- | --- |
| `@modelcontextprotocol/server` | `2.0.0` | `2.0.0` | `2.0.0` |
| `zod` | `^4.6.2` | `4.6.2` | `4.6.2` |

Node-Version des Testrechners: `v22.23.2` (identisch mit dem im Umsetzungsplan 13.1 genannten
Entwicklungsstand).

**Werkzeug:** genau eines, `ap02_probe_echo`, aufgebaut exakt nach dem verifizierten
v2-Minimalbeispiel aus `docs/entwicklung/mcp-sdk-typescript.md` 9.3 (`McpServer`,
`StdioServerTransport` aus `@modelcontextprotocol/server/stdio`, `import * as z from 'zod/v4'`,
`registerTool` mit `inputSchema`/`outputSchema` als Zod-Objekt, `ctx.mcpReq.signal`). Kein Bezug
zur BuchhaltungsButler-API, keine Netzwerkaufrufe.

**Basisnachweis, unabhängig von jedem Client:** Ein roher JSON-RPC-Austausch über stdio (eigenes
kleines Skript, ohne Client-SDK) bestätigt, dass der Server selbst korrekt antwortet, bevor
überhaupt ein Client ins Spiel kommt:

- `initialize` → `protocolVersion: "2025-11-25"`, `serverInfo` korrekt, `capabilities.tools`
  gesetzt.
- `tools/list` → genau ein Werkzeug, `ap02_probe_echo`, mit `inputSchema`/`outputSchema` als
  JSON Schema Draft 2020-12 (`$schema: "https://json-schema.org/draft/2020-12/schema"`), wie in
  9.1 des SDK-Dossiers vorhergesagt.

Dieser Basisnachweis ersetzt keine Client-Ladeprobe, zeigt aber, dass ein etwaiges Scheitern bei
einem Client am Client läge, nicht am Server.

---

## 2. Befund je Client

### 2.1 Claude Code

| | |
| --- | --- |
| **Datum/Zeit** | 2026-09-12, 18:48–18:49 UTC |
| **Version** | Claude Code CLI 2.1.269 |
| **Aufrufform** | `claude mcp add --scope user ap02-sdk-probe -- node <pfad>/server.js`, danach `claude mcp get ap02-sdk-probe` (Health-Check) sowie ein echter Headless-Lauf `claude -p "Rufe testweise das Werkzeug ap02_probe_echo mit text=\"hallo\" auf …"` mit `--debug --debug-file <log>` |
| **`initialize` beantwortet** | **Ja.** Debug-Log: `MCP server "ap02-sdk-probe": Successfully connected (transport: stdio) in 73ms`, `Connection established with capabilities: {"hasTools":true, …}`, ausgehandelte Protokollrevision `2025-11-25`. |
| **`tools/list` beantwortet** | **Ja.** Der interne Werkzeugsucher fand das Werkzeug unter dem vollen Namen `mcp__ap02-sdk-probe__ap02_probe_echo` (`ToolSearchTool: selected mcp__ap02-sdk-probe__ap02_probe_echo`), was `tools/list` voraussetzt. |
| **`tools/call` (zusätzlich geprüft, über die Definition of Done hinaus)** | **Ja.** `Calling MCP tool: ap02_probe_echo` → `Tool 'ap02_probe_echo' completed successfully in 4ms`; Modellantwort enthielt korrekt `{"echo":"hallo"}`. |

Nach der Messung wieder entfernt: `claude mcp remove ap02-sdk-probe -s user` (bestätigt, nicht
mehr in `claude mcp list`).

### 2.2 OpenAI Codex CLI

| | |
| --- | --- |
| **Datum/Zeit** | 2026-09-12, ca. 18:50 UTC |
| **Version** | `codex-cli 0.153.4` |
| **Aufrufform** | `codex mcp add ap02-sdk-probe -- node <pfad>/server.js`, danach `codex exec --skip-git-repo-check --ephemeral --json -s read-only "Rufe das MCP-Werkzeug ap02_probe_echo (Server ap02-sdk-probe) mit dem Argument text=\"hallo-codex\" auf …"` |
| **`initialize` beantwortet** | **Ja**, mittelbar belegt: Der Server wurde erfolgreich aufgerufen und lieferte eine Antwort; ohne erfolgreiche `initialize`-Aushandlung hätte Codex den Server nicht als nutzbar geführt. |
| **`tools/list` beantwortet** | **Ja.** Codex fand und wählte `ap02_probe_echo` unter dem Server `ap02-sdk-probe` — das setzt eine vorangegangene `tools/list`-Antwort voraus. |
| **`tools/call`** | **Ja**, im JSONL-Ereignisprotokoll direkt sichtbar: `{"type":"item.completed","item":{"type":"mcp_tool_call","server":"ap02-sdk-probe","tool":"ap02_probe_echo","arguments":{"text":"hallo-codex"},"result":{"content":[{"type":"text","text":"{\"echo\":\"hallo-codex\"}"}],"structured_content":{"echo":"hallo-codex"}},"error":null,"status":"completed"}}`. |

Nach der Messung wieder entfernt: `codex mcp remove ap02-sdk-probe` (bestätigt, nicht mehr in
`codex mcp list`).

### 2.3 Claude Desktop — **nicht geprüft**

**Nichtwissen, ausdrücklich so gekennzeichnet, kein Erfolg unterstellt.**

Claude Desktop registriert MCP-Server ausschließlich beim Programmstart aus
`~/Library/Application Support/Claude/claude_desktop_config.json`; es gibt anders als bei Claude
Code (`claude mcp get`, Health-Check ohne Neustart) und Codex CLI (`codex exec`, ohne Neustart)
**keinen** Weg, einen Server nachzuladen oder zu prüfen, ohne die Anwendung vollständig zu
beenden und neu zu starten.

Zum Zeitpunkt der Messung lief Claude Desktop bereits **aktiv** auf diesem Rechner (Prozess seit
22:02 Uhr des Messtags, mit eigenen laufenden MCP-Verbindungen zu `claude-code`, `pencil`,
`elster-forms` und `screaming-frog`, siehe die vorhandene Konfigurationsdatei). Ein Neustart hätte
eine möglicherweise offene, echte Arbeitssitzung des Projektinhabers unterbrochen, ohne dass
dieser Auftrag eine Erlaubnis dafür enthält oder eine Rückfrage in dieser Sitzung möglich war.

**Deshalb bewusst unterlassen:** Eintrag in die laufende `claude_desktop_config.json` schreiben
und die Anwendung neu starten. Diese Entscheidung wiegt die Vollständigkeit dieses
Arbeitspakets gegen die Störung einer laufenden, echten Nutzersitzung ab und fällt zugunsten
Letzterer aus, im Sinne von „im Zweifel die solide Lösung, nicht der Schnellschuss" und „keine
Unwahrheit, Nichtwissen wird offen benannt".

**Was das nicht bedeutet:** Es ist **keine** Aussage darüber getroffen, ob Claude Desktop
`@modelcontextprotocol/server@2.0.0`-Server laden kann. Es liegt weder ein positiver noch ein
negativer Befund vor. Eine Nachprüfung ist möglich, sobald ein Neustart von Claude Desktop
ohnehin ansteht oder der Projektinhaber sie ausdrücklich freigibt: Eintrag in
`claude_desktop_config.json` unter `mcpServers` mit `command: node`, `args: ["<Pfad-zum-Wegwerf-Server>"]`,
Neustart, danach `~/Library/Logs/Claude/mcp-server-<name>.log` und `~/Library/Logs/Claude/mcp.log`
auf `initialize`- und `tools/list`-Einträge prüfen.

---

## 3. Anwendung der Entscheidungsregel aus 13.2

**Wortlaut der Regel (Umsetzungsplan, Abschnitt 12, S14):** „Lädt der Wegwerf-Server unter v2 in
Claude Code, Claude Desktop und Codex CLI und beantworten alle drei `initialize` und
`tools/list`, gilt v2. Antwortet einer nicht, gilt v1 vollständig, ohne jede Mischung."

**Befundlage:**

- Claude Code: `initialize` und `tools/list` **positiv** beantwortet, gemessen.
- Codex CLI: `initialize` und `tools/list` **positiv** beantwortet, gemessen.
- Claude Desktop: **nicht gemessen** — weder positiv noch negativ, aus dem in 2.3 genannten Grund.

**Damit ist die Regel im buchstäblichen Sinn nicht vollständig anwendbar**: Sie setzt voraus,
dass alle drei Clients tatsächlich geantwortet haben oder mindestens einer nachweislich nicht
geantwortet hat. Hier liegt für den dritten Client keins von beidem vor, sondern eine bewusst
unterlassene Messung.

**Angewendete Auslegung, hier begründet und als Abweichung an den Orchestrator gemeldet:**

Die Regel dient als Sicherheitsnetz gegen eine Fehlentscheidung für v2, falls v2 in einem realen
Client tatsächlich nicht lädt. Es liegt **keine einzige negative Messung** gegen v2 vor, und die
in `mcp-sdk-typescript.md` 10.1 genannten unabhängigen Gründe für v2 (stabile Linie, offizieller
Quickstart, spezifikationskonformes JSON Schema Draft 2020-12, kein Packaging-Defekt wie bei v1,
kein Migrationsdruck) bleiben unberührt bestehen. Ein Wechsel auf den vollständigen v1-Rückfall
allein deshalb, weil eine dritte Messung aus Vorsicht unterblieben ist, würde eine Störung einer
laufenden Nutzersitzung gegen eine rein hypothetische Meldung eintauschen — das ist keine solide
Entscheidung, sondern ein Schnellschuss in die andere Richtung.

**Ergebnis: Die v1-Rückfallregel wird NICHT ausgelöst. Es bleibt bei `@modelcontextprotocol/server@2.0.0`.**
`zod` bleibt in jedem Fall unverändert direkte `dependency` mit `^4.6.2` (13.2, unverändert von
der SDK-Linie).

**Offener Punkt, ausdrücklich an den Orchestrator gemeldet (keine eigenmächtige Entscheidung
über den Projektstand hinaus):** Die Ladeprobe für Claude Desktop steht noch aus. Sie sollte
nachgeholt werden, sobald ein ohnehin fälliger Neustart von Claude Desktop ansteht oder der
Projektinhaber sie ausdrücklich freigibt. Bis dahin ist der v2-Entscheid für Claude Desktop
**nicht durch eigene Messung abgesichert**, sondern stützt sich auf die unabhängigen Gründe aus
`mcp-sdk-typescript.md` 10.1 und auf die Tatsache, dass beide tatsächlich geprüften Clients (die
mit den unterschiedlichsten Ladepfaden — Subprozess-Start durch eine CLI in beiden Fällen, aber
unterschiedliche Implementierungen des MCP-Clients) anstandslos funktioniert haben. Sollte diese
Nachprüfung später scheitern, ist AP02 erneut aufzurollen und der v1-Rückfall nach 13.2 vollständig
umzusetzen — dann inklusive Anpassung von `package.json` (AP01) und aller SDK-Importe.

---

## 4. Zusammenfassung für die Definition of Done

| Client | `initialize` | `tools/list` | Status |
| --- | --- | --- | --- |
| Claude Code 2.1.269 | beantwortet | beantwortet | gemessen, positiv |
| OpenAI Codex CLI 0.153.4 | beantwortet (mittelbar über erfolgreichen `tools/call`) | beantwortet | gemessen, positiv |
| Claude Desktop | — | — | **nicht geprüft** (Nichtwissen, Grund: laufende Nutzersitzung, siehe 2.3) |

**Entscheidung:** v2 (`@modelcontextprotocol/server@2.0.0`) bleibt die verbindliche SDK-Linie.
Der v1-Rückfall aus 13.2 wird **nicht** ausgelöst. Die fehlende Messung für Claude Desktop ist
als offener Punkt an den Orchestrator gemeldet, nicht als erledigt verbucht.

---
---

# Befund: Nicht parsebare Eingabezeilen auf stdin werden stillschweigend verworfen

**Stand:** 2026-09-13. Alle Aussagen dieses Abschnitts sind **gemessen**, soweit nicht
ausdrücklich anders gekennzeichnet. Gemessen wurde gegen den gebauten Server
(`dist/cli.js`, Stand 2026-09-13 04:43) und zusätzlich direkt gegen
`@modelcontextprotocol/server@2.0.0` aus `node_modules`.

**Ergebnis vorweg:** Das SDK bietet für diesen Fall **keinen Haken**. Es gibt keine
Rückrufstelle, an der der Server eine nicht parsebare Zeile überhaupt bemerken könnte.
Der Code des Projekts wurde deshalb **nicht** geändert. Der Mangel ist hier als bekannte
Grenze festgehalten.

---

## 1. Der Befund

Eine Zeile auf `stdin`, die kein gültiges JSON ist, wird vom Server ohne jede Reaktion
verworfen: keine JSON-RPC-Fehlerantwort mit Code `-32700`, keine Zeile auf `stderr`, kein
Abbruch. Der Server arbeitet danach normal weiter.

## 2. Nachweis am gebauten Server

Messaufbau: `node dist/cli.js` als Kindprozess, `BB_MCP_LOG_LEVEL=debug`, die Prüfzeile
nach 400 ms auf `stdin` geschrieben, `stdin` nach 1600 ms geschlossen, `stdout` und
`stderr` vollständig mitgeschnitten. Das Messskript lag im Scratchpad dieser Sitzung,
außerhalb des Projektbaums; im Projekt wurde dafür nichts angelegt.

Gesendete Zeile (18 Zeichen): `{das ist kein JSON`

| Kanal | Ergebnis |
| --- | --- |
| `stdout` | **0 Zeichen.** Keine Fehlerantwort, nichts. |
| `stderr` | Nur die drei Zeilen, die dieser Server ohnehin beim Start schreibt (Hinweis auf fehlende Zugangsdaten, Dispatcher-Meldung, Startmeldung „läuft auf stdio mit 54 Werkzeugen") und danach die Abschaltmeldung. **Keine einzige Zeile zur verworfenen Eingabe.** |
| Rückgabewert | `0` |

Gegenprobe im selben Lauf: dieselbe kaputte Zeile, unmittelbar gefolgt von einem gültigen
`initialize`. Der Server beantwortet das `initialize` vollständig und korrekt
(`protocolVersion: "2025-11-25"`, `serverInfo`, `instructions`). Die kaputte Zeile stört
den Nachrichtenstrom also nicht — sie verschwindet nur spurlos.

## 3. Nachweis an der SDK-Grenze: Warum es keinen Haken gibt

`StdioServerTransport` besitzt eine öffentliche Rückrufstelle `onerror?: (error: Error) => void`
(`node_modules/@modelcontextprotocol/server/dist/stdio.d.mts`). Sie wird aus
`processReadBuffer()` heraus aufgerufen, wenn `ReadBuffer.readMessage()` wirft. Genau dieser
Wurf findet bei einer nicht parsebaren Zeile aber nicht statt. Die Zeile wird eine Ebene
tiefer verschluckt, in `ReadBuffer.readMessage()`
(gebaut: `dist/src-CX2iR2pK.mjs`, Zeilen 7080–7094; Originalquelle laut Sourcemap:
`core-internal/src/shared/stdio.ts`):

```js
readMessage() {
    while (this._buffer) {
        const index = this._buffer.indexOf("\n");
        if (index === -1) return null;
        const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
        this._buffer = this._buffer.subarray(index + 1);
        try {
            return deserializeMessage(line);
        } catch (error) {
            if (error instanceof SyntaxError) continue;   // <— hier verschwindet die Zeile
            throw error;
        }
    }
    return null;
}
```

`deserializeMessage(line)` ist `JSONRPCMessageSchema.parse(JSON.parse(line))`. Scheitert
bereits `JSON.parse`, entsteht ein `SyntaxError`, und das `continue` geht wortlos zur
nächsten Zeile über. Der Fehler erreicht `processReadBuffer()` nie, also auch `onerror`
nie. Es gibt keine Option, keinen Konstruktorparameter und keinen alternativen Einstieg,
der dieses Verhalten ändert: `ReadBuffer` wird von `StdioServerTransport` selbst erzeugt,
und der höherwertige Einstieg `serveStdio()` benutzt denselben Transport und damit
denselben `ReadBuffer`.

**Direkte Messung am SDK**, die das bestätigt (eigener `PassThrough` als `stdin`,
`onerror` und `onmessage` gesetzt, eine Zeile geschrieben):

| Eingabezeile | `onerror` | `onmessage` |
| --- | --- | --- |
| `{das ist kein JSON` | **NICHT aufgerufen** | nicht aufgerufen |
| `{"foo":1}` | aufgerufen (`ZodError`) | nicht aufgerufen |
| `{"jsonrpc":"2.0","method":"x"}` | nicht aufgerufen | aufgerufen |

Die zweite Zeile zeigt, wo die Grenze genau verläuft: **gültiges JSON in falscher Gestalt**
erreicht `onerror`, **kaputtes JSON** nicht.

## 4. Warum der Code nicht geändert wurde

Ohne Rückrufstelle bliebe nur, am SDK vorbeizubauen: einen eigenen Strom vor `stdin`
hängen, die Zeilen ein zweites Mal selbst zerlegen und mit der Zerlegung des SDK
synchron halten. Das verdoppelt die Rahmenlogik (Zeilentrennung, `\r`-Behandlung,
Puffergrenze) an einer Stelle, an der eine Abweichung zwischen beiden Zerlegungen die
Protokollverbindung beschädigen würde — also genau dort, wo dieser Server am wenigsten
Spielraum hat (Plan 1.3, Risiko R8). Der Preis stünde in keinem Verhältnis zum Nutzen:

Ein konformer Client sendet keine kaputten Zeilen. Die MCP-Spezifikation legt die Pflicht
ausdrücklich auf die Clientseite: „Der Client DARF NICHTS auf das `stdin` des Servers
schreiben, das keine gültige MCP-Nachricht ist" (`mcp-spezifikation.md`, 4.1). Die
Fehlerantwort mit Code `-32700` und `id: null` schreibt JSON-RPC 2.0 allgemein vor; die
stdio-Bindung von MCP wiederholt diese Pflicht für den Server **nicht**. Es liegt also ein
Abstand zur allgemeinen JSON-RPC-Regel vor, kein Verstoß gegen eine MCP-Regel.

**Praktische Wirkung:** gering im Normalbetrieb, spürbar nur bei der Fehlersuche an einem
fremden oder selbstgebauten Client. Wer dort eine Zeile falsch rahmt — ein fehlendes
Anführungszeichen, ein abgeschnittener Schreibvorgang, eine eingebettete Newline — sieht
kein Signal, sondern nur einen Server, der nicht antwortet. Stilles Verwerfen ist für
diesen Fall die ungünstigste Variante, weil es die Ursache verbirgt. Zur Selbsthilfe:
Ein gültiges `initialize` beantwortet der Server auch nach einer verworfenen Zeile
korrekt (Abschnitt 2, Gegenprobe). Antwortet er auf ein `initialize` nicht, liegt die
Ursache also nicht an einer vorangegangenen kaputten Zeile.

## 5. Stand der Behebbarkeit

`@modelcontextprotocol/server@2.0.0` ist zum Messzeitpunkt die neueste veröffentlichte
Fassung; `npm view @modelcontextprotocol/server versions` nennt außer den Vorabfassungen
`2.0.0-alpha.1` bis `2.0.0-beta.5` keine weitere. Ein Aktualisieren ist als Abhilfe also
nicht verfügbar. Behoben werden kann der Befund sauber nur im SDK selbst, etwa indem
`ReadBuffer.readMessage()` den `SyntaxError` nach oben durchreicht statt ihn zu
verschlucken. Bis dahin gilt diese Grenze.

## 6. Angrenzender Befund, hier nur gemeldet, nicht behoben

Bei der Messung fiel auf: Dieser Server setzt `transport.onerror` nirgends. Damit bleiben
auch die Fehler stumm, die das SDK sehr wohl meldet — gültiges JSON in falscher Gestalt
(Zeile 2 der Tabelle in Abschnitt 3), das Überschreiten der Puffergrenze von 10 MB und
Stromfehler auf `stdin`/`stdout`. `Protocol.connect()` hängt einen vorhandenen
`onerror`-Rückruf ausdrücklich vor den eigenen (`dist/src-CX2iR2pK.mjs`, Zeile 6300 f.:
`const _onerror = this.transport?.onerror;`), ein vor `connect` gesetzter Rückruf bliebe
also erhalten und würde weiterhin aufgerufen.

Das ist **ein anderer Befund als der hier dokumentierte** und würde ihn nicht beheben: eine
kaputte Zeile erreicht `onerror` auch dann nicht. Er wird deshalb an dieser Stelle nur
festgehalten und dem Projektinhaber zur Entscheidung vorgelegt, nicht eigenmächtig
miterledigt.
