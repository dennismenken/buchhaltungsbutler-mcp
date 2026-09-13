# Belege (Receipts)

Nachschlagewerk für die Beleg-Endpunkte der BuchhaltungsButler-API (Tag `Receipts`).
Zielgruppe sind Implementierungs-Agenten, die daraus MCP-Tools bauen.

**Quellen und Abrufdatum**

| Quelle | Art | Abrufdatum |
| --- | --- | --- |
| `docs/openapi/buchhaltungsbutler-v1.json` (Swagger 2.0, `info.version` = 1.9.1, heruntergeladen von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`) | Spezifikation | 2026-09-12 |
| Live-Aufrufe gegen `https://webapp.buchhaltungsbutler.de/api/v1` mit echten Zugangsdaten des Nutzers (nur lesende Endpunkte) | Eigener Test | 2026-09-12 |
| `docs/api/grundlagen.md`, Abschnitte 1.2, 2 und 4 — dort stehen die Rahmenangaben Basis-URL, Authentifizierung und Antwortumschlag mit ihrer jeweils eigenen Quellenkennzeichnung | Querschnittsdossier dieses Repositoriums | 2026-09-12 |
| Eigene lesende Nachmessung eben dieser Rahmenangaben, Protokoll in `docs/api/grundlagen.md`, Abschnitt 2.5 | Eigener Test | 2026-09-13 |
| `docs/api/grundlagen.md`, Abschnitt 3.1 — das globale Rate Limit, wörtlich zitiert aus der Anbieterdokumentation und **nicht selbst gemessen** | Fremdangabe | 2026-09-12 |

**Wichtige Lesehilfe zur Spezifikation**

Die Datei ist kein valides Swagger 2.0. Body-Parameter stehen als einzelne Einträge mit
`"in": "body"` und eigenem `type`, statt gebündelt in einem gemeinsamen `schema`-Objekt.
Fachlich sind alle diese Einträge Felder **eines** JSON-Bodys. Generatoren dürfen darauf
nicht blind angesetzt werden.

In den `definitions` stehen Beispielwerte als `enum` mit genau einem Eintrag
(zum Beispiel `"amount": {"type": "string", "enum": ["123.99"]}`). Das sind **Beispiele,
keine erlaubten Wertemengen**. Einzige Ausnahmen in diesem Dokument sind ausdrücklich als
echte Wertemengen gekennzeichnete Felder (`e_invoice_type`, `file_type`).

---

## 1. Grundlagen für alle Beleg-Endpunkte

Woher die Angaben dieser Tabelle stammen: Basis-URL, HTTP-Methode, Content-Type
`application/json`, Authentifizierung, Mandantenauswahl und Antwortumschlag sind eigene
lesende Messungen — am 2026-09-12 und
erneut am **2026-09-13**; das Protokoll der Nachmessung mit Aufrufform, HTTP-Status und
wörtlichem Antwortkörper steht in `docs/api/grundlagen.md`, Abschnitt 2.5. Die drei Rate
Limits sind **nicht selbst gemessen**: Das globale Limit ist eine wörtlich zitierte Angabe
der Anbieterdokumentation (`docs/api/grundlagen.md`, Abschnitt 3.1), die beiden
endpunktbezogenen stehen als `description` in der Spezifikationsdatei.

| Aspekt | Wert |
| --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` |
| HTTP-Methode | immer `POST`, auch für lesende Abfragen |
| Content-Type | `application/json` (formularkodiert wird ebenfalls angenommen, siehe Abschnitt 4.5) |
| Authentifizierung | HTTP Basic Auth, Benutzername = API Client, Passwort = API Secret |
| Mandantenauswahl | Pflichtfeld `api_key` im JSON-Body, nicht im Header |
| Rate Limit global | maximal 100 Requests pro Mandant und Minute (Doku) |
| Rate Limit `/receipts/upload` | maximal 10 Requests pro Minute (Spezifikation, `description`) |
| Rate Limit `/receipts/addBatch` | maximal ein Request alle 5 Sekunden (Spezifikation, `description`) |

Antwortumschlag bei Erfolg (lesende Listen-Endpunkte):

```json
{"success": true, "message": "", "rows": 2, "data": [ ... ]}
```

Antwortumschlag bei Fehler:

```json
{"success": false, "error_code": 5, "message": "invalid id_by_customer specified"}
```

Der HTTP-Status trägt dieselbe Information wie `error_code`, ist aber gröber. Die
Spezifikation kodiert das Paar im Schlüssel der `responses`, zum Beispiel `"400 (5)"` für
HTTP 400 mit `error_code` 5. `error_code` ist innerhalb eines Endpunkts eindeutig, **über
Endpunkte hinweg aber nicht**: `error_code` 5 bedeutet bei `/receipts/get`
"invalid list_direction specified", bei `/receipts/upload` "no file provided" und bei
`/receipts/delete/id_by_customer` "invalid id_by_customer specified". Fehlerbehandlung muss
deshalb immer das Paar (Endpunkt, error_code) auswerten, niemals `error_code` allein.

Zwei Fehler gelten für jeden Endpunkt und stehen nicht in den einzelnen Listen:
`Request_ErrorCode1` ("Api method calls require HTTP requests") und `Request_ErrorCode2`
("Api method calls require POST requests").

### Datums-, Betrags- und Boolean-Konventionen

| Thema | Konvention |
| --- | --- |
| Datum | `YYYY-MM-DD`, zum Beispiel `2017-04-26`. Leerstring ist kein gültiges Datum. |
| Datum mit Zeit | nur bei `date_since_last_modified`: `YYYY-MM-DD HH:MM:SS`. Ohne Zeitanteil wird `23:59:59` ergänzt. |
| Beträge im Request | JSON-Zahl mit Dezimalpunkt (`type: number`, `format: float`), zum Beispiel `123.99` oder `-12.30`. `0.00` ist ungültig. |
| Beträge in der Antwort | **String** mit Dezimalpunkt und zwei Nachkommastellen, zum Beispiel `"123.45"` (anonymisiert). Live bestätigt. |
| Vorzeichen | Negative Beträge kennzeichnen eine Rückabwicklung beziehungsweise Stornierung ("reversed payment"). Transaktionsbeträge tragen das Vorzeichen der Geldbewegung (Ausgang negativ), Belegbeträge sind in der Regel positiv. Live bestätigt (Beispielwerte anonymisiert): Beleg `amount` = `"100.00"`, zugeordnete Transaktion `amount` = `"-600.00"`. |
| Boolean | In der Spezifikation `type: boolean` mit `default: "false"` (String-Schreibweise des Defaults, vermutlich ein Artefakt des Doku-Generators). In Antworten kommen Flags als String `"0"` oder `"1"` zurück (`deleted`). |

---

## 2. Identifikatoren und Kernbegriffe

### 2.1 `id_by_customer`

`id_by_customer` ist die **mandantenweit fortlaufende Nummer eines Belegs**. Sie ist der
einzige stabile Handle, mit dem Belege in allen anderen Aufrufen adressiert werden.
Eigenschaften:

- Sie ist **pro Mandant** vergeben, nicht global. Derselbe Wert existiert in einem anderen
  Mandanten für einen anderen Beleg. Ein MCP-Tool darf `id_by_customer` niemals ohne den
  zugehörigen Mandanten (`api_key`) zwischenspeichern.
- Sie ist **je Objekttyp** vergeben. Beleg 2 und Transaktion 2 haben nichts miteinander zu
  tun. Deshalb heißen die Parameter in Zuordnungsendpunkten explizit
  `receipt_id_by_customer` und `transaction_id_by_customer`.
- Typinkonsistenz: In Antworten von `/receipts/get` kommt sie als **String** (Beispiel `"7"`, anonymisiert), in
  Antworten von `/receipts/assigned-transactions/get` als **Zahl** (live bestätigt, Beispiel `900`, anonymisiert).
  In Requests wird sie als `integer` deklariert. Clients sollten beim Lesen beide Typen
  akzeptieren und beim Schreiben eine Zahl senden.
- Bezugsquelle: `/receipts/get`. Die Spezifikation weist ausdrücklich darauf hin, dass man
  `id_by_customer` zuerst über `/receipts/get` ermitteln soll.

### 2.2 `filename`

`filename` ist der **interne Dateiname ohne Endung**, unter dem BuchhaltungsButler den
Beleg ablegt. `/receipts/upload` gibt ihn zurück. Er ist beschreibend, aber **kein
Adressierungsschlüssel**: kein dokumentierter Endpunkt nimmt `filename` als Eingabe
entgegen. Live-Beispiel (anonymisiert):
`2020-01-02_Ausgabebeleg(Entwurf)_RE-00-00000_0000000000000000000000000000`.
Der Name enthält Datum, Belegbezeichnung, Rechnungsnummer und einen Hash-Anteil.
Für `/receipts/add` (ohne Datei) liefert die Antwort **kein** `filename`, für
`/receipts/upload` schon.

### 2.3 `list_direction` gegenüber `type`

Zwei verwandte, aber nicht identische Konzepte:

| Feld | Wo | Erlaubte Werte laut Spezifikation | Bedeutung |
| --- | --- | --- | --- |
| `list_direction` | Filter in `/receipts/get` (Pflicht) | `inbound`, `outbound` | Eingangsbelege beziehungsweise Ausgangsbelege. Reine Richtung. |
| `type` | Pflichtfeld beim Anlegen (`/receipts/add`, `/receipts/addBatch`, `/receipts/upload`) und Rückgabefeld | `invoice inbound`, `invoice outbound`, `credit inbound`, `credit outbound` | Belegart plus Richtung. |

Die Werte enthalten ein **Leerzeichen** und sind kleingeschrieben. Die deutschen
Entsprechungen laut Spezifikation: `invoice inbound` = Eingangsrechnung,
`invoice outbound` = Ausgangsrechnung, `credit inbound` = Eingangsgutschrift § 14 UStG,
`credit outbound` = Ausgangsgutschrift § 14 UStG.

Die Zuordnung `type` zu `list_direction` ist nicht in der Spezifikation ausformuliert.
Plausibel und mit dem Live-Test vereinbar (`list_direction=inbound` lieferte ausschließlich
Belege mit `type = "invoice inbound"`), aber **nicht vollständig verifiziert**: Es ist nicht
getestet, ob `credit inbound` unter `list_direction=inbound` oder unter `outbound` fällt.
Fachlich ist eine Eingangsgutschrift eine vom Leistungsempfänger ausgestellte Abrechnung,
die Zuordnung kann deshalb abweichen. Vor einer Zusicherung im Tool-Text testen.

Es gibt keinen dokumentierten Filter nach `type` in `/receipts/get`. Wer nur Gutschriften
sucht, muss die Richtung filtern und anschließend clientseitig nach `type` einschränken.

### 2.4 `e_invoice_type` und `file_type`

Nur in der Antwort von `/receipts/get/id_by_customer`. Hier sind die `enum`-Werte als echte
Wertemengen zu lesen, weil sie mehr als einen Eintrag enthalten:

| Feld | Werte | Bedeutung |
| --- | --- | --- |
| `e_invoice_type` | `"0"`, `"1"`, `"2"` | 0 = normale PDF-Datei, 1 = ZUGFeRD-PDF, 2 = XRechnung-XML |
| `file_type` | `pdf`, `xml` | Dateityp des über `get_file` mitgelieferten Inhalts |

---

## 3. `/receipts/get`

Listet Belege eines Mandanten mit Filter, Sortierung und Paging.

**Einordnung: lesend.** Verändert nichts. Steht auf der Live-Test-Whitelist und wurde
verifiziert.

### 3.1 Parameter (14 Felder, geprüft gegen `jq '.paths["/receipts/get"].post.parameters | length'` = 14)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des zu verwaltenden Mandanten. Wählt den Mandanten aus. | Mandanten-spezifischer Schlüssel | – |
| `list_direction` | string | ja | – | Belegrichtung. `inbound` = Eingangsbelege, `outbound` = Ausgangsbelege. | `inbound`, `outbound` | kleingeschrieben |
| `payment_status` | string | nein | – | Zahlungsstatus-Filter. `paid` = bezahlt, `unpaid` = unbezahlt. Wird validiert, wenn gesetzt. | `paid`, `unpaid` | kleingeschrieben |
| `counterparty` | string | nein | – | Geschäftspartner des Belegs, also Rechnungssteller bei `inbound` beziehungsweise Empfänger bei `outbound`. Wird validiert, wenn gesetzt. | Freitext, Beispiel `Peter Maier` | ob Teiltreffer oder exakter Treffer gesucht wird, ist **nicht dokumentiert und nicht verifiziert** |
| `date_from` | string | nein | – | Belegdatum (Ausstellungsdatum) untere Grenze, einschließlich. | gültiges Datum, Leerstring ist ungültig | `YYYY-MM-DD` |
| `date_to` | string | nein | – | Belegdatum obere Grenze, einschließlich. | gültiges Datum, Leerstring ist ungültig | `YYYY-MM-DD` |
| `limit` | integer | nein | `500` | Maximale Zeilenzahl der Antwort. | 1 bis 500, Maximum 500 | ganze Zahl |
| `offset` | integer | nein | `0` | Versatz für Paging. | ab 0 | ganze Zahl |
| `order` | object | nein | – | Sortierung als Objekt aus Feldname zu Richtung. Mehrere Schlüssel sind zulässig, die Reihenfolge im Objekt bestimmt die Sortierpriorität. | Schlüssel: `date`, `amount`, `invoicenumber` (entspricht `invoice_number`), `invoicingparty` (entspricht `counterparty`). Werte: `ASC`, `DESC` (Großschreibung). | JSON-Objekt, Beispiel `{"date": "ASC", "amount": "DESC"}` |
| `include_offers` | boolean | nein | `false` | Wenn `true`, werden auch Angebote mit ausgegeben. | `true`, `false` | – |
| `deleted` | boolean | nein | `false` | Wenn `true`, werden **ausschließlich** gelöschte Belege zurückgegeben, nicht zusätzlich. | `true`, `false` | – |
| `invoicenumber` | string | nein | – | Rechnungsnummer. Wenn gesetzt, werden Belege mit derselben Rechnungsnummer geliefert. | Freitext, maximal 60 Zeichen (analog `invoice_number` beim Anlegen) | – |
| `due_date` | string | nein | – | Fälligkeitsdatum. Es werden Belege mit **genau diesem** Fälligkeitsdatum geliefert, kein Bereich. | gültiges Datum, Leerstring ist ungültig | `YYYY-MM-DD` |
| `date_since_last_modified` | string | nein | – | Liefert alle Belege, deren `date_updated` **nach** dem angegebenen Zeitpunkt liegt. Ohne Zeitanteil wird `23:59:59` ergänzt. Der Schlüssel für inkrementelle Synchronisation. | gültiger Zeitstempel, Leerstring ist ungültig | `YYYY-MM-DD HH:MM:SS` oder `YYYY-MM-DD` |

Das Objekt `order` ist der einzige verschachtelte Parameter dieses Endpunkts. Die
Spezifikation modelliert ihn irreführend als
`{"type": "object", "properties": {"field": {"type": "string", "enum": ["ASC","DESC"]}}, "required": ["field"]}`.
Der Schlüssel heißt in Wahrheit nicht `field`, sondern trägt den Namen des Sortierfelds.
Maßgeblich ist die Textbeschreibung mit den Beispielen `{"date": "ASC"}` und
`{"date": "ASC", "amount": "DESC"}`.

### 3.2 Erfolgsantwort

Umschlag: `success`, `message` (leer), `rows` (Anzahl gelieferter Zeilen), `data` (Array).

Felder je Element in `data` laut Spezifikation (`ReceiptsGet_Success`):

| Feld | Typ laut Spezifikation | Bedeutung |
| --- | --- | --- |
| `filename` | string | Interner Dateiname ohne Endung |
| `id_by_customer` | string | Mandantenweite Belegnummer, Handle für alle Folgeaufrufe |
| `type` | string | Belegart, zum Beispiel `invoice inbound` |
| `date` | string | Belegdatum (Ausstellungsdatum) |
| `date_delivery` | string | Leistungs- beziehungsweise Lieferdatum. **Heißt live `delivery_date`, siehe Abschnitt 3.5.** |
| `date_uploaded` | string | Datum des Imports in BuchhaltungsButler |
| `counterparty` | string | Geschäftspartner |
| `invoicenumber` | string | Rechnungsnummer |
| `amount` | string | Belegbetrag, Dezimalpunkt |
| `payment_date` | string | Zahlungsdatum |
| `due_date` | string | Fälligkeitsdatum |
| `account` | string | Zahlungskonto (Sachkontonummer, Beispiel `1200`) |
| `link_to_receipt_id_by_customer` | string | `id_by_customer` eines verknüpften Belegs, sonst `null` |
| `deleted` | string | `"0"` = aktiv, `"1"` = als gelöscht markiert |

Zusätzlich live vorhanden, **in der Spezifikation nicht dokumentiert**:

| Feld | Live beobachteter Typ | Bedeutung (Annahme, nicht durch Doku belegt) |
| --- | --- | --- |
| `delivery_date` | string oder `null` | Leistungsdatum. Ersetzt offenbar das dokumentierte `date_delivery`. |
| `amount_paid` | string | Bereits zugeordneter beziehungsweise bezahlter Betrag |
| `amount_paid_fixed` | string | Bereits durch festgeschriebene Buchungen gebundener Betrag |

### 3.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen, Request unverändert lassen, bei Dauerfehler Support |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Daten falsch | API Client und API Secret prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder Client nicht berechtigt | `api_key` prüfen, Mandantenfreigabe prüfen |
| 400 | 5 | `invalid list_direction specified` | `list_direction` fehlt oder ist nicht `inbound`/`outbound` | Wert korrigieren |
| 400 | 6 | `invalid payment_status specified` | `payment_status` ist nicht `paid`/`unpaid` | Wert korrigieren oder Feld weglassen |
| 400 | 7 | `invalid date_from specified` | `date_from` kein gültiges Datum | Format `YYYY-MM-DD`, kein Leerstring |
| 400 | 8 | `invalid date_to specified` | `date_to` kein gültiges Datum | Format `YYYY-MM-DD`, kein Leerstring |
| 400 | 9 | `invalid counterparty specified` | `counterparty` ungültig, zum Beispiel Leerstring | Feld weglassen oder nichtleeren Wert setzen |
| 400 | 10 | `invalid limit specified` | `limit` keine gültige Zahl oder über 500 | Wert zwischen 1 und 500 |
| 403 | 11 | `customer has no active status` | Mandant inaktiv oder gesperrt | Nicht technisch lösbar, Mandantenstatus im Portal klären |
| 400 | 12 | `invalid offset specified` | `offset` keine gültige Zahl | Ganze Zahl ab 0 |
| 400 | 13 | `invalid include_offers specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 400 | 14 | `invalid deleted specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 400 | 15 | `invalid sort field specified` | Sortierschlüssel nicht erlaubt | Nur `date`, `amount`, `invoicenumber`, `invoicingparty` |
| 400 | 16 | `invalid sort value specified` | Sortierrichtung nicht erlaubt | Nur `ASC` oder `DESC` |
| 400 | 17 | `invalid invoicenumber specified` | Rechnungsnummer ungültig | Wert prüfen oder Feld weglassen |
| 400 | 18 | `invalid due_date specified` | `due_date` kein gültiges Datum | Format `YYYY-MM-DD` |
| 400 | 19 | `invalid date_since_last_modified specified` | Zeitstempel ungültig | Format `YYYY-MM-DD HH:MM:SS` oder `YYYY-MM-DD` |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | `limit` senken, Zeitraum einengen, erneut versuchen |

### 3.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/get" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "list_direction": "inbound",
        "date_from": "2024-01-01",
        "date_to": "2024-12-31",
        "limit": 100,
        "offset": 0,
        "order": {"date": "DESC"}
      }'
```

### 3.5 Live-Verifikation

Aufruf am 2026-09-12 mit `list_direction=inbound` und `limit=2`, HTTP 200. Antwort
**anonymisiert**, Beträge, Namen, Nummern und IDs ersetzt:

```json
{
  "success": true,
  "message": "",
  "rows": 2,
  "data": [
    {
      "filename": "2020-01-02_Ausgabebeleg(Entwurf)_RE-00-00000_0000000000000000000000000000",
      "id_by_customer": "7",
      "type": "invoice inbound",
      "date": "2020-01-02",
      "delivery_date": null,
      "date_uploaded": "2021-05-05",
      "counterparty": "Beispiel GmbH",
      "invoicenumber": "RE-00-00000",
      "amount": "100.00",
      "payment_date": "2020-01-02",
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

Abweichungen zur Spezifikation:

1. Das Feld heißt live **`delivery_date`**, die Spezifikation nennt es `date_delivery`.
   Im Request heißt es dagegen `date_delivery`. Wer aus der Antwort liest, muss
   `delivery_date` verwenden; ein Mapping in beide Richtungen ist nötig.
2. Live existieren die undokumentierten Felder **`amount_paid`** und
   **`amount_paid_fixed`**.
3. Optionale Felder kommen als **`null`** zurück, nicht als Leerstring. Die Spezifikation
   deklariert alle Felder als `string`. Clients müssen `null` verkraften.
4. Die Feldreihenfolge weicht von der Spezifikation ab. Ohne Bedeutung, aber ein Hinweis
   darauf, dass die Spezifikation handgepflegt ist.

---

## 4. `/receipts/get/id_by_customer`

Liefert einen einzelnen Beleg samt Detailfeldern, auf Wunsch mit der Belegdatei als
Base64-String.

**Einordnung: lesend.** Steht auf der Live-Test-Whitelist, wurde getestet, konnte aber
**nicht erfolgreich aufgerufen werden** (siehe 4.5).

### 4.1 Parameter (2 Felder laut `jq '... | length'` = 2; die Spezifikation ist hier unvollständig)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |
| `get_file` | boolean | nein | `false` | Wenn `true`, wird die Belegdatei als Base64-String mitgeliefert. Welcher Dateityp kommt, hängt von `e_invoice_type` ab: 0 = Standard-PDF, 1 = ZUGFeRD-PDF, 2 = XRechnung-XML. | `true`, `false` | – |

**Fehlender Pflichtparameter.** Die Parameterliste enthält kein Feld für die Beleg-ID,
obwohl der Endpunkt genau danach auflöst, die `description` ausdrücklich auf
`id_by_customer` verweist und `error_code` 5 `invalid id_by_customer specified` lautet.
Das ist ein Dokumentationsfehler der Spezifikation. Er tritt systematisch bei allen vier
Endpunkten mit `id_by_customer` im Pfad auf (`/receipts/get/id_by_customer`,
`/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer`,
`/transactions/get/id_by_customer`). Der korrekte Feldname ist **nicht verifiziert**,
siehe 4.5.

### 4.2 Erfolgsantwort

Umschlag: `success`, `message`, `data`. Anders als bei `/receipts/get` ist `data` hier ein
**Objekt**, kein Array, und es gibt **kein** `rows`. Die Feldbeschreibung in der
Spezifikation lautet trotzdem "An array of receipt data" – ein Widerspruch innerhalb der
Spezifikation, der nicht aufgelöst werden konnte.

Felder in `data` (`ReceiptsGetIdByCustomer_Success`), deutlich reicher als bei
`/receipts/get`:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `filename` | string | Interner Dateiname ohne Endung |
| `id_by_customer` | string | Mandantenweite Belegnummer |
| `date` | string | Belegdatum |
| `counterparty` | string | Geschäftspartner |
| `invoicenumber` | string | Rechnungsnummer |
| `amount` | string | Betrag in Buchungswährung (in der Regel EUR) |
| `amount_original` | string | Betrag in Originalwährung |
| `currency` | string | Buchungswährung, Beispiel `EUR` |
| `currency_original` | string | Originalwährung des Belegs |
| `exchangerate` | string | Umrechnungskurs, Beispiel `0.1234` |
| `vat` | string | Umsatzsteuersatz, Beispiel `19.00`. Heißt im Request `vat_rate`. |
| `payment_date` | string | Zahlungsdatum |
| `account` | string | Zahlungskonto |
| `type` | string | Belegart, zum Beispiel `invoice inbound` |
| `e_invoice_type` | string | `0` = PDF, `1` = ZUGFeRD-PDF, `2` = XRechnung-XML. Echte Wertemenge. |
| `list_direction` | string | `inbound` oder `outbound` |
| `payment_reference` | string | Zahlungsreferenz, Beispiel `1a2B3c4D5e6F-12345` |
| `file_content` | string | Die Datei als Base64-String. Nur befüllt, wenn `get_file` gesetzt war (Annahme, nicht verifiziert). |
| `file_type` | string | `pdf` oder `xml`. Echte Wertemenge. |
| `date_delivery` | string | Leistungs- beziehungsweise Lieferdatum |
| `date_payment_due` | string | Fälligkeitsdatum. Heißt bei `/receipts/get` in der Antwort `due_date`. |
| `link_to_receipt_id_by_customer` | string | Verknüpfter Beleg |
| `deleted` | string | `"0"` oder `"1"` |

Dieser Endpunkt ist die einzige dokumentierte Quelle für Währungsumrechnung
(`amount_original`, `currency_original`, `exchangerate`), für `e_invoice_type` und für den
Dateiinhalt. `/postings/add/receipt` verweist ausdrücklich darauf: Bei Fremdwährungsbelegen
muss der umgerechnete Betrag vorher hier geholt werden.

### 4.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid id_by_customer specified` | Beleg-ID fehlt, hat falsches Format oder existiert nicht | Gültige `id_by_customer` aus `/receipts/get` verwenden. Achtung: Es gibt keinen separaten "no receipt found"-Code, Code 5 deckt beide Fälle ab. |
| 400 | 6 | `invalid get_file specified` | Kein gültiger Boolean | `true` oder `false` |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung, besonders wahrscheinlich mit `get_file: true` bei großen Dateien | Erneut versuchen, `get_file` nur bei Bedarf setzen |

### 4.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/get/id_by_customer" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "id_by_customer": 123,
        "get_file": false
      }'
