// Die Tokenmessung aus Plan 4.10 (AP14): `pnpm measure-tokens`.
//
// Gemessen wird mit dem echten Tokenizer aus Plan 13.9 (`gpt-tokenizer`, exakt auf 4.0.0
// gepinnt, Kodierung `o200k_base`) und niemals über die Konstante CHARS_PER_TOKEN. Ein
// Schätzfaktor, der sich selbst bestätigt, misst nichts.
//
// **Dieses Skript misst und urteilt nicht.** Erzwungen wird in P11
// (`test/registry/token-budget.test.ts`); es hier ein zweites Mal zu erzwingen hieße, zwei
// Stellen zu haben, an denen der Bau abbrechen kann. Reißt das Budget, schreibt das Skript das
// in den Befund und nennt die Reihenfolge der Gegenmaßnahmen aus 4.10; die Budgetgrenzen
// selbst ändert es nicht (Plan 12, Streitfrage S4).
//
// TOTAL_TOOL_DEFINITION_TOKEN_BUDGET steht seit der Entscheidung des Projektinhabers vom
// 2026-09-13 auf 49.000 Token, und P11 bricht wieder hart daran ab. Dieses Skript nennt die
// Zahl, damit der Befund sagt, wie viel Luft bis zur Grenze bleibt.
//
// **Warum hier dynamisch importiert wird.** Node führt TypeScript aus, löst aber einen
// Spezifizierer `./x.js` nicht auf `./x.ts` auf — und genau so importiert dieses Projekt
// (`verbatimModuleSyntax`, NodeNext). Ein statischer Import von `src/**` würde deshalb zur
// Laufzeit scheitern, obwohl er typprüft. Die Auflösung unten holt das nach, und die Module
// werden danach dynamisch geladen; statische Importe wären zu diesem Zeitpunkt längst
// aufgelöst. Die Typen kommen über `typeof import(...)` trotzdem aus den echten Dateien, nicht
// aus einer Handabschrift.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

import { encode } from "gpt-tokenizer/encoding/o200k_base";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.endsWith(".js")) throw error;
      return nextResolve(`${specifier.slice(0, -".js".length)}.ts`, context);
    }
  },
});

const ROOT = new URL("../", import.meta.url);

/** Die URL einer Projektdatei, aus der dieses Skript geladen wird. */
function moduleUrl(relativePath: string): string {
  return new URL(relativePath, ROOT).href;
}

/** Ein Projektpfad im Dateisystem. */
function filePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, ROOT));
}

/**
 * Der erzeugte Registerindex wird nicht eingecheckt (Plan 4.2). Ohne ihn bricht der erste
 * dynamische Import mit einer Meldung über einen fehlenden Modulpfad ab, und die sagt nicht,
 * was zu tun ist. Deshalb diese Prüfung zuerst.
 */
const REGISTRY_INDEX = "src/registry/index.generated.ts";
if (!existsSync(filePath(REGISTRY_INDEX))) {
  console.error(
    `${REGISTRY_INDEX} fehlt. Die Datei wird erzeugt und nicht eingecheckt (Plan 4.2): ` +
      "zuerst pnpm generate ausführen, dann pnpm measure-tokens.",
  );
  process.exit(1);
}

const registry = (await import(
  moduleUrl(REGISTRY_INDEX)
)) as typeof import("../src/registry/index.generated.js");
const definition = (await import(
  moduleUrl("src/registry/definition.ts")
)) as typeof import("../src/registry/definition.js");
const budget = (await import(
  moduleUrl("src/registry/budget.ts")
)) as typeof import("../src/registry/budget.js");
const groups = (await import(
  moduleUrl("src/registry/groups.ts")
)) as typeof import("../src/registry/groups.js");
const instructions = (await import(
  moduleUrl("src/server/instructions.ts")
)) as typeof import("../src/server/instructions.js");
const configModule = (await import(
  moduleUrl("src/config/resolve.ts")
)) as typeof import("../src/config/resolve.js");
const bundleRegistry = (await import(
  moduleUrl("src/bundles/index.ts")
)) as typeof import("../src/bundles/index.js");
const bundleSchema = (await import(
  moduleUrl("src/bundles/schema.ts")
)) as typeof import("../src/bundles/schema.js");

type ToolEntry = (typeof registry.TOOL_ENTRIES)[number];

// ---------------------------------------------------------------------------------------
// Messgrößen
// ---------------------------------------------------------------------------------------

interface Measurement {
  readonly chars: number;
  readonly tokens: number;
}

function measure(text: string): Measurement {
  return { chars: text.length, tokens: encode(text).length };
}

/** Zeichen je Token, auf zwei Stellen. `0` Token ergibt `0`, nicht `Infinity`. */
function ratio(measurement: Measurement): number {
  return measurement.tokens === 0 ? 0 : measurement.chars / measurement.tokens;
}

function de(value: number): string {
  return value.toLocaleString("de-DE");
}

