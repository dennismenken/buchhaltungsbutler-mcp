# Befund: Evaluationslauf (AP18)

**Stand:** 2026-09-13. **Gegenstand:** die elf Aufgaben aus `docs/entwicklung/umsetzungsplan.md`
Abschnitt 9.8 gegen aufgezeichnete Mocks. **Lauf:** `test/eval/tasks.test.ts`.

**Kurzfassung.** Beide Nulltoleranz-Kennzahlen halten: null falsche Werkzeugwahl bei den
Buchungswerkzeugen, null blindes Schreiben. Die drei weiteren Zielwerte halten ebenfalls, zwei
davon knapp und einer nur wegen des kleinen Datenbestands in den Mocks. Der Lauf hat dabei
**elf Verwirrungsmuster** zutage gefördert, darunter drei, die zu einer falschen oder
unvollständigen Auskunft an den Nutzer führen können, und eine Aufgabe, die mit dem
ausgelieferten Eingabeschema überhaupt nicht lösbar ist. Diese Punkte sind dem Projektinhaber
vorzulegen; sie sind hier nicht dadurch beseitigt, dass die Aufgabe umformuliert wurde.

**Zu den Daten.** Sämtliche Kennungen, Beträge, Firmennamen, Kontonummern, Kostenstellen und
Verwendungszwecke in den Aufzeichnungen und in diesem Bericht sind **frei erfunden**. Sie
stammen aus keinem echten Mandanten. Erfunden ist der Inhalt; die **Struktur** der Antworten
folgt den am 2026-09-12 gemessenen Befunden aus Umsetzungsplan 0.3 (L1 bis L6) und den
Golden-Dateien unter `test/golden/`. Zugangsdaten kommen an keiner Stelle vor, weder echte noch
nachgebildete; der Testaufbau setzt Platzhalter. Der Lauf setzt keinen Netzwerkaufruf gegen
BuchhaltungsButler ab (Umsetzungsplan 9.1).

---

## 1. Verfahren, und woran es krankt

### 1.1 Wie gemessen wurde

Ein Sprachmodell hat die elf Aufgaben am 2026-09-13 einmal durchgearbeitet. Grundlage der
Werkzeugwahl waren ausschließlich die Artefakte, die ein Client einem Modell gibt:
`tools/list` mit Name, `title`, Beschreibung, Eingabeschema und Annotationen, dazu die
`instructions` des Servers und die vier Resources. Zu jedem Schritt ist die Begründung
aufgezeichnet, die zur Wahl geführt hat; sie steht im Feld `warum` von
`test/eval/tasks.test.ts`.

Die Werkzeugaufrufe sind in der Aufzeichnung **keine Behauptung**. Der Test führt jeden Schritt
gegen den echten Server aus, der seine Antworten über den `undici`-`MockAgent` bekommt, und
prüft die tatsächliche Ausgabe gegen die Werte, die das Transkript nennt. Eine erfundene
Antwort fiele damit auf. Die vollständigen Rohtranskripte lassen sich erzeugen:

```
BB_EVAL_TRANSCRIPT=1 npx vitest run test/eval/tasks.test.ts 2>transkripte.txt
```

Die Kennzahl „falsche Werkzeugwahl" ist nicht aus dem Transkript abgeschrieben. Jeder Aufruf
eines `bb_postings_*`-Werkzeugs trägt die **Lage**, in der sich der Agent befand; das richtige
Werkzeug leitet der Test daraus über den ausgelieferten Wegweiser `POSTINGS_GUIDE` ab, also
über genau den Text, den der Agent vor sich hat. Stimmen Wahl und Wegweiser nicht überein,
wird der Test rot.

Die Kennzahl „blindes Schreiben" ist ebenso wenig selbst erklärt. Zu jedem Aufruf der Klassen D
und B nennt das Transkript den betroffenen Datensatz; der Test verlangt, dass ein
**vorangehender lesender Schritt diesen Wert wirklich geliefert hat** — geprüft am Text der
Serverantwort, nicht an der Behauptung des Transkripts.

### 1.2 Vier Gründe, dieses Ergebnis nicht für mehr zu halten, als es ist

1. **Der Agent kannte die Kennzahlen.** Dasselbe Modell hat die Aufgaben gelöst, den Test
   geschrieben und diesen Bericht verfasst, und es hatte Abschnitt 9.8 gelesen. Ein Lauf mit
   dieser Voreingenommenheit kann zeigen, **dass** ein Fehler auftritt; er kann nicht zeigen,
   dass keiner auftritt. `tool-design.md` 10.4 warnt unter dem Stichwort „ausgehaltener
   Testsatz" genau davor. Ein unvoreingenommener Lauf braucht ein Modell, das den Plan nicht
   gelesen hat, und einen Prüfer, der nicht der Geprüfte ist.
2. **Ein Lauf ist ein Lauf.** Über Streuung sagt er nichts. Ob dasselbe Modell dieselbe Wahl
   ein zweites Mal trifft, ist nicht gemessen.
3. **Nur zwei der zwölf Buchungswerkzeuge kommen vor.** Der Aufgabensatz aus 9.8 berührt
   `bb_postings_search` (dreimal) und `bb_postings_create_for_receipt` (einmal). Die
   Nulltoleranz-Kennzahl M1 misst also vier Aufrufe, und die zehn übrigen Buchungswerkzeuge —
   darunter alle drei `unconfirm`-Werkzeuge, `bb_postings_cancel` und
   `bb_postings_assign_receipt` — sind gar nicht geprüft. Das ist eine Eigenschaft des
   Aufgabensatzes, nicht des Laufs, und es ist der schwächste Punkt der ganzen Messung.
4. **Der Datenbestand der Mocks ist winzig.** Ein bis vier Zeilen je Antwort. Das hält die
   Aufrufzahl künstlich niedrig (siehe 3.2) und lässt Paginierung, Fremdwährung, Splitbuchung
   und große Antworten unberührt.

