/*
 * The place a wrong edit in sekil-reng.ts would hide: the median-cut split
 * has to actually separate distinct colours (not blend them), shares have to
 * sum to something proportional to the input, transparent pixels must never
 * count toward the palette, and every degenerate input (a single colour, an
 * empty buffer) has to return a sane result instead of crashing or looping.
 */
import type { CheckSuite } from "./harness.mts";
import {
  averageColor,
  buildCssVariableBlock,
  extractPalette,
  lightestAndDarkest,
  type PaletteColor,
} from "../lib/sekil-reng";

/** Appends `count` RGBA quadruples of one colour to `out`. */
function pushSolid(
  out: number[],
  count: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): void {
  for (let i = 0; i < count; i += 1) {
    out.push(r, g, b, a);
  }
}

function buffer(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values);
}

const EPSILON_PERCENT = 2;

export const checks: CheckSuite = (check) => {
  // ---------- extractPalette: two pure colours, even split ----------
  {
    const pixels: number[] = [];
    pushSolid(pixels, 100, 255, 0, 0);
    pushSolid(pixels, 100, 0, 0, 255);
    const palette = extractPalette(buffer(pixels), 2);
    const red = palette.find((c) => c.rgb.r > c.rgb.b);
    const blue = palette.find((c) => c.rgb.b > c.rgb.r);

    check(
      "sekil-reng: 50/50 qirmizi/mavi iki xalis swatch qaytarir",
      palette.length === 2 &&
        red !== undefined &&
        red.rgb.r === 255 &&
        red.rgb.g === 0 &&
        red.rgb.b === 0 &&
        blue !== undefined &&
        blue.rgb.b === 255 &&
        blue.rgb.r === 0 &&
        blue.rgb.g === 0,
      `alindi ${palette.length} swatch: qirmizi=${red ? JSON.stringify(red.rgb) : "yoxdur"}, mavi=${blue ? JSON.stringify(blue.rgb) : "yoxdur"}`,
    );
    check(
      "sekil-reng: her ikisinin payi ~50%-dir",
      red !== undefined &&
        blue !== undefined &&
        Math.abs(red.sharePercent - 50) < EPSILON_PERCENT &&
        Math.abs(blue.sharePercent - 50) < EPSILON_PERCENT,
      `alindi qirmizi=${red?.sharePercent} mavi=${blue?.sharePercent}`,
    );
  }

  // ---------- extractPalette: single colour, count requested too high ----------
  {
    const pixels: number[] = [];
    pushSolid(pixels, 40, 120, 80, 200);
    const palette = extractPalette(buffer(pixels), 6);

    check(
      "sekil-reng: tek rengli sekil 6 istense de cokmur, her swatch eyni rengdir",
      palette.length >= 1 &&
        palette.length <= 6 &&
        palette.every((c) => c.rgb.r === 120 && c.rgb.g === 80 && c.rgb.b === 200),
      `alindi ${palette.length} swatch: ${JSON.stringify(palette.map((c) => c.rgb))}`,
    );
  }

  // ---------- extractPalette: three colours, known proportions ----------
  {
    const pixels: number[] = [];
    pushSolid(pixels, 50, 255, 0, 0); // red 50%
    pushSolid(pixels, 30, 0, 255, 0); // green 30%
    pushSolid(pixels, 20, 0, 0, 255); // blue 20%
    const palette = extractPalette(buffer(pixels), 3);
    const shares = palette.map((c) => Math.round(c.sharePercent));

    check(
      "sekil-reng: uc xalis reng uc swatch verir, azalan sirada, 50/30/20-ye uygun",
      palette.length === 3 &&
        palette.every((c, i) => i === 0 || palette[i - 1].sharePercent >= c.sharePercent) &&
        shares.length === 3 &&
        Math.abs(shares[0] - 50) < EPSILON_PERCENT &&
        Math.abs(shares[1] - 30) < EPSILON_PERCENT &&
        Math.abs(shares[2] - 20) < EPSILON_PERCENT,
      `alindi ${palette.length} swatch, paylar ${JSON.stringify(shares)}`,
    );
  }

  // ---------- extractPalette: transparent pixels excluded ----------
  {
    const pixels: number[] = [];
    pushSolid(pixels, 300, 0, 0, 0, 0); // near-fully transparent "black"
    pushSolid(pixels, 20, 40, 200, 60, 255); // a small opaque patch of real colour
    const palette = extractPalette(buffer(pixels), 3);

    check(
      "sekil-reng: seffaf pikseller palitraya qatilmir, qalan yegane swatch %100 pay gosterir",
      palette.length === 1 &&
        palette[0].rgb.r === 40 &&
        palette[0].rgb.g === 200 &&
        palette[0].rgb.b === 60 &&
        palette[0].sharePercent === 100,
      `alindi ${JSON.stringify(palette)}`,
    );
  }

  // ---------- extractPalette: empty input never throws ----------
  {
    let threw = false;
    let palette: PaletteColor[] = [];
    try {
      palette = extractPalette(buffer([]), 4);
    } catch {
      threw = true;
    }
    check(
      "sekil-reng: bos buffer xeta atmir, bos massiv qaytarir",
      !threw && palette.length === 0,
      threw ? "extractPalette bos girisde xeta atdi" : `alindi ${palette.length}`,
    );
  }

  // ---------- averageColor ----------
  {
    const pixels: number[] = [];
    pushSolid(pixels, 50, 0, 0, 0);
    pushSolid(pixels, 50, 255, 255, 255);
    const avg = averageColor(buffer(pixels));
    check(
      "sekil-reng: averageColor qara/ag 50/50-de tam ortadadir",
      avg.r === 128 && avg.g === 128 && avg.b === 128 && avg.a === 1,
      `alindi ${JSON.stringify(avg)}`,
    );
  }

  // ---------- lightestAndDarkest ----------
  {
    const black: PaletteColor = extractPalette(buffer(pushSolidNew(30, 0, 0, 0)), 1)[0];
    const white: PaletteColor = extractPalette(buffer(pushSolidNew(30, 255, 255, 255)), 1)[0];
    const grey: PaletteColor = extractPalette(buffer(pushSolidNew(30, 128, 128, 128)), 1)[0];
    const { lightest, darkest } = lightestAndDarkest([black, white, grey]);
    check(
      "sekil-reng: lightestAndDarkest ani ile teyin edir",
      lightest.hex === white.hex && darkest.hex === black.hex,
      `alindi lightest=${lightest.hex} darkest=${darkest.hex}`,
    );
  }

  // ---------- lightestAndDarkest: empty palette throws a clear error ----------
  {
    let threw = false;
    try {
      lightestAndDarkest([]);
    } catch {
      threw = true;
    }
    check("sekil-reng: lightestAndDarkest bos palitrada xeta atir", threw, "bos palitrada xeta atmadi");
  }

  // ---------- buildCssVariableBlock: exact string ----------
  {
    const testPalette: PaletteColor[] = [
      {
        hex: "#a1b2c3",
        rgb: { r: 161, g: 178, b: 195, a: 1 },
        hsl: { h: 210, s: 20, l: 70, a: 1 },
        sharePercent: 60,
      },
      {
        hex: "#445566",
        rgb: { r: 68, g: 85, b: 102, a: 1 },
        hsl: { h: 210, s: 20, l: 33, a: 1 },
        sharePercent: 40,
      },
    ];
    const expected = ":root {\n  --palette-1: #a1b2c3;\n  --palette-2: #445566;\n}";
    const got = buildCssVariableBlock(testPalette);
    check("sekil-reng: buildCssVariableBlock tam gozlenilen setri verir", got === expected, `alindi ${got}`);
  }

  // ---------- buildCssVariableBlock: empty palette does not throw ----------
  {
    let threw = false;
    let got = "";
    try {
      got = buildCssVariableBlock([]);
    } catch {
      threw = true;
    }
    check(
      "sekil-reng: buildCssVariableBlock bos palitrada xeta atmir, bosluqlu blok verir",
      !threw && got === ":root {\n}",
      threw ? "xeta atdi" : `alindi ${got}`,
    );
  }
};

/** Same helper as `pushSolid` above, but returning a fresh flat array — kept local to the `lightestAndDarkest` block for readability. */
function pushSolidNew(count: number, r: number, g: number, b: number): number[] {
  const out: number[] = [];
  pushSolid(out, count, r, g, b);
  return out;
}