```

Hinweis: Dieses Beispiel ist die naheliegende Lesart der Spezifikation, sie wurde im
Live-Test aber **nicht bestätigt**. Siehe 4.5.

### 4.5 Live-Verifikation: gelöst, der Wert gehört in den Pfad

> **Nachgezogen am 2026-09-13 nach eigener lesender Messung vom 2026-09-12.** Die vier Messungen
> unten bleiben unverändert richtig, ihre Deutung war es nicht: Geprüft wurden ausschließlich
> **Body-Varianten**, und das ist die falsche Aufrufform. Gemessen am 2026-09-12 antwortet
> `POST /receipts/get/<wert>` mit HTTP 200 und einem vollständigen Belegdatensatz. Das Segment
> `id_by_customer` im Pfad der Spezifikation ist ein **Platzhalter für den Wert**, kein
> literales Pfadsegment, und ein Body-Feld `id_by_customer` wird nicht gesendet — die
> Spezifikation führt an diesem Pfad ohnehin nur `api_key` und `get_file`. Der Wert ist vor dem
> Einsetzen zu kodieren. Der Endpunkt gilt damit als **benutzbar**; die frühere Einstufung
> „nicht funktionsfähig belegt" und die dort genannte Array-Hypothese sind hinfällig.
> Vollständige Messung: `docs/api/live-befunde.md`, Befund 1.

Vier Aufrufe am 2026-09-12 gegen einen existierenden Beleg (dessen `id_by_customer` zuvor
über `/receipts/get` ermittelt wurde) schlugen alle mit demselben Fehler fehl:

| Versuch | Body beziehungsweise Kodierung | Ergebnis |
| --- | --- | --- |
| 1 | JSON, `{"api_key": "...", "id_by_customer": <ID>, "get_file": false}` (ID als Zahl) | HTTP 400, `{"success":false,"error_code":5,"message":"invalid id_by_customer specified"}` |
| 2 | JSON, `id_by_customer` als String `"<ID>"` | identisch, HTTP 400, Code 5 |
| 3 | JSON, Feldname `receipt_id_by_customer` | identisch, HTTP 400, Code 5 |
| 4 | `application/x-www-form-urlencoded`, `api_key` und `id_by_customer=<ID>` | identisch, HTTP 400, Code 5 |

Ausgeschlossen werden konnte damit: falsche Kodierung (formularkodiert verhält sich
identisch), falscher JSON-Typ (Zahl und String verhalten sich identisch) und
Authentifizierungsprobleme (derselbe Mandant lieferte im selben Zeitfenster über
`/receipts/get` und `/receipts/assigned-transactions/get` Daten).

**Gelöst (nachgezogen, siehe Kasten oben):** Alle vier Versuche benutzten die falsche
Aufrufform. Richtig ist `POST /receipts/get/<wert>` mit dem Body `{"api_key": "…"}`,
gemessen am 2026-09-12 mit HTTP 200. Der Wert steht im Pfad, nicht im Body. Die frühere,
ungetestete Array-Hypothese (`{"api_key": "...", "id_by_customer": [2]}`) wird damit nicht
mehr gebraucht und ist nicht weiterzuverfolgen.

Ebenfalls gemessen: Der Einzelabruf liefert `amount_original`, `currency_original` und
`exchangerate`, also die Fremdwährungsfelder, die der Listenabruf `/receipts/get` nicht führt —
weder in seiner Antwort noch in seiner Spezifikationsdefinition. Für den Einzelabruf führt die
Spezifikation sie sehr wohl (Abschnitt 4.2). Sein Umschlag trägt `data` als **Objekt** ohne
`rows`. Was der Einzelabruf gegenüber seiner Spezifikation zusätzlich liefert, sind
`amount_paid` und `amount_paid_fixed`; was sie führt und er ohne `get_file` nicht liefert, sind
`file_content` und `file_type` (`docs/api/live-befunde.md`, Befund L4).

---

## 5. `/receipts/add`

Legt einen Beleg **ohne Datei** an, also einen reinen Datensatz.

**SCHREIBENDER ENDPUNKT.** Erzeugt einen dauerhaften Beleg in der Buchhaltung des
Mandanten. Nicht Teil der Live-Test-Whitelist, deshalb **nicht live verifiziert**.

### 5.1 Parameter (14 Felder, geprüft gegen `jq '.paths["/receipts/add"].post.parameters | length'` = 14)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |
| `type` | string | ja | – | Belegart und Richtung | `invoice inbound`, `invoice outbound`, `credit inbound`, `credit outbound` | kleingeschrieben, mit Leerzeichen |
| `counterparty` | string | ja | – | Geschäftspartner: Rechnungssteller bei `invoice inbound`, Empfänger bei `invoice outbound` | nichtleerer Freitext, Beispiel `Peter Maier` | – |
| `invoice_number` | string | ja | – | Rechnungsnummer. Pflichtfeld, **darf aber leer sein** | maximal 60 Zeichen, Leerstring zulässig | – |
| `date` | string | ja | – | Belegdatum (Ausstellungsdatum) | gültiges Datum, Leerstring ungültig | `YYYY-MM-DD` |
| `amount` | number (float) | ja | – | Gesamtbetrag des Belegs. Negativ kennzeichnet eine Rückabwicklung | ungleich `0.00` | Dezimalpunkt, Beispiel `123.99` oder `-12.30` |
| `currency` | string | ja | – | Währung des Belegs | Spezifikation: "At the moment we accept USD, GBP and CHF". Widerspruch, siehe 5.5 | ISO-4217-Code, Leerstring ungültig |
| `vat_rate` | number (float) | nein | – | Umsatzsteuersatz | `19.00`, `0` oder Leerstring für "nicht vorhanden beziehungsweise mehrere Sätze" | Dezimalpunkt. Der Leerstring widerspricht `type: number`, siehe 5.5 |
| `account` | integer | nein | – | Sachkontonummer eines Zahlungskontos, dem der Beleg direkt zugeordnet wird | muss als Zahlungskonto des Mandanten existieren, `0` ungültig. Kontenliste über `/accounts/get` | ganze Zahl, Beispiel `1200` |
| `creditor_debtor` | integer | nein | – | Sachkontonummer eines Kreditors (bei `invoice inbound`) oder Debitors (bei `invoice outbound`) | Kreditoren/Debitoren müssen für den Mandanten aktiviert sein, Konto muss existieren und zum `type` passen, `0` ungültig. Listen über `/settings/get/creditors` und `/settings/get/debtors` | ganze Zahl, Beispiel `70001` |
| `payment_reference` | string | nein | – | Zahlungsreferenz. Bei korrekter Angabe wird der Beleg automatisch der passenden Transaktion zugeordnet | laut `/receipts/upload` unterstützt: Amazon-Bestellnummer, PayPal-Transaktions-ID, Stripe-Transaktions-ID | – |
| `date_delivery` | string | nein | – | Leistungs- beziehungsweise Lieferdatum | **darf wegen DATEV-Kompatibilität nicht nach `date` liegen** | `YYYY-MM-DD` |
| `date_payment_due` | string | nein | – | Fälligkeitsdatum der Zahlung | gültiges Datum | `YYYY-MM-DD` |
| `link_to_receipt_id_by_customer` | integer | nein | – | `id_by_customer` eines anderen Belegs. Bei manueller Zuordnung eines der beiden Belege zu einer Transaktion wird der andere mit zugeordnet | gültige Beleg-`id_by_customer` desselben Mandanten | ganze Zahl |

Verschachtelte Strukturen: keine. Alle Felder sind flach.

### 5.2 Erfolgsantwort

```json
{"success": true, "message": "", "id_by_customer": "123"}
```

`id_by_customer` steht **auf oberster Ebene**, nicht in `data`. Es gibt weder `data` noch
`rows` noch `filename`. Der Wert ist ein String.

### 5.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen. **Nicht blind wiederholen**, sonst drohen Dubletten |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 8 | `invalid type specified` (Response-Beschreibung: "invalid receipt type") | `type` fehlt oder ist keiner der vier Werte | Exakte Schreibweise mit Leerzeichen verwenden |
| 400 | 9 | `invalid account specified` | `account` ist keine gültige Zahl oder `0` | Gültige Sachkontonummer senden oder Feld weglassen |
| 400 | 10 | `account specified does not exist for the customer` | Zahlungskonto existiert beim Mandanten nicht | Konten über `/accounts/get` ermitteln |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 400 | 17 | `invalid counterparty specified` | `counterparty` fehlt oder ist leer | Nichtleeren Wert senden |
| 400 | 18 | `invalid invoice number specified` | Rechnungsnummer ungültig, zum Beispiel länger als 60 Zeichen | Kürzen oder Leerstring senden |
| 400 | 19 | `invalid date specified` | `date` fehlt oder ist kein gültiges Datum | Format `YYYY-MM-DD` |
| 400 | 20 | `invalid amount specified` | `amount` fehlt, ist `0.00` oder keine Zahl | Betrag ungleich null senden |
| 400 | 21 | `invalid currency specified` | Währung fehlt, ist leer oder nicht unterstützt | Siehe Widerspruch in 5.5, im Zweifel `EUR` testen |
| 400 | 22 | `invalid vat rate specified` | Steuersatz ungültig | Zahl oder Leerstring senden |
| 400 | 24 | `invalid creditor/debtor specified` | `creditor_debtor` keine gültige Zahl oder `0` | Gültige Nummer senden oder weglassen |
| 400 | 25 | `creditor/debtor specified does not exist for the customer` | Kreditor/Debitor existiert nicht | Über `/settings/get/creditors` beziehungsweise `/settings/get/debtors` prüfen |
| 400 | 26 | `a receipt of type '<type>' cannot be assigned to a creditor account` | Belegart passt nicht zu einem Kreditorenkonto | Kreditoren nur bei `invoice inbound` verwenden |
| 400 | 27 | `creditors are not activated for the customer` | Kreditorenbuchhaltung nicht aktiviert | Feld weglassen oder Funktion im Mandanten aktivieren lassen |
| 400 | 28 | `a receipt of type '<type>' cannot be assigned to a debtor account` | Belegart passt nicht zu einem Debitorenkonto | Debitoren nur bei `invoice outbound` verwenden |
| 400 | 29 | `debtors are not activated for the customer` | Debitorenbuchhaltung nicht aktiviert | Feld weglassen oder Funktion aktivieren lassen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | **Nicht blind wiederholen.** Über `/receipts/get` prüfen, ob der Beleg trotzdem angelegt wurde |
| 400 | 34 | `invalid payment reference specified` | Zahlungsreferenz ungültig | Feld weglassen oder Format prüfen |
| 400 | 35 | `invalid date delivery specified` | `date_delivery` ungültig oder **nach** `date` | Datum korrigieren, Lieferdatum darf nicht nach dem Belegdatum liegen |
| 400 | 36 | `invalid date_payment_due specified` | `date_payment_due` ungültig | Format `YYYY-MM-DD` |
| 400 | 37 | `invalid link_to_receipt_id_by_customer specified` | Verknüpfte Beleg-ID existiert nicht oder ist ungültig | Gültige `id_by_customer` über `/receipts/get` ermitteln |

Anmerkung zur Spezifikation: Die Antworten 500 und 504 verweisen bei `/receipts/add` per
`$ref` auf `ReceiptsUpload_ErrorCode0` und `ReceiptsUpload_ErrorCode30`, obwohl die
gleichnamigen `ReceiptsAdd_`-Definitionen existieren. Inhaltlich identisch, aber ein
Beispiel für die Nachlässigkeit der Spezifikation.

### 5.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/add" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "type": "invoice inbound",
        "counterparty": "Beispiel GmbH",
        "invoice_number": "RE-2024-0001",
        "date": "2024-03-15",
        "amount": 119.00,
        "currency": "EUR",
        "vat_rate": 19.00,
        "account": 1200,
        "date_delivery": "2024-03-10",
        "date_payment_due": "2024-04-14"
      }'
```

