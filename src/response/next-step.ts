// Anschlusshinweis und Umkehrweg (Plan 7.6).
//
// Zwei Dinge stehen hier, weil sie beide dieselbe Frage beantworten — „und was jetzt?" — und
// beide aus dem Werkzeugnamen folgen:
//
//  1. **Der Weg zurück.** Jede Antwort eines schreibenden Werkzeugs nennt ihn, „sofern es
//     einen gibt, und ausdrücklich dessen Fehlen, wo es keinen gibt" (Plan 7.6). Die Zuordnung
//     steht in {@link REVERSAL_BY_TOOL}, abgeleitet aus der Werkzeugtabelle in Plan 3.8 und dem
//     Wegweiser in 3.7. Sie steht hier und nicht im Registereintrag, weil `ToolEntry` (Plan
//     2.1) kein Feld dafür führt; wäre eines vorgesehen, gehörte sie dorthin.
//  2. **Die vier Anschlusshinweise aus der Tabelle in 7.6**, wörtlich.
//
// Ton: Hinweise erscheinen nur, wenn sie nicht offensichtlich sind, und **nie als Anweisung an
// das Modell**, sondern als Befund mit Handlungsoption. „Die Antwort ist voll, es gibt also
// wahrscheinlich mehr" ist ein Befund; „rufe jetzt X auf" wäre eine Anweisung.

/** Der Weg zurück zu einem schreibenden Aufruf. */
export type Reversal =
  | {
      readonly kind: "tool";
      /** Das Werkzeug, mit dem der Vorgang zurückgenommen wird. */
      readonly tool: string;
      /**
       * Zuordnung Parameter des Umkehrwerkzeugs → Feld, aus dem der Wert kommt. Gelesen wird
       * zuerst die Schreibantwort, dann die Argumente des Aufrufs; **ohne** zusätzlichen
       * Request (Plan 7.6).
       */
      readonly argFrom: Readonly<Record<string, string>>;
      /** Was dabei wirklich passiert. Pflicht, wo „zurücknehmen" nicht „ungeschehen" heißt. */
      readonly note: string;
    }
  | {
      readonly kind: "none";
      /** Warum es keinen Weg zurück gibt. Pflicht: Das Fehlen wird ausdrücklich genannt. */
      readonly note: string;
    };

const NO_TRANSACTION_DELETE =
  "Die API kennt keinen Endpunkt, eine Zahlung zu löschen. Eine falsch angelegte Zahlung ist " +
  "nur in der Weboberfläche von BuchhaltungsButler zu bereinigen.";

const NO_PREVIOUS_STATE =
  "Kein Endpunkt liefert den Vorzustand zurück. Er ist nach dem Überschreiben über die API " +
  "nicht mehr lesbar; nur ein erneutes Überschreiben mit den alten Werten stellt ihn her, " +
  "wenn sie noch bekannt sind.";

const UNCONFIRM_NOTE =
  "entfernt ausschließlich nicht festgeschriebene Buchungen. Ist die Buchung bereits " +
  "festgeschrieben, hilft nur bb_postings_cancel, und dabei entsteht eine dauerhaft sichtbare " +
  "Stornobuchung.";

const RECREATE_NOTE =
  "legt die Buchungen neu an. Der ursprüngliche Stand wird dadurch nicht wiederhergestellt; " +
  "Buchungsnummern und Zeitstempel sind danach andere.";

/**
 * Der Weg zurück je schreibendem Werkzeug, vollständig für alle 39 (Plan 3.8, 3.9).
 *
 * Lesende Werkzeuge stehen nicht in der Tabelle: Sie verändern nichts, und ein „Weg zurück"
 * wäre dort eine sinnlose Zeile.
 */
