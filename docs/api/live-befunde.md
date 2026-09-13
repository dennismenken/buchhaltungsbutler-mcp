# Live-Befunde: eigene Messungen gegen die API

Eigene Messungen gegen die echte Schnittstelle, **ausschließlich lesende Aufrufe**. Sie
korrigieren die OpenAPI-Datei `docs/openapi/buchhaltungsbutler-v1.json` an Stellen, an denen
diese falsch ist. Gegen schreibende Endpunkte wurde **kein einziger** Aufruf ausgeführt; der
Abschnitt „Was hier ausdrücklich nicht gemessen ist" sagt, warum und was dadurch offen bleibt.

Basis-URL `https://webapp.buchhaltungsbutler.de/api/v1`, Methode ausnahmslos `POST`,
JSON-Body. Die Zugangsdaten (API Client, API Secret, `api_key`) stehen in keiner Aufrufform
dieses Dokuments; wo sie im Body stünden, steht `"api_key": "…"`.

## Die Kennungen L1 bis L6 sind stabil

Jeder Befund trägt eine Kennung von **L1** bis **L6**. Diese Kennungen sind hier definiert und
**werden im Quelltext zitiert** — in Kommentaren, Werkzeugbeschreibungen und Tests. Ein Satz
wie „gemessen (Befund L5)" im Code ist ein Verweis auf genau diese Datei und auf genau diesen
Abschnitt. Deshalb gilt:

- **Kennungen werden nicht umnummeriert.** Wer L4 zu L5 macht, macht jede Zitatstelle im
  Quelltext falsch, ohne dass ein Test das bemerkt.
- **Kennungen werden nicht wiederverwendet.** Ein Befund, der sich als falsch erweist, bleibt
  mit seiner Kennung stehen und wird als widerlegt gekennzeichnet. Neue Befunde bekommen L7,
  L8 und so weiter.
- **Der Inhalt einer Kennung darf wachsen, nicht wandern.** Eine neue Messung zum selben
  Sachverhalt wird unter derselben Kennung ergänzt; ein anderer Sachverhalt bekommt eine neue.

Ältere Zitate im Projekt nennen L1 bis L3 noch „Befund 1" bis „Befund 3". Die Zuordnung ist
eins zu eins: Befund 1 = L1, Befund 2 = L2, Befund 3 = L3. Beide Schreibweisen meinen
denselben Abschnitt.

## Anonymisierung

**Alle Geschäftsdaten in diesem Dokument sind anonymisiert.** Beträge, Namen von
Geschäftspartnern, Rechnungs- und Sachkontonummern, Dateinamen, Datumsangaben in
Beispieldatensätzen und Verwendungszwecke sind durch Platzhalter ersetzt und als solche
kenntlich gemacht.

Nicht anonymisiert und bewusst im Original belassen sind die **strukturellen Messwerte**:
Feldnamen, Feldanzahlen, JSON-Typen, HTTP-Status, `error_code`, der wörtliche Text von
`message` und die Werte von `rows`. Sie sind der Beleg; ohne sie wäre kein Befund nachprüfbar.
Wo ein Wert wie `"0.00"` gezeigt wird, ist das kein Betrag eines Geschäftsvorfalls, sondern
der gemessene Feldinhalt selbst und damit Teil des Befunds.

Im Original stehen außerdem die beiden **Datensatzkennungen** `id_by_customer` `2` (Beleg) und
`1590` (Transaktion). Sie sind nicht ersetzt, weil sie der Gegenstand der Messung selbst sind:
Ohne den tatsächlich aufgerufenen Pfad `/receipts/get/2` ließe sich L1 nicht nachvollziehen.
Eine solche Kennung benennt einen Datensatz, trägt aber keinen Geschäftsinhalt — weder Betrag
noch Gegenpartei noch Zweck.

**Die Platzhalterbeträge sind gegen den Bestand geprüft.** Die in L3 gezeigten Beträge
`"1234.56"` und `"-9876.54"` sind frei gewählt und kommen in **keinem** Datensatz dieses
Mandanten vor. Geprüft am **2026-09-13**, ausschließlich lesend: alle 898 Belege
(`POST /receipts/get` mit `list_direction: "inbound"`, 500 + 189 Zeilen, und
`list_direction: "outbound"`, 209 Zeilen) und alle 1403 Transaktionen (`POST /transactions/get`,
500 + 500 + 403 Zeilen), zusammen 2301 Datensätze mit 956 verschiedenen `amount`-Werten —
keiner davon ist einer der beiden Platzhalter. Dieselbe Prüfung ist für die Platzhalterwerte
der Beispielzeile in L4 durchgeführt: Betrag, Gegenpartei, Rechnungsnummer, Dateiname,
Sachkontonummer, Datensatzkennung und die drei Datumsangaben kommen in keinem der 2301
gelesenen Datensätze vor. `amount_paid`, `amount_paid_fixed` und `deleted` sind dort keine
Platzhalter, sondern die oben genannten strukturellen Messwerte.

