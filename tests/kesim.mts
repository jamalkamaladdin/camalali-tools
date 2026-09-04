/*
 * What is worth checking here: each of the four shape functions against a
 * known-answer pair (the exact `clip-path` string CSS itself defines for
 * that input), the round-trip a visitor's hand-edited polygon actually goes
 * through (build a string, parse it back, get the same points), the
 * boundary of `inset`'s "round" clause (present above 0, absent at exactly
 * 0), a star preset's alternating outer/inner radii and a corner-cut's
 * parametric shape, and every validated path returning an error rather than
 * throwing on a malformed shape.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildClipPath,
  buildCornerCutPoints,
  buildPolygonClipPath,
  buildPresetShape,
  buildStarPoints,
  CLIP_PRESETS,
  parsePolygonClipPath,
  type Point,
} from "../lib/kesim";

export const checks: CheckSuite = (check) => {
  const circle = buildClipPath({ kind: "circle", config: { radius: 40, cx: 50, cy: 50 } });
  check(
    "kesim: circle formats to the exact CSS shape function for a known radius and centre",
    circle.ok && circle.value === "circle(40% at 50% 50%)",
    JSON.stringify(circle),
  );

  const ellipse = buildClipPath({ kind: "ellipse", config: { rx: 40, ry: 30, cx: 50, cy: 50 } });
  check(
    "kesim: ellipse formats both radii and the centre in the order CSS expects",
    ellipse.ok && ellipse.value === "ellipse(40% 30% at 50% 50%)",
    JSON.stringify(ellipse),
  );

  const insetRounded = buildClipPath({
    kind: "inset",
    config: { top: 10, right: 20, bottom: 30, left: 40, radius: 8 },
  });
  check(
    "kesim: inset with a positive radius appends the round clause in px",
    insetRounded.ok && insetRounded.value === "inset(10% 20% 30% 40% round 8px)",
    JSON.stringify(insetRounded),
  );

  const insetFlat = buildClipPath({
    kind: "inset",
    config: { top: 0, right: 0, bottom: 0, left: 0, radius: 0 },
  });
  check(
    "kesim: inset with a zero radius omits the round clause entirely rather than writing round 0px",
    insetFlat.ok && insetFlat.value === "inset(0% 0% 0% 0%)" && !insetFlat.value.includes("round"),
    JSON.stringify(insetFlat),
  );

  const triangle = buildPresetShape("ucbucaq");
  check(
    "kesim: the triangle preset is the three known apex-then-base points",
    triangle.kind === "polygon" &&
      JSON.stringify(triangle.points) ===
        JSON.stringify([
          { x: 50, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]),
    JSON.stringify(triangle),
  );

  const cornerCut = buildCornerCutPoints(20);
  check(
    "kesim: a 20% corner cut trims each corner to the known octagon points",
    JSON.stringify(cornerCut) ===
      JSON.stringify([
        { x: 20, y: 0 },
        { x: 80, y: 0 },
        { x: 100, y: 20 },
        { x: 100, y: 80 },
        { x: 80, y: 100 },
        { x: 20, y: 100 },
        { x: 0, y: 80 },
        { x: 0, y: 20 },
      ]),
    JSON.stringify(cornerCut),
  );

  const star = buildStarPoints(5, 50, 19, 50, 50);
  check(
    "kesim: a 5-point star has 10 vertices, starts pointing straight up, and alternates outer/inner radius",
    star.length === 10 &&
      star[0].x === 50 &&
      star[0].y === 0 &&
      star.every((p, i) => {
        const radius = Math.hypot(p.x - 50, p.y - 50);
        return i % 2 === 0 ? Math.abs(radius - 50) < 0.5 : Math.abs(radius - 19) < 0.5;
      }),
    JSON.stringify(star),
  );

  const points: Point[] = [
    { x: 33.33, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 66.67 },
  ];
  const built = buildPolygonClipPath(points);
  check(
    "kesim: a polygon string built from points and parsed back gives the same points (round-trip)",
    JSON.stringify(parsePolygonClipPath(built)) === JSON.stringify(points),
    `built: ${built}, parsed back: ${JSON.stringify(parsePolygonClipPath(built))}`,
  );

  check(
    "kesim: parsing a string that is not a polygon() call returns null rather than throwing",
    parsePolygonClipPath("not a polygon") === null && parsePolygonClipPath("circle(40% at 50% 50%)") === null,
    "expected null for both",
  );

  const tooFewPoints = buildClipPath({
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
  });
  check(
    "kesim: a polygon with fewer than 3 points returns an error result rather than emitting invalid CSS",
    !tooFewPoints.ok && tooFewPoints.error.length > 0,
    JSON.stringify(tooFewPoints),
  );

  const negativeRadius = buildClipPath({ kind: "circle", config: { radius: -1, cx: 50, cy: 50 } });
  check(
    "kesim: a non-positive circle radius returns an error result rather than a negative-radius CSS string",
    !negativeRadius.ok,
    JSON.stringify(negativeRadius),
  );

  check(
    "kesim: every preset resolves to a shape with at least 3 points, for all six presets",
    CLIP_PRESETS.every((preset) => {
      const shape = buildPresetShape(preset);
      return shape.kind === "polygon" && shape.points.length >= 3;
    }),
    `presets: ${JSON.stringify(CLIP_PRESETS)}`,
  );
};
