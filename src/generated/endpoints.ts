// ERZEUGT von scripts/gen-endpoints.ts aus docs/openapi/buchhaltungsbutler-v1.json.
// NICHT VON HAND ÄNDERN. Änderungen entstehen ausschließlich über `pnpm generate`; der
// CI-Schritt verlangt danach eine leere git-Differenz (Plan 4.2).
//
// Quelle: BuchhaltungsButler API, info.version 1.9.1.
//
// Diese Datei ist die maschinelle Wahrheit über den UMFANG der API: 54 Pfade mit
// zusammen 371 Body-Parametern. Sie ist ausdrücklich KEIN Auslieferungsschema. Die
// Spezifikation ist handgepflegt und nachweislich fehlerhaft; ihre Fehler sind hier sichtbar
// gemacht statt geglättet (Plan 4.1):
//
//   - itemsMissing: 32 Array-Parameter führen kein `items`, darunter alle parallelen Arrays.
//   - schema:      9 Parameter führen `schema` statt `type`; ihr Elementaufbau ist hier aufgelöst.
//   - valuesFromText: aus dem Fließtext gelesener VORSCHLAG. Die Spezifikation führt keinen
//     einzigen Parameter-`enum`; ein zu enges Enum lehnt gültige Vorgänge vor dem Netzaufruf ab.
//   - successFields: Feldname und Typ laut Spezifikation. AUSDRÜCKLICH UNZUVERLÄSSIG — die API
//     liefert nachweislich Felder, die die Spezifikation nicht kennt, und verwendet zwischen
//     Listen- und Einzelabruf verschiedene Namen (Plan 0.3, Befunde L2 und L4).
//
// Die vier Pfade mit dem Segment `id_by_customer` stehen hier UNVERÄNDERT. Das Segment ist
// ein Platzhalter für den Wert und kein literales Segment (Plan 4.6); der Pfadbau geschieht
// in src/mapping/path.ts, nachgeschlagen wird weiterhin mit dem Spezifikationspfad.

/** Ein Feld eines Stapelelements, aufgelöst über `$ref`. */
export interface GeneratedItemField {
  readonly name: string;
  readonly specType: string;
  readonly required: boolean;
  readonly description: string;
  readonly itemsMissing: boolean;
  readonly valuesFromText: readonly string[];
  /** Ein `enum` der Spezifikation, sofern vorhanden. Nicht ungeprüft als Wertevorrat übernehmen. */
  readonly specEnum?: readonly unknown[];
}

/** Der aufgelöste Aufbau eines Parameters, der `schema` statt `type` führt. */
export interface GeneratedSchemaInfo {
  readonly ref?: string;
  readonly containerType: string;
  readonly itemRef?: string;
  readonly itemRequired: readonly string[];
  readonly itemFields: readonly GeneratedItemField[];
  /** Namen aus `required`, zu denen es keine Eigenschaft gibt (Plan 0.5, Korrektur 1). */
  readonly requiredWithoutProperty: readonly string[];
}

/** Ein Body-Parameter genau so, wie die Spezifikation ihn führt. */
export interface GeneratedParameter {
  readonly name: string;
  readonly specType: string;
  readonly required: boolean;
  readonly description: string;
  readonly valuesFromText: readonly string[];
  readonly itemsMissing: boolean;
  readonly format?: string;
  readonly default?: unknown;
  readonly ref?: string;
  readonly schema?: GeneratedSchemaInfo;
}

/** Ein Feld der 200er-Antwort laut Spezifikation. Unzuverlässig, siehe Dateikopf. */
export interface GeneratedSuccessField {
  readonly name: string;
  readonly specType: string;
  readonly container: "envelope" | "data";
}

/** Ein Endpunkt der Spezifikation. Der Pfad ist unverändert der Spezifikationspfad. */
export interface GeneratedEndpoint {
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly parameters: readonly GeneratedParameter[];
  readonly successDefinition: string;
  readonly successShape: "list" | "object" | "ack";
  readonly successFields: readonly GeneratedSuccessField[];
}

