# Skeptikerbefunde (AP22)

**Stand:** 2026-09-13. **Gegenstand:** das Gesamtergebnis der Arbeitspakete AP01 bis AP21.
**Verfahren:** Prüfung mit frischem Kontext nach `docs/entwicklung/umsetzungsplan.md` 11.2
(AP22) und Abschnitt 12, Streitfrage S26.

**Haltung dieser Prüfung.** Sie sucht Fehler und versucht zu widerlegen. Jede Aussage unten ist
entweder **selbst gemessen** (Befehl und Ausgabe genannt), **aus einer Messung abgeleitet** (die
Ableitung ist genannt) oder ausdrücklich als **nicht verifiziert** gekennzeichnet. Wo ein
früheres Arbeitspaket etwas festgestellt hat, ist es hier **nachgemessen** und nicht
abgeschrieben; an zwei Stellen weicht das Ergebnis von der Vorlage ab (S2, S10).

---

## 0. Die beiden Feststellungen, die der Plan ausdrücklich verlangt

### 0.1 Kein unumkehrbarer Schritt wurde ausgeführt

Umsetzungsplan 11.2, AP22 verlangt diese Feststellung ausdrücklich. Sie wird hier **belegt und
nicht behauptet**:

| Unumkehrbarer Schritt | Befund | Beleg |
| --- | --- | --- |
| `npm publish` | **nicht ausgeführt** | `npm view @dennismenken/buchhaltungsbutler-mcp version` antwortet mit HTTP 404, ebenso `npm view bbutler-mcp version`. Beide Namen sind auf der Registry unbesetzt |
| `git tag` | **nicht ausgeführt** | `git tag -l` liefert keine Ausgabe |
| `git push` / GitHub-Repository | **nicht möglich und nicht geschehen** | `git remote -v` liefert keine Ausgabe; es ist kein Remote eingerichtet. `git log` meldet „your current branch 'main' does not have any commits yet" — es existiert **kein einziger Commit** |
| Auslösen von `publish.yml` | **nicht ausgeführt** | Der Workflow wird ausschließlich durch einen Tag `v*.*.*` ausgelöst; es gibt keinen Tag und kein Remote, auf dem er laufen könnte |
| Schreibender Aufruf gegen die Produktivbuchhaltung | **nicht ausgeführt** | `docs/entwicklung/befund-schreibend.md` Abschnitt 6 stellt es für AP19 fest (0 von 8 Aufrufen verbraucht). Diese Prüfung selbst hat **keinen einzigen** Aufruf gegen die BuchhaltungsButler-API abgesetzt, weder lesend noch schreibend; alle Messungen liefen gegen Quelltext, Testlauf und Paketstand |

**Ergänzende Beobachtung, damit der Stand vollständig ist:** Das Arbeitsverzeichnis **ist** ein
Git-Repository mit dem Zweig `main`, ohne Commit, ohne Tag, ohne Remote. Im Index liegen genau
17 vorgemerkte Dateien: 16 Dossiers unter `docs/` und `.gitignore`. Das ist der Ausgangsbestand
des Projekts vor Beginn der Arbeit, nicht das Ergebnis einer Git-Operation eines
Arbeitspakets. Weder `dist/`, noch `node_modules/`, noch `*.mcpb`, noch
`src/registry/index.generated.ts`, noch eine `.env` sind vorgemerkt; geprüft über
`git ls-files --cached`.

### 0.2 Stand von AP19b: **entfallen**

AP19b ist **ersatzlos entfallen** und steht nicht mehr aus.

**Begründung, nachgeprüft:** Umsetzungsplan 11.2 legt für AP19b fest: „Es läuft nur, wenn es
etwas zu tun gibt. Liefert AP19 kein belegtes Ergebnis, entfällt AP19b ersatzlos, und AP22 hält
das fest." `docs/entwicklung/befund-schreibend.md` stellt fest, dass **kein Testmandat außerhalb
der Produktivbuchhaltung vorliegt** und deshalb kein einziges Verhalten neu gemessen wurde; die
Arbeitsliste für AP19b ist dort in Abschnitt 4 als leer ausgewiesen, Zeile für Zeile.

**Gegenprobe am Code, nicht am Bericht.** Träfe die Feststellung nicht zu, müssten sich
Registereinträge geändert haben. Sie haben es nicht:

- `bb_receipts_delete` und `bb_receipts_restore` tragen unverändert `verified: false`.
- `bb_receipts_get` und `bb_transactions_get` tragen kein `verified`-Feld, sind also als
  gemessen geführt (L1).
- `idempotentHint` ist ausschließlich bei den Klassen R und M `true`; alle löschenden und
  aufhebenden Werkzeuge tragen `false`.
- `bb_postings_assign_receipt` trägt unverändert `destructiveHint: false` (Klasse B).
- Die Auszählung steht unverändert bei 13 mal `destructiveHint: true` und 19 mal
  `idempotentHint: true`.

Damit ist der Auslieferungszustand aus Plan 3.3, 3.8 und 3.9 unangetastet, und der Plan wurde
nicht rückwirkend geändert.

**Was das offen lässt:** Sobald der Projektinhaber ein Testmandat einrichtet, ist AP19 erneut
auszuführen und AP19b lebt wieder auf. Bis dahin bleiben die vier Fragen aus Plan 9.9 offen;
sie sind in 14.2 des Plans, in `befund-schreibend.md`, in `CHANGELOG.md` und in README
Abschnitt 17 als nicht verifiziert geführt. Das ist konsistent und nirgends beschönigt.

---

## 1. Ergebnis der Prüfung in drei Sätzen

Der Server ist in seinem Kern richtig gebaut: Der eine generische Ausführungspfad, die
Guardreihenfolge, die Trennung von lesendem und schreibendem Retry, die Fehlerabbildung über
(`specPath`, `error_code`, HTTP-Status), der Antwortvertrag je Endpunkt und der Pfadbau der vier
Platzhalterendpunkte halten der Prüfung stand und sind **selbst nachgemessen** (Abschnitt 4).
Es gibt jedoch **einen stillen Datenfehler in der Antwortdarstellung**, der in einer Buchhaltung
genau die Fehlerklasse trifft, die Plan 1.2 Punkt 5 und 1.3 ausschließen wollen (S2), und der
Auslieferungsstand **übersetzt nicht und besteht seine eigenen Prüfungen nicht** (S1, S4, S5).
Veröffentlichungsreif ist der Stand damit nicht; die Veröffentlichungskette blockiert das
allerdings von sich aus, und das ist ein Verdienst des Entwurfs und kein Zufall.

