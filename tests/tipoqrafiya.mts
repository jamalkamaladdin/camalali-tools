/*
 * What is worth checking here: the exact 16px/1.25 pair the task itself is
 * specified against ("lg" must land on 20px), the geometric-progression
 * property that pair is an instance of (each step is the ratio times the
 * one before it, in both directions from "base"), the line-height curve's
 * midpoint and both clamped ends, and a ratio or base size a wrong edit
 * could push non-finite or negative coming back as a `Result` instead of
 * quietly producing `NaN` or `Infinity` px values.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildTypeScale,
  lineHeightFor,
  SCALE_STEP_NAMES,
} from "../lib/tipoqrafiya";

export const checks: CheckSuite = (check) => {
  const scale = buildTypeScale(16, 1.25);
  if (!scale.ok) throw new Error(`16px / 1.25 unexpectedly failed: ${scale.error}`);
  const byName = new Map(scale.steps.map((s) => [s.name, s]));

  check(
    "tipoqrafiya: 16px base at a 1.25 ratio puts the step above base at exactly 20px",
    byName.get("lg")?.px === 20,
    `got: ${byName.get("lg")?.px}`,
  );

  check(
    "tipoqrafiya: the base step itself is untouched by the ratio — always the base size, at rem 1",
    byName.get("base")?.px === 16 && byName.get("base")?.rem === 1,
    `px: ${byName.get("base")?.px}, rem: ${byName.get("base")?.rem}`,
  );

  check(
    "tipoqrafiya: every step above base is the ratio times the step before it",
    SCALE_STEP_NAMES.slice(SCALE_STEP_NAMES.indexOf("base") + 1).every((name, i) => {
      const steps = scale.steps;
      const baseIndex = SCALE_STEP_NAMES.indexOf("base");
      const current = steps[baseIndex + 1 + i];
      const previous = steps[baseIndex + i];
      return Math.abs(current.px / previous.px - 1.25) < 0.001;
    }),
    `steps: ${JSON.stringify(scale.steps.map((s) => [s.name, s.px]))}`,
  );

  check(
    "tipoqrafiya: every step below base divides the previous one by the ratio",
    Math.abs(byName.get("sm")!.px * 1.25 - byName.get("base")!.px) < 0.001 &&
      Math.abs(byName.get("xs")!.px * 1.25 - byName.get("sm")!.px) < 0.001,
    `xs: ${byName.get("xs")?.px}, sm: ${byName.get("sm")?.px}, base: ${byName.get("base")?.px}`,
  );

  check(
    "tipoqrafiya: line-height at the exact midpoint of the clamp range (42px) is 1.45",
    lineHeightFor(42) === 1.45,
    `got: ${lineHeightFor(42)}`,
  );

  check(
    "tipoqrafiya: line-height clamps to 1.75 at and below the small-end boundary",
    lineHeightFor(12) === 1.75 && lineHeightFor(2) === 1.75,
    `at 12: ${lineHeightFor(12)}, at 2: ${lineHeightFor(2)}`,
  );

  check(
    "tipoqrafiya: line-height clamps to 1.15 at and above the large-end boundary",
    lineHeightFor(72) === 1.15 && lineHeightFor(500) === 1.15,
    `at 72: ${lineHeightFor(72)}, at 500: ${lineHeightFor(500)}`,
  );

  check(
    "tipoqrafiya: line-height falls as size rises across the whole built scale",
    scale.steps.every((step, i) => i === 0 || step.lineHeight <= scale.steps[i - 1].lineHeight),
    `line-heights: ${scale.steps.map((s) => s.lineHeight).join(", ")}`,
  );

  check(
    "tipoqrafiya: rem is px divided by the 16px root, not the tool's own base size",
    Math.abs(byName.get("lg")!.rem - 1.25) < 0.0001,
    `got: ${byName.get("lg")?.rem}`,
  );

  check(
    "tipoqrafiya: a ratio of 1 (a flat, non-scaling input) is rejected as an error, not silently accepted",
    (() => {
      const result = buildTypeScale(16, 1);
      return !result.ok && typeof result.error === "string" && result.error.length > 0;
    })(),
    "expected ok: false",
  );

  check(
    "tipoqrafiya: a negative base size is rejected as an error rather than producing a negative px",
    (() => {
      const result = buildTypeScale(-16, 1.25);
      return !result.ok;
    })(),
    "expected ok: false",
  );

  check(
    "tipoqrafiya: a non-finite ratio is rejected rather than propagating NaN through every step",
    (() => {
      const result = buildTypeScale(16, Number.NaN);
      return !result.ok;
    })(),
    "expected ok: false",
  );

  check(
    "tipoqrafiya: the fixed shape is nine named steps, two below base and six above it",
    SCALE_STEP_NAMES.length === 9 &&
      SCALE_STEP_NAMES.indexOf("base") === 2 &&
      SCALE_STEP_NAMES[SCALE_STEP_NAMES.length - 1] === "5xl",
    `got: ${JSON.stringify(SCALE_STEP_NAMES)}`,
  );
};
