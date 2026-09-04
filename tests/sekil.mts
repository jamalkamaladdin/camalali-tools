/*
 * Everything canvas-dependent lives in the widget, so what is left to check
 * here is the arithmetic: does the scale-to-fit math ever upscale, does the
 * savings percentage stay honest when a re-encode grows the file, and does
 * the MIME/extension table agree with itself. None of it needs a browser.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildOutputFilename,
  clampQualityPercent,
  computeSavingsPercent,
  computeTargetDimensions,
  extensionForFormat,
  isSupportedImageMime,
  mimeForFormat,
  qualityPercentToFraction,
} from "../lib/sekil";

export const checks: CheckSuite = (check) => {
  // ---------- computeTargetDimensions: width bound ----------
  {
    // 1200x800 -> maxWidth 600: scale is exactly 0.5, so 600x400 by hand.
    const result = computeTargetDimensions({ width: 1200, height: 800 }, { maxWidth: 600 });
    check(
      "sekil: en heddi ile 1200x800 -> 600x400",
      result.width === 600 && result.height === 400,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- computeTargetDimensions: height bound ----------
  {
    // 1200x800 -> maxHeight 400: scale is 0.5, so 600x400 by hand, same as above.
    const result = computeTargetDimensions({ width: 1200, height: 800 }, { maxHeight: 400 });
    check(
      "sekil: hundurluk heddi ile 1200x800 -> 600x400",
      result.width === 600 && result.height === 400,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- computeTargetDimensions: both bounds, tighter one wins ----------
  {
    // width scale = 600/1200 = 0.5, height scale = 300/800 = 0.375 - the
    // tighter (smaller) scale must win or the result overflows maxHeight.
    const result = computeTargetDimensions(
      { width: 1200, height: 800 },
      { maxWidth: 600, maxHeight: 300 },
    );
    check(
      "sekil: her iki hedd verilende daha kicik olcek qalib gelir",
      result.width === 450 && result.height === 300,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- computeTargetDimensions: never upscales ----------
  {
    const result = computeTargetDimensions({ width: 200, height: 100 }, { maxWidth: 2000 });
    check(
      "sekil: heddden kicik sekil boyudulmur",
      result.width === 200 && result.height === 100,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- computeTargetDimensions: no constraints at all ----------
  {
    const result = computeTargetDimensions({ width: 640, height: 480 }, {});
    check(
      "sekil: hedd verilmeyende olcu deyismir",
      result.width === 640 && result.height === 480,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- computeTargetDimensions: degenerate zero-size input ----------
  {
    const result = computeTargetDimensions({ width: 0, height: 0 }, { maxWidth: 500 });
    check(
      "sekil: sifir olculu sekil oldugu kimi qayidir",
      result.width === 0 && result.height === 0,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- computeSavingsPercent: shrink ----------
  check(
    "sekil: 1000 bayt -> 400 bayt qenaeti 60%-dir",
    computeSavingsPercent(1000, 400) === 60,
    `alindi ${computeSavingsPercent(1000, 400)}`,
  );

  // ---------- computeSavingsPercent: grew (negative, not clamped) ----------
  check(
    "sekil: netice boyuyende menfi qenaet gosterilir",
    computeSavingsPercent(400, 1000) === -150,
    `alindi ${computeSavingsPercent(400, 1000)}`,
  );

  // ---------- computeSavingsPercent: zero-size original ----------
  check(
    "sekil: sifir olculu orijinal - NaN/Infinity yox, 0 qayidir",
    computeSavingsPercent(0, 100) === 0,
    `alindi ${computeSavingsPercent(0, 100)}`,
  );

  // ---------- buildOutputFilename: extension follows format ----------
  check(
    "sekil: jpeg formati .jpg uzantisi verir",
    buildOutputFilename("foto.png", "jpeg") === "foto.jpg",
    `alindi ${buildOutputFilename("foto.png", "jpeg")}`,
  );
  check(
    "sekil: webp formati .webp uzantisi verir",
    buildOutputFilename("foto.png", "webp") === "foto.webp",
    `alindi ${buildOutputFilename("foto.png", "webp")}`,
  );

  // ---------- buildOutputFilename: no original extension ----------
  check(
    "sekil: uzantisiz fayl adina uzantı elave olunur",
    buildOutputFilename("ekran-goruntusu", "png") === "ekran-goruntusu.png",
    `alindi ${buildOutputFilename("ekran-goruntusu", "png")}`,
  );

  // ---------- isSupportedImageMime ----------
  check(
    "sekil: image/png dekodlanan tip kimi taninir",
    isSupportedImageMime("image/png") === true,
    "alindi false",
  );
  check(
    "sekil: application/pdf destaklanmeyen tip kimi redd edilir",
    isSupportedImageMime("application/pdf") === false,
    "alindi true",
  );
  check(
    "sekil: image/svg+xml destaklanmeyen tip kimi redd edilir",
    isSupportedImageMime("image/svg+xml") === false,
    "alindi true",
  );

  // ---------- mime/extension table stays in sync ----------
  check(
    "sekil: her formatin MIME ve uzantisi movcuddur",
    mimeForFormat("jpeg") === "image/jpeg" &&
      mimeForFormat("png") === "image/png" &&
      mimeForFormat("webp") === "image/webp" &&
      extensionForFormat("jpeg") === "jpg" &&
      extensionForFormat("png") === "png" &&
      extensionForFormat("webp") === "webp",
    "bir formatin cedvel qeydi cavab vermir",
  );

  // ---------- quality clamping ----------
  check(
    "sekil: 100-den boyuk keyfiyyet 100-e sixilir",
    clampQualityPercent(150) === 100,
    `alindi ${clampQualityPercent(150)}`,
  );
  check(
    "sekil: sifir ve menfi keyfiyyet 1-e sixilir",
    clampQualityPercent(0) === 1 && clampQualityPercent(-20) === 1,
    `alindi ${clampQualityPercent(0)} ve ${clampQualityPercent(-20)}`,
  );
  check(
    "sekil: 80% keyfiyyet canvas ucun 0.8 fraksiyasina cevrilir",
    qualityPercentToFraction(80) === 0.8,
    `alindi ${qualityPercentToFraction(80)}`,
  );
};
