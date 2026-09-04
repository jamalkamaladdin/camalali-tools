/*
 * What is worth checking here: reading width/height/viewBox correctly off
 * the `<svg>` tag (and treating a percentage width as absent rather than a
 * number), the ratio maths for every request shape (explicit width alone,
 * height alone, scale, and both together overriding the ratio), the one
 * case with no size information at all coming back as a table-friendly
 * error rather than a thrown exception, the external-reference detector
 * finding a remote `href` and `url()` while correctly ignoring a `data:` URI
 * and an internal `#fragment`, and the filename builder's extension swap.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildPngFilename,
  computeOutputDimensions,
  detectExternalSvgReferences,
  isSizeSuccess,
  parseSvgDimensions,
} from "../lib/svg-png";

export const checks: CheckSuite = (check) => {
  const withBoth = parseSvgDimensions(
    '<svg width="256px" height="128" viewBox="0 0 512 256"><rect/></svg>',
  );
  check(
    "svg-png: parseSvgDimensions reads a px-suffixed width, a bare height and the viewBox together",
    withBoth.width === 256 && withBoth.height === 128 && withBoth.viewBox?.width === 512 && withBoth.viewBox?.height === 256,
    `got: ${JSON.stringify(withBoth)}`,
  );

  const viewBoxOnly = parseSvgDimensions('<svg viewBox="0 0 100 50"><rect/></svg>');
  check(
    "svg-png: an SVG with only a viewBox reports null width/height and the parsed viewBox",
    viewBoxOnly.width === null && viewBoxOnly.height === null && viewBoxOnly.viewBox?.width === 100,
    `got: ${JSON.stringify(viewBoxOnly)}`,
  );

  const percentageWidth = parseSvgDimensions('<svg width="100%" height="50"><rect/></svg>');
  check(
    "svg-png: a percentage width has no fixed pixel meaning and is treated as absent, not as the number 100",
    percentageWidth.width === null && percentageWidth.height === 50,
    `got: ${JSON.stringify(percentageWidth)}`,
  );

  const withViewBox = { width: null, height: null, viewBox: { width: 200, height: 100 } };

  const byWidth = computeOutputDimensions(withViewBox, { width: 400 });
  check(
    "svg-png: an explicit width alone computes height from the source's 2:1 ratio",
    isSizeSuccess(byWidth) && byWidth.width === 400 && byWidth.height === 200,
    `got: ${JSON.stringify(byWidth)}`,
  );

  const byHeight = computeOutputDimensions(withViewBox, { height: 50 });
  check(
    "svg-png: an explicit height alone computes width from the same ratio",
    isSizeSuccess(byHeight) && byHeight.width === 100 && byHeight.height === 50,
    `got: ${JSON.stringify(byHeight)}`,
  );

  const byScale = computeOutputDimensions(withViewBox, { scale: 2 });
  check(
    "svg-png: a 2x scale doubles the intrinsic viewBox size",
    isSizeSuccess(byScale) && byScale.width === 400 && byScale.height === 200,
    `got: ${JSON.stringify(byScale)}`,
  );

  const both = computeOutputDimensions(withViewBox, { width: 300, height: 300 });
  check(
    "svg-png: explicit width and height together override the ratio, even into a different aspect",
    isSizeSuccess(both) && both.width === 300 && both.height === 300,
    `got: ${JSON.stringify(both)}`,
  );

  const noSize = computeOutputDimensions({ width: null, height: null, viewBox: null }, {});
  check(
    "svg-png: no width/height and no viewBox comes back as a table-row error, not a thrown exception",
    !isSizeSuccess(noSize) && typeof noSize.error === "string" && noSize.error.length > 0,
    `got: ${JSON.stringify(noSize)}`,
  );

  const refs = detectExternalSvgReferences(
    `<svg><image href="https://evil.com/x.png"/><rect fill="url(https://cdn.example.com/pattern.svg#p)"/><a href="#local"/><image href="data:image/png;base64,AAA"/></svg>`,
  );
  check(
    "svg-png: detectExternalSvgReferences finds the remote href and url(), and ignores the data: URI and the internal fragment",
    refs.length === 2 &&
      refs.includes("https://evil.com/x.png") &&
      refs.some((r) => r.startsWith("https://cdn.example.com/pattern.svg")),
    `got: ${JSON.stringify(refs)}`,
  );

  const clean = detectExternalSvgReferences('<svg><rect fill="#fff" href="#gradientA"/></svg>');
  check(
    "svg-png: an SVG with only internal references reports no external references at all",
    clean.length === 0,
    `got: ${JSON.stringify(clean)}`,
  );

  check(
    "svg-png: buildPngFilename swaps the .svg extension for the rendered pixel dimensions",
    buildPngFilename("icon.svg", 256, 128) === "icon-256x128.png",
    `got: ${buildPngFilename("icon.svg", 256, 128)}`,
  );

  check(
    "svg-png: a blank base name falls back to a generic stem instead of a dot-led file name",
    buildPngFilename("", 10, 10) === "sekil-10x10.png" && buildPngFilename("   ", 10, 10) === "sekil-10x10.png",
    `got: ${buildPngFilename("", 10, 10)}`,
  );
};
