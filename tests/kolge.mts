/*
 * What is worth checking here: the known CSS shape the spec asks for, that a
 * negative blur is rejected rather than thrown, that negative offsets and
 * spreads (both legal in CSS) are accepted, that an opaque colour drops the
 * alpha channel the way `rgba()` formatting always has on this site, and the
 * round trip — build a shadow, parse the string back, and land on the same
 * numbers — for both the `rgba()` and the alpha-less `rgb()` case.
 */
import type { CheckSuite } from "./harness.mts";
import { buildBoxShadow, hexOpacityToRgba, parseBoxShadow, type ShadowInput } from "../lib/kolge";

const BASE: ShadowInput = {
  offsetX: 0,
  offsetY: 4,
  blur: 12,
  spread: 0,
  colorHex: "#000000",
  opacity: 0.25,
  inset: false,
};

export const checks: CheckSuite = (check) => {
  const known = buildBoxShadow(BASE);
  check(
    "kolge: known offset/blur/colour combination matches the spec example exactly",
    known.ok && known.css === "0px 4px 12px 0px rgba(0, 0, 0, 0.25)",
    `got: ${JSON.stringify(known)}`,
  );

  const transparent = buildBoxShadow({ ...BASE, opacity: 0 });
  check(
    "kolge: opacity 0 still renders a valid rgba() with alpha 0, not an error",
    transparent.ok && transparent.css.endsWith("rgba(0, 0, 0, 0)"),
    `got: ${JSON.stringify(transparent)}`,
  );

  const opaque = buildBoxShadow({ ...BASE, opacity: 1 });
  check(
    "kolge: opacity 1 drops the alpha channel and prints rgb(), matching reng.ts's own formatRgb rule",
    opaque.ok && opaque.css.endsWith("rgb(0, 0, 0)"),
    `got: ${JSON.stringify(opaque)}`,
  );

  const inset = buildBoxShadow({ ...BASE, inset: true });
  check(
    "kolge: the inset flag prefixes the CSS with the literal word 'inset'",
    inset.ok && inset.css.startsWith("inset "),
    `got: ${JSON.stringify(inset)}`,
  );

  const negativeBlur = buildBoxShadow({ ...BASE, blur: -1 });
  check(
    "kolge: a negative blur radius comes back as an error, not a thrown exception",
    negativeBlur.ok === false,
    `got: ${JSON.stringify(negativeBlur)}`,
  );

  const negativeOffsets = buildBoxShadow({ ...BASE, offsetX: -10, offsetY: -6, spread: -2 });
  check(
    "kolge: negative offsets and a negative spread are legal CSS and are accepted",
    negativeOffsets.ok && negativeOffsets.css.startsWith("-10px -6px 12px -2px"),
    `got: ${JSON.stringify(negativeOffsets)}`,
  );

  const badHex = hexOpacityToRgba("not-a-colour", 0.5);
  check(
    "kolge: an unparsable HEX colour is reported as an error",
    badHex.ok === false,
    `got: ${JSON.stringify(badHex)}`,
  );

  const badOpacity = hexOpacityToRgba("#336699", 1.5);
  check(
    "kolge: an opacity outside 0-1 is reported as an error",
    badOpacity.ok === false,
    `got: ${JSON.stringify(badOpacity)}`,
  );

  const brokenParse = parseBoxShadow("this is not a box-shadow value");
  check(
    "kolge: an unparsable shadow string is a table-row error, not a thrown exception",
    brokenParse.ok === false,
    `got: ${JSON.stringify(brokenParse)}`,
  );

  const built = buildBoxShadow({
    offsetX: -3.5,
    offsetY: 7,
    blur: 20,
    spread: 2,
    colorHex: "#3366ff",
    opacity: 0.4,
    inset: true,
  });
  const roundTrip = built.ok ? parseBoxShadow(built.css) : null;
  check(
    "kolge: a built shadow, parsed back, reproduces every field it was built from",
    built.ok &&
      roundTrip !== null &&
      roundTrip.ok &&
      roundTrip.value.offsetX === -3.5 &&
      roundTrip.value.offsetY === 7 &&
      roundTrip.value.blur === 20 &&
      roundTrip.value.spread === 2 &&
      roundTrip.value.inset === true &&
      roundTrip.value.colorHex === "#3366ff" &&
      Math.abs(roundTrip.value.opacity - 0.4) < 0.01,
    `built: ${JSON.stringify(built)}, parsed: ${JSON.stringify(roundTrip)}`,
  );

  const opaqueBuilt = buildBoxShadow({ ...BASE, opacity: 1 });
  const opaqueRoundTrip = opaqueBuilt.ok ? parseBoxShadow(opaqueBuilt.css) : null;
  check(
    "kolge: the round trip also holds for the alpha-less rgb() case",
    opaqueBuilt.ok && opaqueRoundTrip !== null && opaqueRoundTrip.ok && opaqueRoundTrip.value.opacity === 1,
    `built: ${JSON.stringify(opaqueBuilt)}, parsed: ${JSON.stringify(opaqueRoundTrip)}`,
  );
};
