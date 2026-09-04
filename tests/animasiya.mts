/*
 * What is worth checking here: the keyframes block and the animation
 * shorthand match a known config exactly (including that duration always
 * precedes delay in the shorthand, the one ordering CSS actually reads),
 * steps come out sorted by offset regardless of the order they were given
 * in, a step with no transforms omits the `transform` line rather than
 * emitting an empty one, seconds formatting drops trailing zeros the way a
 * hand-written stylesheet would, and a malformed config (bad identifier, an
 * offset outside 0–100, a zero iteration count) comes back as an error list
 * rather than a thrown exception.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildAnimationShorthand,
  buildKeyframesBlock,
  buildTransformValue,
  formatSeconds,
  generateAnimation,
  validateAnimationConfig,
  type AnimationConfig,
} from "../lib/animasiya";

const BASE_CONFIG: AnimationConfig = {
  name: "test-anim",
  steps: [
    { offset: 0, transforms: [{ kind: "translateY", value: -20 }], opacity: 0 },
    { offset: 100, transforms: [], opacity: 1 },
  ],
  durationMs: 1000,
  delayMs: 250,
  iterationCount: 1,
  direction: "normal",
  fillMode: "both",
  timingFunction: "ease-out",
};

export const checks: CheckSuite = (check) => {
  const block = buildKeyframesBlock(BASE_CONFIG);
  check(
    "animasiya: the keyframes block matches the known config exactly",
    block ===
      "@keyframes test-anim {\n  0% {\n    transform: translateY(-20px);\n    opacity: 0;\n  }\n  100% {\n    opacity: 1;\n  }\n}",
    `got: ${JSON.stringify(block)}`,
  );

  const shorthand = buildAnimationShorthand(BASE_CONFIG);
  check(
    "animasiya: the shorthand always writes duration before delay, regardless of which is larger",
    shorthand === "animation: test-anim 1s ease-out 0.25s 1 normal both;",
    `got: ${shorthand}`,
  );

  check(
    "animasiya: formatSeconds drops a trailing zero and keeps a whole second bare",
    formatSeconds(250) === "0.25s" && formatSeconds(1000) === "1s",
    `250ms: ${formatSeconds(250)}, 1000ms: ${formatSeconds(1000)}`,
  );

  check(
    "animasiya: a step with no transforms produces no transform line",
    buildTransformValue([]) === undefined,
    `got: ${JSON.stringify(buildTransformValue([]))}`,
  );

  check(
    "animasiya: multiple transform ops on one step join in the order given",
    buildTransformValue([
      { kind: "translateX", value: 10 },
      { kind: "scale", value: 1.2 },
    ]) === "translateX(10px) scale(1.2)",
    `got: ${buildTransformValue([{ kind: "translateX", value: 10 }, { kind: "scale", value: 1.2 }])}`,
  );

  const reversedOrder: AnimationConfig = {
    ...BASE_CONFIG,
    steps: [BASE_CONFIG.steps[1], BASE_CONFIG.steps[0]],
  };
  check(
    "animasiya: steps are sorted by offset regardless of the order they were given in",
    buildKeyframesBlock(reversedOrder) === block,
    "expected the reordered config to produce the identical block",
  );

  check(
    "animasiya: building the same config twice is deterministic",
    buildKeyframesBlock(BASE_CONFIG) === buildKeyframesBlock(BASE_CONFIG),
    "expected two builds of the same config to match",
  );

  const badName: AnimationConfig = { ...BASE_CONFIG, name: "1invalid" };
  const badNameResult = generateAnimation(badName);
  check(
    "animasiya: a name starting with a digit is rejected as an error, not a thrown exception",
    badNameResult.css === null && badNameResult.errors.length > 0,
    `got: ${JSON.stringify(badNameResult)}`,
  );

  const badOffset: AnimationConfig = {
    ...BASE_CONFIG,
    steps: [{ offset: 150, transforms: [], opacity: 1 }],
  };
  check(
    "animasiya: an offset outside 0..100 is rejected",
    validateAnimationConfig(badOffset).length > 0,
    `got: ${JSON.stringify(validateAnimationConfig(badOffset))}`,
  );

  const zeroIterations: AnimationConfig = { ...BASE_CONFIG, iterationCount: 0 };
  check(
    "animasiya: an iteration count of zero is rejected — infinite or a positive count only",
    validateAnimationConfig(zeroIterations).length > 0,
    `got: ${JSON.stringify(validateAnimationConfig(zeroIterations))}`,
  );

  const valid = generateAnimation(BASE_CONFIG);
  check(
    "animasiya: a valid config returns a non-null keyframes block, shorthand and combined css with no errors",
    valid.errors.length === 0 &&
      valid.keyframes !== null &&
      valid.shorthand !== null &&
      valid.css === `${valid.keyframes}\n\n${valid.shorthand}`,
    `got: ${JSON.stringify(valid)}`,
  );

  const infinite: AnimationConfig = { ...BASE_CONFIG, iterationCount: "infinite" };
  check(
    'animasiya: "infinite" iteration count passes through the shorthand as the bare word',
    buildAnimationShorthand(infinite).includes(" infinite "),
    `got: ${buildAnimationShorthand(infinite)}`,
  );
};
