# MCP TypeScript SDK, aktuelle API und Fallstricke

Stand und Abrufdatum aller Angaben: **2026-09-12**.

Dieses Dokument ist das Nachschlagewerk für die Implementierung des BuchhaltungsButler-MCP-Servers.
Jede Aussage trägt eine Quelle. Wo etwas nicht belegt werden konnte, steht das ausdrücklich dabei.

## Quellenverzeichnis

| Kürzel | Quelle | Art |
| --- | --- | --- |
| Q1 | `npm view @modelcontextprotocol/sdk version / versions / peerDependencies / dependencies / engines / exports / time / dist-tags` | Registry-Abfrage, 2026-09-12 |
| Q2 | `node_modules/@modelcontextprotocol/sdk/package.json` aus einer frischen Installation von 1.30.0 | Datei im veröffentlichten Paket |
| Q3 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/server/mcp.d.ts` und `dist/esm/server/mcp.js` | Typdefinition und Implementierung |
| Q4 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/server/zod-compat.d.ts` und `dist/esm/server/zod-json-schema-compat.js` | Typdefinition und Implementierung |
| Q5 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/server/stdio.d.ts` und `dist/esm/server/stdio.js` | Typdefinition und Implementierung |
| Q6 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/server/index.d.ts` und `dist/esm/server/index.js` (Low-Level-`Server`) | Typdefinition und Implementierung |
| Q7 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/shared/protocol.d.ts` | Typdefinition `RequestHandlerExtra`, `Protocol` |
| Q8 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/types.d.ts` und `dist/esm/types.js` | Protokollkonstanten und Schemadefinitionen |
| Q9 | `@modelcontextprotocol/sdk@1.30.0`, `dist/esm/shared/toolNameValidation.js` | Implementierung Tool-Namensprüfung |
| Q10 | Eigene Laufzeittests, siehe Abschnitt „Testaufbau der Verifikation“ | selbst ausgeführt, 2026-09-12 |
| Q11 | https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md | README des `main`-Branch (v2) |
| Q12 | https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md | README des `v1.x`-Branch |
| Q13 | https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/docs/server.md | Serverdokumentation v1 |
| Q14 | `npm view @modelcontextprotocol/server` und `@modelcontextprotocol/client` | Registry-Abfrage, 2026-09-12 |
| Q15 | `node_modules/@modelcontextprotocol/server/dist/*.d.mts` aus einer frischen Installation von 2.0.0 | Typdefinitionen v2 |
| Q16 | https://modelcontextprotocol.io/docs/develop/build-server | offizieller Quickstart |
| Q17 | `docs/entwicklung/toolchain.md` (Schwesterdossier in diesem Repository), Abschnitte 1.1, 1.2, 2.1, 3.3 und 4 | Datei im Repository, Stand 2026-09-12 |
| Q18 | `docs/entwicklung/mcp-spezifikation.md` (Schwesterdossier in diesem Repository), Abschnitt 11.1a | Datei im Repository, Stand 2026-09-12 |
| Q19 | Eigene Prüfung des veröffentlichten Tarballs: `npm pack @modelcontextprotocol/sdk@1.30.0`, Entpacken mit `tar -xzf`, danach `grep -rn "export const LATEST_PROTOCOL_VERSION" package/dist`, Abgleich der Querverweise mit `grep -rn "spec.types" dist/esm` im entpackten wie im installierten Paket sowie ein Laufzeit-Import über den Wildcard-Exportpfad gegen eine Installation von 1.30.0 | selbst ausgeführt, 2026-09-12 |

---

## 1. Die Lage: zwei parallele SDK-Linien

Der Auftrag ging von einem einzigen Paket `@modelcontextprotocol/sdk` aus. Das trifft seit Ende Juli 2026 nicht mehr zu.
Es existieren zwei gepflegte Linien:

