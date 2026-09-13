# Werkzeugkette und Abhängigkeiten, Stand 2026-09-12

Dieses Dossier dokumentiert die Auswahl von Sprache, Build-, Test- und Lint-Werkzeugen sowie
den Veröffentlichungsweg für den inoffiziellen MCP-Server für die BuchhaltungsButler-API.
Alle Versionsangaben wurden am 2026-09-12 per `npm view <paket> version time.modified --json`
gegen die npm-Registry geprüft (nicht aus dem Gedächtnis übernommen). Wo zusätzlich
Web-Recherche oder ein eigener Test in dieser Session nötig war, ist das an der jeweiligen
Stelle vermerkt. Lokale Referenzumgebung zum Zeitpunkt der Recherche: Node v22.23.2,
npm 10.9.8, pnpm 10.34.3 (siehe Abschnitt 1 zur Einordnung dieser Versionen im LTS-Zyklus).

Kennzeichnungskonvention in diesem Dokument: Aussagen ohne Zusatz sind durch `npm view`,
eine offizielle Quelle oder einen eigenen Test belegt. Aussagen, die ich nicht direkt
verifizieren konnte, sind ausdrücklich als **Annahme** oder **nicht verifiziert** markiert.

---

## 1. Node.js: LTS-Status, Mindestversion in `engines`

Quelle: `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json` (offizielles
Node.js-Release-Repository, abgerufen 2026-09-12) sowie `https://nodejs.org/dist/index.json`.
Ergänzend `https://nodejs.org/en/about/previous-releases` (per WebFetch abgerufen; die dortige
automatische Zusammenfassung enthielt widersprüchliche Detailangaben zu v24, siehe unten –
maßgeblich war deshalb die rohe `schedule.json`).

### 1.1 Status der Major-Versionen am 2026-09-12

| Major | Codename | Start | LTS seit | Maintenance seit | Ende | Status am 2026-09-12 |
|---|---|---|---|---|---|---|
| v26 | – | 2026-05-05 | 2026-10-28 (geplant) | 2027-10-20 | 2029-04-30 | **Current** (noch keine LTS-Linie, wird es am 2026-10-28) |
| v25 | – | 2025-10-15 | nie (ungerade Linie) | 2026-04-01 | 2026-06-01 | **End of Life** (bereits seit 2026-06-01) |
| v24 | Krypton | 2025-05-06 | 2025-10-28 | 2026-10-20 (geplant) | 2028-04-30 | **Active LTS** |
| v23 | – | 2024-10-16 | nie | 2025-04-01 | 2025-06-01 | End of Life |
| v22 | Jod | 2024-04-24 | 2024-10-29 | 2025-10-21 | 2027-04-30 | **Maintenance LTS** |
| v21 | – | 2023-10-17 | nie | 2024-04-01 | 2024-06-01 | End of Life |
| v20 | Iron | 2023-04-18 | 2023-10-24 | 2024-10-22 | 2026-04-30 | **End of Life** (seit 2026-04-30) |
| v18 | Hydrogen | 2022-04-19 | 2022-10-25 | 2023-10-18 | 2025-04-30 | End of Life |

Ungerade Major-Versionen (19, 21, 23, 25, 27 …) sind bei Node.js grundsätzlich reine
"Current"-Linien und werden nie zu LTS befördert; ihr Support endet acht Monate nach
Erscheinen. Das erklärt, warum v25 trotz Erscheinen erst Oktober 2025 bereits im Juni 2026
ausgelaufen ist.

Wichtig für dieses Projekt: **Node 20 (Iron) ist seit 2026-04-30 End of Life**, obwohl es die
lokale Referenzangabe in vielen älteren Anleitungen noch als "aktuelles LTS" führt. Aktiv
gepflegt (Sicherheitspatches) werden am 2026-09-12 nur noch v22 (Maintenance, bis 2027-04-30),
v24 (Active LTS, bis 2028-04-30) und v26 (Current, wird im Oktober 2026 zur LTS-Linie).

Die lokale Referenzversion Node v22.23.2 liegt auf der Jod-Linie (Maintenance LTS).

### 1.2 Mindestversion für `engines.node`

Empfehlung: `"node": ">=22.12.0"`.

Begründung:

- Node 20 ist zum Stand dieses Dossiers bereits End of Life. Ein MCP-Server, der Zugangsdaten
  zu einer Buchhaltungs-API entgegennimmt, sollte keine Mindestversion propagieren, die keine
  Sicherheitspatches mehr erhält. Eine niedrigere Untergrenze würde dem Grundsatz
  "ausschließlich aktuelle Bibliotheken und Software" widersprechen, auch wenn sie kurzfristig
  mehr Nutzer mit alten Installationen abdecken würde.
- 22.12.0 ist keine willkürliche Wahl, sondern deckt sich mit der Untergrenze, die zentrale
  Werkzeuge dieser Kette bereits selbst voraussetzen: `vitest@5.0.0` verlangt laut eigenem
  `engines`-Feld `^22.12.0 || ^24.0.0 || >=26.0.0` (schließt v23/v25 explizit aus), `eslint@10.10.0`
  verlangt `^20.19.0 || ^22.13.0 || >=24`. 22.12.0 liegt knapp unter beiden Anforderungen und ist
  der pragmatische gemeinsame Nenner für die 22.x-Linie.
- Node 22.12.0 brachte die stabile Unterstützung von `require()` synchroner ESM-Module im
  CommonJS-Kontext sowie weitere Reifungen des ESM-Loaders, die für ein reines ESM-Paket mit
  gemischtem Ökosystem (viele Abhängigkeiten sind noch CJS) relevant sind.

**Entscheidungsbedarf für die Planungsphase:** Die Vorgabe nennt ausdrücklich, dass Nutzer den
Server per `npx` starten und dabei ältere Node-Versionen besitzen könnten. `>=22.12.0`
schließt jeden Nutzer mit Node 20 oder älter aus – das betrifft potenziell noch eine relevante
Anzahl an Installationen, obwohl v20 offiziell EOL ist. Alternative wäre `>=20.19.0` (letzte
Iron-Patchlinie) als bewusst breiterer, aber sicherheitstechnisch schwächer begründeter
Kompromiss. Ich empfehle `>=22.12.0`, die endgültige Entscheidung sollte aber bewusst und nicht
stillschweigend getroffen werden.

**Abgrenzung gegenüber der SDK-Untergrenze:** `mcp-sdk-typescript.md` 10.2 führt neben dem
Projektwert `>=22.12.0` zusätzlich den Wert `>=20` auf. Das ist die Untergrenze der
MCP-SDK-Pakete selbst, nicht der Projektwert; jede Node-Version, die `>=22.12.0` erfüllt, erfüllt sie ebenfalls. Verbindlich für
die `package.json` dieses Projekts ist `>=22.12.0`. Die vollständige Auflösung dieses und dreier
weiterer Widersprüche zwischen den beiden Dossiers steht in Abschnitt 3.3.

Unabhängig von der gewählten Untergrenze: `npx` respektiert das `engines`-Feld nicht
automatisch als harte Sperre (nur `npm install` mit `engine-strict=true` tut das). Läuft der
Server auf zu alter Node-Version, sollte er beim Start explizit `process.version` prüfen und
eine klare Fehlermeldung ausgeben statt mit einer kryptischen Syntax- oder API-Fehlermeldung
abzubrechen (**Annahme/Empfehlung**, keine Vorgabe aus einer Quelle).

---

## 2. TypeScript

Quelle: `npm view typescript`, abgerufen 2026-09-12. Ergänzend: `npm view typescript-eslint
peerDependencies`, `npm view tsup dependencies peerDependencies`, `npm view tsdown
dependencies peerDependencies`, `npm view rolldown-plugin-dts peerDependencies` sowie
WebSearch-Ergebnisse zu TypeScript 7 (InfoQ, Microsoft DevBlogs, GitHub-Issue
`typescript-eslint/typescript-eslint#12518`, abgerufen 2026-09-12).

### 2.1 Der zentrale Befund: `latest` ist nicht automatisch die richtige Wahl

Der npm-Dist-Tag `latest` von `typescript` zeigt auf **7.0.2** (veröffentlicht 2026-07-08).
TypeScript 7 ist die von Microsoft angekündigte, in Go geschriebene native Portierung des
Compilers ("früher Codename tsgo"), die laut InfoQ und den offiziellen Ankündigungen 8- bis
12-fach schnellere Builds liefert.

Das ist jedoch für diese Werkzeugkette **nicht direkt nutzbar**, und das ist kein
Bauchgefühl, sondern über die npm-Registry selbst verifizierbar:

```
$ npm view typescript-eslint peerDependencies --json
{
  "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
  "typescript": ">=4.8.4 <6.1.0"
}
```

`typescript-eslint@8.70.0` (aktuelle Version, siehe Abschnitt 6) lässt in seinem
Peer-Dependency-Bereich **TypeScript 7 explizit nicht zu** (`<6.1.0`). Ein
`npm install`/`pnpm install` mit `typescript@7.0.2` und `typescript-eslint` gleichzeitig
scheitert an einer ERESOLVE-Kollision. Hintergrund, den mehrere unabhängige Quellen
(InfoQ, ein GitHub-Issue direkt im typescript-eslint-Repository, mehrere Blogbeiträge vom
Juli/August 2026) übereinstimmend nennen: Das `typescript@7.0.x`-Paket liefert nur noch die
native `tsc`-Binärdatei, aber **keine programmatische JavaScript/TypeScript-Compiler-API**
mehr (kein `ts.createProgram`, kein `ts.transpileModule` etc.). Genau diese API braucht
typescript-eslint für typgestütztes Linting. Eine stabile programmatische API ist laut den
Ankündigungen für TypeScript 7.1 vorgesehen; diese Version war zum Zeitpunkt der Recherche
noch nicht stabil veröffentlicht (der npm-Dist-Tag `next` von `typescript` zeigte am
2026-09-12 auf eine Vorabversion `7.1.0-dev.20260912.1`, nicht auf einen stabilen Release).

Die letzte TypeScript-6-Version ist **6.0.3**, veröffentlicht 2026-04-16 (per `npm view
typescript time --json` verifiziert). Sie behält die klassische, JS-basierte Compiler-API.

**Empfehlung: `typescript@6.0.3` als Entwicklungsabhängigkeit einsetzen, nicht 7.0.2.**

Begründung: Die Vorgabe "ausschließlich aktuelle Bibliotheken" bedeutet in der Praxis die
aktuellste *funktionierende* Kombination, nicht blind den höchsten Dist-Tag. TypeScript 6.0.3
ist die aktuelle stabile Version der letzten kompatiblen Major-Linie und wird von jedem
anderen hier gewählten Werkzeug unterstützt:

- `typescript-eslint@8.70.0`: Peer-Range `>=4.8.4 <6.1.0` — 6.0.3 passt.
- `tsdown@0.23.0` (siehe Abschnitt 4) / `rolldown-plugin-dts@0.28.5`: Peer-Range
  `^5.0.0 || ^6.0.0 || ~7.0.0` — 6.0.3 passt, und das Werkzeug ist zusätzlich bereits auf
  TypeScript 7 vorbereitet, sobald dessen API verfügbar ist.
- `tsup@8.5.1`: Peer-Range `>=4.5.0` — 6.0.3 passt (siehe Abschnitt 4 zur separaten
  Einschränkung bei der `.d.ts`-Generierung).

**Entscheidungsbedarf / zu beobachten:** Sobald TypeScript 7.1 stabil erscheint und
typescript-eslint seine Peer-Range öffnet, sollte der Wechsel auf TypeScript 7 erneut geprüft
werden (Performancegewinn beim Type-Checking ist erheblich). Bis dahin ist 6.0.3 die einzige
Version, mit der die gesamte Kette widerspruchsfrei funktioniert.

### 2.2 tsconfig.json für ein ESM-Node-Paket

Zielumgebung: reines ESM-Paket (`"type": "module"`), Node `>=22.12.0` als Laufzeit, Build
über `tsdown`/`esbuild` (transpiliert JS), `tsc` nur für Type-Checking und `.d.ts`-Emission
(siehe Abschnitt 4 zur Aufteilung der Aufgaben).