function deRatio(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Eine Zahl ohne erzwungene Nachkommastellen, für die eingecheckte Konstante. */
function deExact(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/**
 * Die Werkzeugdefinition, **wie der Client sie beim Verbinden sieht**.
 *
 * Hergestellt wird sie in `src/registry/definition.ts` und nicht hier: Dieselbe Datei liefert
 * sie an `test/helpers/registry-fixtures.ts` (und damit an P11) und an `doctor` (8.4). Solange
 * es drei Nachbildungen gab, konnten sie auseinanderlaufen — in `doctor` ist genau das
 * geschehen. Diese Funktion zerlegt das Ergebnis nur noch in die Posten, die der Bericht
 * unten braucht.
 */
function renderedDefinition(entry: ToolEntry): {
  readonly json: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly output: string;
  readonly outputSchema: Record<string, unknown>;
} {
  const rendered = definition.renderToolDefinition(entry);
  return {
    json: JSON.stringify(rendered),
    description: rendered.description,
    inputSchema: rendered.inputSchema,
    output: JSON.stringify(rendered.outputSchema),
    outputSchema: rendered.outputSchema,
  };
}

/**
 * Die Summe aller `description`-Texte in einem JSON Schema, auf jeder Schachtelungstiefe.
 *
 * Damit wird der Posten „Parametereinträge mit Beschreibungen" aus Plan 4.10 so gemessen, wie
 * er dort gemeint ist: als Text und nicht einschließlich der Schemastruktur, die dort zum
 * Posten „Schemarümpfe" gehört. Ohne diese Trennung vergleicht die Tabelle unten zwei
 * verschiedene Dinge.
 */
function descriptionChars(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + descriptionChars(item), 0);
  }
  if (typeof value !== "object" || value === null) {
    return 0;
  }
  let sum = 0;
  for (const [key, child] of Object.entries(value)) {
    if (key === "description" && typeof child === "string") {
      sum += child.length;
      continue;
    }
    sum += descriptionChars(child);
  }
  return sum;
}

type ToolGroup = (typeof groups.TOOL_GROUP_NAMES)[number];

interface ToolMeasurement extends Measurement {
  readonly name: string;
  readonly group: ToolGroup;
  readonly tier: number;
  readonly descriptionChars: number;
  readonly inputTextChars: number;
  readonly outputChars: number;
  readonly outputTextChars: number;
}

const tools: ToolMeasurement[] = registry.TOOL_ENTRIES.map((entry) => {
  const rendered = renderedDefinition(entry);
  return {
    name: entry.name,
    group: entry.group,
    tier: entry.tier,
    ...measure(rendered.json),
    descriptionChars: rendered.description.length,
    inputTextChars: descriptionChars(rendered.inputSchema),
    outputChars: rendered.output.length,
    outputTextChars: descriptionChars(rendered.outputSchema),
  };
});

/** Die Summe mehrerer Messungen. */
function sumOf(items: readonly Measurement[]): Measurement {
  return {
    chars: items.reduce((sum, item) => sum + item.chars, 0),
    tokens: items.reduce((sum, item) => sum + item.tokens, 0),
  };
}

const definitions: Measurement = sumOf(tools);

/**
 * Die Bündeldefinitionen, gemessen über `BUNDLE_ENTRIES` statt über `TOOL_ENTRIES`.
 *
 * Die Bündel stehen nicht im erzeugten Registerindex, weil sie einen eigenen Eintragstyp
 * tragen (`src/bundles/types.ts`); über `TOOL_ENTRIES` sind sie deshalb unsichtbar. Gemessen
 * wird mit `bundleDefinitionJson` aus `src/bundles/schema.ts`, also mit derselben Funktion, aus
 * der `registerBundles` die ausgelieferte Definition baut — eine zweite Nachbildung gibt es
 * nicht. Ohne diesen Block verglich die Budgetprüfung unten immer 0 gegen die Grenze und war
 * damit wirkungslos.
 */
const bundleTools: readonly (Measurement & { readonly name: string })[] =
  bundleRegistry.BUNDLE_ENTRIES.map((entry) => ({
    name: entry.name,
    ...measure(bundleSchema.bundleDefinitionJson(entry)),
  }));

// ---------------------------------------------------------------------------------------
// Die Messung je Werkzeuggruppe (N5)
// ---------------------------------------------------------------------------------------

/**
 * Was eine Gruppe kostet, gemessen statt geschätzt.
 *
 * Erst diese Zahlen machen den Gruppenschalter einstellbar: Wer `BB_MCP_TOOL_GROUPS` setzt,
 * will wissen, was er damit spart. Die Summe einer Teilmenge ist exakt und keine Hochrechnung,
 * weil jede Definition einzeln gemessen und danach addiert wird.
 *
 * Die Tabelle in `src/registry/groups.ts` trägt dieselben Zahlen eingecheckt, damit Startmeldung
 * und `doctor` ohne Tokenizer auskommen; `test/registry/groups.test.ts` rechnet sie nach.
 *
 * **Die elf Endpunktgruppen werden über `TOOL_ENTRIES` gemessen, `bundles` über
 * `BUNDLE_ENTRIES`.** Beide Quellen stehen nebeneinander, weil die Bündel einen eigenen
 * Eintragstyp tragen und im erzeugten Registerindex nicht vorkommen; die Zeile `bundles` in
 * der Ausgabe ist damit eine echte Messung und keine Null.
 */
