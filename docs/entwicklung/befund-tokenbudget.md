# Befund: das Tokenbudget, gemessen

**Stand: 2026-09-13 (UTC).** Diese Datei wird vollständig von `scripts/measure-tokens.ts` erzeugt
(`pnpm measure-tokens`, Arbeitspaket AP14). Von Hand geänderte Zahlen sind beim nächsten Lauf
wieder weg.

Gemessen mit `gpt-tokenizer@4.0.0`, Kodierung `o200k_base` (Plan 13.9), unter Node 22.23.2. Es
wurde nichts nachgeladen und kein Netz benutzt.

## 1. Der Tokenizer ist ein Stellvertreter

`o200k_base` ist die tatsächliche Kodierung der GPT-4o-Linie. Für andere Modellfamilien, die
Claude-Linie eingeschlossen, ist der Tokenizer **nicht öffentlich dokumentiert**; die Zahlen unten
sind dort eine belastbare Größenordnung und keine exakte Zahl für jeden Client. Für die
Entscheidung, die an ihnen hängt — passt das in ein übliches Kontextfenster oder nicht —, genügt
das: Sie kippt nicht an fünf Prozent Abweichung.

## 2. Die Messung

| Größe | Zeichen | Token | Zeichen je Token |
| --- | --- | --- | --- |
| 54 Werkzeugdefinitionen, wie ausgeliefert | 197.528 | 48.305 | 4,09 |
| instructions, Auslieferungszustand | 5.092 | 1.259 | 4,04 |
| instructions, alle Schalter an | 5.760 | 1.419 | 4,06 |
| Was der Client beim Verbinden sieht | 202.620 | 49.564 | 4,09 |
| 54 Definitionen in der Rechenweise von P11 | 197.528 | 48.305 | 4,09 |

Die Zeile „wie ausgeliefert" misst genau das, was `server/register-tools.ts` an `registerTool`
übergibt: Name, Titel, Beschreibung, Annotationen, das JSON Schema aus `schema/build.ts` und das
offene Ausgabeschema aus `response/output-schema.ts`.

P11 (`test/registry/token-budget.test.ts`) baut die Definition aus dem Registereintrag nach, weil
die Prüfung vor den Paketen entstand, die `schema/build.ts` und `response/output-schema.ts`
liefern. Der Nachbau ruft inzwischen genau diese beiden Module auf und misst deshalb denselben
Gegenstand: Beide Zeilen der Tabelle stimmen auf das Token überein.

## 3. Das Zeichen-je-Token-Verhältnis

**Gemessen: 4,09 Zeichen je Token.** Plan 4.10 hatte **3,2** angesetzt und ausdrücklich als
Annahme gekennzeichnet. Die Annahme lag zu niedrig: Eine Werkzeugdefinition ist zum größeren Teil
JSON-Struktur mit englischen Feldnamen, und die zerfällt in wenige, lange Token; der deutsche
Fließtext drumherum kommt in `o200k_base` ebenfalls auf rund vier Zeichen je Token, nämlich auf
4,04 in den instructions, die fast nur Fließtext sind.

In `src/registry/budget.ts` steht `CHARS_PER_TOKEN` deshalb jetzt auf **4** statt auf 3,2. Der
Wert ist gegenüber der Messung **abgerundet**, und zwar mit Absicht: Die Konstante wird zur
Laufzeit nur in `response/truncate.ts` (7.6) und in `doctor` (8.4) benutzt, und dort schätzt ein
zu kleiner Faktor die Tokenzahl zu hoch, kürzt also eher zu früh. Plan 7.6 nennt genau diese
Richtung die harmlose.

**Was die Zahl nicht sagt:** Sie ist an Werkzeugdefinitionen und am Servertext gemessen, nicht an
API-Antworten. Antwortzeilen bestehen aus Kennungen, Datumswerten und Beträgen, die schlechter
tokenisieren als Fließtext. Die Kürzung in 7.6 rechnet also mit einem Faktor, der für ihren
eigenen Gegenstand eher zu groß ist — auch deshalb die Abrundung.

## 4. Das Budget

Das Budget der Werkzeugdefinitionen ist eingehalten: 48.305 von 49.000 Token.

In der Rechenweise von P11 sind es 48.305 Token. P11 bricht seit der Entscheidung vom 2026-09-13
wieder hart an der Grenze von 49.000 Token ab: noch 695 Token Luft, der Testlauf ist grün.

Das Budget der instructions ist eingehalten: 1.419 von 2.100 Token, gemessen im größten Zustand.

