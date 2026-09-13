# Veröffentlichungs-Checkliste

**Stand:** 2026-09-13. **Zielleser:** der Projektinhaber. **Geltung:** jede Veröffentlichung
auf npm, die erste eingeschlossen.

Diese Liste wird von oben nach unten abgearbeitet. Jeder Punkt nennt den Befehl und das
erwartete Ergebnis; ein Punkt, dessen Ergebnis abweicht, wird geklärt und nicht übersprungen.

**Was der Umsetzungs-Workflow ausdrücklich nicht getan hat** (Plan 11.2, AP21): kein
`npm publish`, auch nicht als Probelauf gegen eine andere Registry; kein `git tag`, kein
`git push`; kein Anlegen des öffentlichen GitHub-Repositorys; kein Auslösen von `publish.yml`,
weder über einen Tag noch über `workflow_dispatch`. Die beiden unumkehrbaren Schritte —
Veröffentlichung auf npm und Anlegen des Repositorys — führt der Projektinhaber selbst aus,
nachdem er das Ergebnis gesehen hat. Diese Liste ist alles, was er dafür braucht.

**Abkürzungen in dieser Liste:** `<version>` ist die zu veröffentlichende Version ohne `v`,
also zum Beispiel `0.1.0`; `<tag>` ist dieselbe Version mit `v` davor, also `v0.1.0`;
`<heute>` ist das Datum des Vertragslaufs in der Form `JJJJ-MM-TT`.

---

## 0. Befunde aus AP21, vor allem Weiteren zu klären (Stand 2026-09-13: abgehakt)

Diese Punkte wurden beim Vorbereiten der Veröffentlichung gefunden. Sie stammen nicht aus
diesem Arbeitspaket und wurden hier deshalb gemeldet und nicht in ihm behoben; behoben wurden
sie inzwischen an anderer Stelle, jeder Punkt nennt Datum und Messung. **Solange einer davon
offen ist, scheitert `publish.yml` an den eigenen Prüfschritten, und zwar vor `npm publish`.**
Das ist die Absicht: Ein roter Lauf ist billiger als eine veröffentlichte Fassung, die nicht
übersetzt.

**Stand 2026-09-13: Alle drei Punkte dieses Abschnitts sind abgehakt.** `pnpm typecheck` und
`pnpm test` wurden am 2026-09-13 selbst nachgemessen und waren grün; kein Prüfschritt von
`publish.yml` steht der Veröffentlichung damit noch im Weg. Was bleibt, ist keine Prüfung,
sondern eine **Entscheidung**: der Zielwert des Tokenbudgets (Unterpunkt zu P11, dazu
`docs/entwicklung/befund-tokenbudget.md`). Der **Nachtrag** in diesem Unterpunkt nennt eine
Anhebung auf 49.000, die diese Liste nicht bestätigen kann und die der Projektinhaber prüfen
muss.

- [x] **`pnpm typecheck` ist grün.** ~~Am 2026-09-13 war er rot:
      `src/upload/ssrf.ts(645,18): error TS2322: Type 'GuardedLookup' is not assignable to
      type 'LookupFunction'` — unter `exactOptionalPropertyTypes` passt `family?: number |
      "IPv4" | "IPv6" | undefined` aus den Node-Typen nicht auf die engere Signatur des
      Wächters. Die Datei gehört dem Arbeitspaket, das `src/upload/` verantwortet.~~
      **Erledigt am 2026-09-13.** Selbst nachgemessen am 2026-09-13: `pnpm typecheck` endet
      mit **Rückgabewert 0**, und `tsc --noEmit` gibt keine einzige Diagnose aus; der genannte
      Fehler in `src/upload/ssrf.ts` tritt nicht mehr auf. Die Ausgabe des Laufs stammt
      vollständig aus dem im selben Skript vorgeschalteten `pnpm generate` (fünf Generatoren,
      54 Werkzeuge) — das ist erwartet und keine `tsc`-Ausgabe.
