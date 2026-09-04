/**
 * Glassmorphism arithmetic: the handful of declarations that together read
 * as "frosted glass" — a `backdrop-filter`, a translucent fill, a thin pale
 * edge and a soft drop shadow — assembled from the visitor's numbers into
 * the exact block they paste.
 *
 * `backdrop-filter` is still the one property Safari only accepts prefixed,
 * so `webkitBackdropFilter` is not a separate computation: it is asserted
 * equal to `backdropFilter` by construction, in one place, so the two can
 * never drift apart the way they would if the widget built each string by
 * hand. The check file holds that equality directly rather than re-deriving
 * either value, because a copy-paste edit to only one of the two lines is
 * exactly the silent break this split exists to catch.
 *
 * Colours reuse `reng.ts`'s HEX parser and `rgba()` formatter, the same as
 * `kolge.ts` — both tools take a HEX plus a separate 0-1 opacity because
 * that is how their sliders are actually wired.
 */
import { formatRgb, parseHex } from "./reng";

export type GlassInput = {
  /** px, ≥0. 0 means "no blur" — the fill and border still read as glass. */
  blur: number;
  /** Percent, ≥0. 100 is the CSS default (no change); values above it boost colour past what is behind the panel. */
  saturate: number;
  backgroundHex: string;
  backgroundOpacity: number;
  borderHex: string;
  borderOpacity: number;
  /** px, ≥0. */
  borderWidth: number;
  /** px, ≥0 — the shadow's blur radius; its vertical offset is derived from it, not entered separately. */
  shadowBlur: number;
  shadowOpacity: number;
};

export type GlassCss = {
  backdropFilter: string;
  webkitBackdropFilter: string;
  background: string;
  border: string;
  boxShadow: string;
  /** The full declaration block, ready to paste into a rule. */
  fullBlock: string;
};

export type GlassResult = { ok: true; css: GlassCss } | { ok: false; error: string };

function requireNonNegative(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value < 0) return `${label} mənfi ola bilməz.`;
  return null;
}

function requireOpacity(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return `${label} 0 ilə 1 arasında olmalıdır.`;
  return null;
}

export function buildGlass(input: GlassInput): GlassResult {
  const numericError =
    requireNonNegative(input.blur, "Bulanıqlıq (blur)") ??
    requireNonNegative(input.saturate, "Doyma (saturate)") ??
    requireNonNegative(input.borderWidth, "Kənar qalınlığı") ??
    requireNonNegative(input.shadowBlur, "Kölgənin bulanıqlığı") ??
    requireOpacity(input.backgroundOpacity, "Fonun qatılığı") ??
    requireOpacity(input.borderOpacity, "Kənarın qatılığı") ??
    requireOpacity(input.shadowOpacity, "Kölgənin qatılığı");
  if (numericError) return { ok: false, error: numericError };

  const background = parseHex(input.backgroundHex.trim());
  if (!background) {
    return { ok: false, error: "Fon rəngi HEX formatında deyil — #rrggbb gözlənilir." };
  }
  const border = parseHex(input.borderHex.trim());
  if (!border) {
    return { ok: false, error: "Kənar rəngi HEX formatında deyil — #rrggbb gözlənilir." };
  }

  const filter = `blur(${round1(input.blur)}px) saturate(${round1(input.saturate)}%)`;
  const backgroundCss = formatRgb({ ...background, a: input.backgroundOpacity });
  const borderCss = formatRgb({ ...border, a: input.borderOpacity });
  const shadowOffsetY = round1(input.shadowBlur / 2);
  const shadowCss = `0px ${shadowOffsetY}px ${round1(input.shadowBlur)}px ${formatRgb({ r: 0, g: 0, b: 0, a: input.shadowOpacity })}`;
  const borderDeclaration = `${round1(input.borderWidth)}px solid ${borderCss}`;

  const fullBlock = [
    `background: ${backgroundCss};`,
    `backdrop-filter: ${filter};`,
    `-webkit-backdrop-filter: ${filter};`,
    `border: ${borderDeclaration};`,
    `box-shadow: ${shadowCss};`,
  ].join("\n");

  return {
    ok: true,
    css: {
      backdropFilter: filter,
      webkitBackdropFilter: filter,
      background: backgroundCss,
      border: borderDeclaration,
      boxShadow: shadowCss,
      fullBlock,
    },
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
