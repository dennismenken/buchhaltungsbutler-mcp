# Bündelwerkzeuge: die verbindliche Bauvorlage

**Stand: 2026-09-13.** Diese Datei legt den Satz der Bündelwerkzeuge fest. Sie ist die
Bauvorlage: Was hier steht, wird gebaut; was hier verworfen ist, wird nicht gebaut. Sie
entstand aus drei unabhängigen Entwürfen (Blickwinkel Buchhalterin, Sparsamkeit, Robustheit)
und aus sieben eigenen, ausschließlich lesenden Messungen gegen den Produktivmandanten.

Vorrang bei Widerspruch: `docs/entwicklung/tool-design.md` und die Entscheidungen des
Projektinhabers (N1 bis N6) stehen über dieser Datei. Innerhalb der hier entschiedenen Fragen
steht diese Datei über den drei Einzelentwürfen.

---

## Inhalt

1. [Die Messungen, die den Entwurf bestimmt haben](#1-die-messungen-die-den-entwurf-bestimmt-haben)
2. [Der Satz: fünf Bündel](#2-der-satz-fünf-bündel)
3. [Der gemeinsame Bündelvertrag](#3-der-gemeinsame-bündelvertrag)
4. [Die fünf Werkzeuge im Einzelnen](#4-die-fünf-werkzeuge-im-einzelnen)
5. [Teilfehler](#5-teilfehler)
6. [Rate Limit](#6-rate-limit)
7. [Der Gruppenschalter](#7-der-gruppenschalter)
8. [Tokenpreis, mit Rechenweg](#8-tokenpreis-mit-rechenweg)
9. [Architekturfolgen im Code](#9-architekturfolgen-im-code)
10. [Verworfene Ideen](#10-verworfene-ideen)
11. [Entschiedene Streitfragen](#11-entschiedene-streitfragen)
12. [Befunde außerhalb des Auftrags](#12-befunde-außerhalb-des-auftrags)

---

## 1. Die Messungen, die den Entwurf bestimmt haben

Eigene Messungen vom 2026-09-13, ausschließlich lesend, sieben Requests, alle innerhalb der
freigegebenen Pfadliste. `/reports/create/bwa` und `/reports/create/sums` wurden **nicht**
aufgerufen. Alle Geschäftsdaten sind hier anonymisiert oder auf Kennzahlen verdichtet.

| Nr. | Aufruf | Ergebnis |
| --- | --- | --- |
| M1 | `/settings/get/postingaccounts`, `limit=1000`, `offset=1000` | 281 Zeilen, 52.064 Byte, 185 Byte je Zeile. Aufteilung: 200 `postingaccount`, 22 `debtor`, 57 `creditor`, je 1 `debtor collective` und `creditor collective` |
| M2 | `/receipts/get`, `inbound`, `limit=5`, `payment_status=paid` | 5 Zeilen. **Alle tragen `amount_paid` = "0.00", obwohl `payment_date` gefüllt ist.** Kein Feld `currency` in der Listenantwort. Zusätzliches, in keinem Entwurf genanntes Feld `amount_paid_fixed` |
| M3 | `/receipts/get`, `inbound`, `limit=500`, `payment_status=unpaid` | 10 Zeilen, 4.166 Byte (417 Byte je Zeile). Alle mit `payment_date` = null, alle mit `amount_paid` = "0.00" und `amount_paid_fixed` = "0.00". `due_date` nur bei 2 von 10 gefüllt |
| M4 | `/accounts/get` | 5 Zeilen, 343 Byte. Ein Kontoname trägt eine Kontonummer im Klartext |
| M5 | `/reports/get/sums/ledger`, Konto 1200, 2020-01-01 bis 2026-09-13 | 828 Zeilen, 598.637 Byte, **723 Byte je Zeile**, 24 Felder. Schachtelung `report_sums_postingaccount_ledger.postingaccountLedger`. `integrityError` = false, `standard_chart` = "skr03" in jeder Zeile |
| M6 | `/reports/get/sums/ledger`, Konto 1200, 2025-01-01 bis 2026-09-13 | 90 Zeilen, 64.581 Byte. **Dieselbe Buchung trägt in beiden Zeiträumen denselben fortgeschriebenen Saldo** (824,77 Soll), und die letzte Zeile ist in beiden Abfragen identisch (45.097,03 Soll) |
| M7 | `/transactions/get`, `account=1201`, `limit=3` | 3 Zeilen, 632 Byte (211 Byte je Zeile), 6 Felder. **Kein Feld `account`** in der Zeile |

### Was diese Messungen entschieden haben

**M1: Der Kontenrahmen dieses Mandanten hat genau 1.281 Einträge** und ist damit in zwei
Seiten vollständig lesbar. Einer der drei Entwürfe hatte die Gesamtzahl als nicht ermittelbar
geführt, einer hatte 1.281 behauptet; die Zahl ist jetzt gemessen. Vollständig ausgeben lässt
sie sich trotzdem nicht: 1.281 Zeilen sind rund 248 KB und damit grob 60.000 Token, also das
Dreifache der harten Antwortgrenze von 20.000 Token. `bb_masterdata_search` gibt den
Kontenrahmen deshalb nie vollständig aus, sondern filtert oder zählt ihn serverseitig.

M1 zeigt außerdem, dass die Personenkonten mit Nummer und Name **bereits im Kontenrahmen
stehen** (`type` = `debtor`, `creditor`, `debtor collective`, `creditor collective`). Die
Endpunkte `/settings/get/debtors` und `/settings/get/creditors` liefern zusätzlich Adresse und
Bankverbindung, und die braucht die Frage „welche Kontonummer hat Firma X" nicht. Zwei
Entwürfe hatten beide Endpunkte in das Stammdatenbündel aufgenommen; sie entfallen und sparen
zwei Requests und rund 14 KB internen Verkehr je Aufruf.

**M2 und M3 sind der folgenreichste Befund dieser Vorlage.** `amount_paid` ist in diesem
Mandanten durchgehend "0.00", und zwar auch bei Belegen, die BuchhaltungsButler selbst über
`payment_status=paid` als bezahlt ausweist und bei denen `payment_date` gefüllt ist. Ein Bündel,
das den offenen Betrag als `amount` minus `amount_paid` rechnet, meldet **jede bezahlte
Rechnung als vollständig offen**. In einer Buchhaltung ist das der teuerste Fehler, den dieser
Server anrichten könnte, und er sähe für die Nutzerin wie eine plausible Mahnliste aus. Einer
der drei Entwürfe hatte genau diese Rechnung vorgesehen.

**Verbindliche Folge: Kein Bündel leitet Zahlungsstatus oder offenen Betrag aus `amount_paid`
oder `amount_paid_fixed` ab.** Verlässlich sind genau zwei Dinge, beide gemessen: der
Serverfilter `payment_status` mit den Werten `paid` und `unpaid`, und das Feld `payment_date`
(null genau dann, wenn `payment_status=unpaid` greift). Teilzahlungen sind über diese API in
der Belegliste **nicht erkennbar**, und kein Bündel behauptet, sie zu erkennen.

M3 klärt zugleich die vom Orchestrator vorgeschlagene Idee „offene Belege": Die Frage kostet
einen einzigen gefilterten Aufruf je Richtung, nicht einen Aufruf je Beleg. Das vorgeschlagene
N+1-Bündel entfällt ersatzlos, es hätte bei diesem Mandanten über 500 Requests abgesetzt und
das Minutenlimit fünffach gerissen.

M2 zeigt drittens, dass die **Belegliste kein Feld `currency` führt**. Eine Summenbildung je
Währung über die Liste ist damit unmöglich; ein Entwurf hatte sie vorgesehen. Die
Fremdwährungsfelder `amount_original` und `currency_original` gibt es nur am Einzelabruf
(Live-Befund 2). Summen über Listenbeträge werden deshalb ohne Währungsaufteilung gebildet
und als solche benannt.

**M5 und M6 klären die wichtigste offene Frage aller drei Entwürfe.** Einer hatte sie
ausdrücklich als ungeklärt an den Projektinhaber gegeben: Enthält `balanceAfterAbsolute` den
Bestand vor `date_from`, oder schreibt es nur innerhalb des Zeitraums fort? Die Antwort ist
**ja, der Eröffnungssaldo ist enthalten**. Dieselbe Buchung (`id_by_customer` 1902) trägt in
der Abfrage ab 2020-01-01 und in der Abfrage ab 2025-01-01 denselben Wert 824,77 Soll, und die
Schlusszeile ist in beiden Abfragen identisch. Der Saldo der letzten Zeile ist damit ein echter
Kontostand und nicht bloß eine Bewegungssumme. Erst dieser Befund macht `bb_balances_get`
vertretbar; ohne ihn wäre das Werkzeug eine Zahl mit Vorbehalt gewesen, und eine Zahl mit
Vorbehalt wird in der Praxis ohne den Vorbehalt zitiert.

M5 belegt zugleich einen gemessenen Mangel des ausgelieferten `bb_reports_get_ledger`: 828
Zeilen zu je 723 Byte sind rund 146.000 Token. Die generische Kürzung schneidet das Ende ab,
und **im Ende steht der Saldo**. Das ausgelieferte Werkzeug wirft bei einem langen Zeitraum
also genau die Zeile weg, wegen der man es aufgerufen hat.

**M7 bestätigt: Die Zahlungszeile trägt kein Kontofeld.** Ohne den gesendeten Filter ist keine
Zahlung einem Konto zuzuordnen. Der Filter `account` funktioniert, die Antwort schweigt dazu.
`bb_records_collect` sagt das in der Antwort ausdrücklich, statt eine Zuordnung zu behaupten,
die in den Daten nicht steht.

---

## 2. Der Satz: fünf Bündel

| Name | Länge | Klasse | Wirkung | Deckt ab |
| --- | --- | --- | --- | --- |
| `bb_masterdata_search` | 20 | R | lesend | N3c, N4 Stammdatensuche |
| `bb_records_collect` | 18 | R | lesend | N3b, N4 Kontoauszug nach Name, N4 offene Belege, N4 beide Belegrichtungen |
| `bb_assignments_get` | 18 | R | lesend | N3d |
| `bb_reports_run` | 14 | AR | anlegend | N3a |
| `bb_balances_get` | 15 | R | lesend | Kontostand, aus M6 begründet |

Alle vier Abläufe aus N3 sind abgedeckt, und zwar mit vier Werkzeugen; das fünfte kommt aus
M6 hinzu.

### Warum genau diese fünf

Prüfstein war die Vorgabe des Projektinhabers: Ein Werkzeug, dessen Gewinn sich nicht in einem
Satz begründen lässt, gehört nicht dazu.

- `bb_masterdata_search`: Es macht die Frage „welche Nummer hat das Konto X" überhaupt erst
  beantwortbar, weil kein Stammdatenendpunkt einen Namensfilter kennt und der Kontenrahmen
  dieses Mandanten mit gemessenen 1.281 Einträgen rund 60.000 Token wiegt.
- `bb_records_collect`: Es macht Anzahl und Summe über einen Bestand beantwortbar, den der
  Client nicht in den Kontext ziehen kann, weil eine einzige volle Belegseite gemessen rund
  209 KB wiegt.
- `bb_assignments_get`: Es beantwortet „welcher Beleg gehört zu dieser Abbuchung" in einem
  Aufruf statt in zweien, und zwar aus beiden Richtungen mit einer einzigen Definition.
- `bb_reports_run`: Es erledigt die Warteschleife, die ein Modell nicht schlafend durchstehen
  kann, und verhindert dabei den Fehler, zu dem `error_code` 8 verleitet, nämlich ein zweites
  `create`, das den gerade laufenden Bericht entwertet.
- `bb_balances_get`: Es ist der einzige Weg zum Kontostand, bei dem die Kürzung nicht genau
  die Zeile wegwirft, in der er steht.

Fünf liegt innerhalb der Empfehlung „drei bis fünf" aus `werkzeugkontext-clients.md` 6b.

### Zwei neue Verben, ausdrücklich entschieden

`tool-design.md` 4.4 führt eine geschlossene Verbliste und verlangt für ein neues Verb eine
Entscheidung statt eines Ad-hoc-Wortes. Zwei kommen hinzu, mehr nicht:

| Verb | Bedeutung | Art |
| --- | --- | --- |
| `run` | erzeugt eine Auswertung und liefert sie im selben Aufruf fertig zurück, einschließlich des Wartens auf die serverseitige Berechnung | schreibend |
| `collect` | liest eine Liste über alle Seiten bis zu einer harten Obergrenze und weist die erreichte Abdeckung aus | lesend |

`scan` wurde geprüft und verworfen: Es wäre ein Beinahe-Synonym zu `collect` und hätte die
geschlossene Liste um ein drittes Wort für dieselbe Sache erweitert. Dass die Vorgabe der
Antwort die Kennzahlen und nicht die Zeilen sind, gehört in die Beschreibung und in den
`bundle`-Block, nicht in das Verb. `collect` ist zudem die Wortwahl des Projektinhabers
selbst, der in N3b von einer „vollständigen Liste über alle Seiten" spricht.

`bb_masterdata_search`, `bb_assignments_get` und `bb_balances_get` kommen mit den vorhandenen
Verben `search` und `get` aus.

### Namenslänge, nachgerechnet

Clients präfixieren. Die Konstante `SERVER_NAME` in `src/cli/clients/types.ts` ist seit dem
2026-09-13 `bbutler`, das Präfix lautet also `mcp__bbutler__` und ist 14 Zeichen lang. Die
Messages API lässt höchstens 64 Zeichen zu.

**Die Tabelle nennt beide Stände**, weil der frühere Name `buchhaltungsbutler` die Rechnung des
Entwurfs trägt und die Kürzung erst der Befund B1 ausgelöst hat.

| Bündel | Name | mit `mcp__buchhaltungsbutler__` | mit `mcp__bbutler__` | Abstand zu 64 |
| --- | --- | --- | --- | --- |
| `bb_masterdata_search` | 20 | 45 | 34 | 30 |
| `bb_records_collect` | 18 | 43 | 32 | 32 |
| `bb_assignments_get` | 18 | 43 | 32 | 32 |
| `bb_balances_get` | 15 | 40 | 29 | 35 |
| `bb_reports_run` | 14 | 39 | 28 | 36 |

Der knappste Abstand ist 30 Zeichen; schon vor der Kürzung waren es 19. Die Bündel tragen also
reichlich Luft. Der ausgelieferte Satz tat das **nicht** — dort lag der Verstoß, siehe
[Abschnitt 12](#12-befunde-außerhalb-des-auftrags).

---

## 3. Der gemeinsame Bündelvertrag

Ein Bündel ist eine Fassade vor mehreren Aufrufen und erbt jede Fehlerquelle seiner Teile. Der
Entwurf entscheidet sich deshalb nicht daran, was er im Erfolgsfall spart, sondern daran, was
er im Teilerfolg behauptet.

**Leitsatz: Ein Bündel gibt niemals eine Teilmenge als Ganzes aus.**

Jede Bündelantwort trägt in `structuredContent` einen Block `bundle`, und zwar immer, mit
denselben Schlüsseln, ob vollständig oder nicht, ob mit Fehlern oder ohne:

```
bundle: {
  complete: boolean,                     // Pflichtfeld im outputSchema
  stopped_because: null | "page_limit" | "row_limit" | "rate_limit"
                        | "response_size" | "error",
  steps: [ { no, endpoint, state: "ok" | "failed" | "skipped",
             rows, duration_ms, error? } ],
  api_calls: number,
  api_calls_limit: number,
  gaps: [ { what, why, next_step } ],    // leer genau dann, wenn complete
  written: string,                       // leer: nichts geschrieben.
                                         // sonst Klartext, was verändert wurde
  continuation: { … } | null
}
```

Acht Regeln hängen daran, und sie sind der eigentliche Entwurf.

**R1 — Keine Kennzahl ohne Vollstaendigkeit.** Summen, Anzahlen und Zeitraumgrenzen werden nur
ausgegeben, wenn das Blättern das Ende erreicht hat. Sonst nennt das Bündel ausschließlich die
Zahl der gelesenen Zeilen und das erreichte `offset`. Eine Zahl mit Fußnote wird zitiert, die
Fußnote nicht.

**R2 — Der Feldname trägt den Vorbehalt.** Kennzahlen heißen `rows_read` und
`sum_of_rows_read`, niemals `total_rows` oder `total_sum`. Ein Modell, das
nur `structuredContent` liest, kann einen Vorbehalt im Feldnamen nicht überlesen. Es gibt in
dieser API keine Gesamttrefferzahl, also wird keine erfunden und keine hochgerechnet.

**R3 — Das Ende einer Liste wird ausschließlich daran erkannt, dass eine Seite weniger Zeilen
liefert als angefordert**, nie am Feld `rows`. Das ist die bestehende Regel aus
`src/response/pagination-note.ts` und gilt unverändert. Endet der Bestand genau auf einer
Seitengrenze, gilt `complete` = false. Die Richtung des Irrtums ist bewusst konservativ.

**R4 — Kein Negativbefund ohne Vollabdeckung.** Solange ein Suchraum nicht vollständig
durchsucht ist, sagt die Antwort nie „nicht gefunden", sondern „in den durchsuchten N
Einträgen kein Treffer; ein Treffer außerhalb ist nicht ausgeschlossen".

**R5 — `null` heißt nicht ermittelt, das leere Array heißt nachweislich keine.** Zwei
getrennte Zustände, die nie vermischt werden. Ein Bündel, das sie verwechselt, meldet eine
bezahlte Rechnung als offen, und das Ergebnis ist eine doppelte Zahlung. Wo diese
Unterscheidung trägt, steht sie zusätzlich in einem eigenen Statusfeld, damit zwei unabhängige
Signale dieselbe Tatsache sagen.

**R6 — Warnung vor Daten.** Die Reihenfolge des Textblocks aus `src/response/build.ts` bleibt:
erst Lücken, dann Herkunft, dann Daten, dann Bestand, dann Anschluss. Ist `complete` false,
ist die erste Zeile des Textblocks „Unvollständig: abgebrochen bei offset N nach M Seiten,
Grund X." Nicht als Fußnote, nicht am Ende. Ein Modell liest den Anfang zuverlässiger als das
Ende, und ein Hinweis hinter einer Tabelle mit 50 Zeilen ist praktisch nicht vorhanden.

**R7 — Jede Lücke trägt den konkreten Einzelaufruf, der sie schließt**, mit Werkzeugname und
eingesetzten Argumenten. Die 54 Endpunktwerkzeuge bleiben nach N1 unverändert bestehen und sind
damit die Rückfallebene jedes Bündels. Ein Bündel ist nie die einzige Tür.

**R8 — Ein Bündel erfindet keine Zusammenführung.** Wo die API je Teilmenge blättert, etwa über
beide Belegrichtungen, bleibt der Bestandsstand je Teilmenge getrennt. Ein gemeinsames `offset`
über zusammengefügte Listen wäre frei erfunden. Jede Zeile trägt ihre Herkunft, bei Belegen
also `list_direction`: Der Unterschied zwischen Eingangs- und Ausgangsrechnung ist fachlich der
Unterschied zwischen Verbindlichkeit und Forderung.

### Kein vierter Zustandssatz

`src/errors/render.ts` führt genau drei Zustandssätze. Ein Entwurf hat zu Recht festgestellt,
dass keiner davon auf ein teilweise ausgeführtes Bündel passt, und einen vierten Satz
vorgeschlagen. Er wird **nicht** gebaut, und der Grund löst das Problem sauberer:

Die Zustandssätze stehen in **Fehlermeldungen** (`isError: true`). Ein Bündel mit Teilerfolg
ist aber kein Fehler, sondern ein Erfolg mit `complete` = false und gefüllten `gaps`.
Es rendert also gar keine Fehlermeldung und braucht keinen Zustandssatz. Der einzige Fall, in
dem ein Bündel wirklich als Fehler endet, ist der gescheiterte erste Aufruf, und dort passen
`STATE_NOTHING_SENT` beziehungsweise `STATE_REJECTED` genau.

Auch der heikelste Fall bleibt damit abgedeckt: Gelingt bei `bb_reports_run` das `create` und
scheitert danach das Abholen, **ist das ein Erfolg** mit `complete` = false,
`report_id_by_customer`, `bundle.written` im Klartext und einer Lücke, die
`bb_reports_get_bwa` mit genau dieser Kennung nennt. Die teure, ersetzende Arbeit ist dann
getan und darf nicht hinter einer Fehlermeldung verschwinden. `src/errors/render.ts` wird
nicht angefasst; 1361 Tests ruhen darauf.

### Eine notwendige Änderung an `src/response/truncate.ts`

Der Satz in `truncationNote` lautet heute: „Auf Seiten der API ist nichts verloren gegangen."
Er ist richtig, solange eine vollständig gelesene Liste für die Anzeige gekürzt wird. Kürzt ein
Bündel einen **ohnehin unvollständigen** Präfix, wird er zur Unwahrheit.

**Festlegung:** Bei `bundle.complete` = false wird dieser Satz unterdrückt und durch zwei
getrennte Sätze ersetzt, einen über die Anzeige und einen über den Bestand. Kürzen und
Nichtholen sind zwei verschiedene Aussagen und bekommen zwei verschiedene Sätze. Das ist eine
benannte, kleine Änderung an einer bestehenden Datei und keine Umgehung.

---

## 4. Die fünf Werkzeuge im Einzelnen

### 4.1 `bb_masterdata_search`

**Klasse R.** `readOnlyHint` true, `destructiveHint` false, `idempotentHint` true,
`openWorldHint` true. Kein Pflichtsatz (die 15 lesenden Werkzeuge tragen keinen).
Beschreibungsstufe 1. Aufrufobergrenze 5.

**Zweck.** Findet ein Zahlungskonto, ein Sachkonto, einen Debitor, einen Kreditor oder eine
Kostenstelle über den Namen, ohne dass man vorher wissen muss, in welcher Liste es geführt
wird. Ohne Suchbegriff liefert dasselbe Werkzeug den Arbeitskontext für den Sitzungsanfang.

**Eingabeschema, vollständig.**

| Feld | Typ | Pflicht | Vorgabe | Bedeutung |
| --- | --- | --- | --- | --- |
| `query` | string, 2 bis 100 Zeichen | nein | — | Teilzeichenkette, ohne Beachtung der Groß- und Kleinschreibung, geprüft gegen `name` und `postingaccount_number` beziehungsweise `code`. Ohne Angabe kommt der Überblick statt der Treffer |
| `areas` | Array von enum `payment_accounts`, `posting_accounts`, `debtors`, `creditors`, `cost_locations` | nein | alle fünf | Grenzt ein. `posting_accounts`, `debtors` und `creditors` stammen aus demselben Endpunkt und kosten gemeinsam nicht mehr als einer davon |
| `max_hits` | integer 1 bis 100 | nein | 20 | Höchstzahl der Treffer **je Bereich**, nicht insgesamt. Serverseitig, geht nicht an die API |
| `response_format` | der bestehende Baustein `concise`/`detailed` | nein | `concise` | |

**Endpunkte und Reihenfolge.**

1. `/accounts/get` (ein Aufruf, keine Paginierung, gemessen 5 Zeilen und 343 Byte).
2. `/cost-locations/get` mit `limit=1000` (ein Aufruf).
3. `/settings/get/postingaccounts` mit `limit=1000`, seitenweise bis eine Seite weniger als
   1000 Zeilen liefert, **höchstens 3 Seiten**. Gemessen sind es bei diesem Mandanten genau 2.

Gefiltert, gezählt und gekappt wird ausschließlich serverseitig; die Rohzeilen erreichen den
Kontext nie.

**Antwortform.** Neben `bundle` je Bereich ein eigener Block mit `rows_read`,
`complete` und `hits[]`. Für die Sachkonten kommt ohne Suchbegriff eine **Zusammenfassung
statt einer Liste**: `rows_read`, `complete`, Aufriss nach `type` und `subtype` sowie
Blöcke über die Tausenderstelle der Kontonummer mit je drei Beispielnamen. Dazu ein
`notes`-Block, der Konto, Sachkonto, Debitor und Kreditor gegeneinander abgrenzt und sagt,
welches Werkzeug für welche Art zuständig ist.

**Risiken und wie sie behandelt werden.**

1. **Der Kontenrahmen wird nie vollständig ausgegeben.** Gemessen 1.281 Zeilen, rund 248 KB,
   grob 60.000 Token, also das Dreifache der harten Antwortgrenze von 20.000 Token. Die Antwort
   sagt wörtlich, dass die Einzelkonten nicht enthalten sind und über `query` oder über
   `bb_postingaccounts_search` kommen. Ein Bündel, das N3c wörtlich als „alles in einem Aufruf"
   umsetzte, würde entweder das Fenster sprengen oder stillschweigend kürzen; beides ist
   schlechter als die ehrliche Absage.
2. **Falsches „nicht gefunden".** Bei mehr als 3.000 Sachkonten bleibt der Suchraum
   unvollständig durchsucht. Dann greift R4 wörtlich, und die Lücke nennt
   `bb_postingaccounts_search` mit dem nächsten `offset`.
3. **Ungleiche Vollständigkeit je Bereich, und sie ist gemessen.** `/accounts/get` kennt weder
   `limit` noch `offset` und ist damit konstruktiv vollständig. `/cost-locations/get` lieferte
   in zwei unabhängigen Messungen 0 Zeilen. `/settings/get/postingaccounts` brauchte zwei
   Seiten. Diese Befunde stehen einzeln in der Antwort und werden nicht zu einem Gesamtbefund
   verrechnet.
4. **Zu weiter Suchbegriff.** Harte Trefferkappung je Bereich. Bei Kappung steht im jeweiligen
   Bereich `complete` = false mit `stopped_because` = `row_limit` und der Zahl der
   insgesamt passenden Zeilen. Diese Zahl ist ehrlich, weil der Server wirklich alle gelesenen
   Seiten durchsucht hat.
5. **Die Suche findet nur, was im Namen des Kontos steht.** Der Beleg führt seine Gegenpartei
   als Freitext in `counterparty`, und die beiden können abweichen. Bei null Treffern nennt die
   Antwort das ausdrücklich und verweist auf `bb_records_collect` mit `counterparty` als den
   anderen Weg.
6. **Zwischenspeicher.** Drei der vier speicherfähigen Werkzeuge des Servers stehen hinter
   denselben Endpunkten; bei eingeschaltetem `BB_MCP_CACHE_TTL_MS` gilt die bestehende Regel
   unverändert. `/accounts/get` ist nach `src/cache/store.ts` ausdrücklich **nie** speicherfähig
   und wird jedes Mal frisch geholt. Das Bündel legt nichts zusätzlich ab.

**Begründung.** Zwei Aufträge in einem Werkzeug, und die Zusammenlegung ist kein Sparzwang,
sondern sachlich richtig: Es ist derselbe Vorgang, einmal ohne und einmal mit Suchbegriff.
Damit deckt es N3c und die Stammdatensuche aus N4 mit einer Definition ab und spart gegenüber
zwei Werkzeugen rund 1.000 Token. Der Nutzen ruht nicht auf gesparten Runden, sondern auf einer
gemessenen Lücke der API: Für die großen Stammdatenlisten gibt es keinen Namensfilter, und
genau der Mensch, den N2 beschreibt, kennt Kontonummern nicht auswendig.

---

### 4.2 `bb_records_collect`

**Klasse R.** `readOnlyHint` true, `destructiveHint` false, `idempotentHint` true,
`openWorldHint` true. Kein Pflichtsatz. Beschreibungsstufe 1. Aufrufobergrenze 10.

**Zweck.** Läuft serverseitig über alle Seiten von Belegen, Zahlungen oder Buchungen und
liefert Anzahl und Summen statt aller Zeilen; Einzelzeilen nur bis zu einer ausdrücklich
gesetzten Grenze.

**Eingabeschema, vollständig.**

| Feld | Typ | Pflicht | Vorgabe | Bedeutung |
| --- | --- | --- | --- | --- |
| `resource` | enum `receipts`, `transactions`, `postings` | **ja** | — | |
| `list_direction` | enum `inbound`, `outbound`, `both` | nein | `both` | Nur bei `resource=receipts`. Bildet die Pflichtangabe `list_direction` der API ab und macht die Suche über beide Richtungen zur Vorgabe |
| `date_from` | string YYYY-MM-DD | bedingt | — | Bei `resource=postings` Pflicht, weil der Endpunkt es verlangt; sonst optional und dringend empfohlen |
| `date_to` | string YYYY-MM-DD | bedingt | — | wie `date_from` |
| `account` | string | nein | — | Kontoname **oder** Kontonummer. Nur bei `resource=transactions`. Trägt den Namen des Body-Parameters der API und entspricht `payment_account_number` in `bb_transactions_search`, nimmt aber zusätzlich einen Namen entgegen, der über `/accounts/get` aufgelöst wird |
| `payment_status` | enum `paid`, `unpaid` | nein | — | Nur bei `resource=receipts`. Reicht den gemessenen Filter `payment_status` durch; `unpaid` ist die Antwort auf „offene Belege" |
| `counterparty` | string | nein | — | Nur bei `resource=receipts`, Filter `counterparty` der API |
| `invoicenumber` | string | nein | — | Nur bei `resource=receipts`, Filter `invoicenumber` der API |
| `group_by` | enum `none`, `month`, `counterparty` | nein | `month` | Serverseitig |
| `max_rows` | integer 0 bis 200 | nein | **0** | Null heißt: nur Kennzahlen, keine Einzelzeilen. Für eine Kontoauszugsansicht auf 50 setzen |
| `response_format` | der bestehende Baustein | nein | `concise` | |

Die Vorgabe `max_rows` = 0 ist der wichtigste Tokenentscheid dieser Vorlage. „Alle Zeilen"
ist bei realen Beständen keine erfüllbare Zusage, „die Auswertung über alle gelesenen Zeilen"
ist eine.

Bewusst **nicht** im Schema: `order`, `include_offers`, `deleted`, `due_date`,
`date_since_last_modified`, `posting_status`, `id_by_customer_from`, `id_by_customer_to`,
`payment_account_number` bei Buchungen. Wer sie braucht, nimmt das Endpunktwerkzeug. Ein
Bündel ist die Abkürzung für den häufigen Fall, keine Obermenge; die volle Feldliste hätte die
Definition um mehr als ein Drittel verteuert. Die Beschreibung sagt das mit dem Verweis auf
`bb_receipts_search`, `bb_transactions_search` und `bb_postings_search`.

**Ein Seitenlimit wird nicht nach außen gegeben.** Die Maxima stehen fest im Code je Bereich:
Belege und Zahlungen 500, Buchungen 1000. Ein `limit` über dem Maximum wird von der API
abgelehnt und nicht gekappt, und die Maxima sind je Bereich verschieden und im JSON Schema
nicht ausdrückbar.

**Antwortform.** `bundle`, dazu `resource`, `filter` (die wirksamen Filter einschließlich der
aufgelösten Kontonummer), `rows_read`, `sum_of_rows_read`, `groups[]` und
`rows[]` (höchstens `max_rows`, projiziert nach der bestehenden `concise`-Liste des
jeweiligen Suchwerkzeugs). Bei `resource=receipts` zusätzlich je Richtung ein eigener
Bestandsstand nach R8.

**Risiken und wie sie behandelt werden.**

1. **Der Glaube an Vollständigkeit** ist die Kerngefahr. Vier Schichten dagegen, alle
   verbindlich: `complete` und `stopped_because` als Pflichtfelder im `outputSchema`
   (R1); die Feldnamen tragen den Vorbehalt (R2); bei `complete` = false steht der Grund in
   der ersten Zeile des Textblocks (R6); `continuation` nennt den exakten Folgeaufruf mit
   `offset` und wirksamen Filtern (R7).
2. **Zahlungsstatus niemals aus `amount_paid`.** Gemessen (M2, M3) ist das Feld auch bei
   bezahlten Belegen "0.00". Verlässlich sind allein der Serverfilter `payment_status` und das
   Feld `payment_date`. Die Beschreibung sagt ausdrücklich, dass Teilzahlungen über diese API
   in der Belegliste **nicht** erkennbar sind, statt eine Genauigkeit zu versprechen, die die
   Daten nicht hergeben.
3. **Keine Summe je Währung.** Gemessen führt die Belegliste kein Feld `currency`. Die Summe
   wird über die gelieferten Beträge gebildet und als solche benannt; die Fremdwährungsfelder
   gibt es nur am Einzelabruf. Gerechnet wird in Dezimalarithmetik über die Zeichenkette,
   nie in Binär-Gleitkomma.
4. **Zahlungen tragen kein Kontofeld** (M7). Die Antwort sagt wörtlich, dass die Zuordnung
   allein aus dem gesendeten Filter folgt. Ist `account` nicht gesetzt, entfällt der Kontoblock,
   und die Antwort sagt, dass die Zeilen keinem Konto zugeordnet sind.
5. **Die Namensauflösung rät nie.** Mehrere Treffer beenden den Aufruf **vor** dem ersten
   Listenaufruf mit der Kandidatenliste; kein Treffer ebenso, mit der vollständigen Kontenliste
   (gemessen 5 Zeilen, 343 Byte, also billig genug, sie immer mitzugeben). Ein Agent, der
   „PayPal" hört und 1200 rät, bekommt eine plausible, vollständige, falsche Liste, und in der
   Buchhaltung ist eine falsche Antwort teurer als eine fehlende. Gemessen enthält ein
   Kontoname eine Kontonummer im Klartext (M4), deshalb wird ein rein numerisches `account`
   zuerst als Kontonummer behandelt und nur bei Fehlschlag als Namensbestandteil; die Antwort
   sagt, welcher Weg gegriffen hat.
6. **Doppelte und übersprungene Zeilen.** `offset`-Paginierung über lebende Daten kann Zeilen
   doppeln oder überspringen, wenn zwischen zwei Seiten geschrieben wird; die API kennt keinen
   Cursor. Das Bündel entdoppelt über `id_by_customer` und **meldet die Zahl der verworfenen
   Doppel**. Eine Zahl größer null ist der Beweis, dass sich die Liste unter dem Blättern
   bewegt hat, und setzt `complete` auf false. Das ist belastbare Evidenz statt einer
   Vermutung.
7. **Feldverwechslung zwischen den Bereichen.** Jede Kombination außerhalb der Tabelle oben
   wird vor dem ersten Request abgelehnt und erklärt, nicht stillschweigend ignoriert. Die
   bedingten Pflichtfelder werden über Querprüfungen nach dem Muster Q1 bis Q9 aus
   `tool-design.md` 4.7 erzwungen, nicht über `oneOf`.
8. **`list_direction=both` verdoppelt die Aufrufzahl.** Beide Richtungen laufen gegen dieselbe
   Obergrenze und werden in `api_calls` ausgewiesen.

**Begründung.** Es deckt N3b für alle drei geforderten Ressourcen mit einer Definition ab und
nimmt zusätzlich drei Vorschläge aus N4 als Parameter auf: den Kontoauszug nach Kontoname über
`account`, die offenen Belege über `payment_status`, die Suche über beide Belegrichtungen über
`list_direction`. Vier Ideen, eine Definition. Und es ist das einzige Werkzeug des Servers, das eine
Frage nach Anzahl oder Summe überhaupt beantworten kann, ohne 200 KB in den Kontext zu ziehen.

---

### 4.3 `bb_assignments_get`

**Klasse R.** `readOnlyHint` true, `destructiveHint` false, `idempotentHint` true,
`openWorldHint` true. Kein Pflichtsatz. Beschreibungsstufe 2. Aufrufobergrenze 5.

**Zweck.** Liefert einen Beleg oder eine Zahlung samt allen zugeordneten Gegenstücken in einem
Aufruf und beantwortet damit „welcher Beleg gehört zu dieser Abbuchung" und „welche Zahlung
hängt an dieser Rechnung".

**Eingabeschema, vollständig.**

| Feld | Typ | Pflicht | Vorgabe | Bedeutung |
| --- | --- | --- | --- | --- |
| `receipt_id_by_customer` | integer | genau eines von beiden | — | Die mandantenbezogene Belegnummer |
| `transaction_id_by_customer` | integer | genau eines von beiden | — | Die mandantenbezogene Nummer einer Zahlung |
| `confirmed_only` | boolean | nein | false | Wird an den Zuordnungsendpunkt durchgereicht |
| `response_format` | der bestehende Baustein | nein | `concise` | |

Genau eines der beiden Kennungsfelder muss gesetzt sein; erzwungen über eine Querprüfung nach
dem Muster Q1 bis Q9. Keines oder beide sind eine Ablehnung vor dem ersten Request mit
`STATE_NOTHING_SENT`.

Bewusst **nicht** im Schema: `get_file`. Der Dateiinhalt kommt nie mit, er ist base64 und
sprengt jede Antwort; dafür gibt es `bb_receipts_get`.

**Endpunkte und Reihenfolge.**

- Beleg als Einstieg: `/receipts/get/{wert}`, dann `/receipts/assigned-transactions/get`.
- Zahlung als Einstieg: `/transactions/get/{wert}`, dann `/transactions/assigned-receipts/get`.
- **Bedingte Anreicherung, höchstens 3 Aufrufe**: Nur wenn eine zurückgegebene Zuordnungszeile
  die fachlich nötigen Felder (`counterparty`, `amount`, `date`) **tatsächlich nicht** trägt,
  holt das Bündel für bis zu drei solcher Zeilen `/receipts/get/{wert}` nach.

Der Pfad ist die gemessene Segmentform aus Live-Befund 1; das Segment `id_by_customer` entfällt,
und der Wert wird vor dem Einsetzen URL-kodiert. Ein Body-Feld `id_by_customer` wird nicht
gesendet.

**Warum bedingt und nicht fest.** Die Spezifikation führt für
`/transactions/assigned-receipts/get` nur `id_by_customer` und `filename`, während
`/receipts/assigned-transactions/get` laut Spezifikation `to_from`, `amount`, `booking_date`,
`value_date` und `purpose` mitliefert. Die Feldmenge des ersten Endpunkts ist in diesem Projekt
**nicht gemessen**, und Live-Befund 2 hat bereits gezeigt, dass die Spezifikation Antwortfelder
unterschlägt. Eine Anreicherung, die an der tatsächlich zurückgekommenen Zeile entscheidet, ist
unter beiden Ausgängen richtig und kostet nichts, wenn die Antwort ohnehin reich ist. Ein fest
verdrahtetes „immer anreichern" verbrennt Requests, sobald der Anbieter den Endpunkt ergänzt;
ein festes „nie anreichern" beantwortet die Frage der Buchhalterin nicht, weil ein Dateiname
weder Gegenpartei noch Betrag nennt.

**Antwortform.** `bundle`, dazu `kind` (`receipt` oder `transaction`), `record` (der angefragte
Datensatz, projiziert), `assignments` (Array **oder** null), `assignments_status`
(`loaded`, `error`, `not_requested`), `assignment_count`, `enriched` und
`not_enriched`.

**Risiken und wie sie behandelt werden.**

1. **Die gefährlichste Verwechslung dieses Werkzeugs ist leer gegen unbekannt**, und sie ist
   der Grund für R5. Scheitert der Zuordnungsabruf, während der Hauptsatz geladen wurde, darf
   die Antwort auf keinen Fall so aussehen, als habe der Beleg keine Zuordnungen: `assignments`
   ist dann **null**, nicht ein leeres Array, `assignments_status` ist `error`, und im
   Textblock steht „Ob Zahlungen zugeordnet sind, konnte nicht ermittelt werden" statt „keine
   Zuordnungen". Eine fälschlich als unbezahlt gemeldete Rechnung führt zu einer doppelten
   Zahlung.
2. **Ein Beleg ohne Zuordnung ist kein Fehlerfall.** Gemessen antwortet
   `/receipts/assigned-transactions/get` dann mit `success` = true, `rows` = 0 und leerem
   `data`. Damit ist „keine Zuordnung" ein sauber unterscheidbarer Positivbefund; die in
   `docs/api/receipts.md` Abschnitt 4 als nicht verifiziert geführte Annahme ist bestätigt.
3. **Scheitert der Hauptabruf, wird der zweite Schritt gar nicht erst abgesetzt.** Eine
   Zuordnungsliste zu einem Vorgang, den es nicht gibt, ist irreführender als gar keine
   Antwort.
4. **Getrennte Nummernräume.** `receipt_id_by_customer` und `transaction_id_by_customer` sind
   beide mandantenbezogen, stammen aber aus verschiedenen Räumen; Beleg 1590 und Zahlung 1590
   sind verschiedene Dinge. Gemessen kommt `id_by_customer` bei Belegen als String und bei
   Zahlungen als Zahl (Live-Befund 3). Die Antwort nennt deshalb immer ausdrücklich `kind`, und
   die Parameterbeschreibungen sagen, woher die jeweilige Nummer stammt.
5. **Der Bestätigungsstatus der Zuordnung steht nicht in der Antwort.** Das Bündel behauptet
   ihn nicht und sagt, dass `confirmed_only` lediglich filtert, aber keinen Status ausweist.
6. **Ausdrücklich benannte Grenze:** Das Werkzeug sagt **nicht**, ob der Vorgang gebucht ist.
   `/postings/get` kennt keinen Filter auf `receipt_id_by_customer` oder
   `transaction_id_by_customer`, obwohl die Felder in der Antwort stehen. Der Anschlusssatz
   verweist auf `bb_records_collect` mit Zeitraum, statt so zu tun, als sähe man es hier.

**Begründung.** Gesetzt nach N3d, und es spart eine Definition: Zwei natürliche Werkzeuge
(Beleg mit Zahlungen, Zahlung mit Belegen) werden über eine Querprüfung zu einem. Die
Parametermengen sind deckungsgleich, es entsteht also kein verstecktes Verhalten. Der
Rundengewinn ist mit einer Runde der kleinste des Satzes; er greift dafür bei praktisch jeder
Rückfrage zu einem einzelnen Vorgang, und das ist nach dem Mahnwesen die häufigste Handarbeit
einer Buchhaltung.

---

### 4.4 `bb_reports_run`

**Klasse AR.** `readOnlyHint` **false**, `destructiveHint` **true**, `idempotentHint` false,
`openWorldHint` true. Pflichtsatz **U7**. Beschreibungsstufe 1. Aufrufobergrenze 10.
Im Nur-Lesen-Modus gesperrt.

**Zweck.** Erzeugt eine BWA oder eine Summen- und Saldenliste für einen Zeitraum, wartet auf die
serverseitige Berechnung und liefert die fertige Auswertung im selben Aufruf zurück.

**Die Beschreibung sagt im zweiten Satz, dass geschrieben wird.** Verbindlicher Aufbau: erst
was das Werkzeug tut, dann wörtlich, dass `/reports/create/*` den zuvor erzeugten Bericht
desselben Typs im ganzen Mandanten **ersetzt** und dass ein gleichzeitig arbeitender zweiter
Nutzer damit seinen Bericht verliert, dann der Pflichtsatz U7 im Wortlaut aus
`src/registry/mandatory-sentences.ts`. Ein Werkzeug, das sich für die Nutzerin wie eine Abfrage
anfühlt und intern anlegt, muss das in der Beschreibung sagen; die Annotation allein reicht
nicht, weil sie nach `MCP-SCHEMA` ausdrücklich ein Hinweis und keine Durchsetzung ist.

**Eingabeschema, vollständig.**

| Feld | Typ | Pflicht | Vorgabe | Bedeutung |
| --- | --- | --- | --- | --- |
| `report_type` | enum `bwa`, `sums` | **ja** | — | `bwa` ist die Betriebswirtschaftliche Auswertung, `sums` die Summen- und Saldenliste |
| `date_from` | string YYYY-MM-DD | **ja** | — | Erster Tag, eingeschlossen |
| `date_to` | string YYYY-MM-DD | **ja** | — | Letzter Tag, eingeschlossen |
| `base` | enum `date`, `date_delivery_else_date` | nein | `date` | Nur bei `report_type=sums`. `date` ist das Buchungs- oder Rechnungsdatum, `date_delivery_else_date` das Leistungsdatum und hilfsweise das Buchungsdatum |
| `max_wait_seconds` | integer 10 bis 240 | nein | 60 | |
| `response_format` | der bestehende Baustein | nein | `concise` | |

`base` bei `report_type=bwa` wird **abgelehnt**, bevor etwas hinausgeht, mit Begründung. Stilles
Ignorieren wäre verstecktes Verhalten und fachlich gefährlich, weil BWA und Summenliste dann
auf unterschiedlichen Datumsbegriffen ruhten und gegeneinander gerechnet würden.

Bewusst **nicht** im Schema: `file_pdf`, `file_csv`, `archive_export`, `get_files`. Sie sind
fest false. Die Inhalte kommen base64-kodiert und sprengen die Antwortgrenzen um
Größenordnungen; nach `docs/api/berichte.md` 4.6 Punkt 1 ist zudem unklar, ob bei der BWA
überhaupt je eine Datei entsteht. Wer Dateien braucht, nimmt `bb_reports_create_sums` und
`bb_reports_get_sums` einzeln.

**Endpunkte und Reihenfolge.**

1. Prozesslokale Sperre je (`api_key`-Hash, Berichtstyp) nehmen.
2. `/reports/create/bwa` beziehungsweise `/reports/create/sums`, genau einmal, Token aus dem
   Eimer `reports`.
3. `id_by_customer` als Ganzzahl lesen. Die `create`-Antwort liefert sie als Zeichenkette, der
   `get`-Endpunkt verlangt sie als Ganzzahl.
4. `/reports/get/<typ>` mit wachsendem Abstand 2, 4, 7, 11, 16, 20, 20, 20 Sekunden, höchstens
   9 Versuche, Token aus dem Eimer `default`. **Abbruchbedingung ist ausschließlich
   `error_code` 8**; jeder andere Fehler beendet das Warten sofort.
5. Sperre freigeben, auch im Fehlerfall.

**Antwortform.** `bundle` mit `written` = „Ein neuer <Typ>-Bericht wurde erzeugt; der zuvor
erzeugte Bericht desselben Typs ist ersetzt.", dazu `report_type`, `report_id_by_customer`,
`period`, `status` (`done`, `still_running`, `failed`), `wait_ms`, `attempts`,
`integrity_error`, `uncompletedPostingsCount` und `data`.

**`uncompletedPostingsCount` und `integrityError` werden immer mitgeliefert**, und ist einer von
beiden auffällig, ist das der **erste** Satz des Textblocks, vor jeder Zahl. Eine BWA
berücksichtigt nur bestätigte Buchungen; sie mit unbestätigten Buchungen als endgültiges
Ergebnis zu präsentieren, ist der Fehler, gegen den dieses Feld existiert.

**Risiken und wie sie behandelt werden.**

1. **Der Schaden entsteht im ersten Teilaufruf, nicht am Ende.** Ab der Millisekunde des
   `create` ist der Vorgängerbericht weg, ganz gleich, was danach passiert. Vier Maßnahmen,
   drei wirksam, eine ausdrücklich nur teilwirksam:
   - **Prozesslokale Serialisierung** je (`api_key`-Hash, Berichtstyp). Ein zweiter Aufruf
     desselben Typs im selben Prozess wartet, statt ein zweites `create` abzusetzen.
   - **Der bestehende `reports`-Eimer bleibt unverändert.** Er ist nach
     `src/http/rate-limiter.ts` kein API-Limit, sondern die bewusste Bremse gegen genau das
     Muster „create, sofort get, error_code 8, sofort wieder create". Das Bündel setzt ihn
     weder außer Kraft noch umgeht es ihn.
   - **Ehrlichkeit statt Scheinsicherheit.** Prozessübergreifend lässt sich nichts verhindern;
     die API kennt keinen Sperrmechanismus. `bundle.written` traegt deshalb **immer**, auch
     im Erfolgsfall, und nennt die Ersetzung.
   - **Abgeholt wird ausschließlich mit der Kennung aus dem eigenen `create`**, nie mit einer
     fremden.
2. **`error_code` 12 beim Anlegen** (Erzeugung läuft bereits) wird nicht im engen Takt
   wiederholt und führt **nicht** zu einem eigenen `create`. Das Bündel bricht ab und meldet
   wörtlich, dass am selben Mandanten gerade eine Erzeugung desselben Typs läuft, dass sie
   nicht aus diesem Aufruf stammt, dass nichts erzeugt und nichts ersetzt wurde und dass in
   einigen Minuten erneut zu versuchen ist. Zustandssatz `STATE_NOTHING_SENT`. Automatisches
   Warten-und-dann-doch-Anlegen wäre das Zerstören fremder Arbeit und wird nicht gebaut.
3. **`error_code` 7 während der Warteschleife** ist der Nebenläufigkeitsfall aus
   `docs/api/berichte.md` 11.5 in Reinform: Ein anderer Aufruf hat zwischen unserem Anlegen und
   unserem Abholen einen neuen Bericht desselben Typs erzeugt und unseren entwertet. Das Bündel
   bricht sofort ab und benennt genau das, statt weiterzupollen oder erneut anzulegen.
4. **Zeitüberschreitung oder Abbruch durch den Client.** Der Bericht ist dann trotzdem erzeugt
   und der vorherige trotzdem ersetzt. Das Bündel liefert `status` = `still_running`, die
   `report_id_by_customer` und eine Lücke, die `bb_reports_get_bwa` beziehungsweise
   `bb_reports_get_sums` mit genau dieser Kennung nennt. Diese Werkzeuge bleiben nach N1
   erhalten und sind Klasse R, funktionieren also auch im Nur-Lesen-Modus. Zusätzlich schreibt
   das Bündel Typ, Kennung und Zeitstempel beim Anlegen auf stderr (Stufe warn), damit der
   Betreiber sie nach einem Clientabbruch wiederfindet. Eine Rücknahme gibt es nicht, die API
   kennt keinen Endpunkt dafür.
5. **Kein Bestätigungsmuster.** Kein `confirm`-Parameter, kein Trockenlauf, keine serverseitige
   Bestätigungsschleife. `tool-design.md` 9.4 schließt das als verbindliche Entscheidung des
   Projektinhabers aus. Die Warnung trägt die Beschreibung, die Freigabe der Host über
   `destructiveHint` true.
6. **Nur-Lesen-Modus.** Das Werkzeug ist gesperrt, und das ist beabsichtigt und richtig. Die
   Absage folgt dem Wortlaut aus `src/guards/read-only.ts`; die Beschreibung nennt zusätzlich
   `bb_reports_get_bwa`, `bb_reports_get_sums` und `bb_reports_get_ledger` als lesende Wege.

**Begründung.** Gesetzt nach N3a, und es deckt beide Berichtsarten mit einer Definition ab: Die
Pflichtfelder sind in beiden Fällen `date_from` und `date_to`, nur optionale Felder
unterscheiden sich. Regel 3 aus `tool-design.md` 3.4 zielt auf abweichende **Pflicht**mengen
und ist damit nicht berührt. Sachlich ist es der klarste Rundengewinn des Satzes, weil das
Warten auf einen asynchronen Vorgang genau das ist, was ein Werkzeug kann und ein Modell nicht:
Ein Modell kann nicht schlafen, es kann nur erneut aufrufen, und jeder Wartetakt ist eine eigene
Modellrunde.

---

### 4.5 `bb_balances_get`

**Klasse R.** `readOnlyHint` true, `destructiveHint` false, `idempotentHint` true,
`openWorldHint` true. Kein Pflichtsatz. Beschreibungsstufe 2. Aufrufobergrenze 2.

**Zweck.** Liefert das Kontenblatt eines Kontos mit fortgeschriebenem Saldo und beantwortet
damit „stimmt mein Kassenbestand" und „wie viel ist gerade auf PayPal".

**Eingabeschema, vollständig.**

| Feld | Typ | Pflicht | Vorgabe | Bedeutung |
| --- | --- | --- | --- | --- |
| `account` | string | **ja** | — | Kontoname **oder** Kontonummer. Entspricht `postingaccount_number` in `bb_reports_get_ledger`, nimmt aber zusätzlich einen Namen entgegen |
| `date_from` | string YYYY-MM-DD | **ja** | — | |
| `date_to` | string YYYY-MM-DD | **ja** | — | |
| `base` | enum `date`, `date_delivery_else_date` | nein | `date` | |
| `max_rows` | integer 1 bis 200 | nein | 50 | |
| `response_format` | der bestehende Baustein | nein | `concise` | |

**Endpunkte und Reihenfolge.** `/accounts/get` (nur bei nicht-numerischem `account`), dann
`/reports/get/sums/ledger`.

Die Namensauflösung geht **ausschließlich** über `/accounts/get`, also über die fünf
Zahlungskonten, und nicht über den Kontenrahmen. Grund: Eine Auflösung über bis zu drei Seiten
zu je rund 196 KB für ein einziges Wort ist der teuerste Weg zu einer Kontonummer, den dieser
Server hat. Wer das Kontenblatt eines Sachkontos will, schlägt die Nummer mit
`bb_masterdata_search` nach und gibt sie hier als Zahl ein; die Beschreibung sagt das.

**Antwortform.** `bundle`, dazu `account` mit Nummer und Name, `balance_end` mit Betrag, Seite
(`debit` oder `credit`) und der Quellenangabe, `standard_chart`, `integrity_error`,
`posting_count` und `rows[]`, projiziert auf `date`, `postingTextFull`,
`counterRecordPostingaccountNumber`, `record_side`, `record_amount`, `balanceAfterAbsolute`,
`balanceAfterSide`, `cost_location`, `receipts_id_by_customer`, `transactions_id_by_customer`.

**Risiken und wie sie behandelt werden.**

1. **Der Saldo steht in der letzten Zeile, also darf bei einer Kürzung nie die letzte Zeile
   wegfallen.** Gekürzt wird in der Mitte; die letzten fünf Zeilen bleiben immer stehen, und
   die Kürzung wird ausgewiesen. Das ist der Kern des Werkzeugs: Gemessen wiegt das Kontenblatt
   dieses Kontos über sieben Jahre 828 Zeilen zu je 723 Byte, also rund 146.000 Token, und die
   generische Kürzung schneidet das Ende ab.
2. **Der Saldo ist ein echter Kontostand, und das ist jetzt gemessen** (M6). Die Antwort nennt
   ihn „Saldo laut Kontenblatt nach der letzten Buchung im Zeitraum, einschließlich des
   Bestands vor `date_from`" und gibt die Quelle an (`balanceAfterAbsolute` und
   `balanceAfterSide` der letzten Zeile). Wer den heutigen Bestand will, setzt `date_to` auf
   heute; `date_from` darf eng sein, weil der Eröffnungssaldo enthalten ist.
3. **Leeres Kontenblatt ist nicht Saldo null.** Ist `postingaccountLedger` leer, steht dort
   „keine Buchungen im Zeitraum, daraus lässt sich kein Saldo ableiten". Dieser Fall ist am
   2026-09-13 für ein Konto gemessen worden: HTTP 200, 147 Byte, leeres Array.
4. **Das Kontenblatt zeigt nur Gebuchtes.** Die Differenz zum Kontoauszug aus
   `bb_records_collect` ist genau das noch nicht Gebuchte, und der Anschlusssatz sagt das.
5. **Schachtelung und Feldnamen sind gemessen** (M5): `report_sums_postingaccount_ledger`
   enthält `integrityError`, `postingaccount_number` und `postingaccountLedger`. Ein Feld
   `balanceBeforeAbsolute` gibt es in der Kontenblattzeile **nicht**; es gehört zur
   Summenliste. `standard_chart` steht in jeder Zeile (live "skr03") und wird ausgewiesen, weil
   es umsonst mitkommt.
6. **Abgrenzung zu `bb_reports_get_ledger`.** Der Name ist bewusst deutlich verschieden
   gehalten, damit die beiden im selben Kontextfenster nicht verwechselt werden. Die
   Beschreibung nennt das Endpunktwerkzeug als den Weg zu allen 24 Feldern.

**Begründung.** „Stimmt mein Kassenbestand" ist eine der Kernfragen, und heute ist sie für eine
Nicht-Programmiererin praktisch unbeantwortbar: Sie müsste wissen, dass es ein Kontenblatt gibt,
dass es anders als BWA und Summenliste kein `create` braucht, und sie müsste die Kontonummer
kennen. Das Werkzeug macht aus drei Vorkenntnissen eine Frage und ist zugleich das einzige, bei
dem die Kürzung nicht genau die Zeile wegwirft, in der die Antwort steht.

---

## 5. Teilfehler

**Grundsatz: Ein Bündel macht aus einem Teilerfolg weder einen Totalausfall noch einen stillen
Erfolg.** Beides wäre in einer Buchhaltung ein Datenfehler, der zweite der gefährlichere.

Jedes Bündel trägt genau einen von drei Fehlermodi, und der Modus steht als Feld im Register,
nicht im Code eines Handlers. Ein Bündel improvisiert im Fehlerfall nichts.

| Modus | Bündel | Verhalten |
| --- | --- | --- |
| **`abort`**, abbrechend | `bb_reports_run`, `bb_balances_get`, `bb_assignments_get` (Schritt 1) | Ein späterer Schritt ist ohne den früheren sinnlos. Scheitert ein Schritt, wird kein weiterer abgesetzt. Geliefert wird, was bis dahin gesichert ist, mit `complete` = false und einer Lücke je nicht ausgeführtem Schritt |
| **`independent`**, unabhängig | `bb_masterdata_search` (über die drei Endpunkte), `bb_records_collect` (über die beiden Belegrichtungen), `bb_assignments_get` (Schritt 2 und Anreicherung) | Die Teilschritte stehen nebeneinander. Ein Fehlschlag beendet nichts; er wird zur Lücke, die übrigen Teile werden geliefert. Ein Ausfall der Kostenstellenliste darf die Zahlungskonten nicht mitreißen. `complete` ist dann false, auch wenn zwei von drei Teilen in Ordnung sind |
| **`prefix`**, Präfix | die Seitenschleifen in `bb_records_collect` und `bb_masterdata_search` | Die Seiten bilden einen Anfang des Bestands. Beim ersten Fehler stoppt die Schleife sofort. Die bereits geholten Seiten sind gültig und werden geliefert; die Lücke nennt das genaue `offset` und den Einzelwerkzeugaufruf dafür. Eine kaputte Seite wird **nie** übersprungen, denn dann wäre der Bestand löchrig, ohne dass es jemand merkt |

### Sechs Regeln, die über dem Modus stehen

1. **Scheitert der erste Aufruf, ist die Antwort ein Fehler** (`isError` true, kein
   `structuredContent`) im bestehenden Vierblockaufbau aus `tool-design.md` 8.2, mit dem
   Pfadlabel des gescheiterten Endpunkts, dem `error_code`, der Klartextbedeutung und dem
   nächsten Schritt. Es gibt nichts zu berichten, also wird nichts berichtet.
2. **Scheitert ein späterer Aufruf, ist die Antwort ein Erfolg** mit dem, was da ist. Die
   bereits gelesenen Zeilen sind echte Daten; sie wegzuwerfen, weil Seite drei von vier
   ausgefallen ist, wäre Verschwendung, sie kommentarlos als Ergebnis auszugeben, wäre eine
   Lüge.
3. **Drei Lagen beenden den Lauf sofort, in jedem Modus:** `error_code` 3 und 4 (Zugangsdaten,
   Mandant), `error_code` 11 (Mandant inaktiv) sowie zwei aufeinanderfolgende 5xx desselben
   Endpunkts. Die werden innerhalb desselben Aufrufs nicht besser, und fünf weitere Aufrufe
   gegen dieselbe abgelehnte Anmeldung verbrennen nur Minutenkontingent.
4. **Die Form der Antwort ändert sich nie.** `structuredContent` trägt dieselben Schlüssel, ob
   vollständig oder nicht; `gaps` ist dann ein leeres Array und nicht abwesend. Ein Modell
   soll auf Werte prüfen müssen, nicht auf die Anwesenheit von Schlüsseln. Das ist zugleich die
   Zusage, die das `outputSchema` abgibt.
5. **Kein automatisches Wiederholen auf Bündelebene.** Der bestehende Retry in
   `src/http/retry.ts` gilt unverändert für den **einzelnen** internen Aufruf. Darüber liegt
   nichts: Ein Bündel, das seine ganze Kette wiederholt, setzt schreibende Schritte erneut ab
   und verbraucht das Minutenkontingent doppelt.
6. **Schreibende Schritte werden nie wiederholt.** Betrifft genau einen Schritt im ganzen Satz,
   das `create` in `bb_reports_run`.

**Die Schrittliste ist ein Pflichtfeld und wird nicht zusammengefasst.** Bei `state` =
`failed` steht dort der vollständige Fehlertext des bestehenden Renderers, also der
Vierblockaufbau. Ein Bündel darf keine schlechtere Fehlermeldung liefern als das Einzelwerkzeug,
das es ersetzt.

Fehlertexte durchlaufen die bestehende Schwärzung; kein `api_key` und kein Secret erscheint.
Freitext aus der API (`counterparty`, `purpose`, `postingtext`, Kontonamen, Fehlermeldungen)
läuft durch `sanitize`, wird als Zitat gekennzeichnet und nie als Anweisung formatiert.

---

## 6. Rate Limit

**Ausgangslage**, dokumentiert und im Code bereits abgebildet: 100 Requests je Mandant und
Minute, ohne jeden Rate-Limit-Header, also nicht ablesbar, sondern nur selbst zählbar. Das
Kontingent wird mit der Weboberfläche desselben Mandanten geteilt. Der Server führt einen
Token-Eimer je (`api_key`-Hash, Eimername) mit der Vorgabe 60 statt 100
(`BB_MCP_RATE_LIMIT`, 10 bis 100), vier Eimern (`default`, `upload`, `batch`, `reports`),
`SLOW_WAIT_MS` = 5 Sekunden und `GIVE_UP_WAIT_MS` = 30 Sekunden.

**Sechs Festlegungen.**

1. **Kein Sonderrecht, kein eigener Eimer.** Jeder interne Aufruf eines Bündels entnimmt genau
   einen Token aus demselben Eimer, den auch das entsprechende Endpunktwerkzeug benutzt, und er
   entnimmt ihn **einzeln und erst unmittelbar vor dem Request**. Kein Vorabreservieren eines
   Blocks. Damit verschränkt sich ein laufendes Bündel fair mit gleichzeitigen
   Werkzeugaufrufen, statt sie für Sekunden auszusperren. Ein Bündel mit eigenem Kontingent
   wäre ein zweiter Zähler auf demselben Minutenlimit und machte die Buchführung des
   bestehenden zur Lüge.

   **Eine Ausnahme mit Begründung:** Bei `bb_reports_run` entnimmt nur das `create` aus dem
   Eimer `reports` (Kapazität 1, ein Token je 10 Sekunden); die Abholversuche entnehmen aus
   `default`. Andernfalls wartete jeder Abholversuch die volle Bremszeit ab, und die
   Warteschleife wäre durch ihre eigene Bremse unbrauchbar.

2. **Harte Obergrenze je Bündel**, Teil des Vertrags, in der Beschreibung genannt und in jeder
   Antwort als `bundle.api_calls_limit` neben `bundle.api_calls` ausgewiesen. Ohne
   diese Zahl ist ein Bündel eine Blackbox, die still das Minutenkontingent leert.

   | Bündel | Obergrenze | Zusammensetzung |
   | --- | --- | --- |
   | `bb_masterdata_search` | 5 | 1 Konten, 1 Kostenstellen, bis zu 3 Kontenrahmenseiten |
   | `bb_records_collect` | 10 | bis zu 1 Auflösung, bis zu 9 Seiten |
   | `bb_assignments_get` | 5 | 2 fest, bis zu 3 bedingte Anreicherungen |
   | `bb_reports_run` | 10 | 1 `create`, bis zu 9 Abholversuche über höchstens 240 Sekunden |
   | `bb_balances_get` | 2 | bis zu 1 Auflösung, 1 Kontenblatt |

   **Kein Bündel setzt mehr als 10 Requests ab.** Das ist ein Sechstel des vorgegebenen Eimers
   von 60 und ein Zehntel des dokumentierten Limits von 100; drei Bündelaufrufe in derselben
   Minute bleiben damit unter 30 und lassen der Weboberfläche Luft.

3. **Anpassung an die Betreibereinstellung.** Die tatsächlich wirksame Obergrenze ist
   `min(deklarierte Obergrenze, floor(BB_MCP_RATE_LIMIT / 3))`. Bei der Vorgabe 60 sind das 20,
   die Grenze bindet also nie. Bei `BB_MCP_RATE_LIMIT=10`, also einem Betreiber, der bewusst
   sehr zurückhaltend fährt, sind es 3, und jedes Bündel meldet das über `stopped_because` und
   `continuation`. Ein Bündel, das die ausdrückliche Einstellung des Betreibers ignoriert, wäre
   ein Entwurfsfehler.

4. **Vorabprüfung, bevor der erste Request hinausgeht.** Jedes Bündel fragt den Eimer, wie
   viele Token ohne Warten verfügbar sind. Liegt die Zahl unter dem Minimum, das dieses Bündel
   für eine sinnvolle Antwort braucht (2 bei `bb_assignments_get` und `bb_balances_get`, 1 bei
   den übrigen), lehnt es ab, **bevor irgendetwas hinausgeht**, mit `STATE_NOTHING_SENT` und
   der Angabe, wie lange bis zur Erholung zu warten ist. Ein Bündel, das nach dem dritten von
   fünf Aufrufen im Limit hängenbleibt, ist teurer als eines, das gar nicht erst anfängt.

5. **Abbruch statt Warten**, und das ist die eigentliche Antwort auf die Frage. Vor jedem
   **zusätzlichen** Teilaufruf, nie vor dem ersten, fragt das Bündel den Limiter nach der zu
   erwartenden Wartezeit für den nächsten Token. Liegt sie über `SLOW_WAIT_MS`, wird nicht
   gewartet: Das Bündel stoppt, liefert, was es hat, setzt `complete` = false und
   `stopped_because` = `rate_limit` und nennt in `continuation` den exakten Folgeaufruf. **Kein
   Bündel läuft je in den 30-Sekunden-Aufgabefall hinein.** Eine wahrheitsgemäße Teilantwort
   nach zwei Sekunden ist mehr wert als eine vollständige nach vierzig, und die Alternative
   wäre, die Unterhaltung blockieren zu lassen.

   Dafür braucht der Limiter eine kleine Ergänzung, die heute fehlt: eine nicht blockierende
   Abschätzung `peekWait(bucket)` neben dem vorhandenen `SlowWaitNotifier`. Das ist eine
   benannte, kleine Änderung an `src/http/rate-limiter.ts` und keine Umgehung des Eimers. Die
   Wartemeldung wird **einmal je Bündelaufruf** ausgegeben, nicht je internem Aufruf; sonst
   erzeugt ein Bündel zehn Meldungen für einen Vorgang.

6. **Feuert `GIVE_UP_WAIT_MS` trotzdem mitten im Bündel**, gilt Teilfehlerregel 2: Erfolg mit
   dem Gesammelten, `complete` = false, Lücke mit der Ursache. Der Aufruf scheitert nicht.

**Was bewusst nicht gebaut wird:** keine eigene Umgebungsvariable für Bündel.
`BB_MCP_RATE_LIMIT` regelt das Minutenbudget, die Obergrenzen je Bündel stehen fest im
Register. Eine zweite Stellschraube für dieselbe Sache wäre eine zweite Quelle der Wahrheit.

**Ehrliche Grenze:** Der Eimer ist prozesslokal. Zwei Clients oder zwei Sitzungen auf demselben
Mandanten teilen ihn nicht, und die Weboberfläche kennt ihn erst recht nicht; die Summe kann die
100 reißen, ohne dass einer es merkt. Bündel verschärfen das, weil sie je Modellrunde mehr
Requests absetzen als ein Einzelwerkzeug. Deshalb die Vorgabe 60 statt 100, deshalb der Abbruch
statt des Wartens, und deshalb steht dieser Satz nicht nur in der README, sondern auch in der
Beschreibung von `bb_records_collect`. Ein Bündel kann das Limit nicht garantiert einhalten, es
kann nur garantiert wenig dazu beitragen.

**Was Bündel am Limit auch entlasten:** Ohne `bb_masterdata_search` braucht ein Agent für
dieselbe Frage 13 Seitenaufrufe gegen `/settings/get/postingaccounts` mit dem Vorgabelimit 100,
und weil jede Antwort an der weichen Grenze gekappt wird, wiederholt er es. Das Bündel holt
dieselben Daten in 2 Aufrufen mit `limit=1000` (gemessen zulässig und beantwortet). Gut
zugeschnittene Bündel senken die Requestlast; gefährlich ist allein das Bündel ohne Obergrenze,
und genau deshalb steht sie im Code und nicht in der Dokumentation.

---

## 7. Der Gruppenschalter

### Zwei Variablen

| Variable | Bedeutung |
| --- | --- |
| `BB_MCP_TOOL_GROUPS` | Positivliste. Kommaliste von Gruppennamen. Ist sie gesetzt, sind **nur** diese Gruppen aktiv |
| `BB_MCP_TOOL_GROUPS_EXCLUDE` | Negativliste. Kommaliste von Gruppennamen, die aus der wirksamen Menge entfernt werden |

Zwei Variablen statt einer, weil beide typischen Fälle ohne Aufzählung gehen sollen: „nur diese
drei" und „alles außer `invoices`". Genau das verlangt `werkzeugkontext-clients.md` 6c.
Benennung im bestehenden Schema `BB_MCP_*`, Werte als Kommaliste.

### Die zwölf Gruppennamen, abschließend

| Gruppe | Werkzeuge | Token (gemessen) |
| --- | --- | --- |
| `postings` | 12 | 12.213 |
| `receipts` | 8 | 8.466 |
| `transactions` | 8 | 6.661 |
| `invoices` | 3 | 5.766 |
| `creditors` | 4 | 3.341 |
| `reports` | 5 | 3.203 |
| `debtors` | 4 | 3.198 |
| `postingaccounts` | 3 | 1.877 |
| `cost_locations` | 4 | 1.839 |
| `payment_accounts` | 2 | 1.142 |
| `comments` | 1 | 599 |
| **`bundles`** | **5** | **rund 6.200 (geschätzt)** |

Summe der elf bestehenden Gruppen: 54 Werkzeuge, 48.305 Token. Mit `bundles`: 59 Werkzeuge.

**Zwei Namen sind gegenüber der Messtabelle in `werkzeugkontext-clients.md` Abschnitt 5
ausgeschrieben:** `cost_locations` statt `cost` und `payment_accounts` statt `payment`. Grund:
Die Variable wird von einem Menschen getippt, der die Werkzeugnamen `bb_cost_locations_*` und
`bb_payment_accounts_*` sieht, nicht die Messtabelle; und `payment` ließe sich mit Zahlungen und
Buchungen verwechseln, `cost` mit Kosten allgemein. Die Gruppentabelle in der README und die
Messtabelle werden im selben Schritt auf die ausgeschriebenen Namen gezogen, sonst stimmen
Dokumentation und Variable nicht überein.

**Die Gruppenzugehörigkeit steht als ausdrückliches Feld `group` im Registereintrag und wird
niemals aus dem Werkzeugnamen abgeleitet.** Das ist dieselbe Regel, die `src/registry/classes.ts`
für die Werkzeugklasse aufstellt, mit derselben Begründung: Ein Zerlegen am zweiten Unterstrich
ergäbe genau `cost` und `payment`, und `bb_records_collect` begänne nicht mit `bb_bundles_` und
läge trotzdem in `bundles`.

### Auflösung, in dieser Reihenfolge

1. Beide Werte werden getrimmt, kleingeschrieben und an Kommas zerlegt. Leerraum um die Namen
   wird entfernt, Großschreibung akzeptiert, ein nachgestelltes Komma ist kein Fehler; leere
   Teilstücke aus doppelten Kommas werden verworfen, weil sie keine Funktionalität verstecken
   können.
2. Jedes verbleibende Teilstück wird gegen die zwölf Namen geprüft.
3. Aktive Menge = (Positivliste, sonst alle zwölf) minus Negativliste.

### Fehlerverhalten: vier Startfehler, keine stille Ignorierung

1. **Unbekannter Gruppenname.** Der Prozess meldet auf stderr den ungültigen Wert, die Variable,
   in der er stand, und die vollständige Liste der zwölf gültigen Namen; bei einer
   Levenshtein-Distanz von 1 oder 2 zusätzlich den wahrscheinlich gemeinten Namen. Dafür wird
   die vorhandene Funktion `closestAllowedValue` aus `src/errors/render.ts` wiederverwendet und
   nicht neu geschrieben. Danach Abbruch mit Fehlercode. **Ein Tippfehler, der die halbe
   Funktionalität abschaltet und nichts sagt, ist der schlimmste Fall.**
2. **Derselbe Name in beiden Variablen.** Ein echter Widerspruch: Der Betreiber hat über
   dieselbe Gruppe „nur diese" und „diese nicht" gesagt. Kein stilles Gewinnen einer Seite.
3. **Ein Name in der Negativliste, der nicht in der aktiven Menge liegt.** Ein Schalter, der
   nichts bewirkt, ist genau die Rückmeldungslücke, gegen die dieser Abschnitt gebaut ist.
4. **Leere wirksame Menge.** Ein Server ohne Werkzeuge ist kein Server.

**Ein leerer Wert einer gesetzten Variable ist ausdrücklich KEIN Fehler, sondern gilt als nicht
gesetzt.** Zwei der drei Entwürfe wollten hier einen Startfehler. Das ist nach Prüfung der
Datei `.mcpb/manifest.template.json` falsch: Das Bundle setzt Variablen über
`${user_config.<name>}`, und ein optionales, vom Nutzer leer gelassenes Feld expandiert damit
auf einen leeren Wert. Ein Startfehler auf den leeren Wert machte das Desktop-Bundle für jeden
Nutzer unstartbar, der das Feld nicht ausfüllt, also für die große Mehrheit. Die Startmeldung
sagt ausdrücklich, dass ein leerer Wert wie „nicht gesetzt" behandelt wird.
**Nicht verifiziert** ist, ob eine leere optionale `user_config`-Zeichenkette tatsächlich als
leerer Wert expandiert oder ob der Schlüssel entfällt; die gewählte Behandlung ist unter beiden
Ausgängen sicher.

### Mechanik

- **Entscheidung beim Serverstart aus der eingefrorenen Konfiguration**, nicht zur Laufzeit.
  Protokollrechtlich sauber: Die MUST-NOT-vary-Klausel der Revision 2026-07-28 verbietet
  Variation je Verbindung und als Nebenwirkung anderer Anfragen, nicht eine
  Konfigurationsentscheidung. Die Werkzeugliste bleibt über die gesamte Verbindung stabil.
- **Abgeschaltete Werkzeuge werden gar nicht erst registriert**, statt sie mit `enabled: false`
  zu führen. Die Wirkung auf `tools/list` ist identisch, aber es entsteht kein toter Code, und
  `doctor` kann klar berichten. Das ist der bewusste Gegensatz zum Nur-Lesen-Schalter, der
  gesperrte Werkzeuge ausdrücklich sichtbar lässt: Der Gruppenschalter existiert, um Kontext zu
  sparen, der Nur-Lesen-Schalter, um einen Agenten aufzuklären.

### Bündel hängen NICHT an den Endpunktgruppen

**Entschieden: Die fünf Bündel werden registriert, sobald die Gruppe `bundles` aktiv ist, und
zwar unabhängig davon, welche Endpunktgruppen aktiv sind.** Ein Bündel ruft die HTTP-Schicht auf,
nicht die Endpunktwerkzeuge.

Ein Entwurf hatte die Gegenregel vorgeschlagen (ein Bündel nur registrieren, wenn auch eine
seiner Endpunktgruppen aktiv ist, und Enum-Werte auf abgeschaltete Gruppen aus dem Eingabeschema
entfernen). Drei Gründe dagegen, jeder für sich ausreichend:

1. **Der Gruppenschalter spart Kontext, er begrenzt keinen Zugriff.** Für die Zugriffsbegrenzung
   gibt es `BB_MCP_READ_ONLY`, und der ist ein anderer Mechanismus mit einer anderen Zusage: Er
   lehnt zur Aufrufzeit mit einem erklärenden Text ab, statt zu verstecken. Wer `receipts` aus
   Kontextgründen abschaltet, hat nicht gesagt „keine Belegdaten mehr".
2. **Enum-Werte zu entfernen gäbe demselben Werkzeug je Installation ein anderes
   Eingabeschema.** Jede Beschreibung, jedes Beispiel und jede Dokumentationszeile über
   `bb_records_collect` wäre dann nur bedingt wahr. Das ist schlimmer als die Überraschung, die
   es verhindert.
3. **Die Gegenregel zerstört ihren eigenen besten Anwendungsfall.** Unter
   `BB_MCP_TOOL_GROUPS=bundles` ist keine Endpunktgruppe aktiv; es würde **gar nichts**
   registriert. Genau dieses Profil ist der Zweck des ganzen Hebels.

Startmeldung, `doctor` und `instructions` sagen den Satz deshalb ausdrücklich: Bündel greifen
unmittelbar auf die API zu und sind von den Endpunktgruppen nicht eingeschränkt; wer den Zugriff
begrenzen will, nimmt `BB_MCP_READ_ONLY`.

### Wechselwirkung mit `BB_MCP_READ_ONLY` (N6)

Vollständig orthogonal. Der Gruppenschalter entscheidet über die **Registrierung**, der
Nur-Lesen-Schalter über die **Ausführung**. In der Gruppe `bundles` sind vier Werkzeuge Klasse R
und bleiben unter `BB_MCP_READ_ONLY=true` nutzbar; genau eines, `bb_reports_run`, ist Klasse AR
und wird gesperrt, mit dem bestehenden Absagetext aus `src/guards/read-only.ts`.

**Damit das dauerhaft stimmt, gilt eine prüfbare Regel statt einer Zusage:** Die Klasse eines
Bündels ist die **schärfste Klasse seiner Schritte**, sie wird aus den Schritten berechnet, und
ein Test vergleicht die berechnete mit der eingetragenen Klasse. Wer einem lesenden Bündel
später einen schreibenden Schritt hinzufügt, bricht diesen Test, statt den Schutzschalter
stillschweigend zu entwerten. Dass ein Bündel mehrere Endpunkte anfasst, ändert an der
Klassifikation nichts.

### Rückmeldung, drei Stellen

Ohne sie kann niemand den Hebel einstellen.

- **Startmeldung auf stderr:** aktive Gruppen, Zahl der registrierten Werkzeuge, geschätzter
  Tokenpreis, dazu die inaktiven Gruppen mit der Angabe, welche Variable sie abgeschaltet hat.
- **`doctor` und `print-config`:** dieselbe Angabe.
- **`instructions`:** die aktiven Gruppen namentlich, damit ein Agent weiß, was er hat, und
  nicht nach Werkzeugen sucht, die diese Installation nicht anbietet. Ist eine Gruppe aus, steht
  dort auch, welche Fragen damit unbeantwortbar sind.

### Die `.mcpb`-Frage ist geklärt, nicht offen

Alle drei Entwürfe haben sie als offenen Punkt an den Projektinhaber gegeben. Die Antwort steht
in `.mcpb/manifest.template.json` und lautet **ja**: Das Manifest deklariert bereits einen
Abschnitt `user_config`, aus dem Claude Desktop eine Einstellungsoberfläche erzeugt, und setzt
darüber schon heute `BB_MCP_READ_ONLY` aus einem Schalter `read_only`. Der Weg für den
Gruppenschalter ist damit derselbe.

**Festlegung für das Manifest:**

```json
"tool_groups": {
  "type": "string",
  "title": "Werkzeuggruppen",
  "description": "Kommaliste. Leer lassen für alle Gruppen. Gültig: bundles, receipts, transactions, postings, invoices, debtors, creditors, postingaccounts, payment_accounts, cost_locations, reports, comments. Empfehlung für Claude Desktop: bundles",
  "required": false
}
```

und in `mcp_config.env` die Zeile `"BB_MCP_TOOL_GROUPS": "${user_config.tool_groups}"`.

**Kein Vorgabewert im Manifest.** Er dürfte nur „alle Gruppen" bedeuten, und ein Manifest, dessen
Vorgabe von der Servervorgabe abweicht, wäre genau der Default, der Funktionen versteckt (N5:
Standard alle Gruppen an).

### Empfohlene Profile, gehören in die README

| Zweck | Einstellung | Werkzeuge | Token (Definitionen) |
| --- | --- | --- | --- |
| Claude Desktop, Buchhaltung ohne Erfassung | `BB_MCP_TOOL_GROUPS=bundles` | 5 | rund 6.200 statt 48.305 |
| Claude Desktop, Buchhaltung mit Belegerfassung | `BB_MCP_TOOL_GROUPS=bundles,receipts,payment_accounts` | 15 | rund 15.800 |
| Nur auswerten | `BB_MCP_TOOL_GROUPS=bundles,reports` plus `BB_MCP_READ_ONLY=true` | 10 | rund 9.400 |
| Claude Code, Codex | alles an | 59 | im Leerlauf rund 2.000 (nur Namen) |

Das erste Profil ist der eigentliche Zweck dieser Vorlage: Für die Buchhalterin in Claude
Desktop, die auswertet und nicht erfasst, sind die fünf Bündel kein Aufschlag, sondern ein
wählbarer Ersatz.

---

## 8. Tokenpreis, mit Rechenweg

### Das Modell, an der bestehenden Messung geeicht

Grundlage sind die gemessenen Zahlen aus `docs/entwicklung/befund-tokenbudget.md`
(`gpt-tokenizer@4.0.0`, Kodierung `o200k_base`): 54 Werkzeugdefinitionen = 197.528 Zeichen =
48.305 Token, also **4,09 Zeichen je Token** und im Mittel 895 Token je Definition.

Die Postentabelle desselben Befunds erlaubt, die Kosten in einen festen Anteil je Werkzeug und
einen veränderlichen Anteil je Parameter zu zerlegen:

| Posten | Zeichen gesamt | je Werkzeug |
| --- | --- | --- |
| Werkzeugbeschreibungen | 32.654 | 605 |
| `outputSchema` | 40.030 | 741 |
| Name, Titel, Annotationen | rund 8.085 | 150 |
| **fest je Werkzeug** | | **1.496** |
| Parameterbeschreibungen, reiner Text | 67.161 | |
| Schemarümpfe (Rest der vierten Zeile) | rund 49.598 | |
| **veränderlich, zusammen** | **116.759** | |

Der Befund nennt „im Schnitt sechs Parameter" je Werkzeug, also 54 × 6 = **324 Felder**.
Daraus: 116.759 / 324 = **360 Zeichen je Feld**.

**Probe:** 1.496 + 6 × 360 = 3.656 Zeichen = 894 Token. Gemessen sind 3.658 Zeichen und 895
Token je Werkzeug. Das Modell trifft die Messung auf ein Token genau und ist damit als
Schätzgrundlage belastbar.

### Zuschlag für den Bündelvertrag

Der Block `bundle` steht in jedem der fünf `outputSchema` zusätzlich. Nach S6 tragen
Ausgabeschemata keine Feldbeschreibungen, die Posten sind also reine Struktur:

| Teil | Zeichen |
| --- | --- |
| `complete` (boolean) | 33 |
| `stopped_because` (Enum mit 6 Werten) | 130 |
| `api_calls`, `api_calls_limit` (integer) | 77 |
| `written` (string) | 32 |
| `steps[]` (Array, 6 Eigenschaften) | 260 |
| `gaps[]` (Array, 3 Eigenschaften) | 150 |
| `continuation` (Objekt oder null, 3 Eigenschaften) | 150 |
| Umschlag und `required`-Liste | 240 |
| **Summe** | **1.072** |

### Die Rechnung je Bündel

Die Bündel sind Beschreibungsstufe 1 beziehungsweise 2; angesetzt sind 850 Zeichen
Werkzeugbeschreibung, also nahe an der Obergrenze von 900 Zeichen der Stufe 1.

Fest je Bündel = 850 (Beschreibung) + 741 (eigenes `outputSchema`) + 1.072 (Bündelvertrag) +
150 (Name, Titel, Annotationen) = **2.813 Zeichen**.

| Bündel | Felder | Zeichen | Token |
| --- | --- | --- | --- |
| `bb_masterdata_search` | 4 | 2.813 + 1.440 = 4.253 | 1.040 |
| `bb_records_collect` | 11 | 2.813 + 3.960 = 6.773 | 1.656 |
| `bb_assignments_get` | 4 | 2.813 + 1.440 = 4.253 | 1.040 |
| `bb_reports_run` | 6 | 2.813 + 2.160 = 4.973 | 1.216 |
| `bb_balances_get` | 6 | 2.813 + 2.160 = 4.973 | 1.216 |
| **Summe** | **31** | **25.225** | **6.168** |

**Ergebnis: rund 6.200 Token, Spanne 5.500 bis 7.000.** Das ist eine **Schätzung und keine
Messung** — die Werkzeuge existieren noch nicht. Nach dem Bau ist `pnpm measure-tokens` die
verbindliche Zahl.

### Was das bedeutet

- Aufschlag auf die gemessenen 48.305 Token der 54 Definitionen: **12,8 Prozent**.
- Aufschlag auf die 49.564 Token, die ein Client beim Verbinden sieht: **12,4 Prozent**.
- In Claude Code und Codex: **null**, weil die Deferral dort bedingungslos ist. Dort kosten die
  fünf Bündel im Leerlauf nur ihre Namen, also rund 50 Token.
- 31 Felder auf 5 Werkzeuge sind 6,2 Felder je Werkzeug und damit genau der Projektdurchschnitt.
  Die Bündel sind nicht auffällig teuer; sie sind durchschnittlich teuer und dafür wenige.

### Das Budget: eine zweite, getrennte, harte Zahl

`src/registry/budget.ts` führt `TOTAL_TOOL_DEFINITION_TOKEN_BUDGET` = 49.000 bei gemessenen
48.305, also 695 Token Luft. Die Datei sagt ausdrücklich: **„Diese Zahl darf ein Agent senken,
niemals anheben."** Die fünf Bündel rissen sie um rund 5.500 Token.

**Festlegung: `TOTAL_TOOL_DEFINITION_TOKEN_BUDGET` bleibt bei 49.000 und deckt weiterhin genau
die 54 Endpunktwerkzeuge.** Daneben tritt eine zweite, ebenfalls harte Grenze:

```
export const BUNDLE_DEFINITION_TOKEN_BUDGET = 7_000;
```

Begründung in einem Satz: Die 49.000 sind die dokumentierte Entscheidung des Projektinhabers
über die 54 Endpunktwerkzeuge und über E1; eine als Ganzes abschaltbare Bündelgruppe ist ein
anderer Gegenstand und verdient eine eigene, sichtbare Zahl, statt sich in einer fremden zu
verstecken. Ein Entwurf hatte 3.000 vorgeschlagen; nach der Rechnung oben wäre das nicht
baubar. 7.000 sind die geschätzten 6.168 zuzüglich rund 800 Token Luft. Die Luft ist bewusst
großzügiger bemessen als die 695 Token des Hauptbudgets, weil die Bündel noch nicht geschrieben
sind und eine Schätzung keine Messung ist. **Nach dem ersten Lauf von `pnpm measure-tokens` ist
diese Zahl auf den gemessenen Stand zuzüglich einer kleinen Marge zu senken**, und ab dann gilt
für sie dieselbe Regel wie für die 49.000.

`P11` prüft beide Budgets getrennt. So bleibt sichtbar, was die Ergänzung wirklich kostet.

### `searchHint` ja, `alwaysLoad` nein

Jedes Bündel trägt `anthropic/searchHint` mit den Wörtern, die eine Buchhalterin sagt: offene
Posten, Kontoauszug, Kontostand, Saldo, BWA, Summen und Salden, Gewinn, Kunde, Lieferant,
Kostenstelle, Kontonummer, Sachkonto, Beleg, Rechnung, Zuordnung, bezahlt, unbezahlt.

**`anthropic/alwaysLoad` bekommt kein Bündel.** Es bezahlte den vollen Definitionspreis in genau
den Clients, in denen die Deferral ihn gerade erspart hat, und es bewirkt nichts in den Clients,
die das Problem tatsächlich haben; nach N2 ist der Hauptclient Claude Desktop, und dort gibt es
das Merkmal nicht. `searchHint` kostet dagegen fast nichts und verbessert genau das, was schwach
ist, nämlich das Finden über die Wörter der Nutzerin.

---

## 9. Architekturfolgen im Code

Drei Änderungen sind vor dem Bauen zu entscheiden; sie sind hiermit entschieden.

**1. `BundleEntry` als Geschwistertyp zu `ToolEntry`.** `ToolEntry` bindet genau einen Endpunkt:
`path`, `responseContract`, `concise`, `bucket` und `timeoutTier` sind allesamt Singular. Ein
Bündel in diesen Typ zu zwingen, machte jedes dieser Felder mehrdeutig und brächte eine
Verzweigung in den **einen** generischen Handler, den das Projekt bewusst genau einmal
geschrieben hat.

```ts
// Ein Schritt eines Bündels. Traegt seinen eigenen Endpunkt und seinen eigenen Vertrag.
export interface BundleStep {
  readonly specPath: string;
  readonly role: "required" | "optional" | "enrichment";
  readonly responseContract: ResponseContract;
  readonly concise: readonly string[];
  readonly bucket: "default" | "upload" | "batch" | "reports";
  readonly toolClass: ToolClass; // die Klasse DIESES Schritts
}

export interface BundleEntry {
  readonly name: string;
  readonly title: string;
  readonly group: "bundles";
  readonly effect: ToolEffect;
  readonly toolClass: ToolClass; // die schaerfste Klasse der Schritte, per Test geprueft
  readonly tier: DescriptionTier;
  readonly description: string;
  readonly mandatorySentence?: MandatorySentenceId;
  readonly fields: FieldSpec[];
  readonly serverOnlyFields: string[];
  readonly steps: readonly BundleStep[];
  readonly maxCalls: number;
  readonly failureMode: "abort" | "independent" | "prefix";
  readonly crossChecks: CrossCheckId[];
}
```

Dazu ein **zweiter** generischer Handler in `src/server/register-tools.ts`. Die Guards 1 bis 6
laufen unverändert und in derselben Reihenfolge; nur der Ausführungsteil ist ein anderer.

**2. Das Feld `group` kommt in `ToolEntry` und in `BundleEntry`.** Das berührt alle 54
Registerdateien, aber nur als Daten und nicht als Verhalten; eine fehlende Zeile ist danach ein
Übersetzungsfehler und kein stiller Ausfall. Das ist genau die Eigenschaft, wegen der
`classes.ts` und `budget.ts` so gebaut sind. Eine separate Tabelle Werkzeugname zu Gruppe wäre
eine zweite Quelle der Wahrheit und wird abgelehnt — dasselbe Muster, das das Projekt bei der
Klassenzuordnung bereits abgelehnt hat. **N1 bleibt gewahrt:** Kein Endpunktwerkzeug wird
ersetzt, entfernt oder in seinem Verhalten geändert.

**3. `peekWait(bucket)` in `src/http/rate-limiter.ts`.** Eine nicht blockierende Abschätzung der
Wartezeit auf den nächsten Token, neben dem vorhandenen `SlowWaitNotifier`. Sie ist die
Voraussetzung für Festlegung 5 aus [Abschnitt 6](#6-rate-limit) und keine Umgehung des Eimers.

Dazu die eine Änderung an `src/response/truncate.ts` aus
[Abschnitt 3](#3-der-gemeinsame-bündelvertrag).

---

## 10. Verworfene Ideen

Jede mit dem Grund, aus dem sie verworfen ist.

**Offene Belege als eigenes Werkzeug mit einem Aufruf je Beleg** (Vorschlag des Orchestrators).
Verworfen auf gemessener Grundlage. `/receipts/get` kennt den Filter `payment_status` mit den
Werten `paid` und `unpaid`; gemessen (M3) liefert `inbound` mit `unpaid` genau 10 Zeilen,
während derselbe Aufruf ohne Filter eine volle Seite mit 500 Zeilen liefert. Die Frage kostet
also einen gefilterten Aufruf je Richtung. Das vorgeschlagene Bündel hätte bei diesem Mandanten
über 500 Requests abgesetzt und das Minutenlimit fünffach gerissen, für dasselbe Ergebnis.
Übernommen als Parameter `payment_status` in `bb_records_collect`.

**Offene Belege im Sinn von „Belege ohne zugeordnete Zahlung".** Verworfen: Die Belegliste führt
kein Zuordnungsfeld. `link_to_receipt_id_by_customer` war in einer Messung bei allen 209
Ausgangsbelegen null und ist eine Beleg-zu-Beleg-Verknüpfung, keine Zahlungszuordnung. Die
Zuordnung wäre nur mit einem Aufruf je Beleg zu ermitteln. Ersetzt durch die fachlich richtige
und billige Frage: offen gleich unbezahlt laut `payment_status`.

**Ein offener Betrag aus `amount` minus `amount_paid`.** Verworfen, und das ist die wichtigste
Verwerfung dieser Vorlage. Gemessen (M2) tragen auch Belege, die BuchhaltungsButler selbst als
bezahlt ausweist, `amount_paid` = "0.00". Die Rechnung hätte jede bezahlte Rechnung als
vollständig offen gemeldet.

**Fälligkeitsklassen (nicht fällig, 1 bis 30, 31 bis 60, über 90 Tage) über die Belegliste.**
Verworfen: Gemessen (M3) ist `due_date` bei nur 2 von 10 unbezahlten Belegen gefüllt. Eine
Alterstabelle, die 80 Prozent der offenen Posten in einer Restklasse sammelt, sieht aus wie eine
Auswertung und ist keine. `bb_records_collect` gibt `due_date` als Feld aus, klassifiziert aber
nicht.

**Summen je Währung als Array.** Verworfen: Gemessen (M2) führt die Belegliste überhaupt kein
Feld `currency`. Die Aufteilung wäre nicht berechenbar. Die Fremdwährungsfelder gibt es nur am
Einzelabruf (Live-Befund 2).

**`bb_receipts_find`, Beleg über beide Richtungen suchen, als eigenes Werkzeug** (Vorschlag des
Orchestrators). Verworfen als Definition, übernommen als Parameter. Es spart genau eine Runde
und überschneidet sich fast vollständig mit `bb_records_collect` mit `resource=receipts`,
`list_direction=both` und `invoicenumber`. Preis der Streichung: null.

**`bb_accounts_statement`, Kontoauszug nach Kontoname, als eigenes Werkzeug** (Vorschlag des
Orchestrators). Verworfen. Gemessen (M4) liefert `/accounts/get` 5 Zeilen mit 343 Byte; die
Namensauflösung kostet eine billige Runde. Der Ablauf steckt vollständig in
`bb_records_collect` mit `resource=transactions` und `account`. Bemerkenswert ist, dass der Vorschlag
beim **anderen** Kontotyp richtig gewesen wäre: Bei den Sachkonten sind es gemessen 1.281
Zeilen, und genau deshalb ist die Auflösung dort in `bb_masterdata_search` die Hauptsache.

**Ein eigenständiger Namensauflöser `bb_accounts_resolve`.** Verworfen, obwohl die Funktion die
wertvollste des Entwurfs ist: Als eigenes Werkzeug faltet er keine Runde, er verschiebt sie nur
(erst auflösen, dann benutzen). Eingebaut in die Bündel, die ihn brauchen, fällt die Runde ganz
weg.

**Ein getrenntes `bb_context_get` neben `bb_masterdata_search`.** Verworfen: Es ist derselbe
Vorgang, einmal ohne und einmal mit Suchbegriff. Zwei Definitionen für einen Vorgang kosten rund
1.000 Token für nichts.

**`/settings/get/debtors` und `/settings/get/creditors` im Stammdatenbündel.** Verworfen auf
gemessener Grundlage (M1): Die Personenkonten stehen mit Nummer und Name bereits im
Kontenrahmen, unterscheidbar über `type`. Die beiden Endpunkte liefern zusätzlich Adresse und
Bankverbindung, und die braucht die Frage „welche Kontonummer hat Firma X" nicht. Spart zwei
Requests und rund 14 KB internen Verkehr je Aufruf. Ein Anschlusssatz verweist auf
`bb_debtors_search` und `bb_creditors_search`.

**Die vollständige Sachkontenliste in einer Antwort.** Verworfen, gemessen: 1.281 Zeilen sind
rund 248 KB und damit grob 60.000 Token, das Dreifache der harten Antwortgrenze. Eine Antwort,
die der Server hinterher generisch abschneidet, ist schlechter als eine, die von vornherein
zusammenfasst und sagt, dass sie zusammenfasst.

**Automatische Erkennung des Kontenrahmens (SKR03 gegen SKR04).** Verworfen: Die dokumentierte
Erkennung prüft die Existenz einer bestimmten Kontonummer, und
`/settings/get/postingaccounts` kennt keinen Nummernfilter. Nicht nötig: `standard_chart` steht
gemessen (M5) ohnehin in jeder Kontenblattzeile und wird dort ausgewiesen, wo es umsonst
mitkommt.

**Die Rechnungsnummer als dritter Einstieg in `bb_assignments_get`.** Verworfen: Sie machte die
Rückgabeform verzweigt (Dossier oder Trefferliste je nach Eindeutigkeit) und damit das
`outputSchema` weich. Die Frage „ist Rechnung X bezahlt" beantwortet `bb_records_collect` mit
`invoicenumber` bereits in einem Aufruf, weil `payment_date` gemessen der verlässliche
Zahlungshinweis ist; wer zusätzlich wissen will, **welche** Zahlung sie beglichen hat, ruft
`bb_assignments_get` mit der Belegnummer auf. Zwei einfache Aufrufe schlagen einen verzweigten.

**Das Kontenblatt als dritter Wert von `report_type` in `bb_reports_run`.** Verworfen aus einem
Annotationsgrund. Das Kontenblatt wird on the fly erzeugt und braucht kein `create`, ist also
rein lesend; BWA und Summenliste sind Klasse AR mit `destructiveHint` true. Ein gemeinsames
Werkzeug müsste die strengere Annotation tragen und wäre im Nur-Lesen-Modus gesperrt, obwohl es
nichts ändert. Eine Annotation, die je nach Parameterwert etwas anderes bedeutet, ist keine
Annotation mehr.

**Ein Parameter an `bb_reports_run`, der das `create` verbietet und nur abholt.** Verworfen: Die
Guard-Reihenfolge in `register-tools.ts` prüft den Nur-Lesen-Schalter **vor** dem Schema; eine
parameterabhängige Sperre kehrte diese Reihenfolge um. Außerdem wäre ein Werkzeug, das je nach
Argument schreibt oder nicht, in den Annotationen nicht ehrlich abbildbar. Es bleibt bei der
Linie aus `tool-design.md` 9.5: ganz gesperrt, mit Verweis auf die lesenden Wege.

**Ein `confirm`-Parameter oder ein Trockenlauf an `bb_reports_run`.** Verworfen, weil
`tool-design.md` 9.4 als verbindliche Entscheidung des Projektinhabers jedes serverseitige
Bestätigungsmuster ausschließt.

**Berichtsdateien (BWA-PDF, SuSa-CSV, `csv_archive`) in einem Bündel.** Verworfen: Die Inhalte
kommen base64-kodiert und sprengen die Antwortgrenzen um Größenordnungen. Nach
`docs/api/berichte.md` 4.6 Punkt 1 ist zudem unklar, ob bei der BWA überhaupt je eine Datei
entsteht.

**Ein generisches Sammelwerkzeug mit einem `resource`-Enum, das auch `postings` mit anderen
Pflichtfeldern trägt.** Nicht ganz verworfen, aber begrenzt: `bb_records_collect` trägt die drei
Bereiche, die bedingten Pflichtfelder werden über Querprüfungen nach Q1 bis Q9 erzwungen und
ausdrücklich **nicht** über `oneOf`, das mehrere Clients nachweislich schlecht vertragen.

**Ein Zerlegen des Kontenblattzeitraums in Monatsfenster mit fortgeschriebenem Startsaldo.**
Verworfen war das aus Ehrlichkeitsgründen, weil die Bildung des Startsaldos nicht verifiziert
war. Durch M6 ist die Frage inzwischen beantwortet, das Bündel bleibt trotzdem gestrichen: Es
wird nicht gebraucht, weil der Eröffnungssaldo ohnehin enthalten ist und ein Fenster genügt.

**Ein Monatsabschluss-Bündel** über Belege, Zahlungen, Buchungen, offene Posten und Summenliste.
Verworfen: Die Aufrufzahl wäre unbeschränkt, es risse das Minutenlimit allein, und seine Antwort
passt in keine Antwortgrenze. Ein Bündel, dessen Ergebnis nicht in die Antwort passt, ist kein
Bündel, sondern ein Versprechen.

**Ein Werkzeug „Gewinn im Zeitraum", das den Gewinn aus Buchungen summiert.** Verworfen: Es
erzeugte eine zweite Gewinnzahl neben der, die BuchhaltungsButler selbst berechnet. Zwei
Gewinnzahlen aus derselben Quelle sind in einer Buchhaltung schlimmer als keine, und die
Abweichung fände niemand mehr, weil die BWA nur bestätigte Buchungen berücksichtigt und
`/postings/get` nicht danach unterscheidet.

**Jedes schreibende Bündel** (Beleg anlegen und buchen, Beleg hochladen und zuordnen,
Stapelzuordnung, automatische Zuordnung nach Betrag und Datum). Verworfen. Drei Gründe, jeder
für sich ausreichend: Es gibt keine Idempotenzschlüssel und für mehrere der Endpunkte kein
Gegenstück zum Aufheben, ein Teilerfolg hinterließe also einen halb angelegten Zustand im echten
Mandanten, den das Bündel nicht aufräumen kann. `tool-design.md` 9.6 Punkt 5 verbietet zudem
ausdrücklich einen Autopilot-Pfad, der Suchen und Schreiben in einem Aufruf verbindet. Und die
vier gesetzten Abläufe des Projektinhabers sind bis auf die Berichtserzeugung alle lesend. Falls
so etwas kommt, gehört es als eigene Entscheidung vorgelegt, nicht nebenbei in einen Satz
Lesewerkzeuge geschmuggelt.

**Ein Bündel für die Gruppe `invoices`.** Verworfen: Alle drei Werkzeuge schreiben. Die Gruppe
wiegt zwar 5.766 Token, aber das ist ein Fall für den Gruppenschalter, nicht für ein Bündel.

**Ein Bündel „Mahnliste".** Verworfen: Die API bietet keinen Mahnendpunkt. Alles, was daraus
entstünde, wäre eine schön formatierte Liste, die `bb_records_collect` mit
`payment_status=unpaid` bereits liefert; der Rest ist Textarbeit im Chat, kein Werkzeug.

**Ein Meta- oder Katalogwerkzeug nach dem Dreischichtmuster** (`search_tools`,
`get_tool_details`) als Ersatz für die 54 Definitionen. Verworfen, übereinstimmend mit
`werkzeugkontext-clients.md` 6b und mit N1: Es verlagert die Werkzeugauswahl in unseren Server,
verliert jede clientseitige Schemaprüfung und bricht mit dem Muster, das alle Clients erwarten.
Der Gruppenschalter aus N5 löst dasselbe Problem mit vorhandener SDK-Mechanik.

**Ein eigener Rate-Limit-Eimer für Bündel und eine eigene Umgebungsvariable
`BB_MCP_MAX_BUNDLE_REQUESTS`.** Verworfen: Ein Bündel, das aus einem eigenen Kontingent schöpft,
macht die Buchführung des bestehenden Eimers zur Lüge und lässt zwei Zähler dasselbe Minutenlimit
verwalten. Die Obergrenzen je Bündel stehen fest im Register; `BB_MCP_RATE_LIMIT` bleibt die
einzige Stellschraube.

**Ein Schalter „ohne Seitenbegrenzung blättern".** Verworfen: Er risse bei diesem Mandanten das
Minutenkontingent und erzeugte ein Ergebnis, das in keine Antwort passt.

**Fortschrittsmeldungen (MCP progress notifications) als tragendes Element der Warteschleife.**
Verworfen als Fundament, aufgehoben als spätere Verbesserung: Ob Claude Desktop einen
`progressToken` sendet, ist in diesem Projekt nicht gemessen, und vor allem ändern sie nichts am
eigentlichen Problem — bricht der Client ab, ist der Bericht trotzdem erzeugt und der vorherige
trotzdem ersetzt.

**Aufgabe bestehender Endpunktwerkzeuge zugunsten der Bündel.** Verworfen, weil N1 es untersagt,
und sachlich richtig: `bb_reports_get_bwa` und `bb_reports_get_sums` sind Klasse R und damit der
einzige Weg, im Nur-Lesen-Modus an einen bereits erzeugten Bericht zu kommen, und zugleich der
Fortsetzungsweg, wenn die Warteschleife von `bb_reports_run` in ihr Zeitlimit läuft. Ein Bündel,
das seine Einzelwerkzeuge mitnimmt, nimmt sich selbst den Notausgang.

---

## 11. Entschiedene Streitfragen

Wo die drei Entwürfe auseinandergingen, und wie entschieden ist.

**S1 — Wie viele Bündel?** Acht gegen vier gegen sechs. **Entschieden: fünf.** Vier decken N3 ab,
das fünfte (`bb_balances_get`) kommt aus einer eigenen Messung hinzu. Jedes hält den Prüfstein
des Projektinhabers aus, seinen Gewinn in einem Satz zu begründen. Acht wäre über die Empfehlung
aus 6b hinausgegangen, vier hätte den Kontostand ausgelassen, obwohl M6 ihn gerade erst
lieferbar gemacht hat.

**S2 — Offener Betrag aus `amount_paid`?** Ein Entwurf ja, einer nein, einer schwieg.
**Entschieden: nein, gemessen.** M2 und M3 zeigen `amount_paid` = "0.00" auch bei bezahlten
Belegen. Die Rechnung hätte jede bezahlte Rechnung als offen gemeldet. Das ist die
folgenreichste Korrektur dieser Vorlage.

**S3 — Wie viele Sachkonten hat der Mandant?** Ein Entwurf „mehr als 1.000, nicht ermittelt",
einer „1.281". **Entschieden durch Messung: 1.281**, erreichbar in genau zwei Seiten. Daraus
folgt die Seitenobergrenze 3 in `bb_masterdata_search` und die Zusage, dass ein Nulltreffer bei
`complete` = true belastbar ist.

**S4 — Schreibt das Kontenblatt den Eröffnungssaldo fort?** Von keinem Entwurf gemessen, von
einem ausdrücklich als wichtigste offene Frage an den Projektinhaber gegeben. **Entschieden durch
Messung (M6): ja.** Erst dadurch ist `bb_balances_get` vertretbar, und erst dadurch darf die
Antwort das Wort Kontostand überhaupt verwenden.

**S5 — Ein eigenes Kontextwerkzeug neben der Stammdatensuche?** Ein Entwurf ja, zwei nein.
**Entschieden: nein, zusammengelegt.** Es ist derselbe Vorgang mit und ohne Suchbegriff, und
zwei Definitionen kosten rund 1.000 Token für nichts.

**S6 — Neue Verben: `run`, `collect`, `scan`?** **Entschieden: genau zwei, `run` und `collect`.**
`scan` wäre ein Beinahe-Synonym zu `collect` gewesen; eine geschlossene Verbliste um ein drittes
Wort für dieselbe Sache zu erweitern, widerspricht ihrem Zweck. `collect` ist zudem die Wortwahl
des Projektinhabers in N3b.

**S7 — Hängen Bündel an ihren Endpunktgruppen?** Ein Entwurf ja mit Enum-Beschneidung, zwei
nein. **Entschieden: nein.** Drei Gründe in [Abschnitt 7](#7-der-gruppenschalter); der
entscheidende ist, dass die Gegenregel unter `BB_MCP_TOOL_GROUPS=bundles` gar nichts
registrierte und damit ihren eigenen besten Anwendungsfall zerstörte.

**S8 — Gruppennamen `cost`/`payment` oder ausgeschrieben?** **Entschieden: ausgeschrieben**,
`cost_locations` und `payment_accounts`. Die Variable wird von einem Menschen getippt, der die
Werkzeugnamen sieht. Messtabelle und README werden nachgezogen.

**S9 — Dürfen Positiv- und Negativliste gleichzeitig gesetzt sein?** Ein Entwurf nein
(Startfehler), zwei ja. **Entschieden: ja, mit zwei zusätzlichen Startfehlern.** Ein Name in
beiden Listen ist ein echter Widerspruch; ein Name in der Negativliste, der nicht in der aktiven
Menge liegt, ist ein Schalter ohne Wirkung. Beide Fälle brechen den Start ab. Die verbleibende
Regel „Positivliste minus Negativliste" ist die am wenigsten überraschende, die es gibt.

**S10 — Ist ein leerer Variablenwert ein Startfehler?** Zwei Entwürfe ja. **Entschieden: nein, er
gilt als nicht gesetzt.** Grund: `.mcpb/manifest.template.json` setzt Variablen über
`${user_config.<name>}`; ein Startfehler auf den leeren Wert machte das Desktop-Bundle für jeden
unstartbar, der das optionale Feld leer lässt. Das ist genau die Nutzergruppe aus N2.

**S11 — Braucht es einen vierten Zustandssatz für Teilausführung?** Ein Entwurf ja.
**Entschieden: nein.** Zustandssätze stehen in Fehlermeldungen; ein Bündel mit Teilerfolg ist ein
**Erfolg** mit `complete` = false und gefüllten `gaps` und rendert gar keine
Fehlermeldung. `src/errors/render.ts` bleibt unberührt.

**S12 — `anthropic/alwaysLoad` für zwei bis drei Bündel?** Zwei Entwürfe ja.
**Entschieden: für keines.** Es bezahlte den vollen Definitionspreis in genau den Clients, in
denen die Deferral ihn erspart, und bewirkt nichts in Claude Desktop, dem Hauptclient nach N2.
`searchHint` bekommt dagegen jedes Bündel.

**S13 — Feste oder bedingte Anreicherung in `bb_assignments_get`?** Ein Entwurf fest bis zu
fünfmal, einer gar nicht. **Entschieden: bedingt, höchstens dreimal**, und zwar nur für Zeilen,
denen die fachlich nötigen Felder tatsächlich fehlen. Die Feldmenge von
`/transactions/assigned-receipts/get` ist nicht gemessen, und Live-Befund 2 hat gezeigt, dass die
Spezifikation Antwortfelder unterschlägt. Eine Entscheidung an der zurückgekommenen Zeile ist
unter beiden Ausgängen richtig.

**S14 — Namensauflösung in `bb_balances_get` auch über Sachkonten?** Ein Entwurf ja mit bis zu
drei Seiten. **Entschieden: nein, nur über `/accounts/get`.** Bis zu drei Seiten zu je 196 KB für
ein einziges Wort sind der teuerste Weg zu einer Kontonummer, den dieser Server hat. Wer ein
Sachkonto will, schlägt die Nummer mit `bb_masterdata_search` nach.

**S15 — Wohin mit dem Tokenbudget der Bündel?** Ein Entwurf: eigene Grenze von 3.000. **Entschieden:
eigene Grenze, aber 7.000**, weil die nachgerechnete Schätzung 6.168 ergibt und 3.000 nicht
baubar wäre. `TOTAL_TOOL_DEFINITION_TOKEN_BUDGET` bleibt bei 49.000 und wird nicht angehoben.

**S17 — Deutsche oder englische Parameter- und Feldnamen?** Alle drei Entwürfe schlugen
deutsche Namen vor (`bereich`, `richtung`, `konto`, `bericht`, `art`, `vollstaendig`,
`schritte`). **Entschieden: englisch, wie bei den 54 Endpunktwerkzeugen.**
`src/registry/types.ts` hält als Entscheidung E4 fest: „Bezeichner und Aufzählungswerte sind
englisch. Deutsch sind ausschließlich die Texte, die ein Agent liest: description, title,
Parameterbeschreibungen, Fehlertexte und die instructions." Deutsche Feldnamen hätten eine
zweite Sprache im Schema eingeführt, hätten die Bündel von den 54 Werkzeugen abgesetzt, mit
denen sie im selben Kontextfenster stehen, und hätten Digraphen als Umlautersatz erzwungen,
weil Bezeichner ASCII sein müssen. Wo ein Bündel denselben Filter anbietet wie ein
Endpunktwerkzeug, trägt das Feld **denselben Namen** (`date_from`, `date_to`, `payment_status`,
`counterparty`, `invoicenumber`, `list_direction`, `confirmed_only`, `base`,
`receipt_id_by_customer`, `transaction_id_by_customer`); `list_direction` bekommt dabei den
zusätzlichen Wert `both`, und das ist die einzige Erweiterung eines übernommenen Wertebereichs.
Zwei Felder heißen `account`, also wie der Body-Parameter der API, und nehmen abweichend von
den Endpunktwerkzeugen zusätzlich einen Kontonamen entgegen; ihre Beschreibung nennt das
jeweilige Geschwisterfeld ausdrücklich, damit niemand raten muss.

**S16 — Aufrufobergrenze je Bündel: 6, 10 oder 20?** **Entschieden: höchstens 10**, also ein
Sechstel des vorgegebenen Eimers und ein Zehntel des dokumentierten Limits. 20 ließe einem
einzigen Aufruf ein Fünftel des Minutenkontingents; 6 wäre für die Warteschleife von
`bb_reports_run` zu eng.

---

## 12. Befunde außerhalb des Auftrags

Gefunden bei der Arbeit an dieser Vorlage, nicht Teil des Auftrags, hier erfasst, damit sie
nicht verloren gehen.

**B1 — Ein ausgeliefertes Werkzeug überschreitet die 64-Zeichen-Grenze der Messages API.**
**Behoben am 2026-09-13**, siehe den Nachtrag am Ende dieses Befundes. Der Befund im Wortlaut:
`SERVER_NAME` in `src/cli/clients/types.ts` war `buchhaltungsbutler`, das Clientpräfix lautete
also `mcp__buchhaltungsbutler__` und war 25 Zeichen lang.

```
mcp__buchhaltungsbutler__bb_postings_create_for_transaction_batch   = 65 Zeichen
```

Das ist ein Zeichen über der Grenze, die `werkzeugkontext-clients.md` 6a Punkt 3 als belegt
führt und deren Prüfung dort ausdrücklich für die Veröffentlichungs-Checkliste vorgesehen war.
In `docs/entwicklung/veroeffentlichungs-checkliste.md` und in
`docs/entwicklung/skeptiker-befunde.md` ist die Prüfung nicht erfasst; sie ist offenbar nie
ausgeführt worden. Das zweitlängste Werkzeug liegt mit 62 Zeichen knapp darunter. **Schwere:
mittel bis hoch**, weil ein betroffenes Werkzeug in einem Host auf Basis der Messages API
ausfällt, und zwar erfahrungsgemäß ohne sprechende Meldung. Drei Wege stehen offen, alle drei
sind Entscheidungen des Projektinhabers: den Werkzeugnamen kürzen (verletzt E1 nicht, ändert aber
einen ausgelieferten Namen), `SERVER_NAME` kürzen (etwa auf `bbutler`, wie das `.mcpb`-Bundle es
mit `bbutler-mcp` bereits tut, und damit 11 Zeichen gewinnen), oder es dokumentieren und in Kauf
nehmen. Die fünf Bündel sind nicht betroffen; ihr knappster Abstand beträgt 19 Zeichen.

**Nachtrag vom 2026-09-13 — behoben, zweiter Weg gewählt.** `SERVER_NAME` steht auf `bbutler`;
das Präfix ist damit 14 Zeichen lang, der längste ausgelieferte Name
`mcp__bbutler__bb_postings_create_for_transaction_batch` misst 54 Zeichen und hat 10 Zeichen
Luft. **Kein ausgelieferter Werkzeugname wurde angefasst**, Entscheidung E1 bleibt unberührt;
gekürzt wurde allein der Name des Konfigurationseintrags. Weil das die Einträge bestehender
Installationen ändert, führt `src/cli/clients/types.ts` zusätzlich `LEGACY_SERVER_NAMES`: Die
Adapter erkennen beim `setup` einen Eintrag unter dem alten Namen und lassen ihn ohne
`--overwrite` unangetastet, statt einen zweiten daneben zu legen, und `uninstall` entfernt beide
Namen. Die Grenze selbst hängt seither an einer Prüfung statt an einer Rechnung im Fließtext:
`test/registry/name-length.test.ts` rechnet sie für **jedes** Werkzeug aus `TOOL_ENTRIES` und
`BUNDLE_ENTRIES` nach und nennt im Fehlerfall den längsten Namen samt Länge; die
Veröffentlichungs-Checkliste führt sie in Abschnitt 1.

**B2 — Ein Antwortfeld, das kein Entwurf und keine Dokumentation nennt.** `/receipts/get`
liefert neben `amount_paid` ein Feld `amount_paid_fixed`, gemessen in M2 und M3, in beiden
Messungen durchgehend "0.00". Es steht weder in der Spezifikation noch in `docs/api/receipts.md`.
Der Antwortvertrag von `bb_receipts_search` sollte es aufnehmen, damit es nicht als unbekanntes
Feld gemeldet wird; seine Bedeutung ist **nicht ermittelt**.

**B3 — `amount_paid` ist in diesem Mandanten funktionslos, und die Werkzeugbeschreibung sagt es
nicht.** Der Befund aus M2 und M3 betrifft nicht nur die Bündel: Auch ein Agent, der das
ausgelieferte `bb_receipts_search` benutzt, wird `amount_paid` für eine Teilzahlungsangabe
halten. Die Feldbeschreibung in `src/registry/tools/bb_receipts_search.ts` sollte den Warnsatz
tragen, dass der Zahlungsstatus allein aus `payment_status` und `payment_date` folgt. Ob das Feld
in anderen Mandanten gefüllt ist, ist **nicht ermittelt** — gemessen ist nur dieser eine Mandant.

**B4 — `bb_reports_get_ledger` verliert bei langen Zeiträumen genau die Zeile mit dem Saldo.**
Gemessen (M5) sind 828 Zeilen zu je 723 Byte rund 146.000 Token. Der Registereintrag trägt
`concise: []` und `shape: "ack"`, liefert also alle 24 Felder ungekürzt, bis die generische
Kürzung greift — und die schneidet das Ende ab. Unabhängig von `bb_balances_get` wäre eine
`concise`-Projektion für dieses Werkzeug angebracht.

---

*Ende der Bauvorlage.*
