/**
 * A realistic multi-layer shadow for a single "how high does this sit"
 * number, 1 through 6 — the way a native UI toolkit's elevation scale works,
 * rather than one `box-shadow` value with one blur.
 *
 * A single shadow layer reads as flat because it has one light source at one
 * distance. Real ambient light is the sum of a sharp, dark shadow from
 * nearby occlusion and a soft, pale shadow from the light bouncing further
 * out — so each level here is 2-4 stacked layers, computed from `level` and
 * the layer's distance (`step`) rather than typed in by hand: the near layer
 * (`step` 1) gets a small offset/blur and the darkest opacity, the far layer
 * gets the largest offset/blur and the palest opacity. That monotonic
 * relationship, not any one pixel value, is what the check file holds this
 * to — a wrong edit that still "looks like a shadow" most often breaks the
 * monotonicity first.
 *
 * `TAILWIND_SHADOW_REFERENCE` is not computed — it is Tailwind CSS's own
 * published default `boxShadow` scale (`shadow-sm` … `shadow-2xl`), copied
 * verbatim so the widget can show "this is roughly Tailwind's `shadow-md`"
 * without inventing a number.
 */
import { formatRgb } from "./reng";

export type ElevationLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type ElevationLayer = {
  offsetY: number;
  blur: number;
  /** 0-1, rounded to 3 decimals. */
  opacity: number;
};

export type ElevationResult =
  | { ok: true; level: ElevationLevel; layers: ElevationLayer[]; css: string }
  | { ok: false; error: string };

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 1-2 → two layers, 3-4 → three, 5-6 → four — the "2-4 qat" the tool promises, keyed to the level rather than fixed. */
function layerCountFor(level: ElevationLevel): number {
  if (level <= 2) return 2;
  if (level <= 4) return 3;
  return 4;
}

export function elevationLayers(level: ElevationLevel): ElevationLayer[] {
  const count = layerCountFor(level);
  const layers: ElevationLayer[] = [];
  for (let step = 1; step <= count; step += 1) {
    const offsetY = level * step;
    const blur = offsetY * 2;
    const opacity = round3(clamp(0.24 - step * 0.04 - (level - 1) * 0.005, 0.03, 0.24));
    layers.push({ offsetY, blur, opacity });
  }
  return layers;
}

export function computeElevation(levelInput: number): ElevationResult {
  if (!Number.isInteger(levelInput) || levelInput < 1 || levelInput > 6) {
    return { ok: false, error: "Yüksəklik 1 ilə 6 arasında tam ədəd olmalıdır." };
  }
  const level = levelInput as ElevationLevel;
  const layers = elevationLayers(level);
  const css = layers
    .map((layer) => `0px ${layer.offsetY}px ${layer.blur}px 0px ${formatRgb({ r: 0, g: 0, b: 0, a: layer.opacity })}`)
    .join(", ");

  return { ok: true, level, layers, css };
}

/**
 * Tailwind CSS's default theme `boxShadow` scale (`tailwindcss/defaultTheme`),
 * unchanged since it shipped — the values a visitor would already be using if
 * their project is on Tailwind. One entry per elevation level here, in the
 * same near-to-far order.
 */
export const TAILWIND_SHADOW_REFERENCE: Record<ElevationLevel, { className: string; css: string }> = {
  1: { className: "shadow-sm", css: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
  2: {
    className: "shadow",
    css: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  },
  3: {
    className: "shadow-md",
    css: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  },
  4: {
    className: "shadow-lg",
    css: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
  5: {
    className: "shadow-xl",
    css: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },
  6: { className: "shadow-2xl", css: "0 25px 50px -12px rgb(0 0 0 / 0.25)" },
};
