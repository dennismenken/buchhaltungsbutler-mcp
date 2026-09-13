# Dossier-Index: inoffizieller MCP-Server für BuchhaltungsButler

Dies ist der Einstiegspunkt in das Dokumentationskonvolut unter
`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs`. Die Datei beantwortet vier
Fragen: welche Datei welches Thema abdeckt, in welcher Reihenfolge sie zu lesen sind, welche
Datei bei widersprüchlichen Angaben gilt, und welche Entscheidungen noch offen sind.

**Stand: 2026-09-12.** Quelle dieses Index sind ausschließlich die vierzehn Dossiers selbst,
gelesen am 2026-09-12. Die Datei enthält keine eigenen Rechercheergebnisse. Wo unten eine
inhaltliche Aussage steht, ist sie ein Verweis auf die Fundstelle im jeweiligen Dossier, nicht
eine zusätzliche Behauptung.

**Abgrenzung.** Dieser Index ist kein Ersatz für die Dossiers. Er enthält keine Parameterlisten,
keine Fehlercodes und keine Beispielaufrufe. Wer implementiert, liest das zuständige Dossier.

---

## Teil 1: Alle vierzehn Dossiers

Die Spalte "Zuständigkeit" nennt in einem Satz, welche Frage die Datei beantwortet. Die Spalte
"Behandelte Endpunkte beziehungsweise Themen" ist die Trefferliste für die Suche.

### 1.1 API-Dossiers (`docs/api/`)

Diese acht Dateien beschreiben das Verhalten der BuchhaltungsButler-API v1 (Spezifikationsversion
1.9.1). Die sechs endpunktbezogenen Dossiers decken die 54 Pfade der Spezifikation vollständig und
überschneidungsfrei ab: 8 + 8 + 12 + 3 + 5 + 18 = 54.

| Datei (absoluter Pfad) | Zuständigkeit | Behandelte Endpunkte beziehungsweise Themen |
| --- | --- | --- |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/grundlagen.md`](api/grundlagen.md) | Alles, was für jeden Aufruf gilt, unabhängig vom Endpunkt. | Basis-URL und POST-Only-Prinzip; Datenmodell (Receipt, Transaction, Posting, Invoice, Stammdaten, Reports, Comments) und `id_by_customer`; Authentifizierung aus API Client, API Secret und `api_key`; Rate Limiting inklusive endpunktspezifischer Engpässe; Erfolgs- und Fehlerumschlag; querschnittliche Parameterkonventionen (`limit`/`offset`, drei `order`-Formen, Datums- und Betragsformate, Währungen, Booleans, leere Werte, parallele Arrays); Offset-Paginierung und Abbruchbedingung; Idempotenz und Nebenwirkungen mit Wirkungstabelle aller 54 Endpunkte; Eigenheiten der Spezifikationsdatei; undokumentierte Definitionsspuren (`PostingsReservations*`). |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/belege.md`](api/belege.md) | Die acht Beleg-Endpunkte im Detail. | `/receipts/get`, `/receipts/get/id_by_customer`, `/receipts/add`, `/receipts/addBatch`, `/receipts/upload`, `/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer`, `/receipts/assigned-transactions/get`; dazu `list_direction` gegenüber `type`, `filename`, `e_invoice_type`, `file_type`, Verknüpfung von Belegen mit Transaktionen, Live-Abweichungen von der Spezifikation. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/transaktionen.md`](api/transaktionen.md) | Die acht Transaktions-Endpunkte im Detail. | `/transactions/get`, `/transactions/get/id_by_customer`, `/transactions/add`, `/transactions/addBatch`, `/transactions/assign/receipt`, `/transactions/unassign/receipt`, `/transactions/assign-batch/receipt`, `/transactions/assigned-receipts/get`; dazu die Abgrenzung Transaktion gegenüber Beleg gegenüber Buchung und die exklusiven Grenzen von `id_by_customer_from`/`id_by_customer_to`. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/buchungen.md`](api/buchungen.md) | Die zwölf Buchungs-Endpunkte im Detail. | `/postings/get`, `/postings/add/receipt`, `/postings/add-batch/receipts`, `/postings/add/transaction`, `/postings/add-batch/transactions`, `/postings/add/free`, `/postings/add-batch/free`, `/postings/unconfirm/transaction`, `/postings/unconfirm/receipt`, `/postings/unconfirm/free`, `/postings/assign/receipt-to-free-posting`, `/postings/cancel`; dazu Soll und Haben, Gegenkonto, Steuerschlüssel, Kostenstellen, Festschreibung, Entbestätigen, Stornieren und Splitbuchungen über parallele Arrays. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/rechnungen.md`](api/rechnungen.md) | Die drei Endpunkte zur Erzeugung von Ausgangsrechnungen. | `/invoices/create`, `/invoices/create/e-invoice`, `/invoices/create/draft`; dazu Positionen als parallele Arrays, E-Rechnungsformate (XRechnung, ZUGFeRD), EN 16931, die deutsche E-Rechnungspflicht und der Weg der erzeugten Rechnung in den Belegbestand. Alle drei Endpunkte sind schreibend und wurden deshalb nicht live aufgerufen. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/berichte.md`](api/berichte.md) | Die fünf Report-Endpunkte und das zweistufige Erzeugungsmuster. | `/reports/create/bwa`, `/reports/create/sums`, `/reports/get/bwa`, `/reports/get/sums`, `/reports/get/sums/ledger`; dazu die fachliche Einordnung von BWA, Summen- und Saldenliste und Kontenblatt sowie die Warnung, dass ein Create-Aufruf den vorher erzeugten Bericht desselben Typs ersetzt. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/stammdaten.md`](api/stammdaten.md) | Die achtzehn Stammdaten-Endpunkte aus vier Gruppen. | Debitoren: `/settings/get/debtors`, `/settings/add/debtor`, `/settings/add-batch/debtors`, `/settings/update/debtor`. Kreditoren: `/settings/get/creditors`, `/settings/add/creditor`, `/settings/add-batch/creditors`, `/settings/update/creditor`. Sachkonten: `/settings/get/postingaccounts`, `/settings/add/postingaccount`, `/settings/update/postingaccount`. Konten: `/accounts/get`, `/accounts/add`. Kostenstellen: `/cost-locations/get`, `/cost-locations/add`, `/cost-locations/update`, `/cost-locations/delete`. Kommentare: `/comments/add`. Dazu die Begriffsklärung Konto gegenüber Sachkonto gegenüber Debitor gegenüber Kreditor sowie SKR03 und SKR04. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/api/fehlercodes.md`](api/fehlercodes.md) | Vollständiges Fehlerverzeichnis, mechanisch aus der Spezifikation extrahiert. | Alle 718 `_ErrorCode*`-Definitionen, davon 676 einem Endpunkt zugeordnet und 42 in keinem `responses`-Block referenziert; globale Codes aus den `Request_*`-Definitionen; Fehlercodes je Endpunkt mit HTTP-Status; die Fälle, in denen derselbe `error_code` je Endpunkt etwas anderes bedeutet; Empfehlung für die Fehlerbehandlung im Server. |

