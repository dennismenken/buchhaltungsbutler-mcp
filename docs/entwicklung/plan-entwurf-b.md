# Implementierungsplan, Entwurf B: das Erlebnis des aufrufenden Agenten zuerst

Vollständiger, umsetzbarer Plan für den inoffiziellen BuchhaltungsButler-MCP-Server.
Adressat ist ein Implementierungs-Agent, der ihn ohne Rückfrage abarbeiten soll.

**Stand:** 2026-09-12. **Blickwinkel:** Agentenerlebnis. Gemessen wird dieser Entwurf daran,
ob ein KI-Agent mit 54 Werkzeugen auf Anhieb richtig arbeitet: ob er den richtigen Endpunkt
findet, ob er Konto und Sachkonto nicht verwechselt, ob er merkt, wann er etwas
Unumkehrbares tut, ob er aus Fehlern lernt statt zu raten, und ob die Werkzeugdefinitionen
in ein Kontextfenster passen.

---

## Vorrangregeln für diesen Plan

1. Die verbindlichen Entscheidungen des Projektinhabers E1 bis E6 gehen allem vor. Wo ein
   Dossier etwas anderes empfiehlt, gilt E1 bis E6, und dieser Plan nennt die Abweichung.
2. Danach gilt `docs/api/grundlagen.md` für das Verhalten der API, `docs/api/fehlercodes.md`
   für Fehler, `docs/entwicklung/tool-design.md` für Werkzeugentwurf,
   `docs/entwicklung/mcp-sdk-typescript.md` für SDK-Fragen, `docs/entwicklung/toolchain.md`
   für Versionen, `docs/entwicklung/distribution.md` für Installation.
3. Was hier als **nicht verifiziert** oder **Annahme** steht, ist genau das. Es wird nicht
   stillschweigend zu einer Tatsache gemacht.

### Was dieser Plan gegenüber den Dossiers ändert

| Dossier-Aussage | Dieser Plan | Grund |
| --- | --- | --- |
| `tool-design.md` 3.5: 34 Werkzeuge, Zielkorridor 28 bis 34 | **54 Werkzeuge, eines je Endpunkt** | E1 |
| `tool-design.md` 3.5: `bb_receipts_get` und `bb_transactions_get` werden nicht ausgeliefert | **werden ausgeliefert**, mit ehrlicher Beschreibung des Zustands und einem Vorabtest in AP0 | E1 und E6 verlangen Vollständigkeit; ein fehlendes Werkzeug erzeugt beim Agenten die falsche Annahme, die Fähigkeit existiere nicht |
| `tool-design.md` 9.3: Klasse M (ändernd) mit `destructiveHint: false` | **`destructiveHint: true`** bei den vier Überschreib-Werkzeugen | Ein Überschreiben ohne abrufbaren Vorzustand ist nach der MCP-Definition kein rein additives Update |
| `tool-design.md` 10.3: alle Definitionen zusammen unter 10.000 Token | **Budget 26.000 Token**, begründet und gemessen | Mit 54 Endpunktwerkzeugen ist 10.000 arithmetisch nicht erreichbar, ohne Parameter oder Beschreibungen zu opfern. Abschnitt 4.6 rechnet das vor |
| `distribution.md` 13.2: `BB_READ_ONLY` | **`BB_MCP_READ_ONLY`** ist kanonisch, `BB_READ_ONLY` wird als Alias akzeptiert | Der in `tool-design.md` 9.5 wortwörtlich vorgeschriebene Absagetext nennt `BB_MCP_READ_ONLY`. Der Namenskonflikt zwischen beiden Dossiers wird hier aufgelöst, nicht verschwiegen |
| `distribution.md` 13.2: Abbruch bei fehlender Konfiguration | **Start im Zustand "nicht konfiguriert"**, laute Warnung auf stderr, jeder Werkzeugaufruf antwortet mit einer konkreten Anleitung | Ein abgestürzter Server sagt dem Agenten nichts. Kein stiller Start, aber ein diagnostizierbarer. Abschnitt 6.4 begründet es |

---

## Inhalt