- [x] **`pnpm test` ist grün.** ~~Am 2026-09-13 waren drei Dateien rot, 1232 von 1237
      Prüfungen grün.~~ **Erledigt am 2026-09-13.** Selbst nachgemessen am 2026-09-13:
      **83 Testdateien, alle Prüfungen grün**, Rückgabewert 0, keine rote Datei — um 04:01 Uhr
      1339 von 1339, um 04:07 Uhr 1340 von 1340. Die drei damals roten Dateien sind darin
      enthalten und wurden zusätzlich einzeln nachgefahren (token-budget, secrets, eval: je
      grün). Die tragende Aussage ist die Vollständigkeit, nicht die absolute Zahl — sie wächst
      mit jeder neuen Prüfung.
      Was aus den drei Unterpunkten geworden ist:
      - ~~`test/registry/token-budget.test.ts` (P11): 41.569 Token für 54 Definitionen gegen
        eine Grenze von 32.000.~~ **Erledigt am 2026-09-13, ohne die Grenze anzuheben.** Die
        32.000 stehen unverändert in `TOTAL_TOOL_DEFINITION_TOKEN_BUDGET` und gelten als
        Zielwert; P11 meldet den Überschuss (48.305 Token) bei jedem Lauf auf stderr und
        bricht an der getrennten Sperrgrenze `TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT` ab,
        die nur weiteres Wachstum verhindert. Der Befund selbst bleibt offen und steht in
        `docs/entwicklung/befund-tokenbudget.md` sowie in `CHANGELOG.md`. **Den Zielwert auf
        den gemessenen Stand anzuheben ist weiterhin eine Entscheidung des Projektinhabers
        mit Eintrag in `CHANGELOG.md`** (Plan 4.10), keine Nebenwirkung dieser Liste.

        **Nachtrag vom 2026-09-13, 04:04 Uhr — nicht bestätigt, bitte prüfen:** Der Absatz
        darüber beschreibt die Lage bis zu diesem Zeitpunkt. Seither steht in
        `src/registry/budget.ts` `TOTAL_TOOL_DEFINITION_TOKEN_BUDGET = 49_000`, die Sperrgrenze
        `TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT` ist entfallen, und P11 bricht wieder hart am
        Budget ab statt nur zu warnen; der Testlauf ist grün. Die Datei begründet die Anhebung
        mit einer Entscheidung des Projektinhabers vom 2026-09-13 und verweist dafür auf
        `CHANGELOG.md` — **dort steht dieser Eintrag beim Schreiben dieser Zeile nicht**; das
        Änderungsprotokoll führt weiter den alten Wortlaut („`TOTAL_TOOL_DEFINITION_TOKEN_BUDGET`
        steht deshalb unverändert“, Sperrgrenze 49.000 Token). Ob die Anhebung wirklich
        entschieden wurde, kann diese Liste nicht bestätigen. Vor der Veröffentlichung gehören
        `src/registry/budget.ts`, `CHANGELOG.md` und dieser Unterpunkt zur Deckung gebracht.

        **Nachtrag II vom 2026-09-13, selbst nachgeprüft:** Der Halbsatz darüber, das
        Änderungsprotokoll führe weiter den alten Wortlaut, stimmt nicht mehr. `CHANGELOG.md`
        trägt inzwischen unter „Geändert“ den Eintrag zur Anhebung auf 49.000 Token samt den
        gemessenen 48.305 sowie einen zweiten Eintrag zum Wegfall von
        `TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT`; `src/registry/budget.ts` steht auf
        `TOTAL_TOOL_DEFINITION_TOKEN_BUDGET = 49_000` ohne Sperrgrenze. Die drei Stellen sind
        damit zur Deckung gebracht. **Offen bleibt genau eine Sache, und die kann diese Liste
        nicht abnehmen:** Ein Eintrag im Änderungsprotokoll belegt, dass die Anhebung
        dokumentiert ist, nicht, dass der Projektinhaber sie getroffen hat. Diese Bestätigung
        gehört vor die Veröffentlichung. Gegenprobe am 2026-09-13: `pnpm measure-tokens`
        meldet `54 Werkzeugdefinitionen: 197.528 Zeichen, 48.305 Token (Grenze 49.000).`
      - ~~`test/registry/secrets.test.ts` (P9): zehn Golden-Dateien gelten als verdächtig, unter
        anderem `test/golden/entries.ts` wegen des Wortes `api_key` und mehrere JSON-Dateien
        wegen langer Zeichenketten (Dateiinhalte in Base64, Prüfsummen).~~ **Geklärt am
        2026-09-13: Die Prüfung griff zu grob; in keiner Golden-Datei stand etwas, das dort
        nicht hingehört.** Sie wurde daraufhin **geschärft und nicht abgeschaltet** — eine
        dauerhaft rote Sicherheitsprüfung wird überlesen und fängt dann den echten Fall nicht
        mehr. Die Regeln stehen im Kopf von `test/registry/secrets.test.ts`: Ein Zugangsdatum
        zählt in einer Attrappe nur noch in **Schlüsselposition**, also mit zugewiesenem Wert
        (`"api_key": "…"`); derselbe Bezeichner als *Wert* der Registerbuchhaltung `omitted`
        ist erlaubt, und für die 54 **ausgelieferten** Definitionen bleibt es bei der
        strengeren Regel, dass das Wort dort überhaupt nicht vorkommen darf. Dateiinhaltsfelder
        (`file`, `file_content` sowie die Dateien einer Berichtsantwort) gelten ab
        `NUTZLAST_MINDESTLAENGE` = **200 Zeichen** reinem Base64 als Nutzlast statt als
        Schlüssel; ein Zugangsdatum dieser API ist zwei Größenordnungen kürzer. Für Attrappen
        zählen `_` und `-` außerdem nicht mehr als Schlüsselzeichen, weil der Dateiname dieser
        API bauartbedingt keine Endung hat und wie `2026-01-04_Eingangsrechnung_ER-2026-0001`
        aussieht; ein Schlüssel mit Präfix (`sk-proj-<Block>`) bleibt gefasst, weil sein Rumpf
        weiterhin ein ununterbrochener Lauf von 32 Zeichen ist.
        **Die Grenze dieser Prüfung benennt die Datei selbst:** Wer einen Schlüssel absichtlich
        als 200 Zeichen langen Base64-Block in ein Dateiinhaltsfeld legt, wird hier nicht
        gefasst. Das ist der Preis dafür, dass Golden-Dateien überhaupt Dateiinhalte tragen
        dürfen, und steht als „ehrliche Grenze“ im Kopf der Testdatei statt nirgends.
        Gegenprobe am 2026-09-13: ein Suchlauf über `test/golden/` nach einem der vier
        Bezeichner in Schlüsselposition liefert keinen Treffer.
      - ~~`test/eval/tasks.test.ts`: drei der elf Evaluationsaufgaben (6, 8 und 11).~~
        **Erledigt am 2026-09-13.** Behoben wurde, wie Plan 9.8 es verlangt, **am Code und
        nicht an der Aufgabenstellung**: E-1 (V4) das verlorene Vorzeichen in
        `src/response/sanitize.ts`, E-2 (V6) die Kürzung der Berichtsnutzdaten in
        `src/response/table.ts`, E-3 (V2) die Schemameldung mit „undefined“ in
        `src/server/register-tools.ts`. Die drei Prüfungen E-1 bis E-3 am Ende der Datei
        halten seither den **behobenen** Zustand fest statt des Mangels; die Datei läuft mit
        19 von 19 Prüfungen grün. Die Befundlage dazu steht in
        `docs/entwicklung/befund-evaluation.md`.
