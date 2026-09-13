// Die Querprüfungen Q1 bis Q9 aus Plan 4.7 als superRefine-Bausteine.
//
// Sie laufen am Schema und damit **vor** jedem Request (Guard 4, Plan 1.4). Jede fängt
// einen Fehler ab, der sonst als falscher Datensatz in der Buchhaltung landet. Welche
// Prüfung an welchem Werkzeug hängt, steht im Registereintrag im Feld `crossChecks`.
//
// Zwei Prüfungen des Entwurfsstandes sind ersatzlos gestrichen und werden hier
// ausdrücklich **nicht** implementiert (Plan 4.7):
//
//   - „Summe der Positionsbeträge entspricht dem Beleg- oder Zahlungsbetrag": Der
//     Vergleichswert ist an keinem der betroffenen Endpunkte ein Argument des Aufrufs. Die
//     Prüfung wäre nur mit einem zusätzlichen lesenden Aufruf möglich, und der widerspräche
//     Regel 2 aus 7.5. Die API prüft die Summe selbst, und ihre Meldung steht im
//     Fehlerkatalog.
//   - „Gegenseitiger Ausschluss von id_by_customer_from/_to und der Sortierung":
//     `/transactions/get` hat überhaupt keinen `order`-Parameter, und die Spezifikation
//     erlaubt die Kombination mit den Datumsfeldern ausdrücklich. Ersatz ist ein
//     Pflichtsatz in beiden Parameterbeschreibungen.
//
// Eine superRefine läuft nur, wenn die Feldprüfungen davor durchgelaufen sind. Jede Prüfung
// hier darf deshalb annehmen, dass die Typen stimmen, und muss nur noch die Beziehungen
// zwischen Feldern prüfen.

import type { z } from "zod";

import { positionLabel } from "../errors/path-label.js";
import type { CrossCheckId } from "../registry/types.js";
import { limitMaximumFor } from "./pagination.js";
import {
  ORDER_FORM_BY_PATH,
  POSTINGS_ORDER_VALUES,
  POSTING_ACCOUNTS_ORDER_VALUES,
  RECEIPTS_ORDER_FIELDS,
  type OrderForm,
} from "./order.js";

/** Was eine Querprüfung über das Werkzeug wissen muss, an dem sie hängt. */
export interface CrossCheckTool {
  readonly toolName: string;
  /**
   * Der **unveränderte** Spezifikationspfad (Plan 4.6). Nachgeschlagen wird immer damit,
   * niemals mit dem gebauten Pfad: Der trägt bei vier Werkzeugen eine Geschäftskennung.
   */
  readonly specPath: string;
  /** Die wirksame Mengengrenze `min(50, BB_MCP_MAX_BATCH)` für Q4. */
  readonly maxItems: number;
}

type Args = Record<string, unknown>;
type Ctx = z.core.$RefinementCtx<unknown>;

/** Eine Querprüfung: Kennung, Kurzbeschreibung und die Prüfung selbst. */
export interface CrossCheck {
  readonly id: CrossCheckId;
  /** Was die Prüfung tut, in einem Satz. Sie steht so in der Übersicht von Plan 4.7. */
  readonly summary: string;
  run(args: Args, ctx: Ctx, tool: CrossCheckTool): void;
  /**
   * Prüft beim Bau des Schemas, ob diese Prüfung an diesem Werkzeug überhaupt etwas prüfen
   * kann. Fehlt die Grundlage, ist das ein Verdrahtungsfehler und kein Laufzeitfall.
   *
   * @throws Error mit der Begründung.
   */
  assertApplicable?(tool: CrossCheckTool): void;
}

// --- Hilfsmittel ---------------------------------------------------------------------

function addIssue(ctx: Ctx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", message, path, continue: true });
}

