// Der Vergleich zweier Spezifikationen: `test/unit/spec-drift.test.ts`.
//
// **Diese Datei berührt das Netz nicht.** Sie prüft die reine Vergleichslogik aus
// `scripts/spec-drift.ts` mit kleinen Fixtures, die es selbst erfindet. Der Testlauf
// sperrt das Netz ohnehin (test/setup.ts); nur `scripts/check-spec-drift.ts` holt die
// Live-Spezifikation.
//
// **Warum diese Prüfung nötig ist.** Der Anlass war eine Spezifikationsänderung des
// Anbieters ohne erhöhte Versionsnummer. Ein Vergleich, der nur die Versionsnummer
// ansieht, findet das nicht. Ein Vergleich, der den vollständigen Inhalt ansieht, findet
// es — aber nur, wenn er semantisch ist: Die Reihenfolge der Schlüssel einer Datei ist
// kein Sachverhalt, die Reihenfolge der Elemente eines Arrays dagegen schon.

import { describe, expect, it } from "vitest";

import { compareSpecs, formatSpecDiff } from "../../scripts/spec-drift.js";

/**
 * Eine kleine Spezifikation mit zwei Pfaden und zwei Datentypen.
 *
 * Der Aufbau entspricht der eingecheckten Datei: `info.version`, darunter `paths` und
 * `definitions`.
 */
function baseSpec(): Record<string, unknown> {
  return {
    swagger: "2.0",
    info: { version: "1.9.1", title: "BuchhaltungsButler API" },
    host: "webapp.buchhaltungsbutler.de",
    paths: {
      "/receipts/get": {
        post: {
          summary: "get receipts",
          parameters: [{ in: "body", name: "api_key", required: true, type: "string" }],
        },
      },
      "/payments/get": {
        post: { summary: "get payments", parameters: [] },
      },
    },
    definitions: {
      Beleg: { type: "object", properties: { id_by_customer: { type: "string" } } },
      Zahlung: { type: "object", properties: { amount: { type: "number" } } },
    },
  };
}

describe("Der Vergleich zweier Spezifikationen", () => {
  it("erkennt gleiche Spezifikationen trotz anderer Schlüsselreihenfolge", () => {
    const local = baseSpec();
    const live = baseSpec();

    // Dieselben Angaben, nur in anderer Reihenfolge geschrieben. JSON-Objekte sind
    // ungeordnet, und die Reihenfolge einer Datei ist kein Sachverhalt.
    const liveReordered = {
      definitions: live.definitions,
      paths: live.paths,
      host: live.host,
      info: live.info,
      swagger: live.swagger,
    };

    const diff = compareSpecs(local, liveReordered);

    expect(diff.identical).toBe(true);
    expect(diff.addedPaths).toEqual([]);
    expect(diff.removedPaths).toEqual([]);
    expect(diff.changedPaths).toEqual([]);
    expect(diff.addedDefinitions).toEqual([]);
    expect(diff.removedDefinitions).toEqual([]);
    expect(diff.changedDefinitions).toEqual([]);
    expect(diff.changedTopLevelKeys).toEqual([]);
  });

  it("zählt die Reihenfolge der Elemente eines Arrays", () => {
    // Zwei Arrays mit denselben Elementen in anderer Reihenfolge sind nicht gleich:
    // Hier trägt die Position eine Bedeutung.
    const local = baseSpec();
    const live = baseSpec();
    (local.paths as Record<string, { post: { parameters: unknown[] } }>)[
      "/receipts/get"
    ].post.parameters = [{ name: "erst" }, { name: "zweit" }];
    (live.paths as Record<string, { post: { parameters: unknown[] } }>)[
      "/receipts/get"
    ].post.parameters = [{ name: "zweit" }, { name: "erst" }];

    const diff = compareSpecs(local, live);

    expect(diff.identical).toBe(false);
    expect(diff.changedPaths).toEqual(["/receipts/get"]);
  });

  it("meldet einen hinzugefügten Pfad", () => {
    const local = baseSpec();
    const live = baseSpec();
    (live.paths as Record<string, unknown>)["/receipts/add"] = {
      post: { summary: "add receipt", parameters: [] },
    };

    const diff = compareSpecs(local, live);

    expect(diff.identical).toBe(false);
    expect(diff.addedPaths).toEqual(["/receipts/add"]);
    expect(diff.removedPaths).toEqual([]);
    expect(diff.changedPaths).toEqual([]);
  });

  it("meldet einen entfernten Pfad", () => {
    const local = baseSpec();
    const live = baseSpec();
    // Entfernt aus der Live-Spezifikation: Der Anbieter hat den Pfad zurückgezogen.
    delete (live.paths as Record<string, unknown>)["/payments/get"];

    const diff = compareSpecs(local, live);

    expect(diff.identical).toBe(false);
    expect(diff.removedPaths).toEqual(["/payments/get"]);
    expect(diff.addedPaths).toEqual([]);
    expect(diff.changedPaths).toEqual([]);
  });

  it("meldet einen geänderten Parameter in einem bestehenden Pfad", () => {
    const local = baseSpec();
    const live = baseSpec();
    (live.paths as Record<string, { post: { parameters: unknown[] } }>)[
      "/receipts/get"
    ].post.parameters = [{ in: "body", name: "api_key", required: false, type: "string" }];

    const diff = compareSpecs(local, live);

    expect(diff.identical).toBe(false);
    expect(diff.changedPaths).toEqual(["/receipts/get"]);
    // Der Pfad steht auf beiden Seiten: Er ist geändert, nicht hinzugefügt.
    expect(diff.addedPaths).toEqual([]);
    expect(diff.removedPaths).toEqual([]);
  });

  it("meldet eine hinzugefügte und eine geänderte Definition", () => {
    const local = baseSpec();
    const live = baseSpec();
    (live.definitions as Record<string, unknown>).Kunde = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    (live.definitions as Record<string, unknown>).Beleg = {
      type: "object",
      properties: { id_by_customer: { type: "string" }, number: { type: "string" } },
    };

    const diff = compareSpecs(local, live);

    expect(diff.identical).toBe(false);
    expect(diff.addedDefinitions).toEqual(["Kunde"]);
    expect(diff.changedDefinitions).toEqual(["Beleg"]);
    expect(diff.removedDefinitions).toEqual([]);
  });

  it("meldet einen geänderten Schlüssel der obersten Ebene", () => {
    const local = baseSpec();
    const live = baseSpec();
    live.host = "app.buchhaltungsbutler.de";

    const diff = compareSpecs(local, live);

    expect(diff.identical).toBe(false);
    expect(diff.changedTopLevelKeys).toEqual(["host"]);
    // Die Pfade und die Datentypen bleiben unberührt.
    expect(diff.changedPaths).toEqual([]);
    expect(diff.changedDefinitions).toEqual([]);
  });

  it("nennt die Versionsangaben beider Seiten", () => {
    const local = baseSpec();
    const live = baseSpec();
    live.info = { version: "1.10.0", title: "BuchhaltungsButler API" };

    const diff = compareSpecs(local, live);

    expect(diff.versionLocal).toBe("1.9.1");
    expect(diff.versionLive).toBe("1.10.0");
  });

  it("hält alle Listen sortiert", () => {
    const local = baseSpec();
    const live = baseSpec();
    (live.paths as Record<string, unknown>)["/zzz/add"] = { post: {} };
    (live.paths as Record<string, unknown>)["/aaa/add"] = { post: {} };
    (live.definitions as Record<string, unknown>).Zulu = { type: "object" };
    (live.definitions as Record<string, unknown>).Alpha = { type: "object" };

    const diff = compareSpecs(local, live);

    expect(diff.addedPaths).toEqual(["/aaa/add", "/zzz/add"]);
    expect(diff.addedDefinitions).toEqual(["Alpha", "Zulu"]);
  });
});

