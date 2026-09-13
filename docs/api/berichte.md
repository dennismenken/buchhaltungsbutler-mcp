# Berichte (Reports): BWA, Summen und Salden, Kontenblatt

Dieses Dossier dokumentiert die fünf Report-Endpunkte der BuchhaltungsButler-API in
Version 1.9.1 vollständig:

| Pfad | Art | Kurzbeschreibung |
| --- | --- | --- |
| `/reports/create/bwa` | schreibend | Stößt die Erzeugung einer BWA an |
| `/reports/create/sums` | schreibend | Stößt die Erzeugung einer Summen- und Saldenliste an |
| `/reports/get/bwa` | lesend | Liefert eine zuvor erzeugte BWA |
| `/reports/get/sums` | lesend | Liefert eine zuvor erzeugte Summen- und Saldenliste |
| `/reports/get/sums/ledger` | lesend | Liefert das Kontenblatt eines Buchungskontos |

## Quellen und Abrufdatum

Alle Angaben in diesem Dokument stammen aus einer der folgenden Quellen. Jeder größere
Abschnitt nennt die für ihn maßgebliche Quelle noch einmal ausdrücklich.

| Kürzel | Quelle | Abrufdatum |
| --- | --- | --- |
| **SPEC** | `docs/openapi/buchhaltungsbutler-v1.json`, heruntergeladen von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`, Swagger-2.0-Beschreibung, `info.version` = `1.9.1` | 2026-09-12 |
| **DOC** | `https://app.buchhaltungsbutler.de/docs/api/v1/`, der statische Textteil der offiziellen Doku-Seite des Anbieters; für dieses Dossier maßgeblich die Abschnitte „Authentication", „Customer Selection" und „API limits" | 2026-09-12 |
| **LIVE** | Eigene Aufrufe gegen `https://webapp.buchhaltungsbutler.de/api/v1` mit echten Zugangsdaten, ausschließlich lesende Endpunkte | 2026-09-12 |
| **KB-BWA** | `https://wissen.buchhaltungsbutler.de/hc/de/articles/11473653935005-Eine-Betriebswirtschaftliche-Auswertung-BWA-erstellen-und-exportieren` | 2026-09-12 |
| **KB-SUSA** | `https://wissen.buchhaltungsbutler.de/hc/de/articles/11474193643293-Summen-und-Saldenliste-SuSa-Liste-erstellen-und-exportieren` | 2026-09-12 |
| **KB-LEIST** | `https://wissen.buchhaltungsbutler.de/hc/de/articles/11408182136861-Auswirkungen-eines-abweichenden-Leistungsdatums` | 2026-09-12 |

Die Wissensdatenbank-Artikel (KB-*) beschreiben die Weboberfläche, nicht die API. Sie
sind hier als fachliche Einordnung und als Indiz für das Verhalten der darunterliegenden
Berechnung aufgeführt. Wo sie zur Auslegung der API herangezogen werden, ist das
ausdrücklich gekennzeichnet und als **nicht verifiziert** markiert.

### Die vier Rahmenbedingungen

Für alle fünf Report-Endpunkte gelten dieselben vier Rahmenbedingungen. Sie stehen hier
ausgeschrieben, damit dieses Dossier für sich allein lesbar bleibt und niemand einer
Verweiskette folgen muss:

| Rahmenbedingung | Aussage | Beleg |
| --- | --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` | SPEC (`basePath`, dort formwidrig als vollständige URL gesetzt, siehe Abschnitt 11.1); LIVE, denn jeder in diesem Dossier protokollierte Aufruf ging an diese URL und wurde beantwortet |
| Authentifizierung | HTTP Basic Auth mit dem API Client als Benutzername und dem API Secret als Passwort, **zusätzlich** `api_key` im JSON-Body zur Auswahl des Mandanten | DOC, Abschnitte „Authentication" und „Customer Selection"; durch LIVE bestätigt. SPEC beschreibt die Authentifizierung überhaupt nicht (`securityDefinitions: null`, kein `security`-Objekt) |
| Antwortumschlag | `success` als Wahrheitswert und `message` als Text, dazu die endpunktspezifischen Nutzdaten; im Fehlerfall zusätzlich `error_code` | SPEC (`definitions`); durch LIVE bestätigt |
| Rate Limit | maximal 100 Requests pro Mandant und Minute | DOC, Abschnitt „API limits", wörtlich: „It is only allowed to make a maximum of 100 requests per customer per minute to the API." |

Abschnitt 1 führt jede dieser vier Angaben einzeln aus.

---

## 1. Gemeinsame Grundlagen

Quelle: DOC, SPEC, LIVE.

### 1.1 Transport

- Basis-URL: `https://webapp.buchhaltungsbutler.de/api/v1`
- Methode: ausnahmslos `POST`, auch für rein lesende Endpunkte
- `Content-Type: application/json`
- Antwort: `application/json` (SPEC, `produces`)

Die Datei `buchhaltungsbutler-v1.json` setzt `basePath` auf die vollständige URL
`https://webapp.buchhaltungsbutler.de/api/v1`, obwohl Swagger 2.0 dort einen reinen
Pfad erwartet. Das ist einer von mehreren Formverstößen der Datei (siehe Abschnitt 11.1)
und darf nicht dazu verleiten, `host` und `basePath` naiv zu verketten.

### 1.2 Authentifizierung

Zwei Stufen, beide sind Pflicht:

1. **HTTP Basic Auth** auf Transportebene: Benutzername = API Client, Passwort =
   API Secret.
2. **`api_key` im JSON-Body**: wählt den zu verwaltenden Mandanten aus. Dieses Feld ist
   bei jedem der fünf Report-Endpunkte Pflicht.

Die Swagger-Datei enthält `securityDefinitions: null` und kein `security`-Objekt. Die
Authentifizierung ist dort also überhaupt nicht beschrieben. Die beiden obigen Stufen
stehen stattdessen in DOC: Der Abschnitt „Authentication" beschreibt HTTP Basic Auth nach
RFC 2617 mit dem Wert `<Api Client>:<Api Secret>`, der Abschnitt „Customer Selection" den
`api_key` als Auswahl des zu verwaltenden Mandanten.

Durch LIVE bestätigt ist der **positive** Fall: Jeder in diesem Dossier protokollierte
Aufruf trug beide Stufen zugleich und wurde beantwortet. Was die API antwortet, wenn eine
der beiden Stufen **fehlt**, wurde nicht gemessen und ist damit **nicht verifiziert**; die
SPEC führt dafür `401 (3)` für ungültige Zugangsdaten und `401 (4)` für einen unbekannten
oder nicht zugelassenen `api_key` an allen 54 Endpunkten.

### 1.3 Antwortumschlag

Erfolg:

```json
{ "success": true, "message": "", "...": "endpunktspezifische Nutzdaten" }
```

Fehler:

```json
{ "success": false, "error_code": 7, "message": "report was not found" }
```

Die Report-Endpunkte verwenden **nicht** den `rows`/`data`-Umschlag der Listenendpunkte.
Sie liefern stattdessen benannte Objekte auf oberster Ebene: `id_by_customer` bei den
create-Endpunkten, `report` bei `/reports/get/bwa` und `/reports/get/sums`,
`report_sums_postingaccount_ledger` bei `/reports/get/sums/ledger`. Wer generisch auf
`data` zugreift, läuft bei Berichten ins Leere. Bestätigt durch LIVE für
`/reports/get/sums/ledger`.

### 1.4 Rate Limit

Maximal 100 Requests pro Mandant und Minute. DOC sagt es im Abschnitt „API limits"
wörtlich: „It is only allowed to make a maximum of 100 requests per customer per minute
to the API." Das Limit gilt damit **pro Mandant**, nicht pro API Client: Mehrere
Anwendungen, die denselben Mandanten bedienen, teilen sich ein Kontingent. Die Swagger-Datei
selbst enthält kein globales Rate-Limit-Feld; das einzige Limit, das dort im Text
auftaucht, ist ein endpunktspezifisches `max 10 requests per minute` bei
`/receipts/upload`, das für Berichte nicht gilt.

Praktisch relevanter als das Zahlenlimit ist die Laufzeit: Die create-Endpunkte arbeiten
asynchron, `/reports/get/sums/ledger` berechnet on the fly und kann laut SPEC bei Konten
mit vielen Buchungen lange dauern.

### 1.5 HTTP-Status und `error_code`

Die Swagger-Datei kodiert Status und Fehlercode gemeinsam im Schlüssel des
`responses`-Objekts, zum Beispiel `"401 (3)"` oder `"400 (12)"`. Der erste Wert ist der
HTTP-Status, der Wert in Klammern der `error_code` im Body.

Global, das heißt an allen fünf Endpunkten identisch:

