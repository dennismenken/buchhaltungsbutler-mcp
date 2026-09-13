// Positionsliste statt paralleler Arrays (Plan 4.8, Sparmaßnahme S5, Streitfrage S11).
//
// Fünf Endpunkte erwarten zusammengehörige Werte als mehrere gleich lange Arrays auf
// oberster Ebene, zwei weitere je Stapelelement. Das Werkzeug nimmt stattdessen **eine**
// Positionsliste, und {@link toParallelArrays} erzeugt daraus die Arrays. Damit ist die
// Längeninvariante konstruktiv erfüllt und kann nicht mehr verletzt werden, `required`
// wirkt je Position, Fehler sind positionsgenau meldbar, und die Definition wird kleiner.
//
// Dass dies eine Umformung gegenüber der API ist, steht in jeder betroffenen
// Werkzeugbeschreibung wörtlich (Plan 4.8); {@link declarationSentence} liefert den Satz,
// damit er nicht siebenmal neu formuliert wird.
//
// Die Umformung selbst ruft `src/mapping/parallel-arrays.ts` (AP08) auf. Sie steht hier und
// nicht dort, weil Schema und Umformung dieselbe Spaltenliste brauchen: Eine zweite Liste
// wäre die Stelle, an der die Längeninvariante später doch wieder auseinanderfällt.

import { z } from "zod";

import { getConfig } from "../config/resolve.js";
import { amountValue, boundedText, markSchemaKind, strictObject } from "./primitives.js";
import { costLocation, idByCustomer, postingAccountNumber, vatKey } from "./vocab.js";

// --- Mengengrenze --------------------------------------------------------------------

/**
 * Die Obergrenze, die die API für die beiden Stapelendpunkte `/receipts/addBatch` und
 * `/transactions/addBatch` ausdrücklich nennt („maximum of 50 receipts are allowed“).
 */
export const API_MAX_BATCH = 50;

/**
 * Die wirksame Mengengrenze `min(50, BB_MCP_MAX_BATCH)` (Plan 4.7 Q4, 4.8, 6.2).
 *
 * Sie gilt für **beide** Arten von Mengenfeld: für die acht Stapelbehälter und für die
 * Positionslisten, auf oberster Ebene wie je Stapelelement. `BB_MCP_MAX_BATCH` ist eine
 * Mengengrenze je Aufruf und keine Eigenheit der Stapelendpunkte; eine Rechnung mit 50
 * Positionen ist für den Mandanten derselbe Vorgang wie ein Stapel mit 50 Belegen.
 *
 * Die Herkunft der 50 ist je Art verschieden, und das wird hier nicht verwischt: Bei den
 * beiden genannten Stapelendpunkten nennt die Spezifikation sie, bei den übrigen sechs ist
 * sie **nicht verifiziert** und defensiv übernommen, und bei den Positionslisten ist sie
 * überhaupt keine API-Regel, sondern unsere eigene Mengengrenze (Plan 14.2).
 *
 * Ohne `override` wird die eingefrorene Konfiguration gelesen. Sie ist beim Bau des Schemas
 * bereits aufgelöst (Plan 6.4 Punkt 7); ist sie es nicht, wirft `getConfig()`. Ein
 * stillschweigender Rückfall auf 50 wäre schlimmer: Er machte aus einer falschen
 * Startreihenfolge eine unbemerkt abgeschaltete Schutzschicht.
 *
 * @param override Nur für Tests und für Aufrufer, die die Grenze schon kennen.
 */
export function batchLimit(override?: number): number {
  const configured = override ?? getConfig().maxBatch;
  return Math.min(API_MAX_BATCH, configured);
}

// --- Spaltenlisten -------------------------------------------------------------------

/** Eine Spalte der Umformung: ein Feld des Positionsobjekts und sein paralleles Array. */
export interface ParallelArrayColumn {
  /** Name im Positionsobjekt des Werkzeugs. */
  readonly field: string;
  /** Name des parallelen Arrays im Body der API. */
  readonly apiName: string;
  /** `true`, wenn die API das Array immer erwartet. */
  readonly required: boolean;
}

export type ParallelArrayMapping = readonly ParallelArrayColumn[];

