# Transaktionen (Transactions)

Referenzdossier für die Transaktions-Endpunkte der BuchhaltungsButler-API v1 (Spezifikationsversion 1.9.1).
Zielgruppe sind Implementierungs-Agenten, die daraus MCP-Tools bauen.

**Quellen dieses Dokuments**

| Quelle | Art | Abrufdatum |
| --- | --- | --- |
| `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json` | Offizielle Swagger-2.0-Beschreibung, heruntergeladen von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json` | 2026-09-12 |
| Eigene Live-Aufrufe gegen `https://webapp.buchhaltungsbutler.de/api/v1` | Echte Produktivinstanz des Nutzers, ausschließlich lesende Endpunkte | 2026-09-12 |
| Vom Orchestrator vorab verifizierte Rahmenangaben (Basis-URL, Auth, Envelope, Rate Limit) | Live-Antwort | 2026-09-12 |

**Warnung zur Spezifikation.** Die vorliegende Swagger-Datei ist kein valides Swagger 2.0. Body-Felder stehen als
einzelne Parametereinträge mit `"in": "body"` und eigenem `"type"`, statt gebündelt in einem gemeinsamen
`schema`-Objekt. Fachlich sind alle diese Einträge Felder **eines** JSON-Bodys. Alle `enum`-Listen mit genau einem
Eintrag in den `definitions` sind Beispielwerte, keine erlaubten Wertemengen.

---

## 1. Fachliche Einordnung: Transaktion, Beleg, Buchung

Die drei Begriffe werden in der API konsequent getrennt und dürfen beim Tool-Design nicht vermischt werden.

| Begriff | API-Objekt | Bedeutung | Trägt |
| --- | --- | --- | --- |
| Transaktion | `/transactions/*` | Ein Zahlungsvorgang auf einem Zahlungskonto, im Regelfall ein Bankumsatz (Kontoauszugszeile). | Betrag, Zahlungspartner (`to_from`), Buchungs- und Wertstellungsdatum, Verwendungszweck, Bankdaten der Gegenseite |
| Beleg | `/receipts/*` | Ein Dokument, typischerweise Eingangs- oder Ausgangsrechnung, als Datei plus Metadaten. | Datei (`filename`), Belegdaten |
| Buchung | `/postings/*` | Der eigentliche Buchungssatz, der eine Transaktion oder einen Beleg auf Sachkonten kontiert. | `postingaccounts`, `postingtexts`, `vats`, `amounts`, optional `cost_locations` |

Der typische Ablauf in BuchhaltungsButler:

1. Ein Bankumsatz entsteht (Bankanbindung oder `/transactions/add`) → **Transaktion**.
2. Der zugehörige Beleg wird hochgeladen (`/receipts/add`, `/receipts/upload`) → **Beleg**.
3. Beleg und Transaktion werden verknüpft (`/transactions/assign/receipt` bzw. die Batch-Variante).
4. Erst danach wird kontiert und gebucht (`/postings/add/transaction`) → **Buchung**.

Beleg für diese Abgrenzung: Die Beschreibung von `/transactions/add` lautet „Add a transaction to a payment account
of the specified customer". `/postings/add/transaction` nimmt eine `transaction_id_by_customer` entgegen und erzeugt
daraus Buchungszeilen mit Sachkonten und Steuerschlüsseln. Quelle: OpenAPI-Datei, Abruf 2026-09-12.

Wichtig für Agenten: Eine Transaktion ist **keine** Buchung. Das Anlegen einer Transaktion verbucht nichts. Umgekehrt
sperrt eine bereits bestätigte Buchung das Lösen der Beleg-Zuordnung (siehe Fehlercode 10 bei
`/transactions/unassign/receipt`).

---

## 2. Gemeinsame Grundlagen

Quelle: vom Orchestrator live verifiziert am 2026-09-12, zusätzlich durch eigene Aufrufe bestätigt.

| Aspekt | Wert |
| --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` |
| HTTP-Methode | immer `POST`, auch für lesende Endpunkte |
| Content-Type | `application/json` |
| Authentifizierung | HTTP Basic Auth, Benutzername = API Client, Passwort = API Secret |
| Mandantenauswahl | Pflichtfeld `api_key` im JSON-Body |
| Rate Limit | laut Dokumentation maximal 100 Requests pro Mandant und Minute |
| Zusatzlimit `addBatch` | laut Spezifikation nur ein Request alle 5 Sekunden |

Erfolgsumschlag bei Listenendpunkten:

```json
{"success": true, "message": "", "rows": 3, "data": [ ]}
```

Fehlerumschlag (schematisch, Code und Meldung sind endpunktabhängig):

```json
{"success": false, "error_code": 5, "message": "invalid date_from specified"}
```

Die Swagger-Datei notiert Response-Schlüssel im Format `"400 (5)"`. Die Zahl vor der Klammer ist der HTTP-Status, die
Zahl in der Klammer der `error_code` im Body. Das ist keine gültige Swagger-Syntax, aber eine plausible Lesart: Die
zugehörigen HTTP-Status 400 wurden live bestätigt, sowohl auf `/transactions/get` als auch auf
`/receipts/get/id_by_customer`, jeweils mit der in der Spezifikation für Code 5 hinterlegten `message`.

Fehlercodes, die sich über alle Endpunkte wiederholen (Definitionen `Request_ErrorCode*`):

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Request unverändert wiederholen, mit Backoff; bei Dauerfehler Support |
| 400 | 1 | `Api method calls require HTTP requests` | Aufruf nicht per HTTP | Nicht relevant für HTTPS-Clients |
| 400 | 2 | `Api method calls require POST requests` | Falsche HTTP-Methode | Immer `POST` verwenden |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Zugangsdaten falsch | API Client und API Secret prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` passt nicht zum Client oder Rechte fehlen | `api_key` prüfen, Mandantenzuordnung prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Kein technischer Fix, Vertragsstatus des Mandanten klären |
| 403 | 15 | `adding temporarily restricted` | Schreibzugriff temporär gesperrt | Später erneut versuchen, nicht in enger Schleife |
| 400 | 23 | `no post and files content received or declined` | Body leer oder abgelehnt | Body und Content-Type prüfen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung serverseitig | Wiederholen; bei Batch-Aufrufen Menge reduzieren |

Achtung: `error_code` 10, 15 und 23 sind **nicht** global eindeutig. `/transactions/unassign/receipt` verwendet 23 für
„no receipts assigned to transaction". Die Bedeutung ist immer endpunktspezifisch zu interpretieren.

### Endpunktübersicht

| Pfad | Art | Kurzbeschreibung | Parameteranzahl laut Spezifikation |
| --- | --- | --- | --- |
| `/transactions/get` | lesend | Liste von Transaktionen mit Filtern und Paging | 10 |
| `/transactions/get/id_by_customer` | lesend | Eine Transaktion anhand ihrer `id_by_customer` | 1 (unvollständig, siehe Abschnitt 4) |
| `/transactions/add` | **schreibend** | Einzelne Transaktion anlegen | 14 |
| `/transactions/addBatch` | **schreibend** | Bis zu 50 Transaktionen anlegen | 2 |
| `/transactions/assign/receipt` | **schreibend** | Beleg einer Transaktion zuordnen | 3 |
| `/transactions/unassign/receipt` | **schreibend** | Zuordnung eines Belegs lösen | 3 |
| `/transactions/assign-batch/receipt` | **schreibend** | Bis zu 50 Zuordnungen auf einmal | 2 |
| `/transactions/assigned-receipts/get` | lesend | Alle zugeordneten Belege einer Transaktion | 3 |

Die Parameteranzahlen wurden gegen `jq '.paths["<pfad>"].post.parameters | length'` geprüft.

---

## 3. `/transactions/get`

Liefert eine gefilterte, seitenweise Liste von Transaktionen des im `api_key` bezeichneten Mandanten.

**Einordnung: lesend.** Keine Seiteneffekte.

### 3.1 Parameter (10 von 10)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | — | API-Key des zu verwaltenden Mandanten | Mandantenspezifischer Schlüssel | frei |
| `id_by_customer_from` | integer | nein | — | Es werden nur Transaktionen **nach** dem angegebenen Wert geliefert. Die Transaktion mit genau diesem Wert wird **nicht** geliefert (exklusive Untergrenze). Setzt die Sortierung auf `id_by_customer ASC`, auch in Kombination mit Datumsfiltern. | ganze Zahl | integer |
| `id_by_customer_to` | integer | nein | — | Es werden nur Transaktionen **bis** zum angegebenen Wert geliefert. Die Transaktion mit genau diesem Wert wird **nicht** geliefert (exklusive Obergrenze). Setzt ebenfalls die Sortierung auf `id_by_customer ASC`. | ganze Zahl | integer |
| `date_from` | string | nein | — | Buchungsdatum der Transaktion. Alle Transaktionen **einschließlich** und nach diesem Datum. Leerstring ist kein gültiges Datum. | gültiges Datum | `YYYY-MM-DD`, Beispiel `2017-04-26` |
| `date_to` | string | nein | — | Buchungsdatum der Transaktion. Alle Transaktionen **einschließlich** und vor diesem Datum. Leerstring ist kein gültiges Datum. | gültiges Datum | `YYYY-MM-DD` |
| `date_since_last_modified` | string | nein | — | Liefert alle Transaktionen, deren `date_updated` später als der angegebene Zeitpunkt ist. Wird nur `YYYY-MM-DD` angegeben, ergänzt der Server die Uhrzeit zu `23:59:59`. Leerstring ist kein gültiges Datum. | gültiger Zeitpunkt | `YYYY-MM-DD HH:MM:SS`, Beispiel `2017-04-26 13:45:00` |
| `account` | integer | nein | — | Kontonummer des Kontos, auf dem die Transaktion liegt. Entspricht `postingaccount_number` aus `/accounts/get`. | existierendes Zahlungskonto des Mandanten | integer, Beispiel `1200` |
| `to_from` | string | nein | — | Zahlungspflichtiger bzw. Zahlungsempfänger der Transaktion. | frei | string |
| `limit` | integer | nein | `500` | Maximale Anzahl gelieferter Datensätze. Maximum ist ebenfalls 500. | 1 bis 500 (Obergrenze dokumentiert, Untergrenze nicht spezifiziert, **nicht verifiziert**) | integer |
| `offset` | integer | nein | `0` | Versatz für das Paging. | ganze Zahl ab 0 | integer |