| HTTP | error_code | message (aus SPEC) | Bedeutung |
| --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Fehler |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Zugangsdaten falsch |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` unbekannt, passt nicht zum API Client oder Rechte fehlen |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv |
| 400 | 23 | `no post and files content received or declined` | Kein oder kein verwertbarer Request-Body |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung serverseitig |

Widerspruch in der SPEC: Für `error_code` 4 lautet die `message` in der Definition
`Request_ErrorCode4` `customer not found or invalid api client for customer or
insufficient privileges`, die Beschreibung derselben Antwort im `responses`-Objekt der
Pfade dagegen nur `customer not found or insufficient privileges`. Der Teil
`invalid api client for customer` fehlt in der kürzeren Variante. Für die Auswertung ist
die Definition maßgeblich, weil sie den tatsächlichen Body beschreibt.

**Sehr wichtig:** `error_code` ist **nicht global eindeutig**. Derselbe Zahlenwert
bedeutet an unterschiedlichen Endpunkten Unterschiedliches. Beispiele aus den hier
dokumentierten Endpunkten:

| error_code | bei `/reports/create/sums` | bei `/reports/get/sums` | bei `/reports/get/sums/ledger` |
| --- | --- | --- | --- |
| 6 | invalid date_from specified | invalid report_id_by_customer specified | (nicht belegt) |
| 7 | invalid date_to specified | report was not found | (nicht belegt) |
| 10 | invalid file_csv specified | (nicht belegt) | invalid postingaccount_number specified |
| 12 | report generation already in progress | (nicht belegt) | invalid date_from specified |
| 13 | invalid archive_export specified | (nicht belegt) | invalid date_to specified |

Eine Fehlerbehandlung darf `error_code` daher nur zusammen mit dem aufgerufenen Pfad
interpretieren. Nur die Codes 0, 3, 4, 11, 23 und 30 sind endpunktübergreifend stabil.

### 1.6 Eigenheit der Swagger-Datei bei Body-Parametern

Alle Body-Felder stehen in der Datei als einzelne Einträge mit `"in": "body"` und
eigenem `type`, statt gebündelt in einem gemeinsamen `schema`. Das ist kein valides
Swagger 2.0. Fachlich sind alle diese Einträge Felder **eines** JSON-Bodys. Die
Parametertabellen in diesem Dokument lösen das bereits auf.

### 1.7 Beispielwerte in `enum`

In den Definitionen unter `.definitions` stehen Beispielwerte in `enum` mit genau einem
Eintrag, etwa `"enum": ["123"]` für `id_by_customer`. Das sind **Beispiele**, keine
erlaubten Wertemengen. Ein Codegenerator, der daraus String-Literal-Typen oder
Validierungen ableitet, erzeugt falschen Code.

---

## 2. Das zweistufige Muster create und get

Quelle: SPEC (Beschreibungstexte der fünf Endpunkte), LIVE, ergänzend KB-BWA und KB-SUSA.

### 2.1 Ablauf

BWA und Summen- und Saldenliste folgen demselben Muster:

1. `/reports/create/<typ>` mit Zeitraum aufrufen. Die Antwort enthält
   `id_by_customer` des angelegten Berichts.
2. Warten, bis die Erzeugung abgeschlossen ist. Die SPEC formuliert ausdrücklich:
   *„The report is generated asynchronously in the background."*
3. `/reports/get/<typ>` mit `report_id_by_customer` = der zuvor erhaltenen
   `id_by_customer` aufrufen.

Solange die Erzeugung läuft, antwortet der get-Endpunkt mit HTTP 400 und `error_code` 8
(`report generation has not been finished yet`). Es gibt keinen eigenen Status-Endpunkt
und kein Callback; das Warten ist reines Polling gegen den get-Endpunkt.

Das Kontenblatt `/reports/get/sums/ledger` ist ausdrücklich **nicht** Teil dieses Musters.
SPEC: *„In contrast to the report itself the ledger is created on the fly, so no report
has to be created beforehand."* Das ist durch LIVE bestätigt: Der Abruf eines
Kontenblatts lieferte HTTP 200 mit Daten, obwohl im selben Mandanten kein
Summen-und-Salden-Bericht mit `id_by_customer` 1 existierte.

### 2.2 Gültigkeit und Lebensdauer eines Berichts

Aus der SPEC lassen sich vier harte Aussagen belegen:

1. **Ein Bericht pro Typ.** `/reports/get/bwa` und `/reports/get/sums`:
   *„Note that creating a new report of the same type replaces the previously created
   one."* Es gibt also keinen Bestand mehrerer paralleler BWA-Berichte. Der zuletzt
   erzeugte ersetzt den vorherigen.
2. **Kein paralleles Erzeugen.** `/reports/create/bwa` und `/reports/create/sums`:
   *„A new report may only be requested once the generation of a previously requested
   report of the same type has been finished."* Andernfalls HTTP 400 mit `error_code` 12
   (`report generation already in progress`). BWA und Summenliste sind dabei
   unterschiedliche Typen und blockieren sich gegenseitig nicht; das ist eine
   naheliegende, aber **nicht verifizierte** Auslegung von „of the same type".
3. **Dateien können verfallen.** Die Beschreibung des `files`-Objekts bei beiden
   get-Endpunkten nennt drei Gründe für `null`: die Datei wurde beim Erzeugen nicht
   angefordert, sie wird noch erzeugt, *„or because it is not available anymore"*. Die
   Dateien haben also eine begrenzte Verweildauer. **Wie lange, sagt die SPEC nicht.**
   Eine konkrete Frist ist nicht verifiziert.
4. **Der Bericht selbst kann verschwinden.** `error_code` 7 (`report was not found`) ist
   der Fall, in dem zu einer `report_id_by_customer` kein Bericht existiert. Ob das nur
   bei nie erzeugten Berichten oder auch bei abgelaufenen auftritt, ist aus der SPEC
   **nicht ableitbar**.

### 2.3 Was passiert, wenn `get` ohne vorheriges `create` aufgerufen wird

Verifiziert durch LIVE am 2026-09-12. Es existierte kein per API erzeugter Bericht.

`/reports/get/bwa` mit `report_id_by_customer` = 1:

```
HTTP 400
{"success":false,"error_code":7,"message":"report was not found"}
```

`/reports/get/sums` ohne `report_id_by_customer`:

```
HTTP 400
{"success":false,"error_code":6,"message":"invalid report_id_by_customer specified"}
```

Daraus folgt für die Implementierung:

- Ohne vorheriges `create` gibt es nichts abzuholen. Der get-Endpunkt liefert keinen
  impliziten „letzten" Bericht, sondern verlangt eine konkrete Id.
- `error_code` 6 bedeutet „Feld fehlt oder ist formal ungültig", `error_code` 7 bedeutet
  „Feld war formal in Ordnung, es gibt aber keinen solchen Bericht". Die beiden Fälle
  sind sauber getrennt.
- Berichte, die in der Weboberfläche erzeugt wurden, sind über die API offenbar nicht mit
  fortlaufenden kleinen Ids erreichbar. Das ist aus einem einzelnen Negativtest mit
  Id 1 aber **nicht bewiesen**, nur naheliegend.

### 2.4 Warteschema für Implementierungen

Da die SPEC keine Laufzeitangaben macht, ist jedes konkrete Polling-Intervall eine
Annahme. Empfehlung, ausdrücklich als **Annahme** gekennzeichnet: exponentiell wachsendes
Intervall, beginnend bei etwa zwei Sekunden, gedeckelt bei etwa zehn Sekunden, mit einem
harten Gesamtlimit. Abbruchbedingung ist ausschließlich `error_code` 8; jeder andere
Fehler beendet das Warten sofort. Das Rate Limit von 100 Requests pro Mandant und Minute
ist dabei einzuhalten, auch wenn mehrere Agentenläufe parallel arbeiten.

KB-BWA und KB-SUSA nennen für die Weboberfläche eine E-Mail-Benachrichtigung nach
Abschluss der Berechnung. Ein solcher Mechanismus ist für die API **nicht** dokumentiert
und darf nicht vorausgesetzt werden.

---

## 3. Fachliche Einordnung

Quelle dieses Abschnitts: KB-BWA, KB-SUSA, KB-LEIST sowie allgemeines
Rechnungswesen-Fachwissen. Die Abgrenzung ist jeweils markiert.

### 3.1 Betriebswirtschaftliche Auswertung (BWA)

Die BWA ist eine kurzfristige Erfolgsrechnung. Sie fasst die Erfolgskonten eines
Zeitraums zu betriebswirtschaftlichen Kennzahlen zusammen und beantwortet die Frage
„Wie ist das Unternehmen im Zeitraum X gelaufen?".

Belegte Aussagen aus KB-BWA:

- Die BWA fasst die wesentlichen betriebswirtschaftlichen Kennzahlen zusammen und dient
  der kurzfristigen Erfolgsrechnung.
- Sie dient in BuchhaltungsButler außerdem als Grundlage für die Ermittlung des
  Jahresüberschusses beziehungsweise Jahresfehlbetrags in der Auswertung Bilanz.
- *„Die BWA, die Sie in BuchhaltungsButler generieren können, entspricht der klassischen
  Struktur und lässt sich nicht weiter individualisieren."* Es gibt also genau ein
  Schema, keine Mandantenkonfiguration.
- Nur **bestätigte Buchungen** fließen in die Berechnung ein. Bei unbestätigten Buchungen
  gibt die Oberfläche eine Warnung aus. Das korrespondiert mit dem Feld
  `uncompletedPostingsCount` in der API-Antwort.
- In der BWA werden Umsatzsteuer und Vorsteuer **nicht** berücksichtigt, auch nicht bei
  Einnahmen-Überschuss-Rechnern. Deshalb weichen BWA und EÜR voneinander ab.
- Die Oberfläche kann die BWA optional nach Kostenstellen aufschlüsseln. Die API-Antwort
  enthält passend dazu ein Feld `usedCostLocations`. Ob es dafür in der API einen
  Schalter gibt, ist **nicht der Fall**: `/reports/create/bwa` kennt nur `api_key`,
  `date_from` und `date_to`.

Die klassische Zeilenstruktur einer BWA (allgemeines Fachwissen, **nicht** gegen die
tatsächliche API-Antwort verifiziert, da hierfür ein schreibender `create`-Aufruf nötig
wäre) umfasst üblicherweise: Umsatzerlöse, Bestandsveränderungen, Gesamtleistung,
Material- beziehungsweise Wareneinsatz, Rohertrag, sonstige betriebliche Erlöse,
betrieblicher Rohertrag, danach die Kostenblöcke Personalkosten, Raumkosten, betriebliche
Steuern, Versicherungen und Beiträge, Kfz-Kosten, Werbe- und Reisekosten, Kosten der
Warenabgabe, Abschreibungen, Reparatur und Instandhaltung, sonstige Kosten, in Summe die
Gesamtkosten, daraus das Betriebsergebnis, anschließend neutraler Aufwand und Ertrag,
Zinsen, Steuern vom Einkommen und Ertrag und schließlich das vorläufige Ergebnis.

Welche Gruppen- und Klassennamen die API tatsächlich liefert, ist **nicht verifiziert**.
Die SPEC sagt nur, dass `groups` ihre Klassen enthalten und diese wiederum ihre
Buchungskonten, und dass jede Ebene ihren Betrag als `amountsSum` bereitstellt.

### 3.2 Summen- und Saldenliste (SuSa)

Die Summen- und Saldenliste ist die kontenweise Aufstellung aller Buchungskonten mit
Anfangssaldo, Bewegung im Zeitraum und Endsaldo. Sie ist die technische Basis, aus der
BWA, GuV und Bilanz abgeleitet werden.

Belegte Aussagen aus KB-SUSA:

- *„Die Summen- und Saldenliste umfasst all Ihre Buchungskonten und gibt einen Überblick
  über den Stand von Erfolg- und Bestandskonten innerhalb einer gewählten Periode."*
- Für eine aussagekräftige Liste müssen die **Anfangssalden** der Buchungskonten erfasst
  sein. Fehlen EB-Werte, sind die Bestandskonten unbrauchbar, die Erfolgskonten dagegen
  weiterhin sinnvoll.
- Nur **bestätigte Buchungen** werden in die Berechnung aufgenommen.
- Je nach Kontenart werden Konten zum Ende des Wirtschaftsjahres genullt (Erfolgskonten)
  oder fortgeschrieben (Bestandskonten).
- Der CSV-Export ist ein ZIP-Archiv mit der SuSa-Übersicht plus je einer CSV-Datei pro
  bebuchtem Kontenblatt der Periode. Das entspricht dem API-Parameter `archive_export`.

Die API erzeugt die Summenliste laut SPEC **immer für alle** Buchungskonten des Mandanten
(*„The report is always created for all of the customer's postingaccounts."*). Die in
KB-SUSA beschriebene Kontenauswahl der Oberfläche gibt es in der API nicht.

### 3.3 Kontenblatt (Ledger)

Das Kontenblatt ist die Einzelaufstellung aller Buchungen eines einzelnen Buchungskontos
im Zeitraum, in zeitlicher Reihenfolge, jeweils mit laufendem Saldo. Es ist die
Drilldown-Ebene unter der Summen- und Saldenliste und das Werkzeug, mit dem man einen
auffälligen Kontosaldo auf einzelne Geschäftsvorfälle zurückführt.

Belegte Aussage aus KB-LEIST, für die Auslegung der API-Ergebnisse wichtig:

- *„Die Darstellung der Geschäftsvorfälle in den Kontenblättern erfolgt grundsätzlich nach
  Rechnungsdatum und nicht nach Leistungsdatum."*
- *„Die Steuer wird in der Auswertung nicht periodengerecht, sondern zum Rechnungsdatum
  dargestellt. Hierdurch kann es zu Abweichungen zwischen der Auswertung
  Umsatzsteuer-Voranmeldung und den Werten in den Kontenblättern kommen."*

Für die BWA gilt laut KB-LEIST das Gegenteil: *„Die Auswertung erfolgt nach dem
Leistungsdatum, das Rechnungsdatum wird aber in der Auswertung mit aufgeführt."*
Ausdrücklich nur bei debitorisch und kreditorisch gebuchten Belegen.

Daraus ergibt sich ein Widerspruch zur API, der in Abschnitt 11.3 behandelt wird: Die
API-Endpunkte für SuSa und Kontenblatt haben einen Schalter `base`, mit dem man zwischen
Buchungsdatum und Leistungsdatum wählt; `/reports/create/bwa` hat diesen Schalter nicht.

---

## 4. `/reports/create/bwa`

Stößt die Erzeugung einer betriebswirtschaftlichen Auswertung für einen Zeitraum an und
gibt deren `id_by_customer` zurück.

### 4.1 Einordnung

> **SCHREIBEND.** Der Aufruf erzeugt serverseitig einen Bericht und **ersetzt dabei den
> zuvor erzeugten BWA-Bericht desselben Mandanten**. Er darf in einem rein lesenden
> Kontext nicht ausgeführt werden. Dieser Endpunkt wurde im Rahmen dieser Dokumentation
> **nicht** live aufgerufen. Alle Angaben stammen aus der SPEC.

### 4.2 Parameter

Vollständigkeitsprüfung: `jq '.paths["/reports/create/bwa"].post.parameters | length'`
ergibt **3**. Alle drei sind hier dokumentiert.

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Der für den zu verwaltenden Mandanten registrierte API Key. Wählt aus, für welchen Mandanten der Bericht erzeugt wird. | Mandantenspezifischer Schlüssel | Zeichenkette, Format in der SPEC nicht näher beschrieben |
| `date_from` | string | ja | – | Erster Tag des Zeitraums, für den der Bericht erzeugt wird. | Gültiges Kalenderdatum; Ober- und Untergrenze in der SPEC nicht genannt | `YYYY-MM-DD`, Beispiel aus der SPEC: `2026-01-01` |
| `date_to` | string | ja | – | Letzter Tag des Zeitraums, für den der Bericht erzeugt wird. Der Tag ist eingeschlossen. | Gültiges Kalenderdatum | `YYYY-MM-DD`, Beispiel aus der SPEC: `2026-03-31` |

Verschachtelte Objekt- oder Array-Parameter: **keine**. Alle drei Felder sind Skalare
auf oberster Ebene des JSON-Bodys.

Nicht vorhanden, obwohl man es erwarten könnte: `base`, `file_pdf`, `file_csv`,
`archive_export`, ein Kostenstellenschalter. Siehe Abschnitt 4.6.

### 4.3 Erfolgsantwort

Definition `ReportsCreateBwa_Success`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Immer `true` im Erfolgsfall |
| `message` | string | Leer |
| `id_by_customer` | string | Die mandantenbezogene Id des angelegten Berichts. **Wird als String geliefert**, obwohl `/reports/get/bwa` sie als `integer` erwartet. Beispielwert in der SPEC: `"123"` |

Es gibt **kein** `data`- und kein `rows`-Feld.

Die Antwort sagt nichts darüber aus, ob die Erzeugung bereits abgeschlossen ist. Sie
bestätigt nur die Annahme des Auftrags.

### 4.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 400 | 6 | `invalid date_from specified` | `date_from` fehlt, ist kein Datum oder liegt außerhalb des zulässigen Bereichs | Format `YYYY-MM-DD` prüfen, führende Nullen sicherstellen, kein Zeitanteil |
| 400 | 7 | `invalid date_to specified` | Dasselbe für `date_to` | Wie oben. Zusätzlich prüfen, ob `date_to` nicht vor `date_from` liegt; die SPEC nennt keinen eigenen Code für vertauschte Grenzen, sodass dieser Fall vermutlich hier landet (**nicht verifiziert**) |
| 400 | 12 | `report generation already in progress` | Es läuft bereits die Erzeugung eines BWA-Berichts für diesen Mandanten | Warten, bis der laufende Bericht fertig ist. Fertigstellung erkennt man daran, dass `/reports/get/bwa` mit der Id des laufenden Berichts nicht mehr `error_code` 8 liefert. Keine Wiederholung im engen Takt, sonst Rate Limit |
| 400 | 23 | `no post and files content received or declined` | Kein oder kein verwertbarer Request-Body | `Content-Type: application/json` setzen und den Body tatsächlich senden |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | API Client und API Secret prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` unbekannt, gehört nicht zum API Client oder Rechte reichen nicht | `api_key` prüfen, Rechte des API Clients prüfen |
| 403 | 11 | `customer has no active status` | Mandant ist nicht aktiv | Keine technische Abhilfe, Mandantenstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen mit Backoff, bei Dauerfehler Support |
| 504 | 30 | `a timeout occurred while processing the request` | Serverseitige Zeitüberschreitung | Zeitraum verkleinern und erneut versuchen |

