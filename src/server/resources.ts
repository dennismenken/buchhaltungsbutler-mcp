// Die vier MCP-Resources aus Plan 7.7 (AP14).
//
// Sie kosten nur dann Kontext, wenn der Agent sie liest, und nehmen genau die Inhalte auf, die
// sonst 54-mal in Werkzeugbeschreibungen stünden (Plan 4.10, Weg 2 gegen den Kontextpreis von
// E1). Drei der vier sind reiner Text und hängen von nichts ab; die vierte liest den
// Stammdatenspeicher aus AP09 und ist im Auslieferungszustand abgeschaltet, weil der Speicher
// es ist.
//
// **Dieses Modul ruft das Cache-Modul nur auf und ändert es nicht.** Es schreibt nichts in den
// Speicher, holt nichts von der API nach und setzt keinen Request ab: Eine Resource, die still
// ein Token aus dem Minutenkontingent des Mandanten zöge, wäre genau die verborgene Logik, die
// Plan 1.5 ausschließt.
//
// Die Inhalte sind deutsch (E4). Feldnamen, Werkzeugnamen und API-Werte stehen unverändert im
// Original, API-Werte in einfachen Anführungszeichen (Plan 4.9).

import type { McpServer } from "@modelcontextprotocol/server";

import type { MasterDataStore } from "../cache/store.js";
import { POSTINGACCOUNTS_TOOL, cacheDisabledNotice, getMasterDataStore } from "../cache/store.js";
import { VAT_KEYS } from "../schema/vocab.js";

/** Die vier URIs aus Plan 7.7, in Registrierreihenfolge. */
export const RESOURCE_URIS = {
  accounts: "bb://guide/accounts",
  postings: "bb://guide/postings",
  vatKeys: "bb://vat-keys",
  postingAccounts: "bb://postingaccounts",
} as const;

/**
 * Der Medientyp aller vier Resources.
 *
 * Bewusst `text/plain` und nicht `text/markdown`: Der Buchungswegweiser und die Feldtabelle
 * unten leben von ihrer Ausrichtung in Spalten, und ein Markdown-Renderer würde sie zu einem
 * Absatz zusammenschieben. Angekündigt wird deshalb, was tatsächlich geliefert wird.
 */
const MIME_TYPE = "text/plain";

// ---------------------------------------------------------------------------------------
// bb://guide/postings — der Wegweiser aus Plan 3.7
// ---------------------------------------------------------------------------------------

/**
 * Der Wegweiser durch die zwölf Buchungswerkzeuge, wörtlich nach Plan 3.7 Ebene 3.
 *
 * Er steht genau einmal: hier als Resource `bb://guide/postings` und, über diesen Export, im
 * Servertext aus `instructions.ts`. Zwölf Beschreibungen, die ihn je einzeln tragen, wären nach
 * der Rechnung in 4.9 rund 3.450 Zeichen teurer und liefen bei der ersten Änderung auseinander.
 *
 * Die Ausrichtung ist Absicht: Die linke Spalte ist die Frage, die der Agent an sich selbst
 * stellt, die rechte die Antwort. Eine Fließtextfassung derselben zehn Regeln liest sich als
 * Aufzählung von Werkzeugnamen und nicht als Entscheidungsbaum.
 */
export const POSTINGS_GUIDE = `Welches Buchungswerkzeug brauche ich?
  Ich habe die id_by_customer eines Belegs        → bb_postings_create_for_receipt
  Ich habe die id_by_customer einer Zahlung       → bb_postings_create_for_transaction
  Ich habe weder das eine noch das andere         → bb_postings_create_free
  Ich habe viele Vorgänge derselben Art           → derselbe Name plus _batch
  Ich will vorhandene Buchungen sehen             → bb_postings_search
  Nicht festgeschriebene Buchungen eines Belegs
    wieder entfernen                              → bb_postings_unconfirm_for_receipt
  Nicht festgeschriebene Buchungen einer Zahlung
    wieder entfernen                              → bb_postings_unconfirm_for_transaction
  Eine nicht festgeschriebene freie Buchung
    wieder entfernen                              → bb_postings_unconfirm_free
  Eine festgeschriebene Buchung stornieren        → bb_postings_cancel (erzeugt einen Storno)
  Einen Beleg an eine freie Buchung binden        → bb_postings_assign_receipt (kein Weg zurück)`;

