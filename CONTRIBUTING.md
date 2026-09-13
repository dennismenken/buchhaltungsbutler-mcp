# Mitwirken

Danke für das Interesse. Dieses Dokument sagt, wie die Entwicklungsumgebung aufgesetzt wird, wie
ein Werkzeug entsteht, welche Regeln für Tests gelten und was vor einer Veröffentlichung
zwingend läuft.

Wer eine Sicherheitslücke gefunden hat, liest zuerst [SECURITY.md](SECURITY.md) und öffnet
**kein** öffentliches Issue.

---

## 1. Entwicklungsaufbau

### Node

Für die **Laufzeit** des veröffentlichten Pakets gilt `engines.node`: **`>=22.19.0`**.

Für **Bau und Entwicklung** ist die Spanne enger, weil `tsdown@0.23.0` die Range
`^22.18.0 || ^24.11.0 || >=26.0.0` deklariert. Zusammen mit der Laufzeitgrenze bleibt:

| erlaubt zum Bauen | nicht erlaubt zum Bauen |
| --- | --- |
| `>=22.19.0 <23.0.0` | 23.x |
| `>=24.11.0 <25.0.0` | 24.0 bis 24.10, 25.x |
| `>=26.0.0` | |

Die CI-Matrix nennt genau die beiden Untergrenzen **22.19.0** und **24.11.0**. Eine unbestimmte
Angabe wie „Node 24" wäre zu ungenau: Löst sie auf 24.10 auf, scheitert der Bau an einer Stelle,
an der niemand einen Node-Versionsfehler vermutet.

### Paketmanager

**pnpm 10.34.3**, festgehalten im Feld `packageManager` der `package.json`. Das Lockfile ist
eingecheckt und wird mitgeändert.

```bash
corepack enable
pnpm install --frozen-lockfile
```

### Der gesamte Lauf

```bash
pnpm generate     # Generate aus der Spezifikation, Registerindex, Werkzeugtabelle der README
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint, typgestützt
pnpm format       # Biome; mit --check nur prüfen
pnpm test         # Vitest, ohne Netz
pnpm build        # tsdown
```

`build`, `test` und `typecheck` rufen `pnpm generate` selbst als ersten Schritt auf. Grund:
`src/registry/index.generated.ts` ist das einzige Generat, das **nicht** eingecheckt wird, und
es muss vor jedem dieser Läufe entstehen.

### Was die Generatoren erzeugen

| Datei | Quelle | Eingecheckt |
| --- | --- | --- |
| `src/generated/endpoints.ts` | `docs/openapi/buchhaltungsbutler-v1.json` | ja |
| `src/generated/errors.ts` | dieselbe Spezifikationsdatei | ja |
| `src/generated/version.ts` | `package.json` | ja |
| `src/registry/index.generated.ts` | der Verzeichnisinhalt von `src/registry/tools/` | **nein** |
| die beiden Werkzeugtabellen in `README.md` | das Register | ja |

Die CI führt `pnpm generate` aus und danach `git diff --exit-code`. Wer ein Werkzeug ändert und
`pnpm generate` vergisst, bekommt deshalb eine rote CI und keine stille Abweichung zwischen
README und Register. Die Tabellen der README sind **nicht von Hand zu pflegen**; sie stehen
zwischen den Markierungen `<!-- werkzeuge-bereiche:… -->` und `<!-- werkzeuge-tabelle:… -->` und
werden von `scripts/gen-tool-table.ts` ersetzt.

---

## 2. Der Weg über das Register

**Es gibt genau ein Werkzeug je API-Endpunkt, und jedes Werkzeug ist genau eine Datei.** Unter
`src/registry/tools/` liegen 54 Dateien; der Dateiname ist der Werkzeugname. Es gibt keine
Sammeldatei, keinen Handler je Werkzeug und keine zweite Liste.

