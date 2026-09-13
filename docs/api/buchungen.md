# Buchungen (Postings)

Referenzdossier zu den `/postings`-Endpunkten der BuchhaltungsButler-API v1.

## Quellen und Geltung

| Angabe | Wert |
| --- | --- |
| Primärquelle | `docs/openapi/buchhaltungsbutler-v1.json` |
| Herkunft der Primärquelle | `https://app.buchhaltungsbutler.de/docs/api/v1.de.json` |
| API-Version laut `info.version` | 1.9.1 |
| Abrufdatum aller Angaben | 2026-09-12 |
| Live-Verifikation | echte Mandantenbuchhaltung, nur lesende Aufrufe auf `/postings/get`, 2026-09-12 |

Die lokale Kopie wurde am 2026-09-12 erneut gegen die Onlinequelle geprüft. Nach Normalisierung mit
`jq -S` sind beide Dateien inhaltlich identisch (`info.version` 1.9.1, zwölf `/postings`-Pfade).
Alles, was in diesem Dossier ohne gesonderte Kennzeichnung steht, stammt aus dieser Datei.
Aussagen aus Live-Tests sind als solche markiert. Aussagen, die weder aus der Datei noch aus einem
Live-Test belegt sind, sind mit **Annahme** oder **nicht verifiziert** gekennzeichnet.

Ein Nebenbefund vorweg: Ein `WebFetch` auf die Onlinequelle lieferte die Auskunft, die Datei enthalte
keine `/postings`-Pfade. Das ist falsch und vermutlich eine Folge der Kürzung der 724 KB großen Datei
durch das Fetch-Werkzeug. Der direkte Download widerlegt diese Auskunft.

---

## 1. Grundlagen, die für alle zwölf Endpunkte gelten

### 1.1 Transport und Authentifizierung

| Aspekt | Wert |
| --- | --- |
| Basis-URL | `https://webapp.buchhaltungsbutler.de/api/v1` |
| HTTP-Methode | immer `POST`, auch für rein lesende Endpunkte |
| Content-Type | `application/json` |
| Authentifizierung | HTTP Basic Auth, Benutzername = API Client, Passwort = API Secret |
| Mandantenauswahl | Pflichtfeld `api_key` im JSON-Body, zusätzlich zu Basic Auth |
| Rate Limit | 100 Requests pro Mandant und Minute (Angabe aus der Dokumentation) |

Die Spezifikationsdatei enthält weder `securityDefinitions` noch einen `security`-Block. Basic Auth ist
dort also nicht formal beschrieben, sondern nur über die Praxis belegt. Das ist eine Lücke der Datei,
kein Hinweis darauf, dass keine Authentifizierung nötig wäre.

`api_key` ist kein Geheimnis im Sinne eines zweiten Passworts, sondern ein Mandantenselektor: Ein
API-Client kann für mehrere Mandanten freigeschaltet sein und wählt über `api_key` aus, wessen Bücher
er gerade anfasst. Ein falscher `api_key` liefert `error_code` 4.

### 1.2 Antwortumschlag

Erfolg bei lesenden Endpunkten:

```json
{ "success": true, "message": "", "rows": 3, "data": [] }
```

Erfolg bei schreibenden Einzelendpunkten:

```json
{ "success": true, "message": "" }
```

Fehler, einheitlich über alle Endpunkte:

```json
{ "success": false, "error_code": 5, "message": "invalid date_from specified" }
```

Die Batch-Endpunkte weichen von beiden Formen ab, siehe die Abschnitte 11.3, 13.3 und 15.3.

Der HTTP-Status trägt Information, die `error_code` nicht trägt, und umgekehrt: Der Schlüssel
`error_code` wird pro Endpunkt neu vergeben. `error_code` 5 bedeutet bei `/postings/get`
"invalid date_from specified", bei `/postings/add/free` "invalid posting type specified" und bei
`/postings/cancel` "Parameter posting_id_by_customer is required." Ein Client darf `error_code`
niemals endpunktübergreifend interpretieren.

Die Spezifikation kodiert HTTP-Status und `error_code` gemeinsam im Schlüssel des
`responses`-Objekts, etwa `"400 (17)"`. Das ist keine gültige Swagger-Notation und muss beim Parsen
zerlegt werden.

### 1.3 Bekannte Formfehler der Spezifikationsdatei

Die Datei ist kein valides Swagger 2.0. Body-Parameter stehen als Liste einzelner Einträge mit
`"in": "body"` und eigenem `"type"`, statt gebündelt in einem gemeinsamen `schema`-Objekt. Fachlich
sind alle diese Einträge Felder **eines** JSON-Bodys. Codegeneratoren erzeugen daraus falsche Clients.

Weitere Formfehler, die speziell die `/postings`-Pfade betreffen, sind in Abschnitt 21 gesammelt.

---

## 2. Die drei Buchungsarten

BuchhaltungsButler kennt genau drei Wege, eine Buchung zu erzeugen. Die Wahl ist nicht frei, sondern
ergibt sich aus dem Objekt, an dem die Buchung hängt.

### 2.1 Belegbuchung (`/postings/add/receipt`)

Die Buchung hängt an einem Beleg, identifiziert über `receipt_id_by_customer`. Fachlich bucht sie die
Rechnung selbst, nicht deren Bezahlung. Typischer Buchungssatz einer Eingangsrechnung: Aufwandskonto
an Kreditorenkonto.

Voraussetzung laut Endpunktbeschreibung: "Receipt postings are only available if creditor or debtor
posting is activated." Ohne aktivierte Kreditoren- beziehungsweise Debitorenbuchhaltung liefert der
Endpunkt `error_code` 10 oder 12. Das ist eine Mandanteneinstellung, die die API nicht setzen kann.

Die Gegenseite des Buchungssatzes wird nicht als Konto übergeben, sondern über `creditor`
beziehungsweise `debtor` als Personenkontonummer. Welches der beiden gilt, hängt an der Belegrichtung:
Eingangsrechnung braucht `creditor`, Ausgangsrechnung braucht `debtor`.

### 2.2 Transaktionsbuchung (`/postings/add/transaction`)

Die Buchung hängt an einer Bank- oder Kassentransaktion, identifiziert über
`transaction_id_by_customer`. Fachlich bucht sie den Zahlungsvorgang. Die Gegenseite ist implizit das
Finanzkonto, auf dem die Transaktion liegt; es wird nicht übergeben, sondern von der Transaktion
mitgebracht.

Ist die Offene-Posten-Buchhaltung aktiviert, muss über `oi_receipts_ids_by_customer` pro Buchungszeile
angegeben werden, welcher offene Beleg durch die Zahlung ausgeglichen wird, oder explizit `null`.

### 2.3 Freie Buchung (`/postings/add/free`)

Die Buchung hängt an nichts. Beide Seiten des Buchungssatzes werden explizit übergeben:
`postingaccount_debit` und `postingaccount_credit`. Fachlich für Sachverhalte ohne Beleg und ohne
Zahlung: Abschreibungen, Umbuchungen, Rückstellungen, Korrekturen, Eröffnungsbilanzwerte.

Eine freie Buchung kann nachträglich mit einem Beleg verknüpft werden, siehe
`/postings/assign/receipt-to-free-posting`.

### 2.4 Entscheidungsregel

| Ausgangslage | Endpunkt |
| --- | --- |
| Es existiert ein Beleg in BuchhaltungsButler, die Rechnung selbst soll gebucht werden | `/postings/add/receipt` |
| Es existiert eine Transaktion, der Zahlungsvorgang soll gebucht werden | `/postings/add/transaction` |
| Weder Beleg noch Transaktion, reiner Sachverhalt | `/postings/add/free` |

Zwei Fehlerfälle machen deutlich, dass Beleg- und Transaktionsbuchung einander ausschließen, sobald
Beleg und Transaktion verknüpft sind: `/postings/add/receipt` liefert `error_code` 16
("a transaction linked to the receipt has already been posted"), `/postings/add/transaction` liefert
spiegelbildlich `error_code` 7 ("a receipt linked to the transaction has already been posted"). Wer
also einen Beleg über die zugehörige Transaktion bucht, kann ihn nicht zusätzlich direkt bebuchen.

---

## 3. Soll, Haben und Gegenkonto

### 3.1 Wo Soll und Haben explizit sind

Nur die freie Buchung verlangt beide Seiten:

- `postingaccount_debit` ist die Sollseite (Debit).
- `postingaccount_credit` ist die Habenseite (Credit).

