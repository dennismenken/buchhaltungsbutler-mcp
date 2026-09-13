# Stammdaten: Debitoren, Kreditoren, Sachkonten, Konten, Kostenstellen, Kommentare

Nachschlagewerk für die Implementierung eines inoffiziellen MCP-Servers für die
BuchhaltungsButler-API. Dokumentiert sind 18 Endpunkte aus den Gruppen Settings,
Accounts, Cost-Locations und Comments.

## Quellen und Stand

| Quelle | Art | Abrufdatum |
| --- | --- | --- |
| `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json` | Offizielle Swagger-2.0-Beschreibung, Version 1.9.1, heruntergeladen von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json` | 2026-09-12 |
| `https://app.buchhaltungsbutler.de/docs/api/v1/` | Offizielle API-Dokumentation, Abschnitte Authentifizierung und Rate Limit | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101-Kontenrahmen-und-Sachkontenlänge-wählen` | Wissensdatenbank, Kontenrahmen und Kontenlängen | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11465877273757-Informationen-zu-Basiskonten-und-zur-Einrichtung` | Wissensdatenbank, Basiskonten | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11454526317085-Individuelle-Sachkonten-anlegen` | Wissensdatenbank, individuelle Sachkonten, gesperrte Kontonummern | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11451725464477-Debitoren-und-Kreditoren-aktivieren-und-einrichten` | Wissensdatenbank, Sammelkonto und Selektiv-Modus | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11452107588893-Mit-Debitoren-und-Kreditoren-buchen` | Wissensdatenbank, Buchungslogik Debitoren und Kreditoren | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11445076569885-Projektverwaltung-und-Kostenstellen` | Wissensdatenbank, Kostenstellen und Kostenstelle 2 | 2026-09-12 |
| Eigene Live-Abfragen gegen `https://webapp.buchhaltungsbutler.de/api/v1` | 6 lesende Requests gegen die Produktivbuchhaltung des Nutzers | 2026-09-12 |

Die Wissensdatenbank-Artikel beschreiben die Weboberfläche, nicht die API. Sie erklären
das fachliche Modell hinter den API-Feldern, sind aber keine normative Quelle für das
Verhalten der API. Wo ein Artikel als Beleg dient, ist das im Text vermerkt.

### Hinweis zur Swagger-Datei

Die Datei ist kein valides Swagger 2.0. Body-Parameter stehen als Liste einzelner
Einträge mit `"in": "body"` und eigenem `"type"`, statt gebündelt in einem gemeinsamen
`schema`-Objekt. Fachlich sind alle diese Einträge Felder **eines** JSON-Bodys.
Codegeneratoren, die die Datei unverändert verarbeiten, erzeugen falsche Clients.

In den Definitionen unter `.definitions` stecken Beispielwerte in `"enum"`-Arrays mit
genau einem Eintrag. Das sind **Beispiele, keine erlaubten Wertemengen**. In diesem
Dokument werden sie als Beispiele behandelt und nie als Validierungsregel dargestellt.

## Gemeinsame Grundlagen

Quelle: Live-Verifikation 2026-09-12 und `https://app.buchhaltungsbutler.de/docs/api/v1/`.

| Aspekt | Wert |
| --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` |
| HTTP-Methode | Immer `POST`, auch für lesende Endpunkte |
| Content-Type | `application/json` |
| Authentifizierung | HTTP Basic Auth, Benutzername = API Client, Passwort = API Secret |
| Mandantenauswahl | Pflichtfeld `api_key` im JSON-Body, zusätzlich zur Basic Auth |
| Rate Limit | Maximal 100 Requests pro Mandant und Minute (laut Doku) |

Die Swagger-Datei nennt unter `host` den Wert `webapp.buchhaltungsbutler.de` und unter
`basePath` die vollständige URL `https://webapp.buchhaltungsbutler.de/api/v1`. Das ist
formal falsch, weil `basePath` nur ein Pfad sein darf. Der praktisch korrekte Wert ist
die oben genannte Basis-URL. `securityDefinitions` fehlt in der Datei vollständig, die
Authentifizierung ist dort also gar nicht beschrieben.

### Antwortumschlag

Erfolg, Beispiel aus einer echten, anonymisierten Antwort von `/accounts/get`:

```json
{
  "success": true,
  "message": "",
  "rows": 5,
  "data": [
    { "name": "Kasse", "postingaccount_number": "1000" }
  ]
}
```

Fehler:

```json
{
  "success": false,
  "error_code": 4,
  "message": "customer not found or insufficient privileges"
}
```

Die Schlüsselreihenfolge im Live-System ist `success`, `message`, `rows`, `data`. Die
Swagger-Definitionen listen teils `success`, `rows`, `message`, `data`. Für JSON ist die
Reihenfolge irrelevant, für naive Parser unter Umständen nicht.

`rows` ist die Anzahl der **zurückgegebenen** Zeilen, nicht die Gesamtzahl der Treffer.
Live verifiziert: `/settings/get/postingaccounts` mit `limit: 1000` liefert `rows: 1000`,
obwohl der Mandant mehr Einträge besitzt. Es gibt in keinem der hier dokumentierten
Endpunkte ein Feld für die Gesamtzahl. Paginierung muss über `offset` erfolgen, bis eine
Antwort weniger Zeilen als `limit` liefert.

### Fehlercodes, die bei praktisch allen Endpunkten auftreten

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Request unverändert wiederholen, danach eskalieren. Bei schreibenden Endpunkten vorher prüfen, ob der Datensatz doch angelegt wurde. |
| 400 | 1 | `Api method calls require HTTP requests` | Aufruf ohne HTTP | Tritt bei korrekter HTTPS-Nutzung nicht auf |
| 400 | 2 | `Api method calls require POST requests` | Falsche HTTP-Methode | Immer `POST` verwenden |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | API Client und API Secret prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt, gehört nicht zum API Client, oder fehlende Rechte | `api_key` prüfen, Zuordnung API Client zu Mandant prüfen |
| 403 | 11 | `customer has no active status` | Mandant ist nicht aktiv, etwa gekündigt oder gesperrt | Kein technischer Fix, Vertragsstatus klären |
| 403 | 15 | `adding temporarily restricted` | Anlegen zeitweise gesperrt, nur bei Batch-Endpunkten dokumentiert | Später erneut versuchen |
| 400 | 23 | `no post and files content received or declined` | Kein oder abgelehnter Body, nur bei Cost-Locations dokumentiert | Gültigen JSON-Body senden |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen, bei schreibenden Endpunkten vorher den Zustand prüfen |

Die Swagger-Datei schlüsselt Fehlerantworten als Schlüssel der Form `"401 (3)"` auf, also
HTTP-Status plus `error_code` in Klammern. Derselbe `error_code` hat je nach Endpunkt eine
andere Bedeutung. Ein globales Mapping von `error_code` auf Fehlertext ist deshalb falsch.
Besonders auffällig: `error_code: 21` bedeutet bei Debitoren `invalid customer_number
specified`, bei Kreditoren `invalid due in days specified`.

Auffällig ist außerdem, dass die Codes 2, 11 und 15 in fast allen Endpunkt-Fehlerlisten
fehlen, obwohl sie generisch sind. Die Listen der Swagger-Datei sind daher als
unvollständig zu behandeln, nicht als abschließend. Ein Client muss mit unbekannten
`error_code`-Werten umgehen können.

### Umgang mit HTTP-Status und `success`

Der zuverlässige Indikator ist das Feld `success` im Body. Ein Client sollte primär
`success` auswerten und `error_code` für die Fehlerbehandlung heranziehen. Der HTTP-Status
ist in der Swagger-Datei konsistent dokumentiert, aber nicht live gegen Fehlerfälle
geprüft worden, weil dafür fehlerhafte Requests nötig gewesen wären. Nicht verifiziert.

## Zentrale Begriffsklärung: Konto, Sachkonto, Debitor, Kreditor

Das ist die größte Verwechslungsgefahr der gesamten API. Vier Dinge teilen sich denselben
Nummernraum und denselben Feldnamen `postingaccount_number`, sind aber fachlich
verschieden und werden über verschiedene Endpunkte verwaltet.

| Begriff | Deutsch | API-Endpunkt zum Lesen | API-Endpunkt zum Anlegen | `type` in `/settings/get/postingaccounts` |
| --- | --- | --- | --- | --- |
| account | Basiskonto, Zahlungskonto: Kasse, Bank, Kreditkarte, Verrechnungskonto | `/accounts/get` | `/accounts/add` | `account` |
| postingaccount | Sachkonto, Buchungskonto aus dem Kontenrahmen, etwa Erlöse oder Aufwand | `/settings/get/postingaccounts` | `/settings/add/postingaccount` | `postingaccount` |
| debtor | Debitor, Kundenkonto | `/settings/get/debtors` | `/settings/add/debtor` | `debtor` bzw. `debtor collective` |
| creditor | Kreditor, Lieferantenkonto | `/settings/get/creditors` | `/settings/add/creditor` | `creditor` bzw. `creditor collective` |

### Live-Beleg für die Abgrenzung

Verifiziert am 2026-09-12 gegen die echte API. Die Zahlen stammen aus dem Testmandanten,
Namen sind entfernt.

`/accounts/get` lieferte 5 Datensätze mit ausschließlich den Feldern `name` und
`postingaccount_number`. Die Nummern waren 1000, 1730, 1792, 1200 und 1201.

`/settings/get/postingaccounts` mit `exclude_postingaccounts: true` lieferte 86 Datensätze
mit folgender Verteilung:

| Anzahl | `type` | `subtype` | Nummernbereich |
| --- | --- | --- | --- |
| 1 | `account` | `cash` | 1000 |
| 2 | `account` | `bank/institution` | 1200 bis 1201 |
| 2 | `account` | `other` | 1730 bis 1792 |
| 1 | `debtor collective` | `null` | 10000 |
| 22 | `debtor` | `null` | 10001 bis 10022 |
| 1 | `creditor collective` | `null` | 70000 |
| 57 | `creditor` | `null` | 70150 bis 70206 |

Daraus folgen drei Regeln, die für die Implementierung entscheidend sind:

1. `/settings/get/postingaccounts` ist die **Obermenge**. Es liefert Sachkonten,
   Basiskonten, Debitoren und Kreditoren in einer Liste, unterscheidbar über `type`.
2. `/accounts/get` ist eine **Teilmenge** davon, nämlich genau die Einträge mit
   `type == "account"`. Es liefert aber weniger Felder, insbesondere kein `type` und kein
   `subtype`.
3. Die fünf Basiskonten des Testmandanten tauchen in **beiden** Listen auf, mit identischen
   Nummern. Ein Agent, der beide Endpunkte aufruft und die Ergebnisse zusammenführt, erzeugt
   Duplikate.

### Merksatz für Agenten

- Frage lautet "auf welches Konto ist das Geld geflossen" oder "welche Bankkonten und
  Kassen gibt es": `/accounts/get`.
- Frage lautet "gegen welches Konto wird gebucht", "welche Erlös- oder Aufwandskonten gibt
  es", "wie lautet der Kontenrahmen": `/settings/get/postingaccounts`.
- Frage lautet "welche Kunden" oder "welche Lieferanten": `/settings/get/debtors` bzw.
  `/settings/get/creditors`.

Fachlich formuliert die Wissensdatenbank es so: das Basiskonto ist das Hauptkonto, das
Sachkonto das Gegenkonto. Der Geschäftsvorfall wird auf dem Basiskonto gegen das Sachkonto
gebucht. Quelle: Wissensdatenbank-Artikel zu Basiskonten, abgerufen 2026-09-12.

### Sammelkonten

Die Einträge mit `type` `debtor collective` und `creditor collective` sind die Sammelkonten.
Laut Wissensdatenbank ist das Debitoren-Sammelkonto die 10000 und das
Kreditoren-Sammelkonto die 70000. Beides deckt sich exakt mit der Live-Antwort. Sammelkonten
werden vom System bereitgestellt, nicht über `/settings/add/debtor` oder
`/settings/add/creditor` angelegt. Ein Agent darf sie nicht als gewöhnliche Debitoren oder
Kreditoren behandeln.

Nicht verifiziert: ob `/settings/get/debtors` und `/settings/get/creditors` das jeweilige
Sammelkonto mit ausliefern. In der Live-Stichprobe wurden nur die ersten 5 Datensätze
abgerufen, und diese begannen bei 10001 bzw. 70150. Die Sortierung dieser beiden Endpunkte
ist nicht dokumentiert und wurde nicht geprüft, daher lässt sich daraus nichts schließen.

## Kontenrahmen SKR03 und SKR04

Quelle: Wissensdatenbank-Artikel zu Kontenrahmen und Sachkontenlänge, abgerufen 2026-09-12.

BuchhaltungsButler unterstützt SKR 03, SKR 03 Gastro, SKR 03 Ärzte, SKR 04, SKR 42,
SKR 45 und SKR 49. Die API bietet **keinen** Endpunkt, der den aktiven Kontenrahmen
ausliest. Das ist eine echte Lücke.

### Erkennung des aktiven Kontenrahmens über `/settings/get/postingaccounts`

Der Kontenrahmen lässt sich anhand fester Kontonummern erkennen:

| Kontenrahmen | Kasse | Bank | Umsatzerlöse 19 Prozent |
| --- | --- | --- | --- |
| SKR 03 | 1000 | 1200 | 8400 |
| SKR 04 | 1600 | 1800 | 4400 |
| SKR 45 | 1220 | 1260 | nicht dokumentiert |
| SKR 49 | 0920 | 0945 | nicht dokumentiert |

Live verifiziert am Testmandanten: Die Sachkontenliste enthält 1576 "Abziehbare Vorsteuer
19%", 3300 "Wareneingang - 7/5% Vorsteuer", 4830 "Abschreibungen auf Sachanlagen" und 1590
"Interimskonto / Kontierung nicht bekannt". Alle vier Nummern gehören zum SKR03. Zusätzlich
liegt das Basiskonto vom `subtype` `cash` auf 1000 und die Basiskonten vom `subtype`
`bank/institution` auf 1200 und 1201. Der Mandant nutzt also SKR03.

Empfohlene Heuristik für einen MCP-Server: `/settings/get/postingaccounts` mit
`exclude_accounts: true`, `exclude_creditors: true` und `exclude_debtors: true` abrufen,
dann prüfen, ob die Nummer 8400 oder 4400 existiert. Existiert 8400, ist es ein
SKR03-Derivat, existiert 4400, ein SKR04. Diese Heuristik ist **nicht live verifiziert**,
weil sie eine weitere Abfrage mit hohem `offset` erfordert hätte und das Request-Budget
begrenzt war.

### Kontenlängen und ihre Konsequenzen

Laut Wissensdatenbank sind Sachkonten vier- bis achtstellig, Debitoren- und
Kreditorenkonten haben grundsätzlich eine Stelle mehr, sind also fünf- bis neunstellig.
Die Länge wird bei der Ersteinrichtung festgelegt und kann nicht gewechselt werden.

**Fallstrick führende Nullen.** Live verifiziert: Die API liefert
`postingaccount_number` als String **ohne führende Nullen**. In der Antwort des
Testmandanten kamen 26 Nummern mit zwei Stellen und 202 Nummern mit drei Stellen vor,
etwa `"27"` für "EDV-Software (Anlagevermögen)". Im DATEV-SKR03 ist das bei vierstelliger
Kontenlänge das Konto 0027. Kein einziger der 1000 geprüften Datensätze begann mit einer
Null.

Konsequenzen:

- String-Vergleiche zwischen einer vom Nutzer genannten Nummer wie "0027" und dem
  API-Wert "27" schlagen fehl. Vor dem Vergleich beide Seiten numerisch normalisieren.
- Die Sortierung über den Parameter `order` mit `postingaccount_number ASC` ist live
  **numerisch** und nicht lexikografisch. Verifiziert: die zurückgelieferte Folge war
  10, 15, 20, ..., 4905, also numerisch aufsteigend.
- Eine Ausgabe an den Nutzer sollte die Nummer mit führenden Nullen auf die konfigurierte
  Kontenlänge auffüllen. Die konfigurierte Kontenlänge ist über die API nicht abfragbar.
  Sie lässt sich nur schätzen, etwa über die maximale Stellenzahl der Sachkonten. Das ist
  eine **Annahme** und keine belegte Regel.

### Nummernkreise für Debitoren und Kreditoren

