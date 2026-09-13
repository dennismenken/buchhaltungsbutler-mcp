# Fehlercodes der BuchhaltungsButler API

Diese Datei ist eine systematische Extraktion aller `error_code`-Werte, die in der BuchhaltungsButler-API definiert sind, samt ihrer Zuordnung zu Endpunkten und HTTP-Status. Sie ist als Nachschlagewerk für die Implementierung des MCP-Servers gedacht und muss ohne Rücksprache mit der Live-API benutzbar sein.

## Quelle und Methodik

- Quelle: `docs/openapi/buchhaltungsbutler-v1.json`, Swagger-2.0-Beschreibung der BuchhaltungsButler-API in Version 1.9.1, heruntergeladen von `https://app.buchhaltungsbutler.de/docs/api/v1.de.json`. Abrufdatum: 2026-09-12.

- Die Datei ist kein valides Swagger 2.0: Body-Parameter stehen als einzelne Einträge mit `"in": "body"` statt gebündelt in einem `schema`-Objekt. Das betrifft die Request-Parameter, nicht die Fehlercodes selbst. Diese Datei befasst sich ausschließlich mit den `_ErrorCode*`- und `_Success`-Definitionen und den `responses`-Blöcken je Pfad.

- Extraktion rein mechanisch per `jq` aus `.definitions` (Schlüssel enthält `_ErrorCode`) und aus `.paths[pfad].post.responses` (HTTP-Status und `$ref` auf die jeweilige Definition). Es wurde nichts interpretiert oder ergänzt, was nicht direkt aus der Datei hervorgeht.

- `error_code` und `message` je Definition stehen als `enum` mit genau einem Eintrag in der Spec. Das ist laut Aufgabenstellung des Dossiers ein Beispielwert der Doku-Generierung (Swagger-Beispiel), keine formale Wertemenge. In der Praxis ist es nach Auswertung aller 718 Definitionen jedoch der tatsächliche, feste `error_code`-Wert dieser einen Fehlerbedeutung: Jede Definition hat genau einen Code und eine Message, es gibt keine Definition mit mehreren möglichen Codes. Ob die Live-API exakt diesen Wortlaut sendet, war zum Zeitpunkt dieses Dossiers **nicht verifiziert**; es ist inzwischen **teilweise beantwortet**, siehe den folgenden Kasten.

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20); Sachgrund in Abschnitt 0.3, Befund L6 und in Abschnitt 5.6.** Drei lesende Aufrufe gegen `/receipts/get` am 2026-09-12, alle mit HTTP 400: Bei `error_code` 5 (`invalid list_direction specified`) und `error_code` 10 (`invalid limit specified`) traf der Wortlaut zu, und zwar übereinstimmend mit `responses[…].description` **und** `properties.message.enum[0]`. Bei `error_code` 15 kam dagegen `invalid field specified` — ein Text, der **weder** in der `description` (`invalid sort field is specified`) **noch** im `message`-`enum` (`invalid sort field specified`) steht. Daraus folgt: Wo die beiden Spezifikationsquellen übereinstimmen, traf der Text in den gemessenen Fällen zu; wo sie sich widersprechen, war der gelieferte Text eine **dritte** Variante. Die Spalte „message (Original)" dieses Dossiers bleibt richtig gewählt — sie führt den `enum`-Wortlaut, und genau der ist die Katalogquelle —, **der gelieferte Text kann davon aber abweichen**. Für die Umsetzung gilt deshalb: Kein Spezifikationstext wird als Wortlaut der API ausgegeben, und keine Weiche hängt an einem Zeichenkettenvergleich gegen einen Spezifikationstext. Die Stichprobe ist drei Paare groß; verallgemeinert wird daraus die Regel, keine Aussage über die übrigen 783 Paare.

- Spalte "Bedeutung auf Deutsch" ist eine Übersetzung des englischen `message`-Wortlauts durch den Autor dieses Dossiers, keine von BuchhaltungsButler stammende Angabe. Technische Bezeichner (Feldnamen wie `postingaccount_number`, `receipt_id_by_customer` etc.) bleiben unübersetzt.

- Antwortumschlag bei Fehler (vom Orchestrator live verifiziert): `{"success":false,"error_code":<int>,"message":"<text>"}`. Die einzelnen `_ErrorCode*`-Definitionen in der Spec bilden genau die Felder `error_code` und `message` dieses Umschlags ab.

## Vollständigkeitsprüfung

- Anzahl `_ErrorCode*`-Definitionen in der Spec-Datei: **718**

- Anzahl `_ErrorCode*`-Definitionen, die in dieser Datei erfasst sind (Abschnitt B, pro Endpunkt, plus Abschnitt "Nicht referenzierte Definitionen"): **718**

  (676 sind mindestens einem Endpunkt in `.paths` zugeordnet, 42 sind in `.definitions` vorhanden, aber in keinem `responses`-Block referenziert; beide Gruppen zusammen ergeben 718.)

- Anzahl Endpunkte (`.paths`-Einträge) insgesamt: **54**

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 0.4 und 5.6.** Die Zahlen oben sind richtig, aber sie beschreiben die
> **Definitionen**, nicht den Katalog. Der Fehlerkatalog der Umsetzung wird nach dem Paar
> **(Pfad, `error_code`)** geschlüsselt, und davon gibt es **786**, maschinell ausgezählt über
> die `responses`-Schlüssel der Form `"400 (5)"`. Die **718** sind Definitionsnamen; 676 davon
> sind referenziert, **42** in keinem `responses`-Block. „718" als Abnahmebedingung für die
> Vollständigkeit des Katalogs wäre deshalb falsch und würde falsch abnehmen. Die 42 verwaisten
> Definitionen werden bewusst **nicht** in den Katalog aufgenommen: Sie sind kein belegtes
> Serververhalten. Die Abschnitte B und „Nicht referenzierte Definitionen" dieses Dossiers
> bleiben unverändert; sie sind die Quelle, aus der die 786 Paare gebildet werden.

## A) Globale Fehlercodes (endpunktübergreifend gleiche Bedeutung)

Diese Codes tauchen bei praktisch allen Endpunkten auf und haben überall dieselbe fachliche Bedeutung. Bei 4 und 30 gibt es zwei textliche Varianten der `message` (unterschiedlicher Wortlaut), die Bedeutung ist aber identisch; beide Wortlaute sind aufgeführt.

| error_code | HTTP-Status | message (Original) | Bedeutung auf Deutsch | typische Ursache | Empfehlung |
|---|---|---|---|---|---|
| 0 | 500 | `error while processing the request` | Interner Serverfehler bei der Verarbeitung des Requests. | Unerwarteter Fehler auf Seiten von BuchhaltungsButler, nicht am Request-Inhalt erkennbar. | Retry mit Backoff (transient); häufiges Auftreten dem Nutzer melden. |
| 3 | 401 | `API credentials unknown or invalid` | Die HTTP-Basic-Auth-Zugangsdaten (API Client / API Secret) sind unbekannt oder ungültig. | Falscher API Client oder falsches API Secret, oder Zugangsdaten wurden widerrufen. | Kein Retry ohne Korrektur. Konfigurationsfehler: API Client/Secret prüfen und korrigieren. |
| 4 | 401 | `customer not found or insufficient privileges`<br>`customer not found or invalid api client for customer or insufficient privileges` | Der im Body angegebene `api_key` (Mandant) existiert nicht, oder der verwendete API Client hat für diesen Mandanten keine ausreichenden Rechte. | Falscher oder fehlender `api_key` im Body, oder der API Client wurde dem Mandanten nicht (oder nicht mit ausreichenden Rechten) zugewiesen. | Kein Retry ohne Korrektur. Konfigurationsfehler: `api_key` und Zuordnung API Client zu Mandant prüfen. |
| 11 | 403 | `customer has no active status` | Der per `api_key` gewählte Mandant ist nicht aktiv (z. B. gekündigt, pausiert, im Setup). | Mandant wurde in BuchhaltungsButler deaktiviert oder ist noch nicht vollständig eingerichtet. | Kein Retry ohne Änderung im BuchhaltungsButler-Konto selbst. Konfigurationsfehler auf Fachseite, nicht durch den MCP-Server behebbar. |
| 30 | 504 | `a timeout occurred while processing the request`<br>`timeout` | Der Request hat serverseitig zu lange gedauert und wurde abgebrochen. | Hohe Serverlast, sehr große Datenmengen in der Anfrage, oder eine vorübergehende Störung. | Retry mit Backoff (transient), Anzahl Versuche begrenzen. |

Nicht in diese globale Tabelle aufgenommen, obwohl sie ebenfalls aus der gemeinsamen `Request_ErrorCode*`-Definitionsfamilie stammen können: **1, 2, 10, 15, 23**. Diese Zahlen sind je nach Endpunkt mit **unterschiedlicher** Bedeutung belegt, siehe Abschnitt C.

## B) Fehlercodes je Endpunkt

Alle 400er/401er/403er/422er/500er/504er-Antworten je Endpunkt, sortiert nach HTTP-Status und `error_code`. Die Erfolgsantwort (HTTP 200) ist nicht Teil dieser Tabellen; ihr Schema ist `<Prefix>_Success` in derselben Spec-Datei.

### `/accounts/add`

Add a basic account.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `no type specified` | Kein type angegeben. |
| 400 | 6 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 7 | `no name specified` | Kein name angegeben. |
| 400 | 8 | `the account name must be %min% to %max% characters long` | Der Kontoname (account name) muss %min% bis %max% Zeichen lang sein. |
| 400 | 9 | `the specified name already exists` | Der angegebene name existiert bereits. |
| 400 | 10 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 12 | `no postingaccount_number specified` | Keine postingaccount_number angegeben. |
| 400 | 13 | `the postingaccount_number must have %min% to %max% digits` | Die postingaccount_number muss %min% bis %max% Stellen haben. |
| 400 | 14 | `postingaccount_number is out of allowed range [detailed error message]` | postingaccount_number liegt außerhalb des erlaubten Bereichs (Detail siehe message-Feld der konkreten Antwort). |
| 400 | 16 | `the postingaccount_number already exists` | Die postingaccount_number existiert bereits. |
| 400 | 17 | `invalid postingaccount_number specified` | Ungültige postingaccount_number angegeben. |
| 400 | 18 | `invalid receipt_creates_transaction specified` | Ungültiger Wert für receipt_creates_transaction angegeben. |
| 400 | 19 | `invalid is_revision_safe specified` | Ungültiger Wert für is_revision_safe angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/accounts/get`

Get all the accounts.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/comments/add`

