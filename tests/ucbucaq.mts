/*
 * What is worth checking here: the four arrow directions and one corner
 * match the exact border-width/border-color split the spec's geometry
 * predicts, every one of the eight directions colours exactly one side (an
 * edit that coloured two would silently draw a solid parallelogram instead
 * of a triangle), an arrow always has three nonzero-width sides while a
 * corner has two, the `clip-path` polygon is the same regardless of the
 * box's own size, a malformed width or an empty colour comes back as an
 * error rather than a throw, and the full CSS text matches a known config.
 */
import type { CheckSuite } from "./harness.mts";
import {
  ARROW_DIRECTIONS,
  buildClipPathCss,
  buildTriangle,
  computeTriangleBorders,
  CORNER_DIRECTIONS,
  validateTriangleInput,
} from "../lib/ucbucaq";

export const checks: CheckSuite = (check) => {
  const up = computeTriangleBorders("up", 100, 50);
  check(
    "ucbucaq: an up-pointing triangle splits the width evenly across left/right and colours the bottom",
    up.width.top === 0 &&
      up.width.right === 50 &&
      up.width.bottom === 50 &&
      up.width.left === 50 &&
      up.colored.bottom === true &&
      !up.colored.top &&
      !up.colored.right &&
      !up.colored.left,
    `got: ${JSON.stringify(up)}`,
  );

  const down = computeTriangleBorders("down", 100, 50);
  check(
    "ucbucaq: a down-pointing triangle is up's mirror — the top is coloured instead of the bottom",
    down.width.top === 50 && down.width.bottom === 0 && down.colored.top === true,
    `got: ${JSON.stringify(down)}`,
  );

  const left = computeTriangleBorders("left", 100, 60);
  check(
    "ucbucaq: a left-pointing triangle splits the height across top/bottom and colours the right",
    left.width.top === 30 &&
      left.width.bottom === 30 &&
      left.width.right === 100 &&
      left.width.left === 0 &&
      left.colored.right === true,
    `got: ${JSON.stringify(left)}`,
  );

  const topLeft = computeTriangleBorders("top-left", 100, 50);
  check(
    "ucbucaq: the top-left corner uses only the top and right borders, colouring the top",
    topLeft.width.top === 50 &&
      topLeft.width.right === 100 &&
      topLeft.width.bottom === 0 &&
      topLeft.width.left === 0 &&
      topLeft.colored.top === true &&
      !topLeft.colored.right,
    `got: ${JSON.stringify(topLeft)}`,
  );

  const allDirections = [...ARROW_DIRECTIONS, ...CORNER_DIRECTIONS];
  const exactlyOneColored = allDirections.every((direction) => {
    const borders = computeTriangleBorders(direction, 80, 40);
    const coloredCount = Object.values(borders.colored).filter(Boolean).length;
    return coloredCount === 1;
  });
  check(
    "ucbucaq: every one of the eight directions colours exactly one side — two would draw a solid shape, not a triangle",
    exactlyOneColored,
    "expected coloredCount === 1 for all eight directions",
  );

  const arrowsHaveThreeSides = ARROW_DIRECTIONS.every((direction) => {
    const borders = computeTriangleBorders(direction, 80, 40);
    return Object.values(borders.width).filter((value) => value > 0).length === 3;
  });
  const cornersHaveTwoSides = CORNER_DIRECTIONS.every((direction) => {
    const borders = computeTriangleBorders(direction, 80, 40);
    return Object.values(borders.width).filter((value) => value > 0).length === 2;
  });
  check(
    "ucbucaq: an arrow occupies three border sides, a corner occupies two",
    arrowsHaveThreeSides && cornersHaveTwoSides,
    `arrows: ${arrowsHaveThreeSides}, corners: ${cornersHaveTwoSides}`,
  );

  const smallClip = buildClipPathCss("up", 50, 50, "red");
  const bigClip = buildClipPathCss("up", 400, 10, "red");
  const clipPolygon = smallClip.match(/clip-path: (.*);/)?.[1];
  check(
    "ucbucaq: the clip-path polygon is the same regardless of the box's own width and height — it is percentage-based",
    clipPolygon !== undefined && bigClip.includes(clipPolygon),
    `small: ${smallClip}, big: ${bigClip}`,
  );

  const negativeWidth = buildTriangle("up", -10, 50, "#ffffff");
  check(
    "ucbucaq: a negative width is rejected as an error, not a thrown exception",
    negativeWidth.borderCss === null && negativeWidth.errors.length > 0,
    `got: ${JSON.stringify(negativeWidth)}`,
  );

  const emptyColor = validateTriangleInput(100, 50, "  ");
  check(
    "ucbucaq: a blank colour is rejected",
    emptyColor.valid === false,
    `got: ${JSON.stringify(emptyColor)}`,
  );

  const fractional = buildTriangle("up", 1, 50, "#000000");
  check(
    "ucbucaq: a width of 1 is accepted and produces a fractional half-width rather than erroring",
    fractional.errors.length === 0 && fractional.borderCss !== null && fractional.borderCss.includes("0.5px"),
    `got: ${JSON.stringify(fractional)}`,
  );

  check(
    "ucbucaq: building the same triangle twice is deterministic",
    buildTriangle("up", 100, 50, "#ff0000").borderCss === buildTriangle("up", 100, 50, "#ff0000").borderCss,
    "expected two builds of the same input to match",
  );

  const known = buildTriangle("up", 100, 50, "#ff0000");
  check(
    "ucbucaq: the full border CSS matches the known config exactly",
    known.borderCss ===
      "width: 0;\nheight: 0;\nborder-style: solid;\nborder-width: 0px 50px 50px 50px;\nborder-color: transparent transparent #ff0000 transparent;",
    `got: ${JSON.stringify(known.borderCss)}`,
  );
};
