/*
 * What is worth checking here: the eleven-step curve is monotonic (a wrong
 * edit that swapped two entries in `LIGHTNESS` would otherwise pass every
 * other check silently), an achromatic base is untouched by the hue-shift
 * option (chroma 0 has no hue to shift), a chromatic base visibly changes
 * under it, the three export formats each carry the exact hex the scale
 * computed, and a malformed base colour comes back as a `Result` rather than
 * a thrown exception. The pure-black-on-white 21:1 case is included directly
 * against `reng.ts`'s own `contrastRatio` — that is the function every
 * `contrastOnWhite`/`contrastOnBlack` field in this file is built from, so a
 * regression there would otherwise only show up as an unexplained drift in
 * this tool's numbers.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildPaletteScale,
  formatCssVariables,
  formatHexList,
  formatTailwindTheme,
  PALETTE_STEPS,
} from "../lib/palitra";
import { contrastRatio, parseColor, type Rgba } from "../lib/reng";

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

function mustParse(raw: string): Rgba {
  const parsed = parseColor(raw);
  if (!parsed.ok) throw new Error(`test fixture "${raw}" did not parse: ${parsed.error}`);
  return parsed.color;
}

export const checks: CheckSuite = (check) => {
  check(
    "palitra: pure black on pure white is the textbook 21:1 — the ratio every step's contrast field is built from",
    contrastRatio(BLACK, WHITE) === 21,
    `got: ${contrastRatio(BLACK, WHITE)}`,
  );

  const grey = buildPaletteScale(mustParse("#808080"), { hueShift: false });
  if (!grey.ok) throw new Error(`grey scale unexpectedly failed: ${grey.error}`);
  const greyByStep = new Map(grey.scale.steps.map((s) => [s.step, s]));

  check(
    "palitra: the mid step of a grey base lands on the fixed 500-lightness target, not the input's own lightness",
    greyByStep.get("500")?.hex === "#8c8c8c",
    `got: ${greyByStep.get("500")?.hex}`,
  );

  check(
    "palitra: the lightest and darkest steps of a grey base match the ends of the fixed curve",
    greyByStep.get("50")?.hex === "#f8f8f8" && greyByStep.get("950")?.hex === "#121212",
    `50: ${greyByStep.get("50")?.hex}, 950: ${greyByStep.get("950")?.hex}`,
  );

  check(
    "palitra: contrast against white rises monotonically from step 50 to step 950",
    PALETTE_STEPS.every((step, index) => {
      if (index === 0) return true;
      const prev = greyByStep.get(PALETTE_STEPS[index - 1])!;
      const current = greyByStep.get(step)!;
      return current.contrastOnWhite > prev.contrastOnWhite;
    }),
    `values: ${PALETTE_STEPS.map((s) => greyByStep.get(s)?.contrastOnWhite).join(", ")}`,
  );

  check(
    "palitra: contrast against black falls monotonically from step 50 to step 950",
    PALETTE_STEPS.every((step, index) => {
      if (index === 0) return true;
      const prev = greyByStep.get(PALETTE_STEPS[index - 1])!;
      const current = greyByStep.get(step)!;
      return current.contrastOnBlack < prev.contrastOnBlack;
    }),
    `values: ${PALETTE_STEPS.map((s) => greyByStep.get(s)?.contrastOnBlack).join(", ")}`,
  );

  const greyWithShift = buildPaletteScale(mustParse("#808080"), { hueShift: true });
  if (!greyWithShift.ok) throw new Error(`grey (shifted) scale unexpectedly failed: ${greyWithShift.error}`);
  check(
    "palitra: hue shift has no effect on an achromatic base — zero chroma has no hue to shift",
    JSON.stringify(grey.scale.steps.map((s) => s.hex)) ===
      JSON.stringify(greyWithShift.scale.steps.map((s) => s.hex)),
    `unshifted: ${JSON.stringify(grey.scale.steps.map((s) => s.hex))}, shifted: ${JSON.stringify(greyWithShift.scale.steps.map((s) => s.hex))}`,
  );

  const blueFlat = buildPaletteScale(mustParse("#2563eb"), { hueShift: false });
  const blueShifted = buildPaletteScale(mustParse("#2563eb"), { hueShift: true });
  if (!blueFlat.ok || !blueShifted.ok) throw new Error("blue scale unexpectedly failed");
  check(
    "palitra: hue shift visibly changes a chromatic base's outer steps",
    blueFlat.scale.steps[0].hex !== blueShifted.scale.steps[0].hex,
    `flat: ${blueFlat.scale.steps[0].hex}, shifted: ${blueShifted.scale.steps[0].hex}`,
  );

  check(
    "palitra: a malformed colour (non-finite channel) returns an error result rather than throwing",
    (() => {
      const result = buildPaletteScale({ r: NaN, g: 0, b: 0, a: 1 }, { hueShift: false });
      return !result.ok && typeof result.error === "string" && result.error.length > 0;
    })(),
    "expected ok: false with a non-empty error",
  );

  const theme = formatTailwindTheme(grey.scale, "brand");
  check(
    "palitra: the Tailwind @theme block names the token and carries the exact computed hex",
    theme.includes("@theme {") && theme.includes("--color-brand-500: #8c8c8c;"),
    theme,
  );

  const cssVars = formatCssVariables(grey.scale, "brand");
  check(
    "palitra: the plain CSS custom-property block uses the same hex without the Tailwind prefix",
    cssVars.includes(":root {") && cssVars.includes("--brand-500: #8c8c8c;"),
    cssVars,
  );

  const hexList = formatHexList(grey.scale);
  const hexLines = hexList.split("\n");
  check(
    "palitra: the plain hex list has exactly eleven lines, one per step, in order",
    hexLines.length === 11 && hexLines[5] === "500: #8c8c8c",
    hexList,
  );

  check(
    "palitra: PALETTE_STEPS is the eleven Tailwind-shaped step names in ascending order",
    PALETTE_STEPS.length === 11 && PALETTE_STEPS[0] === "50" && PALETTE_STEPS[10] === "950",
    `got: ${JSON.stringify(PALETTE_STEPS)}`,
  );
};