/**
 * Die sechs Spalten der Buchungspositionen von `/postings/add/receipt` (Werkzeug 21).
 *
 * Die Feldnamen des Positionsobjekts sind die Einzahlformen aus dem Musterschema in
 * Plan 4.8; die `apiName`-Spalte trägt die Mehrzahlformen der Spezifikation.
 */
export const POSTINGS_RECEIPT_COLUMNS: ParallelArrayMapping = Object.freeze([
  { field: "postingaccount", apiName: "postingaccounts", required: true },
  { field: "postingtext", apiName: "postingtexts", required: true },
  { field: "vat", apiName: "vats", required: true },
  { field: "cost_location", apiName: "cost_locations", required: false },
  { field: "cost_location_two", apiName: "cost_locations_two", required: false },
  { field: "amount", apiName: "amounts", required: true },
]);

/**
 * Die sieben Spalten von `/postings/add/transaction` (Werkzeug 23): dieselben sechs plus
 * die Zuordnung offener Posten je Position.
 */
export const POSTINGS_TRANSACTION_COLUMNS: ParallelArrayMapping = Object.freeze([
  ...POSTINGS_RECEIPT_COLUMNS,
  {
    field: "open_item_receipt_id_by_customer",
    apiName: "oi_receipts_ids_by_customer",
    required: true,
  },
]);

/**
 * Die sechs Spalten **innerhalb** eines Stapelelements von `/postings/add-batch/receipts`
 * (Werkzeug 22, Definition `ReceiptPostings`).
 *
 * Der einzige Unterschied zu {@link POSTINGS_RECEIPT_COLUMNS} ist die Schreibweise
 * `postingstexts` mit eingeschobenem `s`. Das ist der benannte Spezifikationsfehler aus
 * Plan 0.5: Die Elementdefinition trägt `postingstexts`, der Einzelendpunkt
 * `postingtexts`. Er steht so in `SPEC_BUGS` und wird hier nicht stillschweigend geglättet,
 * weil der Aufruf sonst am falschen Feldnamen scheiterte.
 */
export const POSTINGS_RECEIPT_BATCH_COLUMNS: ParallelArrayMapping = Object.freeze(
  POSTINGS_RECEIPT_COLUMNS.map((column) =>
    column.field === "postingtext" ? { ...column, apiName: "postingstexts" } : column,
  ),
);

/**
 * Die sieben Spalten innerhalb eines Stapelelements von
 * `/postings/add-batch/transactions` (Werkzeug 24, Definition `TransactionPostings`).
 * Dort heißt das Feld wieder `postingtexts`, also wie am Einzelendpunkt.
 */
export const POSTINGS_TRANSACTION_BATCH_COLUMNS: ParallelArrayMapping =
  POSTINGS_TRANSACTION_COLUMNS;

/**
 * Die sechs Spalten der Rechnungspositionen von `/invoices/create` und
 * `/invoices/create/draft` (Werkzeuge 17 und 18).
 *
 * Die Feldnamen des Positionsobjekts sind hier **gleich den API-Namen**. Die Einzahlform
 * der Buchungspositionen entsteht daraus, dass die API dort Mehrzahlformen führt; die
 * Rechnungsarrays heißen bereits im Singular, und Anhang A benennt sie nicht um. Weniger
 * Umbenennung heißt weniger, was der Aufrufer übersetzen muss.
 */
export const INVOICE_ITEM_COLUMNS: ParallelArrayMapping = Object.freeze([
  { field: "item_name", apiName: "item_name", required: true },
  { field: "item_amount", apiName: "item_amount", required: true },
  { field: "item_unit", apiName: "item_unit", required: true },
  { field: "item_vat", apiName: "item_vat", required: true },
  { field: "item_single_price", apiName: "item_single_price", required: true },
  { field: "item_description", apiName: "item_description", required: false },
]);

