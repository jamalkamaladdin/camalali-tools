/**
 * `clip-path` builder: four CSS shape functions (`polygon`, `circle`,
 * `ellipse`, `inset`) formatted from a typed config, plus a small set of
 * ready-made polygons a visitor can drop straight into the point editor.
 *
 * `polygon` gets a matching parser (`parsePolygonClipPath`) that the other
 * three shapes do not, because it is the one shape whose editor lets a
 * visitor add and remove points freely — the widget round-trips a visitor's
 * edits through the same string this file emits, so a bug in either
 * direction would otherwise only surface as points silently drifting after
 * a few edits. `circle`/`ellipse`/`inset` are built from fixed numeric
 * fields instead, so there is nothing to parse back.
 *
 * The star and corner-cut presets are the only two built from a formula
 * rather than hand-placed numbers: a five-point star's geometry is genuinely
 * trigonometric (`buildStarPoints`), and a corner cut's eight points are the
 * same one-parameter shape at any cut size, so writing them by hand eight
 * times over would just be `buildCornerCutPoints` with the arithmetic done
 * by a human instead of by the function.
 */

export type Point = { x: number; y: number };

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatPercent(value: number): string {
  return `${round(value, 2)}%`;
}

/* ---------- polygon ---------- */

export function buildPolygonClipPath(points: Point[]): string {
  const body = points.map((p) => `${formatPercent(p.x)} ${formatPercent(p.y)}`).join(", ");
  return `polygon(${body})`;
}

function parsePercentToken(token: string): number | null {
  const match = /^(-?[\d.]+)%$/.exec(token.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * The inverse of `buildPolygonClipPath`. Returns `null` for anything that is
 * not a well-formed `polygon(...)` string — a typo in a hand-edited value, a
 * different shape function, an empty body — rather than throwing, since this
 * is called on every keystroke of the raw-value editor.
 */
export function parsePolygonClipPath(value: string): Point[] | null {
  const match = /^polygon\(([^)]*)\)$/i.exec(value.trim());
  if (!match) return null;

  const body = match[1].trim();
  if (body === "") return null;

  const points: Point[] = [];
  for (const part of body.split(",")) {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length !== 2) return null;
    const x = parsePercentToken(tokens[0]);
    const y = parsePercentToken(tokens[1]);
    if (x === null || y === null) return null;
    points.push({ x, y });
  }

  return points.length >= 3 ? points : null;
}

/* ---------- circle / ellipse / inset ---------- */

export type CircleConfig = { radius: number; cx: number; cy: number };
export type EllipseConfig = { rx: number; ry: number; cx: number; cy: number };
export type InsetConfig = { top: number; right: number; bottom: number; left: number; radius: number };

export function buildCircleClipPath(config: CircleConfig): string {
  return `circle(${formatPercent(config.radius)} at ${formatPercent(config.cx)} ${formatPercent(config.cy)})`;
}

export function buildEllipseClipPath(config: EllipseConfig): string {
  return `ellipse(${formatPercent(config.rx)} ${formatPercent(config.ry)} at ${formatPercent(config.cx)} ${formatPercent(config.cy)})`;
}

/** `radius` is written in px (CSS `inset()` takes a length for its `round` radius, not a percentage of a box whose two axes may differ). A radius of exactly 0 omits the `round` clause rather than writing `round 0px`, since a plain rectangle needs no rounding term at all. */
export function buildInsetClipPath(config: InsetConfig): string {
  const edges = `${formatPercent(config.top)} ${formatPercent(config.right)} ${formatPercent(config.bottom)} ${formatPercent(config.left)}`;
  return config.radius > 0 ? `inset(${edges} round ${round(config.radius, 2)}px)` : `inset(${edges})`;
}

/* ---------- validated dispatch ---------- */

export type ClipShape =
  | { kind: "polygon"; points: Point[] }
  | { kind: "circle"; config: CircleConfig }
  | { kind: "ellipse"; config: EllipseConfig }
  | { kind: "inset"; config: InsetConfig };

export type ClipResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validates and formats in one step — the widget always has exactly one
 * `ClipResult` to render (the shape string or the reason it could not be
 * built), never a formatted string it has to separately guess is valid.
 */
