/**
 * Real PDF output for the invoice.
 *
 * `window.print()` was the previous route and the browser always stamped the
 * page title and the URL into the sheet's header and footer. A print dialog
 * cannot be told to drop those, so the document is drawn here instead: pdf-lib
 * writes the page as vector text (selectable and searchable, not an image) and
 * nothing but the invoice itself ends up on the paper -- or in the metadata.
 *
 * Nothing in this file may be imported statically from a component. pdf-lib and
 * fontkit are ~330 KB of parsed JS and the two font files another ~210 KB; they
 * belong in a chunk that only downloads when the user actually asks for a PDF:
 *
 *     const { buildInvoicePdf } = await import("@/lib/invoice/pdf");
 */
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import { formatAzDate } from "@/lib/az-date";
import { calculateInvoice, type InvoiceTotals } from "./calc";
import { amountInAzWords, formatMoney, formatQuantity } from "./money";
import type { Invoice, Party } from "./types";

/* ------------------------------------------------------------------ fonts */

/**
 * Inter, the same family the site uses, cut down to Latin + Latin Extended +
 * Cyrillic + punctuation and currency signs. The full face is 325 KB per
 * weight; the subset is 107 KB and still carries every Azerbaijani letter plus
 * the manat sign (U+20BC). Regenerated with:
 *
 *   pyftsubset Inter-Regular.ttf --output-file=inter-regular.ttf \
 *     --unicodes="U+0000-00FF,U+0100-024F,U+0250-02AF,U+02B0-02FF,U+0300-036F,\
 *                 U+0400-045F,U+0490-0491,U+2000-206F,U+20A0-20BF,U+2116,\
 *                 U+2122,U+2190-2193,U+2212,U+2022,U+2026" \
 *     --layout-features="kern" --no-hinting --notdef-outline
 *
 * The standard PDF base fonts are not an option: Helvetica is WinAnsi-encoded
 * and carries no schwa (U+0259) at all, so every second word would lose a
 * letter.
 */
const FONT_URLS = {
  regular: "/fonts/inter-regular.ttf",
  semibold: "/fonts/inter-semibold.ttf",
} as const;

export type InvoiceFontBytes = {
  regular: Uint8Array;
  semibold: Uint8Array;
};

let fontCache: Promise<InvoiceFontBytes> | null = null;

async function fetchFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Şrift yüklənmədi: ${url} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Fetched once per page load, so a second download click reuses the bytes. */
function loadFonts(): Promise<InvoiceFontBytes> {
  if (!fontCache) {
    fontCache = Promise.all([
      fetchFont(FONT_URLS.regular),
      fetchFont(FONT_URLS.semibold),
    ])
      .then(([regular, semibold]) => ({ regular, semibold }))
      .catch((error: unknown) => {
        // A failed fetch must not poison every later attempt.
        fontCache = null;
        throw error;
      });
  }
  return fontCache;
}

/* ----------------------------------------------------------------- colours */

/** The values from `globals.css`, converted once. */
const INK = rgb(0x0a / 255, 0x25 / 255, 0x40 / 255); // --color-ink
const INK_MUTED = rgb(0x42 / 255, 0x54 / 255, 0x66 / 255); // --color-ink-muted
const INK_FAINT = rgb(0x87 / 255, 0x92 / 255, 0xa2 / 255); // --color-ink-faint
const LINE = rgb(0xe6 / 255, 0xeb / 255, 0xf1 / 255); // --color-line

/* ------------------------------------------------------------------ sheet */

const PAGE_WIDTH = 595.28; // A4 at 72 dpi
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 46;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_X;

/** Same columns, same order and roughly the same ratio as the screen table. */
const COL_WIDTH = {
  description: 208,
  quantity: 54,
  unit: 58,
  price: 88,
  amount: CONTENT_WIDTH - 208 - 54 - 58 - 88,
} as const;

const COL_X = {
  description: MARGIN_X,
  quantity: MARGIN_X + COL_WIDTH.description,
  unit: MARGIN_X + COL_WIDTH.description + COL_WIDTH.quantity,
  price:
    MARGIN_X + COL_WIDTH.description + COL_WIDTH.quantity + COL_WIDTH.unit,
} as const;