| Option | Wert | Begründung |
|---|---|---|
| `target` | `ES2022` | Node 22/24 unterstützen ES2022 vollständig nativ; kein Downleveling nötig. Bewusst nicht `ESNext`, um nicht versehentlich Syntax zu erlauben, die die Ziel-Node-Version noch nicht kennt. |
| `lib` | `["ES2023"]` | Deckt die zur Verfügung stehenden globalen APIs (z. B. `Array.prototype.toSorted`) ab, ohne DOM-Typen einzuschließen, die in einem Node-Server nicht existieren. |
| `module` | `NodeNext` | Einzige Option, die Node-ESM-Semantik korrekt abbildet: erzwingt explizite Dateiendungen (`.js`) bei relativen Importen in Quelldateien, versteht `package.json#exports`/`#imports`-Bedingungen. |
| `moduleResolution` | `NodeNext` | Muss mit `module: NodeNext` gepaart sein (TypeScript koppelt beide Werte). |
| `moduleDetection` | `force` | Verhindert, dass eine Datei ohne Import/Export versehentlich als Script statt als Modul behandelt wird. |
| `verbatimModuleSyntax` | `true` | Erzwingt explizite `import type`/`export type` für reine Typ-Importe. Wichtig, weil `tsdown`/`esbuild` jede Datei isoliert transpilieren (kein Cross-File-Type-Wissen) und sonst ein Typ-Import fälschlich als Laufzeit-Import emittiert werden könnte. |
| `isolatedModules` | `true` | Absicherung für dieselbe Anforderung: jede Datei muss unabhängig transpilierbar sein. Pflicht bei Single-File-Transpilern wie esbuild/Rolldown. |
| `strict` | `true` | Basis-Strenge, keine Diskussion für ein neues Projekt 2026. |
| `noUncheckedIndexedAccess` | `true` | Für einen API-Client mit vielen dynamischen Objektzugriffen (Antwortfelder der BuchhaltungsButler-API) reduziert das die Klasse "vermeintlich sicherer" `undefined`-Zugriffe. |
| `noImplicitOverride` | `true` | Sinnvoll bei Klassenbildung (z. B. Fehlerklassen-Hierarchie für API-Fehler). |
| `noFallthroughCasesInSwitch` | `true` | Standard-Absicherung. |
| `exactOptionalPropertyTypes` | `true` | Sinnvoll für die Modellierung optionaler API-Felder, aber mit realem Mehraufwand verbunden (jede optionale Eigenschaft muss `T \| undefined` statt implizit tolerant behandelt werden). **Empfehlung mit Vorbehalt:** aktivieren, aber bei erster spürbarer Reibung mit Zod-Schema-Inferenz erneut bewerten. |
| `skipLibCheck` | `true` | Übliche Praxis, um Kompilierzeit zu sparen und Fehler in fremden `.d.ts`-Dateien nicht zum Show-Stopper zu machen. |
| `forceConsistentCasingInFileNames` | `true` | Absicherung gegen Groß-/Kleinschreibungsfehler auf case-insensitiven Dateisystemen (macOS-Entwicklungsumgebung des Teams). |
| `esModuleInterop` | `true` | Erleichtert den Umgang mit den noch zahlreichen CJS-Abhängigkeiten im Ökosystem. |
| `resolveJsonModule` | `true` | Falls Konfigurationsdaten oder das OpenAPI-JSON aus `docs/openapi/` zur Build-Zeit importiert werden sollen. |
| `declaration` / `declarationMap` | `true` / `true` | Notwendig, falls das Paket auch programmatisch (nicht nur per CLI) importierbar sein soll; erzeugt `.d.ts` plus Sourcemaps dafür. |
| `sourceMap` | `true` | Erleichtert Debugging von Stacktraces aus dem veröffentlichten Paket. |
| `outDir` / `rootDir` | `"dist"` / `"src"` | Klare Trennung Quelle/Build-Ausgabe. |
| `types` | `["node"]` | Verhindert versehentliches Einbinden von DOM- oder Test-Runner-Ambient-Types in den Produktionscode; Test-Typen (`vitest/globals`) werden über eine separate `tsconfig.test.json` oder Datei-Overrides eingebunden, falls globale Test-APIs genutzt werden. |
| `incremental` | `true` | Beschleunigt wiederholte `tsc --noEmit`-Läufe in CI/lokal. |

`isolatedDeclarations` (seit TypeScript 5.5 verfügbar, auch unter 6.0.3 nutzbar) wurde bewusst
**nicht** in die Pflichtliste aufgenommen: Es erzwingt explizite Rückgabe- und Parametertypen an
praktisch jeder exportierten Deklaration, was für ein kleines Server-Paket mehr Mehraufwand als
Nutzen bringen kann. Es lohnt sich, wenn die `.d.ts`-Generierung über `tsdown`s
Rust/JS-basierten Parser (nicht die klassische TS-API) beschleunigt werden soll – als spätere
Optimierung, nicht als Startbedingung, dokumentiert.

---

## 3. MCP-SDK (`@modelcontextprotocol/*`) und `zod`

Quelle: `npm view @modelcontextprotocol/sdk@1.30.0 dependencies peerDependencies engines --json`
sowie dieselbe Abfrage für `@modelcontextprotocol/server@2.0.0`, `@modelcontextprotocol/client@2.0.0`
und `@modelcontextprotocol/core@2.0.0`, abgerufen 2026-09-12. Ergänzend das Schwesterdossier
`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/mcp-sdk-typescript.md`
(Stand 2026-09-12), das beide Linien in einer eigenen Testumgebung installiert und ausgeführt hat;
dessen Belegkennungen (Q1, Q2, Q10, Q11, Q14, Q16) sind hier übernommen.

### 3.1 Es gibt zwei gepflegte SDK-Linien, nicht eine

Frühere Fassungen dieses Abschnitts kannten ausschließlich `@modelcontextprotocol/sdk`. Das ist
seit Ende Juli 2026 unvollständig: Am 2026-07-27 sind zwei parallel gepflegte Linien
nebeneinander erschienen.

| Merkmal | v1 | v2 |
|---|---|---|
| Paket(e) | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, gemeinsam `@modelcontextprotocol/core` |
| Aktuelle Version | 1.30.0 | 2.0.0 |
| Veröffentlicht | 2026-07-27T17:56:01Z (Q1) | 2026-07-27T23:55:22Z (Q14) |
| `engines.node` des Pakets | `>=18` | `>=20` |
| Schemabibliothek | Zod 3.25+ oder Zod 4, als nicht optionale `peerDependency` **und** zusätzlich als `dependency` (`^3.25 \|\| ^4.0`) | Standard Schema; `zod` als reguläre `dependency` (`^4.2.0`), **keine** Peer-Dependency |
| Branch | `v1.x` | `main` |
| Status laut README | Wartung: Bugfixes und Security-Updates für mindestens sechs Monate nach dem v2-Release (Q11) | "v2 is the stable release line" (Q11) |

Der offizielle TypeScript-Quickstart installiert bereits v2 und verlangt Node 20 oder höher (Q16).

Die `engines.node`-Angaben `>=18` beziehungsweise `>=20` sind die Untergrenzen der SDK-Pakete
selbst, nicht der Wert, den dieses Projekt in seiner eigenen `package.json` führt. Die
Projektuntergrenze aus Abschnitt 1.2 (`>=22.12.0`) ist strenger und erfüllt beide; die Auflösung
dieses scheinbaren Widerspruchs steht in 3.3.

Für die in Abschnitt 4.1 begründete Zielgröße "kurze `npx`-Startzeit und kleine Installation"
ist die Abhängigkeitsfläche beider Linien relevant. Beide Angaben stammen aus derselben
`npm view`-Abfrage vom 2026-09-12:

- `@modelcontextprotocol/sdk@1.30.0` zieht 17 direkte Laufzeitabhängigkeiten nach sich, darunter
  `express@^5.2.1`, `hono@^4.11.4`, `@hono/node-server`, `express-rate-limit@^8.2.1`, `cors`,
  `eventsource`, `eventsource-parser`, `jose@^6.1.3`, `pkce-challenge`, `cross-spawn`, `raw-body`,
  `content-type`, `ajv@^8.17.1`, `ajv-formats`, `json-schema-typed`, `zod-to-json-schema` und `zod`.
- `@modelcontextprotocol/server@2.0.0` zieht genau zwei direkte Laufzeitabhängigkeiten nach sich:
  `zod@^4.2.0` und `@modelcontextprotocol/core@2.0.0`; `core@2.0.0` seinerseits nur `zod@^4.2.0`.
  Die HTTP- und OAuth-lastigen Pakete (`jose`, `eventsource`, `pkce-challenge`, `cross-spawn`)
  liegen in v2 im **Client**-Paket, das ein reiner stdio-Server nicht produktiv benötigt.

Für einen klassischen, per `npx` gestarteten stdio-MCP-Server werden die HTTP-lastigen Teile von
v1 zur Laufzeit üblicherweise nicht aktiv genutzt, erhöhen aber die installierte Paketgröße und
die Angriffsfläche. Das ist eine Eigenschaft des jeweiligen SDK, keine hier frei gewählte
Abhängigkeit, fließt aber als sachliches Argument in 3.2 ein.

Widerspruch zwischen den Quellen, der hier benannt und nicht geglättet wird:
`mcp-sdk-typescript.md` Abschnitt 3.1 zitiert den `dependencies`-Block von
`@modelcontextprotocol/sdk@1.30.0` als wörtlich (Q2) und führt darin nur `zod`,
`zod-to-json-schema`, `ajv` und `ajv-formats` auf. Die Registry-Abfrage vom 2026-09-12 liefert
für dieselbe Version die oben genannten 17 Einträge. Das dortige Zitat ist demnach gekürzt,
nicht wörtlich vollständig; die inhaltlichen Schlussfolgerungen jenes Abschnitts zur Zod-Peer-
Dependency sind davon nicht betroffen.

### 3.2 Offene Entscheidung SDK-Linie

