/**
 * The PDF is the one artefact that leaves the browser, so it is checked as
 * bytes rather than by looking at it: the header, the embedded font, the text
 * that comes back out of the content stream, and the metadata that a viewer
 * shows under "document properties".
 *
 * Text extraction is done here instead of pulling in a PDF parser. pdf-lib
 * writes each string as glyph ids and ships a ToUnicode CMap next to the font,
 * which is exactly the table a reader needs to map those ids back to letters --
 * so `node:zlib` plus the CMap is enough, and no dependency is added for a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { buildInvoicePdf, invoicePdfFileName } from "../src/lib/invoice/pdf";
import { emptyParty, type Invoice, type LineItem } from "../src/lib/invoice/types";

const fonts = {
  regular: new Uint8Array(
    readFileSync(join(process.cwd(), "public/fonts/inter-regular.ttf")),
  ),
  semibold: new Uint8Array(
    readFileSync(join(process.cwd(), "public/fonts/inter-semibold.ttf")),
  ),
};

const item = (
  description: string,
  quantity: number,
  unitPrice: number,
): LineItem => ({
  id: `${description}-${quantity}`,
  description,
  unit: "ədəd",
  quantity,
  unitPrice,
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  number: "2026/14",
  date: "2026-09-01",
  dueDate: "2026-09-15",
  seller: {
    ...emptyParty(),
    name: "Camal Əliyev MMC",
    taxId: "1234567891",
    address: "Bakı, Nəsimi rayonu, Şəhriyar küçəsi 12",
    phone: "+994 77 505 44 45",
    email: "hesab@example.az",
    bankName: "Kapital Bank ASC",
    iban: "AZ21NABZ00000000137010001944",
    bankCode: "200004",
    swift: "AIIBAZ2X",
  },
  buyer: {
    ...emptyParty(),
    name: "Şəfəq Ticarət MMC",
    taxId: "9876543210",
    address: "Gəncə, Kəpəz rayonu, Ağayev küçəsi 4",
  },
  items: [item("Veb sayt hazırlanması", 1, 4500), item("Dəstək xidməti", 6, 250)],
  vatRate: 18,
  vatIncluded: false,
  discountPercent: 0,
  note: "Ödəniş 15 gün ərzində köçürülməlidir.",
  ...over,
});

/* --------------------------------------------------------- byte utilities */

const ascii = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

/**
 * Every `stream ... endstream` payload in the file, inflated when it is
 * Flate-encoded and taken raw when it is not.
 */
function streamPayloads(bytes: Uint8Array): string[] {
  const buffer = Buffer.from(bytes);
  const payloads: string[] = [];
  let cursor = 0;

  for (;;) {
    const open = buffer.indexOf("stream", cursor, "latin1");
    if (open === -1) break;

    // "endstream" also contains "stream" -- skip the matches inside it.
    if (buffer.subarray(open - 3, open + 6).toString("latin1") === "endstream") {
      cursor = open + 6;
      continue;
    }

    let start = open + "stream".length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;

    const close = buffer.indexOf("endstream", start, "latin1");
    if (close === -1) break;

    const raw = buffer.subarray(start, close);
    try {
      payloads.push(inflateSync(raw).toString("latin1"));
    } catch {
      payloads.push(raw.toString("latin1"));
    }
    cursor = close + "endstream".length;
  }

  return payloads;
}

/** glyph id -> characters, read from one ToUnicode CMap. */
function parseCMap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();

  // CMap values are UTF-16BE, so every four hex digits is one code unit.
  const decode = (hex: string) =>
    (hex.replace(/\s+/g, "").match(/.{4}/g) ?? [])
      .map((unit) => String.fromCharCode(parseInt(unit, 16)))
      .join("");

  for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const [, code, value] of block.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      map.set(parseInt(code, 16), decode(value));
    }
  }

  for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const [, lo, hi, value] of block.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      const first = parseInt(lo, 16);
      const last = parseInt(hi, 16);
      const base = decode(value);
      const tail = base.charCodeAt(base.length - 1);
      for (let code = first; code <= last; code += 1) {
        map.set(
          code,
          base.slice(0, -1) + String.fromCharCode(tail + (code - first)),
        );
      }
    }
  }

  return map;
}