> **Korrigiert am 2026-09-13.** L3 zeigte bis dahin zwei andere Beträge und wies sie als
> anonymisierte Beispielbeträge aus. Das war falsch: Beide kommen im Bestand dieses Mandanten
> vor, einer davon zeichengenau als `amount` desjenigen Belegs, den L1 über `/receipts/get/2`
> abruft. Sie sind durch die beiden oben geprüften Platzhalter ersetzt und werden hier
> **nicht wiederholt** — ein echter Betrag gehört in dieses Dokument auch dann nicht, wenn er
> nur als Beispiel für eine Korrektur diente. **Die Messungen und Folgerungen aller Befunde
> bleiben unberührt**, denn belegt ist die *Form* des Feldes — String, Punkt als
> Dezimaltrennzeichen, zwei Nachkommastellen, Minuszeichen vorangestellt —, nicht ein
> bestimmter Betrag.

---

## Übersicht

| Kennung | Kurzfassung | Datum | Schwere |
| --- | --- | --- | --- |
| **L1** | `id_by_customer` im Pfad ist ein Platzhalter, kein literales Segment. Der dokumentierte Aufruf schlägt fehl. | 2026-09-12, Segmentform am 2026-09-13 erneut bestätigt | kritisch |
| **L2** | Einzelabruf und Listenabruf haben **getrennte** Antwortverträge: andere Feldmengen, andere Feldnamen für denselben Sachverhalt. | 2026-09-12, Belegendpunkte am 2026-09-13 erneut gemessen | hoch |
| **L3** | Typ-Asymmetrie: Beträge und Wahrheitswerte kommen als String, `id_by_customer` je Ressource unterschiedlich. | 2026-09-12 | hoch |
| **L4** | Die Antworten führen Felder, die die Spezifikation nicht kennt — unter anderem `amount_paid` und `amount_paid_fixed` bei Belegen —, und lassen Felder aus, die die Spezifikation führt. | 2026-09-13 | hoch |
| **L5** | `rows` ist die Zeilenzahl **dieser Antwort** und keine Gesamttrefferzahl. | 2026-09-13 | hoch |
| **L6** | Zu `error_code` 15 liefert `/receipts/get` den Text `invalid field specified`, der **weder** dem `message`-Enum **noch** der `description` des `responses`-Eintrags entspricht. | 2026-09-13 | mittel |

---

## L1: `id_by_customer` im Pfad ist ein Platzhalter, kein literales Segment

**Schwere: kritisch.** Betrifft vier Endpunkte. Ohne diese Korrektur wären vier Werkzeuge
funktionsunfähig ausgeliefert worden.

### Was gemessen wurde

Ob der in der Spezifikation stehende Pfad `/receipts/get/id_by_customer` wörtlich aufzurufen
ist oder ob das letzte Segment für den Wert steht.

Die Spezifikation führt die Pfade als `/receipts/get/id_by_customer`, **ohne** an ihnen einen
Body-Parameter dieses Namens zu deklarieren. Genau deshalb ergibt der dokumentierte Aufruf mit
einem Body-Feld `id_by_customer` einen Aufruf, der nicht funktioniert: Tatsächlich gehört der
Wert an die Stelle des Segments.

> **Korrigiert am 2026-09-13.** Der frühere Einleitungssatz behauptete, die Spezifikation
> deklariere `id_by_customer` **zusätzlich als Body-Parameter**. Das trifft nicht zu. Maschinell
> aus `docs/openapi/buchhaltungsbutler-v1.json` ausgelesen führt `/receipts/get/id_by_customer`
> nur `api_key` und `get_file`, die drei übrigen Pfade nur `api_key`; der Identifikator kommt in
> der Parameterliste dieser vier Pfade überhaupt nicht vor. **Die Messungen dieses Befunds und
> alle daraus gezogenen Folgerungen bleiben unberührt**; korrigiert ist allein dieser eine Satz
> über die Spezifikationslage.

