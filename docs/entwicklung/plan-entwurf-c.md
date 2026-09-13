# Implementierungsplan C: Betrieb, Verbreitung, Wartbarkeit

**Stand:** 2026-09-12. Verfasser: Architekturentwurf C. Dieser Plan ist einer von drei parallelen
Entwürfen aus unterschiedlichen Blickwinkeln. Sein Blickwinkel ist ausdrücklich **Betrieb,
Verbreitung und Wartbarkeit**: Ein Mensch ohne Vorkenntnisse soll den Server in fünf Minuten
laufen haben, und das Projekt soll in zwei Jahren noch wartbar sein.

**Vorrang.** Die sechs Inhaberentscheidungen E1 bis E6 gelten uneingeschränkt und gehen jeder
anderslautenden Empfehlung der Dossiers vor. Wo dieser Plan von einem Dossier abweicht, steht die
Begründung an der Stelle.

**Kennzeichnung.** Aussagen ohne Quellenangabe sind Entwurfsentscheidungen dieses Plans. Aussagen
aus den Dossiers tragen die Fundstelle. Nicht belegte Aussagen sind als **nicht verifiziert** oder
**Annahme** markiert.

**Eigene Live-Messungen dieses Plans** (2026-09-12, fünf lesende Aufrufe gegen die Produktivumgebung,
ausschließlich aus der erlaubten Pfadliste):

| Befund | Bedeutung für den Plan |
| --- | --- |
| `/accounts/get` liefert je Zeile **nur** `name` und `postingaccount_number` | Es gibt **keinen** Mandanten-Anzeigenamen in der Antwort. Der in `distribution.md` 14.2 Schritt 3 vorgesehene Satz "Verbunden mit: …" ist so nicht baubar. Ersatz in Abschnitt 8.3. |
| `/receipts/get` liefert `id_by_customer` als **String** (`"2"`), nicht als Zahl | Bestätigt die Typ-Asymmetrie. Betrifft jede Weiterverwendung einer Kennung aus einer Antwort. |
| `/receipts/get` liefert 16 Felder, darunter `delivery_date`, `amount_paid`, `amount_paid_fixed`, `link_to_receipt_id_by_customer` | Bestätigt die Abweichung Spezifikation gegen Wirklichkeit. Begründet die Regel "Antwortschemata nie schließen" in Abschnitt 7.4. |
| `/receipts/get/id_by_customer` mit `{"id_by_customer": ["2"]}` → HTTP 400, `error_code` 5 | Array-Hypothese mit String-Element **widerlegt**. |
| `/receipts/get/id_by_customer` mit `{"id_by_customer": [2]}` → HTTP 400, `error_code` 5 | Array-Hypothese mit Zahl-Element **widerlegt**. Damit sind sechs Aufrufvarianten gescheitert (vier aus `docs/api/belege.md` 4.5, zwei hier). Der Endpunkt bleibt über den Body unbenutzbar. Ungetestet bleibt allein die Variante, den Wert als **Pfadsegment** zu senden. |
| `/settings/get/postingaccounts` liefert `parent_name` als `null` | Antwortfelder können `null` sein, wo die Spezifikation einen String führt. Die Normalisierung muss `null` tragen. |

---

## 1. Leitidee und Architektur

### 1.1 Die Leitidee in drei Sätzen

**Eine einzige maschinenlesbare Tabelle, das Endpunktregister, ist die Quelle für alles andere.**
Werkzeugname, Annotationen, Eingabeschema, Parameterübersetzung, Fehlerabbildung, Nur-Lesen-Schalter,
Rate-Limit-Eimer, Antwortform, das `.mcpb`-Manifest, die README-Tabelle und sämtliche Tests lesen aus
diesem Register statt aus verstreutem Code. Ein neuer Endpunkt der BuchhaltungsButler-API ist damit
**eine neue Datei plus eine Zeile im Index**, und der Rest des Servers bleibt unberührt.

Der zweite Gedanke ist die **Trennung zwischen Generat und Handarbeit**: Der Generator liest die
OpenAPI-Datei und erzeugt nur Daten, die er belegen kann (Parameternamen, Typen, Pflichtfelder,
Fehlercodes, HTTP-Status). Alles, was Urteilsvermögen braucht (Enums, Beschreibungen, deutsche
Fachbegriffe, Umbenennungen, Klassifikation), steht handgeschrieben daneben und wird gegen das
Generat auf Vollständigkeit geprüft. Kein Parameter kann still verschwinden.

Der dritte Gedanke ist **Ehrlichkeit nach außen**: Der Server behauptet nie mehr, als er weiß. Er
sagt, dass er nicht weiß, wie viele Treffer es insgesamt gibt. Er sagt, dass ein schreibender
Aufruf nach einem Timeout durchgelaufen sein kann. Er sagt, welche Umgebungsvariable eine Absage
verursacht hat.

### 1.2 Die Schichten