Verschachtelte Objekt- oder Array-Parameter gibt es bei diesem Endpunkt nicht.

### 3.2 Erfolgsantwort

Schema `TransactionsGet_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | immer `true` im Erfolgsfall |
| `message` | string | leer im Erfolgsfall |
| `rows` | integer | Anzahl der zurückgegebenen Datensätze |
| `data` | array | Liste von Transaktionsobjekten |

Felder je Element in `data`:

| Feld | Typ laut Spezifikation | Typ laut Live-Antwort | Bedeutung |
| --- | --- | --- | --- |
| `id_by_customer` | string (Beispiel `"123"`) | **number** | Mandantenweit eindeutige, fortlaufende Kennung der Transaktion. Referenzschlüssel für alle weiteren Transaktions-Endpunkte. |
| `to_from` | string | string | Zahlungspartner |
| `amount` | string (Beispiel `"123.99"`) | string | Betrag in Kontowährung, Dezimalpunkt, Minuszeichen bei Abgängen |
| `booking_date` | string (Beispiel `"2018-01-01 00:00:00"`) | string | Buchungsdatum mit Uhrzeitanteil |
| `value_date` | string | string | Wertstellungsdatum mit Uhrzeitanteil |
| `purpose` | string | string | Verwendungszweck |

Die Liste enthält **nicht** `account`, `currency`, `account_number`, `bank_code`, `bank_name`, `type` und
`booking_text`. Diese Felder sind nur im Schema von `/transactions/get/id_by_customer` beschrieben, das live nicht
erreichbar ist (Abschnitt 4). Wer Kontozuordnung oder Währung einer Transaktion braucht, bekommt sie über diesen
Endpunkt nicht.

### 3.3 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid date_from specified` | `date_from` unlesbar oder leer | Format `YYYY-MM-DD` verwenden, Feld weglassen statt Leerstring |
| 400 | 6 | `invalid date_to specified` | `date_to` unlesbar oder leer | wie oben |
| 400 | 7 | `invalid account specified` | `account` ungültig | Kontonummer aus `/accounts/get` verwenden, als Zahl senden |
| 400 | 8 | `invalid to_from specified` | `to_from` ungültig | Leerstring vermeiden, Feld weglassen |
| 400 | 9 | `invalid limit specified` | `limit` ungültig oder über 500 | Wert zwischen 1 und 500 |
| 400 | 10 | `invalid offset specified` | `offset` ungültig | Ganze Zahl ab 0 |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 12 | `invalid id_by_customer_from specified` | Untergrenze ungültig | Ganze Zahl senden |
| 400 | 13 | `invalid id_by_customer_to specified` | Obergrenze ungültig | Ganze Zahl senden |
| 400 | 14 | `invalid date_since_last_modified specified` | Zeitpunkt ungültig | Format `YYYY-MM-DD HH:MM:SS` oder `YYYY-MM-DD` |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen mit Backoff |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Wiederholen, Filter enger fassen |

### 3.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/get" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "date_from": "2026-01-01",
        "date_to": "2026-01-31",
        "account": 1200,
        "limit": 100,
        "offset": 0
      }'
```

### 3.5 Live-Verifikation

Aufruf am 2026-09-12 mit `{"api_key": "<...>", "limit": 3}`. HTTP 200.

Anonymisiertes Beispiel der realen Antwort (Beträge, Namen, Verwendungszwecke, IDs und Zeitstempel ersetzt, Struktur
und Typen unverändert). Der dritte gelieferte Datensatz ist hier aus Platzgründen weggelassen, `rows` zeigt daher 3
bei zwei abgedruckten Elementen:

```json
{
  "success": true,
  "message": "",
  "rows": 3,
  "data": [
    {
      "id_by_customer": 1002,
      "to_from": "Beispiel Lieferant GmbH",
      "amount": "-123.45",
      "booking_date": "2026-01-15 09:12:00",
      "value_date": "2026-01-15 09:12:00",
      "purpose": "Beispielhafter Verwendungszweck"
    },
    {
      "id_by_customer": 1001,
      "to_from": "Beispiel Kunde AG",
      "amount": "234.56",
      "booking_date": "2026-01-15 09:12:00",
      "value_date": "2026-01-15 09:12:00",
      "purpose": "Beispielhafter Verwendungszweck"
    }
  ]
}
```

Abweichungen und Beobachtungen aus der Live-Antwort:

1. **`id_by_customer` ist eine JSON-Zahl, nicht ein String.** Die Spezifikation gibt `"type": "string"` an. Ein Parser,
   der strikt einen String erwartet, bricht. Empfehlung: beim Lesen beide Typen akzeptieren.
2. **Die gelieferte Feldmenge stimmt exakt mit dem Schema überein:** genau `id_by_customer`, `to_from`, `amount`,
   `booking_date`, `value_date`, `purpose`. Keine zusätzlichen, keine fehlenden Felder.
3. **Standardsortierung ist absteigend nach `id_by_customer`.** Beobachtet drei Datensätze mit absteigenden Kennungen (die konkreten Werte sind hier anonymisiert). Die Spezifikation
   dokumentiert nur, dass `id_by_customer_from` bzw. `_to` die Sortierung auf aufsteigend umstellt; die
   Standardsortierung ist dort nicht beschrieben. Die Beobachtung stammt aus einem einzigen Aufruf ohne Filter und ist
   **nicht als Garantie zu behandeln**.
4. **IDs sind nicht lückenlos.** Zwischen den drei gelieferten Kennungen lagen Lücken. Paging darf deshalb niemals über
   ID-Arithmetik erfolgen, sondern nur über `limit`/`offset` oder über die vom Server gelieferten Grenzwerte.
5. **`amount` kommt als String mit Dezimalpunkt und führendem Minus bei Abgängen**, Beispielmuster `-###.##` und
   `###.##`. Keine Tausendertrennzeichen, kein Währungssuffix.
6. **`booking_date` und `value_date` enthalten eine Uhrzeit**, obwohl die Filterparameter `date_from`/`date_to` nur
   ein reines Datum akzeptieren.
7. **Keine Rate-Limit-Header** in der Antwort. Weder `X-RateLimit-*` noch `Retry-After` waren vorhanden. Ein Client
   muss das Limit selbst mitzählen.
8. Fehlerpfad live geprüft: `{"limit": 9999, "date_from": "nonsense"}` liefert HTTP 400 mit einem Fehlerumschlag, dessen
   `message` wörtlich `invalid date_from specified` lautet. Der numerische `error_code` wurde beim Mitschnitt maskiert
   und nicht wörtlich gelesen; laut Spezifikation gehört zu dieser Meldung der Code 5. Die Validierung bricht beim ersten
   Fehler ab, es wird **nur ein** Fehler gemeldet, obwohl zwei Parameter ungültig waren. `date_from` wird offenbar vor
   `limit` geprüft. Die genaue Prüfreihenfolge über alle Felder ist **nicht verifiziert**.

### 3.6 Fallstricke

- Die ID-Grenzen `id_by_customer_from` und `id_by_customer_to` sind **exklusiv**, die Datumsgrenzen `date_from` und
  `date_to` sind **inklusiv**. Diese Inkonsistenz ist in der Spezifikation ausdrücklich so beschrieben.
- Ein Leerstring gilt bei allen Datumsfeldern als ungültig. Optionale Felder müssen weggelassen, nicht leer gesetzt
  werden. Das gilt auch für `to_from`.
- `limit` hat Default und Maximum 500. Wer mehr Daten braucht, muss über `offset` blättern oder über
  `id_by_customer_from` schrittweise vorrücken. Für inkrementelle Synchronisation ist `date_since_last_modified` das
  passende Feld; es filtert auf `date_updated`, nicht auf `booking_date`.
- Sobald `id_by_customer_from` oder `id_by_customer_to` gesetzt ist, ändert sich die Sortierung. Ein Client, der
  Datumsfilter und ID-Filter mischt, bekommt eine andere Reihenfolge als ohne ID-Filter.
- `account` ist hier ein Integer, `postingaccount_number` aus `/accounts/get` kommt laut Schema als String. Der
  Client muss konvertieren.

---

## 4. `/transactions/get/id_by_customer`

Soll eine einzelne Transaktion anhand ihrer `id_by_customer` liefern. Die `id_by_customer` erhält man laut
Beschreibung vorab über `/transactions/get`.

**Einordnung: lesend.**

### 4.1 Parameter (1 von 1 laut Spezifikation, inhaltlich unvollständig)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |

`jq '.paths["/transactions/get/id_by_customer"].post.parameters | length'` liefert `1`. Das ist die vollständige
Parameterliste der Datei, aber offensichtlich **nicht** die vollständige fachliche Parameterliste: Der Endpunkt
definiert einen Fehlerfall `400 (5) invalid id_by_customer specified` und `400 (6) transaction not found`. Ein Feld
`id_by_customer` fehlt also in der Parameterliste.

**Annahme (nicht verifiziert):** Das fehlende Pflichtfeld heißt `id_by_customer` und ist ein Integer. Grundlage der
Annahme ist die Analogie zu `/receipts/get/id_by_customer`, wo dieselbe Fehlermeldung auftritt und der Aufruf mit
`{"api_key": "...", "id_by_customer": 1}` live tatsächlich die JSON-Fehlermeldung `invalid id_by_customer specified`
erzeugt (HTTP 400) statt eines Routing-Fehlers. Die Feldbenennung ist damit für die Receipts-Variante belegt, für die
Transactions-Variante nur plausibel.

### 4.2 Erfolgsantwort

