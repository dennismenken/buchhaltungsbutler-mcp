// `_contract_warnings`: Feldname, erwarteter Typ, gesehener Typ.
//
// Die Entscheidung dahinter ist die folgenreichste dieses Abschnitts: Ein **fehlendes oder
// typwidriges bekanntes Feld bricht den Aufruf nicht ab**, wird aber gemeldet — und zwar in
// **derselben Antwort, die der Agent liest**, nicht nur auf stderr, das kein Modell sieht.
//
// Kein Abbruch, weil die Spezifikation nachweislich falsch ist und
// ein harter Abbruch den Server bei jeder kleinen Anbieteränderung bei allen Nutzern
// gleichzeitig unbrauchbar machen würde. Nicht stumm, weil genau hier die falschen Zahlen
// entstehen: Ein `due_date`, das unter einem anderen Namen geliefert wird, sieht aus wie
// „keine Fälligkeit" und ist in Wahrheit „falscher Feldname".

/** Der Schlüssel, unter dem die Abweichungen in `structuredContent` stehen. */
export const CONTRACT_WARNINGS_KEY = "_contract_warnings";

/** Der Wert von `seen`, wenn das Feld überhaupt nicht geliefert wurde. */
export const SEEN_MISSING = "fehlt";

/**
 * Eine Abweichung vom Antwortvertrag. Es sind genau diese drei Schlüssel; es
 * kommt keiner hinzu, damit die Struktur in der Antwort für jeden Aufruf dieselbe ist.
 */
export interface ContractWarning {
  /** Feldname im Original, so wie die API ihn führt beziehungsweise führen sollte. */
  readonly field: string;
  /** Der Typ aus dem `responseContract` des Registereintrags. */
  readonly expected: string;
  /** Was tatsächlich ankam. */
  readonly seen: string;
}

/**
 * Eine Abweichung mit der Zahl der betroffenen Zeilen.
 *
 * Sie ist die innere Form: Eine Liste mit 100 Zeilen, in denen dasselbe Feld fehlt, ergäbe
 * sonst 100 gleichlautende Einträge und verdrängte die Nutzdaten aus dem Kontext. Nach außen
 * geht je Abweichung **ein** Eintrag mit den drei Schlüsseln; die Zahl der
 * betroffenen Zeilen steht in der Warnzeile des Textblocks.
 */
export interface AggregatedWarning {
  readonly warning: ContractWarning;
  /** Zahl der Zeilen, in denen diese Abweichung auftrat. Bei Einzelobjekten immer 1. */
  readonly rows: number;
}

/**
 * Der Typ eines gelieferten Wertes, in der Sprache der Meldung.
 *
 * `undefined` heißt {@link SEEN_MISSING} und nicht „undefined": Für den Leser der Antwort ist
 * „fehlt" die Tatsache, und „undefined" wäre ein Implementierungsdetail.
 */
export function seenTypeOf(value: unknown): string {
  if (value === undefined) {
    return SEEN_MISSING;
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return Number.isFinite(value) ? "number" : "number (nicht endlich)";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return typeof value;
  }
}

/**
 * Eine Abweichung bauen.
 *
 * `expected` nimmt den Vertragstyp aus dem Registereintrag ({@link ContractFieldType}) und
 * ebenso eine genauere Beschreibung wie „object" dort, wo nicht ein Feld, sondern eine ganze
 * Zeile abweicht. Deshalb `string` und nicht die engere Union.
 */
export function contractWarning(field: string, expected: string, seen: string): ContractWarning {
  return { field, expected, seen };
}

function keyOf(warning: ContractWarning): string {
  // JSON statt eines Trennzeichens: Ein Trennzeichen, das in einem Feldnamen oder in
  // einem Typnamen vorkommen kann, führte zwei verschiedene Abweichungen zusammen.
  return JSON.stringify([warning.field, warning.expected, warning.seen]);
}

/**
 * Fasst gleichlautende Abweichungen zusammen und zählt die betroffenen Zeilen. Die
 * Reihenfolge des ersten Auftretens bleibt erhalten, damit die Meldung reproduzierbar ist.
 */
export function aggregateWarnings(
  warnings: readonly ContractWarning[],
): readonly AggregatedWarning[] {
  const aggregated: { warning: ContractWarning; rows: number }[] = [];
  const byKey = new Map<string, { warning: ContractWarning; rows: number }>();
  for (const warning of warnings) {
    const key = keyOf(warning);
    const existing = byKey.get(key);
    if (existing === undefined) {
      const entry = { warning, rows: 1 };
      byKey.set(key, entry);
      // Dasselbe Objekt in Liste und Karte: Die Reihenfolge des ersten Auftretens bleibt
      // erhalten, und das Zählen braucht keinen zweiten Durchlauf.
      aggregated.push(entry);
    } else {
      existing.rows += 1;
    }
  }
  return aggregated;
}

/** Die Form, die in `structuredContent` landet: genau die drei Schlüssel. */
export function warningsForStructuredContent(
  aggregated: readonly AggregatedWarning[],
): readonly ContractWarning[] {
  return aggregated.map(({ warning }) => warning);
}

/**
 * Die Warnzeile, mit der der Textblock beginnt.
 *
 * Sie nennt jede Abweichung einzeln und sagt ausdrücklich, dass die Antwort trotzdem
 * geliefert wurde. Ein Agent, der nur den Text liest, muss daran erkennen können, welchem
 * Wert er nicht trauen darf.
 *
 * @param totalRows Zeilenzahl der Antwort, für die Angabe „in 37 von 100 Zeilen". `null` bei
 *                  Einzelobjekten und Quittungen.
 */
export function contractWarningLine(
  aggregated: readonly AggregatedWarning[],
  totalRows: number | null,
): string {
  if (aggregated.length === 0) {
    return "";
  }
  const parts = aggregated.map(({ warning, rows }) => {
    const scope =
      totalRows === null
        ? ""
        : ` (in ${String(rows)} von ${String(totalRows)} Zeile${totalRows === 1 ? "" : "n"})`;
    return `${warning.field}: erwartet ${warning.expected}, geliefert ${warning.seen}${scope}`;
  });
  const count = aggregated.length;
  return (
    `ACHTUNG, der Antwortvertrag dieses Endpunkts ist verletzt (${String(count)} ` +
    `Abweichung${count === 1 ? "" : "en"}): ${parts.join("; ")}. ` +
    "Die Antwort wird trotzdem geliefert; die genannten Felder sind nicht verlässlich, und " +
    "ein fehlender Wert bedeutet hier nicht „nicht gesetzt“, sondern „so nicht geliefert“."
  );
}

/** Die Zeile für stderr, Stufe `warn`. Ohne Werte, nur Namen. */
export function contractWarningLogLine(
  toolName: string,
  specPath: string,
  aggregated: readonly AggregatedWarning[],
): string {
  const fields = aggregated
    .map(({ warning }) => `${warning.field} (${warning.expected} → ${warning.seen})`)
    .join(", ");
  return `${toolName} ${specPath}: Antwortvertrag verletzt: ${fields}`;
}
