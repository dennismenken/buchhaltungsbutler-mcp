# Implementierungsplan, Entwurf A: Korrektheit und Robustheit zuerst

**Stand:** 2026-09-12. **Blickwinkel:** Der Server muss unter allen Umständen das Richtige tun
und darf niemals stillschweigend falsche Buchhaltungsdaten erzeugen oder liefern. Wo
Bequemlichkeit und Korrektheit kollidieren, entscheidet dieser Entwurf für Korrektheit und
begründet es an der Stelle.

**Adressat:** ein Implementierungs-Agent, der diesen Plan ohne Rückfrage abarbeitet.

---

## 0. Geltung und Vorrang

Diese Datei ist ein Entwurf, kein Beschluss. Sie ordnet sich wie folgt ein:

1. **Die verbindlichen Entscheidungen des Projektinhabers (E1 bis E6)** haben Vorrang vor allem
   anderen. Wo ein Dossier etwas anderes sagt, gilt E1 bis E6.
2. **Live gemessene API-Wirklichkeit** hat Vorrang vor der Spezifikation
   `docs/openapi/buchhaltungsbutler-v1.json`. Die Spezifikation ist nachweislich handgepflegt,
   in Feldnamen teils falsch und in Typen widersprüchlich. Sie ist die Grundwahrheit über den
   *Umfang* der API (welche Pfade, welche Parameter), nicht über deren *Verhalten*.
3. **Die Dossiers unter `docs/`** gelten, soweit E1 bis E6 und die Live-Messung nichts anderes
   sagen. Jede Abweichung dieses Plans von einem Dossier ist unten ausdrücklich benannt und
   begründet.

