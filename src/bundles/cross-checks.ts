// Die Querprüfungen der Bündel, nach dem Muster Q1 bis Q9.
//
// **Warum eigene Kennungen und kein Anhängen an Q1 bis Q9.** Die neun Querprüfungen des
// Registers hängen an Endpunkten: Q2 schlägt das `limit`-Maximum eines Spezifikationspfades
// nach, Q7 die Sortierform desselben Pfades. Ein Bündel hat keinen einen Pfad. Die drei
// Prüfungen hier hängen dagegen an der Kombination der Bündelargumente und sind an keinem
// Endpunktwerkzeug anwendbar. Sie stehen deshalb getrennt, und `CrossCheckId` in
// `src/registry/types.ts` bleibt unverändert — dieselbe Trennung wie bei `BundleEntry`
// gegenüber `ToolEntry`.
//
// Die gemeinsamen Prüfungen werden weiterhin benutzt und nicht nachgebaut: Q1
// (`date_from <= date_to`) und Q3 (kein leerer String) hängen an jedem Bündel mit Datumsfeldern
// beziehungsweise an jedem Bündel überhaupt.

import { z } from "zod";

import { applyCrossChecks, type CrossCheckTool } from "../schema/cross-checks.js";
import type { CrossCheckId } from "../registry/types.js";

/** Die Kennungen der bündeleigenen Querprüfungen. Abschließend. */
export type BundleCheckId = "B1" | "B2" | "B3" | "B4" | "B5";

type Args = Record<string, unknown>;
type Ctx = z.core.$RefinementCtx<unknown>;

interface BundleCheck {
  readonly id: BundleCheckId;
  /** Was die Prüfung tut, in einem Satz. */
  readonly summary: string;
  run(args: Args, ctx: Ctx): void;
}

function addIssue(ctx: Ctx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", message, path, continue: true });
}

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Der Schlusssatz jeder Bündelablehnung: Es ging nichts hinaus. */
const NOTHING_SENT =
  "Der Aufruf ist vor dem ersten Request abgelehnt worden, an die API ist nichts hinausgegangen.";

/**
 * B1: Bei `resource` = `postings` sind `date_from` und `date_to` Pflicht.
 *
 * Nicht der Server verschärft hier, sondern der Endpunkt: `/postings/get` führt beide Felder
 * als Pflichtangabe, und einen unbegrenzten Abruf gibt es dort nicht. Ein JSON Schema kann die
 * Bedingung nicht ausdrücken, weil sie am Wert eines anderen Feldes hängt; ohne B1 setzte das
 * Bündel einen Request ab, von dem vorher feststeht, dass er scheitert.
 */
const B1: BundleCheck = {
  id: "B1",
  summary: "date_from und date_to sind bei resource=postings Pflicht",
  run(args, ctx) {
    if (args["resource"] !== "postings") {
      return;
    }
    for (const name of ["date_from", "date_to"] as const) {
      if (!isSet(args[name])) {
        addIssue(
          ctx,
          [name],
          `${name} fehlt. Bei resource 'postings' verlangt der Endpunkt /postings/get beide ` +
            `Zeitgrenzen; einen Abruf aller Buchungen ohne Zeitraum gibt es nicht. ${NOTHING_SENT}`,
        );
      }
    }
  },
};

/** Welches Feld zu welcher Ressource gehört. Die Tabelle ist die Wahrheit, nicht der Code. */
const FIELDS_BY_RESOURCE: Readonly<Record<string, "receipts" | "transactions">> = Object.freeze({
  list_direction: "receipts",
  payment_status: "receipts",
  counterparty: "receipts",
  invoicenumber: "receipts",
  account: "transactions",
});

/**
 * B2: Ein Filter nur zu der Ressource, die ihn kennt.
 *
 * Ein `payment_status` an einer Buchungsliste wäre kein Filter, sondern ein stillschweigend
 * ignoriertes Argument — und ein ignoriertes Argument ist in einer Buchhaltung ein Datenfehler:
 * Der Agent glaubt, er habe nach offenen Belegen gefragt, und bekommt alles.
 */
const B2: BundleCheck = {
  id: "B2",
  summary: "Filterfelder passen zur gewählten resource",
  run(args, ctx) {
    const resource = args["resource"];
    if (typeof resource !== "string") {
      return;
    }
    for (const [field, belongsTo] of Object.entries(FIELDS_BY_RESOURCE)) {
      if (!isSet(args[field]) || belongsTo === resource) {
        continue;
      }
      addIssue(
        ctx,
        [field],
        `${field} gilt nur bei resource '${belongsTo}', gesetzt ist resource '${resource}'. ` +
          "Das Feld wird nicht stillschweigend übergangen: Ein ignorierter Filter sieht in der " +
          `Antwort aus wie ein angewandter. ${NOTHING_SENT}`,
      );
    }
  },
};

/** Die beiden Kennungen, von denen ein Zuordnungsabruf genau eine verlangt. */
const ASSIGNMENT_KEYS = ["receipt_id_by_customer", "transaction_id_by_customer"] as const;

/**
 * B3: genau eine von `receipt_id_by_customer` und `transaction_id_by_customer`.
 *
 * Die beiden Nummernräume sind getrennt: Beleg 1590 und Zahlung 1590 sind verschiedene Dinge.
 * Keines von beiden gesetzt hieße, der Server müsste raten, was gemeint ist; beide gesetzt
 * hieße, er müsste sich für eines entscheiden. Beides ist schlechter als eine Absage, die
 * nichts kostet.
 */