interface GroupMeasurement extends Measurement {
  readonly group: ToolGroup;
  readonly tools: number;
  /** Die eingecheckte Zahl aus `groups.ts`, oder `null`, solange keine hinterlegt ist. */
  readonly recorded: number | null;
  /**
   * `true`, solange die Gruppe zu den 54 Endpunktwerkzeugen zählt. Nur diese Gruppen haben
   * einen Anteil an den budgetierten {@link definitions}; `bundles` hat sein eigenes Budget.
   */
  readonly partOfDefinitions: boolean;
}

const groupMeasurements: GroupMeasurement[] = groups.TOOL_GROUP_NAMES.map((group) => {
  const isBundleGroup = group === groups.BUNDLE_TOOL_GROUP;
  const members: readonly Measurement[] = [
    ...tools.filter((tool) => tool.group === group),
    ...(isBundleGroup ? bundleTools : []),
  ];
  return {
    group,
    tools: members.length,
    ...sumOf(members),
    recorded: groups.TOOL_GROUPS[group].measuredTokens,
    partOfDefinitions: !isBundleGroup,
  };
});

const bundleMeasurement = groupMeasurements.find(
  (measurement) => measurement.group === groups.BUNDLE_TOOL_GROUP,
);
const bundleTokens = bundleMeasurement?.tokens ?? 0;
const bundleOverBudget = bundleTokens > budget.BUNDLE_DEFINITION_TOKEN_BUDGET;

/** Gruppen, deren eingecheckte Zahl nicht mehr zur Messung passt. */
const staleGroups = groupMeasurements.filter(
  (measurement) => measurement.tools > 0 && measurement.recorded !== measurement.tokens,
);

/**
 * Dieselbe Summe in der Rechenweise von P11.
 *
 * P11 baut die Definition aus dem Registereintrag selbst nach, weil die Prüfung vor den
 * Paketen entstand, die `schema/build.ts` und `response/output-schema.ts` liefern
 * (`test/helpers/registry-fixtures.ts`, Kopfkommentar). Beide Zahlen stehen im Befund, damit
 * niemand den Unterschied für einen Messfehler hält: Der Test bricht gegen die eine ab, der
 * Client bekommt die andere.
 */
const P11_HELPER = "test/helpers/registry-fixtures.ts";

async function p11Definitions(): Promise<Measurement | undefined> {
  if (!existsSync(filePath(P11_HELPER))) return undefined;
  const fixtures = (await import(
    moduleUrl(P11_HELPER)
  )) as typeof import("../test/helpers/registry-fixtures.js");
  return registry.TOOL_ENTRIES.map((entry) => measure(fixtures.definitionJson(entry))).reduce(
    (sum, one) => ({ chars: sum.chars + one.chars, tokens: sum.tokens + one.tokens }),
    { chars: 0, tokens: 0 },
  );
}

const p11 = await p11Definitions();

// ---------------------------------------------------------------------------------------
// Die instructions in ihren beiden Randzuständen
// ---------------------------------------------------------------------------------------

/**
 * Zwei Zustände, weil der Servertext vom Schalterzustand abhängt (Plan 6.7 Punkt 1): der
 * Auslieferungszustand und der größtmögliche, in dem jede zusätzliche Zeile erscheint. Das
 * Budget muss in beiden halten, und nur der zweite beweist das.
 *
 * Die Zugangsdaten sind Platzhalter. Sie stehen in keinem Ausgabetext; sie sorgen allein
 * dafür, dass der Zustandsblock die Zeile „Zugangsdaten: vorhanden" nimmt und die Auflösung
 * keine Zugangsdatendatei des Betreibers liest.
 */
const PLACEHOLDER_CREDENTIALS = {
  BB_API_CLIENT: "PLATZHALTER",
  BB_API_SECRET: "PLATZHALTER",
  BB_API_KEY: "PLATZHALTER",
} as const;

function instructionsFor(env: Readonly<Record<string, string>>): Measurement {
  const resolved = configModule.resolveConfig({ env: { ...PLACEHOLDER_CREDENTIALS, ...env } });
  return measure(instructions.buildInstructions(resolved.config));
}

const instructionsDefault = instructionsFor({});
const instructionsMax = instructionsFor({
  BB_MCP_READ_ONLY: "true",
  BB_MCP_DUPLICATE_CHECK: "on",
  BB_MCP_CACHE_TTL_MS: "60000",
  BB_MCP_MAX_AMOUNT: "1000.00",
  BB_MCP_MAX_BATCH: "10",
  // Der Gruppenschalter gehört zum größten Zustand: Bei abgeschalteter Gruppe nennt der
  // Servertext zusätzlich jede inaktive Gruppe und was mit ihr unbeantwortbar ist. Früher
  // stand hier die kleinste Gruppe allein, also elf inaktive. Seit die Blöcke des Servertextes
  // an ihren Gruppen hängen, ist das nicht mehr der teuerste Zustand: Ohne `postings` entfällt
  // der Buchungswegweiser. Teuerste Einstellung ist jetzt `postings,bundles` — gemessen über
  // alle 4.095 nichtleeren Gruppenmengen, zehn inaktive Gruppen plus den Wegweiser. Dieselbe
  // Wahl trifft `largestConfig()` in `test/registry/token-budget.test.ts`.
  BB_MCP_TOOL_GROUPS: "postings,bundles",
});