// ---------------------------------------------------------------------------------------
// bb://guide/accounts — die Kontenkunde aus Plan 3.4
// ---------------------------------------------------------------------------------------

/**
 * Maßnahme 5 aus Plan 3.4, die lange Fassung.
 *
 * Die fünf Zeilen in den `instructions` sagen, dass es vier Begriffe gibt und welches Werkzeug
 * nachschlägt. Hier steht, warum die Verwechslung teuer ist, welches Feld welche Nummer
 * erwartet und woran der Agent die Art eines Kontos in der Antwort erkennt.
 */
const ACCOUNTS_GUIDE = `KONTENKUNDE: ZAHLUNGSKONTO, SACHKONTO, DEBITOR, KREDITOR

Vier Dinge heißen in BuchhaltungsButler "Konto". Sie zu verwechseln erzeugt keine
Fehlermeldung, sondern eine falsche Buchung.

1. ZAHLUNGSKONTO
   Bankkonto oder Kasse, über die Geld tatsächlich fließt. Die API liefert je Zahlungskonto
   genau zwei Felder: name und postingaccount_number. Ein Zahlungskonto wird also über eine
   SACHKONTONUMMER adressiert, etwa 1200 (Bank im SKR03) oder 1800 (Bank im SKR04).
   Auflisten: bb_payment_accounts_list. Anlegen: bb_payment_accounts_create.
   Diese Liste wird nie zwischengespeichert und ist immer frisch.

2. SACHKONTO
   Konto der Buchführung, auf das gebucht wird: Aufwand, Ertrag, Bestand. Vier- bis
   achtstellig, je nach Einrichtung des Mandanten.
   Suchen: bb_postingaccounts_search. Anlegen: bb_postingaccounts_create.

3. DEBITOR
   Personenkonto eines Kunden, gegen den eine Forderung besteht. Eine Stelle länger als ein
   Sachkonto. Suchen: bb_debtors_search. Anlegen: bb_debtors_create.

4. KREDITOR
   Personenkonto eines Lieferanten, gegen den eine Verbindlichkeit besteht.
   Suchen: bb_creditors_search. Anlegen: bb_creditors_create.

DIE SACHKONTENLISTE IST EINE VEREINIGUNG
bb_postingaccounts_search liefert alle vier Arten nebeneinander. Unterschieden werden sie
ausschließlich an type und subtype, und beide Felder liefert das Werkzeug immer mit, auch in
der gekürzten Darstellung. Live beobachtet am 2026-09-12: type war 'postingaccount',
'account', 'debtor', 'debtor collective', 'creditor' oder 'creditor collective'; subtype war
'default', 'cash', 'bank/institution', 'other' oder null. Die Werte sind beobachtet und nicht
abschließend dokumentiert; ein unbekannter Wert ist deshalb kein Fehler.

WELCHES FELD ERWARTET WELCHE NUMMER, UND WER SCHLÄGT SIE NACH
  payment_account_number           Zahlungskonto        bb_payment_accounts_list
  postingaccount_number            Sachkonto            bb_postingaccounts_search
  postingaccount (in positions)    Sachkonto            bb_postingaccounts_search
  postingaccount_debit             Sachkonto im Soll    bb_postingaccounts_search
  postingaccount_credit            Sachkonto im Haben   bb_postingaccounts_search
  parent_postingaccount_number     Sachkonto            bb_postingaccounts_search
  creditor_debtor                  Personenkonto        bb_debtors_search bzw.
                                                        bb_creditors_search
  cost_location, cost_location_two Kostenstelle         bb_cost_locations_search

Jedes dieser Felder nennt in seiner eigenen Beschreibung genau ein Nachschlagewerkzeug, nie
zwei. Steht dort bb_payment_accounts_list, ist ein Zahlungskonto gemeint, auch wenn der Wert
aussieht wie eine Sachkontonummer.

MERKSATZ
Die Sachkontonummer ist das Format, das Zahlungskonto die Bedeutung. Aus der Nummer allein
folgt nicht, was sie bezeichnet. Das sagt der Feldname, und im Zweifel die Liste aus
bb_postingaccounts_search mit ihrem type.

EINE FALLE MIT GLEICHEM NAMEN
Der API-Parameter account bedeutet an /receipts/*, /transactions/* ein Zahlungskonto; an
/postings/get ist er eine kommagetrennte Filterliste mit Schlüsselwörtern. Deshalb heißt er
im Werkzeugschema payment_account_number beziehungsweise postingaccount_filter und nirgends
account.`;