- [x] **GitHub Actions sind auf einen Commit-SHA gepinnt.** Plan 13.3 verlangt das vor dem
      ersten CI-Lauf. **Erledigt am 2026-09-13.** `ci.yml`, `drift.yml` und `publish.yml`
      nennen keine Tags mehr, sondern je `uses:`-Zeile einen 40-stelligen Commit-SHA mit dem
      Tag als Kommentar dahinter. Ein Tag ist verschiebbar; ein SHA nicht. Für `publish.yml`
      wog das am schwersten, weil dieser Lauf über `id-token: write` ein
      Veröffentlichungsrecht auf npm hält.
      Gepinnt sind, am 2026-09-13 gegen die Release-Seite des jeweiligen Projekts geprüft und
      jeweils die dort aktuelle Fassung:

      | Action | Tag | Commit-SHA |
      | --- | --- | --- |
      | `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
      | `actions/setup-node` | `v7.0.0` | `820762786026740c76f36085b0efc47a31fe5020` |
      | `pnpm/action-setup` | `v6.1.0` | `ea17c68df8912ef543352723c149a84f56e3d413` |

      **Achtung bei `pnpm/action-setup`:** `v6.1.0` ist ein *annotierter* Tag. Die Referenz
      `refs/tags/v6.1.0` zeigt auf das Tag-Objekt `d9184bf…`, nicht auf den Commit. Gepinnt
      gehört der Commit dahinter, also `ea17c68d…`. Wer den SHA von Hand nachschlägt, nimmt
      `git rev-parse v6.1.0^{commit}` und nicht den ersten Wert, den die API ausgibt.
      Der Wechsel ist dort außerdem nicht folgenlos: Der verschiebbare Tag `v6` zeigte am
      2026-09-13 noch auf `v6.0.10`, nicht auf `v6.1.0`. Die Pinnung hebt die tatsächlich
      eingesetzte Fassung also von 6.0.10 auf 6.1.0, wie Plan 13.3 es nennt. Zwischen beiden
      liegt genau ein Commit („feat: support pnpm v12“), der an `action.yml` nur einen
      Beschreibungstext ändert und keine Eingabe entfernt. Dieses Projekt steht auf
      `pnpm@10.34.3`; der neue Zweig für pnpm 12 wird hier nicht betreten. Bei
      `actions/checkout` und `actions/setup-node` zeigten `v7` und der gepinnte SHA am selben
      Tag auf denselben Commit, dort ändert die Pinnung am Verhalten nichts.
      Nachprüfen, ohne etwas zu ändern:
      `grep -rn 'uses:' .github/workflows` → jede Zeile trägt `@<40 Zeichen> # v<x.y.z>`.
      Die Pflege übernimmt Dependabot; die Bedingung dafür ist genau der Tag-Kommentar
      hinter dem SHA, siehe die Begründung in `.github/dependabot.yml`.