| | v1 | v2 |
| --- | --- | --- |
| Paket(e) | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/core` |
| Aktuelle Version | 1.30.0 | 2.0.0 |
| Veröffentlicht | 2026-07-27T17:56:01Z (Q1) | 2026-07-27T23:55:22Z (Q14) |
| `engines.node` | `>=18` (Q1, Q2) | `>=20` (Q14) |
| Schemabibliothek | Zod 3.25+ oder Zod 4 (Q2) | Standard Schema, u. a. Zod 4 (Q11, Q15) |
| Branch | `v1.x` | `main` |
| Status laut README | Wartung: Bugfixes und Security-Updates für mindestens 6 Monate nach v2-Release (Q11) | „v2 is the stable release line“ (Q11) |

Wörtlich aus Q11:

> **This is the `main` branch — v2 of the SDK** (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`), implementing the [2026-07-28 MCP spec](https://modelcontextprotocol.io/specification/2026-07-28).
> [...] **v2 is the stable release line**, released alongside the 2026-07-28 spec. v1.x continues to receive bug fixes and security updates for at least 6 months after v2's release.

Der offizielle Quickstart (Q16) installiert für TypeScript bereits `npm install @modelcontextprotocol/server zod` und verlangt Node 20 oder höher.

### Widerspruch, der nicht aufgelöst werden konnte

Q11 sagt, v2 implementiere die Spezifikation 2026-07-28. Die veröffentlichte Version 2.0.0 meldet aber:

```text
LATEST_PROTOCOL_VERSION      = 2025-11-25
SUPPORTED_PROTOCOL_VERSIONS  = ["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]
DEFAULT_NEGOTIATED_PROTOCOL_VERSION = 2025-03-26
```

(Q10, Laufzeitabfrage der Exporte aus `@modelcontextprotocol/server@2.0.0`.)

Im Bundle von `@modelcontextprotocol/core@2.0.0` finden sich zwar Typen und Kommentare, die auf `2026-07-28` verweisen
(z. B. `server/discover`, `subscriptions/listen`, `ResultMetaObject`, SEP-2577-Deprecations), und der Code kennt einen
Era-Begriff `'legacy' | 'modern'` (Q15, Typ `ProtocolEra`). Wie die 2026-07-28-Revision konkret ausgehandelt wird,
ließ sich aus dem Bundle nicht abschließend klären. **Dieser Punkt ist nicht verifiziert** und gehört in die Planung.

---

## 2. v1: `@modelcontextprotocol/sdk@1.30.0` im Detail

### 2.1 Version, Datum, Node, Modulformat, Protokollversion

| Merkmal | Wert | Quelle |
| --- | --- | --- |
| `dist-tags.latest` | `1.30.0` | Q1 |
| Veröffentlichungsdatum | `2026-07-27T17:56:01.640Z` | Q1 (`npm view ... time`) |
| Vorgänger | 1.29.0 (2026-03-30), 1.28.0 (2026-03-25), 1.27.1 (2026-02-24) | Q1 |
| `engines.node` | `>=18` | Q1, Q2 |
| `package.json` `type` | `module` | Q1, Q2 |
| Modulformat | dual: `dist/esm` (ESM) und `dist/cjs` (CJS), je mit eigenem `package.json`-Marker (`{"type":"module"}` bzw. `{"type":"commonjs"}`) | Q2, Q10 |
| Lizenz | MIT | Q2 |
| `LATEST_PROTOCOL_VERSION` | `2025-11-25` (aus `dist/esm/types.js`, der Wert, den `Protocol` und `McpServer` tatsächlich aushandeln) | Q8, Q19 |
| `SUPPORTED_PROTOCOL_VERSIONS` | `["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]` | Q8 |
| `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` | `2025-03-26` | Q8 |

**Zweite, abweichende Protokollkonstante im selben Paket (Q19).** Das veröffentlichte Paket enthält neben
`dist/esm/types.js` die Datei `dist/esm/spec.types.js` samt CJS-Gegenstück `dist/cjs/spec.types.js`. Sie exportiert
ebenfalls ein `LATEST_PROTOCOL_VERSION`, jedoch mit dem Wert `"DRAFT-2026-v1"`:

```text
package/dist/esm/spec.types.js:12:export const LATEST_PROTOCOL_VERSION = "DRAFT-2026-v1";
package/dist/esm/types.js:2:export const LATEST_PROTOCOL_VERSION = '2025-11-25';
```

Das sind im gesamten `dist`-Baum die einzigen beiden Definitionen dieser Konstante. Zu `spec.types.js` gehört mit
`dist/esm/spec.types.d.ts` eine zweite, parallel deklarierte Typfläche des Protokolls (2310 Zeilen, 145 exportierte
Interfaces und Typaliase). Ihr Dateikopf weist sie als automatisch generiert aus, Quelle laut Kopfzeile
`.../modelcontextprotocol/main/schema/draft/schema.ts`; die Konstante selbst trägt `/** @internal */`.

Drei Punkte dazu, alle geprüft (Q19):

1. **Die Laufzeit benutzt die Datei nicht.** Kein anderes Modul des Bundles referenziert `spec.types`
   (`grep -rn "spec.types" dist/esm` liefert außerhalb der Datei selbst keinen Treffer, weder in `.js` noch in
   `.d.ts`). Ausgehandelt wird ausschließlich der Wert aus `types.js`.
2. **Importierbar ist sie trotzdem**, über den Wildcard-Export `./*` (siehe 2.2). Laufzeittest gegen die
   installierte 1.30.0:

   ```typescript
   import { LATEST_PROTOCOL_VERSION as a } from '@modelcontextprotocol/sdk/types.js';      // '2025-11-25'
   import { LATEST_PROTOCOL_VERSION as b } from '@modelcontextprotocol/sdk/spec.types.js'; // 'DRAFT-2026-v1'
   ```

3. **Die Bezeichnung `DRAFT-2026-v1` deckt sich nicht mit dem Funktionsumfang.** In `spec.types.d.ts` kommen die in
   `mcp-spezifikation.md` 11.1 genannten 2026er-Merkmale nicht vor: `grep` auf `discover`, `resultType`, `ttlMs`,
   `cacheScope`, `subscriptions/listen` und `32022` liefert jeweils null Treffer. Gegenüber `types.d.ts` enthält die
   Datei genau zwei zusätzliche Typnamen (`Error`, `URLElicitationRequiredError`) und einen zusätzlichen
   Fehlercode (`URL_ELICITATION_REQUIRED = -32042`). Die Datei ist damit kein Nachweis für eine ausgehandelte
   2026er-Revision, sondern ein mitgeliefertes Generat aus dem Draft-Schema des Spezifikations-Repositorys.

Bei einer echten stdio-Verbindung mit Client und Server auf 1.30.0 wurde `"protocolVersion":"2025-11-25"` ausgehandelt (Q10).

### 2.2 Exportpfade

`exports` aus Q1/Q2, verkürzt:

| Subpfad | ESM-Ziel |
| --- | --- |
| `.` | `./dist/esm/index.js` |
| `./client` | `./dist/esm/client/index.js` |
| `./server` | `./dist/esm/server/index.js` |
| `./validation`, `./validation/ajv`, `./validation/cfworker` | entsprechende Dateien |
| `./experimental`, `./experimental/tasks` | entsprechende Dateien |
| `./*` | `./dist/esm/*` |

Zusätzlich existiert `typesVersions: { "*": { "*": ["./dist/esm/*"] } }` (Q2). Das ist die Ursache eines Fallstricks,
siehe Abschnitt 8.3.

**Warnung zum Wildcard-Eintrag `./*`:** Er macht jede Datei unter `dist/esm/` importierbar, auch solche, die nicht zur
gepflegten Oberfläche gehören. Konkret liefert `@modelcontextprotocol/sdk/spec.types.js` über diesen Pfad ein
`LATEST_PROTOCOL_VERSION` mit dem abweichenden Wert `DRAFT-2026-v1` statt der Laufzeitkonstante `2025-11-25`
(Belege in Abschnitt 2.1, Q19). **Dieser Pfad darf im Projekt nicht verwendet werden.** Protokollkonstanten, Schemata
und Typen kommen ausschließlich aus `@modelcontextprotocol/sdk/types.js` sowie den in dieser Tabelle benannten
Subpfaden.

**Verifizierter Packaging-Fehler:** Der Root-Export `.` zeigt auf `dist/esm/index.js`, diese Datei existiert im
veröffentlichten Tarball **nicht**. Ein `import ... from '@modelcontextprotocol/sdk'` scheitert mit
`ERR_MODULE_NOT_FOUND` (Q10). Alle Subpfade (`/server/mcp.js`, `/server/stdio.js`, `/types.js`, `/server`,
`/client/index.js`, `/server/streamableHttp.js`, `/validation`, `/experimental`) laden dagegen fehlerfrei (Q10).
Konsequenz: **niemals das Wurzelmodul importieren**.

---

## 3. Die Schema-Frage: Zod 3, Zod 4 oder etwas anderes

### 3.1 Was das package.json des SDK wirklich sagt

Wörtlich aus Q2 (`@modelcontextprotocol/sdk@1.30.0`):

```json
"dependencies": {
    "zod": "^3.25 || ^4.0",
    "zod-to-json-schema": "^3.25.1",
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
},
"peerDependencies": {
    "@cfworker/json-schema": "^4.1.1",
    "zod": "^3.25 || ^4.0"
},
"peerDependenciesMeta": {
    "@cfworker/json-schema": { "optional": true },
    "zod": { "optional": false }
}
```

Daraus folgt eindeutig:

1. **Zod ist eine nicht optionale Peer-Dependency** mit dem Bereich `^3.25 || ^4.0`.
   Sowohl Zod 3.25+ als auch Zod 4 sind zulässig.
2. Zod steht zusätzlich in `dependencies`. Das ist eine Doppelung, faktisch aber praktisch: npm installiert Zod
   auch dann, wenn das Projekt es vergisst. Für die eigene Implementierung ist Zod trotzdem **explizit** in die
   eigenen `dependencies` aufzunehmen, damit die Version im eigenen Lockfile festgeschrieben ist.
3. `@cfworker/json-schema` ist optional und nur für einen alternativen JSON-Schema-Validator nötig
   (Elicitation-Antworten). Ohne Angabe nutzt das SDK `AjvJsonSchemaValidator` (Q6, `ServerOptions.jsonSchemaValidator`).

### 3.2 In welcher Form das SDK Zod intern verwendet

Statische Auszählung der Importe im ESM-Bundle (Q10, `grep` über `dist/esm`):

| Importpfad | Anzahl Module | Rolle |
| --- | --- | --- |
| `zod/v4` | 13 | Kern: `types.js` und die übrigen Protokollschemata |
| `zod` | 3 | `server/mcp.js` und zwei Beispieldateien |
| `zod/v4-mini` | 2 | `toJSONSchema` in `zod-json-schema-compat.js`, plus `zod-compat.js` |
| `zod/v3` | 1 | ausschließlich Typimporte in `zod-compat.d.ts`/`.js` |

Die Aussage in Q12 deckt sich damit wörtlich:

> This SDK has a **required peer dependency** on `zod` for schema validation. The SDK internally imports from `zod/v4`,
> but maintains backwards compatibility with projects using Zod v3.25 or later. You can use either API in your code by
> importing from `zod/v3` or `zod/v4`.

Der Grund, warum `^3.25` funktioniert: Zod 3.25 liefert den Subpfad `zod/v4` bereits mit. Bei Zod 4 existieren
umgekehrt die Subpfade `zod/v3`, `zod/v4`, `zod/v4/core` und `zod/v4-mini` weiterhin (Q10, `exports` aus
`node_modules/zod/package.json`, geprüft mit Zod 4.6.2).

### 3.3 Welche Schematypen `registerTool` akzeptiert

Aus Q4 (`zod-compat.d.ts`), wörtlich:

```typescript
import type * as z3 from 'zod/v3';
import type * as z4 from 'zod/v4/core';

export type AnySchema = z3.ZodTypeAny | z4.$ZodType;
export type AnyObjectSchema = z3.AnyZodObject | z4.$ZodObject | AnySchema;
export type ZodRawShapeCompat = Record<string, AnySchema>;
```

Akzeptiert werden also je Feld sowohl Zod-3- als auch Zod-4-Schemata, und zwar in zwei Formen:

* als **Raw Shape**, also `{ feld: z.string() }`
* als **fertiges Objektschema**, also `z.object({ feld: z.string() })`

Beides wurde in einem echten Server-Client-Durchlauf verifiziert (Q10).
`normalizeObjectSchema` in Q4 wickelt Raw Shapes intern in ein Objektschema; fällt das aus (Unions, Intersections),
wird das Schema direkt geparst (Q3, `validateToolInput`).

### 3.4 Andere Schema-Bibliotheken

**In v1 nicht unterstützt.** Die Typen sind fest an Zod gebunden (Q4). Es gibt keinen Standard-Schema-Pfad.

**In v2 unterstützt.** Q11 wörtlich:

> Tool and prompt schemas use [Standard Schema](https://standardschema.dev/) — bring Zod v4, Valibot, ArkType, or any compatible library.

Die v2-Typdefinition präzisiert das (Q15):

```typescript
interface StandardSchemaWithJSON<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output> & StandardJSONSchemaV1.Props<Input, Output>;
}
```

Ein Schema muss also beides können: validieren (`~standard.validate`) **und** JSON Schema liefern
(`~standard.jsonSchema`, ein Objekt mit den Funktionen `input(options)` und `output(options)`).
Das wurde mit einem handgebauten, Zod-freien Schema unter v2 verifiziert: `tools/list` lieferte das handgeschriebene
JSON Schema, ein gültiger Aufruf lief durch, ein ungültiger erzeugte
`Input validation error: Invalid arguments for tool manual: n: n muss number sein` (Q10).

### 3.5 Erzeugtes JSON Schema, inklusive eines Spezifikationsverstoßes

Die Konvertierung erfolgt in `toJsonSchemaCompat` (Q4):

```javascript
export function toJsonSchemaCompat(schema, opts) {
    if (isZ4Schema(schema)) {
        return z4mini.toJSONSchema(schema, {
            target: mapMiniTarget(opts?.target),   // ohne opts.target -> 'draft-7'
            io: opts?.pipeStrategy ?? 'input'
        });
    }
    return zodToJsonSchema(schema, {              // Zod-3-Pfad, Paket zod-to-json-schema
        strictUnions: opts?.strictUnions ?? true,
        pipeStrategy: opts?.pipeStrategy ?? 'input'
    });
}
```

`mcp.js` ruft diese Funktion **ohne** `target` auf (Q3). Damit ist die Ausgabe immer Draft 07.
Auf der Leitung beobachtet (Q10, beide Zod-Linien):

```json
"inputSchema": { "type": "object", "properties": { ... }, "$schema": "http://json-schema.org/draft-07/schema#" }
```

Das widerspricht dem Kommentar im eigenen `ToolSchema` des SDK (Q8):

> A JSON Schema 2020-12 object defining the expected parameters for the tool.

**v2 macht es richtig:** dort liefert `tools/list` `"$schema": "https://json-schema.org/draft/2020-12/schema"` (Q10).

Weitere verifizierte Unterschiede zwischen den beiden Zod-Pfaden in v1 (Q10):

| Beobachtung | Zod 4 (4.6.2) | Zod 3 (3.25.76) |
| --- | --- | --- |
| `$schema` in `inputSchema` | draft-07 | draft-07 |
| `additionalProperties` in `inputSchema` (nicht-strikter `z.object`) | fehlt | `false` |
| `additionalProperties` in `outputSchema` | `false` | `false` |
| `.strict()`-Objekt in `inputSchema` | `additionalProperties: false`, Extraschlüssel werden abgelehnt | nicht getestet |
| Fehlertext bei falschem Typ | `Invalid input: expected number, received string at limit` | nicht getestet |

Ein Feld mit `.default(...)` erscheint **nicht** in `required` (Q10).

---

## 4. Serveraufbau: `McpServer` gegen `Server`

### 4.1 Wann welche Klasse

`McpServer` (Q3) ist die High-Level-Klasse mit `registerTool`, `registerResource`, `registerPrompt`, automatischer
Capability-Registrierung, Eingabe- und Ausgabevalidierung sowie automatischen `list_changed`-Benachrichtigungen.

Die Low-Level-Klasse `Server` trägt in 1.30.0 eine ausdrückliche Deprecation (Q6, wörtlich):

> `@deprecated Use `McpServer` instead for the high-level API. Only use `Server` for advanced use cases.`

**Empfehlung: immer `McpServer`.** Wer Low-Level-Fähigkeiten braucht (eigene Request-Handler, Sampling, Elicitation,
`registerCapabilities`), greift über `mcpServer.server` auf die darunterliegende `Server`-Instanz zu; diese ist als
`readonly server: Server` öffentlich (Q3). Damit entfällt jeder Grund, `new Server(...)` direkt zu instanziieren.

### 4.2 Lauffähiges Minimalbeispiel (v1, stdio)

Der Servercode dieses Beispiels wurde in der gezeigten Form kompiliert und gegen einen echten Client
ausgeführt (Q10). Alle Zugangsdaten sind Platzhalter. Der Werkzeugname ist hier an das verbindliche Namensschema aus
Abschnitt 10.4 Punkt 3 angepasst; im Testlauf trug das Werkzeug einen anderen Namen. Am verifizierten Verhalten
ändert der Name nichts. Ebenso angeglichen sind die vier Build- und Versionswerte der `package.json`
(`engines.node`, `typescript`, `build`, `bin`-Ziel), für die nach dem Hinweisblock in Abschnitt 10 nicht dieses
Dokument, sondern `toolchain.md` Abschnitt 3.3 maßgeblich ist (Q17). Die Abweichungen gegenüber dem Testlauf
stehen ausdrücklich unter dem Codeblock.

`package.json`:

```json
{
    "name": "buchhaltungsbutler-mcp",
    "version": "0.1.0",
    "type": "module",
    "bin": { "buchhaltungsbutler-mcp": "./dist/cli.js" },
    "files": ["dist"],
    "engines": { "node": ">=22.12.0" },
    "scripts": {
        "build": "tsdown",
        "typecheck": "tsc --noEmit"
    },
    "dependencies": {
        "@modelcontextprotocol/sdk": "1.30.0",
        "zod": "^4.6.2"
    },
    "devDependencies": {
        "@types/node": "^22.12.0",
        "tsdown": "0.23.0",
        "typescript": "6.0.3"
    }
}
```

**Abweichungen dieser `package.json` vom verifizierten Testlauf, ausdrücklich gekennzeichnet:** Im Lauf nach
Abschnitt 11 wurde mit `tsc` nach `dist/index.js` gebaut, und `engines`, `bin` sowie die TypeScript-Version
trugen andere Werte (dort TypeScript 7.0.2). Die oben gezeigten Werte für `engines.node`, `typescript`, `build`
und `bin` sind die für dieses Projekt verbindlichen aus `toolchain.md` Abschnitt 3.3 (Q17). Sie berühren nichts
am verifizierten Laufzeitverhalten des Servers, weil sie ausschließlich Build und Auslieferung betreffen; das
Verhalten von `McpServer`, `registerTool` und `StdioServerTransport` ist davon unabhängig. Setzt `tsdown` den
Dateimodus der `bin`-Datei nicht selbst auf 755, folgt im `build`-Skript ein expliziter Schritt
`chmod 755 dist/cli.js` (Q17, 3.3 Punkt 3). Ob `tsdown` den Modus selbst setzt, ist **nicht verifiziert**.

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "types": ["node"],
        "strict": true,
        "outDir": "./dist",
        "rootDir": "./src",
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
    },
    "include": ["src/**/*.ts"]
}
```

Diese `tsconfig.json` stammt aus dem Testlauf mit `tsc` als Build. Beim verbindlichen Build über `tsdown` dient
`tsc` nur noch dem Typecheck (`tsc --noEmit`), `outDir` und `rootDir` steuern dann keine Auslieferung mehr; die
vollständige, für dieses Projekt empfohlene Optionsliste steht in `toolchain.md` Abschnitt 2.2 (Q17).

`src/cli.ts`, also die Datei, auf die `bin` zeigt:

```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const server = new McpServer(
    { name: 'buchhaltungsbutler', version: '0.1.0', title: 'BuchhaltungsButler' },
    {
        instructions: 'Zugriff auf die BuchhaltungsButler-API.',
        capabilities: { logging: {} }
    }
);

