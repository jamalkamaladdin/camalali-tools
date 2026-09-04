/*
 * What is worth checking here: the greedy word-wrap against a hand-traced
 * known answer, that an explicit newline forces a break even when the
 * following word would still fit, that an over-wide single word is kept
 * whole rather than silently cut, the shrink-to-fit loop converging to an
 * exact hand-computed font size (and merging lines once it does), the
 * minFontSize floor being honoured with an honest `overflowed` flag rather
 * than an ever-shrinking font, and the gradient-angle trigonometry at the
 * two angles a sign error is most likely to swap.
 *
 * The measuring function every case below supplies is a fake, deterministic
 * stand-in for `context.measureText` — `text.length * fontSize * ratio` —
 * chosen so every expected number can be hand-computed and is not a
 * restatement of whatever the browser's font happens to render.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildOgFilename,
  fitTextToBox,
  gradientEndpoints,
  OG_PRESETS,
  ogPresetById,
  wrapTextAtSize,
  type MeasureFn,
  type OgPresetId,
} from "../lib/og-sekil";

const measure5: MeasureFn = (text, fontSize) => text.length * fontSize * 0.5;
const measure6: MeasureFn = (text, fontSize) => text.length * fontSize * 0.6;
const measureSlim: MeasureFn = (text, fontSize) => text.length * fontSize * 0.1;

export const checks: CheckSuite = (check) => {
  const greedy = wrapTextAtSize("aaa bbb ccc", 10, 40, measure5);
  check(
    "og-sekil: wrapTextAtSize breaks at the exact word the hand-traced width exceeds maxWidth",
    JSON.stringify(greedy) === JSON.stringify(["aaa bbb", "ccc"]),
    `got: ${JSON.stringify(greedy)}`,
  );

  const forced = wrapTextAtSize("line one\nline two", 10, 10000, measure5);
  check(
    "og-sekil: an explicit newline forces a break even though both lines together would still fit",
    JSON.stringify(forced) === JSON.stringify(["line one", "line two"]),
    `got: ${JSON.stringify(forced)}`,
  );

  const blankParagraph = wrapTextAtSize("a\n\nb", 10, 10000, measure5);
  check(
    "og-sekil: an empty paragraph between two newlines survives as a blank line",
    JSON.stringify(blankParagraph) === JSON.stringify(["a", "", "b"]),
    `got: ${JSON.stringify(blankParagraph)}`,
  );

  const overWide = wrapTextAtSize("supercalifragilisticexpialidocious", 10, 10, measure5);
  check(
    "og-sekil: a single word wider than maxWidth is kept whole rather than cut mid-word",
    overWide.length === 1 && overWide[0] === "supercalifragilisticexpialidocious",
    `got: ${JSON.stringify(overWide)}`,
  );

  const fitted = fitTextToBox("Salam dunya", { width: 200, height: 40 }, measure6);
  check(
    "og-sekil: fitTextToBox shrinks to the exact hand-computed font size (30) and merges into one line",
    fitted.fontSize === 30 &&
      JSON.stringify(fitted.lines) === JSON.stringify(["Salam dunya"]) &&
      fitted.overflowed === false,
    `got: ${JSON.stringify(fitted)}`,
  );

  const impossible = fitTextToBox("Salam dunya", { width: 200, height: 1 }, measure6, {
    minFontSize: 24,
  });
  check(
    "og-sekil: fitTextToBox never shrinks past minFontSize and reports overflowed when the box truly cannot fit",
    impossible.fontSize === 24 && impossible.overflowed === true,
    `got: ${JSON.stringify(impossible)}`,
  );

  const alreadyFits = fitTextToBox("Hi", { width: 1000, height: 1000 }, measureSlim);
  check(
    "og-sekil: short text that already fits keeps the maximum font size instead of shrinking needlessly",
    alreadyFits.fontSize === 96 && alreadyFits.overflowed === false,
    `got: ${JSON.stringify(alreadyFits)}`,
  );

  const horizontal = gradientEndpoints(100, 50, 0);
  check(
    "og-sekil: gradientEndpoints at 0deg is a horizontal line spanning past both edges of the box",
    Math.abs(horizontal.y0 - horizontal.y1) < 1e-9 && horizontal.x1 > horizontal.x0,
    `got: ${JSON.stringify(horizontal)}`,
  );

  const vertical = gradientEndpoints(100, 50, 90);
  check(
    "og-sekil: gradientEndpoints at 90deg is a vertical line, top to bottom",
    Math.abs(vertical.x0 - vertical.x1) < 1e-9 && vertical.y1 > vertical.y0,
    `got: ${JSON.stringify(vertical)}`,
  );

  const names = OG_PRESETS.map((preset) => buildOgFilename(preset.id));
  check(
    "og-sekil: buildOgFilename names all three presets after their real pixel dimensions",
    names.includes("og-1200x630.png") && names.includes("og-1200x600.png") && names.includes("og-1080x1080.png"),
    `got: ${JSON.stringify(names)}`,
  );

  check(
    "og-sekil: OG_PRESETS carries exactly three presets with distinct ids",
    OG_PRESETS.length === 3 && new Set(OG_PRESETS.map((p) => p.id)).size === 3,
    `got: ${JSON.stringify(OG_PRESETS)}`,
  );

  const fallback = ogPresetById("bogus" as OgPresetId);
  check(
    "og-sekil: ogPresetById falls back to the first preset for an unknown id instead of throwing",
    fallback.id === OG_PRESETS[0].id,
    `got: ${JSON.stringify(fallback)}`,
  );
};