Schema `TransactionsGetIdByCustomer_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | leer |
| `data` | **object** | Ein einzelnes Transaktionsobjekt |

Ein `rows`-Feld ist in diesem Schema **nicht** vorhanden, anders als bei allen anderen lesenden
Transaktions-Endpunkten. Die Feldbeschreibung von `data` lautet in der Spezifikation „An array of transaction data",
der deklarierte Typ ist jedoch `object`. Das ist ein Widerspruch innerhalb der Spezifikation; der deklarierte Typ ist
die wahrscheinlichere Wahrheit, **nicht verifiziert**.

Felder in `data`:

| Feld | Typ laut Spezifikation | Beispielwert in der Spezifikation | Bedeutung |
| --- | --- | --- | --- |
| `id_by_customer` | string | `"987"` | Kennung der Transaktion |
| `account` | integer | `"1200"` (als String notiert) | Kontonummer des Zahlungskontos, entspricht `postingaccount_number` |
| `to_from` | string | `"Name of payer/payee"` | Zahlungspartner |
| `booking_date` | string | `"2018-01-01 00:00:00"` | Buchungsdatum |
| `value_date` | string | `"2018-01-01 00:00:00"` | Wertstellungsdatum |
| `amount` | string | `"123.99"` | Betrag |
| `currency` | string | `"EUR"` | Währung der Transaktion |
| `account_number` | string | `"11234567"` | Kontonummer oder IBAN der Gegenseite |
| `bank_code` | string | `"1234567890"` | Bankleitzahl oder BIC der Gegenseite |
| `bank_name` | string | `"My Bank"` | Name der Bank der Gegenseite |
| `purpose` | string | `"The prurpose of the transaction"` (Schreibfehler im Original) | Verwendungszweck |
| `type` | string | `"The transaction type"` | Transaktionsart |
| `booking_text` | string | `"The booking text"` | Buchungstext |

Beim Feld `account` steht `"type": "integer"`, der Beispielwert ist aber der String `"1200"`. Widerspruch in der
Spezifikation, **nicht verifiziert**, welcher Typ real geliefert wird.

### 4.3 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid id_by_customer specified` | Kennung fehlt oder ist kein gültiger Wert | Ganzzahlige Kennung aus `/transactions/get` senden |
| 400 | 6 | `transaction not found` | Keine Transaktion mit dieser Kennung beim Mandanten | Kennung gegen `/transactions/get` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen mit Backoff |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Wiederholen |

### 4.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/get/id_by_customer" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "id_by_customer": 12345
      }'
```

Das Feld `id_by_customer` ist in der Spezifikation nicht als Parameter gelistet; das Beispiel folgt der oben
beschriebenen Annahme.

### 4.5 Live-Verifikation: der literale Pfad existiert nicht, der Wert gehört ins Pfadsegment

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 0.3, Befund L1 und in Abschnitt 4.6.** Die beiden Messungen unten
> bleiben unverändert richtig: Der **literale** Pfad `/transactions/get/id_by_customer` ist
> nicht geroutet und antwortet mit einer HTML-Seite. Falsch war die daraus gezogene Folgerung,
> der Einzelabruf sei unbenutzbar. Das Segment `id_by_customer` ist ein **Platzhalter für den
> Wert**: `POST /transactions/get/<wert>` mit dem Body `{"api_key": "…"}` antwortet gemessen am
> 2026-09-12 mit **HTTP 200** und einem vollständigen Transaktionsdatensatz einschließlich
> `account`, `currency`, `account_number`, `bank_code`, `bank_name`, `type` und `booking_text`.
> Der Wert ist vor dem Einsetzen zu kodieren; ein Body-Feld `id_by_customer` wird nicht
> gesendet. **Die unten beschriebene Umgehung über die exklusiven Kennungsgrenzen
> `id_by_customer_from` und `id_by_customer_to` wird damit nicht gebraucht** und ist nicht
> umzusetzen. Vollständige Messung: `docs/api/live-befunde-orchestrator.md`, Befund 1.

**Das ist das wichtigste Ergebnis dieses Dossiers.**

Zwei Aufrufe am 2026-09-12 gegen `https://webapp.buchhaltungsbutler.de/api/v1/transactions/get/id_by_customer`:

| Versuch | Body | Ergebnis |
| --- | --- | --- |
| 1 | `{"api_key": "<...>", "id_by_customer": <existierende ID aus /transactions/get>}` | HTTP 404, Antwortkörper ist eine HTML-Seite der Weboberfläche, kein JSON |
| 2 | `{"api_key": "<...>", "id_by_customer": 1}` | HTTP 404, identisches HTML |

Kontrollmessung zur Abgrenzung: Der analoge Pfad `/receipts/get/id_by_customer` liefert mit demselben Client, demselben
`api_key` und derselben Body-Struktur HTTP 400 mit sauberem JSON
(`success: false`, `message: "invalid id_by_customer specified"`, laut Spezifikation Code 5; der numerische Wert war im
Mitschnitt maskiert). Die Authentifizierung, das
Routing-Muster mit drei Pfadsegmenten und der Body-Aufbau funktionieren also grundsätzlich.

Schlussfolgerung: Der dokumentierte Endpunkt `/transactions/get/id_by_customer` ist in der aktuell erreichbaren
Produktivumgebung **nicht geroutet**. Der HTML-Antwortkörper ist die generische 404-Seite der Anwendung, nicht der
API-Fehlerumschlag.

Was **nicht** ausgeschlossen wurde, weil die Aufrufe schreibende Pfade oder weitere Rateversuche erfordert hätten:

- ob ein anderer Feldname als `id_by_customer` das Routing beeinflusst. Unwahrscheinlich, weil ein falscher Feldname
  bei allen anderen Endpunkten zu einem JSON-Fehler und nicht zu HTTP 404 führt. **Nicht verifiziert.**
- ob eine abweichende Pfadschreibweise existiert, etwa mit der ID im Pfad. **Nicht verifiziert.**
- ob der Endpunkt mandantenabhängig freigeschaltet wird. **Nicht verifiziert.**

**Konsequenz für die Implementierung, nachgezogen (siehe Kasten oben):** Der Einzelabruf wird als
`POST /transactions/get/<wert>` gebaut. Die früher hier beschriebene Umgehung über
`/transactions/get` mit `id_by_customer_from = id - 1` und `id_by_customer_to = id + 1` wird
**nicht** gebraucht und ist damit gegenstandslos; sie war selbst nie live verifiziert und lieferte
nur die sechs Listenfelder, nicht `account`, `currency`, `account_number`, `bank_code`,
`bank_name`, `type` und `booking_text`. Genau diese Felder liefert der Einzelabruf in der
gemessenen Pfadform mit.

### 4.6 Fallstricke

- Der Client muss HTML-Antworten abfangen. Ein `JSON.parse` auf den 404-Körper wirft. Robuste Implementierung: erst
  HTTP-Status und `Content-Type` prüfen, dann parsen.
- Das Antwortformat weicht von allen anderen lesenden Endpunkten ab: `data` ist ein Objekt statt eines Arrays und es
  gibt kein `rows`.

---

## 5. `/transactions/add`

Legt eine einzelne Transaktion auf einem Zahlungskonto des Mandanten an.

> **Schreibender Endpunkt.** Erzeugt einen dauerhaften Datensatz in der Buchhaltung des Mandanten. Nicht zu Testzwecken
> gegen Produktivmandanten aufrufen. In diesem Dossier **nicht live verifiziert**, weil schreibende Aufrufe untersagt
> waren.

### 5.1 Parameter (14 von 14)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | **ja** | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |
| `account` | integer | **ja** | — | Kontonummer des Zahlungskontos, auf das die Transaktion gebucht wird. Das Konto muss beim Mandanten als Zahlungskonto existieren. | Wert aus `/accounts/get` (`postingaccount_number`) | integer, Beispiel `1200` |
| `to_from` | string | **ja** | — | Zahlungsempfänger oder Zahlungssender | frei, Leerstring ungültig (Fehler 9) | string |
| `amount` | number (`float`) | **ja** | — | Betrag in der Währung des Kontos. **Positiv bei Zahlungseingang, negativ bei Zahlungsausgang.** `0.00` ist kein gültiger Betrag. | alles außer 0 | Gleitkommazahl, Dezimalpunkt, Beispiel `123.99` bzw. `-123.99` |
| `booking_date` | string | **ja** | — | Buchungsdatum der Transaktion | gültiger Zeitpunkt | `YYYY-MM-DD HH:II:SS`, Beispiel `2017-04-26 00:00:00` |
| `value_date` | string | nein | Wert von `booking_date` | Wertstellungsdatum. Ohne Angabe wird das Buchungsdatum übernommen. Leerstring ungültig. | gültiger Zeitpunkt | `YYYY-MM-DD HH:II:SS` |
| `account_number` | string | nein | — | Kontonummer oder IBAN der Gegenseite. Leerstring ungültig. | frei, wird validiert | string |
| `bank_code` | string | nein | — | Bankleitzahl oder BIC der Gegenseite. Leerstring ungültig. | frei, wird validiert | string |
| `bank_name` | string | nein | — | Name der Bank der Gegenseite. Leerstring ungültig. | frei, wird validiert | string |
| `purpose` | string | nein | — | Verwendungszweck. **Darf ausdrücklich auch ein Leerstring sein.** | frei | string |
| `type` | string | nein | — | Transaktionsart, Beispiel `Direct debit`. Leerstring ungültig. | frei, wird validiert; eine geschlossene Werteliste ist in der Spezifikation **nicht** angegeben | string |
| `booking_text` | string | nein | — | Buchungstext. **Darf ausdrücklich auch ein Leerstring sein.** | frei | string |
| `payment_reference` | string | nein | — | Zahlungsreferenz. Bei korrekter Angabe ordnet das System die neue Transaktion automatisch dem passenden Beleg zu. | frei | string, Beispiel aus der Spezifikation `rn_123` |
| `currency` | string | nein | — | Währung der Transaktion. Leerstring ungültig. | siehe Währungsliste unten | ISO-4217-Code, Beispiel `EUR` |