**Gesamtzahl der Befunde: 14.** Davon vier veröffentlichungsblockierend (S1 bis S4), sechs
sachliche Mängel ohne Blockadewirkung (S5 bis S10) und vier geringfügige (S11 bis S14). Zwei
weitere Punkte sind **begründet als akzeptiert** dokumentiert (Abschnitt 6).

---

## 2. Befunde, nach Schaden geordnet

„Schaden" heißt hier wie in `befund-evaluation.md`: Wie wahrscheinlich ist es, dass der Nutzer
eine falsche Auskunft bekommt oder ein falscher Schreibvorgang stattfindet, **ohne dass es
jemandem auffällt**?

### S1 — Der Auslieferungsstand übersetzt nicht (blockierend)

**Selbst gemessen:** `pnpm typecheck` endet mit Rückgabewert 2.

```
src/upload/ssrf.ts(645,18): error TS2322: Type 'GuardedLookup' is not assignable to
type 'LookupFunction'.
  Types of property 'family' are incompatible.
    Type 'number | "IPv4" | "IPv6" | undefined' is not assignable to type 'string | number'.
```

**Ursache, nachgeprüft:** `GuardedLookup` (`src/upload/ssrf.ts:309`) deklariert
`readonly family?: number | string`. Unter `exactOptionalPropertyTypes: true` ist das **nicht**
dasselbe wie `number | string | undefined`, und genau das liefern die Node-Typen an der
Einsetzstelle `src/upload/ssrf.ts:645`.

**Laufzeitrisiko: gering, aber nicht null.** `normalizeFamily` verarbeitet `undefined` korrekt
und liefert dann `0`, also „keine Familienvorgabe". Der Fehler ist damit ein reiner Typfehler,
**kein** Loch im SSRF-Schutz. Die Wirkung liegt woanders: Plan-Arbeitsweise verlangt „Ein Paket,
das nicht übersetzt, ist nicht fertig", `ci.yml` führt `typecheck` aus, und `prepublishOnly`
in `package.json` ruft `pnpm run typecheck` vor jedem `npm publish` auf. Der Stand ist also
mechanisch nicht veröffentlichbar.

**Konkrete Behebung:** In `src/upload/ssrf.ts:309` das Feld als
`readonly family?: number | string | undefined` deklarieren (ebenso `hints` und `all`, sofern
dieselbe Meldung dort auftritt). Kein Verhalten ändert sich.

**Datei außerhalb meiner Zuständigkeit:** `src/upload/ssrf.ts` (AP13).

### S2 — Ein negativer Betrag verliert im Textblock sein Vorzeichen (blockierend)

Das ist der schwerste Befund dieser Prüfung. `befund-evaluation.md` führt ihn als V4 und E-1;
**die dortige Eingrenzung ist jedoch zu eng**, und das ist ein eigener Befund dieser Prüfung.

**Ursache, nachgeprüft:** `src/response/sanitize.ts:35` definiert
`LINE_START_MARKUP = /^[\s>#*+\-=|]+/`, und `sanitizeText` (Zeile 50) wendet den Ausdruck auf
**jeden** Zeichenkettenwert an. Der Ausdruck soll verhindern, dass Fremdtext sich als
Markdown-Struktur tarnt; er entfernt dabei das führende Minuszeichen eines Betrags.

**Selbst gemessen**, gegen die echten Module und nicht gegen eine Nachbildung:

```
sanitizeText("-192.44")  -> "192.44"
sanitizeValue("-884.65") -> "884.65"
```

**Die Ausbreitung ist größer als in `befund-evaluation.md` beschrieben.** Dort ist der Befund an
`bb_transactions_get` und an den Aufgaben 3, 4, 8 und 11 festgemacht. Gemessen sind **alle drei**
Darstellungswege betroffen:

| Weg | Funktion | Gemessene Ausgabe |
| --- | --- | --- |
| Listenantwort, Markdown-Tabelle | `renderTable`, `src/response/table.ts` | `\| 7 \| Beispiel GmbH \| 192.44 \|` bei Rohwert `"-192.44"` |
| Einzelsatz | `renderRecord`, `src/response/table.ts:73` | `amount: 192.44` bei Rohwert `"-192.44"` |
| **Bestätigungszeile nach einem Schreibvorgang** | `renderRecordInline`, `src/response/table.ts:82`, benutzt von `src/response/build.ts` | ebenfalls ohne Vorzeichen |

Der dritte Weg ist der gefährlichste und in keinem bisherigen Bericht genannt: Es ist die Zeile,
die ein Mensch **nach** einem schreibenden Aufruf liest, also die letzte Gelegenheit, einen
falschen Vorgang zu bemerken.

**Verschärfend, ebenfalls selbst gemessen:** Die `concise`-Projektion behält zu jedem
Betragsfeld dessen Centfeld (`project` in `src/mapping/response.ts:152`). Im Textblock stehen
damit **zwei einander widersprechende Werte nebeneinander**:

```
amount: 192.44
amount_cents: -19244
```

Das ist nicht nur ein Informationsverlust, sondern ein sichtbarer Selbstwiderspruch in der
Antwort. Betroffen ist jede Gutschrift unter `/receipts/*` und jede Auszahlung unter
`/transactions/*`; die projekteigene Golden-Datei `test/golden/receipts-get-list.json` trägt
`"amount": "-192.44"`.

**Warum das blockierend ist:** Plan 1.2 Punkt 5 und 1.3 benennen den stillen Datenfehler als
das, was ein Buchhaltungswerkzeug nicht machen darf. Eine Auszahlung, die als Einzahlung
erscheint, ist genau das. Ein Client ohne `structuredContent`-Auswertung und jeder Mensch im
Freigabedialog sehen ausschließlich den falschen Wert.

**Konkrete Behebung:** Die Markup-Bereinigung darf den Wert nicht am Anfang beschneiden, wenn
er eine Zahl ist. Tragfähig ist, `LINE_START_MARKUP` nur dann anzuwenden, wenn der Rest danach
**nicht** als Betrag oder Zahl lesbar ist, oder — sauberer — die Neutralisierung gegen Markdown
durch Voranstellen eines schmalen Schutzzeichens statt durch Entfernen zu lösen. Die Wahl
gehört dem Eigentümer von `src/response/sanitize.ts`; beide Wege erhalten das Vorzeichen. Der
vorhandene Test `E-1` in `test/eval/tasks.test.ts` hält den **Mangel** fest und wird bei der
Behebung planmäßig rot; er ist dann nachzuziehen (so in `befund-evaluation.md` Abschnitt 9
vorgesehen).

**Dateien außerhalb meiner Zuständigkeit:** `src/response/sanitize.ts` (AP09),
`test/eval/tasks.test.ts` (AP18).