// ---------------------------------------------------------------------------------------
// bb://vat-keys — die 23 Steuerschlüssel mit deutschen Bezeichnungen
// ---------------------------------------------------------------------------------------

/**
 * Die deutschen Bezeichnungen der 23 Steuerschlüssel, wörtlich aus der Spezifikation
 * (Beschreibungstext von `vat` an `/postings/add/free`, gleichlautend an den beiden anderen
 * Buchungsendpunkten; `docs/api/buchungen.md` 4.1).
 *
 * Die Schlüssel selbst kommen aus {@link VAT_KEYS} und werden hier nicht wiederholt: Das
 * `satisfies` erzwingt, dass diese Tabelle genau die 23 Werte trägt, die das Eingabeschema
 * zulässt. Fällt in `vocab.ts` einer weg oder kommt einer hinzu, bricht die Typprüfung hier
 * und nicht erst der Agent an einer Liste, die nichts mehr mit dem Schema zu tun hat.
 *
 * Hier stehen die Bezeichnungen und nicht in sechs Werkzeugbeschreibungen: Mit Labels kosten
 * sie rund 1.100 Zeichen je Vorkommen (Sparmaßnahme S3 aus Plan 4.10).
 */
const VAT_KEY_LABELS = {
  "0_none": "keine Ust.",
  "19_vat": "19% Ust.",
  "7_vat": "7% Ust.",
  "19_pre": "19% Vst.",
  "7_pre": "7% Vst.",
  "19_both_1": "§13b 19% USt./VSt.",
  "19_both_506": "§13b 19% USt./VSt. (EU §13b Abs. 1)",
  "19_both_6506": "§13b 19% USt. (EU §13b Abs. 1, ohne VSt.)",
  "19_both_511": "§13b 19% USt./VSt. (Drittland §13b Abs. 2 Nr. 1)",
  "19_both_6511": "§13b 19% USt. (Drittland §13b Abs. 2 Nr. 1, ohne VSt.)",
  "19_both_6501": "§13b 19/16% USt. (ohne VSt.)",
  "19_both_2": "I.g.E. 19% USt./VSt.",
  "7_both": "I.g.E. 7% USt./VSt.",
  "19_both_1_no_pre": "§13b 19/16% USt.",
  "19_both_2_no_pre": "i.g.E. 19/16% USt.",
  "7_both_no_pre": "i.g.E. 7/5% USt.",
  "19_pre_app": "19/16% Aufz. VSt.",
  "7_pre_app": "7/5% Aufz. VSt.",
  "19_both_app_1": "§13b 19/16% USt./Aufz. VSt.",
  "19_both_app_506": "§13b 19/16% USt./Aufz. VSt. (EU §13b Abs. 1)",
  "19_both_app_511": "§13b 19/16% USt./Aufz. VSt. (Drittland §13b Abs. 2 Nr. 1)",
  "19_both_app_2": "i.g.E. 19/16% USt./Aufz. VSt.",
  "7_both_app": "i.g.E. 7/5% USt./Aufz. VSt.",
} as const satisfies Record<(typeof VAT_KEYS)[number], string>;

/** Die längste Schlüsselbreite, damit die Tabelle in einer Spalte steht. */
const VAT_KEY_WIDTH = Math.max(...VAT_KEYS.map((key) => key.length));

