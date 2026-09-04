/**
 * Image-to-PDF geometry, and the PDF itself.
 *
 * What is worth checking here: the fit arithmetic (`fitInBox`) for a wide
 * image bound by a box's width and a tall one bound by its height, the
 * millimetre-to-point conversion against the known pair 210 mm = 595.28 pt,
 * the nine — well, four here — corner cases a wrong edit to `resolvePageSize`
 * or `contentBox` would break silently, the grid-cell reading order (top row
 * first, left cell first, because PDF's y-axis grows upward and a wrong sign
 * would put the first image on the last cell), and that a byte string with no
 * PNG/JPEG signature is reported as an error rather than handed to pdf-lib to
 * throw on.
 *
 * This file breaks the split every other tool in this codebase follows: the
 * actual page-building function at the bottom imports pdf-lib and produces
 * the finished PDF, instead of leaving that to the component. It can, because
 * pdf-lib is a pure JS library with no DOM dependency — it runs identically
 * under `node --test` and in the browser, which is also what
 * `src/lib/invoice/pdf.ts` already relies on. The widget's job shrinks to
 * reading a `File` into a `Uint8Array` and turning the returned `Uint8Array`
 * into a download; nothing in this file ever sees a `File`, an `Image`, or a
 * `canvas`.
 */
import { PDFDocument, PDFImage, rgb } from "pdf-lib";

export type PageSizeId = "a4" | "letter" | "image";
export type Orientation = "portrait" | "landscape" | "auto";
export type FitMode = "contain" | "cover" | "actual";

export type PixelSize = { width: number; height: number };
export type PointSize = { width: number; height: number };
export type PointRect = { x: number; y: number; width: number; height: number };
export type GridLayout = { rows: number; cols: number };

export const PAGE_SIZE_LABELS: Record<PageSizeId, string> = {
  a4: "A4",
  letter: "Letter",
  image: "Şəklin öz ölçüsü",
};

export const ORIENTATION_LABELS: Record<Orientation, string> = {
  portrait: "Portret",
  landscape: "Albom",
  auto: "Avtomatik",
};

export const FIT_MODE_LABELS: Record<FitMode, string> = {
  contain: "Sığdır",
  cover: "Doldur",
  actual: "Əsl ölçü",
};

/* ------------------------------------------------------------------ units */

/** Points per millimetre — 1/72 inch expressed the way ISO 216 sizes below need it. */
export const POINTS_PER_MM = 2.834645;

export function mmToPoints(mm: number): number {
  return mm * POINTS_PER_MM;
}

/**
 * A4 and Letter, in points, rounded to two decimals — the same rounding
 * `src/lib/invoice/pdf.ts` already settled on for its own A4 sheet
 * (595.28 × 841.89), kept identical here so two PDFs built by this site never
 * disagree about what "A4" measures by a fraction of a point.
 */
export const FIXED_PAGE_SIZES: Record<Exclude<PageSizeId, "image">, PointSize> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

/**
 * This tool's one declared convention: an image pixel is a PDF point. Real
 * print size depends on a DPI nothing about a PNG or JPEG actually states, so
 * rather than assume 72 or 96 and call the result "actual size", the tool
 * names its own unit and applies it everywhere a pixel becomes a point —
 * here, in `"actual"` placement, and in the `"image"` page-size option.
 */
export function imageSizeInPoints(pixels: PixelSize): PointSize {
  return { width: pixels.width, height: pixels.height };
}

function swapped(size: PointSize): PointSize {
  return { width: size.height, height: size.width };
}

/**
 * The page box before anything is placed on it. `"image"` ignores
 * `orientation` outright — a page already shaped like the image it carries
 * has nothing left to orient.
 */
export function resolvePageSize(
  pageSize: PageSizeId,
  orientation: Orientation,
  firstImagePixels: PixelSize,
): PointSize {
  if (pageSize === "image") return imageSizeInPoints(firstImagePixels);

  const base = FIXED_PAGE_SIZES[pageSize];
  const wantsLandscape =
    orientation === "landscape" ||
    (orientation === "auto" && firstImagePixels.width > firstImagePixels.height);

  return wantsLandscape ? swapped(base) : base;
}

/**
 * The printable area inside a page's margin, or `null` when the margin eats
 * the whole page — a margin typo must not silently draw at a negative size,
 * it has to be refused.
 */