### 4.5 curl-Beispiel

Alle Zugangsdaten sind Platzhalter. Dieser Aufruf ist **schreibend**.

```bash
# Platzhalter, keine echten Zugangsdaten
API_CLIENT="IHR_API_CLIENT"
API_SECRET="IHR_API_SECRET"
API_KEY="IHR_API_KEY"

curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/reports/create/bwa" \
  -u "${API_CLIENT}:${API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "date_from": "2026-01-01",
        "date_to": "2026-03-31"
      }'
```

Erwartete Antwort (Struktur nach SPEC, Werte als Beispiel):

```json
{ "success": true, "message": "", "id_by_customer": "123" }
```

### 4.6 Fallstricke und Besonderheiten

1. **Der Endpunkt hat keine Dateiparameter, der zugehörige get-Endpunkt aber ein
   `files`-Objekt.** `/reports/get/bwa` beschreibt `files` mit den Schlüsseln `csv` und
   `pdf` und begründet den Wert `null` unter anderem damit, die Datei sei *„not requested
   when the report was created"*. Es gibt in `/reports/create/bwa` jedoch **keinen
   Parameter**, mit dem sich eine Datei anfordern ließe. Entweder ist die Beschreibung
   von `/reports/get/bwa` aus `/reports/get/sums` kopiert, oder `/reports/create/bwa`
   fehlt ein dokumentierter Parameter. **Die Auflösung dieses Widerspruchs ist nicht
   verifiziert.** Für die Implementierung bedeutet das: Über die API sind BWA-Dateien
   vermutlich nie verfügbar, `files.csv` und `files.pdf` sind dann stets `null`.
2. **Kein `base`-Parameter.** Anders als `/reports/create/sums` und
   `/reports/get/sums/ledger` bietet dieser Endpunkt keine Wahl zwischen Buchungsdatum
   und Leistungsdatum. KB-LEIST sagt für die Weboberfläche, die BWA werte nach dem
   Leistungsdatum aus. Ob die API dasselbe tut, ist **nicht verifiziert**. Ein Agent darf
   BWA-Zahlen und SuSa-Zahlen daher nicht ungeprüft gegeneinander rechnen.
3. **Kein Kostenstellenschalter.** Die Antwort enthält `usedCostLocations`, der
   create-Aufruf bietet aber keine Möglichkeit, die Aufschlüsselung nach Kostenstellen
   ein- oder auszuschalten, die KB-BWA für die Oberfläche beschreibt.
4. **Zerstörend gegenüber dem Vorgängerbericht.** Jeder erfolgreiche Aufruf entwertet die
   zuvor ausgegebene `id_by_customer`. Wer parallel arbeitet, muss das serialisieren.
5. **Typwechsel bei `id_by_customer`.** Rückgabe als String, Eingabe beim get-Endpunkt
   als Integer. Ein striktes Typsystem muss hier konvertieren.
6. **Der Zeitraum ist beidseitig einschließend**, laut Formulierung *„The last day of the
   period"*. Für ein volles Quartal also `2026-01-01` bis `2026-03-31`, nicht bis
   `2026-04-01`.
7. **Zeitraumlänge.** KB-BWA weist darauf hin, dass die Erzeugung bei großen Zeiträumen an
   der Dateigröße scheitern kann, und empfiehlt, einen kürzeren Zeitraum zu testen. Für
   die API ist das nicht dokumentiert, dürfte aber denselben Berechnungskern betreffen
   (**Annahme**).

---

## 5. `/reports/create/sums`

Stößt die Erzeugung einer Summen- und Saldenliste für einen Zeitraum an, optional mit
zusätzlichen Exportdateien, und gibt deren `id_by_customer` zurück.

### 5.1 Einordnung

> **SCHREIBEND.** Der Aufruf erzeugt serverseitig einen Bericht und **ersetzt den zuvor
> erzeugten Summen-und-Salden-Bericht desselben Mandanten**. Nicht live aufgerufen. Alle
> Angaben stammen aus der SPEC.

### 5.2 Parameter

Vollständigkeitsprüfung: `jq '.paths["/reports/create/sums"].post.parameters | length'`
ergibt **7**. Alle sieben sind hier dokumentiert.

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Der für den zu verwaltenden Mandanten registrierte API Key | Mandantenspezifischer Schlüssel | Zeichenkette |
| `date_from` | string | ja | – | Erster Tag des Auswertungszeitraums | Gültiges Kalenderdatum | `YYYY-MM-DD`, Beispiel `2026-01-01` |
| `date_to` | string | ja | – | Letzter Tag des Auswertungszeitraums, eingeschlossen | Gültiges Kalenderdatum | `YYYY-MM-DD`, Beispiel `2026-03-31` |
| `base` | string | nein | `date` | Datum, nach dem die Buchungen dem Zeitraum zugeordnet werden | Genau zwei Werte: `date` (Buchungsdatum) oder `date_delivery_else_date` (Leistungsdatum, ersatzweise Buchungsdatum) | Kleinschreibung wie angegeben |
| `file_pdf` | boolean | nein | `false` | Erzeugt zusätzlich eine PDF-Datei zum Bericht | `true` oder `false` | JSON-Boolean. In der SPEC steht der Default fälschlich als String `"false"` |
| `file_csv` | boolean | nein | `false` | Erzeugt zusätzlich eine CSV-Datei zum Bericht | `true` oder `false` | JSON-Boolean, Default in SPEC als String `"false"` |
| `archive_export` | boolean | nein | `false` | Erzeugt zusätzlich ein ZIP-Archiv, das die CSV-Datei **und die Kontenblätter** aller bebuchten Konten enthält | `true` oder `false` | JSON-Boolean, Default in SPEC als String `"false"` |

Verschachtelte Objekt- oder Array-Parameter: **keine**.

Zur Semantik von `base`, wörtlich aus der SPEC: *„The date the postings are taken into
account by. Can be either 'date' (Buchungsdatum) or 'date_delivery_else_date'
(Buchungs- und Leistungsdatum)."* Der zweite Wert bedeutet also: nimm das Leistungsdatum,
sofern vorhanden, sonst das Buchungsdatum.

Bemerkenswert: Es gibt **keinen** Parameter zur Kontenauswahl. Die SPEC sagt ausdrücklich
*„The report is always created for all of the customer's postingaccounts."*

### 5.3 Erfolgsantwort

Definition `ReportsCreateSums_Success`, strukturell identisch zu
`ReportsCreateBwa_Success`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Immer `true` im Erfolgsfall |
| `message` | string | Leer |
| `id_by_customer` | string | Mandantenbezogene Id des angelegten Berichts, als String. Beispielwert `"123"` |

### 5.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 400 | 6 | `invalid date_from specified` | `date_from` fehlt oder ist ungültig | Format `YYYY-MM-DD` prüfen |
| 400 | 7 | `invalid date_to specified` | `date_to` fehlt oder ist ungültig | Wie oben, zusätzlich Reihenfolge der Grenzen prüfen |
| 400 | 8 | `invalid base specified` | `base` hat einen anderen Wert als `date` oder `date_delivery_else_date` | Exakt einen der beiden Werte senden oder das Feld weglassen |
| 400 | 9 | `invalid file_pdf specified` | `file_pdf` ist kein Boolean | Echtes JSON-Boolean senden, nicht `"true"` als String |
| 400 | 10 | `invalid file_csv specified` | `file_csv` ist kein Boolean | Wie oben |
| 400 | 12 | `report generation already in progress` | Es läuft bereits die Erzeugung eines Summen-und-Salden-Berichts | Warten, bis der laufende Bericht fertig ist |
| 400 | 13 | `invalid archive_export specified` | `archive_export` ist kein Boolean | Wie oben |
| 400 | 23 | `no post and files content received or declined` | Kein oder kein verwertbarer Body | `Content-Type` und Body prüfen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` passt nicht oder Rechte fehlen | `api_key` und Rechte prüfen |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv | Mandantenstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Mit Backoff wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zeitraum verkleinern, `archive_export` abschalten |

Die Fehlercodes 9, 10 und 13 zeigen: Die Booleans werden serverseitig validiert
(*„If specified, the field will be validated."*). Es gibt keinen Fehlercode 11 auf
Endpunktebene, weil 11 global für `customer has no active status` belegt ist.

### 5.5 curl-Beispiel

Dieser Aufruf ist **schreibend**.

```bash
# Platzhalter, keine echten Zugangsdaten
API_CLIENT="IHR_API_CLIENT"
API_SECRET="IHR_API_SECRET"

curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/reports/create/sums" \
  -u "${API_CLIENT}:${API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "date_from": "2026-01-01",
        "date_to": "2026-03-31",
        "base": "date",
        "file_pdf": false,
        "file_csv": true,
        "archive_export": false
      }'
```

### 5.6 Fallstricke und Besonderheiten

1. **`archive_export` heißt in der Antwort `csv_archive`.** Der Parameter beim Erzeugen
   und der Schlüssel im `files`-Objekt von `/reports/get/sums` tragen unterschiedliche
   Namen für dieselbe Sache. Eine naive Zuordnung über gleiche Feldnamen schlägt fehl.
2. **`archive_export` enthält die Kontenblätter.** Wer alle Kontenblätter eines Zeitraums
   braucht, bekommt sie so in einem Zug, statt `/reports/get/sums/ledger` je Konto
   aufzurufen. Der Preis: Der Inhalt kommt als base64-kodiertes ZIP, muss entpackt und
   CSV-geparst werden, und der Aufruf ist schreibend. KB-SUSA bestätigt den Aufbau des
   Archivs für die Oberfläche: Übersicht plus je eine CSV pro bebuchtem Kontenblatt.
3. **Default von `base` ist `date`, nicht das Leistungsdatum.** Das weicht von der BWA-
   Logik der Oberfläche ab (KB-LEIST: BWA wertet nach Leistungsdatum aus). Wer BWA und
   SuSa vergleichen will, sollte `base` bewusst setzen und die Wahl dokumentieren.
4. **Booleans als echte Booleans senden.** Die SPEC gibt die Defaults als Strings
   (`"false"`) an. Das ist ein Formfehler der Datei. Die Fehlercodes 9, 10 und 13 legen
   nahe, dass der Server echte Booleans erwartet (**nicht verifiziert**, da der Endpunkt
   nicht aufgerufen wurde).
5. **Immer alle Konten.** Es gibt keine Filterung auf einzelne Buchungskonten. Bei großen
   Mandanten wird der Bericht entsprechend umfangreich. Filtern muss der Client.
6. **Kein eigener Fehlercode für eine ungültige Zeitraumkombination.** Vertauschte oder
   sehr lange Zeiträume landen vermutlich in 6, 7 oder 30. **Nicht verifiziert.**
7. **Zerstörend gegenüber dem Vorgängerbericht**, siehe Abschnitt 2.2.

---

## 6. `/reports/get/bwa`

Liefert eine zuvor erzeugte betriebswirtschaftliche Auswertung samt optionaler Dateien.

### 6.1 Einordnung

> **LESEND.** Der Aufruf verändert keinen Zustand. Er wurde live verifiziert, allerdings
> nur im Negativfall, weil im Testmandanten kein per API erzeugter BWA-Bericht existierte
> und `create` in diesem Auftrag ausgeschlossen war.

### 6.2 Parameter

Vollständigkeitsprüfung: `jq '.paths["/reports/get/bwa"].post.parameters | length'`
ergibt **3**. Alle drei sind hier dokumentiert.

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Der für den zu verwaltenden Mandanten registrierte API Key | Mandantenspezifischer Schlüssel | Zeichenkette |
| `report_id_by_customer` | integer | ja | – | Die `id_by_customer` des Berichts, wie sie `/reports/create/bwa` zurückgegeben hat | Positive ganze Zahl | Ganzzahl. Achtung: `create` liefert den Wert als **String** |
| `get_files` | boolean | nein | `false` | Wenn `true`, werden die Dateien des Berichts base64-kodiert mitgeliefert | `true` oder `false` | JSON-Boolean, Default in SPEC als String `"false"` |

Verschachtelte Objekt- oder Array-Parameter: **keine**.

### 6.3 Erfolgsantwort

Definition `ReportsGetBwa_Success`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Immer `true` im Erfolgsfall |
| `message` | string | Leer |
| `report` | object | Die eigentlichen Berichtsdaten, siehe unten |
| `files` | object | Nur enthalten, wenn `get_files` gesetzt wurde. Schlüssel `csv` und `pdf`, jeweils base64-kodierter Dateiinhalt oder `null` |

Struktur von `report`, wörtlich nach SPEC. Die Feldnamen stehen dort als Fließtext, nicht
als eigenes Schema. Sie sind daher **nicht typisiert und nicht live verifiziert**.

| Schlüssel in `report` | Bedeutung laut SPEC | Anmerkung |
| --- | --- | --- |
| `integrityError` | Kennzeichen, dass die Daten des Berichts nicht konsistent sind | Typ nicht angegeben. Bei `/reports/get/sums/ledger` ist das gleichnamige Feld live ein Boolean. Übertragung auf die BWA ist eine **Annahme** |
| `standardChart` | Der zugrundeliegende Standardkontenrahmen | Live im Kontenblatt als Kleinbuchstaben-String beobachtet, dort `skr03`. Für die BWA **nicht verifiziert** |
| `usedCostLocations` | Die im Bericht verwendeten Kostenstellen | Struktur nicht beschrieben |
| `usedPostingaccountsNumbers` | Die im Bericht verwendeten Buchungskontonummern | Struktur nicht beschrieben |
| `postingsRecordsCount` | Anzahl der berücksichtigten Buchungssätze | Plausibilitätsmaß |
| `uncompletedPostingsCount` | Anzahl nicht abgeschlossener beziehungsweise unbestätigter Buchungen | **Wichtig.** KB-BWA sagt, dass nur bestätigte Buchungen einfließen. Ist dieser Wert größer null, ist die BWA unvollständig, und ein Agent muss das ausweisen statt die Zahlen als endgültig zu präsentieren |
| `groups` | Die BWA-Gruppen | Jede Gruppe enthält ihre Klassen, jede Klasse ihre Buchungskonten |
| `totals` | Die Summenzeilen des Berichts | Struktur nicht beschrieben |

Zur Betragsdarstellung sagt die SPEC wörtlich: *„Every group, class, postingaccount and
total provides its amount as the unformatted value 'amountsSum'."* Auf jeder Ebene der
Hierarchie steht also ein Feld `amountsSum`. „Unformatted" heißt: ohne
Tausendertrennzeichen und ohne Währungssymbol. Ob der Wert als Zahl oder als
Zahlen-String geliefert wird, ist **nicht verifiziert**; im Kontenblatt treten live beide
Varianten nebeneinander auf (siehe Abschnitt 8.6).

Vorzeichenkonvention: **nicht dokumentiert und nicht verifiziert.** Ob Aufwendungen
negativ oder positiv geliefert werden, lässt sich aus der SPEC nicht ableiten. Eine
Implementierung darf hier nichts annehmen, sondern muss es beim ersten echten Bericht
feststellen.

### 6.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 400 | 6 | `invalid report_id_by_customer specified` | Feld fehlt, ist leer oder keine gültige Id | Feld setzen, Ganzzahl senden. **Live verifiziert** als Antwort auf einen Aufruf ohne dieses Feld (an `/reports/get/sums`, identische Semantik) |
| 400 | 7 | `report was not found` | Formal gültige Id, aber kein solcher Bericht vorhanden | Erst `/reports/create/bwa` aufrufen und die dort zurückgegebene Id verwenden. **Live verifiziert** |
| 400 | 8 | `report generation has not been finished yet` | Bericht existiert, wird aber noch berechnet | Warten und erneut abfragen, siehe Abschnitt 2.4 |
| 400 | 9 | `invalid get_files specified` | `get_files` ist kein Boolean | Echtes JSON-Boolean senden |
| 400 | 23 | `no post and files content received or declined` | Kein oder kein verwertbarer Body | `Content-Type` und Body prüfen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` passt nicht oder Rechte fehlen | `api_key` und Rechte prüfen |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv | Mandantenstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Mit Backoff wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Ohne `get_files` erneut versuchen, da die Dateien die Antwort stark vergrößern |

### 6.5 curl-Beispiel

```bash
# Platzhalter, keine echten Zugangsdaten
API_CLIENT="IHR_API_CLIENT"
API_SECRET="IHR_API_SECRET"

curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/reports/get/bwa" \
  -u "${API_CLIENT}:${API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "report_id_by_customer": 123,
        "get_files": false
      }'
```

### 6.6 Live-Verifikation

Aufruf am 2026-09-12 gegen die echte API, `report_id_by_customer` = 1, `get_files` nicht
gesetzt:

```json
{ "success": false, "error_code": 7, "message": "report was not found" }
```

HTTP-Status: **400**.

Abgleich mit der SPEC: Status, `error_code` und `message` stimmen exakt mit
`ReportsGetBwa_ErrorCode7` und dem Response-Schlüssel `"400 (7)"` überein. **Keine
Abweichung.**

Nicht verifizierbar, weil dazu ein schreibender `create`-Aufruf nötig gewesen wäre:
die Struktur von `report` im Erfolgsfall, das Verhalten von `get_files`, die
Vorzeichenkonvention und die tatsächlichen Gruppen- und Klassennamen.

### 6.7 Fallstricke und Besonderheiten

1. **Typwechsel bei der Id.** `create` liefert `id_by_customer` als String, `get` erwartet
   `report_id_by_customer` als Integer. Zusätzlich unterscheidet sich der Feldname
   zwischen Antwort (`id_by_customer`) und Anfrage (`report_id_by_customer`).
2. **`files` fehlt komplett, wenn `get_files` nicht gesetzt ist.** Die SPEC sagt
   *„Only contained if get_files has been specified."* Das Feld ist dann nicht `null`,
   sondern gar nicht vorhanden. Ein Parser muss beides vertragen.
3. **`files` ist bei der BWA vermutlich nutzlos**, weil `/reports/create/bwa` keinen
   Parameter zum Anfordern von Dateien hat. Siehe Abschnitt 4.6, Punkt 1. **Nicht
   verifiziert.**
4. **`report` ist ein untypisiertes Objekt.** Die Swagger-Definition gibt `type: object`
   ohne `properties` an. Der gesamte Aufbau steht nur als Prosa in der `description`.
   Ein Codegenerator erzeugt hier ein leeres Objekt. Die Struktur muss von Hand
   modelliert werden, und zwar defensiv.
5. **`uncompletedPostingsCount` ist ein Qualitätssignal, kein Randfeld.** Ein Agent, der
   BWA-Zahlen ausgibt, ohne diesen Wert zu prüfen, liefert unter Umständen eine
   unvollständige Erfolgsrechnung, ohne es zu sagen.
6. **`error_code` 8 ist kein Fehler im engeren Sinne**, sondern ein Zustand. Er darf nicht
   als endgültiger Misserfolg an den Nutzer durchgereicht werden.
7. **Antwortgröße.** Mit `get_files: true` enthält die Antwort base64-kodierte Dateien.
   Bei großen Zeiträumen kann das die Antwort erheblich aufblähen. Die SPEC nennt keine
   Obergrenze.

---

## 7. `/reports/get/sums`

Liefert eine zuvor erzeugte Summen- und Saldenliste samt optionaler Dateien.

### 7.1 Einordnung

> **LESEND.** Live verifiziert, ebenfalls nur im Negativfall, weil kein per API erzeugter
> Bericht existierte.

### 7.2 Parameter

Vollständigkeitsprüfung: `jq '.paths["/reports/get/sums"].post.parameters | length'`
ergibt **3**. Alle drei sind hier dokumentiert. Sie sind identisch zu denen von
`/reports/get/bwa`.

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Der für den zu verwaltenden Mandanten registrierte API Key | Mandantenspezifischer Schlüssel | Zeichenkette |
| `report_id_by_customer` | integer | ja | – | Die `id_by_customer` des Berichts, wie sie `/reports/create/sums` zurückgegeben hat | Positive ganze Zahl | Ganzzahl, obwohl `create` einen String liefert |
| `get_files` | boolean | nein | `false` | Wenn `true`, werden die Dateien des Berichts base64-kodiert mitgeliefert | `true` oder `false` | JSON-Boolean, Default in SPEC als String `"false"` |