Beide Konten müssen verschieden sein, sonst `error_code` 26 ("The postingaccount_credit is identical
to the postingaccount_debit").

Beträge sind bei der freien Buchung ausdrücklich positiv zu übergeben: `error_code` 22 lautet "there
are no negative amounts allowed". Die Richtung wird also allein durch die Zuordnung zu
`postingaccount_debit` und `postingaccount_credit` ausgedrückt, nicht durch das Vorzeichen.

### 3.2 Wo Soll und Haben implizit sind

Bei Beleg- und Transaktionsbuchung wird pro Buchungszeile nur **ein** Konto übergeben, nämlich das
Element des Arrays `postingaccounts`. Die Gegenseite ergibt sich aus dem Kontext:

- Belegbuchung: Gegenkonto ist das Personenkonto aus `creditor` oder `debtor`.
- Transaktionsbuchung: Gegenkonto ist das Finanzkonto der Transaktion.

Welche Seite dabei Soll und welche Haben ist, ergibt sich aus der Richtung des Belegs
beziehungsweise aus dem Vorzeichen des Transaktionsbetrags. Die API bietet hierfür keinen Parameter.
Ein Agent kann die Richtung also nicht steuern und muss sie auch nicht raten.

### 3.3 `credit_type` in der Leseantwort

`/postings/get` liefert pro Zeile ein Feld `credit_type`. Live beobachtete Werte: `"S"` und `"H"`.
Die naheliegende Lesart ist Soll und Haben. Welches Konto der Zeile durch `credit_type` bezeichnet
wird, ist aus der Spezifikation nicht ableitbar, da jede Zeile ohnehin `debit_postingaccount_number`
**und** `credit_postingaccount_number` mitführt. **Nicht verifiziert**, wofür `credit_type` genau
steht.

Beobachtung aus dem Live-Test (200 Zeilen, 2024-01-01 bis 2026-12-31): Alle Zeilen ohne Beleg- und
ohne Transaktionsbezug, also mutmaßlich freie Buchungen, trugen `credit_type` `"S"`. Ein separater
Live-Abruf mit `account: "free booking"` bestätigte das für fünf weitere Zeilen. Das ist eine
Beobachtung auf einem Datensatz, keine dokumentierte Regel.

---

## 4. Steuerschlüssel und Umsatzsteuer

### 4.1 Die Eingabeseite: `vat` beziehungsweise `vats`

Alle drei Schreib-Endpunkte erwarten einen Steuerschlüssel als Zeichenkette aus einer festen Liste.
Die Liste ist in `/postings/add/receipt`, `/postings/add/transaction` und `/postings/add/free`
wortgleich hinterlegt und umfasst 23 Einträge.

| Wert | Bedeutung laut Spezifikation |
| --- | --- |
| `0_none` | keine Ust. |
| `19_vat` | 19% Ust. |
| `7_vat` | 7% Ust. |
| `19_pre` | 19% Vst. |
| `7_pre` | 7% Vst. |
| `19_both_1` | §13b 19% USt./VSt. |
| `19_both_506` | §13b 19% USt./VSt. (EU §13b Abs. 1) |
| `19_both_6506` | §13b 19% USt. (EU §13b Abs. 1, ohne VSt.) |
| `19_both_511` | §13b 19% USt./VSt. (Drittland §13b Abs. 2 Nr. 1) |
| `19_both_6511` | §13b 19% USt. (Drittland §13b Abs. 2 Nr. 1, ohne VSt.) |
| `19_both_6501` | §13b 19/16% USt. (ohne VSt.) |
| `19_both_2` | I.g.E. 19% USt./VSt. |
| `7_both` | I.g.E. 7% USt./VSt. |
| `19_both_1_no_pre` | §13b 19/16% USt. |
| `19_both_2_no_pre` | i.g.E. 19/16% USt. |
| `7_both_no_pre` | i.g.E. 7/5% USt. |
| `19_pre_app` | 19/16% Aufz. VSt. |
| `7_pre_app` | 7/5% Aufz. VSt. |
| `19_both_app_1` | §13b 19/16% USt./Aufz. VSt. |
| `19_both_app_506` | §13b 19/16% USt./Aufz. VSt. (EU §13b Abs. 1) |
| `19_both_app_511` | §13b 19/16% USt./Aufz. VSt. (Drittland §13b Abs. 2 Nr. 1) |
| `19_both_app_2` | i.g.E. 19/16% USt./Aufz. VSt. |
| `7_both_app` | i.g.E. 7/5% USt./Aufz. VSt. |

Lesehilfe für die Namensbestandteile, hergeleitet aus den Klartexten der Spezifikation:

- `_vat` steht für Umsatzsteuer, also die Steuer auf Ausgangsumsätze.
- `_pre` steht für Vorsteuer, also die Steuer auf Eingangsumsätze.
- `_both` steht für Fälle, in denen dieselbe Buchung Umsatzsteuer **und** Vorsteuer auslöst, typisch
  bei Reverse Charge nach §13b UStG und beim innergemeinschaftlichen Erwerb.
- `no_pre` und die `65xx`-Varianten bezeichnen Reverse-Charge-Fälle **ohne** Vorsteuerabzug, etwa bei
  steuerfreien Ausgangsumsätzen.
- `_app` steht laut Klartext für "Aufz. VSt.", also aufzuteilende Vorsteuer bei gemischter Verwendung.
- Die Zahlenpaare `19/16` und `7/5` in den Klartexten verweisen auf die zeitweilig abgesenkten Sätze
  des zweiten Halbjahrs 2020. Welcher Satz gilt, entscheidet die API anhand des Buchungsdatums, nicht
  der Aufrufer. Belegt wird das durch `error_code` 42 bei `/postings/add/receipt`: "the vat option is
  not available for this date".

Die Auswahl ist nicht frei kombinierbar mit dem Buchungskonto. Mehrere Fehlercodes erzwingen
Konsistenz, unter anderem:

- Das Konto schreibt einen bestimmten Schlüssel vor (`error_code` 24 bei `/postings/add/receipt`,
  16 bei `/postings/add/transaction`, 27 bei `/postings/add/free`).
- Das Konto verlangt eine bestimmte Steuerklasse (26 bei receipt, 17 bei transaction, 29 bei free).
- Der Schlüssel ist durch die Mandanteneinstellungen gesperrt (28/29 bei receipt, 19/20 bei
  transaction, 33/34 bei free), insbesondere bei Kleinunternehmerregelung
  ("not liable to sales tax").

### 4.2 Die Ausgabeseite: `vat` und `tax_key`

`/postings/get` liefert zwei verschiedene Felder:

- `vat` ist der Steuersatz als Dezimalzahl in einer Zeichenkette. Live beobachtet: `"0.00"`,
  `"7.00"`, `"19.00"`.
- `tax_key` ist der numerische DATEV-Steuerschlüssel als Zeichenkette. Live beobachtet: `"0"`, `"8"`,
  `"9"`, `"94"`.

Live beobachtete Kombinationen aus 200 Zeilen: `0.00/0`, `19.00/0`, `19.00/9`, `19.00/94`, `7.00/8`.
Aus `vat` allein lässt sich `tax_key` also nicht ableiten und umgekehrt.

Entscheidend für die Implementierung: **Die Eingabe- und die Ausgabeseite verwenden verschiedene
Vokabulare.** Was beim Schreiben als `19_pre` hineingeht, kommt beim Lesen als `vat` `"19.00"` plus
ein `tax_key` heraus. Eine Rückübersetzung von `vat`/`tax_key` nach `19_pre` ist aus der
Spezifikation nicht ableitbar. **Nicht verifiziert.** Ein Round-Trip "lesen, ändern, zurückschreiben"
ist damit nicht ohne Weiteres möglich.

Kein Schreib-Endpunkt nimmt `tax_key` als Parameter entgegen, obwohl mehrere Endpunkte
`error_code` "invalid tax key specified" definieren (27 bei receipt, 18 bei transaction, 32 bei free).
Der Steuerschlüssel wird also serverseitig aus Konto, Gegenkonto und `vat`-Option abgeleitet.

---

## 5. Kostenstellen

Alle drei Schreib-Endpunkte kennen zwei Kostenstellenebenen:

| Endpunkt | Feldnamen |
| --- | --- |
| `/postings/add/free` | `cost_location`, `cost_location_two` (Einzelwerte, Typ `string`) |
| `/postings/add/receipt`, `/postings/add/transaction` | `cost_locations`, `cost_locations_two` (Arrays) |

Validierungsregeln, aus den Fehlermeldungen abgeleitet:

- höchstens 10 Zeichen (receipt 32/44, transaction 22/31, free 16/36)
- alphanumerisch oder eine Zahl größer als 0 (receipt 33/45, transaction 24/32, free 17/37)

Gültige Kostenstellen holt man über `/cost-locations/get`. Deren Antwort liefert `code` und `name`;
zu übergeben ist der `code`.

`/postings/get` filtert über den Einzelparameter `cost_location`. Ein Filter auf die zweite Ebene
existiert nicht, obwohl die Antwort `cost_location_two` mitliefert. Das ist eine Asymmetrie der API.

---

## 6. Beträge, Datumsformate, Vorzeichen

### 6.1 Beträge

| Kontext | Format laut Spezifikation | Live beobachtet |
| --- | --- | --- |
| `amounts` in `/postings/add/receipt` und `/postings/add/transaction` | "Amount must be in format 0000.00", Array | nicht getestet (schreibend) |
| `amount` in `/postings/add/free` | Typ `string`, kein Format genannt | nicht getestet (schreibend) |
| `amount` in der Batch-Definition `PostingsFree` | Typ `number`, Beispiel `12.87` | nicht getestet (schreibend) |
| `amount` in der Antwort von `/postings/get` | Typ `string`, Beispiel `"123.90"` | Zeichenkette, immer ohne Minuszeichen, Muster `N.NN` bis `NNNN.NN` |
| `transaction_amount` in der Antwort von `/postings/get` | Typ `string`, Beispiel `"133.42"` | Zeichenkette, **kann negativ sein**, Muster `-NNN.NN` möglich, oder `null` |

Daraus folgt die Vorzeichenkonvention: Der Buchungsbetrag `amount` ist stets positiv, die Richtung
steckt in Soll/Haben. Der Transaktionsbetrag `transaction_amount` ist vorzeichenbehaftet und gibt die
Richtung des Zahlungsflusses an. Wer eine Transaktion bebucht, muss `amounts` positiv übergeben, auch
wenn die Transaktion negativ ist. Das ist aus der Spezifikation nicht explizit, ergibt sich aber aus
der Kombination von "there are no negative amounts allowed" bei der freien Buchung und der
durchgängig positiven Ausgabe von `amount`. **Annahme** für Beleg- und Transaktionsbuchung.

Als Dezimaltrenner dient der Punkt. Ein Tausendertrenner ist nirgends vorgesehen und würde nach
Format `0000.00` ungültig sein.

### 6.2 Fremdwährung

`/postings/add/receipt` und `/postings/add-batch/receipts` tragen einen ausdrücklichen Hinweis: Bei
einem Beleg in Fremdwährung muss man den Beleg vorher über `/receipts/get/id_by_customer` abrufen und
den **berechneten** Betrag verwenden. `/receipts/get/id_by_customer` liefert dafür `amount`,
`amount_original`, `currency`, `currency_original` und `exchangerate`. Zu verwenden ist `amount`, also
der in Mandantenwährung umgerechnete Betrag, nicht `amount_original`.

Dazu passende Fehlerfälle:

- `error_code` 34 bei receipt und 25 bei transaction: "foreign currencies can only be posted to
  account %postingaccount_number%"
- `error_code` 39 bei receipt: "postings with foreign currencies are not allowed"
- `error_code` 40 bei receipt: "postings are not allowed on receipts without currency"

Live beobachtet wurde in der Leseantwort ausschließlich `currency` `"EUR"`. Das sagt nichts über die
Fähigkeiten der API aus, nur etwas über den geprüften Mandanten.

### 6.3 Datumsformate

| Feld | Format |
| --- | --- |
| `date_from`, `date_to`, `date_last_action_from`, `date_last_action_to` (`/postings/get`) | `YYYY-MM-DD`, Leerstring ist ungültig |
| `date` (`/postings/add/free`, Eingabe) | in der Parameterbeschreibung **kein** Format genannt; die Batch-Definition `PostingsFree` zeigt das Beispiel `2024-04-07` |
| `date` (`/postings/get`, Ausgabe) | live durchgängig `YYYY-MM-DD HH:MM:SS`, die Uhrzeit war in allen 203 geprüften Zeilen `00:00:00` |
| `date_vat_effective` (Ausgabe) | live durchgängig `YYYY-MM-DD`, ohne Uhrzeit |
| `date_delivery` (Ausgabe) | Spezifikation zeigt `2019-06-05`; live war der Wert in allen 203 geprüften Zeilen `null` |

Die Ausgabe mischt also zwei Datumsformate in einer Zeile. Ein Parser darf nicht annehmen, alle
Datumsfelder hätten dieselbe Form.

---

## 7. Festschreibung, Entbestätigen und Stornieren

Diese drei Begriffe sind der wichtigste Teil des Dossiers, weil hier der Schaden entsteht, wenn ein
Agent falsch handelt.

### 7.1 Festgeschrieben (`fixed`)

`/postings/get` liefert pro Zeile `fixed`. Beispielwert der Spezifikation ist `"0"`, live beobachtet
wurde ausschließlich `"0"`. **Annahme**, dass `"1"` eine festgeschriebene Buchung bezeichnet; im
geprüften Datenbestand kam kein solcher Wert vor.

Festgeschriebene Buchungen sind unveränderlich. Das ist keine API-Eigenheit, sondern die Umsetzung der
GoBD-Anforderung an die Unveränderbarkeit von Buchungen.

### 7.2 Entbestätigen (`/postings/unconfirm/*`)

Die drei `unconfirm`-Endpunkte entfernen Buchungen **ersatzlos**. Beschreibung: "Remove postings for a
specified transaction by unconfirming them. This will only work if the postings are not fixed."

- Es entsteht kein Gegeneintrag. Die Buchung verschwindet aus dem Journal.
- Der Beleg beziehungsweise die Transaktion bleibt bestehen und ist danach wieder unbebucht.
- Bei festgeschriebenen Buchungen scheitert der Aufruf mit `error_code` 8.

Entbestätigen ist damit die Korrektur eines Fehlers **vor** der Festschreibung.

### 7.3 Stornieren (`/postings/cancel`)

Beschreibung: "Cancel a specified posting. Postings that are not fixed are deleted, fixed postings are
cancelled by creating a reversal posting."

`/postings/cancel` hat also zwei grundverschiedene Wirkungen, die der Aufrufer nicht steuern kann:

| Zustand der Buchung | Wirkung |
| --- | --- |
| nicht festgeschrieben | Buchung wird gelöscht, wie beim Entbestätigen |
| festgeschrieben | es entsteht zusätzlich eine Stornobuchung im Journal |

Der zweite Fall ist nicht rückgängig zu machen und erzeugt einen dauerhaft sichtbaren Eintrag in der
Buchhaltung. Der Aufrufer erfährt aus der Antwort nicht, welcher der beiden Fälle eingetreten ist: die
Erfolgsantwort ist in beiden Fällen `{"success": true, "message": ""}`.

### 7.4 Gegenüberstellung

| Kriterium | `/postings/unconfirm/*` | `/postings/cancel` |
| --- | --- | --- |
| Adressierung | über Beleg, Transaktion oder freie Buchung | über `posting_id_by_customer` |
| Wirkt auf festgeschriebene Buchungen | nein, `error_code` 8 | ja, durch Stornobuchung |
| Wirkt auf nicht festgeschriebene Buchungen | ja, Löschung | ja, Löschung |
| Erfasst mehrere Zeilen auf einmal | ja bei receipt und transaction, alle Zeilen des Objekts | nein, genau eine Buchung |
| Hinterlässt Spuren im Journal | nein | nur im festgeschriebenen Fall |

Für einen Agenten ist daraus die Regel abzuleiten: Solange die Buchung nicht festgeschrieben ist, ist
`unconfirm` der schonendere und besser vorhersehbare Weg. `cancel` ist die einzige Möglichkeit, eine
festgeschriebene Buchung zu neutralisieren, und darf nur nach ausdrücklicher Bestätigung durch einen
Menschen aufgerufen werden.

---

## 8. Splitbuchungen

Beleg- und Transaktionsbuchung sind **immer** Splitbuchungen, auch wenn nur eine Zeile entsteht. Alle
inhaltlichen Parameter sind Arrays:

`postingaccounts`, `postingtexts`, `vats`, `amounts`, `cost_locations`, `cost_locations_two`,
`oi_receipts_ids_by_customer`.

Die Arrays sind **positionsgekoppelt**: Index 0 aller Arrays beschreibt gemeinsam die erste
Buchungszeile, Index 1 die zweite und so weiter. Die Spezifikation drückt das in jeder
Parameterbeschreibung über die Formulierung `['... of posting 1', '... of posting 2']` aus.

Konsequenzen:

- Alle Pflicht-Arrays müssen dieselbe Länge haben. Die Spezifikation sagt das nicht ausdrücklich, die
  Positionskopplung lässt aber keine andere Lesart zu. **Annahme** zur genauen Reaktion bei
  ungleichen Längen; für `oi_receipts_ids_by_customer` ist sie durch `error_code` 34 bei
  `/postings/add/transaction` belegt: "for each partial posting, one or no receipt has to be specified
  explicitly via oi_receipts_ids_by_customer".
- Lücken in optionalen Arrays werden durch `null` an der betreffenden Position ausgedrückt, nicht durch
  Weglassen. Explizit dokumentiert ist das nur für `oi_receipts_ids_by_customer`: "A null value within
  the array means explicitly assigning no receipt to the partial posting in that position." Für
  `cost_locations` ist dasselbe Vorgehen naheliegend, aber **nicht verifiziert**.
- Die Summe aller `amounts` muss dem Betrag des Belegs beziehungsweise der Transaktion entsprechen.
  Belegt durch `error_code` 37 bei receipt ("the total amount of all postings does not match the
  receipt amount") und 27 bei transaction ("the total amount of all postings does not match the
  transaction amount").

Die freie Buchung kennt keine Splitzeilen. Sie hat genau ein `amount`, ein Sollkonto und ein
Habenkonto. Wer einen mehrzeiligen Sachverhalt frei buchen will, muss mehrere freie Buchungen anlegen,
am besten über `/postings/add-batch/free`. Eine gemeinsame Klammer über solche Buchungen bietet die
API nicht.

Ein Feld `booking_number` in der Leseantwort legt eine solche Klammer nahe. Im Live-Test über 200
Zeilen war `booking_number` jedoch für jede Zeile eindeutig und stimmte zudem in allen 200 Fällen
numerisch mit `id_by_customer` überein. In diesem Datenbestand gruppiert `booking_number` also nichts.
Ob das bei Splitbuchungen anders ist, konnte mangels Splitbuchungen im geprüften Zeitraum nicht
festgestellt werden. **Nicht verifiziert.**

---

## 9. `/postings/get`

Holt Buchungen eines Mandanten.

**Einordnung: lesend.** Der Endpunkt verändert nichts.

### 9.1 Parameter (12 von 12)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | API-Schlüssel des zu verwaltenden Mandanten | mandantenspezifisch |
| `date_from` | string | ja | – | Untere Grenze des Buchungsdatums, inklusiv | `YYYY-MM-DD`, Leerstring ungültig |
| `date_to` | string | ja | – | Obere Grenze des Buchungsdatums, inklusiv | `YYYY-MM-DD`, Leerstring ungültig |
| `date_last_action_from` | string | nein | kein Filter | Untere Grenze für Anlage oder Statusänderung (confirmed, fixed), inklusiv | `YYYY-MM-DD`, Leerstring ungültig |
| `date_last_action_to` | string | nein | kein Filter | Obere Grenze für Anlage oder Statusänderung, inklusiv | `YYYY-MM-DD`, Leerstring ungültig |
| `account` | string | nein | `all` | Kommaseparierte Liste von Konten | `all`, `all financial accounts`, `free booking` oder numerische Kontonummern |
| `postingaccount` | string | nein | `all` | Kommaseparierte Liste von Buchungskonten | `all`, `all postingaccounts`, `all debtors`, `all creditors` oder numerische Kontonummern |
| `posting_status` | string | nein | `all` | Festschreibungsstatus | `all`, `fixed`, `unfixed` |
| `cost_location` | string | nein | kein Filter | Genau eine Kostenstelle; nur Buchungen auf diese Kostenstelle werden geliefert | Code aus `/cost-locations/get` |
| `order` | string | nein | siehe Hinweis | Sortierung | `default`, `date ASC`, `date DESC`, `date_last_action ASC`, `date_last_action DESC`, `id_by_customer ASC`, `id_by_customer DESC` |
| `limit` | integer | nein | nicht dokumentiert | Maximale Zeilenzahl | ganzzahlig, höchstens 1000 |
| `offset` | integer | nein | nicht dokumentiert | Startversatz für Blätterung | ganzzahlig |

Hinweise zu einzelnen Feldern:

- `order` ohne Angabe sortiert laut Spezifikation aufsteigend nach `date` als erstem und
  `date_last_action` als zweitem Kriterium. Die Validierung ist ausdrücklich **case sensitive**.
- `account` und `postingaccount` sind verschiedene Achsen. `account` meint die Kontoseite, auf der der
  Geschäftsvorfall liegt, einschließlich der Sonderwerte für Finanzkonten und freie Buchungen.
  `postingaccount` meint das Buchungskonto im Sinne des Kontenrahmens einschließlich Debitoren und
  Kreditoren.
- Der Default für `limit` ist nicht dokumentiert. Im Live-Test lieferte ein Aufruf ohne `limit` nicht
  getestet; ein Aufruf mit `limit: 200` lieferte genau 200 Zeilen. **Nicht verifiziert**, wie viele
  Zeilen ohne `limit` kommen.

### 9.2 Erfolgsantwort

Umschlag: `success` (immer `true`), `message` (leer), `rows` (Anzahl der **gelieferten** Zeilen, nicht
der insgesamt vorhandenen), `data` (Array).

Die Spezifikation beschreibt 30 Felder je `data`-Element, alle vom Typ `string`. Der Live-Abruf
lieferte 38 Felder. Die Tabelle enthält beides; die acht zusätzlichen Felder sind gekennzeichnet.

| Feld | In Spezifikation | Bedeutung | Live beobachtet |
| --- | --- | --- | --- |
| `id_by_customer` | ja | Mandantenweite Buchungsnummer; Adressierung für `cancel`, `unconfirm/free`, `assign` | Zeichenkette, im Stichprobenumfang eindeutig |
| `date` | ja | Buchungsdatum | `YYYY-MM-DD HH:MM:SS`, Uhrzeit stets `00:00:00` |
| `date_delivery` | ja | Leistungsdatum | stets `null` in der Stichprobe |
| `date_vat_effective` | ja | Datum der umsatzsteuerlichen Wirksamkeit | `YYYY-MM-DD`, stimmte in allen 200 Zeilen mit dem Datumsteil von `date` überein |
| `postingtext` | ja | Buchungstext, maximal 128 Zeichen | Zeichenkette |
| `amount` | ja | Buchungsbetrag | Zeichenkette, stets ohne Vorzeichen |
| `currency` | ja | Währung der Buchung | `"EUR"` in der Stichprobe |
| `vat` | ja | Steuersatz in Prozent | `"0.00"`, `"7.00"`, `"19.00"` |
| `credit_type` | ja | Soll- oder Habenkennzeichen | `"S"`, `"H"` |
| `debit_postingaccount_number` | ja | Sollkonto | Zeichenkette |
| `credit_postingaccount_number` | ja | Habenkonto; war in keiner Zeile gleich dem Sollkonto | Zeichenkette |
| `tax_key` | ja | numerischer Steuerschlüssel | `"0"`, `"8"`, `"9"`, `"94"` |
| `booking_number` | ja | Buchungsnummer; Spezifikation sagt `string` | **Zahl**, nicht Zeichenkette; stimmte in allen 200 Zeilen numerisch mit `id_by_customer` überein |
| `cost_location` | ja | Kostenstelle Ebene 1 | leer in der Stichprobe |
| `cost_location_two` | ja | Kostenstelle Ebene 2 | leer in der Stichprobe |
| `circumstances_ll` | ja | Sachverhalt nach §13b oder vergleichbar; Beispielwert `"7"` | leer in der Stichprobe |
| `transaction_amount` | ja | Betrag der zugeordneten Transaktion | Zeichenkette **mit** möglichem Minuszeichen, oder `null` |
| `transaction_purpose` | ja | Verwendungszweck der Transaktion | Zeichenkette, leer wenn keine Transaktion |
| `receipts_assigned_ids_by_customer` | ja | Belegnummern der zugeordneten Belege | mehrere Werte in **einer** Zeichenkette, getrennt durch `", "` |
| `receipts_assigned_types` | ja | Belegarten | z. B. `"invoice inbound"`, `"invoice outbound"`, mehrfach mit `", "` |
| `receipts_assigned_invoice_numbers` | ja | Rechnungsnummern | `", "`-getrennt |
| `receipts_assigned_counterparties` | ja | Geschäftspartner der Belege | `", "`-getrennt |
| `receipts_assigned_vat_rates` | ja | Steuersätze der Belege | `", "`-getrennt |
| `receipts_assigned_amounts` | ja | Belegbeträge | `", "`-getrennt |
| `receipts_assigned_dates` | ja | Belegdaten | Format `YYYY-MM-DD HH:MM:SS`, `", "`-getrennt |
| `receipts_assigned_links` | ja | Direktlinks auf die Beleg-PDF | Form `https://webapp.buchhaltungsbutler.de/receipts/view-pdf/<id>` |
| `fixed` | ja | Festschreibungskennzeichen | `"0"` in der gesamten Stichprobe |
| `comment` | ja | Kommentar zur Buchung | leer in der Stichprobe |
| `receipt_id_by_customer` | ja | Belegnummer des auslösenden Belegs | Zeichenkette oder `null` |
| `transaction_id_by_customer` | ja | Transaktionsnummer der auslösenden Transaktion | Zeichenkette oder `null` |
| `receipts_assigned_amounts_paid` | **nein** | bezahlte Belegbeträge | `", "`-getrennt |
| `receipts_assigned_amounts_paid_fixed` | **nein** | bezahlte, festgeschriebene Belegbeträge | war in allen 200 Zeilen identisch zu `receipts_assigned_amounts_paid` |
| `receipts_assigned_assigned_amounts` | **nein** | zugeordnete Belegbeträge | war in allen 200 Zeilen identisch zu `receipts_assigned_amounts` |
| `receipts_assigned_assigned_dates` | **nein** | zugeordnete Belegdaten | war in allen 200 Zeilen identisch zu `receipts_assigned_dates` |
| `receipts_id_by_customer` | **nein** | Belegnummer | war in allen 200 Zeilen identisch zu `receipt_id_by_customer` |
| `receipts_links` | **nein** | Beleglinks | war in allen 200 Zeilen identisch zu `receipts_assigned_links` |
| `transactions_id_by_customer` | **nein** | Transaktionsnummer | war in allen 200 Zeilen identisch zu `transaction_id_by_customer` |
| `transactions_purpose` | **nein** | Verwendungszweck | war in allen 200 Zeilen identisch zu `transaction_purpose` |

Die Gleichheit der Paare gilt für die geprüften 200 Zeilen. Dass es sich um dauerhafte Aliase handelt,
ist **nicht verifiziert**. Ein Client sollte das dokumentierte Feld des Paares verwenden.

### 9.3 Fehlerfälle (16 von 16)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic-Auth-Daten unbekannt oder falsch | API Client und API Secret prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` unbekannt oder Client nicht für diesen Mandanten freigeschaltet | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant ist nicht aktiv | im Portal klären, kein technisches Problem |
| 400 | 5 | invalid date_from specified | `date_from` fehlt oder ist kein gültiges Datum | `YYYY-MM-DD` senden, Leerstring vermeiden |
| 400 | 6 | invalid date_to specified | `date_to` fehlt oder ist ungültig | wie oben |
| 400 | 7 | invalid account specified | `account` enthält einen unbekannten Wert | erlaubte Schlüsselwörter verwenden oder gültige Kontonummern aus `/accounts/get` |
| 400 | 8 | invalid postingaccount flag specified | `postingaccount` enthält einen unbekannten Wert | gültige Werte aus `/settings/get/postingaccounts` |
| 400 | 9 | invalid posting_status specified | `posting_status` außerhalb von `all`, `fixed`, `unfixed` | Wert korrigieren |
| 400 | 10 | invalid limit specified | `limit` fehlerhaft oder größer als 1000 | `limit` auf höchstens 1000 setzen |
| 400 | 12 | invalid offset specified | `offset` fehlerhaft | ganzzahligen, nicht negativen Wert senden |
| 400 | 13 | invalid cost_location specified | Kostenstelle unbekannt | Code aus `/cost-locations/get` verwenden |
| 400 | 14 | invalid date_last_action_from specified | Datum ungültig | `YYYY-MM-DD` senden |
| 400 | 16 | invalid date_last_action_to specified | Datum ungültig | `YYYY-MM-DD` senden |
| 400 | 17 | invalid order specified | `order` unbekannt oder falsch geschrieben | exakte Schreibweise einschließlich Großbuchstaben bei `ASC`/`DESC` |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen, danach Support |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | Zeitraum oder `limit` verkleinern und erneut versuchen |

Auffällig: Der `error_code` 15 ("adding temporarily restricted") existiert bei `/postings/get` nicht,
sehr wohl aber bei den Batch-Endpunkten. Die Nummern sind lückenhaft (kein 1, 2, 15), das ist kein
Fehler, sondern das Ergebnis einer endpunktweisen Vergabe.

### 9.4 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/get" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "date_from": "2026-01-01",
        "date_to": "2026-03-31",
        "posting_status": "unfixed",
        "account": "all",
        "postingaccount": "all",
        "order": "date DESC",
        "limit": 500,
        "offset": 0
      }'
```

### 9.5 Fallstricke

- `date_from` und `date_to` sind Pflicht. Ein unbegrenzter Abruf ist nicht möglich.
- Harte Obergrenze 1000 pro Request. Größere Zeiträume müssen über `offset` geblättert werden. Bei
  Blätterung ist ein deterministisches `order` zwingend, sonst können Zeilen doppelt oder gar nicht
  erscheinen. **Annahme**, da die Spezifikation zur Stabilität der Sortierung nichts sagt.
- `rows` ist die Zahl der gelieferten Zeilen, nicht die Gesamtzahl. Es gibt kein Feld für die
  Gesamtzahl. Ob eine weitere Seite existiert, erkennt man nur daran, dass `rows` gleich `limit` ist.
- `order` ist case sensitive, `"date desc"` scheitert.
- Die `receipts_assigned_*`-Felder sind keine Arrays, sondern durch `", "` verkettete Zeichenketten.
  Ein Split an `", "` ist unzuverlässig, sobald ein Belegtext selbst ein Komma mit Leerzeichen enthält,
  etwa in `receipts_assigned_counterparties`. Die Felder eignen sich für Anzeige, nicht für
  maschinelle Weiterverarbeitung.
- `booking_number` ist laut Spezifikation eine Zeichenkette, kommt live als JSON-Zahl. Streng typisierte
  Clients brechen daran.
- Die Spezifikation kennt acht der 38 gelieferten Felder nicht.

### 9.6 Live-Verifikation

Sechs Aufrufe am 2026-09-12, alle gegen `/postings/get`, alle rein lesend:

| Nr. | Body (gekürzt) | Ergebnis |
| --- | --- | --- |
| 1 | `date_from` 2025-01-01, `date_to` 2025-12-31, `limit` 3 | HTTP 200, `rows` 3, 38 Felder je Zeile |
| 2 | `date_from` 2024-01-01, `date_to` 2026-12-31, `limit` 200, `order` `"date DESC"` | HTTP 200, `rows` 200; Grundlage aller Häufigkeitsaussagen in 9.2 |
| 3 | nur `api_key` | HTTP 400, `{"success":false,"error_code":5,"message":"invalid date_from specified"}` |
| 4 | gültiger Zeitraum, `order` `"date desc"`, `limit` 5000, `posting_status` `"unfixed"` | HTTP 400, `error_code` 17, "invalid order specified" |
| 5 | gültiger Zeitraum, `limit` 5000, `account` `"all"`, `postingaccount` `"all"`, zusätzlich unbekanntes Feld `unknown_param` | HTTP 400, `error_code` 10, "invalid limit specified" |
| 6 | gültiger Zeitraum, `account` `"free booking"`, `posting_status` `"unfixed"`, `limit` 5 | HTTP 200, `rows` 5, alle Zeilen ohne Beleg- und Transaktionsbezug |

Alle schreibenden `/postings`-Endpunkte wurden bewusst **nicht** aufgerufen. Die Angaben zu ihnen
stammen ausschließlich aus der Spezifikationsdatei.

Abweichungen und Erkenntnisse gegenüber der Spezifikation:

1. Die Antwort enthält acht undokumentierte Felder (siehe Tabelle in 9.2).
2. `booking_number` kommt als Zahl, nicht als Zeichenkette.
3. `date_delivery` war durchgängig `null`, obwohl die Spezifikation einen Datumsstring als Beispiel
   zeigt. Es gibt also `null`-Werte, die die Spezifikation nicht vorsieht; dasselbe gilt für
   `receipt_id_by_customer`, `transaction_id_by_customer` und `transaction_amount`.
4. Die Reihenfolge der Validierung ist nicht die Reihenfolge der Parameterliste: `order` wird vor
   `limit` geprüft (Aufruf 3), und `limit` wird geprüft, bevor ein unbekanntes Feld auffällt
   (Aufruf 4). Ein unbekanntes Feld führte in Aufruf 4 nicht zu einem eigenen Fehler; ob es bei sonst
   fehlerfreiem Body toleriert wird, ist **nicht verifiziert**.
5. `limit` 5000 wird abgelehnt, nicht stillschweigend gekappt. `limit` 200 wurde akzeptiert.
6. `account: "free booking"` funktioniert als Filterwert und lieferte ausschließlich Zeilen ohne
   Beleg- und Transaktionsbezug.

---

## 10. `/postings/add/receipt`

Legt eine oder mehrere Buchungszeilen zu einem vorhandenen Beleg an.

**Einordnung: SCHREIBEND.** Erzeugt Buchungen in der Buchhaltung des Mandanten.

Voraussetzung laut Beschreibung: Kreditoren- oder Debitorenbuchung muss im Mandanten aktiviert sein.

### 10.1 Parameter (10 von 10)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `receipt_id_by_customer` | integer | ja | – | Belegnummer des zu bebuchenden Belegs | ganzzahlig, aus `/receipts/get` |
| `postingaccounts` | array | ja | – | Buchungskonten, ein Eintrag je Buchungszeile | Kontonummern aus `/settings/get/postingaccounts`; Elementtyp in der Spezifikation nicht deklariert, die Batch-Definition nennt `integer` |
| `postingtexts` | array | ja | – | Buchungstexte, ein Eintrag je Zeile | je Eintrag höchstens 128 Zeichen |
| `vats` | array | ja | – | Steuerschlüssel, ein Eintrag je Zeile | einer der 23 Werte aus Abschnitt 4.1 |
| `cost_locations` | array | nein | keine Kostenstelle | Kostenstellen Ebene 1, ein Eintrag je Zeile | höchstens 10 Zeichen, alphanumerisch oder Zahl größer 0 |
| `cost_locations_two` | array | nein | keine Kostenstelle | Kostenstellen Ebene 2, ein Eintrag je Zeile | wie oben |
| `amounts` | array | ja | – | Beträge, ein Eintrag je Zeile | Format `0000.00`; Summe muss dem Belegbetrag entsprechen |
| `creditor` | integer | ja laut `required`, faktisch bedingt | – | Kreditorennummer als Gegenkonto | nur bei Eingangsrechnung und aktivierter Kreditorenbuchung |
| `debtor` | integer | ja laut `required`, faktisch bedingt | – | Debitorennummer als Gegenkonto | nur bei Ausgangsrechnung und aktivierter Debitorenbuchung |

`creditor` und `debtor` sind beide als `required: true` markiert, obwohl ihre eigenen Beschreibungen
sagen "The field is only required, if …". Das ist ein Widerspruch innerhalb derselben Datei. Die
Beschreibung ist die plausiblere Quelle, weil ein Beleg nicht gleichzeitig Eingangs- und
Ausgangsrechnung sein kann und `error_code` 8 genau diese Verwechslung abfängt
("expected account type by receipt does not match the creditor/debtor account's type"). **Annahme**:
Es ist jeweils genau eines der beiden zu senden. Das ist nicht live prüfbar, weil der Endpunkt
schreibend ist.

### 10.2 Verschachtelte Struktur

Es gibt keine verschachtelten Objekte. Die Struktur ist ein flaches Objekt mit parallelen Arrays. Die
Positionskopplung der Arrays ist in Abschnitt 8 beschrieben.

### 10.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

Kein `data`, kein `rows`, keine Rückgabe der erzeugten `id_by_customer`. Wer die erzeugten Buchungen
braucht, muss sie anschließend über `/postings/get` suchen, sinnvollerweise mit
`date_last_action_from` auf das heutige Datum.

### 10.4 Fehlerfälle (43 von 43)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch oder ohne Rechte | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid posting type specified | interner Buchungstyp nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | receipt not found | `receipt_id_by_customer` unbekannt | Beleg über `/receipts/get` verifizieren |
| 400 | 7 | receipt is deleted | Beleg ist gelöscht | Beleg über `/receipts/restore/id_by_customer` wiederherstellen oder anderen Beleg wählen |
| 400 | 8 | expected account type by receipt does not match the creditor/debtor account's type | Beleg ist Eingangsrechnung, es wurde ein Debitor gesendet, oder umgekehrt | Belegrichtung über das Feld `type` aus `/receipts/get/id_by_customer` prüfen und passendes Personenkonto senden |
| 400 | 9 | the type of the receipt does not allow postings | Belegart ist nicht bebuchbar | anderen Belegtyp verwenden |
| 400 | 10 | creditor posting is not activated | Kreditorenbuchung im Mandanten aus | Einstellung im Portal aktivieren, per API nicht möglich |
| 400 | 12 | debtor posting is not activated | Debitorenbuchung im Mandanten aus | wie oben |
| 400 | 13 | the receipt is not valid, please complete the data | Belegstammdaten unvollständig | Beleg im Portal vervollständigen |
| 400 | 14 | the receipt has already created a transaction | Beleg hat bereits eine Transaktion erzeugt | über `/postings/add/transaction` buchen |
| 400 | 16 | a transaction linked to the receipt has already been posted | verknüpfte Transaktion ist bereits gebucht | nichts tun oder vorher `/postings/unconfirm/transaction` |
| 400 | 17 | no postingaccount number specified | `postingaccounts` leer oder fehlt | mindestens ein Konto senden |
| 400 | 18 | the specified postingaccount is not valid | Konto existiert nicht | Konten über `/settings/get/postingaccounts` holen |
| 400 | 19 | the specified postingaccount is not available | Konto im Mandanten nicht freigeschaltet | anderes Konto wählen |
| 400 | 20 | the specified postingaccount cannot be booked manually | Konto ist automatikgesteuert | anderes Konto wählen |
| 400 | 21 | no vat option specified | `vats` leer oder fehlt | Steuerschlüssel je Zeile senden |
| 400 | 22 | invalid vat option for given account "…" specified | Schlüssel passt nicht zum Konto | zulässige Kombination ermitteln |
| 400 | 23 | no post and files content received or declined | Request-Body leer oder nicht lesbar | `Content-Type: application/json` und gültiges JSON senden |
| 400 | 24 | The account %postingaccount_number% must be posted with vat option "%vat_option%" | Konto erzwingt genau einen Schlüssel | den genannten Schlüssel verwenden |
| 400 | 25 | The vat option for account "…" is invalid | Schlüssel für dieses Konto unzulässig | Schlüssel ändern |
| 400 | 26 | The account "…" must be posted with value added tax / with pre tax / without value added tax | Konto verlangt eine bestimmte Steuerklasse | Schlüssel der geforderten Klasse wählen |
| 400 | 27 | invalid tax key specified | abgeleiteter Steuerschlüssel unzulässig | `vats` und Konto anpassen |
| 400 | 28 | vat option unavailable due to current settings | Mandanteneinstellung sperrt den Schlüssel | Einstellung prüfen |
| 400 | 29 | vat option unavailable with 'not liable to sales tax' setting | Kleinunternehmerregelung aktiv | `0_none` verwenden |
| 400 | 31 | the posting text is longer than 128 characters | Buchungstext zu lang | kürzen |
| 400 | 32 | the cost location is longer than 10 characters | Kostenstelle zu lang | kürzen |
| 400 | 33 | the cost location must consist of alphanumeric characters or be a number greater than 0 | Kostenstelle formal ungültig | Format korrigieren |
| 400 | 34 | foreign currencies can only be posted to account %postingaccount_number% | Fremdwährung nur auf ein bestimmtes Konto | genanntes Konto verwenden |
| 400 | 35 | invalid amount specified | Betrag formal ungültig | Format `0000.00`, Punkt als Dezimaltrenner |
| 400 | 37 | the total amount of all postings does not match the receipt amount | Summe der Splitzeilen weicht vom Belegbetrag ab | Summe anpassen; bei Fremdwährung `amount` aus `/receipts/get/id_by_customer` verwenden |
| 400 | 38 | the total amount of all postings is invalid | Gesamtsumme unplausibel, etwa null oder negativ | Beträge prüfen |
| 400 | 39 | postings with foreign currencies are not allowed | Fremdwährungsbuchung im Mandanten nicht erlaubt | Einstellung prüfen |
| 400 | 40 | postings are not allowed on receipts without currency | Beleg hat keine Währung | Beleg vervollständigen |
| 400 | 41 | the date delivery is invalid | Leistungsdatum des Belegs ungültig | Beleg korrigieren; der Endpunkt selbst kennt keinen Parameter dafür |
| 400 | 42 | the vat option is not available for this date | Schlüssel für das Buchungsdatum nicht gültig | zeitlich passenden Schlüssel wählen, etwa die 19/16-Varianten |
| 400 | 43 | the specified creditor/debtor is invalid | Personenkonto unbekannt | über `/settings/get/creditors` beziehungsweise `/settings/get/debtors` prüfen |
| 400 | 44 | the cost location two is longer than 10 characters | zweite Kostenstelle zu lang | kürzen |
| 400 | 45 | the cost location two must consist of alphanumeric characters or be a number greater than 0 | formal ungültig | Format korrigieren |
| 400 | 46 | invalid or not existing parameters | unbekanntes Feld im Body | Body auf die dokumentierten Felder beschränken |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | weniger Zeilen pro Request |

### 10.5 curl-Beispiel

Splitbuchung einer Eingangsrechnung über 119,00 auf zwei Aufwandskonten:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/add/receipt" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "receipt_id_by_customer": 142,
        "postingaccounts": [4930, 4940],
        "postingtexts": ["Bürobedarf Januar", "Fachliteratur Januar"],
        "vats": ["19_pre", "19_pre"],
        "amounts": ["100.00", "19.00"],
        "cost_locations": ["100", "100"],
        "cost_locations_two": [null, null],
        "creditor": 70001
      }'
```

Die Belegnummer, Kontonummern, Kostenstellen und Beträge sind erfundene Platzhalter.

### 10.6 Fallstricke

- `creditor` und `debtor` sind beide als Pflicht markiert, sich aber gegenseitig ausschließend. Siehe
  10.1.
- `error_code` 46 ("invalid or not existing parameters") bedeutet, dass der Endpunkt unbekannte Felder
  **ablehnt**. Ein Client darf keine Zusatzfelder mitschicken.
- Der Belegbetrag ist die Bezugsgröße für die Summenprüfung. Bei Fremdwährung ist das der umgerechnete
  `amount` aus `/receipts/get/id_by_customer`, nicht `amount_original`.
- Es gibt keinen Parameter für das Buchungsdatum. Das Datum kommt vom Beleg. Wer ein anderes
  Buchungsdatum braucht, muss eine freie Buchung verwenden.
- Es gibt keinen Parameter für Soll und Haben. Die Richtung kommt aus der Belegart.
- Die Antwort nennt die erzeugten Buchungen nicht. Ein Wiederholungsversuch nach Timeout kann
  Dubletten erzeugen, weil kein Idempotenzschlüssel existiert.
- `error_code` 41 verweist auf ein Leistungsdatum, das der Endpunkt gar nicht entgegennimmt. Die
  Fehlermeldung ist nur über den Beleg auflösbar.
- Live nicht verifizierbar, da schreibend. Alle Angaben in diesem Abschnitt stammen aus der
  Spezifikation.

---

## 11. `/postings/add-batch/receipts`

Legt Belegbuchungen für mehrere Belege in einem Request an.

**Einordnung: SCHREIBEND.**

### 11.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `receipts` | array | ja | – | Liste von Belegbuchungen; jede hat dieselbe Felddeklaration und Validierung wie `/postings/add/receipt` | `$ref: ReceiptsPostings` |

Der Parameter `receipts` trägt in der Datei `"type": null` und verweist über `schema` auf
`#/definitions/ReceiptsPostings`. Das ist die einzige Stelle innerhalb der `/postings`-Pfade, an der
überhaupt ein `schema` verwendet wird.

### 11.2 Verschachtelte Struktur

`ReceiptsPostings` ist ein Array von `ReceiptPostings`. Jedes Element:

| Feld | Typ laut Definition | Pflicht laut `required` | Beispiel | Anmerkung |
| --- | --- | --- | --- | --- |
| `receipt_id_by_customer` | integer | ja | 142 | |
| `postingaccounts` | array of integer | ja | `[1590]` | im Einzelendpunkt ohne Elementtyp |
| `postingstexts` | array of string | **nein** | `["postingtext"]` | **Feldname weicht ab**, siehe 11.6 |
| `vats` | array of string | ja | `["19_vat"]` | |
| `cost_locations` | array of string | nein | `["cost location"]` | |
| `cost_locations_two` | array of string | nein | `["cost location two"]` | |
| `amounts` | array of number | ja | `[12.87]` | im Einzelendpunkt Format `0000.00` als Zeichenkette |
| `creditor` | integer | ja | 70000 | |
| `debtor` | integer | ja | 10000 | |

### 11.3 Erfolgsantwort

Abweichend von allen anderen Endpunkten:

```json
{
  "success": true,
  "receipts": [ { "success": true, "message": "" } ],
  "errors": [
    {
      "success": false,
      "error_code": 18,
      "message": "the specified postingaccount is not valid",
      "request_data": []
    }
  ]
}
```

- `receipts` enthält je erfolgreich verarbeitetes Element ein Ergebnisobjekt.
- `errors` enthält je fehlgeschlagenes Element ein Fehlerobjekt mit `error_code`, `message` und
  `request_data`, wobei `request_data` laut Beschreibung die gesendeten Daten zurückspiegelt.
- Es gibt weder `message` noch `rows` auf oberster Ebene.

Entscheidend: **`success: true` auf oberster Ebene bedeutet nicht, dass alles gebucht wurde.** Der
Batch ist nicht transaktional. Ein Client muss immer `errors` auswerten.

Die Definition bietet keine Möglichkeit, ein Element in `errors` einem Element der Eingabe zuzuordnen,
außer über `request_data`. Es gibt keinen Index. **Annahme**: Die Reihenfolge in `receipts`
entspricht der Reihenfolge der erfolgreichen Eingabeelemente. Verlässlich ist das nicht.

### 11.4 Fehlerfälle (6 von 6)

Der Batch-Endpunkt definiert nur die generischen Fehler auf Request-Ebene. Alle inhaltlichen Fehler
landen in `errors` innerhalb einer 200er-Antwort und tragen die Codes aus Abschnitt 10.4.

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or invalid api client for customer or insufficient privileges | `api_key` falsch oder Client nicht freigeschaltet | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 403 | 15 | adding temporarily restricted | Anlage vorübergehend gesperrt, etwa wegen Drosselung | später erneut versuchen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | Batch verkleinern |

Der Code 15 kommt ausschließlich bei den drei Batch-Endpunkten vor.

### 11.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/add-batch/receipts" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "receipts": [
          {
            "receipt_id_by_customer": 142,
            "postingaccounts": [4930],
            "postingtexts": ["Bürobedarf Januar"],
            "vats": ["19_pre"],
            "amounts": ["119.00"],
            "creditor": 70001
          },
          {
            "receipt_id_by_customer": 143,
            "postingaccounts": [8400],
            "postingtexts": ["Erlöse Januar"],
            "vats": ["19_vat"],
            "amounts": ["238.00"],
            "debtor": 10001
          }
        ]
      }'
