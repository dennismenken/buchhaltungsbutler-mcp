# Rechnungen (Invoices)

Referenzdokument für die drei Rechnungs-Endpunkte der BuchhaltungsButler-API v1.
Zielgruppe: Implementierungs-Agenten des MCP-Servers.

**Quellen dieses Dokuments**

| Quelle | Art | Abrufdatum |
| --- | --- | --- |
| `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json` (Swagger 2.0, API-Version 1.9.1, Original: `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`) | Primärquelle für alle Parameter, Antworten und Fehlercodes | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/11454209365661-Rechnungen-Angebote-und-Gutschriften-erstellen` | Hilfecenter, fachliches Verhalten der Rechnungsstellung und der E-Rechnung | 2026-09-12 |
| `https://wissen.buchhaltungsbutler.de/hc/de/articles/20227969805853-E-Rechnungen-XRechnung-und-Zugferd` | Hilfecenter, unterstützte E-Rechnungsformate | 2026-09-12 |
| `https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/steuerrecht/umsatzsteuer-national/e-rechnungspflicht-ab-2025-6055774` | Rechtslage E-Rechnungspflicht Deutschland | 2026-09-12 |
| `https://kostenlose-erechnung.de/ratgeber/xrechnung-bt-felder-uebersicht/` | Sekundärquelle zu EN-16931-Pflichtfeldern (BT-Nummern) | 2026-09-12 |
| Eigene Live-Aufrufe gegen `https://webapp.buchhaltungsbutler.de/api/v1` (nur lesende Endpunkte) | Verifikation des Antwortformats | 2026-09-12 |

**Wichtige Einschränkung zur Verifikation:** Alle drei hier dokumentierten Endpunkte sind
schreibend und erzeugen echte Buchhaltungsdaten. Sie wurden deshalb **nicht** live aufgerufen.
Jede Aussage über das Laufzeitverhalten dieser drei Endpunkte stammt aus der Spezifikation
oder aus dem Hilfecenter und ist als solche gekennzeichnet. Live verifiziert wurden nur
lesende Nachbarendpunkte, die zeigen, wie eine erzeugte Rechnung anschließend sichtbar wird.

---

## 1. Überblick und Einordnung

| Endpunkt | Fachliche Wirkung | Einordnung | Parameteranzahl laut Spezifikation |
| --- | --- | --- | --- |
| `/invoices/create` | Erzeugt ein finales Ausgangsdokument (Rechnung, Gutschrift oder Angebot) inklusive PDF und legt es als Ausgangsbeleg an | **SCHREIBEND** | 33 |
| `/invoices/create/e-invoice` | Erzeugt dasselbe, zusätzlich als E-Rechnung nach EN 16931 mit strukturierten Steuerkategorien und Käuferreferenz | **SCHREIBEND** | 35 |
| `/invoices/create/draft` | Legt einen Rechnungsentwurf an, der in der Oberfläche weiterbearbeitet und später finalisiert wird | **SCHREIBEND** | 30 |

Prüfkommando für die Parameteranzahl:

```bash
jq '.paths["/invoices/create"].post.parameters | length' docs/openapi/buchhaltungsbutler-v1.json
jq '.paths["/invoices/create/e-invoice"].post.parameters | length' docs/openapi/buchhaltungsbutler-v1.json
jq '.paths["/invoices/create/draft"].post.parameters | length' docs/openapi/buchhaltungsbutler-v1.json
```

Alle drei Endpunkte sind irreversibel im Sinne der API: Die Spezifikation enthält **keinen**
Endpunkt zum Lesen, Ändern, Stornieren oder Löschen von Rechnungen, Entwürfen oder Angeboten.
Die vollständige Pfadliste enthält unter `/invoices/` ausschließlich die drei Create-Pfade.
Eine über die API erzeugte Rechnung kann also nur noch über die Weboberfläche korrigiert oder
storniert werden, oder indirekt über `/receipts/delete/id_by_customer`, sofern die
zurückgelieferte `id_by_customer` verwendet wird (dieser Weg ist nicht verifiziert und löscht
den Beleg, nicht das Rechnungsdokument).

### 1.1 Der Unterschied zwischen create, draft und e-invoice

| Merkmal | `/invoices/create` | `/invoices/create/e-invoice` | `/invoices/create/draft` |
| --- | --- | --- | --- |
| Ergebnis | Finales Dokument mit PDF | Finales Dokument mit PDF und strukturiertem E-Rechnungsdatensatz | Entwurf, kein finales Dokument |
| Rechnungsnummer wird vergeben | ja | ja | nein (Antwort enthält keine) |
| Antwort enthält `id_by_customer`, `invoicenumber`, `file_name` | ja | ja | **nein**, nur `success` und `message` |
| Parameter `invoicenumber` setzbar | ja | ja | **nein** |
| Parameter `due_days` setzbar | ja | ja (Default `0`) | **nein** |
| Parameter `payment_reference` setzbar | ja | ja | **nein** |
| Steuerangabe je Position | `item_vat` (Prozentsatz) | `item_tax_type` (Steuerkategorie) **und** `item_tax_amount` (Prozentsatz) | `item_vat` (Prozentsatz) |
| Empfängeradresse | optional | **Pflicht** (street, zip, city, country, email) | optional |
| Käuferreferenz `e_invoice_id` | nicht vorhanden | **Pflicht** | nicht vorhanden |
| Fehlerfall „upload limit erreicht“ (403/33) dokumentiert | ja | ja | **nein** |
| Wird zum Ausgangsbeleg | ja (Hilfecenter: „erscheint im Bereich Rechnungsausgang und wird als Ausgangsbeleg erfasst“) | ja, Annahme analog zu `/invoices/create`, nicht verifiziert | nein, Annahme, nicht verifiziert |

Kurz gefasst: `draft` ist eine abgespeckte Variante von `create` ohne Nummernvergabe und ohne
Dokumenterzeugung. `e-invoice` ist eine erweiterte Variante von `create` mit strengeren
Pflichtfeldern und einem normkonformen Steuermodell.

**Widerspruch zwischen Spezifikation und Hilfecenter zum Entwurf:** Das Hilfecenter schreibt
zu Entwürfen wörtlich „Bitte beachten Sie, dass Entwürfe **ohne Rechnungsdatum und -nummer**
gespeichert werden. Diese Daten werden erst mit dem Erstellen der Rechnung final vergeben.“
Die API verlangt für `/invoices/create/draft` jedoch `date` als Pflichtfeld. Ob das übergebene
Datum im Entwurf gespeichert, ignoriert oder erst beim Finalisieren überschrieben wird, ist
**nicht verifiziert**.

---

## 2. Gemeinsame Grundlagen aller drei Endpunkte

### 2.1 Transport und Authentifizierung

| Aspekt | Wert |
| --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` |
| HTTP-Methode | immer `POST`, auch für lesende Endpunkte |
| Content-Type | `application/json` |
| Authentifizierung | HTTP Basic Auth, Benutzername = API Client, Passwort = API Secret |
| Mandantenauswahl | Pflichtfeld `api_key` im JSON-Body, zusätzlich zu Basic Auth |
| Rate Limit | laut Dokumentation maximal 100 Requests pro Mandant und Minute |

Diese Angaben wurden vom Orchestrator gegen die Live-API verifiziert (2026-09-12).

**Hinweis zur Spezifikationsdatei:** `basePath` enthält in der JSON-Datei eine vollständige
URL (`https://webapp.buchhaltungsbutler.de/api/v1`) statt eines Pfades. Das ist nach
Swagger 2.0 unzulässig. Generatoren, die `host` + `basePath` zusammensetzen, erzeugen daraus
eine kaputte URL. Die korrekte Basis-URL ist der Wert von `basePath` selbst.

### 2.2 Antwortumschlag

Erfolg:

```json
{
  "success": true,
  "message": "",
  "id_by_customer": "123",
  "invoicenumber": "RE-1001",
  "file_name": "2026-09-12_Rechnung_RE-1001_<hash>"
}
```

Fehler:

```json
{
  "success": false,
  "error_code": 13,
  "message": "invalid company_name specified"
}
```

Das Feld `error_code` ist ein Integer, `message` ein englischer Klartext. Der HTTP-Status
trägt zusätzliche Information (401, 403, 400, 500, 504) und ist in der Spezifikation in den
Response-Schlüsseln in der Form `"400 (13)"` kodiert, also HTTP-Status plus Fehlercode.

### 2.3 Positionen werden als parallele Arrays übergeben

Es gibt **kein** Array von Positionsobjekten. Stattdessen wird jede Eigenschaft der Positionen
als eigenes Array übergeben, und die Zuordnung erfolgt über den Index.

```json
{
  "item_name":         ["Beratung",  "Lizenz"],
  "item_description":  ["Workshop",  "Jahreslizenz"],
  "item_amount":       ["10",        "1"],
  "item_unit":         ["Std.",      "Stk."],
  "item_single_price": ["120.00",    "499.00"],
  "item_vat":          ["19",        "19"]
}
```

Position 0 ist also „10 Std. Beratung zu 120,00 mit 19 % USt“.

Die Spezifikation sagt **nicht**, ob alle Arrays dieselbe Länge haben müssen, was bei
unterschiedlicher Länge passiert und ob `item_description` bei Verwendung für jede Position
befüllt sein muss. **Annahme:** gleiche Länge für alle übergebenen Item-Arrays; für nicht
benötigte Beschreibungen ein leerer String an der jeweiligen Position. Nicht verifiziert.

**Fallstrick `item_amount`:** Trotz des Namens ist das die **Menge**, nicht der Betrag. Die
Beispiele der Spezifikation belegen das: `"item_amount": ['10','20']` zusammen mit
`"item_unit": ['Std.','Stk.']`. Der Preis steht in `item_single_price`. Ein Agent, der
`item_amount` mit dem Rechnungsbetrag füllt, erzeugt eine fachlich falsche Rechnung, ohne
dass die API einen Fehler meldet.

### 2.4 Datumsformate

| Feld | Format laut Spezifikation |
| --- | --- |
| `date` | kein Format angegeben |
| `date_of_supply` | Freitext möglich, aber „when the date AND the date_of_supply is specified in the format \"YYYY-MM-DD\"“ |
| `recurring_date_next` | kein Format angegeben |

Die Spezifikation nennt für `date` und `recurring_date_next` **kein** Format. Aus dem
Hinweistext bei `date_of_supply` folgt, dass `YYYY-MM-DD` für `date` unterstützt wird.
Alle anderen Endpunkte der API (zum Beispiel `/receipts/add`, `/receipts/get`) verwenden
durchgängig `'YYYY-MM-DD'`. Der live gelesene Ausgangsbeleg enthält `date: "2021-06-09"`.

**Empfehlung:** immer `YYYY-MM-DD` senden. Das abweichende Format `TT.MM.JJJJ`, das das
Hilfecenter für das Liefer-/Leistungsdatum in der Weboberfläche nennt, gilt für die
Eingabemaske, nicht belegbar für die API. Nicht verifiziert.

**Fallstrick `date_of_supply`:** Zwei Wirkungen in einem Feld. Als Freitext erscheint der Wert
nur auf dem PDF. Nur wenn sowohl `date` als auch `date_of_supply` im Format `YYYY-MM-DD`
vorliegen, wird `date_of_supply` zusätzlich als `date_delivery` des entstehenden Belegs
übernommen. Zusätzlich gilt laut Spezifikation: „Due to the DATEV compatibility, we cannot
accept a date_of_supply that is after the invoice date. In that case it will be ignored!“
Ein Leistungsdatum nach dem Rechnungsdatum wird also **stillschweigend verworfen**, ohne
Fehlermeldung.

### 2.5 Betragsformate und Vorzeichen

- Preise und Prozentsätze werden laut Spezifikation als **Strings** in Arrays übergeben
  (`['20', '19.99']`, `['7', '19']`).
- Dezimaltrennzeichen ist der Punkt.
- Umsatzsteuersätze sind „floating point numbers between 0 and 100“, also `19` für 19 Prozent,
  nicht `0.19`.
- Die Spezifikation nennt **keine** Vorzeichenkonvention für Gutschriften. Ob bei
  `type: "credit"` positive Beträge erwartet werden und das Vorzeichen aus dem Typ folgt, ist
  **nicht verifiziert**. Zum Vergleich: `/receipts/add` erlaubt ausdrücklich negative Beträge
  („can be negative to indicate a reversed payment“), die Invoice-Endpunkte sagen dazu nichts.
  **Annahme:** positive Beträge, das Vorzeichen ergibt sich aus `type`.

### 2.6 Währung

Die drei Rechnungs-Endpunkte haben **keinen** Währungsparameter. Zum Vergleich: `/receipts/add`
und `/transactions/add` besitzen jeweils ein `currency`-Feld, `/receipts/upload` verlangt dort
`EUR`. Der einzige Währungshinweis in den Rechnungsparametern ist der zulässige Wert `EUR` bei
`discount_type`.

**Schlussfolgerung:** Über die API erzeugte Rechnungen sind auf **Euro** festgelegt.
Fremdwährungsrechnungen sind über diese Endpunkte nicht möglich. Diese Schlussfolgerung ergibt
sich aus dem fehlenden Parameter, ist aber **nicht durch eine explizite Aussage der
Dokumentation belegt**.

### 2.7 Rabatt

`discount_type` und `discount_value` gelten für die **gesamte** Rechnung, nicht je Position.
Positionsrabatte sind über die API nicht abbildbar; sie müssten im Einzelpreis oder in der
Positionsbeschreibung eingerechnet werden.

- `discount_type`: `percent` oder `EUR`
- `discount_value`: der Wert, als String

