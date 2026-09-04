/*
 * What is worth checking here: the nine anchor points against a known page
 * (a corner pulled inward by the margin, the centre and the two mid-edge
 * axes ignoring the margin on the axis they don't touch), the rotated-text
 * centring formula at 0 degrees and at 90 degrees — where sine and cosine
 * actually swap the axes rather than leaving them alone — the three
 * page-number formats against known strings, the "skip the first page" rule
 * not shifting every later page's number, a `1,3,5-9` range parser that
 * drops what it cannot parse instead of throwing on it, and
 * `applyWatermarkAndPageNumbers` itself: a real PDF's page count staying put
 * while its content genuinely grows, a request with nothing turned on being
 * refused, and a non-PDF byte string coming back as an error rather than a
 * thrown exception.
 *
 * `applyWatermarkAndPageNumbers` is async — pdf-lib has no synchronous API —
 * but `CheckSuite` itself has to stay synchronous, since the runner in
 * `verify-tools.mts` calls `suite.checks(check)` without awaiting it. The fix
 * is the dynamic `import()` that loads this file: Node already waits for a
 * module's own top-level `await` to settle before that `import()` resolves,
 * so the async cases are run once here, at module load, and `checks` below
 * only ever reads their already-settled results.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { CheckSuite } from "./harness.mts";
import {
  anchorPoint,
  applyWatermarkAndPageNumbers,
  centeredTextOrigin,
  displayNumberFor,
  formatPageNumber,
  parsePageSelection,
  shouldApplyToPage,
} from "../lib/pdf-nisan";

const fontBytes = new Uint8Array(
  readFileSync(join(import.meta.dirname, "..", "fonts", "inter-regular.ttf")),
);

async function buildSourcePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([300, 300]);
  return new Uint8Array(await doc.save());
}

const sourceBytes = await buildSourcePdf(1);

// The watermark text deliberately carries the schwa and the dotted/capital
// İ — the exact letters `docs/alet-dalga/QELIB.md` warns are missing from
// pdf-lib's built-in Helvetica, so this integration case is the one that
// would fail if the Inter-embedding path silently regressed to the default.
const watermarkResult = await applyWatermarkAndPageNumbers(
  sourceBytes,
  {
    watermark: {
      text: "NÜMUNƏ ƏSAS İMZA",
      sizePt: 24,
      colorHex: "#888888",
      opacityPercent: 30,
      angleDegrees: 45,
      position: "center",
      marginPt: 10,
      pages: "all",
    },
    pageNumber: {
      format: "n-of-total",
      position: "bottom-center",
      startNumber: 1,
      marginPt: 20,
      skipFirst: false,
    },
  },
  fontBytes,
);

const nothingEnabledResult = await applyWatermarkAndPageNumbers(
  sourceBytes,
  { watermark: null, pageNumber: null },
  fontBytes,
);

const malformedResult = await applyWatermarkAndPageNumbers(
  new Uint8Array([1, 2, 3, 4]),
  {
    watermark: {
      text: "X",
      sizePt: 10,
      colorHex: "#000000",
      opacityPercent: 50,
      angleDegrees: 0,
      position: "center",
      marginPt: 10,
      pages: "all",
    },
    pageNumber: null,
  },
  fontBytes,
);

export const checks: CheckSuite = (check) => {
  {
    const page = { width: 200, height: 300 };
    const topLeft = anchorPoint(page, "top-left", 20);
    const bottomRight = anchorPoint(page, "bottom-right", 20);
    const center = anchorPoint(page, "center", 20);
    const topCenter = anchorPoint(page, "top-center", 20);
    const middleLeft = anchorPoint(page, "middle-left", 20);
    check(
      "pdf-nisan: a corner anchor is pulled in by the margin on both axes, center ignores it entirely, and an edge midpoint ignores it on the axis it doesn't touch",
      topLeft.x === 20 &&
        topLeft.y === 280 &&
        bottomRight.x === 180 &&
        bottomRight.y === 20 &&
        center.x === 100 &&
        center.y === 150 &&
        topCenter.x === 100 &&
        topCenter.y === 280 &&
        middleLeft.x === 20 &&
        middleLeft.y === 150,
      `got: ${JSON.stringify({ topLeft, bottomRight, center, topCenter, middleLeft })}`,
    );
  }

  {
    const anchor = { x: 100, y: 100 };
    const size = { width: 40, height: 20 };
    const flat = centeredTextOrigin(anchor, size, 0);
    check(
      "pdf-nisan: at 0 degrees the origin is simply the anchor minus half the text's width and height",
      flat.x === 80 && flat.y === 90,
      `got: ${JSON.stringify(flat)}`,
    );
  }

  {
    const anchor = { x: 100, y: 100 };
    const size = { width: 40, height: 20 };
    const turned = centeredTextOrigin(anchor, size, 90);
    check(
      "pdf-nisan: at 90 degrees the rotation swaps which half-extent moves which axis, not just recentres in place",
      Math.abs(turned.x - 110) < 1e-9 && Math.abs(turned.y - 80) < 1e-9,
      `got: ${JSON.stringify(turned)}`,
    );
  }

  check(
    "pdf-nisan: the three page-number formats match their known strings",
    formatPageNumber(3, 10, "n") === "3" &&
      formatPageNumber(3, 10, "n-of-total") === "3/10" &&
      formatPageNumber(3, 10, "sehife-n") === "Səhifə 3",
    `got: ${formatPageNumber(3, 10, "n")}, ${formatPageNumber(3, 10, "n-of-total")}, ${formatPageNumber(3, 10, "sehife-n")}`,
  );

  check(
    "pdf-nisan: skipping the first page draws nothing on it and does not shift every later page's number",
    displayNumberFor(0, 1, true) === null &&
      displayNumberFor(1, 1, true) === 1 &&
      displayNumberFor(2, 1, true) === 2 &&
      displayNumberFor(0, 1, false) === 1,
    `got: ${JSON.stringify([displayNumberFor(0, 1, true), displayNumberFor(1, 1, true), displayNumberFor(2, 1, true), displayNumberFor(0, 1, false)])}`,
  );

  {
    const selection = parsePageSelection("9-5,,2,abc,20", 10);
    check(
      "pdf-nisan: parsePageSelection normalises a backwards range, drops empty/unreadable tokens and out-of-range pages, without throwing",
      selection.size === 6 &&
        [2, 5, 6, 7, 8, 9].every((page) => selection.has(page)) &&
        !selection.has(20),
      `got: ${JSON.stringify([...selection])}`,
    );
  }

  {
    const selection = new Set([2, 3]);
    check(
      "pdf-nisan: shouldApplyToPage treats 'all' as everywhere and a selection as the 1-based pages a visitor actually typed",
      shouldApplyToPage(0, "all") === true &&
        shouldApplyToPage(0, selection) === false &&
        shouldApplyToPage(1, selection) === true,
      "the 'all' or the selection-based branch did not behave as expected",
    );
  }

  {
    const header = watermarkResult.ok
      ? Buffer.from(watermarkResult.bytes.slice(0, 4)).toString("ascii")
      : "";
    check(
      "pdf-nisan: applying a watermark with Azerbaijani letters and a page number keeps the page count and grows a real %PDF file",
      watermarkResult.ok === true &&
        watermarkResult.pageCount === 1 &&
        header === "%PDF" &&
        watermarkResult.bytes.length > sourceBytes.length,
      `got: ${JSON.stringify(watermarkResult.ok ? { pageCount: watermarkResult.pageCount, header, grew: watermarkResult.bytes.length > sourceBytes.length } : watermarkResult)}`,
    );
  }

  check(
    "pdf-nisan: a request with neither the watermark nor the page number turned on is refused, not silently a no-op",
    nothingEnabledResult.ok === false,
    `got: ${JSON.stringify(nothingEnabledResult)}`,
  );

  check(
    "pdf-nisan: a non-PDF byte string comes back as an error, not a thrown exception",
    malformedResult.ok === false,
    `got: ${JSON.stringify(malformedResult)}`,
  );
};
