// Die eine Schreibweise, in der jede Meldung dieses Servers eine Stelle im Aufruf benennt.
//
// Der Adressat dieser Meldungen ist ein Sprachmodell, und für ein Sprachmodell ist `items[2]`
// in JSON wie in JavaScript ausnahmslos das **dritte** Element. Eine Klammernotation, die ab 1
// zählt, meint also nachweislich etwas anderes, als sie sagt: Eine an der falschen Stelle
// korrigierte Position ergibt eine formal gültige und inhaltlich falsche Buchung, und genau
// die Positionslisten der Rechnungs- und Buchungswerkzeuge und die acht Stapelbehälter sind
// die Schreibpfade, an denen das teuer wird.
//
// Deshalb gibt es die Klammer hier nicht. Eine Listenstelle heißt `receipts (Position 2)`,
// und das Wort „Position" sagt die Zählweise mit, statt sie vorauszusetzen. Die Form ist die
// von `schema/cross-checks.ts`, die denselben Sachverhalt seit jeher unmissverständlich als
// „Position 2 von receipts" ausgibt; sie steht einmal in den `instructions` des Servers, damit
// ein Agent sie nicht raten muss.
//
// Das Modul hat **keine** Importe und ist damit von jeder Schicht aus benutzbar: Guard 3 und
// Guard 4 in `server/register-tools.ts`, Guard 5 in `guards/limits.ts`, der Request-Mapper in
// `mapping/request.ts` und die Querprüfungen in `schema/cross-checks.ts` nennen eine Stelle
// sonst in vier Schreibweisen, und der Agent müsste raten, ob sie dasselbe meinen.

/**
 * Eine Listenstelle aus einem nullbasierten Index: Das **zweite** Element heißt „Position 2".
 *
 * @param index Der Index in der Liste, wie ihn JavaScript und Zod führen, also ab 0.
 */
export function positionLabel(index: number): string {
  return `Position ${String(index + 1)}`;
}

/**
 * Ein Listenelement innerhalb eines Pfades: `receipts (Position 2)`.
 *
 * @param listPath Der Pfad der Liste selbst, zum Beispiel `receipts` oder
 *                 `receipts (Position 2).positions`.
 * @param index    Der Index des Elements, ab 0.
 */
export function elementLabel(listPath: string, index: number): string {
  return `${listPath} (${positionLabel(index)})`;
}

/**
 * Ein Pfad aus Segmenten als Ortsangabe, zum Beispiel
 * `receipts (Position 2).positions (Position 3).amount`.
 *
 * Die Segmentfolge ist die eines Zod-Befundes: Feldnamen als Zeichenketten, Listenstellen als
 * Zahlen. Ein leerer Pfad ergibt die leere Zeichenkette; wie eine Meldung den ganzen Aufruf
 * benennt, entscheidet die aufrufende Stelle und nicht dieses Modul.
 */
export function pathLabel(path: readonly (string | number | symbol)[]): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out = out === "" ? positionLabel(segment) : elementLabel(out, segment);
    } else {
      out = out === "" ? String(segment) : `${out}.${String(segment)}`;
    }
  }
  return out;
}
