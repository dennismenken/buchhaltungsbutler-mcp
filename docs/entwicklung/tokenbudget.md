# Das Tokenbudget, gemessen

**Stand: 2026-09-15 (UTC).** Diese Datei wird vollständig von `scripts/measure-tokens.ts` erzeugt
(`pnpm measure-tokens`). Von Hand geänderte Zahlen sind beim nächsten Lauf wieder weg.

Gemessen mit `gpt-tokenizer@4.0.0`, Kodierung `o200k_base`, unter Node 22.23.2. Es wurde nichts
nachgeladen und kein Netz benutzt.

## 1. Der Tokenizer ist ein Stellvertreter

`o200k_base` ist die tatsächliche Kodierung der GPT-4o-Linie. Für andere Modellfamilien, die
Claude-Linie eingeschlossen, ist der Tokenizer **nicht öffentlich dokumentiert**; die Zahlen unten
sind dort eine belastbare Größenordnung und keine exakte Zahl für jeden Client. Für die
Entscheidung, die an ihnen hängt — passt das in ein übliches Kontextfenster oder nicht —, genügt
das: Sie kippt nicht an fünf Prozent Abweichung.

## 2. Die Messung

| Größe | Zeichen | Token | Zeichen je Token |
| --- | --- | --- | --- |
| 54 Werkzeugdefinitionen, wie ausgeliefert | 200.342 | 48.964 | 4,09 |
| instructions, Auslieferungszustand | 5.694 | 1.407 | 4,05 |
| instructions, alle Schalter an | 7.452 | 1.840 | 4,05 |
| Was der Client beim Verbinden sieht | 206.036 | 50.371 | 4,09 |
| 54 Definitionen in der Rechenweise von P11 | 200.342 | 48.964 | 4,09 |

Die Zeile „wie ausgeliefert" misst genau das, was `server/register-tools.ts` an `registerTool`
übergibt: Name, Titel, Beschreibung, Annotationen, das JSON Schema aus `schema/build.ts` und das
offene Ausgabeschema aus `response/output-schema.ts`.

P11 (`test/registry/token-budget.test.ts`) baut die Definition aus dem Registereintrag nach, weil
die Prüfung vor den Paketen entstand, die `schema/build.ts` und `response/output-schema.ts`
liefern. Der Nachbau ruft inzwischen genau diese beiden Module auf und misst deshalb denselben
Gegenstand: Beide Zeilen der Tabelle stimmen auf das Token überein.

## 3. Das Zeichen-je-Token-Verhältnis

**Gemessen: 4,09 Zeichen je Token.** Vorgerechnet und ausdrücklich als Annahme gekennzeichnet
waren **3,2**. Die Annahme lag zu niedrig: Eine Werkzeugdefinition ist zum größeren Teil
JSON-Struktur mit englischen Feldnamen, und die zerfällt in wenige, lange Token; der deutsche
Fließtext drumherum kommt in `o200k_base` ebenfalls auf rund vier Zeichen je Token, nämlich auf
4,05 in den instructions, die fast nur Fließtext sind.

In `src/registry/budget.ts` steht `CHARS_PER_TOKEN` deshalb jetzt auf **4** statt auf 3,2. Der
Wert ist gegenüber der Messung **abgerundet**, und zwar mit Absicht: Die Konstante wird zur
Laufzeit nur in der Antwortkürzung und in `doctor` benutzt, und dort schätzt ein zu kleiner Faktor
die Tokenzahl zu hoch, kürzt also eher zu früh. Das ist die harmlose Richtung: Eine Schätzung, die
zu früh kürzt, kostet Zeilen; eine, die zu spät kürzt, sprengt das Kontextfenster des Clients.

**Was die Zahl nicht sagt:** Sie ist an Werkzeugdefinitionen und am Servertext gemessen, nicht an
API-Antworten. Antwortzeilen bestehen aus Kennungen, Datumswerten und Beträgen, die schlechter
tokenisieren als Fließtext. Die Antwortkürzung rechnet also mit einem Faktor, der für ihren
eigenen Gegenstand eher zu groß ist — auch deshalb die Abrundung.

## 4. Das Budget

Das Budget der Werkzeugdefinitionen ist eingehalten: 48.964 von 49.000 Token.

In der Rechenweise von P11 sind es 48.964 Token. P11 bricht seit der Entscheidung vom 2026-09-13
wieder hart an der Grenze von 49.000 Token ab: noch 36 Token Luft, der Testlauf ist grün.

Das Budget der instructions ist eingehalten: 1.840 von 2.100 Token, gemessen im größten Zustand.