Add comment to transaction or receipt.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid transaction_id_by_customer specified` | Ungültige transaction_id_by_customer angegeben. |
| 400 | 6 | `invalid receipt_id_by_customer specified` | Ungültige receipt_id_by_customer angegeben. |
| 400 | 7 | `only transaction_id_by_customer or receipt_id_by_customer should be specified` | Es darf nur transaction_id_by_customer oder receipt_id_by_customer angegeben werden, nicht beides. |
| 400 | 8 | `either transaction_id_by_customer or receipt_id_by_customer should be specified` | Es muss entweder transaction_id_by_customer oder receipt_id_by_customer angegeben werden. |
| 400 | 9 | `transaction was not found` | Transaktion wurde nicht gefunden. |
| 400 | 10 | `receipt was not found` | Beleg wurde nicht gefunden. |
| 400 | 12 | `invalid comment_text specified` | Ungültiger comment_text angegeben. |
| 400 | 13 | `no comment_text is specified` | Kein comment_text angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/cost-locations/add`

Add cost location.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid code specified` | Ungültiger code angegeben. |
| 400 | 6 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/cost-locations/delete`

Delete cost location.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `no cost location code specified` | Kein Kostenstellen-Code (cost location) angegeben. |
| 400 | 6 | `cost location was not found` | Kostenstelle (cost location) wurde nicht gefunden. |
| 400 | 7 | `cost location may not be deleted` | Kostenstelle (cost location) darf nicht gelöscht werden. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/cost-locations/get`

Get cost locations.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid limit specified` | Ungültiges limit angegeben. |
| 400 | 6 | `invalid offset specified` | Ungültiges offset angegeben. |
| 400 | 7 | `invalid code specified` | Ungültiger code angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/cost-locations/update`

Update cost location.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `no cost location code specified` | Kein Kostenstellen-Code (cost location) angegeben. |
| 400 | 6 | `cost location was not found` | Kostenstelle (cost location) wurde nicht gefunden. |
| 400 | 7 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/invoices/create`

Create invoice.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 6 | `no items specified` | Keine items angegeben. |
| 400 | 7 | `invalid show_prices_type specified` | Ungültiger show_prices_type angegeben. |
| 400 | 8 | `invalid recurring_interval specified` | Ungültiges recurring_interval angegeben. |
| 400 | 9 | `invalid recurring_date_next specified` | Ungültige recurring_date_next angegeben. |
| 400 | 10 | `invalid show_bankdata specified` | Ungültiger Wert für show_bankdata angegeben. |
| 400 | 12 | `invalid show_contactdata specified` | Ungültiger Wert für show_contactdata angegeben. |
| 400 | 13 | `invalid company_name specified` | Ungültiger company_name angegeben. |
| 400 | 14 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 16 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 17 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 18 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 19 | `invalid city specified` | Ungültige city angegeben. |
| 400 | 20 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 21 | `invalid date specified` | Ungültiges date angegeben. |
| 400 | 22 | `invalid invoicenumber specified` | Ungültige invoicenumber angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `invalid date_of_supply specified` | Ungültiges date_of_supply (Leistungsdatum) angegeben. |
| 400 | 25 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 26 | `invalid correspondence specified` | Ungültiges correspondence angegeben. |
| 400 | 27 | `invalid discount_value specified` | Ungültiger discount_value angegeben. |
| 400 | 28 | `invalid discount_type specified` | Ungültiger discount_type angegeben. |
| 400 | 29 | `invalid payment_conditions specified` | Ungültige payment_conditions angegeben. |
| 400 | 31 | `invalid final_provisions specified` | Ungültige final_provisions angegeben. |
| 400 | 32 | `invalid item_name specified` | Ungültiger item_name angegeben. |
| 400 | 34 | `invalid item_amount specified` | Ungültiger item_amount angegeben. |
| 400 | 35 | `invalid item_unit specified` | Ungültige item_unit angegeben. |
| 400 | 38 | `invalid customer_number specified` | Ungültige customer_number angegeben. |
| 400 | 39 | `invalid item_vat specified` | Ungültiger item_vat angegeben. |
| 400 | 43 | `invalid due_days specified` | Ungültige due_days angegeben. |
| 400 | 44 | `invalid language specified, allowed values: de_DE, en_US` | Ungültige language angegeben, erlaubte Werte: de_DE, en_US. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 33 | `customer has reached the upload limit` | Der Mandant hat das Upload-Limit erreicht. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/invoices/create/draft`

Create invoice draft.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 6 | `no items specified` | Keine items angegeben. |
| 400 | 7 | `invalid show_prices_type specified` | Ungültiger show_prices_type angegeben. |
| 400 | 8 | `invalid recurring_interval specified` | Ungültiges recurring_interval angegeben. |
| 400 | 9 | `invalid recurring_date_next specified` | Ungültige recurring_date_next angegeben. |
| 400 | 10 | `invalid show_bankdata specified` | Ungültiger Wert für show_bankdata angegeben. |
| 400 | 12 | `invalid show_contactdata specified` | Ungültiger Wert für show_contactdata angegeben. |
| 400 | 13 | `invalid company_name specified` | Ungültiger company_name angegeben. |
| 400 | 14 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 16 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 17 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 18 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 19 | `invalid city specified` | Ungültige city angegeben. |
| 400 | 20 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 21 | `invalid date specified` | Ungültiges date angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `invalid date_of_supply specified` | Ungültiges date_of_supply (Leistungsdatum) angegeben. |
| 400 | 25 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 26 | `invalid correspondence specified` | Ungültiges correspondence angegeben. |
| 400 | 27 | `invalid discount_value specified` | Ungültiger discount_value angegeben. |
| 400 | 28 | `invalid discount_type specified` | Ungültiger discount_type angegeben. |
| 400 | 29 | `invalid payment_conditions specified` | Ungültige payment_conditions angegeben. |
| 400 | 31 | `invalid final_provisions specified` | Ungültige final_provisions angegeben. |
| 400 | 38 | `invalid customer_number specified` | Ungültige customer_number angegeben. |
| 400 | 44 | `invalid language specified, allowed values: de_DE, en_US` | Ungültige language angegeben, erlaubte Werte: de_DE, en_US. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/invoices/create/e-invoice`

Create e-invoice.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 6 | `no items specified` | Keine items angegeben. |
| 400 | 7 | `invalid show_prices_type specified` | Ungültiger show_prices_type angegeben. |
| 400 | 8 | `invalid recurring_interval specified` | Ungültiges recurring_interval angegeben. |
| 400 | 9 | `invalid recurring_date_next specified` | Ungültige recurring_date_next angegeben. |
| 400 | 10 | `invalid show_bankdata specified` | Ungültiger Wert für show_bankdata angegeben. |
| 400 | 12 | `invalid show_contactdata specified` | Ungültiger Wert für show_contactdata angegeben. |
| 400 | 13 | `invalid company_name specified` | Ungültiger company_name angegeben. |
| 400 | 14 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 16 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 17 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 18 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 19 | `invalid city specified` | Ungültige city angegeben. |
| 400 | 20 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 21 | `invalid date specified` | Ungültiges date angegeben. |
| 400 | 22 | `invalid invoicenumber specified` | Ungültige invoicenumber angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `invalid date_of_supply specified` | Ungültiges date_of_supply (Leistungsdatum) angegeben. |
| 400 | 25 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 26 | `invalid correspondence specified` | Ungültiges correspondence angegeben. |
| 400 | 27 | `invalid discount_value specified` | Ungültiger discount_value angegeben. |
| 400 | 28 | `invalid discount_type specified` | Ungültiger discount_type angegeben. |
| 400 | 29 | `invalid payment_conditions specified` | Ungültige payment_conditions angegeben. |
| 400 | 31 | `invalid final_provisions specified` | Ungültige final_provisions angegeben. |
| 400 | 32 | `invalid item_name specified` | Ungültiger item_name angegeben. |
| 400 | 34 | `invalid item_amount specified` | Ungültiger item_amount angegeben. |
| 400 | 35 | `invalid item_unit specified` | Ungültige item_unit angegeben. |
| 400 | 38 | `invalid customer_number specified` | Ungültige customer_number angegeben. |
| 400 | 39 | `invalid item_tax_type specified` | Ungültiger item_tax_type angegeben. |
| 400 | 40 | `invalid item_tax_amount specified` | Ungültiger item_tax_amount angegeben. |
| 400 | 42 | `invalid e_invoice_id specified` | Ungültige e_invoice_id angegeben. |
| 400 | 42 | `invalid e_invoice_type specified` | Ungültiger e_invoice_type angegeben. |
| 400 | 43 | `invalid due_days specified` | Ungültige due_days angegeben. |
| 400 | 44 | `invalid language specified, allowed values: de_DE, en_US` | Ungültige language angegeben, erlaubte Werte: de_DE, en_US. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 33 | `customer has reached the upload limit` | Der Mandant hat das Upload-Limit erreicht. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/add-batch/free`

Add multiple free postings.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/add-batch/receipts`

Add multiple receipt postings.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/add-batch/transactions`

Add multiple transaction postings.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/add/free`