```

### 11.6 Fallstricke

- **Feldnamenkonflikt.** Der Einzelendpunkt heißt das Feld `postingtexts`, die Batch-Definition
  `ReceiptPostings` schreibt `postingstexts` mit zusätzlichem `s`. Gleichzeitig sagt die
  Parameterbeschreibung des Batch-Endpunkts, jedes Element habe "the same field declaration and
  validation as the postings/add/receipt endpoint". Beides zusammen ist widersprüchlich. Vermutlich ist
  `postingstexts` ein Tippfehler in der Definition und `postingtexts` korrekt; die Schwesterdefinition
  `TransactionPostings` schreibt an derselben Stelle `postingtexts`. **Nicht verifiziert**, weil der
  Endpunkt schreibend ist. Eine Implementierung sollte das an einem Testmandanten klären, bevor sie
  sich festlegt.
- **Pflichtfeldkonflikt.** `required` in `ReceiptPostings` enthält `postingstexts` nicht, im
  Einzelendpunkt ist `postingtexts` aber Pflicht.
- **Typkonflikt bei `amounts`.** Einzelendpunkt: Zeichenkette im Format `0000.00`. Batch-Definition:
  `number` mit Beispiel `12.87`. Bei Fließkommazahlen droht Rundungsverlust. Die konservative Wahl ist
  die Zeichenkette, weil die Beschreibung des Batch-Parameters ausdrücklich auf den Einzelendpunkt
  verweist. **Annahme.**
- `creditor` und `debtor` stehen in `required`, obwohl sie sich fachlich ausschließen. Derselbe
  Widerspruch wie im Einzelendpunkt.
- Kein `message`-Feld in der Erfolgsantwort, anders als bei allen anderen Endpunkten.
- Es ist keine Obergrenze für die Anzahl der Elemente dokumentiert. **Nicht verifiziert.** Angesichts
  von Code 30 (Timeout) und 15 (temporäre Sperre) sind kleine Batches ratsam.
- Live nicht verifizierbar, da schreibend.

---

## 12. `/postings/add/transaction`

Legt eine oder mehrere Buchungszeilen zu einer vorhandenen Transaktion an.

**Einordnung: SCHREIBEND.**

### 12.1 Parameter (9 von 9)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `transaction_id_by_customer` | integer | ja | – | Transaktionsnummer | ganzzahlig, aus `/transactions/get` |
| `postingaccounts` | array | ja | – | Buchungskonten, ein Eintrag je Zeile | Kontonummern aus `/settings/get/postingaccounts` |
| `postingtexts` | array | ja | – | Buchungstexte, ein Eintrag je Zeile | höchstens 128 Zeichen je Eintrag |
| `vats` | array | ja | – | Steuerschlüssel, ein Eintrag je Zeile | einer der 23 Werte aus Abschnitt 4.1 |
| `cost_locations` | array | nein | keine Kostenstelle | Kostenstellen Ebene 1 | höchstens 10 Zeichen, alphanumerisch oder Zahl größer 0 |
| `cost_locations_two` | array | nein | keine Kostenstelle | Kostenstellen Ebene 2 | wie oben |
| `amounts` | array | ja | – | Beträge, ein Eintrag je Zeile | Format `0000.00`; Summe muss dem Transaktionsbetrag entsprechen |
| `oi_receipts_ids_by_customer` | array | ja laut `required`, faktisch bedingt | – | Belegnummern der auszugleichenden offenen Posten, ein Eintrag je Zeile; `null` bedeutet ausdrücklich "kein Beleg" | ganzzahlige Belegnummern oder `null`; laut Beschreibung nur Pflicht, wenn OP-Buchung im Mandanten aktiv ist |

### 12.2 Verschachtelte Struktur

Flaches Objekt mit positionsgekoppelten Arrays, wie bei der Belegbuchung.

`oi_receipts_ids_by_customer` ist das einzige Array der gesamten API, für das die Spezifikation die
`null`-Semantik ausdrücklich beschreibt: "A null value within the array means explicitly assigning no
receipt to the partial posting in that position." Das Array muss also genauso lang sein wie
`amounts`; Auslassen einzelner Positionen ist nicht zulässig, belegt durch `error_code` 34.

### 12.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

Wie bei der Belegbuchung ohne Rückgabe der erzeugten Buchungen.

### 12.4 Fehlerfälle (31 von 31)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid posting type specified | Buchungstyp nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | transaction not found | `transaction_id_by_customer` unbekannt | über `/transactions/get` prüfen |
| 400 | 7 | a receipt linked to the transaction has already been posted | verknüpfter Beleg ist bereits gebucht | vorher `/postings/unconfirm/receipt` oder nichts tun |
| 400 | 8 | no postingaccount number specified | `postingaccounts` fehlt oder leer | mindestens ein Konto senden |
| 400 | 9 | the specified postingaccount is not valid | Konto existiert nicht | Konten abrufen |
| 400 | 10 | the specified postingaccount is not available | Konto nicht freigeschaltet | anderes Konto wählen |
| 400 | 12 | the specified postingaccount cannot be booked manually | Automatikkonto | anderes Konto wählen |
| 400 | 13 | no vat option specified | `vats` fehlt | Steuerschlüssel senden |
| 400 | 14 | invalid vat option for given account specified | Schlüssel passt nicht zum Konto | Kombination korrigieren |
| 400 | 16 | the account "%account_number%" must be posted with vat option "%vat_option%" | Konto erzwingt genau einen Schlüssel | genannten Schlüssel verwenden |
| 400 | 17 | the account "…" must be posted with/without "%vat_class%" | Konto verlangt eine Steuerklasse | passenden Schlüssel wählen |
| 400 | 18 | invalid tax key specified | abgeleiteter Steuerschlüssel unzulässig | Konto oder `vats` ändern |
| 400 | 19 | vat option unavailable due to current settings | Einstellung sperrt den Schlüssel | Einstellung prüfen |
| 400 | 20 | vat option unavailable with 'not liable to sales tax' setting | Kleinunternehmerregelung | `0_none` verwenden |
| 400 | 21 | the posting text is longer than 128 characters | Text zu lang | kürzen |
| 400 | 22 | the cost location is longer than 10 characters | Kostenstelle zu lang | kürzen |
| 400 | 23 | no post and files content received or declined | Body leer oder unlesbar | gültiges JSON senden |
| 400 | 24 | the cost location must consist of alphanumeric characters or be a number greater than 0 | formal ungültig | Format korrigieren |
| 400 | 25 | foreign currencies can only be posted to account "%account_number%" | Fremdwährung nur auf ein bestimmtes Konto | genanntes Konto verwenden |
| 400 | 26 | invalid amount specified | Betrag formal ungültig | Format `0000.00` |
| 400 | 27 | the total amount of all postings does not match the transaction amount | Summe weicht vom Transaktionsbetrag ab | Summe anpassen; Betrag ohne Vorzeichen senden |
| 400 | 29 | the total amount of all postings is invalid | Gesamtsumme unplausibel | Beträge prüfen |
| 400 | 31 | the cost location two is longer than 10 characters | zweite Kostenstelle zu lang | kürzen |
| 400 | 32 | the cost location two must consist of alphanumeric characters or be a number greater than 0 | formal ungültig | Format korrigieren |
| 400 | 34 | for each partial posting, one or no receipt has to be specified explicitly via oi_receipts_ids_by_customer | Array hat nicht dieselbe Länge wie die Buchungszeilen | für jede Zeile einen Wert oder `null` senden |
| 400 | 46 | invalid or not existing parameters | unbekanntes Feld im Body | Body bereinigen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | weniger Zeilen |

Anders als bei der Belegbuchung fehlt hier ein Fehler für "no amount specified"; es gibt nur 26
("invalid amount specified") und 29.

### 12.5 curl-Beispiel

Aufteilung einer Zahlung über 238,00 auf zwei offene Posten:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/add/transaction" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "transaction_id_by_customer": 654,
        "postingaccounts": [70001, 70002],
        "postingtexts": ["Zahlung RE-1001", "Zahlung RE-1002"],
        "vats": ["0_none", "0_none"],
        "amounts": ["119.00", "119.00"],
        "oi_receipts_ids_by_customer": [142, null]
      }'
```