Die Spezifikation sagt nicht, ob `discount_value` ohne `discount_type` gültig ist oder was der
Default für `discount_type` ist. **Annahme:** beide Felder gemeinsam setzen. Nicht verifiziert.

### 2.8 Zahlungsbedingungen und Fälligkeit

| Feld | Bedeutung | Verfügbar in |
| --- | --- | --- |
| `payment_conditions` | Freitext der Zahlungsbedingungen, erscheint auf dem Dokument | create, e-invoice, draft |
| `due_days` | Anzahl Tage zwischen Rechnungsdatum und Fälligkeit, numerisch als String | create, e-invoice |
| `final_provisions` | Schlusstext des Dokuments | create, e-invoice, draft |
| `correspondence` | Anschreiben bzw. Einleitungstext an den Empfänger | create, e-invoice, draft |

`payment_conditions` ist Freitext und wird **nicht** in eine maschinenlesbare Fälligkeit
übersetzt. Nur `due_days` erzeugt ein Fälligkeitsdatum. Bei `/invoices/create` ist für
`due_days` **kein** Default dokumentiert, bei `/invoices/create/e-invoice` ist der Default
ausdrücklich `0` („If not specified due date will be set to invoice date“). Ob `/invoices/create`
sich genauso verhält, ist **nicht verifiziert**. Für `/invoices/create/draft` existiert das
Feld überhaupt nicht.

### 2.9 Wiederkehrende Rechnungen

`recurring_interval` (`weekly`, `monthly`, `quarterly`, `yearly`) zusammen mit
`recurring_date_next` legt einen Rechnungsplan an. Das Hilfecenter beschreibt das Verhalten:
„Mit dem Anlegen des Rechnungsplans wird die erste Rechnung unmittelbar erstellt, die nächste
zum definierten Datum, ab dann immer im definierten Intervall.“

Das heißt: Ein Aufruf mit `recurring_interval` erzeugt **sofort eine Rechnung und zusätzlich
einen dauerhaften Rechnungsplan**, der ohne weiteres Zutun weiter Rechnungen erzeugt. Es gibt
in der API **keinen** Endpunkt, um einen Rechnungsplan zu lesen, zu deaktivieren oder zu
löschen. Das geht nur in der Weboberfläche unter „Rechnungsstellung“ → „Wiederkehrende
Rechnungen“.

`recurring_date_next` ist Pflicht, sobald `recurring_interval` gesetzt ist. Die Spezifikation
markiert beide Felder formal als `required: false`; die Abhängigkeit steht nur im Fließtext.

### 2.10 Sprache

`language` steuert die übersetzbaren Beschriftungen des Dokuments (Überschriften,
Tabellenköpfe, Zahlungsbedingungen). Erlaubte Werte laut Fehlermeldung 44: `de_DE`, `en_US`.
Default `de_DE`. Die inhaltlichen Texte (Positionsnamen, Anschreiben) werden **nicht** übersetzt.

### 2.11 Stammdaten des eigenen Unternehmens

Absenderdaten, Logo, Farben, Bankverbindung und Nummernkreise werden **nicht** über die API
übergeben, sondern stammen aus den Unternehmensdaten und Rechnungseinstellungen des Mandanten.
`show_bankdata` und `show_contactdata` steuern lediglich, ob diese hinterlegten Daten auf dem
Dokument erscheinen.

Für E-Rechnungen verlangt das Hilfecenter zusätzlich, dass in den Unternehmensdaten hinterlegt
sind: Straße und Hausnummer, Postleitzahl, Ort, Land sowie Steuernummer oder USt-IdNr.
Empfohlen werden außerdem Registergericht, Registernummer, Inhaber sowie IBAN, BIC und
Kreditinstitut. Fehlen diese Angaben, ist **nicht verifiziert**, ob die API den Aufruf mit
einem Fehler ablehnt oder ein unvollständiges Dokument erzeugt.

---

## 3. `/invoices/create`

**Fachliche Wirkung:** Erzeugt für den über `api_key` gewählten Mandanten ein finales
Ausgangsdokument (Rechnung, Gutschrift oder Angebot) mit PDF und Rechnungsnummer.

**Einordnung: SCHREIBEND.** Der Aufruf erzeugt ein rechtsverbindliches Dokument, vergibt eine
fortlaufende Nummer aus dem Nummernkreis des Mandanten und legt einen Ausgangsbeleg an. Es gibt
keinen Rückgängig-Endpunkt. Ein Aufruf mit `recurring_interval` erzeugt zusätzlich einen
dauerhaften Rechnungsplan.

Quelle: `docs/openapi/buchhaltungsbutler-v1.json`, `.paths["/invoices/create"]`, Abrufdatum 2026-09-12.

### 3.1 Parameter (33 von 33)

#### Pflichtparameter

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des zu verwaltenden Mandanten, wählt den Mandanten aus | vom Mandanten vergeben | opaker String |
| `type` | string | ja | – | Dokumentart | `invoice` (Rechnung), `credit` (Gutschrift), `offer` (Angebot) | Kleinbuchstaben |
| `show_prices_type` | string | ja | – | Ob die Preise als Netto- oder Bruttopreise zu verstehen und darzustellen sind | `net` (Netto), `gross` (Brutto) | Kleinbuchstaben |
| `company_name` | string | ja | – | Firmenname des Empfängers | Freitext | – |
| `date` | string | ja | – | Rechnungsdatum | gültiges Datum | Format nicht spezifiziert, `YYYY-MM-DD` empfohlen (siehe 2.4) |
| `item_name` | array | ja | – | Bezeichnungen der Positionen | Array von Strings | `["Item 1", "Item 2"]` |
| `item_amount` | array | ja | – | **Mengen** der Positionen, nicht Beträge | Array von Zahlen als String | `["10", "20"]` |
| `item_unit` | array | ja | – | Einheiten der Positionen | Array von Strings, Freitext | `["Std.", "Stk."]` |
| `item_vat` | array | ja | – | Umsatzsteuersätze der Positionen in Prozent | Gleitkommazahlen zwischen 0 und 100 | `["7", "19"]` |
| `item_single_price` | array | ja | – | Einzelpreise der Positionen | Array von Dezimalzahlen als String | `["20", "19.99"]` |

#### Optionale Parameter

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `contact_person_name` | string | nein | – | Ansprechpartner beim Empfänger | Freitext, wird validiert wenn gesetzt | – |
| `street` | string | nein | – | Straße des Empfängers | Freitext, wird validiert wenn gesetzt | – |
| `additional_addressline` | string | nein | – | Adresszusatz des Empfängers | Freitext, wird validiert wenn gesetzt | – |
| `zip` | string | nein | – | Postleitzahl des Empfängers | wird validiert wenn gesetzt | – |
| `city` | string | nein | – | Ort des Empfängers | wird validiert wenn gesetzt | – |
| `country` | string | nein | – | Land des Empfängers | **nur** deutscher Ländername (`Dänemark`) **oder** zweistelliger ISO-Code (`DK`) | ISO 3166-1 alpha-2 oder deutscher Name |
| `email` | string | nein | – | E-Mail-Adresse für den Rechnungsversand | gültige E-Mail-Adresse | RFC-konform |
| `recurring_interval` | string | nein | – | Intervall für wiederkehrende Rechnungen; erzeugt einen dauerhaften Rechnungsplan | `weekly`, `monthly`, `quarterly`, `yearly` | Kleinbuchstaben |
| `recurring_date_next` | string | nein | – | Datum der nächsten Ausführung; **Pflicht, sobald `recurring_interval` gesetzt ist** | gültiges Datum | Format nicht spezifiziert, `YYYY-MM-DD` empfohlen |
| `date_of_supply` | string | nein | – | Liefer- oder Leistungsdatum bzw. -zeitraum; wird als `date_delivery` des Belegs übernommen, wenn `date` und `date_of_supply` beide `YYYY-MM-DD` sind | Freitext oder Datum; darf **nicht** nach `date` liegen, sonst stillschweigend ignoriert | Freitext oder `YYYY-MM-DD` |
| `invoicenumber` | string | nein | automatische BHB-Nummer | Eigene Rechnungsnummer statt der automatisch vergebenen | wird validiert wenn gesetzt | – |
| `correspondence` | string | nein | – | Anschreiben bzw. Einleitungstext an den Empfänger | Freitext, wird validiert wenn gesetzt | – |
| `discount_type` | string | nein | – | Art des Gesamtrabatts | `percent`, `EUR` | exakte Schreibweise, `EUR` in Großbuchstaben |
| `discount_value` | string | nein | – | Höhe des Gesamtrabatts | Zahl als String | Dezimalpunkt |
| `payment_conditions` | string | nein | – | Zahlungsbedingungen als Freitext auf dem Dokument | Freitext, wird validiert wenn gesetzt | – |
| `due_days` | string | nein | nicht dokumentiert | Anzahl Tage zwischen Rechnungsdatum und Fälligkeit | ganze Zahl als String | – |
| `final_provisions` | string | nein | – | Schlusstext des Dokuments | Freitext, wird validiert wenn gesetzt | – |
| `show_bankdata` | boolean | nein | `false` | Bankverbindung aus den Stammdaten auf dem Dokument anzeigen | `true`, `false` | in der Spezifikation als Typ boolean mit dem String-Default `"false"` deklariert |
| `show_contactdata` | boolean | nein | `false` | Kontaktdaten aus den Stammdaten auf dem Dokument anzeigen | `true`, `false` | siehe `show_bankdata` |
| `item_description` | array | nein | – | Beschreibungstexte je Position | Array von Strings, indexparallel zu `item_name` | `["Beschreibung 1", "Beschreibung 2"]` |
| `customer_number` | string | nein | – | Kundennummer des Empfängers | wird validiert wenn gesetzt | – |
| `payment_reference` | string | nein | – | Zahlungsreferenz; bei korrekter Angabe wird der entstehende Beleg automatisch mit der passenden Transaktion abgeglichen | aktuell unterstützt: Amazon-Order-ID, PayPal-Transaktions-ID, Stripe-Transaktions-ID | Format des jeweiligen Anbieters |
| `language` | string | nein | `de_DE` | Sprache der übersetzbaren Dokumentbeschriftungen | `de_DE`, `en_US` | exakte Schreibweise mit Unterstrich |

### 3.2 Verschachtelte Objekt- und Array-Parameter

Verschachtelte **Objekte** gibt es bei diesem Endpunkt nicht. Alle sechs Array-Parameter
(`item_name`, `item_amount`, `item_unit`, `item_vat`, `item_single_price`, `item_description`)
sind flache Arrays von Strings und werden über ihren Index einander zugeordnet. Die innere
Struktur einer logischen Position ergibt sich also erst aus der Kombination:

```text
Position i = {
  name:         item_name[i],
  description:  item_description[i],   // optional
  quantity:     item_amount[i],
  unit:         item_unit[i],
  unit_price:   item_single_price[i],
  vat_percent:  item_vat[i]
}
```

### 3.3 Erfolgsantwort

Schema `InvoicesCreate_Success`. Die in der Spezifikation hinterlegten `enum`-Werte mit genau
einem Eintrag sind **Beispielwerte**, keine erlaubten Wertemengen.

| Feld | Typ | Bedeutung | Beispielwert aus der Spezifikation |
| --- | --- | --- | --- |
| `success` | boolean | Erfolgskennzeichen | `true` |
| `message` | string | leer im Erfolgsfall | `""` |
| `id_by_customer` | string | mandanteneigene ID des entstandenen **Belegs**; identisch mit `id_by_customer` in `/receipts/get` und damit der Schlüssel für alle Folgeoperationen | `"123"` |
| `invoicenumber` | string | die tatsächlich vergebene Rechnungsnummer, entweder die übergebene oder die automatisch erzeugte | `"123"` |
| `file_name` | string | Dateiname des erzeugten Dokuments | `"file123"` |

Ein `rows`-Feld gibt es hier nicht; das tragen nur die lesenden Endpunkte.

**Live beobachtetes Format von `file_name` (anonymisiert):** Über `/receipts/get` mit
`list_direction: "outbound"` gelesene Ausgangsbelege des Testmandanten tragen Dateinamen nach
dem Muster `JJJJ-MM-TT_Rechnung_<Rechnungsnummer>_<32-stelliger Hex-Hash>`, zum Beispiel
`2021-06-09_Rechnung_RE-1002_ace2601b4eb829450fcb4d4cb6b3741f`. Ob diese Belege über die API
oder über die Weboberfläche entstanden sind, ist **nicht verifiziert**; das Muster ist daher
nur ein Indiz für die Struktur von `file_name`.