Verschachtelte Objekt- oder Array-Parameter gibt es bei diesem Endpunkt nicht.

**Währungsliste laut Parameterbeschreibung von `/transactions/add`:**
AED, AUD, BGN, BRL, CAD, CHF, CNY, COP, CYP, CZK, DKK, EUR, GBP, HKD, HRK, HUF, IDR, ILS, INR, ISK, JPY, KRW, LTL,
LVL, MTL, MXN, MYR, NOK, NZD, PEN, PHP, PLN, QAR, ROL, RON, RUB, SEK, SGD, SIT, SKK, THB, TRL, TRY, UAH, USD, VND,
ZAR.

**Widerspruch:** Die Definition `Transaction` in derselben Datei, die für `/transactions/addBatch` verwendet wird,
listet zusätzlich **RSD** zwischen RON und RUB. Die beiden Listen in der Spezifikation sind also nicht identisch.
Welche Liste der Server tatsächlich durchsetzt, ist **nicht verifiziert**. Wer RSD braucht, sollte den Aufruf
vorsichtig testen und Fehlercode 26 erwarten.

Ohne `currency`-Angabe ist in der Spezifikation nicht beschrieben, welche Währung angenommen wird. Plausibel ist die
Kontowährung, da die Betragsbeschreibung von „in the account's currency" spricht. **Annahme, nicht verifiziert.**

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in den Abschnitten 4.3 und 4.5.** Umgesetzt wird an `/transactions/add` **und** an
> `/transactions/addBatch` dasselbe `enum` aus **48** Codes, nämlich der Vereinigung der 47
> Codes dieses Endpunkts mit dem zusätzlichen `RSD` der Definition `Transaction`. An **beiden**
> Werkzeugen ist das Feld **optional**. Begründung der Vereinigung: Die Spezifikation erklärt
> Stapelelement und Einzelendpunkt wörtlich für gleich; ein Werkzeugpaar, das einen Wert einzeln
> erlaubt und im Stapel verbietet, wäre eine erfundene Unterscheidung. Ob die API `RSD` an
> `/transactions/add` tatsächlich annimmt, bleibt **nicht verifiziert**; ein abgelehnter Request
> mit sprechender Meldung ist der billigere Irrtum als eine unsichtbare Ablehnung vor dem
> Request. Die Werkzeugbeschreibung nennt zusätzlich, dass ohne Angabe die Währung des
> Zahlungskontos gilt und dass **die API diese Währung an keinem Endpunkt preisgibt**.

### 5.2 Erfolgsantwort

Schema `TransactionsAdd_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | leer |
| `id_by_customer` | string (Beispiel `"123"`) | Kennung der neu angelegten Transaktion |

Bemerkenswert: `id_by_customer` steht auf der **obersten Ebene**, nicht in einem `data`-Objekt. Es gibt kein `data`
und kein `rows`. Ein generischer Envelope-Parser, der immer `data` erwartet, scheitert hier.

### 5.3 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `no account specified` | `account` fehlt | Pflichtfeld setzen |
| 400 | 6 | `invalid account specified` | `account` formal ungültig | Ganzzahlige Kontonummer senden |
| 400 | 7 | `account specified does not exist for the customer` | Konto existiert beim Mandanten nicht als Zahlungskonto | Konto über `/accounts/get` ermitteln |
| 400 | 8 | `no payment recipient or sender (to_from) specified` | `to_from` fehlt | Pflichtfeld setzen |
| 400 | 9 | `invalid payment recipient or sender (to_from) specified` | `to_from` ungültig, etwa leer | Nicht leeren Text senden |
| 400 | 10 | `no amount specified` | `amount` fehlt | Pflichtfeld setzen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 13 | `invalid amount specified` | Betrag ungültig, etwa `0.00` oder nicht numerisch | Zahl ungleich null senden |
| 400 | 14 | `no booking date specified` | `booking_date` fehlt | Pflichtfeld setzen |
| 403 | 15 | `adding temporarily restricted` | Schreiben aktuell gesperrt | Später erneut versuchen |
| 400 | 16 | `invalid booking date specified` | Buchungsdatum unlesbar | Format `YYYY-MM-DD HH:II:SS` |
| 400 | 17 | `invalid value date specified` | Wertstellungsdatum unlesbar | Feld weglassen oder korrektes Format |
| 400 | 18 | `invalid account number specified` | `account_number` ungültig | Feld weglassen oder gültige IBAN/Kontonummer |
| 400 | 19 | `invalid bank code specified` | `bank_code` ungültig | Feld weglassen oder gültige BLZ/BIC |
| 400 | 20 | `invalid bank name specified` | `bank_name` ungültig | Feld weglassen oder nicht leeren Text senden |
| 400 | 21 | `invalid purpose specified` | `purpose` ungültig | Zeichenvorrat oder Länge prüfen |
| 400 | 22 | `invalid type specified` | `type` ungültig | Feld weglassen; Werteliste ist nicht dokumentiert |
| 400 | 23 | `no post and files content received or declined` | Body leer oder abgelehnt | Body und Content-Type prüfen |
| 400 | 24 | `invalid booking text specified` | `booking_text` ungültig | Zeichenvorrat oder Länge prüfen |
| 400 | 25 | `invalid payment reference specified` | `payment_reference` ungültig | Feld weglassen oder Wert korrigieren |
| 400 | 26 | `invalid currency specified` | Währung nicht unterstützt | Code aus der Währungsliste verwenden |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen mit Backoff; vorher prüfen, ob die Transaktion doch angelegt wurde |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Nicht blind wiederholen, erst über `/transactions/get` prüfen, ob der Datensatz existiert |

**Spezifikationsfehler:** Die Definition `TransactionsAdd_ErrorCode24` enthält `"error_code": 23`, obwohl der
Response-Schlüssel `400 (24)` lautet und die Meldung `invalid booking text specified` ist. Damit kollidiert sie im
Schema mit Fehler 23 (`no post and files content received or declined`). Welcher Code real gesendet wird, ist
**nicht verifiziert**. Ein Client sollte im Zweifel auf die `message` und nicht allein auf den Code reagieren.

Ein Fehlercode 12 existiert bei diesem Endpunkt nicht; die Nummerierung hat eine Lücke.

### 5.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/add" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "account": 1200,
        "to_from": "Beispiel Lieferant GmbH",
        "amount": -123.45,
        "booking_date": "2026-01-15 00:00:00",
        "value_date": "2026-01-15 00:00:00",
        "account_number": "DE00000000000000000000",
        "bank_code": "XXXXDEFFXXX",
        "bank_name": "Beispielbank AG",
        "purpose": "Rechnung 2026-0001",
        "type": "direct debit",
        "booking_text": "Lastschrift",
        "payment_reference": "rn_2026_0001",
        "currency": "EUR"
      }'
```

### 5.5 Fallstricke

- **Datumsformat weicht von `/transactions/get` ab.** Hier ist `YYYY-MM-DD HH:II:SS` mit Uhrzeitanteil verlangt, bei
  den Filtern von `/transactions/get` ist es `YYYY-MM-DD` ohne Uhrzeit. Das `II` in der Spezifikation ist die
  PHP-Schreibweise für Minuten und bedeutet dasselbe wie `MM` an dieser Stelle, also `HH:MM:SS`.
- **Betrag als Zahl senden, Betrag kommt als String zurück.** Im Request ist `amount` ein `number` mit Format `float`,
  in jeder Leseantwort ist es ein String. Der Client braucht beide Richtungen.
- **Vorzeichen ist die einzige Richtungsinformation.** Es gibt kein Feld für Soll/Haben oder Eingang/Ausgang.
  Positiv bedeutet Geldeingang auf dem Zahlungskonto, negativ bedeutet Geldausgang. Siehe Abschnitt 10.
- **Kein Idempotenzschlüssel.** Zweimaliges Senden desselben Bodys erzeugt zwei Transaktionen. Bei Timeout (Code 30)
  darf nicht automatisch wiederholt werden, ohne vorher über `/transactions/get` zu prüfen.
- **`purpose` und `booking_text` dürfen leer sein, alle anderen optionalen Felder nicht.** Bei `value_date`,
  `account_number`, `bank_code`, `bank_name`, `type` und `currency` führt ein Leerstring zum Validierungsfehler. Diese
  Felder müssen weggelassen werden, wenn kein Wert vorliegt. Das ist die häufigste Fehlerquelle, wenn ein Client
  Objekte mit leeren Feldern serialisiert.
- **`payment_reference` hat eine Nebenwirkung.** Bei korrektem Wert verknüpft der Server die neue Transaktion
  automatisch mit dem passenden Beleg. Ein Client, der danach selbst `/transactions/assign/receipt` aufruft, kann auf
  eine bereits bestehende Zuordnung treffen. Das Verhalten in diesem Fall ist in der Spezifikation nicht beschrieben,
  **nicht verifiziert**.
- Die Feldnamen `account` (Zahlungskonto des Mandanten) und `account_number` (Konto der Gegenseite) sehen ähnlich aus
  und bedeuten Gegensätzliches. Verwechslungsgefahr.

---

## 6. `/transactions/addBatch`

Legt mehrere Transaktionen in einem Aufruf an.

> **Schreibender Endpunkt.** In diesem Dossier **nicht live verifiziert**.

### 6.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | **ja** | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |
| `transactions` | array of object (`$ref` auf `Transactions` → `Transaction`) | **ja** | — | Liste der anzulegenden Transaktionen. Maximal 50 Einträge. Ein Eintrag hat dieselben Felder wie `/transactions/add`, und laut Spezifikation gelten dieselben Fehlermeldungen. | 1 bis 50 Elemente | JSON-Array |

### 6.2 Struktur eines Array-Elements (`Transaction`)

Pflichtfelder laut `required` der Definition: `account`, `to_from`, `amount`, `booking_date`.

