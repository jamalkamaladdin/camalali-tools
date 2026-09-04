/**
 * Watermark and page-number placement, and the PDF edit itself.
 *
 * What is worth checking here: the nine anchor points against known page
 * dimensions (a corner pulled inward by the margin, an edge midpoint that
 * ignores the margin on its long axis, `"center"` that ignores margin
 * entirely), the rotated-text centring formula at 0 degrees and at a turned
 * angle where sine and cosine actually differ from 0/1, the three
 * page-number formats against known strings, the "skip the first page" rule
 * not shifting every later page's number, and a `1,3,5-9` range parser that
 * drops what it cannot parse instead of throwing on it.
 *
 * Like `sekil-pdf.ts`, this file keeps the actual pdf-lib call at the bottom
 * rather than pushing it into the component: pdf-lib has no DOM dependency,
 * so the edit itself runs the same way under `node --test` as it does in the
 * browser. The one thing that differs between the two runtimes is where the
 * Inter font bytes come from — `applyWatermarkAndPageNumbers` takes them as
 * an optional argument for exactly that reason, the same shape
 * `src/lib/invoice/pdf.ts` already uses for its own font.
 *
 * The schwa, the dotless/dotted i pair and a few other Azerbaijani letters
 * are not in pdf-lib's built-in Helvetica — it is a WinAnsi face — so
 * drawing watermark or page-number text with `StandardFonts` would either
 * throw or drop a letter. The Inter subset already shipped for the invoice
 * tool carries them, so this tool embeds the same file instead of inventing
 * a second font strategy.
 */
import fontkit from "@pdf-lib/fontkit";
import { degrees, EncryptedPDFError, PDFDocument, PDFFont, rgb } from "pdf-lib";

export type NinePosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const NINE_POSITIONS: NinePosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const NINE_POSITION_LABELS: Record<NinePosition, string> = {
  "top-left": "Yuxarı sol",
  "top-center": "Yuxarı orta",
  "top-right": "Yuxarı sağ",
  "middle-left": "Orta sol",
  center: "Mərkəz",
  "middle-right": "Orta sağ",
  "bottom-left": "Aşağı sol",
  "bottom-center": "Aşağı orta",
  "bottom-right": "Aşağı sağ",
};

export type PageNumberFormat = "n" | "n-of-total" | "sehife-n";

export const PAGE_NUMBER_FORMAT_LABELS: Record<PageNumberFormat, string> = {
  n: "1",
  "n-of-total": "1/12",
  "sehife-n": "Səhifə 1",
};

export type PointSize = { width: number; height: number };
export type Point = { x: number; y: number };
export type TextBox = { width: number; height: number };

/* ------------------------------------------------------------------ anchor */

/**
 * The point a watermark or a page number anchors to, before text centring is
 * applied. `"center"` ignores `marginPt` outright — pulling the middle of a
 * rectangle inward by a margin would not be the middle anymore. Every edge
 * or corner position is pulled inward by the margin on the axis it touches;
 * the axis it does not touch (the vertical axis of `"top-center"`, say) sits
 * at the page's own midpoint, margin or not.
 */
export function anchorPoint(page: PointSize, position: NinePosition, marginPt: number): Point {
  if (position === "center") {
    return { x: page.width / 2, y: page.height / 2 };
  }

  const [vertical, horizontal] = position.split("-") as [string, string];

  const x =
    horizontal === "left" ? marginPt : horizontal === "right" ? page.width - marginPt : page.width / 2;
  const y =
    vertical === "top" ? page.height - marginPt : vertical === "bottom" ? marginPt : page.height / 2;

  return { x, y };
}

/* -------------------------------------------------------------- rotation */

/**
 * pdf-lib's `drawText` places a glyph run's baseline-start at `(x, y)` and
 * rotates the whole run counter-clockwise around that same point — it has no
 * idea where the run's visual centre ends up. To make rotated text sit
 * centred on `anchor` at any angle, the origin has to be solved backwards:
 * take the run's centre in its own unrotated frame (half its measured width,
 * half its size above the baseline — descenders are ignored on purpose, a
 * trade a one-line watermark can afford), rotate that offset by the same
 * angle, and subtract it from the anchor so the rotation lands the centre
 * back on the anchor rather than beside it.
 */
export function centeredTextOrigin(anchor: Point, size: TextBox, angleDegrees: number): Point {
  const radians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const localX = size.width / 2;
  const localY = size.height / 2;

  const rotatedX = localX * cos - localY * sin;
  const rotatedY = localX * sin + localY * cos;

  return { x: anchor.x - rotatedX, y: anchor.y - rotatedY };
}

/* ------------------------------------------------------------ page numbers */