/**
 * Die sieben Spalten der Positionen von `/invoices/create/e-invoice` (Werkzeug 19):
 * `item_tax_type` und `item_tax_amount` statt `item_vat`.
 *
 * `item_tax_amount` steht hier mit `required: true`, obwohl das Feld im Positionsobjekt
 * optional ist: Die Spezifikation führt den Parameter als `required: true` und schreibt
 * zugleich, er sei nur bei der Steuerart 'S' nötig. Das Array wird deshalb immer erzeugt,
 * und Positionen ohne Steuersatz tragen darin `null`. Dass die API dieses `null`
 * annimmt, ist **nicht verifiziert**; es ist aber die Seite des Widerspruchs, die dem
 * dokumentierten Vertrag folgt, und ein Fehlschlag wäre mit klarer Meldung sichtbar.
 */
export const EINVOICE_ITEM_COLUMNS: ParallelArrayMapping = Object.freeze([
  { field: "item_name", apiName: "item_name", required: true },
  { field: "item_amount", apiName: "item_amount", required: true },
  { field: "item_unit", apiName: "item_unit", required: true },
  { field: "item_tax_type", apiName: "item_tax_type", required: true },
  { field: "item_tax_amount", apiName: "item_tax_amount", required: true },
  { field: "item_single_price", apiName: "item_single_price", required: true },
  { field: "item_description", apiName: "item_description", required: false },
]);

// --- Der Deklarationssatz ------------------------------------------------------------

/**
 * Der Satz, mit dem jede betroffene Werkzeugbeschreibung die Umformung deklariert
 * (Plan 4.8). Damit ist sie kein verborgenes Verhalten im Sinne von E1.
 */
export function declarationSentence(mapping: ParallelArrayMapping): string {
  const names = mapping.map((column) => column.apiName).join(", ");
  return (
    `Die BuchhaltungsButler-API nimmt diese Werte als parallele Arrays entgegen (${names}); ` +
    "dieses Werkzeug nimmt eine Positionsliste und rechnet sie um, wodurch die Arrays " +
    "zwingend gleich lang sind."
  );
}

// --- Bausteine der Positionsobjekte --------------------------------------------------

/**
 * Menge oder Satz als Dezimalzeichenkette, **ohne** Betragsmarkierung.
 *
 * Der Unterschied ist nicht kosmetisch: `item_amount` ist die Menge („10 Std."),
 * `item_vat` und `item_tax_amount` sind Prozentsätze zwischen 0 und 100, und nur
 * `item_single_price` und `amount` sind Geld. Guard 5 prüft `BB_MCP_MAX_AMOUNT` gegen
 * markierte Fragmente; eine markierte Menge ergäbe dort eine Grenze auf die falsche Größe.
 */
function decimalValue(description: string): z.ZodString {
  return z
    .string()
    .regex(/^-?\d+(?:\.\d+)?$/, {
      error: "erwartet wird eine Dezimalzahl mit Punkt, zum Beispiel 10 oder 19.99",
    })
    .describe(description);
}

/** Prozentsatz zwischen 0 und 100 als Dezimalzeichenkette. */
function percentValue(description: string): z.ZodString {
  return z
    .string()
    .regex(/^\d+(?:\.\d+)?$/, {
      error: "erwartet wird eine Zahl zwischen 0 und 100, zum Beispiel 19 oder 7.5",
    })
    .refine((raw) => Number.parseFloat(raw) <= 100, {
      error: "die Spezifikation erlaubt nur Sätze zwischen 0 und 100",
    })
    .describe(description);
}

/** Die sechs Steuerarten der E-Rechnung, aus dem Beschreibungstext von `item_tax_type`. */
export const EINVOICE_TAX_TYPES = ["S", "Z", "AE", "K", "G", "E"] as const;

/**
 * Die Steuerart, die einen Steuersatz verlangt.
 *
 * Die Spezifikation schreibt an `item_tax_amount` wörtlich „Only required if corresponding
 * item_tax_type = 'S' (VAT)“ und führt das Feld zugleich als `required: true`. Die beiden
 * Angaben widersprechen sich; Q8 löst den Widerspruch auf der sicheren Seite auf, indem es
 * den Satz genau dort verlangt, wo die Steuerart ihn braucht (Plan 4.7 Q8).
 */
export const EINVOICE_TAX_TYPE_WITH_AMOUNT = "S";

// --- Positionsobjekte ----------------------------------------------------------------

