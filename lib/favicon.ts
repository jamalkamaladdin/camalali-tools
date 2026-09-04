/**
 * Favicon set generator — the pure half. Turning one source image into a
 * browser's whole icon set touches three things a check suite can pin down
 * without ever opening a canvas: where a scaled image sits inside a padded
 * square, the bytes of an ICO container (a format simple enough to hand-roll —
 * a six-byte header, one sixteen-byte directory entry per size, then the raw
 * PNG bytes back to back), and the manifest/HTML text every output ships
 * with. Reading pixels out of a `<canvas>` has no meaning outside a browser,
 * so that step — and only that step — lives in `favicon-tool.tsx`.
 *
 * The multiple-of-48 rule this file carries (`isMultipleOf48`) is Google's
 * own favicon guidance, not a guess: the icon Search shows next to a result
 * has to be a multiple of 48px (48, 96, 144…) or the crawler discards it. It
 * is unrelated to Apple's fixed 180px touch icon and Android's fixed 512px
 * install icon — those answer to a different platform's own spec, which is
 * why they are allowed to fail this particular check without that being an
 * error.
 */

export type SourceDimensions = { width: number; height: number };

export type IconLayout = { x: number; y: number; width: number; height: number };

/** Clamped to 0–45 so padding can never eat the whole icon (45% a side leaves nothing to draw). */
export function clampPaddingPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(45, Math.max(0, value));
}

/**
 * Centres the source at the largest scale that still fits inside a square of
 * `canvasSize` once `paddingPercent` is reserved on every side.
 *
 * Unlike `sekil.ts`'s resize — which never upscales, because shrinking is its
 * whole job — this one scales in both directions: a favicon commonly starts
 * from a small logo and has to grow to fill a 512px icon.
 *
 * A zero or negative source dimension has no ratio to preserve, so it falls
 * back to a centred square rather than dividing by zero — the malformed input
 * this file guarantees never throws.
 */
export function computeIconLayout(
  canvasSize: number,
  paddingPercent: number,
  source: SourceDimensions,
): IconLayout {
  const padding = clampPaddingPercent(paddingPercent);
  const inner = Math.max(1, canvasSize * (1 - padding / 100));

  if (source.width <= 0 || source.height <= 0) {
    const side = Math.round(inner);
    const offset = Math.round((canvasSize - side) / 2);
    return { x: offset, y: offset, width: side, height: side };
  }

  const scale = Math.min(inner / source.width, inner / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  return {
    width,
    height,
    x: Math.round((canvasSize - width) / 2),
    y: Math.round((canvasSize - height) / 2),
  };
}

/** Google's favicon rule, applied to one size. See the file header for what it is and is not for. */
export function isMultipleOf48(size: number): boolean {
  return Number.isInteger(size) && size > 0 && size % 48 === 0;
}

export const ICO_SIZES = [16, 32, 48] as const;
export const APPLE_TOUCH_ICON_SIZE = 180;
export const ANDROID_ICON_SIZES = [192, 512] as const;

export type FaviconSlot = {
  fileName: string;
  size: number;
  purpose: string;
  googleFriendly: boolean;
};

/**
 * The fixed output list every run produces. `favicon.ico` is one file that
 * packs all three of `ICO_SIZES` — its own `size` here names the one Google
 * actually reads off it, 48.
 */
export function faviconSlots(): FaviconSlot[] {
  return [
    {
      fileName: "favicon.ico",
      size: 48,
      purpose: "Brauzer tabı və köhnə sistemlər: 16, 32 və 48 piksel bir faylın içindədir",
      googleFriendly: true,
    },
    {
      fileName: "apple-touch-icon.png",
      size: APPLE_TOUCH_ICON_SIZE,
      purpose: "iPhone/iPad-da ana ekrana əlavə edilən ikon",
      googleFriendly: isMultipleOf48(APPLE_TOUCH_ICON_SIZE),
    },
    {
      fileName: "android-chrome-192x192.png",
      size: ANDROID_ICON_SIZES[0],
      purpose: "Android qısayolu və manifest.json",
      googleFriendly: isMultipleOf48(ANDROID_ICON_SIZES[0]),
    },
    {
      fileName: "android-chrome-512x512.png",
      size: ANDROID_ICON_SIZES[1],
      purpose: "PWA başlanğıc ekranı və manifest.json",
      googleFriendly: isMultipleOf48(ANDROID_ICON_SIZES[1]),
    },
  ];
}

const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/**
 * An empty string or the word "transparent" mean "keep the source's alpha
 * channel" — `null` is that state, not an error. An unparsable string (a
 * typo, a CSS colour name) falls back to the same `null` instead of
 * throwing: a visitor's stray keystroke should not crash the preview
 * mid-type.
 */
export function normalizeBackgroundColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed === "transparent") return null;
  if (!HEX_COLOR.test(trimmed)) return null;

  const hex = trimmed.slice(1);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return `#${full}`;
}

