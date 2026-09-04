/**
 * Modular type scale: one base size and one ratio, multiplied out into the
 * nine steps a real stylesheet needs — two below the base for captions and
 * fine print, six above it for headings up to a hero line.
 *
 * The geometric-progression part (`px = base * ratio ** n`) is the textbook
 * modular scale and is not this file's invention. What is this file's own is
 * `lineHeightFor`: a large heading set at the same 1.5 line-height as body
 * copy looks loose (the glyphs are already tall, so the gap between lines
 * reads as too generous), and small print at 1.2 looks cramped (short
 * x-heights need more air to stay legible). The fix is a size-dependent
 * line-height rather than one constant, worked out as a straight linear
 * interpolation between a loose bound at the small end and a tight bound at
 * the large end — simple enough that a caller can predict the number from
 * the size alone, which a curve fitted to taste would not allow.
 */

export type ScaleStepName = "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";

/**
 * Declaration order — also each step's position in the geometric
 * progression. `"base"` sits at index 2, two steps down from `"xs"` and six
 * steps up from `"5xl"`, matching the fixed 2-below/6-above shape the tool
 * is scoped to.
 */
export const SCALE_STEP_NAMES: ScaleStepName[] = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
];

const BASE_STEP_INDEX = SCALE_STEP_NAMES.indexOf("base");

/** The eight named ratios a type-scale reference table offers, plus whatever the visitor types in themselves. */
export const NAMED_RATIOS: { value: number; label: string }[] = [
  { value: 1.067, label: "1.067: kiçik ikinci (Minor Second)" },
  { value: 1.125, label: "1.125: böyük ikinci (Major Second)" },
  { value: 1.2, label: "1.2: kiçik terts (Minor Third)" },
  { value: 1.25, label: "1.25: böyük terts (Major Third)" },
  { value: 1.333, label: "1.333: mükəmməl kvarta (Perfect Fourth)" },
  { value: 1.414, label: "1.414: artırılmış kvarta (Augmented Fourth)" },
  { value: 1.5, label: "1.5: mükəmməl kvinta (Perfect Fifth)" },
  { value: 1.618, label: "1.618: qızıl nisbət (Golden Ratio)" },
];

const MIN_BASE_PX = 8;
const MAX_BASE_PX = 64;
const MIN_RATIO = 1.01;
const MAX_RATIO = 3;

/** The root em size every `rem` figure in this file is computed against — the browser default, not a project's own `html { font-size }` override. */
const ROOT_PX = 16;

const MIN_LINE_HEIGHT = 1.15;
const MAX_LINE_HEIGHT = 1.75;
/** Below this size the line-height stays pinned at `MAX_LINE_HEIGHT` — a caption does not keep needing more air as it shrinks further. */
const MIN_LINE_HEIGHT_PX = 12;
/** Above this size the line-height stays pinned at `MIN_LINE_HEIGHT` — a hero line does not keep tightening past a point where lines would touch. */
const MAX_LINE_HEIGHT_PX = 72;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Straight linear interpolation between the loose bound (small text) and the
 * tight bound (large text), clamped at both ends. `px === 42` — the exact
 * midpoint of the clamped range — lands on `1.45`, which is the number the
 * check file leans on: a curve that fitted anything other than a straight
 * line would not hit that value.
 */
export function lineHeightFor(px: number): number {
  const clampedPx = clamp(px, MIN_LINE_HEIGHT_PX, MAX_LINE_HEIGHT_PX);
  const t = (clampedPx - MIN_LINE_HEIGHT_PX) / (MAX_LINE_HEIGHT_PX - MIN_LINE_HEIGHT_PX);
  return round(MAX_LINE_HEIGHT - t * (MAX_LINE_HEIGHT - MIN_LINE_HEIGHT), 2);
}

export type ScaleStep = {
  name: ScaleStepName;
  /** Position in the progression — negative below the base, positive above it. */
  stepIndex: number;
  px: number;
  rem: number;
  lineHeight: number;
};

export type TypeScaleResult =
  | { ok: true; steps: ScaleStep[] }
  | { ok: false; error: string };

/**
 * Builds the fixed nine-step scale. Validation lives here rather than in the
 * widget because a visitor can type a base size or a ratio directly — the
 * slider is not the only way in — so the function itself has to be the one
 * place a nonsensical pair (a zero ratio, a negative size) is turned into a
 * message instead of an `Infinity` or a `NaN` silently reaching the page.
 */
export function buildTypeScale(basePx: number, ratio: number): TypeScaleResult {
  if (!Number.isFinite(basePx) || basePx < MIN_BASE_PX || basePx > MAX_BASE_PX) {
    return {
      ok: false,
      error: `Baza ölçü ${MIN_BASE_PX}-${MAX_BASE_PX}px aralığında olmalıdır.`,
    };
  }
  if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return {
      ok: false,
      error: `Nisbət ${MIN_RATIO}-${MAX_RATIO} aralığında olmalıdır: 1-ə bərabər və ya kiçik nisbət şkalanı düzləşdirir.`,
    };
  }

  const steps: ScaleStep[] = SCALE_STEP_NAMES.map((name, index) => {
    const stepIndex = index - BASE_STEP_INDEX;
    const px = round(basePx * ratio ** stepIndex, 2);
    return {
      name,
      stepIndex,
      px,
      rem: round(px / ROOT_PX, 4),
      lineHeight: lineHeightFor(px),
    };
  });

  return { ok: true, steps };
}

/** `--font-size-xs: 0.64rem;` / `--line-height-xs: 1.75;` per step. */
export function formatCssVariables(steps: ScaleStep[]): string {
  const lines = steps.flatMap((step) => [
    `  --font-size-${step.name}: ${step.rem}rem;`,
    `  --line-height-${step.name}: ${step.lineHeight};`,
  ]);
  return [":root {", ...lines, "}"].join("\n");
}

/** Tailwind's `theme.fontSize` shape: `name: [size, { lineHeight }]`. */
export function formatTailwindFontSize(steps: ScaleStep[]): string {
  const lines = steps.map(
    (step) => `    ${step.name}: ["${step.rem}rem", { lineHeight: "${step.lineHeight}" }],`,
  );
  return ["fontSize: {", ...lines, "},"].join("\n");
}