**Abweichungen dieses Entwurfs von `docs/entwicklung/tool-design.md`** sind in
[Abschnitt 4.4](#44-abweichungen-von-tool-designmd) vollständig
aufgeführt. Es sind vier, alle Folge von E1.

---

## 1. Neue Live-Befunde dieses Entwurfs (2026-09-12)

Für diesen Entwurf wurden sechs lesende Aufrufe gegen die Produktivumgebung des Nutzers
abgesetzt. Keine schreibenden Aufrufe. Die Befunde ändern zwei Grundannahmen der bisherigen
Dossiers und sind deshalb vorangestellt.

### 1.1 Befund A: `id_by_customer` ist ein Pfadsegment, kein Body-Feld. Beide Einzelabruf-Endpunkte funktionieren.

Die Annahme, das Segment `id_by_customer` sei ein Platzhalter und kein literaler
Pfadbestandteil, ist **bestätigt**.

| Aufruf | Ergebnis |
| --- | --- |
| `POST /api/v1/receipts/get/<id>` mit Body `{"api_key": "..."}` | HTTP 200, `{"success":true,"message":"","data":{...}}` |
| `POST /api/v1/transactions/get/<id>` mit Body `{"api_key": "..."}` | HTTP 200, `{"success":true,"message":"","data":{...}}` |

Die `<id>` stammte jeweils aus einem vorangehenden Listenaufruf. Damit ist widerlegt, dass
`/receipts/get/id_by_customer` und `/transactions/get/id_by_customer` unbenutzbar sind
(`docs/api/belege.md` 4.5, `docs/api/transaktionen.md` 4.5, `docs/api/grundlagen.md` Stolperfalle
29, `docs/entwicklung/tool-design.md` Warnung unter 3.5). Der Fehler lag in der Aufrufform, nicht
im Endpunkt: Das Segment `id_by_customer` im Pfad ist ein Platzhalter ohne geschweifte Klammern,
kein literaler Pfadbestandteil.

**Folgen, alle für diesen Plan verbindlich:**

- `bb_receipts_get` und `bb_transactions_get` werden ausgeliefert. Der Toolsatz hat keine Lücke.
- Der Fremdwährungsablauf (`docs/api/grundlagen.md` 5.6, `docs/api/buchungen.md` 6.2) ist
  durchführbar: `bb_receipts_get` liefert `amount_original`, `currency_original` und
  `exchangerate`.
- Dieselbe Aufrufform gilt zwingend auch für `/receipts/delete/id_by_customer` und
  `/receipts/restore/id_by_customer`. Diese beiden sind **schreibend** und wurden deshalb
  **nicht** getestet. Der Plan behandelt sie als "gleiche Form, nicht verifiziert" und verlangt
  vor der Auslieferung einen Test gegen eine Wegwerf-Umgebung oder einen dafür angelegten
  Testbeleg (Arbeitspaket AP-13).
- Die vier betroffenen Pfade werden im Katalog nicht als Zeichenkette geführt, sondern als
  Pfadvorlage mit genau einem Platzhalter. Der eingesetzte Wert läuft durch
  `encodeURIComponent` und ist vorher auf `^[0-9]+$` geprüft. Beides ist Pflicht, siehe
  [Abschnitt 5.2](#52-pfadbau).

### 1.2 Befund B: Derselbe Sachverhalt hat je Endpunkt unterschiedliche Feldnamen und unterschiedliche JSON-Typen.

Das ist der schwerwiegendste Befund für die Antwortverarbeitung. Gemessen, nicht abgeleitet:

| Sachverhalt | `/receipts/get` (Liste) | `/receipts/get/<id>` (Einzel) |
| --- | --- | --- |
| Leistungsdatum | `delivery_date` | `date_delivery` |
| Fälligkeit | `due_date` | `date_payment_due` |
| Umschlag | `success`, `message`, `rows`, `data` (Array) | `success`, `message`, `data` (**Objekt**, **kein** `rows`) |

| Feld | `/receipts/*` | `/transactions/*` |
| --- | --- | --- |
| `id_by_customer` | JSON-**String** (`"2"`) | JSON-**Zahl** (`1234`) |
| `account` | JSON-**String** (`"1200"`) | JSON-**Zahl** (`1201`) |

Weitere gemessene Typen: `amount` durchgehend String mit Punkt und zwei Nachkommastellen
(`"884.65"`, `"-192.44"`), `deleted` als String `"0"`, `vat` als String `"19.00"`,
`e_invoice_type` als Zahl `0`, nicht gesetzte Felder durchgehend als JSON-`null`.

**Folge:** Eine gemeinsame, endpunktübergreifende Antworttypisierung ist unmöglich. Der
Antwortvertrag wird **je Endpunkt** geführt, nicht je Fachobjekt. Wer einen gemeinsamen
`Receipt`-Typ baut, produziert genau den stillen Datenfehler, den dieser Entwurf verhindern
soll: ein `due_date`, das beim Einzelabruf immer `undefined` ist, sieht aus wie "keine
Fälligkeit" und ist in Wahrheit "falscher Feldname".

### 1.3 Befund C: `order` bei `/postings/get` ist tatsächlich case sensitive.

`{"order": "date asc"}` antwortete mit HTTP 400 und
`{"success":false,"error_code":17,"message":"invalid order specified"}`. Die Angabe in
`docs/api/grundlagen.md` 5.3 ist bestätigt. Damit ist zugleich `(/postings/get, 17)` als
Eingabefehler des Agenten in der Fehlertabelle belegt.

### 1.4 Befund D: `/settings/get/postingaccounts` akzeptiert `limit`, `offset` und `order`.

Ein Aufruf mit `limit=3`, `offset=1`, `order="postingaccount_number ASC"` lieferte HTTP 200 und
`rows=3`. Ein Werkzeug, das diese drei Parameter nicht anbietet, verschenkt also eine
Fähigkeit der API; die Beschränkung liegt nicht an der Schnittstelle.
Felder der Antwort: `postingaccount_number`, `name`, `type`, `subtype`,
`parent_postingaccount_number`, `parent_name`, alle String oder `null`.

### 1.5 Was diese sechs Aufrufe nicht geklärt haben

Ausdrücklich **nicht verifiziert** und in [Abschnitt 14](#14-risiken-und-offene-punkte) geführt:
das Verhalten aller schreibenden Endpunkte, die Obergrenzen von `limit` bei den drei
`settings`-Listen, die Antwort beim Reißen des Minutenlimits, das Verhalten bei ungleich langen
parallelen Arrays und die Frage, ob `/receipts/get/<id>` mit `get_file: true` funktioniert.

---

## 2. Leitidee und Architektur

### 2.1 Die Leitidee in drei Sätzen

Der Server ist eine **überprüfbare Übersetzungsschicht**: Jeder der 54 API-Endpunkte wird von
genau einem Werkzeug abgebildet, dessen Eingabeschema, Annotationen, Antwortvertrag und
Fehlertabelle in **einem einzigen Katalogeintrag** zusammenstehen, so dass ein Test jeden
Eintrag gegen die OpenAPI-Datei aufrechnen kann. Zwischen Werkzeug und HTTP liegt eine schmale,
dumme Transportschicht, die nichts über Buchhaltung weiß, dafür aber jede Annahme über das
Antwortformat prüft, bevor ein Wert weitergereicht wird. Alles, was die API anders macht als
ihre Spezifikation, steht an genau einer Stelle im Katalog und nirgendwo sonst im Code.

### 2.2 Schichten

Sieben Schichten, von außen nach innen. Jede Schicht kennt nur die nächstinnere.

| # | Schicht | Verantwortung | Kennt **nicht** |
| --- | --- | --- | --- |
| 1 | **Transport** (`src/server.ts`) | MCP über stdio, `initialize`, `tools/list`, `tools/call`, Abbruchsignale, sauberes Herunterfahren | Buchhaltung, HTTP |
| 2 | **Registrierung** (`src/tools/register.ts`) | Liest den Katalog und meldet daraus 54 Werkzeuge mit `title`, `description`, `inputSchema`, `outputSchema`, `annotations` an | einzelne Endpunkte |
| 3 | **Werkzeughülle** (`src/tools/handler.ts`) | Ein einziger generischer Handler: Schalterprüfung, Eingabevalidierung, Vorbedingungsprüfungen, Aufruf, Antwortaufbereitung, Fehlerübersetzung | den konkreten Endpunkt (bekommt ihn als Katalogeintrag) |
| 4 | **Katalog** (`src/catalog/*.ts`) | Die gesamte endpunktspezifische Wahrheit: Pfadvorlage, Klasse, Annotationen, Zod-Eingabeschema, Abbildung Werkzeugparameter auf Body, Antwortvertrag, Fehlertabelle, Paginierungsform | HTTP, MCP |
| 5 | **Draht** (`src/wire/*.ts`) | Typkorrektur in beide Richtungen: Beträge, Booleans, Kennungen, Nullbarkeit, unbekannte Felder | einzelne Endpunkte (arbeitet mit dem Antwortvertrag aus Schicht 4) |
| 6 | **HTTP** (`src/http/*.ts`) | Basic-Auth, Rate Limiting, Zeitlimits, Retry-Politik, Content-Type-Prüfung, Umschlagzerlegung | Werkzeugnamen, MCP |
| 7 | **Konfiguration** (`src/config/*.ts`) | Umgebungsvariablen lesen, validieren, einmal beim Start einfrieren | alles darüber |

Quer dazu, ohne eigene Schicht: `src/errors/` (Fehlerübersetzung, wird von 3 und 6 benutzt),
`src/response/` (Formatierung, wird von 3 benutzt), `src/util/redact.ts` (Geheimnisfilter, wird
überall benutzt), `src/files/` (Dateibeschaffung, wird nur von `bb_receipts_upload` benutzt).

### 2.3 Der Weg eines Werkzeugaufrufs

```
Client (Claude Code / Desktop / Codex)
  │  tools/call  { name: "bb_postings_create_free", arguments: {...} }
  ▼
[1] Transport            stdio, JSON-RPC; extra.signal wird bis zum fetch durchgereicht
  ▼
[3] Werkzeughülle
  │
  ├─ (a) Katalogeintrag nachschlagen. Unbekannter Name -> Protokollfehler.
  ├─ (b) Nur-Lesen-Schalter: Klasse != R und BB_MCP_READ_ONLY=true
  │        -> isError:true, KEIN Request. Ende.
  ├─ (c) Eingabevalidierung gegen das Zod-Schema des Eintrags.
  │        Fehlschlag -> isError:true mit dem Vier-Block-Text. KEIN Request. Ende.
  ├─ (d) Querprüfungen des Eintrags (checks[]): gleiche Länge paralleler Arrays,
  │        Summe der Positionsbeträge, date_from <= date_to, gegenseitiger Ausschluss,
  │        maxItems gegen BB_MCP_MAX_BATCH, Betragsgrenze BB_MCP_MAX_AMOUNT.
  │        Fehlschlag -> isError:true. KEIN Request. Ende.
  ├─ (e) Nur bei Klassen A und B: Duplikatsabfrage (ein zusätzlicher Leseaufruf).
  │        Ergebnis blockiert nie, es wird der Antwort beigelegt.
  ▼
[4] Katalog: buildBody(args) -> Body-Objekt; buildPath(args) -> konkreter Pfad
  ▼
[5] Draht, Hinrichtung: Beträge als JSON-Zahl, Booleans als echte Booleans,
      Datumsformate normiert, optionale Felder weggelassen statt leer gesendet
  ▼
[6] HTTP
  ├─ Rate-Limiter: Token aus general + ggf. batch/upload entnehmen (pro Versuch)
  ├─ fetch(POST, Basic-Auth, application/json, api_key im Body, signal)
  ├─ Content-Type prüfen. Nicht JSON -> DiagnostischerFehler mit den ersten 200 Zeichen
  ├─ Umschlag zerlegen: success true/false, rows, data, error_code, message
  └─ Retry NUR wenn Katalogklasse == R UND Fehler transient. Sonst nie.
  ▼
[5] Draht, Rückrichtung: Antwortvertrag des Eintrags anwenden
      - bekannte Felder typisieren und normalisieren
      - unbekannte Felder unverändert durchreichen und zählen
      - fehlende Pflichtfelder -> Vertragsbruch melden, nicht verschweigen
  ▼
[3] Antwortaufbereitung (src/response/)
      structuredContent (nach outputSchema) + Markdown-Text + Navigationshinweis
  ▼
Client
```

Fünf Eigenschaften dieses Wegs sind der Kern des Entwurfs:

1. **Vier Abbruchpunkte liegen vor dem ersten Byte über die Leitung** (b, c, d und der
   Pfadcheck). Jede Ablehnung dort sagt wörtlich "Nothing was sent to BuchhaltungsButler and
   nothing was changed." Das ist die einzige Aussage, die der Server über schreibende Vorgänge
   mit Sicherheit machen kann.
2. **Der Retry-Zweig kennt die Werkzeugklasse.** Er liegt nicht im HTTP-Client als
   Allgemeingut, sondern wird vom Katalogeintrag freigeschaltet. Ein neuer schreibender
   Endpunkt bekommt Retry damit niemals versehentlich.
3. **Der Draht ist zweiseitig und asymmetrisch**, weil die API es ist: Zahl hinein, String
   heraus; Boolean hinein, `"0"`/`"1"` heraus.
4. **Der Antwortvertrag ist tolerant nach außen, streng nach innen.** Unbekannte Felder sind
   erlaubt und werden durchgereicht, weil die Spezifikation unvollständig ist. Fehlende oder
   typwidrige *bekannte* Felder sind ein Vertragsbruch und werden gemeldet, weil genau dort der
   stille Datenfehler entsteht.
5. **Es gibt genau einen Handler**, nicht 54. Was 54-fach existiert, sind Daten, keine
   Ablaufpfade. Ein Fehler in der Ablauflogik ist damit ein Fehler, nicht potenziell 54.

### 2.4 Warum der Katalog eine Datenstruktur ist und keine 54 Dateien mit Handlern

`docs/entwicklung/tool-design.md` 11.1 verlangt bereits, dass die Zuordnung Tool zu Endpunkt
"als Datenstruktur im Code vorliegt, nicht nur in der Dokumentation". Dieser Plan zieht die
Konsequenz und macht den Katalog zur einzigen Quelle für:

- den Werkzeugnamen und die Beschreibung,
- die Klasse (R, A, AR, M, D, B) und daraus abgeleitet alle vier Annotationen,
- das Eingabeschema und die Querprüfungen,
- den Antwortvertrag und das `outputSchema`,
- die Fehlertabelle `(Pfad, error_code)`,
- die Freischaltung von Retry, Cache und Duplikatsprüfung,
- die Paginierungsform.

Damit ist jede Abnahmeprüfung aus `tool-design.md` 11.9 ein Durchlauf über ein Array, kein
Abgleich von Prosa. Das ist der Grund, warum dieser Entwurf die Prüfbarkeit über die
Bequemlichkeit stellt: Ein Katalogeintrag ist mühsamer zu schreiben als ein Handler, aber er
lässt sich vollständig gegen die OpenAPI-Datei aufrechnen.

---

## 3. Vollständiger Dateibaum

Eine Zeile Zweck je Datei. Verzeichnisse ohne eigenen Zweck sind nicht kommentiert.
`docs/` ist vorhanden und hier nur der Vollständigkeit halber genannt.

```text
buchhaltungsbutler-mcp/
├── package.json                          Paketname @dennismenken/buchhaltungsbutler-mcp, bin, exports, engines >=22.12.0
├── pnpm-lock.yaml                        eingechecktes Lockfile, Voraussetzung für reproduzierbare Builds
├── tsconfig.json                         NodeNext, strict, ES2022, noUncheckedIndexedAccess
├── tsdown.config.ts                      Build zweier Einstiegspunkte (cli, index), Shebang und Modus 755
├── vitest.config.ts                      Testkonfiguration, Abdeckungsschwellen, Testumgebung node
├── eslint.config.js                      Flat Config, typgestützt, no-console außer error, Verbot von process.stdout
├── .npmignore                            hält docs/ und tests/ aus dem Tarball, ergänzend zu files[]
├── .gitignore
├── LICENSE                               MIT
├── NOTICE.md                             Kennzeichnung als inoffiziell, Markenhinweis zu BuchhaltungsButler
├── README.md                             deutsche Anleitung, Gliederung in Abschnitt 12
├── CHANGELOG.md                          Keep a Changelog, Einträge je Veröffentlichung
├── SECURITY.md                           Meldeweg für Sicherheitslücken, Hinweis auf Produktivdatenrisiko
├── manifest.json                         MCPB-Bundle-Manifest, Werkzeugliste wird aus der Registrierung erzeugt
│
├── .github/
│   ├── workflows/ci.yml                  Lint, Typecheck, Unit, Vertragstests, Integrationstest auf Node 22 und 24
│   ├── workflows/release.yml             Bundlebau vor npm publish, OIDC Trusted Publishing mit --provenance
│   └── workflows/spec-drift.yml          wöchentlicher Lauf von check-coverage gegen die OpenAPI-Datei
│
├── scripts/
│   ├── extract-facts.ts                  liest die OpenAPI-Datei und schreibt generated/endpoint-facts.json
│   ├── extract-errors.ts                 zerlegt die Schlüssel "400 (5)" und schreibt generated/error-table.json
│   ├── scaffold-catalog.ts               erzeugt Katalog-Rohlinge je Endpunkt zum Nacharbeiten von Hand
│   ├── check-coverage.ts                 rechnet Katalog gegen endpoint-facts.json auf, Abbruch bei jeder Lücke
│   ├── check-names.ts                    prüft Regex, Präfix, Eindeutigkeit, Verbliste, Länge aller 54 Namen
│   ├── count-definition-tokens.ts        misst die Gesamtgröße aller Werkzeugdefinitionen in Token
│   └── build-mcpb.ts                     baut das .mcpb-Bundle, Werkzeugliste aus der laufenden Registrierung
│
├── generated/                            erzeugte Zwischendaten, eingecheckt, damit Abweichungen im Diff sichtbar sind
│   ├── endpoint-facts.json               je Pfad: Parameter mit Typ, required, Beschreibung, Wertevorrat aus dem Fließtext
│   └── error-table.json                  je (Pfad, error_code): HTTP-Status, Originalmeldung, abgeleitete Klasse
│
├── src/
│   ├── cli.ts                            Einstiegspunkt des Binaries, Shebang, Unterbefehlsverteilung, ohne Unterbefehl stdio-Server
│   ├── index.ts                          programmatischer Export (createServer, Katalog), kein Seiteneffekt beim Import
│   ├── server.ts                         baut den McpServer, meldet Werkzeuge an, setzt instructions, Signalbehandlung
│   │
│   ├── config/
│   │   ├── env.ts                        Zod-Schema aller Umgebungsvariablen, einmaliges Einlesen, eingefrorenes Config-Objekt
│   │   ├── credentials.ts                Auflösung der Zugangsdaten aus Umgebung oder Zugangsdatendatei, Rechteprüfung 0600
│   │   ├── instructions.ts               erzeugt den instructions-Text des Servers, nennt aktive Schalter wörtlich
│   │   └── startup-check.ts              Startprüfungen: Node-Version, Pflichtvariablen, Warnung ohne Verbindungsaufbau
│   │
│   ├── http/
│   │   ├── client.ts                     einziger fetch-Aufrufer: Auth, Header, Body, Zeitlimit, Signal, Content-Type-Prüfung
│   │   ├── auth.ts                       Basic-Auth-Header aus Client und Secret über Buffer, niemals protokolliert
│   │   ├── envelope.ts                   zerlegt Erfolgs- und Fehlerumschlag, erkennt fehlende rows/data, prüft success
│   │   ├── rate-limiter.ts               Token-Buckets general, batch, upload; Serialisierung über eine Promise-Kette je Bucket
│   │   ├── retry.ts                      Backoff mit echtem Jitter; wird ausschließlich für Klasse R freigeschaltet
│   │   ├── transport-error.ts            Fehlertypen: Netzwerk, Zeitlimit, Nicht-JSON, Umschlagbruch, API-Fehler
│   │   └── cookies.ts                    verwirft Set-Cookie ausdrücklich, kein Cookie-Jar über Aufrufe hinweg
│   │
│   ├── catalog/
│   │   ├── types.ts                      Typ EndpointEntry: Pfadvorlage, Klasse, Schema, Body-Abbildung, Antwortvertrag, Fehler
│   │   ├── classes.ts                    Klassentabelle R, A, AR, M, D, B und die daraus folgenden vier Annotationen
│   │   ├── index.ts                      setzt alle Gruppen zu genau 54 Einträgen zusammen, prüft Eindeutigkeit beim Laden
│   │   ├── receipts.ts                   8 Einträge für /receipts/*
│   │   ├── transactions.ts               8 Einträge für /transactions/*
│   │   ├── invoices.ts                   3 Einträge für /invoices/*
│   │   ├── postings.ts                   12 Einträge für /postings/*
│   │   ├── settings.ts                   11 Einträge für /settings/* (Debitoren, Kreditoren, Sachkonten)
│   │   ├── accounts.ts                   2 Einträge für /accounts/*
│   │   ├── comments.ts                   1 Eintrag für /comments/add
│   │   ├── cost-locations.ts             4 Einträge für /cost-locations/*
│   │   └── reports.ts                    5 Einträge für /reports/*
│   │
│   ├── schema/
│   │   ├── primitives.ts                 wiederverwendbare Zod-Bausteine: Datum, Datum mit Zeit, Betrag, Kennung, Kontonummer
│   │   ├── enums.ts                      Wertevorräte mit dokumentierter Herkunft je Eintrag; offene Vorräte bleiben String
│   │   ├── pagination.ts                 limit/offset je Endpunkt mit dessen eigenem Maximum und konservativem Default
│   │   ├── order.ts                      die drei order-Formen als drei getrennte Schemata, keine gemeinsame Abstraktion
│   │   ├── line-items.ts                 Positionslisten als Objektarray, Umwandlung in parallele Arrays samt Längenprüfung
│   │   ├── batch.ts                      Objektarrays der Batch-Endpunkte, maxItems aus BB_MCP_MAX_BATCH
│   │   └── refine.ts                     Querprüfungen: Datumsordnung, Betragssummen, gegenseitiger Ausschluss
│   │
│   ├── wire/
│   │   ├── encode.ts                     Hinrichtung: Betrag String zu Zahl, Boolean echt, leere Felder weglassen
│   │   ├── decode.ts                     Rückrichtung: "0"/"1" zu Boolean, Kennungen zu String, Zahlen zu Dezimalstring
│   │   ├── contracts.ts                  Antwortverträge je Endpunkt, tolerant gegenüber unbekannten Feldern
│   │   ├── contract-violation.ts         Meldung eines Vertragsbruchs, mit Feldname, erwartetem und gesehenem Typ
│   │   └── decimal.ts                    Betragsrechnung in Ganzzahl-Cent, nie Gleitkomma, nur für Prüfsummen
│   │
│   ├── errors/
│   │   ├── table.ts                      lädt generated/error-table.json, Schlüssel ist das Paar (Pfad, error_code)
│   │   ├── classify.ts                   fünf Klassen: Konfiguration, Eingabe, transient, endgültig, Sonderfall
│   │   ├── render.ts                     baut den Vier-Block-Fehlertext (Was, Warum, Wie richtig, Vorbedingung)
│   │   └── write-uncertainty.ts          Sondertext für den Fall "schreibender Aufruf ohne Antwort, Ausgang unbekannt"
│   │
│   ├── tools/
│   │   ├── register.ts                   registriert alle 54 Einträge über registerTool, setzt title und alle Annotationen
│   │   ├── handler.ts                    der eine generische Handler, Ablauf nach Abschnitt 2.3
│   │   ├── read-only-guard.ts            Prüfung des Nur-Lesen-Schalters, Absagetext nach tool-design 9.5
│   │   ├── limits-guard.ts               BB_MCP_MAX_BATCH und BB_MCP_MAX_AMOUNT, Prüfung vor dem Request
│   │   ├── duplicate-check.ts            Duplikatshinweis vor create-Aufrufen der Klassen A und B, blockiert nie
│   │   └── audit-log.ts                  Protokoll je Aufruf nach stderr: Zeit, Werkzeug, Klasse, Ergebnis, ohne Geheimnisse
│   │
│   ├── response/
│   │   ├── build.ts                      setzt structuredContent, Textblock und Navigationshinweis zusammen
│   │   ├── table.ts                      Markdown-Tabelle aus Listen, Feldnamen im Original, keine Umbenennung
│   │   ├── truncate.ts                   weiche und harte Token-Grenze, nennt die Zahl der unterdrückten Zeilen
│   │   ├── paging-note.ts                erzeugt den konkreten Folgeaufruf mit gesetztem offset
│   │   ├── sanitize.ts                   neutralisiert Freitext aus der API, entfernt Steuerzeichen und Bidi-Zeichen
│   │   └── output-schema.ts              erzeugt das outputSchema aus dem Antwortvertrag des Katalogeintrags
│   │
│   ├── files/
│   │   ├── source.ts                     einheitliche Schnittstelle: base64, file://, http(s)://
│   │   ├── url-source.ts                 SSRF-Abwehr je Redirect-Hop, laufende Bytezählung, Größengrenze
│   │   ├── file-source.ts                nur bei gesetztem BB_ALLOWED_FILE_DIRS, realpath plus O_NOFOLLOW
│   │   ├── magic-bytes.ts                Dateityp aus den ersten Bytes, Content-Type wird nicht geglaubt
│   │   └── filename.ts                   bereinigt Dateinamen, entfernt Pfadanteile, Steuer- und Bidi-Zeichen
│   │
│   ├── setup/
│   │   ├── wizard.ts                     der Assistent, Ablauf nach Abschnitt 10
│   │   ├── detect.ts                     erkennt vorhandene Clients über Binärdateien und Konfigurationspfade
│   │   ├── connection-test.ts            ein Leseaufruf gegen /accounts/get, unterscheidet error_code 3, 4 und 11
│   │   ├── writers/claude-code.ts        ruft claude mcp add-json als Unterprozess auf
│   │   ├── writers/claude-desktop.ts     ändert claude_desktop_config.json, legt vorher eine Sicherung an
│   │   ├── writers/codex.ts              ruft codex mcp add als Unterprozess auf
│   │   ├── writers/grok.ts               ruft grok mcp add als Unterprozess auf
│   │   ├── writers/vscode.ts             schreibt .vscode/mcp.json beziehungsweise ruft code --add-mcp auf
│   │   ├── writers/json-file.ts          gemeinsamer Schreiber für Cursor, Windsurf, Cline, LM Studio
│   │   ├── writers/print-only.ts         gibt den fertigen Block aus für Zed, Continue, Jan und unbekannte Clients
│   │   ├── doctor.ts                     Diagnoseausgabe für Fehlerberichte, ohne Geheimnisse
│   │   └── profiles.ts                   Mandantenprofile in der Zugangsdatendatei verwalten
│   │
│   └── util/
│       ├── logger.ts                     schreibt ausschließlich nach stderr, Stufen über BB_MCP_LOG_LEVEL
│       ├── redact.ts                     entfernt Zugangsdaten aus jedem Text, wird vor jeder Ausgabe angewandt
│       ├── abort.ts                      throwIfAborted und Weiterreichen des Signals an fetch
│       └── version.ts                    liest die Version aus package.json, mit Test gegen stilles Scheitern
│
├── tests/
│   ├── unit/                             Einzeltests je Modul, ohne Netz
│   ├── contract/
│   │   ├── coverage.test.ts              alle 54 Pfade abgedeckt, jeder Parameter im Schema, kein überzähliger
│   │   ├── names.test.ts                 Regex, Präfix, Verbliste, Eindeutigkeit, Länge
│   │   ├── annotations.test.ts           vier Annotationen je Werkzeug, Werte gleich der Klassentabelle
│   │   ├── read-only.test.ts             jedes Werkzeug der Klassen A, AR, M, D, B lehnt bei aktivem Schalter ab
│   │   ├── no-write-retry.test.ts        kein Werkzeug ausserhalb Klasse R setzt einen zweiten Request ab
│   │   ├── secrets.test.ts               api_key, Secret und Authorization in keiner Definition, Antwort, Meldung
│   │   └── output-schema.test.ts         jede Beispielantwort validiert gegen ihr outputSchema
│   ├── fixtures/                         aufgezeichnete echte Antwortkörper, anonymisiert, Herkunft je Datei vermerkt
│   ├── integration/server.test.ts        gebauten Server starten, initialize, tools/list, ein lesender tools/call
│   └── helpers/mock-api.ts               HTTP-Nachbildung über undici MockAgent, keine echten Aufrufe
│
└── docs/                                 vorhandene Dossiers, unverändert
```

---

## 4. Die 54 Werkzeuge

### 4.1 Namensschema

Übernommen aus `docs/entwicklung/tool-design.md` 4.3, unverändert:

```
bb_<ressource>_<verb>[_<qualifizierer>]
```

snake_case, durchgehend klein, Präfix `bb_`, Ressource im Plural und vor dem Verb, jeder Name
erfüllt `^[a-z][a-z0-9_]{2,39}$`, Höchstlänge 40 Zeichen. Der längste Name des Satzes,
`bb_postings_create_on_transactions_batch`, misst genau 40 Zeichen.

Verbliste, geschlossen. Zwölf Verben, elf davon aus `tool-design.md` 4.4 unverändert
übernommen, eines ergänzt:

| Verb | Bedeutung | in `tool-design.md` 4.4 |
| --- | --- | --- |
| `search` | gefilterte Liste mit `limit`/`offset` | ja |
| `get` | genau ein Objekt über seinen Identifikator | ja |
| `list` | vollständige Aufzählung ohne sinnvolle Filter | ja |
| `create` | legt an | ja |
| `update` | ändert ein bestehendes Objekt | ja |
| `delete` | entfernt oder markiert als gelöscht | ja |
| `restore` | macht ein `delete` rückgängig | ja |
| `upload` | überträgt eine Datei | ja |
| `cancel` | storniert fachlich | ja |
| `unconfirm` | hebt eine Bestätigung auf | ja |
| `assign` | stellt eine Zuordnung her | ja |
| `unassign` | hebt eine Zuordnung auf | **ergänzt**, Begründung in [4.4](#44-abweichungen-von-tool-designmd) |

Die Klassen und die daraus folgenden Annotationen, übernommen aus `tool-design.md` 9.3 mit
einer Änderung bei Klasse M (Begründung in [4.4](#44-abweichungen-von-tool-designmd)):

| Klasse | Bedeutung | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- | --- |
| **R** | lesend | `true` | `false` | `true` | `true` |
| **A** | additiv, legt an oder stellt eine umkehrbare Zuordnung her | `false` | `false` | `false` | `true` |
| **AR** | erzeugt eine Auswertung und ersetzt die vorherige | `false` | `true` | `false` | `true` |
| **M** | überschreibt einen bestehenden Stammdatensatz | `false` | `true` | `true` | `true` |
| **D** | löscht, storniert, hebt eine Bestätigung oder Zuordnung auf | `false` | `true` | `false` | `true` |
| **B** | buchend oder belegbindend, ohne Weg zurück in der API | `false` | `false` | `false` | `true` |

`openWorldHint` ist bei allen 54 Werkzeugen `true`. Die Spalte entfällt deshalb in der großen
Tabelle.

### 4.2 Die Tabelle

Spalte **Wirkung** ist die Einstufung aus `docs/api/grundlagen.md` 7.3, nicht die Klasse.
Spalte **Kl.** ist die Klasse aus 4.1. Die drei Hint-Spalten sind `readOnlyHint`,
`destructiveHint`, `idempotentHint`.

| # | Werkzeugname | API-Pfad | Wirkung | Kl. | roH | deH | idH | Kurzbeschreibung |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bb_receipts_search` | `/receipts/get` | lesend | R | true | false | true | Sucht Belege ("Eingangs- und Ausgangsbelege") nach Richtung, Datum, Gegenpartei, Rechnungsnummer und Zahlungsstatus und liefert eine Seite der Trefferliste. |
| 2 | `bb_receipts_get` | `/receipts/get/id_by_customer` | lesend | R | true | false | true | Holt genau einen Beleg über seine `id_by_customer`, einschließlich Fremdwährungsfeldern und auf Wunsch der Belegdatei. |
| 3 | `bb_receipts_list_transactions` | `/receipts/assigned-transactions/get` | lesend | R | true | false | true | Listet die Zahlungen ("Transaktionen"), die einem bestimmten Beleg zugeordnet sind. |
| 4 | `bb_receipts_create` | `/receipts/add` | anlegend | A | false | false | false | Legt einen Beleg ohne Datei an; erzeugt einen echten Datensatz und kann nicht endgültig gelöscht, nur als gelöscht markiert werden. |
| 5 | `bb_receipts_create_batch` | `/receipts/addBatch` | anlegend | A | false | false | false | Legt bis zu 50 Belege in einem Aufruf an; ein Aufruf ist nur alle fünf Sekunden erlaubt. |
| 6 | `bb_receipts_upload` | `/receipts/upload` | anlegend | A | false | false | false | Lädt eine Belegdatei hoch, legt daraus einen Beleg an und stößt die Texterkennung an; verbraucht Upload-Kontingent, höchstens zehn Aufrufe je Minute. |
| 7 | `bb_receipts_delete` | `/receipts/delete/id_by_customer` | löschend | D | false | true | false | Markiert einen Beleg als gelöscht; kein endgültiges Löschen, umkehrbar mit `bb_receipts_restore`. |
| 8 | `bb_receipts_restore` | `/receipts/restore/id_by_customer` | ändernd | A | false | false | false | Holt einen als gelöscht markierten Beleg zurück und macht ihn wieder buchungsrelevant. |
| 9 | `bb_transactions_search` | `/transactions/get` | lesend | R | true | false | true | Sucht Zahlungen ("Transaktionen") auf den Zahlungskonten nach Konto, Datum und Kennungsbereich. |
| 10 | `bb_transactions_get` | `/transactions/get/id_by_customer` | lesend | R | true | false | true | Holt genau eine Zahlung über ihre `id_by_customer`, mit Konto, Währung, Bankdaten und Buchungstext. |
| 11 | `bb_transactions_list_receipts` | `/transactions/assigned-receipts/get` | lesend | R | true | false | true | Listet die Belege, die einer bestimmten Zahlung zugeordnet sind. |
| 12 | `bb_transactions_create` | `/transactions/add` | anlegend | A | false | false | false | Legt eine Zahlung auf einem echten Zahlungskonto an; verfälscht bei falscher Anwendung Kontostand und Abstimmung sofort. |
| 13 | `bb_transactions_create_batch` | `/transactions/addBatch` | anlegend | A | false | false | false | Legt bis zu 50 Zahlungen in einem Aufruf an; ein Aufruf ist nur alle fünf Sekunden erlaubt. |
| 14 | `bb_transactions_assign_receipt` | `/transactions/assign/receipt` | ändernd | A | false | false | false | Ordnet einer Zahlung einen Beleg zu; umkehrbar mit `bb_transactions_unassign_receipt`, solange keine bestätigte Buchung daran hängt. |
| 15 | `bb_transactions_assign_receipt_batch` | `/transactions/assign-batch/receipt` | ändernd | A | false | false | false | Ordnet bis zu 50 Paare aus Zahlung und Beleg in einem Aufruf zu. |
| 16 | `bb_transactions_unassign_receipt` | `/transactions/unassign/receipt` | löschend | D | false | true | false | Hebt die Zuordnung eines Belegs zu einer Zahlung auf; schlägt fehl, wenn daran eine bestätigte Buchung hängt. |
| 17 | `bb_invoices_create` | `/invoices/create` | anlegend | B | false | false | false | Erstellt eine echte, nummerierte Ausgangsrechnung; die API kennt für Rechnungen weder Storno noch Löschung. |
| 18 | `bb_invoices_create_draft` | `/invoices/create/draft` | anlegend | B | false | false | false | Erstellt einen Rechnungsentwurf statt einer finalen Rechnung; erzeugt trotzdem ein in der Anwendung sichtbares Objekt. |
| 19 | `bb_invoices_create_einvoice` | `/invoices/create/e-invoice` | anlegend | B | false | false | false | Erstellt eine E-Rechnung mit Steuerart und Steuerbetrag je Position statt eines Steuersatzes; strengste Formatregeln der gesamten API. |
| 20 | `bb_postings_search` | `/postings/get` | lesend | R | true | false | true | Sucht Buchungen in einem Pflichtzeitraum; höchstens 1000 Buchungen je Aufruf, `order` ist case sensitive. |
| 21 | `bb_postings_create_on_receipt` | `/postings/add/receipt` | anlegend | B | false | false | false | Legt einen oder mehrere Buchungssätze zu einem Beleg an; setzt aktivierte Kreditoren- oder Debitorenbuchung voraus. |
| 22 | `bb_postings_create_on_receipts_batch` | `/postings/add-batch/receipts` | anlegend | B | false | false | false | Legt Buchungssätze zu mehreren Belegen in einem Aufruf an. |
| 23 | `bb_postings_create_on_transaction` | `/postings/add/transaction` | anlegend | B | false | false | false | Legt einen oder mehrere Buchungssätze zu einer Zahlung an. |
| 24 | `bb_postings_create_on_transactions_batch` | `/postings/add-batch/transactions` | anlegend | B | false | false | false | Legt Buchungssätze zu mehreren Zahlungen in einem Aufruf an. |
| 25 | `bb_postings_create_free` | `/postings/add/free` | anlegend | B | false | false | false | Legt eine freie Buchung ohne Beleg- oder Zahlungsbezug an; ohne natürliches Korrektiv und nur per Storno korrigierbar. |
| 26 | `bb_postings_create_free_batch` | `/postings/add-batch/free` | anlegend | B | false | false | false | Legt mehrere freie Buchungen in einem Aufruf an. |
| 27 | `bb_postings_unconfirm_receipt` | `/postings/unconfirm/receipt` | löschend | D | false | true | false | Entfernt die nicht festgeschriebenen Buchungen zu einem Beleg und verändert den Buchungsstand sofort. |
| 28 | `bb_postings_unconfirm_transaction` | `/postings/unconfirm/transaction` | löschend | D | false | true | false | Entfernt die nicht festgeschriebenen Buchungen zu einer Zahlung. |
| 29 | `bb_postings_unconfirm_free` | `/postings/unconfirm/free` | löschend | D | false | true | false | Entfernt eine nicht festgeschriebene freie Buchung. |
| 30 | `bb_postings_assign_receipt` | `/postings/assign/receipt-to-free-posting` | ändernd | B | false | false | false | Bindet einen bestehenden Beleg an eine bestehende freie Buchung; die API kennt keinen Endpunkt, um das wieder zu lösen. |
| 31 | `bb_postings_cancel` | `/postings/cancel` | löschend | D | false | true | false | Storniert eine Buchung: nicht festgeschriebene werden gelöscht, festgeschriebene durch eine dauerhaft sichtbare Stornobuchung ausgeglichen. |
| 32 | `bb_debtors_search` | `/settings/get/debtors` | lesend | R | true | false | true | Sucht Debitorenkonten ("Debitoren", Kundenkonten); ohne ausdrückliches `limit` liefert die API nur 25 Zeilen. |
| 33 | `bb_debtors_create` | `/settings/add/debtor` | anlegend | A | false | false | false | Legt ein Debitorenkonto an; die API kennt keinen Endpunkt, um es wieder zu löschen. |
| 34 | `bb_debtors_create_batch` | `/settings/add-batch/debtors` | anlegend | A | false | false | false | Legt mehrere Debitorenkonten in einem Aufruf an. |
| 35 | `bb_debtors_update` | `/settings/update/debtor` | ändernd | M | false | true | true | Überschreibt die Stammdaten eines bestehenden Debitorenkontos; die API liefert den vorherigen Stand nicht zurück. |
| 36 | `bb_creditors_search` | `/settings/get/creditors` | lesend | R | true | false | true | Sucht Kreditorenkonten ("Kreditoren", Lieferantenkonten); ohne ausdrückliches `limit` liefert die API nur 25 Zeilen. |
| 37 | `bb_creditors_create` | `/settings/add/creditor` | anlegend | A | false | false | false | Legt ein Kreditorenkonto an; die API kennt keinen Endpunkt, um es wieder zu löschen. |
| 38 | `bb_creditors_create_batch` | `/settings/add-batch/creditors` | anlegend | A | false | false | false | Legt mehrere Kreditorenkonten in einem Aufruf an. |
| 39 | `bb_creditors_update` | `/settings/update/creditor` | ändernd | M | false | true | true | Überschreibt die Stammdaten eines bestehenden Kreditorenkontos; die API liefert den vorherigen Stand nicht zurück. |
| 40 | `bb_postingaccounts_search` | `/settings/get/postingaccounts` | lesend | R | true | false | true | Sucht Sachkonten ("Sachkonten", Kontenrahmen); die Liste enthält auch Zahlungskonten, Debitoren und Kreditoren. |
| 41 | `bb_postingaccounts_create` | `/settings/add/postingaccount` | anlegend | A | false | false | false | Legt ein Sachkonto an und verändert damit den Kontenrahmen für alle künftigen Buchungen. |
| 42 | `bb_postingaccounts_update` | `/settings/update/postingaccount` | ändernd | M | false | true | true | Ändert ein Sachkonto, auf das bestehende Buchungen verweisen. |
| 43 | `bb_accounts_list` | `/accounts/get` | lesend | R | true | false | true | Listet alle Zahlungskonten ("Bank- und Kassenkonten") des Mandanten; kennt kein `limit` und liefert immer alle. |
| 44 | `bb_accounts_create` | `/accounts/add` | anlegend | A | false | false | false | Legt ein Zahlungskonto an; die Schalter `receipt_creates_transaction` und `is_revision_safe` legen dauerhaftes Verhalten fest. |
| 45 | `bb_comments_create` | `/comments/add` | anlegend | A | false | false | false | Fügt einen Kommentar an einen Beleg oder eine Zahlung an; für andere Nutzer sichtbar und über die API nicht löschbar. |
| 46 | `bb_cost_locations_search` | `/cost-locations/get` | lesend | R | true | false | true | Sucht Kostenstellen ("Kostenstellen"); höchstens 1000 je Aufruf. |
| 47 | `bb_cost_locations_create` | `/cost-locations/add` | anlegend | A | false | false | false | Legt eine Kostenstelle an, die in der Kostenstellenauswertung erscheint. |
| 48 | `bb_cost_locations_update` | `/cost-locations/update` | ändernd | M | false | true | true | Überschreibt Name und Beschreibung einer Kostenstelle, auf die bestehende Buchungen verweisen. |
| 49 | `bb_cost_locations_delete` | `/cost-locations/delete` | löschend | D | false | true | false | Entfernt eine Kostenstelle; wie mit Buchungen verfahren wird, die darauf verweisen, ist nicht dokumentiert. |
| 50 | `bb_reports_get_bwa` | `/reports/get/bwa` | lesend | R | true | false | true | Holt die zuvor erzeugte BWA ("Betriebswirtschaftliche Auswertung") ab; ohne vorheriges `bb_reports_create_bwa` meldet die API `error_code` 7. |
| 51 | `bb_reports_get_sums` | `/reports/get/sums` | lesend | R | true | false | true | Holt die zuvor erzeugte Summen- und Saldenliste ab; setzt `bb_reports_create_sums` voraus. |
| 52 | `bb_reports_get_ledger` | `/reports/get/sums/ledger` | lesend | R | true | false | true | Liefert ein Kontenblatt ("Kontenblatt") unmittelbar, ohne vorherigen Erzeugungsschritt. |
| 53 | `bb_reports_create_bwa` | `/reports/create/bwa` | anlegend | AR | false | true | false | Stößt die Erzeugung einer BWA an; **ersetzt die zuvor erzeugte BWA** und blockiert bis zum Abschluss jeden weiteren Erzeugungsaufruf desselben Typs. |
| 54 | `bb_reports_create_sums` | `/reports/create/sums` | anlegend | AR | false | true | false | Stößt die Erzeugung einer Summen- und Saldenliste an; **ersetzt die zuvor erzeugte Liste**, wahlweise mit PDF, CSV und Archiv. |

**Prüfsätze zur Tabelle.**

- 54 Zeilen, 54 Pfade, jeder Pfad genau einmal. Der Test `tests/contract/coverage.test.ts`
  rechnet das gegen `jq -r '.paths|keys[]'` auf.
- Wirkung: 15 lesend, 24 anlegend, 8 ändernd, 7 löschend. Deckungsgleich mit
  `docs/api/grundlagen.md` 7.3.
- Klassen: R 15, A 16, AR 2, M 4, D 7, B 10. Summe 54.
- Bei aktivem `BB_MCP_READ_ONLY` sind genau die 15 Werkzeuge der Klasse R aufrufbar; sie decken
  genau die 15 lesenden Endpunkte ab. Die Allowlist ist damit die Klassenspalte, nicht eine
  zweite Pfadliste.

### 4.3 Aufbau jeder Werkzeugbeschreibung

Die Kurzbeschreibungen der Tabelle sind **nicht** die ausgelieferten Beschreibungen. Ausgeliefert
wird der fünfteilige Aufbau aus `docs/entwicklung/tool-design.md` 11.3, auf Englisch, mit
deutschen Fachbegriffen in Anführungszeichen, 60 bis 220 Wörter:

1. Zweck mit dem Wort "BuchhaltungsButler" und dem deutschen Fachbegriff.
2. Anwendungsfall mit einem konkreten Beispiel.
3. Abgrenzung zu dem Werkzeug, das stattdessen zu nehmen ist.
4. Negation: was das Werkzeug nicht liefert oder nicht tut.
5. Grenzen und Folgen. Bei lesenden Werkzeugen die Obergrenze und der Hinweis auf `offset`,
   bei schreibenden die Wirkung auf den echten Datenbestand und die Umkehrbarkeit.

Für die 10 Werkzeuge der Klasse B und die 7 der Klasse D ist Satz 5 die wichtigste Zeile des
ganzen Servers, weil er die einzige Warnung ist, die der Nutzer im Freigabedialog zu sehen
bekommt. Verbindliche Muster:

- Klasse B: "This creates a legally relevant record in the live accounting data of the connected
  BuchhaltungsButler account. It cannot be deleted through this API, only reversed with
  `bb_postings_cancel`."
- `bb_postings_assign_receipt`: "The BuchhaltungsButler API has no endpoint to undo this link.
  Verify the free posting with `bb_postings_search` before calling."
- Klasse D: "This removes data from the live accounting data of the connected BuchhaltungsButler
  account." Dazu die jeweils zutreffende Umkehrbarkeit.
- Klasse AR: "This replaces the previously generated report of the same type."

**Zwei Beschreibungen dürfen die neue Lage aus [Befund A](#11-befund-a-id_by_customer-ist-ein-pfadsegment-kein-body-feld-beide-einzelabruf-endpunkte-funktionieren) nennen**, aber
erst nachdem `tests/contract` die Pfadform abgesichert hat: `bb_receipts_search` verweist auf
`bb_receipts_get` für den Einzelabruf, `bb_transactions_search` auf `bb_transactions_get`. Die
in `tool-design.md` 3.5 verfügte Sperre "kein Verweis aus anderen Tools" ist damit aufgehoben,
ihre Bedingung ist erfüllt.

### 4.4 Abweichungen von `tool-design.md`

Vier Abweichungen, alle benannt und begründet. Drei folgen zwingend aus E1.

**(1) 54 Werkzeuge statt 28 bis 34.** `tool-design.md` 11.1 verlangt 28 bis 34 Werkzeuge und
fasst Einzel- und Batch-Endpunkt zu einem Werkzeug mit `items`-Array zusammen. E1 verlangt genau
ein Werkzeug je Endpunkt. E1 gewinnt. Die Folge ist nicht nur mehr Transparenz, sondern die
Voraussetzung für ehrliche Annotationen: Ein Werkzeug, das je nach Anwesenheit eines Arrays
`/receipts/add` oder `/receipts/addBatch` anspricht, hat zwei Antwortformate und zwei
Fehlertabellen hinter einer Annotation. Ein Werkzeug, das je nach Argument liest oder löscht,
kann überhaupt keine ehrliche Annotation mehr tragen.

**(2) Neues Verb `unassign`.** `/transactions/unassign/receipt` hebt eine Zuordnung auf. Mit dem
Verb `delete` hieße das Werkzeug `bb_transactions_delete_receipt` und läse sich, als lösche es
den Beleg. Das ist im Buchhaltungskontext eine gefährliche Fehllesung. `unassign` ist das genaue
Gegenstück zu dem bereits geführten `assign` und hält die Verbliste geschlossen. Aufnahme in die
Liste in 4.1, Prüfung durch `tests/contract/names.test.ts`.

**(3) `destructiveHint: true` bei Klasse M.** `tool-design.md` 9.3 führt Klasse M mit
`destructiveHint: false`. Dieser Entwurf setzt `true`. Begründung aus `MCP-SCHEMA` selbst: Der
Hint ist mit "If false, the tool performs only additive updates" definiert. Ein
`/settings/update/debtor` ersetzt bestehende Feldwerte, das ist nicht additiv. Hinzu kommt der
in `docs/api/grundlagen.md` 7.3 belegte Umstand, dass kein Endpunkt den Zustand vor der Änderung
zurückliefert: Die Änderung ist ohne vorher gezogene Kopie nicht rückgängig zu machen.
`tool-design.md` 9.3 begründet bei Klasse AR mit genau diesem Argument selbst ein
`destructiveHint: true` für das Ersetzen eines Berichts; ein überschriebener Stammdatensatz wiegt
schwerer als ein überschriebener Bericht, weil er nicht neu berechenbar ist. Die
Risiko-Asymmetrie entscheidet: Ein zu strenger Hint kostet eine zusätzliche Rückfrage, ein zu
milder kostet einen unbemerkten Stammdatenverlust.

**(4) `idempotentHint` wird nur dort auf `true` gesetzt, wo Wiederholung beweisbar denselben
Zustand ergibt.** Das sind die vier Werkzeuge der Klasse M (Überschreiben auf einen genannten
Zielzustand, dasselbe Muster wie `write_file` in `SRV-FS`) und die 15 lesenden. Alle übrigen 35
tragen `false`, auch `bb_receipts_delete`, `bb_receipts_restore`, die drei `unconfirm`-Werkzeuge
und `bb_transactions_unassign_receipt`, bei denen eine Wiederholung plausibel wirkungslos wäre.
Grund: **nicht verifiziert**, und ein falsches `true` lädt einen Host zum automatischen
Wiederholen ein. Die Asymmetrie ist dieselbe wie in Punkt 3, nur mit umgekehrtem Vorzeichen.
Sobald ein Test gegen eine Wegwerf-Umgebung das Wiederholungsverhalten belegt, darf einzeln
umgestellt werden; die Klassentabelle und `tests/contract/annotations.test.ts` sind dann
gemeinsam nachzuziehen.

**Keine Abweichung, ausdrücklich bestätigt:** kein `confirm`-Parameter, kein erzwungener
Trockenlauf, keine serverseitige Bestätigung (E2 und `tool-design.md` 9.4). Kein Werkzeug
verbindet Suchen und Schreiben. `api_key` erscheint in keinem Schema.

---

## 5. Eingabeschemata und Pfadbau

### 5.1 Die zentrale Entscheidung: gemischt, mit erzwungenem Abgleich

371 Body-Parameter über 54 Endpunkte. Drei Wege standen zur Wahl.

| Weg | Vorteil | Warum er hier scheitert |
| --- | --- | --- |
| Vollständig generieren | keine Handarbeit, keine Lücke | Die Spezifikation ist kein gültiges Swagger 2.0, deklariert Beispielwerte als `enum` mit einem Eintrag, beschreibt das `order`-Objekt falsch, nennt Elementtypen von Arrays nur im Fließtext, trägt HTML in den Beschreibungen und ist in Feldnamen der Antworten nachweislich falsch. Ein Generator, der ihr folgt, erzeugt ein Schema, das gültige Vorgänge ablehnt und ungültige durchlässt. |
| Vollständig von Hand | volle Kontrolle über Semantik | 317 fachliche Parameter (371 minus 54-mal `api_key`) lassen sich von Hand abschreiben, aber nicht von Hand vollständig halten. Eine vergessene Zeile ist unsichtbar, und E6 verlangt Vollständigkeit. |
| **Gemischt mit erzwungenem Abgleich** | Semantik von Hand, Vollständigkeit maschinell bewiesen | der gewählte Weg |

**Entscheidung: Der Generator erzeugt Fakten und einen Rohling, nicht das Auslieferungsschema.
Das Auslieferungsschema wird von Hand geschrieben. Ein Test rechnet beide gegeneinander auf und
schlägt bei jeder Abweichung fehl.**

Begründung aus dem gewählten Blickwinkel: Ein Schema ist im Buchhaltungskontext kein
Bequemlichkeitswerkzeug, sondern die letzte Instanz vor dem Schreibzugriff. Es muss **enger** sein
als die API, wo die API zu großzügig ist (`tool-design.md` 6.1 und 6.4), und es muss **weiter**
sein, wo die Spezifikation zu eng ist (die Ein-Eintrag-`enum`). Beides sind Urteile, die ein
Generator nicht fällen kann. Was ein Generator kann, ist zählen, und genau das ist der Teil, den
ein Mensch nicht zuverlässig kann.

### 5.2 Pfadbau

Vier Endpunkte tragen ein Pfadsegment statt eines Body-Feldes (Befund A). Sie werden im Katalog
als Vorlage geführt:

```ts
// src/catalog/receipts.ts (Auszug, illustrativ)
{
  path: { template: "/receipts/get/{id_by_customer}", params: ["id_by_customer"] },
  ...
}
```

Regeln, alle Pflicht:

1. Der eingesetzte Wert wird **vor** dem Einsetzen gegen `^[0-9]{1,18}$` geprüft. Kein
   Bindestrich, kein Punkt, kein Schrägstrich, keine leere Zeichenkette.
2. Der Wert läuft anschließend durch `encodeURIComponent`. Das ist nach Regel 1 wirkungslos und
   genau deshalb richtig: Es ist die Absicherung gegen eine spätere Lockerung von Regel 1. Ein
   Identifikator, der unkodiert in den Pfad wandert, ist der klassische Weg zur Pfadinjektion.
3. Der gebaute Pfad wird gegen die Vorlage zurückgeprüft: Er muss genau ein Segment mehr haben
   als der Vorlagenstamm. Schlägt das fehl, wird kein Request abgesetzt.
4. Die übrigen 50 Endpunkte haben eine konstante Pfadzeichenkette ohne jede Interpolation. Der
   Typ `path` ist eine Union aus `{ literal: string }` und `{ template, params }`; ein Endpunkt
   ohne Platzhalter kann bauartbedingt keinen interpolierten Pfad erzeugen.

### 5.3 Was der Generator erzeugt

`scripts/extract-facts.ts` liest `docs/openapi/buchhaltungsbutler-v1.json` und schreibt
`generated/endpoint-facts.json`. Eingabe ist ausschließlich die OpenAPI-Datei, Ausgabe ist JSON,
das eingecheckt wird, damit jede Änderung der Spezifikation im Diff sichtbar ist.

Je Pfad enthält die Datei:

| Feld | Herkunft | Nachbearbeitung |
| --- | --- | --- |
| `parameters[].name` | `.paths[p].post.parameters[].name` | keine |
| `parameters[].specType` | `.type` oder `"(schema)"` | keine |
| `parameters[].required` | `.required` | keine |
| `parameters[].description` | `.description` | HTML entfernt, Entities aufgelöst, Zeilenumbrüche normiert |
| `parameters[].enumInSpec` | `.enum` | **markiert als unzuverlässig**, wenn die Liste genau einen Eintrag hat (dann ist es ein Beispielwert) |
| `parameters[].valuesFromText` | aus `description` | mit Mustern wie `'x' or 'y'`, `Can be either`, `Allowed values` ausgelesen; Ergebnis ist ein **Vorschlag**, kein Schema |
| `parameters[].ref` | `.schema.$ref` | nur bei den neun Parametern mit `schema` |
| `responses[]` | Schlüssel der Form `"400 (5)"` | in Status und `error_code` zerlegt |
| `successFields[]` | `$ref` der 200er-Antwort | Feldname, Typ laut Spezifikation |

`scripts/scaffold-catalog.ts` erzeugt daraus einen Rohling je Endpunkt mit allen
Parameternamen, den Typen und der bereinigten Beschreibung als Kommentar. Der Rohling ist
**kein lauffähiges Schema**: Jedes Feld trägt einen `TODO`-Marker, und `check-coverage.ts` bricht
ab, solange ein Marker übrig ist. Damit kann niemand versehentlich ein ungeprüftes generiertes
Schema ausliefern.

### 5.4 Was von Hand geschrieben wird

Je Parameter fallen sechs Entscheidungen, die ausschließlich von Hand fallen:

1. **Name im Werkzeug.** Regel: gleich dem API-Namen, außer bei den sieben Vorkommen von `type`.
   Die werden zu `receipt_type`, `posting_type`, `contact_type`, `account_type` und so weiter.
   Die Umbenennung findet in `buildBody` statt, der HTTP-Request trägt den Originalnamen.
2. **Enum oder freier String.** Ein `enum` nur, wenn der Wertevorrat abzählbar, mandantenunabhängig
   und belegt ist. `enumInSpec` mit einem Eintrag ist nie ein Enum. Mandantendaten
   (`postingaccount_number`, `cost_location`, `account`) sind nie ein Enum, sondern tragen den
   Verweis auf das Nachschlagewerkzeug in der Beschreibung. Jedes gesetzte Enum trägt in
   `src/schema/enums.ts` einen Kommentar mit seiner Herkunft. Es gilt die Kehrseite strenger
   Validierung: Ein zu enges Enum lehnt gültige Vorgänge vor dem Netzaufruf ab, und zwar
   unsichtbar für jeden, der nur das Serververhalten beobachtet. Im Zweifel bleibt
   der Wert ein String mit Wertevorrat im Beschreibungstext.
3. **Pflicht oder optional.** Bei schreibenden Werkzeugen sind alle fachlich entscheidenden
   Felder Pflicht, auch wenn die Spezifikation sie als optional führt (`tool-design.md` 6.4).
   Konkret betroffen: `postingaccount_number` und `vat` bei allen `postings`-Werkzeugen,
   `account` bei `bb_transactions_create`, `currency` bei allen Werkzeugen mit Betrag.
4. **Typ.** Datum als `string` mit `format: "date"`. Betrag als `string` mit dem Muster
   `^-?\d+(\.\d{1,2})?$`, **nie** als `number`, obwohl die API eine Zahl erwartet; die Umwandlung
   macht `src/wire/encode.ts` am Rand. Boolean als echtes `boolean`. Kennungen als `integer` beim
   Senden, weil die API sie so erwartet, und als `string` in jeder Antwort, weil sie so kommen.
5. **Beschreibungstext.** Pflicht für jeden Parameter, mit Bedeutung, Format, Beispielwert,
   Bedeutung des Weglassens, Default und Obergrenze.
6. **Zugehörigkeit zu einer Querprüfung.** Siehe 5.5.

### 5.5 Querprüfungen, die kein JSON Schema ausdrücken kann

Diese Prüfungen laufen als `superRefine` am Schema und damit **vor** jedem Request. Sie sind der
wirksamste Einzelteil dieses Entwurfs, weil jede von ihnen einen Fehler abfängt, der sonst als
falscher Datensatz in der Buchhaltung landet.

| # | Prüfung | Betroffene Werkzeuge | Warum |
| --- | --- | --- | --- |
| Q1 | Alle parallelen Positionsarrays eines Aufrufs sind gleich lang | 21 bis 26, 17 bis 19 | Einzige Invariante der Konstruktion. Ungleich lange Arrays erzeugen eine Splitbuchung mit verschobenen Zuordnungen |
| Q2 | Die Summe der Positionsbeträge entspricht dem Beleg- oder Zahlungsbetrag | 21 bis 24 | Die API lehnt das ab (`the total amount of all postings does not match ...`). Clientseitig geprüft spart es einen Request und macht den Fehler verständlich. Rechnung in Ganzzahl-Cent |
| Q3 | `date_from <= date_to` | 1, 9, 20, 52, 53, 54 | Vertauschte Grenzen liefern still eine leere Liste |
| Q4 | `limit` innerhalb des endpunktspezifischen Maximums | 1, 9, 20, 32, 36, 40, 46 | Die API kappt nicht, sie lehnt ab (`error_code` 10 bei `/receipts/get`) |
| Q5 | Kein leerer String in einem optionalen Feld | alle | Ein leerer String ist bei den meisten Feldern ein Validierungsfehler, kein Weglassen. Das Schema lehnt ihn ab und nennt das Weglassen als richtigen Weg |
| Q6 | `items`-Länge innerhalb `BB_MCP_MAX_BATCH` und innerhalb des API-Maximums von 50 | 5, 13, 15, 22, 24, 26, 34, 38 | Doppelte Grenze: Betreiberwunsch und API-Regel |
| Q7 | Betrag ungleich `0.00` | 4, 5, 6, 12, 13 | Ausdrücklich ungültig laut Spezifikation |
| Q8 | `date_delivery <= date` | 4, 5, 6 | DATEV-Regel, die API lehnt sonst ab |
| Q9 | Gegenseitiger Ausschluss von `id_by_customer_from`/`to` und der Sortierung | 9 | Das Setzen der Kennungsgrenzen überschreibt die Sortierung; die Beschreibung sagt das, das Schema lehnt die Kombination ab |
| Q10 | `order` gegen die **je Endpunkt eigene** Form | 1, 20, 40 | Drei Endpunkte, drei Syntaxen. `/postings/get` ist case sensitive, live bestätigt (Befund C) |
| Q11 | `BB_MCP_MAX_AMOUNT`, falls gesetzt | alle der Klassen A und B mit Betrag | Betreibergrenze |
| Q12 | Bei `bb_invoices_create_einvoice`: `item_tax_amount` ist an jeder Position gesetzt, an der `item_tax_type` einen Steuerbetrag verlangt | 19 | Die Spezifikation führt das Feld als `required`; ein Schema, das es optional lässt, schickt Positionen ohne Steuerbetrag hinaus |

Jede Querprüfung hat einen eigenen Testfall mit einem positiven und einem negativen Beispiel.

### 5.6 Der Abgleichstest, der die Vollständigkeit beweist

`tests/contract/coverage.test.ts` ist die Abnahmeprüfung für E6. Er lädt
`generated/endpoint-facts.json` und den Katalog und prüft fünf Aussagen:

1. **Pfadmenge.** Die Menge der Katalogpfade ist gleich der Menge der Pfade in der
   OpenAPI-Datei. Kein Pfad fehlt, keiner ist zu viel. Erwartet: 54.
2. **Parametermenge je Pfad.** Jeder Parameter der Spezifikation außer `api_key` ist im
   Eingabeschema des zugehörigen Werkzeugs erreichbar, entweder unter seinem Namen oder unter
   einem im Katalog ausdrücklich erklärten Aliasnamen (`renamedFrom`). Umgekehrt bildet jeder
   Schemaparameter auf einen Spezifikationsparameter ab. Gesamtzahl der geprüften Zuordnungen:
   317.
3. **Pflichtfelder.** Jeder Parameter, den die Spezifikation als `required` führt, ist im Schema
   Pflicht. Der umgekehrte Weg ist erlaubt und wird gezählt und ausgegeben: Das sind die
   Verschärfungen aus 5.4 Punkt 3, und die Liste ist Teil der Testausgabe, damit sie bewusst
   bleibt.
4. **Klassentabelle.** Jedes registrierte Werkzeug steht genau einmal in der Klassentabelle,
   die Tabelle enthält kein Werkzeug, das nicht registriert ist, und die Wirkung aus
   `grundlagen.md` 7.3 stimmt mit der Klasse überein (lesend genau dann, wenn Klasse R).
5. **Annotationen.** Die vier Annotationen jedes Werkzeugs sind gleich den Werten, die die
   Klassentabelle aus 4.1 für seine Klasse vorschreibt. Kein Werkzeug ohne alle vier.

Der Test läuft in der CI und zusätzlich wöchentlich gegen die dann aktuelle Fassung der
OpenAPI-Datei (`spec-drift.yml`). Ändert der Anbieter die Spezifikation, schlägt er fehl, und
zwar bevor ein Nutzer den Unterschied merkt.

### 5.7 Kostenabschätzung

54 Werkzeuge mit 60 bis 220 Wörtern Beschreibung plus Parameterbeschreibungen sind deutlich
mehr als die 10.000 Token, die `tool-design.md` 11.9 als Budget für 34 Werkzeuge nennt.
`scripts/count-definition-tokens.ts` misst den Wert nach dem ersten vollständigen Entwurf.
**Annahme, nicht gemessen:** 18.000 bis 26.000 Token für alle 54 Definitionen.

Das ist der Preis von E1 und wird hier offen benannt, nicht wegdefiniert. Drei Hebel stehen zur
Verfügung, ohne E1 anzutasten, und zwar in dieser Reihenfolge:

1. Parameterbeschreibungen der Batch-Werkzeuge verweisen auf die Beschreibung des
   Einzelwerkzeugs, statt sie zu wiederholen.
2. Die fünf Sätze bleiben Pflicht, aber der Beispielaufruf am Ende der Beschreibung nur bei den
   fünf kompliziertesten Werkzeugen (17, 19, 21, 23, 25).
3. Clientseitiges Deferred Loading unterstützen, indem Namen und Beschreibungen durchsuchbar
   bleiben. Das ist eine Clientfähigkeit, die der Server nicht erzwingen kann.

Werkzeuge zu streichen ist ausdrücklich **kein** Hebel; das verletzt E1 und E6.

---

## 6. HTTP-Schicht

### 6.1 Client

Ein einziger Aufrufpunkt, `src/http/client.ts`. Alles andere spricht nur mit ihm.

| Eigenschaft | Festlegung | Begründung |
| --- | --- | --- |
| Bibliothek | eingebautes `fetch` von Node, `undici` nur als Testabhängigkeit für `MockAgent` | kein zusätzliches Laufzeitrisiko, `toolchain.md` 7 |
| Methode | immer `POST` | die API kennt nichts anderes |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1`, über `BB_API_BASE_URL` überschreibbar | Testbarkeit; die Variable wird auf `https://` und einen Host ohne Anmeldeteil geprüft |
| Authentifizierung | `Authorization: Basic ` plus Base64 von `client:secret` über `Buffer.from(..., "utf8")` | `btoa` scheitert an Nicht-ASCII-Zeichen im Secret |
| Header | `Content-Type: application/json`, `Accept: application/json`, `User-Agent` mit Paketname und Version | Der `User-Agent` macht den Server in Anbieterprotokollen erkennbar |
| Body | immer JSON, niemals formularkodiert | erhält Booleans, `null` in Arrays und das `order`-Objekt und entspricht dem deklarierten Typ |
| `api_key` | vom Client in den Body gesetzt, nicht vom Katalog | ein einziger Ort, an dem das Geheimnis den Body berührt |
| Cookies | `Set-Cookie` wird verworfen, kein Jar | `grundlagen.md` 3.3; eine geteilte Sitzung über Mandanten hinweg wäre ein Risiko |
| Umleitungen | `redirect: "error"` | die API leitet nicht um; eine Umleitung ist ein Anzeichen für einen falschen Host |
| Abbruch | `extra.signal` beziehungsweise `ctx.mcpReq.signal` wird an `fetch` durchgereicht, `throwIfAborted()` zu Beginn jedes Handlers | `mcp-sdk-typescript.md` 10.4 Punkt 8 |

### 6.2 Zeitlimits

Drei Stufen, je Katalogeintrag wählbar, Werte über Umgebungsvariablen überschreibbar.

| Stufe | Wert | Gilt für |
| --- | --- | --- |
| kurz | 15 s | alle lesenden Endpunkte außer den Berichten |
| normal | 30 s | alle schreibenden Endpunkte außer Upload und Batch |
| lang | 90 s | `bb_receipts_upload`, alle `*_batch`, `bb_reports_get_bwa`, `bb_reports_get_sums`, `bb_reports_get_ledger`, `bb_reports_create_*` |

Das Zeitlimit wird über `AbortSignal.timeout` gesetzt und mit dem Abbruchsignal des Clients über
`AbortSignal.any` verknüpft. Ein Zeitlimit bei einem **schreibenden** Aufruf wird nicht als
Fehlschlag gemeldet, sondern als Ungewissheit; siehe 6.5.

### 6.3 Retry-Politik, getrennt nach lesend und schreibend

Das ist die Stelle, an der ein unbedachter Retry Doppelbuchungen erzeugt: Die API kennt
keinen Idempotenzschlüssel, ein wiederholter Schreibaufruf ist deshalb ein zweiter Vorgang.
Die Politik hier ist bewusst unsymmetrisch.

**Lesend, also ausschließlich die 15 Werkzeuge der Klasse R.**

- Höchstens drei Versuche insgesamt.
- Wiederholt wird bei: Netzwerkfehler, Zeitlimit vor dem Absenden, HTTP 5xx, HTTP 504 mit
  `error_code` 30, HTTP 500 mit `error_code` 0, HTTP 429 (in der Spezifikation nicht vorgesehen,
  defensiv berücksichtigt) und HTTP 403 mit `error_code` 15 **nur dann**, wenn die Meldung nicht
  `invalid sort field specified` lautet. Dieser eine Sonderfall ist der Grund, warum die
  Klassifikation das Paar `(Pfad, error_code)` und zusätzlich den Meldungstext auswertet: Code
  15 heißt an `/receipts/get` etwas völlig anderes als an allen Batch-Endpunkten
  (`fehlercodes.md` C und D.2).
- Nie wiederholt wird bei: 400, 401, 403 mit `error_code` 11 oder 12, 422.
- Backoff: `base * 2^n` mit `base = 1000 ms`, dazu **echter Jitter** im Bereich `[0.5, 1.5]` um
  den vollen Wert, gedeckelt bei 20 s. Nicht `Math.random()` als Faktor auf den ganzen Wert; das
  ist "full jitter" und wartet im Mittel nur die Hälfte des berechneten Abstands.
- **Jeder Versuch entnimmt einen eigenen Token aus dem Rate-Limiter.** Der Limiter liegt in der
  Schleife, nicht davor. Sonst erzeugt ausgerechnet der Fehler, der Drosselung anzeigt,
  ungebremste Zusatzlast.

**Schreibend, also die 39 Werkzeuge der Klassen A, AR, M, D und B.**

- **Kein automatischer Retry. Niemals. Unter keinen Umständen.** Die API kennt keinen
  Idempotenzschlüssel (`grundlagen.md` 7.1). Ein zweiter Versuch kann eine zweite Buchung
  erzeugen, und eine stille Doppelbuchung ist schlimmer als ein sichtbarer Fehler.
- Die Ausnahme, die keine ist: Auch ein Netzwerkfehler **vor** dem Absenden wird nicht
  wiederholt, weil der Client nicht unterscheiden kann, ob der Server die Anfrage schon gesehen
  hat. Nur ein Fehler, der nachweislich vor dem ersten gesendeten Byte auftritt, also ein
  Fehler bei der DNS-Auflösung oder beim Verbindungsaufbau, ist sicher, und diese Unterscheidung
  ist über `fetch` nicht zuverlässig zu treffen. Deshalb: gar nicht.
- Diese Regel ist nicht konfigurierbar. Es gibt keine Umgebungsvariable, die sie aufhebt.
- `tests/contract/no-write-retry.test.ts` beweist sie: Für jedes der 39 Werkzeuge wird ein
  Netzwerkfehler eingespielt und gezählt, wie oft der Mock angesprochen wurde. Erwartet: genau
  einmal.

### 6.4 Rate Limiting

Prozesslokaler Token-Bucket, Nachfüllung kontinuierlich, Serialisierung über eine Promise-Kette
je Bucket. Ohne diese Serialisierung rechnen gleichzeitige Aufrufe dieselbe Wartezeit aus und
laufen gemeinsam durch, der Limiter wirkt dann nicht.

| Bucket | Kapazität | Nachfüllrate | Gilt für |
| --- | --- | --- | --- |
| `general` | 70 | 70 pro Minute | jeden Aufruf |
| `batch` | 1 | 1 alle 5 Sekunden | `bb_receipts_create_batch`, `bb_transactions_create_batch` und, defensiv, alle übrigen `*_batch` |
| `upload` | 8 | 8 pro Minute | `bb_receipts_upload` |
| `reports` | 1 | 1 alle 10 Sekunden | `bb_reports_create_bwa`, `bb_reports_create_sums` |

70 statt der dokumentierten 100 ist bewusster Sicherheitsabstand: Das Limit gilt pro Mandant und
wird mit jeder anderen Anwendung geteilt, die denselben Mandanten bedient (`grundlagen.md` 3.1).
Ein MCP-Server, der es allein ausschöpft, sperrt dem Nutzer die Weboberfläche aus. Der Wert ist
über `BB_MCP_RATE_PER_MINUTE` einstellbar, aber nach oben auf 100 begrenzt.

Der `reports`-Bucket ist eine Zugabe dieses Entwurfs. Er ist kein API-Limit, sondern eine Bremse
gegen das Muster "create, sofort get, `error_code` 8, sofort wieder create", das einen laufenden
Bericht mehrfach ersetzt.

Wartet ein Aufruf länger als 30 Sekunden auf einen Token, bricht er mit einer Meldung ab, die
die Wartezeit nennt und zum Zusammenfassen der Anfragen rät, statt stumm weiterzuwarten.

### 6.5 Content-Type-Prüfung und Umschlagzerlegung

Vier Stufen, in dieser Reihenfolge. Jede Stufe hat einen eigenen Fehlertyp.

1. **Content-Type.** Beginnt der Wert nicht mit `application/json`, wird der Körper **nicht**
   geparst. Stattdessen ein `NonJsonResponseError` mit HTTP-Status, dem gemeldeten Content-Type
   und den ersten 200 Zeichen des Körpers, von HTML-Tags befreit. Das ist der dokumentierte Fall
   "unbekannter Pfad liefert HTML" (`grundlagen.md` 4.4 und Stolperfalle 15). Die Prüfung erfolgt
   über den Header, nicht über einen `try` um `JSON.parse`: Ein `try` fängt den Fehler zwar auch,
   verliert aber die Information, dass der Server gar nicht als API geantwortet hat.
2. **JSON-Zerlegung.** Schlägt sie trotz passendem Content-Type fehl, `MalformedJsonError` mit
   derselben Zeichenbegrenzung.
3. **Umschlagform.** Es muss ein Objekt mit einem booleschen `success` sein. Fehlt `success`, ist
   das ein `EnvelopeContractError`. Das ist kein Formalismus: Ein Antwortkörper ohne `success`
   ist entweder eine andere API oder ein Zwischenknoten, und beides darf nicht als Erfolg
   durchgehen.
4. **Erfolg oder Fehler.**
   - `success === true`: `rows` und `data` werden **nicht** vorausgesetzt. Reine Aktionsendpunkte
     liefern nur `success` und `message`, und der Einzelabruf liefert `data` als Objekt ohne
     `rows` (Befund B). Welche Form erwartet wird, sagt der Katalogeintrag über das Feld
     `shape: "list" | "object" | "ack"`. Weicht die Antwort davon ab, ist das ein
     `EnvelopeContractError` und wird gemeldet, nicht stillschweigend geglättet.
   - `success === false`: `error_code` und `message` werden gelesen und an die Fehlerübersetzung
     in [Abschnitt 9](#9-fehlerbehandlung) gegeben.

**HTTP-Status und `success` werden beide ausgewertet, nicht nur einer.** Ein HTTP 200 mit
`success: false` ist möglich, ein HTTP 400 mit `success: true` wäre ein Widerspruch und wird als
`EnvelopeContractError` gemeldet.

### 6.6 Umgang mit den 718 endpunktspezifischen Fehlercodes

Siehe [Abschnitt 9](#9-fehlerbehandlung). Kurz: Schlüssel ist immer das Paar
`(Pfad, error_code)`, nie der Code allein.

---

## 7. Konfiguration

### 7.1 Umgebungsvariablen

| Variable | Pflicht | Default | Bedeutung |
| --- | --- | --- | --- |
| `BB_API_CLIENT` | ja | keiner | API Client, Benutzername der Basic-Authentifizierung |
| `BB_API_SECRET` | ja | keiner | API Secret, Passwort der Basic-Authentifizierung |
| `BB_API_KEY` | ja | keiner | Mandantenauswahl, Feld `api_key` im Body |
| `BB_MCP_CREDENTIALS_FILE` | nein | plattformabhängiger Standardpfad | Pfad zu einer Zugangsdatendatei, falls die drei Werte nicht in der Umgebung stehen |
| `BB_MCP_PROFILE` | nein | `default` | Name des Mandantenprofils in der Zugangsdatendatei |
| `BB_API_BASE_URL` | nein | `https://webapp.buchhaltungsbutler.de/api/v1` | nur für Tests und Vorführungen; muss `https://` sein und darf keinen Anmeldeteil tragen |
| `BB_MCP_READ_ONLY` | nein | `false` | **aus im Auslieferungszustand.** Bei `true` führt der Server nur die 15 Werkzeuge der Klasse R aus |
| `BB_MCP_MAX_BATCH` | nein | `50` | Obergrenze für `items`-Arrays; wird zusätzlich zur API-Grenze von 50 geprüft, der kleinere Wert gewinnt |
| `BB_MCP_MAX_AMOUNT` | nein | nicht gesetzt | Wenn gesetzt: Betragsobergrenze für Werkzeuge der Klassen A und B mit Betragsfeld, als Dezimalzeichenkette |
| `BB_MCP_RATE_PER_MINUTE` | nein | `70` | Nachfüllrate des `general`-Buckets, hart auf höchstens 100 begrenzt |
| `BB_MCP_TIMEOUT_MS` | nein | `30000` | Zeitlimit der Stufe "normal"; kurz und lang skalieren mit Faktor 0,5 und 3 |
| `BB_MCP_MAX_RESPONSE_TOKENS` | nein | `5000` | weiche Kürzungsgrenze je Antwort |
| `BB_MCP_LOG_LEVEL` | nein | `warn` | `error`, `warn`, `info`, `debug`; Ausgabe ausschließlich nach stderr |
| `BB_MCP_AUDIT_LOG` | nein | `off` | `off` oder ein Dateipfad; schreibt je Aufruf eine Zeile ohne Zugangsdaten |
| `BB_ALLOWED_FILE_DIRS` | nein | nicht gesetzt | Wenn gesetzt: Liste erlaubter Verzeichnisse für `file://`-Quellen bei `bb_receipts_upload`. Ohne diese Variable ist `file://` **abgeschaltet** |
| `BB_MCP_ALLOW_URL_UPLOAD` | nein | `false` | Wenn `true`: `bb_receipts_upload` akzeptiert `http(s)://`-Quellen. Default aus, weil der Parameter modellgesteuert ist |

Nicht vorhanden und ausdrücklich nicht zu ergänzen: eine Variable, die den Retry für schreibende
Aufrufe einschaltet; eine Variable, die den Nur-Lesen-Schalter zur Laufzeit umlegt; eine
Kommandozeilenoption für irgendeinen der drei Geheimniswerte (`distribution.md` 13.1).

### 7.2 Startvalidierung

`src/config/startup-check.ts`, in dieser Reihenfolge, bevor der Transport geöffnet wird:

1. **Node-Version** gegen `>=22.12.0`. Unterschreitung: Abbruch mit Exit-Code 1 und einer Zeile
   nach stderr, die die gefundene und die verlangte Version nennt.
2. **Zugangsdaten auflösen.** Reihenfolge: Umgebung vor Zugangsdatendatei. Fehlt einer der drei
   Werte, startet der Server **trotzdem**, meldet aber in den `instructions` und in jeder
   Werkzeugantwort, dass die Konfiguration unvollständig ist, und nennt die fehlende Variable.
   Begründung für diese Entscheidung: Ein MCP-Server, der beim Start abbricht, erscheint im
   Client als "Server failed to start" ohne jeden Hinweis auf die Ursache. Ein Server, der läuft
   und beim ersten Aufruf eine präzise Meldung liefert, ist diagnostizierbar. Die Alternative
   wurde geprüft und verworfen.
3. **Zugangsdatendatei**, falls benutzt: Rechte prüfen. Sind sie weiter als `0600`, eine Warnung
   nach stderr mit dem Pfad und dem Befehl zur Korrektur. Kein Abbruch, weil Windows keine
   Entsprechung hat.
4. **Werteprüfung** der übrigen Variablen gegen ein Zod-Schema. Ein unbrauchbarer Wert, etwa
   `BB_MCP_MAX_BATCH=abc`, führt zum **Abbruch**, nicht zum stillen Zurückfallen auf den Default.
   Das ist der Unterschied zu Punkt 2: Eine fehlende Zugangsangabe ist ein Zustand, den der
   Nutzer erwartet und beheben kann; ein falsch geschriebener Grenzwert ist ein Irrtum, der
   unbemerkt eine Schutzschicht abschaltet.
5. **Kein Verbindungsaufbau beim Start.** Der Server spricht erst beim ersten Werkzeugaufruf mit
   der API. Ein Verbindungstest beim Start kostet bei jedem Clientneustart einen Request aus dem
   Minutenkontingent des Mandanten, und der Client zeigt das Ergebnis ohnehin nirgends an. Für
   den bewussten Test gibt es `bbutler-mcp doctor` und `bbutler-mcp test`.
6. **Konfiguration einfrieren.** Das Config-Objekt wird `Object.freeze`-t und ist danach für den
   Rest der Prozesslaufzeit unveränderlich. Kein Werkzeug, kein Handler und keine Resource kann
   es ändern.

### 7.3 Der Nur-Lesen-Schalter im Einzelnen

Umsetzung genau nach `tool-design.md` 9.5 und der Ergänzung in E2:

- Default `false`. Wer nichts setzt, bekommt alle 54 Werkzeuge voll nutzbar.
- Wird einmal beim Start gelesen und danach nie wieder.
- Gesperrte Werkzeuge bleiben in `tools/list` **sichtbar**. Die Werkzeugliste hängt nicht vom
  Schalter ab. Ein Agent, der ein Werkzeug nicht sieht, sucht Umwege; ein Agent, der eine klare
  Absage liest, kann sie dem Nutzer erklären.
- Die Absage erfolgt als `isError: true`, **bevor** irgendetwas gesendet wird, und trägt den in
  `tool-design.md` 9.5 wörtlich vorgegebenen Text, einschließlich des Satzes "Do not try other
  tools of this server to work around it."
- Die Sperre liest die Klasse aus der Klassentabelle, nicht aus dem Namen. `bb_reports_get_ledger`
  endet auf einen Qualifizierer und ist lesend; `bb_postings_assign_receipt` endet auf einen
  Qualifizierer und ist buchend.
- `bb_reports_create_bwa` und `bb_reports_create_sums` sind eingeschlossen, obwohl sie keinen
  Buchungsbestand ändern. Sie ersetzen den Vorgängerbericht, und ein Server mit ausdrücklichem
  Schreibverbot, der fremde Berichte überschreibt, bricht seine Zusage.
- Die `instructions` des Servers nennen den Zustand des Schalters wörtlich und, wenn er aktiv
  ist, die Folge: BWA und Summen- und Saldenliste sind nicht erreichbar, das Kontenblatt schon.

### 7.4 Verhalten bei fehlender oder falscher Konfiguration

| Lage | Verhalten |
| --- | --- |
| Eine der drei Pflichtvariablen fehlt | Server startet, `instructions` nennen die fehlende Variable, jeder Werkzeugaufruf antwortet mit `isError: true` und derselben Angabe. Kein Request. |
| Client oder Secret falsch | erster Aufruf liefert HTTP 401 mit `error_code` 3. Übersetzt zu: "API Client or API Secret is wrong. Check BB_API_CLIENT and BB_API_SECRET. This is a configuration error, retrying will not help." |
| `api_key` falsch oder nicht freigeschaltet | HTTP 401 mit `error_code` 4. Übersetzt zu einer Meldung, die ausdrücklich beide Ursachen nennt, weil der Code sie nicht unterscheidet |
| Mandant inaktiv | HTTP 403 mit `error_code` 11. Übersetzt zu einem Hinweis auf den Kontostatus, nicht auf die Serverkonfiguration |
| `BB_API_BASE_URL` ohne `https://` | Abbruch beim Start mit Begründung |
| `BB_MCP_MAX_BATCH` über 50 | Abbruch beim Start mit Nennung der API-Grenze |
| Zugangsdatendatei vorhanden, aber unlesbar | Behandlung wie "fehlt", zusätzlich eine Warnzeile nach stderr mit dem Pfad, ohne Inhalt |

In keiner dieser Meldungen erscheint ein Geheimnis, auch nicht maskiert. `src/util/redact.ts`
läuft über jeden Text, der den Prozess verlässt, und ersetzt jedes Vorkommen der drei Werte
durch `[redacted]`. Das ist eine zweite Verteidigungslinie, keine Entschuldigung dafür, sie
irgendwo einzusetzen.

---

## 8. Antwortaufbereitung

### 8.1 Was der Agent zurückbekommt: beides, immer

Jede erfolgreiche Antwort trägt drei Teile:

1. **`structuredContent`**, validiert gegen das `outputSchema` des Werkzeugs. Das ist die
   Fassung zum Weiterverarbeiten.
2. **Ein `content`-Textblock** mit derselben Information als Markdown-Tabelle (Listen) oder als
   lesbare Zusammenfassung (Einzelobjekte, Bestätigungen). Das ist die Fassung, die ein Client
   ohne `structuredContent`-Unterstützung anzeigt und die der Nutzer im Freigabedialog liest.
3. **Einen Navigationsblock**, wenn es einen nächsten Schritt gibt.

Beides nebeneinander ist von `MCP-SPEC-TOOLS` für die Abwärtskompatibilität empfohlen und hier
zusätzlich eine Korrektheitsmaßnahme: Der Text ist das, was der Mensch sieht, das strukturierte
Feld das, was die Maschine sieht. Sie werden aus **derselben** Datenstruktur erzeugt, damit sie
nicht auseinanderlaufen.

**Feldnamen bleiben im Original.** Kein `Title Case`, keine Übersetzung, keine Verschönerung. Der
Feldname der Antwort ist der Parametername des nächsten Aufrufs; wer `id_by_customer` zu
`Id By Customer` macht, nimmt dem Modell diese Information.

### 8.2 Typnormalisierung: was der Draht in der Rückrichtung tut

Die API liefert Werte anders, als sie sie entgegennimmt. Der Draht korrigiert das an genau einer
Stelle, deterministisch, und dokumentiert jede Korrektur im `outputSchema`.

| Rohwert der API | Ausgabe im `structuredContent` | Begründung |
| --- | --- | --- |
| `"884.65"` (Betrag als String) | unverändert `"884.65"`, Typ `string` | **Niemals** in `number`. Eine Gleitkommazahl für Geld ist ein Fehler, und eine stille Rundung in der Buchhaltung ist der schlimmste denkbare Ausgang |
| `"0"` / `"1"` bei `deleted` und ähnlichen | echtes `false` / `true`, Typ `boolean` | Ein Modell, das `Deleted: 0` liest, muss raten. Jede so normalisierte Eigenschaft ist im `outputSchema` mit "normalized from string 0/1" beschrieben |
| `"2"` bei `/receipts/*` und `2` bei `/transactions/*` (Kennung) | immer `string` | Kennungen sind Bezeichner, keine Rechengrößen. Eine einheitliche Form verhindert, dass ein Vergleich `"2" === 2` fehlschlägt |
| `null` | `null`, nicht weggelassen und nicht zu `""` | "nicht gesetzt" und "leer" sind fachlich verschieden |
| unbekanntes Feld | unverändert durchgereicht, gezählt | Die Spezifikation ist unvollständig; Verwerfen wäre Datenverlust |
| bekanntes Feld fehlt oder hat den falschen Typ | **Vertragsbruch**, siehe 8.3 | genau hier entsteht der stille Datenfehler |

Werte, die **nicht** normalisiert werden: Datumszeichenketten (durchreichen, nicht in eine
Zeitzone umrechnen, weil keine Quelle eine Zeitzone nennt), Währungskürzel, Freitext.

In der Betriebsart `detailed` wird zusätzlich das unveränderte Rohobjekt unter dem Schlüssel
`raw` mitgeliefert. Damit ist jede Normalisierung nachprüfbar, ohne dass die Standardantwort
doppelt so groß wird.

### 8.3 Was passiert, wenn die API etwas Unerwartetes liefert

Die vier Fälle und ihre Behandlung. Keiner davon endet in einer stillen Glättung.

| Fall | Behandlung |
| --- | --- |
| Antwort ist kein JSON | `isError: true`, Meldung nennt HTTP-Status, Content-Type und die ersten 200 Zeichen ohne HTML-Tags, dazu den Satz, dass dies auf einen unbekannten Pfad oder eine Zwischenstation hindeutet |
| Umschlag ohne `success` | `isError: true`, Umschlagbruch, mit der gesehenen Schlüsselmenge |
| Antwortform weicht vom Katalog ab (`list` erwartet, `object` bekommen) | `isError: true`, mit der Angabe, was erwartet und was gesehen wurde |
| Ein bekanntes Feld fehlt oder hat den falschen Typ | **Kein** `isError`. Die Antwort wird geliefert, aber `structuredContent` trägt zusätzlich `_contract_warnings: [...]` mit Feldname, erwartetem und gesehenem Typ, und der Textblock beginnt mit einer Warnzeile |

Der letzte Fall ist die wichtigste Einzelentscheidung dieses Abschnitts. Er ist **kein** Fehler,
weil die Spezifikation nachweislich falsch ist und ein harter Abbruch den Server bei jeder
kleinen Anbieteränderung unbrauchbar machen würde. Er ist aber auch **nicht stumm**, weil genau
hier die falschen Zahlen entstehen. Die Warnung geht in dieselbe Antwort, die der Agent liest,
und zusätzlich mit Stufe `warn` nach stderr.

Das Muster aus Befund B ist der Prüfstein: Hätte man `/receipts/get` und `/receipts/get/<id>`
denselben Vertrag gegeben, wäre `due_date` beim Einzelabruf immer leer gewesen. Mit getrennten
Verträgen fällt es nicht auf, weil es nicht passiert. Fügt der Anbieter morgen ein Feld um oder
benennt es um, meldet die Warnung es am selben Tag.

### 8.4 Kürzen

| Grenze | Wert | Verhalten |
| --- | --- | --- |
| weich | `BB_MCP_MAX_RESPONSE_TOKENS`, Default 5.000 | Zeilen ab der Überschreitung weglassen, Hinweis anhängen |
| hart | 20.000 | abschneiden, Zahl der unterdrückten Zeilen nennen |
| Standard-`limit` bei Suchen | 100 | konservativ, obwohl die API 500 erlaubt |

Die Tokenzahl wird geschätzt, nicht gemessen: Zeichen geteilt durch 3,5, aufgerundet. Eine
Schätzung, die zu früh kürzt, ist harmlos; eine, die zu spät kürzt, sprengt das Kontextfenster
des Clients. Die Richtung der Ungenauigkeit ist deshalb bewusst gewählt.

`file_content`, `file_pdf`, `file_csv` und jedes andere Base64-Feld wird aus dem Textblock
**immer** entfernt und im `structuredContent` durch einen Platzhalter mit Größenangabe ersetzt,
sofern der Aufrufer die Datei nicht ausdrücklich angefordert hat. Hat er sie angefordert, steht
sie nur im `structuredContent`, nie im Text.

### 8.5 Paginierung und wie der Agent erfährt, dass es mehr gibt

Das ist der Punkt, an dem eine Auto-Paginierung still Daten verliert, sobald sie die
Zeilenzahl einer Antwort für die Gesamttrefferzahl hält. Die Regeln hier schließen das aus.

1. **`rows` ist nicht die Gesamtzahl.** Live belegt: `rows` ist die Zeilenzahl dieser Antwort.
   Es gibt in dieser API **kein** Feld für die Gesamttrefferzahl. Der Server behauptet deshalb
   nirgends eine Gesamtzahl.
2. **Die Abbruchbedingung ist "weniger Zeilen als `limit`"**, nicht `rows`.
3. **Der Server paginiert nicht von sich aus.** Kein `auto_paginate`. Ein Werkzeugaufruf ist ein
   API-Aufruf. Begründung: Eine Autopaginierung verbraucht ungefragt Minutenkontingent des
   Mandanten, und ihre Obergrenze erzeugt genau die Halbwahrheit, die dieser Entwurf vermeiden
   soll. Wer mehr Zeilen will, ruft das Werkzeug erneut auf und sieht dabei, was es kostet.
4. **Jede Listenantwort sagt drei Dinge**, wörtlich und immer:

```
Returned 100 rows (offset 0, limit 100).
This is the number of rows in THIS response. The BuchhaltungsButler API does not report a total
match count, so it is unknown whether more rows exist.
Since the response is full (rows == limit), there are probably more. To continue, call
bb_receipts_search again with the same filters and offset=100.
To narrow the result instead, add date_from/date_to or counterparty.
```

Ist die Seite nicht voll, lautet Satz drei stattdessen: "The response is not full
(rows 37 < limit 100), so this is the last page."

5. **Die Kleindefaults werden nie dem Server überlassen.** `limit` wird bei jedem der sieben
   paginierten Endpunkte **immer explizit** gesendet, auch wenn der Aufrufer es weggelassen hat.
   Sonst greift bei `/settings/get/debtors` und `/settings/get/creditors` der Serverdefault 25,
   und 25 Zeilen sehen aus wie das vollständige Ergebnis (`grundlagen.md` 5.2).
6. **`/accounts/get` kennt keine Paginierung** und liefert immer alles. Die Antwort sagt das
   ausdrücklich, damit der Agent nicht nach `offset` sucht.

### 8.6 Antworten schreibender Werkzeuge

Jede Antwort eines schreibenden Werkzeugs nennt:

- den benutzten Endpunkt,
- den angelegten, geänderten oder gelöschten Datensatz **aufgelöst**, also mit Datum, Betrag und
  Gegenpartei, nicht nur mit seiner Kennung,
- die dem Server bekannten Folgewirkungen, etwa bestehende Zuordnungen,
- bei den Klassen D und B den Weg zurück, sofern es einen gibt, und ausdrücklich dessen Fehlen,
  wo es keinen gibt,
- bei den Klassen A und B das Ergebnis der Duplikatsabfrage, falls ein Treffer vorlag.

Die Auflösung kostet bei einigen Werkzeugen einen zusätzlichen Leseaufruf. Das ist ein bewusster
Preis: Ohne ihn sieht der Nutzer im Verlauf nur eine Zahl und kann eine Fehlbuchung nicht
erkennen. Wo die API den angelegten Datensatz in der Antwort mitliefert, entfällt der
Zusatzaufruf; das steht je Katalogeintrag im Feld `resolveAfterWrite`.

### 8.7 Freitext aus der API

`src/response/sanitize.ts` läuft über jedes Zeichenkettenfeld, das aus der API kommt, bevor es in
den Text geht:

- Steuerzeichen und Bidi-Steuerzeichen werden entfernt.
- Zeilenumbrüche in Tabellenzellen werden zu Leerzeichen.
- Der Text wird nie als Anweisung formatiert und nie in einen Codeblock oder eine Überschrift
  gesetzt.
- Felder wie `counterparty`, `purpose`, `booking_text` und Kommentartexte stammen von Dritten.
  `MCP-SPEC-TOOLS` verlangt von Servern ausdrücklich, Ausgaben zu bereinigen.

Der Server liefert Daten und Navigationshinweise. Er formuliert keine Sätze, die das Modell zu
etwas anderem als der Auswertung des Ergebnisses auffordern.

---

## 9. Fehlerbehandlung

### 9.1 Grundsatz

Der Schlüssel ist immer das Paar `(Pfad, error_code)`. Niemals der Code allein. Belegt in
`docs/api/fehlercodes.md` Abschnitt C: Code 7 trägt 32 verschiedene Bedeutungen, Code 12 wechselt
neben der Bedeutung auch den HTTP-Status. Ausnahme sind allein die fünf Codes der
`Request_*`-Familie: 0, 3, 4, 11 und 30.

Ausführungsfehler gehen **immer** als `{ isError: true }` im Ergebnis zurück, nie als
JSON-RPC-Protokollfehler. Protokollfehler bleiben echten Protokollproblemen vorbehalten
(unbekannter Werkzeugname, kaputtes JSON-RPC).

### 9.2 Die Tabelle

`scripts/extract-errors.ts` liest die Schlüssel der Form `"400 (5)"` aus allen
`responses`-Blöcken und schreibt `generated/error-table.json`:

```jsonc
{
  "/receipts/get": {
    "10": { "http": 400, "message": "invalid limit specified", "class": "input" },
    "15": { "http": 400, "message": "invalid sort field specified", "class": "input" }
  },
  "/receipts/addBatch": {
    "15": { "http": 403, "message": "adding temporarily restricted", "class": "transient" }
  }
}
```

Die Spalte `class` wird beim Erzeugen aus dem Meldungstext abgeleitet und anschließend **von
Hand geprüft**, weil die Ableitung bei den Sonderfällen aus `fehlercodes.md` D.5 falsch liegt.
Die fünf Klassen:

| Klasse | Bedeutung | Retry | Meldung an den Agenten |
| --- | --- | --- | --- |
| `config` | Zugangsdaten, Mandantenstatus, nicht aktivierte Funktionen | nein | "This is a setup problem, not a parameter problem. Retrying will not help." plus die zu prüfende Variable oder Einstellung |
| `input` | Pflichtfeld fehlt, Wert ungültig, Länge, Zeichensatz, unbekannte Referenz | nein | der Vier-Block-Text aus 9.3 |
| `transient` | 500/0, 504/30, 403/15 an Batch- und Upload-Endpunkten | nur Klasse R | Wartezeit nennen, bei Klasse R automatisch, sonst die Entscheidung dem Aufrufer überlassen |
| `final` | "not found", Statuskonflikte, Betragsprüfungen, Kontingent erschöpft | nein | Zustand nennen und das Werkzeug, mit dem er vorher zu prüfen ist |
| `special` | Codes, deren Bedeutung ohne den Meldungstext nicht eindeutig ist | fallweise | zusätzlich den Originaltext der API zitieren |

`special` betrifft nach `fehlercodes.md` D.5 mindestens `/transactions/add` (Codes 23 und 24) und
`/invoices/create/e-invoice` (Codes 41 und 42). Für diese Endpunkte wertet `classify.ts`
zusätzlich den Meldungstext aus und verlässt sich nicht auf die Zahl.

**Zur Zahl.** Die Spezifikation enthält 718 Definitionen mit dem Suffix `_ErrorCode`, von denen
45 verwaist sind (in keinem `responses`-Block referenziert). Die tatsächlich in `responses`
referenzierten Paare `(Pfad, error_code)` sind **786**, weil mehrere Pfade dieselbe
`Request_ErrorCode*`-Definition teilen. Die Tabelle wird über die `responses`-Schlüssel gebaut,
also mit 786 Einträgen, nicht über die Definitionsnamen. Die verwaisten Definitionen werden
bewusst nicht aufgenommen: Sie sind kein belegtes Serververhalten.

Fehlt ein Paar in der Tabelle, also liefert die API einen Code, den die Spezifikation für diesen
Pfad nicht kennt, dann wird er als `final` behandelt, der Originaltext wörtlich zitiert und eine
Zeile mit Stufe `warn` nach stderr geschrieben. Kein Raten, keine Zuordnung zu einem
gleichnamigen Code eines anderen Pfades.

### 9.3 Aufbau jeder Fehlermeldung

Vier Blöcke, immer in dieser Reihenfolge, immer vorhanden (`tool-design.md` 8.2):

```
<Was schiefging, ein Satz>
<Warum, mit dem konkreten Wert, der das Problem verursacht hat>
<Was stattdessen zu tun ist, als konkreter Aufruf>
<Optional: welches Werkzeug vorher laufen muss>
```

Dazu drei Pflichtangaben, die dieser Entwurf ergänzt:

1. **Jede Meldung sagt ausdrücklich, ob etwas geändert wurde.** Drei Formulierungen, keine
   vierte:
   - "Nothing was sent to BuchhaltungsButler and nothing was changed." bei Ablehnung vor dem
     Request.
   - "BuchhaltungsButler rejected the request. Nothing was changed." bei einer Fehlerantwort mit
     HTTP 4xx und `success: false`.
   - "It is UNKNOWN whether BuchhaltungsButler processed this request." bei Zeitlimit,
     Verbindungsabbruch oder HTTP 5xx an einem **schreibenden** Werkzeug. Siehe 9.4.
2. **Bei ungültigem Enum-Wert** nennt die Meldung alle erlaubten Werte und, wenn erkennbar, den
   wahrscheinlich gemeinten (Levenshtein-Abstand 1 oder 2).
3. **Bei überschrittenen Grenzen** nennt die Meldung das billigere Aufrufmuster, nicht nur den
   korrigierten Wert.

Niemals enthalten: `api_key`, Secret, Authorization-Header, Stacktrace, roher HTML-Körper der
Gegenstelle, Dateisystemdetails.

### 9.4 Der Sonderfall: schreibender Aufruf ohne verwertbare Antwort

Dies ist der gefährlichste Zustand der ganzen Anwendung und bekommt deshalb einen eigenen
Fehlertyp, `src/errors/write-uncertainty.ts`. Auslöser: Zeitlimit, Netzwerkabbruch, HTTP 5xx
oder HTTP 504 mit `error_code` 30 an einem Werkzeug der Klassen A, AR, M, D oder B.

```
The request to BuchhaltungsButler did not complete (timeout after 30s).
It is UNKNOWN whether BuchhaltungsButler created the posting. The BuchhaltungsButler API has no
idempotency key, so this tool did NOT retry: a second attempt could create a second posting.
Before trying again, verify the current state with bb_postings_search using date_from and
date_to set to the posting date. If the posting is already there, do not call this tool again.
If it is not, you may repeat the call with exactly the same arguments.
```

Vier Eigenschaften dieses Textes sind Absicht: Er behauptet keinen Fehlschlag, er nennt den
Grund für den fehlenden Retry, er nennt das Prüfwerkzeug mit den konkreten Parametern, und er
sagt beide Ausgänge der Prüfung durch. Ohne den letzten Satz wiederholt ein vorsichtiger Agent
gar nichts und ein unvorsichtiger sofort.

### 9.5 Beispiele

**Nur-Lesen-Schalter** (wörtlich aus `tool-design.md` 9.5, nur mit dem jeweiligen Werkzeugnamen).

**Unbekanntes Sachkonto**

```
Posting account "4980" does not exist in this BuchhaltungsButler account.
Nothing was sent to BuchhaltungsButler and nothing was changed.
Posting accounts ("Sachkonten") are per-tenant master data and cannot be guessed from a standard
chart of accounts such as SKR03 or SKR04.
Call bb_postingaccounts_search first, pick postingaccount_number from the result, then repeat
this call.
```

**Ungleich lange Positionsarrays** (Querprüfung Q1, vor dem Request)

```
The line item arrays have different lengths: postingaccounts has 2 entries, amounts has 1.
Nothing was sent to BuchhaltungsButler and nothing was changed.
These arrays are positional: entry n of every array belongs to the same line. A mismatch would
create a split posting with shifted values.
Send one entry per array for every line, or use a single line by passing arrays of length 1.
```

**Sortierung mit falscher Schreibweise** (live bestätigt, Befund C)

```
BuchhaltungsButler rejected order="date asc" (error_code 17 on /postings/get). Nothing was
changed.
The order parameter of this endpoint is validated case sensitively and accepts only the exact
strings: "default", "date ASC", "date DESC", "date_last_action ASC", "date_last_action DESC",
"id_by_customer ASC", "id_by_customer DESC".
Retry with order="date ASC".
```

---

## 10. Der Einrichtungsassistent

### 10.1 Befehlsform

Binärname `bbutler-mcp`, Paket `@dennismenken/buchhaltungsbutler-mcp` (E3).
**Ohne Unterbefehl startet der MCP-Server auf stdio.** Das ist der Normalfall und der Grund,
warum in allen Clientkonfigurationen hinter dem Paketnamen kein Argument steht.

| Aufruf | Wirkung |
| --- | --- |
| `bbutler-mcp` | startet den MCP-Server auf stdio |
| `bbutler-mcp setup` | Einrichtungsassistent |
| `bbutler-mcp doctor` | Diagnose: Zugangsdaten auflösen, Verbindung testen, Dateirechte, gefundene Clientkonfigurationen |
| `bbutler-mcp test` | nur der Verbindungstest, geeignet für CI |
| `bbutler-mcp print-config --client <name>` | gibt den Konfigurationsblock aus, schreibt nichts |
| `bbutler-mcp profiles list\|add\|remove` | Mandantenprofile in der Zugangsdatendatei |
| `bbutler-mcp uninstall --client <name>` | entfernt den eigenen Eintrag beim genannten Client |
| `bbutler-mcp --version` / `--help` | Version, Hilfe mit der Liste der Clientkürzel |

Jeder Unterbefehl schreibt ausschließlich nach stdout und stderr eines Terminals, niemals in eine
laufende MCP-Verbindung. **Kein Unterbefehl nimmt ein Geheimnis als Argument entgegen**
(`distribution.md` 13.1). Im nicht interaktiven Betrieb liest der Assistent ausschließlich
`BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY`.

Clientkürzel: `claude-code`, `claude-desktop`, `codex`, `grok`, `vscode`, `cursor`, `windsurf`,
`lmstudio`, `cline`, `zed`, `continue`, `jan`.

### 10.2 Ablauf

1. **Vorprüfung.** Node-Version gegen `>=22.12.0`, Abbruch bei Unterschreitung. Vorhandene
   Clients erkennen: über `which`/`where` für `claude`, `codex`, `grok`, `code`, über die
   Existenz der bekannten Konfigurationspfade für Claude Desktop, Cursor, Windsurf, LM Studio.
   Gefundene Clients zuerst anbieten, die übrigen unter "Weitere".
2. **Zugangsdaten erfragen.** Drei maskierte Eingaben. Dazu der Hinweis, wo die Werte zu finden
   sind: Einstellungen, Schnittstellen und API-Zugang. Die Quellen widersprechen sich in der
   Menüführung (`grundlagen.md` 2.3), deshalb nennt der Assistent **beide** genannten Orte und
   tut nicht so, als gäbe es nur einen. Bereits gesetzte Umgebungsvariablen werden als
   Vorbelegung erkannt, ohne den Wert anzuzeigen.
3. **Verbindung testen.** Ein einziger lesender Aufruf gegen `/accounts/get`. Die Auswertung
   unterscheidet die drei Werte, denn genau darin liegt der Nutzen:

   | Ergebnis | Deutung |
   | --- | --- |
   | 200, `success: true` | Zugangsdaten vollständig gültig |
   | 401, `error_code` 3 | API Client oder API Secret falsch |
   | 401, `error_code` 4 | `api_key` falsch, oder dieser Client darf diesen Mandanten nicht bedienen |
   | 403, `error_code` 11 | Mandantenkonto nicht aktiv |
   | kein JSON | falsche Basis-URL oder ein Proxy dazwischen; die ersten 200 Zeichen anzeigen |
   | Netzwerkfehler | Verbindung, Proxy, Firewall prüfen |

   Bei Erfolg zusätzlich die Zahl der gefundenen Zahlungskonten und, sofern vorhanden, deren
   Bezeichnungen anzeigen: "Verbunden. 3 Zahlungskonten gefunden: ...". Der Nutzer merkt damit
   sofort, wenn er den `api_key` des falschen Mandanten eingetragen hat. Das ist der einzige
   Schutz gegen den teuersten aller Einrichtungsfehler.
4. **Startvariante wählen.** `npx` (Vorgabe) oder globale Installation. Bei globaler
   Installation wird der absolute Pfad des Binaries ermittelt und geschrieben, nicht auf `PATH`
   vertraut.
5. **Ablageort der Zugangsdaten wählen.** Zugangsdatendatei mit Rechten `0600` (Vorgabe),
   oder direkt in die Clientkonfiguration mit ausdrücklichem Hinweis auf die Folge, oder gar
   nichts schreiben.
6. **Clients auswählen.** Mehrfachauswahl.
7. **Vorschau und Bestätigung.** Vor jedem Schreibvorgang den vollständigen Pfad und den
   einzufügenden Block anzeigen, Geheimnisse maskiert. Vor jeder Änderung an einer bestehenden
   Datei eine Sicherung als `<datei>.bak-<zeitstempel>` anlegen und deren Pfad nennen. Bestehende
   Einträge werden nie ohne ausdrückliche Zustimmung überschrieben.
8. **Abschluss.** Je Client eine Zeile, was zu tun ist: Claude Desktop vollständig beenden und
   neu starten, Cursor neu laden, VS Code den Server starten, Codex und Grok brauchen keinen
   Neustart. Dazu die Prüfzeile, etwa `claude mcp get buchhaltungsbutler`.
9. **Hinweis auf den Nur-Lesen-Schalter.** Am Ende, in zwei Sätzen: Der Server ist im
   Auslieferungszustand voll nutzbar; wer ihn auf Auswertungen beschränken will, setzt
   `BB_MCP_READ_ONLY=true` und verliert dabei BWA und Summen- und Saldenliste, weil deren
   Erzeugungsschritt schreibend ist.

### 10.3 Welche Clients der Assistent schreibt

| Client | Automatisch | Weg |
| --- | --- | --- |
| Claude Code | ja | `claude mcp add-json` als Unterprozess |
| Codex CLI und ChatGPT Desktop | ja | `codex mcp add` als Unterprozess |
| Grok Build | ja | `grok mcp add` als Unterprozess |
| VS Code mit Copilot | ja | `.vscode/mcp.json` schreiben, oder `code --add-mcp` für das Profil |
| Claude Desktop | ja | `claude_desktop_config.json` lesen, ergänzen, zurückschreiben |
| Cursor | ja | `~/.cursor/mcp.json` oder `.cursor/mcp.json` |
| Windsurf | ja | `~/.codeium/windsurf/mcp_config.json` |
| LM Studio | ja, mit Vorbehalt | `~/.lmstudio/mcp.json`, nur wenn vorhanden, sonst nur ausgeben |
| Cline, CLI-Variante | ja | `~/.cline/mcp.json` |
| Zed | nein, nur ausgeben | `settings.json` ist JSONC mit Kommentaren |
| Continue | nein, nur ausgeben | YAML, Ablageort projektabhängig |
| Cline (IDE), Jan | nein, nur ausgeben | kein dokumentierter Dateipfad |
| ChatGPT im Browser | nein | technisch ausgeschlossen |

Regel: Wo eine offizielle CLI existiert, wird sie aufgerufen. Wo nur eine Datei existiert und
diese reines JSON ist, wird geschrieben. Wo das Format Kommentare tragen kann oder der Pfad nicht
dokumentiert ist, wird nur ausgegeben. Geraten wird nicht.

---

## 11. Teststrategie

### 11.1 Grundregel

**Kein Test geht schreibend gegen die echte API. Kein Test setzt überhaupt einen Netzwerkaufruf
gegen `webapp.buchhaltungsbutler.de` ab.** Durchgesetzt, nicht nur vereinbart:

- Die Testumgebung setzt `BB_API_BASE_URL` auf `http://localhost.invalid`.
- `tests/setup.ts` installiert einen `undici`-`MockAgent` mit `disableNetConnect()`. Jeder echte
  Netzwerkversuch lässt den Test scheitern.
- Ein eigener Test prüft, dass `disableNetConnect()` aktiv ist. Ohne ihn wäre die Absicherung
  das Erste, was bei einem Refactoring stumm ausfällt.

### 11.2 Die fünf Teststufen

**Stufe 1, Einzeltests** (`tests/unit/`). Reine Funktionen ohne Netz: `decode`, `encode`,
`decimal`, `redact`, `sanitize`, `truncate`, `paging-note`, `classify`, `magic-bytes`,
`filename`, jede Querprüfung aus 5.5 mit positivem und negativem Beispiel.

**Stufe 2, Vertragstests** (`tests/contract/`). Die Abnahmeprüfungen. Sie brauchen kein Netz,
weil sie Datenstrukturen gegeneinander rechnen. Die sieben Tests sind im Dateibaum genannt; ihre
Aussagen stehen in 5.6. Zusätzlich:

- `secrets.test.ts` durchsucht alle 54 Werkzeugdefinitionen, alle Beispielantworten und alle
  Fehlertexte nach den drei Geheimniswerten und nach dem Namen `api_key` als Schemaeigenschaft.
- `definition-size.test.ts` misst die Gesamtgröße der Definitionen und schlägt fehl, wenn sie den
  in `package.json` festgehaltenen Grenzwert überschreitet. Der Grenzwert wird nach der ersten
  Messung gesetzt und danach nur bewusst erhöht.

**Stufe 3, HTTP-Nachbildung** (`tests/helpers/mock-api.ts`). `undici` `MockAgent`, weil er auf
der Ebene des eingebauten `fetch` ansetzt und damit den echten Client testet, nicht einen Ersatz.

Die Antwortkörper der Nachbildung stammen **ausschließlich aus aufgezeichneten echten
Antworten**, anonymisiert, mit einer Herkunftszeile je Datei (Datum, Endpunkt, wie gewonnen).
Der Grund: Ein Mock, der die Annahme des Codes wiederholt, prüft nichts. Er bestätigt nur
den Irrtum, den er abbilden sollte. Die sechs Aufrufe aus [Abschnitt 1](#1-neue-live-befunde-dieses-entwurfs-2026-09-12)
liefern die ersten sechs Fixtures, darunter die beiden, die Befund B belegen.

Pflichtfälle je Endpunktgruppe:

| Fall | Prüft |
| --- | --- |
| volle Seite (`rows == limit`) | der Hinweis nennt "probably more" und den nächsten `offset` |
| unvollständige Seite (`rows < limit`) | der Hinweis nennt "last page" |
| leere Seite | `rows: 0`, `data: []`, kein Absturz, kein Folgehinweis |
| Fehlerumschlag 400 | Vier-Block-Meldung, richtige Klasse, kein Retry |
| HTML statt JSON | `NonJsonResponseError`, die ersten 200 Zeichen, keine Parserausnahme |
| Umschlag ohne `success` | `EnvelopeContractError` |
| bekanntes Feld fehlt | `_contract_warnings` gesetzt, Antwort trotzdem geliefert |
| unbekanntes Feld vorhanden | durchgereicht, gezählt, kein Fehler |
| Zeitlimit an einem schreibenden Werkzeug | Text aus 9.4, genau ein Request |
| 504/30 an einem lesenden Werkzeug | drei Requests, wachsender Abstand |
| 403/15 an `/receipts/get` | **kein** Retry, weil dort "invalid sort field" |
| 403/15 an `/receipts/addBatch` | Retry, weil dort Drosselung |

**Stufe 4, Integrationstest** (`tests/integration/server.test.ts`). Der **gebaute** Server wird
als Unterprozess gestartet, über einen MCP-Client werden `initialize`, `tools/list` und ein
lesender `tools/call` gegen die Nachbildung ausgeführt. Geprüft wird zusätzlich, dass
`tools/list` genau 54 Einträge liefert und dass stdout ausschließlich JSON-RPC enthält. Ein
`tsc --noEmit` allein fängt die Importpfad- und Verpackungsfallstricke nicht.

**Stufe 5, manuelle Abnahme gegen die echte API, ausschließlich lesend.** Eine Prüfliste in
`docs/entwicklung/abnahme-lesend.md` mit den 15 lesenden Endpunkten, je einem Aufruf, und dem
erwarteten Befund. Sie wird von Hand ausgeführt, nicht automatisiert, und ihr Ergebnis wird als
neue Fixture aufgezeichnet. Schreibende Endpunkte werden in dieser Stufe **nicht** geprüft.

### 11.3 Wie die schreibenden Endpunkte trotzdem geprüft werden

Das ist die ehrlichste Lücke dieses Plans und bekommt einen eigenen Abschnitt statt einer
Fußnote. Es gibt drei Wege, in dieser Reihenfolge:

1. **Ein gesondertes Testmandat.** Der Projektinhaber richtet einen zweiten
   BuchhaltungsButler-Mandanten ohne echte Daten ein oder erfragt beim Anbieter eine
   Testumgebung. Erst damit lassen sich die vier `id_by_customer`-Pfade in ihrer schreibenden
   Form, das Wiederholungsverhalten von `delete`, `restore`, `unconfirm` und `unassign` sowie
   das Verhalten bei ungleich langen parallelen Arrays klären. Bis dahin bleiben alle diese
   Punkte als **nicht verifiziert** gekennzeichnet, und `idempotentHint` bleibt nach 4.4 Punkt 4
   auf `false`.
2. **Vollständige Nachbildung aus der Spezifikation.** Jeder schreibende Endpunkt bekommt
   Mock-Fälle für Erfolg und für jeden in der Spezifikation definierten Fehlercode. Das prüft die
   Fehlerübersetzung und die Schemata, nicht das Serververhalten. Es ist das, was ohne Punkt 1
   erreichbar ist, und es wird als solches benannt.
3. **Was ausdrücklich nicht gemacht wird:** ein einzelner "harmloser" Schreibtest gegen die
   Produktivbuchhaltung, etwa ein Kommentar oder eine Kostenstelle. Ein Kommentar ist über die
   API nicht löschbar, eine Kostenstelle verändert die Kostenstellenauswertung. Es gibt in dieser
   API keinen folgenlosen Schreibvorgang.

### 11.4 Abdeckungsziele

| Bereich | Ziel | Begründung |
| --- | --- | --- |
| `src/wire/`, `src/errors/`, `src/schema/refine.ts` | 100 Prozent Zweigabdeckung | hier entstehen stille Datenfehler |
| `src/http/` | 95 Prozent | die Retry-Weiche ist der gefährlichste Zweig |
| `src/catalog/` | über die Vertragstests, nicht über Zeilenabdeckung | es sind Daten, keine Logik |
| Rest | 80 Prozent | |

---

## 12. README-Gliederung

Deutsch (E4), Aufbau nach `distribution.md` 17: Abgrenzung oben, zwei Wege zur Wahl,
Fehlersuchtabelle, Prüfschritt, nicht unterstützte Clients mit Begründung.

```text
# BuchhaltungsButler MCP-Server (inoffiziell)

1.  Was das ist                     ein Satz, dann der Abgrenzungskasten
1.1 Nicht offiziell                 kein Produkt der BuchhaltungsButler GmbH, keine Unterstützung
                                    von dort, Marke gehört dem Rechteinhaber
1.2 Warnung                         der Server schreibt in echte Buchhaltungsdaten; Buchungen und
                                    Rechnungen sind über die API nicht löschbar
1.3 Was der Server kann             alle 54 Endpunkte, 54 Werkzeuge, 15 davon lesend

2.  Voraussetzungen                 Node >= 22.12.0, BuchhaltungsButler-Konto mit aktivierter API
2.1 Zugangsdaten beschaffen         Einstellungen, Schnittstellen und API-Zugang; beide in den
                                    Quellen genannten Orte, weil sie sich widersprechen
2.2 Die drei Werte                  API Client, API Secret, api_key und was jeder bedeutet

3.  Schnellstart mit dem Assistenten
                                    npx -y @dennismenken/buchhaltungsbutler-mcp setup
                                    was er fragt, was er schreibt, dass er vorher sichert

4.  Einbindung je Client            je Unterabschnitt: Befehl oder Konfigurationsblock,
                                    Ablageort, Neustartbedarf, Prüfbefehl
4.1 Claude Code
4.2 Claude Desktop                  zusätzlich der .mcpb-Weg ohne Terminal
4.3 OpenAI Codex CLI und ChatGPT-Desktop-App
4.4 Grok Build (xAI)
4.5 Cursor
4.6 Visual Studio Code mit GitHub Copilot
4.7 Windsurf, Zed, Cline, Continue, LM Studio, Jan
4.8 Andere Clients                  die generische Form
4.9 Nicht unterstützt               ChatGPT im Browser, mit Begründung

5.  Statt npx: feste Installation   global oder lokaler Klon, mit absolutem Pfad

6.  Konfiguration
6.1 Pflichtvariablen                BB_API_CLIENT, BB_API_SECRET, BB_API_KEY
6.2 Optionale Variablen             vollständige Tabelle aus Abschnitt 7.1
6.3 Der Nur-Lesen-Schalter          Default aus; was er bewirkt; dass BWA und Summen- und
                                    Saldenliste damit nicht erreichbar sind, das Kontenblatt schon
6.4 Zugangsdatendatei               Ablageort, Rechte 0600, Mandantenprofile
6.5 Dateiquellen beim Upload        file:// und http(s):// sind aus; was das Einschalten bedeutet

7.  Die Werkzeuge                   Tabelle mit Name, Wirkung und einem Satz; gruppiert nach
                                    Belege, Zahlungen, Rechnungen, Buchungen, Stammdaten,
                                    Kostenstellen, Berichte
7.1 Was die Annotationen bedeuten   wie man im Client Leserechte getrennt von Schreibrechten
                                    vergibt; das ist der eigentliche Schutz

8.  Bekannte Eigenheiten der API    rows ist keine Gesamtzahl; kein Idempotenzschlüssel und was
                                    daraus folgt; Beträge als String; Booleans als "0"/"1";
                                    drei order-Syntaxen; kleine Defaults bei Debitoren und
                                    Kreditoren; /reports/create ersetzt den Vorgänger

9.  Fehlersuche                     Tabelle Symptom, Ursache, Abhilfe; bbutler-mcp doctor
                                    zuerst; die drei Authentifizierungsfehler auseinandergehalten

10. Datenschutz und Sicherheit      wohin Daten fließen; dass Werkzeugargumente von Inhalten
                                    beeinflusst sein können, die das Modell gelesen hat;
                                    Empfehlung, Schreibrechte im Client einzeln zu vergeben

11. Mitwirken                       Fehlerberichte, Entwicklungsaufbau, Testregeln
12. Lizenz                          MIT
13. Haftungsausschluss              ohne Gewähr; die Verantwortung für jede Buchung bleibt beim
                                    Nutzer
```

Zwei Festlegungen zur README:

- Der Paketname `buchhaltungsbutler-mcp` ohne Namensraum taucht **nirgends** als unser Paketname
  auf. Er ist auf npm bereits vergeben (E3); verwendet wird ausschließlich der gescopte Name.
- Abschnitt 8 ist kein Zugeständnis, sondern Teil der Funktion: Ein Nutzer, der weiß, dass `rows`
  keine Gesamtzahl ist, liest die Antworten des Agenten richtig.

---

## 13. Arbeitspakete

Abhängigkeiten sind Paketnummern. Pakete ohne gemeinsame Abhängigkeit lassen sich parallel
bearbeiten. Die Spalte "Liefert" ist die Abnahmebedingung.

| Nr. | Paket | Hängt ab von | Liefert |
| --- | --- | --- | --- |
| AP-01 | **Gerüst.** `package.json`, `tsconfig.json`, `tsdown.config.ts`, ESLint, Vitest, Lockfile, CI-Grundgerüst, leere `src/cli.ts` mit Shebang | keine | `pnpm build` erzeugt eine ausführbare `dist/cli.js`, `pnpm test` läuft durch |
| AP-02 | **Faktenextraktion.** `scripts/extract-facts.ts`, `scripts/extract-errors.ts`, beide erzeugten JSON-Dateien | AP-01 | `generated/endpoint-facts.json` mit 54 Pfaden und 371 Parametern, `generated/error-table.json` mit 786 Paaren `(Pfad, error_code)`; beide eingecheckt |
| AP-03 | **Katalogtypen und Klassentabelle.** `src/catalog/types.ts`, `classes.ts`, leerer `index.ts` mit Eindeutigkeitsprüfung | AP-01 | der Typ `EndpointEntry` steht, die sechs Klassen und ihre Annotationen sind als Daten hinterlegt |
| AP-04 | **HTTP-Schicht.** `src/http/*`, ohne Katalogbezug, mit Einzeltests gegen `MockAgent` | AP-01 | Client, Auth, Rate-Limiter, Retry-Weiche, Umschlagzerlegung, Content-Type-Prüfung, alle Fehlertypen |
| AP-05 | **Draht und Primitive.** `src/wire/*`, `src/schema/primitives.ts`, `src/util/decimal.ts`, `redact.ts` | AP-01 | Typkorrektur in beide Richtungen, Vertragsbruchmeldung, Betragsrechnung in Cent, alle mit 100 Prozent Zweigabdeckung |
| AP-06 | **Fehlerübersetzung.** `src/errors/*` | AP-02, AP-04 | Klassifikation nach `(Pfad, error_code)` plus Meldungstext, Vier-Block-Renderer, Text für Schreibungewissheit |
| AP-07 | **Konfiguration.** `src/config/*` | AP-01 | Zod-Schema aller Variablen, Startprüfungen, eingefrorenes Config-Objekt, `instructions`-Erzeugung |
| AP-08 | **Antwortaufbereitung.** `src/response/*` | AP-05 | `structuredContent` plus Text plus Navigationsblock, Kürzung, Paginierungshinweis, Bereinigung |
| AP-09 | **Werkzeughülle.** `src/tools/handler.ts`, `read-only-guard.ts`, `limits-guard.ts`, `audit-log.ts`, `register.ts` | AP-03, AP-04, AP-06, AP-07, AP-08 | der eine generische Handler, lauffähig mit einem Beispieleintrag |
| AP-10a | **Katalog: Belege und Zahlungen.** `receipts.ts`, `transactions.ts` (16 Einträge) | AP-02, AP-03, AP-05 | 16 vollständige Einträge, Rohling-Marker restlos ersetzt |
| AP-10b | **Katalog: Buchungen.** `postings.ts` (12 Einträge), `src/schema/line-items.ts` | AP-02, AP-03, AP-05 | 12 Einträge samt Querprüfungen Q1 und Q2 |
| AP-10c | **Katalog: Rechnungen.** `invoices.ts` (3 Einträge) | AP-02, AP-03, AP-05 | 3 Einträge, Positionslisten, Q12 |
| AP-10d | **Katalog: Stammdaten.** `settings.ts`, `accounts.ts`, `cost-locations.ts`, `comments.ts` (18 Einträge) | AP-02, AP-03, AP-05 | 18 Einträge, `limit` überall explizit |
| AP-10e | **Katalog: Berichte.** `reports.ts` (5 Einträge) | AP-02, AP-03, AP-05 | 5 Einträge samt Zweistufenmuster und `error_code` 8 und 12 |
| AP-11 | **Vertragstests.** `tests/contract/*`, `scripts/check-coverage.ts`, `check-names.ts` | AP-10a bis AP-10e | alle sieben Tests grün; 54 Pfade, 317 Parameter, 54 Klassenzeilen, 216 Annotationen geprüft |
| AP-12 | **Dateibeschaffung.** `src/files/*` für `bb_receipts_upload` | AP-07 | Base64, `file://` hinter `BB_ALLOWED_FILE_DIRS`, `http(s)://` hinter `BB_MCP_ALLOW_URL_UPLOAD`, SSRF-Abwehr je Hop, Magic Bytes, Namensbereinigung |
| AP-13 | **Verifikation der vier Pfadsegment-Endpunkte.** Je ein Aufruf gegen `delete` und `restore` in einer Wegwerf-Umgebung | AP-04, Testmandat | belegtes oder widerlegtes Verhalten; Ergebnis wandert in Katalog und Dossiers |
| AP-14 | **Duplikatshinweis.** `src/tools/duplicate-check.ts` | AP-09, AP-10a, AP-10b | ein zusätzlicher Leseaufruf vor `create` der Klassen A und B, blockiert nie, steht sichtbar in der Antwort |
| AP-15 | **Serveraufbau.** `src/server.ts`, `src/cli.ts` ohne Unterbefehl, Signalbehandlung, `unhandledRejection` | AP-09, AP-11 | der Server startet auf stdio, `tools/list` liefert 54 Einträge, stdout trägt nur JSON-RPC |
| AP-16 | **Integrationstest.** `tests/integration/server.test.ts` | AP-15 | gebauter Server als Unterprozess, `initialize`, `tools/list`, ein lesender `tools/call` |
| AP-17 | **Einrichtungsassistent.** `src/setup/*` | AP-04, AP-07 | `setup`, `doctor`, `test`, `print-config`, `profiles`, `uninstall`, alle Schreiber aus 10.3 |
| AP-18 | **README und Begleittexte.** README, NOTICE, SECURITY, CHANGELOG | AP-15, AP-17 | Gliederung aus Abschnitt 12 vollständig gefüllt |
| AP-19 | **Verpackung.** `manifest.json`, `scripts/build-mcpb.ts`, Release-Workflow mit OIDC und `--provenance` | AP-15, AP-18 | `.mcpb`-Bundle mit aus der Registrierung erzeugter Werkzeugliste; Bundlebau **vor** dem npm-Publish |
| AP-20 | **Messung und Feinschliff.** `count-definition-tokens.ts`, Grenzwert setzen, Beschreibungen kürzen wo nötig | AP-11, AP-15 | gemessene Definitionsgröße, Grenzwert in `package.json`, Test dagegen |
| AP-21 | **Manuelle Leseabnahme.** Prüfliste über die 15 lesenden Endpunkte gegen die echte API | AP-15 | `docs/entwicklung/abnahme-lesend.md` ausgefüllt, neue Fixtures aufgezeichnet |

**Parallelisierung.** Nach AP-01 laufen AP-02, AP-03, AP-04, AP-05 und AP-07 gleichzeitig. Nach
AP-05 laufen AP-06 und AP-08 gleichzeitig. Die fünf Katalogpakete AP-10a bis AP-10e sind
untereinander unabhängig und der Hauptteil der Arbeit; sie eignen sich für fünf Bearbeiter. AP-12
und AP-17 hängen an nichts aus dem Katalog und laufen die ganze Zeit nebenher. AP-13 hängt an
einer Entscheidung außerhalb des Codes und blockiert keinen anderen Pfad.

**Kritischer Pfad:** AP-01, AP-03, AP-10b (Buchungen, das umfangreichste Katalogpaket), AP-11,
AP-15, AP-19.

---

## 14. Risiken und offene Punkte

### 14.1 Risiken, die dieser Entwurf bewusst in Kauf nimmt

| # | Risiko | Warum es bleibt | Was es abmildert |
| --- | --- | --- | --- |
| R1 | **Ein Host ohne Rückfrage kann mit diesem Server löschen, stornieren und buchen.** E2 verbietet ein serverseitiges Bestätigungsmuster; Annotationen sind nach `MCP-SCHEMA` ausdrücklich Hinweise und keine Durchsetzung | Entscheidung des Projektinhabers, begründet in E2 und `tool-design.md` 9.4 | ehrliche Annotationen an allen 54 Werkzeugen (nur mit E1 möglich), unmissverständliche Beschreibungen, aufgelöste Schreibantworten, der optionale Schalter, die Betrags- und Mengengrenzen |
| R2 | **Die Definitionsgröße sprengt das Budget von 10.000 Token aus `tool-design.md` 11.9.** Geschätzt 18.000 bis 26.000 | direkte Folge von E1 und E6 | die drei Hebel aus 5.7; Messung in AP-20; kein Streichen von Werkzeugen |
| R3 | **Der Duplikatshinweis kostet je `create`-Aufruf einen zusätzlichen Request** aus einem Kontingent von 100 pro Mandant und Minute | ohne ihn bleibt der häufigste Fehler, der Wiederholungsversuch nach einem Zeitlimit, unsichtbar | er ist je Katalogeintrag abschaltbar und entfällt, wo keine brauchbare Suchabfrage existiert |
| R4 | **Kein automatischer Retry bei schreibenden Aufrufen bedeutet mehr sichtbare Fehler** für den Nutzer | das ist der Zweck. Eine stille Doppelbuchung ist teurer als ein sichtbarer Fehler | der Text aus 9.4 nennt den Prüfweg und beide Ausgänge |
| R5 | **Der Rate-Limiter ist prozesslokal.** Zwei Clients auf demselben Mandanten teilen ihn nicht | ein geteilter Zähler bräuchte einen gemeinsamen Speicher, den ein stdio-Server nicht hat | Sicherheitsabstand 70 statt 100 |
| R6 | **Kein Zwischenspeicher für Stammdaten in der ersten Fassung** | ein zwischengespeicherter Kontostand ist im Buchhaltungskontext ein Fehler, kein Gewinn. Der Nutzen bei Sachkonten ist real, aber die Invalidierungstabelle ist fehleranfällig | später nachrüstbar, dann nur für Sachkonten und Kostenstellen, mit TTL in Minuten und ausdrücklicher Invalidierungstabelle. `/accounts/get` wird nie zwischengespeichert |
| R7 | **Die manuelle Prüfung der Fehlerklassen ist Handarbeit über 718 Einträge** | die automatische Ableitung liegt bei den Sonderfällen falsch, und genau dort entscheidet sie über Retry ja oder nein | die Ableitung erzeugt einen Vorschlag, die Prüfung ist ein eigener Arbeitsschritt in AP-06 und im Diff sichtbar |

### 14.2 Offene Punkte, die vor der Veröffentlichung zu klären sind

| # | Punkt | Stand | Nächster Schritt |
| --- | --- | --- | --- |
| O1 | Verhalten von `/receipts/delete/<id>` und `/receipts/restore/<id>` in der Pfadsegment-Form | **nicht verifiziert.** Aus Befund A abgeleitet, aber schreibend und deshalb nicht getestet | AP-13, Testmandat nötig |
| O2 | Wiederholungsverhalten von `delete`, `restore`, `unconfirm`, `unassign` und `postings_assign_receipt` | **nicht verifiziert** | Testmandat; erst danach darf `idempotentHint` einzeln auf `true` gehen |
| O3 | Was BuchhaltungsButler mit ungleich langen parallelen Arrays macht | **nicht verifiziert** | nachrangig, weil Q1 vorher abfängt; für die Fehlermeldung dennoch interessant |
| O4 | Antwort beim Reißen des Minutenlimits (Status, `error_code`) | **nicht verifiziert**, HTTP 429 kommt in der Spezifikation nicht vor | nicht absichtlich provozieren; der Client behandelt 429, 403/15 und 5xx gleichermaßen defensiv |
| O5 | Obergrenze von `limit` bei `/settings/get/debtors`, `/settings/get/creditors`, `/settings/get/postingaccounts` | **nicht verifiziert.** Für Sachkonten ist 1000 als Default belegt und als Maximum plausibel | mit je einem lesenden Aufruf klärbar, kostet drei Requests |
| O6 | Ob `/receipts/get/<id>` mit `get_file: true` funktioniert und wie groß die Antwort wird | **nicht verifiziert.** Der Einzelabruf selbst ist jetzt belegt | ein lesender Aufruf; wichtig für die Kürzungsregel in 8.4 |
| O7 | Ob `/receipts/upload` tatsächlich nur EUR akzeptiert | **nicht verifiziert.** Die Spezifikation widerspricht sich | Testmandat |
| O8 | Zeitzone aller Datumsangaben | **in keiner Quelle dokumentiert.** Europe/Berlin ist eine Annahme | nicht konvertieren, durchreichen, in den Beschreibungen benennen |
| O9 | Laufzeit der Berichtserzeugung und damit das Warteintervall | **Annahme** nach `berichte.md` 2.4: exponentiell ab etwa zwei Sekunden | messen, sobald ein Testmandat da ist |
| O10 | Ob ein ersetzter Bericht eine neue `id_by_customer` erhält | **nicht verifiziert** | betrifft die Antwort von `bb_reports_create_*` |
| O11 | SDK-Linie v1 oder v2 | **Entscheidung der Planungsphase**, `toolchain.md` 3.2. Dokumentierter Standardweg ist v2 | genau eine Spalte vollständig wählen, Mischen ist verboten |
| O12 | Verfügbarkeit des Namensraums `@dennismenken` auf npm | **nicht geprüft** | vor der ersten Veröffentlichung prüfen, `distribution.md` 15.4 |
| O13 | Rechtsträger hinter der Marke "BuchhaltungsButler" für den Abgrenzungstext | **nicht verifiziert** | Impressum prüfen, bevor NOTICE.md geschrieben wird |

### 14.3 Was dieser Plan bewusst nicht enthält

- **Keine MCP-Resources in der ersten Fassung.** Sie wären nützlich — Stammdaten wie der
  Kontenrahmen kämen ohne Werkzeugaufruf in den Kontext —
  und sind von E1 nicht berührt, aber sie sind eine zweite Ausgabeform mit eigenen
  Aktualitätsfragen. Nach AP-21 nachrüstbar, dann nur für Sachkonten und Kostenstellen.
- **Keine MCP-Prompts.** Sie lösen kein Problem, das dieser Server hat.
- **Kein Autopaginieren, kein Werkzeug, das Suchen und Schreiben verbindet, kein `confirm`.**
  Begründungen in 8.5 und `tool-design.md` 9.4 und 9.6.
- **Keine Übernahme fremden Quelltextes.** Zulässige Grundlage sind ausschließlich die
  Dossiers unter `docs/` und die eigenen Messungen aus Abschnitt 1.

### 14.4 Was dieser Entwurf gegenüber den Dossiers ändert und in ihnen nachzuziehen ist

Nach Annahme dieses Entwurfs sind folgende Stellen zu korrigieren, weil Befund A sie widerlegt:

| Datei | Stelle | Was gilt jetzt |
| --- | --- | --- |
| `docs/api/belege.md` | 4.5 | `/receipts/get/id_by_customer` funktioniert als Pfadsegment; die Body-Varianten waren die falsche Aufrufform |
| `docs/api/transaktionen.md` | 4.5 | dasselbe für `/transactions/get/id_by_customer`; die Umgehung über exklusive Kennungsgrenzen wird nicht gebraucht |
| `docs/api/grundlagen.md` | 5.6, Stolperfallen 28 und 29 | der Fremdwährungsablauf ist durchführbar |
| `docs/entwicklung/tool-design.md` | Warnung unter 3.5, Abschnitt 12 | beide Werkzeuge sind lieferfähig, Abgrenzungssätze dürfen auf sie verweisen |
| `docs/README.md` | Entscheidungsübersicht | `BB_MCP_MODE` und das `confirm`-Muster sind entfallen, `BB_MCP_READ_ONLY` mit Default `false` tritt an ihre Stelle |

Zusätzlich neu belegt und nachzutragen: die abweichenden Feldnamen zwischen Listen- und
Einzelabruf (Befund B), die Typunterschiede zwischen `receipts` und `transactions` (Befund B),
die Bestätigung der Case-Sensitivität bei `/postings/get` samt `error_code` 17 (Befund C) und die
Bestätigung von `limit`, `offset` und `order` bei `/settings/get/postingaccounts` (Befund D).

---

## 15. Warum dieser Entwurf aus dem Blickwinkel Korrektheit gewinnen sollte

Sechs Eigenschaften, jede mit dem Fehler, den sie verhindert.

1. **Der Katalog ist eine Datenstruktur, und ein Test rechnet ihn gegen die Spezifikation auf.**
   Verhindert die stille Lücke: einzelne Endpunkte, die im Katalog fehlen, während die
   Beschreibung Vollständigkeit verspricht.
2. **Der Antwortvertrag wird je Endpunkt geführt, nicht je Fachobjekt.** Verhindert genau den
   Fehler, den Befund B aufgedeckt hat: ein `due_date`, das beim Einzelabruf immer leer aussieht,
   weil das Feld dort `date_payment_due` heißt.
3. **Retry hängt an der Werkzeugklasse, nicht am Fehlertyp.** Verhindert die Doppelbuchung
   nach einem Netzabbruch, und zwar bauartbedingt, nicht durch Disziplin.
4. **Die Paginierung behauptet nie eine Gesamtzahl.** Verhindert den schwersten Fehler dieser
   Klasse: Eine erste Seite wird für den ganzen Bestand gehalten, und niemand erfährt es.
5. **Jeder Abbruch vor dem Request sagt wörtlich, dass nichts geändert wurde, und jeder
   ungewisse Ausgang sagt wörtlich, dass er ungewiss ist.** Verhindert, dass ein Agent nach
   einem Zeitlimit rät.
6. **Die Live-Prüfung hat zwei Endpunkte zurückgeholt, die alle bisherigen Dossiers
   abgeschrieben hatten.** Das ist kein Architekturmerkmal, sondern der Beleg für die Haltung,
   die diesem Entwurf zugrunde liegt: Bei jeder Annahme über das Verhalten der API entscheidet
   die Messung, nicht das Dokument.

Der Preis ist ehrlich benannt: mehr Definitionstoken (R2), mehr Handarbeit im Katalog und in der
Fehlertabelle (R7), ein zusätzlicher Request je `create` (R3) und mehr sichtbare Fehler statt
stiller Wiederholungen (R4). In einer Buchhaltung ist das der richtige Tausch.