### 3.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Nicht automatisch wiederholen; der Aufruf ist schreibend und könnte teilweise gewirkt haben. Erst über `/receipts/get` prüfen, ob die Rechnung entstanden ist. |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Zugangsdaten (API Client / API Secret) falsch | Zugangsdaten prüfen; nicht wiederholen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder ohne Berechtigung für diesen Mandanten | `api_key` prüfen; korrekten Mandanten wählen |
| 400 | 5 | `invalid type specified` | `type` nicht `invoice`, `credit` oder `offer` | Wert korrigieren |
| 400 | 6 | `no items specified` | Keine Positionen übergeben oder Positionsarrays leer | Mindestens eine Position senden |
| 400 | 7 | `invalid show_prices_type specified` | `show_prices_type` nicht `net` oder `gross` | Wert korrigieren |
| 400 | 8 | `invalid recurring_interval specified` | `recurring_interval` nicht `weekly`, `monthly`, `quarterly`, `yearly` | Wert korrigieren |
| 400 | 9 | `invalid recurring_date_next specified` | `recurring_date_next` fehlt oder ist kein gültiges Datum, obwohl `recurring_interval` gesetzt ist | Datum ergänzen bzw. korrigieren |
| 400 | 10 | `invalid show_bankdata specified` | `show_bankdata` kein gültiger Boolescher Wert | `true` oder `false` senden |
| 403 | 11 | `customer has no active status` | Mandant ist nicht aktiv (zum Beispiel gekündigt oder gesperrt) | Kein technischer Fix; Vertragsstatus im Account klären |
| 400 | 12 | `invalid show_contactdata specified` | `show_contactdata` kein gültiger Boolescher Wert | `true` oder `false` senden |
| 400 | 13 | `invalid company_name specified` | `company_name` fehlt oder verletzt die Validierung | Firmennamen prüfen (nicht leer, zulässige Zeichen) |
| 400 | 14 | `invalid contact_person_name specified` | `contact_person_name` verletzt die Validierung | Wert prüfen oder weglassen |
| 400 | 16 | `invalid street specified` | `street` verletzt die Validierung | Wert prüfen oder weglassen |
| 400 | 17 | `invalid additional_addressline specified` | `additional_addressline` verletzt die Validierung | Wert prüfen oder weglassen |
| 400 | 18 | `invalid zip specified` | `zip` verletzt die Validierung | Postleitzahl prüfen |
| 400 | 19 | `invalid city specified` | `city` verletzt die Validierung | Wert prüfen |
| 400 | 20 | `invalid country specified` | `country` ist weder deutscher Ländername noch zweistelliger ISO-Code | Auf ISO-Code umstellen, zum Beispiel `DE` |
| 400 | 21 | `invalid date specified` | `date` fehlt oder ist kein gültiges Datum | `YYYY-MM-DD` senden |
| 400 | 22 | `invalid invoicenumber specified` | `invoicenumber` verletzt die Validierung, vermutlich auch bei Dubletten | Nummer prüfen oder weglassen, dann vergibt BHB automatisch |
| 400 | 23 | `no post and files content received or declined` | Kein verwertbarer Request-Body empfangen | Content-Type `application/json` und gültiges JSON prüfen |
| 400 | 24 | `invalid date_of_supply specified` | `date_of_supply` verletzt die Validierung | Wert prüfen; beachten, dass ein Datum nach `date` still ignoriert wird und nicht zwingend diesen Fehler auslöst |
| 400 | 25 | `invalid email specified` | `email` ist keine gültige Adresse | Adresse korrigieren oder weglassen |
| 400 | 26 | `invalid correspondence specified` | `correspondence` verletzt die Validierung | Text prüfen, gegebenenfalls Sonderzeichen oder Länge |
| 400 | 27 | `invalid discount_value specified` | `discount_value` ist keine gültige Zahl | Zahl mit Dezimalpunkt senden |
| 400 | 28 | `invalid discount_type specified` | `discount_type` nicht `percent` oder `EUR` | Wert korrigieren |
| 400 | 29 | `invalid payment_conditions specified` | `payment_conditions` verletzt die Validierung | Text prüfen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung bei der Verarbeitung | **Nicht blind wiederholen.** Die Rechnung kann trotzdem entstanden sein. Erst über `/receipts/get` prüfen. |
| 400 | 31 | `invalid final_provisions specified` | `final_provisions` verletzt die Validierung | Text prüfen |
| 400 | 32 | `invalid item_name specified` | `item_name` fehlt, ist kein Array oder enthält ungültige Werte | Array von nicht leeren Strings senden |
| 403 | 33 | `customer has reached the upload limit` | Das Beleg-/Uploadkontingent des Tarifs ist erschöpft | Kein technischer Fix; Tarif oder Abrechnungszeitraum klären |
| 400 | 34 | `invalid item_amount specified` | `item_amount` fehlt, ist kein Array oder enthält keine gültigen Mengen | Mengen als Zahlen-Strings senden |
| 400 | 35 | `invalid item_unit specified` | `item_unit` fehlt, ist kein Array oder enthält ungültige Werte | Einheiten als Strings senden |
| 400 | 38 | `invalid customer_number specified` | `customer_number` verletzt die Validierung | Wert prüfen oder weglassen |
| 400 | 39 | `invalid item_vat specified` | `item_vat` fehlt oder enthält Werte außerhalb 0 bis 100 | Prozentsätze als Zahl zwischen 0 und 100 senden, `19` statt `0.19` |
| 400 | 43 | `invalid due_days specified` | `due_days` ist keine gültige Zahl | Ganze Zahl als String senden |
| 400 | 44 | `invalid language specified, allowed values: de_DE, en_US` | `language` weder `de_DE` noch `en_US` | Wert korrigieren |

Die Fehlercodes 1, 2, 15, 36, 37, 40, 41, 42 sind für diesen Endpunkt **nicht** dokumentiert.
Ob sie auftreten können, ist **nicht verifiziert**. Ein Client sollte unbekannte `error_code`-Werte
deshalb generisch behandeln und nicht auf die dokumentierte Menge einschränken.

### 3.5 Vollständiges curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/invoices/create" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "<API_KEY>",
    "type": "invoice",
    "show_prices_type": "net",
    "company_name": "Beispiel GmbH",
    "contact_person_name": "Max Mustermann",
    "street": "Musterstraße 1",
    "additional_addressline": "Haus B",
    "zip": "10115",
    "city": "Berlin",
    "country": "DE",
    "email": "rechnung@beispiel.invalid",
    "customer_number": "K-1000",
    "date": "2026-09-12",
    "date_of_supply": "2026-08-31",
    "invoicenumber": "RE-2026-0042",
    "correspondence": "vielen Dank für Ihren Auftrag.",
    "item_name": ["Beratung", "Jahreslizenz"],
    "item_description": ["Workshop am 31.08.2026", "Laufzeit 12 Monate"],
    "item_amount": ["10", "1"],
    "item_unit": ["Std.", "Stk."],
    "item_single_price": ["120.00", "499.00"],
    "item_vat": ["19", "19"],
    "discount_type": "percent",
    "discount_value": "3",
    "payment_conditions": "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    "due_days": "14",
    "final_provisions": "Es gelten unsere Allgemeinen Geschäftsbedingungen.",
    "show_bankdata": true,
    "show_contactdata": true,
    "payment_reference": "<STRIPE_TRANSACTION_ID>",
    "language": "de_DE"
  }'
