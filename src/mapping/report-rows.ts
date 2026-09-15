/**
 * Die drei Berichtsantworten als flache Zeilen.
 *
 * Die Abholendpunkte der Berichte liefern ihre Nutzdaten nicht unter `data`, sondern als
 * verschachteltes Objekt auf der obersten Ebene des Umschlags, und jeder Bericht in einer
 * eigenen Form (Befund L7 in docs/api/live-befunde.md):
 *
 * - Kontenblatt: `report_sums_postingaccount_ledger.postingaccountLedger`, eine Liste.
 * - Summen- und Saldenliste: `report.sums`, ein Objekt mit der Kontonummer als Schlüssel.
 * - BWA: `report.groups`, ein Baum aus Gruppen, darin Klassen, darin Konten, dazu
 *   `report.totals`.
 *
 * Ohne Umformung wäre der ganze Bericht ein einziges unbekanntes Feld und käme als roher
 * JSON-Block beim Agenten an. Flach gelegt greifen Antwortvertrag, Tabelle und Kürzung wie bei
 * jedem Listenendpunkt. Die Kopfangaben des Berichts wandern in `summary`.
 *
 * Werte werden nicht umgedeutet: Was die API als Zahl liefert, bleibt eine Zahl, auch bei
 * Beträgen. Passt eine Antwort nicht zur erwarteten Form, liefert die Umformung `null`, und
 * der Aufrufer reicht den Bericht unverändert durch, statt Daten zu verlieren.
 */

import type { ReportRowsKind } from "../registry/types.js";

/** Die flach gelegten Zeilen eines Berichts und seine Kopfangaben. */
export interface ReportRows {
  readonly rows: readonly unknown[];
  readonly summary: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Die Dateien eines Berichts stehen auf der obersten Ebene neben `report`, nicht darin. Beim
 * Flachlegen gingen sie sonst verloren; sie wandern deshalb in die Kopfangaben, wo die
 * Antwortaufbereitung Base64-Inhalte wie überall ersetzt.
 */
function withFiles(
  summary: Record<string, unknown>,
  body: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return "files" in body ? { ...summary, files: body["files"] } : summary;
}

/** Übernimmt die genannten Kopfangaben, soweit sie vorhanden sind. */
function pick(source: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const name of names) {
    if (name in source) {
      summary[name] = source[name];
    }
  }
  return summary;
}

function ledgerRows(body: Readonly<Record<string, unknown>>): ReportRows | null {
  const wrapper = body["report_sums_postingaccount_ledger"];
  if (!isPlainObject(wrapper) || !Array.isArray(wrapper["postingaccountLedger"])) {
    return null;
  }
  return {
    rows: wrapper["postingaccountLedger"],
    summary: pick(wrapper, ["postingaccount_number", "integrityError"]),
  };
}

function sumsRows(body: Readonly<Record<string, unknown>>): ReportRows | null {
  const report = body["report"];
  if (!isPlainObject(report) || !isPlainObject(report["sums"])) {
    return null;
  }
  const rows = Object.entries(report["sums"]).map(([key, entry]) => {
    if (!isPlainObject(entry)) {
      return entry;
    }
    // Die Kontoangaben stehen verschachtelt unter `postingaccount`; für eine Tabelle gehören
    // sie in dieselbe Zeile wie die Salden. Fehlt die Nummer dort, trägt sie der Schlüssel.
    const { postingaccount, ...balances } = entry;
    const account = isPlainObject(postingaccount) ? postingaccount : {};
    return {
      postingaccount_number: account["postingaccount_number"] ?? key,
      name: account["name"] ?? null,
      class: account["class"] ?? null,
      type: account["type"] ?? null,
      ...balances,
    };
  });
  return {
    rows,
    summary: withFiles(
      pick(report, ["integrityError", "countPostingsWithDateVatEffectiveNotConsideredInReport"]),
      body,
    ),
  };
}

/**
 * Die Konten einer BWA-Klasse als eigene Zeilen.
 *
 * Gemessen für 2024: Eine gefüllte Kontenliste kommt als Objekt mit der Kontonummer als
 * Schlüssel und je Konto `name` und `amountsSum`, eine leere dagegen als `[]`. Das ist die
 * übliche Eigenheit der PHP-Kodierung, die ein leeres assoziatives Array als JSON-Array
 * ausgibt. Beide Formen werden gelesen; ein Eintrag, der kein Objekt ist, geht mit seinem
 * Wert als Betrag hinaus, statt zu verschwinden.
 */
