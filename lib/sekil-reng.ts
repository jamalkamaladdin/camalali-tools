/**
 * Median-cut colour quantisation and the small maths built on top of it —
 * the arithmetic half of the palette extractor. Everything that touches
 * `Image`, `HTMLCanvasElement` or `getImageData` lives in
 * `sekil-reng-tool.tsx` instead, because this module has to import cleanly
 * on the server (the tool page itself is server-rendered) and in the Node
 * test runner, neither of which has a `canvas`. What stays here — splitting
 * a pixel cloud into boxes, averaging a box into a swatch, ranking swatches
 * by lightness, building the CSS block — is pure array and number work, and
 * that is exactly what the check suite pins down without ever opening a
 * browser.
 *
 * Colour conversion is not reimplemented here: `hex`/`hsl` on each swatch
 * come from `reng.ts`'s `formatHex`/`rgbToHsl`, the same functions the rest
 * of the site's colour tooling uses, so a swatch's HSL always agrees with
 * what the site's colour-conversion tool would report for the same RGB
 * triple.
 */

import { formatHex, rgbToHsl, type Hsla, type Rgba } from "./reng.js";

/** An alpha below this is treated as "not really there" — see `sampleOpaqueTriples`. */
const MIN_OPAQUE_ALPHA = 10;

/** One sampled pixel's colour, before it is grouped into a box. */
type Triple = readonly [number, number, number];

export type PaletteColor = {
  hex: string;
  rgb: Rgba;
  hsl: Hsla;
  /** 0-100, the share of *sampled* (non-transparent) pixels this swatch represents. */
  sharePercent: number;
};

/**
 * Every pixel whose alpha clears `MIN_OPAQUE_ALPHA`, as `[r, g, b]` triples.
 * A fully or near-fully transparent pixel usually carries meaningless RGB —
 * many encoders write `0,0,0` behind a transparent alpha — so counting it
 * toward the palette would report "black" for colour that was never
 * actually visible.
 */
function sampleOpaqueTriples(pixels: Uint8ClampedArray): Triple[] {
  const triples: Triple[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < MIN_OPAQUE_ALPHA) continue;
    triples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  return triples;
}

/** The channel (0=R, 1=G, 2=B) with the largest max-min spread in `box`, and that spread. */
function widestChannel(box: readonly Triple[]): { channel: 0 | 1 | 2; range: number } {
  const min: [number, number, number] = [255, 255, 255];
  const max: [number, number, number] = [0, 0, 0];
  for (const triple of box) {
    for (let c = 0; c < 3; c += 1) {
      if (triple[c] < min[c]) min[c] = triple[c];
      if (triple[c] > max[c]) max[c] = triple[c];
    }
  }
  const ranges: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  let channel: 0 | 1 | 2 = 0;
  if (ranges[1] > ranges[channel]) channel = 1;
  if (ranges[2] > ranges[channel]) channel = 2;
  return { channel, range: ranges[channel] };
}