### 5.5 Fallstricke

1. **Widersprüchliche Währungsangabe.** `/receipts/add` schreibt "At the moment we accept
   USD, GBP and CHF" und nennt EUR nicht. `/receipts/upload` schreibt "Has to be 'EUR' if
   specified". Die Definition `Receipt` (verwendet von `/receipts/addBatch`) nennt eine
   lange Liste inklusive EUR und setzt `EUR` als Beispiel. Drei Stellen, drei Aussagen.
   Plausible, aber **nicht verifizierte** Auflösung: EUR ist die Buchungswährung und immer
   erlaubt, die Aufzählung bei `/receipts/add` meint zusätzlich unterstützte
   Fremdwährungen. Vor produktiver Nutzung mit einem Testmandanten klären.

   > **Nachgezogen am 2026-09-13 nach maschineller Auszählung der Spezifikation vom
   > 2026-09-12.** Der Widerspruch bleibt und wird nicht geraten. Ausgezählt führt die
   > Spezifikation **fünf** Währungsfelder mit drei verschiedenen Textvorräten: 3 Codes an
   > `/receipts/add`, 1 Code an `/receipts/upload`, 47 Codes an `/transactions/add` und 48 Codes
   > in den Definitionen `Receipt` und `Transaction`. Für die Umsetzung gilt an `/receipts/add`
   > **und** an `/receipts/addBatch` **derselbe** Umgang: `currency` ist ein **freier String**,
   > **Pflichtfeld**, und der Widerspruch wird in der Parameterbeschreibung ausdrücklich
   > benannt. Der Ein-Wert-`enum` `["EUR"]` der Definition `Receipt` wird dabei **verworfen**;
   > er widerspricht dem Beschreibungstext derselben Eigenschaft, der 48 Codes nennt, und wird
   > wie das Platzhalterschema des `order`-Parameters als Spezifikationsfehler behandelt. Ein
   > Enum an dieser Stelle wäre eine erfundene Schranke, die gültige Belege unsichtbar vor dem
   > Request ablehnte. Dass Einzel- und Stapelform gleich behandelt werden, sagt die
   > Spezifikation selbst: „A receipt has the same fields like the /receipts/add endpoint has".