### 1.2 Entwicklungsdossiers (`docs/entwicklung/`)

Diese fünf Dateien beschreiben nicht die BuchhaltungsButler-API, sondern die Technik drumherum.
Sie enthalten die meisten offenen Entscheidungen, siehe Teil 4.

| Datei (absoluter Pfad) | Zuständigkeit | Behandelte Endpunkte beziehungsweise Themen |
| --- | --- | --- |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md) | Der normative Stand des Model Context Protocol und was davon für unseren Server gilt. | Protokollversion `2026-07-28` mit Änderungshistorie seit `2025-06-18`; Architektur; Lifecycle und Zustandslosigkeit; Transporte (stdio, Streamable HTTP); Tools, Resources, Prompts; weitere Fähigkeiten (Tasks, MRTR, Progress, Cancellation, Caching); Abgrenzung JSON-RPC-Fehler gegenüber Tool-Fehler; Sicherheitsanforderungen; Entscheidungsvorlage für unseren Server mit sechs ausdrücklich offenen Punkten. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) | Die tatsächliche API der TypeScript-SDKs, verifiziert gegen die installierten Pakete. | Die beiden parallelen SDK-Linien v1 (`@modelcontextprotocol/sdk@1.30.0`) und v2 (`@modelcontextprotocol/server@2.0.0`); Zod 3 gegenüber Zod 4 gegenüber Standard Schema; `McpServer` gegenüber `Server`; `registerTool`, `registerResource`, `registerPrompt`; Fehlerbehandlung, Logging, Progress, Cancellation, `RequestHandlerExtra`; Packaging-Fallstricke der v1-Root-Exporte; verbindliche Implementierungsmuster. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/tool-design.md`](entwicklung/tool-design.md) | Wie die 54 Endpunkte auf Werkzeuge geschnitten, benannt, beschrieben und abgesichert werden. | Endpunkt-Tool gegenüber Absichts-Tool; Namensschema; Aufbau von Tool- und Parameterbeschreibungen; Eingabeschemata; Antwortformat und Kürzungsstrategie; Fehlermeldungen als Lehrmittel; Klassifikation der Werkzeuge in lesend, additiv, ändernd, zerstörend und buchend; Bestätigungsmuster und Nur-Lesen-Modus; Evaluierung; Abnahmeliste. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/toolchain.md`](entwicklung/toolchain.md) | Welche Sprach-, Build-, Test- und Lint-Werkzeuge in welcher Version eingesetzt werden. | Node-LTS-Lage und `engines.node`; TypeScript-Version und der Aufschub von TypeScript 7; SDK- und Zod-Versionen; Build (`tsc`, `tsup`, `tsdown`, `esbuild`); Tests (`vitest`, `node:test`, HTTP-Mocking); Linting und Formatierung; HTTP-Client (eingebautes `fetch`, `undici`, `got`); Validierung von Umgebungsvariablen; npm-Veröffentlichung inklusive Trusted Publishing; GitHub Actions; Lizenz und Kennzeichnung als inoffizielles Projekt; Entwürfe für `package.json` und `tsconfig.json`. |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/distribution.md`](entwicklung/distribution.md) | Wie der fertige Server installiert und in die einzelnen MCP-Clients eingebunden wird. | Claude Code, Claude Desktop, OpenAI Codex CLI, ChatGPT, Grok und xAI, Cursor, Visual Studio Code mit GitHub Copilot, weitere Clients, generische Konfigurationsform; Startvarianten `npx`, globale Installation, lokaler Klon; Übergabe der Zugangsdaten über `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY`; Entwurf eines Einrichtungsassistenten mit `doctor`-Unterbefehl; der Befund zum bereits vergebenen npm-Paketnamen; Textbausteine für die Projekt-README. |

### 1.3 Fachdossier (`docs/fachwissen/`)

| Datei (absoluter Pfad) | Zuständigkeit | Behandelte Endpunkte beziehungsweise Themen |
| --- | --- | --- |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md) | Was ein Agent fachlich wissen muss, um die Feldnamen der API richtig zu deuten und zu erkennen, wann eine Rückfrage beim Menschen zwingend ist. | Glossar der Kernbegriffe (Beleg, Zahlung, Buchung, Soll und Haben, Sachkonto, Debitor, Kreditor, Umsatzsteuer, Vorsteuer, Festschreibung und weitere); der typische Ablauf vom Beleg und Bankumsatz zur Buchung; SKR03 gegenüber SKR04; rechtliche Leitplanken (GoBD, Aufbewahrung, Umsatzsteuer); Warnungen für autonome Agenten. |

### 1.4 Keine Dossiers, aber zugehörig

| Pfad | Was es ist |
| --- | --- |
| [`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json`](openapi/buchhaltungsbutler-v1.json) | Die offizielle Swagger-2.0-Beschreibung der API in Version 1.9.1, heruntergeladen am 2026-09-12 von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`. Grundwahrheit für Pfade, Parameter und Fehlerdefinitionen. Achtung: Die Datei ist kein valides Swagger 2.0, Body-Parameter stehen als Einzeleinträge statt in einem gemeinsamen `schema`-Objekt, und `enum`-Listen mit genau einem Eintrag sind Beispielwerte, keine erlaubten Wertemengen. Kein generischer Codegenerator darf blind darauf angesetzt werden. Die Einzelheiten stehen in [`api/grundlagen.md`](api/grundlagen.md), Abschnitt 8. |
| `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/README.md` | Diese Datei. |

---

## Teil 2: Lesereihenfolge für einen Implementierungs-Agenten

Die Reihenfolge ist nach Abhängigkeit sortiert, nicht nach Umfang. Wer Stufe 1 überspringt,
trifft in Stufe 3 Entscheidungen ohne Grundlage.

**Stufe 0, Pflichtlektüre vor jeder Zeile Code.**