Laut Wissensdatenbank und laut allgemeiner DATEV-Konvention gilt bei vierstelligen
Sachkonten:

| Bereich | Verwendung |
| --- | --- |
| 10000 bis 69999 | Debitoren |
| 70000 bis 99999 | Kreditoren |

Live bestätigt: Debitoren des Testmandanten liegen bei 10000 bis 10022, Kreditoren bei
70000 bis 70206.

Die API validiert die Nummer serverseitig. Bei `/settings/add/debtor` und
`/settings/add/creditor` ist `postingaccount_number` optional. Wird es weggelassen,
vergibt der Server die nächste freie Nummer. Das ist der robustere Weg, weil ein Client
den erlaubten Bereich nicht zuverlässig kennt.

### Gesperrte Kontonummern

Laut Wissensdatenbank sind bestimmte Kontonummern für individuelle Sachkonten gesperrt,
weil sie systemseitig belegt sind, etwa Umsatzsteuerkonten.

Für SKR03 genannt: 1400, 1512, 1517, 1572, 1574, 1577, 1578, 1579, 1589, 1600, 1712, 1717,
1763, 1765, 1771 bis 1779, 1785, 1786, 1787, 3089, 3151, 3152, 3154, 3155, 3440, 3553,
3732, 3735, 3737, 3739, 3740, 3742, 3747, 3749, 3792, 3793, 8333, 8340, 8732, 8735, 8747,
8749, 9303, 9313, 9314, 9333, 9334, 9336.

Für SKR04 genannt: 1200, 1182, 1184, 1402, 1404, 1407, 1408, 1409, 3261, 3270, 3300, 3801
bis 3809, 3813, 3815, 3835, 3836, 3837, 3838, 4333, 4340, 4732, 4735, 4747, 4749, 5189,
5440, 5553, 5732, 5735, 5737, 5739, 5740, 5742, 5747, 5749, 5792, 5793, 5951, 5952, 5954,
5955, 9303, 9304, 9313, 9314, 9333, 9334, 9336.

Ob die API diese Liste identisch durchsetzt, ist **nicht verifiziert**. Der Fehlercode 8
von `/settings/add/postingaccount` lautet `the postingaccount_number already exists or is
not available due to your settings` und deckt diesen Fall vermutlich mit ab.

---

# Debitoren

Debitoren sind Kundenkonten. Sie werden benötigt, wenn eine Ausgangsrechnung debitorisch
erfasst werden soll, also als offener Posten zum Rechnungsdatum statt erst zum
Zahlungsdatum. Quelle: Wissensdatenbank-Artikel "Mit Debitoren und Kreditoren buchen",
abgerufen 2026-09-12.

Beziehung zu Belegen: Beim Anlegen eines Belegs über `/receipts/add` oder
`/receipts/upload` kann das Feld `creditor_debtor` die Buchungskontonummer des Debitors
tragen, wenn der Belegtyp `invoice outbound` ist. Bei `/postings/add/receipt` gibt es das
Pflichtfeld `debtor`. Die Swagger-Datei markiert es als `required: true`, schränkt in der
Beschreibung aber ein: "The field is only required, if you are posting to an outgoing
invoice and if debtor posting is activated." Das ist ein Widerspruch innerhalb derselben
Spezifikation. Details zu Belegen und Buchungen stehen in den jeweils zuständigen
Dossiers, hier nur der Querbezug.

## `/settings/get/debtors`

Liefert die Debitorenkonten des Mandanten als paginierte Liste.

**Einordnung: lesend.** Live verifiziert am 2026-09-12.

### Parameter

Vollständig, 3 Parameter laut `jq '.paths["/settings/get/debtors"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | Der für den zu verwaltenden Mandanten registrierte API-Schlüssel | Undokumentiertes Format, aus der BuchhaltungsButler-Oberfläche zu entnehmen |
| `limit` | integer | nein | 25 | Maximale Anzahl zurückgelieferter Datensätze | Obergrenze nicht dokumentiert und nicht verifiziert |
| `offset` | integer | nein | 0 | Anzahl zu überspringender Datensätze | Ganzzahl ab 0 |

Verschachtelte Objekt- oder Array-Parameter: keine.

### Erfolgsantwort

Umschlag mit `success`, `message`, `rows`, `data`. `data` ist ein Array von Debitoren.

Feldliste, live am 2026-09-12 gegen den Testmandanten erhoben:

| Feld | Typ live | Bedeutung |
| --- | --- | --- |
| `type` | string | Fest `"debitor"`, Beispielwert aus der Spezifikation, live bestätigt |
| `name` | string | Name des Debitors, meist Firmen- oder Kundenname |
| `postingaccount_number` | string | Buchungskontonummer des Debitorenkontos, ohne führende Nullen |
| `contact_person_name` | string | Ansprechpartner, leerer String wenn nicht gesetzt |
| `street` | string | Straße und Hausnummer |
| `additional_addressline` | string | Adresszusatz |
| `zip` | string | Postleitzahl |
| `city` | string | Ort |
| `country` | string | Land, live als zweistelliger ISO-Code geliefert |
| `customer_number` | string | Kundennummer. **Nicht in der Spezifikation enthalten**, live vorhanden |
| `sales_tax_id_eu` | string | Umsatzsteuer-Identifikationsnummer |
| `email` | string | E-Mail-Adresse |
| `uid_ch` | null oder string | Schweizer UID. Live durchgehend `null` |
| `iban` | string | IBAN |
| `bic` | string | BIC |
| `import_pending` | integer | Live durchgehend `0`. Bedeutung nicht dokumentiert, vermutlich Kennzeichen für einen noch laufenden Import. **Annahme** |

Beispielantwort, vollständig anonymisiert, Struktur aus der Live-Antwort, Werte erfunden:

```json
{
  "success": true,
  "message": "",
  "rows": 2,
  "data": [
    {
      "type": "debitor",
      "name": "Musterkunde GmbH",
      "postingaccount_number": "10001",
      "contact_person_name": "",
      "street": "Musterstraße 1",
      "additional_addressline": "",
      "zip": "10000",
      "city": "Musterstadt",
      "country": "DE",
      "customer_number": "",
      "sales_tax_id_eu": "",
      "email": "rechnung@example.invalid",
      "uid_ch": null,
      "iban": "",
      "bic": "",
      "import_pending": 0
    }
  ]
}
```

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | API Client und Secret prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Berechtigung | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid settings type specified` | Interner Typparameter ungültig. Der Endpunkt hat keinen `type`-Parameter, der Code stammt aus einer gemeinsamen Settings-Implementierung | Sollte über die API nicht auslösbar sein. Tritt er auf, ist es ein Serverfehler |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen |

Auffällig: Für `limit` und `offset` sind **keine** Validierungsfehler dokumentiert,
obwohl `/settings/get/postingaccounts` dafür die Codes 6 und 7 definiert. Ob ungültige
Werte hier stillschweigend ignoriert werden oder doch einen Fehler auslösen, ist **nicht
verifiziert**, weil dafür ein bewusst fehlerhafter Request nötig gewesen wäre.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/get/debtors" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "limit": 100,
        "offset": 0
      }'
```

### Fallstricke

- Der Endpunkt heißt `debtors`, der `type`-Wert in der Antwort aber `debitor`. Die API
  mischt englische und latinisierte Schreibweisen.
- Das Antwortfeld heißt `additional_addressline` ohne Unterstrich zwischen `address` und
  `line`. Der Schreibparameter heißt dagegen `additional_address_line` **mit**
  Unterstrich. Ein naives Round-Trip-Mapping bricht daran.
- Das Antwortfeld heißt `sales_tax_id_eu`, der Schreibparameter `sales_tax_id`.
- `customer_number` fehlt in der Spezifikation, ist live aber vorhanden.
- Ein Client darf `limit` nicht auf den Default 25 belassen, wenn er eine vollständige
  Liste braucht. 25 ist ein niedriger Default, der leicht zu unvollständigen
  Agenten-Antworten führt.

### Live-Abweichungen gegenüber der Spezifikation

| Punkt | Spezifikation | Live 2026-09-12 |
| --- | --- | --- |
| `customer_number` im `data`-Objekt | nicht enthalten | vorhanden, String oder leer |
| `uid_ch` | `type: string` | `null` |
| Schlüsselreihenfolge | `success`, `rows`, `message`, `data` | `success`, `message`, `rows`, `data` |
| `rows` in der Definition | `enum: ["1"]`, also String | live Integer `5` |

Die Eigenschaft `rows` wird in fast allen Definitionen der Datei als `"type": "integer"`
deklariert, gleichzeitig aber mit `"enum": ["1"]` beispielhaft als **String** belegt. Das
ist ein Fehler der Spezifikation. Live ist `rows` eine Zahl.

## `/settings/add/debtor`

Legt ein neues Debitorenkonto an.

**Einordnung: SCHREIBEND.** Nicht live verifiziert, weil schreibende Aufrufe gegen die
Produktivbuchhaltung des Nutzers ausgeschlossen waren.

### Parameter

Vollständig, 14 Parameter laut `jq '.paths["/settings/add/debtor"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des zu verwaltenden Mandanten | siehe Grundlagen |
| `name` | string | ja | kein | Name des neuen Debitorenkontos | Längengrenzen nicht dokumentiert |
| `postingaccount_number` | string | nein | Serverseitig nächste freie Nummer | Buchungskontonummer des neuen Debitorenkontos | Wird serverseitig validiert. Typischer Debitorenbereich 10000 bis 69999 bei vierstelligen Sachkonten |
| `contact_person_name` | string | nein | kein | Ansprechpartner | Wird validiert, wenn angegeben |
| `street` | string | nein | kein | Straße und Hausnummer | Wird validiert, wenn angegeben |
| `additional_address_line` | string | nein | kein | Adresszusatz | Wird validiert, wenn angegeben |
| `customer_number` | string | nein | kein | Kundennummer | Wird validiert, wenn angegeben |
| `zip` | string | nein | kein | Postleitzahl | Wird validiert, wenn angegeben |
| `city` | string | nein | kein | Ort | Wird validiert, wenn angegeben |
| `country` | string | nein | kein | Land | **Nur** der deutsche Landesname, etwa `Dänemark`, **oder** der zweistellige ISO-Code, etwa `DK`. Andere Schreibweisen werden abgelehnt |
| `sales_tax_id` | string | nein | kein | Umsatzsteuer-Identifikationsnummer | Wird validiert, wenn angegeben |
| `email` | string | nein | kein | E-Mail-Adresse | Wird validiert, wenn angegeben |
| `iban` | string | nein | kein | IBAN | Wird validiert, wenn angegeben |
| `bic` | string | nein | kein | BIC | Wird validiert, wenn angegeben |

Verschachtelte Objekt- oder Array-Parameter: keine.

Was "wird validiert" konkret bedeutet, sagt die Spezifikation nicht. Erkennbar ist nur, dass
für jedes Feld ein eigener `error_code` existiert. Die konkreten Regeln, etwa erlaubte
Zeichen oder Maximallängen, sind **nicht dokumentiert und nicht verifiziert**.

### Erfolgsantwort

```json
{
  "success": true,
  "postingaccount_number": "123456",
  "message": ""
}
```

Es gibt **kein** `data`-Feld. Die Nummer des neu angelegten Kontos steht direkt auf oberster
Ebene in `postingaccount_number`. Der Wert `"123456"` ist ein Beispielwert aus der
Spezifikation. Das ist der einzige Weg, an die vergebene Nummer zu kommen, wenn sie nicht
im Request gesetzt wurde.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch oder Rechte fehlen | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ ungültig | Über die API nicht direkt auslösbar |
| 400 | 6 | `invalid type specified` | Interner Typ ungültig | Über die API nicht direkt auslösbar |
| 400 | 7 | `invalid postingaccount_number specified` | Nummer formal ungültig, belegt oder außerhalb des Debitorenbereichs | Feld weglassen und die Nummer vom Server vergeben lassen |
| 400 | 8 | `invalid name specified` | `name` fehlt oder ist ungültig | Nicht leeren Namen setzen |
| 400 | 9 | `invalid contact_person_name specified` | Ansprechpartner ungültig | Feld weglassen oder bereinigen |
| 400 | 10 | `invalid street specified` | Straße ungültig | Feld weglassen oder bereinigen |
| 400 | 12 | `invalid additional_addressline specified` | Adresszusatz ungültig | Feld weglassen oder bereinigen |
| 400 | 13 | `invalid zip specified` | Postleitzahl ungültig | Feld weglassen oder bereinigen |
| 400 | 14 | Spezifikation widersprüchlich: Response-Beschreibung sagt `invalid city specified`, das Definitionsobjekt `SettingsAddDebitor_ErrorCode14` sagt `invalid street specified` | Ort ungültig | Feld `city` bereinigen. Auf den `message`-Text darf sich ein Client nicht verlassen |
| 400 | 16 | `invalid country specified` | Land nicht als deutscher Name oder ISO-Code erkannt | Auf zweistelligen ISO-Code umstellen |
| 400 | 17 | `invalid sales_tax_id specified` | USt-IdNr ungültig | Prüfen oder Feld weglassen |
| 400 | 18 | `invalid iban specified` | IBAN ungültig | Prüfen oder Feld weglassen |
| 400 | 19 | `invalid bic specified` | BIC ungültig | Prüfen oder Feld weglassen |
| 400 | 20 | `invalid email specified` | E-Mail ungültig | Prüfen oder Feld weglassen |
| 400 | 21 | `invalid customer_number specified` | Kundennummer ungültig | Prüfen oder Feld weglassen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Vor dem Wiederholen prüfen, ob der Debitor doch angelegt wurde |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Vor dem Wiederholen prüfen, ob der Debitor doch angelegt wurde |

Es fehlt in der Spezifikation der Code 15 (`adding temporarily restricted`), obwohl er beim
Batch-Pendant dokumentiert ist. Ein Client sollte ihn dennoch behandeln können.

Ebenfalls auffällig: es fehlt ein Code 11 in der 400er-Reihe und ein Code 15 in der
400er-Reihe. Die Nummerierung springt von 10 auf 12 und von 14 auf 16. Der Grund ist, dass
11 und 15 global belegt sind.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/add/debtor" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "name": "Musterkunde GmbH",
        "customer_number": "K-1001",
        "street": "Musterstraße 1",
        "zip": "10000",
        "city": "Musterstadt",
        "country": "DE",
        "email": "rechnung@example.invalid",
        "sales_tax_id": "DE000000000",
        "iban": "DE00000000000000000000",
        "bic": "XXXXDEFFXXX"
      }'
```

### Fallstricke

- `postingaccount_number` ist hier vom Typ `string`, bei `/settings/update/debtor` dagegen
  `integer`. Derselbe fachliche Wert hat je nach Endpunkt einen anderen deklarierten Typ.
- Der Schreibparameter heißt `sales_tax_id`, das gelesene Feld `sales_tax_id_eu`.
- Der Schreibparameter heißt `additional_address_line`, das gelesene Feld
  `additional_addressline`.
- `country` akzeptiert laut Spezifikation ausschließlich den deutschen Landesnamen oder den
  ISO-3166-1-alpha-2-Code. Englische Namen wie `Denmark` sind nicht vorgesehen. Für einen
  Agenten ist der ISO-Code der sichere Weg.
- Es gibt keinen Endpunkt zum Löschen eines Debitors. Anlegen ist nicht rückgängig zu
  machen. Ein MCP-Tool muss das dem Agenten und dem Nutzer klar signalisieren.
- Ein Duplikatschutz auf `name` ist nicht dokumentiert. Anders als bei
  `/settings/add/postingaccount` und `/accounts/add` gibt es hier keinen Fehlercode
  `the specified name already exists`. Es ist daher zu **vermuten**, dass zwei Debitoren mit
  identischem Namen entstehen können. Nicht verifiziert.

## `/settings/add-batch/debtors`

Legt mehrere Debitorenkonten in einem Request an.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 2 Parameter laut `jq '.paths["/settings/add-batch/debtors"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `debtors` | array | ja | kein | Array von Debitoren-Objekten | Elementstruktur siehe unten. Maximale Anzahl nicht dokumentiert |

### Struktur eines Array-Elements