server.registerTool(
    'bb_postings_search',
    {
        title: 'Buchungen auflisten',
        description: 'Listet Buchungen im angegebenen Zeitraum.',
        inputSchema: {
            von: z.string().date().describe('Startdatum, ISO 8601'),
            bis: z.string().date().describe('Enddatum, ISO 8601'),
            limit: z.number().int().min(1).max(200).default(50)
        },
        outputSchema: {
            gesamt: z.number().int(),
            buchungen: z.array(z.object({ id: z.string(), betrag: z.number() }))
        },
        annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (args, extra): Promise<CallToolResult> => {
        extra.signal.throwIfAborted();

        const nutzlast = {
            gesamt: 0,
            buchungen: [] as Array<{ id: string; betrag: number }>
        };

        return {
            content: [{ type: 'text', text: JSON.stringify(nutzlast, null, 2) }],
            structuredContent: nutzlast
        };
    }
);

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    let heruntergefahren = false;
    const herunterfahren = async (signal: NodeJS.Signals): Promise<void> => {
        if (heruntergefahren) return;
        heruntergefahren = true;
        process.stderr.write(`[mcp] ${signal} empfangen, schließe Verbindung\n`);
        try {
            await server.close();
        } finally {
            process.exit(0);
        }
    };

    process.on('SIGINT', () => void herunterfahren('SIGINT'));
    process.on('SIGTERM', () => void herunterfahren('SIGTERM'));
}

main().catch((fehler: unknown) => {
    process.stderr.write(`[mcp] Startfehler: ${String(fehler)}\n`);
    process.exit(1);
});
```

Anmerkungen zum Beispiel, alle belegt:

* `connect(transport)` startet den Transport selbst. `transport.start()` darf **nicht** zusätzlich aufgerufen werden,
  sonst wirft `StdioServerTransport.start()` den Fehler
  `StdioServerTransport already started! If using Server class, note that connect() calls start() automatically.` (Q5).
* `server.close()` ruft `this._transport?.close()` auf (Q7, `Protocol.close`). Ein separates Schließen des Transports
  ist unnötig.
* `main().catch(...)` fängt Startfehler ab. Ohne diesen Fang beendet Node 22 den Prozess bei einer unbehandelten
  Rejection mit Exitcode 1 und Stacktrace auf stderr (Q10, geprüft mit Node v22.23.2).
* Ein zweites `connect()` auf derselben Instanz wirft
  `Already connected to a transport. Call close() before connecting to a new transport, ...` (Q7).

---

## 5. `registerTool` im Detail

### 5.1 Signatur

Wörtlich aus Q3 (`mcp.d.ts`):

```typescript
registerTool<
    OutputArgs extends ZodRawShapeCompat | AnySchema,
    InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined
>(
    name: string,
    config: {
        title?: string;
        description?: string;
        inputSchema?: InputArgs;
        outputSchema?: OutputArgs;
        annotations?: ToolAnnotations;
        _meta?: Record<string, unknown>;
    },
    cb: ToolCallback<InputArgs>
): RegisteredTool;
```

| Feld | Typ | Wirkung | Quelle |
| --- | --- | --- | --- |
| `name` | `string` | Werkzeugname auf der Leitung. Eindeutig; ein zweites `registerTool` mit gleichem Namen wirft `Error: Tool <name> is already registered`. | Q3 |
| `config.title` | `string?` | Menschenlesbarer Anzeigename, erscheint als `title` in `tools/list`. | Q3, Q10 |
| `config.description` | `string?` | Beschreibung für das Modell. | Q3, Q10 |
| `config.inputSchema` | Raw Shape oder Zod-Schema | Wird zu JSON Schema konvertiert und vor jedem Aufruf zur Validierung benutzt. Fehlt es, meldet `tools/list` `{"type":"object","properties":{}}`. | Q3, Q10 |
| `config.outputSchema` | Raw Shape oder Zod-Schema | Erzwingt `structuredContent` in jedem erfolgreichen Ergebnis. | Q3, Q10 |
| `config.annotations` | `ToolAnnotations?` | `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. Alles nur Hinweise. | Q8 |
| `config._meta` | `Record<string, unknown>?` | Wird unverändert in `tools/list` durchgereicht. | Q3, Q10 |
| `cb` | `ToolCallback<InputArgs>` | Der Handler. | Q3 |

`ToolAnnotations` mit den im SDK dokumentierten Vorgabewerten (Q8):

| Feld | Typ | Default laut Kommentar |
| --- | --- | --- |
| `title` | `string?` | ohne Vorgabewert |
| `readOnlyHint` | `boolean?` | `false` |
| `destructiveHint` | `boolean?` | `true` (nur sinnvoll, wenn `readOnlyHint == false`) |
| `idempotentHint` | `boolean?` | `false` (nur sinnvoll, wenn `readOnlyHint == false`) |
| `openWorldHint` | `boolean?` | `true` |

Das SDK setzt bei `registerTool` zusätzlich immer `execution: { taskSupport: 'forbidden' }` und sendet dieses Feld
in `tools/list` mit (Q3, Q10). Es ist über die Config **nicht** steuerbar; Task-Unterstützung läuft über die
experimentelle API `server.experimental.tasks` (Q3), die hier nicht benutzt wird.

### 5.2 Namensregeln

`_createRegisteredTool` ruft `validateAndWarnToolName(name)` (Q3, Q9). Die Regel (Q9):

```javascript
const TOOL_NAME_REGEX = /^[A-Za-z0-9._-]{1,128}$/;
```

Verstöße werden **nur** über `console.warn` gemeldet, die Registrierung läuft trotzdem durch (Q9).
`console.warn` schreibt in Node nach stderr, gefährdet den stdio-Transport also nicht.
Zusätzliche Warnungen gibt es für Leerzeichen, Kommata sowie führende oder abschließende `-` und `.`.

Diese SDK-Regel ist **keine** Vorgabe für unsere Namen. Sie beschreibt nur, was der Server ohne Warnung
durchlässt. Verbindlich ist das engere Schema `bb_<ressource>_<verb>[_<qualifizierer>]` mit
`^[a-z][a-z0-9_]{2,39}$` aus `tool-design.md` 4.2, 4.3 und 11.2, weil die dort in 4.1 belegte
Anthropic-Tool-Namensregel `^[a-zA-Z0-9_-]{1,128}$` Punkte verbietet. Siehe Abschnitt 10.4 Punkt 3.
Werkzeugnamen, die in diesem Dokument in Mitschnitten echter Testläufe auftauchen (etwa `noop` oder
`probe.list` in den Abschnitten 5.4 und 5.5), stammen aus dem Probeaufbau nach Abschnitt 11 und sind
keine Vorlage für unsere Namensgebung.

### 5.3 Was der Callback zurückgeben muss

Der Rückgabetyp ist `CallToolResult` (Q8):

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `content` | `ContentBlock[]`, Default `[]` | Pflicht, wenn kein `outputSchema` definiert ist. Union aus `TextContent`, `ImageContent`, `AudioContent`, `ResourceLink`, `EmbeddedResource`. |
| `structuredContent` | `Record<string, unknown>?` | Pflicht, sobald ein `outputSchema` definiert ist. |
| `isError` | `boolean?` | Nicht gesetzt bedeutet Erfolg. |
| `_meta` | optional | wird durchgereicht (Q10 bestätigt). |

Der Doc-Kommentar am `ToolCallback`-Typ formuliert es so (Q3, wörtlich):

> The callback should return:
> - `structuredContent` if the tool has an outputSchema defined
> - `content` if the tool does not have an outputSchema
> - Both fields are optional but typically one should be provided

**Praktische Regel, die aus dem Code folgt:** mit `outputSchema` immer **beides** liefern. `structuredContent` für die
maschinelle Weiterverarbeitung, `content` mit der JSON-Serialisierung als Fallback für Clients, die
`structuredContent` nicht auswerten. Das CallToolResult-Schema hält `content` ausdrücklich aus
Abwärtskompatibilität immer präsent (Q8).

### 5.4 Zusammenspiel von `structuredContent` und `outputSchema`

`validateToolOutput` (Q3, wörtlich gekürzt):

```javascript
async validateToolOutput(tool, result, toolName) {
    if (!tool.outputSchema) return;
    if (!('content' in result)) return;           // Task-Ergebnisse werden übersprungen
    if (result.isError) return;                   // Fehlerergebnisse werden nicht validiert
    if (!result.structuredContent) {
        throw new McpError(ErrorCode.InvalidParams,
            `Output validation error: Tool ${toolName} has an output schema but no structured content was provided`);
    }
    const outputObj = normalizeObjectSchema(tool.outputSchema);
    const parseResult = await safeParseAsync(outputObj, result.structuredContent);
    if (!parseResult.success) { /* McpError InvalidParams */ }
}
```

Auf der Leitung beobachtet (Q10), wenn `outputSchema` gesetzt ist und `structuredContent` fehlt:

```json
{"content":[{"type":"text","text":"MCP error -32602: Output validation error: Tool noop has an output schema but no structured content was provided"}],"isError":true}
```

Wichtig: Der Aufrufer bekommt **keinen** JSON-RPC-Fehler, sondern ein `CallToolResult` mit `isError: true`.

### 5.5 Wie man einen Fehler korrekt signalisiert

Es gibt drei Wege, und sie verhalten sich unterschiedlich:

**Weg 1, der empfohlene: `isError: true` zurückgeben.**

```typescript
server.registerTool('bb_postings_create', { /* ... */ }, async (args) => {
    try {
        const antwort = await apiAufruf(args);
        return { content: [{ type: 'text', text: JSON.stringify(antwort) }] };
    } catch (fehler: unknown) {
        const text = fehler instanceof Error ? fehler.message : String(fehler);
        return {
            content: [{ type: 'text', text: `Fehler: ${text}` }],
            isError: true
        };
    }
});
```

Q13 dokumentiert genau dieses Muster. Die Begründung steht im CallToolResult-Schema selbst (Q8, wörtlich):

> Any errors that originate from the tool SHOULD be reported inside the result object, with `isError` set to true,
> _not_ as an MCP protocol-level error response. Otherwise, the LLM would not be able to see that an error occurred
> and self-correct.