function stringOf(args: Args, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Die Objektlisten eines Aufrufs, also Stapelbehälter und Positionslisten auf oberster
 * Ebene. Beides sind Arrays aus Objekten; ein Array aus Skalaren gibt es im Werkzeugschema
 * nicht, weil die 32 parallelen Arrays der Spezifikation zu Positionslisten werden (4.8).
 */
function objectLists(args: Args): { field: string; items: Args[] }[] {
  const lists: { field: string; items: Args[] }[] = [];
  for (const [field, value] of Object.entries(args)) {
    if (Array.isArray(value)) {
      lists.push({ field, items: value.filter(isRecord) });
    }
  }
  return lists;
}

/**
 * Die Position in menschlicher Zählung. Der Text nennt „Position 2" für den zweiten
 * Eintrag, der maschinell auswertbare `path` trägt weiterhin den Index 1.
 *
 * Die Wortwahl steht in `errors/path-label.ts` und nicht hier: Guard 3, Guard 4, Guard 5 und
 * der Request-Mapper benennen dieselbe Listenstelle, und sie sollen sie gleich benennen.
 */
function humanPosition(index: number): string {
  return positionLabel(index);
}

/**
 * Ein Wert als Text für eine Fehlermeldung.
 *
 * Ein Objekt über die Zeichenkettenumwandlung laufen zu lassen ergäbe `[object Object]` und
 * sagte dem Aufrufer nichts darüber, was er geschickt hat.
 */
function render(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value) ?? String(value);
}

/** Trägt ein Betragsstring den Wert null? Auch `-0.00` und `0` gehören dazu. */
function isZeroAmount(value: unknown): boolean {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) {
    return false;
  }
  return Number.parseFloat(value) === 0;
}

// --- Q1 bis Q9 -----------------------------------------------------------------------

/**
 * Q1: `date_from <= date_to`.
 *
 * Vertauschte Grenzen liefern still eine leere Liste und, an `bb_reports_create_bwa` und
 * `bb_reports_create_sums`, einen falschen Bericht, der den vorherigen ersetzt.
 *
 * Der Zeichenkettenvergleich genügt: Beide Felder tragen `YYYY-MM-DD`, und dieses Format
 * ist lexikografisch wie chronologisch geordnet.
 */
const Q1: CrossCheck = {
  id: "Q1",
  summary: "date_from liegt nicht nach date_to",
  run(args, ctx) {
    const from = stringOf(args, "date_from");
    const to = stringOf(args, "date_to");
    if (from === undefined || to === undefined || from <= to) {
      return;
    }
    addIssue(
      ctx,
      ["date_to"],
      `date_from (${from}) liegt nach date_to (${to}). Vertauschte Grenzen liefern still ein ` +
        "leeres oder falsches Ergebnis; die API meldet dazu nichts.",
    );
  },
};

/**
 * Q2: `limit` innerhalb des endpunktspezifischen Maximums.
 *
 * Die API kappt nicht, sie lehnt ab. Das Maximum steht als `maximum` im Schema und wird
 * hier ein zweites Mal geprüft, weil Guard 4 dieselbe Grenze noch einmal nennen soll und
 * weil ein Registereintrag ein `limit` auch ohne den Baustein aus `pagination.ts` führen
 * dürfte.
 */
const Q2: CrossCheck = {
  id: "Q2",
  summary: "limit innerhalb des belegten Maximums dieses Endpunkts",
  assertApplicable(tool) {
    if (limitMaximumFor(tool.specPath) === null) {
      throw new Error(
        `Q2 ist an ${tool.toolName} (${tool.specPath}) nicht anwendbar: Für diesen Endpunkt ` +
          "ist keine Obergrenze für limit dokumentiert. Eine erfundene Schranke lehnte " +
          "gültige Aufrufe unsichtbar vor dem Request ab (Plan 4.7, 7.5); dort gilt " +
          "stattdessen der Warnsatz aus pagination.ts.",
      );
    }
  },
  run(args, ctx, tool) {
    const maximum = limitMaximumFor(tool.specPath);
    const value = args["limit"];
    if (maximum === null || typeof value !== "number" || value <= maximum) {
      return;
    }
    addIssue(
      ctx,
      ["limit"],
      `limit=${String(value)} übersteigt die Obergrenze ${String(maximum)} von ${tool.specPath}. ` +
        "Die API kappt den Wert nicht, sie lehnt den Aufruf ab.",
    );
  },
};

/**
 * Q3: kein leerer String, an keinem Feld und in keiner Tiefe.
 *
 * Ein leerer String ist bei dieser API ein Validierungsfehler und bedeutet nicht „nicht
 * gesetzt". Die Meldung nennt deshalb ausdrücklich das Weglassen als richtigen Weg.
 */
const Q3: CrossCheck = {
  id: "Q3",
  summary: "kein leerer String in einem Feld",
  run(args, ctx) {
    walkForEmptyStrings(args, [], ctx);
  },
};