```

Ohne `recurring_interval` und `recurring_date_next`, weil deren Angabe einen dauerhaften
Rechnungsplan anlegt. Wer sie braucht, ergänzt:

```json
"recurring_interval": "monthly",
"recurring_date_next": "2026-10-12"
```

### 3.6 Fallstricke und Besonderheiten

1. **`item_amount` ist die Menge, nicht der Betrag.** Siehe Abschnitt 2.3. Der häufigste und
   folgenschwerste Fehler.
2. **`item_vat` in Prozentpunkten.** `19`, nicht `0.19`.
3. **Parallele Arrays statt Positionsobjekten.** Ein Index-Versatz erzeugt fachlich falsche,
   technisch gültige Rechnungen.
4. **`country` akzeptiert nur zwei Schreibweisen.** Deutscher Ländername oder ISO-Code.
   `Germany` oder `DEU` sind laut Spezifikation ungültig.
5. **`date_of_supply` nach `date` wird stillschweigend verworfen**, ohne Fehlermeldung.
6. **`recurring_interval` hat eine Dauerwirkung**, die über die API nicht mehr rückgängig
   gemacht werden kann.
7. **Keine Währung.** Rechnungen sind faktisch auf EUR festgelegt (siehe 2.6).
8. **Kein Positionsrabatt.** Nur Gesamtrabatt über `discount_type`/`discount_value`.
9. **Timeout (504/30) ist kein sicheres Nein.** Die Rechnung kann trotzdem entstanden sein.
   Vor einem Retry immer über `/receipts/get` prüfen, sonst entstehen Doppelrechnungen.
10. **`show_bankdata` und `show_contactdata`** sind als `boolean` typisiert, tragen in der
    Spezifikation aber den String `"false"` als Default. Welche Repräsentationen die API
    akzeptiert (`true`, `"true"`, `1`), ist **nicht verifiziert**. Empfehlung: echte JSON-Booleans.
11. **Fehlermeldung 23 nennt „files content“**, obwohl dieser Endpunkt keinen Datei-Upload
    kennt. Das ist offenbar ein generischer Text aus den Upload-Endpunkten.
12. **Der Nummernkreis ist Mandanteneinstellung.** Wird `invoicenumber` weggelassen, vergibt
    BuchhaltungsButler die nächste fortlaufende Nummer aus dem in den Rechnungseinstellungen
    definierten Schema. Das Hilfecenter nennt als Bestandteile Zahlen (Pflicht), Buchstaben,
    Trennzeichen und die Datumsvariablen `TT`, `MM`, `JJJJ`. Für die fortlaufende Zählung wird
    die letzte enthaltene Zahl verwendet.
13. **`type: "offer"` erzeugt ein Angebot.** Ob ein Angebot ebenfalls als Ausgangsbeleg
    verbucht wird, ist **nicht verifiziert**; fachlich wäre das falsch, da ein Angebot kein
    Buchungsbeleg ist.

### 3.7 Live-Verifikation

Nicht auf der Whitelist. **Nicht live aufgerufen**, weil der Endpunkt schreibend ist und in
der Produktivbuchhaltung des Nutzers echte Rechnungen erzeugen würde.

---

## 4. `/invoices/create/e-invoice`

**Fachliche Wirkung:** Erzeugt dasselbe Dokument wie `/invoices/create`, zusätzlich als
E-Rechnung mit strukturiertem, normkonformem Steuermodell und Käuferreferenz.

**Einordnung: SCHREIBEND.** Siehe `/invoices/create`. Zusätzlich entsteht ein strukturierter
E-Rechnungsdatensatz, der nach dem Versand rechtlich bindend ist.

Quelle: `docs/openapi/buchhaltungsbutler-v1.json`, `.paths["/invoices/create/e-invoice"]`, Abrufdatum 2026-09-12.

### 4.1 Parameter (35 von 35)

Der Endpunkt ist bis auf die unten markierten Unterschiede identisch zu `/invoices/create`.

#### Pflichtparameter

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des zu verwaltenden Mandanten | vom Mandanten vergeben | opaker String |
| `type` | string | ja | – | Dokumentart | `invoice`, `credit`, `offer` | Kleinbuchstaben |
| `show_prices_type` | string | ja | – | Netto- oder Bruttodarstellung der Preise | `net`, `gross` | Kleinbuchstaben |
| `company_name` | string | ja | – | Firmenname des Empfängers | Freitext | – |
| `date` | string | ja | – | Rechnungsdatum | gültiges Datum | `YYYY-MM-DD` empfohlen |
| `item_name` | array | ja | – | Bezeichnungen der Positionen | Array von Strings | `["Item 1", "Item 2"]` |
| `item_amount` | array | ja | – | **Mengen** der Positionen | Array von Zahlen als String | `["10", "20"]` |
| `item_unit` | array | ja | – | Einheiten der Positionen | Array von Strings | `["Std.", "Stk."]` |
| `item_tax_type` | array | ja | – | **Steuerkategorie je Position** (ersetzt `item_vat`) | `S`, `Z`, `AE`, `K`, `G`, `E` (siehe 4.2) | Großbuchstaben |
| `item_tax_amount` | array | ja | – | Umsatzsteuersatz je Position in Prozent; laut Beschreibung „only required if corresponding item_tax_type = 'S'“, formal aber als Pflichtfeld deklariert | Gleitkommazahlen zwischen 0 und 100 | `["7", "19"]` |
| `item_single_price` | array | ja | – | Einzelpreise der Positionen | Array von Dezimalzahlen als String | `["20", "19.99"]` |
| `e_invoice_id` | string | ja | `0` laut Beschreibung („default: 0“) | **Käuferreferenz** (Buyer Reference, BT-10). Bei E-Rechnungen an öffentliche Auftraggeber die Leitweg-ID, die der Empfänger vorgibt | beliebige Referenz; wenn keine vorhanden, die Ziffer `0` | String |
| `street` | string | **ja** | – | Straße des Empfängers | Freitext | – |
| `zip` | string | **ja** | – | Postleitzahl des Empfängers | – | – |
| `city` | string | **ja** | – | Ort des Empfängers | – | – |
| `country` | string | **ja** | – | Land des Empfängers | deutscher Ländername (`Dänemark`) oder zweistelliger ISO-Code (`DK`) | ISO 3166-1 alpha-2 empfohlen |
| `email` | string | **ja** | – | E-Mail-Adresse des Empfängers | gültige E-Mail-Adresse | RFC-konform |

#### Optionale Parameter

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `contact_person_name` | string | nein | – | Ansprechpartner beim Empfänger | Freitext | – |
| `additional_addressline` | string | nein | – | Adresszusatz des Empfängers | Freitext | – |
| `recurring_interval` | string | nein | – | Intervall für wiederkehrende Rechnungen; legt einen Rechnungsplan an | `weekly`, `monthly`, `quarterly`, `yearly` | Kleinbuchstaben |
| `recurring_date_next` | string | nein | – | Nächste Ausführung; Pflicht sobald `recurring_interval` gesetzt ist | gültiges Datum | `YYYY-MM-DD` empfohlen |
| `date_of_supply` | string | nein | – | Liefer-/Leistungsdatum; wird als `date_delivery` des Belegs übernommen, wenn `date` und `date_of_supply` beide `YYYY-MM-DD` sind; darf nicht nach `date` liegen | Freitext oder Datum | Freitext oder `YYYY-MM-DD` |
| `invoicenumber` | string | nein | automatische BHB-Nummer | Eigene Rechnungsnummer | wird validiert wenn gesetzt | – |
| `correspondence` | string | nein | – | Anschreiben an den Empfänger | Freitext | – |
| `discount_type` | string | nein | – | Art des Gesamtrabatts | `percent`, `EUR` | – |
| `discount_value` | string | nein | – | Höhe des Gesamtrabatts | Zahl als String | Dezimalpunkt |
| `payment_conditions` | string | nein | – | Zahlungsbedingungen als Freitext | Freitext | – |
| `due_days` | string | nein | `0` | Tage zwischen Rechnungs- und Fälligkeitsdatum; ohne Angabe ist die Fälligkeit gleich dem Rechnungsdatum | ganze Zahl als String | – |
| `final_provisions` | string | nein | – | Schlusstext des Dokuments | Freitext | – |
| `show_bankdata` | boolean | nein | `false` | Bankverbindung anzeigen | `true`, `false` | siehe 3.6 Punkt 10 |
| `show_contactdata` | boolean | nein | `false` | Kontaktdaten anzeigen | `true`, `false` | siehe 3.6 Punkt 10 |
| `item_description` | array | nein | – | Beschreibungstexte je Position | Array von Strings, indexparallel | – |
| `customer_number` | string | nein | – | Kundennummer des Empfängers | – | – |
| `payment_reference` | string | nein | – | Zahlungsreferenz für den automatischen Abgleich mit einer Transaktion | Amazon-Order-ID, PayPal- oder Stripe-Transaktions-ID | – |
| `language` | string | nein | `de_DE` | Sprache der Dokumentbeschriftungen | `de_DE`, `en_US` | – |

### 4.2 Verschachtelte Strukturen und Steuerkategorien

Auch hier gibt es keine verschachtelten Objekte, sondern sieben indexparallele Arrays:
`item_name`, `item_description`, `item_amount`, `item_unit`, `item_single_price`,
`item_tax_type`, `item_tax_amount`.

```text
Position i = {
  name:        item_name[i],
  description: item_description[i],   // optional
  quantity:    item_amount[i],
  unit:        item_unit[i],
  unit_price:  item_single_price[i],
  tax_category: item_tax_type[i],
  tax_percent:  item_tax_amount[i]    // laut Beschreibung nur bei tax_category = "S" erforderlich
}
```

Erlaubte Werte für `item_tax_type`, wörtlich aus der Spezifikation übernommen:

| Code | Beschreibung laut Spezifikation | Fachliche Bedeutung | Erwarteter Wert in `item_tax_amount` |
| --- | --- | --- | --- |
| `S` | VAT (standard rate) | Regelbesteuerter Umsatz | der Steuersatz, zum Beispiel `19` oder `7` |
| `Z` | 0% VAT | Nullsatz | `0`, nicht verifiziert |
| `AE` | Reverse Charge (§13b) | Steuerschuldnerschaft des Leistungsempfängers | `0`, nicht verifiziert |
| `K` | EU Supply (Intra-community supply) | Innergemeinschaftliche Lieferung | `0`, nicht verifiziert |
| `G` | Third Country Supply (Export) | Ausfuhrlieferung in ein Drittland | `0`, nicht verifiziert |
| `E` | VAT Exempt Supply & Services | Steuerbefreite Umsätze | `0`, nicht verifiziert |

Diese sechs Codes entsprechen den Codes der UNTDID-5305-Liste, die EN 16931 für das Feld
BT-151 (VAT category code) vorschreibt. EN 16931 kennt darüber hinaus die Codes `L`
(Kanarische Inseln IGIC), `M` (Ceuta und Melilla IPSI) und `O` (nicht im Anwendungsbereich der
Steuer). Diese drei bildet die BuchhaltungsButler-API **nicht** ab. Die Zuordnung zur
UNTDID-Liste ist eine fachliche Einordnung anhand der Norm; BuchhaltungsButler benennt die
Codeliste in der Spezifikation nicht ausdrücklich. **Nicht verifiziert**, ob die erzeugte XML
tatsächlich diese Codes in BT-151 schreibt.

Ob für die Codes `Z`, `AE`, `K`, `G` und `E` das Feld `item_tax_amount` weggelassen, als
leerer String oder als `0` gesendet werden muss, ist **widersprüchlich dokumentiert**: Das Feld
ist formal `required: true`, die Beschreibung sagt „Only required if corresponding
item_tax_type = 'S' (VAT)“. **Empfehlung:** das Array immer in voller Länge senden und für
nicht regelbesteuerte Positionen `"0"` eintragen. Nicht verifiziert.

**Hinweis zu EN 16931:** Für die Codes `AE`, `K`, `G` und `E` verlangt die Norm einen
Befreiungsgrund (BT-120 „VAT exemption reason text“ bzw. BT-121 „VAT exemption reason code“).
Die API bietet **kein** Feld dafür. Ob BuchhaltungsButler den Grund intern aus dem Code
ableitet oder ob das Feld leer bleibt, ist **nicht verifiziert**. Wer eine reverse-charge- oder
exportbezogene E-Rechnung über die API erzeugt, sollte das entstehende XML vor dem Produktiveinsatz
gegen einen Validator prüfen.

### 4.3 Erfolgsantwort

Schema `InvoicesCreateEInvoice_Success`, feldgleich zu `InvoicesCreate_Success`:

| Feld | Typ | Bedeutung | Beispielwert |
| --- | --- | --- | --- |
| `success` | boolean | Erfolgskennzeichen | `true` |
| `message` | string | leer im Erfolgsfall | `""` |
| `id_by_customer` | string | mandanteneigene ID des entstandenen Belegs | `"123"` |
| `invoicenumber` | string | vergebene Rechnungsnummer | `"123"` |
| `file_name` | string | Dateiname des erzeugten Dokuments | `"file123"` |

Die Antwort enthält **kein** Feld, das das erzeugte E-Rechnungsformat benennt, und **keinen**
Download-Link. Welches Format `file_name` bezeichnet (PDF, ZUGFeRD-PDF oder XRechnung-XML), ist
aus der Spezifikation **nicht ableitbar** und **nicht verifiziert**.

### 4.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Nicht blind wiederholen, erst über `/receipts/get` prüfen |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Zugangsdaten falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder ohne Berechtigung | `api_key` prüfen |
| 400 | 5 | `invalid type specified` | `type` nicht `invoice`, `credit` oder `offer` | Wert korrigieren |
| 400 | 6 | `no items specified` | Keine Positionen übergeben | Mindestens eine Position senden |
| 400 | 7 | `invalid show_prices_type specified` | `show_prices_type` nicht `net` oder `gross` | Wert korrigieren |
| 400 | 8 | `invalid recurring_interval specified` | Ungültiges Intervall | Wert korrigieren |
| 400 | 9 | `invalid recurring_date_next specified` | Fehlendes oder ungültiges Folgedatum | Datum ergänzen |
| 400 | 10 | `invalid show_bankdata specified` | Kein gültiger Boolescher Wert | `true`/`false` senden |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv | Vertragsstatus klären |
| 400 | 12 | `invalid show_contactdata specified` | Kein gültiger Boolescher Wert | `true`/`false` senden |
| 400 | 13 | `invalid company_name specified` | `company_name` fehlt oder ungültig | Wert prüfen |
| 400 | 14 | `invalid contact_person_name specified` | Ungültiger Ansprechpartner | Wert prüfen oder weglassen |
| 400 | 16 | `invalid street specified` | `street` fehlt oder ungültig; hier **Pflichtfeld** | Straße setzen |
| 400 | 17 | `invalid additional_addressline specified` | Ungültiger Adresszusatz | Wert prüfen oder weglassen |
| 400 | 18 | `invalid zip specified` | `zip` fehlt oder ungültig; hier **Pflichtfeld** | PLZ setzen |
| 400 | 19 | `invalid city specified` | `city` fehlt oder ungültig; hier **Pflichtfeld** | Ort setzen |
| 400 | 20 | `invalid country specified` | `country` fehlt oder ist weder deutscher Name noch ISO-Code; hier **Pflichtfeld** | ISO-Code senden, zum Beispiel `DE` |
| 400 | 21 | `invalid date specified` | `date` fehlt oder ungültig | `YYYY-MM-DD` senden |
| 400 | 22 | `invalid invoicenumber specified` | `invoicenumber` ungültig | Nummer prüfen oder weglassen |
| 400 | 23 | `no post and files content received or declined` | Kein verwertbarer Request-Body | Content-Type und JSON prüfen |
| 400 | 24 | `invalid date_of_supply specified` | `date_of_supply` ungültig | Wert prüfen |
| 400 | 25 | `invalid email specified` | `email` fehlt oder ungültig; hier **Pflichtfeld** | Gültige Adresse setzen |
| 400 | 26 | `invalid correspondence specified` | Ungültiges Anschreiben | Text prüfen |
| 400 | 27 | `invalid discount_value specified` | Ungültiger Rabattwert | Zahl senden |
| 400 | 28 | `invalid discount_type specified` | Ungültige Rabattart | `percent` oder `EUR` |
| 400 | 29 | `invalid payment_conditions specified` | Ungültige Zahlungsbedingungen | Text prüfen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Nicht blind wiederholen, erst prüfen |
| 400 | 31 | `invalid final_provisions specified` | Ungültiger Schlusstext | Text prüfen |
| 400 | 32 | `invalid item_name specified` | `item_name` fehlt oder ungültig | Array von Strings senden |
| 403 | 33 | `customer has reached the upload limit` | Belegkontingent erschöpft | Tarif klären |
| 400 | 34 | `invalid item_amount specified` | `item_amount` fehlt oder ungültig | Mengen senden |
| 400 | 35 | `invalid item_unit specified` | `item_unit` fehlt oder ungültig | Einheiten senden |
| 400 | 38 | `invalid customer_number specified` | Ungültige Kundennummer | Wert prüfen |
| 400 | 39 | `invalid item_tax_type specified` | `item_tax_type` fehlt oder enthält einen Code außerhalb `S`, `Z`, `AE`, `K`, `G`, `E` | Codes korrigieren. **Achtung:** Code 39 bedeutet bei `/invoices/create` und `/invoices/create/draft` „invalid item_vat“ |
| 400 | 40 | `invalid item_tax_amount specified` | `item_tax_amount` fehlt oder enthält Werte außerhalb 0 bis 100 | Prozentsätze korrigieren |
| 400 | 41 **oder** 42 | `invalid e_invoice_id specified` | Käuferreferenz bzw. Leitweg-ID fehlt oder ist ungültig | `e_invoice_id` setzen; wenn keine Referenz vorliegt, die Ziffer `0`. **Widersprüchlich dokumentiert**, siehe Hinweis unten |
| 400 | 42 | `invalid e_invoice_type specified` | Bezieht sich auf einen Parameter `e_invoice_type`, den die Parameterliste **nicht enthält** | Nicht adressierbar. Tritt dieser Code auf, deutet das auf einen nicht dokumentierten Parameter zur Formatwahl hin |
| 400 | 43 | `invalid due_days specified` | `due_days` keine gültige Zahl | Ganze Zahl senden |
| 400 | 44 | `invalid language specified, allowed values: de_DE, en_US` | Ungültige Sprache | Wert korrigieren |

**Widerspruch bei Fehlercode 41/42:** Die Spezifikation listet unter den Responses den
Schlüssel `"400 (41)"` mit Verweis auf `InvoicesCreateEInvoice_ErrorCode41`. Das zugehörige
Schema trägt jedoch `error_code: 42` und die Nachricht `invalid e_invoice_id specified`. Der
Code 42 ist damit doppelt belegt, einmal für `e_invoice_id` und einmal für `e_invoice_type`.
Welcher Wert tatsächlich zurückkommt, ist **nicht verifiziert**. Prüfkommando:

```bash
jq '.definitions.InvoicesCreateEInvoice_ErrorCode41, .definitions.InvoicesCreateEInvoice_ErrorCode42' \
  docs/openapi/buchhaltungsbutler-v1.json
```

Ein Client darf sich deshalb bei diesen beiden Codes **nicht** auf die Zahl verlassen, sondern
sollte zusätzlich den `message`-Text auswerten.

### 4.5 Vollständiges curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/invoices/create/e-invoice" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "<API_KEY>",
    "type": "invoice",
    "show_prices_type": "net",
    "company_name": "Stadtverwaltung Musterstadt",
    "contact_person_name": "Erika Musterfrau",
    "street": "Rathausplatz 1",
    "additional_addressline": "Amt für Digitalisierung",
    "zip": "10115",
    "city": "Berlin",
    "country": "DE",
    "email": "rechnungseingang@musterstadt.invalid",
    "customer_number": "K-2000",
    "e_invoice_id": "991-12345-67",
    "date": "2026-09-12",
    "date_of_supply": "2026-08-31",
    "invoicenumber": "RE-2026-0043",
    "correspondence": "anbei unsere Rechnung zum Rahmenvertrag.",
    "item_name": ["Beratung", "Reisekosten"],
    "item_description": ["Workshop am 31.08.2026", "Bahnfahrt"],
    "item_amount": ["10", "1"],
    "item_unit": ["Std.", "Stk."],
    "item_single_price": ["120.00", "89.90"],
    "item_tax_type": ["S", "S"],
    "item_tax_amount": ["19", "19"],
    "payment_conditions": "Zahlbar innerhalb von 30 Tagen ohne Abzug.",
    "due_days": "30",
    "final_provisions": "Bitte geben Sie bei der Zahlung die Rechnungsnummer an.",
    "show_bankdata": true,
    "show_contactdata": true,
    "language": "de_DE"
  }'
```

Beispiel für eine innergemeinschaftliche Lieferung, bei der `item_tax_amount` laut Beschreibung
nicht erforderlich wäre, hier trotzdem mit `0` gefüllt (siehe 4.2):

