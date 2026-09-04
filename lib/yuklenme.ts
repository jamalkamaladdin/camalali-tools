/**
 * Five loading indicators, CSS only — no JavaScript drives any of them, so
 * the animation keeps running even on a thread the visitor's own script has
 * blocked, which is the one property a loading indicator cannot do without.
 *
 * Every numeric detail below (a ring's stroke, a dot's stagger, a bar's
 * thickness) is derived from the two inputs a visitor actually gives —
 * `sizePx` and `speedMs` — rather than hard-coded, so the widget's live
 * preview and the copy-pasted CSS are always the same object. The specific
 * ratios (stroke = size/8, dot stagger = speed/6, and so on) are this file's
 * own design choice, written down once here rather than repeated at each
 * call site, and the check file pins them down as known answers so a future
 * edit cannot silently drift the preview away from the exported CSS.
 */

export type SpinnerKind = "ring" | "dots" | "pulse" | "skeleton" | "bar";

export const SPINNER_KINDS: SpinnerKind[] = ["ring", "dots", "pulse", "skeleton", "bar"];

export type SpinnerConfig = {
  kind: SpinnerKind;
  sizePx: number;
  color: string;
  speedMs: number;
};

export type SpinnerOutput = { html: string; css: string; errors: string[] };

export type SpinnerValidation = { valid: boolean; errors: string[] };

export function validateSpinnerConfig(config: SpinnerConfig): SpinnerValidation {
  const errors: string[] = [];
  if (!Number.isFinite(config.sizePx) || config.sizePx <= 0) errors.push("Ölçü müsbət ədəd olmalıdır.");
  if (!Number.isFinite(config.speedMs) || config.speedMs <= 0) errors.push("Sürət müsbət ədəd olmalıdır.");
  if (config.color.trim() === "") errors.push("Rəng boş ola bilməz.");
  return { valid: errors.length === 0, errors };
}

function round(value: number): number {
  return Math.round(value);
}

/** A tint of `color` behind the coloured arc/segment — `color-mix` rather
 * than a hard-coded grey, so the track always reads as "the same colour,
 * faded" instead of a fixed neutral that clashes with a saturated pick. */
