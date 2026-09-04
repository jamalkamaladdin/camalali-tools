/**
 * Colour conversion (HEX / RGB / HSL / OKLCH), WCAG contrast checking and a
 * colour-blindness preview.
 *
 * Everything routes through one canonical shape, `Rgba` (0-255 integer
 * channels, alpha 0-1): parsing turns any of the four text formats into it,
 * and formatting turns it back into all four. A tool that instead kept four
 * separate string states in sync would drift the moment one field was typed
 * into and the others were not re-derived — this way there is exactly one
 * source of truth per colour.
 *
 * OKLCH is not a bonus format here. This project writes Tailwind 4's colours
 * in OKLCH (see `src/app/globals.css`), so a converter that only offered
 * HEX/RGB/HSL would be useless for reading the site's own palette.
 */

export type Rgba = {
  /** 0-255, not necessarily integer until the value is formatted or compared. */
  r: number;
  g: number;
  b: number;
  /** 0-1. */
  a: number;
};

export type Hsla = {
  /** 0-360. */
  h: number;
  /** 0-100. */
  s: number;
  /** 0-100. */
  l: number;
  a: number;
};

export type Oklcha = {
  /** 0-1, not a percentage — `formatOklch` is what turns it into one. */
  l: number;
  /** Unbounded in principle; sRGB colours land under ~0.4. */
  c: number;
  /** 0-360. 0 by convention when the colour is achromatic — see `rgbToOklch`. */
  h: number;
  a: number;
};

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

export type ParsedColor =
  | { ok: true; color: Rgba; format: ColorFormat }
  | { ok: false; error: string };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/* ---------- sRGB <-> linear ----------
 *
 * `srgbToLinear` is copied from `scripts/contrast-check.mjs` on purpose, not
 * reimplemented from the WCAG spec independently: that script is the gate the
 * whole site's contrast is judged against, so if this tool computed the curve
 * even slightly differently the two would disagree about the same pixels, and
 * a visitor would have no way to tell which one was lying.
 */