```json
"item_tax_type": ["K"],
"item_tax_amount": ["0"]
```

### 4.6 Fallstricke und Besonderheiten

1. **`item_vat` existiert hier nicht.** Stattdessen `item_tax_type` **und** `item_tax_amount`.
   Wer den Body von `/invoices/create` einfach an diesen Endpunkt schickt, bekommt Fehler 39
   und 40 und versteht aus der Meldung nicht sofort, warum.
2. **Fehlercode 39 hat zwei Bedeutungen** je nach Endpunkt (`item_vat` bzw. `item_tax_type`).
   Eine gemeinsame Fehlercode-Tabelle im MCP-Server muss deshalb pro Endpunkt aufgelöst werden.
3. **Das Usage-Beispiel in der Spezifikation ist falsch.** Bei `item_tax_type` steht dort
   `"item_vat" : ['S', 'E']` statt `"item_tax_type"`. Prüfkommando:
   ```bash
   jq -r '.paths["/invoices/create/e-invoice"].post.parameters[] | select(.name=="item_tax_type") | .description' \
     docs/openapi/buchhaltungsbutler-v1.json
   ```
4. **`item_tax_amount` ist formal Pflicht, laut Beschreibung aber bedingt.** Siehe 4.2.
5. **`street`, `zip`, `city`, `country` und `email` sind hier Pflicht**, tragen in der
   Spezifikation aber weiterhin den Beschreibungstext „If specified, the field will be
   validated“ aus der Nicht-E-Rechnungs-Variante. Der Beschreibungstext widerspricht dem
   `required`-Flag; maßgeblich ist das Flag.
6. **`contact_person_name` bleibt optional**, obwohl die übrigen Empfängerfelder verpflichtend
   wurden. Das Hilfecenter listet den Ansprechpartner nicht unter den E-Rechnungs-Pflichtfeldern.
7. **`e_invoice_id` ist zwei Dinge in einem Feld.** Für private Empfänger die allgemeine
   Käuferreferenz (Bestellnummer, Auftragsnummer, Kundennummer), für öffentliche Auftraggeber
   die **Leitweg-ID**. Das Hilfecenter sagt: „Die Angabe der Leitweg-ID ist bei E-Rechnungen an
   öffentliche Auftraggeber zwingend erforderlich und wird vom Rechnungsempfänger vorgegeben.“
   Ein Agent kann diesen Wert **nicht erraten**; er muss ihn erfragen. Fallback laut Hilfecenter:
   „Falls keine Referenz vorhanden ist, geben Sie bitte die Ziffer ‚0‘ ein.“
8. **Keine Felder für Befreiungsgründe** (BT-120/BT-121), obwohl `item_tax_type` Codes zulässt,
   für die EN 16931 einen Grund verlangt. Siehe 4.2.
9. **Kein Feld für die Formatwahl.** Fehlercode 42 verweist auf einen Parameter `e_invoice_type`,
   der nicht dokumentiert ist. Welches Format erzeugt wird, ist dadurch nicht steuerbar.
10. **Keine Felder für weitere EN-16931-Angaben** wie Leistungszeitraum als Von-Bis (BT-73/BT-74),
    Bestellreferenz (BT-13), Zahlungsmittelcode (BT-81) oder IBAN abweichend von den Stammdaten
    (BT-84). Siehe die Gegenüberstellung in Abschnitt 6.3.
11. **Der Versand erfolgt nicht automatisch.** Siehe Abschnitt 7.
12. **`type: "offer"` als E-Rechnung** ist fachlich fragwürdig, weil EN 16931 Rechnungen und
    Gutschriften modelliert, keine Angebote. Die API erlaubt den Wert formal trotzdem.
    **Nicht verifiziert**, was dabei entsteht.

### 4.7 Live-Verifikation

Nicht auf der Whitelist. **Nicht live aufgerufen**, weil der Endpunkt schreibend ist.

---

## 5. `/invoices/create/draft`

**Fachliche Wirkung:** Legt einen Rechnungsentwurf an, der in der Weboberfläche weiterbearbeitet
und später zu einem finalen Dokument gemacht wird.

**Einordnung: SCHREIBEND.** Der Entwurf ist zwar kein finales Dokument und erhält keine
Rechnungsnummer, er verändert aber dauerhaft den Datenbestand des Mandanten und taucht in der
Oberfläche auf. Es gibt keinen API-Endpunkt, um einen Entwurf zu lesen, zu ändern oder zu löschen.

Quelle: `docs/openapi/buchhaltungsbutler-v1.json`, `.paths["/invoices/create/draft"]`, Abrufdatum 2026-09-12.

### 5.1 Parameter (30 von 30)

#### Pflichtparameter

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Key des zu verwaltenden Mandanten | vom Mandanten vergeben | opaker String |
| `type` | string | ja | – | Dokumentart des späteren Dokuments | `invoice`, `credit`, `offer` | Kleinbuchstaben |
| `show_prices_type` | string | ja | – | Netto- oder Bruttodarstellung | `net`, `gross` | Kleinbuchstaben |
| `company_name` | string | ja | – | Firmenname des Empfängers | Freitext | – |
| `date` | string | ja | – | Rechnungsdatum. Siehe Widerspruch zum Hilfecenter in Abschnitt 1.1 | gültiges Datum | `YYYY-MM-DD` empfohlen |
| `item_name` | array | ja | – | Bezeichnungen der Positionen | Array von Strings | `["Item 1", "Item 2"]` |
| `item_amount` | array | ja | – | **Mengen** der Positionen | Array von Zahlen als String | `["10", "20"]` |
| `item_unit` | array | ja | – | Einheiten der Positionen | Array von Strings | `["Std.", "Stk."]` |
| `item_vat` | array | ja | – | Umsatzsteuersätze in Prozent | Gleitkommazahlen zwischen 0 und 100 | `["7", "19"]` |
| `item_single_price` | array | ja | – | Einzelpreise der Positionen | Array von Dezimalzahlen als String | `["20", "19.99"]` |

#### Optionale Parameter

| Feldname | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Wertebereich | Format |
| --- | --- | --- | --- | --- | --- | --- |
| `contact_person_name` | string | nein | – | Ansprechpartner beim Empfänger | Freitext | – |
| `street` | string | nein | – | Straße des Empfängers | Freitext | – |
| `additional_addressline` | string | nein | – | Adresszusatz | Freitext | – |
| `zip` | string | nein | – | Postleitzahl | – | – |
| `city` | string | nein | – | Ort | – | – |
| `country` | string | nein | – | Land | deutscher Ländername oder zweistelliger ISO-Code | ISO 3166-1 alpha-2 empfohlen |
| `email` | string | nein | – | E-Mail für den späteren Versand | gültige E-Mail-Adresse | RFC-konform |
| `recurring_interval` | string | nein | – | Intervall für wiederkehrende Rechnungen | `weekly`, `monthly`, `quarterly`, `yearly` | Kleinbuchstaben |
| `recurring_date_next` | string | nein | – | Nächste Ausführung; Pflicht sobald `recurring_interval` gesetzt ist | gültiges Datum | `YYYY-MM-DD` empfohlen |
| `date_of_supply` | string | nein | – | Liefer-/Leistungsdatum; darf nicht nach `date` liegen | Freitext oder Datum | Freitext oder `YYYY-MM-DD` |
| `correspondence` | string | nein | – | Anschreiben an den Empfänger | Freitext | – |
| `discount_type` | string | nein | – | Art des Gesamtrabatts | `percent`, `EUR` | – |
| `discount_value` | string | nein | – | Höhe des Gesamtrabatts | Zahl als String | Dezimalpunkt |
| `payment_conditions` | string | nein | – | Zahlungsbedingungen als Freitext | Freitext | – |
| `final_provisions` | string | nein | – | Schlusstext | Freitext | – |
| `show_bankdata` | boolean | nein | `false` | Bankverbindung anzeigen | `true`, `false` | siehe 3.6 Punkt 10 |
| `show_contactdata` | boolean | nein | `false` | Kontaktdaten anzeigen | `true`, `false` | siehe 3.6 Punkt 10 |
| `item_description` | array | nein | – | Beschreibungstexte je Position | Array von Strings, indexparallel | – |
| `customer_number` | string | nein | – | Kundennummer des Empfängers | – | – |
| `language` | string | nein | `de_DE` | Sprache der Dokumentbeschriftungen | `de_DE`, `en_US` | – |

**Nicht vorhanden im Vergleich zu `/invoices/create`:** `invoicenumber`, `due_days`,
`payment_reference`. Das sind genau die drei Felder, die ein finales Dokument brauchen und ein
Entwurf nicht.

### 5.2 Verschachtelte Objekt- und Array-Parameter

Identisch zu `/invoices/create`, siehe 3.2: sechs indexparallele Arrays, keine verschachtelten
Objekte.

### 5.3 Erfolgsantwort

Schema `InvoicesCreateDraft_Success`:

| Feld | Typ | Bedeutung | Beispielwert |
| --- | --- | --- | --- |
| `success` | boolean | Erfolgskennzeichen | `true` |
| `message` | string | leer im Erfolgsfall | `""` |

**Das ist die wichtigste Einschränkung dieses Endpunkts:** Die Antwort enthält **keine ID,
keine Nummer und keinen Dateinamen**. Ein erzeugter Entwurf ist über die API danach nicht mehr
adressierbar, nicht auffindbar und nicht löschbar. Ein Client kann nicht einmal feststellen, ob
ein wiederholter Aufruf einen Duplikatentwurf erzeugt hat.

### 5.4 Fehlerfälle

| HTTP | error_code | message | Bedeutung | Was der Aufrufer tun kann |
| --- | --- | --- | --- | --- |
| 500 | 0 | `error while processing the request` | Interner Serverfehler | Nicht blind wiederholen; der Entwurf kann trotzdem entstanden sein und ist über die API nicht prüfbar |
| 401 | 3 | `API credentials unknown or invalid` | Basic-Auth-Zugangsdaten falsch | Zugangsdaten prüfen |
| 401 | 4 | `customer not found or insufficient privileges` | `api_key` unbekannt oder ohne Berechtigung | `api_key` prüfen |
| 400 | 5 | `invalid type specified` | `type` nicht `invoice`, `credit` oder `offer` | Wert korrigieren |
| 400 | 6 | `no items specified` | Keine Positionen übergeben | Mindestens eine Position senden |
| 400 | 7 | `invalid show_prices_type specified` | Nicht `net` oder `gross` | Wert korrigieren |
| 400 | 8 | `invalid recurring_interval specified` | Ungültiges Intervall | Wert korrigieren |
| 400 | 9 | `invalid recurring_date_next specified` | Fehlendes oder ungültiges Folgedatum | Datum ergänzen |
| 400 | 10 | `invalid show_bankdata specified` | Kein gültiger Boolescher Wert | `true`/`false` senden |
| 403 | 11 | `customer has no active status` | Mandant nicht aktiv | Vertragsstatus klären |
| 400 | 12 | `invalid show_contactdata specified` | Kein gültiger Boolescher Wert | `true`/`false` senden |
| 400 | 13 | `invalid company_name specified` | `company_name` fehlt oder ungültig | Wert prüfen |
| 400 | 14 | `invalid contact_person_name specified` | Ungültiger Ansprechpartner | Wert prüfen oder weglassen |
| 400 | 16 | `invalid street specified` | Ungültige Straße | Wert prüfen oder weglassen |
| 400 | 17 | `invalid additional_addressline specified` | Ungültiger Adresszusatz | Wert prüfen oder weglassen |
| 400 | 18 | `invalid zip specified` | Ungültige Postleitzahl | Wert prüfen |
| 400 | 19 | `invalid city specified` | Ungültiger Ort | Wert prüfen |
| 400 | 20 | `invalid country specified` | Weder deutscher Ländername noch ISO-Code | ISO-Code senden |
| 400 | 21 | `invalid date specified` | `date` fehlt oder ungültig | `YYYY-MM-DD` senden |
| 400 | 23 | `no post and files content received or declined` | Kein verwertbarer Request-Body | Content-Type und JSON prüfen |
| 400 | 24 | `invalid date_of_supply specified` | Ungültiges Liefer-/Leistungsdatum | Wert prüfen |
| 400 | 25 | `invalid email specified` | Ungültige E-Mail-Adresse | Adresse korrigieren oder weglassen |
| 400 | 26 | `invalid correspondence specified` | Ungültiges Anschreiben | Text prüfen |
| 400 | 27 | `invalid discount_value specified` | Ungültiger Rabattwert | Zahl senden |
| 400 | 28 | `invalid discount_type specified` | Ungültige Rabattart | `percent` oder `EUR` |
| 400 | 29 | `invalid payment_conditions specified` | Ungültige Zahlungsbedingungen | Text prüfen |
| 504 | 30 | `a timeout occurred while processing the request` | Zeitüberschreitung | Nicht blind wiederholen; Ergebnis über die API nicht prüfbar |
| 400 | 31 | `invalid final_provisions specified` | Ungültiger Schlusstext | Text prüfen |
| 400 | 38 | `invalid customer_number specified` | Ungültige Kundennummer | Wert prüfen |
| 400 | 44 | `invalid language specified, allowed values: de_DE, en_US` | Ungültige Sprache | Wert korrigieren |

**Auffällig fehlende Fehlerfälle bei diesem Endpunkt:**

- **Kein 403 (33)** „customer has reached the upload limit“. Passt dazu, dass ein Entwurf kein
  Beleg ist und nicht auf das Belegkontingent zählt. **Nicht verifiziert.**
- **Kein 400 (32), (34), (35), (39)** für ungültige Positionsarrays, obwohl `item_name`,
  `item_amount`, `item_unit` und `item_vat` hier Pflichtfelder sind. Welchen Fehler ein
  ungültiges Positionsarray auslöst, ist **nicht dokumentiert**. Vermutlich fällt alles unter
  Code 6 „no items specified“. **Nicht verifiziert.**