export const REVERSAL_BY_TOOL: Readonly<Record<string, Reversal>> = Object.freeze({
  // --- Belege ------------------------------------------------------------------------
  bb_receipts_create: {
    kind: "tool",
    tool: "bb_receipts_delete",
    argFrom: { receipt_id_by_customer: "id_by_customer" },
    note: "markiert den Beleg als gelöscht. Endgültig entfernt wird er nicht; bb_receipts_restore macht ihn wieder buchungsrelevant.",
  },
  bb_receipts_create_batch: {
    kind: "tool",
    tool: "bb_receipts_delete",
    argFrom: {},
    note: "markiert je Beleg einen als gelöscht; für einen Stapel ist es je angelegtem Beleg ein Aufruf.",
  },
  bb_receipts_upload: {
    kind: "tool",
    tool: "bb_receipts_delete",
    argFrom: { receipt_id_by_customer: "id_by_customer" },
    note: "markiert den Beleg als gelöscht. Die hochgeladene Datei verschwindet dadurch nicht aus BuchhaltungsButler.",
  },
  bb_receipts_delete: {
    kind: "tool",
    tool: "bb_receipts_restore",
    argFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
    note: "macht den Beleg wieder buchungsrelevant.",
  },
  bb_receipts_restore: {
    kind: "tool",
    tool: "bb_receipts_delete",
    argFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
    note: "markiert den Beleg wieder als gelöscht.",
  },

  // --- Zahlungen ---------------------------------------------------------------------
  bb_transactions_create: { kind: "none", note: NO_TRANSACTION_DELETE },
  bb_transactions_create_batch: { kind: "none", note: NO_TRANSACTION_DELETE },
  bb_transactions_assign_receipt: {
    kind: "tool",
    tool: "bb_transactions_unassign_receipt",
    argFrom: {
      receipt_id_by_customer: "receipt_id_by_customer",
      transaction_id_by_customer: "transaction_id_by_customer",
    },
    note: "löst die Zuordnung wieder. Sie scheitert, wenn inzwischen eine bestätigte Buchung daran hängt.",
  },
  bb_transactions_assign_receipt_batch: {
    kind: "tool",
    tool: "bb_transactions_unassign_receipt",
    argFrom: {},
    note: "löst je Zuordnung eine; für einen Stapel ist es je Paar ein Aufruf.",
  },
  bb_transactions_unassign_receipt: {
    kind: "tool",
    tool: "bb_transactions_assign_receipt",
    argFrom: {
      receipt_id_by_customer: "receipt_id_by_customer",
      transaction_id_by_customer: "transaction_id_by_customer",
    },
    note: "stellt die Zuordnung wieder her.",
  },

  // --- Rechnungen --------------------------------------------------------------------
  bb_invoices_create: {
    kind: "none",
    note:
      "Die API kennt keinen Storno für Rechnungen. Eine erzeugte Rechnung ist nummeriert und " +
      "bleibt bestehen; eine Gutschrift ist ein neuer Vorgang über dasselbe Werkzeug mit " +
      "invoice_type für Gutschriften.",
  },
  bb_invoices_create_draft: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, einen Entwurf zu entfernen. Er ist trotz fehlender " +
      "Nummer ein sichtbares Objekt in BuchhaltungsButler.",
  },
  bb_invoices_create_einvoice: {
    kind: "none",
    note:
      "Die API kennt keinen Storno für E-Rechnungen. Die erzeugte Rechnung ist nummeriert und " +
      "bleibt bestehen.",
  },

  // --- Buchungen ---------------------------------------------------------------------
  bb_postings_create_for_receipt: {
    kind: "tool",
    tool: "bb_postings_unconfirm_for_receipt",
    argFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
    note: UNCONFIRM_NOTE,
  },
  bb_postings_create_for_receipt_batch: {
    kind: "tool",
    tool: "bb_postings_unconfirm_for_receipt",
    argFrom: {},
    note: `${UNCONFIRM_NOTE} Für einen Stapel ist es je Beleg ein Aufruf.`,
  },
  bb_postings_create_for_transaction: {
    kind: "tool",
    tool: "bb_postings_unconfirm_for_transaction",
    argFrom: { transaction_id_by_customer: "transaction_id_by_customer" },
    note: UNCONFIRM_NOTE,
  },
  bb_postings_create_for_transaction_batch: {
    kind: "tool",
    tool: "bb_postings_unconfirm_for_transaction",
    argFrom: {},
    note: `${UNCONFIRM_NOTE} Für einen Stapel ist es je Zahlung ein Aufruf.`,
  },
  bb_postings_create_free: {
    kind: "tool",
    tool: "bb_postings_unconfirm_free",
    argFrom: { posting_id_by_customer: "id_by_customer" },
    note: UNCONFIRM_NOTE,
  },
  bb_postings_create_free_batch: {
    kind: "tool",
    tool: "bb_postings_unconfirm_free",
    argFrom: {},
    note: `${UNCONFIRM_NOTE} Für einen Stapel ist es je Buchung ein Aufruf.`,
  },
  bb_postings_unconfirm_for_receipt: {
    kind: "tool",
    tool: "bb_postings_create_for_receipt",
    argFrom: { receipt_id_by_customer: "receipt_id_by_customer" },
    note: RECREATE_NOTE,
  },
  bb_postings_unconfirm_for_transaction: {
    kind: "tool",
    tool: "bb_postings_create_for_transaction",
    argFrom: { transaction_id_by_customer: "transaction_id_by_customer" },
    note: RECREATE_NOTE,
  },
  bb_postings_unconfirm_free: {
    kind: "tool",
    tool: "bb_postings_create_free",
    argFrom: {},
    note: RECREATE_NOTE,
  },
  bb_postings_assign_receipt: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, die Bindung zwischen Beleg und freier Buchung wieder zu " +
      "lösen.",
  },
  bb_postings_cancel: {
    kind: "none",
    note:
      "Ein Storno lässt sich nicht zurücknehmen. War die Buchung festgeschrieben, bleibt die " +
      "Stornobuchung dauerhaft in der Historie sichtbar.",
  },

  // --- Debitoren und Kreditoren ------------------------------------------------------
  bb_debtors_create: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, ein Debitorenkonto zu löschen. Es bleibt im " +
      "Kontenrahmen; nur bb_debtors_update kann seine Stammdaten überschreiben.",
  },
  bb_debtors_create_batch: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, ein Debitorenkonto zu löschen. Das gilt für jedes " +
      "Element des Stapels.",
  },
  bb_debtors_update: { kind: "none", note: NO_PREVIOUS_STATE },
  bb_creditors_create: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, ein Kreditorenkonto zu löschen. Es bleibt im " +
      "Kontenrahmen; nur bb_creditors_update kann seine Stammdaten überschreiben.",
  },
  bb_creditors_create_batch: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, ein Kreditorenkonto zu löschen. Das gilt für jedes " +
      "Element des Stapels.",
  },
  bb_creditors_update: {
    kind: "none",
    note: `${NO_PREVIOUS_STATE} Überschrieben wird dabei auch die Bankverbindung.`,
  },

  // --- Konten -----------------------------------------------------------------------
  bb_postingaccounts_create: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, ein Sachkonto zu löschen. Das neue Konto bleibt im " +
      "Kontenrahmen des Mandanten.",
  },
  bb_postingaccounts_update: { kind: "none", note: NO_PREVIOUS_STATE },
  bb_payment_accounts_create: {
    kind: "none",
    note:
      "Die API kennt keinen Endpunkt, ein Zahlungskonto zu entfernen. is_revision_safe legt " +
      "dauerhaftes Verhalten fest und ist später nicht umzustellen.",
  },

  // --- Kommentare und Kostenstellen --------------------------------------------------
  bb_comments_create: {
    kind: "none",
    note:
      "Ein Kommentar ist über die API nicht löschbar und für andere Nutzer des Mandanten " +
      "sichtbar.",
  },
  bb_cost_locations_create: {
    kind: "tool",
    tool: "bb_cost_locations_delete",
    argFrom: { code: "code" },
    note:
      "entfernt die Kostenstelle wieder. Die Wirkung auf Buchungen, die bereits auf sie " +
      "verweisen, ist nicht dokumentiert.",
  },
  bb_cost_locations_update: { kind: "none", note: NO_PREVIOUS_STATE },
  bb_cost_locations_delete: {
    kind: "tool",
    tool: "bb_cost_locations_create",
    argFrom: { code: "code" },
    note:
      "legt eine Kostenstelle mit demselben code neu an. Ob damit die Verweise vorhandener " +
      "Buchungen wieder greifen, ist nicht dokumentiert und nicht verifiziert.",
  },

  // --- Berichte ---------------------------------------------------------------------
  bb_reports_create_bwa: {
    kind: "none",
    note:
      "Die Erzeugung ersetzt die zuvor erzeugte BWA. Der vorherige Stand ist über die API " +
      "nicht mehr abrufbar.",
  },
  bb_reports_create_sums: {
    kind: "none",
    note:
      "Die Erzeugung ersetzt die zuvor erzeugte Summen- und Saldenliste. Der vorherige Stand " +
      "ist über die API nicht mehr abrufbar.",
  },
});