| Feld | Typ | Pflicht | Beschreibung | Format |
| --- | --- | --- | --- | --- |
| `account` | integer | **ja** | Kontonummer des Zahlungskontos, muss beim Mandanten als Zahlungskonto existieren | integer, Beispiel `1200` |
| `to_from` | string | **ja** | Zahlungsempfänger oder Zahlungssender | string |
| `amount` | number (`float`) | **ja** | Betrag, positiv bei Eingang, negativ bei Ausgang, `0.00` unzulässig | Gleitkommazahl |
| `booking_date` | string | **ja** | Buchungsdatum | `YYYY-MM-DD HH:II:SS` |
| `value_date` | string | nein | Wertstellungsdatum, Default ist `booking_date` | `YYYY-MM-DD HH:II:SS` |
| `account_number` | string | nein | Kontonummer oder IBAN der Gegenseite | string |
| `bank_code` | string | nein | BLZ oder BIC der Gegenseite | string |
| `bank_name` | string | nein | Bankname der Gegenseite | string |
| `purpose` | string | nein | Verwendungszweck, Leerstring erlaubt | string |
| `type` | string | nein | Transaktionsart, Leerstring unzulässig | string |
| `booking_text` | string | nein | Buchungstext, Leerstring erlaubt | string |
| `payment_reference` | string | nein | Zahlungsreferenz, löst automatische Belegzuordnung aus | string |
| `currency` | string | nein | Währung; die Liste dieser Definition enthält zusätzlich **RSD** gegenüber der Liste bei `/transactions/add` | ISO-4217-Code |

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in den Abschnitten 4.3 und 4.5.** Für `currency` gilt hier dasselbe wie am
> Einzelendpunkt: **ein** `enum` aus **48** Codes an beiden Werkzeugen, beide Male **optional**,
> mit wortgleicher Beschreibung. Der zusätzlich in dieser Definition stehende Ein-Wert-`enum`
> `["EUR"]` widerspricht dem Beschreibungstext derselben Eigenschaft und wird **verworfen**.
> Einzelheiten in Abschnitt 5.1.

Beispielobjekt aus der Spezifikation (Feld `example` der Definition `Transaction`):

```json
{
  "account": 1200,
  "to_from": "Name of payer/payee",
  "amount": 123.99,
  "booking_date": "2018-01-01 00:00:00",
  "value_date": "2018-01-01 00:00:00",
  "account_number": "DE1234567890",
  "bank_code": "DEUTDEFFXXX",
  "bank_name": "Deutsche Bank AG",
  "purpose": "",
  "type": "direct debit",
  "booking_text": "booking text",
  "payment_reference": "rn_123",
  "currency": "EUR"
}
```

### 6.3 Erfolgsantwort

Schema `TransactionsAddBatch_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Gesamtergebnis des Requests. Die Beschreibung lautet „is the request successful or faulty". Es gibt **kein** `enum`, der Wert kann also auch `false` sein, ohne dass der Fehlerumschlag greift. |
| `transactions` | array | Erfolgreich angelegte Transaktionen |
| `errors` | array | Fehlgeschlagene Einträge |

Element in `transactions`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | Meldung, im Erfolgsfall leer |
| `id_by_customer` | string | Kennung der neu angelegten Transaktion |

Element in `errors`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `false` |
| `error_code` | integer | Fehlercode dieses Eintrags, laut Spezifikation aus derselben Menge wie bei `/transactions/add` |
| `message` | string | Fehlermeldung des fehlerhaften Eintrags |
| `request_data` | array | Die gesendeten Daten dieses Eintrags, zur Zuordnung |

**Wichtig:** Es gibt keinen Index, der Antwortelemente eindeutig auf Eingangselemente abbildet. Die Zuordnung
erfolgt nur über `request_data` im Fehlerfall. Ob `transactions` die Eingabereihenfolge beibehält, ist in der
Spezifikation nicht beschrieben und **nicht verifiziert**.

### 6.4 Fehlerfälle

Diese Fehler betreffen den Gesamtrequest. Fehler einzelner Einträge erscheinen stattdessen im `errors`-Array der
Erfolgsantwort.

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `Number of transactions exceeded` | Mehr als 50 Einträge gesendet | In Blöcke zu höchstens 50 aufteilen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 403 | 15 | `adding temporarily restricted` | Schreiben gesperrt | Später erneut versuchen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen erst nach Prüfung, was schon angelegt wurde |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Nicht blind wiederholen, Zustand über `/transactions/get` prüfen |

Die Response-Beschreibung von `400 (5)` in der Spezifikation lautet „Maximum of 50 transactions exceeded", die
`message` der zugehörigen Definition lautet „Number of transactions exceeded". Beides meint denselben Fall.

### 6.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/addBatch" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "transactions": [
          {
            "account": 1200,
            "to_from": "Beispiel Lieferant GmbH",
            "amount": -123.45,
            "booking_date": "2026-01-15 00:00:00",
            "purpose": "Rechnung 2026-0001",
            "currency": "EUR"
          },
          {
            "account": 1200,
            "to_from": "Beispiel Kunde AG",
            "amount": 234.56,
            "booking_date": "2026-01-16 00:00:00",
            "purpose": "Zahlungseingang 2026-0002",
            "currency": "EUR"
          }
        ]
      }'
```

### 6.6 Fallstricke

- **Eigenes Drosselungslimit:** Die Beschreibung sagt ausdrücklich „a request is allowed only every 5 seconds". Das ist
  strenger als das allgemeine Limit von 100 Requests pro Minute. Ein Client muss zwischen zwei `addBatch`-Aufrufen
  mindestens 5 Sekunden warten. Welchen Fehler der Server bei Verletzung sendet, ist nicht dokumentiert und
  **nicht verifiziert**.
- **Teilerfolg ist der Normalfall.** Ein HTTP 200 bedeutet nicht, dass alle Einträge angelegt wurden. Der Client muss
  immer `errors` auswerten.
- Der Parametername ist `transactions` im Plural; das Element-Schema heißt `Transaction` im Singular. Das
  `$ref`-Ziel `Transactions` ist lediglich ein Array-Wrapper.
- Die Spezifikation verweist für Feldfehler auf `/transactions/add`, listet die Codes hier aber nicht erneut auf. Die
  vollständige Liste steht in Abschnitt 5.3.

---

## 7. `/transactions/assign/receipt`

Ordnet einen Beleg einer Transaktion zu.

> **Schreibender Endpunkt.** Verändert die Zuordnung in der Buchhaltung des Mandanten. In diesem Dossier
> **nicht live verifiziert**.

### 7.1 Parameter (3 von 3)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | **ja** | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |
| `transaction_id_by_customer` | integer | **ja** | — | Kennung der Transaktion, an die der Beleg gehängt wird | `id_by_customer` aus `/transactions/get` | integer |
| `receipt_id_by_customer` | integer | **ja** | — | Kennung des Belegs, der zugeordnet wird | `id_by_customer` aus `/receipts/get` | integer |

Verschachtelte Strukturen gibt es nicht.

### 7.2 Erfolgsantwort

Schema `TransactionsAssignReceipt_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | leer |

Kein `data`, kein `rows`, keine ID der erzeugten Verknüpfung. Wer den Zustand danach prüfen will, muss
`/transactions/assigned-receipts/get` aufrufen.

### 7.3 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid assignment type specified` | Zuordnungsart ungültig. Ein entsprechender Parameter ist in der Spezifikation **nicht** dokumentiert. Siehe Fallstricke. | Nur die drei dokumentierten Felder senden und keine weiteren |
| 400 | 6 | `no transaction_id_by_customer specified` | Transaktionskennung fehlt | Pflichtfeld setzen |
| 400 | 7 | siehe Hinweis unten | Belegkennung fehlt | Pflichtfeld `receipt_id_by_customer` setzen |
| 400 | 8 | `transaction not found` | Transaktion existiert beim Mandanten nicht | Kennung über `/transactions/get` prüfen |
| 400 | 9 | `receipt not found` | Beleg existiert beim Mandanten nicht | Kennung über `/receipts/get` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 23 | `no post and files content received or declined` | Body leer oder abgelehnt | Body und Content-Type prüfen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen; die Operation ist fachlich wiederholbar, da die Zuordnung entweder besteht oder nicht |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Zustand über `/transactions/assigned-receipts/get` prüfen, dann entscheiden |

**Spezifikationsfehler bei Code 7:** Die Response-Beschreibung lautet „no receipt_id_by_customer specified", das
`$ref` zeigt aber auf `PostingsAssignReceiptToFreePosting_ErrorCode7`, dessen `message` `posting not found` ist. Die
tatsächlich gesendete Meldung ist damit unklar, **nicht verifiziert**. Fachlich passt „no receipt_id_by_customer
specified"; die Definition `TransactionsAssignReceipt_ErrorCode7` mit genau dieser Meldung existiert in der Datei,
wird aber vom Endpunkt nicht referenziert.

### 7.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/assign/receipt" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "transaction_id_by_customer": 12345,
        "receipt_id_by_customer": 67890
      }'
```

### 7.5 Fallstricke

- Fehlercode 5 „invalid assignment type specified" deutet auf einen internen Parameter für die Zuordnungsart hin, der
  in der öffentlichen Parameterliste fehlt. Vermutlich setzt der Endpunkt die Art fest auf „Beleg zu Transaktion" und
  der Fehler stammt aus einem gemeinsamen Codepfad mit `/postings/assign/receipt-to-free-posting`. **Annahme, nicht
  verifiziert.** Praktische Konsequenz: keine zusätzlichen Felder senden.
- Die Zuordnung ist gerichtet benannt, aber inhaltlich symmetrisch. `/receipts/assigned-transactions/get` liefert
  dieselbe Beziehung aus Belegsicht. Einen Endpunkt `/receipts/assign/transaction` gibt es in der Spezifikation
  **nicht**; die Zuordnung wird also immer über die Transaktionsseite hergestellt.
- Mehrere Belege pro Transaktion sind möglich. Das ergibt sich daraus, dass `/transactions/assigned-receipts/get` ein
  Array liefert und `/transactions/unassign/receipt` einen konkreten Beleg zum Lösen verlangt.
- Was bei doppelter Zuordnung desselben Belegs passiert, ist nicht dokumentiert. **Nicht verifiziert.**

---

## 8. `/transactions/unassign/receipt`

Löst die Zuordnung eines bestimmten Belegs von einer Transaktion.

> **Schreibender Endpunkt.** In diesem Dossier **nicht live verifiziert**.

### 8.1 Parameter (3 von 3)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | **ja** | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |
| `transaction_id_by_customer` | integer | **ja** | — | Kennung der Transaktion | `id_by_customer` aus `/transactions/get` | integer |
| `receipt_id_by_customer` | integer | **ja** | — | Kennung des Belegs, dessen Zuordnung gelöst wird | `id_by_customer` aus `/receipts/get` | integer |

### 8.2 Erfolgsantwort

Schema `TransactionsUnassignReceipt_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | leer |