function walkForEmptyStrings(value: unknown, path: (string | number)[], ctx: Ctx): void {
  if (typeof value === "string") {
    if (value === "") {
      addIssue(
        ctx,
        path,
        `${path.join(".")} ist ein leerer String. Bei dieser API ist ein leerer String ein ` +
          "Validierungsfehler und nicht die Angabe „nicht gesetzt“; das Feld stattdessen " +
          "weglassen.",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      walkForEmptyStrings(entry, [...path, index], ctx);
    });
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      walkForEmptyStrings(entry, [...path, key], ctx);
    }
  }
}

/**
 * Q4: Positionszahl und Stapellänge innerhalb `min(50, BB_MCP_MAX_BATCH)`.
 *
 * Beide Ebenen werden **getrennt** geprüft, und es wird nichts aufsummiert: Ein Stapel aus
 * 50 Belegen mit je 50 Positionen reißt keine der beiden Grenzen.
 */
const Q4: CrossCheck = {
  id: "Q4",
  summary: "Stapel und Positionslisten innerhalb min(50, BB_MCP_MAX_BATCH)",
  run(args, ctx, tool) {
    for (const list of objectLists(args)) {
      const outer = args[list.field];
      const outerLength = Array.isArray(outer) ? outer.length : 0;
      if (outerLength > tool.maxItems) {
        addIssue(
          ctx,
          [list.field],
          `${list.field} enthält ${String(outerLength)} Einträge, erlaubt sind höchstens ` +
            `${String(tool.maxItems)} je Aufruf.`,
        );
      }
      list.items.forEach((item, index) => {
        for (const [field, value] of Object.entries(item)) {
          if (Array.isArray(value) && value.length > tool.maxItems) {
            addIssue(
              ctx,
              [list.field, index, field],
              `${humanPosition(index)} von ${list.field}: ${field} enthält ` +
                `${String(value.length)} Einträge, erlaubt sind höchstens ` +
                `${String(tool.maxItems)}. Die Grenze gilt je Stapelelement; es wird nichts ` +
                "aufsummiert.",
            );
          }
        }
      });
    }
  },
};

/**
 * Q5: Betrag ungleich `0.00`.
 *
 * Die Spezifikation erklärt den Betrag 0 ausdrücklich für ungültig. Geprüft wird das Feld
 * `amount` auf oberster Ebene und je Stapelelement, weil dieselbe Regel an den beiden
 * Stapelvarianten gilt (Werkzeuge 5 und 13).
 */
const Q5: CrossCheck = {
  id: "Q5",
  summary: "amount ist nicht null",
  run(args, ctx) {
    if (isZeroAmount(args["amount"])) {
      addIssue(
        ctx,
        ["amount"],
        "amount ist 0.00. Die Spezifikation erklärt den Betrag 0 ausdrücklich für ungültig.",
      );
    }
    for (const list of objectLists(args)) {
      list.items.forEach((item, index) => {
        if (isZeroAmount(item["amount"])) {
          addIssue(
            ctx,
            [list.field, index, "amount"],
            `${humanPosition(index)} von ${list.field}: amount ist 0.00. Die Spezifikation ` +
              "erklärt den Betrag 0 ausdrücklich für ungültig.",
          );
        }
      });
    }
  },
};

/**
 * Q6: `date_delivery <= date`.
 *
 * DATEV-Regel, wörtlich in der Spezifikation: „Due to the DATEV compatibility, we cannot
 * accept a delivery date that is after the receipt date!“ Auch hier je Stapelelement,
 * wegen Werkzeug 5.
 */
const Q6: CrossCheck = {
  id: "Q6",
  summary: "date_delivery liegt nicht nach date",
  run(args, ctx) {
    checkDeliveryDate(args, [], ctx);
    for (const list of objectLists(args)) {
      list.items.forEach((item, index) => {
        checkDeliveryDate(item, [list.field, index], ctx);
      });
    }
  },
};

function checkDeliveryDate(args: Args, path: (string | number)[], ctx: Ctx): void {
  const delivery = stringOf(args, "date_delivery");
  const date = stringOf(args, "date");
  if (delivery === undefined || date === undefined || delivery <= date) {
    return;
  }
  addIssue(
    ctx,
    [...path, "date_delivery"],
    `date_delivery (${delivery}) liegt nach date (${date}). Wegen der DATEV-Kompatibilität ` +
      "nimmt BuchhaltungsButler kein Leistungsdatum nach dem Belegdatum an.",
  );
}

