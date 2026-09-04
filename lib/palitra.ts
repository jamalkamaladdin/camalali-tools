/**
 * Colour scale generation: turning one colour into the eleven-step ramp
 * (50…950) a design system actually ships — the shape Tailwind's own default
 * palette uses, and the shape a visitor building a brand palette needs to
 * hand a designer.
 *
 * Built on OKLCH rather than HSL on purpose, for the same reason `reng.ts`
 * treats OKLCH as a first-class format: HSL's lightness is not perceptual, so
 * an HSL ramp with evenly spaced `l` values looks uneven to the eye — the
 * middle steps bunch up dark. OKLCH's `l` is built to track perceived
 * lightness, so a fixed lightness curve produces a ramp that actually reads
 * as evenly stepped. Chroma is tapered toward both ends of the curve rather
 * than held constant, because a saturated colour cannot reach very light or
 * very dark lightness without leaving the sRGB gamut — `oklchToRgb` would
 * silently clamp it back in, quietly flattening the highest and lowest steps
 * to the same dull hue. Tapering chroma keeps every step distinct.
 *
 * The curve itself (`LIGHTNESS`, `CHROMA_FACTOR`, `HUE_SHIFT`) is this tool's
 * own invention, not a published spec — there is no external "correct" ramp
 * to defer to. What the arithmetic underneath it must get right is the
 * OKLCH/sRGB round-trip, which `reng.ts` already owns and this file reuses
 * rather than reimplements, so the two never compute the same colour two
 * different ways.
 */
import {
  contrastRatio,
  formatHex,
  oklchToRgb,
  rgbToOklch,
  type Rgba,
} from "./reng";

export type PaletteStepName =
  | "50"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
  | "950";

/** Declaration order — also the row order every output format uses. */
export const PALETTE_STEPS: PaletteStepName[] = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
];

/**
 * Target OKLCH lightness per step, 0-1. Monotonically decreasing by
 * construction — a step later in `PALETTE_STEPS` is always at least as dark
 * as the one before it, which is the property the visitor actually relies on
 * (a "700" swatch that came out lighter than "600" would be a broken ramp).
 */
const LIGHTNESS: Record<PaletteStepName, number> = {
  "50": 0.98,
  "100": 0.95,
  "200": 0.9,
  "300": 0.83,
  "400": 0.74,
  "500": 0.64,
  "600": 0.54,
  "700": 0.44,
  "800": 0.34,
  "900": 0.25,
  "950": 0.18,
};

/**
 * Fraction of the base colour's chroma each step keeps. Peaks at "500" (the
 * step closest to a typical brand colour's own saturation) and tapers toward
 * both ends, which is what keeps "50" from turning into a slightly-tinted
 * white and "950" from turning into a slightly-tinted black — both would
 * otherwise be nearly indistinguishable from grey.
 */
const CHROMA_FACTOR: Record<PaletteStepName, number> = {
  "50": 0.12,
  "100": 0.28,
  "200": 0.48,
  "300": 0.68,
  "400": 0.86,
  "500": 1,
  "600": 0.96,
  "700": 0.86,
  "800": 0.7,
  "900": 0.5,
  "950": 0.32,
};

/**
 * Degrees added to the base hue per step, only when the visitor turns the
 * "hue shift" option on. A ramp with a dead-flat hue at every step reads as
 * slightly synthetic — real pigments warm up as they lighten and cool down
 * as they darken — so this is a small, deliberately asymmetric drift rather
 * than noise. Left at 0 the ramp is a pure lightness/chroma sweep of one hue.
 */
const HUE_SHIFT: Record<PaletteStepName, number> = {
  "50": -6,
  "100": -5,
  "200": -3,
  "300": -1,
  "400": 0,
  "500": 0,
  "600": 0,
  "700": 1,
  "800": 3,
  "900": 5,
  "950": 6,
};

export type PaletteOptions = {
  /** See `HUE_SHIFT` — off by default. */
  hueShift: boolean;
};

export type PaletteStep = {
  step: PaletteStepName;
  color: Rgba;
  hex: string;
  /** WCAG contrast ratio of this swatch against opaque white. */
  contrastOnWhite: number;
  /** WCAG contrast ratio of this swatch against opaque black. */
  contrastOnBlack: number;
};

export type PaletteScale = {
  baseHex: string;
  steps: PaletteStep[];
};

export type PaletteResult = { ok: true; scale: PaletteScale } | { ok: false; error: string };

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Builds the eleven-step ramp from one already-parsed colour. Takes an
 * `Rgba` rather than raw text on purpose — parsing the four colour formats is
 * `reng.ts`'s job, not this file's, so a malformed string never reaches here
 * at all; the one thing this function itself can reject is an input with no
 * defined colour at all, which does not happen for a valid `Rgba`. It is kept
 * as a `Result` rather than a bare `PaletteScale` regardless, because the
 * widget always has a "what if this fails" branch to render and a function
 * that can never fail here still documents the shape it would fail in for
 * the caller that composes it with `parseColor`.
 */
export function buildPaletteScale(base: Rgba, options: PaletteOptions): PaletteResult {
  if (!Number.isFinite(base.r) || !Number.isFinite(base.g) || !Number.isFinite(base.b)) {
    return { ok: false, error: "Baza rəngin kanalları ədəd deyil." };
  }

  const baseOklch = rgbToOklch(base);
  const steps: PaletteStep[] = PALETTE_STEPS.map((step) => {
    const l = LIGHTNESS[step];
    const c = baseOklch.c * CHROMA_FACTOR[step];
    const h = options.hueShift
      ? ((baseOklch.h + HUE_SHIFT[step]) % 360 + 360) % 360
      : baseOklch.h;
    const color = oklchToRgb({ l, c, h, a: 1 });
    return {
      step,
      color,
      hex: formatHex(color),
      contrastOnWhite: round(contrastRatio(color, WHITE), 2),
      contrastOnBlack: round(contrastRatio(color, BLACK), 2),
    };
  });

  return { ok: true, scale: { baseHex: formatHex(base), steps } };
}

/** `--color-<name>-50: #hex;` … inside a Tailwind 4 `@theme` block. */
export function formatTailwindTheme(scale: PaletteScale, tokenName: string): string {
  const lines = scale.steps.map((step) => `  --color-${tokenName}-${step.step}: ${step.hex};`);
  return ["@theme {", ...lines, "}"].join("\n");
}

/** Plain CSS custom properties, for a project not on Tailwind 4's `@theme`. */
export function formatCssVariables(scale: PaletteScale, tokenName: string): string {
  const lines = scale.steps.map((step) => `  --${tokenName}-${step.step}: ${step.hex};`);
  return [":root {", ...lines, "}"].join("\n");
}

/** `50: #hex` per line — for pasting into a spreadsheet or a design tool that does not read CSS. */
export function formatHexList(scale: PaletteScale): string {
  return scale.steps.map((step) => `${step.step}: ${step.hex}`).join("\n");
}