- **Kein 400 (43)** `due_days`, konsistent, weil das Feld fehlt.
- **Kein 400 (22)** in der Response-Liste, obwohl das Schema `InvoicesCreateDraft_ErrorCode22`
  („invalid invoicenumber specified“) in den Definitionen existiert. Das ist eine Karteileiche
  aus dem Copy-and-paste der Fehlerschemata. Prüfkommando:
  ```bash
  jq '.definitions.InvoicesCreateDraft_ErrorCode22' docs/openapi/buchhaltungsbutler-v1.json
  jq -r '.paths["/invoices/create/draft"].post.responses | keys[]' docs/openapi/buchhaltungsbutler-v1.json
  ```

### 5.5 Vollständiges curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/invoices/create/draft" \
  -u "<API_CLIENT>:<API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "<API_KEY>",
    "type": "invoice",
    "show_prices_type": "net",
    "company_name": "Beispiel GmbH",
    "contact_person_name": "Max Mustermann",
    "street": "Musterstraße 1",
    "additional_addressline": "Haus B",
    "zip": "10115",
    "city": "Berlin",
    "country": "DE",
    "email": "rechnung@beispiel.invalid",
    "customer_number": "K-1000",
    "date": "2026-09-12",
    "date_of_supply": "2026-08-31",
    "correspondence": "Entwurf zur internen Abstimmung.",
    "item_name": ["Beratung", "Jahreslizenz"],
    "item_description": ["Workshop am 31.08.2026", "Laufzeit 12 Monate"],
    "item_amount": ["10", "1"],
    "item_unit": ["Std.", "Stk."],
    "item_single_price": ["120.00", "499.00"],
    "item_vat": ["19", "19"],
    "discount_type": "percent",
    "discount_value": "3",
    "payment_conditions": "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    "final_provisions": "Es gelten unsere Allgemeinen Geschäftsbedingungen.",
    "show_bankdata": true,
    "show_contactdata": true,
    "language": "de_DE"
  }'
```

### 5.6 Fallstricke und Besonderheiten

1. **Die Antwort ist blind.** Kein Rückgabewert identifiziert den Entwurf. Idempotenz ist nicht
   herstellbar, Retries erzeugen mit hoher Wahrscheinlichkeit Duplikate.
2. **Kein Lese-, Änderungs- oder Löschendpunkt.** Aufräumen geht nur in der Weboberfläche.
3. **`date` ist Pflicht**, obwohl das Hilfecenter sagt, Entwürfe würden ohne Rechnungsdatum
   gespeichert. Widerspruch, siehe 1.1.
4. **Kein `invoicenumber`.** Das Hilfecenter beschreibt, dass im Entwurf der Platzhalter
   „Entwurf“ im Nummernfeld steht und beim Finalisieren durch die nächste freie Nummer ersetzt
   wird. Über die API ist weder der Platzhalter noch eine eigene Nummer setzbar.
5. **`recurring_interval` ist auch hier vorhanden.** Ob ein Entwurf mit Rechnungsplan bereits
   einen laufenden Plan anlegt oder erst beim Finalisieren, ist **nicht verifiziert**. Wegen der
   Dauerwirkung sollte ein MCP-Tool das Feld für Entwürfe vorsichtshalber genauso deutlich
   kennzeichnen wie bei `/invoices/create`.
6. **Positionsfehler sind unterdokumentiert.** Siehe 5.4.

### 5.7 Live-Verifikation

Nicht auf der Whitelist. **Nicht live aufgerufen**, weil der Endpunkt schreibend ist.

---

## 6. E-Rechnung: Formate, Norm und Rechtslage

### 6.1 Welches Format erzeugt BuchhaltungsButler

Quelle: Hilfecenter-Artikel „E-Rechnungen (XRechnung und Zugferd)“ und „Rechnungen, Angebote und
Gutschriften erstellen“, abgerufen 2026-09-12.

Wörtlich: „BuchhaltungsButler bietet die Möglichkeit, E-Rechnungen in den Formaten **ZUGFeRD**
(PDF mit eingebettetem XML) und **XRechnung** (XML) hochzuladen und zu erstellen.“

Und zum Ergebnis der Erstellung: „Sobald Sie die E-Rechnung erstellt haben, stehen Ihnen die
Formate **ZUGFeRD** und **XRechnung** zum Download zur Verfügung.“

Daraus folgt: Es wird **ein** E-Rechnungsdatensatz erzeugt, der in **beiden** Repräsentationen
abrufbar ist. Die Formatwahl erfolgt beim Download, nicht bei der Erstellung.

**Factur-X** wird von BuchhaltungsButler **nicht** genannt. Factur-X ist die französische
Bezeichnung desselben Profils wie ZUGFeRD 2.x; die beiden Spezifikationen sind technisch
deckungsgleich. Ob BuchhaltungsButler eine Factur-X-konforme Datei ausliefert, ist **nicht
verifiziert**.

**Welche ZUGFeRD-Version und welches Profil** (BASIC, EN 16931/COMFORT, EXTENDED) erzeugt wird
und **welche XRechnung-Version** (zum Beispiel 3.0.x), nennt weder die API-Spezifikation noch
das Hilfecenter. **Nicht verifiziert.** Das ist eine offene Frage, die vor dem Produktiveinsatz
durch eine echte Erzeugung und eine Validierung geklärt werden muss.

**Über die API gibt es keinen Download.** Die Pfadliste der Spezifikation enthält keinen
Endpunkt, der ein Dokument zurückliefert; `/receipts/upload` geht nur in die Gegenrichtung. Der
Rückgabewert `file_name` ist ein Name, kein Link. Damit ist der vollständige Ablauf „E-Rechnung
erzeugen und an den Kunden übermitteln“ über die API v1 **nicht** abbildbar.

### 6.2 Pflichtfelder nach EN 16931

Quelle: `https://kostenlose-erechnung.de/ratgeber/xrechnung-bt-felder-uebersicht/`, abgerufen
2026-09-12. Das ist eine **Sekundärquelle**, nicht der Normtext. Die Norm EN 16931-1 selbst ist
kostenpflichtig; die maßgebliche deutsche Ausprägung ist die CIUS „XRechnung“ der KoSIT. Für
eine verbindliche Feldliste ist die jeweils gültige XRechnung-Spezifikation heranzuziehen.

Die Sekundärquelle nennt als Pflichtfelder (Kardinalität P) unter anderem:

| BT | Bezeichnung | Ebene |
| --- | --- | --- |
| BT-1 | Rechnungsnummer | Kopf |
| BT-2 | Rechnungsdatum | Kopf |
| BT-3 | Rechnungsart-Code | Kopf |
| BT-5 | Währung | Kopf |
| BT-10 | Käuferreferenz; bei öffentlichen Auftraggebern faktisch Pflicht (Leitweg-ID, Regel BR-DE-15) | Kopf |
| BT-27 | Name des Verkäufers | Verkäufer |
| BT-31 / BT-32 | USt-IdNr. **oder** Steuernummer des Verkäufers (eine von beiden) | Verkäufer |
| BT-35 | Straße des Verkäufers | Verkäufer |
| BT-37 | Ort des Verkäufers | Verkäufer |
| BT-38 | Postleitzahl des Verkäufers | Verkäufer |
| BT-40 | Ländercode des Verkäufers | Verkäufer |
| BT-44 | Name des Käufers | Käufer |
| BT-50 | Straße des Käufers | Käufer |
| BT-52 | Ort des Käufers | Käufer |
| BT-53 | Postleitzahl des Käufers | Käufer |
| BT-55 | Ländercode des Käufers | Käufer |
| BT-126 | Positionskennung je Rechnungszeile | Position |

Die Norm verlangt darüber hinaus die Summenblöcke (BG-22 mit BT-106 Summe der Nettobeträge,
BT-109 Gesamtnettobetrag, BT-112 Gesamtbruttobetrag, BT-115 fälliger Zahlbetrag), die
Umsatzsteueraufschlüsselung je Steuerkategorie (BG-23 mit BT-116, BT-117, BT-118, BT-119) sowie
je Position Menge, Einheit und Nettopreis (BT-129, BT-130, BT-146). Diese Angaben berechnet
eine Rechnungssoftware üblicherweise selbst aus den Positionen. **Diese Aufzählung stammt aus
der Sekundärquelle und allgemeinem Normwissen, nicht aus einer verifizierten Primärquelle.**

### 6.3 Welche EN-16931-Pflichtfelder die API abbildet

| EN 16931 | Woher kommt der Wert bei BuchhaltungsButler | API-Parameter |
| --- | --- | --- |
| BT-1 Rechnungsnummer | `invoicenumber` oder automatischer Nummernkreis | `invoicenumber` (optional) |
| BT-2 Rechnungsdatum | Pflichtparameter | `date` |
| BT-3 Rechnungsart-Code | wird aus `type` abgeleitet, **nicht verifiziert** | `type` |
| BT-5 Währung | **kein Parameter**, faktisch EUR | – |
| BT-9 Fälligkeitsdatum | aus `date` + `due_days` | `due_days` |
| BT-10 Käuferreferenz / Leitweg-ID | Pflichtparameter | `e_invoice_id` |
| BT-13 Bestellreferenz | **kein Parameter** | – |
| BT-27 Name des Verkäufers | Stammdaten des Mandanten | – |
| BT-31/BT-32 USt-IdNr. oder Steuernummer | Stammdaten des Mandanten (laut Hilfecenter zwingend zu hinterlegen) | – |
| BT-35/37/38/40 Anschrift des Verkäufers | Stammdaten des Mandanten (laut Hilfecenter zwingend zu hinterlegen) | – |
| BT-44 Name des Käufers | Pflichtparameter | `company_name` |
| BT-50/52/53/55 Anschrift des Käufers | Pflichtparameter | `street`, `city`, `zip`, `country` |
| BT-49 E-Mail des Käufers | Pflichtparameter | `email` |
| BT-73/74 Leistungszeitraum von/bis | **kein Parameter**, nur ein einzelnes Datum | `date_of_supply` |
| BT-81 Zahlungsmittelcode | **kein Parameter** | – |
| BT-84 IBAN des Zahlungsempfängers | Stammdaten des Mandanten | `show_bankdata` steuert nur die Anzeige |
| BT-120/121 Grund der Steuerbefreiung | **kein Parameter** | – |
| BT-151 Steuerkategorie je Position | Pflichtparameter | `item_tax_type` |
| BT-152 Steuersatz je Position | Pflichtparameter | `item_tax_amount` |
| BT-153 Positionsbezeichnung | Pflichtparameter | `item_name` |
| BT-129/130 Menge und Einheit | Pflichtparameter | `item_amount`, `item_unit` |
| BT-146 Nettopreis der Position | Pflichtparameter | `item_single_price` |
| BG-22/BG-23 Summen und Steueraufschlüsselung | berechnet BuchhaltungsButler, **nicht verifiziert** | – |

**Lücken, die aus dieser Gegenüberstellung folgen und vor dem Produktiveinsatz geprüft werden
müssen:** kein Befreiungsgrund (BT-120/121), kein Leistungszeitraum als Von-Bis (BT-73/74),
keine Bestellreferenz (BT-13), keine Währungswahl (BT-5), kein Zahlungsmittelcode (BT-81).
Ob BuchhaltungsButler diese Felder intern setzt oder auslässt, ist **nicht verifiziert**. Die
Zuordnung der BT-Nummern in dieser Tabelle ist eine fachliche Einordnung des Autors, keine
Aussage von BuchhaltungsButler.

Die Einheit in `item_unit` ist bei BuchhaltungsButler ein **Freitextfeld** (`Std.`, `Stk.`).
EN 16931 verlangt für BT-130 einen Code aus UN/ECE Recommendation 20 (zum Beispiel `HUR` für
Stunde, `H87` für Stück). Ob BuchhaltungsButler den Freitext auf einen Code abbildet, ist
**nicht verifiziert** und eine der wahrscheinlichsten Bruchstellen bei der Validierung.

### 6.4 Stand der gesetzlichen Pflicht in Deutschland

Quelle: IHK Frankfurt am Main, „E-Rechnungspflicht ab 2025“,
`https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/steuerrecht/umsatzsteuer-national/e-rechnungspflicht-ab-2025-6055774`,
abgerufen 2026-09-12. Rechtsgrundlage: § 14 UStG in der Fassung des Wachstumschancengesetzes
(Zustimmung des Bundesrats im März 2024, die IHK-Quelle nennt den 2024-03-23; Verkündung Ende März 2024), konkretisiert durch das
BMF-Schreiben vom 2024-10-15.

| Zeitraum | Regelung |
| --- | --- |
| seit 2025-01-01 | Jedes inländische Unternehmen muss E-Rechnungen im B2B **empfangen** können. Der Vorrang der Papierrechnung entfällt. Ausstellen darf jeder. |
| bis 2026-12-31 | Übergangsfrist: Papier- und PDF-Rechnungen im B2B bleiben zulässig (mit Zustimmung des Empfängers). |
| ab 2027-01-01 | **Versandpflicht** für Unternehmen mit einem Vorjahresumsatz über 800.000 Euro. |
| bis 2027-12-31 | Unternehmen mit einem Vorjahresumsatz von höchstens 800.000 Euro dürfen weiterhin sonstige Formate verwenden. |
| ab 2028-01-01 | **Vollständige Versandpflicht** für alle inländischen B2B-Umsätze. EDI-Verfahren bleiben zulässig, sofern daraus ein korrekter Meldedatensatz extrahierbar ist. |