/** Right edge of each right-aligned numeric column. */
const COL_RIGHT = {
  quantity: COL_X.quantity + COL_WIDTH.quantity - 8,
  price: COL_X.price + COL_WIDTH.price - 8,
  amount: CONTENT_RIGHT,
} as const;

const TOTALS_WIDTH = 216;

const LABEL_SIZE = 7.5;
const LABEL_TRACKING = 0.5;

type Sheet = {
  doc: PDFDocument;
  page: PDFPage;
  /** Cursor measured from the bottom of the page, the way PDF counts. */
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  /** Whether the embedded face can actually draw a given code point. */
  supports: (codePoint: number) => boolean;
};

/* ------------------------------------------------------------------- text */

/**
 * Anything the subset cannot draw would come out as an empty .notdef box, so a
 * character outside the face (Chinese, Arabic, an emoji pasted into the note)
 * is replaced instead of silently mangled. Control characters and zero-width
 * tricks are dropped outright.
 */
function sanitize(sheet: Sheet, value: string): string {
  let out = "";
  for (const char of value.normalize("NFC")) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === 0x09) {
      out += "    ";
      continue;
    }
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;
    if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff) {
      continue;
    }
    out += sheet.supports(cp) ? char : "?";
  }
  return out;
}

function widthOf(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

/** Greedy wrap; a token wider than the box (an IBAN) is broken mid-word. */
function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (widthOf(font, candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);

      if (widthOf(font, word, size) <= maxWidth) {
        line = word;
        continue;
      }

      let chunk = "";
      for (const char of word) {
        if (chunk && widthOf(font, chunk + char, size) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

type DrawOptions = {
  x?: number;
  size?: number;
  bold?: boolean;
  color?: RGB;
  /** Right edge to align against; when set, `x` is ignored. */
  right?: number;
  tracking?: number;
};

function draw(sheet: Sheet, text: string, y: number, options: DrawOptions = {}) {
  const {
    x = MARGIN_X,
    size = 9.5,
    bold = false,
    color = INK,
    right,
    tracking = 0,
  } = options;
  if (!text) return;

  const font = bold ? sheet.bold : sheet.regular;
  const width =
    widthOf(font, text, size) + tracking * Math.max(text.length - 1, 0);

  // `drawText` has no letter-spacing option, so the Tc operator is set around
  // the call. It is part of the text state, which `drawText`'s own
  // push/popGraphicsState pair inherits but does not reset -- hence the
  // explicit return to zero afterwards.
  if (tracking) sheet.page.pushOperators(setCharacterSpacing(tracking));

  sheet.page.drawText(text, {
    x: right === undefined ? x : right - width,
    y,
    size,
    font,
    color,
  });

  if (tracking) sheet.page.pushOperators(setCharacterSpacing(0));
}

/**
 * Section labels, tracked out like the screen headers. They are written in
 * capitals at the call site rather than uppercased here: `toLocaleUpperCase`
 * needs the az-AZ locale to map dotted and dotless i correctly, and that locale
 * is exactly what some browsers are missing -- the same gap that already forced
 * hand-written date and number formatting in this project.
 */
function drawLabel(
  sheet: Sheet,
  text: string,
  y: number,
  options: { x?: number; right?: number } = {},
) {
  draw(sheet, text, y, {
    ...options,
    size: LABEL_SIZE,
    bold: true,
    color: INK_FAINT,
    tracking: LABEL_TRACKING,
  });
}

function drawRule(sheet: Sheet, y: number, from = MARGIN_X, to = CONTENT_RIGHT) {
  sheet.page.drawLine({
    start: { x: from, y },
    end: { x: to, y },
    thickness: 0.7,
    color: LINE,
  });
}

/* ------------------------------------------------------------------ pages */

function addPage(sheet: Sheet) {
  sheet.page = sheet.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  sheet.y = PAGE_HEIGHT - MARGIN_TOP;
}

/** Starts a new page when `needed` points no longer fit above the margin. */
function ensureSpace(sheet: Sheet, needed: number): boolean {
  if (sheet.y - needed >= MARGIN_BOTTOM) return false;
  addPage(sheet);
  return true;
}

/* ----------------------------------------------------------------- blocks */

function drawHeader(sheet: Sheet, invoice: Invoice) {
  const top = sheet.y;

  draw(sheet, "Hesab-faktura", top - 16, { size: 19, bold: true });

  const number = sanitize(sheet, invoice.number.trim()) || "—";
  draw(sheet, sanitize(sheet, `№ ${number} · ${formatAzDate(invoice.date)}`), top - 32, {
    size: 9.5,
    color: INK_MUTED,
  });

  if (invoice.dueDate.trim()) {
    drawLabel(sheet, "ÖDƏNİŞ TARİXİ", top - 11, { right: CONTENT_RIGHT });
    draw(sheet, sanitize(sheet, formatAzDate(invoice.dueDate)), top - 27, {
      right: CONTENT_RIGHT,
      size: 10,
      bold: true,
    });
  }

  sheet.y = top - 44;
  drawRule(sheet, sheet.y);
  sheet.y -= 22;
}

/**
 * The party block is an address block, not a label/value table: the two-column
 * version wrapped every value onto a second line at paper width. An empty entry
 * is a deliberate half-height spacer before the bank details.
 */
function partyLines(sheet: Sheet, party: Party): string[] {
  const contact = [party.phone, party.email]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" · ");
  const codes = [
    party.bankCode.trim() && `Kod ${party.bankCode.trim()}`,
    party.swift.trim() && `SWIFT ${party.swift.trim()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const identity = [
    party.taxId.trim() && `VÖEN ${party.taxId.trim()}`,
    party.address.trim(),
    contact,
  ].filter(Boolean);

  const bank = [
    party.bankName.trim(),
    party.iban.trim() && `IBAN ${party.iban.trim()}`,
    codes,
  ].filter(Boolean);

  const all = bank.length ? [...identity, "", ...bank] : identity;
  return all.map((value) => sanitize(sheet, String(value)));
}

/** Draws one party column and returns how far down the page it reached. */
function drawParty(
  sheet: Sheet,
  party: Party,
  title: string,
  x: number,
  width: number,
  top: number,
): number {
  let y = top;
  drawLabel(sheet, title, y, { x });
  y -= 14;

  const name = sanitize(sheet, party.name.trim()) || "—";
  for (const line of wrapText(sheet.bold, name, 11, width)) {
    draw(sheet, line, y, { x, size: 11, bold: true });
    y -= 14;
  }
  y -= 2;

  for (const raw of partyLines(sheet, party)) {
    if (!raw) {
      y -= 5;
      continue;
    }
    for (const line of wrapText(sheet.regular, raw, 9, width)) {
      draw(sheet, line, y, { x, size: 9, color: INK_MUTED });
      y -= 12;
    }
  }

  return y;
}

function drawParties(sheet: Sheet, invoice: Invoice) {
  const gap = 26;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const top = sheet.y;

  const left = drawParty(
    sheet,
    invoice.seller,
    "SATICI",
    MARGIN_X,
    columnWidth,
    top,
  );
  const right = drawParty(
    sheet,
    invoice.buyer,
    "ALICI",
    MARGIN_X + columnWidth + gap,
    columnWidth,
    top,
  );

  sheet.y = Math.min(left, right) - 12;
}

function drawTableHead(sheet: Sheet) {
  drawRule(sheet, sheet.y);
  const baseline = sheet.y - 11;

  drawLabel(sheet, "XİDMƏT / MAL", baseline, { x: COL_X.description });
  drawLabel(sheet, "MİQDAR", baseline, { right: COL_RIGHT.quantity });
  drawLabel(sheet, "VAHİD", baseline, { x: COL_X.unit + 4 });
  drawLabel(sheet, "QİYMƏT", baseline, { right: COL_RIGHT.price });
  drawLabel(sheet, "MƏBLƏĞ", baseline, { right: COL_RIGHT.amount });

  sheet.y -= 17;
  drawRule(sheet, sheet.y);
  sheet.y -= 6;
}

function drawItems(sheet: Sheet, invoice: Invoice, totals: InvoiceTotals) {
  drawTableHead(sheet);

  invoice.items.forEach((item, index) => {
    const description = sanitize(sheet, item.description.trim()) || "—";
    const lines = wrapText(
      sheet.regular,
      description,
      9.5,
      COL_WIDTH.description - 8,
    );
    const height = lines.length * 12 + 9;

    // A row is never split across pages, and the head repeats on the next one
    // so a long invoice still reads as a table rather than a list of numbers.
    if (ensureSpace(sheet, height + 24)) drawTableHead(sheet);

    const baseline = sheet.y - 9;
    lines.forEach((line, lineIndex) => {
      draw(sheet, line, baseline - lineIndex * 12, {
        x: COL_X.description,
        size: 9.5,
      });
    });

    draw(sheet, formatQuantity(item.quantity), baseline, {
      right: COL_RIGHT.quantity,
      size: 9.5,
    });
    draw(sheet, sanitize(sheet, item.unit), baseline, {
      x: COL_X.unit + 4,
      size: 9.5,
      color: INK_MUTED,
    });
    draw(sheet, formatMoney(item.unitPrice), baseline, {
      right: COL_RIGHT.price,
      size: 9.5,
    });
    draw(sheet, formatMoney(totals.lineTotals[index] ?? 0), baseline, {
      right: COL_RIGHT.amount,
      size: 9.5,
      bold: true,
    });

    sheet.y -= height;
    drawRule(sheet, sheet.y);
  });

  sheet.y -= 14;
}

type TotalRow = { label: string; value: string; strong?: boolean };

function totalRows(invoice: Invoice, totals: InvoiceTotals): TotalRow[] {
  const rows: TotalRow[] = [
    { label: "Cəmi", value: `${formatMoney(totals.subtotal)} ₼` },
  ];

  if (totals.discount > 0) {
    rows.push({
      label: `Endirim ${invoice.discountPercent}%`,
      value: `−${formatMoney(totals.discount)} ₼`,
    });
  }

  if (invoice.vatRate > 0) {
    rows.push({
      label: "ƏDV-siz məbləğ",
      value: `${formatMoney(totals.net)} ₼`,
    });
    rows.push({
      label: invoice.vatIncluded
        ? `ƏDV ${invoice.vatRate}% (qiymətə daxil)`
        : `ƏDV ${invoice.vatRate}%`,
      value: `${formatMoney(totals.vat)} ₼`,
    });
  }

  rows.push({
    label: "Ödəniləcək",
    value: `${formatMoney(totals.total)} ₼`,
    strong: true,
  });

  return rows;
}

function drawTotals(sheet: Sheet, invoice: Invoice, totals: InvoiceTotals) {
  const rows = totalRows(invoice, totals);
  const words = sanitize(sheet, `Yalnız ${amountInAzWords(totals.total)}.`);
  const wordLines = wrapText(sheet.regular, words, 9, CONTENT_WIDTH);

  // The totals block and the amount in words belong together; splitting them
  // across a page break is the one break that would read as a mistake.
  const needed = rows.length * 16 + 10 + wordLines.length * 12 + 12;
  ensureSpace(sheet, needed);

  const left = CONTENT_RIGHT - TOTALS_WIDTH;

  for (const row of rows) {
    if (row.strong) {
      sheet.y -= 4;
      drawRule(sheet, sheet.y, left, CONTENT_RIGHT);
      sheet.y -= 6;
    }
    const baseline = sheet.y - 10;
    draw(sheet, sanitize(sheet, row.label), baseline, {
      x: left,
      size: row.strong ? 10.5 : 9.5,
      bold: row.strong,
      color: row.strong ? INK : INK_MUTED,
    });
    draw(sheet, sanitize(sheet, row.value), baseline, {
      right: CONTENT_RIGHT,
      size: row.strong ? 10.5 : 9.5,
      bold: row.strong,
    });
    sheet.y -= row.strong ? 16 : 14;
  }

  sheet.y -= 6;
  for (const line of wordLines) {
    draw(sheet, line, sheet.y - 9, { size: 9, color: INK_MUTED });
    sheet.y -= 12;
  }
}

function drawNote(sheet: Sheet, invoice: Invoice) {
  const note = sanitize(sheet, invoice.note.trim());
  if (!note) return;

  const lines = wrapText(sheet.regular, note, 9, CONTENT_WIDTH);
  ensureSpace(sheet, lines.length * 12 + 24);

  sheet.y -= 10;
  drawRule(sheet, sheet.y);
  sheet.y -= 8;

  for (const line of lines) {
    draw(sheet, line, sheet.y - 9, { size: 9, color: INK_MUTED });
    sheet.y -= 12;
  }
}

function drawSignatures(sheet: Sheet) {
  ensureSpace(sheet, 62);

  sheet.y -= 34;
  const gap = 40;
  const width = (CONTENT_WIDTH - gap) / 2;

  (["Satıcı", "Alıcı"] as const).forEach((role, index) => {
    const x = MARGIN_X + index * (width + gap);
    drawRule(sheet, sheet.y, x, x + width);
    draw(sheet, sanitize(sheet, `${role} — imza, ad, soyad`), sheet.y - 11, {
      x,
      size: 7.5,
      color: INK_FAINT,
    });
  });

  sheet.y -= 16;
}

/* ------------------------------------------------------------------- main */

/**
 * Builds the invoice as an A4 document -- one page for a typical invoice, more
 * only when the line table needs them -- and returns the raw bytes. Turning
 * those into a download is the caller's job; this module never touches the DOM,
 * which is also what lets the test run it under `node --test`.
 *
 * `fonts` exists for that test: in the browser the two faces are fetched from
 * `/fonts/`, in Node they are read from disk and handed in.
 */
export async function buildInvoicePdf(
  invoice: Invoice,
  fonts?: InvoiceFontBytes,
): Promise<Uint8Array> {
  const bytes = fonts ?? (await loadFonts());

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // `subset: true` embeds only the glyphs actually drawn, which is what keeps a
  // one-page invoice around 30 KB instead of carrying two whole faces.
  const regular = await doc.embedFont(bytes.regular, { subset: true });
  const bold = await doc.embedFont(bytes.semibold, { subset: true });

  // Coverage is read from the face itself rather than a hard-coded range list,
  // so re-subsetting the font can never silently break a letter.
  const probe = fontkit.create(bytes.regular);
  const coverage = new Map<number, boolean>();
  const supports = (codePoint: number) => {
    let known = coverage.get(codePoint);
    if (known === undefined) {
      known = probe.hasGlyphForCodePoint(codePoint);
      coverage.set(codePoint, known);
    }
    return known;
  };

  const sheet: Sheet = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP,
    regular,
    bold,
    supports,
  };

  const totals = calculateInvoice(invoice);

  drawHeader(sheet, invoice);
  drawParties(sheet, invoice);
  drawItems(sheet, invoice, totals);
  drawTotals(sheet, invoice, totals);
  drawNote(sheet, invoice);
  drawSignatures(sheet);

  applyMetadata(doc, invoice);

  // Object streams would compress the cross-reference table a little further,
  // but they also hide the document info dictionary from anything that reads
  // the file as bytes -- including the test that proves the metadata is clean.
  return doc.save({ useObjectStreams: false });
}

/**
 * pdf-lib stamps its own name into Producer and Creator, and a viewer shows
 * both under document properties. The sheet had to carry no trace of the site,
 * and metadata is part of the sheet: those fields are blanked and the title is
 * left as a neutral description of the document.
 */
function applyMetadata(doc: PDFDocument, invoice: Invoice) {
  const number = invoice.number.trim();
  const date = invoice.date.trim();

  doc.setTitle(
    ["Hesab-faktura", number && `№ ${number}`, date].filter(Boolean).join(" "),
  );
  doc.setAuthor(invoice.seller.name.trim());
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setProducer("");
  doc.setCreator("");
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());
}

/* --------------------------------------------------------------- filename */

const TRANSLITERATION: Record<string, string> = {
  "ə": "e", // schwa
  "ğ": "g",
  "ı": "i",
  "ö": "o",
  "ş": "s",
  "ü": "u",
  "ç": "c",
};

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("az-AZ")
    .replace(/[əğıöşüç]/g, (char) => TRANSLITERATION[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `faktura-2026-14-2026-09-01.pdf` -- number first, then the invoice date, so a
 * folder of downloads sorts by document rather than by download time. Slashes
 * and non-ASCII letters are flattened: the name has to survive Windows, macOS
 * and an email attachment.
 */
export function invoicePdfFileName(invoice: Invoice): string {
  const number = slugify(invoice.number);
  const date = slugify(invoice.date) || "tarixsiz";
  return `${["faktura", number, date].filter(Boolean).join("-")}.pdf`;
}
