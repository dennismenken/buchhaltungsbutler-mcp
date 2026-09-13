# Dokumentation

Dieses Verzeichnis ist das Nachschlagewerk hinter dem Server: die BuchhaltungsButler-API, das
nötige Buchhaltungswissen und die Technik drumherum. Es besteht aus **achtzehn Dokumenten** und
der offiziellen Spezifikationsdatei.

Diese Datei sagt, welches Dokument welche Frage beantwortet, wo man je nach Vorhaben einsteigt
und welche Datei bei widersprüchlichen Angaben gilt. Sie ersetzt kein Dokument: Sie enthält
keine Parameterlisten, keine Fehlercodes und keine Beispielaufrufe.

**Was hier nicht steht:**

- **Wie man den Server installiert und benutzt** — [`README.md`](../README.md) im
  Wurzelverzeichnis.
- **Wie man mitarbeitet, testet und ein Werkzeug ergänzt** — [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- **Was sich von Version zu Version geändert hat** — [`CHANGELOG.md`](../CHANGELOG.md).

---

## 1. Wo was steht

### 1.1 Die Schnittstelle (`docs/api/`)

Neun Dateien zur BuchhaltungsButler-API v1, Spezifikationsversion 1.9.1. Die sechs
endpunktbezogenen Dossiers decken die 54 Pfade vollständig und überschneidungsfrei ab:
8 + 8 + 12 + 3 + 5 + 18 = 54.

| Datei | Zuständigkeit | Behandelte Endpunkte beziehungsweise Themen |
| --- | --- | --- |
| [`api/grundlagen.md`](api/grundlagen.md) | Alles, was für jeden Aufruf gilt, unabhängig vom Endpunkt. | Basis-URL und POST-Only-Prinzip; Datenmodell (Receipt, Transaction, Posting, Invoice, Stammdaten, Reports, Comments) und `id_by_customer`; Authentifizierung aus API Client, API Secret und `api_key`; Rate Limiting inklusive endpunktspezifischer Engpässe; Erfolgs- und Fehlerumschlag; querschnittliche Parameterkonventionen (`limit`/`offset`, drei `order`-Formen, Datums- und Betragsformate, Währungen, Booleans, leere Werte, parallele Arrays); Offset-Paginierung und Abbruchbedingung; Idempotenz und Nebenwirkungen mit Wirkungstabelle aller 54 Endpunkte; Eigenheiten der Spezifikationsdatei. |
| [`api/belege.md`](api/belege.md) | Die acht Beleg-Endpunkte im Detail. | `/receipts/get`, `/receipts/get/id_by_customer`, `/receipts/add`, `/receipts/addBatch`, `/receipts/upload`, `/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer`, `/receipts/assigned-transactions/get`; dazu `list_direction` gegenüber `type`, `filename`, `e_invoice_type`, `file_type`, die Verknüpfung von Belegen mit Transaktionen und die Abweichungen von der Spezifikation. |
| [`api/transaktionen.md`](api/transaktionen.md) | Die acht Transaktions-Endpunkte im Detail. | `/transactions/get`, `/transactions/get/id_by_customer`, `/transactions/add`, `/transactions/addBatch`, `/transactions/assign/receipt`, `/transactions/unassign/receipt`, `/transactions/assign-batch/receipt`, `/transactions/assigned-receipts/get`; dazu die Abgrenzung Transaktion gegenüber Beleg gegenüber Buchung und die exklusiven Grenzen von `id_by_customer_from`/`id_by_customer_to`. |
| [`api/buchungen.md`](api/buchungen.md) | Die zwölf Buchungs-Endpunkte im Detail. | `/postings/get`, `/postings/add/receipt`, `/postings/add-batch/receipts`, `/postings/add/transaction`, `/postings/add-batch/transactions`, `/postings/add/free`, `/postings/add-batch/free`, `/postings/unconfirm/transaction`, `/postings/unconfirm/receipt`, `/postings/unconfirm/free`, `/postings/assign/receipt-to-free-posting`, `/postings/cancel`; dazu Soll und Haben, Gegenkonto, Steuerschlüssel, Kostenstellen, Festschreibung, Entbestätigen, Stornieren und Splitbuchungen über parallele Arrays. |
| [`api/rechnungen.md`](api/rechnungen.md) | Die drei Endpunkte zur Erzeugung von Ausgangsrechnungen. | `/invoices/create`, `/invoices/create/e-invoice`, `/invoices/create/draft`; dazu Positionen als parallele Arrays, E-Rechnungsformate (XRechnung, ZUGFeRD), EN 16931, die deutsche E-Rechnungspflicht und der Weg der erzeugten Rechnung in den Belegbestand. Alle drei Endpunkte sind schreibend und wurden deshalb nicht live aufgerufen. |
| [`api/berichte.md`](api/berichte.md) | Die fünf Report-Endpunkte und das zweistufige Erzeugungsmuster. | `/reports/create/bwa`, `/reports/create/sums`, `/reports/get/bwa`, `/reports/get/sums`, `/reports/get/sums/ledger`; dazu die fachliche Einordnung von BWA, Summen- und Saldenliste und Kontenblatt sowie die Warnung, dass ein Create-Aufruf den vorher erzeugten Bericht desselben Typs ersetzt. |
| [`api/stammdaten.md`](api/stammdaten.md) | Die achtzehn Stammdaten-Endpunkte. | Debitoren (4), Kreditoren (4), Sachkonten (3), Zahlungskonten (2), Kostenstellen (4) und `/comments/add`; dazu die Begriffsklärung Konto gegenüber Sachkonto gegenüber Debitor gegenüber Kreditor sowie SKR03 und SKR04. |
| [`api/fehlercodes.md`](api/fehlercodes.md) | Vollständiges Fehlerverzeichnis, mechanisch aus der Spezifikation extrahiert. | Alle 718 `_ErrorCode*`-Definitionen, davon 676 einem Endpunkt zugeordnet und 42 in keinem `responses`-Block referenziert; globale Codes aus den `Request_*`-Definitionen; Fehlercodes je Endpunkt mit HTTP-Status; die Fälle, in denen derselbe `error_code` je Endpunkt etwas anderes bedeutet. |
| [`api/live-befunde.md`](api/live-befunde.md) | Eigene Messungen gegen die echte API, ausschließlich lesende Aufrufe. | Die Stellen, an denen die Spezifikationsdatei nachweislich falsch ist: `id_by_customer` im Pfad als Platzhalter statt als literales Segment, Antwortfelder, die die Spezifikation nicht kennt, und die Typ-Asymmetrie zwischen Schreiben und Lesen. Alle Geschäftsdaten in den Beispielen sind anonymisiert. |

### 1.2 Fachwissen (`docs/fachwissen/`)

| Datei | Zuständigkeit | Behandelte Themen |
| --- | --- | --- |
| [`fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md) | Was ein Agent fachlich wissen muss, um die Feldnamen der API richtig zu deuten und zu erkennen, wann eine Rückfrage beim Menschen zwingend ist. | Glossar der Kernbegriffe (Beleg, Zahlung, Buchung, Soll und Haben, Sachkonto, Debitor, Kreditor, Umsatzsteuer, Vorsteuer, Festschreibung und weitere); der typische Ablauf vom Beleg und Bankumsatz zur Buchung; SKR03 gegenüber SKR04; rechtliche Leitplanken (GoBD, Aufbewahrung, Umsatzsteuer); Warnungen für autonome Agenten. |

### 1.3 Technik und Veröffentlichung (`docs/entwicklung/`)

Acht Dateien, die nicht die BuchhaltungsButler-API beschreiben, sondern das Protokoll, die
Werkzeuge und den Weg zum Nutzer.

| Datei | Zuständigkeit | Behandelte Themen |
| --- | --- | --- |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md) | Der normative Stand des Model Context Protocol und was davon für diesen Server gilt. | Protokollversion `2026-07-28` mit Änderungshistorie seit `2025-06-18`; Architektur; Lifecycle und Zustandslosigkeit; Transporte (stdio, Streamable HTTP); Tools, Resources, Prompts; weitere Fähigkeiten (Tasks, MRTR, Progress, Cancellation, Caching); Abgrenzung JSON-RPC-Fehler gegenüber Tool-Fehler; Sicherheitsanforderungen. |
| [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) | Die tatsächliche API der TypeScript-SDKs, verifiziert gegen die installierten Pakete. | Die beiden parallelen SDK-Linien v1 (`@modelcontextprotocol/sdk`) und v2 (`@modelcontextprotocol/server`); Zod 3 gegenüber Zod 4 gegenüber Standard Schema; `McpServer` gegenüber `Server`; `registerTool`, `registerResource`, `registerPrompt`; Fehlerbehandlung, Logging, Progress, Cancellation, `RequestHandlerExtra`; Packaging-Fallstricke der v1-Root-Exporte. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md) | Wie die 54 Endpunkte auf Werkzeuge geschnitten, benannt, beschrieben und abgesichert werden. | Endpunkt-Tool gegenüber Absichts-Tool; Namensschema; Aufbau von Tool- und Parameterbeschreibungen; Eingabeschemata; Antwortformat und Kürzungsstrategie; Fehlermeldungen als Lehrmittel; Klassifikation der Werkzeuge in lesend, additiv, ändernd, zerstörend und buchend; Bestätigungsmuster und Nur-Lesen-Modus; Evaluierung. |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | Welche Sprach-, Build-, Test- und Lint-Werkzeuge in welcher Version eingesetzt werden. | Node-LTS-Lage und `engines.node`; TypeScript-Version; SDK- und Zod-Versionen; Build; Tests und HTTP-Mocking; Linting und Formatierung; HTTP-Client; Validierung von Umgebungsvariablen; npm-Veröffentlichung inklusive Trusted Publishing; GitHub Actions; Lizenz und Kennzeichnung als inoffizielles Projekt. |
| [`entwicklung/distribution.md`](entwicklung/distribution.md) | Wie der fertige Server installiert und in die einzelnen MCP-Clients eingebunden wird. | Claude Code, Claude Desktop, OpenAI Codex CLI, ChatGPT, Grok und xAI, Cursor, Visual Studio Code mit GitHub Copilot, weitere Clients, generische Konfigurationsform; Startvarianten `npx`, globale Installation, lokaler Klon; Übergabe der Zugangsdaten über `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY`; Einrichtungsassistent und `doctor`; der Befund zum bereits vergebenen npm-Paketnamen. |
| [`entwicklung/werkzeugkontext-clients.md`](entwicklung/werkzeugkontext-clients.md) | Ob ein Client alle Werkzeugdefinitionen in jede Modellanfrage legt oder erst bei Bedarf nachlädt — je Client einzeln, mit Belegstufe. | Claude Desktop, Claude Code, Codex CLI, ChatGPT, Cursor, VS Code mit Copilot, Windsurf, Cline, LM Studio, Zed, Continue, Jan; Protokoll- und SDK-Ebene; was das für 59 Werkzeuge bedeutet; elf Hebel auf Serverseite mit Bewertung. |
| [`entwicklung/tokenbudget.md`](entwicklung/tokenbudget.md) | Wie viel Kontext dieser Server kostet, gemessen. | Zeichen und Token der 54 Werkzeugdefinitionen und der `instructions`, das Zeichen-je-Token-Verhältnis, das Budget, die Werte je Werkzeuggruppe und die zehn teuersten Definitionen. **Die Datei wird von `scripts/measure-tokens.ts` erzeugt** (`pnpm measure-tokens`); von Hand geänderte Zahlen sind beim nächsten Lauf wieder weg. |
| [`entwicklung/veroeffentlichungs-checkliste.md`](entwicklung/veroeffentlichungs-checkliste.md) | Was vor einer Veröffentlichung auf npm zu tun ist, in der Reihenfolge des Abarbeitens. | Vorbedingungen im Arbeitsverzeichnis; Felder der `package.json`; der blockierende Vertragslauf gegen die echte API; Größenbudget, Bau und Bundle; `CHANGELOG.md`; npm-Konto, Namensraum und Trusted Publishing; Tag setzen und pushen; Prüfungen nach dem Lauf; was zu tun ist, wenn etwas schiefgeht. |

### 1.4 Die Spezifikationsdatei (`docs/openapi/`)

| Pfad | Was es ist |
| --- | --- |
| [`openapi/buchhaltungsbutler-v1.json`](openapi/buchhaltungsbutler-v1.json) | Die offizielle Swagger-2.0-Beschreibung der API in Version 1.9.1, heruntergeladen am 2026-09-12 von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`. Grundwahrheit für Pfade, Parameter und Fehlerdefinitionen; aus ihr erzeugt `pnpm generate` die Dateien unter `src/generated/`. Achtung: Die Datei ist kein valides Swagger 2.0, Body-Parameter stehen als Einzeleinträge statt in einem gemeinsamen `schema`-Objekt, und `enum`-Listen mit genau einem Eintrag sind Beispielwerte, keine erlaubten Wertemengen. Kein generischer Codegenerator darf blind darauf angesetzt werden. Die Einzelheiten stehen in [`api/grundlagen.md`](api/grundlagen.md). |

---

## 2. Einstiege

**Ich schlage das Verhalten eines Endpunkts nach.** Zuerst
[`api/grundlagen.md`](api/grundlagen.md) — Umschlag, Paginierung, Formate und Rate Limiting
gelten für jeden Aufruf. Danach das zuständige Endpunkt-Dossier. Bei einem Fehlercode ist der
Schlüssel immer das Paar aus Pfad und `error_code`; [`api/fehlercodes.md`](api/fehlercodes.md)
ist dafür ein Nachschlagewerk und keine Lektüre am Stück.

**Ich verstehe einen Feldnamen fachlich nicht.**
[`fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md), insbesondere das Glossar und den
Abschnitt „Warnungen für autonome Agenten". Ohne diese Begriffe bedeutet
`postingaccount_number` nichts und der Unterschied zwischen Löschen und Stornieren wird zum
Datenverlust.

**Ich rüste ein Werkzeug nach.** Der Weg steht in
[`README.md`, Abschnitt 18](../README.md#18-einen-neuen-endpunkt-nachrüsten) und in
[`CONTRIBUTING.md`](../CONTRIBUTING.md). Die Begründungen hinter dem Zuschnitt — Namensschema,
Beschreibungsbudget, Pflichtsätze, Annotationen — stehen in
[`entwicklung/tool-design.md`](entwicklung/tool-design.md).

**Ich will wissen, was der Server an Kontext kostet.**
[`entwicklung/tokenbudget.md`](entwicklung/tokenbudget.md) nennt die gemessenen Zahlen,
[`entwicklung/werkzeugkontext-clients.md`](entwicklung/werkzeugkontext-clients.md) sagt, welcher
Client sie überhaupt in jede Anfrage legt.

**Ich veröffentliche eine Version.**
[`entwicklung/veroeffentlichungs-checkliste.md`](entwicklung/veroeffentlichungs-checkliste.md),
von oben nach unten.

---

## 3. Vorrang bei widersprüchlichen Angaben

### 3.1 Vorrangregeln, die die Dossiers selbst festlegen

Diese Regeln sind keine Erfindung dieses Index; die genannten Dateien erklären sich ausdrücklich
selbst für maßgeblich. Sie gehen jeder Zeile der Tabelle in 3.2 vor.

- **Werkzeugentwurf:** [`entwicklung/tool-design.md`](entwicklung/tool-design.md) ist für
  Toolschnitt, Namensschema und Beschreibungen die maßgebliche Festlegung;
  [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) übernimmt das
  Namensschema ausdrücklich und begründet die Verengung gegenüber der weiteren SDK-Regel.
- **Versionen und Build:** [`entwicklung/toolchain.md`](entwicklung/toolchain.md) nennt je
  Kollision den verbindlichen Wert für SDK-Linie, `engines.node`, `typescript`, Build und
  `bin`-Ziel und verpflichtet die Gegenstelle zur Angleichung.
- **Protokollpflichten:** In
  [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md) geht der Abschnitt
  11.1a der Zielzustandstabelle in 11.1 vor: Er markiert je Zeile, ob sie unter der tatsächlich
  ausgehandelten Revision überhaupt anwendbar ist.

### 3.2 Vorrang nach Themenfeld

| Themenfeld | Führende Datei | Nachrangig | Begründung |
| --- | --- | --- | --- |
| **API-Verhalten, querschnittlich** (Auth, Umschlag, Rate Limit, Paginierung, Datums- und Betragsformate, Nebenwirkungen) | [`api/grundlagen.md`](api/grundlagen.md) | alle übrigen Dateien | Die Datei ist gegen die laufende API verifiziert; die Entwicklungsdossiers beschreiben die API nur aus zweiter Hand. |
| **API-Verhalten, endpunktspezifisch** (Parameter, Antwortfelder, Fallstricke eines Pfads) | das zuständige Endpunkt-Dossier | [`api/grundlagen.md`](api/grundlagen.md) | Grundlagen beschreibt die Regel, das Endpunkt-Dossier die Ausnahme. Eine Ausnahme schlägt die Regel, sofern sie dort ausdrücklich belegt ist. |
| **Fehlercodes und HTTP-Status** | [`api/fehlercodes.md`](api/fehlercodes.md) | alle übrigen Dateien | Mechanische, vollständige Extraktion aller 718 Definitionen ohne Interpretation. Andere Dossiers zitieren nur Ausschnitte. |
| **Widerspruch zwischen Spezifikationsdatei und Messung** | [`api/live-befunde.md`](api/live-befunde.md) und die als **LIVE** gekennzeichneten Stellen der Endpunkt-Dossiers | die Spezifikationsdatei | Die Spezifikation weicht an mehreren Stellen nachweislich vom tatsächlichen Verhalten ab. Sie bleibt maßgeblich, wo nichts live geprüft wurde. |
| **Protokoll** (MCP-Semantik, Versionsaushandlung, Tool- und Result-Struktur, Annotationen, Sicherheitspflichten) | [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md) | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), [`entwicklung/tool-design.md`](entwicklung/tool-design.md) | Die Spezifikation ist normativ, das SDK eine Implementierung davon und der Werkzeugentwurf eine Anwendung. Eine Pflicht, die das eingesetzte SDK unter der tatsächlich ausgehandelten Revision nicht erfüllen kann, ist Zielzustand und nicht Umsetzungspflicht. |
| **SDK** (Signaturen, Importpfade, Rückgabewerte, Packaging-Fallstricke) | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) | [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | Die Angaben stammen aus Laufzeittests gegen frische Installationen beider SDK-Linien. Ausnahme: Für Paketauswahl und Versionsangaben gilt die Zeile darunter. |
| **Werkzeuge der Entwicklung** (Node-Untergrenze, TypeScript-Version, Build, Test, Lint, HTTP-Client, CI, npm-Veröffentlichung, Lizenz, `package.json`) | [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) | `toolchain.md` legt je Kollision ausdrücklich fest, welcher Wert verbindlich ist. |
| **Werkzeugentwurf** (Toolschnitt, Namensschema, Beschreibungen, Eingabeschemata, Antwortformat, Betriebsmodi) | [`entwicklung/tool-design.md`](entwicklung/tool-design.md) | [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) | `tool-design.md` ist für dieses Feld das Fachdossier. Harte Grenze: Wo die Protokoll- oder SDK-Ebene eine Form technisch erzwingt, gilt diese Grenze. |
| **Verteilung** (Clientkonfiguration, Startvarianten, Übergabe der Zugangsdaten, Paketname) | [`entwicklung/distribution.md`](entwicklung/distribution.md) | [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | `distribution.md` ist für dieses Feld das Fachdossier. Ausnahme: Für Felder und Inhalt der `package.json` selbst gilt `toolchain.md`. |
| **Fachwissen** (buchhaltungsrechtliche Begriffe, Kontenrahmen, Pflichten, Rückfragegebote) | [`fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md) | alle übrigen Dateien | Die API-Dossiers erklären Fachbegriffe nur so weit, wie es für ihren Endpunkt nötig ist. Ausnahme: Für die konkrete Bedeutung eines API-Feldes gilt das Endpunkt-Dossier. |

### 3.3 Zwei Regeln über allen Tabellenzeilen

1. **Eine ausdrücklich als „nicht verifiziert" oder „Annahme" gekennzeichnete Aussage verliert
   immer gegen eine belegte Aussage**, auch wenn sie in der nach Themenfeld führenden Datei
   steht.
2. **Sicherheit schlägt Bequemlichkeit.** Widersprechen sich zwei Dateien in einer Frage, bei
   der eine Variante schreibende Wirkung auf die echte Buchhaltung zulässt und die andere sie
   verhindert, gilt die restriktivere Variante.

### 3.4 Und über allem: der ausgelieferte Server

Die Dateien unter `docs/entwicklung/` sind zuerst Recherche und Entwurf; einzelne Festlegungen
haben sich während der Umsetzung geändert. **Wo ein Dossier und der ausgelieferte Server sich
widersprechen, gilt der Server.** Was er tut, steht in [`README.md`](../README.md); wie er es
tut, im Quelltext unter `src/`. Ausgenommen sind die drei Dateien, die den heutigen Stand
beschreiben und nicht den geplanten: `tokenbudget.md` (gemessen und erzeugt),
`werkzeugkontext-clients.md` (Recherche mit Belegstufe je Aussage) und
`veroeffentlichungs-checkliste.md` (Arbeitsanweisung).
