# Installation und Einbindung in MCP-Clients

Nachschlagewerk für die Auslieferung des inoffiziellen BuchhaltungsButler-MCP-Servers.
Adressat ist ein Implementierungs-Agent, der ohne Rückfragen arbeiten soll.

**Stand:** 2026-09-12. Alle externen Quellen wurden am 2026-09-12 abgerufen.

**Nachtrag vom 2026-09-13 — der Name des Eintrags.** Jeder Block in diesem Dokument trägt den
Eintragsnamen `bbutler`. Er lautete bis zum 2026-09-13 `buchhaltungsbutler` und wurde gekürzt,
weil ein Wirt ihn vor jeden Werkzeugnamen hängt (`mcp__<eintrag>__<werkzeug>`) und die Messages
API dort höchstens 64 Zeichen zulässt: `mcp__buchhaltungsbutler__bb_postings_create_for_transaction_batch`
kam auf 65. Maßgeblich ist `SERVER_NAME` in `src/cli/clients/types.ts`; geprüft wird die Grenze
in `test/registry/name-length.test.ts`. Die Blöcke hier sind entsprechend nachgezogen — nur die
Kandidatenliste in 15.5 nicht, dort geht es um **Paket**namen und nicht um den Eintrag.

---

## Inhalt

1. [Quellenlage](#1-quellenlage)
2. [Überblick: was welcher Client kann](#2-überblick-was-welcher-client-kann)
3. [Claude Code](#3-claude-code)
4. [Claude Desktop](#4-claude-desktop)
5. [OpenAI Codex CLI](#5-openai-codex-cli)
6. [ChatGPT](#6-chatgpt)
7. [Grok und xAI](#7-grok-und-xai)
8. [Cursor](#8-cursor)
9. [Visual Studio Code mit GitHub Copilot](#9-visual-studio-code-mit-github-copilot)
10. [Weitere Clients](#10-weitere-clients)
11. [Generische Form für beliebige Clients](#11-generische-form-für-beliebige-clients)
12. [Startvarianten: npx, globale Installation, lokaler Klon](#12-startvarianten-npx-globale-installation-lokaler-klon)
13. [Übergabe der Zugangsdaten](#13-übergabe-der-zugangsdaten)
14. [Entwurf für einen Einrichtungsassistenten](#14-entwurf-für-einen-einrichtungsassistenten)
15. [Der Paketname: Entscheidung und Namenskonflikt auf npm](#15-der-paketname-entscheidung-und-namenskonflikt-auf-npm)
16. [Offene Punkte und Annahmen](#16-offene-punkte-und-annahmen)
17. [Textbausteine für die README](#17-textbausteine-für-die-readme)

---

## 1. Quellenlage

| Kürzel | Quelle | Art | Abrufdatum |
| --- | --- | --- | --- |
| `CC-MCP` | https://code.claude.com/docs/en/mcp (Rohfassung über `https://code.claude.com/docs/en/mcp.md`, 1495 Zeilen) | Offizielle Doku | 2026-09-12 |
| `CC-LIVE` | Eigener Aufruf von `claude mcp add --help` und `claude --version`; `2.1.269 (Claude Code)` | Messung am installierten Binary | 2026-09-12 |
| `MCP-LOCAL` | https://modelcontextprotocol.io/docs/develop/connect-local-servers | Offizielle Doku | 2026-09-12 |
| `MCPB-GUIDE` | https://claude.com/docs/connectors/building/mcpb | Offizielle Doku | 2026-09-12 |
| `MCPB-REPO` | https://github.com/modelcontextprotocol/mcpb | Spezifikation und CLI | 2026-09-12 |
| `CODEX-MCP` | https://learn.chatgpt.com/docs/extend/mcp?surface=cli (Rohfassung über `.md?surface=cli`) | Offizielle Doku | 2026-09-12 |
| `CODEX-LIVE` | Eigene Aufrufe von `codex mcp --help`, `codex mcp add --help`, `codex mcp list/get/remove --help`; `codex-cli 0.153.4` | Messung am installierten Binary | 2026-09-12 |
| `CODEX-CFG` | Struktur der lokalen Datei `~/.codex/config.toml` (nur Schlüssel ausgewertet, alle Werte redigiert) | Messung | 2026-09-12 |
| `TUNNEL` | https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md | Offizielle Doku | 2026-09-12 |
| `XAI-MCP` | https://docs.x.ai/build/features/mcp-servers | Offizielle Doku | 2026-09-12 |
| `GROK-LIVE` | Eigene Aufrufe von `grok mcp --help` und `grok mcp add --help`; `grok 1.0.25 (f7e67d6988e2) [stable]` | Messung am installierten Binary | 2026-09-12 |
| `CURSOR-MCP` | https://cursor.com/docs/context/mcp | Offizielle Doku | 2026-09-12 |
| `VSCODE-MCP` | https://code.visualstudio.com/docs/copilot/customization/mcp-servers (Seitenstand 9/9/2026) | Offizielle Doku | 2026-09-12 |
| `VSCODE-REF` | https://code.visualstudio.com/docs/agents/reference/mcp-configuration | Offizielle Doku | 2026-09-12 |
| `WINDSURF-MCP` | https://docs.windsurf.com/windsurf/cascade/mcp, weitergeleitet auf https://docs.devin.ai/desktop/cascade/mcp | Offizielle Doku | 2026-09-12 |
| `ZED-MCP` | https://zed.dev/docs/ai/mcp | Offizielle Doku | 2026-09-12 |
| `CLINE-MCP` | https://docs.cline.bot/mcp/configuring-mcp-servers | Offizielle Doku | 2026-09-12 |
| `CONTINUE-MCP` | https://docs.continue.dev/customize/deep-dives/mcp | Offizielle Doku | 2026-09-12 |
| `LMSTUDIO-MCP` | https://lmstudio.ai/docs/app/plugins/mcp und https://lmstudio.ai/docs/app/mcp | Offizielle Doku | 2026-09-12 |
| `JAN-MCP` | https://www.jan.ai/docs/desktop/mcp und https://www.jan.ai/docs/desktop/integrations/mcp-servers | Offizielle Doku, nur über Suchtreffer ausgewertet | 2026-09-12 |
| `NPM-REG` | Direkte HTTP-Abfragen von `https://registry.npmjs.org/<name>` für `buchhaltungsbutler-mcp`, `@dennismenken/buchhaltungsbutler-mcp`, `bb-mcp`, `bbutler-mcp`, `bbutler`, `bbutler`, `mcp-buchhaltungsbutler`, `buchhaltungsbutler-mcp-server`, `bb-buchhaltungsbutler` | Messung an der npm-Registry | 2026-09-12 |
| `WEB-CHECK` | HTTP-Statusabfragen von `https://github.com/dennismenken`, `https://github.com/dennismenken/buchhaltungsbutler-mcp` und `https://www.npmjs.com/~dennismenken` | Messung | 2026-09-12 |
| `DOC-GRUNDLAGEN` | `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/grundlagen.md` | Projektinterne Doku | 2026-09-12 |
| `LOCAL-NODE` | Eigene Messung: `node --version` = v22.23.2, `npm --version` = 10.9.8, Laufzeit von `npx --version` | Messung | 2026-09-12 |
| `LOCAL-NPM` | Quelltext der lokal installierten npm-Fassung 10.9.8, Datei `libnpmexec/lib/get-bin-from-manifest.js`, sowie die Ausgabe von `npx --help` | Messung am installierten Werkzeug | 2026-09-12 |
| `LOCAL-YAML` | Eigene Prüfung des YAML-Verhaltens bei `@` am Anfang eines Skalars, PyYAML 6.0.3 | Messung | 2026-09-12 |

Konvention: Aussagen ohne Quellenangabe sind aus den genannten Quellen abgeleitete Schlussfolgerungen
oder Projektentscheidungen. Wo etwas weder belegt noch geprüft ist, steht ausdrücklich
**nicht verifiziert** oder **Annahme**.

---

## 2. Überblick: was welcher Client kann

**Zum Paketnamen, bevor irgendein Block aus diesem Dokument kopiert wird.** Der ungescopte
npm-Name `buchhaltungsbutler-mcp` ist auf npm bereits vergeben und ist nicht unser Paket.
Unser Paket heißt **`@dennismenken/buchhaltungsbutler-mcp`** und stellt das Kommando
`bbutler-mcp` bereit. Jeder npx-Aufruf in diesem Dokument lautet deshalb
`npx -y @dennismenken/buchhaltungsbutler-mcp`, jeder Aufruf nach fester Installation
`bbutler-mcp`.
Ein Block, in dem der Name ohne den Namensraum `@dennismenken/` steht, startet fremden Code
und übergibt ihm die Zugangsdaten des Nutzers. Die Belege, der abweichende Name des Binaries
und der offene Pflichtschritt vor der ersten Veröffentlichung stehen in Abschnitt 15.

Der BuchhaltungsButler-MCP-Server ist ein lokaler stdio-Server. Die zentrale Frage je Client
lautet deshalb: Kann dieser Client einen lokalen Prozess starten und über stdin/stdout sprechen?

| Client | stdio lokal | Konfigurationsweg | Kommandozeilenbefehl vorhanden |
| --- | --- | --- | --- |
| Claude Code | ja | `claude mcp add`, `.mcp.json`, `~/.claude.json` | ja, `claude mcp add` |
| Claude Desktop | ja | `claude_desktop_config.json` oder `.mcpb`-Bundle | nein, aber Ein-Klick über `.mcpb` |
| OpenAI Codex CLI | ja | `~/.codex/config.toml`, `.codex/config.toml` | ja, `codex mcp add` |
| ChatGPT Desktop-App | ja | teilt sich die Codex-Konfiguration | ja, über `codex mcp add` |
| ChatGPT im Web | nein | nur entfernte Server über Plugins oder Secure MCP Tunnel | nein |
| Grok Build (xAI) | ja | `~/.grok/config.toml`, `./.grok/config.toml` | ja, `grok mcp add` |
| Cursor | ja | `.cursor/mcp.json`, `~/.cursor/mcp.json` | nein, Datei oder Oberfläche |
| VS Code mit Copilot | ja | `.vscode/mcp.json`, Nutzerprofil | ja, `code --add-mcp` |
| Windsurf (Cascade) | ja | `~/.codeium/windsurf/mcp_config.json` | nicht belegt |
| Zed | ja | `settings.json`, Schlüssel `context_servers` | nicht belegt |
| Cline | ja | `~/.cline/mcp.json` (CLI) oder Oberfläche (IDE) | teilweise |
| Continue | ja | `.continue/mcpServers/*.yaml` oder `config.yaml` | nicht belegt |
| LM Studio | ja (ab 0.3.17) | `~/.lmstudio/mcp.json` | nein |
| Jan | ja | Oberfläche, Settings > MCP Servers | nicht belegt |

Die einzige Plattform in dieser Liste, auf der ein lokaler stdio-Server grundsätzlich nicht
funktioniert, ist ChatGPT im Browser. Details in Abschnitt 6.

---

## 3. Claude Code

Quellen: `CC-MCP`, `CC-LIVE`.

### 3.1 Der Befehl

```bash
claude mcp add [options] <name> -- <command> [args...]
```

Abweichung zwischen Doku und Binary: `claude mcp add --help` gibt die Usage-Zeile als

```
Usage: claude mcp add [options] <name> <commandOrUrl> [args...]
```

aus (`CC-LIVE`, Claude Code 2.1.269, geprüft 2026-09-12), also ohne den Trenner `--`. Das
ist kein Widerspruch in der Sache: Die Binary-Fassung ist die allgemeine Form, die auch den
Fall eines entfernten Servers abdeckt, bei dem statt eines Befehls eine URL steht. Für
lokale stdio-Server bleibt die in `CC-MCP` gezeigte Form mit `--` die belastbare, weil nur
sie verhindert, dass Flags des Serverbefehls von Claude Code beansprucht werden; die
eingebauten Beispiele derselben Hilfeausgabe schreiben stdio-Server ebenfalls mit `--`
(etwa `claude mcp add my-server -e API_KEY=xxx -- npx my-mcp-server`).

Für unseren Server, Beispiel mit Umgebungsvariablen aus der aktuellen Shell:

```bash
claude mcp add \
  --env BB_API_CLIENT="$BB_API_CLIENT" \
  --env BB_API_SECRET="$BB_API_SECRET" \
  --env BB_API_KEY="$BB_API_KEY" \
  --transport stdio --scope user bbutler \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Die relevanten Flags:

| Flag | Kurzform | Bedeutung | Werte |
| --- | --- | --- | --- |
| `--transport` | `-t` | Transportart | `http`, `sse`, `stdio` ¹ |
| `--scope` | `-s` | Ablageort der Konfiguration | `local` (Vorgabe), `project`, `user` |
| `--env` | `-e` | Umgebungsvariable für den Serverprozess, wiederholbar | `KEY=value` |
| `--header` | `-H` | HTTP-Header, nur für entfernte Server | `Key: value` |
| `--` | | Trenner zwischen Claude-Optionen und Serverbefehl | |

¹ `--transport` akzeptiert ausschließlich diese drei Werte. Die Hilfeausgabe lautet wörtlich
`-t, --transport <transport>  Transport type (stdio, sse, http). Defaults to stdio if not
specified.` (`CC-LIVE`, `claude mcp add --help`, Claude Code 2.1.269, geprüft 2026-09-12).
Der WebSocket-Transport `ws` existiert, lässt sich aber ausschließlich über die
JSON-Konfiguration setzen, also über `.mcp.json`, `~/.claude.json` oder
`claude mcp add-json`, jeweils mit `"type": "ws"`. `CC-MCP` sagt das ausdrücklich:
"The `claude mcp add --transport` flag doesn't accept `ws`." Ein Aufruf
`claude mcp add -t ws …` läuft daher in einen Fehler. Form laut `CC-MCP`:

```bash
claude mcp add-json events-server \
  '{"type":"ws","url":"wss://mcp.example.com/socket","headers":{"Authorization":"Bearer PLATZHALTER_TOKEN"}}'
```

Ein `ws`-Eintrag nimmt dieselben Felder wie `http` an: `url`, `headers`, `headersHelper`,
`timeout`, `alwaysLoad`; die Authentifizierung läuft nur über Header, OAuth gibt es nicht.
Für unseren lokalen stdio-Server ist `ws` ohne Belang und hier nur der Vollständigkeit
halber aufgeführt.

Zwei Fallstricke, beide ausdrücklich in `CC-MCP` genannt:

1. Der Trenner `--` ist für stdio-Server zwingend. Ohne ihn versucht Claude Code, die Flags des
   Servers als eigene Optionen zu deuten.
2. Steht der Servername unmittelbar hinter `--env`, liest die CLI den Namen als weiteres
   `KEY=value`-Paar und lehnt ihn ab. Zwischen dem letzten `--env` und dem Namen muss also
   mindestens eine andere Option stehen. Im Beispiel oben übernehmen `--transport stdio` und
   `--scope user` diese Rolle. Die belastbare Reihenfolge lautet deshalb: erst alle `--env`,
   dann mindestens eine weitere Option, dann der Name, dann `--` und der Serverbefehl.

### 3.2 Die drei Scopes

| Scope | Lädt in | Geteilt mit dem Team | Abgelegt in |
| --- | --- | --- | --- |
| `local` (Vorgabe) | nur im aktuellen Projekt | nein | `~/.claude.json`, unterhalb des Projektpfades |
| `project` | nur im aktuellen Projekt | ja, über die Versionsverwaltung | `.mcp.json` im Projektwurzelverzeichnis |
| `user` | in allen Projekten | nein | `~/.claude.json`, auf oberster Ebene |

Reihenfolge bei Namensgleichheit, von hoch nach niedrig: local, project, user,
Plugin-Server, claude.ai-Connectors. Ein Eintrag wird als Ganzes übernommen, Felder werden
nicht über Scopes hinweg vermischt. Eine von der Organisation über `managedMcpServers`
bereitgestellte Definition rangiert über allen fünf Ebenen; das erfordert Claude Code 2.1.259
oder neuer.

Wichtig für die Erwartungshaltung: "local scope" bei MCP-Servern hat nichts mit
`.claude/settings.local.json` zu tun. MCP-local liegt in `~/.claude.json`.

Pfad der Nutzerdatei je Betriebssystem:

| Betriebssystem | Pfad |
| --- | --- |
| macOS | `~/.claude.json` |
| Linux | `~/.claude.json` |
| Windows | `%USERPROFILE%\.claude.json` |

Der Windows-Pfad ist die Entsprechung von `~` und in `CC-MCP` nicht wörtlich aufgeführt.
Er gilt als **Annahme**, die aus der Home-Verzeichnis-Konvention folgt.

### 3.3 Die Datei .mcp.json im Projekt

`claude mcp add --scope project` legt die Datei an oder ergänzt sie. Format:

```json
{
  "mcpServers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "${BB_API_CLIENT}",
        "BB_API_SECRET": "${BB_API_SECRET}",
        "BB_API_KEY": "${BB_API_KEY}"
      }
    }
  }
}
```

Diese Datei gehört in die Versionsverwaltung. Sie darf keine Klartext-Zugangsdaten enthalten,
sondern ausschließlich `${VAR}`-Verweise.

Vor der ersten Benutzung eines projektbezogenen Servers fragt Claude Code in interaktiven
Sitzungen nach Zustimmung. Die Entscheidungen lassen sich mit
`claude mcp reset-project-choices` zurücksetzen. In `claude -p`-Läufen, SDK-Sitzungen und
Cloud-Sitzungen kann diese Rückfrage nicht angezeigt werden; dort werden projektbezogene
Server ohne Nachfrage geladen.

### 3.4 Umgang mit Umgebungsvariablen

`CC-MCP` nennt zwei Ersetzungsformen:

* `${VAR}` wird durch den Wert der Umgebungsvariablen `VAR` ersetzt.
* `${VAR:-default}` nimmt `VAR`, wenn gesetzt, sonst `default`.

Ersetzt wird in diesen Feldern: `command`, `args`, `env`, `url`, `headers`.

Ist eine referenzierte Variable nicht gesetzt und hat keinen Vorgabewert, lädt die
Konfiguration trotzdem. Claude Code meldet für diesen Server in der Ausgabe von
`claude mcp list` eine Warnung über die fehlende Variable und verwendet den Text `${VAR}`
unersetzt weiter. Das ist der häufigste Grund für einen Server, der scheinbar startet,
aber bei jedem Aufruf einen Authentifizierungsfehler liefert.

`CLAUDE_PROJECT_DIR` setzt Claude Code in der Umgebung des gestarteten Serverprozesses,
nicht in seiner eigenen. Ein `${CLAUDE_PROJECT_DIR}` in `command` oder `args` eines
projekt-, local- oder user-bezogenen Eintrags braucht deshalb einen Vorgabewert, etwa
`${CLAUDE_PROJECT_DIR:-.}`.

### 3.5 Prüfen und Entfernen

```bash
claude mcp list                 # Liste mit Verbindungsstatus
claude mcp get bbutler   # Einzelansicht inklusive Fehlerdetail
claude mcp remove bbutler
claude mcp remove bbutler --scope user   # gezielt aus einem Scope
claude mcp reset-project-choices                    # Zustimmungen zu .mcp.json zurücksetzen
```

In der laufenden Sitzung zeigt `/mcp` Status, Werkzeuge und Fehlermeldungen je Server und
erlaubt Neuverbinden und Deaktivieren.

Statuswerte in `claude mcp list`. Wörtliches Zitat der Ausgabe von Claude Code. Die Symbole
stammen aus dem fremden Werkzeug und sind nicht Teil dieser Dokumentation.

* `✔ Connected`
* `! Needs authentication`
* `✘ Failed to connect`, mit angehängtem Fehlerdetail
* `⏸ Pending approval (run claude to approve)` für einen noch nicht zugelassenen `.mcp.json`-Server
* `⊘ Disabled for this project (re-enable via /mcp)`

`claude mcp add` schreibt die Konfiguration ohne die Zugangsdaten zu prüfen. Ein Platzhalter
wird also angenommen, der Server scheitert erst später beim Verbinden.

### 3.6 Zeitlimits

| Variable oder Feld | Wirkung | Vorgabe |
| --- | --- | --- |
| `MCP_TIMEOUT` | Startzeitlimit eines MCP-Servers, in Millisekunden | in `CC-MCP` nicht beziffert |
| `MCP_TOOL_TIMEOUT` | Zeitlimit einer Werkzeugausführung | rund 28 Stunden, wenn nicht gesetzt |
| `timeout` im Servereintrag | hartes Zeitlimit pro Werkzeugaufruf, in Millisekunden | keines; Werte unter 1000 werden ignoriert |
| `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` | Leerlauffenster eines Werkzeugaufrufs | 300000, also 5 Minuten |
| `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` | Schwelle, ab der ein Aufruf in den Hintergrund wandert | 120000, also 2 Minuten |

Beispiel für ein erhöhtes Startzeitlimit:

```bash
MCP_TIMEOUT=30000 claude
```

---

## 4. Claude Desktop

Quellen: `MCP-LOCAL`, `MCPB-GUIDE`, `MCPB-REPO`.

### 4.1 Die Datei claude_desktop_config.json

Erreichbar über das Claude-Menü in der Menüleiste des Betriebssystems, nicht über die
Einstellungen im Fenster: Settings, Reiter Developer, Schaltfläche "Edit Config".

| Betriebssystem | Pfad |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | in `MCP-LOCAL` nicht genannt, siehe Hinweis unten |

`MCP-LOCAL` führt ausdrücklich nur macOS und Windows auf und nennt Claude Desktop als für
macOS und Windows verfügbar. `MCPB-GUIDE` bestätigt das: "Claude Desktop runs on macOS
(`darwin`) and Windows (`win32`)". Es gibt Linux-Pakete aus der Gemeinschaft, deren
Konfigurationspfad üblicherweise `~/.config/Claude/claude_desktop_config.json` lautet.
Das ist **nicht verifiziert** und nicht vom Hersteller gedeckt.

Inhalt für unseren Server:

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "PLATZHALTER_API_CLIENT",
        "BB_API_SECRET": "PLATZHALTER_API_SECRET",
        "BB_API_KEY": "PLATZHALTER_API_KEY"
      }
    }
  }
}
```

Claude Desktop kennt keine `${VAR}`-Ersetzung wie Claude Code. Die Werte stehen hier im
Klartext in einer Datei im Nutzerprofil. Das ist der wesentliche Nachteil dieses Weges und
der Hauptgrund, für Claude Desktop das Bundle-Format vorzuziehen (Abschnitt 4.2) oder die
Zugangsdaten in eine eigene, restriktiv berechtigte Datei auszulagern (Abschnitt 13).

Nach dem Speichern muss Claude Desktop vollständig beendet und neu gestartet werden.
Danach: das Symbol "Add files, connectors, and more" links unten im Eingabefeld, dann
Connectors, dann "Manage connectors".

Fehlersuche, Protokolldateien:

| Betriebssystem | Pfad |
| --- | --- |
| macOS | `~/Library/Logs/Claude` |
| Windows | `%APPDATA%\Claude\logs` |

`mcp.log` enthält die allgemeinen Verbindungsmeldungen, `mcp-server-bbutler.log`
die Standardfehlerausgabe unseres Servers.

```bash
tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
```

Ein bekannter Windows-Fallstrick aus `MCP-LOCAL`: Scheitert der Start mit einem Fehler, der
`${APPDATA}` in einem Pfad nennt, muss der aufgelöste Wert von `%APPDATA%` zusätzlich in
`env` eingetragen werden. `npx` setzt außerdem eine global installierte npm-Version voraus.

### 4.2 Das Bundle-Format gibt es, es heißt jetzt MCPB

Ja, es gibt ein Bundle-Format, und es hat den Namen gewechselt. Das frühere `.dxt`
(Desktop Extensions) heißt heute **MCP Bundle** mit der Dateiendung `.mcpb`; das Projekt
liegt unter `modelcontextprotocol/mcpb`. Ein `.mcpb` ist ein ZIP-Archiv, das einen lokalen
MCP-Server und eine `manifest.json` enthält, vergleichbar mit `.crx` bei Chrome oder `.vsix`
bei VS Code.

Eigenschaften laut `MCPB-GUIDE`:

* läuft lokal auf dem Rechner des Nutzers
* spricht stdio
* bündelt alle Abhängigkeiten
* funktioniert offline
* braucht kein OAuth

Node.js wird ausdrücklich empfohlen, weil eine Node-Laufzeit mit Claude Desktop auf macOS
und Windows ausgeliefert wird. Für unseren TypeScript- beziehungsweise Node-Server ist das
der günstige Fall: der Nutzer braucht kein eigenes Node.

Der Bauweg:

```bash
npm install -g @anthropic-ai/mcpb
mcpb init      # führt durch die Erstellung der manifest.json
mcpb pack      # erzeugt die .mcpb-Datei
```

`MCPB-REPO` nennt zusätzlich `validate` und `sign`; die genaue Syntax dieser beiden Befehle
konnte nicht aus der Primärquelle belegt werden und ist **nicht verifiziert**. Die
verbindliche Befehlsreferenz steht in `CLI.md` des MCPB-Repositories.

Der zentrale Mehrwert für uns liegt in `user_config`: Wird im Manifest ein Abschnitt
`user_config` deklariert, erzeugt Claude Desktop daraus automatisch eine
Einstellungsoberfläche. Feldtypen sind unter anderem `string`, `directory`, `number` und
`boolean`; Felder kennen die Eigenschaften `sensitive` und `required`. Die eingegebenen
Werte werden über `${user_config.<name>}` in `mcp_config` eingesetzt, `${__dirname}`
verweist auf das Bundle-Verzeichnis.

Der folgende Manifest-Entwurf ist **nicht verifiziert** gegen die vollständige
Manifest-Spezifikation, sondern aus den in `MCPB-REPO` und `MCPB-GUIDE` genannten Feldern
zusammengesetzt. Vor der Verwendung ist er gegen `MANIFEST.md` des MCPB-Repositories zu
prüfen und mit `mcpb validate` zu testen.

```json
{
  "manifest_version": "0.1",
  "name": "bbutler-mcp",
  "display_name": "BuchhaltungsButler",
  "version": "0.1.0",
  "description": "Inoffizieller MCP-Server für die BuchhaltungsButler-API",
  "server": {
    "type": "node",
    "entry_point": "dist/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/index.js"],
      "env": {
        "BB_API_CLIENT": "${user_config.api_client}",
        "BB_API_SECRET": "${user_config.api_secret}",
        "BB_API_KEY": "${user_config.api_key}"
      }
    }
  },
  "user_config": {
    "api_client": {
      "type": "string",
      "title": "API Client",
      "description": "Benutzername der HTTP-Basic-Authentifizierung aus BuchhaltungsButler",
      "sensitive": true,
      "required": true
    },
    "api_secret": {
      "type": "string",
      "title": "API Secret",
      "description": "Passwort der HTTP-Basic-Authentifizierung",
      "sensitive": true,
      "required": true
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Auswahl des Mandanten, wird als Feld api_key im Body gesendet",
      "sensitive": true,
      "required": true
    }
  },
  "compatibility": {
    "platforms": ["darwin", "win32"]
  }
}
```

Zum Feld `name`: Dort steht `bbutler-mcp` und nicht der npm-Name
`@dennismenken/buchhaltungsbutler-mcp`. Zwei Gründe. Erstens ist der MCPB-Name ein
maschinenlesbarer Bezeichner; ob er die Zeichen `@` und `/` überhaupt zulässt, ist
**nicht verifiziert** und gegen `MANIFEST.md` zu prüfen. Zweitens ist ein `.mcpb`-Bundle ein
eigener Verteilweg neben npm, der Bundle-Name muss mit dem Paketnamen also gar nicht
übereinstimmen. Wir verwenden hier denselben Bezeichner wie beim Binary, siehe Abschnitt 15.3.
Das Bundle enthält den Server als Dateien und ruft ihn über `node` auf; ein npm-Name kommt
darin an keiner Stelle vor.

Installation durch den Nutzer, alle drei Wege laut `MCPB-GUIDE`:

1. Doppelklick auf die `.mcpb`-Datei
2. Hineinziehen der Datei in das Claude-Desktop-Fenster
3. Settings, Extensions, Advanced settings, "Install Extension…", Datei auswählen

Alle drei öffnen dieselbe Installationsoberfläche, in der der Nutzer die Details prüft, die
Pflichtfelder ausfüllt und Berechtigungen erteilt. Die Installation erfolgt je Nutzer.

Ein optionales Symbol wird als `icon.png` im Bundle-Wurzelverzeichnis abgelegt und im
Manifest referenziert; empfohlen sind 512 mal 512 Pixel, mindestens 256 mal 256, PNG mit
Transparenz.

Einordnung: `MCPB-GUIDE` bezeichnet MCPB ausdrücklich als den sekundären Verteilweg und
empfiehlt entfernte MCP-Server für eine Aufnahme in das Connectors-Verzeichnis. Für uns ist
das nachrangig, weil unser Server bewusst lokal läuft und die Zugangsdaten des Nutzers
nicht an Dritte weiterreichen soll.

---

## 5. OpenAI Codex CLI

Quellen: `CODEX-MCP`, `CODEX-LIVE`, `CODEX-CFG`.

### 5.1 Es gibt einen codex mcp add Befehl

Ja. Geprüft am installierten Binary `codex-cli 0.153.4`:

```
Usage: codex mcp [OPTIONS] <COMMAND>
Commands: list, get, add, remove, login, logout, help
```

```
Usage: codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)
```

Relevante Optionen von `codex mcp add`:

| Option | Bedeutung |
| --- | --- |
| `--env <KEY=VALUE>` | Umgebungsvariable für den Serverprozess, nur bei stdio gültig |
| `--url <URL>` | Adresse eines Streamable-HTTP-Servers, Alternative zum stdio-Befehl |
| `--bearer-token-env-var <ENV_VAR>` | nur für HTTP-Server |
| `--oauth-client-id`, `--oauth-client-registration`, `--oauth-resource` | OAuth, nur für HTTP-Server |
| `-c, --config <key=value>` | einmalige Überschreibung eines Konfigurationswertes |

Aufruf für unseren Server:

```bash
codex mcp add bbutler \
  --env BB_API_CLIENT="$BB_API_CLIENT" \
  --env BB_API_SECRET="$BB_API_SECRET" \
  --env BB_API_KEY="$BB_API_KEY" \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Weitere Befehle, alle am Binary geprüft:

```bash
codex mcp list             # optional --json
codex mcp get bbutler   # optional --json
codex mcp remove bbutler
codex mcp login <name>     # nur für OAuth-fähige HTTP-Server
```

In der TUI zeigt `/mcp` die aktiven Server.

### 5.2 Die Konfigurationsdatei

Codex legt die MCP-Konfiguration in derselben Datei ab wie alle anderen Einstellungen.

| Ebene | Pfad |
| --- | --- |
| Nutzer, macOS und Linux | `~/.codex/config.toml` |
| Nutzer, Windows | `%USERPROFILE%\.codex\config.toml` |
| Projekt | `.codex/config.toml` im Projektverzeichnis, nur in vertrauenswürdigen Projekten |

Der Windows-Pfad ist die Entsprechung von `~` und in `CODEX-MCP` nicht wörtlich aufgeführt;
er gilt als **Annahme**. Der Ort lässt sich außerdem über `CODEX_HOME` verlegen; diese
Variable ist in `CODEX-CFG` als gesetzter Wert sichtbar, ihre genaue Semantik ist in
`CODEX-MCP` nicht beschrieben und damit **nicht verifiziert**.

Die ChatGPT-Desktop-App, die Codex CLI und die IDE-Erweiterung teilen sich diese
Konfiguration. Wer den Server einmal einträgt, kann zwischen diesen Clients wechseln, ohne
die Einrichtung zu wiederholen. Das ist der praktisch wichtigste Punkt dieses Abschnitts.

### 5.3 Das genaue TOML-Format

Jeder Server bekommt eine Tabelle `[mcp_servers.<name>]`. Die Struktur wurde zusätzlich an
der real vorhandenen Datei `~/.codex/config.toml` gegengeprüft (`CODEX-CFG`); dort finden
sich Einträge mit `command`, `args`, `cwd`, `enabled`, `startup_timeout_sec` sowie
Untertabellen `[mcp_servers.<name>.env]` und `[mcp_servers.<name>.http_headers]`.

Für unseren Server:

```toml
[mcp_servers.bbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true

[mcp_servers.bbutler.env]
BB_API_CLIENT = "PLATZHALTER_API_CLIENT"
BB_API_SECRET = "PLATZHALTER_API_SECRET"
BB_API_KEY = "PLATZHALTER_API_KEY"
```

Felder für stdio-Server laut `CODEX-MCP`:

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `command` | ja | Befehl, der den Server startet |
| `args` | nein | Argumente |
| `env` | nein | Umgebungsvariablen, als Untertabelle |
| `env_vars` | nein | Namen von Variablen, die aus der Umgebung durchgereicht werden |
| `cwd` | nein | Arbeitsverzeichnis |
| `experimental_environment` | nein | `remote` startet den stdio-Server über eine entfernte Ausführungsumgebung |

`env_vars` ist der sicherheitstechnisch bessere Weg: Statt die Werte in die Datei zu
schreiben, werden nur die Namen genannt und die Werte aus der lokalen Umgebung gelesen.

```toml
[mcp_servers.bbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
env_vars = ["BB_API_CLIENT", "BB_API_SECRET", "BB_API_KEY"]
```

Einträge können auch Objekte mit Quellenangabe sein:

```toml
env_vars = ["LOCAL_TOKEN", { name = "REMOTE_TOKEN", source = "remote" }]
```

Zeichenketten und `source = "local"` lesen aus der lokalen Umgebung von Codex,
`source = "remote"` aus der entfernten Ausführungsumgebung.

Weitere Optionen, die unabhängig vom Transport gelten:

| Feld | Bedeutung | Vorgabe |
| --- | --- | --- |
| `startup_timeout_sec` | Zeitlimit für den Start des Servers | 10 |
| `tool_timeout_sec` | Zeitlimit für einen Werkzeugaufruf | 60 |
| `enabled` | `false` deaktiviert, ohne zu löschen | true |
| `required` | `true` lässt den Start scheitern, wenn der Server nicht initialisiert | false |
| `enabled_tools` | Erlaubnisliste für Werkzeuge | |
| `disabled_tools` | Sperrliste, wird nach `enabled_tools` angewendet | |
| `default_tools_approval_mode` | `auto`, `prompt`, `writes`, `approve` | |
| `tools.<tool>.approval_mode` | Überschreibung je Werkzeug | |
| `tools.<tool>.output_token_limit` | Ausgabebudget je Werkzeug | |

`default_tools_approval_mode = "writes"` fragt genau bei den Werkzeugen nach, die nicht als
schreibgeschützt gekennzeichnet sind. Das passt exakt zu der Aufteilung in lesende und
schreibende Endpunkte, die unser Server ohnehin vornehmen muss, und ist die Empfehlung für
Codex-Nutzer.

Die oberste Einstellung `mcp_optional_startup_grace_ms` bestimmt, wie lange Codex beim Aufbau
des ersten Werkzeugkatalogs auf optionale MCP-Server wartet. Vorgabe 1000 Millisekunden.
Der Wert `0` lässt Codex stattdessen bis zum jeweiligen `startup_timeout_sec` warten. Das ist
für den npx-Kaltstart relevant, siehe Abschnitt 12.

---

## 6. ChatGPT

Quellen: `CODEX-MCP`, `TUNNEL`.

Hier ist eine klare Trennung nötig, weil "ChatGPT" drei verschiedene Dinge meint.

### 6.1 ChatGPT als Desktop-App

Die ChatGPT-Desktop-App ist laut `CODEX-MCP` ein Codex-Host. Sie unterstützt stdio-Server und
teilt sich die Konfiguration mit der Codex CLI und der IDE-Erweiterung. Das heißt konkret:
Wer `codex mcp add` ausführt, hat den Server auch in der Desktop-App. Alles aus Abschnitt 5
gilt unverändert.

### 6.2 ChatGPT im Browser

Hier funktioniert ein lokaler stdio-Server nicht. `CODEX-MCP` formuliert es so:
"ChatGPT web can use remote MCP-backed tools supplied by plugins. Local Codex clients can
also connect directly to MCP servers and share their configuration."

Die Weboberfläche liest keine lokalen Konfigurationsdateien und kann keinen Prozess auf dem
Rechner des Nutzers starten. Sie spricht ausschließlich über HTTPS mit entfernten Servern.
Ein lokaler Server müsste also entweder öffentlich erreichbar gemacht oder getunnelt werden.

Für unseren Server ist das eine bewusste Nichtunterstützung. Wir bauen einen lokalen Server,
der drei Zugangsdaten eines Buchhaltungssystems verarbeitet. Diesen über eine öffentliche
HTTPS-Adresse anzubieten, würde entweder bedeuten, dass wir fremde Zugangsdaten entgegennehmen,
oder dass jeder Nutzer selbst hosten muss. Beides ist nicht das Produktziel.

### 6.3 Secure MCP Tunnel als Ausnahme

Es gibt einen offiziellen Weg, einen privaten oder lokalen MCP-Server an ChatGPT anzubinden,
ohne ihn zu veröffentlichen: Secure MCP Tunnel (`TUNNEL`). Ein selbst betriebener
`tunnel-client` baut eine ausschließlich ausgehende HTTPS-Verbindung zu einem von OpenAI
gehosteten MCP-Endpunkt auf, holt dort Arbeit ab, leitet jede JSON-RPC-Anfrage lokal weiter
und schickt die Antwort über denselben Weg zurück.

Der Tunnel unterstützt stdio- und HTTP-Server. Ein stdio-Profil wird so eingerichtet:

```bash
export CONTROL_PLANE_API_KEY="PLATZHALTER_PLATFORM_API_KEY"

tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile local-stdio \
  --tunnel-id PLATZHALTER_TUNNEL_ID \
  --mcp-command "npx -y @dennismenken/buchhaltungsbutler-mcp"

tunnel-client doctor --profile local-stdio --explain
tunnel-client run --profile local-stdio
```

Voraussetzungen laut `TUNNEL`:

* eine `tunnel_id` aus den Platform-Tunneleinstellungen
* ein Laufzeit-API-Schlüssel
* Tunnels-Berechtigung Read plus Use zum Betreiben, Read plus Manage zum Anlegen
* getrennt davon: Entwicklermodus-Zugang im ChatGPT-Arbeitsbereich, bei Enterprise und Edu
  durch einen Administrator freigeschaltet, danach vom Nutzer unter Settings, Security and
  login zu aktivieren
* ausgehendes HTTPS zu `api.openai.com:443` beziehungsweise `mtls.api.openai.com:443`

Ausdrücklich ausgeschlossen: Secure MCP Tunnel unterstützt keine öffentliche Plugin-Einreichung
und keine Verteilung. Öffentliche Plugins brauchen einen stabilen, öffentlich erreichbaren
HTTPS-Endpunkt.

**Bewertung für unser Projekt:** Der Tunnel ist ein Weg für Einzelpersonen und Unternehmen,
die ihn selbst betreiben wollen, kein Verteilweg für ein quelloffenes Paket. Er setzt ein
OpenAI-Platform-Konto, Rollenrechte und einen dauerhaft laufenden Zusatzprozess voraus.
Wir dokumentieren ihn als Möglichkeit und bieten dafür keine Automatik an.

**Ehrliche Zusammenfassung für die README:** Für ChatGPT im Browser funktioniert der Server
nicht. Für die ChatGPT-Desktop-App funktioniert er über die Codex-Konfiguration.

---

## 7. Grok und xAI

Quellen: `XAI-MCP`, `GROK-LIVE`.

### 7.1 Welcher Client existiert

xAI liefert mit **Grok Build** einen agentischen Kommandozeilen-Client. Das installierte
Binary meldet `grok 1.0.25 (f7e67d6988e2) [stable]`. MCP wird nativ unterstützt; Werkzeuge
externer Server werden laut `XAI-MCP` als `<server>__<tool>` eingebunden.

Nicht zu verwechseln: Die Grok-Chatoberfläche auf grok.com und in der X-App ist etwas
anderes. Ob dort eigene lokale MCP-Server eingebunden werden können, konnte **nicht belegt**
werden. Belastbar ist nur der Weg über Grok Build. `docs.x.ai/developers/tools/remote-mcp`
beschreibt daneben entfernte MCP-Werkzeuge für die API, nicht für lokale Server.

### 7.2 Der Befehl

Geprüft an `grok mcp add --help`:

```
Usage: grok mcp add [OPTIONS] <NAME> [COMMAND_OR_URL] [ARGS]...
```

| Option | Kurzform | Bedeutung |
| --- | --- | --- |
| `--transport` | `-t` | `stdio`, `http`, `sse`. Vorgabe stdio, oder http bei einer http(s)-URL |
| `--scope` | `-s` | `user` = `~/.grok/config.toml` (Vorgabe), `project` = `./.grok/config.toml` |
| `--env` | `-e` | `KEY=value`, wiederholbar |
| `--header` | `-H` | `NAME: VALUE`, nur für entfernte Server |

Aus der eingebauten Hilfe: Argumente gehören hinter `--`, damit Flags wie `-y` an den Server
gehen und nicht an grok.

Aufruf für unseren Server:

```bash
grok mcp add bbutler \
  -e BB_API_CLIENT="$BB_API_CLIENT" \
  -e BB_API_SECRET="$BB_API_SECRET" \
  -e BB_API_KEY="$BB_API_KEY" \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Weitere Unterbefehle, alle an der Hilfe geprüft:

```bash
grok mcp list
grok mcp remove bbutler
grok mcp enable bbutler
grok mcp disable bbutler
grok mcp doctor bbutler   # Konfiguration und Erreichbarkeit prüfen
```

`grok mcp doctor` ist bemerkenswert: Kein anderer der hier behandelten Clients bringt eine
eigene Diagnose für MCP-Server mit.

### 7.3 Die Konfigurationsdatei

| Ebene | Pfad |
| --- | --- |
| Nutzer, macOS und Linux | `~/.grok/config.toml` |
| Nutzer, Windows | `%USERPROFILE%\.grok\config.toml` |
| Projekt | `./.grok/config.toml` |

Der Windows-Pfad ist **Annahme**. Format, aus `XAI-MCP` und gegengeprüft an einer real
vorhandenen `.grok/config.toml`:

```toml
[mcp_servers.bbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
env = { BB_API_CLIENT = "${BB_API_CLIENT}", BB_API_SECRET = "${BB_API_SECRET}", BB_API_KEY = "${BB_API_KEY}" }
startup_timeout_sec = 30
enabled = true
```

`XAI-MCP` nennt die Ersetzungsformen `${VAR}` und `${VAR:-default}` für die Felder `url`,
`command`, `args`, `env` und `headers`. Damit lässt sich, anders als bei Claude Desktop, auch
in Grok eine Konfiguration ohne Klartext-Zugangsdaten schreiben.

Grok geht laut `XAI-MCP` vom aktuellen Verzeichnis bis zur Git-Wurzel hoch; Projektserver
überschreiben namensgleiche Nutzerserver.

---

## 8. Cursor

Quelle: `CURSOR-MCP`.

| Ebene | Pfad |
| --- | --- |
| Projekt | `.cursor/mcp.json` im Projektverzeichnis |
| Nutzer, macOS und Linux | `~/.cursor/mcp.json` |
| Nutzer, Windows | `%USERPROFILE%\.cursor\mcp.json` |

Der Windows-Pfad ist **Annahme**. Cursor unterstützt `stdio`, `SSE` und `Streamable HTTP`.
Ein Kommandozeilenbefehl zum Hinzufügen ist in `CURSOR-MCP` **nicht dokumentiert**; die
Einrichtung erfolgt über die Datei oder über die Seite "Customize".

Konfiguration für unseren Server:

```json
{
  "mcpServers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "${env:BB_API_CLIENT}",
        "BB_API_SECRET": "${env:BB_API_SECRET}",
        "BB_API_KEY": "${env:BB_API_KEY}"
      }
    }
  }
}
```

Achtung, abweichende Syntax: Cursor schreibt `${env:NAME}`, nicht `${NAME}`. Ersetzt wird in
`command`, `args`, `env`, `url` und `headers`. Weitere Variablen: `${userHome}`,
`${workspaceFolder}` (das Verzeichnis, das `.cursor/mcp.json` enthält),
`${workspaceFolderBasename}`, `${pathSeparator}` und `${/}`.

Nur für stdio-Server gibt es zusätzlich `envFile`, einen Pfad zu einer Datei mit weiteren
Variablen:

```json
{
  "mcpServers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "envFile": "${userHome}/.config/buchhaltungsbutler-mcp/credentials.env"
    }
  }
}
```

Das ist der sauberste Weg in Cursor: Die Zugangsdaten liegen in einer eigenen Datei, die
Projektkonfiguration bleibt frei von Geheimnissen und kann eingecheckt werden.

Protokolle: Output-Bereich öffnen (`Cmd+Shift+U` beziehungsweise `Ctrl+Shift+U`), dann
"MCP Logs" wählen. Ein Server lässt sich unter "Customize" ohne Löschen abschalten.

Unternehmenskunden können unter Team Settings, MCP Configuration eine Erlaubnisliste
pflegen. Befehlsmuster geben lokale stdio-Server frei, URL-Muster entfernte Server. Für
lokale Server gibt es zusätzlich Netzwerkmodi: "Allow all", "Allowlist", "Deny all",
"No sandbox". Ein Server, der wie unserer ausschließlich `webapp.buchhaltungsbutler.de`
kontaktiert, lässt sich damit eng einschnüren; das gehört in die README als Hinweis für
Unternehmensnutzer.

---

## 9. Visual Studio Code mit GitHub Copilot

Quellen: `VSCODE-MCP` (Seitenstand 9. September 2026), `VSCODE-REF`.

### 9.1 Die Dateien

| Ebene | Pfad oder Weg |
| --- | --- |
| Arbeitsbereich | `.vscode/mcp.json` im Projekt |
| Nutzerprofil | Befehl **MCP: Open User Configuration** in der Befehlspalette |
| Entfernter Nutzer | Befehl **MCP: Open Remote User Configuration** |
| Agent Host, portabel | `.mcp.json` im Arbeitsbereich oder `~/.copilot/mcp-config.json` |

Der Pfad der Profildatei ist nicht als fester Pfad dokumentiert, weil er vom aktiven Profil
abhängt. Der dokumentierte Zugang ist der Befehl. Ein hartkodierter Pfad wäre hier eine
Erfindung und wird deshalb nicht angegeben.

Hinweis aus `VSCODE-MCP`: Sitzungen auf dem Agent Host lesen `.vscode/mcp.json` nicht direkt.
VS Code reicht die Konfiguration weiter, mit Ausnahme von Servern, die interaktive Eingaben
brauchen, also `${input:...}` verwenden. Wer eine über Agent Host und andere Copilot-Werkzeuge
portable Konfiguration will, nimmt `.mcp.json` im Arbeitsbereich oder
`~/.copilot/mcp-config.json`.

### 9.2 Das Format

Der Wrapper-Schlüssel heißt `servers`, nicht `mcpServers`. Das ist der häufigste
Kopierfehler zwischen VS Code und allen anderen Clients.

```json
{
  "servers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "${input:bb-api-client}",
        "BB_API_SECRET": "${input:bb-api-secret}",
        "BB_API_KEY": "${input:bb-api-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "bb-api-client",
      "description": "BuchhaltungsButler API Client",
      "password": true
    },
    {
      "type": "promptString",
      "id": "bb-api-secret",
      "description": "BuchhaltungsButler API Secret",
      "password": true
    },
    {
      "type": "promptString",
      "id": "bb-api-key",
      "description": "BuchhaltungsButler API Key",
      "password": true
    }
  ]
}
```

`inputs` ist der von VS Code vorgesehene Weg für Geheimnisse: Der Nutzer wird beim ersten
Start gefragt, `password: true` maskiert die Eingabe, VS Code legt den Wert danach sicher ab.
Diese Datei kann also eingecheckt werden. Die Einschränkung: Auf dem Agent Host werden
Server mit `${input:...}` nicht weitergereicht.

Eingabetypen: `promptString`, `pickString`, `command`.

### 9.3 Der Kommandozeilenbefehl

```bash
code --add-mcp "{\"name\":\"bbutler\",\"command\":\"npx\",\"args\":[\"-y\",\"@dennismenken/buchhaltungsbutler-mcp\"]}"
```

Der Befehl schreibt in das Nutzerprofil. Zugangsdaten gehören nicht in diese
Kommandozeile, siehe Abschnitt 13.

Alternativ führt **MCP: Add Server** in der Befehlspalette durch einen geführten Ablauf mit
der Wahl zwischen "Workspace" und "Global".

### 9.4 Sandbox

Auf macOS und Linux lassen sich lokale stdio-Server einsperren. Für unseren Server, der nur
eine einzige Domain kontaktiert, ist das eine sinnvolle Empfehlung:

```json
{
  "servers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "sandboxEnabled": true
    }
  },
  "sandbox": {
    "network": {
      "allowedDomains": ["webapp.buchhaltungsbutler.de"]
    }
  }
}
```

Bei aktivierter Sandbox werden Werkzeugaufrufe automatisch freigegeben, weil sie in einer
kontrollierten Umgebung laufen. Unter Windows ist Sandboxing laut `VSCODE-MCP` nicht
verfügbar. Zu beachten: `npx -y` lädt beim Erstlauf ein Paket aus der npm-Registry; eine
Netzwerk-Erlaubnisliste, die nur `webapp.buchhaltungsbutler.de` enthält, verhindert das.
Für den Sandbox-Betrieb ist deshalb die globale Installation oder ein lokaler Klon die
passende Startvariante, nicht `npx`.

### 9.5 Weiteres

* Vor dem ersten Start eines Servers aus dem Arbeitsbereich fragt VS Code nach Vertrauen.
  Zurücksetzen mit **MCP: Reset Trust**.
* Protokolle: **MCP: List Servers**, Server wählen, **Show Output**.
* `chat.mcp.discovery.enabled` kann bestehende MCP-Konfigurationen anderer Anwendungen,
  etwa Claude Desktop, übernehmen.
* Settings Sync kann MCP-Serverkonfigurationen zwischen Geräten abgleichen.
* `chat.mcp.autostart` startet Server nach Konfigurationsänderungen automatisch neu;
  in `VSCODE-MCP` als experimentell gekennzeichnet.

---

## 10. Weitere Clients

### 10.1 Windsurf, Cascade

Quelle: `WINDSURF-MCP`. Die Windsurf-Dokumentation wird inzwischen auf `docs.devin.ai`
weitergeleitet; die Oberfläche heißt dort "Devin Settings".

Konfigurationsdatei: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "PLATZHALTER_API_CLIENT",
        "BB_API_SECRET": "PLATZHALTER_API_SECRET",
        "BB_API_KEY": "PLATZHALTER_API_KEY"
      }
    }
  }
}
```

Oberfläche: Symbol `MCPs` oben rechts im Cascade-Bereich, oder Devin Settings, Cascade,
Abschnitt MCP Servers. Eine `${VAR}`-Ersetzung ist in `WINDSURF-MCP` **nicht dokumentiert**;
die Werte stehen also im Klartext in der Datei. Cascade begrenzt die Gesamtzahl der Werkzeuge
auf 100; das ist für uns relevant, weil die BuchhaltungsButler-API 54 Endpunkte hat und ein
naiver Ein-Werkzeug-pro-Endpunkt-Zuschnitt über die Hälfte dieses Budgets belegen würde.

### 10.2 Zed

Quelle: `ZED-MCP`. Zed nennt MCP-Server "context servers".

Weg über die Oberfläche: Settings, AI, MCP Servers, oder die Aktion `agent: open settings`
und dort MCP Servers.

```json
{
  "context_servers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "PLATZHALTER_API_CLIENT",
        "BB_API_SECRET": "PLATZHALTER_API_SECRET",
        "BB_API_KEY": "PLATZHALTER_API_KEY"
      }
    }
  }
}
```

Die Pfade der `settings.json` sind in `ZED-MCP` nicht genannt. Nach verbreiteter Angabe
liegen sie unter `~/.config/zed/settings.json` (macOS und Linux, beziehungsweise
`$XDG_CONFIG_HOME/zed/settings.json`) und `%APPDATA%\Zed\settings.json` (Windows). Das ist
aus der Primärquelle **nicht verifiziert**; im Zweifel führt der Weg über die Oberfläche.

### 10.3 Cline

Quelle: `CLINE-MCP`.

| Variante | Weg |
| --- | --- |
| Cline CLI | `~/.cline/mcp.json` |
| IDE-Erweiterung | Symbol MCP Servers in der oberen Werkzeugleiste, Reiter Configure, Schaltfläche "Configure MCP Servers" |

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "PLATZHALTER_API_CLIENT",
        "BB_API_SECRET": "PLATZHALTER_API_SECRET",
        "BB_API_KEY": "PLATZHALTER_API_KEY"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

`autoApprove` nimmt die Namen der Werkzeuge auf, die ohne Rückfrage laufen dürfen. Dort
gehören nur lesende Werkzeuge unseres Servers hinein.

Die Dateipfade der IDE-Erweiterung je Betriebssystem sind in `CLINE-MCP` **nicht** als feste
Pfade dokumentiert; der dokumentierte Zugang ist die Oberfläche.

### 10.4 Continue

Quelle: `CONTINUE-MCP`. Continue kennt zwei Ablageorte:

1. Ein Ordner `.continue/mcpServers/` auf oberster Ebene des Arbeitsbereichs, mit einer
   YAML-Datei je Server.
2. Ein Block `mcpServers` in der `config.yaml`.

```yaml
name: BuchhaltungsButler mcpServer
version: 0.0.1
schema: v1
mcpServers:
  - name: bbutler
    type: stdio
    command: npx
    args:
      - "-y"
      - "@dennismenken/buchhaltungsbutler-mcp"
    env:
      BB_API_CLIENT: ${{ secrets.BB_API_CLIENT }}
      BB_API_SECRET: ${{ secrets.BB_API_SECRET }}
      BB_API_KEY: ${{ secrets.BB_API_KEY }}
```

Die Anführungszeichen um `"@dennismenken/buchhaltungsbutler-mcp"` sind hier Pflicht und kein
Stilmittel: In YAML darf `@` keinen unquotierten Skalar beginnen, der Eintrag wäre sonst ein
Syntaxfehler (Abschnitt 11.1).

Die Syntax `${{ secrets.NAME }}` ist in `CONTINUE-MCP` für `env` belegt. Wichtige
Einschränkung aus derselben Quelle: MCP funktioniert in Continue nur im Agent-Modus.

### 10.5 LM Studio

Quelle: `LMSTUDIO-MCP`. Ab LM Studio 0.3.17 ist die Anwendung ein MCP-Host.

| Betriebssystem | Pfad |
| --- | --- |
| macOS und Linux | `~/.lmstudio/mcp.json` |
| Windows | `%USERPROFILE%/.lmstudio/mcp.json` |

Empfohlen wird der eingebaute Editor: Reiter "Program" in der rechten Seitenleiste, dann
`Install`, dann `Edit mcp.json`. Nach dem Speichern lädt LM Studio die Server automatisch.

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "PLATZHALTER_API_CLIENT",
        "BB_API_SECRET": "PLATZHALTER_API_SECRET",
        "BB_API_KEY": "PLATZHALTER_API_KEY"
      }
    }
  }
}
```

Zu diesem Pfad gibt es einen offenen Fehlerbericht im LM-Studio-Bugtracker
(`lmstudio-ai/lmstudio-bug-tracker`, Issue 1371), demzufolge der tatsächliche Ort auf macOS
von der Dokumentation abweicht. Wir geben deshalb den dokumentierten Pfad an und verweisen
für den Zweifelsfall auf den Editor in der Anwendung. Der abweichende Pfad ist
**nicht verifiziert**.

Die Beispiele in `LMSTUDIO-MCP` zeigen ausschließlich `url` und `headers`, also entfernte
Server. Dass `command`, `args` und `env` dort ebenso funktionieren, folgt aus dem
allgemeinen `mcpServers`-Schema und aus der Aussage, LM Studio sei ein MCP-Host; aus der
Primärquelle wörtlich belegt ist es **nicht**.

### 10.6 Jan

Quelle: `JAN-MCP`, ausgewertet über Suchtreffer, nicht über einen direkten Abruf der Seite.
Diese Angaben sind deshalb schwächer belegt als die übrigen.

Weg: Settings, MCP Servers, Schaltfläche "+ Add MCP Server" oben rechts. Eingabefelder:
Command, Args, Env. Nach dem Einschalten erscheint der Server mit grüner Anzeige in der Liste.

Globale Einstellungen, die für uns relevant sind:

* "Allow All MCP Tool Permissions" gibt alle Werkzeugaufrufe ohne Rückfrage frei und gilt
  für alle Unterhaltungen. Für einen Server mit schreibenden Buchhaltungsoperationen ist
  das die falsche Einstellung; das gehört ausdrücklich in die README.
* Zeitlimit für Werkzeugaufrufe, Vorgabe 30 Sekunden.

Ein Dateipfad für die Konfiguration ist **nicht belegt**.

---

## 11. Generische Form für beliebige Clients

Die überwiegende Mehrheit der Clients liest ein Objekt `mcpServers`, in dem jeder Server
unter seinem Namen mit `command`, `args` und `env` steht. Das ist der kleinste gemeinsame
Nenner und der Block, den wir in der README als Erstes zeigen.

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "PLATZHALTER_API_CLIENT",
        "BB_API_SECRET": "PLATZHALTER_API_SECRET",
        "BB_API_KEY": "PLATZHALTER_API_KEY"
      }
    }
  }
}
```

Bekannte Abweichungen von dieser Form, alle in diesem Dokument belegt:

| Client | Abweichung |
| --- | --- |
| VS Code | Wrapper-Schlüssel heißt `servers`, nicht `mcpServers` |
| Zed | Wrapper-Schlüssel heißt `context_servers` |
| Codex CLI, Grok | TOML statt JSON, Tabelle `[mcp_servers.<name>]` |
| Continue | YAML, `mcpServers` ist eine Liste mit `name` je Eintrag, nicht ein Objekt |
| Claude Code | zusätzliches Feld `type: "stdio"`, `${VAR}`-Ersetzung |
| Cursor | Ersetzung als `${env:NAME}`, zusätzlich `envFile` |

Das Feld `type` ist in Claude Code, Cursor und VS Code zulässig und wird von den übrigen
Clients in aller Regel ignoriert. Es schadet nicht, es immer anzugeben, und macht den Block
leichter zwischen Clients kopierbar. Für Claude Code gilt zusätzlich: `streamable-http` ist
dort ein Alias für `http`.

### 11.1 Der Namensraum im Paketnamen und die Clientformate

Unser Paketname trägt mit `@dennismenken/buchhaltungsbutler-mcp` zwei Zeichen, die in
Konfigurationsformaten Bedeutung haben können: `@` und `/`. Durchgesehen für jeden in diesem
Dokument behandelten Client, mit dem Ergebnis, dass kein einziger Anpassungen am Aufbau der
Blöcke erzwingt:

| Format und Client | Steht der Namensraum im Weg | Begründung |
| --- | --- | --- |
| JSON: Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Zed, Cline, LM Studio | nein | Der Name steht als eigenes Element in `args`, also in einer Zeichenkette in Anführungszeichen |
| TOML: Codex CLI, Grok | nein | ebenso, `args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]` |
| YAML: Continue | nur mit Anführungszeichen | siehe unten |
| Oberflächeneingabe: Jan | nein | Der Name ist ein Eintrag in der Liste `Args`, nicht Teil einer Kommandozeile |
| `code --add-mcp`, `claude mcp add`, `codex mcp add`, `grok mcp add` | nein in bash und zsh | `@` und `/` sind dort keine Sonderzeichen; in den JSON-Zeichenketten von `--add-mcp` ohnehin nicht |

Der einzige Punkt, an dem es klemmen kann, ist YAML: `@` gehört dort zu den reservierten
Zeichen und darf einen unquotierten Skalar nicht beginnen. `- @dennismenken/…` ist ein
Syntaxfehler, `- "@dennismenken/…"` ist gültig (`LOCAL-YAML`, geprüft mit PyYAML 6.0.3 am
2026-09-12). Der Continue-Block in Abschnitt 10.4 setzt die Argumente ohnehin in
Anführungszeichen; das ist dort ab jetzt Pflicht und kein Stilmittel mehr.

Wichtig für das Verständnis der übrigen Fälle: Die Clients starten den Serverprozess mit
`command` und `args` ohne zwischengeschaltete Shell. Innerhalb von `args` ist der Paketname
deshalb eine gewöhnliche Zeichenkette, unabhängig von den Zeichen darin. Eine Shell sieht den
Namen nur bei den kopierfertigen Kommandozeilen dieses Dokuments.

Für Windows-Anwender mit PowerShell ist das Verhalten von `@` am Anfang eines Arguments
**nicht verifiziert**; PowerShell steht auf diesem Entwicklungsrechner nicht zur Verfügung.
Wer dort auf einen Parserfehler stößt, setzt den Paketnamen in Anführungszeichen
(`npx -y "@dennismenken/buchhaltungsbutler-mcp"`). Das ist in jeder Shell korrekt und in
bash und zsh wirkungsgleich.

---

## 12. Startvarianten: npx, globale Installation, lokaler Klon

### 12.1 Die drei Varianten

**a) npx**

```json
{ "command": "npx", "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"] }
```

Vorteile: kein Installationsschritt, der Nutzer kopiert einen Block und ist fertig; die
Version ist immer aktuell; nichts bleibt global installiert.

Nachteile: Jeder Serverstart geht durch die Auflösung von npx. Beim allerersten Start wird
das Paket samt Abhängigkeiten aus der Registry geladen. Ohne Netz startet der Server unter
Umständen gar nicht. `-y` unterdrückt die Rückfrage, ob das Paket installiert werden soll;
ohne `-y` wartet npx auf eine Eingabe, die in einem stdio-Kontext niemand beantwortet, und
der Start läuft in das Zeitlimit. Und: Eine Netzwerk-Sandbox, die nur die
BuchhaltungsButler-Domain erlaubt, macht npx unbrauchbar (siehe Abschnitt 9.4).

Zum abweichenden Namen des Binaries: `npx -y @dennismenken/buchhaltungsbutler-mcp` startet
unser Paket, obwohl das Binary `bbutler-mcp` heißt und damit nicht dem Paketnamen ohne
Namensraum entspricht. npm löst das so auf: Hat ein Paket genau einen `bin`-Eintrag,
beziehungsweise zeigen alle `bin`-Einträge auf dieselbe Datei, wird dieser ausgeführt,
unabhängig von seinem Namen; erst danach wird auf einen Eintrag zurückgegriffen, der dem
Paketnamen ohne Namensraum entspricht, und gibt es auch den nicht, bricht npm mit
"could not determine executable to run" ab. Nachgelesen im Quelltext der lokal installierten
npm-Fassung 10.9.8, `libnpmexec/lib/get-bin-from-manifest.js` (`LOCAL-NPM`). Für andere
npm-Fassungen ist dieselbe Regel **nicht verifiziert**. Die ausdrückliche Form, die ohne sie
auskommt, steht in der Hilfe von `npx` (`LOCAL-NPM`) und lautet:

```bash
npx -y --package=@dennismenken/buchhaltungsbutler-mcp bbutler-mcp
```

Daraus folgt eine Auflage für die `package.json`: genau ein `bin`-Eintrag, nämlich
`bbutler-mcp`. Ein zweiter Eintrag mit abweichendem Ziel würde jeden kurzen npx-Aufruf in
diesem Dokument brechen.

**b) Globale Installation**

```bash
npm install -g @dennismenken/buchhaltungsbutler-mcp
```

```json
{ "command": "bbutler-mcp", "args": [] }
```

Der Befehl heißt `bbutler-mcp` und damit anders als das Paket. Das ist kein Versehen: Der
Name `buchhaltungsbutler-mcp` ist als Binary auf npm bereits vergeben, und der Namensraum im Paketnamen ändert daran nichts, weil npm das
Binary unscoped in sein Binärverzeichnis legt. Begründung und Prüfung in Abschnitt 15.3.

Vorteile: schnellster Start, kein Netz zum Starten nötig, funktioniert in einer Sandbox mit
enger Netzwerk-Erlaubnisliste, stabile Version.

Nachteile: ein zusätzlicher Installationsschritt; Aktualisierungen liegen beim Nutzer; das
Binärverzeichnis von npm muss im `PATH` der Umgebung liegen, aus der der Client den Prozess
startet. Letzteres ist bei Desktop-Anwendungen, die nicht aus einer Login-Shell heraus
gestartet werden, eine echte Fehlerquelle, insbesondere bei Versionsmanagern wie nvm, fnm
oder Volta. Der robuste Ausweg ist ein absoluter Pfad:

```json
{ "command": "/opt/homebrew/bin/bbutler-mcp", "args": [] }
```

**c) Lokaler Klon**

```bash
git clone https://github.com/dennismenken/buchhaltungsbutler-mcp.git
cd buchhaltungsbutler-mcp
npm install
npm run build
```

```json
{ "command": "node", "args": ["/absoluter/pfad/buchhaltungsbutler-mcp/dist/index.js"] }
```

Das Verzeichnis heißt hier `buchhaltungsbutler-mcp`, weil `git clone` es nach dem
Repositoriumsnamen benennt. Das Repository `dennismenken/buchhaltungsbutler-mcp` ist
öffentlich vorgesehen, am 2026-09-12 aber noch nicht angelegt (`WEB-CHECK`, HTTP 404); es
entsteht laut Projektentscheidung erst am Ende der Arbeiten. Bis dahin läuft dieser Weg ins
Leere.

Vorteile: volle Kontrolle, Voraussetzung für Entwicklung und Fehlersuche, kein Vertrauen in
die Registry nötig, beliebiger Stand auswählbar.

Nachteile: mehrere Schritte, Bauwerkzeuge nötig, Aktualisierung von Hand, absolute Pfade in
der Konfiguration.

### 12.2 Zeitlimits beim Start, die tatsächlich dokumentiert sind

Das ist kein theoretisches Problem. Die Zahlen stehen in den Primärquellen:

| Client | Startzeitlimit | Quelle |
| --- | --- | --- |
| OpenAI Codex CLI | `startup_timeout_sec`, Vorgabe **10 Sekunden** | `CODEX-MCP` |
| Codex, Aufbau des ersten Werkzeugkatalogs | `mcp_optional_startup_grace_ms`, Vorgabe **1000 Millisekunden** | `CODEX-MCP` |
| Claude Code | `MCP_TIMEOUT`, Vorgabewert in `CC-MCP` nicht beziffert | `CC-MCP` |
| Grok | `startup_timeout_sec` je Server | `XAI-MCP` |

Zehn Sekunden sind für einen npx-Kaltstart mit Paketdownload knapp. Für Codex-Nutzer gehört
`startup_timeout_sec = 30` deshalb in den empfohlenen Konfigurationsblock, oder es wird
gleich die globale Installation empfohlen.

### 12.3 Was wir gemessen haben und was nicht

Gemessen auf dem Entwicklungsrechner (`LOCAL-NODE`): Node v22.23.2, npm 10.9.8. Ein leerer
Node-Start (`node -e "0"`) braucht rund 0,01 Sekunden. Der reine npx-Vorspann
(`npx --version`, ohne Paketauflösung und ohne Download) braucht rund 0,05 Sekunden, über
drei Läufe stabil.

**Nicht gemessen** und damit **nicht verifiziert**: die Dauer eines echten
`npx -y @dennismenken/buchhaltungsbutler-mcp` beim Erstlauf mit Download, und die Dauer bei warmem
npm-Cache. Der Auftrag schließt npm-Installationen aus, deshalb wurde darauf verzichtet.
Erfahrungswerte aus der Gemeinschaft liegen im Bereich mehrerer Sekunden bis über zehn
Sekunden für den Kaltstart; das ist eine **Annahme** und keine Messung dieses Projekts.
Vor dem Veröffentlichen sollte diese Zahl einmal real erhoben werden, weil sie die
Empfehlung in 12.4 bestätigt oder widerlegt.

### 12.4 Empfehlung

**Standardweg für die README: npx.** Begründung: Der Einstiegswiderstand ist die
entscheidende Größe für ein quelloffenes Werkzeug, das "von jedermann einfach installiert"
werden soll. Ein Block zum Kopieren ohne vorherige Installation gewinnt gegen jeden Weg mit
Vorbedingungen.

**Empfohlener Weg für den Dauerbetrieb: globale Installation mit absolutem Pfad.** Der
Einrichtungsassistent aus Abschnitt 14 soll deshalb beide Varianten anbieten und die
globale Installation als "empfohlen, falls du den Server regelmäßig nutzt" kennzeichnen.
Er kann den absoluten Pfad selbst ermitteln und in die Konfiguration schreiben, womit der
`PATH`-Fallstrick entfällt.

**Lokaler Klon:** ausschließlich im Abschnitt "Entwicklung" der README, nicht im
Installationsteil.

**Immer mitgeben:** `-y` bei npx, und für Codex zusätzlich `startup_timeout_sec = 30`.

---

## 13. Übergabe der Zugangsdaten

BuchhaltungsButler braucht drei Werte (`DOC-GRUNDLAGEN`, Abschnitt 2):

| Wert | Verwendung |
| --- | --- |
| API Client | Benutzername der HTTP-Basic-Authentifizierung |
| API Secret | Passwort der HTTP-Basic-Authentifizierung |
| `api_key` | Feld im JSON-Body, wählt den Mandanten aus |

Alle drei sind vertraulich. Der `api_key` ist kein harmloser Bezeichner: Er entscheidet,
wessen Buchhaltung bearbeitet wird.

### 13.1 Die drei möglichen Wege

**Kommandozeilenargumente: ausgeschlossen.**

Gründe, in der Reihenfolge ihrer Schwere:

1. Argumente eines Prozesses sind auf allen gängigen Systemen für andere Prozesse desselben
   Nutzers sichtbar. Unter Linux über `/proc/<pid>/cmdline`, auf macOS und Linux über
   `ps -ef`, unter Windows über WMI beziehungsweise CIM. Jedes beliebige Programm, das der
   Nutzer startet, kann die Werte mitlesen.
2. MCP-Clients protokollieren regelmäßig die Startzeile eines Servers. Claude Desktop
   schreibt die Standardfehlerausgabe eines Servers nach `mcp-server-<name>.log`; die
   Startzeile landet in solchen Protokollen und damit in Fehlerberichten und Bildschirmfotos.
3. Der Aufruf landet in der Shell-History, wenn der Nutzer ihn einmal manuell ausprobiert.
4. Die Konfigurationsdatei mit dem Argument wird eingecheckt, weil sie aussieht wie eine
   normale Konfiguration.

Unser Server darf deshalb keine Option `--api-key` und keine Entsprechung anbieten. Wenn ein
solches Argument nicht existiert, kann es auch niemand benutzen.

**Konfigurationsdatei des Clients: funktioniert, aber mit Vorbehalt.**

Die Werte stehen im Klartext in `claude_desktop_config.json`, `mcp_config.json` und so weiter.
Diese Dateien liegen im Nutzerprofil, werden von Sicherungsprogrammen erfasst, wandern über
Einstellungsabgleich zwischen Geräten und werden in Fehlerberichten weitergegeben. Clients mit
`${VAR}`-Ersetzung (Claude Code, Grok), mit `${env:...}` (Cursor) oder mit `inputs`
(VS Code) vermeiden das; Claude Desktop, Windsurf, Zed, Cline und LM Studio nach heutigem
Stand nicht.

**Umgebungsvariablen: der richtige Weg.**

Sie sind der von jedem MCP-Client unterstützte Übergabeweg (`env`), sie tauchen nicht in
Prozesslisten auf, und sie erlauben in mehreren Clients, dass die Konfigurationsdatei nur
den Namen und nicht den Wert enthält.

### 13.2 Empfehlung für unseren Server

**Namen der Umgebungsvariablen**, konsistent mit der bereits bestehenden Projektdoku
`DOC-GRUNDLAGEN`, die in ihren curl-Beispielen genau diese Namen verwendet:

| Variable | Inhalt | Pflicht |
| --- | --- | --- |
| `BB_API_CLIENT` | API Client, Basic-Auth-Benutzername | ja |
| `BB_API_SECRET` | API Secret, Basic-Auth-Passwort | ja |
| `BB_API_KEY` | `api_key`, Mandantenauswahl | ja |

Optionale Variablen, als Vorschlag:

| Variable | Inhalt | Vorgabe |
| --- | --- | --- |
| `BB_BASE_URL` | Basis-URL der API | `https://webapp.buchhaltungsbutler.de/api/v1` |
| `BB_PROFILE` | Name eines Profils in der Zugangsdatendatei | `default` |
| `BB_CONFIG_DIR` | Ort der Zugangsdatendatei | siehe unten |
| `BB_READ_ONLY` | `1` schaltet alle schreibenden Werkzeuge ab | nicht gesetzt |
| `BB_LOG_LEVEL` | Protokollstufe auf stderr | `warn` |

`BB_READ_ONLY` ist keine Nebensache. Es erlaubt einem Nutzer, den Server gefahrlos in
Clients zu betreiben, die Werkzeugaufrufe pauschal freigeben, etwa Jan mit "Allow All MCP
Tool Permissions". Das gehört in die erste Version.

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in den Abschnitten 6.1, 6.5 und 12, Streitfragen S7 und S8.** Zwei Festlegungen
> dieses Abschnitts sind überholt:
>
> 1. **Kanonisch ist `BB_MCP_READ_ONLY`, nicht `BB_READ_ONLY`.** Der wortwörtlich
>    vorgeschriebene Absagetext aus `tool-design.md` 9.5 nennt genau diesen Namen, und eine
>    Absage, die eine nicht existierende Variable nennt, ist schlimmer als ein längerer Name.
>    `BB_READ_ONLY` wird weiterhin **akzeptiert**, erzeugt aber eine Warnung auf stderr und
>    erscheint in der README nicht mehr. Sind beide gesetzt und widersprechen sich, **bricht der
>    Server beim Start ab** und nennt beide Variablen mit ihren Werten. Der Wertebereich ist
>    `true`/`false` mit der Vorgabe `false`, nicht `1`.
> 2. **Punkt 3 der Auflösungsreihenfolge unten gilt nicht.** Fehlt nach Umgebung und
>    Zugangsdatendatei ein Wert, **bricht der Server nicht ab, sondern startet** und registriert
>    alle 54 Werkzeuge. Auf stderr steht sofort eine mehrzeilige Warnung mit der Liste der
>    fehlenden Werte, die `instructions` beginnen mit „NICHT KONFIGURIERT", und jeder
>    Werkzeugaufruf antwortet mit einem Fehler, der die fehlende Variable nennt und sagt, dass
>    nichts an BuchhaltungsButler hinausgegangen ist. Begründung: Bei einem Abbruch meldet der
>    Client nur „Server konnte nicht gestartet werden"; der Agent sieht kein Werkzeug und kann
>    dem Nutzer nichts sagen, und die Ursache steht in einer Protokolldatei, die niemand öffnet.
>    Der Zielleser ist ein Buchhalter, nicht jemand, der weiß, wohin sein Client stderr
>    schreibt. **Umgekehrt gilt weiterhin ein Abbruch bei einem unbrauchbaren Wert** einer
>    optionalen Variablen: `BB_MCP_READ_ONLY=ture` darf nicht stillschweigend „aus" bedeuten.

**Auflösungsreihenfolge im Server**, verbindlich:

1. Umgebungsvariablen `BB_API_CLIENT`, `BB_API_SECRET`, `BB_API_KEY`. Sind alle drei gesetzt,
   wird nichts anderes gelesen.
2. Zugangsdatendatei, Profil aus `BB_PROFILE`, sonst `default`.
3. Fehlt danach noch etwas: Abbruch mit einer Fehlermeldung auf stderr, die genau benennt,
   welcher Wert fehlt und welche zwei Wege es gibt. Kein stiller Start, keine anonymen
   Aufrufe.

**Zugangsdatendatei**, geschrieben vom Einrichtungsassistenten:

| Betriebssystem | Pfad |
| --- | --- |
| macOS und Linux | `${XDG_CONFIG_HOME:-~/.config}/buchhaltungsbutler-mcp/credentials.json` |
| Windows | `%APPDATA%\buchhaltungsbutler-mcp\credentials.json` |

Der Verzeichnisname bleibt bewusst `buchhaltungsbutler-mcp`, also ohne den Namensraum
`@dennismenken`. Ein Verzeichnisname ist kein Paketname, und ein `/` im Namen wäre unter
Windows nicht darstellbar, weil es dort der Pfadtrenner ist; unter macOS und Linux entstünde
eine überflüssige Zwischenebene. Dasselbe gilt für den Pfad der `envFile` im Cursor-Beispiel
in Abschnitt 8.

Dateirechte `0600`, Verzeichnisrechte `0700`. Der Server prüft die Rechte beim Lesen und
warnt auf stderr, wenn die Datei für Gruppe oder andere lesbar ist. Format:

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "api_client": "PLATZHALTER_API_CLIENT",
      "api_secret": "PLATZHALTER_API_SECRET",
      "api_key": "PLATZHALTER_API_KEY",
      "label": "Musterfirma GmbH"
    }
  }
}
```

Der Nutzen dieser Datei geht über Sicherheit hinaus: Ein Steuerberater oder eine Agentur
betreut mehrere Mandanten mit demselben Client-Secret-Paar und wechselndem `api_key`
(`DOC-GRUNDLAGEN`, Abschnitt 2). Profile bilden genau diesen Fall ab, ohne dass in jedem
Client eine eigene Serverinstanz eingetragen werden muss.

**Gegen einen Schlüsselbund im ersten Wurf.** Ein Betriebssystem-Schlüsselbund (Keychain,
Credential Manager, libsecret) wäre der nächste Schritt. Er kostet eine plattformabhängige
native Abhängigkeit, die die Installation über npx spürbar erschwert und auf Linux ohne
laufenden Schlüsselbunddienst scheitert. Vorschlag: später als optionaler Rückfallweg hinter
einem Schalter, nicht in Version 1. Das ist eine Projektentscheidung, keine belegte Aussage.

**Was der Server niemals tun darf:**

* die drei Werte auf stdout schreiben; stdout gehört ausschließlich dem MCP-Protokoll
* die Werte in Fehlermeldungen an das Modell zurückgeben
* die Werte in Protokollzeilen auf stderr schreiben, auch nicht gekürzt
* die Werte in Fehlertexten wiederholen, die ein Client in einem Fehlerbericht mitschickt

Der letzte Punkt hat einen belegten Präzedenzfall: `CC-MCP` beschreibt, dass Claude Code
gerade deshalb keine aufgelöste Server-URL in Fehlerdetails aufnimmt und
zugangsdatenähnlichen Text daraus entfernt. Wir übernehmen dieselbe Haltung.

---

## 14. Entwurf für einen Einrichtungsassistenten

### 14.1 Aufruf

Die Befehlsform, die gebaut wird, auf Grundlage des endgültigen Paketnamens
`@dennismenken/buchhaltungsbutler-mcp` und des Binaries `bbutler-mcp` (Abschnitt 15):

```
bbutler-mcp [<unterbefehl>] [optionen]
```

Drei Wege führen zu genau diesem Programm:

| Weg | Aufruf |
| --- | --- |
| ohne Installation, der Weg der README | `npx -y @dennismenken/buchhaltungsbutler-mcp <unterbefehl>` |
| nach `npm install -g @dennismenken/buchhaltungsbutler-mcp` | `bbutler-mcp <unterbefehl>` |
| ausdrücklich, unabhängig von der bin-Auflösung von npm | `npx -y --package=@dennismenken/buchhaltungsbutler-mcp bbutler-mcp <unterbefehl>` |

Der Einstieg lautet also:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup
```