### S3 — Die Schemameldung nennt jeden übergebenen Wert „undefined" (blockierend)

`befund-evaluation.md` führt ihn als V2 und E-3. **Erster Hand nachgemessen und bestätigt.**

**Ursache:** `describeIssue` in `src/server/register-tools.ts:196` bildet den Satz aus
`typeof issue.input`. Zod 4 führt `input` im fertigen Issue nicht mehr.

**Selbst gemessen** gegen das im Projekt installierte Zod:

```
z.object({a: z.string()}).strict().safeParse({a: 4980})
issue keys:   [ 'expected', 'code', 'path', 'message' ]
issue.input:  undefined
zod message:  "Invalid input: expected string, received number"
```

`typeof undefined` ist immer `"undefined"`. Der Server verwirft damit die Angabe, die Zod selbst
korrekt kennt, und behauptet stattdessen bei **jedem** Typfehler, das Feld sei nicht übergeben
worden. Ein Typfehler und ein fehlendes Feld sind aus der Meldung nicht mehr zu unterscheiden.

**Warum das mehr ist als eine Textschwäche:** Der Server sperrt nichts (E2). Seine einzige
Führung ist der Text. Eine Meldung, die dem Agenten sagt, er habe ein Feld nicht übergeben,
obwohl er es übergeben hat, führt zur unveränderten Wiederholung desselben Aufrufs. Der Effekt
trifft **alle 54 Werkzeuge**, nicht nur eines, und er hat im Evaluationslauf nachweislich eine
von elf Aufgaben mitverdorben.

**Konkrete Behebung:** `issue.message` von Zod übernehmen oder den tatsächlichen Wert aus den
Rohargumenten über `issue.path` nachschlagen. Die deutsche Fassung des Satzes kann bleiben.

**Datei außerhalb meiner Zuständigkeit:** `src/server/register-tools.ts` (AP10).

### S4 — Das Kontextbudget ist gerissen, P11 ist rot (blockierend)

**Selbst gemessen:** `pnpm test` meldet

```
test/registry/token-budget.test.ts > P11 Gesamtbudget
41569 Token für 54 Definitionen, erlaubt sind 32000
```

`docs/entwicklung/befund-tokenbudget.md` misst zusätzlich die **tatsächlich ausgelieferte**
Definitionsgröße mit **48.244 Token**. Beide Zahlen reißen die Grenze aus Plan 4.10; die zweite
ist die für den Nutzer maßgebliche, und README Abschnitt 17 sowie `CHANGELOG.md` nennen sie
korrekt mit rund 48.000.

**Was daran richtig gemacht wurde und hier ausdrücklich festgehalten wird:** Das Budget wurde
**nicht** stillschweigend angehoben. `src/registry/budget.ts` trägt unverändert 32.000, 2.100,
900, 700 und 480; nachgeprüft. Geändert wurde ausschließlich `CHARS_PER_TOKEN` von 3,2 auf 4,
und das ist nach Plan 4.10 die einzige Konstante dieser Datei, die AP14 ändern darf. Die
Rundungsrichtung ist die harmlose: Ein zu kleiner Faktor schätzt die Tokenzahl zu hoch und
kürzt eher zu früh, wie Plan 7.6 es verlangt.

**Was offen ist:** Plan 4.10 schreibt bei einer Überschreitung drei Schritte in fester
Reihenfolge vor (S1 bis S6 nachziehen, Stufe-3-Beschreibungen kürzen, Inhalte in Resources
verschieben) und danach: „ist das ein Befund für den Projektinhaber und keine Zahl, die der
Implementierungs-Agent selbst ändert." **Die drei Schritte sind nicht nachweislich durchlaufen
worden.** `befund-tokenbudget.md` Abschnitt 5 belegt, dass S6 umgesetzt ist (null Zeichen
Feldbeschreibung in allen 54 Ausgabeschemata) und dass der Überschuss überwiegend aus den
Schemarümpfen und den Parameterbeschreibungen stammt — also aus Posten, die in Plan 4.10 grob
unterschätzt waren. Das ist eine belastbare Diagnose, ersetzt aber die drei Schritte nicht.

**Einordnung dieser Prüfung:** Die Anhebung der Grenze ist eine Entscheidung des
Projektinhabers. Der Befund ist damit **nicht auflösbar durch einen Implementierungs-Agenten**
und wird hier als solcher vorgelegt, nicht als akzeptiert erklärt.

### S5 — P9 ist rot durch Fehlalarme, und das ist nicht harmlos

**Selbst gemessen:** `test/registry/secrets.test.ts` beanstandet zehn Golden-Dateien.

**Selbst nachgeprüft, ob dort wirklich etwas liegt — es liegt nichts dort.** Die beanstandeten
Zeichenketten sind im Einzelnen:

| Datei | Beanstandet | Tatsächlicher Inhalt |
| --- | --- | --- |
| `test/golden/entries.ts` | `api_key` | die Zeile `omitted: [{ apiName: "api_key", reason: … }]` einer Registerattrappe |
| sechs `receipts-*.json` | „schlüsselartige Zeichenkette der Länge 40" | der erfundene Dateiname `2026-01-04_Eingangsrechnung_ER-2026-0001` |
| `receipts-get-single-with-file.json`, `reports-get-bwa-with-files.json` | Längen 936 bis 1868 | base64, entschlüsselt: `Erfundener Dateiinhalt fuer die Golden-Datei.` |
| `receipts-get-list.json` | zusätzlich Länge 34 | die Herkunftszeile `docs/api/live-befunde-orchestrator` |

**Damit ist die für dieses Projekt wichtigste Einzelfrage positiv beantwortet: Es liegt kein
Zugangsdatum und kein echtes Geschäftsdatum in den Golden-Dateien.** Ergänzend selbst geprüft:
keine `.env` und keine `bb.env` im Projektbaum; `.env.example` trägt ausschließlich
`PLATZHALTER_*`-Werte; keine `Basic`-Literale; die einzige IBAN im Baum ist
`DE02120300000000202051`, die allgemein gebräuchliche Beispiel-IBAN.

**Warum der Befund trotzdem zählt:** Eine Sicherheitsprüfung, die dauerhaft rot steht, wird nach
kurzer Zeit überlesen. Dann fängt sie den echten Fall nicht mehr — und der echte Fall ist nach
dem Kommentarkopf der Datei selbst „der teuerste Fehler dieses Projekts". Eine rote Prüfung, die
niemand mehr liest, ist schlechter als keine.