### 8.3 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 6 | `no or invalid transaction_id_by_customer specified` | Transaktionskennung fehlt oder ist ungültig | Ganzzahlige Kennung setzen |
| 400 | 7 | `no or invalid receipt_id_by_customer specified` | Belegkennung fehlt oder ist ungültig | Ganzzahlige Kennung setzen |
| 400 | 8 | `transaction not found` | Transaktion existiert nicht | Kennung prüfen |
| 400 | 9 | `receipt not found` | Beleg existiert nicht | Kennung prüfen |
| 400 | 10 | `receipt could not be removed from transaction, because of a confirmed posting.` | Die Zuordnung ist durch eine bestätigte Buchung gesperrt | Erst die Buchung stornieren oder entbestätigen (`/postings/cancel`, `/postings/unconfirm/transaction`), dann erneut versuchen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 400 | 23 | `no receipts assigned to transaction` | Der Transaktion ist überhaupt kein Beleg zugeordnet | Vorher `/transactions/assigned-receipts/get` abfragen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Zustand prüfen, dann entscheiden |

Ein Fehlercode 5 existiert bei diesem Endpunkt nicht.

### 8.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/unassign/receipt" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "transaction_id_by_customer": 12345,
        "receipt_id_by_customer": 67890
      }'
```

### 8.5 Fallstricke

- **`error_code` 23 bedeutet hier etwas völlig anderes als überall sonst.** Sonst heißt 23 „no post and files content
  received or declined", hier „no receipts assigned to transaction". Ein Client, der Fehlercodes global mappt,
  interpretiert diesen Fall falsch. Entweder endpunktspezifisch mappen oder auf die `message` abstellen.
- **Bestätigte Buchungen blockieren das Lösen (Code 10).** Die Reihenfolge beim Rückabwickeln ist deshalb: erst
  Buchung entbestätigen oder stornieren, dann Zuordnung lösen. Ein Agent, der nur die Zuordnung lösen will, muss
  diesen Fall sauber an den Nutzer zurückmelden statt zu wiederholen.
- Es gibt keine Batch-Variante zum Lösen von Zuordnungen. `/transactions/assign-batch/receipt` hat kein Gegenstück.
- Die Meldung zu Code 10 endet im Original mit einem Punkt, die meisten anderen Meldungen nicht. Wer auf exakte
  Meldungstexte matcht, muss das berücksichtigen. Besser: auf `error_code` prüfen.

---

## 9. `/transactions/assign-batch/receipt`

Ordnet mehrere Belege in einem Aufruf mehreren Transaktionen zu.

> **Schreibender Endpunkt.** In diesem Dossier **nicht live verifiziert**.

### 9.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | **ja** | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |
| `transactions_to_receipts` | array of object (`$ref` auf `TransactionsToReceipts` → `TransactionToReceipt`) | **ja** | — | Liste der herzustellenden Zuordnungen. Maximal 50 Elemente. | 1 bis 50 Elemente | JSON-Array |

### 9.2 Struktur eines Array-Elements (`TransactionToReceipt`)

Beide Felder sind laut `required` Pflicht.

| Feld | Typ | Pflicht | Beschreibung | Format |
| --- | --- | --- | --- | --- |
| `receipt_id_by_customer` | integer | **ja** | `id_by_customer` des Belegs | integer |
| `transaction_id_by_customer` | integer | **ja** | `id_by_customer` der Transaktion | integer |

Beispielobjekt aus der Spezifikation:

```json
{
  "transaction_id_by_customer": 1,
  "receipt_id_by_customer": 1
}
```

### 9.3 Erfolgsantwort

Schema `TransactionsAssignBatchReceipt_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Gesamtergebnis, ohne festen Wert |
| `transactions_to_receipts` | array | Erfolgreich hergestellte Zuordnungen |
| `errors` | array | Fehlgeschlagene Zuordnungen |

Element in `transactions_to_receipts`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | Meldung |
| `transaction_id_by_customer` | **string** | Kennung der Transaktion |
| `receipt_id_by_customer` | **string** | Kennung des Belegs |

Beachten: Im Request sind beide Kennungen `integer`, in der Erfolgsantwort sind sie `string`. Widerspruch innerhalb
desselben Endpunkts, in der Spezifikation so angelegt, **nicht live verifiziert**.

Element in `errors`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `false` |
| `error_code` | integer | Fehlercode dieses Eintrags |
| `message` | string | Fehlermeldung für den fehlerhaften Beleg |
| `request_data` | array | Die gesendeten Daten dieses Eintrags |

### 9.4 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 10 | `Number of transactions to receipts exceeded` | Mehr als 50 Elemente gesendet | In Blöcke zu höchstens 50 aufteilen |
| 400 | 12 | `No transactions to receipts found` | Das Array fehlt oder ist leer | Mindestens ein Element senden, Feldname `transactions_to_receipts` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 403 | 15 | `adding temporarily restricted` | Schreiben gesperrt | Später erneut versuchen |
| 400 | 23 | `no post and files content received or declined` | Body leer oder abgelehnt | Body und Content-Type prüfen |
| 500 | 0 | `error while processing the request` | Interner Fehler | Zustand prüfen, dann gezielt nachziehen |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Zustand über `/transactions/assigned-receipts/get` prüfen |

Auffällig: `error_code` 10 hat hier die Bedeutung „zu viele Elemente", während dieselbe Nummer bei
`/transactions/unassign/receipt` „bestätigte Buchung blockiert" bedeutet und bei `/transactions/get` „invalid offset
specified". Fehlercodes sind ausschließlich endpunktlokal zu interpretieren.

Für Einzelfehler innerhalb des Arrays ist in der Spezifikation keine Codeliste angegeben. Plausibel ist dieselbe
Menge wie bei `/transactions/assign/receipt`, also 6 bis 9. **Annahme, nicht verifiziert.**

### 9.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/assign-batch/receipt" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "transactions_to_receipts": [
          { "transaction_id_by_customer": 12345, "receipt_id_by_customer": 67890 },
          { "transaction_id_by_customer": 12346, "receipt_id_by_customer": 67891 }
        ]
      }'
```

### 9.6 Fallstricke

- Der Feldname `transactions_to_receipts` ist lang und leicht falsch zu schreiben. Ein Tippfehler führt zu
  `error_code` 12, nicht zu einem sprechenden Fehler.
- Die Reihenfolge der Felder im Beispiel der Spezifikation ist `transaction_id_by_customer` vor
  `receipt_id_by_customer`, die Reihenfolge in der Definition umgekehrt. Für JSON irrelevant, aber ein Hinweis darauf,
  dass die Datei nicht durchgängig gepflegt ist.
- Anders als `/transactions/addBatch` nennt die Beschreibung hier **kein** Limit von einem Request alle 5 Sekunden.
  Ob eines gilt, ist **nicht verifiziert**.
- Auch hier gilt: HTTP 200 bedeutet nicht, dass alle Zuordnungen hergestellt wurden. `errors` muss ausgewertet werden.

---

## 10. `/transactions/assigned-receipts/get`

Liefert alle Belege, die einer bestimmten Transaktion zugeordnet sind.

**Einordnung: lesend.**

### 10.1 Parameter (3 von 3)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | **ja** | — | API-Key des zu verwaltenden Mandanten | Mandantenschlüssel | frei |
| `transaction_id_by_customer` | integer | **ja** | — | Kennung der Transaktion, deren Belege gesucht werden. Die Kennung stammt aus `/transactions/get`. | `id_by_customer` | integer |
| `confirmed_only` | boolean | nein | `false` | Wenn `true`, werden nur **bestätigte** Zuordnungen geliefert. | `true` oder `false` | boolean; in der Spezifikation ist der Default als String `"false"` notiert, der Typ aber als `boolean` |

### 10.2 Erfolgsantwort

Schema `TransactionsAssignedReceiptsGet_Success`. HTTP 200.

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | leer |
| `rows` | integer | Anzahl der gelieferten Belege |
| `data` | array | Liste der zugeordneten Belege |

Felder je Element in `data`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `id_by_customer` | string laut Spezifikation | Kennung des Belegs, nutzbar für `/receipts/get/id_by_customer` und `/transactions/unassign/receipt` |
| `filename` | string | Dateiname des Belegs |

Mehr liefert dieser Endpunkt nicht. Insbesondere keine Betragsangabe, kein Belegdatum und keine Information darüber,
ob die Zuordnung bestätigt ist. Letzteres lässt sich nur indirekt über zwei Aufrufe mit `confirmed_only` `false` und
`true` und einen Mengenvergleich ermitteln.

### 10.3 Fehlerfälle

| HTTP | error_code | message (Original) | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth ungültig | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid transaction_id_by_customer specified` | Kennung fehlt oder ist ungültig | Ganzzahlige Kennung aus `/transactions/get` senden |
| 400 | 6 | `no transaction found` | Transaktion existiert beim Mandanten nicht | Kennung prüfen |
| 400 | 7 | `invalid confirmed_only specified` | Wert ist kein Boolean | `true` oder `false` als JSON-Boolean senden, nicht als String |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Vertragsstatus klären |
| 500 | 0 | `error while processing the request` | Interner Fehler | Wiederholen |
| 504 | 30 | `a timeout occurred while processing the request` | Timeout | Wiederholen |