1. [Leitidee und Architektur](#1-leitidee-und-architektur)
2. [Dateibaum](#2-dateibaum)
3. [Die 54 Werkzeuge](#3-die-54-werkzeuge)
4. [Eingabeschemata](#4-eingabeschemata)
5. [HTTP-Schicht](#5-http-schicht)
6. [Konfiguration](#6-konfiguration)
7. [Antwortaufbereitung](#7-antwortaufbereitung)
8. [Einrichtungsassistent](#8-einrichtungsassistent)
9. [Teststrategie](#9-teststrategie)
10. [README-Gliederung](#10-readme-gliederung)
11. [Arbeitspakete](#11-arbeitspakete)
12. [Risiken und offene Punkte](#12-risiken-und-offene-punkte)
13. [Anhang A: Live-Befunde vom 2026-09-12](#anhang-a-live-befunde-vom-2026-09-12)
14. [Anhang B: Feldumbenennungen](#anhang-b-feldumbenennungen)

---

## 1. Leitidee und Architektur

### 1.1 Die Leitidee in drei Sätzen

Der Server ist eine **dünne, ehrliche Durchreiche mit dickem Beipackzettel**: 54 Werkzeuge,
eines je Endpunkt, ohne verborgene Logik, aber jedes mit einem Namen, einer Beschreibung,
einem Schema und einer Fehlermeldung, aus denen ein Agent ohne Vorwissen die richtige
Entscheidung ableiten kann. Alles, was für alle Werkzeuge gleich gilt, steht genau einmal in
den `instructions` des Servers und in den MCP-Resources, nicht 54-mal in den Definitionen.
Jede Antwort beantwortet drei Fragen, ohne dass der Agent sie stellen muss: Was habe ich
bekommen, ist das vollständig, und was ist der nächste sinnvolle Aufruf.

### 1.2 Die Schichten

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MCP-Client (Claude Code, Claude Desktop, Codex CLI)                          │
│   sieht: 54 Werkzeuge + instructions + Resources. Entscheidet über Freigabe. │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ stdio, JSON-RPC, Revision 2025-11-25
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ (1) SERVER      server.ts, McpServer des SDK                                 │
│     registriert 54 Werkzeuge aus der Registry, setzt instructions            │
├──────────────────────────────────────────────────────────────────────────────┤
│ (2) REGISTRY    tools/registry.ts + tools/manifest/*.ts                      │
│     54 Manifesteinträge: Name, Titel, Klasse, Endpunkt, Texte, Felder,       │
│     Feldabbildung, Projektionen. Einzige Wahrheitsquelle für Werkzeuge.      │
├──────────────────────────────────────────────────────────────────────────────┤
│ (3) GUARDS      guards/*.ts   vor jeder Ausführung, Reihenfolge fest         │
│     Konfigurationszustand → Nur-Lesen-Schalter → Schemavalidierung →         │
│     Batchgrenze → Betragsgrenze → Duplikatshinweis (blockiert nicht)         │
├──────────────────────────────────────────────────────────────────────────────┤
│ (4) REQUEST-MAPPER  mapping/request.ts, mapping/parallel-arrays.ts           │
│     Werkzeugargumente → API-Body: Umbenennungen zurück, Positionsliste →     │
│     parallele Arrays, Typkonversion, api_key aus der Konfiguration einsetzen │
├──────────────────────────────────────────────────────────────────────────────┤
│ (5) HTTP        http/client.ts, rate-limiter.ts, retry.ts, envelope.ts       │
│     Basic Auth, Timeout, Abbruchsignal, Token-Bucket, Retry nur lesend,      │
│     Content-Type-Prüfung, Umschlagserkennung                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ (6) FEHLER      errors/catalog.generated.ts, classify.ts, render.ts          │
│     (Pfad, error_code) → Klasse → Vierblock-Lehrtext                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ (7) RESPONSE-MAPPER  mapping/response.ts, projections.ts                     │
│     "0"/"1" → boolean, Betragsstrings → normalisiert, Feldprojektion         │
│     concise/detailed, Auflösung von Kennungen zu sprechenden Werten          │
├──────────────────────────────────────────────────────────────────────────────┤
│ (8) PRÄSENTATION   presentation/*.ts                                         │
│     structuredContent + Markdown-Text, Kürzung, Anschlusshinweis             │
├──────────────────────────────────────────────────────────────────────────────┤
│ (9) AUDIT       audit/logger.ts, ausschließlich stderr, ohne Geheimnisse     │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS POST, JSON
                        BuchhaltungsButler API v1
```

### 1.3 Der Weg eines Aufrufs, Schritt für Schritt

Beispiel `bb_postings_create_free` mit einer Splitbuchung aus zwei Positionen.

1. **Client** sendet `tools/call` mit `{date, postingtext, positions:[{...},{...}], ...}`.
2. **Server** schlägt den Manifesteintrag nach. Liegt der Name nicht vor, antwortet er mit
   einem Protokollfehler; das ist der einzige Fall, in dem ein Protokollfehler entsteht.
3. **Guard 1, Konfiguration.** Sind Zugangsdaten unvollständig, endet der Aufruf hier mit
   `isError: true` und der Anleitung aus Abschnitt 6.4. Kein Request geht ab.
4. **Guard 2, Nur-Lesen.** Klasse ist `anlegend`, also greift `BB_MCP_READ_ONLY`, falls
   gesetzt. Absagetext nach `tool-design.md` 9.5. Kein Request geht ab.
5. **Guard 3, Schema.** Zod validiert streng, `additionalProperties: false`. Ein Tippfehler im
   Feldnamen wird hier gefangen. Das ist nicht kosmetisch: die API ignoriert unbekannte
   Felder kommentarlos (Live-Befund L5 in Anhang A), ein Tippfehler wäre also ohne diese
   Prüfung ein stiller Datenfehler.
6. **Guard 4, Batchgrenze.** `positions.length` gegen `BB_MCP_MAX_BATCH`.
7. **Guard 5, Betragsgrenze.** Nur wenn `BB_MCP_MAX_AMOUNT` gesetzt ist.
8. **Guard 6, Duplikatshinweis.** Ein lesender Zusatzaufruf sucht nach einem fachlich
   gleichen Datensatz. Ein Treffer blockiert nicht, er wandert in die Antwort. Kostet ein
   Token aus dem Rate-Limit-Bucket, deshalb abschaltbar über `BB_MCP_DUPLICATE_CHECK=off`.
9. **Request-Mapper.** `positions` wird in die parallelen Arrays der API zerlegt, mit
   Längenprüfung; `payment_account_number` wird zurück auf `account` übersetzt; `api_key`
   kommt aus der Konfiguration und niemals aus den Argumenten.
10. **Rate-Limiter.** Token aus dem `general`-Bucket, bei Batch-Endpunkten zusätzlich aus
    `batch`. Serialisiert über eine Promise-Kette je Bucket.
11. **HTTP.** `POST` mit Basic Auth, `Content-Type: application/json`, Timeout,
    `extra.signal` durchgereicht. Kein Cookie-Jar.
12. **Antwortprüfung.** Erst Content-Type: ist er nicht JSON, entsteht sofort ein
    Diagnosefehler mit den ersten 200 Zeichen des Körpers, niemals rohes HTML. Dann
    `success === false` prüfen, nicht das Vorhandensein von `error_code`.
13. **Fehler oder Erfolg.** Im Fehlerfall Abschnitt 5.5. Im Erfolgsfall Response-Mapper und
    Präsentation.
14. **Antwort.** `structuredContent` mit der erzeugten Buchung, `content` mit einer Tabelle,
    dem benutzten Endpunkt, dem Umkehrweg und, falls zutreffend, dem Duplikatshinweis.
15. **Audit.** Eine Zeile auf stderr: Zeitstempel, Werkzeug, Klasse, Endpunkt, Dauer,
    Ergebnisstatus, Argumentnamen ohne Werte.

### 1.4 Was der Server ausdrücklich nicht tut

- Er fasst keine Endpunkte zusammen und erfindet keine Komfortwerkzeuge (E1).
- Er sperrt im Auslieferungszustand nichts (E2).
- Er fragt nicht nach. Kein `confirm`, kein Trockenlauf (`tool-design.md` 9.4).
- Er wiederholt keinen schreibenden Aufruf automatisch (`grundlagen.md` 7.1).
- Er blättert nicht selbsttätig durch Seiten, ohne es auszuweisen.
- Er schreibt nichts auf stdout außer dem MCP-Protokoll.

---

## 2. Dateibaum

```
buchhaltungsbutler-mcp/
├── package.json                         Paket @dennismenken/buchhaltungsbutler-mcp, bin bbutler-mcp
├── tsconfig.json                        NodeNext, strict, target ES2022
├── tsdown.config.ts                     Bündelung nach dist/, Shebang und Modus 755 sicherstellen
├── eslint.config.js                     Flat Config, no-console außer error
├── biome.json                           Formatierung
├── vitest.config.ts                     Testlauf, Abdeckungsschwellen
├── LICENSE                              MIT
├── README.md                            deutsch, Gliederung in Abschnitt 10
├── CHANGELOG.md                         Keep a Changelog
├── .github/workflows/ci.yml             Typecheck, Lint, Test, Integrationstest
├── .github/workflows/release.yml        Trusted Publishing mit Provenance, Bundle vor Publish
├── manifest.json                        MCPB-Bundle-Manifest, Werkzeugliste aus der Registry erzeugt
├── docs/                                bestehende Dossiers, unverändert
├── scripts/
│   ├── extract-spec.ts                  OpenAPI → src/generated/spec-inventory.json
│   ├── extract-errors.ts                OpenAPI → src/generated/error-catalog.ts, Schlüssel (Pfad, code)
│   ├── check-coverage.ts                prüft Manifest gegen Inventar, bricht bei Lücke ab
│   ├── measure-tokens.ts                zählt Token aller Definitionen, bricht über Budget ab
│   └── build-mcpb.ts                    erzeugt das MCPB-Bundle aus der Registry
├── src/
│   ├── cli.ts                           Shebang, Unterbefehlsverteilung, Standardfall stdio-Server
│   ├── index.ts                         programmatischer Export createServer()
│   ├── server.ts                        McpServer aufbauen, 54 Werkzeuge registrieren, instructions setzen
│   ├── version.ts                       Version aus package.json, mit Test gegen stilles Scheitern
│   ├── config/
│   │   ├── env.ts                       Umgebungsvariablen lesen und mit Zod validieren
│   │   ├── credentials.ts               Zugangsdatendatei, Profile, Rechteprüfung 0600
│   │   ├── resolve.ts                   Auflösungsreihenfolge env vor Datei, Zustand "nicht konfiguriert"
│   │   └── instructions.ts              Servertext, abhängig von Schalterlage und Konfigurationszustand
│   ├── http/
│   │   ├── client.ts                    POST, Basic Auth, Timeout, Abbruch, Content-Type-Prüfung
│   │   ├── rate-limiter.ts              Token-Buckets general/batch/upload, serialisiert
│   │   ├── retry.ts                     Wiederholpolitik, ausschließlich lesend
│   │   └── envelope.ts                  Erfolgs- und Fehlerumschlag erkennen und typisieren
│   ├── errors/
│   │   ├── catalog.generated.ts         718 Einträge, Schlüssel Pfad plus error_code (erzeugt)
│   │   ├── classify.ts                  Klassen Konfiguration, Eingabe, transient, endgültig, Kontingent
│   │   ├── render.ts                    Vierblock-Fehlertext nach tool-design.md 8.2
│   │   ├── write-uncertain.ts           Sonderfall Timeout oder Netzfehler bei Schreibaufruf
│   │   └── redact.ts                    entfernt Zugangsdaten aus jedem Text vor der Ausgabe
│   ├── tools/
│   │   ├── types.ts                     Manifesttypen: ToolSpec, FieldSpec, Klasse, Projektion
│   │   ├── registry.ts                  führt die 11 Manifestdateien zusammen, prüft Eindeutigkeit
│   │   ├── classes.ts                   Wirkungsklasse je Werkzeug plus Annotationsableitung
│   │   ├── schema-builder.ts            Manifest → Zod-Schema → JSON Schema
│   │   ├── vocab.ts                     geteilte Bausteine: Datum, Betrag, Währung, Umsatzsteuerschlüssel
│   │   └── manifest/
│   │       ├── receipts.ts              8 Werkzeuge
│   │       ├── transactions.ts          8 Werkzeuge
│   │       ├── invoices.ts              3 Werkzeuge
│   │       ├── postings.ts              12 Werkzeuge
│   │       ├── debtors.ts               4 Werkzeuge
│   │       ├── creditors.ts             4 Werkzeuge
│   │       ├── postingaccounts.ts       3 Werkzeuge
│   │       ├── payment-accounts.ts      2 Werkzeuge
│   │       ├── comments.ts              1 Werkzeug
│   │       ├── cost-locations.ts        4 Werkzeuge
│   │       └── reports.ts               5 Werkzeuge
│   ├── mapping/
│   │   ├── request.ts                   Werkzeugargumente → API-Body, Umbenennungen zurück
│   │   ├── parallel-arrays.ts           Positionsliste ↔ parallele Arrays, Längeninvariante
│   │   ├── response.ts                  Typnormalisierung, Nullbarkeit, unbekannte Felder erhalten
│   │   └── projections.ts               concise-Feldlisten je Ressource
│   ├── presentation/
│   │   ├── render-list.ts               Markdown-Tabelle plus structuredContent
│   │   ├── render-single.ts             Einzelobjekt lesbar plus structuredContent
│   │   ├── render-write.ts              Schreibbestätigung mit aufgelöstem Datensatz und Umkehrweg
│   │   ├── truncate.ts                  weiche und harte Token-Grenze, Ausweis der Kürzung
│   │   └── next-step.ts                 Anschlusshinweis mit konkretem nächsten Aufruf
│   ├── guards/
│   │   ├── read-only.ts                 BB_MCP_READ_ONLY, liest die Klasse aus classes.ts
│   │   ├── batch-limit.ts               BB_MCP_MAX_BATCH
│   │   ├── amount-limit.ts              BB_MCP_MAX_AMOUNT, standardmäßig aus
│   │   └── duplicate-check.ts           lesender Vorabgriff, blockiert nie
│   ├── resources/
│   │   ├── index.ts                     Registrierung der Resources
│   │   ├── guide-postings.ts            bb://guide/postings, Wegweiser durch die 12 Buchungswerkzeuge
│   │   ├── guide-accounts.ts            bb://guide/accounts, Konto gegen Sachkonto
│   │   ├── vat-keys.ts                  bb://vat-keys, 23 Umsatzsteuerschlüssel mit deutschen Labels
│   │   └── postingaccounts.ts           bb://postingaccounts, Kontenrahmen des Mandanten, kurz gecacht
│   ├── upload/
│   │   ├── source.ts                    Dateiquelle: base64, file://, http(s)://
│   │   ├── ssrf.ts                      Adressprüfung je Redirect-Hop, Magic Bytes, Bytezählung
│   │   └── local-file.ts                realpath, O_NOFOLLOW, Prüfungen am selben Deskriptor
│   ├── setup/
│   │   ├── assistant.ts                 Ablauf aus Abschnitt 8
│   │   ├── doctor.ts                    Diagnose ohne Geheimnisse
│   │   ├── print-config.ts              Konfigurationsblock je Client ausgeben
│   │   └── clients/                     je Client eine Datei: claude-code, claude-desktop, codex, …
│   ├── audit/logger.ts                  stderr-Protokoll, Stufen über BB_LOG_LEVEL
│   └── generated/
│       ├── spec-inventory.json          54 Endpunkte mit 371 Parametern, HTML bereinigt (erzeugt)
│       └── .gitkeep
└── test/
    ├── contract/coverage.test.ts        54 Endpunkte, jeder Parameter genau einmal abgebildet
    ├── contract/names.test.ts           Regex, Präfix, Eindeutigkeit, Verbliste, Länge
    ├── contract/annotations.test.ts     vier Hints je Werkzeug, Werte gegen die Klassentabelle
    ├── contract/descriptions.test.ts    Pflichtsätze je Klasse, Längenkorridore je Stufe
    ├── contract/token-budget.test.ts    Gesamtbudget und Einzelbudgets
    ├── contract/secrets.test.ts         kein Zugangsdatum in Definition, Antwort, Fehlertext
    ├── unit/…                           Mapper, Umschlag, Fehlerklassen, Kürzung, Rate-Limiter
    ├── integration/server.test.ts       gebauten Server starten, initialize, tools/list, tools/call
    ├── integration/read-only.test.ts    Gegenprobe mit und ohne Schalter
    ├── fixtures/                        aus den belegten Live-Beobachtungen abgeleitete Antworten
    └── live/read-only-smoke.test.ts     nur mit BB_LIVE_TEST=1, Allowlist der 15 lesenden Pfade
```

---

## 3. Die 54 Werkzeuge

### 3.1 Namensschema

Übernommen aus `tool-design.md` 4.1 bis 4.4:

```
bb_<ressource>_<verb>[_<qualifizierer>]
```

- snake_case, durchgehend klein, Präfix `bb_`, keine Punkte.
- Jeder Name erfüllt `^[a-z][a-z0-9_]{2,39}$`, also höchstens 40 Zeichen.
- Ressource vor Verb, Ressource im Plural.
- Kein Name doppelt.

### 3.2 Vier begründete Abweichungen vom Dossier

**A1. Zwei zusätzliche Verben: `unassign` und `list`.** Die geschlossene Liste in
`tool-design.md` 4.4 kennt `assign`, aber kein `unassign`, weil der 34er-Schnitt das
Aufheben unter `bb_links_delete` geführt hat. Bei 54 Werkzeugen braucht
`/transactions/unassign/receipt` einen eigenen Namen. `unassign` ist das Wort, das die API
selbst im Pfad verwendet, und das Paar `assign`/`unassign` ist genau die Symmetrie, an der
ein Agent die Umkehrbarkeit ablesen soll. `list` steht bereits in der Liste und wird hier
zusätzlich für die beiden Zuordnungsabfragen genutzt, weil sie keine Filter kennen.

**A2. Qualifizierer nach fester Regel: Ziel im Singular, `_batch` für die Mehrfachvariante.**
Also `bb_postings_create_for_receipt` und `bb_postings_create_for_receipt_batch`. Die
naheliegende Pluralform `..._for_receipts_batch` scheitert an der Längengrenze:
`bb_postings_create_for_transactions_batch` hätte 41 Zeichen und verstieße gegen 11.2. Die
Singularregel hält alle Namen bei höchstens 40 Zeichen; der längste Name ist
`bb_postings_create_for_transaction_batch` mit genau 40.

**A3. Fachliche Ressource statt Pfadsegment bei `/settings/*` und `/accounts/*`.** Die Pfade
bündeln unter `settings` drei fachlich verschiedene Dinge. Ein Präfix `bb_settings_` würde
Debitoren, Kreditoren und Sachkonten in eine gemeinsame Suchgruppe werfen und damit genau die
Verwechslung erzeugen, die der Präfix verhindern soll. Deshalb `bb_debtors_*`,
`bb_creditors_*`, `bb_postingaccounts_*`. Ein Agent, dessen Nutzer "Kreditor" sagt, findet
`bb_creditors_search` und nicht eine Einstellungsgruppe.

**A4. `/accounts/*` wird `bb_payment_accounts_*`.** Das ist die wichtigste Namensentscheidung
dieses Entwurfs und Abschnitt 3.4 begründet sie ausführlich. Die Schreibweise weicht
bewusst von `bb_postingaccounts_*` ab: Wo die API einen eigenen Bezeichner führt
(`postingaccount_number` ist ein realer Feldname), übernehmen wir ihn zusammengeschrieben;
wo wir einen Begriff aus dem Fliesstext der Spezifikation wählen ("payment account", zwei
Wörter), schreiben wir ihn in snake_case aus.

### 3.3 Die vollständige Tabelle

Spalte **Wirkung** nach `grundlagen.md` 7.3. Spalten `readOnlyHint`, `destructiveHint`,
`idempotentHint` sind die tatsächlich gesetzten Werte. `openWorldHint` ist bei allen 54
Werkzeugen `true` und deshalb keine eigene Spalte.

| # | Werkzeugname | API-Pfad | Wirkung | readOnly | destructive | idempotent | Kurzbeschreibung |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bb_receipts_search` | `/receipts/get` | lesend | ja | nein | ja | Belege filtern und seitenweise auflisten; Eingang oder Ausgang ist Pflicht. |
| 2 | `bb_receipts_get` | `/receipts/get/id_by_customer` | lesend | ja | nein | ja | Einen Beleg über seine Mandantennummer holen, auf Wunsch mit Dateiinhalt. |
| 3 | `bb_receipts_create` | `/receipts/add` | anlegend | nein | nein | nein | Beleg ohne Datei anlegen; Gegenpartei, Nummer, Datum, Betrag, Währung Pflicht. |
| 4 | `bb_receipts_create_batch` | `/receipts/addBatch` | anlegend | nein | nein | nein | Bis zu 50 Belege ohne Datei in einem Aufruf anlegen. |
| 5 | `bb_receipts_upload` | `/receipts/upload` | anlegend | nein | nein | nein | Belegdatei hochladen, stößt die Texterkennung an; eigenes Limit 10 je Minute. |
| 6 | `bb_receipts_delete` | `/receipts/delete/id_by_customer` | löschend | nein | ja | ja | Beleg als gelöscht markieren; umkehrbar über `bb_receipts_restore`. |
| 7 | `bb_receipts_restore` | `/receipts/restore/id_by_customer` | ändernd | nein | nein | ja | Einen als gelöscht markierten Beleg wieder buchungsrelevant machen. |
| 8 | `bb_receipts_list_transactions` | `/receipts/assigned-transactions/get` | lesend | ja | nein | ja | Zahlungen auflisten, die einem bestimmten Beleg zugeordnet sind. |
| 9 | `bb_transactions_search` | `/transactions/get` | lesend | ja | nein | ja | Zahlungen filtern nach Zeitraum, Konto, Gegenpartei oder Nummernbereich. |
| 10 | `bb_transactions_get` | `/transactions/get/id_by_customer` | lesend | ja | nein | ja | Eine einzelne Zahlung über ihre Mandantennummer holen. |
| 11 | `bb_transactions_create` | `/transactions/add` | anlegend | nein | nein | nein | Zahlung auf einem Zahlungskonto anlegen; verändert Kontostand und Abstimmung. |
| 12 | `bb_transactions_create_batch` | `/transactions/addBatch` | anlegend | nein | nein | nein | Bis zu 50 Zahlungen in einem Aufruf anlegen; Mindestabstand 5 Sekunden. |
| 13 | `bb_transactions_assign_receipt` | `/transactions/assign/receipt` | ändernd | nein | nein | nein | Einen Beleg einer Zahlung zuordnen; umkehrbar über `bb_transactions_unassign_receipt`. |
| 14 | `bb_transactions_assign_receipt_batch` | `/transactions/assign-batch/receipt` | ändernd | nein | nein | nein | Bis zu 50 Beleg-Zahlungs-Zuordnungen in einem Aufruf herstellen. |
| 15 | `bb_transactions_unassign_receipt` | `/transactions/unassign/receipt` | löschend | nein | ja | ja | Zuordnung Beleg zu Zahlung lösen; scheitert bei bestätigter Buchung. |
| 16 | `bb_transactions_list_receipts` | `/transactions/assigned-receipts/get` | lesend | ja | nein | ja | Belege auflisten, die einer bestimmten Zahlung zugeordnet sind. |
| 17 | `bb_invoices_create` | `/invoices/create` | anlegend | nein | nein | nein | Ausgangsrechnung, Gutschrift oder Angebot endgültig erzeugen; kein Storno über die API. |
| 18 | `bb_invoices_create_einvoice` | `/invoices/create/e-invoice` | anlegend | nein | nein | nein | E-Rechnung mit Steuerart je Position erzeugen; strengste Feldprüfung der API. |
| 19 | `bb_invoices_create_draft` | `/invoices/create/draft` | anlegend | nein | nein | nein | Rechnungsentwurf erzeugen, ohne endgültige Nummernvergabe. |
| 20 | `bb_postings_search` | `/postings/get` | lesend | ja | nein | ja | Buchungssätze eines Zeitraums lesen; Zeitraum Pflicht, höchstens 1000 je Aufruf. |
| 21 | `bb_postings_create_for_receipt` | `/postings/add/receipt` | anlegend | nein | nein | nein | Buchungssätze zu einem Beleg anlegen, Splitbuchung über eine Positionsliste. |
| 22 | `bb_postings_create_for_receipt_batch` | `/postings/add-batch/receipts` | anlegend | nein | nein | nein | Buchungssätze zu mehreren Belegen in einem Aufruf anlegen. |
| 23 | `bb_postings_create_for_transaction` | `/postings/add/transaction` | anlegend | nein | nein | nein | Buchungssätze zu einer Zahlung anlegen, mit Zuordnung offener Posten. |
| 24 | `bb_postings_create_for_transaction_batch` | `/postings/add-batch/transactions` | anlegend | nein | nein | nein | Buchungssätze zu mehreren Zahlungen in einem Aufruf anlegen. |
| 25 | `bb_postings_create_free` | `/postings/add/free` | anlegend | nein | nein | nein | Freie Buchung ohne Beleg- und Zahlungsbezug; Soll und Haben direkt angeben. |
| 26 | `bb_postings_create_free_batch` | `/postings/add-batch/free` | anlegend | nein | nein | nein | Mehrere freie Buchungen in einem Aufruf anlegen. |
| 27 | `bb_postings_unconfirm_for_receipt` | `/postings/unconfirm/receipt` | löschend | nein | ja | ja | Nicht festgeschriebene Buchungen eines Belegs entfernen. |
| 28 | `bb_postings_unconfirm_for_transaction` | `/postings/unconfirm/transaction` | löschend | nein | ja | ja | Nicht festgeschriebene Buchungen einer Zahlung entfernen. |
| 29 | `bb_postings_unconfirm_free` | `/postings/unconfirm/free` | löschend | nein | ja | ja | Eine nicht festgeschriebene freie Buchung entfernen. |
| 30 | `bb_postings_assign_receipt` | `/postings/assign/receipt-to-free-posting` | ändernd | nein | nein | nein | Beleg an eine freie Buchung binden; die API kennt kein Gegenstück zum Lösen. |
| 31 | `bb_postings_cancel` | `/postings/cancel` | löschend | nein | ja | nein | Buchung stornieren; festgeschriebene erzeugen eine dauerhafte Stornobuchung. |
| 32 | `bb_debtors_search` | `/settings/get/debtors` | lesend | ja | nein | ja | Debitorenkonten auflisten; Standardgrenze der API ist 25, deshalb `limit` setzen. |
| 33 | `bb_debtors_create` | `/settings/add/debtor` | anlegend | nein | nein | nein | Debitorenkonto anlegen; die API kennt keinen Löschendpunkt dafür. |
| 34 | `bb_debtors_create_batch` | `/settings/add-batch/debtors` | anlegend | nein | nein | nein | Mehrere Debitorenkonten in einem Aufruf anlegen. |
| 35 | `bb_debtors_update` | `/settings/update/debtor` | ändernd | nein | ja | ja | Stammdaten eines Debitorenkontos überschreiben; kein Vorzustand abrufbar. |
| 36 | `bb_creditors_search` | `/settings/get/creditors` | lesend | ja | nein | ja | Kreditorenkonten auflisten; Standardgrenze der API ist 25, deshalb `limit` setzen. |
| 37 | `bb_creditors_create` | `/settings/add/creditor` | anlegend | nein | nein | nein | Kreditorenkonto anlegen; die API kennt keinen Löschendpunkt dafür. |
| 38 | `bb_creditors_create_batch` | `/settings/add-batch/creditors` | anlegend | nein | nein | nein | Mehrere Kreditorenkonten in einem Aufruf anlegen. |
| 39 | `bb_creditors_update` | `/settings/update/creditor` | ändernd | nein | ja | ja | Stammdaten eines Kreditorenkontos überschreiben; kein Vorzustand abrufbar. |
| 40 | `bb_postingaccounts_search` | `/settings/get/postingaccounts` | lesend | ja | nein | ja | Vereinigte Kontenliste: Sachkonten, Zahlungskonten, Debitoren, Kreditoren. |
| 41 | `bb_postingaccounts_create` | `/settings/add/postingaccount` | anlegend | nein | nein | nein | Neues Sachkonto anlegen; es erbt Eigenschaften vom Elternkonto. |
| 42 | `bb_postingaccounts_update` | `/settings/update/postingaccount` | ändernd | nein | ja | ja | Namen eines Sachkontos überschreiben; wirkt auf bestehende Buchungen. |
| 43 | `bb_payment_accounts_list` | `/accounts/get` | lesend | ja | nein | ja | Zahlungskonten auflisten; je Konto Name und zugehörige Sachkontonummer. |
| 44 | `bb_payment_accounts_create` | `/accounts/add` | anlegend | nein | nein | nein | Zahlungskonto anlegen; Revisionssicherheit wirkt dauerhaft. |
| 45 | `bb_comments_create` | `/comments/add` | anlegend | nein | nein | nein | Kommentar an Beleg oder Zahlung hängen; über die API nicht löschbar. |
| 46 | `bb_cost_locations_search` | `/cost-locations/get` | lesend | ja | nein | ja | Kostenstellen auflisten oder eine über ihren Code holen. |
| 47 | `bb_cost_locations_create` | `/cost-locations/add` | anlegend | nein | nein | nein | Kostenstelle mit Code und Namen anlegen. |
| 48 | `bb_cost_locations_update` | `/cost-locations/update` | ändernd | nein | ja | ja | Namen einer Kostenstelle überschreiben. |
| 49 | `bb_cost_locations_delete` | `/cost-locations/delete` | löschend | nein | ja | ja | Kostenstelle entfernen; Wirkung auf verweisende Buchungen ist unbekannt. |
| 50 | `bb_reports_create_bwa` | `/reports/create/bwa` | anlegend | nein | ja | nein | BWA-Erzeugung anstoßen; ersetzt die zuvor erzeugte BWA. |
| 51 | `bb_reports_create_sums` | `/reports/create/sums` | anlegend | nein | ja | nein | Summen- und Saldenliste anstoßen; ersetzt die zuvor erzeugte. |
| 52 | `bb_reports_get_bwa` | `/reports/get/bwa` | lesend | ja | nein | ja | Erzeugte BWA abholen, optional mit PDF- und CSV-Dateien. |
| 53 | `bb_reports_get_sums` | `/reports/get/sums` | lesend | ja | nein | ja | Erzeugte Summen- und Saldenliste abholen. |
| 54 | `bb_reports_get_ledger` | `/reports/get/sums/ledger` | lesend | ja | nein | ja | Kontenblatt eines Sachkontos direkt erzeugen, ohne vorheriges Anstossen. |

**Prüfsumme.** 54 Zeilen. Nach Wirkung: 15 lesend (1, 2, 8, 9, 10, 16, 20, 32, 36, 40, 43,
46, 52, 53, 54), 24 anlegend (3, 4, 5, 11, 12, 17, 18, 19, 21, 22, 23, 24, 25, 26, 33, 34,
37, 38, 41, 44, 45, 47, 50, 51), 8 ändernd (7, 13, 14, 30, 35, 39, 42, 48), 7 löschend
(6, 15, 27, 28, 29, 31, 49). Das stimmt Zeile für Zeile mit der Auszählung in
`grundlagen.md` 7.3 überein. Nach Ressource: receipts 8, transactions 8, invoices 3,
postings 12, debtors 4, creditors 4, postingaccounts 3, payment_accounts 2, comments 1,
cost_locations 4, reports 5 = 54. Längster Name 40 Zeichen (`bb_postings_create_for_transaction_batch`),
kürzester 17 (`bb_debtors_search`).

### 3.4 Die Annotationsregeln, und warum sie so und nicht anders lauten

Die Klasse steht als Datenstruktur in `src/tools/classes.ts` und wird **niemals** aus dem
Namen abgeleitet. `bb_postings_assign_receipt` endet auf `_receipt`, `bb_reports_get_ledger`
auf `_ledger`.

| Regel | Wirkung | Begründung |
| --- | --- | --- |
| lesend → `readOnly: true`, `destructive: false`, `idempotent: true` | 15 Werkzeuge | `tool-design.md` 11.8 verlangt alle vier Hints explizit. Bei lesenden Werkzeugen sind die letzten beiden laut MCP-Schema bedeutungslos; die gesetzten Werte sind trotzdem wahr, und ein Client, der `readOnlyHint` ignoriert, liest so keine falsche Warnung |
| anlegend → `destructive: false`, `idempotent: false` | 22 Werkzeuge | Rein additiv; ohne Idempotenzschlüssel erzeugt ein zweiter Aufruf einen zweiten Datensatz |
| `bb_reports_create_bwa` und `bb_reports_create_sums` → `destructive: true` | 2 Werkzeuge | Der Aufruf ersetzt den zuvor erzeugten Bericht desselben Typs (`grundlagen.md` 7.2). Ein Ersetzen ist nicht additiv |
| ändernd mit Überschreiben → `destructive: true`, `idempotent: true` | 4 Werkzeuge (35, 39, 42, 48) | **Abweichung von `tool-design.md` 9.3 Klasse M.** Ein `update` überschreibt Stammdaten, und kein Endpunkt liefert den Vorzustand zurück (`grundlagen.md` 7.3). Das ist kein additives Update. Dass derselbe Aufruf zweimal dasselbe Ergebnis hat, bleibt wahr, deshalb `idempotent: true` |
| ändernd mit Zuordnung → `destructive: false`, `idempotent: false` | 3 Werkzeuge (13, 14, 30) | Es wird nichts überschrieben. `idempotent: false` konservativ, weil **nicht verifiziert** ist, wie ein Wiederholungsaufruf antwortet |
| `bb_receipts_restore` → `destructive: false`, `idempotent: true` | 1 Werkzeug | Macht ein `delete` rückgängig, setzt einen Zielzustand |
| löschend, zustandsetzend → `destructive: true`, `idempotent: true` | 6 Werkzeuge (6, 15, 27, 28, 29, 49) | Ein zweiter Aufruf setzt denselben Zielzustand und hat keine zusätzliche Wirkung auf die Umgebung |
| `bb_postings_cancel` → `destructive: true`, `idempotent: false` | 1 Werkzeug | Bei festgeschriebenen Buchungen entsteht eine **neue** Stornobuchung. Ein zweiter Aufruf könnte ein zweites Artefakt erzeugen; **nicht verifiziert**, deshalb konservativ |
| `openWorld: true` | alle 54 | Der Datenbestand ändert sich unabhängig von uns |

Die zugrunde liegende Regel in einem Satz, damit ein Implementierungs-Agent neue Fälle
selbst entscheiden kann: **`idempotentHint` ist `true`, wenn die Operation einen Zielzustand
setzt, und `false`, wenn eine Wiederholung ein zusätzliches Artefakt erzeugen kann.**

### 3.5 Wie der Agent Konto und Sachkonto auseinanderhält

Dies ist der gefährlichste Verwechslungsfall der ganzen API, und er ist am 2026-09-12 live
belegt (Anhang A, L1 bis L3):

- `/accounts/get` liefert je Zahlungskonto genau zwei Felder: `name` und
  **`postingaccount_number`**. Ein Zahlungskonto wird also über eine Sachkontonummer
  adressiert.
- `/settings/get/postingaccounts` ist eine **Vereinigungsliste**. Beobachtete `type`-Werte im
  Testmandanten: `postingaccount`, `account`, `creditor`, `creditor collective`, `debtor`,
  `debtor collective`. Sachkonten und Zahlungskonten stehen in derselben Liste.
- Der Parameter `account` bedeutet bei `/receipts/add`, `/transactions/add`,
  `/transactions/get` und `/postings/get` ein **Zahlungskonto**, sein Wert ist aber eine
  **Sachkontonummer**. Damit ist der offene Punkt aus `tool-design.md` 6.5 Technik 3
  beantwortet: `account` bedeutet nicht an jedem Endpunkt dasselbe, und der Feldname sagt
  nicht, welche Art Nummer erwartet wird.

Fünf Maßnahmen, die zusammen wirken:

1. **Namenstrennung.** `bb_payment_accounts_*` gegen `bb_postingaccounts_*`. Die früher
   vorgeschlagenen Namen `bb_accounts_list` und `bb_postingaccounts_search` hätten sich um
   ein Wort unterschieden und in jeder alphabetischen Liste nebeneinander gestanden.
2. **Parameterumbenennung.** `account` heißt im Werkzeugschema `payment_account_number`, mit
   dem Satz: *"This is a posting account number (e.g. \"1200\") that identifies a payment
   account (\"Zahlungskonto\"), not a general ledger account you post to. List them with
   bb_payment_accounts_list."* Die Rückübersetzung auf `account` geschieht im
   Request-Mapper (Anhang B).
3. **Zwei getrennte Nachschlagewerkzeuge in den Beschreibungen.** Jedes Feld, das eine
   Kontonummer erwartet, nennt in seiner Beschreibung genau ein Nachschlagewerkzeug, nie
   beide.
4. **`bb_postingaccounts_search` liefert `type` und `subtype` immer mit**, auch im
   `concise`-Format, und die Textantwort gruppiert nach `type`. Ein Agent, der die Liste
   liest, sieht sofort, dass `1200` ein Zahlungskonto und `4980` ein Sachkonto ist.
5. **Resource `bb://guide/accounts`.** Eine halbe Seite Kontenkunde, die der Agent bei Bedarf
   liest, ohne dass sie in jeder Werkzeugdefinition Token kostet.

### 3.6 Wie der Agent den richtigen der zwölf Buchungsendpunkte findet

Zwölf Werkzeuge unter `bb_postings_*` sind die größte Gruppe. Die Navigation läuft über
drei Ebenen.

**Ebene 1, der Name trägt den Unterscheider.** Nicht das Verb allein, sondern der
Qualifizierer: `_for_receipt`, `_for_transaction`, `_free`. Wer den Namen liest, weiß, woran
gebucht wird.

**Ebene 2, der erste Satz jeder Beschreibung ist eine Entscheidungsregel**, nicht eine
Zweckangabe. Muster:

```
Creates the posting lines ("Buchungssätze") for one existing receipt ("Beleg").
Use this when you have a receipt id_by_customer and want to book it; use
bb_postings_create_for_transaction when you start from a bank movement instead,
and bb_postings_create_free when there is neither a receipt nor a transaction.
```

**Ebene 3, ein Wegweiser in den `instructions` und als Resource `bb://guide/postings`:**

```
Which posting tool do I need?
  I have a receipt id_by_customer                 → bb_postings_create_for_receipt
  I have a transaction id_by_customer             → bb_postings_create_for_transaction
  I have neither                                  → bb_postings_create_free
  I have many of one kind                         → the same name plus _batch
  I want to see existing postings                 → bb_postings_search
  I want to undo unfixed postings of a receipt    → bb_postings_unconfirm_for_receipt
  I want to undo unfixed postings of a transaction→ bb_postings_unconfirm_for_transaction
  I want to undo one unfixed free posting         → bb_postings_unconfirm_free
  I want to reverse a posting that is fixed       → bb_postings_cancel (creates a Storno)
  I want to attach a receipt to a free posting    → bb_postings_assign_receipt (no undo)
```

Der Wegweiser steht nicht in den 12 Beschreibungen, sondern einmal. Das spart nach der
Rechnung in 4.6 rund 3.000 Zeichen und macht die Regel zugleich konsistent, weil sie nur an
einer Stelle gepflegt wird.

### 3.7 Wie der Agent merkt, dass er etwas Unumkehrbares tut

Vier Signale, absichtlich redundant, weil jedes einzelne von einem Client oder einem Modell
übersehen werden kann.

1. **Annotation.** `destructiveHint: true` bei 13 Werkzeugen. Das ist das einzige
   maschinenlesbare Signal.
2. **Pflichtsatz in der Beschreibung, maschinell geprüft** (Test
   `contract/descriptions.test.ts`). Jedes Werkzeug der Wirkungen anlegend, ändernd und
   löschend trägt genau einen Satz aus diesem Vorrat, und zwar den zutreffenden:

   | Fall | Pflichtsatz | Werkzeuge (Nummern aus 3.3) |
   | --- | --- | --- |
   | **U1** umkehrbar mit genau einem Werkzeug | `This writes to the live accounting data. It can be undone with <tool>.` | 6, 7, 13, 14, 15, 47 |
   | **U2** nur als Löschmarkierung umkehrbar | `This writes to the live accounting data. It can be undone with bb_receipts_delete, which only marks the receipt as deleted; the API has no endpoint that removes a receipt permanently.` | 3, 4, 5 |
   | **U3** nur durch Storno korrigierbar | `This writes to the live accounting data. A posting cannot be deleted once it is fixed ("festgeschrieben"), only reversed with bb_postings_cancel, which leaves a permanent Storno entry.` | 21 bis 26 |
   | **U4** über die API gar nicht umkehrbar | `This writes to the live accounting data. The BuchhaltungsButler API offers no endpoint to undo it.` | 11, 12, 17, 18, 19, 30, 33, 34, 37, 38, 41, 44, 45 |
   | **U5** überschreibt ohne abrufbaren Vorzustand | `This overwrites master data in the live accounting account. The API does not return the previous values, so the change cannot be undone unless you read the record first.` | 35, 39, 42, 48 |
   | **U6** entfernt Bestehendes | `This removes data from the live accounting account: <was genau>. Read the affected records first and show them to the user.` | 27, 28, 29, 31, 49 |
   | **U7** ersetzt eine Auswertung | `This replaces the previously created report of the same type. No posting data is changed, and the report can be created again at any time.` | 50, 51 |

   **Prüfsumme.** 6 + 3 + 6 + 13 + 4 + 5 + 2 = 39, also genau die 39 Werkzeuge mit den
   Wirkungen anlegend, ändernd und löschend. Jedes steht in genau einer Zeile; die 15
   lesenden Werkzeuge tragen keinen dieser Sätze. Der Test prüft beides.

   **U4 ist der wichtigste Fall.** Für acht Objektarten kennt die API überhaupt keinen
   Lösch-, Storno- oder Aufhebungsendpunkt: Zahlungen, Rechnungen (alle drei Formen), die
   Bindung eines Belegs an eine freie Buchung, Debitoren, Kreditoren, Sachkonten,
   Zahlungskonten und Kommentare. Ausgezählt aus der vollständigen Pfadliste: unterhalb von
   `/transactions/`, `/invoices/`, `/settings/` und `/comments/` gibt es keinen
   `delete`-Pfad, und unterhalb von `/postings/` keinen `unassign`-Pfad. Bei diesen 13
   Werkzeugen ist der Pflichtsatz die einzige Warnung, die der Agent vor dem Aufruf bekommt.
3. **Das Antwortformat schreibender Werkzeuge** nennt den Umkehrweg noch einmal, jetzt mit
   konkreten Werten:

   ```
   Created posting 8814 in the live accounting data of the connected account.
     date 2026-08-14 | amount 1190.00 EUR | debit 4980 | credit 1600 | vat 19_pre
   Endpoint used: /postings/add/free
   Reversal: bb_postings_cancel with posting_id_by_customer=8814.
             If the posting is already fixed ("festgeschrieben"), this creates a
             permanent Storno entry instead of removing it.
   ```
4. **Der Duplikatshinweis** macht den häufigsten Unfall sichtbar, den Wiederholungsversuch
   nach einem Timeout. Er blockiert nicht (`tool-design.md` 9.6 Punkt 4), sondern steht in
   der Antwort mit der Kennung des bereits vorhandenen Datensatzes.

### 3.8 Der Sonderfall der vier `id_by_customer`-Pfade

Vier Endpunkte führen in der Spezifikation **keinen** Parameter für die Kennung, obwohl
ihre Beschreibung sie verlangt: `/receipts/get/id_by_customer`,
`/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer`,
`/transactions/get/id_by_customer`. Ausgezählt aus der Spezifikation: der erste hat zwei
Parameter (`api_key`, `get_file`), die drei anderen genau einen (`api_key`).

Das ist der stärkste verfügbare Beleg für die Annahme:
**`id_by_customer` ist ein Pfadsegment, kein Body-Feld.** Der
Pfad heißt in Wahrheit `/receipts/get/<id_by_customer>`, und der Autor der Spezifikation hat
den Platzhalternamen wörtlich hingeschrieben. Das erklärt beide Live-Befunde vom
2026-09-12: `/receipts/get/id_by_customer` antwortete mit HTTP 400 und `invalid
id_by_customer specified`, weil die Route das Segment erfasst und den Wert
`"id_by_customer"` verwirft; `/transactions/get/id_by_customer` antwortete mit HTTP 404, weil
dort eine andere Routingregel greift.

**Vorgehen, verbindlich:**

1. **AP0 führt genau zwei lesende Testaufrufe** gegen `/receipts/get/<echte id>` und
   `/transactions/get/<echte id>` (Kommandos in Abschnitt 11, AP0).
2. Bestätigt sich die Annahme, werden alle vier Werkzeuge mit einem Pfadsegment gebaut.
   Der Wert wird mit `encodeURIComponent` kodiert und vorher auf `^[0-9]+$` geprüft; ein
   unkodierter Identifikator im Pfad ist der klassische Weg zur Pfadinjektion.
3. Bestätigt sie sich nicht, werden die Werkzeuge trotzdem ausgeliefert, weil E1 und E6 das
   verlangen. Ihre Beschreibung trägt dann einen zusätzlichen Satz:

   ```
   Known limitation: as of 2026-09-12 this BuchhaltungsButler endpoint did not
   answer as documented. If this call fails with "invalid id_by_customer
   specified", fall back to bb_receipts_search and narrow by date, counterparty
   or invoicenumber; that search has no id_by_customer filter.
   ```

   Das ist die bewusste Abweichung von `tool-design.md` 3.5, die im Vorspann steht: ein
   fehlendes Werkzeug lässt den Agenten glauben, die Fähigkeit existiere nicht, und er
   sucht Umwege. Ein vorhandenes Werkzeug mit ehrlicher Warnung lenkt ihn beim ersten
   Fehlschlag sofort auf den Ersatzweg.
4. Solange die Lage offen ist, verweist **keine andere** Beschreibung auf `bb_receipts_get`
   oder `bb_transactions_get` als empfohlenen Weg.

---

## 4. Eingabeschemata

### 4.1 Die Entscheidung

**Gemischt, mit maschinell geprüftem Vertrag: ein erzeugtes Inventar, ein handgepflegtes
Manifest, und ein Test, der beide gegeneinander hält.**

Weder rein generiert noch rein handgeschrieben.

**Warum nicht rein generiert.** Die Spezifikation ist kein gültiges Swagger 2.0 und
enthält nachgewiesene Fehler, aus denen ein Generator falschen Code erzeugt:

| Befund | Beleg | Folge für einen Generator |
| --- | --- | --- |
| 371 Body-Parameter als Einzeleinträge mit eigenem `type` statt in einem `schema` | `grundlagen.md` 8.1 | Erzeugt 371 Alternativen statt eines Objekts |
| `enum` mit genau einem Eintrag sind Beispielwerte | `grundlagen.md` 8.2 | Erzeugt String-Literal-Typen, die jeden echten Wert ablehnen |
| Das `schema` von `order` bei `/receipts/get` deklariert eine Eigenschaft namens `field` | `grundlagen.md` 5.3 | Erzeugt ein Objekt, das die API nicht akzeptiert |
| `responses`-Schlüssel sind Zeichenketten wie `"400 (5)"` | `grundlagen.md` 8.4 | Bricht beim Lesen als Statuscode |
| `ReceiptPostings` hat die Eigenschaft `postingstexts`, der Einzelendpunkt `postingtexts` | eigene Auszählung, 2026-09-12 | Erzeugt zwei Feldnamen für dasselbe Feld |
| `PostingsFree` hat die Eigenschaft `amount`, führt aber `amounts` in `required` | eigene Auszählung, 2026-09-12 | Erzeugt ein Pflichtfeld, das es nicht gibt |
| Vier Endpunkte führen ihren Identifikator gar nicht | Abschnitt 3.8 | Erzeugt Werkzeuge ohne Eingabe |
| Beschreibungen enthalten HTML und Entities | `grundlagen.md` 8.26 | Erzeugt `<br/>` und `&ldquo;` in Werkzeugbeschreibungen |

**Warum nicht rein handgeschrieben.** 371 Parameter driften, und eine vergessene Zeile ist
unsichtbar. Was auf dem Spiel steht, zeigt ein einzelnes Beispiel: Fehlen `limit` und
`offset` an `/settings/get/postingaccounts`, ist der Kontenrahmen jenseits von 1000 Einträgen
unerreichbar. Im Testmandanten hat diese Liste **1281** Einträge (Anhang A, L3), der Fehler
wäre dort sofort wirksam. Dieselbe Gefahr besteht zwischen Schema und Beschreibungstext:
Wo beide von Hand gepflegt werden, nennt die Beschreibung irgendwann weniger zulässige Werte,
als das Schema kennt, und das Modell schlägt die fehlenden nie vor.

### 4.2 Der Weg, konkret

**Schritt 1, Extraktion (`scripts/extract-spec.ts`).**

- Eingabe: `docs/openapi/buchhaltungsbutler-v1.json`.
- Ausgabe: `src/generated/spec-inventory.json`, eingecheckt, damit der Test ohne die
  Spezifikationsdatei läuft und damit Änderungen der Spezifikation im Diff sichtbar werden.
- Inhalt je Endpunkt: Pfad, `summary`, `description` (HTML entfernt, Entities aufgelöst),
  und je Parameter `name`, `required`, `type`, `default`, `description` (bereinigt), sowie
  bei `$ref`-Parametern die aufgelöste Elementdefinition mit ihren Eigenschaften und
  `required`.
- Ausgabe ist stabil sortiert, damit der Diff lesbar bleibt.

**Schritt 2, Manifest (`src/tools/manifest/*.ts`, 11 Dateien).** Handgeschrieben, in
TypeScript, typisiert gegen `ToolSpec`:

```typescript
// Auszug, Form nicht endgültiger Code
export const receiptsSearch: ToolSpec = {
  name: "bb_receipts_search",
  title: "Belege suchen",
  endpoint: "/receipts/get",
  effect: "read",                       // read | create | modify | delete
  tier: 2,                              // Beschreibungsbudget, siehe 4.6
  description: "...",                   // englisch, deutsche Fachbegriffe in Anführungszeichen
  fields: [
    {
      toolName: "list_direction",
      apiName: "list_direction",
      required: true,
      schema: { type: "string", enum: ["inbound", "outbound"] },
      description: "...",
    },
    {
      toolName: "limit",
      apiName: "limit",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      description: "...",
    },
    // ... jedes weitere Feld des Endpunkts
  ],
  serverOnlyFields: ["response_format"], // nicht an die API gesendet
  projection: { concise: ["id_by_customer", "date", "counterparty", "amount", /* ... */] },
};
```

Feste Regeln für das Manifest:

- `api_key` erscheint **nie** als Feld. Er wird im Request-Mapper eingesetzt
  (`tool-design.md` 6.6).
- Jedes übrige Feld des Endpunkts erscheint genau einmal, auch wenn es unbequem ist (E6).
- `required` darf gegenüber der Spezifikation **verschärft**, nie gelockert werden
  (`tool-design.md` 6.4). Jede Verschärfung trägt ein Feld `requiredReason`, das im Test
  ausgewertet und in die Parameterbeschreibung übernommen wird.
- `apiName` weicht nur ab, wo die Umbenennung in Anhang B steht. Jede Umbenennung nennt den
  Originalnamen in der Beschreibung.
- `serverOnlyFields` ist die einzige erlaubte Erweiterung über die API hinaus und umfasst
  genau zwei Namen: `response_format` bei lesenden Werkzeugen und `positions` als
  objektorientierte Form der parallelen Arrays.

**Schritt 3, Schemabau (`src/tools/schema-builder.ts`).** Aus `fields` entsteht zur Ladezeit
ein Zod-Objekt mit `.strict()`. Das SDK erzeugt daraus das JSON Schema. Damit kommen Schema,
Validierung und Beschreibung aus **einer** Quelle; die Drift zwischen beiden ist damit
konstruktiv ausgeschlossen.

**Schritt 4, Konformitätstest (`test/contract/coverage.test.ts`).** Der Test, der den
ganzen Ansatz trägt. Er prüft gegen `spec-inventory.json`:

1. Genau 54 Werkzeuge, genau 54 Endpunkte, Abbildung eineindeutig.
2. Jeder Parameter der Spezifikation außer `api_key` ist in genau einem Werkzeugfeld
   abgebildet, über `apiName`. Fehlt einer, schlägt der Test fehl und nennt Pfad und Name.
   Dieser Punkt ist der maschinelle Nachweis für E6.
3. Kein `apiName` zeigt auf ein Feld, das der Endpunkt nicht kennt. Das fängt Fälle wie ein
   von `/invoices/create` übernommenes `item_vat` an der E-Rechnung, die dort
   `item_tax_type` und `item_tax_amount` führt.
4. `required` ist eine Obermenge der Spezifikation; jede Verschärfung hat eine Begründung.
5. Bei den acht Batch-Endpunkten wird die aufgelöste Elementdefinition geprüft, nicht der
   Arrayname. Die Tippfehler `postingstexts` und `amounts` aus 4.1 werden dabei ausdrücklich
   als bekannte Spezifikationsfehler geführt und mit einem benannten Ausnahmeeintrag samt
   Kommentar behandelt, nicht stillschweigend ignoriert.
6. Die vier Endpunkte aus 3.8 sind als `identifierInPath` markiert; der Test verlangt dort
   ein Pfadsegmentfeld statt eines Body-Felds.

**Konsequenzen, offen benannt.**

| Dimension | Bewertung |
| --- | --- |
| Wartbarkeit | Gut. Eine neue API-Version wird eingespielt, `extract-spec` neu erzeugt, der Konformitätstest zeigt im Diff genau die fehlenden oder überzähligen Felder |
| Codegröße | Das Manifest ist die größte Codemenge des Projekts. Schätzung: 371 Felder mal rund 8 Zeilen, plus 54 Beschreibungen, also rund 3.500 bis 4.500 Zeilen über 11 Dateien. Das ist der Preis von E1 und E6 und wird nicht kleingeredet |
| Korrektheit | Besser als beide Reinformen. Der Generator kann die fehlerhafte Spezifikation nicht falsch interpretieren, weil er keine Schemata erzeugt; das Manifest kann nichts vergessen, weil der Test es nachzählt |
| Risiko | Das Manifest kann fachlich falsch sein, ohne dass der Test es merkt: ein Enum mit einem fehlenden Wert, eine irreführende Beschreibung. Dagegen hilft nur der Evaluationslauf aus AP12 |

### 4.3 Die geteilten Bausteine (`src/tools/vocab.ts`)

Hier liegt der größte Hebel gegen Wiederholung. Jeder Baustein ist eine Funktion, die
Schemafragment und Beschreibungstext zusammen liefert.

| Baustein | Schema | Beschreibungsmuster (gekürzt) |
| --- | --- | --- |
| `date()` | `string`, `format: "date"` | `... as YYYY-MM-DD, e.g. "2026-04-26". An empty string is rejected; omit the field instead.` |
| `dateTime()` | `string`, Muster `YYYY-MM-DD HH:MM:SS` | zusätzlich der Hinweis, dass ein reines Datum als `23:59:59` gilt |
| `amountIn()` | `number` | `Decimal point, no thousands separator, e.g. 123.99. "0.00" is not a valid amount.` |
| `currency()` | `string`, `enum` mit 48 Codes | Liste nur als Enum, nicht in Prosa |
| `vatKey()` | `string`, `enum` mit 23 Schlüsseln | `German labels for all 23 keys: resource bb://vat-keys.` |
| `limit(max, def)` | `integer`, `minimum: 1`, `maximum`, `default` | `Hard maximum <max> enforced by the API; larger values are rejected, not clamped.` |
| `offset()` | `integer`, `minimum: 0`, `default: 0` | `To fetch the second page of a limit=100 search, pass offset=100.` |
| `idByCustomer(entity)` | `integer`, `minimum: 1` | `The per-tenant number of the <entity>, from <search tool>. Not a global id.` |
| `postingAccountNumber()` | `string` | `A general ledger account number ("Sachkonto"), e.g. "4980". Per-tenant master data: look it up with bb_postingaccounts_search.` |
| `paymentAccountNumber()` | `string` | `The posting account number of a payment account ("Zahlungskonto"), e.g. "1200". List them with bb_payment_accounts_list.` |
| `costLocation()` | `string`, `maxLength: 10` | `Per-tenant, look up with bb_cost_locations_search. At most 10 characters.` |
| `contactAddressBlock()` | 9 Felder | Einzeiler je Feld nach festem Muster, höchstens 70 Zeichen |
| `responseFormat()` | `enum ["concise","detailed"]`, `default "concise"` | Text nach `tool-design.md` 7.2 |

Die Umsatzsteuerschlüssel sind der größte Einzelposten: 23 Schlüssel mit deutschen
Labels sind rund 1.100 Zeichen und kommen an sechs Werkzeugen vor. Als reine Enum-Liste
kosten sie rund 320 Zeichen. Die Labels stehen einmal in `bb://vat-keys` und in den
`instructions`. Ersparnis rund 4.700 Zeichen, ohne dass die Validierung schwächer wird.

### 4.4 Parallele Arrays

`grundlagen.md` 5.9: Sieben Endpunkte erwarten zusammengehörige Werte als mehrere gleich
lange Arrays. Wer sie ungeprüft durchreicht, gibt die einzige Invariante dieser Konstruktion
auf, und ungleich lange Arrays verschieben die Zuordnung stillschweigend.

**Unsere Lösung:** Das Werkzeug nimmt eine **Positionsliste**, der Mapper erzeugt die
parallelen Arrays.

```jsonc
// Werkzeugseite, bb_postings_create_for_receipt
"positions": {
  "type": "array", "minItems": 1, "maxItems": 50,
  "description": "The posting lines of this receipt. Each entry is one line of a split booking (\"Splitbuchung\"). The amounts of all lines together must match the receipt amount.",
  "items": {
    "type": "object", "additionalProperties": false,
    "required": ["postingaccount", "postingtext", "vat", "amount"],
    "properties": {
      "postingaccount":   { "...": "postingAccountNumber()" },
      "postingtext":      { "type": "string", "maxLength": 128 },
      "vat":              { "...": "vatKey()" },
      "amount":           { "type": "string" },
      "cost_location":    { "...": "costLocation()" },
      "cost_location_two":{ "...": "costLocation()" }
    }
  }
}
```

Wirkung, alles zugleich:

- Die Längeninvariante ist **konstruktiv** erfüllt. Sie kann nicht mehr verletzt werden,
  statt nur geprüft zu werden.
- Der Agent kann keine Position halb ausfüllen; `required` wirkt je Position.
- Die Definition wird kleiner: statt sechs Arrays mit je einer eigenen Beschreibung eine
  Objektbeschreibung. Ersparnis rund 250 Zeichen je Werkzeug.
- Die Antwort kann fehlerhafte Positionen **positionsgenau** melden: "position 2: vat
  '19_ust' is not a valid key".

Dass dies eine Umformung gegenüber der API ist, steht in der Werkzeugbeschreibung
ausdrücklich: *"The BuchhaltungsButler API takes these values as parallel arrays
(postingaccounts, postingtexts, vats, amounts); this tool takes one list of positions and
performs that conversion, which guarantees the arrays have equal length."* Damit ist die
Umformung kein verborgenes Verhalten im Sinne von E1, sondern deklariert.

Bei `/postings/add/transaction` kommt `oi_receipts_ids_by_customer` hinzu. Die Spezifikation
erlaubt dort ausdrücklich `null` je Position; im Positionsobjekt heißt das Feld
`open_item_receipt_id_by_customer` und ist `["integer","null"]` mit der Erklärung, dass
`null` "dieser Position ausdrücklich keinen Beleg zuordnen" bedeutet.

### 4.5 Die drei `order`-Syntaxen

Drei Endpunkte, drei verschiedene Formen (`grundlagen.md` 5.3). Wir bilden jede exakt ab,
weil das Vereinheitlichen verborgene Logik wäre.

| Endpunkt | Werkzeugfeld | Schema |
| --- | --- | --- |
| `/receipts/get` | `order` | `object`, `additionalProperties: false`, Eigenschaften `date`, `amount`, `invoicenumber`, `invoicingparty`, jede mit `enum ["ASC","DESC"]`. Das falsche `field`-Schema der Spezifikation wird verworfen, Belegstelle in der Beschreibung des Manifests |
| `/postings/get` | `order` | `string` mit `enum` der sieben erlaubten Werte, exakt in der Schreibweise der Spezifikation. Die Validierung der API ist ausdrücklich case sensitive, das Enum fängt es vorher ab |
| `/settings/get/postingaccounts` | `order` | `string` mit `enum` der sechs Kombinationen `postingaccount_number ASC|DESC`, `name ASC|DESC`, `type ASC|DESC` |

Drei Enums statt drei freier Strings, zusammen rund 300 Zeichen, und der Agent kann bei
keinem der drei danebengreifen.

### 4.6 Das Token-Budget, vorgerechnet

Dies ist die Kernfrage des Auftrags. **Die Rechnung ist eine Schätzung mit angegebener
Methode, keine Messung**; die Messung ist AP11 und ist Abnahmebedingung.

**Methode.** Zeichen der erzeugten Werkzeugdefinitionen, geteilt durch 3,7 Zeichen je Token.
Der Wert 3,7 ist die übliche Größenordnung für englischen Text in JSON-Struktur; er ist
**nicht gemessen** und wird in AP11 durch einen echten Tokenizer ersetzt.

**Rohschätzung ohne Sparmaßnahmen.**

| Posten | Rechnung | Zeichen |
| --- | --- | --- |
| Name, Titel, Annotationen, Schemarümpfe | 54 mal 97 | 5.238 |
| Werkzeugbeschreibungen, ungebremst 150 Wörter im Schnitt | 54 mal 950 | 51.300 |
| Parametereinträge, Beschreibungen wie in der Spezifikation | 317 mal 210 | 66.570 |
| `outputSchema` mit Feldbeschreibungen | 54 mal 900 | 48.600 |
| **Summe** | | **171.708** |
| **entspricht** | geteilt durch 3,7 | **rund 46.400 Token** |

Das ist inakzeptabel. Es sind rund 23 Prozent eines 200k-Fensters, bevor der Nutzer etwas
gesagt hat.

**Die sechs Sparmaßnahmen, jede mit ihrem Beitrag.**

| # | Maßnahme | Ersparnis (Zeichen) |
| --- | --- | --- |
| S1 | **Querschnittsregeln nur in den `instructions`.** Die Spezifikation wiederholt "If specified, the field will be validated" und "An empty string is not considered a valid date" dutzendfach. Diese Regeln stehen einmal im Servertext, nie im Parameter | 14.000 |
| S2 | **Beschreibungsbudget nach Stufen** statt pauschal 150 Wörter. Stufe 1 (20 Werkzeuge, Verwechslungs- und Gefahrenzone) höchstens 800 Zeichen, Stufe 2 (20 Werkzeuge) höchstens 600, Stufe 3 (14 triviale) höchstens 380. Ergibt 16.000 + 12.000 + 5.320 = 33.320 statt 51.300 | 17.980 |
| S3 | **Enum statt Prosa**, insbesondere Währungen, Umsatzsteuerschlüssel, `order`, `type`-Felder. Die Werteliste steht im Schema, nicht zweimal | 9.000 |
| S4 | **Kurzmuster für die 90 Adress- und Kontaktfelder** von Debitoren, Kreditoren und Rechnungen, höchstens 70 Zeichen Beschreibung je Feld | 8.000 |
| S5 | **Positionsliste statt sechs paralleler Arrays** an sieben Werkzeugen | 1.750 |
| S6 | **`outputSchema` ohne Feldbeschreibungen**, Feldnamen und Typen genügen, weil die Feldnamen selbsterklärend sind und in der Textantwort ohnehin vorkommen. Je Werkzeug rund 260 statt 900 Zeichen | 34.560 |
| | **Summe der Ersparnis** | **85.290** |

**Ergebnis.**

| Posten | Zeichen | Token (geteilt durch 3,7) |
| --- | --- | --- |
| Name, Titel, Annotationen, Rümpfe | 5.238 | 1.416 |
| Beschreibungen nach Stufenbudget | 33.320 | 9.005 |
| Parametereinträge nach S1, S3, S4, S5 | 33.820 | 9.141 |
| `outputSchema` schlank | 14.040 | 3.795 |
| **Summe Werkzeugdefinitionen** | **86.418** | **rund 23.400** |
| `instructions` (einmal, nicht je Werkzeug) | 5.500 | 1.486 |
| **Summe, was der Client beim Verbinden sieht** | | **rund 24.900** |

**Das gesetzte Budget: 26.000 Token für alle 54 Definitionen zusammen, plus 1.800 Token für
die `instructions`.** Der Test `contract/token-budget.test.ts` bricht den Build ab, wenn es
überschritten wird, und er prüft zusätzlich je Werkzeug das Stufenbudget, damit die
Überschreitung nicht erst in der Summe auffällt.

**Die ehrliche Einordnung.** `tool-design.md` 10.3 nennt 10.000 Token als Zielwert, abgeleitet
aus der Faustregel in `ANTHROPIC-SEARCH`. Mit 54 Endpunktwerkzeugen und 317 Parametern ist
dieser Wert arithmetisch nicht erreichbar, ohne Parameter wegzulassen oder Beschreibungen auf
einen Satz zu kürzen. Beides verbietet E6. **Der 34er-Schnitt kostet rund 10.000 Token, der
54er-Schnitt rund 24.000. Das ist der Preis von E1, und er wird hier beziffert, nicht
versteckt.** 24.000 Token sind rund 12 Prozent eines 200k-Fensters.

**Drei Wege, den Preis im Betrieb zu drücken, alle ohne Eingriff in E1:**

1. **Client-seitiges Deferred Loading.** `ANTHROPIC-SEARCH` beschreibt Kontextersparnisse über
   85 Prozent, wenn der Client nur die tatsächlich gebrauchten drei bis fünf Werkzeuge
   lädt. Der Server kann das nicht erzwingen, aber unterstützen: durchsuchbare Namen,
   deutsche Fachbegriffe in jeder Beschreibung, konsistente Präfixe je Ressource. Für
   MCP-Server wird das am `mcp_toolset`-Eintrag gesetzt, nicht je Werkzeug.
2. **`BB_MCP_TOOLSETS`, optional, standardmäßig aus.** Kommagetrennte Liste von
   Ressourcengruppen (`receipts`, `transactions`, `invoices`, `postings`, `masterdata`,
   `reports`). Ist sie gesetzt, registriert der Server nur diese Gruppen. Im
   Auslieferungszustand sind alle 54 registriert, E1 bleibt unberührt. Eine Sitzung, die nur
   auswerten soll, kommt so auf rund 6.000 Token.
   **Abgrenzung zum Nur-Lesen-Schalter, wichtig:** Der Nur-Lesen-Schalter lässt gesperrte
   Werkzeuge in `tools/list` **sichtbar** (`tool-design.md` 9.5), weil der Agent sonst auf
   eine fehlende Fähigkeit schließt. `BB_MCP_TOOLSETS` **entfernt** sie, weil genau das der
   Zweck ist. Damit der Agent trotzdem nicht rät, nennen die `instructions` in diesem Fall
   wörtlich, welche Gruppen ausgeblendet sind und dass ein Neustart ohne die Variable sie
   zurückbringt. Diese Variable geht über E1 und E2 hinaus und ist vom Projektinhaber
   freizugeben; ohne Freigabe entfällt sie ersatzlos, der Rest des Plans bleibt gültig.
3. **Resources statt Beschreibungstext.** Kontenrahmen, Umsatzsteuerschlüssel mit deutschen
   Labels, Buchungswegweiser und Kontenkunde liegen als MCP-Resources vor. Sie kosten nur
   dann Kontext, wenn der Agent sie liest.

---

## 5. HTTP-Schicht

### 5.1 Client

| Aspekt | Festlegung | Begründung |
| --- | --- | --- |
| Bibliothek | eingebautes `fetch` von Node, `undici` nur für `EnvHttpProxyAgent` und `MockAgent` | `toolchain.md` 12 |
| Methode | ausschließlich `POST` | alle 54 Endpunkte |
| Header | `Authorization: Basic <base64(client:secret)>` mit `Buffer.from(...).toString("base64")`, `Content-Type: application/json`, `Accept: application/json`, `User-Agent: buchhaltungsbutler-mcp/<version>` | `btoa` verlangt einen binären String und erzwingt damit den zeichenweisen Aufbau; `Buffer` erledigt dasselbe in einem Schritt |
| Body | immer JSON, nie formularkodiert | erhält Booleans, `null` in Arrays und das `order`-Objekt und entspricht dem deklarierten Typ |
| Cookies | kein Jar, Cookies werden verworfen | `grundlagen.md` 3.3 Punkt 2 |
| Abbruch | `extra.signal` an jeden `fetch`, `throwIfAborted()` am Handleranfang | `mcp-sdk-typescript.md` 10.4 Punkt 8 |
| Pfadsegmente | nur bei den vier Endpunkten aus 3.8, Wert vorher gegen `^[0-9]+$` geprüft und mit `encodeURIComponent` kodiert | ein unkodierter Wert im Pfad ist der klassische Weg zur Pfadinjektion |

### 5.2 Timeouts

| Gruppe | Timeout | Begründung |
| --- | --- | --- |
| Standard | 30 s | Die API antwortet bei Timeout selbst mit HTTP 504 und `error_code` 30 |
| `/receipts/upload` | 120 s | Datei plus Texterkennung |
| `/reports/get/sums/ledger` | 120 s | Die Spezifikation warnt, dass ein Kontenblatt mit vielen Buchungen dauern kann |
| `/reports/get/bwa`, `/reports/get/sums` mit `get_files: true` | 120 s | Base64-Dateien in der Antwort |

Über `BB_MCP_TIMEOUT_MS` global anhebbar, nie absenkbar unter 5 s.

### 5.3 Retry, getrennt nach Wirkung

**Die wichtigste Sicherheitsregel der HTTP-Schicht.** Die API kennt keinen
Idempotenzschlüssel (`grundlagen.md` 7.1). Wer trotzdem jeden Aufruf wiederholt, erzeugt bei
einem Abbruch nach dem Anlegen einer Buchung eine zweite Buchung, und der Aufrufer sieht dabei
nur einen Fehler.

| Wirkung | Retry | Bedingungen |
| --- | --- | --- |
| **lesend** (15 Endpunkte) | ja, höchstens 3 Versuche | bei Netzfehler, HTTP 5xx, HTTP 504 mit `error_code` 30, sowie HTTP 429, falls er je auftritt |
| **anlegend, ändernd, löschend** (39 Endpunkte) | **niemals automatisch** | ausnahmslos |

Backoff für lesende Aufrufe: `delay = base * 2^n`, `base = 1000 ms`, mit echtem Jitter um
den **vollen** Wert (`delay * (0.8 + 0.4 * random())`), Deckel 20 s. Das ist bewusst anders
als die verbreitete Form `delay * random()`, die im Mittel nur die Hälfte des berechneten
Abstands wartet. **Der Rate-Limiter wird je Versuch entnommen, nicht einmal vor der
Schleife** — sonst erzeugt ausgerechnet der Fehler, der Drosselung anzeigt, ungebremste
Zusatzlast.

**Der Sonderfall, an dem sich die Qualität entscheidet: Timeout bei einem schreibenden
Aufruf.** Hier ist offen, ob die Aktion serverseitig gelaufen ist. Der Server antwortet mit
einem eigenen Fehlertext (`errors/write-uncertain.ts`), der den Agenten genau anleitet:

```
UNCERTAIN OUTCOME. bb_postings_create_free timed out after 30s while calling
/postings/add/free. BuchhaltungsButler may or may not have created the posting;
the API has no idempotency key, so this server did NOT retry.
Do not call bb_postings_create_free again yet.
First check whether the posting exists: call bb_postings_search with
date_from="2026-08-14", date_to="2026-08-14" and look for postingtext
"Büromaterial August" and amount 1190.00.
If it is there, the call succeeded and nothing else is needed.
If it is not there, you may repeat the original call.
```

Der Text nennt den konkreten Prüfaufruf mit den Werten aus dem fehlgeschlagenen Aufruf. Das
ist der Unterschied zwischen einer Fehlermeldung und einer Handlungsanweisung.

### 5.4 Rate-Limiting

Dokumentiert sind 100 Anfragen je Mandant und Minute, ohne jeden Rate-Limit-Header
(`grundlagen.md` 3.1 und 3.3). Das Kontingent ist geteilt: andere Anwendungen desselben
Mandanten verbrauchen es mit.

| Bucket | Kapazität | Nachfüllrate | Gilt für |
| --- | --- | --- | --- |
| `general` | 60 | 60 je Minute | jeden Aufruf |
| `upload` | 10 | 10 je Minute | `/receipts/upload` |
| `batch` | 1 | 1 je 5 Sekunden | `/receipts/addBatch`, `/transactions/addBatch` |

60 statt 100 als Sicherheitsabstand nach `grundlagen.md` 3.4, über `BB_MCP_RATE_LIMIT`
anpassbar zwischen 10 und 100. Serialisierung über eine Promise-Kette je Bucket, mit
`.catch(() => {})` auf der gespeicherten Kette, damit eine Ablehnung die Kette nicht
vergiftet. Ohne diese Serialisierung rechnen gleichzeitige Aufrufe dieselbe Wartezeit aus
und laufen gemeinsam durch, der Limiter wirkt dann nicht. Der Bucket ist prozesslokal, das
steht in der README.

Wartet ein Aufruf länger als 5 Sekunden auf einen Token, meldet der Server das über
`sendLoggingMessage`, damit der Client nicht stumm hängt.

### 5.5 Content-Type-Prüfung und Umschlagserkennung

Reihenfolge, verbindlich:

1. **Content-Type.** Enthält er nicht `application/json`, entsteht sofort ein Fehler. Grund:
   unbekannte Pfade antworten mit HTML (`grundlagen.md` 4.4, live belegt). Der Fehlertext
   nennt Status und die ersten 200 Zeichen des Körpers, **nach** Durchlauf von
   `errors/redact.ts`, und markiert sie ausdrücklich als Fremdtext, damit der Agent sie
   nicht als Anweisung liest.
2. **JSON-Parsen** im `try/catch`. Scheitert es trotz passendem Content-Type, derselbe
   Fehlerweg.
3. **Erfolg oder Fehler.** Geprüft wird `body.success === false`, **nicht** das Vorhandensein
   von `error_code`. Zusätzlich gilt jede Antwort mit `response.ok === false` als Fehler,
   auch wenn `success` fehlt.
4. **Formvarianz zulassen.** Nicht jeder Erfolgsumschlag hat `rows` und `data`
   (`grundlagen.md` 4.1). Reine Aktionsendpunkte liefern nur `success` und `message`. Der
   Response-Mapper darf beide Felder nicht bedingungslos erwarten.
5. **Unbekannte Felder erhalten.** Die Antwortschemata der Spezifikation sind unvollständig
   und teils falsch (`delivery_date` statt `date_delivery`, `amount_paid` fehlt ganz). Der
   Mapper arbeitet mit einer Allowlist für die Projektion, aber `detailed` gibt alles zurück,
   was ankommt.

### 5.6 Die 718 endpunktspezifischen Fehlercodes

**Der Schlüssel ist das Paar (Pfad, `error_code`), nie der Code allein**
(`fehlercodes.md` D). Beleg für die Notwendigkeit: `error_code` 15 heißt an
`/receipts/get` `invalid sort field specified`, an zehn Batch- und Upload-Endpunkten dagegen
`adding temporarily restricted`. Wer ihn global als Drosselung behandelt, wartet bei einem
Tippfehler im Sortierfeld 60 Sekunden und versucht es dann genauso falsch noch einmal. Genau
das passiert, sobald die Retry-Entscheidung an der Zahl allein hängt.

**Erzeugung.** `scripts/extract-errors.ts` liest alle `responses`-Blöcke, zerlegt die
Schlüssel der Form `"400 (5)"` in Status und Code, folgt der `$ref` zur Definition (nicht
über den Namen, weil die Namensregel bei fünf Endpunkten scheitert, `grundlagen.md` 8.6),
und erzeugt `src/errors/catalog.generated.ts`:

```typescript
export const ERRORS: Record<string, Record<number, ErrorEntry>> = {
  "/receipts/get": {
    5:  { status: 400, message: "invalid list_direction specified", cls: "input",  field: "list_direction" },
    15: { status: 400, message: "invalid sort field specified",     cls: "input",  field: "order" },
    // ...
  },
  // ... 54 Endpunkte, zusammen 718 Einträge
};
```

Der Katalog liegt im Bündel, nicht im Modellkontext. In den Kontext gelangt immer nur der
eine passende Eintrag.

**Klassifizierung** (`errors/classify.ts`), nach `fehlercodes.md` D:

| Klasse | Erkennung | Verhalten |
| --- | --- | --- |
| `config` | Codes 3, 4, 11 endpunktübergreifend; zusätzlich Meldungen mit `... is not activated` oder `... are not activated for the customer` | kein Retry. Der Text nennt, welche der drei Zugangsdaten oder welche Kontoeinstellung zu prüfen ist, und verweist auf `bbutler-mcp doctor` |
| `input` | die große Mehrheit ab Code 5, Meldungsmuster `invalid <feld> specified`, `no <feld> specified`, Längen- und Zeichenregeln | kein Retry mit denselben Werten. Der Text nennt das Feld, den gesendeten Wert und die erlaubten Werte |
| `transient` | Code 0 (500), Code 30 (504), Code 15 **nur** an den zehn Batch- und Upload-Endpunkten | Retry nur bei lesenden Endpunkten, sonst `write-uncertain` |
| `quota` | Code 12 an `/receipts/upload`, Code 33 an den beiden Rechnungsendpunkten | kein Retry. Tarifgrenze, dem Nutzer melden |
| `final` | alle `not found`, alle Statuskonflikte, alle Betragsprüfungen | kein Retry. Der Text nennt den Zustand und das Werkzeug, mit dem er vorher zu prüfen ist |

**Sonderfall.** An `/transactions/add` und `/invoices/create/e-invoice` gibt es in der
Spezifikation widersprüchliche Codes (`fehlercodes.md` D5). Dort wird zusätzlich der
`message`-Text ausgewertet und, wenn beide nicht zusammenpassen, der Text bevorzugt und der
Widerspruch im Audit-Log vermerkt.

**Fehlertext, vier Blöcke, immer** (`tool-design.md` 8.2). Beispiel für einen
endpunktspezifischen Code:

```
Invalid value "19_ust" for vat in position 1 of bb_postings_create_free.
BuchhaltungsButler rejected the call with error_code 32 on /postings/add/free
("the tax key is invalid for specified account combination"). Nothing was posted.
Allowed vat keys are exactly: 0_none, 19_vat, 7_vat, 19_pre, 7_pre, 19_both_1,
19_both_506, 19_both_6506, 19_both_511, 19_both_6511, 19_both_6501, 19_both_2,
7_both, 19_both_1_no_pre, 19_both_2_no_pre, 7_both_no_pre, 19_pre_app, 7_pre_app,
19_both_app_1, 19_both_app_506, 19_both_app_511, 19_both_app_2, 7_both_app.
You probably meant "19_vat" (19% output VAT) or "19_pre" (19% input VAT).
Note that this error also appears when the key is valid but does not fit the
debit/credit account combination; if retrying with a corrected key fails again,
check the two accounts with bb_postingaccounts_search.
```

**Was nie in einen Fehlertext gelangt** (`tool-design.md` 8.4): Zugangsdaten in jeder Form,
der vollständige Request-Body, Stacktraces, rohes HTML. `errors/redact.ts` läuft über jeden
ausgehenden Text und ersetzt jedes Vorkommen der drei konfigurierten Werte durch
`<redacted>`; der Test `contract/secrets.test.ts` prüft das.

---

## 6. Konfiguration

### 6.1 Umgebungsvariablen

| Variable | Bedeutung | Pflicht | Vorgabe |
| --- | --- | --- | --- |
| `BB_API_CLIENT` | API Client, Basic-Auth-Benutzer | ja | keine |
| `BB_API_SECRET` | API Secret, Basic-Auth-Passwort | ja | keine |
| `BB_API_KEY` | `api_key`, wählt den Mandanten | ja | keine |
| `BB_BASE_URL` | Basis-URL | nein | `https://webapp.buchhaltungsbutler.de/api/v1` |
| `BB_PROFILE` | Profil in der Zugangsdatendatei | nein | `default` |
| `BB_CONFIG_DIR` | Ort der Zugangsdatendatei | nein | `${XDG_CONFIG_HOME:-~/.config}/buchhaltungsbutler-mcp`, Windows `%APPDATA%\buchhaltungsbutler-mcp` |
| `BB_MCP_READ_ONLY` | `true` beschränkt auf die 15 lesenden Endpunkte | nein | `false`, also aus |
| `BB_MCP_MAX_BATCH` | Obergrenze für `items`- und `positions`-Arrays | nein | `50` |
| `BB_MCP_MAX_AMOUNT` | Betragsgrenze für buchende Werkzeuge | nein | nicht gesetzt, also aus |
| `BB_MCP_RATE_LIMIT` | Anfragen je Minute im `general`-Bucket, 10 bis 100 | nein | `60` |
| `BB_MCP_TIMEOUT_MS` | Standardtimeout, mindestens 5000 | nein | `30000` |
| `BB_MCP_DUPLICATE_CHECK` | `on` oder `off` | nein | `on` |
| `BB_ALLOWED_FILE_DIRS` | Verzeichnisliste, schaltet `file://`-Quellen frei | nein | leer, also aus |
| `BB_MCP_TOOLSETS` | Ressourcengruppen, siehe 4.6 Punkt 2 | nein | leer, alle 54 |
| `BB_LOG_LEVEL` | `error`, `warn`, `info`, `debug` | nein | `warn` |

**Namenskonflikt, aufgelöst.** `distribution.md` 13.2 nennt `BB_READ_ONLY`,
`tool-design.md` 9.5 nennt `BB_MCP_READ_ONLY` und schreibt den Absagetext wörtlich vor, der
diesen Namen enthält. Kanonisch ist `BB_MCP_READ_ONLY`. `BB_READ_ONLY` wird weiterhin
akzeptiert, erzeugt aber eine Warnung auf stderr und wird in der README nicht mehr genannt.
Sind beide gesetzt und widersprechen sich, gewinnt der restriktivere Wert, und die
`instructions` sagen es.

### 6.2 Auflösungsreihenfolge

1. Umgebungsvariablen. Sind alle drei Pflichtwerte gesetzt, wird nichts anderes gelesen.
2. Zugangsdatendatei, Profil aus `BB_PROFILE`, sonst `default`. Format nach
   `distribution.md` 13.2, Rechte `0600`, Verzeichnis `0700`. Sind die Rechte weiter, gibt es
   eine Warnung auf stderr, aber keinen Abbruch.
3. Fehlt danach ein Wert: Zustand **nicht konfiguriert**, siehe 6.4.

Kommandozeilenargumente für Zugangsdaten gibt es nicht, auch keine Option `--api-key`
(`distribution.md` 13.1). Was nicht existiert, kann niemand in eine Prozessliste schreiben.

### 6.3 Validierung beim Start

Zod prüft: alle drei Pflichtwerte nicht leer, `BB_BASE_URL` ist eine absolute `https`-URL,
`BB_MCP_MAX_BATCH` zwischen 1 und 50, `BB_MCP_RATE_LIMIT` zwischen 10 und 100,
`BB_MCP_TIMEOUT_MS` mindestens 5000, `BB_MCP_TOOLSETS` enthält nur bekannte Gruppennamen,
jedes Verzeichnis in `BB_ALLOWED_FILE_DIRS` existiert und ist ein Verzeichnis.

**Bei einem ungültigen Wert** (nicht: fehlend) startet der Server nicht. Auf stderr steht,
welche Variable welchen Wert hat, warum er ungültig ist und welcher Wertebereich gilt. Ein
ungültiger Wert ist ein Tippfehler des Betreibers, und ein Server, der ihn stillschweigend
durch die Vorgabe ersetzt, verbirgt genau das, was der Betreiber wissen muss.

### 6.4 Verhalten bei fehlender Konfiguration

**Abweichung von `distribution.md` 13.2, begründet.** Das Dossier verlangt Abbruch. Aus der
Sicht des Agenten ist Abbruch die schlechteste Variante: Der Client meldet "Server konnte
nicht gestartet werden", der Agent sieht kein Werkzeug, kann dem Nutzer nichts sagen, und die
eigentliche Ursache steht in einer Protokolldatei, die niemand öffnet.

Stattdessen:

1. Der Server **startet** und registriert alle 54 Werkzeuge.
2. Auf stderr erscheint sofort eine deutliche, mehrzeilige Warnung mit der Liste der
   fehlenden Werte und den zwei Wegen, sie zu setzen. Das ist kein stiller Start.
3. Die `instructions` beginnen mit: `NOT CONFIGURED. No BuchhaltungsButler credentials were
   found, so every tool call will fail until the server is restarted with credentials. Tell
   the user to run: npx -y @dennismenken/buchhaltungsbutler-mcp setup`
4. Jeder Werkzeugaufruf antwortet mit `isError: true` und:

```
bb_receipts_search cannot run: this server has no BuchhaltungsButler credentials.
Missing: BB_API_SECRET, BB_API_KEY. BB_API_CLIENT is set.
No request was sent and no data was read or changed.
Tell the user to run "npx -y @dennismenken/buchhaltungsbutler-mcp setup", or to set
BB_API_CLIENT, BB_API_SECRET and BB_API_KEY in the MCP server configuration of their
client, and then to restart the client. Credentials are read once at server start.
Do not try other tools of this server; they will all fail the same way.
```

Welcher Wert fehlt, wird genannt; kein Wert wird angezeigt, auch nicht gekürzt oder
maskiert. Der letzte Satz verhindert, dass ein hartnäckiger Agent 54 Werkzeuge durchprobiert.

### 6.5 Der optionale Nur-Lesen-Schalter

Genau nach `tool-design.md` 9.5, hier nur die für 54 Werkzeuge angepassten Zahlen:

- Standard `false`. Nach der Installation sind alle 54 Werkzeuge sofort aufrufbar (E2).
- Bei `true` führt der Server nur die 15 Werkzeuge mit Wirkung **lesend** aus. Die
  übrigen 39 lehnen ab, **bevor** ein Request abgeht.
- Die Klasse kommt aus `classes.ts`, nicht aus dem Namen und nicht aus einer eigenen
  Pfadliste. Verschiebt sich der Schnitt, verschiebt sich der Schalter mit.
- Der Schalter wird nur beim Start gelesen und ist zur Laufzeit nicht änderbar, auch nicht
  durch ein Werkzeug.
- Gesperrte Werkzeuge bleiben in `tools/list` **sichtbar**. Die Werkzeugliste hängt nicht
  vom Schalter ab.
- Der Absagetext ist wörtlich der aus `tool-design.md` 9.5, mit dem jeweiligen
  Werkzeugnamen.
- Folge für Berichte: Bei aktivem Schalter liefert nur `bb_reports_get_ledger` eine
  Auswertung ohne Vorbedingung. BWA und Summen- und Saldenliste brauchen
  `bb_reports_create_bwa` bzw. `bb_reports_create_sums`, und die sind gesperrt. Das steht in
  den `instructions`, in der README und in der Beschreibung von `bb_reports_get_bwa` und
  `bb_reports_get_sums`.

### 6.6 Die `instructions` des Servers

Rund 5.500 Zeichen, das einzige Dokument, das jeder Agent ohnehin sieht. Aufbau:

1. **Zustand.** Konfiguriert oder nicht. Nur-Lesen-Schalter an oder aus. Aktive
   Werkzeuggruppen. Betrags- und Batchgrenzen, falls gesetzt.
2. **Was dieser Server ist.** Inoffiziell, spricht mit dem echten Mandanten, 54 Werkzeuge,
   eines je API-Endpunkt.
3. **Kontenkunde in fünf Zeilen.** Zahlungskonto gegen Sachkonto gegen Debitor gegen
   Kreditor, mit den beiden Nachschlagewerkzeugen.
4. **Querschnittsregeln.** Datumsformat `YYYY-MM-DD`; leere Strings werden abgelehnt, also
   Felder weglassen; Beträge beim Senden als Zahl mit Punkt, beim Lesen als String;
   Booleans kommen als `"0"` und `"1"` zurück; `id_by_customer` ist je Mandant fortlaufend
   und keine globale Kennung; Zeitzone ist nicht dokumentiert, Werte werden unverändert
   durchgereicht.
5. **Paginierungsregel.** Die API nennt keine Gesamttrefferzahl. `rows` ist die Zeilenzahl
   **dieser** Antwort. Eine volle Seite bedeutet, dass es mehr geben kann.
6. **Wegweiser durch die zwölf Buchungswerkzeuge** (Abschnitt 3.6).
7. **Schreibhinweis.** Dieser Server fragt nicht nach. Die Freigabe liegt beim Client. Vor
   einem löschenden oder buchenden Aufruf sollen die betroffenen Datensätze erst gelesen
   und dem Nutzer vorgelegt werden.
8. **Liste der Resources.**

---

## 7. Antwortaufbereitung

### 7.1 Beides, strukturiert und Text

Jedes Werkzeug liefert `structuredContent` **und** einen `content`-Textblock
(`mcp-spezifikation.md`-Empfehlung, in `tool-design.md` 7.5 übernommen). Der Textblock ist
nicht redundant: Er ist das, was ein Client ohne `structuredContent`-Unterstützung anzeigt,
und das, was der Nutzer im Freigabedialog liest.

| Fall | `structuredContent` | `content` |
| --- | --- | --- |
| Liste | `{ endpoint, rows_returned, limit_used, offset_used, more_possible, items: [...] }` | Markdown-Tabelle plus Bestandszeile plus Anschlusshinweis |
| Einzelobjekt | das Objekt, normalisiert | lesbare Aufzählung |
| Schreiben | `{ endpoint, created: [...], reversal: {...}, duplicate_hint?: {...} }` | Satz plus aufgelöste Tabelle plus Umkehrweg |
| Bericht | `{ endpoint, report_id_by_customer, period, sums: {...} }` | Kopfzahlen plus Hinweis auf `get_files` |
| Fehler | **keines** | Vierblock-Text, `isError: true` |

`outputSchema` wird bei allen 54 Werkzeugen deklariert, aber schlank: Feldnamen und Typen,
keine Feldbeschreibungen (Sparmaßnahme S6 in 4.6). Wo ein `outputSchema` deklariert ist,
muss die Antwort ihm entsprechen; der Test `contract/schema-conformance` prüft das gegen
alle Fixtures.

### 7.2 Feldauswahl: `concise` und `detailed`

Jedes lesende Werkzeug bekommt `response_format` mit `enum ["concise","detailed"]` und
`default "concise"`. Das Feld wird **nicht** an die API gesendet; die Beschreibung sagt das.

Warum das hier mehr zählt als anderswo: `/postings/get` liefert live **38 Felder je
Buchung** (Anhang A, L4), darunter zwölf `receipts_assigned_*`-Felder. Eine Seite mit 100
Buchungen im Rohformat ist ein Kontextfresser ersten Ranges.

| Werkzeug | `concise` liefert |
| --- | --- |
| `bb_receipts_search` | `id_by_customer`, `date`, `counterparty`, `invoicenumber`, `amount`, `currency`, `payment_status`, `has_assigned_transaction`, `deleted` |
| `bb_transactions_search` | `id_by_customer`, `date`, `to_from`, `amount`, `currency`, `purpose`, `has_assigned_receipt` |
| `bb_postings_search` | `id_by_customer`, `date`, `postingtext`, `amount`, `debit_postingaccount_number`, `credit_postingaccount_number`, `tax_key`, `fixed`, `receipt_id_by_customer` |
| `bb_postingaccounts_search` | `postingaccount_number`, `name`, `type`, `subtype` |
| `bb_payment_accounts_list` | `postingaccount_number`, `name` (das sind alle Felder) |
| `bb_debtors_search`, `bb_creditors_search` | `postingaccount_number`, `name`, `customer_number`, `city` |
| `bb_cost_locations_search` | `code`, `name` |

Zusätzlich wird nach `tool-design.md` 7.2 aufgelöst, wo eine sprechende Bezeichnung
vorliegt: statt `postingaccount_number: "4980"` steht `postingaccount: "4980 Sonstiger
Betriebsbedarf"`, sofern der Kontenrahmen im kurzlebigen Cache liegt. Die Rohnummer bleibt
**zusätzlich** im Feld stehen, weil sie der Parameterwert des nächsten Aufrufs ist. Wer
Schlüssel nur verschönert und den Rohwert ersetzt, nimmt dem Modell genau diese Information.

### 7.3 Typnormalisierung

Die Typ-Asymmetrie der API (`grundlagen.md` 5.5, 5.7, 1.4) wird **normalisiert und
deklariert**, nicht roh durchgereicht.

| Feldart | Roh | In `structuredContent` |
| --- | --- | --- |
| Boolean | `"0"` / `"1"` | `false` / `true` |
| Betrag | `"123.99"` | `"123.99"` als String **plus** `amount_cents: 12399` |
| `id_by_customer` | `"8814"` | `8814` als Zahl |
| fehlender Wert | `null` | `null`, nie leerer String |

Beträge bleiben zusätzlich als String erhalten, weil die Rundung sonst unsichtbar würde.
Die Normalisierung steht in den `instructions`, damit der Agent nicht überrascht ist, wenn
die Rohantwort der API anders aussieht als das, was er sieht.

### 7.4 Paginierung und Kürzung

**Die zentrale Ehrlichkeitsregel: Es gibt keine Gesamttrefferzahl.** `rows` ist die
Zeilenzahl dieser Antwort (`grundlagen.md` 4.1 und 6.2, live belegt). Jede Formulierung wie
"100 von 500" ist eine Lüge: Wer `rows` für die Gesamtzahl hält, meldet dem Aufrufer eine
Vollständigkeit, die nicht belegt ist.

Unsere Bestandszeile, drei Fälle:

```
Returned 100 rows (limit=100, offset=0). A full page means there may be more:
call bb_receipts_search again with the same filters and offset=100.
Narrowing with date_from/date_to or counterparty is usually cheaper than paging.
```

```
Returned 37 rows (limit=100, offset=0). Fewer rows than the limit, so this is the
complete result for these filters.
```

```
Returned 0 rows. The filters matched nothing; this is not an error.
```

Für die sieben Endpunkte mit `limit`/`offset` werden beide durchgereicht, mit unserem
konservativeren Standardwert:

| Endpunkt | API-Standard | Unser `default` | `maximum` im Schema |
| --- | --- | --- | --- |
| `/receipts/get`, `/transactions/get` | 500 | 100 | 500 |
| `/postings/get` | keiner | 100 | 1000 |
| `/cost-locations/get` | keiner | 200 | 1000 |
| `/settings/get/debtors`, `/settings/get/creditors` | **25** | 100 | nicht dokumentiert, Schema ohne `maximum`, Warnung im Text |
| `/settings/get/postingaccounts` | 1000 | 200 | nicht dokumentiert, Schema ohne `maximum`, Warnung im Text |

Der Standardwert 25 bei Debitoren und Kreditoren ist eine stille Falle; deshalb setzt der
Server `limit` bei diesen beiden Werkzeugen **immer** explizit, auch wenn der Agent es
weglässt, und die Beschreibung sagt es.

Die 47 Endpunkte ohne Paginierung werden serverseitig gekürzt und die Kürzung ausgewiesen.
Grenzen nach `tool-design.md` 7.1: weich 5.000 Token, hart 20.000 Token je Antwort, geschätzt
über dieselbe Zeichenmethode wie in 4.6. Bei Kürzung:

```
Showing 120 of 281 returned rows; the rest was omitted to stay within the response
budget (about 5000 tokens). Nothing was lost at the API level.
To see the rest, narrow the query, or use response_format="concise".
```

**Keine Auto-Paginierung im ersten Wurf.** Eine Auto-Paginierung, die die Zeilenzahl einer
Antwort für die Gesamttrefferzahl hält, bricht nach der ersten Seite ab und meldet trotzdem
Vollständigkeit; sie verliert Daten, ohne es zu bemerken. Falls sie später kommt, gilt die
Abbruchbedingung aus `grundlagen.md` 6.3 (leere oder unvollständige Seite), und die Antwort
muss unterscheiden, ob die Schleife endete, weil die Daten zu Ende waren, oder weil die
Seitenobergrenze erreicht war.

### 7.5 Anschlusshinweise

Der Teil, der aus einer brauchbaren Antwort eine gute macht. Der Hinweis erscheint nur, wenn
er nicht offensichtlich ist, und nie als Anweisung an das Modell formuliert, sondern als
Befund mit Handlungsoption.

| Situation | Hinweis |
| --- | --- |
| Suche findet Belege ohne zugeordnete Zahlung | `12 of these 100 receipts have no assigned transaction. bb_receipts_list_transactions shows the assignment for one receipt; bb_transactions_assign_receipt creates one.` |
| `bb_reports_create_bwa` erfolgreich | `Report 42 was requested. Generation runs in the background. Fetch it with bb_reports_get_bwa and report_id_by_customer=42. While it is still running that call answers with error_code 8; wait a few seconds and retry. Do not call bb_reports_create_bwa again in the meantime, it would replace this report.` |
| `bb_postingaccounts_search` liefert eine volle Seite | `A full page was returned; this tenant may have more accounts than shown. The list mixes general ledger accounts, payment accounts, debtors and creditors; use the exclude_* flags or filter by the type column.` |
| Schreiben erfolgreich, Duplikat gefunden | `A receipt with the same date, amount and counterparty already exists (id_by_customer 8801). If this call was a retry after a timeout, you have now created a duplicate; mark the new one as deleted with bb_receipts_delete.` |
| `bb_postings_cancel` auf festgeschriebener Buchung | `Posting 8814 was fixed ("festgeschrieben"), so it was not removed. A Storno entry was created instead and is permanently visible in the history.` |

**Was in einer Antwort nichts zu suchen hat** (`tool-design.md` 7.6): Sätze, die das Modell
zu etwas anweisen, das über die Auswertung des Ergebnisses hinausgeht. Freitextfelder aus der
API (`counterparty`, `purpose`, `comment`, Belegdateinamen) stammen von Dritten. Sie werden
in Tabellenzellen ausgegeben, mit neutralisierten Zeilenumbrüchen und Pipe-Zeichen, nie in
einer Form, die wie eine Anweisung an das Modell aussieht.

---

## 8. Einrichtungsassistent

Grundlage: `distribution.md` 14, hier verdichtet und um die Punkte ergänzt, die dieser Plan
festlegt.

### 8.1 Befehlsform

```
bbutler-mcp                       startet den MCP-Server auf stdio (Normalfall, kein Argument)
bbutler-mcp setup                 Einrichtungsassistent
bbutler-mcp doctor                Diagnose ohne Geheimnisse
bbutler-mcp test                  nur der Verbindungstest, für CI
bbutler-mcp profiles list|add|remove
bbutler-mcp print-config --client <name>
bbutler-mcp uninstall --client <name>
bbutler-mcp --version | --help
```

Drei Wege zum selben Programm: `npx -y @dennismenken/buchhaltungsbutler-mcp <unterbefehl>`,
nach globaler Installation `bbutler-mcp <unterbefehl>`, oder ausdrücklich
`npx -y --package=@dennismenken/buchhaltungsbutler-mcp bbutler-mcp <unterbefehl>`.

Jeder Unterbefehl schreibt ausschließlich auf stdout und stderr eines Terminals, niemals in
eine laufende MCP-Verbindung. Zugangsdaten werden nie als Argument entgegengenommen; im nicht
interaktiven Modus liest der Assistent sie ausschließlich aus den drei Umgebungsvariablen.

### 8.2 Ablauf von `setup`

1. **Vorprüfung.** Node-Version gegen `>=22.12.0`, Abbruch bei Unterschreitung. Erkennen,
   welche Clients vorhanden sind, über `which`/`where` für `claude`, `codex`, `grok`, `code`
   und über die bekannten Konfigurationspfade für Claude Desktop, Cursor, Windsurf, LM Studio.
2. **Zugangsdaten erfragen.** Drei maskierte Eingaben. Hinweis, wo die Werte zu finden sind:
   Einstellungen, Schnittstellen und API-Zugang; die Firmendaten-Einstellungen werden als
   zweiter möglicher Ort genannt, weil sich die Quellen widersprechen (`grundlagen.md` 2.3).
   Bereits gesetzte Umgebungsvariablen werden als Vorbelegung erkannt, ohne den Wert zu zeigen.
3. **Verbindung testen.** Genau ein lesender Aufruf gegen `/accounts/get`. Die
   Ergebnisdeutung ist der eigentliche Nutzen:

   | Ergebnis | Klartext |
   | --- | --- |
   | 200, `success: true` | Zugangsdaten vollständig gültig; Anzahl der gefundenen Zahlungskonten wird genannt |
   | 401, `error_code` 3 | API Client oder API Secret falsch |
   | 401, `error_code` 4 | `api_key` falsch, oder dieser Client darf diesen Mandanten nicht bedienen |
   | 403, `error_code` 11 | Mandantenkonto nicht aktiv |
   | Antwort nicht JSON | Basis-URL falsch oder ein Portal davor |
   | Netzfehler | Verbindung, Proxy, Firewall |

4. **Startvariante wählen.** `npx` (Vorgabe) oder globale Installation; bei letzterer wird
   der absolute Pfad des Binaries ermittelt und geschrieben, statt sich auf `PATH` zu verlassen.
5. **Ablageort wählen.** Zugangsdatendatei mit `0600` (Vorgabe), direkt in die
   Clientkonfiguration (mit Warnung), oder nichts schreiben.
6. **Clients auswählen.** Mehrfachauswahl.
7. **Vorschau und Bestätigung.** Vollständiger Pfad und einzufügender Block, Geheimnisse
   maskiert. Vor jeder Änderung an einer bestehenden Datei eine Sicherung
   `<datei>.bak-<zeitstempel>`, deren Pfad genannt wird. Bestehende Einträge werden nie ohne
   ausdrückliche Zustimmung überschrieben.
8. **Abschluss.** Je Client eine Zeile, was zu tun ist (Claude Desktop vollständig neu
   starten, Cursor neu laden, Codex und Grok brauchen nichts), und die passende Prüfzeile.
9. **Ein Satz zum Nur-Lesen-Schalter.** Der Assistent fragt einmal: "Soll dieser Server
   zunächst nur lesen dürfen?" Vorgabe **nein** (E2). Bei "ja" wird `BB_MCP_READ_ONLY=true`
   in die erzeugte Konfiguration geschrieben, zusammen mit dem Hinweis, dass BWA und Summen-
   und Saldenliste dann nicht erzeugt werden können.

### 8.3 Welche Clients automatisch konfiguriert werden

Regel nach `distribution.md` 14.3: Wo eine offizielle CLI existiert, wird sie aufgerufen; wo
nur eine Datei existiert und diese reines JSON ist, wird geschrieben; wo das Format Kommentare
tragen kann oder der Pfad nicht dokumentiert ist, wird der fertige Block ausgegeben. Geraten
wird nicht.

| Automatisch | Weg |
| --- | --- |
| Claude Code | `claude mcp add-json` als Unterprozess |
| Codex CLI und ChatGPT-Desktop | `codex mcp add` als Unterprozess |
| Grok Build | `grok mcp add` als Unterprozess |
| VS Code | `code --add-mcp`, oder `.vscode/mcp.json` schreiben, wenn `inputs` gebraucht wird |
| Claude Desktop | `claude_desktop_config.json` lesen, ergänzen, zurückschreiben |
| Cursor | `~/.cursor/mcp.json` oder `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| LM Studio | `~/.lmstudio/mcp.json`, mit Vorbehalt; bei Nichtvorhandensein nur ausgeben |
| Cline (CLI) | `~/.cline/mcp.json` |

| Nur ausgeben | Grund |
| --- | --- |
| Zed | `settings.json` ist JSONC mit Kommentaren |
| Continue | YAML im Arbeitsbereich, Ablageort projektabhängig |
| Cline (IDE), Jan | kein dokumentierter Dateipfad |
| ChatGPT im Browser | technisch ausgeschlossen |

### 8.4 `doctor`

Die Ausgabe ist das, was in einen Fehlerbericht gehört, und enthält garantiert keine
Geheimnisse: Paketversion, Node-Version, Auflösungsweg der Zugangsdaten (Quelle, nicht
Werte), welche der drei Werte gesetzt sind, Dateirechte der Zugangsdatendatei, Ergebnis des
Verbindungstests mit Deutung, Schalterlage (`BB_MCP_READ_ONLY`, `BB_MCP_TOOLSETS`,
`BB_MCP_MAX_BATCH`, `BB_MCP_MAX_AMOUNT`), Anzahl registrierter Werkzeuge, gemessene
Token-Größe der Definitionen, gefundene Clientkonfigurationen mit Pfad.

---

## 9. Teststrategie

### 9.1 Die absolute Regel

**Kein Test schreibt gegen die echte API. Nie.** Durchgesetzt auf drei Ebenen, nicht durch
Disziplin:

1. `vitest.config.ts` setzt einen globalen Setup, der `undici`-`MockAgent` mit
   `disableNetConnect()` installiert. Ein Test, der doch einen echten Aufruf versucht, wirft
   sofort.
2. `test/live/read-only-smoke.test.ts` ist die einzige Ausnahme, läuft nur bei
   `BB_LIVE_TEST=1`, ist in CI nicht gesetzt, und ruft nur Pfade aus einer fest einkompilierten
   Allowlist der 15 lesenden Endpunkte auf. Jeder andere Pfad lässt den Test scheitern,
   **bevor** der Aufruf abgeht.
3. Ein Lint-Schritt verbietet in `test/` die Muster `fetch(` ohne Mock und jede Zeichenkette,
   die wie ein Zugangsdatum aussieht.

### 9.2 Vertragstests, die den Plan absichern

| Test | Prüft | Schlägt fehl, wenn |
| --- | --- | --- |
| `coverage.test.ts` | 54 Werkzeuge, 54 Endpunkte, jeder der 371 Parameter genau einmal abgebildet | ein Parameter fehlt oder ein `apiName` ins Leere zeigt |
| `names.test.ts` | `^[a-z][a-z0-9_]{2,39}$`, Präfix `bb_`, Eindeutigkeit, Verb aus der Liste (Segment hinter der Ressource, nicht Namensendung), Ressource im Plural | ein Name gegen eine Regel verstößt |
| `annotations.test.ts` | vier Hints je Werkzeug gesetzt, Werte stimmen mit `classes.ts`, `openWorldHint` überall `true`, jedes Werkzeug genau einmal in der Klassentabelle | eine Zeile fehlt oder widerspricht |
| `descriptions.test.ts` | Längenkorridor je Stufe, Pflichtsatz je Wirkung (3.7), Systemname im ersten Satz, kein `confirm`-Parameter, kein Verweis auf ein nicht registriertes Werkzeug | ein Pflichtsatz fehlt oder ein Verweis ins Leere zeigt |
| `token-budget.test.ts` | Summe unter 26.000 Token, je Werkzeug unter dem Stufenbudget, `instructions` unter 1.800 | das Budget reißt |
| `secrets.test.ts` | kein Zugangsdatum in Definitionen, Fixtures, Fehlertexten, Resource-Inhalten | ein Treffer |
| `read-only.test.ts` | mit `BB_MCP_READ_ONLY=true` lehnen alle 39 schreibenden Werkzeuge ab, ohne Request; die 15 lesenden führen aus; die Werkzeugliste ist in beiden Läufen identisch; die Absage nennt die Variable und den Zielwert | eines der 39 sendet einen Request |
| `schema-conformance.test.ts` | jede Fixture-Antwort validiert gegen das `outputSchema` ihres Werkzeugs | eine Abweichung |

Der Verweistest in `descriptions.test.ts` ist wichtiger, als er klingt: Ein Abgrenzungssatz,
der auf ein nicht existierendes Werkzeug zeigt, lenkt den Agenten in einen garantierten
Fehlschlag (`tool-design.md` 5.5).

### 9.3 HTTP-Nachbildung

`undici`-`MockAgent`. Die Fixtures werden **aus den in den Dossiers belegten Live-Beobachtungen
abgeleitet**, nicht aus dem, was der Code erwartet: Ein Mock, der die Annahme des Codes
wiederholt, prüft nichts. Konkret enthalten die Fixtures die belegten
Eigenheiten:

- `rows` als Zeilenzahl dieser Antwort, nicht als Gesamtzahl.
- `delivery_date` statt `date_delivery`, `amount_paid` und `amount_paid_fixed` vorhanden,
  obwohl die Spezifikation sie nicht kennt.
- Booleans als `"0"` und `"1"`, Beträge als Strings, `id_by_customer` als String.
- `null` statt leerer Strings.
- Eine HTML-Antwort mit `content-type: text/html` für den Unbekannter-Pfad-Fall.
- Eine Antwort mit `success: false` und HTTP 200, um zu prüfen, dass wirklich `success`
  ausgewertet wird und nicht nur der Status.
- Eine volle Seite (`rows === limit`) und eine unvollständige, für die Bestandszeile.

### 9.4 Verhaltenstests, die es sonst nirgends gibt

| Test | Warum |
| --- | --- |
| Retry-Trennung | Ein 504 an einem lesenden Endpunkt führt zu genau 3 Versuchen; derselbe 504 an einem schreibenden zu genau 1 Versuch plus `write-uncertain`-Text, der den konkreten Prüfaufruf nennt |
| Rate-Limiter-Entnahme | Ein Retry entnimmt einen weiteren Token. Der Test zählt die Entnahmen und fängt damit den Fall, dass der Limiter vor der Retry-Schleife statt in ihr liegt |
| Parallele Arrays | Eine Positionsliste mit drei Einträgen erzeugt vier bzw. sechs Arrays mit je drei Elementen; `null` in `oi_receipts_ids_by_customer` überlebt die JSON-Kodierung |
| Code 15 doppeldeutig | Code 15 an `/receipts/get` wird als Eingabefehler behandelt (kein Warten), Code 15 an `/receipts/addBatch` als transient |
| Kürzung | Eine Antwort mit 1000 Zeilen wird gekürzt, die Kürzung ausgewiesen, und die Bestandszeile lügt nicht |
| Versionsermittlung | `version.ts` liefert die echte Version; ein Test fängt das stille Scheitern ab, denn die Ermittlung schluckt jeden Fehler und bliebe sonst unbemerkt |
| Redaction | Ein künstlich in eine API-Fehlermeldung eingeschleustes Zugangsdatum taucht in keinem ausgehenden Text auf |

### 9.5 Integrationstest in CI

Den **gebauten** Server starten, per `@modelcontextprotocol/client` `initialize`,
`tools/list` und mindestens einen `tools/call` gegen einen Mock ausführen. Ein `tsc --noEmit`
allein fängt die Importpfad- und Packaging-Fallstricke nicht
(`mcp-sdk-typescript.md` 10.4 Punkt 12). Der Test prüft zusätzlich, dass `tools/list` genau
54 Einträge liefert und dass jeder Eintrag `annotations` mit allen vier Hints trägt.

### 9.6 Evaluationslauf

Die zehn Aufgaben aus `tool-design.md` 10.2, gegen einen aufgezeichneten Mock, mit den
Kennzahlen aus 10.3. Zwei Kennzahlen sind für diesen Entwurf die entscheidenden:

- **Falsche Werkzeugwahl bei den 12 Buchungswerkzeugen: 0.** Das misst, ob 3.6 funktioniert.
- **Blindes Schreiben: 0, ohne Toleranz.** Aufrufe mit Wirkung löschend oder buchend, vor
  denen der Agent die betroffenen Datensätze weder gelesen noch dem Nutzer vorgelegt hat. Ein
  Fehlschlag hier ist ein Befund gegen den Text der Werkzeuge, nicht gegen die Serverlogik,
  denn der Server erzwingt die Reihenfolge nicht (E2).

Zusätzlich eine Aufgabe, die es in `tool-design.md` 10.2 noch nicht gibt und die diesem
Entwurf entspringt:

> 11. "Auf welchem Konto liegt die Zahlung von Lieferant X, und auf welches Sachkonto wurde
>     sie gebucht?" — prüft ausschließlich, ob der Agent Zahlungskonto und Sachkonto
>     auseinanderhält und die richtigen zwei Nachschlagewerkzeuge wählt.

---

## 10. README-Gliederung

Deutsch, nach `distribution.md` 17 (Disclaimer oben, zwei Wege zur Wahl, Fehlersuchtabelle,
Verifikationsschritt, nicht unterstützte Clients mit Begründung).

```
# BuchhaltungsButler MCP (inoffiziell)

> Hinweis oben, vor allem anderen:
>   Inoffizielles Projekt, keine Verbindung zur BuchhaltungsButler GmbH.
>   Der Server arbeitet auf echten Buchhaltungsdaten. 39 der 54 Werkzeuge schreiben.
>   Nach der Installation sind alle 54 Werkzeuge sofort aufrufbar. Die Freigabe
>   einzelner Werkzeuge regelt Ihr Client.

1. Was der Server kann            54 Werkzeuge, eines je API-Endpunkt, Tabelle nach Bereichen
2. Voraussetzungen                Node >= 22.12.0, BuchhaltungsButler-Konto mit aktivierter API
3. Zugangsdaten beschaffen        Einstellungen, Schnittstellen und API-Zugang; drei Werte
4. Schnellstart                   npx -y @dennismenken/buchhaltungsbutler-mcp setup
5. Installation je Client
   5.1 Claude Code                claude mcp add-json, die drei Scopes erklärt
   5.2 Claude Desktop             claude_desktop_config.json, plus MCPB-Bundle als zweiter Weg
   5.3 OpenAI Codex CLI           codex mcp add, TOML-Format
   5.4 ChatGPT-Desktop-App        wie Codex
   5.5 Grok Build (xAI)           grok mcp add
   5.6 Cursor                     ~/.cursor/mcp.json
   5.7 VS Code mit Copilot        code --add-mcp oder .vscode/mcp.json mit inputs
   5.8 Windsurf, Zed, Cline, Continue, LM Studio, Jan
   5.9 Andere Clients             generische Form
   5.10 Nicht unterstützt        ChatGPT im Browser, mit Begründung
6. Statt npx: feste Installation  npm install -g, absoluter Pfad
7. Umgebungsvariablen             vollständige Tabelle aus Abschnitt 6.1
8. Nur lesen lassen               BB_MCP_READ_ONLY, Standard aus, Folge für BWA und SuSa
9. Weitere Grenzen                BB_MCP_MAX_BATCH, BB_MCP_MAX_AMOUNT, BB_MCP_RATE_LIMIT
10. Mehrere Mandanten             Profile in der Zugangsdatendatei
11. Was der Server mit Ihren Daten macht
    Zugangsdaten nur im Prozess, kein Telemetrieversand, stderr-Protokoll ohne Geheimnisse,
    Kontextkosten der Werkzeugdefinitionen offen beziffert
12. Dateien hochladen             base64 als Standard, file:// nur mit BB_ALLOWED_FILE_DIRS,
                                  Warnkasten zur Prompt-Injection-Kette
13. Verifikation                  bbutler-mcp doctor, was eine gesunde Ausgabe zeigt
14. Fehlersuche                   Tabelle Symptom, Ursache, Abhilfe
15. Bekannte Einschränkungen     die Punkte aus Abschnitt 12 dieses Plans, in Nutzersprache
16. Mitwirken                     Fehler melden, Entwicklungsumgebung, Tests
17. Lizenz und Abgrenzung         MIT; Markenhinweis; keine Verbindung zum Anbieter
```

Die Fehlersuchtabelle in 14 enthält mindestens: Server erscheint nicht im Client; "NOT
CONFIGURED" in jeder Antwort; 401 mit Code 3 gegen 401 mit Code 4; Antwort ist HTML;
Werkzeuge antworten mit der Nur-Lesen-Absage; Debitorenliste zeigt nur 25 Einträge;
Kontenliste scheint unvollständig.

---

## 11. Arbeitspakete

Abhängigkeiten sind so geschnitten, dass ab AP3 vier Stränge parallel laufen können.

| AP | Titel | Hängt ab von | Liefert |
| --- | --- | --- | --- |
| **AP0** | **Vier Klärungsaufrufe gegen die echte API, nur lesend** | – | Antwort auf die vier Fragen, die den Entwurf beeinflussen |
| AP1 | Gerüst und Werkzeugkette | – | `package.json`, `tsconfig.json`, `tsdown`, ESLint, Biome, Vitest, CI-Grundgerüst, `src/cli.ts` mit Shebang, leerer `McpServer`, der `initialize` beantwortet |
| AP2 | Extraktion | – | `scripts/extract-spec.ts`, `scripts/extract-errors.ts`, `src/generated/spec-inventory.json`, `src/errors/catalog.generated.ts`, Test, dass 54 Pfade und 718 Fehlereinträge entstehen |
| AP3 | Konfiguration | AP1 | `config/env.ts`, `credentials.ts`, `resolve.ts`, Zustand "nicht konfiguriert", Tests |
| AP4 | HTTP-Schicht | AP1, AP3 | `http/*`, Rate-Limiter, Retry-Trennung, Content-Type-Prüfung, Umschlagserkennung, Tests mit MockAgent |
| AP5 | Fehlerschicht | AP2, AP4 | `errors/classify.ts`, `render.ts`, `write-uncertain.ts`, `redact.ts`, Tests inklusive Code-15-Doppeldeutigkeit |
| AP6 | Manifestgerüst und Vokabular | AP2 | `tools/types.ts`, `registry.ts`, `classes.ts`, `schema-builder.ts`, `vocab.ts`, dazu `coverage.test.ts`, `names.test.ts`, `annotations.test.ts` **vor** den Manifestdateien, damit sie beim Befüllen rot sind und grün werden |
| AP7a | Manifest Belege und Zahlungen | AP6 | 16 Werkzeuge (receipts, transactions) |
| AP7b | Manifest Buchungen | AP6 | 12 Werkzeuge (postings), inklusive Positionsliste |
| AP7c | Manifest Stammdaten | AP6 | 18 Werkzeuge (debtors, creditors, postingaccounts, payment_accounts, comments, cost_locations) |
| AP7d | Manifest Rechnungen und Berichte | AP6 | 8 Werkzeuge (invoices, reports) |
| AP8 | Mapping und Präsentation | AP4, AP6 | `mapping/*`, `presentation/*`, Projektionen, Kürzung, Anschlusshinweise, Tests |
| AP9 | Guards | AP3, AP6 | Nur-Lesen, Batchgrenze, Betragsgrenze, Duplikatshinweis, `read-only.test.ts` |
| AP10 | Upload-Kette | AP4 | `upload/*`, SSRF-Abwehr, Magic Bytes, `file://` hinter Allowlist, Tests |
| AP11 | Resources, `instructions`, Token-Messung | AP7a–d | `resources/*`, `config/instructions.ts`, `scripts/measure-tokens.ts`, `token-budget.test.ts` mit **gemessenen** statt geschätzten Zahlen |
| AP12 | Einrichtungsassistent | AP3, AP4 | `setup/*`, Clientadapter, `doctor`, `print-config`, `uninstall` |
| AP13 | Integrationstest und Evaluation | AP8, AP9, AP11 | `integration/server.test.ts`, Evaluationslauf über die 11 Aufgaben, Kennzahlenbericht |
| AP14 | README und Bundle | AP11, AP12 | README nach Abschnitt 10, MCPB-Bundle mit aus der Registry erzeugter Werkzeugliste, `manifest.json` |
| AP15 | Veröffentlichung | AP13, AP14 | Release-Workflow mit Trusted Publishing und Provenance, Tag-Versions-Abgleich, Bundle-Bau **vor** dem npm-Publish, GitHub-Repository anlegen |
| AP16 | Skeptikerphase | alle | Kritische Prüfung mit frischem Kontext, Findings, Fixing-Runde, erneute Prüfung |

**Parallelisierbar:** AP0, AP1, AP2 sofort. Danach AP3, AP4, AP5, AP6 weitgehend
nebeneinander. Danach die vier Manifeststränge AP7a bis AP7d echt parallel, weil sie
verschiedene Dateien anfassen und alle gegen dieselben, in AP6 fertigen Vertragstests
arbeiten. AP10 und AP12 hängen nur an AP4 bzw. AP3 und können die ganze Zeit nebenherlaufen.

### AP0 im Detail, weil es den Entwurf beeinflusst

Vier lesende Aufrufe. **Kein schreibender Aufruf, unter keinen Umständen.**

1. **Pfadsegment-Hypothese, Belege** (Abschnitt 3.8). Eine über `/receipts/get` ermittelte
   Kennung einsetzen:
   `POST {BASE}/receipts/get/<id>` mit Body `{"api_key":"..."}`.
   Ergebnis entscheidet, ob `bb_receipts_get` mit Pfadsegment gebaut wird.
2. **Pfadsegment-Hypothese, Zahlungen.** `POST {BASE}/transactions/get/<id>` mit demselben
   Body.
3. **Gesamtzahl der Kreditoren.** `POST {BASE}/settings/get/creditors` mit
   `{"api_key":"...","limit":500}`. Klärt, ob ein `maximum` oberhalb von 25 akzeptiert wird,
   und liefert die Obergrenze für das Schema. Ein abgelehnter Wert ist genauso ein Ergebnis
   wie ein akzeptierter.
4. **Sortierung bei `/postings/get`.** `POST {BASE}/postings/get` mit engem Zeitraum,
   `"limit":1` und `"order":"date asc"` (klein geschrieben). Erwartet wird ein Fehler, weil
   die Validierung case sensitive ist. Bestätigt, dass das Enum in der Schreibweise der
   Spezifikation richtig ist.

Jedes Ergebnis wird in `docs/api/` an der passenden Stelle nachgetragen, mit Datum und der
Kennzeichnung, ob es eine Hypothese bestätigt oder widerlegt.

---

## 12. Risiken und offene Punkte

### 12.1 Risiken dieses Entwurfs

| # | Risiko | Schwere | Gegenmaßnahme |
| --- | --- | --- | --- |
| R1 | **Der Kontextpreis von 54 Werkzeugen.** Rund 24.000 Token, mehr als das Doppelte des in `tool-design.md` 10.3 genannten Zielwerts, und oberhalb der in `ANTHROPIC-SEARCH` belegten Degradationsschwelle von 30 bis 50 Werkzeugen | hoch | Budget gesetzt und maschinell erzwungen (4.6); Sparmaßnahmen S1 bis S6; Resources statt Beschreibungstext; optionales `BB_MCP_TOOLSETS`. **Der Rest ist der Preis von E1 und lässt sich nicht wegkonstruieren** |
| R2 | **Trefferquote bei 54 Werkzeugen.** Die Degradationsschwelle ist ein belegter Befund, nicht eine Meinung. Es ist möglich, dass ein Agent trotz aller Maßnahmen aus 3.6 häufiger danebengreift als bei 34 Werkzeugen | hoch | Der Evaluationslauf aus AP13 misst es. Fällt die Kennzahl "falsche Werkzeugwahl bei den 12 Buchungswerkzeugen" nicht auf 0, ist das ein Befund, der dem Projektinhaber vorgelegt werden muss, nicht einer, den der Implementierungs-Agent selbst durch Zusammenfassen löst |
| R3 | **Das Manifest ist groß und kann fachlich falsch sein**, ohne dass ein Test es merkt: ein fehlender Enum-Wert lehnt gültige Vorgänge ab, bevor der Request abgeht, und ist am Serververhalten nicht erkennbar | mittel | Jedes Enum trägt im Manifest die Belegstelle. Wo die Spezifikation als handgepflegt bekannt ist, fällt die Entscheidung Enum gegen freier String bewusst und wird kommentiert. Im Zweifel freier String mit Werteliste in der Beschreibung |
| R4 | **Der Duplikatshinweis kostet einen zusätzlichen Request** aus einem geteilten Kontingent von 100 je Minute. Bei 50 Anlagen in Folge verdoppelt er die Last | mittel | Standardmäßig an, über `BB_MCP_DUPLICATE_CHECK=off` abschaltbar; bei Batch-Werkzeugen läuft er einmal für den ganzen Stapel, nicht je Element |
| R5 | **Die vier `id_by_customer`-Werkzeuge könnten weiterhin nicht funktionieren.** Dann liefern wir vier Werkzeuge aus, die scheitern | mittel | AP0 klärt es zuerst. Fällt die Klärung negativ aus, trägt jede der vier Beschreibungen den Warnsatz aus 3.8 mit dem konkreten Ersatzweg. Die Alternative, sie wegzulassen, widerspricht E1 und E6 |
| R6 | **`response_format` und `positions` sind Felder, die die API nicht kennt.** Ein sehr strenger Leser könnte darin einen Verstoss gegen E1 sehen | niedrig | Beide sind in der Beschreibung als serverseitige Felder ausgewiesen, `response_format` wird nie gesendet, `positions` wird nachweislich in die dokumentierten Arrays zerlegt. `tool-design.md` 11.6 verlangt `response_format` ausdrücklich |
| R7 | **`destructiveHint: true` bei den vier `update`-Werkzeugen** weicht von `tool-design.md` 9.3 ab und kann in Clients zu strengeren Freigabedialogen führen, als der Nutzer erwartet | niedrig | Bewusst. Begründung in 3.4. Lieber eine Rückfrage zu viel beim Überschreiben von Stammdaten als eine zu wenig |
| R8 | **Der Rate-Limiter ist prozesslokal.** Zwei Clients auf demselben Mandanten teilen ihn nicht, können das Limit also gemeinsam reißen | niedrig | In der README benannt. Sicherheitsabstand 60 statt 100 |
| R9 | **Die SDK-Linie v2 ist jung** (2.0.0 vom 2026-07-27, ohne Patch-Release), und die Kompatibilität der realen Clients mit v2-Servern ist **nicht geprüft** | mittel | AP1 baut den Integrationstest zuerst. Scheitert v2 gegen einen realen Client, ist der Wechsel auf `@modelcontextprotocol/sdk@1.30.0` nach `toolchain.md` 13.1 ein Zweizeiler in `package.json` plus `.js`-Endungen an den Importen. Die Entscheidung wird in AP1 getroffen und dokumentiert |
| R10 | **Prompt-Injection über API-Freitextfelder.** `counterparty`, `purpose`, `comment` und Belegdateinamen stammen von Dritten und landen im Modellkontext | mittel | Neutralisierte Ausgabe in Tabellenzellen, nie als Anweisung formatiert; `MCP-SPEC-TOOLS` verlangt das Bereinigen von Ausgaben. Vollständig verhindern lässt es sich nicht |

### 12.2 Offene Punkte, die AP0 oder die Implementierung klären muss

| Punkt | Stand | Klärung |
| --- | --- | --- |
| Ist `id_by_customer` ein Pfadsegment? | **nicht verifiziert**, aber durch die fehlenden Parameter stark gestützt | AP0, Aufrufe 1 und 2 |
| Maximum von `limit` bei Debitoren, Kreditoren, Sachkonten | **nicht verifiziert** | AP0, Aufruf 3; bis dahin kein `maximum` im Schema, Warnung im Text |
| Akzeptiert `/postings/get` `order` nur in der genannten Schreibweise? | in der Spezifikation als case sensitive ausgewiesen, **nicht live geprüft** | AP0, Aufruf 4 |
| Dedupliziert die API Schreibvorgänge? | **nicht verifiziert** | Beim Anbieter erfragen. Bis dahin: kein automatischer Retry, Duplikatshinweis |
| Verhalten beim Reißen des Minutenlimits (Status, `error_code`) | **nicht verifiziert**, bewusst nicht getestet | Defensiv auf 403/15, 429 und 5xx vorbereitet sein |
| Erhält ein ersetzter Bericht eine neue `id_by_customer`? | **nicht verifiziert** | Betrifft `idempotentHint` und den Anschlusshinweis von `bb_reports_create_*` |
| Lässt sich `/postings/assign/receipt-to-free-posting` rückgängig machen, und was tut ein Wiederholungsaufruf? | **nicht verifiziert**; belegt ist nur, dass es unter `/postings/` keinen `unassign`-Pfad gibt | Beim Anbieter erfragen. Bis dahin `idempotentHint: false` und der Satz zur fehlenden Umkehrbarkeit |
| Ist `/receipts/upload` wirklich auf EUR beschränkt? | **nicht verifiziert**, Widerspruch innerhalb der Spezifikation | Schema mit voller Währungsliste, Widerspruch in der Parameterbeschreibung benannt |
| Maximale Dateigröße bei `/receipts/upload` | **nicht verifiziert** | Vorläufige Obergrenze 10 MB im Schema, als eigene Annahme gekennzeichnet |
| Maximale Elementzahl der Batch-Endpunkte unter `/postings/` und `/settings/` | **nicht verifiziert**; für `receipts`, `transactions` und `transactions_to_receipts` nennt die Spezifikation 50 | `BB_MCP_MAX_BATCH` mit Vorgabe 50 für alle acht |
| Zeitzone der Datumsfelder | in keiner Quelle dokumentiert | Werte unverändert durchreichen, Unsicherheit in den `instructions` benennen |
| Zeichen-je-Token-Verhältnis 3,7 | **Annahme** | AP11 misst mit einem echten Tokenizer und ersetzt alle Zahlen aus 4.6 |
| Freigabe für `BB_MCP_TOOLSETS` | **nicht entschieden**, geht über E1 und E2 hinaus | Dem Projektinhaber vorlegen; ohne Freigabe entfällt die Variable ersatzlos |
| Feld `title` der Werkzeugdefinition | in `tool-design.md` 12 als offen geführt | **Hier entschieden: wird gesetzt**, deutscher Anzeigename, rund 30 Zeichen. Kosten rund 440 Token gesamt. Nutzen: Unter E2 ist der Freigabedialog des Clients die einzige menschliche Kontrolle, und ein deutscher Name hilft dem deutschsprachigen Nutzer, ihn richtig zu beantworten |

### 12.3 Was dieser Entwurf bewusst nicht löst

- **Er verhindert kein blindes Schreiben.** Ein Host, der Werkzeuge ohne Rückfrage ausführt,
  oder ein Nutzer mit pauschaler Dauerfreigabe kann mit diesem Server ohne weitere Hürde
  löschen, stornieren und buchen. Das ist die bewusste Folge von E2, und
  `tool-design.md` 9.4 benennt sie bereits. Dieser Entwurf legt alles daran, dass der Agent
  es wenigstens **weiß** (3.7), aber Annotationen sind nach dem MCP-Schema ausdrücklich
  Hinweise und keine Durchsetzung.
- **Er bringt die Definitionsgröße nicht unter 10.000 Token.** Siehe R1.
- **Er baut keine Auto-Paginierung.** Siehe 7.4.
- **Er baut keinen Schlüsselbund-Zugriff.** Nach `distribution.md` 13.2 später, hinter einem
  Schalter.
- **Er behandelt die Felder der MCP-Revision 2026-07-28 nicht.** Zielrevision ist 2025-11-25,
  weil das die Revision ist, die beide SDK-Linien am 2026-09-12 zur Laufzeit aushandeln.

---

## Anhang A: Live-Befunde vom 2026-09-12

Sechs lesende Aufrufe gegen die Produktivumgebung, ausschließlich gegen Pfade der
freigegebenen Liste. Kein schreibender Aufruf. Es werden hier nur Struktur- und
Schemabefunde wiedergegeben, keine Geschäftsdaten.

| # | Befund | Aufruf | Folge für den Plan |
| --- | --- | --- | --- |
| L1 | `/accounts/get` liefert je Zahlungskonto genau zwei Felder: `name` und **`postingaccount_number`**, beide als String | `{"api_key":"..."}` | Ein Zahlungskonto wird über eine Sachkontonummer adressiert. Begründet 3.5 und die Umbenennung `account` → `payment_account_number` |
| L2 | `/settings/get/postingaccounts` liefert je Eintrag `postingaccount_number`, `name`, `type`, `subtype`, `parent_postingaccount_number`, `parent_name`. Beobachtete `type`-Werte: `postingaccount`, `account`, `creditor`, `creditor collective`, `debtor`, `debtor collective`. Beobachtete `subtype`-Werte bei `account`: `bank/institution`, `cash`, `other`; bei `postingaccount`: `default` | `limit` 5 und 1000, danach `offset` 1000 | Bestätigt, dass die Liste eine Vereinigungsliste ist. `type` und `subtype` gehören in die `concise`-Projektion |
| L3 | Der Testmandant hat **1281** Einträge in dieser Liste: 1000 auf der ersten Seite, 281 mit `offset=1000`. Der Serverstandard ist 1000 | zwei Aufrufe | Ein Werkzeug ohne `limit` und `offset` wäre ab 1000 Konten unbrauchbar. Belegt die Schwere eines fehlenden Paginierungsparameters und begründet die Bestandszeile in 7.4 |
| L4 | `/postings/get` liefert **38 Felder je Buchung**, darunter zwölf `receipts_assigned_*`-Felder und drei Paare aus Singular- und Pluralform (`receipt_id_by_customer` neben `receipts_id_by_customer`, `transaction_purpose` neben `transactions_purpose`) | enger Zeitraum, `limit` 3 | Begründet `concise` als Standard und die Projektion in 7.2. Die Doppelfelder gehören in `detailed`, nicht in `concise` |
| L5 | Ein **unbekanntes Feld im Body wird ignoriert**: `/accounts/get` mit einem frei erfundenen Zusatzfeld antwortete mit HTTP 200 und `success: true` | ein Aufruf | Die API fängt Tippfehler in Feldnamen **nicht** ab. Deshalb validiert unser Schema mit `additionalProperties: false` streng, sonst wäre ein Tippfehler ein stiller Datenfehler |
| L6 | Vier Endpunkte führen in der Spezifikation keinen Parameter für ihre Kennung (Auszählung, kein Live-Aufruf) | – | Begründet 3.8 und AP0 |

Zwei Dinge, die aus diesen Aufrufen **nicht** folgen und deshalb nicht behauptet werden: Ob
`/accounts/get` ein `limit` auswertet, ist offen (der Mandant hat weniger Konten als das
gesetzte Limit). Ob der Erfolgsumschlag ein Feld `error_code` enthält, ist offen; die
Auswertung wurde mit einem Werkzeug gemacht, das fehlende Schlüssel als `null` anzeigt.
Daraus folgt die Implementierungsregel, auf `success === false` zu prüfen und nie auf das
Vorhandensein von `error_code`.

---

## Anhang B: Feldumbenennungen

Vollständige Liste. Jede Umbenennung nennt den Originalnamen in der Parameterbeschreibung,
und der Request-Mapper übersetzt zurück. Mehr Umbenennungen als diese gibt es nicht; alle
übrigen 300 Felder tragen den Namen der Spezifikation.

| Werkzeugfeld | API-Feld | Endpunkte | Grund |
| --- | --- | --- | --- |
| `payment_account_number` | `account` | `/receipts/add`, `/receipts/upload`, `/transactions/add`, `/transactions/get` | `account` erwartet eine Sachkontonummer, meint aber ein Zahlungskonto. Der Name sagt beides nicht (`tool-design.md` 6.5 Technik 1 und 3) |
| `account_filter` | `account` | `/postings/get` | Dort ist es kein Konto, sondern eine kommagetrennte Filterliste mit Schlüsselwörtern (`all`, `all financial accounts`, `free booking`) |
| `postingaccount_filter` | `postingaccount` | `/postings/get` | Analog, ebenfalls eine Filterliste mit Schlüsselwörtern |
| `receipt_type` | `type` | `/receipts/add`, `/receipts/upload` | `type` ist in der Spezifikation siebenfach mit unterschiedlicher Bedeutung belegt |
| `invoice_type` | `type` | `/invoices/create`, `/invoices/create/e-invoice`, `/invoices/create/draft` | dito |
| `transaction_type` | `type` | `/transactions/add` | dito |
| `payment_account_type` | `type` | `/accounts/add` | dito; Werte `cash`, `bank/institution`, `other` |
| `positions` | `postingaccounts`, `postingtexts`, `vats`, `amounts`, `cost_locations`, `cost_locations_two`, `oi_receipts_ids_by_customer` | `/postings/add/receipt`, `/postings/add/transaction` und die drei Batch-Varianten | Objektorientierte Positionsliste statt paralleler Arrays, Längeninvariante konstruktiv erfüllt (4.4) |
| `items` | `item_name`, `item_amount`, `item_unit`, `item_vat` bzw. `item_tax_type` und `item_tax_amount`, `item_single_price`, `item_description` | die drei Rechnungsendpunkte | dito, für Rechnungspositionen |
| `receipt_id_by_customer` (Pfadsegment) | – | `/receipts/get/...`, `/receipts/delete/...`, `/receipts/restore/...` | Der Identifikator fehlt in der Spezifikation ganz (3.8) |
| `transaction_id_by_customer` (Pfadsegment) | – | `/transactions/get/...` | dito |

`response_format` ist kein umbenanntes Feld, sondern ein rein serverseitiges Feld, das nie
gesendet wird. Es ist in 7.2 beschrieben und in jeder betroffenen Werkzeugbeschreibung als
solches gekennzeichnet.