Add free posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid posting type specified` | Ungültiger posting type angegeben. |
| 400 | 6 | `no date specified` | Kein date angegeben. |
| 400 | 7 | `invalid date specified` | Ungültiges date angegeben. |
| 400 | 8 | `no postingtext specified` | Kein postingtext angegeben. |
| 400 | 9 | `the posting text is longer than 128 characters` | Der Buchungstext (posting text) ist länger als 128 Zeichen. |
| 400 | 10 | `no postingaccount_debit specified` | Kein postingaccount_debit angegeben. |
| 400 | 12 | `invalid postingaccount_debit specified or postingaccount_debit is not available` | Ungültiges postingaccount_debit angegeben oder postingaccount_debit ist nicht verfügbar. |
| 400 | 13 | `no postingaccount_credit specified` | Kein postingaccount_credit angegeben. |
| 400 | 14 | `invalid postingaccount_credit specified or postingaccount_credit is not available` | Ungültiges postingaccount_credit angegeben oder postingaccount_credit ist nicht verfügbar. |
| 400 | 16 | `the cost location is longer than 10 characters` | Die Kostenstelle (cost location) ist länger als 10 Zeichen. |
| 400 | 17 | `the cost location must consist of alphanumeric characters or be a number greater than 0` | Die Kostenstelle muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| 400 | 18 | `no vat specified` | Kein vat angegeben. |
| 400 | 19 | `invalid vat specified` | Ungültiges vat angegeben. |
| 400 | 20 | `No amount specified` | Kein amount angegeben. |
| 400 | 21 | `invalid amount specified` | Ungültiger amount angegeben. |
| 400 | 22 | `there are no negative amounts allowed` | Negative Beträge (amounts) sind nicht erlaubt. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `specified postingaccount_debit cannot posted manually` | Das angegebene postingaccount_debit kann nicht manuell bebucht werden. |
| 400 | 25 | `specified postingaccount_credit cannot posted manually` | Das angegebene postingaccount_credit kann nicht manuell bebucht werden. |
| 400 | 26 | `The postingaccount_credit is identical to the postingaccount_debit` | postingaccount_credit ist identisch mit postingaccount_debit. |
| 400 | 27 | `The account %postingaccount_number% must be posted with vat option %vat_option%` | Das Konto %postingaccount_number% muss mit der vat option %vat_option% gebucht werden. |
| 400 | 28 | `the vat option for account "%postingaccount_number%; %postingsccount_name%" is invalid` | Die vat option für Konto "%postingaccount_number%; %postingsccount_name%" ist ungültig. |
| 400 | 29 | `the account "%postingaccount_number%; %postingsccount_name%" must be posted with/without %vat_class%` | Das Konto "%postingaccount_number%; %postingsccount_name%" muss mit/ohne %vat_class% gebucht werden. |
| 400 | 31 | `no vat possible for specified combination` | Für die angegebene Kombination ist keine Umsatzsteuer (vat) möglich. |
| 400 | 32 | `the tax key is invalid for specified account combination` | Der Steuerschlüssel (tax key) ist für die angegebene Kontenkombination ungültig. |
| 400 | 33 | `vat option unavailable due to current settings` | vat option aufgrund der aktuellen Einstellungen nicht verfügbar. |
| 400 | 34 | `vat option unavailable with 'not liable to sales tax' setting` | vat option bei der Einstellung 'not liable to sales tax' (nicht umsatzsteuerpflichtig) nicht verfügbar. |
| 400 | 36 | `the cost location two is longer than 10 characters` | Die zweite Kostenstelle (cost location two) ist länger als 10 Zeichen. |
| 400 | 37 | `the cost location two must consist of alphanumeric characters or be a number greater than 0` | Die zweite Kostenstelle (cost location two) muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/add/receipt`

Add receipt posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid posting type specified` | Ungültiger posting type angegeben. |
| 400 | 6 | `receipt not found` | Beleg (receipt) nicht gefunden. |
| 400 | 7 | `receipt is deleted` | Beleg ist gelöscht. |
| 400 | 8 | `expected account type by receipt does not match the creditor/debtor account's type` | Der vom Beleg erwartete Kontotyp stimmt nicht mit dem Typ des Kreditoren-/Debitorenkontos überein. |
| 400 | 9 | `the type of the receipt does not allow postings` | Der Belegtyp erlaubt keine Buchungen. |
| 400 | 10 | `creditor posting is not activated` | Kreditorenbuchhaltung (creditor posting) ist nicht aktiviert. |
| 400 | 12 | `debtor posting is not activated` | Debitorenbuchhaltung (debtor posting) ist nicht aktiviert. |
| 400 | 13 | `the receipt is not valid, please complete the data` | Der Beleg ist nicht vollständig/gültig, bitte die Daten vervollständigen. |
| 400 | 14 | `the receipt has already created a transaction` | Der Beleg hat bereits eine Transaktion erzeugt. |
| 400 | 16 | `a transaction linked to the receipt has already been posted` | Eine mit dem Beleg verknüpfte Transaktion wurde bereits gebucht. |
| 400 | 17 | `no postingaccount number specified` | Keine postingaccount number angegeben. |
| 400 | 18 | `the specified postingaccount is not valid` | Das angegebene postingaccount ist ungültig. |
| 400 | 19 | `the specified postingaccount is not available` | Das angegebene postingaccount ist nicht verfügbar. |
| 400 | 20 | `the specified postingaccount cannot be booked manually` | Das angegebene postingaccount kann nicht manuell bebucht werden. |
| 400 | 21 | `no vat option specified` | Keine vat option angegeben. |
| 400 | 22 | `invalid vat option for given account "%postinaccount_number%; %postingaccount_name%" specified` | Ungültige vat option für Konto "%postinaccount_number%; %postingaccount_name%" angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `The account %postingaccount_number% must be posted with vat option "%vat_option%"` | Das Konto %postingaccount_number% muss mit der vat option "%vat_option%" gebucht werden. |
| 400 | 25 | `The vat option for account "%postinaccount_number%; %postingaccount_name%" is invalid` | Die vat option für Konto "%postinaccount_number%; %postingaccount_name%" ist ungültig. |
| 400 | 26 | `The account "%postinaccount_number%; %postingaccount_name%" must be posted with value added tax / with pre tax / without value added tax` | Das Konto "%postinaccount_number%; %postingaccount_name%" muss mit Umsatzsteuer / mit Vorsteuer / ohne Umsatzsteuer gebucht werden. |
| 400 | 27 | `invalid tax key specified` | Ungültiger tax key angegeben. |
| 400 | 28 | `vat option unavailable due to current settings` | vat option aufgrund der aktuellen Einstellungen nicht verfügbar. |
| 400 | 29 | `vat option unavailable with 'not liable to sales tax' setting` | vat option bei der Einstellung 'not liable to sales tax' (nicht umsatzsteuerpflichtig) nicht verfügbar. |
| 400 | 31 | `the posting text is longer than 128 characters` | Der Buchungstext (posting text) ist länger als 128 Zeichen. |
| 400 | 32 | `the cost location is longer than 10 characters` | Die Kostenstelle (cost location) ist länger als 10 Zeichen. |
| 400 | 33 | `the cost location must consist of alphanumeric characters or be a number greater than 0` | Die Kostenstelle muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| 400 | 34 | `foreign currencies can only be posted to account %postingaccount_number%` | Fremdwährungen können nur auf Konto %postingaccount_number% gebucht werden. |
| 400 | 35 | `invalid amount specified` | Ungültiger amount angegeben. |
| 400 | 37 | `the total amount of all postings does not match the receipt amount` | Die Summe aller Buchungen stimmt nicht mit dem Belegbetrag überein. |
| 400 | 38 | `the total amount of all postings is invalid` | Die Summe aller Buchungen ist ungültig. |
| 400 | 39 | `postings with foreign currencies are not allowed` | Buchungen mit Fremdwährungen sind nicht erlaubt. |
| 400 | 40 | `postings are not allowed on receipts without currency` | Buchungen sind auf Belegen ohne Währung (currency) nicht erlaubt. |
| 400 | 41 | `the date delivery is invalid` | Das date delivery (Lieferdatum) ist ungültig. |
| 400 | 42 | `the vat option is not available for this date` | Die vat option ist für dieses Datum nicht verfügbar. |
| 400 | 43 | `the specified creditor/debtor is invalid` | Der angegebene Kreditor/Debitor ist ungültig. |
| 400 | 44 | `the cost location two is longer than 10 characters` | Die zweite Kostenstelle (cost location two) ist länger als 10 Zeichen. |
| 400 | 45 | `the cost location two must consist of alphanumeric characters or be a number greater than 0` | Die zweite Kostenstelle (cost location two) muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| 400 | 46 | `invalid or not existing parameters` | Ungültige oder nicht existierende Parameter. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/add/transaction`

Add transaction posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid posting type specified` | Ungültiger posting type angegeben. |
| 400 | 6 | `transaction not found` | Transaktion nicht gefunden. |
| 400 | 7 | `a receipt linked to the transaction has already been posted` | Ein mit der Transaktion verknüpfter Beleg wurde bereits gebucht. |
| 400 | 8 | `no postingaccount number specified` | Keine postingaccount number angegeben. |
| 400 | 9 | `the specified postingaccount is not valid` | Das angegebene postingaccount ist ungültig. |
| 400 | 10 | `the specified postingaccount is not available` | Das angegebene postingaccount ist nicht verfügbar. |
| 400 | 12 | `the specified postingaccount cannot be booked manually` | Das angegebene postingaccount kann nicht manuell bebucht werden. |
| 400 | 13 | `no vat option specified` | Keine vat option angegeben. |
| 400 | 14 | `invalid vat option for given account specified` | Ungültige vat option für das angegebene Konto. |
| 400 | 16 | `the account "%account_number%" must be posted with vat option "%vat_option%"` | Das Konto "%account_number%" muss mit der vat option "%vat_option%" gebucht werden. |
| 400 | 17 | `the account "%account_number%";"%account_name%" must be posted with/without "%vat_class%"` | Das Konto "%account_number%";"%account_name%" muss mit/ohne "%vat_class%" gebucht werden. |
| 400 | 18 | `invalid tax key specified` | Ungültiger tax key angegeben. |
| 400 | 19 | `vat option unavailable due to current settings` | vat option aufgrund der aktuellen Einstellungen nicht verfügbar. |
| 400 | 20 | `vat option unavailable with 'not liable to sales tax' setting` | vat option bei der Einstellung 'not liable to sales tax' (nicht umsatzsteuerpflichtig) nicht verfügbar. |
| 400 | 21 | `the posting text is longer than 128 characters` | Der Buchungstext (posting text) ist länger als 128 Zeichen. |
| 400 | 22 | `the cost location is longer than 10 characters` | Die Kostenstelle (cost location) ist länger als 10 Zeichen. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `the cost location must consist of alphanumeric characters or be a number greater than 0` | Die Kostenstelle muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| 400 | 25 | `foreign currencies can only be posted to account "%account_number%"` | Fremdwährungen können nur auf Konto "%account_number%" gebucht werden. |
| 400 | 26 | `invalid amount specified` | Ungültiger amount angegeben. |
| 400 | 27 | `the total amount of all postings does not match the transaction amount` | Die Summe aller Buchungen stimmt nicht mit dem Transaktionsbetrag überein. |
| 400 | 29 | `the total amount of all postings is invalid` | Die Summe aller Buchungen ist ungültig. |
| 400 | 31 | `the cost location two is longer than 10 characters` | Die zweite Kostenstelle (cost location two) ist länger als 10 Zeichen. |
| 400 | 32 | `the cost location two must consist of alphanumeric characters or be a number greater than 0` | Die zweite Kostenstelle (cost location two) muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| 400 | 34 | `for each partial posting, one or no receipt has to be specified explicitly via oi_receipts_ids_by_customer` | Für jede Teilbuchung muss über oi_receipts_ids_by_customer explizit genau ein Beleg oder kein Beleg angegeben werden. |
| 400 | 46 | `invalid or not existing parameters` | Ungültige oder nicht existierende Parameter. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/assign/receipt-to-free-posting`

Assign receipt to free posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid assignment type specified` | Ungültiger assignment type angegeben. |
| 400 | 6 | `receipt not found` | Beleg (receipt) nicht gefunden. |
| 400 | 7 | `posting not found` | Buchung (posting) nicht gefunden. |
| 400 | 8 | `receipt is deleted` | Beleg ist gelöscht. |
| 400 | 9 | `posting is no free posting` | Buchung ist keine freie Buchung (free posting). |
| 400 | 10 | `assignment failed` | Zuordnung fehlgeschlagen. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/cancel`

Cancel posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `Parameter posting_id_by_customer is required.` | Parameter posting_id_by_customer ist erforderlich. |
| 400 | 6 | `Parameter posting_id_by_customer must be an integer.` | Parameter posting_id_by_customer muss eine Ganzzahl sein. |
| 400 | 7 | `Posting not found.` | Buchung (posting) nicht gefunden. |
| 400 | 8 | `Posting cannot be cancelled.` | Buchung (posting) kann nicht storniert werden. |
| 400 | 9 | `Posting could not be cancelled.` | Buchung (posting) konnte nicht storniert werden. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/get`

