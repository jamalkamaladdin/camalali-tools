/*
 * The maths in reng.ts has three places a wrong edit could hide: the WCAG
 * contrast formula has to keep agreeing with scripts/contrast-check.mjs (the
 * site's own gate), the OKLCH matrices have to match the published constants
 * exactly (a typo'd coefficient is still a number, not a crash), and the
 * format parsers have to reject the inputs they claim to reject rather than
 * silently clamping them into something plausible.
 */
import type { CheckSuite } from "./harness.mts";
import {
  checkContrast,
  contrastRatio,
  formatHex,
  formatHsl,
  formatOklch,
  formatRgb,
  parseColor,
  parseHex,
  rgbToHsl,
  rgbToOklch,
  simulateColorBlindness,
  type Rgba,
} from "../lib/reng";

const opaque = (r: number, g: number, b: number): Rgba => ({ r, g, b, a: 1 });
const BLACK = opaque(0, 0, 0);
const WHITE = opaque(255, 255, 255);

export const checks: CheckSuite = (check) => {
  // ---------- contrast: known WCAG etalons ----------
  check(
    "reng: qara ag uzerinde 21:1 - WCAG-in maksimumu",
    contrastRatio(BLACK, WHITE) === 21,
    `alindi ${contrastRatio(BLACK, WHITE)}`,
  );

  check(
    "reng: ag qara uzerinde de 21:1 - kontrast simmetrikdir",
    contrastRatio(WHITE, BLACK) === 21,
    `alindi ${contrastRatio(WHITE, BLACK)}`,
  );

  check(
    "reng: eyni reng ozu ile 1:1",
    contrastRatio(opaque(37, 99, 235), opaque(37, 99, 235)) === 1,
    `alindi ${contrastRatio(opaque(37, 99, 235), opaque(37, 99, 235))}`,
  );

  {
    // #767676 on white is the textbook "just barely passes AA" grey - it is
    // the value style guides cite as the darkest safe grey on a white page.
    const result = checkContrast(opaque(0x76, 0x76, 0x76), WHITE);
    check(
      "reng: #767676 ag uzerinde AA sernini ancaq kecir",
      result.ok && result.verdict.ratio === 4.54 && result.verdict.aaNormal,
      `alindi ${result.ok ? result.verdict.ratio : result.error}`,
    );
    check(
      "reng: #767676 ag uzerinde AAA-ni kecmir",
      result.ok && !result.verdict.aaaNormal,
      `alindi ${result.ok ? result.verdict.aaaNormal : result.error}`,
    );
  }

  // ---------- HEX <-> RGB <-> HSL round trip ----------
  {
    const samples: Rgba[] = [
      opaque(0x33, 0x66, 0xcc),
      opaque(255, 0, 0),
      opaque(0, 255, 0),
      opaque(0, 0, 255),
      opaque(128, 128, 128),
      opaque(1, 2, 3),
      opaque(254, 253, 252),
      opaque(17, 201, 99),
    ];
    const survivors = samples.filter((color) => {
      const roundTripped = parseColor(formatHsl(color));
      return (
        roundTripped.ok &&
        roundTripped.color.r === color.r &&
        roundTripped.color.g === color.g &&
        roundTripped.color.b === color.b
      );
    });
    check(
      "reng: HEX->HSL->HEX devresinde 8 numunenin hamisi qorunur",
      survivors.length === samples.length,
      `${survivors.length}/${samples.length} qorundu`,
    );
  }

  check(
    "reng: qisa #abc uzun #aabbcc ile eyni netice verir",
    JSON.stringify(parseHex("#abc")) === JSON.stringify(parseHex("#aabbcc")),
    `#abc -> ${JSON.stringify(parseHex("#abc"))}, #aabbcc -> ${JSON.stringify(parseHex("#aabbcc"))}`,
  );

  // ---------- invalid input ----------
  {
    const result = parseColor("#gg0000");
    check("reng: #gg0000 aydin xeta verir", !result.ok, `alindi ${JSON.stringify(result)}`);
  }
  {
    const result = parseColor("rgb(300, 0, 0)");
    check(
      "reng: rgb(300,0,0) - 255-den boyuk kanal redd edilir",
      !result.ok,
      `alindi ${JSON.stringify(result)}`,
    );
  }
  {
    const result = parseColor("rgb(-10, 0, 0)");
    check("reng: menfi kanal redd edilir", !result.ok, `alindi ${JSON.stringify(result)}`);
  }
  {
    const result = parseColor("");
    check("reng: bos setir aydin xeta verir", !result.ok, `alindi ${JSON.stringify(result)}`);
  }
  {
    const result = parseColor("not-a-color");
    check("reng: taninmayan format xeta verir", !result.ok, `alindi ${JSON.stringify(result)}`);
  }

  // ---------- hue wraps instead of erroring ----------
  {
    const negative = parseColor("hsl(-30, 100%, 50%)");
    const wrapped = parseColor("hsl(330, 100%, 50%)");
    check(
      "reng: menfi bucaq 360-a gore doner, xeta vermir",
      negative.ok && wrapped.ok && JSON.stringify(negative.color) === JSON.stringify(wrapped.color),
      `-30 -> ${JSON.stringify(negative)}, 330 -> ${JSON.stringify(wrapped)}`,
    );
  }

  // ---------- percentage vs integer rgb ----------
  {
    const percent = parseColor("rgb(100%, 0%, 0%)");
    const integer = parseColor("rgb(255, 0, 0)");
    check(
      "reng: rgb(100%,0%,0%) rgb(255,0,0) ile eyni netice verir",
      percent.ok && integer.ok && JSON.stringify(percent.color) === JSON.stringify(integer.color),
      `percent -> ${JSON.stringify(percent)}, integer -> ${JSON.stringify(integer)}`,
    );
  }

  // ---------- modern slash-alpha syntax ----------
  {
    const result = parseColor("hsl(0 100% 50% / 50%)");
    check(
      "reng: hsl slash sintaksisi alfani duzgun oxuyur",
      result.ok && result.color.a === 0.5,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- format -> parse round trip ----------
  {
    const original: Rgba = { r: 10, g: 20, b: 30, a: 0.5 };
    const reparsed = parseColor(formatHex(original));
    check(
      "reng: formatHex netices yeniden parse edende eyni rengi verir",
      reparsed.ok &&
        reparsed.color.r === original.r &&
        reparsed.color.g === original.g &&
        reparsed.color.b === original.b &&
        Math.abs(reparsed.color.a - original.a) < 0.01,
      `alindi ${JSON.stringify(reparsed)}`,
    );
  }

  // ---------- OKLCH: known etalon (#ff0000, published Oklab reference value) ----------
  {
    const red = rgbToOklch(opaque(255, 0, 0));
    const lOk = Math.abs(red.l - 0.628) < 0.005;
    const cOk = Math.abs(red.c - 0.2577) < 0.005;
    const hOk = Math.abs(red.h - 29.23) < 0.5;
    check(
      "reng: #ff0000 -> oklch(62.8% 0.2577 29.23) melum qiymete uygundur",
      lOk && cOk && hOk,
      `alindi L=${red.l} C=${red.c} H=${red.h}`,
    );
  }
  {
    const white = rgbToOklch(WHITE);
    const black = rgbToOklch(BLACK);
    check(
      "reng: ag L=1 C=0, qara L=0 C=0 - Oklab-in tetbiqi",
      Math.abs(white.l - 1) < 0.001 &&
        white.c < 0.0005 &&
        black.l === 0 &&
        black.c === 0,
      `ag -> ${JSON.stringify(white)}, qara -> ${JSON.stringify(black)}`,
    );
  }
  {
    const grays = [opaque(50, 50, 50), opaque(120, 120, 120), opaque(200, 200, 200)];
    const allAchromatic = grays.every((gray) => rgbToOklch(gray).c < 0.0005 && rgbToOklch(gray).h === 0);
    check(
      "reng: bozumtul renglerin OKLCH xromasi sifira yaxindir",
      allAchromatic,
      `alindi ${JSON.stringify(grays.map((g) => rgbToOklch(g)))}`,
    );
  }
  {
    // formatOklch must feed straight back into parseColor - the accordion's
    // own displayed string has to be paste-able into itself.
    const original = opaque(37, 99, 235);
    const reparsed = parseColor(formatOklch(original));
    const close =
      reparsed.ok &&
      Math.abs(reparsed.color.r - original.r) <= 2 &&
      Math.abs(reparsed.color.g - original.g) <= 2 &&
      Math.abs(reparsed.color.b - original.b) <= 2;
    check(
      "reng: formatOklch netices geri parse edende eyni rengi verir",
      close,
      `alindi ${JSON.stringify(reparsed)}`,
    );
  }

  // ---------- alpha and contrast ----------
  {
    const result = checkContrast(BLACK, { r: 255, g: 255, b: 255, a: 0.5 });
    check(
      "reng: yari-seffaf fon kontrastsiz - hesablana bilmir",
      !result.ok,
      `alindi ${JSON.stringify(result)}`,
    );
  }
  {
    // fully transparent text paints nothing - the composited result equals
    // the background exactly, so ratio 1 is the only honest answer.
    const result = checkContrast({ r: 0, g: 0, b: 0, a: 0 }, WHITE);
    check(
      "reng: tam seffaf metn - kontrast fonla eynidir (1:1)",
      result.ok && result.verdict.ratio === 1,
      `alindi ${result.ok ? result.verdict.ratio : result.error}`,
    );
  }
  {
    // a light grey on white that fails AA-normal - the suggestion must
    // actually clear the threshold when it is recomputed, not just claim to.
    const failing = checkContrast(opaque(200, 200, 200), WHITE);
    const suggestionWorks =
      failing.ok &&
      !failing.verdict.aaNormal &&
      failing.suggestion !== null &&
      checkContrast(failing.suggestion.color, WHITE).ok &&
      (checkContrast(failing.suggestion.color, WHITE) as { ok: true; verdict: { aaNormal: boolean } })
        .verdict.aaNormal;
    check(
      "reng: kontrast teklifi yenidence olculende AA-ni kecir",
      suggestionWorks,
      `alindi ${JSON.stringify(failing)}`,
    );
  }

  // ---------- colour-blindness simulation ----------
  {
    const gray = opaque(128, 128, 128);
    const same =
      JSON.stringify(simulateColorBlindness(gray, "protanopia")) === JSON.stringify(gray) &&
      JSON.stringify(simulateColorBlindness(gray, "deuteranopia")) === JSON.stringify(gray) &&
      JSON.stringify(simulateColorBlindness(gray, "tritanopia")) === JSON.stringify(gray);
    check(
      "reng: boz reng her uc simulyasiyada deyismir (setirlerin cemi 1-dir)",
      same,
      `alindi ${JSON.stringify(gray)}`,
    );
  }
  {
    const withAlpha: Rgba = { r: 255, g: 0, b: 0, a: 0.3 };
    const simulated = simulateColorBlindness(withAlpha, "deuteranopia");
    check(
      "reng: renk korlugu simulyasiyasi alfani deyismir",
      simulated.a === withAlpha.a,
      `alindi ${simulated.a}`,
    );
  }

  // ---------- formatRgb sanity ----------
  check(
    "reng: formatRgb alfa 1-de rgba yox rgb yazir",
    formatRgb(WHITE) === "rgb(255, 255, 255)",
    `alindi ${formatRgb(WHITE)}`,
  );
  check(
    "reng: formatRgb alfa < 1-de rgba yazir",
    formatRgb({ r: 255, g: 255, b: 255, a: 0.5 }) === "rgba(255, 255, 255, 0.5)",
    `alindi ${formatRgb({ r: 255, g: 255, b: 255, a: 0.5 })}`,
  );

  // ---------- rgbToHsl sanity used elsewhere in the suite ----------
  check(
    "reng: qirmizinin HSL-i (0, 100%, 50%) - melum qiymet",
    JSON.stringify(rgbToHsl(opaque(255, 0, 0))) === JSON.stringify({ h: 0, s: 100, l: 50, a: 1 }),
    `alindi ${JSON.stringify(rgbToHsl(opaque(255, 0, 0)))}`,
  );
};