Alle Nummern und Beträge sind erfundene Platzhalter.

### 12.6 Fallstricke

- Der Transaktionsbetrag kann negativ sein, die Buchungsbeträge sind es nicht. Die Summenprüfung
  (Code 27) bezieht sich mit hoher Wahrscheinlichkeit auf den Absolutbetrag. **Annahme**, aus der
  Vorzeichenkonvention in Abschnitt 6.1 abgeleitet, nicht aus der Spezifikation belegt.
- `oi_receipts_ids_by_customer` ist als Pflicht markiert, laut Beschreibung aber nur bei aktivierter
  OP-Buchhaltung nötig. Derselbe Widerspruch wie bei `creditor`/`debtor`.
- Ein `null` in `oi_receipts_ids_by_customer` ist etwas anderes als ein Weglassen. Wer nur für die erste
  von drei Zeilen einen Beleg hat, muss `[142, null, null]` senden.
- Kein Parameter für Buchungsdatum, Gegenkonto oder Soll/Haben. Alles kommt von der Transaktion.
- Die Spezifikation verweist bei den Antworten 500 und 504 fälschlich auf
  `PostingsAddReceipt_ErrorCode0` und `PostingsAddReceipt_ErrorCode30` statt auf die
  `PostingsAddTransaction_*`-Pendants. Inhaltlich sind die Definitionen identisch, aber ein
  Codegenerator erzeugt daraus falsche Typnamen.