/**
 * Decodes every hex-encoded string in the content streams with each CMap in the
 * file and returns the union. A page carries two subsets (regular and
 * semibold), so decoding with the wrong one produces noise -- but a phrase that
 * was really drawn always appears under its own CMap.
 */
function extractText(bytes: Uint8Array): string {
  const payloads = streamPayloads(bytes);
  const cmaps = payloads
    .filter((payload) => payload.includes("beginbfchar") || payload.includes("beginbfrange"))
    .map(parseCMap);
  const content = payloads.filter((payload) => payload.includes(" Tf"));

  assert.ok(cmaps.length > 0, "no ToUnicode CMap found in the PDF");
  assert.ok(content.length > 0, "no content stream found in the PDF");

  const chunks: string[] = [];
  for (const cmap of cmaps) {
    for (const stream of content) {
      for (const [, hex] of stream.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
        const codes = hex.replace(/\s+/g, "").match(/.{4}/g) ?? [];
        chunks.push(
          codes.map((code) => cmap.get(parseInt(code, 16)) ?? "").join(""),
        );
      }
    }
  }

  return chunks.join("\n");
}

/**
 * Reads one entry from the document info dictionary. pdf-lib writes those as
 * UTF-16BE hex strings so that a name like "Camal Aliyev" keeps its letters, so
 * both the hex and the literal form have to be understood here.
 */
function infoValue(bytes: Uint8Array, key: string): string | null {
  const text = ascii(bytes);

  const hex = new RegExp(`/${key}\\s*<([0-9a-fA-F]*)>`).exec(text);
  if (hex) {
    const units = hex[1].match(/.{4}/g) ?? [];
    return units
      .map((unit) => String.fromCharCode(parseInt(unit, 16)))
      .join("")
      .replace(/^\uFEFF/, "");
  }

  const literal = new RegExp(`/${key}\\s*\\(([^)]*)\\)`).exec(text);
  return literal ? literal[1] : null;
}

/* -------------------------------------------------------------- the tests */

test("produces a non-empty PDF file", async () => {
  const bytes = await buildInvoicePdf(invoice(), fonts);

  assert.ok(bytes.length > 0);
  assert.equal(ascii(bytes.subarray(0, 5)), "%PDF-");
  assert.ok(ascii(bytes.subarray(-1024)).includes("%%EOF"));
  // A sheet with two lines has no business being a megabyte.
  assert.ok(bytes.length < 200_000, `unexpected size: ${bytes.length}`);
});

test("embeds the font instead of referencing an installed one", async () => {
  const bytes = await buildInvoicePdf(invoice(), fonts);
  const text = ascii(bytes);

  // A composite font with the outlines inside the file: /FontFile2 is the
  // embedded TrueType program, Identity-H the two-byte glyph encoding.
  assert.match(text, /\/FontFile2/);
  assert.match(text, /\/Subtype\s*\/CIDFontType2/);
  assert.match(text, /\/Encoding\s*\/Identity-H/);
  assert.match(text, /\/BaseFont\s*\/Inter-Regular/);
  assert.match(text, /\/BaseFont\s*\/Inter-SemiBold/);
  // Both weights are embedded, each with its own ToUnicode table.
  assert.equal((text.match(/\/FontFile2/g) ?? []).length, 2);
  assert.equal((text.match(/\/ToUnicode/g) ?? []).length, 2);
});

