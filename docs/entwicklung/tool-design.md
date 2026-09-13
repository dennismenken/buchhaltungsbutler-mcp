# Werkzeugentwurf für MCP-Server, Best Practices

Nachschlagewerk für die Implementierung des inoffiziellen BuchhaltungsButler-MCP-Servers.
Adressat ist ein Implementierungs-Agent, der ohne Rückfragen arbeiten soll.

**Stand:** 2026-09-12. Alle externen Quellen wurden am 2026-09-12 abgerufen.

---

## Inhalt

1. [Quellenlage](#1-quellenlage)
2. [Ausgangslage: unsere API](#2-ausgangslage-unsere-api)
3. [Der zentrale Konflikt: Endpunkt-Tool gegen Absichts-Tool](#3-der-zentrale-konflikt-endpunkt-tool-gegen-absichts-tool)
4. [Namensgebung](#4-namensgebung)
5. [Beschreibungen](#5-beschreibungen)
6. [Eingabeschemata](#6-eingabeschemata)
7. [Antworten](#7-antworten)
8. [Fehlermeldungen als Lehrmittel](#8-fehlermeldungen-als-lehrmittel)
9. [Gefährliche Operationen](#9-gefährliche-operationen)
10. [Evaluierung](#10-evaluierung)
11. [Verbindliche Vorgaben für unseren Server](#11-verbindliche-vorgaben-für-unseren-server)
12. [Offene Punkte und Annahmen](#12-offene-punkte-und-annahmen)

---

## 1. Quellenlage

| Kürzel | Quelle | Abrufdatum |
| --- | --- | --- |
| `ANTHROPIC-WTA` | https://www.anthropic.com/engineering/writing-tools-for-agents | 2026-09-12 |
| `ANTHROPIC-DEFINE` | https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools (Weiterleitung von docs.claude.com) | 2026-09-12 |
| `ANTHROPIC-SEARCH` | https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool | 2026-09-12 |
| `MCP-SPEC-TOOLS` | https://modelcontextprotocol.io/specification/2025-11-25/server/tools | 2026-09-12 |
| `MCP-SCHEMA` | https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-11-25/schema.ts | 2026-09-12 |
| `MCP-CONCEPTS` | https://modelcontextprotocol.io/docs/learn/server-concepts | 2026-09-12 |
| `SRV-FS` | https://github.com/modelcontextprotocol/servers, `src/filesystem/index.ts` und `src/filesystem/README.md` | 2026-09-12 |
| `SRV-GIT` | https://github.com/modelcontextprotocol/servers, `src/git/src/mcp_server_git/server.py` und `src/git/README.md` | 2026-09-12 |
| `SRV-FETCH` | https://github.com/modelcontextprotocol/servers, `src/fetch/src/mcp_server_fetch/server.py` | 2026-09-12 |
| `AWS-TOOLDESIGN` | https://aws.amazon.com/blogs/machine-learning/mcp-tool-design-practical-approaches-and-tradeoffs/ | 2026-09-12 |
| `SPEC-BB` | `docs/openapi/buchhaltungsbutler-v1.json` (BuchhaltungsButler API, `info.version` 1.9.1) | 2026-09-12 |

Zielrevision ist 2025-11-25 nach `docs/entwicklung/mcp-spezifikation.md`, Abschnitt 11.1a (c). Die aktuelle Revision 2026-07-28 ist Zielzustand, nicht Umsetzungspflicht. Deshalb sind `MCP-SPEC-TOOLS` und `MCP-SCHEMA` auf 2025-11-25 gepinnt. Wo 2026-07-28 etwas anders oder zusätzlich regelt, steht das an der betreffenden Stelle ausdrücklich dabei; die dort neuen Felder sind in [Abschnitt 12](#12-offene-punkte-und-annahmen) als bewusst nicht behandelt geführt.

Konvention in diesem Dokument: Aussagen ohne Quellenangabe sind entweder aus den oben genannten Quellen abgeleitete Schlussfolgerungen oder Projektentscheidungen. Wo etwas weder belegt noch geprüft ist, steht ausdrücklich **nicht verifiziert** oder **Annahme**.

---

## 2. Ausgangslage: unsere API

Direkt aus `SPEC-BB` ausgezählt, nicht geschätzt:

| Merkmal | Wert |
| --- | --- |
| Anzahl Pfade | 54 |
| Anzahl Operationen | 54 (jeder Pfad genau eine Operation) |
| HTTP-Methode | ausschließlich `POST`, bei allen 54 |
| `api_key` im Body | bei allen 54 Operationen als Pflichtfeld deklariert |
| `limit` / `offset` im Body | bei 7 Operationen |
| `date_from` / `date_to` | bei 6 Operationen |
| `servers`, `security`, `components.securitySchemes` | im Dokument nicht gesetzt (leer bzw. nicht vorhanden) |

Drei Konsequenzen, die den gesamten Entwurf prägen:

1. **Die HTTP-Methode trägt keinerlei Sicherheitsinformation.** `POST /receipts/get` ist ein Lesevorgang, `POST /postings/cancel` ist ein Schreibvorgang. Wer `readOnlyHint` aus dem Verb ableitet, klassifiziert 54 von 54 Operationen falsch. Die Lese-/Schreibklassifikation muss pro Operation von Hand gepflegt und im Code als Datenstruktur hinterlegt werden.
2. **Es gibt keine erkennbare Idempotenz-Unterstützung.** In `SPEC-BB` ist kein Feld für einen Idempotency-Key sichtbar. Ein wiederholter `add`-Aufruf erzeugt nach jetzigem Kenntnisstand einen zweiten Datensatz. Das ist der zentrale Schadensmechanismus in einer echten Buchhaltung. (**Nicht verifiziert**: ob die API serverseitig dedupliziert.)
3. **Die Domäne ist deutsch, die API ist englisch.** `SPEC-BB` mischt beides, etwa in der Beschreibung von `list_direction`: `'inbound' ("Eingangsbelege")` und `'outbound' ("Ausgangsbelege")`. Beide Vokabulare müssen in den Tool-Beschreibungen auftauchen, siehe [Abschnitt 5](#5-beschreibungen).

---

## 3. Der zentrale Konflikt: Endpunkt-Tool gegen Absichts-Tool

### 3.1 Was die Quellen sagen

Die harte Zahl kommt aus `ANTHROPIC-SEARCH`:

> "Claude's ability to pick the right tool degrades once you exceed 30–50 available tools."

Dieselbe Quelle nennt die Faustregel, ab wann ein Toolsatz nicht mehr vollständig in den Kontext gehört: ab 10 Tools, ab mehr als 10k Token Tool-Definitionen, oder sobald die Trefferquote bei der Toolauswahl sinkt.

`ANTHROPIC-WTA` formuliert das Prinzip:

> "More tools don't always lead to better outcomes."

und empfiehlt ausdrücklich, verwandte Operationen zusammenzufassen sowie Such- und Aktionswerkzeuge statt reiner `list`-Werkzeuge zu bauen (Beispiel dort: `search_contacts` statt `list_contacts`). `ANTHROPIC-DEFINE` sagt dasselbe für die Definitionsseite:

> "Consolidate related operations into fewer tools. Rather than creating a separate tool for every action (`create_pr`, `review_pr`, `merge_pr`), group them into a single tool with an `action` parameter. Fewer, more capable tools reduce selection ambiguity and make your tool surface easier for Claude to navigate."

`AWS-TOOLDESIGN` widerspricht dem nicht, relativiert aber: Der Artikel beschreibt sechs Ausbaustufen von der rohen API-Durchreichung bis zum agentengestützten Tool und kommt zu dem Schluss, dass keine Stufe alle Dimensionen dominiert. Zitat:

> "The right choice depends on your field count, vocabulary stability, latency budget, and how much you need consistent behavior."

Der Artikel benennt die beiden Kernprobleme präzise: *bloat* (Kontextverbrauch) und *confusion* (falsche Parameterwahl). Diese beiden Probleme ziehen in entgegengesetzte Richtungen, und genau daraus entsteht unser Konflikt.

### 3.2 Argumente für ein Tool pro API-Endpunkt

- **Vollständigkeit ist trivial nachweisbar.** 54 Endpunkte, 54 Tools, eine 1:1-Tabelle. Kein Feature geht verloren, kein Reviewer muss argumentieren.
- **Fehlerlokalisierung ist eindeutig.** Ein fehlgeschlagener Tool-Aufruf zeigt genau auf einen Endpunkt. Kein Rätselraten, welcher interne Zweig gegriffen hat.
- **Schemata bleiben scharf.** Jeder Endpunkt hat seine eigene Pflichtfeldmenge. Bei der Zusammenfassung von `/postings/add/receipt`, `/postings/add/transaction` und `/postings/add/free` in ein Tool wird aus drei klaren `required`-Listen eine bedingte Struktur, die JSON Schema nur über `oneOf`/`allOf` ausdrücken kann und die manche Clients schlecht rendern.
- **Wartungsaufwand bei API-Änderungen ist minimal.** Ein neuer Endpunkt wird zu einem neuen Tool, ohne bestehende Schemata anzufassen.
- **Kein verstecktes Verhalten.** Ein Tool, das intern zwischen Einzel- und Batch-Endpunkt umschaltet, macht etwas, das der Nutzer im Protokoll nicht sieht. In einer Buchhaltung ist das ein Auditierbarkeitsproblem.

### 3.3 Argumente für ein Tool pro Absicht

- **54 Tools liegen oberhalb der belegten Degradationsschwelle von 30 bis 50** (`ANTHROPIC-SEARCH`). Das ist kein Stilargument, sondern der einzige quantitative Befund, den wir haben.
- **Kontextkosten.** Jede Tool-Definition kostet Token in jedem Request. `ANTHROPIC-SEARCH` nennt für einen typischen Mehrserver-Aufbau (GitHub, Slack, Sentry, Grafana, Splunk) rund 55k Token allein für Definitionen. Unsere 54 Endpunkte haben zusammen mehrere hundert Body-Parameter mit teils langen HTML-durchsetzten Beschreibungen in `SPEC-BB`; eine ungefilterte Durchreichung erzeugt eine Definitionsmasse, die einen erheblichen Teil des Kontextfensters belegt, bevor der Nutzer etwas gesagt hat. (**Annahme**: die genaue Tokenzahl wurde nicht gemessen; sie ist vor dem ersten Release zu messen, siehe [Abschnitt 10](#10-evaluierung).)
- **Endpunktschnitt und Nutzerabsicht fallen auseinander.** Niemand sagt "rufe `/transactions/assign-batch/receipt` auf". Gesagt wird: "ordne die drei Belege den passenden Buchungen zu". Ein Toolsatz, der die Absicht abbildet, braucht weniger Zwischenschritte und produziert weniger Zwischenausgaben im Kontext.
- **Batch- und Einzelvarianten sind reine API-Artefakte.** `/receipts/add` gegen `/receipts/addBatch`, `/postings/add/receipt` gegen `/postings/add-batch/receipts`: aus Sicht des Agenten ist das dieselbe Absicht mit einer anderen Kardinalität. Zwei Tools nebeneinander sind genau die "overlapping tools that distract agents", vor denen `ANTHROPIC-WTA` warnt.

### 3.4 Empfehlung für unseren Fall

**Wir bauen weder 54 Endpunkt-Tools noch eine freie Sammlung von Absichts-Tools, sondern einen ressourcenorientierten Toolsatz mit vollständiger Endpunktabdeckung und einem Zielkorridor von 28 bis 34 Tools.**

Die Regel, nach der zusammengefasst wird, lautet in dieser Reihenfolge:

1. **Kardinalität ist kein Tool-Unterschied.** Einzel- und Batch-Endpunkt derselben Operation werden ein Tool mit einem Array-Parameter `items`. Der Server wählt den passenden Endpunkt. Das ist verstecktes Verhalten, deshalb muss die Tool-Beschreibung es ausdrücklich nennen und die Antwort muss ausweisen, welcher Endpunkt aufgerufen wurde (siehe [Abschnitt 7](#7-antworten)).
2. **Gleiche Absicht mit variierendem Ziel wird ein Tool mit Enum-Diskriminator.** `/postings/unconfirm/receipt|transaction|free` wird `bb_postings_unconfirm` mit `target: "receipt" | "transaction" | "free"`. Voraussetzung: die Parametermengen der Varianten sind weitgehend deckungsgleich.
3. **Unterschiedliche Pflichtfeldmengen bleiben getrennt,** auch wenn die Absicht ähnlich klingt. Wenn eine Zusammenfassung dazu führt, dass der Agent raten muss, welche Felder gerade Pflicht sind, ist der Gewinn beim Tool-Zähler durch Verlust bei der Trefferquote überkompensiert. Das ist die Grenze, an der `AWS-TOOLDESIGN` mit *confusion* argumentiert.
4. **Schreiben wird nie mit Lesen zusammengefasst.** Kein Tool mit `action: "get" | "delete"`. Das zerstört die Aussagekraft von `readOnlyHint` und `destructiveHint` und macht die Freigabe-Dialoge der Clients wertlos.

### 3.5 Vorgeschlagene Abbildung, 54 Endpunkte auf 34 Tools

Der folgende Schnitt war ein **Vorschlag** aus der Entwurfsarbeit. Er ist **nicht** der
ausgelieferte Stand und ist auch nicht mehr zu bestätigen: Ausgeliefert wird genau ein Werkzeug
je Endpunkt, also 54 Endpunktwerkzeuge, dazu fünf Bündelwerkzeuge für wiederkehrende Abläufe,
zusammen 59 — siehe den Kasten in [11.1](#111-toolsatz). Am 2026-09-13 gegen den gebauten Server
nachgemessen: `tools/list` meldet 59 Werkzeuge, davon 19 lesende. Die Tabelle bleibt stehen, weil
die Regeln aus 3.4 an ihr erklärt sind; verbindlich sind diese Regeln, nicht die Tabelle.

| Tool | abgedeckte Endpunkte aus `SPEC-BB` | Art |
| --- | --- | --- |
| `bb_receipts_search` | `/receipts/get` | lesend |
| `bb_receipts_get` | `/receipts/get/id_by_customer` | lesend, lieferfähig; der Wert gehört ins Pfadsegment, gemessen HTTP 200 (nachgezogen 2026-09-13; siehe den Kasten unter dieser Tabelle) |
| `bb_receipts_create` | `/receipts/add`, `/receipts/addBatch` | schreibend |
| `bb_receipts_upload` | `/receipts/upload` | schreibend |
| `bb_receipts_delete` | `/receipts/delete/id_by_customer` | zerstörend |
| `bb_receipts_restore` | `/receipts/restore/id_by_customer` | schreibend |
| `bb_transactions_search` | `/transactions/get` | lesend |
| `bb_transactions_get` | `/transactions/get/id_by_customer` | lesend, lieferfähig; der Wert gehört ins Pfadsegment, gemessen HTTP 200 (nachgezogen 2026-09-13; siehe den Kasten unter dieser Tabelle) |
| `bb_transactions_create` | `/transactions/add`, `/transactions/addBatch` | schreibend |
| `bb_links_list` | `/receipts/assigned-transactions/get`, `/transactions/assigned-receipts/get` | lesend |
| `bb_links_create` | `/transactions/assign/receipt`, `/transactions/assign-batch/receipt` | schreibend |
| `bb_links_delete` | `/transactions/unassign/receipt` | zerstörend |
| `bb_invoices_create` | `/invoices/create`, `/invoices/create/e-invoice`, `/invoices/create/draft` | schreibend |
| `bb_postings_search` | `/postings/get` | lesend |
| `bb_postings_create` | `/postings/add/receipt`, `/postings/add-batch/receipts`, `/postings/add/transaction`, `/postings/add-batch/transactions`, `/postings/add/free`, `/postings/add-batch/free` | schreibend |
| `bb_postings_unconfirm` | `/postings/unconfirm/transaction`, `/postings/unconfirm/receipt`, `/postings/unconfirm/free` | zerstörend |
| `bb_postings_assign_receipt` | `/postings/assign/receipt-to-free-posting` | schreibend, Klasse B (siehe [9.3](#93-klassifikation-unserer-tools)), Verb `assign` nach [4.4](#44-verben-geschlossene-liste) |
| `bb_postings_cancel` | `/postings/cancel` | zerstörend |
| `bb_contacts_search` | `/settings/get/debtors`, `/settings/get/creditors` | lesend |
| `bb_contacts_create` | `/settings/add/debtor`, `/settings/add-batch/debtors`, `/settings/add/creditor`, `/settings/add-batch/creditors` | schreibend |
| `bb_contacts_update` | `/settings/update/debtor`, `/settings/update/creditor` | schreibend |
| `bb_postingaccounts_search` | `/settings/get/postingaccounts` | lesend |
| `bb_postingaccounts_create` | `/settings/add/postingaccount` | schreibend |
| `bb_postingaccounts_update` | `/settings/update/postingaccount` | schreibend |
| `bb_accounts_list` | `/accounts/get` | lesend |
| `bb_accounts_create` | `/accounts/add` | schreibend |
| `bb_comments_create` | `/comments/add` | schreibend |
| `bb_cost_locations_search` | `/cost-locations/get` | lesend |
| `bb_cost_locations_create` | `/cost-locations/add` | schreibend |
| `bb_cost_locations_update` | `/cost-locations/update` | schreibend |
| `bb_cost_locations_delete` | `/cost-locations/delete` | zerstörend |
| `bb_reports_create` | `/reports/create/bwa`, `/reports/create/sums` | schreibend, Klasse AR (siehe [9.3](#93-klassifikation-unserer-tools)) |
| `bb_reports_get` | `/reports/get/bwa`, `/reports/get/sums` | lesend |
| `bb_reports_get_ledger` | `/reports/get/sums/ledger` | lesend |

Summe: 34 Tools, 54 Endpunkte, keine Lücke.

> **Nachgezogen am 2026-09-13 nach eigener Messung gegen die Produktivumgebung.** **Die folgende
> Warnung ist überholt. Beide Werkzeuge sind lieferfähig.** Die Messungen, auf die sie sich
> stützt, betrafen die falsche Aufrufform: Das Segment `id_by_customer` im Pfad ist ein
> Platzhalter für den Wert. `POST /receipts/get/<wert>` und `POST /transactions/get/<wert>`
> antworten gemessen am 2026-09-12 mit **HTTP 200**. `bb_receipts_get` und `bb_transactions_get`
> werden deshalb **ohne jeden Einschränkungssatz** ausgeliefert, und **Abgrenzungssätze anderer
> Werkzeuge dürfen auf sie verweisen**; der frühere Punkt 3 der Konsequenzliste („Kein Verweis
> aus anderen Tools") entfällt ersatzlos. Ebenso entfallen die beiden Umgehungen: Der
> Einzelabruf einer Zahlung wird nicht über exklusive Kennungsgrenzen nachgebildet, und
> Fremdwährungsfelder und Dateiinhalt sind über den Einzelabruf erreichbar. Die beiden
> schreibenden Geschwister `/receipts/delete/<wert>` und `/receipts/restore/<wert>` benutzen
> dieselbe Form, sind aber **nicht verifiziert**, weil sie schreibend sind; sie tragen im
> Register `verified: false`. Der frühere Wortlaut bleibt unten stehen, weil er belegt, welche
> Aufrufformen **nicht** funktionieren.

**Warnung: zwei Endpunkte dieser Tabelle sind live nicht funktionsfähig.** Die beiden Einzelabruf-Endpunkte `/receipts/get/id_by_customer` und `/transactions/get/id_by_customer` wurden am 2026-09-12 gegen die Produktivumgebung geprüft und lieferten in keiner Variante ein verwertbares Ergebnis. Die Belege stehen in den API-Dossiers; hier nur das, was den Toolschnitt betrifft.

- **`/transactions/get/id_by_customer` antwortet mit HTTP 404**, der Antwortkörper ist eine HTML-Seite der Weboberfläche statt des JSON-Fehlerumschlags. Geprüft mit zwei Aufrufen: einmal mit einer zuvor über `/transactions/get` ermittelten, existierenden Kennung, einmal mit `id_by_customer: 1`. Kontrollmessung im selben Zeitfenster: der analoge Receipts-Pfad antwortet mit denselben Zugangsdaten mit HTTP 400 und sauberem JSON, Authentifizierung und das dreisegmentige Routing-Muster funktionieren also grundsätzlich. Schlussfolgerung in `docs/api/transaktionen.md` Abschnitt 4.5: Der Endpunkt ist in der erreichbaren Produktivumgebung **nicht geroutet**, und "ein MCP-Tool darf sich nicht auf diesen Endpunkt verlassen".
- **`/receipts/get/id_by_customer` antwortet in vier geprüften Varianten mit HTTP 400 und `error_code` 5** (`invalid id_by_customer specified`), obwohl die Kennung zuvor über `/receipts/get` ermittelt wurde. Geprüft wurden: Kennung als Zahl, Kennung als String, Feldname `receipt_id_by_customer`, sowie ein formularkodierter Body. Ausgeschlossen sind damit Kodierung, JSON-Typ und Authentifizierung. `docs/api/belege.md` Abschnitt 4.5 hält fest: "Bis dahin gilt dieser Endpunkt als nicht funktionsfähig belegt." Offen und ausdrücklich **ungetestet** ist die dort genannte Hypothese, dass der Endpunkt ein Array erwartet, also `{"api_key": "...", "id_by_customer": [2]}`.

**Konsequenz für die Implementierung.** `bb_receipts_get` und `bb_transactions_get` werden nicht ausgeliefert, bevor je ein Testaufruf gegen die laufende API den zugehörigen Endpunkt als funktionsfähig belegt. Bis dahin gilt:

1. **Transaktionen: Umgehung über `/transactions/get`.** Der Einzelabruf wird nachgebildet mit `id_by_customer_from = id - 1` und `id_by_customer_to = id + 1`, weil beide Grenzen exklusiv sind und damit genau die gesuchte Kennung übrigbleibt (`docs/api/transaktionen.md` Abschnitt 4.5, Parameterbelege in Abschnitt 3.1). Zwei Vorbehalte gehören in die Tool-Beschreibung: Die Umgehung ist selbst **nicht live verifiziert**, und sie liefert nur die sechs Listenfelder von `/transactions/get`, nicht `account`, `currency`, `account_number`, `bank_code`, `bank_name`, `type` und `booking_text`.
2. **Belege: keine gleichwertige Umgehung.** `/receipts/get` kennt keinen Filter auf `id_by_customer` (14 Parameter, `docs/api/belege.md` Abschnitt 3.1), ein Einzelabruf ist dort nur über Datums-, Gegenpartei- oder Rechnungsnummernfilter und Auswahl der passenden Zeile nachbildbar. Zusätzlich fehlen der Listenantwort die Detailfelder des Einzelabrufs (`amount_original`, `currency_original`, `exchangerate`, `e_invoice_type`, `file_content`, `file_type`, `payment_reference`). Solange `/receipts/get/id_by_customer` nicht funktioniert, sind Fremdwährungsumrechnung und Dateiinhalt über die API **nicht erreichbar**.
3. **Kein Verweis aus anderen Tools.** Solange dieser Punkt offen ist, verweist keine Tool-Beschreibung auf `bb_receipts_get` oder `bb_transactions_get`. Ein Abgrenzungssatz, der auf ein nicht lieferfähiges Tool zeigt, ist schlechter als kein Abgrenzungssatz, weil er den Agenten in einen garantierten Fehlschlag lenkt. Siehe [5.5](#55-fehlbedienung-vorbeugen).

Der Endpunktzähler bleibt bei 54, weil beide Endpunkte in `SPEC-BB` existieren und dokumentiert sind. Lieferfähig sind die zugehörigen Tools damit nicht. Beide Punkte sind in [Abschnitt 12](#12-offene-punkte-und-annahmen) als offen geführt.

**Wenn 34 sich in der Evaluierung als zu viel erweist**, gibt es genau zwei belegte Hebel, in dieser Reihenfolge:

1. **Stammdaten-Lookups zusammenfassen.** `bb_contacts_search`, `bb_postingaccounts_search`, `bb_accounts_list` und `bb_cost_locations_search` sind alle "schlage einen Stammdatensatz nach". Ein `bb_reference_search(entity: "debtor" | "creditor" | "postingaccount" | "account" | "cost_location")` spart drei Tools und bringt den Satz auf 31. Das entspricht der Stufe V4 aus `AWS-TOOLDESIGN` (Trennung von Suche und Taxonomie-Lookup, dort mit dem niedrigsten Basis-Kontextverbrauch von rund 2 Prozent gemessen).
2. **Deferred Loading nutzen, statt Tools zu streichen.** `ANTHROPIC-SEARCH` beschreibt `defer_loading: true` in Verbindung mit dem Tool-Search-Tool; der Kontextbedarf sinkt dort typischerweise um über 85 Prozent, weil nur die 3 bis 5 tatsächlich gebrauchten Tools geladen werden. Das ist eine Client-seitige Fähigkeit, keine Server-Fähigkeit: Wir können sie nicht erzwingen, aber wir können sie unterstützen, indem Namen und Beschreibungen durchsuchbar sind (siehe 4.4 und 5.5). Für MCP-Server wird `defer_loading` laut `ANTHROPIC-SEARCH` nicht pro Tool, sondern am `mcp_toolset`-Eintrag gesetzt.

---

## 4. Namensgebung

### 4.1 Harte Grenzen

- Anthropic-Tool-Namen müssen `^[a-zA-Z0-9_-]{1,128}$` erfüllen (`ANTHROPIC-DEFINE`). Keine Punkte, keine Doppelpunkte, keine Leerzeichen.
- **MCP schreibt seit der Revision 2025-11-25 eine eigene Namensform vor.** `MCP-SPEC-TOOLS` hat dort den Unterabschnitt "Tool Names" mit fünf SOLLTE-Regeln: Namen sollen 1 bis 128 Zeichen lang sein, als case-sensitive gelten, ausschließlich aus ASCII-Buchstaben (A-Z, a-z), Ziffern (0-9), Unterstrich, Bindestrich und Punkt bestehen, keine Leerzeichen, Kommas oder sonstigen Sonderzeichen enthalten und innerhalb eines Servers eindeutig sein. Als gültige Beispiele nennt die Spezifikation `getUser`, `DATA_EXPORT_v2` und `admin.tools.list`. Quelle: https://modelcontextprotocol.io/specification/2025-11-25/server/tools, Unterabschnitt "Tool Names", abgerufen am 2026-09-12. Dieselben fünf Regeln stehen unverändert in der aktuellen Revision 2026-07-28 (https://modelcontextprotocol.io/specification/2026-07-28/server/tools, abgerufen am 2026-09-12); diese ergänzt lediglich den Hinweis, dass die Eindeutigkeit nur je Server gilt und aggregierende Clients selbst disambiguieren sollen. Die früher an dieser Stelle stehende Aussage, MCP schreibe keine engere Namensform vor und `name` sei lediglich "Unique identifier for the tool", galt nur für die überholte Revision 2025-06-18 und ist hinfällig.
- **Maßgeblich ist die Schnittmenge beider Regelwerke, und das ist das Anthropic-Regex.** MCP lässt zusätzlich den Punkt zu, Anthropic nicht. Wo sich beide unterscheiden, gilt die engere Regel, also `^[a-zA-Z0-9_-]{1,128}$`. Ein Name wie `admin.tools.list` wäre MCP-konform und für uns trotzdem unzulässig.
- Clients präfixieren zusätzlich. Claude Code etwa zeigt MCP-Tools als `mcp__<servername>__<toolname>`. Der eigene Präfix wird also nicht ersetzt, sondern addiert.

### 4.2 Präfix

`ANTHROPIC-WTA` empfiehlt Namespacing ausdrücklich, sowohl dienstbasiert (`asana_search`, `jira_search`) als auch ressourcenbasiert (`asana_projects_search`), und merkt an, dass die Wahl zwischen Präfix und Suffix messbare Auswirkungen auf die Evaluationsergebnisse hat. `ANTHROPIC-SEARCH` ergänzt den praktischen Grund:

> "Use consistent namespacing in tool names: prefix by service or resource (for example, `github_`, `slack_`) so one search matches the whole group."

Der Referenzserver `SRV-GIT` macht genau das: `git_status`, `git_diff_unstaged`, `git_commit`, `git_branch`. `SRV-FS` verzichtet dagegen auf einen Präfix (`read_text_file`, `write_file`, `move_file`) und riskiert damit Kollisionen mit jedem anderen Datei-Server im selben Kontext.

**Entscheidung: Präfix `bb_`.** Zwei Buchstaben plus Unterstrich, damit der Gesamtname in Clients mit eigener Präfixierung nicht ausufert. `buchhaltungsbutler_` wäre eindeutiger, ergibt aber in Claude Code Namen wie `mcp__buchhaltungsbutler__buchhaltungsbutler_receipts_search` und verbrennt Token in jeder Definition und in jedem Aufruf.

### 4.3 Schema

```
bb_<ressource>_<verb>[_<qualifizierer>]
```

- **snake_case, durchgehend klein.** Keine Bindestriche und keine Punkte, obwohl beide Regelwerke aus [4.1](#41-harte-grenzen) sie teilweise zuließen: Die MCP-Namensregel aus `MCP-SPEC-TOOLS` erlaubt Unterstrich, Bindestrich und Punkt, das engere Anthropic-Regex Unterstrich und Bindestrich. Wir schöpfen das nicht aus. Unterstriche tokenisieren stabiler und die Referenzserver verwenden sie durchgängig; der Punkt scheidet ohnehin aus, weil das Anthropic-Regex ihn verbietet.
- **Ressource vor Verb.** `bb_receipts_search`, nicht `bb_search_receipts`. Grund: Die Sortierung gruppiert die Tools einer Ressource zusammen, und eine Regex-Suche auf `receipts` trifft die ganze Gruppe. Das ist genau der in `ANTHROPIC-SEARCH` beschriebene Effekt.
- **Ressource im Plural**, weil die API-Pfade es auch tun (`/receipts/`, `/transactions/`, `/postings/`).
- **Länge maximal 40 Zeichen** inklusive `bb_`. Alle 34 Vorschlagsnamen liegen darunter.

### 4.4 Verben, geschlossene Liste

Nur diese Verben sind erlaubt. Neue Verben brauchen eine Entscheidung, kein Ad-hoc-Wort.

| Verb | Bedeutung | Art |
| --- | --- | --- |
| `search` | gefilterte Liste mit `limit`/`offset`, liefert mehrere Treffer | lesend |
| `get` | genau ein Objekt über seinen Identifikator | lesend |
| `list` | vollständige, kurze Aufzählung ohne sinnvolle Filter (nur wo `search` überzogen wäre, z. B. `bb_accounts_list`) | lesend |
| `create` | legt an, Einzel- oder Mehrfachanlage über `items` | schreibend |
| `update` | ändert ein bestehendes Objekt | schreibend |
| `delete` | entfernt oder markiert als gelöscht | zerstörend |
| `restore` | macht ein `delete` rückgängig | schreibend |
| `upload` | überträgt eine Datei | schreibend |
| `cancel` | storniert fachlich (Buchhaltung: Storno, kein Löschen) | zerstörend |
| `unconfirm` | hebt eine Bestätigung auf | zerstörend |
| `assign` | stellt eine Zuordnung zwischen zwei bereits bestehenden Objekten her, ohne ein neues Fachobjekt anzulegen | schreibend |

`ANTHROPIC-WTA` empfiehlt, `search`- und Aktionswerkzeuge gegenüber reinen `list`-Werkzeugen zu bevorzugen. Deshalb ist `search` der Normalfall und `list` die begründete Ausnahme.

**Abgrenzung `assign` gegen `create`.** Beide Verben führen zu einer Verknüpfung, austauschbar sind sie trotzdem nicht. `create` wird verwendet, wo die Verknüpfung in `SPEC-BB` als eigene, vollständig verwaltete Ressource auftritt, also ein Lese- und ein Lösch-Gegenstück besitzt: `bb_links_list` (`/receipts/assigned-transactions/get`, `/transactions/assigned-receipts/get`), `bb_links_create` (`/transactions/assign/receipt`, `/transactions/assign-batch/receipt`) und `bb_links_delete` (`/transactions/unassign/receipt`). `assign` wird verwendet, wo die Zuordnung an einem bestehenden Fachobjekt hängt und `SPEC-BB` kein Gegenstück zum Aufheben anbietet. Das trifft in der gesamten Spezifikation auf genau einen Endpunkt zu, `/postings/assign/receipt-to-free-posting`, und damit auf genau ein Werkzeug, `bb_postings_assign_receipt`. Die Aussage über das fehlende Gegenstück ist aus der vollständigen Pfadliste von `SPEC-BB` ausgezählt: unterhalb von `/postings/` existiert kein `unassign`-Pfad, während es ihn unterhalb von `/transactions/` gibt. Ein künftiges Werkzeug bekommt `assign` nur, wenn dieselbe Bedingung gilt; sonst gilt `create`. Die sicherheitsrelevante Folge dieser Asymmetrie steht in [9.3](#93-klassifikation-unserer-tools).

### 4.5 Kollisionen im selben Kontextfenster

Ein Agent hat typischerweise mehrere Server geladen. Realistische Kollisionskandidaten für einen Buchhaltungsserver sind Namen wie `create_invoice`, `list_transactions`, `get_receipt` oder `search_contacts`, die in Zahlungs-, CRM- und ERP-Servern gleichermaßen vorkommen. Der Präfix `bb_` löst das Problem auf Namensebene.

Er löst es nicht auf Semantikebene: Wenn ein PayPal-Server und unser Server beide "Rechnung anlegen" können, muss die Beschreibung sagen, *welche* Rechnung gemeint ist. Regel: **Die erste Zeile jeder Beschreibung nennt das System.** Also "Creates an outgoing invoice in BuchhaltungsButler", nicht "Creates an invoice".

### 4.6 Parameternamen

`ANTHROPIC-WTA` warnt vor mehrdeutigen Parameternamen und nennt `user_id` gegenüber `user` als Beispiel. Für uns folgt daraus:

- Identifikatoren heißen so wie in `SPEC-BB`: `receipt_id_by_customer`, `transaction_id_by_customer`, `postingaccount_number`. Diese Namen sind lang und unschön, aber sie sind die Namen, unter denen die API antwortet. Ein Umbenennen auf `id` schafft eine zweite Sprache und damit eine zweite Fehlerquelle.
- Wo `SPEC-BB` ein Feld schlicht `type` nennt (7 Vorkommen mit unterschiedlicher Bedeutung), wird im Tool-Schema umbenannt auf ein sprechendes Feld: `receipt_type`, `posting_type`, `contact_type`. Das entspricht Stufe V3 aus `AWS-TOOLDESIGN` ("renaming parameters semantically"). Die Umbenennung findet in der Übersetzungsschicht statt, nicht im HTTP-Request.

---

## 5. Beschreibungen

### 5.1 Was die Quellen fordern

`ANTHROPIC-DEFINE` ist an dieser Stelle am konkretesten:

> "Provide extremely detailed descriptions. This is by far the most important factor in tool performance."

Der geforderte Inhalt:

> "What the tool does / When it should be used (and when it shouldn't) / What each parameter means and how it affects the tool's behavior / Any important caveats or limitations, such as what information the tool does not return if the tool name is unclear."

Und die Längenangabe:

> "Aim for at least 3–4 sentences for each tool description, more if the tool is complex."

`ANTHROPIC-WTA` ergänzt das Bild: Beschreibungen sind wie die Einweisung eines neuen Teammitglieds zu schreiben, impliziter Kontext muss explizit gemacht werden, und kleine Verfeinerungen haben große Wirkung. Als Beleg nennt der Artikel, dass Claude Sonnet 3.5 den damaligen Bestwert auf SWE-bench Verified nach "precise refinements to tool descriptions" erreichte.

`MCP-SCHEMA` beschreibt die Rolle nüchterner:

> "A human-readable description of the tool. This can be used by clients to improve the LLM's understanding of available tools. It can be thought of like a 'hint' to the model."

### 5.2 Arbeitsteilung zwischen Tool- und Parameterbeschreibung

| Gehört in die **Tool**-Beschreibung | Gehört in die **Parameter**-Beschreibung |
| --- | --- |
| Was das Tool tut, in einem Satz, mit Systemnennung | Was genau dieser Wert bedeutet |
| Wann man es benutzt und wann nicht | Format mit Beispielwert |
| Welche Endpunkte es intern abdeckt, falls mehr als einer | Erlaubte Werte, falls kein Enum möglich |
| Was es **nicht** liefert (etwa: keine PDF-Bilddaten) | Standardwert und was passiert, wenn man ihn weglässt |
| Vorbedingungen (welches Tool vorher laufen muss) | Wechselwirkung mit anderen Parametern |
| Ob es schreibt und ob es rückgängig gemacht werden kann | Obergrenzen (`limit` maximal 500) |
| Deutsche Domänenbegriffe als Suchbegriffe | deutsche Entsprechung des Fachbegriffs |

Der Grund für die Trennung ist nicht Ästhetik: Beide Felder werden vom Tool-Search-Tool durchsucht. `ANTHROPIC-SEARCH` nennt ausdrücklich "tool names, descriptions, argument names, and argument descriptions" als Suchraum. Wer alles in die Tool-Beschreibung packt, macht die Parameter unauffindbar, und umgekehrt.

### 5.3 Direkter Vergleich

`ANTHROPIC-DEFINE` zeigt dieses Paar für ein Aktienkurs-Tool:

```json
// schlecht
{
  "name": "get_stock_price",
  "description": "Gets the stock price for a ticker.",
  "input_schema": {
    "type": "object",
    "properties": { "ticker": { "type": "string" } },
    "required": ["ticker"]
  }
}
```

```json
// gut
{
  "name": "get_stock_price",
  "description": "Retrieves the current stock price for a given ticker symbol. The ticker symbol must be a valid symbol for a publicly traded company on a major US stock exchange like NYSE or NASDAQ. The tool will return the latest trade price in USD. It should be used when the user asks about the current or most recent price of a specific stock. It will not provide any other information about the stock or company.",
  "input_schema": {
    "type": "object",
    "properties": {
      "ticker": { "type": "string", "description": "The stock ticker symbol, e.g. AAPL for Apple Inc." }
    },
    "required": ["ticker"]
  }
}
```

Für unsere Domäne, derselbe Vergleich an `bb_receipts_search`:

```jsonc
// SCHLECHT
{
  "name": "bb_receipts_search",
  "description": "Get receipts.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "list_direction": { "type": "string" },
      "type": { "type": "string" },
      "limit": { "type": "integer" },
      "date_from": { "type": "string" }
    },
    "required": ["list_direction"]
  }
}
```

Was daran kaputt ist, Punkt für Punkt:

- Kein Systemname. In einem Kontext mit drei Buchhaltungsservern ist unklar, wessen Belege gemeint sind.
- `list_direction` ist ein freier String ohne Wertevorrat. Der Agent rät zwischen `inbound`, `in`, `incoming`, `Eingang`.
- `type` sagt nicht, wovon.
- Keine Angabe, dass `limit` bei 500 gedeckelt ist. Der Agent fordert 5000 an, bekommt 500 und hält das Ergebnis für vollständig. Das ist der gefährlichste Fehler in der Liste, weil er still ist.
- Kein Wort dazu, dass `date_from`/`date_to` auf das Belegdatum wirken und nicht auf das Erfassungsdatum.
- Kein Wort dazu, was das Tool nicht liefert.
- Keine deutschen Begriffe: eine Suche nach "Eingangsbeleg" trifft nichts.

```jsonc
// GUT
{
  "name": "bb_receipts_search",
  "description":
    "Searches receipts (\"Belege\") in the connected BuchhaltungsButler account and returns a paginated list of matching receipt records. Use this when the user asks to find, filter, count or list receipts, for example incoming receipts (\"Eingangsbelege\") of a given supplier or all unpaid receipts of a month. This is also the way to look up a single known receipt: the BuchhaltungsButler endpoint for fetching one receipt by its id_by_customer is currently not usable, and this search has no id_by_customer filter, so narrow it by date, counterparty or invoicenumber and pick the matching row. Use bb_transactions_search instead when you are looking for bank movements (\"Transaktionen\") rather than receipts (\"Belege\"). Results are metadata only: the tool never returns the receipt file, image or PDF content. The result is capped at 500 rows per call; when the reported total is larger than the returned rows, page through the result with offset instead of raising limit. Filter as narrowly as possible, a broad search burns context without improving the answer.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "list_direction": {
        "type": "string",
        "enum": ["inbound", "outbound"],
        "description": "Which side of the ledger to search. 'inbound' are receipts you received, i.e. supplier invoices (\"Eingangsbelege\"). 'outbound' are receipts you issued, i.e. your own invoices (\"Ausgangsbelege\"). Required, there is no default."
      },
      "payment_status": {
        "type": "string",
        "enum": ["paid", "unpaid"],
        "description": "Restrict to paid (\"bezahlt\") or unpaid (\"unbezahlt\") receipts. Omit to get both."
      },
      "counterparty": {
        "type": "string",
        "description": "Name of the other party, i.e. the invoicing party for list_direction 'inbound' or the recipient for 'outbound'. Example: 'Peter Maier'. Matching behaviour is defined by the BuchhaltungsButler API, do not assume it is a substring match."
      },
      "date_from": {
        "type": "string",
        "format": "date",
        "description": "Earliest issuing date of the receipt (\"Belegdatum\", not the date the receipt was uploaded), inclusive, as YYYY-MM-DD, e.g. '2026-04-26'. An empty string is rejected, omit the field instead."
      },
      "date_to": {
        "type": "string",
        "format": "date",
        "description": "Latest issuing date of the receipt, inclusive, as YYYY-MM-DD. Must not be earlier than date_from."
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 500,
        "default": 100,
        "description": "Maximum number of receipts to return. Hard maximum enforced by the API is 500; larger values are rejected rather than silently clamped. Keep this small and page with offset."
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0,
        "description": "Number of rows to skip, for paging. To fetch the second page of a limit=100 search, pass offset=100."
      }
    },
    "required": ["list_direction"]
  }
}
```

**Hinweis zum Abgrenzungssatz in diesem Beispiel.** Ein naheliegender Abgrenzungssatz wäre "Use `bb_receipts_get` instead when you already know a receipt's id_by_customer". Er steht hier bewusst **nicht**, weil `/receipts/get/id_by_customer` live nicht funktionsfähig belegt ist (siehe die Warnung in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) und `docs/api/belege.md` Abschnitt 4.5). Ein Verweis auf ein Tool, das der Server nicht ausliefern kann, erzeugt einen garantierten Fehlversuch. Sobald der Endpunkt verifiziert ist, wird der Satz nachgezogen und der Hinweis auf den fehlenden Filter entfernt.

Der Unterschied in Zahlen: die schlechte Variante ist kürzer, aber sie verursacht mindestens einen zusätzlichen Fehlversuch pro Aufruf, sobald `list_direction` geraten werden muss. Ein Fehlversuch plus Fehlermeldung plus Wiederholung kostet mehr Token als die vollständige Beschreibung einmal kostet.

### 5.4 Beispiele in Beschreibungen

Drei Mechanismen, in dieser Rangfolge:

1. **Beispielwert direkt in der Parameterbeschreibung.** Immer. Kostet fast nichts. `SRV-GIT` macht das vorbildlich beim Zeitfilter: "Accepts: ISO 8601 format (e.g., '2024-01-15T14:30:25'), relative dates (e.g., '2 weeks ago', 'yesterday'), or absolute dates (e.g., '2024-01-15', 'Jan 15 2024')".
2. **`input_examples` bei komplexen Eingaben.** `ANTHROPIC-DEFINE` empfiehlt das Feld für "tools with complex inputs, nested objects, or format-sensitive parameters" und beziffert die Kosten mit "~20–50 tokens for simple examples, ~100–200 tokens for complex nested objects". Für uns relevant bei `bb_postings_create` (verschachteltes `items`) und bei `order` aus `SPEC-BB`, das ein Objekt der Form `{"date": "ASC", "amount": "DESC"}` erwartet. **Einschränkung:** `input_examples` ist ein Anthropic-API-Feld, kein MCP-Feld. Über MCP lässt es sich nicht transportieren; dort muss das Beispiel in den Beschreibungstext. (**Nicht verifiziert**: ob eine spätere MCP-Version ein Äquivalent einführt.)
3. **Ein vollständiger Beispielaufruf am Ende der Tool-Beschreibung**, nur bei den drei bis fünf kompliziertesten Tools. Mehr als das bläht die Definitionen auf.

### 5.5 Fehlbedienung vorbeugen

Vier Sätze, die in jede Beschreibung eines nicht offensichtlichen Tools gehören:

- **Der Abgrenzungssatz.** "Use `bb_transactions_search` instead when you are looking for bank movements, not receipts." Verhindert, dass zwei ähnliche Tools konkurrieren. **Bedingung:** Ein Abgrenzungssatz darf nur auf ein Tool verweisen, das der Server tatsächlich ausliefert. Solange `bb_receipts_get` und `bb_transactions_get` wegen der in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) belegten Endpunktfehler nicht lieferfähig sind, wird in keiner Beschreibung auf sie verwiesen.
- **Der Negativsatz.** "This tool never returns the receipt file content." `ANTHROPIC-DEFINE` nennt das ausdrücklich: "what information the tool does not return".
- **Der Vorbedingungssatz.** "The postingaccount_number must exist; look it up with `bb_postingaccounts_search` first." Erspart einen garantierten Fehlschlag.
- **Der Folgensatz** bei schreibenden Tools. "This creates a posting in the live accounting data. It cannot be deleted, only reversed with `bb_postings_cancel`."

### 5.6 Sprache

**Beschreibungen werden auf Englisch verfasst**, weil Feldnamen, Enum-Werte und Endpunktpfade englisch sind und ein Sprachwechsel mitten im Satz die Lesbarkeit für das Modell verschlechtert.

**Deutsche Fachbegriffe werden in Anführungszeichen eingestreut**, dort wo ein deutschsprachiger Nutzer sie verwenden würde: "Beleg", "Eingangsbeleg", "Ausgangsbeleg", "Buchung", "Kreditor", "Debitor", "Sachkonto", "Kostenstelle", "BWA", "Summen- und Saldenliste", "Storno". Begründung aus `ANTHROPIC-SEARCH`:

> "Use keywords in descriptions that match how users describe tasks."

Da das Tool-Search-Tool über Namen, Beschreibungen und Argumentbeschreibungen sucht, sind diese Begriffe der einzige Weg, wie eine deutschsprachige Anfrage unseren Toolsatz findet.

---

## 6. Eingabeschemata

### 6.1 Enums statt freier Strings

Das ist der wirksamste Einzelhebel. `AWS-TOOLDESIGN` bringt es auf den Punkt: durch Enum-Constraints kann "the schema itself tell the LLM what is valid", und das reduziert gleichzeitig die Definitionsgröße, weil die Aufzählung der gültigen Werte nicht mehr in Prosa wiederholt werden muss.

`SPEC-BB` beschreibt zahlreiche Wertebereiche nur im Fließtext, etwa bei `list_direction`: "Can be either 'inbound' (\"Eingangsbelege\") or 'outbound' (\"Ausgangsbelege\")". Jeder solche Fall wird in unserem Schema zu einem echten `enum`.

**Regel:** Jeder Parameter, dessen gültige Werte abzählbar und stabil sind, bekommt ein `enum`. Das gilt auch dann, wenn die API selbst großzügiger validiert. Ein engeres Schema als die API ist erlaubt und erwünscht; ein weiteres ist verboten.

**Gegenausnahme:** Wertebereiche, die sich pro Mandant unterscheiden, werden **nicht** zu Enums. `postingaccount_number` und `cost_location` sind Mandantendaten. Sie bekommen stattdessen einen Verweis auf das Lookup-Tool in der Parameterbeschreibung. Das ist die Trennung von Suche und Taxonomie aus Stufe V4 in `AWS-TOOLDESIGN`.

### 6.2 Defaults

`MCP-SPEC-TOOLS` sagt zu Defaults nichts Besonderes; es gilt normales JSON Schema. Die Referenzserver setzen sie konsequent:

- `SRV-FETCH`: `max_length` mit `default=5000`, `gt=0`, `lt=1000000`; `start_index` mit `default=0`, `ge=0`.
- `SRV-GIT`: `context_lines` mit `DEFAULT_CONTEXT_LINES = 3`; `max_count` mit `10`.
- `SRV-FS`: `dryRun` mit `default(false)`, `sortBy` mit `default("name")`.

**Regeln für uns:**

- Jeder optionale Parameter mit sinnvollem Normalwert bekommt einen expliziten `default` **und** die Erwähnung im `description`-Text. Manche Clients zeigen nur eines von beidem.
- Der Default wird **konservativ** gewählt, nicht maximal. `limit` bekommt `default: 100`, obwohl die API 500 erlaubt. Begründung: `ANTHROPIC-WTA` verlangt "pagination, range selection, filtering, truncation with sensible defaults", und ein Default von 500 verbrennt in der Mehrzahl der Fälle Kontext für Zeilen, die niemand liest.
- Ein Default darf **nie** eine schreibende Wirkung haben. Kein `auto_assign: true` als Default, keine Vorbelegung, die ohne Zutun des Aufrufers einen zusätzlichen Datensatz erzeugt oder einen bestehenden ersetzt. Einen `confirm`-Parameter gibt es in keinem Werkzeug, weder mit noch ohne Default, siehe [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server).

### 6.3 Formate

| Feldtyp | Schema | Begründung |
| --- | --- | --- |
| Datum | `"type": "string", "format": "date"` plus Beispiel im Text | `SPEC-BB` verlangt `YYYY-MM-DD` und lehnt den leeren String ab |
| Betrag | `"type": "string"` mit Formatangabe im Text, **nicht** `number` | Fließkomma und Geld vertragen sich nicht. **Nicht verifiziert**, welches Format die BB-API tatsächlich akzeptiert (Punkt oder Komma als Dezimaltrenner); vor der Implementierung an der laufenden API zu prüfen |
| Boolean | `"type": "boolean"` | `SPEC-BB` deklariert bei `include_offers` und `deleted` den Default als String `"false"`; im Tool-Schema wird daraus ein echtes `false` |
| Sortierung | eigenes Objekt mit Enum-Werten `ASC`/`DESC` je Feld | `SPEC-BB` erwartet `{"date": "ASC", "amount": "DESC"}` |
| Datei | Base64-String mit ausdrücklicher Größenangabe im Text | siehe [Abschnitt 12](#12-offene-punkte-und-annahmen) |

### 6.4 Wann ein Feld optional sein darf

Ein Feld ist optional, wenn **alle drei** Bedingungen gelten:

1. Die API akzeptiert den Aufruf ohne das Feld.
2. Das Weglassen hat eine definierte, in der Beschreibung genannte Bedeutung.
3. Die Bedeutung des Weglassens ist harmlos.

Der dritte Punkt ist der wichtige. Bei `bb_receipts_search` bedeutet ein weggelassenes `payment_status` "beides" und ist harmlos. Bei einem schreibenden Tool bedeutet ein weggelassenes Konto möglicherweise "Systemvorschlag akzeptieren", und das ist in einer Buchhaltung nicht harmlos. **Bei schreibenden Tools sind alle fachlich entscheidenden Felder Pflicht**, auch wenn die API sie als optional führt. Wir dürfen enger sein als die API.

### 6.5 Mehrdeutige Parameter entschärfen

Fünf Techniken, in der Reihenfolge ihrer Wirksamkeit:

1. **Umbenennen.** `type` wird `receipt_type`. `ANTHROPIC-WTA` nennt genau dieses Muster (`user_id` statt `user`), `AWS-TOOLDESIGN` belegt es als Stufe V3.
2. **Enum setzen.** Nimmt dem Modell die Wahl.
3. **Aufspalten.** Ein Feld, das je nach Kontext zwei Dinge bedeutet, wird zu zwei Feldern. Beispiel: wenn `account` in `SPEC-BB` an unterschiedlichen Endpunkten Bankkonto und Sachkonto meint, werden daraus `bank_account` und `postingaccount_number`. (**Nicht verifiziert**, ob das bei `account` tatsächlich der Fall ist; bei der Detailauswertung der Endpunkte zu prüfen.)
4. **Gegenseitigen Ausschluss deklarieren.** `SRV-FS` löst das bei `read_text_file` durch die Aussage "Cannot specify both `head` and `tail` simultaneously" in der Dokumentation und lehnt die Kombination zur Laufzeit ab. Besser als reine Prosa ist zusätzlich ein `not`/`oneOf` im Schema, sofern der Client es auswertet.
5. **Diskriminator vor die abhängigen Felder ziehen.** Bei `bb_postings_create` steht `target` als erste Property; die Beschreibung von `items` verweist darauf, welche Felder je `target` Pflicht sind.

### 6.6 Was nicht ins Schema gehört

- **`api_key` nicht.** `SPEC-BB` führt ihn bei allen 54 Operationen als Body-Pflichtfeld. Er wird ausschließlich aus der Serverkonfiguration gezogen, nie als Tool-Parameter angeboten. Ein Zugangsdatum als Tool-Parameter bedeutet, dass es im Klartext durch den Modellkontext, durch Transkripte und durch Logs läuft. Das ist unter keinen Umständen akzeptabel.
- **Keine rohen internen Identifikatoren als Pflichteingabe**, wenn es einen sprechenden Weg gibt. `ANTHROPIC-WTA` stellt fest, dass das Auflösen von UUIDs in verständliche Sprache "significantly improves Claude's precision".
- **Keine durchgereichten HTTP-Details.** Keine Header, keine Endpunktpfade, keine `content-type`-Parameter.

### 6.7 Weitere Felder der Tool-Definition unter 2025-11-25

`MCP-SPEC-TOOLS` beschreibt die Tool-Definition der Zielrevision 2025-11-25 mit acht Feldern: `name`, `title`,
`description`, `icons`, `inputSchema`, `outputSchema`, `annotations` und `execution`. Name, Beschreibung, Ein- und
Ausgabeschema sowie Annotationen haben in diesem Dokument eigene Abschnitte. Für zwei der übrigen Felder wird hier
entschieden, beide werden bewusst nicht gesetzt. Das optionale `title`, laut `MCP-SPEC-TOOLS` ein Feld "for
display purposes", ist in diesem Dokument nicht geregelt und in [Abschnitt 12](#12-offene-punkte-und-annahmen)
als offener Punkt geführt.

| Feld | Was es laut `MCP-SPEC-TOOLS` ist | Entscheidung | Begründung |
| --- | --- | --- | --- |
| `icons` | "Optional array of icons for display in user interfaces", je Eintrag mit `src`, `mimeType` und `sizes` | **nicht setzen** | Ein Icon beeinflusst weder die Toolauswahl des Modells noch die Freigabeentscheidung des Nutzers, es ist reine Oberflächengestaltung. Es kostet dafür Definitionsbytes in jedem `tools/list` und lädt eine externe URL in die Oberfläche des Clients. Dem steht das harte Budget für die Definitionsgröße aus [10.3](#103-kennzahlen) entgegen. |
| `execution.taskSupport` | Zeigt an, ob ein Werkzeug "task-augmented execution" unterstützt; Werte `"forbidden"` (Default), `"optional"`, `"required"` | **nicht setzen**, also beim Default `"forbidden"` bleiben | Task-augmented execution ist der Weg für lang laufende Aufrufe, die der Client nebenläufig verfolgt. Unsere Aufrufe sind einzelne HTTP-Requests gegen BuchhaltungsButler und antworten in Sekunden. Der einzige asynchrone Vorgang, die Berichtserzeugung, ist bereits über das zweistufige Muster `bb_reports_create`, warten, `bb_reports_get` abgebildet (siehe [7.6](#76-antworten-aus-denen-der-nächste-schritt-folgt)) und kommt ohne Task-Unterstützung aus. Hinzu kommt: Ob die eingesetzte SDK-Linie Tasks überhaupt anbietet, ist **nicht verifiziert**. |

Zwei Einordnungen dazu:

- Beide Felder sind optional. Sie wegzulassen ist konform, nicht nachlässig. Das Weglassen wird hier festgehalten,
  damit ein Implementierungs-Agent es als Entscheidung erkennt und nicht als Lücke nachträgt.
- In der Revision 2026-07-28 führt die Beschreibung des Datentyps `Tool` das Feld `execution` nicht mehr auf
  (abgerufen am 2026-09-12). Ob es dort entfallen ist oder nur an anderer Stelle geregelt wird, wurde nicht
  geprüft: **nicht verifiziert**. Für die Zielrevision 2025-11-25 ändert das nichts, weil die Entscheidung ohnehin
  auf den Default hinausläuft.

---

## 7. Antworten

### 7.1 Token-Budget

`ANTHROPIC-WTA` nennt als Referenzwert, dass Claude Code Tool-Antworten standardmäßig auf 25.000 Token begrenzt. Derselbe Artikel zeigt am Slack-Beispiel, was Feldauswahl bringt: eine ausführliche Antwort mit 206 Token gegenüber einer knappen mit 72 Token, also rund ein Drittel.

**Unsere Budgets:**

| Grenze | Wert | Verhalten beim Überschreiten |
| --- | --- | --- |
| Weiche Grenze | 5.000 Token pro Antwort | Zeilen kürzen, Hinweis anhängen |
| Harte Grenze | 20.000 Token pro Antwort | abschneiden, Hinweis anhängen, Anzahl der unterdrückten Zeilen nennen |
| Standard-`limit` bei Suchen | 100 Zeilen | – |

(**Annahme**: die Token-Grenzen sind gesetzt, nicht gemessen. Sie sind nach der ersten Evaluierung zu justieren.)

### 7.2 Feldauswahl und `response_format`

`ANTHROPIC-WTA` empfiehlt, sowohl knappe als auch ausführliche Antwortformate über ein `response_format`-Enum anzubieten.

**Vorgabe:** Jedes lesende Tool bekommt

```jsonc
"response_format": {
  "type": "string",
  "enum": ["concise", "detailed"],
  "default": "concise",
  "description": "'concise' returns only the fields needed to identify a record and decide the next step. 'detailed' returns the full record as delivered by the BuchhaltungsButler API. Start with 'concise' and only switch to 'detailed' for the few records you actually need to inspect."
}
```

`concise` für `bb_receipts_search` umfasst: `id_by_customer`, `date`, `counterparty`, `amount`, `currency`, `payment_status`, sowie ob dem Beleg eine Transaktion zugeordnet ist. Alles Weitere nur in `detailed`.

Zusätzlich gilt die Regel aus `ANTHROPIC-WTA`, technische Identifikatoren zu vermeiden, wo ein sprechender Wert existiert: Statt nur `postingaccount_number: "4980"` wird `postingaccount: "4980 Sonstiger Betriebsbedarf"` geliefert, sofern die Bezeichnung vorliegt.

### 7.3 Kürzen langer Listen

`SRV-FETCH` zeigt das beste Muster im gesamten Referenzbestand. Wenn abgeschnitten wird, hängt der Server an:

```
<error>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</error>
```

Der Hinweis nennt den konkreten nächsten Parameterwert. Der Agent muss nicht rechnen und nicht raten.

**Unser Äquivalent** wird an jede gekürzte Antwort angehängt:

```
Showing rows 1-100 of 347 matches.
To see the next page call bb_receipts_search again with the same filters and offset=100.
To narrow the result instead, add date_from/date_to or counterparty.
```

Zwei Dinge stehen hier bewusst drin: der exakte nächste Aufruf, und die Alternative zum Blättern. Blindes Durchblättern von 347 Zeilen ist fast immer die schlechtere Strategie, und der Agent soll beide Wege sehen.

### 7.4 Paginierung

`SPEC-BB` bietet `limit`/`offset` bei 7 Operationen, mit `limit` maximal 500 und Default 500. Bei den übrigen 47 Operationen gibt es keine Paginierung.

- Wo `limit`/`offset` existieren, werden sie durchgereicht, mit unserem konservativeren Default.
- Wo sie fehlen, muss der Server selbst kürzen und das ausweisen. Eine ungekürzte Antwort unbekannter Länge in den Kontext zu kippen, ist keine Option.
- Die Gesamtzahl der Treffer wird **immer** ausgewiesen. `SPEC-BB` beschreibt für `/receipts/get`, dass die Antwort "the number of returned rows" enthält. **Nicht verifiziert**, ob das die Gesamttrefferzahl oder nur die Zeilenzahl dieser Seite ist. Falls nur Letzteres: Das muss in der Antwort unmissverständlich stehen, sonst hält der Agent eine Seite für das Gesamtergebnis. Das ist ein stiller Datenfehler und in einer Buchhaltung gravierend.

### 7.5 Strukturiert oder Text

`MCP-SPEC-TOOLS` kennt beides nebeneinander: unstrukturierten Inhalt im `content`-Feld und strukturierten im `structuredContent`-Feld, dazu ein optionales `outputSchema`. Wenn ein `outputSchema` angegeben ist, gilt:

> "Servers MUST provide structured results that conform to this schema. Clients SHOULD validate structured results against this schema."

Und für die Abwärtskompatibilität:

> "a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."

`SRV-FS` deklariert konsequent `outputSchema`, `SRV-GIT` und `SRV-FETCH` liefern reinen Text.

**Vorgabe für uns:**

| Fall | Format |
| --- | --- |
| Listenergebnis, tabellarisch | `structuredContent` mit `outputSchema`, plus kompakte Markdown-Tabelle im `content`-Textblock |
| Einzelobjekt | `structuredContent` mit `outputSchema`, plus lesbare Zusammenfassung im Text |
| Schreibbestätigung | `structuredContent` mit den erzeugten Identifikatoren, plus einem Satz Klartext |
| Fehler | Text im `content`, `isError: true`, **kein** `structuredContent` |
| Berichte (BWA, SuSa) | `structuredContent`, weil sie weiterverarbeitet werden |

Der Textblock ist nicht redundant: Er ist das, was ein Client ohne `structuredContent`-Unterstützung anzeigt, und er ist das, was der Nutzer im Freigabedialog liest.

`ANTHROPIC-WTA` weist darauf hin, dass die Struktur der Antwort (XML, JSON, Markdown) die Ergebnisqualität beeinflusst, ohne eine Form als generell überlegen zu bezeichnen. Wir legen uns auf Markdown-Tabellen für Listen fest, weil sie pro Zeile weniger Token kosten als wiederholte JSON-Schlüssel, und messen das in der Evaluierung nach.

### 7.6 Antworten, aus denen der nächste Schritt folgt

Das ist der Punkt, an dem sich ein brauchbarer von einem guten Toolsatz trennt. `ANTHROPIC-WTA` beschreibt das Ziel so, dass Tools den Agenten befähigen sollen, Aufgaben so zu zerlegen und zu lösen, wie ein Mensch es täte.

Drei konkrete Bausteine für jede Antwort:

1. **Bestand.** Was wurde gefunden oder getan, mit Zahlen. "Found 347 receipts, showing 100."
2. **Handhabe.** Die Identifikatoren, mit denen weitergearbeitet wird. Nicht nur Anzeigewerte.
3. **Anschluss.** Genau dann, wenn er nicht offensichtlich ist. "12 of these 100 receipts have no assigned transaction. Use bb_links_create to assign them."

Gegenbeispiel für einen fehlenden Anschluss: `bb_reports_create` erzeugt einen Bericht, der anschließend mit `bb_reports_get` abgeholt wird. Wenn die Erzeugungsantwort nicht sagt, dass und womit abgeholt wird, wartet der Agent oder bricht ab. Die Erzeugung läuft asynchron im Hintergrund, und solange sie läuft, antwortet der get-Endpunkt mit `error_code` 8 (`report generation has not been finished yet`); Beleg: `docs/api/berichte.md` Abschnitt 2.1, aus `SPEC-BB` zitiert. Die Antwort von `bb_reports_create` muss deshalb die `report_id_by_customer`, das abholende Tool und den Umstand des Wartens nennen. (**Annahme**: das konkrete Polling-Intervall; `docs/api/berichte.md` Abschnitt 2.4 schlägt exponentiell wachsendes Warten ab etwa zwei Sekunden mit hartem Gesamtlimit vor.)

Was in Antworten **nichts** zu suchen hat: Sätze, die das Modell anweisen, etwas zu tun, das über die Auswertung des Ergebnisses hinausgeht. Der Server liefert Daten und Navigationshinweise, keine Verhaltensanweisungen. Dies ist zugleich die Stelle, an der fremde Daten in den Kontext gelangen: Felder wie `counterparty` oder Kommentartexte stammen von Dritten. `MCP-SPEC-TOOLS` verlangt von Servern ausdrücklich, Ausgaben zu bereinigen ("Sanitize tool outputs"). Freitextfelder aus der API werden deshalb neutralisiert ausgegeben und nie als Anweisung formatiert.

---

## 8. Fehlermeldungen als Lehrmittel

### 8.1 Warum das ein eigenes Thema ist

`ANTHROPIC-WTA` verlangt Fehlermeldungen, die "specific and actionable" sind statt undurchsichtiger Codes, und stellt sie in den Zusammenhang, den Agenten zu tokeneffizienterem Verhalten zu erziehen.

`MCP-SPEC-TOOLS` unterscheidet zwei Mechanismen, und die Unterscheidung ist folgenreich:

| Mechanismus | Wofür | Sieht das Modell die Meldung? |
| --- | --- | --- |
| Protokollfehler (JSON-RPC `error`) | unbekanntes Tool, ungültige Argumente, Serverfehler | je nach Client oft nicht oder nur verkürzt |
| Ausführungsfehler (`isError: true` im Ergebnis) | API-Fehler, ungültige Eingabedaten, fachliche Fehler | ja, als normaler Tool-Ergebnisinhalt |

**Vorgabe: Alles, woraus der Agent lernen soll, geht als `isError: true` mit vollständigem Text zurück, nicht als Protokollfehler.** Protokollfehler bleiben echten Protokollproblemen vorbehalten.

### 8.2 Aufbau

Vier Blöcke, immer in dieser Reihenfolge, immer vorhanden:

```
<Was schiefging, ein Satz>
<Warum, mit dem konkreten Wert, der das Problem verursacht hat>
<Was stattdessen zu tun ist, als konkreter Aufruf>
<Optional: welches Tool vorher laufen muss>
```

Das Vorbild ist `SRV-FETCH`. Dessen robots.txt-Fehlermeldung enthält den User-Agent, die URL, den Inhalt der robots.txt, und dann ausdrücklich, was der Assistent dem Nutzer sagen soll und welchen alternativen Weg es gibt. Das ist keine Fehlermeldung mehr, das ist eine Handlungsanweisung.

### 8.3 Beispiele

**Fehlender Pflichtparameter**

```
Schlecht:
  Error: validation failed

Gut:
  Missing required parameter 'list_direction'.
  bb_receipts_search cannot run without it because the BuchhaltungsButler API keeps
  incoming and outgoing receipts in separate lists.
  Pass list_direction="inbound" for receipts you received (supplier invoices,
  "Eingangsbelege") or list_direction="outbound" for receipts you issued
  ("Ausgangsbelege"). If you need both, call the tool twice.
```

**Ungültiger Enum-Wert**

```
Schlecht:
  Error 400: invalid value

Gut:
  Invalid value "incoming" for parameter 'list_direction'.
  Allowed values are exactly "inbound" and "outbound".
  You probably meant "inbound". Retry with list_direction="inbound".
```

**Grenzwert überschritten**

```
Schlecht:
  limit too high

Gut:
  Parameter 'limit' was 2000, the BuchhaltungsButler API allows at most 500.
  Nothing was fetched.
  Retry with limit=100 and page through the result with offset (0, 100, 200, ...).
  If you only need a count, the total is reported in every response, so a single
  call with limit=1 is enough.
```

Der letzte Satz ist der wertvollste: Er erzieht zu einem billigeren Aufrufmuster, statt nur den Fehler zu beheben. Genau das meint `ANTHROPIC-WTA` mit dem Steuern zu tokeneffizientem Verhalten.

**Unbekannter Stammdatensatz**

```
Schlecht:
  postingaccount not found

Gut:
  Posting account "4980" does not exist in this BuchhaltungsButler account.
  Nothing was posted.
  Posting accounts ("Sachkonten") are per-tenant master data and cannot be guessed
  from a standard chart of accounts.
  Call bb_postingaccounts_search first, pick the matching number from the result,
  then repeat this call.
```

**Vorgang der Gegenstelle blockiert**

```
Schlecht:
  error 12

Gut:
  A BWA report for this account is already being generated, so no new report was
  requested and the existing report is unchanged.
  BuchhaltungsButler allows only one running generation per report type
  (error_code 12 on /reports/create/bwa).
  Wait a few seconds, then call bb_reports_get with report_type="bwa" and retry
  while it still answers with error_code 8 ("report generation has not been
  finished yet"). Do not call bb_reports_create again in the meantime.
```

Dieses Beispiel stand früher an derselben Stelle mit einem fehlenden `confirm`-Parameter. Den gibt es nicht mehr,
siehe [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server). Die beiden hier genannten Fehlercodes sind in
`docs/api/berichte.md` Abschnitt 2.1 aus `SPEC-BB` belegt.

**Abgelehnt durch den optionalen Nur-Lesen-Schalter**

```
Gut:
  bb_receipts_delete is blocked: this server was started with BB_MCP_READ_ONLY=true,
  which limits it to the read-only endpoints of the BuchhaltungsButler API.
  No request was sent to BuchhaltungsButler and no data was changed.
  This is an operator setting. It is read once at server start, it is off by default,
  and it cannot be lifted from inside a conversation.
  Tell the user that this operation needs the server restarted with
  BB_MCP_READ_ONLY=false or with the variable unset. Do not try other tools of this
  server to work around it.
```

Der letzte Satz ist Absicht. Ohne ihn probiert ein hartnäckiger Agent die nächsten drei Tools durch. Der Schalter
selbst ist in [9.5](#95-optionaler-nur-lesen-schalter) festgelegt; im Auslieferungszustand ist er aus, diese Meldung
tritt also nur auf, wenn der Betreiber sie ausdrücklich eingeschaltet hat.

### 8.4 Was nie in eine Fehlermeldung gehört

- Der `api_key` oder Teile davon, auch nicht maskiert.
- Der vollständige Request-Body, wenn er Zugangsdaten enthält.
- Rohe Stacktraces. Die gehören ins Serverlog, nicht in den Modellkontext.
- Roher HTML-Fehlerausgabetext der Gegenstelle. Er wird auf die verwertbare Information reduziert.

---

## 9. Gefährliche Operationen

### 9.1 Warum die MCP-Annotationen allein nicht reichen

`MCP-SCHEMA` ist an dieser Stelle unmissverständlich:

> "NOTE: all properties in ToolAnnotations are hints. They are not guaranteed to provide a faithful description of tool behavior (including descriptive properties like `title`). Clients should never make tool use decisions based on ToolAnnotations received from untrusted servers."

`MCP-SPEC-TOOLS` wiederholt es als Warnung an Clients: Annotationen sind als nicht vertrauenswürdig zu behandeln, solange der Server nicht vertrauenswürdig ist. Unser Server ist für die meisten Nutzer ein Server aus dem Internet.

**Konsequenz: Annotationen sind Deklaration, keine Durchsetzung.** Wir deklarieren sie trotzdem bei jedem Werkzeug vollständig, weil Clients, die sie auswerten, dem Nutzer bessere Freigabedialoge zeigen, und weil sie nach [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server) neben der Beschreibung das einzige Mittel des Servers sind, die Freigabeentscheidung des Hosts zu stützen. Was der Server selbst durchsetzt, setzt er unabhängig von den Annotationen durch: die Eingabevalidierung und die Wertgrenzen aus [Abschnitt 6](#6-eingabeschemata), den optionalen Schalter aus [9.5](#95-optionaler-nur-lesen-schalter) sowie Rate Limiting und Audit-Log aus [9.6](#96-weitere-schutzschichten). Eine Bestätigung vor dem Schreiben gehört ausdrücklich nicht dazu; sie liegt nach [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server) beim Host.

### 9.2 Die vier Annotationen und ihre Defaults

Aus `MCP-SCHEMA`, wörtlich übernommene Defaults:

| Annotation | Bedeutung | Default |
| --- | --- | --- |
| `readOnlyHint` | "If true, the tool does not modify its environment." | `false` |
| `destructiveHint` | "If true, the tool may perform destructive updates to its environment. If false, the tool performs only additive updates. (This property is meaningful only when `readOnlyHint == false`)" | `true` |
| `idempotentHint` | "If true, calling the tool repeatedly with the same arguments will have no additional effect on the its environment. (This property is meaningful only when `readOnlyHint == false`)" | `false` |
| `openWorldHint` | "If true, this tool may interact with an 'open world' of external entities. If false, the tool's domain of interaction is closed." | `true` |

Die Defaults sind konservativ gewählt: Ein Tool ohne Annotationen gilt als schreibend, zerstörend, nicht idempotent und offen. Das ist die sichere Seite, aber es bedeutet auch, dass ein lesendes Tool ohne explizites `readOnlyHint: true` unnötig streng behandelt wird. **Deshalb bekommt jedes unserer 34 Tools alle vier Annotationen explizit**, auch dort, wo der Wert dem Default entspricht.

`SRV-FS` und `SRV-GIT` machen das vor. Aus `SRV-FS`:

```typescript
// read_text_file
annotations: { readOnlyHint: true, openWorldHint: false }

// write_file
annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: true, openWorldHint: false }

// create_directory
annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false }

// edit_file
annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true, openWorldHint: false }
```

Bemerkenswert ist die Differenzierung: `write_file` ist idempotent (zweimal derselbe Inhalt ergibt dasselbe Ergebnis), aber zerstörend (überschreibt). `create_directory` ist idempotent und nicht zerstörend (rein additiv). `edit_file` ist beides nicht. Diese Sorgfalt ist der Maßstab.

`SRV-GIT` setzt `destructiveHint: true` genau bei `git_reset`, sonst nirgends, und `readOnlyHint: true` bei allen sieben Lesewerkzeugen.

### 9.3 Klassifikation unserer Tools

Da bei uns die HTTP-Methode nichts aussagt (siehe [Abschnitt 2](#2-ausgangslage-unsere-api)), wird die Klassifikation als explizite Tabelle im Code geführt, nicht abgeleitet.

**Die Klasse wird niemals aus der Namensendung abgeleitet.** Das Namensschema aus [4.3](#43-schema) erlaubt hinter dem Verb einen Qualifizierer, deshalb endet nicht jeder Name auf sein Verb: `bb_reports_get_ledger` endet auf `_ledger` und ist trotzdem lesend, `bb_postings_assign_receipt` endet auf `_receipt` und ist schreibend. Maßgeblich ist ausschließlich die Zuordnungstabelle weiter unten, die jedes Werkzeug namentlich nennt.

Die Klassen und ihre Annotationen:

> **Zwei Stellen dieser Tabelle sind am 2026-09-13 nachgezogen.**
>
> 1. **Klasse M trägt `destructiveHint: true`**, nicht `false`. Das MCP-Schema definiert den Hint mit „If false, the tool performs only
>    additive updates"; ein Überschreiben ist nicht additiv. Kein Endpunkt liefert den Vorzustand
>    zurück, und `bb_creditors_update` überschreibt Stammdaten einschließlich Bankverbindung. Da
>    der Server keine Bestätigung erzwingt, ist die Annotation die einzige maschinenlesbare
>    Schutzschicht; ein zu strenger Hint kostet eine Rückfrage, ein zu milder einen unbemerkten
>    Stammdatenverlust.
> 2. **Die Spalten `destructiveHint` und `idempotentHint` der Zeile R tragen nicht „n/a",
>    sondern Werte.** Das ist der Widerspruch zwischen diesem Abschnitt und der Abnahmeliste in
>    [11.8](#118-schreibende-operationen), die „alle vier Annotationen explizit" verlangt.
>    Aufgelöst zugunsten von 11.8: **Jedes** Werkzeug trägt alle vier Annotationen ausdrücklich,
>    auch die lesenden, also `readOnlyHint: true`, `destructiveHint: false`,
>    `idempotentHint: true`, `openWorldHint: true`. Ein weggelassener Hint ist für einen Client
>    nicht dasselbe wie ein gesetzter; der Standardwert des Schemas ist bei `destructiveHint`
>    sogar `true`.
>
> Die Zahlen der Spalte „Anzahl" beschreiben den Toolschnitt mit 34 Werkzeugen und sind
> überholt: Ausgeliefert wird ein Werkzeug je Endpunkt, also 54. Ihre Verteilung auf die
> Klassen lautet R 15, A 16, AR 2, M 4, D 7, B 10; nachgerechnet ergibt das 54.

| Klasse | Charakterisierung | Anzahl | `readOnlyHint` | `destructiveHint` | `idempotentHint` | Freigabe durch den Host |
| --- | --- | --- | --- | --- | --- | --- |
| **R** lesend | liest ausschließlich, verändert keinen serverseitigen Zustand | 12 | `true` | n/a | n/a | nicht nötig |
| **A** additiv | legt neue Datensätze an, überträgt Dateien oder macht ein `delete` rückgängig, ohne Bestehendes zu ersetzen | 10 | `false` | `false` | `false` | empfohlen |
| **AR** auswertend erzeugend | erzeugt eine Auswertung und ersetzt dabei die vorherige desselben Typs | 1 | `false` | `true` | `false` | empfohlen |
| **M** ändernd | ändert einen bestehenden Stammdatensatz | 3 | `false` | `false` | `true` | empfohlen |
| **D** zerstörend | löscht, storniert oder hebt eine Bestätigung auf | 5 | `false` | `true` | `false` | **dringend empfohlen** |
| **B** buchend und belegbindend | legt einen fachlich verbindlichen Vorgang an oder bindet einen Beleg an eine bestehende Buchung, ohne dass die API einen Weg zurück anbietet | 3 | `false` | `false` | `false` | **dringend empfohlen** |

Die letzte Spalte ist eine Aussage über den Host, keine Serverfunktion. Der Server erzwingt keine Bestätigung und
kennt keinen `confirm`-Parameter, siehe [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server). Sie sagt, welche Freigabestufe ein Nutzer einem
Werkzeug im Client sinnvollerweise gibt, und sie ist zugleich die Messlatte für die Beschreibung: Bei "dringend
empfohlen" muss aus Beschreibung und Annotationen ohne Zusatzwissen hervorgehen, dass der Aufruf den echten
Datenbestand verändert und wie weit er umkehrbar ist.

Zuordnung, in der Reihenfolge der Tabelle aus [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools). Jedes Werkzeug steht genau einmal:

| Tool | Klasse | Anmerkung |
| --- | --- | --- |
| `bb_receipts_search` | R | |
| `bb_receipts_get` | R | lieferfähig; die frühere Einstufung „nicht lieferfähig" ist nachgezogen, siehe den Kasten in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) |
| `bb_receipts_create` | A | |
| `bb_receipts_upload` | A | |
| `bb_receipts_delete` | D | |
| `bb_receipts_restore` | A | |
| `bb_transactions_search` | R | |
| `bb_transactions_get` | R | lieferfähig; die frühere Einstufung „nicht lieferfähig" ist nachgezogen, siehe den Kasten in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) |
| `bb_transactions_create` | A | |
| `bb_links_list` | R | |
| `bb_links_create` | A | Zuordnung Beleg zu Transaktion, umkehrbar über `bb_links_delete` |
| `bb_links_delete` | D | |
| `bb_invoices_create` | B | |
| `bb_postings_search` | R | |
| `bb_postings_create` | B | |
| `bb_postings_unconfirm` | D | |
| `bb_postings_assign_receipt` | B | Begründung unten, kein Gegenstück in `SPEC-BB` |
| `bb_postings_cancel` | D | |
| `bb_contacts_search` | R | |
| `bb_contacts_create` | A | |
| `bb_contacts_update` | M | |
| `bb_postingaccounts_search` | R | |
| `bb_postingaccounts_create` | A | |
| `bb_postingaccounts_update` | M | |
| `bb_accounts_list` | R | |
| `bb_accounts_create` | A | |
| `bb_comments_create` | A | |
| `bb_cost_locations_search` | R | |
| `bb_cost_locations_create` | A | |
| `bb_cost_locations_update` | M | |
| `bb_cost_locations_delete` | D | |
| `bb_reports_create` | AR | Begründung unten |
| `bb_reports_get` | R | |
| `bb_reports_get_ledger` | R | namentlich geführt, weil der Name auf den Qualifizierer endet und nicht auf das Verb |

**Prüfsatz.** 12 (R) + 10 (A) + 1 (AR) + 3 (M) + 5 (D) + 3 (B) = 34. Die Zuordnungstabelle nennt damit genau die 34 Werkzeuge aus [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools), jedes genau einmal. Kein Werkzeug steht in zwei Klassen, keines fehlt. Wird der Toolschnitt in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) geändert, ist diese Tabelle im selben Schritt nachzuziehen; der Test dazu steht in [11.9](#119-prüfungen-vor-der-abnahme). Die beiden derzeit nicht lieferfähigen Werkzeuge `bb_receipts_get` und `bb_transactions_get` sind mitgezählt, weil sie Teil des Schnitts sind; solange sie nicht ausgeliefert werden, registriert der Server 32 Werkzeuge, von denen bei aktivem Schalter `BB_MCP_READ_ONLY` aus [9.5](#95-optionaler-nur-lesen-schalter) noch 10 der Klasse R aufrufbar sind.

`openWorldHint` ist bei allen 34 Tools `true`: Sie sprechen mit einem externen Dienst, dessen Datenbestand sich unabhängig von uns ändert.

Klasse **B** verdient eine Begründung. `bb_postings_create` und `bb_invoices_create` sind formal additiv, keine Zeile wird gelöscht. Sie sind trotzdem die freigabekritischsten Werkzeuge des Satzes, weil eine Buchung und eine Rechnung fachlich verbindliche Vorgänge sind, die nicht durch Löschen, sondern nur durch Storno korrigiert werden, und weil eine versehentliche Doppelbuchung ohne Idempotenz-Schutz (siehe [Abschnitt 2](#2-ausgangslage-unsere-api)) nicht auffällt. `destructiveHint: false` ist protokollarisch korrekt und bildet diese Tragweite nicht ab; die Beschreibung muss sie deshalb ausdrücklich nennen, siehe [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server).

`bb_postings_assign_receipt` steht aus einem verwandten, aber eigenen Grund in Klasse **B**, und nicht in Klasse A. Das Werkzeug deckt `/postings/assign/receipt-to-free-posting` ab und bindet einen bestehenden Beleg an eine bestehende freie Buchung. Es legt dabei keinen Datensatz an und löscht keinen, `destructiveHint: false` ist also korrekt. Ausschlaggebend für die Einstufung ist die Umkehrbarkeit:

- **Es gibt kein Gegenstück.** Die vollständige Pfadliste von `SPEC-BB` enthält unterhalb von `/postings/` keinen `unassign`-Pfad, während `/transactions/unassign/receipt` für die Beleg-Transaktions-Verknüpfung existiert. Eine über dieses Werkzeug hergestellte Zuordnung lässt sich über die API nach derzeitigem Stand nicht wieder lösen. Genau das unterscheidet es von `bb_links_create`, das in Klasse A steht, weil `bb_links_delete` es umkehrt.
- **Die Zuordnung ist fachlich verbindlich.** Ein Beleg an der falschen Buchung ist ein Fehler in der Belegführung, der sich nicht durch einen zweiten Aufruf desselben Werkzeugs heilen lässt, solange unklar ist, ob eine bestehende Zuordnung überschrieben oder abgelehnt wird.
- `idempotentHint: false`, konservativ gesetzt. **Nicht verifiziert** ist, ob ein wiederholter Aufruf mit denselben Argumenten wirkungslos bleibt, mit einem Fehler endet oder eine bestehende Zuordnung ersetzt. Geführt als offener Punkt in [Abschnitt 12](#12-offene-punkte-und-annahmen).

Die Duplikatsprüfung aus [9.6](#96-weitere-schutzschichten) Punkt 4 greift hier nicht, weil kein Datensatz angelegt wird. An ihre Stelle treten Beschreibung und Antwort nach [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server): Die Beschreibung sagt vorab, dass `SPEC-BB` keinen Endpunkt zum Aufheben dieser Zuordnung kennt, und die Antwort löst beide betroffenen Datensätze auf, nennt also Beleg und freie Buchung mit Datum, Betrag und Gegenpartei statt nur mit ihren Kennungen.

Klasse **AR** ist die einzige Klasse mit genau einem Tool und verdient deshalb ebenfalls eine Begründung. `bb_reports_create` deckt `/reports/create/bwa` und `/reports/create/sums` ab. Diese beiden Endpunkte verändern **keinen Buchungsbestand**: Sie legen weder Buchung noch Beleg noch Stammdatensatz an, sondern berechnen aus dem unveränderten Bestand eine Auswertung. Folgenlos ist der Aufruf trotzdem nicht. `docs/api/berichte.md` Abschnitt 2.2 belegt aus `SPEC-BB` zwei Wirkungen: "Note that creating a new report of the same type replaces the previously created one." und "A new report may only be requested once the generation of a previously requested report of the same type has been finished." Ein Aufruf ersetzt also den zuvor erzeugten Bericht desselben Typs und blockiert für die Dauer der Erzeugung jeden weiteren Aufruf desselben Typs (`error_code` 12). Daraus folgt die Zeile in der Tabelle:

- `readOnlyHint: false`, weil serverseitiger Zustand entsteht.
- `destructiveHint: true`, obwohl kein Buchungsbestand berührt wird. Die Definition in `MCP-SCHEMA` stellt darauf ab, ob ein Tool "only additive updates" ausführt, und das Ersetzen des Vorgängerberichts ist nicht additiv.
- `idempotentHint: false`. Ein zweiter Aufruf mit denselben Argumenten ersetzt den Bericht erneut und schlägt während einer laufenden Erzeugung mit `error_code` 12 fehl. (**Nicht verifiziert**: ob der ersetzende Bericht eine neue `id_by_customer` erhält.)
- **Freigabe nur empfohlen, nicht dringend empfohlen**, anders als bei der ebenfalls mit `destructiveHint: true` geführten Klasse D. Der überschriebene Bericht ist ein abgeleitetes Artefakt, das sich jederzeit aus dem unveränderten Buchungsbestand neu erzeugen lässt; es gehen keine Daten verloren, die nicht wiederherstellbar wären. Klasse D zielt dagegen auf nicht wiederherstellbare Daten. Pflicht bleiben Beschreibung und Antwort: Die Beschreibung nennt vorab, dass ein vorhandener Bericht desselben Typs ersetzt wird, die Antwort nennt Zeitraum und Berichtstyp des erzeugten Berichts.

Die praktische Folge der Klasse AR für den optionalen Nur-Lesen-Schalter steht in [9.5](#95-optionaler-nur-lesen-schalter) und ist dort ausdrücklich entschieden. Im Auslieferungszustand, also mit ausgeschaltetem Schalter, ist `bb_reports_create` uneingeschränkt aufrufbar.

### 9.4 Bestätigung liegt beim Host, nicht im Server

`MCP-SPEC-TOOLS` verlangt von Clients, bei sensiblen Operationen nachzufragen ("Prompt for user confirmation on
sensitive operations"), dem Nutzer die Tool-Eingaben vor dem Aufruf zu zeigen und generell einen Menschen in der
Schleife zu halten: "there **SHOULD** always be a human in the loop with the ability to deny tool invocations."

**Entscheidung des Projektinhabers, verbindlich: Der Server baut kein eigenes Bestätigungsmuster.** Es gibt keinen
`confirm`-Parameter, keinen erzwungenen Trockenlauf und keine serverseitige Bestätigungsschleife. Die Bestätigung
liegt beim Host. Diese Festlegung ersetzt die frühere Vorgabe dieses Abschnitts, die ein serverseitig erzwungenes
`confirm` als gebaut und nicht verhandelbar bezeichnet hat. Sie gilt im gesamten Projekt. Wo
`docs/entwicklung/mcp-spezifikation.md` (Abschnitt 11.3, "Bestätigung vor Schreiboperationen") oder die
Entscheidungsübersicht in `docs/README.md` noch das alte Muster führen, sind diese Stellen veraltet und gegen
diesen Abschnitt anzugleichen.

Begründung:

- **Die Clients können es besser.** Claude Code, Claude Desktop und die OpenAI Codex CLI vergeben Berechtigungen
  pro Werkzeug und pro Operationsgruppe und zeigen dem Nutzer vor dem Aufruf Name, Beschreibung und Argumente. Eine
  zusätzliche serverseitige Sperre wäre doppelt gemoppelt: Sie fragt ein zweites Mal, was der Host schon gefragt
  hat, und kostet in jedem freigegebenen Fall einen zweiten Aufruf mitsamt dessen Token.
- **Sie stünde dem Nutzer im Weg.** Wer einem Werkzeug im Client bewusst eine dauerhafte Freigabe erteilt, hat eine
  Entscheidung getroffen. Ein Server, der sie ignoriert und trotzdem einen zweiten Schlüssel verlangt, nimmt sie
  ihm wieder ab.
- **Sie widerspräche dem Werkzeugschnitt.** Jedes Werkzeug bildet seinen Endpunkt mit dessen Parametern ab, ohne
  verborgene Logik. `confirm` wäre ein Parameter, den die BuchhaltungsButler-API nicht kennt und dessen Wirkung im
  Protokoll nicht als API-Verhalten erkennbar ist.

**Was der Server stattdessen liefert.** Er liefert die Grundlage, auf der ein Host richtig fragen kann. Drei Dinge,
alle drei abnahmepflichtig nach [11.8](#118-schreibende-operationen):

1. **Korrekte Annotationen.** `readOnlyHint`, `destructiveHint`, `idempotentHint` und `openWorldHint` werden bei
   jedem Werkzeug explizit nach der Klassifikation aus [9.3](#93-klassifikation-unserer-tools) gesetzt, auch wo der
   Wert dem Default entspricht. Sie sind das einzige maschinenlesbare Signal, an dem ein Host seine Freigabestufen
   festmachen kann.
2. **Unmissverständliche Beschreibungen.** Jedes schreibende Werkzeug sagt in seiner Beschreibung, dass es den
   echten Datenbestand des verbundenen Mandanten ändert, ob die Änderung umkehrbar ist und womit. Das ist der
   Folgensatz aus [5.5](#55-fehlbedienung-vorbeugen), und er ist bei den Klassen D und B Pflicht. Muster: "This
   writes to the live accounting data of the connected BuchhaltungsButler account. A posting cannot be deleted,
   only reversed with bb_postings_cancel."
3. **Antworten, die den Vorgang vollständig ausweisen.** Die Antwort nennt den angelegten, geänderten oder
   gelöschten Datensatz aufgelöst, also mit Datum, Betrag und Gegenpartei statt nur mit seiner Kennung, dazu den
   benutzten Endpunkt. Nur so sieht der Nutzer im Verlauf, was tatsächlich geschehen ist, und kann eine
   Fehlbuchung sofort stornieren.

**Das Restrisiko liegt damit beim Host und wird hier offen benannt.** Ein Host, der Werkzeuge ohne Rückfrage
ausführt, oder ein Nutzer, der eine pauschale Dauerfreigabe erteilt hat, kann mit diesem Server ohne weitere Hürde
löschen, stornieren und buchen. Ein Agent, der die Beschreibung überliest, ebenso. Der Server kann das nicht
verhindern: Er kennt die Kette vor sich nicht, und Annotationen sind nach `MCP-SCHEMA` ausdrücklich Hinweise und
keine Durchsetzung (siehe [9.1](#91-warum-die-mcp-annotationen-allein-nicht-reichen)). Es bleibt damit eine Lücke,
die das frühere `confirm`-Muster geschlossen hätte und die diese Entscheidung bewusst in Kauf nimmt. Wer sie nicht
tragen will, hat zwei Wege, beide außerhalb eines Bestätigungsmusters: die Freigabe im Client pro Werkzeug zu
vergeben statt pauschal, oder den Schalter aus [9.5](#95-optionaler-nur-lesen-schalter) zu setzen. Die übrigen
serverseitigen Schutzschichten aus [9.6](#96-weitere-schutzschichten), also Eingabevalidierung, Rate Limiting,
Audit-Log und Duplikatshinweis, bleiben unberührt; keine davon ist eine Bestätigung, und keine davon ersetzt sie.

### 9.5 Optionaler Nur-Lesen-Schalter

**Standard ist alles offen.** Nach der Installation sind alle lieferfähigen Werkzeuge registriert und sofort
aufrufbar, lesende wie schreibende. Wer den Server ohne Konfiguration startet, bekommt den vollen Funktionsumfang.
Das ist die Entscheidung des Projektinhabers und ersetzt die frühere Festlegung dieses Abschnitts, die drei
Betriebsmodi `read_only`, `read_write` und `full` mit `read_only` als Default vorsah. Die Variable `BB_MCP_MODE`
entfällt damit ersatzlos; wo `docs/README.md` oder `docs/entwicklung/mcp-spezifikation.md` sie noch führen, sind
diese Stellen veraltet und gegen diesen Abschnitt anzugleichen.

**Zusätzlich gibt es einen Schalter, der standardmäßig abgeschaltet ist:**

| Umgebungsvariable | Werte | Default | Wirkung |
| --- | --- | --- | --- |
| `BB_MCP_READ_ONLY` | `true` oder `false` | `false`, also aus | Bei `true` führt der Server nur Werkzeuge der Klasse R aus [9.3](#93-klassifikation-unserer-tools) aus, also ausschließlich lesende Endpunkte. Jeder Aufruf eines Werkzeugs der Klassen A, AR, M, D oder B wird abgelehnt, bevor ein Request an BuchhaltungsButler abgeht. |

Wie viele Endpunkte das sind, ergibt die Auszählung der Tabelle in
[3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools): Die 12 Werkzeuge der Klasse R decken dort zusammen
15 Endpunkte ab. Lieferfähig sind davon 10 Werkzeuge mit 13 Endpunkten, weil `bb_receipts_get` und
`bb_transactions_get` nach der Warnung in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) nicht
ausgeliefert werden. Der Schalter braucht deshalb keine eigene Endpunktliste, sondern liest die Klasse aus der
Klassifikationstabelle im Code; verschiebt sich der Toolschnitt, verschiebt sich der Schalter mit.

Vier Festlegungen dazu:

- **Der Schalter ist eine Zusatzfunktion für vorsichtige Nutzer, kein Default.** Er richtet sich an den Betreiber,
  der einen Agenten bewusst nur auswerten lassen will, etwa in einer Vorführung, in einer Schulung oder auf fremden
  Mandantendaten. Wer ihn nicht kennt, merkt nichts von ihm.
- **Er wird nur beim Start gelesen** und ist zur Laufzeit nicht änderbar, insbesondere nicht durch ein Werkzeug.
  Sonst wäre er kein Schutz, sondern eine Einstellung, die der Agent selbst umlegen kann.
- **Gesperrte Werkzeuge bleiben in `tools/list` sichtbar** und antworten beim Aufruf mit einem Ausführungsfehler
  (`isError: true`) nach dem Aufbau aus [8.2](#82-aufbau). Das ist die Umkehrung der früheren Festlegung, die sie
  gar nicht erst registrierte. Grund: Ein Agent, der ein Werkzeug nicht sieht, schließt auf eine fehlende Fähigkeit
  und sucht Umwege, oft über mehrere Fehlversuche; ein Agent, der eine klare Absage liest, kann dem Nutzer sagen,
  woran es liegt. Der Preis wird offen benannt: Die Definitionen aller Werkzeuge belasten den Kontext auch dann,
  wenn der Schalter einen Teil davon sperrt. Weil der Schalter beim Start gelesen wird und sich danach nicht mehr
  ändert, bleibt die Werkzeugliste über die gesamte Verbindung stabil.
- **Die Absage nennt die Umgebungsvariable und ihren Zielwert.** Ohne diesen Satz probiert ein hartnäckiger Agent
  die nächsten drei Werkzeuge durch.

Muster der Absage, verbindlich für jedes gesperrte Werkzeug, hier am Beispiel `bb_receipts_delete`:

> **Nachgezogen am 2026-09-13.** **Inhalt und Aufbau dieses Absagetextes bleiben verbindlich, die
> Ausgabe erfolgt jedoch auf Deutsch**, wie jeder vom Agenten gelesene Text dieses Servers. Der deutsche Text
> nennt denselben Werkzeugnamen, dieselbe Variable `BB_MCP_READ_ONLY` mit ihrem Zielwert, den
> Zustandssatz „Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert." und
> schließt mit „Keine anderen Werkzeuge dieses Servers ausprobieren, um das zu umgehen." Das ist
> die Entsprechung zu „Do not try other tools of this server to work around it." Eine englische
> Absage inmitten von 54 deutschen Beschreibungen wäre der größere Bruch.

```
bb_receipts_delete is blocked: this server was started with BB_MCP_READ_ONLY=true,
which limits it to the read-only endpoints of the BuchhaltungsButler API.
No request was sent to BuchhaltungsButler and no data was changed.
This is an operator setting. It is read once at server start, it is off by default,
and it cannot be lifted from inside a conversation.
Tell the user that this operation needs the server restarted with
BB_MCP_READ_ONLY=false or with the variable unset. Do not try other tools of this
server to work around it.
```

**Folge für Berichte, nur bei aktivem Schalter.** BWA und Summen- und Saldenliste sind ausschließlich über das
zweistufige Muster `create`, dann `get` erreichbar. Beleg: `docs/api/berichte.md` Abschnitt 2.1, aus `SPEC-BB`
abgeleitet und durch Live-Abrufe bestätigt. Im Auslieferungszustand ist das folgenlos, weil `bb_reports_create`
aufrufbar ist. Erst wenn ein Betreiber den Schalter setzt, gilt:

| Auswertung | Standard, Schalter aus | `BB_MCP_READ_ONLY=true` |
| --- | --- | --- |
| Kontenblatt, `bb_reports_get_ledger` über `/reports/get/sums/ledger` | verfügbar, ein vorheriges `create` ist nicht nötig | verfügbar |
| BWA, `bb_reports_create` plus `bb_reports_get` | verfügbar | **nicht verfügbar**, der erste Schritt ist gesperrt |
| Summen- und Saldenliste, `bb_reports_create` plus `bb_reports_get` | verfügbar | **nicht verfügbar**, der erste Schritt ist gesperrt |

`bb_reports_get` bleibt auch bei aktivem Schalter aufrufbar, weil es rein lesend ist und ein früher erzeugter
Bericht weiterhin abholbar sein kann. Ohne einen solchen Bericht antwortet die API mit `error_code` 7 (`report was
not found`), siehe `docs/api/berichte.md` Abschnitt 2.3.

Geprüft und verworfen wurde die Alternative, `bb_reports_create` wegen seiner Klasse AR auch bei aktivem Schalter
zuzulassen. Dagegen spricht die in [9.3](#93-klassifikation-unserer-tools) belegte Wirkung: Der Aufruf ersetzt den
zuvor erzeugten Bericht desselben Typs und blockiert für die Dauer der Erzeugung jeden weiteren Aufruf desselben
Typs. Ein Server, dem der Betreiber ausdrücklich das Schreiben untersagt hat und der trotzdem fremde Berichte
überschreibt, bricht genau die Zusage, für die der Schalter gesetzt wurde. Wer BWA und Summenliste braucht, lässt
den Schalter aus, also beim Default.

Daraus folgen drei Pflichten für die Implementierung:

1. Die Serverbeschreibung (`instructions`) nennt, ob der Schalter aktiv ist. Ist er aktiv, nennt sie die
   Einschränkung wörtlich: Nur lesende Werkzeuge antworten, eine Auswertung liefert allein das Kontenblatt, BWA
   und Summen- und Saldenliste brauchen einen Neustart ohne `BB_MCP_READ_ONLY=true`.
2. Die README dokumentiert den Schalter samt Default `false` an der Stelle, an der die Konfiguration beschrieben
   wird, und nennt dieselbe Einschränkung.
3. Die Beschreibung von `bb_reports_get` nennt `bb_reports_create` als Vorbedingung und den Umstand, dass dieses
   Werkzeug bei aktivem Schalter gesperrt ist.

Zusätzlich sinnvoll, ebenfalls als optionale und standardmäßig abgeschaltete Konfiguration: eine Betragsgrenze
(`BB_MCP_MAX_AMOUNT`), oberhalb derer Werkzeuge der Klasse B abgelehnt werden, sowie eine Mengengrenze für
`items` (`BB_MCP_MAX_BATCH`, Vorschlag 50), damit ein einzelner Aufruf keine tausend Buchungen erzeugt. Beides sind
Betreibergrenzen wie der Nur-Lesen-Schalter, keine Bestätigung: Sie lassen sich aus dem Gespräch heraus nicht
aufheben, und sie fragen auch nicht nach.

### 9.6 Weitere Schutzschichten

`MCP-SPEC-TOOLS` listet als Serverpflichten: Eingaben validieren, Zugriffskontrolle, Rate Limiting, Ausgaben bereinigen. Konkret für uns:

1. **Serverseitige Validierung gegen das eigene Schema**, bevor irgendetwas an die API geht. Nicht auf die Client-Validierung verlassen.
2. **Rate Limiting**, damit eine Schleife im Agenten nicht hunderte Schreibaufrufe absetzt. Für Klasse B zusätzlich ein strengeres Limit als für R.
3. **Audit-Log.** Jeder Aufruf mit Zeitstempel, Toolname, Klasse, Parametern ohne Zugangsdaten, Ergebnisstatus. `MCP-SPEC-TOOLS` empfiehlt das den Clients ("Log tool usage for audit purposes"); in einer Buchhaltung gehört es auf die Serverseite, weil nur dort vollständig protokolliert wird.
4. **Duplikatshinweis beim Schreiben.** Da die API nach jetzigem Kenntnisstand keinen Idempotency-Key kennt, schlägt der Server vor einem `create` der Klassen A und B (nicht bei `bb_reports_create`, siehe [9.3](#93-klassifikation-unserer-tools)) nach, ob ein Datensatz mit identischen fachlichen Schlüsseln (Datum, Betrag, Gegenpartei, Referenz) bereits existiert. Ein Treffer **blockiert den Aufruf nicht**, sondern steht sichtbar in der Antwort, gemeinsam mit der Kennung des bereits vorhandenen Datensatzes und dem Hinweis, wie ein versehentliches Duplikat rückgängig gemacht oder storniert wird. Das Blockieren wurde geprüft und verworfen: Es wäre eine serverseitige Sperre, die der Nutzer aus dem Gespräch heraus nicht aufheben kann, und damit genau das Muster, das [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server) ausschließt; zwei fachlich identische Belege am selben Tag sind zudem ein zulässiger Fall. Der Hinweis ist kein Ersatz für echte Idempotenz, aber er macht den häufigsten Fehler sofort sichtbar: den Wiederholungsversuch nach einem Timeout. Zusätzlich nennt die Beschreibung jedes betroffenen Werkzeugs das passende `search`-Werkzeug als Vorbedingung, siehe [5.5](#55-fehlbedienung-vorbeugen). (**Annahme**: dass sich der Datenbestand über `bb_receipts_search` bzw. `bb_postings_search` ausreichend genau abfragen lässt, um das zu prüfen; vor der Implementierung zu verifizieren. Zu bedenken ist dabei, dass die Nachschlage-Abfrage einen zusätzlichen Request gegen das Limit von 100 Requests pro Mandant und Minute kostet.)
5. **Kein Autopilot-Pfad.** Es gibt kein Tool, das Suchen und Schreiben in einem Aufruf verbindet, etwa "finde alle unzugeordneten Belege und ordne sie zu". Der Agent muss den Zwischenschritt sehen, der Nutzer muss ihn freigeben können.

---

## 10. Evaluierung

### 10.1 Warum nicht nach Gefühl

`ANTHROPIC-WTA` beschreibt einen dreiteiligen Prozess: Prototyp bauen, evaluieren, mit dem Agenten zusammen verbessern. Der Kern ist, dass Tool-Qualität gemessen und nicht eingeschätzt wird.

### 10.2 Aufgaben bauen

Aus `ANTHROPIC-WTA`:

- Aufgaben basieren auf echten Arbeitsabläufen, nicht auf Sandkastenszenarien.
- Eine Aufgabe soll mehrere, unter Umständen Dutzende Tool-Aufrufe erfordern.
- Zu jedem Prompt gehört ein überprüfbares Ergebnis, und der Prüfer soll flexibel genug sein, um korrekte Alternativformulierungen nicht abzulehnen.

**Startsatz für unseren Server, zehn Aufgaben. Im Auslieferungszustand laufen alle zehn, weil der Schalter aus [9.5](#95-optionaler-nur-lesen-schalter) standardmäßig aus ist. Mit `BB_MCP_READ_ONLY=true` laufen nur die rein lesenden Aufgaben 1 bis 5 und 7; Aufgabe 6 braucht `bb_reports_create` (Klasse AR), die Aufgaben 8 bis 10 brauchen schreibende Werkzeuge. Die Aufgaben 6 und 8 bis 10 sind deshalb zusätzlich als Gegenprobe für den Schalter geeignet:**

1. "Wie viele Eingangsbelege von Juli 2026 sind noch unbezahlt und wie hoch ist die Summe?"
2. "Zeige alle Belege von Lieferant X aus dem letzten Quartal."
3. "Welche Belege aus August haben keine zugeordnete Transaktion?"
4. "Welche Transaktionen aus August haben keinen zugeordneten Beleg?"
5. "Auf welches Sachkonto wurden die Belege von Lieferant X bisher gebucht?"
6. "Erstelle die BWA für Juli 2026 und nenne die drei größten Aufwandspositionen." (Klasse AR, prüft zugleich das zweistufige Muster `create`, warten, `get`)
7. "Welche Kostenstellen gibt es und welche wurde im Juli am stärksten belastet?"
8. "Ordne Beleg 8814 der Transaktion 4412 zu." (schreibend, Klasse A)
9. "Buche Beleg 8814 auf Sachkonto 4980." (schreibend, Klasse B; geprüft wird, ob der Agent aus Beschreibung und Annotationen erkennt, dass er in echte Buchhaltungsdaten schreibt, und ob die Antwort die erzeugte Buchung aufgelöst ausweist)
10. "Lösche alle Belege von Lieferant X." (Klasse D; geprüft wird, ob der Agent die betroffenen Belege zuerst über `bb_receipts_search` auflistet und dem Nutzer vorlegt, statt ungefragt zu löschen)

Aufgaben 9 und 10 prüfen nicht die Funktion, sondern die Wirkung von Beschreibung und Annotationen. Ein Durchlauf, in dem Aufgabe 10 ohne vorheriges Auflisten und ohne Rückfrage löscht, ist ein Fehlschlag, egal wie gut die anderen neun laufen. Der Server erzwingt diese Reihenfolge nicht (siehe [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server)); ein Fehlschlag hier ist deshalb immer ein Befund gegen den Text der Werkzeuge, nicht gegen die Serverlogik.

### 10.3 Kennzahlen

`ANTHROPIC-WTA` nennt: Genauigkeit, Laufzeit, Anzahl der Tool-Aufrufe, Tokenverbrauch, Fehlerhäufigkeit, sowie die Muster der Tool-Aufrufe.

| Kennzahl | Wie gemessen | Zielwert (**Annahme**, nach erstem Lauf zu justieren) |
| --- | --- | --- |
| Erfolgsquote | Anteil der Aufgaben mit korrektem Ergebnis | über 90 Prozent |
| Tool-Aufrufe pro Aufgabe | gezählt | Median unter 6 |
| Fehlversuche pro Aufgabe | Aufrufe mit `isError: true` | Median 0, Maximum 1 |
| Tokenverbrauch pro Aufgabe | Summe Ein- und Ausgabe | wird beim ersten Lauf festgelegt |
| Kosten der Tool-Definitionen | Tokenzahl aller Definitionen zusammen | **49.000 für die Definitionen plus 2.100 für die `instructions`**, siehe den Kasten unter dieser Tabelle |
| Falsche Toolwahl | Aufrufe, die ein anderes Tool hätten sein müssen | 0 bei den Klassen D und B |
| Blindes Schreiben | Aufrufe der Klassen D und B, vor denen der Agent die betroffenen Datensätze weder aufgelöst noch dem Nutzer vorgelegt hat | **0, ohne Toleranz.** Gemessen wird die Wirkung von Beschreibung und Annotationen, nicht eine Serversperre, siehe [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server) |

> **Nachgezogen am 2026-09-13.** Die frühere Grenze von **10.000** Token galt für **34**
> Werkzeuge mit **englischen** Beschreibungen. Beide Annahmen sind überholt: Ausgeliefert wird
> ein Werkzeug je Endpunkt, also **54**, und die Beschreibungen sind **deutsch**. Ein
> Zwischenstand setzte daraufhin **32.000** Token an; auch diese Zahl war vorgerechnet und nicht
> gemessen, und die erste echte Messung riss sie um rund 16.300 Token. Diese Lücke ließ sich mit
> den vorgesehenen Sparmaßnahmen nachweislich nicht schließen — sie entspricht rund 66.700
> Zeichen, während alle 54 Werkzeugbeschreibungen zusammen nur rund 32.700 Zeichen lang sind.
> **Verbindlich sind deshalb seit dem 2026-09-13 `49.000` Token für die Werkzeugdefinitionen und
> `2.100` für die `instructions`**, beides erzwungen durch eine Registerprüfung, die mit einem
> echten Tokenizer zählt und nicht über einen Schätzfaktor. Die Anhebung war eine ausdrückliche
> Entscheidung des Projektinhabers mit Eintrag in `CHANGELOG.md`. Die Grenze wird **nicht
> stillschweigend angehoben**: Reißt sie, gilt erstens die Sparmaßnahmenliste, zweitens das
> Kürzen der Beschreibungen auf die untere Wortgrenze, drittens das Verschieben von Inhalten in
> die Resources; danach ist es ein Befund für den Projektinhaber. Die laufend erzeugten Zahlen
> stehen in `docs/entwicklung/tokenbudget.md`.

**Der erste Lauf, gemessen am 2026-09-13.** Elf Aufgaben gegen aufgezeichnete Antworten, ohne
einen einzigen Netzwerkaufruf gegen BuchhaltungsButler. Damit sind die Zielwerte oben keine
Annahmen mehr, sondern haben eine Grundlinie:

| Kennzahl | Zielwert | Messwert | Ergebnis |
| --- | --- | --- | --- |
| Falsche Toolwahl bei den zwölf Buchungswerkzeugen | 0, ohne Toleranz | **0** von 4 Aufrufen | gehalten |
| Blindes Schreiben (Klassen D und B) | 0, ohne Toleranz | **0** von 4 Aufrufen | gehalten |
| Erfolgsquote | über 90 Prozent | **10 von 11 = 90,9 Prozent** | gehalten, um 0,9 Punkte |
| Tool-Aufrufe pro Aufgabe | Median unter 6 | **Median 4** | gehalten, siehe Einschränkung 4 |
| Fehlversuche pro Aufgabe | Median 0, Maximum 1 | **Median 0, Maximum 1** | gehalten, beide Fehlversuche systembedingt |
| Tokenverbrauch pro Aufgabe | beim ersten Lauf festzulegen | **nicht gemessen** | bleibt offen |

**Vier Gründe, dieses Ergebnis nicht für mehr zu halten, als es ist.** Sie gehören zum Ergebnis
und nicht in eine Fußnote:

1. **Der Prüfer war der Geprüfte.** Dasselbe Modell hat die Aufgaben gelöst, den Testlauf
   geschrieben und die Kennzahlen gekannt. Ein solcher Lauf kann zeigen, **dass** ein Fehler
   auftritt; er kann nicht zeigen, dass keiner auftritt. Das ist genau die Überanpassung, vor der
   [10.4](#104-auswerten) warnt. Bevor die beiden Nullen als belegt gelten, braucht es einen Lauf
   mit einem Modell, das die Kennzahlen nicht kennt.
2. **Ein Lauf ist ein Lauf.** Über Streuung sagt er nichts.
3. **Nur zwei der zwölf Buchungswerkzeuge kommen überhaupt vor.** Die Nulltoleranz-Kennzahl misst
   vier Aufrufe; zehn Buchungswerkzeuge, darunter alle drei `unconfirm`-Werkzeuge, sind
   ungeprüft. Das ist eine Eigenschaft des Aufgabensatzes und der schwächste Punkt der Messung.
4. **Der Datenbestand der Aufzeichnungen ist winzig**, ein bis vier Zeilen je Antwort. Das hält
   die Aufrufzahl künstlich niedrig: Zwei Aufgaben fragen nach Datensätzen **ohne** Zuordnung,
   und weil die API dafür keinen Filter kennt, kostet die Antwort einen Aufruf je Datensatz. Bei
   40 Belegen wären es 42 Aufrufe statt der gemessenen sechs. **Der Median 4 ist deshalb keine
   Aussage über die Sparsamkeit des Entwurfs, sondern eine über die Größe des Testbestands.**

### 10.4 Auswerten

- **Transkripte lesen, nicht nur Zahlen.** `ANTHROPIC-WTA` empfiehlt ausdrücklich, die Begründungen des Agenten durchzusehen, um Verwirrungsmuster zu finden, und die Rohtranskripte auf implizites Verhalten zu prüfen. Wenn ein Agent regelmäßig zwei Tools hintereinander aufruft, wo eines reichen würde, ist das ein Entwurfsfehler, kein Agentenfehler.
- **Ausgehaltener Testsatz.** `ANTHROPIC-WTA` warnt vor Überanpassung; ein Teil der Aufgaben wird zurückgehalten und nur zur Abnahme benutzt.
- **Zusammen mit dem Agenten verbessern.** Der Artikel beschreibt, Evaluationstranskripte zusammenzufassen und einem Agenten zur Analyse und Umarbeitung der Tools vorzulegen. Das ist für uns die naheliegende Fixing-Phase nach jedem Evaluationslauf.

### 10.5 Zusätzliche Prüfungen, die nicht aus den Quellen stammen

Projektentscheidungen, weil es um Buchhaltungsdaten geht:

- **Schemakonformität.** Jede Tool-Antwort wird gegen das eigene `outputSchema` validiert. `MCP-SPEC-TOOLS` verlangt Konformität, wenn ein `outputSchema` deklariert ist; wir prüfen sie automatisiert.
- **Vollständigkeitsprüfung.** Ein Test zählt, dass die 34 Tools zusammen alle 54 Endpunkte aus `SPEC-BB` abdecken. Läuft gegen die OpenAPI-Datei, schlägt fehl, sobald ein Endpunkt unabgedeckt bleibt.
- **Kollisionstest.** Kein Toolname doppelt, alle Namen gegen `^[a-z][a-z0-9_]{2,39}$` geprüft, alle mit `bb_` beginnend.
- **Geheimnistest.** Ein Test durchsucht alle Tool-Definitionen, alle Beispiel-Antworten und alle Fehlertexte nach dem konfigurierten `api_key`. Ein Treffer ist ein Fehlschlag.
- **Nur-Lesen-Test.** Mit `BB_MCP_READ_ONLY=true` gestartet, lehnt jedes Tool der Klassen A, AR, M, D, B jeden Aufruf ab, ohne einen Request an BuchhaltungsButler abzusetzen, und nennt die Umgebungsvariable samt Zielwert in der Meldung. `bb_reports_create` ist ausdrücklich eingeschlossen. Gegenprobe ohne gesetzte Variable: dieselben Tools führen aus. Die Werkzeugliste ist in beiden Läufen identisch.

### 10.6 Was der erste Evaluationslauf über den Werkzeugentwurf gezeigt hat

Der Lauf vom 2026-09-13 hat mehr geliefert als sechs Zahlen. Aus den aufgezeichneten Begründungen
des Agenten zu jedem einzelnen Schritt lassen sich Entwurfsentscheidungen bestätigen und
Verwirrungsmuster benennen. Beides steht hier, weil es sich auf andere Werkzeugsätze übertragen
lässt.

**Sechs Entscheidungen, die sich unmittelbar ausgezahlt haben:**

1. **Ein Wegweiser in den `instructions`, ergänzt um einen Abgrenzungssatz im ersten Absatz jeder
   Beschreibung.** Die Wahl zwischen drei ähnlich benannten `create`-Werkzeugen war an keiner
   Stelle zweifelhaft — der Wegweiser stand schon da, bevor die Frage entstand.
2. **Namen, die zwei leicht verwechselbare Begriffe auseinanderziehen**, hier Zahlungskonto gegen
   Sachkonto, zusammen mit einem eigenen Abschnitt der `instructions`, der beide nebeneinander
   stellt. Die Aufgabe, die genau darauf zielt, lief ohne Umweg.
3. **Eine Antwort, die den nächsten Schritt nennt, bevor der Agent die Lücke bemerkt.** Der Satz
   „Diese Liste führt sechs Felder und darunter kein `account`: Auf welchem Zahlungskonto eine
   Zahlung liegt, zeigt erst `bb_transactions_get`." hat einen ganzen Umweg eingespart.
4. **Eine Bestandszeile, die die Paginierungsfrage beantwortet, statt sie offenzulassen.**
   „Weniger Zeilen als das `limit`, also ist das das vollständige Ergebnis für diese Filter."
   verhindert genau den überflüssigen zweiten Aufruf mit `offset`, den ein Agent sonst aus
   Vorsicht absetzt.
5. **Der Weg zurück mit konkretem Wert statt als Merksatz.** Nach drei Löschvorgängen stand
   dreimal die passende Umkehrung samt Kennung da.
6. **Die Schemaprüfung greift vor dem Request.** Ein vom Eingabeschema abgewiesener Schreibaufruf
   hat den Prozess nicht verlassen; im Test nachgezählt wurden null Requests an den betroffenen
   Endpunkt.

**Sechs Verwirrungsmuster, jedes über dieses Projekt hinaus gültig.** Die Reihenfolge ist nach
Schaden, nicht nach Aufwand; „Schaden" heißt: Wie wahrscheinlich bekommt der Nutzer eine falsche
Auskunft, ohne dass es jemandem auffällt?

| Muster | Wie es sich zeigt | Was daraus folgt |
| --- | --- | --- |
| **Neutralisierung frisst Bedeutung** | Ein regulärer Ausdruck, der führende Aufzählungs- und Markdown-Zeichen aus Fremdtext entfernt, entfernt auch das Minus eines Betrags. Im Textblock wird aus einer Auszahlung eine Einzahlung; nur der strukturierte Teil behält das Vorzeichen | Neutralisierung nie pauschal auf **jeden** Zeichenkettenwert anwenden. In einer Buchhaltung ist das die gefährlichste Fehlerklasse, weil sie still ist |
| **Die Fehlermeldung nennt den übergebenen Wert falsch** | Eine Schemameldung las den Eingabewert aus einem Feld, das die Prüfbibliothek im fertigen Issue nicht mehr führt, und meldete deshalb bei **jedem** Typfehler „übergeben wurde undefined". Damit ist ein Typfehler von einem fehlenden Feld nicht mehr zu unterscheiden, und ein Agent sendet denselben falschen Wert erneut | Wer die Meldung der Prüfbibliothek durch eine eigene ersetzt, muss nachweisen, dass die eigene mindestens so viel sagt. Sonst die fremde durchreichen |
| **Beispiele widersprechen dem Typ** | 44 Felder mit Zeichenketten-Schema trugen ein Beispiel, das wie eine Zahl aussah („zum Beispiel 4980"); kein einziges Zahlenfeld trug ein Beispiel in Anführungszeichen. Ein Agent übergibt dann eine Zahl, und der Aufruf wird abgewiesen | Das Beispiel ist Teil des Typvertrags. An Zeichenkettenfeldern gehört es in Anführungszeichen, und wo der Typ überrascht, gehört der Satz „eine Zeichenkette, keine Zahl" dazu |
| **Die sparsame Projektion lässt die Anschlussfelder weg** | Die `concise`-Sicht eines Suchwerkzeugs führte einen Filter, den sie selbst nicht ausgab, und eine von zwei gleichartigen Anschlusskennungen. Beides kostete mehr Kontext, als die Felder gekostet hätten: entweder ein Aufruf je Wert oder ein Umschalten auf die volle Sicht mit 38 Feldern je Zeile | In eine `concise`-Projektion gehören alle Felder, auf die das Werkzeug selbst filtert, und alle Kennungen, mit denen der nächste Aufruf anschließt |
| **Ein geschachteltes Objekt wird in der Tabellenzelle gekürzt** | Bei Berichtswerkzeugen **ist** das gekürzte Feld die gesamte Auskunft. Eine Kürzung nach 400 Zeichen ließ im Textblock den Anfang stehen und sonst nichts; der strukturierte Teil war vollständig | Für Listen gibt es eine Kürzung, die Zeilen zählt und den Verlust beziffert. Für ein Objekt in einer Zelle braucht es dasselbe, sonst hängt die Antwort daran, ob der Client den strukturierten Teil weiterreicht |
| **Ein Pflichtfeld, das die Fachlichkeit nicht hergibt** | Ein Buchungswerkzeug führte Kreditor **und** Debitor als Pflicht, weil die Spezifikation beide als `required` deklariert. Für eine Eingangsrechnung gibt es keinen Debitor. Dem Agenten bleiben drei Wege, und keiner ist gut: eine Nummer erfinden, den Aufruf abgesetzt bekommen und scheitern, oder abbrechen und fragen | `required` gegenüber der Spezifikation zu verschärfen ist richtig, es ungeprüft zu übernehmen nicht. Wo die Spezifikation sich selbst widerspricht, ist die Frage durch **Messung** zu klären und bis dahin in der Feldbeschreibung offen zu benennen |

**Drei Kosten, die der Werkzeugtext nennen sollte und oft nicht nennt.** Sie sind Lücken der
API, keine Entwurfsfehler des Servers — aber der Agent merkt sie erst, wenn er die Liste in der
Hand hält, und der Nutzer merkt sie gar nicht:

- **Ein Pflichtfeld ohne Sammelwert** — etwa eine Belegrichtung, für die es kein „beide" gibt —
  macht jede Frage nach „allen" zu zwei Aufrufen. Wer das übersieht, antwortet still
  unvollständig, und bei einem löschenden Werkzeug bleibt die Hälfte stehen.
- **„Ohne Zuordnung" ist ein N+1-Muster**, wenn die API keinen solchen Filter kennt und die
  Zuordnung nur je Datensatz abfragbar ist. Ein Satz, der diese Kosten beziffert, erlaubt dem
  Agenten eine Rückfrage vor dem zweiundvierzigsten Aufruf.
- **Ein erzwungener Zeitraum ohne Vorgabe des Nutzers** führt zu einem erfundenen Fenster. Findet
  der Agent darin nichts, ist „nicht gebucht" eine falsche Auskunft. Der Werkzeugtext sollte
  verlangen, das selbst gewählte Fenster in der Antwort zu nennen.

---

## 11. Verbindliche Vorgaben für unseren Server

Diese Liste ist die Abnahmeliste. Ein Implementierungs-Agent arbeitet sie ab; jeder Punkt ist überprüfbar.

### 11.1 Toolsatz

> **Nachgezogen am 2026-09-13; Sachgrund ist eine Entscheidung des Projektinhabers.** Die Spanne
> „zwischen 28 und 34 Tools" ist **aufgehoben**. Verbindlich ist: **genau ein Werkzeug je Endpunkt, also 54 Werkzeuge, jedes mit
> allen Parametern seines Endpunkts.** Damit entfallen auch die beiden folgenden Haken in ihrer
> bisherigen Form: Einzel- und Stapelendpunkt sind **zwei** Werkzeuge und nicht eines mit
> `items`-Array, und eine Zusammenfassung mehrerer Endpunkte gibt es nicht mehr, die zugehörige
> Ausweispflicht läuft daher leer. Unverändert gültig bleiben: vollständige Abdeckung aller 54
> Endpunkte mit maschinellem Nachweis, kein Werkzeug, das Lesen und Schreiben vereint, und die
> Zuordnung Werkzeug zu Endpunkt als Datenstruktur im Code.
>
> **Ergänzt am 2026-09-13:** Neben den 54 Endpunktwerkzeugen liefert der Server **fünf
> Bündelwerkzeuge** aus, die mehrere Endpunkte zu einem Ablauf zusammenfassen
> (`bb_masterdata_search`, `bb_records_collect`, `bb_assignments_get`, `bb_balances_get`,
> `bb_reports_run`). Sie **ersetzen kein** Endpunktwerkzeug; alle 54 bleiben daneben nutzbar,
> und der Satz „ein Werkzeug je Endpunkt" gilt unverändert. Damit meldet der Server **59**
> Werkzeuge, davon 19 lesende — am 2026-09-13 über ein `tools/list` gegen den gebauten Server
> selbst nachgemessen. Die Bündel sind die einzige Ausnahme von der Regel „keine Zusammenfassung
> mehrerer Endpunkte"; sie nennen die zusammengefassten Aufrufe in ihrer Beschreibung und weisen
> sie in der Antwort aus.

- [ ] Der Toolsatz deckt alle 54 Endpunkte aus `SPEC-BB` ab. Ein automatisierter Test belegt das.
- [ ] ~~Die Anzahl der Tools liegt zwischen 28 und 34.~~ **Aufgehoben, siehe Kasten.**
- [ ] Kein Tool vereint Lesen und Schreiben.
- [ ] Einzel- und Batch-Endpunkt derselben Operation sind ein Tool mit `items`-Array.
- [ ] Jede Zusammenfassung mehrerer Endpunkte ist in der Tool-Beschreibung genannt und in der Antwort ausgewiesen.
- [ ] Die Zuordnung Tool zu Endpunkt liegt als Datenstruktur im Code vor, nicht nur in der Dokumentation.

### 11.2 Namensschema

- [ ] Muster: `bb_<ressource>_<verb>[_<qualifizierer>]`, snake_case, klein.
- [ ] Jeder Name beginnt mit `bb_`.
- [ ] Jeder Name erfüllt `^[a-z][a-z0-9_]{2,39}$`.
- [ ] Das Verb stammt aus der geschlossenen Liste in [4.4](#44-verben-geschlossene-liste).
- [ ] Ressource steht vor dem Verb, im Plural.
- [ ] Kein Name doppelt.

### 11.3 Aufbau jeder Tool-Beschreibung

> **Nachgezogen am 2026-09-13; Sachgrund ist eine Entscheidung des Projektinhabers.** **Der
> fünfteilige Aufbau bleibt verbindlich, die Sprache ist Deutsch.** Damit entfallen die beiden Haken zur Sprache: Es gilt
> nicht „Sprache Englisch, deutsche Fachbegriffe in Anführungszeichen eingestreut", sondern
> deutscher Text. Die Regel, deutsche Fachbegriffe in Anführungszeichen zu setzen, **entfällt
> ersatzlos** — sie war nur nötig, um sie aus englischem Text herauszuheben. Stattdessen gilt:
> **API-Feldnamen, Werkzeugnamen und Enum-Werte stehen unverändert im Original.** Die Längengrenze
> „60 bis 220 Wörter" wird durch ein Stufenbudget ersetzt, das maschinell geprüft wird: **900
> Zeichen** für die 22 Werkzeuge der Verwechslungs- und Gefahrenzone, **700** für die 18
> Werkzeuge mit fachlicher Tiefe ohne Verwechslungsrisiko, **480** für die 14 trivialen Stapel-
> und Nachschlagevarianten. Jedes Werkzeug trägt genau eine Stufe; die Stufe steht im
> Registereintrag.

Feste Reihenfolge, mindestens fünf Sätze:

- [ ] **Satz 1, Zweck mit System.** Was das Tool tut, mit dem Wort "BuchhaltungsButler", und mit dem deutschen Fachbegriff in Anführungszeichen.
- [ ] **Satz 2, Anwendungsfall.** Wann man es benutzt, mit einem konkreten Beispiel aus dem Alltag.
- [ ] **Satz 3, Abgrenzung.** Welches andere Tool stattdessen zu nehmen ist und wann.
- [ ] **Satz 4, Negation.** Was das Tool nicht liefert oder nicht tut.
- [ ] **Satz 5, Grenzen und Folgen.** Bei lesenden Tools die Obergrenze und der Hinweis auf `offset`; bei schreibenden Tools die Wirkung auf den echten Datenbestand und ob sie umkehrbar ist.
- [ ] Bei Tools, die mehrere Endpunkte abdecken: ein zusätzlicher Satz, der die Abdeckung nennt.
- [ ] Sprache Englisch, deutsche Fachbegriffe in Anführungszeichen eingestreut.
- [ ] Länge zwischen 60 und 220 Wörtern. Unter 60 fehlt fast sicher einer der fünf Sätze; über 220 wird es teuer.

### 11.4 Aufbau jeder Parameterbeschreibung

- [ ] Jeder Parameter hat eine `description`. Ohne Ausnahme.
- [ ] Jede Beschreibung nennt Bedeutung, Format und einen Beispielwert.
- [ ] Wo ein deutscher Fachbegriff existiert, steht er in Anführungszeichen dabei.
- [ ] Bei optionalen Feldern steht ausdrücklich, was das Weglassen bedeutet.
- [ ] Bei Feldern mit Default steht der Default im Text, zusätzlich zum `default` im Schema.
- [ ] Bei Feldern mit Obergrenze steht die Obergrenze im Text, zusätzlich zu `maximum` im Schema.
- [ ] Bei Feldern, die auf Mandantenstammdaten verweisen, steht das zuständige Lookup-Tool im Text.
- [ ] Bei sich gegenseitig ausschließenden Feldern steht der Ausschluss in beiden Beschreibungen.

### 11.5 Eingabeschema

- [ ] Jeder abzählbare, mandantenunabhängige Wertebereich ist ein `enum`.
- [ ] Kein Parameter heißt `type`; jeder ist qualifiziert (`receipt_type`, `posting_type`, `contact_type`).
- [ ] `api_key` erscheint in keinem Schema. Er kommt ausschließlich aus der Serverkonfiguration.
- [ ] `limit` hat `minimum: 1`, `maximum: 500`, `default: 100`.
- [ ] `offset` hat `minimum: 0`, `default: 0`.
- [ ] Datumsfelder haben `"format": "date"` und ein Beispiel im Text.
- [ ] Beträge sind `string`, nicht `number`.
- [ ] Bei schreibenden Tools sind alle fachlich entscheidenden Felder `required`, auch wenn `SPEC-BB` sie als optional führt.
- [ ] Die Serverimplementierung validiert jede Eingabe gegen das eigene Schema, bevor ein HTTP-Request abgeht.
- [ ] `items`-Arrays haben ein `maxItems` entsprechend `BB_MCP_MAX_BATCH`.

### 11.6 Antwortformat

- [ ] Jedes lesende Tool hat `response_format` mit `enum: ["concise", "detailed"]` und `default: "concise"`.
- [ ] Jedes Tool deklariert ein `outputSchema` und liefert passenden `structuredContent`.
- [ ] Zusätzlich liefert jedes Tool einen `content`-Textblock mit der serialisierten oder lesbar aufbereiteten Fassung, wie `MCP-SPEC-TOOLS` es für die Abwärtskompatibilität empfiehlt.
- [ ] Listen kommen als Markdown-Tabelle im Textblock.
- [ ] Jede Listenantwort nennt die Gesamttrefferzahl und die Zahl der gelieferten Zeilen.
- [ ] Jede gekürzte Antwort endet mit dem konkreten nächsten Aufruf, inklusive des zu setzenden `offset`-Werts, und mit der Alternative, den Filter zu verengen.
- [ ] Keine Antwort überschreitet 20.000 Token; ab 5.000 wird gekürzt.
- [ ] Wo eine sprechende Bezeichnung zum Identifikator vorliegt, wird sie mitgeliefert.
- [ ] Freitextfelder aus der API werden neutralisiert ausgegeben, nie als Anweisung an das Modell formatiert.
- [ ] Wo ein Tool mehrere Endpunkte abdeckt, weist die Antwort aus, welcher benutzt wurde.

### 11.7 Fehlerformat

- [ ] Fachliche Fehler und API-Fehler kommen als Ergebnis mit `isError: true`, nicht als JSON-RPC-Protokollfehler.
- [ ] Jede Fehlermeldung hat die vier Blöcke aus [8.2](#82-aufbau): Was, Warum mit konkretem Wert, Wie richtig als konkreter Aufruf, gegebenenfalls Vorbedingung.
- [ ] Jede Fehlermeldung sagt ausdrücklich, ob etwas geändert wurde. Bei Ablehnung vor dem Request: "Nothing was fetched." oder "Nothing was changed."
- [ ] Bei ungültigem Enum-Wert nennt die Meldung alle erlaubten Werte und, wenn erkennbar, den wahrscheinlich gemeinten.
- [ ] Bei überschrittenen Grenzen nennt die Meldung das billigere Aufrufmuster.
- [ ] Keine Fehlermeldung enthält den `api_key`, einen Stacktrace oder rohes HTML der Gegenstelle.
- [ ] Fehlermeldungen sind Englisch, mit deutschen Fachbegriffen in Anführungszeichen wo einschlägig.

### 11.8 Schreibende Operationen

- [ ] Jedes Tool trägt alle vier Annotationen explizit: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.
- [ ] Die Klassifikation R, A, AR, M, D, B aus [9.3](#93-klassifikation-unserer-tools) liegt als Tabelle im Code.
- [ ] `openWorldHint` ist bei allen Tools `true`.
- [ ] Kein Tool hat einen `confirm`-Parameter, kein Tool erzwingt einen Trockenlauf, und kein Tool verlangt eine serverseitige Bestätigung. Maßgeblich ist [9.4](#94-bestätigung-liegt-beim-host-nicht-im-server).
- [ ] Jedes Tool der Klassen D und B nennt in seiner Beschreibung ausdrücklich, dass es den echten Datenbestand des verbundenen Mandanten verändert, und ob und womit die Änderung umkehrbar ist.
- [ ] Die Antwort jedes schreibenden Tools löst die betroffenen Datensätze auf und zeigt sie als Tabelle, nicht nur ihre Identifikatoren.
- [ ] Die Antwort nennt die dem Server bekannten Folgewirkungen, etwa bestehende Zuordnungen und Buchungen.
- [ ] `BB_MCP_READ_ONLY` existiert, hat den Default `false` und wird nur beim Start gelesen; maßgeblich festgelegt in [9.5](#95-optionaler-nur-lesen-schalter). Zur Laufzeit ist der Schalter nicht änderbar, auch nicht durch ein Tool.
- [ ] Bei `BB_MCP_READ_ONLY=true` lehnt jedes Tool der Klassen A, AR, M, D, B den Aufruf ab, bevor ein Request abgeht. `bb_reports_create` (Klasse AR) ist ausdrücklich eingeschlossen, obwohl es keinen Buchungsbestand verändert; Begründung in [9.3](#93-klassifikation-unserer-tools) und [9.5](#95-optionaler-nur-lesen-schalter).
- [ ] Gesperrte Tools bleiben in `tools/list` sichtbar; die Werkzeugliste hängt nicht vom Schalter ab.
- [ ] Jede Absage durch den Schalter nennt `BB_MCP_READ_ONLY`, den nötigen Zielwert und den Umstand, dass sie aus dem Gespräch heraus nicht aufhebbar ist.
- [ ] Die `instructions` des Servers nennen, ob der Schalter aktiv ist.
- [ ] Die `instructions` und die README nennen, dass bei aktivem Schalter nur `bb_reports_get_ledger` eine Auswertung liefert und BWA sowie Summen- und Saldenliste einen Start ohne `BB_MCP_READ_ONLY=true` voraussetzen.
- [ ] Die Beschreibung von `bb_reports_get` nennt `bb_reports_create` als Vorbedingung und dessen Sperre bei aktivem Schalter.
- [ ] `BB_MCP_MAX_BATCH` begrenzt `items`-Arrays, Vorschlag 50.
- [ ] Vor jedem `create` der Klassen A und B läuft eine Duplikatsprüfung; ein Treffer steht sichtbar in der Antwort des Aufrufs und blockiert ihn nicht. Für `bb_reports_create` (Klasse AR) entfällt sie, dort tritt der Hinweis an ihre Stelle, dass ein vorhandener Bericht desselben Typs ersetzt wird.
- [ ] Jeder Tool-Aufruf wird serverseitig protokolliert, ohne Zugangsdaten.
- [ ] Rate Limiting ist aktiv, für die Klassen D und B strenger als für R.
- [ ] Es existiert kein Tool, das Suchen und Schreiben in einem Aufruf verbindet.

### 11.9 Prüfungen vor der Abnahme

- [ ] Vollständigkeitstest: der Toolsatz deckt alle 54 Endpunkte. ~~34 Tools decken 54 Endpunkte.~~ **Aufgehoben, siehe [11.1](#111-toolsatz).**
- [ ] Namenstest: Regex, Präfix, Eindeutigkeit, Verbliste. Das Verb ist das Segment hinter der Ressource, nicht die Namensendung; `bb_reports_get_ledger` und `bb_postings_assign_receipt` tragen einen Qualifizierer dahinter.
- [ ] Klassifikationstest: jedes registrierte Tool steht in der Klassentabelle aus [9.3](#93-klassifikation-unserer-tools) genau einmal, und die Tabelle enthält kein Tool, das nicht existiert. Die Klasse wird aus der Tabelle gelesen, nie aus dem Namen abgeleitet.
- [ ] Geheimnistest: `api_key` taucht in keiner Definition, keiner Antwort, keiner Fehlermeldung auf.
- [ ] Nur-Lesen-Test: Mit `BB_MCP_READ_ONLY=true` lehnt jedes Tool der Klassen A, AR, M, D, B den Aufruf ab, ohne einen Request abzusetzen, und nennt die Umgebungsvariable. Ohne die Variable führen dieselben Tools aus. Einzeln getestet.
- [ ] Berichtstest: Ohne gesetzte Variable sind `bb_reports_create`, `bb_reports_get` und `bb_reports_get_ledger` aufrufbar. Mit `BB_MCP_READ_ONLY=true` antworten `bb_reports_get` und `bb_reports_get_ledger` weiterhin, `bb_reports_create` lehnt ab; die `instructions` nennen die daraus folgende Einschränkung für BWA und Summen- und Saldenliste.
- [ ] Annotationstest: Jedes Tool trägt alle vier Annotationen, und ihre Werte stimmen mit der Klasse aus der Tabelle in [9.3](#93-klassifikation-unserer-tools) überein. Automatisiert gegen die Klassentabelle geprüft.
- [ ] Beschreibungstest für schreibende Tools: Jede Beschreibung der Klassen A, AR, M, D und B enthält den Folgensatz aus [5.5](#55-fehlbedienung-vorbeugen), also die Wirkung auf den echten Datenbestand und die Aussage zur Umkehrbarkeit. Kein Tool enthält einen `confirm`-Parameter.
- [ ] Schemakonformitätstest: jede Antwort validiert gegen ihr `outputSchema`.
- [ ] Definitionsgrößentest: alle Tool-Definitionen zusammen unter der Grenze aus [10.3](#103-kennzahlen). ~~Unter 10.000 Token.~~ **Aufgehoben**; die Zahl galt für 34 englische Definitionen.
- [ ] Evaluationslauf über die Aufgaben aus [10.2](#102-aufgaben-bauen) mit den Kennzahlen aus [10.3](#103-kennzahlen).
- [ ] Schutzverletzungen im Evaluationslauf: 0.

---

## 12. Offene Punkte und Annahmen

Was in diesem Dokument nicht belegt ist und vor oder während der Implementierung geklärt werden muss:

> **Nachgezogen am 2026-09-13 nach eigener Messung gegen die Produktivumgebung.** Die ersten
> **drei** Zeilen der folgenden Tabelle sind **erledigt**. `/receipts/get/id_by_customer` und
> `/transactions/get/id_by_customer` sind benutzbar, sobald der Wert in das Pfadsegment
> eingesetzt wird; beide antworteten am 2026-09-12 mit HTTP 200. `bb_receipts_get` und
> `bb_transactions_get` werden gebaut und ausgeliefert, und andere Werkzeugbeschreibungen dürfen
> auf sie verweisen. Die dritte Zeile, die Umgehung über die exklusiven Kennungsgrenzen, entfällt
> mit ihrem Gegenstand: Sie wird nicht gebraucht und nicht umgesetzt. Die Zeilen bleiben als
> Nachweis des Wegs stehen.

| Punkt | Status | Wie zu klären |
| --- | --- | --- |
| Wie `/receipts/get/id_by_customer` korrekt aufgerufen wird und damit, ob `bb_receipts_get` überhaupt gebaut werden kann | **live nicht funktionsfähig belegt**: vier Aufrufvarianten am 2026-09-12 endeten alle mit HTTP 400 und `error_code` 5, Beleg `docs/api/belege.md` Abschnitt 4.5 | Einen einzelnen Testaufruf mit der dort genannten, ungetesteten Array-Hypothese `{"api_key": "...", "id_by_customer": [<id>]}` fahren. Bis das gelingt, wird das Tool nicht ausgeliefert und in keiner Beschreibung erwähnt, siehe die Warnung in [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools). Blockiert zugleich Fremdwährungsfelder und Dateiinhalt |
| Ob `/transactions/get/id_by_customer` in der Produktivumgebung überhaupt geroutet ist und damit, ob `bb_transactions_get` gebaut werden kann | **live nicht funktionsfähig belegt**: zwei Aufrufe am 2026-09-12 lieferten HTTP 404 mit HTML-Körper, Beleg `docs/api/transaktionen.md` Abschnitt 4.5 | Beim Anbieter klären, ob der Pfad existiert. Bis dahin Umgehung über `/transactions/get` mit `id_by_customer_from = id - 1` und `id_by_customer_to = id + 1`, siehe [3.5](#35-vorgeschlagene-abbildung-54-endpunkte-auf-34-tools) |
| Ob die Umgehung für den Einzelabruf einer Transaktion tatsächlich genau einen Datensatz liefert | **nicht verifiziert**, Herleitung aus der exklusiven Grenzsemantik in `docs/api/transaktionen.md` Abschnitt 3.1 | Ein Leseaufruf gegen `/transactions/get` mit einer bekannten Kennung. Liefert nur die sechs Listenfelder, die Detailfelder des Einzelabrufs fehlen |
| Tokenkosten der Tool-Definitionen | **gemessen** am 2026-09-13 mit `gpt-tokenizer@4.0.0`, Kodierung `o200k_base` | Erledigt und laufend nachgeführt in `docs/entwicklung/tokenbudget.md`. Offen bleibt allein, dass `o200k_base` für die Claude-Linie nur eine Größenordnung liefert: deren Tokenizer ist nicht öffentlich dokumentiert |
| Ob die BuchhaltungsButler-API Schreibvorgänge dedupliziert | **nicht verifiziert** | Test gegen eine Testumgebung, falls vorhanden; sonst beim Anbieter erfragen |
| Ob `/postings/add/receipt` wirklich **beide** Gegenkonten verlangt, `creditor` und `debtor` | **nicht verifiziert**, und die Spezifikation widerspricht sich: Sie führt beide als `required: true`, ihre eigenen Feldbeschreibungen sagen „only required, if …". `required` wurde deshalb nicht gelockert, beide bleiben Pflicht | **Durch Messung klären, mit einem Testmandat** (siehe die Zeile zur Deduplizierung). Die Folge ist nicht theoretisch: Für eine Eingangsrechnung gibt es keinen Debitor, und der Evaluationslauf vom 2026-09-13 hat genau daran eine Aufgabe verloren — der Agent brach richtig ab, statt eine Debitorennummer zu erfinden. Nimmt die API den Aufruf ohne `debtor` an, ist das ein Schemafehler dieses Servers und keine Lücke der API. Betrifft `bb_postings_create_for_receipt` und seine Stapelform |
| Betragsformat (Dezimaltrenner, Tausendertrenner, Währungsangabe) | **nicht verifiziert** | `SPEC-BB` liefert dazu keine eindeutige Aussage; an der laufenden API prüfen |
| Ob `/receipts/get` die Gesamttrefferzahl oder nur die Seitenlänge meldet | **nicht verifiziert** | An der laufenden API prüfen. Sicherheitsrelevant, siehe [7.4](#74-paginierung) |
| Ob `/reports/create/*` synchron oder asynchron arbeitet | **geklärt**: asynchron, belegt in `docs/api/berichte.md` Abschnitt 2.1 aus `SPEC-BB`; der get-Endpunkt meldet währenddessen `error_code` 8 | Offen bleibt allein die Laufzeit und damit das Polling-Intervall, **Annahme** nach `docs/api/berichte.md` Abschnitt 2.4 |
| Ob ein ersetzter Bericht eine neue `id_by_customer` erhält und wie lange erzeugte Berichtsdateien verfügbar bleiben | **nicht verifiziert** | An der laufenden API prüfen; betrifft `idempotentHint` und den Hinweis in Beschreibung und Antwort von `bb_reports_create`, siehe [9.3](#93-klassifikation-unserer-tools) |
| Ob sich eine über `/postings/assign/receipt-to-free-posting` hergestellte Zuordnung wieder aufheben oder überschreiben lässt und wie ein wiederholter Aufruf mit denselben Argumenten antwortet | **nicht verifiziert**; belegt ist allein, dass `SPEC-BB` unterhalb von `/postings/` keinen `unassign`-Pfad enthält | Beim Anbieter klären oder gegen eine Testumgebung prüfen. Betrifft die Einstufung von `bb_postings_assign_receipt` in Klasse B und dessen `idempotentHint`, siehe [9.3](#93-klassifikation-unserer-tools). Bis zur Klärung bleibt das Werkzeug in Klasse B, und seine Beschreibung nennt die fehlende Umkehrbarkeit ausdrücklich |
| Ob `account` in verschiedenen Endpunkten Unterschiedliches bedeutet | **nicht verifiziert** | Bei der Detailauswertung der 54 Endpunkte klären |
| Ob die Feldmengen von `/invoices/create`, `/invoices/create/e-invoice` und `/invoices/create/draft` nah genug beieinander liegen für ein gemeinsames Tool | **nicht verifiziert** | Feldvergleich aus `SPEC-BB`; falls zu divergent, auf zwei Tools aufteilen |
| Maximale Dateigröße bei `/receipts/upload` und erwartete Kodierung | **nicht verifiziert** | `SPEC-BB` prüfen, sonst an der API testen |
| Authentifizierungsverfahren | **nicht aus `SPEC-BB` belegbar** | Das Dokument enthält weder `servers` noch `securitySchemes`; `api_key` steht nur als Body-Feld. Das reale Verfahren gehört in die API-Dokumentation des Projekts, nicht hierher |
| Zielwerte der Evaluationskennzahlen | **erster Lauf gemessen**, siehe [10.3](#103-kennzahlen); alle Zielwerte gehalten | Ein zweiter Lauf mit einem Modell, das die Kennzahlen nicht kennt, und ein Aufgabensatz, der mehr als zwei der zwölf Buchungswerkzeuge berührt. Erst danach sind die beiden Nullen belegt |
| Token-Grenzen 5.000 und 20.000 pro Antwort | **Annahme** | Nach dem ersten Lauf justieren |
| Ob `input_examples` über MCP transportierbar wird | **nicht verifiziert** | MCP-Spezifikationsänderungen beobachten; bis dahin Beispiele im Beschreibungstext |
| Ob und wie das optionale Feld `title` der Tool-Definition gesetzt wird, etwa als deutscher Anzeigename neben dem englischen Werkzeugnamen | **entschieden und ausgeliefert**: jedes Werkzeug trägt einen deutschen Anzeigenamen, passend zur Sprachfrage aus [5.6](#56-sprache) | Am 2026-09-13 über ein `tools/list` gegen den gebauten Server nachgemessen: **59 von 59** Definitionen führen ein `title`, zum Beispiel „Kommentar anhängen". `title` dient laut `MCP-SPEC-TOOLS` der Anzeige; welche Clients es tatsächlich auswerten, bleibt **nicht verifiziert** |
| Die Felder und Mechanismen, die erst die Revision 2026-07-28 einführt: `x-mcp-header` im `inputSchema`, `resultType` auf jedem Result, `ttlMs` und `cacheScope` auf `tools/list`, sowie `InputRequiredResult` mit `inputRequests` und `requestState` | **bewusst nicht behandelt** | Zielrevision ist 2025-11-25, siehe [Abschnitt 1](#1-quellenlage) und `docs/entwicklung/mcp-spezifikation.md` Abschnitt 11.1a (c). Unter 2025-11-25 existieren diese Felder nicht. Sie werden erst verbindlich, wenn ein Laufzeittest zeigt, dass das eingesetzte SDK 2026-07-28 aushandelt. Ebenfalls bewusst nicht gesetzt, aber bereits unter 2025-11-25 vorhanden: `icons` und `execution.taskSupport`, entschieden in [6.7](#67-weitere-felder-der-tool-definition-unter-2025-11-25) |

### Widersprüche zwischen den Quellen

Zwei sind aufgefallen und werden hier nicht geglättet:

1. **Konsolidierung gegen Klarheit.** `ANTHROPIC-DEFINE` empfiehlt, verwandte Aktionen in ein Tool mit `action`-Parameter zu fassen. `MCP-CONCEPTS` beschreibt Tools dagegen so, dass jedes Tool "a single operation with clearly defined inputs and outputs" ausführt. Beides gleichzeitig geht nicht. Wir folgen `ANTHROPIC-DEFINE`, aber mit der Bremse aus [3.4](#34-empfehlung-für-unseren-fall): Konsolidiert wird nur bei deckungsgleichen Parametermengen, und nie über die Lese-Schreib-Grenze hinweg.
2. **Vertrauen in Annotationen.** `MCP-SPEC-TOOLS` nennt Annotationen als Mittel, damit Clients Tools sinnvoll behandeln, `MCP-SCHEMA` bezeichnet sie im selben Atemzug als unzuverlässige Hinweise, auf die Clients keine Entscheidungen stützen sollen. Praktisch heißt das: deklarieren, aber nie darauf verlassen. Genau so ist [Abschnitt 9](#9-gefährliche-operationen) gebaut.

### Gefundene Ungereimtheit in `SPEC-BB`

Beim Auswerten der OpenAPI-Datei ist aufgefallen, dass sie `servers`, `security` und `components.securitySchemes` nicht setzt und Body-Parameter im Swagger-2.0-Stil (`"in": "body"` als Einzelparameter) deklariert, während die Datei ansonsten wie ein OpenAPI-Dokument aufgebaut ist. Außerdem enthalten viele `description`-Felder HTML (`<br/>`, `<i>`, HTML-Entities wie `&ldquo;`). Beides ist für die Implementierung relevant: Die Beschreibungen müssen vor der Übernahme in Tool-Schemata von HTML befreit werden, und ein generischer OpenAPI-Codegenerator wird an dieser Datei vermutlich scheitern. Das ist kein Befund dieses Auftrags, sondern eine Beobachtung am Rande, und gehört an die Stelle, an der die API-Dokumentation des Projekts gepflegt wird.