- Live nicht verifizierbar, da schreibend.

---

## 13. `/postings/add-batch/transactions`

Legt Transaktionsbuchungen für mehrere Transaktionen in einem Request an.

**Einordnung: SCHREIBEND.**

### 13.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `transactions` | array | ja | – | Liste von Transaktionsbuchungen; jede hat dieselbe Felddeklaration und Validierung wie `/postings/add/transaction` | `$ref: TransactionsPostings` |

### 13.2 Verschachtelte Struktur

`TransactionsPostings` ist ein Array von `TransactionPostings`. Jedes Element:

| Feld | Typ laut Definition | Pflicht laut `required` | Beispiel |
| --- | --- | --- | --- |
| `transaction_id_by_customer` | integer | ja | 142 |
| `postingaccounts` | array of integer | ja | `[1590]` |
| `postingtexts` | array of string | ja | `["postingtext"]` |
| `vats` | array of string | ja | `["19_vat"]` |
| `cost_locations` | array of string | nein | `["cost location"]` |
| `cost_locations_two` | array of string | nein | `["cost location two"]` |
| `amounts` | array of number | ja | `[12.87]` |
| `oi_receipts_ids_by_customer` | array of integer | ja | `[17]` |

Der Elementtyp von `oi_receipts_ids_by_customer` ist hier als `integer` deklariert. Das schließt
`null` formal aus, obwohl der Einzelendpunkt `null` ausdrücklich verlangt. Ein weiterer Widerspruch.

### 13.3 Erfolgsantwort