/** Alle Endpunkte der Spezifikation, in deren Reihenfolge. */
export const ENDPOINTS: readonly GeneratedEndpoint[] = [
  {
    "path": "/receipts/get",
    "summary": "get receipts",
    "description": "Get receipts for a specified customer account. The response includes the number of returned rows and an array of receipts data.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "list_direction",
        "specType": "string",
        "required": true,
        "description": "Can be either 'inbound' (“Eingangsbelege”) or 'outbound' (“Ausgangsbelege”).",
        "valuesFromText": [
          "inbound",
          "outbound"
        ],
        "itemsMissing": false
      },
      {
        "name": "payment_status",
        "specType": "string",
        "required": false,
        "description": "Can be either 'paid' (“bezahlt”) or 'unpaid' (“unbezahlt”).\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "paid",
          "unpaid"
        ],
        "itemsMissing": false
      },
      {
        "name": "counterparty",
        "specType": "string",
        "required": false,
        "description": "The counterparty of the receipt, i.e. the invoicing party for type 'inbound' or the recipient for type 'outbound' (e.g. 'Peter Maier').\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_from",
        "specType": "string",
        "required": false,
        "description": "The receipt's issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All receipts with issuing date including and after given value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_to",
        "specType": "string",
        "required": false,
        "description": "The receipt's issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All receipts with issuing date including and before given value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "A limit of returned data. If no limit is given, the default will be 500.\n\nAlso the maximum limit is 500.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 500
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "The offset for paging returned data. If no offset is given, the default will be 0.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 0
      },
      {
        "name": "order",
        "specType": "(schema)",
        "required": false,
        "description": "Possible fields are:\ndate\namount\ninvoicenumber (invoice_number)\ninvoicingparty (counterparty)\n\nAllowed values are 'ASC' and 'DESC'\n\nExample:\n{\"date\": \"ASC\"}\n{\"date\": \"ASC\", \"amount\": \"DESC\"}",
        "valuesFromText": [
          "date",
          "amount"
        ],
        "itemsMissing": false,
        "schema": {
          "containerType": "object",
          "itemRequired": [
            "field"
          ],
          "itemFields": [
            {
              "name": "field",
              "specType": "string",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": [],
              "specEnum": [
                "ASC",
                "DESC"
              ]
            }
          ],
          "requiredWithoutProperty": []
        }
      },
      {
        "name": "include_offers",
        "specType": "boolean",
        "required": false,
        "description": "If true, offers will be included.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "deleted",
        "specType": "boolean",
        "required": false,
        "description": "If true, only deleted receipts will be returned.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "required": false,
        "description": "The invoicenumber for the invoice. If specified, the receipts with the same invoicenumber will be retrieved.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "due_date",
        "specType": "string",
        "required": false,
        "description": "The receipt's issuing due date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All receipts with the same due date given value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid due date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_since_last_modified",
        "specType": "string",
        "required": false,
        "description": "A date and time in format 'YYYY-MM-DD HH:MM:SS' (e.g. '2017-04-26 13:45:00'). If only 'YYYY-MM-DD' is specified, the time defaults to '23:59:59'. All receipts whose date_updated value is later than the specified value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "ReceiptsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "filename",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date_delivery",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date_uploaded",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "counterparty",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "payment_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "due_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "account",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "link_to_receipt_id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "deleted",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/receipts/get/id_by_customer",
    "summary": "get receipt by id_by_customer",
    "description": "Get a single receipt for a specified customer account by id_by_customer. You can get the “id_by_customer” by using the “/receipts/get method” first. The response includes an array of receipt data.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "get_file",
        "specType": "boolean",
        "required": false,
        "description": "If true, the file will be included as a base64 encoded string\n(e_invoice_type = 0 -> standard pdf file,\ne_invoice_type = 1 -> ZUGFeRD pdf file,\ne_invoice_type = 2 -> xRechnung xml file).\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      }
    ],
    "successDefinition": "ReceiptsGetIdByCustomer_Success",
    "successShape": "object",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "filename",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "counterparty",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount_original",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "currency",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "currency_original",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "exchangerate",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "vat",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "payment_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "account",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "e_invoice_type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "list_direction",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "payment_reference",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "file_content",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "file_type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date_delivery",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date_payment_due",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "link_to_receipt_id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "deleted",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/receipts/add",
    "summary": "add a receipt",
    "description": "Add a receipt into the specified customer account. NOTE: Use this endpoint, to add a receipt without a file!",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": true,
        "description": "Can be 'invoice inbound' (“Eingangsrechnung”), 'invoice outbound' (“Ausgangsrechnung”), 'credit inbound' (“Eingangsgutschrift § 14 UStG”), 'credit outbound' (“Ausgangsgutschrift § 14 UStG”).",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "counterparty",
        "specType": "string",
        "required": true,
        "description": "The counterparty of the receipt, i.e. the invoicing party for type 'invoice inbound' or the recipient for type 'invoice outbound' (e.g. 'Peter Maier').\n\nAn empty string is not considered a valid counterparty.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "invoice_number",
        "specType": "string",
        "required": true,
        "description": "The invoice number (e.g. '1231XU23') with a maximum length of 60 characters - may also be an empty string.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date",
        "specType": "string",
        "required": true,
        "description": "The receipt's issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26').\n\nAn empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "amount",
        "specType": "number",
        "required": true,
        "description": "The total amount of the receipt, can be negative to indicate a reversed payment (e.g. -12.30).\n\n'0.00' is not considered a valid receipt amount.",
        "valuesFromText": [],
        "itemsMissing": false,
        "format": "float"
      },
      {
        "name": "currency",
        "specType": "string",
        "required": true,
        "description": "At the moment we accept USD, GBP and CHF.\n\nAn empty string is not considered a valid currency.",
        "valuesFromText": [
          "USD",
          "GBP",
          "CHF"
        ],
        "itemsMissing": false
      },
      {
        "name": "vat_rate",
        "specType": "number",
        "required": false,
        "description": "The receipt's vat rate (e.g. 19.00 or 0) - may also be an empty string to indicate a non-available or multiple vat rates",
        "valuesFromText": [],
        "itemsMissing": false,
        "format": "float"
      },
      {
        "name": "account",
        "specType": "integer",
        "required": false,
        "description": "If the receipt shall directly be assigned to a payment account, you can specify its posting account number (e.g. '1200').\n\nIf specified, the account must exist as a payment account for the customer.\n'0' is not considered a valid account.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "creditor_debtor",
        "specType": "integer",
        "required": false,
        "description": "If the receipt shall directly be assigned to a creditor (for type 'invoice inbound') or debtor (for type 'invoice outbound') account, you can specify its posting account number (e.g. '70001').\n\nIf specified, creditors/debtors have to be activated for the customer, the creditor/debtor account must exist for the customer and it must be compatible with the specified receipt type.\n'0' is not considered a valid creditor/debtor.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_reference",
        "specType": "string",
        "required": false,
        "description": "The payment reference id.\n\nIf specified correctly, the uploaded receipt will match with the corresponding transaction.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_delivery",
        "specType": "string",
        "required": false,
        "description": "The delivery date in format 'YYYY-MM-DD' (e.g. '2017-04-26').\n\nNOTE: Due to the DATEV compatibility, we cannot accept a delivery date that is after the receipt date!\n\nIf specified, it will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_payment_due",
        "specType": "string",
        "required": false,
        "description": "The payment due date in format 'YYYY-MM-DD' (e.g. '2017-04-26').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "link_to_receipt_id_by_customer",
        "specType": "integer",
        "required": false,
        "description": "Has to be a valid id_by_customer of another receipt. If specified, both receipts will be assigned to a transaction if one of them is assigned manually.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "ReceiptsAdd_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/receipts/addBatch",
    "summary": "add batch receipts",
    "description": "Add multiple receipts\n\nNote: a request is allowed only every 5 seconds",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipts",
        "specType": "(schema)",
        "required": true,
        "description": "list of receipts\n\nmaximum of 50 receipts are allowed\n\nA receipt has the same fields like the /receipts/add endpoint has, same applies for error messages",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/Receipts",
        "schema": {
          "ref": "#/definitions/Receipts",
          "containerType": "array",
          "itemRef": "#/definitions/Receipt",
          "itemRequired": [
            "type",
            "counterparty",
            "invoice_number",
            "date",
            "amount",
            "currency"
          ],
          "itemFields": [
            {
              "name": "type",
              "specType": "string",
              "required": true,
              "description": "Can be 'invoice inbound' (“Eingangsrechnung”), 'invoice outbound' (“Ausgangsrechnung”), 'credit inbound' (“Eingangsgutschrift § 14 UStG”), 'credit outbound' (“Ausgangsgutschrift § 14 UStG”).",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "counterparty",
              "specType": "string",
              "required": true,
              "description": "The counterparty of the receipt, i.e. the invoicing party for type 'invoice inbound' or the recipient for type 'invoice outbound' (e.g. 'Peter Maier').",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "invoice_number",
              "specType": "string",
              "required": true,
              "description": "The invoice number (e.g. '1231XU23') with a maximum length of 60 characters - may also be an empty string.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "date",
              "specType": "string",
              "required": true,
              "description": "The receipt's issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26').",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "amount",
              "specType": "number",
              "required": true,
              "description": "The total amount of the receipt, can be negative to indicate a reversed payment (e.g. -12.30).",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "currency",
              "specType": "string",
              "required": true,
              "description": "The transaction currency.\n\nCurrently we support the following currencies: AED, AUD, BGN, BRL, CAD, CHF, CNY, COP, CYP, CZK, DKK, EUR, GBP, HKD, HRK, HUF, IDR, ILS, INR, ISK, JPY, KRW, LTL, LVL, MTL, MXN, MYR, NOK, NZD, PEN, PHP, PLN, QAR, ROL, RON, RSD, RUB, SEK, SGD, SIT, SKK, THB, TRL, TRY, UAH, USD, VND, ZAR\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid type.",
              "itemsMissing": false,
              "valuesFromText": [
                "AED",
                "AUD",
                "BGN",
                "BRL",
                "CAD",
                "CHF",
                "CNY",
                "COP",
                "CYP",
                "CZK",
                "DKK",
                "EUR",
                "GBP",
                "HKD",
                "HRK",
                "HUF",
                "IDR",
                "ILS",
                "INR",
                "ISK",
                "JPY",
                "KRW",
                "LTL",
                "LVL",
                "MTL",
                "MXN",
                "MYR",
                "NOK",
                "NZD",
                "PEN",
                "PHP",
                "PLN",
                "QAR",
                "ROL",
                "RON",
                "RSD",
                "RUB",
                "SEK",
                "SGD",
                "SIT",
                "SKK",
                "THB",
                "TRL",
                "TRY",
                "UAH",
                "USD",
                "VND",
                "ZAR"
              ],
              "specEnum": [
                "EUR"
              ]
            },
            {
              "name": "vat_rate",
              "specType": "number",
              "required": false,
              "description": "The receipt's vat rate (e.g. 19.00 or 0) - may also be an empty string to indicate a non-available or multiple vat rates.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "account",
              "specType": "integer",
              "required": false,
              "description": "If the receipt shall directly be assigned to a payment account, you can specify its posting account number (e.g. '1200').",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "creditor_debtor",
              "specType": "integer",
              "required": false,
              "description": "If the receipt shall directly be assigned to a creditor (for type 'invoice inbound') or debtor (for type 'invoice outbound') account, you can specify its posting account number (e.g. '70001').",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "payment_reference",
              "specType": "string",
              "required": false,
              "description": "The payment reference id.\n\nIf specified correctly, the added transaction will match with the corresponding receipt.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "date_delivery",
              "specType": "string",
              "required": false,
              "description": "The delivery date in format 'YYYY-MM-DD' (e.g. '2017-04-26').\n\nNOTE: Due to the DATEV compatibility, we cannot accept a delivery date that is after the receipt date!\n\nIf specified, it will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "date_payment_due",
              "specType": "string",
              "required": false,
              "description": "The payment due date in format 'YYYY-MM-DD' (e.g. '2017-04-26').",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "link_to_receipt_id_by_customer",
              "specType": "integer",
              "required": false,
              "description": "If set, both receipts will be assigned to a transaction if one of them is assigned manually.",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "ReceiptsAddBatch_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "receipts",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/receipts/upload",
    "summary": "upload receipt",
    "description": "Upload a receipt into the specified customer account. The receipt will be processed by the BuchhaltungsButler technology. The response includes the filename (without extension) of the receipt as it is stored.\n\nNote: max 10 requests per minute",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "file",
        "specType": "string",
        "required": true,
        "description": "The receipt file as real file upload or as base64 encoded string.\n\nAccepted file types are: application/pdf, text/xml, application/xml, image/jpeg, image/png, image/bmp, image/tiff",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": true,
        "description": "Can be 'invoice inbound' (“Eingangsrechnung”), 'invoice outbound' (“Ausgangsrechnung”), 'credit inbound' (“Eingangsgutschrift § 14 UStG”), 'credit outbound' (“Ausgangsgutschrift § 14 UStG”).",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "file_name",
        "specType": "string",
        "required": false,
        "description": "The name of the file.\n\nNOTE: This is required for files sent as base64 encoded string and will be ignored for files sent as real upload.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "account",
        "specType": "integer",
        "required": false,
        "description": "If the receipt shall directly be assigned to a payment account, you can specify its posting account number (e.g. '1200').\n\nIf specified, the account must exist as a payment account for the customer.\n'0' is not considered a valid account.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "creditor_debtor",
        "specType": "integer",
        "required": false,
        "description": "If the receipt shall directly be assigned to a creditor (for type 'invoice inbound') or debtor (for type 'invoice outbound') account, you can specify its posting account number (e.g. '70001').\n\nIf specified, creditors/debtors have to be activated for the customer, the creditor/debtor account must exist for the customer and it must be compatible with the specified receipt type.\n'0' is not considered a valid creditor/debtor.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "counterparty",
        "specType": "string",
        "required": false,
        "description": "The counterparty of the receipt, i.e. the invoicing party for type 'invoice inbound' or the recipient for type 'invoice outbound' (e.g. 'Peter Maier').\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid counterparty.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "invoice_number",
        "specType": "string",
        "required": false,
        "description": "The invoice number (e.g. '1231XU23') with a maximum length of 60 characters - may also be an empty string.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date",
        "specType": "string",
        "required": false,
        "description": "The receipt's issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26').\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid date.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "amount",
        "specType": "number",
        "required": false,
        "description": "The total amount of the receipt, can be negative to indicate a reversed payment (e.g. -12.30).\n\nIf specified, the field will be validated.\n'0.00' is not considered a valid receipt amount.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false,
        "format": "float"
      },
      {
        "name": "currency",
        "specType": "string",
        "required": false,
        "description": "Has to be 'EUR' if specified.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid currency.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [
          "EUR"
        ],
        "itemsMissing": false
      },
      {
        "name": "vat_rate",
        "specType": "number",
        "required": false,
        "description": "The receipt's vat rate (e.g. 19.00 or 0) - may also be an empty string to indicate a non-available or multiple vat rates.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false,
        "format": "float"
      },
      {
        "name": "payment_reference",
        "specType": "string",
        "required": false,
        "description": "The payment reference id.\n\nIf specified correctly, the uploaded receipt will match with the corresponding transaction.\n\nCurrently we support Amazon order id, PayPal transaction id and Stripe transaction id.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_delivery",
        "specType": "string",
        "required": false,
        "description": "The delivery date in format 'YYYY-MM-DD' (e.g. '2017-04-26').\n\nNOTE: Due to the DATEV compatibility, we cannot accept a delivery date that is after the receipt date!\n\nIf specified, it will be validated.\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_payment_due",
        "specType": "string",
        "required": false,
        "description": "The payment due date in format 'YYYY-MM-DD' (e.g. '2017-04-26').\n\nNOTE: This parameter will be ignored when you upload an e-invoice!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "link_to_receipt_id_by_customer",
        "specType": "integer",
        "required": false,
        "description": "Has to be a valid id_by_customer of another receipt. If specified, both receipts will be assigned to a transaction if one of them is assigned manually.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "ReceiptsUpload_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "filename",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/receipts/delete/id_by_customer",
    "summary": "delete receipt by id_by_customer",
    "description": "Mark a receipt as deleted for a specified customer account by id_by_customer. You can get the “id_by_customer” by using the “/receipts/get method” first.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "ReceiptsDeleteIdByCustomer_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/receipts/restore/id_by_customer",
    "summary": "restore deleted receipt by id_by_customer",
    "description": "Restore a marked as deleted receipt for a specified customer account by id_by_customer. You can get the “id_by_customer” by using the “/receipts/get method” first.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "ReceiptsRestoreIdByCustomer_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/receipts/assigned-transactions/get",
    "summary": "get all transactions assigned to a specific receipt",
    "description": "Get all transactions assigned to a specific receipt for a specified customer account by id_by_customer. You can get the “id_by_customer” by using the “/receipts/get method” first.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the receipt.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "confirmed_only",
        "specType": "boolean",
        "required": false,
        "description": "If true, only confirmed assignments will be returned.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      }
    ],
    "successDefinition": "ReceiptsAssignedTransactionsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "to_from",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "booking_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "value_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "purpose",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/transactions/get",
    "summary": "get transactions",
    "description": "Get transactions for a specified customer account. The response includes the number of returned rows and an array of transaction datas.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "id_by_customer_from",
        "specType": "integer",
        "required": false,
        "description": "The id_by_customer as an integer. All transactions after given value will be returned. The transaction with the given value will NOT be returned!\n\nNOTE: By specifying this, the sort changes to id_by_customer ASC, even if you use this in combination with date params.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "id_by_customer_to",
        "specType": "integer",
        "required": false,
        "description": "The id_by_customer as an integer. All transactions to given value will be returned. The transaction with the given value will NOT be returned!\n\nNOTE: By specifying this, the sort changes to id_by_customer ASC, even if you use this in combination with date params.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_from",
        "specType": "string",
        "required": false,
        "description": "The transaction's booking date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All transactions with booking date including and after given value will be returned.\n\nAn empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_to",
        "specType": "string",
        "required": false,
        "description": "The transaction's booking date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All transaction with booking date including and before given value will be returned.\n\nAn empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_since_last_modified",
        "specType": "string",
        "required": false,
        "description": "A date and time in format 'YYYY-MM-DD HH:MM:SS' (e.g. '2017-04-26 13:45:00'). If only 'YYYY-MM-DD' is specified, the time defaults to '23:59:59'. All transactions whose date_updated value is later than the specified value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "account",
        "specType": "integer",
        "required": false,
        "description": "The account number of the account the transaction is stored to.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "to_from",
        "specType": "string",
        "required": false,
        "description": "The payer/payee of the transaction.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "A limit of returned data. If no limit is given, the default will be 500.\n\nAlso the maximum limit is 500.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 500
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "The offset for paging returned data. If no offset is given, the default will be 0.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 0
      }
    ],
    "successDefinition": "TransactionsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "to_from",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "booking_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "value_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "purpose",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/transactions/get/id_by_customer",
    "summary": "get transaction by id_by_customer",
    "description": "Get a single transaction for a specified customer account by id_by_customer. You can get the “id_by_customer” by using the “/transactions/get method” first. The response includes an array of transaction data.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "TransactionsGetIdByCustomer_Success",
    "successShape": "object",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "account",
        "specType": "integer",
        "container": "data"
      },
      {
        "name": "to_from",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "booking_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "value_date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "currency",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "account_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "bank_code",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "bank_name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "purpose",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "booking_text",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/transactions/add",
    "summary": "add transaction",
    "description": "Add a transaction to a payment account of the specified customer.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "account",
        "specType": "integer",
        "required": true,
        "description": "The posting account number (e.g. '1200') of the account to which to add the transaction.\n\nThe account must exist as a payment account for the customer.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "to_from",
        "specType": "string",
        "required": true,
        "description": "The payment recipient or sender",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "amount",
        "specType": "number",
        "required": true,
        "description": "The transaction's amount (positive for incoming and negative for outgoing payments) in the account's currency.\n\n'0.00' is not considered a valid transaction amount.",
        "valuesFromText": [],
        "itemsMissing": false,
        "format": "float"
      },
      {
        "name": "booking_date",
        "specType": "string",
        "required": true,
        "description": "The transaction's booking date in format 'YYYY-MM-DD HH:II:SS' (e.g. '2017-04-26 00:00:00').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "value_date",
        "specType": "string",
        "required": false,
        "description": "The transaction's value date in format 'YYYY-MM-DD HH:II:SS' (e.g. '2017-04-26 00:00:00').\n\nIf not specified, the value date will be set to the same value as the booking date.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "account_number",
        "specType": "string",
        "required": false,
        "description": "The account number (or IBAN) of the payment recipient or sender.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid account number.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "bank_code",
        "specType": "string",
        "required": false,
        "description": "The bank code (or BIC) of the payment recipient or sender.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid bank code.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "bank_name",
        "specType": "string",
        "required": false,
        "description": "The bank name of the payment recipient or sender.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid bank name.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "purpose",
        "specType": "string",
        "required": false,
        "description": "The transaction purpose - may also be an empty string.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": false,
        "description": "The transaction type (e.g. 'Direct debit').\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid type.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "booking_text",
        "specType": "string",
        "required": false,
        "description": "The booking text - may also be an empty string.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_reference",
        "specType": "string",
        "required": false,
        "description": "The payment reference id.\n\nIf specified correctly, the added transaction will match with the corresponding receipt.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "currency",
        "specType": "string",
        "required": false,
        "description": "The transaction currency.\n\nCurrently we support the following currencies: AED, AUD, BGN, BRL, CAD, CHF, CNY, COP, CYP, CZK, DKK, EUR, GBP, HKD, HRK, HUF, IDR, ILS, INR, ISK, JPY, KRW, LTL, LVL, MTL, MXN, MYR, NOK, NZD, PEN, PHP, PLN, QAR, ROL, RON, RUB, SEK, SGD, SIT, SKK, THB, TRL, TRY, UAH, USD, VND, ZAR\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid type.",
        "valuesFromText": [
          "AED",
          "AUD",
          "BGN",
          "BRL",
          "CAD",
          "CHF",
          "CNY",
          "COP",
          "CYP",
          "CZK",
          "DKK",
          "EUR",
          "GBP",
          "HKD",
          "HRK",
          "HUF",
          "IDR",
          "ILS",
          "INR",
          "ISK",
          "JPY",
          "KRW",
          "LTL",
          "LVL",
          "MTL",
          "MXN",
          "MYR",
          "NOK",
          "NZD",
          "PEN",
          "PHP",
          "PLN",
          "QAR",
          "ROL",
          "RON",
          "RUB",
          "SEK",
          "SGD",
          "SIT",
          "SKK",
          "THB",
          "TRL",
          "TRY",
          "UAH",
          "USD",
          "VND",
          "ZAR"
        ],
        "itemsMissing": false
      }
    ],
    "successDefinition": "TransactionsAdd_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/transactions/addBatch",
    "summary": "add batch transaction",
    "description": "Add multiple transactions\n\nNote: a request is allowed only every 5 seconds",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transactions",
        "specType": "(schema)",
        "required": true,
        "description": "list of transactions\n\nmaximum of 50 transactions are allowed\n\nA transaction has the same fields like the /transactions/add endpoint has, same applies for error messages",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/Transactions",
        "schema": {
          "ref": "#/definitions/Transactions",
          "containerType": "array",
          "itemRef": "#/definitions/Transaction",
          "itemRequired": [
            "account",
            "to_from",
            "amount",
            "booking_date"
          ],
          "itemFields": [
            {
              "name": "account",
              "specType": "integer",
              "required": true,
              "description": "The posting account number (e.g. '1200') of the account to which to add the transaction.\n\nThe account must exist as a payment account for the customer.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "to_from",
              "specType": "string",
              "required": true,
              "description": "The payment recipient or sender",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "amount",
              "specType": "number",
              "required": true,
              "description": "The transaction's amount (positive for incoming and negative for outgoing payments) in the account's currency.\n\n'0.00' is not considered a valid transaction amount.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "booking_date",
              "specType": "string",
              "required": true,
              "description": "The transaction's booking date in format 'YYYY-MM-DD HH:II:SS' (e.g. '2017-04-26 00:00:00').",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "value_date",
              "specType": "string",
              "required": false,
              "description": "The transaction's value date in format 'YYYY-MM-DD HH:II:SS' (e.g. '2017-04-26 00:00:00').\n\nIf not specified, the value date will be set to the same value as the booking date.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid date.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "account_number",
              "specType": "string",
              "required": false,
              "description": "The account number (or IBAN) of the payment recipient or sender.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid account number.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "bank_code",
              "specType": "string",
              "required": false,
              "description": "The bank code (or BIC) of the payment recipient or sender.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid bank code.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "bank_name",
              "specType": "string",
              "required": false,
              "description": "The bank name of the payment recipient or sender.\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid bank name.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "purpose",
              "specType": "string",
              "required": false,
              "description": "The transaction purpose - may also be an empty string.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "type",
              "specType": "string",
              "required": false,
              "description": "The transaction type (e.g. 'Direct debit').\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid type.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "booking_text",
              "specType": "string",
              "required": false,
              "description": "The booking text - may also be an empty string.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "payment_reference",
              "specType": "string",
              "required": false,
              "description": "The payment reference id.\n\nIf specified correctly, the added transaction will match with the corresponding receipt.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "currency",
              "specType": "string",
              "required": false,
              "description": "The transaction currency.\n\nCurrently we support the following currencies: AED, AUD, BGN, BRL, CAD, CHF, CNY, COP, CYP, CZK, DKK, EUR, GBP, HKD, HRK, HUF, IDR, ILS, INR, ISK, JPY, KRW, LTL, LVL, MTL, MXN, MYR, NOK, NZD, PEN, PHP, PLN, QAR, ROL, RON, RSD, RUB, SEK, SGD, SIT, SKK, THB, TRL, TRY, UAH, USD, VND, ZAR\n\nIf specified, the field will be validated.\nAn empty string is not considered a valid type.",
              "itemsMissing": false,
              "valuesFromText": [
                "AED",
                "AUD",
                "BGN",
                "BRL",
                "CAD",
                "CHF",
                "CNY",
                "COP",
                "CYP",
                "CZK",
                "DKK",
                "EUR",
                "GBP",
                "HKD",
                "HRK",
                "HUF",
                "IDR",
                "ILS",
                "INR",
                "ISK",
                "JPY",
                "KRW",
                "LTL",
                "LVL",
                "MTL",
                "MXN",
                "MYR",
                "NOK",
                "NZD",
                "PEN",
                "PHP",
                "PLN",
                "QAR",
                "ROL",
                "RON",
                "RSD",
                "RUB",
                "SEK",
                "SGD",
                "SIT",
                "SKK",
                "THB",
                "TRL",
                "TRY",
                "UAH",
                "USD",
                "VND",
                "ZAR"
              ],
              "specEnum": [
                "EUR"
              ]
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "TransactionsAddBatch_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "transactions",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/transactions/assign/receipt",
    "summary": "assign receipt to transaction",
    "description": "Assign a receipt to a transaction.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the transaction.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the receipt.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "TransactionsAssignReceipt_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/transactions/unassign/receipt",
    "summary": "unassign a specific receipt from a transaction",
    "description": "Unassign a specific receipt from a transaction.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the transaction.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the receipt to unassign.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "TransactionsUnassignReceipt_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/transactions/assign-batch/receipt",
    "summary": "assign multiple receipts to transactions",
    "description": "Assign multiple receipts to transactions.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transactions_to_receipts",
        "specType": "(schema)",
        "required": true,
        "description": "list of receipts to transactions\n\nmaximum of 50 element are allowed",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/TransactionsToReceipts",
        "schema": {
          "ref": "#/definitions/TransactionsToReceipts",
          "containerType": "array",
          "itemRef": "#/definitions/TransactionToReceipt",
          "itemRequired": [
            "receipt_id_by_customer",
            "transaction_id_by_customer"
          ],
          "itemFields": [
            {
              "name": "receipt_id_by_customer",
              "specType": "integer",
              "required": true,
              "description": "id_by_customer of the receipt.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "transaction_id_by_customer",
              "specType": "integer",
              "required": true,
              "description": "id_by_customer of the transaction.",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "TransactionsAssignBatchReceipt_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "transactions_to_receipts",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/transactions/assigned-receipts/get",
    "summary": "get all receipts assigned to a specific transaction",
    "description": "Get all receipts assigned to a specific transaction for a specified customer account by id_by_customer. You can get the “id_by_customer” by using the “/transactions/get method” first.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the transaction.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "confirmed_only",
        "specType": "boolean",
        "required": false,
        "description": "If true, only confirmed assignments will be returned.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      }
    ],
    "successDefinition": "TransactionsAssignedReceiptsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "filename",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/invoices/create",
    "summary": "create invoice",
    "description": "Add an invoice for the specified customer.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": true,
        "description": "Can be either 'invoice' (“Rechnung”), 'credit' (“Gutschrift”) or 'offer' (“Angebot”).",
        "valuesFromText": [
          "invoice",
          "credit",
          "offer"
        ],
        "itemsMissing": false
      },
      {
        "name": "show_prices_type",
        "specType": "string",
        "required": true,
        "description": "Can be either 'net' (“Netto”) or 'gross' (“Brutto”).",
        "valuesFromText": [
          "net",
          "gross"
        ],
        "itemsMissing": false
      },
      {
        "name": "company_name",
        "specType": "string",
        "required": true,
        "description": "The company name of the recipient.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date",
        "specType": "string",
        "required": true,
        "description": "The date of the invoice.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "item_name",
        "specType": "array",
        "required": true,
        "description": "An array of invoice items.\n\nUsage:\n\"item_name\" : ['Item 1', 'Item 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_amount",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item amounts.\n\nUsage:\n\"item_amount\" : ['10', '20']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_unit",
        "specType": "array",
        "required": true,
        "description": "An array of invoice items units.\n\nUsage:\n\"item_unit\" : ['Std.', 'Stk.']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_vat",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item vats.\n\nUsage:\n\"item_vat\" : ['7', '19']\n\nValid vat rates are floating point numbers between 0 and 100.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_single_price",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item single_prices.\n\nUsage:\n\"item_single_price\" : ['20', '19.99']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The name of the contact person of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": false,
        "description": "The street of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "required": false,
        "description": "The additional address information of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": false,
        "description": "The zip of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": false,
        "description": "The city of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": false,
        "description": "The country of the recipient company.\n\nIf specified, the field will be validated. Valid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": false,
        "description": "The email for sending the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "recurring_interval",
        "specType": "string",
        "required": false,
        "description": "An interval for recurring invoices. Can be either 'weekly', 'monthly', 'quarterly' or 'yearly'.\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "weekly",
          "monthly",
          "quarterly",
          "yearly"
        ],
        "itemsMissing": false
      },
      {
        "name": "recurring_date_next",
        "specType": "string",
        "required": false,
        "description": "The next date of a recurring invoice.\n\nIMPORTANT:\nThe field is required, if “recurring_interval” is specified.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_of_supply",
        "specType": "string",
        "required": false,
        "description": "Date or period of service/delivery.\n\nNOTE: The date_of_supply will be displayed on the PDF, but when the date AND the date_of_supply is specified in the format \"YYYY-MM-DD\", the date_of_supply will also be taken over as date_delivery of the receipt in the 'Belege' or 'Belege/Buchen' view.\n\nIMPORTANT: Due to the DATEV compatibility, we cannot accept a date_of_supply that is after the invoice date. In that case it will be ignored!",
        "valuesFromText": [
          "YYYY-MM-DD",
          "Belege",
          "Belege/Buchen"
        ],
        "itemsMissing": false
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "required": false,
        "description": "The invoicenumber for the invoice. If not specified, the default BHB number will be created.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "correspondence",
        "specType": "string",
        "required": false,
        "description": "The optional correspondence to the invoice recipient.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "discount_type",
        "specType": "string",
        "required": false,
        "description": "The type of the discount. Can be either 'percent' or 'EUR'.\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "percent",
          "EUR"
        ],
        "itemsMissing": false
      },
      {
        "name": "discount_value",
        "specType": "string",
        "required": false,
        "description": "The value of granted discount.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_conditions",
        "specType": "string",
        "required": false,
        "description": "The payment conditions of the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "due_days",
        "specType": "string",
        "required": false,
        "description": "The number of days between the invoice date and the due date.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "final_provisions",
        "specType": "string",
        "required": false,
        "description": "The final comment of the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "show_bankdata",
        "specType": "boolean",
        "required": false,
        "description": "Show the the bank data on the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "show_contactdata",
        "specType": "boolean",
        "required": false,
        "description": "Show the contact data on the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "item_description",
        "specType": "array",
        "required": false,
        "description": "An array of invoice item description.\n\nUsage:\n\"item_description\" : ['Description Item 1', 'Description Item 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "customer_number",
        "specType": "string",
        "required": false,
        "description": "The customer number of the recipient.\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_reference",
        "specType": "string",
        "required": false,
        "description": "The payment reference id.\n\nIf specified correctly, the resulting receipt of the created invoice will match with the corresponding transaction.\n\nNOTE: Currently we support Amazon order id, PayPal transaction id and Stripe transaction id!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "language",
        "specType": "string",
        "required": false,
        "description": "The language for translatable invoice labels (e.g. headings, table headers, payment terms). Can be either 'de_DE' (“Deutsch”, default) or 'en_US' (“English”).\n\nIf omitted, German is used.",
        "valuesFromText": [
          "de_DE",
          "en_US"
        ],
        "itemsMissing": false,
        "default": "de_DE"
      }
    ],
    "successDefinition": "InvoicesCreate_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "file_name",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/invoices/create/e-invoice",
    "summary": "create e-invoice",
    "description": "Add an e-invoice for the specified customer.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": true,
        "description": "Can be either 'invoice' (“Rechnung”), 'credit' (“Gutschrift”) or 'offer' (“Angebot”).",
        "valuesFromText": [
          "invoice",
          "credit",
          "offer"
        ],
        "itemsMissing": false
      },
      {
        "name": "show_prices_type",
        "specType": "string",
        "required": true,
        "description": "Can be either 'net' (“Netto”) or 'gross' (“Brutto”).",
        "valuesFromText": [
          "net",
          "gross"
        ],
        "itemsMissing": false
      },
      {
        "name": "company_name",
        "specType": "string",
        "required": true,
        "description": "The company name of the recipient.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date",
        "specType": "string",
        "required": true,
        "description": "The date of the invoice.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "item_name",
        "specType": "array",
        "required": true,
        "description": "An array of invoice items.\n\nUsage:\n\"item_name\" : ['Item 1', 'Item 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_amount",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item amounts.\n\nUsage:\n\"item_amount\" : ['10', '20']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_unit",
        "specType": "array",
        "required": true,
        "description": "An array of invoice items units.\n\nUsage:\n\"item_unit\" : ['Std.', 'Stk.']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_tax_type",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item tax types.\n\nUsage:\n\"item_vat\" : ['S', 'E']\n\nValid tax types are the following:\nS - VAT (standard rate)\nZ - 0% VAT\nAE - Reverse Charge (§13b)\nK - EU Supply (Intra-community supply)\nG - Third Country Supply (Export)\nE - VAT Exempt Supply & Services",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_tax_amount",
        "specType": "array",
        "required": true,
        "description": "Only required if corresponding item_tax_type = 'S' (VAT).\nAn array of invoice item vats.\n\nUsage:\n\"item_tax_amount\" : ['7', '19']\n\nValid vat rates are floating point numbers between 0 and 100.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_single_price",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item single_prices.\n\nUsage:\n\"item_single_price\" : ['20', '19.99']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "e_invoice_id",
        "specType": "string",
        "required": true,
        "description": "Buyer reference (default: 0). If you do not have a reference, please enter \"0\". A valid is mandatory for e-invoices to public contracting authorities and is provided by the recipient.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The name of the contact person of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": true,
        "description": "The street of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "required": false,
        "description": "The additional address information of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": true,
        "description": "The zip of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": true,
        "description": "The city of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": true,
        "description": "The country of the recipient company.\n\nIf specified, the field will be validated. Valid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": true,
        "description": "The email for sending the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "recurring_interval",
        "specType": "string",
        "required": false,
        "description": "An interval for recurring invoices. Can be either 'weekly', 'monthly', 'quarterly' or 'yearly'.\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "weekly",
          "monthly",
          "quarterly",
          "yearly"
        ],
        "itemsMissing": false
      },
      {
        "name": "recurring_date_next",
        "specType": "string",
        "required": false,
        "description": "The next date of a recurring invoice.\n\nIMPORTANT:\nThe field is required, if “recurring_interval” is specified.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_of_supply",
        "specType": "string",
        "required": false,
        "description": "Date or period of service/delivery.\n\nNOTE: The date_of_supply will be displayed on the PDF, but when the date AND the date_of_supply is specified in the format \"YYYY-MM-DD\", the date_of_supply will also be taken over as date_delivery of the receipt in the 'Belege' or 'Belege/Buchen' view.\n\nIMPORTANT: Due to the DATEV compatibility, we cannot accept a date_of_supply that is after the invoice date. In that case it will be ignored!",
        "valuesFromText": [
          "YYYY-MM-DD",
          "Belege",
          "Belege/Buchen"
        ],
        "itemsMissing": false
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "required": false,
        "description": "The invoicenumber for the invoice. If not specified, the default BHB number will be created.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "correspondence",
        "specType": "string",
        "required": false,
        "description": "The optional correspondence to the invoice recipient.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "discount_type",
        "specType": "string",
        "required": false,
        "description": "The type of the discount. Can be either 'percent' or 'EUR'.\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "percent",
          "EUR"
        ],
        "itemsMissing": false
      },
      {
        "name": "discount_value",
        "specType": "string",
        "required": false,
        "description": "The value of granted discount.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_conditions",
        "specType": "string",
        "required": false,
        "description": "The payment conditions of the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "due_days",
        "specType": "string",
        "required": false,
        "description": "The number of days between the invoice date and the due date.\n\nIf not specified due date will be set to invoice date (due_days = 0).",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "0"
      },
      {
        "name": "final_provisions",
        "specType": "string",
        "required": false,
        "description": "The final comment of the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "show_bankdata",
        "specType": "boolean",
        "required": false,
        "description": "Show the the bank data on the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "show_contactdata",
        "specType": "boolean",
        "required": false,
        "description": "Show the contact data on the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "item_description",
        "specType": "array",
        "required": false,
        "description": "An array of invoice item description.\n\nUsage:\n\"item_description\" : ['Description Item 1', 'Description Item 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "customer_number",
        "specType": "string",
        "required": false,
        "description": "The customer number of the recipient.\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_reference",
        "specType": "string",
        "required": false,
        "description": "The payment reference id.\n\nIf specified correctly, the resulting receipt of the created invoice will match with the corresponding transaction.\n\nNOTE: Currently we support Amazon order id, PayPal transaction id and Stripe transaction id!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "language",
        "specType": "string",
        "required": false,
        "description": "The language for translatable invoice labels (e.g. headings, table headers, payment terms). Can be either 'de_DE' (“Deutsch”, default) or 'en_US' (“English”).\n\nIf omitted, German is used.",
        "valuesFromText": [
          "de_DE",
          "en_US"
        ],
        "itemsMissing": false,
        "default": "de_DE"
      }
    ],
    "successDefinition": "InvoicesCreateEInvoice_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "invoicenumber",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "file_name",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/invoices/create/draft",
    "summary": "create invoice draft",
    "description": "Add an invoice draft for the specified customer.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": true,
        "description": "Can be either 'invoice' (“Rechnung”), 'credit' (“Gutschrift”) or 'offer' (“Angebot”).",
        "valuesFromText": [
          "invoice",
          "credit",
          "offer"
        ],
        "itemsMissing": false
      },
      {
        "name": "show_prices_type",
        "specType": "string",
        "required": true,
        "description": "Can be either 'net' (“Netto”) or 'gross' (“Brutto”).",
        "valuesFromText": [
          "net",
          "gross"
        ],
        "itemsMissing": false
      },
      {
        "name": "company_name",
        "specType": "string",
        "required": true,
        "description": "The company name of the recipient.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date",
        "specType": "string",
        "required": true,
        "description": "The date of the invoice.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "item_name",
        "specType": "array",
        "required": true,
        "description": "An array of invoice items.\n\nUsage:\n\"item_name\" : ['Item 1', 'Item 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_amount",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item amounts.\n\nUsage:\n\"item_amount\" : ['10', '20']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_unit",
        "specType": "array",
        "required": true,
        "description": "An array of invoice items units.\n\nUsage:\n\"item_unit\" : ['Std.', 'Stk.']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_vat",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item vats.\n\nUsage:\n\"item_vat\" : ['7', '19']\n\nValid vat rates are floating point numbers between 0 and 100.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "item_single_price",
        "specType": "array",
        "required": true,
        "description": "An array of invoice item single_prices.\n\nUsage:\n\"item_single_price\" : ['20', '19.99']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The name of the contact person of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": false,
        "description": "The street of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "required": false,
        "description": "The additional address information of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": false,
        "description": "The zip of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": false,
        "description": "The city of the recipient company.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": false,
        "description": "The country of the recipient company.\n\nIf specified, the field will be validated. Valid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": false,
        "description": "The email for sending the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "recurring_interval",
        "specType": "string",
        "required": false,
        "description": "An interval for recurring invoices. Can be either 'weekly', 'monthly', 'quarterly' or 'yearly'.\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "weekly",
          "monthly",
          "quarterly",
          "yearly"
        ],
        "itemsMissing": false
      },
      {
        "name": "recurring_date_next",
        "specType": "string",
        "required": false,
        "description": "The next date of a recurring invoice.\n\nIMPORTANT:\nThe field is required, if “recurring_interval” is specified.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_of_supply",
        "specType": "string",
        "required": false,
        "description": "Date or period of service/delivery.\n\nNOTE: The date_of_supply will be displayed on the PDF, but when the date AND the date_of_supply is specified in the format \"YYYY-MM-DD\", the date_of_supply will also be taken over as date_delivery of the receipt in the 'Belege' or 'Belege/Buchen' view.\n\nIMPORTANT: Due to the DATEV compatibility, we cannot accept a date_of_supply that is after the invoice date. In that case it will be ignored!",
        "valuesFromText": [
          "YYYY-MM-DD",
          "Belege",
          "Belege/Buchen"
        ],
        "itemsMissing": false
      },
      {
        "name": "correspondence",
        "specType": "string",
        "required": false,
        "description": "The optional correspondence to the invoice recipient.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "discount_type",
        "specType": "string",
        "required": false,
        "description": "The type of the discount. Can be either 'percent' or 'EUR'.\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "percent",
          "EUR"
        ],
        "itemsMissing": false
      },
      {
        "name": "discount_value",
        "specType": "string",
        "required": false,
        "description": "The value of granted discount.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "payment_conditions",
        "specType": "string",
        "required": false,
        "description": "The payment conditions of the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "final_provisions",
        "specType": "string",
        "required": false,
        "description": "The final comment of the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "show_bankdata",
        "specType": "boolean",
        "required": false,
        "description": "Show the the bank data on the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "show_contactdata",
        "specType": "boolean",
        "required": false,
        "description": "Show the contact data on the invoice.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "item_description",
        "specType": "array",
        "required": false,
        "description": "An array of invoice item description.\n\nUsage:\n\"item_description\" : ['Description Item 1', 'Description Item 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "customer_number",
        "specType": "string",
        "required": false,
        "description": "The customer number of the recipient.\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "language",
        "specType": "string",
        "required": false,
        "description": "The language for translatable invoice labels (e.g. headings, table headers, payment terms). Can be either 'de_DE' (“Deutsch”, default) or 'en_US' (“English”).\n\nIf omitted, German is used.",
        "valuesFromText": [
          "de_DE",
          "en_US"
        ],
        "itemsMissing": false,
        "default": "de_DE"
      }
    ],
    "successDefinition": "InvoicesCreateDraft_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/get",
    "summary": "get postings",
    "description": "Get postings for a specified customer account. The response includes the number of returned rows and an array of postings data. NOTE: Each request is limited to 1000 postings!",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_from",
        "specType": "string",
        "required": true,
        "description": "The postings issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All postings with issuing date including and after given value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_to",
        "specType": "string",
        "required": true,
        "description": "The postings issuing date in format 'YYYY-MM-DD' (e.g. '2017-04-26'). All postings with issuing date including and before given value will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_last_action_from",
        "specType": "string",
        "required": false,
        "description": "A date in format 'YYYY-MM-DD'. All postings that were created or modified in status (confirmed, fixed) on or after this date will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_last_action_to",
        "specType": "string",
        "required": false,
        "description": "A date in format 'YYYY-MM-DD'. All postings that were created or modified in status (confirmed, fixed) on or before this date will be returned.\n\nIf specified, the field will be validated. An empty string is not considered a valid date.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "account",
        "specType": "string",
        "required": false,
        "description": "A comma separated list of accounts.\n\nUse the following options: all, all financial accounts, free booking and any of your available accounts as numeric value.\nThe default is \"all\"",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount",
        "specType": "string",
        "required": false,
        "description": "A comma separated list of postingaccounts.\n\nUse the following options: all, all postingaccounts, all debtors, all creditors and any of your available postingaccounts as numeric value.\nThe default is \"all\"",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "posting_status",
        "specType": "string",
        "required": false,
        "description": "Set the status of the posting.\n\nYou have the following options: all, fixed, unfixed\n\nThe default is \"all\"",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "cost_location",
        "specType": "string",
        "required": false,
        "description": "Set a specific cost location code. If specified, only postings to this cost location are returned",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "order",
        "specType": "string",
        "required": false,
        "description": "Possible values are\n\"default\",\n\"date ASC\",\n\"date DESC\",\n\"date_last_action ASC\",\n\"date_last_action DESC\",\n\"id_by_customer ASC\",\n\"id_by_customer DESC\".\n\nThe default order is ascending by date as first and date_last_action as second criterion.\n\nPlease not that the validation of the specified value is case sensitive!",
        "valuesFromText": [
          "default",
          "date ASC",
          "date DESC",
          "date_last_action ASC",
          "date_last_action DESC",
          "id_by_customer ASC",
          "id_by_customer DESC"
        ],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "Set a limit of returned postings. NOTE: the maximum limit is 1000!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "Set an offset for the returned postings.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date_delivery",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "date_vat_effective",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingtext",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "currency",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "vat",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "credit_type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "debit_postingaccount_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "credit_postingaccount_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "tax_key",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "booking_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "cost_location",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "cost_location_two",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "circumstances_ll",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "transaction_amount",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "transaction_purpose",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_ids_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_types",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_invoice_numbers",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_counterparties",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_vat_rates",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_amounts",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_dates",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipts_assigned_links",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "fixed",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "comment",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/postings/add/receipt",
    "summary": "add receipt posting",
    "description": "Add postings for a specified receipt. Important: Receipt postings are only available if creditor or debtor posting is activated!\n\nIMPORTANT:\nIf you add postings to a receipt with foreign currency, you have to get that receipt (/receipts/get/id_by_customer) and find the calculated amount before performing this request.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the receipt.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccounts",
        "specType": "array",
        "required": true,
        "description": "An array of postingaccount numbers.\n\nUsage:\n\"postingaccounts\" : ['number of posting 1', 'number of posting 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "postingtexts",
        "specType": "array",
        "required": true,
        "description": "An array of posting texts.\n\nUsage:\n\"postingtexts\" : ['text of posting 1', 'text of posting 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "vats",
        "specType": "array",
        "required": true,
        "description": "An array of vats.\n\nUsage:\n\"vats\" : ['vat of posting 1', 'vat of posting 2'].\n\nPossible vats:\n- 0_none ('keine Ust.')\n- 19_vat ('19% Ust.')\n- 7_vat ('7% Ust.')\n- 19_pre ('19% Vst.')\n- 7_pre ('7% Vst.')\n- 19_both_1 ('§13b 19% USt./VSt.')\n- 19_both_506 ('§13b 19% USt./VSt. (EU §13b Abs. 1)')\n- 19_both_6506 ('§13b 19% USt. (EU §13b Abs. 1, ohne VSt.)')\n- 19_both_511 ('§13b 19% USt./VSt. (Drittland §13b Abs. 2 Nr. 1)')\n- 19_both_6511 ('§13b 19% USt. (Drittland §13b Abs. 2 Nr. 1, ohne VSt.)')\n- 19_both_6501 ('§13b 19/16% USt. (ohne VSt.)')\n- 19_both_2 ('I.g.E. 19% USt./VSt.')\n- 7_both ('I.g.E. 7% USt./VSt.')\n- 19_both_1_no_pre ('§13b 19/16% USt.')\n- 19_both_2_no_pre ('i.g.E. 19/16% USt.')\n- 7_both_no_pre ('i.g.E. 7/5% USt.')\n- 19_pre_app ('19/16% Aufz. VSt.')\n- 7_pre_app ('7/5% Aufz. VSt.')\n- 19_both_app_1 ('§13b 19/16% USt./Aufz. VSt.')\n- 19_both_app_506 ('§13b 19/16% USt./Aufz. VSt. (EU §13b Abs. 1)')\n- 19_both_app_511 ('§13b 19/16% USt./Aufz. VSt. (Drittland §13b Abs. 2 Nr. 1)')\n- 19_both_app_2 ('i.g.E. 19/16% USt./Aufz. VSt.')\n- 7_both_app ('i.g.E. 7/5% USt./Aufz. VSt.')",
        "valuesFromText": [
          "0_none",
          "19_vat",
          "7_vat",
          "19_pre",
          "7_pre",
          "19_both_1",
          "19_both_506",
          "19_both_6506",
          "19_both_511",
          "19_both_6511",
          "19_both_6501",
          "19_both_2",
          "7_both",
          "19_both_1_no_pre",
          "19_both_2_no_pre",
          "7_both_no_pre",
          "19_pre_app",
          "7_pre_app",
          "19_both_app_1",
          "19_both_app_506",
          "19_both_app_511",
          "19_both_app_2",
          "7_both_app"
        ],
        "itemsMissing": true
      },
      {
        "name": "cost_locations",
        "specType": "array",
        "required": false,
        "description": "An array of cost_locations.\n\nUsage:\n\"cost_locations\" : ['cost_location of posting 1', 'cost_location of posting 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "cost_locations_two",
        "specType": "array",
        "required": false,
        "description": "An array of cost_locations_two.\n\nUsage:\n\"cost_locations_two\" : ['cost_location_two of posting 1', 'cost_location_two of posting 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "amounts",
        "specType": "array",
        "required": true,
        "description": "An array of amounts.\n\nUsage:\n\"amounts\" : ['amount of posting 1', 'amount of posting 2']\n\nAmount must be in format 0000.00",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "creditor",
        "specType": "integer",
        "required": true,
        "description": "The number of the creditor.\n\nIMPORTANT: The field is only required, if you are posting to an incoming invoice and if creditor posting is activated.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "debtor",
        "specType": "integer",
        "required": true,
        "description": "The number of the debtor.\n\nIMPORTANT: The field is only required, if you are posting to an outgoing invoice and if debtor posting is activated.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsAddReceipt_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/add-batch/receipts",
    "summary": "add multiple receipt postings",
    "description": "Add postings for specified receipts. Important: Receipt postings are only available if creditor or debtor posting is activated!\n\nIMPORTANT:\nIf you add postings to a receipt with foreign currency, you have to get that receipt (/receipts/get/id_by_customer) and find the calculated amount before performing this request.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipts",
        "specType": "(schema)",
        "required": true,
        "description": "an array of receipt postings, each receipt posting has the same field declaration and validation as the postings/add/receipt endpoint",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/ReceiptsPostings",
        "schema": {
          "ref": "#/definitions/ReceiptsPostings",
          "containerType": "array",
          "itemRef": "#/definitions/ReceiptPostings",
          "itemRequired": [
            "receipt_id_by_customer",
            "postingaccounts",
            "vats",
            "amounts",
            "creditor",
            "debtor"
          ],
          "itemFields": [
            {
              "name": "receipt_id_by_customer",
              "specType": "integer",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingaccounts",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingstexts",
              "specType": "array",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "vats",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "cost_locations",
              "specType": "array",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "cost_locations_two",
              "specType": "array",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "amounts",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "creditor",
              "specType": "integer",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "debtor",
              "specType": "integer",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "PostingsAddBatchReceipts_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "receipts",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/add/transaction",
    "summary": "add transaction posting",
    "description": "Add postings for a specified transaction.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the transaction.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccounts",
        "specType": "array",
        "required": true,
        "description": "An array of postingaccount numbers.\n\nUsage:\n\"postingaccounts\" : ['number of posting 1', 'number of posting 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "postingtexts",
        "specType": "array",
        "required": true,
        "description": "An array of posting texts.\n\nUsage:\n\"postingtexts\" : ['text of posting 1', 'text of posting 2']",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "vats",
        "specType": "array",
        "required": true,
        "description": "An array of vats.\n\nUsage:\n\"vats\" : ['vat of posting 1', 'vat of posting 2'].\n\nPossible vats:\n- 0_none ('keine Ust.')\n- 19_vat ('19% Ust.')\n- 7_vat ('7% Ust.')\n- 19_pre ('19% Vst.')\n- 7_pre ('7% Vst.')\n- 19_both_1 ('§13b 19% USt./VSt.')\n- 19_both_506 ('§13b 19% USt./VSt. (EU §13b Abs. 1)')\n- 19_both_6506 ('§13b 19% USt. (EU §13b Abs. 1, ohne VSt.)')\n- 19_both_511 ('§13b 19% USt./VSt. (Drittland §13b Abs. 2 Nr. 1)')\n- 19_both_6511 ('§13b 19% USt. (Drittland §13b Abs. 2 Nr. 1, ohne VSt.)')\n- 19_both_6501 ('§13b 19/16% USt. (ohne VSt.)')\n- 19_both_2 ('I.g.E. 19% USt./VSt.')\n- 7_both ('I.g.E. 7% USt./VSt.')\n- 19_both_1_no_pre ('§13b 19/16% USt.')\n- 19_both_2_no_pre ('i.g.E. 19/16% USt.')\n- 7_both_no_pre ('i.g.E. 7/5% USt.')\n- 19_pre_app ('19/16% Aufz. VSt.')\n- 7_pre_app ('7/5% Aufz. VSt.')\n- 19_both_app_1 ('§13b 19/16% USt./Aufz. VSt.')\n- 19_both_app_506 ('§13b 19/16% USt./Aufz. VSt. (EU §13b Abs. 1)')\n- 19_both_app_511 ('§13b 19/16% USt./Aufz. VSt. (Drittland §13b Abs. 2 Nr. 1)')\n- 19_both_app_2 ('i.g.E. 19/16% USt./Aufz. VSt.')\n- 7_both_app ('i.g.E. 7/5% USt./Aufz. VSt.')",
        "valuesFromText": [
          "0_none",
          "19_vat",
          "7_vat",
          "19_pre",
          "7_pre",
          "19_both_1",
          "19_both_506",
          "19_both_6506",
          "19_both_511",
          "19_both_6511",
          "19_both_6501",
          "19_both_2",
          "7_both",
          "19_both_1_no_pre",
          "19_both_2_no_pre",
          "7_both_no_pre",
          "19_pre_app",
          "7_pre_app",
          "19_both_app_1",
          "19_both_app_506",
          "19_both_app_511",
          "19_both_app_2",
          "7_both_app"
        ],
        "itemsMissing": true
      },
      {
        "name": "cost_locations",
        "specType": "array",
        "required": false,
        "description": "An array of cost_locations.\n\nUsage:\n\"cost_locations\" : ['cost_location of posting 1', 'cost_location of posting 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "cost_locations_two",
        "specType": "array",
        "required": false,
        "description": "An array of cost_locations_two.\n\nUsage:\n\"cost_locations_two\" : ['cost_location_two of posting 1', 'cost_location_two of posting 2'].\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "amounts",
        "specType": "array",
        "required": true,
        "description": "An array of amounts.\n\nUsage:\n\"amounts\" : ['amount of posting 1', 'amount of posting 2']\n\nAmount must be in format 0000.00",
        "valuesFromText": [],
        "itemsMissing": true
      },
      {
        "name": "oi_receipts_ids_by_customer",
        "specType": "array",
        "required": true,
        "description": "An array of \"open item\" receipts ids_by_customer .\n\nUsage:\n\"oi_receipts_ids_by_customer\" : ['id_by_customer of the receipt for posting 1', null ]\n\nThe receipts specified will be assigned directly to the respective postings. A null value within the array means explicitly assigning no receipt to the partial posting in that position.\n\nIMPORTANT: The field is only required, if OI postings are activated in customers account.",
        "valuesFromText": [],
        "itemsMissing": true
      }
    ],
    "successDefinition": "PostingsAddTransaction_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/add-batch/transactions",
    "summary": "add multiple transaction postings",
    "description": "Add posting for specified transactions.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transactions",
        "specType": "(schema)",
        "required": true,
        "description": "an array of transaction postings, each transaction posting has the same field declaration and validation as the postings/add/transaction endpoint",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/TransactionsPostings",
        "schema": {
          "ref": "#/definitions/TransactionsPostings",
          "containerType": "array",
          "itemRef": "#/definitions/TransactionPostings",
          "itemRequired": [
            "transaction_id_by_customer",
            "postingaccounts",
            "postingtexts",
            "vats",
            "amounts",
            "oi_receipts_ids_by_customer"
          ],
          "itemFields": [
            {
              "name": "transaction_id_by_customer",
              "specType": "integer",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingaccounts",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingtexts",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "vats",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "cost_locations",
              "specType": "array",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "cost_locations_two",
              "specType": "array",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "amounts",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "oi_receipts_ids_by_customer",
              "specType": "array",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "PostingsAddBatchTransactions_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "transactions",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/add/free",
    "summary": "add free posting",
    "description": "Add a free posting.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date",
        "specType": "string",
        "required": true,
        "description": "The date of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingtext",
        "specType": "string",
        "required": true,
        "description": "The description of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "amount",
        "specType": "string",
        "required": true,
        "description": "The amount of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_debit",
        "specType": "integer",
        "required": true,
        "description": "The debit account number of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_credit",
        "specType": "integer",
        "required": true,
        "description": "The credit account number of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "vat",
        "specType": "string",
        "required": true,
        "description": "The vat rate of the posting.\n\nPossible vats:\n- 0_none ('keine Ust.')\n- 19_vat ('19% Ust.')\n- 7_vat ('7% Ust.')\n- 19_pre ('19% Vst.')\n- 7_pre ('7% Vst.')\n- 19_both_1 ('§13b 19% USt./VSt.')\n- 19_both_506 ('§13b 19% USt./VSt. (EU §13b Abs. 1)')\n- 19_both_6506 ('§13b 19% USt. (EU §13b Abs. 1, ohne VSt.)')\n- 19_both_511 ('§13b 19% USt./VSt. (Drittland §13b Abs. 2 Nr. 1)')\n- 19_both_6511 ('§13b 19% USt. (Drittland §13b Abs. 2 Nr. 1, ohne VSt.)')\n- 19_both_6501 ('§13b 19/16% USt. (ohne VSt.)')\n- 19_both_2 ('I.g.E. 19% USt./VSt.')\n- 7_both ('I.g.E. 7% USt./VSt.')\n- 19_both_1_no_pre ('§13b 19/16% USt.')\n- 19_both_2_no_pre ('i.g.E. 19/16% USt.')\n- 7_both_no_pre ('i.g.E. 7/5% USt.')\n- 19_pre_app ('19/16% Aufz. VSt.')\n- 7_pre_app ('7/5% Aufz. VSt.')\n- 19_both_app_1 ('§13b 19/16% USt./Aufz. VSt.')\n- 19_both_app_506 ('§13b 19/16% USt./Aufz. VSt. (EU §13b Abs. 1)')\n- 19_both_app_511 ('§13b 19/16% USt./Aufz. VSt. (Drittland §13b Abs. 2 Nr. 1)')\n- 19_both_app_2 ('i.g.E. 19/16% USt./Aufz. VSt.')\n- 7_both_app ('i.g.E. 7/5% USt./Aufz. VSt.')",
        "valuesFromText": [
          "0_none",
          "19_vat",
          "7_vat",
          "19_pre",
          "7_pre",
          "19_both_1",
          "19_both_506",
          "19_both_6506",
          "19_both_511",
          "19_both_6511",
          "19_both_6501",
          "19_both_2",
          "7_both",
          "19_both_1_no_pre",
          "19_both_2_no_pre",
          "7_both_no_pre",
          "19_pre_app",
          "7_pre_app",
          "19_both_app_1",
          "19_both_app_506",
          "19_both_app_511",
          "19_both_app_2",
          "7_both_app"
        ],
        "itemsMissing": false
      },
      {
        "name": "cost_location",
        "specType": "string",
        "required": false,
        "description": "The cost location number.\n\nIf specified, field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "cost_location_two",
        "specType": "string",
        "required": false,
        "description": "The cost location two number.\n\nIf specified, field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsAddFree_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/add-batch/free",
    "summary": "add multiple free postings",
    "description": "Add multiple free postings.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "free_postings",
        "specType": "(schema)",
        "required": true,
        "description": "an array of free postings, each free posting has the same field declaration and validation as the postings/add/free endpoint",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/PostingsFree",
        "schema": {
          "ref": "#/definitions/PostingsFree",
          "containerType": "array",
          "itemRequired": [
            "date",
            "postingtext",
            "vat",
            "amounts",
            "postingaccount_debit",
            "postingaccount_credit"
          ],
          "itemFields": [
            {
              "name": "date",
              "specType": "string",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingtext",
              "specType": "string",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "amount",
              "specType": "number",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingaccount_debit",
              "specType": "integer",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingaccount_credit",
              "specType": "integer",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "vat",
              "specType": "string",
              "required": true,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "cost_location",
              "specType": "string",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "cost_location_two",
              "specType": "string",
              "required": false,
              "description": "",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": [
            "amounts"
          ]
        }
      }
    ],
    "successDefinition": "PostingsAddBatchFree_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "free_postings",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/unconfirm/transaction",
    "summary": "unconfirm transaction posting",
    "description": "Remove postings for a specified transaction by unconfirming them. This will only work if the postings are not fixed.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the transaction.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsUnconfirmTransaction_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/unconfirm/receipt",
    "summary": "unconfirm receipt posting",
    "description": "Remove postings for a specified receipt by unconfirming them. This will only work if the postings are not fixed.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the receipt.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsUnconfirmReceipt_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/unconfirm/free",
    "summary": "unconfirm free posting",
    "description": "Remove a specified free posting by unconfirming it. This will only work if the posting is not fixed.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "posting_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the free posting.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsUnconfirmFree_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/assign/receipt-to-free-posting",
    "summary": "assign receipt to free posting",
    "description": "Assign a receipt to a free posting.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the receipt.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "posting_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsAssignReceiptToFreePosting_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/postings/cancel",
    "summary": "cancel posting",
    "description": "Cancel a specified posting. Postings that are not fixed are deleted, fixed postings are cancelled by creating a reversal posting.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "posting_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the posting.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "PostingsCancel_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/settings/add/debtor",
    "summary": "create debtor",
    "description": "Create a debtor account.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The name of your new debtor account",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "required": false,
        "description": "The postingaccount number of your new debtor account. If not specified, the next possible number will be created.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The contact person name of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": false,
        "description": "The street of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_address_line",
        "specType": "string",
        "required": false,
        "description": "The additional address line of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "customer_number",
        "specType": "string",
        "required": false,
        "description": "The customer_number of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": false,
        "description": "The zip of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": false,
        "description": "The city of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": false,
        "description": "The country of your new debtor account.\n\nIf specified, the field will be validated.\n\nValid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "sales_tax_id",
        "specType": "string",
        "required": false,
        "description": "The sales tax id of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": false,
        "description": "The email of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "iban",
        "specType": "string",
        "required": false,
        "description": "The iban of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "bic",
        "specType": "string",
        "required": false,
        "description": "The bic of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "SettingsAddDebitor_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/settings/add-batch/debtors",
    "summary": "create debtors batch",
    "description": "Create multiple debtor accounts.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "debtors",
        "specType": "(schema)",
        "required": true,
        "description": "an array of debtors, each debtor has the field declaration and validation from the single add/debtor endpoint",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/SettingsDebtors",
        "schema": {
          "ref": "#/definitions/SettingsDebtors",
          "containerType": "array",
          "itemRef": "#/definitions/SettingsDebtor",
          "itemRequired": [
            "name"
          ],
          "itemFields": [
            {
              "name": "name",
              "specType": "string",
              "required": true,
              "description": "The name of your new debtor account",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingaccount_number",
              "specType": "string",
              "required": false,
              "description": "The postingaccount number of your new debtor account. If not specified, the next possible number will be created.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "contact_person_name",
              "specType": "string",
              "required": false,
              "description": "The contact person name of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "street",
              "specType": "string",
              "required": false,
              "description": "The street of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "additional_address_line",
              "specType": "string",
              "required": false,
              "description": "The additional address line of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "customer_number",
              "specType": "string",
              "required": false,
              "description": "The customer number of the recipient.\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "zip",
              "specType": "string",
              "required": false,
              "description": "The zip of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "city",
              "specType": "string",
              "required": false,
              "description": "The city of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "country",
              "specType": "string",
              "required": false,
              "description": "The country of your new debtor account.\n\nIf specified, the field will be validated.\n\nValid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "sales_tax_id",
              "specType": "string",
              "required": false,
              "description": "The sales tax id of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "iban",
              "specType": "string",
              "required": false,
              "description": "The iban of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "bic",
              "specType": "string",
              "required": false,
              "description": "The bic of your new debtor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "SettingsAddBatchDebtors_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "debtors",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/settings/add/creditor",
    "summary": "create creditor",
    "description": "Create a creditor account.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The name of your new creditor account",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "required": false,
        "description": "The postingaccount number of your new creditor account. If not specified, the next possible number will be created.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The contact person name of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": false,
        "description": "The street of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_address_line",
        "specType": "string",
        "required": false,
        "description": "The additional address line of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": false,
        "description": "The zip of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": false,
        "description": "The city of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": false,
        "description": "The country of your new creditor account.\n\nIf specified, the field will be validated.\n\nValid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "sales_tax_id",
        "specType": "string",
        "required": false,
        "description": "The sales tax id of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": false,
        "description": "The email of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "iban",
        "specType": "string",
        "required": false,
        "description": "The iban of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "bic",
        "specType": "string",
        "required": false,
        "description": "The bic of your new creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "due_in_days",
        "specType": "integer",
        "required": false,
        "description": "The due in days of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "SettingsAddCreditor_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/settings/add-batch/creditors",
    "summary": "create creditor batch",
    "description": "Create multiple creditor accounts.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "creditors",
        "specType": "(schema)",
        "required": true,
        "description": "an array of creditors, each creditor has the field declaration and validation from the single add/creditor endpoint",
        "valuesFromText": [],
        "itemsMissing": false,
        "ref": "#/definitions/SettingsCreditors",
        "schema": {
          "ref": "#/definitions/SettingsCreditors",
          "containerType": "array",
          "itemRef": "#/definitions/SettingsCreditor",
          "itemRequired": [
            "name"
          ],
          "itemFields": [
            {
              "name": "name",
              "specType": "string",
              "required": true,
              "description": "The name of your new creditor account",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "postingaccount_number",
              "specType": "string",
              "required": false,
              "description": "The postingaccount number of your new creditor account. If not specified, the next possible number will be created.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "contact_person_name",
              "specType": "string",
              "required": false,
              "description": "The contact person name of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "street",
              "specType": "string",
              "required": false,
              "description": "The street of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "additional_address_line",
              "specType": "string",
              "required": false,
              "description": "The additional address line of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "zip",
              "specType": "string",
              "required": false,
              "description": "The zip of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "city",
              "specType": "string",
              "required": false,
              "description": "The city of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "country",
              "specType": "string",
              "required": false,
              "description": "The country of your new creditor account.\n\nIf specified, the field will be validated.\n\nValid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "sales_tax_id",
              "specType": "string",
              "required": false,
              "description": "The sales tax id of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "iban",
              "specType": "string",
              "required": false,
              "description": "The iban of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "bic",
              "specType": "string",
              "required": false,
              "description": "The bic of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            },
            {
              "name": "due_in_days",
              "specType": "integer",
              "required": false,
              "description": "The due in days of your new creditor account.\n\nIf specified, the field will be validated.",
              "itemsMissing": false,
              "valuesFromText": []
            }
          ],
          "requiredWithoutProperty": []
        }
      }
    ],
    "successDefinition": "SettingsAddBatchCreditors_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "creditors",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "errors",
        "specType": "array",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/settings/add/postingaccount",
    "summary": "add postingaccount",
    "description": "Create a postingaccount.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The name of your new postingaccount.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The postingaccount number of your new postingaccount.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "parent_postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The parent postingaccount number of your new postingaccount.\n\nThis is the postingaccount from which your individually created postingaccount inherits their properties.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "SettingsAddPostingaccount_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "parent_postingaccount_number",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/settings/get/debtors",
    "summary": "get debitors",
    "description": "Get all debitors",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "limit of the results, default is 25 results",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 25
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "offset of the results, default is 0",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 0
      }
    ],
    "successDefinition": "SettingsDebitorGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "street",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "zip",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "city",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "country",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "sales_tax_id_eu",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "email",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "uid_ch",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "iban",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "bic",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "import_pending",
        "specType": "integer",
        "container": "data"
      }
    ]
  },
  {
    "path": "/settings/get/creditors",
    "summary": "get creditors",
    "description": "Get all creditors",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "limit of the results, default is 25 results",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 25
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "offset of the results, default is 0",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 0
      }
    ],
    "successDefinition": "SettingsCreditorGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "street",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "zip",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "city",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "country",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "sales_tax_id_eu",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "email",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "uid_ch",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "iban",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "bic",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "import_pending",
        "specType": "integer",
        "container": "data"
      }
    ]
  },
  {
    "path": "/settings/get/postingaccounts",
    "summary": "get postingaccounts",
    "description": "Get all postingaccounts",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "limit of the results, default is 1000 results.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 1000
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "offset of the results, default is 0.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": 0
      },
      {
        "name": "order",
        "specType": "string",
        "required": false,
        "description": "the order of the results.\n\nThe following options are valid:\n\npostingaccount_number ASC | DESC\n\nname ASC | DESC\n\ntype ASC | DESC.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": null
      },
      {
        "name": "exclude_postingaccounts",
        "specType": "boolean",
        "required": false,
        "description": "exclude all postingaccounts from result.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": false
      },
      {
        "name": "exclude_accounts",
        "specType": "boolean",
        "required": false,
        "description": "exclude all base accounts (e.g. bank accounts) from result.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": false
      },
      {
        "name": "exclude_creditors",
        "specType": "boolean",
        "required": false,
        "description": "exclude all creditor postingaccounts from result.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": false
      },
      {
        "name": "exclude_debtors",
        "specType": "boolean",
        "required": false,
        "description": "exclude all debtor postingaccounts from result.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": false
      }
    ],
    "successDefinition": "SettingsPostingaccountsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "subtype",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "parent_postingaccount_number",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "parent_name",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/settings/update/debtor",
    "summary": "update debtor",
    "description": "Update a debtor account.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The postingaccount_number of the debtor account",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": false,
        "description": "The new name of the new debtor account",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The new contact person name of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": false,
        "description": "The new street of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_address_line",
        "specType": "string",
        "required": false,
        "description": "The new additional address line of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "customer_number",
        "specType": "string",
        "required": false,
        "description": "The new customer_number of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": false,
        "description": "The new zip of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": false,
        "description": "The new city of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": false,
        "description": "The new country of the debtor account.\n\nIf specified, the field will be validated.\n\nValid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "sales_tax_id",
        "specType": "string",
        "required": false,
        "description": "The new sales tax id of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": false,
        "description": "The email of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "iban",
        "specType": "string",
        "required": false,
        "description": "The new iban of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "bic",
        "specType": "string",
        "required": false,
        "description": "The new bic of the debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "SettingsUpdateDebitor_Success",
    "successShape": "object",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "street",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "zip",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "city",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "country",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "sales_tax_id_eu",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "email",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "uid_ch",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "iban",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "bic",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/settings/update/creditor",
    "summary": "update creditor",
    "description": "Update a creditor account.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The postingaccount_number of the creditor account",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": false,
        "description": "The new name of the creditor account",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "required": false,
        "description": "The new contact person name of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "street",
        "specType": "string",
        "required": false,
        "description": "The new street of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "additional_address_line",
        "specType": "string",
        "required": false,
        "description": "The new additional address line of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "zip",
        "specType": "string",
        "required": false,
        "description": "The new zip of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "city",
        "specType": "string",
        "required": false,
        "description": "The new city of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "country",
        "specType": "string",
        "required": false,
        "description": "The new country of the creditor account.\n\nIf specified, the field will be validated.\n\nValid cases are only the German version of the country name [Dänemark] OR the two digit ISO code of the country [DK].",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "sales_tax_id",
        "specType": "string",
        "required": false,
        "description": "The new sales tax id of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "email",
        "specType": "string",
        "required": false,
        "description": "The email of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "iban",
        "specType": "string",
        "required": false,
        "description": "The new iban of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "bic",
        "specType": "string",
        "required": false,
        "description": "The new bic of the creditor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "due_in_days",
        "specType": "integer",
        "required": false,
        "description": "The due in days of your new debtor account.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "SettingsUpdateCreditor_Success",
    "successShape": "object",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "type",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "contact_person_name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "street",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "additional_addressline",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "zip",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "city",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "country",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "sales_tax_id_eu",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "email",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "uid_ch",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "iban",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "bic",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/settings/update/postingaccount",
    "summary": "update postingaccount",
    "description": "Update a postingaccount.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The new name of the postingaccount to update.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The postingaccount number of the postingaccount to update.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "SettingsUpdatePostingaccount_Success",
    "successShape": "object",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/accounts/get",
    "summary": "get all the accounts",
    "description": "Get all the accounts",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "AccountsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/accounts/add",
    "summary": "add a basic account",
    "description": "Add a basic account",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "type",
        "specType": "string",
        "required": true,
        "description": "The type of the basic account. Accepted values: \"cash\", \"bank/institution\", \"other\".",
        "valuesFromText": [
          "cash",
          "bank/institution",
          "other"
        ],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The name of the basic account.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The postingaccount_number of the basic account.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_creates_transaction",
        "specType": "boolean",
        "required": false,
        "description": "If a receipt assigned to this basic account should automatically create a transaction, this parameter should be true.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": false
      },
      {
        "name": "is_revision_safe",
        "specType": "boolean",
        "required": false,
        "description": "If you create a basic account of type cash, you can make this revision_safe. That means, you cannot remove already saved transactions without creating a cancellation transaction. NOTE: This will only work for cash accounts!\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": false
      }
    ],
    "successDefinition": "AccountsAdd_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "postingaccount_number",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/comments/add",
    "summary": "add comment to transaction or receipt",
    "description": "Add comment to transaction or receipt.\nNOTE: You have to submit either a transaction_id_by_customer or a receipt_id_by_customer.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "comment_text",
        "specType": "string",
        "required": true,
        "description": "The comment text as a string between 2 and 210 characters.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "transaction_id_by_customer",
        "specType": "integer",
        "required": false,
        "description": "The id_by_customer of the transaction.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "receipt_id_by_customer",
        "specType": "integer",
        "required": false,
        "description": "The id_by_customer of the receipt.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "CommentsAdd_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/cost-locations/get",
    "summary": "get cost locations",
    "description": "Get cost locations for a specified customer account. The response includes the number of returned rows and an array of cost locations data. NOTE: Each request is limited to 1000 cost locations!",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "code",
        "specType": "string",
        "required": false,
        "description": "The code of one specific cost location. If provided, only the cost location with this code will be returned.",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "limit",
        "specType": "integer",
        "required": false,
        "description": "Set a limit of returned postings. NOTE: the maximum limit is 1000!",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "offset",
        "specType": "integer",
        "required": false,
        "description": "Set an offset for the returned postings.",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "CostLocationsGet_Success",
    "successShape": "list",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "rows",
        "specType": "integer",
        "container": "envelope"
      },
      {
        "name": "data",
        "specType": "array",
        "container": "envelope"
      },
      {
        "name": "code",
        "specType": "string",
        "container": "data"
      },
      {
        "name": "name",
        "specType": "string",
        "container": "data"
      }
    ]
  },
  {
    "path": "/cost-locations/add",
    "summary": "add cost location",
    "description": "Add a new cost location.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "code",
        "specType": "string",
        "required": true,
        "description": "An alphanumeric identifier for the cost location (max 10 chars)",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The name/description of the cost location",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "CostLocationsAdd_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "code",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/cost-locations/update",
    "summary": "update cost location",
    "description": "Update a cost location's name/description.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "code",
        "specType": "string",
        "required": true,
        "description": "The cost location code",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "name",
        "specType": "string",
        "required": true,
        "description": "The updated name/description of the cost location",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "CostLocationsUpdate_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/cost-locations/delete",
    "summary": "delete cost location",
    "description": "Delete a cost location.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "code",
        "specType": "string",
        "required": true,
        "description": "The cost location code",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "CostLocationsDelete_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/reports/create/bwa",
    "summary": "create bwa report",
    "description": "Triggers the creation of a BWA report (“Betriebswirtschaftliche Auswertung”).\n\nThe report is generated asynchronously in the background. The response contains the id_by_customer of the created report, which may be used to retrieve it once the generation has been finished.\n\nA new report may only be requested once the generation of a previously requested report of the same type has been finished.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_from",
        "specType": "string",
        "required": true,
        "description": "The first day of the period the report is created for, in format 'YYYY-MM-DD' (e.g. '2026-01-01').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_to",
        "specType": "string",
        "required": true,
        "description": "The last day of the period the report is created for, in format 'YYYY-MM-DD' (e.g. '2026-03-31').",
        "valuesFromText": [],
        "itemsMissing": false
      }
    ],
    "successDefinition": "ReportsCreateBwa_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/reports/create/sums",
    "summary": "create sums report",
    "description": "Triggers the creation of a sums report (“Summen- und Saldenliste”). The report is always created for all of the customer's postingaccounts.\n\nThe report is generated asynchronously in the background. The response contains the id_by_customer of the created report, which may be used to retrieve it once the generation has been finished.\n\nA new report may only be requested once the generation of a previously requested report of the same type has been finished.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_from",
        "specType": "string",
        "required": true,
        "description": "The first day of the period the report is created for, in format 'YYYY-MM-DD' (e.g. '2026-01-01').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_to",
        "specType": "string",
        "required": true,
        "description": "The last day of the period the report is created for, in format 'YYYY-MM-DD' (e.g. '2026-03-31').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "base",
        "specType": "string",
        "required": false,
        "description": "The date the postings are taken into account by. Can be either 'date' (“Buchungsdatum”) or 'date_delivery_else_date' (“Buchungs- und Leistungsdatum”).\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "date",
          "date_delivery_else_date"
        ],
        "itemsMissing": false,
        "default": "date"
      },
      {
        "name": "file_pdf",
        "specType": "boolean",
        "required": false,
        "description": "If true, a pdf file will be created for the report additionally.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "file_csv",
        "specType": "boolean",
        "required": false,
        "description": "If true, a csv file will be created for the report additionally.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      },
      {
        "name": "archive_export",
        "specType": "boolean",
        "required": false,
        "description": "If true, a zip archive containing the csv file and the postingaccount ledgers (“Kontenblätter”) will be created for the report additionally.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      }
    ],
    "successDefinition": "ReportsCreateSums_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "id_by_customer",
        "specType": "string",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/reports/get/bwa",
    "summary": "get bwa report",
    "description": "Returns a previously created BWA report (“Betriebswirtschaftliche Auswertung”).\n\nReports are generated asynchronously, so a report is only available once its generation has been finished. Note that creating a new report of the same type replaces the previously created one.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "report_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the report, as returned when the report was created",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "get_files",
        "specType": "boolean",
        "required": false,
        "description": "If true, the report's files will be included as base64 encoded strings.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      }
    ],
    "successDefinition": "ReportsGetBwa_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "report",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "files",
        "specType": "object",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/reports/get/sums",
    "summary": "get sums report",
    "description": "Returns a previously created sums report (“Summen- und Saldenliste”).\n\nReports are generated asynchronously, so a report is only available once its generation has been finished. Note that creating a new report of the same type replaces the previously created one.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "report_id_by_customer",
        "specType": "integer",
        "required": true,
        "description": "The id_by_customer of the report, as returned when the report was created",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "get_files",
        "specType": "boolean",
        "required": false,
        "description": "If true, the report's files will be included as base64 encoded strings.\n\nIf specified, the field will be validated.",
        "valuesFromText": [],
        "itemsMissing": false,
        "default": "false"
      }
    ],
    "successDefinition": "ReportsGetSums_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "report",
        "specType": "object",
        "container": "envelope"
      },
      {
        "name": "files",
        "specType": "object",
        "container": "envelope"
      }
    ]
  },
  {
    "path": "/reports/get/sums/ledger",
    "summary": "get sums report postingaccount ledger",
    "description": "Returns the postingaccount ledger (“Kontenblatt”) of one postingaccount, holding its postings of the requested period.\n\nThe postingaccount numbers available for a sums report are provided by reports/get/sums, both as the keys of the 'sums' object and as its entries' 'postingaccount_number'.\n\nIn contrast to the report itself the ledger is created on the fly, so no report has to be created beforehand. Note that retrieving the ledger of a postingaccount holding a lot of postings may take a while.",
    "parameters": [
      {
        "name": "api_key",
        "specType": "string",
        "required": true,
        "description": "The api key registered for the customer to manage",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "postingaccount_number",
        "specType": "integer",
        "required": true,
        "description": "The number of the postingaccount to return the ledger for",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_from",
        "specType": "string",
        "required": true,
        "description": "The first day of the period the ledger is returned for, in format 'YYYY-MM-DD' (e.g. '2026-01-01').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "date_to",
        "specType": "string",
        "required": true,
        "description": "The last day of the period the ledger is returned for, in format 'YYYY-MM-DD' (e.g. '2026-03-31').",
        "valuesFromText": [],
        "itemsMissing": false
      },
      {
        "name": "base",
        "specType": "string",
        "required": false,
        "description": "The date the postings are taken into account by. Can be either 'date' (“Buchungsdatum”) or 'date_delivery_else_date' (“Buchungs- und Leistungsdatum”).\n\nIf specified, the field will be validated.",
        "valuesFromText": [
          "date",
          "date_delivery_else_date"
        ],
        "itemsMissing": false,
        "default": "date"
      }
    ],
    "successDefinition": "ReportsGetSumsLedger_Success",
    "successShape": "ack",
    "successFields": [
      {
        "name": "success",
        "specType": "boolean",
        "container": "envelope"
      },
      {
        "name": "message",
        "specType": "string",
        "container": "envelope"
      },
      {
        "name": "report_sums_postingaccount_ledger",
        "specType": "object",
        "container": "envelope"
      }
    ]
  }
];

/** Nachschlagen nach dem unveränderten Spezifikationspfad. */
export const ENDPOINTS_BY_PATH: ReadonlyMap<string, GeneratedEndpoint> = new Map(
  ENDPOINTS.map((endpoint) => [endpoint.path, endpoint]),
);