oder nach globaler Installation:

```bash
bbutler-mcp setup
```

**Ohne Unterbefehl startet der MCP-Server auf stdio.** Das ist der Normalfall und der Grund,
warum die Konfigurationsblöcke in allen Clients ohne ein einziges Argument hinter dem
Paketnamen auskommen. Jeder Unterbefehl ist ein Ausbruch aus diesem Normalfall und schreibt
ausschließlich auf stdout und stderr eines Terminals, niemals in eine laufende
MCP-Verbindung.

Vollständige Befehlsform, die sich aus diesem Abschnitt und aus 14.4 ergibt:

| Aufruf | Wirkung |
| --- | --- |
| `bbutler-mcp` | startet den MCP-Server auf stdio |
| `bbutler-mcp setup` | Einrichtungsassistent, Ablauf in 14.2 |
| `bbutler-mcp doctor` | Zugangsdaten auflösen, Verbindung testen, Dateirechte und gefundene Clientkonfigurationen prüfen |
| `bbutler-mcp test` | nur der Verbindungstest aus Schritt 3, geeignet für CI |
| `bbutler-mcp profiles list\|add\|remove` | Mandantenprofile in der Zugangsdatendatei verwalten |
| `bbutler-mcp print-config --client <name>` | den fertigen Konfigurationsblock ausgeben, nichts schreiben |
| `bbutler-mcp uninstall --client <name>` | den eigenen Eintrag beim genannten Client entfernen |
| `bbutler-mcp --version` | Version des Pakets |
| `bbutler-mcp --help` | Hilfe, inklusive der Liste der unterstützten Clientkürzel |