/** Der Weg zurück eines Werkzeugs, oder `undefined` bei einem lesenden. */
export function reversalFor(toolName: string): Reversal | undefined {
  return REVERSAL_BY_TOOL[toolName];
}

/**
 * Der Satz „Weg zurück" für den Textblock.
 *
 * Die Werte der Umkehrargumente kommen aus der Schreibantwort und aus den Argumenten des
 * Aufrufs — **ohne** zusätzlichen Request (Plan 7.6). Ist ein Wert nicht bekannt, wird er
 * nicht erfunden: Dann steht dort der Parametername ohne Wert, und der Agent weiß, was er
 * einsetzen muss.
 */
export function reversalText(
  toolName: string,
  sources: readonly Readonly<Record<string, unknown>>[] = [],
): string {
  const reversal = reversalFor(toolName);
  if (reversal === undefined) {
    return "";
  }
  if (reversal.kind === "none") {
    return `Weg zurück: keiner. ${reversal.note}`;
  }

  const pairs = Object.entries(reversal.argFrom).map(([parameter, sourceField]) => {
    for (const source of sources) {
      const value = source[sourceField];
      // Eingesetzt wird nur, was sich eindeutig schreiben lässt: eine Kennung oder eine
      // Zeichenkette. Ein Objekt wäre kein Argument, sondern ein Rätsel.
      if (typeof value === "string" && value !== "") {
        return `${parameter}=${value}`;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return `${parameter}=${String(value)}`;
      }
    }
    return `${parameter}=<nachtragen>`;
  });

  const args = pairs.length === 0 ? "" : ` mit ${pairs.join(" und ")}`;
  return `Weg zurück: ${reversal.tool}${args}. Das ${reversal.note}`;
}

