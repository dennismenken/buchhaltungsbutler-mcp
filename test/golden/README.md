# Golden-Dateien

Antwortbeispiele der BuchhaltungsButler-API für die Tests (Umsetzungsplan 9.4). Sie gehören
zu AP09 und werden von jedem späteren Arbeitspaket gelesen, nicht geändert.

## Die zwei Regeln

1. **Jede Datei trägt eine Herkunftszeile.** Im Feld `_herkunft` steht, welcher Endpunkt,
   welches Datum und welche Quelle — und ob der Fall **gemessen**, **dokumentiert** oder
   **nicht verifiziert** ist. Die Antwortkörper sind aus belegten Beobachtungen abgeleitet und
   nicht aus dem, was der Code erwartet: Ein Mock, der die Annahme wiederholt, prüft nichts.
2. **Die Geschäftsdaten sind erfunden, die Struktur nicht.** Keine echten Mandantendaten,
   keine Zugangsdaten, keine echten Kontonummern, Namen, Beträge oder Belegnummern. Feldmengen,
   Feldnamen, Typen und die Form des Umschlags stammen dagegen aus den Messungen in
   Umsetzungsplan 0.3 beziehungsweise aus der Spezifikation, und genau die prüfen die Tests.

## Live-Nachweis vom 2026-09-12 (AP09)

Fünf lesende Aufrufe gegen die Produktivumgebung haben die vier gemessenen Strukturen erneut
bestätigt; wiedergegeben wird nur der Struktur-, nie der Geschäftsbefund:

| Aufruf | Befund |
| --- | --- |
| `POST /receipts/get` (`limit: 1`) | Umschlag `success`, `message`, `rows`, `data`; **16** Felder; `id_by_customer`, `amount`, `deleted`, `account` als String; `delivery_date`, `due_date`, `link_to_receipt_id_by_customer` als `null` |
| `POST /receipts/get/<wert>` | Umschlag **ohne** `rows`, `data` als Objekt; **23** Felder; `date_delivery` und `date_payment_due` statt der Listennamen; `amount_original` und `currency_original` vorhanden; `e_invoice_type` als **JSON-Zahl** |
| `POST /transactions/get` (`limit: 1`) | **6** Felder; `id_by_customer` als **JSON-Zahl**; **kein** `account` |
| `POST /transactions/get/<wert>` | Umschlag ohne `rows`; **13** Felder; `account` als **JSON-Zahl** |

Damit sind die Feldmengen aus Umsetzungsplan 0.3 L2, L3 und L5 unabhängig ein zweites Mal
belegt. Kein schreibender Aufruf.

## Form einer Datei

```jsonc
{
  "_herkunft": "Endpunkt … | gemessen 2026-09-12 | Quelle: … | Struktur gemessen, Geschäftsdaten erfunden",
  "_zweck":   "welchen Fall aus 9.4 diese Datei abdeckt",
  "http":      { "status": 200, "contentType": "application/json; charset=utf-8" },
  "body":      { "success": true, "message": "", "rows": 2, "data": [] }
}
```

Genau eines von `body` (JSON-Körper) und `bodyText` (Rohtext, für HTML und für absichtlich
unzerlegbares JSON) ist gesetzt. Gelesen werden die Dateien über `test/golden/index.ts`:

```ts
import { goldenReply, goldenBody, goldenRows, loadGolden } from "../golden/index.js";

api.post("/receipts/get", goldenReply("receipts-get-list"));
```

`loadGolden` wirft, wenn Herkunftszeile, `_zweck` oder der `http`-Block fehlen. Damit ist die
Pflicht aus 9.4 maschinell erzwungen und nicht nur hier beschrieben.

## Hinweis für den Vertragstest `test/contract/output-schema.test.ts`