/**
 * Ein Buchungssatz als Positionsobjekt (Plan 4.8).
 *
 * @param withOpenItem `true` an den Zahlungsvarianten (Werkzeuge 23 und 24): Dort kommt
 *   die Zuordnung offener Posten je Position hinzu. `null` bedeutet dort ausdrücklich
 *   „dieser Position keinen Beleg zuordnen“; die Spezifikation erlaubt den Wert
 *   ausdrücklich, deshalb ist das Feld nullable und nicht optional.
 */
export function postingPositionItem(withOpenItem: boolean) {
  const base = {
    postingaccount: postingAccountNumber(),
    postingtext: boundedText("Buchungstext dieser Zeile.", 128),
    vat: vatKey(),
    amount: amountValue(
      "Betrag dieser Buchungszeile. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel " +
        "123.99. Die Summe aller Zeilenbeträge muss dem Beleg- beziehungsweise " +
        "Zahlungsbetrag entsprechen; BuchhaltungsButler lehnt den Aufruf sonst ab.",
    ),
    cost_location: costLocation().optional(),
    cost_location_two: costLocation().optional(),
  };
  if (!withOpenItem) {
    return strictObject(base);
  }
  return strictObject({
    ...base,
    open_item_receipt_id_by_customer: idByCustomer("des Belegs", "bb_receipts_search")
      .nullable()
      .describe(
        "Offener Posten, der dieser Buchungszeile zugeordnet wird: die mandantenbezogene " +
          "Nummer des Belegs, zu finden über bb_receipts_search. null bedeutet " +
          "ausdrücklich: dieser Position keinen Beleg zuordnen.",
      ),
  });
}

/** Eine Rechnungsposition von `/invoices/create` und `/invoices/create/draft`. */
export function invoiceItemItem() {
  return strictObject({
    item_name: boundedText("Bezeichnung der Rechnungsposition, zum Beispiel Beratung."),
    item_amount: decimalValue("Menge, zum Beispiel 10. Nicht der Betrag, sondern die Anzahl."),
    item_unit: boundedText("Einheit der Menge, zum Beispiel Std. oder Stk."),
    item_vat: percentValue("Umsatzsteuersatz in Prozent, zum Beispiel 19 oder 7."),
    item_single_price: amountValue(
      "Einzelpreis der Position. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel 19.99.",
    ),
    item_description: boundedText("Zusatztext zur Position.").optional(),
  });
}

/**
 * Eine Position der E-Rechnung `/invoices/create/e-invoice`.
 *
 * `item_tax_amount` ist hier optional und wird von Q8 genau dort verlangt, wo
 * `item_tax_type` den Satz braucht; die Begründung steht bei
 * {@link EINVOICE_TAX_TYPE_WITH_AMOUNT}.
 */
export function einvoiceItemItem() {
  return strictObject({
    item_name: boundedText("Bezeichnung der Rechnungsposition, zum Beispiel Beratung."),
    item_amount: decimalValue("Menge, zum Beispiel 10. Nicht der Betrag, sondern die Anzahl."),
    item_unit: boundedText("Einheit der Menge, zum Beispiel Std. oder Stk."),
    item_tax_type: z
      .enum(EINVOICE_TAX_TYPES)
      .describe(
        "Steuerart der Position: 'S' Regelsteuersatz, 'Z' 0 Prozent, 'AE' Reverse Charge " +
          "nach §13b, 'K' innergemeinschaftliche Lieferung, 'G' Ausfuhr in ein Drittland, " +
          "'E' steuerfreie Leistung. Nur bei 'S' ist item_tax_amount zu setzen.",
      ),
    item_tax_amount: percentValue(
      "Umsatzsteuersatz dieser Position in Prozent, zum Beispiel 19. Pflicht, sobald " +
        "item_tax_type den Wert 'S' trägt, sonst weglassen.",
    ).optional(),
    item_single_price: amountValue(
      "Einzelpreis der Position. Dezimalpunkt, kein Tausendertrennzeichen, zum Beispiel 19.99.",
    ),
    item_description: boundedText("Zusatztext zur Position.").optional(),
  });
}

// --- Positionslisten -----------------------------------------------------------------