```
┌──────────────────────────────────────────────────────────────────────────┐
│  MCP-Client (Claude Code, Claude Desktop, Codex CLI, …)                   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ stdio, JSON-RPC
┌───────────────────────────────▼──────────────────────────────────────────┐
│  S0  Einstieg   src/cli.ts                                               │
│      Ohne Unterbefehl: Server. Mit Unterbefehl: CLI (dynamisch geladen). │
├──────────────────────────────────────────────────────────────────────────┤
│  S1  Serverschicht   src/server/                                         │
│      McpServer, instructions, Registrierung aller 54 Werkzeuge aus S2.   │
│      Kennt keinen einzigen Endpunkt namentlich.                          │
├──────────────────────────────────────────────────────────────────────────┤
│  S2  Endpunktregister   src/registry/                                    │
│      54 Dateien, je eine je Werkzeug. Name, Pfad, Klasse, Annotationen,  │
│      Titel, Beschreibung, Parameterüberlagerung, Antwortform,            │
│      Prüfwerkzeug für den Zweifelsfall, Cache- und Eimerzuordnung.       │
├──────────────────────────────────────────────────────────────────────────┤
│  S3  Schemaschicht   src/schema/                                         │
│      Baut aus Generat + Überlagerung ein JSON Schema und einen Validator.│
│      Ein Adapter macht daraus, was das gewählte SDK verlangt.            │
├──────────────────────────────────────────────────────────────────────────┤
│  S4  Torwächter   src/guards/                                            │
│      Nur-Lesen-Schalter, Stapelgrenze, Betragsgrenze, Duplikatshinweis.  │
│      Entscheidet vor jedem Netzzugriff, ob überhaupt gesendet wird.      │
├──────────────────────────────────────────────────────────────────────────┤
│  S5  Übersetzung   src/mapping/                                          │
│      Werkzeugeingabe → BB-Body (Umbenennung, order-Syntax, parallele     │
│      Arrays). BB-Antwort → normalisierte Daten (String→Zahl, "0"/"1"→    │
│      Boolean), ohne unbekannte Felder zu verlieren.                      │
├──────────────────────────────────────────────────────────────────────────┤
│  S6  HTTP   src/http/                                                    │
│      Token-Eimer, Timeout, Retry nur lesend, Content-Type-Prüfung,       │
│      Umschlag auspacken, Proxy-Dispatcher.                               │
├──────────────────────────────────────────────────────────────────────────┤
│  S7  Fehler   src/errors/                                                │
│      Nachschlagen nach (Pfad, error_code), Einordnung in fünf Klassen,   │
│      Formung als Lehrmeldung. Der Katalog wird erst im Fehlerfall geladen.│
├──────────────────────────────────────────────────────────────────────────┤
│  S8  Antwortaufbereitung   src/response/                                 │
│      structuredContent, Markdown-Tabelle, Kürzung, Seitenhinweis.        │
├──────────────────────────────────────────────────────────────────────────┤
│  Quer: src/config/ (Auflösung und Schwärzung), src/logging/ (nur stderr) │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Ein Werkzeugaufruf von vorn nach hinten

Beispiel `bb_receipts_search` mit `{ "list_direction": "inbound", "limit": 100 }`.

1. **S1** nimmt `tools/call` entgegen, findet den Registereintrag über den Namen, ruft den
   **generischen Handler** auf. Es gibt genau einen Handler für alle 54 Werkzeuge; der Unterschied
   steckt im Registereintrag, nicht in 54 Funktionen.
2. **S1** ruft `signal.throwIfAborted()` und reicht das `AbortSignal` durch bis S6.
3. **S3** validiert die Eingabe gegen das Schema des Eintrags. Bei einem Verstoß entsteht sofort
   eine Lehrmeldung (Abschnitt 5.6), es geht kein Request ab. Die Meldung endet auf
   "Nothing was fetched."
4. **S4** prüft die Torwächter in dieser Reihenfolge: Nur-Lesen-Schalter (nur bei Klasse ungleich R),
   `maxItems` der Stapelfelder, Betragsgrenze. Jede Absage nennt die verantwortliche
   Umgebungsvariable und ihren Zielwert.
5. **S4** führt bei den Klassen A und B den Duplikatshinweis aus, sofern das Register für diesen
   Eintrag ein Suchwerkzeug nennt und der Hinweis aktiviert ist. Ein Treffer blockiert nicht,
   er wird gemerkt und in Schritt 10 angehängt.
6. **S5** baut den Body: `api_key` aus der Konfiguration, danach die übersetzten Parameter. Die
   Übersetzungsregeln stehen im Registereintrag, nicht im Code.
7. **S6** holt sich ein Token aus dem Gesamteimer und, falls der Eintrag einen nennt, aus dem
   Zusatzeimer (Upload, Stapel). Dann `fetch` mit `AbortSignal.timeout`, Basic-Auth-Header und
   `Content-Type: application/json`.
8. **S6** prüft zuerst den Content-Type der Antwort, dann den Status, dann den Umschlag. Ist die
   Antwort kein JSON, entsteht sofort ein Diagnosefehler mit den ersten 200 Zeichen des Körpers,
   von Markup befreit.
9. **S7** wird nur betreten, wenn `success: false` oder der Status ungleich 200 ist. Der Katalog
   wird dynamisch nachgeladen, nach `(Pfad, error_code)` nachgeschlagen, in eine der fünf Klassen
   eingeordnet und als Lehrmeldung geformt. Bei einer Klasse "transient" und einem **lesenden**
   Eintrag geht es zurück zu Schritt 7; bei einem schreibenden Eintrag niemals.
10. **S5** normalisiert die Nutzdaten, **S8** formt daraus `structuredContent`, eine Markdown-Tabelle,
    den Seitenhinweis und gegebenenfalls den Duplikatshinweis aus Schritt 5.
11. **S1** gibt `{ content, structuredContent }` zurück. Fehler gehen als
    `{ content, isError: true }` ohne `structuredContent` zurück, nie als JSON-RPC-Protokollfehler.

Zwei Eigenschaften dieses Ablaufs sind Absicht:

- **Es gibt keinen werkzeugspezifischen Code im Ausführungspfad.** Wer einen Endpunkt nachrüstet,
  schreibt eine Registerdatei und verändert sonst nichts. Das ist die Antwort auf die Frage nach
  der Wartbarkeit in zwei Jahren.
- **Jede Absage kommt vor dem Netzzugriff und sagt das auch.** Der Agent erfährt aus dem Text, ob
  die Buchhaltung berührt wurde. In einer Buchhaltung ist das der wichtigste Satz einer Fehlermeldung.

---

## 2. Vollständiger Dateibaum

Eine Zeile Zweck je Datei. Verzeichnisse ohne eigene Zeile sind reine Behälter.

```
buchhaltungsbutler-mcp/
├── .github/
│   ├── dependabot.yml                 Wöchentliche Aktualisierung für npm und GitHub Actions
│   └── workflows/
│       ├── ci.yml                     Typecheck, Lint, Format, Tests, Build, Paketprobe auf Node 22 und 24
│       ├── publish.yml                Veröffentlichung bei Tag v*.*.*, OIDC Trusted Publishing, .mcpb als Release-Anhang
│       └── drift.yml                  Wöchentlich: Generat gegen eingecheckten Stand, Paketgrößenbudget
├── .mcpb/
│   └── manifest.template.json         Vorlage des Bundle-Manifests; Werkzeugliste wird eingesetzt, nicht gepflegt
├── docs/                              Die 14 Dossiers der Recherchephase, unverändert
├── scripts/
│   ├── generate.ts                    Ruft alle Generatoren, schreibt src/generated, meldet Abweichungen
│   ├── gen-endpoints.ts               OpenAPI → src/generated/endpoints.ts (Parameter, Typen, Pflichtfelder)
│   ├── gen-errors.ts                  OpenAPI → src/generated/errors.ts (718 Einträge nach (Pfad, Code))
│   ├── gen-version.ts                 package.json → src/generated/version.ts, damit kein JSON zur Laufzeit gelesen wird
│   ├── build-mcpb.ts                  Baut das .mcpb aus Manifestvorlage plus Registerauszug, ruft mcpb aus node_modules
│   ├── check-size.ts                  Bricht ab, wenn das gepackte Tarball das Budget reisst
│   └── contract-read.ts               Optionaler Vertragslauf gegen die echte API, hart auf die 15 lesenden Pfade begrenzt
├── src/
│   ├── cli.ts                         bin-Einstieg mit Shebang; ohne Unterbefehl Server, sonst dynamischer Import der CLI
│   ├── index.ts                       Programmatischer Export (createServer, Register, Typen)
│   ├── server/
│   │   ├── create-server.ts           Erzeugt den McpServer, hängt Signal- und Fehlerbehandlung ein
│   │   ├── register-tools.ts          Registriert alle 54 Einträge; enthält den einen generischen Handler
│   │   ├── instructions.ts            Servertext: Zweck, Mandant, Zustand des Nur-Lesen-Schalters, Berichtsvorbehalt
│   │   └── shutdown.ts                Idempotentes Herunterfahren bei SIGINT, SIGTERM, stdin-Ende
│   ├── registry/
│   │   ├── types.ts                   Der Typ eines Registereintrags; die zentrale Datenstruktur des Projekts
│   │   ├── index.ts                   Generierter Index über die 54 Einträge plus Nachschlagen nach Name und Pfad
│   │   ├── classes.ts                 Die sechs Klassen R, A, AR, M, D, B und ihre Annotationswerte
│   │   └── tools/                     54 Dateien, Dateiname gleich Werkzeugname, je ein Registereintrag
│   │       ├── bb_accounts_create.ts  … und 53 weitere, siehe Tabelle in Abschnitt 3
│   │       └── …
│   ├── schema/
│   │   ├── types.ts                   Interner Schematyp (bewusst kleiner als JSON Schema)
│   │   ├── build.ts                   Generat plus Überlagerung zu einem Schema; erzwingt Vollständigkeit
│   │   ├── json-schema.ts             Interner Schematyp → JSON Schema Draft 2020-12
│   │   ├── validate.ts                Validator; liefert Pfad, erwarteten Wert, gefundenen Wert
│   │   ├── standard-schema.ts         Adapter auf Standard Schema für die SDK-Linie v2
│   │   └── zod-adapter.ts             Adapter auf Zod-Rohform für die SDK-Linie v1; nur einer von beiden wird gebündelt
│   ├── guards/
│   │   ├── read-only.ts               Nur-Lesen-Schalter, liest die Klasse aus dem Register
│   │   ├── limits.ts                  Stapelgrenze und Betragsgrenze
│   │   └── duplicate-check.ts         Nachschlagen vor dem Anlegen; blockiert nie, meldet nur
│   ├── mapping/
│   │   ├── request.ts                 Werkzeugeingabe → BB-Body nach den Regeln des Eintrags
│   │   ├── response.ts                BB-Daten normalisieren, unbekannte Felder erhalten
│   │   ├── coerce.ts                  String→Zahl, "0"/"1"→Boolean, null tragen, Betragsformat
│   │   ├── order.ts                   Die drei order-Syntaxen, je Endpunkt aus dem Eintrag gewählt
│   │   └── parallel-arrays.ts         Parallele Arrays aus einer Objektliste bauen und Längengleichheit erzwingen
│   ├── http/
│   │   ├── client.ts                  Der eine Aufruf: Header, Body, Timeout, Signal, Content-Type-Prüfung
│   │   ├── envelope.ts                Erfolgs- und Fehlerumschlag erkennen und auspacken
│   │   ├── retry.ts                   Wiederholung ausschliesslich für lesende Einträge, voller Jitter
│   │   ├── rate-limiter.ts            Token-Eimer je Schlüssel, serialisiert über eine Promise-Kette
│   │   └── dispatcher.ts              Globaler undici-Dispatcher: Keep-Alive und Proxy aus der Umgebung
│   ├── errors/
│   │   ├── catalog.ts                 Dünne Hülle um src/generated/errors.ts, dynamisch geladen
│   │   ├── classify.ts                (Pfad, Code) → eine der fünf Klassen aus fehlercodes.md Abschnitt D
│   │   ├── format.ts                  Die vier Blöcke einer Lehrmeldung
│   │   └── types.ts                   Fehlertypen des Servers, alle mit Feld "changed: ja|nein|unbekannt"
│   ├── response/
│   │   ├── format.ts                  Baut content und structuredContent aus normalisierten Daten
│   │   ├── table.ts                   Markdown-Tabelle mit Spaltenauswahl je Detailgrad
│   │   ├── truncate.ts                Zeichenbudget, Kürzungshinweis mit Zahl der unterdrückten Zeilen
│   │   └── pagination.ts              Seitenhinweis mit dem konkreten nächsten Aufruf
│   ├── cache/
│   │   └── store.ts                   Optionaler Stammdatenspeicher mit Invalidierungstabelle, Vorgabe aus
│   ├── upload/
│   │   ├── source.ts                  Herkunft einer Datei: base64, file://, https://
│   │   ├── ssrf.ts                    Prüfung je Weiterleitungssprung, private Netze, Bytezählung
│   │   └── sniff.ts                   Typerkennung über Magic Bytes, Dateinamen bereinigen
│   ├── config/
│   │   ├── env.ts                     Alle Umgebungsvariablen mit Typ, Vorgabe und Prüfregel
│   │   ├── credentials-file.ts        Lesen und Schreiben der Profildatei, Rechteprüfung
│   │   ├── resolve.ts                 Auflösungsreihenfolge, Startprüfung, Abbruchmeldungen
│   │   └── redact.ts                  Schwärzung; jede Ausgabe läuft durch diese Funktion
│   ├── logging/
│   │   └── stderr.ts                  Der einzige erlaubte Ausgabeweg neben dem Protokoll
│   ├── cli/
│   │   ├── run.ts                     Unterbefehlsweiche, Hilfe, Version
│   │   ├── setup.ts                   Einrichtungsassistent, acht Schritte
│   │   ├── doctor.ts                  Diagnose ohne Geheimnisse, für Fehlerberichte
│   │   ├── test.ts                    Nur der Verbindungstest, Rückgabewert für CI
│   │   ├── profiles.ts                Mandantenprofile auflisten, hinzufügen, entfernen
│   │   ├── print-config.ts            Fertigen Konfigurationsblock ausgeben, nichts schreiben
│   │   ├── uninstall.ts               Eigenen Eintrag beim genannten Client entfernen
│   │   ├── prompt.ts                  Eingabe ohne Abhängigkeit: maskierte Eingabe, Auswahl, Ja/Nein
│   │   └── clients/
│   │       ├── types.ts               Was ein Clientadapter können muss
│   │       ├── claude-code.ts         Über claude mcp add-json als Unterprozess
│   │       ├── claude-desktop.ts      claude_desktop_config.json lesen, ergänzen, zurückschreiben
│   │       ├── codex.ts               Über codex mcp add als Unterprozess
│   │       ├── grok.ts                Über grok mcp add als Unterprozess
│   │       ├── vscode.ts              code --add-mcp oder .vscode/mcp.json mit inputs
│   │       ├── cursor.ts              ~/.cursor/mcp.json
│   │       ├── windsurf.ts            ~/.codeium/windsurf/mcp_config.json
│   │       ├── lmstudio.ts            ~/.lmstudio/mcp.json, mit Vorbehalt
│   │       ├── cline.ts               ~/.cline/mcp.json
│   │       └── print-only.ts          Zed, Continue, Jan und alles Übrige: nur ausgeben
│   └── generated/
│       ├── endpoints.ts               Erzeugt aus der OpenAPI-Datei, eingecheckt, nie von Hand geändert
│       ├── errors.ts                  Erzeugt, eingecheckt, nur im Fehlerfall geladen
│       └── version.ts                 Erzeugt aus package.json
├── test/
│   ├── unit/                          Je Modul eine Datei, ohne Netz
│   ├── registry/                      Die neun Registerprüfungen aus Abschnitt 9.2
│   ├── golden/                        Aufgezeichnete Antworten aus docs/api, als Prüfvorlage
│   ├── integration/                    Server starten, initialize, tools/list, tools/call gegen MockAgent
│   └── helpers/                       MockAgent-Aufbau, Registerhilfen, Zod-Gegenprobe
├── .env.example                       Alle Umgebungsvariablen mit Vorgabe und Kommentar, ohne echte Werte
├── .gitignore
├── biome.json                         Formatierung
├── eslint.config.js                   Linting, Flat Config, no-console mit Ausnahme für error
├── tsconfig.json                      Produktionskonfiguration nach toolchain.md Abschnitt 14
├── tsconfig.test.json                 Gelockerte Konfiguration für Tests
├── tsdown.config.ts                   Bündelung nach dist/cli.js und dist/index.js, Shebang, Dateimodus
├── vitest.config.ts                   Testlauf und Abdeckung
├── package.json                       Genau ein bin-Eintrag: bbutler-mcp
├── CHANGELOG.md                       Keep a Changelog, von Hand gepflegt, Pflicht je Veröffentlichung
├── CONTRIBUTING.md                    Trennt Fehlermeldung von Sicherheitsmeldung, nennt den Registerweg
├── SECURITY.md                        Private Security Advisories, kein öffentliches Issue
├── LICENSE                            MIT
└── README.md                          Deutsch, Gliederung in Abschnitt 10
```

Zwei Entscheidungen zum Baum, beide gegen den ersten Reflex:

- **54 Dateien unter `src/registry/tools/`, nicht neun Sammeldateien je Ressource.** Eine Sammeldatei
  je Ressource wäre kürzer, aber die Postings-Datei hätte zwölf Einträge und rund 900 Zeilen. Eine
  Datei je Werkzeug hält jede Datei bei 60 bis 140 Zeilen, macht Änderungen im Versionsverlauf
  eindeutig zuordenbar und erlaubt die Prüfung "Dateiname gleich Werkzeugname" als Test. Für die
  Frage "wo ändere ich `bb_postings_cancel`" gibt es dann genau eine Antwort.
- **`src/generated/` wird eingecheckt.** Ein Generatorlauf beim Installieren wäre eleganter und würde
  die npx-Startzeit nicht berühren, aber er macht das Paket von einer Bauumgebung abhängig und den
  Bau unreproduzierbar. Eingechecktes Generat plus ein CI-Schritt, der `pnpm generate` läuft und auf
  eine leere Differenz prüft, liefert dasselbe Ergebnis ohne die Abhängigkeit.
---

## 3. Die 54 Werkzeuge

### 3.1 Namensschema und die Abweichungen

Grundlage ist `docs/entwicklung/tool-design.md` Abschnitte 4.1 bis 4.4:
`bb_<ressource>_<verb>[_<qualifizierer>]`, snake_case, Präfix `bb_`, Ressource im Plural vor dem
Verb, jeder Name erfüllt `^[a-z][a-z0-9_]{2,39}$`, Verb aus einer geschlossenen Liste.

Das Schema bleibt unverändert. E1 zwingt aber zu vier Erweiterungen, weil `tool-design.md` es für
34 Werkzeuge entworfen hat und jetzt 54 eindeutige Namen entstehen müssen. Jede Erweiterung wird
hier begründet:

**Abweichung 1: ein neues Verb, `unassign`.** Die geschlossene Liste aus 4.4 kennt `assign`, aber
kein Gegenstück. Solange `/transactions/assign/receipt` und `/transactions/unassign/receipt` in
einem Werkzeug `bb_links_create` beziehungsweise `bb_links_delete` zusammenfielen, brauchte es
keines. Bei einem Werkzeug je Endpunkt braucht es eines. `delete` wäre falsch, weil kein Objekt
entfernt wird, sondern eine Verknüpfung. `unassign` ist das Wort, das die API selbst im Pfad
verwendet. Die Liste wird also um genau einen Eintrag erweitert: `unassign`, Bedeutung "hebt eine
bestehende Zuordnung zwischen zwei Objekten auf", Art zerstörend.

**Abweichung 2: `settings` ist keine Ressource.** Elf Endpunkte liegen unter `/settings/`, betreffen
aber drei fachlich unabhängige Objekte: Debitoren, Kreditoren, Sachkonten. Der Pfadpräfix ist eine
Routingentscheidung von BuchhaltungsButler, kein Domänenobjekt. Elf Werkzeuge mit dem Präfix
`bb_settings_` würden die Gruppierung nach Ressource, die 4.3 ausdrücklich begründet, zerstören:
Eine Suche nach "Kreditor" träfe nichts. Die Ressourcen heissen deshalb `debtors`, `creditors` und
`postingaccounts`. `tool-design.md` 3.5 weicht an dieser Stelle bereits selbst vom Pfad ab
(`bb_contacts_*`, `bb_postingaccounts_*`), die Abweichung ist also keine neue.

**Abweichung 3: Debitoren und Kreditoren werden getrennt, nicht als `contacts` zusammengefasst.**
`tool-design.md` 3.5 schlägt `bb_contacts_search` über beide Endpunkte vor. Unter E1 ist das nicht
zulässig, weil es zwei Endpunkte wären. Getrennte Ressourcen sind hier ohnehin die bessere Wahl:
"Debitor" und "Kreditor" sind die Wörter, die ein deutscher Buchhalter benutzt, und ein Werkzeug
mit einem `entity`-Parameter, der zwischen beiden schaltet, wäre genau die verborgene Logik, die
E1 ausschliesst.

**Abweichung 4: der Qualifizierer hinter `create` benennt den Anker, nicht das erzeugte Objekt.**
Bei den sechs Buchungsendpunkten heisst es `bb_postings_create_receipt` und nicht
`bb_postings_create_for_receipt`. Grund ist die Längengrenze von 40 Zeichen aus 4.3:
`bb_postings_create_for_transactions_batch` hätte 41 Zeichen. Die Kurzform braucht dafür eine
feste Lesart, und die wird hier gesetzt: **Der Qualifizierer nach einem Verb benennt immer das
Objekt, an dem die Operation hängt, nie das Objekt, das sie erzeugt.** Dieselbe Lesart trägt
`bb_postings_unconfirm_receipt` und `bb_transactions_assign_receipt`. Die Beschreibung jedes
betroffenen Werkzeugs nennt den Sachverhalt im ersten Satz, damit die Lesart nicht geraten werden
muss.

**Zusätzliche Festlegung, kein Verstoss gegen 4.3: `_batch` als Suffix.** Stapelendpunkte tragen den
Anker im Singular und `_batch` am Ende: `bb_receipts_create_batch`,
`bb_postings_create_transaction_batch`. Damit sortiert der Stapel unmittelbar neben dem Einzelfall,
und die Endung ist über alle sieben Stapelendpunkte gleich. Die Klasse wird niemals aus dieser
Endung abgeleitet, sondern aus der Tabelle in 3.3, wie es 9.3 verlangt.

**Ebenfalls festgelegt: `title` wird gesetzt, auf Deutsch.** `tool-design.md` 12 führt das Feld als
unentschieden. Entscheidung dieses Plans: Jedes Werkzeug bekommt ein `title` mit zwei bis vier
deutschen Wörtern, etwa "Belege suchen" oder "Buchungen stornieren". Begründung aus dem Blickwinkel
Verbreitung: Das ist der Text, den ein Nichtprogrammierer im Freigabedialog von Claude Desktop
liest, bevor er auf "Erlauben" klickt. Die Kosten liegen bei rund vier Token je Werkzeug. Wenn ein
Client `title` nicht auswertet, entsteht kein Schaden. Der maschinenlesbare `name` bleibt englisch
nach Schema, wie E4 es verlangt.

### 3.2 Vollständige Tabelle aller 54 Werkzeuge

Die Zeilen stehen in der Reihenfolge von
`jq -r '.paths|keys[]' docs/openapi/buchhaltungsbutler-v1.json`, damit ein Prüfer Zeile für Zeile
gegenlesen kann. Spalte "Wirkung" nach `docs/api/grundlagen.md` 7.3, Spalte "Kl." ist die Klasse
nach 3.3. `openWorldHint` ist bei allen 54 Werkzeugen `true` und deshalb nicht als Spalte geführt.

| # | Werkzeugname | API-Pfad | Wirkung | Kl. | readOnly | destructive | idempotent | Kurzbeschreibung |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bb_accounts_create` | `/accounts/add` | anlegend | A | false | false | false | Legt ein Zahlungskonto an; die Schalter für Revisionssicherheit und automatische Transaktionserzeugung wirken dauerhaft. |
| 2 | `bb_accounts_list` | `/accounts/get` | lesend | R | true | false | true | Listet alle Zahlungskonten des Mandanten mit Name und Sachkontonummer; kennt keine Filter und kein `limit`. |
| 3 | `bb_comments_create` | `/comments/add` | anlegend | A | false | false | false | Hängt einen Kommentar an einen Beleg oder eine Transaktion; über die API nicht wieder entfernbar. |
| 4 | `bb_cost_locations_create` | `/cost-locations/add` | anlegend | A | false | false | false | Legt eine Kostenstelle an, die danach in der Kostenstellenauswertung erscheint. |
| 5 | `bb_cost_locations_delete` | `/cost-locations/delete` | löschend | D | false | true | false | Entfernt eine Kostenstelle; was mit Buchungen geschieht, die darauf verweisen, ist nicht dokumentiert. |
| 6 | `bb_cost_locations_search` | `/cost-locations/get` | lesend | R | true | false | true | Sucht Kostenstellen; die API liefert höchstens 1000 Zeilen je Anfrage. |
| 7 | `bb_cost_locations_update` | `/cost-locations/update` | ändernd | M | false | false | true | Ändert Name oder Beschreibung einer bestehenden Kostenstelle; der vorherige Stand ist nicht abrufbar. |
| 8 | `bb_invoices_create` | `/invoices/create` | anlegend | B | false | false | false | Erzeugt eine endgültige, nummerierte Ausgangsrechnung; die API kennt weder Storno noch Löschen. |
| 9 | `bb_invoices_create_draft` | `/invoices/create/draft` | anlegend | A | false | false | false | Erzeugt einen Rechnungsentwurf statt einer endgültigen Rechnung; sichtbar in der Anwendung, aber nicht ausgestellt. |
| 10 | `bb_invoices_create_einvoice` | `/invoices/create/e-invoice` | anlegend | B | false | false | false | Erzeugt eine E-Rechnung mit strengeren Formatvorgaben; der Endpunkt mit der grössten Fehleroberfläche der API. |
| 11 | `bb_postings_create_free_batch` | `/postings/add-batch/free` | anlegend | B | false | false | false | Erzeugt mehrere freie Buchungen ohne Beleg- oder Zahlungsbezug in einem Aufruf. |
| 12 | `bb_postings_create_receipt_batch` | `/postings/add-batch/receipts` | anlegend | B | false | false | false | Bucht mehrere Belege in einem Aufruf auf Sachkonten. |
| 13 | `bb_postings_create_transaction_batch` | `/postings/add-batch/transactions` | anlegend | B | false | false | false | Bucht mehrere Transaktionen in einem Aufruf auf Sachkonten. |
| 14 | `bb_postings_create_free` | `/postings/add/free` | anlegend | B | false | false | false | Erzeugt eine freie Buchung ohne Beleg- oder Zahlungsbezug, also ohne natürliches Korrektiv. |
| 15 | `bb_postings_create_receipt` | `/postings/add/receipt` | anlegend | B | false | false | false | Bucht einen Beleg auf Sachkonten; die Buchungszeilen werden als parallele Arrays übergeben. |
| 16 | `bb_postings_create_transaction` | `/postings/add/transaction` | anlegend | B | false | false | false | Bucht eine Transaktion auf Sachkonten; die Buchungszeilen werden als parallele Arrays übergeben. |
| 17 | `bb_postings_assign_receipt` | `/postings/assign/receipt-to-free-posting` | ändernd | B | false | false | false | Bindet einen bestehenden Beleg an eine bestehende freie Buchung; die API kennt keinen Weg zurück. |
| 18 | `bb_postings_cancel` | `/postings/cancel` | löschend | D | false | true | false | Storniert Buchungen; festgeschriebene erzeugen eine dauerhaft sichtbare Stornobuchung. |
| 19 | `bb_postings_search` | `/postings/get` | lesend | R | true | false | true | Sucht Buchungssätze in einem Pflichtzeitraum; höchstens 1000 Buchungen je Anfrage. |
| 20 | `bb_postings_unconfirm_free` | `/postings/unconfirm/free` | löschend | D | false | true | false | Hebt eine freie Buchung auf und verändert damit den Buchungsstand unmittelbar. |
| 21 | `bb_postings_unconfirm_receipt` | `/postings/unconfirm/receipt` | löschend | D | false | true | false | Entfernt die Buchungen zu einem Beleg, soweit sie nicht festgeschrieben sind. |
| 22 | `bb_postings_unconfirm_transaction` | `/postings/unconfirm/transaction` | löschend | D | false | true | false | Entfernt die Buchungen zu einer Transaktion, soweit sie nicht festgeschrieben sind. |
| 23 | `bb_receipts_create` | `/receipts/add` | anlegend | A | false | false | false | Legt einen Beleg ohne Datei an; es gibt keinen Endpunkt, der einen Beleg endgültig entfernt. |
| 24 | `bb_receipts_create_batch` | `/receipts/addBatch` | anlegend | A | false | false | false | Legt bis zu 50 Belege in einem Aufruf an; die API erlaubt nur einen Aufruf alle fünf Sekunden. |
| 25 | `bb_receipts_list_assigned_transactions` | `/receipts/assigned-transactions/get` | lesend | R | true | false | true | Listet die Transaktionen, die einem bestimmten Beleg zugeordnet sind. |
| 26 | `bb_receipts_delete` | `/receipts/delete/id_by_customer` | löschend | D | false | true | false | Markiert einen Beleg als gelöscht; umkehrbar über `bb_receipts_restore`, kein endgültiges Entfernen. |
| 27 | `bb_receipts_search` | `/receipts/get` | lesend | R | true | false | true | Sucht Belege nach Richtung, Belegdatum, Gegenpartei und Zahlungsstatus; liefert keine Dateiinhalte. |
| 28 | `bb_receipts_get` | `/receipts/get/id_by_customer` | lesend | R | true | false | true | Holt einen Beleg samt Detail- und Fremdwährungsfeldern und optional der Datei; **am 2026-09-12 live in sechs Varianten unbenutzbar**. |
| 29 | `bb_receipts_restore` | `/receipts/restore/id_by_customer` | ändernd | A | false | false | false | Holt einen als gelöscht markierten Beleg zurück und macht ihn wieder buchungsrelevant. |
| 30 | `bb_receipts_upload` | `/receipts/upload` | anlegend | A | false | false | false | Lädt eine Belegdatei hoch, erzeugt den Beleg und stösst die Texterkennung an; eigenes Limit von 10 Aufrufen je Minute. |
| 31 | `bb_reports_create_bwa` | `/reports/create/bwa` | anlegend | AR | false | true | false | Stösst die Erzeugung der BWA an und **ersetzt dabei die zuvor erzeugte BWA**; läuft asynchron. |
| 32 | `bb_reports_create_sums` | `/reports/create/sums` | anlegend | AR | false | true | false | Stösst die Summen- und Saldenliste an und **ersetzt die zuvor erzeugte**; läuft asynchron. |
| 33 | `bb_reports_get_bwa` | `/reports/get/bwa` | lesend | R | true | false | true | Holt die zuvor erzeugte BWA ab; ohne vorherigen Erzeugungsaufruf antwortet die API mit "report was not found". |
| 34 | `bb_reports_get_sums` | `/reports/get/sums` | lesend | R | true | false | true | Holt die zuvor erzeugte Summen- und Saldenliste ab; dieselbe Vorbedingung wie bei der BWA. |
| 35 | `bb_reports_get_ledger` | `/reports/get/sums/ledger` | lesend | R | true | false | true | Liefert ein Kontenblatt unmittelbar, ohne vorherigen Erzeugungsaufruf und ohne bleibende Wirkung. |
| 36 | `bb_creditors_create_batch` | `/settings/add-batch/creditors` | anlegend | A | false | false | false | Legt mehrere Kreditoren („Lieferantenkonten") in einem Aufruf an. |
| 37 | `bb_debtors_create_batch` | `/settings/add-batch/debtors` | anlegend | A | false | false | false | Legt mehrere Debitoren („Kundenkonten") in einem Aufruf an. |
| 38 | `bb_creditors_create` | `/settings/add/creditor` | anlegend | A | false | false | false | Legt einen Kreditor an; die API kennt keinen Endpunkt zum Löschen. |
| 39 | `bb_debtors_create` | `/settings/add/debtor` | anlegend | A | false | false | false | Legt einen Debitor an; die API kennt keinen Endpunkt zum Löschen. |
| 40 | `bb_postingaccounts_create` | `/settings/add/postingaccount` | anlegend | A | false | false | false | Legt ein Sachkonto an und verändert damit den Kontenrahmen für alle künftigen Buchungen. |
| 41 | `bb_creditors_search` | `/settings/get/creditors` | lesend | R | true | false | true | Sucht Kreditoren; die API setzt ohne `limit` still einen Vorgabewert von 25. |
| 42 | `bb_debtors_search` | `/settings/get/debtors` | lesend | R | true | false | true | Sucht Debitoren; die API setzt ohne `limit` still einen Vorgabewert von 25. |
| 43 | `bb_postingaccounts_search` | `/settings/get/postingaccounts` | lesend | R | true | false | true | Sucht Sachkonten; liefert auch Debitoren und Kreditoren als vereinigte Liste, Vorgabe `limit` 1000. |
| 44 | `bb_creditors_update` | `/settings/update/creditor` | ändernd | M | false | false | true | Überschreibt Stammdaten eines Kreditors; kein Endpunkt liefert den Zustand davor zurück. |
| 45 | `bb_debtors_update` | `/settings/update/debtor` | ändernd | M | false | false | true | Überschreibt Stammdaten eines Debitors; kein Endpunkt liefert den Zustand davor zurück. |
| 46 | `bb_postingaccounts_update` | `/settings/update/postingaccount` | ändernd | M | false | false | true | Ändert ein Sachkonto, auf das bestehende Buchungen verweisen. |
| 47 | `bb_transactions_create` | `/transactions/add` | anlegend | A | false | false | false | Erzeugt eine Zahlung auf einem echten Zahlungskonto; eine erfundene Zahlung verfälscht Kontostand und Abstimmung sofort. |
| 48 | `bb_transactions_create_batch` | `/transactions/addBatch` | anlegend | A | false | false | false | Erzeugt bis zu 50 Zahlungen in einem Aufruf; nur ein Aufruf alle fünf Sekunden. |
| 49 | `bb_transactions_assign_receipt_batch` | `/transactions/assign-batch/receipt` | ändernd | A | false | false | false | Ordnet mehrere Belege ihren Zahlungen zu; umkehrbar, aber nur einzeln über `bb_transactions_unassign_receipt`. |
| 50 | `bb_transactions_assign_receipt` | `/transactions/assign/receipt` | ändernd | A | false | false | false | Ordnet einen Beleg einer Zahlung zu und kann damit Folgeautomatiken auslösen. |
| 51 | `bb_transactions_list_assigned_receipts` | `/transactions/assigned-receipts/get` | lesend | R | true | false | true | Listet die Belege, die einer bestimmten Transaktion zugeordnet sind. |
| 52 | `bb_transactions_search` | `/transactions/get` | lesend | R | true | false | true | Sucht Zahlungen nach Konto, Zeitraum und Kennungsbereich; liefert sechs Felder je Zeile. |
| 53 | `bb_transactions_get` | `/transactions/get/id_by_customer` | lesend | R | true | false | true | Holt eine einzelne Zahlung mit Detailfeldern; **am 2026-09-12 live HTTP 404 mit HTML-Antwort**. |
| 54 | `bb_transactions_unassign_receipt` | `/transactions/unassign/receipt` | löschend | D | false | true | false | Hebt die Zuordnung eines Belegs zu einer Zahlung auf; scheitert, wenn eine bestätigte Buchung daran hängt. |

**Prüfsummen.** 54 Zeilen, 54 verschiedene Werkzeugnamen, 54 verschiedene API-Pfade.
Wirkung: 15 lesend, 24 anlegend, 8 ändernd, 7 löschend, entspricht `grundlagen.md` 7.3.
Klassen: 15 R, 17 A, 2 AR, 4 M, 7 D, 9 B, Summe 54.
Längster Name: `bb_transactions_list_assigned_receipts` und
`bb_receipts_list_assigned_transactions` mit je 38 Zeichen, beide unter der Grenze von 40.

### 3.3 Die sechs Klassen und ihre Annotationswerte

Übernommen aus `tool-design.md` 9.3, mit drei Präzisierungen, die E1 nötig macht.

| Klasse | Bedeutung | Anzahl | readOnly | destructive | idempotent | Freigabe im Client |
| --- | --- | ---: | --- | --- | --- | --- |
| R | liest ausschliesslich | 15 | true | false | true | nicht nötig |
| A | legt an, lädt hoch, stellt eine umkehrbare Verknüpfung her, macht ein Löschen rückgängig | 17 | false | false | false | empfohlen |
| AR | erzeugt eine Auswertung und ersetzt dabei die vorherige desselben Typs | 2 | false | true | false | empfohlen |
| M | ändert einen bestehenden Stammdatensatz | 4 | false | false | true | empfohlen |
| D | löscht, storniert oder hebt eine Bestätigung oder Zuordnung auf | 7 | false | true | false | dringend empfohlen |
| B | legt einen fachlich verbindlichen Vorgang an oder bindet einen Beleg ohne Rückweg | 9 | false | false | false | dringend empfohlen |

**Präzisierung 1: R bekommt konkrete Werte für `destructiveHint` und `idempotentHint`.**
`MCP-SCHEMA` erklärt beide Felder für bedeutungslos, solange `readOnlyHint` wahr ist;
`tool-design.md` 9.3 führt sie dort als "n/a", 11.8 verlangt aber alle vier Annotationen an jedem
Werkzeug. Der Widerspruch wird zugunsten von 11.8 aufgelöst: `destructiveHint: false` und
`idempotentHint: true`. Das sind die einzigen Werte, die einen Client, der die Bedeutungslosigkeit
nicht kennt, nicht in die Irre führen.

**Präzisierung 2: `bb_invoices_create_draft` steht in Klasse A, nicht in B.** `tool-design.md` 3.5
fasst alle drei Rechnungsendpunkte in einem Werkzeug der Klasse B zusammen. Unter E1 sind es drei
Werkzeuge, und ein Entwurf ist keine ausgestellte Rechnung: Er trägt keine endgültige Nummer und
begründet keine Forderung. Ehrlich benannt werden muss dabei zweierlei. Erstens ändert die
Klassenwahl **keinen** maschinenlesbaren Wert, weil A und B dieselben drei Annotationen tragen; sie
ändert die Dringlichkeit der Formulierung in Beschreibung und README. Zweitens kennt die API auch
für den Entwurf keinen Löschendpunkt, was in der Beschreibung ausdrücklich steht.

**Präzisierung 3: die Klasse steht im Register, nie im Namen.** `bb_reports_get_ledger` endet auf
einen Qualifizierer und ist lesend, `bb_postings_assign_receipt` endet auf einen Qualifizierer und
ist schreibend, `bb_receipts_restore` klingt harmlos und schreibt. Der Torwächter aus S4 liest
ausschliesslich `entry.class`. Ein Test (9.2, Prüfung 5) stellt sicher, dass keine Ableitung aus
dem Namen existiert, indem er die Klassenzuordnung gegen eine zweite, unabhängig gepflegte Liste
im Test prüft.

### 3.4 Die beiden live defekten Endpunkte werden ausgeliefert

`tool-design.md` 3.5 verlangt, `bb_receipts_get` und `bb_transactions_get` nicht auszuliefern,
solange die Endpunkte nicht antworten. Dieser Plan entscheidet **anders** und begründet das:

- **E6 verlangt Vollständigkeit.** 52 von 54 Werkzeugen wären eine stille Lücke. Ein Agent, der ein
  Werkzeug nicht sieht, schliesst auf eine fehlende Fähigkeit und sucht Umwege über mehrere
  Fehlversuche. Dasselbe Argument hat `tool-design.md` 9.5 bereits für gesperrte Werkzeuge
  akzeptiert, als es entschied, sie in `tools/list` sichtbar zu lassen.
- **Der Defekt liegt bei BuchhaltungsButler, nicht bei uns.** Wird er behoben, funktionieren beide
  Werkzeuge sofort, ohne dass eine neue Version veröffentlicht werden muss. Das ist aus dem
  Blickwinkel Betrieb der entscheidende Punkt: Ein ausgelassenes Werkzeug braucht einen Release, ein
  vorhandenes braucht nichts.
- **Die Ehrlichkeitspflicht wird über drei Stellen eingelöst**, nicht über das Weglassen:
  1. Die Beschreibung nennt den Befund im vierten Satz, mit Datum und beobachtetem Verhalten, und
     nennt das Ersatzverfahren (`bb_receipts_search` beziehungsweise `bb_transactions_search` mit
     `id_by_customer_from = id - 1` und `id_by_customer_to = id + 1`).
  2. Der Fehlerkatalog trägt für diese beiden Pfade einen Sondereintrag, der aus dem sonst
     nichtssagenden `error_code` 5 beziehungsweise dem HTML-404 eine Meldung macht, die das
     Ersatzverfahren als konkreten Aufruf nennt.
  3. Die README führt beide unter "Bekannte Einschränkungen" mit demselben Text.
- **Die Umkehrung der Entscheidung ist billig.** Sollte sich zeigen, dass die beiden Werkzeuge
  Agenten in Schleifen treiben, genügt ein Feld `deliverable: false` im Registereintrag, um sie aus
  `tools/list` zu nehmen. Das Feld wird von Anfang an vorgesehen, aber nicht gesetzt.

Kein anderes Werkzeug darf in seiner Beschreibung auf diese beiden verweisen, solange der Befund
gilt. Das bleibt aus `tool-design.md` 5.5 unverändert bestehen und wird als Test geprüft (9.2,
Prüfung 8).
---

## 4. Wie die Eingabeschemata entstehen

### 4.1 Die Entscheidung

**Gemischt, mit klarer Arbeitsteilung: Der Generator liefert das Gerüst, die Handarbeit liefert das
Urteil, und ein Test erzwingt, dass beides deckungsgleich bleibt.**

Weder rein handgeschrieben noch rein generiert ist bei 371 Parametern tragfähig:

- **Rein handgeschrieben** bedeutet 371 Parameter von Hand aus einer 1,4 MB grossen JSON-Datei
  abzuschreiben. Der erwartbare Fehler ist der ausgelassene Parameter. Er ist die schlimmste
  Sorte Fehler, weil er still ist: Niemand merkt, dass ein Werkzeug einen Filter nicht anbietet,
  den die API kann.
- **Rein generiert** scheitert an der Datei. Belegt durch eigene Auswertung am 2026-09-12:
  32 Array-Parameter haben `items: null`, also keinen Elementtyp. Neun Parameter haben gar kein
  `type`, sondern ein `schema` mit `$ref`. Der `order`-Parameter von `/receipts/get` trägt ein
  Objektschema mit der wörtlichen Property `field`, die kein Feldname ist, sondern ein Platzhalter.
  Die `responses`-Schlüssel heissen `"400 (5)"` und sind als Statuscode ungültig. Alle
  `description`-Felder enthalten HTML (`<br/>`, `<i>`, `&ldquo;`). `tool-design.md` 12 sagt dazu
  bereits: "ein generischer OpenAPI-Codegenerator wird an dieser Datei vermutlich scheitern."
  Das ist hiermit bestätigt.

### 4.2 Der Generator

**Eingabe:** `docs/openapi/buchhaltungsbutler-v1.json`, eingecheckt und gepinnt.

**Ausgabe:** `src/generated/endpoints.ts`, eine reine Datenstruktur ohne Logik:

```ts
// Erzeugt von scripts/gen-endpoints.ts. Nicht von Hand Ã¤ndern.
export const GENERATED_ENDPOINTS = {
  "/receipts/get": {
    specVersion: "1.9.1",
    params: [
      { name: "api_key",        type: "string",  required: true,  doc: "The api key registered for the customer to manage" },
      { name: "list_direction", type: "string",  required: true,  doc: "Can be either 'inbound' (Eingangsbelege) or 'outbound' (Ausgangsbelege)." },
      { name: "payment_status", type: "string",  required: false, doc: "Can be either 'paid' (bezahlt) or 'unpaid' (unbezahlt)." },
      // ... alle 14
    ],
    statuses: [200, 400, 401, 403, 500, 504],
  },
  // ... alle 54
} as const;
```

Was der Generator tut, und nur das:

1. Über alle 54 `paths` gehen und je Pfad `post.parameters` einsammeln.
2. `type` übernehmen, wo vorhanden. Fehlt `type`, wird `schema` mitgeführt und der Parameter als
   `kind: "complex"` markiert; die Überlagerung **muss** ihn dann ausdrücklich behandeln.
3. `required` übernehmen.
4. `description` von HTML befreien: Tags entfernen, `<br/>` zu Zeilenumbruch, HTML-Entities
   auflösen, Whitespace normalisieren. Das Ergebnis ist die Rohdokumentation, nicht die
   Werkzeugbeschreibung.
5. Die `responses`-Schlüssel mit dem Muster `^(\d{3})(?: \((\d+)\))?$` zerlegen und daraus die
   Statusliste bilden. Der Fehlerteil geht in den zweiten Generator.
6. Nichts ableiten, nichts raten, keine Enums erfinden, keine Zod- oder JSON-Schema-Syntax erzeugen.

**Warum Daten und nicht Code.** Ein Generator, der Zod- oder JSON-Schema-Quelltext ausspuckt,
erzeugt eine grosse, schlecht lesbare Datei, die bei jedem Lauf neu formatiert wird und deren
Versionsverlauf unbrauchbar ist. Eine Datentabelle ist kompakt, diffbar und lässt sich zur Laufzeit
mit der Überlagerung verrechnen. Der zweite Grund ist Ehrlichkeit: Der Generator kann kein Enum
kennen, also darf er auch keine Syntax erzeugen, die so aussieht, als kennte er eines.

### 4.3 Die Überlagerung

Je Werkzeug eine Datei unter `src/registry/tools/`. Beispielhaft verkürzt:

```ts
import { defineTool } from "../types.js";

export default defineTool({
  name: "bb_receipts_search",
  title: "Belege suchen",
  path: "/receipts/get",
  toolClass: "R",
  bucket: "default",
  description: `...`,               // Englisch, fuenf Saetze nach tool-design.md 11.3
  params: {
    // Jeder Parameter des Generats braucht hier genau einen Eintrag.
    api_key:        { omit: "Kommt aus der Konfiguration, nie aus dem Werkzeugaufruf." },
    list_direction: { enum: ["inbound", "outbound"], doc: "..." },
    payment_status: { enum: ["paid", "unpaid"], optional: true, doc: "..." },
    date_from:      { format: "date", doc: "..." },
    limit:          { integer: { min: 1, max: 500, default: 100 }, doc: "..." },
    order:          { order: "objectPerField", fields: ["date", "amount", "invoicenumber", "invoicingparty"] },
    // ...
  },
  responseFormat: "list",
  concise: ["id_by_customer", "date", "counterparty", "amount", "payment_status"],
  verifyWith: null,                 // nur bei schreibenden Eintraegen gesetzt
});
```

Die Überlagerung leistet genau das, was der Generator nicht kann:

| Aufgabe | Beispiel |
| --- | --- |
| Enums setzen | `list_direction`, `payment_status`, `type`, Umsatzsteuerschlüssel |
| Umbenennen | `type` → `receipt_type`, `posting_type`, `contact_type` (`tool-design.md` 4.6) |
| Grenzen setzen | `limit` mit `minimum: 1`, `maximum: 500`, `default: 100` |
| Formate festlegen | Datum als `format: "date"`, Beträge als String |
| Die drei `order`-Syntaxen zuordnen | `objectPerField`, `singleString`, `fieldDirectionString` |
| Parallele Arrays zu einer Objektliste machen | `postingaccounts`/`amounts`/`vats` → ein `items`-Array |
| Deutsche Fachbegriffe einstreuen | "Beleg", "Kreditor", "Sachkonto", "Storno" |
| Pflichtfelder verschärfen | Was die API optional führt und fachlich entscheidend ist, wird `required` |
| Weglassen begründen | `api_key` mit ausgeschriebenem Grund, nicht stillschweigend |

### 4.4 Die Prüfung, die das Ganze zusammenhält

Ein Test, und er ist der wichtigste des Projekts:

> Für jeden der 54 Pfade gilt: Die Schlüsselmenge von `params` in der Überlagerung ist **exakt**
> gleich der Namensmenge von `GENERATED_ENDPOINTS[pfad].params`. Kein Parameter fehlt, keiner ist
> erfunden. Ein Parameter, der nicht im Schema erscheinen soll, braucht `omit` mit einem nicht
> leeren Begründungstext.

Daraus folgt die Antwort auf die Frage nach dem Ändern der API: **Erweitert BuchhaltungsButler die
Spezifikation, schlägt dieser Test nach dem nächsten Generatorlauf fehl und benennt den Pfad und
den Parameternamen.** Es gibt keinen Zustand, in dem ein neuer Parameter unbemerkt existiert. Das
ist der Unterschied zu jedem handgepflegten Schema.

Zwei weitere Prüfungen derselben Art:

- **Typprüfung.** Wo die Überlagerung einen Typ setzt, muss er mit dem Generat verträglich sein.
  Verträglich heisst: gleich, oder eine zulässige Verengung (`string` mit `enum` bleibt `string`;
  `string` zu `integer` ist ein Fehler und muss mit `retype` samt Begründung erklärt werden).
- **Pflichtfeldprüfung.** Wo das Generat `required: true` führt, darf die Überlagerung nicht
  `optional` setzen. Umgekehrt ist erlaubt und erwünscht (`tool-design.md` 6.4).

### 4.5 Vom Schema zum SDK

Der interne Schematyp ist bewusst kleiner als JSON Schema: Objekt der ersten Ebene, Felder mit
`string | integer | number | boolean | array | object`, dazu `enum`, `minimum`, `maximum`,
`maxItems`, `format`, `default`, `description`. Mehr braucht die API nicht, und jede weitere
Ausdrucksmöglichkeit wäre eine weitere Fehlerquelle.

Daraus entstehen zwei Dinge:

1. **JSON Schema Draft 2020-12** über `src/schema/json-schema.ts`, für `tools/list`.
2. **Ein Validator** über `src/schema/validate.ts`, rund 150 Zeilen, der bei einem Verstoss Pfad,
   erwarteten Wert und gefundenen Wert liefert. Genau diese drei Angaben braucht die Lehrmeldung
   aus 5.6, und genau sie liefert eine generische Schemabibliothek nicht in brauchbarer Form.

Der Adapter `src/schema/standard-schema.ts` verpackt beides als Standard-Schema-Objekt mit
`~standard.validate` und `~standard.jsonSchema`, wie es die SDK-Linie v2 verlangt. Dass ein
handgebautes, Zod-freies Schema unter v2 funktioniert, ist in `mcp-sdk-typescript.md` 3.4 in einem
echten Server-Client-Durchlauf verifiziert. Für die SDK-Linie v1 existiert `zod-adapter.ts`, das
denselben internen Schematyp in eine Zod-Rohform übersetzt; gebündelt wird nur der Adapter der
gewählten Linie.

**Folgen dieser Entscheidung, offen benannt:**

| | |
| --- | --- |
| Wartbarkeit | Ein Parameter ändert sich an genau einer Stelle. Schema, JSON Schema, Validierung, Fehlermeldung und Dokumentation folgen daraus. Die Alternative, dieselbe Information in Zod und in der Beschreibung getrennt zu pflegen, führt unweigerlich zum Auseinanderlaufen: Die Beschreibung nennt irgendwann weniger zulässige Werte, als das Schema kennt, und das Modell schlägt die fehlenden nie vor. |
| Codegrösse | Das Generat liegt bei geschätzt 60 bis 90 KB Quelltext, die 54 Überlagerungen bei rund 6000 Zeilen, überwiegend Beschreibungstext. Beides ist **geschätzt, nicht gemessen**. Der Grossteil davon sind Zeichenketten, die sich gut komprimieren; das Paketgrössenbudget in 9.5 misst das Ergebnis statt es zu schätzen. |
| Korrektheit | Der Gewinn ist die Vollständigkeitsprüfung aus 4.4. Das Risiko ist der selbst geschriebene Validator. Es wird über eine **Gegenprobe** getragen: Im Test wird derselbe interne Schematyp zusätzlich nach Zod übersetzt, und beide Validatoren müssen über einen Korpus aus gültigen und ungültigen Eingaben zu identischen Urteilen kommen. Zod bleibt dafür `devDependency`. |
| Startzeit | Es entsteht kein Zod-Aufbau beim Start. Der Gewinn ist klein und **nicht gemessen**; er ist nicht die Begründung der Entscheidung, sondern eine Beigabe. |

---

## 5. Die HTTP-Schicht

### 5.1 Client

Node-eigenes globales `fetch`, kein HTTP-Paket im Ausführungspfad, entsprechend `toolchain.md`
Abschnitt 7. `undici` ist reguläre Abhängigkeit, aber ausschliesslich für zwei Dinge: den globalen
Dispatcher mit Keep-Alive und `EnvHttpProxyAgent`, damit `HTTP_PROXY` und `HTTPS_PROXY` ohne
Node-Flag wirken. Beides wird in `src/http/dispatcher.ts` einmalig beim Serverstart gesetzt.

Jeder Aufruf ist ein POST mit:

- `Authorization: Basic <base64(client:secret)>`, gebildet über `Buffer.from(...).toString("base64")`,
  nicht über `btoa`, weil `btoa` an Nicht-Latin-1-Zeichen scheitert
- `Content-Type: application/json`
- `Accept: application/json`
- `User-Agent: bbutler-mcp/<version> (+https://github.com/dennismenken/buchhaltungsbutler-mcp)`
- Body als JSON, durchgehend, nie formularkodiert; das entspricht dem deklarierten Typ und
  erhält Booleans, `null` in Arrays und das `order`-Objekt

**Cookies werden nicht gespeichert.** Die API setzt `bbutler`, `AWSALB` und `AWSALBCORS`
(`grundlagen.md` 3.3). Eine über mehrere Mandanten geteilte Sitzung wäre ein Risiko. `fetch` in Node
hält ohnehin keinen Cookie-Speicher; die Regel wird als Kommentar und als Test festgehalten, damit
sie eine Umstellung auf einen anderen Client überlebt.

**Pfadbau.** Der Pfad kommt ausschliesslich aus dem Registereintrag, nie aus einem Parameter. Sollte
sich die Pfadsegment-Annahme bestätigen und ein Endpunkt eine Kennung im Pfad brauchen, wird sie
eng typisiert und zusätzlich durch `encodeURIComponent` geschickt; ein unkodierter Wert im Pfad
ist der klassische Weg zur Pfadinjektion.

### 5.2 Timeouts

| Grösse | Wert | Begründung |
| --- | --- | --- |
| Gesamt je Versuch | 30 s, `BB_TIMEOUT_MS` | Die API antwortet mit HTTP 504 und `error_code` 30 selbst bei Zeitüberschreitung; 30 s liegt darüber. |
| Erzeugende Berichte | 60 s | `/reports/create/*` und `/reports/get/*` mit `get_files: true` können grosse Dateien liefern. |
| Verbindungstest der CLI | 10 s | Ein Assistent, der 30 s schweigt, wirkt defekt. |

Das `AbortSignal` des MCP-Aufrufs und das Zeitlimit werden über `AbortSignal.any([...])`
kombiniert, damit ein abgebrochener Werkzeugaufruf den Request sofort schliesst.

### 5.3 Retry, getrennt nach lesend und schreibend

**Lesende Einträge (Klasse R, 15 Pfade).** Bis zu drei Versuche. Wiederholt wird bei:
Netzwerkfehler ohne Antwort, HTTP 5xx, HTTP 504 mit `error_code` 30, HTTP 403 mit `error_code` 15
(`adding temporarily restricted`, als Drosselung zu lesen) und HTTP 429, falls er entgegen der
Spezifikation doch auftritt.

Wartezeit: `base * 2^n` mit `base = 500 ms`, darauf **voller Jitter** über das gesamte Intervall,
also `random() * backoff`, gedeckelt bei 20 s. Der Deckel orientiert sich am Minutenlimit und nicht
an einem runden Wert. Zu beachten ist dabei, dass `min(base*2^n, max) * random()` im Mittel nur
die halbe Wartezeit ergibt und damit systematisch zu früh wiederkommt. **Jeder Versuch zieht ein eigenes Token aus dem Eimer**, sonst umgeht die Wiederholung
die eigene Begrenzung.

**Schreibende Einträge (39 Pfade).** **Niemals ein automatischer Retry.** Die API kennt keinen
Idempotenzschlüssel (`grundlagen.md` 7.1). Wer trotzdem jeden Aufruf wiederholt, erzeugt bei
einem Abbruch nach dem Anlegen einer Buchung eine zweite Buchung, und der Aufrufer sieht dabei
nur einen Fehler.

Stattdessen entsteht bei einem Netzwerkfehler oder Timeout eine eigene Meldung, deren Kern im
Register steht: das Feld `verifyWith` nennt je schreibendem Eintrag das Werkzeug, mit dem sich
nachsehen lässt, ob der Vorgang durchgelaufen ist. Muster:

```
bb_transactions_create did not receive an answer from BuchhaltungsButler within 30 s.
The request MAY have been executed: this API has no idempotency key, so a retry can
create a second payment. Do NOT call this tool again with the same arguments.
Check first with bb_transactions_search, filtered by account and by the date you passed.
If the payment is not there, call bb_transactions_create again.
```

Das Feld `verifyWith` ist für jeden der 39 schreibenden Einträge gesetzt; für die drei Endpunkte
ohne lesendes Gegenstück (`/comments/add`, `/invoices/create/*`) steht dort ausdrücklich der
Hinweis, dass die API keinen Leseweg anbietet und in der Weboberfläche nachzusehen ist. Ein Test
prüft, dass kein schreibender Eintrag `verifyWith` leer lässt.

### 5.4 Rate Limiting

Token-Eimer in `src/http/rate-limiter.ts`, **serialisiert über eine Promise-Kette je Eimer**, damit
gleichzeitige Aufrufe nicht dieselbe Wartezeit berechnen und gemeinsam durchlaufen.

| Eimer | Vorgabe | Gilt für | Grundlage |
| --- | --- | --- | --- |
| `default` | 60 je Minute, `BB_RATE_LIMIT_PER_MINUTE` | alle 54 Pfade | Dokumentiert sind 100 je Mandant und Minute; das Kontingent ist mit anderen Anwendungen geteilt (`grundlagen.md` 3.1). 60 ist der Sicherheitsabstand aus 3.4. |
| `upload` | 10 je Minute | `/receipts/upload` | `grundlagen.md` 3.2 |
| `batch` | ein Aufruf je 5 s | `/receipts/addBatch`, `/transactions/addBatch` | `grundlagen.md` 3.2 |

Die Eimerzuordnung steht im Registereintrag (`bucket`). Ein Aufruf zieht immer aus `default` und
zusätzlich aus seinem Sondereimer, falls er einen hat. Der Schlüssel des Eimers ist der `api_key`,
weil das Limit pro Mandant gilt; ein Server mit mehreren Profilen führt also mehrere Eimersätze.

Es gibt **keine** Auswertung von Rate-Limit-Headern, weil die API keine sendet (`grundlagen.md`
3.3, live geprüft). Der Server zählt selbst.

### 5.5 Content-Type-Prüfung

Vor jedem Parsen. Ist der Content-Type nicht `application/json`, entsteht sofort ein
Diagnosefehler, ohne `JSON.parse` zu versuchen:

```
BuchhaltungsButler answered HTTP 404 with content-type text/html instead of JSON
for /transactions/get/id_by_customer. This usually means the path is not routed in
the reachable production environment, not that your arguments were wrong.
First 200 characters of the body, markup removed: "..."
Nothing was fetched and nothing was changed.
```

Der Körperauszug wird von Markup befreit, auf 200 Zeichen gekürzt und durch die Schwärzung aus
`src/config/redact.ts` geschickt. `grundlagen.md` 4.4 belegt den Fall live.

### 5.6 Die Fehlerabbildung

**Der Schlüssel ist das Paar `(Pfad, error_code)`, nie `error_code` allein.** `grundlagen.md` 4.2
zeigt, warum: Code 7 trägt 32 verschiedene Bedeutungen. Eine Tabelle, die eine Handvoll Codes
global mit einer Bedeutung belegt, liegt damit an den meisten Pfaden falsch — und die falsche
Einstufung als vorübergehender Fehler kostet Wartezeit und Wiederholungen.

**Der Katalog.** `scripts/gen-errors.ts` liest die `responses`-Schlüssel aller 54 Pfade, zerlegt
`"400 (5)"` in Status und Code, holt den Meldungstext aus der referenzierten Definition und
schreibt `src/generated/errors.ts`:

```ts
export const ERRORS = {
  "/receipts/get": { 5: [400, "invalid list_direction specified"], 7: [400, "invalid date_from specified"], /* ... */ },
  // ... 54 Pfade, zusammen 718 Eintraege
} as const;
```

**Der Katalog wird dynamisch geladen**, erst wenn ein Fehler auftritt
(`await import("../generated/errors.js")`). Im Normalbetrieb kostet er null Ladezeit und null
Speicher. Das ist der einzige Ort im Projekt, an dem ein dynamischer Import aus Gründen der
Startzeit steht, und er ist es wert: 718 Einträge sind der grösste einzelne Datenblock des Pakets.

**Die Einordnung.** `src/errors/classify.ts` ordnet jedes Paar einer von fünf Klassen zu, nach
`docs/api/fehlercodes.md` Abschnitt D. Die Klasse ist nicht ableitbar und steht deshalb in einer
handgepflegten Regeltabelle, die auf Codes und Pfadmuster zugreift:

| Klasse | Bedeutung | Beispiele | Verhalten des Servers |
| --- | --- | --- | --- |
| `config` | Zugangsdaten oder Mandant falsch | 3, 4, 11 (alle Pfade) | Kein Retry. Die Meldung nennt `bbutler-mcp doctor` und die drei Umgebungsvariablen, **ohne Werte**. |
| `input` | Der Agent hat einen Parameter falsch gesetzt | die 400er-Codes je Pfad | Kein Retry. Die Meldung nennt den Parameter, die erlaubten Werte und einen korrigierten Beispielaufruf. |
| `transient` | Zeitweise | 0, 15, 30, 5xx, 504 | Retry nur bei lesenden Einträgen. |
| `final` | Fachlich nicht durchführbar | 10 an `/transactions/unassign/receipt`, 7 an `/reports/get/*` | Kein Retry. Die Meldung nennt die Vorbedingung. |
| `special` | Braucht eigene Behandlung | 8 und 12 an den Berichtspfaden, 31 und 32 an `/receipts/upload`, 12 und 33 als Tarifkontingent | Eigener Text je Fall, siehe unten. |

**Die Sonderfälle, ausgeschrieben**, weil genau sie den Unterschied zwischen brauchbar und
ärgerlich machen:

- **`error_code` 8 an `/reports/get/bwa` und `/reports/get/sums`**, "report generation has not been
  finished yet". Das ist kein Fehler, sondern ein Zwischenstand. Der Server antwortet mit
  `isError: true`, aber die Meldung sagt es: "The report is still being generated. Wait about two
  seconds and call bb_reports_get_bwa again with the same arguments. Do not call
  bb_reports_create_bwa again, that would discard the running generation."
- **`error_code` 7 an denselben Pfaden**, "report was not found". Die Meldung nennt
  `bb_reports_create_bwa` als Vorbedingung und weist darauf hin, dass dieses Werkzeug bei aktivem
  `BB_READ_ONLY` gesperrt ist.
- **`error_code` 12 an `/reports/create/*`.** Eine Erzeugung desselben Typs läuft bereits. Die
  Meldung sagt, dass gewartet und dann abgeholt wird, nicht erneut erzeugt.
- **`error_code` 12 an `/receipts/upload` und 33 an `/invoices/create*`**, "customer has reached the
  upload limit". Das ist ein Tarifkontingent, kein Rate Limit. Die Meldung sagt ausdrücklich, dass
  ein späterer Versuch nicht hilft und der Tarif betroffen ist.
- **`error_code` 15 mit HTTP 403.** Als Drosselung behandeln, nicht als Eingabefehler. Die
  Auslösebedingung ist in der Spezifikation nicht beschrieben und damit **nicht verifiziert**
  (`grundlagen.md` 3.2); die Meldung sagt das.
- **`error_code` 5 an `/receipts/get/id_by_customer`.** Der oben beschriebene Sondereintrag mit dem
  Ersatzverfahren.

**Der Aufbau jeder Meldung** folgt `tool-design.md` 8.2, vier Blöcke, und trägt zusätzlich immer
einen Satz über den Zustand der Daten. Dieser Satz ist Pflicht und wird getestet:

```
[Was]       bb_receipts_search was rejected by BuchhaltungsButler.
[Warum]     The API reported error_code 5 for /receipts/get: "invalid list_direction
            specified". You passed list_direction="in".
[Wie]       Allowed values are exactly "inbound" (Eingangsbelege) and "outbound"
            (Ausgangsbelege). Retry with {"list_direction": "inbound", "limit": 100}.
[Zustand]   Nothing was changed in the accounting data.
```

**Was niemals in einer Meldung steht** (Test 9.2, Prüfung 7): `api_key`, API Client, API Secret,
der `Authorization`-Header, ein Stacktrace, roher HTML-Körper, ein Dateisystempfad aus einer
Upload-Prüfung.
---

## 6. Konfiguration

### 6.1 Alle Umgebungsvariablen

Pflicht, drei Stück. Ohne sie startet der Server nicht.

| Variable | Bedeutung |
| --- | --- |
| `BB_API_CLIENT` | API Client, Benutzername der HTTP-Basic-Authentifizierung |
| `BB_API_SECRET` | API Secret, Passwort der HTTP-Basic-Authentifizierung |
| `BB_API_KEY` | Der `api_key`, der in jedem Body steht und den Mandanten auswählt. Kein harmloser Bezeichner: Er entscheidet, wessen Buchhaltung bearbeitet wird. |

Optional, mit Vorgabe. Wer nichts davon setzt, bekommt einen vollständig funktionsfähigen Server.

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `BB_BASE_URL` | `https://webapp.buchhaltungsbutler.de/api/v1` | Basis-URL. Muss `https:` sein; `http:` wird abgelehnt, ausser gegen `localhost`, damit ein Test gegen einen lokalen Nachbau möglich bleibt. |
| `BB_PROFILE` | `default` | Profilname in der Zugangsdatendatei |
| `BB_CONFIG_DIR` | `${XDG_CONFIG_HOME:-~/.config}/buchhaltungsbutler-mcp`, unter Windows `%APPDATA%\buchhaltungsbutler-mcp` | Ort der Zugangsdatendatei |
| `BB_READ_ONLY` | `false` | `true` beschränkt den Server auf die 15 lesenden Endpunkte. Siehe 6.4. |
| `BB_LOG_LEVEL` | `warn` | `error`, `warn`, `info`, `debug`. Ausgabe ausschliesslich auf stderr. |
| `BB_TIMEOUT_MS` | `30000` | Zeitlimit je HTTP-Versuch, 1000 bis 300000 |
| `BB_RATE_LIMIT_PER_MINUTE` | `60` | Gesamteimer, 1 bis 100. Werte über 100 werden abgelehnt, nicht gekappt, weil das dokumentierte Limit bei 100 liegt. |
| `BB_MAX_BATCH` | `50` | Obergrenze für `items`-Arrays. Wird zusätzlich als `maxItems` ins Schema geschrieben, damit der Agent die Grenze vor dem Aufruf sieht. |
| `BB_MAX_AMOUNT` | leer, also aus | Betragsgrenze für Werkzeuge der Klasse B. Ist sie gesetzt, lehnt der Server Beträge darüber ab, bevor ein Request abgeht. |
| `BB_CACHE_TTL_MS` | `0`, also aus | Haltbarkeit des Stammdatenspeichers. Siehe 7.6. |
| `BB_DUPLICATE_CHECK` | `true` | Duplikatshinweis vor dem Anlegen. Blockiert nie, kostet aber je Aufruf einen zusätzlichen Request gegen das Minutenlimit. |
| `BB_UPLOAD_FROM_URL` | `false` | Erlaubt `https://` als Belegquelle bei `bb_receipts_upload`. Standardmässig aus. |
| `BB_UPLOAD_DIRS` | leer, also aus | Doppelpunktgetrennte Liste erlaubter Verzeichnisse für `file://` als Belegquelle. Leer heisst: kein Dateisystemzugriff. |

Bewusst **nicht** gebaut, damit die Konfigurationsfläche klein bleibt: eine Variable zum Abschalten
einzelner Werkzeuge, eine Variable für das Antwortformat, eine Variable für die Sprache der
Werkzeugbeschreibungen, ein Konfigurationsdateiformat neben der Zugangsdatendatei. Jede davon
verdoppelt die Zahl der Zustände, in denen ein Fehlerbericht ankommt.

### 6.2 Auflösungsreihenfolge

Verbindlich nach `distribution.md` 13.2:

1. Sind `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` **alle drei** gesetzt, gelten sie, und die
   Zugangsdatendatei wird nicht gelesen. Teilweise gesetzte Werte mischen sich **nicht** mit der
   Datei; das wäre eine Fehlerquelle, die niemand debuggt.
2. Sonst: Zugangsdatendatei, Profil aus `BB_PROFILE`, sonst `default`.
3. Fehlt danach etwas: Abbruch mit Rückgabewert 1 und einer Meldung auf stderr.

Kommandozeilenargumente für Zugangsdaten gibt es nicht. Es gibt keine Option `--api-key` und keine
Entsprechung. Was nicht existiert, kann niemand in eine Prozessliste, eine Shell-History oder eine
eingecheckte Konfigurationsdatei schreiben (`distribution.md` 13.1).

### 6.3 Startprüfung und Verhalten bei Fehlkonfiguration

Der Server prüft beim Start, in dieser Reihenfolge, und bricht beim ersten Fehler ab:

1. **Node-Version** gegen `engines.node`. Meldung nennt gefundene und geforderte Version und den
   Weg, Node zu aktualisieren.
2. **Unbekannte `BB_*`-Variablen.** Jede Variable mit dem Präfix `BB_`, die nicht in der Tabelle aus
   6.1 steht, erzeugt eine Warnung auf stderr mit dem nächstähnlichen bekannten Namen. Das fängt
   Tippfehler, die sonst still wirkungslos bleiben. Sonderfall: `BB_MCP_READ_ONLY` wird als
   gleichbedeutender Altname akzeptiert und erzeugt eine Warnung mit dem neuen Namen. Zur
   Namensentscheidung siehe 6.5.
3. **Zugangsdaten** nach 6.2. Fehlt einer der drei Werte, nennt die Meldung **genau den fehlenden**
   und beide Wege:

```
Der BuchhaltungsButler-MCP-Server kann nicht starten: BB_API_SECRET fehlt.
Gefunden wurden BB_API_CLIENT und BB_API_KEY, aber kein API Secret.

Zwei Wege, das zu beheben:
  1. Einrichtungsassistent starten:  npx -y @dennismenken/buchhaltungsbutler-mcp setup
  2. Die Variable im MCP-Client eintragen, im Abschnitt "env" der Serverkonfiguration.

Die Werte stehen in BuchhaltungsButler unter Einstellungen, Schnittstellen, API-Zugang.
Diagnose ohne Geheimnisse:  npx -y @dennismenken/buchhaltungsbutler-mcp doctor
```

4. **Dateirechte** der Zugangsdatendatei, falls sie benutzt wird. Ist sie für Gruppe oder andere
   lesbar, Warnung auf stderr mit dem Befehl `chmod 600 <pfad>`. Kein Abbruch, weil der Server sonst
   auf Systemen mit ungewöhnlicher umask nicht startet.
5. **Wertebereiche** aller optionalen Variablen. Eine ungültige Zahl bricht ab und nennt den
   erlaubten Bereich und die Vorgabe.
6. **`BB_BASE_URL`** auf `https:` prüfen.

Was der Server **nicht** tut: keinen Netzaufruf beim Start. Ein Verbindungstest beim Start würde die
Startzeit um eine Netzlaufzeit verlängern, gegen das Startzeitlimit von 10 Sekunden der Codex CLI
arbeiten (`distribution.md` 12.2) und den Server bei einem kurzen Netzausfall unstartbar machen.
Der Verbindungstest gehört in `bbutler-mcp doctor` und in den Assistenten, nicht in den Serverstart.

### 6.4 Der optionale Nur-Lesen-Schalter

Nach E2 und `tool-design.md` 9.5:

- **Vorgabe ist aus.** Nach der Installation sind alle 54 Werkzeuge sofort aufrufbar.
- **Bei `BB_READ_ONLY=true`** führt der Server nur Werkzeuge der Klasse R aus, also genau die 15
  lesenden Endpunkte aus `grundlagen.md` 7.3. Die Klasse wird aus dem Register gelesen, nie aus dem
  Namen. Die Liste ist eine Erlaubnisliste, keine Verbotsliste; ein künftiger Endpunkt ist damit
  automatisch gesperrt, bis er ausdrücklich als lesend eingetragen wird.
- **Der Schalter wird nur beim Start gelesen** und ist zur Laufzeit nicht änderbar, insbesondere
  nicht durch ein Werkzeug.
- **Gesperrte Werkzeuge bleiben in `tools/list` sichtbar** und antworten mit `isError: true`. Die
  Werkzeugliste hängt nicht vom Schalter ab.
- **Die Absage nennt Variable, Zielwert und die Unaufhebbarkeit aus dem Gespräch heraus**, im
  Wortlaut aus `tool-design.md` 9.5.
- **`bb_reports_create_bwa` und `bb_reports_create_sums` sind eingeschlossen**, obwohl sie keinen
  Buchungsbestand verändern. Sie ersetzen den vorherigen Bericht desselben Typs. Folge: Bei aktivem
  Schalter liefert nur `bb_reports_get_ledger` eine Auswertung; BWA und Summen- und Saldenliste
  brauchen einen Neustart ohne den Schalter. Das steht in den `instructions`, in der README und in
  den Beschreibungen von `bb_reports_get_bwa` und `bb_reports_get_sums`.

Die `instructions` des Servers nennen den Zustand des Schalters wörtlich. Sie sind der einzige Ort,
an dem ein Agent ihn erfahren kann, bevor er das erste Werkzeug aufruft.

### 6.5 Der Namenskonflikt zwischen zwei Dossiers, offen entschieden

`tool-design.md` 9.5 nennt die Variable `BB_MCP_READ_ONLY`, `distribution.md` 13.2 nennt sie
`BB_READ_ONLY`. Beide Dossiers sind verbindlich formuliert. Die Entscheidung dieses Plans:

**Kanonisch ist `BB_READ_ONLY`.** Begründung: Die drei Pflichtvariablen heissen `BB_API_*`, und ein
zweiter Präfix `BB_MCP_` neben `BB_` erzeugt genau die Sorte Verwechslung, die einen Nutzer eine
halbe Stunde kostet. Der Server akzeptiert `BB_MCP_READ_ONLY` als Altnamen und warnt auf stderr.
Dasselbe gilt für `BB_MCP_MAX_BATCH` und `BB_MCP_MAX_AMOUNT` gegenüber `BB_MAX_BATCH` und
`BB_MAX_AMOUNT`. Sind beide Namen gleichzeitig gesetzt und widersprechen sich, bricht der Server
ab, statt einen von beiden still zu gewinnen.

---

## 7. Antwortaufbereitung

### 7.1 Beides, strukturiert und als Text

Jede erfolgreiche Antwort trägt `structuredContent` **und** einen `content`-Textblock. Der Textblock
ist nicht redundant: Er ist das, was ein Client ohne Unterstützung für `structuredContent` anzeigt,
und das, was der Nutzer im Verlauf liest (`tool-design.md` 7.5).

| Fall | `structuredContent` | `content` |
| --- | --- | --- |
| Listenergebnis | `{ rows, data, page }` | Markdown-Tabelle plus Seitenhinweis |
| Einzelobjekt | das normalisierte Objekt | lesbare Zusammenfassung in Sätzen |
| Schreibbestätigung | erzeugte Kennungen plus aufgelöster Datensatz | ein Satz Klartext plus Tabelle des betroffenen Datensatzes |
| Bericht | die Auswertungsdaten | Kurzfassung plus Hinweis auf `get_files` |
| Fehler | **keines** | die Lehrmeldung, dazu `isError: true` |

**`outputSchema` wird gesetzt, aber niemals geschlossen.** Jedes Ausgabeschema trägt
`additionalProperties: true`. Grund, live belegt: `/receipts/get` liefert `delivery_date`,
`amount_paid` und `amount_paid_fixed`, die in der Spezifikation nicht stehen; `/receipts/get`
liefert `id_by_customer` als String, wo eine Zahl zu erwarten wäre. Ein geschlossenes Ausgabeschema
würde beim nächsten Feld, das BuchhaltungsButler ergänzt, jeden Aufruf scheitern lassen, und zwar
bei allen Nutzern gleichzeitig. Die Pflichtfelder eines Ausgabeschemas beschränken sich deshalb auf
`success` und den Datenbehälter.

### 7.2 Normalisierung, ohne Daten zu verlieren

`src/mapping/response.ts` arbeitet mit einer Feldliste je Endpunkt, die aus dem Register kommt:

- Felder mit bekanntem Zieltyp werden umgewandelt: Betragsstrings zu Zahl **und** zusätzlich im
  Original erhalten (`amount: 119.0`, `amount_raw: "119.00"`), Booleanstrings `"0"`/`"1"` zu echten
  Booleans, `null` bleibt `null`.
- **Felder ohne Eintrag in der Liste werden unverändert durchgereicht**, nie verworfen, und bei
  `BB_LOG_LEVEL=debug` einmal je Prozesslauf auf stderr gemeldet ("unbekanntes Antwortfeld
  `x` an `/receipts/get`"). Das ist der Frühwarnmelder für Änderungen an der API.
- Feldnamen bleiben im Original. Der Feldname einer Antwort ist der Parametername des nächsten
  Aufrufs; ihn für die Anzeige zu verschönern, etwa von `id_by_customer` zu `Id By Customer`,
  zerstört genau diese Brücke.
- Freitextfelder aus der API (`counterparty`, Kommentartexte, Belegnamen) werden neutralisiert
  ausgegeben: keine Formatierung als Anweisung, keine Backticks, Zeilenumbrüche und Steuerzeichen
  ersetzt. Sie stammen von Dritten (`tool-design.md` 7.6).

### 7.3 Detailgrad

Jedes lesende Werkzeug bekommt `response_format` mit `enum: ["concise", "detailed"]` und
`default: "concise"` (`tool-design.md` 7.2). Die Spaltenliste für `concise` steht je Werkzeug im
Register (`concise: [...]`), damit sie an derselben Stelle wie die Beschreibung gepflegt wird.
`detailed` liefert den vollständigen Datensatz, wie die API ihn schickt, plus die
Normalisierungen aus 7.2.

### 7.4 Paginierung und die Frage, ob es mehr gibt

Hier liegt die gefährlichste stille Fehlerquelle der ganzen API, und sie wird ausdrücklich
adressiert.

**Der Befund:** `rows` ist die Zeilenzahl **dieser Antwort**, nicht die Gesamttrefferzahl. Es gibt
kein Feld für die Gesamtzahl, keinen Cursor, nur `limit` und `offset` (`grundlagen.md` 4.1 und 6).
`limit` über dem Maximum wird abgelehnt, nicht gekappt.

**Die Regeln:**

1. `limit` wird **immer** ausdrücklich gesetzt, auch wenn der Aufrufer es weglässt. Sonst greift bei
   `/settings/get/debtors` und `/settings/get/creditors` der Server-Vorgabewert 25, und der Agent
   hält 25 von 300 Kreditoren für alle. Ein Server-Vorgabewert ist nie eine Vollständigkeitszusage.
2. **Keine Auto-Paginierung.** Der Server blättert niemals selbständig weiter. Eine Automatik, die
   die Zeilenzahl einer Antwort für die Gesamttrefferzahl hält, bricht nach der ersten Seite ab und
   meldet trotzdem Vollständigkeit. Ein Aufruf ist eine Seite.
3. Die Antwort unterscheidet **drei** Zustände und sagt sie:

   | Beobachtung | Text am Ende der Antwort |
   | --- | --- |
   | zurückgegebene Zeilen < `limit` | `Returned 42 rows with limit=100. This is the last page for these filters.` |
   | zurückgegebene Zeilen = `limit` | `Returned 100 rows with limit=100. There are probably more: this API reports only the number of rows in this answer, never a total count. To get the next page, call bb_receipts_search again with the same filters and offset=100. To narrow the result instead, add date_from/date_to or counterparty.` |
   | zurückgegebene Zeilen = 0 | `Returned 0 rows. Either the filters match nothing, or the offset is past the end of the result.` |

   Der mittlere Satz ist der wichtige. "Es sind wahrscheinlich mehr" ist die einzige ehrliche
   Aussage, die diese API zulässt, und sie muss dort stehen, damit ein Agent nicht aus einer Seite
   auf ein Gesamtergebnis schliesst. In einer Buchhaltung ist das der Unterschied zwischen einer
   richtigen und einer falschen Summe.
4. Bei Endpunkten **ohne** `limit`/`offset` (47 von 54) kürzt der Server selbst und weist es aus,
   siehe 7.5.

### 7.5 Kürzung

Der Server kann keine Token zählen, ohne einen Tokenizer mitzuliefern. Er zählt deshalb **Zeichen**
und sagt das:

| Grenze | Wert | Verhalten |
| --- | --- | --- |
| weich | 20.000 Zeichen | Auf `concise` umschalten, falls noch nicht geschehen, und das in der Antwort nennen. |
| hart | 60.000 Zeichen | Zeilen abschneiden, die Zahl der unterdrückten Zeilen nennen, den konkreten nächsten Aufruf nennen. |

Die Umrechnung, offen benannt: `tool-design.md` 7.1 setzt 5.000 und 20.000 Token als weiche und
harte Grenze. Vier Zeichen je Token ist die übliche Faustregel für englischen Text und damit eine
**Annahme**, keine Messung; daraus folgen die Werte oben. Die Werte stehen als Konstanten an einer
Stelle und werden nach der ersten Evaluierung gegen eine echte Zählung justiert.

**Base64-Inhalte werden nie in den Text übernommen.** Belegdateien, BWA-PDF, CSV und ZIP aus
`get_file` beziehungsweise `get_files` erscheinen in `structuredContent` als Metadaten
(`filename`, `mime`, `bytes`) plus dem Inhalt, und im Textblock nur als Zeile
"PDF, 412 KB, im strukturierten Teil der Antwort". Ein Base64-Block im Textblock würde das
Zeichenbudget in einem Zug sprengen und ist für ein Modell wertlos.

### 7.6 Der Stammdatenspeicher

Standardmässig **aus** (`BB_CACHE_TTL_MS=0`). Wer ihn einschaltet, bekommt einen Speicher für genau
fünf lesende Werkzeuge, weil nur deren Daten sich selten ändern:

| Werkzeug | Invalidiert durch |
| --- | --- |
| `bb_accounts_list` | `bb_accounts_create` |
| `bb_postingaccounts_search` | `bb_postingaccounts_create`, `bb_postingaccounts_update`, **und zusätzlich** jedes Debitoren- und Kreditorenwerkzeug |
| `bb_debtors_search` | `bb_debtors_create`, `bb_debtors_create_batch`, `bb_debtors_update` |
| `bb_creditors_search` | `bb_creditors_create`, `bb_creditors_create_batch`, `bb_creditors_update` |
| `bb_cost_locations_search` | `bb_cost_locations_create`, `bb_cost_locations_update`, `bb_cost_locations_delete` |

Die zweite Zeile ist der nicht offensichtliche Teil:
`/settings/get/postingaccounts` liefert Sachkonten **einschliesslich** Debitoren und Kreditoren.
Wer einen Debitor anlegt und danach den zwischengespeicherten Sachkontenstand liest, sieht ihn
nicht. Die Invalidierungstabelle steht im Register, nicht im Cache-Modul, damit sie beim Nachrüsten
eines Endpunkts an derselben Stelle liegt wie alles andere.

Begründung für "aus als Vorgabe": Ein veralteter Stammdatensatz ist in einer Buchhaltung ein
schwer zu findender Fehler, und die Ersparnis lohnt erst, wenn ein Agent in einer Schleife
nachschlägt. Der Schalter ist da, wenn das Minutenlimit drückt; er drängt sich niemandem auf.

---

## 8. Der Einrichtungsassistent

### 8.1 Befehlsform

Ein einziger `bin`-Eintrag, `bbutler-mcp`, entsprechend `distribution.md` 15.3. Der unscoped Name
`buchhaltungsbutler-mcp` ist als Binary bereits von einem anderen npm-Paket belegt und darf nicht
verwendet werden.

| Aufruf | Wirkung |
| --- | --- |
| `bbutler-mcp` | startet den MCP-Server auf stdio. Der Normalfall, ohne Argumente. |
| `bbutler-mcp setup` | Einrichtungsassistent, acht Schritte |
| `bbutler-mcp doctor` | Diagnose: Zugangsdaten auflösen, Verbindung testen, Rechte prüfen, gefundene Clientkonfigurationen auflisten |
| `bbutler-mcp test` | nur der Verbindungstest, Rückgabewert 0 oder 1, für CI und Skripte |
| `bbutler-mcp profiles list\|add\|remove` | Mandantenprofile verwalten |
| `bbutler-mcp print-config --client <name>` | den fertigen Block ausgeben, nichts schreiben |
| `bbutler-mcp uninstall --client <name>` | den eigenen Eintrag entfernen |
| `bbutler-mcp --version`, `--help` | Version, Hilfe mit der Liste der Clientkürzel |

Clientkürzel: `claude-code`, `claude-desktop`, `codex`, `grok`, `vscode`, `cursor`, `windsurf`,
`lmstudio`, `cline`, `zed`, `continue`, `jan`.

**Jeder Unterbefehl schreibt ausschliesslich auf stdout und stderr eines Terminals**, niemals in
eine laufende MCP-Verbindung. Die Unterbefehle werden dynamisch importiert; ein Serverstart lädt
keinen Zeile CLI-Code.

Nicht interaktiv, für Skripte:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup \
  --client claude-code --scope user --start npx --non-interactive --print-only
```

Im nicht interaktiven Modus liest der Assistent Zugangsdaten ausschliesslich aus den drei
Umgebungsvariablen. Es gibt keine Option, sie als Argument zu übergeben.

### 8.2 Ablauf, acht Schritte

1. **Vorprüfung.** Node-Version gegen `>=22.12.0`. Danach erkennen, welche Clients vorhanden sind:
   über `which`/`where` für `claude`, `codex`, `grok`, `code`, über die Existenz der bekannten
   Konfigurationspfade für Claude Desktop, Cursor, Windsurf, LM Studio, Cline. Gefundene Clients
   stehen oben, die übrigen unter "Weitere".
2. **Zugangsdaten erfragen.** Drei maskierte Eingaben. Dazu der Hinweis, wo die Werte in
   BuchhaltungsButler stehen. Die Quellen widersprechen sich in der Menüführung
   (`distribution.md` 14.2), deshalb nennt der Assistent **beide** genannten Orte und behauptet
   nicht, es gäbe nur einen. Bereits gesetzte Umgebungsvariablen werden als Vorbelegung erkannt und
   angeboten, ohne den Wert anzuzeigen.
3. **Verbindung testen.** Genau ein lesender Aufruf gegen `/accounts/get`, die leichteste
   Leseoperation der API. Die Deutung trennt die drei Werte auseinander, denn genau darin liegt der
   Nutzen des Assistenten:

   | Ergebnis | Text |
   | --- | --- |
   | 200, `success: true` | Zugangsdaten vollständig gültig |
   | 401, `error_code` 3 | API Client oder API Secret ist falsch. Der `api_key` wurde noch nicht geprüft. |
   | 401, `error_code` 4 | API Client und Secret stimmen, aber der `api_key` gehört nicht dazu oder dieser Client darf diesen Mandanten nicht bedienen. |
   | 403, `error_code` 11 | Der Mandant hat keinen aktiven Status. Kein Konfigurationsfehler, sondern ein Kontostand. |
   | 403, `error_code` 15 oder HTTP 429 | Drosselung, später erneut versuchen. |
   | kein JSON zurück | Netz, Proxy oder Firewall. Der Assistent nennt `HTTPS_PROXY` und die Zieldomain. |
   | Netzwerkfehler | Verbindung zu `webapp.buchhaltungsbutler.de` prüfen. |

4. **Mandant bestätigen, mit dem verfügbaren Mittel.** `distribution.md` 14.2 sieht vor, den
   Anzeigenamen des Mandanten aus der Antwort zu holen. **Das geht nicht**: Ein Live-Aufruf am
   2026-09-12 zeigt, dass `/accounts/get` je Zeile nur `name` und `postingaccount_number` liefert
   und keinen Mandantennamen enthält. Ersatz, der denselben Zweck erfüllt: Der Assistent zeigt die
   Zahl der gefundenen Zahlungskonten und ihre Namen und fragt:

   ```
   Verbindung steht. Gefunden: 5 Zahlungskonten.
     1200  Bank
     1210  PayPal
     ...
   Gehoeren diese Konten zu dem Mandanten, den du verbinden willst? [j/n]
   ```

   Antwortet der Nutzer mit nein, ist der `api_key` der falsche, und der Assistent sagt genau das.
   Damit ist der Zweck des ursprünglichen Vorschlags erfüllt, ohne ein Feld zu erfinden, das es
   nicht gibt.
5. **Startvariante wählen.** `npx` als Vorgabe oder globale Installation. Bei globaler Installation
   ermittelt der Assistent den **absoluten Pfad** des Binaries und schreibt diesen, statt sich auf
   `PATH` zu verlassen. Das ist der häufigste Fehlerfall bei Desktop-Anwendungen, die nicht aus
   einer Login-Shell starten (`distribution.md` 12.1). Für Codex wird zusätzlich
   `startup_timeout_sec = 30` gesetzt, weil die Vorgabe von 10 Sekunden für einen npx-Kaltstart
   knapp ist (ebenda 12.2).
6. **Ablageort der Zugangsdaten wählen.** Drei Möglichkeiten: Zugangsdatendatei mit Rechten 0600
   (Vorgabe, empfohlen, die Clientkonfiguration enthält dann kein Geheimnis), direkt in die
   Clientkonfiguration (mit Hinweis, dass die Datei damit schutzbedürftig wird), oder gar nichts
   schreiben.
7. **Clients auswählen und Vorschau.** Mehrfachauswahl. Vor jedem Schreibvorgang wird der
   vollständige Pfad und der einzufügende Block angezeigt, Geheimnisse maskiert. Bei jeder Änderung
   an einer bestehenden Datei legt der Assistent vorher `<datei>.bak-<zeitstempel>` an und nennt
   den Pfad. Bestehende Einträge werden nie ohne ausdrückliche Zustimmung überschrieben.
8. **Abschluss.** Je Client eine Zeile, was noch zu tun ist: Claude Desktop vollständig beenden und
   neu starten, Cursor neu laden, VS Code den Server starten, Codex und Grok brauchen keinen
   Neustart. Dazu die Prüfzeile (`claude mcp get buchhaltungsbutler`, `grok mcp doctor …`) und ein
   Satz, den der Nutzer in den Client tippen kann, um den Erfolg zu sehen: "Liste meine
   Zahlungskonten in BuchhaltungsButler." Dieser Verifikationsschritt ist der Unterschied
   zwischen "eingerichtet" und "nachweislich funktionierend".

### 8.3 Welche Clients der Assistent selbst konfiguriert

Regel: Wo eine offizielle CLI existiert, wird sie als Unterprozess aufgerufen, statt ein Dateiformat
nachzubauen. Wo nur eine Datei existiert und diese reines JSON ist, wird geschrieben. Wo das Format
Kommentare tragen kann oder der Pfad nicht dokumentiert ist, wird der fertige Block ausgegeben.
**Geraten wird nicht.**

| Client | Automatisch | Weg |
| --- | --- | --- |
| Claude Code | ja | `claude mcp add-json` |
| Codex CLI, ChatGPT-Desktop-App | ja | `codex mcp add` |
| Grok Build | ja | `grok mcp add` |
| VS Code mit Copilot | ja | `code --add-mcp`, oder `.vscode/mcp.json` schreiben, wenn `inputs` gebraucht wird |
| Claude Desktop | ja | `claude_desktop_config.json` lesen, ergänzen, zurückschreiben |
| Cursor | ja | `~/.cursor/mcp.json` oder `.cursor/mcp.json` |
| Windsurf | ja | `~/.codeium/windsurf/mcp_config.json` |
| Cline (CLI) | ja | `~/.cline/mcp.json` |
| LM Studio | ja, mit Vorbehalt | `~/.lmstudio/mcp.json`; existiert der Pfad nicht, nur ausgeben |
| Zed | nein | `settings.json` ist JSONC mit Kommentaren |
| Continue | nein | YAML, Ablageort projektabhängig |
| Cline (IDE), Jan | nein | kein dokumentierter Dateipfad |
| ChatGPT im Browser | nein | technisch ausgeschlossen, mit Begründung im Text |

### 8.4 `doctor`, der Unterbefehl, der Supportanfragen abfängt

Die Ausgabe ist das, was in einen Fehlerbericht gehört, und sie enthält **kein** Geheimnis:

```
bbutler-mcp doctor

Umgebung
  Node            v22.23.2            (gefordert >=22.12.0)   ok
  Paketversion    0.1.0
  Plattform       darwin arm64

Konfiguration
  Quelle          Umgebungsvariablen
  BB_API_CLIENT   gesetzt (18 Zeichen, endet auf ...a7)
  BB_API_SECRET   gesetzt (40 Zeichen)
  BB_API_KEY      gesetzt (32 Zeichen, endet auf ...4f)
  BB_BASE_URL     https://webapp.buchhaltungsbutler.de/api/v1   (Vorgabe)
  BB_READ_ONLY    false                                          (Vorgabe)
  Profil-Datei    ~/.config/buchhaltungsbutler-mcp/credentials.json  Rechte 0600  ok

Verbindung
  POST /accounts/get   HTTP 200 in 412 ms   5 Zahlungskonten

Werkzeuge
  registriert     54     lesend 15, anlegend 24, Ã¤ndernd 8, lÃ¶schend 7
  gesperrt        0      (BB_READ_ONLY ist aus)

Gefundene Clients
  claude-code       ~/.claude.json                    Eintrag vorhanden
  claude-desktop    ~/Library/.../claude_desktop_config.json   kein Eintrag
  codex             ~/.codex/config.toml              Eintrag vorhanden, startup_timeout_sec=30
```

Die Anzeige von Länge und letzten zwei Zeichen ist eine bewusste Abwägung: Sie hilft beim
Auseinanderhalten zweier Mandanten, ohne den Wert preiszugeben. Sie läuft trotzdem durch dieselbe
Schwärzung wie alles andere, damit ein versehentlich falsch belegter Wert nicht doch durchrutscht.
---

## 9. Teststrategie

### 9.1 Grundsatz

**Kein Test geht schreibend gegen die echte API. Das wird nicht durch Disziplin sichergestellt,
sondern durch Code.** `scripts/contract-read.ts` und jeder Testhelfer, der echte Zugangsdaten
benutzen könnte, führt die Liste der 15 lesenden Pfade als Erlaubnisliste und wirft bei jedem
anderen Pfad, bevor ein Request gebaut wird. Die Erlaubnisliste wird aus dem Register erzeugt
(`class === "R"`), nicht abgeschrieben. Ein Test prüft, dass der Wächter greift, indem er einen
schreibenden Pfad anfordert und den Wurf erwartet.

Vier Ebenen, in dieser Reihenfolge der Anzahl:

| Ebene | Was | Netz |
| --- | --- | --- |
| Registerprüfungen | Eigenschaften aller 54 Einträge, siehe 9.2 | nein |
| Einheitstests | Module aus S3 bis S8 einzeln | nein |
| Integrationstests | gebauter Server, echter MCP-Client, `undici` MockAgent als API | nein |
| Vertragslauf | die 15 lesenden Endpunkte gegen die echte API | ja, nur lokal und auf ausdrücklichen Aufruf |

### 9.2 Die neun Registerprüfungen

Sie laufen über das Register und sind der Grund, warum E1 und E6 überhaupt überprüfbar sind.

1. **Vollständigkeit.** Die Menge der `path`-Werte aller Einträge ist exakt gleich der Menge der
   Schlüssel von `GENERATED_ENDPOINTS`. 54 gegen 54. Kein Endpunkt ohne Werkzeug, kein Werkzeug
   ohne Endpunkt. Schlägt automatisch fehl, sobald die Spezifikation wächst.
2. **Eineindeutigkeit.** Kein Pfad zweimal, kein Name zweimal. Das ist die maschinelle Prüfung von
   E1: genau ein Werkzeug je Endpunkt.
3. **Parameterdeckung.** Für jeden Eintrag: Schlüsselmenge von `params` gleich Namensmenge des
   Generats. Jeder `omit` trägt eine nicht leere Begründung. Das ist die Prüfung von E6.
4. **Namensschema.** Jeder Name erfüllt `^bb_[a-z][a-z0-9_]{2,36}$` und ist höchstens 40 Zeichen
   lang. Das zweite Segment hinter der Ressource stammt aus der Verbliste, die um `unassign`
   erweitert ist. Die Prüfung zerlegt den Namen an Unterstrichen und sucht das Verb als Segment,
   nicht als Endung, weil zwölf Namen auf einen Qualifizierer enden.
5. **Klassen und Annotationen.** Jeder Eintrag hat genau eine Klasse aus `R|A|AR|M|D|B`. Die vier
   Annotationen sind explizit gesetzt und stimmen mit der Klassentabelle überein. Zusätzlich:
   Die Zuordnung Werkzeug zu Klasse wird gegen eine **zweite, im Testverzeichnis unabhängig
   gepflegte Liste** geprüft, damit ein versehentliches Umklassifizieren auffällt statt still zu
   wirken. `openWorldHint` ist überall `true`.
6. **Wirkungsabgleich.** Die Zählung nach Wirkung ergibt 15 lesend, 24 anlegend, 8 ändernd,
   7 löschend, abgeglichen gegen eine aus `docs/api/grundlagen.md` 7.3 abgeschriebene Tabelle im
   Test. Weicht die Implementierung ab, ist entweder die Klassifikation falsch oder das Dossier
   veraltet; in beiden Fällen soll jemand hinsehen.
7. **Geheimnisfreiheit.** `api_key`, `api_client`, `api_secret` und `authorization` kommen in keiner
   Werkzeugdefinition, keinem Schema, keiner Beschreibung, keiner Antwort und keiner Fehlermeldung
   vor. Geprüft über die serialisierte `tools/list`-Ausgabe und über eine Sammlung erzeugter
   Fehlermeldungen.
8. **Beschreibungen.** Je Eintrag: Länge zwischen 60 und 220 Wörtern; enthält das Wort
   "BuchhaltungsButler"; enthält mindestens einen deutschen Fachbegriff in Anführungszeichen; jeder
   Parameter hat eine `description`; jede Beschreibung eines Werkzeugs der Klassen A, AR, M, D, B
   enthält den Folgensatz zur Wirkung auf den echten Datenbestand; kein Werkzeug hat einen
   Parameter `confirm`; **keine Beschreibung verweist auf `bb_receipts_get` oder
   `bb_transactions_get`**, solange deren Befund gilt; jeder Verweis auf ein anderes Werkzeug nennt
   einen Namen, den es gibt.
9. **Schreibende Einträge sind vollständig ausgestattet.** Jeder Eintrag mit `class !== "R"` hat
   `verifyWith` gesetzt, jedes Stapelfeld hat `maxItems`, jeder Eintrag hat eine Eimerzuordnung.

Dazu drei Prüfungen ausserhalb des Registers, die dieselbe Rolle spielen:

10. **Nur-Lesen-Prüfung.** Mit `BB_READ_ONLY=true` wird jedes der 39 schreibenden Werkzeuge einzeln
    aufgerufen; jedes muss absagen, **ohne** dass der MockAgent einen Request sieht, und die
    Absage muss `BB_READ_ONLY` nennen. Ohne die Variable führen dieselben 39 aus. Dazu die
    Berichtsprüfung: mit Schalter antworten `bb_reports_get_bwa`, `bb_reports_get_sums` und
    `bb_reports_get_ledger` weiter, `bb_reports_create_bwa` und `bb_reports_create_sums` sagen ab,
    und die `instructions` nennen die Einschränkung.
11. **Kein Retry auf Schreibendes.** Für alle 39 schreibenden Einträge wird der MockAgent so
    gestellt, dass er einmal HTTP 504 liefert. Erwartet wird: genau ein Request, kein zweiter, und
    eine Meldung, die `verifyWith` nennt. Das ist die Regressionssperre gegen die stille
    Doppelbuchung nach einem Netzabbruch.
12. **`.mcpb`-Werkzeugliste.** Die im Bundle-Manifest ausgewiesene Werkzeugliste wird aus dem
    Register erzeugt und danach gegen das Register geprüft. Das schliesst die Drift, die eine
    von Hand gepflegte Manifestliste unweigerlich entwickelt.

### 9.3 Wie HTTP-Aufrufe nachgebildet werden

`undici` mit `MockAgent` und `setGlobalDispatcher`, entsprechend `toolchain.md` 5.2. Das ist der
offiziell dokumentierte Weg, das globale `fetch` zu ersetzen, und es ist dieselbe Abhängigkeit, die
produktiv für Proxy und Keep-Alive gebraucht wird. Keine zweite Mocking-Bibliothek.

**Die Antworten der Mocks werden aus den Dossiers abgeleitet, nicht aus dem Code.** Unter
`test/golden/` liegen Antwortbeispiele, deren Herkunft je Datei als Kommentar steht: welche
Dossierstelle, welches Datum, welcher Live-Abruf. Der Grund: Ein Mock, der die Annahme des Codes
wiederholt, prüft nichts. Die Beispiele dieses Plans
gehören dazu, insbesondere:

- `/receipts/get` mit den 16 tatsächlich gelieferten Feldern und `id_by_customer` als String
- `/settings/get/postingaccounts` mit `parent_name: null`
- `/accounts/get` mit nur `name` und `postingaccount_number`
- eine HTML-404-Antwort für die Content-Type-Prüfung
- ein Fehlerumschlag `{"success":false,"error_code":5,"message":"invalid list_direction specified"}`

Die Testdaten sind erfunden, nicht die Struktur. Echte Geschäftsdaten liegen in keiner Datei.

### 9.4 Einheitstests, Schwerpunkte

Nicht alles gleich tief. Die Tiefe richtet sich danach, wo ein Fehler still bleibt:

| Modul | Warum besonders geprüft |
| --- | --- |
| `schema/validate.ts` | Gegenprobe gegen Zod über einen Korpus, siehe 4.5. Ohne sie ist der selbst geschriebene Validator ein unkontrolliertes Risiko. |
| `response/pagination.ts` | Die drei Zustände aus 7.4, einzeln. Der stille Fehler "Seite für Gesamtergebnis gehalten" entsteht genau hier. |
| `mapping/coerce.ts` | Beträge mit Punkt und mit Komma, Booleans als `"0"`, `"1"`, `"false"`, `null`, fehlende Felder. Eine Falsy-Prüfung auf einem Zahlenfeld, das `0` sein darf, verwirft einen gültigen Wert. |
| `mapping/parallel-arrays.ts` | Ungleiche Längen müssen **vor** dem Request scheitern, mit einer Meldung, die die Längen nennt. |
| `mapping/order.ts` | Alle drei Syntaxen, je Endpunkt die richtige. Ein falsches Format erzeugt sonst einen nichtssagenden 400er. |
| `http/rate-limiter.ts` | Zehn gleichzeitige Aufrufe dürfen nicht gemeinsam durchlaufen. Prüfung über eine kontrollierte Uhr. |
| `http/retry.ts` | Lesend wiederholt, schreibend nie. Jeder Versuch zieht ein Token. |
| `errors/classify.ts` | Mindestens ein Fall je der acht in `fehlercodes.md` Abschnitt C genannten mehrdeutigen Codes, jeweils an zwei verschiedenen Pfaden mit verschiedener Bedeutung. |
| `config/redact.ts` | Die drei Geheimnisse in jeder erdenklichen Verpackung: als Teilzeichenkette, base64-kodiert, in einer URL, in einem JSON-Fragment. |
| `generated/version.ts` | Die Stelle, die im Fehlerfall stumm bleibt: Meldet die Versionsermittlung `"unknown"`, merkt das sonst niemand, weil die Ermittlung jeden Fehler schluckt. |

### 9.5 Integrationstest

Der gebaute Server wird als Prozess gestartet, ein echter MCP-Client verbindet sich über stdio und
führt aus: `initialize`, `tools/list`, mindestens ein `tools/call` je Klasse. Ein `tsc --noEmit`
fängt die Importpfad- und Verpackungsfallstricke nicht (`mcp-sdk-typescript.md` 10.4 Punkt 12).

Zusätzlich, und das ist aus dem Blickwinkel Verbreitung der wichtigste Test des Projekts:

**Der Paketprobelauf.** In der CI wird `npm pack` ausgeführt, das Tarball in ein leeres Verzeichnis
installiert und von dort gestartet, so wie ein Nutzer es über npx täte:

1. `npm pack` und Prüfung der enthaltenen Dateiliste gegen eine erwartete Liste. Kein `src`, kein
   `test`, keine Karte ausser den Sourcemaps, keine `.env`.
2. Installation aus dem Tarball in ein Wegwerfverzeichnis.
3. `bbutler-mcp --version` muss die Version aus `package.json` ausgeben. Prüft Shebang,
   Dateimodus 755 und die `bin`-Auflösung in einem Zug.
4. `bbutler-mcp` ohne Zugangsdaten starten: muss mit Rückgabewert 1 und der Meldung aus 6.3
   abbrechen, nicht hängen bleiben.
5. `bbutler-mcp` mit Testzugangsdaten und MockAgent-Ersatz über `BB_BASE_URL` gegen einen lokalen
   Server: `initialize` und `tools/list` müssen innerhalb eines Zeitlimits antworten. Das Zeitlimit
   ist 5 Sekunden und damit die Hälfte des Codex-Startzeitlimits; reisst es, fällt die CI.
6. Die Startzeit wird gemessen und als Zahl ins Protokoll geschrieben. Sie ist damit über die
   Versionen hinweg verfolgbar, statt einmal vermutet zu werden.

### 9.6 Der Vertragslauf gegen die echte API

`pnpm run contract:read`. Läuft **nicht** in der öffentlichen CI und braucht echte Zugangsdaten aus
der Umgebung. Er ruft die 15 lesenden Endpunkte je einmal mit minimalen Parametern auf und
vergleicht **die Feldmenge** der Antwort mit der im Register hinterlegten Erwartung. Ausgegeben
wird eine Liste neuer, fehlender und typveränderter Felder.

Das ist die Antwort auf die Frage "wie merkt das Projekt, dass die API sich geändert hat". Die
Spezifikationsdatei wird nicht gepflegt und ist nachweislich unvollständig; die Wirklichkeit ist
das, was zurückkommt. Der Lauf gehört in die Vorbereitung jeder Veröffentlichung und in eine
Zeile der `CONTRIBUTING.md`.

Er ist hart abgesichert: Erlaubnisliste aus dem Register, Wurf bei jedem anderen Pfad, kein einziger
schreibender Aufruf, und er schreibt keine Geschäftsdaten in eine Datei, sondern nur Feldnamen und
Typen.

---

## 10. Gliederung der README

Deutsch, echte Umlaute, keine Emojis. Aufbau nach `distribution.md` 17: Abgrenzung oben, zwei
Wege zur Wahl, Fehlersuchtabelle, Verifikationsschritt, nicht unterstützte Clients mit
Begründung. Zielleser ist ein Buchhalter oder Kanzleimitarbeiter, nicht ein Entwickler.

```
# BuchhaltungsButler MCP (inoffiziell)

> Warnhinweis, ganz oben, nicht unten:
>   - Inoffizielles Projekt, keine Verbindung zum Anbieter.
>   - Dieser Server kann echte Buchhaltungsdaten anlegen, Ã¤ndern und lÃ¶schen.
>   - Kein Ersatz fÃ¼r steuerliche Beratung.
>   - Dein Steuerberater bekommt, was hier gebucht wird.

1. Was das ist
   Drei Saetze plus ein Beispielsatz, den man in Claude tippen kann.
2. Voraussetzungen
   Node ab 22.12, ein BuchhaltungsButler-Konto mit API-Zugang, die drei Werte und wo sie stehen.
3. Schnellstart in fuenf Minuten
   Genau ein Block: npx -y @dennismenken/buchhaltungsbutler-mcp setup
   Darunter, was der Assistent fragt, und der Verifikationssatz fÃ¼r den Client.
4. Installation je Client, als aufklappbare Abschnitte, jeweils "waehle einen Weg"
   4.1  Claude Code          Befehl claude mcp add-json, die drei Scopes erklaert
   4.2  Claude Desktop       a) .mcpb hineinziehen  b) claude_desktop_config.json von Hand
                             mit Tastenkombination zum Ordner, TextEdit-Hinweis, Neustart-Hinweis
   4.3  OpenAI Codex CLI     codex mcp add, mit startup_timeout_sec = 30
   4.4  ChatGPT-Desktop-App  Ã¼ber dieselbe Codex-Konfiguration
   4.5  Grok Build           grok mcp add
   4.6  Cursor               ~/.cursor/mcp.json, mit ${env:...}
   4.7  VS Code mit Copilot  code --add-mcp oder .vscode/mcp.json mit inputs
   4.8  Windsurf, Zed, Cline, Continue, LM Studio, Jan
   4.9  Beliebiger anderer Client, generische Form
   4.10 ChatGPT im Browser: nicht unterstuetzt, mit Begruendung
5. Statt npx: feste Installation
   npm install -g, absoluter Pfad, warum das im Dauerbetrieb besser ist.
6. Umgebungsvariablen
   Die Tabelle aus Abschnitt 6.1 dieses Plans, Pflicht und optional getrennt.
7. Nur lesen erlauben
   BB_READ_ONLY, Vorgabe aus, was dann geht und was nicht, der Berichtsvorbehalt.
8. Was der Server kann
   Die 54 Werkzeuge, nach Ressource gruppiert, mit Wirkung und deutschem Titel.
   Erzeugt aus dem Register, nicht von Hand gepflegt.
9. Sicherheit und Datenschutz
   Wohin die Zugangsdaten gehen, was im Protokoll landet, was nie in einer Meldung steht,
   warum es keine Kommandozeilenoption fÃ¼r den SchlÃ¼ssel gibt,
   warum Dateiupload und URL-Upload standardmaessig aus sind.
10. Bekannte Einschraenkungen
    Die beiden live defekten Einzelabruf-Endpunkte mit Datum und Ersatzverfahren.
    Keine Gesamttrefferzahl in der API. Kein Idempotenzschluessel, deshalb kein Retry.
    Das Minutenlimit ist mit anderen Anwendungen geteilt.
11. Fehlersuche
    Tabelle mit Symptom, Ursache, Abhilfe. Mindestens:
      Server erscheint nicht im Client        -> Neustart, Pfad, doctor
      "Server disconnected"                   -> Logdateipfade je Client
      Startet nicht, keine Meldung sichtbar   -> wo stderr landet, je Client
      "BB_API_SECRET fehlt"                   -> env-Abschnitt der Konfiguration
      401 error_code 3 gegen 4                -> welcher der drei Werte falsch ist
      which bbutler-mcp findet nichts         -> PATH, absoluter Pfad
      Alles langsam oder abgelehnt            -> Minutenlimit, BB_RATE_LIMIT_PER_MINUTE
12. Entwicklung
    Lokaler Klon, Bauen, Testen, und der eine Absatz, der zaehlt:
    "Einen neuen Endpunkt nachruesten" in fuenf Schritten.
13. Lizenz, Kennzeichnung, Haftungsausschluss
```

Drei Festlegungen zur README, alle aus dem Blickwinkel Verbreitung:

- **Der Schnellstart ist genau ein Block.** Wer scrollen muss, um den ersten Befehl zu finden, ist
  schon halb weg. Alles Weitere steht darunter.
- **Abschnitt 8 wird erzeugt.** Die Werkzeugtabelle entsteht aus dem Register über
  `pnpm run docs:tools` und wird in der CI auf Aktualität geprüft. Eine von Hand gepflegte Liste von
  54 Werkzeugen ist nach der dritten Version falsch.
- **Der Abschnitt "Einen neuen Endpunkt nachrüsten"** steht in der README und nicht nur in
  `CONTRIBUTING.md`, weil er die Struktur des Projekts in fünf Zeilen erklärt und damit auch dem
  Leser hilft, der nur wissen will, wie das Ding gebaut ist:
  1. `pnpm generate` nach dem Aktualisieren der Spezifikationsdatei.
  2. Neue Datei unter `src/registry/tools/`, Name gleich Werkzeugname.
  3. `pnpm test` läuft und sagt, welche Parameter noch fehlen.
  4. Klasse setzen, `verifyWith` setzen, Beschreibung schreiben.
  5. `pnpm test` ist grün. Fertig. Es gibt keinen sechsten Schritt.
---

## 11. Bau, Auslieferung, CI und das Update-Problem

Dieser Abschnitt ist nicht in der Auftragsliste gefordert, gehört aber zum Blickwinkel dieses
Entwurfs und ist für einen Implementierungs-Agenten genauso abarbeitbar wie der Rest.

### 11.1 Werkzeugkette

Übernommen aus `docs/entwicklung/toolchain.md` Abschnitt 12, mit einer offenen Entscheidung.

| Rolle | Paket | Version |
| --- | --- | --- |
| Laufzeit | Node | `>=22.12.0` |
| Protokoll | `@modelcontextprotocol/server` | `2.0.0` exakt (Variante A) |
| Protokoll, Rückfall | `@modelcontextprotocol/sdk` | `1.30.0` exakt (Variante B) |
| HTTP-Ergänzung | `undici` | `^8.10.2` |
| Typen | `typescript` | `6.0.3` exakt, devDependency |
| Bau | `tsdown` | `0.23.0`, devDependency |
| Tests | `vitest`, `@vitest/coverage-v8` | `^5.0.0`, devDependency |
| Lint | `eslint`, `typescript-eslint` | `^10.10.0`, `^8.70.0`, devDependency |
| Formatierung | `@biomejs/biome` | `^2.5.13`, devDependency |
| Schema-Gegenprobe | `zod` | `^4.6.2`, **devDependency**, nicht produktiv |

**Laufzeitabhängigkeiten: zwei.** Das MCP-Paket und `undici`. `zod` steht bei dieser Architektur
nicht in `dependencies`, weil die Schemaschicht aus 4.5 es nicht braucht; es kommt gegebenenfalls
transitiv mit dem SDK, aber nicht auf unsere Rechnung. Wird die SDK-Linie v1 gewählt, wandert `zod`
in `dependencies`, weil der Zod-Adapter dann produktiv läuft. Das ist die einzige Stelle, an der die
SDK-Entscheidung die Abhängigkeitsliste berührt.

**Offen und in der Planungsphase zu entscheiden: v1 oder v2.** `mcp-sdk-typescript.md` 10.1
empfiehlt v2 mit fünf belegten Gründen und nennt vier Gegenargumente, darunter das schwerste: Die
Kompatibilität der real eingesetzten Clients mit v2-Servern ist **nicht geprüft**. Aus dem
Blickwinkel Verbreitung ist genau das die entscheidende Frage, denn ein Server, den Claude Desktop
nicht lädt, ist wertlos. **Empfehlung dieses Plans: v2, aber erst nach einem Beleg.** Arbeitspaket 1
enthält dafür eine halbe Stunde: einen Wegwerf-Server mit einem Werkzeug unter v2 bauen und in
Claude Desktop, Claude Code und Codex CLI laden. Antworten alle drei, gilt v2. Antwortet einer
nicht, gilt v1 vollständig, ohne Mischung. Die Schemaschicht aus 4.5 macht den Wechsel zu einer
Änderung an genau einer Datei.

### 11.2 Bau

`tsdown` erzeugt zwei Ausgaben: `dist/cli.js` als `bin`-Ziel mit Shebang `#!/usr/bin/env node` und
Dateimodus 755, und `dist/index.js` für den programmatischen Export. Gebündelt, weil eine gebündelte
Ausgabe beim Kaltstart weniger Modulauflösungen braucht als eine je Quelldatei
(`toolchain.md` 4.1). `tsc` läuft nur als `tsc --noEmit` für die Typprüfung, nie als
Auslieferungsbau. Kein Transpiler zur Laufzeit im veröffentlichten Paket.

Setzt `tsdown` den Dateimodus nicht selbst, folgt im `build`-Skript ein `chmod 755 dist/cli.js`.
Der Pfad muss exakt auf die in `bin` eingetragene Datei zeigen; der Mischzustand aus `bin` auf
`dist/cli.js` und `chmod` auf `dist/index.js` ist ausgeschlossen (`mcp-sdk-typescript.md` 10.3).
Nachgewiesen wird beides nicht durch Behauptung, sondern durch Schritt 3 des Paketprobelaufs aus 9.5.

`package.json`: `"type": "module"`, `"files": ["dist"]`, **genau ein** `bin`-Eintrag
`{"bbutler-mcp": "./dist/cli.js"}`. Ein zweiter Eintrag mit abweichendem Ziel würde jeden kurzen
npx-Aufruf in der README brechen (`distribution.md` 12.1).

### 11.3 Paketgrösse und Startzeit als geprüfte Budgets

Beides wird nicht gehofft, sondern gemessen und in der CI durchgesetzt.

| Budget | Grenze | Prüfung |
| --- | --- | --- |
| Tarball gepackt | 500 KB | `scripts/check-size.ts` nach `npm pack`, bricht bei Überschreitung ab |
| Tarball entpackt | 2 MB | ebenda |
| Laufzeitabhängigkeiten | höchstens 2 direkte | Test gegen `package.json` |
| Startzeit bis `tools/list` | 5 s über npx aus dem Tarball | Schritt 5 des Paketprobelaufs |

Die vier Zahlen sind **gesetzte Ziele, keine Messungen**. Sie werden beim ersten grünen Bau gegen
die tatsächlichen Werte gehalten und dann festgeschrieben. Der Zweck ist nicht die Zahl, sondern
dass eine Verdopplung auffällt, bevor ein Nutzer sie spürt.

### 11.4 CI

`ci.yml`, bei jedem Push und Pull Request:
Matrix Node 22 und 24, `fail-fast: false`, `permissions: contents: read`, Abhängigkeiten aus dem
eingecheckten Lockfile. Schritte: Generatorlauf plus Prüfung auf leere Differenz, `tsc --noEmit`,
`eslint`, `biome format --check`, `vitest run --coverage`, Bau, Paketprobelauf aus 9.5,
Grössenprüfung, Dokumentationsprüfung (erzeugte Werkzeugtabelle gegen README).

`publish.yml`, ausgelöst durch ein Tag `v*.*.*`:
Tag gegen `version` in `package.json` abgleichen und bei Abweichung abbrechen; vollständiger
CI-Durchlauf; **`.mcpb` bauen, bevor `npm publish` läuft**, damit ein Verpackungsfehler den
unumkehrbaren Schritt blockiert statt ein veröffentlichtes Paket ohne passendes Release zu
hinterlassen; `npm publish --provenance --access public` über OIDC Trusted Publishing, ohne
langlebiges Token; GitHub-Release mit dem `.mcpb` als Anhang und dem Abschnitt aus `CHANGELOG.md`
als Text. Alle drei Punkte sind bewusst gesetzt: Sie verhindern ein Release ohne passendes
Paket, ein Paket ohne passendes Release und ein langlebiges Veröffentlichungs-Token.

**Verpackungswerkzeuge werden aus `node_modules` aufgerufen, nie über `npx`.** `npx mcpb` fiele bei
fehlender Abhängigkeit auf das unscoped Registry-Paket `mcpb` zurück, einen Namen, den das Projekt
nicht kontrolliert, und das in einem Veröffentlichungsjob. Das ist eine reale Lieferkettenlücke;
die Begründung steht als deutscher Kommentar in `scripts/build-mcpb.ts`.

`drift.yml`, wöchentlich und manuell auslösbar: Generatorlauf und Differenzprüfung, Grössenprüfung,
`npm outdated` als Bericht. Dependabot wöchentlich für npm und für GitHub Actions.

**Vor der ersten Veröffentlichung, Pflichtschritt** (`distribution.md` 15.4): Angemeldet auf
npmjs.com prüfen, ob der Namensraum `@dennismenken` zum eigenen Konto gehört. Ein HTTP 404 auf den
gescopten Paketnamen ist dafür **kein** Beleg. Gehört er nicht dazu, ist `dennismenken` als
Organisation anzulegen. Erst danach `npm publish --access public`.

### 11.5 Das Update-Problem

Vier Arten von Änderung, vier Antworten. Keine davon verlässt sich darauf, dass jemand aufpasst.

| Was sich ändert | Wie das Projekt es merkt | Was dann zu tun ist |
| --- | --- | --- |
| **Ein neuer Endpunkt** in der Spezifikation | Registerprüfung 1 schlägt nach `pnpm generate` fehl und nennt den Pfad | Eine neue Datei unter `src/registry/tools/`, fünf Schritte aus 10 |
| **Ein neuer Parameter** an einem bestehenden Endpunkt | Registerprüfung 3 schlägt fehl und nennt Pfad und Parametername | Eintrag in die Überlagerung, mit Beschreibung, oder `omit` mit Begründung |
| **Ein neues Antwortfeld** | Die Spezifikation sagt dazu nichts. Zwei Melder: der Vertragslauf aus 9.6 nennt es beim nächsten Lauf, und der laufende Server schreibt es bei `BB_LOG_LEVEL=debug` einmal je Prozesslauf auf stderr | Feldliste im Register ergänzen, falls das Feld normalisiert werden soll. Bis dahin wird es unverändert durchgereicht, es geht nichts verloren. |
| **Ein geändertes Verhalten** (Fehlercode, Grenze, Format) | Nur über die Praxis oder über einen Lauf des Vertragstests | Golden-Datei aktualisieren, Katalogeintrag ergänzen, `CHANGELOG.md` |

Zwei Eigenschaften machen diese Antworten tragfähig:

- **Antwortschemata sind offen** (7.1). Eine Erweiterung der API kann keinen einzigen Aufruf
  scheitern lassen. Das ist der Unterschied zwischen "das Projekt braucht ein Update" und "das
  Projekt ist kaputt, bis jemand ein Update macht".
- **Die Spezifikationsdatei ist gepinnt und eingecheckt.** Sie ist nicht die Wahrheit, sondern der
  letzte bekannte Stand. Die Wahrheit ist, was zurückkommt; deshalb der Vertragslauf. Ob der
  Anbieter die Spezifikation überhaupt unter einer stabilen Adresse veröffentlicht und ob sie
  automatisch abholbar wäre, ist **nicht verifiziert** und wird in 13 als offener Punkt geführt.

### 11.6 Lizenz und Abgrenzung

MIT. In der README und in der Paketbeschreibung steht "inoffiziell" beziehungsweise "unofficial" an
erster Stelle. Fremder Quelltext wird für die Implementierung **nicht geöffnet**; zulässige
Grundlage sind ausschliesslich die Dossiers unter `docs/` und die eigenen Messungen.

Der genaue Rechtsträger hinter "BuchhaltungsButler" ist **nicht verifiziert**
(`toolchain.md` 11.2) und vor der Veröffentlichung im Impressum des Anbieters zu prüfen.

---

## 12. Arbeitspakete

Zwölf Pakete. Die Spalte "hängt ab von" nennt nur echte Abhängigkeiten; alles andere läuft parallel.
Nach AP0 können vier Stränge gleichzeitig laufen.

| AP | Inhalt | Hängt ab von | Liefert |
| --- | --- | --- | --- |
| **0** | **Gerüst.** Repository, `package.json` mit genau einem `bin`, `tsconfig`, `tsdown`, `eslint`, `biome`, `vitest`, leerer `src/cli.ts`, der `--version` ausgibt, CI mit Typecheck und Paketprobelauf. Dazu die halbe Stunde SDK-Beleg aus 11.1: Wegwerf-Server unter v2 in drei Clients laden. | – | Ein installierbares, leeres Paket, das über npx startet. Die SDK-Entscheidung, belegt. |
| **1** | **Generator und Register-Typen.** `scripts/gen-endpoints.ts`, `scripts/gen-errors.ts`, `scripts/gen-version.ts`, `src/registry/types.ts`, `src/registry/classes.ts`, `src/generated/*`. Registerprüfungen 1 bis 3 als Test, zunächst gegen ein leeres Register und damit rot. | 0 | Die Datenbasis. Ab hier ist jeder fehlende Parameter sichtbar. |
| **2** | **Schemaschicht.** `src/schema/*` einschliesslich Validator, JSON-Schema-Erzeugung, Standard-Schema-Adapter, Zod-Gegenprobe im Test. | 1 | Aus einem Registereintrag wird ein gültiges Schema. |
| **3** | **Konfiguration.** `src/config/*`, alle Variablen aus 6.1, Auflösungsreihenfolge, Startprüfung mit den Meldungstexten, Schwärzung, Zugangsdatendatei mit Rechteprüfung. | 0 | Der Server bricht mit brauchbaren Meldungen ab, statt zu schweigen. |
| **4** | **HTTP-Schicht.** `src/http/*`, Dispatcher, Client, Umschlag, Content-Type-Prüfung, Rate-Limiter, Retry-Politik getrennt nach Klasse. Tests gegen MockAgent mit den Golden-Dateien. | 0, 3 | Ein Aufruf geht raus und kommt geprüft zurück. |
| **5** | **Fehlerschicht.** `src/errors/*`, Katalog dynamisch geladen, Einordnung in fünf Klassen, Sonderfälle aus 5.6, Meldungsaufbau mit dem Pflichtsatz zum Datenzustand. | 1, 4 | Jeder API-Fehler wird zu einer Meldung, aus der ein Agent den nächsten Schritt ableitet. |
| **6** | **Übersetzung und Antwort.** `src/mapping/*` und `src/response/*`: die drei `order`-Syntaxen, parallele Arrays mit Längengleichheit, Normalisierung ohne Feldverlust, Tabellen, Kürzung, Seitenhinweis mit den drei Zuständen. | 2, 4 | Aus Werkzeugeingabe wird ein Body und aus einer Antwort eine brauchbare Ausgabe. |
| **7** | **Server und generischer Handler.** `src/server/*`, `instructions`, Torwächter `src/guards/*`, sauberes Herunterfahren, Signalbehandlung. Registrierung gegen ein Register mit **drei** Beispieleinträgen, je einem lesenden, anlegenden und löschenden. | 2, 3, 4, 5, 6 | Ein lauffähiger Server mit drei Werkzeugen. Ab hier ist der Ausführungspfad fertig und ändert sich nicht mehr. |
| **8a** | **Die 15 lesenden Registereinträge.** Beschreibungen, Enums, Grenzen, `concise`-Spalten, Golden-Dateien. | 7 | Ein Server, der vollständig auswerten kann. |
| **8b** | **Die 17 Einträge der Klasse A und die 4 der Klasse M.** Dazu `verifyWith`, Stapelgrenzen, Duplikatshinweis. | 7 | Anlegen und Ändern. |
| **8c** | **Die 9 Einträge der Klasse B, die 7 der Klasse D und die 2 der Klasse AR.** Dazu die Berichtsbesonderheiten und die Formulierungen für die dringend freigabebedürftigen Werkzeuge. | 7 | Vollständige 54. Registerprüfung 1 wird grün. |
| **9** | **Belegupload.** `src/upload/*`: base64 als Vorgabe, `https://` hinter `BB_UPLOAD_FROM_URL` mit Prüfung über jeden Weiterleitungssprung, Magic-Byte-Erkennung, laufende Bytezählung, Dateinamen bereinigen; `file://` hinter `BB_UPLOAD_DIRS` mit `realpath`, `O_NOFOLLOW` und Prüfungen am selben Deskriptor. Fehlermeldungen ohne Dateisystemdetails. | 8b | `bb_receipts_upload` ist verantwortbar benutzbar. |
| **10** | **CLI.** `src/cli/*`: `setup` mit acht Schritten, `doctor`, `test`, `profiles`, `print-config`, `uninstall`, die zwölf Clientadapter, eigene maskierte Eingabe ohne Zusatzabhängigkeit. | 3, 4 | Der Fünf-Minuten-Weg aus E5. |
| **11** | **Verpackung und Veröffentlichung.** `.mcpb`-Bau aus dem Register, `publish.yml` mit Trusted Publishing, Grössen- und Startzeitbudget festschreiben, Namensraum prüfen, `CHANGELOG.md` anlegen. | 8c, 10 | Ein veröffentlichbares Paket. |
| **12** | **Dokumentation und Abnahme.** README nach 10, `SECURITY.md`, `CONTRIBUTING.md`, `.env.example`, erzeugte Werkzeugtabelle, Vertragslauf einmal ausführen, Abnahmeliste aus `tool-design.md` 11 abhaken. | 11 | Auslieferungsfähig. |

**Parallelisierung.** Nach AP0 laufen vier Stränge gleichzeitig:
Strang I `1 → 2`, Strang II `3 → 4 → 5`, Strang III `10` (braucht nur 3 und 4), Strang IV
Testinfrastruktur und Golden-Dateien. AP6 und AP7 führen zusammen. Die drei Pakete 8a, 8b und 8c
sind die eigentliche Fleissarbeit, hängen nur von AP7 ab und lassen sich auf drei Bearbeiter
aufteilen, weil die 54 Dateien einander nicht berühren. AP9 und AP10 laufen daneben.

**Der Kettenkritische Pfad** ist `0 → 1 → 2 → 7 → 8c → 11 → 12`. Alles andere hat Puffer.

---

## 13. Risiken und offene Punkte

### 13.1 Risiken dieses Entwurfs

| Risiko | Bewertung | Gegenmassnahme |
| --- | --- | --- |
| **Der selbst geschriebene Validator hat einen Fehler.** Ein zu weiter Validator lässt eine ungültige Buchung durch, ein zu enger blockiert eine gültige. | Das grösste technische Risiko dieses Entwurfs. Es ist der Preis für die Datenquelle aus einer Hand. | Gegenprobe gegen Zod über einen Korpus aus gültigen und ungültigen Eingaben (4.5). Der Schematyp ist bewusst klein gehalten. Wird die Gegenprobe untragbar, ist der Rückfall auf Zod eine Änderung an einer Datei. |
| **54 Werkzeugdefinitionen sprengen das Kontextbudget.** `tool-design.md` 10.3 setzt 10.000 Token für alle Definitionen zusammen an und ging dabei von 34 Werkzeugen aus. | Bei 54 Werkzeugen und 60 bis 220 Wörtern Beschreibung je Werkzeug ist das Budget mit hoher Wahrscheinlichkeit nicht zu halten. **Nicht gemessen.** | Früh messen, spätestens nach AP8a. Drei Hebel, in dieser Reihenfolge: Beschreibungen an der unteren Wortgrenze halten, `title` knapp, und die Client-Fähigkeit Deferred Loading unterstützen, indem Namen und Beschreibungen durchsuchbar sind. Werkzeuge zusammenzulegen ist **kein** Hebel, E1 steht dem entgegen. |
| **Die SDK-Linie v2 wird von einem realen Client nicht geladen.** | Unbelegt, aber existenzbedrohend für die Verbreitung. | AP0 enthält den Beleg vor jeder anderen Arbeit. Die Schemaschicht macht den Wechsel billig. |
| **Der Namensraum `@dennismenken` gehört nicht zum eigenen Konto.** | Blockiert die Veröffentlichung vollständig. | Pflichtschritt vor AP11, nicht danach. Rückfallkandidaten stehen in `distribution.md` 15.5 und sind unmittelbar vor der Veröffentlichung erneut zu prüfen. |
| **Der bin-Name `bbutler-mcp` ist von einem anderen Paket belegt.** Ein freier Paketname belegt nicht, dass der bin-Name frei ist. | Gering, aber nicht ausgeschlossen; eine vollständige Prüfung der Registry ist nicht möglich. | Tritt es auf, ist nur `package.json` und die README zu ändern. Der Paketname bleibt. |
| **Das geteilte Minutenlimit.** Der Server teilt sich 100 Anfragen je Minute mit jeder anderen Anwendung desselben Mandanten, darunter die Weboberfläche. | Der Eimer mit 60 hilft, löst es aber nicht. Was der Server bei einer Überschreitung zurückbekommt, ist **nicht verifiziert**: 429 kommt in der Spezifikation nicht vor. | Defensiv auf 403/15, 429 und 5xx gleichermassen vorbereitet sein. Der Duplikatshinweis ist abschaltbar, weil er je Aufruf ein zusätzliches Kontingent kostet. |
| **Die Duplikatsprüfung verbraucht Kontingent und kann falsch liegen.** Ob sich der Bestand über die Suchendpunkte genau genug abfragen lässt, ist **nicht verifiziert** (`tool-design.md` 9.6). | Mittel. Ein falscher Hinweis ist ärgerlicher als kein Hinweis. | Sie blockiert nie. Sie ist über `BB_DUPLICATE_CHECK` abschaltbar. Vor AP8b ist je Werkzeug zu prüfen, ob ein tragfähiges fachliches Schlüsselpaar existiert; wo nicht, bleibt sie aus. |
| **Zwölf Clientadapter altern schneller als der Rest.** Pfade und CLI-Befehle ändern sich; mehrere davon sind in `distribution.md` 16 bereits als **nicht verifiziert** geführt (LM Studio, Jan, Cline-IDE, Zed). | Hoch, und es ist die Hauptquelle künftiger Fehlerberichte. | Die Adapter sind nach Vertrauen gestaffelt: CLI-Aufruf, dann JSON-Datei, dann nur Ausgeben. Wo der Pfad nicht dokumentiert ist, wird nichts geschrieben. Jeder Adapter prüft vor dem Schreiben, ob die Datei existiert, und gibt sonst nur aus. |
| **npx-Kaltstart reisst das Startzeitlimit der Codex CLI.** Die Vorgabe dort sind 10 Sekunden, die Kaltstartdauer ist **nicht gemessen**. | Real. Erfahrungswerte liegen im Bereich mehrerer Sekunden. | `startup_timeout_sec = 30` wird vom Assistenten für Codex immer gesetzt. Der Paketprobelauf misst die Startzeit ab AP0 und macht eine Verschlechterung sichtbar. Die globale Installation wird als Weg für den Dauerbetrieb empfohlen. |
| **Der Server schreibt versehentlich auf stdout.** Ein einziger `console.log` in einer Abhängigkeit oder im eigenen Code zerstört die Protokollverbindung. | Klassischer, schwer zu findender Fehler. | `no-console` in ESLint mit Ausnahme für `error`; alle Ausgaben über `src/logging/stderr.ts`; ein Integrationstest prüft, dass ein vollständiger Werkzeugaufruf auf stdout ausschliesslich gültige JSON-RPC-Zeilen erzeugt. |

### 13.2 Offene Punkte, die vor oder während der Umsetzung zu klären sind

| Punkt | Stand | Nächster Schritt |
| --- | --- | --- |
| `/receipts/get/id_by_customer` | **Live unbenutzbar**, sechs Varianten gescheitert: vier aus `belege.md` 4.5, zwei in diesem Plan (Array mit String, Array mit Zahl). | Die letzte ungetestete Variante prüfen: die Kennung als **Pfadsegment**, also `POST /receipts/get/2`. Ein einzelner lesender Aufruf. Gelingt er, werden vier Endpunkte brauchbar, darunter der einzige Weg zu Fremdwährungsfeldern und Dateiinhalt. |
| `/transactions/get/id_by_customer` | **Live HTTP 404 mit HTML-Körper**, Pfad in der erreichbaren Umgebung nicht geroutet. | Dieselbe Pfadsegment-Prüfung, sonst beim Anbieter klären. Bis dahin das Ersatzverfahren über `/transactions/get` mit exklusiven Grenzen, das selbst **nicht verifiziert** ist. |
| Betragsformat: Dezimaltrenner, Tausendertrenner, Währung beim **Senden** | **nicht verifiziert**. Beim Empfangen ist String belegt. | Ein schreibender Testaufruf ist dafür nötig und in diesem Auftrag ausgeschlossen. Vor AP8b gegen eine Testumgebung klären oder beim Anbieter erfragen. Bis dahin sendet der Server den String unverändert, wie er in der Parameterbeschreibung gefordert wird. |
| Ob `account` an verschiedenen Endpunkten Unterschiedliches bedeutet | **nicht verifiziert** (`tool-design.md` 12) | Bei der Detailauswertung in AP8a bis 8c je Endpunkt klären; im Zweifel aufspalten in `bank_account` und `postingaccount_number`. |
| Ob `/postings/assign/receipt-to-free-posting` wiederholbar ist und ob sich die Zuordnung lösen lässt | **nicht verifiziert** | Beim Anbieter klären. Bis dahin Klasse B und `idempotentHint: false`, und die Beschreibung nennt die fehlende Umkehrbarkeit ausdrücklich. |
| Ob ein ersetzter Bericht eine neue `report_id_by_customer` bekommt und wie lange Berichtsdateien verfügbar bleiben | **nicht verifiziert** | Ein lesender Aufruf nach einem Erzeugungslauf. Betrifft Beschreibung und Antwort von `bb_reports_create_*`. |
| Polling-Intervall für die Berichtserzeugung | **Annahme** (`berichte.md` 2.4: exponentiell ab etwa zwei Sekunden) | Der Server pollt **nicht** selbst. Er nennt das Intervall in der Fehlermeldung zu `error_code` 8 und überlässt das Warten dem Agenten. Damit bleibt die Annahme folgenlos. |
| Maximale Dateigrösse und erwartete Kodierung bei `/receipts/upload` | **nicht verifiziert** | Vor AP9 aus der Spezifikation klären, sonst eine konservative Grenze setzen und sie in der Parameterbeschreibung nennen. |
| Ob die BuchhaltungsButler-API Schreibvorgänge dedupliziert | **nicht verifiziert** | Beim Anbieter erfragen. Solange offen, gilt: kein automatischer Retry, Duplikatshinweis statt Idempotenz. |
| Ob der Anbieter die OpenAPI-Datei unter einer stabilen Adresse veröffentlicht | **nicht verifiziert** | Prüfen. Falls ja, kann `drift.yml` sie wöchentlich abholen und gegen den gepinnten Stand vergleichen; das wäre der vierte Frühwarnmelder aus 11.5. Falls nein, bleibt es beim Vertragslauf. |
| Tokenkosten der 54 Werkzeugdefinitionen | **nicht gemessen** | Nach AP8a mit dem Token-Zähler der Anthropic-API zählen und gegen das Budget halten. Siehe das zweite Risiko in 13.1. |
| Kaltstartdauer von `npx -y` für dieses Paket | **nicht gemessen** | Beim ersten veröffentlichten Vorabpaket einmal real erheben und in die README schreiben. |
| Werte der Kürzungsgrenzen in Zeichen | **Annahme**, vier Zeichen je Token | Nach dem ersten Evaluationslauf gegen eine echte Zählung justieren. |
| SDK-Linie v1 oder v2 | **offen** (`toolchain.md` 15, `mcp-sdk-typescript.md` 10.1) | AP0, mit Ladeprobe in drei realen Clients. |
| `packageManager`: pnpm 12.4.1 gegen lokal vorhandene 10.34.3 | **Konflikt** (`toolchain.md` 13.2) | Vor AP0 entscheiden: lokale Installation aktualisieren oder das Feld auf die tatsächlich genutzte Version setzen. Ein `packageManager`-Feld, das auf eine nicht vorhandene Version zeigt, ist eine Startfalle für jeden Mitwirkenden. |
| Namensraum `@dennismenken` auf npm | **nicht verifiziert** (`distribution.md` 15.4) | Pflichtschritt vor AP11. |
| Rechtsträger hinter "BuchhaltungsButler" für den Abgrenzungstext | **nicht verifiziert** (`toolchain.md` 11.2) | Im Impressum des Anbieters nachsehen, vor AP12. |

### 13.3 Zwei Stellen, an denen dieser Plan bewusst von den Dossiers abweicht

Beide sind oben begründet und hier noch einmal zusammengezogen, damit sie in einem Review nicht
übersehen werden:

1. **`bb_receipts_get` und `bb_transactions_get` werden ausgeliefert**, obwohl `tool-design.md` 3.5
   das Gegenteil verlangt. Begründung in 3.4: E6, kein Release nötig, wenn der Anbieter den Defekt
   behebt, und die Ehrlichkeitspflicht wird über Beschreibung, Fehlerkatalog und README eingelöst
   statt über das Weglassen. Das Feld `deliverable` ist vorgesehen, falls sich das als falsch
   erweist.
2. **Die Variable heisst `BB_READ_ONLY`**, nicht `BB_MCP_READ_ONLY`. Begründung in 6.5. Der Altname
   wird mit Warnung akzeptiert; beide gleichzeitig und widersprüchlich gesetzt bricht ab.

### 13.4 Während dieser Arbeit gefundene Ungereimtheiten

Sie stammen nicht aus der Planungsaufgabe, gehören aber erfasst:

1. **Die Spezifikation hat 32 Array-Parameter ohne Elementtyp** (`items: null`), darunter alle
   parallelen Arrays der Buchungs- und Rechnungsendpunkte. Ein generischer Generator kann daraus
   nichts Gültiges erzeugen.
2. **Der `order`-Parameter von `/receipts/get`** trägt ein Objektschema mit der wörtlichen Property
   `field`; das ist ein Platzhalter, kein Feldname. Die tatsächlich erlaubten Felder stehen nur in
   der HTML-Beschreibung.
3. **`/settings/get/postingaccounts` liefert `parent_name` als `null`**, wo die Spezifikation einen
   String führt. Jede Normalisierung muss `null` tragen können.
4. **`/accounts/get` liefert keinen Mandantennamen.** Der in `distribution.md` 14.2 vorgesehene
   Bestätigungstext "Verbunden mit: …" ist so nicht baubar; der Ersatz steht in 8.2 Schritt 4.
   `distribution.md` sollte an dieser Stelle angeglichen werden.
5. **`tool-design.md` 9.3 und 11.8 widersprechen sich** bei den Annotationen lesender Werkzeuge
   ("n/a" gegen "alle vier explizit"). Aufgelöst in 3.3, Präzisierung 1.
6. **`tool-design.md` 11.1 verlangt "zwischen 28 und 34 Tools"**, was E1 aufhebt. Die Abnahmeliste
   in 11.1 ist entsprechend auf 54 zu ändern; die übrigen Punkte der Liste bleiben gültig.
7. **`toolchain.md` 9.1 nennt weiterhin den Namensraum `@init4`**, `distribution.md` 15.4 nennt
   diesen Widerspruch bereits und die Angleichung steht aus.