---

## 1. Vorbedingungen im Arbeitsverzeichnis

- [ ] **Sauberer Stand auf `main`.**
      `git status --porcelain` → **keine Ausgabe**.
      `git rev-parse --abbrev-ref HEAD` → `main`.
- [ ] **Abhängigkeiten genau nach Lockfile.**
      `pnpm install --frozen-lockfile` → endet mit Rückgabewert 0. Meldet pnpm eine
      Abweichung zum Lockfile, ist das Lockfile nicht eingecheckt worden (Plan 13.7).
- [ ] **Die eingecheckten Generate passen zur Spezifikation.**
      `pnpm generate && git diff --exit-code` → **keine Ausgabe**, Rückgabewert 0.
      Bei einer Abweichung: erst den Grund klären, dann das Generat committen.

---

## 2. Die Felder der `package.json` gegen Plan 13.7

Diese Felder werden **geprüft und nicht geändert**. `package.json` gehört AP01; jede
Abweichung ist ein Befund und wird dort behoben, nicht hier.

- [ ] **Modulart und Dateiliste.**
      `node -p "const p=require('./package.json'); [p.type, JSON.stringify(p.files)].join(' ')"`
      → `module ["dist"]`.
- [ ] **`.npmignore` hält `docs/` und `test/` heraus.**
      `grep -E '^(docs|test)/$' .npmignore` → beide Zeilen.
- [ ] **Genau ein `bin`-Eintrag.**
      `node -p "JSON.stringify(require('./package.json').bin)"`
      → `{"bbutler-mcp":"./dist/cli.js"}`, und sonst nichts.
- [ ] **Laufzeituntergrenze und Paketmanager.**
      `node -p "const p=require('./package.json'); p.engines.node+' '+p.packageManager"`
      → `>=22.19.0 pnpm@10.34.3`.
- [ ] **Die vier exakt gepinnten Pakete tragen keinen Caret.**
      `node -p "const p={...require('./package.json').dependencies,...require('./package.json').devDependencies}; ['@modelcontextprotocol/server','@modelcontextprotocol/client','typescript','tsdown'].map(n=>n+'='+p[n]).join(' ')"`
      → `@modelcontextprotocol/server=2.0.0 @modelcontextprotocol/client=2.0.0
      typescript=6.0.3 tsdown=0.23.0`, **kein `^` an einer der vier Stellen**.
- [ ] **Lockfile ist eingecheckt.**
      `git ls-files --error-unmatch pnpm-lock.yaml` → Pfad wird ausgegeben, Rückgabewert 0.
- [ ] **Der programmatische Einstieg bleibt `dist/index.js`, ausführbar ist nur `dist/cli.js`.**
      Nach `pnpm build`: `ls -l dist/cli.js dist/index.js`
      → `dist/cli.js` mit Modus `755`, `dist/index.js` **ohne** Ausführungsrecht.