export function contentBox(page: PointSize, marginPt: number): PointRect | null {
  const width = page.width - marginPt * 2;
  const height = page.height - marginPt * 2;
  if (width <= 0 || height <= 0) return null;
  return { x: marginPt, y: marginPt, width, height };
}

/* -------------------------------------------------------------- placement */

/**
 * Where a `width`×`height` image lands inside a same-unit `box`, aspect ratio
 * kept, centred on both axes. `"contain"` scales by the box's tighter axis,
 * so the whole image stays visible and the looser axis gets the letterboxing
 * — a wide image ends up bound by the box's width, a tall one by its height.
 * `"cover"` scales by the looser axis instead: the image fills the box and
 * the excess overhangs it. This function never crops that overhang — the one
 * caller that uses `"cover"` (`buildImagesPdf`, always against the full page)
 * relies on a PDF viewer's own habit of not rendering content past a page's
 * boundary, which is where the excess lands. `"actual"` does not scale at
 * all; the image is drawn at its declared point size and only centred, which
 * can also overhang a small box.
 */
export function fitInBox(box: PointSize, image: PointSize, mode: FitMode): PointRect {
  if (image.width <= 0 || image.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let width: number;
  let height: number;

  if (mode === "actual") {
    width = image.width;
    height = image.height;
  } else {
    const widthRatio = box.width / image.width;
    const heightRatio = box.height / image.height;
    const scale = mode === "contain" ? Math.min(widthRatio, heightRatio) : Math.max(widthRatio, heightRatio);
    width = image.width * scale;
    height = image.height * scale;
  }

  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/** `fitInBox`, translated from "relative to the box's own corner" to absolute page coordinates. */
export function placeInBox(box: PointRect, image: PointSize, mode: FitMode): PointRect {
  const local = fitInBox({ width: box.width, height: box.height }, image, mode);
  return { x: box.x + local.x, y: box.y + local.y, width: local.width, height: local.height };
}

/**
 * `rows`×`cols` equal cells inside `box`, in reading order — left to right,
 * then top to bottom, the same order images are handed to them. PDF's y-axis
 * grows upward, so row 0 (the first row handed out) has to be the row
 * nearest the *top* of the page, i.e. the highest y — the opposite of where
 * row 0 would sit if this just counted up from `box.y`.
 */
export function gridCells(box: PointRect, layout: GridLayout, gapPt: number): PointRect[] {
  const rows = Math.max(0, Math.floor(layout.rows));
  const cols = Math.max(0, Math.floor(layout.cols));
  if (rows === 0 || cols === 0) return [];

  const cellWidth = (box.width - gapPt * (cols - 1)) / cols;
  const cellHeight = (box.height - gapPt * (rows - 1)) / rows;
  if (cellWidth <= 0 || cellHeight <= 0) return [];

  const cells: PointRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        x: box.x + col * (cellWidth + gapPt),
        y: box.y + box.height - (row + 1) * cellHeight - row * gapPt,
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return cells;
}

/** How many pages a grid of `perPage` cells needs to hold `imageCount` images. */
export function pagesNeeded(imageCount: number, perPage: number): number {
  if (imageCount <= 0 || perPage <= 0) return 0;
  return Math.ceil(imageCount / perPage);
}

/* --------------------------------------------------------------- sniffing */

export type SniffedFormat = "png" | "jpeg" | null;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Read from the file's own first bytes, never from the browser's `File.type`
 * — that string is an OS guess from a file extension, and a `.jpg` that is
 * actually something else must not reach `embedJpg`, which would rather
 * throw an opaque error than explain itself.
 */
export function sniffImageFormat(bytes: Uint8Array): SniffedFormat {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/* -------------------------------------------------------------- building */

export type SekilPdfImage = { bytes: Uint8Array; name: string };

export type SekilPdfOptions = {
  pageSize: PageSizeId;
  orientation: Orientation;
  fit: FitMode;
  marginMm: number;
  /** `null` leaves the page unfilled — a PDF viewer shows that as white paper. */
  backgroundHex: string | null;
  grid: GridLayout;
  gapMm: number;
};

export type SekilPdfResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; pageCount: number }
  | { ok: false; error: string };

/* Guards against a mistake, not real product limits — the size a page of
   embedded PNGs can grow to before a browser tab holding both the sources
   and the assembled PDF in memory starts to struggle. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES = 200;

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

/**
 * Embeds every image, lays them out one-per-page or grid-per-page, and
 * returns the finished PDF's bytes. Never throws: a bad image, an oversized
 * file, or a margin that swallows the page all come back as `{ ok: false }`
 * with an Azerbaijani sentence instead of an exception the widget would have
 * to guess the meaning of.
 */
export async function buildImagesPdf(
  images: SekilPdfImage[],
  options: SekilPdfOptions,
): Promise<SekilPdfResult> {
  if (images.length === 0) {
    return { ok: false, error: "Heç bir şəkil yoxdur: əvvəlcə şəkil əlavə et." };
  }
  if (images.length > MAX_IMAGES) {
    return { ok: false, error: `Ən çoxu ${MAX_IMAGES} şəkil bir PDF-ə yığıla bilər.` };
  }
  for (const source of images) {
    if (source.bytes.byteLength > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: `"${source.name}" həddindən böyükdür (${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB-dan çox).`,
      };
    }
  }

  const background = options.backgroundHex ? hexToRgb01(options.backgroundHex) : null;
  if (options.backgroundHex && !background) {
    return { ok: false, error: "Fon rəngi #rrggbb formatında olmalıdır." };
  }

  try {
    const doc = await PDFDocument.create();

    const embedded: { image: PDFImage; pixels: PixelSize }[] = [];
    for (const source of images) {
      const format = sniffImageFormat(source.bytes);
      if (format === null) {
        return {
          ok: false,
          error: `"${source.name}" PNG və ya JPEG deyil: yalnız bu iki format dəstəklənir.`,
        };
      }
      try {
        const image = format === "png" ? await doc.embedPng(source.bytes) : await doc.embedJpg(source.bytes);
        embedded.push({ image, pixels: { width: image.width, height: image.height } });
      } catch {
        return { ok: false, error: `"${source.name}" açıla bilmədi: fayl zədəli ola bilər.` };
      }
    }

    const firstPixels = embedded[0]!.pixels;
    const pageSize = resolvePageSize(options.pageSize, options.orientation, firstPixels);
    const marginPt = mmToPoints(Math.max(0, options.marginMm));
    const box = contentBox(pageSize, marginPt);
    if (!box) {
      return { ok: false, error: "Kənar boşluq səhifədən böyükdür: daha kiçik dəyər seç." };
    }

    const gapPt = mmToPoints(Math.max(0, options.gapMm));
    const grid: GridLayout = {
      rows: Math.max(1, Math.floor(options.grid.rows)),
      cols: Math.max(1, Math.floor(options.grid.cols)),
    };
    const perPage = grid.rows * grid.cols;

    // Computed once, against the shared content box, rather than per page:
    // a grid whose gap eats the whole box fails the same way on every page,
    // so a wrong edit here must be refused up front instead of silently
    // producing pages with no images on them.
    if (perPage > 1 && gridCells(box, grid, gapPt).length === 0) {
      return {
        ok: false,
        error: "Şəbəkə xanaları hesablana bilmədi: sətir/sütun sayını azalt və ya xanalar arası boşluğu kiçilt.",
      };
    }

    let pageCount = 0;
    for (let start = 0; start < embedded.length; start += perPage) {
      const page = doc.addPage([pageSize.width, pageSize.height]);
      pageCount += 1;

      if (background) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageSize.width,
          height: pageSize.height,
          color: rgb(background.r, background.g, background.b),
        });
      }

      const cells = perPage === 1 ? [box] : gridCells(box, grid, gapPt);
      const slice = embedded.slice(start, start + perPage);

      slice.forEach((item, index) => {
        const cell = cells[index];
        if (!cell) return;
        const rect = placeInBox(cell, item.pixels, options.fit);
        page.drawImage(item.image, rect);
      });
    }

    const saved = await doc.save();
    // A copy constructed from the ArrayLike overload rather than the raw save
    // result: pdf-lib's own .d.ts predates TypeScript's generic `Uint8Array<T>`,
    // so the bare type it declares widens to `Uint8Array<ArrayBufferLike>` here
    // — a type `Blob`'s constructor refuses. Copying through `new Uint8Array(x)`
    // allocates a fresh, concrete `ArrayBuffer` and narrows the type with it.
    return { ok: true, bytes: new Uint8Array(saved), pageCount };
  } catch {
    return { ok: false, error: "PDF qurula bilmədi: naməlum xəta baş verdi." };
  }
}