1. [`fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md) — insbesondere das Glossar und den Abschnitt "Warnungen für
   autonome Agenten". Ohne diese Begriffe bedeutet `postingaccount_number` nichts und der
   Unterschied zwischen Löschen und Stornieren wird zum Datenverlust.
2. [`api/grundlagen.md`](api/grundlagen.md) — vollständig. Diese Datei ist die Grundlage für jedes API-Dossier.

**Stufe 1, Protokoll und Laufzeitumgebung festlegen.**

3. [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md) — mindestens Abschnitt 1 (Protokollversion), Abschnitt 5
   (Tools), Abschnitt 9 (Fehlerbehandlung), Abschnitt 10 (Sicherheit) und Abschnitt 11
   (Konsequenzen für unseren Server, inklusive der offenen Entscheidungen in 11.4).
4. [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) — mindestens Abschnitt 1 (die beiden SDK-Linien),
   Abschnitt 5 (`registerTool`), Abschnitt 8 (Fallstricke) und Abschnitt 10 (verbindliche
   Vorgaben).
5. [`entwicklung/toolchain.md`](entwicklung/toolchain.md) — mindestens Abschnitt 1 (Node-Untergrenze), Abschnitt 12
   (empfohlene Abhängigkeiten) und Abschnitt 15 (Entscheidungsbedarf).

An dieser Stelle ist Entscheidung 1 aus Teil 4 zu treffen, weil sie die Paketauswahl bestimmt
und sich später nur teuer korrigieren lässt. Die Punkte 2 und 7 sind dort bereits entschieden,
aber vor dem Codieren zu lesen: Punkt 2 sagt, welche Protokollrevision der Server tatsächlich
spricht, Punkt 7 nennt die vier verbindlichen Versions- und Buildwerte.

**Stufe 2, Werkzeugschnitt entwerfen.**

6. [`entwicklung/tool-design.md`](entwicklung/tool-design.md) — vollständig. Abschnitt 11 ist die Abnahmeliste.

An dieser Stelle sind die Punkte 3, 4, 5, 8, 9 und 10 aus Teil 4 zu lesen. Die Punkte 3, 4 und 5
sind entschieden, tragen aber in der jeweils anderen Datei noch die alte Formulierung; die
Punkte 9 und 10 sind sachlich geklärt, ihre Abnahmekriterien in
[`entwicklung/tool-design.md`](entwicklung/tool-design.md) Abschnitte 11.5 und 11.6 aber noch
nicht angepasst. Offen zu entscheiden bleibt hier nur Punkt 8.

**Stufe 3, Endpunkte implementieren.** Reihenfolge nach fachlicher Abhängigkeit, jeweils erst
lesen, dann schreiben:

7. [`api/stammdaten.md`](api/stammdaten.md) — Stammdaten werden von fast jedem anderen Aufruf referenziert.
8. [`api/belege.md`](api/belege.md) und [`api/transaktionen.md`](api/transaktionen.md) — die beiden Kernobjekte und ihre Zuordnung.
9. [`api/buchungen.md`](api/buchungen.md) — setzt Belege, Transaktionen und Sachkonten voraus.
10. [`api/rechnungen.md`](api/rechnungen.md) und [`api/berichte.md`](api/berichte.md) — die beiden Randbereiche.
11. [`api/fehlercodes.md`](api/fehlercodes.md) — durchgehend als Nachschlagewerk, nicht am Stück zu lesen. Der
    Schlüssel ist immer das Paar aus Pfad und `error_code`.

**Stufe 4, ausliefern.**

12. [`entwicklung/distribution.md`](entwicklung/distribution.md) — vollständig, spätestens beim Schreiben der Projekt-README.
    Abschnitt 15 ist vor der ersten Veröffentlichung zwingend, siehe offene Entscheidung 6.

---

## Teil 3: Vorrangregel bei widersprüchlichen Angaben

### 3.1 Vorrangregeln, die die Dossiers selbst festlegen

Diese Regeln sind keine Erfindung dieses Index. Die genannten Abschnitte erklären sich
ausdrücklich selbst für maßgeblich und verpflichten die jeweils andere Datei zur Angleichung.
Sie gehen jeder Zeile der Tabelle in 3.2 vor.

| Frage | Maßgeblich | Was dort steht | Gegenstelle |
| --- | --- | --- | --- |
| ~~Bestätigung vor Schreiboperationen~~ **erledigt** | [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 9.4 | Das serverseitig erzwungene `confirm`-Muster entfällt ersatzlos; die Bestätigung liegt allein beim Host (nachgezogen 2026-09-13, Umsetzungsplan 15, Sachgrund E2; Einzelheiten im Kasten in 4.1). | — |
| ~~Default von `BB_MCP_MODE`~~ **erledigt** | [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 9.5 | Die Variable `BB_MCP_MODE` entfällt ersatzlos; kanonisch ist `BB_MCP_READ_ONLY` mit der Vorgabe `false` (nachgezogen 2026-09-13, Umsetzungsplan 15, Sachgrund E2 und 6.6; Einzelheiten im Kasten in 4.1). | — |
| Tool-Namensschema | [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitte 4.2, 4.3 und 11.2 | `bb_<ressource>_<verb>[_<qualifizierer>]`, snake_case, keine Punkte, `^[a-z][a-z0-9_]{2,39}$`. | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 10.4 Punkt 3, übernimmt dieses Schema ausdrücklich und begründet die Verengung gegenüber der weiteren SDK-Regel. |
| Welche Pflichten aus dem Protokoll mit den verfügbaren SDKs überhaupt erfüllbar sind | [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.1a | Setzt die Vorrangregel gegenüber der Zielzustandstabelle in 11.1 und markiert je Zeile, ob sie unter der tatsächlich ausgehandelten Revision anwendbar ist. | Abschnitt 11.1 verweist in seiner Einleitung selbst darauf: "Vor der Umsetzung ist 11.1a zu lesen." |
| SDK-Linie, `engines.node`, `typescript`, Build und `bin`-Ziel | [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitte 3.2 und 3.3 | Zwei vollständige, nicht mischbare Varianten für die SDK-Linie; Tabelle "verbindlich" für die vier weiteren Kollisionen. | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitte 10.2 und 10.3, sind auf die verbindlichen Werte angeglichen (geprüft 2026-09-12); die Begründungen stehen in `toolchain.md` 3.3. |

### 3.2 Vorrang nach Themenfeld

Die folgende Festlegung ist eine Konvention dieses Repositories, keine Aussage einer externen
Quelle. Sie greift, wo 3.1 nichts regelt. Wer einen Widerspruch findet, den weder 3.1 noch diese
Tabelle auflöst, behandelt ihn als offene Entscheidung und trägt ihn in Teil 4 nach, statt ihn
stillschweigend zu entscheiden.

| Themenfeld | Führende Datei | Nachrangig | Begründung |
| --- | --- | --- | --- |
| **API-Verhalten, querschnittlich** (Auth, Umschlag, Rate Limit, Paginierung, Datums- und Betragsformate, Nebenwirkungen) | [`api/grundlagen.md`](api/grundlagen.md) | alle übrigen Dateien, auch die Entwicklungsdossiers | Die Datei ist gegen die laufende API verifiziert; die Entwicklungsdossiers beschreiben die API nur aus zweiter Hand und markieren mehrere dieser Punkte selbst als nicht verifiziert. |
| **API-Verhalten, endpunktspezifisch** (Parameter, Antwortfelder, Fallstricke eines Pfads) | das zuständige Endpunkt-Dossier (`belege`, `transaktionen`, `buchungen`, `rechnungen`, `berichte`, `stammdaten`) | [`api/grundlagen.md`](api/grundlagen.md) | Grundlagen beschreibt die Regel, das Endpunkt-Dossier die Ausnahme. Eine Ausnahme schlägt die Regel, sofern sie dort ausdrücklich belegt ist. |
| **Fehlercodes und HTTP-Status** | [`api/fehlercodes.md`](api/fehlercodes.md) | alle übrigen Dateien | Mechanische, vollständige Extraktion aller 718 Definitionen ohne Interpretation. Andere Dossiers zitieren nur Ausschnitte. |
| **Widerspruch zwischen Spezifikationsdatei und Live-Beobachtung** | die als **LIVE** gekennzeichnete Beobachtung im jeweiligen Dossier | die Spezifikationsdatei | Belegt in [`api/grundlagen.md`](api/grundlagen.md), Abschnitt 8, Punkt 5: die Spezifikation weicht an mehreren Stellen nachweislich vom tatsächlichen Verhalten ab. Die Spezifikation bleibt maßgeblich, wo nichts live geprüft wurde. |
| **Protokoll** (MCP-Semantik, Versionsaushandlung, Tool- und Result-Struktur, Annotationen, Sicherheitspflichten) | [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.1a vor Abschnitt 11.1 | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), [`entwicklung/tool-design.md`](entwicklung/tool-design.md) | Die Spezifikation ist normativ, das SDK ist eine Implementierung davon und der Werkzeugentwurf eine Anwendung. Die Einschränkung aus 11.1a gilt aber immer: Eine Pflicht, die das eingesetzte SDK unter der tatsächlich ausgehandelten Revision nicht erfüllen kann, ist Zielzustand, nicht Umsetzungspflicht. |
| **SDK** (Signaturen, Importpfade, Rückgabewerte, Packaging-Fallstricke, Laufzeitverhalten der Pakete) | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md) | [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | Die Angaben stammen aus Laufzeittests gegen frische Installationen beider SDK-Linien. Ausnahme: Für Paketauswahl und Versionsangaben gilt die Zeile darunter. |
| **Werkzeuge der Entwicklung** (Node-Untergrenze, TypeScript-Version, Build, Test, Lint, HTTP-Client, CI, npm-Veröffentlichung, Lizenz, Inhalt der `package.json`) | [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitte 10.2 und 10.3 | Ausdrücklich so festgelegt in `toolchain.md`, Abschnitt 3.3: Dort steht je Kollision, welcher Wert verbindlich ist, und dass die Gegenstelle anzugleichen ist. |
| **Werkzeugentwurf** (Toolschnitt, Namensschema, Beschreibungen, Eingabeschemata, Antwortformat, Bestätigungsmuster, Betriebsmodi) | [`entwicklung/tool-design.md`](entwicklung/tool-design.md) | [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11; [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 10.4 | `tool-design.md` ist für dieses Feld das Fachdossier und erklärt sich in 9.4 und 9.5 ausdrücklich für maßgeblich. Harte Grenze: Wo die Protokoll- oder SDK-Ebene eine Form technisch erzwingt, gilt diese Grenze. |
| **Verteilung** (Clientkonfiguration, Startvarianten, Übergabe der Zugangsdaten, Paketname im Auslieferungskontext) | [`entwicklung/distribution.md`](entwicklung/distribution.md) | [`entwicklung/toolchain.md`](entwicklung/toolchain.md) | `distribution.md` ist für dieses Feld das Fachdossier. Ausnahme: Für Felder und Inhalt der `package.json` selbst gilt `toolchain.md`, Abschnitte 9.2, 13 und 13.2. |
| **Fachwissen** (buchhaltungsrechtliche Begriffe, Kontenrahmen, Pflichten, Rückfragegebote) | [`fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md) | alle übrigen Dateien | Die API-Dossiers erklären Fachbegriffe nur so weit, wie es für ihren Endpunkt nötig ist. Für die Begriffsdefinition selbst ist `buchhaltung.md` zuständig. Ausnahme: Für die konkrete Bedeutung eines API-Feldes gilt das Endpunkt-Dossier. |

