# BuchhaltungsButler MCP-Server (inoffiziell)

> **Inoffizielles Projekt.** Keine Verbindung zur BuchhaltungsButler GmbH, keine Unterstützung
> von dort. Die Marke gehört ihrem Rechteinhaber.
>
> **Der Server arbeitet auf echten Buchhaltungsdaten. 39 der 54 Werkzeuge schreiben.**
> Buchungen und Rechnungen sind über diese API nicht löschbar.
>
> Nach der Installation sind alle 54 Werkzeuge sofort aufrufbar. Welche Ihr Assistent benutzen
> darf, entscheiden Sie in Ihrem Client.

Dieser Server verbindet einen KI-Assistenten über das Model Context Protocol (MCP) mit Ihrem
BuchhaltungsButler-Mandanten. Er läuft auf Ihrem Rechner; Ihre Zugangsdaten gehen an niemanden
außer an BuchhaltungsButler selbst.

---

## 1. Was der Server kann

**54 Werkzeuge, genau eines je Endpunkt der BuchhaltungsButler-API v1, davon 15 lesend.** Es
gibt kein Werkzeug, das mehrere Endpunkte zusammenfasst, und keinen Endpunkt ohne Werkzeug.

<!-- werkzeuge-bereiche:anfang -->

| Bereich | Werkzeuge | davon lesend |
| --- | --- | --- |
| Belege | 9 | 3 |
| Zahlungen | 8 | 3 |
| Rechnungen | 3 | 0 |
| Buchungen | 12 | 1 |
| Stammdaten | 13 | 4 |
| Kostenstellen | 4 | 1 |
| Berichte | 5 | 3 |
| **Zusammen** | **54** | **15** |

<!-- werkzeuge-bereiche:ende -->

Die vollständige Liste mit einer Zeile je Werkzeug steht in [Abschnitt 11](#11-die-werkzeuge).
Diese Tabellen werden aus dem Register des Servers erzeugt und nicht von Hand gepflegt.

---

## 2. Voraussetzungen

- **Node.js 22.19.0 oder neuer.** Das ist die Untergrenze im Feld `engines.node` der
  `package.json`. Sie kommt daher, dass die HTTP-Schicht `undici@8` benutzt, das selbst
  `>=22.19.0` verlangt. Node 24 und neuer erfüllen sie ebenfalls.
- **Ein BuchhaltungsButler-Konto mit aktivierter API-Schnittstelle.**
- **Die drei Zugangsdaten** aus BuchhaltungsButler: API Client, API Secret und API Key.

Ihre Node-Version zeigt `node --version`.

---

## 3. Zugangsdaten beschaffen

Sie brauchen drei Werte. In BuchhaltungsButler finden Sie sie in den **Einstellungen**, im
Bereich für **Schnittstellen** beziehungsweise **API-Zugang**. Die beiden Quellen des Anbieters
beschreiben die Menüführung unterschiedlich; deshalb sind hier beide genannten Orte aufgeführt,
statt zu behaupten, es gäbe nur einen.

| Wert | Was er ist | Wofür er benutzt wird |
| --- | --- | --- |
| **API Client** | Benutzername der HTTP-Basic-Authentifizierung | weist Ihre Anwendung aus |
| **API Secret** | Passwort der HTTP-Basic-Authentifizierung | weist Ihre Anwendung aus |
| **API Key** | **wählt den Mandanten** | entscheidet, in wessen Buchhaltung geschrieben wird |

Der API Key ist kein harmloser Bezeichner. Er bestimmt, welcher Mandant bearbeitet wird. Ein
falscher API Key bedeutet: richtige Anmeldung, falsche Buchhaltung. Behandeln Sie alle drei
Werte wie ein Passwort.

---

## 4. Schnellstart in fünf Minuten

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup
```

Der Einrichtungsassistent

1. prüft Ihre Node-Version und sucht die auf Ihrem Rechner vorhandenen MCP-Clients,
2. fragt die drei Zugangsdaten maskiert ab,
3. testet die Verbindung mit **einem einzigen lesenden Aufruf** und sagt Ihnen im Klartext, ob
   API Client, API Secret oder der API Key nicht stimmt,
4. zeigt Ihnen die gefundenen Zahlungskonten und fragt, ob diese zu dem Mandanten gehören, den
   Sie verbinden wollen. Antworten Sie mit nein, ist der API Key der falsche,
5. fragt, ob der Server über `npx` oder fest installiert gestartet werden soll,
6. fragt, wo die Zugangsdaten liegen sollen: in einer eigenen Datei mit den Rechten `0600`
   (Vorgabe), direkt in der Clientkonfiguration, oder nirgends,
7. zeigt **vor jedem Schreibvorgang** den vollständigen Dateipfad und den einzufügenden Block,
   Geheimnisse maskiert, und legt vor jeder Änderung eine Sicherung `<datei>.bak-<zeitstempel>`
   an. Bestehende Einträge werden nie ohne Ihre ausdrückliche Zustimmung überschrieben,
8. sagt je Client, was noch zu tun ist, etwa Claude Desktop vollständig zu beenden,
9. fragt einmal, ob der Server zunächst nur lesen darf. Vorgabe ist nein.

Danach tippen Sie in Ihrem Client diesen Satz, um den Erfolg zu sehen:

> Liste meine Zahlungskonten in BuchhaltungsButler.

Für Skripte gibt es den Assistenten auch ohne Rückfragen:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup \
  --client claude-code --scope user --start npx --non-interactive --print-only
```

---

## 5. Installation je Client

Jeder Abschnitt nennt den Befehl oder den Block, den Ablageort, ob ein Neustart nötig ist und
wie Sie prüfen, ob es funktioniert hat. Alle Blöcke benutzen `npx`; für die feste Installation
siehe [Abschnitt 6](#6-statt-npx-feste-installation).

### 5.1 Claude Code

```bash
claude mcp add-json --scope user buchhaltungsbutler \
  '{"type":"stdio","command":"npx","args":["-y","@dennismenken/buchhaltungsbutler-mcp"],"env":{"BB_API_CLIENT":"${BB_API_CLIENT}","BB_API_SECRET":"${BB_API_SECRET}","BB_API_KEY":"${BB_API_KEY}"}}'
```

Claude Code ersetzt `${VAR}` aus Ihrer Umgebung. Wer die Werte lieber direkt einträgt, schreibt
sie statt der `${…}`-Verweise hinein.

Die drei Ebenen, in denen ein Eintrag liegen kann:

| Scope | Gilt | Geteilt mit dem Team | Liegt in |
| --- | --- | --- | --- |
| `local` (Vorgabe) | nur im aktuellen Projekt | nein | `~/.claude.json` |
| `project` | nur im aktuellen Projekt | ja, über die Versionsverwaltung | `.mcp.json` im Projektwurzelverzeichnis |
| `user` | in allen Projekten | nein | `~/.claude.json` |

Kein Neustart nötig. Prüfen mit `claude mcp get buchhaltungsbutler`, in einer laufenden Sitzung
mit `/mcp`. Entfernen mit `claude mcp remove buchhaltungsbutler --scope user`.

### 5.2 Claude Desktop

Claude-Menü, Settings, Reiter Developer, „Edit Config". Die Datei liegt hier:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "buchhaltungsbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "IHR_API_CLIENT",
        "BB_API_SECRET": "IHR_API_SECRET",
        "BB_API_KEY": "IHR_API_KEY"
      }
    }
  }
}
```

**Claude Desktop muss danach vollständig beendet und neu gestartet werden**, nicht nur das
Fenster geschlossen. Prüfen: Der Server erscheint im Werkzeugmenü der Eingabezeile.

Claude Desktop kennt keine Verweise auf Umgebungsvariablen; die Zugangsdaten stehen also im
Klartext in dieser Datei. Wenn Sie das nicht wollen, benutzen Sie den Einrichtungsassistenten:
Er legt die Zugangsdaten in einer eigenen Datei mit eingeschränkten Rechten ab. Zusätzlich gibt
es ein `.mcpb`-Bundle, das Sie ohne Terminal in Claude Desktop hineinziehen können; es liegt
den Veröffentlichungen bei.

### 5.3 OpenAI Codex CLI

```bash
codex mcp add buchhaltungsbutler \
  --env BB_API_CLIENT="IHR_API_CLIENT" \
  --env BB_API_SECRET="IHR_API_SECRET" \
  --env BB_API_KEY="IHR_API_KEY" \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Oder von Hand in `~/.codex/config.toml`:

```toml
[mcp_servers.buchhaltungsbutler]
command = "npx"
args = ["-y", "@dennismenken/buchhaltungsbutler-mcp"]
startup_timeout_sec = 30
default_tools_approval_mode = "writes"

[mcp_servers.buchhaltungsbutler.env]
BB_API_CLIENT = "IHR_API_CLIENT"
BB_API_SECRET = "IHR_API_SECRET"
BB_API_KEY = "IHR_API_KEY"
```

`startup_timeout_sec = 30` ist wichtig: Die Vorgabe von 10 Sekunden ist für einen
`npx`-Kaltstart knapp. `default_tools_approval_mode = "writes"` fragt bei schreibenden
Werkzeugen nach und lässt lesende durch. Kein Neustart nötig. Prüfen mit
`codex mcp get buchhaltungsbutler`, in der Oberfläche mit `/mcp`.

### 5.4 ChatGPT-Desktop-App

Die ChatGPT-Desktop-App teilt sich die Konfiguration mit der Codex CLI. Tragen Sie den Server
einmal nach [5.3](#53-openai-codex-cli) ein; ein zweiter Eintrag ist nicht nötig.

### 5.5 Grok Build (xAI)

```bash
grok mcp add buchhaltungsbutler \
  -e BB_API_CLIENT="IHR_API_CLIENT" \
  -e BB_API_SECRET="IHR_API_SECRET" \
  -e BB_API_KEY="IHR_API_KEY" \
  -- npx -y @dennismenken/buchhaltungsbutler-mcp
```

Mit `--scope project` landet der Eintrag in `./.grok/config.toml` statt in `~/.grok/config.toml`
und kann geteilt werden. Kein Neustart nötig. Prüfen mit `grok mcp list` und
`grok mcp doctor buchhaltungsbutler`.

### 5.6 Cursor

Für ein Projekt `.cursor/mcp.json`, für alle Projekte `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "buchhaltungsbutler": {
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

Cursor setzt `${env:NAME}` aus Ihrer Umgebung ein; diese Datei enthält damit keine Zugangsdaten
und kann eingecheckt werden. Cursor muss neu geladen werden. Server ein- und ausschalten:
„Customize" in der Seitenleiste. Protokolle: Output-Bereich, „MCP Logs".

### 5.7 VS Code mit GitHub Copilot

Datei `.vscode/mcp.json` im Projekt. Der äußere Schlüssel heißt hier `servers`, nicht
`mcpServers`:

```json
{
  "servers": {
    "buchhaltungsbutler": {
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
    { "type": "promptString", "id": "bb-api-key", "description": "BuchhaltungsButler API Key", "password": true }
  ]
}
```

VS Code fragt die drei Werte beim ersten Start ab, maskiert die Eingabe und speichert sie
sicher; die Datei kann deshalb eingecheckt werden. Für das Nutzerprofil statt eines Projekts:
Befehlspalette, **MCP: Open User Configuration**. Ohne Zugangsdaten geht auch:

```bash
code --add-mcp "{\"name\":\"buchhaltungsbutler\",\"command\":\"npx\",\"args\":[\"-y\",\"@dennismenken/buchhaltungsbutler-mcp\"]}"
```

Der Server wird in VS Code ausdrücklich gestartet. Status und Protokolle: Befehlspalette,
**MCP: List Servers**, Server wählen, **Show Output**.

### 5.8 Windsurf, Zed, Cline, Continue, LM Studio, Jan

| Client | Datei beziehungsweise Weg | Besonderheit |
| --- | --- | --- |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json`, Schlüssel `mcpServers` | auch über das Symbol „MCPs" im Cascade-Bereich erreichbar |
| **Zed** | `settings.json`, Schlüssel **`context_servers`** | Zed nennt MCP-Server „context servers". Die Datei ist JSONC mit Kommentaren; der Einrichtungsassistent gibt den Block deshalb nur aus und schreibt ihn nicht |
| **Cline** | CLI-Variante: `~/.cline/mcp.json`. IDE-Variante: Symbol „MCP Servers", Reiter Configure | Tragen Sie unter `autoApprove` nur lesende Werkzeuge ein |
| **Continue** | `.continue/mcpServers/buchhaltungsbutler.yaml` im Projekt | MCP wirkt in Continue nur im Agent-Modus. YAML, Ablageort projektabhängig, deshalb nur Ausgabe |
| **LM Studio** | `~/.lmstudio/mcp.json`, ab Version 0.3.17 über Reiter „Program", `Install`, `Edit mcp.json` | lädt den Server nach dem Speichern selbst neu |
| **Jan** | Settings, MCP Servers, „+ Add MCP Server": Command `npx`, Args `-y` und `@dennismenken/buchhaltungsbutler-mcp` | Lassen Sie „Allow All MCP Tool Permissions" **aus**. Sonst führt Jan auch schreibende Buchhaltungsoperationen ohne Rückfrage aus |

Den fertigen Block für jeden dieser Clients gibt auch der Server selbst aus:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp print-config --client zed
```

Die Kürzel für `--client`: `claude-code`, `claude-desktop`, `codex`, `grok`, `vscode`, `cursor`,
`windsurf`, `lmstudio`, `cline`, `zed`, `continue`, `jan`.

### 5.9 Andere Clients

Die meisten MCP-Clients lesen dieses Format:

```json
{
  "mcpServers": {
    "buchhaltungsbutler": {
      "command": "npx",
      "args": ["-y", "@dennismenken/buchhaltungsbutler-mcp"],
      "env": {
        "BB_API_CLIENT": "IHR_API_CLIENT",
        "BB_API_SECRET": "IHR_API_SECRET",
        "BB_API_KEY": "IHR_API_KEY"
      }
    }
  }
}
```

Bekannte Abweichungen: VS Code nennt den äußeren Schlüssel `servers`, Zed nennt ihn
`context_servers`, Codex und Grok benutzen TOML mit `[mcp_servers.<name>]`. Hinter dem
Paketnamen steht **kein** Argument: Ohne Unterbefehl startet der Server auf stdio.

### 5.10 Nicht unterstützt: ChatGPT im Browser

ChatGPT im Browser kann keine lokalen Programme starten und spricht ausschließlich über HTTPS
mit entfernten MCP-Servern. Dieser Server läuft bewusst lokal, damit Ihre Buchhaltungszugangs-
daten Ihren Rechner nicht verlassen. Zwei Auswege: die ChatGPT-Desktop-App benutzen
([5.4](#54-chatgpt-desktop-app)), oder OpenAIs Secure MCP Tunnel selbst betreiben. Letzteres
setzt ein OpenAI-Platform-Konto mit Tunnels-Berechtigung, den Entwicklermodus im Arbeitsbereich
und einen dauerhaft laufenden Tunnel-Client voraus.

---

## 6. Statt npx: feste Installation

`npx` lädt das Paket beim ersten Start aus der npm-Registry. Das ist bequem, kostet aber Zeit,
und manche Clients brechen den Start nach wenigen Sekunden ab.

```bash
npm install -g @dennismenken/buchhaltungsbutler-mcp
```

Der installierte Befehl heißt `bbutler-mcp`. In der Clientkonfiguration steht dann:

```json
{ "command": "bbutler-mcp", "args": [] }
```

Findet Ihr Client den Befehl nicht, tragen Sie den absoluten Pfad ein:

```bash
which bbutler-mcp     # macOS und Linux
where bbutler-mcp     # Windows
```

Für den Dauerbetrieb ist das die ruhigere Variante: Der Start dauert Millisekunden statt
Sekunden, das Startzeitlimit eines Clients kann nicht mehr reißen, und Sie wissen jederzeit,
welche Version läuft. Desktop-Anwendungen erben nicht immer den `PATH` Ihrer Shell; das ist der
häufigste Grund dafür, dass ein Server im Terminal läuft, im Client aber nicht.

---

## 7. Konfiguration

Alle Einstellungen sind Umgebungsvariablen. Variablen mit dem Präfix `BB_` beschreiben die
**Verbindung zur API**, Variablen mit dem Präfix `BB_MCP_` steuern das **Verhalten dieses
Servers**. Eine Vorlage mit allen Variablen liegt als [`.env.example`](.env.example) bei.

### 7.1 Pflichtvariablen

| Variable | Bedeutung |
| --- | --- |
| `BB_API_CLIENT` | API Client, Benutzername der Basic-Authentifizierung |
| `BB_API_SECRET` | API Secret, Passwort der Basic-Authentifizierung |
| `BB_API_KEY` | der `api_key` im Body; **wählt den Mandanten**, kein harmloser Bezeichner |

Fehlt einer der drei Werte, **startet der Server trotzdem** und meldet alle 54 Werkzeuge. Jeder
Aufruf antwortet dann mit einem Fehler, der genau sagt, welche Variable fehlt, und dass nichts
an BuchhaltungsButler hinausgegangen ist. Das ist Absicht: Ein Server, der gar nicht startet,
erzeugt im Client nur die Meldung „Server konnte nicht gestartet werden", und die hilft
niemandem weiter.

### 7.2 Optionale Variablen

| Variable | Bedeutung | Vorgabe |
| --- | --- | --- |
| `BB_BASE_URL` | Basis-URL der API. Muss `https:` sein; `http:` nur gegen `localhost` | `https://webapp.buchhaltungsbutler.de/api/v1` |
| `BB_PROFILE` | Profilname in der Zugangsdatendatei | `default` |
| `BB_CONFIG_DIR` | Ort der Zugangsdatendatei | `${XDG_CONFIG_HOME:-~/.config}/buchhaltungsbutler-mcp`, unter Windows `%APPDATA%\buchhaltungsbutler-mcp` |
| `BB_MCP_READ_ONLY` | `true` beschränkt den Server auf die 15 lesenden Endpunkte | `false`, also aus |
| `BB_MCP_MAX_BATCH` | Obergrenze je Aufruf für jedes Stapel- und Positionsarray, zulässig 1 bis 50 | `50` |
| `BB_MCP_MAX_AMOUNT` | Betragsgrenze für buchende und anlegende Werkzeuge mit Betragsfeld | nicht gesetzt, also aus |
| `BB_MCP_RATE_LIMIT` | Nachfüllrate des Standardeimers je Minute, 10 bis 100 | `60` |
| `BB_MCP_TIMEOUT_MS` | Zeitlimit der Stufe „normal", mindestens 5000 | `30000` |
| `BB_MCP_DUPLICATE_CHECK` | `on` oder `off`. Bei `on` sucht der Server vor jedem anlegenden Aufruf nach einem Duplikat und verbraucht dafür einen zusätzlichen Request | `off` |
| `BB_MCP_MAX_RESPONSE_TOKENS` | weiche Kürzungsgrenze je Antwort | `5000` |
| `BB_MCP_CACHE_TTL_MS` | Haltbarkeit des Stammdatenspeichers, `0` schaltet ihn ab | `0`, also aus |
| `BB_MCP_UPLOAD_DIRS` | Liste erlaubter Verzeichnisse für `file://` als Belegquelle | leer, also kein Dateisystemzugriff |
| `BB_MCP_UPLOAD_FROM_URL` | erlaubt `https://` als Belegquelle | `false` |
| `BB_MCP_LOG_LEVEL` | `error`, `warn`, `info` oder `debug`; Ausgabe ausschließlich auf stderr | `warn` |
| `BB_READ_ONLY` | veralteter Name von `BB_MCP_READ_ONLY`, wird noch angenommen (siehe unten) | nicht gesetzt |

`BB_READ_ONLY` ist der frühere Name von `BB_MCP_READ_ONLY`. Er wird weiterhin **angenommen
und ausgewertet**, erzeugt dabei aber eine Warnung auf stderr. Sind beide Variablen gesetzt
und widersprechen sich, **bricht der Server den Start ab**, statt sich stillschweigend für
eine von beiden zu entscheiden: Bei einem Nur-Lesen-Schalter wäre die stille Wahl im Zweifel
die gefährliche. Neu gesetzt wird deshalb nur noch `BB_MCP_READ_ONLY`.

Zwei Regeln, die Ihnen Zeit sparen:

- **Ein unbrauchbarer Wert bricht den Start ab**, statt still auf die Vorgabe zurückzufallen.
  `BB_MCP_READ_ONLY=ture` darf nicht heimlich „aus" bedeuten.
- **Jede unbekannte `BB_*`-Variable erzeugt eine Warnung auf stderr**, zusammen mit dem
  ähnlichsten bekannten Namen. Das fängt den häufigsten Einrichtungsfehler ab: einen Tippfehler
  in einer fremden JSON-Datei, der sonst wirkungslos bleibt.

Zugangsdaten nimmt kein Unterbefehl als Kommandozeilenargument entgegen, auch nicht über eine
Option. Was es nicht gibt, kann niemand in eine Prozessliste oder eine Shell-Historie schreiben.

### 7.3 Zugangsdatendatei

Statt die drei Werte in jede Clientkonfiguration zu schreiben, können sie in einer eigenen Datei
liegen:

| Betriebssystem | Pfad |
| --- | --- |
| macOS und Linux | `${XDG_CONFIG_HOME:-~/.config}/buchhaltungsbutler-mcp/credentials.json` |
| Windows | `%APPDATA%\buchhaltungsbutler-mcp\credentials.json` |

Dateirechte `0600`, Verzeichnisrechte `0700`. Sind die Rechte weiter, warnt der Server auf
stderr und nennt den Korrekturbefehl; er bricht nicht ab, weil Windows keine Entsprechung hat.

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

Sind `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` **alle drei** gesetzt, gelten sie, und
die Datei wird nicht gelesen. Teilweise gesetzte Werte mischen sich nicht mit der Datei.
Verwaltet wird die Datei mit `bbutler-mcp profiles list|add|remove`.

---

## 8. Nur lesen lassen

```bash
BB_MCP_READ_ONLY=true
```

**Standard ist `false`, der Schalter ist also aus.** Nach der Installation sind alle 54
Werkzeuge aufrufbar.

Steht er auf `true`, führt der Server nur die 15 lesenden Werkzeuge aus. Die übrigen 39 lehnen
ab, **bevor** ein Request an BuchhaltungsButler abgeht, und die Absage nennt die Variable und
ihren Zielwert. Gesperrte Werkzeuge bleiben in der Werkzeugliste sichtbar: Ein Assistent, der
ein Werkzeug nicht sieht, schließt auf eine fehlende Fähigkeit und sucht Umwege; einer, der eine
klare Absage liest, kann sie Ihnen erklären.

Der Schalter wird **nur beim Start gelesen** und ist aus einem Gespräch heraus nicht aufhebbar,
auch nicht durch ein Werkzeug.

**Folge für die Auswertungen:** BWA und Summen- und Saldenliste entstehen in zwei Schritten,
erzeugen und abholen. Der erste Schritt ist gesperrt, weil er den zuvor erzeugten Bericht
desselben Typs ersetzt. Bei aktivem Schalter sind also

| Auswertung | Schalter aus | `BB_MCP_READ_ONLY=true` |
| --- | --- | --- |
| Kontenblatt (`bb_reports_get_ledger`) | verfügbar | **verfügbar** |
| BWA | verfügbar | **nicht verfügbar**, der erste Schritt ist gesperrt |
| Summen- und Saldenliste | verfügbar | **nicht verfügbar**, der erste Schritt ist gesperrt |

Ein früher erzeugter Bericht lässt sich weiterhin abholen.

---

## 9. Weitere Grenzen

Alle vier sind Betreibergrenzen: Sie wirken vor dem Request und lassen sich aus einem Gespräch
heraus nicht aufheben.

- **`BB_MCP_MAX_BATCH`** begrenzt jedes Stapel- und Positionsarray, also auch die Positionen
  einer Splitbuchung oder einer Rechnung. Wirksam ist der kleinere Wert aus 50 und Ihrer
  Angabe. Die Grenze 50 ist für die Stapelendpunkte der Belege und Zahlungen dokumentiert; für
  Positionslisten ist sie **unsere** Mengengrenze und keine Regel der API.
- **`BB_MCP_MAX_AMOUNT`** lehnt anlegende und buchende Aufrufe oberhalb eines Betrags ab. Als
  Dezimalzeichenkette angeben, etwa `10000.00`.
- **`BB_MCP_RATE_LIMIT`** ist die Nachfüllrate je Minute. Die API erlaubt 100 Anfragen je
  Mandant und Minute; die Vorgabe 60 hält Abstand, weil Sie den Mandanten möglicherweise nicht
  allein benutzen.
- **`BB_MCP_DUPLICATE_CHECK=on`** lässt den Server vor jedem anlegenden Aufruf nachsehen, ob es
  den Datensatz schon gibt. Ein Treffer blockiert nichts, sondern steht sichtbar in der Antwort.
  Der Preis: **ein zusätzlicher Request je anlegendem Aufruf** aus Ihrem Minutenkontingent. Bei
  Stapelwerkzeugen läuft er einmal für den ganzen Stapel. Deshalb ist er standardmäßig aus.

---

## 10. Mehrere Mandanten

Eine Kanzlei oder Agentur betreut mehrere Mandanten mit demselben Paar aus API Client und API
Secret und wechselndem API Key. Dafür gibt es Profile in der Zugangsdatendatei:

```bash
bbutler-mcp profiles add
bbutler-mcp profiles list
```

Welches Profil ein Serverprozess benutzt, entscheidet `BB_PROFILE`. Tragen Sie in Ihrem Client
je Mandant einen eigenen Servereintrag mit eigenem `BB_PROFILE` und eigenem Namen ein; dann
sieht Ihr Assistent, welcher Mandant gemeint ist.

**Das Minutenlimit zählt je `api_key`, nicht je Prozess.** Der Server führt deshalb einen
eigenen Zählersatz je Mandant und drosselt nicht quer über Mandanten hinweg. Der Schlüssel wird
gehasht abgelegt und taucht in keinem Protokoll auf. Zwei gleichzeitig laufende Clients auf
demselben Mandanten teilen sich diesen Zähler allerdings nicht; siehe
[Abschnitt 17](#17-bekannte-einschränkungen).

---

## 11. Die Werkzeuge

Eine Zeile je Werkzeug, gruppiert nach Bereichen. Der Text ist der erste Satz der
Werkzeugbeschreibung, die Ihr Assistent sieht. Diese Tabelle wird aus dem Register erzeugt.

<!-- werkzeuge-tabelle:anfang -->

### Belege

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_comments_create` | anlegend | Hängt einen Kommentar an einen Beleg oder an eine Zahlung in BuchhaltungsButler. |
| `bb_receipts_create` | anlegend | Legt in BuchhaltungsButler einen Beleg ohne Datei an, zum Beispiel den Datensatz einer Eingangsrechnung aus einem Vorsystem; Belegart, Gegenpartei, Rechnungsnummer, Belegdatum, Betrag und Währung sind Pflicht. |
| `bb_receipts_create_batch` | anlegend | Legt in BuchhaltungsButler bis zu 50 Belege ohne Datei an, beim Import aus einem Vorsystem; höchstens ein Aufruf je fünf Sekunden. |
| `bb_receipts_delete` | löschend | Markiert einen Beleg in BuchhaltungsButler als gelöscht, zum Beispiel einen versehentlich doppelt angelegten Beleg. |
| `bb_receipts_get` | lesend | Holt genau einen Beleg aus BuchhaltungsButler über seine mandantenbezogene Belegnummer und liefert mehr Felder als die Suche: Buchungs- und Originalwährung, Umrechnungskurs, Steuersatz, Zahlungsreferenz und auf Wunsch die Belegdatei. |
| `bb_receipts_list_transactions` | lesend | Listet die Zahlungen, die in BuchhaltungsButler einem bestimmten Beleg zugeordnet sind, etwa um zu prüfen, ob eine Eingangsrechnung schon bezahlt wurde. |
| `bb_receipts_restore` | ändernd | Nimmt in BuchhaltungsButler die Löschmarkierung eines Belegs zurück, sodass er wieder für die Buchhaltung zählt; typischer Fall ist ein versehentlich als gelöscht markierter Beleg. |
| `bb_receipts_search` | lesend | Durchsucht die Belege eines Mandanten in BuchhaltungsButler, also Eingangs- und Ausgangsrechnungen samt Gutschriften, und liefert sie seitenweise. |
| `bb_receipts_upload` | anlegend | Lädt eine Belegdatei nach BuchhaltungsButler, legt daraus einen Beleg an und stößt die Texterkennung an; Pflicht sind nur die Datei und die Belegart, alles Weitere liest BuchhaltungsButler aus der Datei. |

### Zahlungen

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_transactions_assign_receipt` | ändernd | Ordnet in BuchhaltungsButler einen Beleg einer Zahlung zu. |
| `bb_transactions_assign_receipt_batch` | ändernd | Stellt bis zu 50 Zuordnungen aus Beleg und Zahlung in BuchhaltungsButler in einem Aufruf her. |
| `bb_transactions_create` | anlegend | Legt in BuchhaltungsButler eine Zahlung auf einem echten Zahlungskonto an, also einen Kontoumsatz. |
| `bb_transactions_create_batch` | anlegend | Legt bis zu 50 Zahlungen in BuchhaltungsButler in einem Aufruf an. |
| `bb_transactions_get` | lesend | Holt genau eine Zahlung aus BuchhaltungsButler über ihre mandantenbezogene Nummer. |
| `bb_transactions_list_receipts` | lesend | Listet die Belege auf, die in BuchhaltungsButler einer bestimmten Zahlung zugeordnet sind. |
| `bb_transactions_search` | lesend | Sucht Zahlungen, also Kontoumsätze, in BuchhaltungsButler und liefert sie seitenweise. |
| `bb_transactions_unassign_receipt` | löschend | Löst in BuchhaltungsButler die Zuordnung zwischen einem Beleg und einer Zahlung. |

### Rechnungen

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_invoices_create` | anlegend | Erzeugt in BuchhaltungsButler eine endgültige Ausgangsrechnung, eine Gutschrift oder ein Angebot: nummeriert, als PDF und als Ausgangsbeleg der Buchhaltung. |
| `bb_invoices_create_draft` | anlegend | Erzeugt in BuchhaltungsButler einen Rechnungsentwurf: ohne endgültige Nummer, ohne PDF, aber als sichtbares Objekt in der Rechnungsstellung des Mandanten. |
| `bb_invoices_create_einvoice` | anlegend | Erzeugt in BuchhaltungsButler eine E-Rechnung: endgültig, nummeriert, mit PDF und strukturiertem Datensatz nach EN 16931. |

### Buchungen

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_postings_assign_receipt` | ändernd | Bindet in BuchhaltungsButler einen vorhandenen Beleg an eine vorhandene freie Buchung. |
| `bb_postings_cancel` | löschend | Storniert in BuchhaltungsButler eine einzelne Buchungszeile. |
| `bb_postings_create_for_receipt` | anlegend | Legt die Buchungssätze zu einem bereits vorhandenen Beleg in BuchhaltungsButler an. |
| `bb_postings_create_for_receipt_batch` | anlegend | Legt die Buchungssätze zu mehreren vorhandenen Belegen in BuchhaltungsButler in einem Aufruf an. |
| `bb_postings_create_for_transaction` | anlegend | Legt die Buchungssätze zu einer bereits vorhandenen Zahlung in BuchhaltungsButler an. |
| `bb_postings_create_for_transaction_batch` | anlegend | Legt die Buchungssätze zu mehreren vorhandenen Zahlungen in BuchhaltungsButler in einem Aufruf an. |
| `bb_postings_create_free` | anlegend | Legt in BuchhaltungsButler eine freie Buchung an, also einen vollständigen Buchungssatz ohne Beleg- und Zahlungsbezug, etwa eine Umbuchung zwischen zwei Sachkonten. |
| `bb_postings_create_free_batch` | anlegend | Legt in BuchhaltungsButler mehrere freie Buchungen in einem Aufruf an, also vollständige Buchungssätze ohne Beleg- und Zahlungsbezug. |
| `bb_postings_search` | lesend | Liest die Buchungssätze eines Zeitraums aus der Buchhaltung von BuchhaltungsButler. |
| `bb_postings_unconfirm_for_receipt` | löschend | Hebt in BuchhaltungsButler die Bestätigung der Buchungen eines Belegs auf und entfernt sie damit. |
| `bb_postings_unconfirm_for_transaction` | löschend | Hebt in BuchhaltungsButler die Bestätigung der Buchungen einer Zahlung auf und entfernt sie damit. |
| `bb_postings_unconfirm_free` | löschend | Hebt in BuchhaltungsButler die Bestätigung einer einzelnen freien Buchung auf und entfernt sie damit. |

### Stammdaten

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_creditors_create` | anlegend | Legt ein Kreditorenkonto, also ein Lieferantenkonto, in BuchhaltungsButler an. |
| `bb_creditors_create_batch` | anlegend | Legt mehrere Kreditorenkonten in BuchhaltungsButler in einem Aufruf an. |
| `bb_creditors_search` | lesend | Listet die Kreditorenkonten des Mandanten in BuchhaltungsButler auf, also die Lieferantenkonten, mit Kontonummer, Name und Anschrift. |
| `bb_creditors_update` | ändernd | Überschreibt die Stammdaten eines Kreditorenkontos in BuchhaltungsButler, die Bankverbindung eingeschlossen. |
| `bb_debtors_create` | anlegend | Legt ein Debitorenkonto, also ein Kundenkonto, in BuchhaltungsButler an. |
| `bb_debtors_create_batch` | anlegend | Legt mehrere Debitorenkonten in BuchhaltungsButler in einem Aufruf an. |
| `bb_debtors_search` | lesend | Listet die Debitorenkonten des Mandanten in BuchhaltungsButler auf, also die Kundenkonten, mit Kontonummer, Name, Kundennummer und Anschrift. |
| `bb_debtors_update` | ändernd | Überschreibt die Stammdaten eines Debitorenkontos in BuchhaltungsButler, Anschrift und Bankverbindung eingeschlossen. |
| `bb_payment_accounts_create` | anlegend | Legt ein manuell geführtes Zahlungskonto in BuchhaltungsButler an, etwa eine Kasse oder ein Kreditkartenkonto. |
| `bb_payment_accounts_list` | lesend | Listet die Zahlungskonten des Mandanten in BuchhaltungsButler auf, also Kassen, Bank- und Kreditkartenkonten. |
| `bb_postingaccounts_create` | anlegend | Legt ein neues Sachkonto im Kontenrahmen des Mandanten in BuchhaltungsButler an. |
| `bb_postingaccounts_search` | lesend | Durchsucht den Kontenrahmen des Mandanten in BuchhaltungsButler. |
| `bb_postingaccounts_update` | ändernd | Überschreibt die Bezeichnung eines Sachkontos in BuchhaltungsButler. |

### Kostenstellen

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_cost_locations_create` | anlegend | Legt eine Kostenstelle in BuchhaltungsButler an, mit einem selbst gewählten code von höchstens 10 Zeichen und einer Bezeichnung. |
| `bb_cost_locations_delete` | löschend | Löscht eine Kostenstelle in BuchhaltungsButler über ihren code. |
| `bb_cost_locations_search` | lesend | Listet die Kostenstellen des Mandanten in BuchhaltungsButler auf oder holt mit code genau eine. |
| `bb_cost_locations_update` | ändernd | Überschreibt die Bezeichnung einer Kostenstelle in BuchhaltungsButler. |

### Berichte

| Werkzeug | Wirkung | Was es tut |
| --- | --- | --- |
| `bb_reports_create_bwa` | anlegend | Stößt in BuchhaltungsButler die Erzeugung einer Betriebswirtschaftlichen Auswertung für einen Zeitraum an und liefert deren id_by_customer zurück. |
| `bb_reports_create_sums` | anlegend | Stößt in BuchhaltungsButler die Erzeugung einer Summen- und Saldenliste über alle Konten des Mandanten an und liefert deren id_by_customer zurück; wahlweise entstehen dabei PDF, CSV und ein ZIP-Archiv mit den Kontenblättern. |
| `bb_reports_get_bwa` | lesend | Holt eine zuvor in BuchhaltungsButler erzeugte Betriebswirtschaftliche Auswertung ab, auf Wunsch samt Dateien. |
| `bb_reports_get_ledger` | lesend | Liefert das Kontenblatt eines Sachkontos aus BuchhaltungsButler für einen Zeitraum, also dessen Buchungen mit laufendem Saldo. |
| `bb_reports_get_sums` | lesend | Holt eine zuvor in BuchhaltungsButler erzeugte Summen- und Saldenliste ab, auf Wunsch samt Dateien. |

<!-- werkzeuge-tabelle:ende -->

### 11.1 Was die Annotationen bedeuten

Jedes Werkzeug trägt vier maschinenlesbare Hinweise. **Ihr Client entscheidet damit, wofür er
nachfragt. Das ist der eigentliche Schutz**, denn dieser Server fragt selbst nicht nach.

| Annotation | Bedeutung | Bei diesem Server |
| --- | --- | --- |
| `readOnlyHint` | verändert nichts | `true` bei den 15 lesenden Werkzeugen |
| `destructiveHint` | überschreibt, löscht oder ersetzt Bestehendes | `true` bei 13 Werkzeugen: den sieben löschenden, den vier überschreibenden Stammdatenwerkzeugen und den beiden Berichtserzeugern, die den Vorgängerbericht ersetzen |
| `idempotentHint` | ein zweiter Aufruf ändert nichts mehr | `true` nur dort, wo das beweisbar ist: bei den 15 lesenden und den 4 überschreibenden Werkzeugen. Bei allen übrigen `false`, weil es **nicht verifiziert** ist und ein falsches `true` einen Client zum automatischen Wiederholen einlädt |
| `openWorldHint` | spricht mit einem fremden System | überall `true` |

So vergeben Sie Leserechte getrennt von Schreibrechten:

- **Claude Code und Claude Desktop** fragen vor jedem Werkzeugaufruf; Sie können je Werkzeug
  dauerhaft zustimmen. Stimmen Sie den lesenden Werkzeugen dauerhaft zu und lassen Sie
  schreibende einzeln nachfragen.
- **Codex CLI und ChatGPT-Desktop-App**: `default_tools_approval_mode = "writes"` in der
  Serverkonfiguration.
- **Cline**: nur lesende Werkzeuge in `autoApprove` eintragen.
- **Jan**: „Allow All MCP Tool Permissions" ausgeschaltet lassen.

Wenn Ihr Client keine Unterscheidung anbietet, benutzen Sie
[`BB_MCP_READ_ONLY`](#8-nur-lesen-lassen) und starten den Server für Schreibarbeiten getrennt.

---

## 12. Bekannte Eigenheiten der API

Diese Punkte sind keine Fehler dieses Servers, sondern Eigenschaften der BuchhaltungsButler-API.
Der Server reicht sie sichtbar durch, statt sie zu verstecken.

- **`rows` ist keine Gesamttrefferzahl**, sondern die Zeilenzahl **dieser** Antwort. Die API
  nennt an keiner Stelle, wie viele Treffer es insgesamt gibt. Eine volle Seite bedeutet: Es
  kann mehr geben.
- **Es gibt keinen Idempotenzschlüssel.** Ein wiederholter Schreibaufruf legt einen zweiten
  Datensatz an. Deshalb wiederholt dieser Server einen schreibenden Aufruf **nie** von selbst,
  auch nicht nach einem Zeitlimit. Er sagt stattdessen, mit welchem lesenden Werkzeug Sie prüfen,
  ob der Vorgang doch angekommen ist.
- **Beträge kommen als Zeichenkette** mit Punkt als Dezimaltrennzeichen, etwa `"884.65"`, und
  werden beim Senden als Zahl erwartet. Der Server reicht die Zeichenkette unverändert durch und
  legt zusätzlich einen Cent-Betrag als Ganzzahl bei, damit niemand mit Gleitkommazahlen rechnet.
- **Wahrheitswerte kommen als `"0"` und `"1"`.** Der Server macht daraus echte Wahrheitswerte.
- **Es gibt drei verschiedene `order`-Syntaxen** an drei Endpunkten, und bei den Buchungen wird
  die Groß- und Kleinschreibung geprüft.
- **Debitoren und Kreditoren liefern ohne ausdrückliches `limit` nur 25 Zeilen.** Wer die
  vollständige Liste will, muss `limit` setzen.
- **Ein Bericht ersetzt seinen Vorgänger.** `bb_reports_create_bwa` und `bb_reports_create_sums`
  überschreiben den zuletzt erzeugten Bericht desselben Typs und blockieren, solange eine
  Erzeugung läuft.
- **Feldnamen unterscheiden sich zwischen Listen- und Einzelabruf.** In der Belegliste heißt das
  Leistungsdatum `delivery_date`, im Einzelabruf `date_delivery`; die Fälligkeit heißt `due_date`
  beziehungsweise `date_payment_due`. Der Einzelabruf liefert außerdem mehr Felder als die Liste,
  die Zahlungsliste zum Beispiel kein `account`. Der Server prüft je Endpunkt gegen das, was dort
  tatsächlich kommt, und meldet Abweichungen in derselben Antwort.
- **`id_by_customer` ist je Mandant fortlaufend**, keine globale Kennung, und kommt bei Belegen
  als Zeichenkette, bei Zahlungen als Zahl. Nach außen gibt der Server sie immer als Zeichenkette.
- **Leere Zeichenketten sind bei den meisten Feldern ungültig**, nicht neutral. Felder weglassen
  statt leeren.

---

## 13. Was der Server mit Ihren Daten macht

- **Ihre Zugangsdaten bleiben im Prozess.** Sie werden einmal beim Start gelesen, gehen
  ausschließlich an `BB_BASE_URL` und erscheinen in keiner Werkzeugantwort, keiner Fehlermeldung
  und keiner Protokollzeile, auch nicht gekürzt oder maskiert.
- **Es gibt keine Telemetrie.** Der Server sendet nichts an uns oder an Dritte. Er spricht mit
  genau einer Gegenstelle: der BuchhaltungsButler-API.
- **Protokolliert wird auf stderr**, nie auf stdout, weil stdout dem MCP-Protokoll gehört. Die
  Stufe stellen Sie mit `BB_MCP_LOG_LEVEL` ein.
- **Kontextkosten.** Die Definitionen der 54 Werkzeuge sind rund **48.000 Token** groß, die
  Serverbeschreibung rund 1.200. Gemessen mit `gpt-tokenizer` in der Kodierung `o200k_base`; für
  andere Modellfamilien ist das eine Größenordnung und keine exakte Zahl. Das ist der Preis
  dafür, dass jeder Endpunkt ein eigenes Werkzeug mit allen Parametern hat. Wer viele Server
  gleichzeitig betreibt, sollte das einplanen.
- **Werkzeugargumente können von Inhalten beeinflusst sein, die Ihr Assistent gelesen hat.**
  Verwendungszwecke, Gegenparteien, Buchungstexte und Dateinamen stammen von Dritten. Ein
  präparierter Text kann versuchen, Ihren Assistenten zu einer Handlung zu bewegen. Der Server
  gibt solche Inhalte neutralisiert aus, nie als Anweisung formatiert, und entfernt Steuer- und
  Richtungszeichen. **Vollständig verhindern lässt sich das nicht.** Deshalb: Lassen Sie sich
  schreibende Aufrufe vom Client vorlegen.

---

## 14. Dateien hochladen

`bb_receipts_upload` nimmt eine Belegdatei in drei Formen an:

| Form | Voraussetzung |
| --- | --- |
| **base64-Zeichenkette** (Vorgabe) | keine; funktioniert immer. Der Dateiname gehört in `file_name` |
| **`file://…`** | Der Betreiber hat mit `BB_MCP_UPLOAD_DIRS` Verzeichnisse freigegeben. Ohne diese Variable liest der Server keine Datei von der Platte |
| **`https://…`** | `BB_MCP_UPLOAD_FROM_URL=true`. Ohne diese Variable lädt der Server nichts aus dem Netz |

Angenommen werden PDF, XML, JPEG, PNG, BMP und TIFF. Der Typ wird am Inhalt bestimmt, nicht an
der Endung.

> **Warnung.** `BB_MCP_UPLOAD_DIRS` und `BB_MCP_UPLOAD_FROM_URL` geben Ihrem Assistenten die
> Möglichkeit, Dateien zu lesen, deren Pfad oder Adresse aus einem Gespräch stammt. Steht diese
> Adresse in einer E-Mail, einem Beleg oder einer Webseite, die der Assistent zuvor gelesen hat,
> entscheidet am Ende nicht mehr Ihr Wunsch, welche Datei hochgeladen wird. Geben Sie deshalb
> nur ein eng umrissenes Ablageverzeichnis frei, niemals das Heimatverzeichnis, und lassen Sie
> `BB_MCP_UPLOAD_FROM_URL` aus, wenn Sie es nicht ausdrücklich brauchen.

---

## 15. Verifikation

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp doctor
```

Eine gesunde Ausgabe zeigt

- Paketversion, Node-Version und Plattform,
- die Basis-URL,
- woher die Zugangsdaten kommen (Umgebung oder Zugangsdatendatei) und dass alle drei gesetzt
  sind, **ohne einen der Werte anzuzeigen**,
- die Rechte der Zugangsdatendatei,
- das Ergebnis des Verbindungstests mit der Zahl der gefundenen Zahlungskonten,
- die Schalterlage, also `BB_MCP_READ_ONLY`, die Grenzen und den Stammdatenspeicher,
- „Registriert: 54 — 15 lesend, 24 anlegend, 8 ändernd, 7 löschend",
- die geschätzte Größe der Werkzeugdefinitionen,
- die gefundenen Clientkonfigurationen mit Pfad,
- jede unbekannte `BB_*`-Variable mit dem ähnlichsten bekannten Namen.

Die Ausgabe enthält garantiert kein Geheimnis und kann in einen Fehlerbericht kopiert werden.
Für Skripte gibt es `bbutler-mcp test`: nur der Verbindungstest, Rückgabewert 0 oder 1. Mit
`doctor --skip-connection-test` geht kein einziger Aufruf an die API hinaus.

---

## 16. Fehlersuche

| Symptom | Ursache | Abhilfe |
| --- | --- | --- |
| Der Server erscheint im Client gar nicht | Konfiguration nicht gespeichert, falsche Datei, oder der Client wurde nicht neu gestartet | Pfad gegen [Abschnitt 5](#5-installation-je-client) prüfen, Client neu starten, danach `bbutler-mcp doctor` |
| Jede Antwort beginnt mit „NICHT KONFIGURIERT" | Der Server hat keine Zugangsdaten gefunden | Die Meldung nennt die fehlende Variable. `bbutler-mcp setup` ausführen oder die drei Variablen in der Clientkonfiguration setzen und den **Client** neu starten; die Zugangsdaten werden nur beim Start gelesen |
| `401`, `error_code` 3: `API credentials unknown or invalid` | **API Client oder API Secret** ist falsch. Der API Key wurde damit noch nicht geprüft | Beide Werte in BuchhaltungsButler neu abschreiben |
| `401`, `error_code` 4: `customer not found …` | Client und Secret stimmen, aber der **API Key** gehört nicht dazu, oder dieser Client darf diesen Mandanten nicht bedienen | API Key prüfen und die Zuordnung des Clients zum Mandanten |
| Die Antwort ist HTML statt JSON | Falsche Basis-URL, oder ein Proxy oder Anmeldeportal sitzt davor | `BB_BASE_URL` prüfen, `HTTPS_PROXY` prüfen, Zieldomain freigeben |
| Werkzeuge antworten mit einer Nur-Lesen-Absage | `BB_MCP_READ_ONLY` steht auf `true` | Variable entfernen oder auf `false` setzen und den Client neu starten. Aus dem Gespräch heraus ist das nicht möglich |
| Die Debitorenliste zeigt nur 25 Einträge | Die API liefert an `/settings/get/debtors` und `/settings/get/creditors` ohne ausdrückliches `limit` nur 25 Zeilen | Den Assistenten bitten, `limit` zu setzen und mit `offset` weiterzublättern |
| Die Kontenliste scheint unvollständig | Zahlungskonten und Sachkonten sind zwei verschiedene Listen | `bb_payment_accounts_list` liefert die Zahlungskonten, `bb_postingaccounts_search` den Kontenrahmen einschließlich Debitoren und Kreditoren |
| Codex meldet einen Zeitablauf beim Start | Der `npx`-Kaltstart dauert länger als die Vorgabe von 10 Sekunden | `startup_timeout_sec = 30` setzen ([5.3](#53-openai-codex-cli)) oder fest installieren ([Abschnitt 6](#6-statt-npx-feste-installation)) |
| Eine gesetzte `BB_*`-Variable wirkt nicht | Tippfehler im Namen | Der Server warnt auf stderr und nennt den ähnlichsten bekannten Namen. `bbutler-mcp doctor` zeigt dieselbe Warnung |

---

## 17. Bekannte Einschränkungen

Diese Punkte sind bekannt, benannt und nicht wegkonstruierbar.

- **Ein Client, der nicht nachfragt, kann mit diesem Server löschen, stornieren und buchen.**
  Der Server erzwingt keine Bestätigung; das ist eine bewusste Entscheidung. Ihr Schutz sind die
  Annotationen ([11.1](#111-was-die-annotationen-bedeuten)), die Freigabe in Ihrem Client, der
  Nur-Lesen-Schalter und die Betrags- und Mengengrenzen.
- **54 Werkzeuge kosten Kontext**, rund 48.000 Token. Bei vielen gleichzeitig aktiven Servern
  kann die Trefferquote eines Assistenten darunter leiden.
- **Buchungen und Rechnungen sind über die API nicht löschbar.** Eine Buchung wird storniert,
  eine festgeschriebene erzeugt dabei eine dauerhaft sichtbare Stornobuchung. Für Rechnungen
  gibt es über die API gar keinen Weg zurück.
- **Debitoren, Kreditoren und Kommentare lassen sich über die API nicht wieder entfernen.**
- **Zwei schreibende Aufrufformen sind nicht verifiziert.** Bei `bb_receipts_delete` und
  `bb_receipts_restore` ist die Pfadform aus zwei gemessenen lesenden Endpunkten abgeleitet,
  aber nicht selbst gemessen, weil dafür ein Schreibtest nötig wäre. Der Code weist das aus.
- **Das Wiederholungsverhalten der löschenden Werkzeuge ist nicht verifiziert.** Deshalb
  `idempotentHint: false` bei allen; lieber eine Rückfrage zu viel als ein automatischer zweiter
  Aufruf.
- **Welche Währungen die Belegendpunkte wirklich annehmen, ist nicht verifiziert.** Die
  Spezifikation widerspricht sich dort dreifach. Der Server nimmt deshalb einen freien Text an
  und nennt den Widerspruch in der Parameterbeschreibung, statt gültige Belege vorab abzulehnen.
- **Die Zeitzone der Datumsfelder ist nirgends dokumentiert.** Werte werden unverändert
  durchgereicht und nicht umgerechnet.
- **Die Drosselung ist prozesslokal.** Zwei gleichzeitig laufende Clients auf demselben Mandanten
  teilen sich den Zähler nicht und können gemeinsam das Minutenlimit der API reißen. Die Vorgabe
  60 statt 100 hält deshalb Abstand.
- **Prompt-Injection über Freitextfelder lässt sich nicht vollständig verhindern**, siehe
  [Abschnitt 13](#13-was-der-server-mit-ihren-daten-macht).
- **Die Clientanleitungen altern.** Pfade und Befehle der Clients ändern sich; vier der in
  [5.8](#58-windsurf-zed-cline-continue-lm-studio-jan) genannten Pfade sind nicht
  verifiziert. Deshalb schreibt der Einrichtungsassistent dort nichts, sondern gibt nur aus.

---

## 18. Einen neuen Endpunkt nachrüsten

Bekommt die API einen neuen Endpunkt, sind es genau fünf Schritte:

1. **Die neue Spezifikationsdatei einspielen und `pnpm generate` ausführen.** Die
   Vollständigkeitsprüfung P1 schlägt fehl und nennt den neuen Pfad.
2. **Eine Datei `src/registry/tools/<werkzeugname>.ts` anlegen.** Der Dateiname ist der
   Werkzeugname.
3. **Den Eintrag nach dem Typ `ToolEntry` füllen:** Name, Titel, Pfad, Wirkung, Klasse,
   Beschreibung mit dem passenden Pflichtsatz, alle Felder, `verifyWith`, Eimer, Zeitlimitstufe,
   `concise` und Antwortvertrag.
4. **`pnpm generate` erneut ausführen.** Der Registerindex wird ergänzt, die Werkzeugtabelle
   dieser README wird neu erzeugt. Der Index ist nicht eingecheckt und deshalb auch nicht zu
   committen.
5. **`pnpm test` ausführen.** Die dreizehn Registerprüfungen sind grün oder nennen genau, was
   fehlt.

**Einen sechsten Schritt gibt es nicht.** Es ist keine Sammeldatei zu ändern, kein Handler zu
schreiben und keine Liste an zweiter Stelle zu pflegen.

---

## 19. Mitwirken

**Fehler melden:** über die Issues des Repositories
[dennismenken/buchhaltungsbutler-mcp](https://github.com/dennismenken/buchhaltungsbutler-mcp).
Legen Sie die Ausgabe von `bbutler-mcp doctor` bei; sie enthält kein Geheimnis. Für
Sicherheitslücken gilt der Weg in [SECURITY.md](SECURITY.md), nicht der öffentliche Issue.

**Entwicklungsumgebung, Testregeln und der Weg über das Register** stehen in
[CONTRIBUTING.md](CONTRIBUTING.md). Die Kurzfassung:

```bash
pnpm install
pnpm generate && pnpm typecheck && pnpm lint && pnpm test
```

**Kein Test spricht mit der echten API.** Der normale Testlauf sperrt das Netz; ein eigener Test
prüft, dass diese Sperre aktiv ist.

**Vor jeder Veröffentlichung ist der Vertragslauf `pnpm contract:read` Pflicht.** Er ruft die 15
lesenden Endpunkte gegen echte Zugangsdaten auf und vergleicht die gelieferten Felder mit den
hinterlegten Antwortverträgen. Er läuft nicht in der öffentlichen CI und ist ein blockierender
Punkt der Veröffentlichungs-Checkliste.

---

## 20. Lizenz und Abgrenzung

Lizenz: **MIT**, siehe [LICENSE](LICENSE).

- **Dieses Projekt ist inoffiziell.** Es steht in keiner Verbindung zur BuchhaltungsButler GmbH,
  wird von dort weder herausgegeben noch unterstützt noch geprüft. Einzelheiten in
  [NOTICE.md](NOTICE.md).
- **„BuchhaltungsButler" ist eine Marke ihres Rechteinhabers.** Der Name wird hier ausschließlich
  benutzt, um zu beschreiben, mit welcher Schnittstelle dieses Programm spricht.
- **Dies ist kein Ersatz für steuerliche Beratung.** Was gebucht werden darf und wie, entscheidet
  Ihre Steuerberatung, nicht ein Sprachmodell.
- **Die Verantwortung für jede Buchung bleibt bei Ihnen.** Der Server führt aus, was Ihr
  Assistent aufruft. Er prüft keine fachliche Richtigkeit, und er kann eine falsche Buchung nicht
  zurücknehmen.