describe("Der Klartext des Vergleichs", () => {
  it("meldet Gleichheit in einer Zeile", () => {
    const diff = compareSpecs(baseSpec(), baseSpec());
    const text = formatSpecDiff(diff);

    expect(text.split("\n")).toHaveLength(1);
    expect(text).toContain("gleich");
    expect(text).toContain("1.9.1");
  });

  it("weist auf gleiche Versionsnummern bei abweichendem Inhalt hin", () => {
    // Der eigentliche Anlass: Der Anbieter ändert den Inhalt, ohne die Version zu erhöhen.
    const local = baseSpec();
    const live = baseSpec();
    (live.paths as Record<string, unknown>)["/receipts/add"] = { post: {} };

    const diff = compareSpecs(local, live);
    const text = formatSpecDiff(diff);

    expect(diff.versionLocal).toBe(diff.versionLive);
    expect(text).toContain("dieselbe Versionsnummer");
    expect(text).toContain("/receipts/add");
  });

  it("nennt jede Kategorie mit Anzahl und Namen", () => {
    const local = baseSpec();
    const live = baseSpec();
    (live.paths as Record<string, unknown>)["/receipts/add"] = { post: {} };
    delete (live.paths as Record<string, unknown>)["/payments/get"];
    (live.paths as Record<string, { post: { summary: string } }>)["/receipts/get"].post.summary =
      "get all receipts";
    (live.definitions as Record<string, unknown>).Kunde = { type: "object" };
    live.host = "app.buchhaltungsbutler.de";

    const text = formatSpecDiff(compareSpecs(local, live));

    expect(text).toContain("Neue Pfade (1)");
    expect(text).toContain("Entfernte Pfade (1)");
    expect(text).toContain("Geänderte Pfade (1)");
    expect(text).toContain("Neue Datentypen (1)");
    expect(text).toContain("Geänderte Schlüssel der obersten Ebene (1)");
    expect(text).toContain("/receipts/add");
    expect(text).toContain("/payments/get");
    expect(text).toContain("/receipts/get");
    expect(text).toContain("Kunde");
    expect(text).toContain("host");
  });

  it("nennt beide Versionsangaben, wenn sie sich unterscheiden", () => {
    const local = baseSpec();
    const live = baseSpec();
    live.info = { version: "1.10.0", title: "BuchhaltungsButler API" };
    (live.paths as Record<string, unknown>)["/receipts/add"] = { post: {} };

    const text = formatSpecDiff(compareSpecs(local, live));

    expect(text).toContain("1.9.1");
    expect(text).toContain("1.10.0");
    expect(text).not.toContain("dieselbe Versionsnummer");
  });

  it("schweigt über die Versionsnummer, wenn keine der beiden Seiten eine hat", () => {
    const local: Record<string, unknown> = { paths: { "/x": { post: {} } } };
    const live: Record<string, unknown> = { paths: { "/x": { post: {} }, "/y": { post: {} } } };

    const text = formatSpecDiff(compareSpecs(local, live));

    expect(text).toContain("ohne Angabe");
    expect(text).not.toContain("dieselbe Versionsnummer");
  });
});
