/*
 * What is worth checking here: the millimetre-to-point conversion against
 * the known pair 210 mm = 595.28 pt, `fitInBox`'s three modes against a
 * wide-and-a-tall box/image pair (contain picks the tighter axis, cover the
 * looser one and overhangs, actual never scales), `resolvePageSize` for
 * every orientation including the `"image"` size that ignores orientation
 * outright, a margin that eats the whole page coming back `null` rather than
 * a negative box, the grid's reading order (top row, left cell, first), the
 * page count formula, a byte string with no PNG/JPEG signature reported as
 * `null` rather than handed to pdf-lib to throw on, and `buildImagesPdf`
 * itself actually producing a `%PDF` file with the right page count from a
 * real embedded image — including the grid math and the page-count formula
 * agreeing with each other.
 *
 * `buildImagesPdf` is async (pdf-lib has no synchronous API), but
 * `CheckSuite` itself has to stay synchronous — the runner in
 * `verify-tools.mts` calls `suite.checks(check)` without awaiting it. The
 * fix is the dynamic `import()` that loads this file: Node already waits for
 * a module's own top-level `await` to settle before that `import()`
 * resolves, so the async cases are run once here, at module load, and
 * `checks` below only ever reads their already-settled results.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildImagesPdf,
  contentBox,
  FIXED_PAGE_SIZES,
  fitInBox,
  gridCells,
  mmToPoints,
  pagesNeeded,
  resolvePageSize,
  sniffImageFormat,
  type SekilPdfImage,
} from "../lib/sekil-pdf";

// A real, minimal 1x1 transparent PNG — small enough to inline, real enough
// for pdf-lib's `embedPng` to accept and report a genuine 1x1 pixel size.
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const basePdfOptions = {
  pageSize: "a4" as const,
  orientation: "auto" as const,
  fit: "contain" as const,
  marginMm: 10,
  backgroundHex: null,
  grid: { rows: 1, cols: 1 },
  gapMm: 0,
};

const singleImageResult = await buildImagesPdf([{ bytes: ONE_PIXEL_PNG, name: "a.png" }], basePdfOptions);
const noImagesResult = await buildImagesPdf([], basePdfOptions);
const badImageResult = await buildImagesPdf(
  [{ bytes: new Uint8Array([1, 2, 3, 4]), name: "x.png" }],
  basePdfOptions,
);

const fiveImages: SekilPdfImage[] = Array.from({ length: 5 }, (_, index) => ({
  bytes: ONE_PIXEL_PNG,
  name: `img-${index}.png`,
}));
const gridResult = await buildImagesPdf(fiveImages, {
  ...basePdfOptions,
  marginMm: 5,
  backgroundHex: "#ffffff",
  grid: { rows: 2, cols: 2 },
  gapMm: 2,
});

export const checks: CheckSuite = (check) => {
  check(
    "sekil-pdf: 210mm/297mm round to the known A4 point pair",
    Math.round(mmToPoints(210) * 100) / 100 === FIXED_PAGE_SIZES.a4.width &&
      Math.round(mmToPoints(297) * 100) / 100 === FIXED_PAGE_SIZES.a4.height,
    `got: ${mmToPoints(210)}, ${mmToPoints(297)}`,
  );

  {
    const contain = fitInBox({ width: 100, height: 200 }, { width: 200, height: 100 }, "contain");
    check(
      "sekil-pdf: contain scales a wide image by the box's tighter (here, width) axis and centres it",
      contain.width === 100 && contain.height === 50 && contain.x === 0 && contain.y === 75,
      `got: ${JSON.stringify(contain)}`,
    );
  }

  {
    const cover = fitInBox({ width: 100, height: 100 }, { width: 200, height: 100 }, "cover");
    check(
      "sekil-pdf: cover scales by the looser axis and overhangs the box on the other one",
      cover.width === 200 && cover.height === 100 && cover.x === -50 && cover.y === 0,
      `got: ${JSON.stringify(cover)}`,
    );
  }

  {
    const actual = fitInBox({ width: 50, height: 50 }, { width: 200, height: 100 }, "actual");
    check(
      "sekil-pdf: actual never scales, only centres — even when that overhangs a small box",
      actual.width === 200 && actual.height === 100 && actual.x === -75 && actual.y === -25,
      `got: ${JSON.stringify(actual)}`,
    );
  }

  {
    const landscapeImage = { width: 400, height: 200 };
    const portraitImage = { width: 200, height: 400 };
    const portrait = resolvePageSize("a4", "portrait", landscapeImage);
    const landscape = resolvePageSize("a4", "landscape", portraitImage);
    const autoWide = resolvePageSize("a4", "auto", landscapeImage);
    const autoTall = resolvePageSize("a4", "auto", portraitImage);
    const imageSize = resolvePageSize("image", "landscape", landscapeImage);
    check(
      "sekil-pdf: page size swaps for landscape/auto-wide, stays for auto-tall, and 'image' ignores orientation",
      portrait.width < portrait.height &&
        landscape.width > landscape.height &&
        autoWide.width > autoWide.height &&
        autoTall.width < autoTall.height &&
        imageSize.width === 400 &&
        imageSize.height === 200,
      `got: ${JSON.stringify({ portrait, landscape, autoWide, autoTall, imageSize })}`,
    );
  }

  {
    const box = contentBox({ width: 100, height: 200 }, 10);
    const overflowing = contentBox({ width: 100, height: 200 }, 60);
    check(
      "sekil-pdf: contentBox shrinks by the margin on both sides, and a margin past the page's half-width returns null",
      box !== null &&
        box.x === 10 &&
        box.y === 10 &&
        box.width === 80 &&
        box.height === 180 &&
        overflowing === null,
      `got: ${JSON.stringify({ box, overflowing })}`,
    );
  }

  {
    const cells = gridCells({ x: 0, y: 0, width: 100, height: 100 }, { rows: 2, cols: 2 }, 0);
    check(
      "sekil-pdf: a 2x2 grid reads top row first, left cell first — PDF's y-axis grows upward",
      cells.length === 4 &&
        cells[0]?.x === 0 &&
        cells[0]?.y === 50 &&
        cells[1]?.x === 50 &&
        cells[1]?.y === 50 &&
        cells[2]?.x === 0 &&
        cells[2]?.y === 0 &&
        cells[3]?.x === 50 &&
        cells[3]?.y === 0,
      `got: ${JSON.stringify(cells)}`,
    );
  }

  {
    const cells = gridCells({ x: 0, y: 0, width: 100, height: 100 }, { rows: 1, cols: 2 }, 10);
    check(
      "sekil-pdf: the gap is subtracted from cell size, not added on top of the box",
      cells.length === 2 && cells[0]?.width === 45 && cells[1]?.x === 55,
      `got: ${JSON.stringify(cells)}`,
    );
  }

  check(
    "sekil-pdf: pagesNeeded rounds up and a perPage of 0 or an empty batch both give 0",
    pagesNeeded(7, 4) === 2 && pagesNeeded(8, 4) === 2 && pagesNeeded(0, 4) === 0 && pagesNeeded(5, 0) === 0,
    `got: ${pagesNeeded(7, 4)}, ${pagesNeeded(8, 4)}, ${pagesNeeded(0, 4)}, ${pagesNeeded(5, 0)}`,
  );

  check(
    "sekil-pdf: format is sniffed from the file's own bytes, and a signature-less file is null rather than a guess",
    sniffImageFormat(ONE_PIXEL_PNG) === "png" &&
      sniffImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === "jpeg" &&
      sniffImageFormat(new Uint8Array([1, 2, 3, 4])) === null,
    "PNG/JPEG signatures or the absence of one were not read correctly",
  );

  {
    const header = singleImageResult.ok
      ? Buffer.from(singleImageResult.bytes.slice(0, 4)).toString("ascii")
      : "";
    check(
      "sekil-pdf: buildImagesPdf produces a real one-page %PDF file from one embedded image",
      singleImageResult.ok === true &&
        singleImageResult.pageCount === 1 &&
        header === "%PDF" &&
        singleImageResult.bytes.length > 0,
      `got: ${JSON.stringify(singleImageResult.ok ? { pageCount: singleImageResult.pageCount, header } : singleImageResult)}`,
    );
  }

  check(
    "sekil-pdf: an empty batch and a non-image byte string both come back as errors, not thrown exceptions",
    noImagesResult.ok === false && badImageResult.ok === false,
    `got: ${JSON.stringify({ noImagesResult, badImageResult })}`,
  );

  check(
    "sekil-pdf: a 2x2 grid with 5 images spans exactly the pages pagesNeeded predicts",
    gridResult.ok === true && gridResult.pageCount === pagesNeeded(5, 4),
    `got: ${JSON.stringify(gridResult)}`,
  );
};