2. **`vat_rate` ist typwidrig.** Deklariert als `number`, die Beschreibung erlaubt aber
   ausdrücklich den Leerstring. Ein streng typisierter Client kann den Fall "mehrere
   Steuersätze" sonst nicht abbilden. `null` ist nicht dokumentiert.
3. **`invoice_number` ist Pflicht, darf aber leer sein.** Eine Validierung, die nichtleere
   Pflichtfelder erzwingt, ist hier falsch.
4. **`date_delivery` darf nicht nach `date` liegen** (DATEV-Kompatibilität). Das ist eine
   endpunktübergreifende Regel und der wahrscheinlichste vermeidbare Fehler beim Anlegen.
5. **Kein `list_direction`.** Die Richtung steckt implizit in `type`.
6. **Feldnamen-Inkonsistenz.** Beim Schreiben `invoice_number`, beim Lesen und beim Filtern
   `invoicenumber`. Beim Schreiben `vat_rate`, beim Lesen `vat`. Beim Schreiben
   `date_payment_due`, beim Lesen in `/receipts/get` `due_date`, in
   `/receipts/get/id_by_customer` wieder `date_payment_due`.
7. **Keine Idempotenz.** Es gibt keinen Idempotenzschlüssel. Ein wiederholter Aufruf legt
   einen zweiten Beleg an. Nach Timeout (Code 30) oder Serverfehler (Code 0) muss vor einem
   Wiederholungsversuch über `/receipts/get` geprüft werden, ob der Beleg schon existiert.
8. Ein über `/receipts/add` angelegter Beleg hat **keine Datei**. Er kann nachträglich nicht
   über einen dokumentierten Endpunkt mit einer Datei versehen werden. Wer eine Datei hat,
   muss von Anfang an `/receipts/upload` verwenden.

---

## 6. `/receipts/addBatch`

Legt mehrere Belege ohne Datei in einem Aufruf an.

**SCHREIBENDER ENDPUNKT.** Erzeugt bis zu 50 dauerhafte Belege pro Aufruf. Nicht auf der
Live-Test-Whitelist, deshalb **nicht live verifiziert**.

### 6.1 Parameter (2 Felder, geprüft gegen `jq '.paths["/receipts/addBatch"].post.parameters | length'` = 2)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |
| `receipts` | array of object | ja | – | Liste der anzulegenden Belege. Jedes Element hat dieselben Felder wie `/receipts/add`, dieselben Fehlermeldungen gelten je Element | 1 bis 50 Elemente | JSON-Array (`$ref: #/definitions/Receipts` zu `#/definitions/Receipt`) |

### 6.2 Struktur eines Elements in `receipts` (Definition `Receipt`)

| Feldname | Typ | Pflicht | Beschreibung | Erlaubte Werte / Format |
| --- | --- | --- | --- | --- |
| `type` | string | ja | Belegart und Richtung | `invoice inbound`, `invoice outbound`, `credit inbound`, `credit outbound` |
| `counterparty` | string | ja | Geschäftspartner | Freitext |
| `invoice_number` | string | ja | Rechnungsnummer, maximal 60 Zeichen, Leerstring zulässig | – |
| `date` | string | ja | Belegdatum | `YYYY-MM-DD` |
| `amount` | number (float) | ja | Gesamtbetrag, negativ für Rückabwicklung | Dezimalpunkt |
| `currency` | string | ja | Währung | Laut dieser Definition: AED, AUD, BGN, BRL, CAD, CHF, CNY, COP, CYP, CZK, DKK, EUR, GBP, HKD, HRK, HUF, IDR, ILS, INR, ISK, JPY, KRW, LTL, LVL, MTL, MXN, MYR, NOK, NZD, PEN, PHP, PLN, QAR, ROL, RON, RSD, RUB, SEK, SGD, SIT, SKK, THB, TRL, TRY, UAH, USD, VND, ZAR. Leerstring ungültig |
| `vat_rate` | number (float) | nein | Umsatzsteuersatz, Leerstring für nicht vorhanden oder mehrere Sätze | Dezimalpunkt |
| `account` | integer | nein | Sachkontonummer eines Zahlungskontos | Beispiel `1200` |
| `creditor_debtor` | integer | nein | Kreditor (bei `invoice inbound`) beziehungsweise Debitor (bei `invoice outbound`) | Beispiel `70001` |
| `payment_reference` | string | nein | Zahlungsreferenz für die automatische Zuordnung zur Transaktion | – |
| `date_delivery` | string | nein | Leistungsdatum, darf nicht nach `date` liegen (DATEV) | `YYYY-MM-DD` |
| `date_payment_due` | string | nein | Fälligkeitsdatum | `YYYY-MM-DD` |
| `link_to_receipt_id_by_customer` | integer | nein | Verknüpfung zu einem anderen Beleg | ganze Zahl |

Die Pflichtfelder stehen in `Receipt.required`: `type`, `counterparty`, `invoice_number`,
`date`, `amount`, `currency`. Das deckt sich mit `/receipts/add`.

> **Nachgezogen am 2026-09-13 nach maschineller Auszählung der Spezifikation vom 2026-09-12.**
> Die Zeile `currency` dieser Tabelle trägt zusätzlich zu der oben genannten 48er-Liste den
> Ein-Wert-`enum` `["EUR"]` in derselben Eigenschaft und widerspricht damit sich selbst. Dieser
> `enum` wird **verworfen**. Umgesetzt wird `currency` hier wie an `/receipts/add`: freier
> String, Pflichtfeld, Widerspruch in der Parameterbeschreibung benannt (siehe Abschnitt 5.5,
> Punkt 1). Der Beschreibungstext dieser Eigenschaft ist zudem wörtlich aus `Transaction`
> übernommen — er beginnt mit „The transaction currency." und endet mit „An empty string is not
> considered a valid type." — und ist deshalb keine eigenständige Aussage über Belege.

Beispiel aus der Spezifikation (`Receipt.example`):

```json
{
  "type": "invoice inbound",
  "counterparty": "Test GmBh",
  "invoice_number": "1234566",
  "date": "2022-01-01",
  "amount": 123.99,
  "currency": "EUR",
  "vat_rate": 19.00,
  "account": 1200,
  "creditor_debtor": 70001,
  "date_delivery": "2022-01-01",
  "date_payment_due": "2022-01-01",
  "link_to_receipt_id_by_customer": 6
}
```

### 6.3 Erfolgsantwort

Der Umschlag weicht von allen anderen Beleg-Endpunkten ab. Es gibt **kein** `data`, **kein**
`rows` und **kein** `message` auf oberster Ebene:

```json
{
  "success": true,
  "receipts": [
    {"success": true, "message": "", "id_by_customer": "123"}
  ],
  "errors": [
    {
      "success": false,
      "error_code": 20,
      "message": "invalid amount specified",
      "request_data": []
    }
  ]
}
```

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | Ob der Request insgesamt verarbeitet wurde. **Nicht** ob alle Belege angelegt wurden |
| `receipts` | array of object | Erfolgreich angelegte Belege, je Element `success` (immer `true`), `message` und `id_by_customer` |
| `errors` | array of object | Fehlgeschlagene Belege, je Element `success` (immer `false`), `error_code`, `message` und `request_data` mit den gesendeten Daten |

**Teilerfolg ist der Normalfall.** Ein Aufruf kann `success: true` liefern und trotzdem
Elemente in `errors` haben. Die Auswertung muss immer beide Arrays lesen. Die Zuordnung von
Eingabeelement zu Ausgabeelement ist **nicht über einen Index dokumentiert**; sie muss über
`request_data` rekonstruiert werden. `request_data` ist in der Spezifikation als
`type: array` ohne Item-Schema deklariert, obwohl es inhaltlich das gesendete Beleg-Objekt
sein dürfte. **Nicht verifiziert.**

Die Fehlercodes je Element sind laut Beschreibung dieselben wie bei `/receipts/add`, also
8, 9, 10, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 34, 35, 36, 37.

### 6.4 Fehlerfälle auf Request-Ebene

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen, vorher Dublettenprüfung über `/receipts/get` |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | `api_key` unbekannt oder Client nicht für den Mandanten freigegeben | `api_key` und Freigabe prüfen |
| 400 | 5 | `Number of receipts exceeded` (Response-Beschreibung: "Maximum of 50 receipts exceeded") | Mehr als 50 Elemente in `receipts` | In Blöcke zu maximal 50 aufteilen, dabei die 5-Sekunden-Sperre beachten |
| 400 | 6 | `No receipts found` | `receipts` fehlt, ist leer oder kein Array | Mindestens ein Element senden |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 403 | 15 | `adding temporarily restricted` (Response-Beschreibung: "adding is temporarily restricted") | Die 5-Sekunden-Sperre oder eine andere temporäre Beschränkung greift | Mindestens 5 Sekunden warten und erneut senden |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | **Nicht blind wiederholen**, Teilmengen könnten angelegt sein. Über `/receipts/get` abgleichen |

Bemerkenswert: Die Fehlerdefinitionen dieses Endpunkts verweisen teils auf die generischen
`Request_ErrorCode*`-Definitionen, teils auf eigene `ReceiptsAddBatch_ErrorCode*`. Die
Textfassung von Code 4 ist bei den generischen Definitionen ausführlicher als bei den
endpunktspezifischen.

### 6.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/addBatch" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "receipts": [
          {
            "type": "invoice inbound",
            "counterparty": "Beispiel GmbH",
            "invoice_number": "RE-2024-0001",
            "date": "2024-03-15",
            "amount": 119.00,
            "currency": "EUR",
            "vat_rate": 19.00
          },
          {
            "type": "invoice outbound",
            "counterparty": "Beispiel Kunde AG",
            "invoice_number": "AR-2024-0007",
            "date": "2024-03-16",
            "amount": 238.00,
            "currency": "EUR",
            "vat_rate": 19.00
          }
        ]
      }'