**Weg 2: eine Exception werfen.** Das SDK fängt jede Exception im `tools/call`-Handler und verwandelt sie in
`{ content: [{ type: 'text', text: <message> }], isError: true }` (Q3, `createToolError`). Das funktioniert, verliert
aber jede Struktur und kann interne Details preisgeben. Für die eigene Implementierung ist Weg 1 verbindlich.

**Weg 3: `McpError` werfen.** Wird ebenfalls in ein `isError`-Ergebnis verwandelt, mit dem Präfix `MCP error <code>: `
im Text (Q3, Q10). Einzige Ausnahme: `ErrorCode.UrlElicitationRequired` wird unverändert als Protokollfehler
weitergereicht (Q3).

`ErrorCode` vollständig (Q8):

| Name | Wert |
| --- | --- |
| `ConnectionClosed` | `-32000` |
| `RequestTimeout` | `-32001` |
| `UrlElicitationRequired` | `-32042` |
| `ParseError` | `-32700` |
| `InvalidRequest` | `-32600` |
| `MethodNotFound` | `-32601` |
| `InvalidParams` | `-32602` |
| `InternalError` | `-32603` |

Eingabevalidierungsfehler landen ebenfalls als `isError`-Ergebnis, nicht als Protokollfehler (Q10):

```json
{"content":[{"type":"text","text":"MCP error -32602: Input validation error: Invalid arguments for tool probe.list: Invalid input: expected number, received string at limit"}],"isError":true}
```

### 5.6 Die ältere Form `server.tool(...)`

`McpServer.tool()` existiert in sechs Überladungen und trägt an **jeder** den Hinweis
`@deprecated Use registerTool instead.` (Q3). Die Argumente werden positionsbasiert erraten, was das SDK selbst
kommentiert (Q3, wörtlich):

> Note: We use a union type for the second parameter because TypeScript cannot reliably disambiguate between
> ToolAnnotations and ZodRawShapeCompat during overload resolution, as both are plain object types.

Und im Implementierungscode (Q3, wörtlich):

> Support for this style is frozen as of protocol version 2025-03-26. Future additions to tool definition should *NOT* be added.

Es gibt keine Möglichkeit, `title`, `outputSchema` oder `_meta` über `tool()` zu setzen.

**Empfohlen ist ausschließlich `registerTool`.** `tool()` ist nur zum Lesen fremden Codes relevant.

### 5.7 `RegisteredTool`: nachträgliche Änderungen

`registerTool` liefert ein `RegisteredTool` zurück (Q3):

```typescript
type RegisteredTool = {
    enabled: boolean;
    enable(): void;
    disable(): void;
    update(updates: { name?: string | null; title?: string; description?: string;
        paramsSchema?: ...; outputSchema?: ...; annotations?: ToolAnnotations;
        _meta?: ...; callback?: ...; enabled?: boolean }): void;
    remove(): void;
    /* plus die gespeicherten Felder */
};
```

Jeder dieser Aufrufe löst automatisch `sendToolListChanged()` aus (Q3). `remove()` ist `update({ name: null })`.
Ein deaktiviertes Werkzeug verschwindet aus `tools/list` und beantwortet `tools/call` mit
`Tool <name> disabled` (Q3).

---

## 6. `registerResource` und `registerPrompt`

### 6.1 `registerResource`

Zwei Überladungen (Q3):

```typescript
registerResource(name: string, uriOrTemplate: string,
    config: ResourceMetadata, readCallback: ReadResourceCallback): RegisteredResource;

registerResource(name: string, uriOrTemplate: ResourceTemplate,
    config: ResourceMetadata, readCallback: ReadResourceTemplateCallback): RegisteredResourceTemplate;
```

`ResourceMetadata = Omit<Resource, 'uri' | 'name'>` (Q3). Die verfügbaren Felder aus `ResourceSchema` (Q8):
`title`, `description`, `mimeType`, `size`, `annotations`, `icons`, `_meta`.

Callback-Signaturen (Q3):

```typescript
type ReadResourceCallback =
    (uri: URL, extra: RequestHandlerExtra<ServerRequest, ServerNotification>)
        => ReadResourceResult | Promise<ReadResourceResult>;

type ReadResourceTemplateCallback =
    (uri: URL, variables: Variables, extra: RequestHandlerExtra<ServerRequest, ServerNotification>)
        => ReadResourceResult | Promise<ReadResourceResult>;
```

`ReadResourceResult` ist `{ contents: Array<TextResourceContents | BlobResourceContents> }` (Q8).

Beispiel, so ausgeführt (Q10):

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

// Feste URI
server.registerResource(
    'bhb-konten',
    'bhb://konten',
    { title: 'Kontenrahmen', description: 'Alle Sachkonten', mimeType: 'application/json' },
    async (uri) => ({
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify([]) }]
    })
);

// Template mit Auflistung und Vervollständigung
server.registerResource(
    'bhb-beleg',
    new ResourceTemplate('bhb://beleg/{id}', {
        list: async () => ({ resources: [{ uri: 'bhb://beleg/1', name: 'beleg-1' }] }),
        complete: { id: async (wert) => ['1', '2'].filter((v) => v.startsWith(wert)) }
    }),
    { title: 'Beleg', mimeType: 'application/json' },
    async (uri, variables) => ({
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(variables) }]
    })
);
```

Beobachtetes Verhalten (Q10):

* `resources/list` liefert die feste Ressource **und** die vom `list`-Callback des Templates gemeldeten Einträge.
* `resources/templates/list` liefert den Template-Eintrag mit `uriTemplate`.
* Wird ein `ResourceTemplate` angelegt, ist `list` ein Pflichtfeld, darf aber `undefined` sein. Der Kommentar im SDK
  begründet das (Q3, wörtlich): „This is required to specified, even if `undefined`, to avoid accidentally
  forgetting resource listing.“
* `registerResource` schaltet automatisch die `resources`-Capability samt `listChanged` frei.
  Bei Templates mit `complete` kommt zusätzlich `completions: {}` dazu (Q10, beobachtete Server-Capabilities).

Die vier Überladungen von `server.resource(...)` sind samt und sonders `@deprecated Use registerResource instead.` (Q3).

### 6.2 `registerPrompt`

```typescript
registerPrompt<Args extends PromptArgsRawShape>(
    name: string,
    config: { title?: string; description?: string; argsSchema?: Args },
    cb: PromptCallback<Args>
): RegisteredPrompt;
```

(Q3.) `PromptArgsRawShape` ist `ZodRawShapeCompat`, also `Record<string, AnySchema>`.
Anders als bei `registerTool` wird hier **kein** fertiges `z.object(...)` akzeptiert, sondern nur ein Raw Shape.

Rückgabe ist `GetPromptResult` (Q8):

```typescript
{ description?: string; messages: Array<{ role: 'user' | 'assistant'; content: ContentBlock }> }
```

Beispiel, so ausgeführt (Q10):

```typescript
server.registerPrompt(
    'bhb-monatsabschluss',
    {
        title: 'Monatsabschluss prüfen',
        description: 'Erzeugt eine Prüfanweisung für einen Monat.',
        argsSchema: { monat: z.string().describe('Monat im Format YYYY-MM') }
    },
    async (args) => ({
        messages: [{ role: 'user', content: { type: 'text', text: `Prüfe ${args.monat}.` } }]
    })
);
```

Auf der Leitung wird daraus (Q10):

```json
{ "name": "bhb-monatsabschluss", "title": "Monatsabschluss prüfen",
  "description": "Erzeugt eine Prüfanweisung für einen Monat.",
  "arguments": [{ "name": "monat", "required": true }] }
```

Für Argumentvervollständigung existiert `completable` aus `@modelcontextprotocol/sdk/server/completable.js` (Q4-Umfeld,
Typdefinition `completable.d.ts`):

```typescript
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';

argsSchema: {
    konto: completable(z.string(), async (wert) => alleKonten.filter((k) => k.startsWith(wert)))
}
```

Die vier Überladungen von `server.prompt(...)` sind ebenfalls `@deprecated Use registerPrompt instead.` (Q3).

---

## 7. Fehlerbehandlung, Logging, Progress, Cancellation, `RequestHandlerExtra`

### 7.1 `RequestHandlerExtra`

Deklaration (Q7) und zur Laufzeit tatsächlich vorhandene Schlüssel (Q10, in einem `tools/call`-Handler ausgelesen):

```text
_meta, authInfo, closeSSEStream, closeStandaloneSSEStream, requestId, requestInfo,
sendNotification, sendRequest, sessionId, signal, taskId, taskRequestedTtl, taskStore
```

| Feld | Typ | Bedeutung | Anmerkung |
| --- | --- | --- | --- |
| `signal` | `AbortSignal` | wird abgebrochen, wenn der Client storniert | verifiziert, siehe 7.4 |
| `requestId` | `RequestId` | JSON-RPC-Id des laufenden Requests | |
| `_meta` | `RequestMeta?` | `_meta` des Requests, enthält u. a. `progressToken` | **nur vorhanden, wenn der Client `_meta` mitgeschickt hat** (Q10) |
| `sessionId` | `string?` | Session-Id des Transports | bei stdio `undefined` |
| `authInfo` | `AuthInfo?` | validiertes Token | nur bei HTTP-Transporten |
| `requestInfo` | `RequestInfo?` | die ursprüngliche HTTP-Anfrage | nur bei HTTP-Transporten |
| `sendNotification` | `(n) => Promise<void>` | Benachrichtigung im Kontext des Requests | |
| `sendRequest` | `(req, resultSchema, opts) => Promise<...>` | Request an den Client | |
| `closeSSEStream`, `closeStandaloneSSEStream` | `(() => void)?` | nur StreamableHTTP mit `eventStore` | |
| `taskId`, `taskStore`, `taskRequestedTtl` | experimentell | Tasks-API | nicht benutzen |

### 7.2 Logging über `sendLoggingMessage`

Signatur (Q3, Q6):

```typescript
sendLoggingMessage(params: LoggingMessageNotification['params'], sessionId?: string): Promise<void>;
```

`params` besteht aus `level` (Pflicht), `data` (beliebiger JSON-Wert) und optional `logger` (Q8).

Die Stufen in aufsteigender Schwere (Q8, `LoggingLevelSchema`):
`debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.

**Zwei Fallen, beide im Code belegt (Q6):**

```javascript
async sendLoggingMessage(params, sessionId) {
    if (this._capabilities.logging) {
        if (!this.isMessageIgnored(params.level, sessionId)) {
            return this.notification({ method: 'notifications/message', params });
        }
    }
}
```

1. Ohne `capabilities: { logging: {} }` im Konstruktor ist der Aufruf ein **stiller No-Op**. Keine Nachricht, kein Fehler.
   `registerTool` und Co. schalten nur `tools`, `resources`, `prompts` und `completions` frei, **nicht** `logging` (Q3).
   `logging` muss also von Hand in `ServerOptions.capabilities` stehen.
2. Ist `logging` deklariert, registriert der `Server` automatisch einen Handler für `logging/setLevel` und filtert
   danach pro Session (Q6). Ohne Client-Aufruf wird **nichts** gefiltert (`isMessageIgnored` liefert dann `false`).

Wer stattdessen `server.server.notification({ method: 'notifications/message', ... })` direkt ruft und `logging` nicht
deklariert hat, erhält einen harten Fehler: `Server does not support logging (required for notifications/message)` (Q6).

Verifiziert (Q10): nach `logging/setLevel` mit `debug` kam eine `warning`-Nachricht mit `logger`-Feld korrekt beim
Client an.