function accountRows(
  accounts: unknown,
  group: unknown,
  className: unknown,
): Record<string, unknown>[] {
  const entries: [unknown, unknown][] = isPlainObject(accounts)
    ? Object.entries(accounts)
    : Array.isArray(accounts)
      ? accounts.map((account) => [
          isPlainObject(account) ? (account["postingaccount_number"] ?? null) : null,
          account,
        ])
      : [];
  return entries.map(([number, account]) => ({
    level: "account",
    group,
    class: className,
    postingaccount_number: number,
    name: isPlainObject(account) ? (account["name"] ?? null) : null,
    amountsSum: isPlainObject(account) ? (account["amountsSum"] ?? null) : account,
    empty: null,
  }));
}

function bwaRows(body: Readonly<Record<string, unknown>>): ReportRows | null {
  const report = body["report"];
  if (!isPlainObject(report) || !isPlainObject(report["groups"])) {
    return null;
  }

  // Ergebniszeilen stehen in der BWA zwischen den Gruppen: `after` nennt die Gruppe, hinter
  // der sie folgen, `null` bedeutet am Ende. So liest sich die Tabelle in der Reihenfolge der
  // Auswertung und nicht mit allen Ergebnissen am Schluss.
  const totalsAfter = new Map<string, Record<string, unknown>[]>();
  const trailingTotals: Record<string, unknown>[] = [];
  if (isPlainObject(report["totals"])) {
    for (const total of Object.values(report["totals"])) {
      if (!isPlainObject(total)) {
        continue;
      }
      const row = {
        level: "total",
        group: null,
        class: null,
        postingaccount_number: null,
        name: total["totalDisplayName"] ?? total["totalName"] ?? null,
        amountsSum: total["amountsSum"] ?? null,
        empty: total["empty"] ?? null,
      };
      const after = total["after"];
      if (typeof after === "string") {
        totalsAfter.set(after, [...(totalsAfter.get(after) ?? []), row]);
      } else {
        trailingTotals.push(row);
      }
    }
  }

  const rows: Record<string, unknown>[] = [];
  const placed = new Set<string>();
  for (const [key, group] of Object.entries(report["groups"])) {
    if (!isPlainObject(group)) {
      continue;
    }
    const groupName = group["groupDisplayName"] ?? group["groupName"] ?? key;
    rows.push({
      level: "group",
      group: groupName,
      class: null,
      postingaccount_number: null,
      name: groupName,
      amountsSum: group["amountsSum"] ?? null,
      empty: group["empty"] ?? null,
    });
    if (isPlainObject(group["classes"])) {
      for (const cls of Object.values(group["classes"])) {
        if (!isPlainObject(cls)) {
          continue;
        }
        const className = cls["classDisplayName"] ?? cls["className"] ?? null;
        rows.push({
          level: "class",
          group: groupName,
          class: className,
          postingaccount_number: null,
          name: className,
          amountsSum: cls["amountsSum"] ?? null,
          empty: cls["empty"] ?? null,
        });
        rows.push(...accountRows(cls["postingaccounts"], groupName, className));
      }
    }
    for (const candidate of [key, group["groupName"]]) {
      if (typeof candidate === "string" && totalsAfter.has(candidate) && !placed.has(candidate)) {
        rows.push(...(totalsAfter.get(candidate) ?? []));
        placed.add(candidate);
      }
    }
  }
  // Ergebniszeilen, deren Bezugsgruppe fehlt, gehen nicht verloren, sondern ans Ende.
  for (const [after, totals] of totalsAfter) {
    if (!placed.has(after)) {
      rows.push(...totals);
    }
  }
  rows.push(...trailingTotals);

  return {
    rows,
    summary: withFiles(
      pick(report, [
        "standardChart",
        "integrityError",
        "postingsRecordsCount",
        "uncompletedPostingsCount",
        "usedPostingaccountsNumbers",
        "usedCostLocations",
      ]),
      body,
    ),
  };
}

/** Legt einen Bericht flach, oder liefert `null`, wenn die Antwort nicht die erwartete Form hat. */
export function reportRowsOf(
  kind: ReportRowsKind,
  body: Readonly<Record<string, unknown>>,
): ReportRows | null {
  switch (kind) {
    case "ledger":
      return ledgerRows(body);
    case "sums":
      return sumsRows(body);
    case "bwa":
      return bwaRows(body);
  }
}