export function formatPageNumber(displayNumber: number, total: number, format: PageNumberFormat): string {
  switch (format) {
    case "n":
      return `${displayNumber}`;
    case "n-of-total":
      return `${displayNumber}/${total}`;
    case "sehife-n":
      return `Səhifə ${displayNumber}`;
  }
}

/**
 * `null` means "draw nothing on this page" — the one legal way to skip a
 * cover page's number. Skipping page 0 does not shift every later page's
 * number: page index 1 still shows `startNumber`, not `startNumber + 1`, so
 * the visible sequence on the printed pages is still 1, 2, 3...
 */
export function displayNumberFor(
  pageIndex: number,
  startNumber: number,
  skipFirst: boolean,
): number | null {
  if (skipFirst && pageIndex === 0) return null;
  const offset = skipFirst ? pageIndex - 1 : pageIndex;
  return startNumber + offset;
}

/* --------------------------------------------------------- page selection */

/**
 * `"1,3,5-9"` maps to `{1,3,5,6,7,8,9}`. A range typed backwards (`"9-5"`) is
 * read the way it was meant, and a page number outside `1..totalPages` — or
 * a token that is not a number or a range at all — is dropped rather than
 * thrown: a visitor pasting a range while still editing it should see the
 * valid part apply, not the whole tool refuse the input.
 */
export function parsePageSelection(text: string, totalPages: number): Set<number> {
  const result = new Set<number>();

  for (const rawToken of text.split(",")) {
    const token = rawToken.trim();
    if (token === "") continue;

    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      const [start, end] = a <= b ? [a, b] : [b, a];
      for (let page = start; page <= end; page++) {
        if (page >= 1 && page <= totalPages) result.add(page);
      }
      continue;
    }

    if (/^\d+$/.test(token)) {
      const page = Number(token);
      if (page >= 1 && page <= totalPages) result.add(page);
    }
  }

  return result;
}

export type PageSelection = "all" | Set<number>;

/** `pageIndex` is 0-based; the selection (from `parsePageSelection`) is 1-based, the page numbers a visitor actually reads. */
export function shouldApplyToPage(pageIndex: number, selection: PageSelection): boolean {
  return selection === "all" || selection.has(pageIndex + 1);
}

/* -------------------------------------------------------------- building */

export type WatermarkOptions = {
  text: string;
  sizePt: number;
  colorHex: string;
  opacityPercent: number;
  angleDegrees: number;
  position: NinePosition;
  marginPt: number;
  pages: PageSelection;
};

export type PageNumberOptions = {
  format: PageNumberFormat;
  position: NinePosition;
  startNumber: number;
  marginPt: number;
  skipFirst: boolean;
};

export type PdfNisanOptions = {
  watermark: WatermarkOptions | null;
  pageNumber: PageNumberOptions | null;
};

export type PdfNisanResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; pageCount: number }
  | { ok: false; error: string };

const FONT_URL = "/fonts/inter-regular.ttf";
const PAGE_NUMBER_SIZE_PT = 10;

/* A guard against a mistaken upload, not a real product limit — the same
   figure `src/lib/tools/pdf-birlesdir.ts` and `pdf-bol.ts` settled on for a
   single PDF a browser tab should hold in memory at once. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

type LoadResult = { ok: true; doc: PDFDocument } | { ok: false; error: string };

/**
 * Every entry point below opens a document through this one function, so a
 * password-protected file is told apart from an actually-corrupt one in
 * exactly one place — the same split `pdf-birlesdir.ts` and `pdf-bol.ts` use
 * for the same reason. pdf-lib refuses to parse an encrypted document unless
 * told to ignore that, and it cannot write one back out even then, so this
 * never sets that flag.
 */
async function loadPdf(bytes: Uint8Array): Promise<LoadResult> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return { ok: true, doc };
  } catch (cause) {
    if (cause instanceof EncryptedPDFError) {
      return {
        ok: false,
        error: "Bu PDF şifrələnib: əvvəlcə şifrəni aç (məsələn Acrobat-da), sonra bura yüklə.",
      };
    }
    return { ok: false, error: "Fayl PDF kimi açılmadı: zədəli və ya dəstəklənməyən formatdadır." };
  }
}

export type PdfInspection = { ok: true; pageCount: number } | { ok: false; error: string };