test("Azerbaijani letters survive into the extractable text", async () => {
  const bytes = await buildInvoicePdf(invoice(), fonts);
  const text = extractText(bytes);

  for (const phrase of [
    "Ödəniləcək",
    "ƏDV",
    "Hesab-faktura",
    "SATICI",
    "ALICI",
    "XİDMƏT / MAL",
    "MƏBLƏĞ",
    "ÖDƏNİŞ TARİXİ",
    "Camal Əliyev MMC",
    "Şəfəq Ticarət MMC",
    "Veb sayt hazırlanması",
    "Bakı, Nəsimi rayonu, Şəhriyar küçəsi 12",
  ]) {
    assert.ok(text.includes(phrase), `missing from the PDF text: ${phrase}`);
  }
});

test("the calculated amounts are in the document text", async () => {
  const bytes = await buildInvoicePdf(
    invoice({ items: [item("Xidmət", 2, 50)], note: "" }),
    fonts,
  );
  const text = extractText(bytes);

  assert.ok(text.includes("100,00"), "subtotal missing");
  assert.ok(text.includes("18,00"), "VAT missing");
  assert.ok(text.includes("118,00"), "total missing");
  assert.ok(
    text.includes("Yalnız yüz on səkkiz manat."),
    "the amount in words is missing",
  );
});

test("the metadata carries no tool, site or domain name", async () => {
  const bytes = await buildInvoicePdf(invoice(), fonts);
  const text = ascii(bytes);

  assert.equal(infoValue(bytes, "Producer"), "");
  assert.equal(infoValue(bytes, "Creator"), "");
  assert.ok(!/pdf-lib/i.test(text), "pdf-lib is named in the file");
  assert.ok(!/camalali/i.test(text), "the site name is in the file");
  assert.ok(!/https?:\/\//i.test(text), "a URL is in the file");

  // Title and Author are the only populated fields, and both are neutral.
  const title = infoValue(bytes, "Title") ?? "";
  assert.ok(title.includes("Hesab-faktura"));
  assert.ok(title.includes("2026-09-01"));
});

test("the author field is empty when the seller has no name", async () => {
  const bytes = await buildInvoicePdf(
    invoice({ seller: emptyParty() }),
    fonts,
  );
  assert.equal(infoValue(bytes, "Author"), "");
});

test("a typical invoice stays on one A4 page", async () => {
  const bytes = await buildInvoicePdf(invoice(), fonts);
  const text = ascii(bytes);

  assert.equal((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length, 1);
  assert.match(text, /\/MediaBox\s*\[\s*0\s+0\s+595\.28\s+841\.89\s*\]/);
});

test("a long line table breaks onto further pages without losing text", async () => {
  const items = Array.from({ length: 60 }, (_, index) =>
    item(`Mərhələ ${index + 1} — layihələndirmə və quraşdırma işləri`, 1, 120),
  );
  const bytes = await buildInvoicePdf(invoice({ items }), fonts);
  const text = ascii(bytes);
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  assert.ok(pages > 1, "60 lines should not fit on one page");

  const extracted = extractText(bytes);
  assert.ok(extracted.includes("Mərhələ 1 "), "the first line is missing");
  assert.ok(extracted.includes("Mərhələ 60 "), "the last line is missing");
  assert.ok(extracted.includes("Ödəniləcək"), "the totals block is missing");
});

test("characters the font cannot draw are replaced, not left as blank boxes", async () => {
  const bytes = await buildInvoicePdf(
    invoice({ items: [item("Xidmət 日本語", 1, 10)], note: "" }),
    fonts,
  );
  const text = extractText(bytes);

  assert.ok(text.includes("Xidmət ???"), "unsupported letters were not replaced");
});

test("the file name is slug-safe and carries the number and the date", () => {
  assert.equal(
    invoicePdfFileName(invoice()),
    "faktura-2026-14-2026-09-01.pdf",
  );
  assert.equal(
    invoicePdfFileName(invoice({ number: "ƏLAVƏ 7/b" })),
    "faktura-elave-7-b-2026-09-01.pdf",
  );
  assert.equal(
    invoicePdfFileName(invoice({ number: "" })),
    "faktura-2026-09-01.pdf",
  );
});