Die Clientkürzel für `--client` sind die Namen aus Abschnitt 14.3 in Kleinschreibung mit
Bindestrich: `claude-code`, `claude-desktop`, `codex`, `grok`, `vscode`, `cursor`,
`windsurf`, `lmstudio`, `cline`, `zed`, `continue`, `jan`.

Nicht interaktive Nutzung, für Skripte:

```bash
bbutler-mcp setup \
  --client claude-code \
  --scope user \
  --start npx \
  --non-interactive \
  --print-only
```

Dieselbe Zeile ohne vorherige Installation:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup \
  --client claude-code \
  --scope user \
  --start npx \
  --non-interactive \
  --print-only
```

`--start npx` schreibt `npx -y @dennismenken/buchhaltungsbutler-mcp` in die erzeugte
Konfiguration, `--start global` den absoluten Pfad des installierten Binaries `bbutler-mcp`
(Schritt 4 in 14.2).

Zugangsdaten werden auch hier nicht als Argument entgegengenommen. Im nicht interaktiven
Modus liest der Assistent sie ausschließlich aus `BB_API_CLIENT`, `BB_API_SECRET` und
`BB_API_KEY`.

### 14.2 Ablauf

**Schritt 1, Vorprüfung.** Node-Version gegen die Mindestanforderung prüfen (`>=22.12.0`,
verbindlich laut `docs/entwicklung/toolchain.md`, Abschnitte 3.2 und 3.3) und abbrechen,
wenn sie unterschritten ist. Erkennen, welche der unterstützten Clients auf dem System
vorhanden sind: über `which`/`where` für `claude`, `codex`, `grok`, `code`, und über die
Existenz der bekannten Konfigurationspfade für Claude Desktop, Cursor, Windsurf, LM Studio.
Nur gefundene Clients zuerst anbieten, die übrigen unter "Weitere" .

**Schritt 2, Zugangsdaten erfragen.** Drei Eingaben, alle maskiert. Dazu ein kurzer Hinweis,
wo die Werte in BuchhaltungsButler zu finden sind: Einstellungen, Schnittstellen, API-Zugang
(`DOC-GRUNDLAGEN`, Abschnitt 2.3; die Quellen widersprechen sich dort in der genauen
Menüführung, der Assistent sollte deshalb beide genannten Orte nennen und nicht so tun, als
gäbe es nur einen). Bereits gesetzte Umgebungsvariablen werden als Vorbelegung erkannt und
angeboten, ohne den Wert anzuzeigen.

**Schritt 3, Verbindung testen.** Ein einziger lesender Aufruf gegen `/accounts/get` mit dem
Body `{"api_key": "..."}`. Dieser Endpunkt ist die leichteste Leseoperation der API
(`DOC-GRUNDLAGEN`). Die Fehlerbehandlung muss die drei Werte auseinanderhalten, weil genau
hier der Nutzen des Assistenten liegt:

| Ergebnis | Deutung für den Nutzer |
| --- | --- |
| `200` mit `success: true` | Zugangsdaten vollständig gültig |
| `401`, `error_code` 3 | API Client oder API Secret falsch |
| `401`, `error_code` 4 | `api_key` falsch, oder dieser Client darf diesen Mandanten nicht bedienen |
| `429` | Ratenbegrenzung, später erneut versuchen |
| Netzwerkfehler | Verbindung zu `webapp.buchhaltungsbutler.de` prüfen, Proxy, Firewall |

Die Fehlercodes stammen aus `DOC-GRUNDLAGEN`, Abschnitt 2.4. Ohne diese Unterscheidung ist
der Test wertlos, weil "Anmeldung fehlgeschlagen" den Nutzer nicht weiterbringt.

Bei Erfolg zusätzlich den Anzeigenamen des Mandanten aus der Antwort holen, sofern
vorhanden, und zur Bestätigung anzeigen: "Verbunden mit: …". So merkt der Nutzer sofort,
wenn er den `api_key` des falschen Mandanten eingetragen hat.

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 8.2, Schritt 4 und in Abschnitt 12, Streitfrage S24.** **Der
> Bestätigungstext „Verbunden mit …" ist so nicht baubar.** `/accounts/get` liefert je Zeile nur
> `name` und `postingaccount_number` und **keinen Mandantennamen**; das ist live belegt. An seine
> Stelle tritt eine Rückfrage, die denselben Zweck erfüllt: Der Assistent zeigt die gefundenen
> Zahlungskonten mit Nummer und Namen und fragt „Gehören diese Konten zu dem Mandanten, den Sie
> verbinden wollen? [j/n]". Antwortet der Nutzer mit nein, ist der `api_key` der falsche, und der
> Assistent sagt genau das. Eine reine Anzeige ohne Frage wird überlesen; die Rückfrage ist der
> einzige Schutz gegen den teuersten aller Einrichtungsfehler, den `api_key` eines fremden
> Mandanten. Ebenfalls nachgezogen: Die Node-Untergrenze in Schritt 1 lautet **`>=22.19.0`**,
> nicht `>=22.12.0` (Umsetzungsplan 13.1).

**Schritt 4, Startvariante wählen.** npx (Vorgabe) oder globale Installation. Bei globaler
Installation ermittelt der Assistent den absoluten Pfad des installierten Binaries und
schreibt diesen, statt sich auf `PATH` zu verlassen.

**Schritt 5, Ablageort der Zugangsdaten wählen.**

1. Zugangsdatendatei mit Rechten `0600` (Vorgabe, empfohlen). Die Clientkonfiguration
   enthält dann gar keine Geheimnisse.
2. Direkt in die Clientkonfiguration, für Nutzer, die das ausdrücklich wollen. Mit einem
   Hinweis, dass die Datei damit schutzbedürftig wird.
3. Nichts schreiben, der Nutzer setzt die Umgebungsvariablen selbst.

**Schritt 6, Clients auswählen.** Mehrfachauswahl, weil die meisten Nutzer mehr als einen
Client haben.

**Schritt 7, Vorschau und Bestätigung.** Vor jedem Schreibvorgang den vollständigen Pfad und
den einzufügenden Block anzeigen, Geheimnisse dabei maskiert. Erst danach schreiben. Bei
jeder Änderung an einer bestehenden Datei vorher eine Sicherung als
`<datei>.bak-<zeitstempel>` anlegen und den Pfad der Sicherung nennen. Bestehende Einträge
werden nicht überschrieben, ohne dass ausdrücklich zugestimmt wurde.

**Schritt 8, Abschluss.** Je Client eine Zeile, was zu tun ist, damit die Änderung wirkt:
Claude Desktop vollständig beenden und neu starten, Cursor neu laden, VS Code den Server
starten, Codex und Grok brauchen keinen Neustart. Dazu die passende Prüfzeile, etwa
`claude mcp get bbutler` oder `grok mcp doctor bbutler`.

### 14.3 Welche Clients der Assistent automatisch konfigurieren kann

| Client | Automatisch möglich | Weg | Begründung |
| --- | --- | --- | --- |
| Claude Code | ja | `claude mcp add-json` als Unterprozess | offizielle CLI, kein Dateiformat nachbauen |
| Codex CLI und ChatGPT Desktop | ja | `codex mcp add` als Unterprozess | TOML von Hand zu ändern ist fehleranfällig, die CLI erhält Kommentare und Formatierung |
| Grok Build | ja | `grok mcp add` als Unterprozess | wie Codex |
| VS Code | ja | `code --add-mcp` für das Profil, oder `.vscode/mcp.json` schreiben | für `inputs` muss die Datei geschrieben werden, `--add-mcp` kann das nicht |
| Claude Desktop | ja | `claude_desktop_config.json` lesen, JSON ergänzen, zurückschreiben | reines JSON, verlustfrei änderbar |
| Cursor | ja | `~/.cursor/mcp.json` oder `.cursor/mcp.json` | reines JSON |
| Windsurf | ja | `~/.codeium/windsurf/mcp_config.json` | reines JSON |
| LM Studio | ja, mit Vorbehalt | `~/.lmstudio/mcp.json` | Pfad laut Fehlerbericht nicht überall zutreffend; bei Nichtvorhandensein nur ausgeben |
| Cline, CLI-Variante | ja | `~/.cline/mcp.json` | reines JSON |
| Zed | nein, nur ausgeben | `settings.json` ist JSONC mit Kommentaren | maschinelles Ändern würde Kommentare zerstören |
| Continue | nein, nur ausgeben | YAML im Arbeitsbereich | Ablageort hängt vom Projekt ab |
| Cline, IDE-Variante | nein, nur ausgeben | Oberfläche | kein dokumentierter Dateipfad |
| Jan | nein, nur ausgeben | Oberfläche | kein dokumentierter Dateipfad |
| ChatGPT im Browser | nein | technisch ausgeschlossen | siehe Abschnitt 6.2 |

Regel: Wo eine offizielle CLI existiert, wird sie aufgerufen statt die Datei nachzubauen.
Wo nur eine Datei existiert und diese reines JSON ist, wird geschrieben. Wo das Format
Kommentare tragen kann oder der Pfad nicht dokumentiert ist, wird der fertige Block
ausgegeben, zusammen mit dem Ort, an dem er einzufügen ist. Raten wird nicht gemacht.

### 14.4 Weitere Unterbefehle

Sinnvolle Ergänzungen, in absteigender Wichtigkeit:

| Unterbefehl | Zweck |
| --- | --- |
| `doctor` | Zugangsdaten auflösen, Verbindung testen, Dateirechte der Zugangsdatendatei prüfen, gefundene Clientkonfigurationen auflisten. Die Ausgabe ist das, was in einen Fehlerbericht gehört. Ohne Geheimnisse. |
| `test` | nur der Verbindungstest aus Schritt 3, geeignet für CI |
| `profiles list` / `profiles add` / `profiles remove` | Mandanten verwalten |
| `print-config --client <name>` | nur den Block ausgeben, nichts schreiben |
| `uninstall --client <name>` | den eigenen Eintrag wieder entfernen |

`doctor` ist der Unterbefehl, der die meisten Supportanfragen abfängt. Grok liefert mit
`grok mcp doctor` den Beleg, dass diese Funktion an dieser Stelle erwartet wird.

---

## 15. Der Paketname: Entscheidung und Namenskonflikt auf npm

Quellen: `NPM-REG`, `WEB-CHECK`, `LOCAL-NPM`. Alle Abfragen am 2026-09-12.

### 15.1 Die Entscheidung

Der Paketname dieses Projekts lautet **`@dennismenken/buchhaltungsbutler-mcp`**. Er wird auf
npm mit `npm publish --access public` veröffentlicht. Das GitHub-Repository heißt
`dennismenken/buchhaltungsbutler-mcp`, ist öffentlich und wird erst am Ende der Arbeiten
angelegt. Der ungescopte Name `buchhaltungsbutler-mcp` darf in keiner Anleitung dieses
Projekts als unser Paketname auftauchen; er ist auf npm bereits vergeben (15.2).

Zu `--access public`: npm behandelt ein gescoptes Paket ohne diese Angabe als `restricted`,
also privat. Die Angabe ist beim ersten `npm publish` deshalb Pflicht, sonst scheitert die
Veröffentlichung an der fehlenden Berechtigung für private Pakete oder das Paket ist
anschließend für niemanden installierbar.

Stand des Repositoriums am 2026-09-12 (`WEB-CHECK`): `https://github.com/dennismenken`
antwortet mit HTTP 200, `https://github.com/dennismenken/buchhaltungsbutler-mcp` mit
HTTP 404. Das ist der erwartete Zustand, weil das Repository bewusst zuletzt angelegt wird.