Get postings.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| 400 | 6 | `invalid date_to specified` | Ungültiges date_to angegeben. |
| 400 | 7 | `invalid account specified` | Ungültiges account angegeben. |
| 400 | 8 | `invalid postingaccount flag specified` | Ungültiges postingaccount flag angegeben. |
| 400 | 9 | `invalid posting_status specified` | Ungültiger posting_status angegeben. |
| 400 | 10 | `invalid limit specified` | Ungültiges limit angegeben. |
| 400 | 12 | `invalid offset specified` | Ungültiges offset angegeben. |
| 400 | 13 | `invalid cost_location specified` | Ungültige cost_location angegeben. |
| 400 | 14 | `invalid date_last_action_from specified` | Ungültiges date_last_action_from angegeben. |
| 400 | 16 | `invalid date_last_action_to specified` | Ungültiges date_last_action_to angegeben. |
| 400 | 17 | `invalid order specified` | Ungültiges order angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/postings/unconfirm/free`

Unconfirm free posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid unconfirm type specified` | Ungültiger unconfirm type angegeben. |
| 400 | 6 | `Posting not found.` | Buchung (posting) nicht gefunden. |
| 400 | 7 | `Posting is not a free posting.` | Buchung ist keine freie Buchung (free posting). |
| 400 | 8 | `Posting is fixed and cannot be unconfirmed.` | Buchung ist fixiert und kann nicht in den unbestätigten Zustand zurückversetzt werden. |
| 400 | 9 | `parameter posting_id_by_customer must be an integer` | Parameter posting_id_by_customer muss eine Ganzzahl sein. |
| 400 | 10 | `parameter posting_id_by_customer is required` | Parameter posting_id_by_customer ist erforderlich. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `timeout` | Timeout. |

### `/postings/unconfirm/receipt`

Unconfirm receipt posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid unconfirm type specified` | Ungültiger unconfirm type angegeben. |
| 400 | 6 | `Receipt not found.` | Beleg (receipt) nicht gefunden. |
| 400 | 7 | `receipt has no postings to unconfirm` | Beleg hat keine Buchungen, die zurückgesetzt werden können. |
| 400 | 8 | `receipt has fixed postings that cannot be unconfirmed` | Beleg hat fixierte Buchungen, die nicht zurückgesetzt (unconfirmed) werden können. |
| 400 | 9 | `parameter receipt_id_by_customer must be an integer` | Parameter receipt_id_by_customer muss eine Ganzzahl sein. |
| 400 | 10 | `parameter receipt_id_by_customer is required` | Parameter receipt_id_by_customer ist erforderlich. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `timeout` | Timeout. |

### `/postings/unconfirm/transaction`

Unconfirm transaction posting.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid unconfirm type specified` | Ungültiger unconfirm type angegeben. |
| 400 | 6 | `Transaction not found.` | Transaktion (transaction) nicht gefunden. |
| 400 | 7 | `transaction has no postings to unconfirm` | Transaktion hat keine Buchungen, die zurückgesetzt werden können. |
| 400 | 8 | `transaction has fixed postings that cannot be unconfirmed` | Transaktion hat fixierte Buchungen, die nicht zurückgesetzt werden können. |
| 400 | 9 | `parameter transaction_id_by_customer must be an integer` | Parameter transaction_id_by_customer muss eine Ganzzahl sein. |
| 400 | 10 | `parameter transaction_id_by_customer is required` | Parameter transaction_id_by_customer ist erforderlich. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `timeout` | Timeout. |

### `/receipts/add`

Add a receipt.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 8 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 9 | `invalid account specified` | Ungültiges account angegeben. |
| 400 | 10 | `account specified does not exist for the customer` | Das angegebene Konto existiert für diesen Mandanten (customer) nicht. |
| 400 | 17 | `invalid counterparty specified` | Ungültiger counterparty angegeben. |
| 400 | 18 | `invalid invoice number specified` | Ungültige invoice number angegeben. |
| 400 | 19 | `invalid date specified` | Ungültiges date angegeben. |
| 400 | 20 | `invalid amount specified` | Ungültiger amount angegeben. |
| 400 | 21 | `invalid currency specified` | Ungültige currency angegeben. |
| 400 | 22 | `invalid vat rate specified` | Ungültiger vat rate (Umsatzsteuersatz) angegeben. |
| 400 | 24 | `invalid creditor/debtor specified` | Ungültiger Kreditor/Debitor angegeben. |
| 400 | 25 | `creditor/debtor specified does not exist for the customer` | Der angegebene Kreditor/Debitor existiert für diesen Mandanten nicht. |
| 400 | 26 | `a receipt of type '<type>' cannot be assigned to a creditor account` | Ein Beleg vom Typ '<type>' kann keinem Kreditorenkonto (creditor account) zugeordnet werden. |
| 400 | 27 | `creditors are not activated for the customer` | Kreditoren sind für diesen Mandanten nicht aktiviert. |
| 400 | 28 | `a receipt of type '<type>' cannot be assigned to a debtor account` | Ein Beleg vom Typ '<type>' kann keinem Debitorenkonto (debtor account) zugeordnet werden. |
| 400 | 29 | `debtors are not activated for the customer` | Debitoren sind für diesen Mandanten nicht aktiviert. |
| 400 | 34 | `invalid payment reference specified` | Ungültige payment reference (Zahlungsreferenz) angegeben. |
| 400 | 35 | `invalid date delivery specified` | Ungültiges date delivery (Lieferdatum) angegeben. |
| 400 | 36 | `invalid date_payment_due specified` | Ungültiges date_payment_due angegeben. |
| 400 | 37 | `invalid link_to_receipt_id_by_customer specified` | Ungültige link_to_receipt_id_by_customer angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/addBatch`

Add batch receipts.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `Number of receipts exceeded` | Maximale Anzahl an receipts überschritten. |
| 400 | 6 | `No receipts found` | Keine receipts gefunden. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/assigned-transactions/get`

Get all transactions assigned to a specific receipt.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid receipt_id_by_customer specified` | Ungültige receipt_id_by_customer angegeben. |
| 400 | 6 | `no receipt found` | Kein Beleg (receipt) gefunden. |
| 400 | 7 | `invalid confirmed_only specified` | Ungültiger Wert für confirmed_only angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/delete/id_by_customer`

Delete receipt by id_by_customer.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid id_by_customer specified` | Ungültige id_by_customer angegeben. |
| 400 | 6 | `no receipt found` | Kein Beleg (receipt) gefunden. |
| 400 | 7 | `receipt is already deleted` | Beleg ist bereits gelöscht. |
| 400 | 8 | `receipt can´t be marked as deleted - fixed postings exist` | Beleg kann nicht als gelöscht markiert werden, es existieren fixierte Buchungen. |
| 400 | 9 | `receipt is directly assigned to confirmed postings` | Beleg ist direkt bestätigten Buchungen zugeordnet. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/get`

Get receipts.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid list_direction specified` | Ungültige list_direction angegeben. |
| 400 | 6 | `invalid payment_status specified` | Ungültiger payment_status angegeben. |
| 400 | 7 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| 400 | 8 | `invalid date_to specified` | Ungültiges date_to angegeben. |
| 400 | 9 | `invalid counterparty specified` | Ungültiger counterparty angegeben. |
| 400 | 10 | `invalid limit specified` | Ungültiges limit angegeben. |
| 400 | 12 | `invalid offset specified` | Ungültiges offset angegeben. |
| 400 | 13 | `invalid include_offers specified` | Ungültiger Wert für include_offers angegeben. |
| 400 | 14 | `invalid deleted specified` | Ungültiger Wert für deleted angegeben. |
| 400 | 15 | `invalid sort field specified` | Ungültiges sort-Feld angegeben. |
| 400 | 16 | `invalid sort value specified` | Ungültiger sort-Wert angegeben. |
| 400 | 17 | `invalid invoicenumber specified` | Ungültige invoicenumber angegeben. |
| 400 | 18 | `invalid due_date specified` | Ungültiges due_date angegeben. |
| 400 | 19 | `invalid date_since_last_modified specified` | Ungültiges date_since_last_modified angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/get/id_by_customer`