Definition `SettingsDebtor`. `required` ist dort ausschließlich `name`.

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | string | ja | Name des Debitors |
| `postingaccount_number` | string | nein | Buchungskontonummer, sonst nächste freie Nummer |
| `contact_person_name` | string | nein | Ansprechpartner |
| `street` | string | nein | Straße |
| `additional_address_line` | string | nein | Adresszusatz |
| `customer_number` | string | nein | Kundennummer |
| `zip` | string | nein | Postleitzahl |
| `city` | string | nein | Ort |
| `country` | string | nein | Deutscher Landesname oder ISO-Code |
| `sales_tax_id` | string | nein | Umsatzsteuer-Identifikationsnummer |
| `iban` | string | nein | IBAN |
| `bic` | string | nein | BIC |

**Widerspruch in der Spezifikation.** Die Beschreibung des Parameters `debtors` lautet:
"an array of debtors, each debtor has the field declaration and validation from the single
add/debtor endpoint". Die Definition `SettingsDebtor` enthält jedoch **kein** `email`,
während der Einzelendpunkt `/settings/add/debtor` es besitzt. Entweder ist die Definition
unvollständig oder die Beschreibung falsch. Ein Client sollte `email` mitsenden und das
Ergebnis prüfen, oder für Debitoren mit E-Mail den Einzelendpunkt verwenden. **Nicht
verifiziert.**

Zusätzlich ist die Beschreibung von `contact_person_name` in `SettingsDebtor` falsch
übernommen: sie lautet dort "The contact person name of your new **creditor** account".
Ein reiner Copy-Paste-Fehler ohne fachliche Bedeutung.

### Erfolgsantwort

Der Endpunkt liefert eine **Teilerfolgs-Antwort**. Es gibt kein `data`, sondern zwei
parallele Arrays:

```json
{
  "success": true,
  "debtors": [
    { "success": true, "postingaccount_number": "10023", "message": "" }
  ],
  "errors": [
    {
      "success": false,
      "error_code": 8,
      "message": "invalid name specified",
      "request_data": []
    }
  ]
}
```

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Gesamtergebnis des Requests, nicht des einzelnen Debitors |
| `debtors` | array | Erfolgreich angelegte Debitoren |
| `debtors[].success` | boolean | Fest `true` |
| `debtors[].postingaccount_number` | string | Vergebene Buchungskontonummer |
| `debtors[].message` | string | Meldung, in der Regel leer |
| `errors` | array | Fehlgeschlagene Einträge |
| `errors[].success` | boolean | Fest `false` |
| `errors[].error_code` | integer | Fehlercode des Einzelfalls, Semantik wie bei `/settings/add/debtor` |
| `errors[].message` | string | Fehlertext des Einzelfalls |
| `errors[].request_data` | array | Die gesendeten Daten des fehlgeschlagenen Eintrags |

**Wichtig:** `success: true` auf oberster Ebene bedeutet **nicht**, dass alle Debitoren
angelegt wurden. Ein Client muss zwingend `errors` auswerten. Ob die Reihenfolge in
`debtors` der Reihenfolge im Request entspricht, ist **nicht dokumentiert und nicht
verifiziert**. Eine Zuordnung von Antwort zu Eingabe ist nur über `request_data` bei
Fehlern und über `name` bei Erfolgen möglich, und damit nicht eindeutig, wenn zwei
Debitoren denselben Namen haben.

`errors[].request_data` ist als `"type": "array"` deklariert. Fachlich ist das ein Objekt,
nämlich der gesendete Datensatz. Das ist vermutlich ein PHP-Artefakt, bei dem ein
assoziatives Array als Array beschrieben wurde. **Nicht verifiziert**, welcher JSON-Typ
tatsächlich kommt.

### Fehlerfälle

Nur Fehler, die den **gesamten** Request betreffen. Feldfehler einzelner Debitoren landen
in `errors`.

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 403 | 15 | `adding temporarily restricted` | Anlegen zeitweise gesperrt, etwa wegen Limits | Später wiederholen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Prüfen, welche Debitoren angelegt wurden, bevor wiederholt wird |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Ebenso |

Dieser Endpunkt verwendet die generischen `Request_ErrorCode*`-Definitionen. Der Text zu
Code 4 lautet hier ausführlicher als bei den Einzelendpunkten.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/add-batch/debtors" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "debtors": [
          {
            "name": "Musterkunde GmbH",
            "customer_number": "K-1001",
            "street": "Musterstraße 1",
            "zip": "10000",
            "city": "Musterstadt",
            "country": "DE"
          },
          {
            "name": "Beispiel AG",
            "postingaccount_number": "10500",
            "country": "AT"
          }
        ]
      }'
```

### Fallstricke

- Teilerfolg ist der Normalfall. Wer nur `success` prüft, verliert stillschweigend
  Datensätze.
- Kein `email` in der Elementdefinition, siehe Widerspruch oben.
- Timeout bei großen Batches ist realistisch. Es gibt keinen Idempotenzschlüssel. Ein
  Retry nach Code 30 kann Duplikate erzeugen. Sicherer Weg: nach einem Timeout zuerst
  `/settings/get/debtors` abfragen und den Ist-Zustand ermitteln.
- Der Antwortumschlag weicht vom Standard ab: kein `rows`, kein `data`.

## `/settings/update/debtor`

Ändert ein bestehendes Debitorenkonto.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 14 Parameter laut `jq '.paths["/settings/update/debtor"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `postingaccount_number` | integer | ja | kein | Buchungskontonummer des zu ändernden Debitors. Dient als Identifikator | **Typ `integer`**, abweichend vom Anlegen |
| `name` | string | nein | unverändert | Neuer Name | Als einziges Feld ohne den Hinweis "If specified, the field will be validated" |
| `contact_person_name` | string | nein | unverändert | Neuer Ansprechpartner | Wird validiert, wenn angegeben |
| `street` | string | nein | unverändert | Neue Straße | Wird validiert, wenn angegeben |
| `additional_address_line` | string | nein | unverändert | Neuer Adresszusatz | Wird validiert, wenn angegeben |
| `customer_number` | string | nein | unverändert | Neue Kundennummer | Wird validiert, wenn angegeben |
| `zip` | string | nein | unverändert | Neue Postleitzahl | Wird validiert, wenn angegeben |
| `city` | string | nein | unverändert | Neuer Ort | Wird validiert, wenn angegeben |
| `country` | string | nein | unverändert | Neues Land | Deutscher Landesname oder zweistelliger ISO-Code |
| `sales_tax_id` | string | nein | unverändert | Neue USt-IdNr | Wird validiert, wenn angegeben |
| `email` | string | nein | unverändert | Neue E-Mail-Adresse | Wird validiert, wenn angegeben |
| `iban` | string | nein | unverändert | Neue IBAN | Wird validiert, wenn angegeben |
| `bic` | string | nein | unverändert | Neuer BIC | Wird validiert, wenn angegeben |

Verschachtelte Objekt- oder Array-Parameter: keine.

Die Buchungskontonummer selbst lässt sich **nicht** ändern. Es gibt keinen Parameter für
eine neue Nummer.

Ob ein weggelassenes Feld unverändert bleibt oder geleert wird, sagt die Spezifikation
nicht ausdrücklich. Die Formulierungen "The new ... of the debtor account" legen
Teilaktualisierung nahe. Das ist eine **Annahme** und nicht verifiziert. Wer sicher gehen
will, liest den Datensatz vorher über `/settings/get/debtors` und sendet alle Felder mit.

### Erfolgsantwort

```json
{
  "success": true,
  "data": {
    "type": "debitor",
    "name": "Musterkunde GmbH",
    "contact_person_name": "",
    "street": "Musterstraße 1",
    "additional_addressline": "",
    "zip": "10000",
    "city": "Musterstadt",
    "country": "DE",
    "sales_tax_id_eu": "",
    "email": "rechnung@example.invalid",
    "uid_ch": null,
    "iban": "",
    "bic": "",
    "postingaccount_number": "10001"
  },
  "message": ""
}
```

Hier ist `data` ein **Objekt**, kein Array. Felder wie bei `/settings/get/debtors`, jedoch
laut Spezifikation **ohne** `import_pending` und **ohne** `customer_number`. Ob live
zusätzliche Felder geliefert werden, ist nicht verifiziert. Angesichts der Tatsache, dass
die Get-Antwort live `customer_number` enthält, obwohl die Spezifikation sie nicht nennt,
ist es **wahrscheinlich**, dass sie hier ebenfalls kommt.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 1 | `wrong debtor account postingaccount_number specified` | Nummer formal falsch, etwa nicht numerisch oder außerhalb des Debitorenbereichs | Nummer aus `/settings/get/debtors` übernehmen |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ | Über die API nicht direkt auslösbar |
| 400 | 8 | `invalid name specified` | Name ungültig | Namen bereinigen |
| 400 | 9 | `invalid contact_person_name specified` | Ansprechpartner ungültig | Feld weglassen oder bereinigen |
| 400 | 10 | `invalid street specified` | Straße ungültig | Feld weglassen oder bereinigen |
| 400 | 12 | `invalid additional_addressline specified` | Adresszusatz ungültig | Feld weglassen oder bereinigen |
| 400 | 13 | `invalid zip specified` | Postleitzahl ungültig | Feld weglassen oder bereinigen |
| 400 | 14 | Response-Beschreibung `invalid city specified`, Definition `SettingsUpdateDebitor_ErrorCode14` sagt `invalid street specified` | Ort ungültig | Feld `city` bereinigen |
| 400 | 16 | `invalid country specified` | Land ungültig | ISO-Code verwenden |
| 400 | 17 | `invalid sales_tax_id specified` | USt-IdNr ungültig | Feld weglassen oder bereinigen |
| 400 | 18 | `invalid iban specified` | IBAN ungültig | Feld weglassen oder bereinigen |
| 400 | 19 | `invalid bic specified` | BIC ungültig | Feld weglassen oder bereinigen |
| 400 | 20 | `invalid email specified` | E-Mail ungültig | Feld weglassen oder bereinigen |
| 400 | 21 | `invalid customer_number specified` | Kundennummer ungültig | Feld weglassen oder bereinigen |
| 400 | 24 | `no debtor found for specified postingaccount_number` | Nummer formal in Ordnung, aber kein Debitor darunter | Nummer prüfen, gegebenenfalls anlegen statt aktualisieren |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen, dann wiederholen |

Der Unterschied zwischen Code 1 und Code 24 ist wichtig: Code 1 heißt "Nummer formal
falsch", Code 24 heißt "Nummer formal richtig, Datensatz existiert nicht". Ein Agent kann
daraus ableiten, ob er die Nummer korrigieren oder den Debitor erst anlegen muss.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/update/debtor" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "postingaccount_number": 10001,
        "name": "Musterkunde GmbH & Co. KG",
        "iban": "DE00000000000000000000",
        "email": "buchhaltung@example.invalid"
      }'
```

### Fallstricke

- `postingaccount_number` ist hier `integer`, beim Anlegen `string`. Ein Client sollte für
  diesen Endpunkt tatsächlich eine Zahl senden, nicht einen String. Ob der Server beides
  akzeptiert, ist **nicht verifiziert**.
- Die Nummer kann nicht geändert werden. Ein Umzug eines Debitors auf eine andere Nummer
  ist über die API nicht möglich.
- Ob nicht gesendete Felder unverändert bleiben, ist nicht dokumentiert. Im Zweifel den
  vollständigen Datensatz senden.
- Auch hier gilt: Schreibfeldnamen `additional_address_line` und `sales_tax_id` stehen
  Lesefeldnamen `additional_addressline` und `sales_tax_id_eu` gegenüber.

---

# Kreditoren

Kreditoren sind Lieferantenkonten. Sie werden benötigt, wenn eine Eingangsrechnung
kreditorisch erfasst werden soll. Die Endpunkte sind strukturell identisch zu den
Debitoren-Endpunkten, mit **zwei** Unterschieden, die leicht übersehen werden:

1. Kreditoren haben zusätzlich das Feld `due_in_days` (Zahlungsziel in Tagen). Debitoren
   haben es nicht.
2. Kreditoren haben **kein** `customer_number` als Schreibparameter. Debitoren haben es.
   Im Lesezugriff liefert die API `customer_number` dennoch für beide, bei Kreditoren live
   als `null`.

Beziehung zu Belegen: `/receipts/add` und `/receipts/upload` akzeptieren im Feld
`creditor_debtor` die Kreditorennummer für Belege vom Typ `invoice inbound`.
`/postings/add/receipt` hat das Feld `creditor`. Laut Wissensdatenbank hilft eine im
Kreditorenstammsatz hinterlegte IBAN und USt-IdNr der automatischen Zuordnung eingehender
Rechnungen und wird für Überweisungen herangezogen.

## `/settings/get/creditors`

Liefert die Kreditorenkonten des Mandanten als paginierte Liste.

**Einordnung: lesend.** Live verifiziert am 2026-09-12.

### Parameter

Vollständig, 3 Parameter laut `jq '.paths["/settings/get/creditors"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `limit` | integer | nein | 25 | Maximale Anzahl Datensätze | Obergrenze nicht dokumentiert |
| `offset` | integer | nein | 0 | Zu überspringende Datensätze | Ganzzahl ab 0 |

Verschachtelte Objekt- oder Array-Parameter: keine.

### Erfolgsantwort

Identische Struktur zu `/settings/get/debtors`, nur `type` ist `"creditor"` statt
`"debitor"`.

| Feld | Typ live | Bedeutung |
| --- | --- | --- |
| `type` | string | Fest `"creditor"` |
| `name` | string | Name des Kreditors |
| `postingaccount_number` | string | Buchungskontonummer des Kreditorenkontos |
| `contact_person_name` | string | Ansprechpartner |
| `street` | string | Straße |
| `additional_addressline` | string | Adresszusatz |
| `zip` | string | Postleitzahl |
| `city` | string | Ort |
| `country` | string | Land, live als zweistelliger ISO-Code |
| `customer_number` | string oder null | **Nicht in der Spezifikation.** Live vorhanden, bei Kreditoren durchgehend `null` |
| `sales_tax_id_eu` | string | USt-IdNr |
| `email` | string | E-Mail-Adresse |
| `uid_ch` | null oder string | Schweizer UID, live `null` |
| `iban` | string | IBAN |
| `bic` | string | BIC |
| `import_pending` | integer | Live `0`, Bedeutung nicht dokumentiert |

**Live verifizierte Abweichung, praktisch wichtig:** Das Feld `due_in_days`, das beim
Anlegen und Aktualisieren gesetzt werden kann, wird von diesem Endpunkt **nicht**
zurückgeliefert. Geprüft am 2026-09-12: die Feldmenge von 5 Kreditoren enthielt kein Feld,
dessen Name `due` enthält. `due_in_days` ist damit über die API schreibbar, aber nicht
lesbar. Ein MCP-Server kann den gesetzten Wert weder anzeigen noch für ein sicheres
Teilupdate rekonstruieren.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ | Über die API nicht direkt auslösbar |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen |

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/get/creditors" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "limit": 100,
        "offset": 0
      }'
```

### Fallstricke

- `due_in_days` ist write-only, siehe oben.
- `customer_number` wird geliefert, obwohl es beim Kreditor keinen Schreibparameter dafür
  gibt. Live ist der Wert `null`. Ein Client darf daraus keinen String-Typ ableiten.
- Default `limit` ist 25, nicht 1000 wie bei `/settings/get/postingaccounts`.
- Auch die Kreditorenliste enthält vermutlich das Sammelkonto 70000. Nicht verifiziert.

## `/settings/add/creditor`

Legt ein neues Kreditorenkonto an.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 14 Parameter laut `jq '.paths["/settings/add/creditor"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `name` | string | ja | kein | Name des neuen Kreditorenkontos | Längengrenzen nicht dokumentiert |
| `postingaccount_number` | string | nein | Serverseitig nächste freie Nummer | Buchungskontonummer | Typischer Kreditorenbereich 70000 bis 99999 bei vierstelligen Sachkonten |
| `contact_person_name` | string | nein | kein | Ansprechpartner | Wird validiert, wenn angegeben |
| `street` | string | nein | kein | Straße | Wird validiert, wenn angegeben |
| `additional_address_line` | string | nein | kein | Adresszusatz | Wird validiert, wenn angegeben |
| `zip` | string | nein | kein | Postleitzahl | Wird validiert, wenn angegeben |
| `city` | string | nein | kein | Ort | Wird validiert, wenn angegeben |
| `country` | string | nein | kein | Land | Deutscher Landesname, etwa `Dänemark`, oder zweistelliger ISO-Code, etwa `DK` |
| `sales_tax_id` | string | nein | kein | USt-IdNr | Wird validiert, wenn angegeben |
| `email` | string | nein | kein | E-Mail-Adresse | Wird validiert, wenn angegeben |
| `iban` | string | nein | kein | IBAN | Wird validiert, wenn angegeben. Wird laut Wissensdatenbank für die Belegzuordnung und für Überweisungen genutzt |
| `bic` | string | nein | kein | BIC | Wird validiert, wenn angegeben |
| `due_in_days` | integer | nein | kein | Zahlungsziel in Tagen | Wertebereich nicht dokumentiert. Die Feldbeschreibung in der Spezifikation lautet fälschlich "of your new **debtor** account" |