> **Geltung und tatsächlicher Abgleichstand, geprüft 2026-09-12:** Dieser Block ist die
> maßgebliche Festlegung zur SDK-Linie. Er ist in `docs/entwicklung/mcp-sdk-typescript.md`
> **nicht gespiegelt.** Tragender Beleg dafür ist die inhaltliche Durchsicht des Abschnitts 10
> jener Datei: dessen Vorspann nennt den Vorrang von `toolchain.md` 3.3 für vier Einzelwerte,
> 10.1 enthält ausschließlich die Empfehlung zu v2 samt Gegenargumenten, 10.2/10.3 die Versions-
> und Konfigurationstabellen; weder die beiden Variantentabellen noch das Mischverbot kommen
> dort in irgendeiner Form vor. Ergänzend, für sich allein aber nicht tragend, ein `grep` über
> jene Datei am 2026-09-12: die Zeichenketten "Abgleichpflicht", "Variante A", "Variante B",
> "Mischen", "Standardweg" und "Rückfallweg" liefern jeweils 0 Treffer. Die Zeichenkette
> "gleichlautend" liefert dagegen genau einen Treffer, und zwar in `mcp-sdk-typescript.md`
> Abschnitt 10.3 (in der am 2026-09-12 gemessenen Fassung Zeile 1313; jene Datei wurde am selben
> Tag mehrfach überarbeitet, die Zeilennummer ist deshalb nicht stabil, maßgeblich ist der
> Abschnitt). Der Treffer stammt nicht aus einer Spiegelung dieses Blocks, sondern aus dem
> dortigen Satz über den Zusammenfall der beiden Einstiegspunkte bei Verzicht auf den
> programmatischen Export. Eine Abgleichpflicht besteht daher derzeit
> **nicht**, und diese Feststellung hängt nicht an einem einzelnen Suchbefehl, sondern am
> Inhalt des Abschnitts 10; eine frühere Fassung dieses Hinweises behauptete eine
> Abgleichpflicht und war damit falsch.
>
> **Folge für Implementierungs-Agenten:** Wer nur `mcp-sdk-typescript.md` Abschnitt 10 liest,
> bekommt das Mischverbot nicht zu Gesicht. Dieser Abschnitt 3.2 ist deshalb zusammen mit jenem
> Abschnitt 10 verbindlich zu lesen und hat bei Abweichungen Vorrang.
>
> **Offene Punkte, die außerhalb dieser Datei zu erledigen sind:** (a) Das Spiegeln des
> Entscheidungstextes, der beiden Variantentabellen und des Mischverbots nach
> `mcp-sdk-typescript.md` Abschnitt 10 steht aus. Erst wenn das geschehen ist, entsteht eine
> echte Abgleichpflicht: dann sind diese drei Bestandteile deckungsgleich zu halten, und
> ausschließlich die Verweise auf Abschnitte des jeweils eigenen Dokuments dürfen abweichen.
> (b) `docs/README.md`, Teil 4.2 Punkt 1, gibt die widerlegte Abgleichpflicht noch als Tatsache
> weiter ("Der Block ist laut eigener Abgleichpflicht wortgleich mit `mcp-sdk-typescript.md` zu
> halten") und ist auf den hier beschriebenen tatsächlichen Zustand zu bringen.

`mcp-sdk-typescript.md` Abschnitt 10.1 empfiehlt v2 (`@modelcontextprotocol/server@2.0.0`),
verweist die endgültige Freigabe aber ausdrücklich in die Planungsphase und nennt dafür offene
Gegenargumente (2.0.0 war am Stichtag rund sechs Wochen alt und ohne Patch-Release; die
Kompatibilität real eingesetzter Hosts mit v2-Servern wurde **nicht geprüft**; der Widerspruch
zwischen der Spezifikationszusage 2026-07-28 und `LATEST_PROTOCOL_VERSION = 2025-11-25` in der
ausgelieferten 2.0.0 ist ungeklärt). Solange diese Freigabe nicht erteilt ist, gilt:

- **v2 ist der dokumentierte Standardweg.** Alle Beispiele und Paketlisten beider Dossiers
  rendern diese Variante; in diesem Dokument sind das die Abhängigkeitstabelle in Abschnitt 12
  und der `package.json`-Vorschlag in Abschnitt 13.
- **v1 ist der vollständig ausformulierte Rückfallweg.** Er wird ausschließlich gewählt, wenn die
  Planungsphase v2 aus einem der oben genannten Gründe verwirft.

**Variante A, v2 (Standardweg)**

| Festlegung | Wert |
|---|---|
| MCP-Paket (`dependencies`) | `@modelcontextprotocol/server` `2.0.0`, exakt, kein Caret |
| MCP-Paket (`devDependencies`) | `@modelcontextprotocol/client` `2.0.0`, exakt, ausschließlich für den Integrationstest aus `mcp-sdk-typescript.md` 10.4 Punkt 12 |
| Importpfade | `@modelcontextprotocol/server`, `@modelcontextprotocol/server/stdio`, **ohne** `.js`-Endung |
| `zod` | `^4.6.2` als direkte `dependency` (siehe 3.4) |
| `engines.node` der Projekt-`package.json` | `>=22.12.0` |
| `typescript` (devDependency) | `6.0.3`, exakt, kein Caret |
| Build | `tsdown`, Skript `"build": "tsdown"`, dazu `tsc --noEmit` als getrennter Typecheck |
| `bin` | `{ "buchhaltungsbutler-mcp": "./dist/cli.js" }`, erste Zeile `#!/usr/bin/env node`, Dateimodus 755 |

**Variante B, v1 (Rückfallweg)**

| Festlegung | Wert |
|---|---|
| MCP-Paket (`dependencies`) | `@modelcontextprotocol/sdk` `1.30.0`, exakt, kein Caret |
| MCP-Paket (`devDependencies`) | keines; die Client-Klasse für den Integrationstest liegt im selben Paket |
| Importpfade | ausschließlich Subpfade **mit** `.js`-Endung, z. B. `@modelcontextprotocol/sdk/server/mcp.js`. Der Wurzelimport `@modelcontextprotocol/sdk` ist verboten, weil die Datei `dist/esm/index.js` im veröffentlichten Tarball fehlt und der Import mit `ERR_MODULE_NOT_FOUND` scheitert (Q10). |
| `zod` | `^4.6.2` als direkte `dependency` (siehe 3.4) |
| `engines.node` der Projekt-`package.json` | `>=22.12.0` |
| `typescript` (devDependency) | `6.0.3`, exakt, kein Caret |
| Build | `tsdown`, Skript `"build": "tsdown"`, dazu `tsc --noEmit` als getrennter Typecheck |
| `bin` | `{ "buchhaltungsbutler-mcp": "./dist/cli.js" }`, erste Zeile `#!/usr/bin/env node`, Dateimodus 755 |

**Mischen ist ausdrücklich verboten.** Ein Implementierungs-Agent wählt genau eine der beiden
Spalten vollständig. Insbesondere unzulässig sind: `@modelcontextprotocol/server` mit
v1-Importpfaden (`.js`-Endungen oder `server/mcp.js`-Subpfade), `@modelcontextprotocol/sdk` mit
v2-Importpfaden ohne Endung, das Nebeneinander beider MCP-Pakete in derselben `package.json`,
sowie die v1-API-Formen (`extra.signal`, `extra.requestId`) unter v2 oder umgekehrt die
v2-Formen (`ctx.mcpReq.*`, `serveStdio`) unter v1. Die Zuordnung der API-Formen zur jeweiligen
Linie steht in `mcp-sdk-typescript.md` Abschnitt 9.2.

Die Zeilen `engines.node`, `typescript`, `Build` und `bin` sind in beiden Varianten bewusst
identisch. Ein Wechsel der SDK-Linie berührt damit nur die MCP-Pakete und die Importpfade, nicht
das übrige Projektgerüst.

### 3.3 Abgleich der vier weiteren Kollisionen mit `mcp-sdk-typescript.md` 10.2/10.3

Neben der SDK-Linie widersprachen sich die beiden Dossiers in vier weiteren Punkten. Die Spalte
"verbindlich" gilt für beide Dateien. Alle vier Punkte sind in `mcp-sdk-typescript.md` am
2026-09-12 bereits im Sinne dieser Spalte nachgezogen; der Vorspann zu Abschnitt 10 jener Datei
verweist dafür ausdrücklich auf diesen Abschnitt 3.3. Die dritte Spalte hält den früheren Stand
jener Datei fest, damit die Auflösung nachvollziehbar bleibt.

| Punkt | Angabe in diesem Dossier | Frühere Angabe in `mcp-sdk-typescript.md` 10.2/10.3 (am 2026-09-12 dort bereits korrigiert) | Verbindlich |
|---|---|---|---|
| `engines.node` | `>=22.12.0` | `>=20` | **`>=22.19.0`**, siehe Kasten |

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 13.1.** **`engines.node` lautet `>=22.19.0`, nicht `>=22.12.0`.** Grund
> ist keine Vorliebe, sondern eine Laufzeitabhängigkeit: `undici@8.10.2` deklariert selbst
> `engines.node: ">=22.19.0"` und wird produktiv für Proxy-Unterstützung und Keep-Alive
> gebraucht. Ein Paket, das `>=22.12.0` verspricht und eine Abhängigkeit mit `>=22.19.0` zieht,
> gibt ein Versprechen, das es nicht halten kann. Die Untergrenze ist praktisch folgenlos:
> 22.19.0 ist eine Patch-Version innerhalb der 22er-LTS-Linie.
>
> **Für Bau und Entwicklung ist die Spanne enger als `engines.node`**, weil `tsdown@0.23.0` die
> Range `^22.18.0 || ^24.11.0 || >=26.0.0` deklariert: zulässig sind `>=22.19.0 <23.0.0`,
> `>=24.11.0 <25.0.0` oder `>=26.0.0`. Node 23.x, 24.0 bis 24.10 und 25.x erfüllen `>=22.19.0`,
> **nicht aber** die Range von `tsdown`. `engines.node` wird darauf trotzdem **nicht** verengt:
> `tsdown` ist eine Entwicklungsabhängigkeit, die kein Nutzer installiert. Die Baugrenzen stehen
> in `CONTRIBUTING.md` und in der CI-Matrix, die deshalb genau `22.19.0` und `24.11.0` nennt.
| `typescript` | `6.0.3` exakt | `^5.9` oder neuer | `6.0.3` exakt |
| Build | `tsdown` | `tsc && chmod 755 dist/index.js` | `tsdown`, plus Sicherstellung von Shebang und Modus 755 |
| `bin`-Ziel | `./dist/cli.js` | `dist/index.js` | `./dist/cli.js` |

Begründungen im Einzelnen:

1. **`engines.node`.** Die beiden Zahlen beschreiben nicht dasselbe. `>=20` ist die Untergrenze
   der SDK-Pakete und des offiziellen Quickstarts (Q14, Q16), also eine Eigenschaft der
   Abhängigkeit. Jede Node-Version, die `>=22.12.0` erfüllt, erfüllt auch `>=20`; ein Konflikt
   besteht sachlich nicht. Als Projektwert ist `>=20` dagegen nicht tragfähig: Node 20 ist seit
   2026-04-30 End of Life (Abschnitt 1.1), und `vitest@5.0.0` verlangt laut eigenem
   `engines`-Feld `^22.12.0 || ^24.0.0 || >=26.0.0` – die Testsuite ließe sich auf Node 20 nicht
   ausführen. `mcp-sdk-typescript.md` 10.2 nennt in derselben Zeile selbst "Entwicklung und CI
   auf Node 22". In der anderen Datei ist der Projektwert inzwischen auf `>=22.12.0` umgestellt
   und `>=20` dort ausdrücklich als SDK-Untergrenze gekennzeichnet (nachgeprüft am 2026-09-12).
2. **`typescript`.** `^5.9` bedeutete in Caret-Notation `>=5.9.0 <6.0.0` und schloss 6.0.3
   formal aus; der Zusatz "oder neuer" im selben Satz widersprach dieser Lesart. Die frühere
   Angabe in 10.2 war also in sich mehrdeutig. Verbindlich ist `6.0.3` exakt, weil Abschnitt 2.1
   dafür einen an der Registry belegten Grund hat: `typescript-eslint@8.70.0` deklariert die
   Peer-Range `>=4.8.4 <6.1.0` und schließt TypeScript 7 aus, und `typescript@7.0.x` liefert
   keine programmatische Compiler-API mehr. Die Caret-Schreibweise war als Untergrenze gemeint;
   sie ist in 10.2 inzwischen auf `6.0.3` exakt umgestellt (nachgeprüft am 2026-09-12).
3. **Build.** Die beiden Angaben betrafen unterschiedliche Gegenstände. Die frühere Angabe in
   10.3 schrieb kein Bündelungswerkzeug vor, sondern eine Eigenschaft des Ergebnisses: Die
   `bin`-Datei muss einen Shebang tragen und ausführbar sein. Abschnitt 4.2 wählt `tsdown` mit
   eigener Begründung (gebündelte Ausgabe zugunsten der `npx`-Kaltstartzeit, integrierte
   `.d.ts`-Erzeugung, Shebang-Handhabung). Verbindlich ist deshalb: Build über `tsdown`; sollte
   `tsdown` den Dateimodus der `bin`-Datei nicht selbst auf 755 setzen (Abschnitt 4.2 führt das
   als noch zu verifizierenden Punkt), folgt im `build`-Skript ein expliziter Schritt
   `chmod 755 dist/cli.js`. Reines `tsc` als Auslieferungs-Build ist damit ausgeschlossen;
   `tsc --noEmit` bleibt für die Typprüfung. 10.3 ist inzwischen auf genau diese Auflösung
   umgestellt und nennt `tsdown` als Build, den Ausschluss von reinem `tsc` als
   Auslieferungs-Build sowie den bedingten Schritt `chmod 755 dist/cli.js` (nachgeprüft am
   2026-09-12).
4. **`bin`-Ziel.** Dieses Projekt hat zwei Einstiegspunkte: die CLI über `bin` und den
   programmatischen Export über `exports` (Abschnitt 9.2). Getrennte Dateien halten sie
   auseinander, `dist/cli.js` startet den Server, `dist/index.js` exportiert die Bibliothek.
   Die frühere Angabe in 10.3 ging von einem einzigen Einstiegspunkt aus und nannte deshalb
   `dist/index.js`. Verbindlich ist die Zwei-Dateien-Aufteilung. Wird `exports` gestrichen
   (Abschnitt 9.2 lässt das ausdrücklich zu), fallen beide Einstiege in `dist/index.js` zusammen
   und `bin` sowie ein etwaiger `chmod`-Schritt ziehen gleichlautend mit. Unzulässig ist der
   Mischzustand, in dem `bin` auf `dist/cli.js` zeigt, ein `chmod`-Schritt aber `dist/index.js`
   ausführbar macht. 10.3 führt inzwischen selbst
   `"bin": { "buchhaltungsbutler-mcp": "./dist/cli.js" }` und denselben Vorbehalt gegen den
   Mischzustand (nachgeprüft am 2026-09-12).

### 3.4 `zod`

Aktuelle `zod`-Version: **4.6.2**, veröffentlicht 2026-09-10 (npm-Registry-Timestamp). Sie liegt
im Bereich beider SDK-Linien: v1 verlangt `^3.25 || ^4.0` als nicht optionale Peer-Dependency,
v2 führt `^4.2.0` als reguläre Abhängigkeit ohne Peer-Deklaration. Es besteht in keiner der
beiden Varianten ein Versionskonflikt.

Empfehlung: `zod@^4.6.2` direkt als eigene `dependency` führen (nicht nur transitiv über das
SDK beziehen), weil Zod im eigenen Code zusätzlich für die Konfigurations-/Umgebungsvariablen-
Validierung genutzt werden soll (siehe Abschnitt 8) und Tool-Input-Schemas typischerweise
ebenfalls mit Zod definiert werden. Eine explizite direkte Abhängigkeit macht die tatsächlich
genutzte Version sichtbar, schreibt sie im eigenen Lockfile fest und ist unabhängig von künftigen
SDK-internen Anpassungen des Peer- beziehungsweise Abhängigkeitsbereichs. Dieselbe Vorgabe steht
in `mcp-sdk-typescript.md` 10.2 ("explizit in `dependencies`, nicht auf die transitive Auflösung
verlassen"); hier besteht kein Widerspruch.

Unter v2 ist zusätzlich zu beachten, dass Zod dort nur eine von mehreren zulässigen
Schemabibliotheken ist (die Schnittstelle ist Standard Schema). Zod bleibt trotzdem die Wahl
dieses Projekts, weil Abschnitt 8 es ohnehin für die Konfigurationsvalidierung einsetzt und ein
zweites Schemasystem keinen Nutzen brächte.

---

## 4. Build: `tsc` vs. `tsup` vs. `tsdown` vs. `esbuild`

Quelle: `npm view tsup|tsdown|esbuild version time.modified dependencies peerDependencies
--json`, abgerufen 2026-09-12.

| Werkzeug | Version | Veröffentlicht | Kern |
|---|---|---|---|
| `tsc` (in `typescript`) | 6.0.3 | 2026-04-16 | Referenz-Compiler, kein Bundler |
| `tsup` | 8.5.1 | 2025-11-12 | esbuild-basiert, plus Rollup für `.d.ts`-Bundling |
| `tsdown` | 0.23.0 | 2026-09-03 | Rolldown/Oxc-basiert (Rust), Nachfolgeprojekt zu tsup vom selben Autorenkreis (antfu) |
| `esbuild` | 0.28.2 | 2026-08-08 | Low-Level-Bundler/Transpiler, keine `.d.ts`-Erzeugung |

### 4.1 Warum überhaupt bündeln, wenn `npx`-Startzeit zählt?

Wichtige Klarstellung vorab: Die Wahl des *Build*-Werkzeugs beeinflusst nicht direkt, wie
schnell `node` beim `npx`-Aufruf hochfährt – das hängt am Ende nur davon ab, was in `dist/`
liegt, nicht wie es erzeugt wurde. Relevant für die Startverzögerung ist:

1. Zur Laufzeit darf **kein** On-the-fly-Transpiler (`tsx`, `ts-node`) im veröffentlichten Paket
   aktiv sein – das würde bei jedem `npx`-Aufruf erneut TypeScript kompilieren. Es wird
   ausschließlich fertiges JavaScript ausgeliefert.
2. Eine **gebündelte** Ausgabe (wenige, idealerweise eine CLI-Datei) reduziert die Anzahl der
   Node-internen `require`/`import`-Auflösungen beim Kaltstart gegenüber unverändert
   transpilierten, aber unverbundenen Dateien (das Verhalten von reinem `tsc`, das pro
   Quelldatei eine Ausgabedatei erzeugt und Node zur Laufzeit durch `node_modules` navigieren
   lässt). Das spricht gegen reines `tsc` als alleiniges Build-Werkzeug für die Auslieferung.

Reines `tsc` bleibt trotzdem im Werkzeugkasten – aber nur für Type-Checking
(`tsc --noEmit`) und optional für `.d.ts`-Emission, nicht für die JS-Ausgabe, die tatsächlich
per `npx` ausgeführt wird.

### 4.2 Vergleich und Empfehlung

**Empfehlung: `tsdown@0.23.0`** als primäres Build-Werkzeug für die CLI-Ausgabe, mit `tsc
--noEmit` parallel für die Typprüfung.

Begründung:

- Aktualität und Pflegeintensität: `tsdown` wurde zuletzt am 2026-09-03 veröffentlicht (wenige
  Tage vor diesem Dossier), `tsup` zuletzt am 2025-11-12 – ein Abstand von rund zehn Monaten,
  der auf ein deutlich niedrigeres Entwicklungstempo bei `tsup` hindeutet (**Beobachtung
  anhand der Registry-Zeitstempel, keine offizielle Aussage zum Projektstatus von tsup**).
- `tsdown` baut auf Rolldown (Rust) statt auf Rollup+esbuild (`tsup`s Kombination) – ein
  einheitlicherer, tendenziell schnellerer Unterbau, insbesondere für die `.d.ts`-Bündelung.
- Zukunftssicherheit gegenüber TypeScript 7: Das von `tsdown` genutzte Plugin
  `rolldown-plugin-dts@0.28.5` deklariert `typescript` als optionalen Peer mit Bereich
  `^5.0.0 || ^6.0.0 || ~7.0.0` **und zusätzlich** `@typescript/native-preview` als Peer – es
  verwendet für die `.d.ts`-Erzeugung einen eigenen, TypeScript-Versions-unabhängigen
  AST-Parser (`yuku-parser`/`yuku-ast`/`yuku-codegen`) statt zwingend die klassische
  TS-Compiler-API. Das bedeutet: Der Umstieg auf TypeScript 7 wird für die Build-Seite
  voraussichtlich unkritischer sein als für typescript-eslint (siehe Abschnitt 2.1).
- `tsup` bleibt eine solide, sehr verbreitete Alternative, falls `tsdown` in der Praxis
  Kompatibilitätsprobleme mit einer der übrigen Abhängigkeiten zeigt. Zu beachten:
  `tsup`s eigene `.d.ts`-Generierung dürfte weiterhin die klassische TypeScript-API
  voraussetzen (nicht direkt aus dem Quellcode von `tsup` verifiziert, sondern aus dem
  Peer-Dependency-Muster erschlossen – **Annahme**), was ein zusätzliches Argument ist, bei
  `tsup` in jedem Fall bei TypeScript 6.0.3 zu bleiben.
- `esbuild` direkt einzusetzen wäre die minimalste Lösung (kleinste Abhängigkeitsfläche,
  `tsdown` und `tsup` nutzen es teilweise ohnehin intern/vormals), erfordert aber eine separat
  konfigurierte `.d.ts`-Erzeugung über `tsc --emitDeclarationOnly` und eigenes Shebang-/
  Ausführbarkeits-Handling für die `bin`-Datei. Als bewusste Wahl für maximale Kontrolle
  vertretbar, aber ohne klaren Vorteil gegenüber `tsdown`, das genau diese Lücken bereits
  schließt.

Praktischer Hinweis zur `bin`-Datei: Der CLI-Einstiegspunkt braucht die Kopfzeile
`#!/usr/bin/env node` und Ausführungsrechte (`chmod +x`) in der veröffentlichten Datei.
`tsdown` unterstützt (wie zuvor `tsup`) das automatische Erhalten/Setzen eines Shebang bei
CLI-Einstiegsdateien; dies sollte vor der ersten Veröffentlichung an einem echten `npm pack`
+ `npx ./paket.tgz`-Testlauf verifiziert werden (**nicht in dieser Session getestet**). Zeigt
dieser Testlauf, dass der Dateimodus nicht auf 755 steht, wird dem `build`-Skript ein expliziter
`chmod 755`-Schritt auf die in `bin` eingetragene Datei angehängt. `mcp-sdk-typescript.md` 10.3
nannte dafür früher `tsc && chmod 755 dist/index.js` und ist am 2026-09-12 bereits auf `tsdown`
samt bedingtem `chmod 755 dist/cli.js` umgestellt; verbindlich ist die in Abschnitt 3.3, Punkt 3
festgehaltene Auflösung: `tsdown` als Build, die Ausführbarkeitszusage bleibt bestehen.

---

## 5. Tests: `vitest` vs. `node:test`, HTTP-Mocking

Quelle: `npm view vitest|msw|nock|undici version time.modified engines --json`, abgerufen
2026-09-12. Zusätzlich ein eigener Test in dieser Session (Node v22.23.2, 2026-09-12) sowie
`https://nodejs.org/api/globals.html#fetch` (per WebFetch abgerufen, wörtliches Zitat siehe
unten).

### 5.1 Testrunner

Aktuelle Version: **vitest 5.0.0**, veröffentlicht 2026-09-05. Eigenes `engines`-Feld:
`^22.12.0 || ^24.0.0 || >=26.0.0` (schließt v23/v25 explizit aus, passt exakt zur in Abschnitt
1 begründeten Node-Untergrenze). `@vitest/coverage-v8` liegt synchron auf Version **5.0.0**
(2026-09-03).

**Empfehlung: `vitest@^5.0.0`**, nicht `node:test`.

Begründung: `node:test` (Node-eingebaut, kein zusätzliches Paket) ist für sehr kleine Projekte
ausreichend und hat den Vorteil von null zusätzlichen Abhängigkeiten. Für dieses Projekt
überwiegen jedoch die praktischen Vorteile von Vitest:

- Native ESM/TypeScript-Unterstützung ohne eigene Transpilations-Konfiguration (Vitest nutzt
  intern Vite/esbuild und benötigt dafür kein `ts-node` oder Loader-Flag).
- Eingebautes, ausgereiftes Coverage-Tooling (`@vitest/coverage-v8`) mit Schwellenwert-
  Konfiguration, während `node:test`s eingebaute Coverage (`--experimental-test-coverage`)
  laut eigenem Namenszusatz noch experimentell ist (**Stand meines Wissens, in dieser Session
  nicht erneut gegen die aktuelle Node-Dokumentation verifiziert** – zu prüfen vor
  endgültiger Festlegung).
- Bessere Snapshot- und Mocking-Ergonomie (`vi.mock`, `vi.spyOn`) für die in Abschnitt 5.2
  beschriebenen HTTP-Mocks.
- Deckt sich mit dem `engines`-Bereich, den wir ohnehin für die Runtime gewählt haben.

### 5.2 HTTP-Mocking ohne Beschreibung der realen API

Die Aufgabe verlangt ausdrücklich, die reale BuchhaltungsButler-API in diesem Dossier nicht zu
beschreiben. Es geht hier ausschließlich um die *Methode*, mit der Testfälle unabhängig von
einer echten Netzwerkverbindung ausgeführt werden – unabhängig davon, wie die reale API im
Detail antwortet.

Zunächst ein Befund aus einem eigenen Test in dieser Session (Node v22.23.2, 2026-09-12):

```
$ node -e "require('node:undici')"
node:undici NOT available: No such built-in module: node:undici
```

`node:undici` ist in dieser Node-Version **kein** eingebautes Modul – man kann das globale
`fetch` also nicht ohne zusätzliches npm-Paket mocken. Die offizielle Node-Dokumentation
bestätigt den Weg dorthin (wörtliches Zitat, `https://nodejs.org/api/globals.html#fetch`,
abgerufen 2026-09-12):

> "It is possible to change the global dispatcher in Node.js by installing `undici` and using
> the `setGlobalDispatcher()` method. Calling this method will affect both `undici` and
> Node.js."

Das heißt konkret: Um das eingebaute, globale `fetch` in Tests zu mocken, muss das separate
npm-Paket `undici` (aktuelle Version **8.10.2**, veröffentlicht 2026-09-04) als
Entwicklungsabhängigkeit installiert werden; darüber stehen `MockAgent`, `MockPool` und
`setGlobalDispatcher` zur Verfügung. Zusätzliche Randnotiz: Node v22.23.2 bündelt intern eine
ältere `undici`-Version (`process.versions.undici` meldet `6.28.0`, per eigenem Test
verifiziert) – laut obigem Zitat wirkt `setGlobalDispatcher` aus dem separat installierten
Paket dennoch auf das interne `fetch`, weil beide über eine gemeinsame globale Registrierung
laufen. Die genaue Versionskompatibilität zwischen der intern gebündelten und der separat
installierten `undici`-Version wurde in dieser Session **nicht im Detail** (z. B. per echtem
Testlauf mit `MockAgent`) verifiziert und sollte vor Produktivsetzung mit einem echten
Testfall abgesichert werden.

Vergleich der drei genannten Optionen:

| Werkzeug | Version | Ansatz | Eignung hier |
|---|---|---|---|
| `undici` `MockAgent`/`setGlobalDispatcher` | 8.10.2 | Setzt direkt am Dispatcher an, auf dem Node.js' globales `fetch` selbst aufbaut | **Empfohlen**, wenn der HTTP-Client (Abschnitt 7) auf dem eingebauten `fetch` basiert – kein Vermittlungslayer, offizieller Weg laut Node-Doku |
| `msw` | 2.15.0 | Interceptor-basiert, Request-Handler-Syntax, ursprünglich für Browser+Node gedacht | Alternative, wenn Mocks als wiederverwendbare "Handler" über mehrere Testdateien/Szenarien hinweg organisiert werden sollen; komfortablere Syntax, aber zusätzliche Abstraktionsebene |
| `nock` | 14.0.17 | Patcht historisch `node:http`/`node:https` | **Nicht empfohlen**: `nock` hatte über mehrere Node-Major-Versionen hinweg dokumentierte Lücken beim Abfangen von `undici`-basiertem, globalem `fetch` (mehrere unabhängige GitHub-Issues und Blogbeiträge, u. a. `nock/nock#2183`, `nock/nock#2336`). Ob Version 14 dies vollständig behoben hat, konnte ich in dieser Session **nicht abschließend verifizieren** (keine primäre Quelle mit expliziter Versionsangabe gefunden) – da `undici`s eigener `MockAgent` für unseren Anwendungsfall ohnehin die direktere, von Node selbst dokumentierte Lösung ist, entfällt das Risiko, ohne diese Frage klären zu müssen. |

**Empfehlung:** `undici` (nur als Dev-Abhängigkeit für `MockAgent`/`setGlobalDispatcher`)
für Unit-/Integrationstests des HTTP-Clients. `msw` als Zusatz erwägen, falls im Projektverlauf
umfangreiche, über viele Testdateien geteilte Mock-Szenarien entstehen.

---

## 6. Linting und Formatierung

Quelle: `npm view eslint|typescript-eslint|@biomejs/biome|oxlint version time.modified
--json`, abgerufen 2026-09-12. Ergänzend WebSearch zu Biomes Type-Aware-Linting-Stand
(mehrere unabhängige Blogquellen, Stand Anfang 2026, sowie `biomejs/biome#3187`).

| Werkzeug | Version | Veröffentlicht |
|---|---|---|
| `eslint` | 10.10.0 | 2026-09-04 |
| `typescript-eslint` | 8.70.0 | 2026-09-07 |
| `@biomejs/biome` | 2.5.13 | 2026-09-10 |
| `oxlint` | 1.82.0 | 2026-09-07 |

**Empfehlung: kombinierter Einsatz, nicht ein einzelnes Werkzeug für alles:**

- **ESLint 10 (Flat Config) + `typescript-eslint` 8.70** für **typgestütztes Linting**
  (`recommendedTypeChecked`/`strictTypeChecked`), insbesondere Regeln wie
  `no-floating-promises` und `no-misused-promises`. Das ist für einen API-Client mit vielen
  asynchronen HTTP-Aufrufen kein Nice-to-have, sondern deckt eine reale, häufige Fehlerklasse
  ab (vergessenes `await`, das Fehler stillschweigend verschluckt).
- **Biome 2.5.13 ausschließlich als Formatter** (Ersatz für Prettier), nicht als zusätzlicher
  Linter parallel zu ESLint. Begründung: Laut mehreren unabhängigen 2026er-Quellen hat Biome
  seit Version 2.x einen eigenen Typ-Synthesizer für einfache typgestützte Regeln eingeführt,
  der aber ausdrücklich **nicht** dieselbe Abdeckung/Verhaltensgleichheit wie der echte
  TypeScript-Checker garantiert (`biomejs/biome#3187`, mehrere Vergleichsartikel). Zwei
  parallele Linter mit potenziell abweichenden Typ-Interpretationen für dieselbe Regelklasse
  wären eine unnötige Fehlerquelle. Biomes Formatter-Teil ist davon nicht betroffen (reines
  Whitespace-/Stil-Problem, kein Typwissen nötig) und ist deutlich schneller als Prettier bei
  vergleichbarer Ausgabequalität.
- `eslint-config-prettier` wird dadurch **nicht** benötigt (es existiert kein Prettier mehr,
  dessen Stilregeln mit ESLint kollidieren könnten); ebenso sollten die rein stilistischen
  ESLint-Regeln (`@typescript-eslint`'s Formatierungs-Subset, falls über eine veraltete
  Config aktiviert) explizit deaktiviert bleiben, damit Biome und ESLint sich nicht bei
  Formatierungsfragen widersprechen.
- **`oxlint` nicht jetzt einsetzen**, aber als spätere Ergänzung vormerken: Es ist extrem
  schnell (Rust/Oxc-basiert) und eignet sich als sehr schneller Vor-Check (z. B. in einem
  Git-Hook), deckt aber nach aktuellem Kenntnisstand (Stand der Recherche, **nicht
  erschöpfend geprüft**) noch nicht denselben Umfang an typgestützten Korrektheitsregeln ab
  wie `typescript-eslint`. Für ein kleines, überschaubares Projekt ist der Zusatznutzen eines
  dritten Linters gegenüber der zusätzlichen Konfigurationslast gering.

Zu beachten aus Abschnitt 2.1: `typescript-eslint@8.70.0` erzwingt über seine Peer-Range
`typescript` **strikt unter 6.1.0** – das ist ein weiterer, unabhängiger Beleg dafür, dass
`typescript@6.0.3` (nicht 7.0.2) die einzige aktuell konsistente Wahl für die gesamte Kette
ist.

---

## 7. HTTP-Client: eingebautes `fetch` vs. `undici` vs. `got`

Quelle: `npm view undici|got engines dependencies --json`, abgerufen 2026-09-12. Ergänzend
WebSearch zu Node-Proxy-Unterstützung für `fetch` (u. a. `nodejs/node#57165`,
`nodejs/undici#1650`, `undici.nodejs.org/best-practices/undici-vs-builtin-fetch`), abgerufen
2026-09-12, sowie der eigene Test aus Abschnitt 5.2 zu `node:undici`.

| Option | Aktuelle Version | Timeouts | Retries | Keep-Alive | Proxy |
|---|---|---|---|---|---|
| Node eingebautes `fetch` (global, kein separates Paket) | Teil von Node ≥18, in Node ≥22.12 ausgereift | `AbortSignal.timeout(ms)` als `signal`-Option, nativ vorhanden | nicht eingebaut, muss selbst implementiert werden | Standard-Dispatcher von Node poolt Verbindungen; feine Steuerung nur über einen expliziten `undici`-Dispatcher | nicht automatisch aus `HTTP_PROXY`/`HTTPS_PROXY`; ab Node 22.21.0/24.0.0 experimentell über Flag `--use-env-proxy`/`NODE_USE_ENV_PROXY=1`, sonst nur über einen manuell gesetzten `undici`-Dispatcher (`ProxyAgent`/`EnvHttpProxyAgent`) |
| `undici` (explizit als Paket) | 8.10.2 (`engines.node: >=22.19.0`) | wie oben, zusätzlich feiner konfigurierbar (`headersTimeout`, `bodyTimeout`) | nicht eingebaut (kein automatisches Retry-Modul im Kern) | volle Kontrolle über `Agent`/`Pool` (`keepAliveTimeout`, `connections`) | `ProxyAgent`/`EnvHttpProxyAgent` als Dispatcher – programmatisch, unabhängig von Node-CLI-Flags |
| `got` | 16.0.0 (`engines.node: >=22`) | eingebaut, konfigurierbar | eingebaut (Retry-Strategie inkl. Backoff) | eingebaut über Basis auf `http`/`https`-Agents | über Standard-`http(s)_proxy`-Agenten-Pakete möglich, nicht automatisch ohne Zusatzkonfiguration |

**Empfehlung: Node eingebautes, globales `fetch` als HTTP-Schnittstelle im eigenen Code, plus
`undici` als reale Abhängigkeit ausschließlich für `ProxyAgent`/`EnvHttpProxyAgent` (Proxy) und
einen eigenen, per `Agent` konfigurierten globalen Dispatcher (Keep-Alive-Tuning). Retries als
eigener, kleiner Wrapper (exponentielles Backoff) um `fetch`.**

Begründung:

- Kein zusätzliches Laufzeitgewicht für die Grundfunktion: `fetch`, `Headers`, `Request`,
  `Response`, `AbortController`/`AbortSignal` sind bereits global in Node vorhanden (per
  eigenem Test bestätigt: `typeof fetch === 'function'` ohne jeden Import). Das passt zum
  Ziel minimaler `npx`-Startzeit besser als eine vollwertige HTTP-Client-Bibliothek wie `got`.
- Timeouts sind mit `AbortSignal.timeout(ms)` bereits ohne jede Abhängigkeit lösbar.
- Retries sind bei einer Buchhaltungs-API mit eigenen, API-spezifischen Fehlercodes ohnehin
  meist nicht generisch (z. B. Unterscheidung zwischen sicher wiederholbaren GET-Aufrufen und
  nicht blind wiederholbaren schreibenden Operationen) – eine schlanke Eigenimplementierung
  (ca. 30–50 Zeilen) ist hier robuster und auditierbarer als eine Blackbox-Retry-Logik aus
  einer generischen Bibliothek wie `got`.
- Proxy-Unterstützung ist der einzige Punkt, an dem das eingebaute `fetch` allein nicht
  ausreicht: Es liest `HTTP_PROXY`/`HTTPS_PROXY` nicht automatisch, und der einzige
  Node-eigene Mechanismus dafür (`--use-env-proxy`) ist laut Recherche noch **experimentell**
  und würde zusätzlich verlangen, dass der Nutzer beim `npx`-Aufruf selbst ein Node-Flag setzt
  – für ein Werkzeug, das "ohne Rückfragen benutzbar" sein soll, ist das keine verlässliche
  Grundlage. Der robustere Weg ist, `undici`s `EnvHttpProxyAgent` (liest dieselben
  Umgebungsvariablen) programmatisch als globalen Dispatcher zu setzen – das funktioniert auf
  jeder unterstützten Node-Version ohne CLI-Flag, weil es exakt der in Abschnitt 5.2 zitierte,
  offizielle Mechanismus (`setGlobalDispatcher`) ist, nur produktiv statt nur in Tests genutzt.
  Dieselbe `undici`-Abhängigkeit wird also sowohl in Tests (Abschnitt 5.2) als auch produktiv
  (dieser Abschnitt) verwendet – keine doppelte Abhängigkeitsfläche.
- `got` wurde geprüft und bewusst verworfen: Es bringt Retry/Timeout/Hooks komfortabel eingebaut
  mit, ist aber eine deutlich größere, ESM-only-Abhängigkeit mit eigenem Update-Rhythmus
  außerhalb des Node-Kernteams, ohne dass sie hier einen Vorteil bietet, den `fetch` +
  `undici` + eine kleine Eigenlogik nicht ebenso abdecken.

---

## 8. Validierung von Umgebungsvariablen und Konfiguration

Quelle: `npm view envalid version time.modified --json`, abgerufen 2026-09-12 (aktuell:
**8.2.0**, 2026-06-09). Zod-Version siehe Abschnitt 3.

**Empfehlung: Konfigurationsvalidierung mit `zod` selbst umsetzen, kein zusätzliches Paket wie
`envalid`.**

Begründung: `zod` ist über das MCP-SDK ohnehin bereits eine feste, unvermeidbare Abhängigkeit
(Abschnitt 3) und wird für Tool-Input-Schemas voraussichtlich sowieso im Projekt verwendet.
Ein einfaches Schema in der Art

```typescript
import { z } from "zod";

const configSchema = z.object({
  BUCHHALTUNGSBUTLER_API_KEY: z.string().min(1, "API-Key fehlt"),
  BUCHHALTUNGSBUTLER_BASE_URL: z.url().default("https://webapp.buchhaltungsbutler.de/api/v1"),
  HTTP_PROXY: z.url().optional(),
  HTTPS_PROXY: z.url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Ungültige Konfiguration: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return result.data;
}
```

deckt exakt das ab, was `envalid` als eigene Bibliothek anbietet (`cleanEnv`, typisierte
Validatoren), ohne eine weitere Abhängigkeit mit eigenem Versionszyklus einzuführen. `envalid`
wäre nur dann die bessere Wahl, wenn Zod aus anderen Gründen nicht im Projekt vorkäme – das
ist hier nicht der Fall.

`z.url()` (Top-Level-Funktion) setzt Zod 4 voraus; in Zod 3 hieß die Entsprechung
`z.string().url()`. Da Abschnitt 3 explizit Zod 4.6.2 empfiehlt, ist das konsistent, sollte
aber bei jeder Codestelle beachtet werden, die versehentlich noch Zod-3-Syntax verwendet.

---

## 9. Veröffentlichung auf npm

Quelle: `npm view buchhaltungsbutler-mcp`, `npm search buchhaltungsbutler`, abgerufen
2026-09-12; `npm view npm version --json`; `https://docs.npmjs.com/generating-provenance-statements`
und `https://docs.npmjs.com/trusted-publishers` (per WebFetch abgerufen, 2026-09-12).

### 9.1 Kritischer Befund: Der naheliegende Paketname ist bereits vergeben

Am 2026-09-12 abgefragt: `npm view buchhaltungsbutler-mcp` liefert einen Treffer. Der
Paketname – identisch mit dem Namen dieses Repository-Ordners – ist auf npm also bereits
vergeben und gehört nicht diesem Projekt.

**Das bedeutet: Der unscoped Name `buchhaltungsbutler-mcp` kann für dieses Projekt nicht
verwendet werden.** Dies ist keine Kleinigkeit, sondern muss vor jeder weiteren
Implementierungsarbeit an `package.json` entschieden werden.

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund: Entscheidung E3 des Projektinhabers und Umsetzungsplan 13.6.** Der Befund oben gilt
> unverändert: Der unscoped Name ist auf npm vergeben und wird nicht benutzt. **Der
> Entscheidungsbedarf unten ist jedoch erledigt, und der dort vorgeschlagene Namensraum `@init4`
> ist überholt.** Verbindlich ist **`@dennismenken/buchhaltungsbutler-mcp`** (am 2026-09-12 auf
> npm frei, HTTP 404) mit dem Repository `dennismenken/buchhaltungsbutler-mcp`. Bestehen bleibt
> allein der Pflichtschritt, **angemeldet auf npmjs.com zu prüfen, ob der Namensraum
> `@dennismenken` zum eigenen Konto gehört**, und ihn sonst als Organisation anzulegen; ein
> HTTP 404 auf einen gescopten Paketnamen belegt das nicht. Der Binärname lautet `bbutler-mcp`.

**Entscheidungsbedarf:** Empfohlener Ausweg ist ein gescoptes Paket, z. B.
`@init4/buchhaltungsbutler-mcp` (passend zum Projektpfad `~/Projects/init4/…`). Der npm-Scope
`@init4` scheint nach Stichprobe (`npm view @init4/anything` → 404, `npm search "@init4"` ohne
Treffer) nicht belegt zu sein – das ist aber **kein verlässlicher Nachweis**, dass die
Organisation `init4` auf npmjs.com noch nicht existiert oder der Scope beim Veröffentlichen
tatsächlich frei ist; das muss vor dem ersten `npm publish` aktiv auf npmjs.com geprüft/
angelegt werden. Alternative: ein anderer unscoped Name (z. B.
`buchhaltungsbutler-mcp-server-init4` oder ähnlich) – unscoped Namen sind aber grundsätzlich
kollisionsanfälliger und im konkreten Fall bereits einmal kollidiert.

### 9.2 Notwendige `package.json`-Felder für zuverlässiges `npx <paket>`

- `"type": "module"` – reines ESM-Paket, siehe tsconfig-Entscheidung in Abschnitt 2.2.
- `"bin"`: Objektform verwenden, auch bei nur einem Befehl, für Klarheit:
  ```json
  "bin": { "buchhaltungsbutler-mcp": "./dist/cli.js" }
  ```
  Der Schlüssel ist der Befehlsname, den `npx` bzw. eine globale Installation bereitstellt –
  unabhängig vom (ggf. gescopten) Paketnamen. Der Befehlsname kann trotz gescoptem Paketnamen
  weiterhin `buchhaltungsbutler-mcp` lauten. Das Ziel ist `./dist/cli.js` und nicht
  `dist/index.js`, weil dieses Paket zwei getrennte Einstiegspunkte hat (CLI über `bin`,
  Bibliothek über `exports`). `mcp-sdk-typescript.md` 10.3 nannte früher `dist/index.js`, weil es
  von einem einzigen Einstiegspunkt ausging, und führt am 2026-09-12 selbst `./dist/cli.js`; die
  Auflösung dieses Widerspruchs steht in Abschnitt 3.3, Punkt 4. Die Datei, auf die `bin` zeigt, braucht Shebang und Dateimodus 755 – beides muss
  auf genau diese Datei angewendet werden.
- `"files"`: explizite Positivliste statt `.npmignore`, um sicherzustellen, dass nur
  `dist/`, `README.md`, `LICENSE` (und ggf. `package.json` selbst, immer inbegriffen)
  veröffentlicht werden – keine Quelltexte, keine Testdateien, keine internen Notizen aus
  `docs/`:
  ```json
  "files": ["dist"]
  ```
- `"exports"`: begrenzt und beschreibt explizit, was von außen importierbar ist, falls das
  Paket zusätzlich zur CLI auch programmatisch nutzbar sein soll:
  ```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  }
  ```
  Ohne programmatischen Nutzungsfall kann dieses Feld auch entfallen; dann ist das Paket
  ausschließlich über `bin` nutzbar.
- `"engines"`: wie in Abschnitt 1 begründet, `{"node": ">=22.12.0"}` (nicht `>=20`, siehe
  Abschnitt 3.3, Punkt 1). Ergänzend empfiehlt sich
  `"engineStrict"` **nicht** zu setzen (dieses Feld ist ohnehin seit npm 3 wirkungslos; die
  harte Durchsetzung erfolgt nur über die lokale npm-Konfiguration `engine-strict=true` beim
  Installierenden, nicht über das Paket selbst – **zur Klarstellung, keine neue Empfehlung**).
- `"publishConfig"`: bei gescoptem Paketnamen zwingend `"access": "public"`, da gescopte Pakete
  bei npm standardmäßig privat (kostenpflichtig) wären:
  ```json
  "publishConfig": { "access": "public", "provenance": true }
  ```
- `"repository"`, `"bugs"`, `"homepage"`: Pflichtfelder für saubere npm-Provenance-Verknüpfung
  mit dem GitHub-Repository (siehe 9.3) und für die Trademark-/Disclaimer-Transparenz aus
  Abschnitt 11.
- `"sideEffects": false`: unschädliche Best-Practice-Angabe für Bundler auf Konsumentenseite,
  auch wenn das Paket primär als CLI und nicht als importierte Bibliothek genutzt wird.

### 9.3 Provenance und Trusted Publishing

Zwei Wege existieren nebeneinander, mit klarer Empfehlung für den zweiten:

**Klassisch (Long-Lived-Token):** `npm publish --provenance` in GitHub Actions mit einem in
GitHub-Secrets hinterlegten `NPM_TOKEN` sowie der Workflow-Berechtigung `id-token: write`.
Voraussetzung laut npm-Dokumentation: npm-CLI **≥ 9.5.0**.

**Empfohlen: npm Trusted Publishing (OIDC), kein `NPM_TOKEN` nötig.** Laut
`docs.npmjs.com/trusted-publishers` (abgerufen 2026-09-12): Voraussetzung ist npm-CLI
**≥ 11.5.1** und Node **≥ 22.14.0** auf einem GitHub-gehosteten Runner (kein Self-Hosted
Runner). Einrichtung erfolgt im npm-Paket-Dashboard unter *Settings → Trusted publishing* mit
Angabe von GitHub-Organisation/-Benutzer, Repository-Name und exaktem Workflow-Dateinamen. Der
Workflow braucht dann nur:

```yaml
permissions:
  id-token: write
  contents: read
```

und führt schlicht `npm publish` (bzw. `npm publish --access public`, siehe 9.2) aus – Node
generiert die Provenance-Attestation dabei automatisch, ohne zusätzliches Flag. Da die lokale
Referenzumgebung npm 10.9.8 meldet (unterhalb der 11.5.1-Schwelle), muss der CI-Workflow
explizit eine ausreichend aktuelle npm-Version sicherstellen (per `actions/setup-node` mit
passender Node-Version, ggf. zusätzlich `npm install -g npm@latest` als Schritt vor dem
Publish – aktuelle npm-Version laut Registry: **12.0.2**, 2026-09-09).

Der Weg ist von npm selbst dokumentiert (`https://docs.npmjs.com/trusted-publishers`); die
Registry weist erfolgreich so veröffentlichte Pakete mit dem Publisher-Eintrag
`"username": "GitHub Actions"` und `trustedPublisher.id: "github"` aus. An diesem Merkmal
lässt sich nach der ersten eigenen Veröffentlichung prüfen, ob der Weg tatsächlich gegriffen
hat.

---

## 10. Continuous Integration mit GitHub Actions

Quelle: GitHub-REST-API (`api.github.com/repos/<org>/<repo>/releases/latest`), abgerufen
2026-09-12 – diese Methode wurde bewusst gegenüber der HTML-Release-Seite bevorzugt, weil ein
erster Versuch, die Release-Seiten von `actions/checkout` und `actions/setup-node` per
WebFetch zu lesen, in sich widersprüchliche und teils klar falsche Datumsangaben lieferte
(vermutlich, weil die Zusammenfassung veraltete Textstellen der clientseitig gerenderten Seite
aufgegriffen hat). Die REST-API liefert dagegen strukturierte, verlässliche Rohdaten.

| Action | Neueste Version | Veröffentlicht |
|---|---|---|
| `actions/checkout` | v7.0.1 | 2026-07-20 |
| `actions/setup-node` | v7.0.0 | 2026-07-14 |
| `pnpm/action-setup` | v6.1.0 | 2026-09-05 |

Empfehlung: In Workflows die kurze Major-Tag-Schreibweise referenzieren (`@v7`, `@v6`), damit
Patch-Updates automatisch einfließen, wie es GitHub selbst für Actions empfiehlt.

### 10.1 Matrix

Test-Matrix über die aktuell gepflegten Node-Linien (siehe Abschnitt 1), **ohne** die bereits
End-of-Life-Linie v20:

```yaml
strategy:
  matrix:
    node-version: [22, 24, 26]
```

Begründung: v22 deckt die gewählte `engines`-Untergrenze (Abschnitt 1.2) ab, v24 die aktuelle
Active-LTS-Linie, v26 die kommende LTS-Linie (ab 2026-10-28) – damit ist die Kette gegen die
gesamte praktisch relevante, noch gepflegte Node-Bandbreite abgesichert. v20 aufzunehmen wäre
widersprüchlich zur in Abschnitt 1 getroffenen Entscheidung, es nicht mehr zu unterstützen.

### 10.2 Beispiel-Workflow (Test + Lint)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22, 24, 26]
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node-version }}
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run test
      - run: pnpm run build