**Stand zum Abrufdatum 2026-09-12:** Die Empfangspflicht gilt bereits. Die Versandpflicht gilt
noch nicht; die Übergangsfrist für Papier- und PDF-Rechnungen läuft am 2026-12-31 aus. Die
erste Versandpflicht-Stufe greift am 2027-01-01.

Ausnahmen von der E-Rechnungspflicht laut derselben Quelle:

- Kleinbetragsrechnungen bis 250 Euro brutto (§ 33 UStDV)
- Fahrausweise (§ 34 UStDV)
- Leistungen von Kleinunternehmern (§ 34a UStDV)
- Rechnungen an Nichtunternehmer (B2C)
- bestimmte steuerfreie Grundstücksleistungen an Endverbraucher

Zulässige Formate laut derselben Quelle: Formate, die EN 16931 erfüllen, anerkannt sind
**ZUGFeRD 2.x** und **XRechnung**.

**Einschränkung:** Die IHK-Seite ist eine zuverlässige, aber sekundäre Quelle. Primärquellen
wären § 14 UStG, §§ 33, 34, 34a UStDV und das BMF-Schreiben vom 2024-10-15. Ob es seit dem
BMF-Schreiben vom 2024-10-15 und bis zum Abrufdatum 2026-09-12 weitere Änderungen oder ein
Folgeschreiben gab, wurde **nicht geprüft** und ist damit **nicht verifiziert**. Vor
rechtlichen Aussagen im Produkt ist der Stand erneut zu prüfen.

---

## 7. Was mit der erzeugten Rechnung passiert

### 7.1 Wird sie automatisch zum Beleg

Ja, bei `/invoices/create`. Das Hilfecenter beschreibt den Vorgang für die Weboberfläche:
„Mit Klick auf ‚Rechnung erstellen‘ öffnet sich Ihre neu erstellte Rechnung in einem neuen Tab
in Ihrem Browser, außerdem erscheint sie nun im Bereich ‚Rechnungsausgang‘ und wird als
‚Ausgangsbeleg‘ erfasst.“

Für die API stützen zwei Indizien dieselbe Aussage:

1. Die Erfolgsantwort liefert `id_by_customer`. Dieses Feld ist in der gesamten API die
   mandanteneigene Beleg-ID; es taucht identisch in `/receipts/get`, `/receipts/get/id_by_customer`
   und `/receipts/delete/id_by_customer` auf.
2. Der Fehlercode 403 (33) „customer has reached the upload limit“ ist für `/invoices/create`
   und `/invoices/create/e-invoice` dokumentiert. Ein Belegkontingent kann nur greifen, wenn ein
   Beleg entsteht. Für `/invoices/create/draft` fehlt dieser Fehlercode.

**Nicht verifiziert**, weil die Endpunkte nicht live aufgerufen wurden.

**Live verifiziert wurde die Gegenprobe:** Ein Aufruf von `/receipts/get` mit
`list_direction: "outbound"` liefert Ausgangsbelege mit `type: "invoice outbound"`. Die
erzeugte Rechnung ist dort also über ihre `id_by_customer` wiederzufinden.

Weitere Wirkungen:

- `date_of_supply` im Format `YYYY-MM-DD` wird zusätzlich als `date_delivery` des Belegs
  übernommen und ist damit für die Buchung relevant.
- `payment_reference` führt laut Spezifikation dazu, dass der entstehende Beleg automatisch mit
  der passenden Transaktion abgeglichen wird („the resulting receipt of the created invoice will
  match with the corresponding transaction“). Unterstützt werden Amazon-Order-ID,
  PayPal-Transaktions-ID und Stripe-Transaktions-ID.
- Ob die Rechnung automatisch auf ein Debitorenkonto gebucht wird, ist **nicht verifiziert**.
  Die API bietet dafür keinen Parameter; `/receipts/upload` hat dafür das Feld
  `creditor_debtor`, die Invoice-Endpunkte haben es nicht. Das Hilfecenter erwähnt für die
  Weboberfläche eine Option „Neuen Debitor anlegen“, die die API nicht abbildet.

### 7.2 Wird sie automatisch versendet

**Nein.** Weder die Spezifikation noch das Hilfecenter beschreiben einen automatischen Versand.
Das Feld `email` heißt in der Spezifikation „The email for sending the invoice“, das Hilfecenter
präzisiert für die Weboberfläche: „Fügen Sie eine ‚E-Mail für den Rechnungsversand‘ (nur für Sie
intern sichtbar) bei der Erstellung der Rechnung hinzu. So haben Sie die Möglichkeit, Ihre
erstellten Rechnungen im Bereich ‚Rechnungsausgang‘ mit Klick auf das Kontextmenü neben Ihrer
erstellten Rechnung, direkt aus Ihrem Account heraus an den Kunden zu senden.“

`email` hinterlegt also nur die Adresse für einen **späteren, manuell ausgelösten** Versand.
Als Absender wird standardmäßig `rechnungsversand@buchhaltungsbutler.de` verwendet; eine eigene
Absenderadresse lässt sich in den Einstellungen hinterlegen.

Es gibt **keinen** API-Endpunkt zum Versenden. Ein Agent, der eine Rechnung über die API
erzeugt, hat damit keinen Weg, sie dem Empfänger zuzustellen, und auch keinen Weg, die Datei
herunterzuladen und selbst zu versenden. Das ist die größte funktionale Lücke der API v1 im
Bereich Rechnungsstellung.

### 7.3 Was danach noch möglich ist, und was nicht

| Aktion | Über die API möglich |
| --- | --- |
| Rechnung erzeugen | ja |
| Rechnung lesen (als Beleg) | ja, über `/receipts/get` und `/receipts/get/id_by_customer` |
| PDF oder XML herunterladen | **nein** |
| Rechnung versenden | **nein** |
| Rechnung ändern | **nein** |
| Rechnung stornieren oder in eine Gutschrift umwandeln | **nein**, nur in der Weboberfläche |
| Angebot in eine Rechnung umwandeln | **nein**, nur in der Weboberfläche |
| Beleg löschen | ja, über `/receipts/delete/id_by_customer`, **nicht verifiziert**, ob das auch das Rechnungsdokument entfernt |
| Entwurf lesen, ändern, finalisieren oder löschen | **nein** |
| Rechnungsplan lesen, pausieren oder löschen | **nein**, nur in der Weboberfläche |

---

## 8. Gesammelte Mängel der Spezifikation

Alle Punkte betreffen die Datei
`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json`,
Stand 2026-09-12. Sie sind für die Implementierung relevant, weil eine Codegenerierung aus dieser
Datei fehlerhaften Code erzeugt.

| Nr. | Mangel | Auswirkung |
| --- | --- | --- |
| 1 | Body-Parameter stehen als flache Liste mit `"in": "body"` und eigenem `type`, statt in einem gemeinsamen `schema`. Das ist kein gültiges Swagger 2.0. | Generatoren erzeugen für jeden Parameter einen eigenen Body oder brechen ab. Der Body ist handzuschreiben. |
| 2 | `basePath` enthält eine vollständige URL statt eines Pfades. | Zusammensetzen von `host` und `basePath` ergibt eine kaputte URL. |
| 3 | `consumes`, `securityDefinitions` und `security` sind `null`. | Basic Auth und `application/json` sind nicht maschinenlesbar beschrieben. |
| 4 | `enum` mit genau einem Eintrag in den Definitionen. | Das sind **Beispielwerte**, keine erlaubten Wertemengen. Wer daraus Literal-Typen generiert, erzeugt Code, der jede echte Antwort ablehnt. |
| 5 | `InvoicesCreateEInvoice_ErrorCode41` trägt `error_code: 42`, während der Response-Schlüssel `"400 (41)"` lautet. Code 42 ist doppelt belegt. | Fehlercode-Mapping für `e_invoice_id` ist unsicher; zusätzlich `message` auswerten. |
| 6 | Fehlercode 42 verweist auf einen Parameter `e_invoice_type`, der in der Parameterliste fehlt. | Hinweis auf eine nicht dokumentierte Formatwahl. Nicht adressierbar. |
| 7 | `item_tax_type` trägt im Usage-Beispiel den falschen Feldnamen `"item_vat"`. | Copy-and-paste aus dem Beispiel erzeugt einen ungültigen Request. |
| 8 | `item_tax_amount` ist `required: true`, die Beschreibung sagt „only required if corresponding item_tax_type = 'S'“. | Unklar, ob das Array immer vollständig sein muss. |
| 9 | Bei `/invoices/create/e-invoice` tragen die nunmehr verpflichtenden Felder `street`, `zip`, `city`, `country`, `email` weiterhin den Text „If specified, the field will be validated“. | Beschreibung widerspricht dem `required`-Flag. Maßgeblich ist das Flag. |
| 10 | Fehlercode 39 bedeutet je nach Endpunkt „invalid item_vat“ oder „invalid item_tax_type“. | Eine globale Fehlercode-Tabelle im Client wäre falsch. Mapping muss pro Endpunkt erfolgen. |
| 11 | `InvoicesCreateDraft_ErrorCode22` („invalid invoicenumber specified“) existiert, wird aber von keiner Response referenziert, und `/invoices/create/draft` hat keinen Parameter `invoicenumber`. | Karteileiche. |
| 12 | Für `/invoices/create/draft` fehlen die Fehlercodes 32, 34, 35 und 39, obwohl die zugehörigen Positionsarrays Pflichtfelder sind. | Unklares Fehlerverhalten bei ungültigen Positionen. |
| 13 | Für `date` und `recurring_date_next` ist kein Format angegeben. | Format muss aus anderen Endpunkten abgeleitet werden. |
| 14 | `show_bankdata` und `show_contactdata` sind `boolean` mit dem **String** `"false"` als Default. | Typinkonsistenz; unklar, welche JSON-Repräsentation akzeptiert wird. |
| 15 | `due_days` hat bei `/invoices/create` keinen Default, bei `/invoices/create/e-invoice` den Default `0`. | Unklar, ob sich beide Endpunkte gleich verhalten. |
| 16 | Fehlermeldung 23 nennt „files content“, obwohl keiner der drei Endpunkte einen Datei-Upload kennt. | Irreführender Meldungstext. |
| 17 | Beschreibungen enthalten HTML (`<br/>`, `<i>`) und HTML-Entities (`&ldquo;`, `&rdquo;`). | Beschreibungen müssen vor der Übernahme in MCP-Tool-Definitionen bereinigt werden. |
| 18 | Die Feldbeschreibungen der Erfolgsschemata lauten teilweise schlicht „blank“. | Keine nutzbare Semantik; die Bedeutung musste aus anderen Endpunkten erschlossen werden. |
| 19 | Kein Währungsparameter bei den Invoice-Endpunkten, obwohl `/receipts/add` und `/transactions/add` einen haben. | Fremdwährungen sind nicht abbildbar; die Beschränkung ist nirgends ausgesprochen. |
| 20 | Widerspruch zum Hilfecenter: Entwürfe werden laut Hilfecenter „ohne Rechnungsdatum“ gespeichert, die API verlangt `date` als Pflichtfeld. | Unklare Semantik des Feldes bei Entwürfen. |

---

## 9. Durchgeführte Live-Verifikation

Gegen die echte API wurden ausschließlich lesende Endpunkte aufgerufen, 2026-09-12, drei
Requests insgesamt. Die drei dokumentierten Invoice-Endpunkte wurden **nicht** aufgerufen.

### 9.1 `/receipts/get` mit `list_direction: "outbound"`

Zweck: prüfen, wie eine erzeugte Rechnung anschließend sichtbar wird.

Ergebnis: HTTP 200, `success: true`, `rows: 3`. Alle Datensätze tragen `type: "invoice outbound"`.

Anonymisiertes Beispiel eines Datensatzes (alle Namen, Nummern, Beträge und IDs ersetzt):

```json
{
  "filename": "2026-01-15_Rechnung_RE-9001_0000000000000000000000000000aaaa",
  "id_by_customer": "999",
  "type": "invoice outbound",
  "date": "2026-01-15",
  "delivery_date": null,
  "date_uploaded": "2026-01-15",
  "counterparty": "Beispiel Kunde GmbH",
  "invoicenumber": "RE-9001",
  "amount": "119.00",
  "payment_date": "2026-02-10",
  "due_date": null,
  "account": "1200",
  "amount_paid": "0.00",
  "amount_paid_fixed": "0.00",
  "deleted": "0",
  "link_to_receipt_id_by_customer": null
}
```

**Abweichungen der Live-Antwort von der Spezifikation** (Schema `ReceiptsGet_Success`):

| Spezifikation | Live-Antwort | Bewertung |
| --- | --- | --- |
| `date_delivery` | **`delivery_date`** | Feldname vertauscht. Ein Client, der `date_delivery` liest, bekommt `undefined`. |
| – | `amount_paid` | zusätzliches, nicht dokumentiertes Feld |
| – | `amount_paid_fixed` | zusätzliches, nicht dokumentiertes Feld |
| alle Felder als String typisiert | `delivery_date`, `due_date`, `link_to_receipt_id_by_customer` kommen als `null` | Die Spezifikation sieht `null` nicht vor. Clients müssen jedes Feld als nullable behandeln. |

Das ist für dieses Dokument relevant, weil `/receipts/get` der einzige Weg ist, eine erzeugte
Rechnung wiederzufinden, etwa nach einem Timeout. Die Abweichung gehört fachlich in das Dossier
zu den Belegen, wird hier aber festgehalten, weil sie den Verifikationspfad nach einer
Rechnungserstellung betrifft.

Beobachtetes Muster für `filename` (drei von drei Datensätzen):
`JJJJ-MM-TT_Rechnung_<Rechnungsnummer>_<32 Hex-Zeichen>`. Ob diese Belege über die API oder die
Weboberfläche entstanden sind, ist **nicht verifiziert**.

