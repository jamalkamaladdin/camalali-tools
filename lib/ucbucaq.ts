/**
 * The zero-size-box border trick that draws a triangle without an image or a
 * `clip-path`: a box with no width and no height still gets to have borders,
 * and each border renders as a trapezoid that tapers to a point exactly
 * where the (invisible) box's corner is — because that corner is shared by
 * all four borders when the box has no area, the trapezoid degenerates into
 * a triangle. Colouring one side and leaving its neighbours transparent (but
 * still present, since a transparent border still occupies width and shapes
 * the miter) is what turns that single triangle into an arrow. Colouring two
 * *adjacent* sides the same colour merges their two triangles into one that
 * fills a right-angled corner instead of pointing.
 *
 * `computeTriangleBorders` is the only place that geometry lives — it is a
 * lookup, not a calculation, because each of the eight directions is simply
 * "which two adjacent sides carry width, and which one of those two is the
 * one that gets a real colour rather than `transparent`." Getting that
 * lookup wrong is exactly the kind of silent breakage a wrong edit produces,
 * which is why the check file pins all eight down as known answers.
 */

export type ArrowDirection = "up" | "down" | "left" | "right";
export type CornerDirection = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type TriangleDirection = ArrowDirection | CornerDirection;

export type BorderSide = "top" | "right" | "bottom" | "left";

export const ARROW_DIRECTIONS: ArrowDirection[] = ["up", "down", "left", "right"];
export const CORNER_DIRECTIONS: CornerDirection[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
export const TRIANGLE_DIRECTIONS: TriangleDirection[] = [...ARROW_DIRECTIONS, ...CORNER_DIRECTIONS];

export type TriangleBorders = {
  width: Record<BorderSide, number>;
  /** `true` for the side(s) that carry the real colour; `false` renders `transparent`. */
  colored: Record<BorderSide, boolean>;
};

const TRANSPARENT_SIDE = { top: false, right: false, bottom: false, left: false };

/**
 * Which sides get width and which of those is coloured, for one direction.
 * `width` is the input `width` split across the two flanking sides for an
 * arrow (so the base is exactly `width` wide, apex to apex), or handed
 * whole to one axis for a corner; `height` is the pointing axis.
 */
export function computeTriangleBorders(
  direction: TriangleDirection,
  width: number,
  height: number,
): TriangleBorders {
  const half = width / 2;

  switch (direction) {
    case "up":
      return {
        width: { top: 0, right: half, bottom: height, left: half },
        colored: { ...TRANSPARENT_SIDE, bottom: true },
      };
    case "down":
      return {
        width: { top: height, right: half, bottom: 0, left: half },
        colored: { ...TRANSPARENT_SIDE, top: true },
      };
    case "left":
      return {
        width: { top: height / 2, right: width, bottom: height / 2, left: 0 },
        colored: { ...TRANSPARENT_SIDE, right: true },
      };
    case "right":
      return {
        width: { top: height / 2, right: 0, bottom: height / 2, left: width },
        colored: { ...TRANSPARENT_SIDE, left: true },
      };
    case "top-left":
      return {
        width: { top: height, right: width, bottom: 0, left: 0 },
        colored: { ...TRANSPARENT_SIDE, top: true },
      };
    case "top-right":
      return {
        width: { top: height, right: 0, bottom: 0, left: width },
        colored: { ...TRANSPARENT_SIDE, top: true },
      };
    case "bottom-left":
      return {
        width: { top: 0, right: width, bottom: height, left: 0 },
        colored: { ...TRANSPARENT_SIDE, bottom: true },
      };
    case "bottom-right":
      return {
        width: { top: 0, right: 0, bottom: height, left: width },
        colored: { ...TRANSPARENT_SIDE, bottom: true },
      };
  }
}

/** The right-angle corner a `clip-path` polygon needs — static per direction,
 * since a percentage polygon does not depend on the box's own pixel size. */
const CLIP_PATHS: Record<TriangleDirection, string> = {
  up: "polygon(50% 0%, 0% 100%, 100% 100%)",
  down: "polygon(0% 0%, 100% 0%, 50% 100%)",
  left: "polygon(100% 0%, 100% 100%, 0% 50%)",
  right: "polygon(0% 0%, 0% 100%, 100% 50%)",
  "top-left": "polygon(0% 0%, 100% 0%, 0% 100%)",
  "top-right": "polygon(0% 0%, 100% 0%, 100% 100%)",
  "bottom-left": "polygon(0% 0%, 0% 100%, 100% 100%)",
  "bottom-right": "polygon(100% 0%, 100% 100%, 0% 100%)",
};

export type TriangleValidation = { valid: boolean; errors: string[] };

export function validateTriangleInput(width: number, height: number, color: string): TriangleValidation {
  const errors: string[] = [];
  if (!Number.isFinite(width) || width <= 0) errors.push("En müsbət ədəd olmalıdır.");
  if (!Number.isFinite(height) || height <= 0) errors.push("Hündürlük müsbət ədəd olmalıdır.");
  if (color.trim() === "") errors.push("Rəng boş ola bilməz.");
  return { valid: errors.length === 0, errors };
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

const SIDE_ORDER: BorderSide[] = ["top", "right", "bottom", "left"];

export function buildBorderCss(borders: TriangleBorders, color: string): string {
  const widths = SIDE_ORDER.map((side) => `${formatNumber(borders.width[side])}px`).join(" ");
  const colors = SIDE_ORDER.map((side) => (borders.colored[side] ? color : "transparent")).join(" ");
  return [
    "width: 0;",
    "height: 0;",
    "border-style: solid;",
    `border-width: ${widths};`,
    `border-color: ${colors};`,
  ].join("\n");
}

export function buildClipPathCss(direction: TriangleDirection, width: number, height: number, color: string): string {
  return [
    `width: ${formatNumber(width)}px;`,
    `height: ${formatNumber(height)}px;`,
    `background: ${color};`,
    `clip-path: ${CLIP_PATHS[direction]};`,
  ].join("\n");
}

export type TriangleResult = {
  borderCss: string | null;
  clipPathCss: string | null;
  borders: TriangleBorders | null;
  errors: string[];
};

/** The one entry point that validates — everything else in this file is a
 * pure formatter that assumes sane numbers. */
export function buildTriangle(
  direction: TriangleDirection,
  width: number,
  height: number,
  color: string,
): TriangleResult {
  const { valid, errors } = validateTriangleInput(width, height, color);
  if (!valid) {
    return { borderCss: null, clipPathCss: null, borders: null, errors };
  }
  const borders = computeTriangleBorders(direction, width, height);
  return {
    borderCss: buildBorderCss(borders, color),
    clipPathCss: buildClipPathCss(direction, width, height, color),
    borders,
    errors: [],
  };
}