Offen bleibt ein Pflichtschritt vor der ersten Veröffentlichung, siehe 15.4.

### 15.2 Der ungescopte Name ist auf npm vergeben

Unter dem ungescopten Namen `buchhaltungsbutler-mcp` liegt auf npm bereits ein Paket, das
nicht zu diesem Projekt gehört. Die Registry antwortet auf eine direkte Abfrage von
`https://registry.npmjs.org/buchhaltungsbutler-mcp` am 2026-09-12 mit HTTP 200. Für die
Entscheidung in 15.1 zählen aus dieser Abfrage genau zwei Angaben:

| Feld | Wert |
| --- | --- |
| Name | `buchhaltungsbutler-mcp`, vergeben |
| `bin` | `buchhaltungsbutler-mcp` |

Daraus folgen zwei Dinge, und beide sind der Grund für die Entscheidung in 15.1:

1. Ein Aufruf `npx -y buchhaltungsbutler-mcp` startet nicht unseren Server, sondern das unter
   diesem Namen veröffentlichte Paket. Das ist kein Schönheitsfehler, sondern ein
   Sicherheitsproblem: Nutzer würden ihre BuchhaltungsButler-Zugangsdaten an fremden Code
   übergeben, weil unsere Anleitung es ihnen so sagt. In diesem Dokument steht deshalb an
   keiner Stelle mehr ein Aufruf ohne den Namensraum `@dennismenken/`. Dasselbe gilt für die
   README und für jede andere Anleitung dieses Projekts.
