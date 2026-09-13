import { describe, expect, it } from "vitest";

import {
  API_ACCEPTED_MEDIA_TYPES,
  canonicalExtension,
  DEFAULT_FILE_STEM,
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
  sniffMediaType,
  TYPE_NOT_DETECTED_MESSAGE,
} from "../../src/upload/sniff.js";

// Alle Inhalte dieser Datei sind erfunden. Es steht kein echter Beleg und kein echtes
// Geschäftsdatum darin; geprüft werden ausschließlich die ersten Bytes und Dateinamen.

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "ascii"));
}

const PDF = ascii("%PDF-1.7\n% erfundener Beleg\n");
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
const BMP = bytes(0x42, 0x4d, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00);
const TIFF_LE = bytes(0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00);
const TIFF_BE = bytes(0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08);
const XML = ascii('<?xml version="1.0" encoding="UTF-8"?><Rechnung/>');

describe("sniffMediaType", () => {
  it("erkennt jeden Typ, den die API annimmt, am Inhalt", () => {
    expect(sniffMediaType(PDF)?.mediaType).toBe("application/pdf");
    expect(sniffMediaType(JPEG)?.mediaType).toBe("image/jpeg");
    expect(sniffMediaType(PNG)?.mediaType).toBe("image/png");
    expect(sniffMediaType(BMP)?.mediaType).toBe("image/bmp");
    expect(sniffMediaType(TIFF_LE)?.mediaType).toBe("image/tiff");
    expect(sniffMediaType(TIFF_BE)?.mediaType).toBe("image/tiff");
    expect(sniffMediaType(XML)?.mediaType).toBe("application/xml");
  });

  it("liefert zu jedem Typ die kanonische Endung", () => {
    expect(sniffMediaType(PDF)?.extension).toBe("pdf");
    expect(sniffMediaType(JPEG)?.extension).toBe("jpg");
    expect(sniffMediaType(TIFF_BE)?.extension).toBe("tif");
    expect(canonicalExtension("application/xml")).toBe("xml");
  });

  it("erkennt XML hinter einer UTF-8-Bytereihenfolgemarke und nach Leerraum", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...ascii('  \n<?xml version="1.0"?><a/>')]);
    expect(sniffMediaType(withBom)?.mediaType).toBe("application/xml");
  });

  it("erkennt XML in UTF-16, beide Bytereihenfolgen", () => {
    const declaration = '<?xml version="1.0"?>';
    const little = new Uint8Array([0xff, 0xfe, ...Buffer.from(declaration, "utf16le")]);
    const bigBody: number[] = [];
    for (const char of declaration) {
      bigBody.push(0x00, char.charCodeAt(0));
    }
    const big = new Uint8Array([0xfe, 0xff, ...bigBody]);
    expect(sniffMediaType(little)?.mediaType).toBe("application/xml");
    expect(sniffMediaType(big)?.mediaType).toBe("application/xml");
  });

  it("lehnt ab, was die API nicht annimmt", () => {
    // HTML ist der gefährliche Fall: Hinter einer Adresse kann eine Anmeldeseite stehen.
    expect(sniffMediaType(ascii("<!DOCTYPE html><html><body>Anmeldung</body></html>"))).toBeNull();
    expect(sniffMediaType(ascii("<html><body/></html>"))).toBeNull();
    // ZIP, also auch docx und xlsx.
    expect(sniffMediaType(bytes(0x50, 0x4b, 0x03, 0x04, 0x00))).toBeNull();
    expect(sniffMediaType(ascii("Guten Tag, anbei die Rechnung."))).toBeNull();
    expect(sniffMediaType(new Uint8Array(0))).toBeNull();
  });

  it("erkennt kein PDF, wenn die Kennung nicht am Anfang steht", () => {
    expect(sniffMediaType(ascii("Vorsatz%PDF-1.4"))).toBeNull();
  });

  it("erkennt an einem abgeschnittenen Inhalt nichts, statt zu raten", () => {
    expect(sniffMediaType(bytes(0x89, 0x50))).toBeNull();
    expect(sniffMediaType(ascii("<?xm"))).toBeNull();
  });

  it("nennt in der Absage die Typen der API und keinen Pfad", () => {
    for (const type of API_ACCEPTED_MEDIA_TYPES) {
      expect(TYPE_NOT_DETECTED_MESSAGE).toContain(type);
    }
  });
});