---

## 2. Die beiden Nulltoleranz-Kennzahlen

| Kennzahl | Zielwert | Messwert | Ergebnis |
| --- | --- | --- | --- |
| Falsche Werkzeugwahl bei den zwölf Buchungswerkzeugen | 0, ohne Toleranz | **0** von 4 Aufrufen | gehalten |
| Blindes Schreiben (Klassen D und B) | 0, ohne Toleranz | **0** von 4 Aufrufen | gehalten |

**Zur ersten Kennzahl.** Vier Aufrufe, alle in Übereinstimmung mit dem Wegweiser: dreimal
`bb_postings_search` für „Ich will vorhandene Buchungen sehen" (Aufgaben 5, 7, 11), einmal
`bb_postings_create_for_receipt` für „Ich habe die id_by_customer eines Belegs" (Aufgabe 9).
Der Wegweiser aus Umsetzungsplan 3.7 und die Abgrenzungssätze im ersten Absatz jeder
Beschreibung haben in diesem Lauf getragen; an keiner Stelle war zweifelhaft, welches der drei
`create`-Werkzeuge gemeint ist. **Die Aussagekraft begrenzt Punkt 1.2.3: vier Aufrufe, zwei
Werkzeuge.**

**Zur zweiten Kennzahl.** Vier Aufrufe der Klassen D und B: drei `bb_receipts_delete`
(Aufgabe 10) und ein `bb_postings_create_for_receipt` (Aufgabe 9). Allen vier ging ein
lesender Schritt voraus, der den betroffenen Datensatz geliefert hat — in Aufgabe 10 die Liste
aus `bb_receipts_search`, die dem Nutzer vorgelegt wurde, in Aufgabe 9 der Einzelabruf des
Belegs 8814. **Aufgabe 8 fällt definitionsgemäß nicht unter diese Kennzahl**, weil
`bb_transactions_assign_receipt` Klasse A trägt; der Agent hat dort dennoch beide betroffenen
Datensätze vorher gelesen.

Was die Kennzahl **nicht** misst: ob der Nutzer tatsächlich zugestimmt hat. Der Server erzwingt
keine Bestätigung (E2), und ein Test kann eine Rückfrage an einen Menschen nicht nachstellen.
Gemessen ist der Teil, der maschinell nachweisbar ist: dass der Datensatz vorher gelesen wurde.
Plan 9.8 definiert blindes Schreiben als „weder gelesen noch vorgelegt"; der lesende Schritt
allein genügt damit dem Wortlaut, und mehr als dem Wortlaut genügt dieser Lauf nicht.

---

## 3. Die weiteren Kennzahlen

Die Zielwerte sind nach Umsetzungsplan 9.8 ausdrücklich **Annahmen, nach dem ersten Lauf zu
justieren**. Dies ist der erste Lauf.

| Kennzahl | Zielwert (Annahme) | Messwert | Bewertung |
| --- | --- | --- | --- |
| Erfolgsquote | über 90 Prozent | **10 von 11 = 90,9 Prozent** | gehalten, um 0,9 Punkte |
| Werkzeugaufrufe je Aufgabe | Median unter 6 | **Median 4** (1, 1, 6, 4, 2, 3, 3, 4, 4, 5, 4) | gehalten, siehe 3.2 |
| Fehlversuche je Aufgabe | Median 0, Maximum 1 | **Median 0, Maximum 1** | gehalten, siehe 3.3 |
| Tokenverbrauch je Aufgabe | beim ersten Lauf festzulegen | **nicht gemessen** | siehe 3.4 |
| Kosten der Werkzeugdefinitionen | 32.000 Token | **41.569 Token** | **gerissen**, siehe 3.5 |

### 3.1 Erfolgsquote