Verschachtelte Objekt- oder Array-Parameter: keine.

**Es gibt kein `customer_number`.** Wer aus einem Debitoren-Mapping heraus generisch
arbeitet, sendet es leicht versehentlich mit. Die Spezifikation sagt nicht, was der Server
mit unbekannten Feldern macht. **Nicht verifiziert.**

### Erfolgsantwort

```json
{
  "success": true,
  "postingaccount_number": "123456",
  "message": ""
}
```

Kein `data`-Feld. Die vergebene Nummer steht auf oberster Ebene. `"123456"` ist ein
Beispielwert aus der Spezifikation.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ | Über die API nicht direkt auslösbar |
| 400 | 6 | `invalid type specified` | Interner Typ | Über die API nicht direkt auslösbar |
| 400 | 7 | `invalid postingaccount_number specified` | Nummer ungültig, belegt oder außerhalb des Kreditorenbereichs | Feld weglassen und Nummer vom Server vergeben lassen |
| 400 | 8 | `invalid name specified` | Name fehlt oder ist ungültig | Nicht leeren Namen setzen |
| 400 | 9 | `invalid contact_person_name specified` | Ansprechpartner ungültig | Feld weglassen oder bereinigen |
| 400 | 10 | `invalid street specified` | Straße ungültig | Feld weglassen oder bereinigen |
| 400 | 12 | `invalid additional_addressline specified` | Adresszusatz ungültig | Feld weglassen oder bereinigen |
| 400 | 13 | `invalid zip specified` | Postleitzahl ungültig | Feld weglassen oder bereinigen |
| 400 | 14 | Response-Beschreibung `invalid city specified`, Definition `SettingsAddCreditor_ErrorCode14` sagt `invalid street specified` | Ort ungültig | Feld `city` bereinigen |
| 400 | 16 | `invalid country specified` | Land ungültig | ISO-Code verwenden |
| 400 | 17 | `invalid sales_tax_id specified` | USt-IdNr ungültig | Feld weglassen oder bereinigen |
| 400 | 18 | `invalid iban specified` | IBAN ungültig | Feld weglassen oder bereinigen |
| 400 | 19 | `invalid bic specified` | BIC ungültig | Feld weglassen oder bereinigen |
| 400 | 20 | `invalid email specified` | E-Mail ungültig | Feld weglassen oder bereinigen |
| 400 | 21 | `invalid due in days specified` | Zahlungsziel ungültig. **Achtung: bei Debitoren bedeutet Code 21 `invalid customer_number specified`** | Ganzzahl senden oder Feld weglassen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen, dann wiederholen |

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/add/creditor" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "name": "Musterlieferant GmbH",
        "street": "Lieferweg 2",
        "zip": "20000",
        "city": "Beispielstadt",
        "country": "DE",
        "sales_tax_id": "DE000000000",
        "iban": "DE00000000000000000000",
        "bic": "XXXXDEFFXXX",
        "due_in_days": 14
      }'
```

### Fallstricke

- Kein `customer_number`, anders als beim Debitor.
- `due_in_days` ist schreibbar, aber über `/settings/get/creditors` nicht lesbar. Live
  verifiziert.
- Fehlercode 21 hat hier eine andere Bedeutung als beim Debitor.
- Die Feldbeschreibung von `due_in_days` spricht in der Spezifikation von einem
  "debtor account". Das ist ein Copy-Paste-Fehler, fachlich gilt Kreditor.
- Kein Löschendpunkt vorhanden.
- Kein dokumentierter Duplikatschutz auf `name`.

## `/settings/add-batch/creditors`

Legt mehrere Kreditorenkonten in einem Request an.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 2 Parameter laut `jq '.paths["/settings/add-batch/creditors"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `creditors` | array | ja | kein | Array von Kreditoren-Objekten | Elementstruktur siehe unten. Maximale Anzahl nicht dokumentiert |

### Struktur eines Array-Elements

Definition `SettingsCreditor`. `required` ist dort ausschließlich `name`.

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | string | ja | Name des Kreditors |
| `postingaccount_number` | string | nein | Buchungskontonummer, sonst nächste freie Nummer |
| `contact_person_name` | string | nein | Ansprechpartner |
| `street` | string | nein | Straße |
| `additional_address_line` | string | nein | Adresszusatz |
| `zip` | string | nein | Postleitzahl |
| `city` | string | nein | Ort |
| `country` | string | nein | Deutscher Landesname oder ISO-Code |
| `sales_tax_id` | string | nein | USt-IdNr |
| `iban` | string | nein | IBAN |
| `bic` | string | nein | BIC |
| `due_in_days` | integer | nein | Zahlungsziel in Tagen |

**Widerspruch analog zu den Debitoren:** Die Parameterbeschreibung verspricht die
Felddeklaration des Einzelendpunkts, die Definition `SettingsCreditor` enthält jedoch kein
`email`. **Nicht verifiziert**, ob der Server `email` trotzdem verarbeitet.

### Erfolgsantwort

```json
{
  "success": true,
  "creditors": [
    { "success": true, "postingaccount_number": "70300", "message": "" }
  ],
  "errors": [
    {
      "success": false,
      "error_code": 8,
      "message": "invalid name specified",
      "request_data": []
    }
  ]
}
```

Das Erfolgsarray heißt hier `creditors`, beim Debitoren-Batch `debtors`. Beide Endpunkte
sind damit nicht über einen gemeinsamen Parser abbildbar, ohne den Schlüssel zu
parametrisieren. Semantik der Felder identisch zum Debitoren-Batch.

`success: true` auf oberster Ebene bedeutet nicht, dass alle Kreditoren angelegt wurden.
`errors` ist zwingend auszuwerten.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 403 | 15 | `adding temporarily restricted` | Anlegen zeitweise gesperrt | Später wiederholen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Ist-Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Ist-Zustand prüfen, dann wiederholen |

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/add-batch/creditors" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "creditors": [
          {
            "name": "Musterlieferant GmbH",
            "street": "Lieferweg 2",
            "zip": "20000",
            "city": "Beispielstadt",
            "country": "DE",
            "due_in_days": 14
          },
          {
            "name": "Beispiel Hosting AG",
            "postingaccount_number": "70500",
            "country": "AT"
          }
        ]
      }'
```

### Fallstricke

- Erfolgsarray heißt `creditors`, nicht `data`.
- Teilerfolg ist der Normalfall.
- Kein `email` in der Elementdefinition.
- Kein Idempotenzschlüssel, Retry nach Timeout kann Duplikate erzeugen.

## `/settings/update/creditor`

Ändert ein bestehendes Kreditorenkonto.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 14 Parameter laut `jq '.paths["/settings/update/creditor"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `postingaccount_number` | integer | ja | kein | Buchungskontonummer des zu ändernden Kreditors, dient als Identifikator | **Typ `integer`**, abweichend vom Anlegen |
| `name` | string | nein | unverändert | Neuer Name | Einziges Feld ohne den Validierungshinweis |
| `contact_person_name` | string | nein | unverändert | Neuer Ansprechpartner | Wird validiert, wenn angegeben |
| `street` | string | nein | unverändert | Neue Straße | Wird validiert, wenn angegeben |
| `additional_address_line` | string | nein | unverändert | Neuer Adresszusatz | Wird validiert, wenn angegeben |
| `zip` | string | nein | unverändert | Neue Postleitzahl | Wird validiert, wenn angegeben |
| `city` | string | nein | unverändert | Neuer Ort | Wird validiert, wenn angegeben |
| `country` | string | nein | unverändert | Neues Land | Deutscher Landesname oder ISO-Code |
| `sales_tax_id` | string | nein | unverändert | Neue USt-IdNr | Wird validiert, wenn angegeben |
| `email` | string | nein | unverändert | Neue E-Mail-Adresse | Wird validiert, wenn angegeben |
| `iban` | string | nein | unverändert | Neue IBAN | Wird validiert, wenn angegeben |
| `bic` | string | nein | unverändert | Neuer BIC | Wird validiert, wenn angegeben |
| `due_in_days` | integer | nein | unverändert | Neues Zahlungsziel in Tagen | Beschreibung in der Spezifikation nennt fälschlich "debtor account" |

Verschachtelte Objekt- oder Array-Parameter: keine. Kein `customer_number`.

### Erfolgsantwort

```json
{
  "success": true,
  "data": {
    "type": "creditor",
    "name": "Musterlieferant GmbH",
    "contact_person_name": "",
    "street": "Lieferweg 2",
    "additional_addressline": "",
    "zip": "20000",
    "city": "Beispielstadt",
    "country": "DE",
    "sales_tax_id_eu": "DE000000000",
    "email": "",
    "uid_ch": null,
    "iban": "DE00000000000000000000",
    "bic": "",
    "postingaccount_number": "70150"
  },
  "message": ""
}
```

`data` ist ein Objekt. Die Beschreibung des `data`-Feldes lautet in der Spezifikation
fälschlich "the updated Debitor". Der `type`-Beispielwert ist korrekt `"creditor"`.
`due_in_days` fehlt auch in dieser Antwort.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 1 | `wrong creditor account postingaccount_number specified` | Nummer formal falsch | Nummer aus `/settings/get/creditors` übernehmen |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ | Über die API nicht direkt auslösbar |
| 400 | 8 | `invalid name specified` | Name ungültig | Namen bereinigen |
| 400 | 9 | `invalid contact_person_name specified` | Ansprechpartner ungültig | Feld weglassen oder bereinigen |
| 400 | 10 | `invalid street specified` | Straße ungültig | Feld weglassen oder bereinigen |
| 400 | 12 | `invalid additional_addressline specified` | Adresszusatz ungültig | Feld weglassen oder bereinigen |
| 400 | 13 | `invalid zip specified` | Postleitzahl ungültig | Feld weglassen oder bereinigen |
| 400 | 14 | Response-Beschreibung `invalid city specified`, Definition `SettingsUpdateCreditor_ErrorCode14` sagt `invalid street specified` | Ort ungültig | Feld `city` bereinigen |
| 400 | 16 | `invalid country specified` | Land ungültig | ISO-Code verwenden |
| 400 | 17 | `invalid sales_tax_id specified` | USt-IdNr ungültig | Feld weglassen oder bereinigen |
| 400 | 18 | `invalid iban specified` | IBAN ungültig | Feld weglassen oder bereinigen |
| 400 | 19 | `invalid bic specified` | BIC ungültig | Feld weglassen oder bereinigen |
| 400 | 20 | `invalid email specified` | E-Mail ungültig | Feld weglassen oder bereinigen |
| 400 | 21 | `invalid due in days specified` | Zahlungsziel ungültig | Ganzzahl senden oder Feld weglassen |
| 400 | 24 | `no creditor found for specified postingaccount_number` | Nummer formal richtig, Datensatz existiert nicht | Nummer prüfen, gegebenenfalls anlegen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen, dann wiederholen |

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/update/creditor" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "postingaccount_number": 70150,
        "name": "Musterlieferant SE",
        "due_in_days": 30
      }'
```

### Fallstricke

- Ein Teilupdate von `due_in_days` ist nicht sicher prüfbar, weil der Wert nicht gelesen
  werden kann. Live verifiziert, dass `/settings/get/creditors` ihn nicht liefert.
- `postingaccount_number` ist `integer`, beim Anlegen `string`.
- Die Nummer selbst kann nicht geändert werden.
- Kein `customer_number`-Parameter, obwohl die Leseantwort das Feld enthält.

---

# Sachkonten (Postingaccounts)

Sachkonten sind die Buchungskonten des Kontenrahmens, also Aufwands-, Erlös- und
Bestandskonten. Sie sind das Gegenkonto zum Basiskonto.

## `/settings/get/postingaccounts`

Liefert den Kontenplan des Mandanten. Trotz des Namens liefert der Endpunkt **nicht nur**
Sachkonten, sondern standardmäßig auch Basiskonten, Debitoren und Kreditoren.

**Einordnung: lesend.** Live verifiziert am 2026-09-12, zweimal mit unterschiedlichen
Parametern.

### Parameter

Vollständig, 8 Parameter laut `jq '.paths["/settings/get/postingaccounts"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `limit` | integer | nein | 1000 | Maximale Anzahl Datensätze | Obergrenze nicht dokumentiert. Live mit 1000 erfolgreich |
| `offset` | integer | nein | 0 | Zu überspringende Datensätze | Ganzzahl ab 0 |
| `order` | string | nein | nicht dokumentiert | Sortierung | Erlaubt laut Spezifikation: `postingaccount_number ASC`, `postingaccount_number DESC`, `name ASC`, `name DESC`, `type ASC`, `type DESC`. Genau ein Feld plus Richtung, getrennt durch ein Leerzeichen |
| `exclude_postingaccounts` | boolean | nein | false | Schließt alle Einträge mit `type == "postingaccount"` aus | `true` oder `false` |
| `exclude_accounts` | boolean | nein | false | Schließt alle Basiskonten aus, etwa Bankkonten | `true` oder `false` |
| `exclude_creditors` | boolean | nein | false | Schließt alle Kreditoren-Buchungskonten aus | `true` oder `false` |
| `exclude_debtors` | boolean | nein | false | Schließt alle Debitoren-Buchungskonten aus | `true` oder `false` |

Verschachtelte Objekt- oder Array-Parameter: keine.

Der Default von `limit` ist hier **1000**, nicht 25 wie bei Debitoren und Kreditoren.

### Erfolgsantwort

Umschlag mit `success`, `message`, `rows`, `data`. `data` ist ein Array.

| Feld | Typ live | Bedeutung |
| --- | --- | --- |
| `postingaccount_number` | string | Buchungskontonummer, ohne führende Nullen |
| `name` | string | Bezeichnung des Kontos |
| `type` | string | Art des Eintrags, siehe Tabelle unten |
| `subtype` | string oder null | Unterart, siehe Tabelle unten |
| `parent_postingaccount_number` | string | Nummer des Vorlagekontos. Live durchgehend leerer String `""` |
| `parent_name` | null oder string | Name des Vorlagekontos. Live durchgehend `null` |

### Beobachtete Werte für `type` und `subtype`

Live am 2026-09-12 erhoben. Die Spezifikation nennt als Beispiel nur
`type: "postingaccount"` und `subtype: "default chart"`.

| `type` | `subtype` live | Bedeutung | In Spezifikation dokumentiert |
| --- | --- | --- | --- |
| `postingaccount` | `default` | Sachkonto aus dem Standardkontenrahmen | `type` ja, `subtype`-Wert nein |
| `account` | `cash` | Basiskonto vom Typ Kasse | nein |
| `account` | `bank/institution` | Basiskonto vom Typ Bank oder Geldinstitut | nein |
| `account` | `other` | Sonstiges Basiskonto, etwa Kreditkarte oder Verrechnungskonto | nein |
| `debtor` | `null` | Debitorenkonto | nein |
| `debtor collective` | `null` | Debitoren-Sammelkonto | nein |
| `creditor` | `null` | Kreditorenkonto | nein |
| `creditor collective` | `null` | Kreditoren-Sammelkonto | nein |

**Der in der Spezifikation als Beispiel genannte `subtype`-Wert `"default chart"` wurde
live nicht beobachtet. Stattdessen kam `"default"`.** Ein Client darf sich nicht auf
`"default chart"` verlassen.

**Schreibweisen-Inkonsistenz zwischen Endpunkten, live belegt:** In
`/settings/get/postingaccounts` heißt der Debitorentyp `debtor`. In
`/settings/get/debtors` heißt derselbe Typ `debitor`. Ein gemeinsames Enum über beide
Endpunkte existiert nicht.