2. Der Name des Binaries kollidiert ebenfalls. Das unter diesem Namen veröffentlichte Paket
   legt `bin` `buchhaltungsbutler-mcp` an. Ein Nutzer, der beide Pakete global installiert,
   bekommt einen Konflikt. Unser Binary muss deshalb anders heißen, siehe 15.3.

Der Namensraum löst ausschließlich das erste Problem.

### 15.3 Der Name des Binaries

Beim `npm install -g` landet das Binary ohne Namensraum im Binärverzeichnis von npm. Dort
entscheidet allein der `bin`-Name, ob es zu einer Kollision kommt. Geprüft am 2026-09-12,
jeweils per HTTP-Abfrage von `https://registry.npmjs.org/<name>` (`NPM-REG`):

| Kandidat | Befund |
| --- | --- |
| `buchhaltungsbutler-mcp` | belegt. Das Paket aus 15.2 legt genau dieses Binary an. Ausgeschlossen. |
| `bb-mcp` | belegt. Auf npm liegt ein Paket `bb-mcp` 1.0.0, "MCP server for Bitbucket Server", Betreuer `g7v`, veröffentlicht 2026-06-19, mit `bin` `bb-mcp` auf `dist/index.js`. Ausgeschlossen. |
| `bbutler-mcp` | kein Paket dieses Namens veröffentlicht, HTTP 404. Gewählt. |

