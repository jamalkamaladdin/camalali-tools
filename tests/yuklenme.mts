/*
 * What is worth checking here: the ring's stroke width and the dots'
 * stagger match the documented size/8 and speed/6 ratios exactly (a known
 * answer for each), both ratios' minimum clamps kick in at a small size
 * rather than rounding to zero, a malformed size/speed/colour comes back as
 * an error list rather than a thrown exception, every one of the five kinds
 * produces non-empty output for a standard config, the given colour string
 * passes through unchanged, and building the same config twice is
 * deterministic.
 */
import type { CheckSuite } from "./harness.mts";
import { buildSpinner, SPINNER_KINDS, validateSpinnerConfig, type SpinnerConfig } from "../lib/yuklenme";

export const checks: CheckSuite = (check) => {
  const ring = buildSpinner({ kind: "ring", sizePx: 40, speedMs: 800, color: "#5b8def" });
  check(
    "yuklenme: a 40px ring gets an 8th-of-size, minimum-2px stroke and the exact spin animation line",
    ring.css.includes("border: 5px solid") &&
      ring.css.includes("animation: loader-ring-spin 800ms linear infinite;"),
    `got: ${ring.css}`,
  );

  const smallRing = buildSpinner({ kind: "ring", sizePx: 8, speedMs: 800, color: "#5b8def" });
  check(
    "yuklenme: an 8px ring's stroke clamps to the 2px minimum rather than rounding to 1px",
    smallRing.css.includes("border: 2px solid"),
    `got: ${smallRing.css}`,
  );

  const zeroSize: SpinnerConfig = { kind: "ring", sizePx: 0, speedMs: 800, color: "#5b8def" };
  const zeroSizeResult = buildSpinner(zeroSize);
  check(
    "yuklenme: a size of zero is rejected as an error, not a thrown exception",
    zeroSizeResult.css === "" && zeroSizeResult.html === "" && zeroSizeResult.errors.length > 0,
    `got: ${JSON.stringify(zeroSizeResult)}`,
  );

  const nanSpeed: SpinnerConfig = { kind: "ring", sizePx: 40, speedMs: Number.NaN, color: "#5b8def" };
  check(
    "yuklenme: a non-finite speed is rejected the same way",
    validateSpinnerConfig(nanSpeed).valid === false,
    `got: ${JSON.stringify(validateSpinnerConfig(nanSpeed))}`,
  );

  const blankColor: SpinnerConfig = { kind: "ring", sizePx: 40, speedMs: 800, color: "  " };
  check(
    "yuklenme: a blank colour is rejected",
    validateSpinnerConfig(blankColor).valid === false,
    `got: ${JSON.stringify(validateSpinnerConfig(blankColor))}`,
  );

  const dots = buildSpinner({ kind: "dots", sizePx: 24, speedMs: 600, color: "#5b8def" });
  check(
    "yuklenme: three dots stagger by exactly a sixth of the cycle each — 0ms, 100ms, 200ms at speed 600ms",
    dots.css.includes(".loader-dots span:nth-child(1) { animation-delay: 0ms; }") &&
      dots.css.includes(".loader-dots span:nth-child(2) { animation-delay: 100ms; }") &&
      dots.css.includes(".loader-dots span:nth-child(3) { animation-delay: 200ms; }"),
    `got: ${dots.css}`,
  );

  const allKindsProduceOutput = SPINNER_KINDS.every((kind) => {
    const result = buildSpinner({ kind, sizePx: 32, speedMs: 700, color: "#5b8def" });
    return result.errors.length === 0 && result.css.length > 0 && result.html.length > 0;
  });
  check(
    "yuklenme: every one of the five kinds produces non-empty html and css for a standard config",
    allKindsProduceOutput,
    "expected all five SPINNER_KINDS to build without error",
  );

  const smallBar = buildSpinner({ kind: "bar", sizePx: 6, speedMs: 800, color: "#5b8def" });
  check(
    "yuklenme: a bar's thickness clamps to the 4px minimum rather than rounding to 1px",
    smallBar.css.includes("  height: 4px;"),
    `got: ${smallBar.css}`,
  );

  const skeleton = buildSpinner({ kind: "skeleton", sizePx: 40, speedMs: 800, color: "#5b8def" });
  check(
    "yuklenme: skeleton radius is a quarter of size — 10px at 40px",
    skeleton.css.includes("border-radius: 10px;"),
    `got: ${skeleton.css}`,
  );

  const customColor = buildSpinner({ kind: "pulse", sizePx: 32, speedMs: 800, color: "#123abc" });
  check(
    "yuklenme: the given colour string passes through unchanged",
    customColor.css.includes("#123abc"),
    `got: ${customColor.css}`,
  );

  const configA: SpinnerConfig = { kind: "ring", sizePx: 40, speedMs: 800, color: "#5b8def" };
  check(
    "yuklenme: building the same config twice is deterministic",
    buildSpinner(configA).css === buildSpinner(configA).css,
    "expected two builds of the same config to match",
  );
};