/**
 * Q7: `order` gegen die **je Endpunkt eigene** Form.
 *
 * Drei Endpunkte, drei Syntaxen. Die Enums in `order.ts` fangen einen falsch geschriebenen
 * Wert bereits ab; Q7 fängt zwei Dinge, die ein Enum nicht kann: ein **leeres**
 * Sortierobjekt an `/receipts/get`, das syntaktisch gültig und fachlich sinnlos ist, und
 * einen Wert, der zur Form eines **anderen** Endpunkts gehört — `'name ASC'` ist an
 * `/settings/get/postingaccounts` gültig und an `/postings/get` nicht.
 */
const Q7: CrossCheck = {
  id: "Q7",
  summary: "order entspricht der Sortierform dieses Endpunkts",
  assertApplicable(tool) {
    if (ORDER_FORM_BY_PATH[tool.specPath] === undefined) {
      throw new Error(
        `Q7 ist an ${tool.toolName} (${tool.specPath}) nicht anwendbar: Dieser Endpunkt führt ` +
          "laut Spezifikation keinen order-Parameter. Sortierparameter gibt es nur an " +
          `${Object.keys(ORDER_FORM_BY_PATH).join(", ")}.`,
      );
    }
  },
  run(args, ctx, tool) {
    const order = args["order"];
    if (order === undefined) {
      return;
    }
    const form: OrderForm | undefined = ORDER_FORM_BY_PATH[tool.specPath];
    if (form === "receipts-object") {
      if (!isRecord(order)) {
        addIssue(
          ctx,
          ["order"],
          "order erwartet an /receipts/get ein Objekt aus Sortierfeld und Richtung, zum " +
            'Beispiel {"date": "ASC"}.',
        );
        return;
      }
      const keys = Object.keys(order);
      if (keys.length === 0) {
        addIssue(
          ctx,
          ["order"],
          "order ist leer. Mindestens eines der Sortierfelder " +
            `${RECEIPTS_ORDER_FIELDS.join(", ")} angeben oder das Feld weglassen.`,
        );
      }
      return;
    }
    const allowed: readonly string[] =
      form === "postings-string" ? POSTINGS_ORDER_VALUES : POSTING_ACCOUNTS_ORDER_VALUES;
    if (typeof order !== "string" || !allowed.includes(order)) {
      addIssue(
        ctx,
        ["order"],
        `order '${render(order)}' gehört nicht zur Sortierform von ${tool.specPath}. ` +
          `Erlaubt sind genau: ${allowed.join(", ")}. Die Validierung der API unterscheidet ` +
          "Groß- und Kleinschreibung.",
      );
    }
  },
};

/**
 * Q8: An jeder Position der E-Rechnung, deren `item_tax_type` einen Steuersatz verlangt,
 * ist `item_tax_amount` gesetzt.
 *
 * Die Spezifikation führt das Feld als `required: true` und schreibt zugleich „Only
 * required if corresponding item_tax_type = 'S' (VAT)“. Die beiden Angaben widersprechen
 * sich. Ein hartes Pflichtfeld lehnte die fünf übrigen Steuerarten ab, bei denen es gar
 * keinen Satz gibt; deshalb ist das Feld optional und Q8 verlangt es genau dort, wo die
 * Steuerart es braucht. Das Feld ersatzlos optional zu führen und gar nicht zu prüfen wäre
 * der bequeme Ausweg: Der Widerspruch verschwände aus dem Schema und schlüge stattdessen
 * erst als Ablehnung der API auf.
 */
const Q8: CrossCheck = {
  id: "Q8",
  summary: "item_tax_amount ist gesetzt, wo item_tax_type ihn verlangt",
  run(args, ctx) {
    const items = args["items"];
    if (!Array.isArray(items)) {
      return;
    }
    items.forEach((entry: unknown, index: number) => {
      if (!isRecord(entry)) {
        return;
      }
      const taxType = entry["item_tax_type"];
      const taxAmount = entry["item_tax_amount"];
      if (taxType === "S" && (taxAmount === undefined || taxAmount === null)) {
        addIssue(
          ctx,
          ["items", index, "item_tax_amount"],
          `${humanPosition(index)}: item_tax_type 'S' verlangt einen Steuersatz, ` +
            "item_tax_amount fehlt. Bei den Steuerarten 'Z', 'AE', 'K', 'G' und 'E' bleibt " +
            "das Feld dagegen weg.",
        );
      }
    });
  },
};

