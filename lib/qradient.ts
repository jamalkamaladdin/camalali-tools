/**
 * Gradient arithmetic: a list of colour stops a visitor can drag into any
 * order, folded into the one CSS function (`linear-gradient`,
 * `radial-gradient` or `conic-gradient`) that actually reads them
 * left-to-right by position — not by the order they were added or dragged
 * in. That reordering is the one piece of arithmetic here worth a named
 * function (`sortStops`) and its own test: a wrong edit that stopped
 * sorting would still produce a syntactically valid gradient, just a wrong
 * one, which is exactly the silent-break shape this file's checks exist
 * for.
 *
 * A stop's colour is kept as whatever string the visitor typed (a HEX, an
 * `rgba()`, a named colour like `transparent`) rather than routed through
 * `reng.ts`'s parser — CSS gradients accept any `<color>`, including the
 * keyword `transparent`, which is not a colour `reng.ts` can parse. The only
 * thing validated about it here is that it is not empty.
 */

export type GradientType = "linear" | "radial" | "conic";

export type GradientStop = {
  /** Any CSS `<color>` the visitor typed — not re-validated beyond "not empty". */
  color: string;
  /** 0-100. */
  position: number;
};

export type GradientInput = {
  type: GradientType;
  /** Degrees — used by `linear` (direction) and `conic` (start angle). Any real number; wrapped into 0-360. */
  angleDeg: number;
  /** 0-100 — the centre, used by `radial` and `conic`. */
  centerX: number;
  centerY: number;
  stops: GradientStop[];
};

export type GradientBuildResult =
  | { ok: true; css: string; sortedStops: GradientStop[] }
  | { ok: false; error: string };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Wraps any real number of degrees into `[0, 360)`, the way a CSS `<angle>` visually repeats. */
function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Ascending by `position` — the order every gradient function actually paints in, independent of how the stops were entered. */
export function sortStops(stops: GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

function formatStops(stops: GradientStop[]): string {
  return stops.map((stop) => `${stop.color} ${round1(stop.position)}%`).join(", ");
}

export function buildGradient(input: GradientInput): GradientBuildResult {
  if (input.stops.length < 2) {
    return { ok: false, error: "Ən azı iki dayanacaq lazımdır." };
  }
  for (const stop of input.stops) {
    if (stop.color.trim() === "") {
      return { ok: false, error: "Dayanacağın rəngi boş ola bilməz." };
    }
    if (!Number.isFinite(stop.position) || stop.position < 0 || stop.position > 100) {
      return {
        ok: false,
        error: `Dayanacaq faizi 0-100 aralığında olmalıdır: "${stop.position}" yanlışdır.`,
      };
    }
  }

  const sortedStops = sortStops(input.stops);
  const stopsCss = formatStops(sortedStops);
  const angle = round1(normalizeAngle(input.angleDeg));
  const cx = round1(clampPercent(input.centerX));
  const cy = round1(clampPercent(input.centerY));

  let css: string;
  switch (input.type) {
    case "linear":
      css = `linear-gradient(${angle}deg, ${stopsCss})`;
      break;
    case "radial":
      css = `radial-gradient(circle at ${cx}% ${cy}%, ${stopsCss})`;
      break;
    case "conic":
      css = `conic-gradient(from ${angle}deg at ${cx}% ${cy}%, ${stopsCss})`;
      break;
  }

  return { ok: true, css, sortedStops };
}

/** A new stop, defaulted rather than left for the caller to invent a shape for. */
export function addStop(stops: GradientStop[], color = "#ffffff", position = 50): GradientStop[] {
  return [...stops, { color, position }];
}

/** Drops one stop by index. Does not enforce a minimum — `buildGradient` is what refuses fewer than two. */
export function removeStop(stops: GradientStop[], index: number): GradientStop[] {
  return stops.filter((_, i) => i !== index);
}