### Wie gemessen wurde und was herauskam

An `/receipts/get/id_by_customer`, drei Varianten desselben Sachverhalts:

| Variante | Aufruf | Ergebnis |
| --- | --- | --- |
| A, wie dokumentiert | `POST /receipts/get/id_by_customer`, Body `{"api_key": "…", "id_by_customer": 2}` | HTTP 400, `{"success":false,"error_code":5,"message":"invalid id_by_customer specified"}` |
| B, Wert als Segment | `POST /receipts/get/2`, Body `{"api_key": "…"}` | **HTTP 200**, vollständiger Belegdatensatz |
| C, Wert angehängt | `POST /receipts/get/id_by_customer/2`, Body `{"api_key": "…"}` | HTML-Fehlerseite, kein JSON |

An `/transactions/get/id_by_customer`, zwei Varianten:

| Variante | Aufruf | Ergebnis |
| --- | --- | --- |
| A, wie dokumentiert | `POST /transactions/get/id_by_customer`, Body mit `id_by_customer` | HTML-Fehlerseite, kein JSON. Der Pfad existiert nicht. |
| B, Wert als Segment | `POST /transactions/get/1590`, Body `{"api_key": "…"}` | **HTTP 200**, vollständiger Transaktionsdatensatz |

**Datum:** 2026-09-12. Variante B an `/receipts/get/<wert>` wurde am **2026-09-13** erneut
lesend aufgerufen und antwortete wieder mit HTTP 200 und einem vollständigen Belegdatensatz
(dieselbe Messung, die L2 und L4 für den Einzelabruf belegt). Die Varianten A und C wurden am
2026-09-13 **nicht** wiederholt; für sie gilt das Datum 2026-09-12.

### Was daraus für den Server folgt

Für alle vier Endpunkte mit `id_by_customer` im Pfad gilt: Der Wert wird in den Pfad
eingesetzt, das Segment `id_by_customer` entfällt. Ein Body-Feld `id_by_customer` wird
nicht gesendet.

| Spezifikationspfad | Tatsächlicher Aufruf | Verifiziert |
| --- | --- | --- |
| `/receipts/get/id_by_customer` | `/receipts/{id_by_customer}` bzw. `/receipts/get/{wert}` | ja, lesend gemessen |
| `/transactions/get/id_by_customer` | `/transactions/get/{wert}` | ja, lesend gemessen |
| `/receipts/delete/id_by_customer` | `/receipts/delete/{wert}` | **nein**, schreibend, nicht getestet. Analogieschluss aus den beiden gemessenen Fällen. |
| `/receipts/restore/id_by_customer` | `/receipts/restore/{wert}` | **nein**, schreibend, nicht getestet. Analogieschluss. |

Der Wert muss vor dem Einsetzen URL-kodiert werden. **Die beiden schreibenden Endpunkte sind
ausdrücklich nicht gemessen**, sondern allein aus den beiden lesend gemessenen Fällen
geschlossen; im Code sind sie als nicht verifiziert zu kennzeichnen. Warum kein schreibender
Aufruf stattfand und was zur Verifikation nötig wäre, steht im Abschnitt „Was hier ausdrücklich
nicht gemessen ist".

Zweite Folgerung: Ein nicht gerouteter Pfad antwortet mit einer **HTML-Fehlerseite**, nicht mit
JSON. Die Umschlagprüfung muss das abfangen, statt blind zu parsen.

---

## L2: Einzelabruf und Listenabruf haben getrennte Antwortverträge

**Schwere: hoch.** Ein gemeinsamer Typ über beide Endpunkte erzeugt still leere Felder.

### Was gemessen wurde

Welche Felder der Einzelabruf liefert und welche die Liste, und ob beide denselben
Sachverhalt gleich benennen.

### Wie gemessen wurde und was herauskam

`/receipts/get/{wert}` liefert unter anderem `amount_original`, `currency_original` und
`exchangerate`, also die Fremdwährungsfelder. Sie fehlen der **Listenantwort**: `/receipts/get`
führt sie weder in der gemessenen Antwort noch in der Spezifikation. Der Einzelabruf liefert
damit Felder, die der Listenabruf nicht enthält.