/** Der Text der Resource `bb://vat-keys`. Einmal beim Laden gebaut, danach unveränderlich. */
const VAT_KEYS_GUIDE = [
  "DIE 23 STEUERSCHLÜSSEL DER EINGABESEITE",
  "",
  "Wert für die Felder vat beziehungsweise vats an den Buchungswerkzeugen. Die Liste ist an",
  "allen drei Buchungsendpunkten wortgleich hinterlegt; die Bezeichnungen stammen wörtlich",
  "aus der API-Spezifikation.",
  "",
  ...VAT_KEYS.map((key) => `  ${key.padEnd(VAT_KEY_WIDTH)}  ${VAT_KEY_LABELS[key]}`),
  "",
  "WIE DIE NAMEN ZU LESEN SIND",
  "  _vat   Umsatzsteuer, also Ausgangsumsätze",
  "  _pre   Vorsteuer, also Eingangsumsätze",
  "  _both  beides zugleich: Reverse Charge nach §13b UStG oder innergemeinschaftlicher",
  "         Erwerb (i.g.E.)",
  "  _app   'Aufz.' in der Bezeichnung: aufzuteilende Vorsteuer, also nur teilweise abziehbar",
  "  _no_pre und die 65xx-Schlüssel: Umsatzsteuer wird geschuldet, der Vorsteuerabzug",
  "         unterbleibt; so lesen sich die Zusätze 'ohne VSt.' in den Bezeichnungen oben",
  "",
  "WAS DIESE LISTE NICHT SAGT",
  "Welcher Schlüssel im Einzelfall zulässig ist, hängt vom Sachkonto, vom Buchungsdatum und",
  "von den Einstellungen des Mandanten ab. Die API lehnt eine unzulässige Kombination vor dem",
  "Buchen ab und nennt in der Fehlermeldung den Grund; der gelieferte Wortlaut kann von der",
  "Spezifikation abweichen und wird hier deshalb nicht zitiert.",
  "Ist für den Mandanten die Kleinunternehmerregelung nach §19 UStG aktiv, ist '0_none' der",
  "einzige gültige Wert; jeder andere Schlüssel wird abgelehnt.",
  "Die Zuordnung eines Geschäftsvorfalls zu einem Steuerschlüssel ist eine steuerliche",
  "Entscheidung. Im Zweifel den Nutzer fragen, nicht raten.",
].join("\n");

// ---------------------------------------------------------------------------------------
// bb://postingaccounts — der Kontenrahmen des Mandanten aus dem Stammdatenspeicher
// ---------------------------------------------------------------------------------------

