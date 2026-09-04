/*
 * `kod-sekil.ts` is split on purpose: the layout maths is deterministic
 * arithmetic and this file pins it down. `highlightCode`'s exact token
 * boundaries are a third-party library's implementation detail, so only one
 * light smoke check touches it — the pipeline runs and returns something
 * shaped right, not an exact token pin that a harmless shiki upgrade could
 * break.
 *
 * `CheckSuite` is synchronous, so `highlightCode`'s result is computed at
 * module load time via top-level await (`.mts` is always ESM) before
 * `checks` runs — the same pattern `hmac.mts` documents.
 */
import type { CheckSuite } from "./harness.mts";
import {
  charDigitCount,
  computeCanvasDimensions,
  computeLineNumberGutterWidth,
  highlightCode,
  parseLineRanges,
  CHROME_HEIGHT_PX,
} from "../lib/kod-sekil";

function setEquals(a: Set<number>, b: number[]): boolean {
  return a.size === b.length && b.every((n) => a.has(n));
}

const highlighted = await highlightCode("const x = 1;", "typescript", "github-dark");

export const checks: CheckSuite = (check) => {
  const CHAR_WIDTH = 8;
  const GUTTER_PADDING = 10;

  // 1: a 3-line file (1 digit) vs a 150-line file (3 digits).
  const gutterShort = computeLineNumberGutterWidth(3, CHAR_WIDTH, GUTTER_PADDING);
  const gutterLong = computeLineNumberGutterWidth(150, CHAR_WIDTH, GUTTER_PADDING);
  check(
    "kod-sekil: gutter for a 150-line file is wider than a 3-line file by exactly two digit-widths",
    gutterLong - gutterShort === 2 * CHAR_WIDTH,
    `short ${gutterShort} long ${gutterLong} charWidth ${CHAR_WIDTH}`,
  );

  // 2: digit-count boundary crossings — 9→10, 99→100, 999→1000.
  const g9 = computeLineNumberGutterWidth(9, CHAR_WIDTH, GUTTER_PADDING);
  const g10 = computeLineNumberGutterWidth(10, CHAR_WIDTH, GUTTER_PADDING);
  const g99 = computeLineNumberGutterWidth(99, CHAR_WIDTH, GUTTER_PADDING);
  const g100 = computeLineNumberGutterWidth(100, CHAR_WIDTH, GUTTER_PADDING);
  const g999 = computeLineNumberGutterWidth(999, CHAR_WIDTH, GUTTER_PADDING);
  const g1000 = computeLineNumberGutterWidth(1000, CHAR_WIDTH, GUTTER_PADDING);
  check(
    "kod-sekil: gutter widens by one char-width exactly at each digit-count boundary",
    g10 - g9 === CHAR_WIDTH &&
      g100 - g99 === CHAR_WIDTH &&
      g1000 - g999 === CHAR_WIDTH &&
      g99 - g10 === 0 &&
      g999 - g100 === 0,
    `9:${g9} 10:${g10} 99:${g99} 100:${g100} 999:${g999} 1000:${g1000}`,
  );

  // 3: charDigitCount itself, at the same boundaries plus zero.
  check(
    "kod-sekil: charDigitCount counts digits, including the zero edge case",
    charDigitCount(0) === 1 &&
      charDigitCount(9) === 1 &&
      charDigitCount(10) === 2 &&
      charDigitCount(999) === 3 &&
      charDigitCount(1000) === 4,
    `0:${charDigitCount(0)} 9:${charDigitCount(9)} 10:${charDigitCount(10)} 999:${charDigitCount(999)} 1000:${charDigitCount(1000)}`,
  );

  // 4: canvas dimensions with line numbers + chrome both on vs both off.
  const base = {
    lineCount: 20,
    longestLineChars: 40,
    charWidth: CHAR_WIDTH,
    lineHeight: 21,
    fontSize: 14,
    padding: 32,
    gutterWidth: gutterLong,
  };
  const bothOn = computeCanvasDimensions({ ...base, showLineNumbers: true, showChrome: true });
  const bothOff = computeCanvasDimensions({ ...base, showLineNumbers: false, showChrome: false });
  check(
    "kod-sekil: turning line numbers and chrome off shrinks the canvas by exactly gutter width and chrome height",
    bothOn.width - bothOff.width === gutterLong &&
      bothOn.height - bothOff.height === CHROME_HEIGHT_PX,
    `on ${JSON.stringify(bothOn)} off ${JSON.stringify(bothOff)} gutter ${gutterLong} chrome ${CHROME_HEIGHT_PX}`,
  );

  // 5: height scales linearly with lineCount; width, padding and chrome stay put.
  const shortDoc = computeCanvasDimensions({ ...base, lineCount: 20, showLineNumbers: true, showChrome: true });
  const longDoc = computeCanvasDimensions({ ...base, lineCount: 40, showLineNumbers: true, showChrome: true });
  check(
    "kod-sekil: doubling lineCount grows height by exactly lineCount * lineHeight, width unchanged",
    longDoc.height - shortDoc.height === 20 * base.lineHeight && longDoc.width === shortDoc.width,
    `short ${JSON.stringify(shortDoc)} long ${JSON.stringify(longDoc)}`,
  );

  // 6: the worked example from the brief.
  check(
    "kod-sekil: parseLineRanges(\"2,4-6,9\") is exactly {2,4,5,6,9}",
    setEquals(parseLineRanges("2,4-6,9"), [2, 4, 5, 6, 9]),
    `got ${[...parseLineRanges("2,4-6,9")].sort((a, b) => a - b)}`,
  );

  // 7: blank input never throws and yields nothing.
  check(
    "kod-sekil: parseLineRanges(\"\") is empty and does not throw",
    parseLineRanges("").size === 0 && parseLineRanges("   ").size === 0,
    `got ${parseLineRanges("").size}`,
  );

  // 8: a reversed range is skipped outright, per the documented choice — not
  // read backwards and not normalised to 2-5.
  check(
    "kod-sekil: a reversed range (\"5-2\") is skipped, not read backwards",
    parseLineRanges("5-2").size === 0,
    `got ${[...parseLineRanges("5-2")]}`,
  );

  // 9: a malformed token is skipped, the valid one beside it still lands.
  check(
    "kod-sekil: a malformed token is skipped without dropping the valid one beside it",
    setEquals(parseLineRanges("abc,3"), [3]),
    `got ${[...parseLineRanges("abc,3")]}`,
  );

  // 10: zero and negative numbers are the "out of range" this function can
  // catch on its own — there is no line count to check an upper bound against.
  check(
    "kod-sekil: zero is skipped as an out-of-range line number",
    setEquals(parseLineRanges("0,3"), [3]),
    `got ${[...parseLineRanges("0,3")]}`,
  );

  // 11: a mixed spec exercises every branch — single, range, malformed,
  // reversed — in one pass.
  check(
    "kod-sekil: a mixed spec keeps only the valid single and range tokens",
    setEquals(parseLineRanges("1,5-2,abc,7-9"), [1, 7, 8, 9]),
    `got ${[...parseLineRanges("1,5-2,abc,7-9")].sort((a, b) => a - b)}`,
  );

  // 12: smoke test — the shiki pipeline runs and returns a shaped result,
  // not a pinned token boundary.
  check(
    "kod-sekil: highlightCode resolves one line with at least one coloured token",
    highlighted.length === 1 && highlighted[0].length > 0 && highlighted[0][0].content.length > 0,
    `got ${JSON.stringify(highlighted)}`,
  );
};