/**
 * Die Grundlage des Zeichen-je-Token-Verhältnisses: alles, was der Client beim Verbinden
 * bekommt, also die 54 Definitionen plus den Servertext im Auslieferungszustand.
 */
const connectTotal: Measurement = {
  chars: definitions.chars + instructionsDefault.chars,
  tokens: definitions.tokens + instructionsDefault.tokens,
};

const measuredRatio = ratio(connectTotal);

// ---------------------------------------------------------------------------------------
// Der Bericht
// ---------------------------------------------------------------------------------------

/** Die tatsächlich geladene Tokenizer-Version, aus dem installierten Paket. */
function tokenizerVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(filePath("node_modules/gpt-tokenizer/package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : "unbekannt";
  } catch {
    return "unbekannt";
  }
}

function row(label: string, measurement: Measurement): string {
  return `| ${label} | ${de(measurement.chars)} | ${de(measurement.tokens)} | ${deRatio(ratio(measurement))} |`;
}

const overBudget = definitions.tokens > budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET;
const p11OverBudget = p11 !== undefined && p11.tokens > budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET;
const instructionsOverBudget = instructionsMax.tokens > budget.INSTRUCTIONS_TOKEN_BUDGET;

const dearest = [...tools].sort((a, b) => b.tokens - a.tokens).slice(0, 10);

const totalDescriptionChars = tools.reduce((sum, tool) => sum + tool.descriptionChars, 0);
const totalInputTextChars = tools.reduce((sum, tool) => sum + tool.inputTextChars, 0);
const totalOutputChars = tools.reduce((sum, tool) => sum + tool.outputChars, 0);
const totalOutputTextChars = tools.reduce((sum, tool) => sum + tool.outputTextChars, 0);
/**
 * Der Rest: Name, Titel, Annotationen, die Schlüssel und Anführungszeichen des JSON und die
 * Struktur des Eingabeschemas ohne seine Beschreibungstexte. In Plan 4.10 ist das der Posten
 * „Name, Titel, Annotationen, Schemarümpfe".
 */
const remainderChars =
  definitions.chars - totalDescriptionChars - totalInputTextChars - totalOutputChars;