function srgbToLinear(channel255: number): number {
  const value = channel255 / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** The companion inverse curve — contrast-check.mjs never needs it, OKLCH does. */
function linearToSrgb255(linear: number): number {
  const value = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return value * 255;
}

/* ---------- HEX ---------- */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function hexByte(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

export function parseHex(raw: string): Rgba | null {
  const match = HEX_RE.exec(raw.trim());
  if (!match) return null;

  // #rgb and #rgba are shorthand where every nibble is doubled — #abc is
  // #aabbcc, not #a0b0c0 — so "abc" and "aabbcc" have to parse to one value.
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

export function formatHex(color: Rgba, options: { uppercase?: boolean } = {}): string {
  let hex = `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`;
  if (color.a < 1) hex += hexByte(color.a * 255);
  return options.uppercase ? hex.toUpperCase() : hex;
}

/* ---------- shared token parsing for the function syntaxes ---------- */

/** `255`, `100%` -> a 0-255 channel value. `null` on bad syntax or out-of-range input — a channel is never silently clamped into validity. */
function parseChannelToken(token: string): number | null {
  const percent = /^(-?[\d.]+)%$/.exec(token);
  if (percent) {
    const pct = Number(percent[1]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    return (pct / 100) * 255;
  }
  const value = Number(token);
  if (!Number.isFinite(value) || value < 0 || value > 255) return null;
  return value;
}

/** `0.5`, `50%` -> a 0-1 alpha. */
function parseAlphaToken(token: string): number | null {
  const percent = /^(-?[\d.]+)%$/.exec(token);
  if (percent) {
    const pct = Number(percent[1]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    return pct / 100;
  }
  const value = Number(token);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

/** `180`, `180deg` -> a hue folded into 0-360. Hue has no invalid range — CSS lets it wrap, so -30 means 330 rather than an error. */
function parseHueToken(token: string): number | null {
  const match = /^(-?[\d.]+)(deg)?$/i.exec(token.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

/** `50%` -> 0-100, rejecting the bare-number form: CSS requires the sign on saturation/lightness so `hsl(0, 50, 50)` cannot be mistaken for a fraction. */
function parsePercentToken(token: string): number | null {
  const match = /^(-?[\d.]+)%$/.exec(token.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

/**
 * Splits `fn(...)` body into its channel tokens and an optional alpha token,
 * accepting both syntaxes CSS allows: comma-separated with alpha as a 4th
 * argument (`rgba(255, 0, 0, .5)`), and space-separated with a slash
 * (`rgb(255 0 0 / 50%)`). Shared by rgb/hsl since both take exactly this shape.
 */
function splitFunctionBody(body: string): { channels: string[]; alpha: string | undefined } {
  const [channelsPart, alphaPart] = body.split("/");
  const separator = channelsPart.includes(",") ? "," : /\s+/;
  const tokens = channelsPart
    .split(separator)
    .map((t) => t.trim())
    .filter(Boolean);

  let alpha = alphaPart?.trim();
  if (alpha === undefined && tokens.length === 4) {
    const popped = tokens.pop();
    if (popped !== undefined) alpha = popped;
  }

  return { channels: tokens, alpha };
}

/* ---------- RGB ---------- */

export function parseRgbFunction(raw: string): Rgba | null {
  const match = /^rgba?\(([^)]*)\)$/i.exec(raw.trim());
  if (!match) return null;

  const { channels, alpha: alphaToken } = splitFunctionBody(match[1]);
  if (channels.length !== 3) return null;

  const values = channels.map(parseChannelToken);
  if (values.some((v) => v === null)) return null;

  const alpha = alphaToken !== undefined ? parseAlphaToken(alphaToken) : 1;
  if (alpha === null) return null;

  const [r, g, b] = values as number[];
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: alpha };
}

export function formatRgb(color: Rgba): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  return color.a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(color.a, 2)})`;
}

/* ---------- HSL ---------- */

export function rgbToHsl({ r, g, b, a }: Rgba): Hsla {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const delta = max - min;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rf:
        h = ((gf - bf) / delta) % 6;
        break;
      case gf:
        h = (bf - rf) / delta + 2;
        break;
      default:
        h = (rf - gf) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 1), a };
}

export function hslToRgb({ h, s, l, a }: Hsla): Rgba {
  const sf = clamp(s, 0, 100) / 100;
  const lf = clamp(l, 0, 100) / 100;
  const hf = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * lf - 1)) * sf;
  const x = c * (1 - Math.abs(((hf / 60) % 2) - 1));
  const m = lf - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hf < 60) [r1, g1, b1] = [c, x, 0];
  else if (hf < 120) [r1, g1, b1] = [x, c, 0];
  else if (hf < 180) [r1, g1, b1] = [0, c, x];
  else if (hf < 240) [r1, g1, b1] = [0, x, c];
  else if (hf < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a,
  };
}

export function parseHslFunction(raw: string): Rgba | null {
  const match = /^hsla?\(([^)]*)\)$/i.exec(raw.trim());
  if (!match) return null;

  const { channels, alpha: alphaToken } = splitFunctionBody(match[1]);
  if (channels.length !== 3) return null;

  const h = parseHueToken(channels[0]);
  const s = parsePercentToken(channels[1]);
  const l = parsePercentToken(channels[2]);
  if (h === null || s === null || l === null) return null;

  const alpha = alphaToken !== undefined ? parseAlphaToken(alphaToken) : 1;
  if (alpha === null) return null;

  return hslToRgb({ h, s, l, a: alpha });
}

export function formatHsl(color: Rgba): string {
  const hsl = rgbToHsl(color);
  return color.a >= 1
    ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
    : `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${round(color.a, 2)})`;
}

/* ---------- OKLCH ----------
 *
 * The matrices below are the published sRGB-linear <-> OKLab constants from
 * Bjorn Ottosson's OKLab colour model (the same numbers every OKLCH
 * implementation — browsers included — ships). They are not derived here;
 * they are a fixed numeric standard, the same way the WCAG luminance
 * coefficients above are.
 */

function linearRgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  // Cube roots, not `** (1/3)`: Math.cbrt handles the negative LMS values an
  // out-of-gamut input can produce, where `Math.pow` of a negative base with
  // a fractional exponent is NaN.
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Chroma below this is float noise from the matrix round-trip, not colour — see the `rgbToOklch` comment on hue. */
const ACHROMATIC_CHROMA = 0.0001;

export function rgbToOklch(color: Rgba): Oklcha {
  const lab = linearRgbToOklab(
    srgbToLinear(color.r),
    srgbToLinear(color.g),
    srgbToLinear(color.b),
  );
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);

  // Hue is `atan2(b, a)`, which is mathematically undefined at a=b=0 — for
  // any grey input the matrix leaves a tiny non-zero residue in `a`/`b` from
  // floating-point rounding, and atan2 of that residue returns a hue that
  // looks plausible (measured: ~90 degrees) but means nothing. Snapping to 0
  // below the noise floor reports the honest answer: grey has no hue.
  let h = 0;
  if (c >= ACHROMATIC_CHROMA) {
    h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
    if (h < 0) h += 360;
  }

  return { l: round(lab.L, 4), c: round(c, 4), h: round(h, 2), a: color.a };
}

export function oklchToRgb(color: Oklcha): Rgba {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);
  const linear = oklabToLinearRgb(color.l, a, b);

  // Not every L/C/H triple lands inside sRGB — OKLCH can name colours the
  // display cannot show. Clamping to the nearest in-gamut channel is the
  // same fallback browsers use for a first approximation; a fully accurate
  // gamut mapping is a separate, more involved algorithm this tool does not
  // need for "convert this value and show me the closest swatch".
  return {
    r: Math.round(clamp(linearToSrgb255(linear.r), 0, 255)),
    g: Math.round(clamp(linearToSrgb255(linear.g), 0, 255)),
    b: Math.round(clamp(linearToSrgb255(linear.b), 0, 255)),
    a: color.a,
  };
}

function parseOklchLightnessToken(token: string): number | null {
  const percent = /^(-?[\d.]+)%$/.exec(token);
  if (percent) {
    const pct = Number(percent[1]);
    return Number.isFinite(pct) ? pct / 100 : null;
  }
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

export function parseOklchFunction(raw: string): Rgba | null {
  const match = /^oklch\(([^)]*)\)$/i.exec(raw.trim());
  if (!match) return null;

  const [channelsPart, alphaPart] = match[1].split("/");
  const tokens = channelsPart.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 3) return null;

  const l = parseOklchLightnessToken(tokens[0]);
  if (l === null || l < 0 || l > 1) return null;

  const c = Number(tokens[1]);
  if (!Number.isFinite(c) || c < 0) return null;

  const h = Number(tokens[2].replace(/deg$/i, ""));
  if (!Number.isFinite(h)) return null;

  const alphaToken = alphaPart?.trim();
  const alpha = alphaToken !== undefined ? parseAlphaToken(alphaToken) : 1;
  if (alpha === null) return null;

  return oklchToRgb({ l, c, h: ((h % 360) + 360) % 360, a: alpha });
}

export function formatOklch(color: Rgba): string {
  const oklch = rgbToOklch(color);
  const lPercent = round(oklch.l * 100, 2);
  return color.a >= 1
    ? `oklch(${lPercent}% ${oklch.c} ${oklch.h})`
    : `oklch(${lPercent}% ${oklch.c} ${oklch.h} / ${round(color.a, 2)})`;
}

/* ---------- top-level parse ---------- */

export function parseColor(raw: string): ParsedColor {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə: rəng yapışdır." };

  if (trimmed.startsWith("#")) {
    const color = parseHex(trimmed);
    return color
      ? { ok: true, color, format: "hex" }
      : {
          ok: false,
          error:
            "HEX formatı yanlışdır: #rgb, #rgba, #rrggbb və ya #rrggbbaa gözlənilir; onaltılıq olmayan simvol və ya yanlış uzunluq var.",
        };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("rgb")) {
    const color = parseRgbFunction(trimmed);
    return color
      ? { ok: true, color, format: "rgb" }
      : {
          ok: false,
          error: "rgb()/rgba() formatı yanlışdır: hər kanal 0-255 (və ya 0%-100%) aralığında olmalıdır.",
        };
  }
  if (lower.startsWith("hsl")) {
    const color = parseHslFunction(trimmed);
    return color
      ? { ok: true, color, format: "hsl" }
      : {
          ok: false,
          error:
            "hsl()/hsla() formatı yanlışdır, çalar rəqəm, doyma və işıqlıq isə faiz (%) olmalıdır.",
        };
  }
  if (lower.startsWith("oklch")) {
    const color = parseOklchFunction(trimmed);
    return color
      ? { ok: true, color, format: "oklch" }
      : {
          ok: false,
          error:
            "oklch() formatı yanlışdır: L 0-1 (və ya 0%-100%), C mənfi olmayan ədəd, H bucaq olmalıdır.",
        };
  }

  return {
    ok: false,
    error: "Format tanınmadı, HEX (#rrggbb), rgb(), hsl() və ya oklch() gözlənilir.",
  };
}

/* ---------- contrast ---------- */

const AA_NORMAL = 4.5;
const AA_LARGE = 3;
const AAA_NORMAL = 7;
const AAA_LARGE = 4.5;

function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

/** WCAG 2.1 contrast ratio — identical formula to `scripts/contrast-check.mjs`, see the note above `srgbToLinear`. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Paints `fg` over an opaque `bg` using `fg`'s own alpha — the visible result a visitor's eye actually measures. */
function compositeOverOpaque(fg: Rgba, bg: Rgba): Rgba {
  const alpha = clamp(fg.a, 0, 1);
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

export type ContrastVerdict = {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
};

export type ContrastSuggestion = {
  direction: "tundlesdir" | "aciqlasdir";
  /** Whole HSL-lightness percentage points the text must move to clear AA-normal. */
  deltaL: number;
  color: Rgba;
};

export type ContrastResult =
  | {
      ok: true;
      verdict: ContrastVerdict;
      /** The text colour actually rendered — its own colour composited over the background. */
      foreground: Rgba;
      suggestion: ContrastSuggestion | null;
    }
  | { ok: false; error: string };

/**
 * Walks the text colour's own hue/saturation toward black or toward white,
 * one HSL-lightness point at a time, and returns the first stop that clears
 * `targetRatio` against `background`. A closed-form solution exists only for
 * grey text (luminance is then a direct function of one channel); for a
 * saturated colour the relationship between lightness and contrast has no
 * simple inverse, so this searches instead of solving.
 */
function stepsToward(
  textHsl: Hsla,
  background: Rgba,
  targetRatio: number,
  towardBlack: boolean,
): { steps: number; color: Rgba } | null {
  for (let steps = 0; steps <= 100; steps += 1) {
    const l = towardBlack ? Math.max(0, textHsl.l - steps) : Math.min(100, textHsl.l + steps);
    const candidate = hslToRgb({ h: textHsl.h, s: textHsl.s, l, a: 1 });
    if (contrastRatio(candidate, background) >= targetRatio) return { steps, color: candidate };
    if (l === 0 || l === 100) break;
  }
  return null;
}

/** `null` only when neither pure black nor pure white text reaches the target against this background — meaning the background sits at a lightness no text colour can clear, which does not happen at the WCAG AA ratios this tool asks for. */
function suggestFix(text: Rgba, background: Rgba, targetRatio: number): ContrastSuggestion | null {
  const textHsl = rgbToHsl(text);
  const darker = stepsToward(textHsl, background, targetRatio, true);
  const lighter = stepsToward(textHsl, background, targetRatio, false);

  const candidates: ContrastSuggestion[] = [];
  if (darker) candidates.push({ direction: "tundlesdir", deltaL: darker.steps, color: darker.color });
  if (lighter) candidates.push({ direction: "aciqlasdir", deltaL: lighter.steps, color: lighter.color });
  if (candidates.length === 0) return null;

  // The smaller move wins — a visitor asking "how far off am I" wants the
  // nearest passing colour, not necessarily the darker one.
  return candidates.reduce((best, current) => (current.deltaL < best.deltaL ? current : best));
}

export function checkContrast(text: Rgba, background: Rgba): ContrastResult {
  if (background.a < 1) {
    return {
      ok: false,
      error:
        "Fon rəngi şəffafdır (alfa < 1): kontrast fonun arxasında nə olduğunu bilmədən hesablana bilmir. Tam örtən (alfa 1) fon rəngi seçin.",
    };
  }

  const foreground = compositeOverOpaque(text, background);
  const ratio = round(contrastRatio(foreground, background), 2);

  const verdict: ContrastVerdict = {
    ratio,
    aaNormal: ratio >= AA_NORMAL,
    aaLarge: ratio >= AA_LARGE,
    aaaNormal: ratio >= AAA_NORMAL,
    aaaLarge: ratio >= AAA_LARGE,
  };

  return {
    ok: true,
    verdict,
    foreground,
    suggestion: verdict.aaNormal ? null : suggestFix(foreground, background, AA_NORMAL),
  };
}

/* ---------- colour-blindness simulation ---------- */

export type ColorBlindnessType = "protanopia" | "deuteranopia" | "tritanopia";

/**
 * Coefficients applied directly in sRGB space — the same ones the widely used
 * consumer simulators (Coblis and its relatives) ship. A scientifically exact
 * simulation works in LMS cone space and is a materially bigger algorithm;
 * this tool's job is to show a visitor why a contrast failure matters, not to
 * stand in for a clinical device. Each row sums to 1, so a grey input comes
 * back unchanged — that identity is what `reng.mts` checks, since there is no
 * independent "correct" RGB triple to compare a simulated colour against.
 */
const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, readonly [number, number, number][]> = {
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.433, 0.567],
    [0, 0.475, 0.525],
  ],
};

export function simulateColorBlindness(color: Rgba, type: ColorBlindnessType): Rgba {
  const [rowR, rowG, rowB] = COLOR_BLINDNESS_MATRICES[type];
  const apply = (row: readonly [number, number, number]) =>
    row[0] * color.r + row[1] * color.g + row[2] * color.b;

  return {
    r: Math.round(clamp(apply(rowR), 0, 255)),
    g: Math.round(clamp(apply(rowG), 0, 255)),
    b: Math.round(clamp(apply(rowB), 0, 255)),
    a: color.a,
  };
}