**Für stdio ist `console.error` bzw. `process.stderr.write` die robustere Wahl** für Diagnose, weil es unabhängig von
Capabilities, Client-Filtern und Verbindungszustand funktioniert. Q16 empfiehlt das ausdrücklich, siehe 8.1.

### 7.3 Progress

Verifiziertes Muster (Q10):

```typescript
async (args, extra) => {
    const token = extra._meta?.progressToken;
    if (token !== undefined) {
        await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken: token, progress: 1, total: 5 }
        });
    }
    // ...
}
```

Beobachtungen (Q10):

* `extra._meta.progressToken` ist **nur** gesetzt, wenn der Client die Anfrage mit `onprogress` gestellt hat.
  Ohne `onprogress` war `extra._meta` komplett `undefined`.
* `notifications/progress` benötigt keine Capability; `assertNotificationCapability` lässt sie immer durch (Q6, Kommentar
  wörtlich: „Progress notifications are always allowed“).
* Der Client kann pro Anfrage `resetTimeoutOnProgress: true` setzen, dann verlängert jede Progress-Meldung den Timeout
  (Q7, `RequestOptions`). Der Standardtimeout ist `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` (Q7).

### 7.4 Cancellation

`extra.signal` ist ein echter `AbortSignal`. Verifiziert (Q10): der Client brach eine laufende Anfrage per
`AbortController` ab, der Server sah im nächsten Schleifendurchlauf `extra.signal.aborted === true`. Der Client erhielt
`McpError: MCP error -32001: Error: user cancel`.

Verbindliches Muster für jeden Handler mit Netzwerkzugriff:

```typescript
async (args, extra) => {
    extra.signal.throwIfAborted();
    const antwort = await fetch(url, { signal: extra.signal, headers: { /* Platzhalter */ } });
    // ...
}
```

`AbortSignal` direkt an `fetch` durchreichen ist der sauberste Weg, weil damit auch die HTTP-Verbindung abgebrochen wird.

---

## 8. Typische Fallstricke mit Gegenmitteln

### 8.1 Ausgaben auf stdout zerstören den stdio-Transport

Die offizielle Dokumentation ist eindeutig (Q16, wörtlich):

> **For STDIO-based servers:** Never use `console.log()`, as it writes to standard output (stdout) by default.
> Writing to stdout will corrupt the JSON-RPC messages and break your server.
> [...] Use `console.error()` which writes to stderr, or use a logging library that writes to stderr or files.

Selbst reproduziert (Q10): ein Server mit einem einzigen `console.log('Server startet...')` vor `connect()` löste beim
Client sofort aus:

```text
TRANSPORT_ERROR Unexpected token 'S', "Server startet..." is not valid JSON
```

Im Test blieb die Verbindung anschließend nutzbar, weil die Störung genau eine ganze Zeile war und der SDK-Client
den Parse-Fehler nur über `onerror` meldete. Das ist **kein** Verlass: fremde Clients brechen häufig ab, und eine
Ausgabe mitten in einer Nachricht zerstört das Framing dauerhaft.

Gegenmittel, verbindlich:

1. Nie `console.log`, `console.info`, `console.debug`, `process.stdout.write` im Serverprozess.
2. Diagnose ausschließlich über `process.stderr.write` oder `console.error`.
3. Alle Fremdbibliotheken prüfen, die Banner oder Warnungen ausgeben.
4. Optionaler Härte-Riegel direkt nach dem Start, vor `connect()`:

```typescript
// Guard: verhindert, dass Fremdcode den stdio-Rahmen zerstört.
const echtesStdoutWrite = process.stdout.write.bind(process.stdout);
let stdoutFreigegeben = false;
process.stdout.write = ((...args: Parameters<typeof echtesStdoutWrite>) => {
    if (stdoutFreigegeben) return echtesStdoutWrite(...args);
    process.stderr.write('[mcp] stdout-Schreibversuch unterdrückt\n');
    return true;
}) as typeof process.stdout.write;

// StdioServerTransport bekommt den unveränderten Writer.
const transport = new StdioServerTransport(process.stdin, {
    write: (chunk: string, cb?: () => void) => { stdoutFreigegeben = true;
        const r = echtesStdoutWrite(chunk, cb); stdoutFreigegeben = false; return r; },
    once: (ereignis: string, cb: () => void) => process.stdout.once(ereignis, cb)
} as unknown as NodeJS.WritableStream);
```

Dieser Guard ist ein **Vorschlag, nicht verifiziert**. `StdioServerTransport` nimmt laut Q5 einen beliebigen `Writable`
als zweites Konstruktorargument und benutzt davon nur `write()` und `once('drain', ...)` (Q5), das Muster ist also
plausibel. Vor Übernahme selbst testen. Die einfachere und sicher belegte Alternative ist ein Lint-Verbot
(`no-console` mit Ausnahme für `error`) plus Code-Review.

### 8.2 Shebang und ausführbares Bit bei npx-Installationen

Selbst reproduziert mit `npm pack` plus Installation des Tarballs (Q10, npm 10.9.8):

| Variante | Modus der installierten Datei | Aufruf über `node_modules/.bin/<name>` |
| --- | --- | --- |
| Quelle `0644`, **ohne** Shebang | `-rwxr-xr-x` | scheitert: `syntax error near unexpected token` (die Shell interpretiert JavaScript) |
| Quelle `0644`, **mit** `#!/usr/bin/env node` | `-rwxr-xr-x` | läuft korrekt |

Zwei Erkenntnisse daraus:

1. **npm setzt das Ausführungsbit selbst.** Die Quelle hatte `0644`, installiert wurde `0755`. Ein `chmod 755` im
   Buildskript schadet nicht, ist aber nicht die Ursache des Problems.
2. **Der Shebang ist der entscheidende Teil.** Ohne ihn versucht die Shell, die Datei selbst auszuführen.

`tsc` übernimmt den Shebang aus der `.ts`-Quelle unverändert in die Ausgabedatei (Q10, verifiziert).

Verbindlich: erste Zeile der Bin-Datei ist `#!/usr/bin/env node`, `package.json` enthält `"files": ["dist"]` und
ein `"bin"`, das auf `./dist/cli.js` zeigt. Gebaut wird mit `tsdown`, nicht mit `tsc`; der Typecheck läuft
getrennt über `tsc --noEmit`. Shebang und Dateimodus 755 der `bin`-Datei sind dabei sicherzustellen, notfalls
über einen expliziten Schritt `chmod 755 dist/cli.js` im `build`-Skript. Maßgeblich ist dafür `toolchain.md`
Abschnitt 3.3, Punkte 3 und 4 (Q17), nicht dieses Dokument. Q16 nennt an dieser Stelle
`tsc && chmod 755 dist/index.js`; das ist die Quickstart-Fassung und für dieses Projekt nicht verbindlich.

### 8.3 ESM-Importpfade mit `.js`-Endung

Unter `moduleResolution: NodeNext` müssen relative Importe die Endung `.js` tragen, auch wenn die Quelle `.ts` ist.

