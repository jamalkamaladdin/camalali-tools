/**
 * `box-shadow` arithmetic: one layer's five numbers plus a colour, folded into
 * the CSS value a visitor pastes, and — the direction that actually breaks
 * silently on a careless edit — that same value read back into the numbers
 * that produced it.
 *
 * The colour is kept as a plain 6-digit HEX plus a separate 0-1 opacity
 * rather than one HEX-with-alpha string, because that is how the widget's two
 * controls (a colour swatch and an opacity slider) naturally split; `reng.ts`
 * already owns HEX parsing and `rgba()` formatting, so this file borrows
 * `parseHex`/`formatRgb` rather than re-deriving them.
 *
 * `parseBoxShadow` only has to undo `buildBoxShadow` — it is not a general
 * CSS parser. The assembly order is fixed (`[inset ]Xpx Ypx BLURpx SPREADpx
 * colour`), so the parser can be one anchored regular expression instead of a
 * tokeniser. That is also why the round-trip test in the check file is
 * meaningful rather than circular: the two functions are independent code
 * paths over the same shape, and a broken one shows up as a mismatch, not a
 * shared bug.
 */
import { formatRgb, parseHex, parseRgbFunction, type Rgba } from "./reng";

export type ShadowInput = {
  offsetX: number;
  offsetY: number;
  /** CSS forbids a negative blur radius — validated, not clamped. */
  blur: number;
  spread: number;
  /** 6-digit HEX, e.g. `#000000`. No embedded alpha — `opacity` carries that. */
  colorHex: string;
  /** 0-1. */
  opacity: number;
  inset: boolean;
};

export type ShadowBuildResult =
  | { ok: true; css: string; rgba: string }
  | { ok: false; error: string };

export type ShadowParseResult =
  | { ok: true; value: ShadowInput }
  | { ok: false; error: string };

/** Trims a float to at most 2 decimal places without leaving a trailing `.00`. */
function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatPx(value: number): string {
  return `${formatNumber(value)}px`;
}

/**
 * HEX + a separate opacity slider → the `Rgba` shape `reng.ts` already knows
 * how to print. Kept as its own export because the widget needs the parsed
 * colour for its live-preview swatch, not only for the assembled string.
 */
export function hexOpacityToRgba(
  hex: string,
  opacity: number,
): { ok: true; color: Rgba } | { ok: false; error: string } {
  const parsed = parseHex(hex.trim());
  if (!parsed) {
    return { ok: false, error: "Rəng HEX formatında deyil — #rrggbb gözlənilir." };
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    return { ok: false, error: "Qatılıq 0 ilə 1 arasında olmalıdır." };
  }
  return { ok: true, color: { r: parsed.r, g: parsed.g, b: parsed.b, a: opacity } };
}

export function buildBoxShadow(input: ShadowInput): ShadowBuildResult {
  if (!Number.isFinite(input.blur) || input.blur < 0) {
    return { ok: false, error: "Bulanıqlıq (blur) mənfi ola bilməz." };
  }
  if (!Number.isFinite(input.offsetX) || !Number.isFinite(input.offsetY) || !Number.isFinite(input.spread)) {
    return { ok: false, error: "Ofset və yayılma dəyərləri ədəd olmalıdır." };
  }

  const colorResult = hexOpacityToRgba(input.colorHex, input.opacity);
  if (!colorResult.ok) return colorResult;

  const rgba = formatRgb(colorResult.color);
  const parts = [
    input.inset ? "inset" : null,
    formatPx(input.offsetX),
    formatPx(input.offsetY),
    formatPx(input.blur),
    formatPx(input.spread),
    rgba,
  ].filter((part): part is string => part !== null);

  return { ok: true, css: parts.join(" "), rgba };
}

/*
 * Anchored to the exact shape `buildBoxShadow` emits — `inset` first when
 * present, four `px` lengths, then an `rgb()`/`rgba()` tail. A visitor's own
 * hand-written shadow (commas instead of spaces, a hex colour, a missing
 * unit) is out of scope on purpose: the round trip this proves is "does the
 * builder's own output survive being read back", not "can this parse any
 * CSS anyone could type".
 */
const SHADOW_PATTERN =
  /^(inset\s+)?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(-?[\d.]+)px\s+(rgba?\([^)]*\))$/i;

export function parseBoxShadow(css: string): ShadowParseResult {
  const trimmed = css.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sətir." };
  }

  const match = SHADOW_PATTERN.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: "Bu, bu alətin qurduğu formatda box-shadow sətrinə oxşamır.",
    };
  }

  const rgba = parseRgbFunction(match[6]);
  if (!rgba) {
    return { ok: false, error: "Rəng hissəsi rgb()/rgba() formatında deyil." };
  }

  return {
    ok: true,
    value: {
      inset: match[1] !== undefined,
      offsetX: Number(match[2]),
      offsetY: Number(match[3]),
      blur: Number(match[4]),
      spread: Number(match[5]),
      colorHex: `#${[rgba.r, rgba.g, rgba.b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`,
      opacity: rgba.a,
    },
  };
}