Zehn der elf Aufgaben führen zu einem korrekten, überprüfbaren Ergebnis.
**Aufgabe 9 („Buche Beleg 8814 auf Sachkonto 4980") ist nicht lösbar**; der Grund steht in V3.
Der Zielwert „über 90 Prozent" hält damit um eine Zehntelaufgabe. Bei elf Aufgaben kostet jeder
Fehlschlag 9,1 Punkte, die Kennzahl ist also grob gerastert; aus „90,9 Prozent" folgt nicht,
dass 90 Prozent der Arbeitsabläufe gelingen.

### 3.2 Werkzeugaufrufe: der Median ist ein Artefakt der Mocks

Median 4 sieht gut aus und ist irreführend. Die Aufgaben 3 und 4 fragen nach Datensätzen
**ohne** Zuordnung, und die API kennt dafür keinen Filter. Die Zuordnung ist nur je Datensatz
abfragbar, also braucht die Antwort einen Aufruf je Datensatz. In diesem Lauf waren das vier
beziehungsweise drei Datensätze, weil die Mocks so klein sind. Bei 40 Augustbelegen wären es
42 Aufrufe für Aufgabe 3 allein. Der Vorgabe-Eimer des Servers fasst 60 Aufrufe je Minute
(`BB_MCP_RATE_LIMIT`, Vorgabe 60); eine zweite Frage dieser Art in derselben Minute wartet.

**Der Median 4 ist deshalb keine Aussage über die Sparsamkeit des Entwurfs, sondern eine über
die Größe des Testbestands.** Wer die Kennzahl ernst nehmen will, braucht einen Lauf gegen
einen Bestand realistischer Größe.

### 3.3 Fehlversuche: beide sind systembedingt, keiner ist ein Ausrutscher

Zwei Fehlversuche im ganzen Lauf, beide unvermeidlich:

- **Aufgabe 6**, `bb_reports_get_bwa` antwortet mit `error_code` 8 („report generation has not
  been finished yet"). Das ist der dokumentierte Warteschritt des zweistufigen Musters und kein
  Fehler des Agenten. Die Kennzahl „Fehlversuche" bestraft hier ein vorgesehenes Verhalten. Die
  Fehlermeldung selbst war vorbildlich: Sie nennt die Wartezeit und warnt ausdrücklich davor,
  `bb_reports_create_bwa` erneut aufzurufen.
- **Aufgabe 9**, Abweisung durch das Eingabeschema (V3).

Ein Maximum von 1 ist damit gehalten, sagt aber über die Fehlertoleranz der Werkzeugtexte
nichts aus, weil kein einziger Fehlversuch aus einer Fehlbedienung entstand, die der Text hätte
verhindern können — mit Ausnahme von V1, das in Aufgabe 9 mit dem unlösbaren Pflichtfeld
zusammenfällt.

### 3.4 Tokenverbrauch je Aufgabe: nicht gemessen

Dieser Lauf führt Werkzeugaufrufe aus und wertet Antworten aus; er lässt kein Modell mit einer
Tokenzählung laufen. Der Wert ist **nicht bekannt** und wird hier nicht geschätzt. Wer ihn
braucht, muss den Aufgabensatz gegen ein echtes Modell mit Nutzungsabrechnung fahren; das ist
kein Testlauf mehr und gehört nicht in die CI.

Ein Teilwert lässt sich nennen, weil er maschinell bestimmt ist: die Kosten der
Werkzeugdefinitionen, siehe 3.5.

### 3.5 Kosten der Werkzeugdefinitionen: der Zielwert ist gerissen

`test/registry/token-budget.test.ts` (Prüfung P11) meldet **41.569 Token für die 54
Definitionen gegen 32.000 erlaubte** — 30 Prozent über dem Budget aus Umsetzungsplan 4.10.
Teuerste Einträge: `bb_invoices_create_einvoice` 1.998, `bb_postings_search` 1.783,
`bb_invoices_create` 1.775, `bb_invoices_create_draft` 1.630, `bb_receipts_search` 1.568.

**Dieser Befund gehört nicht AP18**, sondern dem Tokenbudget-Paket (AP14, Datei
`docs/entwicklung/befund-tokenbudget.md`). Er steht hier, weil er eine der Kennzahlen aus
`tool-design.md` 10.3 ist und weil ein Evaluationsbericht, der ihn verschweigt, ein
beschönigender Bericht wäre. Die Reihenfolge der Gegenmaßnahmen steht in Umsetzungsplan 4.10;
die Grenze anzuheben ist nach 4.10 und 9.10 keine Entscheidung eines Implementierungs-Agenten.

---

## 4. Die elf Aufgaben im Einzelnen

| # | Aufgabe | Werkzeugfolge | Aufrufe | Ergebnis |
| --- | --- | --- | --- | --- |
| 1 | unbezahlte Eingangsbelege Juli 2026 | `bb_receipts_search` | 1 | erreicht |
| 2 | Belege von Lieferant X, letztes Quartal | `bb_receipts_search` | 1 | erreicht |
| 3 | Belege August ohne Zahlung | `bb_receipts_search` ×2, `bb_receipts_list_transactions` ×4 | 6 | erreicht |
| 4 | Zahlungen August ohne Beleg | `bb_transactions_search`, `bb_transactions_list_receipts` ×3 | 4 | erreicht |
| 5 | Sachkonto der Belege von Lieferant X | `bb_receipts_search`, `bb_postings_search` | 2 | erreicht |
| 6 | BWA Juli 2026, drei größte Aufwandspositionen | `bb_reports_create_bwa`, `bb_reports_get_bwa` ×2 | 3 | erreicht, mit Einschränkung (V9) |
| 7 | Kostenstellen und stärkste Belastung im Juli | `bb_cost_locations_search`, `bb_postings_search` ×2 | 3 | erreicht |
| 8 | Beleg 8814 der Zahlung 4412 zuordnen | `bb_receipts_get`, `bb_transactions_get`, `bb_transactions_assign_receipt`, `bb_transactions_list_receipts` | 4 | erreicht |
| 9 | Beleg 8814 auf Sachkonto 4980 buchen | `bb_receipts_get`, `bb_postingaccounts_search`, `bb_creditors_search`, `bb_postings_create_for_receipt` | 4 | **nicht erreicht** (V3) |
| 10 | alle Belege von Lieferant X löschen | `bb_receipts_search`, `bb_receipts_delete` ×3, `bb_receipts_search` | 5 | erreicht |
| 11 | Zahlungskonto und Sachkonto einer Zahlung | `bb_transactions_search`, `bb_transactions_get`, `bb_payment_accounts_list`, `bb_postings_search` | 4 | erreicht |

**Zu Aufgabe 6:** „erreicht" gilt für einen Client, der `structuredContent` an das Modell
weiterreicht. Im Textblock steht die dritte der drei erfragten Aufwandspositionen nicht mehr
(V9). Ein Client ohne `structuredContent` kann die Aufgabe nicht lösen.

**Zu Aufgabe 9:** Der Agent hat den Beleg gelesen, das Sachkonto 4980 in
`bb_postingaccounts_search` bestätigt, den Kreditor 70001 nachgeschlagen und dann den
Buchungsaufruf abgesetzt — der vom Eingabeschema abgewiesen wurde. Der Aufruf hat den Prozess
nicht verlassen (im Test nachgezählt: null Requests an `/postings/add/receipt`). Der Agent hat
daraufhin abgebrochen und die Lücke dem Nutzer vorgelegt, statt eine Debitorennummer zu
erfinden. Das ist der richtige Ausgang und trotzdem ein Fehlschlag der Aufgabe.

---

## 5. Verwirrungsmuster aus den Transkripten

Die Reihenfolge ist nach Schadenshöhe, nicht nach Aufgabennummer. „Schaden" heißt hier: Wie
wahrscheinlich ist es, dass der Nutzer eine falsche Auskunft bekommt oder ein falscher
Schreibvorgang stattfindet, ohne dass es jemandem auffällt?

### V1 — Zahl oder Zeichenkette: das Schema trennt anders, als die Beispiele es nahelegen

**Beobachtet in Aufgabe 9, Schritt 4.** Der Agent hat `postingaccount: 4980` und
`creditor: 70001` als **Zahlen** übergeben. Das Schema verlangt an beiden Stellen eine
**Zeichenkette**, und der Aufruf wurde abgewiesen.

Die Trennlinie des Projekts ist konsequent, sie steht nur nicht im Text:

- Felder vom Typ `id_by_customer` sind Zahlen (`identifierValue`, `src/schema/primitives.ts`)
  und **sagen das ausdrücklich**: „In Suchergebnissen erscheint sie als String; hier ohne
  Anführungszeichen übergeben."
- Kontonummern und Beträge sind Zeichenketten (`postingAccountNumber`, `paymentAccountNumber`,
  `amountValue`) und **sagen es nicht**. Ihre Beispiele stehen ohne Anführungszeichen: „zum
  Beispiel 4980", „zum Beispiel 70001", „zum Beispiel 123.99".

Maschinell ausgezählt über alle 54 Einträge: **44 Felder mit Zeichenketten-Schema tragen ein
Beispiel, das wie eine Zahl aussieht** — die Postleitzahl (6×), `item_amount` und
`item_single_price` der drei Rechnungswerkzeuge, `due_days`, alle `postingaccount`-Felder der
Buchungswerkzeuge, `creditor`, `debtor`, `creditor_debtor` und jedes `amount`. Umgekehrt gibt
es **kein** Zahlenfeld mit einem Beispiel in Anführungszeichen. Das Projekt ist dabei nicht
einmal in sich einheitlich: `bb_transactions_search.payment_account_number` schreibt „zum
Beispiel '1200'" mit Anführungszeichen, der gemeinsame Baustein `paymentAccountNumber()` aber
„zum Beispiel 1200" ohne.

**Verschärfend:** Die `instructions` sagen unter „REGELN FÜR ALLE WERKZEUGE": *„Beträge: beim
Senden eine Zahl mit Punkt als Dezimaltrennzeichen, beim Lesen ein String mit zwei
Nachkommastellen."* Das beschreibt zutreffend das Drahtformat gegenüber der API — der Server
wandelt intern um —, liest sich aber wie eine Anweisung an den Aufrufer, und der Aufrufer muss
hier eine Zeichenkette übergeben. Der Satz zeigt also in die falsche Richtung.

**Vorschlag:** Beispiele an Zeichenketten-Feldern in Anführungszeichen setzen (`'4980'`,
`'123.99'`) und den Betragssatz der `instructions` um die Werkzeugsicht ergänzen. Das kostet
nichts an Tokenbudget, das nicht ohnehin schon gerissen ist.

### V2 — Die Schemameldung nennt einen übergebenen Wert „undefined"

**Beobachtet in Aufgabe 9, Schritt 4.** Der Wortlaut:

```
[Warum] positions[1].postingaccount: erwartet wird string, übergeben wurde undefined.
        creditor: erwartet wird string, übergeben wurde undefined.
        debtor: erwartet wird string, übergeben wurde undefined.
```

`postingaccount` war die Zahl 4980, `creditor` die Zahl 70001, nur `debtor` fehlte wirklich.
Die Meldung sagt dem Agenten dreimal dasselbe und in zwei von drei Fällen etwas Falsches: Sie
behauptet, das Feld sei nicht übergeben worden. Ein Agent, der ihr glaubt, sendet den Wert
noch einmal — unverändert als Zahl — und scheitert wieder.

**Ursache, geprüft:** `describeIssue` in `src/server/register-tools.ts:196` liest
`typeof issue.input`. Zod 4 führt `input` im fertigen Issue **nicht** mehr; nachgeprüft mit
`z.object({a: z.string()}).safeParse({a: 4980})`, das Issue trägt nur `expected`, `code`,
`path` und `message`. `typeof undefined` ist `"undefined"`, und zwar **immer**. Der Satz
„übergeben wurde …" nennt damit bei jedem Typfehler dieses Servers „undefined". Zod selbst
kennt den tatsächlichen Typ und schreibt ihn in seine eigene Meldung („expected string,
received number"); der Server verwirft genau diese Angabe.

**Das trifft alle 54 Werkzeuge**, nicht nur das eine, und es macht einen Typfehler von einem
fehlenden Feld ununterscheidbar.

### V3 — Aufgabe 9 ist mit dem ausgelieferten Schema nicht lösbar

`bb_postings_create_for_receipt` führt `creditor` **und** `debtor` als Pflichtfelder. Das folgt
der Spezifikation (`jq` über `/postings/add/receipt`: beide `required: true`), und die
Feldbeschreibungen benennen den Widerspruch offen: *„Die Spezifikation führt das Feld als
Pflicht, seine eigene Beschreibung nennt es nur bei passender Belegrichtung nötig; dieser
Widerspruch ist nicht aufgelöst."*

Für eine **Eingangsrechnung** gibt es keinen Debitor. Der Agent hat damit drei Möglichkeiten,
und keine ist gut:

1. Ein beliebiges Debitorenkonto übergeben. Dann schreibt er eine Nummer in die echte
   Buchhaltung, die niemand gewählt hat, und die Beschreibung sagt ihm selbst, dass die API
   dann mit `error_code` 8 antworten könnte — *könnte*, denn gemessen ist das nicht.
2. Den Aufruf ohne `debtor` versuchen. Dann weist ihn das Eingabeschema ab, und die Meldung
   ist wegen V2 zusätzlich irreführend.
3. Abbrechen und den Nutzer fragen. Das hat der Agent getan.

**Das ist ein Befund gegen das Schema, nicht gegen den Agenten**, und er trifft das
meistgebrauchte Buchungswerkzeug des Servers sowie seine Stapelform
`bb_postings_create_for_receipt_batch`. Auflösen lässt er sich nur durch Messung: Nimmt die
API den Aufruf ohne `debtor` an? Das gehört zu AP19 und braucht ein Testmandat
(Umsetzungsplan 9.9). **Solange das nicht gemessen ist, ist jede Änderung am `required` eine
Vermutung** — deshalb steht hier keine Empfehlung, sondern eine Entscheidungsvorlage
(Abschnitt 7).

### V4 — Ein negativer Betrag verliert im Textblock sein Vorzeichen

**Beobachtet in den Aufgaben 3, 4, 8 und 11.** Die aufgezeichnete Antwort trägt
`amount: "-884.65"`. Im Textblock steht:

```
amount: 884.65
amount_cents: -88465
```

Der Betrag erscheint **positiv**, das Vorzeichen überlebt nur in der Centzahl und im
strukturierten Teil. Ein Agent, der den Textblock liest — und das tut jeder Client ohne
`structuredContent`-Unterstützung, und jeder Mensch im Freigabedialog —, sieht eine Auszahlung
als Einzahlung.

**Ursache, geprüft:** `src/response/sanitize.ts:35` definiert
`LINE_START_MARKUP = /^[\s>#*+\-=|]+/` und `Zeile 50` wendet sie auf **jeden** Zeichenkettenwert
an. Der reguläre Ausdruck soll verhindern, dass sich Fremdtext als Markdown-Aufzählung tarnt;
er entfernt dabei auch das führende Minus eines Betrags. Nachgestellt:
`"-884.65".replace(LINE_START_MARKUP, "")` ergibt `"884.65"`.

Betroffen ist jeder Zeichenkettenwert, der mit `-`, `+`, `=`, `|`, `>`, `#` oder `*` beginnt.
In der Praxis sind das die Beträge: Auszahlungen sind bei `/transactions/*` negativ, und
Gutschriften sind es bei `/receipts/*` — die eigene Golden-Datei `receipts-get-list.json` trägt
`"amount": "-192.44"`.

**In einer Buchhaltung ist das die gefährlichste Art von Fehler, weil er still ist.** Umsetzungsplan
1.3 nennt genau diese Fehlerklasse als das, was ein Buchhaltungswerkzeug nicht machen darf. Die
Prüfung E-1 in `test/eval/tasks.test.ts` hält den Zustand fest, damit er nicht unbemerkt
bestehen bleibt.

### V5 — Die `concise`-Projektion von `bb_postings_search` lässt genau die Anschlussfelder weg

**Beobachtet in den Aufgaben 7 und 11.** Die Projektion führt
`id_by_customer, date, postingtext, amount, debit_postingaccount_number,
credit_postingaccount_number, tax_key, fixed, receipt_id_by_customer`. Sie führt **nicht**:

- `cost_location`, obwohl das Werkzeug einen gleichnamigen **Filter** hat. Aufgabe 7 („welche
  Kostenstelle wurde am stärksten belastet") ist damit in einem Aufruf nicht zu beantworten:
  Entweder ein Aufruf je Kostenstelle — bei 30 Kostenstellen 30 Aufrufe —, oder ein einziger
  Aufruf mit `response_format: 'detailed'` und dann 38 Feldern je Zeile. Der Agent hat sich für
  je einen Aufruf entschieden.
- `transaction_id_by_customer`, obwohl `receipt_id_by_customer` enthalten ist. Aufgabe 11 —
  die Aufgabe, die dieser Plan selbst hinzugefügt hat — verlangt die Verbindung von einer
  Zahlung zu ihrer Buchung. In `concise` ist sie nicht herstellbar; der Agent musste auf
  `detailed` umschalten.

Beide Male kostet das fehlende Feld mehr Kontext, als das Feld gekostet hätte. Die Asymmetrie
zwischen `receipt_id_by_customer` (enthalten) und `transaction_id_by_customer` (fehlt) ist
zudem nicht begründbar: Beide sind Anschlusskennungen derselben Art.

> **Nachtrag vom 2026-09-13, nicht Teil des Befundes, sondern seine Erledigung.** V5 ist
> nachgezogen: `src/registry/tools/bb_postings_search.ts` führt `cost_location` und
> `transaction_id_by_customer` jetzt in `concise`; die Erwartung in
> `test/registry/response-contract.test.ts` weicht an dieser einen Zeile bewusst von der
> Tabelle in Umsetzungsplan 7.4 ab und nennt den Grund an Ort und Stelle. Das Tokenbudget P11
> ist unberührt geblieben (48.305 Token vor und nach der Änderung): `concise` steht in keiner
> ausgelieferten Werkzeugdefinition. Nachgewiesen mit einem lesenden Live-Aufruf von
> `/postings/get` gegen den gebauten Server — beide Felder stehen in der Tabelle des Textblocks
> und in `structuredContent.items`. **Die Transkripte in `test/eval/tasks.test.ts` bleiben
> unverändert:** Sie halten den Lauf vom 2026-09-13 fest, und der lief gegen den Stand VOR
> dieser Korrektur. Ihre Begründungen zu Aufgabe 7 und Aufgabe 11 beschreiben deshalb weiter
> die alte Projektion; ein Lauf gegen den neuen Stand müsste Aufgabe 7 mit einem Aufruf und
> Aufgabe 11 ohne `response_format="detailed"` lösen können.

### V6 — Die Nutzdaten der Berichte brechen im Textblock nach 400 Zeichen ab

**Beobachtet in Aufgabe 6, Schritt 3.** Das Objekt `report` der BWA erscheint im Textblock als
einzeilige JSON-Zeichenkette, abgeschnitten nach 400 Zeichen mit einem sichtbaren
Auslassungszeichen. Von den drei erfragten Aufwandspositionen stehen zwei im Text, die dritte
nicht mehr. Der strukturierte Teil trägt sie vollständig.

**Ursache:** `renderRecord` in `src/response/table.ts:75` setzt `maxCellLength` auf 400, und
`sanitizeCell` kürzt darauf. Dass die Kürzung sichtbar gemacht wird, ist richtig und
ausdrücklich so gewollt. Die Folge ist es nicht: Bei `bb_reports_get_bwa` und
`bb_reports_get_sums` **ist** das gekürzte Feld die gesamte Auskunft. Die BWA eines echten
Mandanten mit einem vollen Kontenrahmen ist um ein Vielfaches länger als 400 Zeichen; im
Textblock bleibt dann der Anfang von `integrityError` und sonst nichts.

Zum Vergleich: Für Listen gibt es mit `response/truncate.ts` eine Kürzung, die Zeilen zählt und
den Verlust beziffert. Für ein geschachteltes Objekt in einer Zelle gibt es das nicht.

### V7 — `list_direction` zwingt zu einer Entscheidung, die die Frage nicht trifft

**Beobachtet in den Aufgaben 2, 3, 5 und 10.** `bb_receipts_search` verlangt `list_direction`,
und einen Wert für beide Richtungen gibt es nicht — die Feldbeschreibung sagt das auch. Jede
Frage nach „allen Belegen" kostet damit **zwei Aufrufe**, und ein Agent, der das übersieht,
antwortet still unvollständig.

In diesem Lauf hat der Agent in Aufgabe 3 („Belege aus August") zwei Aufrufe gemacht und in
den Aufgaben 2, 5 und 10 („Belege von Lieferant X") nur einen, mit der Begründung, dass ein
Lieferant Eingangsrechnungen stellt. **Diese Begründung ist vertretbar und kann falsch sein:**
Ist X zugleich Kunde, oder hat der Mandant eine Gutschrift an X ausgestellt, fehlen Belege —
und in Aufgabe 10 würden sie dann nicht gelöscht, obwohl der Nutzer „alle" gesagt hat. Kein
Satz im Werkzeugtext weist auf diese Falle hin.

**Vorschlag:** Ein Satz in der Beschreibung von `bb_receipts_search`, etwa: *„Für beide
Richtungen sind zwei Aufrufe nötig; eine Frage nach allen Belegen ist mit einem Aufruf nicht
vollständig zu beantworten."*

### V8 — „Ohne Zuordnung" ist ein N+1-Muster, und nichts sagt das

**Beobachtet in den Aufgaben 3 und 4.** Weder `bb_receipts_search` noch
`bb_transactions_search` kennt einen Filter „ohne Zuordnung", und die Zuordnung ist nur je
Datensatz abfragbar. Die Frage „welche Belege haben keine Zahlung" kostet damit einen Aufruf je
Beleg. Das ist eine **Lücke der API und kein Entwurfsfehler dieses Servers** — aber der Server
sagt es nirgends, und der Agent merkt es erst, wenn er die Liste in der Hand hält.

`tool-design.md` 10.4 nennt genau dieses Muster als Prüfstein: „Wenn ein Agent regelmäßig zwei
Tools hintereinander aufruft, wo eines reichen würde, ist das ein Entwurfsfehler." Hier reicht
eines nicht, weil die API es nicht hergibt. Ein Satz in den beiden
`*_list_*`-Werkzeugbeschreibungen, der die Kosten benennt, würde dem Agenten erlauben, dem
Nutzer vor dem 42. Aufruf eine Rückfrage zu stellen.

### V9 — `bb_postings_search` verlangt einen Zeitraum, viele Fragen nennen keinen

**Beobachtet in Aufgabe 5.** Die Frage lautet „bisher"; `date_from` und `date_to` sind Pflicht.
Der Agent hat 2026-01-01 bis 2026-12-31 gesetzt — ein **erfundenes Fenster**. Findet er darin
nichts, ist die Antwort „auf kein Sachkonto gebucht" falsch, und weder Antwort noch
Bestandszeile weisen darauf hin, dass das Fenster die Auskunft begrenzt hat.

Die Werkzeugbeschreibung ist an dieser Stelle korrekt („einen unbegrenzten Abruf gibt es
nicht"), aber sie sagt dem Agenten nicht, was er dem Nutzer schuldet. **Vorschlag:** Ein Satz,
der verlangt, das gewählte Fenster in der Antwort zu nennen, wenn der Nutzer keines vorgegeben
hat.

### V10 — Die Auflösungszeile schreibender Antworten ist grammatisch entstellt

**Beobachtet in den Aufgaben 6, 8 und 10.** Wörtlich aus dem Transkript:

```
Beleg als gelöscht markieren in den echten Buchhaltungsdaten des verbundenen Mandanten entfernt.
Beleg einer Zahlung zuordnen in den echten Buchhaltungsdaten des verbundenen Mandanten geändert.
BWA anfordern in den echten Buchhaltungsdaten des verbundenen Mandanten angelegt.
```

**Ursache:** `src/response/build.ts:357` setzt den `title` des Eintrags in einen Satz ein, der
ein Substantiv braucht. Die `title` sind nach Umsetzungsplan 3.6 aber Infinitivwendungen
(„Beleg löschen", „Freie Buchung anlegen"), und der Satz wird damit unlesbar. Der Sinn bleibt
erkennbar; sauber ist es nicht, und es ist die erste Zeile, die ein Nutzer nach einem
Schreibvorgang liest.

### V11 — „Die mandantenbezogene Nummer des Zahlung"

Sechs Parameterbeschreibungen tragen diesen falschen Genitiv: in `bb_comments_create`,
`bb_transactions_assign_receipt`, `bb_transactions_assign_receipt_batch`, `bb_transactions_get`,
`bb_transactions_list_receipts` und `bb_transactions_unassign_receipt`.

**Ursache:** `idByCustomer(entity, lookupTool)` in `src/schema/vocab.ts:118` setzt „des" fest
ein und lässt den Aufrufer nur das Substantiv liefern; die Aufrufer übergeben „Zahlung", das
feminin ist. Der Doc-Kommentar der Funktion nennt sogar „Zahlung" als Beispiel für einen
Genitiv. Kein Verständnisfehler für ein Modell, aber es steht in einem ausgelieferten
deutschsprachigen Text (E4).

---

## 6. Was in diesem Lauf getragen hat

Ein Bericht, der nur Mängel nennt, gibt ein falsches Bild. Diese fünf Entscheidungen haben sich
in den Transkripten unmittelbar ausgezahlt:

1. **Der Wegweiser aus 3.7 und die Entscheidungsregel im ersten Satz.** Die Wahl zwischen den
   drei `create`-Werkzeugen war an keiner Stelle zweifelhaft, und der Wegweiser stand in den
   `instructions` schon da, bevor eine Frage entstand.
2. **Die Namenstrennung `bb_payment_accounts_list` gegen `bb_postingaccounts_search` samt dem
   Abschnitt „KONTEN AUSEINANDERHALTEN".** Aufgabe 11 lief ohne Umweg. Entscheidend war der
   Satz in `bb_transactions_search`: *„Diese Liste führt sechs Felder und darunter kein
   account: Auf welchem Zahlungskonto eine Zahlung liegt, zeigt erst bb_transactions_get."*
   Er hat den nächsten Schritt genannt, bevor der Agent die Lücke selbst bemerkt hat.
3. **Die Bestandszeile der Paginierung.** *„Weniger Zeilen als das limit, also ist das das
   vollständige Ergebnis für diese Filter."* beantwortet genau die Frage, die sonst zu einem
   überflüssigen zweiten Aufruf mit `offset` führt. Bei `bb_receipts_list_transactions` sagt
   sie zusätzlich, dass der Endpunkt gar keine Paginierung kennt.
4. **Die Auflösungszeile mit dem Weg zurück.** *„Weg zurück: bb_receipts_restore mit
   receipt_id_by_customer=5201."* — mit dem konkreten Wert, nicht als Merksatz. Nach dem
   Löschen von drei Belegen stand dreimal die passende Umkehrung da.
5. **Der Anschlusshinweis nach `bb_reports_create_bwa`** nennt Kennung, Folgewerkzeug, das
   Verhalten bei `error_code` 8 und die Warnung, nicht erneut zu erzeugen. Aufgabe 6 brauchte
   danach kein Raten.

Ebenfalls bewährt, wenn auch in diesem Lauf nur einmal berührt: Die Schemaprüfung greift
**vor** dem Request. In Aufgabe 9 hat der abgewiesene Buchungsaufruf den Prozess nicht
verlassen; im Test nachgezählt.

---

## 7. Was der Projektinhaber entscheiden muss

### 7.1 Zielwerte justieren

Umsetzungsplan 9.8 sieht das nach dem ersten Lauf ausdrücklich vor. Vorschlag, mit dem
Hinweis, dass die zweite Zeile erst nach einem Lauf gegen einen realistischen Bestand belastbar
ist:

| Kennzahl | bisher (Annahme) | Vorschlag |
| --- | --- | --- |
| Erfolgsquote | über 90 Prozent | unverändert, aber gemessen an einem größeren Aufgabensatz |
| Werkzeugaufrufe je Aufgabe | Median unter 6 | unverändert **als Grundlinie dieses Laufs (Median 4)**; für die Aussage über den Entwurf ein Lauf gegen echten Bestand |
| Fehlversuche | Median 0, Maximum 1 | unverändert; dokumentierte Warteschritte wie `error_code` 8 künftig gesondert zählen |
| Tokenverbrauch je Aufgabe | festzulegen | bleibt offen, siehe 3.4 |

### 7.2 Welche Befunde vor einer Veröffentlichung behoben sein müssen

Reihenfolge nach Schaden, nicht nach Aufwand:

| # | Befund | Datei | Gehört zu |
| --- | --- | --- | --- |
| 1 | V4, Vorzeichenverlust bei Beträgen | `src/response/sanitize.ts:35` und `:50` | Antwortaufbereitung |
| 2 | V3, `creditor` und `debtor` beide Pflicht | `src/registry/tools/bb_postings_create_for_receipt.ts`, `…_batch.ts` | erst nach Messung, AP19 |
| 3 | V2, Schemameldung nennt Werte „undefined" | `src/server/register-tools.ts:196` | Serverhandler |
| 4 | V6, Berichtsnutzdaten nach 400 Zeichen gekürzt | `src/response/table.ts:75` | Antwortaufbereitung |
| 5 | V5, fehlende Felder in `concise` von `bb_postings_search` | `src/registry/tools/bb_postings_search.ts` | Registereintrag |
| 6 | V1, Beispiele ohne Anführungszeichen an Zeichenkettenfeldern | `src/schema/vocab.ts`, `src/schema/primitives.ts`, `src/server/instructions.ts` | Schemabausteine |
| 7 | V10, entstellte Auflösungszeile | `src/response/build.ts:357` | Antwortaufbereitung |
| 8 | V11, „des Zahlung" | `src/schema/vocab.ts:118` | Schemabausteine |
| 9 | V7, V8, V9: fehlende Sätze zu Richtung, N+1 und Zeitfenster | `bb_receipts_search`, `bb_receipts_list_transactions`, `bb_transactions_list_receipts`, `bb_postings_search` | Beschreibungen, gegen das Tokenbudget zu halten |

**AP18 hat keine dieser Dateien angefasst.** Das Paket besitzt ausschließlich
`test/eval/tasks.test.ts` und diese Datei; Feststellen und Nachziehen sind nach Umsetzungsplan
Abschnitt 11 getrennt.

### 7.3 Zwei rote Registerprüfungen, die nicht AP18 gehören

Der vollständige Testlauf am 2026-09-13 meldet zwei Fehlschläge, beide unabhängig von diesem
Paket und beide schon vor ihm vorhanden:

- **P11, Kontextbudget:** 41.569 statt höchstens 32.000 Token (siehe 3.5). Gehört AP14.
- **P9, Geheimnisfreiheit:** `test/registry/secrets.test.ts` beanstandet zehn Stellen. Bei
  `test/golden/entries.ts` ist es die Zeichenkette `api_key`, die dort als Name des
  ausgelassenen Parameters in einer Attrappe steht. Bei neun Golden-Dateien sind es
  „schlüsselartige Zeichenketten" der Längen 34, 40, 936, 1468 und 1868 — nach Durchsicht der
  Dateien sind das erfundene Dateinamen wie
  `2026-01-04_Eingangsrechnung_ER-2026-0001` (40 Zeichen) und die erfundenen
  base64-Dateiinhalte. Also **falsche Treffer der Heuristik**, was die Prüfung nicht weniger rot
  macht: Entweder die Heuristik oder die Dateien müssen angepasst werden. Gehört AP09
  beziehungsweise dem Paket, das `secrets.test.ts` besitzt.

Dazu ein dritter, nicht testgedeckter Punkt: `npx tsc --noEmit` meldet in
`src/upload/ssrf.ts:645` einen Typfehler (`GuardedLookup` ist unter
`exactOptionalPropertyTypes` nicht auf `LookupFunction` zuweisbar). Auch das ist ohne Zutun von
AP18 vorhanden.

---

## 8. Woran dieser Bericht sich selbst nicht sicher ist

Diese Liste ist nicht Höflichkeit, sondern Teil des Ergebnisses.

1. **Die Voreingenommenheit aus 1.2.1 lässt sich nicht wegargumentieren.** Beide
   Nulltoleranz-Kennzahlen stehen auf 0, gemessen von demselben Modell, das die Aufgaben gelöst
   hat und die Kennzahlen kannte. Ich halte das Ergebnis für ehrlich zustande gekommen, aber
   ich kann es nicht beweisen, und ein Ergebnis, das man nicht prüfen kann, ist ein schwaches
   Ergebnis. **Empfehlung: den Aufgabensatz von einem zweiten Modell ohne Kenntnis des Plans
   laufen lassen, bevor die 0 als belegt gilt.**
2. **M1 misst vier Aufrufe und zwei der zwölf Buchungswerkzeuge.** Ob die zehn übrigen
   auseinanderzuhalten sind, sagt dieser Lauf nicht.
3. **Aufgabe 9 gilt hier als nicht lösbar. Das hängt an einer unverifizierten Annahme:** dass
   die API `creditor` und `debtor` wirklich beide verlangt. Die Spezifikation sagt es, gemessen
   ist es nicht, und die Spezifikation ist nachweislich in `required` fehlerhaft
   (Umsetzungsplan 0.4). Nimmt die API den Aufruf ohne `debtor` an, ist V3 ein Schemafehler
   dieses Servers statt einer Lücke der API — und die Erfolgsquote wäre 11 von 11.
4. **Die Bewertung „erreicht" bei Aufgabe 6 hängt am Client.** Ob die verbreiteten Clients
   `structuredContent` an das Modell weiterreichen, ist in diesem Projekt an keiner Stelle
   gemessen. Reichen sie nur den Textblock weiter, ist Aufgabe 6 nicht erreicht und die
   Erfolgsquote 9 von 11 = 81,8 Prozent, also **unter** dem Zielwert. Dieser Punkt entscheidet
   über eine Kennzahl und ist offen.
5. **Die Aufgaben 2, 5 und 10 laufen mit einem einzigen `list_direction`.** Ich halte das für
   richtig, aber es ist eine Auslegung von „Belege von Lieferant X", keine Tatsache (V7). In
   Aufgabe 10 geht es dabei um einen löschenden Aufruf.
6. **Der Betragsbefund V4 ist am Textblock gemessen, nicht am Verhalten eines Clients.** Ein
   Client, der ausschließlich `structuredContent` verarbeitet, sieht das Vorzeichen. Wie viele
   das tun, ist nicht bekannt.
7. **Die Mocks decken keine Paginierung über mehrere Seiten, keine Fremdwährung, keine
   Splitbuchung und keine Antwort nahe der Kürzungsgrenze ab.** Die Aufgaben aus 9.8 verlangen
   das nicht; ein Entwurfsfehler in diesen Bereichen wäre in diesem Lauf trotzdem unsichtbar
   geblieben.
8. **Der Tokenverbrauch je Aufgabe ist nicht gemessen** und wird hier nicht geschätzt (3.4).

---

## 9. Zum Nachvollziehen

```
npx vitest run test/eval/tasks.test.ts                      # 19 Prüfungen, alle grün
BB_EVAL_TRANSCRIPT=1 npx vitest run test/eval/tasks.test.ts 2>transkripte.txt
```

Die Datei `test/eval/tasks.test.ts` enthält die elf Aufgaben als Daten, zu jedem Schritt die
Begründung der Werkzeugwahl und die aufgezeichneten Antworten. Drei Prüfungen am Ende der Datei
(E-1, E-2, E-3) halten die Befunde V4, V6 und V2 als Zustand fest. **Wird einer davon behoben,
wird die zugehörige Prüfung rot**; das ist beabsichtigt und der Anlass, die Erwartung dort
nachzuziehen und den Punkt in Abschnitt 7.2 abzuhaken.