/** Die beiden Kennungen, von denen `/comments/add` genau eine verlangt. */
const COMMENT_TARGET_FIELDS = ["receipt_id_by_customer", "transaction_id_by_customer"] as const;

/**
 * Q9: genau eine von `receipt_id_by_customer` und `transaction_id_by_customer`.
 *
 * `/comments/add` hängt einen Kommentar entweder an einen Beleg oder an eine Zahlung, und pro
 * Aufruf an genau eines von beiden. Die Spezifikation markiert beide Felder als
 * `required: false` und schreibt in der Endpunktbeschreibung zugleich: „NOTE: You have to
 * submit either a transaction_id_by_customer or a receipt_id_by_customer." Belegt ist die
 * Regel durch zwei eigene Fehlercodes: Code 8, wenn keines von beiden gesetzt ist, Code 7,
 * wenn beide gesetzt sind (`docs/api/stammdaten.md`, Abschnitt `/comments/add`).
 *
 * Ein JSON Schema kann keine der beiden Lagen ausdrücken, weil jedes der Felder für sich
 * optional ist. Ohne Q9 setzt der Server als einziger Fall einen **schreibenden** Request
 * gegen die echte Buchhaltung ab, von dem vorher feststeht, dass er scheitert.
 */
const Q9: CrossCheck = {
  id: "Q9",
  summary: "genau eine von receipt_id_by_customer und transaction_id_by_customer",
  run(args, ctx) {
    const providedFields = COMMENT_TARGET_FIELDS.filter(
      (name) => args[name] !== undefined && args[name] !== null,
    );
    if (providedFields.length === 1) {
      return;
    }
    const situation =
      providedFields.length === 0
        ? "Gesetzt ist keine von beiden; die API lehnt das mit Fehlercode 8 ab."
        : "Gesetzt sind beide; die API lehnt das mit Fehlercode 7 ab.";
    addIssue(
      ctx,
      [],
      `${COMMENT_TARGET_FIELDS[0]} und ${COMMENT_TARGET_FIELDS[1]} schließen einander aus: ` +
        `Genau eine der beiden Kennungen ist anzugeben. ${situation} Der Aufruf ist vor dem ` +
        "Request abgelehnt worden, an die API ist nichts hinausgegangen.",
    );
  },
};

// --- Registrierung -------------------------------------------------------------------

/** Die neun Querprüfungen, geschlüsselt nach ihrer Kennung aus Plan 4.7. */
export const CROSS_CHECKS: Readonly<Record<CrossCheckId, CrossCheck>> = Object.freeze({
  Q1,
  Q2,
  Q3,
  Q4,
  Q5,
  Q6,
  Q7,
  Q8,
  Q9,
});

/**
 * Hängt die genannten Querprüfungen an ein Objektschema.
 *
 * Die Reihenfolge ist die der Kennungen, damit zwei Aufrufe mit derselben Liste dieselbe
 * Reihenfolge der Meldungen ergeben. Jede Prüfung mit `assertApplicable` wird **beim Bau**
 * geprüft: Eine Querprüfung ohne Grundlage ist ein Verdrahtungsfehler, und der soll beim
 * Serverstart auffallen und nicht beim ersten Aufruf des Werkzeugs.
 */
export function applyCrossChecks<T extends z.ZodType>(
  schema: T,
  ids: readonly CrossCheckId[],
  tool: CrossCheckTool,
): T {
  const seen = new Set<CrossCheckId>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`${tool.toolName} führt die Querprüfung ${id} doppelt.`);
    }
    seen.add(id);
    CROSS_CHECKS[id].assertApplicable?.(tool);
  }
  if (seen.size === 0) {
    return schema;
  }
  const ordered = (Object.keys(CROSS_CHECKS) as CrossCheckId[]).filter((id) => seen.has(id));
  return schema.superRefine((value, ctx) => {
    if (!isRecord(value)) {
      return;
    }
    for (const id of ordered) {
      CROSS_CHECKS[id].run(value, ctx, tool);
    }
  });
}