**Woher die Grenze von 49.000 Token kommt.** Plan 4.10 hatte 32.000 vorgerechnet, und dieser Wert
war gerissen: Die Messung vom 2026-09-12 kam auf 48.305 Token, ein Überschuss von 16.305. Die
Reihenfolge der Gegenmaßnahmen aus 4.10 kann diese Lücke nicht schließen, und das ist ausgerechnet
und nicht behauptet: 16.305 Token sind rund 66.700 Zeichen, während alle 54 Werkzeugbeschreibungen
zusammen nur 32.654 Zeichen lang sind. Selbst wenn jede von ihnen vollständig in die Resources
wanderte, wäre das weniger als die Hälfte. Übrig bliebe allein der Posten Parameterbeschreibungen
mit 67.161 Zeichen, der damit praktisch ganz entfallen müsste; das widerspricht E6, so wie
Werkzeuge zu streichen oder zusammenzulegen E1 widerspricht. Der Projektinhaber hat das Budget
deshalb am 2026-09-13 ausdrücklich auf den gemessenen Stand zuzüglich 695 Token Luft angehoben.
Die Entscheidung steht in `CHANGELOG.md`, die Begründung in `src/registry/budget.ts`, und P11
bricht seither wieder hart an der Grenze ab statt nur zu warnen. Die zwischenzeitliche Sperrgrenze
`TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT` ist damit entfallen; zwei harte Zahlen nebeneinander
wären dieselbe Grenze zweimal.

Die Luft ist mit Absicht klein. Sie trägt eine Umformulierung, aber weder ein weiteres Werkzeug
noch ein Schemafeld von Gewicht. Die Postentabelle im nächsten Abschnitt sagt, wo die Zeichen
sitzen. Sie ersetzt die Prüfung nicht: Aus einer Zeichenzahl folgt, welcher Posten größer
ausgefallen ist als angesetzt, aber nicht, welche der sechs Sparmaßnahmen dort fehlt. Das ist an
den Registereinträgen zu prüfen und gehört nicht in dieses Skript.

## 5. Die Rechnung aus Plan 4.10, nachgeprüft

| Posten | angesetzt in 4.10 (Zeichen) | gemessen (Zeichen) | Abweichung |
| --- | --- | --- | --- |
| Werkzeugbeschreibungen nach Stufenbudget (S2) | 39.120 | 32.654 | −6.466 |
| Parameterbeschreibungen, reiner Text (S1, S3, S4, S5) | 38.400 | 67.161 | +28.761 |
| `outputSchema` ohne Feldbeschreibungen (S6) | 14.040 | 40.030 | +25.990 |
| Name, Titel, Annotationen, Schemarümpfe | 5.238 | 57.683 | +52.445 |
| Summe | 96.798 | 197.528 | +100.730 |

Die Spalte „angesetzt" ist die Endabrechnung aus Plan 4.10 nach den sechs Sparmaßnahmen. Gemessen
wird in derselben Abgrenzung wie dort: „Parameterbeschreibungen" sind die Summe aller
`description`-Texte im Eingabeschema, auf jeder Schachtelungstiefe, **ohne** die Schemastruktur
drumherum; diese Struktur steckt in der Zeile „Name, Titel, Annotationen, Schemarümpfe", zusammen
mit den Schlüsseln und Anführungszeichen des JSON. Die vier Zeilen addieren sich deshalb genau zur
Summe.

Zwei Lesehilfen zu den Abweichungen. **Erstens:** Die Zeile `outputSchema` ist nicht Folge einer
ausgelassenen Sparmaßnahme. S6 ist umgesetzt, und die Messung belegt es: 0 Zeichen
Feldbeschreibung in allen 54 Ausgabeschemata zusammen. Größer als angesetzt ist das Schema, weil
es den Umschlag dieses Servers mitbeschreibt: `endpoint`, die Paginierungstatsachen,
`_contract_warnings`, die Ganzzahl-Cent-Felder und bei schreibenden Werkzeugen den aufgelösten
Datensatz samt Rückweg. Das sind Zusagen aus 7.1 und 7.6, keine Prosa.

**Zweitens:** Die Zeile „Schemarümpfe" war in 4.10 mit 97 Zeichen je Werkzeug angesetzt. Ein JSON
Schema Draft 2020-12 über im Schnitt sechs Parameter, mit Typen, Grenzen, Enums und den
Elementschemata der Positionslisten, ist um ein Vielfaches größer. Beide Abweichungen sind
Rechenfehler der Schätzung und keine Abweichung von einer Vorgabe. Der Posten, der tatsächlich an
den Registereinträgen hängt, ist die Zeile „Parameterbeschreibungen": Dort schlagen S1, S3, S4 und
S5 zu Buche.

## 6. Die zehn teuersten Werkzeugdefinitionen

| Werkzeug | Stufe | Zeichen | Token |
| --- | --- | --- | --- |
| `bb_invoices_create_einvoice` | 1 | 8.493 | 2.119 |
| `bb_postings_search` | 1 | 7.737 | 1.937 |
| `bb_invoices_create` | 1 | 7.640 | 1.896 |
| `bb_invoices_create_draft` | 1 | 7.120 | 1.751 |
| `bb_receipts_search` | 1 | 6.660 | 1.695 |
| `bb_receipts_upload` | 1 | 6.441 | 1.597 |
| `bb_receipts_create` | 2 | 6.233 | 1.544 |
| `bb_postings_create_for_receipt_batch` | 1 | 5.821 | 1.464 |
| `bb_postings_create_for_receipt` | 1 | 5.443 | 1.373 |
| `bb_postings_create_for_transaction_batch` | 1 | 5.470 | 1.349 |

Die Stufe ist das Beschreibungsbudget aus Plan 4.9 (900, 700 beziehungsweise 480 Zeichen). Sie
begrenzt allein die Werkzeugbeschreibung; der größere Teil einer teuren Definition ist das
Eingabeschema mit seinen Parametertexten.
