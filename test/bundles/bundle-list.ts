// Die zweite, unabhängig gepflegte Namensliste der fünf Bündelwerkzeuge (N3, N4).
//
// Sie liegt aus demselben Grund getrennt vom Register wie `test/registry/class-list.ts` und
// `test/registry/group-list.ts`: Eine Prüfung, die die Namen aus derselben Datei liest, in der
// sie stehen, prüft sich selbst. `read-bundles-contract.test.ts` vergleicht `built.bundles`
// gegen `BUNDLE_ENTRIES`, also die Liste gegen sich selbst, und alle Zählstellen rechnen
// `TOOL_ENTRIES.length + BUNDLE_ENTRIES.length`; sie wachsen und schrumpfen deshalb mit. Fiele
// ein Eintrag aus `src/bundles/index.ts` heraus, verschwände das Werkzeug aus `tools/list`,
// ohne dass eine einzige Prüfung rot würde. Genau dieser Fall ist während des Baus schon
// einmal eingetreten, als die Datei von einem zweiten Agenten neu geschrieben wurde.
//
// Die Liste wird niemals aus dem Register abgeleitet, und sie darf es auch nicht: Eine aus
// `BUNDLE_ENTRIES` erzeugte Sollliste kann keinen fehlenden Eintrag melden.
//
// **Ein sechstes Bündel ist eine Entscheidung des Projektinhabers** (N3, N4; die Liste der
// Bündel ist nach `src/bundles/index.ts` abschließend). Wer hier einen Namen ergänzt oder
// streicht, ohne dass diese Entscheidung vorliegt, hebelt die Prüfung aus, statt sie zu
// erfüllen.
//
// Reihenfolge ist die der Bauvorlage und zugleich die Registrierreihenfolge.

/**
 * Die fünf erwarteten Bündelnamen, von Hand aus der Bauvorlage abgeschrieben, in der
 * Reihenfolge, in der sie registriert werden.
 */
export const EXPECTED_BUNDLE_NAMES: readonly string[] = [
  "bb_masterdata_search",
  "bb_records_collect",
  "bb_assignments_get",
  "bb_reports_run",
  "bb_balances_get",
];

/**
 * Die Anzahl der Bündel, ebenfalls von Hand geschrieben. Sie ist die Quersumme zur Liste oben:
 * Ein versehentlich gestrichener oder doppelt eingetragener Name fällt hier auf, auch wenn
 * jemand die Liste und die Prüfung gemeinsam anfasst.
 */
export const EXPECTED_BUNDLE_COUNT = 5;