*Stand 2026-09-13: Alle sieben Punkte dieses Abschnitts waren erfüllt; eine Abweichung von
13.7 wurde nicht gefunden.*

---

## 3. Der Vertragslauf gegen die echte API (Plan 9.7, blockierend)

Der Lauf ruft die 15 lesenden Endpunkte je einmal auf und vergleicht Feldmenge und JSON-Typen
mit dem `responseContract` des Registers. **Er kann nicht in der öffentlichen CI laufen**, weil
er echte Zugangsdaten braucht (Plan 9.1). Deshalb ist er hier ein abzuhakender Punkt, und
`publish.yml` verlangt später die Bestätigung.

- [ ] **Zugangsdaten liegen in der Umgebung**, nicht in einer Datei des Repositorys.
      `env | grep -c '^BB_API_'` → `3`.
- [ ] **Ablaufplan ansehen, ohne einen Request abzusetzen.**
      `pnpm run contract:read --list`
      Erwartet: die Schlusszeile `15 Einträge, davon 13 mit Aufruf.` und kein Netzverkehr.
      Die beiden Einträge ohne Aufruf sind `/reports/get/bwa` und `/reports/get/sums`: Sie
      sind nur nach einem vorherigen `create`-Lauf abrufbar, und der wäre schreibend.
      *Am 2026-09-13 so ausgeführt, ohne Zugangsdaten und ohne einen Aufruf.*
- [ ] **Lauf ausführen.**
      `pnpm run contract:read`
      Erwartet: Rückgabewert **0** und die Zeile
      `Zusammenfassung: 13 Endpunkt(e) geprüft, 0 nachzutragende(s) Feld(er), … 0 gescheitert.`
      Rückgabewert 1 bedeutet nachzutragende Felder, Rückgabewert 2 einen gescheiterten
      Aufruf. Beides wird geklärt, bevor es weitergeht: Die Spezifikationsdatei wird vom
      Anbieter nicht gepflegt, und was zurückkommt, ist das, was zählt.
- [ ] **Datum und Ergebnis notieren.** Sie kommen wörtlich in die Nachricht des Tags
      (Abschnitt 7). Form:
      `Vertragslauf: <heute> ohne Abweichungen`
      oder, wenn es Abweichungen gab, die die Veröffentlichung trotzdem zulassen:
      `Vertragslauf: <heute> mit Abweichungen: <was abweicht und warum es trotzdem geht>`
      **Das Datum darf beim Tag-Setzen nicht älter als 30 Tage sein**; `publish.yml` bricht
      sonst ab.

---

## 4. Größenbudget, Bau und Bundle

- [ ] **Bauen.**
      `pnpm build` → `dist/cli.js` mit Shebang und Modus 755, `dist/index.js` daneben.
- [ ] **Größenbudget gegen beide Grenzen aus Plan 9.10.**
      `pnpm check-size`
      Erwartet: Rückgabewert 0 und zwei Zahlen unter ihren Grenzen — gepacktes Tarball unter
      **1 MiB** (1.048.576 Bytes), entpackter Inhalt unter **3 MiB** (3.145.728 Bytes).
      Bei Überschreitung nennt der Lauf die zehn größten Dateien. **Zuerst die Ursache suchen,
      nicht die Grenze verschieben**: eine Abhängigkeit, die der Bündler nach `dist/`
      eingerechnet hat; eine Datei, die zur Laufzeit nichts zu suchen hat. Eine Anhebung der
      Grenze ist eine Entscheidung des Projektinhabers mit Eintrag in `CHANGELOG.md`
      (Plan 9.10).
      *Momentaufnahme, kein Sollwert. Am 2026-09-13 um 04:41 Uhr mit Version 0.1.0 selbst
      gemessen: gepackt 620.268 Bytes (605,7 KiB, 59,2 Prozent der Grenze), entpackt
      2.665.803 Bytes (2,54 MiB, 84,7 Prozent), Rückgabewert 0, beide Grenzen eingehalten.
      **Die Zahl ist an den Bau gebunden und verfällt schnell**: derselbe Befehl lieferte am
      selben Tag um 04:37 Uhr noch 617.371 Bytes gepackt, weil zwischendurch am Quelltext
      gearbeitet wurde; die gebündelte Serverdatei wuchs dabei um rund zwei Kilobyte. Wer
      hier eine Abweichung sieht, hat also nicht zwingend einen Fehler gefunden. **Vor jeder
      Veröffentlichung neu messen und diese Stelle ersetzen**; die notierten Werte sind ein
      Vergleichspunkt gegen den letzten Stand, kein Erwartungswert, gegen den man den Lauf
      abgleicht. Was zählt, ist allein das Wort „eingehalten“ hinter beiden Zeilen und der
      Rückgabewert 0. Die größten Posten sind die Sourcemaps; sie bleiben im Paket
      (Plan 9.6 Schritt 1).*
