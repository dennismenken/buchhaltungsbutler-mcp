# Befund AP19: Verifikation der schreibenden Pfadsegment-Endpunkte

**Stand:** 2026-09-12. Alle Aussagen sind **gemessen**, **abgeleitet** oder ausdrücklich als
**nicht verifiziert**/**Annahme** gekennzeichnet (Vorrangordnung 0.2 des Umsetzungsplans).

**Auftrag (Umsetzungsplan 11.2, AP19):** Feststellen, ob für dieses Vorhaben ein Testmandat
außerhalb der Produktivbuchhaltung vorliegt, mit dem sich das Verhalten von
`/receipts/delete/<wert>` und `/receipts/restore/<wert>` in der Pfadsegmentform sowie das
Wiederholungsverhalten der löschenden und aufhebenden Werkzeuge messen ließe. **Dieses Paket
ändert keine Zeile Code.**

---

## 1. Ergebnis in einem Satz

**Es liegt kein Testmandat außerhalb der Produktivbuchhaltung vor. Es wurde deshalb kein
einziger schreibender Aufruf gegen die BuchhaltungsButler-API ausgeführt** — weder gegen die
Produktivumgebung noch gegen eine andere Umgebung, weil keine andere Umgebung existiert. Diese
Feststellung ist ein vollwertiges Ergebnis dieses Arbeitspakets, kein Fehlschlag (Auftragslage
und 9.9 des Umsetzungsplans).

**Requestbudget:** 0 von höchstens 8 zulässigen Aufrufen verbraucht. Für die Feststellung, ob
ein Testmandat existiert, war kein einziger API-Aufruf nötig, weder lesend noch schreibend.

---

## 2. Prüfung auf ein Testmandat, mit Belegen

Geprüft wurden alle Stellen, an denen ein Testmandat dokumentiert, angekündigt oder mit
Zugangsdaten hinterlegt sein könnte:

| Geprüfte Quelle | Befund |
| --- | --- |
| Zugangsdatendatei `bb.env` im Scratchpad dieser Session | Enthält genau einen Zugangsdatensatz (drei Zeilen: Basis-URL, Nutzername, Passwort/API-Key). Kein zweiter Satz, kein Kommentar, kein Hinweis auf einen zweiten Mandanten oder eine Testumgebung. |
| Auftragstext dieses Arbeitspakets | Bezeichnet die Zugangsdaten ausdrücklich als „die echte Produktivbuchhaltung des Projektinhabers" und verbietet schreibende Aufrufe absolut. Kein Hinweis auf ein Testmandat. |
| `docs/entwicklung/umsetzungsplan.md`, Abschnitt 9.9 | Nennt das gesonderte Testmandat als **ersten** von drei Wegen, die schreibenden Endpunkte zu prüfen, formuliert es aber als etwas, das der Projektinhaber **erst noch** einrichten oder beim Anbieter erfragen müsste. Kein Beleg, dass dies bereits geschehen ist. |
| `docs/entwicklung/umsetzungsplan.md`, Abschnitt 14.2 | Führt die Pfadsegmentform von `delete`/`restore` und das Wiederholungsverhalten ausdrücklich als **nicht verifiziert** und nennt „Testmandat nötig" als offenen Punkt, nicht als erledigten. |
| `docs/api/live-befunde-orchestrator.md`, Befund 1 | Bezeichnet beide schreibenden Pfadformen ausdrücklich als „nein, schreibend, nicht getestet" und verweist die Verifikation „in den ersten Schreibtest des Projektinhabers" — also in die Zukunft, nicht in einen bereits vorhandenen Testrahmen. |
| Volltextsuche über `docs/` nach „Testmandat", „Sandbox", „Testumgebung", „Test-Mandant", „Demo-Mandant", „Staging" | Alle Treffer sind Fußnoten, Empfehlungen oder Bausteine der Testinfrastruktur des **Pakets selbst** (`vitest`-Testumgebung `node`, eine Mock-Basis-URL `http://localhost.invalid` für Einheitstests). Kein Treffer verweist auf einen zweiten BuchhaltungsButler-Mandanten oder eine vom Anbieter bereitgestellte Sandbox. `docs/entwicklung/distribution.md` 9.4 behandelt ausschließlich die MCP-Client-seitige „Sandbox"-Eigenschaft von Konfigurationsdateien, nicht eine API-Sandbox des Anbieters. |
| Frühere Entwürfe (`plan-entwurf-a.md`, `plan-entwurf-c.md`) | Nennen ein Testmandat ebenfalls nur als Voraussetzung für ein eigenes, noch zu erledigendes Arbeitspaket (dort AP-13 bzw. „vor AP8b"), nicht als vorhandene Ressource. |

**Schlussfolgerung:** An keiner Stelle der Dokumentation, der Zugangsdaten oder des
Auftragstextes findet sich ein Beleg für ein bestehendes Testmandat. Die einzigen verfügbaren
Zugangsdaten öffnen die Produktivbuchhaltung. Ein BuchhaltungsButler-Test-/Demo-Mandant oder
eine vom Anbieter bereitgestellte Sandbox-Umgebung ist nirgends dokumentiert oder mit
Zugangsdaten hinterlegt.

---

## 3. Konsequenz für die vier betroffenen Fragen aus 9.9

Ohne Testmandat konnte keine der folgenden vier Fragen geklärt werden. Sie bleiben unverändert
auf dem in 4.6, 14.2 und 3.3 des Umsetzungsplans bereits festgelegten Stand:

1. **Pfadsegmentform von `/receipts/delete/<wert>` und `/receipts/restore/<wert>`.** Weiterhin
   **abgeleitet, nicht gemessen** — Analogieschluss aus der gemessenen Form von
   `/receipts/get/<wert>` und `/transactions/get/<wert>` (L1). Kein Aufruf gegen diese beiden
   Endpunkte wurde ausgeführt, weder in Segment- noch in Body-Feld-Form.
2. **Wiederholungsverhalten der löschenden und aufhebenden Werkzeuge** (`delete`, `restore`,
   die drei `unconfirm`-Werkzeuge, `unassign`, `cancel`). Weiterhin **nicht verifiziert**. Kein
   Aufruf, kein Doppelaufruf, keine Beobachtung.
3. **Betragsformat beim Senden.** Weiterhin **nicht verifiziert** (14.2 nennt dies gesondert;
   AP19 war dafür nicht zuständig, wird hier der Vollständigkeit halber mitgeführt, weil 9.9
   dieselbe Testmandat-Lücke dafür nennt).
4. **`destructiveHint` von `bb_postings_assign_receipt`** (Frage, ob der Aufruf einen
   bestehenden Belegbezug ersetzt statt nur ergänzt, 3.3). Weiterhin **nicht verifiziert**.

---

## 4. Arbeitsliste für AP19b — entfällt

Nach 11.2 des Umsetzungsplans gilt: **„Es läuft nur, wenn es etwas zu tun gibt. Liefert AP19
kein belegtes Ergebnis, entfällt AP19b ersatzlos, und AP22 hält das fest."** Da dieses Paket
kein einziges neu gemessenes Verhalten liefert, gibt es **keine** Arbeitsliste für
Registereinträge, `classes.ts`, die zweite Klassenliste in `test/registry/` oder
`annotations.test.ts`. Konkret bleibt für jeden potenziell betroffenen Registereintrag
**alles unverändert** gegenüber dem in 3.3, 3.8, 4.6 und 14.2 festgelegten
Auslieferungszustand:

| Registereintrag | Feld | Zustand vor AP19 | Zustand nach AP19 | Änderung nötig |
| --- | --- | --- | --- | --- |
| `bb_receipts_delete` | `verified` (Vermerk zur Pfadform) | `false`, Begründung „gleiche Form wie L1, schreibend, nicht getestet" | unverändert `false`, dieselbe Begründung | nein |
| `bb_receipts_delete` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_receipts_restore` | `verified` (Vermerk zur Pfadform) | `false`, dieselbe Begründung | unverändert `false` | nein |
| `bb_receipts_restore` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_transactions_unassign_receipt` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_postings_unconfirm_for_receipt` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_postings_unconfirm_for_transaction` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_postings_unconfirm_free` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_postings_cancel` | `idempotentHint` | `false` (Klasse D, S6) | unverändert `false` | nein |
| `bb_postings_assign_receipt` | `destructiveHint` | `false` (Klasse B, Sonderfall, 3.3) | unverändert `false` | nein |
| `src/registry/classes.ts`, Klassentabelle (3.3) | Auszählung `destructiveHint`/`idempotentHint` | 13 bzw. 19 Werkzeuge | unverändert 13 bzw. 19 | nein |
| `docs/entwicklung/umsetzungsplan.md` Abschnitte 3.3, 3.8, 3.9, 14.2 | Auslieferungszustand | wie dokumentiert | unverändert; der Plan wird nach 3.3 nicht rückwirkend geändert | nein |

Diese Tabelle ist bewusst vollständig ausgeschrieben, obwohl jede Zeile „nein" trägt: Sie zeigt
einem nachfolgenden Agenten, dass die Prüfung stattgefunden hat und an jedem einzelnen
möglicherweise betroffenen Punkt zu keiner Änderung führt, statt dass „nichts zu tun" nur
behauptet wird.

---

## 5. Wann diese Feststellung neu zu treffen ist

Sobald der Projektinhaber ein Testmandat einrichtet oder beim Anbieter eine Testumgebung
erhält (Umsetzungsplan 9.9, Weg 1), ist AP19 mit demselben Dateibesitz erneut auszuführen. Erst
ein dann belegtes Ergebnis — Datum, genaue Aufrufform, HTTP-Status, Antwortkörper je geprüftem
Werkzeug, und für das Wiederholungsverhalten mindestens zwei aufeinanderfolgende Aufrufe mit
identischen Argumenten gegen denselben Datensatz — löst AP19b nach Abschnitt 11.2 aus und liegt
diesem Befund dann als neuer Abschnitt bei.

---

## 6. Ausdrückliche Feststellungen zum Auftragsrahmen

- **Kein schreibender Aufruf wurde gegen die BuchhaltungsButler-API ausgeführt**, weder gegen
  die freigegebene Leseliste noch gegen einen der vier untersuchten Endpunkte noch gegen einen
  sonstigen Pfad. Das Requestbudget dieser Session ist mit 0 von 8 zulässigen Aufrufen für
  dieses Arbeitspaket vollständig ungenutzt.
- **Keine Zeile Code wurde geändert.** Dieses Paket hat ausschließlich die vorliegende Datei
  `docs/entwicklung/befund-schreibend.md` angelegt.
- **Dieses Paket blockiert keinen anderen Pfad** (AP19-Definition of Done). Da kein belegtes
  Ergebnis vorliegt, entfällt AP19b nach 11.2 ersatzlos; AP22 hat dies in der Skeptikerphase
  ausdrücklich festzustellen, nicht stillschweigend zu übergehen.