/* ---------- the ICO container ---------- */

export type IcoSourceImage = { size: number; pngBytes: Uint8Array };

const ICO_HEADER_SIZE = 6;
const ICO_DIR_ENTRY_SIZE = 16;

/**
 * Assembles a `.ico` file from already-encoded PNG bytes, one per size —
 * embedding PNG data in an ICO directory entry rather than the format's
 * original raw-bitmap layout has been valid since Windows Vista and is what
 * every modern favicon actually ships as. An empty list produces a
 * zero-icon header rather than throwing, matching the rest of this file's
 * rule that malformed input degrades instead of crashing.
 */
export function buildIcoFile(images: IcoSourceImage[]): Uint8Array<ArrayBuffer> {
  if (images.length === 0) {
    const empty = new Uint8Array(ICO_HEADER_SIZE);
    new DataView(empty.buffer).setUint16(2, 1, true); // type: 1 = icon
    return empty;
  }

  const count = images.length;
  const totalSize =
    ICO_HEADER_SIZE +
    count * ICO_DIR_ENTRY_SIZE +
    images.reduce((sum, image) => sum + image.pngBytes.length, 0);

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 = icon
  view.setUint16(4, count, true);

  let dataOffset = ICO_HEADER_SIZE + count * ICO_DIR_ENTRY_SIZE;
  images.forEach((image, index) => {
    const entryOffset = ICO_HEADER_SIZE + index * ICO_DIR_ENTRY_SIZE;
    // 256 has no place in a one-byte field, so the format defines 0 to mean it.
    const byteSide = image.size >= 256 ? 0 : image.size;
    view.setUint8(entryOffset, byteSide);
    view.setUint8(entryOffset + 1, byteSide);
    view.setUint8(entryOffset + 2, 0); // colour count — 0 for a PNG-backed entry
    view.setUint8(entryOffset + 3, 0); // reserved
    view.setUint16(entryOffset + 4, 1, true); // colour planes
    view.setUint16(entryOffset + 6, 32, true); // bits per pixel
    view.setUint32(entryOffset + 8, image.pngBytes.length, true);
    view.setUint32(entryOffset + 12, dataOffset, true);

    bytes.set(image.pngBytes, dataOffset);
    dataOffset += image.pngBytes.length;
  });

  return bytes;
}

export type IcoDirectoryEntry = { size: number; byteLength: number; offset: number };

/** Reads back the directory `buildIcoFile` wrote — the round-trip the check suite pins the format down with. */
export function readIcoDirectory(ico: Uint8Array): IcoDirectoryEntry[] {
  if (ico.length < ICO_HEADER_SIZE) return [];

  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  const count = view.getUint16(4, true);
  const entries: IcoDirectoryEntry[] = [];

  for (let i = 0; i < count; i++) {
    const entryOffset = ICO_HEADER_SIZE + i * ICO_DIR_ENTRY_SIZE;
    if (entryOffset + ICO_DIR_ENTRY_SIZE > ico.length) break;
    const rawSize = view.getUint8(entryOffset);
    entries.push({
      size: rawSize === 0 ? 256 : rawSize,
      byteLength: view.getUint32(entryOffset + 8, true),
      offset: view.getUint32(entryOffset + 12, true),
    });
  }

  return entries;
}

/* ---------- manifest and <head> text ---------- */

export type ManifestOptions = {
  siteName: string;
  themeColor: string;
  backgroundColor: string;
};

export function buildManifestJson(options: ManifestOptions): string {
  const name = options.siteName.trim() || "Sayt";
  const manifest = {
    name,
    short_name: name,
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    theme_color: normalizeBackgroundColor(options.themeColor) ?? "#ffffff",
    background_color: normalizeBackgroundColor(options.backgroundColor) ?? "#ffffff",
    display: "standalone",
  };
  return JSON.stringify(manifest, null, 2);
}

/** The five lines a visitor pastes into `<head>` — fixed root-relative paths, matching the fixed file names above. */
export function buildFaviconHeadHtml(): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">',
    '<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/manifest.json">',
  ].join("\n");
}
