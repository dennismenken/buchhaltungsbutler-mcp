# BuchhaltungsButler API, Grundlagen

Dieses Dokument ist das Nachschlagewerk für die Implementierung des inoffiziellen
MCP-Servers. Es beschreibt das Gesamtbild der API, die Authentifizierung, das
Antwortformat, die querschnittlichen Konventionen sowie die Wirkung und das Risiko
jedes einzelnen Endpunkts.

## Quellenlage und Abrufdatum

Alle Angaben wurden am **2026-09-12** erhoben.

| Kürzel | Quelle | Art |
| --- | --- | --- |
| SPEC | `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json` (Swagger 2.0, `info.version` = 1.9.1, heruntergeladen von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`) | Offizielle Maschinenbeschreibung |
| DOC | `https://app.buchhaltungsbutler.de/docs/api/v1/` | Offizielle Doku-Seite, statischer Textteil |
| HELP | `https://wissen.buchhaltungsbutler.de/hc/de/articles/11468075328797-Einrichtung-der-API-Schnittstelle` | Hilfeartikel des Anbieters |
| LIVE | Eigene Aufrufe gegen `https://webapp.buchhaltungsbutler.de/api/v1` am 2026-09-12 | Messung an der Produktivumgebung |

Hinweis zu LIVE: Es wurden ausschließlich lesende Endpunkte und bewusst fehlerhafte
Anfragen gegen lesende Endpunkte aufgerufen. Alle gezeigten Antwortausschnitte sind
**anonymisiert**, Beträge, Namen, Kontonummern und IDs wurden durch Platzhalter ersetzt.

Hinweis zu HELP: Der Artikel war über WebFetch nicht erreichbar (HTTP 403). Der Inhalt
wurde über einen JavaScript-rendernden Crawler abgerufen. Die Struktur (Fließtext mit
Screenshot-Verweisen) ist dadurch vollständig, die Screenshots selbst sind nicht Teil
der Auswertung.

---

## 1. Überblick

### 1.1 Was die API leistet

BuchhaltungsButler ist eine Buchhaltungsanwendung für kleine und mittlere Unternehmen
sowie deren Steuerberater. Die API v1 stellt 54 Endpunkte bereit, mit denen ein
externes System Belege, Zahlungen, Buchungssätze, Rechnungen, Stammdaten und
Auswertungen eines Mandanten lesen und schreiben kann. Sie ist als Integrations- und
Importschnittstelle konzipiert, nicht als vollständige Fernsteuerung der Oberfläche.

Laut HELP ist die API nach Bereichen gegliedert: Receipts (Belege hochladen und
abholen), Transactions (Zahlungen anlegen und abholen, Belege zu Zahlungen zuordnen),
Invoices (Rechnungen, Angebote und Gutschriften erzeugen, auch als Entwurf), Postings
(Buchungssätze anlegen und abrufen), Settings (Debitoren- und Kreditorenkonten),
Accounts (Basiskonten abfragen), Comments (Kommentare an Belege oder Zahlungen).
Die SPEC kennt zusätzlich die Bereiche Cost Locations (Kostenstellen) und Reports
(BWA, Summen- und Saldenliste, Kontenblatt), die HELP nicht aufführt.

### 1.2 Technische Grundform

Quelle: SPEC (`host`, `basePath`, `schemes`, `produces`), DOC, LIVE.

| Eigenschaft | Wert |
| --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` |
| HTTP-Methode | ausnahmslos `POST`, auch für reine Leseoperationen |
| Anfrage-Content-Type | `application/json` |
| Antwort-Content-Type | `application/json; charset=utf-8` |
| Transport | HTTPS, in LIVE per HTTP/2 beantwortet |
| Pflichtfeld in jedem Body | `api_key` (Mandantenauswahl) |

Alle 54 Pfade definieren ausschließlich die Operation `post`. Es gibt keinen einzigen
`GET`-, `PUT`- oder `DELETE`-Endpunkt. Die Semantik steckt vollständig im Pfadnamen.
Das ist für den MCP-Server relevant: Die HTTP-Methode taugt nicht als
Sicherheitsindikator, ob ein Aufruf schreibt. Nur der Pfad taugt dafür.

### 1.3 Das Datenmodell und wie die Objekte zusammenhängen

Ein Agent sollte sich das Modell so vorstellen:

**Receipt (Beleg)** ist ein Dokument mit Rechnungscharakter. Sein `type` ist eines von
`invoice inbound` (Eingangsrechnung), `invoice outbound` (Ausgangsrechnung),
`credit inbound` (Eingangsgutschrift nach Paragraph 14 UStG) oder `credit outbound`
(Ausgangsgutschrift). Ein Beleg trägt Datum, Gegenpartei, Rechnungsnummer, Betrag,
Währung und optional Umsatzsteuersatz, Leistungsdatum, Fälligkeitsdatum sowie eine
direkte Zuordnung zu einem Zahlungskonto oder einem Kreditor bzw. Debitor.
Belege werden entweder ohne Datei angelegt (`/receipts/add`) oder mit Datei
hochgeladen (`/receipts/upload`, danach OCR-Verarbeitung durch BuchhaltungsButler).

**Transaction (Zahlung)** ist eine Bewegung auf einem Zahlungskonto: Betrag positiv
für Eingang, negativ für Ausgang, dazu Buchungsdatum, Valutadatum, Zahlungspartner,
Verwendungszweck, Kontonummer bzw. IBAN und Währung.

**Zuordnung Beleg zu Zahlung** ist eine eigene, m:n-fähige Beziehung. Sie wird über
`/transactions/assign/receipt`, `/transactions/unassign/receipt` und
`/transactions/assign-batch/receipt` gepflegt und über
`/receipts/assigned-transactions/get` bzw. `/transactions/assigned-receipts/get`
ausgelesen. Die Existenz beider Leserichtungen belegt die m:n-Natur. Beim Anlegen
eines Belegs kann über `payment_reference` eine automatische Zuordnung angestoßen
werden, und `link_to_receipt_id_by_customer` verknüpft zwei Belege so, dass die
manuelle Zuordnung des einen den anderen mitnimmt.

**Posting (Buchungssatz)** ist die eigentliche buchhalterische Wirkung. Es gibt drei
Ausprägungen: Buchungen zu einem Beleg (`/postings/add/receipt`), Buchungen zu einer
Zahlung (`/postings/add/transaction`) und freie Buchungen ohne Bezugsobjekt
(`/postings/add/free`). Eine Buchung besteht aus Buchungskonto, Buchungstext,
Umsatzsteueroption, Betrag und optional bis zu zwei Kostenstellen. Weil ein Beleg oder
eine Zahlung auf mehrere Konten gesplittet werden kann, werden diese Felder beim
Anlegen als **parallele Arrays** übergeben (`postingaccounts`, `postingtexts`, `vats`,
`amounts`, `cost_locations`, `cost_locations_two`), nicht als Array von Objekten.

Buchungen haben einen Lebenszyklus: unbestätigt, bestätigt (`confirmed`), festgeschrieben
(`fixed`). Eine nicht festgeschriebene Buchung lässt sich per `unconfirm` wieder
entfernen. `/postings/cancel` verhält sich abhängig vom Status: nicht festgeschriebene
Buchungen werden gelöscht, festgeschriebene werden durch eine Stornobuchung ausgeglichen
(SPEC, Beschreibung von `/postings/cancel`).

**Invoice (Ausgangsrechnung)** ist der Gegenpol zum Beleg: BuchhaltungsButler erzeugt
das Dokument selbst aus Positionsdaten. Die Positionen werden ebenfalls als parallele
Arrays übergeben (`item_name`, `item_amount`, `item_unit`, `item_vat` bzw.
`item_tax_type`/`item_tax_amount` bei der E-Rechnung, `item_single_price`,
`item_description`). Es gibt drei Varianten: klassische Rechnung, E-Rechnung und Entwurf.

**Stammdaten** sind Basiskonten (`/accounts/*`, Zahlungskonten wie Bank oder Kasse mit
`postingaccount_number`), Buchungskonten (`/settings/*/postingaccount*`), Debitoren und
Kreditoren (`/settings/*/debtor*`, `/settings/*/creditor*`) sowie Kostenstellen
(`/cost-locations/*`). Buchungskonten, Debitoren und Kreditoren sind im selben Namensraum
der Buchungskontonummern angesiedelt: `/settings/get/postingaccounts` besitzt die Filter
`exclude_postingaccounts`, `exclude_accounts`, `exclude_creditors`, `exclude_debtors`,
was zeigt, dass alle vier Arten dort gemeinsam geliefert werden.

**Reports (Auswertungen)** sind BWA und Summen- und Saldenliste. Sie folgen einem
zweistufigen, asynchronen Muster: `/reports/create/...` stößt die Erzeugung an und liefert
eine `id_by_customer`, `/reports/get/...` holt das fertige Ergebnis ab. Ausnahme ist das
Kontenblatt `/reports/get/sums/ledger`, das laut SPEC-Beschreibung direkt erzeugt wird und
keinen vorherigen Create-Aufruf benötigt.

**Comments** hängen an genau einem Beleg oder genau einer Zahlung
(`receipt_id_by_customer` oder `transaction_id_by_customer`).

### 1.4 Identitäten: `id_by_customer`

Die API adressiert Objekte über `id_by_customer`, eine je Mandant und Objektart
fortlaufende Nummer. Sie ist keine globale ID. Der übliche Ablauf lautet: Liste über
`/receipts/get` bzw. `/transactions/get` holen, daraus `id_by_customer` entnehmen, dann
Detailabruf oder Zuordnung. Die SPEC weist in den Beschreibungen mehrerer Endpunkte
ausdrücklich auf diese Reihenfolge hin. In den Anfragen ist sie meist als `integer`
deklariert (SPEC, LIVE). Ein Client muss hier konvertieren.

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 0.3, Befund L3.** Der frühere Satz, `id_by_customer` werde in den
> Antworten **immer** als String geliefert, gilt so nicht. Gemessen am 2026-09-12: Bei
> `receipts` kommt sie als JSON-**String** (`"2"`), bei `transactions` als JSON-**Zahl**
> (`1590`). Die Asymmetrie ist also nicht einmal zwischen den Ressourcen einheitlich und muss je
> Feld und je Ressource behandelt werden. Einzelheiten in Abschnitt 4.5.

---

## 2. Authentifizierung im Detail

Quellen: DOC (Abschnitte "Authentication" und "Customer Selection"), HELP, LIVE.

### 2.1 Warum es drei Geheimnisse gibt

Die API trennt **wer ruft auf** von **für wen wird aufgerufen**.

| Wert | Ort | Rolle | Fachliche Bedeutung |
| --- | --- | --- | --- |
| API Client | HTTP Basic Auth, Benutzername | Identität der aufrufenden Anwendung | Wer bin ich als Programm |
| API Secret | HTTP Basic Auth, Passwort | Beweis dieser Identität | Woher weiß der Server, dass ich es bin |
| api_key | JSON-Body, Feld `api_key` | Auswahl des Mandanten | Wessen Buchhaltung bearbeite ich gerade |

Client und Secret gehören zusammen und bilden ein klassisches Anmeldepaar. Der `api_key`
ist kein zweiter Anmeldefaktor, sondern ein Adressierungsmerkmal. DOC formuliert es als
"Customer Selection": das Zielkonto wird über das Formularfeld `api_key` bestimmt.

Diese Trennung ergibt Sinn, sobald eine Anwendung mehrere Mandanten betreut, etwa eine
Steuerkanzlei oder ein Partnerdienst. Ein Client-Secret-Paar bleibt konstant, der
`api_key` wechselt pro Mandant. Ob ein Client-Secret-Paar in der Praxis auf mehrere
`api_key`-Werte zugreifen darf, hängt von den serverseitigen Berechtigungen ab: Fehlercode
4 lautet wörtlich `customer not found or invalid api client for customer or insufficient
privileges` (SPEC, `Request_ErrorCode4`). Damit ist belegt, dass der Server die Kombination
aus Client und Mandant prüft. Wie diese Zuordnung im Konto verwaltet wird, ist in keiner
der drei Quellen beschrieben und **nicht verifiziert**.

Der Hilfeartikel weist auf einen Sonderfall hin: Wer sich mit einem in BuchhaltungsButler
gelisteten, autorisierten Partnerprogramm verbinden möchte, benötigt **keine**
API-Zugangsdaten, sondern aktiviert den Partnerdienst in den Einstellungen und hinterlegt
dort nur den angezeigten **API Key** beim Partnerdienst. Für einen eigenen MCP-Server ist
dieser Weg nicht anwendbar, es werden alle drei Werte gebraucht.

### 2.2 Aufbau des Authorization-Headers

DOC beschreibt HTTP Basic Auth nach RFC 2617 mit dem Wert `<Api Client>:<Api Secret>`.
Praktisch heißt das: Base64 über `API_CLIENT:API_SECRET`, vorangestellt `Basic `.
Jede gängige HTTP-Bibliothek erledigt das. Mit curl:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/accounts/get" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"api_key":"IHR_API_KEY"}'
```

Die Werte oben sind Platzhalter. Zugangsdaten gehören in Umgebungsvariablen oder einen
Secret-Store, niemals in Quelltext, Logs oder Dokumentation.

### 2.3 Schritt für Schritt: die drei Werte im Konto beschaffen

Quelle: HELP, Abschnitt "API aktivieren", abgerufen 2026-09-12.

1. Im BuchhaltungsButler-Konto anmelden.
2. Zu **Einstellungen** navigieren.
3. Den Bereich **Schnittstellen und API-Zugang** öffnen.
4. Die API dort **aktivieren**. Vor der Aktivierung existieren die Zugangsdaten nicht.
5. Nach der Aktivierung werden an derselben Stelle **API Client**, **API Secret** und
   **API Key** angezeigt. HELP wörtlich: "Nachdem Sie die API aktiviert haben, finden Sie
   an derselben Stelle Ihren API Client, Ihr API Secret und Ihren API Key."
6. Die drei Werte sicher übernehmen. DOC weist ausdrücklich darauf hin, dass Client und
   Secret vertraulich zu behandeln und nicht an Dritte weiterzugeben sind.

**Widerspruch zwischen den Quellen:** HELP verortet alle drei Werte unter
Einstellungen, Schnittstellen und API-Zugang. DOC schreibt dagegen, der `api_key` finde
sich "in customers company data settings if customer has registered to api access",
also in den Firmendaten-Einstellungen. Möglich ist, dass die Oberfläche den Wert an
beiden Stellen zeigt oder dass DOC einen älteren Stand beschreibt. **Nicht verifiziert**,
da hierfür ein Login in die Weboberfläche nötig wäre, der nicht Teil dieser Recherche war.
Für die README sollte die HELP-Formulierung als primärer Weg genannt und die Firmendaten
als Alternative erwähnt werden.

**Nicht dokumentiert und damit nicht verifiziert:** ob die API-Aktivierung an einen
bestimmten Tarif gebunden ist, welche Benutzerrolle sie vornehmen darf, ob sich Secrets
rotieren lassen und ob mehrere Client-Secret-Paare pro Konto existieren können. Keine der
drei Quellen sagt dazu etwas.

### 2.4 Fehlerbilder der Authentifizierung

| HTTP | error_code | message (SPEC) | Typische Ursache |
| --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Client oder Secret falsch, Basic-Auth-Header fehlt |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch, oder der Client darf diesen Mandanten nicht bedienen |
| 403 | 11 | `customer has no active status` | Mandantenkonto inaktiv, etwa gekündigt oder gesperrt |

Diese drei Antworten sind bei **allen 54** Endpunkten definiert (SPEC: `401 (3)`,
`401 (4)` und `403 (11)` kommen je 54-mal vor). Ein Client sollte sie zentral behandeln
und deutlich von fachlichen Validierungsfehlern unterscheiden: 3 und 4 sind
Konfigurationsfehler, ein Retry ist sinnlos.

---

## 3. Rate Limiting

### 3.1 Das dokumentierte Limit

DOC, Abschnitt "API limits", wörtlich: "It is only allowed to make a maximum of 100
requests per customer per minute to the API."

Das Limit gilt also **pro Mandant**, nicht pro API Client. Betreut eine Anwendung mehrere
Mandanten, hat jeder Mandant sein eigenes Kontingent. Umgekehrt teilen sich mehrere
Anwendungen, die denselben Mandanten bedienen, ein Kontingent. Für den MCP-Server heißt
das: Das Kontingent ist eine geteilte Ressource, der Server darf es nicht allein
verplanen.

### 3.2 Zusätzliche, engere Limits einzelner Endpunkte

Quelle: SPEC, Endpunktbeschreibungen. Diese Limits stehen neben dem Gesamtlimit.

| Endpunkt | Zusätzliche Beschränkung |
| --- | --- |
| `/receipts/upload` | "max 10 requests per minute" |
| `/receipts/addBatch` | "a request is allowed only every 5 seconds" |
| `/transactions/addBatch` | "a request is allowed only every 5 seconds" |
| `/postings/get` | maximal 1000 Buchungen pro Anfrage |
| `/cost-locations/get` | maximal 1000 Kostenstellen pro Anfrage |

Zusätzlich existiert ein mengenbezogener Schutz: Fehlercode 15 mit HTTP 403 und der
Meldung `adding temporarily restricted` ist bei zehn schreibenden Endpunkten definiert
(`/receipts/addBatch`, `/receipts/upload`, `/transactions/add`, `/transactions/addBatch`,
`/transactions/assign-batch/receipt`, `/postings/add-batch/receipts`,
`/postings/add-batch/transactions`, `/postings/add-batch/free`,
`/settings/add-batch/debtors`, `/settings/add-batch/creditors`). Die genaue Auslösebedingung
ist in der SPEC nicht beschrieben und damit **nicht verifiziert**. Ein Client muss diesen
Code als temporäre Drosselung behandeln und mit Wartezeit erneut versuchen.

Ebenfalls mengenbezogen, aber inhaltlich anders: HTTP 403 mit Fehlercode 12 bei
`/receipts/upload` (`customer has reached the upload limit`) und Fehlercode 33 bei
`/invoices/create` und `/invoices/create/e-invoice` (ebenfalls `customer has reached the
upload limit`). Das ist ein Tarif- oder Kontingentlimit, kein Rate Limit im engeren Sinn.
Ein Retry hilft hier nicht.

### 3.3 Live-Befund: es gibt keine Rate-Limit-Header

Geprüft am 2026-09-12 mit `curl -i` gegen `/accounts/get`. Die Antwort trug exakt
folgende Header:

```http
HTTP/2 200
date: <RFC-1123-Zeitstempel>
content-type: application/json; charset=utf-8
set-cookie: AWSALB=<Wert>; Expires=<Datum>; Path=/
set-cookie: AWSALBCORS=<Wert>; Expires=<Datum>; Path=/; SameSite=None; Secure
server: nginx
expires: Thu, 19 Nov 1981 08:52:00 GMT
cache-control: no-store, no-cache, must-revalidate
pragma: no-cache
set-cookie: bbutler=<Sitzungs-ID>; path=/; secure; HttpOnly; SameSite=Lax
strict-transport-security: max-age=63072000; includeSubDomains
```

Die Cookie-Werte sind hier anonymisiert. Die weiteren geprüften Antworten
(`/receipts/get` mit gültigen und mit ungültigen Parametern) trugen dieselbe Headermenge,
abgesehen von den wechselnden Cookie- und Datumswerten.

Daraus folgen drei belegte Aussagen:

1. **Es gibt keinerlei Rate-Limit-Header.** Kein `X-RateLimit-Limit`, kein
   `X-RateLimit-Remaining`, kein `X-RateLimit-Reset`, kein `Retry-After`. Ein Client kann
   sein verbleibendes Kontingent nicht aus der Antwort ablesen, er muss selbst zählen.
2. Die Antwort setzt Sitzungscookies (`bbutler`) und Load-Balancer-Cookies (`AWSALB`,
   `AWSALBCORS`). Ein API-Client sollte diese Cookies **nicht** persistieren. Sie sind für
   die Zustandslosigkeit der API nicht nötig, und eine ungewollt geteilte Sitzung über
   mehrere Mandanten hinweg wäre ein Risiko.
3. `expires: Thu, 19 Nov 1981` zusammen mit `cache-control: no-store, no-cache,
   must-revalidate` und `pragma: no-cache` ist die typische Signatur einer
   PHP-Anwendung mit `session_start()`. Daraus lässt sich keine belastbare Aussage über
   die Serverimplementierung ableiten, es ist lediglich ein Indiz und **nicht verifiziert**.

**Nicht verifiziert:** Welchen HTTP-Status und welchen `error_code` der Server liefert,
wenn das Limit von 100 Anfragen pro Minute tatsächlich überschritten wird. Das wurde
bewusst nicht getestet, weil ein absichtliches Reißen des Limits die Produktivbuchhaltung
des Nutzers für andere Zugriffe blockiert hätte. Die SPEC definiert für diesen Fall bei
keinem Endpunkt eine Antwort, insbesondere kommt HTTP 429 in der gesamten Spezifikation
nicht vor. Eine Implementierung sollte deshalb defensiv sein und auf 403 mit Fehlercode 15,
auf 429 und auf 5xx gleichermaßen vorbereitet sein.

### 3.4 Empfehlung für den MCP-Server

Ein clientseitiger Token-Bucket pro `api_key` mit spürbarem Sicherheitsabstand, etwa
60 bis 80 Anfragen pro Minute statt 100. Dazu ein eigener, strengerer Bucket für
`/receipts/upload` (10 pro Minute) und eine Mindestpause von 5 Sekunden zwischen
aufeinanderfolgenden `addBatch`-Aufrufen. Exponentielles Zurückweichen bei 403/15, 5xx
und 504. Die Empfehlung ist eine Schlussfolgerung aus den dokumentierten Limits, keine
Vorgabe des Anbieters.

---

## 4. Antwortformat

Quellen: SPEC (`definitions`), LIVE.

### 4.1 Erfolgsumschlag

```json
{
  "success": true,
  "message": "",
  "rows": 2,
  "data": [ { "...": "..." } ]
}
```

| Feld | Typ | Bedeutung | Belegt durch |
| --- | --- | --- | --- |
| `success` | boolean | bei Erfolg immer `true` | SPEC, LIVE |
| `message` | string | bei Erfolg leerer String, in der SPEC als "blank" beschrieben | SPEC, LIVE |
| `rows` | integer | Anzahl der **in dieser Antwort gelieferten** Zeilen | SPEC ("Number of returned rows"), LIVE |
| `data` | array | die Nutzdaten, ein Array von Objekten | SPEC, LIVE |

Entscheidend und live nachgewiesen: `rows` ist die Anzahl der zurückgegebenen Zeilen,
**nicht** die Gesamtzahl der Treffer. Bei `limit=2` lieferte `/receipts/get` `rows=2`,
bei `offset=999999` lieferte derselbe Aufruf `rows=0` und `data=[]`. Es gibt kein Feld
für die Gesamtzahl. Siehe Abschnitt 6.

Nicht jeder Erfolgsumschlag hat alle vier Felder. Reine Aktionsendpunkte liefern nur
`success` und `message` (Beispiel aus SPEC: `PostingsReservationsDelete_Success` besitzt
ausschließlich diese beiden Felder). Ein Client darf `rows` und `data` daher nicht
bedingungslos erwarten.

Die Reihenfolge der Felder ist nicht stabil: `ReceiptsGet_Success` listet
`success, message, rows, data`, `AccountsGet_Success` listet `success, rows, message,
data`. JSON-Objekte sind ungeordnet, das ist folgenlos, zeigt aber, dass die Spezifikation
von Hand gepflegt wird.

### 4.2 Fehlerumschlag

```json
{
  "success": false,
  "error_code": 5,
  "message": "invalid list_direction specified"
}
```

Live verifiziert: Ein Aufruf von `/receipts/get` ohne das Pflichtfeld `list_direction`
lieferte HTTP 400 und exakt diesen Body. Der Fehlerumschlag enthält **kein** `rows` und
**kein** `data`.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | im Fehlerfall immer `false` |
| `error_code` | integer | numerischer Fehlercode, siehe Warnung unten |
| `message` | string | englischer Klartext, nicht lokalisiert |

**Zentrale Warnung: `error_code` ist nicht global eindeutig.** Derselbe Code bedeutet je
nach Endpunkt etwas völlig anderes. Auswertung der SPEC über alle Definitionen:
Code 7 hat 32 verschiedene Meldungstexte, Code 6 hat 29, Code 5 hat 21, Code 9 und 8
haben je 25. Beispiel: Bei `/receipts/get` heißt Code 7 `invalid date_from specified`,
bei `PostingsReservationsGet` heißt Code 7 `invalid limit specified`. Ein Client darf
`error_code` daher **niemals** ohne den zugehörigen Endpunkt interpretieren. Der Schlüssel
für eine Fehlertabelle ist das Paar (Pfad, error_code).

Ausnahme sind die wenigen Codes, die die SPEC in den generischen `Request_*`-Definitionen
führt. Diese sind endpunktübergreifend konsistent:

| error_code | message | Typischer HTTP-Status |
| --- | --- | --- |
| 0 | `error while processing the request` | 500 |
| 1 | `Api method calls require HTTP requests` | 400 |
| 2 | `Api method calls require POST requests` | nicht in `responses` referenziert |
| 3 | `API credentials unknown or invalid` | 401 |
| 4 | `customer not found or invalid api client for customer or insufficient privileges` | 401 |
| 10 | `receipt could not be removed from transaction, because of a confirmed posting.` | nicht in `responses` referenziert |
| 11 | `customer has no active status` | 403 |
| 15 | `adding temporarily restricted` | 403 |
| 23 | `no post and files content received or declined` | 400 |
| 30 | `a timeout occurred while processing the request` | 504 |

Vorsicht bei 10 und 15: Die Codes 10 und 15 tragen in den endpunktspezifischen
Definitionen andere Bedeutungen (10 steht dort meist für `invalid limit specified`).
Die `Request_*`-Variante von Code 10 wird in keiner `responses`-Sektion referenziert, ist
also entweder veraltet oder nur informativ.

### 4.3 Vorkommende HTTP-Statuscodes

Auszählung über alle `responses`-Schlüssel der SPEC:

| Status | Häufigkeit | Bedeutung |
| --- | --- | --- |
| 200 | 54 | Erfolg, einmal je Endpunkt |
| 400 | 501 | Validierungsfehler des Bodys |
| 401 | 108 | Authentifizierung, Codes 3 und 4, je 54 |
| 403 | 67 | Kontostatus (11), Drosselung (15), Kontingent (12, 33) |
| 422 | 2 | nur `/receipts/upload`: Beleg nicht verarbeitbar (31), OCR gescheitert (32) |
| 500 | 54 | interner Fehler, Code 0, einmal je Endpunkt |
| 504 | 54 | Timeout, Code 30, einmal je Endpunkt |

HTTP 429 kommt in der Spezifikation nicht vor. Ebensowenig 3xx.

Die Schlüssel in der SPEC sind keine reinen Statuscodes, sondern Zeichenketten der Form
`"400 (5)"`, also Status plus Fehlercode in Klammern. Das ist Swagger-seitig ungültig, aber
fachlich informationstragend: Es dokumentiert die Zuordnung von Fehlercode zu HTTP-Status.
Ein Generator muss diese Schlüssel parsen, nicht als Zahl lesen.

### 4.4 Besonderheiten

`/postings/reservations/get`, ein Pfad, der nur in den Definitionen vorkommt, lieferte
live HTTP 404 mit `content-type: text/html`. Das heißt: Bei unbekannten Pfaden antwortet
der Server **nicht** im JSON-Umschlag, sondern mit einer HTML-Fehlerseite. Ein Client muss
den Content-Type prüfen, bevor er die Antwort als JSON parst, sonst wirft er an dieser
Stelle einen schwer deutbaren Parserfehler.

### 4.5 Antwortfelder der Belege und Zahlungen

> **Ergänzt am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 0.3, Befunde L2 und L3.** Dieser Abschnitt hält eine Messung fest, die
> im übrigen Dossier fehlte und für jede Implementierung tragend ist.

**Listen- und Einzelabruf liefern verschiedene Feldnamen und verschiedene Feldmengen.** Gemessen
am 2026-09-12:

| Sachverhalt | `/receipts/get` (Liste, 16 Felder) | `/receipts/get/<wert>` (Einzel, 23 Felder) |
| --- | --- | --- |
| Leistungsdatum | `delivery_date` | `date_delivery` |
| Fälligkeit | `due_date` | `date_payment_due` |
| Umschlag | `success`, `message`, `rows`, `data` (Array) | `success`, `message`, `data` (**Objekt**, **kein** `rows`) |

Nur in der Liste: `delivery_date`, `date_uploaded`, `due_date`. Nur im Einzelabruf:
`amount_original`, `currency`, `currency_original`, `exchangerate`, `vat`, `e_invoice_type`,
`list_direction`, `payment_reference`, `date_delivery`, `date_payment_due`.

Bei den Zahlungen ist der Unterschied größer:

| Endpunkt | gelieferte Felder |
| --- | --- |
| `/transactions/get` (Liste, 6 Felder) | `id_by_customer`, `to_from`, `amount`, `booking_date`, `value_date`, `purpose` |
| `/transactions/get/<wert>` (Einzel, 13 Felder) | `id_by_customer`, `account`, `to_from`, `booking_date`, `value_date`, `amount`, `currency`, `account_number`, `bank_code`, `bank_name`, `purpose`, `type`, `booking_text` |

**Die Zahlungsliste liefert kein `account`.** Wer aus ihr das Zahlungskonto ablesen will, findet
es dort nicht.

**Die Typen sind zwischen den Ressourcen nicht einheitlich:**

| Feld | `/receipts/*` | `/transactions/*` |
| --- | --- | --- |
| `id_by_customer` | JSON-**String** | JSON-**Zahl** |
| `account` | JSON-**String** (Liste) | JSON-**Zahl** (Einzelabruf) |

Nicht gesetzte Felder kommen durchgehend als JSON-`null`, nie als leerer String. `amount` ist
durchgehend ein String mit Punkt und zwei Nachkommastellen, `deleted` der String `"0"`, `vat`
ein String, `e_invoice_type` dagegen eine Zahl.

**Zwei Folgerungen, die keine Meinung sind, sondern aus der Messung folgen:**

1. Ein Antwortvertrag gilt **je Endpunkt**, nicht je Fachobjekt. Ein gemeinsamer Belegtyp über
   Liste und Einzelabruf erzeugt eine Fälligkeit, die im Einzelabruf immer leer aussieht.
2. Eine Typumwandlung wird **je Feld und je Ressource** entschieden, nicht global.

---

## 5. Querschnittliche Parameterkonventionen

Quelle: SPEC (alle 371 Parameter über 54 Endpunkte), ergänzt durch LIVE.

### 5.1 Die Struktur der Parameterliste in der Spezifikation

Alle 371 Parameter tragen `"in": "body"`. Es gibt keine Query-, Path-, Header- oder
FormData-Parameter. 362 davon tragen ein eigenes `type`-Feld, obwohl Swagger 2.0 für
Body-Parameter ein `schema` verlangt. Neun Parameter tragen stattdessen ein `schema`:
das `order`-Objekt bei `/receipts/get` sowie die acht Batch-Arrays, die per `$ref` auf
eine Definition zeigen. Kein Parameter trägt beides.

Fachlich sind alle Body-Parameter eines Endpunkts Felder **eines** JSON-Objekts. Die Liste
ist also kein Alternativenkatalog, sondern eine flache Feldliste. Generatoren dürfen die
SPEC hier nicht wörtlich nehmen.

### 5.2 limit und offset

| Endpunkt | `limit` Default | `limit` Maximum | `offset` Default |
| --- | --- | --- | --- |
| `/receipts/get` | 500 | 500 | 0 |
| `/transactions/get` | 500 | 500 | 0 |
| `/postings/get` | nicht angegeben | 1000 | nicht angegeben |
| `/cost-locations/get` | nicht angegeben | 1000 | nicht angegeben |
| `/settings/get/debtors` | 25 | nicht angegeben | 0 |
| `/settings/get/creditors` | 25 | nicht angegeben | 0 |
| `/settings/get/postingaccounts` | 1000 | nicht angegeben | 0 |

Alle anderen Endpunkte kennen weder `limit` noch `offset`. Insbesondere
`/accounts/get` liefert immer alle Datensätze.

Die Defaults von 25 bei Debitoren und Kreditoren sind eine echte Stolperfalle: Wer dort
ohne `limit` abfragt, bekommt kommentarlos nur 25 Zeilen und hält das leicht für die
Gesamtmenge.

**Live verifiziert:** Ein `limit` oberhalb des Maximums wird **nicht** stillschweigend
gekappt. `/receipts/get` mit `limit=501` antwortete mit HTTP 400 und
`{"success":false,"error_code":10,"message":"invalid limit specified"}`. Ein Client muss
also selbst auf das Maximum begrenzen.

Die Maxima für `/settings/get/debtors`, `/settings/get/creditors` und
`/settings/get/postingaccounts` sind in der SPEC nicht genannt und wurden nicht getestet,
also **nicht verifiziert**. Sicher ist nur, dass `/settings/get/postingaccounts` mit
Default 1000 arbeitet, ein Maximum von mindestens 1000 ist damit plausibel, aber eine
Annahme.

### 5.3 Sortierung: drei unterschiedliche order-Formen

Nur drei Endpunkte kennen überhaupt eine Sortierung, und alle drei verwenden eine andere
Syntax.

**`/receipts/get`: Objekt aus Feld und Richtung.**
Erlaubte Felder laut Beschreibung: `date`, `amount`, `invoicenumber` (in der Antwort
`invoice_number`), `invoicingparty` (in der Antwort `counterparty`). Erlaubte Werte
`ASC` und `DESC`. Mehrere Kriterien sind möglich.

```json
{"order": {"date": "ASC", "amount": "DESC"}}
```

Das `schema` in der SPEC beschreibt dieses Objekt falsch: Es deklariert eine Eigenschaft
mit dem wörtlichen Namen `field`, deren Wert `ASC` oder `DESC` sein darf, und macht sie
zum Pflichtfeld. Gemeint ist offensichtlich ein Objekt mit beliebigen Feldnamen als
Schlüsseln, wie die Beispiele in der Beschreibung zeigen. Ein Generator, der dem Schema
folgt, erzeugt hier falschen Code.

**`/postings/get`: einzelner String.**
Erlaubte Werte: `default`, `date ASC`, `date DESC`, `date_last_action ASC`,
`date_last_action DESC`, `id_by_customer ASC`, `id_by_customer DESC`. Die Beschreibung
weist ausdrücklich darauf hin, dass die Validierung **case sensitive** ist. Standard ist
aufsteigend nach `date` als erstem und `date_last_action` als zweitem Kriterium.

**`/settings/get/postingaccounts`: String aus Feld und Richtung.**
Erlaubte Kombinationen: `postingaccount_number ASC|DESC`, `name ASC|DESC`,
`type ASC|DESC`.

### 5.4 Datumsformate

| Format | Verwendung | Beispiel |
| --- | --- | --- |
| `YYYY-MM-DD` | Belegdatum, Leistungsdatum, Fälligkeit, Filtergrenzen, Berichtszeiträume | `2017-04-26` |
| `YYYY-MM-DD HH:MM:SS` | `date_since_last_modified` bei `/receipts/get` und `/transactions/get` | `2017-04-26 13:45:00` |
| `YYYY-MM-DD HH:II:SS` | `booking_date` und `value_date` beim Anlegen einer Zahlung | `2017-04-26 00:00:00` |

`HH:II:SS` ist PHP-Notation, `II` steht für Minuten. Fachlich identisch zu `HH:MM:SS`.
Die SPEC benutzt beide Schreibweisen, das ist eine reine Inkonsistenz der Dokumentation.

Bei `date_since_last_modified` gilt laut SPEC: Wird nur `YYYY-MM-DD` angegeben, wird die
Uhrzeit auf `23:59:59` gesetzt. Das ist kontraintuitiv, weil damit ein Tagesdatum das
**Ende** des Tages meint. Wer inkrementell synchronisiert und nur das Datum übergibt,
verliert alle Änderungen dieses Tages.

Die Filter `date_from` und `date_to` sind laut Beschreibung **einschließlich** der
Grenzwerte ("including and after", "including and before"). Ausnahme sind
`id_by_customer_from` und `id_by_customer_to` bei `/transactions/get`, die ausdrücklich
**exklusiv** sind: "The transaction with the given value will NOT be returned!" Diese
Asymmetrie ist eine klassische Fehlerquelle bei der Paginierung über IDs.

**Zeitzonen sind in keiner Quelle dokumentiert.** Weder SPEC noch DOC noch HELP nennen
eine Zeitzone oder einen UTC-Offset, und kein Datumsformat enthält Zonenangaben. Für einen
deutschen Buchhaltungsdienst ist Europe/Berlin die naheliegende Annahme, sie ist aber
**nicht verifiziert**. Der MCP-Server sollte Datumswerte durchreichen, nicht selbst
konvertieren, und diese Unsicherheit in den Werkzeugbeschreibungen benennen.

### 5.5 Betragsformate und Dezimaltrennzeichen

Es gibt eine Asymmetrie zwischen Eingabe und Ausgabe.

**Eingabe:** Beträge sind in der SPEC als `"type": "number", "format": "float"`
deklariert, also echte JSON-Zahlen. Beispiele der SPEC: `123.99`, `-12.30`, `19.00`.
Das Dezimaltrennzeichen ist der **Punkt**, ein Tausendertrennzeichen gibt es nicht.
Betroffen sind `amount` und `vat_rate` bei `/receipts/add` und `/receipts/upload` sowie
`amount` bei `/transactions/add`.

**Ausgabe:** Live verifiziert liefert `/receipts/get` `amount`, `amount_paid` und
`amount_paid_fixed` als **Strings** im Format `"123.99"`, also mit exakt zwei
Nachkommastellen und Punkt als Trennzeichen. Auch die SPEC führt `amount` in den
Success-Definitionen als `"type": "string"` mit Beispiel `"123.99"`.

Ein Client muss also beim Schreiben eine Zahl senden und beim Lesen einen String parsen.
Für Geldbeträge empfiehlt sich clientseitig eine Dezimalbibliothek oder
Ganzzahlarithmetik in Cent, keine Gleitkommazahl. Dass die API selbst `float` verlangt,
ist eine Schwäche der Schnittstelle, an der der Client nichts ändern kann.

Vorzeichenkonvention: Bei Zahlungen ist der Betrag positiv für Eingänge und negativ für
Ausgänge. Bei Belegen kann ein negativer Betrag eine Rückabwicklung ausdrücken. `0.00`
ist weder als Beleg- noch als Zahlungsbetrag gültig (SPEC, ausdrücklich).

### 5.6 Währungen

Die SPEC nennt in `Receipt.currency` und `Transaction.currency` dieselbe Liste
unterstützter Währungen:

```text
AED, AUD, BGN, BRL, CAD, CHF, CNY, COP, CYP, CZK, DKK, EUR, GBP, HKD, HRK, HUF,
IDR, ILS, INR, ISK, JPY, KRW, LTL, LVL, MTL, MXN, MYR, NOK, NZD, PEN, PHP, PLN,
QAR, ROL, RON, RSD, RUB, SEK, SGD, SIT, SKK, THB, TRL, TRY, UAH, USD, VND, ZAR
```

Die Liste enthält mehrere längst abgelöste Währungen (CYP, MTL, SIT, SKK, LTL, LVL, ROL,
TRL). Das ist ein Hinweis darauf, dass sie seit Jahren unverändert gepflegt wird.

**Widerspruch innerhalb der SPEC:** Bei `/receipts/upload` lautet die Beschreibung von
`currency` abweichend "Has to be 'EUR' if specified". Beim inhaltlich verwandten
`/receipts/add` steht dagegen die vollständige Währungsliste. Ob Uploads tatsächlich auf
EUR beschränkt sind, wurde nicht getestet (schreibender Endpunkt) und ist **nicht
verifiziert**.

Fremdwährung hat eine praktische Konsequenz, auf die die SPEC bei
`/postings/add/receipt` und `/postings/add-batch/receipts` ausdrücklich hinweist: Für
Belege in Fremdwährung muss der Beleg zuerst über `/receipts/get/id_by_customer` geholt
und der dort berechnete Betrag verwendet werden, bevor Buchungen angelegt werden.

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 0.3, Befund L1.** **Der Fremdwährungsablauf ist durchführbar.** Der
> frühere Vorbehalt an dieser Stelle beruhte auf vier Aufrufen in der falschen Form: Geprüft
> waren ausschließlich Body-Varianten. Der Wert gehört in den Pfad. `POST /receipts/get/<wert>`
> mit dem Body `{"api_key": "…"}` antwortet gemessen am 2026-09-12 mit HTTP 200 und liefert
> `amount_original`, `currency_original` und `exchangerate`. Der Pflichtschritt vor
> Fremdwährungsbuchungen läuft damit nicht mehr ins Leere, und die frühere Array-Hypothese ist
> hinfällig. Derselbe Pflichtschritt steht auch in `docs/api/buchungen.md`, Abschnitt 6.2.
> Siehe Stolperfalle 29 in Abschnitt 8 und `docs/api/live-befunde-orchestrator.md`, Befund 1.

### 5.7 Booleans

Boolesche Parameter sind in der SPEC als `"type": "boolean"` deklariert, ihre Defaults
sind jedoch uneinheitlich notiert. Zwölf Parameter tragen den **String** `"false"` als
Default, vier tragen den echten Booleschen Wert `false`:

| Default als String `"false"` | Default als Boolean `false` |
| --- | --- |
| `/receipts/get`: `include_offers`, `deleted` | `/settings/get/postingaccounts`: `exclude_postingaccounts`, `exclude_accounts`, `exclude_creditors`, `exclude_debtors` |
| `/receipts/get/id_by_customer`: `get_file` | `/accounts/add`: `receipt_creates_transaction`, `is_revision_safe` |
| `/receipts/assigned-transactions/get`: `confirmed_only` | |
| `/invoices/create`: `show_bankdata`, `show_contactdata` | |
| `/reports/create/sums`: `file_pdf`, `file_csv`, `archive_export` | |
| `/reports/get/bwa`: `get_files` | |

Das ist ein Dokumentationsfehler, kein Verhaltensunterschied: In allen Fällen ist der
Default fachlich "aus". Ob der Server beim Senden auch die Strings `"true"` und `"false"`
akzeptiert, wurde nicht getestet und ist **nicht verifiziert**. Ein Client sollte echte
JSON-Booleans senden, das entspricht dem deklarierten Typ.

In den Antworten werden Booleans dagegen als String geliefert: Live liefert `/receipts/get`
das Feld `deleted` als `"0"` bzw. `"1"`, nicht als `true`/`false`.

### 5.8 Leere Werte und Weglassen

Die SPEC wiederholt bei sehr vielen Parametern den Satz: "An empty string is not
considered a valid date" bzw. entsprechend für Gegenpartei, Währung, Typ, Kontonummer,
Bankleitzahl und Bankname. Die Regel lautet also: **Ein optionales Feld wird weggelassen,
nicht als leerer String gesendet.** Ein leerer String löst einen Validierungsfehler aus,
kein Ignorieren.

Ausnahmen, bei denen der leere String ausdrücklich erlaubt ist: `invoice_number`
("may also be an empty string"), `purpose`, `booking_text` sowie `vat_rate`, wo der leere
String bedeutet, dass kein oder mehrere Umsatzsteuersätze vorliegen. Dass `vat_rate`
gleichzeitig als `number` deklariert ist und einen leeren String zulassen soll, ist ein
Typwiderspruch innerhalb der SPEC.

Weitere ausdrückliche Nullwert-Verbote: `'0'` ist keine gültige Kontonummer
(`account` bei `/receipts/upload`), `'0.00'` ist kein gültiger Beleg- oder
Zahlungsbetrag.

In Antworten sind fehlende Werte dagegen `null`, nicht der leere String. Live verifiziert
an `/receipts/get`: `delivery_date`, `due_date` und `link_to_receipt_id_by_customer` kamen
als JSON-`null`, kein Feld kam als leerer String. Ein Client muss in den Antworttypen also
durchgängig Nullbarkeit vorsehen.

### 5.9 Parallele Arrays statt Objektlisten

Mehrere Endpunkte erwarten zusammengehörige Werte als mehrere gleich lange Arrays, deren
Positionen einander entsprechen:

- `/postings/add/receipt` und `/postings/add/transaction`: `postingaccounts`,
  `postingtexts`, `vats`, `amounts`, `cost_locations`, `cost_locations_two`, bei
  Transaktionen zusätzlich `oi_receipts_ids_by_customer`.
- `/invoices/create` und `/invoices/create/draft`: `item_name`, `item_amount`,
  `item_unit`, `item_vat`, `item_single_price`, `item_description`.
- `/invoices/create/e-invoice`: wie oben, aber `item_tax_type` und `item_tax_amount`
  statt `item_vat`.

Die SPEC deklariert diese Parameter als `"type": "array"` ohne `items`-Definition. Welcher
Elementtyp erwartet wird, steht nur im Fließtext. Der MCP-Server sollte an dieser Stelle
eine objektorientierte Werkzeugschnittstelle anbieten (eine Liste von Positionen) und die
Umwandlung in parallele Arrays intern vornehmen, inklusive Längenprüfung. Ungleich lange
Arrays sind sonst eine sehr leicht erzeugte, schwer zu findende Fehlerquelle.

Davon zu unterscheiden sind die echten Objektarrays der Batch-Endpunkte
(`/receipts/addBatch` mit `receipts`, `/transactions/addBatch` mit `transactions`,
`/transactions/assign-batch/receipt` mit `transactions_to_receipts`,
`/postings/add-batch/*`, `/settings/add-batch/*`). Diese tragen ein `schema` mit `$ref`
auf eine Definition und erwarten ein Array von Objekten. Für `receipts`, `transactions`
und `transactions_to_receipts` nennt die SPEC ein Maximum von **50 Elementen** pro
Anfrage. Für die Batch-Endpunkte unter `/postings/` und `/settings/` ist kein Maximum
dokumentiert, das ist **nicht verifiziert**.

---

## 6. Paginierung

Quellen: SPEC, LIVE.

### 6.1 Das Verfahren

Die API kennt ausschließlich Offset-Paginierung über die Felder `limit` und `offset`. Es
gibt keine Cursor, keine Link-Header, kein Feld mit der Gesamtzahl der Treffer und kein
Kennzeichen "es gibt weitere Seiten". Der Client muss das Ende selbst erkennen.

### 6.2 Live-Nachweis am Beispiel /receipts/get

Geprüft am 2026-09-12:

Anfrage A:

```json
{"api_key": "PLATZHALTER", "list_direction": "inbound", "limit": 2, "offset": 0}
```

Antwort A (anonymisiert, Werte durch Platzhalter ersetzt):

```json
{
  "success": true,
  "message": "",
  "rows": 2,
  "data": [
    {
      "filename": "2099-01-01_Musterfirma(Beispiel)_XX-00-00000_a0b1c2d3e4f5g6h7i8j9",
      "id_by_customer": "1",
      "type": "invoice inbound",
      "date": "2099-01-01",
      "delivery_date": null,
      "date_uploaded": "2099-01-02",
      "counterparty": "Musterfirma",
      "invoicenumber": "XX-00-00000",
      "amount": "123.45",
      "payment_date": "2099-01-03",
      "due_date": null,
      "account": "1200",
      "amount_paid": "0.00",
      "amount_paid_fixed": "0.00",
      "deleted": "0",
      "link_to_receipt_id_by_customer": null
    }
  ]
}
```

Anfrage B, identisch bis auf `"offset": 999999`:

```json
{"success": true, "message": "", "rows": 0, "data": []}
```

Daraus folgt belegt:

1. `rows` ist die Länge von `data`, nicht die Gesamtzahl.
2. Ein Offset jenseits der Datenmenge ist **kein Fehler**. Der Server antwortet mit
   HTTP 200, `success: true`, `rows: 0` und leerem `data`.

### 6.3 Abbruchbedingung

Eine Schleife ist beendet, wenn eine der beiden Bedingungen eintritt:

- `rows === 0` beziehungsweise `data.length === 0`, oder
- `data.length < limit`.

Die zweite Bedingung spart eine Anfrage, ist aber nur dann sicher, wenn der Server
tatsächlich immer bis zum `limit` auffüllt, solange Daten vorhanden sind. Das wurde nicht
für alle Endpunkte geprüft und ist als generelle Aussage **nicht verifiziert**. Robuster
ist, in Zweifelsfällen bis zur ersten leeren Seite zu laufen.

Referenzimplementierung:

```typescript
async function fetchAllReceipts(client: BbClient, listDirection: "inbound" | "outbound") {
  const limit = 500; // maximum allowed by /receipts/get
  const all: Receipt[] = [];
  let offset = 0;

  for (;;) {
    const res = await client.post("/receipts/get", {
      list_direction: listDirection,
      limit,
      offset,
    });
    const page = res.data ?? [];
    all.push(...page);
    if (page.length < limit) break; // letzte Seite erreicht
    offset += limit;
  }
  return all;
}
```

### 6.4 Fallstricke der Offset-Paginierung hier

**Instabile Seitengrenzen.** Ändert sich der Datenbestand während des Durchlaufs, können
Datensätze doppelt erscheinen oder übersprungen werden. Die API bietet keinen Cursor, der
das verhindern würde. Für `/receipts/get` hilft eine explizite Sortierung über `order`,
für `/postings/get` die Angabe von `order: "id_by_customer ASC"`.

**Der Sonderfall bei `/transactions/get`.** Werden `id_by_customer_from` oder
`id_by_customer_to` gesetzt, wechselt die Sortierung laut SPEC zwingend auf
`id_by_customer ASC`, auch in Kombination mit Datumsfiltern. Beide Grenzen sind exklusiv.
Das erlaubt eine stabilere, cursorähnliche Paginierung: die höchste gesehene
`id_by_customer` als neues `id_by_customer_from` verwenden, statt `offset` zu erhöhen.
Dieses Muster ist die robustere Wahl, wurde aber nicht live getestet und ist damit als
Empfehlung **nicht verifiziert**.

**Pflichtfelder nicht vergessen.** `/postings/get` verlangt `date_from` und `date_to` als
Pflichtfelder. Eine Paginierung ohne Zeitraum ist dort nicht möglich. `/receipts/get`
verlangt `list_direction`, ein vollständiger Belegabzug erfordert also zwei Durchläufe,
einen für `inbound` und einen für `outbound`.

**Die kleinen Defaults.** `/settings/get/debtors` und `/settings/get/creditors` liefern
ohne `limit` nur 25 Zeilen. Wer Stammdaten spiegelt, muss `limit` dort explizit setzen.

---

## 7. Idempotenz und Nebenwirkungen

### 7.1 Grundsätzliches

Kein Endpunkt der API bietet einen Idempotenzschlüssel. Es gibt kein Feld analog zu
`Idempotency-Key`, keine Deduplizierung über eine Client-Referenz und keine dokumentierte
Duplikaterkennung. Ein wiederholter schreibender Aufruf erzeugt daher im Zweifel ein
zweites Objekt. Bei Netzwerkfehlern oder Timeouts (HTTP 504, Fehlercode 30) ist ein
blinder Retry eines schreibenden Aufrufs deshalb **gefährlich**: Die Anfrage kann
serverseitig durchgelaufen sein, obwohl der Client keine Antwort erhalten hat.

Für den MCP-Server folgt daraus: Bei schreibenden Endpunkten darf es keinen automatischen
Retry geben. Stattdessen Fehler melden und die Entscheidung dem Aufrufer überlassen, oder
vor dem Wiederholen über einen Leseendpunkt prüfen, ob das Objekt bereits existiert.

Lesende Endpunkte sind im Sinne der Nebenwirkungsfreiheit sicher und dürfen wiederholt
werden. Die einzige Nebenwirkung ist der Verbrauch des Rate-Limit-Kontingents.

### 7.2 Die Sonderrolle von /reports/create/bwa und /reports/create/sums

Diese beiden Endpunkte tragen `get`-Charakter im Sprachgebrauch, sind aber eindeutig
schreibend. Die SPEC sagt dazu zwei Dinge: Der Bericht wird asynchron im Hintergrund
erzeugt, und "creating a new report of the same type replaces the previously created one"
(SPEC, Beschreibung von `/reports/get/bwa` und `/reports/get/sums`). Ein Create-Aufruf
**vernichtet** also den vorher erzeugten Bericht desselben Typs. Zusätzlich darf ein neuer
Bericht erst angefordert werden, wenn die Erzeugung des vorherigen abgeschlossen ist.

Für einen Agenten ist das die gefährlichste Falle der gesamten API, weil der Name harmlos
klingt. Beide Endpunkte gehören in jedem Nur-Lesen-Modus gesperrt.

Ausnahme in die andere Richtung: `/reports/get/sums/ledger` wird laut SPEC "on the fly"
erzeugt und benötigt keinen vorherigen Create-Aufruf. Es ist damit trotz der
Berichtserzeugung ein lesender Endpunkt ohne persistente Nebenwirkung.

### 7.3 Vollständige Tabelle aller 54 Endpunkte

Legende der Spalte **Wirkung**:

- **lesend**: liefert Daten, verändert keinen persistenten Zustand
- **anlegend**: erzeugt neue Objekte
- **ändernd**: verändert bestehende Objekte oder Beziehungen
- **löschend**: entfernt Objekte, Buchungen oder Zuordnungen, oder storniert

Die Spalte **Risiko für einen Agenten** bewertet den möglichen Schaden bei einem
falschen oder versehentlichen Aufruf.

#### Receipts

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/receipts/get` | lesend | Gering. Nur Kontingentverbrauch. Bei `limit=500` und vielen Belegen können große Antworten entstehen. |
| `/receipts/get/id_by_customer` | lesend | Gering. Mit `get_file: true` wird die Belegdatei als Base64 mitgeliefert, das kann die Antwort sehr groß machen. **Live am 2026-09-12 benutzbar**, aber nur in der Pfadsegmentform `POST /receipts/get/<wert>`: Das Segment `id_by_customer` ist ein Platzhalter für den Wert. Die vier früher hier genannten Body-Varianten waren die falsche Aufrufform (nachgezogen am 2026-09-13 nach Umsetzungsplan 15, Sachgrund 0.3 Befund L1; Quelle `docs/api/live-befunde-orchestrator.md` Befund 1). |
| `/receipts/assigned-transactions/get` | lesend | Gering. |
| `/receipts/add` | anlegend | Hoch. Erzeugt einen Beleg ohne Datei in der echten Buchhaltung. Kein Idempotenzschutz, Doppelaufruf erzeugt Dubletten. Es gibt keinen Endpunkt, der einen Beleg endgültig entfernt. |
| `/receipts/addBatch` | anlegend | Sehr hoch. Bis zu 50 Belege auf einmal. Ein fehlerhafter Aufruf verschmutzt den Bestand in einem Schritt erheblich. |
| `/receipts/upload` | anlegend | Sehr hoch. Erzeugt Beleg und Datei, stößt OCR an, verbraucht das Upload-Kontingent des Tarifs (403/12) und unterliegt einem eigenen Limit von 10 Anfragen pro Minute. |
| `/receipts/delete/id_by_customer` | löschend | Hoch, aber umkehrbar. Markiert den Beleg als gelöscht, kein Hard Delete. Über `/receipts/restore/id_by_customer` rücknehmbar. |
| `/receipts/restore/id_by_customer` | ändernd | Mittel. Holt einen als gelöscht markierten Beleg zurück und macht ihn wieder buchungsrelevant. |

#### Transactions

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/transactions/get` | lesend | Gering. |
| `/transactions/get/id_by_customer` | lesend | Gering. **Live am 2026-09-12 benutzbar**, aber nur in der Pfadsegmentform `POST /transactions/get/<wert>`. Der **literale** Pfad ist nicht geroutet und antwortet mit HTML statt JSON; das Segment `id_by_customer` ist ein Platzhalter für den Wert (nachgezogen am 2026-09-13 nach Umsetzungsplan 15, Sachgrund 0.3 Befund L1; Quelle `docs/api/live-befunde-orchestrator.md` Befund 1). |
| `/transactions/assigned-receipts/get` | lesend | Gering. |
| `/transactions/add` | anlegend | Sehr hoch. Erzeugt eine Zahlung auf einem echten Zahlungskonto. Eine erfundene Zahlung verfälscht Kontostand und Abstimmung unmittelbar. Unterliegt zusätzlich der Drosselung 403/15. |
| `/transactions/addBatch` | anlegend | Sehr hoch. Bis zu 50 Zahlungen auf einmal, gleiche Risiken wie oben, multipliziert. |
| `/transactions/assign/receipt` | ändernd | Mittel bis hoch. Ordnet einen Beleg einer Zahlung zu und kann damit Folgeautomatiken auslösen. Über `/transactions/unassign/receipt` prinzipiell rücknehmbar. |
| `/transactions/assign-batch/receipt` | ändernd | Hoch. Bis zu 50 Zuordnungen auf einmal, mit Drosselungsrisiko 403/15. |
| `/transactions/unassign/receipt` | löschend | Hoch. Entfernt eine bestehende Zuordnung. Schlägt fehl, wenn eine bestätigte Buchung daran hängt (Fehlercode 10, `receipt could not be removed from transaction, because of a confirmed posting.`). Genau dieser Schutz zeigt, wie tief die Zuordnung im Buchungsstand verankert ist. |

#### Invoices

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/invoices/create` | anlegend | Sehr hoch. Erzeugt eine echte, nummerierte Ausgangsrechnung. Es gibt keinen Storno- und keinen Löschendpunkt für Rechnungen in dieser API. Verbraucht Kontingent (403/33). |
| `/invoices/create/e-invoice` | anlegend | Sehr hoch. Wie oben, zusätzlich mit den strengeren Formatvorgaben der E-Rechnung. Hat mit 44 definierten Fehlercodes die größte Fehleroberfläche der gesamten API. |
| `/invoices/create/draft` | anlegend | Hoch. Erzeugt einen Entwurf statt einer finalen Rechnung, also der am wenigsten riskante der drei. Trotzdem ein sichtbares Objekt in der Anwendung. |

#### Postings

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/postings/get` | lesend | Gering. `date_from` und `date_to` sind Pflicht, maximal 1000 Buchungen pro Anfrage. |
| `/postings/add/receipt` | anlegend | Sehr hoch. Erzeugt Buchungssätze zu einem Beleg. Nur verfügbar, wenn Kreditoren- oder Debitorenbuchung aktiviert ist. Bei Fremdwährung muss zuvor der berechnete Betrag über `/receipts/get/id_by_customer` ermittelt werden. **Vorbehalt:** dieser Endpunkt konnte am 2026-09-12 in vier Versuchen nicht erfolgreich aufgerufen werden (HTTP 400, `error_code` 5, Quelle `docs/api/belege.md` Abschnitt 4.5). Der Fremdwährungsablauf ist damit derzeit nicht durchführbar und vor der Implementierung mit einem einzelnen Testaufruf zu klären. |
| `/postings/add-batch/receipts` | anlegend | Sehr hoch. Mehrere Belege in einem Zug bebucht, zusätzlich Drosselungsrisiko 403/15. |
| `/postings/add/transaction` | anlegend | Sehr hoch. Erzeugt Buchungssätze zu einer Zahlung. |
| `/postings/add-batch/transactions` | anlegend | Sehr hoch. Wie oben, multipliziert. |
| `/postings/add/free` | anlegend | Sehr hoch. Freie Buchung ohne Beleg- oder Zahlungsbezug, also ohne natürliches Korrektiv. |
| `/postings/add-batch/free` | anlegend | Sehr hoch. Wie oben, multipliziert, mit Drosselungsrisiko 403/15. |
| `/postings/unconfirm/receipt` | löschend | Sehr hoch. Entfernt Buchungen zu einem Beleg. Wirkt nur auf nicht festgeschriebene Buchungen, verändert aber den Buchungsstand unmittelbar. |
| `/postings/unconfirm/transaction` | löschend | Sehr hoch. Wie oben, für Zahlungen. |
| `/postings/unconfirm/free` | löschend | Sehr hoch. Wie oben, für freie Buchungen. |
| `/postings/assign/receipt-to-free-posting` | ändernd | Hoch. Verknüpft einen Beleg mit einer freien Buchung und ändert damit deren Belegzuordnung. |
| `/postings/cancel` | löschend | Höchstes Risiko der gesamten API. Nicht festgeschriebene Buchungen werden gelöscht, festgeschriebene werden durch eine Stornobuchung ausgeglichen. Im zweiten Fall entsteht ein dauerhafter, in der Historie sichtbarer Vorgang, der sich nicht mehr entfernen lässt. |

#### Settings (Stammdaten)

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/settings/get/debtors` | lesend | Gering. Achtung: Default `limit` ist 25. |
| `/settings/get/creditors` | lesend | Gering. Achtung: Default `limit` ist 25. |
| `/settings/get/postingaccounts` | lesend | Gering. Default `limit` ist 1000. |
| `/settings/add/debtor` | anlegend | Mittel. Legt ein Debitorenkonto an. Stammdatenverschmutzung, aber keine unmittelbare buchhalterische Wirkung. Es gibt keinen Endpunkt zum Löschen. |
| `/settings/add-batch/debtors` | anlegend | Hoch. Mehrere Debitorenkonten auf einmal, Drosselungsrisiko 403/15. |
| `/settings/add/creditor` | anlegend | Mittel. Wie Debitor. |
| `/settings/add-batch/creditors` | anlegend | Hoch. Wie Debitoren-Batch. |
| `/settings/add/postingaccount` | anlegend | Mittel bis hoch. Ein neues Buchungskonto verändert den Kontenrahmen und wirkt damit auf alle künftigen Buchungen und Auswertungen. |
| `/settings/update/debtor` | ändernd | Hoch. Überschreibt Stammdaten eines bestehenden Kontos. Kein Endpunkt liefert den Zustand vor der Änderung zurück, ein Rückgängigmachen erfordert eine vorher gezogene Kopie. |
| `/settings/update/creditor` | ändernd | Hoch. Wie Debitor. |
| `/settings/update/postingaccount` | ändernd | Hoch. Ändert ein Buchungskonto, auf das bestehende Buchungen verweisen. |

#### Accounts, Comments, Cost Locations

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/accounts/get` | lesend | Gering. Kennt kein `limit`, liefert immer alle Basiskonten. |
| `/accounts/add` | anlegend | Hoch. Legt ein Zahlungskonto an. Die Flags `receipt_creates_transaction` und `is_revision_safe` steuern dauerhaftes Verhalten. `is_revision_safe` betrifft die Revisionssicherheit, also einen Aspekt mit Aufbewahrungsrelevanz. |
| `/comments/add` | anlegend | Gering bis mittel. Fügt einen Kommentar an einen Beleg oder eine Zahlung. Keine buchhalterische Wirkung, aber für andere Nutzer sichtbar und nicht über die API löschbar. |
| `/cost-locations/get` | lesend | Gering. Maximal 1000 Kostenstellen pro Anfrage. |
| `/cost-locations/add` | anlegend | Mittel. Neue Kostenstelle, wirkt auf die Kostenstellenauswertung. |
| `/cost-locations/update` | ändernd | Mittel bis hoch. Ändert Name oder Beschreibung einer Kostenstelle, auf die bestehende Buchungen verweisen. |
| `/cost-locations/delete` | löschend | Hoch. Entfernt eine Kostenstelle. Ob und wie mit Buchungen umgegangen wird, die darauf verweisen, ist in der SPEC nicht beschrieben und **nicht verifiziert**. |

#### Reports

| Endpunkt | Wirkung | Risiko für einen Agenten |
| --- | --- | --- |
| `/reports/get/bwa` | lesend | Gering. Mit `get_files: true` werden PDF- und CSV-Dateien als Base64 mitgeliefert, die Antwort kann dadurch sehr groß werden. |
| `/reports/get/sums` | lesend | Gering. Gleiches gilt für `get_files`. |
| `/reports/get/sums/ledger` | lesend | Gering. Wird laut SPEC direkt erzeugt, ohne vorherigen Create-Aufruf und ohne persistente Nebenwirkung. |
| `/reports/create/bwa` | anlegend | Hoch, trotz harmlosen Namens. Erzeugt serverseitig einen Bericht und **ersetzt den zuvor erzeugten BWA-Bericht**. Asynchron, blockiert bis zum Abschluss weitere Create-Aufrufe desselben Typs. |
| `/reports/create/sums` | anlegend | Hoch, aus denselben Gründen. Zusätzlich können PDF, CSV und ein ZIP-Archiv erzeugt werden, was Rechenzeit und Speicher beansprucht. |

#### Zusammenfassung für einen Nur-Lesen-Modus

| Wirkung | Anzahl |
| --- | --- |
| lesend | 15 |
| anlegend | 24 |
| ändernd | 8 |
| löschend | 7 |
| **Summe** | **54** |

Die 15 lesenden Endpunkte, und nur diese, dürfen in einem Nur-Lesen-Modus freigeschaltet
sein:

```text
/accounts/get
/receipts/get
/receipts/get/id_by_customer
/receipts/assigned-transactions/get
/transactions/get
/transactions/get/id_by_customer
/transactions/assigned-receipts/get
/postings/get
/settings/get/debtors
/settings/get/creditors
/settings/get/postingaccounts
/cost-locations/get
/reports/get/bwa
/reports/get/sums
/reports/get/sums/ledger
```

Die Liste nennt die Endpunkte, die laut Spezifikation lesend sind. Sie sagt nichts
darüber, ob jeder davon auch tatsächlich antwortet: `/receipts/get/id_by_customer` und
`/transactions/get/id_by_customer` waren am 2026-09-12 live nicht benutzbar, siehe
Stolperfalle 29.

Empfehlung für die Implementierung: Diese Liste als **Allowlist** führen, nicht als
Denylist. Eine Denylist versagt, sobald der Anbieter einen Endpunkt ergänzt. Die Zuordnung
sollte über exakten Pfadvergleich erfolgen, nicht über Musterabgleich auf `get`: Sowohl
`/reports/create/sums` als auch `/receipts/delete/id_by_customer` enthalten kein `get`,
aber `/reports/get/bwa` und `/receipts/get` unterscheiden sich strukturell nicht von
einem hypothetischen zukünftigen `/something/get`, das schreibt.

---

## 8. Bekannte Eigenheiten und Stolperfallen

1. **Die Spezifikation ist kein gültiges Swagger 2.0.** Alle 371 Body-Parameter stehen als
   Einzeleinträge mit `"in": "body"` und eigenem `type`, statt gebündelt in einem
   gemeinsamen `schema`. Fachlich sind es Felder eines JSON-Objekts. Kein
   Standardgenerator verarbeitet das korrekt. Jeder Eintrag muss einzeln gelesen werden.

2. **`enum` mit genau einem Eintrag sind Beispielwerte, keine erlaubten Wertemengen.**
   In den Definitionen steht etwa `"amount": {"type": "string", "enum": ["123.99"]}`. Das
   bedeutet nicht, dass nur `"123.99"` erlaubt ist. Ein Generator, der daraus einen
   String-Literal-Typ ableitet, erzeugt unbrauchbaren Code. Echte Wertemengen stehen im
   Fließtext der `description`, etwa bei `list_direction` oder `type`.

3. **`error_code` ist endpunktspezifisch.** Siehe Abschnitt 4.2. Nur die Codes aus den
   `Request_*`-Definitionen sind endpunktübergreifend konsistent.

4. **Die `responses`-Schlüssel sind Zeichenketten wie `"400 (5)"`.** Status und Fehlercode
   sind in einem Schlüssel verschmolzen. Das ist Swagger-seitig ungültig, aber die einzige
   Quelle für die Zuordnung Fehlercode zu HTTP-Status.

5. **Das Antwortschema für `/receipts/get` stimmt nicht mit der Realität überein.**
   Live verifiziert am 2026-09-12:
   - Die SPEC nennt ein Feld `date_delivery`, geliefert wird `delivery_date`.
   - Die SPEC kennt die Felder `amount_paid` und `amount_paid_fixed` nicht, geliefert
     werden sie.
   - Die SPEC beschreibt `date_uploaded` mit dem Beispiel `2018-01-01`, geliefert wird
     ebenfalls nur ein Datum ohne Zeitanteil, hier stimmen SPEC und Realität überein.

   Die Konsequenz ist grundsätzlich: Die Antwortschemata der SPEC sind unvollständig und
   in Feldnamen teils falsch. Typen sollten bei der Implementierung gegen echte Antworten
   validiert und tolerant modelliert werden (unbekannte Felder zulassen, alle optionalen
   Felder nullbar).

6. **Terminologische Inkonsistenz Debtor gegen Debitor.** Die Pfade heißen
   `/settings/add/debtor` und `/settings/get/debtors`, die zugehörigen Definitionen heißen
   jedoch `SettingsAddDebitor_*`, `SettingsDebitorGet_*` und `SettingsUpdateDebitor_*`.
   Auch die Reihenfolge dreht sich (`SettingsCreditorGet` statt `SettingsGetCreditors`).
   Eine automatische Zuordnung von Pfad zu Definition über eine Namensregel schlägt bei
   fünf Endpunkten fehl. Die Zuordnung muss über die `$ref` in `responses` erfolgen, nicht
   über den Namen.

7. **Beträge: Eingabe als Zahl, Ausgabe als String.** Siehe Abschnitt 5.5.

8. **Booleans: Eingabe als Boolean, Ausgabe als String `"0"` oder `"1"`.** Siehe 5.7.

9. **`id_by_customer`: Eingabe meist als Integer, Ausgabe als String.** Siehe 1.4.

10. **Leerer String ist bei den meisten Feldern ungültig, nicht neutral.** Optionale Felder
    weglassen, nicht leeren. Siehe 5.8.

11. **`date_since_last_modified` ohne Uhrzeit meint 23:59:59.** Für inkrementelle
    Synchronisierung immer die volle Zeitangabe senden, sonst gehen Änderungen des
    Stichtags verloren.

12. **`id_by_customer_from` und `id_by_customer_to` sind exklusiv, Datumsgrenzen sind
    inklusiv.** Diese Asymmetrie steht ausdrücklich in der SPEC.

13. **Das Setzen von `id_by_customer_from` oder `id_by_customer_to` bei
    `/transactions/get` überschreibt die Sortierung.** Sie wechselt zwingend auf
    `id_by_customer ASC`, auch wenn Datumsfilter gesetzt sind.

14. **Drei verschiedene `order`-Syntaxen bei drei Endpunkten.** Siehe 5.3. Bei
    `/postings/get` ist die Validierung ausdrücklich case sensitive.

15. **Unbekannte Pfade liefern HTML, nicht JSON.** Live verifiziert an
    `/postings/reservations/get`: HTTP 404 mit `content-type: text/html`. Vor dem Parsen
    den Content-Type prüfen.

16. **Antworten setzen Cookies.** `bbutler`, `AWSALB`, `AWSALBCORS`. Ein API-Client sollte
    sie nicht speichern und den Cookie-Jar zwischen Mandanten nicht teilen.

17. **Kein Idempotenzschlüssel, kein sicherer Retry bei Schreibvorgängen.** Siehe 7.1.
    Besonders kritisch bei HTTP 504 mit Fehlercode 30, weil dann offen ist, ob die Aktion
    serverseitig ausgeführt wurde.

18. **`/reports/create/*` ersetzt den vorherigen Bericht.** Siehe 7.2.

19. **Paginierung ohne Gesamtzahl.** Kein Feld nennt die Treffermenge. Das Ende erkennt man
    nur an einer leeren oder unvollständigen Seite. Siehe Abschnitt 6.

20. **Kleine Defaults bei Debitoren und Kreditoren.** 25 Zeilen ohne explizites `limit`.

21. **`limit` über dem Maximum wird abgelehnt, nicht gekappt.** Live verifiziert:
    HTTP 400, Fehlercode 10.

22. **Parallele Arrays bei Buchungen und Rechnungspositionen.** Siehe 5.9. Ungleich lange
    Arrays sind eine leicht erzeugte, schwer zu findende Fehlerquelle.

23. **Widerspruch bei der Währung von `/receipts/upload`.** Dort steht "Has to be 'EUR'",
    bei `/receipts/add` die vollständige Währungsliste. Nicht aufgelöst.

24. **`vat_rate` ist als `number` deklariert, soll aber einen leeren String zulassen.**
    Typwiderspruch innerhalb der SPEC.

25. **Die Währungsliste enthält abgeschaffte Währungen** (CYP, MTL, SIT, SKK, LTL, LVL,
    ROL, TRL). Ein Indiz dafür, dass die Liste seit Jahren nicht gepflegt wird.

26. **Fehlermeldungen sind ausschließlich englisch**, obwohl die Spezifikation unter
    `v1.de.json` ausgeliefert wird und Teile der Beschreibungen deutsche Begriffe in
    HTML-Entities enthalten (`&ldquo;Eingangsbelege&rdquo;`). Beschreibungstexte enthalten
    durchgehend HTML-Markup (`<br/>`, `<i>`, `<strong>`) und HTML-Entities. Wer die
    Beschreibungen in MCP-Werkzeugbeschreibungen übernimmt, muss sie bereinigen.

27. **DATEV-bedingte Regel beim Leistungsdatum.** Die SPEC weist ausdrücklich darauf hin,
    dass ein `date_delivery` nach dem Belegdatum wegen der DATEV-Kompatibilität nicht
    akzeptiert wird.

28. **Vorbedingungen einzelner Endpunkte.** Belegbuchungen sind nur verfügbar, wenn
    Kreditoren- oder Debitorenbuchung im Mandanten aktiviert ist. Bei Fremdwährungsbelegen
    muss der berechnete Betrag zuvor über `/receipts/get/id_by_customer` geholt werden.
    Beides steht nur im Fließtext der Beschreibung. **Nachgezogen am 2026-09-13 nach
    `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20), Sachgrund 0.3 Befund L1:**
    Der Fremdwährungsablauf ist **durchführbar**. Der Einzelabruf funktioniert in der
    Pfadsegmentform `POST /receipts/get/<wert>` (HTTP 200, gemessen am 2026-09-12) und
    liefert `amount_original`, `currency_original` und `exchangerate`. Der frühere
    Vorbehalt beruhte auf vier Aufrufen in der falschen Form. Siehe Punkt 29 und
    Abschnitt 5.6.

29. **Bei vier der 54 dokumentierten Endpunkte ist `id_by_customer` im Pfad ein Platzhalter
    für den Wert, kein literales Segment.**

    > **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15
    > (AP20); Sachgrund in Abschnitt 0.3, Befund L1.** Dieser Punkt hieß zuvor „Zwei der 54
    > dokumentierten Endpunkte waren live nicht benutzbar". Das trifft nicht zu. Die unten
    > wiedergegebenen Messungen bleiben richtig, ihre Deutung war falsch: Geprüft war jeweils
    > die **dokumentierte, literale** Aufrufform. Gemessen am 2026-09-12 antworten
    > `POST /receipts/get/<wert>` und `POST /transactions/get/<wert>` mit **HTTP 200** und
    > einem vollständigen Datensatz. Der Wert wird in den Pfad eingesetzt und vorher kodiert;
    > ein Body-Feld `id_by_customer` wird nicht gesendet, und die Spezifikation führt an diesen
    > Pfaden auch keines. Dasselbe gilt nach Analogieschluss für die beiden schreibenden
    > Geschwister `/receipts/delete/id_by_customer` und `/receipts/restore/id_by_customer`;
    > diese beiden sind **nicht verifiziert**, weil sie schreibend sind und deshalb nicht
    > getestet wurden. Die Umgehung über die exklusiven Kennungsgrenzen bei `/transactions/get`
    > wird nicht mehr gebraucht. Vollständige Messung:
    > `docs/api/live-befunde-orchestrator.md`, Befund 1.

    Der frühere Wortlaut, als Beleg für die Aufrufformen, die **nicht** funktionieren:

    - `/receipts/get/id_by_customer`: vier Aufrufvarianten (`id_by_customer` als Zahl, als
      String, unter dem Feldnamen `receipt_id_by_customer` sowie formularkodiert)
      lieferten übereinstimmend HTTP 400 mit `error_code` 5 und der Meldung
      `invalid id_by_customer specified`. Quelle: `docs/api/belege.md`, Abschnitt 4.5.
      Dort steht auch die ungetestete Hypothese, dass der Endpunkt ein Array erwartet.
    - `/transactions/get/id_by_customer`: HTTP 404 mit HTML-Antwortkörper statt JSON, der
      Pfad ist in der erreichbaren Produktivumgebung nicht geroutet. Quelle:
      `docs/api/transaktionen.md`, Abschnitt 4.5. Dort steht auch die dokumentierte, aber
      selbst nicht live geprüfte Umgehung über `/transactions/get` mit den exklusiven
      Grenzen `id_by_customer_from` und `id_by_customer_to`.

    Konsequenz, nachgezogen: Der Einzelabruf über `id_by_customer` ist für beide Objektarten
    verfügbar, sobald der Wert in den Pfad eingesetzt wird. Der in Abschnitt 5.6 und in
    Punkt 28 beschriebene Fremdwährungsablauf ist damit durchführbar. Wer eine
    Implementierung liest, die den literalen Pfad oder ein Body-Feld `id_by_customer`
    sendet, hat einen Fehler vor sich und keine zweite zulässige Variante.

---

## 9. Undokumentierte Spuren

Die Spezifikation enthält 790 Definitionen, aber nur 54 Pfade. Ein Teil der Definitionen
gehört zu keinem Pfad.

### 9.1 Systematische Auswertung

Methode: Aus jedem Definitionsnamen wurde der Präfix vor `_Success` oder `_ErrorCode<N>`
gelöst und mit den aus den 54 Pfaden abgeleiteten Präfixen verglichen (Segmente in
CamelCase, Trennzeichen entfernt). Ergebnis: 58 Definitionspräfixe, davon **neun ohne
zugehörigen Pfad**. Die Zählung ist mit den Kommandos im Anhang nachrechenbar.

| Präfix ohne Pfad | Einordnung |
| --- | --- |
| `PostingsReservationsGet` | echte Spur, siehe 9.2 |
| `PostingsReservationsAdd` | echte Spur, siehe 9.2 |
| `PostingsReservationsDelete` | echte Spur, siehe 9.2 |
| `Request` | kein Endpunkt, sondern die generischen Fehlerdefinitionen aus Abschnitt 4.2 |
| `SettingsAddDebitor` | reine Namensabweichung zu `/settings/add/debtor` (Debitor statt Debtor) |
| `SettingsUpdateDebitor` | reine Namensabweichung zu `/settings/update/debtor` |
| `SettingsDebitorGet` | reine Namensabweichung zu `/settings/get/debtors` (Wortstellung und Debitor) |
| `SettingsCreditorGet` | reine Namensabweichung zu `/settings/get/creditors` (Wortstellung) |
| `SettingsPostingaccountsGet` | reine Namensabweichung zu `/settings/get/postingaccounts` (Wortstellung) |

Die fünf `Settings*`-Einträge sind also **keine** undokumentierten Endpunkte, sondern
Folgen der inkonsistenten Namensgebung aus Stolperfalle 6. Ihre Definitionen werden von
den `responses` der jeweiligen Settings-Pfade regulär per `$ref` referenziert. `Request`
ist eine Sammelgruppe ohne eigenen Pfad.

Damit bleibt genau eine echte Spur: **Postings Reservations**.

### 9.2 Postings Reservations

36 Definitionen tragen diesen Präfix: 27 für `PostingsReservationsAdd`, 5 für
`PostingsReservationsGet`, 4 für `PostingsReservationsDelete`. Sie folgen exakt demselben
Aufbau wie alle anderen Definitionen der Spezifikation, sind also nicht etwa Fragmente.

**Keine dieser 36 Definitionen wird per `$ref` referenziert.** Sie sind vollständig
verwaist. Die Auswertung fand insgesamt 45 nicht referenzierte Definitionen, 36 davon
gehören zu dieser Gruppe, die verbleibenden 9 stehen in Abschnitt 9.3.

Die Wortfolge "reservation" kommt in keiner einzigen `description`, `summary` oder
`tags`-Angabe der Spezifikation vor. Es gibt also keinen Fließtext-Hinweis, wozu die
Gruppe gehört.

**Was die Definitionen fachlich verraten.** `PostingsReservationsGet_Success` beschreibt
Objekte mit folgenden Feldern:

| Feld | Typ | Beispielwert der SPEC |
| --- | --- | --- |
| `id_by_customer` | string | `123` |
| `receipt_id_by_customer` | string | `12` |
| `postingaccount` | string | `320` |
| `postingtext` | string | `The posting text` |
| `cost_location` | string | `99` |
| `cost_location_two` | string | `101` |
| `amount` | string | `123.90` |
| `vat_option` | string | `19_vat` |

Das ist eine Buchungszeile mit Belegbezug. Die Feldnamen stimmen bis auf `receipt_id_by_customer`
mit den Buchungsfeldern von `/postings/add/receipt` überein. Eine "Reservation" scheint
demnach eine vorbereitete, noch nicht gebuchte Buchungszeile zu einem Beleg zu sein,
fachlich also ein Buchungsvorschlag oder eine Vorerfassung. Das ist eine begründete
Deutung aus den Feldnamen, aber **nicht verifiziert**.

Die Fehlercodes stützen diese Deutung: `PostingsReservationsGet_ErrorCode5` lautet
`invalid receipt_id_by_customer specified`, `ErrorCode6` lautet `receipt was not found`.
Ein Get erwartet also eine Beleg-ID als Eingabe. `ErrorCode7` und `ErrorCode8` sind
`invalid limit specified` und `invalid offset specified`, es wäre also ein paginierbarer
Endpunkt.

`PostingsReservationsAdd` besitzt mit 26 Fehlercodes eine Fehleroberfläche in der
Größenordnung von `/postings/add/free` (dort 34). `PostingsReservationsAdd_Success` und
`PostingsReservationsDelete_Success` enthalten nur `success` und `message`, liefern also
keine Daten zurück.

**Nebenbefund zu den fünf generischen Codes.** Hier sind Antwortebene und
Definitionsebene strikt zu trennen.

*Antwortebene.* Alle 54 Pfade der Spezifikation führen in ihren `responses` die fünf
generischen Codes `401 (3)`, `401 (4)`, `403 (11)`, `500 (0)` und `504 (30)`. Das ist
mechanisch bestätigt, es gibt keine Ausnahme. `PostingsReservations` fällt aus dieser
Aussage heraus, weil die Gruppe mangels Pfad überhaupt keine `responses` besitzt, nicht
weil ihr dort etwas fehlt, was andere Pfade hätten.

*Definitionsebene.* Eine **eigene** `_ErrorCode0`-, `_ErrorCode3`-, `_ErrorCode4`-,
`_ErrorCode11`- und `_ErrorCode30`-Definition ist dagegen keineswegs die Regel.
Von den 58 Definitionspräfixen (gebildet aus allen Definitionen mit `_Success`- oder
`_ErrorCode<N>`-Suffix) besitzen **22 keine einzige** dieser fünf Definitionen. Drei davon
sind die pfadlosen Reservations-Präfixe selbst, die übrigen 19 gehören zu echten
Endpunkten:

| Gruppe | Präfixe |
| --- | --- |
| 14 Präfixe mit eigenen, aber anderen Fehlerdefinitionen | `ReceiptsAddBatch`, `TransactionsAddBatch`, `TransactionsUnassignReceipt`, `TransactionsAssignBatchReceipt`, `TransactionsAssignedReceiptsGet`, `CostLocationsGet`, `CostLocationsAdd`, `CostLocationsUpdate`, `CostLocationsDelete`, `ReportsCreateBwa`, `ReportsCreateSums`, `ReportsGetBwa`, `ReportsGetSums`, `ReportsGetSumsLedger` |
| 5 Präfixe der `add-batch`-Familie ohne jede eigene `_ErrorCode`-Definition | `PostingsAddBatchFree`, `PostingsAddBatchReceipts`, `PostingsAddBatchTransactions`, `SettingsAddBatchCreditors`, `SettingsAddBatchDebtors` |

Alle 19 zugehörigen Pfade binden die fünf Codes stattdessen über die generische Familie
`Request_ErrorCode0`, `Request_ErrorCode3`, `Request_ErrorCode4`, `Request_ErrorCode11`
und `Request_ErrorCode30` ein. Auf Definitionsebene ist `PostingsReservations` also
**nicht** einzigartig, sondern verhält sich wie diese 19 Gruppen. Einzigartig ist allein,
dass zu ihr kein Pfad existiert.

Prüfkommandos gegen `docs/openapi/buchhaltungsbutler-v1.json`:

```bash
SPEC=docs/openapi/buchhaltungsbutler-v1.json

# Antwortebene: Pfade, denen einer der fünf Codes in den responses fehlt (Ergebnis: leer)
jq -r '.paths | to_entries[] | .key as $p
       | ([.value.post.responses | keys[]] | map(capture("\\((?<c>[0-9]+)\\)").c | tonumber)) as $codes
       | select(([0,3,4,11,30] | map(. as $c | ($codes | index($c)) != null) | all) | not) | $p' "$SPEC"

# Definitionsebene: Präfixe ohne jede eigene Definition der fünf Codes (Ergebnis: 22)
jq -r '[.definitions | keys[]] as $defs
       | ($defs | map(select(test("_(Success|ErrorCode[0-9]+)$")) | sub("_(Success|ErrorCode[0-9]+)$";"")) | unique)
       | map(select(. as $p | ([0,3,4,11,30]
           | map(($p + "_ErrorCode" + tostring) as $d | ($defs | index($d)) != null) | any | not)))[]' "$SPEC"

# Pfade, die stattdessen Request_ErrorCode0 referenzieren (Ergebnis: 19)
jq -r '.paths | to_entries[] | .key as $p | .value.post.responses | to_entries[]
       | select(.value.schema."$ref" == "#/definitions/Request_ErrorCode0") | $p' "$SPEC"
```

Ob die Gruppe deshalb zu einer anderen Zeit oder in einem anderen Pflegezustand entstanden
ist als der Rest, lässt sich aus der Spezifikation nicht ableiten. Eine solche Aussage
wäre eine **Annahme** und wird hier ausdrücklich nicht getroffen. Belegt ist nur der
Befund selbst: Definitionen ohne Pfad.

**Live-Test.** Am 2026-09-12 wurde `POST /postings/reservations/get` mit gültigen
Zugangsdaten und gültigem `api_key` aufgerufen, mit dem Body `{"api_key": "..."}`.
Ergebnis:

```http
HTTP/2 404
content-type: text/html; charset=UTF-8
```

Der Antwortkörper war die HTML-Startseite der Webanwendung, keine JSON-Fehlerantwort.

**Schlussfolgerung.** Der Pfad `/postings/reservations/get` existiert unter der API-Basis
`https://webapp.buchhaltungsbutler.de/api/v1` nicht. Die Definitionen sind Überreste
eines geplanten, zurückgezogenen oder intern verbliebenen Funktionsumfangs. Für den
MCP-Server ist die Gruppe ohne Bedeutung und darf nicht implementiert werden.

Die beiden anderen Pfade dieser Gruppe (`/postings/reservations/add` und
`/postings/reservations/delete`) wurden **nicht** getestet, weil ihre Namen eindeutig
schreibend sind und der Test gegen die Produktivbuchhaltung des Nutzers gelaufen wäre.
Ob sie existieren, ist **nicht verifiziert**. Angesichts des 404 beim lesenden Pendant ist
ihre Existenz unwahrscheinlich, aber nicht ausgeschlossen.

### 9.3 Weitere nicht referenzierte Definitionen

Neben den 36 Reservations-Definitionen sind neun weitere Definitionen definiert, aber
in keiner `responses`-Sektion referenziert:

```text
InvoicesCreateDraft_ErrorCode22
PostingsAddTransaction_ErrorCode0
PostingsAddTransaction_ErrorCode30
ReceiptsAdd_ErrorCode0
ReceiptsAdd_ErrorCode30
Request_ErrorCode1
Request_ErrorCode2
Request_ErrorCode10
TransactionsAssignReceipt_ErrorCode7
```

Bemerkenswert daran: `/postings/add/transaction` und `/receipts/add` besitzen zwar eigene
`_ErrorCode0`- und `_ErrorCode30`-Definitionen, ihre `responses` verweisen aber nicht
darauf, sondern auf die gleichnamigen Definitionen eines anderen, fachlich benachbarten
Endpunkts:

| Pfad | Antwort | referenzierte Definition | ungenutzte eigene Definition |
| --- | --- | --- | --- |
| `/postings/add/transaction` | `500 (0)` | `PostingsAddReceipt_ErrorCode0` | `PostingsAddTransaction_ErrorCode0` |
| `/postings/add/transaction` | `504 (30)` | `PostingsAddReceipt_ErrorCode30` | `PostingsAddTransaction_ErrorCode30` |
| `/receipts/add` | `500 (0)` | `ReceiptsUpload_ErrorCode0` | `ReceiptsAdd_ErrorCode0` |
| `/receipts/add` | `504 (30)` | `ReceiptsUpload_ErrorCode30` | `ReceiptsAdd_ErrorCode30` |

Die generische `Request_`-Familie kommt an diesen vier Stellen **nicht** vor. Inhaltlich
sind die Fehlertexte in allen Varianten identisch (`error while processing the request`
beziehungsweise `a timeout occurred while processing the request`), es handelt sich also um
einen Copy-Paste-Fehler in der Spezifikation und nicht um einen Widerspruch in den
ausgelieferten Fehlertexten.

Prüfkommando:

```bash
jq -r '.paths["/postings/add/transaction"].post.responses | to_entries[]
       | select(.key | test("500|504")) | "\(.key) -> \(.value.schema."$ref")"' \
  docs/openapi/buchhaltungsbutler-v1.json
```

Ergebnis (Abrufdatum 2026-09-12):

```text
500 (0) -> #/definitions/PostingsAddReceipt_ErrorCode0
504 (30) -> #/definitions/PostingsAddReceipt_ErrorCode30
```

Dasselbe Kommando mit `.paths["/receipts/add"]` liefert
`#/definitions/ReceiptsUpload_ErrorCode0` und `#/definitions/ReceiptsUpload_ErrorCode30`.

`docs/api/fehlercodes.md` stellt denselben Sachverhalt in der Tabelle "Einzelne verwaiste
Codes bei sonst dokumentierten Endpunkten" identisch dar, samt der jeweils stattdessen
referenzierten Definition. Beide Dateien sagen hier nachprüfbar dasselbe. Nach der
Vorrangregel in `docs/README.md`, Teil 3.2, ist für Fehlercodes und HTTP-Status ohnehin
`docs/api/fehlercodes.md` führend.

`Request_ErrorCode1` (`Api method calls require HTTP requests`) und `Request_ErrorCode2`
(`Api method calls require POST requests`) beschreiben Fälle, die bei korrekter Nutzung
nicht auftreten können, weil jede Anfrage über HTTPS und POST läuft. Ein Client kann sie
kennen, muss sie aber nicht gesondert behandeln.

### 9.4 Vollständige Liste der Hilfsdefinitionen ohne Suffix

Fünfzehn Definitionen tragen weder `_Success` noch `_ErrorCode<N>`. Sie beschreiben
Nutzlastobjekte für die Batch-Endpunkte und werden regulär per `$ref` referenziert:

```text
PostingsFree
Receipt
ReceiptPostings
Receipts
ReceiptsPostings
SettingsCreditor
SettingsCreditors
SettingsDebtor
SettingsDebtors
Transaction
TransactionPostings
TransactionToReceipt
Transactions
TransactionsPostings
TransactionsToReceipts
```

Diese sind die verlässlichste Quelle für die Feldstruktur der jeweiligen Objekte, weil sie
im Gegensatz zu den flachen Parameterlisten ein korrektes JSON-Schema mit `required` und
`example` enthalten. `Receipt` und `Transaction` sollten deshalb als Referenz für die
Typmodellierung herangezogen werden, auch für die Nicht-Batch-Endpunkte.

---

## Anhang: Reproduzierbare Prüfkommandos

Alle Auswertungen dieses Dokuments lassen sich gegen die SPEC nachvollziehen:

```bash
SPEC=/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json

# Alle 54 Pfade
jq -r '.paths | keys[]' "$SPEC"

# Parameter eines Endpunkts (flache Body-Feldliste)
jq '.paths["/receipts/get"].post.parameters' "$SPEC"

# Antwortschema eines Endpunkts
jq '.definitions.ReceiptsGet_Success' "$SPEC"

# Alle Fehlerdefinitionen eines Endpunkts
jq -r '.definitions | keys[] | select(startswith("ReceiptsGet_ErrorCode"))' "$SPEC"

# Zuordnung Fehlercode zu HTTP-Status eines Endpunkts
jq -r '.paths["/receipts/get"].post.responses | keys[]' "$SPEC"

# Limit- und Offset-Konventionen aller Endpunkte
jq -r '.paths | to_entries[] | .key as $p | .value.post.parameters[]?
       | select(.name == "limit" or .name == "offset")
       | "\($p) \(.name) default=\(.default)"' "$SPEC"
```

Die Zahlen aus Abschnitt 9 lassen sich mit den folgenden drei Kommandos nachrechnen. Sie
belegen die Angaben zu den Definitionspräfixen, zu den verwaisten Definitionen und zu
deren Aufteilung, damit ein späterer Leser sie nicht glauben muss. Alle drei benötigen
`bash` (wegen der Prozesssubstitution), `jq` und die Standardwerkzeuge `sort`, `comm`,
`uniq` und `grep`.

```bash
# 1) Zahl der Definitionen je Präfix.
#    Der Präfix ist der Definitionsname ohne das Suffix _Success oder _ErrorCode<N>.
#    Belegt unter anderem: 36 Definitionen unter PostingsReservations,
#    davon 27 Add, 5 Get, 4 Delete.
jq -r '.definitions | keys[] | sub("_(Success|ErrorCode[0-9]+)$"; "")' "$SPEC" \
  | sort | uniq -c | sort -rn

#    Nur die Fehlerdefinitionen je Präfix, ohne _Success.
#    Belegt: PostingsReservationsAdd hat 26 _ErrorCode-Definitionen.
jq -r '.definitions | keys[]
       | select(test("_ErrorCode[0-9]+$")) | sub("_ErrorCode[0-9]+$"; "")' "$SPEC" \
  | sort | uniq -c | sort -rn

#    Zahl der Präfixe insgesamt (nur Definitionen mit Suffix, also ohne die 15
#    Hilfsdefinitionen aus 9.4). Belegt: 58.
jq -r '.definitions | keys[]
       | select(test("_(Success|ErrorCode[0-9]+)$")) | sub("_(Success|ErrorCode[0-9]+)$"; "")' \
  "$SPEC" | sort -u | wc -l

#    Präfixe ohne zugehörigen Pfad. Die Pfade werden dafür in dieselbe CamelCase-Form
#    gebracht. Belegt: neun Präfixe ohne Pfad (Tabelle in 9.1).
comm -23 \
  <(jq -r '.definitions | keys[]
           | select(test("_(Success|ErrorCode[0-9]+)$")) | sub("_(Success|ErrorCode[0-9]+)$"; "")' \
      "$SPEC" | sort -u) \
  <(jq -r '.paths | keys[]' "$SPEC" | sed 's|^/||' \
      | awk -F'[/_-]' '{s="";for(i=1;i<=NF;i++){s=s toupper(substr($i,1,1)) substr($i,2)};print s}' \
      | sort -u)

# 2) Menge der überhaupt nicht per $ref referenzierten Definitionen.
#    Belegt: 45 verwaiste Definitionen.
comm -23 \
  <(jq -r '.definitions | keys[]' "$SPEC" | sort -u) \
  <(jq -r '[.. | objects | select(has("$ref")) | .["$ref"]] | .[]' "$SPEC" \
      | sed 's|#/definitions/||' | sort -u) \
  > /tmp/bb-unreferenced.txt
wc -l < /tmp/bb-unreferenced.txt

# 3) Aufteilung dieser Menge in PostingsReservations und Rest.
#    Belegt: 36 PostingsReservations, 9 übrige (Liste in 9.3).
grep -c '^PostingsReservations' /tmp/bb-unreferenced.txt
grep -vc '^PostingsReservations' /tmp/bb-unreferenced.txt
grep -v '^PostingsReservations' /tmp/bb-unreferenced.txt
```

Live-Aufruf mit Platzhaltern, ausschließlich gegen lesende Endpunkte:

```bash
curl -sS -i -X POST "https://webapp.buchhaltungsbutler.de/api/v1/accounts/get" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"$BB_API_KEY\"}"
```

`BB_API_CLIENT`, `BB_API_SECRET` und `BB_API_KEY` sind Umgebungsvariablen. Echte Werte
gehören nicht in dieses Repository.