**Konkrete Behebung**, ohne die Prüfung zu schwächen: `trefferIn` um zwei Einschränkungen
ergänzen — erstens die Heuristik `SCHLUESSELFORM` nur auf Kandidaten anwenden, die keine
offensichtliche Struktur tragen (Unterstrich-getrennte Dateinamen, reines base64 in bekannten
Dateifeldern wie `file_content`, `file_pdf`, `file_csv`); zweitens den Bezeichnerteil der
Prüfung in `test/golden/entries.ts` genauso behandeln wie in den Registereinträgen, wo `api_key`
im Feld `omitted` nach dem eigenen Kommentarkopf der Datei ausdrücklich erlaubt ist. Beides
verkleinert die Prüfung nicht, es schärft sie.

**Dateien außerhalb meiner Zuständigkeit:** `test/registry/secrets.test.ts` (AP11),
`test/golden/*` (AP09).

### S6 — `bb_postings_create_for_receipt` ist für Eingangsrechnungen nicht benutzbar

`befund-evaluation.md` führt ihn als V3. **Selbst am Registereintrag nachgeprüft:**
`src/registry/tools/bb_postings_create_for_receipt.ts` führt `creditor` (Zeile 163) **und**
`debtor` (Zeile 172) jeweils mit `required: true`. Für eine Eingangsrechnung gibt es keinen
Debitor; die Aufgabe 9 des Evaluationslaufs scheitert daran am Eingabeschema, also **vor** dem
Request.

**Das ist kein Fehler des Registereintrags gegenüber dem Plan.** Die Spezifikation führt beide
Felder als `required: true`, und Plan 4.3 erlaubt, `required` zu verschärfen, aber ausdrücklich
**nie zu lockern**. Der Eintrag folgt der Vorgabe korrekt; der Widerspruch steht sogar offen in
der Feldbeschreibung.

**Auflösbar ist der Punkt nur durch Messung** — nimmt die API den Aufruf ohne `debtor` an? Das
ist AP19 und braucht ein Testmandat, das es nicht gibt (0.2). Er wird deshalb in Abschnitt 6
als **begründet akzeptiert** geführt und ist dem Projektinhaber vorzulegen, weil er das
meistgebrauchte Buchungswerkzeug und seine Stapelform betrifft.

### S7 — Die Nutzdaten der Berichte brechen im Textblock nach 400 Zeichen ab

`befund-evaluation.md` V6, **am Quelltext nachgeprüft:** `renderRecord` in
`src/response/table.ts:73` setzt `maxCellLength` auf 400 und kürzt jede Zelle darauf.

Bei `bb_reports_get_bwa` und `bb_reports_get_sums` **ist** die gekürzte Zelle die gesamte
Auskunft: Das Objekt `report` erscheint als einzeilige JSON-Zeichenkette. Die BWA eines echten
Mandanten mit vollem Kontenrahmen ist um ein Vielfaches länger als 400 Zeichen. Die Kürzung
wird sichtbar gemacht, das ist richtig; der Verlust wird aber — anders als bei Listen über
`src/response/truncate.ts` — **nicht beziffert**, und für ein geschachteltes Objekt in einer
Zelle gibt es keine zählende Kürzung.

**Konkrete Behebung:** Für die drei Berichtswerkzeuge den Behälter nicht als Zelle, sondern als
eigenen Block rendern und die Kürzung wie bei Listen beziffern, oder `maxCellLength` je Eintrag
konfigurierbar machen und bei den Berichten anheben.

**Datei außerhalb meiner Zuständigkeit:** `src/response/table.ts` (AP09).

### S8 — Die `concise`-Projektion von `bb_postings_search` lässt die Anschlussfelder weg

`befund-evaluation.md` V5, **am Eintrag nachgeprüft.** `src/registry/tools/bb_postings_search.ts`
Zeile 284 bis 294 führt neun Felder und darunter **weder** `cost_location` **noch**
`transaction_id_by_customer`, obwohl `receipt_id_by_customer` enthalten ist.