Get receipt by id_by_customer.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid id_by_customer specified` | Ungültige id_by_customer angegeben. |
| 400 | 6 | `invalid get_file specified` | Ungültiger Wert für get_file angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/restore/id_by_customer`

Restore deleted receipt by id_by_customer.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid id_by_customer specified` | Ungültige id_by_customer angegeben. |
| 400 | 6 | `no receipt found` | Kein Beleg (receipt) gefunden. |
| 400 | 7 | `receipt is not marked as deleted` | Beleg ist nicht als gelöscht markiert. |
| 400 | 8 | `restoration of receipt failed` | Wiederherstellung des Belegs fehlgeschlagen. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/receipts/upload`

Upload receipt.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `no file provided` | Keine Datei übergeben. |
| 400 | 6 | `file type not accepted` | Dateityp wird nicht akzeptiert. |
| 400 | 7 | `maximum file size is <max>MB` | Maximale Dateigröße ist <max>MB. |
| 400 | 8 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 9 | `invalid account specified` | Ungültiges account angegeben. |
| 400 | 10 | `account specified does not exist for the customer` | Das angegebene Konto existiert für diesen Mandanten (customer) nicht. |
| 400 | 14 | `maximum number of pages is <max>` | Maximale Seitenanzahl ist <max>. |
| 400 | 17 | `invalid counterparty specified` | Ungültiger counterparty angegeben. |
| 400 | 18 | `invalid invoice number specified` | Ungültige invoice number angegeben. |
| 400 | 19 | `invalid date specified` | Ungültiges date angegeben. |
| 400 | 20 | `invalid amount specified` | Ungültiger amount angegeben. |
| 400 | 21 | `invalid currency specified` | Ungültige currency angegeben. |
| 400 | 22 | `invalid vat rate specified` | Ungültiger vat rate (Umsatzsteuersatz) angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 24 | `invalid creditor/debtor specified` | Ungültiger Kreditor/Debitor angegeben. |
| 400 | 25 | `creditor/debtor specified does not exist for the customer` | Der angegebene Kreditor/Debitor existiert für diesen Mandanten nicht. |
| 400 | 26 | `a receipt of type '<type>' cannot be assigned to a creditor account` | Ein Beleg vom Typ '<type>' kann keinem Kreditorenkonto (creditor account) zugeordnet werden. |
| 400 | 27 | `creditors are not activated for the customer` | Kreditoren sind für diesen Mandanten nicht aktiviert. |
| 400 | 28 | `a receipt of type '<type>' cannot be assigned to a debtor account` | Ein Beleg vom Typ '<type>' kann keinem Debitorenkonto (debtor account) zugeordnet werden. |
| 400 | 29 | `debtors are not activated for the customer` | Debitoren sind für diesen Mandanten nicht aktiviert. |
| 400 | 33 | `file name is not specified` | Kein Dateiname angegeben. |
| 400 | 34 | `invalid payment reference specified` | Ungültige payment reference (Zahlungsreferenz) angegeben. |
| 400 | 35 | `invalid date delivery specified` | Ungültiges date delivery (Lieferdatum) angegeben. |
| 400 | 36 | `invalid date_payment_due specified` | Ungültiges date_payment_due angegeben. |
| 400 | 37 | `invalid link_to_receipt_id_by_customer specified` | Ungültige link_to_receipt_id_by_customer angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 12 | `customer has reached the upload limit` | Der Mandant hat das Upload-Limit erreicht. |
| 403 | 15 | `upload temporarily restricted` | Der Upload ist vorübergehend eingeschränkt (Rate Limit). |
| 422 | 31 | `receipt not processable` | Beleg kann nicht verarbeitet werden. |
| 422 | 32 | `receipt ocr processing failed` | Die OCR-Verarbeitung des Belegs ist fehlgeschlagen. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/reports/create/bwa`

Create bwa report.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 6 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| 400 | 7 | `invalid date_to specified` | Ungültiges date_to angegeben. |
| 400 | 12 | `report generation already in progress` | Die Reporterstellung läuft bereits. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/reports/create/sums`

Create sums report.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 6 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| 400 | 7 | `invalid date_to specified` | Ungültiges date_to angegeben. |
| 400 | 8 | `invalid base specified` | Ungültiges base angegeben. |
| 400 | 9 | `invalid file_pdf specified` | Ungültige file_pdf angegeben. |
| 400 | 10 | `invalid file_csv specified` | Ungültige file_csv angegeben. |
| 400 | 12 | `report generation already in progress` | Die Reporterstellung läuft bereits. |
| 400 | 13 | `invalid archive_export specified` | Ungültiges archive_export angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/reports/get/bwa`

Get bwa report.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 6 | `invalid report_id_by_customer specified` | Ungültige report_id_by_customer angegeben. |
| 400 | 7 | `report was not found` | Report wurde nicht gefunden. |
| 400 | 8 | `report generation has not been finished yet` | Die Reporterstellung ist noch nicht abgeschlossen. |
| 400 | 9 | `invalid get_files specified` | Ungültiger Wert für get_files angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/reports/get/sums`

Get sums report.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 6 | `invalid report_id_by_customer specified` | Ungültige report_id_by_customer angegeben. |
| 400 | 7 | `report was not found` | Report wurde nicht gefunden. |
| 400 | 8 | `report generation has not been finished yet` | Die Reporterstellung ist noch nicht abgeschlossen. |
| 400 | 9 | `invalid get_files specified` | Ungültiger Wert für get_files angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/reports/get/sums/ledger`

Get sums report postingaccount ledger.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 10 | `invalid postingaccount_number specified` | Ungültige postingaccount_number angegeben. |
| 400 | 12 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| 400 | 13 | `invalid date_to specified` | Ungültiges date_to angegeben. |
| 400 | 14 | `invalid base specified` | Ungültiges base angegeben. |
| 400 | 16 | `postingaccount was not found` | postingaccount wurde nicht gefunden. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/add-batch/creditors`

Create creditor batch.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/add-batch/debtors`

Create debtors batch.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/add/creditor`

Create creditor.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 400 | 6 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 7 | `invalid postingaccount_number specified` | Ungültige postingaccount_number angegeben. |
| 400 | 8 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 9 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 10 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 12 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 13 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 14 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 16 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 17 | `invalid sales_tax_id specified` | Ungültige sales_tax_id angegeben. |
| 400 | 18 | `invalid iban specified` | Ungültige iban angegeben. |
| 400 | 19 | `invalid bic specified` | Ungültiger bic angegeben. |
| 400 | 20 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 21 | `invalid due in days specified` | Ungültige Angabe für due in days (Fälligkeit in Tagen). |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/add/debtor`

Create debtor.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 400 | 6 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 7 | `invalid postingaccount_number specified` | Ungültige postingaccount_number angegeben. |
| 400 | 8 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 9 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 10 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 12 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 13 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 14 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 16 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 17 | `invalid sales_tax_id specified` | Ungültige sales_tax_id angegeben. |
| 400 | 18 | `invalid iban specified` | Ungültige iban angegeben. |
| 400 | 19 | `invalid bic specified` | Ungültiger bic angegeben. |
| 400 | 20 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 21 | `invalid customer_number specified` | Ungültige customer_number angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/add/postingaccount`

Add postingaccount.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `no postingaccount_number specified` | Keine postingaccount_number angegeben. |
| 400 | 6 | `the postingaccount_number must have %min% to %max% digits` | Die postingaccount_number muss %min% bis %max% Stellen haben. |
| 400 | 7 | `postingaccount_number is out of allowed range [detailed error message]` | postingaccount_number liegt außerhalb des erlaubten Bereichs (Detail siehe message-Feld der konkreten Antwort). |
| 400 | 8 | `the postingaccount_number already exists or is not available due to your settings` | Die postingaccount_number existiert bereits oder ist aufgrund der Einstellungen nicht verfügbar. |
| 400 | 9 | `invalid postingaccount_number specified` | Ungültige postingaccount_number angegeben. |
| 400 | 10 | `no name specified` | Kein name angegeben. |
| 400 | 12 | `the postingaccount name must be %min% to %max% characters long` | Der postingaccount-Name muss %min% bis %max% Zeichen lang sein. |
| 400 | 13 | `the specified name already exists` | Der angegebene name existiert bereits. |
| 400 | 14 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 16 | `no parent_postingaccount_number specified` | Keine parent_postingaccount_number angegeben. |
| 400 | 17 | `the postingaccount_number must be at least %min% digits long` | Die postingaccount_number muss mindestens %min% Stellen lang sein. |
| 400 | 18 | `the parent_postingaccount_number is not valid or is not available due to your settings or was added manually` | Die parent_postingaccount_number ist ungültig, aufgrund der Einstellungen nicht verfügbar, oder wurde manuell angelegt. |
| 400 | 19 | `invalid parent_postingaccount_number specified` | Ungültige parent_postingaccount_number angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/get/creditors`

Get creditors.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/get/debtors`

Get debitors.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/get/postingaccounts`

Get postingaccounts.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 400 | 6 | `invalid limit specified` | Ungültiges limit angegeben. |
| 400 | 7 | `invalid offset specified` | Ungültiges offset angegeben. |
| 400 | 8 | `invalid order specified` | Ungültiges order angegeben. |
| 400 | 9 | `invalid exclude_accounts specified` | Ungültiges exclude_accounts angegeben. |
| 400 | 10 | `invalid exclude_postingaccounts specified` | Ungültiges exclude_postingaccounts angegeben. |
| 400 | 12 | `invalid exclude_creditors specified` | Ungültiges exclude_creditors angegeben. |
| 400 | 13 | `invalid exclude_debtors specified` | Ungültiges exclude_debtors angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/update/creditor`

