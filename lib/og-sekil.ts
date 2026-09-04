/**
 * Open Graph share-image builder — the pure half. Two decisions carry real
 * risk of a silent, ugly regression and both are ordinary arithmetic once the
 * one browser-only ingredient — how wide a string of text renders at a given
 * font size — is taken as a parameter instead of computed here: where a line
 * of text has to break, and how far the font size has to shrink before a
 * block of lines fits the box it was given. Neither needs a `<canvas>` to
 * reason about, which is what lets a check suite pin both down with a fake,
 * deterministic measuring function instead of a real browser.
 *
 * `og-sekil-tool.tsx` supplies the real measurer — `context.measureText` —
 * and does the one thing that has no meaning outside a browser: painting the
 * result onto a `<canvas>` and reading the pixels back out as a PNG.
 */

export type OgPresetId = "og" | "og-short" | "square";

export type OgPreset = {
  id: OgPresetId;
  label: string;
  width: number;
  height: number;
};

/**
 * `og` (1200x630) is the Open Graph spec's own recommendation and what every
 * major platform's crawler expects by default. `og-short` (1200x600) is the
 * ratio LinkedIn's card actually crops to — a 1200x630 image posted there
 * loses roughly 5% off the top and bottom, so a caller who is designing for
 * LinkedIn specifically gets the honest canvas instead of a preview that
 * lies about what survives the crop. `square` (1080x1080) is what a post
 * meant for Instagram or a square-first feed needs, sharing neither
 * dimension with the other two.
 */
export const OG_PRESETS: OgPreset[] = [
  { id: "og", label: "Open Graph (1200×630)", width: 1200, height: 630 },
  { id: "og-short", label: "LinkedIn kəsiyi (1200×600)", width: 1200, height: 600 },
  { id: "square", label: "Kvadrat (1080×1080)", width: 1080, height: 1080 },
];

export function ogPresetById(id: OgPresetId): OgPreset {
  return OG_PRESETS.find((preset) => preset.id === id) ?? OG_PRESETS[0];
}

export function buildOgFilename(presetId: OgPresetId): string {
  const preset = ogPresetById(presetId);
  return `og-${preset.width}x${preset.height}.png`;
}

/** Rendered pixel width of `text` at `fontSize` — supplied by the caller because only a browser can answer it honestly. */
export type MeasureFn = (text: string, fontSize: number) => number;

/**
 * Breaks `text` into lines that each fit `maxWidth` at `fontSize`, greedy
 * word by word. An explicit newline the visitor typed is respected as a
 * paragraph break rather than folded into the surrounding words, so a title
 * written as two intentional lines stays two lines at every font size. A
 * single word wider than `maxWidth` on its own (a long URL with no spaces,
 * say) is kept whole rather than cut mid-word — it overflows the box
 * visually, which is a visible problem the visitor notices and can fix by
 * shortening the text, unlike a silently truncated word.
 */
export function wrapTextAtSize(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: MeasureFn,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((word) => word !== "");
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (measure(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }

  return lines;
}

export type FitOptions = {
  maxFontSize?: number;
  minFontSize?: number;
  /** Line height as a multiple of font size — 1.25 is the value used throughout this site's own type scale. */
  lineHeightRatio?: number;
  /** How many pixels the font shrinks by on each failed attempt. */
  step?: number;
};

export type FitResult = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** `true` only when the box was too small even at `minFontSize` — the widget uses this to warn rather than silently clip. */
  overflowed: boolean;
};

const DEFAULT_MAX_FONT_SIZE = 96;
const DEFAULT_MIN_FONT_SIZE = 24;
const DEFAULT_LINE_HEIGHT_RATIO = 1.25;
const DEFAULT_STEP = 2;

/**
 * Wraps `text` at the largest font size (starting from `maxFontSize`) whose
 * wrapped block still fits inside `box`, stepping the size down until it
 * does or `minFontSize` is reached. The floor exists so a very long title
 * never shrinks to an unreadable sliver — past it the box is reported as
 * `overflowed` instead, which is the honest outcome a fixed-size share image
 * sometimes has no other answer for.
 */
export function fitTextToBox(
  text: string,
  box: { width: number; height: number },
  measure: MeasureFn,
  options: FitOptions = {},
): FitResult {
  const maxFontSize = options.maxFontSize ?? DEFAULT_MAX_FONT_SIZE;
  const minFontSize = options.minFontSize ?? DEFAULT_MIN_FONT_SIZE;
  const lineHeightRatio = options.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO;
  const step = options.step ?? DEFAULT_STEP;

  let fontSize = maxFontSize;
  let lines = wrapTextAtSize(text, fontSize, box.width, measure);

  const fits = (candidateLines: string[], candidateFontSize: number): boolean => {
    const lineHeight = candidateFontSize * lineHeightRatio;
    const blockHeight = candidateLines.length * lineHeight;
    if (blockHeight > box.height) return false;
    return candidateLines.every((line) => measure(line, candidateFontSize) <= box.width);
  };

  while (fontSize > minFontSize && !fits(lines, fontSize)) {
    fontSize = Math.max(minFontSize, fontSize - step);
    lines = wrapTextAtSize(text, fontSize, box.width, measure);
  }

  return {
    lines,
    fontSize,
    lineHeight: fontSize * lineHeightRatio,
    overflowed: !fits(lines, fontSize),
  };
}

export type GradientEndpoints = { x0: number; y0: number; x1: number; y1: number };

/**
 * The two points `CanvasRenderingContext2D.createLinearGradient` wants, for a
 * gradient running at `angleDegrees` (0 = left to right, 90 = top to bottom,
 * matching the CSS `linear-gradient()` convention rotated a quarter turn)
 * across a `width`x`height` box. Kept here rather than inline in the widget
 * because the trigonometry is exactly the kind of thing a sign error breaks
 * silently — the gradient still renders, just tilted the wrong way — and a
 * known-angle test catches that a canvas screenshot would not.
 */
export function gradientEndpoints(width: number, height: number, angleDegrees: number): GradientEndpoints {
  const radians = (angleDegrees * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  // Half-diagonal: the longest a gradient line across this box can be,
  // regardless of angle, so the line always spans corner to corner rather
  // than clipping short on a box that is not square.
  const half = Math.sqrt(cx * cx + cy * cy);
  const dx = Math.cos(radians) * half;
  const dy = Math.sin(radians) * half;
  return { x0: cx - dx, y0: cy - dy, x1: cx + dx, y1: cy + dy };
}