```

### 10.3 Beispiel-Workflow (Veröffentlichung mit Trusted Publishing)

```yaml
name: Publish

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: npm install -g npm@latest # ensures npm >= 11.5.1 for Trusted Publishing
      - run: npm publish --access public
```

Voraussetzung für diesen Workflow ist die in Abschnitt 9.3 beschriebene einmalige Einrichtung
von Trusted Publishing im npm-Dashboard für exakt diesen Repository- und Workflow-Dateinamen.

---

## 11. Lizenz und Kennzeichnung als inoffizielles Projekt

Quelle: eigene Prüfung von `docs/openapi/buchhaltungsbutler-v1.json` (lokale Datei dieses
Repositories) sowie die Registry-Abfrage aus Abschnitt 9.1, abgerufen/geprüft 2026-09-12.
**Kein juristischer Rat.**

### 11.1 Lizenz

Empfehlung: **MIT-Lizenz.** Begründung: Für einen schlanken, quelloffenen API-Client ohne
Patentthematik ist MIT die unter Node/npm-Projekten übliche, unkomplizierteste Wahl. Sie ist
im MCP-Ökosystem verbreitet und signalisiert klar, dass es sich um ein unabhängiges
Open-Source-Projekt und keine offizielle Software handelt.

### 11.2 Abgrenzung von der offiziellen BuchhaltungsButler-Software

Die einzige in diesem Projekt vorliegende Primärquelle zum offiziellen Anbieter ist die
OpenAPI-Spezifikation unter `docs/openapi/buchhaltungsbutler-v1.json`. Sie nennt den Titel
"BuchhaltungsButler API", Host `webapp.buchhaltungsbutler.de`, aber **keine** Rechtsträger-
oder Firmierungsangabe (kein Impressum, kein Copyright-Header in der Datei selbst). Der genaue
Rechtsträger hinter der Marke "BuchhaltungsButler" (vermutlich eine GmbH, aber **nicht
verifiziert** in dieser Recherche – vor Veröffentlichung im Impressum auf
`buchhaltungsbutler.de` zu prüfen) kann deshalb hier nicht verbindlich benannt werden.

Empfehlung für die README-Kennzeichnung (Formulierungsvorschlag, keine Rechtsberatung):

> Dieses Projekt ist ein inoffizieller, quelloffener MCP-Server für die BuchhaltungsButler-API.
> Es steht in keiner Verbindung zu und wird nicht unterstützt, gesponsert oder geprüft von dem
> Unternehmen hinter BuchhaltungsButler. "BuchhaltungsButler" ist eine Marke ihres jeweiligen
> Rechtsinhabers; die Nennung dient ausschließlich der Beschreibung der Kompatibilität dieses
> Werkzeugs.

Zusätzlich sollten folgende Punkte in der README stehen:

- Deutlich sichtbarer Hinweis direkt unter dem Projekttitel (nicht erst am Textende), dass es
  sich um ein Community-/Drittanbieterprojekt handelt.
- Kein Logo, kein Markenzeichen und keine visuelle Gestaltung der offiziellen
  BuchhaltungsButler-Marke im README oder in der npm-Paketbeschreibung verwenden – nur der
  Name als Fließtext zur Funktionsbeschreibung.
- Verweis darauf, dass Nutzer ihren eigenen API-Key selbst bereitstellen und dieser niemals im
  Repository, in Beispielen oder in Issues im Klartext geteilt werden sollte (deckt sich mit
  dem projektweiten Verbot echter Zugangsdaten in Beispielen).
- Der Paketname ist unter Namensraum geführt (Abschnitt 9.1). Weil unter dem ungescopten Namen
  ein anderes Paket liegt, gehört in die README ein kurzer, sachlicher Satz, dass nur der
  gescopte Name zu diesem Projekt gehört – das beugt Verwechslungen bei Nutzern vor, die über
  eine Suchmaschine einsteigen.

---

## 12. Empfohlene Abhängigkeiten

Die Tabelle rendert **Variante A (v2)** aus Abschnitt 3.2. Wird in der Planungsphase Variante B
(v1) gewählt, ersetzen deren MCP-Zeilen die hier aufgeführten vollständig; alle übrigen Zeilen
bleiben unverändert. Teile beider Varianten zu mischen ist nach 3.2 verboten.

| Paket | Version | Zweck | Begründung |
|---|---|---|---|
| `@modelcontextprotocol/server` | `2.0.0` (exakt, nicht `^`) | MCP-Protokoll-Implementierung (Server, Transport, Typen) | Stabile SDK-Linie laut README (Q11), offizieller Quickstart installiert sie (Q16); Version per `npm view` verifiziert. Exakt statt Bereichsangabe gemäß `mcp-sdk-typescript.md` 10.2. Bei Variante B stattdessen `@modelcontextprotocol/sdk` `1.30.0` exakt. |
| `@modelcontextprotocol/client` | `2.0.0` (exakt, nicht `^`) | Client für den Integrationstest der CI (`initialize`, `tools/list`, `tools/call` gegen den gebauten Server) | `devDependency`, nicht produktiv. Nur in Variante A nötig; in Variante B liegt die Client-Klasse im selben Paket `@modelcontextprotocol/sdk`. |
| `zod` | `^4.6.2` | Tool-Input-Schemas, Konfigurationsvalidierung | Liegt im Bereich beider SDK-Linien (v1 Peer `^3.25 \|\| ^4.0`, v2 Abhängigkeit `^4.2.0`); deckt Abschnitt 8 ohne weitere Abhängigkeit ab. Explizit als eigene `dependency`, siehe 3.4 |
| `undici` | `^8.10.2` | Proxy-Unterstützung (`EnvHttpProxyAgent`) und Keep-Alive-Tuning für das eingebaute `fetch`; in Tests zusätzlich `MockAgent` | Offiziell dokumentierter Weg, das globale `fetch` zu konfigurieren/mocken (siehe Abschnitt 5.2, 7); kein Ersatz für `fetch` selbst, nur Ergänzung |
| `typescript` | `6.0.3` (exakt, nicht `^`) | Type-Checking, `.d.ts`-Emission | **Bewusst nicht 7.0.2** – TypeScript 7 hat keine programmatische API und ist mit `typescript-eslint` inkompatibel (peer `<6.1.0`), siehe Abschnitt 2.1. Exakt statt Bereichsangabe, um ein unbeabsichtigtes Auto-Update auf 7.x zu verhindern. |
| `tsdown` | `^0.23.0` | Build/Bundling der CLI-Ausgabe | Aktivste Pflege (2026-09-03), auf TypeScript-7-Kompatibilität vorbereitet, siehe Abschnitt 4 |
| `vitest` | `^5.0.0` | Testrunner | Nativ ESM/TS-fähig, `engines` deckt sich mit gewählter Node-Untergrenze, siehe Abschnitt 5.1 |
| `@vitest/coverage-v8` | `^5.0.0` | Testabdeckung | Synchron zu `vitest`, V8-natives Coverage-Backend |
| `eslint` | `^10.10.0` | Linting (Flat Config) | Aktuelle Major-Version, siehe Abschnitt 6 |
| `typescript-eslint` | `^8.70.0` | Typgestützte Lint-Regeln | Erzwingt `typescript<6.1.0` als Peer – zentraler Grund für die TypeScript-Entscheidung |
| `@biomejs/biome` | `^2.5.13` | Code-Formatierung (nicht Linting) | Schneller Prettier-Ersatz, siehe Abschnitt 6 |
| `@types/node` | `^22.20.2` | Typdefinitionen für Node-APIs | Passend zur gewählten `engines`-Untergrenze (22.x), nicht die neueste Node-Major-Linie, um keine Typen für nicht unterstützte APIs vorzuspiegeln |

Alle genannten Pakete außer `@modelcontextprotocol/server` (in Variante B:
`@modelcontextprotocol/sdk`), `zod` und `undici` sind Entwicklungsabhängigkeiten
(`devDependencies`); `undici` wird sowohl produktiv (Proxy/Keep-Alive) als auch in Tests genutzt
und ist daher als reguläre `dependency` einzutragen. `@modelcontextprotocol/client` ist trotz
seines Namens eine `devDependency`, weil er ausschließlich im Integrationstest läuft.

Für die MCP-Pakete gilt abweichend von den übrigen Zeilen die exakte Versionsangabe ohne Caret
(`mcp-sdk-typescript.md` 10.2). Grund: Beide Linien sind jung, und ein automatischer Sprung
innerhalb der Major-Linie soll nicht unbemerkt die Protokoll-Aushandlung oder die
API-Oberfläche verändern. Ein Lockfile wird in jedem Fall eingecheckt.

---

## 13. Vorschlag `package.json`

Paketname als Platzhalter entsprechend der in Abschnitt 9.1 offenen Entscheidung markiert.

Der Vorschlag rendert **Variante A (v2)** aus Abschnitt 3.2. Der vollständige Unterschied zu
Variante B (v1) steht unmittelbar unter dem Codeblock. Gemischt wird nicht.

```json
{
  "name": "@init4/buchhaltungsbutler-mcp",
  "version": "0.1.0",
  "description": "Unofficial MCP server for the BuchhaltungsButler API",
  "type": "module",
  "license": "MIT",
  "author": "Dennis Menken",
  "homepage": "https://github.com/init4/buchhaltungsbutler-mcp#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/init4/buchhaltungsbutler-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/init4/buchhaltungsbutler-mcp/issues"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "buchhaltungsbutler",
    "accounting",
    "buchhaltung",
    "unofficial"
  ],
  "engines": {
    "node": ">=22.12.0"
  },
  "packageManager": "pnpm@12.4.1",
  "bin": {
    "buchhaltungsbutler-mcp": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "sideEffects": false,
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "2.0.0",
    "zod": "^4.6.2",
    "undici": "^8.10.2"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.13",
    "@modelcontextprotocol/client": "2.0.0",
    "@types/node": "^22.20.2",
    "@vitest/coverage-v8": "^5.0.0",
    "eslint": "^10.10.0",
    "tsdown": "^0.23.0",
    "typescript": "6.0.3",
    "typescript-eslint": "^8.70.0",
    "vitest": "^5.0.0"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

### 13.1 Unterschied zu Variante B (v1)

Wird in der Planungsphase Variante B gewählt, sind genau diese beiden Stellen zu ändern, sonst
nichts. `engines`, `bin`, `exports`, `files`, die Skripte und alle übrigen Abhängigkeiten sind
in beiden Varianten identisch (Abschnitt 3.2).

```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.0",
    "zod": "^4.6.2",
    "undici": "^8.10.2"
  }
```

und in `devDependencies` entfällt der Eintrag `"@modelcontextprotocol/client": "2.0.0"`
ersatzlos, weil die Client-Klasse für den Integrationstest unter v1 im selben Paket liegt.

Zusätzlich gilt unter Variante B im Quellcode: alle SDK-Importe ausschließlich über Subpfade mit
`.js`-Endung, nie über den Wurzelpfad (Abschnitt 3.2, Variante B). Das ist keine
`package.json`-Änderung, aber Teil desselben Paketsatzes und darf nicht mit v2-Importpfaden
vermischt werden.

### 13.2 Hinweise zu einzelnen Feldern

> **Nachgezogen am 2026-09-13 nach `docs/entwicklung/umsetzungsplan.md`, Abschnitt 15 (AP20);
> Sachgrund in Abschnitt 12, Streitfrage S22.** **Der `packageManager`-Konflikt ist entschieden:
> `"packageManager": "pnpm@10.34.3"`.** Das ist die Version, die in der Entwicklungsumgebung
> tatsächlich installiert und am 2026-09-12 als lauffähig belegt ist. Ein `packageManager`-Feld,
> das auf eine nicht vorhandene Version zeigt, ist eine Startfalle für jeden Mitwirkenden und
> scheitert hinter einem Proxy ohne Corepack-Zugriff. Der Sprung auf 12.x bleibt eine eigene,
> bewusste Änderung mit eigener Lockfile-Migration und ist kein Nebeneffekt des Projektstarts.
> Die CI benutzt dieselbe Version. Der erste Aufzählungspunkt unten beschreibt damit den
> früheren Stand; die Entscheidung ist getroffen. Ebenfalls überholt ist der vorletzte Punkt:
> `engines.node` steht auf **`>=22.19.0`**, siehe Abschnitt 3.3.

- `packageManager: "pnpm@12.4.1"` referenziert die zum Stand dieses Dossiers aktuelle
  pnpm-Version laut `npm view pnpm version` (veröffentlicht 2026-09-11) – **abweichend** von
  der in der Aufgabenstellung genannten lokal installierten Version 10.34.3. Das ist ein
  bewusster Konflikt zwischen "aktuelle Software" und "tatsächlich vorhandene
  Entwicklungsumgebung" und sollte als **Entscheidungsbedarf** behandelt werden: Entweder die
  lokale pnpm-Installation vor Projektstart aktualisieren, oder das `packageManager`-Feld
  bewusst auf die tatsächlich genutzte Version 10.34.3 setzen und den Sprung auf 12.x als
  spätere, separate Aufgabe planen. `corepack` (das dieses Feld normalerweise automatisch
  durchsetzt) ist ab Node 25 nicht mehr im Node-Kern enthalten und muss dann separat
  installiert werden (laut mehreren übereinstimmenden Sekundärquellen zum Node-TSC-Beschluss,
  **nicht an einer offiziellen Nodejs.org-Primärquelle nachverifiziert** in dieser Session) –
  für Node 22/24 (unsere gewählte Matrix) ist es noch vorhanden, wie durch die lokale
  Verfügbarkeit von `corepack` in der Referenzumgebung (Node v22.23.2) bestätigt.
- `prepublishOnly` verhindert, dass ein `npm publish` ohne vorherigen erfolgreichen Build/Test/
  Lint-Lauf ausgeführt wird.
- `description` ist bewusst englisch. npm-Paketmetadaten sind öffentlich und im Ökosystem
  englischsprachig; das Wort "Unofficial" an erster Stelle trägt zugleich die in Abschnitt 11.2
  geforderte Abgrenzung. Die deutschsprachige Kennzeichnung steht in der README, nicht in den
  Registry-Metadaten.
- Die MCP-Pakete stehen bewusst **ohne** Caret in der Datei (`"2.0.0"`, in Variante B
  `"1.30.0"`), alle übrigen Abhängigkeiten mit Caret. Begründung in Abschnitt 12 und in
  `mcp-sdk-typescript.md` 10.2.
- `engines.node` steht auf `>=22.12.0` und nicht auf der SDK-Untergrenze `>=20`. Die Auflösung
  dieses Punktes gegenüber `mcp-sdk-typescript.md` 10.2/10.3 steht in Abschnitt 3.3, Punkt 1.
- `"build": "tsdown"` ist der verbindliche Auslieferungs-Build, nicht `tsc`. Falls sich bei der
  in Abschnitt 4.2 angekündigten Prüfung mit `npm pack` zeigt, dass `tsdown` den Dateimodus der
  `bin`-Datei nicht selbst auf 755 setzt, lautet das Skript
  `"build": "tsdown && chmod 755 dist/cli.js"`. Der `chmod`-Pfad muss immer exakt auf die in
  `bin` eingetragene Datei zeigen (Abschnitt 3.3, Punkte 3 und 4).
- `@modelcontextprotocol/client` erscheint nur in `devDependencies` und wird ausschließlich vom
  Integrationstest benutzt, der den gebauten Server startet und `initialize`, `tools/list` sowie
  mindestens einen `tools/call` ausführt (`mcp-sdk-typescript.md` 10.4, Punkt 12). Über `files`
  gelangt er nicht ins veröffentlichte Paket.

---

## 14. Vorschlag `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "incremental": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

Für Testdateien empfiehlt sich eine separate, leicht gelockerte Konfiguration (z. B.
`tsconfig.test.json`, die `src` und `test`/`tests` einschließt und bei Bedarf
`"types": ["node", "vitest/globals"]` ergänzt), damit die strikten Optionen der
Produktionskonfiguration nicht ungewollt auf Testcode mit anderen Anforderungen (z. B.
großzügigerer Umgang mit `any` in Mock-Daten) durchschlagen. Diese Aufteilung ist eine
Empfehlung dieses Dossiers, keine aus einer externen Quelle zitierte Vorgabe.

---

## 15. Zusammenfassung: Entscheidungsbedarf für die Planungsphase

1. **SDK-Linie v1 oder v2:** Dokumentierter Standardweg ist v2
   (`@modelcontextprotocol/server@2.0.0`), deckungsgleich mit der Empfehlung in
   `mcp-sdk-typescript.md` 10.1. Die endgültige Freigabe liegt laut jenem Abschnitt in der
   Planungsphase; bis dahin ist v1 als vollständiger Rückfallsatz dokumentiert (Abschnitt 3.2).
   Zu entscheiden ist genau eine der beiden Varianten als Ganzes. Beim Umschalten sind in
   dieser Datei die Abschnitte 3.2, 12, 13 und 13.1 gemeinsam anzupassen. In
   `mcp-sdk-typescript.md` betrifft das 10.1 bis 10.3; einen den Variantentabellen aus 3.2
   entsprechenden Block gibt es dort am 2026-09-12 **nicht** (Beleg und offener Punkt: siehe
   Hinweis zu Beginn von Abschnitt 3.2).
2. **Paketname:** `buchhaltungsbutler-mcp` ist auf npm bereits vergeben (Abschnitt 9.1).
   Vorschlag `@init4/buchhaltungsbutler-mcp` muss vor Veröffentlichung aktiv geprüft/reserviert
   werden.
3. **`engines.node`-Untergrenze:** `>=22.12.0` (Empfehlung) schließt Node 20 aus, obwohl dessen
   EOL erst wenige Monate zurückliegt (Abschnitt 1.2). Bewusste Abwägung zwischen Reichweite
   und Sicherheitsstandard nötig. Die Angabe `>=20` in `mcp-sdk-typescript.md` 10.2 ist
   die SDK-Untergrenze, kein konkurrierender Projektwert (Abschnitt 3.3, Punkt 1); den
   Projektwert `>=22.12.0` führt jene Datei am 2026-09-12 selbst.
4. **`packageManager`-Version:** Registry-aktuelles pnpm (12.4.1) weicht von der lokal
   installierten Version (10.34.3) ab (Abschnitt 13). Zu klären, ob die Entwicklungsumgebung
   vor Projektstart aktualisiert wird.
5. **TypeScript 7:** Bewusst zurückgestellt bis zu einer stabilen 7.1-Version mit
   programmatischer API und bis `typescript-eslint` seine Peer-Range öffnet (Abschnitt 2.1).
   Sollte als offener Wiedervorlage-Punkt im Projekt vermerkt werden.
6. **Trademark-Formulierung in der README:** Der genaue Rechtsträger hinter
   "BuchhaltungsButler" ist nicht verifiziert (Abschnitt 11.2) und sollte vor Veröffentlichung
   im offiziellen Impressum geprüft werden.

---

## Quellen

- `npm view <paketname> version time.modified engines dependencies peerDependencies --json`
  für: `typescript`, `@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`,
  `@modelcontextprotocol/client`, `@modelcontextprotocol/core`, `zod`, `tsup`, `tsdown`, `esbuild`,
  `rolldown-plugin-dts`, `vitest`, `@vitest/coverage-v8`, `msw`, `nock`, `undici`, `eslint`,
  `typescript-eslint`, `@biomejs/biome`, `oxlint`, `got`, `dotenv`, `envalid`, `@types/node`,
  `npm`, `pnpm`, `prettier`, `eslint-config-prettier`, `buchhaltungsbutler-mcp`,
  `mcp-server-buchhaltungsbutler` — npm-Registry, abgerufen 2026-09-12.
- `npm search buchhaltungsbutler` — npm-Registry, abgerufen 2026-09-12.
- `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json` — offizielles
  Node.js-Release-Repository, abgerufen 2026-09-12.
- `https://nodejs.org/dist/index.json` — offizielle Node.js-Verteilungsliste, abgerufen
  2026-09-12.
- `https://nodejs.org/en/about/previous-releases` — per WebFetch abgerufen 2026-09-12
  (Detailangaben teils widersprüchlich zur `schedule.json`, siehe Abschnitt 1).
- `https://nodejs.org/api/globals.html#fetch` — per WebFetch abgerufen 2026-09-12, Zitat siehe
  Abschnitt 5.2.
- `https://docs.npmjs.com/generating-provenance-statements` — per WebFetch abgerufen
  2026-09-12.
- `https://docs.npmjs.com/trusted-publishers` — per WebFetch abgerufen 2026-09-12.
- `https://api.github.com/repos/actions/checkout/releases/latest`,
  `https://api.github.com/repos/actions/setup-node/releases/latest`,
  `https://api.github.com/repos/pnpm/action-setup/releases/latest` — GitHub-REST-API, abgerufen
  2026-09-12.
- WebSearch-Ergebnisse zu TypeScript 7 (u. a. InfoQ: "Microsoft Releases TypeScript 7.0 with a
  Native Go Compiler", Microsoft DevBlogs "Announcing TypeScript 7.0",
  GitHub-Issue `typescript-eslint/typescript-eslint#12518`), abgerufen 2026-09-12.
- WebSearch-Ergebnisse zu Biomes Type-Aware-Linting (u. a. GitHub-Issue
  `biomejs/biome#3187`, mehrere unabhängige Vergleichsartikel Stand 2026), abgerufen
  2026-09-12.
- WebSearch-Ergebnisse zu Node-Proxy-Unterstützung für `fetch` (u. a.
  `nodejs/node#57165`, `nodejs/undici#1650`,
  `https://undici.nodejs.org/best-practices/undici-vs-builtin-fetch`), abgerufen 2026-09-12.
- WebSearch-Ergebnisse zu `nock`/`undici`-Kompatibilität (u. a. `nock/nock#2183`,
  `nock/nock#2336`), abgerufen 2026-09-12 — als **nicht abschließend verifiziert**
  gekennzeichnet, siehe Abschnitt 5.2.
- Eigene Tests in dieser Session, Node v22.23.2, npm 10.9.8, pnpm 10.34.3, 2026-09-12:
  Verfügbarkeit von `node:undici`, globalem `fetch`, `process.versions.undici`.
- `npm view @modelcontextprotocol/sdk@1.30.0 dependencies peerDependencies engines --json`
  sowie dieselbe Abfrage für `@modelcontextprotocol/server@2.0.0`,
  `@modelcontextprotocol/client@2.0.0` und `@modelcontextprotocol/core@2.0.0` — npm-Registry,
  abgerufen 2026-09-12, Grundlage der Abhängigkeitsflächen in Abschnitt 3.1.
- `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/entwicklung/mcp-sdk-typescript.md`
  — Schwesterdossier dieses Repositories, Stand 2026-09-12; Quelle der Belegkennungen Q1, Q2,
  Q10, Q11, Q14, Q16 und der Vorgaben aus dessen Abschnitten 10.1 bis 10.4. Die vier
  Widersprüche zwischen beiden Dossiers sind in Abschnitt 3.3 aufgelöst, ein fünfter
  (gekürztes Zitat des v1-`dependencies`-Blocks) ist in Abschnitt 3.1 benannt.
- `/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json`
  — lokale Projektdatei, geprüft 2026-09-12.