Für individuell angelegte Sachkonten sind `subtype` und `parent_postingaccount_number`
vermutlich anders belegt, weil ein solches Konto laut Spezifikation von einem Vorlagekonto
erbt. Im Testmandanten gab es unter den ersten 1000 Einträgen kein individuell angelegtes
Sachkonto, deshalb konnte das **nicht verifiziert** werden.

### Beispielantwort

Anonymisiert. Struktur aus der Live-Antwort, Kontonummern und Namen des Standardkontenrahmens
sind keine Geschäftsdaten und daher unverändert. Der Name des Basiskontos ist maskiert.

```json
{
  "success": true,
  "message": "",
  "rows": 3,
  "data": [
    {
      "postingaccount_number": "1576",
      "name": "Abziehbare Vorsteuer 19%",
      "type": "postingaccount",
      "subtype": "default",
      "parent_postingaccount_number": "",
      "parent_name": null
    },
    {
      "postingaccount_number": "1000",
      "name": "<maskiert>",
      "type": "account",
      "subtype": "cash",
      "parent_postingaccount_number": "",
      "parent_name": null
    },
    {
      "postingaccount_number": "10000",
      "name": "<maskiert>",
      "type": "debtor collective",
      "subtype": null,
      "parent_postingaccount_number": "",
      "parent_name": null
    }
  ]
}
```

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ | Über die API nicht direkt auslösbar |
| 400 | 6 | `invalid limit specified` | `limit` kein gültiger Integer oder außerhalb des erlaubten Bereichs | Ganzzahl senden, bei Unsicherheit Feld weglassen |
| 400 | 7 | `invalid offset specified` | `offset` ungültig | Ganzzahl ab 0 senden |
| 400 | 8 | `invalid order specified` | `order` nicht in der erlaubten Liste | Exakt einen der sechs erlaubten Werte senden |
| 400 | 9 | `invalid exclude_accounts specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 400 | 10 | `invalid exclude_postingaccounts specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 400 | 12 | `invalid exclude_creditors specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 400 | 13 | `invalid exclude_debtors specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | `limit` reduzieren und wiederholen |

Die Codes 9 und 10 sind gegenüber der Parameterreihenfolge vertauscht: Code 9 gehört zu
`exclude_accounts`, das in der Parameterliste **nach** `exclude_postingaccounts` steht.
Nur eine Kuriosität, keine praktische Auswirkung.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/get/postingaccounts" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "limit": 1000,
        "offset": 0,
        "order": "postingaccount_number ASC",
        "exclude_accounts": true,
        "exclude_creditors": true,
        "exclude_debtors": true
      }'
```

Dieser Aufruf liefert ausschließlich die Sachkonten des Kontenrahmens. Das ist in der Regel
das, was ein Agent meint, wenn er nach "Buchungskonten" fragt.

### Fallstricke und Live-Abweichungen

- Ohne `exclude_*`-Parameter mischt der Endpunkt vier verschiedene Objektarten. Wer die
  Ergebnisse einem Nutzer als "Sachkonten" präsentiert, verwechselt Kasse und Kunden mit
  Aufwandskonten.
- `rows` ist die Anzahl der gelieferten Zeilen, nicht die Gesamtzahl. Live verifiziert:
  `limit: 1000` ergab `rows: 1000` bei mehr vorhandenen Datensätzen. Ohne Paginierung
  arbeitet ein Agent mit einem abgeschnittenen Kontenplan.
- Sortierung über `order` mit `postingaccount_number ASC` ist live numerisch, nicht
  lexikografisch. Verifiziert: Folge 10, 15, 20, ..., 4905.
- Keine führenden Nullen in `postingaccount_number`. SKR03-Konto 0027 kommt als `"27"`.
  Live verifiziert: kein einziger von 1000 Werten begann mit `0`.
- `parent_postingaccount_number` ist live ein **leerer String**, nicht `null`. `parent_name`
  ist live `null`. Zwei verschiedene Leerwert-Konventionen in einem Objekt.
- `subtype` ist für Debitoren und Kreditoren `null`, für Sachkonten und Basiskonten ein
  String. Ein Client braucht einen nullable-Typ.
- Der Beispielwert `"default chart"` aus der Spezifikation existiert live nicht.
- Es gibt keinen Filter auf einen Nummernbereich und keine Textsuche. Wer ein Konto über
  seinen Namen sucht, muss die gesamte Liste laden und lokal filtern.

## `/settings/add/postingaccount`

Legt ein individuelles Sachkonto an, abgeleitet von einem Vorlagekonto.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 4 Parameter laut `jq '.paths["/settings/add/postingaccount"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `name` | string | ja | kein | Bezeichnung des neuen Sachkontos | Länge wird serverseitig gegen eine mandantenabhängige Unter- und Obergrenze geprüft, die in der Fehlermeldung als `%min%` und `%max%` eingesetzt wird. Konkrete Werte nicht dokumentiert |
| `postingaccount_number` | integer | ja | kein | Nummer des neuen Sachkontos | Stellenzahl und erlaubter Bereich hängen von der Kontenlänge des Mandanten ab. Muss frei und nicht gesperrt sein |
| `parent_postingaccount_number` | integer | ja | kein | Nummer des Vorlagekontos, von dem das neue Konto seine Eigenschaften erbt | Muss ein gültiges Konto des Standardkontenrahmens sein. Ein manuell angelegtes Konto ist **nicht** als Vorlage zulässig |

Verschachtelte Objekt- oder Array-Parameter: keine.

### Fachlicher Hintergrund zum Vorlagekonto

Quelle: Wissensdatenbank-Artikel "Individuelle Sachkonten anlegen", abgerufen 2026-09-12.

Das Vorlagekonto bestimmt die Grundeinstellungen des neuen Kontos. Das neue Konto verhält
sich in den Auswertungen genauso wie das Vorlagekonto und übernimmt dessen
Hintergrundeigenschaften, insbesondere **Steuerautomatiken**. Trägt der Name des
Vorlagekontos einen Steuersatz, etwa "Erlöse 19% USt", handelt es sich um ein
Automatikkonto, und die Steuerautomatik wird mit übernommen. In diesem Fall sollte der
Steuersatz auch im Namen des neuen Kontos auftauchen.

Praktisch bedeutet das: die Wahl des Vorlagekontos ist eine **steuerlich wirksame
Entscheidung**, nicht bloß eine Formalie. Ein Agent darf sie nicht raten. Üblich ist, die
Nummer des neuen Kontos im selben Nummernkreis wie das Vorlagekonto zu wählen.

### Erfolgsantwort

```json
{
  "success": true,
  "message": "",
  "postingaccount_number": "123456",
  "parent_postingaccount_number": "123456"
}
```

Kein `data`-Feld. Beide Nummern kommen als **String** zurück, obwohl sie als `integer`
gesendet werden. Die Werte `"123456"` sind Beispielwerte aus der Spezifikation.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `no postingaccount_number specified` | Pflichtfeld fehlt | `postingaccount_number` setzen |
| 400 | 6 | `the postingaccount_number must have %min% to %max% digits` | Stellenzahl passt nicht zur Kontenlänge des Mandanten | Stellenzahl aus vorhandenen Konten ableiten, siehe Abschnitt Kontenlängen |
| 400 | 7 | `postingaccount_number is out of allowed range [detailed error message]` | Nummer außerhalb des erlaubten Bereichs. Der Server hängt eine genauere Meldung an | Angehängten Meldungstext an den Nutzer weitergeben |
| 400 | 8 | `the postingaccount_number already exists or is not available due to your settings` | Nummer belegt oder gesperrt | Andere Nummer wählen. Liste gesperrter Nummern siehe Abschnitt Kontenrahmen |
| 400 | 9 | `invalid postingaccount_number specified` | Nummer formal ungültig, etwa nicht numerisch | Ganzzahl senden |
| 400 | 10 | `no name specified` | Pflichtfeld fehlt | `name` setzen |
| 400 | 12 | `the postingaccount name must be %min% to %max% characters long` | Name zu kurz oder zu lang | Namenslänge anpassen, Grenzwerte aus der Meldung übernehmen |
| 400 | 13 | `the specified name already exists` | Ein Konto mit diesem Namen existiert bereits | Eindeutigen Namen wählen |
| 400 | 14 | `invalid name specified` | Name formal ungültig, etwa unerlaubte Zeichen | Namen bereinigen |
| 400 | 16 | `no parent_postingaccount_number specified` | Pflichtfeld fehlt | Vorlagekonto setzen |
| 400 | 17 | `the postingaccount_number must be at least %min% digits long` | Nummer zu kurz | Stellenzahl erhöhen |
| 400 | 18 | `the parent_postingaccount_number is not valid or is not available due to your settings or was added manually` | Vorlagekonto existiert nicht, ist gesperrt oder ist selbst ein individuell angelegtes Konto | Ein Konto mit `subtype == "default"` als Vorlage wählen |
| 400 | 19 | `invalid parent_postingaccount_number specified` | Formal ungültig | Ganzzahl senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen, dann wiederholen |

Die Platzhalter `%min%` und `%max%` stehen so in der Spezifikation. Nicht verifiziert, ob
der Server sie in der Live-Antwort tatsächlich durch Zahlen ersetzt. Ein Client sollte den
`message`-Text unverändert an den Nutzer durchreichen statt ihn zu parsen.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/add/postingaccount" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "name": "Softwarelizenzen Cloud 19% USt",
        "postingaccount_number": 4931,
        "parent_postingaccount_number": 4930
      }'
```

### Fallstricke

- Anders als bei Debitoren und Kreditoren ist `postingaccount_number` hier **Pflicht**. Es
  gibt keine automatische Nummernvergabe.
- Die Nummern werden als `integer` gesendet und als `string` zurückgegeben.
- Gesperrte Kontonummern führen zu Code 8, nicht zu einem eigenen Code.
- Das Vorlagekonto überträgt Steuerautomatiken. Falsche Wahl bedeutet falsche
  Steuerbuchungen. Ein MCP-Tool sollte hier eine Bestätigung durch den Nutzer erzwingen.
- Ein individuell angelegtes Konto darf nicht selbst wieder als Vorlage dienen, Code 18.
- Es gibt keinen Endpunkt zum Löschen eines Sachkontos.

## `/settings/update/postingaccount`

Ändert die Bezeichnung eines Sachkontos.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 3 Parameter laut `jq '.paths["/settings/update/postingaccount"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `name` | string | ja | kein | Neue Bezeichnung des Sachkontos | Längengrenzen mandantenabhängig, siehe Fehlercode 7 |
| `postingaccount_number` | integer | ja | kein | Nummer des zu ändernden Sachkontos, dient als Identifikator | Ganzzahl |

Verschachtelte Objekt- oder Array-Parameter: keine.

`name` ist hier **Pflicht**. Der Endpunkt kann ausschließlich den Namen ändern. Weder die
Nummer noch das Vorlagekonto lassen sich nachträglich anpassen.

### Erfolgsantwort

```json
{
  "success": true,
  "data": {
    "name": "Softwarelizenzen Cloud 19% USt",
    "postingaccount_number": "4931"
  },
  "message": ""
}
```

`data` ist ein Objekt mit genau zwei Feldern. `type`, `subtype` und die Vorlagefelder
fehlen, anders als bei `/settings/get/postingaccounts`.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid settings type specified` | Interner Settings-Typ | Über die API nicht direkt auslösbar |
| 400 | 6 | `no name specified` | Pflichtfeld fehlt | `name` setzen |
| 400 | 7 | `the postingaccount name must be %min% to %max% characters long` | Name zu kurz oder zu lang | Länge anpassen |
| 400 | 8 | `invalid name specified` | Name formal ungültig | Namen bereinigen |
| 400 | 9 | `wrong postingaccount_number specified` | Nummer formal falsch | Ganzzahl aus `/settings/get/postingaccounts` übernehmen |
| 400 | 10 | `no postingaccount found for specified postingaccount_number` | Nummer formal richtig, Konto existiert nicht | Nummer prüfen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen |

Es gibt **keinen** Fehlercode `the specified name already exists`, anders als beim Anlegen.
Ob beim Umbenennen auf einen bereits vergebenen Namen geprüft wird, ist **nicht
verifiziert**.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/settings/update/postingaccount" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "postingaccount_number": 4931,
        "name": "Softwarelizenzen SaaS 19% USt"
      }'
```

### Fallstricke

- Nicht verifiziert, ob auch Konten des Standardkontenrahmens umbenannt werden können oder
  nur individuell angelegte. Die Spezifikation unterscheidet nicht.
- Wird ein Automatikkonto umbenannt und dabei der Steuersatz aus dem Namen entfernt, geht
  die fachliche Kennzeichnung verloren, die Steuerautomatik selbst bleibt laut
  Wissensdatenbank an der Kontoeigenschaft hängen. Ein Umbenennen kann dadurch zu einem
  irreführenden Kontenplan führen.
- Die Nummer lässt sich nicht ändern.

---

# Konten (Basiskonten, Accounts)

Basiskonten sind die Zahlungskonten des Mandanten: Kasse, Bankkonten, Kreditkartenkonten,
Auslagen- und Verrechnungskonten. In BuchhaltungsButler ist das Basiskonto das Hauptkonto
eines Buchungssatzes, das Sachkonto das Gegenkonto. Quelle: Wissensdatenbank-Artikel
"Informationen zu Basiskonten und zur Einrichtung", abgerufen 2026-09-12.

Jedes Basiskonto belegt eine Buchungskontonummer aus dem Kontenrahmen. Deshalb erscheint
es sowohl in `/accounts/get` als auch in `/settings/get/postingaccounts`.

## `/accounts/get`

Liefert alle Basiskonten des Mandanten.

**Einordnung: lesend.** Live verifiziert am 2026-09-12.

### Parameter

Vollständig, 1 Parameter laut `jq '.paths["/accounts/get"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |

Verschachtelte Objekt- oder Array-Parameter: keine.

**Es gibt kein `limit` und kein `offset`.** Der Endpunkt liefert immer alles. Eine
Obergrenze ist nicht dokumentiert. Bei Mandanten mit sehr vielen Konten ist das ein
potenzielles Problem, in der Praxis aber unwahrscheinlich, weil Basiskonten selten sind.

### Erfolgsantwort

Live verifiziert, Umschlag `success`, `message`, `rows`, `data`. `data` ist ein Array mit
genau **zwei** Feldern pro Eintrag.

| Feld | Typ live | Bedeutung |
| --- | --- | --- |
| `name` | string | Bezeichnung des Basiskontos, wie in der Oberfläche vergeben. Enthält häufig einen Teil der Kontonummer der Bank |
| `postingaccount_number` | string | Buchungskontonummer des Basiskontos im Kontenrahmen |

Beispielantwort, anonymisiert. Die Struktur stammt aus der echten Antwort des
Testmandanten, Namen und Nummern sind ersetzt.

```json
{
  "success": true,
  "message": "",
  "rows": 3,
  "data": [
    { "name": "Kasse", "postingaccount_number": "1000" },
    { "name": "Geschäftskonto (XXXXXXXX)", "postingaccount_number": "1200" },
    { "name": "Kreditkarte", "postingaccount_number": "1730" }
  ]
}
```

Der echte Testmandant hatte 5 Basiskonten auf den Nummern 1000, 1200, 1201, 1730 und 1792.
Diese Nummern entsprechen im SKR03 Kasse, Bank, Bank 1, Kreditkartenabrechnung und
Sonstige Verrechnungskonten. Quelle für die Zuordnung: Wissensdatenbank, Liste zulässiger
Basiskonten.

**Kein `type`, kein `subtype`, keine ID.** Wer wissen will, ob ein Basiskonto eine Kasse
oder ein Bankkonto ist, muss `/settings/get/postingaccounts` abfragen und dort den
`subtype` auswerten. Das ist eine echte Einschränkung dieses Endpunkts.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen |

Die kürzeste Fehlerliste aller hier dokumentierten Endpunkte. Der Endpunkt hat keine
validierbaren Parameter außer `api_key`.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/accounts/get" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{ "api_key": "<API_KEY>" }'
```

### Fallstricke

- Kein Typ in der Antwort. Für Typinformationen ist `/settings/get/postingaccounts` nötig.
- Der `name` enthält bei angebundenen Bankkonten häufig Teile der echten Kontonummer. Das
  sind personenbezogene beziehungsweise geschäftskritische Daten. Ein MCP-Server sollte sie
  nicht ungefiltert in Logs schreiben.