**Woher die Grenze von 49.000 Token kommt.** Vorgerechnet waren 32.000, und dieser Wert war
gerissen: Die Messung vom 2026-09-12 kam auf 48.305 Token, ein Überschuss von 16.305. Die
Reihenfolge der Gegenmaßnahmen kann diese Lücke nicht schließen, und das ist ausgerechnet und
nicht behauptet: 16.305 Token sind rund 66.700 Zeichen, während alle 54 Werkzeugbeschreibungen
zusammen nur 32.654 Zeichen lang sind. Selbst wenn jede von ihnen vollständig in die Resources
wanderte, wäre das weniger als die Hälfte. Übrig bliebe allein der Posten Parameterbeschreibungen
mit 67.161 Zeichen, der damit praktisch ganz entfallen müsste — das verstößt gegen die Vorgabe,
dass jedes Feld eines Endpunkts genau einmal im Schema erscheint, so wie Werkzeuge zu streichen
oder zusammenzulegen gegen die Vorgabe verstößt, genau ein Werkzeug je Endpunkt auszuliefern. Der
Projektinhaber hat das Budget deshalb am 2026-09-13 ausdrücklich auf den gemessenen Stand
zuzüglich 695 Token Luft angehoben. Die Entscheidung steht in `CHANGELOG.md`, die Begründung in
`src/registry/budget.ts`, und P11 bricht seither wieder hart an der Grenze ab statt nur zu warnen.
Die zwischenzeitliche Sperrgrenze `TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT` ist damit entfallen;
zwei harte Zahlen nebeneinander wären dieselbe Grenze zweimal.

Die Luft ist mit Absicht klein. Sie trägt eine Umformulierung, aber weder ein weiteres Werkzeug
noch ein Schemafeld von Gewicht. Die Postentabelle im nächsten Abschnitt sagt, wo die Zeichen
sitzen. Sie ersetzt die Prüfung nicht: Aus einer Zeichenzahl folgt, welcher Posten größer
ausgefallen ist als angesetzt, aber nicht, welche der sechs Sparmaßnahmen dort fehlt. Das ist an
den Registereinträgen zu prüfen und gehört nicht in dieses Skript.

## 4a. Die Werkzeugdefinitionen je Gruppe

Der Gruppenschalter `BB_MCP_TOOL_GROUPS` schaltet Werkzeuge gruppenweise ab. Diese Tabelle sagt,
was eine Gruppe kostet und was ihr Abschalten spart. Jede Definition ist einzeln gemessen und
danach addiert; die Summe einer Teilmenge ist damit exakt und keine Hochrechnung. Die Spalte
„eingecheckt" ist die Zahl in `src/registry/groups.ts`, aus der Startmeldung, `doctor` und
`print-config` ihre Angabe ohne Tokenizer bilden.

Die elf Endpunktgruppen sind über `TOOL_ENTRIES` gemessen, die Gruppe `bundles` über
`BUNDLE_ENTRIES` und `bundleDefinitionJson` — die Bündel tragen einen eigenen Eintragstyp und
stehen nicht im erzeugten Registerindex. Ihre Zeile steht am Ende und trägt in der Spalte „Anteil"
einen Strich: Sie zählt nicht zu den 54 Endpunktwerkzeugen und damit nicht zu deren budgetierter
Summe, sondern hat mit `BUNDLE_DEFINITION_TOKEN_BUDGET` ihre eigene Grenze.

| Gruppe | Werkzeuge | Zeichen | Token | eingecheckt | Anteil |
| --- | --- | --- | --- | --- | --- |
| `postings` | 12 | 49.409 | 12.213 | 12.213 | 24,94 % |
| `receipts` | 8 | 34.709 | 8.529 | 8.529 | 17,42 % |
| `transactions` | 8 | 26.869 | 6.661 | 6.661 | 13,60 % |
| `invoices` | 3 | 23.253 | 5.766 | 5.766 | 11,78 % |
| `reports` | 5 | 15.586 | 3.799 | 3.781 | 7,76 % |
| `creditors` | 4 | 13.789 | 3.341 | 3.341 | 6,82 % |
| `debtors` | 4 | 13.176 | 3.198 | 3.198 | 6,53 % |
| `postingaccounts` | 3 | 8.060 | 1.877 | 1.877 | 3,83 % |
| `cost_locations` | 4 | 7.951 | 1.839 | 1.839 | 3,76 % |
| `payment_accounts` | 2 | 4.921 | 1.142 | 1.142 | 2,33 % |
| `comments` | 1 | 2.619 | 599 | 599 | 1,22 % |
| `bundles` | 5 | 28.165 | 6.852 | 6.852 | — |
| **Summe der elf Endpunktgruppen** | 54 | 200.342 | 48.964 | | 100,00 % |

**Die eingecheckte Tabelle in `src/registry/groups.ts` ist veraltet.** Abweichend sind: `reports`
(eingecheckt 3.781, gemessen 3.799). `test/registry/groups.test.ts` bricht daran ab; die Zahlen
sind dort nachzutragen.

Das Budget der Bündelgruppe (`BUNDLE_DEFINITION_TOKEN_BUDGET`) ist eingehalten: 6.852 von 6.950
Token. Die Grenze steht seit dem 2026-09-13 auf dem gemessenen Stand zuzüglich einer kleinen
Marge. Sinkt die Messung dauerhaft, wird sie nachgezogen; angehoben wird sie nicht.