/** The index of the box most worth splitting next, or -1 when none can be split further. */
function pickSplitCandidate(boxes: readonly Triple[][]): number {
  let bestIndex = -1;
  let bestRange = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    if (boxes[i].length < 2) continue; // a single pixel has nothing to split
    const { range } = widestChannel(boxes[i]);
    if (range > bestRange) {
      bestRange = range;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Splits `box` on its widest channel.
 *
 * The cut is made at the *value* found at the median index, not blindly at
 * the median index itself: sorting then slicing at `length / 2` can cut a
 * run of pixels that all share the exact same colour in half, scattering one
 * colour across two boxes for no reason other than where it landed in the
 * sort. Partitioning by "below the median value" vs "at or above it" keeps
 * every run of identical pixels together, which is what lets a handful of
 * genuinely distinct colours (as in a logo or an illustration, rather than a
 * photo) separate cleanly instead of blending into two impure boxes.
 *
 * Falls back to a plain count split when the value-based partition would
 * leave one side empty (e.g. a heavily skewed distribution where the median
 * value equals the minimum) — an empty box is never useful, a slightly
 * uneven one is.
 */
function splitBox(box: readonly Triple[]): [Triple[], Triple[]] {
  const { channel } = widestChannel(box);
  const sorted = [...box].sort((a, b) => a[channel] - b[channel]);
  const medianIndex = Math.floor(sorted.length / 2);
  const medianValue = sorted[medianIndex][channel];

  const below = sorted.filter((triple) => triple[channel] < medianValue);
  const atOrAbove = sorted.filter((triple) => triple[channel] >= medianValue);
  if (below.length > 0 && atOrAbove.length > 0) return [below, atOrAbove];

  return [sorted.slice(0, medianIndex), sorted.slice(medianIndex)];
}

function boxToPaletteColor(box: readonly Triple[], totalSampled: number): PaletteColor {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (const [r, g, b] of box) {
    sumR += r;
    sumG += g;
    sumB += b;
  }
  const n = box.length;
  // A swatch is a solid colour, not a translucent one — alpha is always
  // reported as fully opaque regardless of what the source pixels carried.
  const rgb: Rgba = { r: Math.round(sumR / n), g: Math.round(sumG / n), b: Math.round(sumB / n), a: 1 };

  return {
    hex: formatHex(rgb),
    rgb,
    hsl: rgbToHsl(rgb),
    sharePercent: (100 * n) / totalSampled,
  };
}

/**
 * Median-cut palette extraction: repeatedly splits the widest box until
 * `count` boxes exist (or no box can be split further), then turns each
 * final box into one swatch.
 *
 * Frequency-counting the N most common exact colours was the other obvious
 * approach and was rejected: a photo rarely repeats one 24-bit value often
 * enough for that to work, and near-duplicate shades (a sky rendered in a
 * thousand adjacent blues) would crowd out a visually distinct but less
 * common colour entirely. Splitting on the widest channel instead groups
 * "the reds" and "the blues" as regions of colour space rather than exact
 * values — the same idea most real palette tools, including some OS colour
 * pickers, are built on.
 *
 * Returns fewer than `count` swatches when the image does not have that many
 * distinct colours to offer — never a crash, never a loop that spins forever
 * trying to split a box that cannot be split.
 */
export function extractPalette(pixels: Uint8ClampedArray, count: number): PaletteColor[] {
  const targetCount = Math.max(1, Math.floor(count));
  const triples = sampleOpaqueTriples(pixels);
  if (triples.length === 0) return [];

  const boxes: Triple[][] = [triples];
  while (boxes.length < targetCount) {
    const candidateIndex = pickSplitCandidate(boxes);
    if (candidateIndex === -1) break; // every remaining box is a single colour
    const [below, atOrAbove] = splitBox(boxes[candidateIndex]);
    boxes.splice(candidateIndex, 1, below, atOrAbove);
  }

  const total = triples.length;
  const swatches = boxes.map((box) => boxToPaletteColor(box, total));
  swatches.sort((a, b) => b.sharePercent - a.sharePercent);
  return swatches;
}

/**
 * The mean colour of every sampled pixel, as one `Rgba`. Near-transparent
 * pixels (alpha below `MIN_OPAQUE_ALPHA`) are excluded, the same threshold
 * `extractPalette` uses, so a mostly-transparent image's average is not
 * dragged toward whatever RGB an encoder happened to leave behind fully
 * transparent pixels. Alpha is reported as fully opaque — an "average
 * colour" swatch is meant to be looked at as a solid fill, not blended
 * again against whatever sits behind it.
 */
export function averageColor(pixels: Uint8ClampedArray): Rgba {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < MIN_OPAQUE_ALPHA) continue;
    sumR += pixels[i];
    sumG += pixels[i + 1];
    sumB += pixels[i + 2];
    count += 1;
  }
  if (count === 0) return { r: 0, g: 0, b: 0, a: 1 };
  return { r: Math.round(sumR / count), g: Math.round(sumG / count), b: Math.round(sumB / count), a: 1 };
}

/**
 * The lightest and darkest swatch in `palette`, by HSL lightness. Throws
 * rather than returning `undefined`-shaped data on an empty palette — a
 * caller that ignored an empty `extractPalette` result deserves a clear
 * failure here, not a silent `undefined.hex` two components downstream.
 */
export function lightestAndDarkest(palette: readonly PaletteColor[]): {
  lightest: PaletteColor;
  darkest: PaletteColor;
} {
  if (palette.length === 0) {
    throw new Error("lightestAndDarkest: empty palette (extractPalette returned no swatches to rank).");
  }

  let lightest = palette[0];
  let darkest = palette[0];
  for (const color of palette) {
    if (color.hsl.l > lightest.hsl.l) lightest = color;
    if (color.hsl.l < darkest.hsl.l) darkest = color;
  }
  return { lightest, darkest };
}

/**
 * A ready-to-paste `:root { --palette-N: #hex; }` block, one line per
 * swatch in the order given — callers are expected to hand this the
 * already-`sharePercent`-sorted output of `extractPalette`, so `--palette-1`
 * is always the most dominant colour.
 */
export function buildCssVariableBlock(palette: readonly PaletteColor[]): string {
  const lines = palette.map((color, index) => `  --palette-${index + 1}: ${color.hex};`);
  return [":root {", ...lines, "}"].join("\n");
}