```

### 6.6 Fallstricke

1. **Eigener Antwortumschlag.** Wer den Standardumschlag (`data`, `rows`) erwartet, liest
   nichts. `receipts` und `errors` stehen auf oberster Ebene.
2. **`success: true` heißt nicht "alles angelegt".** Immer `errors` prüfen.
3. **Harte Sperre von 5 Sekunden zwischen zwei Aufrufen.** Bei 200 Belegen bedeutet das
   4 Aufrufe und mindestens 15 Sekunden Wartezeit. Ein MCP-Tool muss das serialisieren und
   Code 15 als "warten und erneut versuchen" behandeln, nicht als endgültigen Fehler.
4. **Keine Datei.** Wie `/receipts/add` legt der Endpunkt nur Datensätze an. Für Dateien
   gibt es keinen Batch-Endpunkt, `/receipts/upload` muss einzeln aufgerufen werden.
5. **Keine Idempotenz und keine Transaktionalität.** Ein Teil der Belege kann angelegt sein,
   während der Rest scheitert. Ein pauschales Wiederholen erzeugt Dubletten.
6. Die Definition heißt `Receipts` und verweist auf `Receipt`. Beide Namen sind generisch
   und werden von keinem anderen Endpunkt referenziert; Codegeneratoren sollten sie nicht
   als allgemeines Belegmodell missdeuten. Die Definition `Receipt` beschreibt **nur** die
   Eingabe für `addBatch`, nicht die Antwortstruktur von `/receipts/get`.

---

## 7. `/receipts/upload`

Lädt eine Belegdatei hoch. Die Datei wird anschließend serverseitig verarbeitet
(OCR beziehungsweise E-Rechnungs-Auswertung).

**SCHREIBENDER ENDPUNKT.** Erzeugt einen dauerhaften Beleg samt Datei. Nicht auf der
Live-Test-Whitelist, deshalb **nicht live verifiziert**.

### 7.1 Parameter (16 Felder, geprüft gegen `jq '.paths["/receipts/upload"].post.parameters | length'` = 16)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |
| `file` | string | ja | – | Die Belegdatei, entweder als echter Datei-Upload oder als Base64-String | akzeptierte MIME-Typen: `application/pdf`, `text/xml`, `application/xml`, `image/jpeg`, `image/png`, `image/bmp`, `image/tiff` | Base64-String oder multipart-Datei |
| `type` | string | ja | – | Belegart und Richtung | `invoice inbound`, `invoice outbound`, `credit inbound`, `credit outbound` | kleingeschrieben, mit Leerzeichen |
| `file_name` | string | nein | – | Dateiname. **Pflicht, wenn die Datei als Base64-String gesendet wird**, wird bei echtem Upload ignoriert | Dateiname mit Endung, Beispiel `rechnung.pdf` | – |
| `account` | integer | nein | – | Sachkontonummer eines Zahlungskontos für die direkte Zuordnung | Konto muss als Zahlungskonto existieren, `0` ungültig | ganze Zahl |
| `creditor_debtor` | integer | nein | – | Kreditor (bei `invoice inbound`) beziehungsweise Debitor (bei `invoice outbound`) | muss aktiviert sein, existieren und zum `type` passen, `0` ungültig | ganze Zahl |
| `counterparty` | string | nein | – | Geschäftspartner. **Wird bei E-Rechnungen ignoriert** | nichtleerer Freitext | – |
| `invoice_number` | string | nein | – | Rechnungsnummer. **Wird bei E-Rechnungen ignoriert** | maximal 60 Zeichen, Leerstring zulässig | – |
| `date` | string | nein | – | Belegdatum. **Wird bei E-Rechnungen ignoriert** | gültiges Datum, Leerstring ungültig | `YYYY-MM-DD` |
| `amount` | number (float) | nein | – | Gesamtbetrag, negativ für Rückabwicklung. **Wird bei E-Rechnungen ignoriert** | ungleich `0.00` | Dezimalpunkt |
| `currency` | string | nein | – | Währung. **Wird bei E-Rechnungen ignoriert** | laut diesem Endpunkt: muss `EUR` sein, falls gesetzt. Leerstring ungültig | ISO-4217-Code |
| `vat_rate` | number (float) | nein | – | Umsatzsteuersatz. **Wird bei E-Rechnungen ignoriert** | `19.00`, `0` oder Leerstring | Dezimalpunkt |
| `payment_reference` | string | nein | – | Zahlungsreferenz für die automatische Zuordnung zur Transaktion. **Wird bei E-Rechnungen ignoriert** | unterstützt laut Spezifikation: Amazon-Bestellnummer, PayPal-Transaktions-ID, Stripe-Transaktions-ID | – |
| `date_delivery` | string | nein | – | Leistungsdatum, darf nicht nach `date` liegen (DATEV). **Wird bei E-Rechnungen ignoriert** | gültiges Datum | `YYYY-MM-DD` |
| `date_payment_due` | string | nein | – | Fälligkeitsdatum. **Wird bei E-Rechnungen ignoriert** | gültiges Datum | `YYYY-MM-DD` |
| `link_to_receipt_id_by_customer` | integer | nein | – | `id_by_customer` eines anderen Belegs. Bei manueller Zuordnung eines der beiden Belege zu einer Transaktion wird der andere mit zugeordnet. **Kein Hinweis auf Ignorieren bei E-Rechnungen** | gültige Beleg-`id_by_customer` | ganze Zahl |

Verschachtelte Strukturen: keine.

**Abgrenzung zu `/receipts/add`:** Hier sind `counterparty`, `invoice_number`, `date`,
`amount` und `currency` **optional**, weil BuchhaltungsButler sie aus der Datei extrahiert.
Bei `/receipts/add` sind sie Pflicht, weil es keine Datei gibt, aus der man sie ziehen
könnte.

### 7.2 Erfolgsantwort

```json
{"success": true, "message": "", "id_by_customer": "123", "filename": "receipt567"}
```

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `success` | boolean | `true` |
| `message` | string | leer |
| `id_by_customer` | string | Mandantenweite Belegnummer des neuen Belegs |
| `filename` | string | Interner Dateiname **ohne Endung**, unter dem die Datei abgelegt wurde |

Kein `data`, kein `rows`. Die Felder stehen auf oberster Ebene.

### 7.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen, vorher Dublettenprüfung |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `no file provided` | `file` fehlt oder ist leer | Datei mitsenden |
| 400 | 6 | `file type not accepted` | MIME-Typ nicht in der Liste | Nur PDF, XML, JPEG, PNG, BMP, TIFF senden |
| 400 | 7 | `maximum file size is <max>MB` | Datei zu groß. Die Grenze wird zur Laufzeit in die Meldung eingesetzt und ist in der Spezifikation **nicht beziffert** | Datei verkleinern. Die konkrete Grenze aus der Fehlermeldung auslesen |
| 400 | 8 | `invalid type specified` | `type` fehlt oder ungültig | Einen der vier Werte senden |
| 400 | 9 | `invalid account specified` | `account` ungültig oder `0` | Gültige Sachkontonummer oder Feld weglassen |
| 400 | 10 | `account specified does not exist for the customer` | Zahlungskonto existiert nicht | Über `/accounts/get` prüfen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 403 | 12 | `customer has reached the upload limit` | Upload-Kontingent des Mandanten erschöpft | Tarif beziehungsweise Kontingent prüfen, nicht technisch lösbar |
| 400 | 14 | `maximum number of pages is <max>` | Zu viele Seiten im Dokument. Die Grenze wird zur Laufzeit eingesetzt und ist **nicht beziffert** | Dokument aufteilen |
| 403 | 15 | `upload temporarily restricted` | Temporäre Sperre, plausibel das Minutenlimit von 10 Uploads | Warten und erneut versuchen |
| 400 | 17 | `invalid counterparty specified` | `counterparty` leer oder ungültig | Feld weglassen oder nichtleeren Wert senden |
| 400 | 18 | `invalid invoice number specified` | Rechnungsnummer ungültig | Kürzen oder weglassen |
| 400 | 19 | `invalid date specified` | `date` ungültig | Format `YYYY-MM-DD` |
| 400 | 20 | `invalid amount specified` | `amount` ist `0.00` oder keine Zahl | Betrag ungleich null oder Feld weglassen |
| 400 | 21 | `invalid currency specified` | Währung ungültig | Laut diesem Endpunkt `EUR` senden oder weglassen |
| 400 | 22 | `invalid vat rate specified` | Steuersatz ungültig | Zahl oder Leerstring senden |
| 400 | 23 | `no post and files content received or declined` | Der Request enthielt weder Formularfelder noch Dateien, oder er wurde abgewiesen | Request-Aufbau prüfen: Content-Type, multipart-Grenzen, Größe |
| 400 | 24 | `invalid creditor/debtor specified` | `creditor_debtor` ungültig oder `0` | Gültige Nummer oder weglassen |
| 400 | 25 | `creditor/debtor specified does not exist for the customer` | Kreditor/Debitor existiert nicht | Über `/settings/get/creditors` beziehungsweise `/settings/get/debtors` prüfen |
| 400 | 26 | `a receipt of type '<type>' cannot be assigned to a creditor account` | Belegart passt nicht zum Kreditorenkonto | Kreditoren nur bei `invoice inbound` |
| 400 | 27 | `creditors are not activated for the customer` | Kreditorenbuchhaltung nicht aktiviert | Feld weglassen |
| 400 | 28 | `a receipt of type '<type>' cannot be assigned to a debtor account` | Belegart passt nicht zum Debitorenkonto | Debitoren nur bei `invoice outbound` |
| 400 | 29 | `debtors are not activated for the customer` | Debitorenbuchhaltung nicht aktiviert | Feld weglassen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung, bei großen Dateien wahrscheinlich | **Nicht blind wiederholen.** Über `/receipts/get` prüfen, ob der Beleg angelegt wurde |
| 422 | 31 | `receipt not processable` | Datei konnte nicht verarbeitet werden, laut Response-Beschreibung häufig wegen Kopierschutz oder Verschlüsselung | Schutz entfernen, Datei neu erzeugen |
| 422 | 32 | `receipt ocr processing failed` | OCR ist fehlgeschlagen | Bessere Scanqualität, höhere Auflösung, anderes Format |
| 400 | 33 | `file name is not specified` | Datei als Base64 gesendet, aber `file_name` fehlt | `file_name` mitsenden |
| 400 | 34 | `invalid payment reference specified` | Zahlungsreferenz ungültig | Feld weglassen oder Format prüfen |
| 400 | 35 | `invalid date delivery specified` | `date_delivery` ungültig oder nach `date` | Datum korrigieren |
| 400 | 36 | `invalid date_payment_due specified` | Fälligkeitsdatum ungültig | Format `YYYY-MM-DD` |
| 400 | 37 | `invalid link_to_receipt_id_by_customer specified` | Verknüpfte Beleg-ID ungültig | Gültige `id_by_customer` verwenden |

### 7.4 curl-Beispiele

Variante A, Datei als Base64-String im JSON-Body (`file_name` ist dann Pflicht):

```bash
# macOS: base64 -i, GNU coreutils: base64 -w0
BASE64_CONTENT="$(base64 -i ./rechnung.pdf | tr -d '\n')"

curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/upload" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{
        \"api_key\": \"<API_KEY>\",
        \"type\": \"invoice inbound\",
        \"file_name\": \"rechnung.pdf\",
        \"file\": \"${BASE64_CONTENT}\",
        \"counterparty\": \"Beispiel GmbH\",
        \"invoice_number\": \"RE-2024-0001\",
        \"date\": \"2024-03-15\",
        \"amount\": 119.00,
        \"currency\": \"EUR\",
        \"vat_rate\": 19.00
      }"
```

Variante B, echter Datei-Upload als multipart (`file_name` wird ignoriert):

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/upload" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -F "api_key=<API_KEY>" \
  -F "type=invoice inbound" \
  -F "file=@./rechnung.pdf;type=application/pdf" \
  -F "counterparty=Beispiel GmbH" \
  -F "invoice_number=RE-2024-0001" \
  -F "date=2024-03-15" \
  -F "amount=119.00" \
  -F "currency=EUR"
```

Die Spezifikation legt weder `consumes` fest noch benennt sie den multipart-Feldnamen
ausdrücklich; dass er `file` heißt, ist die naheliegende Lesart, aber **nicht verifiziert**.
Der Fehlercode 23 ("no post and files content received or declined") existiert genau für
den Fall, dass der Server weder Formularfelder noch Dateien erkennt, und ist der Indikator
für einen falsch aufgebauten multipart-Request.

### 7.5 Fallstricke

1. **Zwei Übergabewege für dieselbe Datei.** Base64 im JSON-Body oder echter multipart-
   Upload. `file_name` ist genau im Base64-Fall Pflicht (Code 33) und wird im multipart-Fall
   ignoriert. Ein MCP-Tool sollte den Base64-Weg wählen, weil MCP-Argumente JSON sind, und
   `file_name` immer mitsenden.
2. **Base64 bläht auf.** Base64 vergrößert die Nutzlast um rund ein Drittel. Die
   Größengrenze (Code 7) ist in der Spezifikation **nicht beziffert**; ob sie sich auf die
   Datei oder auf den kodierten String bezieht, ist **nicht verifiziert**. Ebenso ist die
   maximale Seitenzahl (Code 14) nicht beziffert. Beide Grenzen müssen aus der
   Fehlermeldung zur Laufzeit gelesen und an den Aufrufer weitergereicht werden.
3. **E-Rechnungen überschreiben Metadaten.** Bei ZUGFeRD oder XRechnung ignoriert der
   Server `counterparty`, `invoice_number`, `date`, `amount`, `currency`, `vat_rate`,
   `payment_reference`, `date_delivery` und `date_payment_due`. Wer sie trotzdem sendet,
   erhält keinen Fehler, aber auch keine Wirkung. Ob `account`, `creditor_debtor`, `type`
   und `link_to_receipt_id_by_customer` wirksam bleiben, sagt die Spezifikation nicht
   ausdrücklich; bei `link_to_receipt_id_by_customer` fehlt der Ignoriert-Hinweis, bei
   `account`, `creditor_debtor` und `type` ebenfalls. **Nicht verifiziert.**