Verschachtelte Objekt- oder Array-Parameter: **keine**.

### 7.3 Erfolgsantwort

Definition `ReportsGetSums_Success`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Immer `true` im Erfolgsfall |
| `message` | string | Leer |
| `report` | object | Die Berichtsdaten, siehe unten |
| `files` | object | Nur enthalten, wenn `get_files` gesetzt wurde. Schlüssel `csv`, `pdf` und `csv_archive`, jeweils base64-kodierter Inhalt oder `null` |

Struktur von `report` laut SPEC, wieder als Prosa, nicht als Schema:

| Schlüssel in `report` | Bedeutung |
| --- | --- |
| `integrityError` | Kennzeichen für inkonsistente Berichtsdaten |
| `countPostingsWithDateVatEffectiveNotConsideredInReport` | Anzahl der Buchungen, deren umsatzsteuerlich wirksames Datum (`date_vat_effective`) im Bericht **nicht** berücksichtigt wurde |
| `sums` | Objekt, **keyed nach Buchungskontonummer**. Je Eintrag die unten aufgeführten Felder |

Struktur eines Eintrags in `sums`, wörtlich nach SPEC:

| Feld | Bedeutung | Fachliche Einordnung |
| --- | --- | --- |
| `postingaccount` | Das Buchungskonto selbst | Struktur nicht beschrieben. Die SPEC erwähnt separat, dass `postingaccount_number` je Eintrag verfügbar ist; ob als eigenes Feld oder innerhalb von `postingaccount`, ist **nicht eindeutig** |
| `balanceBeforeDebit` | Saldo vor dem Zeitraum, Soll-Seite | Eröffnungssaldo |
| `balanceBeforeCredit` | Saldo vor dem Zeitraum, Haben-Seite | Eröffnungssaldo |
| `balanceBeforeAbsolute` | Saldo vor dem Zeitraum als Absolutbetrag | Vorzeichenlos |
| `balanceBeforeSide` | Seite des Anfangssaldos | Vermutlich `debit` oder `credit`, analog zum Kontenblatt, wo diese Werte live beobachtet wurden |
| `sumPeriodDebit` | Summe der Soll-Bewegungen im Zeitraum | „Summen" der Summen- und Saldenliste |
| `sumPeriodCredit` | Summe der Haben-Bewegungen im Zeitraum | dito |
| `balanceAfterDebit` | Saldo nach dem Zeitraum, Soll-Seite | Endsaldo |
| `balanceAfterCredit` | Saldo nach dem Zeitraum, Haben-Seite | Endsaldo |
| `balanceAfterAbsolute` | Endsaldo als Absolutbetrag | Vorzeichenlos |
| `balanceAfterSide` | Seite des Endsaldos | „Salden" der Summen- und Saldenliste |

**Vorzeichenkonvention:** Die Liste arbeitet nicht mit Vorzeichen, sondern mit dem Paar
aus Absolutbetrag und Seite. `balanceAfterAbsolute` ist der Betrag, `balanceAfterSide`
sagt, ob er im Soll oder im Haben steht. Wer daraus eine vorzeichenbehaftete Zahl machen
will, muss die Seite selbst auswerten. Dass die Seitenwerte `debit` und `credit` lauten,
ist im Kontenblatt **live bestätigt** (`balanceAfterSide: "debit"`), für die Summenliste
aber **nicht verifiziert**.

Die SPEC sagt außerdem im Beschreibungstext von `/reports/get/sums/ledger`: *„The
postingaccount numbers available for a sums report are provided by reports/get/sums, both
as the keys of the 'sums' object and as its entries' 'postingaccount_number'."* Die
Kontonummer steht also doppelt zur Verfügung: als Schlüssel des `sums`-Objekts und als
Feld `postingaccount_number` im Eintrag.

### 7.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 400 | 6 | `invalid report_id_by_customer specified` | Feld fehlt oder ist formal ungültig | Feld setzen. **Live verifiziert** |
| 400 | 7 | `report was not found` | Kein Bericht zu dieser Id | Erst `/reports/create/sums` aufrufen |
| 400 | 8 | `report generation has not been finished yet` | Bericht wird noch berechnet | Warten und erneut abfragen |
| 400 | 9 | `invalid get_files specified` | `get_files` ist kein Boolean | Echtes JSON-Boolean senden |
| 400 | 23 | `no post and files content received or declined` | Kein oder kein verwertbarer Body | `Content-Type` und Body prüfen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` passt nicht oder Rechte fehlen | `api_key` und Rechte prüfen |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv | Mandantenstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Mit Backoff wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Ohne `get_files` erneut versuchen |

### 7.5 curl-Beispiel

```bash
# Platzhalter, keine echten Zugangsdaten
API_CLIENT="IHR_API_CLIENT"
API_SECRET="IHR_API_SECRET"

curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/reports/get/sums" \
  -u "${API_CLIENT}:${API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "report_id_by_customer": 123,
        "get_files": true
      }'
```

### 7.6 Live-Verifikation

Aufruf am 2026-09-12, bewusst **ohne** `report_id_by_customer`, um das Pflichtverhalten
zu prüfen:

```json
{ "success": false, "error_code": 6, "message": "invalid report_id_by_customer specified" }
```

HTTP-Status: **400**.

Abgleich mit der SPEC: Status, `error_code` und `message` stimmen exakt mit
`ReportsGetSums_ErrorCode6` überein. **Keine Abweichung.** Zusätzlich belegt dieser Test,
dass ein fehlendes Pflichtfeld denselben Code auslöst wie ein formal falscher Wert; die
API unterscheidet also nicht zwischen „fehlt" und „ungültig".

Die Struktur von `report` im Erfolgsfall konnte nicht verifiziert werden, weil dafür ein
schreibender `create`-Aufruf nötig gewesen wäre.

### 7.7 Fallstricke und Besonderheiten

1. **`sums` ist ein Objekt, keine Liste.** Die Schlüssel sind Kontonummern. In JSON sind
   Objektschlüssel immer Strings, die Kontonummer kommt also als String an, während
   `/reports/get/sums/ledger` sie als `integer` entgegennimmt. Live bestätigt ist die
   verwandte Beobachtung, dass das Kontenblatt `postingaccount_number` als String `"4920"`
   zurückgibt, obwohl die Eingabe eine Zahl war.
2. **Reihenfolge ist nicht garantiert.** Ein Objekt hat in JSON keine zugesicherte
   Reihenfolge. Wer die Liste sortiert nach Kontonummer ausgeben will, muss selbst
   sortieren, und zwar numerisch, nicht lexikografisch, sonst steht `10000` vor `2000`.
3. **Drei Dateiformate statt zwei.** Anders als bei der BWA gibt es hier zusätzlich
   `csv_archive`. Der zugehörige Anforderungsparameter heißt aber `archive_export`.
4. **`countPostingsWithDateVatEffectiveNotConsideredInReport` ist ein Warnsignal.** Es
   zeigt an, dass Buchungen mit abweichendem umsatzsteuerlich wirksamem Datum nicht
   periodengerecht berücksichtigt wurden. Das deckt sich mit KB-LEIST: *„Die Steuer wird
   in der Auswertung nicht periodengerecht, sondern zum Rechnungsdatum dargestellt."*
   Ein Agent sollte diesen Wert mit ausgeben, sobald er von null abweicht.
5. **Doppelte Darstellung der Salden.** Es gibt `balanceAfterDebit`/`balanceAfterCredit`
   **und** `balanceAfterAbsolute`/`balanceAfterSide`. Beide Paare beschreiben denselben
   Sachverhalt. Welche Darstellung führend ist, sagt die SPEC nicht. Für Berechnungen ist
   das Paar aus Absolutbetrag und Seite eindeutiger.
6. **Nur bestätigte Buchungen.** KB-SUSA sagt das für die Oberfläche ausdrücklich. Für die
   API ist es **nicht verifiziert**, aber dieselbe Berechnungsgrundlage anzunehmen ist
   naheliegend.
7. **Fehlende Anfangsbestände verfälschen die Bestandskonten.** KB-SUSA weist darauf hin,
   dass für eine aussagekräftige Liste die Anfangssalden erfasst sein müssen. Ein Agent,
   der aus `balanceBefore*` einen Kontostand ableitet, sollte diese Einschränkung kennen.

---

## 8. `/reports/get/sums/ledger`

Liefert das Kontenblatt eines einzelnen Buchungskontos mit allen Buchungen des
angefragten Zeitraums und dem jeweils fortgeschriebenen Saldo.

### 8.1 Einordnung

> **LESEND.** Dieser Endpunkt wurde live und im Erfolgsfall verifiziert. Er ist der
> einzige der fünf Endpunkte, der ohne vorheriges `create` vollständige Nutzdaten
> liefert.

### 8.2 Parameter

Vollständigkeitsprüfung:
`jq '.paths["/reports/get/sums/ledger"].post.parameters | length'` ergibt **5**. Alle
fünf sind hier dokumentiert.

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Der für den zu verwaltenden Mandanten registrierte API Key | Mandantenspezifischer Schlüssel | Zeichenkette |
| `postingaccount_number` | integer | ja | – | Nummer des Buchungskontos, dessen Kontenblatt geliefert wird | Eine im Mandanten existierende Buchungskontonummer. Verfügbare Nummern liefern `/reports/get/sums` (Schlüssel des `sums`-Objekts) oder `/settings/get/postingaccounts` | Ganzzahl. Rückgabe erfolgt als String |
| `date_from` | string | ja | – | Erster Tag des Zeitraums | Gültiges Kalenderdatum | `YYYY-MM-DD`, Beispiel `2026-01-01` |
| `date_to` | string | ja | – | Letzter Tag des Zeitraums, eingeschlossen | Gültiges Kalenderdatum | `YYYY-MM-DD`, Beispiel `2026-03-31` |
| `base` | string | nein | `date` | Datum, nach dem die Buchungen dem Zeitraum zugeordnet werden | `date` (Buchungsdatum) oder `date_delivery_else_date` (Leistungsdatum, ersatzweise Buchungsdatum) | Kleinschreibung wie angegeben |

Verschachtelte Objekt- oder Array-Parameter in der Anfrage: **keine**.

### 8.3 Erfolgsantwort laut SPEC

Definition `ReportsGetSumsLedger_Success`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Immer `true` im Erfolgsfall |
| `message` | string | Leer |
| `report_sums_postingaccount_ledger` | object | Enthält `integrityError`, `postingaccount_number` und `postingaccountLedger` |

Ein `files`-Objekt gibt es hier **nicht**, und einen `get_files`-Parameter ebenfalls
nicht.

Die SPEC beschreibt die Zeilen von `postingaccountLedger` so: *„an array of the
postingaccount's postings within the requested period, each one providing its date,
posting text, counter postingaccount, amount, vat and the unformatted balance
'balanceAfterAbsolute' together with its side 'balanceAfterSide'. The array is empty if
there are no postings in the requested period."*

### 8.4 Erfolgsantwort laut Live-Test

Verifiziert am 2026-09-12. Die reale Antwort ist **deutlich reichhaltiger** als die SPEC
beschreibt und benennt die Felder teilweise anders. Das ist das wichtigste Ergebnis
dieser Verifikation.

Äußere Struktur, live bestätigt:

| Feld | Typ (live) | Wert im Test |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | `""` |
| `report_sums_postingaccount_ledger.integrityError` | boolean | `false` |
| `report_sums_postingaccount_ledger.postingaccount_number` | **string** | z. B. `"4920"`, obwohl als Integer gesendet |
| `report_sums_postingaccount_ledger.postingaccountLedger` | array | Liste der Buchungszeilen |

Eine Zeile in `postingaccountLedger` hatte live **24 Felder**:

| Feld | Typ (live) | Bedeutung | In SPEC beschrieben? |
| --- | --- | --- | --- |
| `id_by_customer` | integer | Mandantenbezogene Id der Buchung. Verbindung zu `/postings/get` | nein |
| `journal_number` | string oder `null` | Journalnummer, im Test `null` | nein |
| `record_side` | string | Seite dieser Buchungszeile auf dem Konto, beobachtet `debit` | indirekt („amount") |
| `record_amount` | **string** | Betrag der Buchungszeile, z. B. `"8.70"`, Punkt als Dezimaltrenner, keine Tausendertrennung | als „amount" |
| `date` | string | Datum, Format `YYYY-MM-DD HH:MM:SS`, im Test stets `00:00:00` | ja, ohne Formatangabe |
| `postingTextFull` | string | Buchungstext | als „posting text" |
| `standard_chart` | string | Kontenrahmen, beobachtet `skr03` | nein |
| `tax_journal_number` | string oder `null` | Steuerjournalnummer | nein |
| `tax_key` | string | Steuerschlüssel, beobachtet `"9"` | nein |
| `tax_key_effective` | string | Tatsächlich wirksamer Steuerschlüssel | nein |
| `receiptsAssignedFilenamesServerPlain` | array of string | Serverseitige Dateinamen der zugeordneten Belege, **ohne** Endung | nein |
| `receiptsAssignedFileSuffix` | array of string | Dateiendungen der zugeordneten Belege, z. B. `["pdf"]`. Parallelarray zu `receiptsAssignedFilenamesServerPlain` | nein |
| `reversed_by_id` | integer oder `null` | Id der Buchung, die diese storniert | nein |
| `reversal_for_id` | integer oder `null` | Id der Buchung, die durch diese storniert wird | nein |
| `cost_location` | string oder `null` | Kostenstelle | nein |
| `costLocationName` | string oder `null` | Name der Kostenstelle | nein |
| `transactions_id_by_customer` | integer oder `null` | Id der zugeordneten Transaktion | nein |
| `receipts_id_by_customer` | integer oder `null` | Id des zugeordneten Belegs | nein |
| `receipts_direction` | string oder `null` | Richtung des Belegs, beobachtet `inbound` | nein |
| `counterRecordPostingaccountNumber` | **integer** | Gegenkonto der Buchung | als „counter postingaccount" |
| `vatRate` | **string** | Umsatzsteuersatz in Prozent, beobachtet `"19.00"` | als „vat" |
| `vatPostingaccountNumbers` | array of integer | Steuerkonten der Buchung, beobachtet `[1576]` | nein |
| `balanceAfterAbsolute` | **float** | Fortgeschriebener Saldo nach dieser Buchung, als Absolutbetrag, beobachtet `8.7` | ja |
| `balanceAfterSide` | string | Seite des fortgeschriebenen Saldos, beobachtet `debit` | ja |

**Anonymisiertes** Beispiel einer Antwort. Beträge, Namen, Belegdateinamen, Ids sowie
das Personenkonto in `counterRecordPostingaccountNumber` sind **verändert**. Unverändert
geblieben sind lediglich die beiden öffentlichen SKR03-Standardkontonummern `4920`
(Telefon) und `1576` (abziehbare Vorsteuer 19 Prozent), weil sie keinem Mandanten
zuzuordnen sind und die Struktur sonst unverständlich würde. Feldnamen, Typen und
Formatierung entsprechen exakt der realen Antwort.

```json
{
  "success": true,
  "message": "",
  "report_sums_postingaccount_ledger": {
    "integrityError": false,
    "postingaccount_number": "4920",
    "postingaccountLedger": [
      {
        "id_by_customer": 1001,
        "journal_number": null,
        "record_side": "debit",
        "record_amount": "10.00",
        "date": "2026-01-02 00:00:00",
        "postingTextFull": "Musterlieferant GmbH",
        "standard_chart": "skr03",
        "tax_journal_number": null,
        "tax_key": "9",
        "tax_key_effective": "9",
        "receiptsAssignedFilenamesServerPlain": ["BelegdateiAnonymisiert0001"],
        "receiptsAssignedFileSuffix": ["pdf"],
        "reversed_by_id": null,
        "reversal_for_id": null,
        "cost_location": null,
        "costLocationName": null,
        "transactions_id_by_customer": null,
        "receipts_id_by_customer": 500,
        "receipts_direction": "inbound",
        "counterRecordPostingaccountNumber": 70000,
        "vatRate": "19.00",
        "vatPostingaccountNumbers": [1576],
        "balanceAfterAbsolute": 10.0,
        "balanceAfterSide": "debit"
      }
    ]
  }
}
```

### 8.5 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 400 | 10 | `invalid postingaccount_number specified` | Feld fehlt oder ist formal keine gültige Kontonummer | Feld setzen, Ganzzahl senden |
| 400 | 12 | `invalid date_from specified` | `date_from` fehlt oder ist ungültig | Format `YYYY-MM-DD` prüfen |
| 400 | 13 | `invalid date_to specified` | `date_to` fehlt oder ist ungültig | Wie oben |
| 400 | 14 | `invalid base specified` | `base` hat einen anderen Wert als `date` oder `date_delivery_else_date` | Einen der beiden Werte senden oder das Feld weglassen |
| 400 | 16 | `postingaccount was not found` | Formal gültige Nummer, aber im Mandanten nicht vorhanden | Kontonummern über `/settings/get/postingaccounts` oder `/reports/get/sums` ermitteln. **Live verifiziert** |
| 400 | 23 | `no post and files content received or declined` | Kein oder kein verwertbarer Body | `Content-Type` und Body prüfen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` passt nicht oder Rechte fehlen | `api_key` und Rechte prüfen |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv | Mandantenstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Mit Backoff wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung. Bei Konten mit vielen Buchungen realistisch, weil das Kontenblatt on the fly berechnet wird | Zeitraum verkleinern und mehrere Teilabfragen zusammensetzen |