/** Ein Feld einer gespeicherten Zeile als Text, oder `undefined`, wenn es nichts hergibt. */
function fieldText(row: Record<string, unknown>, name: string): string | undefined {
  const value = row[name];
  if (typeof value === "string") {
    return value === "" ? undefined : value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

/** Eine Anzahl mit ihrem Substantiv, Einzahl wie Mehrzahl. */
function count(value: number, singular: string, plural: string): string {
  return `${String(value)} ${value === 1 ? singular : plural}`;
}

/**
 * Der Hinweis auf das Alter eines Standes, im Muster aus Plan 7.8 Punkt 2.
 *
 * Gerundet auf ganze Sekunden: Eine Millisekundenangabe suggeriert eine Genauigkeit, die für
 * die Frage „ist das noch aktuell" nichts beiträgt. Mindestens eine Sekunde, weil „vor 0
 * Sekunden" keine Auskunft ist.
 */
function ageSentence(ageMs: number): string {
  const seconds = Math.max(1, Math.round(ageMs / 1000));
  return (
    "Aus dem Stammdatenspeicher dieses Serverprozesses, abgelegt vor " +
    `${count(seconds, "Sekunde", "Sekunden")}.`
  );
}

/**
 * Der Kontenrahmen als Text, gruppiert nach `type`.
 *
 * Gruppiert wird, weil genau diese Gruppierung den Verwechslungsfall aus Plan 3.4 sichtbar
 * macht: Wer die Liste liest, sieht auf einen Blick, dass 1200 ein Zahlungskonto und 4980 ein
 * Sachkonto ist. Unbekannte Zeilenformen werden übersprungen und gezählt, nicht geraten: Der
 * Speicher trägt die Antwort der API, und die liefert nachweislich Felder, die keine
 * Spezifikation kennt (Plan 0.3, Befund L4).
 */
function renderChartOfAccounts(rows: readonly unknown[], ageMs: number): string {
  const groups = new Map<string, string[]>();
  let skipped = 0;

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      skipped += 1;
      continue;
    }
    const record = row as Record<string, unknown>;
    const number = fieldText(record, "postingaccount_number");
    const name = fieldText(record, "name");
    if (number === undefined) {
      skipped += 1;
      continue;
    }
    const type = fieldText(record, "type") ?? "ohne type";
    const subtype = fieldText(record, "subtype");
    const line = `  ${number}  ${name ?? "(ohne Namen)"}${subtype === undefined ? "" : ` [${subtype}]`}`;
    const bucket = groups.get(type);
    if (bucket === undefined) {
      groups.set(type, [line]);
    } else {
      bucket.push(line);
    }
  }

  const blocks: string[] = [
    "KONTENRAHMEN DES MANDANTEN",
    "",
    ageSentence(ageMs),
    `${count(rows.length, "Zeile", "Zeilen")}, so wie ${POSTINGACCOUNTS_TOOL} sie zuletzt` +
      " geliefert hat.",
    "Das ist die Zeilenzahl jener Antwort und keine Gesamttrefferzahl; wurde sie mit einem",
    "limit abgerufen, fehlt hier alles darüber hinaus.",
    `Frisch holen: ${POSTINGACCOUNTS_TOOL} aufrufen. Der Stand hier wird dabei erneuert.`,
    "",
    "Die Liste ist eine Vereinigung aus Sachkonten, Zahlungskonten, Debitoren und Kreditoren;",
    "die Überschrift jedes Blocks ist der Wert von type, die Angabe in eckigen Klammern der",
    "subtype. Einzelheiten in bb://guide/accounts.",
  ];

  for (const [type, lines] of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    blocks.push("", `${type} (${String(lines.length)})`, ...lines);
  }

  if (skipped > 0) {
    blocks.push(
      "",
      `${count(skipped, "Zeile", "Zeilen")} ohne verwertbare postingaccount_number wurde` +
        `${skipped === 1 ? "" : "n"} ausgelassen.`,
    );
  }

  return blocks.join("\n");
}

/**
 * Der Text der Resource `bb://postingaccounts`, in allen drei möglichen Zuständen.
 *
 * Der Absagetext bei abgeschaltetem Speicher steht nicht hier, sondern in `cache/store.ts`
 * (Plan 7.7, letzte Zeile): Er nennt die Umgebungsvariable und das Werkzeug, und beides gehört
 * an dieselbe Stelle wie der Speicher selbst.
 */
function chartOfAccountsText(store: MasterDataStore): string {
  if (!store.isEnabled()) {
    return cacheDisabledNotice();
  }

  const hit = store.read(POSTINGACCOUNTS_TOOL);
  if (hit === undefined) {
    return (
      "Der Kontenrahmen liegt noch nicht vor: Der Stammdatenspeicher dieses Serverprozesses " +
      `ist zwar eingeschaltet (${String(store.ttlMs())} ms), enthält aber keinen Stand von ` +
      `${POSTINGACCOUNTS_TOOL} — entweder wurde das Werkzeug in diesem Serverlauf noch nicht ` +
      "aufgerufen, oder der Stand ist abgelaufen oder wurde nach einer Änderung an Sachkonten, " +
      `Debitoren oder Kreditoren verworfen. Einmal ${POSTINGACCOUNTS_TOOL} aufrufen; danach ` +
      "beantwortet diese Resource die Frage ohne weiteren Aufruf an die API."
    );
  }

  if (!Array.isArray(hit.payload)) {
    // Der Speicher nimmt nur Listen auf (Plan 7.8). Eine andere Form ist ein Fehler im
    // Befüllen, und daraus einen Kontenrahmen zu bauen hieße, geratene Daten als echte
    // auszugeben.
    return (
      "Der gespeicherte Stand von " +
      POSTINGACCOUNTS_TOOL +
      " hat nicht die erwartete Listenform und wird deshalb nicht ausgegeben. " +
      `Den Kontenrahmen mit ${POSTINGACCOUNTS_TOOL} frisch abrufen.`
    );
  }

  return renderChartOfAccounts(hit.payload, hit.ageMs);
}