4. **Asynchrone Verarbeitung.** Die Beschreibung sagt, der Beleg werde "by the
   BuchhaltungsButler technology" verarbeitet. Die Antwort liefert sofort `id_by_customer`
   und `filename`. Ob die extrahierten Felder (Betrag, Datum, Rechnungsnummer) zu diesem
   Zeitpunkt schon gefüllt sind, ist **nicht dokumentiert und nicht verifiziert**. Ein
   Agent, der direkt nach dem Upload liest, sollte mit leeren Feldern rechnen.
   Die Codes 31 und 32 (HTTP 422) zeigen aber, dass zumindest ein Teil der Verarbeitung
   **synchron** stattfindet, denn sonst könnten sie nicht in der Upload-Antwort auftauchen.
5. **Nur 10 Uploads pro Minute**, nicht 100 wie beim globalen Limit. Code 15 ist die
   zugehörige Fehlerantwort. Ein Massenimport muss gedrosselt werden.
6. **Widerspruch zur Währung** gegenüber `/receipts/add`, siehe Abschnitt 5.5.
7. **Kein Batch-Pendant.** Es gibt keinen `uploadBatch`. Mehrere Dateien bedeuten mehrere
   Aufrufe mit Drosselung.

---

## 8. `/receipts/delete/id_by_customer`

Markiert einen Beleg als gelöscht.

**SCHREIBENDER ENDPUNKT.** Nicht auf der Live-Test-Whitelist, deshalb **nicht live
verifiziert**. Es handelt sich um ein weiches Löschen ("Mark a receipt as deleted"), der
Beleg bleibt über `/receipts/get` mit `deleted: true` auffindbar und ist über
`/receipts/restore/id_by_customer` wiederherstellbar.

### 8.1 Parameter (1 Feld laut `jq '... | length'` = 1; die Spezifikation ist hier unvollständig)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |

**Fehlender Pflichtparameter.** Wie bei `/receipts/get/id_by_customer` fehlt das Feld für
die Beleg-ID, obwohl der Pfad, die `description` und `error_code` 5 ("invalid
id_by_customer specified") es voraussetzen. Der Feldname ist mit hoher Wahrscheinlichkeit
`id_by_customer`, das ist aber **nicht verifiziert**, und der einzige Live-Test dieser
Parameterform (auf dem lesenden Schwester-Endpunkt) schlug fehl, siehe 4.5. Vor dem ersten
produktiven Löschen muss das mit dem Support oder auf einem Testmandanten geklärt werden.

### 8.2 Erfolgsantwort

```json
{"success": true, "message": "", "id_by_customer": "123"}
```

`id_by_customer` bestätigt den gelöschten Beleg. Kein `data`, kein `rows`.

### 8.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid id_by_customer specified` | Beleg-ID fehlt oder hat falsches Format | Gültige `id_by_customer` aus `/receipts/get` |
| 400 | 6 | `no receipt found` | Kein Beleg mit dieser ID beim Mandanten | ID prüfen, eventuell falscher Mandant |
| 400 | 7 | `receipt is already deleted` | Beleg ist bereits als gelöscht markiert | Kein Handlungsbedarf, als Erfolg behandeln oder über `deleted: true` in `/receipts/get` prüfen |
| 400 | 8 | `receipt can´t be marked as deleted - fixed postings exist` | Es existieren festgeschriebene Buchungen zu diesem Beleg | Nicht auflösbar ohne Eingriff in die Buchhaltung. Festgeschriebene Buchungen sind unveränderlich |
| 400 | 9 | `receipt is directly assigned to confirmed postings` | Der Beleg hängt an bestätigten Buchungen | Buchung zuerst entbestätigen (`/postings/unconfirm/receipt`), dann erneut löschen |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Status über `/receipts/get` mit `deleted: true` prüfen, dann gegebenenfalls wiederholen |

Die Meldung zu Code 8 enthält im Original ein typografisches Akut-Zeichen (`can´t`), nicht
das übliche Apostroph. Wer Fehlertexte vergleicht, muss das exakt so erwarten.

### 8.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/delete/id_by_customer" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "id_by_customer": 123
      }'
```

Der Feldname `id_by_customer` ist die naheliegende Lesart, **nicht verifiziert**.

### 8.5 Fallstricke

1. Löschen ist **weich**. Der Beleg verschwindet nicht aus der Datenbank und bleibt über
   `/receipts/get` mit `deleted: true` sichtbar. Ein MCP-Tool sollte das im Text sagen,
   damit Agenten das Löschen nicht für einen physischen Löschvorgang halten.
2. Löschen kann an der **Buchhaltungslage** scheitern (Codes 8 und 9). Das sind keine
   Eingabefehler, sondern fachliche Sperren. Codes 8 und 9 müssen dem Nutzer im Klartext
   erklärt werden.
3. Code 7 ("already deleted") ist ein **idempotenzfreundlicher** Fall: Der gewünschte
   Zustand ist erreicht. Er sollte nicht als harter Fehler eskaliert werden.

---

## 9. `/receipts/restore/id_by_customer`

Stellt einen als gelöscht markierten Beleg wieder her.

**SCHREIBENDER ENDPUNKT.** Nicht auf der Live-Test-Whitelist, deshalb **nicht live
verifiziert**. Das Gegenstück zu `/receipts/delete/id_by_customer`.

### 9.1 Parameter (1 Feld laut `jq '... | length'` = 1; die Spezifikation ist hier unvollständig)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |

**Fehlender Pflichtparameter.** Identisch zu Abschnitt 8.1: Das Feld für die Beleg-ID fehlt
in der Spezifikation, `error_code` 5 setzt es voraus. Feldname vermutlich
`id_by_customer`, **nicht verifiziert**.

### 9.2 Erfolgsantwort

```json
{"success": true, "message": "", "id_by_customer": "123"}
```

### 9.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid id_by_customer specified` | Beleg-ID fehlt oder hat falsches Format | Gültige `id_by_customer` verwenden |
| 400 | 6 | `no receipt found` | Kein Beleg mit dieser ID beim Mandanten | ID prüfen. Hinweis: Gelöschte Belege findet man nur mit `deleted: true` in `/receipts/get` |
| 400 | 7 | `receipt is not marked as deleted` | Beleg ist gar nicht gelöscht | Kein Handlungsbedarf, als Erfolg behandeln |
| 400 | 8 | `restoration of receipt failed` | Wiederherstellung serverseitig fehlgeschlagen, Grund nicht spezifiziert | Erneut versuchen, bei Wiederholung Support |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Status über `/receipts/get` prüfen |

Anders als beim Löschen gibt es **keinen** Code 9. Die Codenummerierung ist nicht
spiegelbildlich zu `/receipts/delete/id_by_customer`: Code 8 bedeutet dort "fixed postings
exist", hier "restoration failed". Das unterstreicht, dass `error_code` nur zusammen mit dem
Endpunkt interpretierbar ist.

### 9.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/restore/id_by_customer" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "id_by_customer": 123
      }'
```

Der Feldname `id_by_customer` ist die naheliegende Lesart, **nicht verifiziert**.

### 9.5 Fallstricke

1. Um gelöschte Belege überhaupt zu finden, muss `/receipts/get` mit `deleted: true`
   aufgerufen werden. Dieses Flag liefert **ausschließlich** gelöschte Belege, nicht
   gelöschte zusätzlich zu aktiven. Ein Agent, der "alle Belege" braucht, muss zwei Aufrufe
   machen.
2. Code 8 ist eine Blackbox ohne Ursachenangabe. Er ist der einzige Fall in diesem
   Endpunkt, der eine Wiederholung rechtfertigt.

---

## 10. `/receipts/assigned-transactions/get`

Liefert alle Transaktionen, die einem bestimmten Beleg zugeordnet sind.

**Einordnung: lesend.** Steht auf der Live-Test-Whitelist und wurde erfolgreich verifiziert.

### 10.1 Parameter (3 Felder, geprüft gegen `jq '.paths["/receipts/assigned-transactions/get"].post.parameters | length'` = 3)

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des Mandanten | – | – |
| `receipt_id_by_customer` | integer | ja | – | `id_by_customer` des Belegs, dessen Zuordnungen gesucht werden. Zu ermitteln über `/receipts/get` | gültige Beleg-ID des Mandanten | ganze Zahl. Live mit JSON-Zahl bestätigt |
| `confirmed_only` | boolean | nein | `false` | Wenn `true`, werden nur bestätigte Zuordnungen geliefert | `true`, `false` | – |

Hier heißt der Parameter ausdrücklich `receipt_id_by_customer`, nicht `id_by_customer`.
Das ist das Gegenstück zu `transaction_id_by_customer` in
`/transactions/assigned-receipts/get`.

### 10.2 Erfolgsantwort

Standardumschlag mit `rows` und `data` als Array. Felder je Element:

| Feld | Typ laut Spezifikation | Typ live | Bedeutung |
| --- | --- | --- | --- |
| `id_by_customer` | string | **Zahl** | `id_by_customer` der Transaktion, nicht des Belegs |
| `to_from` | string | string | Zahlungspflichtiger beziehungsweise Zahlungsempfänger der Transaktion |
| `amount` | string | string | Transaktionsbetrag mit Vorzeichen. Ausgehende Zahlungen sind negativ |
| `booking_date` | string | string | Buchungsdatum, Format `YYYY-MM-DD HH:MM:SS` |
| `value_date` | string | string | Wertstellungsdatum, Format `YYYY-MM-DD HH:MM:SS` |
| `purpose` | string | string | Verwendungszweck der Transaktion |

Die Antwort enthält **nicht** den Status der Zuordnung (bestätigt oder nicht). Wer das
braucht, muss zweimal fragen: einmal mit `confirmed_only: false` und einmal mit `true`, und
die Mengen vergleichen.

### 10.3 Fehlerfälle

| HTTP | `error_code` | `message` | Bedeutung | Abhilfe |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Später erneut versuchen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder keine Rechte | `api_key` prüfen |
| 400 | 5 | `invalid receipt_id_by_customer specified` | Feld fehlt oder hat falsches Format | Ganze Zahl senden, ID über `/receipts/get` ermitteln |
| 400 | 6 | `no receipt found` | Kein Beleg mit dieser ID | ID prüfen, eventuell falscher Mandant |
| 400 | 7 | `invalid confirmed_only specified` | Kein gültiger Boolean | `true` oder `false` senden |
| 403 | 11 | `customer has no active status` | Mandant inaktiv | Mandantenstatus klären |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Erneut versuchen |

Ein Beleg ohne Zuordnung liefert vermutlich `rows: 0` und ein leeres `data`, nicht Code 6.
Code 6 bezieht sich auf den **Beleg**, nicht auf die Zuordnungen. **Nicht verifiziert**,
weil der getestete Beleg zugeordnet war.

### 10.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/receipts/assigned-transactions/get" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "<API_KEY>",
        "receipt_id_by_customer": 123,
        "confirmed_only": false
      }'
```

### 10.5 Live-Verifikation

Aufruf am 2026-09-12 mit `receipt_id_by_customer` als JSON-Zahl, HTTP 200. Antwort
**anonymisiert**:

```json
{
  "success": true,
  "message": "",
  "rows": 1,
  "data": [
    {
      "id_by_customer": 900,
      "to_from": "Beispiel GmbH",
      "amount": "-100.00",
      "booking_date": "2020-01-02 00:00:00",
      "value_date": "2020-01-02 00:00:00",
      "purpose": "Rechnungen Nr. RE-00-00000, RE-00-00001, RE-00-00002 vom 02.01.20, Beispiel GmbH"
    }
  ]
}
```

Abweichungen zur Spezifikation:

1. `id_by_customer` kommt als **Zahl** zurück, die Spezifikation deklariert `string`. Bei
   `/receipts/get` ist dasselbe Feld dagegen ein String. Die API ist in der Typisierung von
   IDs nicht konsistent.
2. Der Aufruf bestätigt, dass `receipt_id_by_customer` der korrekte Feldname ist und dass
   JSON-Zahlen akzeptiert werden. Das grenzt das Problem bei
   `/receipts/get/id_by_customer` (Abschnitt 4.5) auf jenen Endpunkt ein.
3. Der getestete Beleg über 100.00 (anonymisiert) war einer Sammel-Transaktion über
   mehrere Rechnungen zugeordnet. Belegbetrag und Transaktionsbetrag stimmen also **nicht**
   überein, und das Vorzeichen ist entgegengesetzt. Siehe Abschnitt 12.

---

## 11. `/receipts/add` gegenüber `/receipts/addBatch` gegenüber `/receipts/upload`

Die drei Endpunkte wirken austauschbar, sind es aber nicht. Sie bedienen drei verschiedene
Anwendungsfälle.