const B3: BundleCheck = {
  id: "B3",
  summary: "genau eine von receipt_id_by_customer und transaction_id_by_customer",
  run(args, ctx) {
    const provided = ASSIGNMENT_KEYS.filter((name) => isSet(args[name]));
    if (provided.length === 1) {
      return;
    }
    const situation =
      provided.length === 0
        ? "Gesetzt ist keine von beiden; ohne Kennung gibt es nichts abzurufen."
        : "Gesetzt sind beide; ein Aufruf kann nur einen Vorgang zum Einstieg haben.";
    addIssue(
      ctx,
      [],
      `${ASSIGNMENT_KEYS[0]} und ${ASSIGNMENT_KEYS[1]} schließen einander aus: Genau eine der ` +
        `beiden Kennungen ist anzugeben. ${situation} Die beiden Nummernräume sind getrennt, ` +
        `Beleg 1590 und Zahlung 1590 sind verschiedene Vorgänge. ${NOTHING_SENT}`,
    );
  },
};

/**
 * B4: `group_by` = `counterparty` verlangt eine Ressource mit Gegenpartei.
 *
 * Eine Buchungszeile aus `/postings/get` führt keine Gegenpartei, sondern einen Buchungstext.
 * Nach ihr zu gruppieren hieße, den Buchungstext als Gegenpartei auszugeben; das Ergebnis sähe
 * wie eine Auswertung aus und wäre keine. Stilles Zurückfallen auf `none` wäre die zweite
 * schlechte Wahl: Der Agent glaubte dann, er habe nach Gegenparteien gruppiert.
 */
const B4: BundleCheck = {
  id: "B4",
  summary: "group_by counterparty nur bei receipts und transactions",
  run(args, ctx) {
    if (args["group_by"] !== "counterparty" || args["resource"] !== "postings") {
      return;
    }
    addIssue(
      ctx,
      ["group_by"],
      "group_by 'counterparty' gibt es bei resource 'postings' nicht: Eine Buchungszeile führt " +
        "keine Gegenpartei, sondern einen Buchungstext. Zu nehmen sind 'month' oder 'none'; " +
        `nach Gegenparteien gruppieren resource 'receipts' und 'transactions'. ${NOTHING_SENT}`,
    );
  },
};

/**
 * B5: `base` nur bei `report_type` = `sums`.
 *
 * Stilles Ignorieren wäre verstecktes Verhalten und fachlich gefährlich: BWA und Summenliste
 * ruhten dann auf unterschiedlichen Datumsbegriffen und würden trotzdem gegeneinander
 * gerechnet. `/reports/create/bwa` kennt den Parameter überhaupt nicht
 * (`docs/api/berichte.md` 4.2); der Wert verfiele kommentarlos, und die Antwort sähe aus, als
 * sei er angewandt worden.
 */
const B5: BundleCheck = {
  id: "B5",
  summary: "base ausschließlich bei report_type sums",
  run(args, ctx) {
    if (args["report_type"] !== "bwa" || !isSet(args["base"])) {
      return;
    }
    addIssue(
      ctx,
      ["base"],
      "base gilt nur für report_type 'sums'. /reports/create/bwa kennt den Parameter nicht; " +
        "der Wert würde kommentarlos verfallen, und die BWA ruhte dann auf einem anderen " +
        "Datumsbegriff als die Summenliste, obwohl beide gegeneinander gerechnet werden. " +
        `Entweder base weglassen oder report_type 'sums' setzen. ${NOTHING_SENT}`,
    );
  },
};

/** Die fünf bündeleigenen Querprüfungen, geschlüsselt nach ihrer Kennung. */
export const BUNDLE_CHECKS: Readonly<Record<BundleCheckId, BundleCheck>> = Object.freeze({
  B1,
  B2,
  B3,
  B4,
  B5,
});

/**
 * Hängt Querprüfungen an ein Objektschema: erst die gemeinsamen Q-Prüfungen, dann die
 * bündeleigenen.
 *
 * Die Reihenfolge der Meldungen ist damit stabil und dieselbe wie im Register: Q vor B,
 * innerhalb jeder Gruppe nach Kennung.
 */
export function applyBundleChecks<T extends z.ZodType>(
  schema: T,
  crossChecks: readonly CrossCheckId[],
  bundleChecks: readonly BundleCheckId[],
  tool: CrossCheckTool,
): z.ZodType {
  const withShared = applyCrossChecks(schema, crossChecks, tool);
  const seen = new Set<BundleCheckId>();
  for (const id of bundleChecks) {
    if (seen.has(id)) {
      throw new Error(`${tool.toolName} führt die Querprüfung ${id} doppelt.`);
    }
    seen.add(id);
  }
  if (seen.size === 0) {
    return withShared;
  }
  const ordered = (Object.keys(BUNDLE_CHECKS) as BundleCheckId[]).filter((id) => seen.has(id));
  return withShared.superRefine((value: unknown, ctx: Ctx) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return;
    }
    for (const id of ordered) {
      BUNDLE_CHECKS[id].run(value as Args, ctx);
    }
  });
}