Ein neues oder geändertes Werkzeug entsteht in fünf Schritten; sie stehen in derselben Form in
[README.md, Abschnitt 18](README.md#18-einen-neuen-endpunkt-nachrüsten):

1. Neue Spezifikationsdatei einspielen, `pnpm generate`. Die Vollständigkeitsprüfung P1 nennt
   den neuen Pfad.
2. `src/registry/tools/<werkzeugname>.ts` anlegen.
3. Den Eintrag nach dem Typ `ToolEntry` aus `src/registry/types.ts` füllen.
4. `pnpm generate` erneut.
5. `pnpm test`.

Beim Füllen eines Eintrags gelten diese Regeln:

- **Jeder Parameter des Endpunkts kommt genau einmal vor**, entweder in `fields` oder mit
  Begründung in `omitted`. Erfundene Felder gibt es nicht. Das prüft P3.
- **Jede Beschreibung ist deutsch**, mit echten Umlauten. API-Feldnamen, Werkzeugnamen und
  Enum-Werte stehen unverändert im Original.
- **Jedes schreibende Werkzeug trägt genau einen der Pflichtsätze U1 bis U7** aus
  `src/registry/mandatory-sentences.ts`, zeichengenau, und ein nicht leeres `verifyWith`.
- **Der Antwortvertrag gilt je Endpunkt, nicht je Fachobjekt.** Dasselbe Fachobjekt heißt an
  zwei Endpunkten unterschiedlich; ein gemeinsamer Typ erzeugt dort still leere Felder.
- **Ein Wertevorrat wird nicht geraten.** Wo die Spezifikation sich widerspricht, steht ein
  freier Text und der Widerspruch in der Parameterbeschreibung. Eine erfundene Schranke lehnt
  gültige Vorgänge unsichtbar ab, bevor die Anfrage überhaupt hinausgeht.
- **Ein Werkzeug bildet seinen Endpunkt ab, ohne verborgene Logik.** Formt der Server etwas um,
  beantwortet er etwas aus dem Stammdatenspeicher oder führt er ein Feld, das gar nicht an die
  API geht, dann sagt die Beschreibung oder die Antwort das. Still geändertes Verhalten gibt es
  nicht.
- **Der Server sperrt keinen Aufruf; die Freigabe liegt beim Client.** Es gibt keinen Parameter
  `confirm` und keine serverseitige Rückfrage vor dem Schreiben. Die Begründung steht in
  [`docs/entwicklung/tool-design.md`, Abschnitt 9.4](docs/entwicklung/tool-design.md#94-bestätigung-liegt-beim-host-nicht-im-server).
  Was der Server dem Client stattdessen mitgibt, sind korrekte Annotationen, der Pflichtsatz und
  eine Antwort, die den Vorgang aufgelöst ausweist; die Annotationen prüft P7, den fehlenden
  `confirm`-Parameter und den Pflichtsatz P8.
- **Was nicht gemessen ist, wird als nicht gemessen gekennzeichnet**, im Feld `verified` und im
  Kommentar der Datei.

---

## 3. Tests

### Die absolute Regel

**Kein Test schreibt gegen die echte API, und der normale Testlauf setzt überhaupt keinen
Netzwerkaufruf ab.** Das ist nicht Disziplin, sondern durchgesetzt:

- `test/setup.ts` installiert den `MockAgent` von `undici` mit `disableNetConnect()` und setzt
  eine nicht auflösbare Basis-URL.
- Ein eigener Test prüft, dass diese Sperre aktiv ist. Ohne ihn wäre sie das Erste, was bei
  einem Umbau stumm ausfällt.
- In `test/` ist kein direkter `fetch(`-Aufruf ohne Mock erlaubt, und keine Zeichenkette, die
  wie ein Zugangsdatum aussieht.

Echte Antworten werden als Golden-Dateien unter `test/golden/` abgelegt, **anonymisiert**:
Beträge, Namen, Kontonummern und Kennungen sind ersetzt.

### Die dreizehn Registerprüfungen

Sie liegen unter `test/registry/` und sind der Grund, warum „genau ein Werkzeug je Endpunkt, mit
allen Parametern" überhaupt überprüfbar ist: Vollständigkeit und Eineindeutigkeit der Pfade,
Parameterdeckung gegen das Generat, Namensschema, Klassen gegen eine zweite, unabhängig
gepflegte Liste, Wirkungsabgleich, Annotationen, Beschreibungen samt Pflichtsätzen und
Verweisen, Geheimnisfreiheit, Ausstattung der schreibenden Einträge, Kontextbudget, Dateiaufbau
und Antwortvertrag gegen Projektion.

Zwei davon fallen erfahrungsgemäß zuerst auf die Füße:

- **Verweise.** Jeder Verweis auf ein anderes Werkzeug muss einen Namen nennen, den es gibt. Ein
  Abgrenzungssatz, der ins Leere zeigt, lenkt den Assistenten in einen garantierten Fehlschlag.
- **Kontextbudget.** Die Grenzen stehen in `src/registry/budget.ts`. **Sie sind keine Zahl, die
  ein Mitwirkender anhebt.** Reißt das Budget, wird gekürzt oder Inhalt in die Resources
  verschoben; ist danach immer noch kein Platz, ist das ein Befund für den Projektinhaber.

Denselben Rang hat das Größenbudget des Pakets in `scripts/check-size.ts`.

---

## 4. Vor einer Veröffentlichung: der Vertragslauf

```bash
pnpm contract:read
```

**Dieser Lauf ist vor jeder Veröffentlichung Pflicht.** Er ruft die 15 lesenden Endpunkte je
einmal mit echten Zugangsdaten auf und vergleicht Feldmenge und JSON-Typen der Antwort mit dem
`responseContract` des jeweiligen Registereintrags. Ausgegeben wird, welche Felder neu, welche
verschwunden und welche im Typ verändert sind.

Er ist die einzige Ausnahme von der Regel in Abschnitt 3 und läuft deshalb **nicht** in der
öffentlichen CI. Die Erlaubnisliste wird aus dem Register erzeugt, nicht abgeschrieben; jeder
andere Pfad lässt den Lauf werfen, **bevor** ein Aufruf abgeht. Geschäftsdaten schreibt er nicht
in eine Datei, nur Feldnamen und Typen.

Weil er nicht in der CI laufen kann, ist er ein **blockierender, bestätigter Punkt der
Veröffentlichungs-Checkliste** und keine Empfehlung. Ein Veröffentlichungsweg, der ihn zur
Pflicht erklärt, ihn aber nicht abwartet, erklärt ihn in Wahrheit zur Empfehlung.

Ebenfalls vor jeder Veröffentlichung: ein Eintrag in [CHANGELOG.md](CHANGELOG.md).

---

## 5. Sprache, Form und Commits

- **Dokumentation, Kommentare und alle Texte, die ein Nutzer oder ein Assistent liest, sind
  deutsch**, mit echten Umlauten (ä, ö, ü, ß). Ersatzschreibweisen wie `ae`, `oe`, `ue` sind
  nicht zulässig.
- **Bezeichner im Quelltext sind englisch**: Variablen, Funktionen, Typen, Dateinamen,
  Aufzählungswerte.
- **Keine Emojis**, an keiner Stelle.
- Gedankenstriche als echtes Zeichen oder weglassen, niemals zwei Bindestriche.
- Kommentiert wird das **Warum**, besonders bei den dokumentierten Eigenheiten der
  Schnittstelle. Was der Quelltext selbst sagt, wird nicht wiederholt.
- Formatiert wird mit Biome (`pnpm format`), geprüft mit ESLint (`pnpm lint`). Beide widersprechen
  sich nicht: Biome formatiert, ESLint prüft ausschließlich Korrektheit.
- Commits im Conventional-Commit-Stil, auf Englisch, etwa
  `fix(registry): correct order enum of bb_postings_search`.

Ein Pull Request beschreibt, **was** sich ändert und **warum**, nennt die betroffenen Werkzeuge
und sagt ausdrücklich, welche Aussagen gemessen und welche abgeleitet oder nicht verifiziert
sind. Ein nicht verifizierter Satz darf an keiner Stelle als Tatsache auftreten.

---

## 6. Was nicht geändert wird

- **Die Budgetgrenzen** in `src/registry/budget.ts` und `scripts/check-size.ts`. Einzige
  Ausnahme ist die Umrechnungskonstante `CHARS_PER_TOKEN`: Sie ist keine Grenze, sondern ein
  Messwert aus `pnpm measure-tokens`.
- **Die Messungen** in `docs/api/live-befunde.md`. Eine Messung wird ergänzt, nicht
  überschrieben: Sie hält fest, was an einem bestimmten Tag gegen die echte API beobachtet wurde,
  und ein späterer Befund hebt eine frühere Beobachtung nicht auf, sondern stellt sich daneben.
- **Die Zahlen in `docs/entwicklung/tokenbudget.md`.** Die Datei wird vollständig von
  `scripts/measure-tokens.ts` erzeugt (`pnpm measure-tokens`); von Hand geänderte Zahlen sind
  beim nächsten Lauf wieder weg.
- **Vergangene Einträge im `CHANGELOG.md`.** Was sich ändert, wird als neuer Eintrag
  fortgeschrieben und nicht rückwirkend in einem alten umgeschrieben.
- **Der Paketname ohne Namensraum.** Er ist nicht der Name dieses Projekts und darf in keiner
  Anleitung als unser Name auftauchen, siehe [NOTICE.md](NOTICE.md).