function fadedMix(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

function buildRing(config: SpinnerConfig): SpinnerOutput {
  const { sizePx, color, speedMs } = config;
  const strokeWidth = Math.max(2, round(sizePx / 8));
  const html = `<div class="loader-ring"></div>`;
  const css = [
    ".loader-ring {",
    `  width: ${round(sizePx)}px;`,
    `  height: ${round(sizePx)}px;`,
    `  border: ${strokeWidth}px solid ${fadedMix(color, 20)};`,
    `  border-top-color: ${color};`,
    "  border-radius: 50%;",
    `  animation: loader-ring-spin ${round(speedMs)}ms linear infinite;`,
    "}",
    "@keyframes loader-ring-spin {",
    "  to { transform: rotate(360deg); }",
    "}",
  ].join("\n");
  return { html, css, errors: [] };
}

function buildDots(config: SpinnerConfig): SpinnerOutput {
  const { sizePx, color, speedMs } = config;
  const dotSize = Math.max(2, round(sizePx / 4));
  const gap = Math.max(1, round(sizePx / 6));
  /* Three dots, staggered across the first half of one cycle — a step of
     speed/6 means the third dot starts exactly when the first is a third of
     the way through, which is what reads as a wave rather than three dots
     blinking in lockstep. */
  const delayStep = round(speedMs / 6);
  const html = `<div class="loader-dots">\n  <span></span>\n  <span></span>\n  <span></span>\n</div>`;
  const css = [
    ".loader-dots {",
    "  display: flex;",
    "  align-items: center;",
    `  gap: ${gap}px;`,
    "}",
    ".loader-dots span {",
    `  width: ${dotSize}px;`,
    `  height: ${dotSize}px;`,
    "  border-radius: 50%;",
    `  background: ${color};`,
    `  animation: loader-dots-bounce ${round(speedMs)}ms ease-in-out infinite;`,
    "}",
    ".loader-dots span:nth-child(1) { animation-delay: 0ms; }",
    `.loader-dots span:nth-child(2) { animation-delay: ${delayStep}ms; }`,
    `.loader-dots span:nth-child(3) { animation-delay: ${delayStep * 2}ms; }`,
    "@keyframes loader-dots-bounce {",
    "  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }",
    "  40% { transform: scale(1); opacity: 1; }",
    "}",
  ].join("\n");
  return { html, css, errors: [] };
}

function buildPulse(config: SpinnerConfig): SpinnerOutput {
  const { sizePx, color, speedMs } = config;
  const html = `<div class="loader-pulse"></div>`;
  const css = [
    ".loader-pulse {",
    `  width: ${round(sizePx)}px;`,
    `  height: ${round(sizePx)}px;`,
    "  border-radius: 50%;",
    `  background: ${color};`,
    `  animation: loader-pulse-beat ${round(speedMs)}ms ease-out infinite;`,
    "}",
    "@keyframes loader-pulse-beat {",
    "  0% { transform: scale(0.8); opacity: 1; }",
    "  100% { transform: scale(1.6); opacity: 0; }",
    "}",
  ].join("\n");
  return { html, css, errors: [] };
}

function buildSkeleton(config: SpinnerConfig): SpinnerOutput {
  const { sizePx, color, speedMs } = config;
  const radius = Math.max(2, round(sizePx / 4));
  const html = `<div class="loader-skeleton"></div>`;
  const css = [
    ".loader-skeleton {",
    "  width: 100%;",
    `  height: ${round(sizePx)}px;`,
    `  border-radius: ${radius}px;`,
    `  background: linear-gradient(90deg, ${fadedMix(color, 12)} 25%, ${fadedMix(color, 28)} 37%, ${fadedMix(color, 12)} 63%);`,
    "  background-size: 400% 100%;",
    `  animation: loader-skeleton-shimmer ${round(speedMs)}ms ease-in-out infinite;`,
    "}",
    "@keyframes loader-skeleton-shimmer {",
    "  0% { background-position: 100% 50%; }",
    "  100% { background-position: 0% 50%; }",
    "}",
  ].join("\n");
  return { html, css, errors: [] };
}

function buildBar(config: SpinnerConfig): SpinnerOutput {
  const { sizePx, color, speedMs } = config;
  const thickness = Math.max(4, round(sizePx / 6));
  const html = `<div class="loader-bar"></div>`;
  const css = [
    ".loader-bar {",
    "  width: 100%;",
    `  height: ${thickness}px;`,
    `  border-radius: ${round(thickness / 2)}px;`,
    `  background: ${fadedMix(color, 18)};`,
    "  overflow: hidden;",
    "}",
    ".loader-bar::after {",
    '  content: "";',
    "  display: block;",
    "  width: 40%;",
    "  height: 100%;",
    `  background: ${color};`,
    "  border-radius: inherit;",
    `  animation: loader-bar-slide ${round(speedMs)}ms ease-in-out infinite;`,
    "}",
    "@keyframes loader-bar-slide {",
    "  0% { transform: translateX(-100%); }",
    "  100% { transform: translateX(250%); }",
    "}",
  ].join("\n");
  return { html, css, errors: [] };
}

const BUILDERS: Record<SpinnerKind, (config: SpinnerConfig) => SpinnerOutput> = {
  ring: buildRing,
  dots: buildDots,
  pulse: buildPulse,
  skeleton: buildSkeleton,
  bar: buildBar,
};

/** The one entry point that validates — never throws, since a visitor
 * mid-edit of a size field is the everyday case, not an exception. */
export function buildSpinner(config: SpinnerConfig): SpinnerOutput {
  const { valid, errors } = validateSpinnerConfig(config);
  if (!valid) return { html: "", css: "", errors };
  return BUILDERS[config.kind](config);
}