**Nicht der Spezifikation.** Für den Einzelabruf führt sie die drei Felder sehr wohl:
`definitions.ReceiptsGetIdByCustomer_Success.properties.data.properties` nennt 23 Felder
einschließlich `amount_original`, `currency_original` und `exchangerate`; die Listendefinition
`definitions.ReceiptsGet_Success.properties.data.items.properties` nennt 14 Felder ohne sie.
Welche Felder der Einzelabruf gegenüber seiner Spezifikation zusätzlich liefert und welche er
schuldig bleibt, steht in L4 — es sind `amount_paid` und `amount_paid_fixed` beziehungsweise
`file_content` und `file_type`, nicht die Fremdwährungsfelder.

`/transactions/get/{wert}` liefert `account`, `to_from`, `booking_date`, `value_date`,
`amount`, `currency`, `account_number`, `bank_code`, `bank_name`, `purpose`, `type`,
`booking_text`. Felder ohne Wert kommen als JSON-`null`, nicht als leerer String.

Am **2026-09-13** wurden die beiden Belegendpunkte erneut lesend gemessen und die Feldmengen
maschinell verglichen:

| Endpunkt | Aufruf | Felder | Umschlag |
| --- | --- | --- | --- |
| Liste | `POST /receipts/get`, Body `{"api_key": "…", "list_direction": "inbound", "limit": 3, "offset": 0}` | **16** je Zeile, in allen drei Zeilen dieselbe Menge | `success`, `message`, `rows`, `data` (Array) |
| Einzelabruf | `POST /receipts/get/<wert>`, Body `{"api_key": "…"}` | **23** | `success`, `message`, `data` (Objekt), **kein `rows`** |

Derselbe Sachverhalt heißt an beiden Endpunkten anders:

| Sachverhalt | Liste `/receipts/get` | Einzelabruf `/receipts/get/{wert}` |
| --- | --- | --- |
| Leistungsdatum | `delivery_date` | `date_delivery` |
| Fälligkeit | `due_date` | `date_payment_due` |

**Datum:** 2026-09-12 für die Transaktionsendpunkte, **2026-09-13** für die beiden
Belegendpunkte.

### Was daraus für den Server folgt

- Die Antwortvalidierung darf unbekannte Felder **nicht** ablehnen (siehe L4).
- Antwortverträge werden **je Endpunkt** gegen die gemessene Antwort gebildet, nicht gegen die
  Spezifikation und nicht gemeinsam über mehrere Endpunkte.
- Ein gemeinsamer Belegtyp über Liste und Einzelabruf erzeugte genau an `due_date` bzw.
  `date_payment_due` eine still leere Fälligkeit — ein Fehler, den kein Schema meldet.
- Der Einzelabruf trägt **kein** `rows`. Wer generisch danach greift, liest `undefined`
  (siehe L5).

---

## L3: Typ-Asymmetrie bestätigt

**Schwere: hoch.** Betrifft jede Zahl und jeden Wahrheitswert, die aus der API kommen.

### Was gemessen wurde

Ob die JSON-Typen der Antwort denen der Spezifikation entsprechen und ob sie über die
Ressourcen hinweg einheitlich sind.

### Wie gemessen wurde und was herauskam