**Gewählt: `bbutler-mcp`.** Die frühere Fassung dieses Abschnitts hat `bb-mcp` oder
`init4-bb-mcp` vorgeschlagen. `bb-mcp` ist nach der Abfrage oben falsch, der Vorschlag war
nicht gegen die Registry geprüft; `init4-bb-mcp` passt nach der Entscheidung aus 15.1 nicht
mehr zum Namensraum. Beides ist damit erledigt.

Die Wahl des bin-Namens ist eine abgeleitete Projektentscheidung dieses Dossiers. Die
Inhaberentscheidung legt den npm-Paketnamen fest, nicht den Namen des Binaries; sie ist
insofern durch diese Wahl nicht berührt und kann sie jederzeit überstimmen (Abschnitt 16).

Ausdrücklicher Vorbehalt: Ein freier **Paketname** belegt nicht, dass der **bin**-Name frei
ist. Jedes Paket darf ein Binary beliebigen Namens anlegen, unabhängig davon, wie es selbst
heißt. Die Registry-Abfrage ist der bestmögliche Indikator, aber kein Beweis. Eine Prüfung
aller `bin`-Einträge der Registry ist mit vertretbarem Aufwand nicht möglich und wurde
**nicht durchgeführt**.

Zwei Auflagen für die Implementierung:

