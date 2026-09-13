// ERZEUGT von scripts/gen-errors.ts aus docs/openapi/buchhaltungsbutler-v1.json.
// NICHT VON HAND ÄNDERN. Änderungen entstehen ausschließlich über `pnpm generate`; der
// CI-Schritt verlangt danach eine leere git-Differenz (Plan 4.2).
//
// Quelle: BuchhaltungsButler API, info.version 1.9.1.
//
// 786 Paare (Pfad, error_code) über 54 Pfade. Bei 179 Paaren weichen
// `message` und `summary` voneinander ab; die Zahl ist ein Driftanzeiger und wird von
// test/unit/generated.test.ts festgehalten (Plan 5.6).
//
// Verteilung der Klassen: config 168, input 397, transient 118, final 95, special 8.
//
// ZWEI REGELN FÜR JEDEN, DER DIESEN KATALOG LIEST (Plan 5.6, Befund L6):
//   1. Kein Text aus dieser Datei wird als Wortlaut der API ausgegeben. Zitiert wird das
//      `message`-Feld der TATSÄCHLICHEN Antwort. Der Katalogtext tritt nur ein, wenn die
//      Antwort keinen verwertbaren Text trägt, und dann mit dem Zusatz „Text laut
//      Spezifikation, nicht der Wortlaut dieser Antwort".
//   2. Keine Weiche vergleicht auf Gleichheit mit einem Katalogtext. Klassifikation und
//      Retry entscheiden über (specPath, error_code, HTTP-Status).
//
// Der Katalog wird dynamisch geladen und gelangt nie vollständig in den Modellkontext.

/** Die fünf Fehlerklassen aus Plan 5.6. */
export type ErrorClass = "config" | "input" | "transient" | "final" | "special";

/** Ein Paar (Pfad, error_code) mit beiden Texten der Spezifikation. */
export interface ErrorEntry {
  /** Der HTTP-Status, unter dem die Spezifikation dieses Paar führt. */
  readonly status: number;
  /** properties.message.enum[0] der aufgelösten Definition. Verbindliche Katalogquelle. */
  readonly message: string;
  /** responses[…].description. Kurze Fassung für den Block [Was]. */
  readonly summary: string;
  /** Beim Erzeugen bestimmt, nicht zur Laufzeit geraten. */
  readonly cls: ErrorClass;
  /** Der Parameter dieses Pfades, auf den sich die Meldung bezieht, sofern eindeutig. */
  readonly field?: string;
}

/**
 * Schlüssel der ersten Ebene ist IMMER der Spezifikationspfad, bei den vier Werkzeugen mit
 * Pfadvorlage also `path.specPath` und nicht der gebaute Pfad (Plan 4.6). Schlüssel der
 * zweiten Ebene ist der `error_code`.
 */