Update creditor.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 1 | `wrong creditor account postingaccount_number specified` | Falsche postingaccount_number für das Kreditorenkonto angegeben. |
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 400 | 8 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 9 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 10 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 12 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 13 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 14 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 16 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 17 | `invalid sales_tax_id specified` | Ungültige sales_tax_id angegeben. |
| 400 | 18 | `invalid iban specified` | Ungültige iban angegeben. |
| 400 | 19 | `invalid bic specified` | Ungültiger bic angegeben. |
| 400 | 20 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 21 | `invalid due in days specified` | Ungültige Angabe für due in days (Fälligkeit in Tagen). |
| 400 | 24 | `no creditor found for specified postingaccount_number` | Kein Kreditor für die angegebene postingaccount_number gefunden. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/update/debtor`

Update debtor.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 1 | `wrong debtor account postingaccount_number specified` | Falsche postingaccount_number für das Debitorenkonto angegeben. |
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 400 | 8 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 9 | `invalid contact_person_name specified` | Ungültiger contact_person_name angegeben. |
| 400 | 10 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 12 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| 400 | 13 | `invalid zip specified` | Ungültige zip (Postleitzahl) angegeben. |
| 400 | 14 | `invalid street specified` | Ungültige street angegeben. |
| 400 | 16 | `invalid country specified` | Ungültiges country angegeben. |
| 400 | 17 | `invalid sales_tax_id specified` | Ungültige sales_tax_id angegeben. |
| 400 | 18 | `invalid iban specified` | Ungültige iban angegeben. |
| 400 | 19 | `invalid bic specified` | Ungültiger bic angegeben. |
| 400 | 20 | `invalid email specified` | Ungültige email angegeben. |
| 400 | 21 | `invalid customer_number specified` | Ungültige customer_number angegeben. |
| 400 | 24 | `no debtor found for specified postingaccount_number` | Kein Debitor für die angegebene postingaccount_number gefunden. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/settings/update/postingaccount`

Update postingaccount.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid settings type specified` | Ungültiger settings type angegeben. |
| 400 | 6 | `no name specified` | Kein name angegeben. |
| 400 | 7 | `the postingaccount name must be %min% to %max% characters long` | Der postingaccount-Name muss %min% bis %max% Zeichen lang sein. |
| 400 | 8 | `invalid name specified` | Ungültiger name angegeben. |
| 400 | 9 | `wrong postingaccount_number specified` | Falsche postingaccount_number angegeben. |
| 400 | 10 | `no postingaccount found for specified postingaccount_number` | Kein postingaccount für die angegebene postingaccount_number gefunden. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/add`

Add transaction.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `no account specified` | Kein account angegeben. |
| 400 | 6 | `invalid account specified` | Ungültiges account angegeben. |
| 400 | 7 | `account specified does not exist for the customer` | Das angegebene Konto existiert für diesen Mandanten (customer) nicht. |
| 400 | 8 | `no payment recipient or sender (to_from) specified` | Kein Zahlungsempfänger/-absender (to_from) angegeben. |
| 400 | 9 | `invalid payment recipient or sender (to_from) specified` | Ungültiger Zahlungsempfänger/-absender (to_from) angegeben. |
| 400 | 10 | `no amount specified` | Kein amount angegeben. |
| 400 | 13 | `invalid amount specified` | Ungültiger amount angegeben. |
| 400 | 14 | `no booking date specified` | Kein booking date angegeben. |
| 400 | 16 | `invalid booking date specified` | Ungültiges booking date angegeben. |
| 400 | 17 | `invalid value date specified` | Ungültiges value date (Valutadatum) angegeben. |
| 400 | 18 | `invalid account number specified` | Ungültige account number angegeben. |
| 400 | 19 | `invalid bank code specified` | Ungültiger bank code angegeben. |
| 400 | 20 | `invalid bank name specified` | Ungültiger bank name angegeben. |
| 400 | 21 | `invalid purpose specified` | Ungültiger purpose (Verwendungszweck) angegeben. |
| 400 | 22 | `invalid type specified` | Ungültiger type angegeben. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 400 | 23 | `invalid booking text specified` | Ungültiger booking text angegeben. |
| 400 | 25 | `invalid payment reference specified` | Ungültige payment reference (Zahlungsreferenz) angegeben. |
| 400 | 26 | `invalid currency specified` | Ungültige currency angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/addBatch`

Add batch transaction.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `Number of transactions exceeded` | Maximale Anzahl an transactions überschritten. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/assign-batch/receipt`

Assign multiple receipts to transactions.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 10 | `Number of transactions to receipts exceeded` | Maximale Anzahl an Transaktion-zu-Beleg-Zuordnungen überschritten. |
| 400 | 12 | `No transactions to receipts found` | Keine Transaktion-zu-Beleg-Zuordnungen gefunden. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 403 | 15 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/assign/receipt`

Assign receipt to transaction.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid assignment type specified` | Ungültiger assignment type angegeben. |
| 400 | 6 | `no transaction_id_by_customer specified` | Keine transaction_id_by_customer angegeben. |
| 400 | 7 | `posting not found` | Buchung (posting) nicht gefunden. |
| 400 | 8 | `transaction not found` | Transaktion nicht gefunden. |
| 400 | 9 | `receipt not found` | Beleg (receipt) nicht gefunden. |
| 400 | 23 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/assigned-receipts/get`

Get all receipts assigned to a specific transaction.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid transaction_id_by_customer specified` | Ungültige transaction_id_by_customer angegeben. |
| 400 | 6 | `no transaction found` | Keine Transaktion gefunden. |
| 400 | 7 | `invalid confirmed_only specified` | Ungültiger Wert für confirmed_only angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/get`

Get transactions.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| 400 | 6 | `invalid date_to specified` | Ungültiges date_to angegeben. |
| 400 | 7 | `invalid account specified` | Ungültiges account angegeben. |
| 400 | 8 | `invalid to_from specified` | Ungültiges to_from angegeben. |
| 400 | 9 | `invalid limit specified` | Ungültiges limit angegeben. |
| 400 | 10 | `invalid offset specified` | Ungültiges offset angegeben. |
| 400 | 12 | `invalid id_by_customer_from specified` | Ungültige id_by_customer_from angegeben. |
| 400 | 13 | `invalid id_by_customer_to specified` | Ungültige id_by_customer_to angegeben. |
| 400 | 14 | `invalid date_since_last_modified specified` | Ungültiges date_since_last_modified angegeben. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/get/id_by_customer`