Die Folge ist messbar und steht im Evaluationsbericht: Aufgabe 7 („welche Kostenstelle wurde am
stärksten belastet") braucht dadurch einen Aufruf je Kostenstelle statt eines einzigen, und
Aufgabe 11 muss auf `detailed` mit 38 Feldern je Zeile umschalten. Beide Male kostet das
fehlende Feld mehr Kontext, als das Feld gekostet hätte. Die Asymmetrie zwischen
`receipt_id_by_customer` und `transaction_id_by_customer` ist sachlich nicht begründbar: Es sind
Anschlusskennungen derselben Art.

**Abhängigkeit, die beachtet werden muss:** Prüfung P13 verlangt, dass jeder Name in `concise`
als Schlüssel in `responseContract.fields` desselben Eintrags vorkommt. Die beiden Felder sind
also gegebenenfalls dort mitzuführen. **Selbst geprüft:** Zum jetzigen Stand verletzt kein
einziger Eintrag P13.

**Datei außerhalb meiner Zuständigkeit:** `src/registry/tools/bb_postings_search.ts` (AP12c).

### S9 — Die erste Zeile jeder Schreibantwort ist grammatisch entstellt

`befund-evaluation.md` V10, **am Quelltext nachgeprüft:** `src/response/build.ts` setzt in der
Zeile um 357 den `title` des Eintrags in einen Satz ein, der ein Substantiv verlangt:

```ts
`${entry.title} in den echten Buchhaltungsdaten des verbundenen Mandanten ${verb}. `
```

Die `title` sind nach Plan 3.6 Infinitivwendungen. Daraus wird „Beleg löschen in den echten
Buchhaltungsdaten des verbundenen Mandanten entfernt." Der Sinn bleibt erkennbar; es ist aber
die erste Zeile, die ein Nutzer nach einem Schreibvorgang liest, und sie ist ausgeliefertes
Deutsch im Sinne von E4.

**Konkrete Behebung:** Statt des `title` das Fachobjekt des Eintrags einsetzen oder den Satz so
umstellen, dass der Infinitiv passt („`bb_receipts_delete` ausgeführt: Beleg in den echten
Buchhaltungsdaten … entfernt.").

**Datei außerhalb meiner Zuständigkeit:** `src/response/build.ts` (AP09).

### S10 — Falscher Genitiv „des Zahlung", und die bisherige Zählung war zu niedrig

`befund-evaluation.md` V11 nennt **sechs** Parameterbeschreibungen. **Selbst nachgezählt über
die gerenderten Feld- und Schemabeschreibungen aller 54 Einträge sind es sieben Werkzeuge:**

```
bb_comments_create                     :: transaction_id_by_customer
bb_postings_unconfirm_for_transaction  :: transaction_id_by_customer   (in V11 nicht genannt)
bb_transactions_assign_receipt         :: transaction_id_by_customer
bb_transactions_assign_receipt_batch   :: assignments.transaction_id_by_customer
bb_transactions_get                    :: transaction_id_by_customer
bb_transactions_list_receipts          :: transaction_id_by_customer
bb_transactions_unassign_receipt       :: transaction_id_by_customer
```

Gezählt wurde mit `\bdes Zahlung\b`; ohne die Wortgrenze zählt „in der Währung des
Zahlungskontos" fälschlich mit, was 13 statt 7 Treffer ergibt. Diese Unterscheidung ist der
Grund, warum die Zahl bisher danebenlag.

**Ursache:** `idByCustomer(entity, lookupTool)` in `src/schema/vocab.ts:118` setzt „des" fest in
die Vorlage; die Aufrufer übergeben „Zahlung", das feminin ist. Der Doc-Kommentar der Funktion
nennt „Zahlung" sogar selbst als Beispiel für einen Genitiv und führt damit in den Fehler.

**Konkrete Behebung:** Den Artikel als Teil des Parameters übergeben („der Zahlung", „des
Belegs") statt ihn in der Vorlage festzuschreiben, und den Doc-Kommentar berichtigen.

**Datei außerhalb meiner Zuständigkeit:** `src/schema/vocab.ts` (AP05).

### S11 — Beispiele an Zeichenkettenfeldern stehen ohne Anführungszeichen

`befund-evaluation.md` V1. Der Bericht zählt 44 Felder mit Zeichenketten-Schema, deren Beispiel
wie eine Zahl aussieht („zum Beispiel 4980", „zum Beispiel 70001", „zum Beispiel 123.99"),
während die Kennungsfelder ihre Zahl-Natur ausdrücklich benennen. Das Projekt ist dabei nicht
in sich einheitlich: `bb_transactions_search` schreibt „zum Beispiel '1200'" mit
Anführungszeichen, der gemeinsame Baustein `paymentAccountNumber()` aber ohne.

Dieser Befund ist übernommen und nicht neu vermessen; er ist plausibel belegt und hat im
Evaluationslauf nachweislich zu einem abgewiesenen Aufruf geführt. **Er wird hier ausdrücklich
gegen S4 abgewogen:** Anführungszeichen kosten Zeichen, und das Tokenbudget ist bereits
gerissen. Die Kosten sind jedoch zweistellig je Feld und damit gegenüber dem Überschuss aus S4
bedeutungslos; der Gewinn ist ein Aufruf, der beim ersten Versuch durchgeht.

**Dateien außerhalb meiner Zuständigkeit:** `src/schema/vocab.ts`, `src/schema/primitives.ts`
(AP05), `src/server/instructions.ts` (AP14).

### S12 — Die GitHub-Actions sind auf verschiebbare Tags gepinnt

`docs/entwicklung/veroeffentlichungs-checkliste.md` Abschnitt 0 führt den Punkt selbst auf; er
wird hier bestätigt und in seiner Schwere eingeordnet. Plan 13.3 verlangt ausdrücklich, die
Actions vor dem ersten CI-Lauf auf einen Commit-SHA zu pinnen. `ci.yml`, `publish.yml` und
`drift.yml` nennen Tags (`actions/checkout@v7`, `actions/setup-node@v7`,
`pnpm/action-setup@v6`).

**Warum das mehr wiegt als eine Formalie:** Ein Tag ist verschiebbar, ein SHA nicht. Für
`publish.yml` ist das eine echte Lieferkettenfrage, weil dieser Workflow über OIDC ein
Veröffentlichungsrecht für npm bekommt. Derselbe Gedanke steht bereits in Plan 13.5 für
`npx mcpb` und ist dort konsequent umgesetzt — hier ist er es nicht.

**Datei außerhalb meiner Zuständigkeit:** `.github/workflows/*` (AP01 für `ci.yml`, AP21 für
`publish.yml` und `drift.yml`).

### S13 — Deutsche Bezeichner mit Digraphen in Testdateien

Die Sprachvorgabe lautet: Fließtext deutsch mit echten Umlauten, **Bezeichner im Code
englisch**. Gefunden wurden deutsche Bezeichner, die zugleich Digraphen tragen:

- `test/contract/mcpb-tools.test.ts`, Zeilen um 151 und 177: `const schluessel`
- `test/unit/upload-local-file.test.ts`, Zeile 179: `const gross`

**Umfang, selbst gemessen und zugunsten des Projekts festgehalten:** Im ausgelieferten `src/`
gibt es praktisch keine deutschen Bezeichner; die Stichprobe fand dort einen einzigen
(`const zustand` in `src/errors/render.ts:480`), und er trägt keinen Digraphen. Der Befund ist
damit auf Testdateien beschränkt und geringfügig.

**Nicht beanstandet und ausdrücklich geprüft:** `'gross'` in den drei Rechnungswerkzeugen ist
der englische API-Enum-Wert („net"/„gross") und korrekt in einfachen Anführungszeichen; `fuer`
in `test/unit/upload-local-file.test.ts:14` steht in einem `Buffer.from(…, "ascii")` und ist
dort technisch erzwungen.

### S14 — Digraph im base64-Inhalt der Golden-Dateien

Der erfundene Dateiinhalt der Golden-Dateien lautet entschlüsselt „Erfundener Dateiinhalt
**fuer** die Golden-Datei." Base64 kann Umlaute tragen; der Digraph ist hier nicht erzwungen und
verstößt gegen die Sprachvorgabe. Wirkung: keine, außer auf die Konsistenz. Betroffen sind
`test/golden/receipts-get-single-with-file.json` und
`test/golden/reports-get-bwa-with-files.json`.

---

## 3. Die Fixing-Phase, und warum sie hier nicht ausgeführt werden konnte

Plan 11.2 AP22 sieht eine dynamische Fixing-Phase mit erneuter Prüfung vor. **Sie konnte in
diesem Paket nicht durchlaufen werden**, und der Grund ist keine Nachlässigkeit, sondern eine
Regel desselben Plans:

AP22 hält nach 11.2 **ausschließlich** `docs/entwicklung/skeptiker-befunde.md`. Die Ursachen
aller vierzehn Befunde liegen in Dateien, die AP05, AP09, AP10, AP11, AP12c, AP13, AP14, AP18
und AP21 gehören. Die Vorbemerkung zu Abschnitt 11 lautet: „Wer außerhalb seiner Liste
schreiben muss, meldet das, statt es zu tun." Genau das geschieht hier.

**Die vollständige Liste der fremden Dateien, die geändert werden müssten**, als Arbeitsliste
für eine Fixing-Phase, geordnet nach der Schadensreihenfolge aus Abschnitt 2:

| Befund | Datei | Eigentümer |
| --- | --- | --- |
| S1 | `src/upload/ssrf.ts` (Zeile 309) | AP13 |
| S2 | `src/response/sanitize.ts` (Zeilen 35, 50); danach `test/eval/tasks.test.ts` (E-1) | AP09; AP18 |
| S3 | `src/server/register-tools.ts` (Zeile 196); danach `test/eval/tasks.test.ts` (E-3) | AP10; AP18 |
| S4 | Entscheidung des Projektinhabers; danach ggf. Registereinträge und `src/server/instructions.ts` | Projektinhaber, AP12a–e, AP14 |
| S5 | `test/registry/secrets.test.ts`, ggf. `test/golden/*` | AP11, AP09 |
| S6 | keine Änderung ohne Messung; `docs/entwicklung/befund-schreibend.md` bei neuer Messung | AP19/AP19b |
| S7 | `src/response/table.ts` (Zeile 73); danach `test/eval/tasks.test.ts` (E-2) | AP09; AP18 |
| S8 | `src/registry/tools/bb_postings_search.ts` | AP12c |
| S9 | `src/response/build.ts` (Zeile 357) | AP09 |
| S10 | `src/schema/vocab.ts` (Zeile 118) | AP05 |
| S11 | `src/schema/vocab.ts`, `src/schema/primitives.ts`, `src/server/instructions.ts` | AP05, AP14 |
| S12 | `.github/workflows/ci.yml`, `publish.yml`, `drift.yml` | AP01, AP21 |
| S13 | `test/contract/mcpb-tools.test.ts`, `test/unit/upload-local-file.test.ts` | AP21, AP13 |
| S14 | `test/golden/receipts-get-single-with-file.json`, `reports-get-bwa-with-files.json` | AP09 |

**Was diese Prüfung stattdessen getan hat**, damit die Findings nicht nur behauptet sind: Jeder
Befund ist bis zur auslösenden Zeile zurückverfolgt, die Wirkung ist an den echten Modulen
gemessen und die Behebung ist so konkret benannt, dass sie ohne erneute Untersuchung
ausführbar ist. Bei S2 und S10 hat die Nachmessung die Vorlage korrigiert.

**Die erneute Prüfung nach einer Fixing-Phase steht damit aus.** Sie ist unverzichtbar,
insbesondere bei S2: Eine Änderung an `sanitizeText` berührt die Abwehr gegen Prompt-Injection
aus Freitextfeldern (Plan 14.1 R10) und darf sie nicht schwächen.

---

## 4. Was geprüft wurde und der Prüfung standgehalten hat

Ein Bericht, der nur Mängel nennt, gibt ein falsches Bild. Diese Punkte sind **selbst
nachgemessen** und in Ordnung.

### 4.1 Der eine Ausführungspfad und die Guardreihenfolge aus 1.4

`runGuardedCall` in `src/server/register-tools.ts` führt die sechs Guards in genau der
Reihenfolge aus Plan 1.4 aus: Konfiguration, Nur-Lesen, Schema, Querprüfungen, Grenzen,
Duplikatshinweis. Der Stammdatenspeicher wird danach und **vor** dem Rate-Limiter befragt, wie
Plan 7.8 Punkt 1 es verlangt. Es gibt genau einen Handler.

Die Reihenfolge ist in ihrer Wirkung richtig: Steht der Nur-Lesen-Schalter auf `true`, greift
Guard 2 **vor** Guard 6, ein eingeschalteter Duplikatshinweis setzt dann also keinen Zusatzaufruf
für ein ohnehin abgelehntes Werkzeug ab.

### 4.2 Trennung lesend und schreibend beim Retry

`runAttempts` in `src/http/retry.ts` verzweigt über `maxAttemptsFor(toolClass)`. Bei
`maxAttempts === 1` — also bei allen 39 schreibenden Werkzeugen — gibt es **keine Schleife,
keine Weiche und keinen zweiten Codepfad**, der sich versehentlich erweitern ließe. Das ist
genau die bauartbedingte Absicherung aus Plan 5.3, nicht eine Regel, die Disziplin verlangt.
`test/contract/no-write-retry.test.ts` ist grün.

### 4.3 Fehlerabbildung über (`specPath`, `error_code`) samt der elf Paare mit Code 15

Selbst gegen `src/generated/errors.ts` ausgezählt: **54 Pfade, 786 Paare**, davon 179 mit
`message !== summary`. Die elf Paare mit `error_code` 15 sind vollständig und richtig
eingestuft:

| Pfad | HTTP | Klasse |
| --- | --- | --- |
| `/receipts/get` | 400 | `input` |
| `/receipts/addBatch`, `/receipts/upload`, **`/transactions/add`**, `/transactions/addBatch`, `/transactions/assign-batch/receipt`, `/postings/add-batch/receipts`, `/postings/add-batch/transactions`, `/postings/add-batch/free`, `/settings/add-batch/debtors`, `/settings/add-batch/creditors` | 403 | `transient` |

`/transactions/add` ist der Pfad, den Plan 5.6 als den benennt, der leicht durchrutscht; er ist
korrekt als `transient` geführt. Die Unterscheidung läuft über den HTTP-Status und nicht über
den Wortlaut, wie L6 es erzwingt.

### 4.4 Antwortvertrag je Endpunkt statt je Fachobjekt

Selbst am Register nachgezählt:

| Werkzeug | Felder im Vertrag | Quelle |
| --- | --- | --- |
| `bb_receipts_search` | 16 | gemessen, 2026-09-12 |
| `bb_receipts_get` | **23**, darunter `amount_original` und `currency_original` | gemessen, 2026-09-12 |
| `bb_transactions_search` | 6 | gemessen |
| `bb_transactions_get` | 13 | gemessen |

`amount_original` und `currency_original` stehen im Vertrag des Einzelabrufs und **nicht** in
dem des Listenabrufs — genau die Unterscheidung, die Plan 7.2 als folgenreichste Entscheidung
des Abschnitts führt. `bb_receipts_get` trägt `shape: "object"`.

### 4.5 Pfadbau der vier Endpunkte mit Platzhaltersegment

Alle vier Einträge tragen `template`, `params` und `specPath`:

```
bb_receipts_get       /receipts/get/{receipt_id_by_customer}       spec /receipts/get/id_by_customer
bb_receipts_delete    /receipts/delete/{receipt_id_by_customer}    spec /receipts/delete/id_by_customer    verified: false
bb_receipts_restore   /receipts/restore/{receipt_id_by_customer}   spec /receipts/restore/id_by_customer   verified: false
bb_transactions_get   /transactions/get/{transaction_id_by_customer} spec /transactions/get/id_by_customer
```

`src/mapping/path.ts` setzt alle sechs Regeln aus Plan 4.6 um: Prüfung gegen `^[0-9]{1,18}$`
**vor** dem Einsetzen, danach `encodeURIComponent`, Rückprüfung der Segmentzahl gegen den
Vorlagenstamm, Rückgabe eines **Paares** aus gebautem Pfad und `specPath`, und kein Body-Feld
für den Identifikator. Die Audit-Zeile im Testlauf belegt die Wirkung: dort steht
`endpunkt=/receipts/delete/id_by_customer`, also der Spezifikationspfad und nicht die
eingesetzte Kennung.

Die beiden schreibenden Formen sind korrekt als nicht gemessen gekennzeichnet.

### 4.6 Vollständigkeit der 54 Einträge und ihrer Annotationen

Selbst gegen das erzeugte Register ausgezählt, alle Zahlen decken sich mit Plan 3.3, 3.8 und 3.9:

- **54 Werkzeuge**, 54 Dateien unter `src/registry/tools/`.
- Wirkung: **15 lesend, 24 anlegend, 8 ändernd, 7 löschend**.
- Klassen: **R 15, A 16, AR 2, M 4, D 7, B 10**.
- Beschreibungsstufen: **22 / 18 / 14**.
- `destructiveHint: true` bei **13**, `idempotentHint: true` bei **19**, `openWorldHint` überall
  `true`, alle vier Hints je Werkzeug ausdrücklich gesetzt.
- Alle 39 schreibenden Einträge tragen einen Pflichtsatz U1 bis U7 **und** ein `verifyWith`;
  **keiner** der 15 lesenden trägt einen Pflichtsatz.
- Alle 54 führen `api_key` in `omitted`.
- Kein Eintrag verletzt P13 (jeder `concise`-Name steht in `responseContract.fields`).
- `invalidatesCache` ist vollständig, einschließlich der nicht offensichtlichen Zeile: Jedes
  Debitoren- und Kreditorenwerkzeug verwirft auch `bb_postingaccounts_search`.
  `bb_payment_accounts_create` trägt korrekt ein **leeres** `invalidatesCache`, weil
  `/accounts/get` nach Plan 7.8 nie zwischengespeichert wird.

### 4.7 Upload-Sicherheit

`src/upload/ssrf.ts` prüft **je Weiterleitungssprung** erneut (`assertUrlShapeAllowed`,
`assertHostAllowed` in der Schleife), arbeitet mit `redirect: "manual"` und einem eigenen
`Agent`, dessen `connect.lookup` über `createGuardedLookup` läuft — die Adressen, gegen die
geprüft wird, sind damit genau die, mit denen verbunden wird (Schutz gegen DNS-Rebinding). Die
Begrenzung der Sprünge und die laufende Bytezählung sind vorhanden. Die Fehlertexte nennen
höchstens den Rechnernamen; `test/unit/upload-local-file.test.ts` prüft über
`expectNoFilesystemPath`, dass kein Dateisystempfad in eine Meldung gelangt. Der einzige Befund
in diesem Bereich ist der Typfehler S1, der die Schutzwirkung nicht berührt.

### 4.8 Keine Zugangsdaten, keine Geschäftsdaten

Siehe S5. Zusammengefasst: nichts gefunden, und die einzige Prüfung, die etwas meldet, meldet
Fehlalarme.

### 4.9 Sprache und Stil

- **Emojis: keine.** Über `src`, `scripts`, `test`, alle Begleittexte, `.github` und `.mcpb`
  gegen die Unicode-Emoji-Bereiche gesucht — kein Treffer. Die Pfeile `→` im Buchungswegweiser
  sind typografische Pfeile und keine Emojis.
- **Gedankenstriche als zwei Bindestriche: keine.** Die einzigen Treffer für ` -- ` stehen in
  `befund-sdk.md` innerhalb von Code-Auszeichnungen und sind dort das
  Argumenttrennzeichen von `claude mcp add` beziehungsweise `codex mcp add`.
- **Umlaute:** durchgehend echt. Die einzigen Digraphen sind die in S13 und S14 genannten.
- **Code-Kommentare deutsch, Bezeichner englisch:** im ausgelieferten `src/` eingehalten;
  Ausnahmen nur in Testdateien, siehe S13.
- `pnpm lint` ist grün, `pnpm format --check` ist grün.

### 4.10 Verpackung

`npm pack --dry-run` liefert **40 Dateien**; kein `src/`, kein `test/`, kein `docs/`, keine
`.env`. Das Größenbudget aus Plan 9.10 ist eingehalten: **558.076 Bytes gepackt** gegen 1 MiB
(53,2 Prozent) und **2.473.350 Bytes entpackt** gegen 3 MiB (78,6 Prozent). Die im Paketprobelauf
gemessene Startzeit bis zur Antwort auf `tools/list` beträgt **136 ms** gegen ein Budget von
5.000 ms.

### 4.11 Die Veröffentlichungskette blockiert von selbst

Das ist der wichtigste konstruktive Befund dieser Prüfung. `package.json` führt
`prepublishOnly: "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"`.
Solange S1, S4 und S5 offen sind, **scheitert jeder Versuch zu veröffentlichen, bevor etwas
hinausgeht** — und zwar auch dann, wenn jemand den Zustand übersieht. Zusammen mit der
Entscheidung aus Plan 11.2, dass AP21 nichts veröffentlicht, ist der gefährlichste Weg dieses
Projekts zweifach verriegelt.

---

## 5. Eine Korrektur an der Veröffentlichungs-Checkliste

`docs/entwicklung/veroeffentlichungs-checkliste.md` Abschnitt 0 nennt **drei** rote Testdateien
und darunter `test/eval/tasks.test.ts` mit den Aufgaben 6, 8 und 11. **Das trifft auf den
jetzigen Stand nicht mehr zu.** Zweimal nachgemessen:

```
Test Files  2 failed | 77 passed (79)
Tests       2 failed | 1238 passed (1240)
```

Rot sind ausschließlich `test/registry/token-budget.test.ts` (S4) und
`test/registry/secrets.test.ts` (S5). `test/eval/tasks.test.ts` ist grün.

**Warum es grün ist, und warum das kein Beschönigen ist** — geprüft, weil genau hier der
Verdacht naheliegt, eine Aufgabe sei umformuliert worden, was Plan 9.8 ausdrücklich verbietet:
Die Datei enthält am Ende drei Prüfungen `E-1`, `E-2` und `E-3`, die die Mängel V4, V6 und V2
**als Zustand festhalten**. Sie behaupten nicht, das Verhalten sei richtig; ihr Kommentarkopf
sagt wörtlich: „Diese drei Prüfungen halten einen Mangel fest, kein gewünschtes Verhalten." Wird
einer der Mängel behoben, wird die zugehörige Prüfung rot. Die Aufgabe 9 gilt weiterhin als
**nicht erreicht**, die Erfolgsquote steht bei 10 von 11, und beides steht so im Bericht. Das
Vorgehen ist zulässig und transparent; die Checkliste ist lediglich auf einem älteren Stand.

**Empfehlung:** Abschnitt 0 der Checkliste auf zwei rote Dateien berichtigen und den Hinweis
aufnehmen, dass die drei `E-`Prüfungen bei einer Behebung planmäßig rot werden.

**Datei außerhalb meiner Zuständigkeit:** `docs/entwicklung/veroeffentlichungs-checkliste.md`
(AP21).

---

## 6. Begründet als akzeptiert dokumentierte Punkte

Diese Punkte bleiben bestehen. Sie sind keine Nachlässigkeit, sondern Folgen von Entscheidungen
oder von fehlender Messmöglichkeit, und sie sind an allen vorgesehenen Stellen benannt.

**A1 — `creditor` und `debtor` sind beide Pflicht (S6).** Akzeptiert, weil Plan 4.3 verbietet,
`required` gegenüber der Spezifikation zu lockern, und weil die Gegenprobe einen schreibenden
Aufruf gegen ein Testmandat verlangt, das nicht existiert (0.2). Eine Lockerung ohne Messung
wäre eine Vermutung an der letzten Stelle vor einem Schreibzugriff. **Dem Projektinhaber
vorzulegen**, weil das meistgebrauchte Buchungswerkzeug betroffen ist.

**A2 — Die Ladeprobe für Claude Desktop steht aus.** `docs/entwicklung/befund-sdk.md` 2.3 legt
offen, dass AP02 diesen dritten Client **nicht** geprüft hat, um eine laufende Sitzung des
Projektinhabers nicht zu unterbrechen, und dass die Entscheidungsregel aus Plan 13.2 damit im
Wortsinn nicht vollständig anwendbar war. Die Auslegung — v2 bleibt, weil keine einzige negative
Messung vorliegt — ist nachvollziehbar begründet und als Abweichung gemeldet worden, nicht
stillschweigend getroffen. Akzeptiert **mit dem ausdrücklichen Vermerk, dass es sich um
Nichtwissen handelt** und die Probe nachzuholen ist, sobald ein Neustart von Claude Desktop
ohnehin ansteht.

**A3 — Die Aussagekraft des Evaluationslaufs ist begrenzt.**
`docs/entwicklung/befund-evaluation.md` Abschnitt 1.2 und 8 legen es selbst offen: ein Lauf, ein
Modell, das den Plan kannte und die Kennzahlen gelesen hatte, vier gemessene Aufrufe bei der
Nulltoleranz-Kennzahl M1 und nur zwei der zwölf Buchungswerkzeuge berührt. Die beiden Nullen
sind damit **kein Beleg für Fehlerfreiheit**. Diese Selbsteinschätzung ist redlich und wird hier
bestätigt, nicht aufgewertet. Akzeptiert als Stand; die dort ausgesprochene Empfehlung, den
Aufgabensatz von einem zweiten Modell ohne Plankenntnis laufen zu lassen, bleibt offen.

---

## 7. Woran diese Prüfung sich selbst nicht sicher ist

Diese Liste gehört zum Ergebnis.

1. **Die Fixing-Phase und die erneute Prüfung stehen aus** (Abschnitt 3). Die Definition of Done
   von AP22 verlangt beides; erfüllt ist der Prüfteil, nicht der Fixing-Teil. Der Grund ist die
   Eigentumsregel aus Plan 11, und er ist benannt statt umgangen. **Solange S1 bis S4 offen
   sind, ist der Stand nicht abgenommen.**
2. **Die Prüfung ist eine Lesende.** Sie hat keinen einzigen Aufruf gegen die
   BuchhaltungsButler-API abgesetzt. Über das tatsächliche Verhalten der API sagt sie nichts,
   was nicht schon in Plan 0.3 und `live-befunde-orchestrator.md` steht.
3. **Die Abdeckung ist nicht gleichmäßig.** Geprüft wurden die in der Aufgabenstellung genannten
   Schwerpunkte und die Stellen, an denen frühere Pakete Befunde gemeldet haben. Der
   Einrichtungsassistent mit seinen zehn Clientadaptern, die vier Resources und der Vertragslauf
   sind nur über den Testlauf und stichprobenweise geprüft, nicht Zeile für Zeile. Plan 14.1 R6
   führt die Clientadapter selbst als Hauptquelle künftiger Fehlerberichte.
4. **S11 ist übernommen, nicht nachgemessen.** Die Zahl 44 stammt aus
   `befund-evaluation.md`; nachgeprüft ist nur die Uneinheitlichkeit zwischen
   `bb_transactions_search` und `paymentAccountNumber()`.
5. **Ob die Behebung von S2 die Abwehr aus Plan 14.1 R10 unberührt lässt, ist nicht geprüft**,
   weil die Behebung nicht stattgefunden hat. Das ist der Punkt, an dem eine erneute
   Skeptikerprüfung am nötigsten ist.
6. **Diese Prüfung hat denselben Modelltyp wie die geprüften Pakete.** Sie hatte frischen
   Kontext und hat jede übernommene Feststellung nachgemessen — bei S2 und S10 mit abweichendem
   Ergebnis —, aber die Einschränkung aus `befund-evaluation.md` 1.2.1 gilt sinngemäß auch für
   sie.

---

## 8. Zum Nachvollziehen

Alle Befunde dieses Berichts sind mit diesen Befehlen reproduzierbar; keiner davon berührt die
BuchhaltungsButler-API.

```
pnpm typecheck                       # S1: Rückgabewert 2, Meldung in src/upload/ssrf.ts
pnpm test                            # S4, S5: 2 Dateien rot, 1238 von 1240 Prüfungen grün
pnpm lint                            # grün
pnpm format --check                  # grün
npm pack --dry-run --json            # 40 Dateien, kein src/, test/, docs/
git tag -l && git remote -v          # beides leer
npm view @dennismenken/buchhaltungsbutler-mcp version   # HTTP 404
```

Für S2 genügt der Ausdruck aus `src/response/sanitize.ts:35` gegen einen negativen Betrag:
`"-192.44".replace(/^[\s>#*+\-=|]+/, "")` ergibt `"192.44"`.