- Die Einträge sind identisch mit den `type == "account"`-Einträgen aus
  `/settings/get/postingaccounts`. Live verifiziert: dieselben fünf Nummern in beiden
  Antworten.
- Es gibt keinen Endpunkt zum Aktualisieren oder Löschen eines Basiskontos.

## `/accounts/add`

Legt ein neues manuell geführtes Basiskonto an.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 6 Parameter laut `jq '.paths["/accounts/add"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `type` | string | ja | kein | Art des Basiskontos | Genau einer von drei Werten: `cash`, `bank/institution`, `other`. Wörtlich so in der Spezifikation, inklusive Schrägstrich |
| `name` | string | ja | kein | Bezeichnung des Basiskontos | Länge mandantenabhängig, siehe Fehlercode 8 |
| `postingaccount_number` | integer | ja | kein | Buchungskontonummer des neuen Basiskontos | Muss zum Kontenrahmen und zum gewünschten Kontotyp passen, siehe Tabelle unten |
| `receipt_creates_transaction` | boolean | nein | false | Wenn `true`, erzeugt ein diesem Konto zugewiesener Beleg automatisch eine Zahlung auf diesem Konto | `true` oder `false` |
| `is_revision_safe` | boolean | nein | false | Macht ein Kassenkonto revisionssicher. Gespeicherte Zahlungen können dann nur noch über eine Stornobuchung entfernt werden | `true` oder `false`. Laut Spezifikation **ausdrücklich nur für `type: "cash"` wirksam** |

Verschachtelte Objekt- oder Array-Parameter: keine.

Die Werte von `type` decken sich exakt mit den live beobachteten `subtype`-Werten der
`type == "account"`-Einträge in `/settings/get/postingaccounts`: `cash`,
`bank/institution` und `other`. Live verifiziert am 2026-09-12. Damit ist der
Schreibparameter `type` dasselbe wie das Lesefeld `subtype`, nur unter anderem Namen.

### Zulässige Buchungskontonummern je Kontotyp

Auszug aus der Wissensdatenbank, Artikel "Informationen zu Basiskonten und zur
Einrichtung", abgerufen 2026-09-12. Die vollständige Tabelle enthält deutlich mehr Zeilen.
Diese Werte sind Konfigurationswissen von BuchhaltungsButler, **nicht** aus der API
abfragbar und nicht live verifiziert.

| Kontotyp | Bezeichnung | SKR03 | SKR04 | SKR45 | SKR49 |
| --- | --- | --- | --- | --- | --- |
| `cash` | Kasse | 1000 | 1600 | 1220 | 0920 |
| `cash` | Nebenkasse 1 | 1010 | 1610 | nicht genannt | nicht genannt |
| `cash` | Nebenkasse 2 | 1020 | 1620 | nicht genannt | nicht genannt |
| `bank/institution` | Bank | 1200 | 1800 | 1260 | 0945 |
| `bank/institution` | Bank 1 bis Bank 4 | 1210, 1220, 1230, 1240 | 1810, 1820, 1830, 1840 | 1261 bis 1264 | 0950 bis 0970 |
| `bank/institution` | Bank 5 | 1250 bis 1288 | 1850 bis 1888 | 1265 | 0975 |
| `bank/institution` | Postbank | 1100 | 1700 | 1240 | 0940 |
| `other` | Kreditkartenabrechnung | 1730 | 3610 | nicht genannt | 1681 |
| `other` | Sonstige Verrechnungskonten (Interimskonten) | 1792 | 3630 | 3584 | nicht genannt |
| `other` | Verrechnungskonto Gewinnermittlung Paragraf 4 Absatz 3 EStG | 1371 | 1486 | nicht genannt | nicht genannt |
| `other` | Privateinlagen | 1890 bis 1899 | 2180 bis 2189 | 2120 bis 2129 | nicht genannt |
| `other` | Sonstige Verbindlichkeiten | 1700 | 3500 | 3570 | 1800 |
| `other` | Darlehen | 1705 | 3560 | nicht genannt | 1630 |

Die Nummern 1730 und 1792 des Testmandanten wurden live mit `subtype: "other"` bestätigt
und passen exakt zu dieser Tabelle. Das stützt die Zuordnung, ersetzt aber keine
vollständige Verifikation.

### Erfolgsantwort

```json
{
  "success": true,
  "message": "",
  "postingaccount_number": "123"
}
```

Kein `data`-Feld. Der Beispielwert `"123"` stammt aus der Spezifikation.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `no type specified` | Pflichtfeld fehlt | `type` setzen |
| 400 | 6 | `invalid type specified` | `type` nicht in `cash`, `bank/institution`, `other` | Einen der drei Werte verwenden |
| 400 | 7 | `no name specified` | Pflichtfeld fehlt | `name` setzen |
| 400 | 8 | `the account name must be %min% to %max% characters long` | Name zu kurz oder zu lang | Länge anpassen |
| 400 | 9 | `the specified name already exists` | Basiskonto mit diesem Namen existiert bereits | Eindeutigen Namen wählen |
| 400 | 10 | `invalid name specified` | Name formal ungültig | Namen bereinigen |
| 400 | 12 | `no postingaccount_number specified` | Pflichtfeld fehlt | Nummer setzen |
| 400 | 13 | `the postingaccount_number must have %min% to %max% digits` | Stellenzahl passt nicht zur Kontenlänge. Die Response-Beschreibung nennt hier abweichend "the booking account number", das Definitionsobjekt "the postingaccount_number" | Stellenzahl anpassen |
| 400 | 14 | `postingaccount_number is out of allowed range [detailed error message]` | Nummer außerhalb des für diesen Kontotyp erlaubten Bereichs | Tabelle der zulässigen Nummern oben heranziehen, angehängte Servermeldung an den Nutzer weitergeben |
| 400 | 16 | `the postingaccount_number already exists` | Nummer belegt | Andere Nummer wählen |
| 400 | 17 | `invalid postingaccount_number specified` | Formal ungültig | Ganzzahl senden |
| 400 | 18 | `invalid receipt_creates_transaction specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 400 | 19 | `invalid is_revision_safe specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen, dann wiederholen |

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/accounts/add" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "type": "other",
        "name": "Auslagen Mitarbeitende",
        "postingaccount_number": 1792,
        "receipt_creates_transaction": true,
        "is_revision_safe": false
      }'
```

### Fallstricke

- `type` enthält einen Schrägstrich: `bank/institution`. Der Wert muss exakt so gesendet
  werden, nicht `bank` oder `institution`.
- `is_revision_safe` wirkt laut Spezifikation nur bei `type: "cash"`. Was bei anderen Typen
  passiert, ob der Wert ignoriert wird oder Fehlercode 19 auslöst, ist **nicht
  verifiziert**.
- Revisionssicherheit ist eine Einbahnstraße mit steuerlichen Folgen: gespeicherte
  Zahlungen können danach nur noch per Stornobuchung entfernt werden. Ein MCP-Tool sollte
  das nie ohne ausdrückliche Nutzerbestätigung setzen. Ob sich die Eigenschaft nachträglich
  abschalten lässt, ist über die API nicht möglich, da es keinen Update-Endpunkt gibt.
- `receipt_creates_transaction` hat eine fachliche Nebenwirkung: laut Wissensdatenbank
  können Belege auf einem Konto mit aktiver Logik "Beleg erzeugt Zahlung" **nicht**
  debitorisch oder kreditorisch gebucht werden, weil sie nie einen offenen Posten erzeugen.
  Wer Debitoren- und Kreditorenbuchhaltung nutzt, sollte das Flag bewusst wählen.
- Die Nummer muss zum Kontotyp passen. Es gibt keinen API-Endpunkt, der die zulässigen
  Bereiche ausliest. Der Server liefert im Fehlerfall 14 eine genauere Meldung.
- Kein Update- und kein Löschendpunkt.

---

# Kostenstellen (Cost-Locations)

Kostenstellen gliedern Buchungen nach Bereichen, Projekten, Abteilungen oder
Betriebsstätten. Sie müssen im Mandanten aktiviert sein, bevor sie genutzt werden können.
Quelle: Wissensdatenbank-Artikel "Projektverwaltung und Kostenstellen", abgerufen
2026-09-12.

Die Gruppe der Cost-Locations ist als einzige hier dokumentierte Gruppe **vollständig**:
Lesen, Anlegen, Ändern und Löschen sind alle vorhanden.

## Wo Kostenstellen in Buchungen referenziert werden

Aus der Swagger-Datei, geprüft über
`jq -r '.paths | to_entries[] | .key as $p | (.value.post.parameters // [])[] | select(.name|test("cost"))'`:

| Endpunkt | Parameter | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- | --- |
| `/postings/get` | `cost_location` | string | nein | Filter. Nur Buchungen auf diese Kostenstelle werden geliefert |
| `/postings/add/free` | `cost_location` | string | nein | Kostenstelle 1 der freien Buchung |
| `/postings/add/free` | `cost_location_two` | string | nein | Kostenstelle 2 der freien Buchung |
| `/postings/add/receipt` | `cost_locations` | array | nein | Kostenstelle 1 je Buchungszeile, parallel zum Array `postingaccounts` |
| `/postings/add/receipt` | `cost_locations_two` | array | nein | Kostenstelle 2 je Buchungszeile |
| `/postings/add/transaction` | `cost_locations` | array | nein | wie oben, für Zahlungen |
| `/postings/add/transaction` | `cost_locations_two` | array | nein | wie oben |

Die Antwort von `/postings/get` enthält die Felder `cost_location` und `cost_location_two`
als Strings. Beispielwerte in der Spezifikation sind `"99"` und `"111"`.

Bei den Batch- und Positions-Endpunkten sind Kostenstellen **parallele Arrays**: der Eintrag
an Index `i` in `cost_locations` gehört zur Buchungszeile an Index `i` in `postingaccounts`.
Das ist fehleranfällig und in den Dossiers zu Buchungen im Detail zu behandeln.

**Wichtig:** Kostenstelle 1 ist ein verwalteter Stammdatensatz mit Code und Name, angelegt
über `/cost-locations/add`. Kostenstelle 2 ist laut Wissensdatenbank ein **Freitextfeld**
an der Buchungszeile ohne eigene Stammdatenverwaltung. Es gibt entsprechend keinen
API-Endpunkt für Kostenstelle-2-Stammdaten. Ein Agent darf `cost_location_two` daher nicht
gegen `/cost-locations/get` validieren.

Ergänzend laut Wissensdatenbank: Im SKR42, gedacht für Vereine und gemeinnützige
Organisationen, ist die Projektverwaltung standardmäßig aktiviert und die Kostenstellen 1
bis 4 sowie 9 sind voreingestellt (Ideeller Bereich, Vermögensverwaltung, Zweckbetrieb,
Wirtschaftlicher Geschäftsbetrieb, Sammelposten). Nicht über die API verifiziert.

## `/cost-locations/get`

Liefert die Kostenstellen des Mandanten.

**Einordnung: lesend.** Live verifiziert am 2026-09-12. Der Testmandant hatte keine
Kostenstellen angelegt, die Antwort war `rows: 0` mit leerem `data`-Array.

### Parameter

Vollständig, 4 Parameter laut `jq '.paths["/cost-locations/get"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `code` | string | nein | kein | Code genau einer Kostenstelle. Ist er gesetzt, wird nur diese Kostenstelle zurückgegeben | Alphanumerisch, maximal 10 Zeichen laut `/cost-locations/add` |
| `limit` | integer | nein | nicht dokumentiert | Maximale Anzahl Datensätze | **Maximum 1000**, ausdrücklich in der Endpunktbeschreibung genannt |
| `offset` | integer | nein | nicht dokumentiert | Zu überspringende Datensätze | Ganzzahl ab 0 |

Verschachtelte Objekt- oder Array-Parameter: keine.

Die Beschreibungen von `limit` und `offset` sprechen von "returned postings" statt von
Kostenstellen. Ein Copy-Paste-Fehler aus den Postings-Endpunkten, ohne fachliche Bedeutung.

Für `limit` und `offset` ist in der Spezifikation **kein Default** hinterlegt, anders als
bei den Settings-Endpunkten. Die Endpunktbeschreibung sagt aber: "NOTE: Each request is
limited to 1000 cost locations!" Es ist daher zu **vermuten**, dass ohne `limit` bis zu
1000 Datensätze geliefert werden. Nicht verifiziert, weil der Testmandant keine
Kostenstellen hat.

### Erfolgsantwort

Live verifiziert, Umschlag `success`, `message`, `rows`, `data`.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `code` | string | Der Code der Kostenstelle, zugleich ihr Identifikator. Beispielwert in der Spezifikation `"abc123"` |
| `name` | string | Bezeichnung der Kostenstelle. Beispielwert `"The cost location name"` |

Live erhaltene Antwort des Testmandanten, unverändert, da sie keine Geschäftsdaten enthält:

```json
{
  "success": true,
  "message": "",
  "rows": 0,
  "data": []
}
```

Es gibt **keine** numerische ID. Der `code` ist der Schlüssel.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid limit specified` | `limit` ungültig oder über 1000 | Wert auf höchstens 1000 setzen |
| 400 | 6 | `invalid offset specified` | `offset` ungültig | Ganzzahl ab 0 senden |
| 400 | 7 | `invalid code specified` | `code` formal ungültig | Alphanumerisch, höchstens 10 Zeichen |
| 400 | 23 | `no post and files content received or declined` | Kein oder abgelehnter Request-Body | Gültiges JSON senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen |

Es ist **kein** Fehlercode für "Kostenstelle nicht gefunden" definiert. Wird `code` auf
einen nicht existierenden Wert gesetzt, ist ein leeres `data`-Array mit `rows: 0` zu
erwarten. Das ist eine **Annahme**, nicht verifiziert.

Ebenfalls nicht dokumentiert: was passiert, wenn Kostenstellen im Mandanten gar nicht
aktiviert sind. Live lieferte der Testmandant `rows: 0` ohne Fehler. Ob Kostenstellen dort
deaktiviert oder nur leer sind, ließ sich über die API nicht feststellen, weil es keinen
Endpunkt für die Einstellung gibt.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/cost-locations/get" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "limit": 1000,
        "offset": 0
      }'
```

Abfrage genau einer Kostenstelle:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/cost-locations/get" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "code": "VERTRIEB"
      }'
```

### Fallstricke

- Keine ID, der `code` ist der Schlüssel. Wird er geändert, bricht jede externe Referenz.
  Ein Ändern des Codes ist über die API ohnehin nicht möglich, siehe
  `/cost-locations/update`.
- Kein "nicht gefunden"-Fehler bei unbekanntem `code`. Leeres Ergebnis heißt entweder
  "existiert nicht" oder "keine Kostenstellen vorhanden".
- `limit` ist hart auf 1000 begrenzt. Bei mehr Kostenstellen ist Paginierung zwingend.
- Der Endpunkt liefert nur Kostenstelle 1. Kostenstelle 2 ist ein Freitextfeld ohne
  Stammdaten.

## `/cost-locations/add`

Legt eine neue Kostenstelle an.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 3 Parameter laut `jq '.paths["/cost-locations/add"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `code` | string | ja | kein | Alphanumerischer Identifikator der Kostenstelle | **Maximal 10 Zeichen**, alphanumerisch. Genaue Zeichenmenge nicht weiter spezifiziert |
| `name` | string | ja | kein | Bezeichnung oder Beschreibung der Kostenstelle | Längengrenzen nicht dokumentiert |

Verschachtelte Objekt- oder Array-Parameter: keine.

### Erfolgsantwort

```json
{
  "success": true,
  "message": "",
  "code": "abc123"
}
```

Kein `data`-Feld. Der angelegte Code kommt auf oberster Ebene zurück. `"abc123"` ist ein
Beispielwert aus der Spezifikation.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid code specified` | `code` fehlt, ist zu lang oder enthält unerlaubte Zeichen | Höchstens 10 alphanumerische Zeichen senden |
| 400 | 6 | `invalid name specified` | `name` fehlt oder ist ungültig | Nicht leeren Namen senden |
| 400 | 23 | `no post and files content received or declined` | Kein oder abgelehnter Body | Gültiges JSON senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen, dann wiederholen |