export interface PositionListOptions {
  /** Die feldeigene Beschreibung. Der Deklarationssatz wird angehängt. */
  readonly description: string;
  /** Nur für Tests und Aufrufer, die die Mengengrenze schon kennen. */
  readonly maxItems?: number;
}

function positionList<T extends z.ZodType>(
  item: T,
  mapping: ParallelArrayMapping,
  options: PositionListOptions,
) {
  const max = batchLimit(options.maxItems);
  return markSchemaKind(
    z
      .array(item)
      .min(1, { error: "mindestens eine Position" })
      .max(max, { error: `höchstens ${String(max)} Positionen je Aufruf` }),
    "positions",
  ).describe(`${options.description} ${declarationSentence(mapping)}`);
}

/** Die vier Spaltenlisten der Buchungspositionen, nach Variante. */
export const POSTING_COLUMNS_BY_VARIANT: Readonly<
  Record<"receipt" | "transaction" | "receipt-batch" | "transaction-batch", ParallelArrayMapping>
> = Object.freeze({
  receipt: POSTINGS_RECEIPT_COLUMNS,
  transaction: POSTINGS_TRANSACTION_COLUMNS,
  "receipt-batch": POSTINGS_RECEIPT_BATCH_COLUMNS,
  "transaction-batch": POSTINGS_TRANSACTION_BATCH_COLUMNS,
});

/**
 * Die Positionsliste der Buchungswerkzeuge 21 und 23 sowie, geschachtelt, der
 * Stapelwerkzeuge 22 und 24.
 *
 * @param variant Welche der vier Spaltenlisten gilt. Die Wahl entscheidet über die
 *   Schreibweise `postingtexts` gegen `postingstexts` und über das Feld für offene Posten.
 */
export function postingPositions(
  variant: "receipt" | "transaction" | "receipt-batch" | "transaction-batch",
  options: PositionListOptions,
) {
  const withOpenItem = variant === "transaction" || variant === "transaction-batch";
  const mapping = POSTING_COLUMNS_BY_VARIANT[variant];
  return positionList(postingPositionItem(withOpenItem), mapping, options);
}

/** Die Positionsliste der Rechnungswerkzeuge 17 und 18. */
export function invoiceItems(options: PositionListOptions) {
  return positionList(invoiceItemItem(), INVOICE_ITEM_COLUMNS, options);
}

/** Die Positionsliste des E-Rechnungswerkzeugs 19. */
export function einvoiceItems(options: PositionListOptions) {
  return positionList(einvoiceItemItem(), EINVOICE_ITEM_COLUMNS, options);
}

// --- Die Umformung -------------------------------------------------------------------

/**
 * Rechnet eine geprüfte Positionsliste in die parallelen Arrays der API um.
 *
 * Die Längeninvariante ist konstruktiv erfüllt: Jedes erzeugte Array entsteht aus
 * derselben Schleife über dieselbe Liste und hat damit bauartbedingt die Länge der
 * Positionsliste. Es gibt keinen Zweig, in dem ein Array kürzer sein könnte.
 *
 * Ein optionales Array wird **ganz weggelassen**, solange keine Position es setzt; sobald
 * eine es setzt, wird es vollständig erzeugt und die übrigen Stellen tragen `null`.
 * Belegt ist das nur für `oi_receipts_ids_by_customer`, wo die Spezifikation `null`
 * ausdrücklich als „dieser Position keinen Beleg zuordnen“ führt; für `cost_locations` und
 * `item_description` ist es **nicht verifiziert** und die defensive Wahl: Ein leerer String
 * wäre dort nachweislich ein Validierungsfehler, und eine Lücke zerstörte die
 * Längengleichheit.
 */
export function toParallelArrays(
  positions: readonly Record<string, unknown>[],
  mapping: ParallelArrayMapping,
): Record<string, unknown[]> {
  const body: Record<string, unknown[]> = {};
  for (const column of mapping) {
    const used = positions.some((position) => position[column.field] !== undefined);
    if (!column.required && !used) {
      continue;
    }
    body[column.apiName] = positions.map((position) => position[column.field] ?? null);
  }
  return body;
}