export function buildClipPath(shape: ClipShape): ClipResult {
  switch (shape.kind) {
    case "polygon": {
      if (shape.points.length < 3) {
        return { ok: false, error: "Poliqon ən azı 3 nöqtə tələb edir." };
      }
      if (shape.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
        return { ok: false, error: "Bütün nöqtələrin koordinatları ədəd olmalıdır." };
      }
      return { ok: true, value: buildPolygonClipPath(shape.points) };
    }
    case "circle": {
      if (!Number.isFinite(shape.config.radius) || shape.config.radius <= 0) {
        return { ok: false, error: "Radius müsbət ədəd olmalıdır." };
      }
      if (!Number.isFinite(shape.config.cx) || !Number.isFinite(shape.config.cy)) {
        return { ok: false, error: "Mərkəz koordinatları ədəd olmalıdır." };
      }
      return { ok: true, value: buildCircleClipPath(shape.config) };
    }
    case "ellipse": {
      if (!Number.isFinite(shape.config.rx) || shape.config.rx <= 0) {
        return { ok: false, error: "Üfüqi radius (rx) müsbət ədəd olmalıdır." };
      }
      if (!Number.isFinite(shape.config.ry) || shape.config.ry <= 0) {
        return { ok: false, error: "Şaquli radius (ry) müsbət ədəd olmalıdır." };
      }
      if (!Number.isFinite(shape.config.cx) || !Number.isFinite(shape.config.cy)) {
        return { ok: false, error: "Mərkəz koordinatları ədəd olmalıdır." };
      }
      return { ok: true, value: buildEllipseClipPath(shape.config) };
    }
    case "inset": {
      const { top, right, bottom, left, radius } = shape.config;
      if ([top, right, bottom, left].some((edge) => !Number.isFinite(edge) || edge < 0)) {
        return { ok: false, error: "Dörd kənar da mənfi olmayan ədəd olmalıdır." };
      }
      if (!Number.isFinite(radius) || radius < 0) {
        return { ok: false, error: "Radius mənfi olmayan ədəd olmalıdır." };
      }
      return { ok: true, value: buildInsetClipPath(shape.config) };
    }
  }
}

/* ---------- presets ---------- */

export type ClipPreset = "ucbucaq" | "romb" | "altibucaq" | "ulduz" | "dalga" | "kunc-kesimi";

export const CLIP_PRESETS: ClipPreset[] = ["ucbucaq", "romb", "altibucaq", "ulduz", "dalga", "kunc-kesimi"];

export const CLIP_PRESET_LABELS: Record<ClipPreset, string> = {
  ucbucaq: "Üçbucaq",
  romb: "Romb",
  altibucaq: "Altıbucaq",
  ulduz: "Ulduz",
  dalga: "Dalğa",
  "kunc-kesimi": "Künc kəsimi",
};

const TRIANGLE_POINTS: Point[] = [
  { x: 50, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const RHOMBUS_POINTS: Point[] = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
];

const HEXAGON_POINTS: Point[] = [
  { x: 25, y: 0 },
  { x: 75, y: 0 },
  { x: 100, y: 50 },
  { x: 75, y: 100 },
  { x: 25, y: 100 },
  { x: 0, y: 50 },
];

/**
 * A five-point star as ten alternating outer/inner vertices around a centre,
 * the general shape any N-point star clip-path reduces to. Angles start
 * pointing straight up (`-90°`) so the star sits the way a visitor expects
 * to see one drawn, not tipped onto a side.
 */
export function buildStarPoints(
  spikes: number,
  outerRadius: number,
  innerRadius: number,
  cx: number,
  cy: number,
): Point[] {
  const points: Point[] = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * step;
    points.push({
      x: round(cx + radius * Math.cos(angle), 2),
      y: round(cy + radius * Math.sin(angle), 2),
    });
  }
  return points;
}

const STAR_POINTS = buildStarPoints(5, 50, 19, 50, 50);

/**
 * An octagon that trims all four corners of the box by the same amount —
 * the one-parameter shape a "cut corner" card or button uses. `cutPercent`
 * has to stay under 50: past that the two cuts on a single edge would
 * overlap and the polygon would self-intersect.
 */
export function buildCornerCutPoints(cutPercent: number): Point[] {
  const c = round(cutPercent, 2);
  return [
    { x: c, y: 0 },
    { x: 100 - c, y: 0 },
    { x: 100, y: c },
    { x: 100, y: 100 - c },
    { x: 100 - c, y: 100 },
    { x: c, y: 100 },
    { x: 0, y: 100 - c },
    { x: 0, y: c },
  ];
}

const DEFAULT_CORNER_CUT_PERCENT = 20;

/**
 * A wave along the bottom edge, built from straight segments rather than a
 * curve — `clip-path: polygon()` cannot draw one. Depth alternates every 20%
 * of the width between two fixed levels, which reads as a wave at the sizes
 * a banner or a section divider actually uses.
 */
function buildWavePoints(): Point[] {
  const bottomXs = [0, 20, 40, 60, 80, 100];
  const bottom: Point[] = bottomXs.map((x, i) => ({ x, y: i % 2 === 0 ? 100 : 82 }));
  return [{ x: 0, y: 0 }, { x: 100, y: 0 }, ...[...bottom].reverse()];
}

const WAVE_POINTS = buildWavePoints();

export function buildPresetShape(preset: ClipPreset): ClipShape {
  switch (preset) {
    case "ucbucaq":
      return { kind: "polygon", points: TRIANGLE_POINTS };
    case "romb":
      return { kind: "polygon", points: RHOMBUS_POINTS };
    case "altibucaq":
      return { kind: "polygon", points: HEXAGON_POINTS };
    case "ulduz":
      return { kind: "polygon", points: STAR_POINTS };
    case "dalga":
      return { kind: "polygon", points: WAVE_POINTS };
    case "kunc-kesimi":
      return { kind: "polygon", points: buildCornerCutPoints(DEFAULT_CORNER_CUT_PERCENT) };
  }
}