Get transaction by id_by_customer.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 5 | `invalid id_by_customer specified` | Ungültige id_by_customer angegeben. |
| 400 | 6 | `transaction not found` | Transaktion nicht gefunden. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or insufficient privileges` | Mandant nicht gefunden oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

### `/transactions/unassign/receipt`

Unassign a specific receipt from a transaction.

| HTTP-Status | error_code | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| 400 | 6 | `no or invalid transaction_id_by_customer specified` | Keine oder ungültige transaction_id_by_customer angegeben. |
| 400 | 7 | `no or invalid receipt_id_by_customer specified` | Keine oder ungültige receipt_id_by_customer angegeben. |
| 400 | 8 | `transaction not found` | Transaktion nicht gefunden. |
| 400 | 9 | `receipt not found` | Beleg (receipt) nicht gefunden. |
| 400 | 10 | `receipt could not be removed from transaction, because of a confirmed posting.` | Beleg konnte wegen einer bestätigten Buchung nicht von der Transaktion entfernt werden. |
| 400 | 23 | `no receipts assigned to transaction` | Der Transaktion sind keine Belege (receipts) zugeordnet. |
| 401 | 3 | `API credentials unknown or invalid` | API-Zugangsdaten unbekannt oder ungültig. |
| 401 | 4 | `customer not found or invalid api client for customer or insufficient privileges` | Mandant nicht gefunden, API Client für den Mandanten ungültig, oder unzureichende Rechte. |
| 403 | 11 | `customer has no active status` | Der Mandant (customer) hat keinen aktiven Status. |
| 500 | 0 | `error while processing the request` | Fehler bei der Verarbeitung des Requests. |
| 504 | 30 | `a timeout occurred while processing the request` | Bei der Verarbeitung des Requests ist ein Timeout aufgetreten. |

## Auffälligkeiten und Inkonsistenzen in der Spezifikationsdatei

Die folgenden Punkte sind direkt aus der Datei nachvollziehbar und werden hier dokumentiert, weil sie für die Fehlerbehandlung im MCP-Server relevant sind. Es handelt sich um Eigenschaften der Spec-Datei selbst, nicht um Verhalten der Live-API (das wäre nur per Live-Test verifizierbar).

### Verwaiste `_ErrorCode`-Definitionen (in `.definitions` vorhanden, in keinem `responses`-Block referenziert)

Insgesamt **42** von 718 `_ErrorCode*`-Definitionen werden von keinem Pfad in `.paths` per `$ref` referenziert. Sie zählen zur Vollständigkeitsprüfung oben dazu, tauchen aber in keiner Endpunkt-Tabelle in Abschnitt B auf, weil ihnen dort kein HTTP-Status zugeordnet werden kann.

**Komplett fehlender Pfad `/postings/reservations/...` (Annahme zum Pfadnamen, nicht verifiziert):** Für die Präfixe `PostingsReservationsAdd`, `PostingsReservationsDelete` und `PostingsReservationsGet` existieren jeweils vollständige `_Success`- und `_ErrorCode*`-Familien in `.definitions`, aber **kein einziger** passender Eintrag in `.paths`. Das sind 33 der 42 verwaisten `_ErrorCode*`-Definitionen (26 unter `PostingsReservationsAdd`, 4 unter `PostingsReservationsGet`, 3 unter `PostingsReservationsDelete`); die restlichen 9 sind in der Tabelle weiter unten in diesem Abschnitt einzeln aufgeführt. Ob dieser Endpunkt in der Produktions-API überhaupt existiert (z. B. unter einem Pfad wie `/postings/reservations/add`), ist aus dieser Datei **nicht verifizierbar**. Implementierende Agenten sollten diesen Endpunkt nicht ungeprüft als MCP-Tool anbieten.

Betroffene Definitions-Präfixe: `PostingsReservationsAdd`, `PostingsReservationsDelete`, `PostingsReservationsGet`.

**Grundmenge der Zahl 42 (Abgrenzung zu `docs/api/grundlagen.md`):** Die hier genannten 42 zählen
ausschließlich `_ErrorCode*`-Definitionen. Abschnitt 9.2 in `docs/api/grundlagen.md` nennt 45 nicht
referenzierte Definitionen und zählt dabei alle verwaisten Definitionen, also zusätzlich die drei
`_Success`-Einträge `PostingsReservationsAdd_Success`, `PostingsReservationsDelete_Success` und
`PostingsReservationsGet_Success` (42 + 3 = 45). Beide Zahlen sind korrekt und beschreiben
unterschiedliche Grundmengen, es besteht kein Widerspruch zwischen den beiden Dossiers.

Hinweis zur Zählweise: Die 45 ergeben sich, wenn `$ref`-Verweise transitiv ausgewertet werden, also
auch solche, die erst innerhalb anderer Definitionen stehen. Zählt man ausschließlich Direktverweise
aus `.paths`, kommt man auf 52 verwaiste Definitionen, weil dann zusätzlich die sieben
Modell-Definitionen `Receipt`, `ReceiptPostings`, `SettingsCreditor`, `SettingsDebtor`, `Transaction`,
`TransactionPostings` und `TransactionToReceipt` als verwaist gelten, obwohl sie von anderen
Definitionen referenziert werden. Für die `_ErrorCode*`-Definitionen macht die Zählweise keinen
Unterschied, das Ergebnis ist in beiden Fällen 42. Quelle: eigene Auswertung von
`docs/openapi/buchhaltungsbutler-v1.json` (Spec-Version 1.9.1), Abrufdatum 2026-09-12.

**Einzelne verwaiste Codes bei sonst dokumentierten Endpunkten** (die jeweilige Response-Stelle verweist stattdessen per Copy-Paste-Fehler auf die gleichnamige Definition eines anderen, fachlich verwandten Endpunkts):

| verwaiste Definition | error_code | message (Original) | vermutlich betroffener Endpunkt |
|---|---|---|---|
| `InvoicesCreateDraft_ErrorCode22` | 22 | `invalid invoicenumber specified` | /invoices/create/draft |
| `PostingsAddTransaction_ErrorCode0` | 0 | `error while processing the request` | /postings/add/transaction (Response verweist stattdessen auf `PostingsAddReceipt_ErrorCode0`) |
| `PostingsAddTransaction_ErrorCode30` | 30 | `a timeout occurred while processing the request` | /postings/add/transaction (Response verweist stattdessen auf `PostingsAddReceipt_ErrorCode30`) |
| `ReceiptsAdd_ErrorCode0` | 0 | `error while processing the request` | /receipts/add (Response verweist stattdessen auf `ReceiptsUpload_ErrorCode0`) |
| `ReceiptsAdd_ErrorCode30` | 30 | `a timeout occurred while processing the request` | /receipts/add (Response verweist stattdessen auf `ReceiptsUpload_ErrorCode30`) |
| `TransactionsAssignReceipt_ErrorCode7` | 7 | `no receipt_id_by_customer specified` | /transactions/assign/receipt (Response verweist stattdessen auf `PostingsAssignReceiptToFreePosting_ErrorCode7`) |
| `Request_ErrorCode1` | 1 | `Api method calls require HTTP requests` | keiner (der generische Code 1 wird nur über eigene, endpunktspezifische Definitionen ausgeliefert, siehe Abschnitt C) |
| `Request_ErrorCode2` | 2 | `Api method calls require POST requests` | keiner (kein Pfad verwendet diese Definition) |
| `Request_ErrorCode10` | 10 | `receipt could not be removed from transaction, because of a confirmed posting.` | keiner (kein Pfad verwendet diese Definition) |

### Name/Wert-Widersprüche innerhalb einzelner Definitionen

Bei zwei Definitionen stimmt die Zahl im Definitionsnamen nicht mit dem intern deklarierten `error_code`-Wert überein:

| Definition | Zahl im Namen | intern deklarierter error_code | message | Endpunkt |
|---|---|---|---|---|
| `InvoicesCreateEInvoice_ErrorCode41` | 41 | 42 | `invalid e_invoice_id specified` | `/invoices/create/e-invoice` |
| `TransactionsAdd_ErrorCode24` | 24 | 23 | `invalid booking text specified` | `/transactions/add` |

Praktische Konsequenz für `/transactions/add`: Die Definition `TransactionsAdd_ErrorCode23` (Bedeutung: `no post and files content received or declined`) UND die Definition `TransactionsAdd_ErrorCode24` (Bedeutung: `invalid booking text specified`, in der Response als `400 (24)` beschriftet) deklarieren beide intern `error_code: 23`. Laut Spec-Datei würden also zwei fachlich komplett unterschiedliche Fehler denselben `error_code`-Wert 23 tragen und wären am `error_code` allein **nicht unterscheidbar**. Ob die Live-API tatsächlich beide Male 23 sendet oder ob es sich um einen reinen Dokumentationsfehler handelt (und live tatsächlich 24 gesendet wird), ist **nicht verifiziert**. Für `/invoices/create/e-invoice` gilt sinngemäß dasselbe für die Codes 41/42.

## C) Fälle: derselbe error_code, unterschiedliche Bedeutung je Endpunkt

Ab `error_code` 5 aufwärts sind die Codes grundsätzlich **pro Endpunkt eigenständig vergeben** (jeder Endpunkt hat seine eigene `<Prefix>_ErrorCode<N>`-Definition). Eine numerische Übereinstimmung zwischen zwei Endpunkten (z. B. beide haben einen `error_code` 7) ist Zufall der Durchnummerierung innerhalb des jeweiligen Endpunkts und impliziert **keine** gemeinsame Bedeutung. Die folgenden Codes sind besonders hervorzuheben, weil sie entweder aus der gemeinsamen `Request_ErrorCode*`-Familie stammen (und daher den Anschein von Envelope-weiter Gültigkeit erwecken könnten) oder weil sie außerhalb dieser Familie ungewöhnlich häufig mit stark abweichender Bedeutung wiederverwendet werden.

### error_code 1

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/settings/update/creditor` | 400 | `wrong creditor account postingaccount_number specified` | Falsche postingaccount_number für das Kreditorenkonto angegeben. |
| `/settings/update/debtor` | 400 | `wrong debtor account postingaccount_number specified` | Falsche postingaccount_number für das Debitorenkonto angegeben. |

### error_code 12

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/accounts/add` | 400 | `no postingaccount_number specified` | Keine postingaccount_number angegeben. |
| `/comments/add` | 400 | `invalid comment_text specified` | Ungültiger comment_text angegeben. |
| `/invoices/create` | 400 | `invalid show_contactdata specified` | Ungültiger Wert für show_contactdata angegeben. |
| `/invoices/create/draft` | 400 | `invalid show_contactdata specified` | Ungültiger Wert für show_contactdata angegeben. |
| `/invoices/create/e-invoice` | 400 | `invalid show_contactdata specified` | Ungültiger Wert für show_contactdata angegeben. |
| `/postings/add/free` | 400 | `invalid postingaccount_debit specified or postingaccount_debit is not available` | Ungültiges postingaccount_debit angegeben oder postingaccount_debit ist nicht verfügbar. |
| `/postings/add/receipt` | 400 | `debtor posting is not activated` | Debitorenbuchhaltung (debtor posting) ist nicht aktiviert. |
| `/postings/add/transaction` | 400 | `the specified postingaccount cannot be booked manually` | Das angegebene postingaccount kann nicht manuell bebucht werden. |
| `/postings/get` | 400 | `invalid offset specified` | Ungültiges offset angegeben. |
| `/receipts/get` | 400 | `invalid offset specified` | Ungültiges offset angegeben. |
| `/receipts/upload` | 403 | `customer has reached the upload limit` | Der Mandant hat das Upload-Limit erreicht. |
| `/reports/create/bwa` | 400 | `report generation already in progress` | Die Reporterstellung läuft bereits. |
| `/reports/create/sums` | 400 | `report generation already in progress` | Die Reporterstellung läuft bereits. |
| `/reports/get/sums/ledger` | 400 | `invalid date_from specified` | Ungültiges date_from angegeben. |
| `/settings/add/creditor` | 400 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| `/settings/add/debtor` | 400 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| `/settings/add/postingaccount` | 400 | `the postingaccount name must be %min% to %max% characters long` | Der postingaccount-Name muss %min% bis %max% Zeichen lang sein. |
| `/settings/get/postingaccounts` | 400 | `invalid exclude_creditors specified` | Ungültiges exclude_creditors angegeben. |
| `/settings/update/creditor` | 400 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| `/settings/update/debtor` | 400 | `invalid additional_addressline specified` | Ungültige additional_addressline angegeben. |
| `/transactions/assign-batch/receipt` | 400 | `No transactions to receipts found` | Keine Transaktion-zu-Beleg-Zuordnungen gefunden. |
| `/transactions/get` | 400 | `invalid id_by_customer_from specified` | Ungültige id_by_customer_from angegeben. |

### error_code 15

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/postings/add-batch/free` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/postings/add-batch/receipts` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/postings/add-batch/transactions` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/receipts/addBatch` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/receipts/get` | 400 | `invalid sort field specified` | Ungültiges sort-Feld angegeben. |
| `/receipts/upload` | 403 | `upload temporarily restricted` | Der Upload ist vorübergehend eingeschränkt (Rate Limit). |
| `/settings/add-batch/creditors` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/settings/add-batch/debtors` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/transactions/add` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/transactions/addBatch` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |
| `/transactions/assign-batch/receipt` | 403 | `adding temporarily restricted` | Das Anlegen ist vorübergehend eingeschränkt (Rate Limit). |

### error_code 23

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/cost-locations/add` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/cost-locations/delete` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/cost-locations/get` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/cost-locations/update` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/invoices/create` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/invoices/create/draft` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/invoices/create/e-invoice` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/postings/add/free` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/postings/add/receipt` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/postings/add/transaction` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/postings/assign/receipt-to-free-posting` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/postings/cancel` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/receipts/upload` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/reports/create/bwa` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/reports/create/sums` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/reports/get/bwa` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/reports/get/sums` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/reports/get/sums/ledger` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/transactions/add` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/transactions/add` | 400 | `invalid booking text specified` | Ungültiger booking text angegeben. |
| `/transactions/assign-batch/receipt` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/transactions/assign/receipt` | 400 | `no post and files content received or declined` | Kein POST- und Dateiinhalt empfangen oder abgelehnt. |
| `/transactions/unassign/receipt` | 400 | `no receipts assigned to transaction` | Der Transaktion sind keine Belege (receipts) zugeordnet. |

