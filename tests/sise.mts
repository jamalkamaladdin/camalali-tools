/*
 * What is worth checking here: the known CSS shape for a typical glass
 * panel, that `-webkit-backdrop-filter` is always exactly equal to
 * `backdrop-filter` (the one invariant a copy-paste edit could silently
 * break), that zero blur is legal (no blur, still glass) while a negative
 * one is an error, that each of the three ways a colour or opacity can be
 * malformed is reported rather than thrown, and that the assembled block
 * carries every declaration exactly once.
 */
import type { CheckSuite } from "./harness.mts";
import { buildGlass, type GlassInput } from "../lib/sise";

const BASE: GlassInput = {
  blur: 12,
  saturate: 180,
  backgroundHex: "#ffffff",
  backgroundOpacity: 0.15,
  borderHex: "#ffffff",
  borderOpacity: 0.3,
  borderWidth: 1,
  shadowBlur: 32,
  shadowOpacity: 0.2,
};

export const checks: CheckSuite = (check) => {
  const known = buildGlass(BASE);
  check(
    "sise: the backdrop-filter for a typical panel matches the known blur+saturate combination",
    known.ok && known.css.backdropFilter === "blur(12px) saturate(180%)",
    `got: ${JSON.stringify(known)}`,
  );

  check(
    "sise: the -webkit- prefixed filter is always identical to the unprefixed one",
    known.ok && known.css.webkitBackdropFilter === known.css.backdropFilter,
    `got: ${JSON.stringify(known)}`,
  );

  check(
    "sise: the background is the parsed HEX composited with its own opacity as rgba()",
    known.ok && known.css.background === "rgba(255, 255, 255, 0.15)",
    `got: ${JSON.stringify(known)}`,
  );

  check(
    "sise: the border line is 'width solid rgba(...)'",
    known.ok && known.css.border === "1px solid rgba(255, 255, 255, 0.3)",
    `got: ${JSON.stringify(known)}`,
  );

  check(
    "sise: the shadow's vertical offset is derived as half its blur radius",
    known.ok && known.css.boxShadow === "0px 16px 32px rgba(0, 0, 0, 0.2)",
    `got: ${JSON.stringify(known)}`,
  );

  const zeroBlur = buildGlass({ ...BASE, blur: 0 });
  check(
    "sise: zero blur is legal — the panel still carries a fill and a border",
    zeroBlur.ok && zeroBlur.css.backdropFilter === "blur(0px) saturate(180%)",
    `got: ${JSON.stringify(zeroBlur)}`,
  );

  const negativeBlur = buildGlass({ ...BASE, blur: -4 });
  check(
    "sise: a negative blur is an error, not a thrown exception",
    negativeBlur.ok === false,
    `got: ${JSON.stringify(negativeBlur)}`,
  );

  const negativeSaturate = buildGlass({ ...BASE, saturate: -10 });
  check(
    "sise: a negative saturate is an error",
    negativeSaturate.ok === false,
    `got: ${JSON.stringify(negativeSaturate)}`,
  );

  const badHex = buildGlass({ ...BASE, backgroundHex: "not-a-colour" });
  check(
    "sise: an unparsable background HEX is an error",
    badHex.ok === false,
    `got: ${JSON.stringify(badHex)}`,
  );

  const badOpacity = buildGlass({ ...BASE, borderOpacity: 1.4 });
  check(
    "sise: a border opacity outside 0-1 is an error",
    badOpacity.ok === false,
    `got: ${JSON.stringify(badOpacity)}`,
  );

  const fullBlockLines = known.ok ? known.css.fullBlock.split("\n") : [];
  const fullBlockHasAllFive = ["background:", "backdrop-filter:", "-webkit-backdrop-filter:", "border:", "box-shadow:"].every(
    (declaration) => fullBlockLines.filter((line) => line.startsWith(declaration)).length === 1,
  );
  check(
    "sise: the pasteable block carries each of the five declarations exactly once",
    fullBlockHasAllFive,
    `got: ${known.ok ? known.css.fullBlock : JSON.stringify(known)}`,
  );

  const highSaturation = buildGlass({ ...BASE, saturate: 100 });
  check(
    "sise: saturate 100 (CSS's own default, meaning 'unchanged') is accepted like any other value",
    highSaturation.ok && highSaturation.css.backdropFilter.includes("saturate(100%)"),
    `got: ${JSON.stringify(highSaturation)}`,
  );
};