### 10.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/transactions/assigned-receipts/get" \
  -u "$BB_API_CLIENT:$BB_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY_DES_MANDANTEN>",
        "transaction_id_by_customer": 12345,
        "confirmed_only": false
      }'
```

### 10.5 Live-Verifikation

Aufruf am 2026-09-12 mit einer existierenden Transaktionskennung aus `/transactions/get` und ohne `confirmed_only`.
HTTP 200. Antwort (unverändert, enthält keine Geschäftsdaten):

```json
{"success":true,"message":"","rows":0,"data":[]}
```

Ergebnis: Der Endpunkt ist erreichbar und liefert den erwarteten Umschlag. Bei einer Transaktion ohne zugeordnete
Belege kommt `rows: 0` und ein leeres `data`-Array, kein Fehler. Die Feldstruktur eines gefüllten `data`-Elements
konnte mit dem erlaubten Requestbudget **nicht** verifiziert werden; die Angaben in Abschnitt 10.2 stammen allein aus
der Spezifikation. Ob `id_by_customer` hier wie bei `/transactions/get` als Zahl statt als String geliefert wird, ist
damit **nicht verifiziert**; angesichts des Befunds bei `/transactions/get` ist es wahrscheinlich.

### 10.6 Fallstricke

- `confirmed_only` ist ein echtes JSON-Boolean. Die Spezifikation notiert den Default irreführend als String
  `"false"`. Ein als String gesendetes `"false"` kann Fehler 7 auslösen. **Nicht verifiziert**, aber das
  risikoärmere Vorgehen ist, ein Boolean zu senden oder das Feld wegzulassen.
- Eine leere Ergebnisliste ist kein Fehler. Fehler 6 kommt nur, wenn die Transaktion selbst nicht existiert.
- Das Gegenstück aus Belegsicht ist `/receipts/assigned-transactions/get` mit den Feldern `receipt_id_by_customer`
  und `confirmed_only`. Es liefert pro Transaktion `id_by_customer`, `to_from`, `amount`, `booking_date`,
  `value_date`, `purpose`, also mehr Inhalt als die Belegrichtung hier.

---

## 11. Querschnittsthemen

### 11.1 Vorzeichenkonvention, Soll und Haben

Die API kennt **kein** Feld für Soll und Haben auf Transaktionsebene. Die einzige Richtungsinformation ist das
Vorzeichen von `amount`.

| Vorzeichen | Bedeutung auf dem Zahlungskonto | Typischer Fall |
| --- | --- | --- |
| positiv, z. B. `123.99` | Geldeingang, das Zahlungskonto wird erhöht | Kundenzahlung, Erstattung |
| negativ, z. B. `-123.99` | Geldausgang, das Zahlungskonto wird vermindert | Lieferantenzahlung, Lastschrift, Gebühr |

Quelle: Parameterbeschreibung von `amount` in `/transactions/add`: „positive for incoming and negative for outgoing
payments". Live bestätigt durch Beträge im Muster `-###.##` und `###.##` in der Antwort von `/transactions/get`.

Buchhalterisch ist das Zahlungskonto ein Aktivkonto: Ein positiver Betrag entspricht einer Sollbuchung auf dem
Bankkonto, ein negativer einer Habenbuchung. Diese Übersetzung findet in der API aber erst auf Buchungsebene statt.
Die Gegenkontierung und die Soll-/Haben-Logik gehören zu `/postings/*`, nicht zu `/transactions/*`. Die dortigen
`amounts` sind ein eigenes Feld mit eigener Semantik (`0000.00`) und werden in diesem Dossier nicht behandelt.

`0.00` ist als Transaktionsbetrag ausdrücklich unzulässig (Fehler 13).

### 11.2 Betragsformate

| Kontext | Typ | Beispiel |
| --- | --- | --- |
| `/transactions/add` und `addBatch`, Feld `amount` | JSON-Zahl, Format `float` | `123.99`, `-123.45` |
| Leseantworten, Feld `amount` | JSON-String mit Dezimalpunkt | `"123.99"`, `"-123.45"` |
| `/postings/add/transaction`, Feld `amounts` | Array, Format laut Beschreibung `0000.00` | `["12.87"]` |

Kein Tausendertrennzeichen, kein Komma als Dezimaltrenner, kein Währungssymbol im Betrag. Die Währung steht separat
im Feld `currency` und wird von `/transactions/get` nicht mitgeliefert.

### 11.3 Datums- und Zeitformate

| Feld | Endpunkt | Format | Bemerkung |
| --- | --- | --- | --- |
| `date_from`, `date_to` | `/transactions/get` | `YYYY-MM-DD` | inklusive Grenzen, Leerstring unzulässig |
| `date_since_last_modified` | `/transactions/get` | `YYYY-MM-DD HH:MM:SS` oder `YYYY-MM-DD` | bei reiner Datumsangabe ergänzt der Server `23:59:59`; filtert auf `date_updated` |
| `booking_date`, `value_date` | `/transactions/add`, `addBatch` | `YYYY-MM-DD HH:II:SS` | `II` ist PHP-Notation für Minuten, gemeint ist `HH:MM:SS` |
| `booking_date`, `value_date` | alle Leseantworten | `YYYY-MM-DD HH:MM:SS` | live bestätigt, enthält immer einen Uhrzeitanteil |

Zeitzone: In der Spezifikation nicht angegeben, in den Antworten kein Offset enthalten. **Nicht verifiziert.**
Naheliegend ist die Mandantenzeitzone bzw. Europe/Berlin, das ist aber eine Annahme.

### 11.4 Bezug zum Konto

- `/accounts/get` liefert pro Konto ein Objekt mit `name` und `postingaccount_number`. Laut Schema ist
  `postingaccount_number` ein **String** (Beispiel `"1200"`).
- `/transactions/add` und `/transactions/addBatch` erwarten dieselbe Nummer im Feld `account` als **Integer**.
- Der Filter `account` bei `/transactions/get` ist ebenfalls ein **Integer**.
- Das Antwortfeld `account` bei `/transactions/get/id_by_customer` ist als Integer deklariert, hat aber einen
  String-Beispielwert.

Ein Client muss diese Typen also aktiv konvertieren. Empfehlung: intern als String führen, beim Senden nach Integer
wandeln, beim Lesen beide Typen akzeptieren.