| Merkmal | `/receipts/add` | `/receipts/addBatch` | `/receipts/upload` |
| --- | --- | --- | --- |
| Anwendungsfall | Einen Beleg **ohne Datei** als reinen Datensatz anlegen, zum Beispiel aus einem Fremdsystem, dessen Belegdatei anderswo liegt | Viele Belege **ohne Datei** auf einmal anlegen, typischerweise Massenimport aus einem Vorsystem | Eine **Belegdatei** hochladen und von BuchhaltungsButler auswerten lassen |
| Datei | nein, nicht möglich | nein, nicht möglich | ja, Pflichtfeld `file` |
| Dateiübergabe | – | – | Base64-String im JSON-Body oder echter multipart-Upload. Bei Base64 ist `file_name` Pflicht (Code 33), bei multipart wird es ignoriert |
| Akzeptierte Dateitypen | – | – | `application/pdf`, `text/xml`, `application/xml`, `image/jpeg`, `image/png`, `image/bmp`, `image/tiff` |
| Größenbeschränkung | – | 50 Belege pro Aufruf (Code 5) | Dateigröße (Code 7) und Seitenzahl (Code 14) sind begrenzt, die Werte stehen **nicht** in der Spezifikation und werden erst zur Laufzeit in die Fehlermeldung eingesetzt |
| Pflichtfelder für Metadaten | `type`, `counterparty`, `invoice_number`, `date`, `amount`, `currency` | dieselben, je Element | nur `type`. Alles Übrige ist optional, weil es aus der Datei extrahiert wird |
| Metadaten bei E-Rechnung | – | – | `counterparty`, `invoice_number`, `date`, `amount`, `currency`, `vat_rate`, `payment_reference`, `date_delivery`, `date_payment_due` werden **ignoriert** |
| Antwort | `id_by_customer` auf oberster Ebene | `receipts` und `errors` als Arrays | `id_by_customer` **und** `filename` auf oberster Ebene |
| Teilerfolg möglich | nein | **ja**, `success: true` bei gleichzeitig gefülltem `errors` | nein |
| Eigenes Rate Limit | nein, nur das globale Limit von 100 pro Minute | **ja**, ein Request alle 5 Sekunden (Code 15) | **ja**, 10 Requests pro Minute (Code 15) |
| Zusätzliche Fehlerklassen | – | 5 (zu viele Belege), 6 (keine Belege) | 5, 6, 7, 12, 14, 15, 23, 31, 32, 33 rund um Datei, Kontingent und Verarbeitung |
| Verarbeitungsdauer | kurz | mittel, wächst mit der Anzahl | lang, OCR und E-Rechnungsauswertung. Timeout (Code 30) und 422-Fälle sind hier realistisch |

**Entscheidungsregel für Agenten**

1. Gibt es eine Belegdatei? Dann **immer** `/receipts/upload`. Ein über `/receipts/add`
   angelegter Beleg lässt sich nachträglich über keinen dokumentierten Endpunkt mit einer
   Datei versehen.
2. Keine Datei und genau ein Beleg? Dann `/receipts/add`.
3. Keine Datei und mehrere Belege? Dann `/receipts/addBatch`, in Blöcken zu höchstens 50
   und mit mindestens 5 Sekunden Abstand.
4. Mehrere Dateien? Es gibt **keinen** Batch-Upload. `/receipts/upload` muss einzeln
   aufgerufen werden, gedrosselt auf 10 pro Minute.

---

## 12. Verknüpfung von Belegen mit Transaktionen

Ein Beleg (Receipt) und eine Bankbewegung (Transaction) sind getrennte Objekte. Ihre
Beziehung ist der Kern der Buchhaltungslogik in BuchhaltungsButler.

### 12.1 Die Beziehung ist n zu m

Live bestätigt: Eine Transaktion kann mehrere Belege abdecken (Sammelüberweisung über drei
Rechnungen). Umgekehrt kann ein Beleg auf mehrere Transaktionen verteilt sein
(Teilzahlungen); `/receipts/assigned-transactions/get` liefert deshalb ein Array, nicht ein
einzelnes Objekt. Die Felder `amount_paid` und `amount_paid_fixed` in der Live-Antwort von
`/receipts/get` passen zu diesem Bild, sind aber undokumentiert.

Wichtige Folge: **Belegbetrag und Transaktionsbetrag müssen nicht übereinstimmen.** Live
beobachtet: Beleg über 100.00, zugeordnete Transaktion über -600.00 (Werte anonymisiert,
Größenverhältnis erhalten). Das Vorzeichen ist zusätzlich entgegengesetzt, weil
die Transaktion die Geldbewegung abbildet.

### 12.2 Vier Wege, wie eine Verknüpfung entsteht

| Weg | Endpunkt beziehungsweise Mechanismus | Einordnung |
| --- | --- | --- |
| Automatisch über die Zahlungsreferenz | Feld `payment_reference` bei `/receipts/add` und `/receipts/upload`. Bei korrekter Angabe ordnet das System den Beleg der passenden Transaktion zu. Unterstützt laut Spezifikation: Amazon-Bestellnummer, PayPal-Transaktions-ID, Stripe-Transaktions-ID | schreibend, implizit |
| Automatisch über einen Partnerbeleg | Feld `link_to_receipt_id_by_customer`. Wird einer der beiden Belege manuell einer Transaktion zugeordnet, folgt der andere automatisch | schreibend, implizit |
| Manuell, einzeln | `/transactions/assign/receipt` mit `transaction_id_by_customer` und `receipt_id_by_customer` | **schreibend**, nicht Teil dieses Dokuments |
| Manuell, mehrere | `/transactions/assign-batch/receipt` mit `transactions_to_receipts` | **schreibend**, nicht Teil dieses Dokuments |

