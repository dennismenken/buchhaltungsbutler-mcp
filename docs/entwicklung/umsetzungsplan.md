# Umsetzungsplan: BuchhaltungsButler-MCP-Server

**Stand:** 2026-09-12. **Status: verbindlich.** Dieser Plan ersetzt die drei Entwürfe
`plan-entwurf-a.md`, `plan-entwurf-b.md` und `plan-entwurf-c.md`. Die Entwürfe bleiben als
Nachweis liegen und werden nicht mehr gepflegt. Bei jedem Widerspruch zwischen diesem Plan
und einem Entwurf oder einem Dossier gilt dieser Plan.

**Adressat:** ein Implementierungs-Agent, der den Plan ohne Rückfrage abarbeitet. Es gibt in
diesem Dokument keinen Punkt, der später zu entscheiden wäre. Wo eine Tatsache nicht bekannt
ist, steht hier trotzdem eine Festlegung, wie damit umzugehen ist, und die Unsicherheit ist
als solche benannt.

---

## 0. Geltung, Vorrang und Wahrheitsgehalt

### 0.1 Vorrangordnung

1. **Die verbindlichen Entscheidungen des Projektinhabers E1 bis E6.** Sie gehen allem vor.
2. **Live gemessene API-Wirklichkeit.** Die Spezifikation `docs/openapi/buchhaltungsbutler-v1.json`
   ist die Grundwahrheit über den *Umfang* der API (welche Pfade, welche Parameter). Über das
   *Verhalten* entscheidet die Messung. Die Spezifikation ist handgepflegt und nachweislich in
   Feldnamen falsch, in Typen widersprüchlich und in `required` fehlerhaft (Belege in 0.3).
   Die Messungen stehen in 0.3 dieses Plans **und in `docs/api/live-befunde-orchestrator.md`**;
   beide Stellen haben denselben Rang und widersprechen sich nicht.
3. **Dieser Plan.**
4. **Die Dossiers unter `docs/`**, soweit 1 bis 3 nichts anderes sagen.

**Die Quellen dieses Plans, vollständig:** `docs/openapi/buchhaltungsbutler-v1.json` (Umfang der
API), **`docs/api/live-befunde-orchestrator.md` (gemessenes Verhalten, Stand 2026-09-12)**,
`docs/api/grundlagen.md`, `belege.md`, `transaktionen.md`, `buchungen.md`, `rechnungen.md`,
`berichte.md`, `stammdaten.md`, `fehlercodes.md`, `docs/fachwissen/buchhaltung.md`,
`docs/entwicklung/mcp-spezifikation.md`, `mcp-sdk-typescript.md`, `tool-design.md`,
`toolchain.md`, `distribution.md`, Index in `docs/README.md`.

### 0.2 Kennzeichnung von Unsicherheit

Jede Aussage dieses Plans ist einer von drei Arten:

- **gemessen**: am 2026-09-12 gegen die Produktivumgebung oder maschinell gegen die
  Spezifikationsdatei belegt. Der Befund steht in 0.3 oder 0.4.
- **abgeleitet**: folgt zwingend aus einer gemessenen Tatsache. Die Ableitung ist genannt.
- **nicht verifiziert** beziehungsweise **Annahme**: ausdrücklich so bezeichnet. Ein solcher
  Satz wird an keiner Stelle dieses Plans stillschweigend zu einer Tatsache.

### 0.3 Eigene Live-Befunde, 2026-09-12

Sechs lesende Aufrufe gegen die Produktivumgebung des Nutzers, ausschließlich gegen Pfade der
freigegebenen Liste. **Kein schreibender Aufruf.** Wiedergegeben werden nur Struktur- und
Typbefunde, keine Geschäftsdaten. Zwei der sechs Aufrufe gingen ohne Basic-Auth-Header hinaus
(Fehler in der Aufrufkette, HTTP 401) und sind nur insofern ein Befund, als die API bei
fehlender Authentifizierung mit sauberem JSON antwortet und nicht mit HTML. **Bei der
Schlussdurchsicht kamen drei weitere lesende Aufrufe hinzu (L6).** Dieselben Befunde stehen,
ausführlicher und mit den vollständigen Aufrufformen, in
`docs/api/live-befunde-orchestrator.md`.

**L1 — `id_by_customer` ist ein Pfadsegment. Beide Einzelabruf-Endpunkte funktionieren.**

| Aufruf | Ergebnis |
| --- | --- |
| `POST /api/v1/receipts/get/<id>`, Body `{"api_key":"…"}` | HTTP 200, `application/json`, `success: true`, `data` als **Objekt** |
| `POST /api/v1/transactions/get/<id>`, Body `{"api_key":"…"}` | HTTP 200, `application/json`, `success: true`, `data` als **Objekt** |

Die `<id>` stammte jeweils aus einem unmittelbar vorangehenden Listenaufruf. Damit ist die
Annahme, das Segment `id_by_customer` sei ein Platzhalter, **bestätigt** und die Aussage aus `belege.md` 4.5,
`transaktionen.md` 4.5, `grundlagen.md` Stolperfalle 29 und `tool-design.md` 3.5, die beiden
Endpunkte seien unbenutzbar, **widerlegt**. Der Fehler lag in der Aufrufform: Das Segment
`id_by_customer` im Pfad der Spezifikation ist ein Platzhalter ohne geschweifte Klammern,
kein literaler Pfadbestandteil.

**L2 — Feldnamen und Feldmengen weichen zwischen Listen- und Einzelabruf ab.** Gemessen, nicht
abgeleitet:

| Sachverhalt | `/receipts/get` (Liste, 16 Felder) | `/receipts/get/<id>` (Einzel, 23 Felder) |
| --- | --- | --- |
| Leistungsdatum | `delivery_date` | `date_delivery` |
| Fälligkeit | `due_date` | `date_payment_due` |
| Umschlag | `success`, `message`, `rows`, `data` (Array) | `success`, `message`, `data` (**Objekt**, **kein** `rows`) |

Nur in der Liste: `delivery_date`, `date_uploaded`, `due_date`.
Nur im Einzelabruf: `amount_original`, `currency`, `currency_original`, `exchangerate`, `vat`,
`e_invoice_type`, `list_direction`, `payment_reference`, `date_delivery`, `date_payment_due`.
In beiden: `filename`, `id_by_customer`, `type`, `date`, `counterparty`, `invoicenumber`,
`amount`, `payment_date`, `account`, `amount_paid`, `amount_paid_fixed`, `deleted`,
`link_to_receipt_id_by_customer`.

Bei den Zahlungen ist der Unterschied noch größer:

| Endpunkt | gelieferte Felder |
| --- | --- |
| `/transactions/get` (Liste, 6 Felder) | `id_by_customer`, `to_from`, `amount`, `booking_date`, `value_date`, `purpose` |
| `/transactions/get/<id>` (Einzel, 13 Felder) | `id_by_customer`, `account`, `to_from`, `booking_date`, `value_date`, `amount`, `currency`, `account_number`, `bank_code`, `bank_name`, `purpose`, `type`, `booking_text` |

Die Liste `/transactions/get` liefert **kein** `account`. Ein Agent, der aus der Liste das
Zahlungskonto ablesen will, findet es dort nicht.

**L3 — Typ-Asymmetrie zwischen Ressourcen.** Gemessen:

| Feld | `/receipts/*` | `/transactions/*` |
| --- | --- | --- |
| `id_by_customer` | JSON-**String** | JSON-**Zahl** |
| `account` | JSON-**String** (Liste) | JSON-**Zahl** (Einzelabruf) |

Weiter gemessen: `amount` durchgehend String mit Punkt und zwei Nachkommastellen; `deleted`
als String `"0"`; `vat` als String; `e_invoice_type` als **Zahl**; nicht gesetzte Felder
durchgehend als JSON-`null`, nie als leerer String.

**L4 — Felder, die die Spezifikation nicht kennt, kommen trotzdem.** `amount_paid` und
`amount_paid_fixed` liefert die API an beiden Belegendpunkten. Das ist der Beleg dafür, dass
ein geschlossenes `outputSchema` den Server bei der nächsten Anbieteränderung unbrauchbar
machen würde.

**L5 — Der Erfolgsumschlag der Listenabrufe trägt `rows`, der Einzelabruf nicht.** `rows` war
bei `limit: 1` der Wert `1`. Dass `rows` die Zeilenzahl **dieser Antwort** ist und keine
Gesamttrefferzahl, ist damit für die Listenform bestätigt.

**L6 — Der gelieferte `message`-Text weicht von beiden Spezifikationsquellen ab, sobald sich
die beiden Quellen widersprechen.** Drei lesende Aufrufe gegen `/receipts/get`, alle mit
HTTP 400 und `application/json`:

| Provoziert | Antwort live | `responses[…].description` | `properties.message.enum[0]` |
| --- | --- | --- | --- |
| `list_direction: "quatsch"` | `error_code` 5, `invalid list_direction specified` | gleich | gleich |
| `limit: 999999` | `error_code` 10, `invalid limit specified` | gleich | gleich |
| `order: { nicht_existierendes_feld: "ASC" }` | `error_code` 15, **`invalid field specified`** | `invalid sort field is specified` | `invalid sort field specified` |

Daraus folgt zweierlei, und beides ist für 5.3 und 5.6 tragend: Wo die beiden
Spezifikationsquellen **übereinstimmen**, traf der Text in beiden gemessenen Fällen zu. Wo sie
sich **widersprechen**, war der gelieferte Text im gemessenen Fall eine **dritte** Variante, die
in keiner der beiden Quellen steht. **Kein Spezifikationstext darf deshalb als Wortlaut der API
ausgegeben werden, und keine Weiche darf an einem Zeichenkettenvergleich gegen einen
Spezifikationstext hängen.** Die Stichprobe ist drei Paare groß; verallgemeinert wird daraus
nur die Regel, nicht eine Aussage über die übrigen 783 Paare.

**Was aus diesen Aufrufen ausdrücklich nicht folgt** und deshalb nicht behauptet wird:
das Verhalten irgendeines schreibenden Endpunktes; das Verhalten von
`/receipts/delete/<id>` und `/receipts/restore/<id>` in der Pfadsegmentform; ob
`/receipts/get/<id>` mit `get_file: true` funktioniert; die Obergrenze von `limit` bei den drei
`settings`-Listen; die Antwort beim Reißen des Minutenlimits.

### 0.4 Maschinelle Auszählung der Spezifikation, 2026-09-12

Jede Zahl ist mit `jq` gegen `docs/openapi/buchhaltungsbutler-v1.json` nachgezählt und in
diesem Plan an keiner Stelle gerundet oder geschätzt.

| Größe | Wert | Kommando |
| --- | --- | --- |
| Pfade | **54** | `jq -r '.paths\|keys\|length'` |
| HTTP-Methoden | ausschließlich `post` | `jq -r '[.paths[]\|keys[]]\|unique'` |
| Body-Parameter gesamt | **371** | `jq -r '[.paths[].post.parameters[]?]\|length'` |
| davon `api_key` | **54** | ein Vorkommen je Pfad |
| fachliche Parameter | **317** | 371 minus 54 |
| referenzierte Paare (Pfad, `error_code`) | **786** | Schlüssel der Form `"400 (5)"` in `responses` |
| `*ErrorCode*`-Definitionen | **718** | `jq -r '[.definitions\|keys[]\|select(test("ErrorCode"))]\|length'` |
| davon referenziert | **676** | über `$ref` in `responses` |
| davon verwaist | **42** | 718 minus 676 |
| Array-Parameter ohne `items` | **32** | darunter alle parallelen Arrays |
| Parameter mit `schema` statt `type` | **9** | |
| Parameter mit `enum` | **0** | die Spezifikation führt keinen einzigen Parameter-`enum` |
| Felder namens `currency` | **5** | drei Body-Parameter (`/receipts/add`, `/receipts/upload`, `/transactions/add`) plus zwei Definitionseigenschaften (`Receipt`, `Transaction`); Einzelheiten in 0.5 Korrektur 2 |
| Definitionseigenschaften mit `enum` | **2** | ausschließlich `Receipt.currency` und `Transaction.currency`, beide mit dem Ein-Wert-Enum `["EUR"]` |
| referenzierte Paare, bei denen `responses[…].description` und `properties.message.enum[0]` **abweichen** | **179** von 786 | Grundlage der Quellenentscheidung in 5.6 |

**Die Zahl 718 ist für den Fehlerkatalog falsch.** Der Katalog wird nach dem Paar
(Pfad, `error_code`) geschlüsselt, und davon gibt es 786. Die 718 sind Definitionsnamen, von
denen 42 in keinem `responses`-Block vorkommen. Die Entwürfe B und C nennen 718 als
Abnahmebedingung; das ist ein Zählfehler und wird hier korrigiert.

### 0.5 Zwei Korrekturen an fremden Aussagen, damit dieser Plan nicht auf Falschem aufbaut

**Korrektur 1, zugunsten von Entwurf B.** Die Jury hat B vorgeworfen, der Befund
„`PostingsFree` hat die Eigenschaft `amount`, führt aber `amounts` in `required`" sei erfunden,
die Definition habe weder `properties` noch `required`. **Das ist nicht zutreffend.**
`PostingsFree` ist ein Array; `properties` und `required` stehen unter `.items`. Nachgezählt:

```
jq -r '(.definitions.PostingsFree.items.required) - (.definitions.PostingsFree.items.properties|keys)'
→ ["amounts"]
```

Der Befund von B stimmt und ist der einzige Fall dieser Art in der gesamten Datei (geprüft
über alle Definitionen). Er ist in 4.4 als benannter Ausnahmeeintrag des Deckungstests
berücksichtigt. Ebenfalls geprüft und bestätigt: `ReceiptPostings` trägt `postingstexts`,
`/postings/add/receipt` trägt `postingtexts`.

**Korrektur 2, teils zugunsten und teils zulasten von Entwurf B.** B führt in seiner
Vokabeltabelle einen gemeinsamen Baustein `currency()` mit einem Enum aus 48 Codes. Der
Entwurfsstand dieses Plans hat dazu behauptet, einen Vorrat aus 48 Codes gebe es in der
Spezifikation überhaupt nicht. **Diese Behauptung war falsch und ist hier korrigiert.** Der
Vorrat aus 48 Codes existiert, er steht aber nur an zwei von fünf Stellen, und die beiden
Stellen widersprechen sich in sich selbst.

**Die Spezifikation führt fünf Währungsfelder, nicht drei.** Maschinell ausgezählt am
2026-09-12 über `.paths[].post.parameters[]` und über `.definitions[].properties`:

| # | Feld | Ort | `required` | maschinenlesbarer `enum` | Wertevorrat im Beschreibungstext |
| --- | --- | --- | --- | --- | --- |
| 1 | `currency` | Body-Parameter `/receipts/add` | **true** | keiner | „At the moment we accept USD, GBP and CHF" (3 Codes) |
| 2 | `currency` | Body-Parameter `/receipts/upload` | false | keiner | „Has to be 'EUR' if specified" (1 Code) |
| 3 | `currency` | Body-Parameter `/transactions/add` | false | keiner | **47** Codes, ausgeschrieben, **ohne** `RSD` |
| 4 | `currency` | Eigenschaft `Receipt`, Element von `/receipts/addBatch` | **true** (`Receipt.required`) | **`["EUR"]`** | **48** Codes, ausgeschrieben, **mit** `RSD` |
| 5 | `currency` | Eigenschaft `Transaction`, Element von `/transactions/addBatch` | false | **`["EUR"]`** | **48** Codes, dieselbe Liste wie 4 |

Die 48er-Liste ist die 47er-Liste **plus genau einen Code**, `RSD`. Die Felder 4 und 5 tragen
wörtlich denselben Beschreibungstext, und dieser Text beginnt an **beiden** Stellen mit
*„The transaction currency."* und endet mit *„An empty string is not considered a valid type."*
— auch in `Receipt`, wo es weder um eine Zahlung noch um ein `type`-Feld geht.

Daraus folgen drei belegte Feststellungen:

1. **Der Ein-Wert-`enum` `["EUR"]` an den Feldern 4 und 5 widerspricht dem Beschreibungstext
   derselben Eigenschaft** (48 Codes) und, bei Feld 5, zusätzlich dem Body-Parameter desselben
   Vorgangs (47 Codes). Er wird wie das Platzhalterschema des `order`-Parameters behandelt: als
   Spezifikationsfehler, nicht als Wertevorrat (Anhang B Punkt 47).
2. **Der Beschreibungstext der Felder 4 und 5 ist an Feld 4 eine Kopie aus `Transaction`.**
   Belegt durch den Wortlaut („The transaction currency", „valid type"). Er ist deshalb keine
   eigenständige Aussage über Belege.
3. **Die Spezifikation erklärt Stapelelement und Einzelendpunkt ausdrücklich für gleich.** Die
   Parameterbeschreibung von `/receipts/addBatch` lautet *„A receipt has the same fields like
   the /receipts/add endpoint has, same applies for error messages"*, die von
   `/transactions/addBatch` entsprechend. Wo Einzel- und Stapelform verschiedene Vorräte nennen,
   ist das ein Pflegefehler und keine fachliche Unterscheidung.

Daraus folgt die Regel in 4.5: **kein gemeinsamer Währungsbaustein über alle fünf Felder**,
wohl aber **je Ressource genau ein Vorrat für Einzel- und Stapelform**, und dort, wo die
Spezifikation sich selbst widerspricht, ein freier String mit benanntem Widerspruch in der
Parameterbeschreibung. B's Baustein war also nicht erfunden, sondern zu weit gefasst.

---

## 1. Leitidee und Architektur

### 1.1 Die Leitidee in drei Sätzen

Der Server ist eine **überprüfbare, ehrliche Durchreiche mit dickem Beipackzettel**: 54
Werkzeuge, eines je API-Endpunkt, ohne verborgene Logik, aber jedes mit Name, Beschreibung,
Schema, Annotationen, Antwortvertrag und Fehlertabelle in genau einem Registereintrag, den
ein Test gegen die OpenAPI-Datei aufrechnen kann. Zwischen Werkzeug und HTTP liegt genau ein
generischer Ausführungspfad, der nichts über Buchhaltung weiß, dafür aber jede Annahme über
das Antwortformat prüft, bevor ein Wert weitergereicht wird. Alles, was für alle Werkzeuge
gleich gilt, steht genau einmal in den `instructions` und in den MCP-Resources, nicht 54-mal
in den Definitionen.

### 1.2 Die fünf tragenden Entscheidungen

1. **Register statt Handler.** Was 54-fach existiert, sind Daten, keine Ablaufpfade. Es gibt
   genau einen Handler. Ein Fehler in der Ablauflogik ist damit ein Fehler und nicht
   potenziell 54.
2. **Eine Datei je Werkzeug.** `src/registry/tools/<werkzeugname>.ts`. Die Frage „wo ändere
   ich `bb_postings_cancel`" hat genau eine Antwort, die Prüfung „Dateiname gleich
   Werkzeugname" ist als Test formulierbar, und fünf Agenten können gleichzeitig an den
   Registereinträgen arbeiten, ohne sich in dieselbe Datei zu schreiben.
3. **Der Antwortvertrag gilt je Endpunkt, nicht je Fachobjekt.** L2 und L3 machen das
   zwingend. Wer einen gemeinsamen `Receipt`-Typ baut, erzeugt genau den stillen Datenfehler,
   den ein Buchhaltungswerkzeug nicht machen darf: ein `due_date`, das beim Einzelabruf immer
   leer aussieht, weil das Feld dort `date_payment_due` heißt.
4. **Retry hängt an der Werkzeugklasse, nicht am Fehlertyp.** Der Retry-Zweig liegt nicht im
   HTTP-Client, sondern wird vom Registereintrag freigeschaltet. Ein später nachgerüsteter
   schreibender Endpunkt bekommt bauartbedingt keinen Retry.
5. **Tolerant nach außen, streng nach innen.** Unbekannte Antwortfelder werden durchgereicht
   (L4). Fehlende oder typwidrige *bekannte* Felder sind ein Vertragsbruch und werden in
   derselben Antwort gemeldet, die der Agent liest.

### 1.3 Die Schichten

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MCP-Client (Claude Code, Claude Desktop, Codex CLI, …)                       │
│   sieht: 54 Werkzeuge + instructions + Resources. Entscheidet über Freigabe.  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ stdio, JSON-RPC, ausgehandelte Revision 2025-11-25
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ (1) SERVER       src/server/*        McpServer, 54 registerTool-Aufrufe,     │
│                                      instructions, sauberes Herunterfahren    │
├──────────────────────────────────────────────────────────────────────────────┤
│ (2) REGISTER     src/registry/*      54 Einträge, eine Datei je Werkzeug.     │
│                                      Einzige Wahrheitsquelle für Werkzeuge.   │
├──────────────────────────────────────────────────────────────────────────────┤
│ (3) GUARDS       src/guards/*        feste Reihenfolge, jeder Abbruch VOR     │
│                                      dem ersten Byte über die Leitung         │
├──────────────────────────────────────────────────────────────────────────────┤
│ (4) MAPPING hin  src/mapping/request Argumente → Body, Umbenennungen zurück,  │
│                                      Positionsliste → parallele Arrays        │
├──────────────────────────────────────────────────────────────────────────────┤
│ (5) HTTP         src/http/*          Basic Auth, Timeout, Abbruchsignal,      │
│                                      Token-Eimer, Retry nur lesend,           │
│                                      Content-Type-Prüfung, Umschlagzerlegung  │
├──────────────────────────────────────────────────────────────────────────────┤
│ (6) FEHLER       src/errors/*        (Pfad, error_code) → Klasse → Vierblock  │
├──────────────────────────────────────────────────────────────────────────────┤
│ (7) MAPPING zur. src/mapping/resp.   Antwortvertrag je Endpunkt, Normalisie-  │
│                                      rung, _contract_warnings, Projektion     │
├──────────────────────────────────────────────────────────────────────────────┤
│ (8) DARSTELLUNG  src/response/*      structuredContent + Markdown, Kürzung,   │
│                                      Bestandszeile, Anschlusshinweis          │
├──────────────────────────────────────────────────────────────────────────────┤
│ (9) PROTOKOLL    src/logging/*       ausschließlich stderr, ohne Geheimnisse  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS POST, JSON
                        BuchhaltungsButler API v1
```

### 1.4 Der Weg eines Aufrufs

Beispiel `bb_postings_create_for_receipt` mit einer Splitbuchung aus zwei Positionen zu einem
bestehenden Beleg. Dieses Werkzeug ist das Beispiel, weil `/postings/add/receipt` einer der
fünf Endpunkte mit parallelen Arrays ist (4.8); `bb_postings_create_free` legt dagegen genau
eine Buchungszeile aus skalaren Feldern an und kennt keine Positionsliste.

1. **Server** schlägt den Registereintrag nach. Unbekannter Name → JSON-RPC-Protokollfehler.
   Das ist der einzige Fall, in dem ein Protokollfehler entsteht; alles andere ist
   `isError: true` im Ergebnis.
2. **Guard 1, Konfiguration.** Fehlen Zugangsdaten, endet der Aufruf hier mit dem Text aus
   6.5. Kein Request.
3. **Guard 2, Nur-Lesen.** Klasse ist `B`, also greift `BB_MCP_READ_ONLY`, falls gesetzt.
   Absagetext nach `tool-design.md` 9.5, in der deutschen Fassung aus 6.6. Kein Request.
4. **Guard 3, Schema.** Zod validiert streng, `additionalProperties: false`. Begründung:
   Die API ignoriert unbekannte Body-Felder kommentarlos; ohne strenge Validierung wäre ein
   Tippfehler im Feldnamen ein stiller Datenfehler.
5. **Guard 4, Querprüfungen.** Die Prüfungen Q1 bis Q8 aus 4.7, soweit der Eintrag sie
   nennt. Kein Request bei Fehlschlag.
6. **Guard 5, Betrags- und Stapelgrenze.** `BB_MCP_MAX_AMOUNT`, `BB_MCP_MAX_BATCH`.
7. **Guard 6, Duplikatshinweis. Standardmäßig abgeschaltet** (`BB_MCP_DUPLICATE_CHECK=off`,
   Vorgabe). Nur wenn der Betreiber ihn auf `on` stellt, setzt dieser Guard einen lesenden
   Zusatzaufruf ab, der ein zweites Token aus dem Minutenkontingent des Mandanten verbraucht.
   Ein Treffer **blockiert nicht**, er wandert in die Antwort. Bei Stapelwerkzeugen läuft er
   einmal für den ganzen Stapel. Ist der Schalter aus, geht **kein** Zusatzaufruf hinaus, und
   ein Werkzeugaufruf bleibt genau ein API-Aufruf (7.5 Regel 2). Der Schalterzustand steht im
   Zustandsblock der `instructions` (6.7), damit der Agent den Verbrauch kennt, ohne ihn zu
   erraten.
8. **Request-Mapper.** `positions` → parallele Arrays, aber nur an den fünf Endpunkten aus
   4.8; `payment_account_number` → `account`;
   `api_key` aus der Konfiguration, niemals aus den Argumenten; Pfadsegment bauen, falls der
   Eintrag eine Pfadvorlage trägt (4.6).
9. **Rate-Limiter.** Token aus `default`, zusätzlich aus dem Sondereimer des Eintrags.
   Eimerschlüssel ist der `api_key`.
10. **HTTP.** `POST`, Basic Auth, `Content-Type: application/json`, Zeitlimit,
    `extra.signal` durchgereicht, `redirect: "error"`, kein Cookie-Jar.
11. **Antwortprüfung.** Content-Type zuerst; dann JSON; dann `success` als Boolean; dann die
    im Eintrag erwartete Form (`list`, `object`, `ack`).
12. **Antwortvertrag.** Bekannte Felder typisieren, unbekannte durchreichen, fehlende oder
    typwidrige bekannte Felder als `_contract_warnings` melden.
13. **Antwort.** `structuredContent` plus Markdown-Text plus Umkehrweg plus
    Anschlusshinweis.
14. **Audit.** Eine Zeile auf stderr: Zeitstempel, Werkzeug, Klasse, Endpunkt, Dauer,
    Ergebnisstatus, Argument**namen** ohne Werte. **Als Endpunkt steht dort der
    Spezifikationspfad** (`path.specPath`, 4.6), niemals der gebaute Pfad: Bei den vier
    Werkzeugen mit Pfadvorlage stünde sonst die eingesetzte Kennung im Protokoll, und das wäre
    ein Wert und kein Name.

**Ein Zwischenschritt, der im Auslieferungszustand nie greift.** Ist der Stammdatenspeicher
eingeschaltet (`BB_MCP_CACHE_TTL_MS` ungleich `0`; Vorgabe ist `0`, also aus), wird er bei den
**vier** Werkzeugen aus 7.8 zwischen Schritt 7 und Schritt 8 befragt. Ein Treffer beendet den
Aufruf ohne Request und ohne Token, und die Antwort weist ihn aus. Nach einer erfolgreichen
Antwort wird der Speicher nach der Tabelle in 7.8 gefüllt beziehungsweise verworfen. Bei
`BB_MCP_CACHE_TTL_MS=0` existiert dieser Zwischenschritt nicht; die Schrittfolge oben ist dann
vollständig.

### 1.5 Was der Server ausdrücklich nicht tut

- Er fasst keine Endpunkte zusammen und erfindet keine Komfortwerkzeuge (E1).
- Er sperrt im Auslieferungszustand nichts (E2).
- Er fragt nicht nach. Kein `confirm`, kein Trockenlauf, kein serverseitiges
  Bestätigungsmuster (E2, `tool-design.md` 9.4).
- Er wiederholt keinen schreibenden Aufruf automatisch. Diese Regel ist nicht konfigurierbar.
- Er blättert nicht selbsttätig durch Seiten.
- Er behauptet nie eine Gesamttrefferzahl.
- Er schreibt nichts auf stdout außer dem MCP-Protokoll.
- Er entfernt keine Werkzeuge aus `tools/list`. Die Liste ist über die gesamte Verbindung
  stabil und hängt von keinem Schalter ab.

---

## 2. Vollständiger Dateibaum

Eine Zeile Zweck je Datei. Die Spalte hinter dem Dateinamen ist verbindlich: Sie legt fest,
wofür die Datei zuständig ist und wofür nicht.

```text
buchhaltungsbutler-mcp/
├── package.json                       Paket @dennismenken/buchhaltungsbutler-mcp, genau ein bin: bbutler-mcp
├── pnpm-lock.yaml                     eingechecktes Lockfile, Voraussetzung reproduzierbarer Bauläufe
├── tsconfig.json                      Produktionskonfiguration: NodeNext, strict, ES2022, noUncheckedIndexedAccess
├── tsconfig.test.json                 gelockerte Konfiguration nur für test/
├── tsdown.config.ts                   baut dist/cli.js und dist/index.js, Shebang und Dateimodus 755
├── vitest.config.ts                   Testlauf, Abdeckungsschwellen, globaler Setup mit disableNetConnect
├── eslint.config.js                   Flat Config, typgestützt, no-console außer error, Verbot von process.stdout
├── biome.json                         Formatierung, kein Linting
├── .gitignore                         darin ausdrücklich src/registry/index.generated.ts, das nicht eingecheckt wird
├── .npmignore                         hält docs/ und test/ aus dem Tarball, ergänzend zu files[]
├── .env.example                       alle Umgebungsvariablen mit Vorgabe und Kommentar, ohne echte Werte
├── LICENSE                            MIT
├── NOTICE.md                          Kennzeichnung als inoffiziell, Markenhinweis
├── SECURITY.md                        privater Meldeweg, Hinweis auf das Produktivdatenrisiko
├── CONTRIBUTING.md                    Entwicklungsaufbau, Registerweg, Pflicht zum Vertragslauf vor Releases
├── CHANGELOG.md                       Keep a Changelog, von Hand gepflegt, Pflicht je Veröffentlichung
├── README.md                          deutsch, Gliederung in Abschnitt 10
│
├── .github/
│   ├── dependabot.yml                 wöchentlich für npm und GitHub Actions
│   └── workflows/
│       ├── ci.yml                     Generatordifferenz, Typecheck, Lint, Format, Tests, Bau, Paketprobelauf
│       ├── publish.yml                Tag v*.*.*: .mcpb vor npm publish, OIDC Trusted Publishing, Provenance
│       └── drift.yml                  wöchentlich: Generatorlauf gegen eingecheckten Stand, Größenbudget aus 9.10
│
├── .mcpb/
│   └── manifest.template.json         Vorlage des Bundle-Manifests; Werkzeugliste wird eingesetzt, nie gepflegt
│
├── docs/                              die 15 Dossiers der Recherchephase (einschließlich
│                                      api/live-befunde-orchestrator.md) plus dieser Plan; die in Abschnitt 15
│                                      genannten Stellen werden in AP20 nachgezogen. Dazu kommen die
│                                      Befunddateien der Arbeitspakete unter docs/entwicklung/ (AP02, AP14,
│                                      AP18, AP19, AP22) und die Veröffentlichungs-Checkliste (AP21)
│
├── scripts/
│   ├── generate.ts                    ruft alle Generatoren, schreibt src/generated, meldet Abweichungen
│   ├── gen-endpoints.ts               OpenAPI → src/generated/endpoints.ts (54 Pfade, 371 Parameter, HTML bereinigt)
│   ├── gen-errors.ts                  OpenAPI → src/generated/errors.ts (786 Paare nach (Pfad, Code))
│   ├── gen-version.ts                 package.json → src/generated/version.ts, kein JSON-Lesen zur Laufzeit
│   ├── gen-registry-index.ts          erzeugt src/registry/index.generated.ts aus den 54 Dateien im Verzeichnis;
│   │                                  die Ausgabe wird NICHT eingecheckt (4.2)
│   ├── gen-tool-table.ts              erzeugt die Werkzeugtabelle der README aus dem Register
│   ├── measure-tokens.ts              misst die Token aller Definitionen mit dem Tokenizer aus 13.9, schreibt einen Bericht
│   ├── check-size.ts                  prüft das gepackte und entpackte Tarball gegen das Budget aus 9.10
│   ├── build-mcpb.ts                  baut das .mcpb, ruft mcpb ausschließlich aus node_modules
│   └── contract-read.ts               Vertragslauf gegen die echte API, hart auf die 15 lesenden Pfade begrenzt
│
├── src/
│   ├── cli.ts                         bin-Einstieg, Shebang; ohne Unterbefehl Server, sonst dynamischer Import
│   │                                  (in AP01 als Platzhalter angelegt, in AP15 verdrahtet)
│   ├── index.ts                       programmatischer Export (createServer, Register, Typen), seiteneffektfrei
│   │
│   ├── server/
│   │   ├── create-server.ts           baut den McpServer, hängt Signal- und Fehlerbehandlung ein
│   │   ├── register-tools.ts          registriert alle 54 Einträge; enthält den EINEN generischen Handler
│   │   ├── instructions.ts            Servertext nach 6.7; kennt den Schalterzustand, nicht die Endpunkte
│   │   │                              (in AP10 als Platzhalter angelegt, in AP14 befüllt)
│   │   ├── resources.ts               Registrierung der vier MCP-Resources aus 7.7
│   │   │                              (in AP10 als Platzhalter angelegt, in AP14 befüllt)
│   │   └── shutdown.ts                idempotentes Herunterfahren bei SIGINT, SIGTERM, stdin-Ende
│   │
│   ├── registry/
│   │   ├── types.ts                   Typ ToolEntry: die zentrale Datenstruktur des Projekts (2.1)
│   │   ├── classes.ts                 die sechs Klassen R, A, AR, M, D, B und ihre vier Annotationswerte
│   │   ├── index.generated.ts         erzeugter Index über die 54 Einträge, Nachschlagen nach Name und Pfad;
│   │   │                              nicht eingecheckt, steht in .gitignore, wird vor Bau, Test und
│   │   │                              Typprüfung erzeugt (4.2, AP01) und gehört deshalb keinem Arbeitspaket
│   │   ├── mandatory-sentences.ts     die sieben Pflichtsätze U1 bis U7 aus 3.5 als Konstanten
│   │   ├── budget.ts                  Tokenbudgets aus 4.9 und 4.10, nur der Inhaber ändert sie; dazu
│   │   │                              die Umrechnungskonstante CHARS_PER_TOKEN (in AP14 gesetzt)
│   │   └── tools/                     54 Dateien, Dateiname gleich Werkzeugname plus .ts
│   │       ├── bb_receipts_search.ts  … und 53 weitere, exakt nach der Tabelle in Abschnitt 3
│   │       └── …
│   │
│   ├── schema/
│   │   ├── primitives.ts              wiederverwendbare Zod-Bausteine: Datum, Datumzeit, Betrag, Kennung
│   │   ├── vocab.ts                   geteilte Textbausteine je Feldart, siehe 4.5
│   │   ├── pagination.ts              limit/offset je Endpunkt mit eigenem Maximum und konservativem Default
│   │   ├── order.ts                   die drei order-Formen als drei getrennte Schemata, keine Abstraktion
│   │   ├── line-items.ts              Positionsliste ↔ parallele Arrays, Längeninvariante konstruktiv,
│   │   │                              maxItems = min(50, BB_MCP_MAX_BATCH) wie in batch.ts (6.2, 4.8)
│   │   ├── batch.ts                   Objektarrays der acht Stapelendpunkte, maxItems = min(50, BB_MCP_MAX_BATCH)
│   │   ├── cross-checks.ts            die Querprüfungen Q1 bis Q8 aus 4.7 als superRefine-Bausteine
│   │   └── build.ts                   ToolEntry → Zod-Objekt → JSON Schema; erzwingt Vollständigkeit
│   │
│   ├── guards/
│   │   ├── configured.ts              Guard 1: Zustand "nicht konfiguriert", Text aus 6.5
│   │   ├── read-only.ts               Guard 2: BB_MCP_READ_ONLY, liest die Klasse aus dem Register
│   │   ├── limits.ts                  Guard 5: BB_MCP_MAX_BATCH, BB_MCP_MAX_AMOUNT
│   │   └── duplicate-check.ts         Guard 6: lesender Vorabgriff, Vorgabe AUS, blockiert nie, je Stapel einmal
│   │
│   ├── mapping/
│   │   ├── request.ts                 Werkzeugargumente → API-Body, Umbenennungen zurück, api_key einsetzen
│   │   ├── path.ts                    Pfadbau für die vier Endpunkte mit Platzhalter, Regeln aus 4.6
│   │   ├── parallel-arrays.ts         Positionsliste → parallele Arrays, positionsgenaue Fehlermeldung
│   │   ├── response.ts                Antwortvertrag anwenden, unbekannte Felder erhalten, Projektion
│   │   ├── coerce.ts                  "0"/"1" → Boolean, Betragsstring → zusätzlich Ganzzahl-Cent, null tragen
│   │   ├── contract-violation.ts      _contract_warnings: Feldname, erwarteter und gesehener Typ
│   │   └── decimal.ts                 Betragsrechnung ausschließlich in Ganzzahl-Cent, nie Gleitkomma
│   │
│   ├── http/
│   │   ├── client.ts                  der EINE fetch-Aufrufer: Header, Body, Zeitlimit, Signal, Content-Type
│   │   ├── auth.ts                    Basic-Auth-Header über Buffer.from, niemals protokolliert
│   │   ├── envelope.ts                Umschlag zerlegen, success prüfen, Form gegen den Eintrag halten
│   │   ├── rate-limiter.ts            Token-Eimer je (api_key, Eimername), serialisiert über eine Promise-Kette
│   │   ├── retry.ts                   Backoff mit Jitter; wird ausschließlich für Klasse R freigeschaltet
│   │   ├── dispatcher.ts              globaler undici-Dispatcher: Keep-Alive, EnvHttpProxyAgent
│   │   └── transport-error.ts         Fehlertypen, jeder mit dem Feld changed: "nein" | "unbekannt"
│   │
│   ├── errors/
│   │   ├── catalog.ts                 dünne Hülle um src/generated/errors.ts, dynamisch geladen
│   │   ├── classify.ts                (Pfad, Code) plus Meldungstext → eine der fünf Klassen aus 5.6
│   │   ├── render.ts                  der Vierblock-Text plus der Pflichtsatz zum Datenzustand
│   │   └── write-uncertainty.ts       Sondertext für schreibenden Aufruf ohne verwertbare Antwort
│   │
│   ├── response/
│   │   ├── build.ts                   setzt structuredContent, Textblock und Anschlusshinweis zusammen
│   │   ├── table.ts                   Markdown-Tabelle, Feldnamen im Original, keine Verschönerung
│   │   ├── truncate.ts                weiche und harte Grenze, nennt die Zahl der unterdrückten Zeilen
│   │   ├── pagination-note.ts         die drei Bestandszeilen aus 7.5
│   │   ├── next-step.ts               Anschlusshinweis mit konkretem nächsten Aufruf
│   │   ├── output-schema.ts           erzeugt das offene outputSchema aus dem Antwortvertrag
│   │   └── sanitize.ts                neutralisiert Freitext aus der API, entfernt Steuer- und Bidi-Zeichen
│   │
│   ├── cache/
│   │   └── store.ts                   optionaler Stammdatenspeicher, Vorgabe aus, Tabelle aus dem Register
│   │                                  (gehört AP09, siehe 11.2)
│   │
│   ├── upload/
│   │   ├── source.ts                  Dateiquelle: base64, file://, https://
│   │   ├── ssrf.ts                    Adressprüfung je Weiterleitungssprung, laufende Bytezählung
│   │   ├── local-file.ts              realpath, O_NOFOLLOW, alle Prüfungen am selben Deskriptor
│   │   └── sniff.ts                   Magic Bytes statt Content-Type, Dateinamen bereinigen
│   │
│   ├── config/
│   │   ├── env.ts                     Zod-Schema aller Umgebungsvariablen, Vorgaben, Prüfregeln
│   │   ├── credentials-file.ts        Profildatei lesen und schreiben, Rechteprüfung 0600
│   │   ├── resolve.ts                 Auflösungsreihenfolge, Startprüfung, eingefrorenes Konfigurationsobjekt
│   │   └── redact.ts                  Schwärzung; jede ausgehende Zeichenkette läuft hier durch
│   │
│   ├── logging/
│   │   └── stderr.ts                  der einzige erlaubte Ausgabeweg neben dem Protokoll
│   │
│   ├── cli/
│   │   ├── run.ts                     Unterbefehlsweiche, Hilfe, Version
│   │   ├── setup.ts                   Einrichtungsassistent, neun Schritte nach Abschnitt 8
│   │   ├── doctor.ts                  Diagnose ohne Geheimnisse, für Fehlerberichte
│   │   ├── test.ts                    nur der Verbindungstest, Rückgabewert 0 oder 1, für CI
│   │   ├── profiles.ts                Mandantenprofile auflisten, hinzufügen, entfernen
│   │   ├── print-config.ts            fertigen Konfigurationsblock ausgeben, nichts schreiben
│   │   ├── uninstall.ts               eigenen Eintrag beim genannten Client entfernen
│   │   ├── prompt.ts                  maskierte Eingabe, Auswahl, Ja/Nein, ohne Zusatzabhängigkeit
│   │   └── clients/
│   │       ├── types.ts               was ein Clientadapter können muss
│   │       ├── claude-code.ts         claude mcp add-json als Unterprozess
│   │       ├── claude-desktop.ts      claude_desktop_config.json lesen, ergänzen, zurückschreiben
│   │       ├── codex.ts               codex mcp add als Unterprozess, startup_timeout_sec = 30
│   │       ├── grok.ts                grok mcp add als Unterprozess
│   │       ├── vscode.ts              code --add-mcp, oder .vscode/mcp.json wenn inputs gebraucht wird
│   │       ├── cursor.ts              ~/.cursor/mcp.json oder .cursor/mcp.json
│   │       ├── windsurf.ts            ~/.codeium/windsurf/mcp_config.json
│   │       ├── lmstudio.ts            ~/.lmstudio/mcp.json, nur wenn vorhanden
│   │       ├── cline.ts               ~/.cline/mcp.json
│   │       └── print-only.ts          Zed, Continue, Jan und alles Übrige: nur ausgeben
│   │
│   └── generated/
│       ├── endpoints.ts               erzeugt aus der OpenAPI-Datei, eingecheckt, nie von Hand geändert
│       ├── errors.ts                  erzeugt, eingecheckt, nur im Fehlerfall dynamisch geladen
│       └── version.ts                 erzeugt aus package.json
│
└── test/
    ├── setup.ts                       installiert undici MockAgent mit disableNetConnect
    ├── registry/
    │   ├── coverage.test.ts           P1 bis P3 aus 9.2: Vollständigkeit, Eineindeutigkeit, Parameterdeckung
    │   ├── names.test.ts              P4: Regex, Präfix, Verbliste, Eindeutigkeit, Länge
    │   ├── classes.test.ts            P5, P6: Klassen gegen zweite Liste, Wirkungsabgleich 15/24/8/7
    │   ├── annotations.test.ts        P7: vier Hints je Werkzeug, Werte gleich der Klassentabelle
    │   ├── descriptions.test.ts       P8: Pflichtsätze U1 bis U7, Längenkorridore, Verweisprüfung
    │   ├── secrets.test.ts            P9: kein Zugangsdatum in Definition, Antwort, Fehlertext, Resource
    │   ├── write-equipment.test.ts    P10: verifyWith, maxItems, Eimerzuordnung bei allen 39 schreibenden
    │   ├── token-budget.test.ts       P11: Gesamtbudget und Einzelbudget je Beschreibungsstufe
    │   ├── file-layout.test.ts        P12: Dateiname gleich Werkzeugname, genau 54 Dateien
    │   └── response-contract.test.ts  P13: jeder Name in concise steht in responseContract.fields
    ├── contract/
    │   ├── read-only.test.ts          alle 39 schreibenden lehnen ab, ohne Request; 15 lesende führen aus
    │   ├── no-write-retry.test.ts     je schreibendem Werkzeug genau ein Request bei HTTP 504
    │   ├── output-schema.test.ts      jede Golden-Antwort validiert gegen ihr outputSchema
    │   └── mcpb-tools.test.ts         Werkzeugliste des Bundle-Manifests gegen das Register
    ├── unit/                          je Modul eine Datei, ohne Netz
    ├── golden/                        Antwortbeispiele mit Herkunftszeile je Datei, erfundene Geschäftsdaten
    ├── integration/
    │   ├── server.test.ts             gebauten Server starten, initialize, tools/list, tools/call
    │   └── package-smoke.test.ts      der Paketprobelauf aus 9.6
    ├── eval/
    │   └── tasks.test.ts              die elf Evaluationsaufgaben aus 9.8 gegen aufgezeichnete Mocks
    └── helpers/
        ├── mock-api.ts                MockAgent-Aufbau
        └── registry-fixtures.ts       Registerhilfen für Tests
```

### 2.1 Der Typ `ToolEntry`, die zentrale Datenstruktur

Jede der 54 Dateien unter `src/registry/tools/` exportiert genau ein Objekt dieses Typs. Der
Typ ist die verbindliche Antwort auf die Frage, was ein Werkzeug ausmacht.

```ts
export interface ToolEntry {
  name: string;                      // bb_…, gleich dem Dateinamen ohne .ts
  title: string;                     // deutscher Anzeigename, höchstens 40 Zeichen (Abschnitt 3.6)
  path: PathSpec;                    // { literal } oder { template, params, specPath } (4.6)
  effect: "read" | "create" | "modify" | "delete";   // Wirkung nach grundlagen.md 7.3
  toolClass: "R" | "A" | "AR" | "M" | "D" | "B";     // treibt Annotationen, Retry, Schalter
  tier: 1 | 2 | 3;                    // Beschreibungsbudget (4.9)
  description: string;                // deutsch, englische Bezeichner und API-Feldnamen im Original
  mandatorySentence?: "U1"|"U2"|"U3"|"U4"|"U5"|"U6"|"U7";  // Pflicht bei toolClass !== "R"
  fields: FieldSpec[];                // jedes Feld des Endpunkts außer api_key, genau einmal
  serverOnlyFields: string[];         // ausschließlich "response_format" (4.3)
  omitted: { apiName: string; reason: string }[];   // leer, außer api_key; Grund Pflicht
  responseContract: ResponseContract; // je Endpunkt, nicht je Fachobjekt (7.2)
  shape: "list" | "object" | "ack";   // erwartete Umschlagform (5.5)
  concise: string[];                  // Feldliste der concise-Projektion (7.4)
  bucket: "default" | "upload" | "batch" | "reports";      // Rate-Limit-Eimer (5.4)
  timeoutTier: "short" | "normal" | "long";                // 5.2
  verifyWith?: VerifySpec;            // Pflicht bei toolClass !== "R" (5.3)
  duplicateCheck?: DuplicateSpec;     // nur bei anlegenden Werkzeugen mit tragfähigem Schlüssel
  crossChecks: CrossCheckId[];        // Q1 bis Q8 aus 4.7
  invalidatesCache: string[];         // Werkzeugnamen, deren Cachestand dieser Aufruf verwirft (7.8)
  verified?: boolean;                 // false: Aufrufform abgeleitet, nicht gemessen
                                      //   (4.6; Feststellung AP19, Nachziehen AP19b)
}
```

**Die im Typ benutzten Hilfstypen, vollständig.** Ohne sie ist `ToolEntry` nicht
implementierbar, und der Deckungstest P3 hätte keine Grundlage. `PathSpec` steht in 4.6, die
übrigen hier:

```ts
/** Genau ein Werkzeugfeld. Deckt einen, mehrere oder keinen API-Parameter ab. */
export interface FieldSpec {
  name: string;               // Name im Werkzeugschema, snake_case
  apiNames: string[];         // die abgedeckten Body-Parameter des Endpunkts.
                              //   1 Eintrag im Normalfall (auch bei reiner Umbenennung),
                              //   6 oder 7 beim Positionsbehälter (4.8, Anhang A),
                              //   0 nur bei rein serverseitigen Feldern (serverOnlyFields)
                              //     und bei Pfadsegmentfeldern, die die Spezifikation
                              //     überhaupt nicht führt (4.6)
  source: "body" | "path" | "server";  // wohin der Wert geht; "server" verlässt den Prozess nie
  required: boolean;
  requiredReason?: string;    // Pflicht, sobald required gegenüber der Spezifikation
                              //   verschärft ist; nennt die Belegstelle (4.3)
  description: string;        // deutsch, API-Feldnamen und Werkzeugnamen im Original
  schema: SchemaFragment;     // Zod-Baustein aus src/schema/*, siehe 4.5
  itemFields?: FieldSpec[];   // nur bei Behälterfeldern: Aufbau eines Elements.
                              //   Deren apiNames zielen bei den acht Stapelbehältern
                              //   auf die Eigenschaften der ELEMENTdefinition, nicht
                              //   auf Body-Parameter (Deckung zweiter Stufe,
                              //   4.4 Punkt 3); bei den Positionslisten der Werkzeuge
                              //   17, 18, 19, 21 und 23 auf die parallelen
                              //   Array-Parameter des Endpunkts (4.8)
  transform?: "parallel-arrays" | "object-list" | "none";  // Umformung, in der
                              //   Werkzeugbeschreibung wörtlich deklariert (4.8)
}

/** Was dieser eine Endpunkt zurückliefert. Gilt je Endpunkt, nie je Fachobjekt (7.2). */
export interface ResponseContract {
  container: "data" | "none";                 // wo die Nutzdaten liegen
  fields: Record<string, ContractFieldType>;  // gemessene oder dokumentierte Feldnamen
  source: "gemessen" | "dokumentiert";        // Herkunft; "gemessen" nur für 0.3
  measuredOn?: string;                        // ISO-Datum der Messung, Pflicht bei "gemessen"
}

export type ContractFieldType =
  | "string" | "number" | "boolean" | "null-or-string"
  | "amount-string"      // Betrag als String; erzeugt zusätzlich <feld>_cents (7.4)
  | "bool-string"        // "0"/"1"; wird zu echtem Boolean normalisiert (7.4)
  | "id-string";         // Kennung; ausgehend immer String (S10)

/** Der Prüfweg nach einem Zeitlimit (5.3, 5.7). Datenstruktur statt Prosa. */
export type VerifySpec =
  | { kind: "tool"; tool: string; argsFrom: Record<string, string>; hint: string }
  | { kind: "none"; reason: string };   // API bietet keinen Leseweg; Weboberfläche

/** Duplikatsabfrage vor einem anlegenden Aufruf (Guard 6). Vorgabe: abgeschaltet (6.2). */
export interface DuplicateSpec {
  tool: string;                 // das lesende Werkzeug, mit dem gesucht wird
  keyFields: string[];          // die Felder, die zusammen den fachlichen Schlüssel bilden
  perBatch: true;               // bei Stapelwerkzeugen genau ein Aufruf für den ganzen Stapel
}

export type CrossCheckId = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8";  // 4.7

/** Ein Zod-Schema für genau ein Feld, aus den Bausteinen in src/schema/* (4.5). Der Typ
 *  ist absichtlich weit: src/schema/build.ts setzt die Fragmente zum Objektschema zusammen
 *  und erzwingt dort .strict(); die Bausteine selbst sind gewöhnliche Zod-Typen. */
export type SchemaFragment = import("zod").ZodTypeAny;
```

**Warum `apiNames` ein Array ist und nicht ein einzelner Name.** Fünf Endpunkte nehmen
zusammengehörige Werte als mehrere gleich lange Arrays entgegen (4.8, maschinell belegt). Das
Werkzeug bildet sie auf **ein** Feld `positions` beziehungsweise `items` ab. Mit einem
einzelnen `apiName` könnte dieses eine Feld sechs oder sieben Parameter nicht abdecken, und der
Deckungstest P3 wäre an diesen fünf Endpunkten dauerhaft rot. Mit `apiNames` deckt ein
Behälterfeld genau die Parameter ab, die es erzeugt, und P3 bleibt eine echte Prüfung statt
einer Ausnahme.

**Bezeichner und Aufzählungswerte im Code sind englisch** (E4). Der Fließtext dieses Plans,
jede Werkzeug- und Parameterbeschreibung, jeder Fehlertext und die `instructions` sind dagegen
deutsch (4.9). Die Zuordnung der englischen `effect`-Werte zur deutschen Benennung ist
eineindeutig und wird in `classes.ts` als Tabelle hinterlegt:

| `effect` im Code | Wirkung im Text und in `grundlagen.md` 7.3 | Anzahl |
| --- | --- | --- |
| `read` | lesend | 15 |
| `create` | anlegend | 24 |
| `modify` | ändernd | 8 |
| `delete` | löschend | 7 |

Ebenso `timeoutTier`: `short` ist „kurz", `normal` ist „normal", `long` ist „lang" (5.2).

Drei Felder verdienen eine Erklärung, weil sie sonst als Zierrat gelesen werden:

- **`verifyWith`** ist der Prüfweg nach einem Zeitlimit, als Datenstruktur statt als Prosa.
  Er nennt das Werkzeug, mit dem sich nachsehen lässt, ob der Vorgang durchgelaufen ist, und
  welche Argumente aus dem fehlgeschlagenen Aufruf dafür zu übernehmen sind. Für die **vier**
  Endpunkte ohne lesendes Gegenstück (`/comments/add` und die drei Rechnungsendpunkte) trägt es
  die Form `{ kind: "none", reason: … }` und sagt ausdrücklich, dass die API keinen Leseweg
  anbietet und in der Weboberfläche nachzusehen ist. Test P10 verlangt, dass kein schreibender
  Eintrag das Feld leer lässt.
- **`omitted`** ist der einzige erlaubte Weg, einen Spezifikationsparameter nicht abzubilden,
  und verlangt eine nicht leere Begründung. Im Auslieferungszustand enthält es genau einen
  Eintrag je Werkzeug, nämlich `api_key`. Damit ist E6 maschinell belegt statt behauptet.
- **`invalidatesCache`** liegt im Register und nicht im Cache-Modul, damit beim Nachrüsten
  eines Endpunkts alles an derselben Stelle steht.

---

## 3. Die 54 Werkzeuge

### 3.1 Namensschema

```
bb_<ressource>_<verb>[_<qualifizierer>]
```

snake_case, durchgehend klein, Präfix `bb_`, Ressource im Plural und vor dem Verb, kein Punkt.
Jeder Name erfüllt `^bb_[a-z][a-z0-9_]{2,37}$` und ist höchstens 40 Zeichen lang. Die engere
Regel gegenüber der SDK-Namensprüfung (`^[A-Za-z0-9._-]{1,128}$`) ist Absicht: Auf der
Clientseite gilt `^[a-zA-Z0-9_-]{1,128}$`, die Punkte verbietet. Wo sich Regeln
unterscheiden, gilt die engere.

**Verbliste, geschlossen, zwölf Verben.** Elf aus `tool-design.md` 4.4, eines ergänzt:
`search`, `get`, `list`, `create`, `update`, `delete`, `restore`, `upload`, `cancel`,
`unconfirm`, `assign`, **`unassign`**.

`unassign` ist ergänzt, weil `/transactions/unassign/receipt` mit dem Verb `delete`
`bb_transactions_delete_receipt` hieße und sich läse, als lösche es den Beleg. Das ist im
Buchhaltungskontext eine gefährliche Fehllesung. `unassign` ist das Wort, das die API selbst
im Pfad verwendet, und das Paar `assign`/`unassign` ist genau die Symmetrie, an der ein Agent
die Umkehrbarkeit abliest. Test P4 prüft die Liste; das Verb wird als **Segment** hinter der
Ressource gesucht, nicht als Namensendung, weil zwölf Namen auf einen Qualifizierer enden.

**Qualifiziererregel:** Ziel im Singular, `_batch` für die Mehrfachvariante. Also
`bb_postings_create_for_receipt` und `bb_postings_create_for_receipt_batch`. Die Pluralform
`..._for_transactions_batch` hätte 41 Zeichen und verstieße gegen die Längengrenze. Der
längste Name des Satzes ist `bb_postings_create_for_transaction_batch` mit genau 40 Zeichen.

### 3.2 Vier begründete Abweichungen vom Dossier

**A1. 54 Werkzeuge statt 28 bis 34** (`tool-design.md` 11.1). Folgt zwingend aus E1. Die
Abnahmeliste in `tool-design.md` 11.1 ist auf 54 zu ändern; die übrigen Punkte bleiben gültig.

**A2. Fachliche Ressource statt Pfadsegment bei `/settings/*`.** Die Pfade bündeln unter
`settings` drei fachlich verschiedene Dinge. Ein Präfix `bb_settings_` würde Debitoren,
Kreditoren und Sachkonten in eine gemeinsame Suchgruppe werfen und damit genau die
Verwechslung erzeugen, die der Präfix verhindern soll. Deshalb `bb_debtors_*`,
`bb_creditors_*`, `bb_postingaccounts_*`.

**A3. `/accounts/*` wird `bb_payment_accounts_*`, nicht `bb_accounts_*`.** Das ist die
wichtigste Namensentscheidung dieses Plans; 3.4 begründet sie. Die Schreibweise weicht bewusst
von `bb_postingaccounts_*` ab: Wo die API einen eigenen zusammengeschriebenen Bezeichner führt
(`postingaccount_number` ist ein realer Feldname), übernehmen wir ihn; wo wir einen Begriff
aus dem Fließtext wählen („payment account", zwei Wörter), schreiben wir ihn in snake_case aus.

**A4. `destructiveHint: true` bei Klasse M**, entgegen `tool-design.md` 9.3. Begründung in 3.3.

**Ausdrücklich keine Abweichung:** kein `confirm`-Parameter, kein erzwungener Trockenlauf,
keine serverseitige Bestätigung. `api_key` erscheint in keinem Schema. Kein Werkzeug verbindet
Suchen und Schreiben.

### 3.3 Klassen und Annotationen

Die Klasse steht als Datenstruktur in `src/registry/classes.ts` und wird **niemals** aus dem
Namen abgeleitet: `bb_postings_assign_receipt` endet auf `_receipt` und ist buchend,
`bb_reports_get_ledger` endet auf `_ledger` und ist lesend.

| Klasse | Bedeutung | readOnlyHint | destructiveHint | idempotentHint | Anzahl |
| --- | --- | --- | --- | --- | --- |
| **R** | lesend | `true` | `false` | `true` | 15 |
| **A** | additiv; legt an oder stellt eine umkehrbare Zuordnung her | `false` | `false` | `false` | 16 |
| **AR** | erzeugt eine Auswertung und ersetzt die vorherige | `false` | **`true`** | `false` | 2 |
| **M** | überschreibt einen bestehenden Stammdatensatz | `false` | **`true`** | **`true`** | 4 |
| **D** | löscht, storniert, hebt Bestätigung oder Zuordnung auf | `false` | **`true`** | `false` | 7 |
| **B** | buchend oder belegbindend, ohne Weg zurück in der API | `false` | `false` | `false` | 10 |

`openWorldHint` ist bei allen 54 Werkzeugen `true` und deshalb keine eigene Spalte: Der
Datenbestand ändert sich unabhängig von uns.

**Auszählung:** `destructiveHint: true` bei 13 Werkzeugen (AR 2 + M 4 + D 7).
`idempotentHint: true` bei 19 Werkzeugen (R 15 + M 4). Beides ist in Test P7 nachgerechnet.

**Warum `destructiveHint: true` bei Klasse M.** Das MCP-Schema definiert den Hint mit „If
false, the tool performs only additive updates". Ein `/settings/update/debtor` ersetzt
bestehende Feldwerte, das ist nicht additiv. Hinzu kommt: Kein Endpunkt liefert den Zustand
vor der Änderung zurück (`grundlagen.md` 7.3), die Änderung ist ohne vorher gezogene Kopie
also nicht rückgängig zu machen. `tool-design.md` 9.3 begründet bei Klasse AR mit genau
diesem Argument selbst ein `true`; ein überschriebener Kreditorenstammsatz, inklusive
Bankverbindung, wiegt schwerer als ein Bericht, der neu berechenbar ist. Die Risiko-Asymmetrie
entscheidet: Ein zu strenger Hint kostet eine Rückfrage, ein zu milder einen unbemerkten
Stammdatenverlust.

**Warum Klasse B `destructiveHint: false` trägt, obwohl sie die folgenreichste Klasse ist.**
Das ist die unbequemste Zeile der Tabelle und wird deshalb ausgeschrieben statt stillschweigend
gesetzt. Das MCP-Schema definiert den Hint mit „If false, the tool performs only additive
updates". Die zehn Werkzeuge der Klasse B legen **neue** Buchungszeilen, Rechnungen oder
Belegbindungen an; sie überschreiben keinen bestehenden Wert und löschen keinen. Nach der
Formulierung des Schemas sind sie damit additiv, und `destructiveHint: true` wäre eine Aussage
über etwas, das der Hint nicht meint. **Unumkehrbarkeit und Destruktivität fallen hier
auseinander:** Eine Buchung ist nach dem Festschreiben nicht mehr zu entfernen, aber sie
zerstört nichts Bestehendes. Klasse AR trägt `true`, weil ein neu erzeugter Bericht den
vorherigen desselben Typs **ersetzt**, also einen bestehenden Datensatz überschreibt; dass er
jederzeit neu berechenbar ist, ändert nichts daran, dass der Vorgänger weg ist. Die Warnung vor
der Unumkehrbarkeit läuft bei Klasse B deshalb nicht über die Annotation, sondern über die
Pflichtsätze U3 und U4 (3.5), die an allen zehn Werkzeugen maschinell geprüft werden, und über
den `title` im Freigabedialog (3.6).

**`bb_postings_assign_receipt` ist der Sonderfall innerhalb von B** und gesondert geprüft: Es
ist das einzige Werkzeug mit der Wirkung „ändernd", für das die API keinen Weg zurück anbietet
(U4; belegt ist nur, dass es unterhalb von `/postings/` keinen `unassign`-Pfad gibt). Es bleibt
trotzdem bei `destructiveHint: false`, weil es eine Bindung **herstellt** und keinen Wert
überschreibt. Sobald AP19 belegt, dass der Aufruf einen bestehenden Belegbezug einer freien
Buchung ersetzt statt ihn nur zu ergänzen, ist er auf `true` umzustellen. **Das Nachziehen tut
nicht AP19, sondern AP19b** (11.2): Es fasst `classes.ts`, die zweite Liste in
`test/registry/`, `annotations.test.ts` und die betroffenen Registerdateien in **einem** Paket
zusammen, das nach AP12a bis AP12e läuft und diese Dateien dann exklusiv hält.

**Was dabei ausdrücklich *nicht* geschieht: dieser Plan wird nicht rückwirkend geändert.** Die
Auszählungen in 3.3 und 3.9 und die Hint-Spalten der Tabelle in 3.8 beschreiben den
**Auslieferungszustand**. Ändert AP19b eine Annotation, gelten ab dann die in
`docs/entwicklung/befund-schreibend.md` fortgeschriebenen Zahlen, und der Vorgang steht in
`CHANGELOG.md`. Andernfalls müsste ein Arbeitspaket den Plan bearbeiten, was AP20 ausdrücklich
untersagt ist und wofür es keinen Eigentümer gibt.

**Warum `idempotentHint` nur bei R und M `true` ist.** Der Hint ist `true` nur dort, wo eine
Wiederholung **beweisbar** denselben Zustand ergibt. Das sind die lesenden Werkzeuge (kein
Zustand) und die vier Überschreibwerkzeuge (sie setzen einen im Aufruf genannten Zielzustand,
dasselbe Muster wie `write_file`). Alle übrigen 35 tragen `false`, auch `bb_receipts_delete`,
`bb_receipts_restore`, die drei `unconfirm`-Werkzeuge und `bb_transactions_unassign_receipt`,
bei denen eine Wiederholung plausibel wirkungslos wäre. Grund: **nicht verifiziert**, und ein
falsches `true` lädt einen Host zum automatischen Wiederholen ein. Die Asymmetrie ist dieselbe
wie oben, nur mit umgekehrtem Vorzeichen. Sobald AP19 gegen ein Testmandat das
Wiederholungsverhalten belegt, darf einzeln umgestellt werden; `classes.ts`, die zweite Liste
in `test/registry/` und `annotations.test.ts` sind dann gemeinsam nachzuziehen, und zwar in
**AP19b**, dem einzigen Paket, das diese Dateien zu diesem Zeitpunkt exklusiv hält.

### 3.4 Wie der Agent Zahlungskonto und Sachkonto auseinanderhält

Der gefährlichste Verwechslungsfall der ganzen API.

- `/accounts/get` liefert je Zahlungskonto genau zwei Felder: `name` und
  **`postingaccount_number`**. Ein Zahlungskonto wird also über eine Sachkontonummer
  adressiert.
- `/settings/get/postingaccounts` ist eine **Vereinigungsliste**: Sachkonten, Zahlungskonten,
  Debitoren und Kreditoren stehen darin nebeneinander, unterschieden durch `type` und
  `subtype`.
- Der Parameter `account` bedeutet bei `/receipts/add`, `/receipts/upload`,
  `/transactions/add` und `/transactions/get` ein **Zahlungskonto**, sein Wert ist aber eine
  **Sachkontonummer**. Bei `/postings/get` bedeutet derselbe Name etwas ganz anderes, nämlich
  eine kommagetrennte Filterliste mit Schlüsselwörtern.

Fünf Maßnahmen, die zusammen wirken:

1. **Namenstrennung.** `bb_payment_accounts_*` gegen `bb_postingaccounts_*`. Die naheliegenden
   Namen `bb_accounts_list` und `bb_postingaccounts_search` hätten sich um ein Wort
   unterschieden und in jeder alphabetischen Liste nebeneinander gestanden.
2. **Parameterumbenennung.** `account` heißt im Werkzeugschema `payment_account_number`, mit
   dem Satz: *„Sachkontonummer, die ein Zahlungskonto bezeichnet, zum Beispiel '1200'. Nicht
   das Sachkonto, auf das gebucht wird. Zahlungskonten auflisten mit
   bb_payment_accounts_list."* Die Rückübersetzung geschieht im Request-Mapper (Anhang A).
3. **Genau ein Nachschlagewerkzeug je Feld.** Jedes Feld, das eine Kontonummer erwartet, nennt
   in seiner Beschreibung genau ein Nachschlagewerkzeug, nie beide.
4. **`bb_postingaccounts_search` liefert `type` und `subtype` immer mit**, auch in `concise`,
   und die Textantwort gruppiert nach `type`. Wer die Liste liest, sieht sofort, dass `1200`
   ein Zahlungskonto und `4980` ein Sachkonto ist.
5. **Resource `bb://guide/accounts`.** Eine halbe Seite Kontenkunde, die der Agent bei Bedarf
   liest, ohne dass sie in 54 Werkzeugdefinitionen Token kostet.

### 3.5 Wie der Agent merkt, dass er etwas Unumkehrbares tut

Vier Signale, absichtlich redundant, weil jedes einzelne von einem Client oder einem Modell
übersehen werden kann.

1. **Annotation.** `destructiveHint: true` bei 13 Werkzeugen. Das einzige maschinenlesbare
   Signal.
2. **Pflichtsatz in der Beschreibung, maschinell geprüft** (`descriptions.test.ts`, P8). Jedes
   Werkzeug mit Wirkung anlegend, ändernd oder löschend trägt genau einen Satz aus diesem
   Vorrat, und zwar den zutreffenden. Der Satz steht im Register als `mandatorySentence`, der
   Text in `src/registry/mandatory-sentences.ts`.

**Die Sätze stehen auf Deutsch** (E4), wie jede vom Agenten gelesene Beschreibung. Werkzeug-
und Feldnamen bleiben unverändert im Original. Die Zeichenzahl ist angegeben, weil sie in das
Stufenbudget aus 4.9 hineinzählt und bei Stufe 3 den engsten Spielraum hat.

| Fall | Pflichtsatz | Zeichen | Werkzeuge |
| --- | --- | --- | --- |
| **U1** umkehrbar mit genau einem Werkzeug | `Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig zu machen mit <tool>.` | 97 einschließlich `<tool>` | `bb_receipts_delete`, `bb_receipts_restore`, `bb_transactions_assign_receipt`, `bb_transactions_assign_receipt_batch`, `bb_transactions_unassign_receipt`, `bb_cost_locations_create` |
| **U2** nur als Löschmarkierung umkehrbar | `Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Rückgängig nur mit bb_receipts_delete, das den Beleg lediglich als gelöscht markiert; die API kennt keinen Endpunkt, der einen Beleg endgültig entfernt.` | 217 | `bb_receipts_create`, `bb_receipts_create_batch`, `bb_receipts_upload` |
| **U3** nur durch Storno korrigierbar | `Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Eine festgeschriebene Buchung lässt sich nicht löschen, sondern nur mit bb_postings_cancel stornieren; der Storno bleibt dauerhaft sichtbar.` | 205 | die sechs `bb_postings_create_*` |
| **U4** über die API gar nicht umkehrbar | `Schreibt in die echten Buchhaltungsdaten von BuchhaltungsButler. Die API bietet keinen Endpunkt, das rückgängig zu machen.` | 122 | `bb_transactions_create`, `bb_transactions_create_batch`, `bb_invoices_create`, `bb_invoices_create_draft`, `bb_invoices_create_einvoice`, `bb_postings_assign_receipt`, `bb_debtors_create`, `bb_debtors_create_batch`, `bb_creditors_create`, `bb_creditors_create_batch`, `bb_postingaccounts_create`, `bb_payment_accounts_create`, `bb_comments_create` |
| **U5** überschreibt ohne abrufbaren Vorzustand | `Überschreibt Stammdaten im echten Mandanten von BuchhaltungsButler. Die API liefert die vorherigen Werte nicht zurück; ohne vorher gelesenen Datensatz ist die Änderung nicht rückgängig zu machen.` | 195 | `bb_debtors_update`, `bb_creditors_update`, `bb_postingaccounts_update`, `bb_cost_locations_update` |
| **U6** entfernt Bestehendes | `Entfernt Daten aus dem echten Mandanten von BuchhaltungsButler: <was genau>. Die betroffenen Datensätze vorher lesen und dem Nutzer vorlegen.` | 141 einschließlich `<was genau>` | die drei `bb_postings_unconfirm_*`, `bb_postings_cancel`, `bb_cost_locations_delete` |
| **U7** ersetzt eine Auswertung | `Ersetzt die zuvor in BuchhaltungsButler erzeugte Auswertung desselben Typs. Buchungsdaten ändern sich dabei nicht, und die Auswertung lässt sich jederzeit neu erzeugen.` | 168 | `bb_reports_create_bwa`, `bb_reports_create_sums` |

**Prüfsumme, nachgerechnet:** 6 + 3 + 6 + 13 + 4 + 5 + 2 = **39**, also genau die 39
Werkzeuge mit den Wirkungen anlegend, ändernd und löschend. Jedes steht in genau einer Zeile;
die 15 lesenden Werkzeuge tragen keinen dieser Sätze. Der Test prüft beide Richtungen.

**U4 ist der wichtigste Fall.** Für acht Objektarten kennt die API überhaupt keinen Lösch-,
Storno- oder Aufhebungsendpunkt: Zahlungen, Rechnungen in allen drei Formen, die Bindung eines
Belegs an eine freie Buchung, Debitoren, Kreditoren, Sachkonten, Zahlungskonten und
Kommentare. Ausgezählt aus der vollständigen Pfadliste: unterhalb von `/transactions/`,
`/invoices/`, `/settings/` und `/comments/` gibt es keinen `delete`-Pfad, unterhalb von
`/postings/` keinen `unassign`-Pfad. Bei diesen 13 Werkzeugen ist der Pflichtsatz die einzige
Warnung vor dem Aufruf.

3. **Das Antwortformat schreibender Werkzeuge** nennt den Umkehrweg noch einmal, mit konkreten
   Werten (7.6).
4. **Der Duplikatshinweis** macht den häufigsten Unfall sichtbar, den Wiederholungsversuch
   nach einem Zeitlimit. Er blockiert nicht, er steht in der Antwort. **Er ist
   standardmäßig abgeschaltet** (6.2), weil er einen zusätzlichen Aufruf aus dem
   Minutenkontingent des Mandanten verbraucht; ohne ihn übernimmt der Text aus 5.7 dieselbe
   Aufgabe, indem er dem Agenten nach einem Zeitlimit den konkreten Prüfaufruf nennt. Wer ihn
   einschaltet, sieht den Zustand im Kopf der `instructions`.

### 3.6 Das Feld `title`

**Entschieden: `title` wird gesetzt**, deutscher Anzeigename, höchstens 40 Zeichen, ohne
Satzzeichen am Ende. Beispiele: „Belege suchen", „Beleg löschen", „Freie Buchung anlegen".

Begründung: Unter E2 ist der Freigabedialog des Clients die einzige menschliche Kontrolle.
Der Client zeigt dort `title`, wenn gesetzt, sonst den Maschinennamen. Ein deutschsprachiger
Buchhalter beantwortet „Freie Buchung anlegen" richtiger als `bb_postings_create_free`. Die
Kosten sind bezifferbar: 54 mal rund 25 Zeichen, also rund 1.350 Zeichen und damit rund 420
Token (Faktor 3,2 aus 4.10), und sie sind im Budget aus 4.10 enthalten. Der in `tool-design.md`
12 als offen geführte Punkt ist damit entschieden und nicht mehr offen.

### 3.7 Der Wegweiser durch die zwölf Buchungswerkzeuge

Zwölf Werkzeuge unter `bb_postings_*` sind die größte Gruppe und die größte Verwechslungsgefahr.
Die Navigation läuft über drei Ebenen.

**Ebene 1, der Name trägt den Unterscheider.** Nicht das Verb, sondern der Qualifizierer:
`_for_receipt`, `_for_transaction`, `_free`.

**Ebene 2, der erste Satz jeder Beschreibung ist eine Entscheidungsregel**, keine Zweckangabe:

```
Legt die Buchungssätze zu einem bereits vorhandenen Beleg in BuchhaltungsButler an.
Zu nehmen, wenn die id_by_customer eines Belegs vorliegt und dieser gebucht werden
soll; bb_postings_create_for_transaction, wenn stattdessen eine Zahlung der
Ausgangspunkt ist, und bb_postings_create_free, wenn weder Beleg noch Zahlung
vorhanden sind.
```

**Ebene 3, ein Wegweiser in den `instructions` und als Resource `bb://guide/postings`:**

```
Welches Buchungswerkzeug brauche ich?
  Ich habe die id_by_customer eines Belegs        → bb_postings_create_for_receipt
  Ich habe die id_by_customer einer Zahlung       → bb_postings_create_for_transaction
  Ich habe weder das eine noch das andere         → bb_postings_create_free
  Ich habe viele Vorgänge derselben Art           → derselbe Name plus _batch
  Ich will vorhandene Buchungen sehen             → bb_postings_search
  Nicht festgeschriebene Buchungen eines Belegs
    wieder entfernen                              → bb_postings_unconfirm_for_receipt
  Nicht festgeschriebene Buchungen einer Zahlung
    wieder entfernen                              → bb_postings_unconfirm_for_transaction
  Eine nicht festgeschriebene freie Buchung
    wieder entfernen                              → bb_postings_unconfirm_free
  Eine festgeschriebene Buchung stornieren        → bb_postings_cancel (erzeugt einen Storno)
  Einen Beleg an eine freie Buchung binden        → bb_postings_assign_receipt (kein Weg zurück)
```

Der Wegweiser steht genau einmal, nicht in zwölf Beschreibungen. Das spart nach der Rechnung
in 4.9 rund 3.450 Zeichen und hält die Regel konsistent, weil sie nur an einer Stelle gepflegt
wird.

### 3.8 Die vollständige Tabelle aller 54 Werkzeuge

Spalte **Wirkung** ist die Einstufung aus `grundlagen.md` 7.3. Spalte **Kl.** ist die Klasse
aus 3.3. Die drei Hint-Spalten sind `readOnlyHint`, `destructiveHint`, `idempotentHint`;
`openWorldHint` ist überall `true`. Die Kurzbeschreibung ist **nicht** die ausgelieferte
Beschreibung, sondern deren erster Satz in verdichteter Form; der ausgelieferte Aufbau steht
in 4.8.

| # | Werkzeugname | API-Pfad | Wirkung | Kl. | roH | deH | idH | Kurzbeschreibung |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bb_receipts_search` | `/receipts/get` | lesend | R | true | false | true | Belege filtern und seitenweise auflisten; `list_direction` ist Pflicht. |
| 2 | `bb_receipts_get` | `/receipts/get/id_by_customer` | lesend | R | true | false | true | Einen Beleg über seine Mandantennummer holen, mit Fremdwährungsfeldern und auf Wunsch der Datei. |
| 3 | `bb_receipts_list_transactions` | `/receipts/assigned-transactions/get` | lesend | R | true | false | true | Zahlungen auflisten, die einem bestimmten Beleg zugeordnet sind. |
| 4 | `bb_receipts_create` | `/receipts/add` | anlegend | A | false | false | false | Beleg ohne Datei anlegen; Gegenpartei, Nummer, Datum, Betrag und Währung sind Pflicht. |
| 5 | `bb_receipts_create_batch` | `/receipts/addBatch` | anlegend | A | false | false | false | Bis zu 50 Belege ohne Datei in einem Aufruf anlegen; höchstens ein Aufruf je fünf Sekunden. |
| 6 | `bb_receipts_upload` | `/receipts/upload` | anlegend | A | false | false | false | Belegdatei hochladen, Beleg anlegen, Texterkennung anstoßen; eigenes Limit zehn je Minute. |
| 7 | `bb_receipts_delete` | `/receipts/delete/id_by_customer` | löschend | D | false | true | false | Beleg als gelöscht markieren; kein endgültiges Löschen, umkehrbar über `bb_receipts_restore`. |
| 8 | `bb_receipts_restore` | `/receipts/restore/id_by_customer` | ändernd | A | false | false | false | Einen als gelöscht markierten Beleg wieder buchungsrelevant machen. |
| 9 | `bb_transactions_search` | `/transactions/get` | lesend | R | true | false | true | Zahlungen filtern nach Zeitraum, Zahlungskonto, Gegenpartei oder Kennungsbereich. |
| 10 | `bb_transactions_get` | `/transactions/get/id_by_customer` | lesend | R | true | false | true | Eine einzelne Zahlung über ihre Mandantennummer holen, mit Konto, Währung und Bankdaten. |
| 11 | `bb_transactions_list_receipts` | `/transactions/assigned-receipts/get` | lesend | R | true | false | true | Belege auflisten, die einer bestimmten Zahlung zugeordnet sind. |
| 12 | `bb_transactions_create` | `/transactions/add` | anlegend | A | false | false | false | Zahlung auf einem echten Zahlungskonto anlegen; verändert Kontostand und Abstimmung sofort. |
| 13 | `bb_transactions_create_batch` | `/transactions/addBatch` | anlegend | A | false | false | false | Bis zu 50 Zahlungen in einem Aufruf anlegen; höchstens ein Aufruf je fünf Sekunden. |
| 14 | `bb_transactions_assign_receipt` | `/transactions/assign/receipt` | ändernd | A | false | false | false | Einen Beleg einer Zahlung zuordnen; umkehrbar über `bb_transactions_unassign_receipt`. |
| 15 | `bb_transactions_assign_receipt_batch` | `/transactions/assign-batch/receipt` | ändernd | A | false | false | false | Bis zu 50 Zuordnungen aus Zahlung und Beleg in einem Aufruf herstellen. |
| 16 | `bb_transactions_unassign_receipt` | `/transactions/unassign/receipt` | löschend | D | false | true | false | Zuordnung Beleg zu Zahlung lösen; scheitert, wenn eine bestätigte Buchung daran hängt. |
| 17 | `bb_invoices_create` | `/invoices/create` | anlegend | B | false | false | false | Echte, nummerierte Ausgangsrechnung, Gutschrift oder Angebot erzeugen; kein Storno über die API. |
| 18 | `bb_invoices_create_draft` | `/invoices/create/draft` | anlegend | B | false | false | false | Rechnungsentwurf erzeugen, ohne endgültige Nummernvergabe; trotzdem ein sichtbares Objekt. |
| 19 | `bb_invoices_create_einvoice` | `/invoices/create/e-invoice` | anlegend | B | false | false | false | E-Rechnung mit Steuerart und Steuerbetrag je Position erzeugen; strengste Feldprüfung der API. |
| 20 | `bb_postings_search` | `/postings/get` | lesend | R | true | false | true | Buchungssätze eines Pflichtzeitraums lesen; höchstens 1000 je Aufruf, `order` ist case sensitive. |
| 21 | `bb_postings_create_for_receipt` | `/postings/add/receipt` | anlegend | B | false | false | false | Buchungssätze zu einem bestehenden Beleg anlegen, Splitbuchung über eine Positionsliste. |
| 22 | `bb_postings_create_for_receipt_batch` | `/postings/add-batch/receipts` | anlegend | B | false | false | false | Buchungssätze zu mehreren Belegen in einem Aufruf anlegen. |
| 23 | `bb_postings_create_for_transaction` | `/postings/add/transaction` | anlegend | B | false | false | false | Buchungssätze zu einer Zahlung anlegen, mit Zuordnung offener Posten je Position. |
| 24 | `bb_postings_create_for_transaction_batch` | `/postings/add-batch/transactions` | anlegend | B | false | false | false | Buchungssätze zu mehreren Zahlungen in einem Aufruf anlegen. |
| 25 | `bb_postings_create_free` | `/postings/add/free` | anlegend | B | false | false | false | Freie Buchung ohne Beleg- und Zahlungsbezug; Soll- und Habenkonto direkt angeben. |
| 26 | `bb_postings_create_free_batch` | `/postings/add-batch/free` | anlegend | B | false | false | false | Mehrere freie Buchungen in einem Aufruf anlegen. |
| 27 | `bb_postings_unconfirm_for_receipt` | `/postings/unconfirm/receipt` | löschend | D | false | true | false | Nicht festgeschriebene Buchungen eines Belegs entfernen; verändert den Buchungsstand sofort. |
| 28 | `bb_postings_unconfirm_for_transaction` | `/postings/unconfirm/transaction` | löschend | D | false | true | false | Nicht festgeschriebene Buchungen einer Zahlung entfernen. |
| 29 | `bb_postings_unconfirm_free` | `/postings/unconfirm/free` | löschend | D | false | true | false | Eine nicht festgeschriebene freie Buchung entfernen. |
| 30 | `bb_postings_assign_receipt` | `/postings/assign/receipt-to-free-posting` | ändernd | B | false | false | false | Beleg an eine freie Buchung binden; die API kennt keinen Endpunkt, das wieder zu lösen. |
| 31 | `bb_postings_cancel` | `/postings/cancel` | löschend | D | false | true | false | Buchung stornieren; festgeschriebene erzeugen eine dauerhaft sichtbare Stornobuchung. |
| 32 | `bb_debtors_search` | `/settings/get/debtors` | lesend | R | true | false | true | Debitorenkonten auflisten; ohne ausdrückliches `limit` liefert die API nur 25 Zeilen. |
| 33 | `bb_debtors_create` | `/settings/add/debtor` | anlegend | A | false | false | false | Debitorenkonto anlegen; die API kennt keinen Endpunkt, es wieder zu löschen. |
| 34 | `bb_debtors_create_batch` | `/settings/add-batch/debtors` | anlegend | A | false | false | false | Mehrere Debitorenkonten in einem Aufruf anlegen. |
| 35 | `bb_debtors_update` | `/settings/update/debtor` | ändernd | M | false | true | true | Stammdaten eines Debitorenkontos überschreiben; kein Endpunkt liefert den Vorzustand zurück. |
| 36 | `bb_creditors_search` | `/settings/get/creditors` | lesend | R | true | false | true | Kreditorenkonten auflisten; ohne ausdrückliches `limit` liefert die API nur 25 Zeilen. |
| 37 | `bb_creditors_create` | `/settings/add/creditor` | anlegend | A | false | false | false | Kreditorenkonto anlegen; die API kennt keinen Endpunkt, es wieder zu löschen. |
| 38 | `bb_creditors_create_batch` | `/settings/add-batch/creditors` | anlegend | A | false | false | false | Mehrere Kreditorenkonten in einem Aufruf anlegen. |
| 39 | `bb_creditors_update` | `/settings/update/creditor` | ändernd | M | false | true | true | Stammdaten eines Kreditorenkontos überschreiben, Bankverbindung eingeschlossen. |
| 40 | `bb_postingaccounts_search` | `/settings/get/postingaccounts` | lesend | R | true | false | true | Vereinigte Kontenliste: Sachkonten, Zahlungskonten, Debitoren und Kreditoren mit `type`. |
| 41 | `bb_postingaccounts_create` | `/settings/add/postingaccount` | anlegend | A | false | false | false | Neues Sachkonto anlegen; es erbt Eigenschaften vom Elternkonto und verändert den Kontenrahmen. |
| 42 | `bb_postingaccounts_update` | `/settings/update/postingaccount` | ändernd | M | false | true | true | Sachkonto überschreiben, auf das bestehende Buchungen verweisen. |
| 43 | `bb_payment_accounts_list` | `/accounts/get` | lesend | R | true | false | true | Zahlungskonten auflisten; je Konto Name und zugehörige Sachkontonummer, kein `limit`. |
| 44 | `bb_payment_accounts_create` | `/accounts/add` | anlegend | A | false | false | false | Zahlungskonto anlegen; `is_revision_safe` legt dauerhaftes Verhalten fest. |
| 45 | `bb_comments_create` | `/comments/add` | anlegend | A | false | false | false | Kommentar an Beleg oder Zahlung hängen; für andere Nutzer sichtbar, über die API nicht löschbar. |
| 46 | `bb_cost_locations_search` | `/cost-locations/get` | lesend | R | true | false | true | Kostenstellen auflisten oder eine über ihren Code holen; höchstens 1000 je Aufruf. |
| 47 | `bb_cost_locations_create` | `/cost-locations/add` | anlegend | A | false | false | false | Kostenstelle mit Code und Namen anlegen; erscheint in der Kostenstellenauswertung. |
| 48 | `bb_cost_locations_update` | `/cost-locations/update` | ändernd | M | false | true | true | Name und Beschreibung einer Kostenstelle überschreiben, auf die Buchungen verweisen. |
| 49 | `bb_cost_locations_delete` | `/cost-locations/delete` | löschend | D | false | true | false | Kostenstelle entfernen; die Wirkung auf verweisende Buchungen ist nicht dokumentiert. |
| 50 | `bb_reports_get_bwa` | `/reports/get/bwa` | lesend | R | true | false | true | Zuvor erzeugte BWA abholen, optional mit PDF und CSV; setzt `bb_reports_create_bwa` voraus. |
| 51 | `bb_reports_get_sums` | `/reports/get/sums` | lesend | R | true | false | true | Zuvor erzeugte Summen- und Saldenliste abholen; setzt `bb_reports_create_sums` voraus. |
| 52 | `bb_reports_get_ledger` | `/reports/get/sums/ledger` | lesend | R | true | false | true | Kontenblatt eines Sachkontos unmittelbar liefern, ohne vorherigen Erzeugungsschritt. |
| 53 | `bb_reports_create_bwa` | `/reports/create/bwa` | anlegend | AR | false | true | false | BWA-Erzeugung anstoßen; ersetzt die zuvor erzeugte BWA und blockiert bis zum Abschluss. |
| 54 | `bb_reports_create_sums` | `/reports/create/sums` | anlegend | AR | false | true | false | Summen- und Saldenliste anstoßen; ersetzt die zuvor erzeugte, wahlweise mit PDF, CSV und Archiv. |

### 3.9 Prüfsätze zur Tabelle, alle maschinell nachgerechnet

- **54 Zeilen, 54 verschiedene Werkzeugnamen, 54 verschiedene API-Pfade.**
- **Die Menge der Pfade ist gleich der Ausgabe von**
  `jq -r '.paths|keys[]' docs/openapi/buchhaltungsbutler-v1.json`. Kein Pfad fehlt, keiner
  ist doppelt, keiner ist zu viel. Am 2026-09-12 mit `diff` gegen die sortierten Listen
  geprüft, Ergebnis: identisch.
- **Wirkung: 15 lesend, 24 anlegend, 8 ändernd, 7 löschend.** Deckungsgleich mit
  `grundlagen.md` 7.3.
- **Klassen: R 15, A 16, AR 2, M 4, D 7, B 10.** Summe 54.
- **Klasse R ist genau die Menge der lesenden Endpunkte.** Der Nur-Lesen-Schalter braucht
  deshalb keine zweite Pfadliste, sondern liest die Klassenspalte.
- **`destructiveHint: true` bei 13 Werkzeugen, `idempotentHint: true` bei 19.** Beide Zahlen
  beschreiben den **Auslieferungszustand**; zur Fortschreibung durch AP19b siehe 3.3.
- **Namen:** alle erfüllen `^bb_[a-z][a-z0-9_]{2,37}$`, längster Name 40 Zeichen
  (`bb_postings_create_for_transaction_batch`), **kürzester 15 Zeichen
  (`bb_receipts_get`)**; die drei nächstkürzeren haben 17 Zeichen (`bb_debtors_create`,
  `bb_debtors_search`, `bb_debtors_update`). Am 2026-09-12 über die Namensspalte der Tabelle
  in 3.8 nachgerechnet. Die Längengrenze 40 wird **zusätzlich** zum Ausdruck geprüft; der
  Ausdruck allein ließe 41 Zeichen zu, und P4 prüft deshalb beides.
- **Nach Ressource:** receipts 8, transactions 8, invoices 3, postings 12, debtors 4,
  creditors 4, postingaccounts 3, payment_accounts 2, comments 1, cost_locations 4,
  reports 5 = 54.

---

## 4. Herkunft der Eingabeschemata, endgültig entschieden

### 4.1 Die Entscheidung

**Gemischt, mit maschinell erzwungenem Abgleich: der Generator erzeugt Fakten, das
Auslieferungsschema wird von Hand geschrieben, und ein Test rechnet beide gegeneinander auf.**

Weder rein generiert noch rein handgeschrieben.

**Warum nicht rein generiert.** Die Spezifikation ist kein gültiges Swagger 2.0 und enthält
nachgewiesene Fehler, aus denen ein Generator falschen Code erzeugt:

| Befund | Nachweis | Folge für einen Generator |
| --- | --- | --- |
| 371 Body-Parameter als Einzeleinträge mit eigenem `type` statt in einem `schema` | 0.4 | erzeugt 371 Alternativen statt eines Objekts |
| 32 Array-Parameter ohne `items` | 0.4 | erzeugt Arrays ohne Elementtyp, darunter alle parallelen Arrays |
| 9 Parameter mit `schema` statt `type`, darunter das falsche `order`-Objekt | 0.4 | erzeugt ein Objekt mit der Platzhalter-Eigenschaft `field`, das die API ablehnt |
| `responses`-Schlüssel sind Zeichenketten der Form `"400 (5)"` | 0.4 | bricht beim Lesen als Statuscode |
| `ReceiptPostings` trägt `postingstexts`, `/postings/add/receipt` trägt `postingtexts` | 0.5 | erzeugt zwei Feldnamen für dasselbe Feld |
| `PostingsFree.items` führt `amounts` in `required`, hat aber nur `amount` | 0.5 | erzeugt ein Pflichtfeld, das es nicht gibt |
| Vier Endpunkte führen ihren Identifikator gar nicht | 4.6 | erzeugt Werkzeuge ohne Eingabe |
| Beschreibungen enthalten HTML und Entities (`<br/>`, `&ldquo;`) | `grundlagen.md` 8.26 | erzeugt Markup in Werkzeugbeschreibungen |
| Kein einziger Parameter trägt `enum`; Wertevorräte stehen nur im Fließtext | 0.4 | erzeugt freie Strings, wo eine Werteliste existiert |

**Warum nicht rein handgeschrieben.** 317 fachliche Parameter lassen sich abschreiben, aber
nicht von Hand vollständig halten. Eine vergessene Zeile ist unsichtbar, und E6 verlangt
Vollständigkeit. Was dabei auf dem Spiel steht, zeigt ein einzelnes Beispiel: Fehlen `limit`
und `offset` an `/settings/get/postingaccounts`, ist der Kontenrahmen jenseits der ersten
Seite unerreichbar — und zwar ohne jede Fehlermeldung.

**Die Arbeitsteilung in einem Satz:** Ein Generator kann zählen, aber nicht urteilen; ein
Mensch kann urteilen, aber nicht zuverlässig zählen. Also zählt der Generator und urteilt der
Mensch, und der Test hält beide zusammen.

### 4.2 Schritt 1, die Generatoren

`scripts/gen-endpoints.ts` liest `docs/openapi/buchhaltungsbutler-v1.json` und schreibt
`src/generated/endpoints.ts`. Die Ausgabe wird **eingecheckt**, damit jede Änderung der
Spezifikation im Diff sichtbar wird und damit der Bau nicht von einer Generatorumgebung
abhängt. Ein CI-Schritt führt `pnpm generate` aus und verlangt eine leere Differenz.

Je Pfad enthält das Generat:

| Feld | Herkunft | Nachbearbeitung |
| --- | --- | --- |
| `path` | Schlüssel unter `.paths` | keine |
| `summary`, `description` | `.post.summary`, `.post.description` | HTML entfernt, Entities aufgelöst, Umbrüche normiert |
| `parameters[].name` | `.name` | keine |
| `parameters[].specType` | `.type` oder `"(schema)"` | keine |
| `parameters[].required` | `.required` | keine |
| `parameters[].default` | `.default` | keine |
| `parameters[].description` | `.description` | bereinigt |
| `parameters[].valuesFromText` | aus `description` | Muster `'x' or 'y'`, `Can be either`, `Accepted values`, `Possible values`, Aufzählungen mit `- ` ausgelesen; Ergebnis ist ein **Vorschlag**, kein Schema |
| `parameters[].itemsMissing` | `type === "array" && !items` | markiert die 32 Fälle |
| `parameters[].ref` | `.schema.$ref` | nur bei den neun Parametern mit `schema` |
| `successFields[]` | `$ref` der 200er-Antwort | Feldname und Typ laut Spezifikation, ausdrücklich als unzuverlässig markiert |

`scripts/gen-errors.ts` schreibt `src/generated/errors.ts`. Einzelheiten in 5.6.

`scripts/gen-registry-index.ts` liest das Verzeichnis `src/registry/tools/`, prüft, dass
Dateiname und exportierter `name` übereinstimmen, und schreibt `index.generated.ts`. Damit
muss niemand beim Nachrüsten eines Werkzeugs eine Sammeldatei anfassen; das ist die
Voraussetzung dafür, dass fünf Agenten parallel an den Registereinträgen arbeiten können.

**`src/registry/index.generated.ts` wird als einziges Generat NICHT eingecheckt.** Es steht in
`.gitignore` (AP01) und wird vor `build`, `test` und `typecheck` erzeugt; die drei npm-Skripte
rufen `pnpm generate` dafür ausdrücklich als ersten Schritt auf (AP01). Begründung: Die Datei
ist eine reine Ableitung aus dem Verzeichnisinhalt, und fünf gleichzeitig laufende
Registerpakete (AP12a bis AP12e) würden sie alle fünf neu schreiben. Eingecheckt wäre sie damit
genau die geteilte Datei, die der Paketschnitt aus Abschnitt 11 ausschließt: Jedes der fünf
Pakete müsste sie anfassen, jede Zusammenführung erzeugte einen Konflikt, und der CI-Schritt
„`pnpm generate`, danach `git diff --exit-code`" wäre auf jedem der fünf Zweige rot, bis alle
fünf fertig sind. Weil die Datei nicht versioniert ist, kann sie in `git diff` bauartbedingt
nicht auftauchen; der generische CI-Schritt bleibt deshalb unverändert und deckt weiterhin die
eingecheckten Generate (AP03) sowie die erzeugte Werkzeugtabelle der README (AP20) ab.

**Die drei übrigen Generate bleiben eingecheckt** (`endpoints.ts`, `errors.ts`, `version.ts`).
Der Unterschied ist inhaltlich: Sie leiten sich aus der **Spezifikationsdatei** ab, und genau
deren Änderung soll im Diff sichtbar werden. Der Registerindex leitet sich dagegen aus dem
eigenen Quellverzeichnis ab und trägt keine einzige Information, die nicht schon versioniert
wäre.

### 4.3 Schritt 2, die 54 Registerdateien von Hand

Feste Regeln, jede maschinell geprüft:

- **`api_key` erscheint nie als Feld.** Er wird im Request-Mapper eingesetzt. Er steht als
  einziger Eintrag in `omitted`, mit der Begründung „Zugangsdatum, wird vom Server gesetzt".
- **Jedes übrige Feld des Endpunkts erscheint genau einmal**, auch wenn es unbequem ist (E6).
- **`required` darf gegenüber der Spezifikation verschärft, nie gelockert werden**
  (`tool-design.md` 6.4). Jede Verschärfung trägt ein Feld `requiredReason`, das im Test
  ausgewertet und in die Parameterbeschreibung übernommen wird.

  **Die Liste der Verschärfungen ist kurz, weil die Spezifikation an den vermuteten Stellen
  bereits `required: true` führt.** Maschinell nachgezählt am 2026-09-12 gegen
  `docs/openapi/buchhaltungsbutler-v1.json`:

  | Feld | Endpunkt | Stand laut Spezifikation | Folge |
  | --- | --- | --- | --- |
  | `postingaccounts`, `vats`, `amounts`, `postingtexts` | `/postings/add/receipt`, `/postings/add/transaction` | bereits `required: true` | **nichts zu verschärfen** |
  | `vat`, `postingaccount_debit`, `postingaccount_credit` | `/postings/add/free` | bereits `required: true` | **nichts zu verschärfen** |
  | `account` | `/transactions/add` | bereits `required: true` | **nichts zu verschärfen** |
  | `currency` | `/receipts/add` | bereits `required: true` | **nichts zu verschärfen** |
  | `postingaccount` | `/postings/get` | `required: false`, Vorgabe „all" | **bleibt optional**, siehe unten |
  | `currency` | `/receipts/upload` | `required: false` | **bleibt optional**, Vorgabe `EUR` (4.5) |
  | `currency` | `/transactions/add` | `required: false` | **bleibt optional**, siehe unten |
  | `currency` je Element | `/transactions/addBatch` (`Transaction`) | `required: false` | **bleibt optional**, gleichlautend mit `/transactions/add` (4.5) |
  | `currency` je Element | `/receipts/addBatch` (`Receipt`) | bereits `required: true` | **nichts zu verschärfen** |

  **`postingaccount` an `/postings/get` bleibt ausdrücklich optional.** Es ist dort kein Konto,
  sondern eine kommagetrennte Filterliste mit der Vorgabe „all" (im Werkzeugschema
  `postingaccount_filter`, Anhang A). Als Pflichtfeld ausgeliefert würde `bb_postings_search`
  ohne Not scheitern, und zwar unsichtbar vor dem Request — genau der Fehler, vor dem R4 warnt.

  **`currency` an `/transactions/add` bleibt ausdrücklich optional.** Der Entwurfsstand dieses
  Plans hat das Feld zum Pflichtfeld gemacht; **diese Verschärfung ist zurückgenommen.** Grund:
  Die Spezifikation beschreibt `amount` an diesem Endpunkt wörtlich als *„The transaction's
  amount … in the account's currency"*. Die Währung einer Zahlung ist damit implizit die des
  Zahlungskontos, und **kein Endpunkt der API gibt sie preis**: `/accounts/get` liefert je Konto
  nur `name` und `postingaccount_number` (0.3, Anhang B Punkt 12). Ein Pflichtfeld hätte den
  Agenten also gezwungen zu raten, und ein geratener Wert erzeugt hier eine
  Fremdwährungszahlung, die über die API nicht mehr zu löschen ist (U4). Die Risiko-Asymmetrie
  zeigt in die andere Richtung als sonst: Eine fehlende Angabe fällt auf das dokumentierte
  Verhalten der API zurück, eine falsche Angabe schreibt einen falschen Datensatz.

  **Ersatz statt Verschärfung, verbindlich:** Die Parameterbeschreibung von `currency` trägt an
  `bb_transactions_create` **und** an `bb_transactions_create_batch` wortgleich den Satz:
  *„Ohne Angabe bucht BuchhaltungsButler in der Währung des Zahlungskontos; die Spezifikation
  beschreibt den Betrag ausdrücklich als Betrag in der Kontowährung. Welche Währung ein
  Zahlungskonto führt, gibt die API an keiner Stelle preis — diesen Wert also nur setzen, wenn
  er aus dem Vorgang bekannt ist."* P8 prüft ihn an beiden Feldern. Der Satz ist bewusst
  vollständig deutsch: Das englische Originalzitat steht in diesem Plan und nicht in einer
  ausgelieferten Beschreibung (4.9, P8).

  **Damit enthält der Auslieferungszustand keine einzige Verschärfung.** `coverage.test.ts`
  Punkt 5 zählt die Abweichungen, gibt sie aus und **erwartet eine leere Liste**; zusätzlich
  schlägt er fehl, wenn eine Verschärfung ohne nicht leeres `requiredReason` auftaucht. Wird
  später eine Verschärfung bewusst entschieden, sind Erwartungswert und `requiredReason`
  gemeinsam zu setzen; genau das hält den Vorgang sichtbar.
- **`apiName` weicht nur ab, wo die Umbenennung in Anhang A steht.** Jede Umbenennung nennt
  den Originalnamen in der Parameterbeschreibung.
- **`serverOnlyFields` ist die einzige erlaubte Erweiterung über die API hinaus** und umfasst
  **genau einen Namen: `response_format`** bei lesenden Werkzeugen. Er wird nie gesendet und ist
  in der Werkzeugbeschreibung als serverseitig ausgewiesen; damit ist er kein verborgenes
  Verhalten im Sinne von E1, sondern deklariert.

  **Die Behälterfelder `positions`, `items` und `assignments` sind ausdrücklich *keine*
  `serverOnlyFields`, sondern reguläre `fields` mit Mehrfachabbildung.** Sie erzeugen die
  Body-Parameter des Endpunkts und tragen diese in `apiNames` (2.1): sechs beziehungsweise
  sieben Namen beim Positionsbehälter, genau einen bei `assignments`. Nur so deckt der
  Deckungstest P3 die parallelen Arrays ab, statt an ihnen vorbeizulaufen. Die Umformung ist
  in der Werkzeugbeschreibung wörtlich deklariert (4.8).
- **Enum nur, wenn der Wertevorrat abzählbar, mandantenunabhängig und belegt ist.**
  Mandantendaten (`postingaccount_number`, `cost_location`, `account`) sind nie ein Enum,
  sondern tragen den Verweis auf das Nachschlagewerkzeug. Jedes gesetzte Enum trägt im
  Registereintrag die Belegstelle als Kommentar. Es gilt die Kehrseite strenger Validierung:
  Ein zu enges Enum lehnt gültige Vorgänge vor dem Netzaufruf ab, und zwar unsichtbar
  für jeden, der nur das Serververhalten beobachtet. **Im Zweifel freier String mit Werteliste
  im Beschreibungstext.**

### 4.4 Schritt 3, der Deckungstest, der E6 beweist

`test/registry/coverage.test.ts` prüft gegen `src/generated/endpoints.ts`:

1. **Pfadmenge.** Die Menge der Registerpfade ist gleich der Menge der Pfade im Generat.
   Erwartet: 54 gegen 54. Kein Pfad fehlt, keiner ist zu viel.
2. **Eineindeutigkeit.** Kein Pfad zweimal, kein Name zweimal. Das ist die maschinelle Prüfung
   von E1.
3. **Parameterdeckung, erste Stufe.** Für jeden Eintrag: Die Vereinigung **aller Einträge aller
   `apiNames`-Arrays** der `fields` und der Namen in `omitted` ist **gleich** der
   Parameternamensmenge des Generats für diesen Pfad. **Ein Behälterfeld deckt ausdrücklich
   mehrere Parameter ab**: `positions` an `/postings/add/receipt` trägt sechs Einträge in
   `apiNames`, an `/postings/add/transaction` sieben, `items` an den drei Rechnungsendpunkten
   sechs beziehungsweise sieben. Kein Name darf doppelt vorkommen, weder innerhalb eines
   Feldes noch über zwei Felder hinweg. Jeder `omitted`-Eintrag trägt eine nicht leere
   Begründung. Erwartet: 371 Zuordnungen, davon 54 in `omitted` (`api_key`) und 317 über die
   `apiNames` der `fields`. Das ist der maschinelle Nachweis für E6.
   **Ausgenommen sind ausschließlich Felder mit `source: "server"`** (`response_format`) **und
   mit `source: "path"`** (die vier Pfadsegmentfelder aus 4.6, die die Spezifikation gar nicht
   führt); beide tragen ein leeres `apiNames` und werden in der Vereinigung nicht gezählt.

   **Parameterdeckung, zweite Stufe.** Acht Body-Parameter verweisen statt auf einen Typ auf
   eine Definition. Verglichen wird die Vereinigung der `apiNames` der `itemFields` mit der
   Eigenschaftsmenge **der aufgelösten Elementdefinition**.

   **Wofür die zweite Stufe gilt, genau abgegrenzt:** ausschließlich für Behälterfelder, deren
   `apiNames` **genau einen** Body-Parameter nennen und deren Parameter im Generat ein
   `schema.$ref` trägt. Das sind exakt die acht Fälle der Tabelle unten. Die Positionslisten
   `positions` und `items` der Werkzeuge 17, 18, 19, 21 und 23 tragen zwar ebenfalls
   `itemFields`, ihre `apiNames` nennen aber sechs beziehungsweise sieben gewöhnliche
   Array-Parameter **ohne** Definition (4.8); für sie greift allein die erste Stufe, und ihr
   Innenleben ist in 4.8 je Werkzeug festgelegt. **Bei den Werkzeugen 22 und 24 greift die
   zweite Stufe auf dem äußeren Behälter**, und die `apiNames` der darin geschachtelten
   Positionsliste zählen zur Vereinigung: Für `ReceiptPostings` ergeben drei skalare Namen
   (`receipt_id_by_customer`, `creditor`, `debtor`) plus sechs Positionsnamen
   (`postingaccounts`, **`postingstexts`**, `vats`, `cost_locations`, `cost_locations_two`,
   `amounts`) genau die neun Eigenschaften der Definition; für `TransactionPostings` ein
   skalarer Name (`transaction_id_by_customer`) plus sieben Positionsnamen genau die acht.

   **Die Auflösungsregel ist Pflicht und nicht abkürzbar.** `.items` der Behälterdefinition
   trägt bei **sieben** der acht Fälle ausschließlich ein `$ref` auf eine eigene
   Elementdefinition und **kein** `properties`; nur `PostingsFree` führt seine Eigenschaften
   inline unter `.items.properties`. Ein Test, der stumpf `.items.properties` liest, findet
   deshalb an sieben von acht Stellen ein leeres Objekt und meldet entweder alles oder nichts
   als Fehler. Verbindlich:

   1. `.items` der Behälterdefinition lesen.
   2. Trägt `.items` ein `$ref`, wird es **zuerst aufgelöst**; verglichen wird dann gegen
      `properties` der aufgelösten Elementdefinition.
   3. Trägt `.items` kein `$ref`, sondern `properties` (nur `PostingsFree`), wird direkt gegen
      diese Eigenschaftsmenge verglichen.
   4. Findet der Test weder `$ref` noch `properties`, ist das ein Fehlschlag und keine leere
      Menge. Ein stillschweigend leerer Vergleich wäre genau die Prüfung, die nichts prüft.

   Die Zuordnung ist deshalb **zweispaltig** zu führen, Behälter und Element getrennt.
   Maschinell gegen `docs/openapi/buchhaltungsbutler-v1.json` ermittelt am 2026-09-12; die
   Spalte „Eigenschaften" nennt die Zahl der Eigenschaften der Elementdefinition:

   | Werkzeugfeld | Behälterdefinition | Elementdefinition | Endpunkt | Eigenschaften |
   | --- | --- | --- | --- | --- |
   | `receipts` | `Receipts` | `Receipt` | `/receipts/addBatch` | 13 |
   | `transactions` | `Transactions` | `Transaction` | `/transactions/addBatch` | 13 |
   | `assignments` | `TransactionsToReceipts` | `TransactionToReceipt` | `/transactions/assign-batch/receipt` | 2 |
   | `receipts` | `ReceiptsPostings` | `ReceiptPostings` | `/postings/add-batch/receipts` | 9 |
   | `transactions` | `TransactionsPostings` | `TransactionPostings` | `/postings/add-batch/transactions` | 8 |
   | `debtors` | `SettingsDebtors` | `SettingsDebtor` | `/settings/add-batch/debtors` | 12 |
   | `creditors` | `SettingsCreditors` | `SettingsCreditor` | `/settings/add-batch/creditors` | 12 |
   | `free_postings` | `PostingsFree` | **keine**, `properties` liegen inline unter `.items` | `/postings/add-batch/free` | 8 |

   **Behälter und Element unterscheiden sich nur durch ein `s`** (Anhang B Punkt 9). Wer die
   falsche Definition liest, hält ein Array für ein Objekt; genau deshalb steht hier die
   zweispaltige Tabelle und nicht ein Pfeil je Zeile. Damit ist auch das Innere der
   Stapelelemente vollständig abgedeckt und nicht nur der Behälter. Die beiden benannten
   Spezifikationsfehler aus Punkt 6 sind auch hier die einzigen erlaubten Abweichungen; der
   zweite (`PostingsFree.items.required` nennt `amounts`, die Eigenschaft heißt `amount`)
   betrifft `required` und nicht die Eigenschaftsmenge und verändert den Deckungsvergleich
   deshalb nicht.
4. **Kein `apiName` zeigt ins Leere**, weder auf erster noch auf zweiter Stufe. Das fängt
   Fälle wie ein von `/invoices/create` übernommenes `item_vat` an der E-Rechnung, die dort
   `item_tax_type` und `item_tax_amount` führt.
5. **Pflichtfelder.** Jeder Parameter, den die Spezifikation als `required` führt, ist im
   Schema Pflicht. Die umgekehrte Richtung ist erlaubt, wird gezählt und ausgegeben, damit
   die Verschärfungen bewusst bleiben. **Erwartet wird im Auslieferungszustand eine leere
   Liste** (4.3); zusätzlich schlägt der Test fehl, wenn eine Verschärfung ohne nicht leeres
   `requiredReason` auftaucht.
6. **Die beiden bekannten Spezifikationsfehler aus 0.5 werden als benannte Ausnahmeeinträge
   behandelt, nicht stillschweigend ignoriert.** Konkret:
   `SPEC_BUGS = [{ def: "ReceiptPostings", property: "postingstexts", actual: "postingtexts", note: "…" }, { def: "PostingsFree", required: "amounts", actual: "amount", note: "…" }]`.
   Der Test schlägt fehl, wenn ein Eintrag dieser Liste **nicht mehr** zutrifft, weil der
   Anbieter die Spezifikation korrigiert hat. Eine verschwundene Ausnahme ist genauso
   berichtenswert wie eine neue.
7. **Pfadsegment-Endpunkte.** Die vier Einträge aus 4.6 sind als `path.template` geführt und
   tragen zusätzlich `path.specPath` mit dem **unveränderten Schlüssel der Spezifikation**
   (`/receipts/get/id_by_customer` und so weiter). Verglichen wird in Punkt 1 gegen
   `specPath`, nicht gegen die Vorlage; sonst wäre die Pfadmenge des Registers bei diesen vier
   Einträgen bauartbedingt ungleich der des Generats. Der Test verlangt dort außerdem ein Feld
   mit `source: "path"` und **kein** Body-Feld `id_by_customer`; die Spezifikation führt an
   diesen vier Pfaden überhaupt keinen solchen Parameter (maschinell geprüft: `/receipts/get/…`
   führt nur `api_key` und `get_file`, die übrigen drei nur `api_key`).

Der Test läuft in der CI und zusätzlich wöchentlich über `drift.yml` gegen die dann aktuelle
Spezifikationsdatei.

### 4.5 Geteilte Bausteine (`src/schema/vocab.ts`)

Der größte Hebel gegen Wiederholung. Jeder Baustein liefert Schemafragment und
Beschreibungsmuster zusammen.

**Alle Beschreibungsmuster sind deutsch** (E4). API-Feldnamen, Werkzeugnamen und Enum-Werte
stehen unverändert im Original und werden nicht übersetzt (4.9).

| Baustein | Schema | Beschreibungsmuster (gekürzt) |
| --- | --- | --- |
| `date()` | `string`, `format: "date"` | `… als YYYY-MM-DD, zum Beispiel 2026-04-26. Ein leerer String wird abgelehnt; das Feld stattdessen weglassen.` |
| `dateTime()` | `string`, Muster `YYYY-MM-DD HH:MM:SS` | zusätzlich der Hinweis, dass ein reines Datum als `23:59:59` gilt |
| `amountIn()` | `string`, Muster `^-?\d+(\.\d{1,2})?$` | `Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel 123.99. 0.00 ist kein gültiger Betrag.` Die Umwandlung in die von der API erwartete JSON-Zahl macht `mapping/request.ts` am Rand |
| `vatKey()` | `string`, `enum` mit den 23 Schlüsseln | `Die deutschen Bezeichnungen aller 23 Schlüssel stehen in der Resource bb://vat-keys.` |
| `limit(max, def)` | `integer`, `minimum: 1`, `maximum`, `default` | `Harte Obergrenze <max>. Größere Werte lehnt die API ab, sie kappt sie nicht.` |
| `offset()` | `integer`, `minimum: 0`, `default: 0` | `Die zweite Seite einer Suche mit limit=100 holt offset=100.` |
| `idByCustomer(entity)` | `integer`, `minimum: 1` | `Die mandantenbezogene Nummer des <entity>, zu finden über <Suchwerkzeug>. Keine globale Kennung. In Suchergebnissen erscheint sie als String; hier ohne Anführungszeichen übergeben.` |
| `postingAccountNumber()` | `string` | `Nummer eines Sachkontos, zum Beispiel 4980. Mandantenbezogene Stammdaten: nachschlagen mit bb_postingaccounts_search.` |
| `paymentAccountNumber()` | `string` | `Sachkontonummer eines Zahlungskontos, zum Beispiel 1200. Auflisten mit bb_payment_accounts_list.` |
| `costLocation()` | `string`, `maxLength: 10` | `Mandantenbezogen, nachschlagen mit bb_cost_locations_search. Höchstens 10 Zeichen.` |
| `contactAddressBlock()` | 9 Felder | Einzeiler je Feld nach festem Muster, höchstens 80 Zeichen (S4) |
| `responseFormat()` | `enum ["concise","detailed"]`, `default "concise"` | Inhalt nach `tool-design.md` 7.2, auf Deutsch, plus der Satz, dass das Feld nicht an die API geht |
| `currencyReceipts()` | `string`, **kein** `enum` | der Widerspruchssatz aus der Tabelle unten; benutzt von den Werkzeugen **4 und 5** |
| `currencyTransactions()` | `string`, `enum` mit **48** Codes | der Hinweissatz zur Währung des Zahlungskontos aus 4.3; benutzt von den Werkzeugen **12 und 13** |

**Es gibt bewusst keinen gemeinsamen Baustein `currency()` über alle fünf Währungsfelder**,
wohl aber **je Ressource genau einen Vorrat**. Begründung und Auszählung in 0.5, Korrektur 2:
Die fünf Felder tragen drei verschiedene Textvorräte und an zwei Stellen zusätzlich einen
Ein-Wert-`enum`, der seinem eigenen Beschreibungstext widerspricht.

**Zwei Regeln gelten vor der Tabelle und sind nicht verhandelbar:**

- **R-A, Gleichlauf von Einzel- und Stapelform.** Ein Feld, das an einem Einzelendpunkt und im
  Element des zugehörigen Stapelendpunkts vorkommt, bekommt im Werkzeugschema **denselben
  Wertevorrat und dieselbe Pflichtigkeit**, es sei denn, die Spezifikation unterscheidet sie
  ausdrücklich. Sie tut das an keiner der beiden Stellen: Beide Stapelparameter sagen wörtlich,
  ein Element habe „the same fields like the …/add endpoint". Ein Werkzeugpaar, bei dem ein
  Wert einzeln erlaubt und im Stapel verboten wäre, ist ein Widerspruch, den kein Aufrufer
  auflösen kann. **Betroffen sind genau zwei Paare** — Werkzeug 4 mit 5 und Werkzeug 12 mit 13
  —, und **beide liegen je vollständig in einem Arbeitspaket** (AP12a beziehungsweise AP12b);
  deshalb genügt diese Regel, und es braucht keine vierzehnte Registerprüfung.
- **R-B, Widersprüchliche Vorräte werden nicht geraten.** Widersprechen sich zwei Angaben zum
  selben Feld, ist der Vorrat im Sinne von 4.3 **nicht belegt**. Dann gilt: freier String und
  beide Angaben in der Beschreibung. Ein `enum` entsteht nur, wenn genau eine Angabe im Raum
  steht oder wenn die konkurrierenden Angaben eine echte Teilmengenbeziehung bilden; dann gilt
  die **Vereinigung**, weil ein zu enges Enum gültige Vorgänge unsichtbar vor dem Request
  ablehnt (R4).

Verbindlich für alle fünf Felder:

| # | Feld | Werkzeug | Pflicht | Umsetzung im Werkzeugschema |
| --- | --- | --- | --- | --- |
| 1 | `currency` an `/receipts/add` | 4 `bb_receipts_create` | **ja** (Spezifikation `required: true`) | **freier String.** Drei einander widersprechende Angaben (3 Codes am Endpunkt, 48 Codes plus `enum: ["EUR"]` am Stapelelement) ergeben nach R-B keinen belegten Vorrat. Beschreibungstext: *„Die Spezifikation nennt an /receipts/add nur USD, GBP und CHF, an der Stapelvariante dagegen 48 Codes und zugleich EUR als einzigen Enum-Wert. Die drei Angaben widersprechen sich; dieses Werkzeug prüft den Wert deshalb nicht vorab. EUR ist der Regelfall. Lehnt BuchhaltungsButler eine Währung ab, nennt die Fehlermeldung den erlaubten Vorrat."* |
| 2 | `currency` je Element an `/receipts/addBatch` | 5 `bb_receipts_create_batch` | **ja** (`Receipt.required` führt `currency`) | **identisch zu 1**, Wort für Wort derselbe Beschreibungstext. Der Ein-Wert-`enum` `["EUR"]` der Definition wird **verworfen**, wie das Platzhalterschema des `order`-Parameters; die Belegstelle steht als Kommentar im Registereintrag |
| 3 | `currency` an `/receipts/upload` | 6 `bb_receipts_upload` | nein, Vorgabe `EUR` | **freier String**, unverändert gegenüber dem bisherigen Stand, mit dem Satz, dass die Spezifikation hier „Has to be 'EUR' if specified" sagt, dies **nicht verifiziert** ist und dem Vorrat von `/receipts/add` widerspricht |
| 4 | `currency` an `/transactions/add` | 12 `bb_transactions_create` | **nein** (Spezifikation `required: false`, keine Verschärfung, 4.3) | **`enum` mit 48 Codes**: den 47 am Endpunkt ausgeschriebenen plus `RSD`. Die 48er-Liste des Stapelelements enthält die 47er-Liste vollständig; nach R-B gilt die Vereinigung. Dazu der Hinweissatz aus 4.3 zur Währung des Zahlungskontos |
| 5 | `currency` je Element an `/transactions/addBatch` | 13 `bb_transactions_create_batch` | nein (`Transaction.required` führt `currency` nicht) | **identisch zu 4**: dasselbe 48er-`enum`, derselbe Hinweissatz. Der Ein-Wert-`enum` `["EUR"]` wird auch hier verworfen |

**Die 48 Codes, verbindlich und vollständig** (aus `Transaction.currency`, maschinell
entnommen am 2026-09-12): `AED`, `AUD`, `BGN`, `BRL`, `CAD`, `CHF`, `CNY`, `COP`, `CYP`, `CZK`,
`DKK`, `EUR`, `GBP`, `HKD`, `HRK`, `HUF`, `IDR`, `ILS`, `INR`, `ISK`, `JPY`, `KRW`, `LTL`,
`LVL`, `MTL`, `MXN`, `MYR`, `NOK`, `NZD`, `PEN`, `PHP`, `PLN`, `QAR`, `ROL`, `RON`, `RSD`,
`RUB`, `SEK`, `SGD`, `SIT`, `SKK`, `THB`, `TRL`, `TRY`, `UAH`, `USD`, `VND`, `ZAR`. Der
einzige Unterschied zur 47er-Liste des Endpunkts ist `RSD`.

**Kosten, damit die Rechnung in 4.10 ehrlich bleibt:** Das 48er-`enum` steht jetzt an zwei
statt an einem Werkzeug, das kostet rund 290 Zeichen zusätzlich; der Wegfall des
Vier-Werte-`enum` an Werkzeug 4 spart wenige Zeichen und kostet rund 250 Zeichen
Beschreibungstext an den Werkzeugen 4 und 5. Die Summe liegt im Promillebereich der 96.798
Zeichen aus 4.10, und P11 misst ohnehin die echten Token; die Zahlen in 4.10 werden deshalb
nicht neu gerechnet.

Die 23 Umsatzsteuerschlüssel sind der größte Einzelposten: mit deutschen Labels rund 1.100
Zeichen, und sie kommen an sechs Werkzeugen vor. Als reine Enum-Liste kosten sie rund 320
Zeichen. Die Labels stehen **einmal** in `bb://vat-keys` und in den `instructions`. Ersparnis
rund 4.700 Zeichen, ohne dass die Validierung schwächer wird.

### 4.6 Pfadbau bei den vier Endpunkten mit Platzhalter

Live bestätigt (L1, ausführlich in `docs/api/live-befunde-orchestrator.md` Befund 1):
**`id_by_customer` im Pfad der Spezifikation ist ein Platzhalter für den Wert, kein literales
Segment, und kein Body-Feld.** Betroffen sind `/receipts/get/id_by_customer`,
`/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer` und
`/transactions/get/id_by_customer`.

**Der dokumentierte Aufruf scheitert nachweislich.** Gemessen: `POST
/receipts/get/id_by_customer` mit dem Body-Feld `id_by_customer` antwortet mit HTTP 400 und
`error_code` 5, `POST /transactions/get/id_by_customer` sogar mit einer HTML-Fehlerseite, weil
dieser Pfad gar nicht existiert. Mit dem Wert im Pfad antworten beide mit HTTP 200.

**Ein Body-Feld `id_by_customer` wird an keinem der vier Endpunkte gesendet.** Das ist keine
Auslassung, sondern deckungsgleich mit der Spezifikation: Maschinell geprüft führt
`/receipts/get/id_by_customer` als Parameter nur `api_key` und `get_file`, die drei übrigen nur
`api_key`. Der Identifikator kommt in der Parameterliste dieser vier Pfade **überhaupt nicht**
vor (Anhang A, letzte zwei Zeilen). Die Aussage in
`docs/api/live-befunde-orchestrator.md` Befund 1, die Spezifikation deklariere
`id_by_customer` zusätzlich als Body-Parameter, trifft **nicht** zu; die dort gemessenen
Ergebnisse sind davon unberührt (Anhang B Punkt 53).

Die vier Endpunkte werden im Register als Vorlage geführt, **zusätzlich zum unveränderten
Spezifikationspfad**:

```ts
export type PathSpec =
  | { literal: string }                       // 50 Endpunkte
  | { template: string;                       // z. B. "/receipts/get/{receipt_id_by_customer}"
      params: string[];                       // z. B. ["receipt_id_by_customer"]
      specPath: string };                     // z. B. "/receipts/get/id_by_customer"
```

**Warum `specPath` zwingend ist.** Der gebaute Pfad ist bei diesen vier Werkzeugen **nicht
konstant**, er trägt eine Geschäftskennung. Drei Dinge im Server sind aber nach Pfad
geschlüsselt und dürfen es bleiben, weil sie aus der Spezifikation stammen:

| Was | Schlüssel | Folge ohne `specPath` |
| --- | --- | --- |
| Fehlerkatalog `ERRORS` (5.6) | `specPath` | Der Schlüssel `/receipts/get/2` steht in keiner Tabelle; jeder Fehler dieser vier Werkzeuge fiele auf „Paar fehlt" zurück und würde als `final` behandelt |
| Deckungstest P1 und P3 (4.4) | `specPath` | Die Pfadmenge des Registers wäre bei vier Einträgen ungleich der des Generats, P1 dauerhaft rot |
| Audit-Zeile auf stderr (1.4 Schritt 14) | `specPath` | Die eingesetzte Kennung stünde im Protokoll, obwohl dort nur Argument**namen** stehen dürfen |

Der Rate-Limit-Eimer ist davon nicht betroffen; er ist nach `api_key` und Eimername
geschlüsselt (5.4).

Sechs Regeln, alle Pflicht:

1. Der einzusetzende Wert wird **vor** dem Einsetzen gegen `^[0-9]{1,18}$` geprüft. Kein
   Bindestrich, kein Punkt, kein Schrägstrich, keine leere Zeichenkette.
2. Der Wert läuft anschließend durch `encodeURIComponent`. Das ist nach Regel 1 wirkungslos
   und genau deshalb richtig: Es ist die Absicherung gegen eine spätere Lockerung von Regel 1.
   Ein Identifikator, der unkodiert in den Pfad wandert, ist der klassische Weg zur
   Pfadinjektion; die Kodierung kostet nichts und schließt ihn dauerhaft.
3. Der gebaute Pfad wird gegen die Vorlage zurückgeprüft: genau ein Segment mehr als der
   Vorlagenstamm. Schlägt das fehl, geht kein Request ab.
4. Der Typ `PathSpec` ist die Union oben. Die übrigen 50 Endpunkte tragen `literal` und können
   bauartbedingt keinen interpolierten Pfad erzeugen.
5. **Der Body trägt kein Feld für den Identifikator.** Das Feld hat im Registereintrag
   `source: "path"` und ein leeres `apiNames` (2.1); der Request-Mapper darf es unter keinen
   Umständen in den Body schreiben. Ein Einheitstest prüft genau das.
6. **Nachgeschlagen wird immer mit `specPath`**, gesendet immer mit dem gebauten Pfad. Die
   beiden Werte werden im Code nie gegeneinander getauscht; `src/mapping/path.ts` liefert
   deshalb ein Paar zurück und nicht eine Zeichenkette.

**Statusklarheit, verbindlich:** `bb_receipts_get` und `bb_transactions_get` sind live
bestätigt (L1) und werden **ohne jeden Einschränkungssatz** ausgeliefert. Ihre Beschreibungen
dürfen von `bb_receipts_search` und `bb_transactions_search` als Weg zum Einzelabruf genannt
werden; die Sperre aus `tool-design.md` 3.5 ist aufgehoben, ihre Bedingung ist erfüllt.
`bb_receipts_delete` und `bb_receipts_restore` verwenden dieselbe Form, sind aber schreibend
und wurden deshalb **nicht** getestet. Ihre Registereinträge tragen den Vermerk
`verified: false` mit der Begründung „gleiche Form wie L1, schreibend, nicht getestet"; die
Klärung ist AP19, das Nachziehen AP19b. Der Vermerk ist nicht nur Zierrat: Die Beschreibung
beider Werkzeuge nennt die Aufrufform **nicht** als gemessen, und `befund-schreibend.md` führt
sie als offenen Punkt.

**Der Einzelabruf liefert mehr Felder als der Listenabruf, und das ist Teil des
Antwortvertrags.** `/receipts/get/{wert}` liefert unter anderem `amount_original` und
`currency_original`, die Fremdwährungsfelder, die `/receipts/get` **nicht** enthält; die
Spezifikation kennt beide nicht (L2, L4 sowie `live-befunde-orchestrator.md` Befund 2). Sie
gehören in das `responseContract` von `bb_receipts_get` (7.2, AP12a). Dasselbe gilt für die
13 Felder von `/transactions/get/{wert}` gegenüber den 6 der Liste (AP12b).

### 4.7 Querprüfungen, die kein JSON Schema ausdrücken kann

Sie laufen als `superRefine` am Schema und damit **vor** jedem Request. Jede fängt einen
Fehler ab, der sonst als falscher Datensatz in der Buchhaltung landet. Die Zugehörigkeit steht
je Registereintrag im Feld `crossChecks`.

| # | Prüfung | Betroffen | Warum |
| --- | --- | --- | --- |
| Q1 | `date_from <= date_to` | 1, 9, 20, 52, 53, 54 | Vertauschte Grenzen liefern still eine leere Liste oder, bei 53 und 54, einen falschen Bericht, der den vorherigen ersetzt |
| Q2 | `limit` innerhalb des endpunktspezifischen Maximums | 1, 9 (je 500), 20, 46 (je 1000) | Die API kappt nicht, sie lehnt ab |
| Q3 | Kein leerer String in einem optionalen Feld | alle | Ein leerer String ist bei den meisten Feldern ein Validierungsfehler, kein Weglassen. Das Schema lehnt ihn ab und nennt das Weglassen als richtigen Weg |
| Q4 | Positionszahl und Stapellänge innerhalb `BB_MCP_MAX_BATCH` und innerhalb des API-Maximums 50 | 5, 13, 15, 17, 18, 19, 21, 22, 23, 24, 26, 34, 38 | Doppelte Grenze: Betreiberwunsch und API-Regel, der kleinere Wert gewinnt |
| Q5 | Betrag ungleich `0.00` | 4, 5, 6, 12, 13 | Ausdrücklich ungültig laut Spezifikation |
| Q6 | `date_delivery <= date` | 4, 5, 6 | DATEV-Regel, die API lehnt sonst ab |
| Q7 | `order` gegen die **je Endpunkt eigene** Form | 1, 20, 40 | Drei Endpunkte, drei Syntaxen; `/postings/get` ist case sensitive |
| Q8 | Bei `bb_invoices_create_einvoice`: `item_tax_amount` ist an jeder Position gesetzt, an der `item_tax_type` einen Steuerbetrag verlangt | 19 | Die Spezifikation führt das Feld als `required`; ein Schema, das es optional lässt, schickt Positionen ohne Steuerbetrag hinaus |
| Q9 | Bei `bb_comments_create`: genau eine von `receipt_id_by_customer` und `transaction_id_by_customer`, also weder keine noch beide | 45 | Beide Felder sind einzeln `required: false` und schließen einander aus; die API antwortet ohne eine der beiden mit Code 8, mit beiden mit Code 7. Ohne die Prüfung ginge ein schreibender Request hinaus, von dem vorher feststeht, dass er scheitert |

Jede Querprüfung hat einen eigenen Testfall mit einem positiven und einem negativen Beispiel,
und zwar an einem Werkzeug, dem sie in der Spalte „Betroffen" zugeordnet ist.
**Damit ein Testfall überhaupt konstruierbar ist, muss jedes genannte Werkzeug die geprüften
Felder tatsächlich führen**; die Zuordnungen oben sind am 2026-09-12 maschinell gegen die
Spezifikation abgeglichen.

**Die Werkzeuge 32 (`bb_debtors_search`), 36 (`bb_creditors_search`) und 40
(`bb_postingaccounts_search`) tragen Q2 ausdrücklich *nicht*, weil die Obergrenze dort nicht
dokumentiert und nicht verifiziert ist** (7.5, 14.2); statt einer Prüfung trägt ihre
Beschreibung den Warnsatz aus 7.5. Sie führen zwar ein `limit`, aber keine Schranke, gegen die
Q2 prüfen könnte; ein negatives Beispiel wäre dort nicht konstruierbar, und eine erfundene
Schranke lehnte gültige Aufrufe unsichtbar vor dem Request ab (R4). Damit bleiben für Q2 genau
vier Werkzeuge mit belegtem Maximum: 1 und 9 mit 500, 20 und 46 mit 1000 (Tabelle in 7.5).
Sobald ein lesender Aufruf eine der drei offenen Grenzen klärt, wird das `maximum` in 7.5
nachgetragen **und** das betroffene Werkzeug hier in Q2 aufgenommen; beides gehört zusammen.

**Zu Q4, ausdrücklich und verbindlich: `BB_MCP_MAX_BATCH` gilt für Stapelarrays *und* für
Positionslisten.** Die Variable ist eine Mengengrenze je Aufruf, nicht eine Eigenheit der acht
Stapelendpunkte; eine Rechnung mit 50 Positionen ist für den Mandanten derselbe Vorgang wie ein
Stapel mit 50 Belegen. Betroffen sind deshalb **dreizehn** Werkzeuge mit **drei** Arten von
Feld:

| Art | Feld | Werkzeuge | Was Q4 prüft |
| --- | --- | --- | --- |
| Stapelbehälter | `receipts`, `transactions`, `assignments`, `free_postings`, `debtors`, `creditors` | 5, 13, 15, 26, 34, 38 | Länge des Behälterarrays |
| Positionsliste auf oberster Ebene | `positions` (21, 23), `items` (17, 18, 19) | 17, 18, 19, 21, 23 | Zahl der Positionen |
| beides zugleich | Behälter `receipts` beziehungsweise `transactions` mit geschachteltem `positions` je Element (4.8) | 22, 24 | Länge des Behälters **und** die Positionszahl **jedes einzelnen** Elements; beide Grenzen gelten unabhängig voneinander, es wird nichts aufsummiert |

Der wirksame Wert ist `min(50, BB_MCP_MAX_BATCH)`; die Variable ist selbst auf 1 bis 50
begrenzt (6.2), im Auslieferungszustand fallen beide Faktoren also auf 50 zusammen.

**Die Herkunft dieser 50 ist je Art verschieden, und das wird hier nicht verwischt:** Bei den
Behältern von `/receipts/addBatch` und `/transactions/addBatch` nennt die Spezifikation 50
ausdrücklich. Bei den übrigen sechs Stapelendpunkten ist sie **nicht verifiziert** (14.2) und
defensiv übernommen. **Bei den Positionslisten ist sie überhaupt keine dokumentierte API-Regel,
sondern unsere eigene Mengengrenze.** Der Preis ist benannt und steht in 14.2: Eine echte
Splitbuchung oder Rechnung mit mehr als 50 Positionen würde vor dem Request abgelehnt. Belegt
jemand diesen Fall, ist die Obergrenze der Variablen anzuheben — das ist eine Entscheidung des
Projektinhabers und nichts, was der Implementierungs-Agent selbst ändert.

Der Wert steht als `maxItems` im Schema (4.8): Das Schema
wird beim Serverstart gebaut, und die Konfiguration ist zu diesem Zeitpunkt bereits aufgelöst
und eingefroren (6.4 Punkt 7), der Wert also bekannt. **Guard 5 prüft dieselben Grenzen
trotzdem noch einmal** (1.4), weil er ohnehin `BB_MCP_MAX_AMOUNT` auswertet und weil ein
Abbruch dort den Zustandssatz 1 aus 5.8 trägt. Doppelt geprüft ist hier billiger als die Frage,
welche der beiden Stellen im Zweifel gilt.

**Zu Q1, ausdrücklich:** Die Werkzeuge 50 (`bb_reports_get_bwa`) und 51
(`bb_reports_get_sums`) sind **nicht** betroffen. Sie führen laut Spezifikation nur `api_key`,
`report_id_by_customer` und `get_files` und haben überhaupt kein Datumsfeld. Die Datumsgrenzen
liegen an den Erzeugungsendpunkten `/reports/create/bwa` und `/reports/create/sums`, dort beide
`required: true` — also an den Werkzeugen 53 und 54. Genau dort wiegt ein vertauschter Zeitraum
am schwersten, weil der falsche Bericht den vorherigen ersetzt (U7). Werkzeug 52
(`bb_reports_get_ledger`, `/reports/get/sums/ledger`) trägt `date_from` und `date_to` selbst
und bleibt in der Liste.

**Zwei Prüfungen des Entwurfsstandes sind ersatzlos gestrichen.** Beide sind nicht
implementierbar oder schädlich; das ist hier begründet, damit sie nicht später „wieder
eingebaut" werden:

- **Gestrichen: „Summe der Positionsbeträge entspricht dem Beleg- oder Zahlungsbetrag".** Eine
  `superRefine` sieht nur die Argumente des Aufrufs. Der Vergleichswert ist dort aber nicht
  vorhanden: `/postings/add/receipt` führt neben `receipt_id_by_customer` nur die
  Positionsfelder, `creditor` und `debtor`; `/postings/add/transaction` neben
  `transaction_id_by_customer` nur die Positionsfelder und `oi_receipts_ids_by_customer`. Weder
  der Beleg- noch der Zahlungsbetrag ist ein Argument. Die Prüfung wäre nur mit einem
  zusätzlichen lesenden Aufruf möglich, und der widerspräche der Regel aus 7.5 Regel 2. **Die
  API prüft die Summe selbst**, und ihre Meldung steht bereits im Fehlerkatalog: wörtlich
  `the total amount of all postings does not match the receipt amount` beziehungsweise
  `… does not match the transaction amount`, Klasse `final`; der Vierblock-Text nennt Feld und
  gesendete Werte. Der Preis ist ein Request, der Gewinn ist ein Werkzeug, das
  keine verborgenen Zusatzaufrufe absetzt.
- **Gestrichen: „Gegenseitiger Ausschluss von `id_by_customer_from`/`_to` und der
  Sortierung" an `bb_transactions_search`.** `/transactions/get` hat laut Spezifikation
  **keinen** `order`-Parameter; Sortierparameter gibt es nur an `/receipts/get`,
  `/postings/get` und `/settings/get/postingaccounts`. Die Spezifikation beschreibt lediglich
  eine Nebenwirkung und erlaubt die Kombination mit Datumsfeldern ausdrücklich: *„By
  specifying this, the sort changes to id_by_customer ASC, even if you use this in combination
  with date params."* Eine Prüfung, die diese Kombination abwiese, würde einen von der API
  erlaubten Aufruf vor dem Request verwerfen — genau der unsichtbare Fehler, vor dem 4.3 und
  R4 warnen.

  **Ersatz, verbindlich:** Die Parameterbeschreibung von `id_by_customer_from` **und** von
  `id_by_customer_to` bei `bb_transactions_search` trägt den Pflichtsatz: *„Setzt die
  Sortierung auf id_by_customer ASC, auch in Kombination mit date_from und date_to."* P8 prüft
  ihn an beiden Feldern.

**Die Längengleichheit paralleler Arrays ist keine Querprüfung**, sondern konstruktiv
erfüllt, siehe 4.8.

**Zur Nummerierung:** Der Entwurfsstand führte Q1 bis Q10. Nach dem Streichen der beiden oben
begründeten Prüfungen bleiben acht, und sie sind **lückenlos zu Q1 bis Q8 umnummeriert**, damit
keine Lücke in der Liste wie ein Versehen aussieht. Ältere Verweise auf „Q1" (Summenprüfung),
„Q2" (Datumsgrenzen), „Q8" (Sortierausschluss), „Q9" (`order`) und „Q10" (E-Rechnung) sind
damit überholt; maßgeblich ist ausschließlich die Tabelle oben und der Typ `CrossCheckId` in
2.1.

**Q9 ist danach hinzugekommen und hat mit der alten „Q9" (`order`) des Entwurfsstandes nichts
zu tun.** Die Ausschlussregel von `/comments/add` stand zunächst nur in der Werkzeug- und in
beiden Feldbeschreibungen und wurde nicht durchgesetzt. Damit setzte der Server als einziger
bekannter Fall einen **schreibenden** Request gegen die echte Buchhaltung ab, von dem vorher
feststand, dass die API ihn ablehnt — und die eigene Werkzeugbeschreibung versprach zugleich
wörtlich das Gegenteil. Die Liste führt seitdem lückenlos Q1 bis Q9.

### 4.8 Parallele Arrays werden zu einer Positionsliste

**Genau fünf Endpunkte erwarten zusammengehörige Werte als mehrere gleich lange Arrays auf
oberster Ebene.** Maschinell ermittelt am 2026-09-12 mit `jq` über `.paths[].post.parameters[]`
mit `type == "array"`:

| Endpunkt | Werkzeug | Array-Parameter | Anzahl |
| --- | --- | --- | --- |
| `/postings/add/receipt` | 21 | `postingaccounts`, `postingtexts`, `vats`, `cost_locations`, `cost_locations_two`, `amounts` | 6 |
| `/postings/add/transaction` | 23 | dieselben sechs plus `oi_receipts_ids_by_customer` | 7 |
| `/invoices/create` | 17 | `item_name`, `item_amount`, `item_unit`, `item_vat`, `item_single_price`, `item_description` | 6 |
| `/invoices/create/draft` | 18 | dieselben sechs | 6 |
| `/invoices/create/e-invoice` | 19 | `item_name`, `item_amount`, `item_unit`, `item_tax_type`, `item_tax_amount`, `item_single_price`, `item_description` | 7 |

Summe 32, und das ist **genau** die in 0.4 gezählte Menge der 32 Array-Parameter ohne `items`.
Es gibt in der gesamten Spezifikation keinen weiteren Array-Parameter. Wer sie ungeprüft
durchreicht, gibt die einzige Invariante dieser Konstruktion auf: Alle Arrays eines Aufrufs
müssen gleich lang sein, sonst rutschen Beträge auf die falsche Position.

**Die fünf Endpunkte, die man hier vermuten würde und die keine parallelen Arrays auf oberster
Ebene haben** — die Festlegung je Werkzeug steht weiter unten, die Korrektur steht hier, damit
sie nicht übersehen wird:

| Endpunkt | Werkzeug | Tatsächliche Form laut Spezifikation |
| --- | --- | --- |
| `/postings/add/free` | 25 | ausschließlich **skalare** Felder: `date`, `postingtext`, `amount`, `postingaccount_debit`, `postingaccount_credit`, `vat`, `cost_location`, `cost_location_two`. Legt genau **eine** Buchungszeile an |
| `/postings/add-batch/free` | 26 | genau **ein** Parameter `free_postings`, Definition `PostingsFree`: bereits eine **Objektliste** |
| `/postings/add-batch/receipts` | 22 | genau **ein** Parameter `receipts`, Definition `ReceiptsPostings`: Objektliste; die parallelen Arrays liegen **innerhalb** jedes Elements (`ReceiptPostings`) |
| `/postings/add-batch/transactions` | 24 | genau **ein** Parameter `transactions`, Definition `TransactionsPostings`: Objektliste; parallele Arrays **innerhalb** jedes Elements (`TransactionPostings`) |
| `/transactions/assign-batch/receipt` | 15 | genau **ein** Parameter `transactions_to_receipts`, Definition `TransactionsToReceipts`: Array von Objekten mit `receipt_id_by_customer` und `transaction_id_by_customer`. **Keine** parallelen Arrays |

**Verschachtelte parallele Arrays gibt es an zwei Stellen**, nämlich je Stapelelement:

| Definition | Verwendet von | Felder je Element |
| --- | --- | --- |
| `ReceiptPostings` | `/postings/add-batch/receipts` | `postingaccounts`, **`postingstexts`** (Spezifikationsfehler, 0.5), `vats`, `cost_locations`, `cost_locations_two`, `amounts`, dazu skalar `receipt_id_by_customer`, `creditor`, `debtor` |
| `TransactionPostings` | `/postings/add-batch/transactions` | `postingaccounts`, `postingtexts`, `vats`, `cost_locations`, `cost_locations_two`, `amounts`, `oi_receipts_ids_by_customer`, dazu skalar `transaction_id_by_customer` |

Die Positionsliste ist dort **innerhalb jedes Stapelelements** zu bilden, nicht auf oberster
Ebene: ein Element trägt die Kennung und ein Feld `positions`, dessen Umformung dieselbe ist
wie bei den Einzelwerkzeugen.

**Unsere Lösung an den sieben betroffenen Werkzeugen (21, 23, 17, 18, 19 auf oberster Ebene;
22, 24 je Stapelelement):** Das Werkzeug nimmt eine **Positionsliste**, der Mapper erzeugt die
parallelen Arrays.

```jsonc
"positions": {
  "type": "array", "minItems": 1,
  // maxItems = min(50, BB_MCP_MAX_BATCH), beim Serverstart aus der eingefrorenen
  // Konfiguration gesetzt (6.2, Q4 in 4.7). Vorgabe 50, also 50 im Auslieferungszustand.
  "maxItems": 50,
  "description": "Die Buchungssätze zu diesem Beleg. Jeder Eintrag ist eine Zeile einer Splitbuchung. Die Summe aller Zeilenbeträge muss dem Belegbetrag entsprechen; BuchhaltungsButler lehnt den Aufruf sonst ab.",
  "items": {
    "type": "object", "additionalProperties": false,
    "required": ["postingaccount", "postingtext", "vat", "amount"],
    "properties": {
      "postingaccount":    { "…": "postingAccountNumber()" },
      "postingtext":       { "type": "string", "maxLength": 128 },
      "vat":               { "…": "vatKey()" },
      "amount":            { "…": "amountIn()" },
      "cost_location":     { "…": "costLocation()" },
      "cost_location_two": { "…": "costLocation()" }
    }
  }
}
```

Wirkung, alles zugleich:

- Die Längeninvariante ist **konstruktiv** erfüllt und kann nicht mehr verletzt werden.
- Der Agent kann keine Position halb ausfüllen; `required` wirkt je Position.
- Die Definition wird kleiner: eine Objektbeschreibung statt sechs Arraybeschreibungen.
  Ersparnis rund 290 Zeichen je Werkzeug.
- Fehler sind **positionsgenau** meldbar: „Position 2: vat '19_ust' ist kein gültiger
  Steuerschlüssel".

**Die Obergrenze der Positionsliste ist keine feste 50.** Sie ist `min(50, BB_MCP_MAX_BATCH)`
und damit dieselbe Grenze wie bei den acht Stapelbehältern; die Begründung und die vollständige
Werkzeugliste stehen bei Q4 in 4.7, die Variable in 6.2. Das gilt für `positions` an 21 und 23,
für `items` an 17, 18 und 19 und für die geschachtelten Positionslisten je Stapelelement an 22
und 24. Gebaut wird das in `src/schema/line-items.ts`, mit demselben Wert wie in
`src/schema/batch.ts`.

Dass dies eine Umformung gegenüber der API ist, steht in der Werkzeugbeschreibung
ausdrücklich, auf Deutsch und mit den API-Feldnamen im Original: *„Die BuchhaltungsButler-API
nimmt diese Werte als parallele Arrays entgegen (postingaccounts, postingtexts, vats, amounts);
dieses Werkzeug nimmt eine Positionsliste und rechnet sie um, wodurch die Arrays zwingend
gleich lang sind."* Damit ist die Umformung deklariert und kein verborgenes Verhalten im Sinne
von E1. **An den drei Rechnungswerkzeugen lautet der Satz sinngemäß gleich** und nennt die
dortigen Arrays (`item_name`, `item_amount`, … beziehungsweise `item_tax_type`,
`item_tax_amount`).

Bei `/postings/add/transaction` kommt `oi_receipts_ids_by_customer` hinzu. Die Spezifikation
erlaubt dort ausdrücklich `null` je Position; im Positionsobjekt heißt das Feld
`open_item_receipt_id_by_customer` und ist `["integer","null"]` mit der Erklärung, dass `null`
bedeutet: „dieser Position ausdrücklich keinen Beleg zuordnen".

**Verbindliche Festlegung je Werkzeug.** Was oben als Tabelle steht, ist hier als Anweisung
formuliert, weil AP12c und AP12e danach arbeiten:

| Werkzeug | Festlegung |
| --- | --- |
| 21 `bb_postings_create_for_receipt` | Positionsliste `positions` mit `apiNames` = `postingaccounts`, `postingtexts`, `vats`, `cost_locations`, `cost_locations_two`, `amounts`. `receipt_id_by_customer`, `creditor` und `debtor` bleiben skalare Felder |
| 23 `bb_postings_create_for_transaction` | wie 21, zusätzlich `oi_receipts_ids_by_customer` in `apiNames` und `open_item_receipt_id_by_customer` im Positionsobjekt |
| 22 `bb_postings_create_for_receipt_batch` | **keine** Umformung auf oberster Ebene. Ein Feld `receipts` (API-Name unverändert), `transform: "object-list"`, `itemFields` nach `ReceiptPostings`: skalar `receipt_id_by_customer`, `creditor`, `debtor` sowie ein **geschachteltes** `positions` mit `apiNames` = `postingaccounts`, **`postingstexts`**, `vats`, `cost_locations`, `cost_locations_two`, `amounts`. Die abweichende Schreibweise `postingstexts` ist der benannte Spezifikationsfehler aus 0.5 und steht so in `SPEC_BUGS` |
| 24 `bb_postings_create_for_transaction_batch` | wie 22, mit `transactions` und `TransactionPostings`; dort heißt das Feld `postingtexts`, und `oi_receipts_ids_by_customer` gehört zur geschachtelten Positionsliste |
| 25 `bb_postings_create_free` | **keine Positionsliste.** Die acht skalaren Felder eins zu eins, einschließlich `postingaccount_debit` und `postingaccount_credit`. Das Werkzeug legt genau eine Buchungszeile an; die Beschreibung sagt das und verweist für Splitbuchungen auf 21 und 23 |
| 26 `bb_postings_create_free_batch` | **keine Umformung.** Ein Feld `free_postings` (API-Name unverändert), `transform: "object-list"`, `itemFields` nach `PostingsFree.items`. Der Spezifikationsfehler `required: ["amounts"]` bei vorhandener Eigenschaft `amount` ist der zweite benannte `SPEC_BUGS`-Eintrag; im Schema ist `amount` Pflicht |
| 15 `bb_transactions_assign_receipt_batch` | **keine Umformung, reine Umbenennung.** Ein Feld `assignments` mit `apiNames: ["transactions_to_receipts"]`, `transform: "object-list"`, `itemFields` = `receipt_id_by_customer`, `transaction_id_by_customer`, beide Pflicht |
| 17, 18 `bb_invoices_create`, `bb_invoices_create_draft` | Positionsliste `items` mit `apiNames` = `item_name`, `item_amount`, `item_unit`, `item_vat`, `item_single_price`, `item_description` |
| 19 `bb_invoices_create_einvoice` | Positionsliste `items` mit `apiNames` = `item_name`, `item_amount`, `item_unit`, `item_tax_type`, `item_tax_amount`, `item_single_price`, `item_description`; dazu Q8 |

**Die drei `order`-Syntaxen werden nicht vereinheitlicht**, weil das verborgene Logik wäre:

| Endpunkt | Werkzeugfeld | Schema |
| --- | --- | --- |
| `/receipts/get` | `order` | `object`, `additionalProperties: false`, Eigenschaften `date`, `amount`, `invoicenumber`, `invoicingparty`, jede mit `enum ["ASC","DESC"]`. Das Platzhalterschema der Spezifikation mit der Eigenschaft `field` wird verworfen, die Belegstelle steht als Kommentar im Registereintrag |
| `/postings/get` | `order` | `string` mit `enum` der **sieben** erlaubten Werte, exakt in der Schreibweise der Spezifikation: `default`, `date ASC`, `date DESC`, `date_last_action ASC`, `date_last_action DESC`, `id_by_customer ASC`, `id_by_customer DESC`. Die Validierung der API ist ausdrücklich case sensitive („Please not that the validation of the specified value is case sensitive!"); das Enum fängt es vorher ab. **Ein kürzeres Enum lehnt gültige Sortierungen unsichtbar ab** (R4) |
| `/settings/get/postingaccounts` | `order` | `string` mit `enum` der sechs Kombinationen `postingaccount_number ASC`, `postingaccount_number DESC`, `name ASC`, `name DESC`, `type ASC`, `type DESC` |

### 4.9 Aufbau jeder Werkzeugbeschreibung und das Beschreibungsbudget

**Ausgeliefert wird der fünfteilige Aufbau aus `tool-design.md` 11.3, auf Deutsch** (E4). Die
frühere englische Fassung dieses Abschnitts widersprach E4 und ist ersetzt.

**Die Sprachregel, verbindlich und maschinell geprüft (P8):** Der Fließtext jeder Beschreibung
ist deutsch, mit echten Umlauten. **API-Feldnamen, Werkzeugnamen und Enum-Werte stehen
unverändert im Original** und werden weder übersetzt noch eingedeutscht: `id_by_customer`
bleibt `id_by_customer`, `bb_postings_search` bleibt `bb_postings_search`, `date DESC` bleibt
`date DESC`. Enum-Werte und wörtlich zitierte API-Werte stehen in einfachen Anführungszeichen
(`'all financial accounts'`), damit die maschinelle Sprachprüfung sie ausklammern kann. Die
frühere Regel „deutsche Fachbegriffe in Anführungszeichen" entfällt ersatzlos, weil der
Fließtext jetzt ohnehin deutsch ist.

1. **Zweck.** Nennt das Wort BuchhaltungsButler und den deutschen Fachbegriff der Buchhaltung
   (Beleg, Zahlung, Buchungssatz, Kostenstelle, Sachkonto, Zahlungskonto).
2. **Anwendungsfall** mit einem konkreten Beispiel.
3. **Abgrenzung** zu dem Werkzeug, das stattdessen zu nehmen ist.
4. **Negation**: was das Werkzeug nicht liefert oder nicht tut.
5. **Grenzen und Folgen.** Bei lesenden Werkzeugen die Obergrenze und der Hinweis auf
   `offset`, bei schreibenden **wörtlich** der Pflichtsatz aus 3.5.

Für die zehn Werkzeuge der Klasse B und die sieben der Klasse D ist Punkt 5 die wichtigste
Zeile des ganzen Servers, weil er die einzige Warnung ist, die der Nutzer im Freigabedialog
sieht.

**Zusatzaufrufe gehören in Punkt 5, sofern es welche gibt.** Im Auslieferungszustand gibt es
keine: Die Duplikatsabfrage ist abgeschaltet (6.2), und die Auflösung der Schreibantwort
erzeugt keinen zweiten Request (7.6). Wird `BB_MCP_DUPLICATE_CHECK=on` gesetzt, steht der
zusätzliche Verbrauch im Zustandsblock der `instructions` (6.7 Punkt 1) und nicht in 54
Beschreibungen; so bleibt er deklariert, ohne das Budget zu sprengen.

**Das Beschreibungsbudget nach Stufen** (Feld `tier` im Registereintrag), maschinell geprüft
in P11. **Die Obergrenzen sind gegenüber dem englischen Entwurfsstand angehoben**, weil
deutscher Fließtext länger ist: Stufe 1 und 2 um rund 15 Prozent (800 auf 900, 600 auf 700),
Stufe 3 um rund 26 Prozent (380 auf 480), weil dort die Pflichtsätze aus 3.5 mit bis zu 217
Zeichen den engsten Spielraum haben. Die Herleitung steht in 4.10.

| Stufe | Werkzeuge | Obergrenze Beschreibung |
| --- | --- | --- |
| 1 | **22**: die Verwechslungs- und Gefahrenzone | 900 Zeichen |
| 2 | **18**: fachliche Tiefe, aber kein Verwechslungsrisiko | 700 Zeichen |
| 3 | **14**: triviale Stapel- und Nachschlagevarianten | 480 Zeichen |

**Alle 54 Werkzeuge sind namentlich zugeordnet.** Das ist keine Redundanz, sondern die
Voraussetzung dafür, dass die fünf Registerpakete AP12a bis AP12e echt parallel laufen (11.3):
Jeder Bearbeiter muss die Stufe seiner Werkzeuge setzen können, **ohne** die Verteilung der
anderen vier Pakete zu kennen. Ohne diese Liste verfehlen fünf unabhängige Bearbeiter die
Prüfsumme mit hoher Wahrscheinlichkeit, und die Korrektur erzwingt genau die Abstimmung, die
der Paketschnitt vermeiden soll.

**Stufe 1, 22 Werkzeuge** (Nummern nach 3.8):

| # | Werkzeug | # | Werkzeug |
| --- | --- | --- | --- |
| 1 | `bb_receipts_search` | 24 | `bb_postings_create_for_transaction_batch` |
| 6 | `bb_receipts_upload` | 25 | `bb_postings_create_free` |
| 7 | `bb_receipts_delete` | 26 | `bb_postings_create_free_batch` |
| 9 | `bb_transactions_search` | 27 | `bb_postings_unconfirm_for_receipt` |
| 12 | `bb_transactions_create` | 28 | `bb_postings_unconfirm_for_transaction` |
| 17 | `bb_invoices_create` | 29 | `bb_postings_unconfirm_free` |
| 18 | `bb_invoices_create_draft` | 30 | `bb_postings_assign_receipt` |
| 19 | `bb_invoices_create_einvoice` | 31 | `bb_postings_cancel` |
| 20 | `bb_postings_search` | 40 | `bb_postingaccounts_search` |
| 21 | `bb_postings_create_for_receipt` | 43 | `bb_payment_accounts_list` |
| 22 | `bb_postings_create_for_receipt_batch` | | |
| 23 | `bb_postings_create_for_transaction` | | |

Das sind die zwölf `bb_postings_*` (20 bis 31), die drei `bb_invoices_*` (17 bis 19) sowie
1, 6, 7, 9, 12, 40 und 43. **Nachgezählt: 12 + 3 + 7 = 22.**

**Stufe 2, 18 Werkzeuge.** Kriterium: alle schreibenden **Einzel**werkzeuge außerhalb der
Stufe 1, dazu der Belegeinzelabruf mit seinen Fremdwährungsfeldern (Werkzeug 2).

| # | Werkzeug | # | Werkzeug |
| --- | --- | --- | --- |
| 2 | `bb_receipts_get` | 41 | `bb_postingaccounts_create` |
| 4 | `bb_receipts_create` | 42 | `bb_postingaccounts_update` |
| 8 | `bb_receipts_restore` | 44 | `bb_payment_accounts_create` |
| 14 | `bb_transactions_assign_receipt` | 45 | `bb_comments_create` |
| 16 | `bb_transactions_unassign_receipt` | 47 | `bb_cost_locations_create` |
| 33 | `bb_debtors_create` | 48 | `bb_cost_locations_update` |
| 35 | `bb_debtors_update` | 49 | `bb_cost_locations_delete` |
| 37 | `bb_creditors_create` | 53 | `bb_reports_create_bwa` |
| 39 | `bb_creditors_update` | 54 | `bb_reports_create_sums` |

**Nachgezählt: 18.**

**Stufe 3, 14 Werkzeuge.** Kriterium: Stapelvarianten, deren Einzelvariante die Fachlichkeit
bereits trägt, sowie reine Nachschlage- und Abholwerkzeuge mit höchstens vier Parametern.

| # | Werkzeug | Warum Stufe 3 |
| --- | --- | --- |
| 3 | `bb_receipts_list_transactions` | Nachschlagen, zwei Parameter |
| 5 | `bb_receipts_create_batch` | Stapelvariante zu 4 |
| 10 | `bb_transactions_get` | Einzelabruf über Pfadsegment, kein weiterer Parameter |
| 11 | `bb_transactions_list_receipts` | Nachschlagen, zwei Parameter |
| 13 | `bb_transactions_create_batch` | Stapelvariante zu 12 |
| 15 | `bb_transactions_assign_receipt_batch` | Stapelvariante zu 14 |
| 32 | `bb_debtors_search` | Nachschlagen, zwei Parameter |
| 34 | `bb_debtors_create_batch` | Stapelvariante zu 33 |
| 36 | `bb_creditors_search` | Nachschlagen, zwei Parameter |
| 38 | `bb_creditors_create_batch` | Stapelvariante zu 37 |
| 46 | `bb_cost_locations_search` | Nachschlagen, drei Parameter |
| 50 | `bb_reports_get_bwa` | Abholen, zwei Parameter |
| 51 | `bb_reports_get_sums` | Abholen, zwei Parameter |
| 52 | `bb_reports_get_ledger` | Abholen, vier Parameter |

**Nachgezählt: 14.**

**Fünf der vierzehn Werkzeuge der Stufe 3 sind schreibend** (5, 13, 15, 34, 38) und tragen
damit einen Pflichtsatz aus 3.5. Der teuerste ist U2 mit 217 Zeichen bei
`bb_receipts_create_batch`; für die Punkte 1 bis 4 bleiben dann 263 Zeichen. **Genau deshalb
liegt die Obergrenze der Stufe 3 bei 480 und nicht bei 380 Zeichen.** Mit dem englischen
Entwurfswert wäre U2 in der deutschen Fassung nicht unterzubringen gewesen.

**Prüfsumme: 22 + 18 + 14 = 54.** `descriptions.test.ts` (P8) rechnet das nach, prüft die
Stufe jedes Werkzeugs **gegen diese drei Listen** und verlangt, dass jedes Werkzeug genau eine
Stufe trägt.

### 4.10 Das Kontextbudget, vorgerechnet und erzwungen

Dies ist die teuerste Folge von E1, und sie wird hier beziffert statt verschwiegen.

**Methode.** Zeichen der erzeugten Werkzeugdefinitionen, geteilt durch **3,2 Zeichen je Token**.

**Warum 3,2 und nicht mehr 3,7.** Der Entwurfsstand rechnete mit 3,7 und begründete das
ausdrücklich mit „englischer Text in JSON-Struktur". Nach E4 sind alle vom Agenten gelesenen
Texte deutsch (4.9), und deutscher Fließtext zerfällt bei den üblichen BPE-Tokenizern in mehr
Token je Zeichen als englischer. Der Wert 3,2 ist ein Mischwert: Die Bezeichner, Feldnamen und
Enum-Werte bleiben englisch und unverändert und tokenisieren weiterhin gut, der Fließtext
drumherum schlechter. **Der Faktor ist eine Annahme, nicht gemessen**, und wird in AP14 durch
einen echten Tokenizer ersetzt; AP14 schreibt das tatsächliche Verhältnis in
`docs/entwicklung/befund-tokenbudget.md`.

**Wofür der Faktor gebraucht wird und wofür nicht — verbindlich, weil sonst drei Pakete
verschieden rechnen:**

| Stelle | Rechnet mit | Begründung |
| --- | --- | --- |
| **P11**, `test/registry/token-budget.test.ts` | **dem echten Tokenizer** aus 13.3, nie mit dem Faktor | Ein Budget, das über einen Schätzfaktor erzwungen wird, erzwingt die Schätzung und nicht das Budget. Der Tokenizer ist eine Entwicklungsabhängigkeit und steht ab AP01 bereit, also **vor** AP11; P11 wartet auf keine Messung aus AP14 |
| **`scripts/measure-tokens.ts`** (AP14) | demselben Tokenizer | Es misst dieselben Zahlen wie P11 und berichtet zusätzlich das Zeichen-je-Token-Verhältnis, damit die Rechnung in diesem Abschnitt nachprüfbar wird |
| **`response/truncate.ts`** (7.6) und **`doctor`** (8.4) | der eingecheckten Konstanten `CHARS_PER_TOKEN` aus `src/registry/budget.ts` | Beide laufen zur **Laufzeit** im ausgelieferten Paket. Ein Tokenizer dort wäre eine vierte Laufzeitabhängigkeit und widerspräche 13.2 (genau drei). Die Richtung der Ungenauigkeit ist in 7.6 begründet |

`CHARS_PER_TOKEN` wird in AP04 mit **3,2** angelegt, also mit dem hier begründeten Annahmewert,
und ist die **einzige** Konstante in `budget.ts`, die AP14 nach der Messung ändern darf. Die
Budgetgrenzen 32.000, 2.100, 900, 700 und 480 bleiben unangetastet.

**Zweiter Effekt, getrennt gerechnet:** Deutscher Fließtext braucht auch mehr **Zeichen** als
englischer. Angesetzt sind **15 Prozent Aufschlag auf Fließtext**, ebenfalls als Annahme; auf
Feldnamen, Enum-Werte, Werkzeugnamen, Zahlen und Schemarümpfe wird **kein** Aufschlag gerechnet,
weil sie unverändert bleiben. Deshalb wächst der `outputSchema`-Posten in der Endabrechnung
nicht: Er besteht nur aus Feldnamen und Typen.

**Rohschätzung ohne Sparmaßnahmen, deutsche Fassung:**

| Posten | Rechnung | Zeichen |
| --- | --- | --- |
| Name, Titel, Annotationen, Schemarümpfe | 54 × 97 | 5.238 |
| Werkzeugbeschreibungen, ungebremst 150 Wörter | 54 × 1.100 | 59.400 |
| Parametereinträge mit Beschreibungen wie in der Spezifikation, übersetzt | 317 × 240 | 76.080 |
| `outputSchema` mit Feldbeschreibungen | 54 × 1.020 | 55.080 |
| **Summe** | | **195.798**, rund **61.200 Token** |

Das sind rund 31 Prozent eines 200k-Fensters, bevor der Nutzer etwas gesagt hat. Inakzeptabel.

**Die sechs Sparmaßnahmen, jede mit ihrem Beitrag:**

| # | Maßnahme | Ersparnis (Zeichen) |
| --- | --- | --- |
| S1 | **Querschnittsregeln nur in den `instructions`.** Die Spezifikation wiederholt „If specified, the field will be validated" und „An empty string is not considered a valid date" dutzendfach. Diese Regeln stehen einmal im Servertext, nie im Parameter | 16.100 |
| S2 | **Beschreibungsbudget nach Stufen** (4.9): 22 × 900 + 18 × 700 + 14 × 480 = 19.800 + 12.600 + 6.720 = 39.120 statt 59.400 | 20.280 |
| S3 | **Enum statt Prosa**, insbesondere Umsatzsteuerschlüssel, Währungen, `order`, `type` | 10.350 |
| S4 | **Kurzmuster für die 90 Adress- und Kontaktfelder** von Debitoren, Kreditoren und Rechnungen, höchstens 80 Zeichen je Feld | 9.200 |
| S5 | **Positionsliste statt paralleler Arrays** an den sieben Werkzeugen aus 4.8 (fünf auf oberster Ebene, zwei je Stapelelement), rund 290 Zeichen je Werkzeug | 2.030 |
| S6 | **`outputSchema` ohne Feldbeschreibungen.** Feldnamen und Typen genügen, weil die Namen selbsterklärend sind und in der Textantwort ohnehin vorkommen. Rund 260 statt 1.020 Zeichen je Werkzeug | 41.040 |
| | **Summe** | **99.000** |

**Ergebnis:** 195.798 minus 99.000 ergibt 96.798 Zeichen. Aufgeschlüsselt:

| Posten | Zeichen | Token (÷ 3,2) |
| --- | --- | --- |
| Name, Titel, Annotationen, Rümpfe | 5.238 | 1.637 |
| Beschreibungen nach Stufenbudget (S2) | 39.120 | 12.225 |
| Parametereinträge nach S1, S3, S4, S5 | 38.400 | 12.000 |
| `outputSchema` schlank (S6) | 14.040 | 4.388 |
| **Summe Werkzeugdefinitionen** | **96.798** | **rund 30.250** |
| `instructions`, einmal, nicht je Werkzeug | 6.000 | 1.875 |
| **Was der Client beim Verbinden sieht** | | **rund 32.100** |

Die Zeile „Parametereinträge" ist die Restgröße: 76.080 minus S1, S3, S4 und S5, also
76.080 − 16.100 − 10.350 − 9.200 − 2.030 = 38.400. Die vier Posten addieren sich zu 96.798 und
stimmen damit mit der Zeile darüber überein.

**Das verbindliche Budget: 32.000 Token für alle 54 Definitionen zusammen, plus 2.100 Token
für die `instructions`.** `test/registry/token-budget.test.ts` bricht den Bau ab, wenn es
gerissen wird, und prüft zusätzlich je Werkzeug das Stufenbudget aus 4.9, damit die
Überschreitung nicht erst in der Summe auffällt.

**Die Anhebung von 26.000 auf 32.000 ist keine Lockerung der Regel aus S4, sondern ihre
Voraussetzung.** Der Wert 26.000 war auf englische Beschreibungen und den Faktor 3,7 gerechnet
und damit auf einen Zustand, den E4 ausschließt. Ein Budget, das die geforderte Sprache
arithmetisch nicht zulässt, erzwingt keine Disziplin, sondern nur einen dauerhaft roten Test.
**Die Regel selbst bleibt unverändert:** Reißt die echte Messung in AP14 auch die 32.000, gilt
die Reihenfolge unten, und der Wert wird nicht stillschweigend weiter angehoben.

**Was passiert, wenn die echte Messung das Budget reißt** (P11 zählt ab AP11 mit dem echten
Tokenizer, AP14 wertet zusätzlich das Zeichenverhältnis aus)**.** Verbindlich in dieser
Reihenfolge und ohne Rückfrage: erstens S1 bis S6 nachziehen, wo sie noch nicht vollständig
umgesetzt sind; zweitens die Beschreibungen der Stufe 3 auf die untere Wortgrenze kürzen;
drittens weitere Inhalte aus Beschreibungen in Resources verschieben. **Werkzeuge zu streichen
oder zusammenzulegen ist kein Hebel, E1 steht dem entgegen. Das Budget stillschweigend
anzuheben ebenfalls nicht:** Reißt es nach allen drei Schritten immer noch, ist das ein Befund
für den Projektinhaber und keine Zahl, die der Implementierungs-Agent selbst ändert.

**Die ehrliche Einordnung.** `tool-design.md` 10.3 nennt 10.000 Token als Zielwert, abgeleitet
aus einer Faustregel für 34 Werkzeuge. Mit 54 Endpunktwerkzeugen und 317 Parametern ist dieser
Wert arithmetisch nicht erreichbar, ohne Parameter wegzulassen oder Beschreibungen auf einen
Satz zu kürzen. Beides verbietet E6. Der 34er-Schnitt kostet rund 10.000 Token, der 54er in
deutscher Fassung rund 32.100. Das ist der Preis von E1 zusammen mit E4, und er beträgt rund
16 Prozent eines 200k-Fensters. **Rund 7.300 Token davon gehen auf E4**, also auf die
Entscheidung, die Beschreibungen deutsch auszuliefern; das ist der Unterschied zwischen den
24.800 Token des englischen Entwurfsstandes und den 32.100 hier. Diese Zahl wird genannt und
nicht verschwiegen: Die Zielgruppe ist deutschsprachige Buchhaltung, und der Freigabedialog des
Clients ist unter E2 die einzige menschliche Kontrolle.

Drei Wege, den Preis im Betrieb zu drücken, alle ohne Eingriff in E1:

1. **Client-seitiges Deferred Loading unterstützen:** durchsuchbare Namen, deutsche
   Fachbegriffe in jeder Beschreibung, konsistente Präfixe je Ressource. Der Server kann es
   nicht erzwingen, aber ermöglichen.
2. **Resources statt Beschreibungstext.** Kontenrahmen, Umsatzsteuerschlüssel mit deutschen
   Labels, Buchungswegweiser und Kontenkunde liegen als MCP-Resources vor. Sie kosten nur
   dann Kontext, wenn der Agent sie liest.
3. **Die `instructions` tragen alles Querschnittliche genau einmal.**

**Eine Umgebungsvariable, die Werkzeuggruppen ausblendet, wird nicht gebaut.** Begründung in
12, Streitfrage S12.

---

## 5. HTTP-Schicht, Fehlerabbildung, Rate Limiting, Retry-Politik

### 5.1 Client

Ein einziger Aufrufpunkt, `src/http/client.ts`. Alles andere spricht nur mit ihm.

| Aspekt | Festlegung | Begründung |
| --- | --- | --- |
| Bibliothek | eingebautes `fetch` von Node; `undici` nur für `EnvHttpProxyAgent`, Keep-Alive und im Test `MockAgent` | kein zweiter HTTP-Stack; offiziell dokumentierter Weg, das globale `fetch` zu konfigurieren |
| Methode | ausschließlich `POST` | alle 54 Endpunkte, maschinell bestätigt (0.4) |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1`, über `BB_BASE_URL` überschreibbar | Testbarkeit; geprüft auf `https:` und auf einen Host ohne Anmeldeteil, `http:` nur gegen `localhost` |
| Authentifizierung | `Authorization: Basic ` plus Base64 von `client:secret` über `Buffer.from(…, "utf8")` | `btoa` scheitert an Nicht-ASCII im Secret und ist zeichenweise langsam |
| Header | `Content-Type: application/json`, `Accept: application/json`, `User-Agent: buchhaltungsbutler-mcp/<version>` | der `User-Agent` macht den Server in Anbieterprotokollen erkennbar |
| Body | immer JSON, niemals formularkodiert | erhält Booleans, `null` in Arrays und das `order`-Objekt |
| `api_key` | vom Client in den Body gesetzt, nicht vom Register | genau ein Ort, an dem das Geheimnis den Body berührt |
| Cookies | `Set-Cookie` wird verworfen, kein Jar | eine geteilte Sitzung über Mandanten hinweg wäre ein Risiko |
| Umleitungen | `redirect: "error"` | die API leitet nicht um; eine Umleitung ist ein Anzeichen für einen falschen Host |
| Abbruch | `extra.signal` an jeden `fetch`, `throwIfAborted()` zu Beginn jedes Handlers | `mcp-sdk-typescript.md` 10.4 Punkt 8 |

### 5.2 Zeitlimits

Drei Stufen, je Registereintrag gewählt (`timeoutTier`).

| Stufe | Wert im Code | Wert | Gilt für |
| --- | --- | --- | --- |
| kurz | `short` | 15 s | alle lesenden Endpunkte außer den Berichten |
| normal | `normal` | 30 s | alle schreibenden Endpunkte außer Upload und Stapel |
| lang | `long` | 120 s | `bb_receipts_upload`, alle `*_batch`, alle fünf `bb_reports_*` |

Das Zeitlimit wird über `AbortSignal.timeout` gesetzt und mit dem Abbruchsignal des Clients
über `AbortSignal.any` verknüpft. `BB_MCP_TIMEOUT_MS` setzt die Stufe „normal", mindestens
5000; „kurz" und „lang" skalieren mit den Faktoren 0,5 und 4. Ein Zeitlimit bei einem
**schreibenden** Aufruf wird nicht als Fehlschlag gemeldet, sondern als Ungewissheit (5.7).

### 5.3 Retry-Politik, getrennt nach Wirkung

Die wichtigste Sicherheitsregel der HTTP-Schicht. Die API kennt keinen Idempotenzschlüssel.
Wer trotzdem jeden Aufruf wiederholt, erzeugt bei einem Abbruch nach dem Anlegen einer Buchung
bis zu drei Buchungen, und der Aufrufer sieht dabei nur einen Fehler.

**Lesend, also ausschließlich die 15 Werkzeuge der Klasse R:**

- Höchstens drei Versuche insgesamt.
- Wiederholt wird bei: Netzwerkfehler, HTTP 5xx, HTTP 504 mit `error_code` 30, HTTP 500 mit
  `error_code` 0, HTTP 429 (in der Spezifikation nicht vorgesehen, defensiv berücksichtigt)
  und `error_code` 15 **nur dann, wenn er mit HTTP 403 kommt**. Kommt derselbe Code mit
  HTTP 400, wird nie wiederholt. Das ist derselbe Sonderfall wie in 5.6: Code 15 heißt an
  `/receipts/get` (HTTP 400) etwas völlig anderes als an den zehn Pfaden aus der Fußnote zu 5.6
  (HTTP 403).
- **Die Weiche hängt am Tripel (`specPath`, `error_code`, HTTP-Status) und an keiner Stelle an
  einem Zeichenkettenvergleich gegen einen Meldungstext.** Das ist gemessen begründet (L6): Der
  gelieferte `message`-Text zu `/receipts/get` Code 15 lautet live `invalid field specified`
  und damit **weder** wie die `description` (`invalid sort field is specified`) **noch** wie der
  `message`-`enum` der Definition (`invalid sort field specified`). Eine Weiche, die auf einen
  dieser beiden Texte vergleicht, ist ein stiller Fehlschlag in Wartestellung — sie greift
  einfach nie. Der Entwurfsstand dieses Plans trug genau diesen Vergleich; er ist hier ersetzt.
  **Die drei Bestandteile des Tripels sind maschinenlesbar, stabil und in der Spezifikation
  belegt**, der Meldungstext ist keines von beidem.
- **Die Klausel ist im Auslieferungszustand rein defensiv**, weil kein einziger lesender Pfad
  den Code 15 mit HTTP 403 führt: An `/receipts/get` kommt er mit HTTP **400**, und HTTP 400
  wird ohnehin nie wiederholt. Sie bleibt trotzdem stehen, damit ein später nachgerüsteter
  lesender Endpunkt mit 403/15 nicht stillschweigend in eine falsche Wiederholung läuft.
- Nie wiederholt wird bei: 400, 401, 403 mit `error_code` 11 oder 12, 422.
- **Backoff:** `delay = min(1000 ms × 2^n, 20 s)`, tatsächliche Wartezeit
  `delay × (0.5 + Math.random())`, also Jitter im Bereich `[0,5; 1,5]` um den **vollen** Wert.
  Nicht `delay × Math.random()`: Das wartet im Mittel nur die Hälfte und kommt zu früh wieder.
- **Jeder Versuch entnimmt einen eigenen Token aus dem Rate-Limiter.** Der Limiter liegt in
  der Schleife, nicht davor. Sonst erzeugt ausgerechnet der Fehler, der Drosselung anzeigt,
  ungebremste Zusatzlast.

**Schreibend, also die 39 Werkzeuge der Klassen A, AR, M, D und B:**

- **Kein automatischer Retry. Niemals. Unter keinen Umständen.**
- Die Ausnahme, die keine ist: Auch ein Netzwerkfehler **vor** dem Absenden wird nicht
  wiederholt, weil `fetch` nicht zuverlässig unterscheidet, ob der Server die Anfrage schon
  gesehen hat. Nur ein Fehler, der nachweislich vor dem ersten gesendeten Byte auftritt, wäre
  sicher, und diese Unterscheidung ist über `fetch` nicht zu treffen. Deshalb: gar nicht.
- **Diese Regel ist nicht konfigurierbar.** Es gibt keine Umgebungsvariable, die sie aufhebt.
- **Bauartbedingt**, nicht durch Disziplin: Der Retry-Zweig wird vom Registereintrag über
  `toolClass === "R"` freigeschaltet und liegt nicht als Allgemeingut im HTTP-Client. Ein später
  nachgerüsteter schreibender Endpunkt bekommt damit niemals versehentlich Retry.
- `test/contract/no-write-retry.test.ts` beweist es: Für jedes der 39 Werkzeuge wird ein
  HTTP 504 eingespielt und gezählt, wie oft der Mock angesprochen wurde. Erwartet: genau
  einmal, und die Meldung nennt `verifyWith`.

### 5.4 Rate Limiting

Dokumentiert sind 100 Anfragen je Mandant und Minute, ohne jeden Rate-Limit-Header. Das
Kontingent ist **geteilt**: andere Anwendungen desselben Mandanten, die Weboberfläche
eingeschlossen, verbrauchen es mit.

| Eimer | Kapazität | Nachfüllrate | Gilt für |
| --- | --- | --- | --- |
| `default` | 60 | 60 je Minute | jeden Aufruf |
| `upload` | 10 | 10 je Minute | `/receipts/upload` |
| `batch` | 1 | 1 je 5 Sekunden | `/receipts/addBatch`, `/transactions/addBatch`; defensiv auch die übrigen sechs `*_batch` |
| `reports` | 1 | 1 je 10 Sekunden | `/reports/create/bwa`, `/reports/create/sums` |

Der `reports`-Eimer ist **kein API-Limit**, sondern eine Bremse gegen das Muster „create,
sofort get, `error_code` 8, sofort wieder create", das einen laufenden Bericht mehrfach
ersetzt.

**Der Eimerschlüssel ist der `api_key`**, weil das Limit pro Mandant gilt. Ein Server mit
mehreren Profilen führt damit mehrere Eimersätze und drosselt nicht quer über Mandanten
hinweg. Der Schlüssel wird gehasht abgelegt, damit er in keinem Protokoll auftaucht.

60 statt 100 ist bewusster Sicherheitsabstand, über `BB_MCP_RATE_LIMIT` zwischen 10 und 100
einstellbar. Werte über 100 werden **abgelehnt, nicht gekappt**. Serialisierung über eine
Promise-Kette je Eimer, mit `.catch(() => {})` auf der gespeicherten Kette, damit eine
Ablehnung die Kette nicht vergiftet.

Wartet ein Aufruf länger als 5 Sekunden auf einen Token, meldet der Server das über
`sendLoggingMessage`, damit der Client nicht stumm hängt. Wartet er länger als 30 Sekunden,
bricht der Aufruf mit einer Meldung ab, die die Wartezeit nennt und zum Zusammenfassen der
Anfragen rät.

Der Eimer ist **prozesslokal**. Zwei Clients auf demselben Mandanten teilen ihn nicht. Das
steht in der README.

### 5.5 Content-Type-Prüfung und Umschlagzerlegung

Vier Stufen, in dieser Reihenfolge, jede mit eigenem Fehlertyp:

1. **Content-Type.** Beginnt der Wert nicht mit `application/json`, wird der Körper **nicht**
   geparst. Stattdessen `NonJsonResponseError` mit HTTP-Status, gemeldetem Content-Type und
   den ersten 200 Zeichen des Körpers, von Markup befreit, durch `config/redact.ts` geschickt
   und ausdrücklich als **Fremdtext** markiert, damit der Agent ihn nicht als Anweisung liest.
   Das ist der dokumentierte Fall „unbekannter Pfad liefert HTML". Die Prüfung erfolgt über
   den Header, nicht über ein `try` um `JSON.parse`: Ein `try` fängt den Fehler zwar auch,
   verliert aber die Information, dass die Gegenstelle gar nicht als API geantwortet hat.
2. **JSON-Zerlegung.** Scheitert sie trotz passendem Content-Type: `MalformedJsonError` mit
   derselben Zeichenbegrenzung.
3. **Umschlagform.** Es muss ein Objekt mit einem booleschen `success` sein. Fehlt `success`,
   ist das ein `EnvelopeContractError`. Ein Antwortkörper ohne `success` ist entweder eine
   andere API oder ein Zwischenknoten; beides darf nicht als Erfolg durchgehen.
4. **Erfolg oder Fehler.** Geprüft wird `body.success === false`, **nicht** das Vorhandensein
   von `error_code`. Zusätzlich gilt jede Antwort mit `response.ok === false` als Fehler.
   - `success === true`: `rows` und `data` werden **nicht** vorausgesetzt. Reine
     Aktionsendpunkte liefern nur `success` und `message`; der Einzelabruf liefert `data` als
     Objekt ohne `rows` (L2). Welche Form erwartet wird, sagt das Feld `shape` des
     Registereintrags (`list`, `object`, `ack`). Weicht die Antwort davon ab, ist das ein
     `EnvelopeContractError` und wird gemeldet, nicht stillschweigend geglättet.
   - `success === false`: `error_code` und `message` gehen an die Fehlerübersetzung.

**HTTP-Status und `success` werden beide ausgewertet.** Ein HTTP 200 mit `success: false` ist
möglich und wird als Fehler behandelt; ein HTTP 400 mit `success: true` wäre ein Widerspruch
und wird als `EnvelopeContractError` gemeldet.

### 5.6 Die Fehlerabbildung: 786 Paare, nicht 718 Definitionen

**Der Schlüssel ist immer das Paar (Pfad, `error_code`), nie der Code allein.** Belegt:
Über die 786 referenzierten Paare trägt Code 7 **28** verschiedene Bedeutungen; `error_code` 15
heißt an `/receipts/get` mit HTTP 400 `invalid sort field specified`, an zehn schreibenden
Pfaden dagegen mit HTTP 403 `adding temporarily restricted` beziehungsweise, an
`/receipts/upload`, `upload temporarily restricted`. Wer ihn global als Drosselung behandelt,
wartet bei einem Tippfehler im Sortierfeld 60 Sekunden und versucht es dann genauso falsch noch
einmal. Genau das passiert, sobald die Retry-Entscheidung an der Zahl allein hängt.

**Zur Zahl 28, damit sie nicht wieder verrutscht:** Über die **786 referenzierten Paare** sind
es 28 verschiedene Meldungstexte zu Code 7, über die **718 Definitionsnamen** dagegen 32. Die
Grundmenge dieses Katalogs sind die 786 Paare (0.4), also gilt 28. Der Entwurfsstand nannte 32
und mischte damit die Grundmenge, die er selbst verwirft. Beide Zahlen sind am 2026-09-12
maschinell nachgezählt.

**Die Quelle des Feldes `message`, verbindlich entschieden.** Die Spezifikation bietet zu jedem
Paar **zwei** Texte, und sie weichen bei **179 der 786 Paare** voneinander ab (0.4):

| Quelle | Beispiel `/receipts/get` Code 30 | Was sie ist |
| --- | --- | --- |
| `responses["504 (30)"].description` | `timeout` | die Beschreibung der **Antwort** im Sinne von OpenAPI, also Prosa über den Fall |
| `properties.message.enum[0]` der referenzierten Definition | `a timeout occurred while processing the request` | das Schema des **Antwortkörpers**: Die Definition modelliert `success`, `error_code` und `message`, und dieser Enum ist die einzige Aussage der Datei über den **Wert** des Feldes `message` |

**Verbindlich ist `properties.message.enum[0]`.** Drei Gründe: Erstens ist es die einzige
Angabe, die überhaupt beansprucht, den Wert des Antwortfeldes zu beschreiben. Zweitens ist die
`description` bei den 179 abweichenden Paaren erkennbar eine Zusammenfassung (`timeout`,
`internal error`, `invalid receipt type`), die keine API wörtlich zurückgibt. Drittens ändert
sich bei den übrigen 607 Paaren nichts, weil beide Quellen dort gleich lauten.

**Dieselbe Entscheidung zieht eine Schranke, und die ist wichtiger als die Quellenwahl:**
Gemessen (L6) lieferte `/receipts/get` zu Code 15 den Text `invalid field specified` und damit
**keine** der beiden Quellen. Wo beide Quellen übereinstimmten (Codes 5 und 10), traf der Text
zu. Daraus folgt verbindlich:

- **Der Katalogtext wird niemals als Wortlaut der API ausgegeben.** Der Vierblock zitiert
  ausschließlich das `message`-Feld **der tatsächlichen Antwort**, wörtlich und als Fremdtext
  markiert (5.8). Nur wenn die Antwort kein verwertbares `message` trägt, tritt der Katalogtext
  an seine Stelle, und dann mit dem Zusatz „Text laut Spezifikation, nicht der Wortlaut dieser
  Antwort".
- **Keine Weiche vergleicht auf Gleichheit mit einem Katalogtext.** Klassifikation und Retry
  entscheiden über (`specPath`, `error_code`, HTTP-Status) (5.3). Wo der Meldungstext
  überhaupt ausgewertet wird — bei der Klasse `special` —, geschieht das über **Teilzeichenketten
  ohne Rücksicht auf Groß- und Kleinschreibung** und niemals über Gleichheit; greift kein
  Muster, gilt die Rückfallregel weiter unten in diesem Abschnitt.
- **Die `description` wird trotzdem erzeugt und mitgeführt**, als zweites Feld `summary`. Sie
  ist die kürzere, für Menschen lesbare Fassung, sie geht in den Block `[Was]` der Meldung
  (5.8), und ihr Vergleich mit `message` ist ein Driftanzeiger: Der Generator gibt die Zahl der
  abweichenden Paare aus, und ein Test hält sie fest (AP03).

**Erzeugung.** `scripts/gen-errors.ts` liest alle `responses`-Blöcke, zerlegt die Schlüssel
der Form `"400 (5)"` in Status und Code, folgt der `$ref` zur Definition (**nicht** über den
Namen, weil die Namensregel bei fünf Endpunkten scheitert) und schreibt
`src/generated/errors.ts`:

```ts
export const ERRORS: Record<string, Record<number, ErrorEntry>> = {
  // Schlüssel der ersten Ebene ist IMMER der Spezifikationspfad, bei den vier Werkzeugen
  // mit Pfadvorlage also path.specPath und nicht der gebaute Pfad (4.6).
  "/receipts/get": {
    //   message: properties.message.enum[0] der Definition — verbindliche Quelle
    //   summary: responses[…].description — kurze Fassung, nur für den Block [Was]
    5:  { status: 400, message: "invalid list_direction specified", summary: "invalid list_direction specified", cls: "input", field: "list_direction" },
    10: { status: 400, message: "invalid limit specified",          summary: "invalid limit specified",          cls: "input", field: "limit" },
    15: { status: 400, message: "invalid sort field specified",     summary: "invalid sort field is specified",   cls: "input", field: "order" },
  },
  // … 54 Pfade, zusammen 786 Paare, davon 179 mit message !== summary
};
```

**Der Eintrag zu `/receipts/get` Code 15 ist zugleich das Beispiel für die Schranke oben:**
Beide Felder sind belegt, und live kam ein dritter Text. Der Agent liest deshalb den
Live-Text, und die Klassifikation als `input` folgt aus (`/receipts/get`, 15, HTTP 400) und
nicht aus dem Wortlaut.

**Abnahmebedingung: 786 Einträge, nicht 718.** Nachgezählt in 0.4. Die 718 sind
Definitionsnamen, von denen 42 in keinem `responses`-Block referenziert werden. **Die 42
verwaisten Definitionen werden bewusst nicht aufgenommen:** Sie sind kein belegtes
Serververhalten. Ein Generator, der stattdessen über die Definitionsnamen läuft, erzeugt eine
Tabelle, deren Schlüssel nicht zum eigenen Zugriffsmuster passt.

**Der Katalog wird dynamisch geladen** (`await import("../generated/errors.js")`), erst wenn
ein Fehler auftritt. Im Normalbetrieb kostet er null Ladezeit und null Speicher. Das ist der
einzige dynamische Import des Projekts, der aus Gründen der Startzeit dort steht, und er ist
es wert: Der Katalog ist der größte einzelne Datenblock des Pakets. **Er gelangt nie in den
Modellkontext**; in den Kontext gelangt immer nur der eine passende Eintrag.

**Klassifizierung** (`errors/classify.ts`), fünf Klassen nach `fehlercodes.md` D:

**Die Klassifikation geschieht beim Erzeugen des Katalogs, nicht zur Laufzeit an der Antwort.**
Die Muster in der Spalte „Erkennung" laufen also gegen den Katalogtext (`message`), und ihr
Ergebnis steht als `cls` fest im Generat; zur Laufzeit wird nur nachgeschlagen. Das ist der
Grund, warum ein abweichender Live-Text die Einstufung nicht kippen kann.

| Klasse | Erkennung | Verhalten |
| --- | --- | --- |
| `config` | Codes 3, 4, 11 endpunktübergreifend; zusätzlich Meldungen, die `not activated` enthalten (belegt sind vier Texte: `debtor posting is not activated`, `creditor posting is not activated`, `debtors are not activated for the customer`, `creditors are not activated for the customer` — ein Muster auf `is not activated` fände nur zwei davon) | kein Retry. Der Text nennt, welche der drei Zugangsdaten oder welche Kontoeinstellung zu prüfen ist, und verweist auf `bbutler-mcp doctor` |
| `input` | die große Mehrheit ab Code 5; Muster `invalid <feld> specified`, `no <feld> specified`, Längen- und Zeichenregeln | kein Retry mit denselben Werten. Der Text nennt Feld, gesendeten Wert und erlaubte Werte |
| `transient` | Code 0 (500), Code 30 (504), Code 15 an allen **zehn** Pfaden, die ihn mit HTTP 403 führen — die acht Stapelendpunkte, `/receipts/upload` und `/transactions/add` (Fußnote unten) | Retry nur bei Klasse R, sonst `write-uncertainty` |
| `final` | alle `not found`, alle Statuskonflikte, alle Betragsprüfungen, Tarifkontingente (Code 12 an `/receipts/upload`, Code 33 an den Rechnungsendpunkten) | kein Retry. Der Text nennt den Zustand und das Werkzeug, mit dem er vorher zu prüfen ist |
| `special` | Codes, deren Bedeutung ohne den Meldungstext nicht eindeutig ist: `/transactions/add` Codes 23 und 24, `/invoices/create/e-invoice` Codes 41 und 42, Code 8 und 12 an den Berichtspfaden | fallweise; zusätzlich den Originaltext der API wörtlich zitieren. **Die Fallunterscheidung läuft über Teilzeichenketten, nie über Gleichheit** (L6); greift kein Muster, gilt die Rückfallregel unten |

**Fußnote zur Zeile `transient`: die zehn Pfade mit 403/15, vollständig.** Maschinell aus
`docs/openapi/buchhaltungsbutler-v1.json` ausgezählt am 2026-09-12; `grundlagen.md` 7.3 nennt
dieselben zehn:

`/receipts/addBatch`, `/receipts/upload`, `/transactions/add`, `/transactions/addBatch`,
`/transactions/assign-batch/receipt`, `/postings/add-batch/receipts`,
`/postings/add-batch/transactions`, `/postings/add-batch/free`, `/settings/add-batch/debtors`,
`/settings/add-batch/creditors`.

**`/transactions/add` ist der Pfad, der leicht durchrutscht**: Er ist weder ein Stapel- noch
ein Upload-Endpunkt, führt aber dieselbe Drosselung mit derselben Meldung
`adding temporarily restricted`. Eine Regel, die nur Stapel und Upload nennt, fiele dort auf
Klasse `final` zurück, weil die Meldung auf kein `input`-Muster passt — und der Agent läse bei
einer echten, vorübergehenden Drosselung einer einzelnen Zahlungsanlage, ein späterer Versuch
helfe nicht. Genau das ist falsch: Richtig ist der Text aus 5.7, der den Ausgang als ungewiss
benennt und den Prüfaufruf nennt.

**Gegenprobe, ebenfalls verbindlich:** `/receipts/get` führt denselben Code 15 mit HTTP **400**;
die Spezifikation nennt dazu `invalid sort field specified` (Katalogquelle) beziehungsweise
`invalid sort field is specified` (`summary`), und live kam `invalid field specified` (L6).
Dieses Paar bleibt Klasse `input` und wird nie wiederholt. Es ist der einzige Pfad, an dem
Code 15 nicht 403 ist, und der Grund, warum die Klassifikation neben dem Paar (Pfad,
`error_code`) auch den **HTTP-Status** auswertet — und ausdrücklich **nicht** den Wortlaut
(5.3).

Die Spalte `cls` wird beim Erzeugen aus dem Meldungstext **vorgeschlagen** und anschließend
von Hand geprüft, weil die Ableitung bei den Sonderfällen falsch liegt. Die Prüfung ist ein
eigener Arbeitsschritt in AP08 und im Diff sichtbar; für die elf Paare mit Code 15 ist sie dort
ausdrücklich vorgeschrieben.

**Fehlt ein Paar in der Tabelle**, liefert die API also einen Code, den die Spezifikation für
diesen Pfad nicht kennt, wird er als `final` behandelt, der Originaltext wörtlich zitiert und
eine Zeile mit Stufe `warn` nach stderr geschrieben. **Kein Raten, keine Zuordnung zu einem
gleichnamigen Code eines anderen Pfades.** Dieselbe Rückfallregel greift, wenn ein Paar
zwar bekannt ist, aber der gelieferte Text zu keinem Muster der Klasse `special` passt.

**Die vier Sonderfälle, ausgeschrieben**, weil sie den Unterschied zwischen brauchbar und
ärgerlich machen:

- **Code 8 an `/reports/get/bwa` und `/reports/get/sums`** ist kein Fehler, sondern ein
  Zwischenstand: *„Die Auswertung wird noch erzeugt. Etwa zwei Sekunden warten und
  bb_reports_get_bwa mit denselben Argumenten erneut aufrufen. bb_reports_create_bwa nicht
  noch einmal aufrufen, das würde die laufende Erzeugung verwerfen."*
- **Code 7 an denselben Pfaden** nennt `bb_reports_create_bwa` als Vorbedingung und den
  Umstand, dass dieses Werkzeug bei aktivem `BB_MCP_READ_ONLY` gesperrt ist.
- **Code 12 an `/reports/create/*`:** Eine Erzeugung desselben Typs läuft bereits. Warten und
  abholen, nicht erneut erzeugen.
- **Code 12 an `/receipts/upload`, Code 33 an `/invoices/create*`:** Tarifkontingent, kein
  Rate Limit. Die Meldung sagt ausdrücklich, dass ein späterer Versuch nicht hilft.

### 5.7 Der Sonderfall: schreibender Aufruf ohne verwertbare Antwort

Der gefährlichste Zustand der ganzen Anwendung, mit eigenem Fehlertyp
(`errors/write-uncertainty.ts`). Auslöser: Zeitlimit, Netzwerkabbruch, HTTP 5xx oder HTTP 504
mit `error_code` 30 an einem Werkzeug der Klassen A, AR, M, D oder B. Der Text wird aus dem
Feld `verifyWith` des Registereintrags und den Argumenten des fehlgeschlagenen Aufrufs
erzeugt:

```
UNGEWISSER AUSGANG. bb_postings_create_free lief nach 30 s in das Zeitlimit,
während /postings/add/free aufgerufen wurde. BuchhaltungsButler hat die Buchung
möglicherweise angelegt, möglicherweise nicht; die API kennt keinen
Idempotenzschlüssel, deshalb hat dieser Server NICHT erneut gesendet.
bb_postings_create_free jetzt nicht noch einmal aufrufen.
Zuerst prüfen, ob die Buchung existiert: bb_postings_search aufrufen mit
date_from="2026-08-14", date_to="2026-08-14" und nach postingtext
"Büromaterial August" mit amount 1190.00 suchen.
Ist sie vorhanden, war der Aufruf erfolgreich und es ist nichts weiter zu tun.
Ist sie nicht vorhanden, darf der ursprüngliche Aufruf mit denselben Argumenten
wiederholt werden.
```

Vier Eigenschaften sind Absicht: Der Text behauptet keinen Fehlschlag, er nennt den Grund für
den fehlenden Retry, er nennt das Prüfwerkzeug **mit den konkreten Werten aus dem
fehlgeschlagenen Aufruf**, und er sagt **beide** Ausgänge der Prüfung durch. Ohne den letzten
Satz wiederholt ein vorsichtiger Agent gar nichts und ein unvorsichtiger sofort.

Für `/comments/add` und die drei Rechnungsendpunkte gibt es kein lesendes Gegenstück. Dort
steht im `verifyWith` ausdrücklich, dass die API keinen Leseweg anbietet und in der
Weboberfläche nachzusehen ist.

### 5.8 Aufbau jeder Fehlermeldung

Vier Blöcke, immer in dieser Reihenfolge, immer vorhanden:

Alle vier Blöcke sind **deutsch** (E4); Feldnamen, Werkzeugnamen und wörtlich zitierte
API-Meldungen bleiben im Original.

```
[Was]     <ein Satz, was schiefging>
[Warum]   <mit dem konkreten Wert, der das Problem verursacht hat>
[Wie]     <was stattdessen zu tun ist, als konkreter Aufruf>
[Zustand] <eine von genau drei Formulierungen, siehe unten>
```

**Der Zustandssatz ist Pflicht und kennt genau drei Formulierungen. Eine vierte ist
verboten**; `descriptions.test.ts` und die Einzeltests der Fehlerschicht prüfen das:

1. `Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.` — bei jeder
   Ablehnung vor dem Request, also durch jeden der sechs Guards.
2. `BuchhaltungsButler hat die Anfrage abgelehnt. Es wurde nichts geändert.` — bei einer
   Fehlerantwort mit `success: false`.
3. `Es ist UNBEKANNT, ob BuchhaltungsButler diese Anfrage verarbeitet hat.` — bei Zeitlimit,
   Verbindungsabbruch oder HTTP 5xx an einem **schreibenden** Werkzeug (5.7).

Die drei Sätze stehen als Konstanten an genau einer Stelle (`src/errors/render.ts`) und werden
nie neu formuliert. Der Test vergleicht zeichengenau gegen diese Konstanten; eine abweichende
Formulierung schlägt fehl, auch wenn sie inhaltlich dasselbe sagt.

Drei Pflichtangaben ergänzen den Aufbau:

- **Bei ungültigem Enum-Wert** nennt die Meldung alle erlaubten Werte und, wenn erkennbar,
  den wahrscheinlich gemeinten (Levenshtein-Abstand 1 oder 2).
- **Bei überschrittenen Grenzen** nennt die Meldung das billigere Aufrufmuster, nicht nur den
  korrigierten Wert.
- **Bei jeder Fehlerantwort der API steht deren eigenes `message`-Feld wörtlich in der
  Meldung**, als Fremdtext markiert und durch `response/sanitize.ts` geschickt. Der Block
  `[Was]` trägt die deutsche Einordnung aus dem Katalog (`summary`), der zitierte Fremdtext
  steht daneben und wird nicht durch einen Spezifikationstext ersetzt. Begründung: L6 hat
  gemessen, dass der gelieferte Text von **beiden** Spezifikationsquellen abweichen kann (5.6).
  Nur wenn die Antwort kein verwertbares `message` trägt, tritt der Katalogtext an seine Stelle,
  und dann mit dem Zusatz „Text laut Spezifikation, nicht der Wortlaut dieser Antwort".

**Ausführungsfehler gehen immer als `{ isError: true }` im Ergebnis zurück**, nie als
JSON-RPC-Protokollfehler. Protokollfehler bleiben echten Protokollproblemen vorbehalten:
unbekannter Werkzeugname, kaputtes JSON-RPC.

**Was nie in einen Fehlertext gelangt:** Zugangsdaten in jeder Form, der vollständige
Request-Body, Stacktraces, rohes HTML, Dateisystempfade aus einer Upload-Prüfung.
`config/redact.ts` läuft über **jede** ausgehende Zeichenkette und ersetzt jedes Vorkommen der
drei konfigurierten Werte durch `[redacted]`; `secrets.test.ts` prüft das.

---

## 6. Konfiguration und Umgebungsvariablen, endgültige Namen

### 6.1 Der Namenskonflikt, aufgelöst

`distribution.md` 13.2 nennt `BB_READ_ONLY`, `tool-design.md` 9.5 nennt `BB_MCP_READ_ONLY`.
**Kanonisch ist `BB_MCP_READ_ONLY`.** Begründung: Der in `tool-design.md` 9.5 wortwörtlich
vorgeschriebene Absagetext, der ausgeliefert wird, enthält diesen Namen. Eine Absage, die eine
Variable nennt, die es nicht gibt, ist schlimmer als ein längerer Variablenname.

`BB_READ_ONLY` wird weiterhin **akzeptiert**, erzeugt aber eine Warnung auf stderr und wird in
der README nicht mehr genannt. **Sind beide gesetzt und widersprechen sich, bricht der Server
beim Start ab** und nennt beide Variablen mit ihren Werten. Das folgt der Regel aus 6.4: Eine
widersprüchliche Konfiguration ist ein Betreiberirrtum, und ein Server, der sich für eine
Seite entscheidet, verbirgt genau das, was der Betreiber wissen muss. `distribution.md` 13.2
ist an dieser Stelle nachzuziehen.

Alle übrigen Variablen tragen das Präfix `BB_MCP_`, wenn sie das Verhalten **dieses Servers**
steuern, und das Präfix `BB_`, wenn sie die **Verbindung zur API** beschreiben. Das ist die
Regel, nach der die Tabelle gebaut ist, und sie steht so in der README.

### 6.2 Die vollständige Tabelle

| Variable | Bedeutung | Pflicht | Vorgabe |
| --- | --- | --- | --- |
| `BB_API_CLIENT` | API Client, Benutzername der Basic-Authentifizierung | ja | keine |
| `BB_API_SECRET` | API Secret, Passwort der Basic-Authentifizierung | ja | keine |
| `BB_API_KEY` | der `api_key` im Body; **wählt den Mandanten**, kein harmloser Bezeichner | ja | keine |
| `BB_BASE_URL` | Basis-URL. Muss `https:` sein; `http:` nur gegen `localhost` | nein | `https://webapp.buchhaltungsbutler.de/api/v1` |
| `BB_PROFILE` | Profilname in der Zugangsdatendatei | nein | `default` |
| `BB_CONFIG_DIR` | Ort der Zugangsdatendatei | nein | `${XDG_CONFIG_HOME:-~/.config}/buchhaltungsbutler-mcp`, Windows `%APPDATA%\buchhaltungsbutler-mcp` |
| `BB_MCP_READ_ONLY` | `true` beschränkt auf die 15 lesenden Endpunkte | nein | `false`, also **aus** |
| `BB_MCP_MAX_BATCH` | Obergrenze je Aufruf für **jedes** Stapel- und Positionsarray: die Behälter der acht Stapelendpunkte (`receipts`, `transactions`, `assignments`, `free_postings`, `debtors`, `creditors`) **und** die Positionslisten `positions` und `items`. Wirksam ist `min(50, BB_MCP_MAX_BATCH)`; die vollständige Werkzeugliste steht bei Q4 in 4.7. Zulässig 1 bis 50 | nein | `50` |
| `BB_MCP_MAX_AMOUNT` | Betragsgrenze für Werkzeuge der Klassen A und B mit Betragsfeld, als Dezimalzeichenkette | nein | nicht gesetzt, also aus |
| `BB_MCP_RATE_LIMIT` | Nachfüllrate des `default`-Eimers je Minute, 10 bis 100 | nein | `60` |
| `BB_MCP_TIMEOUT_MS` | Zeitlimit der Stufe „normal", mindestens 5000 | nein | `30000` |
| `BB_MCP_DUPLICATE_CHECK` | `on` oder `off`. Bei `on` setzt Guard 6 vor jedem anlegenden Aufruf einen **zusätzlichen** lesenden Request ab und verbraucht damit ein zweites Token aus dem Minutenkontingent des Mandanten | nein | **`off`**, also aus |
| `BB_MCP_MAX_RESPONSE_TOKENS` | weiche Kürzungsgrenze je Antwort | nein | `5000` |
| `BB_MCP_CACHE_TTL_MS` | Haltbarkeit des Stammdatenspeichers, `0` schaltet ihn ab | nein | `0`, also aus |
| `BB_MCP_UPLOAD_DIRS` | Liste erlaubter Verzeichnisse für `file://` als Belegquelle | nein | leer, also **kein** Dateisystemzugriff |
| `BB_MCP_UPLOAD_FROM_URL` | erlaubt `https://` als Belegquelle | nein | `false` |
| `BB_MCP_LOG_LEVEL` | `error`, `warn`, `info`, `debug`; Ausgabe ausschließlich stderr | nein | `warn` |

**Bewusst nicht gebaut**, damit die Konfigurationsfläche klein bleibt und ein Fehlerbericht
auswertbar ist:

- eine Variable, die den Retry für schreibende Aufrufe einschaltet (5.3),
- eine Variable, die den Nur-Lesen-Schalter zur Laufzeit umlegt (6.6),
- eine Variable, die Werkzeuge oder Werkzeuggruppen aus `tools/list` entfernt (12, S12),
- eine Kommandozeilenoption für irgendeinen der drei Geheimniswerte (6.3),
- eine Variable für die Sprache der Werkzeugbeschreibungen,
- ein zweites Konfigurationsdateiformat neben der Zugangsdatendatei.

### 6.3 Auflösungsreihenfolge

1. **Umgebungsvariablen.** Sind `BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` **alle
   drei** gesetzt, gelten sie, und die Zugangsdatendatei wird nicht gelesen.
2. **Zugangsdatendatei**, Profil aus `BB_PROFILE`, sonst `default`. Dateirechte `0600`,
   Verzeichnis `0700`. Sind die Rechte weiter, gibt es eine Warnung auf stderr mit Pfad und
   Korrekturbefehl, aber keinen Abbruch, weil Windows keine Entsprechung hat.
3. **Teilweise gesetzte Werte mischen sich nicht** mit der Datei. Das wäre eine Fehlerquelle,
   die niemand debuggt.
4. Fehlt danach ein Wert: Zustand **nicht konfiguriert**, siehe 6.5.

**Kommandozeilenargumente für Zugangsdaten gibt es nicht**, auch keine Option `--api-key`.
Was nicht existiert, kann niemand in eine Prozessliste, eine Shell-Historie oder eine
eingecheckte Konfigurationsdatei schreiben.

### 6.4 Startprüfung

`src/config/resolve.ts`, in dieser Reihenfolge, bevor der Transport geöffnet wird:

1. **Node-Version** gegen `engines.node` (13.1). Unterschreitung: Abbruch mit Rückgabewert 1
   und einer Zeile auf stderr, die gefundene und geforderte Version sowie den Weg zur
   Aktualisierung nennt.
2. **Unbekannte `BB_*`-Variablen.** Jede Variable mit dem Präfix `BB_`, die nicht in der
   Tabelle aus 6.2 steht, erzeugt eine Warnung auf stderr **mit dem nächstähnlichen bekannten
   Namen** (Levenshtein). Das fängt den häufigsten Einrichtungsfehler ab: einen Tippfehler in
   einer fremden JSON-Datei, der sonst still wirkungslos bleibt.
3. **Werteprüfung** aller übrigen Variablen gegen ein Zod-Schema. **Ein unbrauchbarer Wert
   führt zum Abbruch**, nicht zum stillen Zurückfallen auf die Vorgabe. Das ist der
   Unterschied zu Punkt 5: Eine fehlende Zugangsangabe ist ein Zustand, den der Nutzer
   erwartet und beheben kann; ein falsch geschriebener Grenzwert ist ein Irrtum, der unbemerkt
   eine Schutzschicht abschaltet. `BB_MCP_READ_ONLY=ture` darf nicht stillschweigend zu „aus"
   werden.
4. **Widersprüche.** `BB_MCP_READ_ONLY` und `BB_READ_ONLY` mit verschiedenen Werten: Abbruch
   (6.1).
5. **Zugangsdaten auflösen.** Fehlt einer der drei Werte, **startet der Server trotzdem**
   (6.5).
6. **Kein Verbindungsaufbau beim Start.** Der Server spricht erst beim ersten Werkzeugaufruf
   mit der API. Ein Verbindungstest beim Start kostet bei jedem Clientneustart einen Request
   aus dem Minutenkontingent des Mandanten, und der Client zeigt das Ergebnis ohnehin nirgends
   an. Für den bewussten Test gibt es `bbutler-mcp doctor` und `bbutler-mcp test`.
7. **Konfiguration einfrieren.** Das Konfigurationsobjekt wird `Object.freeze`-t und ist
   danach für den Rest der Prozesslaufzeit unveränderlich. Kein Werkzeug, kein Handler und
   keine Resource kann es ändern.

### 6.5 Verhalten bei fehlender Konfiguration

**Abweichung von `distribution.md` 13.2, begründet.** Das Dossier verlangt Abbruch. Aus der
Sicht des Agenten ist Abbruch die schlechteste Variante: Der Client meldet „Server konnte
nicht gestartet werden", der Agent sieht kein Werkzeug, kann dem Nutzer nichts sagen, und die
eigentliche Ursache steht in einer Protokolldatei, die niemand öffnet. Der Zielleser ist ein
Buchhalter, nicht ein Entwickler, der weiß, wo sein Client stderr hinschreibt.

Stattdessen:

1. Der Server **startet** und registriert alle 54 Werkzeuge.
2. Auf stderr erscheint sofort eine deutliche, mehrzeilige Warnung mit der Liste der fehlenden
   Werte und den zwei Wegen, sie zu setzen. Das ist kein stiller Start.
3. Die `instructions` beginnen mit: `NICHT KONFIGURIERT. Es wurden keine Zugangsdaten für
   BuchhaltungsButler gefunden. Jeder Werkzeugaufruf scheitert, bis der Server mit
   Zugangsdaten neu gestartet wird. Den Nutzer bitten, auszuführen:
   npx -y @dennismenken/buchhaltungsbutler-mcp setup`
4. Jeder Werkzeugaufruf antwortet mit `isError: true` und:

```
bb_receipts_search ist nicht ausführbar: Dieser Server hat keine Zugangsdaten für
BuchhaltungsButler.
Es fehlen: BB_API_SECRET, BB_API_KEY. BB_API_CLIENT ist gesetzt.
Es ging nichts an BuchhaltungsButler hinaus, und es wurde nichts geändert.
Den Nutzer bitten, "npx -y @dennismenken/buchhaltungsbutler-mcp setup" auszuführen
oder BB_API_CLIENT, BB_API_SECRET und BB_API_KEY in der MCP-Serverkonfiguration
seines Clients zu setzen und den Client danach neu zu starten. Die Zugangsdaten
werden einmal beim Serverstart gelesen.
Keine anderen Werkzeuge dieses Servers ausprobieren; sie scheitern alle auf
dieselbe Weise.
```

**Welcher Wert fehlt, wird genannt; kein Wert wird angezeigt**, auch nicht gekürzt oder
maskiert. Der letzte Satz verhindert, dass ein hartnäckiger Agent 54 Werkzeuge durchprobiert.

**Folge für den Paketprobelauf** (9.6): Der Server bricht in diesem Fall **nicht** mit
Rückgabewert 1 ab. Der entsprechende Schritt des Probelaufs prüft deshalb zwei Dinge getrennt:
`bbutler-mcp test` ohne Zugangsdaten liefert Rückgabewert 1, und `bbutler-mcp` ohne
Zugangsdaten startet, beantwortet `tools/list` mit 54 Einträgen und liefert auf jeden
`tools/call` genau den Text oben.

### 6.6 Der optionale Nur-Lesen-Schalter

Genau nach `tool-design.md` 9.5, mit den für 54 Werkzeuge angepassten Zahlen:

- **Standard `false`.** Nach der Installation sind alle 54 Werkzeuge sofort aufrufbar (E2).
- Bei `true` führt der Server nur die **15** Werkzeuge der Klasse R aus. Die übrigen **39**
  lehnen ab, **bevor** ein Request abgeht.
- Die Klasse kommt aus `classes.ts`, nicht aus dem Namen und nicht aus einer zweiten
  Pfadliste. Verschiebt sich der Schnitt, verschiebt sich der Schalter mit.
- Der Schalter wird **nur beim Start gelesen** und ist zur Laufzeit nicht änderbar, auch nicht
  durch ein Werkzeug. Sonst wäre er kein Schutz, sondern eine Einstellung, die der Agent
  selbst umlegen kann.
- **Gesperrte Werkzeuge bleiben in `tools/list` sichtbar.** Die Werkzeugliste hängt von keinem
  Schalter ab und ist über die gesamte Verbindung stabil. Ein Agent, der ein Werkzeug nicht
  sieht, schließt auf eine fehlende Fähigkeit und sucht Umwege; ein Agent, der eine klare
  Absage liest, kann sie dem Nutzer erklären.
- **Der Absagetext folgt `tool-design.md` 9.5 in Inhalt und Aufbau, wird aber auf Deutsch
  ausgeliefert** (E4, 4.9). Er nennt den jeweiligen Werkzeugnamen, die Variable
  `BB_MCP_READ_ONLY` mit ihrem Zielwert, den Zustandssatz 1 aus 5.8 und schließt mit dem Satz
  „Keine anderen Werkzeuge dieses Servers ausprobieren, um das zu umgehen." Das ist die
  Entsprechung zu „Do not try other tools of this server to work around it." Die Abweichung
  vom Wortlaut des Dossiers ist damit benannt; eine englische Absage inmitten von 54 deutschen
  Beschreibungen wäre der größere Bruch.
- **`bb_reports_create_bwa` und `bb_reports_create_sums` sind eingeschlossen**, obwohl sie
  keinen Buchungsbestand ändern. Sie ersetzen den Vorgängerbericht, und ein Server mit
  ausdrücklichem Schreibverbot, der fremde Berichte überschreibt, bricht seine Zusage.
- **Folge für Berichte:** Bei aktivem Schalter liefert nur `bb_reports_get_ledger` eine
  Auswertung ohne Vorbedingung. BWA und Summen- und Saldenliste brauchen den gesperrten ersten
  Schritt. Das steht wörtlich in den `instructions`, in der README und in den Beschreibungen
  von `bb_reports_get_bwa` und `bb_reports_get_sums`.

### 6.7 Die `instructions` des Servers

Rund 6.000 Zeichen, Budget 2.100 Token (4.10). **Auf Deutsch** (E4), mit echten Umlauten, ohne
Emojis; Feldnamen, Werkzeugnamen und Enum-Werte unverändert im Original. Das einzige Dokument,
das jeder Agent ohnehin sieht. Aufbau, verbindlich:

1. **Zustand.** Konfiguriert oder nicht. Nur-Lesen-Schalter an oder aus. Betrags- und
   Stapelgrenzen, falls gesetzt. Stammdatenspeicher an oder aus. **Duplikatsprüfung an oder
   aus**, und bei „an" der Satz, dass jeder anlegende Aufruf dann einen zusätzlichen lesenden
   Request aus dem Minutenkontingent des Mandanten verbraucht. Damit ist der einzige
   Zusatzaufruf des Servers deklariert, ohne ihn in 54 Beschreibungen zu wiederholen (E1).
2. **Was dieser Server ist.** Inoffiziell, arbeitet auf dem echten Mandanten, 54 Werkzeuge,
   eines je API-Endpunkt, 39 davon schreibend.
3. **Kontenkunde in fünf Zeilen.** Zahlungskonto gegen Sachkonto gegen Debitor gegen
   Kreditor, mit den beiden Nachschlagewerkzeugen (3.4).
4. **Querschnittsregeln.** Datumsformat `YYYY-MM-DD`; leere Strings werden abgelehnt, also
   Felder weglassen; Beträge beim Senden als Zahl mit Punkt, beim Lesen als String;
   Booleans kommen als `"0"` und `"1"` zurück und werden zu echten Booleans normalisiert;
   `id_by_customer` ist je Mandant fortlaufend und keine globale Kennung; die Zeitzone der
   Datumsfelder ist in keiner Quelle dokumentiert, Werte werden unverändert durchgereicht.
5. **Paginierungsregel.** Die API nennt keine Gesamttrefferzahl. `rows` ist die Zeilenzahl
   **dieser** Antwort. Eine volle Seite bedeutet, dass es mehr geben kann.
6. **Wegweiser durch die zwölf Buchungswerkzeuge** (3.7).
7. **Schreibhinweis.** Dieser Server fragt nicht nach. Die Freigabe liegt beim Client. Vor
   einem löschenden oder buchenden Aufruf sollen die betroffenen Datensätze erst gelesen und
   dem Nutzer vorgelegt werden.
8. **Liste der vier Resources** (7.7).

---

## 7. Antwortaufbereitung und Paginierung

### 7.1 Beides, strukturiert und als Text

Jede erfolgreiche Antwort trägt `structuredContent` **und** einen `content`-Textblock. Der
Textblock ist nicht redundant: Er ist das, was ein Client ohne
`structuredContent`-Unterstützung anzeigt, und das, was der Nutzer im Freigabedialog und im
Verlauf liest. Beide werden aus **derselben** Datenstruktur erzeugt, damit sie nicht
auseinanderlaufen.

| Fall | `structuredContent` | `content` |
| --- | --- | --- |
| Liste | `{ endpoint, rows_returned, limit_used, offset_used, more_possible, items: [...] }` | Markdown-Tabelle, Bestandszeile, Anschlusshinweis |
| Einzelobjekt | das Objekt, normalisiert | lesbare Aufzählung |
| Schreiben | `{ endpoint, created: [...], reversal: {...}, duplicate_hint?: {...} }` | Satz, aufgelöste Tabelle, Umkehrweg |
| Bericht | `{ endpoint, report_id_by_customer, period, sums: {...} }` | Kopfzahlen, Hinweis auf `get_files` |
| Fehler | **keines** | Vierblock-Text, `isError: true` |

**`outputSchema` wird bei allen 54 Werkzeugen gesetzt, aber niemals geschlossen.** Jedes
Ausgabeschema trägt `additionalProperties: true`, und die Pflichtfelder beschränken sich auf
`success` und den Datenbehälter. Begründung, live belegt (L4): `/receipts/get` liefert
`amount_paid` und `amount_paid_fixed`, die in der Spezifikation nicht stehen. Ein
geschlossenes Ausgabeschema würde beim nächsten Feld, das BuchhaltungsButler ergänzt, jeden
Aufruf scheitern lassen, und zwar bei allen Nutzern gleichzeitig. Feldbeschreibungen entfallen
(Sparmaßnahme S6); Feldnamen und Typen genügen.

### 7.2 Der Antwortvertrag gilt je Endpunkt, nicht je Fachobjekt

Das ist die folgenreichste Entscheidung dieses Abschnitts, und sie ist gemessen begründet
(L2, L3): Derselbe Sachverhalt trägt je Endpunkt andere Feldnamen
(`delivery_date` gegen `date_delivery`, `due_date` gegen `date_payment_due`), der Einzelabruf
liefert `data` als Objekt ohne `rows`, die Feldmengen unterscheiden sich erheblich (16 gegen
23 bei Belegen, 6 gegen 13 bei Zahlungen), und dieselbe Kennung ist bei `receipts` ein String
und bei `transactions` eine Zahl.

**Wer einen gemeinsamen `Receipt`-Typ baut, produziert einen stillen Datenfehler:** Ein
`due_date`, das beim Einzelabruf immer `undefined` ist, sieht aus wie „keine Fälligkeit" und
ist in Wahrheit „falscher Feldname". In einer Buchhaltung ist das der Unterschied zwischen
einer richtigen und einer falschen Mahnliste.

Deshalb trägt jeder Registereintrag ein eigenes `responseContract` mit den **gemessenen oder
dokumentierten** Feldnamen und Typen des betreffenden Endpunkts. Für die vier von uns
gemessenen Endpunkte sind die Feldmengen aus 0.3 verbindlich einzutragen; für die übrigen
elf lesenden Endpunkte wird der Vertrag beim Schreiben des Eintrags aus den Dossiers
übernommen und durch den Vertragslauf (9.7) beim ersten Durchgang korrigiert.

**Zwei Einzelheiten, die dabei regelmäßig verloren gehen, deshalb hier ausdrücklich:**

- **Der Belegeinzelabruf liefert Felder, die der Listenabruf nicht kennt.** `amount_original`
  und `currency_original`, die Fremdwährungsfelder, stehen im Vertrag von `bb_receipts_get`
  und **nicht** in dem von `bb_receipts_search`. Die Spezifikation führt beide überhaupt nicht
  (L2, L4, `live-befunde-orchestrator.md` Befund 2). Wer den Vertrag des Listenabrufs kopiert,
  erzeugt dort zwei `_contract_warnings` je Aufruf und verliert zugleich die einzige Stelle, an
  der die Fremdwährung sichtbar wird.
- **Die vier Werkzeuge mit Pfadvorlage tragen den Vertrag zu ihrem eigenen Pfad**, nicht zu dem
  des Listenwerkzeugs derselben Ressource, und ihre `shape` ist `object` ohne `rows` (L2). Der
  Vertrag hängt am Eintrag, nicht am gebauten Pfad; der wechselt je Aufruf (4.6).

### 7.3 Was passiert, wenn die API etwas Unerwartetes liefert

| Fall | Behandlung |
| --- | --- |
| Antwort ist kein JSON | `isError: true`, Meldung nennt HTTP-Status, Content-Type und die ersten 200 Zeichen ohne Markup, als Fremdtext markiert |
| Umschlag ohne `success` | `isError: true`, Umschlagbruch, mit der gesehenen Schlüsselmenge |
| Antwortform weicht von `shape` ab (`list` erwartet, `object` bekommen) | `isError: true`, mit der Angabe, was erwartet und was gesehen wurde |
| **Ein bekanntes Feld fehlt oder hat den falschen Typ** | **kein** `isError`. Die Antwort wird geliefert, aber `structuredContent` trägt zusätzlich `_contract_warnings: [{ field, expected, seen }]`, und der Textblock beginnt mit einer Warnzeile. Zusätzlich eine Zeile mit Stufe `warn` auf stderr |
| Ein unbekanntes Feld ist vorhanden | unverändert durchgereicht und gezählt, kein Fehler. Bei `BB_MCP_LOG_LEVEL=debug` einmal je Prozesslauf auf stderr gemeldet |

Der vierte Fall ist die wichtigste Einzelentscheidung. Er ist **kein** Fehler, weil die
Spezifikation nachweislich falsch ist und ein harter Abbruch den Server bei jeder kleinen
Anbieteränderung unbrauchbar machen würde. Er ist aber auch **nicht stumm**, weil genau hier
die falschen Zahlen entstehen. Die Warnung geht in **dieselbe Antwort, die der Agent liest**,
nicht nur ins stderr-Protokoll, das kein Modell sieht.

### 7.4 Normalisierung und Feldauswahl

**Typnormalisierung**, deterministisch, an genau einer Stelle (`mapping/coerce.ts`):

| Rohwert der API | In `structuredContent` | Begründung |
| --- | --- | --- |
| `"884.65"` (Betrag als String) | unverändert `"884.65"` als **String**, zusätzlich `amount_cents: 88465` als **Ganzzahl** | Eine Gleitkommazahl für Geld ist ein Fehler, und eine stille Rundung in der Buchhaltung ist der schlimmste denkbare Ausgang. Die Rohzeichenkette bleibt führend; das Cent-Feld gibt es, weil der Agent Summen bilden muss und `parseFloat` genau dort danebengreift. **Es wird niemals ein `number`-Betragsfeld erzeugt.** |
| `"0"` / `"1"` bei `deleted` und ähnlichen | echtes `false` / `true` | Ein Modell, das `deleted: "0"` liest, muss raten. Jede so normalisierte Eigenschaft ist im `outputSchema` als „normalized from string 0/1" gekennzeichnet |
| `"2"` bei `/receipts/*`, `2` bei `/transactions/*` | immer **String** | Kennungen sind Bezeichner, keine Rechengrößen. Eine einheitliche Form verhindert, dass ein Vergleich `"2" === 2` fehlschlägt. Beim **Senden** erwartet die API eine Ganzzahl; das Eingabeschema ist deshalb `integer`, und die Parameterbeschreibung sagt wörtlich: „In Suchergebnissen erscheint sie als String; hier ohne Anführungszeichen übergeben." |
| `null` | `null`, nicht weggelassen und nicht zu `""` | „nicht gesetzt" und „leer" sind fachlich verschieden |
| unbekanntes Feld | unverändert durchgereicht, gezählt | die Spezifikation ist unvollständig; Verwerfen wäre Datenverlust |

**Nicht normalisiert werden:** Datumszeichenketten (durchreichen, nicht in eine Zeitzone
umrechnen, weil keine Quelle eine Zeitzone nennt), Währungskürzel, Freitext.

**Feldnamen bleiben im Original.** Kein `Title Case`, keine Übersetzung, keine Verschönerung.
Der Feldname der Antwort ist der Parametername des nächsten Aufrufs; wer `id_by_customer` zu
`Id By Customer` macht, nimmt dem Modell diese Information.

**`response_format` mit `concise` und `detailed`**, `default "concise"`, bei jedem lesenden
Werkzeug. Das Feld wird **nicht** an die API gesendet; die Beschreibung sagt das. Warum das
hier mehr zählt als anderswo: `/postings/get` liefert rund 38 Felder je Buchung, darunter
zwölf `receipts_assigned_*`-Felder. Eine Seite mit 100 Buchungen im Rohformat ist ein
Kontextfresser ersten Ranges.

Die `concise`-Listen stehen je Registereintrag im Feld `concise`. **Sie sind bei den vier in
0.3 gemessenen Endpunkten aus gemessenen Feldnamen gebaut, bei den übrigen aus den Feldtabellen
der Dossiers übernommen und durch den Vertragslauf (9.7, AP17) zu bestätigen.** Jede Zeile nennt
ihre Belegstelle; **jeder Eintrag der Spalte ist ein exakter API-Feldname**, keine Umschreibung,
weil `concise: string[]` (2.1) genau diese Namen erwartet und P13 (9.2) sie gegen
`responseContract.fields` desselben Eintrags aufrechnet.

| Werkzeug | `concise` liefert | Belegstelle |
| --- | --- | --- |
| `bb_receipts_search` | `id_by_customer`, `date`, `counterparty`, `invoicenumber`, `amount`, `payment_date`, `due_date`, `account`, `amount_paid`, `deleted` | **gemessen**, 0.3 L2 (Liste, 16 Felder) |
| `bb_receipts_get` | `id_by_customer`, `date`, `counterparty`, `invoicenumber`, `amount`, `currency`, `vat`, `account`, `type`, `payment_date`, `date_payment_due`, `deleted` | **gemessen**, 0.3 L2 (Einzelabruf, 23 Felder) |
| `bb_transactions_search` | `id_by_customer`, `to_from`, `amount`, `booking_date`, `value_date`, `purpose` — das sind alle sechs gelieferten Felder; eine Projektion wäre hier sinnlos | **gemessen**, 0.3 L2 |
| `bb_transactions_get` | `id_by_customer`, `account`, `to_from`, `booking_date`, `value_date`, `amount`, `currency`, `purpose` | **gemessen**, 0.3 L2 (Einzelabruf, 13 Felder) |
| `bb_postings_search` | `id_by_customer`, `date`, `postingtext`, `amount`, `debit_postingaccount_number`, `credit_postingaccount_number`, `tax_key`, `fixed`, `receipt_id_by_customer` | `docs/api/buchungen.md` 9.2 (38 live beobachtete Felder) |
| `bb_postingaccounts_search` | `postingaccount_number`, `name`, **`type`**, **`subtype`** | `docs/api/stammdaten.md`, `/settings/get/postingaccounts`, Erfolgsantwort |
| `bb_payment_accounts_list` | `postingaccount_number`, `name` (das sind alle Felder) | `docs/api/stammdaten.md`, `/accounts/get`, Erfolgsantwort |
| `bb_debtors_search`, `bb_creditors_search` | `postingaccount_number`, `name`, `customer_number`, `city` | `docs/api/stammdaten.md`, `/settings/get/debtors` und `/settings/get/creditors`, Erfolgsantwort |
| `bb_cost_locations_search` | `code`, `name` | `docs/api/stammdaten.md`, `/cost-locations/get`, Erfolgsantwort |

**Drei Feinheiten der Tabelle, damit fünf Bearbeiter nicht auseinanderlaufen:**

- Bei `bb_postings_search` heißen Soll- und Habenkonto in der **Antwort**
  `debit_postingaccount_number` und `credit_postingaccount_number`. Die Namen
  `postingaccount_debit` und `postingaccount_credit` gehören zum **Eingabe**schema von
  `/postings/add/free` und stehen in keiner Antwort. Der Steuerschlüssel ist `tax_key`
  (numerisch); das Feld `vat` desselben Endpunkts ist der Steuer**satz** in Prozent und gehört
  nicht in die Projektion.
- `customer_number` ist bei Debitoren und Kreditoren live vorhanden, steht aber **nicht** in der
  Spezifikation; bei Kreditoren war es live durchgehend `null`. Es bleibt in der Projektion,
  weil es die fachliche Kundennummer trägt, und es steht deshalb auch im `responseContract`.
- `bb_cost_locations_search` liefert genau zwei Felder; der `code` ist zugleich der
  Identifikator, eine numerische Kennung gibt es nicht.

`type` und `subtype` bleiben bei `bb_postingaccounts_search` **immer** in der Projektion; das
ist Maßnahme 4 aus 3.4 und nicht verhandelbar.

Zusätzlich wird aufgelöst, wo eine sprechende Bezeichnung vorliegt: statt
`postingaccount_number: "4980"` steht `postingaccount: "4980 Sonstiger Betriebsbedarf"`,
**sofern** der Kontenrahmen im Speicher liegt. **Die Rohnummer bleibt zusätzlich im Feld
stehen**, weil sie der Parameterwert des nächsten Aufrufs ist.

### 7.5 Paginierung

**Die zentrale Ehrlichkeitsregel: Es gibt keine Gesamttrefferzahl.** `rows` ist die Zeilenzahl
dieser Antwort (L5). Es gibt kein Feld für die Gesamtzahl, keinen Cursor, nur `limit` und
`offset`. Jede Formulierung wie „100 von 500" ist eine Lüge: Wer `rows` für die Gesamtzahl
hält, meldet dem Aufrufer eine Vollständigkeit, die nicht belegt ist.

**Drei Zustände, drei Bestandszeilen, wörtlich und auf Deutsch** (E4):

```
100 Zeilen geliefert (limit=100, offset=0). Das ist die Zeilenzahl DIESER Antwort;
die BuchhaltungsButler-API nennt zu keinem Zeitpunkt eine Gesamttrefferzahl. Die
Antwort ist voll, es gibt also wahrscheinlich mehr: bb_receipts_search mit denselben
Filtern und offset=100 erneut aufrufen. Enger filtern über date_from/date_to oder
counterparty ist in der Regel billiger als blättern.
```

```
37 Zeilen geliefert (limit=100, offset=0). Weniger Zeilen als das limit, also ist das
das vollständige Ergebnis für diese Filter.
```

```
0 Zeilen geliefert. Entweder haben die Filter nichts getroffen, oder der offset liegt
hinter dem Ende des Ergebnisses. Das ist kein Fehler.
```

**Weitere Regeln:**

1. **`limit` wird immer explizit gesendet**, auch wenn der Aufrufer es weggelassen hat. Sonst
   greift bei `/settings/get/debtors` und `/settings/get/creditors` der Serverstandard 25, und
   25 Zeilen sehen aus wie das vollständige Ergebnis.
2. **Keine Auto-Paginierung.** Die Regel dahinter, ausgeschrieben statt verkürzt: **Ein
   Werkzeugaufruf setzt genau einen API-Aufruf für seine Fachfunktion ab. Jeder darüber
   hinausgehende Aufruf entsteht nur durch eine ausdrücklich eingeschaltete Zusatzfunktion,
   deren Zustand im Kopf der `instructions` steht** (6.7 Punkt 1). Im Auslieferungszustand ist
   keine solche Funktion eingeschaltet: Die Duplikatsabfrage ist aus (6.2), und die Auflösung
   der Schreibantwort erzeugt keinen zweiten Request (7.6). Eine Autopaginierung bricht diese
   Regel auf eine Weise, die der Aufrufer nicht abschätzen kann: Die Zahl der Aufrufe hängt
   vom Datenbestand ab, nicht von einer Einstellung, sie verbraucht ungefragt Minutenkontingent
   des Mandanten, und ihre Obergrenze erzeugt genau die Halbwahrheit, die dieser Plan
   vermeidet.
3. **Die Abbruchbedingung ist „weniger Zeilen als `limit`"**, nicht `rows`.
4. **`/accounts/get` kennt keine Paginierung** und liefert immer alles. Die Antwort sagt das
   ausdrücklich, damit der Agent nicht nach `offset` sucht.

**Die sieben Endpunkte mit `limit`/`offset`** (maschinell aus der Spezifikation ermittelt):

| Endpunkt | Standard der API | Unser `default` | `maximum` im Schema |
| --- | --- | --- | --- |
| `/receipts/get`, `/transactions/get` | 500 | 100 | 500 |
| `/postings/get` | keiner | 100 | 1000 |
| `/cost-locations/get` | keiner | 200 | 1000 |
| `/settings/get/debtors`, `/settings/get/creditors` | **25** | 100 | **kein `maximum` im Schema** |
| `/settings/get/postingaccounts` | 1000 | 200 | **kein `maximum` im Schema** |

**Warum bei den drei `settings`-Listen kein `maximum` gesetzt wird:** Die Obergrenze ist in der
Spezifikation nicht dokumentiert und **nicht verifiziert**. Ein zu enges `maximum` im Schema
lehnt gültige Aufrufe ab, bevor ein Request abgeht, und zwar unsichtbar. Ein fehlendes
`maximum` kostet im schlimmsten Fall einen abgelehnten Request, dessen Fehlermeldung die echte
Grenze nennt. Die Beschreibung sagt das wörtlich: *„Die API dokumentiert hier keine Obergrenze
für limit. Wird der Aufruf mit 'invalid limit specified' abgelehnt, den Wert halbieren."*
Sobald ein lesender Aufruf die Grenze klärt, wird das `maximum` nachgetragen.

### 7.6 Antworten schreibender Werkzeuge

Jede Antwort eines schreibenden Werkzeugs nennt:

- den benutzten Endpunkt,
- den angelegten, geänderten oder gelöschten Datensatz **aufgelöst**, also mit Datum, Betrag
  und Gegenpartei, nicht nur mit seiner Kennung,
- den Weg zurück, sofern es einen gibt, und ausdrücklich dessen Fehlen, wo es keinen gibt,
- bei anlegenden Werkzeugen das Ergebnis der Duplikatsabfrage, **sofern sie eingeschaltet ist**
  und ein Treffer vorlag (6.2).

Beispiel:

```
Buchung 8814 in den echten Buchhaltungsdaten des verbundenen Mandanten angelegt.
  date 2026-08-14 | amount 1190.00 EUR | Soll 4980 | Haben 1600 | vat 19_pre
Benutzter Endpunkt: /postings/add/free
Weg zurück: bb_postings_cancel mit posting_id_by_customer=8814.
            Ist die Buchung bereits festgeschrieben, entsteht dabei eine dauerhaft
            sichtbare Stornobuchung, statt dass sie entfernt wird.
```

**Die Auflösung setzt keinen zusätzlichen Request ab.** Sie speist sich ausschließlich aus zwei
Quellen: den Argumenten des Aufrufs, die der Server ohnehin hat, und den Feldern, die die API in
ihrer Schreibantwort mitliefert. **Wo die API den angelegten Datensatz nicht zurückgibt**, nennt
die Antwort die Werte aus den Argumenten, sagt ausdrücklich, dass die übrigen Felder nicht
zurückgemeldet wurden, und nennt das lesende Werkzeug, mit dem der Agent nachsehen kann, falls
er es braucht. Welche Felder eine Schreibantwort trägt, steht je Registereintrag im
`responseContract`.

Das ist eine Abkehr vom Entwurfsstand, der für die Auflösung „bei einigen Werkzeugen einen
zusätzlichen Leseaufruf" in Kauf nahm. Begründung: Ein solcher Aufruf ist für den Aufrufer
unsichtbar, verbraucht Minutenkontingent des Mandanten und widerspricht sowohl der Regel aus
7.5 Regel 2 als auch E1 („keine verborgene Logik"). Der Preis ist, dass eine Schreibantwort
gelegentlich weniger Felder zeigt als möglich wäre; der Gewinn ist, dass ein Werkzeugaufruf
bleibt, was er verspricht.

**Anschlusshinweise** erscheinen nur, wenn sie nicht offensichtlich sind, und nie als
Anweisung an das Modell formuliert, sondern als Befund mit Handlungsoption. **Auf Deutsch**
(E4), mit Feld- und Werkzeugnamen im Original:

| Situation | Hinweis |
| --- | --- |
| `bb_reports_create_bwa` erfolgreich | `Auswertung 42 wurde angefordert. Die Erzeugung läuft im Hintergrund. Abholen mit bb_reports_get_bwa und report_id_by_customer=42. Solange sie läuft, antwortet dieser Aufruf mit error_code 8; einige Sekunden warten und erneut abholen. bb_reports_create_bwa in der Zwischenzeit nicht noch einmal aufrufen, das würde diese Auswertung ersetzen.` |
| Schreiben erfolgreich, Duplikat gefunden (nur bei `BB_MCP_DUPLICATE_CHECK=on`) | `Ein Beleg mit gleichem Datum, gleichem Betrag und gleicher Gegenpartei existiert bereits (id_by_customer 8801). War dieser Aufruf eine Wiederholung nach einem Zeitlimit, ist damit ein Duplikat entstanden; den neuen Beleg mit bb_receipts_delete als gelöscht markieren.` |
| `bb_postings_cancel` auf festgeschriebener Buchung | `Buchung 8814 war festgeschrieben und wurde deshalb nicht entfernt. Stattdessen ist eine Stornobuchung entstanden, die dauerhaft in der Historie sichtbar bleibt.` |
| `bb_postingaccounts_search` liefert eine volle Seite | `Eine volle Seite wurde geliefert; dieser Mandant kann mehr Konten haben als hier zu sehen. Die Liste mischt Sachkonten, Zahlungskonten, Debitoren und Kreditoren; über die Spalte type filtern.` |

**Kürzung.** Grenzen: weich `BB_MCP_MAX_RESPONSE_TOKENS` (Vorgabe 5.000 Token), hart 20.000
Token je Antwort, geschätzt über dieselbe Zeichenmethode wie in 4.10, also über die Konstante
`CHARS_PER_TOKEN` aus `src/registry/budget.ts`. **Zur Laufzeit wird kein Tokenizer geladen**
(4.10, 13.2). Die Richtung der
Ungenauigkeit ist bewusst gewählt: Eine Schätzung, die zu früh kürzt, ist harmlos; eine, die
zu spät kürzt, sprengt das Kontextfenster des Clients. Bei Kürzung:

```
120 von 281 gelieferten Zeilen werden angezeigt; der Rest wurde weggelassen, um im
Antwortbudget zu bleiben (rund 5000 Token). Auf Seiten der API ist nichts verloren
gegangen. Um den Rest zu sehen, enger filtern oder response_format="concise" setzen.
```

**Base64-Inhalte** (`file_content`, `file_pdf`, `file_csv`, ZIP-Archive) erscheinen **niemals**
im Textblock. Dort steht nur „PDF, 412 KB, im strukturierten Teil der Antwort". Hat der
Aufrufer die Datei nicht ausdrücklich angefordert, wird sie auch im `structuredContent` durch
einen Platzhalter mit Größenangabe ersetzt.

**Freitext aus der API** (`counterparty`, `purpose`, `booking_text`, Kommentartexte,
Belegdateinamen) stammt von Dritten. `response/sanitize.ts` entfernt Steuer- und
Bidi-Zeichen, ersetzt Zeilenumbrüche in Tabellenzellen durch Leerzeichen, neutralisiert
Pipe-Zeichen und setzt den Text nie in einen Codeblock, eine Überschrift oder eine Form, die
wie eine Anweisung an das Modell aussieht.

### 7.7 Die vier MCP-Resources

Sie kosten nur dann Kontext, wenn der Agent sie liest, und nehmen genau die Inhalte auf, die
sonst 54-mal in Beschreibungen stünden.

| URI | Inhalt |
| --- | --- |
| `bb://guide/accounts` | Kontenkunde: Zahlungskonto, Sachkonto, Debitor, Kreditor, welches Feld welche Nummer erwartet, welches Werkzeug nachschlägt (3.4) |
| `bb://guide/postings` | der Wegweiser durch die zwölf Buchungswerkzeuge (3.7) |
| `bb://vat-keys` | die 23 Umsatzsteuerschlüssel mit deutschen Labels |
| `bb://postingaccounts` | der Kontenrahmen des Mandanten, erzeugt aus `/settings/get/postingaccounts`, nur wenn der Stammdatenspeicher eingeschaltet ist; sonst meldet die Resource, dass sie abgeschaltet ist, und nennt das Werkzeug |

### 7.8 Der optionale Stammdatenspeicher

Standardmäßig **aus** (`BB_MCP_CACHE_TTL_MS=0`). Begründung: Ein veralteter Stammdatensatz ist
in einer Buchhaltung ein schwer zu findender Fehler, und die Ersparnis lohnt erst, wenn ein
Agent in einer Schleife nachschlägt. Der Schalter ist da, wenn das Minutenlimit drückt; er
drängt sich niemandem auf. **`/accounts/get` und alle Bewegungsdaten werden nie
zwischengespeichert.**

Die Invalidierungstabelle steht im Register (`invalidatesCache`), nicht im Cache-Modul, damit
sie beim Nachrüsten eines Endpunkts an derselben Stelle liegt wie alles andere:

| Gespeichertes Werkzeug | Invalidiert durch |
| --- | --- |
| `bb_postingaccounts_search` | `bb_postingaccounts_create`, `bb_postingaccounts_update`, **und zusätzlich jedes Debitoren- und Kreditorenwerkzeug** |
| `bb_debtors_search` | `bb_debtors_create`, `bb_debtors_create_batch`, `bb_debtors_update` |
| `bb_creditors_search` | `bb_creditors_create`, `bb_creditors_create_batch`, `bb_creditors_update` |
| `bb_cost_locations_search` | `bb_cost_locations_create`, `bb_cost_locations_update`, `bb_cost_locations_delete` |

Die erste Zeile ist der nicht offensichtliche Teil: `/settings/get/postingaccounts` liefert
Sachkonten **einschließlich** Debitoren und Kreditoren. Wer einen Debitor anlegt und danach
den zwischengespeicherten Sachkontenstand liest, sieht ihn nicht.

**`bb_payment_accounts_list` steht bewusst nicht in dieser Tabelle.** Es ist das Werkzeug zu
`/accounts/get`, und für `/accounts/get` gilt der Satz oben ohne Ausnahme: nie
zwischenspeichern. Der Entwurfsstand führte das Werkzeug in der Tabelle und stand damit im
Widerspruch zu seinem eigenen Absatz; aufgelöst zugunsten des Satzes, weil die Kontenliste des
Mandanten die Grundlage jeder Zahlungszuordnung ist und ein veralteter Stand hier am teuersten
wäre. **Folge:** `bb_payment_accounts_create` trägt ein leeres `invalidatesCache`, und
`bb_payment_accounts_list` wird auch bei eingeschaltetem Speicher immer frisch geholt.

**Wo der Speicher im Ausführungspfad liegt**, damit nicht offenbleibt, wer ihn befragt (1.4):

1. **Befragt** wird er im generischen Handler **nach** allen Guards und **vor** dem
   Rate-Limiter, und ausschließlich bei den vier Werkzeugen der Tabelle oben. Bei einem Treffer
   geht **kein** Request hinaus, und es wird auch kein Token entnommen.
2. **Ein Treffer wird in der Antwort ausgewiesen**, im Textblock wie in
   `structuredContent`: *„Aus dem Stammdatenspeicher dieses Serverprozesses, abgelegt vor 43
   Sekunden. Frisch holen: Serverprozess neu starten oder `BB_MCP_CACHE_TTL_MS=0` setzen."* Ein
   stillschweigend aus dem Speicher beantworteter Aufruf wäre genau die verborgene Logik, die
   E1 ausschließt.
3. **Gefüllt** wird er nach einer erfolgreichen Antwort desselben Werkzeugs, **verworfen** nach
   einer erfolgreichen Antwort jedes Werkzeugs, das in `invalidatesCache` steht. Bei
   ungewissem Ausgang (5.7) wird ebenfalls verworfen: Lieber einmal zu viel frisch geholt als
   ein Stand, der eine womöglich erfolgte Änderung nicht kennt.
4. **Die Regel aus 7.5 Regel 2 bleibt unberührt.** Sie verbietet **zusätzliche** Aufrufe, nicht
   ersparte; ein Treffer macht aus einem Aufruf null, nie zwei.
5. **Der Speicher ist prozesslokal und überlebt keinen Neustart.** Zwei Clients teilen ihn
   nicht, und es wird nichts auf die Platte geschrieben.

---

## 8. Einrichtungsassistent

### 8.1 Befehlsform

Binärname **`bbutler-mcp`**, genau ein `bin`-Eintrag. **Ohne Unterbefehl startet der
MCP-Server auf stdio.** Das ist der Normalfall und der Grund, warum in allen
Clientkonfigurationen hinter dem Paketnamen kein Argument steht.

| Aufruf | Wirkung |
| --- | --- |
| `bbutler-mcp` | startet den MCP-Server auf stdio |
| `bbutler-mcp setup` | Einrichtungsassistent, neun Schritte |
| `bbutler-mcp doctor` | Diagnose: Zugangsdaten auflösen, Verbindung testen, Rechte prüfen, Clientkonfigurationen auflisten |
| `bbutler-mcp test` | nur der Verbindungstest, Rückgabewert 0 oder 1, für CI und Skripte |
| `bbutler-mcp profiles list\|add\|remove` | Mandantenprofile in der Zugangsdatendatei |
| `bbutler-mcp print-config --client <name>` | den fertigen Block ausgeben, nichts schreiben |
| `bbutler-mcp uninstall --client <name>` | den eigenen Eintrag beim genannten Client entfernen |
| `bbutler-mcp --version`, `--help` | Version, Hilfe mit der Liste der Clientkürzel |

Clientkürzel: `claude-code`, `claude-desktop`, `codex`, `grok`, `vscode`, `cursor`,
`windsurf`, `lmstudio`, `cline`, `zed`, `continue`, `jan`.

**Jeder Unterbefehl schreibt ausschließlich auf stdout und stderr eines Terminals**, niemals
in eine laufende MCP-Verbindung. Die Unterbefehle werden **dynamisch importiert**; ein
Serverstart lädt keine Zeile CLI-Code. **Kein Unterbefehl nimmt ein Geheimnis als Argument
entgegen.** Im nicht interaktiven Betrieb liest der Assistent Zugangsdaten ausschließlich aus
den drei Umgebungsvariablen.

Nicht interaktiv, für Skripte:

```bash
npx -y @dennismenken/buchhaltungsbutler-mcp setup \
  --client claude-code --scope user --start npx --non-interactive --print-only
```

### 8.2 Ablauf, neun Schritte

1. **Vorprüfung.** Node-Version gegen `engines.node` (13.1), Abbruch bei Unterschreitung.
   Danach erkennen, welche Clients vorhanden sind: über `which`/`where` für `claude`, `codex`,
   `grok`, `code`; über die Existenz der bekannten Konfigurationspfade für Claude Desktop,
   Cursor, Windsurf, LM Studio, Cline. Gefundene Clients stehen oben, die übrigen unter
   „Weitere".
2. **Zugangsdaten erfragen.** Drei maskierte Eingaben. Dazu der Hinweis, wo die Werte in
   BuchhaltungsButler stehen: Einstellungen, Schnittstellen und API-Zugang. **Die Quellen
   widersprechen sich in der Menüführung**, deshalb nennt der Assistent **beide** genannten
   Orte und behauptet nicht, es gäbe nur einen. Bereits gesetzte Umgebungsvariablen werden als
   Vorbelegung erkannt und angeboten, **ohne den Wert anzuzeigen**.
3. **Verbindung testen.** Genau **ein** lesender Aufruf gegen `/accounts/get`, die leichteste
   Leseoperation der API. Die Deutung trennt die drei Werte auseinander, denn genau darin
   liegt der Nutzen des Assistenten:

   | Ergebnis | Klartext |
   | --- | --- |
   | 200, `success: true` | Zugangsdaten vollständig gültig; die Zahl der gefundenen Zahlungskonten wird genannt |
   | 401, `error_code` 3 | API Client oder API Secret ist falsch. Der `api_key` wurde damit noch nicht geprüft |
   | 401, `error_code` 4 | Client und Secret stimmen, aber der `api_key` gehört nicht dazu, oder dieser Client darf diesen Mandanten nicht bedienen |
   | 403, `error_code` 11 | Der Mandant hat keinen aktiven Status. Kein Konfigurationsfehler, sondern ein Kontostand |
   | 403, `error_code` 15 oder HTTP 429 | Drosselung, später erneut versuchen |
   | Antwort nicht JSON | falsche Basis-URL, Proxy oder Portal davor; der Assistent nennt `HTTPS_PROXY` und die Zieldomain und zeigt die ersten 200 Zeichen |
   | Netzwerkfehler | Verbindung zu `webapp.buchhaltungsbutler.de` prüfen |

4. **Mandant bestätigen, mit dem verfügbaren Mittel.** `distribution.md` 14.2 sieht vor, den
   Anzeigenamen des Mandanten aus der Antwort zu holen. **Das geht nicht:** `/accounts/get`
   liefert je Zeile nur `name` und `postingaccount_number` und enthält keinen Mandantennamen
   (live belegt). Ersatz, der denselben Zweck erfüllt:

   ```
   Verbindung steht. Gefunden: 5 Zahlungskonten.
     1200  Bank
     1210  PayPal
     …
   Gehören diese Konten zu dem Mandanten, den Sie verbinden wollen? [j/n]
   ```

   Antwortet der Nutzer mit nein, ist der `api_key` der falsche, und der Assistent sagt genau
   das. **Das ist der einzige Schutz gegen den teuersten aller Einrichtungsfehler**, den
   `api_key` eines fremden Mandanten. `distribution.md` 14.2 ist an dieser Stelle nachzuziehen.
5. **Startvariante wählen.** `npx` als Vorgabe oder globale Installation. Bei globaler
   Installation ermittelt der Assistent den **absoluten Pfad** des Binaries und schreibt
   diesen, statt sich auf `PATH` zu verlassen; das ist der häufigste Fehlerfall bei
   Desktop-Anwendungen, die nicht aus einer Login-Shell starten. **Für Codex wird zusätzlich
   `startup_timeout_sec = 30` gesetzt**, weil die Vorgabe von 10 Sekunden für einen
   npx-Kaltstart knapp ist.
6. **Ablageort der Zugangsdaten wählen.** Drei Möglichkeiten: Zugangsdatendatei mit Rechten
   `0600` (Vorgabe und Empfehlung, die Clientkonfiguration enthält dann kein Geheimnis);
   direkt in die Clientkonfiguration mit dem Hinweis, dass die Datei damit schutzbedürftig
   wird; oder gar nichts schreiben.
7. **Clients auswählen und Vorschau.** Mehrfachauswahl. Vor jedem Schreibvorgang werden
   vollständiger Pfad und einzufügender Block angezeigt, Geheimnisse maskiert. Vor jeder
   Änderung an einer bestehenden Datei legt der Assistent `<datei>.bak-<zeitstempel>` an und
   nennt den Pfad. **Bestehende Einträge werden nie ohne ausdrückliche Zustimmung
   überschrieben.**
8. **Abschluss und Verifikationsschritt.** Je Client eine Zeile, was noch zu tun ist: Claude
   Desktop vollständig beenden und neu starten, Cursor neu laden, VS Code den Server starten,
   Codex und Grok brauchen keinen Neustart. Dazu die Prüfzeile (`claude mcp get
   buchhaltungsbutler`) **und ein Satz, den der Nutzer in den Client tippen kann, um den
   Erfolg zu sehen:** „Liste meine Zahlungskonten in BuchhaltungsButler." Das ist der
   Unterschied zwischen „eingerichtet" und „nachweislich funktionierend".
9. **Ein Satz zum Nur-Lesen-Schalter.** Der Assistent fragt einmal: „Soll dieser Server
   zunächst nur lesen dürfen?" **Vorgabe nein** (E2). Bei „ja" wird `BB_MCP_READ_ONLY=true` in
   die erzeugte Konfiguration geschrieben, zusammen mit dem Hinweis, dass BWA und Summen- und
   Saldenliste dann nicht erzeugt werden können, das Kontenblatt aber schon.

### 8.3 Welche Clients der Assistent selbst konfiguriert

**Regel:** Wo eine offizielle CLI existiert, wird sie als Unterprozess aufgerufen, statt ein
Dateiformat nachzubauen. Wo nur eine Datei existiert und diese reines JSON ist, wird
geschrieben. Wo das Format Kommentare tragen kann oder der Pfad nicht dokumentiert ist, wird
der fertige Block ausgegeben. **Geraten wird nicht.** Jeder Adapter prüft vor dem Schreiben,
ob die Datei existiert, und gibt sonst nur aus.

| Client | Automatisch | Weg |
| --- | --- | --- |
| Claude Code | ja | `claude mcp add-json` |
| Codex CLI, ChatGPT-Desktop-App | ja | `codex mcp add`, mit `startup_timeout_sec = 30` |
| Grok Build (xAI) | ja | `grok mcp add` |
| VS Code mit Copilot | ja | `code --add-mcp`, oder `.vscode/mcp.json`, wenn `inputs` gebraucht wird |
| Claude Desktop | ja | `claude_desktop_config.json` lesen, ergänzen, zurückschreiben; zusätzlich das `.mcpb`-Bundle als zweiter Weg ohne Terminal |
| Cursor | ja | `~/.cursor/mcp.json` oder `.cursor/mcp.json` |
| Windsurf | ja | `~/.codeium/windsurf/mcp_config.json` |
| Cline (CLI) | ja | `~/.cline/mcp.json` |
| LM Studio | ja, mit Vorbehalt | `~/.lmstudio/mcp.json`; existiert der Pfad nicht, nur ausgeben |
| Zed | nein | `settings.json` ist JSONC mit Kommentaren |
| Continue | nein | YAML, Ablageort projektabhängig |
| Cline (IDE), Jan | nein | kein dokumentierter Dateipfad |
| ChatGPT im Browser | nein | technisch ausgeschlossen, mit Begründung im Text |

**Wie viele Adapterdateien daraus werden, verbindlich, weil sich Abschnitt 9.10 und AP15 hier
widersprochen haben:** Unter `src/cli/clients/` liegen **neun** eigene Adapter — `claude-code`,
`claude-desktop`, `codex`, `grok`, `vscode`, `cursor`, `windsurf`, `lmstudio`, `cline` —,
dazu **eine Sammeldatei `print-only.ts`** für Zed, Continue, Jan und alles Übrige sowie
`types.ts` mit der Schnittstelle. Das sind elf Dateien, neun Adapter und ein Sammeladapter.
Die **zwölf Clientkürzel** aus 8.1 verteilen sich darauf: neun auf die eigenen Adapter, drei
(`zed`, `continue`, `jan`) auf die Sammeldatei. Die Zeile „ChatGPT im Browser" hat kein Kürzel,
weil sie technisch ausgeschlossen ist. **Die früher genannte Zahl „zwölf Clientadapter"
verwechselte Kürzel mit Adaptern** und ist in 9.10 und AP15 berichtigt.

Die Pfade für LM Studio, Jan, Cline-IDE und Zed sind in `distribution.md` 16 als **nicht
verifiziert** geführt. Genau deshalb sind sie in der unteren Hälfte der Tabelle und schreiben
nichts, wo der Pfad fehlt.

### 8.4 `doctor`

Die Ausgabe ist das, was in einen Fehlerbericht gehört, und enthält **garantiert kein
Geheimnis**: Paketversion, Node-Version und Plattform; Auflösungsweg der Zugangsdaten (Quelle,
nicht Werte); welche der drei Werte gesetzt sind; Dateirechte der Zugangsdatendatei; Ergebnis
des Verbindungstests mit Deutung nach 8.2 Schritt 3; Schalterlage (`BB_MCP_READ_ONLY`,
`BB_MCP_MAX_BATCH`, `BB_MCP_MAX_AMOUNT`, `BB_MCP_CACHE_TTL_MS`, `BB_MCP_DUPLICATE_CHECK`);
Anzahl registrierter Werkzeuge nach Wirkung (15 lesend, 24 anlegend, 8 ändernd, 7 löschend);
**geschätzte** Tokengröße der Definitionen nach dem in AP14 gemessenen Zeichen-je-Token-
Verhältnis; gefundene Clientkonfigurationen mit Pfad; jede unbekannte `BB_*`-Variable mit dem
nächstähnlichen bekannten Namen.

**`doctor` misst die Tokenzahl nicht selbst und lädt keinen Tokenizer.** Es zählt die Zeichen
der 54 Definitionen und teilt durch die eingecheckte Konstante `CHARS_PER_TOKEN` aus
`src/registry/budget.ts` (4.10). Begründung: Ein Tokenizer im ausgelieferten Paket wäre eine
vierte Laufzeitabhängigkeit und widerspräche 13.2; der Tokenizer aus 13.3 ist ausdrücklich eine
**Entwicklungs**abhängigkeit und wird nur von P11 und `scripts/measure-tokens.ts` benutzt. Die
Ausgabezeile sagt das mit: *„Werkzeugdefinitionen: 96.798 Zeichen, geschätzt rund 30.250 Token
(Faktor 3,2 aus `budget.ts`; die genaue Zahl misst `pnpm measure-tokens`)."* Die genannte
Zeichenzahl ist gezählt, die Tokenzahl ist geschätzt, und die Zeile behauptet nichts anderes.

---

## 9. Teststrategie

### 9.1 Die absolute Regel

**Kein Test schreibt gegen die echte API. Kein Test der normalen Testläufe setzt überhaupt
einen Netzwerkaufruf gegen `webapp.buchhaltungsbutler.de` ab.** Durchgesetzt auf drei Ebenen,
nicht durch Disziplin:

1. `test/setup.ts` installiert `undici`-`MockAgent` mit `disableNetConnect()`. Jeder echte
   Netzwerkversuch lässt den Test sofort scheitern. Die Testumgebung setzt `BB_BASE_URL` auf
   einen nicht auflösbaren Wert.
2. **Ein eigener Test prüft, dass `disableNetConnect()` aktiv ist.** Ohne ihn wäre die
   Absicherung das Erste, was bei einem Refactoring stumm ausfällt.
3. Ein Lint-Schritt verbietet in `test/` jeden direkten `fetch(`-Aufruf ohne Mock und jede
   Zeichenkette, die wie ein Zugangsdatum aussieht.

Der **Vertragslauf** aus 9.7 ist die einzige Ausnahme. Er läuft nicht in der öffentlichen CI,
braucht echte Zugangsdaten aus der Umgebung und ist hart auf die 15 lesenden Pfade begrenzt.

### 9.2 Die dreizehn Registerprüfungen

Sie laufen über das Register und sind der Grund, warum E1 und E6 überhaupt überprüfbar sind.
**Sie werden vor den Registereinträgen geschrieben** (AP11 vor AP12a–e), damit sie beim
Befüllen rot sind und grün werden.

| # | Prüfung | Schlägt fehl, wenn |
| --- | --- | --- |
| P1 | **Vollständigkeit.** Pfadmenge des Registers gleich Pfadmenge des Generats, 54 gegen 54; bei den vier Einträgen mit Pfadvorlage zählt `path.specPath`, nicht die Vorlage (4.4 Punkt 7, 4.6) | ein Endpunkt kein Werkzeug hat oder umgekehrt |
| P2 | **Eineindeutigkeit.** Kein Pfad zweimal, kein Name zweimal | E1 verletzt wäre |
| P3 | **Parameterdeckung.** Die Vereinigung **aller Einträge aller `apiNames`-Arrays** der `fields` plus die Namen in `omitted` ist gleich der Parametermenge des Generats; **ein Behälterfeld deckt ausdrücklich mehrere Parameter ab** (`positions` sechs oder sieben, `items` sechs oder sieben, `assignments` genau einen); kein Name doppelt; Felder mit `source: "server"` oder `"path"` sind ausgenommen und tragen ein leeres `apiNames`; jeder `omitted`-Eintrag mit nicht leerer Begründung; kein `apiName` zeigt ins Leere. Zweite Stufe, **ausschließlich bei den acht Behälterfeldern, deren Parameter im Generat ein `schema.$ref` trägt** (nicht bei den Positionslisten der Werkzeuge 17, 18, 19, 21, 23): Die Vereinigung der `apiNames` der `itemFields` deckt sich mit den `properties` der **aufgelösten Elementdefinition** — trägt `.items` ein `$ref`, wird es zuerst aufgelöst; nur `PostingsFree` führt `properties` inline unter `.items`; findet der Test weder `$ref` noch `properties`, ist das ein Fehlschlag und keine leere Menge (Regel und zweispaltige Zuordnungstabelle in 4.4 Punkt 3) | ein Parameter fehlt oder erfunden ist. Das ist die Prüfung von E6 |
| P4 | **Namensschema.** `^bb_[a-z][a-z0-9_]{2,37}$`, höchstens 40 Zeichen, Verb aus der geschlossenen Liste als **Segment** hinter der Ressource, Ressource im Plural | ein Name gegen eine Regel verstößt |
| P5 | **Klassen.** Genau eine Klasse je Eintrag; **zusätzlich Abgleich gegen eine zweite, im Testverzeichnis unabhängig gepflegte Liste** | jemand ein Werkzeug versehentlich umklassifiziert |
| P6 | **Wirkungsabgleich.** 15 lesend, 24 anlegend, 8 ändernd, 7 löschend, gegen eine aus `grundlagen.md` 7.3 abgeschriebene Tabelle im Test; Klasse R ist exakt die Menge der lesenden | Implementierung oder Dossier auseinanderlaufen |
| P7 | **Annotationen.** Alle vier Hints je Werkzeug explizit gesetzt, Werte gleich der Klassentabelle, `openWorldHint` überall `true`; Auszählung 13 mal `destructive: true`, 19 mal `idempotent: true` | eine Zeile fehlt oder widerspricht |
| P8 | **Beschreibungen.** Stufe gleich der namentlichen Zuordnung in 4.9 und Länge innerhalb des Stufenbudgets; enthält „BuchhaltungsButler"; **Beschreibung ist deutsch** (Prüfweg unten); jeder Parameter hat eine `description`; genau ein Pflichtsatz U1 bis U7, **zeichengenau** gegen `mandatory-sentences.ts`, bei jedem der 39 schreibenden und **keiner** bei den 15 lesenden; kein Parameter `confirm`; die Pflichtsätze aus 4.7 zur Nebenwirkung von `id_by_customer_from`/`_to` an `bb_transactions_search`; **der Pflichtsatz aus 4.3 zur Währung des Zahlungskontos am Feld `currency` von `bb_transactions_create` und `bb_transactions_create_batch`**; **jeder Verweis auf ein anderes Werkzeug nennt einen Namen, den es gibt** | ein Pflichtsatz fehlt, eine Stufe abweicht, ein Verweis ins Leere zeigt oder ein englischer Satz durchgerutscht ist |
| P9 | **Geheimnisfreiheit.** `api_key`, `api_client`, `api_secret`, `authorization` kommen in keiner Definition, keinem Schema, keiner Beschreibung, keiner Golden-Antwort, keiner Fehlermeldung und keinem Resource-Inhalt vor | ein Treffer |
| P10 | **Schreibende Einträge sind vollständig ausgestattet.** Jeder Eintrag mit `toolClass !== "R"` hat ein nicht leeres `verifyWith`; **jedes Feld mit `itemFields` hat `maxItems`** — Stapelbehälter, Positionsliste und geschachtelte Positionsliste gleichermaßen (4.7 Q4, 4.8); jeder Eintrag hat eine Eimerzuordnung und eine Zeitlimitstufe | ein Feld fehlt |
| P11 | **Kontextbudget.** Summe aller Definitionen unter **32.000** Token, `instructions` unter **2.100**, je Werkzeug unter dem Stufenbudget aus 4.9 (900 / 700 / 480 Zeichen); zusätzlich die Prüfsumme 22 + 18 + 14 = 54 gegen die drei namentlichen Listen in 4.9. **Die Token werden mit dem Tokenizer aus 13.3 gezählt, nicht über `CHARS_PER_TOKEN` geschätzt**; die Stufenbudgets sind Zeichengrenzen und brauchen keinen Tokenizer. P11 ist damit ab AP11 lauffähig und wartet auf keine Messung aus AP14 (4.10) | das Budget reißt oder eine Stufenbesetzung von 4.9 abweicht |
| P12 | **Dateiaufbau.** Genau 54 Dateien unter `src/registry/tools/`, Dateiname gleich exportiertem `name` plus `.ts`. Der Index `index.generated.ts` wird **zur Testlaufzeit erzeugt** — die npm-Skripte rufen `pnpm generate` vor `test` auf (4.2, AP01) — und deckt sich danach mit dem Verzeichnis: gleiche Namensmenge, kein Eintrag mehr, keiner weniger. Die Datei ist nicht eingecheckt und wird von keinem Paket gepflegt | eine Datei falsch heißt, der Generator eine Datei nicht erfasst oder Dateiname und exportierter `name` auseinandergehen |
| P13 | **Antwortvertrag gegen Projektion.** Jeder Name in `concise` kommt als Schlüssel in `responseContract.fields` desselben Eintrags vor. Ein leeres `concise` ist zulässig und bedeutet „keine Projektion"; die zehn in 7.4 genannten Werkzeuge tragen ein nicht leeres `concise` | ein Projektionsfeld erfunden oder falsch geschrieben ist. Das ist die maschinelle Absicherung von 7.4 |

Der Verweistest in P8 ist wichtiger, als er klingt: Ein Abgrenzungssatz, der auf ein nicht
existierendes Werkzeug zeigt, lenkt den Agenten in einen garantierten Fehlschlag.

**Wie P8 „die Beschreibung ist deutsch" prüft.** Eine Sprachbibliothek wäre eine zusätzliche
Abhängigkeit für eine triviale Prüfung. Stattdessen, in dieser Reihenfolge:

1. Aus dem Text werden alle Spannen in einfachen Anführungszeichen entfernt (dort stehen nach
   4.9 die Enum-Werte und wörtlich zitierten API-Werte), ebenso alle Wörter, die auf `bb_`
   beginnen, und alle Wörter, die einen Unterstrich enthalten (API-Feldnamen wie
   `id_by_customer`, `date_from`, `to_from`).
2. Der Rest wird gegen eine **Verbotsliste englischer Funktionswörter** geprüft, als ganze
   Wörter und ohne Rücksicht auf Groß- und Kleinschreibung:
   `the`, `this`, `that`, `these`, `with`, `and`, `for`, `from`, `your`, `you`, `which`,
   `into`, `only`, `does`, `must`, `should`, `use`, `when`, `where`, `cannot`, `about`,
   `after`, `before`, `there`. Ein Treffer lässt den Test fehlschlagen.
3. Die Liste enthält **kein** Wort, das auch deutsch ist. Ausdrücklich nicht aufgenommen sind
   deshalb `die`, `was`, `man`, `will`, `hat`, `not` und `also`, die im Deutschen vorkommen
   und einen falschen Alarm auslösen würden.

Die Prüfung erkennt keinen einzelnen englischen Fachbegriff und soll das auch nicht: Sie fängt
den Fall ab, dass eine Beschreibung insgesamt auf Englisch geschrieben wurde, und genau das ist
der Rückfall, der bei 54 Einträgen und fünf Bearbeitern droht.

### 9.3 Vier Vertragstests außerhalb des Registers

| Test | Prüft |
| --- | --- |
| `read-only.test.ts` | Mit `BB_MCP_READ_ONLY=true` lehnt jedes der 39 schreibenden Werkzeuge ab, **ohne** dass der MockAgent einen Request sieht, und die Absage nennt die Variable und ihren Zielwert. Ohne die Variable führen dieselben 39 aus. **Die Werkzeugliste ist in beiden Läufen identisch.** Dazu die Berichtsprüfung: mit Schalter antworten die drei `bb_reports_get_*` weiter, die beiden `bb_reports_create_*` sagen ab, und die `instructions` nennen die Einschränkung |
| `no-write-retry.test.ts` | Für alle 39 schreibenden Einträge liefert der MockAgent einmal HTTP 504. Erwartet: **genau ein Request**, kein zweiter, und eine Meldung, die `verifyWith` nennt und den Zustandssatz 3 aus 5.8 trägt („Es ist UNBEKANNT, ob BuchhaltungsButler diese Anfrage verarbeitet hat.") |
| `output-schema.test.ts` | Jede Golden-Antwort validiert gegen das `outputSchema` ihres Werkzeugs |
| `mcpb-tools.test.ts` | Die Werkzeugliste des Bundle-Manifests wird aus dem Register erzeugt und danach gegen das Register geprüft. Das schließt die Drift, die eine von Hand gepflegte Manifestliste unweigerlich entwickelt |

### 9.4 HTTP-Nachbildung und Golden-Dateien

`undici`-`MockAgent` mit `setGlobalDispatcher`, weil er auf der Ebene des eingebauten `fetch`
ansetzt und damit den echten Client testet, nicht einen Ersatz. Keine zweite
Mocking-Bibliothek.

**Die Antwortkörper werden aus belegten Beobachtungen abgeleitet, nicht aus dem, was der Code
erwartet.** Ein Mock, der die Annahme wiederholt, prüft nichts. Unter `test/golden/` liegt je
Datei eine Herkunftszeile: welcher Endpunkt, welches Datum, welche Quelle. **Die
Geschäftsdaten sind erfunden, die Struktur nicht.**

Pflichtfälle, alle aus den Befunden in 0.3 abgeleitet:

| Fall | Prüft |
| --- | --- |
| `/receipts/get` mit den **16 gemessenen Feldern**, `id_by_customer` als String, `delivery_date` und `due_date` als `null` | die Listenform |
| `/receipts/get/<id>` mit den **23 gemessenen Feldern**, `data` als **Objekt ohne `rows`**, `date_delivery` und `date_payment_due` statt der Listennamen, **`amount_original` und `currency_original` vorhanden** | den getrennten Antwortvertrag je Endpunkt und die Fremdwährungsfelder, die nur der Einzelabruf liefert |
| `/transactions/get` mit **6 Feldern**, `id_by_customer` als **Zahl** | die Typ-Asymmetrie |
| `/transactions/get/<id>` mit **13 Feldern**, `account` als Zahl | dito |
| **Die Abfangregel der vier Werkzeuge mit Pfadvorlage wird auf den *interpolierten* Pfad gesetzt** (`/receipts/get/4711`), nicht auf den Spezifikationspfad | dass der Pfadbau aus 4.6 wirklich durchlaufen wird und der Mock nicht versehentlich auf einer Vorlage antwortet |
| Derselbe Aufruf, **Body geprüft**: er enthält `api_key` und gegebenenfalls `get_file`, aber **kein** Feld `id_by_customer` | Regel 5 aus 4.6 |
| Fehlerantwort an `/receipts/get/4711` mit einem Code, den `/receipts/get/id_by_customer` führt | dass der Katalog über `specPath` und nicht über den gebauten Pfad nachgeschlagen wird (4.6); mit dem gebauten Pfad fiele der Fall auf „Paar fehlt" zurück |
| `amount_paid` und `amount_paid_fixed` vorhanden, obwohl die Spezifikation sie nicht kennt | das offene `outputSchema` |
| volle Seite (`rows == limit`) und unvollständige Seite | die drei Bestandszeilen aus 7.5 |
| leere Seite (`rows: 0`, `data: []`) | kein Absturz, kein Folgehinweis |
| HTML-Antwort mit `content-type: text/html` | `NonJsonResponseError`, erste 200 Zeichen, keine Parserausnahme |
| HTTP 200 mit `success: false` | dass wirklich `success` ausgewertet wird und nicht nur der Status |
| Umschlag ohne `success` | `EnvelopeContractError` |
| bekanntes Feld fehlt bzw. hat den falschen Typ | `_contract_warnings` gesetzt, Antwort trotzdem geliefert |
| unbekanntes Feld vorhanden | durchgereicht, gezählt, kein Fehler |
| `400/15` an `/receipts/get`, **zweimal: einmal mit dem Katalogtext `invalid sort field specified`, einmal mit dem live gemessenen `invalid field specified`** | **kein** Retry: HTTP 400 wird nie wiederholt, und die Einstufung als `input` folgt aus (`specPath`, Code, Status) — beide Läufe liefern dasselbe Ergebnis. Das ist der Test zu L6 und zur Regel aus 5.6, dass keine Weiche am Wortlaut hängt |
| `403/15` an `/receipts/addBatch` | Retry, weil dort Drosselung |
| `403/15` an `/transactions/add` | **kein** Retry, weil schreibend, aber Klasse `transient` und damit der Text aus 5.7 statt „ein späterer Versuch hilft nicht" (5.6, Fußnote zu den zehn Pfaden) |
| `504/30` an einem lesenden Werkzeug | drei Requests mit wachsendem Abstand, jeder mit eigenem Token |
| `504` an einem schreibenden Werkzeug | genau ein Request, Text aus 5.7 |

### 9.5 Einheitstests, Schwerpunkte

Die Tiefe richtet sich danach, wo ein Fehler **still** bleibt:

| Modul | Ziel | Warum |
| --- | --- | --- |
| `mapping/coerce.ts`, `mapping/decimal.ts`, `mapping/contract-violation.ts` | 100 Prozent Zweigabdeckung | hier entstehen stille Datenfehler. Beträge mit Punkt und mit Komma, Booleans als `"0"`, `"1"`, `"false"`, `null`, fehlende Felder. Eine Falsy-Prüfung auf einem Zahlenfeld, das `0` sein darf, verwirft einen gültigen Wert |
| `schema/cross-checks.ts` | 100 Prozent, je Prüfung ein positives und ein negatives Beispiel — konstruiert **ausschließlich an einem Werkzeug, dem die Prüfung in 4.7 zugeordnet ist** | Q1 bis Q8 fangen falsche Eingaben ab, bevor sie den Prozess verlassen. Die Beispiele sind mit den in 4.7 genannten Werkzeugnummern konstruierbar; das war der Grund, die Zuordnungen dort maschinell gegen die Spezifikation zu prüfen. Für Q2 sind das die Werkzeuge 1, 9, 20 und 46; an 32, 36 und 40 gibt es kein `maximum` und deshalb weder eine Prüfung noch ein negatives Beispiel (4.7, 7.5) |
| `errors/classify.ts` | mindestens ein Fall je mehrdeutigem Code, jeweils an **zwei** Pfaden mit verschiedener Bedeutung | die Retry-Entscheidung hängt daran |
| `http/retry.ts` | 95 Prozent | die Retry-Weiche ist der gefährlichste Zweig des Projekts |
| `http/rate-limiter.ts` | zehn gleichzeitige Aufrufe dürfen nicht gemeinsam durchlaufen, Prüfung über eine kontrollierte Uhr; ein Retry entnimmt einen weiteren Token | ohne Serialisierung rechnen gleichzeitige Aufrufe dieselbe Wartezeit aus und laufen gemeinsam durch, der Limiter wirkt dann nicht |
| `mapping/parallel-arrays.ts` | eine Positionsliste mit drei Einträgen erzeugt Arrays mit je drei Elementen; `null` in `oi_receipts_ids_by_customer` überlebt die JSON-Kodierung | die Längeninvariante |
| `mapping/path.ts` | die **sechs** Regeln aus 4.6, inklusive Zurückweisung von Werten mit Schrägstrich, Punkt und leerer Zeichenkette; zusätzlich zwei Negativprüfungen: der Body trägt **kein** `id_by_customer` (Regel 5), und der zurückgegebene `specPath` ist unverändert der Spezifikationspfad (Regel 6) | Pfadinjektion; und die beiden Verwechslungen, die den Fehlerkatalog und den Deckungstest stillschweigend aushebeln |
| `response/pagination-note.ts` | die drei Zustände aus 7.5 einzeln | der stille Fehler „Seite für Gesamtergebnis gehalten" entsteht genau hier |
| `response/truncate.ts` | eine Antwort mit 1000 Zeilen wird gekürzt, die Kürzung ausgewiesen, die Bestandszeile lügt nicht | |
| `config/redact.ts` | die drei Geheimnisse in jeder Verpackung: Teilzeichenkette, base64-kodiert, in einer URL, in einem JSON-Fragment | |
| `generated/version.ts` | liefert die echte Version; ein Test fängt das stille Scheitern ab | meldet die Versionsermittlung `"unknown"`, merkt das sonst niemand |
| `guards/*` | je Guard ein eigener Fall: Reihenfolge nach 1.4, Abbruch **vor** dem ersten Byte, Zustandssatz 1 aus 5.8 zeichengenau; Guard 5 gegen `min(50, BB_MCP_MAX_BATCH)` an Stapelbehälter **und** Positionsliste (4.7 Q4); Guard 6 standardmäßig aus und bei Stapeln einmal je Stapel | Ein Guard, der zu spät greift, hat den Request schon abgesetzt. Das ist an der Antwort nicht mehr zu erkennen, nur am Mock |
| `server/register-tools.ts`, `server/shutdown.ts` | der eine generische Handler über alle sechs Guards hinweg; Herunterfahren bei SIGINT, SIGTERM und stdin-Ende **idempotent**, also auch bei doppeltem Signal genau einmal | Der Handler ist der einzige Ablaufpfad des Projekts (1.2). Ein Fehler dort ist ein Fehler in 54 Werkzeugen |
| `cache/store.ts` | `BB_MCP_CACHE_TTL_MS=0` liefert keinen Treffer, Ablauf nach TTL über eine kontrollierte Uhr, Invalidierung nach `invalidatesCache` (7.8); **Negativprüfung: `/accounts/get` und Bewegungsdaten landen nie im Speicher** | Ein veralteter Stammdatensatz ist in einer Buchhaltung ein schwer zu findender Fehler (7.8) |
| `registry/*` | über die Registerprüfungen, nicht über Zeilenabdeckung | es sind Daten, keine Logik |
| Rest | 80 Prozent | |

### 9.6 Integrationstest und Paketprobelauf

**Integrationstest.** Der **gebaute** Server wird als Unterprozess gestartet, ein echter
MCP-Client verbindet sich über stdio und führt `initialize`, `tools/list` und mindestens einen
`tools/call` je Klasse gegen den Mock aus. Geprüft wird zusätzlich, dass `tools/list` **genau
54** Einträge liefert, dass jeder Eintrag `annotations` mit allen vier Hints trägt, und dass
stdout **ausschließlich** gültige JSON-RPC-Zeilen enthält. Ein `tsc --noEmit` allein fängt die
Importpfad- und Verpackungsfallstricke nicht.

**Der Paketprobelauf**, aus dem Blickwinkel Verbreitung der wichtigste Test des Projekts. In
der CI wird das Paket so installiert und gestartet, wie ein Nutzer es täte:

1. `npm pack` und Prüfung der enthaltenen **Dateiliste gegen eine erwartete Liste**. Kein
   `src`, kein `test`, kein `docs`, keine `.env`, keine Karte außer den Sourcemaps.
2. Installation des Tarballs in ein **leeres Wegwerfverzeichnis**.
3. `bbutler-mcp --version` muss die Version aus `package.json` ausgeben. Das prüft Shebang,
   Dateimodus 755 und die `bin`-Auflösung **in einem Zug**.
4. **Zwei getrennte Prüfungen ohne Zugangsdaten** (siehe 6.5): `bbutler-mcp test` liefert
   Rückgabewert 1 mit der Meldung aus 6.5; `bbutler-mcp` **startet**, beantwortet `tools/list`
   mit 54 Einträgen und liefert auf jeden `tools/call` den Text „NICHT KONFIGURIERT" aus 6.5.
   Der Server darf hier **nicht** abbrechen und **nicht** hängen bleiben.
5. `bbutler-mcp` mit Testzugangsdaten gegen einen lokalen Nachbau über `BB_BASE_URL`:
   `initialize` und `tools/list` müssen **innerhalb von 5 Sekunden** antworten. Das ist die
   Hälfte des Codex-Startzeitlimits; reißt es, fällt die CI.
6. Die **Startzeit wird gemessen und als Zahl ins Protokoll geschrieben**, damit sie über die
   Versionen hinweg verfolgbar ist, statt einmal vermutet zu werden.

### 9.7 Der Vertragslauf gegen die echte API

`pnpm run contract:read`. Läuft **nicht** in der öffentlichen CI und braucht echte
Zugangsdaten aus der Umgebung. Er ruft die 15 lesenden Endpunkte je einmal mit minimalen
Parametern auf und vergleicht **die Feldmenge und die JSON-Typen** der Antwort mit dem
`responseContract` des Registereintrags. Ausgegeben wird eine Liste neuer, fehlender und
typveränderter Felder.

Das ist die Antwort auf die Frage „wie merkt das Projekt, dass die API sich geändert hat". Die
Spezifikationsdatei wird nicht gepflegt und ist nachweislich unvollständig; die Wirklichkeit
ist das, was zurückkommt.

**Hart abgesichert:** Die Erlaubnisliste wird **aus dem Register erzeugt** (`toolClass === "R"`)
und nicht abgeschrieben; jeder andere Pfad lässt den Lauf werfen, **bevor** der Aufruf abgeht;
**ein eigener Test prüft, dass der Wächter bei einem schreibenden Pfad wirft**. Der Lauf
schreibt **keine Geschäftsdaten** in eine Datei, sondern nur Feldnamen und Typen. Er gehört in
die Vorbereitung jeder Veröffentlichung und in eine Zeile der `CONTRIBUTING.md`.

**Daraus folgt eine Kante im Arbeitsplan, die im Entwurfsstand fehlte: AP21 hängt an AP17.**
Ein Veröffentlichungsweg, der den Vertragslauf zur Pflicht erklärt, ihn aber nicht abwartet,
erklärt ihn in Wahrheit zur Empfehlung. Weil der Lauf echte Zugangsdaten braucht und deshalb
**nicht** in der öffentlichen CI laufen kann (9.1), ist er kein Schritt des
Veröffentlichungs-Workflows, sondern ein **blockierender, bestätigter Punkt der
Veröffentlichungs-Checkliste** aus AP21; `publish.yml` verlangt die Bestätigung als Eingabe und
bricht ohne sie ab.

### 9.8 Evaluationslauf

Die zehn Aufgaben aus `tool-design.md` 10.2 gegen aufgezeichnete Mocks, plus eine elfte, die
diesem Plan entspringt:

> 11. „Auf welchem Zahlungskonto liegt die Zahlung von Lieferant X, und auf welches Sachkonto
>     wurde sie gebucht?" — prüft ausschließlich, ob der Agent Zahlungskonto und Sachkonto
>     auseinanderhält und die richtigen zwei Nachschlagewerkzeuge wählt (3.4).

**Zwei Kennzahlen ohne Toleranz:**

- **Falsche Werkzeugwahl bei den zwölf Buchungswerkzeugen: 0.** Das misst, ob 3.7 wirkt.
- **Blindes Schreiben: 0.** Aufrufe der Klassen D und B, vor denen der Agent die betroffenen
  Datensätze weder gelesen noch dem Nutzer vorgelegt hat.

Ein Fehlschlag hier ist ein Befund **gegen den Text der Werkzeuge**, nicht gegen die
Serverlogik, denn der Server erzwingt die Reihenfolge nicht (E2). **Ein Fehlschlag ist dem
Projektinhaber vorzulegen und nicht vom Implementierungs-Agenten durch Umformulieren der
Aufgabe aus der Welt zu schaffen.**

Weitere Kennzahlen, Zielwerte als **Annahme** nach `tool-design.md` 10.3, nach dem ersten
Lauf zu justieren: Erfolgsquote über 90 Prozent; Median der Werkzeugaufrufe je Aufgabe unter
6; Median der Fehlversuche 0, Maximum 1.

Ausgewertet werden **Transkripte, nicht nur Zahlen**. Ruft ein Agent regelmäßig zwei Werkzeuge
hintereinander auf, wo eines reichte, ist das ein Entwurfsfehler, kein Agentenfehler.

### 9.9 Wie die schreibenden Endpunkte trotzdem geprüft werden

Das ist die ehrlichste Lücke dieses Plans und bekommt einen eigenen Abschnitt statt einer
Fußnote. Drei Wege, in dieser Reihenfolge:

1. **Ein gesondertes Testmandat.** Der Projektinhaber richtet einen zweiten
   BuchhaltungsButler-Mandanten ohne echte Daten ein oder erfragt beim Anbieter eine
   Testumgebung. Erst damit lassen sich klären: die Pfadsegmentform von `delete` und
   `restore`; das Wiederholungsverhalten von `delete`, `restore`, `unconfirm`, `unassign` und
   `bb_postings_assign_receipt`; das Betragsformat beim Senden; das Verhalten bei ungleich
   langen parallelen Arrays. Bis dahin bleiben alle diese Punkte als **nicht verifiziert**
   gekennzeichnet, und `idempotentHint` bleibt nach 3.3 auf `false`.
2. **Vollständige Nachbildung aus der Spezifikation.** Jeder schreibende Endpunkt bekommt
   Mock-Fälle für Erfolg und für jeden in der Spezifikation definierten Fehlercode. Das prüft
   die Fehlerübersetzung und die Schemata, nicht das Serververhalten, und wird als solches
   benannt.
3. **Was ausdrücklich nicht gemacht wird:** ein einzelner „harmloser" Schreibtest gegen die
   Produktivbuchhaltung, etwa ein Kommentar oder eine Kostenstelle. **Ein Kommentar ist über
   die API nicht löschbar, eine Kostenstelle verändert die Kostenstellenauswertung. Es gibt in
   dieser API keinen folgenlosen Schreibvorgang.** Dieser Absatz steht hier, damit er im
   Verlauf der Umsetzung nicht erodiert.

### 9.10 Größenbudget des Pakets

`scripts/check-size.ts` prüft **zwei** Zahlen gegen **zwei** feste Obergrenzen. Beide stehen
hier und nirgendwo sonst; frühere Verweise auf 9.7 (Vertragslauf) und 13.3
(Entwicklungsabhängigkeiten) waren falsch, weil an beiden Stellen keine Größenangabe steht.

| Größe | Obergrenze | Quelle der Messung |
| --- | --- | --- |
| **gepacktes Tarball** | **1 MiB** (1.048.576 Bytes) | `npm pack --json`, Feld `size` |
| **entpackter Inhalt** | **3 MiB** (3.145.728 Bytes) | `npm pack --json`, Feld `unpackedSize` |

Beide Zahlen stammen aus **einem** Aufruf, und derselbe Aufruf liefert unter `files[]` je Datei
`path` und `size`; die Liste der größten Dateien braucht also kein zweites Werkzeug und keine
zusätzliche Abhängigkeit. Am 2026-09-12 an einem Wegwerfpaket geprüft.

**Woher diese beiden Zahlen kommen.** Sie sind aus den bekannten Posten hochgerechnet, nicht
geraten, aber die Hochrechnung ist eine **Annahme**, weil noch kein Bau existiert:

| Posten | Rechnung | Zeichen beziehungsweise Bytes |
| --- | --- | --- |
| 54 Registereinträge | 96.798 Zeichen Definitionsinhalt (4.10) plus Gerüst je Eintrag | rund 200 KB |
| Fehlerkatalog | 786 Paare × rund 110 Bytes (5.6) | rund 90 KB |
| übriger Laufzeitcode | `http`, `mapping`, `response`, `errors`, `guards`, `schema`, `config`, `server`, `upload`, `cache`, `logging` | rund 120 KB |
| CLI mit neun Clientadaptern plus Sammeladapter | 8.3 | rund 80 KB |
| `instructions` und vier Resources | 6.7, 7.7 | rund 20 KB |
| **Summe JavaScript** | | **rund 510 KB** |
| Sourcemaps | sie bleiben im Paket (9.6 Schritt 1) | Faktor 1,5 bis 2 |
| README, LICENSE, `package.json` | npm legt README, LICENSE und `package.json` unabhängig von `files[]` ins Tarball | rund 70 KB |
| **erwartet entpackt** | | **rund 1,1 bis 1,4 MB** |
| **erwartet gepackt** | JavaScript komprimiert etwa 4:1 | **rund 300 bis 400 KB** |

Die Obergrenzen liegen also bei rund dem Doppelten des Erwarteten. Das ist Absicht: Ein Budget,
das schon bei normalem Wachstum reißt, wird angehoben statt beachtet.

**Nachtrag vom 2026-09-13, am gebauten Paket gemessen.** Die Hochrechnung oben bleibt als
Annahme stehen, wie sie war; der Bau sieht anders aus. Gemessen wurden 1.172.626 Bytes
JavaScript samt Typdateien, README und `package.json` gegenüber den erwarteten rund 510 KB —
also mehr als das Doppelte. Die Sourcemaps trugen mit eingebetteten Quelltexten 2.024.654
Bytes, davon allein 1.630.728 Bytes `sourcesContent`; der Faktor lag damit bei 1,7 wie
vorhergesagt, nur auf der doppelten Grundmenge. Das entpackte Paket lag dadurch bei 3.197.280
Bytes und riss die Grenze um 51.552 Bytes. Behoben wurde das **nach Punkt 2 an der Ursache und
nicht an der Grenze**: `tsdown.config.ts` setzt `outputOptions.sourcemapExcludeSources`. Die
Karten bleiben im Paket, wie 9.6 Schritt 1 es verlangt, und behalten ihre vollständige
Zeilen- und Spaltenzuordnung; nur die eingebetteten Quelltexte entfallen, die über das
öffentliche Repository ohnehin erreichbar sind. Beide Grenzen bleiben unverändert. Gemessen
danach: **entpackt 1.566.960 Bytes (49,8 Prozent), gepackt 377.847 Bytes (36,0 Prozent)**. Der
Faktor der Karten liegt jetzt bei 0,34 statt 1,5 bis 2.

**Warum überhaupt eine Obergrenze, wo 9.6 Schritt 1 doch die Dateiliste prüft.** Die
Dateilistenprüfung vergleicht die enthaltenen **Pfade** gegen eine erwartete Liste und fängt
damit den groben Fehler („`src`, `test`, `docs` sind im Tarball"). Wie **groß** die erlaubten
Pfade sind, sieht sie nicht. Das Budget fängt deshalb:

- eine Abhängigkeit, die der Bündler in `dist` einrechnet, statt sie als `dependency` zu
  belassen. Das ist der teuerste und unauffälligste Fall, weil die Dateiliste dabei unverändert
  bleibt;
- eine Datei, die zur Laufzeit nichts zu suchen hat und trotzdem in `dist` landet, etwa die
  Spezifikationsdatei (`docs/openapi/buchhaltungsbutler-v1.json`, am 2026-09-12 **724.029
  Bytes**) oder ein ungefiltertes Generat. Sie verbrauchte allein einen erheblichen Teil der
  Reserve und ist in der Größenzeile des Protokolls sofort zu sehen;
- schleichendes Wachstum über viele Veröffentlichungen hinweg, das ohne eine Zahl im Protokoll
  niemandem auffällt.

Dazu kommt der Kaltstart: Bei `npx -y` wird das Tarball **bei jedem Kaltstart** geladen, und
R7 nennt das Startzeitlimit der Codex CLI (Vorgabe dort 10 Sekunden) als reales Risiko. Bei
1 MB je Sekunde bedeutet 1 MiB rund eine Sekunde Ladezeit, 5 MiB rund fünf — bei einem
Zeitlimit von zehn Sekunden ist das der Unterschied zwischen Reserve und Grenzfall.

**Was bei Überschreitung geschieht, verbindlich und ohne Rückfrage:**

1. `check-size.ts` endet mit Rückgabewert 1, nennt **beide** gemessenen Zahlen, beide Grenzen
   und die zehn größten Dateien des Tarballs. Die CI ist rot. **`publish.yml` führt denselben
   Lauf vor `npm publish` aus**; ein zu großes Paket blockiert damit denselben unumkehrbaren
   Schritt wie ein Verpackungsfehler. AP21 **schreibt** diesen Workflow, **löst ihn aber nicht
   aus**: Ausgelöst wird er allein durch einen Tag des Projektinhabers (11.2).
2. Zuerst wird die **Ursache** gesucht, nicht die Grenze verschoben: Dateiliste gegen 9.6
   Schritt 1, dann die zehn größten Dateien, dann das Bündelergebnis.
3. **Die Grenze anzuheben ist kein Schritt, den der Implementierungs-Agent geht.** Sie ist wie
   das Tokenbudget aus 4.10 eine Zahl des Projektinhabers. Eine Anhebung braucht seine
   Entscheidung und einen Eintrag in `CHANGELOG.md`, der die neue Zahl und den Grund nennt.

Der Lauf gehört in den Paketprobelauf (AP16) und zusätzlich in `drift.yml` (AP21), damit eine
Verschlechterung auch ohne Veröffentlichung sichtbar wird.

---

## 10. README-Gliederung

Deutsch (E4), echte Umlaute, keine Emojis. **Zielleser ist ein Buchhalter oder
Kanzleimitarbeiter, nicht ein Entwickler.** Aufbau nach `distribution.md` 17: Abgrenzung
oben, zwei Wege zur Wahl, Fehlersuchtabelle, Verifikationsschritt, nicht unterstützte Clients
mit Begründung.

**Der unscoped Name `buchhaltungsbutler-mcp` taucht in der README nirgends als unser Paketname
auf.** Er ist auf npm bereits vergeben (E3); verwendet wird ausschließlich
`@dennismenken/buchhaltungsbutler-mcp`.

```text
# BuchhaltungsButler MCP-Server (inoffiziell)

> Kasten ganz oben, vor allem anderen:
>   Inoffizielles Projekt. Keine Verbindung zur BuchhaltungsButler GmbH, keine
>   Unterstützung von dort. Die Marke gehört ihrem Rechteinhaber.
>   Der Server arbeitet auf echten Buchhaltungsdaten. 39 der 54 Werkzeuge schreiben.
>   Buchungen und Rechnungen sind über diese API nicht löschbar.
>   Nach der Installation sind alle 54 Werkzeuge sofort aufrufbar. Welche Ihr
>   Assistent benutzen darf, entscheiden Sie in Ihrem Client.

 1. Was der Server kann              54 Werkzeuge, eines je API-Endpunkt, 15 davon lesend.
                                     Erzeugte Tabelle nach Bereichen.
 2. Voraussetzungen                  Node-Version aus Abschnitt 13.1, BuchhaltungsButler-Konto
                                     mit aktivierter API.
 3. Zugangsdaten beschaffen          Einstellungen, Schnittstellen und API-Zugang. Beide in den
                                     Quellen genannten Orte, weil sie sich widersprechen.
                                     Die drei Werte und was jeder bedeutet.
 4. Schnellstart in fünf Minuten     npx -y @dennismenken/buchhaltungsbutler-mcp setup
                                     Was der Assistent fragt, was er schreibt, dass er vorher
                                     sichert, und der Satz zum Ausprobieren danach.
 5. Installation je Client           je Unterabschnitt: Befehl oder Block, Ablageort,
                                     Neustartbedarf, Prüfbefehl.
    5.1 Claude Code                  claude mcp add-json, die drei Scopes erklärt
    5.2 Claude Desktop               claude_desktop_config.json, plus .mcpb ohne Terminal
    5.3 OpenAI Codex CLI             codex mcp add, TOML, startup_timeout_sec = 30
    5.4 ChatGPT-Desktop-App          wie Codex
    5.5 Grok Build (xAI)             grok mcp add
    5.6 Cursor                       ~/.cursor/mcp.json
    5.7 VS Code mit Copilot          code --add-mcp oder .vscode/mcp.json mit inputs
    5.8 Windsurf, Zed, Cline, Continue, LM Studio, Jan
    5.9 Andere Clients               die generische Form
    5.10 Nicht unterstützt           ChatGPT im Browser, mit Begründung
 6. Statt npx: feste Installation    npm install -g, absoluter Pfad, warum das für den
                                     Dauerbetrieb die ruhigere Variante ist
 7. Konfiguration                    vollständige Tabelle aus Abschnitt 6.2
    7.1 Pflichtvariablen
    7.2 Optionale Variablen
    7.3 Zugangsdatendatei            Ablageort, Rechte 0600, Mandantenprofile
 8. Nur lesen lassen                 BB_MCP_READ_ONLY, Standard aus, was es bewirkt, und dass
                                     BWA und Summen- und Saldenliste damit nicht erreichbar
                                     sind, das Kontenblatt aber schon
 9. Weitere Grenzen                  BB_MCP_MAX_BATCH, BB_MCP_MAX_AMOUNT, BB_MCP_RATE_LIMIT,
                                     BB_MCP_DUPLICATE_CHECK
10. Mehrere Mandanten                Profile, und warum der Rate-Limit-Eimer je api_key zählt
11. Die Werkzeuge                    erzeugte Tabelle: Name, Wirkung, ein Satz; gruppiert nach
                                     Belege, Zahlungen, Rechnungen, Buchungen, Stammdaten,
                                     Kostenstellen, Berichte
    11.1 Was die Annotationen bedeuten
                                     wie man im Client Leserechte getrennt von Schreibrechten
                                     vergibt. Das ist der eigentliche Schutz.
12. Bekannte Eigenheiten der API     rows ist keine Gesamtzahl; kein Idempotenzschlüssel und
                                     was daraus folgt; Beträge als String; Booleans als
                                     "0"/"1"; drei order-Syntaxen; Standardgrenze 25 bei
                                     Debitoren und Kreditoren; /reports/create ersetzt den
                                     Vorgänger; Feldnamen unterscheiden sich zwischen Listen-
                                     und Einzelabruf
13. Was der Server mit Ihren Daten macht
                                     Zugangsdaten nur im Prozess, kein Telemetrieversand,
                                     stderr-Protokoll ohne Geheimnisse, Kontextkosten der
                                     Werkzeugdefinitionen offen beziffert, Hinweis darauf,
                                     dass Werkzeugargumente von Inhalten beeinflusst sein
                                     können, die das Modell gelesen hat
14. Dateien hochladen                base64 als Vorgabe, file:// nur mit BB_MCP_UPLOAD_DIRS,
                                     https:// nur mit BB_MCP_UPLOAD_FROM_URL, Warnkasten zur
                                     Prompt-Injection-Kette
15. Verifikation                     bbutler-mcp doctor, was eine gesunde Ausgabe zeigt
16. Fehlersuche                      Tabelle Symptom, Ursache, Abhilfe
17. Bekannte Einschränkungen         die Punkte aus Abschnitt 14 dieses Plans, in Nutzersprache
18. Einen neuen Endpunkt nachrüsten  fünf Schritte, siehe unten
19. Mitwirken                        Fehler melden, Entwicklungsumgebung, Testregeln,
                                     Pflicht zum Vertragslauf vor einer Veröffentlichung
20. Lizenz und Abgrenzung            MIT; Markenhinweis; keine Verbindung zum Anbieter;
                                     kein Ersatz für steuerliche Beratung; die Verantwortung
                                     für jede Buchung bleibt beim Nutzer
```

**Die Fehlersuchtabelle in 16 enthält mindestens:** Server erscheint nicht im Client;
„NICHT KONFIGURIERT" in jeder Antwort; 401 mit Code 3 gegen 401 mit Code 4; Antwort ist HTML;
Werkzeuge antworten mit der Nur-Lesen-Absage; Debitorenliste zeigt nur 25 Einträge;
Kontenliste scheint unvollständig; Codex meldet einen Zeitablauf beim Start; eine gesetzte
`BB_*`-Variable wirkt nicht (Tippfehler, siehe die Warnung aus 6.4 Punkt 2).

**Abschnitt 18, „Einen neuen Endpunkt nachrüsten", in genau fünf Schritten**, weil das die
tragfähigste Antwort auf die Wartbarkeit über Jahre ist:

1. Die neue Spezifikationsdatei einspielen und `pnpm generate` laufen lassen. Registerprüfung
   P1 schlägt fehl und nennt den neuen Pfad.
2. Eine Datei `src/registry/tools/<werkzeugname>.ts` anlegen, Dateiname gleich Werkzeugname.
3. Den Eintrag nach dem Typ `ToolEntry` füllen: Name, Titel, Pfad, Wirkung, Klasse,
   Beschreibung mit dem passenden Pflichtsatz U1 bis U7, alle Felder, `verifyWith`, Eimer,
   Zeitlimitstufe, `concise`, Antwortvertrag.
4. `pnpm generate` erneut laufen lassen; der Index wird ergänzt. Er ist nicht eingecheckt und
   deshalb auch nicht zu committen (4.2).
5. `pnpm test` laufen lassen. P1 bis P13 sind grün oder nennen genau, was fehlt.

**Einen sechsten Schritt gibt es nicht.** Es ist keine Sammeldatei zu ändern, kein Handler zu
schreiben, keine Liste an zweiter Stelle zu pflegen.

---

## 11. Arbeitspakete in Umsetzungsreihenfolge

Die Pakete sind so geschnitten, dass **kein Paket in eine Datei schreibt, die einem anderen
gleichzeitig laufenden Paket gehört**. Die Spalte „Dateien (exklusiv)" ist verbindlich: Wer
außerhalb seiner Liste schreiben muss, meldet das, statt es zu tun.

**Eine Ausnahme, und nur eine:** `src/registry/index.generated.ts` wird nicht eingecheckt
(4.2), steht in `.gitignore` und gehört deshalb **keinem** Paket. Jedes Paket erzeugt die Datei
lokal über `pnpm generate`, was `build`, `test` und `typecheck` als ersten Schritt ohnehin tun
(AP01). Das ist kein Schreiben außerhalb der eigenen Liste, weil nichts Versioniertes berührt
wird. Für jede versionierte Datei gilt die Regel ohne Abstriche.

### 11.1 Übersicht der Abhängigkeiten

```
AP01 ─┬─ AP02
      ├─ AP03 ─┬─────────────────┐
      ├─ AP04 ─┤                 │
      ├─ AP06 ─┼─ AP07 ─┬─ AP08 ─┤
      │        │        ├─ AP13  │
      │        │        └─ AP15  │
      │        └─ AP05 ─┬─ AP09 ─┴─ AP10 ─┐
      │                 │                  ├─ AP12a ┐
      │                 └─ AP11 ───────────┤   b    │
      │                                    ├─   c   ├─ AP14 ─┬─ AP16 ─ AP18
      │                                    ├─   d   │        │
      │                                    └─   e   ┘        └─ AP20 ─ AP21 ─ AP22
      │                                       └─ AP17 ──────────────┘
      └─ AP19 ─ AP19b (nach AP12a–e, nur bei belegtem Ergebnis) ─────┘
```

**Die beiden letzten Zeilen lesen sich so:** AP17 hängt an AP12a–e und ist Voraussetzung von
AP21; AP19b hängt an AP19 und an AP12a–e und ist, sofern es überhaupt läuft, Voraussetzung von
AP22. **AP22 steht in jedem Fall am Ende**; kein Paket läuft nach der Skeptikerphase.

**Sieben Kanten in sechs Zeilen, die die Zeichnung aus Platzgründen nicht oder nur angedeutet
führt.** Sie gelten gleichrangig mit allem Gezeichneten; maßgeblich ist immer die Zeile „Hängt
ab von" des jeweiligen Pakets in 11.2:

| Kante | Grund |
| --- | --- |
| **AP09 → AP14** | Die Resource `bb://postingaccounts` (7.7) liest den Stammdatenspeicher `src/cache/store.ts`, und der gehört AP09. Über AP10 und AP12a–e besteht der Weg ohnehin; er steht hier, damit die Abhängigkeit beim Umstellen nicht verloren geht |
| **AP10 → AP15** | AP15 verdrahtet `src/cli.ts` gegen `src/index.ts` und `src/server/create-server.ts`; beide entstehen in AP10. Vorher ist die Verdrahtung nicht typprüfbar |
| **AP15 → AP16** | Der Paketprobelauf (9.6 Schritte 3 bis 5) startet `bbutler-mcp` **ohne Unterbefehl**, prüft `--version` und verlangt eine Antwort auf `tools/list`. Genau das entsteht erst mit der Verdrahtung in AP15 |
| **AP17 → AP21** | 9.7 erklärt den Vertragslauf zur Pflicht vor jeder Veröffentlichung. Ein Paket, das die Veröffentlichung vorbereitet und die Checkliste dafür schreibt, ohne den Lauf abzuwarten, macht aus der Pflicht eine Empfehlung |
| **AP19 → AP19b** und **AP12a–e → AP19b** | AP19 **stellt fest**, AP19b **zieht nach**. Das Nachziehen berührt Registerdateien aus AP12a bis AP12c sowie `classes.ts` (AP04) und zwei Testdateien (AP11); es darf deshalb erst laufen, wenn diese Pakete fertig sind, und hält die betroffenen Dateien dann exklusiv |
| **AP19b → AP22** | Die Skeptikerphase prüft den Endstand. Läuft AP19b erst nach ihr, prüft sie einen Stand, den es so nicht mehr gibt. Liefert AP19 kein belegtes Ergebnis, entfällt AP19b, und AP22 stellt das ausdrücklich fest |

### 11.2 Die Pakete im Einzelnen

---

**AP01 — Gerüst und Werkzeugkette**
*Hängt ab von:* nichts.
*Dateien (exklusiv):* `package.json`, `pnpm-lock.yaml`, `tsconfig.json`,
`tsconfig.test.json`, `tsdown.config.ts`, `vitest.config.ts`, `eslint.config.js`,
`biome.json`, `.gitignore`, `.npmignore`, `LICENSE`, `.github/workflows/ci.yml`,
**`src/cli.ts` als Platzhalter** (hier angelegt, in AP15 verdrahtet),
**`scripts/generate.ts` als Platzhalter** (hier angelegt, in AP03 befüllt), `test/setup.ts`.
*Definition of Done:* Alle Versionen aus 13.1 exakt eingetragen, Lockfile eingecheckt.
`pnpm build` erzeugt `dist/cli.js` mit Shebang und Dateimodus 755. `node dist/cli.js
--version` gibt die Version aus `package.json` aus. `pnpm test` läuft durch, und der
Selbsttest „`disableNetConnect()` ist aktiv" ist grün. `pnpm lint` und `pnpm format --check`
sind grün. **CI läuft auf Node `22.19.0` und `24.11.0`** — den beiden Untergrenzen, die
`tsdown@0.23.0` zulässt (13.1); Node 23.x, 24.0 bis 24.10 und 25.x stehen ausdrücklich **nicht**
in der Matrix, weil `tsdown` dort nicht baut. Dazu `fail-fast: false` und
`permissions: contents: read`. Genau **ein** `bin`-Eintrag: `{"bbutler-mcp": "./dist/cli.js"}`.
**`.gitignore` enthält `src/registry/index.generated.ts`** (4.2); die Datei wird zu keinem
Zeitpunkt eingecheckt.

**Zu `src/cli.ts`, verbindlich, damit dieses Paket ohne die späteren bauen kann.** AP01 legt
die Datei als **Platzhalter** an, mit genau vier Eigenschaften:

1. Shebang `#!/usr/bin/env node`, Dateimodus 755 über `tsdown.config.ts`.
2. `--version` gibt die Version aus. Die Quelle ist in diesem Zustand eine Konstante, die
   `tsdown.config.ts` beim Bau aus `package.json` einsetzt, **nicht** `src/generated/version.ts`:
   Dieses Modul entsteht erst in AP03. AP15 stellt die Zeile beim Verdrahten auf
   `src/generated/version.ts` um, damit am Ende genau eine Versionsquelle übrig bleibt; kein
   JSON-Lesen zur Laufzeit.
3. `--help` gibt die Befehlsübersicht aus 8.1 aus.
4. Jeder andere Aufruf, der Aufruf ohne Argument eingeschlossen, endet mit Rückgabewert 1 und
   einer Zeile auf stderr: „Dieser Einstiegspunkt ist noch nicht verdrahtet (AP15)."

**Der Platzhalter importiert nichts aus `src/index.ts`, `src/server/*` oder `src/cli/*`.**
Diese Module entstehen erst in AP10 und AP15; ein Import darauf — statisch wie dynamisch —
ließe unter NodeNext `tsc --noEmit` und den Bau in AP01 scheitern, und beides verlangt die
Definition of Done grün. Der Kommentar am Dateikopf lautet deutsch: „Platzhalter, wird in AP15
verdrahtet." Damit ist diese Datei genauso gelöst wie `src/server/instructions.ts` und
`src/server/resources.ts` zwischen AP10 und AP14, und die Eigentümerschaft bleibt eindeutig.

**Zusätzlich, weil `package.json` exklusiv diesem Paket gehört und sieben spätere Pakete darin
Einträge brauchen** (AP03, AP05, AP11, AP14, AP16, AP17, AP21)**:** Sämtliche Abhängigkeiten aus
13.2 und 13.3 sind **vollständig** eingetragen,
`@anthropic-ai/mcpb` eingeschlossen, und **`zod` steht als dritte Laufzeitabhängigkeit in
`dependencies`** (13.2). **Ebenso eingetragen ist der Tokenizer `gpt-tokenizer@4.0.0` als
`devDependency`** (13.3); ohne ihn ist P11 in AP11 nicht schreibbar, und AP11 darf
`package.json` nicht anfassen. Ein Testimport aus `src/` (`import { z } from "zod"`) löst unter
`pnpm@10.34.3` auf; ein Einzeltest belegt das, damit der Fehler nicht erst in AP05 auffällt.
Ebenso sind **alle** später benötigten npm-Skripte angelegt, namentlich: `build`, `test`,
`typecheck`, `lint`, `format`, `generate` (Platzhalter hier, Inhalt in AP03),
`measure-tokens` (AP14), `check-size` (AP16), `contract:read` (AP17), `build-mcpb` (AP21).
Skripte, deren Zielskript noch nicht existiert, sind angelegt und schlagen mit einer
sprechenden Meldung fehl; **kein späteres Paket fasst `package.json` an**.

**Drei Skripte rufen den Generator als ersten Schritt auf**, weil `src/registry/index.generated.ts`
nicht eingecheckt wird (4.2) und ab AP10 von `src/index.ts` und `src/server/register-tools.ts`
importiert wird:

```jsonc
"generate":  "node scripts/generate.ts",
"build":     "pnpm generate && tsdown",
"test":      "pnpm generate && vitest run",
"typecheck": "pnpm generate && tsc --noEmit",
```

Die Skripte unter `scripts/` werden **direkt von Node ausgeführt**; ab der in 13.1 festgelegten
Untergrenze `>=22.19.0` entfernt Node die Typannotationen selbst, und 13.3 führt bewusst keinen
zusätzlichen TypeScript-Starter als Entwicklungsabhängigkeit.

**Die Verkettung steht im Skript selbst und nicht in `pre`-Lebenszyklusskripten.** Grund: pnpm
führt `pre`- und `post`-Skripte nur aus, wenn `enable-pre-post-scripts` gesetzt ist; eine
Verkettung im Skript wirkt unabhängig von dieser Einstellung, und ein Testlauf ohne erzeugten
Index wäre kein roter Test, sondern ein leeres Register und damit eine Prüfung, die nichts
prüft.

**Zu `scripts/generate.ts`, verbindlich, damit dieses Paket grün abschließen kann.** AP01 legt
die Datei als **Platzhalter** an: Sie schreibt eine Zeile auf stderr („Noch kein Generator
vorhanden; die Untergeneratoren entstehen in AP03 und AP04.") und endet mit Rückgabewert **0**.
Das ist die einzige Ausnahme von der Regel, dass Platzhalterskripte fehlschlagen, und sie ist
notwendig: `build`, `test` und `typecheck` rufen `generate` auf, und alle drei verlangt die
Definition of Done grün. Zu diesem Zeitpunkt gibt es weder einen Untergenerator noch eine
Registerdatei, es ist also auch nichts zu erzeugen. **AP03 ersetzt den Inhalt** durch die
Verzeichnisabfrage über `scripts/gen-*.ts`; der Rückgabewert 0 bei fehlenden Untergeneratoren
bleibt dabei erhalten. Der Kommentar am Dateikopf lautet deutsch: „Platzhalter, wird in AP03
befüllt."

---

**AP02 — SDK-Ladeprobe**
*Hängt ab von:* AP01.
*Dateien (exklusiv):* `docs/entwicklung/befund-sdk.md` (neu).
*Definition of Done:* Ein Wegwerf-Server mit genau einem Werkzeug unter
`@modelcontextprotocol/server@2.0.0` wurde in Claude Code, Claude Desktop und OpenAI Codex CLI
geladen. Je Client ist protokolliert, ob `initialize` und `tools/list` beantwortet wurden.
Die Entscheidungsregel aus 13.2 ist angewendet und das Ergebnis festgehalten. **Dieses Paket
blockiert AP03 bis AP11 nicht**, weil die Schemaschicht die Umstellung auf eine Datei
begrenzt; es muss aber vor AP10 abgeschlossen sein.

---

**AP03 — Generatoren und Generat**
*Hängt ab von:* AP01.
*Dateien (exklusiv):* **`scripts/generate.ts`** (angelegt in AP01, hier befüllt — AP03 schreibt
den Inhalt, legt die Datei aber nicht an), `scripts/gen-endpoints.ts`,
`scripts/gen-errors.ts`, `scripts/gen-version.ts`, `src/generated/endpoints.ts`,
`src/generated/errors.ts`, `src/generated/version.ts`, `test/unit/generated.test.ts`.
*Definition of Done:* `src/generated/endpoints.ts` enthält **54 Pfade und 371 Parameter**,
HTML entfernt, Entities aufgelöst, die 32 Arrays ohne `items` markiert, die neun
`schema`-Parameter aufgelöst. `src/generated/errors.ts` enthält **786 Paare (Pfad,
`error_code`)**; ein Test zählt beide Zahlen und bricht bei Abweichung ab.
`src/generated/version.ts` liefert die echte Version, mit Test gegen das stille Scheitern.

**Zu den beiden Meldungstexten je Paar, verbindlich nach 5.6:** Das Feld `message` stammt aus
`properties.message.enum[0]` der über `$ref` aufgelösten Definition, das Feld `summary` aus
`responses[…].description`. Beide werden erzeugt, keines wird aus dem anderen abgeleitet. Der
Generator gibt die Zahl der Paare aus, bei denen sich beide unterscheiden; **ein Test hält
diese Zahl auf 179 fest** und schlägt bei Abweichung fehl, weil eine veränderte Zahl eine
veränderte Spezifikationsdatei anzeigt. Schlüssel der ersten Ebene ist der **unveränderte
Spezifikationspfad**, auch bei den vier Pfaden mit Platzhalter (4.6).

**`scripts/generate.ts` ruft die Untergeneratoren nicht aus einer fest verdrahteten Liste
auf**, sondern über eine Verzeichnisabfrage: Es liest `scripts/`, nimmt jede Datei, die auf
`gen-*.ts` passt, ruft sie in alphabetischer Reihenfolge auf und **überspringt, was noch nicht
existiert**, mit einer Zeile auf stderr; fehlt jeder Untergenerator, endet es trotzdem mit
Rückgabewert 0 (Platzhalterregel in AP01). Begründung: `scripts/gen-registry-index.ts` gehört
AP04 und `scripts/gen-tool-table.ts` gehört AP20; AP03 läuft gleichzeitig mit AP04 und lange
vor AP20 und darf weder in deren Dateien schreiben noch auf sie warten.

**Die Abnahme „`pnpm generate` erzeugt eine leere Differenz" gilt in diesem Paket ausschließlich
für die drei hier erzeugten Dateien** `src/generated/endpoints.ts`, `src/generated/errors.ts`
und `src/generated/version.ts`. Der CI-Schritt in `ci.yml` (AP01) ist bewusst generisch
formuliert — `pnpm generate`, danach `git diff --exit-code` — und deckt damit zu jedem
Zeitpunkt genau die **versionierten** Generate ab, die es dann gibt. Er muss beim Hinzukommen
von `gen-registry-index.ts` (AP04) und `gen-tool-table.ts` (AP20) **nicht** geändert werden:
Die Werkzeugtabelle der README (AP20) ist eingecheckt und wird vom Schritt mitgeprüft, und
`src/registry/index.generated.ts` (AP04) steht in `.gitignore` (4.2, AP01), ist also nicht
versioniert und kann in `git diff` bauartbedingt nicht auftauchen. Damit scheitert der Schritt
weder an einer nicht eingecheckten Datei noch daran, dass fünf Registerpakete gleichzeitig
laufen.

---

**AP04 — Registertypen, Klassen, Pflichtsätze, Index**
*Hängt ab von:* AP01.
*Dateien (exklusiv):* `src/registry/types.ts`, `src/registry/classes.ts`,
`src/registry/mandatory-sentences.ts`, `src/registry/budget.ts`,
`scripts/gen-registry-index.ts`.
**Ausdrücklich nicht in dieser Liste: `src/registry/index.generated.ts`.** Die Datei wird nicht
eingecheckt (4.2), steht in `.gitignore` (AP01) und gehört deshalb keinem Arbeitspaket. AP04
baut den Generator, nicht dessen Ausgabe; jedes Paket erzeugt sie über `pnpm generate` lokal
neu, und genau das ist die Voraussetzung dafür, dass AP12a bis AP12e echt parallel laufen
können, ohne in dieselbe Datei zu schreiben (11.3).
*Definition of Done:* Der Typ `ToolEntry` aus 2.1 steht vollständig, **einschließlich der dort
ausgeschriebenen Hilfstypen** `FieldSpec`, `ResponseContract`, `ContractFieldType`,
`VerifySpec`, `DuplicateSpec`, `CrossCheckId` und `PathSpec` (4.6). Die sechs Klassen und
ihre vier Annotationswerte liegen als Daten vor, nicht als Code. Die sieben Pflichtsätze U1
bis U7 aus 3.5 stehen **wörtlich und auf Deutsch** als Konstanten. `budget.ts` enthält die
Werte **32.000** und **2.100** sowie die drei Stufenbudgets aus 4.9 (900 / 700 / 480) und die
drei namentlichen Stufenlisten, gegen die P8 und P11 prüfen. **Dazu die Konstante
`CHARS_PER_TOKEN` mit dem Annahmewert 3,2 aus 4.10**, die `response/truncate.ts` (7.6) und
`doctor` (8.4) zur Laufzeit benutzen; sie ist die einzige Konstante dieser Datei, die AP14 nach
der Messung ändern darf, und sie trägt einen deutschen Kommentar, der sie als Annahme
kennzeichnet und auf 4.10 verweist. Der Indexgenerator läuft gegen ein
leeres Verzeichnis ohne Fehler und prüft „Dateiname gleich exportierter Name". Er ist
**mehrfach ausführbar ohne Nebenwirkung** und erzeugt bei gleichem Verzeichnisinhalt
zeichengleiche Ausgabe (stabile Sortierung nach Dateiname), damit zwei Läufe auf verschiedenen
Rechnern nicht auseinanderlaufen.

---

**AP05 — Schemaschicht**
*Hängt ab von:* AP03, AP04.
*Dateien (exklusiv):* `src/schema/primitives.ts`, `vocab.ts`, `pagination.ts`, `order.ts`,
`line-items.ts`, `batch.ts`, `cross-checks.ts`, `build.ts`; `test/unit/schema-*.test.ts`.
*Definition of Done:* Aus einem Beispiel-`ToolEntry` entsteht ein Zod-Objekt mit `.strict()`
und daraus ein JSON Schema Draft 2020-12. **`zod` wird direkt importiert und ist nach AP01 in
`dependencies` deklariert** (13.2). Alle Bausteine aus 4.5 vorhanden, alle
Beschreibungsmuster auf Deutsch. **Beim Währungsfeld gibt es keinen Baustein über alle fünf
Vorkommen** (4.5); **wohl aber je Ressource einen**: `currencyReceipts()` liefert den freien
String samt Beschreibungstext für die Werkzeuge 4 und 5, `currencyTransactions()` das `enum`
mit den 48 Codes samt Hinweissatz für die Werkzeuge 12 und 13. Damit ist der Gleichlauf aus
Regel R-A konstruktiv erfüllt und nicht bloß verabredet; ein Test belegt, dass beide Bausteine
je an zwei Werkzeugen dasselbe Fragment erzeugen. Die drei `order`-Schemata sind
getrennt; das von `/postings/get` trägt **alle sieben** Werte aus 4.8. Die Positionsliste
erzeugt parallele Arrays gleicher Länge, sowohl auf oberster Ebene als auch je Stapelelement
(4.8). **Q1 bis Q8** sind umgesetzt, jede mit einem positiven und einem negativen Testfall;
die gestrichene Summenprüfung und der gestrichene Ausschluss aus 4.7 werden **nicht**
implementiert. **`line-items.ts` und `batch.ts` setzen `maxItems` auf denselben Wert
`min(50, BB_MCP_MAX_BATCH)`** (6.2, Q4 in 4.7), auch für die geschachtelten Positionslisten der
Werkzeuge 22 und 24; ein Test belegt, dass `BB_MCP_MAX_BATCH=10` beide Arten von Array auf zehn
begrenzt. **`amountIn()` markiert das erzeugte Fragment**, damit Guard 5 die Betragsfelder
ohne zweite Namensliste findet (1.4, AP10).

---

**AP06 — Konfiguration**
*Hängt ab von:* AP01.
*Dateien (exklusiv):* `src/config/env.ts`, `credentials-file.ts`, `resolve.ts`, `redact.ts`;
`src/logging/stderr.ts`; `test/unit/config-*.test.ts`.
*Definition of Done:* Alle Variablen aus 6.2 mit Typ, Vorgabe und Prüfregel.
Auflösungsreihenfolge aus 6.3. Abbruch bei ungültigem Wert **und** bei Widerspruch zwischen
`BB_MCP_READ_ONLY` und `BB_READ_ONLY`. Start bei fehlenden Zugangsdaten mit dem Text aus 6.5.
Warnung mit nächstähnlichem Namen bei jeder unbekannten `BB_*`-Variablen. Rechteprüfung 0600.
Konfigurationsobjekt eingefroren. `redact.ts` erwischt die drei Geheimnisse auch
base64-kodiert, in einer URL und in einem JSON-Fragment.

---

**AP07 — HTTP-Schicht**
*Hängt ab von:* AP01, AP06.
*Dateien (exklusiv):* `src/http/client.ts`, `auth.ts`, `envelope.ts`, `rate-limiter.ts`,
`retry.ts`, `dispatcher.ts`, `transport-error.ts`; `test/helpers/mock-api.ts`;
`test/unit/http-*.test.ts`.
*Definition of Done:* Der eine `fetch`-Aufrufer nach 5.1. Content-Type-Prüfung vor dem Parsen.
Umschlagzerlegung mit `shape`-Abgleich. Rate-Limiter mit **Eimerschlüssel `api_key`**,
serialisiert, vier Eimer nach 5.4; zehn gleichzeitige Aufrufe laufen nicht gemeinsam durch.
**Der Retry-Zweig wird von `toolClass === "R"` freigeschaltet und liegt nicht im Client als
Allgemeingut**; jeder Versuch entnimmt ein eigenes Token; Jitter `[0,5; 1,5]` um den vollen
Wert. Alle HTTP-Fälle aus 9.4 sind abgedeckt.

---

**AP08 — Fehlerschicht**
*Hängt ab von:* AP03, AP07.
*Dateien (exklusiv):* `src/errors/catalog.ts`, `classify.ts`, `render.ts`,
`write-uncertainty.ts`; `test/unit/errors-*.test.ts`.
*Definition of Done:* Der Katalog ist über **(`specPath`, `error_code`)** erreichbar — bei den
vier Werkzeugen mit Pfadvorlage also über den Spezifikationspfad und **nicht** über den
gebauten Pfad (4.6) —, wird **dynamisch** geladen und deckt alle 786 Paare ab. Die
Klassenspalte ist von Hand geprüft; die Prüfung ist im Diff sichtbar. Die vier Sonderfälle aus
5.6 sind ausformuliert. Jede Meldung trägt vier Blöcke und **genau eine** der drei
Zustandsformulierungen aus 5.8; ein Test lehnt jede vierte Formulierung ab.
`write-uncertainty.ts` erzeugt den Text aus `verifyWith` plus den Argumenten des
fehlgeschlagenen Aufrufs.

**Drei Punkte aus 5.6 sind hier ausdrücklich abzuhaken, weil sie leicht durchrutschen:**

1. **Der Wortlaut der Antwort gewinnt.** Der Vierblock zitiert das `message`-Feld der
   tatsächlichen Antwort; der Katalogtext tritt nur ein, wenn die Antwort keinen verwertbaren
   Text trägt, und dann mit dem Zusatz „Text laut Spezifikation, nicht der Wortlaut dieser
   Antwort". Ein Test spielt eine Antwort mit einem Text ein, der in **keiner** der beiden
   Spezifikationsquellen steht (der live gemessene `invalid field specified`, L6), und verlangt
   genau diesen Text in der Meldung.
2. **Keine Gleichheitsvergleiche auf Meldungstexte.** `classify.ts` entscheidet über
   (`specPath`, `error_code`, HTTP-Status); wo die Klasse `special` den Text auswertet,
   geschieht das über Teilzeichenketten ohne Rücksicht auf Groß- und Kleinschreibung. Ein
   Lint- oder Testschritt belegt, dass in `classify.ts` kein `===`-Vergleich gegen einen
   Katalogtext steht.
3. **Die elf Paare mit Code 15** sind über den HTTP-Status unterschieden, nicht über den
   Wortlaut (siehe unten).

**Die Handprüfung der Spalte `cls` ist für die elf Paare mit `error_code` 15 ausdrücklich
verpflichtend** und wird namentlich abgehakt (Fußnote in 5.6): Die **zehn** Pfade mit HTTP 403
— `/receipts/addBatch`, `/receipts/upload`, `/transactions/add`, `/transactions/addBatch`,
`/transactions/assign-batch/receipt`, `/postings/add-batch/receipts`,
`/postings/add-batch/transactions`, `/postings/add-batch/free`, `/settings/add-batch/debtors`,
`/settings/add-batch/creditors` — tragen `cls: "transient"`, auch `/transactions/add`, das
weder Stapel noch Upload ist. Das **elfte** Paar, `/receipts/get` mit HTTP **400**, trägt
`cls: "input"`. Unterschieden werden die elf Paare über den **HTTP-Status**, nicht über den
Meldungstext: Der Katalog führt dort `adding temporarily restricted`,
`upload temporarily restricted` und `invalid sort field specified`, live kam an `/receipts/get`
jedoch `invalid field specified` (L6). Ein Test fährt genau diese elf Paare ab; eine
automatische Ableitung aus dem Meldungsmuster `invalid …` würde `/transactions/add` falsch
einstufen und dem Agenten bei einer vorübergehenden Drosselung sagen, ein späterer Versuch
helfe nicht.

---

**AP09 — Mapping, Antwortaufbereitung, Stammdatenspeicher, Golden-Dateien**
*Hängt ab von:* AP05, AP06, AP07.
*Dateien (exklusiv):* `src/mapping/*`, `src/response/*`, **`src/cache/store.ts`**,
`test/golden/*`, `test/unit/mapping-*.test.ts`, `test/unit/response-*.test.ts`,
**`test/unit/cache-*.test.ts`**.
*Definition of Done:* Hinrichtung mit Umbenennungen aus **Anhang A**, Pfadbau nach 4.6,
Positionsliste nach 4.8. **`mapping/path.ts` gibt ein Paar aus gebautem Pfad und `specPath`
zurück**, nie eine einzelne Zeichenkette; der Body der vier Werkzeuge mit Pfadvorlage trägt
**kein** Feld `id_by_customer`, und zwei Negativtests belegen beides (4.6 Regeln 5 und 6). **`mapping/parallel-arrays.ts` erzeugt parallele Arrays ausschließlich
für die fünf Endpunkte mit Arrays auf oberster Ebene und für die geschachtelten Positionslisten
der beiden Stapelendpunkte 22 und 24**; für `/postings/add/free` (skalar),
`/postings/add-batch/free`, `/settings/add-batch/*`, `/receipts/addBatch`,
`/transactions/addBatch` und `/transactions/assign-batch/receipt` (alle bereits Objektlisten)
findet **keine** Umformung statt. Rückrichtung mit dem Antwortvertrag je Endpunkt,
`_contract_warnings` nach 7.3, Normalisierung nach 7.4 (**Beträge bleiben String plus
`amount_cents`, niemals `number`**; Kennungen immer String). Projektion `concise`/`detailed`.
Drei Bestandszeilen nach 7.5, **auf Deutsch und wörtlich**. Die Auflösung der Schreibantwort
nach 7.6 setzt **keinen** zusätzlichen Request ab. Kürzung nach 7.6, Base64 nie im Text.
Sanitizer für Freitext. Die Golden-Dateien aus 0.3 sind angelegt, je mit Herkunftszeile,
Geschäftsdaten erfunden.

**Zusätzlich der Stammdatenspeicher `src/cache/store.ts`** (Entscheidung S23, Verhalten 7.8).
Er liegt in diesem Paket, weil `mapping/response.ts` sein einziger Leser im Ausführungspfad ist
(7.4, Auflösung sprechender Kontobezeichnungen); AP10 und AP14 rufen ihn nur auf.
Definition of Done dazu:

- **Haltbarkeit aus `BB_MCP_CACHE_TTL_MS`** (6.2), gelesen aus der eingefrorenen Konfiguration
  (AP06). **`0` ist die Vorgabe und schaltet ihn vollständig ab:** Bei `0` legt der Speicher
  nichts ab, liefert nie einen Treffer, und es gibt keinen Zweig, in dem ein abgelaufener Wert
  trotzdem benutzt wird. Ein Test prüft genau das.
- **Ablauf über eine einspeisbare Uhr**, nicht über `Date.now()` im Modul, damit der Ablauf
  ohne Warten prüfbar ist.
- **Invalidierung strikt nach dem Feld `invalidatesCache` des Registereintrags** (2.1, Tabelle
  in 7.8). Die Zuordnung wird **nicht** im Cache-Modul wiederholt; das Modul bekommt die
  Werkzeugnamen übergeben. Ein Test fährt die vier Zeilen aus 7.8 durch, einschließlich der
  nicht offensichtlichen: Jedes Debitoren- und Kreditorenwerkzeug verwirft auch den Stand von
  `bb_postingaccounts_search`.
- **Zusicherung als Negativtest: `/accounts/get` und alle Bewegungsdaten werden nie
  zwischengespeichert.** Der Test ruft `bb_payment_accounts_list`, `bb_receipts_search`,
  `bb_transactions_search` und `bb_postings_search` bei eingeschaltetem Speicher zweimal auf
  und verlangt **zwei** Requests am Mock. Speicherfähig sind ausschließlich die vier Werkzeuge
  der Tabelle in 7.8.
- **Die Schnittstelle ist so schmal, dass sie von AP10 und AP14 aufrufbar ist, ohne die Datei
  zu ändern:** Ablegen, Lesen, Verwerfen nach Werkzeugnamen und eine Abfrage „ist der Speicher
  eingeschaltet", die die Resource `bb://postingaccounts` (7.7) für ihren Absagetext braucht.

---

**AP10 — Guards, generischer Handler, Server**
*Hängt ab von:* AP02, AP04, AP06, AP07, AP08, AP09.
*Dateien (exklusiv):* `src/guards/configured.ts`, `read-only.ts`, `limits.ts`,
`duplicate-check.ts`; `src/server/create-server.ts`, `register-tools.ts`, `shutdown.ts`;
`src/index.ts`; **`src/server/instructions.ts` und `src/server/resources.ts` als Platzhalter**
(angelegt in AP10, inhaltlich befüllt in AP14); **`test/unit/guards-*.test.ts`,
`test/unit/server-*.test.ts`**.
*Definition of Done:* **Genau ein** generischer Handler, Guardreihenfolge exakt nach 1.4.
Jeder Abbruch vor dem ersten Byte trägt den Zustandssatz 1 aus 5.8 („Es ging nichts an
BuchhaltungsButler hinaus …"). Der Duplikatshinweis ist **standardmäßig abgeschaltet** (6.2),
blockiert nie und läuft bei Stapelwerkzeugen **einmal für den ganzen Stapel**. Der Server
startet mit drei Beispieleinträgen (je einem lesenden, anlegenden, löschenden), beantwortet
`initialize` und `tools/list`, fährt bei SIGINT, SIGTERM und stdin-Ende idempotent herunter,
und `unhandledRejection` sowie `uncaughtException` schreiben nach stderr. **stdout trägt
ausschließlich JSON-RPC.** Ab hier ändert sich der Ausführungspfad nicht mehr.

**Was Guard 5 auswertet, verbindlich**, damit die Grenze aus 6.2 nicht an einer Feldliste
hängt, die jemand nachpflegen muss:

- **Mengengrenze `min(50, BB_MCP_MAX_BATCH)`:** jedes Feld des Registereintrags, das
  `itemFields` trägt — also die Behälter der acht Stapelendpunkte und die Positionslisten
  `positions` und `items` —, **und zusätzlich jede geschachtelte Positionsliste innerhalb eines
  Stapelelements** (Werkzeuge 22 und 24). Beide Ebenen werden getrennt geprüft, nichts wird
  aufsummiert. Das ist genau die Werkzeugmenge von Q4 in 4.7.
- **Betragsgrenze `BB_MCP_MAX_AMOUNT`:** jedes Betragsfeld eines Werkzeugs der Klassen A und B,
  skalar wie je Position. Gefunden werden sie über die Markierung, die `amountIn()` aus 4.5
  setzt (AP05), nicht über eine zweite Namensliste.
- Beide Prüfungen melden **positionsgenau**, welches Feld und welcher Index die Grenze reißt,
  und tragen den Zustandssatz 1 aus 5.8.

**Die Einheitstests dieses Pakets** (`test/unit/guards-*.test.ts`,
`test/unit/server-*.test.ts`) decken ab, was die Prosa oben verlangt, und sind Teil der
Abdeckungsschwelle aus 9.5:

1. **Guardreihenfolge nach 1.4**, an einem Aufruf, der gegen mehrere Guards zugleich verstößt:
   Es meldet der **erste** Guard der Reihenfolge, und kein späterer läuft.
2. **Zustandssatz 1 aus 5.8 zeichengenau** bei jedem Abbruch vor dem Request, für alle sechs
   Guards, und der MockAgent sieht dabei **keinen** Request.
3. **Duplikatsguard**: standardmäßig aus, also kein Zusatzrequest; eingeschaltet blockiert er
   nicht, sondern landet in der Antwort; bei einem Stapelwerkzeug läuft er **einmal für den
   ganzen Stapel**, nicht je Element.
4. **Herunterfahren ist idempotent**: SIGINT, SIGTERM und stdin-Ende einzeln, dazu ein
   doppeltes Signal und zwei Signale hintereinander; der Abbau läuft genau einmal, und der
   Prozess bleibt nicht hängen.
5. **stdout bleibt sauber**, auch wenn ein Handler wirft: Der Fehler geht als `isError: true`
   ins Ergebnis (5.8) und die Diagnose nach stderr.
6. **Der Stammdatenspeicher wird vom Handler nach 1.4 und 7.8 befragt, gefüllt und
   verworfen**; das Modul selbst gehört AP09 und wird hier nur aufgerufen. Geprüft wird beides:
   Bei der Vorgabe `BB_MCP_CACHE_TTL_MS=0` greift **kein** Zweig davon, und bei
   eingeschaltetem Speicher weist die Antwort den Treffer aus (7.8 Punkt 2).

**Zu den beiden Platzhalterdateien.** `create-server.ts` übergibt die `instructions` beim Bau
des `McpServer` und registriert die Resources; ohne beide Module ist das Paket nicht
typprüfbar, und AP14 entsteht erst nach AP12a bis AP12e. Deshalb legt AP10 sie an:
`instructions.ts` exportiert eine Funktion mit der endgültigen Signatur, die den Zustandsblock
aus 6.7 Punkt 1 erzeugt und sonst eine leere Zeichenkette liefert; `resources.ts` exportiert
eine Registrierfunktion mit der endgültigen Signatur, die **keine** Resource registriert. Beide
tragen einen deutschen Kommentar „Platzhalter, wird in AP14 befüllt". **AP10 schreibt keinen
Inhalt aus 6.7 Punkte 2 bis 8 und keine der vier Resources aus 7.7**; das ist und bleibt AP14.

---

**AP11 — Die dreizehn Registerprüfungen, geschrieben VOR den Einträgen**
*Hängt ab von:* AP03, AP04.
*Dateien (exklusiv):* `test/registry/*.test.ts`, `test/registry/class-list.ts` (die zweite,
unabhängig gepflegte Klassenliste für P5), `test/registry/effect-list.ts` (die aus
`grundlagen.md` 7.3 abgeschriebene Wirkungstabelle für P6),
`test/helpers/registry-fixtures.ts`.
*Definition of Done:* P1 bis P13 aus 9.2 sind geschrieben und laufen gegen das **leere**
Register **rot**. Jede Fehlermeldung nennt den betroffenen Pfad beziehungsweise
Parameternamen, damit sie beim Befüllen als Arbeitsliste taugt. Das ist der Paketschnitt, der
AP12a bis AP12e ohne Abstimmung ermöglicht.

Zwei Punkte sind besonders leicht falsch zu schreiben, wenn man die Einträge noch nicht vor
sich hat, und deshalb hier ausbuchstabiert:

- **P3, zweite Stufe, löst `$ref` auf.** `.items` der Behälterdefinition trägt bei sieben der
  acht Fälle nur ein `$ref` auf die Elementdefinition und **kein** `properties`; nur
  `PostingsFree` führt es inline. Maßgeblich ist die zweispaltige Tabelle in 4.4 Punkt 3. Der
  Test deckt **beide** Zweige mit je einem Fall ab (`ReceiptsPostings` → `ReceiptPostings` für
  `$ref`, `PostingsFree` für inline) und schlägt fehl, wenn er weder `$ref` noch `properties`
  findet. Ohne diesen Punkt bekämen die fünf AP12-Bearbeiter eine falsche Arbeitsliste.
- **P11 zählt Token mit dem Tokenizer aus 13.3** (`gpt-tokenizer`, in AP01 als
  `devDependency` eingetragen), **nicht** über die Konstante `CHARS_PER_TOKEN`. P11 ist damit
  hier vollständig lauffähig und wartet auf keine Messung aus AP14 (4.10). Die Stufenbudgets
  aus 4.9 sind Zeichengrenzen und brauchen ohnehin keinen Tokenizer.
- **P12 liest den Index, den der Testlauf selbst erzeugt.** `pnpm test` ruft `pnpm generate`
  als ersten Schritt auf (AP01), und `src/registry/index.generated.ts` ist nicht eingecheckt
  (4.2). P12 vergleicht deshalb den **frisch erzeugten** Index mit dem Verzeichnisinhalt und
  prüft nicht, ob eine eingecheckte Datei veraltet ist. Ein Test, der die Datei als Eingabe
  voraussetzt, statt sie erzeugen zu lassen, scheitert auf einem frischen Klon.
- **P13 ist neu und prüft Daten, nicht Text** (`test/registry/response-contract.test.ts`):
  Jeder Name in `concise` muss als Schlüssel in `responseContract.fields` desselben Eintrags
  vorkommen. Die Fehlermeldung nennt Werkzeugname und den unbekannten Feldnamen, damit sie den
  fünf AP12-Bearbeitern als Arbeitsliste dient. Ohne P13 wäre die Projektion aus 7.4 der
  einzige Teil des Registereintrags, dessen Inhalt keine Prüfung berührt.

---

**AP12a — Registereinträge Belege (8 Werkzeuge)**
*Hängt ab von:* AP05, AP10, AP11.
*Dateien (exklusiv):* `src/registry/tools/bb_receipts_search.ts`, `bb_receipts_get.ts`,
`bb_receipts_list_transactions.ts`, `bb_receipts_create.ts`, `bb_receipts_create_batch.ts`,
`bb_receipts_upload.ts`, `bb_receipts_delete.ts`, `bb_receipts_restore.ts`.
*Definition of Done:* Acht vollständige Einträge, kein `TODO`. Jeder Parameter des Endpunkts
genau einmal, `api_key` in `omitted`. Pflichtsätze U1 und U2 richtig gesetzt. `verifyWith` bei
allen fünf schreibenden. Antwortverträge für `bb_receipts_search` und `bb_receipts_get` aus
den **gemessenen** Feldmengen in 0.3. P1 bis P13 für diese acht Einträge grün; `concise` und
`responseContract` decken sich (P13).

**Die drei Werkzeuge mit Pfadvorlage, verbindlich nach 4.6:** `bb_receipts_get`,
`bb_receipts_delete` und `bb_receipts_restore` tragen `path.template`, `path.params` **und
`path.specPath`** mit dem unveränderten Spezifikationspfad. Ihr Identifikatorfeld hat
`source: "path"` und ein leeres `apiNames`; **ein Body-Feld `id_by_customer` gibt es nicht**,
und zwar an keinem der drei. `bb_receipts_delete` und `bb_receipts_restore` tragen
`verified: false` mit der Begründung aus 4.6; ihre Beschreibungen bezeichnen die Aufrufform
**nicht** als gemessen. Der Antwortvertrag von `bb_receipts_get` enthält **`amount_original`
und `currency_original`**, die der Listenabruf nicht liefert und die die Spezifikation nicht
kennt (7.2).

**Währung, verbindlich nach 4.5 Regel R-A:** `currency` an `bb_receipts_create` (Werkzeug 4)
und `currency` je Element an `bb_receipts_create_batch` (Werkzeug 5) bekommen **denselben
Wertevorrat, dieselbe Pflichtigkeit und wortgleiche Beschreibungen**: freier String, Pflicht an
beiden, mit dem in 4.5 ausformulierten Satz zum Widerspruch der Spezifikation (3 Codes am
Endpunkt, 48 Codes plus `enum: ["EUR"]` am Stapelelement). **Kein Enum an diesen beiden
Feldern.** Beide Werkzeuge liegen in diesem Paket; der Gleichlauf ist deshalb hier
nachzuweisen und braucht keine eigene Registerprüfung. Der verworfene `enum: ["EUR"]` steht als
Belegstelle im Kommentar beider Einträge.

**Zum Registerindex, für alle fünf Registerpakete gleichermaßen:**
`src/registry/index.generated.ts` wird **nicht** eingecheckt (4.2) und steht in keiner der fünf
Dateilisten. Jeder Bearbeiter erzeugt ihn lokal über `pnpm generate`, was `build`, `test` und
`typecheck` ohnehin als ersten Schritt tun (AP01). Damit schreibt kein Paket in eine Datei, die
einem anderen gleichzeitig laufenden Paket gehört, und P12 bleibt trotzdem in jedem der fünf
Pakete lauffähig.

---

**AP12b — Registereinträge Zahlungen (8 Werkzeuge)**
*Hängt ab von:* AP05, AP10, AP11.
*Dateien (exklusiv):* `bb_transactions_search.ts`, `bb_transactions_get.ts`,
`bb_transactions_list_receipts.ts`, `bb_transactions_create.ts`,
`bb_transactions_create_batch.ts`, `bb_transactions_assign_receipt.ts`,
`bb_transactions_assign_receipt_batch.ts`, `bb_transactions_unassign_receipt.ts`.
*Definition of Done:* Wie AP12a. Zusätzlich: Antwortverträge aus den gemessenen Feldmengen
(6 gegen 13 Felder, `id_by_customer` als **Zahl**). `bb_transactions_get` trägt
`path.template`, `path.params` und **`path.specPath`** nach 4.6, sein Identifikatorfeld hat
`source: "path"` und ein leeres `apiNames`, und **ein Body-Feld `id_by_customer` gibt es
nicht**; die Aufrufform ist live bestätigt (L1), der Eintrag trägt also **kein**
`verified: false`.

**Währung, verbindlich nach 4.5 Regel R-A:** `currency` an `bb_transactions_create`
(Werkzeug 12) und `currency` je Element an `bb_transactions_create_batch` (Werkzeug 13)
bekommen **denselben Wertevorrat, dieselbe Pflichtigkeit und wortgleiche Beschreibungen**:
`enum` mit den **48** in 4.5 ausgeschriebenen Codes — den 47 des Endpunkts plus `RSD` — und
**an beiden optional**. Der `enum: ["EUR"]` der Definition `Transaction` wird verworfen und
steht als Belegstelle im Kommentar beider Einträge. **`currency` ist an `/transactions/add`
ausdrücklich kein Pflichtfeld**; die Verschärfung des Entwurfsstandes ist zurückgenommen (4.3),
und das Register enthält damit **keine einzige** Verschärfung gegenüber der Spezifikation.
Stattdessen tragen beide Felder den Satz aus 4.3, dass ohne Angabe die Währung des
Zahlungskontos gilt und dass die API diese nirgends preisgibt; P8 prüft ihn an beiden.
Beide Werkzeuge liegen in diesem Paket, der Gleichlauf ist deshalb hier nachzuweisen.

**Es gibt keine Querprüfung zum Zusammenspiel von
`id_by_customer_from`/`_to` und der Sortierung**: `/transactions/get` hat keinen
`order`-Parameter, und die Spezifikation erlaubt die Kombination mit Datumsfiltern
ausdrücklich. Stattdessen trägt die Beschreibung **beider** Felder den Pflichtsatz aus 4.7
(„Setzt die Sortierung auf id_by_customer ASC, auch in Kombination mit date_from und
date_to."), den P8 prüft. `bb_transactions_assign_receipt_batch` bekommt die Objektliste
`assignments` als **reine Umbenennung** von `transactions_to_receipts`, ohne Umformung (4.8).
Die Umbenennung `account` → `payment_account_number` ist an `/transactions/get` und
`/transactions/add` umgesetzt und in der Beschreibung erklärt.

---

**AP12c — Registereinträge Buchungen (12 Werkzeuge)**
*Hängt ab von:* AP05, AP10, AP11.
*Dateien (exklusiv):* die zwölf Dateien `bb_postings_*.ts`.
*Definition of Done:* Wie AP12a. Zusätzlich, **genau nach der Werkzeugtabelle am Ende von
4.8**, weil entgegen dem Entwurfsstand nur zwei der sechs Anlegewerkzeuge parallele Arrays auf
oberster Ebene haben, zwei weitere sie nur je Stapelelement und zwei überhaupt nicht:

- **Positionsliste `positions`** mit dem Deklarationssatz aus 4.8 nur an
  `bb_postings_create_for_receipt` (6 `apiNames`) und `bb_postings_create_for_transaction`
  (7 `apiNames`).
- **Geschachtelte Positionsliste je Stapelelement** an `bb_postings_create_for_receipt_batch`
  (Feld `receipts`, Definition `ReceiptPostings`, dort **`postingstexts`**) und
  `bb_postings_create_for_transaction_batch` (Feld `transactions`, Definition
  `TransactionPostings`, dort `postingtexts`).
- **`bb_postings_create_free`: keine Positionsliste.** Die acht skalaren Felder eins zu eins,
  `postingaccount_debit` und `postingaccount_credit` eingeschlossen. Die Beschreibung sagt, dass
  das Werkzeug genau eine Buchungszeile anlegt, und verweist für Splitbuchungen auf die beiden
  Werkzeuge oben.
- **`bb_postings_create_free_batch`: keine Umformung.** Objektliste `free_postings` nach
  Definition `PostingsFree`, API-Name unverändert.

**Es gibt keine Querprüfung „Summe der Positionsbeträge"** (Begründung in 4.7): Der Beleg- oder
Zahlungsbetrag ist an keinem der betroffenen Endpunkte ein Argument, die API prüft die Summe
selbst, und ihre Meldung steht im Fehlerkatalog. Pflichtsätze U3, U4 und U6 richtig verteilt.
**Die sieben `order`-Werte von `/postings/get` als Enum**, wörtlich in der Schreibweise der
Spezifikation: `default`, `date ASC`, `date DESC`, `date_last_action ASC`,
`date_last_action DESC`, `id_by_customer ASC`, `id_by_customer DESC`. Die Validierung der API
ist case sensitive; ein kürzeres Enum lehnt gültige Sortierungen unsichtbar ab (R4).
**`postingaccount` an `/postings/get` bleibt optional** und heißt im Schema
`postingaccount_filter` (Anhang A). `bb_postings_cancel` mit `idempotentHint: false` und dem
Storno-Hinweis. **Der Wegweiser aus 3.7 steht nicht in diesen zwölf Beschreibungen**, sondern in
den `instructions` (AP14).

---

**AP12d — Registereinträge Stammdaten (18 Werkzeuge)**
*Hängt ab von:* AP05, AP10, AP11.
*Dateien (exklusiv):* die vier `bb_debtors_*.ts`, die vier `bb_creditors_*.ts`, die drei
`bb_postingaccounts_*.ts`, die zwei `bb_payment_accounts_*.ts`, `bb_comments_create.ts`, die
vier `bb_cost_locations_*.ts`.
*Definition of Done:* Wie AP12a. Zusätzlich: Die vier `update`-Werkzeuge tragen
`destructiveHint: true`, `idempotentHint: true` und U5. `bb_postingaccounts_search` führt
`type` und `subtype` **immer** in `concise`. Bei `/settings/get/debtors`, `/creditors` und
`/postingaccounts` steht **kein `maximum`** im Schema, dafür der Warnsatz aus 7.5. Folgerichtig
enthält `crossChecks` der drei `settings`-Suchwerkzeuge **kein Q2**: Ohne belegte Obergrenze
gibt es keine Schranke, gegen die Q2 prüfen könnte, und ein erfundenes `maximum` lehnte gültige
Aufrufe unsichtbar vor dem Request ab (4.7, 14.2). `bb_cost_locations_search` trägt Q2 dagegen
sehr wohl, weil dort 1000 dokumentiert ist.
`invalidatesCache` nach 7.8 gesetzt, **inklusive der nicht offensichtlichen Zeile**, dass
jedes Debitoren- und Kreditorenwerkzeug den Sachkontenstand verwirft. **`bb_payment_accounts_create`
trägt ein leeres `invalidatesCache`**, weil `/accounts/get` nach 7.8 nie zwischengespeichert
wird; `bb_payment_accounts_list` steht deshalb in keiner Invalidierungszeile. Die 90 Adress- und
Kontaktfelder folgen dem Kurzmuster aus S4 (höchstens 80 Zeichen je Feld, deutsch).

---

**AP12e — Registereinträge Rechnungen und Berichte (8 Werkzeuge)**
*Hängt ab von:* AP05, AP10, AP11.
*Dateien (exklusiv):* die drei `bb_invoices_*.ts`, die fünf `bb_reports_*.ts`.
*Definition of Done:* Wie AP12a. Zusätzlich: Positionsliste `items` an den drei
Rechnungsendpunkten, mit sechs `apiNames` bei `bb_invoices_create` und
`bb_invoices_create_draft` und sieben bei `bb_invoices_create_einvoice` (4.8), **Q8** bei der
E-Rechnung. `verifyWith` der drei Rechnungswerkzeuge trägt `{ kind: "none", reason: … }` und
nennt ausdrücklich, dass die API keinen Leseweg anbietet. Die beiden `bb_reports_create_*`
tragen `destructiveHint: true`, U7, Eimer `reports`, den Anschlusshinweis aus 7.6 und
**`crossChecks: ["Q1"]`** (`date_from <= date_to`), weil beide Felder dort `required: true`
sind und ein vertauschter Zeitraum einen falschen Bericht erzeugt, der den vorherigen ersetzt.
**`bb_reports_get_bwa` und `bb_reports_get_sums` tragen Q1 ausdrücklich nicht**: Sie führen nur
`report_id_by_customer` und `get_files` und haben kein Datumsfeld. `bb_reports_get_ledger` trägt
Q1, weil `date_from` und `date_to` dort eigene Pflichtparameter sind. Die drei
`bb_reports_get_*` nennen die Vorbedingung und den Umstand, dass der erste Schritt bei aktivem
`BB_MCP_READ_ONLY` gesperrt ist. **Nach diesem Paket ist P1 grün.**

---

**AP13 — Belegupload**
*Hängt ab von:* AP07.
*Dateien (exklusiv):* `src/upload/source.ts`, `ssrf.ts`, `local-file.ts`, `sniff.ts`;
`test/unit/upload-*.test.ts`.
*Definition of Done:* base64 ist die Vorgabe. `https://` nur bei `BB_MCP_UPLOAD_FROM_URL`,
mit Adressprüfung **je Weiterleitungssprung**, Sperre privater Netzbereiche und laufender
Bytezählung. **Metadatendienste werden zusätzlich über den Hostnamen gesperrt** (etwa
`metadata.google.internal`), weil eine reine Adressprüfung den Namen nie zu sehen bekommt.
`file://` nur bei gesetztem `BB_MCP_UPLOAD_DIRS`, mit `realpath`, `O_NOFOLLOW`
und allen Prüfungen **am selben Deskriptor**. Dateityp über Magic Bytes, nicht über den
gemeldeten Content-Type. Dateinamen bereinigt, Pfadanteile, Steuer- und Bidi-Zeichen entfernt;
die Längenbegrenzung zählt **Codepoints**, damit kein Surrogatpaar zerrissen wird.
**Keine Fehlermeldung enthält einen Dateisystempfad.** Alle Ablehnungen fallen auf **eine**
Meldung ohne Datei-, Netz- oder Existenzdetails zusammen, Einzelheiten gehen nur nach stderr:
Eine hilfreiche Unterscheidung zwischen „gibt es nicht" und „ist gesperrt" macht das Werkzeug
zum Abfrageorakel für alles, was der Prozess erreichen kann.

---

**AP14 — Resources, `instructions`, Tokenmessung**
*Hängt ab von:* **AP09** (der Stammdatenspeicher `src/cache/store.ts`, den die Resource
`bb://postingaccounts` liest), AP12a, AP12b, AP12c, AP12d, AP12e.
*Dateien (exklusiv):* `src/server/instructions.ts` und `src/server/resources.ts` (beide
**angelegt in AP10, hier befüllt** — AP14 schreibt den Inhalt, legt die Dateien aber nicht an),
`scripts/measure-tokens.ts`, `docs/entwicklung/befund-tokenbudget.md`; dazu **in
`src/registry/budget.ts` ausschließlich die Konstante `CHARS_PER_TOKEN`** (angelegt in AP04,
hier auf den gemessenen Wert gesetzt). AP04 ist zu diesem Zeitpunkt längst abgeschlossen, ein
gleichzeitiger Schreibzugriff ist also ausgeschlossen.
*Definition of Done:* Die `instructions` nach 6.7, **auf Deutsch**, unter **2.100** Token, mit
Zustand (einschließlich der Zeile zur Duplikatsprüfung), Kontenkunde, Querschnittsregeln,
Paginierungsregel, Buchungswegweiser, Schreibhinweis und Resource-Liste. Die vier Resources aus
7.7 registriert; `bb://postingaccounts` fragt beim Stammdatenspeicher an, ob er eingeschaltet
ist, und meldet sonst genau das und nennt das Werkzeug (7.7).

`scripts/measure-tokens.ts` misst mit dem **echten Tokenizer aus 13.3**
(`gpt-tokenizer@4.0.0`, Kodierung `o200k_base`) und schreibt in die Befunddatei: die Tokenzahl
der 54 Definitionen, die der `instructions`, die Zeichenzahl beider und das daraus errechnete
Zeichen-je-Token-Verhältnis. **Der in 4.10 angesetzte Faktor 3,2 ist eine Annahme und wird hier
durch den gemessenen Wert ersetzt**, und zwar an genau zwei Stellen: in der Konstanten
`CHARS_PER_TOKEN` und als Zahlenangabe in der Befunddatei. **Die Befunddatei benennt
ausdrücklich, dass der Tokenizer ein Stellvertreter ist:** `o200k_base` ist die tatsächliche
Kodierung der GPT-4o-Linie, für die Claude-Linie ist der Tokenizer nicht öffentlich
dokumentiert (13.9). Das Ergebnis ist deshalb eine belastbare Größenordnung und keine exakte
Zahl für jeden Client.

**P11 wartet nicht auf dieses Paket**: Es zählt seit AP11 mit demselben Tokenizer (4.10). Was
sich hier ändert, ist allein der Schätzfaktor für die Laufzeit (7.6, 8.4) und die Nachprüfung
der Rechnung aus 4.10. Reißt das Budget, greift die Reihenfolge aus 4.10; **die Budgetgrenzen
in `src/registry/budget.ts` — 32.000, 2.100, 900, 700 und 480 — werden nicht angefasst.**

---

**AP15 — CLI, Einrichtungsassistent und Verdrahtung des Einstiegspunkts**
*Hängt ab von:* AP06, AP07, **AP10** (ohne `src/index.ts` und `src/server/create-server.ts`
ist die Verdrahtung von `src/cli.ts` nicht typprüfbar).
*Dateien (exklusiv):* `src/cli/**` (alle Dateien einschließlich `clients/`), **`src/cli.ts`**
(angelegt in AP01, hier befüllt — AP15 schreibt den Inhalt, legt die Datei aber nicht an),
`test/unit/cli-*.test.ts`.
*Definition of Done:* `setup` mit den neun Schritten aus 8.2, einschließlich der
Mandantenbestätigung über die gefundenen Zahlungskonten (Schritt 4) und des
Verifikationssatzes (Schritt 8). `doctor`, `test`, `profiles`, `print-config`, `uninstall`.
**Neun eigene Clientadapter plus die Sammeldatei `print-only.ts`** nach 8.3, gestaffelt nach
Vertrauen; die zwölf Clientkürzel aus 8.1 sind vollständig auf diese zehn Adapter abgebildet.
Eigene maskierte Eingabe ohne Zusatzabhängigkeit. Unterbefehle **dynamisch importiert**. Kein Geheimnis als Argument. Vor
jeder Änderung an einer bestehenden Datei eine Sicherung mit genanntem Pfad.

**`src/cli.ts` wird in diesem Paket verdrahtet** und verliert damit den Platzhalterzustand aus
AP01. Verbindlich:

1. **Ohne Unterbefehl startet der MCP-Server auf stdio** (8.1). Der Einstieg läuft über
   `src/index.ts` beziehungsweise `src/server/create-server.ts` aus AP10. Das ist der
   Normalfall und der Grund, warum in keiner Clientkonfiguration ein Argument hinter dem
   Paketnamen steht.
2. **Mit Unterbefehl greift die Weiche**, und die Unterbefehle werden **dynamisch** importiert
   (`await import("./cli/run.js")`), damit ein Serverstart keine Zeile CLI-Code lädt (8.1).
   Der Serverpfad seinerseits lädt keine Zeile aus `src/cli/*`.
3. **`--version` wird auf `src/generated/version.ts` umgestellt** und liest nicht mehr die
   Baukonstante aus AP01; danach gibt es genau eine Versionsquelle, und zur Laufzeit wird kein
   JSON gelesen.
4. **`--help` nennt die Unterbefehle und die zwölf Clientkürzel** aus 8.1.
5. Ein Einheitstest belegt die Weiche in beiden Richtungen: Ohne Argument entsteht ein Server
   und **kein** CLI-Import; mit `doctor` entsteht **kein** Server. Damit ist der Schritt 5 des
   Paketprobelaufs (9.6) vorbereitet, der genau diese Startzeit misst.

---

**AP16 — Integrationstest, Paketprobelauf, Größenbudget**
*Hängt ab von:* AP10, AP12a–e, AP14, **AP15** (der Probelauf startet `bbutler-mcp` ohne
Unterbefehl; die Verdrahtung dafür entsteht in AP15).
*Dateien (exklusiv):* `test/integration/server.test.ts`,
`test/integration/package-smoke.test.ts`, `scripts/check-size.ts`,
`test/contract/read-only.test.ts`, `test/contract/no-write-retry.test.ts`,
`test/contract/output-schema.test.ts`.
*Definition of Done:* `tools/list` liefert **genau 54** Einträge, jeder mit vier Hints. stdout
trägt nur JSON-RPC. Der Paketprobelauf aus 9.6 läuft vollständig durch, einschließlich der
**zwei getrennten Prüfungen ohne Zugangsdaten**; die Startzeit steht als Zahl im Protokoll.
**Das Größenbudget aus 9.10 ist durchgesetzt**: `scripts/check-size.ts` liest `size` und
`unpackedSize` aus `npm pack --json`, vergleicht gegen **1 MiB** gepackt und **3 MiB**
entpackt, endet bei Überschreitung mit Rückgabewert 1 und nennt beide Zahlen, beide Grenzen und
die zehn größten Dateien des Tarballs. Die drei Vertragstests sind grün.

---

**AP17 — Vertragslauf gegen die echte API**
*Hängt ab von:* AP12a–e (vollständig abgeschlossen).
*Dateien (exklusiv):* `scripts/contract-read.ts`, `test/unit/contract-read-guard.test.ts`.
**Zusätzlich, erst nach Abschluss von AP12a–e:** die 15 lesenden Registereinträge, um die
Antwortverträge gegen die gemessenen Feldmengen zu korrigieren.
*Definition of Done:* Erlaubnisliste aus dem Register erzeugt (`toolClass === "R"`), Wurf bei
jedem anderen Pfad, **ein Test prüft, dass der Wächter bei einem schreibenden Pfad wirft**.
Der Lauf wurde einmal ausgeführt; neue, fehlende und typveränderte Felder sind in den
Antwortverträgen nachgetragen. **Keine Geschäftsdaten in einer Datei**, nur Feldnamen und
Typen.

---

**AP18 — Evaluationslauf**
*Hängt ab von:* AP16.
*Dateien (exklusiv):* `test/eval/tasks.test.ts`, `docs/entwicklung/befund-evaluation.md`.
*Definition of Done:* Die elf Aufgaben aus 9.8 sind gelaufen. Die beiden
Nulltoleranz-Kennzahlen sind gemessen und stehen im Bericht. Die Transkripte sind gelesen und
die gefundenen Verwirrungsmuster benannt. **Reißt eine der beiden Nulltoleranz-Kennzahlen, ist
das ein Befund für den Projektinhaber**, kein Anlass, die Aufgabe umzuformulieren.

---

**AP19 — Verifikation der schreibenden Pfadsegment-Endpunkte (nur feststellen)**
*Hängt ab von:* AP07 und einem Testmandat außerhalb des Projekts.
*Dateien (exklusiv):* `docs/entwicklung/befund-schreibend.md`.
*Definition of Done:* Entweder belegtes Verhalten von `/receipts/delete/<id>` und
`/receipts/restore/<id>` sowie des Wiederholungsverhaltens der löschenden Werkzeuge, mit
Datum und Aufrufform; oder die begründete Feststellung, dass kein Testmandat verfügbar war.
Der Befund nennt je geprüftem Werkzeug ausdrücklich, **welcher Eintrag wie zu ändern wäre**
(`verified`, `idempotentHint`, Klassenliste, Annotationszählung), damit AP19b eine Arbeitsliste
hat und nicht neu urteilen muss. **Dieses Paket blockiert keinen anderen Pfad und wird nicht
gegen die Produktivbuchhaltung ausgeführt.**

**Dieses Paket ändert keine Zeile Code.** Der Entwurfsstand verlangte in seiner Definition of
Done Änderungen an Registereinträgen, an `classes.ts` und an der zweiten Klassenliste — alles
Dateien, die AP12a bis AP12c, AP04 und AP11 gehören. Da AP19 jederzeit laufen darf, auch
während dieser Pakete, war das ein Verstoß gegen die Eigentumsregel aus Abschnitt 11.
**Aufgelöst: AP19 stellt fest, AP19b zieht nach.**

---

**AP19b — Nachziehen der Verifikationsbefunde**
*Hängt ab von:* AP19 **mit belegtem Ergebnis**, AP04, AP11, AP12a, AP12b, AP12c.
*Dateien (exklusiv, und erst ab diesem Zeitpunkt:)* `src/registry/classes.ts`,
`test/registry/class-list.ts`, `test/registry/annotations.test.ts` sowie **ausschließlich die
tatsächlich betroffenen** Registerdateien: `bb_receipts_delete.ts`, `bb_receipts_restore.ts`
(AP12a), `bb_transactions_unassign_receipt.ts` (AP12b), `bb_postings_unconfirm_for_receipt.ts`,
`bb_postings_unconfirm_for_transaction.ts`, `bb_postings_unconfirm_free.ts`,
`bb_postings_cancel.ts`, `bb_postings_assign_receipt.ts` (AP12c); dazu
`docs/entwicklung/befund-schreibend.md` (**angelegt in AP19, hier ergänzt** — AP19 ist zu
diesem Zeitpunkt abgeschlossen, sonst gäbe es kein belegtes Ergebnis).
*Definition of Done:* Die in `befund-schreibend.md` belegten Punkte sind eingetragen:
`verified: true`, wo die Aufrufform gemessen wurde; `idempotentHint`, wo das
Wiederholungsverhalten gemessen wurde; `destructiveHint` bei `bb_postings_assign_receipt`, wenn
der Befund das Ersetzen eines bestehenden Belegbezugs belegt (3.3). **Klassentabelle, zweite
Liste und `annotations.test.ts` werden gemeinsam in einem Durchgang nachgezogen**, damit P5 und
P7 nicht gegeneinander laufen.

**Zum Eintrag in `CHANGELOG.md`, damit auch hier kein Eigentum verletzt wird:** Die Datei
gehört AP20. AP19b legt den fertigen Textblock mit der neuen Auszählung in
`befund-schreibend.md` ab; eingetragen wird er von **AP20**, solange dieses noch läuft, und von
AP19b selbst, wenn AP20 bereits abgeschlossen ist — dann gehört die Datei keinem laufenden
Paket mehr. Welcher der beiden Fälle eingetreten ist, hält AP19b in seinem Befund fest.

**Drei Festlegungen, die dieses Paket erst sauber machen:**

1. **Es läuft nur, wenn es etwas zu tun gibt.** Liefert AP19 kein belegtes Ergebnis, **entfällt
   AP19b ersatzlos**, und AP22 hält das fest. Ein leeres Paket wird nicht durchgeführt, nur um
   den Graphen zu schließen.
2. **Es läuft nicht gleichzeitig mit den Eigentümern.** AP04, AP11 und AP12a bis AP12c sind zu
   diesem Zeitpunkt abgeschlossen; die genannten Dateien gehören dann ausschließlich AP19b.
   **Mit AP17 kollidiert es nicht:** AP17 korrigiert die Antwortverträge der **15 lesenden**
   Einträge, AP19b berührt ausschließlich **schreibende**. Die beiden Dateimengen sind disjunkt,
   beide Pakete dürfen also parallel laufen.
3. **Dieser Plan wird nicht rückwirkend geändert** (3.3). Die Auszählungen in 3.3, 3.8 und 3.9
   beschreiben den Auslieferungszustand; fortgeschrieben wird in `befund-schreibend.md` und
   `CHANGELOG.md`. Läuft AP19b erst nach AP22, bekommt es eine eigene, gleich strenge
   Skeptikerprüfung; es wird nicht ohne Prüfung ausgeliefert.

---

**AP20 — README und Begleittexte**
*Hängt ab von:* AP14, AP15.
*Dateien (exklusiv):* `README.md`, `NOTICE.md`, `SECURITY.md`, `CONTRIBUTING.md`,
`CHANGELOG.md`, `.env.example`, `scripts/gen-tool-table.ts`;
**dazu die zehn Dossierdateien aus Abschnitt 15, namentlich und ohne Glob:**
`docs/api/belege.md`, `docs/api/transaktionen.md`, `docs/api/grundlagen.md`,
`docs/api/fehlercodes.md`, **`docs/api/live-befunde-orchestrator.md`**,
`docs/entwicklung/tool-design.md`, `docs/entwicklung/distribution.md`,
`docs/entwicklung/toolchain.md`, `docs/entwicklung/mcp-sdk-typescript.md`, `docs/README.md`.
*Definition of Done:* Gliederung aus Abschnitt 10 vollständig gefüllt, auf Deutsch mit echten
Umlauten, ohne Emojis, ohne Digraphen. Die Werkzeugtabelle wird **aus dem Register erzeugt**
und in der CI gegen das Register geprüft. Abschnitt 18 „Einen neuen Endpunkt nachrüsten" in
genau fünf Schritten. Der unscoped Paketname kommt nirgends als unser Name vor.
**Alle 25 Zeilen aus Abschnitt 15 sind abgearbeitet:** 24 davon sind in den zehn genannten
Dossiers nachgezogen, und jede geänderte Stelle trägt einen Vermerk auf den Umsetzungsplan mit
Abschnittsnummer; die verbleibende Zeile (`toolchain.md` 12, `zod`) ist ausdrücklich als
„nichts nachzuziehen" bestätigt und bleibt unverändert. Der Umsetzungsplan selbst
(`docs/entwicklung/umsetzungsplan.md`) wird dabei **nicht** geändert. **Die Messungen in
`docs/api/live-befunde-orchestrator.md` werden nicht angetastet**; korrigiert wird dort
ausschließlich der eine in Abschnitt 15 benannte Satz über den Body-Parameter.

**Warum die Liste namentlich und nicht als Glob steht.** Unter `docs/entwicklung/` entstehen
**sechs** weitere Dateien, die anderen Paketen gehören und in Abschnitt 15 **nicht** vorkommen:
`befund-sdk.md` (AP02), `befund-tokenbudget.md` (AP14), `befund-schreibend.md` (AP19),
`befund-evaluation.md` (AP18), `veroeffentlichungs-checkliste.md` (AP21) und
`skeptiker-befunde.md` (AP22). **Sie bleiben von AP20 unberührt.** Zeitlich kann das
kollidieren: AP18 und AP20 laufen beide nach AP16 und damit gleichzeitig, AP19 hängt an einem
Testmandat und kann jederzeit laufen, AP21 folgt unmittelbar auf AP20, AP22 kommt zuletzt.
Ein Glob wie `docs/entwicklung/*.md` in dieser Dateiliste würde genau diese Dateien
mit einschließen und die Eigentumsregel aus Abschnitt 11 verletzen; die namentliche Aufzählung
schließt das aus. AP02 ist zu diesem Zeitpunkt längst abgeschlossen. **Umgekehrt gehört
`docs/api/live-befunde-orchestrator.md` ausschließlich AP20**; kein anderes Paket schreibt
hinein.

---

**AP21 — Verpackung und Vorbereitung der Veröffentlichung**
*Hängt ab von:* AP16, **AP17** (9.7: der Vertragslauf ist Pflicht vor jeder Veröffentlichung),
AP20.
*Dateien (exklusiv):* `.mcpb/manifest.template.json`, `scripts/build-mcpb.ts`,
`.github/workflows/publish.yml`, `.github/workflows/drift.yml`, `.github/dependabot.yml`,
`test/contract/mcpb-tools.test.ts`, **`docs/entwicklung/veroeffentlichungs-checkliste.md`**
(neu).

**Dieses Paket veröffentlicht nichts. Das ist seine wichtigste Eigenschaft.** Der
Entwurfsstand ließ AP21 `npm publish` ausführen und das öffentliche GitHub-Repository anlegen
— **vor** der Skeptikerphase AP22. Damit lagen die beiden einzigen unumkehrbaren Schritte des
ganzen Vorhabens vor der Prüfung, die sie hätte verhindern können. **Entscheidung des
Projektinhabers, hier eingearbeitet: Veröffentlichung auf npm und Anlegen des Repositorys sind
nicht Teil des Umsetzungs-Workflows.** Der Projektinhaber führt beides selbst aus, nachdem er
das fertige Ergebnis gesehen hat. AP21 stellt alles bereit, was er dafür braucht, und führt
selbst **keinen veröffentlichenden Befehl** aus:

- **kein** `npm publish`, auch nicht als Probelauf gegen eine andere Registry,
- **kein** `git tag`, **kein** `git push`, **kein** Anlegen eines GitHub-Repositorys,
- **kein** Auslösen von `publish.yml`, weder über einen Tag noch über `workflow_dispatch`.

*Definition of Done:*

1. **`publish.yml` existiert und ist vollständig, wird aber nicht ausgelöst.** Auslöser ist
   ausschließlich ein Tag `v*.*.*`, den allein der Projektinhaber setzt. Der Workflow baut das
   `.mcpb` **vor** `npm publish`, damit ein Verpackungsfehler den unumkehrbaren Schritt
   blockiert; er führt **`check-size`** vor `npm publish` aus und setzt damit das Größenbudget
   aus 9.10 durch; er gleicht den Tag gegen `version` ab und bricht bei Abweichung ab; er
   veröffentlicht mit `npm publish --provenance --access public` über OIDC Trusted Publishing,
   ohne langlebiges Token; er erzeugt ein GitHub-Release mit dem `.mcpb` als Anhang und dem
   Abschnitt aus `CHANGELOG.md`.
2. **Der Vertragslauf ist im Workflow verankert** (9.7). Er kann dort nicht selbst laufen, weil
   er echte Zugangsdaten braucht und die öffentliche CI keine bekommt (9.1). Deshalb verlangt
   `publish.yml` eine ausdrückliche Bestätigung, dass `pnpm run contract:read` gegen die echte
   API gelaufen ist, mit Datum und Ergebnis, und **bricht ohne sie ab**. Eine Zusage, die
   nirgends abgefragt wird, ist keine.
3. **`drift.yml` und `dependabot.yml` sind fertig.** `drift.yml` führt Generatorlauf und
   Größenlauf wöchentlich, damit eine Verschlechterung auch ohne Veröffentlichung sichtbar wird.
4. **`test/contract/mcpb-tools.test.ts` ist grün**: Die Werkzeugliste des Bundle-Manifests wird
   aus dem Register erzeugt und danach gegen das Register geprüft.
5. **Das `.mcpb` wird einmal lokal gebaut und die Datei aufbewahrt**, damit der Projektinhaber
   sie ansehen kann, ohne einen Veröffentlichungsjob zu starten. **Verpackungswerkzeuge werden
   aus `node_modules` aufgerufen, nie über `npx`** (Begründung in 13.5).
6. **Die Veröffentlichungs-Checkliste `docs/entwicklung/veroeffentlichungs-checkliste.md` ist
   geschrieben**, auf Deutsch, als abhakbare Liste in der Reihenfolge der Ausführung. Sie
   enthält mindestens: angemeldet auf npmjs.com prüfen, ob der Namensraum `@dennismenken` zum
   eigenen Konto gehört (**ein HTTP 404 auf den Paketnamen ist dafür kein Beleg**; gehört er
   nicht dazu, ist `dennismenken` als Organisation anzulegen); `pnpm run contract:read` gegen
   die echte API mit Datum und Ergebnis; `pnpm check-size` gegen die beiden Grenzen aus 9.10;
   `CHANGELOG.md` für die Version geschrieben; das öffentliche Repository
   `dennismenken/buchhaltungsbutler-mcp` anlegen (E3); OIDC Trusted Publishing im npm-Konto für
   dieses Repository einrichten; Tag setzen und pushen; nach dem Lauf prüfen, dass Provenance
   und `.mcpb`-Anhang vorhanden sind. **Jeder Punkt nennt den Befehl und das erwartete
   Ergebnis**, damit die Liste ohne Rückfrage abarbeitbar ist.
7. **Die Felder der `package.json` werden geprüft, nicht geändert.** `package.json` gehört
   AP01 (11.2), und die Festlegungen stehen in 13.7 (`files: ["dist"]`, `.npmignore`, genau ein
   `bin`, `engines`, `packageManager`, exakte Versionen). AP21 hakt sie in der Checkliste ab
   und **meldet jede Abweichung als Befund**, statt sie selbst zu beheben.

---

**AP22 — Skeptikerphase, letzter Schritt des Workflows**
*Hängt ab von:* allen vorherigen, **AP19b eingeschlossen**, sofern dieses überhaupt läuft.
*Dateien (exklusiv):* `docs/entwicklung/skeptiker-befunde.md`.
*Definition of Done:* Ein Agent mit **frischem Kontext** prüft das Ergebnis kritisch auf
Korrektheit, Randfälle, Regressionen und Einhaltung der Konventionen. Er sucht aktiv nach
Fehlern und versucht zu widerlegen, statt zu bestätigen. Findings werden in einer dynamischen
Fixing-Phase behoben, danach prüft er erneut. Wiederholen, bis keine Findings mehr vorliegen
oder verbleibende Punkte **begründet als akzeptiert dokumentiert** sind. Modell und Effort des
Skeptikers liegen mindestens auf dem Niveau des implementierenden Agenten.

**Nach diesem Paket folgt kein Arbeitspaket mehr.** Die Veröffentlichung auf npm und das
Anlegen des öffentlichen Repositorys sind nicht Teil dieses Workflows; sie führt der
Projektinhaber selbst aus, nach der Checkliste aus AP21 und nachdem er das Ergebnis gesehen
hat. Zwei Punkte gehören deshalb ausdrücklich in die Prüfliste des Skeptikers: **erstens**, dass
im gesamten Verlauf **kein** unumkehrbarer Schritt ausgeführt wurde (kein `npm publish`, kein
Tag, kein angelegtes Repository, kein schreibender Aufruf gegen die Produktivbuchhaltung);
**zweitens**, ob AP19b lief, entfiel oder noch aussteht, mit Angabe des Standes.

### 11.3 Parallelisierung und kritischer Pfad

**Sofort nach AP01 parallel:** AP02, AP03, AP04, AP06.
**Danach parallel:** AP05, AP07 (nach AP06), AP11 (nach AP03 und AP04), AP13 (nach AP07),
AP08 (nach AP03 und AP07), AP09 (nach AP05, AP06 und AP07).
**Die fünf Registerpakete AP12a bis AP12e laufen echt parallel**, weil sie disjunkte
Dateimengen anfassen und alle gegen dieselben, in AP11 fertigen Prüfungen arbeiten. Das ist
der Hauptteil der Fleißarbeit und eignet sich für fünf Bearbeiter. **Der Registerindex ist
dabei keine geteilte Datei:** `src/registry/index.generated.ts` wird nicht eingecheckt (4.2),
steht in keiner der fünf Dateilisten und wird von jedem Bearbeiter über `pnpm generate` lokal
erzeugt. Wäre er eingecheckt, müsste jedes der fünf Pakete P12 erfüllen, indem es genau diese
eine Datei neu schreibt und committet — und damit wäre der Paketschnitt genau an der Stelle
verletzt, an der er seinen Zweck erfüllen soll.
**Parallel zu den fünf Registerpaketen läuft AP15** (nach AP06, AP07 und AP10). Es fasst keine
Registerdatei an und liegt deshalb nicht auf dem kritischen Pfad, muss aber vor AP16 fertig
sein, weil der Paketprobelauf den verdrahteten Einstiegspunkt startet.
**AP19 hängt an einer Entscheidung außerhalb des Codes und blockiert nichts;** es schreibt nur
seine Befunddatei. **AP19b dagegen schreibt in Registerdateien und läuft deshalb erst nach
AP12a bis AP12c, AP04 und AP11** — und nur dann, wenn AP19 etwas belegt hat. Es läuft parallel
zu AP17, weil AP17 ausschließlich lesende und AP19b ausschließlich schreibende Einträge
anfasst.

**Kritischer Pfad:** AP01 → AP04 → AP11 → AP12c (Buchungen, das umfangreichste Registerpaket)
→ AP14 → AP16 → AP20 → AP21 → AP22. AP15 verlängert ihn nicht: Es beginnt mit AP10, also vor
AP12c, und läuft neben den Registerpaketen. **Neu gegenüber dem Entwurfsstand ist AP17 als
zweite Eingangskante von AP21** (9.7); AP17 beginnt unmittelbar nach AP12a–e und liegt damit
zeitlich neben AP14 und AP16, verlängert den Pfad also in aller Regel nicht. **AP21
veröffentlicht nichts mehr**, es bereitet nur vor; der Pfad endet deshalb sachlich wie
zeitlich mit der Skeptikerphase AP22, und die beiden unumkehrbaren Schritte liegen danach beim
Projektinhaber.

**Modell- und Effortzuordnung**, nach der Staffelung des Projektinhabers:

| Paket | Modell | Effort | Begründung |
| --- | --- | --- | --- |
| AP01, AP03, AP20 | Sonnet | high | klar umrissen, viel Mechanik, wenig Ambiguität |
| AP02, AP19 | Haiku als Zulieferer, Auswertung durch Sonnet | – | reine Messung ohne Urteil; die Entscheidung trifft nicht Haiku |
| AP19b | Sonnet | high | präzise Arbeitsliste aus `befund-schreibend.md`, aber Annotationen mit Sicherheitswirkung; bei mehr als einer betroffenen Annotation eine Stufe höher |
| AP04, AP05, AP07, AP08, AP09, AP10 | Opus | high | Architekturkern, Fehlerrisiko und Nebenwirkungen hoch |
| AP06, AP11, AP13, AP15, AP16, AP17, AP21 | Sonnet | high | mittlere Komplexität mit präziser Vorgabe; AP13 bei Unsicherheit eine Stufe höher |
| AP12a–e | Sonnet | high | präzise umrissen durch AP11; bei AP12c Opus, weil zwölf Werkzeuge mit Positionslisten und dem größten Verwechslungsrisiko |
| AP14, AP18 | Opus | high | Beschreibungsqualität und Evaluation sind Urteilsfragen |
| AP22 | Opus | xhigh | Skeptiker liegt mindestens auf dem Niveau des implementierenden Agenten; sicherheitsrelevante Prüfung |

---

## 12. Entschiedene Streitfragen

Wo die drei Entwürfe auseinandergingen, steht hier die Entscheidung, ihre Begründung und
gegebenenfalls der Preis. **Keine dieser Fragen ist offen.**

---

**S1 — Ist `id_by_customer` ein Pfadsegment, und funktionieren die beiden
Einzelabruf-Endpunkte?**

*Streit:* A hat es gemessen und HTTP 200 erhalten. C hat fünf Aufrufe verbraucht, zwei
Array-Varianten widerlegt, die Pfadsegment-Variante **nicht** geprüft und liefert
`bb_receipts_get` und `bb_transactions_get` mit der Behauptung aus, sie seien „live
unbenutzbar" beziehungsweise „live HTTP 404" — in Werkzeugbeschreibung, Fehlerkatalog, README
und einer Registerprüfung, die Verweise auf beide Werkzeuge verbietet. B verschiebt die Frage
nach AP0 und schreibt für beide Ausgänge einen Text.

*Entscheidung:* **Pfadsegment. Beide Endpunkte funktionieren. Sie werden ohne jeden
Einschränkungssatz ausgeliefert.** Ich habe es selbst gemessen (L1): `POST /receipts/get/<id>`
und `POST /transactions/get/<id>` antworten mit HTTP 200 und `success: true`. Damit ist C's
Prämisse widerlegt, A's Befund unabhängig bestätigt und B's Vertagung gegenstandslos.

*Begründung für die Schärfe der Formulierung:* C hätte eine mutmaßlich falsche
Tatsachenbehauptung in Nutzertext ausgeliefert, und die Korrektur eines ausgelieferten
README-Abschnitts braucht eine Veröffentlichung — genau das, was C als Argument für das
Ausliefern anführt. Eine ungeprüfte Annahme darf nicht als Tatsache in die Beschreibung eines
Werkzeugs.

*Preis:* Die schreibenden Geschwister `delete` und `restore` nutzen dieselbe Form, sind aber
nicht getestet. Sie tragen `verified: false` und sind Gegenstand von AP19, das Nachziehen von
AP19b. Das ist die ehrliche Restunsicherheit, und sie ist benannt statt weggelassen.

*Was daraus für die Modellierung folgt, weil ein Pfadsegment mehr ist als eine Fußnote:* Der
Pfad dieser vier Werkzeuge ist **nicht konstant**. Der Registereintrag trägt deshalb Vorlage,
Parametername **und** `specPath`; der Fehlerkatalog, der Deckungstest und die Audit-Zeile
schlagen über `specPath` nach, gesendet wird der gebaute Pfad, und **ein Body-Feld
`id_by_customer` gibt es an keinem der vier Endpunkte** — die Spezifikation führt dort auch
keines. Die sechs Regeln stehen in 4.6, die Tests in 9.4 und 9.5.

---

**S2 — Antwortvertrag je Fachobjekt oder je Endpunkt?**

*Streit:* A misst, dass derselbe Sachverhalt je Endpunkt anders heißt, und zieht den Vertrag
je Endpunkt. B und C tragen implizit einen gemeinsamen Objekttyp.

*Entscheidung:* **Je Endpunkt.** Eigene Messung (L2, L3): `/receipts/get` liefert 16 Felder
mit `delivery_date` und `due_date`, `/receipts/get/<id>` liefert 23 Felder mit `date_delivery`
und `date_payment_due`; `/transactions/get` liefert 6 Felder, der Einzelabruf 13, und
`id_by_customer` ist bei `receipts` ein String, bei `transactions` eine Zahl. Ein gemeinsamer
`Receipt`-Typ erzeugt ein `due_date`, das beim Einzelabruf immer leer aussieht. In einer
Buchhaltung ist das der Unterschied zwischen einer richtigen und einer falschen Mahnliste.

*Ergänzung, ebenfalls aus A:* `_contract_warnings` in **derselben Antwort, die der Agent
liest**. Ein fehlendes oder typwidriges bekanntes Feld bricht nicht ab, wird aber gemeldet.
Das ist die einzige Stelle in allen drei Entwürfen, an der ein stiller Datenfehler zur
Laufzeit sichtbar wird.

---

**S3 — Wie groß ist der Fehlerkatalog?**

*Streit:* A sagt 786 Paare, B und C sagen 718 Einträge.

*Entscheidung:* **786 Paare (Pfad, `error_code`).** Maschinell nachgezählt (0.4): 786
referenzierte Paare, 718 `*ErrorCode*`-Definitionen, davon 676 referenziert und **42**
verwaist. A's eigene Angabe von 45 verwaisten ist ebenfalls falsch und hier korrigiert. Die
Struktur `ERRORS` ist nach Pfad und Code geschlüsselt; 718 als Abnahmebedingung würde falsch
abnehmen. Die 42 verwaisten Definitionen werden bewusst nicht aufgenommen: Sie sind kein
belegtes Serververhalten.

---

**S4 — Wie wird das Kontextbudget behandelt?**

*Streit:* B rechnet es vor und erzwingt es über einen Test. A nennt eine Spanne und misst erst
am Ende. C misst gar nicht und erzwingt gleichzeitig 60 bis 220 Wörter je Beschreibung.

*Entscheidung:* **B's Weg, mit korrigierten Zahlen und einer verschärften Regel.** Budget
**32.000** Token für die Definitionen plus **2.100** für die `instructions`, erzwungen durch
P11, zusätzlich Einzelbudgets je Beschreibungsstufe. Die Rechnung steht offen in 4.10 und ist
ausdrücklich als Schätzung gekennzeichnet; AP14 ersetzt den Faktor durch eine echte Messung.

*Nachtrag zu den Zahlen:* Der ursprüngliche Wert 26.000 war auf **englische** Beschreibungen
und den Faktor 3,7 Zeichen je Token gerechnet. E4 verlangt deutsche Beschreibungen; deutscher
Fließtext ist länger und tokenisiert schlechter. Die Neurechnung in 4.10 setzt deshalb 3,2
Zeichen je Token und 15 Prozent mehr Zeichen im Fließtext an und kommt auf rund 32.100 Token.
**Das ist keine Lockerung, sondern die Anpassung an eine bereits getroffene Entscheidung des
Projektinhabers**; die Regel „nicht stillschweigend anheben" bleibt unverändert und gilt ab
jetzt gegen 32.000.

*Verschärfung gegenüber B:* **Das Budget wird nicht stillschweigend angehoben.** 4.10 nennt
drei Schritte in fester Reihenfolge, die bei einer Überschreitung zu gehen sind. Reißt es
danach immer noch, ist das ein Befund für den Projektinhaber. Die **Budgetgrenzen** liegen in
`src/registry/budget.ts` und gehören keinem Arbeitspaket, das sie ändern dürfte. Ausgenommen
ist allein die Umrechnungskonstante `CHARS_PER_TOKEN` in derselben Datei: Sie ist keine Grenze,
sondern ein Messwert, und AP14 setzt sie nach der Messung (4.10).

---

**S5 — `destructiveHint` bei den vier `update`-Werkzeugen (Klasse M)?**

*Streit:* A und B setzen `true`, C führt den Dossierwert `false` fort, ohne das Gegenargument
zu erwähnen.

*Entscheidung:* **`true`.** Das MCP-Schema definiert den Hint mit „If false, the tool performs
only additive updates"; ein Überschreiben ist nicht additiv. Kein Endpunkt liefert den
Vorzustand zurück. `bb_creditors_update` überschreibt Stammdaten einschließlich
Bankverbindung. Unter E2 ist die Annotation die einzige maschinenlesbare Schutzschicht; sie
als nicht destruktiv zu melden wäre die einzige Entscheidung der drei Entwürfe, die den
verbleibenden Schutz **aktiv schwächt**. Die Risiko-Asymmetrie entscheidet: Ein zu strenger
Hint kostet eine Rückfrage, ein zu milder einen unbemerkten Stammdatenverlust.

---

**S6 — `idempotentHint` bei löschenden und aufhebenden Werkzeugen?**

*Streit:* B setzt `true` bei den sechs löschenden und bei `bb_receipts_restore`, begründet mit
„setzt einen Zielzustand", lässt aber `bb_postings_cancel` auf `false` mit der Begründung
„nicht verifiziert". Die Jury hat diese Ungleichbehandlung zu Recht als Maßstabsbruch
bezeichnet. A setzt `true` nur, wo es beweisbar ist.

*Entscheidung:* **A's Regel, konsequent durchgehalten. `idempotentHint: true` nur bei Klasse R
(15) und Klasse M (4), sonst überall `false`.** Die Regel in einem Satz: *`true` nur dort, wo
eine Wiederholung beweisbar denselben Zustand ergibt.* Für Lesen gilt das trivial, für ein
`update` gilt es, weil der Aufruf einen im Aufruf genannten Zielzustand setzt. Für `delete`,
`restore`, `unconfirm`, `unassign` und `cancel` ist es plausibel, aber **nicht verifiziert**,
und ein falsches `true` lädt einen Host zum automatischen Wiederholen ein. AP19 **belegt**,
AP19b **stellt um**; dann sind Klassentabelle, zweite Liste und Annotationstest gemeinsam
nachzuziehen, und zwar in **einem** Paket, das diese Dateien exklusiv hält (11.2).

---

**S7 — Abbruch oder Start bei fehlenden Zugangsdaten?**

*Streit:* C bricht mit Rückgabewert 1 ab und braucht dafür in der eigenen README die Zeile
„Startet nicht, keine Meldung sichtbar — wo landet stderr, je Client". A und B starten.

*Entscheidung:* **Starten.** Der Client meldet bei einem Abbruch nur „Server konnte nicht
gestartet werden"; der Agent sieht kein Werkzeug und kann dem Nutzer nichts sagen. Der
Zielleser ist ein Buchhalter, nicht jemand, der weiß, wo sein Client stderr hinschreibt. Der
Server startet, registriert alle 54 Werkzeuge und antwortet auf **jeden** Aufruf mit der
konkret fehlenden Variablen und dem Satz „Keine anderen Werkzeuge dieses Servers ausprobieren;
sie scheitern alle auf dieselbe Weise." (deutsche Fassung nach E4, Wortlaut in 6.5)

*Gegenrichtung, ebenfalls entschieden:* Ein **ungültiger** Wert einer optionalen Variablen
führt sehr wohl zum **Abbruch**, nicht zum stillen Zurückfallen auf die Vorgabe (A 7.2 Punkt
4). Der Unterschied ist begründet: Eine fehlende Zugangsangabe ist ein Zustand, den der Nutzer
erwartet und beheben kann; ein falsch geschriebener Grenzwert ist ein Irrtum, der unbemerkt
eine Schutzschicht abschaltet. `BB_MCP_READ_ONLY=ture` darf nicht stillschweigend „aus"
bedeuten.

*Folge, die C's bester Test betrifft:* C's Paketprobelauf erwartet in Schritt 4 Rückgabewert 1
ohne Zugangsdaten. Dieser Schritt wird **gespalten** (9.6 Schritt 4): `bbutler-mcp test`
liefert 1, `bbutler-mcp` startet und antwortet. Damit bleibt der Testwert erhalten, ohne dass
er dieser Entscheidung widerspricht.

---

**S8 — `BB_MCP_READ_ONLY` oder `BB_READ_ONLY`?**

*Streit:* Die Dossiers widersprechen sich. B wählt `BB_MCP_READ_ONLY` mit Begründung, C wählt
`BB_READ_ONLY` und gerät dadurch in einen inneren Widerspruch, weil der wörtlich
vorgeschriebene Absagetext den anderen Namen nennt. A bemerkt den Konflikt nicht.

*Entscheidung:* **`BB_MCP_READ_ONLY` ist kanonisch.** Der ausgelieferte Absagetext enthält
diesen Namen; eine Absage, die eine nicht existierende Variable nennt, ist schlimmer als ein
längerer Name. `BB_READ_ONLY` wird als Alias akzeptiert, erzeugt eine stderr-Warnung und
erscheint nicht mehr in der README. **Sind beide widersprüchlich gesetzt, bricht der Server
ab** — konsequent nach S7.

---

**S9 — Wie werden Beträge in der Antwort dargestellt?**

*Streit:* A sagt String, niemals `number`. B sagt String plus `amount_cents`. C sagt Zahl plus
`amount_raw`.

*Entscheidung:* **A's Richtung mit B's Zusatz. Der Rohstring bleibt führend und wird niemals
in `number` gewandelt; zusätzlich gibt es `amount_cents` als Ganzzahl.** C's Variante ist die
falsche Richtung: Eine Gleitkommazahl für Geld ist ein Fehler, und wer sie als Hauptwert
anbietet, lädt zum Rechnen darauf ein. Das Cent-Feld gibt es, weil der Agent Summen bilden
muss und genau dort `parseFloat` danebengreift. Es entsteht keine zweite Wahrheit: Der String
ist der Wert, das Cent-Feld ist seine verlustfreie Ganzzahlform.

---

**S10 — Wie werden Kennungen normalisiert?**

*Streit:* B wandelt `id_by_customer` global in eine Zahl, A global in einen String. Gemessen
liefert die API sie bei `receipts` als String und bei `transactions` als Zahl.

*Entscheidung:* **Ausgehend immer String, eingehend `integer`.** Kennungen sind Bezeichner,
keine Rechengrößen; eine einheitliche Stringform verhindert, dass ein Vergleich `"2" === 2`
fehlschlägt, und sie ist gegen künftige nicht rein numerische Kennungen robust. Die dadurch
entstehende Reibung beim Senden wird nicht durch Schemagymnastik gelöst, sondern durch **einen
Satz in der Parameterbeschreibung**: „In Suchergebnissen erscheint sie als String; hier ohne
Anführungszeichen übergeben." Das kostet nichts und ist eindeutig.

---

**S11 — Parallele Arrays durchreichen oder in eine Positionsliste umformen?**

*Streit:* A ist in sich widersprüchlich (A's Querprüfung zur Summe der Positionsbeträge setzt
parallele Arrays voraus, der Dateibaum eine Objektliste). B und C formen um.

*Entscheidung:* **Positionsliste, aber nur dort, wo es parallele Arrays wirklich gibt.** Die
Längeninvariante ist dann konstruktiv erfüllt statt geprüft, `required` wirkt je Position,
Fehler sind positionsgenau meldbar, und die Definition wird kleiner. Die Umformung ist in jeder
betroffenen Werkzeugbeschreibung **wörtlich deklariert** und damit kein verborgenes Verhalten im
Sinne von E1. A's Längenprüfung entfällt als Querprüfung.

*Zwei Korrekturen am Umfang, beide maschinell belegt (4.8):*

1. **Betroffen sind fünf Endpunkte, nicht zehn.** Parallele Arrays auf oberster Ebene führen nur
   `/postings/add/receipt`, `/postings/add/transaction` und die drei Rechnungsendpunkte; dazu
   kommen zwei Stapelendpunkte mit parallelen Arrays **innerhalb** jedes Elements.
   `/postings/add/free` ist skalar, und `/postings/add-batch/free`,
   `/postings/add-batch/receipts`, `/postings/add-batch/transactions` sowie
   `/transactions/assign-batch/receipt` sind bereits Objektlisten.
2. **A's fachliche Prüfung „Summe der Positionsbeträge" entfällt ebenfalls**, und zwar nicht aus
   Bequemlichkeit: Der Vergleichswert, also der Beleg- oder Zahlungsbetrag, ist an keinem der
   betroffenen Endpunkte ein Argument des Aufrufs. Eine `superRefine` kann ihn nicht kennen, und
   ein zusätzlicher lesender Aufruf verstieße gegen 7.5 Regel 2. Die API prüft die Summe selbst;
   ihre Meldung steht bereits im Fehlerkatalog. Begründung ausführlich in 4.7.

---

**S12 — `BB_MCP_TOOLSETS`, eine Variable, die Werkzeuggruppen ausblendet?**

*Streit:* B schlägt sie vor, erklärt sie selbst für nicht entschieden und freigabepflichtig.

*Entscheidung:* **Wird nicht gebaut, ersatzlos.** Drei Gründe: Erstens entfernt sie Werkzeuge
aus `tools/list` und tut damit genau das Gegenteil dessen, was `tool-design.md` 9.5 für den
Nur-Lesen-Schalter begründet — ein Agent, der ein Werkzeug nicht sieht, schließt auf eine
fehlende Fähigkeit und sucht Umwege. Zweitens verlangt E1 genau ein Werkzeug je Endpunkt, und
zwar alle. Drittens erfindet der Vorschlag eine offene Frage, die der Projektinhaber nie
gestellt hat, in einem Punkt, den er bereits entschieden hat. Das Kontextproblem wird über das
Budget (4.10) und die Resources (7.7) gelöst, nicht über das Verstecken von Fähigkeiten.

---

**S13 — Eigener Validator oder Zod?**

*Streit:* C ersetzt Zod durch einen selbst geschriebenen Validator von rund 150 Zeilen, plus
eigenem Schematyp und zwei SDK-Adaptern, und führt das selbst als größtes technisches Risiko.

*Entscheidung:* **Zod.** `@modelcontextprotocol/server@2.0.0` zieht `zod` ohnehin ins
Abhängigkeitsnetz (`^4.2.0`, per `npm view` bestätigt); der Eigenbau spart also nichts
Installiertes, sondern erzeugt drei Stück Infrastruktur, die jeder künftige Mitwirkende
verstehen muss, plus
eine Gegenprobe gegen Zod, deren Korpusvollständigkeit niemand garantieren kann. Im
Buchhaltungskontext ist ein selbst geschriebener Validator die letzte Instanz vor dem
Schreibzugriff; das ist die schlechteste Stelle für Eigenbau.

*Was von C bleibt:* Die Schemaschicht (`src/schema/build.ts`) ist trotzdem eine eigene Schicht,
damit der Wechsel der SDK-Linie eine Änderung an genau einer Datei bleibt.

---

**S14 — SDK-Linie v1 oder v2?**

*Streit:* A vertagt ausdrücklich in die Planungsphase und nennt keine einzige Paketversion.
B entscheidet v2 mit benanntem Rückfallauslöser. C entscheidet v2 mit einer ausführbaren
Ladeprobe.

*Entscheidung:* **v2, also `@modelcontextprotocol/server@2.0.0`**, mit C's ausführbarer
Ladeprobe als Absicherung (AP02). Begründung: v2 ist die stabile Linie, der offizielle
Quickstart installiert sie, sie liefert spezifikationskonformes JSON Schema Draft 2020-12
statt Draft 07, und v1 hat einen Packaging-Defekt im Root-Export. Ein Greenfield-Projekt hat
keine Migrationslast.

*Der Rückfall ist eine Regel, keine offene Frage:* Lädt der Wegwerf-Server unter v2 in Claude
Code, Claude Desktop und Codex CLI und beantworten alle drei `initialize` und `tools/list`,
gilt v2. Antwortet einer nicht, gilt **v1 vollständig, ohne jede Mischung**: Paket
`@modelcontextprotocol/sdk@1.30.0`, alle SDK-Importe mit `.js`-Endung, nie der Root-Pfad.
**`zod` bleibt in beiden Fällen unverändert eine direkte `dependency` mit `^4.6.2`**, weil
eigener Code es importiert (13.2); es ändert sich nur, ob das SDK es als Peer oder als
gewöhnliche Abhängigkeit führt. Niemand muss dafür zurückfragen.

---

**S15 — Eine Datei je Werkzeug oder Sammeldateien je Ressource?**

*Streit:* A und B gruppieren nach Ressource (9 bzw. 11 Dateien), C legt 54 Dateien an.

*Entscheidung:* **54 Dateien, eine je Werkzeug, Dateiname gleich Werkzeugname.** Drei Gründe:
Die Postings-Sammeldatei hätte zwölf Einträge und rund 900 Zeilen; die Prüfung „Dateiname
gleich Werkzeugname" ist nur so formulierbar; und vor allem **ermöglicht erst dieser Schnitt,
dass fünf Agenten gleichzeitig an den Registereinträgen arbeiten, ohne sich in dieselbe Datei
zu schreiben**. Das ist eine ausdrückliche Anforderung an die Arbeitspakete. Die Frage „wo
ändere ich `bb_postings_cancel`" hat damit genau eine Antwort.

*Was A und B beitragen:* Der fachliche Schnitt der Arbeitspakete folgt trotzdem der Ressource
(AP12a bis AP12e), nicht der Werkzeugklasse wie bei C. C's Schnitt nach Klasse verteilt
Belege, Zahlungen und Buchungen über drei Pakete, und dann müssen sich drei Bearbeiter über
dieselben Fachbegriffe abstimmen.

---

**S16 — Wie wird der Rate-Limit-Eimer geschlüsselt?**

*Streit:* A und B halten ihn prozessglobal, C schlüsselt ihn nach `api_key`.

*Entscheidung:* **Nach `api_key`.** Das Limit gilt pro Mandant. Ein Server mit mehreren
Profilen führt damit korrekt mehrere Eimersätze und drosselt nicht quer über Mandanten hinweg.
Der Schlüssel wird gehasht abgelegt, damit er in keinem Protokoll auftaucht.

*Ergänzung aus A:* Der vierte Eimer `reports` mit einem Aufruf je zehn Sekunden. Er ist kein
API-Limit, sondern eine Bremse gegen das Muster „create, sofort get, `error_code` 8, sofort
wieder create", das einen laufenden Bericht mehrfach ersetzt. Weder B noch C sehen diese
Nebenwirkung.

---

**S17 — Der Backoff-Jitter**

*Streit:* A nimmt `[0,5; 1,5]` um den vollen Wert, B `0,8 + 0,4·random()`, C `random() ×
backoff` („full jitter").

*Entscheidung:* **A's Variante.** „Full jitter" im AWS-Sinn ist für große, gleichzeitig
zuschlagende Flotten gedacht; ein stdio-Server mit wenigen gleichzeitigen Aufrufen hat kein
Herdenproblem, sondern das umgekehrte: Er kommt zu früh wieder. `delay × (0,5 + random())`
wartet im Mittel den vollen Wert und streut trotzdem. Ein Backoff, der den berechneten
Abstand mit einem Zufallswert zwischen 0 und 1 multipliziert, wartet dagegen im Mittel nur die
Hälfte — er kommt also systematisch zu früh zurück.

---

**S18 — Ist `outputSchema` geschlossen?**

*Streit:* C schreibt ausdrücklich `additionalProperties: true` und begründet es aus einem
Live-Befund. B deklariert das Schema schlank, sagt aber nicht, dass es offen bleiben muss.

*Entscheidung:* **Gesetzt, aber niemals geschlossen.** Pflichtfelder nur `success` und der
Datenbehälter. Eigene Messung (L4): `amount_paid` und `amount_paid_fixed` kommen, obwohl die
Spezifikation sie nicht kennt. Ein geschlossenes Ausgabeschema ließe beim nächsten ergänzten
Feld **bei allen Nutzern gleichzeitig** jeden Aufruf scheitern. Das ist der Unterschied
zwischen „das Projekt braucht ein Update" und „das Projekt ist kaputt, bis jemand eines macht".

---

**S19 — Wird das Feld `title` gesetzt?**

*Streit:* A lässt die Frage offen, B und C entscheiden dafür.

*Entscheidung:* **Ja, deutscher Anzeigename, höchstens 40 Zeichen.** Unter E2 ist der
Freigabedialog des Clients die einzige menschliche Kontrolle; ein deutschsprachiger Buchhalter
beantwortet „Freie Buchung anlegen" richtiger als `bb_postings_create_free`. Kosten rund 370
Token, im Budget enthalten.

---

**S20 — Wie heißt das `bin`?**

*Streit:* `mcp-sdk-typescript.md` 10.3 schlägt `buchhaltungsbutler-mcp` vor. B und C wählen
`bbutler-mcp`.

*Entscheidung:* **`bbutler-mcp`, genau ein `bin`-Eintrag.** Mit einem konkreten, geprüften
Grund: Der unscoped Name `buchhaltungsbutler-mcp` ist auf npm belegt, und unter ihm ist ein `bin`
gleichen Namens vergeben (per `npm view buchhaltungsbutler-mcp bin` bestätigt). Zwei global
installierte Pakete mit demselben `bin`-Namen kollidieren, und welches gewinnt, hängt von der
Installationsreihenfolge ab. `bbutler-mcp` ist auf npm als Paketname frei (HTTP 404 am
2026-09-12); dass der `bin`-Name frei ist, lässt sich nicht vollständig prüfen und ist als
Restrisiko in 14 benannt. `mcp-sdk-typescript.md` 10.3 ist an dieser Stelle nachzuziehen.

---

**S21 — Namensschnitt bei den Buchungswerkzeugen**

*Streit:* C wählt `bb_postings_create_receipt` und muss dafür eine Lesart setzen, weil der
Name auch „lege einen Beleg an" bedeuten kann. A wählt `bb_postings_create_on_receipt`, B
`bb_postings_create_for_receipt`.

*Entscheidung:* **B's `_for_`-Form.** C's Begründung, die Langform reiße die 40 Zeichen, ist
ausweichbar: `bb_postings_create_for_transaction_batch` misst genau 40 Zeichen, wenn das Ziel
im Singular steht. Unter E6 soll aus dem Namen sofort klar sein, was das Werkzeug tut; eine
gesetzte Lesart, die der Agent kennen muss, ist ein vermeidbarer Verlust. `_for_` liest sich
eindeutiger als `_on_`.

---

**S22 — `packageManager`: pnpm 12.4.1 oder 10.34.3?**

*Streit:* `toolchain.md` 13.2 nennt den Konflikt und verschiebt ihn „vor AP0", also aus dem
Plan heraus.

*Entscheidung:* **`"packageManager": "pnpm@10.34.3"`.** Das ist die Version, die in der
Entwicklungsumgebung tatsächlich installiert und am 2026-09-12 als lauffähig belegt ist. Ein
`packageManager`-Feld, das auf eine nicht vorhandene Version zeigt, ist eine Startfalle für
jeden Mitwirkenden und scheitert hinter einem Proxy ohne Corepack-Zugriff. Der Sprung über
zwei Hauptversionen auf 12.x ist eine eigene, bewusste Änderung mit eigener
Lockfile-Migration, kein Nebeneffekt des Projektstarts. Die CI benutzt dieselbe Version.

---

**S23 — Wird ein Stammdatenspeicher gebaut?**

*Streit:* A verzichtet ganz, C baut ihn mit Invalidierungstabelle und schaltet ihn ab.

*Entscheidung:* **Gebaut, standardmäßig aus** (`BB_MCP_CACHE_TTL_MS=0`), mit C's
Invalidierungstabelle **im Register**, nicht im Cache-Modul. Der Grund für das Bauen ist die
Tabelle selbst: Sie enthält die nicht offensichtliche Zeile, dass
`/settings/get/postingaccounts` eine Vereinigungsliste ist und deshalb von jedem Debitoren-
und Kreditorenwerkzeug invalidiert werden muss. Diese Erkenntnis gehört an dieselbe Stelle wie
alles andere, damit sie beim Nachrüsten eines Endpunkts nicht übersehen wird. `/accounts/get`
und alle Bewegungsdaten werden nie zwischengespeichert.

---

**S24 — Mandantenbestätigung im Assistenten**

*Streit:* `distribution.md` 14.2 will den Mandantennamen aus der Antwort holen. C hat gemessen,
dass `/accounts/get` keinen liefert, und baut einen Ersatz mit Rückfrage. A zeigt die Konten
nur an, ohne zu fragen.

*Entscheidung:* **C's Ersatz mit Rückfrage.** Der Assistent zeigt die gefundenen
Zahlungskonten mit Nummer und Namen und fragt: „Gehören diese Konten zu dem Mandanten, den Sie
verbinden wollen?" Das ist der einzige Schutz gegen den teuersten aller Einrichtungsfehler,
den `api_key` eines fremden Mandanten. Eine reine Anzeige ohne Frage wird überlesen.
`distribution.md` 14.2 ist nachzuziehen.

---

**S25 — Währungen als gemeinsamer Baustein?**

*Streit:* B führt einen gemeinsamen `currency()`-Baustein mit 48 Codes.

*Entscheidung:* **Kein gemeinsamer Baustein über alle Währungsfelder, aber je Ressource genau
einer.** Eigene Auszählung (0.5, Korrektur 2): Die Spezifikation führt **fünf** Währungsfelder,
nicht drei — die drei Body-Parameter von `/receipts/add`, `/receipts/upload` und
`/transactions/add` sowie `Receipt.currency` und `Transaction.currency` als Elemente der beiden
Stapelendpunkte. Ein einziger Baustein für alle fünf wäre an den Belegendpunkten falsch, weil
`/receipts/add` drei Codes nennt und `/receipts/upload` EUR verlangt.

*Korrektur am eigenen Entwurfsstand:* Die frühere Begründung, einen Vorrat aus 48 Codes gebe es
in der Spezifikation überhaupt nicht, war **falsch**. Er steht in den Beschreibungstexten von
`Receipt.currency` und `Transaction.currency`; B hat ihn also nicht erfunden, sondern nur zu
weit gefasst. Dieselben zwei Eigenschaften tragen zugleich den Ein-Wert-`enum` `["EUR"]` und
widersprechen damit ihrem eigenen Text; der Enum wird wie das Platzhalterschema des
`order`-Parameters verworfen (Anhang B Punkt 47).

*Was daraus folgt:* Belegseite freier String an beiden Werkzeugen, Zahlungsseite ein `enum` mit
48 Codes an beiden Werkzeugen, beide Male mit gleicher Pflichtigkeit und wortgleicher
Beschreibung. Die Regel dahinter (R-A, Gleichlauf von Einzel- und Stapelform; R-B,
widersprüchliche Vorräte werden nicht geraten) steht in 4.5 und ist wichtiger als der
Einzelfall: Die Spezifikation erklärt Stapelelement und Einzelendpunkt an beiden Stellen
wörtlich für gleich, also darf kein Werkzeugpaar einen Wert einzeln erlauben und im Stapel
verbieten.

---

**S26 — Skeptikerphase**

*Streit:* Nur B führt sie als eigenes Arbeitspaket.

*Entscheidung:* **Verpflichtend als AP22**, mit dynamischer Fixing-Phase und erneuter Prüfung,
Wiederholung bis keine Findings mehr vorliegen oder verbleibende Punkte begründet als
akzeptiert dokumentiert sind. Modell und Effort mindestens auf dem Niveau des implementierenden
Agenten. Das ist keine Entwurfsfrage, sondern eine Konvention des Projektinhabers, die für
jeden Workflow gilt.

---

## 13. Verbindliche Versionen

**Alle Versionsangaben wurden am 2026-09-12 um 15:40 UTC unmittelbar vor dem Schreiben dieses
Abschnitts per `npm view <paket> version` nachgeprüft.** Wo der Registry-Wert vom Dossier
abweicht, steht der tatsächliche Wert hier und die Abweichung ist benannt.

### 13.1 Laufzeit und `engines`

| Wert | Festlegung |
| --- | --- |
| `engines.node` | **`>=22.19.0`** |

**Abweichung von `toolchain.md` 3.3 Punkt 1 und `mcp-sdk-typescript.md` 10.2, begründet.**
Beide Dossiers nennen `>=22.12.0`. Das ist mit der gewählten Werkzeugkette **nicht
verträglich**: `undici@8.10.2` deklariert `engines.node: ">=22.19.0"` und ist eine
**Laufzeit**abhängigkeit (Proxy-Unterstützung über `EnvHttpProxyAgent`, Keep-Alive). Ein Paket
mit `engines.node: ">=22.12.0"`, das eine Abhängigkeit mit `>=22.19.0` zieht, gibt ein
Versprechen, das es nicht halten kann.

Geprüfte Alternativen und warum sie verworfen sind:

- **`undici@7.29.1`** verlangt nur `>=20.18.1` und würde `>=22.12.0` erlauben. Verworfen, weil
  die gesamte Dossierrecherche zu Proxy, Keep-Alive und `MockAgent` auf der 8er-Linie beruht
  und ein Rückschritt auf eine ältere Hauptversion ohne Not das größere Risiko ist.
- **`undici` nur als `devDependency`** und Verzicht auf programmatische Proxy-Unterstützung.
  Verworfen, weil dann hinter einem Unternehmensproxy nichts mehr funktioniert und die
  Umgebungsvariablen-Auswertung von Node dafür experimentell und flaggenabhängig ist.

Die Untergrenze ist praktisch folgenlos: Node 22.19.0 ist eine Patch-Version innerhalb der
22er-LTS-Linie, und Node 24 erfüllt sie ebenfalls. Die Entwicklungsumgebung läuft auf Node
v22.23.2 (am 2026-09-12 belegt).

**Der Bau verlangt mehr als die Laufzeit, und der Entwurfsstand hat das falsch aufgelöst.**
`tsdown@0.23.0` deklariert `engines.node: "^22.18.0 || ^24.11.0 || >=26.0.0"`. Die Aussage
„`>=22.19.0` erfüllt das" ist **falsch**: `>=22.19.0` schließt Node 23.x, Node 24.0 bis 24.10
und Node 25.x ein, und **keine** dieser Versionen liegt in der Range von `tsdown`. Richtig ist:

| Zweck | Zulässige Node-Versionen | Wo es steht |
| --- | --- | --- |
| **Laufzeit** des veröffentlichten Pakets | `>=22.19.0` | `engines.node` der `package.json` (13.7) |
| **Bau und Entwicklung** (zusätzlich zu `tsdown` gilt die Laufzeitgrenze) | `>=22.19.0 <23.0.0` **oder** `>=24.11.0 <25.0.0` **oder** `>=26.0.0` | `CONTRIBUTING.md` (AP20) und die CI-Matrix (AP01) |

**`engines.node` bleibt `>=22.19.0` und wird nicht auf die Baurange verengt.** `tsdown` ist
eine **Entwicklungs**abhängigkeit (13.3), die kein Nutzer installiert; wer das Paket nur
ausführt, braucht sie nicht. Ein `engines`-Feld, das Nutzer auf Node 25 aussperrt, obwohl die
Laufzeit dort einwandfrei funktioniert, gäbe ein Versprechen über etwas, das es nicht
beschreibt.

**Die CI-Matrix nennt deshalb Versionen, die `tsdown` wirklich erfüllt:** **`22.19.0`** (die
Untergrenze der 22er-Linie, zugleich der niedrigste zulässige Wert überhaupt) und
**`24.11.0`** (die Untergrenze der 24er-Linie). Die früher genannte Matrix „Node 22 und 24"
ist zu unbestimmt: Löst „24" auf 24.10 oder früher auf, scheitert der Bau, und zwar an einer
Stelle, an der niemand einen Node-Versionsfehler vermutet. **Ausdrücklich nicht in der Matrix:
23.x, 24.0 bis 24.10 und 25.x.** Kommt später eine 26er-Linie hinzu, wird sie aufgenommen; das
ist eine Entscheidung mit Eintrag in `CHANGELOG.md` und keine stillschweigende Erweiterung.

`docs/entwicklung/toolchain.md` 3.3 und `docs/entwicklung/mcp-sdk-typescript.md` 10.2 sind an
dieser Stelle nachzuziehen.

### 13.2 Laufzeitabhängigkeiten (`dependencies`)

**Genau drei.**

| Paket | Version | Schreibweise | Registry-Stand 2026-09-12 | Zweck |
| --- | --- | --- | --- | --- |
| `@modelcontextprotocol/server` | `2.0.0` | **exakt**, kein Caret | `2.0.0` | MCP-Protokoll: Server, Transport, Typen |
| `undici` | `^8.10.2` | Caret | `8.10.2` | `EnvHttpProxyAgent` und Keep-Alive für das eingebaute `fetch` |
| `zod` | `^4.6.2` | Caret | `4.6.2` | Eingabevalidierung: `src/schema/build.ts`, `src/schema/cross-checks.ts`, `src/config/env.ts` |

**`zod` steht in `dependencies`, weil eigener Code es direkt importiert.** Das ist keine
Redundanz zur Abhängigkeit des SDK, sondern die Voraussetzung dafür, dass der eigene Code
überhaupt lädt. Belegt an drei Stellen dieses Plans: `src/schema/build.ts` erzeugt aus einem
`ToolEntry` ein Zod-Objekt mit `.strict()` (2, AP05), `src/schema/cross-checks.ts` setzt die
Querprüfungen als `superRefine` um (4.7), und `src/config/env.ts` prüft alle
Umgebungsvariablen gegen ein Zod-Schema (6.4 Punkt 3). Dazu Guard 3 in 1.4.

**Warum die frühere Begründung falsch war.** Der Entwurfsstand argumentierte, eine zweite
direkte Deklaration erzeuge „nur eine zweite Stelle, an der eine Version driften kann". Das
verkennt die Auflösungsregel des festgelegten Paketmanagers: **`pnpm` legt keine
Phantomabhängigkeiten ins Wurzel-`node_modules`.** Unter `pnpm@10.34.3` (S22) ist ein Paket,
das nur ein anderes Paket deklariert hat, aus eigenem Code **nicht auflösbar**; der Import
scheitert mit `ERR_MODULE_NOT_FOUND: Cannot find package 'zod'`. Wer ein Paket importiert, muss
es deklarieren. Die Driftsorge ist zudem gegenstandslos: `^4.6.2` liegt in der SDK-Range
`^4.2.0`, das Lockfile wird eingecheckt (13.7), und pnpm teilt sich dieselbe aufgelöste Version,
statt eine zweite Kopie zu installieren.

**Abweichung von `toolchain.md` 12, aufgehoben.** Das Dossier führt `zod` als direkte
`dependency` mit `^4.6.2`, und das ist richtig. Die frühere Einschätzung, das gelte nur für die
v1-Linie, ist hiermit zurückgenommen.

**Der v1-Rückfall, vollständig, für den Fall dass AP02 ihn auslöst:**

| Paket | Version | Zweck |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` | `1.30.0` exakt | ersetzt `@modelcontextprotocol/server` **und** `@modelcontextprotocol/client` |
| `undici` | `^8.10.2` | unverändert |
| `zod` | `^4.6.2` | unverändert direkte `dependency` |

**Beim v1-Rückfall ändert sich an der `zod`-Zeile nur die Begründung, nicht die Deklaration:**
Unter v1 ist `zod` zusätzlich eine `peerDependency` des SDK, unter v2 eine gewöhnliche
Abhängigkeit des SDK. In beiden Fällen bleibt es eine direkte Abhängigkeit dieses Projekts,
weil der eigene Code sie importiert. Bei v1 zusätzlich verbindlich: alle SDK-Importe mit
`.js`-Endung, nie der Root-Pfad. **Kein Mischen der beiden Linien.**

### 13.3 Entwicklungsabhängigkeiten (`devDependencies`)

| Paket | Version | Schreibweise | Registry-Stand 2026-09-12 | Bemerkung |
| --- | --- | --- | --- | --- |
| `@modelcontextprotocol/client` | `2.0.0` | **exakt** | `2.0.0` | nur für den Integrationstest; bei v1 entfällt er, die Client-Klasse liegt dann im selben Paket |
| `typescript` | `6.0.3` | **exakt**, kein Caret | Registry-`latest` ist **`7.0.2`** | **siehe 13.4** |
| `typescript-eslint` | `^8.70.0` | Caret | `8.70.0` | typgestützte Lint-Regeln |
| `eslint` | `^10.10.0` | Caret | `10.10.0` | Flat Config |
| `@biomejs/biome` | `^2.5.13` | Caret | `2.5.13` | nur Formatierung, kein Linting |
| `tsdown` | `0.23.0` | **exakt** | `0.23.0` | Bau; `tsc` läuft nur als `tsc --noEmit` |
| `vitest` | `^5.0.0` | Caret | `5.0.0` | `engines: ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| `@vitest/coverage-v8` | `^5.0.0` | Caret | `5.0.0` | synchron zu `vitest` |
| `@types/node` | `^22.20.2` | Caret | `22.20.2` | passend zur 22er-Untergrenze, nicht die neueste Major-Linie |
| `@anthropic-ai/mcpb` | `^2.1.2` | Caret | `2.1.2` | Bau des `.mcpb`-Bundles, **siehe 13.4** |
| `gpt-tokenizer` | `4.0.0` | **exakt**, kein Caret | `4.0.0` | Lizenz **MIT**. Tokenmessung für P11 (9.2) und `scripts/measure-tokens.ts` (AP14), **siehe 13.9** |

`pnpm` als `packageManager`-Feld: **`pnpm@10.34.3`** (Entscheidung S22; Registry-`latest` ist
`12.4.1`).

GitHub Actions, aus `toolchain.md` 10 übernommen und dort belegt; `npm view` deckt sie nicht
ab, sie sind daher **nicht in dieser Session nachgeprüft**: `actions/checkout` v7.0.1,
`actions/setup-node` v7.0.0, `pnpm/action-setup` v6.1.0. Vor dem ersten CI-Lauf sind sie
gegen die jeweilige Release-Seite zu prüfen und auf einen Commit-SHA zu pinnen.

### 13.4 Der Versionskonflikt zwischen TypeScript und typescript-eslint

**Das ist der wichtigste Punkt dieses Abschnitts, und er ist am 2026-09-12 belegt:**

```
npm view typescript version                             → 7.0.2
npm view typescript-eslint@8.70.0 peerDependencies      → { typescript: ">=4.8.4 <6.1.0",
                                                            eslint: "^8.57.0 || ^9.0.0 || ^10.0.0" }
npm view @typescript-eslint/typescript-estree@8.70.0 peerDependencies
                                                        → { typescript: ">=4.8.4 <6.1.0" }
```

**TypeScript 7.0.2 ist mit `typescript-eslint@8.70.0` unverträglich.** Die Peer-Range endet
ausdrücklich unterhalb von 6.1.0. Ein `npm install` würde bei aktivierter
`strict-peer-dependencies` scheitern und sonst eine Warnung erzeugen, die niemand liest, bis
das typgestützte Linting stumm ausfällt.

Hinzu kommt der technische Grund: `typescript@7.0.x` liefert nur noch die native
`tsc`-Binärdatei und **keine programmatische Compiler-API** mehr. Typgestütztes Linting
braucht genau diese API. Der Konflikt ist damit nicht nur eine Versionsangabe in einem
Manifest, sondern eine fehlende Fähigkeit.

**Entschieden:**

- **`typescript` wird auf `6.0.3` gepinnt, exakt und ohne Caret.** `6.0.3` ist die höchste
  veröffentlichte 6.x-Version (per `npm view typescript versions` bestätigt; die einzigen
  neueren 6er-Einträge sind `-dev`- und `-rc`-Vorabversionen). Ein Caret `^6.0.3` wäre
  ungefährlich, aber ein exakter Pin macht die Absicht sichtbar und verhindert, dass ein
  automatisches Update auf 7.x durchrutscht.
- **Die frühere Dossierangabe `^5.9` ist falsch** und wird nicht übernommen: `^5.9` bedeutet
  `>=5.9.0 <6.0.0` und schlösse `6.0.3` formal aus.
- **`tsdown@0.23.0` ist davon nicht betroffen**: Seine Peer-Range für `typescript` lautet
  `^5.0.0 || ^6.0.0 || ^7.0.0` und deckt 6.0.3 ab.
- **Der Zustand ist zu überwachen, nicht zu ignorieren.** Sobald `typescript-eslint` eine
  Version mit einer Peer-Range veröffentlicht, die 7.x einschließt, und `typescript` wieder
  eine programmatische API anbietet, ist der Pin neu zu bewerten. Dependabot meldet beide
  Pakete wöchentlich; der Aktualisierungs-Pull-Request für `typescript` auf 7.x wird
  **abgelehnt**, solange die Peer-Range ihn ausschließt, und der Grund steht als Kommentar in
  `package.json`.

### 13.5 Das Verpackungswerkzeug und eine reale Lieferkettenlücke

Das Bundle-Werkzeug heißt **`@anthropic-ai/mcpb`** (Registry-Stand `2.1.2`) und liefert ein
`bin` namens `mcpb`.

**Der unscoped Name `mcpb` existiert auf npm am 2026-09-12 nicht** (`npm view mcpb` antwortet
mit HTTP 404). Daraus folgt eine verbindliche Regel und eine präzisierte Begründung:

- **Verpackungswerkzeuge werden aus `node_modules` aufgerufen, niemals über `npx`.**
  `npx mcpb` würde heute mit einem Fehler abbrechen — und, sobald jemand den freien Namen
  registriert, in einem Veröffentlichungsjob fremden Code ausführen, dessen Herkunft das
  Projekt nicht kontrolliert. Der Name ist unbesetzt und damit besetzbar.
- Entwurf C nennt diese Lücke zu Recht, beschreibt sie aber als Rückfall auf ein
  **vorhandenes** fremdes Paket. Das trifft am 2026-09-12 nicht zu; die Regel bleibt richtig,
  die Begründung ist hier korrigiert. Sie steht als deutscher Kommentar in
  `scripts/build-mcpb.ts`.

### 13.6 Paket- und Namensraumfragen, geprüft

| Frage | Befund am 2026-09-12 |
| --- | --- |
| `@dennismenken/buchhaltungsbutler-mcp` | **frei** (HTTP 404) |
| `buchhaltungsbutler-mcp` unscoped | **belegt**; unter dem Namen ist zudem ein `bin` `buchhaltungsbutler-mcp` vergeben. Darf in keiner Anleitung als unser Paketname auftauchen (E3) |
| `bbutler-mcp` als Paketname | **frei** (HTTP 404) |
| Namensraum `@dennismenken` | Ein HTTP 404 auf einen gescopten Paketnamen ist **kein** Beleg dafür, dass der Namensraum zum eigenen Konto gehört. **Angemeldet auf npmjs.com zu prüfen, als blockierender Pflichtschritt in AP21.** Gehört er nicht dazu, ist `dennismenken` als Organisation anzulegen |
| Namensraum `@init4` | `toolchain.md` 9.1 schlägt ihn noch vor. **Überholt durch E3**; die Stelle ist nachzuziehen |

### 13.7 Festlegungen zur `package.json`

- `"type": "module"`
- `"files": ["dist"]`, ergänzt durch `.npmignore` für `docs/` und `test/`
- `"bin": { "bbutler-mcp": "./dist/cli.js" }` — **genau ein Eintrag** (S20)
- `"engines": { "node": ">=22.19.0" }` (13.1)
- `"packageManager": "pnpm@10.34.3"` (S22)
- Exakte Versionen ohne Caret für: `@modelcontextprotocol/server`,
  `@modelcontextprotocol/client`, `typescript`, `tsdown`
- Lockfile wird eingecheckt
- `dist/index.js` bleibt dem programmatischen Export vorbehalten. **Der Mischzustand, in dem
  `bin` auf `dist/cli.js` zeigt, ein `chmod`-Schritt aber `dist/index.js` ausführbar macht,
  ist ausgeschlossen**; der Paketprobelauf Schritt 3 weist das nach.

### 13.8 Protokollrevision

Maßgeblich ist die Revision, die das eingesetzte SDK **nachweislich zur Laufzeit aushandelt**;
am 2026-09-12 ist das `2025-11-25`, und zwar bei **beiden** SDK-Linien. Die auf `2026-07-28`
bezogenen Pflichten sind bis zu einem gegenteiligen Laufzeitnachweis Zielzustand und keine
Umsetzungspflicht. Der Protokollrahmen wird nicht am SDK vorbei nachgebaut. Konkret **nicht
gebaut**: `server/discover`, die Pflicht-`_meta`-Prüfung je Request, die Antwort `-32022` auf
Versionskonflikte, `resultType`, `serverInfo` je Result, `ttlMs` und `cacheScope`. Die
`McpServer`-API beider Linien bietet dafür keinen Weg.

**Ausdrücklich nicht benutzt:** die experimentelle Tasks-API (`server.experimental.tasks`,
`registerToolTask`), Sampling, Form-Elicitation und der HTTP-plus-SSE-Transport.

### 13.9 Der Tokenizer für die Budgetmessung

Das Kontextbudget aus 4.10 ist nur dann eine Prüfung und keine Schätzung, wenn P11 echte Token
zählt. Dafür braucht das Projekt genau **eine** Entwicklungsabhängigkeit, und sie ist hier
festgelegt statt später gewählt.

**Entschieden: `gpt-tokenizer`, Version `4.0.0`, exakt gepinnt, Lizenz MIT.** Am 2026-09-12
geprüft: `npm view gpt-tokenizer version` → `4.0.0`, `license` → `MIT`, `dependencies` →
**keine**. Das Paket ist reines JavaScript, ohne WebAssembly und ohne native Binärdatei,
liefert ESM und CJS und führt je Kodierung einen eigenen Einstiegspunkt; der hier benutzte
`gpt-tokenizer/encoding/o200k_base` ist im Tarball der Version 4.0.0 vorhanden und wurde am
2026-09-12 unter Node v22.23.2 aufgerufen; er liefert für einen deutschen Beispielsatz eine
Tokenzahl, ohne etwas nachzuladen.

| Frage | Antwort |
| --- | --- |
| Warum **exakt** gepinnt | Eine geänderte Kodierungstabelle verschiebt die gemessene Tokenzahl. Ohne Pin könnte P11 ohne eine einzige Codeänderung von grün nach rot springen, und niemand fände den Grund im Diff |
| Warum kein WASM-Paket | `tiktoken@1.0.22` (MIT) ist die WASM-Variante. Ein WASM-Ladepfad im Testlauf ist eine zusätzliche Fehlerquelle ohne Gegenwert, weil hier nur gezählt wird |
| Warum nicht `js-tiktoken` | `js-tiktoken@1.0.21` (MIT) erfüllt dieselbe Aufgabe, zieht aber `base64-js` als transitive Abhängigkeit. Bei sonst gleicher Eignung gewinnt die Variante ohne Abhängigkeit |
| Größe | 9,1 MB gepackt, 27,2 MB entpackt in `node_modules`. Das ist viel, betrifft aber **ausschließlich die Entwicklungszeit**: `files: ["dist"]` (13.7) hält es aus dem veröffentlichten Paket, und das Größenbudget aus 9.10 misst nur das Tarball |
| Läuft die Messung offline | Ja. Die Kodierungstabellen liegen im Paket; es wird nichts nachgeladen. Das ist Voraussetzung, weil `test/setup.ts` das Netz sperrt (9.1) |

**Was die Messung nicht ist, ausdrücklich benannt.** `o200k_base` ist die tatsächliche
Kodierung der GPT-4o-Linie. Für andere Modellfamilien, die Claude-Linie eingeschlossen, ist der
Tokenizer **nicht öffentlich dokumentiert**; die gemessene Zahl ist dort eine belastbare
Größenordnung und keine exakte Zahl. Der Plan behauptet an keiner Stelle etwas anderes, und
die Befunddatei aus AP14 wiederholt diesen Satz. Für die Zwecke des Budgets genügt das: Die
Entscheidung, die daran hängt, lautet „passt in ein übliches Kontextfenster oder nicht", und
sie kippt nicht an fünf Prozent Abweichung.

**Zur Laufzeit wird dieser Tokenizer nicht geladen** (13.2, 4.10, 8.4). Der ausgelieferte
Server rechnet ausschließlich mit der Konstanten `CHARS_PER_TOKEN`.

---

## 14. Risiken und benannte Restunsicherheiten

### 14.1 Risiken, die dieser Plan bewusst in Kauf nimmt

| # | Risiko | Schwere | Was es abmildert |
| --- | --- | --- | --- |
| R1 | **Ein Host ohne Rückfrage kann mit diesem Server löschen, stornieren und buchen.** E2 verbietet ein serverseitiges Bestätigungsmuster, und Annotationen sind nach dem MCP-Schema ausdrücklich Hinweise, keine Durchsetzung | hoch | ehrliche Annotationen an allen 54 Werkzeugen, die 39 Pflichtsätze U1 bis U7, aufgelöste Schreibantworten mit Umkehrweg, der optionale Nur-Lesen-Schalter, Betrags- und Mengengrenzen. **Verhindern lässt es sich nicht**, und das ist die bewusste Folge von E2 |
| R2 | **Der Kontextpreis von 54 Werkzeugen**, rund 32.100 Token in deutscher Fassung, oberhalb der belegten Degradationsschwelle von 30 bis 50 Werkzeugen | hoch | Budget gesetzt und maschinell erzwungen (4.10), sechs Sparmaßnahmen, Resources statt Beschreibungstext. Der Rest ist der Preis von E1 zusammen mit E4 und lässt sich nicht wegkonstruieren; rund 7.300 Token davon gehen auf die deutsche Sprache und sind in 4.10 gesondert ausgewiesen |
| R3 | **Trefferquote bei 54 Werkzeugen.** Ein Agent könnte trotz aller Maßnahmen häufiger danebengreifen als bei 34 Werkzeugen | hoch | Der Evaluationslauf AP18 misst es. Fällt „falsche Werkzeugwahl bei den zwölf Buchungswerkzeugen" nicht auf 0, ist das ein Befund für den Projektinhaber |
| R4 | **Das Register ist groß und kann fachlich falsch sein**, ohne dass ein Test es merkt: ein fehlender Enum-Wert lehnt gültige Vorgänge ab, bevor der Request abgeht, und ist am Serververhalten nicht erkennbar | mittel | Jedes Enum trägt die Belegstelle. Im Zweifel freier String mit Werteliste in der Beschreibung (4.3). Der Evaluationslauf und der Vertragslauf decken einen Teil auf |
| R5 | **Der Duplikatshinweis kostet einen zusätzlichen Request** aus einem geteilten Kontingent von 100 je Minute | mittel, aber im Auslieferungszustand nicht wirksam | **Standardmäßig aus** (`BB_MCP_DUPLICATE_CHECK`, Vorgabe `off`, 6.2), weil ein unsichtbarer Zusatzaufruf E1 und der Regel aus 7.5 Regel 2 widerspricht. Wer ihn einschaltet, sieht den Verbrauch im Zustandsblock der `instructions`; bei Stapelwerkzeugen läuft er **einmal für den ganzen Stapel**, nicht je Element; er entfällt, wo kein tragfähiges fachliches Schlüsselpaar existiert. Ohne ihn übernimmt der Text aus 5.7 die Aufgabe und nennt dem Agenten den konkreten Prüfaufruf |
| R6 | **Zwölf Clientadapter altern schneller als der Rest.** Pfade und CLI-Befehle ändern sich; vier davon sind in `distribution.md` 16 bereits als nicht verifiziert geführt | hoch, Hauptquelle künftiger Fehlerberichte | Staffelung nach Vertrauen: CLI-Aufruf, dann JSON-Datei, dann nur Ausgeben. Wo der Pfad nicht dokumentiert ist, wird nichts geschrieben |
| R7 | **npx-Kaltstart reißt das Startzeitlimit der Codex CLI** (Vorgabe dort 10 Sekunden) | real, Kaltstartdauer nicht gemessen | Der Assistent setzt für Codex immer `startup_timeout_sec = 30`. Der Paketprobelauf misst die Startzeit ab AP01 und macht eine Verschlechterung sichtbar. Die globale Installation wird für den Dauerbetrieb empfohlen |
| R8 | **Der Server schreibt versehentlich auf stdout.** Ein einziger `console.log` zerstört die Protokollverbindung | klassisch, schwer zu finden | `no-console` mit Ausnahme für `error`; alle Ausgaben über `src/logging/stderr.ts`; der Integrationstest prüft, dass stdout ausschließlich gültige JSON-RPC-Zeilen trägt |
| R9 | **Der Rate-Limiter ist prozesslokal.** Zwei Clients auf demselben Mandanten teilen ihn nicht | niedrig | In der README benannt. Sicherheitsabstand 60 statt 100, Eimerschlüssel `api_key` |
| R10 | **Prompt-Injection über API-Freitextfelder.** `counterparty`, `purpose`, `booking_text`, Kommentare und Belegdateinamen stammen von Dritten und landen im Modellkontext | mittel | Neutralisierte Ausgabe in Tabellenzellen, nie als Anweisung formatiert, Steuer- und Bidi-Zeichen entfernt. **Vollständig verhindern lässt es sich nicht** |
| R11 | **Der `bin`-Name `bbutler-mcp` könnte von einem fremden Paket belegt sein.** Ein freier Paketname belegt nicht, dass der `bin`-Name frei ist; eine vollständige Registry-Prüfung ist nicht möglich | gering | Tritt es auf, sind nur `package.json` und die README zu ändern; der Paketname bleibt |
| R12 | **Die manuelle Prüfung der Fehlerklassen ist Handarbeit über 786 Einträge** | mittel | Die automatische Ableitung erzeugt einen Vorschlag, die Prüfung ist ein eigener Arbeitsschritt in AP08 und im Diff sichtbar. Sie entscheidet über Retry ja oder nein und darf nicht geraten werden |

### 14.2 Was nicht verifiziert ist, und wie der Plan trotzdem handlungsfähig bleibt

Kein Punkt dieser Tabelle blockiert die Umsetzung. Jeder trägt eine Festlegung, wie bis zur
Klärung zu verfahren ist.

| Punkt | Stand | Festlegung bis zur Klärung |
| --- | --- | --- |
| Verhalten von `/receipts/delete/<id>` und `/receipts/restore/<id>` in der Pfadsegmentform | **nicht verifiziert**, aus L1 abgeleitet, schreibend und deshalb nicht getestet | Wie L1 gebaut, Eintrag trägt `verified: false`. Feststellung in AP19, Nachziehen in AP19b, Testmandat nötig |
| Wiederholungsverhalten von `delete`, `restore`, `unconfirm`, `unassign`, `cancel`, `assign` | **nicht verifiziert** | `idempotentHint: false` bei allen (S6). Umstellung erst durch AP19b, nach belegtem Ergebnis aus AP19 |
| Welche Währungen `/receipts/add` und `/receipts/addBatch` wirklich annehmen | **nicht verifiziert**, und die Spezifikation widerspricht sich dreifach: 3 Codes am Endpunkt, 48 Codes im Beschreibungstext des Stapelelements, `enum: ["EUR"]` in derselben Eigenschaft (0.5 Korrektur 2) | **Freier String an beiden Werkzeugen**, Widerspruch in der Beschreibung benannt (4.5). Ein Enum wäre hier eine erfundene Schranke und lehnte gültige Belege unsichtbar vor dem Request ab (R4) |
| Ob `/transactions/add` den Code `RSD` annimmt, den nur das Stapelelement nennt | **nicht verifiziert** | Vereinigung der beiden Listen, also 48 Codes an beiden Werkzeugen (4.5, Regel R-B). Ein abgelehnter Request mit sprechender Meldung ist der billigere Irrtum als eine unsichtbare Ablehnung vor dem Request |
| Währung einer Zahlung ohne Angabe von `currency` | **nicht verifiziert**; die Spezifikation beschreibt `amount` als Betrag „in the account's currency", und kein Endpunkt gibt die Währung eines Zahlungskontos preis | `currency` bleibt **optional** (4.3). Die Beschreibung sagt, dass ohne Angabe die Währung des Zahlungskontos gilt und dass die API diese nicht liefert. Ein Pflichtfeld hätte den Agenten zum Raten gezwungen, und eine falsch gebuchte Fremdwährungszahlung ist über die API nicht löschbar (U4) |
| Wortlaut des Feldes `message` in Fehlerantworten | **teilweise gemessen** (L6): Bei zwei von drei geprüften Paaren stimmte er mit beiden Spezifikationsquellen überein, bei dem einen Paar, an dem die Quellen sich widersprechen, war er eine dritte Variante | Der Katalog führt beide Texte (`message` aus dem Enum, `summary` aus der `description`, 5.6); ausgegeben wird immer der **Wortlaut der Antwort**, und keine Weiche vergleicht auf Gleichheit gegen einen Spezifikationstext (5.3, 5.8) |
| Betragsformat beim **Senden**: Dezimaltrenner, Tausendertrenner | **nicht verifiziert**; beim Empfangen ist String belegt | Gesendet wird eine JSON-Zahl mit Punkt, wie die Spezifikation es zeigt. Die Umwandlung geschieht in `mapping/request.ts` aus dem validierten Dezimalstring |
| Obergrenze von `limit` bei `/settings/get/debtors`, `/creditors`, `/postingaccounts` | **nicht verifiziert** | **Kein `maximum` im Schema**, dafür der Warnsatz aus 7.5. Ein zu enges `maximum` lehnt gültige Aufrufe unsichtbar ab; ein fehlendes kostet einen Fehlversuch mit sprechender Meldung |
| Antwort beim Reißen des Minutenlimits (Status, `error_code`) | **nicht verifiziert**, bewusst nicht provoziert | Defensiv gleich behandelt: 403 mit Code 15, HTTP 429 und 5xx |
| Ob `/receipts/get/<id>` mit `get_file: true` funktioniert und wie groß die Antwort wird | **nicht verifiziert**; der Einzelabruf selbst ist belegt | Kürzungsregel aus 7.6 greift; Base64 nie im Textblock |
| Maximale Dateigröße bei `/receipts/upload` | **nicht verifiziert** | Vorläufige Obergrenze 10 MB im Schema, **als eigene Annahme gekennzeichnet** und in der Parameterbeschreibung genannt |
| Ob `/receipts/upload` wirklich nur EUR akzeptiert | **nicht verifiziert**, Widerspruch innerhalb der Spezifikation | Freier String mit Vorgabe `EUR`, Widerspruch in der Beschreibung benannt (4.5) |
| Maximale Elementzahl der Stapelendpunkte unter `/postings/` und `/settings/` | **nicht verifiziert**; für `receipts` und `transactions` nennt die Spezifikation 50 | `BB_MCP_MAX_BATCH` mit Vorgabe 50 für alle acht |
| Maximale Positionszahl je Buchung und je Rechnung (`positions`, `items`) | **nicht verifiziert**; die Spezifikation nennt dort keine Obergrenze | Dieselbe Grenze wie bei den Stapeln (Q4 in 4.7), also 50, **ausdrücklich als eigene Mengengrenze und nicht als API-Regel ausgewiesen**. Eine Splitbuchung oder Rechnung mit mehr als 50 Positionen wird damit vor dem Request abgelehnt. Wird ein echter Fall belegt, ist die Obergrenze der Variablen anzuheben; das ist ein Befund für den Projektinhaber (R4 gilt hier gegen uns, und das wird nicht verschwiegen) |
| Ob `/postings/assign/receipt-to-free-posting` wiederholbar ist und sich lösen lässt | **nicht verifiziert**; belegt ist nur, dass es unter `/postings/` keinen `unassign`-Pfad gibt | Klasse B, `idempotentHint: false`, Pflichtsatz U4 |
| Ob ein ersetzter Bericht eine neue `report_id_by_customer` bekommt | **nicht verifiziert** | Betrifft nur den Anschlusshinweis; dieser nennt die Kennung aus der Antwort, nicht eine erwartete |
| Laufzeit der Berichtserzeugung und damit das Warteintervall | **Annahme** nach `berichte.md` 2.4 | Der Server pollt **nicht** selbst. Er nennt das Intervall in der Meldung zu Code 8 und überlässt das Warten dem Agenten. Damit bleibt die Annahme folgenlos |
| Zeitzone aller Datumsangaben | in keiner Quelle dokumentiert | Nicht konvertieren, unverändert durchreichen, Unsicherheit in den `instructions` benennen |
| Ob die API Schreibvorgänge dedupliziert | **nicht verifiziert** | Beim Anbieter erfragen. Solange offen: kein automatischer Retry; der Text aus 5.7 nennt dem Agenten nach einem Zeitlimit den konkreten Prüfaufruf, und wer zusätzlich absichern will, schaltet `BB_MCP_DUPLICATE_CHECK` auf `on` (Vorgabe `off`, 6.2) |
| Zeichen-je-Token-Verhältnis 3,2 für deutschen Fließtext mit englischen Bezeichnern in JSON-Struktur | **Annahme**; ebenso der Zeichenaufschlag von 15 Prozent gegenüber der englischen Fassung | **Das Budget hängt nicht daran:** P11 zählt ab AP11 mit dem echten Tokenizer aus 13.3 (4.10). AP14 misst das Verhältnis, ersetzt die Zahlen in 4.10 und setzt `CHARS_PER_TOKEN`; danach wirkt der Faktor nur noch auf die Laufzeitschätzung in 7.6 und 8.4, wo eine zu frühe Kürzung harmlos ist |
| Tokenzahl für die Modelle der Claude-Linie | **nicht verifizierbar**: Der Tokenizer ist nicht öffentlich dokumentiert (13.9) | Gemessen wird mit `o200k_base`. Die Zahl wird im ganzen Projekt als Größenordnung geführt und nirgends als exakt bezeichnet; die Entscheidung, die daran hängt, kippt nicht an wenigen Prozent |
| Größe des gepackten und entpackten Pakets gegen die Grenzen aus 9.10 | **Annahme**, aus den bekannten Posten hochgerechnet; es gibt noch keinen Bau | Die Grenzen liegen bei rund dem Doppelten des Erwarteten. Der erste echte Lauf in AP16 misst sie; reißt er sie, gilt die Reihenfolge aus 9.10 und **nicht** das Anheben der Zahl |
| Kaltstartdauer von `npx -y` für dieses Paket | **nicht gemessen** | Der Paketprobelauf misst sie ab AP01 und schreibt sie ins Protokoll |
| Ob der Anbieter die OpenAPI-Datei unter einer stabilen Adresse veröffentlicht | **nicht verifiziert** | `drift.yml` prüft den eingecheckten Stand gegen das Generat. Ein automatisches Abholen wird erst gebaut, wenn eine stabile Adresse belegt ist |
| Rechtsträger hinter der Marke „BuchhaltungsButler" | **nicht verifiziert** | Vor AP20 im Impressum des Anbieters prüfen, bevor `NOTICE.md` geschrieben wird |

### 14.3 Was dieser Plan bewusst nicht enthält

- **Keine Auto-Paginierung** (7.5).
- **Kein `confirm`, kein Trockenlauf, keine serverseitige Bestätigung** (E2).
- **Kein Werkzeug, das Suchen und Schreiben verbindet.**
- **Keine MCP-Prompts.** Sie lösen kein Problem, das dieser Server hat.
- **Kein Schlüsselbund-Zugriff.** Später möglich, hinter einem Schalter.
- **Keine Übernahme fremden Quelltextes.** Zulässige Grundlage sind ausschließlich die
  Dossiers unter `docs/` und die eigenen Messungen aus 0.3.
- **Keine Felder der MCP-Revision 2026-07-28** (13.8).

---

## 15. Nachzuziehende Stellen in den Dossiers

Diese Stellen sind durch die Befunde in 0.3 bis 0.5 oder durch Entscheidungen dieses Plans
überholt. Sie werden **nicht** stillschweigend gelassen; das Nachziehen gehört in AP20.

**Die Tabelle hat 25 Zeilen und berührt zehn Dateien.** Diese zehn stehen namentlich in der
Dateiliste von AP20 (11.2), und der Dateibaum in Abschnitt 2 nennt dieselbe Ausnahme; ohne
diese drei zusammenpassenden Stellen müsste der Bearbeiter von AP20 nach der Eigentumsregel aus
Abschnitt 11 zurückfragen, statt zu handeln. Eine der 25 Zeilen (`toolchain.md` 12, `zod`)
verlangt ausdrücklich **keine** Änderung; sie bleibt in der Tabelle, damit die Prüfung
nachvollziehbar bleibt und niemand sie ein zweites Mal aufwirft. Jede tatsächlich geänderte
Stelle trägt einen Vermerk auf diesen Plan mit Abschnittsnummer.

| Datei | Stelle | Was jetzt gilt |
| --- | --- | --- |
| `docs/api/belege.md` | 4.5 | `/receipts/get/id_by_customer` funktioniert als **Pfadsegment**; die geprüften Body-Varianten waren die falsche Aufrufform (L1) |
| `docs/api/transaktionen.md` | 4.5 | dasselbe für `/transactions/get/id_by_customer`; die Umgehung über exklusive Kennungsgrenzen wird nicht gebraucht (L1) |
| `docs/api/grundlagen.md` | 5.6, 7.3 (beide Zeilen), Stolperfallen 28 und 29 | Beide Einzelabruf-Endpunkte sind benutzbar; der Fremdwährungsablauf ist durchführbar |
| `docs/api/grundlagen.md` | Antwortfelder der Belege und Zahlungen | Listen- und Einzelabruf haben **verschiedene Feldnamen und verschiedene Feldmengen** (L2), und `id_by_customer` ist bei `receipts` ein String, bei `transactions` eine Zahl (L3) |
| `docs/api/fehlercodes.md` | Zahlangabe zum Katalog | Der Katalog hat **786 Paare** (Pfad, `error_code`), nicht 718 Definitionen; 42 Definitionen sind verwaist (0.4) |
| `docs/api/fehlercodes.md` | Vorbemerkung „Ob die Live-API exakt diesen Wortlaut sendet, ist nicht verifiziert" | **Teilweise beantwortet** (L6): An `/receipts/get` traf der Wortlaut bei den Codes 5 und 10 zu, bei Code 15 kam mit `invalid field specified` ein Text, der weder in der `description` noch im `message`-`enum` steht. Die Spalte „message (Original)" des Dossiers bleibt richtig gewählt (sie führt den `enum`-Wortlaut, und genau der ist nach 5.6 die Katalogquelle), bekommt aber den Hinweis, dass der gelieferte Text abweichen kann |
| `docs/api/belege.md` | 5.5 (Widersprüchliche Währungsangabe) und die Definition `Receipt` | Es gilt **an `/receipts/add` und an `/receipts/addBatch` derselbe** Umgang: freier String, Pflichtfeld, Widerspruch in der Beschreibung benannt. Der Ein-Wert-`enum` `["EUR"]` der Definition wird verworfen (4.5, 0.5 Korrektur 2) |
| `docs/api/transaktionen.md` | Währungsliste zu `/transactions/add` und die Definition `Transaction` | Es gilt **an beiden Werkzeugen** dasselbe `enum` aus **48** Codes (die 47 des Endpunkts plus `RSD`), an beiden **optional**; die Beschreibung nennt, dass ohne Angabe die Kontowährung gilt und die API sie nicht preisgibt (4.3, 4.5) |
| `docs/api/live-befunde-orchestrator.md` | Befund 1, Einleitungssatz | Die Aussage, die Spezifikation deklariere `id_by_customer` **zusätzlich als Body-Parameter**, trifft nicht zu: Maschinell geprüft führt `/receipts/get/id_by_customer` nur `api_key` und `get_file`, die drei übrigen nur `api_key`. Die Messungen und alle Folgerungen des Befunds bleiben unberührt (4.6) |
| `docs/entwicklung/tool-design.md` | Warnung unter 3.5, Abschnitt 12 | Beide Werkzeuge sind lieferfähig; Abgrenzungssätze dürfen auf sie verweisen |
| `docs/entwicklung/tool-design.md` | 9.3, Klasse M | `destructiveHint: true` (S5) |
| `docs/entwicklung/tool-design.md` | 9.3 gegen 11.8 | Widerspruch bei den Annotationen lesender Werkzeuge („n/a" gegen „alle vier explizit"). Aufgelöst: **alle vier explizit** |
| `docs/entwicklung/tool-design.md` | 11.1 | „zwischen 28 und 34 Tools" ist durch E1 aufgehoben; die Abnahmeliste lautet 54 |
| `docs/entwicklung/tool-design.md` | 10.3 | Das Budget von 10.000 Token galt für 34 Werkzeuge; für 54 in deutscher Fassung gilt 32.000 plus 2.100 (4.10) |
| `docs/entwicklung/tool-design.md` | 11.3, Sprache der Beschreibungen | Der fünfteilige Aufbau bleibt, der Text ist **deutsch** (E4, 4.9); die Regel „deutsche Fachbegriffe in Anführungszeichen" entfällt, stattdessen stehen API-Feldnamen, Werkzeugnamen und Enum-Werte unverändert im Original |
| `docs/entwicklung/tool-design.md` | 9.5, Absagetext | Inhalt und Aufbau bleiben, die Ausgabe ist **deutsch** (6.6) |
| `docs/entwicklung/distribution.md` | 13.2 | `BB_MCP_READ_ONLY` ist kanonisch (S8); der Server bricht bei fehlenden Zugangsdaten **nicht** ab (S7) |
| `docs/entwicklung/distribution.md` | 14.2 | `/accounts/get` liefert **keinen Mandantennamen**; der Bestätigungstext „Verbunden mit …" ist so nicht baubar. Ersatz in 8.2 Schritt 4 |
| `docs/entwicklung/toolchain.md` | 3.3 Punkt 1 | `engines.node` ist `>=22.19.0`, nicht `>=22.12.0` (13.1) |
| `docs/entwicklung/toolchain.md` | 12, Zeile `zod` | **Nichts nachzuziehen.** Das Dossier führt `zod` als direkte `dependency` mit `^4.6.2`, und genau so wird es gebaut (13.2), weil eigener Code es importiert und pnpm keine Phantomabhängigkeiten auflöst |
| `docs/entwicklung/toolchain.md` | 9.1 | Der Namensraum `@init4` ist durch E3 überholt; es gilt `@dennismenken` |
| `docs/entwicklung/toolchain.md` | 13.2 | Der `packageManager`-Konflikt ist entschieden: `pnpm@10.34.3` (S22) |
| `docs/entwicklung/mcp-sdk-typescript.md` | 10.2 | `engines.node` wie oben |
| `docs/entwicklung/mcp-sdk-typescript.md` | 10.3 | Der `bin`-Name ist `bbutler-mcp`, nicht `buchhaltungsbutler-mcp` (S20) |
| `docs/README.md` | Entscheidungsübersicht | `BB_MCP_MODE` und das `confirm`-Muster sind entfallen; `BB_MCP_READ_ONLY` mit Vorgabe `false` tritt an ihre Stelle |

---

## Anhang A: Feldumbenennungen, vollständig

Jede Umbenennung nennt den Originalnamen in der Parameterbeschreibung, und
`mapping/request.ts` übersetzt zurück. **Mehr Umbenennungen als diese gibt es nicht; alle
übrigen rund 300 Felder tragen den Namen der Spezifikation.** `coverage.test.ts` prüft das über
`apiNames` (2.1), auf beiden Stufen aus 4.4 Punkt 3.

**Ausdrücklich nicht umbenannt werden die Stapelbehälter von sieben der acht Stapelendpunkte**,
fünf verschiedene Namen: `receipts` (`/receipts/addBatch`, `/postings/add-batch/receipts`),
`transactions` (`/transactions/addBatch`, `/postings/add-batch/transactions`), `free_postings`
(`/postings/add-batch/free`), `debtors` (`/settings/add-batch/debtors`) und `creditors`
(`/settings/add-batch/creditors`). Sie sind bereits Objektlisten, und ein zweiter Name für
dasselbe wäre eine Umbenennung ohne Gewinn. Der einzige umbenannte Behälter ist
`transactions_to_receipts` zu `assignments` am achten Stapelendpunkt.

| Werkzeugfeld | API-Feld | Endpunkte | Grund |
| --- | --- | --- | --- |
| `payment_account_number` | `account` | `/receipts/add`, `/receipts/upload`, `/transactions/add`, `/transactions/get` | `account` erwartet eine Sachkontonummer, meint aber ein Zahlungskonto. Der Name sagt beides nicht (3.4) |
| `account_filter` | `account` | `/postings/get` | Dort ist es kein Konto, sondern eine kommagetrennte Filterliste mit Schlüsselwörtern (`all`, `all financial accounts`, `free booking`) |
| `postingaccount_filter` | `postingaccount` | `/postings/get` | Analog, ebenfalls eine Filterliste mit Schlüsselwörtern |
| `receipt_type` | `type` | `/receipts/add`, `/receipts/upload` | `type` ist in der Spezifikation **siebenfach** mit unterschiedlicher Bedeutung belegt (maschinell ausgezählt) |
| `invoice_type` | `type` | `/invoices/create`, `/invoices/create/e-invoice`, `/invoices/create/draft` | dito |
| `transaction_type` | `type` | `/transactions/add` | dito |
| `payment_account_type` | `type` | `/accounts/add` | dito; Werte `cash`, `bank/institution`, `other` |
| `positions` | `postingaccounts`, `postingtexts`, `vats`, `cost_locations`, `cost_locations_two`, `amounts` (6 Namen) | `/postings/add/receipt` | Objektorientierte Positionsliste statt paralleler Arrays, Längeninvariante konstruktiv erfüllt (4.8) |
| `positions` | dieselben sechs plus `oi_receipts_ids_by_customer` (7 Namen) | `/postings/add/transaction` | dito |
| `positions` je Stapelelement | innerhalb `ReceiptPostings`: `postingaccounts`, **`postingstexts`**, `vats`, `cost_locations`, `cost_locations_two`, `amounts` | `/postings/add-batch/receipts` | dito, aber **innerhalb** jedes Stapelelements; der Behälter `receipts` selbst wird **nicht** umbenannt. Die Schreibweise `postingstexts` ist der Spezifikationsfehler aus 0.5 |
| `positions` je Stapelelement | innerhalb `TransactionPostings`: dieselben sechs mit `postingtexts` plus `oi_receipts_ids_by_customer` | `/postings/add-batch/transactions` | dito; der Behälter `transactions` wird **nicht** umbenannt |
| `items` | `item_name`, `item_amount`, `item_unit`, `item_vat`, `item_single_price`, `item_description` (6 Namen) | `/invoices/create`, `/invoices/create/draft` | dito, für Rechnungspositionen |
| `items` | `item_name`, `item_amount`, `item_unit`, `item_tax_type`, `item_tax_amount`, `item_single_price`, `item_description` (7 Namen) | `/invoices/create/e-invoice` | dito; `item_tax_type` und `item_tax_amount` statt `item_vat` |
| `assignments` | `transactions_to_receipts` (genau **ein** Name) | `/transactions/assign-batch/receipt` | **Keine Umformung, reine Umbenennung.** Der Parameter ist laut Definition `TransactionsToReceipts` bereits eine Objektliste aus `receipt_id_by_customer` und `transaction_id_by_customer`; der Werkzeugname sagt nur deutlicher, was darin steht |
| `receipt_id_by_customer` (Pfadsegment) | – | `/receipts/get/…`, `/receipts/delete/…`, `/receipts/restore/…` | Der Identifikator fehlt in der Spezifikation ganz (4.6). `source: "path"`, leeres `apiNames`, **kein Body-Feld** |
| `transaction_id_by_customer` (Pfadsegment) | – | `/transactions/get/…` | dito |

`response_format` ist **kein** umbenanntes Feld, sondern ein rein serverseitiges Feld, das nie
gesendet wird (4.3, 7.4).

---

## Anhang B: Während dieser Arbeit gefundene Ungereimtheiten

Sie stammen nicht aus der Planungsaufgabe, gehören aber erfasst, damit sie nach Abschluss der
Arbeit verarbeitet werden können.

**In der Spezifikationsdatei:**

1. **32 Array-Parameter ohne Elementtyp** (`items` fehlt), darunter alle parallelen Arrays der
   Buchungs- und Rechnungsendpunkte. Ein generischer Generator kann daraus nichts Gültiges
   erzeugen.
2. **Der `order`-Parameter von `/receipts/get`** trägt ein Objektschema mit der wörtlichen
   Eigenschaft `field`. Das ist ein Platzhalter, kein Feldname. Die tatsächlich erlaubten
   Felder stehen nur in der HTML-Beschreibung.
3. **`PostingsFree.items` führt `amounts` in `required`, hat aber nur die Eigenschaft
   `amount`.** Der einzige Fall dieser Art in der gesamten Datei, geprüft über alle
   Definitionen.
4. **`ReceiptPostings` trägt `postingstexts`, `/postings/add/receipt` trägt `postingtexts`.**
   Zwei Schreibweisen für dasselbe Feld.
5. **Kein einziger Parameter trägt ein `enum`.** Alle Wertevorräte stehen ausschließlich im
   HTML-Fließtext der Beschreibungen.
6. **Das Währungsfeld kommt fünfmal vor und trägt drei einander widersprechende Vorräte:**
   drei Codes bei `/receipts/add`, „has to be EUR" bei `/receipts/upload`, 47 Codes bei
   `/transactions/add` sowie 48 Codes in `Receipt.currency` und `Transaction.currency`, den
   Elementen der beiden Stapelendpunkte. Auszählung in 0.5 Korrektur 2.
7. **`responses`-Schlüssel sind Zeichenketten der Form `"400 (5)"`** und damit keine gültigen
   Statuscodes im Sinne von Swagger 2.0.
8. **42 `*ErrorCode*`-Definitionen sind verwaist** und in keinem `responses`-Block
   referenziert.
9. **Behälter- und Elementdefinition unterscheiden sich nur durch ein `s`.**
   `ReceiptsPostings` ist das Array, `ReceiptPostings` das Element; ebenso
   `TransactionsPostings` gegen `TransactionPostings` und `TransactionsToReceipts` gegen
   `TransactionToReceipt`. Wer die falsche Definition liest, hält ein Objekt für ein Array oder
   umgekehrt. Genau dieser Unterschied entscheidet darüber, ob ein Endpunkt parallele Arrays
   erwartet (4.8).
10. **Parallele Arrays gibt es an genau fünf Pfaden, nicht an zehn.** Alle 32 Array-Parameter
    ohne `items` gehören zu `/postings/add/receipt`, `/postings/add/transaction`,
    `/invoices/create`, `/invoices/create/draft` und `/invoices/create/e-invoice`.
    `/postings/add/free` ist skalar, die vier Stapelendpunkte unterhalb von `/postings/` und
    `/transactions/assign-batch/receipt` sind Objektlisten. Die frühere Angabe „zehn Endpunkte"
    stammte aus einer Vermutung, nicht aus einer Auszählung.

**Live gemessen (0.3):**

11. **`/settings/get/postingaccounts` liefert `parent_name` als `null`**, wo die Spezifikation
   einen String führt. Jede Normalisierung muss `null` tragen können.
12. **`/accounts/get` liefert keinen Mandantennamen.** Der in `distribution.md` 14.2
    vorgesehene Bestätigungstext ist so nicht baubar.
13. **`/transactions/get` liefert in der Liste kein `account`-Feld**, obwohl der Einzelabruf
    eines hat. Wer aus der Liste das Zahlungskonto ablesen will, findet es dort nicht.
14. **`e_invoice_type` kommt als JSON-Zahl**, während fast alle anderen Felder der
    Belegantwort Strings sind.

**In den Dossiers:**

15. `tool-design.md` 9.3 und 11.8 widersprechen sich bei den Annotationen lesender Werkzeuge.
16. `tool-design.md` 11.1 verlangt 28 bis 34 Werkzeuge, was E1 aufhebt.
17. `toolchain.md` 9.1 nennt weiterhin den Namensraum `@init4`, E3 nennt `@dennismenken`.
18. `toolchain.md` 3.3 nennt `engines.node >=22.12.0`, was mit `undici@8.10.2` unverträglich
    ist (13.1).
19. `mcp-sdk-typescript.md` 10.3 nennt als `bin`-Namen `buchhaltungsbutler-mcp`, was mit dem
    `bin` des unter diesem Namen bereits veröffentlichten npm-Pakets kollidiert (S20).

**Zur Jurybewertung der Entwürfe:**

20. Die Feststellung der Jury, der Befund von Entwurf B zu `PostingsFree` sei erfunden, ist
    **nicht zutreffend**. Der Befund stimmt; `properties` und `required` liegen unter `.items`,
    nicht auf der obersten Ebene der Definition. Nachweis in 0.5, Korrektur 1. Entwurf B trägt
    an dieser Stelle keinen Substanzfehler.
21. Die Angabe von Entwurf A, es gebe 45 verwaiste Fehlercode-Definitionen, ist **falsch**; es
    sind 42 (718 minus 676 referenzierte). Die Jury hat das richtig gezählt.
22. Die Angabe von Entwurf B, es gebe einen Währungsvorrat aus 48 Codes, ist **im Kern
    richtig und nur zu weit gefasst**. Der Vorrat steht in `Receipt.currency` und
    `Transaction.currency`; falsch war allein, ihn als gemeinsamen Baustein über **alle**
    Endpunkte zu führen, weil `/receipts/add` drei Codes nennt und `/receipts/upload` EUR
    verlangt. Die frühere Fassung dieses Punktes und der Satz in 0.5 Korrektur 2, einen solchen
    Vorrat gebe es nicht, waren **falsch** und sind korrigiert (0.5, 4.5, S25).
23. Die Aussage von Entwurf C, `npx mcpb` falle auf ein vorhandenes fremdes Registry-Paket
    zurück, trifft am 2026-09-12 **nicht** zu: Der unscoped Name `mcpb` ist unbesetzt. Die
    daraus abgeleitete Regel bleibt trotzdem richtig; die Begründung ist in 13.5 korrigiert.

**Im Entwurfsstand dieses Plans, bei der Skeptikerprüfung gefunden und hier bereits behoben.**
Sie stehen nur, damit nachvollziehbar bleibt, was sich gegenüber dem Stand vor der Prüfung
geändert hat:

24. Der Typ `ToolEntry` benutzte `FieldSpec`, `ResponseContract`, `VerifySpec`, `DuplicateSpec`
    und `CrossCheckId`, ohne sie zu definieren, und kannte das in 4.6 und AP12a verlangte Feld
    `verified` nicht. Beides ist in 2.1 ergänzt.
25. Zwei Verweise auf die Feldumbenennungen zeigten auf **Anhang B** statt auf **Anhang A**
    (3.4 Maßnahme 2 und AP09). Korrigiert.
26. 2.1 sprach von „den drei Endpunkten ohne lesendes Gegenstück" und zählte anschließend vier
    auf (`/comments/add` plus drei Rechnungsendpunkte). Korrigiert auf vier.
27. Die Invalidierungstabelle in 7.8 führte `bb_payment_accounts_list`, während derselbe
    Abschnitt und S23 sagen, `/accounts/get` werde nie zwischengespeichert. Aufgelöst zugunsten
    des Satzes; die Tabellenzeile ist gestrichen.
28. Q2 des Entwurfsstandes (`date_from <= date_to`) war den Werkzeugen 50 und 51 zugeordnet,
    die überhaupt kein Datumsfeld führen, und fehlte an 53 und 54, wo beide Felder Pflicht
    sind. Korrigiert in 4.7.
29. Q8 des Entwurfsstandes verlangte einen Ausschluss gegen eine Sortierung, die
    `/transactions/get` nicht hat. Gestrichen und durch einen Pflichtsatz in der
    Parameterbeschreibung ersetzt (4.7).
30. Q1 des Entwurfsstandes verglich Positionsbeträge mit einem Beleg- oder Zahlungsbetrag, der
    an den betroffenen Endpunkten kein Argument ist. Gestrichen mit Begründung (4.7).
31. AP12c verlangte „die drei `order`-Werte" von `/postings/get`, wo die Spezifikation sieben
    nennt. Korrigiert, Werte ausgeschrieben.
32. `zod` war als direkte Abhängigkeit ausgeschlossen, obwohl eigener Code es an drei Stellen
    importiert. Unter `pnpm@10.34.3` ist das nicht auflösbar. Korrigiert in 13.2.
33. AP10 konnte ohne `src/server/instructions.ts` (AP14) nicht typprüfen, AP03 rief Generatoren
    späterer Pakete auf, und `package.json` gehörte AP01, während sechs spätere Pakete Einträge
    darin brauchten (mit dem Tokenizer aus Punkt 36 sind es inzwischen sieben). Alle drei
    Eigentumskonflikte sind in 11.2 aufgelöst.

**In der zweiten Skeptikerprüfung gefunden und hier bereits behoben.** Sie stehen aus demselben
Grund wie die Punkte 24 bis 33: damit nachvollziehbar bleibt, was sich geändert hat.

34. **`src/cache/store.ts` hatte keinen Eigentümer.** S23 entscheidet „Stammdatenspeicher wird
    gebaut", der Dateibaum führt die Datei, die Resource `bb://postingaccounts` (7.7) und die
    Auflösung sprechender Kontobezeichnungen (7.4) hängen daran, und AP12d setzt
    `invalidatesCache` — aber kein Arbeitspaket durfte die Datei anlegen. Zugeordnet an **AP09**
    samt `test/unit/cache-*.test.ts` und eigener Definition of Done (TTL, Invalidierung nach
    7.8, Negativprüfung für `/accounts/get`); AP14 hängt jetzt ausdrücklich auch an AP09.
35. **`src/cli.ts` gehörte exklusiv AP01, dem ersten Paket.** Zu dessen Laufzeit gibt es weder
    `src/index.ts` und `src/server/*` (AP10) noch `src/cli/run.ts` (AP15); ein Import darauf
    hätte `tsc --noEmit` und den Bau scheitern lassen, den AP01 grün verlangt. Kein späteres
    Paket durfte die Datei anfassen, also wäre der Serverstart nie verdrahtet worden und AP16
    unerfüllbar geblieben. Gelöst wie bei `src/server/instructions.ts`: **Platzhalter in AP01,
    Verdrahtung in AP15**; AP15 hängt zusätzlich an AP10, AP16 zusätzlich an AP15.
36. **Es gab kein Tokenizer-Paket.** AP14 verlangt eine Messung „mit einem echten Tokenizer",
    P11 und 8.4 bauen darauf auf, aber weder 13.2 noch 13.3 führten ein solches Paket, und AP01
    trägt alle Abhängigkeiten exklusiv ein. Aufgenommen: **`gpt-tokenizer@4.0.0`, MIT**, als
    `devDependency` (13.3, 13.9), von AP01 einzutragen. Zusätzlich entschieden: **`doctor` misst
    nicht zur Laufzeit** (das wäre eine vierte Laufzeitabhängigkeit und widerspräche 13.2),
    sondern rechnet mit der eingecheckten Konstanten `CHARS_PER_TOKEN`; **P11 zählt ab AP11 mit
    dem Tokenizer** und wartet auf keine Messung aus AP14.
37. **Das Größenbudget war nirgends beziffert**, und beide Verweise darauf zeigten ins Leere:
    der Dateibaum auf 9.7 (Vertragslauf) und AP16 auf 13.3 (Entwicklungsabhängigkeiten). Neuer
    Abschnitt **9.10** mit zwei Zahlen (**1 MiB** gepackt, **3 MiB** entpackt), Herleitung und
    Regel bei Überschreitung; beide Verweise korrigiert.
38. **Die zweite Deckungsstufe in 4.4 war nicht implementierbar.** Sie verglich gegen
    `.items.properties` der Behälterdefinition; maschinell geprüft trägt `.items` bei **sieben**
    der acht Fälle ausschließlich ein `$ref` auf die Elementdefinition, nur `PostingsFree` führt
    `properties` inline. Ergänzt: die Auflösungsregel, eine **zweispaltige** Zuordnungstabelle
    (Behälter und Element) und der Fehlschlag statt einer leeren Menge. P3 in 9.2 und AP11 sind
    nachgezogen. Anhang B Punkt 9 benennt die Falle; jetzt zieht auch 4.4 die Konsequenz.
39. **Zehn Quelldateien hatten keinen Test-Eigentümer.** AP10 baut `src/guards/*`,
    `src/server/*` und `src/index.ts`, führte aber keine einzige Testdatei; der
    Stammdatenspeicher ebenso wenig. Die Abdeckungsschwelle von 80 Prozent aus 9.5 wäre
    gerissen, ohne dass ein Paket sie hätte beheben dürfen. Ergänzt: `test/unit/guards-*.test.ts`
    und `test/unit/server-*.test.ts` bei AP10, `test/unit/cache-*.test.ts` bei AP09, dazu drei
    Zeilen in der Tabelle in 9.5 und ausformulierte Testpflichten.
40. **`BB_MCP_MAX_BATCH` war widersprüchlich definiert.** 6.2 nannte „`items`- und
    `positions`-Arrays", Q4 in 4.7 zählte aber nur die acht Stapelwerkzeuge auf, 4.8 verdrahtete
    `maxItems: 50` fest, und der Dateibaum band die Variable nur in `batch.ts`. Entschieden:
    **Die Variable gilt für Stapelarrays und Positionslisten.** Q4 nennt jetzt dreizehn
    Werkzeuge, 4.8 und der Dateibaum führen `min(50, BB_MCP_MAX_BATCH)`, 6.2 zählt die
    betroffenen Felder auf, und AP10 benennt, was Guard 5 auswertet. Der Preis ist dabei
    benannt statt verschwiegen: Bei Positionslisten ist die 50 **keine** dokumentierte
    API-Regel, sondern unsere eigene Grenze; die Folge steht als eigene Zeile in 14.2.
41. **4.10 sprach von „der echten Messung in AP16"**, während die Messung zu AP14 gehört und
    das Budget ab AP11 ohnehin gegen echte Token geprüft wird. Formulierung korrigiert.

**In der dritten Skeptikerprüfung gefunden und hier bereits behoben.** Sie stehen aus demselben
Grund wie die Punkte 24 bis 41.

42. **`src/registry/index.generated.ts` war zugleich exklusive Datei von AP04 und
    Abnahmebedingung der fünf gleichzeitig laufenden Registerpakete.** P12 verlangte, dass der
    Index sich mit dem Verzeichnis deckt, der Generator schreibt ihn aus dem Verzeichnisinhalt,
    und der CI-Schritt verlangte eine leere Differenz — also hätte jedes der fünf Pakete AP12a
    bis AP12e dieselbe Datei neu erzeugen und einchecken müssen. Das ist genau der geteilte
    Schreibzugriff, den die Vorbemerkung zu Abschnitt 11 ausschließt. Entschieden: **Die Datei
    wird nicht eingecheckt**, steht in `.gitignore` (AP01) und wird von `build`, `test` und
    `typecheck` über `pnpm generate` erzeugt; sie gehört keinem Paket. AP04 behält nur den
    Generator, P12 prüft den zur Testlaufzeit erzeugten Index, 4.2 begründet die Ausnahme,
    11.2 und 11.3 sind nachgezogen. Nebenbefund derselben Kette: `scripts/generate.ts` gehörte
    AP03, wurde aber ab AP01 von `build` und `test` aufgerufen — gelöst wie bei `src/cli.ts`
    mit einem Platzhalter in AP01, der mit Rückgabewert 0 endet.
43. **Q2 war drei Werkzeugen zugeordnet, an denen es nichts prüfen kann.** 4.7 nannte für
    „`limit` innerhalb des endpunktspezifischen Maximums" auch 32, 36 und 40, während 7.5 und
    AP12d für genau diese drei `settings`-Listen festlegen, dass **kein** `maximum` gesetzt
    wird. 9.5 verlangt zu jeder Querprüfung ein negatives Beispiel, das dort nicht
    konstruierbar ist. Q2 gilt jetzt für die vier Werkzeuge mit belegter Grenze (1, 9 mit 500;
    20, 46 mit 1000); 4.7, 9.5 und AP12d benennen den Ausschluss ausdrücklich.
44. **Die Klasse `transient` erfasste `/transactions/add` nicht.** 5.6 band Code 15 an „die
    Stapel- und Upload-Endpunkte"; maschinell geprüft führt ihn aber auch `/transactions/add`
    mit HTTP 403 und der Meldung `adding temporarily restricted`, und `grundlagen.md` 7.3
    nennt dieselben zehn Pfade. Nach dem alten Wortlaut hätte der Agent bei einer echten
    Drosselung einer einzelnen Zahlungsanlage gelesen, ein späterer Versuch helfe nicht. 5.6
    führt die zehn Pfade jetzt als Fußnote, AP08 verpflichtet die Handprüfung auf diese elf
    Paare, und 9.4 hat einen eigenen Golden-Fall für `/transactions/add`.
45. **Der Meldungstext zu Code 15 an `/receipts/get` war falsch zitiert** — allerdings in die
    Gegenrichtung, als die dritte Skeptikerprüfung annahm. Sie hielt `invalid sort field is
    specified` (die `responses`-`description`) für den Wortlaut und ersetzte damit
    `invalid sort field specified` (den `message`-`enum`). Nach der Quellenentscheidung in 5.6
    ist der **`enum`-Wortlaut** der richtige, und live kommt ohnehin ein dritter Text
    (`invalid field specified`, L6). **Beide Fassungen dieses Punktes waren zu eng gedacht:**
    Der eigentliche Fehler war nicht das Zitat, sondern dass eine Weiche überhaupt an einem
    Zeichenkettenvergleich hing. Vollständig aufgelöst in Punkt 49 und 50. Unverändert richtig
    bleibt die zweite Hälfte dieses Punktes: Der Golden-Fall in 9.4 führte den Code mit
    HTTP 403, die Spezifikation führt ihn dort mit HTTP **400**.
46. **Die `concise`-Listen in 7.4 waren teils Prosa statt Feldnamen** („Soll- und Habenkonto,
    Steuerschlüssel", „Kundennummer, Ort", „Code, Name"), obwohl `concise: string[]` exakte
    Feldnamen verlangt und keine der Registerprüfungen ihren Inhalt berührte. Fünf parallele
    Bearbeiter hätten raten müssen. Die vier Zeilen tragen jetzt die Namen aus den Dossiers mit
    Belegstelle, der einleitende Satz behauptet nicht mehr, alle Listen seien gemessen (belegt
    sind die vier Endpunkte aus 0.3), und die neue Prüfung **P13** rechnet `concise` gegen
    `responseContract.fields` auf. Fachlicher Nebenbefund: Soll- und Habenkonto heißen in der
    Antwort von `/postings/get` `debit_postingaccount_number` und
    `credit_postingaccount_number`; `postingaccount_debit` und `postingaccount_credit` sind
    **Eingabe**felder von `/postings/add/free` und kommen in keiner Antwort vor.

**In der Schlussabnahme gefunden und hier bereits behoben.** Sie stehen aus demselben Grund wie
die Punkte 24 bis 46. Die Punkte 47 und 48 sind neue Befunde **in der Spezifikationsdatei** und
gehören sachlich zur Liste am Anfang dieses Anhangs; sie stehen hier, damit die dortige
Nummerierung stabil bleibt.

47. **Der `enum` `["EUR"]` an `Receipt.currency` und `Transaction.currency` widerspricht dem
    Beschreibungstext derselben Eigenschaft**, der 48 Codes aufzählt, und bei `Transaction`
    zusätzlich dem Body-Parameter `currency` von `/transactions/add`, der 47 Codes aufzählt. Es
    sind die **einzigen beiden** Definitionseigenschaften der ganzen Datei mit einem `enum`
    (0.4). Behandelt wie das Platzhalterschema des `order`-Parameters: verworfen, mit
    Belegstelle im Registereintrag (4.5).
48. **`Receipt.currency` trägt wörtlich den Beschreibungstext von `Transaction.currency`.** Er
    beginnt mit „The transaction currency." und endet mit „An empty string is not considered a
    valid type." — in einer Definition, in der es weder um eine Zahlung noch um ein
    `type`-Feld geht. Die 48er-Liste an dieser Stelle ist damit keine eigenständige Aussage
    über Belege (0.5 Korrektur 2).
49. **Der Plan legte die Quelle des Feldes `message` im Fehlerkatalog nicht fest.** Die
    Spezifikation bietet zwei Texte je Paar, und sie weichen bei **179 von 786** Paaren
    voneinander ab. Entschieden: `properties.message.enum[0]` ist die Quelle,
    `responses[…].description` wird als `summary` mitgeführt. Alle Zitate im Plan sind
    nachgezogen (5.3, 5.6, 9.4, AP03, AP08); der Generator zählt die Abweichungen, und ein Test
    hält die Zahl fest.
50. **Eine Retry-Weiche hing an einem Zeichenkettenvergleich gegen einen Spezifikationstext.**
    Gemessen (L6) liefert `/receipts/get` zu Code 15 den Text `invalid field specified` und
    damit keine der beiden Quellen; der Vergleich hätte nie gegriffen, ohne dass es jemandem
    aufgefallen wäre. Entschieden: Klassifikation und Retry entscheiden über (`specPath`,
    `error_code`, HTTP-Status); der Wortlaut der Antwort wird zitiert, nie verglichen (5.3,
    5.6, 5.8, 9.4, AP08).
51. **„Code 7 trägt 32 verschiedene Bedeutungen" mischte zwei Grundmengen.** Über die 718
    Definitionsnamen sind es 32, über die 786 referenzierten Paare — die Grundmenge dieses
    Katalogs — sind es **28**. Korrigiert in 5.6.
52. **Der Plan band nur drei der fünf Währungsfelder**, und 0.5 Korrektur 2 behauptete
    zusätzlich, einen gemeinsamen Vorrat aus 48 Codes gebe es nicht. Beides war falsch.
    Ergänzt: die Auszählung aller fünf Felder (0.4, 0.5), die beiden Regeln R-A und R-B sowie
    eine verbindliche Festlegung je Feld (4.5), die Pflichten in AP12a und AP12b und die
    berichtigte Streitfrage S25.
53. **`docs/api/live-befunde-orchestrator.md` behauptet in Befund 1 einen Body-Parameter
    `id_by_customer`, den die Spezifikation nicht führt.** Maschinell geprüft führt
    `/receipts/get/id_by_customer` nur `api_key` und `get_file`, die drei übrigen nur
    `api_key`. Die Messungen des Befunds bleiben davon unberührt. In 4.6 richtiggestellt und
    als Nachziehzeile in Abschnitt 15 aufgenommen.
54. **Der Plan führte die vier Pfadsegment-Endpunkte als Vorlage, sagte aber nicht, womit
    Fehlerkatalog, Deckungstest und Audit-Zeile schlüsseln.** Der gebaute Pfad
    (`/receipts/get/4711`) steht in keiner Katalogtabelle und in keinem Generat; ohne
    Festlegung wäre jeder Fehler dieser vier Werkzeuge auf „Paar fehlt" gefallen und P1
    dauerhaft rot gewesen. Ergänzt: `path.specPath` im Typ, sechs statt vier Pfadregeln, die
    Nachschlageregel in 4.4, 5.6 und 1.4 sowie die zugehörigen Tests in 9.4 und 9.5.
55. **`currency` an `/transactions/add` war zum Pflichtfeld verschärft.** Die Spezifikation
    beschreibt `amount` dort als Betrag „in the account's currency", und kein Endpunkt gibt die
    Währung eines Zahlungskontos preis; der Agent hätte raten müssen, und eine falsch gebuchte
    Fremdwährungszahlung ist über die API nicht löschbar. Zurückgenommen; das Register enthält
    damit **keine** Verschärfung mehr (4.3, 4.5, 4.4 Punkt 5, AP12b).
56. **AP21 führte `npm publish` aus und legte das öffentliche Repository an — vor der
    Skeptikerphase AP22.** Damit lagen die beiden einzigen unumkehrbaren Schritte des Vorhabens
    vor der Prüfung, die sie hätte verhindern können. Entschieden: Veröffentlichung und
    Repository sind **nicht** Teil des Workflows; AP21 bereitet vor, schreibt die
    Veröffentlichungs-Checkliste und führt keinen veröffentlichenden Befehl aus (11.1, 11.2,
    11.3).
57. **AP21 hing nicht an AP17**, obwohl 9.7 den Vertragslauf zur Pflicht vor jeder
    Veröffentlichung erklärt. Kante ergänzt; zusätzlich verlangt `publish.yml` die Bestätigung
    des Laufs als Eingabe, weil er in der öffentlichen CI nicht laufen kann (9.1, 9.7, 11.1).
58. **AP19 verlangte Änderungen an Dateien, die AP04, AP11 und drei Registerpaketen gehören**,
    durfte aber jederzeit laufen. Aufgelöst: AP19 stellt nur fest, das neue **AP19b** zieht
    nach, hält die betroffenen Dateien exklusiv, läuft nach AP12a–e und vor AP22 und entfällt,
    wenn AP19 nichts belegt (3.3, 11.1, 11.2, 11.3, S6, 14.2).
59. **„`>=22.19.0` erfüllt `tsdown`" war falsch.** Die Range von `tsdown@0.23.0` lautet
    `^22.18.0 || ^24.11.0 || >=26.0.0` und schließt Node 23.x, 24.0 bis 24.10 und 25.x aus, die
    `>=22.19.0` alle einschließt. Getrennt nach Laufzeit und Bau; die CI-Matrix nennt jetzt
    `22.19.0` und `24.11.0` (13.1, AP01).
60. **Die Zahl der Clientadapter widersprach sich**: zwölf in AP15 und 9.10 gegen neun Dateien
    plus Sammeldatei im Dateibaum. Vereinheitlicht auf **neun eigene Adapter plus
    `print-only.ts`**, bedient von **zwölf Clientkürzeln** (8.3, 9.10, AP15).
61. **„kürzester Name 17 (`bb_debtors_search`)" war falsch.** Kürzester Name ist
    `bb_receipts_get` mit **15** Zeichen. Nachgerechnet über die Namensspalte von 3.8 und in
    3.9 korrigiert; dort ist zugleich vermerkt, dass der Namensausdruck allein 41 Zeichen
    zuließe und die Grenze 40 deshalb zusätzlich geprüft wird.

---

## Anhang C: Was jeder Arbeitspaket-Agent gelesen haben muss

Damit niemand den ganzen Plan lesen muss, um ein Paket zu bearbeiten:

| Wer | Pflichtlektüre |
| --- | --- |
| **alle** | 0 (Geltung und Befunde), 1 (Leitidee), 12 (Streitfragen), 13 (Versionen) **sowie `docs/api/live-befunde-orchestrator.md`** (gemessenes Verhalten; gleicher Rang wie 0.3) |
| AP01, AP21 | zusätzlich 2, 13 vollständig; **AP01 außerdem 4.2** (warum der Registerindex nicht eingecheckt wird und welche Skripte den Generator aufrufen) **und 13.1** (welche Node-Versionen in die CI-Matrix gehören); **AP21 außerdem 9.7** (Vertragslauf als Pflicht), **9.10** (Größenbudget), **13.5** (Verpackungswerkzeug) und **13.6** (Namensraum) |
| AP03 | zusätzlich 4.2, 5.6, 0.4 |
| AP04, AP11 | zusätzlich 2.1, 3, 9.2; **AP11 außerdem 4.4 Punkt 3** (Auflösung der `$ref` in der zweiten Deckungsstufe) **und 13.9** (Tokenizer für P11) |
| AP05, AP12a–e | zusätzlich 3, 4 vollständig, 7.2, 7.4, Anhang A |
| AP06, AP15 | zusätzlich 6, 8; **AP15 außerdem 13.7** (`bin`, `files`) und die Platzhalterregel in AP01 |
| AP07, AP08 | zusätzlich 5 vollständig |
| AP09 | zusätzlich 4.6, 4.8, 7 vollständig (**7.8 für den Stammdatenspeicher**), 6.2, Anhang A |
| AP10 | zusätzlich 1.4, **4.7** (Guard 4 und Q4), 5.3, **6.2** (Guard 5), 6.5, 6.6, 6.7 Punkt 1 (Zustandsblock der Platzhalterdatei) |
| AP13 | zusätzlich 6.2, 14.1 R10 |
| AP14 | zusätzlich 3.4, 3.7, 4.9, 4.10, 6.7, 7.7, **13.9** |
| AP19 | zusätzlich 4.6, 9.9, 14.2; **und ausdrücklich die Regel, dass dieses Paket keine Zeile Code ändert** |
| AP19b | zusätzlich 3.3, 4.6, S6, `docs/entwicklung/befund-schreibend.md` aus AP19 |
| AP16, AP17, AP18 | zusätzlich 9 vollständig |
| AP20 | zusätzlich 10, 15 |
| AP22 | den ganzen Plan, mit frischem Kontext |

---

**Ende des Umsetzungsplans.** Die drei Entwürfe unter
`docs/entwicklung/plan-entwurf-a.md`, `-b.md` und `-c.md` bleiben als Nachweis liegen und
werden nicht mehr gepflegt.
