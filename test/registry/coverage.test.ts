// P1, P2 und P3, dazu die Punkte 4 bis 7 des Deckungstests.
//
// Das ist der Test, der die beiden Vorgaben aus CONTRIBUTING.md Abschnitt 2 maschinell
// beweist, statt sie zu behaupten: genau ein Werkzeug je API-Endpunkt, und jeder Parameter
// des Endpunkts genau einmal im Werkzeug (Vollständigkeit vor Bequemlichkeit).
// Geprüft wird gegen src/generated/endpoints.ts, also gegen die maschinell aus
// docs/openapi/buchhaltungsbutler-v1.json erzeugte Parametermenge, und für die zweite
// Deckungsstufe zusätzlich gegen die Definitionen der Spezifikationsdatei selbst.
//
// Gegen das leere Register läuft jede Prüfung dieser Datei rot, und jede Meldung nennt den
// betroffenen Pfad und die noch nicht abgedeckten Parameternamen. Das ist beabsichtigt: Die
// rote Ausgabe ist die Arbeitsliste beim Nachrüsten.

import { describe, expect, it } from "vitest";

import {
  ENDPOINTS,
  REGISTRY,
  containerFields,
  definitionOf,
  endpointOf,
  entryBySpecPath,
  flatFields,
  parameterOf,
  resolveElementProperties,
  specPathOf,
  topLevelApiNames,
} from "../helpers/registry-fixtures.js";

// Prüfgrößen, maschinell ausgezählt und hier nicht gerundet.
const PATH_COUNT = 54;
const PARAMETERS_TOTAL = 371;
const PARAMETER_API_KEY = 54;
const PARAMETERS_DOMAIN = 317;

/** Die vier Endpunkte mit Pfadvorlage. `id_by_customer` ist dort ein Platzhalter. */
const PLACEHOLDER_PATHS: readonly string[] = [
  "/receipts/get/id_by_customer",
  "/receipts/delete/id_by_customer",
  "/receipts/restore/id_by_customer",
  "/transactions/get/id_by_customer",
];

/**
 * Die zweispaltige Zuordnung der zweiten Deckungsstufe, von Hand
 * abgeschrieben. Behälter und Element unterscheiden sich nur durch ein `s`; wer die falsche
 * Definition liest, hält ein Array für ein Objekt. Genau deshalb stehen hier zwei Spalten
 * und nicht ein Pfeil je Zeile.
 *
 * `element: undefined` heißt: Dieser Behälter führt seine Eigenschaften inline unter
 * `.items`. Das ist ausschließlich `PostingsFree`, und es ist der zweite der beiden Zweige,
 * die der Test abdecken muss.
 */
const SECOND_TIER_ROWS = [
  {
    path: "/receipts/addBatch",
    parameter: "receipts",
    container: "Receipts",
    element: "Receipt",
    properties: 13,
  },
  {
    path: "/transactions/addBatch",
    parameter: "transactions",
    container: "Transactions",
    element: "Transaction",
    properties: 13,
  },
  {
    path: "/transactions/assign-batch/receipt",
    parameter: "transactions_to_receipts",
    container: "TransactionsToReceipts",
    element: "TransactionToReceipt",
    properties: 2,
  },
  {
    path: "/postings/add-batch/receipts",
    parameter: "receipts",
    container: "ReceiptsPostings",
    element: "ReceiptPostings",
    properties: 9,
  },
  {
    path: "/postings/add-batch/transactions",
    parameter: "transactions",
    container: "TransactionsPostings",
    element: "TransactionPostings",
    properties: 8,
  },
  {
    path: "/settings/add-batch/debtors",
    parameter: "debtors",
    container: "SettingsDebtors",
    element: "SettingsDebtor",
    properties: 12,
  },
  {
    path: "/settings/add-batch/creditors",
    parameter: "creditors",
    container: "SettingsCreditors",
    element: "SettingsCreditor",
    properties: 12,
  },
  {
    path: "/postings/add-batch/free",
    parameter: "free_postings",
    container: "PostingsFree",
    element: undefined,
    properties: 8,
  },
] as const;

