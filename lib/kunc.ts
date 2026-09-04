/**
 * `border-radius` arithmetic: four corners, each possibly elliptical
 * (a horizontal and a vertical radius), collapsed to the shortest CSS value
 * that still means exactly the same thing.
 *
 * The collapsing is the whole reason this file exists rather than a template
 * string in the widget. Four visitor-typed numbers that all happen to match
 * should not come out as `12px 12px 12px 12px` — CSS itself accepts the
 * single value `12px` for that, and a tool that always prints the long form
 * would be teaching a visitor to over-specify their own CSS. `buildRadius`
 * checks three shapes in order — one circular value for all four corners,
 * one elliptical pair for all four, or the fully explicit form — and a wrong
 * edit to that order is exactly the kind of silent breakage the check file
 * is written to catch.
 */

export type RadiusUnit = "px" | "%";

export type CornerRadius = {
  horizontal: number;
  vertical: number;
};

export type RadiusInput = {
  topLeft: CornerRadius;
  topRight: CornerRadius;
  bottomRight: CornerRadius;
  bottomLeft: CornerRadius;
  unit: RadiusUnit;
};

export type RadiusResult =
  | { ok: true; css: string; collapsed: boolean; elliptical: boolean }
  | { ok: false; error: string };

/** Trims a float to at most 2 decimal places without a trailing `.00`. */
function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function corners(input: RadiusInput): CornerRadius[] {
  return [input.topLeft, input.topRight, input.bottomRight, input.bottomLeft];
}

function sameCorner(a: CornerRadius, b: CornerRadius): boolean {
  return a.horizontal === b.horizontal && a.vertical === b.vertical;
}

export function buildBorderRadius(input: RadiusInput): RadiusResult {
  const all = corners(input);
  for (const corner of all) {
    if (
      !Number.isFinite(corner.horizontal) ||
      !Number.isFinite(corner.vertical) ||
      corner.horizontal < 0 ||
      corner.vertical < 0
    ) {
      return { ok: false, error: "Künc dəyəri mənfi olmayan ədəd olmalıdır." };
    }
  }

  const unit = input.unit;
  const withUnit = (value: number) => `${formatNumber(value)}${unit}`;

  // Same (horizontal, vertical) pair on all four corners: one circular value,
  // or one elliptical "h / v" pair if the two radii of that shared pair differ.
  const first = all[0];
  if (all.every((corner) => sameCorner(corner, first))) {
    if (first.horizontal === first.vertical) {
      return { ok: true, css: withUnit(first.horizontal), collapsed: true, elliptical: false };
    }
    return {
      ok: true,
      css: `${withUnit(first.horizontal)} / ${withUnit(first.vertical)}`,
      collapsed: true,
      elliptical: true,
    };
  }

  // Corners differ, but none of them is itself elliptical: the plain
  // four-value form, no slash.
  const anyElliptical = all.some((corner) => corner.horizontal !== corner.vertical);
  if (!anyElliptical) {
    return {
      ok: true,
      css: all.map((corner) => withUnit(corner.horizontal)).join(" "),
      collapsed: false,
      elliptical: false,
    };
  }

  // The fully explicit eight-value form: four horizontal radii, a slash,
  // four vertical radii — the one shape that can express any combination.
  const horizontalPart = all.map((corner) => withUnit(corner.horizontal)).join(" ");
  const verticalPart = all.map((corner) => withUnit(corner.vertical)).join(" ");
  return { ok: true, css: `${horizontalPart} / ${verticalPart}`, collapsed: false, elliptical: true };
}
