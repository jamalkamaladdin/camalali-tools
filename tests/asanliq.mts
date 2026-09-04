/*
 * What is worth checking here: a named preset matches its spec-defined
 * numbers exactly, the curve is pinned at (0,0) and (1,1) regardless of the
 * control points (every cubic-bezier easing is, by construction), the
 * `ease-in-out` curve's point symmetry makes it cross exactly through
 * (0.5, 0.5), the `linear` preset's inverted-progress function is the
 * identity, a malformed control point comes back as an error rather than a
 * throw, the CSS string round-trips through its own parser, and progress is
 * monotonic non-decreasing across a curve whose x is monotonic by
 * construction.
 */
import type { CheckSuite } from "./harness.mts";
import {
  createBezier,
  curvePoints,
  EASING_PRESETS,
  parseCssString,
  solveProgress,
  toCssString,
  validateBezier,
  type CubicBezier,
} from "../lib/asanliq";

function preset(id: string): CubicBezier {
  const found = EASING_PRESETS.find((item) => item.id === id);
  if (!found) throw new Error(`missing fixture preset: ${id}`);
  return found.bezier;
}

export const checks: CheckSuite = (check) => {
  const easeInOut = preset("ease-in-out");
  check(
    "asanliq: ease-in-out matches the CSS spec's exact cubic-bezier(0.42, 0, 0.58, 1)",
    toCssString(easeInOut) === "cubic-bezier(0.42, 0, 0.58, 1)",
    `got: ${toCssString(easeInOut)}`,
  );

  const easeOutBack = preset("ease-out-back");
  check(
    "asanliq: solveProgress at x=0 and x=1 is exactly 0 and 1 for every curve, including one that overshoots",
    solveProgress(0, easeOutBack) === 0 && solveProgress(1, easeOutBack) === 1,
    `at 0: ${solveProgress(0, easeOutBack)}, at 1: ${solveProgress(1, easeOutBack)}`,
  );

  const midInOut = solveProgress(0.5, easeInOut);
  check(
    "asanliq: ease-in-out's point symmetry around (0.5, 0.5) makes the midpoint of time land on the midpoint of progress",
    Math.abs(midInOut - 0.5) < 1e-4,
    `got: ${midInOut}`,
  );

  const linear = preset("linear");
  const linearSamples = [0, 0.2, 0.5, 0.73, 1].map((x) => solveProgress(x, linear));
  check(
    "asanliq: the linear preset's progress function is the identity",
    linearSamples.every((y, index) => Math.abs(y - [0, 0.2, 0.5, 0.73, 1][index]) < 1e-4),
    `got: ${JSON.stringify(linearSamples)}`,
  );

  const outOfRange = createBezier(1.5, 0, 0.5, 1);
  check(
    "asanliq: a control point with x outside 0..1 comes back as an error, not a thrown exception",
    outOfRange.bezier === null && typeof outOfRange.error === "string" && outOfRange.error.length > 0,
    `got: ${JSON.stringify(outOfRange)}`,
  );

  const nonFinite = createBezier(Number.NaN, 0, 0.5, 1);
  check(
    "asanliq: a non-finite control point is rejected the same way",
    nonFinite.bezier === null,
    `got: ${JSON.stringify(nonFinite)}`,
  );

  check(
    "asanliq: y is unconstrained — validateBezier accepts an overshoot past 1",
    validateBezier({ p1: { x: 0.34, y: 1.56 }, p2: { x: 0.64, y: 1 } }).valid === true,
    "expected easeOutBack's y1 = 1.56 to validate",
  );

  const roundTrip = parseCssString(toCssString(easeOutBack));
  check(
    "asanliq: a curve survives toCssString -> parseCssString unchanged",
    roundTrip !== null &&
      roundTrip.p1.x === easeOutBack.p1.x &&
      roundTrip.p1.y === easeOutBack.p1.y &&
      roundTrip.p2.x === easeOutBack.p2.x &&
      roundTrip.p2.y === easeOutBack.p2.y,
    `got: ${JSON.stringify(roundTrip)}`,
  );

  check(
    "asanliq: parseCssString on garbage returns null instead of throwing",
    parseCssString("not a bezier at all") === null,
    "expected null",
  );

  const easeSamples = [0, 0.25, 0.5, 0.75, 1].map((x) => solveProgress(x, preset("ease")));
  const nonDecreasing = easeSamples.every((value, index) => index === 0 || value >= easeSamples[index - 1]);
  check(
    "asanliq: progress is monotonic non-decreasing across a monotonic-x curve",
    nonDecreasing,
    `got: ${JSON.stringify(easeSamples)}`,
  );

  const sampled = curvePoints(easeOutBack, 10);
  check(
    "asanliq: curvePoints returns steps+1 points pinned at (0,0) and (1,1)",
    sampled.length === 11 &&
      sampled[0].x === 0 &&
      sampled[0].y === 0 &&
      sampled[10].x === 1 &&
      sampled[10].y === 1,
    `first: ${JSON.stringify(sampled[0])}, last: ${JSON.stringify(sampled[10])}, count: ${sampled.length}`,
  );
};
