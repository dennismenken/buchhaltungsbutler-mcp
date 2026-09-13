# Live-Befunde des Orchestrators

Eigene Messungen gegen die echte API, ausschließlich lesende Aufrufe. Sie korrigieren die
OpenAPI-Datei `docs/openapi/buchhaltungsbutler-v1.json` an Stellen, an denen diese falsch ist.
Alle Geschäftsdaten in den Beispielen sind anonymisiert.

**Stand: 2026-09-12.** Basis-URL `https://webapp.buchhaltungsbutler.de/api/v1`.

---

## Befund 1: `id_by_customer` im Pfad ist ein Platzhalter, kein literales Segment

**Schwere: kritisch.** Betrifft vier Endpunkte. Ohne diese Korrektur wären vier Werkzeuge
funktionsunfähig ausgeliefert worden.

Die Spezifikation führt die Pfade als `/receipts/get/id_by_customer`, **ohne** an ihnen einen
Body-Parameter dieses Namens zu deklarieren. Genau deshalb ergibt der dokumentierte Aufruf mit
einem Body-Feld `id_by_customer` einen Aufruf, der nicht funktioniert: Tatsächlich gehört der
Wert an die Stelle des Segments.

> **Korrigiert am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 4.6.** Der frühere Einleitungssatz behauptete, die Spezifikation
> deklariere `id_by_customer` **zusätzlich als Body-Parameter**. Das trifft nicht zu. Maschinell
> geprüft führt `/receipts/get/id_by_customer` nur `api_key` und `get_file`, die drei übrigen
> Pfade nur `api_key`. **Die Messungen dieses Befunds und alle daraus gezogenen Folgerungen
> bleiben unberührt**; korrigiert ist allein dieser eine Satz über die Spezifikationslage.

### Messung an `/receipts/get/id_by_customer`

| Variante | Aufruf | Ergebnis |
| --- | --- | --- |
| A, wie dokumentiert | `POST /receipts/get/id_by_customer`, Body `{"api_key": "…", "id_by_customer": 2}` | HTTP 400, `{"success":false,"error_code":5,"message":"invalid id_by_customer specified"}` |
| B, Wert als Segment | `POST /receipts/get/2`, Body `{"api_key": "…"}` | **HTTP 200**, vollständiger Belegdatensatz |
| C, Wert angehängt | `POST /receipts/get/id_by_customer/2`, Body `{"api_key": "…"}` | HTML-Fehlerseite, kein JSON |

### Messung an `/transactions/get/id_by_customer`

| Variante | Aufruf | Ergebnis |
| --- | --- | --- |
| A, wie dokumentiert | `POST /transactions/get/id_by_customer`, Body mit `id_by_customer` | HTML-Fehlerseite, kein JSON. Der Pfad existiert nicht. |
| B, Wert als Segment | `POST /transactions/get/1590`, Body `{"api_key": "…"}` | **HTTP 200**, vollständiger Transaktionsdatensatz |

### Folgerung

Für alle vier Endpunkte mit `id_by_customer` im Pfad gilt: Der Wert wird in den Pfad
eingesetzt, das Segment `id_by_customer` entfällt. Ein Body-Feld `id_by_customer` wird
nicht gesendet.

| Spezifikationspfad | Tatsächlicher Aufruf | Verifiziert |
| --- | --- | --- |
| `/receipts/get/id_by_customer` | `/receipts/{id_by_customer}` bzw. `/receipts/get/{wert}` | ja, lesend gemessen |
| `/transactions/get/id_by_customer` | `/transactions/get/{wert}` | ja, lesend gemessen |
| `/receipts/delete/id_by_customer` | `/receipts/delete/{wert}` | **nein**, schreibend, nicht getestet. Analogieschluss aus den beiden gemessenen Fällen. |
| `/receipts/restore/id_by_customer` | `/receipts/restore/{wert}` | **nein**, schreibend, nicht getestet. Analogieschluss. |

Der Wert muss vor dem Einsetzen URL-kodiert werden. Die beiden nicht verifizierten Fälle sind
im Code als solche zu kennzeichnen; ihre Verifikation gehört in den ersten Schreibtest des
Projektinhabers.

Grundlage dieses Befunds ist die eigene Messung gegen die echte Schnittstelle: Die
Pfadsegmentform wurde am 2026-09-12 lesend aufgerufen und hat in beiden Fällen mit HTTP 200
geantwortet. Die Tabellen oben geben diese Aufrufe wieder.

---

## Befund 2: Antwortfelder, die die Spezifikation nicht kennt

`/receipts/get/{wert}` liefert unter anderem `amount_original` und `currency_original`,
also die Fremdwährungsfelder. Sie fehlen in der Spezifikation. Der Einzelabruf liefert damit
Felder, die der Listenabruf `/receipts/get` nicht enthält.

`/transactions/get/{wert}` liefert `account`, `to_from`, `booking_date`, `value_date`,
`amount`, `currency`, `account_number`, `bank_code`, `bank_name`, `purpose`, `type`,
`booking_text`. Felder ohne Wert kommen als JSON-`null`, nicht als leerer String.

Konsequenz: Die Antwortvalidierung darf unbekannte Felder nicht ablehnen, und
Antwortverträge werden gegen die gemessene Antwort gebildet, nicht gegen die Spezifikation.

---

## Befund 3: Typ-Asymmetrie bestätigt

`amount` kommt als String mit Punkt als Dezimaltrennzeichen (`"884.65"`, `"-192.44"`),
obwohl beim Schreiben eine JSON-Zahl erwartet wird. `id_by_customer` kommt bei Belegen als
String (`"2"`), bei Transaktionen als Zahl (`1590`). Die Asymmetrie ist also nicht einmal
zwischen den Ressourcen einheitlich und muss je Feld behandelt werden.
