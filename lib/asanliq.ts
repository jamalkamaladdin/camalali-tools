/**
 * Cubic-bezier easing curves: the four numbers behind `transition-timing-function`
 * and `animation-timing-function`, worked two ways.
 *
 * A CSS `cubic-bezier(x1, y1, x2, y2)` is a *parametric* curve — both its x
 * (elapsed time, 0..1) and its y (eased progress, 0..1) are functions of a
 * hidden parameter `t` that never appears in the CSS. Drawing the curve only
 * needs that parametric form: walk `t` from 0 to 1 and plot (x(t), y(t)).
 * Answering "at 40% of the transition's time, how far along is it" needs the
 * opposite — given an x, find the t that produces it, which is an inverse
 * nobody has a closed form for. `solveProgress` below is the reason this file
 * exists apart from `curvePoints`: it runs Newton's method (with a bisection
 * fallback for when the derivative is too flat to trust) to invert x(t), the
 * same technique WebKit's own `UnitBezier` uses, because a cubic has no
 * algebraic inverse in general.
 *
 * The CSS spec constrains x1 and x2 to [0, 1] so that x(t) is monotonic and
 * the inversion above is well-defined; y1 and y2 are unconstrained, which is
 * exactly what lets `easeOutBack` overshoot past 1 before settling. That
 * asymmetry is why validation only ever rejects the x components.
 */

export type BezierPoint = { x: number; y: number };
export type CubicBezier = { p1: BezierPoint; p2: BezierPoint };

export type EasingPreset = {
  id: string;
  label: string;
  bezier: CubicBezier;
};

/** The four CSS keyword timing functions plus a handful of named curves a
 * visitor recognises by shape rather than by number. Values copied from the
 * CSS Easing Functions spec (the keywords) and the widely-published
 * easings.net table (the named ones) — nothing here is guessed. */
export const EASING_PRESETS: EasingPreset[] = [
  { id: "linear", label: "linear", bezier: { p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 } } },
  { id: "ease", label: "ease", bezier: { p1: { x: 0.25, y: 0.1 }, p2: { x: 0.25, y: 1 } } },
  { id: "ease-in", label: "ease-in", bezier: { p1: { x: 0.42, y: 0 }, p2: { x: 1, y: 1 } } },
  { id: "ease-out", label: "ease-out", bezier: { p1: { x: 0, y: 0 }, p2: { x: 0.58, y: 1 } } },
  {
    id: "ease-in-out",
    label: "ease-in-out",
    bezier: { p1: { x: 0.42, y: 0 }, p2: { x: 0.58, y: 1 } },
  },
  {
    id: "ease-in-out-cubic",
    label: "easeInOutCubic",
    bezier: { p1: { x: 0.65, y: 0 }, p2: { x: 0.35, y: 1 } },
  },
  {
    id: "ease-out-back",
    label: "easeOutBack",
    bezier: { p1: { x: 0.34, y: 1.56 }, p2: { x: 0.64, y: 1 } },
  },
  {
    id: "ease-in-out-sine",
    label: "easeInOutSine",
    bezier: { p1: { x: 0.37, y: 0 }, p2: { x: 0.63, y: 1 } },
  },
];

export type BezierValidation = { valid: boolean; error: string | null };

/**
 * The one rule the CSS spec actually enforces: the two x components must sit
 * in [0, 1], or the curve is not a function of x (the same time can map to
 * two different progress values) and browsers themselves clamp or reject it.
 * y is left alone on purpose — see the file comment.
 */
export function validateBezier(bezier: CubicBezier): BezierValidation {
  const { p1, p2 } = bezier;
  const values = [p1.x, p1.y, p2.x, p2.y];
  if (values.some((value) => !Number.isFinite(value))) {
    return { valid: false, error: "Bütün dörd dəyər ədəd olmalıdır." };
  }
  if (p1.x < 0 || p1.x > 1 || p2.x < 0 || p2.x > 1) {
    return {
      valid: false,
      error: "x1 və x2 0 ilə 1 arasında olmalıdır — CSS bunu bu aralıqdan kənarda qəbul etmir.",
    };
  }
  return { valid: true, error: null };
}