Fachlich muss das Konto beim Mandanten als **Zahlungskonto** eingerichtet sein, nicht nur als Sachkonto. Andernfalls
kommt Fehler 7 („account specified does not exist for the customer"). `/accounts/get` liefert genau diese
Zahlungskonten; Sachkonten insgesamt kommen über `/settings/get/postingaccounts`. Dass `/accounts/get` ausschließlich
Zahlungskonten liefert, ist aus der Beschreibung „Get all the accounts" nicht eindeutig ableitbar und
**nicht verifiziert**.

### 11.5 Die Zuordnung Beleg zu Transaktion in beide Richtungen

| Richtung | Endpunkt | Art | Liefert bzw. bewirkt |
| --- | --- | --- | --- |
| Transaktion → Belege lesen | `/transactions/assigned-receipts/get` | lesend | `id_by_customer`, `filename` je Beleg |
| Beleg → Transaktionen lesen | `/receipts/assigned-transactions/get` | lesend | `id_by_customer`, `to_from`, `amount`, `booking_date`, `value_date`, `purpose` je Transaktion |
| Zuordnung herstellen, einzeln | `/transactions/assign/receipt` | schreibend | eine Verknüpfung |
| Zuordnung herstellen, Batch | `/transactions/assign-batch/receipt` | schreibend | bis zu 50 Verknüpfungen |
| Zuordnung lösen, einzeln | `/transactions/unassign/receipt` | schreibend | eine Verknüpfung |
| Zuordnung lösen, Batch | existiert nicht | — | — |
| Zuordnung automatisch | `payment_reference` bei `/transactions/add` | schreibend | Server verknüpft selbst bei passender Referenz |

Die Beziehung ist mehrwertig: Einer Transaktion können mehrere Belege zugeordnet sein, und einem Beleg mehrere
Transaktionen (Teilzahlungen). Beide Leseendpunkte liefern Arrays. Ob es eine harte Obergrenze gibt, ist
**nicht verifiziert**.

Beide Leseendpunkte kennen den Schalter `confirmed_only`. „Bestätigt" bezieht sich auf die Buchung, nicht auf die
Zuordnung selbst: `/postings/unconfirm/transaction` und `/postings/unconfirm/receipt` heben eine Bestätigung wieder
auf, und eine bestätigte Buchung blockiert das Lösen der Zuordnung (Fehler 10 bei `/transactions/unassign/receipt`).

### 11.6 Sammelliste der Spezifikationsmängel

Alle Punkte stammen aus der Datei `docs/openapi/buchhaltungsbutler-v1.json`, Stand 2026-09-12.

| # | Ort | Mangel | Auswirkung |
| --- | --- | --- | --- |
| 1 | gesamte Datei | Body-Felder stehen als einzelne `in: body`-Parameter mit eigenem `type` statt in einem `schema` | Codegeneratoren erzeugen falsche Clients |
| 2 | `/transactions/get/id_by_customer` | Pflichtfeld `id_by_customer` fehlt in der Parameterliste, obwohl Fehler 5 und 6 darauf verweisen | Generierter Client ist unbrauchbar |
| 3 | `/transactions/get/id_by_customer` | Endpunkt antwortet live mit HTTP 404 und HTML | Funktion ist nicht nutzbar |
| 4 | `TransactionsGetIdByCustomer_Success` | `data` als `object` deklariert, Beschreibung sagt „array"; kein `rows`-Feld | Uneinheitliches Parsen |
| 5 | `TransactionsGetIdByCustomer_Success.account` | Typ `integer`, Beispielwert String `"1200"` | Typunsicherheit |
| 6 | `TransactionsGet_Success.data[].id_by_customer` | Typ `string`, live jedoch JSON-Zahl | Laufzeitfehler bei striktem Parsen |
| 7 | `TransactionsAdd_ErrorCode24` | `error_code` ist mit 23 belegt, obwohl der Response-Schlüssel `400 (24)` lautet | Fehlerbehandlung verwechselt zwei Fälle |
| 8 | `/transactions/assign/receipt`, Response `400 (7)` | `$ref` zeigt auf `PostingsAssignReceiptToFreePosting_ErrorCode7` mit der Meldung `posting not found` statt auf `TransactionsAssignReceipt_ErrorCode7` | Falsche erwartete Meldung |
| 9 | `/transactions/add` vs. Definition `Transaction` | Währungslisten unterscheiden sich um **RSD** | Unklar, ob RSD zulässig ist |
| 10 | `/transactions/assign-batch/receipt` | IDs im Request `integer`, in der Erfolgsantwort `string` | Typkonvertierung nötig |
| 11 | `/transactions/assigned-receipts/get` | `confirmed_only` als `boolean` mit Default-String `"false"` | Unklare Serialisierung |
| 12 | `/transactions/assign/receipt` | Fehler 5 „invalid assignment type specified" ohne zugehörigen Parameter | Nicht auslösbar oder undokumentierter Parameter |
| 13 | alle Endpunkte | Response-Schlüssel im Format `"400 (5)"` sind kein gültiges Swagger | Validatoren und Generatoren scheitern |
| 14 | `definitions` | Einelementige `enum`-Listen tragen Beispielwerte, keine Wertemengen | Generatoren erzeugen falsche Aufzählungstypen |
| 15 | `/transactions/add` | Fehlercode 12 fehlt in der ansonsten lückenlosen Nummernfolge | Nur kosmetisch |
| 16 | `securityDefinitions`, `consumes`, `tags` | sind `null` | Auth und Content-Type sind nicht maschinenlesbar beschrieben |

---

## 12. Hinweise für das MCP-Tool-Design

### 12.1 Fachliche Gruppen

Aus Agentensicht zerfallen die Transaktions-Endpunkte in drei Gruppen:

1. **Lesen und Suchen:** `/transactions/get`, ersatzweise auch für den Einzelabruf, da
   `/transactions/get/id_by_customer` live nicht erreichbar ist.
2. **Anlegen:** `/transactions/add`, `/transactions/addBatch`. Beide sind schreibend und sollten im MCP-Server hinter
   einer ausdrücklichen Bestätigung oder einem Schreibmodus liegen.
3. **Verknüpfen:** `/transactions/assign/receipt`, `/transactions/assign-batch/receipt`,
   `/transactions/unassign/receipt` zum Schreiben, `/transactions/assigned-receipts/get` und das Gegenstück
   `/receipts/assigned-transactions/get` zum Lesen.

Ein sinnvoller Zuschnitt ist ein Tool pro Endpunkt, weil die Fehlerbilder zu unterschiedlich sind, um sie in einem
generischen Tool sauber zu melden. Die Batch-Varianten sollten eigene Tools bleiben, damit ihre Teilerfolgssemantik
sichtbar ist.

### 12.2 Mehrstufige Abläufe

| Ziel | Nötige Schritte |
| --- | --- |
| Beleg an Transaktion hängen | 1. Transaktion über `/transactions/get` finden und `id_by_customer` merken. 2. Beleg über `/receipts/get` finden. 3. `/transactions/assign/receipt`. 4. Ergebnis über `/transactions/assigned-receipts/get` prüfen, da der Assign-Endpunkt nur `success` liefert. |
| Transaktion anlegen | 1. `/accounts/get` aufrufen, um eine gültige `postingaccount_number` zu bekommen. 2. `/transactions/add`. 3. Rückgabefeld `id_by_customer` sichern; es steht auf oberster Ebene, nicht in `data`. |
| Einzelne Transaktion lesen | Wegen des 404 bei `/transactions/get/id_by_customer`: `/transactions/get` mit `id_by_customer_from = id - 1` und `id_by_customer_to = id + 1`, weil beide Grenzen exklusiv sind. Liefert nur die sechs Listenfelder. **Nicht live verifiziert.** |
| Zuordnung lösen | 1. `/transactions/assigned-receipts/get`, um zu sehen, ob überhaupt etwas zugeordnet ist (sonst Fehler 23). 2. `/transactions/unassign/receipt`. 3. Bei Fehler 10 zuerst die Buchung über `/postings/unconfirm/transaction` oder `/postings/cancel` behandeln. |
| Inkrementelle Synchronisation | `/transactions/get` mit `date_since_last_modified` und `limit` 500, dann über `offset` blättern; alternativ mit `id_by_customer_from` vorrücken, was zugleich aufsteigend sortiert. |
| Kontieren | Erst Transaktion, dann Belegzuordnung, dann `/postings/add/transaction`. Die Buchung selbst ist nicht Teil dieses Dossiers. |

### 12.3 Parameter, die ein Agent schlecht erraten kann

Diese Felder brauchen ausführliche `description`-Texte im Tool-Schema, weil ein Sprachmodell sie sonst falsch füllt.

| Parameter | Warum problematisch | Was in die Beschreibung gehört |
| --- | --- | --- |
| `api_key` | Wird leicht mit dem API Secret oder einem Passwort verwechselt | „Wählt den Mandanten aus. Nicht das API Secret. Wird vom Server aus der Konfiguration gesetzt." Am besten gar nicht ins Tool-Schema aufnehmen, sondern serverseitig einsetzen. |
| `account` | Klingt nach Bankkonto der Gegenseite, ist aber die eigene Sachkontonummer des Zahlungskontos | „Kontonummer des eigenen Zahlungskontos, z. B. 1200. Wert aus dem Tool für `/accounts/get`. Nicht die IBAN der Gegenseite." |
| `account_number` | Direkte Verwechslungsgefahr mit `account` | „IBAN oder Kontonummer des Zahlungspartners, nicht des eigenen Kontos." |
| `amount` | Vorzeichen entscheidet über die Richtung; es gibt kein Richtungsfeld | „Negativ bei Zahlungsausgang, positiv bei Zahlungseingang. 0 ist unzulässig. Dezimalpunkt, keine Tausendertrennzeichen." |
| `booking_date` vs. `date_from` | Unterschiedliche Formate im selben Themenbereich | Jeweils das exakte Format mit Beispiel nennen und darauf hinweisen, dass es beim Anlegen mit, beim Filtern ohne Uhrzeit ist. |
| `id_by_customer_from` / `_to` | Exklusive Grenzen und Nebenwirkung auf die Sortierung | „Die Transaktion mit genau diesem Wert wird nicht geliefert. Sobald eines der beiden Felder gesetzt ist, sortiert der Server aufsteigend nach `id_by_customer`." |
| `date_since_last_modified` | Filtert auf `date_updated`, nicht auf das Buchungsdatum | „Für inkrementelle Abgleiche. Bezieht sich auf die letzte Änderung des Datensatzes, nicht auf das Buchungsdatum." |
| `payment_reference` | Hat eine Nebenwirkung, die im Feldnamen nicht steckt | „Bei korrektem Wert verknüpft der Server die neue Transaktion automatisch mit dem passenden Beleg." |
| `confirmed_only` | Bezieht sich auf die Buchung, nicht auf die Zuordnung | „Nur bestätigte Zuordnungen, also solche mit bestätigter Buchung." |
| `type` | Keine dokumentierte Werteliste, aber Validierung | „Freitext, z. B. `direct debit`. Wird serverseitig validiert; im Zweifel weglassen." |
| `currency` | Geschlossene, aber lange Liste; zwei widersprüchliche Listen in der Spezifikation | Liste in die Beschreibung aufnehmen oder als Enum im Schema führen; RSD als unsicher kennzeichnen. |
| optionale Stringfelder allgemein | Leerstring ist bei den meisten ungültig | „Feld weglassen, wenn kein Wert vorliegt. Ein Leerstring löst einen Validierungsfehler aus. Ausnahmen: `purpose` und `booking_text`." |
| `transactions_to_receipts` | Langer Name, verschachtelte Struktur | Vollständiges Beispiel in die Beschreibung. |

### 12.4 Technische Empfehlungen für den MCP-Server

- **Typen defensiv lesen.** `id_by_customer` kann Zahl oder String sein. Intern auf einen Typ normalisieren, nach
  außen konsistent ausgeben.
- **Antwort nicht blind als JSON parsen.** `/transactions/get/id_by_customer` liefert HTML. Erst Status und
  `Content-Type` prüfen, sonst einen sprechenden Fehler erzeugen.
- **Fehlercodes endpunktlokal mappen.** 10 und 23 haben je nach Endpunkt unterschiedliche Bedeutungen.
- **Schreibende Tools klar kennzeichnen.** In Namen und Beschreibung, damit ein Agent sie nicht für Recherchen
  aufruft. Kandidaten für einen Read-only-Modus: alles unter `/transactions/add*`, `/transactions/assign*`,
  `/transactions/unassign*`.
- **Keine automatischen Wiederholungen bei `error_code` 30 auf schreibenden Endpunkten.** Es gibt keinen
  Idempotenzschlüssel; ein Retry kann Dubletten erzeugen. Erst den Zustand lesen.
- **Rate Limit selbst zählen.** Die Antworten enthalten keine Rate-Limit-Header. Zusätzlich die Fünf-Sekunden-Regel
  für `/transactions/addBatch` durchsetzen.
- **Paging kapseln.** `limit` ist auf 500 gedeckelt. Ein Tool, das „alle Transaktionen eines Zeitraums" verspricht,
  muss intern blättern und die Gesamtzahl transparent machen.
- **Teilerfolge sichtbar machen.** Bei beiden Batch-Endpunkten Erfolg und `errors` getrennt an den Agenten
  zurückgeben, nie zu einem einzigen Wahrheitswert verdichten.
