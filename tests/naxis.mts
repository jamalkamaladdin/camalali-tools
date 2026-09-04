/*
 * What is worth checking here: the stripe, grid, dot and checkerboard
 * recipes match known configs exactly (the step/line-width/dot-radius
 * ratios this file documents as its own design choice), `patternUsesAngle`
 * correctly separates the three angle-sensitive kinds from the two
 * symmetric ones, changing the angle genuinely has no effect on a symmetric
 * kind's output, a malformed step size or a blank colour comes back as an
 * error rather than a throw, and building the same config twice is
 * deterministic.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildPattern,
  patternUsesAngle,
  validatePatternConfig,
  type PatternConfig,
} from "../lib/naxis";

export const checks: CheckSuite = (check) => {
  const stripes = buildPattern({ kind: "stripes", colorA: "#000", colorB: "#fff", stepPx: 20, angleDeg: 45 });
  check(
    "naxis: stripes split the step evenly between the two colours at the given angle",
    stripes.backgroundImage === "repeating-linear-gradient(45deg, #000 0px, #000 10px, #fff 10px, 20px)",
    `got: ${stripes.backgroundImage}`,
  );

  const grid = buildPattern({ kind: "grid", colorA: "#000", colorB: "#fff", stepPx: 32, angleDeg: 0 });
  check(
    "naxis: the line grid's stroke is step/16 (minimum 1px) and the second layer is rotated 90 degrees from the first",
    grid.backgroundImage ===
      "repeating-linear-gradient(0deg, #fff 0px, #fff 2px, transparent 2px, transparent 32px), " +
        "repeating-linear-gradient(90deg, #fff 0px, #fff 2px, transparent 2px, transparent 32px)",
    `got: ${grid.backgroundImage}`,
  );

  const dots = buildPattern({ kind: "dots", colorA: "#000", colorB: "#fff", stepPx: 30, angleDeg: 0 });
  check(
    "naxis: a dot's radius is step/6 and the tile size equals the step in both dimensions",
    dots.backgroundImage === "radial-gradient(#fff 5px, transparent 5px)" &&
      dots.backgroundSize === "30px 30px",
    `image: ${dots.backgroundImage}, size: ${dots.backgroundSize}`,
  );

  const checkerboard = buildPattern({ kind: "checkerboard", colorA: "#000", colorB: "#fff", stepPx: 40, angleDeg: 0 });
  check(
    "naxis: the checkerboard's four layers offset by half the step in each position",
    checkerboard.backgroundSize === "40px 40px" &&
      checkerboard.backgroundPosition === "0 0, 0 20px, 20px -20px, -20px 0px",
    `size: ${checkerboard.backgroundSize}, position: ${checkerboard.backgroundPosition}`,
  );

  check(
    "naxis: only stripes, grid and zigzag respond to the angle control",
    patternUsesAngle("stripes") === true &&
      patternUsesAngle("grid") === true &&
      patternUsesAngle("zigzag") === true &&
      patternUsesAngle("dots") === false &&
      patternUsesAngle("checkerboard") === false,
    "expected exactly stripes/grid/zigzag to use the angle",
  );

  const dotsAngle0 = buildPattern({ kind: "dots", colorA: "#000", colorB: "#fff", stepPx: 30, angleDeg: 0 });
  const dotsAngle90 = buildPattern({ kind: "dots", colorA: "#000", colorB: "#fff", stepPx: 30, angleDeg: 90 });
  check(
    "naxis: changing the angle has no effect on a symmetric kind's output",
    dotsAngle0.backgroundImage === dotsAngle90.backgroundImage,
    `0deg: ${dotsAngle0.backgroundImage}, 90deg: ${dotsAngle90.backgroundImage}`,
  );

  const negativeStep: PatternConfig = { kind: "stripes", colorA: "#000", colorB: "#fff", stepPx: -5, angleDeg: 0 };
  const negativeResult = buildPattern(negativeStep);
  check(
    "naxis: a negative step size is rejected as an error, not a thrown exception",
    negativeResult.backgroundImage === null && negativeResult.errors.length > 0,
    `got: ${JSON.stringify(negativeResult)}`,
  );

  const blankColor = validatePatternConfig({ kind: "stripes", colorA: "  ", colorB: "#fff", stepPx: 20, angleDeg: 0 });
  check(
    "naxis: a blank first colour is rejected",
    blankColor.valid === false,
    `got: ${JSON.stringify(blankColor)}`,
  );

  const nanAngle = validatePatternConfig({ kind: "stripes", colorA: "#000", colorB: "#fff", stepPx: 20, angleDeg: Number.NaN });
  check(
    "naxis: a non-finite angle is rejected",
    nanAngle.valid === false,
    `got: ${JSON.stringify(nanAngle)}`,
  );

  const configA: PatternConfig = { kind: "zigzag", colorA: "#000", colorB: "#fff", stepPx: 24, angleDeg: 10 };
  check(
    "naxis: building the same config twice is deterministic",
    buildPattern(configA).backgroundImage === buildPattern(configA).backgroundImage,
    "expected two builds of the same config to match",
  );

  check(
    "naxis: a two-dimensional kind's declaration states the base colour as background-color (stripes needs none — its own gradient already covers the ground)",
    grid.declaration !== null && grid.declaration.includes("background-color: #000;"),
    `got: ${grid.declaration}`,
  );
};