1. Die `package.json` bekommt genau einen `bin`-Eintrag, nämlich `bbutler-mcp`. Nur dann
   findet `npx -y @dennismenken/buchhaltungsbutler-mcp` das Binary, obwohl dessen Name vom
   Paketnamen abweicht. Die Regel und ihre Grenzen stehen in Abschnitt 12.1, geprüft an
   npm 10.9.8 (`LOCAL-NPM`).
2. In die Fehlersuche der README gehört `which bbutler-mcp` beziehungsweise
   `where bbutler-mcp`, nicht der Paketname. Ein Nutzer, der dort den Paketnamen eintippt,
   bekommt keinen Treffer und hält den Server fälschlich für defekt.

### 15.4 Pflichtschritt vor der ersten Veröffentlichung

Ob der Namensraum `@dennismenken` auf npmjs.com dem eigenen Konto gehört, ist **nicht
verifiziert**. Belegt ist allein, dass
`https://registry.npmjs.org/@dennismenken%2Fbuchhaltungsbutler-mcp` am 2026-09-12 mit
HTTP 404 antwortet (`NPM-REG`). Das besagt ausschließlich, dass unter genau diesem Namen
nichts veröffentlicht ist. Es besagt **nicht**, dass der Namensraum verfügbar ist oder dem
eigenen Konto zugeordnet werden kann: Ein Namensraum gehört auf npmjs.com einem Nutzerkonto
oder einer Organisation; hält ihn ein Fremder, scheitert `npm publish` an einem
Berechtigungsfehler, obwohl die Registry auf den Paketnamen mit 404 antwortet. Der Versuch,
das über die Profilseite `https://www.npmjs.com/~dennismenken` zu klären, führt nicht weiter:
Der Abruf beantwortet die Frage nicht, er liefert HTTP 403 (`WEB-CHECK`).

**Pflichtschritt:** Vor dem ersten `npm publish` ist auf npmjs.com angemeldet zu prüfen, ob
der Namensraum `@dennismenken` zum eigenen Konto gehört. Bei einem Nutzer-Namensraum ist das
genau dann der Fall, wenn der eigene npm-Benutzername `dennismenken` lautet. Stimmt er nicht
überein, ist `dennismenken` als Organisation anzulegen, sofern der Name dort noch frei ist.
Erst danach:

```bash
npm publish --access public
```

`toolchain.md`, Abschnitt 9.1, nennt für dieselbe Frage noch den Namensraum `@init4` und ist
insoweit überholt; die Inhaberentscheidung zum Paketnamen geht vor. Der dort formulierte
Vorbehalt selbst gilt unverändert weiter, nur eben für `@dennismenken`: Ein 404 auf einen
gescopten Paketnamen ist kein verlässlicher Nachweis der Publizierbarkeit. Die Angleichung
von `toolchain.md` steht noch aus und ist nicht Gegenstand dieses Dokuments.

### 15.5 Rückfallebene, falls der Namensraum nicht verfügbar ist

Vor der Entscheidung geprüfte ungescopte Kandidaten, Stand 2026-09-12, jeweils HTTP-Abfrage
von `https://registry.npmjs.org/<name>` (`NPM-REG`):

| Kandidat | Status |
| --- | --- |
| `mcp-buchhaltungsbutler` | frei, HTTP 404 auf der Registry |
| `buchhaltungsbutler-mcp-server` | frei, HTTP 404 auf der Registry |
| `buchhaltungsbutler` | frei, HTTP 404 auf der Registry |

Bei einem ungescopten Namen trägt der 404 die volle Aussage: Unter diesem Namen ist nichts
veröffentlicht, der Name ist zum Abrufzeitpunkt frei. Diese Kandidaten sind mit der
Entscheidung aus 15.1 hinfällig und stehen hier nur noch für den Fall, dass der
Pflichtschritt aus 15.4 ergibt, dass der Namensraum nicht zu bekommen ist. Ihre
Verfügbarkeit wäre dann unmittelbar vor der Veröffentlichung erneut abzufragen, weil ein 404
nur eine Momentaufnahme ist und ein ungescopter Name jederzeit von einem Dritten belegt
werden kann. Dass genau das mit einem naheliegenden Namen passiert, ist bei
`buchhaltungsbutler-mcp` bereits eingetreten.

---

## 16. Offene Punkte und Annahmen

Was in diesem Dokument nicht belegt werden konnte, ausdrücklich benannt:

| Punkt | Stand |
| --- | --- |
| Kaltstartdauer von `npx -y` für unser Paket | **nicht gemessen**, siehe 12.3. Vor der Veröffentlichung einmal real erheben. |
| Windows-Pfade mit `%USERPROFILE%` für `~/.claude.json`, `~/.codex/config.toml`, `~/.grok/config.toml`, `~/.cursor/mcp.json` | **Annahme** aus der Home-Verzeichnis-Konvention, in den Primärquellen nicht wörtlich genannt |
| Claude Desktop unter Linux | offiziell nicht unterstützt. `~/.config/Claude/claude_desktop_config.json` ist **nicht verifiziert**. |
| Vorgabewert von `MCP_TIMEOUT` in Claude Code | in `CC-MCP` **nicht beziffert** |
| Verfügbarkeit des npm-Namensraums `@dennismenken` für eine eigene Veröffentlichung | **nicht verifiziert**, siehe 15.4. Belegt ist nur der HTTP 404 auf `@dennismenken/buchhaltungsbutler-mcp` und ein HTTP 403 beim Abruf der npmjs.com-Profilseite. Vor dem ersten `npm publish` angemeldet auf npmjs.com zu prüfen beziehungsweise als Organisation anzulegen. |
| Name des Binaries `bbutler-mcp` | abgeleitete Projektentscheidung dieses Dossiers, siehe 15.3, nicht Teil der Inhaberentscheidung zum Paketnamen. Belegt ist, dass `buchhaltungsbutler-mcp` und `bb-mcp` als Binärnamen anderer Pakete bereits existieren und dass kein npm-Paket `bbutler-mcp` heißt. Dass der **bin**-Name `bbutler-mcp` frei ist, folgt daraus **nicht zwingend**. |
| bin-Auflösung von npx bei abweichendem Binärnamen | am Quelltext der lokal installierten npm-Fassung 10.9.8 geprüft (`LOCAL-NPM`). Für andere npm-Fassungen **nicht verifiziert**; die Form `npx -y --package=… bbutler-mcp` kommt ohne diese Regel aus. |
| Verhalten von `@` am Anfang eines Arguments in PowerShell | **nicht verifiziert**, PowerShell steht auf dem Entwicklungsrechner nicht zur Verfügung. Anführungszeichen um den Paketnamen sind in jeder Shell korrekt, siehe 11.1. |
| Zulässigkeit von `@` und `/` im Feld `name` eines `.mcpb`-Manifests | **nicht verifiziert**, deshalb steht dort `bbutler-mcp`, siehe 4.2 |
| `toolchain.md`, Abschnitt 9.1, nennt weiterhin den Namensraum `@init4` | Widerspruch zur Entscheidung zum Paketnamen, siehe 15.4. Angleichung steht aus, außerhalb dieses Dokuments. |
| Manifest-Entwurf für `.mcpb` in Abschnitt 4.2 | **nicht verifiziert** gegen `MANIFEST.md`; mit `mcpb validate` gegenzuprüfen |
| `mcpb validate` und `mcpb sign`, genaue Syntax | **nicht verifiziert** |
| `settings.json`-Pfade von Zed | aus der Primärquelle **nicht verifiziert** |
| LM Studio, tatsächlicher Pfad von `mcp.json` auf macOS | offener Fehlerbericht, **nicht verifiziert** |
| LM Studio, Unterstützung von `command`/`args`/`env` | aus dem allgemeinen Schema abgeleitet, in der Primärquelle **nicht wörtlich belegt** |
| Jan, Konfigurationsdateipfad | **nicht belegt**; nur über Suchtreffer ausgewertet |
| Cline, Dateipfade der IDE-Erweiterung je Betriebssystem | **nicht dokumentiert** |
| Kommandozeilenbefehl zum Hinzufügen in Cursor, Windsurf, Zed, Continue | **nicht dokumentiert** |
| MCP in der Grok-Chatoberfläche auf grok.com oder in der X-App | **nicht belegt**; belastbar ist nur Grok Build |
| `CODEX_HOME`, genaue Semantik | in `CODEX-MCP` **nicht beschrieben** |
| Widerspruch in `DOC-GRUNDLAGEN` zum Fundort der Zugangsdaten in der BuchhaltungsButler-Oberfläche | dort bereits vermerkt, wirkt sich auf den Hinweistext des Assistenten aus (Abschnitt 14.2) |

---

## 17. Textbausteine für die README

Alle Blöcke verwenden den endgültigen Paketnamen `@dennismenken/buchhaltungsbutler-mcp`, das
Binary `bbutler-mcp` und Platzhalter für die Zugangsdaten. Der Paketname ist entschieden
(Abschnitt 15.1); offen ist allein der Pflichtschritt zum Namensraum vor der ersten
Veröffentlichung (Abschnitt 15.4). Ein Baustein, in dem der Paketname ohne `@dennismenken/`
steht, ist fehlerhaft und würde auf das Paket zeigen, das unter dem ungescopten Namen liegt
(Abschnitt 15.2).

Die Node-Untergrenze lautet in allen Bausteinen `22.12.0`. Das ist der verbindliche
Projektwert aus `docs/entwicklung/toolchain.md`, Abschnitte 3.2 und 3.3. Der Wert von
`engines.node` anderer Pakete ist dafür ohne Belang.

### 17.1 Voraussetzungen

````markdown
## Voraussetzungen

- Node.js 22.12.0 oder neuer (verbindliche Untergrenze dieses Projekts, gesetzt im Feld
  `engines.node` der `package.json`; Begründung in `docs/entwicklung/toolchain.md`,
  Abschnitte 3.2 und 3.3)
- Ein BuchhaltungsButler-Konto mit aktivierter API-Schnittstelle
- Die drei Zugangsdaten aus BuchhaltungsButler: API Client, API Secret und API Key

Die drei Werte findest du in BuchhaltungsButler unter Einstellungen im Bereich für
Schnittstellen und API-Zugang. Behandle sie wie ein Passwort.
````

### 17.2 Schnellstart mit dem Einrichtungsassistenten

````markdown
## Schnellstart