## 5. Die Vorkalkulation, nachgeprüft

Die Vorkalkulation rechnete eine Rohschätzung ohne Sparmaßnahmen gegen **sechs** Sparmaßnahmen,
auf die sich die Tabelle unten mit S1 bis S6 bezieht. Sie lauten:

| # | Sparmaßnahme |
| --- | --- |
| S1 | Querschnittsregeln stehen einmal in den `instructions` und nicht in jedem Parametertext |
| S2 | Beschreibungsbudget nach Stufen: 900, 700 beziehungsweise 480 Zeichen |
| S3 | Enum statt Prosa, vor allem bei Umsatzsteuerschlüsseln, Währungen, `order` und `type` |
| S4 | Kurzmuster für die Adress- und Kontaktfelder, höchstens 80 Zeichen je Feld |
| S5 | Eine Positionsliste statt paralleler Arrays an den Werkzeugen mit Positionen |
| S6 | `outputSchema` ohne Feldbeschreibungen; Feldnamen und Typen genügen |

| Posten | vorgerechnet (Zeichen) | gemessen (Zeichen) | Abweichung |
| --- | --- | --- | --- |
| Werkzeugbeschreibungen nach Stufenbudget (S2) | 39.120 | 32.928 | −6.192 |
| Parameterbeschreibungen, reiner Text (S1, S3, S4, S5) | 38.400 | 67.161 | +28.761 |
| `outputSchema` ohne Feldbeschreibungen (S6) | 14.040 | 42.570 | +28.530 |
| Name, Titel, Annotationen, Schemarümpfe | 5.238 | 57.683 | +52.445 |
| Summe | 96.798 | 200.342 | +103.544 |

Die Spalte „vorgerechnet" ist die Endabrechnung der Vorkalkulation nach den sechs Sparmaßnahmen.
Gemessen wird in derselben Abgrenzung wie dort: „Parameterbeschreibungen" sind die Summe aller
`description`-Texte im Eingabeschema, auf jeder Schachtelungstiefe, **ohne** die Schemastruktur
drumherum; diese Struktur steckt in der Zeile „Name, Titel, Annotationen, Schemarümpfe", zusammen
mit den Schlüsseln und Anführungszeichen des JSON. Die vier Zeilen addieren sich deshalb genau zur
Summe.

Zwei Lesehilfen zu den Abweichungen. **Erstens:** Die Zeile `outputSchema` ist nicht Folge einer
ausgelassenen Sparmaßnahme. S6 ist umgesetzt, und die Messung belegt es: 0 Zeichen
Feldbeschreibung in allen 54 Ausgabeschemata zusammen. Größer als angesetzt ist das Schema, weil
es den Umschlag dieses Servers mitbeschreibt: `endpoint`, die Paginierungstatsachen,
`_contract_warnings`, die Ganzzahl-Cent-Felder und bei schreibenden Werkzeugen den aufgelösten
Datensatz samt Rückweg. Das sind Zusagen des Antwortvertrags, keine Prosa.

**Zweitens:** Die Zeile „Schemarümpfe" war mit 97 Zeichen je Werkzeug angesetzt. Ein JSON Schema
Draft 2020-12 über im Schnitt sechs Parameter, mit Typen, Grenzen, Enums und den Elementschemata
der Positionslisten, ist um ein Vielfaches größer. Beide Abweichungen sind Rechenfehler der
Schätzung und keine Abweichung von einer Vorgabe. Der Posten, der tatsächlich an den
Registereinträgen hängt, ist die Zeile „Parameterbeschreibungen": Dort schlagen S1, S3, S4 und S5
zu Buche.

## 6. Die zehn teuersten Werkzeugdefinitionen

| Werkzeug | Stufe | Zeichen | Token |
| --- | --- | --- | --- |
| `bb_invoices_create_einvoice` | 1 | 8.493 | 2.119 |
| `bb_postings_search` | 1 | 7.737 | 1.937 |
| `bb_invoices_create` | 1 | 7.640 | 1.896 |
| `bb_invoices_create_draft` | 1 | 7.120 | 1.751 |
| `bb_receipts_search` | 1 | 6.817 | 1.733 |
| `bb_receipts_upload` | 1 | 6.441 | 1.597 |
| `bb_receipts_create` | 2 | 6.233 | 1.544 |
| `bb_postings_create_for_receipt_batch` | 1 | 5.821 | 1.464 |
| `bb_postings_create_for_receipt` | 1 | 5.443 | 1.373 |
| `bb_postings_create_for_transaction_batch` | 1 | 5.470 | 1.349 |

Die Stufe ist das Beschreibungsbudget: 900, 700 beziehungsweise 480 Zeichen. Sie begrenzt allein
die Werkzeugbeschreibung; der größere Teil einer teuren Definition ist das Eingabeschema mit
seinen Parametertexten.