/** Die Endabrechnung aus Plan 4.10 gegen die Messung, Posten für Posten. */
function lineItemTable(): string {
  const lines = [
    "| Posten | angesetzt in 4.10 (Zeichen) | gemessen (Zeichen) | Abweichung |",
    "| --- | --- | --- | --- |",
  ];
  const lineItems: [string, number, number][] = [
    ["Werkzeugbeschreibungen nach Stufenbudget (S2)", 39_120, totalDescriptionChars],
    ["Parameterbeschreibungen, reiner Text (S1, S3, S4, S5)", 38_400, totalInputTextChars],
    ["`outputSchema` ohne Feldbeschreibungen (S6)", 14_040, totalOutputChars],
    ["Name, Titel, Annotationen, Schemarümpfe", 5_238, remainderChars],
    ["Summe", 96_798, definitions.chars],
  ];
  for (const [label, planned, measured] of lineItems) {
    const delta = measured - planned;
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
    lines.push(`| ${label} | ${de(planned)} | ${de(measured)} | ${sign}${de(Math.abs(delta))} |`);
  }
  return lines.join("\n");
}
/** Die Messung je Gruppe, absteigend nach Token. */
function groupTable(): string {
  const lines = [
    "| Gruppe | Werkzeuge | Zeichen | Token | eingecheckt | Anteil |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  // Absteigend nach Token, `bundles` aber immer zuletzt: Die Gruppe zählt nicht zu den 54
  // Endpunktwerkzeugen und hat deshalb keinen Anteil an deren Summe. Stünde sie mitten in der
  // Tabelle, läse sich die Spalte „Anteil" als Lücke statt als Hinweis.
  const ordered = [...groupMeasurements].sort((a, b) => {
    if (a.partOfDefinitions !== b.partOfDefinitions) return a.partOfDefinitions ? -1 : 1;
    return b.tokens - a.tokens;
  });
  for (const measurement of ordered) {
    const share = definitions.tokens === 0 ? 0 : (measurement.tokens / definitions.tokens) * 100;
    lines.push(
      `| \`${measurement.group}\` | ${de(measurement.tools)} | ${de(measurement.chars)} | ` +
        `${de(measurement.tokens)} | ${measurement.recorded === null ? "—" : de(measurement.recorded)} | ` +
        `${measurement.partOfDefinitions ? `${deRatio(share)} %` : "—"} |`,
    );
  }
  lines.push(
    `| **Summe der elf Endpunktgruppen** | ${de(tools.length)} | ${de(definitions.chars)} | ` +
      `${de(definitions.tokens)} | | 100,00 % |`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// Der Bericht als Text
// ---------------------------------------------------------------------------------------

/**
 * Bricht einen Absatz auf die Zeilenbreite dieses Repositories um (Biome: 100 Zeichen).
 *
 * Von Hand umbrochen wäre das nicht zu halten: Die Absätze tragen Zahlen, deren Breite erst
 * zur Laufzeit feststeht, und jede Messung würde die Umbrüche verschieben.
 */
function wrap(text: string, width = 98): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter((part) => part !== "")) {
    if (line === "") {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines.join("\n");
}

/** Ein Absatz aus mehreren Bruchstücken, umgebrochen. */
function prose(...parts: readonly string[]): string {
  return wrap(parts.join(" "));
}

/** Abschnitt 2: die Messtabelle. */
function measurementTable(): string {
  const rows = [
    "| Größe | Zeichen | Token | Zeichen je Token |",
    "| --- | --- | --- | --- |",
    row("54 Werkzeugdefinitionen, wie ausgeliefert", definitions),
    row("instructions, Auslieferungszustand", instructionsDefault),
    row("instructions, alle Schalter an", instructionsMax),
    row("Was der Client beim Verbinden sieht", connectTotal),
  ];
  if (p11 !== undefined) {
    rows.push(row("54 Definitionen in der Rechenweise von P11", p11));
  }
  return rows.join("\n");
}

/** Abschnitt 4: das Urteil über die beiden Budgets, als Folge von Absätzen. */
function budgetVerdict(): string[] {
  const paragraphs: string[] = [];

  paragraphs.push(
    overBudget
      ? prose(
          "**Das Budget der Werkzeugdefinitionen ist gerissen.**",
          `Gemessen ${de(definitions.tokens)} Token, Grenze`,
          `${de(budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)}. Überschuss`,
          `${de(definitions.tokens - budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)} Token.`,
        )
      : prose(
          "Das Budget der Werkzeugdefinitionen ist eingehalten:",
          `${de(definitions.tokens)} von ${de(budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)} Token.`,
        ),
  );

  if (p11 !== undefined) {
    paragraphs.push(
      prose(
        `In der Rechenweise von P11 sind es ${de(p11.tokens)} Token.`,
        "P11 bricht seit der Entscheidung vom 2026-09-13 wieder hart an der Grenze von",
        `${de(budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)} Token ab:`,
        p11OverBudget
          ? "Sie ist überschritten, und der Testlauf ist rot."
          : `noch ${de(budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET - p11.tokens)} Token Luft, der Testlauf ist grün.`,
      ),
    );
  }

  paragraphs.push(
    instructionsOverBudget
      ? prose(
          `**Das Budget der instructions ist gerissen**: ${de(instructionsMax.tokens)} Token im`,
          `größten Zustand, erlaubt sind ${de(budget.INSTRUCTIONS_TOKEN_BUDGET)}.`,
        )
      : prose(
          `Das Budget der instructions ist eingehalten: ${de(instructionsMax.tokens)} von`,
          `${de(budget.INSTRUCTIONS_TOKEN_BUDGET)} Token, gemessen im größten Zustand.`,
        ),
  );

  paragraphs.push(
    prose(
      "**Woher die Grenze von",
      `${de(budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)} Token kommt.** Plan 4.10 hatte 32.000`,
      "vorgerechnet, und dieser Wert war gerissen: Die Messung vom 2026-09-12 kam auf 48.305",
      "Token, ein Überschuss von 16.305. Die Reihenfolge der Gegenmaßnahmen aus 4.10 kann diese",
      "Lücke nicht schließen, und das ist ausgerechnet und nicht behauptet: 16.305 Token sind",
      "rund 66.700 Zeichen, während alle 54 Werkzeugbeschreibungen zusammen nur 32.654 Zeichen",
      "lang sind. Selbst wenn jede von ihnen vollständig in die Resources wanderte, wäre das",
      "weniger als die Hälfte. Übrig bliebe allein der Posten Parameterbeschreibungen mit 67.161",
      "Zeichen, der damit praktisch ganz entfallen müsste; das widerspricht E6, so wie Werkzeuge",
      "zu streichen oder zusammenzulegen E1 widerspricht. Der Projektinhaber hat das",
      "Budget deshalb am 2026-09-13 ausdrücklich auf den gemessenen Stand zuzüglich 695 Token",
      "Luft angehoben. Die Entscheidung steht in `CHANGELOG.md`, die Begründung in",
      "`src/registry/budget.ts`, und P11 bricht seither wieder hart an der Grenze ab statt nur",
      "zu warnen. Die zwischenzeitliche Sperrgrenze `TOOL_DEFINITION_TOKEN_REGRESSION_LIMIT`",
      "ist damit entfallen; zwei harte Zahlen nebeneinander wären dieselbe Grenze zweimal.",
    ),
    prose(
      "Die Luft ist mit Absicht klein. Sie trägt eine Umformulierung, aber weder ein weiteres",
      "Werkzeug noch ein Schemafeld von Gewicht. Die Postentabelle im nächsten Abschnitt sagt,",
      "wo die Zeichen sitzen. Sie ersetzt die Prüfung nicht: Aus einer Zeichenzahl folgt,",
      "welcher Posten größer ausgefallen ist als angesetzt, aber nicht, welche der sechs",
      "Sparmaßnahmen dort fehlt. Das ist an den Registereinträgen zu prüfen und gehört nicht in",
      "dieses Skript.",
    ),
  );

  if (overBudget || p11OverBudget) {
    paragraphs.push(
      prose(
        "**Was daraus folgt, verbindlich in dieser Reihenfolge (Plan 4.10):** erstens die",
        "Sparmaßnahmen S1 bis S6 nachziehen, wo sie noch nicht vollständig umgesetzt sind;",
        "zweitens die Beschreibungen der Stufe 3 auf die untere Wortgrenze kürzen; drittens",
        "weitere Inhalte aus den Beschreibungen in die Resources aus 7.7 verschieben. Werkzeuge",
        "zu streichen oder zusammenzulegen ist kein Hebel, E1 steht dem entgegen; das Budget",
        "stillschweigend anzuheben ebenfalls nicht. Reißt es nach allen drei Schritten immer",
        "noch, ist das ein Befund für den Projektinhaber und keine Zahl, die ein",
        "Implementierungs-Agent ändert.",
      ),
    );
  }

  return paragraphs;
}

const blocks: string[] = [
  "# Befund: das Tokenbudget, gemessen",

  prose(
    `**Stand: ${new Date().toISOString().slice(0, 10)} (UTC).** Diese Datei wird vollständig von`,
    "`scripts/measure-tokens.ts` erzeugt (`pnpm measure-tokens`, Arbeitspaket AP14). Von Hand",
    "geänderte Zahlen sind beim nächsten Lauf wieder weg.",
  ),

  prose(
    `Gemessen mit \`gpt-tokenizer@${tokenizerVersion()}\`, Kodierung \`o200k_base\` (Plan 13.9),`,
    `unter Node ${process.versions.node}. Es wurde nichts nachgeladen und kein Netz benutzt.`,
  ),

  "## 1. Der Tokenizer ist ein Stellvertreter",

  prose(
    "`o200k_base` ist die tatsächliche Kodierung der GPT-4o-Linie. Für andere Modellfamilien,",
    "die Claude-Linie eingeschlossen, ist der Tokenizer **nicht öffentlich dokumentiert**; die",
    "Zahlen unten sind dort eine belastbare Größenordnung und keine exakte Zahl für jeden",
    "Client. Für die Entscheidung, die an ihnen hängt — passt das in ein übliches",
    "Kontextfenster oder nicht —, genügt das: Sie kippt nicht an fünf Prozent Abweichung.",
  ),

  "## 2. Die Messung",

  measurementTable(),

  prose(
    'Die Zeile „wie ausgeliefert" misst genau das, was `server/register-tools.ts` an',
    "`registerTool` übergibt: Name, Titel, Beschreibung, Annotationen, das JSON Schema aus",
    "`schema/build.ts` und das offene Ausgabeschema aus `response/output-schema.ts`.",
  ),

  ...(p11 === undefined
    ? []
    : [
        p11.tokens === definitions.tokens
          ? prose(
              "P11 (`test/registry/token-budget.test.ts`) baut die Definition aus dem",
              "Registereintrag nach, weil die Prüfung vor den Paketen entstand, die",
              "`schema/build.ts` und `response/output-schema.ts` liefern. Der Nachbau ruft",
              "inzwischen genau diese beiden Module auf und misst deshalb denselben Gegenstand:",
              "Beide Zeilen der Tabelle stimmen auf das Token überein.",
            )
          : prose(
              "P11 (`test/registry/token-budget.test.ts`) baut die Definition aus dem",
              "Registereintrag selbst nach, weil die Prüfung vor den Paketen entstand, die diese",
              `beiden Module liefern. Die Lücke von ${de(Math.abs(definitions.tokens - p11.tokens))}`,
              "Token ist deshalb kein Messfehler: Gemessen werden zwei verschiedene Gegenstände.",
              "Die Prüfung misst gegen die eine Zahl, der Client bekommt die andere.",
            ),
      ]),

  "## 3. Das Zeichen-je-Token-Verhältnis",

  prose(
    `**Gemessen: ${deRatio(measuredRatio)} Zeichen je Token.** Plan 4.10 hatte **3,2**`,
    "angesetzt und ausdrücklich als Annahme gekennzeichnet. Die Annahme lag zu niedrig: Eine",
    "Werkzeugdefinition ist zum größeren Teil JSON-Struktur mit englischen Feldnamen, und die",
    "zerfällt in wenige, lange Token; der deutsche Fließtext drumherum kommt in `o200k_base`",
    `ebenfalls auf rund vier Zeichen je Token, nämlich auf ${deRatio(ratio(instructionsDefault))}`,
    "in den instructions, die fast nur Fließtext sind.",
  ),

  prose(
    "In `src/registry/budget.ts` steht `CHARS_PER_TOKEN` deshalb jetzt auf",
    `**${deExact(budget.CHARS_PER_TOKEN)}** statt auf 3,2. Der Wert ist gegenüber der Messung`,
    "**abgerundet**, und zwar mit Absicht: Die Konstante wird zur Laufzeit nur in",
    "`response/truncate.ts` (7.6) und in `doctor` (8.4) benutzt, und dort schätzt ein zu",
    "kleiner Faktor die Tokenzahl zu hoch, kürzt also eher zu früh. Plan 7.6 nennt genau diese",
    "Richtung die harmlose.",
  ),

  prose(
    "**Was die Zahl nicht sagt:** Sie ist an Werkzeugdefinitionen und am Servertext gemessen,",
    "nicht an API-Antworten. Antwortzeilen bestehen aus Kennungen, Datumswerten und Beträgen,",
    "die schlechter tokenisieren als Fließtext. Die Kürzung in 7.6 rechnet also mit einem",
    "Faktor, der für ihren eigenen Gegenstand eher zu groß ist — auch deshalb die Abrundung.",
  ),

  "## 4. Das Budget",

  ...budgetVerdict(),

  "## 4a. Die Werkzeugdefinitionen je Gruppe",

  prose(
    "Der Gruppenschalter `BB_MCP_TOOL_GROUPS` (N5) schaltet Werkzeuge gruppenweise ab. Diese",
    "Tabelle sagt, was eine Gruppe kostet und was ihr Abschalten spart. Jede Definition ist",
    "einzeln gemessen und danach addiert; die Summe einer Teilmenge ist damit exakt und keine",
    'Hochrechnung. Die Spalte „eingecheckt" ist die Zahl in `src/registry/groups.ts`, aus der',
    "Startmeldung, `doctor` und `print-config` ihre Angabe ohne Tokenizer bilden.",
  ),

  prose(
    "Die elf Endpunktgruppen sind über `TOOL_ENTRIES` gemessen, die Gruppe `bundles` über",
    "`BUNDLE_ENTRIES` und `bundleDefinitionJson` — die Bündel tragen einen eigenen Eintragstyp",
    "und stehen nicht im erzeugten Registerindex. Ihre Zeile steht am Ende und trägt in der",
    'Spalte „Anteil" einen Strich: Sie zählt nicht zu den 54 Endpunktwerkzeugen und damit nicht',
    "zu deren budgetierter Summe, sondern hat mit `BUNDLE_DEFINITION_TOKEN_BUDGET` ihre eigene",
    "Grenze.",
  ),

  groupTable(),

  ...(staleGroups.length === 0
    ? [prose("Messung und eingecheckte Tabelle stimmen in jeder Gruppe mit Werkzeugen überein.")]
    : [
        prose(
          "**Die eingecheckte Tabelle in `src/registry/groups.ts` ist veraltet.** Abweichend",
          "sind:",
          staleGroups
            .map(
              (measurement) =>
                `\`${measurement.group}\` (eingecheckt ` +
                `${measurement.recorded === null ? "nichts" : de(measurement.recorded)}, gemessen ` +
                `${de(measurement.tokens)})`,
            )
            .join(", ") + ".",
          "`test/registry/groups.test.ts` bricht daran ab; die Zahlen sind dort nachzutragen.",
        ),
      ]),

  bundleOverBudget
    ? prose(
        "**Das Budget der Bündelgruppe ist gerissen.**",
        `Gemessen ${de(bundleTokens)} Token, Grenze`,
        `${de(budget.BUNDLE_DEFINITION_TOKEN_BUDGET)}. Überschuss`,
        `${de(bundleTokens - budget.BUNDLE_DEFINITION_TOKEN_BUDGET)} Token. Die Grenze wird nicht`,
        "angehoben; das entscheidet der Projektinhaber (`src/registry/budget.ts`).",
      )
    : prose(
        "Das Budget der Bündelgruppe (`BUNDLE_DEFINITION_TOKEN_BUDGET`) ist eingehalten:",
        `${de(bundleTokens)} von ${de(budget.BUNDLE_DEFINITION_TOKEN_BUDGET)} Token.`,
        bundleTokens === 0
          ? "Die Gruppe `bundles` führt in diesem Stand noch kein Werkzeug; die Grenze ist damit" +
              " trivial eingehalten und noch keine Aussage."
          : "Die Grenze steht seit dem 2026-09-13 auf dem gemessenen Stand zuzüglich einer" +
              " kleinen Marge. Sinkt die Messung dauerhaft, wird sie nachgezogen; angehoben" +
              " wird sie nicht.",
      ),

  "## 5. Die Rechnung aus Plan 4.10, nachgeprüft",

  lineItemTable(),

  prose(
    'Die Spalte „angesetzt" ist die Endabrechnung aus Plan 4.10 nach den sechs',
    "Sparmaßnahmen. Gemessen wird in derselben Abgrenzung wie dort:",
    '„Parameterbeschreibungen" sind die Summe aller `description`-Texte im Eingabeschema, auf',
    "jeder Schachtelungstiefe, **ohne** die Schemastruktur drumherum; diese Struktur steckt in",
    'der Zeile „Name, Titel, Annotationen, Schemarümpfe", zusammen mit den Schlüsseln und',
    "Anführungszeichen des JSON. Die vier Zeilen addieren sich deshalb genau zur Summe.",
  ),

  prose(
    "Zwei Lesehilfen zu den Abweichungen. **Erstens:** Die Zeile `outputSchema` ist nicht Folge",
    "einer ausgelassenen Sparmaßnahme. S6 ist umgesetzt, und die Messung belegt es:",
    `${de(totalOutputTextChars)} Zeichen Feldbeschreibung in allen 54 Ausgabeschemata zusammen.`,
    "Größer als angesetzt ist das Schema, weil es den Umschlag dieses Servers mitbeschreibt:",
    "`endpoint`, die Paginierungstatsachen, `_contract_warnings`, die Ganzzahl-Cent-Felder und",
    "bei schreibenden Werkzeugen den aufgelösten Datensatz samt Rückweg. Das sind Zusagen aus",
    "7.1 und 7.6, keine Prosa.",
  ),

  prose(
    '**Zweitens:** Die Zeile „Schemarümpfe" war in 4.10 mit 97 Zeichen je Werkzeug angesetzt.',
    "Ein JSON Schema Draft 2020-12 über im Schnitt sechs Parameter, mit Typen, Grenzen, Enums",
    "und den Elementschemata der Positionslisten, ist um ein Vielfaches größer. Beide",
    "Abweichungen sind Rechenfehler der Schätzung und keine Abweichung von einer Vorgabe. Der",
    "Posten, der tatsächlich an den Registereinträgen hängt, ist die Zeile",
    '„Parameterbeschreibungen": Dort schlagen S1, S3, S4 und S5 zu Buche.',
  ),

  "## 6. Die zehn teuersten Werkzeugdefinitionen",

  [
    "| Werkzeug | Stufe | Zeichen | Token |",
    "| --- | --- | --- | --- |",
    ...dearest.map(
      (tool) =>
        `| \`${tool.name}\` | ${String(tool.tier)} | ${de(tool.chars)} | ${de(tool.tokens)} |`,
    ),
  ].join("\n"),

  prose(
    "Die Stufe ist das Beschreibungsbudget aus Plan 4.9 (900, 700 beziehungsweise 480",
    "Zeichen). Sie begrenzt allein die Werkzeugbeschreibung; der größere Teil einer teuren",
    "Definition ist das Eingabeschema mit seinen Parametertexten.",
  ),
];

const REPORT_FILE = "docs/entwicklung/befund-tokenbudget.md";
writeFileSync(filePath(REPORT_FILE), `${blocks.join("\n\n")}\n`, "utf8");

console.log(
  [
    `54 Werkzeugdefinitionen: ${de(definitions.chars)} Zeichen, ${de(definitions.tokens)} Token ` +
      `(Grenze ${de(budget.TOTAL_TOOL_DEFINITION_TOKEN_BUDGET)}).`,
    `instructions: ${de(instructionsDefault.chars)} Zeichen, ` +
      `${de(instructionsDefault.tokens)} Token im Auslieferungszustand, ` +
      `${de(instructionsMax.tokens)} Token im größten Zustand ` +
      `(Budget ${de(budget.INSTRUCTIONS_TOKEN_BUDGET)}).`,
    `Zeichen je Token: ${deRatio(measuredRatio)} gemessen, ` +
      `${deExact(budget.CHARS_PER_TOKEN)} in CHARS_PER_TOKEN.`,
    `Werkzeuggruppen: ${groupMeasurements
      .filter((measurement) => measurement.tools > 0)
      .sort((a, b) => {
        if (a.partOfDefinitions !== b.partOfDefinitions) return a.partOfDefinitions ? -1 : 1;
        return b.tokens - a.tokens;
      })
      .map(
        (measurement) => `${measurement.group} ${de(measurement.tools)}/${de(measurement.tokens)}`,
      )
      .join(", ")}.`,
    `Gruppe bundles: ${de(bundleTokens)} Token ` +
      `(Grenze ${de(budget.BUNDLE_DEFINITION_TOKEN_BUDGET)}).`,
    `Bericht geschrieben: ${REPORT_FILE}`,
  ].join("\n"),
);

if (staleGroups.length > 0) {
  console.error(
    `\nDie Gruppentabelle in src/registry/groups.ts ist veraltet: ${staleGroups
      .map(
        (measurement) =>
          `${measurement.group} eingecheckt ` +
          `${measurement.recorded === null ? "nichts" : de(measurement.recorded)}, gemessen ` +
          `${de(measurement.tokens)}`,
      )
      .join("; ")}. Die Zahlen sind dort nachzutragen; test/registry/groups.test.ts bricht ` +
      "sonst ab.",
  );
}

if (overBudget || p11OverBudget || instructionsOverBudget || bundleOverBudget) {
  console.error(
    "\nEin Budget ist gerissen. Die Reihenfolge der Gegenmaßnahmen steht im Bericht und in " +
      "Plan 4.10. Erzwungen wird in den Tests und nicht in diesem Skript: die Definitionen " +
      "und die instructions in P11 (test/registry/token-budget.test.ts), die Bündelgruppe in " +
      "test/bundles/read-bundles-contract.test.ts. P11 bricht seit dem " +
      "2026-09-13 wieder hart an der Grenze ab. Die Grenze anzuheben ist keine Nebenwirkung " +
      "dieses Laufs, sondern eine Entscheidung des Projektinhabers mit Eintrag in CHANGELOG.md.",
  );
}