Gelöst wird eine Zuordnung über `/transactions/unassign/receipt`. Sie schlägt fehl, wenn
eine bestätigte Buchung daran hängt (`Request_ErrorCode10`: "receipt could not be removed
from transaction, because of a confirmed posting.").

### 12.3 Wege, die Verknüpfung zu lesen

| Richtung | Endpunkt | Pflichtparameter |
| --- | --- | --- |
| Vom Beleg zu den Transaktionen | `/receipts/assigned-transactions/get` | `receipt_id_by_customer` |
| Von der Transaktion zu den Belegen | `/transactions/assigned-receipts/get` | `transaction_id_by_customer` |

Beide kennen `confirmed_only` und liefern jeweils nur die Gegenseite, nie den Status der
Zuordnung selbst.

### 12.4 Buchung als dritte Ebene

Über der Zuordnung liegt die Buchung (Posting). Relevante Endpunkte, alle **schreibend** und
nicht Gegenstand dieses Dokuments: `/postings/add/receipt`, `/postings/add-batch/receipts`,
`/postings/assign/receipt-to-free-posting`, `/postings/unconfirm/receipt`.

Zwei Konsequenzen für Beleg-Operationen:

1. **Fremdwährung.** `/postings/add/receipt` verlangt ausdrücklich, dass bei
   Fremdwährungsbelegen vorher `/receipts/get/id_by_customer` aufgerufen und der berechnete
   Betrag (`amount`, `amount_original`, `exchangerate`) ausgelesen wird.
2. **Löschsperren.** Bestätigte oder festgeschriebene Buchungen verhindern das Löschen eines
   Belegs (Codes 8 und 9 bei `/receipts/delete/id_by_customer`). Der Ausweg führt über
   `/postings/unconfirm/receipt`, also über einen weiteren schreibenden Eingriff.
3. Belegbuchungen setzen laut `/postings/add/receipt` voraus, dass Kreditoren- oder
   Debitorenbuchung für den Mandanten aktiviert ist.

---

## 13. Übergreifende Fallstricke

1. **`error_code` ist nur je Endpunkt eindeutig.** Dieselbe Zahl bedeutet an anderer Stelle
   etwas anderes. Fehlerbehandlung immer über das Paar (Pfad, `error_code`).
2. **Drei Antwortumschläge.** Listen liefern `success`/`message`/`rows`/`data`,
   Einzelabfragen `success`/`message`/`data` ohne `rows`, Schreiboperationen legen ihre
   Nutzdaten (`id_by_customer`, `filename`) auf die oberste Ebene, und `addBatch` hat mit
   `receipts`/`errors` einen eigenen vierten Umschlag.
3. **Feldnamen unterscheiden sich zwischen Schreiben und Lesen.**

   | Bedeutung | Beim Schreiben | Bei `/receipts/get` | Bei `/receipts/get/id_by_customer` |
   | --- | --- | --- | --- |
   | Rechnungsnummer | `invoice_number` | `invoicenumber` (auch als Filter) | `invoicenumber` |
   | Umsatzsteuersatz | `vat_rate` | nicht enthalten | `vat` |
   | Fälligkeitsdatum | `date_payment_due` | `due_date` (auch als Filter) | `date_payment_due` |
   | Leistungsdatum | `date_delivery` | laut Spezifikation `date_delivery`, **live aber `delivery_date`** | `date_delivery` |
   | Belegrichtung | implizit in `type` | `type` (Filter heißt `list_direction`) | `type` **und** `list_direction` |

4. **IDs sind mal String, mal Zahl.** `/receipts/get` liefert `id_by_customer` als String,
   `/receipts/assigned-transactions/get` als Zahl, Schreibantworten als String, Requests
   erwarten `integer`. Beim Parsen tolerant sein, beim Senden Zahl verwenden.
5. **`null` statt Leerstring.** Die Spezifikation deklariert alle Antwortfelder als
   `string`, live kommen optionale Felder als `null`. Streng typisierte Parser brechen sonst.
6. **`deleted: true` ist ein Umschalter, kein Zusatzfilter.** Er liefert ausschließlich
   gelöschte Belege.
7. **Datumsgrenzen sind inklusiv.** `date_from` und `date_to` schließen den angegebenen Tag
   ein. `due_date` ist dagegen ein exakter Gleichheitsfilter, kein Bereich.
8. **`date_since_last_modified` ohne Zeitanteil springt auf 23:59:59.** Wer nur das Datum
   angibt, verliert alle Änderungen desselben Tages vor 23:59:59. Für inkrementelle
   Synchronisation immer den vollen Zeitstempel senden.
9. **DATEV-Regel:** `date_delivery` darf nicht nach `date` liegen.
10. **Keine Idempotenz.** Kein Endpunkt kennt einen Idempotenzschlüssel. Nach Timeout oder
    500 muss vor jeder Wiederholung über `/receipts/get` geprüft werden, ob der Vorgang doch
    durchlief.
11. **Drei verschiedene Rate Limits.** 100 pro Minute global, 10 pro Minute für
    `/receipts/upload`, ein Aufruf alle 5 Sekunden für `/receipts/addBatch`.
12. **Die Spezifikation lässt Pflichtparameter weg.** Bei allen vier `.../id_by_customer`-
    Endpunkten fehlt das Feld für die Objekt-ID. Codegeneratoren erzeugen daraus
    funktionsunfähige Clients.
13. **`enum` in `definitions` sind Beispiele**, keine Wertemengen. Ausnahmen mit echten
    Mengen: `e_invoice_type` (`0`, `1`, `2`) und `file_type` (`pdf`, `xml`).
14. **Widersprüchliche Währungsangaben** zwischen `/receipts/add`, `/receipts/upload` und
    der Definition `Receipt`, siehe Abschnitt 5.5.
15. **`vat_rate` ist als `number` deklariert, erlaubt laut Text aber den Leerstring.**
16. Die Spezifikation verwendet HTML in Beschreibungstexten (`<br/>`, `<strong>`,
    `&ldquo;`). Wer Beschreibungen automatisch in MCP-Tool-Texte übernimmt, muss HTML
    entfernen und Entities dekodieren.

---

## 14. Hinweise für das MCP-Tool-Design

### 14.1 Sinnvoller Zuschnitt der Tools

| Tool | Endpunkt beziehungsweise Endpunkte | Begründung |
| --- | --- | --- |
| `belege_suchen` | `/receipts/get` | Der Einstieg in jeden Beleg-Workflow. Liefert die `id_by_customer`, ohne die nichts anderes geht |
| `beleg_details` | `/receipts/get/id_by_customer` | Einziger Zugang zu Fremdwährung, `e_invoice_type` und Dateiinhalt. **Erst freigeben, wenn der Aufruf verifiziert ist**, siehe 4.5 |
| `beleg_anlegen` | `/receipts/add` und `/receipts/upload` hinter einer Fassade **oder** zwei getrennte Tools | Siehe 14.2 |
| `belege_stapel_anlegen` | `/receipts/addBatch` | Eigenes Tool, weil Antwortformat, Teilerfolg und Drosselung abweichen |
| `beleg_loeschen` / `beleg_wiederherstellen` | `/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer` | Gegenstückpaar. Beide Tool-Texte müssen sagen, dass es sich um weiches Löschen handelt |
| `beleg_transaktionen` | `/receipts/assigned-transactions/get` | Gehört fachlich zu `/transactions/assigned-receipts/get`; beide sollten sich in den Beschreibungen gegenseitig nennen |

### 14.2 add gegenüber upload als Tool-Frage

Zwei vertretbare Entwürfe:

- **Ein Tool mit optionalem Dateiparameter.** Ist eine Datei dabei, wird `/receipts/upload`
  gerufen, sonst `/receipts/add`. Vorteil: Der Agent muss den Unterschied nicht kennen.
  Nachteil: Die Pflichtfelder unterscheiden sich (bei `add` sind `counterparty`,
  `invoice_number`, `date`, `amount`, `currency` Pflicht, bei `upload` nicht), das Schema
  kann das nicht sauber ausdrücken und die Validierung verlagert sich in die Laufzeit.
- **Zwei getrennte Tools** mit je korrektem Pflichtfeld-Schema und einem Querverweis im
  Beschreibungstext ("Wenn eine Belegdatei vorliegt, stattdessen `beleg_hochladen`
  verwenden"). Empfohlen, weil das Schema dann die Wahrheit sagt.

In beiden Fällen gilt: Der Beschreibungstext muss den Satz enthalten, dass ein ohne Datei
angelegter Beleg **nicht nachträglich** mit einer Datei versehen werden kann.

### 14.3 Mehrstufige Abläufe, die ein Agent kennen muss

1. **Beleg adressieren.** `/receipts/get` (Filter) liefert `id_by_customer`, erst dann sind
   Detail-, Lösch-, Wiederherstellungs- und Zuordnungsaufrufe möglich. Kein Endpunkt findet
   einen Beleg über Rechnungsnummer oder Dateiname direkt; die Rechnungsnummer ist nur
   Filter in `/receipts/get`.
2. **Gelöschte Belege wiederherstellen.** `/receipts/get` mit `deleted: true` aufrufen, ID
   ablesen, dann `/receipts/restore/id_by_customer`.
3. **Beleg löschen, der an einer bestätigten Buchung hängt.** Löschen scheitert mit Code 9,
   dann `/postings/unconfirm/receipt`, dann erneut löschen. Der Agent muss wissen, dass
   Schritt zwei ein zusätzlicher schreibender Eingriff in die Buchhaltung ist und
   Rückfrage verdient.
4. **Fremdwährungsbeleg verbuchen.** `/receipts/get/id_by_customer` für den umgerechneten
   Betrag, dann `/postings/add/receipt`.
5. **Konten validieren, bevor angelegt wird.** `account` über `/accounts/get`,
   `creditor_debtor` über `/settings/get/creditors` beziehungsweise
   `/settings/get/debtors`. Sonst laufen Anlegeversuche in die Codes 10 und 25.
6. **Massenimport ohne Dateien.** In Blöcke zu 50 teilen, zwischen den Aufrufen mindestens
   5 Sekunden warten, nach jedem Aufruf `errors` auswerten und die fehlgeschlagenen Elemente
   gesondert berichten, nicht stillschweigend erneut senden.
7. **Massenimport mit Dateien.** Einzelaufrufe, gedrosselt auf 10 pro Minute.
8. **Inkrementelle Synchronisation.** `date_since_last_modified` mit vollem Zeitstempel,
   dazu Paging über `limit`/`offset`, und ein zweiter Durchlauf mit `deleted: true`, um
   zwischenzeitlich gelöschte Belege zu erfassen.

### 14.4 Parameter, die Agenten erfahrungsgemäß falsch raten

Diese Felder brauchen ausführliche, wörtliche Beschreibungen im Tool-Schema:

| Parameter | Warum schwer zu raten | Was in die Beschreibung gehört |
| --- | --- | --- |
| `api_key` | Klingt nach einem Authentifizierungsschlüssel, ist aber die **Mandantenauswahl** im Body. Die eigentliche Authentifizierung läuft über Basic Auth | "Wählt den zu verwaltenden Mandanten aus. Nicht das API-Secret." Besser noch: aus dem Tool-Schema herausnehmen und serverseitig aus der Konfiguration setzen |
| `list_direction` | Zwei Werte, aber weder selbsterklärend noch deutsch | "inbound = Eingangsbelege (Rechnungen, die wir erhalten). outbound = Ausgangsbelege (Rechnungen, die wir stellen)." |
| `type` | Vier Werte mit Leerzeichen, kleingeschrieben, ohne Bindestrich | Alle vier Werte wörtlich auflisten, mit deutscher Entsprechung, und die exakte Schreibweise betonen |
| `id_by_customer` gegenüber `receipt_id_by_customer` | Derselbe Wert, zwei Feldnamen je nach Endpunkt | Im jeweiligen Tool nur den richtigen Namen anbieten und sagen, woher der Wert stammt (`/receipts/get`) |
| `deleted` | Wird als "auch gelöschte einschließen" missverstanden | "true liefert ausschließlich gelöschte Belege, nicht zusätzlich zu den aktiven." |
| `order` | Objekt statt String, Feldnamen weichen von den Antwortfeldern ab (`invoicingparty` statt `counterparty`) | Die vier erlaubten Schlüssel und die zwei Richtungen wörtlich nennen, ein Beispiel mitgeben |
| `date_since_last_modified` | Zeitanteil-Falle | "Ohne Uhrzeit wird 23:59:59 angenommen. Für Synchronisation immer mit Uhrzeit senden." |
| `due_date` | Wirkt wie eine Bereichsgrenze, ist ein Gleichheitsfilter | "Exaktes Fälligkeitsdatum, kein Zeitraum." |
| `account` | Verwechslungsgefahr mit `creditor_debtor` und mit Bankkonto-IDs | "Sachkontonummer eines Zahlungskontos, zum Beispiel 1200 für Bank. Liste über das Konten-Tool." |
| `creditor_debtor` | Ein Feld für zwei Rollen, abhängig von `type`, und nur bei aktivierter Funktion nutzbar | "Kreditor bei Eingangsrechnungen, Debitor bei Ausgangsrechnungen. Nur nutzbar, wenn die Funktion im Mandanten aktiviert ist." |
| `payment_reference` | Klingt nach Verwendungszweck, ist eine technische Transaktions-ID | "Amazon-Bestellnummer, PayPal- oder Stripe-Transaktions-ID. Kein Verwendungszweck-Freitext." |
| `link_to_receipt_id_by_customer` | Wirkt wie eine Belegnummer im Sinne der Rechnungsnummer | "id_by_customer eines anderen Belegs desselben Mandanten. Beide Belege werden gemeinsam zugeordnet." |
| `file` und `file_name` | Zwei Übergabewege, `file_name` mal Pflicht mal ignoriert | "Datei als Base64-String. file_name ist dann Pflicht, inklusive Endung." |
| `vat_rate` | Zahl oder Leerstring | "19.00 oder 0. Leerstring bedeutet: kein oder mehrere Steuersätze." |
| `currency` | Widersprüchliche Doku | Konservativ auf EUR vorbelegen und die Unsicherheit dokumentieren |
| `confirmed_only` | Unklar, worauf sich "bestätigt" bezieht | "Nur bestätigte Zuordnungen zwischen Beleg und Transaktion." |

### 14.5 Sicherheitsleitplanken

- Schreibende Tools (`/receipts/add`, `/receipts/addBatch`, `/receipts/upload`,
  `/receipts/delete/id_by_customer`, `/receipts/restore/id_by_customer`) berühren die echte
  Buchhaltung. Sie gehören hinter eine ausdrückliche Freigabe, zum Beispiel einen
  Nur-Lesen-Modus als Voreinstellung.
- Löschen kann fachlich gesperrt sein (Codes 8 und 9). Das Tool darf die Sperre nicht durch
  einen automatischen `unconfirm`-Aufruf umgehen.
- Kein Endpunkt ist idempotent. Automatische Wiederholungen bei Timeout müssen unterbunden
  oder durch eine vorherige Existenzprüfung abgesichert werden.
- `file_content` aus `/receipts/get/id_by_customer` kann sehr groß sein. Es darf nicht
  unbesehen in den Modellkontext gelangen; sinnvoller ist das Ablegen als Datei mit
  Rückgabe des Pfads.
- Antwortdaten sind echte Geschäftsdaten. Logging muss das berücksichtigen.

---

## 15. Zusammenfassung: Live festgestellte Abweichungen von der Spezifikation

Alle Punkte am 2026-09-12 gegen `https://webapp.buchhaltungsbutler.de/api/v1` geprüft.

| Nr. | Endpunkt | Abweichung | Bewertung |
| --- | --- | --- | --- |
| 1 | `/receipts/get` | Antwortfeld heißt **`delivery_date`**, Spezifikation sagt `date_delivery` | Bestätigt. Bricht jeden generierten Client |
| 2 | `/receipts/get` | Undokumentierte Antwortfelder **`amount_paid`** und **`amount_paid_fixed`** | Bestätigt |
| 3 | `/receipts/get` | Optionale Felder kommen als **`null`**, nicht als Leerstring, obwohl alle Felder als `string` deklariert sind | Bestätigt |
| 4 | `/receipts/assigned-transactions/get` | `id_by_customer` kommt als **Zahl**, Spezifikation sagt `string`. Bei `/receipts/get` ist dasselbe Feld ein String | Bestätigt |
| 5 | `/receipts/get/id_by_customer` | Kein erfolgreicher Aufruf möglich. `id_by_customer` als Zahl, als String, als `receipt_id_by_customer` und formularkodiert ergeben alle `error_code` 5 | Bestätigt als Problem, **Ursache ungeklärt** |
| 6 | Alle `.../id_by_customer`-Endpunkte | Die Spezifikation listet den Pflichtparameter für die Objekt-ID überhaupt nicht | Bestätigt durch Vergleich der Parameterlisten |
| 7 | `/receipts/add` | Die Antworten 500 und 504 verweisen per `$ref` auf `ReceiptsUpload_ErrorCode0`/`30`, obwohl gleichnamige `ReceiptsAdd_`-Definitionen existieren | Nur ein Spezifikationsmangel, inhaltlich folgenlos |
| 8 | `/receipts/get` | Parameter `order` ist als Objekt mit Schlüssel `field` modelliert, tatsächlich ist der Schlüssel der Feldname | Nur aus der Textbeschreibung erkennbar, nicht live geprüft |

---

## 16. Offene Punkte, nicht verifiziert

Die folgenden Aussagen konnten weder aus der Spezifikation noch aus einem Live-Test belegt
werden. Sie sind vor der Implementierung zu klären.

1. **Aufrufform von `/receipts/get/id_by_customer`, `/receipts/delete/id_by_customer` und
   `/receipts/restore/id_by_customer`.** Der Feldname der Beleg-ID ist unbekannt. Ungetestete
   Hypothese: ein Array, also `{"api_key": "...", "id_by_customer": [123]}`. Das ist der
   wichtigste offene Punkt; drei von acht Endpunkten dieses Dokuments hängen daran.
2. **Maximale Dateigröße und maximale Seitenzahl bei `/receipts/upload`.** Nicht beziffert,
   nur zur Laufzeit aus den Meldungen zu Code 7 und Code 14 ablesbar. Ob sich die
   Größengrenze auf die Rohdatei oder auf den Base64-String bezieht, ist offen.
3. **Der multipart-Feldname bei `/receipts/upload`.** `file` ist die naheliegende Lesart,
   nicht belegt. Ebenso ist offen, ob der Endpunkt multipart und JSON gleichermaßen
   akzeptiert.
4. **Zuordnung `credit inbound` und `credit outbound` zu `list_direction`.** Nur für
   `invoice inbound` unter `inbound` live beobachtet.
5. **Suchverhalten von `counterparty` und `invoicenumber` in `/receipts/get`**: exakter
   Treffer oder Teiltreffer, Groß- und Kleinschreibung.
6. **Verhalten von `include_offers`.** Was genau ein "Angebot" in der Antwort ist und
   woran man es erkennt, geht aus der Spezifikation nicht hervor.
7. **Zeitpunkt der Datenextraktion nach `/receipts/upload`.** Ob Betrag, Datum und
   Rechnungsnummer unmittelbar nach der Antwort schon gefüllt sind, ist offen.
8. **Struktur von `request_data` in der `errors`-Liste von `/receipts/addBatch`** und die
   Zuordnung von Eingabe- zu Ausgabeelement.
9. **Erlaubte Währungen.** Drei widersprüchliche Angaben, siehe 5.5.
10. **Verhalten von `/receipts/assigned-transactions/get` bei einem Beleg ohne
    Zuordnungen**: leeres `data` mit `rows: 0` oder `error_code` 6.
11. **Ob `get_file: true` tatsächlich `file_content` und `file_type` füllt** und wie sich
    das auf Antwortgröße und Timeout auswirkt.
12. **Ob `/receipts/upload` bei E-Rechnungen auch `account`, `creditor_debtor` und
    `link_to_receipt_id_by_customer` ignoriert.** Für diese Felder fehlt der Hinweis, für
    die übrigen Metadatenfelder steht er da.
13. **Alle schreibenden Endpunkte** dieses Dokuments (`/receipts/add`, `/receipts/addBatch`,
    `/receipts/upload`, `/receipts/delete/id_by_customer`,
    `/receipts/restore/id_by_customer`) sind ausschließlich aus der Spezifikation
    dokumentiert. Sie wurden bewusst **nicht** live getestet, weil es sich um die echte
    Produktivbuchhaltung handelt. Alle Angaben zu ihnen stehen unter dem Vorbehalt der
    Abweichungen, die bei den lesenden Endpunkten nachweislich vorkommen.