/** What the widget shows right after a file is picked, before any watermark or page-number setting is touched. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, error: `Fayl ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB həddini aşır.` };
  }
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return loaded;
  return { ok: true, pageCount: loaded.doc.getPageCount() };
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

let fontBytesCache: Promise<Uint8Array> | null = null;

/** Fetched once per page load, mirroring `loadFonts` in `src/lib/invoice/pdf.ts` — a second click reuses the bytes instead of downloading again. */
function loadFontBytes(): Promise<Uint8Array> {
  if (!fontBytesCache) {
    fontBytesCache = fetch(FONT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Font fetch failed: ${FONT_URL} (${response.status})`);
        return response.arrayBuffer();
      })
      .then((buffer) => new Uint8Array(buffer))
      .catch((error: unknown) => {
        fontBytesCache = null;
        throw error;
      });
  }
  return fontBytesCache;
}

/**
 * Loads a PDF, draws the watermark and/or the page numbers onto its pages,
 * and returns the finished bytes. Never throws: an encrypted file, a file
 * that is not a PDF at all, a bad colour, or a request with nothing turned
 * on all come back as `{ ok: false }` with an Azerbaijani sentence.
 *
 * `fontBytes` exists for the test suite: in the browser the face is fetched
 * from `/fonts/inter-regular.ttf`, in Node it is read from disk and handed
 * in directly, the same split `buildInvoicePdf` uses for its own font.
 */
export async function applyWatermarkAndPageNumbers(
  sourceBytes: Uint8Array,
  options: PdfNisanOptions,
  fontBytes?: Uint8Array,
): Promise<PdfNisanResult> {
  const watermarkText = options.watermark?.text.trim() ?? "";
  const hasWatermark = options.watermark !== null && watermarkText !== "";
  const hasPageNumber = options.pageNumber !== null;

  if (!hasWatermark && !hasPageNumber) {
    return {
      ok: false,
      error: "Nə su nişanı mətni, nə də səhifə nömrəsi aktivdir: heç nə tətbiq olunmadı.",
    };
  }

  if (sourceBytes.byteLength === 0) {
    return { ok: false, error: "Boş fayl, bir PDF seç." };
  }
  if (sourceBytes.byteLength > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: `Fayl həddindən böyükdür (${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB-dan çox).`,
    };
  }

  const watermarkColor = options.watermark ? hexToRgb01(options.watermark.colorHex) : null;
  if (hasWatermark && !watermarkColor) {
    return { ok: false, error: "Su nişanının rəngi #rrggbb formatında olmalıdır." };
  }

  const loaded = await loadPdf(sourceBytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  try {
    const pages = doc.getPages();
    const pageCount = pages.length;
    if (pageCount === 0) {
      return { ok: false, error: "Bu PDF-də səhifə yoxdur." };
    }

    const bytes = fontBytes ?? (await loadFontBytes());
    doc.registerFontkit(fontkit);
    const font: PDFFont = await doc.embedFont(bytes, { subset: true });

    pages.forEach((page, index) => {
      const size = { width: page.getWidth(), height: page.getHeight() };

      if (hasWatermark && watermarkColor && shouldApplyToPage(index, options.watermark!.pages)) {
        const watermark = options.watermark!;
        const anchor = anchorPoint(size, watermark.position, watermark.marginPt);
        const textWidth = font.widthOfTextAtSize(watermarkText, watermark.sizePt);
        const textHeight = font.heightAtSize(watermark.sizePt);
        const origin = centeredTextOrigin(
          anchor,
          { width: textWidth, height: textHeight },
          watermark.angleDegrees,
        );

        page.drawText(watermarkText, {
          x: origin.x,
          y: origin.y,
          size: watermark.sizePt,
          font,
          color: rgb(watermarkColor.r, watermarkColor.g, watermarkColor.b),
          opacity: Math.min(100, Math.max(0, watermark.opacityPercent)) / 100,
          rotate: degrees(watermark.angleDegrees),
        });
      }

      if (hasPageNumber) {
        const pageNumber = options.pageNumber!;
        const display = displayNumberFor(index, pageNumber.startNumber, pageNumber.skipFirst);
        if (display !== null) {
          const text = formatPageNumber(display, pageCount, pageNumber.format);
          const anchor = anchorPoint(size, pageNumber.position, pageNumber.marginPt);
          const textWidth = font.widthOfTextAtSize(text, PAGE_NUMBER_SIZE_PT);
          const textHeight = font.heightAtSize(PAGE_NUMBER_SIZE_PT);
          const origin = centeredTextOrigin(anchor, { width: textWidth, height: textHeight }, 0);

          page.drawText(text, {
            x: origin.x,
            y: origin.y,
            size: PAGE_NUMBER_SIZE_PT,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }
    });

    const finished = await doc.save();
    // A copy constructed from the ArrayLike overload rather than the raw save
    // result: pdf-lib's own .d.ts predates TypeScript's generic `Uint8Array<T>`,
    // so the bare type it declares widens to `Uint8Array<ArrayBufferLike>` here
    // — a type `Blob`'s constructor refuses. Copying through `new Uint8Array(x)`
    // allocates a fresh, concrete `ArrayBuffer` and narrows the type with it.
    return { ok: true, bytes: new Uint8Array(finished), pageCount };
  } catch {
    return { ok: false, error: "Su nişanı və ya səhifə nömrəsi tətbiq edilə bilmədi." };
  }
}