describe("sanitizeFileName", () => {
  it("behält einen brauchbaren Namen samt passender Endung", () => {
    expect(sanitizeFileName("rechnung-2024-0001.pdf", "application/pdf")).toBe(
      "rechnung-2024-0001.pdf",
    );
    expect(sanitizeFileName("scan.jpeg", "image/jpeg")).toBe("scan.jpeg");
  });

  it("entfernt jeden Pfadanteil und behält nur den letzten Bestandteil", () => {
    expect(sanitizeFileName("/erfundenes/verzeichnis/rechnung.pdf", "application/pdf")).toBe(
      "rechnung.pdf",
    );
    expect(sanitizeFileName("C:\\Erfunden\\Ordner\\rechnung.pdf", "application/pdf")).toBe(
      "rechnung.pdf",
    );
    expect(sanitizeFileName("../../../etc/passwd", "application/pdf")).toBe("passwd.pdf");
  });

  it("entfernt Steuerzeichen, Bidi-Zeichen und unsichtbare Zeichen", () => {
    const tricky = "rech\u202Efdp.gnun\u200B\u0007\u00ad.pdf";
    const sanitized = sanitizeFileName(tricky, "application/pdf");
    expect(sanitized).toBe("rechfdp.gnun.pdf");
    expect(sanitized).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e]/);
  });

  it("entfernt den NTFS-Datenstromtrenner", () => {
    expect(sanitizeFileName("rechnung.pdf:zweiter-strom", "application/pdf")).toBe(
      "rechnung.pdfzweiter-strom.pdf",
    );
  });

  it("erzeugt keinen versteckten Namen und kein Verzeichniszeichen", () => {
    expect(sanitizeFileName("...", "application/pdf")).toBe(`${DEFAULT_FILE_STEM}.pdf`);
    expect(sanitizeFileName(".versteckt", "application/pdf")).toBe("versteckt.pdf");
    expect(sanitizeFileName("..", "application/pdf")).toBe(`${DEFAULT_FILE_STEM}.pdf`);
  });

  it("setzt einen Namen, wenn keiner übrig bleibt oder keiner übergeben wurde", () => {
    expect(sanitizeFileName(null, "image/png")).toBe(`${DEFAULT_FILE_STEM}.png`);
    expect(sanitizeFileName("   ", "image/png")).toBe(`${DEFAULT_FILE_STEM}.png`);
    expect(sanitizeFileName("\u200b\u200b", "image/tiff")).toBe(`${DEFAULT_FILE_STEM}.tif`);
  });

  it("hängt die Endung des erkannten Typs an, wenn sie fehlt oder nicht passt", () => {
    expect(sanitizeFileName("rechnung", "application/pdf")).toBe("rechnung.pdf");
    // Der Inhalt ist ein PDF; eine Endung, die etwas anderes behauptet, bliebe in der
    // Belegablage dauerhaft stehen.
    expect(sanitizeFileName("rechnung.exe", "application/pdf")).toBe("rechnung.exe.pdf");
    expect(sanitizeFileName("bild.png", "image/jpeg")).toBe("bild.png.jpg");
  });

  it("nimmt jede Endung an, die zum erkannten Typ gehört, und schreibt sie klein", () => {
    expect(sanitizeFileName("scan.TIFF", "image/tiff")).toBe("scan.tiff");
    expect(sanitizeFileName("scan.JPG", "image/jpeg")).toBe("scan.jpg");
  });

  it("kürzt zu lange Namen und behält die Endung", () => {
    const name = sanitizeFileName(`${"a".repeat(400)}.pdf`, "application/pdf");
    expect(name.length).toBeLessThanOrEqual(MAX_FILE_NAME_LENGTH);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("vereinheitlicht die Unicode-Form und presst Leerraum zusammen", () => {
    const decomposed = "u\u0308bergabe   beleg.pdf";
    expect(sanitizeFileName(decomposed, "application/pdf")).toBe("übergabe beleg.pdf");
  });
});

describe("XML-Erkennung an abgeschnittenen Inhalten", () => {
  it("erkennt kein XML, wenn hinter der Bytereihenfolgemarke nichts mehr steht", () => {
    // Nur die Marke, kein Zeichen dahinter.
    expect(sniffMediaType(bytes(0xff, 0xfe))).toBeNull();
    expect(sniffMediaType(bytes(0xfe, 0xff))).toBeNull();
  });

  it("erkennt kein XML, wenn das letzte Zeichen halb abgeschnitten ist", () => {
    // UTF-16 liest zwei Bytes je Zeichen; ein einzelnes übriges Byte ist kein Zeichen.
    expect(sniffMediaType(bytes(0xff, 0xfe, 0x3c))).toBeNull();
    expect(sniffMediaType(bytes(0xfe, 0xff, 0x00))).toBeNull();
  });
});

describe("sanitizeFileName, Namen ohne verwertbaren Kern", () => {
  it("setzt den Vorgabestamm, wenn nach dem Kürzen nur Punkte und Leerzeichen übrig sind", () => {
    // Ein Name, dessen erste 96 Zeichen ausschließlich aus Punkten und Leerzeichen bestehen.
    // Ohne den zweiten Auffangzweig entstünde daraus ein Dateiname, der nur aus einer Endung
    // besteht — und der ginge so an die API.
    const onlySeparators = ` ${". ".repeat(60)}a.pdf`;
    const sanitized = sanitizeFileName(onlySeparators, "application/pdf");

    expect(sanitized).toBe(`${DEFAULT_FILE_STEM}.pdf`);
    expect(sanitized.length).toBeLessThanOrEqual(MAX_FILE_NAME_LENGTH);
  });
});
