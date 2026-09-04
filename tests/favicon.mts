/*
 * What is worth checking here: Google's multiple-of-48 rule applied to the
 * fixed outputs (including that Apple's 180 and Android's 512 legitimately
 * fail it), the padded-square layout maths at a known scale and on a
 * degenerate zero-size source, the hand-rolled ICO container round-tripping
 * through its own reader with the one-byte 256-wraps-to-0 edge case, and the
 * manifest/HTML text builders producing well-formed output a browser can
 * actually use.
 */
import type { CheckSuite } from "./harness.mts";
import {
  ANDROID_ICON_SIZES,
  APPLE_TOUCH_ICON_SIZE,
  buildFaviconHeadHtml,
  buildIcoFile,
  buildManifestJson,
  computeIconLayout,
  faviconSlots,
  isMultipleOf48,
  normalizeBackgroundColor,
  readIcoDirectory,
} from "../lib/favicon";

export const checks: CheckSuite = (check) => {
  check(
    "favicon: isMultipleOf48 accepts 48, 96 and 144 — Google's favicon multiples",
    isMultipleOf48(48) && isMultipleOf48(96) && isMultipleOf48(144),
    `48: ${isMultipleOf48(48)}, 96: ${isMultipleOf48(96)}, 144: ${isMultipleOf48(144)}`,
  );

  check(
    "favicon: isMultipleOf48 rejects the classic 16/32 favicon.ico sizes and 0/negative",
    !isMultipleOf48(16) && !isMultipleOf48(32) && !isMultipleOf48(0) && !isMultipleOf48(-48),
    `16: ${isMultipleOf48(16)}, 32: ${isMultipleOf48(32)}, 0: ${isMultipleOf48(0)}, -48: ${isMultipleOf48(-48)}`,
  );

  const slots = faviconSlots();
  check(
    "favicon: faviconSlots ships the four fixed outputs at the sizes the spec names",
    slots.length === 4 &&
      slots.some((slot) => slot.fileName === "favicon.ico" && slot.size === 48) &&
      slots.some((slot) => slot.fileName === "apple-touch-icon.png" && slot.size === APPLE_TOUCH_ICON_SIZE) &&
      slots.some((slot) => slot.fileName === "android-chrome-192x192.png" && slot.size === ANDROID_ICON_SIZES[0]) &&
      slots.some((slot) => slot.fileName === "android-chrome-512x512.png" && slot.size === ANDROID_ICON_SIZES[1]),
    `got: ${JSON.stringify(slots)}`,
  );

  check(
    "favicon: faviconSlots flags 180 (apple) and 512 (android) as not Google-multiple, 48 and 192 as Google-multiple",
    slots.find((s) => s.size === APPLE_TOUCH_ICON_SIZE)?.googleFriendly === false &&
      slots.find((s) => s.size === 512)?.googleFriendly === false &&
      slots.find((s) => s.size === 48)?.googleFriendly === true &&
      slots.find((s) => s.size === 192)?.googleFriendly === true,
    `got: ${JSON.stringify(slots)}`,
  );

  const noPadding = computeIconLayout(100, 0, { width: 50, height: 50 });
  check(
    "favicon: computeIconLayout with no padding fills the square canvas exactly",
    noPadding.x === 0 && noPadding.y === 0 && noPadding.width === 100 && noPadding.height === 100,
    `got: ${JSON.stringify(noPadding)}`,
  );

  const padded = computeIconLayout(100, 20, { width: 100, height: 100 });
  check(
    "favicon: computeIconLayout with 20% padding centres a square source at 80% scale",
    padded.width === 80 && padded.height === 80 && padded.x === 10 && padded.y === 10,
    `got: ${JSON.stringify(padded)}`,
  );

  const wide = computeIconLayout(200, 10, { width: 400, height: 200 });
  check(
    "favicon: computeIconLayout preserves aspect ratio and centres a wide source",
    wide.width === 180 && wide.height === 90 && wide.x === 10 && wide.y === 55,
    `got: ${JSON.stringify(wide)}`,
  );

  const degenerate = computeIconLayout(64, 10, { width: 0, height: 0 });
  check(
    "favicon: computeIconLayout on a zero-size source does not throw and returns a centred square",
    degenerate.width > 0 && degenerate.height > 0 && degenerate.width === degenerate.height,
    `got: ${JSON.stringify(degenerate)}`,
  );

  check(
    "favicon: normalizeBackgroundColor expands and lowercases shorthand hex",
    normalizeBackgroundColor("#FFF") === "#ffffff" && normalizeBackgroundColor("#A1B2C3") === "#a1b2c3",
    `#FFF -> ${normalizeBackgroundColor("#FFF")}, #A1B2C3 -> ${normalizeBackgroundColor("#A1B2C3")}`,
  );

  check(
    "favicon: normalizeBackgroundColor treats empty, transparent and garbage as null, not a throw",
    normalizeBackgroundColor("") === null &&
      normalizeBackgroundColor("transparent") === null &&
      normalizeBackgroundColor("not-a-color") === null,
    `"": ${normalizeBackgroundColor("")}, transparent: ${normalizeBackgroundColor("transparent")}, garbage: ${normalizeBackgroundColor("not-a-color")}`,
  );

  const fakeImages = [
    { size: 16, pngBytes: new Uint8Array(10).fill(1) },
    { size: 32, pngBytes: new Uint8Array(20).fill(2) },
    { size: 48, pngBytes: new Uint8Array(30).fill(3) },
  ];
  const ico = buildIcoFile(fakeImages);
  const directory = readIcoDirectory(ico);
  check(
    "favicon: buildIcoFile + readIcoDirectory round-trip preserves size and byte length per image",
    directory.length === 3 &&
      directory.every((entry, i) => entry.size === fakeImages[i].size && entry.byteLength === fakeImages[i].pngBytes.length) &&
      ico.length === 6 + 3 * 16 + 10 + 20 + 30,
    `got: ${JSON.stringify(directory)}, total bytes: ${ico.length}`,
  );

  const wrapped = readIcoDirectory(buildIcoFile([{ size: 256, pngBytes: new Uint8Array(5) }]));
  check(
    "favicon: buildIcoFile wraps a 256 size to the directory's zero byte and reads it back as 256",
    wrapped.length === 1 && wrapped[0].size === 256,
    `got: ${JSON.stringify(wrapped)}`,
  );

  const emptyIco = buildIcoFile([]);
  check(
    "favicon: buildIcoFile on an empty list returns a 6-byte header instead of throwing",
    emptyIco.length === 6 && readIcoDirectory(emptyIco).length === 0,
    `length: ${emptyIco.length}`,
  );

  const manifest = JSON.parse(
    buildManifestJson({ siteName: "Test Sayt", themeColor: "#112233", backgroundColor: "" }),
  );
  const headHtml = buildFaviconHeadHtml();
  check(
    "favicon: buildManifestJson produces valid JSON with two icons and a colour fallback; buildFaviconHeadHtml carries all five head lines",
    manifest.name === "Test Sayt" &&
      Array.isArray(manifest.icons) &&
      manifest.icons.length === 2 &&
      manifest.theme_color === "#112233" &&
      manifest.background_color === "#ffffff" &&
      manifest.display === "standalone" &&
      headHtml.includes('href="/favicon.ico"') &&
      headHtml.includes('rel="apple-touch-icon"') &&
      headHtml.includes('rel="manifest" href="/manifest.json"') &&
      headHtml.split("\n").length === 5,
    `manifest: ${JSON.stringify(manifest)}, headHtml lines: ${headHtml.split("\n").length}`,
  );
};