`amount` kommt als String mit Punkt als Dezimaltrennzeichen (`"1234.56"`, `"-9876.54"`,
frei gewählte Platzhalter in der gemessenen Form; dass sie in keinem Datensatz dieses Mandanten
vorkommen, ist im Abschnitt „Anonymisierung" geprüft und belegt),
obwohl beim Schreiben eine JSON-Zahl erwartet wird. `id_by_customer` kommt bei Belegen als
String (`"2"`), bei Transaktionen als Zahl (`1590`). Die Asymmetrie ist also nicht einmal
zwischen den Ressourcen einheitlich und muss je Feld behandelt werden.

Die Messung vom **2026-09-13** bestätigt die Belegseite in allen Punkten: An
`/receipts/get` sind `amount`, `amount_paid`, `amount_paid_fixed`, `account`, `deleted` und
`id_by_customer` durchgehend JSON-Strings; `deleted` trägt `"0"`, nicht `false`. Am
Einzelabruf ist `e_invoice_type` dagegen eine JSON-**Zahl**. Nicht gesetzte Felder kommen an
beiden Endpunkten als JSON-`null`, nie als leerer String.

**Datum:** 2026-09-12, Belegseite am 2026-09-13 bestätigt.

### Was daraus für den Server folgt

Die Typumwandlung arbeitet **je Feld** und nach gemessenem Typ, nicht nach dem Typ der
Spezifikation. `"0"` und `"1"` sind die gemessene Form eines Wahrheitswerts. Eine Umwandlung,
die schiefgeht, verwirft den Wert nicht, sondern reicht ihn durch und meldet eine Warnung.

---

## L4: Felder, die die Spezifikation nicht kennt, und Felder, die sie vergeblich verspricht

**Schwere: hoch.** Ein geschlossener Antwortvertrag verlöre hier Daten, und `amount_paid` ist
eine Falle: Wer es für bare Münze nimmt, meldet jeden bezahlten Beleg als unbezahlt.

### Was gemessen wurde

Die Feldnamen der Antwort von `/receipts/get` und `/receipts/get/{wert}` gegen die Felder, die
die Spezifikation für diese Endpunkte führt — in beide Richtungen: was kommt und steht nicht
in der Spezifikation, und was steht in der Spezifikation und kommt nicht.

### Wie gemessen wurde

Drei lesende Aufrufe und zwei maschinelle Mengenvergleiche.

```
POST /receipts/get
Body: {"api_key": "…", "list_direction": "inbound", "limit": 3,   "offset": 0}
Body: {"api_key": "…", "list_direction": "inbound", "limit": 500, "offset": 0}

POST /receipts/get/<wert>
Body: {"api_key": "…"}
```

Die Vergleichsmengen aus der Spezifikation:

```
jq '.definitions.ReceiptsGet_Success.properties.data.items.properties | keys' \
   docs/openapi/buchhaltungsbutler-v1.json
jq '.definitions.ReceiptsGetIdByCustomer_Success.properties.data.properties | keys' \
   docs/openapi/buchhaltungsbutler-v1.json
```

### Ergebnis

**Listenabruf `/receipts/get`** — 16 gelieferte Felder gegen 14 der Spezifikation, 13 davon
gemeinsam:

| Richtung | Felder |
| --- | --- |
| Geliefert, **von der Spezifikation nicht geführt** | `amount_paid`, `amount_paid_fixed`, `delivery_date` |
| Von der Spezifikation geführt, **nicht geliefert** | `date_delivery` |

`delivery_date` und `date_delivery` sind derselbe Sachverhalt unter zwei Namen: Die
Spezifikation nennt für die Liste den Namen, den tatsächlich der Einzelabruf verwendet
(siehe L2).

**Einzelabruf `/receipts/get/{wert}`** — 23 gelieferte Felder gegen 23 der Spezifikation,
21 davon gemeinsam:

| Richtung | Felder |
| --- | --- |
| Geliefert, **von der Spezifikation nicht geführt** | `amount_paid`, `amount_paid_fixed` |
| Von der Spezifikation geführt, **nicht geliefert** | `file_content`, `file_type` |

`file_content` und `file_type` sind an den Parameter `get_file` gebunden, der an diesem Pfad
deklariert ist; der gemessene Aufruf setzte ihn nicht. Dass die beiden Felder **mit**
`get_file: true` kommen, ist **nicht gemessen** — dieser Zweig wurde nicht aufgerufen.

**`amount_paid` und `amount_paid_fixed` sind in diesem Mandanten funktionslos, und zwar
gemessen.** Über die 500 Zeilen des Aufrufs mit `limit: 500`:

| Feld | Werteverteilung über 500 Zeilen |
| --- | --- |
| `amount_paid` | 500 × `"0.00"` |
| `amount_paid_fixed` | 500 × `"0.00"` |
| `payment_date` | 493 × gesetzt, 7 × `null` |

493 Belege tragen ein Zahlungsdatum, und trotzdem steht in allen 500 Zeilen ein gezahlter
Betrag von `"0.00"`. Weder eine Teilzahlung noch ein offener Betrag folgt aus diesen Feldern.
Die **Bedeutung** von `amount_paid_fixed` ist **nicht ermittelt**. Ob andere Mandanten die
beiden Felder füllen, ist ebenfalls **nicht ermittelt** — gemessen ist genau einer.

Ein anonymisierter Auszug einer Listenzeile in der gemessenen Form (Feldnamen, Reihenfolge und
JSON-Typen sind echt, alle Geschäftswerte sind Platzhalter; `amount_paid`, `amount_paid_fixed`
und `deleted` stehen als strukturelle Messwerte im Original):

```json
{
  "filename": "2026-08-14_Musterlieferant(Eingang)_RE-26-00815_<Kennung>.pdf",
  "id_by_customer": "4711",
  "type": "invoice inbound",
  "date": "2026-08-14",
  "delivery_date": null,
  "date_uploaded": "2026-08-15",
  "counterparty": "Musterlieferant",
  "invoicenumber": "RE-26-00815",
  "amount": "119.00",
  "payment_date": "2026-08-20",
  "due_date": null,
  "account": "9999",
  "amount_paid": "0.00",
  "amount_paid_fixed": "0.00",
  "deleted": "0",
  "link_to_receipt_id_by_customer": null
}
```

Zwei Formangaben aus derselben Messung, weil sie leicht falsch geraten werden:
`date_uploaded` kam in allen 500 Zeilen als **reines Datum** (`YYYY-MM-DD`, zehn Zeichen), nicht
als Zeitstempel mit Uhrzeit. `type` trug in allen 500 Zeilen den Wert `"invoice inbound"` —
also den Wortlaut aus dem Wertevorrat der Spezifikation (`invoice inbound`, `invoice outbound`,
`credit inbound`, `credit outbound`), nicht eine Kurzform.

**Datum:** 2026-09-13.

### Was daraus für den Server folgt

- **Unbekannte Felder werden durchgereicht und gezählt, nicht verworfen.** Verwerfen wäre
  Datenverlust, und ein geschlossener Vertrag machte den Server bei der nächsten
  Anbieteränderung unbrauchbar.
- `amount_paid` und `amount_paid_fixed` stehen **im** Antwortvertrag, obwohl die Spezifikation
  sie nicht führt — damit sie nicht als unbekanntes Feld in den Vertragswarnungen auftauchen.
  Sie stehen dort **nicht**, weil sie gedeutet wären.
- Die Werkzeugbeschreibung muss ausdrücklich warnen: Den Zahlungsstand trägt allein
  `payment_date`, nicht `amount_paid`.
- Ein Feld, das die Spezifikation verspricht und die Antwort nicht liefert, darf nicht als
  Pflichtfeld modelliert werden.

---

## L5: `rows` ist die Zeilenzahl dieser Antwort, keine Gesamttrefferzahl

**Schwere: hoch.** Ein Agent, der `rows` für die Gesamtzahl hält, hört nach der ersten Seite
auf zu blättern und hält ein unvollständiges Ergebnis für vollständig — ohne Fehlermeldung.

### Was gemessen wurde

Ob `rows` mit `limit` und `offset` mitwandert. Wandert es mit, kann es keine Gesamtzahl sein.

### Wie gemessen wurde

Vier lesende Aufrufe gegen **dieselbe Treffermenge** — `list_direction: "inbound"`, sonst
kein Filter —, verändert wurden allein `limit` und `offset`:

```
POST /receipts/get
Body: {"api_key": "…", "list_direction": "inbound", "limit": 3,   "offset": 0}
Body: {"api_key": "…", "list_direction": "inbound", "limit": 50,  "offset": 0}
Body: {"api_key": "…", "list_direction": "inbound", "limit": 500, "offset": 0}
Body: {"api_key": "…", "list_direction": "inbound", "limit": 500, "offset": 500}
```

### Ergebnis

| `limit` | `offset` | HTTP | `rows` | Länge von `data` |
| --- | --- | --- | --- | --- |
| 3 | 0 | 200 | **3** | 3 |
| 50 | 0 | 200 | **50** | 50 |
| 500 | 0 | 200 | **500** | 500 |
| 500 | 500 | 200 | **189** | 189 |

`rows` nimmt bei unveränderter Treffermenge vier verschiedene Werte an und stimmt in jedem
der vier Aufrufe exakt mit der Länge von `data` überein. Eine Gesamttrefferzahl kann sich
nicht mit dem `limit` ändern. Die Treffermenge selbst umfasst 689 Zeilen (500 + 189) — und
**genau dieser Wert erscheint in keiner der vier Antworten**.

Die letzte Seite ist der entscheidende Fall: `limit: 500` bei `offset: 500` liefert `rows: 189`,
also **weniger als das `limit`**. `rows` folgt damit auch nicht dem `limit`, sondern zählt die
tatsächlich gelieferten Zeilen.

Zwei Beobachtungen am Rand derselben Messreihe:

1. **Der Einzelabruf trägt gar kein `rows`.** Gemessen am selben Tag mit dem Aufruf aus L4:
   `POST /receipts/get/<wert>` antwortet mit den Schlüsseln `success`, `message` und `data`;
   `data` ist ein Objekt. Ein `rows` gibt es dort nicht (siehe L2).
2. **Die Spezifikation beschreibt `rows` widersprüchlich.** Die `description` lautet
   „Number of returned rows" und trifft damit zu. Das danebenstehende `enum` lautet `[1]` und
   behauptet, `rows` sei immer genau 1 — gemessen wurden 3, 50, 500 und 189. Das `enum` ist
   ein Beispielwert, kein Wertevorrat, und darf nicht als Einschränkung generiert werden.

**Datum:** 2026-09-13.

### Was daraus für den Server folgt

- `rows` wird **unverändert** durchgereicht und niemals als Gesamttrefferzahl ausgegeben oder
  in eine solche umgedeutet.
- Ein Bestandshinweis („es könnte mehr geben") wird daraus gebildet, dass `rows` das
  angeforderte `limit` erreicht — nicht daraus, dass `rows` kleiner als irgendeine Gesamtzahl
  wäre. Es gibt keine Gesamtzahl.
- Geblättert wird, bis eine Seite **kürzer als das `limit`** zurückkommt.
- Außerhalb der Listenform ist die Zeilenzahl `null`, nicht `0`. `0` behauptete eine leere
  Liste, wo es gar keine Liste gibt.

---

## L6: Der Antworttext zu `error_code` 15 steht in keiner Spezifikationsquelle

**Schwere: mittel.** Betrifft die Fehlerdarstellung, nicht die Datenrichtigkeit. Wer den
Katalogtext anzeigt, zeigt dem Nutzer einen Satz, den die Gegenstelle nie gesagt hat.

### Was gemessen wurde

Der **wörtliche** Inhalt von `message`, wenn `/receipts/get` mit einem ungültigen Sortierfeld
aufgerufen wird — und ob er mit den beiden Texten übereinstimmt, die die Spezifikation für
denselben Fehlercode führt.

### Wie gemessen wurde

Ein lesender Aufruf mit einem absichtlich ungültigen Sortierschlüssel:

```
POST /receipts/get
Body: {"api_key": "…", "list_direction": "inbound", "limit": 3,
       "order": {"nicht_existierendes_feld": "ASC"}}
```

Die beiden Vergleichstexte aus der Spezifikation:

```
jq -r '.definitions.ReceiptsGet_ErrorCode15.properties.message.enum[0]' \
   docs/openapi/buchhaltungsbutler-v1.json
jq -r '.paths["/receipts/get"].post.responses["400 (15)"].description' \
   docs/openapi/buchhaltungsbutler-v1.json
```

### Ergebnis

HTTP **400**. Der Antwortkörper wörtlich, unverändert und vollständig:

```json
{"success":false,"error_code":15,"message":"invalid field specified"}
```

Der Dreiervergleich:

| Quelle | Text |
| --- | --- |
| **Antwort der Schnittstelle** | `invalid field specified` |
| `.definitions.ReceiptsGet_ErrorCode15.properties.message.enum[0]` | `invalid sort field specified` |
| `.paths["/receipts/get"].post.responses["400 (15)"].description` | `invalid sort field is specified` |

**Alle drei Texte weichen voneinander ab.** Die Spezifikation ist nicht einmal mit sich selbst
einig: Das `enum` der Definition und die `description` desselben `responses`-Eintrags
unterscheiden sich um das Wort „is". Die Schnittstelle wiederum lässt „sort" ganz weg.

**Datum:** 2026-09-13.

### Was daraus für den Server folgt

- **Der Wortlaut der Antwort gewinnt.** Trägt die Antwort ein `message`, wird dieses wörtlich
  wiedergegeben und als Fremdtext der Gegenstelle gekennzeichnet. Der Katalogtext tritt nicht
  an seine Stelle.
- Der Katalogtext wird **nur** eingesetzt, wenn die Antwort keinen Text trägt, und ist dann als
  Text aus der Spezifikation zu kennzeichnen — sonst behauptete der Server eine Aussage der
  Gegenstelle, die es nicht gab.
- Eine Fehlererkennung darf **nicht** auf den Text gehen. Maßgeblich sind HTTP-Status und
  `error_code`; der Text ist Anzeige, nicht Logik.
- `error_code` 15 ist bei `/receipts/get` ein Eingabefehler des Aufrufers und gehört in die
  Klasse „input", nicht in die der vorübergehenden Störungen.

---

## Was hier ausdrücklich nicht gemessen ist

**Kein einziger schreibender Aufruf wurde gegen die BuchhaltungsButler-API ausgeführt** — weder
gegen die Produktivumgebung noch gegen eine andere, weil keine andere existiert. Die einzigen
verfügbaren Zugangsdaten öffnen die Produktivbuchhaltung. Ein Test- oder Demo-Mandant und eine
vom Anbieter bereitgestellte Sandbox sind weder dokumentiert noch mit Zugangsdaten hinterlegt;
geprüft wurden dafür die Zugangsdaten selbst und die gesamte Dokumentation dieses Projekts.
Diese Feststellung ist ein Ergebnis und kein Fehlschlag: Sie ist der Grund, warum die folgenden
sechs Punkte offen sind, und sie ist zugleich die Bedingung, unter der sie sich schließen ließen.

1. **Die Pfadsegmentform von `/receipts/delete/<wert>` und `/receipts/restore/<wert>`.**
   **Abgeleitet, nicht gemessen** — ein Analogieschluss aus den beiden lesend gemessenen Fällen
   `/receipts/get/<wert>` und `/transactions/get/<wert>` in L1. Gegen diese beiden
   Endpunkte wurde kein Aufruf ausgeführt, weder in der Segment- noch in der Body-Feld-Form.
   Dass die vier Pfade in der Spezifikation gleich gebaut sind und dass an keinem von ihnen ein
   Body-Parameter `id_by_customer` deklariert ist, stützt den Schluss, beweist ihn aber nicht.
2. **Das Wiederholungsverhalten der löschenden und aufhebenden Endpunkte** —
   `/receipts/delete`, `/receipts/restore`, die drei `/postings/unconfirm/*`-Varianten,
   `/transactions/unassign/receipt` und `/postings/cancel`. Ob ein zweiter Aufruf mit
   identischen Argumenten still durchgeht oder einen Fehler liefert, ist **nicht verifiziert**:
   kein Aufruf, kein Doppelaufruf, keine Beobachtung. Bis das geklärt ist, darf keiner dieser
   Endpunkte als wiederholbar behandelt werden.
3. **Das Betragsformat beim Senden.** Beim Lesen ist belegt, dass `amount` als String mit Punkt
   und zwei Nachkommastellen kommt (L3). Was die API beim **Schreiben** annimmt —
   JSON-Zahl, String, Tausendertrennzeichen —, ist **nicht verifiziert**; die Spezifikation
   zeigt dort eine JSON-Zahl.
4. **Ob `/postings/assign/receipt-to-free-posting` einen bestehenden Belegbezug ersetzt oder nur
   ergänzt, und ob sich die Bindung wieder lösen lässt.** Beides **nicht verifiziert**. Belegt
   ist nur, dass es unter `/postings/` keinen `unassign`-Pfad gibt: Die Spezifikation führt dort
   ausschließlich `add`, `add-batch`, `assign`, `cancel`, `get` und `unconfirm`.
5. **Der Zweig `get_file: true` an `/receipts/get/<wert>`.** Dass er die Felder `file_content`
   und `file_type` nachliefert, steht in der Spezifikation und ist **nicht gemessen** (L4). Der
   Aufruf unterblieb, weil er die Belegdatei als Base64 in die Antwort zöge und damit eine sehr
   große Antwort erzeugte, ohne einen offenen Punkt zu schließen.
6. **Ob `amount_paid` und `amount_paid_fixed` in anderen Mandanten gefüllt sind.** Gemessen ist
   genau ein Mandant, und dort sind beide Felder über 500 Zeilen hinweg durchgehend `"0.00"`
   (L4). Ob das eine Eigenschaft der API oder eine Eigenschaft dieses Mandanten ist, ist
   **nicht ermittelt**.

**Was einen dieser Punkte schließen würde:** Datum, genaue Aufrufform, HTTP-Status und
Antwortkörper je geprüftem Endpunkt — und für das Wiederholungsverhalten mindestens zwei
aufeinanderfolgende Aufrufe mit identischen Argumenten gegen denselben Datensatz. Solange das
fehlt, bleibt jede dieser Aussagen abgeleitet und ist an jeder Stelle, an der sie benutzt wird,
als abgeleitet zu kennzeichnen.