Auffällig: Die endpunktspezifischen Codes lauten 10, 12, 13, 14 und 16. Die Lücken bei
11 und 15 entstehen, weil diese Nummern global belegt sind (11 = `customer has no active
status`, 15 = `adding temporarily restricted`). Die Lücke bei 10 an anderen Endpunkten
hat dieselbe Ursache in umgekehrter Richtung.

### 8.6 curl-Beispiel

```bash
# Platzhalter, keine echten Zugangsdaten
API_CLIENT="IHR_API_CLIENT"
API_SECRET="IHR_API_SECRET"

curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/reports/get/sums/ledger" \
  -u "${API_CLIENT}:${API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "postingaccount_number": 4920,
        "date_from": "2026-01-01",
        "date_to": "2026-01-31",
        "base": "date"
      }'
```

### 8.7 Live-Verifikation und Abweichungen von der Spezifikation

Drei Aufrufe am 2026-09-12:

1. Kontenblatt eines existierenden Aufwandskontos für einen Monat, ohne `base`:
   HTTP 200, `success: true`, eine Buchungszeile.
2. Kontenblatt mit `postingaccount_number` = 999999 und
   `base` = `date_delivery_else_date`: HTTP 400,
   `{"success":false,"error_code":16,"message":"postingaccount was not found"}`.
   Der Wert `date_delivery_else_date` wurde dabei **nicht** als ungültig beanstandet, was
   ihn als zulässigen Wert bestätigt, allerdings nur schwach, weil die Kontoprüfung
   möglicherweise vor der `base`-Prüfung greift.
3. Vorbereitend `/settings/get/postingaccounts` und `/postings/get`, um eine im Mandanten
   tatsächlich bebuchte Kontonummer zu ermitteln.

Festgestellte Abweichungen zwischen SPEC und Realität:

| Nr. | SPEC | Realität (LIVE) | Bewertung |
| --- | --- | --- | --- |
| 1 | Zeile liefert „date, posting text, counter postingaccount, amount, vat" und `balanceAfterAbsolute`/`balanceAfterSide`, also sechs bis sieben Angaben | Zeile liefert **24 Felder**, darunter Storno-Verweise, Steuerschlüssel, Kostenstelle, Belegzuordnungen, Transaktionszuordnung und Kontenrahmen | **Erhebliche Untertreibung der SPEC.** Eine Implementierung, die nur die genannten Felder modelliert, verschenkt die Hälfte der nutzbaren Information |
| 2 | Feldnamen werden in der SPEC nur umschrieben („posting text", „amount", „vat") | Reale Namen sind `postingTextFull`, `record_amount`, `vatRate` | **Namen sind aus der SPEC nicht ableitbar.** Ein Generator erzeugt hier garantiert falsche Felder |
| 3 | `postingaccount_number` als Eingabe `integer` | Rückgabe als **String** `"4920"` | Typinkonsistenz zwischen Anfrage und Antwort |
| 4 | Keine Typangaben für Beträge | `record_amount` ist ein **String** (`"8.70"`), `balanceAfterAbsolute` ein **Float** (`8.7`) | **Gemischte Betragsdarstellung innerhalb derselben Zeile.** Für Geldbeträge ist der Float problematisch; ein Client sollte beide Werte als Dezimalzahl mit fester Genauigkeit einlesen und nicht mit Binär-Floats weiterrechnen |
| 5 | `date` ohne Formatangabe | Format `YYYY-MM-DD HH:MM:SS`, Zeitanteil stets `00:00:00` | **Asymmetrie zur Eingabe**, die `YYYY-MM-DD` verlangt. Beim Zurückschreiben oder Vergleichen muss der Zeitanteil abgeschnitten werden |
| 6 | Keine Erwähnung von Belegdateien | `receiptsAssignedFilenamesServerPlain` und `receiptsAssignedFileSuffix` sind **parallele Arrays** | Der vollständige Dateiname entsteht erst durch Zusammensetzen beider Arrays an gleicher Position. Undokumentiert und fehleranfällig |
| 7 | `integrityError` ohne Typangabe | Boolean `false` | Erwartung bestätigt |
| 8 | Ledger benötigt keinen vorherigen Bericht | Bestätigt: Abruf gelang, obwohl kein Bericht existierte | **Keine Abweichung**, die SPEC ist hier korrekt |

### 8.8 Fallstricke und Besonderheiten

1. **Der Endpunkt heißt `/reports/get/sums/ledger`, gehört aber logisch nicht zum
   Report-Lebenszyklus.** Er braucht kein `create`, kennt keine `report_id_by_customer`
   und liefert kein `files`-Objekt. Nur der Pfad suggeriert eine Abhängigkeit.
2. **Abweichende Feldnamenkonvention innerhalb einer Antwort.** In derselben Zeile stehen
   `snake_case` (`record_amount`, `tax_key`, `receipts_id_by_customer`) und
   `camelCase` (`postingTextFull`, `counterRecordPostingaccountNumber`, `vatRate`,
   `balanceAfterAbsolute`) nebeneinander. Eine automatische Namensnormalisierung im
   Client muss beide Formen verarbeiten.
3. **Ein Wrapper-Feld mit eigenem Namen.** `report_sums_postingaccount_ledger` folgt weder
   dem `data`-Muster der Listenendpunkte noch dem `report`-Muster der beiden anderen
   get-Endpunkte.
4. **Leeres Array ist kein Fehler.** Hat das Konto im Zeitraum keine Buchungen, ist
   `postingaccountLedger` ein leeres Array bei `success: true`. Das ist ausdrücklich in
   der SPEC festgehalten und darf nicht als „nicht gefunden" interpretiert werden.
   Fehlercode 16 gilt nur für ein nicht existierendes Konto.
5. **Kein Paging.** Es gibt weder `limit` noch `offset`. Bei einem stark bebuchten Konto,
   etwa dem Bankkonto über ein volles Jahr, kommt alles auf einmal. Die SPEC warnt
   ausdrücklich: *„retrieving the ledger of a postingaccount holding a lot of postings may
   take a while."* Gegenmaßnahme ist die Zerlegung in Monatsfenster.
6. **`base` verschiebt die Periodenzuordnung.** Mit `date_delivery_else_date` können
   Buchungen im Ergebnis erscheinen, deren Rechnungsdatum außerhalb des Zeitraums liegt,
   und umgekehrt. KB-LEIST beschreibt genau diesen Effekt für die BWA. Für die
   Kontenblätter sagt KB-LEIST dagegen, die Darstellung erfolge *„grundsätzlich nach
   Rechnungsdatum"*. Das steht in Spannung zum vorhandenen `base`-Parameter der API.
   **Nicht verifiziert**, welches Verhalten die API mit `base = date_delivery_else_date`
   tatsächlich zeigt.
7. **Der laufende Saldo bezieht sich auf den angefragten Zeitraum.** Ob
   `balanceAfterAbsolute` der ersten Zeile den Anfangsbestand vor dem Zeitraum enthält
   oder bei null startet, ist **nicht verifiziert**. Im Test war das Konto ein
   Aufwandskonto zu Jahresbeginn, sodass sich beide Varianten nicht unterscheiden lassen.
   Das muss vor jeder Saldo-Interpretation geklärt werden.
8. **Storno-Buchungen sind erkennbar, aber nicht herausgefiltert.** `reversed_by_id` und
   `reversal_for_id` sind gesetzt, wenn eine Buchung storniert wurde oder selbst ein
   Storno ist. Wer Kennzahlen bildet, muss entscheiden, ob beide Zeilen stehen bleiben
   (dann heben sie sich auf) oder ob sie ausgeblendet werden.

---

## 9. Live-Verifikationsprotokoll

Alle Aufrufe am 2026-09-12 gegen `https://webapp.buchhaltungsbutler.de/api/v1` mit
HTTP Basic Auth und `api_key` im Body. Ausschließlich lesende Endpunkte. Kein einziger
`create`-Aufruf. Zugangsdaten sind in diesem Dokument bewusst nicht enthalten.

| Nr. | Endpunkt | Zweck | HTTP | Ergebnis |
| --- | --- | --- | --- | --- |
| 1 | `/reports/get/bwa` | Verhalten ohne vorherigen `create` | 400 | `error_code` 7, `report was not found` |
| 2 | `/reports/get/sums` | Pflichtfeldverhalten ohne `report_id_by_customer` | 400 | `error_code` 6, `invalid report_id_by_customer specified` |
| 3 | `/settings/get/postingaccounts` | Ermittlung gültiger Kontonummern | 200 | Liste mit Feldern `postingaccount_number`, `name`, `type`, `subtype`, `parent_postingaccount_number`, `parent_name` |
| 4 | `/postings/get` | Ermittlung eines tatsächlich bebuchten Kontos | 200 | Buchungssätze mit `debit_postingaccount_number` und `credit_postingaccount_number` |
| 5 | `/reports/get/sums/ledger` | Erfolgsfall Kontenblatt, ein Monat | 200 | Vollständige Zeilenstruktur mit 24 Feldern, siehe Abschnitt 8.4 |
| 6 | `/reports/get/sums/ledger` | Nicht existierendes Konto, zugleich Test von `base` | 400 | `error_code` 16, `postingaccount was not found` |

Verbrauchtes Budget: 6 von 6 zulässigen Requests.

---

## 10. Kennzahlen, die ein Agent aus diesen Endpunkten beantworten kann

Die folgenden Zuordnungen sind fachliche Ableitungen. Die Kontonummernbeispiele beziehen
sich auf SKR03, weil der Testmandant live `standard_chart: "skr03"` liefert. Für andere
Kontenrahmen gelten andere Nummern; das Feld `standardChart` im BWA-Bericht
beziehungsweise `standard_chart` je Buchungszeile sagt, welcher Rahmen gilt.

| Frage | Weg | Belegt / Annahme |
| --- | --- | --- |
| Umsatz eines Zeitraums | BWA-Gruppe Umsatzerlöse aus `/reports/get/bwa`, alternativ Summe der Erlöskonten aus `/reports/get/sums` über `sumPeriodCredit` | Struktur der BWA-Gruppen **nicht verifiziert**. Der Weg über die Summenliste ist strukturell belegt |
| Gewinn beziehungsweise vorläufiges Ergebnis | `totals` des BWA-Berichts | Feld `totals` ist belegt, seine innere Struktur **nicht** |
| Aufwand einer Kostenart | BWA-Klasse oder Gruppe, alternativ Saldo des jeweiligen Aufwandskontos aus der Summenliste | Summenlistenweg strukturell belegt |
| Saldo eines einzelnen Kontos zum Stichtag | `/reports/get/sums`, Eintrag des Kontos, `balanceAfterAbsolute` plus `balanceAfterSide` | Strukturell belegt |
| Bewegung eines Kontos im Zeitraum | `sumPeriodDebit` und `sumPeriodCredit` desselben Eintrags | Strukturell belegt |
| Welche Einzelbuchungen stecken hinter einem Kontosaldo | `/reports/get/sums/ledger` für dieses Konto | **Live verifiziert** |
| Offene Posten Debitoren | Salden der Debitorenkonten aus `/reports/get/sums`, Zuordnung der Kontonummern über `/settings/get/debtors` | Fachlich üblich, aber **keine echte OP-Liste**: die Summenliste kennt keine Fälligkeiten und keine Zuordnung von Teilzahlungen zu einzelnen Rechnungen |
| Offene Posten Kreditoren | Analog über `/settings/get/creditors` | Dieselbe Einschränkung |
| Liquiditätslage | Salden der Zahlungskonten aus `/reports/get/sums` | Strukturell belegt. `/settings/get/postingaccounts` liefert über `type` und `subtype` die Zuordnung, welche Konten Zahlungskonten sind |
| Datenqualität der Auswertung | `uncompletedPostingsCount` (BWA), `countPostingsWithDateVatEffectiveNotConsideredInReport` (SuSa), `integrityError` (beide und Kontenblatt) | Felder belegt, Wertebereich teils **nicht verifiziert** |
| Umsatzsteuer eines Zeitraums | **Nicht** aus diesen Endpunkten. KB-BWA: in der BWA wird Umsatz- und Vorsteuer nicht berücksichtigt. Über die Summenliste sind die Steuerkonten zwar sichtbar, die periodengerechte Ermittlung erfolgt aber laut KB-LEIST abweichend | Ausdrücklich **kein** gültiger Weg für eine belastbare USt-Aussage |

Grundsätzlich gilt: Fragen nach **Beträgen und Salden** beantwortet die Summen- und
Saldenliste am direktesten und präzisesten. Fragen nach **betriebswirtschaftlicher
Struktur** („Wie viel Personalkosten?", „Wie ist das Ergebnis?") beantwortet die BWA.
Fragen nach **einzelnen Geschäftsvorfällen** beantwortet das Kontenblatt oder, mit mehr
Filtermöglichkeiten, `/postings/get`.

---

## 11. Übergreifende Fallstricke

### 11.1 Formfehler der Swagger-Datei

- `basePath` enthält eine vollständige URL statt eines Pfads.
- Body-Parameter stehen als einzelne Einträge mit `in: body` und eigenem `type` statt in
  einem gemeinsamen `schema`.
- Boolean-Defaults sind als Strings notiert (`"false"` statt `false`).
- Antwortschlüssel lauten `"401 (3)"` statt `"401"`; ein Status kann so mehrfach mit
  unterschiedlichen Bodies auftreten, was in Swagger 2.0 nicht vorgesehen ist.
- `enum` mit genau einem Eintrag transportiert Beispielwerte, keine Wertemengen.
- `consumes` ist `null`, `securityDefinitions` ist `null`, `tags` ist `null`.
- Die Berichtsobjekte `report` und `report_sums_postingaccount_ledger` sind als
  `type: object` ohne `properties` deklariert; ihre gesamte Struktur steht nur in der
  `description` als Fließtext, teils mit HTML-Entities wie `&ldquo;` und `&auml;`.

Konsequenz: **Automatische Codegenerierung aus dieser Datei führt zu falschem Code.**
Die Typen müssen von Hand modelliert werden.

### 11.2 Namensinkonsistenzen

| Stelle A | Stelle B | Problem |
| --- | --- | --- |
| `create` liefert `id_by_customer` (string) | `get` erwartet `report_id_by_customer` (integer) | Name **und** Typ ändern sich |
| Parameter `archive_export` | Antwortschlüssel `files.csv_archive` | Anderes Wort für dieselbe Datei |
| Eingabe `postingaccount_number` (integer) | Ausgabe `postingaccount_number` (string) | Typ ändert sich, live bestätigt |
| Eingabe `date_from`/`date_to` als `YYYY-MM-DD` | Ausgabe `date` als `YYYY-MM-DD HH:MM:SS` | Formatasymmetrie, live bestätigt |
| Zeilenfelder teils `snake_case`, teils `camelCase` | – | Innerhalb desselben Objekts, live bestätigt |
| `report` bei BWA und SuSa | `report_sums_postingaccount_ledger` beim Kontenblatt | Drei verschiedene Wrapper-Namen in fünf Endpunkten |

### 11.3 Datums- und Periodensemantik

- Eingabeformat überall `YYYY-MM-DD`, Zeitraum beidseitig einschließend.
- `base` gibt es nur bei `/reports/create/sums` und `/reports/get/sums/ledger`, **nicht**
  bei `/reports/create/bwa`. Die BWA lässt sich über die API also nicht auf
  Buchungsdatumsbasis anfordern.
- KB-LEIST sagt für die Oberfläche: BWA wertet nach Leistungsdatum aus, Kontenblätter
  nach Rechnungsdatum. Die API dreht das teilweise um, indem sie bei den Kontenblättern
  einen Umschalter anbietet und bei der BWA keinen. **Dieser Widerspruch ist nicht
  aufgelöst.** Ein Agent, der BWA- und SuSa-Zahlen gegeneinander stellt, muss ihn benennen
  statt ihn zu glätten.
- `date_vat_effective` ist ein drittes Datum neben Buchungs- und Leistungsdatum. Es taucht
  in `/postings/get` als Feld auf und in `/reports/get/sums` indirekt über
  `countPostingsWithDateVatEffectiveNotConsideredInReport`. Als `base`-Option steht es
  **nicht** zur Verfügung.

### 11.4 Betragsdarstellung

- SPEC spricht durchgängig von „unformatted values". Das heißt: Punkt als Dezimaltrenner,
  keine Tausendertrennung, keine Währung.
- Live beobachtet: `record_amount` als String, `balanceAfterAbsolute` als Float,
  `vatRate` als String mit zwei Nachkommastellen.
- **Empfehlung:** Alle Beträge im Client als Dezimalzahl mit fester Genauigkeit einlesen,
  niemals als Binär-Float weiterrechnen. Bei Floats aus der API ist der gelieferte Wert
  bereits gerundet; eine Umwandlung über die Zeichenkettendarstellung ist sicherer als
  eine direkte Float-Arithmetik.
- Vorzeichen gibt es bei Salden nicht. Stattdessen das Paar aus Absolutbetrag und Seite
  (`debit` beziehungsweise `credit`). Eine vorzeichenbehaftete Darstellung muss der Client
  selbst erzeugen und dabei die Kontenart berücksichtigen, weil ein Soll-Saldo auf einem
  Aufwandskonto etwas anderes bedeutet als auf einem Erlöskonto.
- Für die BWA ist die Vorzeichenkonvention von `amountsSum` **nicht verifiziert**.

### 11.5 Nebenläufigkeit

Da je Typ nur ein Bericht existiert und ein neuer den alten ersetzt, sind parallele
Report-Erzeugungen im selben Mandanten gefährlich: Zwei Agenten, die gleichzeitig eine
BWA für unterschiedliche Zeiträume anfordern, überschreiben sich gegenseitig. Der zweite
`create`-Aufruf scheitert zwar mit `error_code` 12, solange der erste läuft, aber sobald
dieser fertig ist, entwertet ein nachfolgender `create` das Ergebnis des ersten. Ein
MCP-Server sollte Report-Erzeugungen pro Mandant serialisieren und den Bericht sofort
nach Fertigstellung abholen.

---

## 12. Hinweise für das MCP-Tool-Design

### 12.1 Welche Endpunkte fachlich zusammengehören

Drei Bündel:

1. **BWA-Bündel:** `/reports/create/bwa` und `/reports/get/bwa`. Zwingend zweistufig.
2. **SuSa-Bündel:** `/reports/create/sums` und `/reports/get/sums`. Zwingend zweistufig.
3. **Kontenblatt, einstufig:** `/reports/get/sums/ledger`. Braucht nur eine Kontonummer
   und einen Zeitraum.

Ergänzend, außerhalb dieses Dokuments, aber im selben Arbeitsfluss:

- `/settings/get/postingaccounts` liefert die Kontonummern samt `type` und `subtype` und
  ist damit der natürliche Vorschritt zum Kontenblatt.
- `/settings/get/debtors` und `/settings/get/creditors` ordnen Personenkonten zu.
- `/postings/get` liefert dieselben Buchungen wie das Kontenblatt, aber mit
  Filtermöglichkeiten (`postingaccount`, `cost_location`, `posting_status`) und mit
  `limit`/`offset`. Für „zeige mir die Buchungen zu X" ist `/postings/get` in der Regel
  das bessere Werkzeug; `/reports/get/sums/ledger` ist die kontenbezogene Sicht **mit
  fortgeschriebenem Saldo**, was `/postings/get` nicht bietet.
- `/cost-locations/get` für die Auflösung von `cost_location`.

### 12.2 Mehrstufige Abläufe, die ein Tool kapseln sollte

**Ablauf A, BWA abrufen.** Für ein Agenten-Tool sollte `create` und das Polling **hinter
einem Tool** verschwinden, weil ein Agent die Zwischenzustände nicht sinnvoll verwalten
kann:

1. `/reports/create/bwa` mit Zeitraum.
2. `id_by_customer` aus der Antwort als Integer interpretieren.
3. `/reports/get/bwa` mit Backoff pollen, solange `error_code` 8 kommt.
4. Bei Erfolg `report` zurückgeben und `uncompletedPostingsCount` sowie `integrityError`
   als Qualitätshinweis mitliefern.
5. Bei `error_code` 12 im Schritt 1: entweder warten oder mit klarer Meldung abbrechen,
   dass bereits eine Erzeugung läuft.

Weil Schritt 1 **schreibend** ist und den vorherigen Bericht ersetzt, muss dieses Tool
als schreibend deklariert und gegebenenfalls hinter einer Bestätigung geführt werden.

**Ablauf B, Summen- und Saldenliste abrufen.** Analog, mit `base` als bewusst zu
setzendem Parameter und ohne Dateien, sofern der Agent sie nicht ausdrücklich braucht.

**Ablauf C, Kontenblatt.** Einstufig, aber mit einem Vorschritt zur Kontofindung, wenn der
Nutzer das Konto in Worten benennt („Telefonkosten") statt als Nummer. Dann:
`/settings/get/postingaccounts` abrufen, über `name` suchen, Nummer verwenden.

**Ablauf D, Zeitraum aufteilen.** Für stark bebuchte Konten sollte ein Tool den Zeitraum
selbst in Monatsfenster zerlegen, die Teilergebnisse zusammensetzen und dabei beachten,
dass `balanceAfterAbsolute` je Fenster neu berechnet wird (**nicht verifiziert**, wie der
Startsaldo eines Fensters gebildet wird, siehe Abschnitt 8.8 Punkt 7).

### 12.3 Parameter, die Agenten schwer erraten und die gute Beschreibungen brauchen

| Parameter | Warum schwierig | Was die Tool-Beschreibung leisten muss |
| --- | --- | --- |
| `report_id_by_customer` | Kommt aus einem vorherigen Aufruf, den der Agent selbst gemacht haben muss. Heißt in der Antwort anders (`id_by_customer`) und hat dort einen anderen Typ | Am besten gar nicht exponieren, sondern im Tool kapseln. Falls doch: ausdrücklich sagen, woher der Wert stammt und dass er nach jedem neuen `create` ungültig wird |
| `base` | Zwei kryptische Literale, deren fachliche Bedeutung ohne Buchhaltungswissen unverständlich ist. `date_delivery_else_date` klingt nicht nach „Leistungsdatum" | Beide Werte als Enum anbieten, jeweils mit deutscher Erklärung: `date` = Buchungs- beziehungsweise Rechnungsdatum, `date_delivery_else_date` = Leistungsdatum, hilfsweise Buchungsdatum. Dazu den Hinweis, wann welches sinnvoll ist |
| `postingaccount_number` | Der Agent kennt Kontonummern nicht auswendig, und sie hängen vom Kontenrahmen ab | Beschreibung muss auf `/settings/get/postingaccounts` als Nachschlagequelle verweisen. Besser: ein Tool, das Kontoname oder Kontonummer akzeptiert und selbst auflöst |
| `archive_export` | Name sagt nicht, was drin ist | Beschreiben als „ZIP mit der CSV-Übersicht und je einer CSV pro bebuchtem Kontenblatt". Zusätzlich erwähnen, dass der Inhalt später unter `files.csv_archive` abgeholt wird |
| `get_files` | Wirkt harmlos, vergrößert die Antwort aber erheblich und liefert base64 | Standardmäßig `false` lassen und in der Beschreibung sagen, dass die Dateien base64-kodiert sind und nur dann verfügbar, wenn sie beim Erzeugen angefordert wurden |
| `date_from` / `date_to` | Der Agent muss aus „letztes Quartal" ein konkretes Datumspaar machen und das Wirtschaftsjahr des Mandanten kennen | Format und Einschlussregel („beide Tage gehören dazu") ausdrücklich nennen. Kein abweichendes Wirtschaftsjahr annehmen |
| `api_key` | Wird leicht mit dem API Secret verwechselt | Klarstellen: Mandantenschlüssel im Body, nicht das Basic-Auth-Passwort. In einem MCP-Server sollte er aus der Konfiguration kommen und gar nicht als Tool-Parameter auftauchen |

### 12.4 Was ein Tool zurückgeben sollte

- **Immer** die Qualitätsfelder mitgeben: `integrityError`, bei der BWA zusätzlich
  `uncompletedPostingsCount`, bei der SuSa zusätzlich
  `countPostingsWithDateVatEffectiveNotConsideredInReport`. Ein Agent, der Zahlen ohne
  diese Signale weitergibt, kann eine unvollständige Buchhaltung als fertig darstellen.
- Den **verwendeten Zeitraum und den `base`-Wert** in der Antwort wiederholen, damit der
  Agent später weiß, worauf sich die Zahlen beziehen.
- Das **Kontenblatt nicht auf die in der SPEC genannten sechs Felder reduzieren.** Die
  zusätzlichen Felder (`reversed_by_id`, `cost_location`, `receipts_id_by_customer`,
  `tax_key_effective`) sind genau die, mit denen ein Agent Rückfragen beantworten kann.
- Bei großen Kontenblättern **kürzen und das Kürzen ausweisen**, statt den Kontext
  stillschweigend zu sprengen.

### 12.5 Schreibschutz

`/reports/create/bwa` und `/reports/create/sums` sind schreibend. Sie erzeugen Daten und
zerstören den jeweils vorherigen Bericht. In einem MCP-Server gehören sie hinter denselben
Schutz wie jede andere schreibende Operation: eigene Tool-Kategorie, klare Kennzeichnung,
optional ein Read-only-Modus, in dem sie nicht angeboten werden. In einem solchen Modus
bleibt `/reports/get/sums/ledger` voll nutzbar, während BWA und Summenliste nur abrufbar
sind, sofern bereits ein Bericht existiert.

---

## 13. Vollständigkeitsnachweis

Gegenprüfung der Parameteranzahl gegen die Spezifikation, ausgeführt am 2026-09-12:

```bash
jq '.paths["/reports/create/bwa"].post.parameters      | length'  # 3
jq '.paths["/reports/create/sums"].post.parameters     | length'  # 7
jq '.paths["/reports/get/bwa"].post.parameters         | length'  # 3
jq '.paths["/reports/get/sums"].post.parameters        | length'  # 3
jq '.paths["/reports/get/sums/ledger"].post.parameters | length'  # 5
```

Abgleich mit den Tabellen dieses Dokuments:

| Endpunkt | Anzahl laut SPEC | Dokumentierte Felder | Feldliste |
| --- | --- | --- | --- |
| `/reports/create/bwa` | 3 | 3 | `api_key`, `date_from`, `date_to` |
| `/reports/create/sums` | 7 | 7 | `api_key`, `date_from`, `date_to`, `base`, `file_pdf`, `file_csv`, `archive_export` |
| `/reports/get/bwa` | 3 | 3 | `api_key`, `report_id_by_customer`, `get_files` |
| `/reports/get/sums` | 3 | 3 | `api_key`, `report_id_by_customer`, `get_files` |
| `/reports/get/sums/ledger` | 5 | 5 | `api_key`, `postingaccount_number`, `date_from`, `date_to`, `base` |

Gesamt: 21 Parameter laut Spezifikation, 21 dokumentiert.

Gegenprüfung der Fehlerdefinitionen:

```bash
jq -r '.definitions | keys[] | select(startswith("Reports"))' \
  docs/openapi/buchhaltungsbutler-v1.json
```

liefert 28 Definitionen (5 Success-Schemata und 23 endpunktspezifische Fehlerschemata).
Alle 23 endpunktspezifischen Fehlercodes sind in den Fehlertabellen der Abschnitte 4.4,
5.4, 6.4, 7.4 und 8.5 enthalten, ebenso die sechs globalen Codes 0, 3, 4, 11, 23 und 30.

Eine Definition ist zu erwähnen, die in **keiner** Report-Antwort referenziert wird:
`Request_ErrorCode15` (`adding temporarily restricted`) existiert global, taucht aber in
den `responses`-Objekten der fünf Report-Endpunkte nicht auf. Sie ist daher hier nicht
als möglicher Fehlerfall gelistet.

---

## 14. Offene Punkte

Diese Fragen konnten mit den erlaubten Mitteln nicht beantwortet werden. Sie sollten vor
oder bei der Implementierung geklärt werden, notfalls mit einem einzelnen, bewusst
freigegebenen `create`-Aufruf in einem Testmandanten.

1. Tatsächliche Struktur von `report` bei `/reports/get/bwa`: Namen und Verschachtelung
   von `groups`, `classes`, `totals`, Datentyp von `amountsSum`, Vorzeichenkonvention.
2. Tatsächliche Struktur von `report.sums` bei `/reports/get/sums`: Datentypen der elf
   beschriebenen Felder, Aufbau des Unterobjekts `postingaccount`, tatsächliche Werte von
   `balanceBeforeSide` und `balanceAfterSide`.
3. Ob `/reports/create/bwa` überhaupt Dateien erzeugen kann, obwohl es keine Parameter
   dafür gibt, und ob `files.csv` und `files.pdf` bei der BWA je etwas anderes als `null`
   enthalten.
4. Lebensdauer eines Berichts und seiner Dateien. Die SPEC nennt „not available anymore"
   als Grund für `null`, aber keine Frist.
5. Ob BWA und Summenliste sich beim `error_code` 12 gegenseitig blockieren oder nur je
   Typ.
6. Verhalten bei `date_to` vor `date_from` und bei sehr langen Zeiträumen.
7. Ob der Startsaldo eines Kontenblatts den Bestand vor dem Zeitraum enthält.
8. Tatsächliches Verhalten von `base = date_delivery_else_date` im Kontenblatt, angesichts
   der gegenteiligen Aussage in KB-LEIST.
9. Ob über die Weboberfläche erzeugte Berichte über die API erreichbar sind.
10. Ob die API dieselbe Einschränkung „nur bestätigte Buchungen" anwendet wie die
    Oberfläche.
