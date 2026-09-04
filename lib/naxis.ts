/**
 * Five background patterns built from gradients rather than an image file —
 * a `background-image` a visitor can resize, recolour and re-copy as text,
 * with nothing to host or cache.
 *
 * Two of the five (stripes, the line grid) tile on their own: a
 * `repeating-linear-gradient` repeats along its own gradient axis, so the
 * `background-image` line is the whole story. The other three (the dot
 * grid, the checkerboard, the zigzag) are two-dimensional patterns, and a
 * linear or radial gradient only repeats along one axis — the second
 * dimension has to come from tiling a plain gradient with `background-size`,
 * which is why those three also carry a `backgroundSize` (and, for the
 * checkerboard and the zigzag, a `backgroundPosition`) alongside the image
 * value. `buildPattern`'s `backgroundImage` field is always the one line the
 * widget highlights for copying; `declaration` is the full block a visitor
 * pastes when the pattern needs the supporting properties too.
 *
 * The checkerboard's four-layer 45°/-45° recipe (stops at 25% and 75%, size
 * doubled, positions offset by half a step) is the standard published
 * technique for it. The zigzag's two-layer 135°/225° recipe is this file's
 * own construction from the same corner-triangle gradient primitive, offset
 * by half a step to alternate — it has not been checked against a rendered
 * page, only against its own arithmetic, so treat its exact silhouette as
 * unverified until it has been looked at in a browser.
 */

export type PatternKind = "stripes" | "checkerboard" | "dots" | "grid" | "zigzag";

export const PATTERN_KINDS: PatternKind[] = ["stripes", "checkerboard", "dots", "grid", "zigzag"];

/** Whether a kind's shape responds to the angle control — the two symmetric
 * patterns (checkerboard, dots) ignore it and always use their own fixed
 * angles. */
export function patternUsesAngle(kind: PatternKind): boolean {
  return kind === "stripes" || kind === "grid" || kind === "zigzag";
}

export type PatternConfig = {
  kind: PatternKind;
  colorA: string;
  colorB: string;
  stepPx: number;
  angleDeg: number;
};

export type PatternResult = {
  backgroundImage: string | null;
  backgroundSize: string | null;
  backgroundPosition: string | null;
  declaration: string | null;
  errors: string[];
};

export type PatternValidation = { valid: boolean; errors: string[] };

export function validatePatternConfig(config: PatternConfig): PatternValidation {
  const errors: string[] = [];
  if (!Number.isFinite(config.stepPx) || config.stepPx <= 0) errors.push("Addım ölçüsü müsbət ədəd olmalıdır.");
  if (!Number.isFinite(config.angleDeg)) errors.push("Bucaq ədəd olmalıdır.");
  if (config.colorA.trim() === "") errors.push("Birinci rəng boş ola bilməz.");
  if (config.colorB.trim() === "") errors.push("İkinci rəng boş ola bilməz.");
  return { valid: errors.length === 0, errors };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildStripesImage(colorA: string, colorB: string, stepPx: number, angleDeg: number): string {
  const half = round(stepPx / 2);
  return `repeating-linear-gradient(${round(angleDeg)}deg, ${colorA} 0px, ${colorA} ${half}px, ${colorB} ${half}px, ${round(stepPx)}px)`;
}

function buildGridImage(colorA: string, colorB: string, stepPx: number, angleDeg: number): string {
  const lineWidth = Math.max(1, Math.round(stepPx / 16));
  const layer = (angle: number) =>
    `repeating-linear-gradient(${round(angle)}deg, ${colorB} 0px, ${colorB} ${lineWidth}px, transparent ${lineWidth}px, transparent ${round(stepPx)}px)`;
  return `${layer(angleDeg)}, ${layer(angleDeg + 90)}`;
}

function buildZigzagLayers(colorB: string, angleDeg: number): string {
  const layer = (angle: number) => `linear-gradient(${round(angle)}deg, ${colorB} 25%, transparent 25%)`;
  return `${layer(135 + angleDeg)}, ${layer(225 + angleDeg)}`;
}

function buildDotsImage(colorB: string, dotRadius: number): string {
  return `radial-gradient(${colorB} ${dotRadius}px, transparent ${dotRadius}px)`;
}

function buildCheckerboardImage(colorB: string): string {
  return [
    `linear-gradient(45deg, ${colorB} 25%, transparent 25%)`,
    `linear-gradient(-45deg, ${colorB} 25%, transparent 25%)`,
    `linear-gradient(45deg, transparent 75%, ${colorB} 75%)`,
    `linear-gradient(-45deg, transparent 75%, ${colorB} 75%)`,
  ].join(", ");
}

function buildDeclaration(
  colorA: string,
  backgroundImage: string,
  backgroundSize: string | null,
  backgroundPosition: string | null,
): string {
  const lines = [`background-color: ${colorA};`, `background-image: ${backgroundImage};`];
  if (backgroundSize) lines.push(`background-size: ${backgroundSize};`);
  if (backgroundPosition) lines.push(`background-position: ${backgroundPosition};`);
  return lines.join("\n");
}

/** The one entry point that validates — every `build*Image` helper above
 * assumes it was already handed sane numbers and never throws on its own. */
export function buildPattern(config: PatternConfig): PatternResult {
  const { valid, errors } = validatePatternConfig(config);
  if (!valid) {
    return { backgroundImage: null, backgroundSize: null, backgroundPosition: null, declaration: null, errors };
  }

  const { kind, colorA, colorB, stepPx, angleDeg } = config;
  const step = round(stepPx);
  const half = round(stepPx / 2);

  switch (kind) {
    case "stripes": {
      const image = buildStripesImage(colorA, colorB, stepPx, angleDeg);
      return {
        backgroundImage: image,
        backgroundSize: null,
        backgroundPosition: null,
        declaration: `background-image: ${image};`,
        errors: [],
      };
    }
    case "grid": {
      const image = buildGridImage(colorA, colorB, stepPx, angleDeg);
      return {
        backgroundImage: image,
        backgroundSize: null,
        backgroundPosition: null,
        declaration: buildDeclaration(colorA, image, null, null),
        errors: [],
      };
    }
    case "zigzag": {
      const image = buildZigzagLayers(colorB, angleDeg);
      const size = `${step}px ${step}px`;
      const position = `0 0, ${half}px 0`;
      return {
        backgroundImage: image,
        backgroundSize: size,
        backgroundPosition: position,
        declaration: buildDeclaration(colorA, image, size, position),
        errors: [],
      };
    }
    case "dots": {
      const dotRadius = Math.max(1, Math.round(stepPx / 6));
      const image = buildDotsImage(colorB, dotRadius);
      const size = `${step}px ${step}px`;
      return {
        backgroundImage: image,
        backgroundSize: size,
        backgroundPosition: null,
        declaration: buildDeclaration(colorA, image, size, null),
        errors: [],
      };
    }
    case "checkerboard": {
      const image = buildCheckerboardImage(colorB);
      const size = `${step}px ${step}px`;
      const position = `0 0, 0 ${half}px, ${half}px -${half}px, -${half}px 0px`;
      return {
        backgroundImage: image,
        backgroundSize: size,
        backgroundPosition: position,
        declaration: buildDeclaration(colorA, image, size, position),
        errors: [],
      };
    }
  }
}