### 9.2 `/settings/get/debtors`

Zweck: prüfen, ob sich Empfängerdaten für eine Rechnung aus vorhandenen Debitoren übernehmen
lassen.

Ergebnis: HTTP 200, `success: true`, `rows: 2`. Jeder Debitor trägt folgende Felder:

```text
additional_addressline, bic, city, contact_person_name, country, customer_number,
email, iban, import_pending, name, postingaccount_number, sales_tax_id_eu, street,
type, uid_ch, zip
```

Das deckt **alle** Empfängerfelder der Invoice-Endpunkte ab. Die Zuordnung:

| Debitorenfeld | Invoice-Parameter |
| --- | --- |
| `name` | `company_name` |
| `contact_person_name` | `contact_person_name` |
| `street` | `street` |
| `additional_addressline` | `additional_addressline` |
| `zip` | `zip` |
| `city` | `city` |
| `country` | `country` |
| `email` | `email` |
| `customer_number` | `customer_number` |

**Nicht verifiziert**, ob die Wertebereiche exakt übereinstimmen, insbesondere beim Feld
`country` (die Invoice-Endpunkte akzeptieren nur deutschen Ländernamen oder ISO-Code).

### 9.3 Nicht durchgeführte Verifikationen

- Kein Aufruf von `/invoices/create`, `/invoices/create/e-invoice`, `/invoices/create/draft`.
- Damit unverifiziert: die tatsächliche Struktur der Erfolgsantwort, die tatsächlichen
  Fehlercodes, das akzeptierte Datumsformat, das Verhalten bei ungleich langen Positionsarrays,
  das erzeugte E-Rechnungsformat und dessen Normkonformität.

---

## 10. Hinweise für das MCP-Tool-Design

### 10.1 Welche Endpunkte fachlich zusammengehören

Aus Sicht eines Agenten bilden diese Endpunkte einen Arbeitsbereich „Ausgangsrechnung“:

```text
Vorbereitung (lesend)
  /settings/get/debtors        Empfängerstammdaten holen: Name, Anschrift, E-Mail, Kundennummer
  /settings/get/postingaccounts Kontenrahmen, falls die Buchung geprüft werden soll

Erzeugung (schreibend)
  /invoices/create/draft       Entwurf, wenn ein Mensch noch draufschauen soll
  /invoices/create             finales Dokument
  /invoices/create/e-invoice   finales Dokument als E-Rechnung

Nachkontrolle (lesend)
  /receipts/get                        Ausgangsbelege listen, list_direction = "outbound"
  /receipts/get/id_by_customer         den konkreten Beleg über die zurückgegebene ID lesen
  /receipts/assigned-transactions/get  prüfen, ob der Zahlungsabgleich gegriffen hat
```

### 10.2 Mehrstufige Abläufe

1. **Rechnung an einen Bestandskunden.** Erst `/settings/get/debtors` lesen und die Felder
   übernehmen, statt den Agenten Adressdaten erfinden zu lassen. Dann `/invoices/create`. Dann
   `/receipts/get/id_by_customer` mit der zurückgegebenen `id_by_customer` zur Bestätigung.

2. **Erzeugen nach einem Timeout oder 500er.** Der Aufruf darf **nicht** einfach wiederholt
   werden. Der korrekte Ablauf ist: `/receipts/get` mit `list_direction: "outbound"`, passendem
   `date_from`/`date_to` und `counterparty` abfragen und prüfen, ob die Rechnung schon existiert.
   Erst wenn nicht, erneut senden. Ohne diesen Schritt entstehen Doppelrechnungen mit doppelt
   verbrauchten Rechnungsnummern. Das MCP-Tool sollte diese Prüfung selbst ausführen, statt sie
   dem Agenten zu überlassen.

3. **Entwurf und Finalisierung.** Dieser Ablauf ist über die API **nicht** vollständig möglich.
   `/invoices/create/draft` erzeugt den Entwurf, das Finalisieren geht nur in der Weboberfläche.
   Das Tool muss das in seiner Beschreibung ausdrücklich sagen, sonst wartet der Agent auf einen
   Rückgabewert, den es nie geben wird.

4. **E-Rechnung erzeugen und versenden.** Ebenfalls nicht vollständig möglich. Erzeugen geht,
   Herunterladen und Versenden nicht. Das Tool muss den Nutzer darauf hinweisen, dass der
   Versand in der Weboberfläche erfolgen muss.

### 10.3 Parameter, die Agenten schwer erraten und die besonders gute Beschreibungen brauchen

| Parameter | Warum schwierig | Was die Tool-Beschreibung leisten muss |
| --- | --- | --- |
| `item_amount` | Der Name legt „Betrag“ nahe, gemeint ist die **Menge** | Ausdrücklich „Menge/Anzahl je Position, NICHT der Betrag“ schreiben, mit Beispiel |
| `item_single_price` | Einzelpreis oder Gesamtpreis der Position | „Preis **pro Einheit**, nicht Menge mal Preis“ |
| `item_vat` / `item_tax_amount` | Prozentpunkte oder Dezimalbruch | „Prozentsatz als Zahl zwischen 0 und 100, also 19 für 19 Prozent“ |
| `item_tax_type` | Sechs Codes ohne selbsterklärende Namen | Alle sechs Codes mit deutscher Erklärung in die Beschreibung aufnehmen; der Agent kann das nicht ableiten |
| `e_invoice_id` | Doppelbedeutung Käuferreferenz / Leitweg-ID, muss beim Empfänger erfragt werden | Beide Bedeutungen erklären, Fallback `"0"` nennen, und klarstellen, dass der Wert **nicht geraten** werden darf. Bei öffentlichen Auftraggebern muss der Agent nachfragen |
| `show_prices_type` | Bestimmt die Interpretation aller Preise | „`net` bedeutet, die Einzelpreise sind Nettopreise und die USt wird aufgeschlagen“. **Achtung:** diese Interpretation ist eine Annahme, nicht verifiziert |
| `country` | Nur zwei Schreibweisen erlaubt | „Zweistelliger ISO-Code, zum Beispiel DE, oder deutscher Ländername. `Germany` ist ungültig.“ Besser: im Tool auf ISO-Code normalisieren |
| `date_of_supply` | Zwei Wirkungen, stille Verwerfung bei Datum nach `date` | Beide Wirkungen erklären; das Tool sollte selbst prüfen, dass `date_of_supply <= date` gilt, und sonst warnen |
| `recurring_interval` | Erzeugt eine **dauerhafte** Nebenwirkung, die über die API nicht rückgängig zu machen ist | Als gefährlich kennzeichnen, Rückfrage erzwingen. Eventuell in ein eigenes Tool auslagern, damit es nicht versehentlich mitgesetzt wird |
| `payment_reference` | Nur drei Anbieterformate | Die drei unterstützten Quellen nennen; bei anderen Werten weglassen |
| `discount_type` / `discount_value` | Gilt für die Gesamtrechnung, nicht je Position | Ausdrücklich als Gesamtrabatt kennzeichnen; Positionsrabatte im Einzelpreis abbilden |
| `invoicenumber` | Weglassen ist meist richtig | „Leer lassen, damit BuchhaltungsButler die nächste Nummer aus dem Nummernkreis vergibt. Nur setzen, wenn eine bestimmte Nummer gefordert ist.“ |
| `type` | `offer` erzeugt ein Angebot, das vermutlich kein Beleg ist | Die drei Werte mit deutscher Bedeutung nennen |
| `api_key` | Keine Agentenentscheidung | Sollte der MCP-Server aus der Konfiguration setzen und **nicht** als Tool-Parameter exponieren |

### 10.4 Empfehlungen für den Zuschnitt der Tools

1. **Positionen als Objektliste im Tool-Schema.** Ein Agent wird bei sechs parallelen Arrays
   früher oder später einen Index verschieben. Das Tool sollte
   `positions: [{name, description?, quantity, unit, unit_price, vat_percent}]` entgegennehmen
   und die Arrays selbst aufbauen. Dabei prüfen, dass alle Arrays gleich lang sind.

2. **Getrennte Tools für `create` und `e-invoice`.** Die Steuerangabe ist strukturell
   verschieden (`item_vat` gegen `item_tax_type` plus `item_tax_amount`), und die
   Pflichtfeldmenge unterscheidet sich. Ein gemeinsames Tool mit einem Schalter würde die
   Pflichtfelder unscharf machen und den Agenten Fehler 39 und 40 produzieren lassen.

3. **Alle drei Tools als schreibend und bestätigungspflichtig kennzeichnen.** Es gibt keinen
   Rückgängig-Weg. Insbesondere `/invoices/create` verbraucht eine Rechnungsnummer.

4. **`api_key`, Basic-Auth-Zugangsdaten und Mandantenauswahl serverseitig halten.** Sie gehören
   in die Konfiguration, nicht in das Tool-Schema.

5. **Client-seitige Vorabprüfungen**, die viele Fehlerantworten vermeiden:
   `type` in {invoice, credit, offer}; `show_prices_type` in {net, gross};
   `item_vat`/`item_tax_amount` zwischen 0 und 100; `item_tax_type` in
   {S, Z, AE, K, G, E}; `country` normalisiert auf ISO-3166-1-alpha-2;
   `date` und `recurring_date_next` als `YYYY-MM-DD`; `date_of_supply <= date`;
   `recurring_date_next` gesetzt, wenn `recurring_interval` gesetzt ist;
   `language` in {de_DE, en_US}; bei `e-invoice` zusätzlich `street`, `zip`, `city`, `country`,
   `email`, `e_invoice_id` vorhanden und nicht leer.

6. **Fehlerbehandlung pro Endpunkt mappen, nicht global.** Wegen der Doppelbedeutung von Code 39
   und der Doppelbelegung von Code 42 muss das Mapping endpunktspezifisch sein und im Zweifel
   den `message`-Text auswerten.

7. **Retry-Politik: niemals automatisch.** Bei 500 und 504 gilt der Aufruf als „Ergebnis
   unbekannt“. Das Tool sollte diesen Zustand an den Agenten zurückmelden und den Prüfweg über
   `/receipts/get` vorschlagen oder direkt ausführen. Bei `/invoices/create/draft` ist dieser
   Prüfweg nicht verfügbar; dort muss das Tool ausdrücklich sagen, dass das Ergebnis nicht
   feststellbar ist.

8. **Rate Limit.** 100 Requests pro Mandant und Minute gelten für alle Tools zusammen. Der
   Server sollte das zentral drosseln, damit ein Agent, der viele Rechnungen erzeugt, nicht die
   lesenden Prüfaufrufe blockiert.

9. **Die fehlenden Funktionen ausdrücklich dokumentieren.** Ein Agent, der eine Rechnung
   versenden oder herunterladen soll, muss aus den Tool-Beschreibungen erkennen können, dass die
   API v1 das nicht kann. Sonst sucht er endlos nach dem passenden Tool oder behauptet, versendet
   zu haben.

---

## 11. Offene Punkte

Diese Fragen konnten mit den verfügbaren Quellen **nicht** geklärt werden. Sie sollten vor dem
Produktiveinsatz beantwortet werden, am besten durch einen kontrollierten Testaufruf gegen einen
Testmandanten.

1. Welches E-Rechnungsformat, welche Version und welches Profil erzeugt
   `/invoices/create/e-invoice` tatsächlich (ZUGFeRD 2.x mit welchem Profil, XRechnung in welcher
   Version)? Besteht die Ausgabe eine Validierung gegen die KoSIT-Prüftools?
2. Was bedeutet der nicht dokumentierte Parameter hinter Fehlercode 42 („e_invoice_type“)?
   Existiert ein undokumentiertes Feld zur Formatwahl?
3. Wird `item_tax_amount` für die Codes `Z`, `AE`, `K`, `G`, `E` wirklich nicht benötigt, und
   wenn doch, welcher Wert ist korrekt?
4. Wie wird der nach EN 16931 erforderliche Befreiungsgrund (BT-120/BT-121) bei `AE`, `K`, `G`
   und `E` gefüllt?
5. Wird das Freitextfeld `item_unit` auf einen UN/ECE-Rec-20-Code abgebildet, und wenn ja, wie?
6. Welches Datumsformat akzeptiert `date` tatsächlich, und was passiert bei `TT.MM.JJJJ`?
7. Was passiert bei ungleich langen Positionsarrays?
8. Welchen Fehlercode liefert `/invoices/create/draft` bei ungültigen Positionsarrays?
9. Speichert `/invoices/create/draft` das übergebene `date`, oder wird es verworfen?
10. Legt `/invoices/create/draft` mit `recurring_interval` bereits einen laufenden Rechnungsplan an?
11. Erzeugt `type: "offer"` einen Ausgangsbeleg, und was entsteht bei `type: "offer"` am
    E-Rechnungs-Endpunkt?
12. Verhält sich `due_days` bei `/invoices/create` genauso wie bei `/invoices/create/e-invoice`
    (Default 0)?
13. Welche Repräsentation akzeptieren `show_bankdata` und `show_contactdata`: JSON-Boolean,
    String oder beides?
14. Was passiert, wenn die für E-Rechnungen erforderlichen Unternehmensstammdaten fehlen:
    Fehlermeldung oder unvollständiges Dokument?
15. Ist die Vorzeichenkonvention bei `type: "credit"` positiv oder negativ?
16. Entfernt `/receipts/delete/id_by_customer` auch das zugehörige Rechnungsdokument?
17. Gab es nach dem BMF-Schreiben vom 2024-10-15 weitere rechtliche Änderungen zur
    E-Rechnungspflicht bis zum Abrufdatum 2026-09-12?
