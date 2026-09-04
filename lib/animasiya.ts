/**
 * `@keyframes` block assembly: a list of steps (each an offset plus the
 * transforms and opacity active there) turned into the two things a visitor
 * pastes — the keyframes rule itself and the `animation` shorthand that
 * plays it.
 *
 * The one CSS trap this file exists to route around: the `animation`
 * shorthand carries two time values (duration, delay) with nothing in the
 * syntax to tell them apart except position — the first `<time>` token is
 * always duration, the second is always delay. A hand-written shorthand that
 * puts the timing function or the name between them still parses, silently
 * swaps which is which, and nothing in the browser warns. `buildShorthand`
 * below fixes both times' positions for exactly that reason, and the tests
 * pin the order down as a known-answer case rather than trusting a reading of
 * the spec to survive a future edit.
 *
 * Nothing here throws on bad input — a visitor mid-edit of a number field is
 * the normal case, not an exception. `generateAnimation` is the one function
 * that validates; every other export assumes it was already handed a sane
 * config and stays a pure formatter.
 */

export type TransformKind = "translateX" | "translateY" | "scale" | "rotate";

export type TransformOp = {
  kind: TransformKind;
  /** px for translate, degrees for rotate, a bare multiplier for scale. */
  value: number;
};

export type KeyframeStep = {
  /** 0..100, the `%` in front of the step's declaration block. */
  offset: number;
  transforms: TransformOp[];
  /** `undefined` omits the property from this step entirely. */
  opacity?: number;
};

export type AnimationDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";
export type AnimationFillMode = "none" | "forwards" | "backwards" | "both";

export type AnimationConfig = {
  /** The `@keyframes` name and the `animation-name` value — a CSS identifier. */
  name: string;
  steps: KeyframeStep[];
  durationMs: number;
  delayMs: number;
  /** `"infinite"` or a positive count. */
  iterationCount: number | "infinite";
  direction: AnimationDirection;
  fillMode: AnimationFillMode;
  /** A CSS `<easing-function>` token: `ease`, `linear`, `cubic-bezier(...)`. */
  timingFunction: string;
};

const IDENTIFIER_PATTERN = /^-?[a-zA-Z_][\w-]*$/;

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name);
}

/** Trims a float to 3 decimal places and drops trailing zeros — `33.330`
 * stays wrong to read even though it is not wrong to compute. */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

export function formatPercent(offset: number): string {
  return `${formatNumber(offset)}%`;
}

/** Always emitted in seconds — one unit throughout the block is what makes a
 * pasted-in keyframes rule easy to scan, and CSS accepts fractional seconds
 * for any millisecond value this tool produces. */
export function formatSeconds(ms: number): string {
  return `${formatNumber(ms / 1000)}s`;
}

export function formatTransformOp(op: TransformOp): string {
  switch (op.kind) {
    case "translateX":
      return `translateX(${formatNumber(op.value)}px)`;
    case "translateY":
      return `translateY(${formatNumber(op.value)}px)`;
    case "scale":
      return `scale(${formatNumber(op.value)})`;
    case "rotate":
      return `rotate(${formatNumber(op.value)}deg)`;
  }
}

/** `undefined` when the step has no transforms — the `transform` property is
 * then left out of that step's block rather than emitted as `transform: ;`. */
export function buildTransformValue(transforms: TransformOp[]): string | undefined {
  if (transforms.length === 0) return undefined;
  return transforms.map(formatTransformOp).join(" ");
}

/**
 * Azerbaijani sentences describing what is wrong with a config, or an empty
 * array when it is fine to build. Never throws — a config a visitor is still
 * typing is expected to be invalid sometimes.
 */
export function validateAnimationConfig(config: AnimationConfig): string[] {
  const errors: string[] = [];

  if (!isValidIdentifier(config.name)) {
    errors.push("Animasiya adı hərflə və ya alt xəttlə başlamalı, sonra hərf, rəqəm və ya dəfis ola bilər.");
  }
  if (config.steps.length === 0) {
    errors.push("Ən azı bir addım lazımdır.");
  }
  for (const step of config.steps) {
    if (!Number.isFinite(step.offset) || step.offset < 0 || step.offset > 100) {
      errors.push(`Addım faizi 0 ilə 100 arasında olmalıdır: "${step.offset}" deyil.`);
    }
    if (step.opacity !== undefined && (step.opacity < 0 || step.opacity > 1)) {
      errors.push(`Şəffaflıq 0 ilə 1 arasında olmalıdır: "${step.opacity}" deyil.`);
    }
  }
  if (!Number.isFinite(config.durationMs) || config.durationMs < 0) {
    errors.push("Müddət mənfi olmayan ədəd olmalıdır.");
  }
  if (!Number.isFinite(config.delayMs)) {
    errors.push("Gecikmə ədəd olmalıdır.");
  }
  if (config.iterationCount !== "infinite" && (!Number.isFinite(config.iterationCount) || config.iterationCount <= 0)) {
    errors.push('Təkrar sayı müsbət ədəd və ya "infinite" olmalıdır.');
  }
  if (config.timingFunction.trim() === "") {
    errors.push("Asanlıq funksiyası boş ola bilməz.");
  }

  return errors;
}

/**
 * The `@keyframes` rule. Steps are sorted by offset regardless of the order
 * they were given in — a visitor reordering steps in a list should never
 * have to also reorder them in the config for the output to come out right.
 */
export function buildKeyframesBlock(config: AnimationConfig): string {
  const sorted = [...config.steps].sort((a, b) => a.offset - b.offset);
  const body = sorted
    .map((step) => {
      const declarations: string[] = [];
      const transformValue = buildTransformValue(step.transforms);
      if (transformValue !== undefined) declarations.push(`    transform: ${transformValue};`);
      if (step.opacity !== undefined) declarations.push(`    opacity: ${formatNumber(step.opacity)};`);
      const block = declarations.length > 0 ? declarations.join("\n") : "";
      return `  ${formatPercent(step.offset)} {\n${block}\n  }`;
    })
    .join("\n");
  return `@keyframes ${config.name} {\n${body}\n}`;
}

/**
 * The `animation` shorthand, with duration always written before delay —
 * see the file comment for why that position, not the property names either
 * side of it, is what CSS actually reads.
 */
export function buildAnimationShorthand(config: AnimationConfig): string {
  const iteration = config.iterationCount === "infinite" ? "infinite" : formatNumber(config.iterationCount);
  const parts = [
    config.name,
    formatSeconds(config.durationMs),
    config.timingFunction,
    formatSeconds(config.delayMs),
    iteration,
    config.direction,
    config.fillMode,
  ];
  return `animation: ${parts.join(" ")};`;
}

export type AnimationResult = {
  css: string | null;
  keyframes: string | null;
  shorthand: string | null;
  errors: string[];
};

/** The one entry point that validates. On success, `css` is the keyframes
 * block and the shorthand line, ready to paste one after the other. */
export function generateAnimation(config: AnimationConfig): AnimationResult {
  const errors = validateAnimationConfig(config);
  if (errors.length > 0) {
    return { css: null, keyframes: null, shorthand: null, errors };
  }
  const keyframes = buildKeyframesBlock(config);
  const shorthand = buildAnimationShorthand(config);
  return { css: `${keyframes}\n\n${shorthand}`, keyframes, shorthand, errors: [] };
}