/**
 * Builds a valid curve or explains why not, without ever throwing — the shape
 * every other function in this file assumes it was handed.
 */
export function createBezier(x1: number, y1: number, x2: number, y2: number): {
  bezier: CubicBezier | null;
  error: string | null;
} {
  const bezier: CubicBezier = { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
  const { valid, error } = validateBezier(bezier);
  return valid ? { bezier, error: null } : { bezier: null, error };
}

function sampleCurveX(t: number, x1: number, x2: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  return ((ax * t + bx) * t + cx) * t;
}

function sampleCurveY(t: number, y1: number, y2: number): number {
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return ((ay * t + by) * t + cy) * t;
}

function sampleCurveDerivativeX(t: number, x1: number, x2: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  return (3 * ax * t + 2 * bx) * t + cx;
}

const NEWTON_ITERATIONS = 8;
const NEWTON_EPSILON = 1e-7;
const BISECTION_ITERATIONS = 24;

/** Inverts x(t): Newton's method first, a bisection sweep as the fallback
 * when the tangent is too flat to trust (near a control point stacked on an
 * endpoint). Eight Newton steps converge to well under a pixel for every
 * curve the CSS spec allows; the fallback exists for the pathological ones. */
function solveCurveX(x: number, x1: number, x2: number): number {
  let t = x;
  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const currentX = sampleCurveX(t, x1, x2) - x;
    if (Math.abs(currentX) < NEWTON_EPSILON) return t;
    const derivative = sampleCurveDerivativeX(t, x1, x2);
    if (Math.abs(derivative) < 1e-6) break;
    t = t - currentX / derivative;
  }

  let lo = 0;
  let hi = 1;
  let guess = Math.min(Math.max(t, 0), 1);
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const estimate = sampleCurveX(guess, x1, x2);
    if (Math.abs(estimate - x) < NEWTON_EPSILON) return guess;
    if (estimate < x) lo = guess;
    else hi = guess;
    guess = (lo + hi) / 2;
  }
  return guess;
}

/**
 * The eased progress at elapsed-time fraction `x` — what the browser actually
 * uses each animation frame. `x` is clamped into [0, 1] first: outside that
 * range the spec extends the curve linearly past its tangent at the nearer
 * endpoint, a case this tool does not attempt to reproduce.
 */
export function solveProgress(x: number, bezier: CubicBezier): number {
  const clamped = Math.min(Math.max(x, 0), 1);
  const t = solveCurveX(clamped, bezier.p1.x, bezier.p2.x);
  return sampleCurveY(t, bezier.p1.y, bezier.p2.y);
}

/**
 * Points along the *parametric* curve, evenly spaced in `t` rather than in x —
 * what an SVG path actually needs, and different from `solveProgress`'s
 * evenly-spaced-in-x samples. A back-easing curve's x is not monotonic in t
 * near its overshoot only when x itself overshoots, which the spec forbids;
 * sampling by t is what still draws the y-overshoot correctly regardless.
 */
export function curvePoints(bezier: CubicBezier, steps: number): BezierPoint[] {
  const count = Math.max(1, Math.floor(steps));
  const points: BezierPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({
      x: sampleCurveX(t, bezier.p1.x, bezier.p2.x),
      y: sampleCurveY(t, bezier.p1.y, bezier.p2.y),
    });
  }
  return points;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

export function toCssString(bezier: CubicBezier): string {
  const { p1, p2 } = bezier;
  return `cubic-bezier(${formatNumber(p1.x)}, ${formatNumber(p1.y)}, ${formatNumber(p2.x)}, ${formatNumber(p2.y)})`;
}

const CSS_PATTERN =
  /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i;

/** The inverse of `toCssString`, for a visitor pasting in a curve they found
 * elsewhere. Returns `null` on anything that does not parse rather than
 * throwing — a malformed paste is an everyday input here, not an exception. */
export function parseCssString(css: string): CubicBezier | null {
  const match = CSS_PATTERN.exec(css.trim());
  if (!match) return null;
  const [x1, y1, x2, y2] = match.slice(1, 5).map(Number);
  if ([x1, y1, x2, y2].some((value) => !Number.isFinite(value))) return null;
  return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}