### 3.3 Zwei Regeln über allen Tabellenzeilen

1. **Eine ausdrücklich als "nicht verifiziert" oder "Annahme" gekennzeichnete Aussage verliert
   immer gegen eine belegte Aussage**, auch wenn sie in der nach Themenfeld führenden Datei steht.
   Beispiel: [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 12, führt das Betragsformat, die Bedeutung
   von `rows` und das Authentifizierungsverfahren als nicht verifiziert. Alle drei sind in
   [`api/grundlagen.md`](api/grundlagen.md) belegt und dort nachzulesen, nicht erneut zu entscheiden.
2. **Sicherheit schlägt Bequemlichkeit.** Widersprechen sich zwei Dossiers in einer Frage, bei
   der eine Variante schreibende Wirkung auf die echte Buchhaltung zulässt und die andere sie
   verhindert, gilt bis zur ausdrücklichen Entscheidung des Projektinhabers die restriktivere
   Variante.

---

## Teil 4: Offene Entscheidungen

Jede Zeile ist vor oder während der Implementierung zu entscheiden. Die Spalte "Fundstellen"
nennt Datei und Abschnittsnummer.

**Warnhinweis zur Aktualität.** Die Entwicklungsdossiers werden aktiv überarbeitet und gleichen
sich gegenseitig an. Abschnittsnummern und Inhalte dieses Teils wurden am 2026-09-12 gegen den
damaligen Dateistand geprüft. Mehrere ursprüngliche Widersprüche sind seither in den Dossiers
aufgelöst worden; die unten als "einseitig aufgelöst" markierten Punkte sind Fälle, in denen
eine Datei die Entscheidung getroffen und die Angleichung der Gegenstelle angeordnet hat, diese
Angleichung im Text der Gegenstelle aber noch nicht vollzogen ist. Wer später liest, prüft die
Gegenstelle, bevor er einen dieser Punkte erneut aufwirft.

### 4.1 Übersicht

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund: Entscheidung E2 des Projektinhabers sowie Umsetzungsplan 6.2, 6.6 und 12,
> Streitfragen S8 und S12.** **`BB_MCP_MODE` und das serverseitig erzwungene `confirm`-Muster
> sind entfallen.** An ihre Stelle tritt **`BB_MCP_READ_ONLY` mit der Vorgabe `false`**:
>
> - Es gibt **keine drei Betriebsmodi** und keinen Nur-Lesen-Standard. Nach der Installation
>   sind alle 54 Werkzeuge sofort aufrufbar.
> - Es gibt **keinen `confirm`-Parameter, keinen Trockenlauf und keine serverseitig erzwungene
>   Bestätigung**. Die Freigabe liegt beim Client; der Schutz besteht aus ehrlichen
>   Annotationen, eindeutigen Beschreibungen, dem optionalen Nur-Lesen-Schalter und den
>   Betrags- und Mengengrenzen.
> - `BB_MCP_READ_ONLY=true` beschränkt den Server auf die 15 lesenden Endpunkte; die übrigen 39
>   lehnen ab, bevor eine Anfrage hinausgeht, bleiben aber in `tools/list` sichtbar. Der
>   Schalter wird nur beim Start gelesen.
>
> Die beiden Zeilen bleiben als Nachweis des Wegs stehen; als offene Entscheidungen sind sie
> erledigt.

| Nr. | Entscheidung | Stand | Zu entscheiden vor |
| --- | --- | --- | --- |
| 1 | SDK-Linie: Variante A (v2) oder Variante B (v1) | echt offen | erster Zeile Code |
| 2 | Zielprotokollversion und Dual-Era-Unterstützung | sachlich geklärt, Restfrage offen | erster Zeile Code |
| 3 | Tool-Namensschema | entschieden | keine Sperre mehr |
| 4 | ~~Default von `BB_MCP_MODE`~~ | **erledigt, Variable entfällt** (siehe Kasten) | — |
| 5 | ~~Bestätigungsmuster vor Schreiboperationen~~ | **erledigt, `confirm`-Muster entfällt** (siehe Kasten) | — |
| 6 | Paketname auf npm | echt offen, Name bereits vergeben | erster Veröffentlichung und jeder `npx`-Zeile in der README |
| 7 | Vier Versions- und Buildwerte in `mcp-sdk-typescript.md` 10.2/10.3 | entschieden und in beiden Dateien vollzogen | `package.json` |
| 8 | Granularität und Anzahl der Werkzeuge | in einer Datei entschieden, in der anderen offen geführt | Werkzeugentwurf |
| 9 | Gesamttrefferzahl in Listenantworten | sachlich geklärt, Abnahmekriterium noch falsch | Antwortformat |
| 10 | Betragstyp und `limit`-Obergrenze im Eingabeschema | sachlich geklärt, Abnahmekriterium noch pauschal | Eingabeschemata |

### 4.2 Die Entscheidungen im Einzelnen

**1. SDK-Linie: Variante A (`@modelcontextprotocol/server@2.0.0`) oder Variante B (`@modelcontextprotocol/sdk@1.30.0`)**

Echt offen. Die beiden Dossiers widersprechen sich nicht mehr, sie beschreiben beide Wege
vollständig und warten auf die Freigabe.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 1 | Zwei gepflegte Linien seit 2026-07-27. v2 ist laut README des `main`-Branch die stabile Linie, v1 erhält Bugfixes und Security-Updates für mindestens sechs Monate nach dem v2-Release. |
| [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 10.1 | Empfiehlt v2 mit fünf Argumenten, nennt vier Gegenargumente und schließt: "Diese Entscheidung gehört in die Planungsphase." |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitt 3.2 | Erklärt v2 zum dokumentierten Standardweg (Variante A) und v1 zum vollständig ausformulierten Rückfallweg (Variante B), jeweils als geschlossene Tabelle aus MCP-Paketen, Importpfaden, `zod`, `engines.node`, `typescript`, Build und `bin`. **Mischen ist ausdrücklich verboten**, mit Aufzählung der unzulässigen Mischzustände. Eine Abgleichpflicht mit `mcp-sdk-typescript.md` besteht laut `toolchain.md` 3.2 ausdrücklich nicht; die Spiegelung der Variantentabellen dorthin steht noch aus. |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitte 12 und 13 | Abhängigkeitstabelle und `package.json`-Vorschlag rendern Variante A; 13.1 nennt den Unterschied zu Variante B. |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitt 15 Punkt 1 | Führt die SDK-Linie als ersten Punkt des Entscheidungsbedarfs und nennt die beim Umschalten gemeinsam anzupassenden Abschnitte. |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.4 Punkt 2 | Präzisiert durch 11.1a: Das Argument "Zielversion" trägt nicht, weil beide Linien am 2026-09-12 `2025-11-25` aushandeln. Verbleibende Unterschiede sind JSON-Schema-Dialekt (v1 Draft 07, v2 2020-12), Node-Untergrenze, API-Form und Wartungszusage. |

Zu entscheiden ist genau eine der beiden Varianten als Ganzes.

**2. Zielprotokollversion und Dual-Era-Unterstützung**

Sachlich geklärt, mit einer benannten Restfrage.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 1.1 | `LATEST_PROTOCOL_VERSION = "2026-07-28"` laut dem als Source of Truth bezeichneten Schema. |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.1a | Beide TypeScript-SDK-Linien melden am 2026-09-12 `LATEST_PROTOCOL_VERSION = 2025-11-25`. Ein Server auf einer dieser Linien spricht also die legacy-Ära mit `initialize`-Handshake. Der Abschnitt markiert je Zeile der Tabelle 11.1, ob sie anwendbar ist: gegenstandslos sind unter `2025-11-25` unter anderem `server/discover`, die Pflicht-`_meta`-Prüfung, die `-32022`-Antwort, `resultType`, `serverInfo` je Result sowie `ttlMs` und `cacheScope`. |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.4 Punkt 1 | Trägt den Zusatz "Für v1 beantwortet durch 11.1a": Der Server spricht die Revision, die das SDK aushandelt, am 2026-09-12 also ausschließlich `2025-11-25`. Die Frage wird erst wieder offen, wenn eine SDK-Linie nachweislich `2026-07-28` aushandelt. |
| [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 1, Unterabschnitt "Widerspruch, der nicht aufgelöst werden konnte" | Die README des v2-`main`-Branch schreibt v2 die Implementierung von `2026-07-28` zu, die ausgelieferte 2.0.0 meldet zur Laufzeit `2025-11-25`. Wie `2026-07-28` ausgehandelt wird, ließ sich nicht klären. Ausdrücklich als nicht verifiziert gekennzeichnet. |

**Restfrage:** wann eine SDK-Linie `2026-07-28` tatsächlich aushandelt. `mcp-spezifikation.md`,
Abschnitt 11.1a (d), nennt die konkreten Änderungen am CI-Integrationstest, die dann fällig
werden. Zusätzlich vermerkt derselbe Abschnitt, dass der Vorrangsatz wortgleich in
`mcp-sdk-typescript.md`, Abschnitt 10.1, gehört und dort **nicht verifiziert** ist, ob er schon
eingetragen wurde. Beim Lesen dieses Index war er dort eingetragen
([`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 10.1); der
Hinweis in `mcp-spezifikation.md` 11.1a (d) ist insoweit überholt.

**3. Tool-Namensschema**

Entschieden. Der ursprüngliche Widerspruch besteht nicht mehr.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitte 4.2, 4.3 und 11.2 | Verbindlich: Präfix `bb_`, Muster `bb_<ressource>_<verb>[_<qualifizierer>]`, snake_case, Ressource vor Verb im Plural, Verb aus der geschlossenen Liste in 4.4, jeder Name erfüllt `^[a-z][a-z0-9_]{2,39}$`. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 4.1 | Harte Grenze: Anthropic-Tool-Namen müssen `^[a-zA-Z0-9_-]{1,128}$` erfüllen, also keine Punkte enthalten. |
| [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitt 10.4 Punkt 3 | Übernimmt das Schema aus `tool-design.md` ausdrücklich, verbietet Punkte und stellt fest, dass ein Name wie `bhb.postings.list` nach der Clientregel unzulässig wäre. Wo sich die Regeln unterscheiden, gilt die engere. Die weitere Fassung in `mcp-spezifikation.md` 11.1 (`[A-Za-z0-9_.-]`) begründet ausdrücklich keine Ausnahme. |

Offen ist an dieser Stelle nur noch eine Kleinigkeit, siehe 4.3: Die Beispiele für Resource- und
Prompt-Namen in `mcp-sdk-typescript.md`, Abschnitte 6.1 und 6.2, verwenden weiterhin das Präfix
`bhb-` beziehungsweise das URI-Schema `bhb://`.

**4. Default von `BB_MCP_MODE`**

Entschieden, aber einseitig aufgelöst.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 9.5 | Drei Modi `read_only`, `read_write` und `full`, nur beim Start gelesen. `read_only` ist der Default. Der Absatz erklärt sich wörtlich zur "maßgeblichen Festlegung des Defaults von `BB_MCP_MODE` im gesamten Projekt" und ordnet die Angleichung von `mcp-spezifikation.md` 11.3 und 11.4 Punkt 4 an. Der Abschnitt beschreibt außerdem die in Kauf genommene Folge: Weil `bb_reports_create` zur Klasse AR gehört und im Nur-Lesen-Modus nicht registriert wird, sind BWA und Summen- und Saldenliste im Auslieferungszustand nicht verfügbar, das Kontenblatt dagegen schon. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 11.8 | Abnahmekriterium mit Rückverweis auf 9.5: Im Nur-Lesen-Modus werden Tools der Klassen A, AR, M, D, B gar nicht erst registriert. |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.4 Punkt 4 | Steht unverändert als "Read-only als Default? Vorschlag: nein, aber prominent dokumentiert." Die in `tool-design.md` 9.5 angeordnete Angleichung ist dort noch nicht vollzogen. |

~~Verbindlich ist `read_only`.~~ **Überholt (nachgezogen 2026-09-13, Umsetzungsplan 15,
Sachgrund E2 und 6.6):** `BB_MCP_MODE` gibt es nicht mehr. Verbindlich ist `BB_MCP_READ_ONLY`
mit der Vorgabe `false`; gesperrte Werkzeuge werden **registriert** und lehnen beim Aufruf ab,
statt aus `tools/list` zu verschwinden. Auch die oben zitierte Folge ist damit hinfällig: BWA
und Summen- und Saldenliste sind im Auslieferungszustand **verfügbar** und nur bei
ausdrücklich gesetztem Schalter gesperrt.

**5. Bestätigungsmuster vor Schreiboperationen**

Entschieden, aber einseitig aufgelöst.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 9.4 | Erklärt sich wörtlich zur "maßgeblichen Festlegung zur Bestätigung vor Schreiboperationen im gesamten Projekt". Das serverseitig erzwungene `confirm`-Muster wird gebaut, die Host-Bestätigung ist eine zusätzliche, keine ersetzende Schicht. Jedes Werkzeug der Klassen D und B trägt `confirm` mit `default: false`; ohne `confirm: true` läuft ein Trockenlauf, der die betroffenen Datensätze auflöst und als Tabelle zeigt. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitte 11.8 und 11.9 | Abnahmehaken und Test dazu, einschließlich der Vorgabe, dass die Schutzwirkung serverseitig erzwungen wird und ein Client, der Annotationen ignoriert, nicht an `confirm` vorbeikommt. |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.3 | Steht unverändert als "Wir verlassen uns darauf", also auf die Host-Bestätigung. Die in `tool-design.md` 9.4 angeordnete Angleichung ist dort noch nicht vollzogen. |

~~Verbindlich ist das serverseitige `confirm`-Muster.~~ **Überholt (nachgezogen 2026-09-13,
Umsetzungsplan 15, Sachgrund E2):** Es gibt **kein** `confirm`, keinen Trockenlauf und keine
serverseitig erzwungene Bestätigung, und damit auch nicht die zusätzlichen lesenden Aufrufe, die
auf das Limit von 100 Anfragen pro Mandant und Minute gedrückt hätten. Die Bestätigung liegt
ausschließlich beim Host.

**6. Paketname auf npm**

Echt offen, mit unmittelbarer Sicherheitsfolge für Endnutzer.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitt 9.1 | `buchhaltungsbutler-mcp` ist auf npm bereits vergeben und gehört nicht diesem Projekt. "Der unscoped Name `buchhaltungsbutler-mcp` kann für dieses Projekt nicht verwendet werden." Empfehlung: gescoptes Paket, etwa `@init4/buchhaltungsbutler-mcp`; der Scope ist vor dem ersten `npm publish` aktiv zu prüfen, die Stichprobe ist ausdrücklich kein verlässlicher Nachweis. |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitt 15 Punkt 2 | Führt den Paketnamen im Entscheidungsbedarf. |
| [`entwicklung/distribution.md`](entwicklung/distribution.md), Abschnitt 15 | Bestätigt den Befund mit Registry-Details und benennt die Sicherheitsfolge: Jede `npx -y buchhaltungsbutler-mcp`-Zeile in der Dokumentation würde heute fremden Code starten, dem Nutzer ihre BuchhaltungsButler-Zugangsdaten übergeben. Nennt als geprüft frei (HTTP 404 auf der Registry) ausschließlich die drei unscoped Kandidaten `mcp-buchhaltungsbutler`, `buchhaltungsbutler-mcp-server` und `buchhaltungsbutler`. `@init4/buchhaltungsbutler-mcp` steht dort getrennt mit dem Status "Paketname nicht vergeben (HTTP 404), Verfügbarkeit des Scopes `@init4` nicht verifiziert", weil ein 404 auf den Paketnamen bei gescopten Paketen nicht belegt, dass der Scope frei oder dem eigenen npm-Konto zugeordnet ist; der Abschnitt übernimmt den Pflichtschritt aus `toolchain.md` 9.1, den Scope vor dem ersten `npm publish` aktiv auf npmjs.com zu prüfen beziehungsweise anzulegen. Empfiehlt zusätzlich einen eindeutigen Binärnamen, etwa `bb-mcp` oder `init4-bb-mcp`, weil auch der `bin`-Name kollidiert. |
| [`entwicklung/distribution.md`](entwicklung/distribution.md), Abschnitt 16 | Hält fest, dass das Dossier bis zur Entscheidung weiterhin den vorläufigen Namen verwendet und dieser vor Veröffentlichung projektweit zu ersetzen ist. |

Zu beachten: [`entwicklung/toolchain.md`](entwicklung/toolchain.md) führt den `bin`-Schlüssel in
den Abschnitten 3.2 (beide Varianten), 9.2 und 13 weiterhin als `buchhaltungsbutler-mcp`. Die in
[`entwicklung/distribution.md`](entwicklung/distribution.md), Abschnitt 15, empfohlene
Umbenennung des Binärnamens ist dort noch nicht nachgezogen und gehört in dieselbe Entscheidung.

**7. Vier Versions- und Buildwerte in `mcp-sdk-typescript.md` 10.2/10.3**

Entschieden und in beiden Dateien vollzogen.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitt 3.3 | Tabelle mit vier Kollisionen und der Spalte "verbindlich", die für beide Dateien gilt: `engines.node` = `>=22.12.0` (nicht `>=20`), `typescript` = `6.0.3` exakt (nicht `^5.9`), Build = `tsdown` plus Sicherstellung von Shebang und Modus 755 (nicht `tsc && chmod`), `bin`-Ziel = `./dist/cli.js` (nicht `dist/index.js`). Jede Festlegung ist einzeln begründet, unter anderem damit, dass `>=20` die SDK-Untergrenze ist und kein konkurrierender Projektwert, und dass `vitest@5.0.0` auf Node 20 nicht läuft. |
| [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitt 15 Punkt 3 | Führt die Abwägung zwischen Reichweite und Sicherheitsstandard bei `>=22.12.0` weiterhin als bewusst zu treffende Entscheidung. |
| [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitte 10.2 und 10.3 | Tragen die verbindlichen Werte `>=22.12.0`, `6.0.3` exakt, `tsdown` und `./dist/cli.js` und verweisen im Vorrangkasten am Abschnittsanfang auf `toolchain.md` 3.3. Die früheren Angaben `>=20`, `^5.9`, `tsc && chmod 755 dist/index.js` und `dist/index.js` sind dort nur noch als historische Spalte vermerkt. |

Verbindlich sind die vier Werte aus `toolchain.md` 3.3. Offen bleibt allein die in 15 Punkt 3
genannte Grundsatzfrage, ob Node 20 bewusst ausgeschlossen wird.

**8. Granularität und Anzahl der Werkzeuge**

In einer Datei entschieden, in der anderen weiterhin offen geführt.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 3.4 | Empfiehlt die mittlere Linie: konsolidiert wird nur bei deckungsgleichen Parametermengen und nie über die Lese-Schreib-Grenze hinweg. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 3.5 | Enthält die vorgeschlagene Abbildung von 54 Endpunkten auf 34 Tools. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitte 11.1 und 11.9 | Abnahmekriterium: zwischen 28 und 34 Werkzeuge decken alle 54 Endpunkte ab. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 12 | Führt die Tokenkosten der 34 Werkzeugdefinitionen als nicht gemessen und die Token-Grenzen 5.000 und 20.000 pro Antwort als Annahme. |
| [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitt 11.4 Punkt 5 | Führt die Granularität unverändert als offene Entscheidung. |

Nach der Vorrangregel in 3.2 gilt für dieses Feld `tool-design.md`. Zu bestätigen ist nur noch,
dass die Tokenkosten der 34 Definitionen die Grenze aus 11.9 einhalten.

**9. Gesamttrefferzahl in Listenantworten**

Sachlich geklärt, das Abnahmekriterium ist aber noch nicht angepasst.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 11.6 | Abnahmekriterium: "Jede Listenantwort nennt die Gesamttrefferzahl und die Zahl der gelieferten Zeilen." |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 7.5 | Fordert, die Gesamtzahl der Treffer immer auszuweisen, markiert aber ausdrücklich als nicht verifiziert, ob die API sie überhaupt liefert, und nennt die Folge eines stillen Datenfehlers. |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 12 | Führt dieselbe Frage als nicht verifiziert. |
| [`api/grundlagen.md`](api/grundlagen.md), Abschnitte 4.1 und 6.1 bis 6.3 | Live belegt: `rows` ist die Länge von `data`, nicht die Gesamtzahl. Es gibt kein Feld für die Gesamtzahl, keinen Cursor, keine Link-Header und kein Kennzeichen für weitere Seiten. Ein Offset jenseits der Datenmenge liefert HTTP 200 mit `rows: 0`. |

Nach Regel 1 in 3.3 gilt [`api/grundlagen.md`](api/grundlagen.md). Das Abnahmekriterium in 11.6 ist in dieser Form
nicht erfüllbar und umzuformulieren, etwa auf "gelieferte Zeilen plus Hinweis, ob eine weitere
Seite abzurufen ist". Zu entscheiden bleibt, ob der Server die Gesamtzahl durch eigenes
Durchblättern ermittelt; das kostet Aufrufe aus dem gemeinsamen Rate-Limit-Kontingent.

**10. Betragstyp und `limit`-Obergrenze im Eingabeschema**

Sachlich geklärt, die Abnahmekriterien sind aber noch pauschal.

| Fundstelle | Aussage |
| --- | --- |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 11.5 | Abnahmekriterien: "Beträge sind `string`, nicht `number`" sowie "`limit` hat `minimum: 1`, `maximum: 500`, `default: 100`". |
| [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 12 | Führt das Betragsformat als nicht verifiziert. |
| [`api/grundlagen.md`](api/grundlagen.md), Abschnitt 5.5 | Belegt die Asymmetrie: Die API erwartet beim Schreiben JSON-Zahlen (`"type": "number", "format": "float"`) und liefert beim Lesen Strings mit zwei Nachkommastellen. |
| [`api/grundlagen.md`](api/grundlagen.md), Abschnitt 5.2 | Belegt, dass die `limit`-Obergrenze endpunktabhängig ist: 500 bei `/receipts/get` und `/transactions/get`, 1000 bei `/postings/get` und `/cost-locations/get`, bei `/settings/get/*` nicht dokumentiert, dort aber Defaults von 25 beziehungsweise 1000. Ein `limit` oberhalb des Maximums wird nicht gekappt, sondern mit HTTP 400 abgelehnt. |

Nach Regel 1 in 3.3 gilt [`api/grundlagen.md`](api/grundlagen.md). Zu entscheiden bleibt, ob das Tool-Schema Beträge
dennoch als `string` annimmt und der Server vor dem Versand konvertiert. Dafür spricht, dass
Sprachmodelle Gleitkommazahlen unzuverlässig erzeugen; dagegen spricht die zusätzliche
Konvertierungsschicht. Die pauschale Obergrenze 500 ist in jedem Fall durch eine
endpunktabhängige zu ersetzen.

### 4.3 Weitere offene Punkte, thematisch gebündelt

Diese Punkte sind in den Dossiers ausdrücklich als offen, als Annahme oder als nicht verifiziert
gekennzeichnet. Sie blockieren den Implementierungsbeginn nicht, müssen aber vor der Abnahme
beziehungsweise vor der Veröffentlichung geklärt sein.

| Bereich | Punkte | Fundstelle |
| --- | --- | --- |
| API, Verhalten unter Last | Welchen HTTP-Status und `error_code` der Server beim Reißen des Limits von 100 Anfragen pro Minute liefert; die Auslösebedingung von Fehlercode 15; Zeitzone der Datumsfelder; Maxima von `/settings/get/*`; ob `/receipts/upload` tatsächlich auf EUR beschränkt ist; ob der Server Boolesche Werte auch als Strings akzeptiert | [`api/grundlagen.md`](api/grundlagen.md), Abschnitte 3.3, 5.2, 5.4, 5.6, 5.7 |
| API, Schreibverhalten | Ob die API Schreibvorgänge dedupliziert; maximale Dateigröße und Kodierung bei `/receipts/upload`; ob die Feldmengen der drei Rechnungs-Endpunkte ein gemeinsames Werkzeug tragen; ob `account` in verschiedenen Endpunkten Unterschiedliches bedeutet | [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 12; [`api/rechnungen.md`](api/rechnungen.md), Abschnitt 11 |
| API, Berichte | Laufzeit der Berichtserzeugung und damit das Polling-Intervall (Annahme); ob ein ersetzter Bericht eine neue `id_by_customer` erhält; wie lange erzeugte Berichtsdateien verfügbar bleiben | [`entwicklung/tool-design.md`](entwicklung/tool-design.md), Abschnitt 12; [`api/berichte.md`](api/berichte.md), Abschnitte 2.4 und 14 |
| Namensraum jenseits der Werkzeuge | Die Beispiele für Resource- und Prompt-Namen verwenden `bhb-` beziehungsweise `bhb://`, während Werkzeuge nach Entscheidung 3 mit `bb_` präfigiert werden. Praktisch derzeit folgenlos, weil Resources und Prompts für v1 ausgeschlossen sind, aber vor einer späteren Einführung zu vereinheitlichen. | [`entwicklung/mcp-sdk-typescript.md`](entwicklung/mcp-sdk-typescript.md), Abschnitte 6.1 und 6.2; [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitte 11.2 und 11.3 |
| Werkzeuge der Entwicklung | Abweichung zwischen registry-aktuellem und lokal installiertem pnpm; Aufschub von TypeScript 7 bis zu einer stabilen 7.1 mit programmatischer API; Trademark-Formulierung in der README, da der Rechtsträger hinter "BuchhaltungsButler" nicht verifiziert ist; ob `tsdown` den Dateimodus der `bin`-Datei selbst auf 755 setzt | [`entwicklung/toolchain.md`](entwicklung/toolchain.md), Abschnitte 4.2 und 15, Punkte 4 bis 6 |
| Verteilung | Kaltstartdauer von `npx -y`; Windows-Pfade der Clientkonfigurationen als Annahme; Claude Desktop unter Linux nicht verifiziert; Vorgabewert von `MCP_TIMEOUT` in Claude Code nicht beziffert; `.mcpb`-Manifestentwurf nicht gegen `MANIFEST.md` geprüft | [`entwicklung/distribution.md`](entwicklung/distribution.md), Abschnitt 16 |
| Protokoll | Umfang von v1 (nur Tools oder zusätzlich Prompts und Resources); Umgang mit mehreren Mandanten, also `api_key` per Umgebungsvariable oder als Werkzeugargument; Reichweite der Client-Unterstützung für Extensions | [`entwicklung/mcp-spezifikation.md`](entwicklung/mcp-spezifikation.md), Abschnitte 11.2 bis 11.4 |
| Fachliches | Die im Fachdossier gesammelten, nicht abschließend verifizierten Punkte | [`fachwissen/buchhaltung.md`](fachwissen/buchhaltung.md), Abschnitt "Offene Punkte / nicht abschließend verifiziert" |