Das `outputSchema` eines Werkzeugs beschreibt **die Antwort dieses Servers** und nicht den
Rohumschlag der API: `endpoint`, `success`, die Paginierungstatsachen und den Datenbehälter
(`items` bei der Listenform, `data` beim Einzelabruf; Umsetzungsplan 7.1). Ein `body` aus
diesem Verzeichnis validiert deshalb **nicht** unmittelbar gegen das `outputSchema`. Der Weg
ist: `parseEnvelope` → `mapResponse` → `buildToolResponse`, und geprüft wird das
`structuredContent` des Ergebnisses gegen `buildOutputSchema(entry)`. Genau dieser Weg läuft
auch im Betrieb, und nur er beantwortet die Frage, die der Test stellen will.

## Die Dateien

| Datei | Fall aus 9.4 |
| --- | --- |
| `receipts-get-list.json` | Listenform, 16 gemessene Felder, `id_by_customer` als String, `delivery_date` und `due_date` als `null` |
| `receipts-get-list-full-page.json` | volle Seite (`rows == limit`), erste Bestandszeile aus 7.5 |
| `receipts-get-list-empty.json` | leere Seite (`rows: 0`, `data: []`), dritte Bestandszeile |
| `receipts-get-list-contract-violation.json` | bekanntes Feld fehlt beziehungsweise hat den falschen Typ → `_contract_warnings` |
| `receipts-get-list-unknown-field.json` | unbekanntes Feld vorhanden → durchgereicht und gezählt |
| `receipts-get-list-freetext.json` | Freitext mit Pipe, Zeilenumbruch und Markdown-Resten → Sanitizer |
| `receipts-get-single.json` | Einzelabruf, 23 gemessene Felder, `data` als Objekt ohne `rows`, `date_delivery`/`date_payment_due`, `amount_original`/`currency_original` |
| `receipts-get-single-with-file.json` | Base64 im Feld `file_content` (**nicht verifiziert**, siehe Herkunftszeile) |
| `transactions-get-list.json` | 6 Felder, `id_by_customer` als **Zahl**, kein `account` |
| `transactions-get-single.json` | 13 Felder, `account` als **Zahl** |
| `postingaccounts-get-list.json` | Vereinigungsliste mit `type` und `subtype`; Grundlage der Kontobezeichnungen aus dem Stammdatenspeicher |
| `accounts-get-list.json` | `/accounts/get`: zwei Felder, keine Paginierung, **nie** zwischengespeichert |
| `cost-locations-get-list.json` | zwei Felder, `code` ist der Identifikator |
| `postings-add-free-ack.json` | Schreibantwort ohne Nutzdaten → Auflösung aus den Argumenten, ohne zusätzlichen Request |
| `receipts-add-ack.json` | Schreibantwort mit `id_by_customer` **auf oberster Ebene** (`container: "none"`) |
| `invoices-create-success.json` | Schreibantwort mit drei Feldern auf oberster Ebene; kein Weg zurück |
| `reports-create-bwa-ack.json` | Anschlusshinweis aus 7.6, erste Zeile |
| `reports-get-bwa-with-files.json` | Base64 in `files.pdf` und `files.csv` → nie im Textblock |
| `receipts-get-error-400-15-catalog.json` | 400/15 mit dem Katalogtext `invalid sort field specified` |
| `receipts-get-error-400-15-live.json` | 400/15 mit dem live gemessenen Text `invalid field specified` (Befund L6) |
| `receipts-get-success-false.json` | HTTP 200 mit `success: false` |
| `receipts-get-no-success.json` | Umschlag ohne `success` |
| `transactions-get-literal-path-html.json` | HTML-Antwort am **literalen** Pfad `/transactions/get/id_by_customer` (gemessen, Befund 1) |

Die Abfangregel der vier Werkzeuge mit Pfadvorlage wird auf den **interpolierten** Pfad gesetzt
(`/receipts/get/4711`), nie auf den Spezifikationspfad: Nur so ist belegt, dass der Pfadbau aus
4.6 wirklich durchlaufen wird.