```json
{
  "success": true,
  "transactions": [ { "success": true, "message": "" } ],
  "errors": [
    { "success": false, "error_code": 9, "message": "…", "request_data": [] }
  ]
}
```

Struktur wie beim Beleg-Batch, nur heißt das Erfolgs-Array `transactions`. Auch hier gilt:
`success: true` auf oberster Ebene sagt nichts über die einzelnen Elemente.

### 13.4 Fehlerfälle (6 von 6)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or invalid api client for customer or insufficient privileges | `api_key` falsch oder Client nicht freigeschaltet | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 403 | 15 | adding temporarily restricted | Anlage vorübergehend gesperrt | später erneut versuchen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | Batch verkleinern |

Inhaltliche Fehler einzelner Elemente erscheinen nicht hier, sondern im Array `errors` einer
200er-Antwort und tragen die Codes aus Abschnitt 12.4.

### 13.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/add-batch/transactions" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "transactions": [
          {
            "transaction_id_by_customer": 654,
            "postingaccounts": [70001],
            "postingtexts": ["Zahlung RE-1001"],
            "vats": ["0_none"],
            "amounts": ["119.00"],
            "oi_receipts_ids_by_customer": [142]
          },
          {
            "transaction_id_by_customer": 655,
            "postingaccounts": [4930],
            "postingtexts": ["Kontoführungsgebühr"],
            "vats": ["0_none"],
            "amounts": ["4.90"],
            "oi_receipts_ids_by_customer": [null]
          }
        ]
      }'
```

### 13.6 Fallstricke

- Die Beschreibung des 200er-Responses lautet in der Datei "add receipt postings successfully", obwohl
  es um Transaktionen geht. Reiner Textfehler, aber ein Hinweis darauf, dass die Batch-Endpunkte durch
  Kopieren entstanden sind.
- `oi_receipts_ids_by_customer` ist als `array of integer` typisiert, muss laut Einzelendpunkt aber
  `null`-Werte enthalten können. Die Definition ist zu eng.
- `amounts` als `number` statt als formatierte Zeichenkette: derselbe Typkonflikt wie beim Beleg-Batch.
- Keine dokumentierte Obergrenze für die Elementzahl. **Nicht verifiziert.**
- Live nicht verifizierbar, da schreibend.

---

## 14. `/postings/add/free`

Legt eine freie Buchung an, also einen vollständigen Buchungssatz ohne Beleg- oder Transaktionsbezug.

**Einordnung: SCHREIBEND.**

### 14.1 Parameter (9 von 9)

| Feld | Typ | Pflicht | Default | Beschreibung | Erlaubte Werte / Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `date` | string | ja | – | Buchungsdatum | Format in der Parameterbeschreibung nicht genannt; die Definition `PostingsFree` zeigt `2024-04-07`, also `YYYY-MM-DD` |
| `postingtext` | string | ja | – | Buchungstext | höchstens 128 Zeichen |
| `amount` | string | ja | – | Buchungsbetrag | positiv, kein Minuszeichen; Format analog `0000.00` (**Annahme**, der Endpunkt nennt kein Format) |
| `postingaccount_debit` | integer | ja | – | Sollkonto | Kontonummer aus `/settings/get/postingaccounts` |
| `postingaccount_credit` | integer | ja | – | Habenkonto | wie oben, muss sich vom Sollkonto unterscheiden |
| `vat` | string | ja | – | Steuerschlüssel | einer der 23 Werte aus Abschnitt 4.1 |
| `cost_location` | string | nein | keine Kostenstelle | Kostenstelle Ebene 1 | höchstens 10 Zeichen, alphanumerisch oder Zahl größer 0 |
| `cost_location_two` | string | nein | keine Kostenstelle | Kostenstelle Ebene 2 | wie oben |

Anders als bei Beleg- und Transaktionsbuchung sind hier alle Felder Einzelwerte, keine Arrays. Die
Namen stehen konsequent im Singular: `postingtext` statt `postingtexts`, `amount` statt `amounts`,
`vat` statt `vats`, `cost_location` statt `cost_locations`.

### 14.2 Verschachtelte Struktur

Keine. Flaches Objekt, genau eine Buchungszeile.

### 14.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

Ohne Rückgabe der erzeugten `id_by_customer`. Um die Buchung anschließend etwa über
`/postings/assign/receipt-to-free-posting` weiterzuverwenden, muss man sie über `/postings/get`
wiederfinden, zum Beispiel mit `account: "free booking"` und `date_last_action_from` auf dem heutigen
Datum.

### 14.4 Fehlerfälle (34 von 34)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid posting type specified | Buchungstyp nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | no date specified | `date` fehlt | Datum senden |
| 400 | 7 | invalid date specified | `date` nicht parsebar oder außerhalb eines zulässigen Zeitraums | `YYYY-MM-DD` senden; bei festgeschriebenen Perioden anderes Datum wählen |
| 400 | 8 | no postingtext specified | `postingtext` fehlt oder leer | Text senden |
| 400 | 9 | the posting text is longer than 128 characters | Text zu lang | kürzen |
| 400 | 10 | no postingaccount_debit specified | Sollkonto fehlt | Konto senden |
| 400 | 12 | invalid postingaccount_debit specified or postingaccount_debit is not available | Sollkonto unbekannt oder nicht freigeschaltet | Konten über `/settings/get/postingaccounts` prüfen |
| 400 | 13 | no postingaccount_credit specified | Habenkonto fehlt | Konto senden |
| 400 | 14 | invalid postingaccount_credit specified or postingaccount_credit is not available | Habenkonto unbekannt oder nicht freigeschaltet | wie oben |
| 400 | 16 | the cost location is longer than 10 characters | Kostenstelle zu lang | kürzen |
| 400 | 17 | the cost location must consist of alphanumeric characters or be a number greater than 0 | formal ungültig | Format korrigieren |
| 400 | 18 | no vat specified | `vat` fehlt | Steuerschlüssel senden |
| 400 | 19 | invalid vat specified | Wert nicht in der Liste der 23 Schlüssel | gültigen Schlüssel verwenden |
| 400 | 20 | No amount specified | `amount` fehlt | Betrag senden |
| 400 | 21 | invalid amount specified | Betrag formal ungültig | Punkt als Dezimaltrenner, keine Tausendertrenner |
| 400 | 22 | there are no negative amounts allowed | negativer Betrag gesendet | Betrag positiv senden und stattdessen Soll- und Habenkonto tauschen |
| 400 | 23 | no post and files content received or declined | Body leer oder unlesbar | gültiges JSON senden |
| 400 | 24 | specified postingaccount_debit cannot posted manually | Sollkonto ist Automatikkonto | anderes Konto wählen |
| 400 | 25 | specified postingaccount_credit cannot posted manually | Habenkonto ist Automatikkonto | anderes Konto wählen |
| 400 | 26 | The postingaccount_credit is identical to the postingaccount_debit | Soll- und Habenkonto gleich | verschiedene Konten wählen |
| 400 | 27 | The account %postingaccount_number% must be posted with vat option %vat_option% | Konto erzwingt einen Schlüssel | genannten Schlüssel verwenden |
| 400 | 28 | the vat option for account "…" is invalid | Schlüssel für dieses Konto unzulässig | Schlüssel ändern |
| 400 | 29 | the account "…" must be posted with/without %vat_class% | Konto verlangt eine Steuerklasse | passenden Schlüssel wählen |
| 400 | 31 | no vat possible for specified combination | Kontenkombination erlaubt gar keine Steuer | `0_none` verwenden oder Konten ändern |
| 400 | 32 | the tax key is invalid for specified account combination | abgeleiteter Steuerschlüssel passt nicht zur Kontenkombination | Konten oder `vat` ändern |
| 400 | 33 | vat option unavailable due to current settings | Einstellung sperrt den Schlüssel | Einstellung prüfen |
| 400 | 34 | vat option unavailable with 'not liable to sales tax' setting | Kleinunternehmerregelung | `0_none` verwenden |
| 400 | 36 | the cost location two is longer than 10 characters | zweite Kostenstelle zu lang | kürzen |
| 400 | 37 | the cost location two must consist of alphanumeric characters or be a number greater than 0 | formal ungültig | Format korrigieren |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | erneut versuchen |

Auffällig: `/postings/add/free` kennt **keinen** `error_code` 46 für unbekannte Parameter, anders als
`/postings/add/receipt` und `/postings/add/transaction`. Ob unbekannte Felder hier toleriert werden,
ist **nicht verifiziert**.

### 14.5 curl-Beispiel

Abschreibung von 250,00 ohne Umsatzsteuer:

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/add/free" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "date": "2026-03-31",
        "postingtext": "Abschreibung Q1 Bürotechnik",
        "amount": "250.00",
        "postingaccount_debit": 4830,
        "postingaccount_credit": 490,
        "vat": "0_none",
        "cost_location": "100"
      }'
```

Datum, Konten, Betrag und Kostenstelle sind erfundene Platzhalter.

### 14.6 Fallstricke

- Das Format von `date` steht nicht in der Parameterbeschreibung. Es ist nur aus der Batch-Definition
  ableitbar.
- `amount` ist als `string` deklariert, ohne Formatangabe, obwohl die Schwesterendpunkte "format
  0000.00" nennen. Die Batch-Definition deklariert dasselbe Feld als `number`.
- Negative Beträge werden abgelehnt. Eine Gegenbuchung erreicht man durch Vertauschen von Soll und
  Haben, nicht durch ein Minuszeichen.
- Eine freie Buchung kann keine Splitzeilen enthalten. Mehrzeilige Sachverhalte erfordern mehrere
  Buchungen ohne gemeinsame Klammer.
- Kein Parameter, um direkt einen Beleg zu verknüpfen. Das geht nur nachgelagert über
  `/postings/assign/receipt-to-free-posting`, und dafür braucht man die `id_by_customer`, die die
  Antwort nicht liefert.
- Live nicht verifizierbar, da schreibend.

---

## 15. `/postings/add-batch/free`

Legt mehrere freie Buchungen in einem Request an.

**Einordnung: SCHREIBEND.**

### 15.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `free_postings` | array | ja | – | Liste freier Buchungen; jede hat dieselbe Felddeklaration und Validierung wie `/postings/add/free` | `$ref: PostingsFree` |

### 15.2 Verschachtelte Struktur

`PostingsFree` ist ein Array von Objekten mit folgenden Feldern:

| Feld | Typ laut Definition | Pflicht laut `required` | Beispiel |
| --- | --- | --- | --- |
| `date` | string | ja | `2024-04-07` |
| `postingtext` | string | ja | `postingtext` |
| `amount` | number | **siehe Hinweis** | `12.87` |
| `postingaccount_debit` | integer | ja | `1590` |
| `postingaccount_credit` | integer | ja | `320` |
| `vat` | string | ja | `19_vat` |
| `cost_location` | string | nein | `cost location` |
| `cost_location_two` | string | nein | `cost location two` |

Hinweis zu `amount`: Die `required`-Liste der Definition lautet
`["date", "postingtext", "vat", "amounts", "postingaccount_debit", "postingaccount_credit"]`. Sie
nennt also `amounts` im Plural, ein Feld, das die Definition gar nicht besitzt. Das Feld heißt
`amount`. Es ist fachlich zweifellos Pflicht, formal aber falsch deklariert.

### 15.3 Erfolgsantwort

```json
{
  "success": true,
  "free_postings": [ { "success": true, "message": "" } ],
  "errors": [
    { "success": false, "error_code": 19, "message": "…", "request_data": [] }
  ]
}
```

Struktur wie bei den anderen Batch-Endpunkten, das Erfolgs-Array heißt `free_postings`.

### 15.4 Fehlerfälle (6 von 6)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or invalid api client for customer or insufficient privileges | `api_key` falsch oder Client nicht freigeschaltet | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 403 | 15 | adding temporarily restricted | Anlage vorübergehend gesperrt | später erneut versuchen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | Batch verkleinern |

Inhaltliche Fehler einzelner Elemente erscheinen im Array `errors` einer 200er-Antwort und tragen die
Codes aus Abschnitt 14.4.

### 15.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/add-batch/free" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "free_postings": [
          {
            "date": "2026-03-31",
            "postingtext": "Abschreibung Q1 Bürotechnik",
            "amount": "250.00",
            "postingaccount_debit": 4830,
            "postingaccount_credit": 490,
            "vat": "0_none"
          },
          {
            "date": "2026-03-31",
            "postingtext": "Umbuchung Verrechnungskonto",
            "amount": "1200.00",
            "postingaccount_debit": 1590,
            "postingaccount_credit": 1360,
            "vat": "0_none",
            "cost_location": "200"
          }
        ]
      }'
```

### 15.6 Fallstricke

- Die `required`-Liste nennt `amounts`, das Feld heißt `amount`. Reiner Fehler der Spezifikation.
- `amount` ist hier `number`, im Einzelendpunkt `string`. Dieselbe Typunsicherheit wie bei den anderen
  Batches. Die konservative Wahl ist die Zeichenkette, weil die Parameterbeschreibung auf den
  Einzelendpunkt verweist. **Annahme.**
- Die Beschreibung des 200er-Responses lautet auch hier "add receipt postings successfully".
- Keine dokumentierte Obergrenze für die Elementzahl. **Nicht verifiziert.**
- Live nicht verifizierbar, da schreibend.

---

## 16. `/postings/unconfirm/transaction`

Entfernt alle nicht festgeschriebenen Buchungen einer Transaktion durch Entbestätigen.

**Einordnung: SCHREIBEND und LÖSCHEND.** Die Buchungen verschwinden ersatzlos.

### 16.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `transaction_id_by_customer` | integer | ja | – | Transaktionsnummer, deren Buchungen entfernt werden | ganzzahlig |

### 16.2 Verschachtelte Struktur

Keine.

### 16.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

Die Antwort nennt nicht, wie viele Buchungszeilen entfernt wurden. Bei einer Splitbuchung sind es alle
Zeilen der Transaktion.

### 16.4 Fehlerfälle (11 von 11)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid unconfirm type specified | Typ nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | Transaction not found. | Transaktion unbekannt | über `/transactions/get` prüfen |
| 400 | 7 | transaction has no postings to unconfirm | Transaktion ist gar nicht gebucht | kein Handlungsbedarf; als Erfolg behandeln |
| 400 | 8 | transaction has fixed postings that cannot be unconfirmed | Buchungen sind festgeschrieben | `/postings/cancel` je Buchung erwägen, nur nach menschlicher Freigabe |
| 400 | 9 | parameter transaction_id_by_customer must be an integer | Typfehler | Zahl statt Zeichenkette senden |
| 400 | 10 | parameter transaction_id_by_customer is required | Parameter fehlt | ergänzen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | timeout | Zeitüberschreitung | erneut versuchen |

### 16.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/unconfirm/transaction" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "transaction_id_by_customer": 654
      }'
```