### error_code 31

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/invoices/create` | 400 | `invalid final_provisions specified` | Ungültige final_provisions angegeben. |
| `/invoices/create/draft` | 400 | `invalid final_provisions specified` | Ungültige final_provisions angegeben. |
| `/invoices/create/e-invoice` | 400 | `invalid final_provisions specified` | Ungültige final_provisions angegeben. |
| `/postings/add/free` | 400 | `no vat possible for specified combination` | Für die angegebene Kombination ist keine Umsatzsteuer (vat) möglich. |
| `/postings/add/receipt` | 400 | `the posting text is longer than 128 characters` | Der Buchungstext (posting text) ist länger als 128 Zeichen. |
| `/postings/add/transaction` | 400 | `the cost location two is longer than 10 characters` | Die zweite Kostenstelle (cost location two) ist länger als 10 Zeichen. |
| `/receipts/upload` | 422 | `receipt not processable` | Beleg kann nicht verarbeitet werden. |

### error_code 32

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/invoices/create` | 400 | `invalid item_name specified` | Ungültiger item_name angegeben. |
| `/invoices/create/e-invoice` | 400 | `invalid item_name specified` | Ungültiger item_name angegeben. |
| `/postings/add/free` | 400 | `the tax key is invalid for specified account combination` | Der Steuerschlüssel (tax key) ist für die angegebene Kontenkombination ungültig. |
| `/postings/add/receipt` | 400 | `the cost location is longer than 10 characters` | Die Kostenstelle (cost location) ist länger als 10 Zeichen. |
| `/postings/add/transaction` | 400 | `the cost location two must consist of alphanumeric characters or be a number greater than 0` | Die zweite Kostenstelle (cost location two) muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| `/receipts/upload` | 422 | `receipt ocr processing failed` | Die OCR-Verarbeitung des Belegs ist fehlgeschlagen. |

### error_code 33

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/invoices/create` | 403 | `customer has reached the upload limit` | Der Mandant hat das Upload-Limit erreicht. |
| `/invoices/create/e-invoice` | 403 | `customer has reached the upload limit` | Der Mandant hat das Upload-Limit erreicht. |
| `/postings/add/free` | 400 | `vat option unavailable due to current settings` | vat option aufgrund der aktuellen Einstellungen nicht verfügbar. |
| `/postings/add/receipt` | 400 | `the cost location must consist of alphanumeric characters or be a number greater than 0` | Die Kostenstelle muss aus alphanumerischen Zeichen bestehen oder eine Zahl größer 0 sein. |
| `/receipts/upload` | 400 | `file name is not specified` | Kein Dateiname angegeben. |

### error_code 46

| Endpunkt | HTTP-Status | message (Original) | Bedeutung auf Deutsch |
|---|---|---|---|
| `/postings/add/receipt` | 400 | `invalid or not existing parameters` | Ungültige oder nicht existierende Parameter. |
| `/postings/add/transaction` | 400 | `invalid or not existing parameters` | Ungültige oder nicht existierende Parameter. |

Alle übrigen Codes ab 5 (die nicht in Abschnitt A oder in dieser Liste stehen) sind ebenfalls endpunktspezifisch, treten aber nicht auffällig häufig mit widersprüchlicher Bedeutung an mehreren Endpunkten gleichzeitig auf; ihre jeweilige Bedeutung steht in der Tabelle des betreffenden Endpunkts in Abschnitt B.

Außerdem gilt für HTTP-Status: Die meisten Codes haben über alle Endpunkte hinweg denselben HTTP-Status (z. B. steht `error_code` 6 praktisch überall auf 400). Bei den oben gelisteten Codes 12, 15, 31, 32 und 33 wechselt zusätzlich zur Bedeutung auch der HTTP-Status je nach Endpunkt (z. B. 400 vs. 403 bei Code 12 und 15, 400 vs. 422 bei Code 31 und 32).

## D) Empfehlung für die Fehlerbehandlung im MCP-Server

### Grundprinzip

Der `error_code` allein ist **nicht** global auswertbar (siehe Abschnitt C). Eine Fehlerbehandlung im MCP-Server muss immer das Paar (aufgerufener Endpunkt, `error_code`) betrachten, niemals nur den `error_code`. Ausnahme sind ausschließlich die vier Codes aus Abschnitt A (0, 3, 4, 11) und der Timeout-Code 30, die endpunktübergreifend gleich sind.

### 1. Konfigurationsfehler des Nutzers (nicht durch erneuten Aufruf lösbar, Setup prüfen)

- **error_code 3** (401, API-Zugangsdaten unbekannt/ungültig): API Client/Secret in der MCP-Server-Konfiguration prüfen.

- **error_code 4** (401, Mandant nicht gefunden/keine Rechte): den konfigurierten `api_key` (Mandant) sowie dessen Freischaltung für den verwendeten API Client prüfen.

- **error_code 11** (403, Mandant nicht aktiv): Status des Mandanten im BuchhaltungsButler-Konto prüfen, nicht im MCP-Server behebbar.

- Endpunktspezifische Varianten mit gleichem Charakter: Codes, deren Message auf nicht aktivierte Funktionen hinweist, z. B. `creditor posting is not activated`, `debtor posting is not activated`, `creditors are not activated for the customer`, `debtors are not activated for the customer` (jeweils in den Endpunkt-Tabellen in Abschnitt B zu finden). Das sind Einstellungen im BuchhaltungsButler-Konto, nicht Parameterfehler des Agenten.

### 2. Eingabefehler des Agenten (Request korrigieren, dann erneut versuchen)

- Alle Codes, deren Message dem Muster `invalid <feld> specified`, `no <feld> specified` oder einer inhaltlichen Formatregel folgt (Länge, Zeichensatz, erlaubter Wertebereich, Pflichtfeld fehlt, referenzierte ID existiert nicht). Das betrifft die große Mehrheit der Codes ab 5 in den Tabellen aus Abschnitt B.

- Diese Fehler sind **endgültig für den konkreten Request**: Ein Retry mit identischen Parametern liefert erneut denselben Fehler. Der Agent muss den fehlerhaften Parameter anhand der `message` korrigieren, bevor ein erneuter Aufruf sinnvoll ist.

- Sonderfall Code 15 auf `/receipts/get`: dort bedeutet er `invalid sort field specified`, ein reiner Eingabefehler, während derselbe Code auf allen Batch-/Upload-Endpunkten `adding temporarily restricted` bzw. `upload temporarily restricted` bedeutet (siehe Punkt 3).

### 3. Transiente Fehler (Retry mit Backoff gerechtfertigt)

- **error_code 0** (500, interner Fehler bei der Verarbeitung): Retry mit exponentiellem Backoff, Anzahl Versuche begrenzen.

- **error_code 30** (504, Timeout): Retry mit Backoff. Bei wiederholtem Timeout prüfen, ob die Anfrage (z. B. Listing mit großem `limit`) verkleinert werden kann.

- **error_code 15 bei Batch-/Upload-Endpunkten** (`adding temporarily restricted`, `upload temporarily restricted`, HTTP 403): Rate-Limit-artige, aber geschäftlich begründete Sperre. Kein sofortiger Retry, sondern Backoff im Bereich von Sekunden bis Minuten, passend zu den in der Doku genannten Grenzen (z. B. "a request is allowed only every 5 seconds" bei den `addBatch`-Endpunkten, "max 10 requests per minute" bei `/receipts/upload`). Zusätzlich gilt übergreifend das vom Orchestrator verifizierte Rate Limit von maximal 100 Requests pro Mandant und Minute; ein HTTP-429 für dieses übergreifende Limit ist in dieser Spec-Datei nicht als eigener `error_code` dokumentiert und daher **nicht verifiziert**, wie es sich im Response-Envelope äußert.

- **error_code 12 bei `/receipts/upload`** (`customer has reached the upload limit`, HTTP 403): kein technischer, sondern ein Kontingent-/Vertragsfehler. Kein sofortiger Retry sinnvoll, dem Nutzer melden.

### 4. Endgültige Fehler (kein Retry sinnvoll, Vorgang wie beschrieben nicht durchführbar)

- Alle "not found"-Fälle (`receipt not found`, `transaction not found`, `posting not found`, `cost location was not found`, `postingaccount was not found`, `report was not found`, ...): die referenzierte ID existiert nicht (mehr) für diesen Mandanten. Kein Retry ohne geänderte ID.

- Alle Statuskonflikte ("bereits gebucht", "bereits gelöscht", "ist fixiert und kann nicht ...", "hat bereits eine Transaktion erzeugt", "Posting cannot be cancelled"): der fachliche Zustand des Datensatzes lässt die angeforderte Operation nicht (mehr) zu. Kein Retry, der Agent muss den Zustand vorher prüfen (z. B. per `/receipts/get`) oder dem Nutzer den Konflikt melden.

- Betragsprüfungen ("the total amount of all postings does not match the receipt/transaction amount", "there are no negative amounts allowed"): fachliche Regelverletzung, kein Retry ohne geänderte Beträge.

### 5. Sonderfälle, die eigene Behandlung im MCP-Server brauchen

- **error_code 1**: An `/settings/update/debtor` und `/settings/update/creditor` bedeutet er einen konkreten Feldfehler (`wrong debtor/creditor account postingaccount_number specified`, HTTP 400) und ist damit ein Eingabefehler des Agenten. An keinem anderen Endpunkt in `.paths` tritt dieser Code auf.

- **TransactionsAdd_ErrorCode23/24-Konflikt und InvoicesCreateEInvoice_ErrorCode41/42-Konflikt** (siehe Abschnitt "Auffälligkeiten"): Der MCP-Server sollte sich bei der Fehlerklassifizierung an `/transactions/add` und `/invoices/create/e-invoice` nicht blind auf den numerischen `error_code` verlassen, sondern zusätzlich den `message`-Text auswerten, falls die Live-API dort tatsächlich mehrdeutige Codes liefert. Das ist ohne Live-Test der konkreten Fehlerfälle nicht abschließend zu klären.

- **`/postings/reservations/...`**: Da kein Pfad in `.paths` existiert, sollte der MCP-Server hierzu kein Tool anbieten, bis ein gültiger Pfad live verifiziert wurde.