- [ ] **Bundle bauen.**
      `pnpm build-mcpb`
      Erwartet: `bbutler-mcp-<version>.mcpb` im Projektverzeichnis, die Zeile
      `Werkzeuge im Manifest: 54` und eine Größenangabe.
      *Momentaufnahme, kein Sollwert. Am 2026-09-13 um 04:41 Uhr mit Version 0.1.0 selbst
      gebaut: 2.997.340 Bytes (2,86 MiB), 54 Werkzeuge, vier Laufzeitpakete im Bundle
      (`@modelcontextprotocol/core`, `@modelcontextprotocol/server`, `undici`, `zod`).
      Auch diese Zahl wandert mit dem Bau — um 04:39 Uhr waren es 2.995.922 Bytes — und ist
      vor jeder Veröffentlichung neu zu messen und hier zu ersetzen. Plan 9.10 nennt für das
      Bundle ohnehin keine Grenze, seine beiden Grenzen gelten dem Tarball; die Zahl dient
      dem Vergleich mit dem vorigen Stand. Belastbar ist dagegen die Zeile `Werkzeuge im
      Manifest: 54`: Sie muss stimmen.* Das Verpackungswerkzeug kommt
      ausschließlich aus `node_modules`, nie über `npx` (Plan 13.5): Der unscoped Name `mcpb`
      ist auf npm unbesetzt und damit besetzbar.
- [ ] **Bundle einmal von Hand gegenprüfen** (optional, aber vor der ersten Veröffentlichung
      empfohlen):
      `node node_modules/@anthropic-ai/mcpb/dist/cli/cli.js unpack bbutler-mcp-<version>.mcpb /tmp/bundle`
      danach `node /tmp/bundle/server/dist/cli.js --version` → `<version>`.
      *Am 2026-09-13 zusätzlich geprüft: Der entpackte Server beantwortet `initialize` und
      `tools/list` ohne Zugangsdaten und meldet 54 Werkzeuge.*

---

## 5. `CHANGELOG.md` für die Version

- [ ] **Abschnitt geschrieben.** Aus `## [Unveröffentlicht]` wird `## [<version>] - <heute>`,
      und darüber entsteht ein neuer, leerer Abschnitt `## [Unveröffentlicht]`.
      Prüfen: `grep -n '^## \[<version>\]' CHANGELOG.md` → genau eine Zeile.
- [ ] **Der Abschnitt ist nicht leer.** `publish.yml` schneidet genau diesen Abschnitt heraus
      und macht daraus den Text des GitHub-Releases; ein leerer Abschnitt bricht den Lauf ab.
- [ ] **Die benannten Unsicherheiten stehen darin.** Was nicht gemessen ist, steht als
      „nicht verifiziert" im Änderungsprotokoll und nicht nur im Quelltext (Plan 0.2).
- [ ] **Version in `package.json` erhöht** und zum Abschnitt passend.
      `node -p "require('./package.json').version"` → `<version>`.
      Committen, nicht taggen — der Tag kommt erst in Abschnitt 7.

---

## 6. npm-Konto, Namensraum und Trusted Publishing

- [ ] **Angemeldet auf npmjs.com.**
      `npm whoami` → der eigene Kontoname. Kommt stattdessen `ENEEDAUTH`, zuerst
      `npm login` ausführen.