Es gibt **keinen** eigenen Fehlercode für "Code existiert bereits". Was beim Anlegen eines
vorhandenen Codes passiert, ob Fehler 5 oder ein stilles Überschreiben, ist **nicht
verifiziert**. Ein Client sollte vorher `/cost-locations/get` mit dem `code` abfragen.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/cost-locations/add" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "code": "VERTRIEB",
        "name": "Vertrieb Inland"
      }'
```

### Fallstricke

- Der Code ist maximal 10 Zeichen lang. Sprechende Bezeichnungen passen oft nicht hinein.
- Kein Duplikatfehler dokumentiert. Vorher prüfen.
- Kostenstellen müssen im Mandanten aktiviert sein. Ob die API das prüft, ist nicht
  dokumentiert.
- Die Kostenstelle ist gleichzeitig ein Projekt im Sinne der Projektverwaltung. Laut
  Wissensdatenbank steht neben dem Code ein Freitextfeld für den Projektnamen. Über die API
  gibt es nur `code` und `name`, also keine getrennten Felder für Kostenstelle und Projekt.

## `/cost-locations/update`

Ändert die Bezeichnung einer bestehenden Kostenstelle.

**Einordnung: SCHREIBEND.** Nicht live verifiziert.

### Parameter

Vollständig, 3 Parameter laut `jq '.paths["/cost-locations/update"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `code` | string | ja | kein | Code der zu ändernden Kostenstelle, dient als Identifikator | Höchstens 10 Zeichen |
| `name` | string | ja | kein | Neue Bezeichnung | Nicht leer |

Verschachtelte Objekt- oder Array-Parameter: keine.

Der `code` selbst lässt sich **nicht** ändern. Es gibt keinen Parameter für einen neuen
Code.

### Erfolgsantwort

```json
{
  "success": true,
  "message": ""
}
```

Weder `data` noch `code` noch `rows`. Der Aufrufer erhält keine Bestätigung des neuen
Namens. Wer sicher gehen will, fragt anschließend `/cost-locations/get` mit dem `code` ab.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `no cost location code specified` | `code` fehlt | `code` setzen |
| 400 | 6 | `cost location was not found` | Keine Kostenstelle mit diesem Code | Code prüfen, gegebenenfalls anlegen |
| 400 | 7 | `invalid name specified` | `name` fehlt oder ist ungültig | Nicht leeren Namen senden |
| 400 | 23 | `no post and files content received or declined` | Kein oder abgelehnter Body | Gültiges JSON senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Wiederholen |

Die Codes haben hier eine andere Bedeutung als bei `/cost-locations/add`: Code 5 heißt beim
Anlegen `invalid code specified`, beim Ändern `no cost location code specified`. Code 6
heißt beim Anlegen `invalid name specified`, beim Ändern `cost location was not found`.
Ein gemeinsames Fehlermapping für die Cost-Location-Gruppe ist deshalb falsch.

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/cost-locations/update" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "code": "VERTRIEB",
        "name": "Vertrieb DACH"
      }'
```

### Fallstricke

- `code` ist unveränderlich. Ein Umbenennen des Codes erfordert Löschen und Neuanlegen,
  was bestehende Buchungszuordnungen betrifft.
- Die Antwort bestätigt den geänderten Namen nicht.
- Fehlercode-Semantik weicht von `/cost-locations/add` ab.

## `/cost-locations/delete`

Löscht eine Kostenstelle.

**Einordnung: SCHREIBEND und destruktiv.** Nicht live verifiziert.

### Parameter

Vollständig, 2 Parameter laut `jq '.paths["/cost-locations/delete"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `code` | string | ja | kein | Code der zu löschenden Kostenstelle | Höchstens 10 Zeichen |

Verschachtelte Objekt- oder Array-Parameter: keine.

### Erfolgsantwort

```json
{
  "success": true,
  "message": ""
}
```

Keine weiteren Felder.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `no cost location code specified` | `code` fehlt | `code` setzen |
| 400 | 6 | `cost location was not found` | Keine Kostenstelle mit diesem Code | Code prüfen |
| 400 | 7 | `cost location may not be deleted` | Löschen nicht erlaubt, vermutlich weil die Kostenstelle bereits in Buchungen verwendet wird | Kostenstelle behalten. Die genaue Bedingung ist nicht dokumentiert und **nicht verifiziert** |
| 400 | 23 | `no post and files content received or declined` | Kein oder abgelehnter Body | Gültiges JSON senden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand über `/cost-locations/get` prüfen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Zustand prüfen |

### curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/cost-locations/delete" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "code": "VERTRIEB"
      }'
```

### Fallstricke

- Dies ist der **einzige** destruktive Endpunkt in diesem Dossier. Ein MCP-Tool sollte ihn
  nur mit ausdrücklicher Bestätigung ausführen und niemals als Teil eines automatischen
  Abgleichs.
- Code 7 signalisiert, dass eine verwendete Kostenstelle nicht gelöscht werden kann. Die
  genaue Regel ist nicht dokumentiert.
- Es gibt keinen Endpunkt, der vorher prüft, ob eine Kostenstelle in Buchungen verwendet
  wird. Näherungsweise geht das über `/postings/get` mit dem Filter `cost_location`. Dieser
  Weg ist nicht verifiziert und deckt `cost_location_two` nicht ab.

---

# Kommentare

## `/comments/add`

Hängt einen Freitextkommentar an eine Zahlung oder an einen Beleg.

**Einordnung: SCHREIBEND.** Nicht live verifiziert. Der Endpunkt stand nicht auf der
Whitelist für Live-Tests, weil er Daten anlegt.

Dies ist der einzige Endpunkt der Gruppe Comments. Es gibt **keinen** Endpunkt zum Lesen,
Ändern oder Löschen von Kommentaren. Ein einmal gesetzter Kommentar ist über die API weder
abrufbar noch entfernbar.

### An welche Objekte Kommentare gehängt werden können

Genau zwei Objektarten, und pro Aufruf genau eine davon:

| Ziel | Parameter | Identifikator kommt aus |
| --- | --- | --- |
| Zahlung, in der API `transaction` | `transaction_id_by_customer` | `/transactions/get` oder `/transactions/get/id_by_customer` |
| Beleg, in der API `receipt` | `receipt_id_by_customer` | `/receipts/get` oder `/receipts/get/id_by_customer` |

Kommentare an Debitoren, Kreditoren, Sachkonten, Basiskonten, Kostenstellen oder Buchungen
sind **nicht** möglich. Die Gruppe Comments hat keine weiteren Endpunkte, und keiner der
Stammdatenendpunkte kennt ein Kommentarfeld.

Der verwendete Identifikator ist die **mandantenbezogene** laufende Nummer
`id_by_customer`, nicht eine globale technische ID. Das ist dieselbe Nummer, die auch
`/receipts/delete/id_by_customer` und `/receipts/restore/id_by_customer` verwenden.

### Parameter

Vollständig, 4 Parameter laut `jq '.paths["/comments/add"].post.parameters | length'`.

| Feld | Typ | Pflicht | Default | Beschreibung | Werte und Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | kein | API-Schlüssel des Mandanten | siehe Grundlagen |
| `comment_text` | string | ja | kein | Der Kommentartext | **Zwischen 2 und 210 Zeichen.** Einzige explizit in der Spezifikation genannte Längengrenze aller hier dokumentierten Endpunkte |
| `transaction_id_by_customer` | integer | bedingt | kein | Mandantenbezogene Nummer der Zahlung | Ganzzahl. Entweder dieses Feld **oder** `receipt_id_by_customer`, nie beide |
| `receipt_id_by_customer` | integer | bedingt | kein | Mandantenbezogene Nummer des Belegs | Ganzzahl. Entweder dieses Feld **oder** `transaction_id_by_customer`, nie beide |

Verschachtelte Objekt- oder Array-Parameter: keine.

**Bedingte Pflicht, exklusiv.** Die Spezifikation markiert beide Felder als
`required: false`, die Endpunktbeschreibung sagt aber: "NOTE: You have to submit either a
transaction_id_by_customer or a receipt_id_by_customer." Bestätigt wird das durch zwei
eigene Fehlercodes:

- Code 8, wenn **keines** von beiden gesetzt ist
- Code 7, wenn **beide** gesetzt sind

Ein Client muss die Exklusivität selbst durchsetzen. Ein MCP-Tool sollte die beiden
Zielarten am besten als ein Enum-Feld plus eine ID modellieren, damit ein Agent die Regel
nicht verletzen kann.

### Erfolgsantwort

```json
{
  "success": true,
  "message": ""
}
```

Keine ID des angelegten Kommentars, kein `data`, kein `rows`. Der Aufrufer kann nicht
feststellen, welcher Kommentar entstanden ist, und ihn später nicht wiederfinden.

### Fehlerfälle

| HTTP-Status | error_code | message | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 5 | `invalid transaction_id_by_customer specified` | Formal ungültig, etwa kein Integer | Ganzzahl senden |
| 400 | 6 | `invalid receipt_id_by_customer specified` | Formal ungültig | Ganzzahl senden |
| 400 | 7 | `only transaction_id_by_customer or receipt_id_by_customer should be specified` | Beide Felder gesetzt | Genau eines senden |
| 400 | 8 | `either transaction_id_by_customer or receipt_id_by_customer should be specified` | Keines von beiden gesetzt | Genau eines senden |
| 400 | 9 | `transaction was not found` | Formal gültige Nummer, aber keine Zahlung darunter | Nummer über `/transactions/get` prüfen |
| 400 | 10 | `receipt was not found` | Formal gültige Nummer, aber kein Beleg darunter | Nummer über `/receipts/get` prüfen |
| 400 | 12 | `invalid comment_text specified` | Text zu kurz, zu lang oder formal ungültig | Zwischen 2 und 210 Zeichen bleiben |
| 400 | 13 | Response-Beschreibung `no comment text is specified`, Definition `CommentsAdd_ErrorCode13` sagt `no comment_text is specified` | `comment_text` fehlt | Feld setzen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Vor dem Wiederholen bedenken, dass der Kommentar nicht abfragbar ist |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Ebenso |

### curl-Beispiel

Kommentar an einen Beleg:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/comments/add" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "receipt_id_by_customer": 142,
        "comment_text": "Rechnung mit Steuerberatung geklärt, Vorsteuerabzug bestätigt."
      }'
```

Kommentar an eine Zahlung:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/comments/add" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "transaction_id_by_customer": 987,
        "comment_text": "Teilzahlung, Restbetrag folgt im nächsten Monat."
      }'