/**
 * Die beiden bekannten Spezifikationsfehler, als benannte Ausnahmeeinträge und
 * nicht stillschweigend ignoriert. Der Test schlägt auch dann fehl, wenn
 * ein Eintrag NICHT MEHR zutrifft, weil der Anbieter die Spezifikation korrigiert hat: Eine
 * verschwundene Ausnahme ist genauso berichtenswert wie eine neue.
 */
const SPEC_BUGS = [
  {
    def: "ReceiptPostings",
    property: "postingstexts",
    actual: "postingtexts",
    actualAt: "/postings/add/receipt",
    note: "Die Elementdefinition schreibt postingstexts, der Einzelendpunkt postingtexts. Die Spezifikation erklärt Stapelelement und Einzelendpunkt ausdrücklich für gleich; einer der beiden Namen ist also falsch gepflegt.",
  },
  {
    def: "PostingsFree",
    required: "amounts",
    actual: "amount",
    note: "PostingsFree.items.required nennt amounts, die Eigenschaft heißt amount. Der Fehler betrifft required und nicht die Eigenschaftsmenge; der Deckungsvergleich bleibt davon unberührt.",
  },
] as const;

/** Eine Liste von Beanstandungen wird als Text verglichen, damit alle Zeilen im Diff stehen. */
function expectNoIssues(problems: readonly string[]): void {
  expect(problems.join("\n")).toBe("");
}

