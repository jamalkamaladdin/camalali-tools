/**
 * Image resize/compress/convert — the pure half. Everything that touches
 * `Image`, `HTMLCanvasElement` or `canvas.toBlob` is a browser fact and lives
 * in `sekil-tool.tsx` instead, because this module also has to import cleanly
 * on the server (the tool page itself is server-rendered, only the widget
 * hydrates). What is left here is arithmetic and string-building: the target
 * dimensions, the savings percentage, the output filename and the format
 * table — none of it needs a canvas to compute, and all of it is what the
 * check suite can pin down without a browser.
 */

export type ImageFormat = "jpeg" | "png" | "webp";

export type Dimensions = {
  width: number;
  height: number;
};

export type SizeConstraints = {
  /** Undefined or non-positive means "no limit on this axis". */
  maxWidth?: number;
  maxHeight?: number;
};

/** What the format select shows the visitor — kept beside the MIME table so a new format cannot add one without the other. */
export const IMAGE_FORMAT_LABELS: Record<ImageFormat, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
};

const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/* "jpg", not "jpeg" — the extension every operating system's file picker
   already shows a photo with, so the downloaded file matches what a visitor
   expects to see rather than how the MIME type happens to be spelled. */
const FORMAT_EXTENSION: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export function mimeForFormat(format: ImageFormat): string {
  return FORMAT_MIME[format];
}

export function extensionForFormat(format: ImageFormat): string {
  return FORMAT_EXTENSION[format];
}

/**
 * MIME types `<img>` + canvas can actually decode across current browsers.
 * SVG is left out on purpose: an external SVG can carry scripts or
 * `<foreignObject>` content, which some browsers refuse to read back out of a
 * canvas (`drawImage` succeeds, `toBlob` then throws a security error) — a
 * failure mode that depends on the file's content, not just its type, so it
 * cannot be caught by validating the type up front. TIFF and HEIC/HEIF are
 * left out because no browser's `<img>` decodes them at all.
 */
const DECODABLE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/x-icon",
  "image/avif",
]);

export function isSupportedImageMime(mime: string): boolean {
  return DECODABLE_IMAGE_MIME_TYPES.has(mime.toLowerCase());
}

/**
 * Scales `original` down to fit inside `constraints`, aspect ratio locked.
 *
 * Never upscales: the returned size is `original` unchanged when it already
 * fits, because stretching a small image past its native resolution does not
 * add detail — it only blurs pixels the tool would otherwise be honest about
 * not having, and quietly enlarging a file the visitor asked to shrink would
 * be the opposite of what this tool promises.
 */
export function computeTargetDimensions(
  original: Dimensions,
  constraints: SizeConstraints,
): Dimensions {
  if (original.width <= 0 || original.height <= 0) return original;

  let scale = 1;
  if (constraints.maxWidth && constraints.maxWidth > 0 && original.width > constraints.maxWidth) {
    scale = Math.min(scale, constraints.maxWidth / original.width);
  }
  if (
    constraints.maxHeight &&
    constraints.maxHeight > 0 &&
    original.height > constraints.maxHeight
  ) {
    scale = Math.min(scale, constraints.maxHeight / original.height);
  }

  if (scale === 1) return original;

  return {
    width: Math.max(1, Math.round(original.width * scale)),
    height: Math.max(1, Math.round(original.height * scale)),
  };
}

/**
 * Percentage the result is smaller than the original. Negative means the
 * result grew — a low-quality JPEG re-encoded as lossless PNG commonly does —
 * and reporting that honestly instead of clamping to zero is the reason this
 * is a signed number rather than a "saved X%" label.
 *
 * A non-positive original size has nothing to compare against — 0 rather
 * than `NaN` or `Infinity`, since a size of zero is a degenerate input, not a
 * savings claim the tool can stand behind.
 */
export function computeSavingsPercent(originalBytes: number, resultBytes: number): number {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return 0;
  return ((originalBytes - resultBytes) / originalBytes) * 100;
}

/** The UI shows 1-100 because nobody thinks in fractions; canvas wants 0-1. */
export function clampQualityPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function qualityPercentToFraction(percent: number): number {
  return clampQualityPercent(percent) / 100;
}

/**
 * Swaps the extension for the chosen format and keeps the rest of the name.
 * A name with no extension at all (a paste from a screenshot tool, say) has
 * nothing to strip, so the whole thing becomes the stem — `lastDot` has to be
 * strictly greater than zero, not just present, or a leading-dot name like
 * ".gitignore" would be treated as "all extension, empty stem".
 */
export function buildOutputFilename(originalName: string, format: ImageFormat): string {
  const trimmed = originalName.trim();
  const base = trimmed === "" ? "image" : trimmed;
  const lastDot = base.lastIndexOf(".");
  const stem = lastDot > 0 ? base.slice(0, lastDot) : base;
  return `${stem}.${extensionForFormat(format)}`;
}