```

### Fallstricke

- Schreiben ohne Lesen: Kommentare sind über die API nicht abrufbar. Ein MCP-Server kann
  weder anzeigen, was bereits kommentiert wurde, noch Doppelkommentare vermeiden.
- Kein Rückgabewert mit ID. Ein Retry nach Timeout erzeugt sehr wahrscheinlich einen
  doppelten Kommentar. Da Kommentare nicht löschbar sind, ist das nicht reparierbar. Ein
  Retry sollte deshalb nicht automatisch erfolgen.
- 210 Zeichen sind knapp. Längere Texte müssen gekürzt oder auf mehrere Kommentare
  aufgeteilt werden, was wegen der fehlenden Reihenfolgegarantie unschön ist.
- Die Exklusivität von `transaction_id_by_customer` und `receipt_id_by_customer` ist in den
  `required`-Flags der Spezifikation nicht abgebildet.
- Die verwendeten IDs sind mandantenbezogene laufende Nummern. Werden sie aus einer anderen
  Quelle übernommen, etwa aus einer technischen ID, entsteht ein Kommentar am falschen
  Objekt oder Fehlercode 9 beziehungsweise 10.

---

# Querbezüge: wo Stammdaten in anderen Endpunkten auftauchen

Übersicht über die Stellen, an denen die hier dokumentierten Stammdaten in anderen
Endpunktgruppen referenziert werden. Die Details gehören in die jeweiligen Dossiers, hier
nur der Verweis. Quelle: Swagger-Datei, Stand 2026-09-12.

| Referenziert | Endpunkt | Parameter | Bemerkung |
| --- | --- | --- | --- |
| Debitor oder Kreditor | `/receipts/add` | `creditor_debtor` (integer, optional) | Buchungskontonummer. Kreditor bei Belegtyp `invoice inbound`, Debitor bei `invoice outbound`. `0` ist ausdrücklich kein gültiger Wert |
| Debitor oder Kreditor | `/receipts/upload` | `creditor_debtor` (integer, optional) | wie oben |
| Kreditor | `/postings/add/receipt` | `creditor` (integer, laut Spezifikation required) | Beschreibung schränkt ein: nur nötig bei Eingangsrechnung und aktivierter Kreditorenbuchung. Widerspruch zum `required`-Flag |
| Debitor | `/postings/add/receipt` | `debtor` (integer, laut Spezifikation required) | analog für Ausgangsrechnungen |
| Sachkonto | `/postings/add/receipt` | `postingaccounts` (array, required) | Array von Buchungskontonummern, eine je Buchungszeile |
| Sachkonto | `/postings/add/transaction` | `postingaccounts` (array, required) | wie oben |
| Sachkonto | `/postings/add/free` | `postingaccount_debit`, `postingaccount_credit` (integer, required) | Soll- und Habenkonto der freien Buchung |
| Sachkonto, Debitor, Kreditor | `/postings/get` | `postingaccount` (string, optional) | Kommaseparierte Liste. Erlaubte Sonderwerte laut Spezifikation: `all`, `all postingaccounts`, `all debtors`, `all creditors`, zusätzlich beliebige numerische Kontonummern. Default `all` |
| Sachkonto | `/reports/get/sums/ledger` | `postingaccount_number` (integer, required) | Kontoblatt eines einzelnen Kontos |
| Kostenstelle | `/postings/get` | `cost_location` (string, optional) | Filter |
| Kostenstelle | `/postings/add/free` | `cost_location`, `cost_location_two` (string, optional) | |
| Kostenstelle | `/postings/add/receipt` | `cost_locations`, `cost_locations_two` (array, optional) | Parallel zu `postingaccounts` |
| Kostenstelle | `/postings/add/transaction` | `cost_locations`, `cost_locations_two` (array, optional) | wie oben |
| Beleg | `/comments/add` | `receipt_id_by_customer` (integer, bedingt) | |
| Zahlung | `/comments/add` | `transaction_id_by_customer` (integer, bedingt) | |

Bemerkenswert am Sonderwert `all debtors` beziehungsweise `all creditors` in
`/postings/get`: dort wird wieder die Schreibweise `debtors` verwendet, während
`/settings/get/debtors` den `type` `debitor` liefert.

---

# Hinweise für das MCP-Tool-Design

## Endpunkte, die aus Agentensicht zusammengehören

**Gruppe 1: Kontenplan lesen.** `/settings/get/postingaccounts` und `/accounts/get`. Diese
beiden überlappen. Empfehlung: **ein** Tool, das `/settings/get/postingaccounts` kapselt
und einen Pflichtparameter für die gewünschte Kontoart anbietet, etwa `kind` mit den Werten
`sachkonten`, `basiskonten`, `debitoren`, `kreditoren` oder `alle`. Das Tool setzt intern
die passenden `exclude_*`-Flags. Ein separates Tool für `/accounts/get` lohnt nur, wenn ein
sehr schlankes Ergebnis gewünscht ist, und sollte dann in seiner Beschreibung ausdrücklich
auf die Überschneidung hinweisen.

**Gruppe 2: Geschäftspartner.** `/settings/get/debtors` und `/settings/get/creditors` sind
strukturgleich. Ein einziges Tool mit einem Parameter `partner_typ` (`debitor` oder
`kreditor`) vermeidet, dass ein Agent die falsche Liste abfragt. Dasselbe gilt für
`add` und `update`. Vorsicht bei der Zusammenlegung: die Feldmengen sind **nicht**
identisch, `customer_number` gibt es nur beim Debitor, `due_in_days` nur beim Kreditor.
Ein gemeinsames Schema muss beide Felder kennen und je nach `partner_typ` ablehnen.

**Gruppe 3: Kostenstellen.** Vollständiger CRUD-Satz. Als vier Tools abbildbar. Das
Löschen sollte gesondert abgesichert sein.

**Gruppe 4: Kommentare.** Ein einzelnes Tool. Das Ziel sollte als Enum plus ID modelliert
werden, nicht als zwei optionale ID-Felder.

## Mehrstufige Abläufe

| Ziel | Notwendige Schritte |
| --- | --- |
| Kontenrahmen bestimmen | `/settings/get/postingaccounts` mit `exclude_accounts`, `exclude_creditors`, `exclude_debtors` auf `true` und Paginierung, dann auf die Existenz von 8400 oder 4400 prüfen |
| Vollständigen Kontenplan laden | Wiederholtes `/settings/get/postingaccounts` mit steigendem `offset`, bis weniger als `limit` Zeilen kommen. `rows` ist nicht die Gesamtzahl |
| Basiskonto samt Typ ermitteln | `/settings/get/postingaccounts` mit `exclude_postingaccounts`, `exclude_creditors`, `exclude_debtors` auf `true`, dann `subtype` auswerten. `/accounts/get` allein reicht nicht |
| Kreditor anlegen und Beleg zuordnen | `/settings/add/creditor`, dann die zurückgegebene `postingaccount_number` in `/receipts/add` als `creditor_debtor` verwenden |
| Debitor sicher aktualisieren | `/settings/get/debtors` zum Lesen des Ist-Zustands, dann `/settings/update/debtor` mit allen Feldern, weil die Teilaktualisierungs-Semantik nicht dokumentiert ist |
| Zahlungsziel eines Kreditors ändern | Nur blind möglich. `due_in_days` ist schreibbar, aber nicht lesbar. Ein Vorher-Nachher-Vergleich ist ausgeschlossen |
| Individuelles Sachkonto anlegen | Zuerst `/settings/get/postingaccounts` zur Auswahl eines geeigneten Vorlagekontos mit `subtype == "default"`, dann Nummer im selben Nummernkreis wählen, dann `/settings/add/postingaccount` |
| Kostenstelle löschen | `/cost-locations/get` zur Prüfung der Existenz, idealerweise `/postings/get` mit `cost_location` zur Prüfung der Verwendung, dann `/cost-locations/delete` |
| Batch-Import von Partnern | `/settings/add-batch/debtors` bzw. `-/creditors`, danach zwingend `errors` auswerten und die fehlgeschlagenen Einträge einzeln nacharbeiten |

## Parameter, die für Agenten schwer zu erraten sind

Diese Felder brauchen in der Tool-Beschreibung ausführliche, beispielhafte Erklärungen.

| Parameter | Warum schwierig | Was die Beschreibung leisten muss |
| --- | --- | --- |
| `api_key` | Klingt nach einem Auth-Secret, ist aber die Mandantenauswahl. Die eigentliche Authentifizierung läuft über Basic Auth | Klarstellen, dass es der Mandantenschlüssel ist. Idealerweise gar nicht als Tool-Parameter exponieren, sondern serverseitig aus der Konfiguration setzen |
| `postingaccount_number` | Bedeutet je nach Endpunkt Sachkonto, Basiskonto, Debitor oder Kreditor. Typ wechselt zwischen `string` und `integer` | Pro Tool präzisieren, um welche Art Konto es geht, und den erwarteten Nummernbereich nennen |
| `parent_postingaccount_number` | Fachlich das Vorlagekonto mit Vererbung von Steuerautomatiken. Ein Agent wählt es sonst nach Namensähnlichkeit | Erklären, dass Steuerautomatiken übernommen werden und die Wahl steuerlich wirksam ist. Nutzerbestätigung vorsehen |
| `type` bei `/accounts/add` | Drei feste Werte, einer davon mit Schrägstrich | Die drei Werte wörtlich auflisten und je ein Beispiel nennen |
| `country` | Nur deutscher Landesname oder ISO-Code, kein englischer Name | Auf ISO-3166-1-alpha-2 festlegen und das im Schema als Enum oder Pattern absichern |
| `order` bei `/settings/get/postingaccounts` | Zusammengesetzter String aus Feld und Richtung | Die sechs erlaubten Werte als Enum abbilden statt als Freitext |
| `exclude_*`-Flags | Vier Negativ-Flags, deren Kombination das Ergebnis stark verändert | Nicht direkt exponieren, sondern über einen positiven `kind`-Parameter kapseln |
| `due_in_days` | Schreibbar, nicht lesbar | Ausdrücklich vermerken, dass der aktuelle Wert nicht abfragbar ist |
| `is_revision_safe` | Wirkt nur bei Kassenkonten und hat steuerliche Folgen, nicht zurücknehmbar | Warnung und Nutzerbestätigung |
| `receipt_creates_transaction` | Schließt debitorische und kreditorische Buchung dieser Belege aus | Nebenwirkung nennen |
| `code` bei Kostenstellen | Maximal 10 Zeichen, unveränderlich, zugleich Schlüssel | Längengrenze und Unveränderlichkeit nennen |
| `transaction_id_by_customer` und `receipt_id_by_customer` | Exklusiv, beide formal optional, mandantenbezogene laufende Nummern | Als Enum plus ID modellieren. Klarstellen, dass es nicht die technische ID ist |
| `comment_text` | 2 bis 210 Zeichen | Grenze im Schema abbilden und im Tool kürzen statt scheitern |
| `debtors` und `creditors` beim Batch | Array von Objekten, deren Elementschema von der Beschreibung abweicht | Elementschema vollständig ausschreiben, `email` bewusst behandeln |

## Absicherung schreibender Tools

Von den 18 dokumentierten Endpunkten sind 13 schreibend:
`/settings/add/debtor`, `/settings/add-batch/debtors`, `/settings/update/debtor`,
`/settings/add/creditor`, `/settings/add-batch/creditors`, `/settings/update/creditor`,
`/settings/add/postingaccount`, `/settings/update/postingaccount`, `/accounts/add`,
`/cost-locations/add`, `/cost-locations/update`, `/cost-locations/delete`,
`/comments/add`.

Fünf sind lesend: `/settings/get/debtors`, `/settings/get/creditors`,
`/settings/get/postingaccounts`, `/accounts/get`, `/cost-locations/get`.

Empfehlungen:

- Schreibende Tools brauchen ein eigenes, deutlich markiertes Namensschema und sollten
  hinter einer expliziten Freigabe liegen.
- Für Debitoren, Kreditoren, Sachkonten und Basiskonten gibt es **kein Löschen und kein
  Rückgängigmachen**. Jeder Anlegevorgang ist dauerhaft.
- `/cost-locations/delete` ist der einzige destruktive Endpunkt.
- `/comments/add` ist nicht idempotent und nicht rückgängig zu machen. Automatische Retrys
  vermeiden.
- Bei Timeout (Code 30) und internem Fehler (Code 0) darf ein schreibender Aufruf nicht
  blind wiederholt werden. Erst den Ist-Zustand über den passenden Get-Endpunkt prüfen.
  Für `/comments/add` ist selbst das nicht möglich.

## Rate Limit und Paginierung

100 Requests pro Mandant und Minute. Der vollständige Kontenplan eines SKR03-Mandanten
umfasst über 1000 Einträge und braucht daher mindestens zwei Requests. Ein MCP-Server
sollte den Kontenplan pro Mandant zwischenspeichern, weil er sich selten ändert. Die
Partnerlisten ändern sich häufiger, sollten aber bei `limit: 25` als Default keinesfalls
ungepaginert genutzt werden.

Für die Erkennung des Listenendes gilt: weiterblättern, solange die Anzahl der gelieferten
Zeilen gleich `limit` ist.

---

# Anhang A: Gesammelte Abweichungen zwischen Spezifikation und Live-Verhalten

Alle Live-Beobachtungen stammen vom 2026-09-12, erhoben mit 6 lesenden Requests gegen
`https://webapp.buchhaltungsbutler.de/api/v1` auf einem echten Mandanten.

| Nr | Endpunkt | Spezifikation | Live | Auswirkung |
| --- | --- | --- | --- | --- |
| 1 | `/settings/get/debtors` | `data`-Objekt ohne `customer_number` | `customer_number` vorhanden | Feld fehlt im generierten Typ |
| 2 | `/settings/get/creditors` | `data`-Objekt ohne `customer_number` | `customer_number` vorhanden, Wert `null` | wie oben, zusätzlich nullable |
| 3 | `/settings/get/creditors` | `due_in_days` ist beim Anlegen und Ändern setzbar | Wird nicht zurückgeliefert | Feld ist write-only, Round-Trip unmöglich |
| 4 | `/settings/get/debtors` und `/settings/get/creditors` | `uid_ch` als `string` | `null` | nullable nötig |
| 5 | `/settings/get/postingaccounts` | `subtype`-Beispiel `"default chart"` | `"default"` | Beispielwert der Spezifikation existiert nicht |
| 6 | `/settings/get/postingaccounts` | `type`-Beispiel nur `"postingaccount"` | zusätzlich `account`, `debtor`, `creditor`, `debtor collective`, `creditor collective` | Endpunkt liefert vier Objektarten, nicht eine |
| 7 | `/settings/get/postingaccounts` | `subtype` als `string` | für Debitoren und Kreditoren `null` | nullable nötig |
| 8 | `/settings/get/postingaccounts` | `parent_postingaccount_number` als `string`, `parent_name` als `string` | leerer String bzw. `null` | zwei verschiedene Leerwert-Konventionen |
| 9 | Alle Listen-Endpunkte | `rows` als `integer` deklariert, Beispiel `"1"` als String | Integer | Beispielwert der Spezifikation ist falsch typisiert |
| 10 | Alle Endpunkte | Definitionen listen `success`, `rows`, `message`, `data` | Live `success`, `message`, `rows`, `data` | nur relevant für positionsabhängige Parser |
| 11 | `/settings/get/postingaccounts` | keine Aussage zu führenden Nullen | Nummern ohne führende Nullen, SKR03-Konto 0027 kommt als `"27"` | String-Vergleiche schlagen fehl |
| 12 | `/settings/get/postingaccounts` | keine Aussage zur Sortierlogik | `postingaccount_number ASC` sortiert numerisch | intuitiv richtig, aber nicht dokumentiert |
| 13 | `/settings/get/debtors` vs. `/settings/get/postingaccounts` | keine Aussage | `type` ist `debitor` bzw. `debtor` | zwei Schreibweisen für dieselbe Sache |
| 14 | `/accounts/get` vs. `/settings/get/postingaccounts` | keine Aussage | dieselben fünf Konten in beiden Antworten | Duplikatgefahr beim Zusammenführen |

# Anhang B: Innere Widersprüche der Spezifikation

Alle aus der Datei
`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json`,
Stand 2026-09-12. Nicht live prüfbar, weil dazu fehlerhafte Requests nötig gewesen wären.

| Nr | Ort | Widerspruch |
| --- | --- | --- |
| 1 | `SettingsAddDebitor_ErrorCode14`, `SettingsUpdateDebitor_ErrorCode14`, `SettingsAddCreditor_ErrorCode14`, `SettingsUpdateCreditor_ErrorCode14` | Response-Beschreibung sagt `invalid city specified`, die `message` im Definitionsobjekt sagt `invalid street specified` |
| 2 | `SettingsDebtor` | Enthält kein `email`, obwohl die Parameterbeschreibung von `debtors` die Felddeklaration des Einzelendpunkts verspricht |
| 3 | `SettingsCreditor` | Enthält kein `email`, gleicher Widerspruch |
| 4 | `SettingsDebtor.contact_person_name` | Beschreibung spricht von "creditor account" statt "debtor account" |
| 5 | `/settings/add/creditor` und `/settings/update/creditor`, Parameter `due_in_days` | Beschreibung spricht von "your new debtor account" |
| 6 | `SettingsUpdateCreditor_Success.data` | Beschreibung lautet "the updated Debitor" |
| 7 | `postingaccount_number` | Bei `add/debtor` und `add/creditor` Typ `string`, bei den zugehörigen `update`-Endpunkten Typ `integer` |
| 8 | `/settings/add/postingaccount` | Sendet `postingaccount_number` als `integer`, erhält sie als `string` zurück |
| 9 | `AccountsAdd_ErrorCode13` | Response-Beschreibung sagt "the booking account number", Definition sagt "the postingaccount_number" |
| 10 | `CommentsAdd_ErrorCode13` | Response-Beschreibung sagt `no comment text is specified`, Definition sagt `no comment_text is specified` |
| 11 | `/comments/add` | Beide ID-Felder als `required: false` markiert, obwohl die Beschreibung genau eines fordert |
| 12 | `/postings/add/receipt` | `creditor` und `debtor` als `required: true` markiert, in der Beschreibung aber als bedingt beschrieben |
| 13 | `/cost-locations/get` | `limit` und `offset` beschreiben "returned postings" statt Kostenstellen |
| 14 | Fehlercode 5 und 6 bei Cost-Locations | Bei `add` bedeuten sie `invalid code` und `invalid name`, bei `update` und `delete` `no cost location code specified` und `cost location was not found` |
| 15 | Fehlercode 21 | Bei Debitoren `invalid customer_number specified`, bei Kreditoren `invalid due in days specified` |
| 16 | `basePath` | Enthält eine vollständige URL statt eines Pfads, was Swagger 2.0 nicht erlaubt |
| 17 | `securityDefinitions` | Fehlt vollständig, obwohl die API Basic Auth verlangt |
| 18 | Body-Parameter | Als Einzeleinträge mit `in: body` und eigenem `type` statt als gemeinsames `schema` |

# Anhang C: Vollständigkeitsprüfung der Parameter

Gegengeprüft mit
`jq '.paths["<pfad>"].post.parameters | length'` am 2026-09-12. Alle Parameter jedes
Endpunkts sind im Dokument in einer Tabelle aufgeführt.

| Endpunkt | Parameter laut jq | Im Dokument dokumentiert |
| --- | --- | --- |
| `/settings/get/debtors` | 3 | 3 |
| `/settings/add/debtor` | 14 | 14 |
| `/settings/add-batch/debtors` | 2 | 2 plus 12 Feldern der Elementstruktur |
| `/settings/update/debtor` | 14 | 14 |
| `/settings/get/creditors` | 3 | 3 |
| `/settings/add/creditor` | 14 | 14 |
| `/settings/add-batch/creditors` | 2 | 2 plus 12 Feldern der Elementstruktur |
| `/settings/update/creditor` | 14 | 14 |
| `/settings/get/postingaccounts` | 8 | 8 |
| `/settings/add/postingaccount` | 4 | 4 |
| `/settings/update/postingaccount` | 3 | 3 |
| `/accounts/get` | 1 | 1 |
| `/accounts/add` | 6 | 6 |
| `/cost-locations/get` | 4 | 4 |
| `/cost-locations/add` | 3 | 3 |
| `/cost-locations/update` | 3 | 3 |
| `/cost-locations/delete` | 2 | 2 |
| `/comments/add` | 4 | 4 |
| **Summe** | **104** | **104** |

# Anhang D: Live-Testprotokoll

Sechs lesende Requests am 2026-09-12 gegen den Produktivmandanten. Keine schreibenden
Aufrufe. Alle Antworten HTTP 200 mit `success: true`.

| Nr | Endpunkt | Gesendete Parameter | Ergebnis |
| --- | --- | --- | --- |
| 1 | `/accounts/get` | nur `api_key` | `rows: 5`, Felder `name` und `postingaccount_number` |
| 2 | `/settings/get/postingaccounts` | `limit: 1000`, `offset: 0`, `order: "postingaccount_number ASC"` | `rows: 1000`, davon 995 `postingaccount/default` und 5 `account`, Nummern 10 bis 4905, numerisch sortiert |
| 3 | `/settings/get/debtors` | `limit: 5`, `offset: 0` | `rows: 5`, `type: "debitor"`, Nummern 10001 bis 10005, 16 Felder |
| 4 | `/settings/get/creditors` | `limit: 5`, `offset: 0` | `rows: 5`, `type: "creditor"`, Nummern 70150 bis 70154, 16 Felder, kein `due_in_days` |
| 5 | `/cost-locations/get` | `limit: 10`, `offset: 0` | `rows: 0`, `data: []` |
| 6 | `/settings/get/postingaccounts` | `limit: 1000`, `offset: 0`, `exclude_postingaccounts: true` | `rows: 86`, Verteilung nach `type` siehe Abschnitt zur Begriffsklärung |

Nicht getestet, weil außerhalb der Whitelist oder schreibend: alle `add`-, `update`-,
`add-batch`- und `delete`-Endpunkte sowie `/comments/add`. Alle Aussagen zu diesen
Endpunkten stammen ausschließlich aus der Swagger-Datei und sind entsprechend
gekennzeichnet.