Für die SDK-Subpfade gilt eine gemeine Sonderfalle, die selbst reproduziert wurde (Q10):

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';    // TypeScript: OK
```

```text
Laufzeit: ERR_MODULE_NOT_FOUND
Cannot find module '.../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp'
```

Ursache: `typesVersions` im SDK-`package.json` bildet `*` auf `./dist/esm/*` ab, wodurch TypeScript den
endungslosen Pfad auflöst. Der `exports`-Eintrag `./*` -> `./dist/esm/*` liefert zur Laufzeit dagegen einen Pfad
ohne Endung, den Node nicht findet. **Der Typecheck bleibt grün, der Prozess stirbt beim Start.**

Gegenmittel:

* Immer `@modelcontextprotocol/sdk/server/mcp.js`, `.../server/stdio.js`, `.../types.js` schreiben.
* Nie `@modelcontextprotocol/sdk` ohne Subpfad importieren (Root-Export defekt, siehe 2.2).
* Einen Smoke-Test in die CI aufnehmen, der den gebauten Server tatsächlich startet. Ein reiner `tsc --noEmit` fängt
  diese Klasse von Fehlern nicht.

### 8.4 Top-Level await

Funktioniert in ESM-Modulen mit `target: ES2022` und `module: NodeNext` (Q10, in mehreren Testservern benutzt).
Trotzdem ist die `main()`-Funktion mit explizitem `.catch()` vorzuziehen, weil ein Fehler im Top-Level-await zu einer
unbehandelten Rejection mit rohem Stacktrace auf stderr führt und der Prozess mit Exitcode 1 endet, ohne dass
aufgeräumt wird.

### 8.5 Unbehandelte Promise-Rejections

Node 22 beendet den Prozess bei einer unbehandelten Rejection mit Exitcode 1 (Q10, geprüft mit Node v22.23.2).
Für einen MCP-Server bedeutet das: der Client verliert die Verbindung, oft ohne verwertbare Meldung.

Gegenmittel:

```typescript
process.on('unhandledRejection', (grund: unknown) => {
    process.stderr.write(`[mcp] unhandledRejection: ${String(grund)}\n`);
    process.exitCode = 1;
});

process.on('uncaughtException', (fehler: Error) => {
    process.stderr.write(`[mcp] uncaughtException: ${fehler.stack ?? fehler.message}\n`);
    process.exit(1);
});
```

Der Handler ersetzt keine ordentliche Fehlerbehandlung; er sorgt nur dafür, dass ein Absturz auf stderr
nachvollziehbar bleibt. Zusätzlich gilt: `sendLoggingMessage` und `sendNotification` liefern Promises. Jeder
`void`-Aufruf ohne `.catch()` ist eine potenzielle unbehandelte Rejection.

### 8.6 Signalbehandlung und Prozessende

Beobachtet (Q5, Q10):

* `StdioServerTransport` registriert Handler für `'data'` und `'error'` auf stdin, aber **keinen** für `'end'` oder
  `'close'` (Q5).
* Im Test beendete sich der Serverprozess dennoch mit Code 0, nachdem der Elternprozess stdin geschlossen hatte (Q10).
  Grund: nach dem Ende von stdin hielt nichts mehr die Event-Loop offen.
* Sobald der Server einen Timer, einen offenen HTTP-Agenten mit Keep-Alive oder einen Watcher hält, gilt das
  **nicht mehr**. Dann bleibt der Prozess als Zombie stehen.

Verbindliches Gegenmittel, zusätzlich zu SIGINT und SIGTERM aus Abschnitt 4.2:

```typescript
process.stdin.on('end', () => void herunterfahren('SIGTERM' as NodeJS.Signals));
process.stdin.on('close', () => void herunterfahren('SIGTERM' as NodeJS.Signals));
```

Weitere Punkte:

* `server.close()` schließt den Transport (Q7). `StdioServerTransport.close()` entfernt die eigenen Listener und
  pausiert stdin nur dann, wenn keine anderen `'data'`-Listener mehr vorhanden sind (Q5).
* Der Handler muss idempotent sein, weil SIGINT und stdin-`end` kurz hintereinander kommen können.
* Unter Windows gibt es kein SIGTERM im Unix-Sinn. Das ist **nicht verifiziert** und für den geplanten Einsatz auf
  macOS und Linux ohne Belang; falls Windows relevant wird, muss es getestet werden.

### 8.7 Weitere verifizierte Stolpersteine

| Problem | Verhalten | Gegenmittel |
| --- | --- | --- |
| Root-Import `@modelcontextprotocol/sdk` | `ERR_MODULE_NOT_FOUND`, Datei `dist/esm/index.js` fehlt im Tarball (Q10) | nur Subpfade importieren |
| Doppelte Werkzeugregistrierung | `Error: Tool <name> is already registered` beim Start (Q3) | Namen zentral verwalten |
| Werkzeugname mit Sonderzeichen | nur `console.warn`, Registrierung läuft weiter (Q9) | Namen nach dem engeren Projektschema `^[a-z][a-z0-9_]{2,39}$` vergeben, siehe 5.2 und 10.4 Punkt 3 |
| `outputSchema` ohne `structuredContent` | jeder Aufruf endet als `isError` (Q10) | beide Felder immer gemeinsam liefern |
| `sendLoggingMessage` ohne `capabilities.logging` | stiller No-Op (Q6) | `capabilities: { logging: {} }` setzen |
| `transport.start()` nach `connect()` | `StdioServerTransport already started!` (Q5) | `connect()` startet den Transport |
| Nachricht größer als 10 MB | Transport meldet Fehler und schließt (Q5, `maxBufferSize`, Default 10 MB) | große Nutzlasten paginieren oder als Ressource anbieten |
| JSON Schema ist Draft 07 statt 2020-12 | v1 setzt `target` nicht (Q4, Q10) | bekannt und dokumentiert; in v2 behoben |

### 8.8 Nicht parsebare Zeilen auf stdin verschwinden spurlos

**Gemessen am 2026-09-13** gegen `@modelcontextprotocol/server@2.0.0` aus `node_modules` und
zusätzlich gegen den gebauten Server dieses Projekts. Für diesen Fall gibt es **kein
Gegenmittel**; der Abschnitt hält eine Grenze fest statt eines Fallstricks, den man umgehen
könnte.

Eine Zeile auf `stdin`, die kein gültiges JSON ist, wird ohne jede Reaktion verworfen: keine
JSON-RPC-Fehlerantwort mit Code `-32700`, keine Zeile auf `stderr`, kein Abbruch. Gemessen am
gebauten Server: 0 Zeichen auf `stdout`, auf `stderr` nur die Zeilen, die dieser Server beim
Start ohnehin schreibt, Rückgabewert 0. Der Nachrichtenstrom bleibt dabei intakt — ein
unmittelbar auf die kaputte Zeile folgendes, gültiges `initialize` wird vollständig beantwortet.

**Warum es dafür keinen Haken gibt.** `StdioServerTransport` besitzt die öffentliche
Rückrufstelle `onerror?: (error: Error) => void`. Sie wird aus `processReadBuffer()` heraus
aufgerufen, wenn `ReadBuffer.readMessage()` wirft — und genau das tut die Methode bei kaputtem
JSON nicht (Originalquelle laut Sourcemap des v2-Bundles: `core-internal/src/shared/stdio.ts`):

```js
readMessage() {
    while (this._buffer) {
        const index = this._buffer.indexOf("\n");
        if (index === -1) return null;
        const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
        this._buffer = this._buffer.subarray(index + 1);
        try {
            return deserializeMessage(line);
        } catch (error) {
            if (error instanceof SyntaxError) continue;   // <— hier verschwindet die Zeile
            throw error;
        }
    }
    return null;
}
```

`deserializeMessage(line)` ist `JSONRPCMessageSchema.parse(JSON.parse(line))`. Scheitert bereits
`JSON.parse`, entsteht ein `SyntaxError`, und das `continue` geht wortlos zur nächsten Zeile
über; der Fehler erreicht `processReadBuffer()` nie und damit auch `onerror` nie. Es gibt keine
Option, keinen Konstruktorparameter und keinen alternativen Einstieg, der das ändert:
`ReadBuffer` wird von `StdioServerTransport` selbst erzeugt, und der höherwertige Einstieg
`serveStdio()` benutzt denselben Transport und damit denselben `ReadBuffer`.

Direkt am SDK gemessen, mit einem eigenen `PassThrough` als `stdin` und gesetztem `onerror` und
`onmessage`:

| Eingabezeile | `onerror` | `onmessage` |
| --- | --- | --- |
| `{das ist kein JSON` | **nicht aufgerufen** | nicht aufgerufen |
| `{"foo":1}` | aufgerufen (`ZodError`) | nicht aufgerufen |
| `{"jsonrpc":"2.0","method":"x"}` | nicht aufgerufen | aufgerufen |

Die Grenze verläuft also zwischen **gültigem JSON in falscher Gestalt**, das `onerror` erreicht,
und **kaputtem JSON**, das nichts erreicht.

**Warum hier nichts nachgebaut wird.** Ohne Rückrufstelle bliebe nur, am SDK vorbei einen eigenen
Strom vor `stdin` zu hängen und die Zeilen ein zweites Mal selbst zu zerlegen. Das verdoppelt die
Rahmenlogik — Zeilentrennung, `\r`-Behandlung, Puffergrenze — genau an der Stelle, an der eine
Abweichung zwischen beiden Zerlegungen die Protokollverbindung beschädigt. Der Preis steht in
keinem Verhältnis zum Nutzen: Ein konformer Client sendet keine kaputten Zeilen, und die
stdio-Bindung von MCP legt diese Pflicht ausdrücklich auf die Clientseite
(`mcp-spezifikation.md` 4.1). Die Fehlerantwort mit Code `-32700` und `id: null` schreibt
JSON-RPC 2.0 allgemein vor; die stdio-Bindung wiederholt sie für den Server **nicht**. Es liegt
damit ein Abstand zur allgemeinen JSON-RPC-Regel vor, kein Verstoß gegen eine MCP-Regel.

**Wo es trotzdem weh tut:** bei der Fehlersuche an einem fremden oder selbstgebauten Client. Wer
dort eine Zeile falsch rahmt — ein fehlendes Anführungszeichen, ein abgeschnittener
Schreibvorgang, eine eingebettete Newline —, sieht kein Signal, sondern nur einen Server, der
nicht antwortet. Zur Selbsthilfe: Ein gültiges `initialize` wird auch nach einer verworfenen
Zeile korrekt beantwortet. Antwortet der Server auf ein `initialize` nicht, liegt die Ursache
also **nicht** an einer vorangegangenen kaputten Zeile.

**Sauber behebbar ist das nur im SDK selbst**, etwa indem `ReadBuffer.readMessage()` den
`SyntaxError` nach oben durchreicht, statt ihn zu verschlucken. Ein Aktualisieren hilft nicht:
`2.0.0` ist am Messtag die neueste veröffentlichte Fassung; `npm view
@modelcontextprotocol/server versions` nennt außer den Vorabfassungen `2.0.0-alpha.1` bis
`2.0.0-beta.5` keine weitere.

**Angrenzend, hier nur festgehalten und nicht miterledigt:** Dieser Server setzt
`transport.onerror` nirgends. Damit bleiben auch die Fehler stumm, die das SDK sehr wohl meldet —
gültiges JSON in falscher Gestalt (Zeile 2 der Tabelle oben), das Überschreiten der Puffergrenze
von 10 MB und Stromfehler auf `stdin`/`stdout`. `Protocol.connect()` hängt einen bereits
gesetzten `onerror`-Rückruf ausdrücklich vor den eigenen; ein vor `connect` gesetzter Rückruf
bliebe also erhalten und würde weiterhin aufgerufen. Eine kaputte Zeile erreicht ihn trotzdem
nicht — das ist ein anderer Punkt als der oben beschriebene und behebt ihn nicht.

---

## 9. v2 im Überblick, `@modelcontextprotocol/server@2.0.0`

Dieser Abschnitt ist knapper als der v1-Teil, aber alle Angaben sind ebenso verifiziert.

### 9.1 Eckdaten

| Merkmal | Wert | Quelle |
| --- | --- | --- |
| Pakete | `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, gemeinsam `@modelcontextprotocol/core` | Q14 |
| Version | 2.0.0, veröffentlicht 2026-07-27T23:55:22Z | Q14 |
| `engines.node` | `>=20` | Q14 |
| Modulformat | `type: module`, dual ESM (`.mjs`) und CJS (`.cjs`) | Q14, Q15 |
| Zod | `dependencies: { "zod": "^4.2.0" }`, **keine** Peer-Dependency | Q14 |
| Schema-Schnittstelle | Standard Schema mit JSON-Schema-Konverter | Q11, Q15 |
| JSON Schema in `tools/list` | `https://json-schema.org/draft/2020-12/schema` | Q10 |
| `LATEST_PROTOCOL_VERSION` | `2025-11-25` (widerspricht der README, siehe 1.) | Q10 |

### 9.2 Was sich gegenüber v1 ändert

**Importpfade ohne `.js`:**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
```

(So in Q11. Q16 schreibt stattdessen `import { z } from "zod"`. Beides funktioniert mit Zod 4, verifiziert in Q10.
Die beiden offiziellen Quellen sind hier uneinheitlich.)

**`registerTool` nimmt ein Schema, keinen Raw Shape.** Die Raw-Shape-Überladung existiert noch, ist aber markiert
(Q15, wörtlich): `@deprecated Wrap with z.object({...}) instead.`

```typescript
registerTool<OutputArgs extends StandardSchemaWithJSON,
             InputArgs extends StandardSchemaWithJSON | undefined = undefined>(
    name: string,
    config: { title?: string; description?: string;
              inputSchema?: InputArgs; outputSchema?: OutputArgs;
              annotations?: ToolAnnotations; icons?: Icon[]; _meta?: Record<string, unknown> },
    cb: ToolCallback<InputArgs>
): RegisteredTool;
```

**Der zweite Callback-Parameter heißt `ctx` und hat eine völlig andere Form.** Statt `RequestHandlerExtra` mit
flachen Feldern gibt es `ServerContext` (Q15), zur Laufzeit mit den Top-Level-Schlüsseln `sessionId`, `mcpReq`, `http`
(Q10):

| Zugriff v1 | Zugriff v2 |
| --- | --- |
| `extra.signal` | `ctx.mcpReq.signal` |
| `extra.requestId` | `ctx.mcpReq.id` |
| `extra._meta` | `ctx.mcpReq._meta` (Envelope-Schlüssel liegen separat in `ctx.mcpReq.envelope`) |
| `extra.sendNotification` | `ctx.mcpReq.notify` |
| `extra.sendRequest` | `ctx.mcpReq.send` |
| `extra.authInfo` | `ctx.http?.authInfo` |
| `server.sendLoggingMessage(...)` | `ctx.mcpReq.log(level, data, logger?)` |

**Logging ist deprecated.** Wörtlich an `McpServer.sendLoggingMessage` und an `ctx.mcpReq.log` (Q15):

> `@deprecated` Deprecated as of protocol version 2026-07-28 (SEP-2577). Remains functional during the deprecation
> window (at least twelve months). Migrate to stderr logging (STDIO servers) or OpenTelemetry.

Gleiches gilt für `elicitInput` und `requestSampling`, die auf einer 2026-07-28-Anfrage werfen und durch
`inputRequired(...)`-Ergebnisse ersetzt werden (Q15).

**`serveStdio` als neue Einstiegsform.** Statt einer Serverinstanz übergibt man eine Factory (Q15):

```typescript
import { serveStdio } from '@modelcontextprotocol/server/stdio';

serveStdio(() => {
    const server = new McpServer({ name: 'my-server', version: '1.0.0' },
        { capabilities: { tools: {} } });
    return server;
});
```

Die Factory wird je Verbindung und je Protokoll-Era einmal aufgerufen. `StdioServerTransport` mit
`server.connect(transport)` existiert weiterhin und wurde so getestet (Q10).

### 9.3 Verifiziertes v2-Minimalbeispiel

Kompiliert und gegen `@modelcontextprotocol/client@2.0.0` ausgeführt (Q10). Wie im v1-Beispiel ist nur der
Werkzeugname an das verbindliche Namensschema aus Abschnitt 10.4 Punkt 3 angepasst.

```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const server = new McpServer(
    { name: 'buchhaltungsbutler', version: '0.1.0', title: 'BuchhaltungsButler' },
    { instructions: 'Zugriff auf die BuchhaltungsButler-API.' }
);

server.registerTool(
    'bb_postings_search',
    {
        title: 'Buchungen auflisten',
        description: 'Listet Buchungen im angegebenen Zeitraum.',
        inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
        outputSchema: z.object({ gesamt: z.number(), buchungen: z.array(z.string()) }),
        annotations: { readOnlyHint: true }
    },
    async (args, ctx) => {
        ctx.mcpReq.signal.throwIfAborted();
        const nutzlast = { gesamt: args.limit, buchungen: [] as string[] };
        return {
            content: [{ type: 'text', text: JSON.stringify(nutzlast) }],
            structuredContent: nutzlast
        };
    }
);

await server.connect(new StdioServerTransport());
```

Beobachtetes Ergebnis eines fehlerhaften Aufrufs (Q10; der Werkzeugname im Mitschnitt ist derselbe wie im
Codebeispiel darüber, also gegenüber dem Testlauf angepasst, der übrige Text ist unverändert):

```json
{"content":[{"type":"text","text":"Input validation error: Invalid arguments for tool bb_postings_search: limit: Invalid input: expected number, received string"}],"isError":true}
```

Anders als v1 stellt v2 dem Text kein `MCP error -32602: ` voran und emittiert kein `execution`-Feld in `tools/list`.

---

## 10. Verbindliche Vorgaben für unsere Implementierung

> **Vorrang bei vier Werten, hier am Ort des Zugriffs genannt.** Für `engines.node`, die TypeScript-Version, das
> Buildwerkzeug und das `bin`-Ziel ist **nicht dieses Dokument** maßgeblich, sondern `toolchain.md`
> Abschnitt 3.3 (Q17). Dort verbindlich festgelegt sind:
>
> | Wert | Verbindlich (`toolchain.md` 3.3) | Frühere Angabe in diesem Dokument |
> | --- | --- | --- |
> | `engines.node` | `>=22.12.0` | `>=20` |
> | `typescript` | `6.0.3` exakt, kein Caret | `^5.9` oder neuer |
> | Build | `tsdown`, plus Sicherstellung von Shebang und Dateimodus 755 | `tsc && chmod 755 dist/index.js` |
> | `bin`-Ziel | `./dist/cli.js` | `dist/index.js` |
>
> Die Abschnitte 4.2, 8.2, 10.2 und 10.3 dieses Dokuments sind auf die verbindliche Spalte angeglichen. Wer nur
> Abschnitt 10 liest, hat die vier Werte damit vollständig und korrekt vor sich; die Begründungen im Einzelnen
> stehen in `toolchain.md` 3.3, Punkte 1 bis 4.

### 10.1 Empfehlung zur SDK-Linie

**Empfohlen: v2, also `@modelcontextprotocol/server@2.0.0`.** Begründung, ausschließlich aus belegten Fakten:

1. v2 ist laut Q11 die stabile Linie; v1 erhält nur noch Bugfixes und Security-Updates, und das befristet.
2. Der offizielle Quickstart für TypeScript installiert v2 (Q16).
3. v2 liefert spezifikationskonformes JSON Schema (Draft 2020-12); v1 liefert Draft 07 (Q10).
4. v1 hat einen echten Packaging-Defekt im Root-Export (Q10), v2 nicht.
5. Ein Greenfield-Projekt hat keine Migrationslast.

**Gegenargumente, die die Planung abwägen muss:**

* v2 ist am 2026-07-27 erschienen, zum Stichtag also rund sechs Wochen alt, bei Version 2.0.0 ohne Patch-Release.
  v1 hat 78 stabil veröffentlichte Versionen hinter sich, davon 73 in der 1.x-Linie; die Registry listet
  79 Einträge, der Unterschied ist die einzige Vorabversion `1.23.0-beta.0`
  (Stand 2026-09-12, `npm view @modelcontextprotocol/sdk versions --json`, Q1).
* Der Widerspruch zwischen der Spezifikationszusage 2026-07-28 in Q11 und `LATEST_PROTOCOL_VERSION = 2025-11-25`
  in der ausgelieferten 2.0.0 ist offen.
* Die Kompatibilität der real eingesetzten Clients mit v2-Servern war zum Stand dieses Dossiers **nicht geprüft**.
  Sie ist es inzwischen für zwei von drei Clients; die Ladeprobe steht unmittelbar darunter.
* Q11 selbst weist darauf hin, dass v2 sich noch setzt („while v2 settles“) und Pull Requests begrenzt sind.

Diese Entscheidung gehört in die Planungsphase. Beide Wege sind in diesem Dokument vollständig beschrieben.

**Ladeprobe mit echten Clients, gemessen am 2026-09-12.** Ein Wegwerf-Server mit genau einem Werkzeug, gebaut nach
dem Minimalbeispiel aus [9.3](#93-verifiziertes-v2-minimalbeispiel) gegen `@modelcontextprotocol/server@2.0.0` und
`zod@4.6.2` unter Node v22.23.2, wurde in zwei Clients tatsächlich geladen. Der Server lag außerhalb jedes
Projektbaums, sprach keine Netzwerkgegenstelle an und wurde nach der Messung in beiden Clients wieder entfernt.

| Client | `initialize` | `tools/list` | Ergebnis |
| --- | --- | --- | --- |
| Claude Code CLI 2.1.269 | beantwortet, ausgehandelte Revision `2025-11-25` | beantwortet | gemessen, positiv; ein zusätzlich geprüfter `tools/call` lief ebenfalls durch |
| OpenAI Codex CLI 0.153.4 | beantwortet, mittelbar über den erfolgreichen `tools/call` belegt | beantwortet | gemessen, positiv |
| Claude Desktop | — | — | **nicht geprüft**, Grund unten |

Unabhängig von jedem Client bestätigt ein roher JSON-RPC-Austausch über stdio dieselbe Lage: `initialize` antwortet
mit `protocolVersion: "2025-11-25"`, und `tools/list` liefert `inputSchema` und `outputSchema` als JSON Schema
Draft 2020-12 (`$schema: "https://json-schema.org/draft/2020-12/schema"`), wie [9.1](#91-eckdaten) es angibt. Damit
ist die Protokollrevision nicht nur als Konstante im Bundle belegt, sondern als das, was ein echter Client
aushandelt.

**Claude Desktop ist ausdrücklich nicht gemessen, weder positiv noch negativ.** Der Client liest seine Serverliste
ausschließlich beim Programmstart aus `~/Library/Application Support/Claude/claude_desktop_config.json`; anders als
bei Claude Code und der Codex CLI gibt es keinen Weg, einen Server nachzuladen oder zu prüfen, ohne die Anwendung
vollständig zu beenden und neu zu starten. Zum Messzeitpunkt lief eine Sitzung mit eigenen MCP-Verbindungen, und
die Messung wurde deshalb bewusst unterlassen. Sie ist nachholbar, sobald ein Neustart ohnehin ansteht: Eintrag
unter `mcpServers` mit `command: node` und `args: ["<Pfad zum Wegwerf-Server>"]`, Neustart, danach
`~/Library/Logs/Claude/mcp-server-<name>.log` und `~/Library/Logs/Claude/mcp.log` auf `initialize`- und
`tools/list`-Einträge prüfen.

**Was daraus für die Wahl der SDK-Linie folgt.** Es liegt keine einzige negative Messung gegen v2 vor, und die fünf
Gründe für v2 oben bestehen unabhängig von dieser Probe. Die fehlende dritte Messung ist deshalb kein Grund, auf v1
zurückzugehen, sondern ein offener Punkt: Für Claude Desktop ist der v2-Entscheid **nicht durch eigene Messung
abgesichert**. Scheitert die Nachprüfung später, ist die Wahl der SDK-Linie neu aufzurollen, einschließlich
`package.json` und sämtlicher SDK-Importe. `zod` bleibt davon unberührt und in jedem Fall direkte `dependency` mit
`^4.6.2`.

**Vorrangsatz zur Protokollrevision (verbindlich, wörtlich aus `mcp-spezifikation.md` 11.1a (c), Q18):**

> Maßgeblich für die Implementierung ist die Protokollrevision, die das eingesetzte SDK nachweislich zur Laufzeit
> aushandelt; am 2026-09-12 ist das `2025-11-25`. Die auf `2026-07-28` bezogenen Pflichten sind bis zu einem
> gegenteiligen Laufzeitnachweis Zielzustand und keine Umsetzungspflicht, und der Protokollrahmen wird nicht am
> SDK vorbei nachgebaut.

Dieser Satz gilt unabhängig davon, welche SDK-Linie die Planung wählt: beide melden am 2026-09-12
`LATEST_PROTOCOL_VERSION = 2025-11-25` (Abschnitte 2.1 und 9.1; Q8, Q10). Gemeint ist damit jeweils die
**Laufzeitkonstante**, bei v1 also der Export aus `dist/esm/types.js` und bei v2 der entsprechende Export des
v2-Bundles. Die in v1 zusätzlich ausgelieferte Datei `dist/esm/spec.types.js` mit
`LATEST_PROTOCOL_VERSION = "DRAFT-2026-v1"` ändert daran nichts: Sie wird von keinem Modul des Bundles importiert,
ist an keiner Aushandlung beteiligt und enthält die 2026er-Merkmale aus 11.1 auch gar nicht (Abschnitt 2.1, Q19).
Als Laufzeitnachweis im Sinne von 11.1a taugt sie deshalb nicht. Die Zusage aus Q11, v2 implementiere
`2026-07-28`, genügt nach 11.1a ausdrücklich nicht als Nachweis; sie ist genau der in Abschnitt 1 benannte,
ungeklärte Widerspruch. Praktisch folgt daraus, dass die in `mcp-spezifikation.md` 11.1a (b) mit **nein**
markierten Pflichten aus 11.1 nicht gebaut werden (`server/discover`, die Pflicht-`_meta`-Prüfung je Request, die
Antwort `-32022` auf Versionskonflikte, `resultType`, `serverInfo` je Result, `ttlMs` und `cacheScope`), weil die
`McpServer`-API der beiden Linien dafür keinen Weg bietet.

Ergänzend gilt der Dokumentenvorrang aus `mcp-spezifikation.md` 11.1a (c) Punkt 5 (Q18): Für Aussagen über das
Protokoll ist `mcp-spezifikation.md` maßgeblich, für Aussagen darüber, was ein SDK kann und wie der Code
auszusehen hat, dieses Dokument. Widersprechen sich beide, gewinnt für die Umsetzung die gemessene SDK-Lage und
für die Zielsetzung die Spezifikation.

### 10.2 Festgeschriebene Versionen

> **Nachgezogen am 2026-09-13.** **`engines.node` lautet `>=22.19.0`**, nicht `>=22.12.0`. Die
> Begründung der Zeile unten bleibt richtig — `>=20` ist die SDK-Untergrenze und kein
> Projektwert —, die Zahl ist es nicht: `undici@8.10.2` ist eine **Laufzeit**abhängigkeit und
> deklariert selbst `engines.node: ">=22.19.0"`. Zum Bauen gilt zusätzlich die engere Range von
> `tsdown@0.23.0`; Einzelheiten in `toolchain.md` 3.3 und in `CONTRIBUTING.md`.

| Paket | Version | Bemerkung |
| --- | --- | --- |
| Node.js | `>=22.12.0` | Verbindlich nach `toolchain.md` 3.3 Punkt 1 (Q17). `>=20` ist die **SDK-Untergrenze** von v2 (Q14) und der Wert des offiziellen Quickstarts (Q16), **kein Projektwert**; v1 nennt `>=18` (Q1, Q2). Jede Version, die `>=22.12.0` erfüllt, erfüllt beide SDK-Untergrenzen. Als Projektwert ist `>=20` nicht tragfähig: Node 20 ist seit 2026-04-30 End of Life und `vitest@5.0.0` verlangt `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` (Q17, 1.1 und 1.2). Entwicklung und CI auf Node 22. |
| `@modelcontextprotocol/server` | `2.0.0` exakt | v2-Weg |
| `@modelcontextprotocol/client` | `2.0.0` exakt | nur für Integrationstests |
| `@modelcontextprotocol/sdk` | `1.30.0` exakt | **nur** falls die Planung den v1-Weg wählt |
| `zod` | `^4.6.2` | explizit in `dependencies`, nicht auf die transitive Auflösung verlassen |
| `typescript` | `6.0.3` exakt, kein Caret | devDependency. Verbindlich nach `toolchain.md` 3.3 Punkt 2 (Q17). Begründung aus `toolchain.md` 2.1: `typescript-eslint@8.70.0` deklariert die Peer-Range `>=4.8.4 <6.1.0` und schließt TypeScript 7 damit aus; `typescript@7.0.x` liefert nur noch die native `tsc`-Binärdatei und **keine programmatische Compiler-API** mehr, die typgestütztes Linting braucht. 6.0.3 ist die letzte Version der 6er-Linie (2026-04-16). Die frühere Angabe `^5.9` bedeutet `>=5.9.0 <6.0.0` und schlösse 6.0.3 formal aus. |
| `tsdown` | `0.23.0` | devDependency, Buildwerkzeug nach `toolchain.md` 3.3 Punkt 3 und Abschnitt 4 (Q17) |
| `@types/node` | passend zur Node-Major | devDependency |

Exakte Versionen, kein Caret, für die MCP-Pakete, für `typescript` und für `tsdown`. Ein Lockfile wird eingecheckt.

### 10.3 Projektkonfiguration

> **Nachgezogen am 2026-09-13.** **Der `bin`-Name lautet
> `bbutler-mcp`, nicht `buchhaltungsbutler-mcp`**, und es gibt genau einen `bin`-Eintrag:
> `"bin": { "bbutler-mcp": "./dist/cli.js" }`. Der Grund ist geprüft und nicht ästhetisch: Unter
> dem ungescopten Namen `buchhaltungsbutler-mcp` ist auf npm bereits ein `bin` gleichen Namens
> belegt (per `npm view buchhaltungsbutler-mcp bin` bestätigt). Zwei global installierte Pakete mit demselben
> `bin`-Namen kollidieren, und welches gewinnt, hängt von der Installationsreihenfolge ab. Ob der
> Name `bbutler-mcp` seinerseits bereits belegt ist, lässt sich nicht vollständig prüfen: npm
> indiziert `bin`-Namen nicht, und ein freier Paketname belegt nicht, dass auch der `bin`-Name
> frei ist. Das bleibt ein benanntes Restrisiko von geringer Schwere — tritt es auf, sind nur
> `package.json` und die README zu ändern, der Paketname bleibt. **`engines.node`** lautet hier
> ebenfalls **`>=22.19.0`**, siehe 10.2.

* `package.json`: `"type": "module"`, `"files": ["dist"]`, `"engines": { "node": ">=22.19.0" }` sowie
  `"bin": { "bbutler-mcp": "./dist/cli.js" }`. Die `bin`-Datei ist die CLI; `dist/index.js` bleibt dem
  programmatischen Export vorbehalten (Q17, 3.3 Punkt 4). Wird auf den programmatischen Export verzichtet, fallen
  beide Einstiege in `dist/index.js` zusammen, und `bin` sowie ein etwaiger `chmod`-Schritt ziehen gleichlautend
  mit. Unzulässig ist der Mischzustand, in dem `bin` auf `dist/cli.js` zeigt, ein `chmod`-Schritt aber
  `dist/index.js` ausführbar macht.
* `tsconfig.json`: `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`,
  `types: ["node"]`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`. Die vollständige, für dieses
  Projekt empfohlene Optionsliste steht in `toolchain.md` Abschnitt 2.2 (Q17).
* Build: `tsdown` (Q17, 3.3 Punkt 3). Reines `tsc` ist als Auslieferungs-Build ausgeschlossen; `tsc` läuft nur
  noch als eigenes Skript `tsc --noEmit` für den Typecheck. Shebang und Dateimodus 755 der `bin`-Datei sind
  sicherzustellen; setzt `tsdown` den Modus nicht selbst, folgt im `build`-Skript ein expliziter Schritt
  `chmod 755 dist/cli.js`.
* Erste Zeile der Einstiegsdatei `src/cli.ts`: `#!/usr/bin/env node`.
* Bei v1 zusätzlich: alle SDK-Importe mit `.js`-Endung, nie der Root-Pfad.

### 10.4 Muster, die einzuhalten sind

1. **Immer `McpServer`**, nie `new Server(...)`. Low-Level-Zugriff nur über `mcpServer.server`.
2. **Immer `registerTool`, `registerResource`, `registerPrompt`.** Die Formen `tool()`, `resource()`, `prompt()` sind
   deprecated und können `title`, `outputSchema` und `_meta` nicht abbilden.
3. **Werkzeugnamen** ausschließlich nach dem verbindlichen Schema aus `tool-design.md` 4.2, 4.3 und 11.2:
   `bb_<ressource>_<verb>[_<qualifizierer>]`, durchgehend snake_case, Präfix `bb_`, **keine Punkte**,
   jeder Name erfüllt `^[a-z][a-z0-9_]{2,39}$`. Beispiele: `bb_postings_search`, `bb_postings_create`.
   Begründung der Verengung gegenüber der SDK-Regel: Die Namensprüfung des SDK (Abschnitt 5.2, Q9) lässt mit
   `^[A-Za-z0-9._-]{1,128}$` auch Punkte zu, entscheidet damit aber nur über die Serverseite. Auf der Clientseite
   gilt laut `tool-design.md` 4.1 die Anthropic-Regel `^[a-zA-Z0-9_-]{1,128}$`, die Punkte, Doppelpunkte und
   Leerzeichen verbietet. Ein Name wie `bhb.postings.list` wäre nach dieser Regel unzulässig. Wo sich die Regeln
   unterscheiden, gilt die engere, also die aus `tool-design.md`. Die dritte, weitere Fassung in
   `mcp-spezifikation.md` 11.1 (`[A-Za-z0-9_.-]`) wird davon vollständig abgedeckt und begründet keine Ausnahme.
4. **Jedes Werkzeug bekommt `title`, `description`, `inputSchema` und passende `annotations`.**
   `readOnlyHint: true` für alle lesenden Endpunkte, `destructiveHint` bewusst setzen, wo geschrieben wird.
5. **`outputSchema` nur setzen, wenn der Handler garantiert `structuredContent` liefert.** Dann immer beide Felder:
   `structuredContent` mit den Daten und `content` mit deren JSON-Serialisierung.
6. **Fehler immer als `{ content: [...], isError: true }`.** Niemals eine rohe Exception aus dem Handler entkommen
   lassen, weil der generische Fang des SDK interne Meldungen ungefiltert weitergibt. API-Fehler von
   BuchhaltungsButler werden in eine eigene, geprüft harmlose Meldung übersetzt.
7. **Keine Zugangsdaten in Meldungen, Logs oder Werkzeugbeschreibungen.** Weder API-Key noch Client-Secret noch
   Authorization-Header dürfen in `content`, `structuredContent`, stderr oder Fehlermeldungen auftauchen.
   Konfiguration ausschließlich über Umgebungsvariablen.
8. **`extra.signal` bzw. `ctx.mcpReq.signal` an jeden `fetch` durchreichen** und zu Beginn jedes Handlers
   `throwIfAborted()` aufrufen.
9. **stdout ist tabu.** Diagnose über `process.stderr.write`. In ESLint `no-console` mit Ausnahme für `error`.
10. **Sauberes Herunterfahren** über einen idempotenten Handler für SIGINT, SIGTERM sowie stdin-`end` und `close`,
    der `server.close()` aufruft.
11. **`unhandledRejection`- und `uncaughtException`-Handler** setzen, die nach stderr schreiben.
12. **Integrationstest in der CI:** den gebauten Server tatsächlich starten, per Client `initialize`, `tools/list` und
    mindestens einen `tools/call` ausführen. Ein `tsc --noEmit` allein fängt die Importpfad- und
    Packaging-Fallstricke aus Abschnitt 8.3 nicht.

### 10.5 Ausdrücklich nicht benutzen

* Die experimentelle Tasks-API (`server.experimental.tasks`, `registerToolTask`). Sie ist im SDK als „experimental and
  may change without notice“ gekennzeichnet (Q3).
* Sampling und Form-Elicitation. In v2 sind beide für die 2026-07-28-Era deprecated und werfen dort (Q15).
* Der HTTP-plus-SSE-Transport. Laut Q13 nur zur Abwärtskompatibilität vorhanden.

---

## 11. Testaufbau der Verifikation (Q10)

Alle mit Q10 belegten Aussagen stammen aus eigenen Läufen vom 2026-09-12 in temporären Verzeichnissen unter
`/private/tmp`. Es wurde nichts in die Projektwurzel installiert.

| Verzeichnis | Inhalt |
| --- | --- |
| `/private/tmp/mcp-sdk-probe` | `@modelcontextprotocol/sdk@1.30.0` mit Zod 4.6.2, TypeScript 7.0.2, `@types/node`. Vier Testserver und vier Testclients über `StdioServerTransport`/`StdioClientTransport`. |
| `/private/tmp/mcp-sdk-probe-z3` | dieselbe SDK-Version mit Zod 3.25.76, um den Zod-3-Pfad zu prüfen. |
| `/private/tmp/mcp-v2-probe` | `@modelcontextprotocol/server@2.0.0` und `@modelcontextprotocol/client@2.0.0` mit Zod 4.6.2. |
| `/private/tmp/binprobe` | `npm pack` plus Tarball-Installation, um Shebang und Dateimodus zu prüfen. |

Laufzeitumgebung: macOS (Darwin 25.6.0), Node v22.23.2, npm 10.9.8.

Die in `/private/tmp/mcp-sdk-probe` benutzte TypeScript-Version 7.0.2 ist die Version der Probeumgebung, **keine
Projektvorgabe**. Verbindlich für dieses Projekt ist `typescript@6.0.3` nach Abschnitt 10.2 und `toolchain.md` 3.3
Punkt 2 (Q17). Die Probe brauchte kein typgestütztes Linting und war von der fehlenden programmatischen
Compiler-API in 7.0.x deshalb nicht betroffen.

Geprüft wurden unter anderem: Typecheck mit und ohne `skipLibCheck`, Kompilat und Start, `initialize`, `tools/list`,
`tools/call` mit gültigen und ungültigen Argumenten, `resources/list`, `resources/templates/list`, `prompts/list`,
`logging/setLevel` samt Notification, Progress-Notifications, clientseitige Stornierung, stdout-Verschmutzung,
fehlendes `structuredContent`, Verhalten beim Schließen von stdin, Modulauflösung aller Exportpfade sowie ein
Zod-freies Standard Schema unter v2.