// ---------------------------------------------------------------------------------------
// Registrierung
// ---------------------------------------------------------------------------------------

export interface RegisterResourcesOptions {
  /**
   * Der Stammdatenspeicher, aus dem `bb://postingaccounts` den Kontenrahmen liest. Ohne
   * Angabe der prozessweite Speicher aus `cache/store.ts`.
   */
  readonly store?: MasterDataStore;
}

/** Die Angaben, mit denen eine Resource am Server angemeldet wird. */
interface TextResource {
  /** Der programmatische Name. Er folgt dem Präfix der Werkzeuge in seiner URI-Schreibweise. */
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
  /**
   * Der Inhalt. Eine Funktion und kein String, weil `bb://postingaccounts` bei jedem Lesen den
   * Speicher befragt; die drei festen Texte geben schlicht ihre Konstante zurück.
   */
  readonly read: () => string;
}

/**
 * Registriert die vier MCP-Resources aus Plan 7.7 am Server.
 *
 * @returns Die URIs der registrierten Resources, in Registrierreihenfolge. Der Rückgabewert
 *          ist kein Zierrat — er ist die Angabe, die der Zustandsblock der `instructions` und
 *          ein Test gegen die Liste in 7.7 halten können, ohne den Server zu befragen.
 */
export function registerResources(
  server: McpServer,
  options: RegisterResourcesOptions = {},
): readonly string[] {
  // Der Speicher wird erst hier geholt und nicht beim Laden des Moduls: `getMasterDataStore`
  // liest die eingefrorene Konfiguration, und die steht beim Import noch nicht fest.
  const store = options.store ?? getMasterDataStore();

  const resources: readonly TextResource[] = [
    {
      name: "bb-guide-accounts",
      uri: RESOURCE_URIS.accounts,
      title: "Kontenkunde",
      description:
        "Zahlungskonto, Sachkonto, Debitor und Kreditor auseinanderhalten: welches Feld " +
        "welche Nummer erwartet und welches Werkzeug sie nachschlägt.",
      read: () => ACCOUNTS_GUIDE,
    },
    {
      name: "bb-guide-postings",
      uri: RESOURCE_URIS.postings,
      title: "Wegweiser durch die Buchungswerkzeuge",
      description:
        "Welches der zwölf bb_postings_-Werkzeuge zu welcher Ausgangslage gehört, als " +
        "Entscheidungsbaum.",
      read: () => POSTINGS_GUIDE,
    },
    {
      name: "bb-vat-keys",
      uri: RESOURCE_URIS.vatKeys,
      title: "Steuerschlüssel",
      description:
        "Die 23 zulässigen Werte der Felder vat und vats mit ihren deutschen Bezeichnungen.",
      read: () => VAT_KEYS_GUIDE,
    },
    {
      name: "bb-postingaccounts",
      uri: RESOURCE_URIS.postingAccounts,
      title: "Kontenrahmen des Mandanten",
      description:
        "Der zuletzt abgerufene Kontenrahmen aus dem Stammdatenspeicher dieses " +
        "Serverprozesses. Ist der Speicher abgeschaltet, nennt die Resource das Werkzeug, " +
        "mit dem sich die Liste abrufen lässt.",
      read: () => chartOfAccountsText(store),
    },
  ];

  for (const resource of resources) {
    server.registerResource(
      resource.name,
      resource.uri,
      { title: resource.title, description: resource.description, mimeType: MIME_TYPE },
      (uri) => ({
        contents: [{ uri: uri.href, mimeType: MIME_TYPE, text: resource.read() }],
      }),
    );
  }

  return resources.map((resource) => resource.uri);
}