/**
 * Der Anschlusshinweis nach `bb_reports_create_bwa` beziehungsweise
 * `bb_reports_create_sums` (Plan 7.6, erste Zeile der Hinweistabelle).
 */
export function reportRequestedNote(options: {
  readonly reportId: string;
  readonly createTool: string;
  readonly getTool: string;
}): string {
  const { reportId, createTool, getTool } = options;
  return (
    `Auswertung ${reportId} wurde angefordert. Die Erzeugung läuft im Hintergrund. Abholen mit ` +
    `${getTool} und report_id_by_customer=${reportId}. Solange sie läuft, antwortet dieser ` +
    `Aufruf mit error_code 8; einige Sekunden warten und erneut abholen. ${createTool} in der ` +
    "Zwischenzeit nicht noch einmal aufrufen, das würde diese Auswertung ersetzen."
  );
}

/**
 * Der Hinweis auf ein gefundenes Duplikat (Plan 7.6, zweite Zeile).
 *
 * Er erscheint **ausschließlich** bei `BB_MCP_DUPLICATE_CHECK=on`; im Auslieferungszustand ist
 * der Guard aus, und dann geht auch kein Zusatzaufruf hinaus (Plan 6.2, 7.5 Regel 2).
 */
export function duplicateFoundNote(options: {
  readonly existingId: string;
  readonly deleteTool: string;
}): string {
  return (
    "Ein Beleg mit gleichem Datum, gleichem Betrag und gleicher Gegenpartei existiert bereits " +
    `(id_by_customer ${options.existingId}). War dieser Aufruf eine Wiederholung nach einem ` +
    `Zeitlimit, ist damit ein Duplikat entstanden; den neuen Beleg mit ${options.deleteTool} ` +
    "als gelöscht markieren."
  );
}

/** Der Hinweis nach `bb_postings_cancel` auf einer festgeschriebenen Buchung (dritte Zeile). */
export function cancelledFixedPostingNote(postingId: string): string {
  return (
    `Buchung ${postingId} war festgeschrieben und wurde deshalb nicht entfernt. Stattdessen ist ` +
    "eine Stornobuchung entstanden, die dauerhaft in der Historie sichtbar bleibt."
  );
}

/** Der Hinweis auf eine volle Seite des Kontenrahmens (vierte Zeile). */
export function fullPostingAccountPageNote(): string {
  return (
    "Eine volle Seite wurde geliefert; dieser Mandant kann mehr Konten haben als hier zu " +
    "sehen. Die Liste mischt Sachkonten, Zahlungskonten, Debitoren und Kreditoren; über die " +
    "Spalte type filtern."
  );
}