- [ ] **Klären, ob der Namensraum `@dennismenken` zum eigenen Konto gehört.**
      **Ein HTTP 404 auf `npm view @dennismenken/buchhaltungsbutler-mcp` ist dafür kein
      Beleg** (Plan 13.6): Er sagt nur, dass unter diesem Namen nichts veröffentlicht ist, und
      nichts darüber, wem der Namensraum gehört.
      Zwei Fälle, und nur diese beiden tragen:
      1. **Der Kontoname ist `dennismenken`.** Dann ist `@dennismenken` der eigene
         Nutzer-Namensraum und gehört automatisch zum Konto.
         `npm whoami` → `dennismenken`.
      2. **Der Kontoname ist ein anderer.** Dann muss `dennismenken` eine **Organisation**
         sein, in der das Konto Mitglied ist.
         `npm org ls dennismenken` → listet die Mitglieder samt eigenem Konto.
         Schlägt der Befehl fehl, gehört der Namensraum nicht zum Konto: Dann ist
         `dennismenken` unter <https://www.npmjs.com/org/create> als Organisation anzulegen
         (der kostenlose Tarif genügt für öffentliche Pakete) und der Befehl zu wiederholen.
      Erst wenn einer der beiden Fälle zutrifft, ist dieser Punkt abgehakt.
- [ ] **Der unscoped Name bleibt außen vor.** `buchhaltungsbutler-mcp` ohne Namensraum ist
      **belegt** (Plan 13.6). Er darf in keiner Anleitung
      als unser Paketname auftauchen. Prüfen: `grep -rn 'npx -y buchhaltungsbutler-mcp' README.md`
      → **keine Ausgabe**.
- [ ] **Das öffentliche Repository `dennismenken/buchhaltungsbutler-mcp` anlegen** (E3).
      `gh repo create dennismenken/buchhaltungsbutler-mcp --public --source . --remote origin --push`
      oder von Hand über die Weboberfläche und danach `git remote add origin …; git push -u
      origin main`.
      Erwartet: `gh repo view dennismenken/buchhaltungsbutler-mcp` zeigt das Repository,
      `git ls-remote origin main` liefert einen Commit.
      **Dieser Schritt ist unumkehrbar in dem Sinne, dass der Quelltext danach öffentlich ist.**
      Vorher ein letztes Mal prüfen, dass nichts Vertrauliches mitgeht:
      `git ls-files | grep -E '^\.env$|\.pem$|\.key$'` → **keine Ausgabe**.
- [ ] **OIDC Trusted Publishing im npm-Konto einrichten**, damit kein langlebiges Token nötig
      ist. Auf npmjs.com: Paketeinstellungen beziehungsweise, vor der ersten Veröffentlichung,
      die Einstellungen des Namensraums, Abschnitt *Trusted Publisher*. Einzutragen sind fünf
      Werte:
      - Provider: **GitHub Actions**
      - Organization beziehungsweise Owner: **`dennismenken`**
      - Repository: **`buchhaltungsbutler-mcp`**
      - Workflow: **`publish.yml`**
      - Environment: **`npm`** (der Name aus `publish.yml`) oder leer lassen

      Der Workflowname muss **genau** stimmen; npm gleicht ihn gegen das OIDC-Token ab.
      Erwartet: Der Eintrag erscheint in der Liste der Trusted Publisher.
- [ ] **Optional, aber empfohlen: eine Freigabe von Hand vor dem Veröffentlichen.** Im
      GitHub-Repository unter *Settings, Environments* die Umgebung `npm` anlegen und dort
      *Required reviewers* auf das eigene Konto setzen. `publish.yml` läuft dann bis vor
      `npm publish` durch und wartet auf einen Klick.
      Erwartet: Die Umgebung `npm` erscheint mit der Regel in der Liste.

---

## 7. Tag setzen und pushen

Das ist der Auslöser. `publish.yml` hat **keinen** anderen: kein `workflow_dispatch`, keinen
Knopf in der Weboberfläche.

- [ ] **Annotierten Tag setzen, mit der Bestätigung des Vertragslaufs in der Nachricht.**
      Ein leichtgewichtiger Tag trägt keine Nachricht und wird von `publish.yml` abgelehnt.
      ```bash
      git tag -a v<version> -m "Fassung <version>

      Vertragslauf: <heute> ohne Abweichungen"
      ```
      Prüfen, bevor es hinausgeht:
      `git tag -l --format='%(contents)' v<version>` → die Nachricht samt Vertragslauf-Zeile.
      `git cat-file -t v<version>` → `tag` (und nicht `commit`).
- [ ] **Tag pushen.**
      `git push origin v<version>`
      Erwartet: `publish.yml` startet innerhalb weniger Sekunden.
      `gh run watch` zeigt den Lauf.

Was der Lauf dann der Reihe nach tut, und woran er abbricht, **bevor** irgendetwas
veröffentlicht ist:

