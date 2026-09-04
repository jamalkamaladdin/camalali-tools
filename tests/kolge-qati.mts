/*
 * What is worth checking here: the layer count steps at the boundaries the
 * spec names (1-2 → two layers, 3-4 → three, 5-6 → four), the near-to-far
 * relationship actually holds — offset and blur grow, opacity falls, as
 * distance increases — a malformed level (zero, seven, a fraction) is an
 * error rather than a thrown exception, and the Tailwind reference table
 * both covers every level and quotes a value correctly.
 */
import type { CheckSuite } from "./harness.mts";
import { computeElevation, elevationLayers, TAILWIND_SHADOW_REFERENCE } from "../lib/kolge-qati";

export const checks: CheckSuite = (check) => {
  const level1 = computeElevation(1);
  check(
    "kolge-qati: level 1 produces exactly two layers",
    level1.ok && level1.layers.length === 2,
    `got: ${JSON.stringify(level1)}`,
  );

  const level3 = computeElevation(3);
  check(
    "kolge-qati: level 3 crosses into three layers",
    level3.ok && level3.layers.length === 3,
    `got: ${JSON.stringify(level3)}`,
  );

  const level4 = computeElevation(4);
  check(
    "kolge-qati: level 4 stays at three layers — the boundary has not moved early",
    level4.ok && level4.layers.length === 3,
    `got: ${JSON.stringify(level4)}`,
  );

  const level5 = computeElevation(5);
  check(
    "kolge-qati: level 5 crosses into four layers",
    level5.ok && level5.layers.length === 4,
    `got: ${JSON.stringify(level5)}`,
  );

  const level6 = computeElevation(6);
  check(
    "kolge-qati: level 6 stays at four layers, the top of the scale",
    level6.ok && level6.layers.length === 4,
    `got: ${JSON.stringify(level6)}`,
  );

  const layers = elevationLayers(6);
  const opacitiesFall = layers.every(
    (layer, index) => index === 0 || layer.opacity < layers[index - 1].opacity,
  );
  const offsetsGrow = layers.every(
    (layer, index) => index === 0 || layer.offsetY > layers[index - 1].offsetY,
  );
  const blurGrows = layers.every((layer, index) => index === 0 || layer.blur > layers[index - 1].blur);
  check(
    "kolge-qati: within one level, the far layer is bigger and paler than the near one",
    opacitiesFall && offsetsGrow && blurGrows,
    `got: ${JSON.stringify(layers)}`,
  );

  const zero = computeElevation(0);
  check(
    "kolge-qati: level 0 is rejected, not clamped or thrown",
    zero.ok === false,
    `got: ${JSON.stringify(zero)}`,
  );

  const seven = computeElevation(7);
  check(
    "kolge-qati: level 7 is rejected — the scale stops at 6",
    seven.ok === false,
    `got: ${JSON.stringify(seven)}`,
  );

  const fraction = computeElevation(2.5);
  check(
    "kolge-qati: a non-integer level is rejected",
    fraction.ok === false,
    `got: ${JSON.stringify(fraction)}`,
  );

  const level2 = computeElevation(2);
  const rgbaCount = level2.ok ? (level2.css.match(/rgba\(/g) ?? []).length : 0;
  check(
    "kolge-qati: the assembled CSS carries exactly one rgba() layer per computed layer",
    level2.ok && rgbaCount === level2.layers.length,
    `got: ${level2.ok ? level2.css : JSON.stringify(level2)}`,
  );

  const allLevelsCovered = ([1, 2, 3, 4, 5, 6] as const).every((level) => level in TAILWIND_SHADOW_REFERENCE);
  check(
    "kolge-qati: the Tailwind reference table has an entry for every one of the six levels",
    allLevelsCovered,
    `got keys: ${Object.keys(TAILWIND_SHADOW_REFERENCE).join(", ")}`,
  );

  check(
    "kolge-qati: the level-3 reference quotes Tailwind's actual shadow-md value",
    TAILWIND_SHADOW_REFERENCE[3].className === "shadow-md" &&
      TAILWIND_SHADOW_REFERENCE[3].css === "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    `got: ${JSON.stringify(TAILWIND_SHADOW_REFERENCE[3])}`,
  );
};