describe("P1 Vollständigkeit: Pfadmenge des Registers gleich Pfadmenge des Generats", () => {
  it("ordnet jedem der 54 Spezifikationspfade genau einen Registereintrag zu", () => {
    const problems: string[] = [];

    for (const endpoint of ENDPOINTS) {
      const matches = REGISTRY.filter((tool) => specPathOf(tool) === endpoint.path);
      if (matches.length === 0) {
        const parameter = endpoint.parameters.map((item) => item.name).join(", ");
        problems.push(
          `${endpoint.path}: kein Registereintrag. Abzudeckende Parameter: ${parameter}.`,
        );
        continue;
      }
      if (matches.length > 1) {
        problems.push(
          `${endpoint.path}: ${String(matches.length)} Registereinträge (${matches
            .map((tool) => tool.name)
            .join(", ")}). Je Endpunkt ist genau ein Registereintrag zulässig.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("kennt keinen Registerpfad, den die Spezifikation nicht führt", () => {
    const problems: string[] = [];
    const knownPaths = new Set(ENDPOINTS.map((endpoint) => endpoint.path));

    for (const tool of REGISTRY) {
      const path = specPathOf(tool);
      if (!knownPaths.has(path)) {
        problems.push(
          `${tool.name}: Pfad ${path} steht nicht in der Spezifikation. Bei den vier Endpunkten mit Pfadvorlage ist path.specPath der unveränderte Schlüssel der Spezifikation.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("zählt 54 gegen 54", () => {
    expect(ENDPOINTS).toHaveLength(PATH_COUNT);
    expect(new Set(REGISTRY.map((tool) => specPathOf(tool))).size).toBe(PATH_COUNT);
  });
});

describe("P2 Eineindeutigkeit: kein Pfad zweimal, kein Name zweimal", () => {
  it("führt 54 Einträge mit 54 verschiedenen Namen", () => {
    const names = REGISTRY.map((tool) => tool.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect(duplicates.join(", ")).toBe("");
    expect(REGISTRY).toHaveLength(PATH_COUNT);
    expect(new Set(names).size).toBe(PATH_COUNT);
  });

  it("bildet Name und Spezifikationspfad in beide Richtungen eindeutig ab", () => {
    const problems: string[] = [];
    const pathToName = new Map<string, string>();

    for (const tool of REGISTRY) {
      const path = specPathOf(tool);
      const existing = pathToName.get(path);
      if (existing !== undefined) {
        problems.push(
          `${path}: von ${existing} und ${tool.name} belegt. Je Spezifikationspfad ist genau ein Werkzeug zulässig.`,
        );
        continue;
      }
      pathToName.set(path, tool.name);
    }

    expectNoIssues(problems);
    expect(pathToName.size).toBe(PATH_COUNT);
  });
});

describe("P3 Parameterdeckung, erste Stufe", () => {
  it("deckt je Endpunkt genau die Parametermenge des Generats ab", () => {
    const problems: string[] = [];

    for (const endpoint of ENDPOINTS) {
      const tool = entryBySpecPath(endpoint.path);
      if (tool === undefined) {
        const parameter = endpoint.parameters.map((item) => item.name).join(", ");
        problems.push(`${endpoint.path}: kein Registereintrag. Offene Parameter: ${parameter}.`);
        continue;
      }

      const covered = new Set<string>([
        ...topLevelApiNames(tool),
        ...tool.omitted.map((item) => item.apiName),
      ]);

      for (const parameter of endpoint.parameters) {
        if (!covered.has(parameter.name)) {
          problems.push(
            `${tool.name} (${endpoint.path}): Parameter ${parameter.name} ist in keinem Feld und nicht in omitted. Jeder Parameter des Endpunkts kommt genau einmal vor.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("kennt keinen apiName, der ins Leere zeigt", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const endpoint = endpointOf(specPathOf(tool));
      if (endpoint === undefined) continue;
      const knownParamNames = new Set(endpoint.parameters.map((parameter) => parameter.name));

      for (const field of tool.fields) {
        for (const apiName of field.apiNames) {
          if (!knownParamNames.has(apiName)) {
            problems.push(
              `${tool.name}, Feld ${field.name}: apiName ${apiName} gehört zu keinem Parameter von ${endpoint.path}.`,
            );
          }
        }
      }

      for (const omitted of tool.omitted) {
        if (!knownParamNames.has(omitted.apiName)) {
          problems.push(
            `${tool.name}: omitted nennt ${omitted.apiName}, diesen Parameter führt ${endpoint.path} nicht.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("kennt auch auf zweiter Stufe keinen apiName, der ins Leere zeigt", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const endpoint = endpointOf(specPathOf(tool));
      if (endpoint === undefined) continue;

      // Der erlaubte Vorrat für geschachtelte Felder ist die Vereinigung zweier Mengen, weil
      // die apiNames der itemFields zwei verschiedene Dinge bezeichnen: bei den
      // acht Stapelbehältern die Eigenschaften der ELEMENTdefinition, bei den Positionslisten
      // der Werkzeuge 17, 18, 19, 21 und 23 die parallelen Array-Parameter des Endpunkts.
      const allowedNames = new Set(endpoint.parameters.map((parameter) => parameter.name));
      for (const parameter of endpoint.parameters) {
        const ref = parameter.schema?.ref;
        if (ref === undefined) continue;
        const resolved = resolveElementProperties(ref);
        if (resolved.branch === "none") continue;
        for (const property of resolved.properties) allowedNames.add(property);
      }

      for (const { path, field, depth } of flatFields(tool)) {
        if (depth === 0) continue;
        for (const apiName of field.apiNames) {
          if (!allowedNames.has(apiName)) {
            problems.push(
              `${tool.name}, Feld ${path}: apiName ${apiName} ist weder ein Parameter von ${endpoint.path} noch eine Eigenschaft einer seiner Elementdefinitionen.`,
            );
          }
        }
      }
    }

    expectNoIssues(problems);
  });

  it("nennt keinen Parameternamen zweimal, auch nicht über zwei Felder hinweg", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const origins = new Map<string, string[]>();
      for (const field of tool.fields) {
        for (const apiName of field.apiNames) {
          origins.set(apiName, [...(origins.get(apiName) ?? []), field.name]);
        }
      }
      for (const omitted of tool.omitted) {
        origins.set(omitted.apiName, [...(origins.get(omitted.apiName) ?? []), "omitted"]);
      }

      for (const [apiName, locations] of origins) {
        if (locations.length > 1) {
          problems.push(
            `${tool.name}: apiName ${apiName} steht mehrfach (${locations.join(", ")}).`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("hält Felder mit source server oder path aus der Vereinigung heraus", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const { path, field } of flatFields(tool)) {
        if (field.source === "body") {
          if (field.apiNames.length === 0) {
            problems.push(
              `${tool.name}, Feld ${path}: source "body" ohne apiNames. Ein Body-Feld deckt mindestens einen Parameter ab.`,
            );
          }
          continue;
        }
        if (field.apiNames.length > 0) {
          problems.push(
            `${tool.name}, Feld ${path}: source "${field.source}" trägt apiNames (${field.apiNames.join(", ")}), erwartet ist ein leeres apiNames.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("begründet jeden omitted-Eintrag und lässt api_key als einzigen zu", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      const names = tool.omitted.map((item) => item.apiName);
      if (!names.includes("api_key")) {
        problems.push(
          `${tool.name}: api_key fehlt in omitted. Er erscheint nie als Feld und wird vom Request-Mapper gesetzt.`,
        );
      }
      for (const omitted of tool.omitted) {
        if (omitted.reason.trim() === "") {
          problems.push(`${tool.name}: omitted-Eintrag ${omitted.apiName} ohne Begründung.`);
        }
        if (omitted.apiName !== "api_key") {
          problems.push(
            `${tool.name}: omitted nennt ${omitted.apiName}. Im Auslieferungszustand ist api_key der einzige zulässige Eintrag.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("ergibt 371 Zuordnungen: 54 in omitted, 317 über die apiNames der fields", () => {
    const omittedTotal = REGISTRY.reduce((sum, tool) => sum + tool.omitted.length, 0);
    const fieldsTotal = REGISTRY.reduce((sum, tool) => sum + topLevelApiNames(tool).length, 0);

    expect(omittedTotal).toBe(PARAMETER_API_KEY);
    expect(fieldsTotal).toBe(PARAMETERS_DOMAIN);
    expect(omittedTotal + fieldsTotal).toBe(PARAMETERS_TOTAL);
  });
});

describe("P3 Parameterdeckung, zweite Stufe", () => {
  it("grenzt die zweite Stufe auf genau die acht Parameter mit schema.$ref ab", () => {
    const found: string[] = [];

    for (const endpoint of ENDPOINTS) {
      for (const parameter of endpoint.parameters) {
        if (parameter.schema?.ref !== undefined) {
          found.push(`${endpoint.path} ${parameter.name}`);
        }
      }
    }

    const expectedRows = SECOND_TIER_ROWS.map((row) => `${row.path} ${row.parameter}`);
    expect(found.sort()).toEqual([...expectedRows].sort());
  });

  it("löst sieben Behälter über $ref auf und einen inline, und meldet sonst einen Fehlschlag", () => {
    const problems: string[] = [];
    const branches: string[] = [];

    for (const row of SECOND_TIER_ROWS) {
      const resolved = resolveElementProperties(`#/definitions/${row.container}`);
      branches.push(resolved.branch);

      if (resolved.branch === "none") {
        problems.push(
          `${row.path}, Parameter ${row.parameter}: ${row.container} ließ sich nicht auflösen (${resolved.reason}). Weder $ref noch properties ist ein Fehlschlag und keine leere Menge.`,
        );
        continue;
      }

      if (row.element === undefined) {
        if (resolved.branch !== "inline") {
          problems.push(
            `${row.container}: erwartet ist der inline-Zweig, aufgelöst wurde ${resolved.branch}.`,
          );
        }
      } else if (resolved.branch !== "ref") {
        problems.push(
          `${row.container}: erwartet ist der $ref-Zweig auf ${row.element}, aufgelöst wurde ${resolved.branch}.`,
        );
      } else if (resolved.elementDefinition !== row.element) {
        problems.push(
          `${row.container}.items verweist auf ${resolved.elementDefinition}, erwartet ist ${row.element}. Behälter und Element unterscheiden sich nur durch ein s.`,
        );
      }

      if (resolved.properties.length !== row.properties) {
        problems.push(
          `${row.container}: ${String(resolved.properties.length)} Elementeigenschaften, erwartet sind ${String(row.properties)}.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(branches.filter((branch) => branch === "ref")).toHaveLength(7);
    expect(branches.filter((branch) => branch === "inline")).toHaveLength(1);
  });

  it("stimmt mit der Auflösung des Generats überein", () => {
    const problems: string[] = [];

    for (const row of SECOND_TIER_ROWS) {
      const parameter = parameterOf(row.path, row.parameter);
      const itemRef = parameter?.schema?.itemRef;
      const expectedItemRef =
        row.element === undefined ? undefined : `#/definitions/${row.element}`;
      if (itemRef !== expectedItemRef) {
        problems.push(
          `${row.path}, Parameter ${row.parameter}: das Generat nennt itemRef ${String(itemRef)}, die Spezifikation ergibt ${String(expectedItemRef)}.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("deckt die Eigenschaften der aufgelösten Elementdefinition mit den apiNames der itemFields", () => {
    const problems: string[] = [];

    for (const row of SECOND_TIER_ROWS) {
      const tool = entryBySpecPath(row.path);
      if (tool === undefined) {
        problems.push(
          `${row.path}: kein Registereintrag. Der Behälter ${row.parameter} muss itemFields für die ${String(row.properties)} Eigenschaften von ${row.element ?? row.container} führen.`,
        );
        continue;
      }

      const containerField = tool.fields.find((field) => field.apiNames.includes(row.parameter));
      if (containerField === undefined) {
        problems.push(`${tool.name}: kein Feld deckt den Behälterparameter ${row.parameter} ab.`);
        continue;
      }
      if (containerField.apiNames.length !== 1) {
        problems.push(
          `${tool.name}, Feld ${containerField.name}: ein Behälterfeld der zweiten Stufe nennt genau einen Body-Parameter, gefunden wurden ${containerField.apiNames.join(", ")}.`,
        );
      }
      if (containerField.itemFields === undefined) {
        problems.push(
          `${tool.name}, Feld ${containerField.name}: ohne itemFields bleibt das Innere von ${row.element ?? row.container} ungeprüft.`,
        );
        continue;
      }

      const resolved = resolveElementProperties(`#/definitions/${row.container}`);
      if (resolved.branch === "none") continue;

      const covered = new Set(containerField.itemFields.flatMap((field) => [...field.apiNames]));
      for (const property of resolved.properties) {
        if (!covered.has(property)) {
          problems.push(
            `${tool.name}, Feld ${containerField.name}: Eigenschaft ${property} von ${row.element ?? row.container} ist in keinem itemField.`,
          );
        }
      }
      for (const apiName of covered) {
        if (!resolved.properties.includes(apiName)) {
          problems.push(
            `${tool.name}, Feld ${containerField.name}: apiName ${apiName} gehört zu keiner Eigenschaft von ${row.element ?? row.container}.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });
});

describe("Pflichtfelder", () => {
  it("führt jeden Pflichtparameter der Spezifikation als Pflichtfeld", () => {
    const problems: string[] = [];

    for (const endpoint of ENDPOINTS) {
      const tool = entryBySpecPath(endpoint.path);
      if (tool === undefined) continue;
      const omitted = new Set(tool.omitted.map((item) => item.apiName));

      for (const parameter of endpoint.parameters) {
        if (!parameter.required || omitted.has(parameter.name)) continue;
        const field = tool.fields.find((item) => item.apiNames.includes(parameter.name));
        if (field === undefined) continue;
        if (!field.required) {
          problems.push(
            `${tool.name}, Feld ${field.name}: Parameter ${parameter.name} ist laut Spezifikation required, das Feld aber optional. required darf verschärft, nie gelockert werden.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("führt jede Pflichteigenschaft der acht Elementdefinitionen als Pflichtfeld", () => {
    const problems: string[] = [];
    // Der bekannte Spezifikationsfehler: PostingsFree.items.required nennt
    // amounts, die Eigenschaft heißt amount. Ein Pflichtfeld dazu gibt es nicht, weil es
    // die Eigenschaft nicht gibt.
    const exceptions = new Set<string>(
      SPEC_BUGS.flatMap((bug) => ("required" in bug ? [bug.required] : [])),
    );

    for (const row of SECOND_TIER_ROWS) {
      const tool = entryBySpecPath(row.path);
      if (tool === undefined) continue;
      const containerField = tool.fields.find((field) => field.apiNames.includes(row.parameter));
      if (containerField?.itemFields === undefined) continue;

      const resolved = resolveElementProperties(`#/definitions/${row.container}`);
      if (resolved.branch === "none") continue;

      for (const name of resolved.required) {
        if (exceptions.has(name)) continue;
        const field = containerField.itemFields.find((item) => item.apiNames.includes(name));
        if (field === undefined) continue;
        if (!field.required) {
          problems.push(
            `${tool.name}, Feld ${containerField.name}[].${field.name}: Eigenschaft ${name} von ${row.element ?? row.container} ist required, das Feld aber optional.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("enthält im Auslieferungszustand keine einzige Verschärfung, und jede trägt einen Grund", () => {
    const stricterFields: string[] = [];
    const missingReasons: string[] = [];

    for (const tool of REGISTRY) {
      const endpoint = endpointOf(specPathOf(tool));
      if (endpoint === undefined) continue;
      const requiredNames = new Set(
        endpoint.parameters.filter((parameter) => parameter.required).map((item) => item.name),
      );

      // Nur die oberste Body-Ebene: Felder mit source "path" oder "server" haben ein leeres
      // apiNames und sind deshalb gegenüber der Spezifikation nicht vergleichbar.
      for (const field of tool.fields) {
        if (field.source !== "body" || !field.required) continue;
        if (field.apiNames.some((apiName) => requiredNames.has(apiName))) continue;
        stricterFields.push(
          `${tool.name}, Feld ${field.name} (${field.apiNames.join(", ")}): required gegenüber der Spezifikation verschärft.`,
        );
        if (field.requiredReason === undefined || field.requiredReason.trim() === "") {
          missingReasons.push(
            `${tool.name}, Feld ${field.name}: Verschärfung ohne requiredReason. Der Grund nennt die Belegstelle.`,
          );
        }
      }
    }

    expectNoIssues(missingReasons);
    // Der Auslieferungszustand enthält keine Verschärfung. Wird
    // später eine bewusst entschieden, sind Erwartungswert und requiredReason gemeinsam zu
    // setzen; genau das hält den Vorgang sichtbar.
    expectNoIssues(stricterFields);
  });
});

describe("Die beiden bekannten Spezifikationsfehler", () => {
  it("trifft noch zu: ReceiptPostings schreibt postingstexts, der Einzelendpunkt postingtexts", () => {
    const bug = SPEC_BUGS[0];
    const element = definitionOf(bug.def);

    expect(Object.keys(element?.properties ?? {})).toContain(bug.property);
    expect(parameterOf(bug.actualAt, bug.actual)?.name).toBe(bug.actual);
    // Eine verschwundene Ausnahme ist genauso berichtenswert wie eine neue: Hat der Anbieter
    // korrigiert, schlägt diese Prüfung fehl und der Eintrag wird bewusst entfernt.
    expect(Object.keys(element?.properties ?? {})).not.toContain(bug.actual);
  });

  it("trifft noch zu: PostingsFree.items.required nennt amounts, die Eigenschaft heißt amount", () => {
    const bug = SPEC_BUGS[1];
    const containerField = definitionOf(bug.def);
    const items = containerField?.items;
    const properties = Object.keys(items?.properties ?? {});

    expect(items?.required ?? []).toContain(bug.required);
    expect(properties).toContain(bug.actual);
    expect(properties).not.toContain(bug.required);
  });
});

describe("Die vier Endpunkte mit Pfadvorlage", () => {
  it("führt an diesen vier Pfaden keinen Parameter id_by_customer", () => {
    const problems: string[] = [];

    for (const path of PLACEHOLDER_PATHS) {
      const endpoint = endpointOf(path);
      if (endpoint === undefined) {
        problems.push(`${path}: steht nicht im Generat.`);
        continue;
      }
      if (endpoint.parameters.some((parameter) => parameter.name === "id_by_customer")) {
        problems.push(
          `${path}: die Spezifikation führt hier einen Parameter id_by_customer. Der Pfadbau beruht darauf, dass sie das nicht tut.`,
        );
      }
    }

    expectNoIssues(problems);
  });

  it("führt die vier Einträge als Vorlage mit specPath und einem Feld mit source path", () => {
    const problems: string[] = [];

    for (const templatePath of PLACEHOLDER_PATHS) {
      const tool = entryBySpecPath(templatePath);
      if (tool === undefined) {
        problems.push(
          `${templatePath}: kein Registereintrag. Erwartet wird path: { template, params, specPath: "${templatePath}" } und ein Feld mit source "path".`,
        );
        continue;
      }

      if ("literal" in tool.path) {
        problems.push(
          `${tool.name}: trägt path.literal. Bei diesem Endpunkt ist id_by_customer ein Platzhalter für den Wert.`,
        );
        continue;
      }

      if (tool.path.specPath !== templatePath) {
        problems.push(
          `${tool.name}: specPath ist ${tool.path.specPath}, erwartet ist ${templatePath}.`,
        );
      }
      if (tool.path.params.length === 0) {
        problems.push(`${tool.name}: path.params ist leer.`);
      }
      for (const param of tool.path.params) {
        if (!tool.path.template.includes(`{${param}}`)) {
          problems.push(
            `${tool.name}: die Vorlage ${tool.path.template} enthält keinen Platzhalter {${param}}.`,
          );
        }
      }

      const pathFields = tool.fields.filter((field) => field.source === "path");
      if (pathFields.length !== tool.path.params.length) {
        problems.push(
          `${tool.name}: ${String(pathFields.length)} Felder mit source "path", aber ${String(tool.path.params.length)} Platzhalter in der Vorlage.`,
        );
      }

      for (const { path, field } of flatFields(tool)) {
        if (field.name === "id_by_customer") {
          problems.push(
            `${tool.name}, Feld ${path}: der Identifikator heißt im Werkzeugschema nicht id_by_customer, und er geht nie in den Body.`,
          );
        }
        if (field.apiNames.includes("id_by_customer")) {
          problems.push(
            `${tool.name}, Feld ${path}: apiName id_by_customer. An diesen vier Pfaden gibt es diesen Parameter nicht.`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });

  it("führt die übrigen 50 Endpunkte als literal", () => {
    const problems: string[] = [];
    const templatePaths = new Set(PLACEHOLDER_PATHS);

    for (const tool of REGISTRY) {
      const path = specPathOf(tool);
      if (templatePaths.has(path)) continue;
      if (!("literal" in tool.path)) {
        problems.push(
          `${tool.name}: trägt eine Pfadvorlage, obwohl ${path} konstant ist. Nur die vier Endpunkte tragen eine Vorlage.`,
        );
      }
    }

    expectNoIssues(problems);
    expect(REGISTRY.filter((tool) => "literal" in tool.path)).toHaveLength(PATH_COUNT - 4);
  });

  it("verlangt bei Behälterfeldern keine Pfadsegmente", () => {
    const problems: string[] = [];

    for (const tool of REGISTRY) {
      for (const { path, field } of containerFields(tool)) {
        if (field.source !== "body") {
          problems.push(
            `${tool.name}, Feld ${path}: ein Behälterfeld erzeugt Body-Parameter und trägt deshalb source "body", nicht "${field.source}".`,
          );
        }
      }
    }

    expectNoIssues(problems);
  });
});