| Schritt | Bricht ab, wenn |
| --- | --- |
| Tag gegen `package.json` | die Versionen nicht übereinstimmen |
| Bestätigung des Vertragslaufs | der Tag leichtgewichtig ist, die Zeile fehlt, das Datum in der Zukunft liegt oder älter als 30 Tage ist |
| Abschnitt aus `CHANGELOG.md` | es keinen Abschnitt `## [<version>]` gibt oder er leer ist |
| Generatordifferenz, Typprüfung, Linting, Formatierung, Tests | irgendetwas davon rot ist |
| Bau, Größenbudget, `.mcpb`-Bau | das Paket zu groß ist oder das Bundle nicht baut |

Erst danach `npm publish --provenance --access public` über OIDC, dann das GitHub-Release mit
dem `.mcpb` als Anhang und dem Abschnitt aus `CHANGELOG.md` als Text.

---

## 8. Nach dem Lauf prüfen

- [ ] **Der Lauf ist grün.**
      `gh run list --workflow publish.yml --limit 1` → Status `completed`, Ergebnis `success`.
- [ ] **Die Fassung liegt auf npm.**
      `npm view @dennismenken/buchhaltungsbutler-mcp version` → `<version>`.
- [ ] **Provenance ist vorhanden.**
      `npm view @dennismenken/buchhaltungsbutler-mcp@<version> dist.attestations`
      → ein Objekt mit `url` und `provenance`. **Eine leere Ausgabe bedeutet: ohne Provenance
      veröffentlicht.** Dann ist zu klären, ob `id-token: write` fehlte, die npm-Fassung im
      Lauf zu alt war oder der Trusted Publisher nicht griff; die betroffene Fassung lässt
      sich nicht nachträglich attestieren, die nächste dafür wieder.
      Zusätzlich in einem leeren Verzeichnis:
      `npm install @dennismenken/buchhaltungsbutler-mcp@<version> && npm audit signatures`
      → meldet eine verifizierte Attestierung.
- [ ] **Das Release trägt das Bundle.**
      `gh release view v<version>` → der Anhang `bbutler-mcp-<version>.mcpb` ist gelistet, und
      der Text ist der Abschnitt aus `CHANGELOG.md`.
- [ ] **Der Weg, den ein Nutzer geht, funktioniert wirklich.** In einem leeren Verzeichnis:
      `npx -y @dennismenken/buchhaltungsbutler-mcp --version` → `<version>`.
      `npx -y @dennismenken/buchhaltungsbutler-mcp test` ohne Zugangsdaten → Rückgabewert 1
      mit der Meldung „NICHT KONFIGURIERT" (Plan 6.5), **kein** Absturz und **kein** Hängen.
- [ ] **Das Bundle installiert sich in Claude Desktop.** Die `.mcpb`-Datei aus dem Release
      herunterladen und in das Claude-Desktop-Fenster ziehen. Erwartet: die
      Installationsoberfläche mit den vier Feldern *API Client*, *API Secret*, *API Key* und
      *Nur lesen*; nach dem Ausfüllen erscheinen 54 Werkzeuge.

---

## 9. Wenn etwas schiefgeht

- **Der Lauf bricht vor `npm publish` ab.** Nichts ist passiert. Ursache beheben, Tag löschen
  (`git tag -d v<version>` und `git push origin :refs/tags/v<version>`), Tag neu setzen.
- **`npm publish` ist durchgelaufen, das Release nicht.** Die Fassung liegt auf npm und bleibt
  dort; npm erlaubt kein erneutes Veröffentlichen derselben Versionsnummer. Das Release lässt
  sich von Hand nachziehen:
  `gh release create v<version> --title v<version> --notes-file <datei> bbutler-mcp-<version>.mcpb`.
- **Eine Fassung ist versehentlich veröffentlicht.** `npm unpublish` ist nur innerhalb von 72
  Stunden und nur unter Bedingungen möglich und hinterlässt eine Lücke, die niemandem hilft.
  Der übliche Weg ist `npm deprecate @dennismenken/buchhaltungsbutler-mcp@<version> "<Grund>"`
  und eine korrigierte Folgeversion.
- **Der Vertragslauf meldet neue oder geänderte Felder.** Das ist kein Grund, ihn zu
  überspringen, sondern der Grund, warum es ihn gibt. Die Abweichung gehört in den
  `responseContract` des betroffenen Registereintrags und in `CHANGELOG.md`.