### 16.6 Fallstricke

- Der Aufruf adressiert die Transaktion, nicht die Buchung. Er entfernt in einem Schritt **alle**
  Buchungszeilen dieser Transaktion. Eine einzelne Zeile einer Splitbuchung lässt sich so nicht
  entfernen.
- Die Meldung von Code 30 lautet hier schlicht "timeout", bei den meisten anderen Endpunkten
  "a timeout occurred while processing the request". Der Text ist nicht einheitlich; ein Client darf
  nie auf `message` matchen.
- Code 7 ist fachlich kein Fehler, sondern die Feststellung, dass nichts zu tun war. Ein idempotent
  gedachter Client sollte ihn als Erfolg werten.
- Live nicht verifizierbar, da schreibend.

---

## 17. `/postings/unconfirm/receipt`

Entfernt alle nicht festgeschriebenen Buchungen eines Belegs durch Entbestätigen.

**Einordnung: SCHREIBEND und LÖSCHEND.**

### 17.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `receipt_id_by_customer` | integer | ja | – | Belegnummer, deren Buchungen entfernt werden | ganzzahlig |

### 17.2 Verschachtelte Struktur

Keine.

### 17.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

### 17.4 Fehlerfälle (11 von 11)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid unconfirm type specified | Typ nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | Receipt not found. | Beleg unbekannt | über `/receipts/get` prüfen |
| 400 | 7 | receipt has no postings to unconfirm | Beleg ist nicht gebucht | kein Handlungsbedarf |
| 400 | 8 | receipt has fixed postings that cannot be unconfirmed | Buchungen festgeschrieben | `/postings/cancel` erwägen, nur nach menschlicher Freigabe |
| 400 | 9 | parameter receipt_id_by_customer must be an integer | Typfehler | Zahl senden |
| 400 | 10 | parameter receipt_id_by_customer is required | Parameter fehlt | ergänzen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | timeout | Zeitüberschreitung | erneut versuchen |

### 17.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/unconfirm/receipt" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "receipt_id_by_customer": 142
      }'
```

### 17.6 Fallstricke

- Entfernt alle Buchungszeilen des Belegs, nicht einzelne Splitzeilen.
- Der Beleg selbst bleibt unangetastet; nur seine Buchung verschwindet.
- Wenn der Beleg über eine verknüpfte Transaktion gebucht wurde, liegen die Buchungen an der
  Transaktion. Dann meldet dieser Endpunkt Code 7 und man braucht
  `/postings/unconfirm/transaction`.
- Live nicht verifizierbar, da schreibend.

---

## 18. `/postings/unconfirm/free`

Entfernt eine einzelne, nicht festgeschriebene freie Buchung durch Entbestätigen.

**Einordnung: SCHREIBEND und LÖSCHEND.**

### 18.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `posting_id_by_customer` | integer | ja | – | `id_by_customer` der freien Buchung | ganzzahlig, aus `/postings/get` |

### 18.2 Verschachtelte Struktur

Keine.

### 18.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

### 18.4 Fehlerfälle (11 von 11)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid unconfirm type specified | Typ nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | Posting not found. | Buchung unbekannt | `id_by_customer` über `/postings/get` prüfen |
| 400 | 7 | Posting is not a free posting. | Buchung gehört zu Beleg oder Transaktion | den passenden `unconfirm`-Endpunkt verwenden |
| 400 | 8 | Posting is fixed and cannot be unconfirmed. | Buchung festgeschrieben | `/postings/cancel` erwägen, nur nach menschlicher Freigabe |
| 400 | 9 | parameter posting_id_by_customer must be an integer | Typfehler | Zahl senden |
| 400 | 10 | parameter posting_id_by_customer is required | Parameter fehlt | ergänzen |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | timeout | Zeitüberschreitung | erneut versuchen |

### 18.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/unconfirm/free" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "posting_id_by_customer": 4711
      }'
```

### 18.6 Fallstricke

- Dieser Endpunkt adressiert als einziger der drei `unconfirm`-Endpunkte die Buchung selbst, nicht ihr
  übergeordnetes Objekt. Der Parametername ist entsprechend `posting_id_by_customer`, nicht
  `receipt_id_by_customer` oder `transaction_id_by_customer`. Diese Uneinheitlichkeit ist eine
  klassische Fehlerquelle.
- Code 7 unterscheidet sich in der Bedeutung fundamental vom Code 7 der beiden anderen
  `unconfirm`-Endpunkte: Hier heißt er "falscher Buchungstyp", dort "nichts zu tun".
- Live nicht verifizierbar, da schreibend.

---

## 19. `/postings/assign/receipt-to-free-posting`

Ordnet einen vorhandenen Beleg einer vorhandenen freien Buchung zu.

**Einordnung: SCHREIBEND.** Verändert die Verknüpfung, nicht den Buchungssatz selbst.

### 19.1 Parameter (3 von 3)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `receipt_id_by_customer` | integer | ja | – | Belegnummer des zuzuordnenden Belegs | ganzzahlig |
| `posting_id_by_customer` | integer | ja | – | `id_by_customer` der freien Buchung | ganzzahlig |

### 19.2 Verschachtelte Struktur

Keine.

### 19.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

### 19.4 Fehlerfälle (12 von 12)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | invalid assignment type specified | Zuordnungstyp nicht erkannt | Endpunktpfad prüfen |
| 400 | 6 | receipt not found | Beleg unbekannt | über `/receipts/get` prüfen |
| 400 | 7 | posting not found | Buchung unbekannt | über `/postings/get` prüfen |
| 400 | 8 | receipt is deleted | Beleg ist gelöscht | wiederherstellen oder anderen Beleg wählen |
| 400 | 9 | posting is no free posting | Buchung ist Beleg- oder Transaktionsbuchung | nur freie Buchungen sind zulässig |
| 400 | 10 | assignment failed | Zuordnung serverseitig abgelehnt, Grund nicht genannt | Zustand von Beleg und Buchung prüfen |
| 400 | 23 | no post and files content received or declined | Body leer oder unlesbar | gültiges JSON senden |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | erneut versuchen |

### 19.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/assign/receipt-to-free-posting" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "receipt_id_by_customer": 142,
        "posting_id_by_customer": 4711
      }'
```

### 19.6 Fallstricke

- Es gibt keinen Gegenendpunkt, der die Zuordnung wieder löst. Für Beleg und Transaktion existiert
  `/transactions/unassign/receipt`, für die freie Buchung nicht. **Nicht verifiziert**, ob eine
  erneute Zuordnung eines anderen Belegs die bestehende ersetzt.
- Code 10 ("assignment failed") ist ein Sammelfehler ohne inhaltliche Begründung. Er ist für einen
  Agenten nicht automatisch auflösbar.
- Die Voraussetzung, dass `posting_id_by_customer` auf eine **freie** Buchung zeigt, ist leicht zu
  verletzen, weil `/postings/get` alle Buchungsarten in derselben Liste mit demselben Feldnamen
  `id_by_customer` liefert. Freie Buchungen erkennt man daran, dass `receipt_id_by_customer` und
  `transaction_id_by_customer` beide `null` sind, oder über den Filter `account: "free booking"`
  (live bestätigt).
- Live nicht verifizierbar, da schreibend.

---

## 20. `/postings/cancel`

Storniert eine einzelne Buchung.

**Einordnung: SCHREIBEND und potenziell irreversibel.** Bei festgeschriebenen Buchungen entsteht eine
dauerhaft sichtbare Stornobuchung.

### 20.1 Parameter (2 von 2)

| Feld | Typ | Pflicht | Default | Beschreibung | Format |
| --- | --- | --- | --- | --- | --- |
| `api_key` | string | ja | – | Mandantenschlüssel | mandantenspezifisch |
| `posting_id_by_customer` | integer | ja | – | `id_by_customer` der zu stornierenden Buchung | ganzzahlig, aus `/postings/get` |

### 20.2 Verschachtelte Struktur

Keine.

### 20.3 Erfolgsantwort

```json
{ "success": true, "message": "" }
```

Die Antwort unterscheidet nicht zwischen Löschung und Stornobuchung. Wer wissen will, was passiert
ist, muss vorher `fixed` aus `/postings/get` lesen und hinterher erneut prüfen.

### 20.4 Fehlerfälle (11 von 11)

| HTTP | `error_code` | `message` | Bedeutung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 401 | 3 | API credentials unknown or invalid | Basic Auth falsch | Zugangsdaten prüfen |
| 401 | 4 | customer not found or insufficient privileges | `api_key` falsch | `api_key` prüfen |
| 403 | 11 | customer has no active status | Mandant inaktiv | im Portal klären |
| 400 | 5 | Parameter posting_id_by_customer is required. | Parameter fehlt | ergänzen |
| 400 | 6 | Parameter posting_id_by_customer must be an integer. | Typfehler | Zahl senden |
| 400 | 7 | Posting not found. | Buchung unbekannt | `id_by_customer` prüfen |
| 400 | 8 | Posting cannot be cancelled. | Storno fachlich unzulässig, etwa weil es sich bereits um eine Stornobuchung handelt | Zustand prüfen, nicht blind wiederholen |
| 400 | 9 | Posting could not be cancelled. | Storno technisch gescheitert | erneut versuchen, danach Support |
| 400 | 23 | no post and files content received or declined | Body leer oder unlesbar | gültiges JSON senden |
| 500 | 0 | error while processing the request | serverseitiger Fehler | wiederholen |
| 504 | 30 | a timeout occurred while processing the request | Zeitüberschreitung | erneut versuchen |

Die Codes 5 und 6 sind hier gegenüber den `unconfirm`-Endpunkten **vertauscht**: Dort ist 9 der
Typfehler und 10 das fehlende Pflichtfeld, hier ist 6 der Typfehler und 5 das fehlende Pflichtfeld.
Zusätzlich belegt `/postings/cancel` den Code 5, der bei allen anderen Schreib-Endpunkten für
"invalid … type specified" steht.

Die Codes 8 und 9 unterscheiden sich im Deutschen nur durch ein Wort ("cannot" gegen "could not"),
bedeuten aber Verschiedenes: 8 ist eine fachliche Ablehnung, 9 ein technisches Scheitern. Ein
Wiederholungsversuch ist nur bei 9 sinnvoll.

### 20.5 curl-Beispiel

```bash
curl -sS -X POST "https://webapp.buchhaltungsbutler.de/api/v1/postings/cancel" \
  -u "IHR_API_CLIENT:IHR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "api_key": "IHR_API_KEY",
        "posting_id_by_customer": 4711
      }'