export const ERRORS: Record<string, Record<number, ErrorEntry>> = {
  "/receipts/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid list_direction specified",
      "summary": "invalid list_direction specified",
      "cls": "input",
      "field": "list_direction"
    },
    "6": {
      "status": 400,
      "message": "invalid payment_status specified",
      "summary": "invalid payment_status specified",
      "cls": "input",
      "field": "payment_status"
    },
    "7": {
      "status": 400,
      "message": "invalid date_from specified",
      "summary": "invalid date_from specified",
      "cls": "input",
      "field": "date_from"
    },
    "8": {
      "status": 400,
      "message": "invalid date_to specified",
      "summary": "invalid date_to specified",
      "cls": "input",
      "field": "date_to"
    },
    "9": {
      "status": 400,
      "message": "invalid counterparty specified",
      "summary": "invalid counterparty specified",
      "cls": "input",
      "field": "counterparty"
    },
    "10": {
      "status": 400,
      "message": "invalid limit specified",
      "summary": "invalid limit specified",
      "cls": "input",
      "field": "limit"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid offset specified",
      "summary": "invalid offset specified",
      "cls": "input",
      "field": "offset"
    },
    "13": {
      "status": 400,
      "message": "invalid include_offers specified",
      "summary": "invalid include_offers specified",
      "cls": "input",
      "field": "include_offers"
    },
    "14": {
      "status": 400,
      "message": "invalid deleted specified",
      "summary": "invalid deleted specified",
      "cls": "input",
      "field": "deleted"
    },
    "15": {
      "status": 400,
      "message": "invalid sort field specified",
      "summary": "invalid sort field is specified",
      "cls": "input",
      "field": "order"
    },
    "16": {
      "status": 400,
      "message": "invalid sort value specified",
      "summary": "invalid sort value is specified",
      "cls": "input"
    },
    "17": {
      "status": 400,
      "message": "invalid invoicenumber specified",
      "summary": "invalid invoicenumber specified",
      "cls": "input",
      "field": "invoicenumber"
    },
    "18": {
      "status": 400,
      "message": "invalid due_date specified",
      "summary": "invalid due_date specified",
      "cls": "input",
      "field": "due_date"
    },
    "19": {
      "status": 400,
      "message": "invalid date_since_last_modified specified",
      "summary": "invalid date_since_last_modified specified",
      "cls": "input",
      "field": "date_since_last_modified"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/receipts/get/id_by_customer": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid id_by_customer specified",
      "summary": "invalid id_by_customer specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "invalid get_file specified",
      "summary": "invalid get_file specified",
      "cls": "input",
      "field": "get_file"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/receipts/add": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "8": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid receipt type",
      "cls": "input",
      "field": "type"
    },
    "9": {
      "status": 400,
      "message": "invalid account specified",
      "summary": "invalid account specified",
      "cls": "input",
      "field": "account"
    },
    "10": {
      "status": 400,
      "message": "account specified does not exist for the customer",
      "summary": "account does not exist for the customer",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "17": {
      "status": 400,
      "message": "invalid counterparty specified",
      "summary": "invalid counterparty specified",
      "cls": "input",
      "field": "counterparty"
    },
    "18": {
      "status": 400,
      "message": "invalid invoice number specified",
      "summary": "invalid invoice number specified",
      "cls": "input",
      "field": "invoice_number"
    },
    "19": {
      "status": 400,
      "message": "invalid date specified",
      "summary": "invalid date specified",
      "cls": "input",
      "field": "date"
    },
    "20": {
      "status": 400,
      "message": "invalid amount specified",
      "summary": "invalid amount specified",
      "cls": "input",
      "field": "amount"
    },
    "21": {
      "status": 400,
      "message": "invalid currency specified",
      "summary": "invalid currency specified",
      "cls": "input",
      "field": "currency"
    },
    "22": {
      "status": 400,
      "message": "invalid vat rate specified",
      "summary": "invalid vat rate specified",
      "cls": "input",
      "field": "vat_rate"
    },
    "24": {
      "status": 400,
      "message": "invalid creditor/debtor specified",
      "summary": "invalid creditor/debtor specified",
      "cls": "input"
    },
    "25": {
      "status": 400,
      "message": "creditor/debtor specified does not exist for the customer",
      "summary": "creditor/debtor specified does not exist for the customer",
      "cls": "final"
    },
    "26": {
      "status": 400,
      "message": "a receipt of type '<type>' cannot be assigned to a creditor account",
      "summary": "a receipt of type '<type>' cannot be assigned to a creditor account",
      "cls": "final"
    },
    "27": {
      "status": 400,
      "message": "creditors are not activated for the customer",
      "summary": "creditors are not activated for the customer",
      "cls": "config"
    },
    "28": {
      "status": 400,
      "message": "a receipt of type '<type>' cannot be assigned to a debtor account",
      "summary": "a receipt of type '<type>' cannot be assigned to a debtor account",
      "cls": "final"
    },
    "29": {
      "status": 400,
      "message": "debtors are not activated for the customer",
      "summary": "debtors are not activated for the customer",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "34": {
      "status": 400,
      "message": "invalid payment reference specified",
      "summary": "invalid payment reference specified",
      "cls": "input",
      "field": "payment_reference"
    },
    "35": {
      "status": 400,
      "message": "invalid date delivery specified",
      "summary": "invalid date delivery specified",
      "cls": "input",
      "field": "date_delivery"
    },
    "36": {
      "status": 400,
      "message": "invalid date_payment_due specified",
      "summary": "invalid date_payment_due specified",
      "cls": "input",
      "field": "date_payment_due"
    },
    "37": {
      "status": 400,
      "message": "invalid link_to_receipt_id_by_customer specified",
      "summary": "invalid link_to_receipt_id_by_customer specified",
      "cls": "input",
      "field": "link_to_receipt_id_by_customer"
    }
  },
  "/receipts/addBatch": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "Number of receipts exceeded",
      "summary": "Maximum of 50 receipts exceeded",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "No receipts found",
      "summary": "No receipts found",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/receipts/upload": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "no file provided",
      "summary": "no file provided",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "file type not accepted",
      "summary": "file type not accepted",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "maximum file size is <max>MB",
      "summary": "maximum file size exceeded",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid receipt type",
      "cls": "input",
      "field": "type"
    },
    "9": {
      "status": 400,
      "message": "invalid account specified",
      "summary": "invalid account specified",
      "cls": "input",
      "field": "account"
    },
    "10": {
      "status": 400,
      "message": "account specified does not exist for the customer",
      "summary": "account does not exist for the customer",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 403,
      "message": "customer has reached the upload limit",
      "summary": "customer has reached the upload limit",
      "cls": "final"
    },
    "14": {
      "status": 400,
      "message": "maximum number of pages is <max>",
      "summary": "maximum pages exceeded",
      "cls": "input"
    },
    "15": {
      "status": 403,
      "message": "upload temporarily restricted",
      "summary": "upload is temporarily restricted",
      "cls": "transient"
    },
    "17": {
      "status": 400,
      "message": "invalid counterparty specified",
      "summary": "invalid counterparty specified",
      "cls": "input",
      "field": "counterparty"
    },
    "18": {
      "status": 400,
      "message": "invalid invoice number specified",
      "summary": "invalid invoice number specified",
      "cls": "input",
      "field": "invoice_number"
    },
    "19": {
      "status": 400,
      "message": "invalid date specified",
      "summary": "invalid date specified",
      "cls": "input",
      "field": "date"
    },
    "20": {
      "status": 400,
      "message": "invalid amount specified",
      "summary": "invalid amount specified",
      "cls": "input",
      "field": "amount"
    },
    "21": {
      "status": 400,
      "message": "invalid currency specified",
      "summary": "invalid currency specified",
      "cls": "input",
      "field": "currency"
    },
    "22": {
      "status": 400,
      "message": "invalid vat rate specified",
      "summary": "invalid vat rate specified",
      "cls": "input",
      "field": "vat_rate"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "invalid creditor/debtor specified",
      "summary": "invalid creditor/debtor specified",
      "cls": "input"
    },
    "25": {
      "status": 400,
      "message": "creditor/debtor specified does not exist for the customer",
      "summary": "creditor/debtor specified does not exist for the customer",
      "cls": "final"
    },
    "26": {
      "status": 400,
      "message": "a receipt of type '<type>' cannot be assigned to a creditor account",
      "summary": "a receipt of type '<type>' cannot be assigned to a creditor account",
      "cls": "final"
    },
    "27": {
      "status": 400,
      "message": "creditors are not activated for the customer",
      "summary": "creditors are not activated for the customer",
      "cls": "config"
    },
    "28": {
      "status": 400,
      "message": "a receipt of type '<type>' cannot be assigned to a debtor account",
      "summary": "a receipt of type '<type>' cannot be assigned to a debtor account",
      "cls": "final"
    },
    "29": {
      "status": 400,
      "message": "debtors are not activated for the customer",
      "summary": "debtors are not activated for the customer",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 422,
      "message": "receipt not processable",
      "summary": "the receipt could not be processed (protected?)",
      "cls": "final"
    },
    "32": {
      "status": 422,
      "message": "receipt ocr processing failed",
      "summary": "the receipt could not be processed by ocr",
      "cls": "final"
    },
    "33": {
      "status": 400,
      "message": "file name is not specified",
      "summary": "file name is not specified",
      "cls": "input"
    },
    "34": {
      "status": 400,
      "message": "invalid payment reference specified",
      "summary": "invalid payment reference specified",
      "cls": "input",
      "field": "payment_reference"
    },
    "35": {
      "status": 400,
      "message": "invalid date delivery specified",
      "summary": "invalid date delivery specified",
      "cls": "input",
      "field": "date_delivery"
    },
    "36": {
      "status": 400,
      "message": "invalid date_payment_due specified",
      "summary": "invalid date_payment_due specified",
      "cls": "input",
      "field": "date_payment_due"
    },
    "37": {
      "status": 400,
      "message": "invalid link_to_receipt_id_by_customer specified",
      "summary": "invalid link_to_receipt_id_by_customer specified",
      "cls": "input",
      "field": "link_to_receipt_id_by_customer"
    }
  },
  "/receipts/delete/id_by_customer": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid id_by_customer specified",
      "summary": "invalid id_by_customer specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "no receipt found",
      "summary": "no receipt found",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "receipt is already deleted",
      "summary": "receipt is already deleted",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "receipt can´t be marked as deleted - fixed postings exist",
      "summary": "receipt can´t be marked as deleted - fixed postings exist",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "receipt is directly assigned to confirmed postings",
      "summary": "receipt is directly assigned to confirmed postings",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/receipts/restore/id_by_customer": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid id_by_customer specified",
      "summary": "invalid id_by_customer specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "no receipt found",
      "summary": "no receipt found",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "receipt is not marked as deleted",
      "summary": "receipt is not marked as deleted",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "restoration of receipt failed",
      "summary": "restoration of receipt failed",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/receipts/assigned-transactions/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid receipt_id_by_customer specified",
      "summary": "invalid receipt_id_by_customer specified",
      "cls": "input",
      "field": "receipt_id_by_customer"
    },
    "6": {
      "status": 400,
      "message": "no receipt found",
      "summary": "no receipt found",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid confirmed_only specified",
      "summary": "invalid confirmed_only specified",
      "cls": "input",
      "field": "confirmed_only"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid date_from specified",
      "summary": "invalid date_from specified",
      "cls": "input",
      "field": "date_from"
    },
    "6": {
      "status": 400,
      "message": "invalid date_to specified",
      "summary": "invalid date_to specified",
      "cls": "input",
      "field": "date_to"
    },
    "7": {
      "status": 400,
      "message": "invalid account specified",
      "summary": "invalid account specified",
      "cls": "input",
      "field": "account"
    },
    "8": {
      "status": 400,
      "message": "invalid to_from specified",
      "summary": "invalid to_from specified",
      "cls": "input",
      "field": "to_from"
    },
    "9": {
      "status": 400,
      "message": "invalid limit specified",
      "summary": "invalid limit specified",
      "cls": "input",
      "field": "limit"
    },
    "10": {
      "status": 400,
      "message": "invalid offset specified",
      "summary": "invalid offset specified",
      "cls": "input",
      "field": "offset"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid id_by_customer_from specified",
      "summary": "invalid id_by_customer_from specified",
      "cls": "input",
      "field": "id_by_customer_from"
    },
    "13": {
      "status": 400,
      "message": "invalid id_by_customer_to specified",
      "summary": "invalid id_by_customer_to specified",
      "cls": "input",
      "field": "id_by_customer_to"
    },
    "14": {
      "status": 400,
      "message": "invalid date_since_last_modified specified",
      "summary": "invalid date_since_last_modified specified",
      "cls": "input",
      "field": "date_since_last_modified"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/get/id_by_customer": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid id_by_customer specified",
      "summary": "invalid id_by_customer specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "transaction not found",
      "summary": "transaction not found",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/add": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "no account specified",
      "summary": "no account specified",
      "cls": "input",
      "field": "account"
    },
    "6": {
      "status": 400,
      "message": "invalid account specified",
      "summary": "invalid account specified",
      "cls": "input",
      "field": "account"
    },
    "7": {
      "status": 400,
      "message": "account specified does not exist for the customer",
      "summary": "account does not exist for the customer",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "no payment recipient or sender (to_from) specified",
      "summary": "no payment recipient or sender (to_from) specified",
      "cls": "input"
    },
    "9": {
      "status": 400,
      "message": "invalid payment recipient or sender (to_from) specified",
      "summary": "invalid payment recipient or sender (to_from) specified",
      "cls": "input"
    },
    "10": {
      "status": 400,
      "message": "no amount specified",
      "summary": "no amount specified",
      "cls": "input",
      "field": "amount"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "13": {
      "status": 400,
      "message": "invalid amount specified",
      "summary": "invalid amount specified",
      "cls": "input",
      "field": "amount"
    },
    "14": {
      "status": 400,
      "message": "no booking date specified",
      "summary": "no booking date specified",
      "cls": "input",
      "field": "booking_date"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "16": {
      "status": 400,
      "message": "invalid booking date specified",
      "summary": "invalid booking date specified",
      "cls": "input",
      "field": "booking_date"
    },
    "17": {
      "status": 400,
      "message": "invalid value date specified",
      "summary": "invalid value date specified",
      "cls": "input",
      "field": "value_date"
    },
    "18": {
      "status": 400,
      "message": "invalid account number specified",
      "summary": "invalid account number specified",
      "cls": "input",
      "field": "account_number"
    },
    "19": {
      "status": 400,
      "message": "invalid bank code specified",
      "summary": "invalid bank code specified",
      "cls": "input",
      "field": "bank_code"
    },
    "20": {
      "status": 400,
      "message": "invalid bank name specified",
      "summary": "invalid bank name specified",
      "cls": "input",
      "field": "bank_name"
    },
    "21": {
      "status": 400,
      "message": "invalid purpose specified",
      "summary": "invalid purpose specified",
      "cls": "input",
      "field": "purpose"
    },
    "22": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input",
      "field": "type"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "special"
    },
    "24": {
      "status": 400,
      "message": "invalid booking text specified",
      "summary": "invalid booking text specified",
      "cls": "special",
      "field": "booking_text"
    },
    "25": {
      "status": 400,
      "message": "invalid payment reference specified",
      "summary": "invalid payment reference specified",
      "cls": "input",
      "field": "payment_reference"
    },
    "26": {
      "status": 400,
      "message": "invalid currency specified",
      "summary": "invalid currency specified",
      "cls": "input",
      "field": "currency"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/addBatch": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "Number of transactions exceeded",
      "summary": "Maximum of 50 transactions exceeded",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/assign/receipt": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid assignment type specified",
      "summary": "invalid assignment type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "no transaction_id_by_customer specified",
      "summary": "no transaction_id_by_customer specified",
      "cls": "input",
      "field": "transaction_id_by_customer"
    },
    "7": {
      "status": 400,
      "message": "posting not found",
      "summary": "no receipt_id_by_customer specified",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "transaction not found",
      "summary": "transaction not found",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "receipt not found",
      "summary": "receipt not found",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/unassign/receipt": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "6": {
      "status": 400,
      "message": "no or invalid transaction_id_by_customer specified",
      "summary": "no or invalid transaction_id_by_customer specified",
      "cls": "input",
      "field": "transaction_id_by_customer"
    },
    "7": {
      "status": 400,
      "message": "no or invalid receipt_id_by_customer specified",
      "summary": "no or invalid receipt_id_by_customer specified",
      "cls": "input",
      "field": "receipt_id_by_customer"
    },
    "8": {
      "status": 400,
      "message": "transaction not found",
      "summary": "transaction not found",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "receipt not found",
      "summary": "receipt not found",
      "cls": "final"
    },
    "10": {
      "status": 400,
      "message": "receipt could not be removed from transaction, because of a confirmed posting.",
      "summary": "receipt could not be removed from transaction, because of a confirmed posting",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no receipts assigned to transaction",
      "summary": "no receipts assigned to transaction",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/assign-batch/receipt": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "10": {
      "status": 400,
      "message": "Number of transactions to receipts exceeded",
      "summary": "Number of transactions to receipts exceeded",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "No transactions to receipts found",
      "summary": "No transactions to receipts found",
      "cls": "input"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/transactions/assigned-receipts/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid transaction_id_by_customer specified",
      "summary": "invalid transaction_id_by_customer specified",
      "cls": "input",
      "field": "transaction_id_by_customer"
    },
    "6": {
      "status": 400,
      "message": "no transaction found",
      "summary": "no transaction found",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid confirmed_only specified",
      "summary": "invalid confirmed_only specified",
      "cls": "input",
      "field": "confirmed_only"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/invoices/create": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input",
      "field": "type"
    },
    "6": {
      "status": 400,
      "message": "no items specified",
      "summary": "no items specified",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid show_prices_type specified",
      "summary": "invalid show_prices_type specified",
      "cls": "input",
      "field": "show_prices_type"
    },
    "8": {
      "status": 400,
      "message": "invalid recurring_interval specified",
      "summary": "invalid recurring_interval specified",
      "cls": "input",
      "field": "recurring_interval"
    },
    "9": {
      "status": 400,
      "message": "invalid recurring_date_next specified",
      "summary": "invalid recurring_date_next specified",
      "cls": "input",
      "field": "recurring_date_next"
    },
    "10": {
      "status": 400,
      "message": "invalid show_bankdata specified",
      "summary": "invalid show_bankdata specified",
      "cls": "input",
      "field": "show_bankdata"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid show_contactdata specified",
      "summary": "invalid show_contactdata specified",
      "cls": "input",
      "field": "show_contactdata"
    },
    "13": {
      "status": 400,
      "message": "invalid company_name specified",
      "summary": "invalid company_name specified",
      "cls": "input",
      "field": "company_name"
    },
    "14": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "16": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "17": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input",
      "field": "additional_addressline"
    },
    "18": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "19": {
      "status": 400,
      "message": "invalid city specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "city"
    },
    "20": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "21": {
      "status": 400,
      "message": "invalid date specified",
      "summary": "invalid date specified",
      "cls": "input",
      "field": "date"
    },
    "22": {
      "status": 400,
      "message": "invalid invoicenumber specified",
      "summary": "invalid invoicenumber specified",
      "cls": "input",
      "field": "invoicenumber"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "invalid date_of_supply specified",
      "summary": "invalid date_of_supply specified",
      "cls": "input",
      "field": "date_of_supply"
    },
    "25": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "26": {
      "status": 400,
      "message": "invalid correspondence specified",
      "summary": "invalid correspondence specified",
      "cls": "input",
      "field": "correspondence"
    },
    "27": {
      "status": 400,
      "message": "invalid discount_value specified",
      "summary": "invalid discount_value specified",
      "cls": "input",
      "field": "discount_value"
    },
    "28": {
      "status": 400,
      "message": "invalid discount_type specified",
      "summary": "invalid discount_type specified",
      "cls": "input",
      "field": "discount_type"
    },
    "29": {
      "status": 400,
      "message": "invalid payment_conditions specified",
      "summary": "invalid payment_conditions specified",
      "cls": "input",
      "field": "payment_conditions"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 400,
      "message": "invalid final_provisions specified",
      "summary": "invalid final_provisions specified",
      "cls": "input",
      "field": "final_provisions"
    },
    "32": {
      "status": 400,
      "message": "invalid item_name specified",
      "summary": "invalid item_name specified",
      "cls": "input",
      "field": "item_name"
    },
    "33": {
      "status": 403,
      "message": "customer has reached the upload limit",
      "summary": "customer has reached the upload limit",
      "cls": "final"
    },
    "34": {
      "status": 400,
      "message": "invalid item_amount specified",
      "summary": "invalid item_amount specified",
      "cls": "input",
      "field": "item_amount"
    },
    "35": {
      "status": 400,
      "message": "invalid item_unit specified",
      "summary": "invalid item_unit specified",
      "cls": "input",
      "field": "item_unit"
    },
    "38": {
      "status": 400,
      "message": "invalid customer_number specified",
      "summary": "invalid customer_number specified",
      "cls": "input",
      "field": "customer_number"
    },
    "39": {
      "status": 400,
      "message": "invalid item_vat specified",
      "summary": "invalid item_vat specified",
      "cls": "input",
      "field": "item_vat"
    },
    "43": {
      "status": 400,
      "message": "invalid due_days specified",
      "summary": "invalid due_days specified",
      "cls": "input",
      "field": "due_days"
    },
    "44": {
      "status": 400,
      "message": "invalid language specified, allowed values: de_DE, en_US",
      "summary": "invalid language specified",
      "cls": "input",
      "field": "language"
    }
  },
  "/invoices/create/e-invoice": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input",
      "field": "type"
    },
    "6": {
      "status": 400,
      "message": "no items specified",
      "summary": "no items specified",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid show_prices_type specified",
      "summary": "invalid show_prices_type specified",
      "cls": "input",
      "field": "show_prices_type"
    },
    "8": {
      "status": 400,
      "message": "invalid recurring_interval specified",
      "summary": "invalid recurring_interval specified",
      "cls": "input",
      "field": "recurring_interval"
    },
    "9": {
      "status": 400,
      "message": "invalid recurring_date_next specified",
      "summary": "invalid recurring_date_next specified",
      "cls": "input",
      "field": "recurring_date_next"
    },
    "10": {
      "status": 400,
      "message": "invalid show_bankdata specified",
      "summary": "invalid show_bankdata specified",
      "cls": "input",
      "field": "show_bankdata"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid show_contactdata specified",
      "summary": "invalid show_contactdata specified",
      "cls": "input",
      "field": "show_contactdata"
    },
    "13": {
      "status": 400,
      "message": "invalid company_name specified",
      "summary": "invalid company_name specified",
      "cls": "input",
      "field": "company_name"
    },
    "14": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "16": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "17": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input",
      "field": "additional_addressline"
    },
    "18": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "19": {
      "status": 400,
      "message": "invalid city specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "city"
    },
    "20": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "21": {
      "status": 400,
      "message": "invalid date specified",
      "summary": "invalid date specified",
      "cls": "input",
      "field": "date"
    },
    "22": {
      "status": 400,
      "message": "invalid invoicenumber specified",
      "summary": "invalid invoicenumber specified",
      "cls": "input",
      "field": "invoicenumber"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "invalid date_of_supply specified",
      "summary": "invalid date_of_supply specified",
      "cls": "input",
      "field": "date_of_supply"
    },
    "25": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "26": {
      "status": 400,
      "message": "invalid correspondence specified",
      "summary": "invalid correspondence specified",
      "cls": "input",
      "field": "correspondence"
    },
    "27": {
      "status": 400,
      "message": "invalid discount_value specified",
      "summary": "invalid discount_value specified",
      "cls": "input",
      "field": "discount_value"
    },
    "28": {
      "status": 400,
      "message": "invalid discount_type specified",
      "summary": "invalid discount_type specified",
      "cls": "input",
      "field": "discount_type"
    },
    "29": {
      "status": 400,
      "message": "invalid payment_conditions specified",
      "summary": "invalid payment_conditions specified",
      "cls": "input",
      "field": "payment_conditions"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 400,
      "message": "invalid final_provisions specified",
      "summary": "invalid final_provisions specified",
      "cls": "input",
      "field": "final_provisions"
    },
    "32": {
      "status": 400,
      "message": "invalid item_name specified",
      "summary": "invalid item_name specified",
      "cls": "input",
      "field": "item_name"
    },
    "33": {
      "status": 403,
      "message": "customer has reached the upload limit",
      "summary": "customer has reached the upload limit",
      "cls": "final"
    },
    "34": {
      "status": 400,
      "message": "invalid item_amount specified",
      "summary": "invalid item_amount specified",
      "cls": "input",
      "field": "item_amount"
    },
    "35": {
      "status": 400,
      "message": "invalid item_unit specified",
      "summary": "invalid item_unit specified",
      "cls": "input",
      "field": "item_unit"
    },
    "38": {
      "status": 400,
      "message": "invalid customer_number specified",
      "summary": "invalid customer_number specified",
      "cls": "input",
      "field": "customer_number"
    },
    "39": {
      "status": 400,
      "message": "invalid item_tax_type specified",
      "summary": "invalid item_tax_type specified",
      "cls": "input",
      "field": "item_tax_type"
    },
    "40": {
      "status": 400,
      "message": "invalid item_tax_amount specified",
      "summary": "invalid item_tax_amount specified",
      "cls": "input",
      "field": "item_tax_amount"
    },
    "41": {
      "status": 400,
      "message": "invalid e_invoice_id specified",
      "summary": "invalid e_invoice_id specified",
      "cls": "special",
      "field": "e_invoice_id"
    },
    "42": {
      "status": 400,
      "message": "invalid e_invoice_type specified",
      "summary": "invalid e_invoice_type specified",
      "cls": "special"
    },
    "43": {
      "status": 400,
      "message": "invalid due_days specified",
      "summary": "invalid due_days specified",
      "cls": "input",
      "field": "due_days"
    },
    "44": {
      "status": 400,
      "message": "invalid language specified, allowed values: de_DE, en_US",
      "summary": "invalid language specified",
      "cls": "input",
      "field": "language"
    }
  },
  "/invoices/create/draft": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input",
      "field": "type"
    },
    "6": {
      "status": 400,
      "message": "no items specified",
      "summary": "no items specified",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid show_prices_type specified",
      "summary": "invalid show_prices_type specified",
      "cls": "input",
      "field": "show_prices_type"
    },
    "8": {
      "status": 400,
      "message": "invalid recurring_interval specified",
      "summary": "invalid recurring_interval specified",
      "cls": "input",
      "field": "recurring_interval"
    },
    "9": {
      "status": 400,
      "message": "invalid recurring_date_next specified",
      "summary": "invalid recurring_date_next specified",
      "cls": "input",
      "field": "recurring_date_next"
    },
    "10": {
      "status": 400,
      "message": "invalid show_bankdata specified",
      "summary": "invalid show_bankdata specified",
      "cls": "input",
      "field": "show_bankdata"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid show_contactdata specified",
      "summary": "invalid show_contactdata specified",
      "cls": "input",
      "field": "show_contactdata"
    },
    "13": {
      "status": 400,
      "message": "invalid company_name specified",
      "summary": "invalid company_name specified",
      "cls": "input",
      "field": "company_name"
    },
    "14": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "16": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "17": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input",
      "field": "additional_addressline"
    },
    "18": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "19": {
      "status": 400,
      "message": "invalid city specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "city"
    },
    "20": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "21": {
      "status": 400,
      "message": "invalid date specified",
      "summary": "invalid date specified",
      "cls": "input",
      "field": "date"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "invalid date_of_supply specified",
      "summary": "invalid date_of_supply specified",
      "cls": "input",
      "field": "date_of_supply"
    },
    "25": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "26": {
      "status": 400,
      "message": "invalid correspondence specified",
      "summary": "invalid correspondence specified",
      "cls": "input",
      "field": "correspondence"
    },
    "27": {
      "status": 400,
      "message": "invalid discount_value specified",
      "summary": "invalid discount_value specified",
      "cls": "input",
      "field": "discount_value"
    },
    "28": {
      "status": 400,
      "message": "invalid discount_type specified",
      "summary": "invalid discount_type specified",
      "cls": "input",
      "field": "discount_type"
    },
    "29": {
      "status": 400,
      "message": "invalid payment_conditions specified",
      "summary": "invalid payment_conditions specified",
      "cls": "input",
      "field": "payment_conditions"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 400,
      "message": "invalid final_provisions specified",
      "summary": "invalid final_provisions specified",
      "cls": "input",
      "field": "final_provisions"
    },
    "38": {
      "status": 400,
      "message": "invalid customer_number specified",
      "summary": "invalid customer_number specified",
      "cls": "input",
      "field": "customer_number"
    },
    "44": {
      "status": 400,
      "message": "invalid language specified, allowed values: de_DE, en_US",
      "summary": "invalid language specified",
      "cls": "input",
      "field": "language"
    }
  },
  "/postings/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid date_from specified",
      "summary": "invalid date_from specified",
      "cls": "input",
      "field": "date_from"
    },
    "6": {
      "status": 400,
      "message": "invalid date_to specified",
      "summary": "invalid date_to specified",
      "cls": "input",
      "field": "date_to"
    },
    "7": {
      "status": 400,
      "message": "invalid account specified",
      "summary": "invalid account specified",
      "cls": "input",
      "field": "account"
    },
    "8": {
      "status": 400,
      "message": "invalid postingaccount flag specified",
      "summary": "invalid postingaccount specified",
      "cls": "input"
    },
    "9": {
      "status": 400,
      "message": "invalid posting_status specified",
      "summary": "invalid posting_status specified",
      "cls": "input",
      "field": "posting_status"
    },
    "10": {
      "status": 400,
      "message": "invalid limit specified",
      "summary": "invalid limit specified",
      "cls": "input",
      "field": "limit"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid offset specified",
      "summary": "invalid offset specified",
      "cls": "input",
      "field": "offset"
    },
    "13": {
      "status": 400,
      "message": "invalid cost_location specified",
      "summary": "invalid cost_location specified",
      "cls": "input",
      "field": "cost_location"
    },
    "14": {
      "status": 400,
      "message": "invalid date_last_action_from specified",
      "summary": "invalid date_last_action_from specified",
      "cls": "input",
      "field": "date_last_action_from"
    },
    "16": {
      "status": 400,
      "message": "invalid date_last_action_to specified",
      "summary": "invalid date_last_action_to specified",
      "cls": "input",
      "field": "date_last_action_to"
    },
    "17": {
      "status": 400,
      "message": "invalid order specified",
      "summary": "invalid order specified",
      "cls": "input",
      "field": "order"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/add/receipt": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid posting type specified",
      "summary": "invalid posting type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "receipt not found",
      "summary": "receipt not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "receipt is deleted",
      "summary": "receipt is deleted",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "expected account type by receipt does not match the creditor/debtor account's type",
      "summary": "expected account type by receipt does not match the creditor/debtor account's type",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "the type of the receipt does not allow postings",
      "summary": "the type of the receipt does not allow postings",
      "cls": "final"
    },
    "10": {
      "status": 400,
      "message": "creditor posting is not activated",
      "summary": "creditor posting is not activated",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "debtor posting is not activated",
      "summary": "debtor posting is not activated",
      "cls": "config"
    },
    "13": {
      "status": 400,
      "message": "the receipt is not valid, please complete the data",
      "summary": "the receipt is not valid, please complete the data",
      "cls": "final"
    },
    "14": {
      "status": 400,
      "message": "the receipt has already created a transaction",
      "summary": "the receipt has already created a transaction",
      "cls": "final"
    },
    "16": {
      "status": 400,
      "message": "a transaction linked to the receipt has already been posted",
      "summary": "a transaction linked to the receipt has already been posted",
      "cls": "final"
    },
    "17": {
      "status": 400,
      "message": "no postingaccount number specified",
      "summary": "no postingaccount number specified",
      "cls": "input"
    },
    "18": {
      "status": 400,
      "message": "the specified postingaccount is not valid",
      "summary": "the specified postingaccount is not valid",
      "cls": "final"
    },
    "19": {
      "status": 400,
      "message": "the specified postingaccount is not available",
      "summary": "the specified postingaccount is not available",
      "cls": "final"
    },
    "20": {
      "status": 400,
      "message": "the specified postingaccount cannot be booked manually",
      "summary": "the specified postingaccount cannot be booked manually",
      "cls": "final"
    },
    "21": {
      "status": 400,
      "message": "no vat option specified",
      "summary": "no vat option specified",
      "cls": "input"
    },
    "22": {
      "status": 400,
      "message": "invalid vat option for given account \"%postinaccount_number%; %postingaccount_name%\" specified",
      "summary": "invalid vat option for given account \"%postingaccount_number%; %postingaccount_name%\" specified",
      "cls": "input"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "The account %postingaccount_number% must be posted with vat option \"%vat_option%\"",
      "summary": "the account NUMBER must be posted with vat option \"%vat_option%\"",
      "cls": "final"
    },
    "25": {
      "status": 400,
      "message": "The vat option for account \"%postinaccount_number%; %postingaccount_name%\" is invalid",
      "summary": "the vat option for account \"%postingaccount_number%; %postingaccount_name%\" is invalid",
      "cls": "final"
    },
    "26": {
      "status": 400,
      "message": "The account \"%postinaccount_number%; %postingaccount_name%\" must be posted with value added tax / with pre tax / without value added tax",
      "summary": "the account \"%postingaccount_number%; %postingaccount_name%\" must be posted with value added tax / with pre tax / without value added tax",
      "cls": "final"
    },
    "27": {
      "status": 400,
      "message": "invalid tax key specified",
      "summary": "invalid tax key specified",
      "cls": "input"
    },
    "28": {
      "status": 400,
      "message": "vat option unavailable due to current settings",
      "summary": "vat option unavailable due to current settings",
      "cls": "final"
    },
    "29": {
      "status": 400,
      "message": "vat option unavailable with 'not liable to sales tax' setting",
      "summary": "vat option unavailable with 'not liable to sales tax' setting",
      "cls": "final"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 400,
      "message": "the posting text is longer than 128 characters",
      "summary": "the posting text is longer than 128 characters",
      "cls": "input"
    },
    "32": {
      "status": 400,
      "message": "the cost location is longer than 10 characters",
      "summary": "the cost location is longer than 10 characters",
      "cls": "input"
    },
    "33": {
      "status": 400,
      "message": "the cost location must consist of alphanumeric characters or be a number greater than 0",
      "summary": "the cost location must consist of alphanumeric characters or be a number greater than 0",
      "cls": "input"
    },
    "34": {
      "status": 400,
      "message": "foreign currencies can only be posted to account %postingaccount_number%",
      "summary": "foreign currencies can only be posted to account %postingaccount_number%",
      "cls": "input"
    },
    "35": {
      "status": 400,
      "message": "invalid amount specified",
      "summary": "invalid amount specified",
      "cls": "input"
    },
    "37": {
      "status": 400,
      "message": "the total amount of all postings does not match the receipt amount",
      "summary": "the total amount of all postings does not match the receipt amount",
      "cls": "final"
    },
    "38": {
      "status": 400,
      "message": "the total amount of all postings is invalid",
      "summary": "the total amount of all postings is invalid",
      "cls": "final"
    },
    "39": {
      "status": 400,
      "message": "postings with foreign currencies are not allowed",
      "summary": "postings with foreign currencies are not allowed",
      "cls": "final"
    },
    "40": {
      "status": 400,
      "message": "postings are not allowed on receipts without currency",
      "summary": "postings are not allowed on receipts without currency",
      "cls": "final"
    },
    "41": {
      "status": 400,
      "message": "the date delivery is invalid",
      "summary": "the date delivery is invalid",
      "cls": "input"
    },
    "42": {
      "status": 400,
      "message": "the vat option is not available for this date",
      "summary": "the vat option is not available for this date",
      "cls": "final"
    },
    "43": {
      "status": 400,
      "message": "the specified creditor/debtor is invalid",
      "summary": "the specified creditor/debtor is invalid",
      "cls": "final"
    },
    "44": {
      "status": 400,
      "message": "the cost location two is longer than 10 characters",
      "summary": "the cost location two is longer than 10 characters",
      "cls": "input"
    },
    "45": {
      "status": 400,
      "message": "the cost location two must consist of alphanumeric characters or be a number greater than 0",
      "summary": "the cost location two must consist of alphanumeric characters or be a number greater than 0",
      "cls": "input"
    },
    "46": {
      "status": 400,
      "message": "invalid or not existing parameters",
      "summary": "invalid or not existing parameters",
      "cls": "input"
    }
  },
  "/postings/add-batch/receipts": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/add/transaction": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid posting type specified",
      "summary": "invalid posting type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "transaction not found",
      "summary": "transaction not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "a receipt linked to the transaction has already been posted",
      "summary": "a receipt linked to the transaction has already been posted",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "no postingaccount number specified",
      "summary": "no postingaccount number specified",
      "cls": "input"
    },
    "9": {
      "status": 400,
      "message": "the specified postingaccount is not valid",
      "summary": "the specified postingaccount is not valid",
      "cls": "final"
    },
    "10": {
      "status": 400,
      "message": "the specified postingaccount is not available",
      "summary": "the specified postingaccount is not available",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "the specified postingaccount cannot be booked manually",
      "summary": "the specified postingaccount cannot be booked manually",
      "cls": "final"
    },
    "13": {
      "status": 400,
      "message": "no vat option specified",
      "summary": "no vat option specified",
      "cls": "input"
    },
    "14": {
      "status": 400,
      "message": "invalid vat option for given account specified",
      "summary": "invalid vat option for given account specified",
      "cls": "input"
    },
    "16": {
      "status": 400,
      "message": "the account \"%account_number%\" must be posted with vat option \"%vat_option%\"",
      "summary": "the account \"%account_number%\" must be posted with vat option \"%vat_option%\"",
      "cls": "final"
    },
    "17": {
      "status": 400,
      "message": "the account \"%account_number%\";\"%account_name%\" must be posted with/without \"%vat_class%\"",
      "summary": "the account \"%account_number%\";\"%account_name%\" must be posted with/without \"%vat_class%\"",
      "cls": "final"
    },
    "18": {
      "status": 400,
      "message": "invalid tax key specified",
      "summary": "invalid tax key specified",
      "cls": "input"
    },
    "19": {
      "status": 400,
      "message": "vat option unavailable due to current settings",
      "summary": "vat option unavailable due to current settings",
      "cls": "final"
    },
    "20": {
      "status": 400,
      "message": "vat option unavailable with 'not liable to sales tax' setting",
      "summary": "vat option unavailable with 'not liable to sales tax' setting",
      "cls": "final"
    },
    "21": {
      "status": 400,
      "message": "the posting text is longer than 128 characters",
      "summary": "the posting text is longer than 128 characters",
      "cls": "input"
    },
    "22": {
      "status": 400,
      "message": "the cost location is longer than 10 characters",
      "summary": "the cost location is longer than 10 characters",
      "cls": "input"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "the cost location must consist of alphanumeric characters or be a number greater than 0",
      "summary": "the cost location must consist of alphanumeric characters or be a number greater than 0",
      "cls": "input"
    },
    "25": {
      "status": 400,
      "message": "foreign currencies can only be posted to account \"%account_number%\"",
      "summary": "foreign currencies can only be posted to account \"%account_number%\"",
      "cls": "input"
    },
    "26": {
      "status": 400,
      "message": "invalid amount specified",
      "summary": "invalid amount specified",
      "cls": "input"
    },
    "27": {
      "status": 400,
      "message": "the total amount of all postings does not match the transaction amount",
      "summary": "the total amount of all postings does not match the transaction amount",
      "cls": "final"
    },
    "29": {
      "status": 400,
      "message": "the total amount of all postings is invalid",
      "summary": "The total amount of all postings is invalid",
      "cls": "final"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 400,
      "message": "the cost location two is longer than 10 characters",
      "summary": "the cost location two is longer than 10 characters",
      "cls": "input"
    },
    "32": {
      "status": 400,
      "message": "the cost location two must consist of alphanumeric characters or be a number greater than 0",
      "summary": "the cost location two must consist of alphanumeric characters or be a number greater than 0",
      "cls": "input"
    },
    "34": {
      "status": 400,
      "message": "for each partial posting, one or no receipt has to be specified explicitly via oi_receipts_ids_by_customer",
      "summary": "for each partial posting, one or no receipt has to be specified explicitly via oi_receipts_ids_by_customer",
      "cls": "input"
    },
    "46": {
      "status": 400,
      "message": "invalid or not existing parameters",
      "summary": "invalid or not existing parameters",
      "cls": "input"
    }
  },
  "/postings/add-batch/transactions": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/add/free": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid posting type specified",
      "summary": "invalid posting type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "no date specified",
      "summary": "no date specified",
      "cls": "input",
      "field": "date"
    },
    "7": {
      "status": 400,
      "message": "invalid date specified",
      "summary": "invalid date specified",
      "cls": "input",
      "field": "date"
    },
    "8": {
      "status": 400,
      "message": "no postingtext specified",
      "summary": "no postingtext specified",
      "cls": "input",
      "field": "postingtext"
    },
    "9": {
      "status": 400,
      "message": "the posting text is longer than 128 characters",
      "summary": "the posting text is longer than 128 characters",
      "cls": "input"
    },
    "10": {
      "status": 400,
      "message": "no postingaccount_debit specified",
      "summary": "no postingaccount_debit specified",
      "cls": "input",
      "field": "postingaccount_debit"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid postingaccount_debit specified or postingaccount_debit is not available",
      "summary": "invalid postingaccount_debit specified or postingaccount_debit is not available",
      "cls": "final",
      "field": "postingaccount_debit"
    },
    "13": {
      "status": 400,
      "message": "no postingaccount_credit specified",
      "summary": "no postingaccount_credit specified",
      "cls": "input",
      "field": "postingaccount_credit"
    },
    "14": {
      "status": 400,
      "message": "invalid postingaccount_credit specified or postingaccount_credit is not available",
      "summary": "invalid postingaccount_credit specified or postingaccount_credit is not available",
      "cls": "final",
      "field": "postingaccount_credit"
    },
    "16": {
      "status": 400,
      "message": "the cost location is longer than 10 characters",
      "summary": "the cost location is longer than 10 characters",
      "cls": "input"
    },
    "17": {
      "status": 400,
      "message": "the cost location must consist of alphanumeric characters or be a number greater than 0",
      "summary": "the cost location must consist of alphanumeric characters or be a number greater than 0",
      "cls": "input"
    },
    "18": {
      "status": 400,
      "message": "no vat specified",
      "summary": "no vat specified",
      "cls": "input",
      "field": "vat"
    },
    "19": {
      "status": 400,
      "message": "invalid vat specified",
      "summary": "invalid vat specified",
      "cls": "input",
      "field": "vat"
    },
    "20": {
      "status": 400,
      "message": "No amount specified",
      "summary": "no amount specified",
      "cls": "input"
    },
    "21": {
      "status": 400,
      "message": "invalid amount specified",
      "summary": "invalid amount specified",
      "cls": "input",
      "field": "amount"
    },
    "22": {
      "status": 400,
      "message": "there are no negative amounts allowed",
      "summary": "there are no negative amounts allowed",
      "cls": "input"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "24": {
      "status": 400,
      "message": "specified postingaccount_debit cannot posted manually",
      "summary": "specified postingaccount_debit cannot posted manually",
      "cls": "final"
    },
    "25": {
      "status": 400,
      "message": "specified postingaccount_credit cannot posted manually",
      "summary": "specified postingaccount_credit cannot posted manually",
      "cls": "final"
    },
    "26": {
      "status": 400,
      "message": "The postingaccount_credit is identical to the postingaccount_debit",
      "summary": "the postingaccount_credit is identical to the postingaccount_debit",
      "cls": "input"
    },
    "27": {
      "status": 400,
      "message": "The account %postingaccount_number% must be posted with vat option %vat_option%",
      "summary": "the account %postingaccount_number% must be posted with vat option %vat_option%",
      "cls": "final"
    },
    "28": {
      "status": 400,
      "message": "the vat option for account \"%postingaccount_number%; %postingsccount_name%\" is invalid",
      "summary": "the vat option for account \"%postingaccount_number%; %postingsccount_name%\" is invalid",
      "cls": "final"
    },
    "29": {
      "status": 400,
      "message": "the account \"%postingaccount_number%; %postingsccount_name%\" must be posted with/without %vat_class%",
      "summary": "the account \"%postingaccount_number%; %postingsccount_name%\" must be posted with/without %vat_class%",
      "cls": "final"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    },
    "31": {
      "status": 400,
      "message": "no vat possible for specified combination",
      "summary": "no vat possible for specified combination",
      "cls": "input"
    },
    "32": {
      "status": 400,
      "message": "the tax key is invalid for specified account combination",
      "summary": "the tax key is invalid for specified account combination",
      "cls": "final"
    },
    "33": {
      "status": 400,
      "message": "vat option unavailable due to current settings",
      "summary": "vat option unavailable due to current settings",
      "cls": "final"
    },
    "34": {
      "status": 400,
      "message": "vat option unavailable with 'not liable to sales tax' setting",
      "summary": "vat option unavailable with 'not liable to sales tax' setting",
      "cls": "final"
    },
    "36": {
      "status": 400,
      "message": "the cost location two is longer than 10 characters",
      "summary": "the cost location two is longer than 10 characters",
      "cls": "input"
    },
    "37": {
      "status": 400,
      "message": "the cost location two must consist of alphanumeric characters or be a number greater than 0",
      "summary": "the cost location two must consist of alphanumeric characters or be a number greater than 0",
      "cls": "input"
    }
  },
  "/postings/add-batch/free": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/unconfirm/transaction": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid unconfirm type specified",
      "summary": "invalid unconfirm type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "Transaction not found.",
      "summary": "transaction not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "transaction has no postings to unconfirm",
      "summary": "transaction has no postings to unconfirm",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "transaction has fixed postings that cannot be unconfirmed",
      "summary": "transaction has fixed postings that cannot be unconfirmed",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "parameter transaction_id_by_customer must be an integer",
      "summary": "parameter transaction_id_by_customer must be an integer",
      "cls": "input",
      "field": "transaction_id_by_customer"
    },
    "10": {
      "status": 400,
      "message": "parameter transaction_id_by_customer is required",
      "summary": "parameter transaction_id_by_customer is required",
      "cls": "input",
      "field": "transaction_id_by_customer"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "timeout",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/unconfirm/receipt": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid unconfirm type specified",
      "summary": "invalid unconfirm type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "Receipt not found.",
      "summary": "receipt not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "receipt has no postings to unconfirm",
      "summary": "receipt has no postings to unconfirm",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "receipt has fixed postings that cannot be unconfirmed",
      "summary": "receipt has fixed postings that cannot be unconfirmed",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "parameter receipt_id_by_customer must be an integer",
      "summary": "parameter receipt_id_by_customer must be an integer",
      "cls": "input",
      "field": "receipt_id_by_customer"
    },
    "10": {
      "status": 400,
      "message": "parameter receipt_id_by_customer is required",
      "summary": "parameter receipt_id_by_customer is required",
      "cls": "input",
      "field": "receipt_id_by_customer"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "timeout",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/unconfirm/free": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid unconfirm type specified",
      "summary": "invalid unconfirm type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "Posting not found.",
      "summary": "posting not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "Posting is not a free posting.",
      "summary": "posting is not a free posting",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "Posting is fixed and cannot be unconfirmed.",
      "summary": "posting is fixed and cannot be unconfirmed",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "parameter posting_id_by_customer must be an integer",
      "summary": "parameter posting_id_by_customer must be an integer",
      "cls": "input",
      "field": "posting_id_by_customer"
    },
    "10": {
      "status": 400,
      "message": "parameter posting_id_by_customer is required",
      "summary": "parameter posting_id_by_customer is required",
      "cls": "input",
      "field": "posting_id_by_customer"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "timeout",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/assign/receipt-to-free-posting": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid assignment type specified",
      "summary": "invalid assignment type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "receipt not found",
      "summary": "receipt not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "posting not found",
      "summary": "posting not found",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "receipt is deleted",
      "summary": "receipt is deleted",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "posting is no free posting",
      "summary": "posting is no free posting",
      "cls": "input"
    },
    "10": {
      "status": 400,
      "message": "assignment failed",
      "summary": "assignment failed",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/postings/cancel": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "Parameter posting_id_by_customer is required.",
      "summary": "parameter posting_id_by_customer is required",
      "cls": "input",
      "field": "posting_id_by_customer"
    },
    "6": {
      "status": 400,
      "message": "Parameter posting_id_by_customer must be an integer.",
      "summary": "parameter posting_id_by_customer must be an integer",
      "cls": "input",
      "field": "posting_id_by_customer"
    },
    "7": {
      "status": 400,
      "message": "Posting not found.",
      "summary": "posting not found",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "Posting cannot be cancelled.",
      "summary": "posting cannot be cancelled",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "Posting could not be cancelled.",
      "summary": "posting could not be cancelled",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/add/debtor": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid postingaccount_number specified",
      "summary": "invalid postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "8": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "9": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "10": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input"
    },
    "13": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "14": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "street"
    },
    "16": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "17": {
      "status": 400,
      "message": "invalid sales_tax_id specified",
      "summary": "invalid sales_tax_id specified",
      "cls": "input",
      "field": "sales_tax_id"
    },
    "18": {
      "status": 400,
      "message": "invalid iban specified",
      "summary": "invalid iban specified",
      "cls": "input",
      "field": "iban"
    },
    "19": {
      "status": 400,
      "message": "invalid bic specified",
      "summary": "invalid bic specified",
      "cls": "input",
      "field": "bic"
    },
    "20": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "21": {
      "status": 400,
      "message": "invalid customer_number specified",
      "summary": "invalid customer_number specified",
      "cls": "input",
      "field": "customer_number"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/add-batch/debtors": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/add/creditor": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "invalid postingaccount_number specified",
      "summary": "invalid postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "8": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "9": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "10": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input"
    },
    "13": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "14": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "street"
    },
    "16": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "17": {
      "status": 400,
      "message": "invalid sales_tax_id specified",
      "summary": "invalid sales_tax_id specified",
      "cls": "input",
      "field": "sales_tax_id"
    },
    "18": {
      "status": 400,
      "message": "invalid iban specified",
      "summary": "invalid iban specified",
      "cls": "input",
      "field": "iban"
    },
    "19": {
      "status": 400,
      "message": "invalid bic specified",
      "summary": "invalid bic specified",
      "cls": "input",
      "field": "bic"
    },
    "20": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "21": {
      "status": 400,
      "message": "invalid due in days specified",
      "summary": "invalid due in days specified",
      "cls": "input",
      "field": "due_in_days"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/add-batch/creditors": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "15": {
      "status": 403,
      "message": "adding temporarily restricted",
      "summary": "adding is temporarily restricted",
      "cls": "transient"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/add/postingaccount": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "no postingaccount_number specified",
      "summary": "no postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "6": {
      "status": 400,
      "message": "the postingaccount_number must have %min% to %max% digits",
      "summary": "the postingaccount_number must have %min% to %max% digits",
      "cls": "input"
    },
    "7": {
      "status": 400,
      "message": "postingaccount_number is out of allowed range [detailed error message]",
      "summary": "postingaccount_number is out of allowed range",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "the postingaccount_number already exists or is not available due to your settings",
      "summary": "the postingaccount_number already exists or is not available due to your settings",
      "cls": "final"
    },
    "9": {
      "status": 400,
      "message": "invalid postingaccount_number specified",
      "summary": "invalid postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "10": {
      "status": 400,
      "message": "no name specified",
      "summary": "no name specified",
      "cls": "input",
      "field": "name"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "the postingaccount name must be %min% to %max% characters long",
      "summary": "the postingaccount name must be %min% to %max% characters long",
      "cls": "input"
    },
    "13": {
      "status": 400,
      "message": "the specified name already exists",
      "summary": "the specified name already exists",
      "cls": "final"
    },
    "14": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "16": {
      "status": 400,
      "message": "no parent_postingaccount_number specified",
      "summary": "no parent_postingaccount_number specified",
      "cls": "input",
      "field": "parent_postingaccount_number"
    },
    "17": {
      "status": 400,
      "message": "the postingaccount_number must be at least %min% digits long",
      "summary": "the postingaccount_number must be at least %min% digits long",
      "cls": "input"
    },
    "18": {
      "status": 400,
      "message": "the parent_postingaccount_number is not valid or is not available due to your settings or was added manually",
      "summary": "the parent_postingaccount_number is not valid or is not available due to your settings or was added manually",
      "cls": "final"
    },
    "19": {
      "status": 400,
      "message": "invalid parent_postingaccount_number specified",
      "summary": "invalid parent_postingaccount_number specified",
      "cls": "input",
      "field": "parent_postingaccount_number"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/get/debtors": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/get/creditors": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/get/postingaccounts": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "invalid limit specified",
      "summary": "invalid limit specified",
      "cls": "input",
      "field": "limit"
    },
    "7": {
      "status": 400,
      "message": "invalid offset specified",
      "summary": "invalid offset specified",
      "cls": "input",
      "field": "offset"
    },
    "8": {
      "status": 400,
      "message": "invalid order specified",
      "summary": "invalid order specified",
      "cls": "input",
      "field": "order"
    },
    "9": {
      "status": 400,
      "message": "invalid exclude_accounts specified",
      "summary": "invalid exclude_accounts specified",
      "cls": "input",
      "field": "exclude_accounts"
    },
    "10": {
      "status": 400,
      "message": "invalid exclude_postingaccounts specified",
      "summary": "invalid exclude_postingaccounts specified",
      "cls": "input",
      "field": "exclude_postingaccounts"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid exclude_creditors specified",
      "summary": "invalid exclude_creditors specified",
      "cls": "input",
      "field": "exclude_creditors"
    },
    "13": {
      "status": 400,
      "message": "invalid exclude_debtors specified",
      "summary": "invalid exclude_debtors specified",
      "cls": "input",
      "field": "exclude_debtors"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/update/debtor": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "1": {
      "status": 400,
      "message": "wrong debtor account postingaccount_number specified",
      "summary": "wrong debtor account postingaccount_number specified",
      "cls": "input"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "9": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "10": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input"
    },
    "13": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "14": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "street"
    },
    "16": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "17": {
      "status": 400,
      "message": "invalid sales_tax_id specified",
      "summary": "invalid sales_tax_id specified",
      "cls": "input",
      "field": "sales_tax_id"
    },
    "18": {
      "status": 400,
      "message": "invalid iban specified",
      "summary": "invalid iban specified",
      "cls": "input",
      "field": "iban"
    },
    "19": {
      "status": 400,
      "message": "invalid bic specified",
      "summary": "invalid bic specified",
      "cls": "input",
      "field": "bic"
    },
    "20": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "21": {
      "status": 400,
      "message": "invalid customer_number specified",
      "summary": "invalid customer_number specified",
      "cls": "input",
      "field": "customer_number"
    },
    "24": {
      "status": 400,
      "message": "no debtor found for specified postingaccount_number",
      "summary": "no debtor found for specified postingaccount_number",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/update/creditor": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "1": {
      "status": 400,
      "message": "wrong creditor account postingaccount_number specified",
      "summary": "wrong creditor account postingaccount_number specified",
      "cls": "input"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "9": {
      "status": 400,
      "message": "invalid contact_person_name specified",
      "summary": "invalid contact_person_name specified",
      "cls": "input",
      "field": "contact_person_name"
    },
    "10": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid street specified",
      "cls": "input",
      "field": "street"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid additional_addressline specified",
      "summary": "invalid additional_addressline specified",
      "cls": "input"
    },
    "13": {
      "status": 400,
      "message": "invalid zip specified",
      "summary": "invalid zip specified",
      "cls": "input",
      "field": "zip"
    },
    "14": {
      "status": 400,
      "message": "invalid street specified",
      "summary": "invalid city specified",
      "cls": "input",
      "field": "street"
    },
    "16": {
      "status": 400,
      "message": "invalid country specified",
      "summary": "invalid country specified",
      "cls": "input",
      "field": "country"
    },
    "17": {
      "status": 400,
      "message": "invalid sales_tax_id specified",
      "summary": "invalid sales_tax_id specified",
      "cls": "input",
      "field": "sales_tax_id"
    },
    "18": {
      "status": 400,
      "message": "invalid iban specified",
      "summary": "invalid iban specified",
      "cls": "input",
      "field": "iban"
    },
    "19": {
      "status": 400,
      "message": "invalid bic specified",
      "summary": "invalid bic specified",
      "cls": "input",
      "field": "bic"
    },
    "20": {
      "status": 400,
      "message": "invalid email specified",
      "summary": "invalid email specified",
      "cls": "input",
      "field": "email"
    },
    "21": {
      "status": 400,
      "message": "invalid due in days specified",
      "summary": "invalid due in days specified",
      "cls": "input",
      "field": "due_in_days"
    },
    "24": {
      "status": 400,
      "message": "no creditor found for specified postingaccount_number",
      "summary": "no creditor found for specified postingaccount_number",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/settings/update/postingaccount": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid settings type specified",
      "summary": "invalid settings type specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "no name specified",
      "summary": "no name specified",
      "cls": "input",
      "field": "name"
    },
    "7": {
      "status": 400,
      "message": "the postingaccount name must be %min% to %max% characters long",
      "summary": "the postingaccount name must be %min% to %max% characters long",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "9": {
      "status": 400,
      "message": "wrong postingaccount_number specified",
      "summary": "wrong postingaccount_number specified",
      "cls": "input"
    },
    "10": {
      "status": 400,
      "message": "no postingaccount found for specified postingaccount_number",
      "summary": "no postingaccount found for specified postingaccount_number",
      "cls": "input"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/accounts/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/accounts/add": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "no type specified",
      "summary": "no type specified",
      "cls": "input",
      "field": "type"
    },
    "6": {
      "status": 400,
      "message": "invalid type specified",
      "summary": "invalid type specified",
      "cls": "input",
      "field": "type"
    },
    "7": {
      "status": 400,
      "message": "no name specified",
      "summary": "no name specified",
      "cls": "input",
      "field": "name"
    },
    "8": {
      "status": 400,
      "message": "the account name must be %min% to %max% characters long",
      "summary": "the account name must be %min% to %max% characters long",
      "cls": "input"
    },
    "9": {
      "status": 400,
      "message": "the specified name already exists",
      "summary": "the specified name already exists",
      "cls": "final"
    },
    "10": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "no postingaccount_number specified",
      "summary": "no postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "13": {
      "status": 400,
      "message": "the postingaccount_number must have %min% to %max% digits",
      "summary": "the booking account number must have %min% to %max% digits",
      "cls": "input"
    },
    "14": {
      "status": 400,
      "message": "postingaccount_number is out of allowed range [detailed error message]",
      "summary": "postingaccount_number is out of allowed range",
      "cls": "input"
    },
    "16": {
      "status": 400,
      "message": "the postingaccount_number already exists",
      "summary": "the postingaccount_number already exists",
      "cls": "final"
    },
    "17": {
      "status": 400,
      "message": "invalid postingaccount_number specified",
      "summary": "invalid postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "18": {
      "status": 400,
      "message": "invalid receipt_creates_transaction specified",
      "summary": "invalid receipt_creates_transaction specified",
      "cls": "input",
      "field": "receipt_creates_transaction"
    },
    "19": {
      "status": 400,
      "message": "invalid is_revision_safe specified",
      "summary": "invalid is_revision_safe specified",
      "cls": "input",
      "field": "is_revision_safe"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/comments/add": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid transaction_id_by_customer specified",
      "summary": "invalid transaction_id_by_customer specified",
      "cls": "input",
      "field": "transaction_id_by_customer"
    },
    "6": {
      "status": 400,
      "message": "invalid receipt_id_by_customer specified",
      "summary": "invalid receipt_id_by_customer specified",
      "cls": "input",
      "field": "receipt_id_by_customer"
    },
    "7": {
      "status": 400,
      "message": "only transaction_id_by_customer or receipt_id_by_customer should be specified",
      "summary": "only transaction_id_by_customer or receipt_id_by_customer should be specified",
      "cls": "input"
    },
    "8": {
      "status": 400,
      "message": "either transaction_id_by_customer or receipt_id_by_customer should be specified",
      "summary": "either transaction_id_by_customer or receipt_id_by_customer should be specified",
      "cls": "input"
    },
    "9": {
      "status": 400,
      "message": "transaction was not found",
      "summary": "transaction was not found",
      "cls": "final"
    },
    "10": {
      "status": 400,
      "message": "receipt was not found",
      "summary": "receipt was not found",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid comment_text specified",
      "summary": "invalid comment_text specified",
      "cls": "input",
      "field": "comment_text"
    },
    "13": {
      "status": 400,
      "message": "no comment_text is specified",
      "summary": "no comment text is specified",
      "cls": "input",
      "field": "comment_text"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/cost-locations/get": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid limit specified",
      "summary": "invalid limit specified",
      "cls": "input",
      "field": "limit"
    },
    "6": {
      "status": 400,
      "message": "invalid offset specified",
      "summary": "invalid offset specified",
      "cls": "input",
      "field": "offset"
    },
    "7": {
      "status": 400,
      "message": "invalid code specified",
      "summary": "invalid code specified",
      "cls": "input",
      "field": "code"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/cost-locations/add": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "invalid code specified",
      "summary": "invalid code specified",
      "cls": "input",
      "field": "code"
    },
    "6": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/cost-locations/update": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "no cost location code specified",
      "summary": "no cost location code specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "cost location was not found",
      "summary": "cost location was not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "invalid name specified",
      "summary": "invalid name specified",
      "cls": "input",
      "field": "name"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/cost-locations/delete": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "5": {
      "status": 400,
      "message": "no cost location code specified",
      "summary": "no cost location code specified",
      "cls": "input"
    },
    "6": {
      "status": 400,
      "message": "cost location was not found",
      "summary": "cost location was not found",
      "cls": "final"
    },
    "7": {
      "status": 400,
      "message": "cost location may not be deleted",
      "summary": "cost location may not be deleted",
      "cls": "final"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/reports/create/bwa": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "6": {
      "status": 400,
      "message": "invalid date_from specified",
      "summary": "invalid date_from specified",
      "cls": "input",
      "field": "date_from"
    },
    "7": {
      "status": 400,
      "message": "invalid date_to specified",
      "summary": "invalid date_to specified",
      "cls": "input",
      "field": "date_to"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "report generation already in progress",
      "summary": "report generation already in progress",
      "cls": "special"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/reports/create/sums": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "6": {
      "status": 400,
      "message": "invalid date_from specified",
      "summary": "invalid date_from specified",
      "cls": "input",
      "field": "date_from"
    },
    "7": {
      "status": 400,
      "message": "invalid date_to specified",
      "summary": "invalid date_to specified",
      "cls": "input",
      "field": "date_to"
    },
    "8": {
      "status": 400,
      "message": "invalid base specified",
      "summary": "invalid base specified",
      "cls": "input",
      "field": "base"
    },
    "9": {
      "status": 400,
      "message": "invalid file_pdf specified",
      "summary": "invalid file_pdf specified",
      "cls": "input",
      "field": "file_pdf"
    },
    "10": {
      "status": 400,
      "message": "invalid file_csv specified",
      "summary": "invalid file_csv specified",
      "cls": "input",
      "field": "file_csv"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "report generation already in progress",
      "summary": "report generation already in progress",
      "cls": "special"
    },
    "13": {
      "status": 400,
      "message": "invalid archive_export specified",
      "summary": "invalid archive_export specified",
      "cls": "input",
      "field": "archive_export"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/reports/get/bwa": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "6": {
      "status": 400,
      "message": "invalid report_id_by_customer specified",
      "summary": "invalid report_id_by_customer specified",
      "cls": "input",
      "field": "report_id_by_customer"
    },
    "7": {
      "status": 400,
      "message": "report was not found",
      "summary": "report was not found",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "report generation has not been finished yet",
      "summary": "report generation has not been finished yet",
      "cls": "special"
    },
    "9": {
      "status": 400,
      "message": "invalid get_files specified",
      "summary": "invalid get_files specified",
      "cls": "input",
      "field": "get_files"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/reports/get/sums": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "6": {
      "status": 400,
      "message": "invalid report_id_by_customer specified",
      "summary": "invalid report_id_by_customer specified",
      "cls": "input",
      "field": "report_id_by_customer"
    },
    "7": {
      "status": 400,
      "message": "report was not found",
      "summary": "report was not found",
      "cls": "final"
    },
    "8": {
      "status": 400,
      "message": "report generation has not been finished yet",
      "summary": "report generation has not been finished yet",
      "cls": "special"
    },
    "9": {
      "status": 400,
      "message": "invalid get_files specified",
      "summary": "invalid get_files specified",
      "cls": "input",
      "field": "get_files"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  },
  "/reports/get/sums/ledger": {
    "0": {
      "status": 500,
      "message": "error while processing the request",
      "summary": "internal error",
      "cls": "transient"
    },
    "3": {
      "status": 401,
      "message": "API credentials unknown or invalid",
      "summary": "API credentials unknown or invalid",
      "cls": "config"
    },
    "4": {
      "status": 401,
      "message": "customer not found or invalid api client for customer or insufficient privileges",
      "summary": "customer not found or insufficient privileges",
      "cls": "config"
    },
    "10": {
      "status": 400,
      "message": "invalid postingaccount_number specified",
      "summary": "invalid postingaccount_number specified",
      "cls": "input",
      "field": "postingaccount_number"
    },
    "11": {
      "status": 403,
      "message": "customer has no active status",
      "summary": "customer has no active status",
      "cls": "config"
    },
    "12": {
      "status": 400,
      "message": "invalid date_from specified",
      "summary": "invalid date_from specified",
      "cls": "input",
      "field": "date_from"
    },
    "13": {
      "status": 400,
      "message": "invalid date_to specified",
      "summary": "invalid date_to specified",
      "cls": "input",
      "field": "date_to"
    },
    "14": {
      "status": 400,
      "message": "invalid base specified",
      "summary": "invalid base specified",
      "cls": "input",
      "field": "base"
    },
    "16": {
      "status": 400,
      "message": "postingaccount was not found",
      "summary": "postingaccount was not found",
      "cls": "final"
    },
    "23": {
      "status": 400,
      "message": "no post and files content received or declined",
      "summary": "no post and files content received or declined",
      "cls": "input"
    },
    "30": {
      "status": 504,
      "message": "a timeout occurred while processing the request",
      "summary": "timeout",
      "cls": "transient"
    }
  }
};
