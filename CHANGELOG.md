# Änderungsprotokoll

Alle bemerkenswerten Änderungen an diesem Projekt stehen in dieser Datei.

Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionsnummern
folgen der [Semantischen Versionierung](https://semver.org/lang/de/). Die Datei wird von Hand
gepflegt, und jede Veröffentlichung bekommt einen Eintrag.

## [Unveröffentlicht]

## [0.1.2] - 2026-09-15

### Behoben

- **Das `.mcpb`-Bundle startete in Claude Desktop nicht, wenn „Werkzeuggruppen" leer blieb.**
  Claude Desktop ersetzt `${user_config.<feld>}` nur für Felder mit einem Wert oder einer
  Vorgabe im Manifest. Das optionale Feld hatte keine Vorgabe, der Platzhalter kam wörtlich im
  Server an, galt als unbekannter Gruppenname, und der Server beendete sich beim Start. In
  Claude Desktop erschien das als „Server disconnected" ohne eigene Fehlermeldung. Belegt an
  der Referenzimplementierung `getMcpConfigForManifest` von `@anthropic-ai/mcpb`.
  Die Behebung hat zwei Teile: Die optionalen Felder „Nur lesen" und „Werkzeuggruppen" tragen
  jetzt Vorgaben, und der Server behandelt einen nicht ersetzten Platzhalter wie einen nicht
  gesetzten Wert, mit einer Warnung, statt abzubrechen.
- Ein neuer Integrationstest startet den gebauten Server mit der Umgebung, die der Bundle-Host
  aus der Vorlage erzeugt, wenn nur die Pflichtfelder ausgefüllt sind. Gegen den Stand von
  0.1.1 schlägt er fehl.

## [0.1.1] - 2026-09-15

### Behoben

- **Die drei Berichtsabholwerkzeuge liefern ihre Daten jetzt als Tabelle.**
  `bb_reports_get_ledger`, `bb_reports_get_bwa` und `bb_reports_get_sums` waren als Quittung
  ohne Daten modelliert, weil die API diese Berichte ohne `data`-Hülle als verschachteltes
  Objekt liefert. Der Bericht kam dadurch als ein einziges unbekanntes Feld und als roher
  JSON-Block beim Agenten an. Die Antworten werden jetzt vor dem Antwortvertrag in flache Zeilen
  umgeformt: das Kontenblatt eine Zeile je Buchung, die Summen- und Saldenliste eine Zeile je
  Konto, die BWA Gruppen, Klassen, Konten und Ergebniszeilen in Lesereihenfolge. Die
  Kopfangaben stehen in `summary`, angeforderte Berichtsdateien ebenfalls dort. Hat eine
  Antwort nicht die gemessene Form, geht sie unverändert hinaus, mit einer einzigen Meldung.
- **`bb_reports_run` zeigt BWA und Summen- und Saldenliste als Tabelle.** Bisher stand in der
  Kurzform nur die oberste Ebene des Berichts, die Beträge fanden sich allein im strukturierten
  Teil. Jetzt stehen sie im Textblock, mit denselben Spalten wie bei den Abholwerkzeugen.
- **Der Antwortvertrag der drei Werkzeuge ist gemessen**, nicht mehr aus der Spezifikation
  übernommen (Befund L7 in `docs/api/live-befunde.md`). BWA und Summen- und Saldenliste sind
  dafür mit Freigabe über die API erzeugt worden, für September 2026 und für das
  abgeschlossene Jahr 2024. Dabei zeigte sich, dass die Kontenliste einer BWA-Klasse gefüllt als
  Objekt und leer als Array kommt; beide Formen werden gelesen.

### Geändert

- Der Antwortvertrag kennt den Feldtyp `array` für Listen, deren Inhalt nicht geprüft wird.
- Die 54 Endpunktwerkzeuge wiegen jetzt **48.964 Token** (vorher 48.368) bei einer Grenze von
  49.000. Der Zuwachs sind die Ausgabeschemata der drei Berichte. Der Spielraum bis zur Grenze
  beträgt damit nur noch 36 Token.

## [0.1.0] - 2026-09-14

Erste Fassung auf npm, veröffentlicht über den Workflow `publish.yml` mit Provenance.

### Hinzugefügt

- MCP-Server für die BuchhaltungsButler-API v1 mit **54 Endpunktwerkzeugen, genau einem je
  Endpunkt**, jedes mit allen Parametern des Endpunkts. Wirkung dieser 54: 15 lesend, 24
  anlegend, 8 ändernd, 7 löschend. Dazu kommen **5 Bündelwerkzeuge** (Punkt unten), die keines
  davon ersetzen; bei allen zwölf aktiven Gruppen meldet der Server damit 59 Werkzeuge an.
- **Fünf Bündelwerkzeuge in der eigenen Gruppe `bundles`**, die je einen Arbeitsschritt aus
  mehreren Endpunkten in einem Aufruf erledigen: `bb_masterdata_search` sucht Zahlungskonto,
  Sachkonto, Debitor, Kreditor und Kostenstelle in einem Zug und liefert ohne `query` den
  Arbeitskontext für den Sitzungsanfang; `bb_records_collect` läuft über alle Seiten von
  Belegen, Zahlungen oder Buchungen und gibt Anzahl und Summe statt aller Zeilen;
  `bb_assignments_get` holt einen Beleg oder eine Zahlung samt allen zugeordneten Gegenstücken;
  `bb_reports_run` erzeugt BWA oder Summen- und Saldenliste, wartet auf die serverseitige
  Berechnung und liefert die fertige Auswertung im selben Aufruf; `bb_balances_get` liefert das
  Kontenblatt eines Kontos mit fortgeschriebenem Saldo.
  **Sie kommen zusätzlich und ersetzen kein einziges der 54 Endpunktwerkzeuge**, weil jedes
  Bündel nur den häufigen Weg abkürzt und dabei bewusst etwas weglässt; jede Beschreibung nennt
  ausdrücklich, welches Einzelwerkzeug für Felder, Sortierung oder Dateien weiterhin zuständig
  bleibt. Als eigene Gruppe sind sie über `BB_MCP_TOOL_GROUPS_EXCLUDE=bundles` **als Ganzes
  abschaltbar**, ohne eine Endpunktgruppe zu berühren; umgekehrt hängt `bundles` an keiner
  Endpunktgruppe, weil ein Bündel die HTTP-Schicht ruft und nicht die Endpunktwerkzeuge.
  **`bb_reports_run` ist das einzige schreibende unter ihnen**: `/reports/create/bwa` und
  `/reports/create/sums` ersetzen serverseitig den zuvor erzeugten Bericht desselben Typs im
  ganzen Mandanten. Es trägt deshalb Klasse `AR` mit `readOnlyHint: false` und
  `destructiveHint: true`, führt den Pflichtsatz U7 und **ist bei `BB_MCP_READ_ONLY=true`
  gesperrt**; die vier übrigen Bündel sind Klasse `R` und bleiben dort nutzbar.
- Werkzeugbeschreibungen, Fehlermeldungen und Serverbeschreibung auf Deutsch.
- Alle vier MCP-Annotationen an jedem der 59 Werkzeuge, ausdrücklich gesetzt:
  `destructiveHint: true` bei 14 Werkzeugen, `idempotentHint: true` bei 23,
  `openWorldHint: true` bei allen.
- Optionaler Nur-Lesen-Schalter `BB_MCP_READ_ONLY`, **standardmäßig aus**. Bei `true` lehnen die
  40 schreibenden Werkzeuge ab, bevor eine Anfrage hinausgeht; die Werkzeugliste bleibt
  unverändert sichtbar.
- Betrags-, Mengen- und Ratengrenzen über `BB_MCP_MAX_AMOUNT`, `BB_MCP_MAX_BATCH` und
  `BB_MCP_RATE_LIMIT`, ein optionaler Duplikatshinweis (`BB_MCP_DUPLICATE_CHECK`, Vorgabe aus)
  und ein optionaler Stammdatenspeicher (`BB_MCP_CACHE_TTL_MS`, Vorgabe aus).
- Einrichtungsassistent `bbutler-mcp setup` mit Verbindungstest, Mandantenbestätigung über die
  gefundenen Zahlungskonten, Sicherungskopien vor jeder Änderung und neun Clientadaptern plus
  einer Ausgabevariante für Zed, Continue und Jan.
- Diagnose `bbutler-mcp doctor` und Verbindungstest `bbutler-mcp test`, beide ohne jede Ausgabe
  von Zugangsdaten.
- Vier MCP-Resources: Kontenkunde, Wegweiser durch die Buchungswerkzeuge,
  Umsatzsteuerschlüssel und Kontenrahmen des Mandanten.
- Fehlerkatalog über alle **786 Paare** aus Pfad und `error_code` der Spezifikation.
- Vertragslauf `pnpm contract:read` gegen die 15 lesenden Endpunkte, hart auf diese begrenzt.
- **Abschaltbare Werkzeuggruppen über `BB_MCP_TOOL_GROUPS` und `BB_MCP_TOOL_GROUPS_EXCLUDE`**,
  Vorgabe: alle zwölf Gruppen an. Die Positivliste meldet nur die genannten Gruppen an, die
  Negativliste zieht Gruppen ab; abgeschaltete Werkzeuge werden **gar nicht erst registriert**.
  Der Schalter spart Kontext und begrenzt keinen Zugriff — dafür bleibt `BB_MCP_READ_ONLY`
  zuständig, und beide sind voneinander unabhängig. Ein unbekannter Gruppenname, ein
  Widerspruch zwischen beiden Variablen, ein Ausschluss ohne Wirkung und eine leere wirksame
  Menge sind Startfehler mit erklärender Meldung; ein leerer Wert gilt wie „nicht gesetzt".
  Aktive Gruppen, Zahl der angemeldeten Werkzeuge und gemessener Tokenpreis stehen in der
  Startmeldung, in `doctor`, in `print-config` und in den `instructions`. Das Desktop-Bundle
  führt das Feld als „Werkzeuggruppen". Die Gruppe steht als Feld `group` im Registereintrag und
  wird niemals aus dem Werkzeugnamen abgeleitet.
- **Ein zweites, getrenntes Tokenbudget `BUNDLE_DEFINITION_TOKEN_BUDGET` = 6.950** für die
  Gruppe `bundles`. Das Gesamtbudget von 49.000 Token bleibt unverändert und deckt weiterhin
  genau die 54 Endpunktwerkzeuge; beide Grenzen werden getrennt geprüft, damit sichtbar bleibt,
  was die Ergänzung kostet. Zuerst standen 7.000 im Raum, ausdrücklich als Schätzung mit
  großzügiger Luft, weil die Bündel noch nicht geschrieben waren; nach dem ersten Lauf von
  `pnpm measure-tokens` sollte die Zahl auf den gemessenen Stand zuzüglich einer kleinen Marge
  sinken. Gemessen sind **6.852 Token** (`gpt-tokenizer@4.0.0`, Kodierung `o200k_base`, über die
  Definition, wie `tools/list` sie ausliefert); 6.950 sind dieser Stand zuzüglich 98 Token Marge,
  also rund 1,4 Prozent und damit dasselbe Maß, in dem die 49.000 über ihren gemessenen 48.305
  liegen. Ein Zwischenstand von 6.800 stand auf einer veralteten Messung (6.675 Token, zwei der
  fünf Summanden sind danach gewachsen), lag unter dem ausgelieferten Stand und hat den Testlauf
  rot hinterlassen. Die gemessene Zahl und ihre fünf Summanden stehen seither ausschließlich in
  `src/registry/groups.ts`; `src/registry/budget.ts` verweist darauf, statt sie abzuschreiben, und
  `test/bundles/read-bundles-contract.test.ts` hält beide Zahlenreihen gegeneinander.
- `pnpm measure-tokens` weist die Tokenlast **je Werkzeuggruppe** aus und meldet, wenn die
  eingecheckte Gruppentabelle in `src/registry/groups.ts` der Messung davonläuft.
- Deutschsprachige README, [NOTICE.md](NOTICE.md), [SECURITY.md](SECURITY.md) und
  [CONTRIBUTING.md](CONTRIBUTING.md). Die Werkzeugtabellen der README werden aus dem Register
  erzeugt und in der CI dagegen geprüft.

### Geändert

- **Der Name des Servereintrags heißt `bbutler` statt `buchhaltungsbutler`.** Ein Client stellt
  den Eintragsnamen jedem Werkzeugnamen als `mcp__<name>__` voran, und die Messages API lässt
  für einen Werkzeugnamen höchstens 64 Zeichen zu. Mit dem alten Eintragsnamen kam
  `mcp__buchhaltungsbutler__bb_postings_create_for_transaction_batch` auf 65 Zeichen und fiel
  in einem solchen Client aus, erfahrungsgemäß ohne sprechende Meldung; mit `bbutler` sind es
  54 Zeichen und damit 10 Abstand. **Gekürzt wurde allein der Eintragsname**, kein einziger der
  59 Werkzeugnamen; am Werkzeugsatz ändert sich nichts. `SERVER_NAME` in
  `src/cli/clients/types.ts`, alle Clientblöcke der README und die Continue-Datei
  (`.continue/mcpServers/bbutler.yaml`) tragen denselben Namen, und
  `test/registry/name-length.test.ts` rechnet die Grenze für jedes Werkzeug gegen die Konstante
  nach. Ältere Installationen führen den Eintrag weiterhin unter `buchhaltungsbutler`:
  `LEGACY_SERVER_NAMES` hält den alten Namen fest, `bbutler-mcp uninstall` entfernt beide, und
  `bbutler-mcp setup` erkennt einen Alteintrag und ersetzt ihn mit `--overwrite`, statt einen
  zweiten daneben zu schreiben.
- **Das Kontextbudget der 54 Werkzeugdefinitionen steht auf 49.000 Token statt auf 32.000.** Das
  ist eine **ausdrückliche Entscheidung des Projektinhabers vom 2026-09-13** und keine
  stillschweigende Anhebung. Die ursprünglichen 32.000 Token waren **vorgerechnet und nicht
  gemessen**: Sie beruhten auf dem angenommenen Verhältnis von 3,2 Zeichen je Token. Die Messung
  vom 2026-09-12 mit `gpt-tokenizer@4.0.0` (Kodierung `o200k_base`), auf der die Entscheidung
  beruht, kam auf 48.305 Token, ein Überschuss von 16.305. Die vorgesehene Reihenfolge der
  Gegenmaßnahmen — erstens die sechs Sparmaßnahmen S1 bis S6 nachziehen, zweitens die
  Beschreibungen der Stufe 3 auf die untere Wortgrenze kürzen, drittens weitere Inhalte aus den
  Beschreibungen in Resources verschieben — kann diese Lücke nicht schließen, und das ist
  ausgerechnet statt behauptet: 16.305 Token
  sind rund 66.700 Zeichen, während alle 54 Werkzeugbeschreibungen zusammen nur 32.654 Zeichen
  lang sind — selbst wenn jede von ihnen vollständig in die Resources wanderte, wäre das weniger
  als die Hälfte. Übrig bliebe allein der Posten Parameterbeschreibungen mit 67.161 Zeichen, der
  damit praktisch ganz entfallen müsste; das widerspricht der Vorgabe, dass jeder Parameter
  eines Endpunkts genau einmal im Werkzeug erscheint, so wie Werkzeuge zu streichen oder
  zusammenzulegen der Vorgabe widerspricht, genau ein Werkzeug je Endpunkt auszuliefern.
  S6 ist dabei nachweislich umgesetzt, nämlich 0 Zeichen
  Feldbeschreibung in allen 54 Ausgabeschemata.
  **Der gemessene Stand sind heute 48.368 Token**, also 63 Token mehr als am 2026-09-12 und ein
  Überschuss von 16.368 gegenüber den vorgerechneten 32.000; die Lücke ist damit eher größer
  geworden, und die
  Rechnung darüber trägt unverändert. Die Grenze ist der am 2026-09-12 gemessene Stand zuzüglich
  **695 Token Luft** und ausdrücklich keine Erlaubnis zu wachsen; von dieser Luft sind nach der
  aktuellen Messung noch **632 Token** übrig. Sie trägt eine Umformulierung, aber weder ein
  weiteres Werkzeug noch ein Schemafeld von Gewicht. **P11
  (`test/registry/token-budget.test.ts`) bricht wieder hart an dieser Grenze ab**, statt den
  Überschuss nur auf stderr zu melden. Was das den Nutzer kostet, steht unverändert offen in
  Abschnitt 13 der README: rund 48.000 Token je Sitzung allein für diesen Server. Einzelheiten
  und die Postentabelle in `docs/entwicklung/tokenbudget.md`.
- **`TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT` ist entfallen.** Die Konstante war der Ersatz für
  ein Gesamtbudget, das nur noch warnte. Mit der Entscheidung oben ist das Gesamtbudget selbst
  wieder die harte Grenze; zwei harte Zahlen nebeneinander wären dieselbe Grenze zweimal.

### Bekannte, ausdrücklich benannte Unsicherheiten

Diese Punkte sind nicht gemessen und werden im Quelltext, in der README und hier als solche
geführt. Sie sind kein offener Fehler, sondern der ehrliche Stand.

- **Die Aufrufform von `bb_receipts_delete` und `bb_receipts_restore` ist abgeleitet, nicht
  gemessen.** Sie folgt der Form, die an `/receipts/get/<wert>` und `/transactions/get/<wert>`
  am 2026-09-12 lesend gemessen wurde. Beide Endpunkte sind schreibend und wurden deshalb nicht
  getestet; die Einträge tragen `verified: false`. Es liegt **kein Testmandat außerhalb der
  Produktivbuchhaltung** vor: Die einzigen vorhandenen Zugangsdaten öffnen die echte
  Buchhaltung, und ein Test- oder Demo-Mandant des Anbieters ist nirgends dokumentiert. Es wurde
  deshalb kein einziger schreibender Aufruf gegen die API ausgeführt.
- **Das Wiederholungsverhalten der löschenden und aufhebenden Werkzeuge ist nicht verifiziert.**
  Sie tragen deshalb alle `idempotentHint: false`.
- **Welche Währungen die Belegendpunkte annehmen, ist nicht verifiziert**; die Spezifikation
  widerspricht sich dort dreifach. Das Feld ist deshalb ein freier Text, und der Widerspruch
  steht in der Parameterbeschreibung.

### Sonstiges

- Node ab 22.19.0; genau drei Laufzeitabhängigkeiten
  (`@modelcontextprotocol/server`, `undici`, `zod`).
- `CHARS_PER_TOKEN` in `src/registry/budget.ts` steht nach der Messung mit `pnpm measure-tokens`
  auf `4` statt auf dem geschätzten Wert 3,2.

## [0.0.0]

Platzhalter ohne Inhalt. Er existiert nur, weil npm Trusted Publishing erst für ein bereits
veröffentlichtes Paket einrichten lässt. Auf npm als veraltet markiert; nicht verwenden.