```

### 20.6 Fallstricke

- Zwei völlig verschiedene Wirkungen hinter einem Aufruf, gesteuert allein durch `fixed`. Der Aufrufer
  hat keinen Schalter, um eine der beiden Wirkungen zu erzwingen oder auszuschließen.
- Das Ergebnis ist aus der Antwort nicht erkennbar.
- Der Endpunkt storniert genau eine Buchungszeile. Bei einer Splitbuchung mit fünf Zeilen sind fünf
  Aufrufe nötig. Ein Zwischenstand, in dem drei Zeilen storniert sind und zwei nicht, ist ein
  unausgeglichener Buchungsstand. Es gibt keine Transaktionsklammer.
- Eine Stornobuchung lässt sich nicht stornieren (Code 8, **Annahme** zur genauen Ursache).
- Live nicht verifizierbar, da schreibend.

---

## 21. Gesammelte Fallstricke der Spezifikation

Diese Liste ist das Ergebnis der Durchsicht aller zwölf `/postings`-Pfade und der zugehörigen
Definitionen. Sie ist für Implementierende gedacht, die sich auf die Datei stützen wollen.

### 21.1 Strukturfehler

1. Body-Parameter stehen einzeln mit `"in": "body"` und eigenem `"type"` statt in einem gemeinsamen
   `schema`. Gilt für alle zwölf Pfade.
2. `responses`-Schlüssel wie `"400 (17)"` sind keine gültigen Swagger-Statuscodes.
3. Die drei Batch-Parameter `receipts`, `transactions`, `free_postings` tragen `"type": null` und
   zusätzlich ein `schema`. Beides zusammen ist nicht zulässig.
4. Es gibt weder `securityDefinitions` noch `security`, obwohl Basic Auth zwingend ist.
5. Es gibt keinen `tags`-Block auf oberster Ebene, obwohl jeder Pfad `tags: ["Postings"]` trägt.
6. Die Arrays in `/postings/add/receipt` und `/postings/add/transaction` deklarieren kein `items`. Der
   Elementtyp ist nur aus den Batch-Definitionen erschließbar.

### 21.2 Inkonsistente Feldnamen und Typen

| Ort A | Ort B | Konflikt |
| --- | --- | --- |
| `/postings/add/receipt` Parameter `postingtexts` | Definition `ReceiptPostings` Feld `postingstexts` | zusätzliches `s` |
| `/postings/add/free` Parameter `amount` Typ `string` | Definition `PostingsFree` Feld `amount` Typ `number` | Typkonflikt |
| `/postings/add/receipt` Parameter `amounts` Format `0000.00` (Zeichenketten) | Definition `ReceiptPostings` Feld `amounts` Typ `number` | Typkonflikt |
| `/postings/add/transaction` `oi_receipts_ids_by_customer` erlaubt `null` | Definition `TransactionPostings` Typ `array of integer` | `null` formal ausgeschlossen |
| Definition `PostingsFree` `required` nennt `amounts` | Definition besitzt nur `amount` | Feld existiert nicht |
| `/postings/add/free` nutzt Singular (`postingtext`, `vat`, `cost_location`) | Beleg- und Transaktionsbuchung nutzen Plural | uneinheitliche Namenskonvention |
| `/postings/get` Antwortfeld `booking_number` Typ `string` | Live-Antwort liefert eine JSON-Zahl | Typkonflikt, live belegt |

### 21.3 Widersprüchliche Pflichtangaben

| Feld | `required` | Beschreibung sagt |
| --- | --- | --- |
| `creditor` in `/postings/add/receipt` | `true` | nur bei Eingangsrechnung und aktivierter Kreditorenbuchung |
| `debtor` in `/postings/add/receipt` | `true` | nur bei Ausgangsrechnung und aktivierter Debitorenbuchung |
| `oi_receipts_ids_by_customer` in `/postings/add/transaction` | `true` | nur bei aktivierter OP-Buchung |
| `postingstexts` in `ReceiptPostings` | nicht in `required` | Einzelendpunkt nennt `postingtexts` als Pflicht |

### 21.4 Kopierfehler in Texten

- `/postings/add-batch/transactions` und `/postings/add-batch/free` beschreiben ihren 200er-Response
  als "add receipt postings successfully".
- `/postings/add/transaction` verweist bei 500 und 504 auf `PostingsAddReceipt_ErrorCode0` und
  `PostingsAddReceipt_ErrorCode30`.
- In `PostingsAddReceipt_ErrorCode22`, `_ErrorCode25` und `_ErrorCode26` lautet der Platzhalter im
  `message`-Feld `%postinaccount_number%`, in der Response-Beschreibung dagegen
  `%postingaccount_number%`.
- In `PostingsAddFree_ErrorCode28` und `_ErrorCode29` lautet der Platzhalter `%postingsccount_name%`.
- `PostingsGet_ErrorCode8` trägt die Meldung "invalid postingaccount **flag** specified", die
  Response-Beschreibung dagegen "invalid postingaccount specified".
- Die Timeout-Meldung lautet bei den drei `unconfirm`-Endpunkten "timeout", sonst "a timeout occurred
  while processing the request".

### 21.5 Verwaiste Definitionen

Die Datei enthält 36 Definitionen mit dem Präfix `PostingsReservations`
(`PostingsReservationsAdd_*`, `PostingsReservationsGet_*`, `PostingsReservationsDelete_*`), auf die
**kein** Pfad verweist. Das legt nahe, dass es Endpunkte für Buchungsreservierungen gibt oder gab,
die in der öffentlichen Spezifikation nicht als Pfade auftauchen. **Nicht verifiziert.** Sie wurden
nicht live geprüft, da sie nicht auf der Freigabeliste stehen und `Add` und `Delete` schreibend wären.

### 21.6 Semantische Lücken

- Kein Endpunkt zum **Ändern** einer Buchung. Der einzige Weg ist entbestätigen und neu anlegen.
- Kein Endpunkt zum **Festschreiben**. Das geschieht ausschließlich im Portal.
- Kein Endpunkt, um die Zuordnung Beleg zu freier Buchung wieder zu lösen.
- Kein Idempotenzschlüssel. Ein Timeout bei einem `add`-Aufruf hinterlässt einen unklaren Zustand.
- Keine Rückgabe der erzeugten `id_by_customer` bei allen `add`-Endpunkten.
- Kein Filter auf `cost_location_two` in `/postings/get`, obwohl das Feld geliefert wird.
- Keine Gesamtzahl der Treffer in `/postings/get`, nur die Zahl der gelieferten Zeilen.
- Keine dokumentierte Obergrenze für die Elementzahl der Batch-Endpunkte.

---

## 22. Hinweise für das MCP-Tool-Design

### 22.1 Endpunkte, die fachlich zusammengehören

| Gruppe | Endpunkte | Gemeinsamkeit |
| --- | --- | --- |
| Lesen | `/postings/get` | einziger lesender Endpunkt; Grundlage jeder Recherche |
| Buchen | `/postings/add/receipt`, `/postings/add/transaction`, `/postings/add/free` | erzeugen Buchungen; unterscheiden sich nur im Ankerobjekt |
| Massenbuchen | `/postings/add-batch/receipts`, `/postings/add-batch/transactions`, `/postings/add-batch/free` | identische Semantik zum Einzelfall, abweichende Antwortstruktur |
| Rückgängig machen vor Festschreibung | `/postings/unconfirm/receipt`, `/postings/unconfirm/transaction`, `/postings/unconfirm/free` | ersatzlose Entfernung; scheitern bei festgeschriebenen Buchungen |
| Rückgängig machen nach Festschreibung | `/postings/cancel` | erzeugt gegebenenfalls eine Stornobuchung |
| Verknüpfen | `/postings/assign/receipt-to-free-posting` | nachträgliche Belegzuordnung, nur für freie Buchungen |

Vorschlag für den Tool-Zuschnitt: Die drei Einzelbuchungs-Endpunkte nicht zu einem generischen Tool
zusammenfassen. Ihre Parameter sind zu verschieden (Arrays gegen Einzelwerte, `creditor`/`debtor` gegen
`postingaccount_debit`/`postingaccount_credit`), und ein Modell würde die Felder mischen. Besser sind
drei getrennte Tools mit sprechenden Namen, deren Beschreibung jeweils zuerst sagt, **wann** sie nicht
zu verwenden sind.

Die drei `unconfirm`-Endpunkte dagegen lassen sich gefahrlos zu einem Tool mit einem
Diskriminator-Parameter (`receipt`, `transaction`, `free`) bündeln, weil sie strukturgleich sind.

### 22.2 Mehrstufige Abläufe

Diese Abläufe braucht ein Agent zwingend, weil ein einzelner Aufruf nicht genügt.

**Belegbuchung anlegen**

1. `/receipts/get` oder `/receipts/get/id_by_customer`, um Beleg, Richtung (`type`), Betrag (`amount`)
   und Währung zu kennen. Bei Fremdwährung ist `amount` der umgerechnete Betrag.
2. `/settings/get/postingaccounts`, um ein gültiges, manuell bebuchbares Buchungskonto zu wählen.
3. `/settings/get/creditors` beziehungsweise `/settings/get/debtors`, um das Personenkonto zu
   ermitteln, passend zur Belegrichtung.
4. Optional `/cost-locations/get` für gültige Kostenstellen.
5. `/postings/add/receipt`.
6. `/postings/get` mit `date_last_action_from` auf dem heutigen Datum, um das Ergebnis zu prüfen, da
   der `add`-Aufruf keine IDs zurückgibt.

**Transaktionsbuchung anlegen**

1. `/transactions/get`, um Betrag und Verwendungszweck zu kennen.
2. Optional `/transactions/assigned-receipts/get`, um zu sehen, welche Belege bereits an der
   Transaktion hängen.
3. `/settings/get/postingaccounts` für gültige Konten.
4. Bei aktiver OP-Buchhaltung: die auszugleichenden Belege ermitteln.
5. `/postings/add/transaction`.
6. Prüfung über `/postings/get`.

**Freie Buchung mit Belegbezug**

1. `/settings/get/postingaccounts` für Soll- und Habenkonto.
2. `/postings/add/free`.
3. `/postings/get` mit `account: "free booking"` und `date_last_action_from`, um die erzeugte
   `id_by_customer` zu finden.
4. `/postings/assign/receipt-to-free-posting`.

Schritt 3 ist die Sollbruchstelle: Es gibt keinen zuverlässigen Weg, die soeben erzeugte Buchung zu
identifizieren, wenn mehrere ähnliche Buchungen am selben Tag entstehen. Ein Tool sollte den
Buchungstext eindeutig machen, damit er als Wiedererkennungsmerkmal dient.

**Fehlerhafte Buchung korrigieren**

1. `/postings/get`, um `id_by_customer` und `fixed` zu lesen.
2. Bei `fixed == "0"`: passenden `unconfirm`-Endpunkt aufrufen, dann neu buchen.
3. Bei `fixed == "1"`: `/postings/cancel` je betroffener Zeile, dann neu buchen. Dieser Schritt
   erzeugt Stornobuchungen und darf nur nach ausdrücklicher menschlicher Freigabe erfolgen.

### 22.3 Parameter, die ein Agent nicht erraten kann

Diese Felder brauchen in der Tool-Beschreibung überdurchschnittlich ausführlichen Text und möglichst
eine Enum-Deklaration oder einen vorgeschalteten Lookup.

| Parameter | Warum schwer | Empfehlung |
| --- | --- | --- |
| `vat` / `vats` | 23 kryptische Schlüssel, deren Namen nicht selbsterklärend sind; Gültigkeit hängt vom Konto, vom Datum und von den Mandanteneinstellungen ab | als Enum mit allen 23 Werten und deutschem Klartext deklarieren; in der Beschreibung ausdrücklich sagen, dass `_pre` für Eingangs- und `_vat` für Ausgangsumsätze steht |
| `postingaccounts` / `postingaccount_debit` / `postingaccount_credit` | mandantenspezifischer Kontenrahmen; nicht jedes Konto ist manuell bebuchbar | ein eigenes Lookup-Tool auf `/settings/get/postingaccounts` anbieten und in der Beschreibung darauf verweisen |
| `creditor` / `debtor` | die Wahl hängt an der Belegrichtung, nicht an einer freien Entscheidung; beide sind formal Pflicht | in der Beschreibung die Regel nennen: Eingangsrechnung braucht `creditor`, Ausgangsrechnung braucht `debtor`, niemals beides |
| `oi_receipts_ids_by_customer` | Bedeutung nur mit Kenntnis der OP-Buchhaltung verständlich; `null` ist ein bedeutungstragender Wert | Beschreibung muss erklären, dass die Länge des Arrays der Zeilenzahl entsprechen muss und `null` "kein Beleg" bedeutet |
| `account` und `postingaccount` in `/postings/get` | zwei ähnlich klingende Parameter mit verschiedenen Wertemengen | beide Wertemengen vollständig in der Beschreibung auflisten und den Unterschied in einem Satz benennen |
| `order` in `/postings/get` | case sensitive, sieben exakte Zeichenketten | als Enum deklarieren, nie als freien String |
| `cost_location` / `cost_locations` | Singular gegen Plural je nach Endpunkt; nur Codes, keine Namen | Lookup auf `/cost-locations/get` anbieten und klarstellen, dass der `code` zu senden ist |
| `posting_id_by_customer` gegen `receipt_id_by_customer` gegen `transaction_id_by_customer` | drei ähnliche Namen für drei verschiedene Objekte | in jeder Beschreibung explizit sagen, welches Objekt gemeint ist und woher die Nummer stammt |

### 22.4 Sicherungen, die ein MCP-Server einziehen sollte

1. **Schreibende Tools deutlich kennzeichnen.** Elf der zwölf Endpunkte schreiben. Nur
   `/postings/get` ist gefahrlos.
2. **`/postings/cancel` mit einer Bestätigungsschranke versehen.** Es ist der einzige Endpunkt, der
   einen dauerhaften, nicht rücknehmbaren Eintrag im Journal erzeugen kann.
3. **Vor jedem `unconfirm` und `cancel` den Ist-Zustand lesen** und dem Nutzer zeigen, was verschwinden
   wird. Die Endpunkte melden hinterher nicht, was sie getan haben.
4. **Kein automatisches Wiederholen von `add`-Aufrufen nach Timeout.** Ohne Idempotenzschlüssel droht
   eine Doppelbuchung. Stattdessen über `/postings/get` prüfen, ob die Buchung entstanden ist.
5. **Batch-Antworten immer auf `errors` prüfen.** `success: true` auf oberster Ebene bedeutet bei den
   drei Batch-Endpunkten nicht, dass alle Elemente verarbeitet wurden.
6. **Beträge als Zeichenketten durchreichen**, nicht als Gleitkommazahlen. Die Spezifikation ist an
   dieser Stelle widersprüchlich, die Zeichenkette ist die verlustfreie Wahl.
7. **`error_code` niemals endpunktübergreifend interpretieren.** Die Zuordnung Code zu Bedeutung ist
   pro Endpunkt verschieden. Ein gemeinsamer Fehlerkatalog im Server muss den Pfad als Teil des
   Schlüssels führen.
8. **Rate Limit von 100 Requests pro Mandant und Minute berücksichtigen.** Die mehrstufigen Abläufe aus
   22.2 verbrauchen pro Buchung drei bis sechs Requests. Lookups auf Konten, Kreditoren, Debitoren und
   Kostenstellen sollten im Server zwischengespeichert werden.
9. **Die Pflichtfelder `date_from` und `date_to` in `/postings/get` mit sinnvollen Vorgaben belegen**,
   etwa dem laufenden Geschäftsjahr, damit ein Modell nicht an der formalen Hürde scheitert.
10. **Blätterung im Server kapseln.** Die 1000er-Grenze, das Fehlen einer Gesamtzahl und die
    Notwendigkeit eines deterministischen `order` sind Details, die kein Modell verwalten sollte.