Der Assistent fragt die Zugangsdaten ab, testet die Verbindung und schreibt die
Konfiguration für den Client deiner Wahl:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup
```

Wenn du lieber von Hand einrichtest, findest du unten für jeden Client den passenden Block.
````

### 17.3 Claude Code

````markdown
### Claude Code

Für alle deine Projekte:

```bash
claude mcp add \
  --env BB_API_CLIENT="DEIN_API_CLIENT" \
  --env BB_API_SECRET="DEIN_API_SECRET" \
  --env BB_API_KEY="DEIN_API_KEY" \
  --transport stdio --scope user bbutler \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Nur für das aktuelle Projekt: `--scope local` statt `--scope user`.

Zum Teilen im Team legst du eine `.mcp.json` im Projektwurzelverzeichnis an. Die Datei
enthält keine Zugangsdaten, sondern Verweise auf Umgebungsvariablen:

```json
{
  "mcpServers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "${BB_API_CLIENT}",
        "BB_API_SECRET": "${BB_API_SECRET}",
        "BB_API_KEY": "${BB_API_KEY}"
      }
    }
  }
}
```

Prüfen und wieder entfernen:

```bash
claude mcp list
claude mcp get bbutler
claude mcp remove bbutler --scope user
```

In einer laufenden Sitzung zeigt `/mcp` den Status und alle Werkzeuge.
````

### 17.4 Claude Desktop

````markdown
### Claude Desktop

Öffne das Claude-Menü in der Menüleiste deines Betriebssystems, wähle Settings, dann den
Reiter Developer, dann "Edit Config". Die Datei liegt hier:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "DEIN_API_CLIENT",
        "BB_API_SECRET": "DEIN_API_SECRET",
        "BB_API_KEY": "DEIN_API_KEY"
      }
    }
  }
}
```

Danach Claude Desktop vollständig beenden und neu starten.

Claude Desktop kennt keine Verweise auf Umgebungsvariablen. Die Zugangsdaten stehen also im
Klartext in dieser Datei. Wenn dir das nicht passt, richte den Server mit
`npx -y @dennismenken/buchhaltungsbutler-mcp setup` ein; der Assistent legt die Zugangsdaten
dann in einer eigenen Datei mit eingeschränkten Rechten ab.
````

### 17.5 OpenAI Codex CLI und ChatGPT-Desktop-App

````markdown
### OpenAI Codex CLI und ChatGPT-Desktop-App

Beide teilen sich dieselbe Konfiguration. Einmal eintragen genügt:

```bash
codex mcp add bbutler \
  --env BB_API_CLIENT="DEIN_API_CLIENT" \
  --env BB_API_SECRET="DEIN_API_SECRET" \
  --env BB_API_KEY="DEIN_API_KEY" \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Oder von Hand in `~/.codex/config.toml`:

```toml
[mcp_servers.bbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
startup_timeout_sec = 30
default_tools_approval_mode = "writes"

[mcp_servers.bbutler.env]
BB_API_CLIENT = "DEIN_API_CLIENT"
BB_API_SECRET = "DEIN_API_SECRET"
BB_API_KEY = "DEIN_API_KEY"
```

`startup_timeout_sec = 30` ist empfohlen, weil der Vorgabewert 10 Sekunden für den ersten
`npx`-Start knapp sein kann. `default_tools_approval_mode = "writes"` fragt bei allen
schreibenden Werkzeugen nach und lässt lesende ohne Rückfrage durch.

Wenn du die Zugangsdaten nicht in die Datei schreiben willst, setze sie in deiner Shell und
nenne in der Konfiguration nur die Namen:

```toml
[mcp_servers.bbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
env_vars = ["BB_API_CLIENT", "BB_API_SECRET", "BB_API_KEY"]
```

Prüfen: `codex mcp list`, `codex mcp get bbutler`. Entfernen:
`codex mcp remove bbutler`. In der Oberfläche zeigt `/mcp` die aktiven Server.
````

### 17.6 ChatGPT im Browser

````markdown
### ChatGPT im Browser

Wird nicht unterstützt. ChatGPT im Browser kann keine lokalen Programme starten und spricht
ausschließlich über HTTPS mit entfernten MCP-Servern. Dieser Server läuft bewusst lokal,
damit deine Buchhaltungszugangsdaten deinen Rechner nicht verlassen.

Zwei Alternativen:

- Nutze die ChatGPT-Desktop-App. Sie teilt sich die Konfiguration mit der Codex CLI, siehe
  den Abschnitt oben.
- Betreibe OpenAIs Secure MCP Tunnel selbst. Damit erreicht ChatGPT einen privaten
  MCP-Server, ohne dass er öffentlich wird. Das setzt ein OpenAI-Platform-Konto mit den
  Tunnels-Berechtigungen, den Entwicklermodus in deinem ChatGPT-Arbeitsbereich und einen
  dauerhaft laufenden `tunnel-client` voraus. Siehe
  https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
````

### 17.7 Grok Build

````markdown
### Grok Build (xAI)

```bash
grok mcp add bbutler \
  -e BB_API_CLIENT="DEIN_API_CLIENT" \
  -e BB_API_SECRET="DEIN_API_SECRET" \
  -e BB_API_KEY="DEIN_API_KEY" \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Mit `--scope project` landet der Eintrag in `./.grok/config.toml` statt in
`~/.grok/config.toml` und kann mit dem Team geteilt werden.

Oder von Hand in `~/.grok/config.toml`:

```toml
[mcp_servers.bbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
env = { BB_API_CLIENT = "${BB_API_CLIENT}", BB_API_SECRET = "${BB_API_SECRET}", BB_API_KEY = "${BB_API_KEY}" }
startup_timeout_sec = 30
enabled = true
```

Prüfen: `grok mcp list` und `grok mcp doctor bbutler`. Entfernen:
`grok mcp remove bbutler`.
````

### 17.8 Cursor

````markdown
### Cursor

Für ein einzelnes Projekt legst du `.cursor/mcp.json` an, für alle Projekte
`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "${env:BB_API_CLIENT}",
        "BB_API_SECRET": "${env:BB_API_SECRET}",
        "BB_API_KEY": "${env:BB_API_KEY}"
      }
    }
  }
}
```

Cursor setzt `${env:NAME}` aus deiner Umgebung ein. Diese Datei enthält damit keine
Zugangsdaten und kann eingecheckt werden.

Alternativ liest Cursor die Werte aus einer Datei:

```json
{
  "mcpServers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "envFile": "${userHome}/.config/buchhaltungsbutler-mcp/credentials.env"
    }
  }
}
```

Server ein- und ausschalten kannst du unter "Customize" in der Seitenleiste. Protokolle
findest du im Output-Bereich unter "MCP Logs".
````

### 17.9 Visual Studio Code mit GitHub Copilot

````markdown
### Visual Studio Code mit GitHub Copilot

Lege `.vscode/mcp.json` in deinem Projekt an. Achtung, der Schlüssel heißt hier `servers`,
nicht `mcpServers`:

```json
{
  "servers": {
    "bbutler": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "${input:bb-api-client}",
        "BB_API_SECRET": "${input:bb-api-secret}",
        "BB_API_KEY": "${input:bb-api-key}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "bb-api-client", "description": "BuchhaltungsButler API Client", "password": true },
    { "type": "promptString", "id": "bb-api-secret", "description": "BuchhaltungsButler API Secret", "password": true },
    { "type": "promptString", "id": "bb-api-key",    "description": "BuchhaltungsButler API Key",    "password": true }
  ]
}
```

VS Code fragt die drei Werte beim ersten Start ab, maskiert die Eingabe und speichert sie
sicher. Die Datei kann deshalb eingecheckt werden.

Für dein Nutzerprofil statt eines Projekts: Befehlspalette, **MCP: Open User Configuration**.
Oder über die Kommandozeile, ohne Zugangsdaten:

```bash
code --add-mcp "{\"name\":\"bbutler\",\"command\":\"npx\",\"args\":[\"-y\",\"@dennismenken/buchhaltungsbutler-mcp\"]}"
```

Status und Protokolle: Befehlspalette, **MCP: List Servers**, Server wählen, **Show Output**.
````

### 17.10 Windsurf

````markdown
### Windsurf

Datei: `~/.codeium/windsurf/mcp_config.json`. Erreichbar auch über das Symbol `MCPs` oben
rechts im Cascade-Bereich.

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "DEIN_API_CLIENT",
        "BB_API_SECRET": "DEIN_API_SECRET",
        "BB_API_KEY": "DEIN_API_KEY"
      }
    }
  }
}
```
````

### 17.11 Zed

````markdown
### Zed

Settings, AI, MCP Servers, oder die Aktion `agent: open settings`. In der `settings.json`:

```json
{
  "context_servers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "DEIN_API_CLIENT",
        "BB_API_SECRET": "DEIN_API_SECRET",
        "BB_API_KEY": "DEIN_API_KEY"
      }
    }
  }
}
```

Zed nennt MCP-Server "context servers"; der Schlüssel heißt deshalb `context_servers`.
````

### 17.12 Cline

````markdown
### Cline

In der IDE-Erweiterung: Symbol MCP Servers in der oberen Werkzeugleiste, Reiter Configure,
Schaltfläche "Configure MCP Servers". In der CLI-Variante: `~/.cline/mcp.json`.

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "DEIN_API_CLIENT",
        "BB_API_SECRET": "DEIN_API_SECRET",
        "BB_API_KEY": "DEIN_API_KEY"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Trage unter `autoApprove` nur lesende Werkzeuge ein. Schreibende Werkzeuge legen Belege,
Zahlungen und Buchungssätze an; die sollten immer bestätigt werden.
````

### 17.13 Continue

````markdown
### Continue

Lege im Projekt den Ordner `.continue/mcpServers/` an und darin die Datei
`bbutler.yaml`:

```yaml
name: BuchhaltungsButler mcpServer
version: 0.0.1
schema: v1
mcpServers:
  - name: bbutler
    type: stdio
    command: npx
    args:
      - "-y"
      - "@dennismenken/buchhaltungsbutler-mcp"
    env:
      BB_API_CLIENT: ${{ secrets.BB_API_CLIENT }}
      BB_API_SECRET: ${{ secrets.BB_API_SECRET }}
      BB_API_KEY: ${{ secrets.BB_API_KEY }}
```

MCP funktioniert in Continue nur im Agent-Modus.
````

### 17.14 LM Studio

````markdown
### LM Studio

Ab LM Studio 0.3.17. Öffne den Reiter "Program" in der rechten Seitenleiste, dann
`Install`, dann `Edit mcp.json`. Die Datei liegt unter `~/.lmstudio/mcp.json` (macOS und
Linux) beziehungsweise `%USERPROFILE%/.lmstudio/mcp.json` (Windows).

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "DEIN_API_CLIENT",
        "BB_API_SECRET": "DEIN_API_SECRET",
        "BB_API_KEY": "DEIN_API_KEY"
      }
    }
  }
}
```

Nach dem Speichern lädt LM Studio den Server automatisch.
````

### 17.15 Jan

````markdown
### Jan

Settings, MCP Servers, dann "+ Add MCP Server" oben rechts. Trage ein:

- Command: `npx`
- Args: `-y`, `@dennismenken/buchhaltungsbutler-mcp`
- Env: `BB_API_CLIENT`, `BB_API_SECRET`, `BB_API_KEY` mit deinen Werten

Lass "Allow All MCP Tool Permissions" ausgeschaltet. Sonst führt Jan auch schreibende
Buchhaltungsoperationen ohne Rückfrage aus. Alternativ setze `BB_READ_ONLY=1`, dann bietet
der Server ausschließlich lesende Werkzeuge an.
````

### 17.16 Andere Clients

````markdown
### Andere Clients

Die meisten MCP-Clients lesen dieses Format:

```json
{
  "mcpServers": {
    "bbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "DEIN_API_CLIENT",
        "BB_API_SECRET": "DEIN_API_SECRET",
        "BB_API_KEY": "DEIN_API_KEY"
      }
    }
  }
}
```

Bekannte Abweichungen: VS Code nennt den äußeren Schlüssel `servers`, Zed nennt ihn
`context_servers`, Codex und Grok verwenden TOML mit `[mcp_servers.<name>]`.
````

### 17.17 Statt npx: feste Installation

````markdown
### Statt npx: feste Installation

`npx` lädt das Paket beim ersten Start aus der npm-Registry. Das ist bequem, kostet aber
Zeit, und manche Clients brechen den Start nach wenigen Sekunden ab. Wenn du den Server
regelmäßig nutzt, installiere ihn fest:

```bash
npm install -g @dennismenken/buchhaltungsbutler-mcp
```

Der installierte Befehl heißt `bbutler-mcp` und damit kürzer als das Paket. Dann in der
Konfiguration statt `npx`:

```json
{ "command": "bbutler-mcp", "args": [] }
```

Findet dein Client den Befehl nicht, trage den absoluten Pfad ein. Den bekommst du mit:

```bash
which bbutler-mcp     # macOS und Linux
where bbutler-mcp     # Windows
```

Desktop-Anwendungen erben nicht immer den `PATH` deiner Shell. Das ist der häufigste Grund
dafür, dass ein Server im Terminal läuft, im Client aber nicht startet.
````

### 17.18 Umgebungsvariablen

````markdown
### Umgebungsvariablen

| Variable | Bedeutung | Pflicht |
| --- | --- | --- |
| `BB_API_CLIENT` | API Client aus BuchhaltungsButler | ja |
| `BB_API_SECRET` | API Secret aus BuchhaltungsButler | ja |
| `BB_API_KEY` | API Key, wählt den Mandanten aus | ja |
| `BB_BASE_URL` | abweichende Basis-URL der API | nein |
| `BB_PROFILE` | Profil in der Zugangsdatendatei | nein |
| `BB_READ_ONLY` | `1` schaltet alle schreibenden Werkzeuge ab | nein |
| `BB_LOG_LEVEL` | Protokollstufe auf stderr | nein |

Sind `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` gesetzt, haben sie Vorrang vor der
Zugangsdatendatei.

Übergib die Zugangsdaten niemals als Kommandozeilenargument. Argumente eines Prozesses sind
für andere Programme auf deinem Rechner sichtbar und landen in Protokolldateien. Der Server
bietet für die Zugangsdaten deshalb bewusst keine Kommandozeilenoptionen an.
````

### 17.19 Fehlersuche

````markdown
### Fehlersuche

Als Erstes:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp doctor
```

Der Befehl löst die Zugangsdaten auf, testet die Verbindung zur API, prüft die Dateirechte
und listet die gefundenen Clientkonfigurationen. Er gibt keine Geheimnisse aus, die Ausgabe
kannst du also in einen Fehlerbericht kopieren.

Häufige Ursachen:

| Symptom | Ursache |
| --- | --- |
| Der Server startet, jeder Aufruf scheitert mit einem Anmeldefehler | Eine Umgebungsvariable ist nicht gesetzt. Manche Clients starten trotzdem und setzen den Text `${BB_API_KEY}` unersetzt ein. |
| `API credentials unknown or invalid` | API Client oder API Secret falsch |
| `customer not found or invalid api client for customer` | API Key falsch, oder dieser Client darf diesen Mandanten nicht bedienen |
| Der Server erscheint im Client gar nicht | Konfigurationsdatei nicht gespeichert, oder der Client wurde nicht neu gestartet |
| Der Start läuft in ein Zeitlimit | `npx` lädt beim Erstlauf. Feste Installation verwenden oder das Startzeitlimit erhöhen. |
| Im Terminal läuft es, im Client nicht | Der Client findet `npx` oder das Binary nicht. Absoluten Pfad eintragen. |
````
