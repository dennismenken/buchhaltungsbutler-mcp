# Änderungsprotokoll

Alle bemerkenswerten Änderungen an diesem Projekt stehen in dieser Datei.

Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionsnummern
folgen der [Semantischen Versionierung](https://semver.org/lang/de/). Die Datei wird von Hand
gepflegt, und jede Veröffentlichung bekommt einen Eintrag.

## [Unveröffentlicht]

Stand der Arbeit vor der ersten Veröffentlichung. Version `0.1.0` ist **noch nicht auf npm
veröffentlicht**; es gibt daher bisher keinen abgeschlossenen Versionsabschnitt.

### Hinzugefügt

- MCP-Server für die BuchhaltungsButler-API v1 mit **54 Werkzeugen, genau einem je Endpunkt**,
  jedes mit allen Parametern des Endpunkts. Wirkung: 15 lesend, 24 anlegend, 8 ändernd, 7
  löschend.
- Werkzeugbeschreibungen, Fehlermeldungen und Serverbeschreibung auf Deutsch.
- Alle vier MCP-Annotationen an jedem Werkzeug, ausdrücklich gesetzt:
  `destructiveHint: true` bei 13 Werkzeugen, `idempotentHint: true` bei 19,
  `openWorldHint: true` bei allen.
- Optionaler Nur-Lesen-Schalter `BB_MCP_READ_ONLY`, **standardmäßig aus**. Bei `true` lehnen die
  39 schreibenden Werkzeuge ab, bevor eine Anfrage hinausgeht; die Werkzeugliste bleibt
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
- Deutschsprachige README, [NOTICE.md](NOTICE.md), [SECURITY.md](SECURITY.md) und
  [CONTRIBUTING.md](CONTRIBUTING.md). Die Werkzeugtabellen der README werden aus dem Register
  erzeugt und in der CI dagegen geprüft.

### Geändert

- **Das Kontextbudget der 54 Werkzeugdefinitionen steht auf 49.000 Token statt auf 32.000.** Das
  ist eine **ausdrückliche Entscheidung des Projektinhabers vom 2026-09-13** und keine
  stillschweigende Anhebung. Plan 4.10 hatte 32.000 Token vorgerechnet; gemessen wurden am
  2026-09-12 mit `gpt-tokenizer@4.0.0` (Kodierung `o200k_base`) **48.305 Token**, ein Überschuss
  von 16.305. Die Reihenfolge der Gegenmaßnahmen aus Plan 4.10 kann diese Lücke nicht schließen,
  und das ist ausgerechnet statt behauptet: 16.305 Token sind rund 66.700 Zeichen, während alle
  54 Werkzeugbeschreibungen zusammen nur 32.654 Zeichen lang sind — selbst wenn jede von ihnen
  vollständig in die Resources wanderte, wäre das weniger als die Hälfte. Übrig bliebe allein
  der Posten Parameterbeschreibungen mit 67.161 Zeichen, der damit praktisch ganz entfallen
  müsste; das widerspricht E6, so wie Werkzeuge zu streichen oder zusammenzulegen E1
  widerspricht. S6 ist dabei nachweislich umgesetzt, nämlich 0 Zeichen Feldbeschreibung in allen
  54 Ausgabeschemata.
  Die neue Zahl ist der gemessene Stand zuzüglich **695 Token Luft** und ausdrücklich keine
  Erlaubnis zu wachsen: Diese Luft trägt eine Umformulierung, aber weder ein weiteres Werkzeug
  noch ein Schemafeld von Gewicht. **P11 (`test/registry/token-budget.test.ts`) bricht wieder
  hart an dieser Grenze ab**, statt den Überschuss nur auf stderr zu melden. Was das den Nutzer
  kostet, steht unverändert offen in Abschnitt 13 der README: rund 48.000 Token je Sitzung
  allein für diesen Server. Einzelheiten und die Postentabelle in
  `docs/entwicklung/befund-tokenbudget.md`.
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
  Produktivbuchhaltung** vor, siehe `docs/entwicklung/befund-schreibend.md`.
- **Das Wiederholungsverhalten der löschenden und aufhebenden Werkzeuge ist nicht verifiziert.**
  Sie tragen deshalb alle `idempotentHint: false`.
- **Welche Währungen die Belegendpunkte annehmen, ist nicht verifiziert**; die Spezifikation
  widerspricht sich dort dreifach. Das Feld ist deshalb ein freier Text, und der Widerspruch
  steht in der Parameterbeschreibung.

### Sonstiges

- Node ab 22.19.0; genau drei Laufzeitabhängigkeiten
  (`@modelcontextprotocol/server`, `undici`, `zod`).
- `CHARS_PER_TOKEN` in `src/registry/budget.ts` steht nach der Messung aus AP14 auf `4` statt
  auf dem geschätzten Wert 3,2.
