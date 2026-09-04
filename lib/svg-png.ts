/**
 * SVG to PNG conversion — the pure half. What size the output canvas has to
 * be is ordinary arithmetic once the source's own declared size is read out
 * of the markup: parsing `width`/`height`/`viewBox` off the `<svg>` tag,
 * working out a ratio from whichever of those exists, and resolving the
 * visitor's request (an explicit width, an explicit height, or a scale
 * factor) against it. None of that touches a canvas, which is what lets a
 * check suite pin the ratio maths down without a browser.
 *
 * Whether a particular SVG will actually taint the canvas it is drawn onto
 * is also decidable from the text alone — an external `href`, `url(...)` or
 * `@import` is what does it — so that detector lives here too, and is run
 * before the widget ever calls `drawImage`. The one thing this file cannot
 * do is draw: `svg-png-tool.tsx` is where `Image`, `HTMLCanvasElement` and
 * `canvas.toBlob` live.
 */

export type ParsedSvgDimensions = {
  width: number | null;
  height: number | null;
  viewBox: { width: number; height: number } | null;
};

function extractAttr(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(tag);
  if (!match) return null;
  return match[2] !== undefined ? match[2] : (match[3] ?? null);
}

/** A bare number or one suffixed `px` — anything else (`%`, `em`, missing) has no fixed pixel meaning, so it is treated as absent rather than guessed at. */
function parseLength(value: string | null): number | null {
  if (value === null) return null;
  const match = /^\s*(-?\d*\.?\d+)\s*(px)?\s*$/i.exec(value);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseViewBox(value: string | null): { width: number; height: number } | null {
  if (value === null) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [, , width, height] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Reads the size the source SVG declares about itself. A malformed or tagless input yields every field `null` rather than throwing. */
export function parseSvgDimensions(svgText: string): ParsedSvgDimensions {
  const tagMatch = /<svg\b[^>]*>/i.exec(svgText);
  const tag = tagMatch ? tagMatch[0] : "";
  return {
    width: parseLength(extractAttr(tag, "width")),
    height: parseLength(extractAttr(tag, "height")),
    viewBox: parseViewBox(extractAttr(tag, "viewBox")),
  };
}

export type SizeRequest = {
  /** Both given together are honoured as-is, ratio and all — a visitor who typed two numbers gets exactly those two numbers. */
  width?: number;
  height?: number;
  scale?: number;
};

export type SizeSuccess = { width: number; height: number };
export type SizeFailure = { error: string };
export type SizeResult = SizeSuccess | SizeFailure;

export function isSizeSuccess(result: SizeResult): result is SizeSuccess {
  return "width" in result;
}

/**
 * Resolves the output pixel size from the source's declared dimensions and
 * the visitor's request. Explicit `width`+`height` together win outright;
 * one alone is scaled against the source's own ratio; neither falls back to
 * `scale` (default 1×) against the source's intrinsic size.
 *
 * A source with no `width`/`height` and no `viewBox` at all has nothing to
 * compute a ratio or a default size from — the one case this returns an
 * error for instead of a guess, matching the rest of this file's rule that
 * missing information is reported, not invented.
 */
export function computeOutputDimensions(source: ParsedSvgDimensions, request: SizeRequest): SizeResult {
  const intrinsic =
    source.width !== null && source.height !== null
      ? { width: source.width, height: source.height }
      : source.viewBox;

  if (!intrinsic) {
    return {
      error:
        "Bu SVG-nin nə width/height, nə də viewBox atributu var: ölçü təyin edilə bilmədi. Eni və ya hündürlüyü əl ilə yaz.",
    };
  }

  if (request.width && request.height) {
    return { width: Math.max(1, Math.round(request.width)), height: Math.max(1, Math.round(request.height)) };
  }

  const ratio = intrinsic.width / intrinsic.height;

  if (request.width) {
    return { width: Math.max(1, Math.round(request.width)), height: Math.max(1, Math.round(request.width / ratio)) };
  }
  if (request.height) {
    return { width: Math.max(1, Math.round(request.height * ratio)), height: Math.max(1, Math.round(request.height)) };
  }

  const scale = request.scale && request.scale > 0 ? request.scale : 1;
  return {
    width: Math.max(1, Math.round(intrinsic.width * scale)),
    height: Math.max(1, Math.round(intrinsic.height * scale)),
  };
}

/**
 * Every external reference that will taint the canvas this SVG gets drawn
 * onto: an `href`/`xlink:href` pointing at another origin (an `<image>` or a
 * `<use>` pulling in a remote file), a CSS `url(...)` doing the same (an
 * external mask, pattern or font), and an `@import` of an external
 * stylesheet. A `data:` URI or an internal `#fragment` reference is not
 * external and is left out on purpose — both are read from the document
 * itself and neither taints anything.
 */
export function detectExternalSvgReferences(svgText: string): string[] {
  const found = new Set<string>();

  const hrefPattern = /(?:xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(svgText)) !== null) {
    const value = (match[2] ?? match[3] ?? "").trim();
    if (/^(https?:)?\/\//i.test(value)) found.add(value);
  }

  const urlFnPattern = /url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/gi;
  while ((match = urlFnPattern.exec(svgText)) !== null) {
    found.add(match[1]);
  }

  const importPattern = /@import\s+(?:url\(\s*)?["']?(https?:\/\/[^"')\s]+)/gi;
  while ((match = importPattern.exec(svgText)) !== null) {
    found.add(match[1]);
  }

  return [...found];
}

/** Swaps a `.svg` extension (if any) for the pixel dimensions actually rendered — a blank name falls back to a generic stem rather than producing a dot-led file name. */
export function buildPngFilename(baseName: string, width: number, height: number): string {
  const trimmed = baseName.trim();
  const stem = trimmed === "" ? "sekil" : trimmed.replace(/\.svg$/i, "");
  return `${stem}-${width}x${height}.png`;
}
