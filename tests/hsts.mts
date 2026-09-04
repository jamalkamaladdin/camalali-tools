/*
 * What is worth checking: `max-age` parses out of a realistic header string
 * regardless of directive order or spacing, `max-age=0` is told apart from a
 * missing header (both parse to "no protection" but mean different things),
 * the preload bar is stricter than plain presence and names exactly what is
 * missing, the duration formatter never rounds a real value down to a zero of
 * a bigger unit, and a header sent over plain http is flagged as leaking
 * rather than credited as protection.
 */
import type { CheckSuite } from "./harness.mts";
import { evaluateHsts, formatMaxAge, parseHstsHeader, PRELOAD_MIN_MAX_AGE } from "../lib/hsts";

export const checks: CheckSuite = (check) => {
  const basic = parseHstsHeader("max-age=31536000; includeSubDomains; preload");
  check(
    "hsts: a well-formed header parses all three directives",
    basic.maxAgeSeconds === 31_536_000 && basic.includeSubDomains && basic.preload,
    `got: ${JSON.stringify(basic)}`,
  );

  const looseSpacing = parseHstsHeader("max-age = 600 ;INCLUDESUBDOMAINS");
  check(
    "hsts: directive names and spacing are read case-insensitively and loosely",
    looseSpacing.maxAgeSeconds === 600 && looseSpacing.includeSubDomains && !looseSpacing.preload,
    `got: ${JSON.stringify(looseSpacing)}`,
  );

  const noMaxAge = parseHstsHeader("includeSubDomains");
  check(
    "hsts: a header with no max-age at all parses to null rather than a wrong number",
    noMaxAge.maxAgeSeconds === null,
    `got: ${JSON.stringify(noMaxAge)}`,
  );

  const missing = evaluateHsts({ httpsValue: null, httpValue: null, httpRedirectsToHttps: null });
  check(
    "hsts: a missing header reports as absent with every preload requirement unmet",
    missing.present === false && missing.preloadEligible === false && missing.preloadRequirements.every((r) => !r.met),
    `got: ${JSON.stringify(missing)}`,
  );

  const disabled = evaluateHsts({ httpsValue: "max-age=0", httpValue: null, httpRedirectsToHttps: null });
  check(
    "hsts: max-age=0 is told apart from a missing header — both are unprotected but the summary differs",
    disabled.present === true && disabled.maxAgeStrength === "yoxdur" && disabled.summary.includes("max-age=0"),
    `got: ${JSON.stringify(disabled)}`,
  );

  const weak = evaluateHsts({ httpsValue: "max-age=3600", httpValue: null, httpRedirectsToHttps: null });
  check(
    "hsts: a one-hour max-age is weak, not preload-eligible, and names the exact requirement it fails",
    weak.maxAgeStrength === "zeif" &&
      !weak.preloadEligible &&
      weak.preloadRequirements[0].met === false,
    `got: ${JSON.stringify(weak)}`,
  );

  const almostPreload = evaluateHsts({
    httpsValue: `max-age=${PRELOAD_MIN_MAX_AGE}; preload`,
    httpValue: null,
    httpRedirectsToHttps: null,
  });
  check(
    "hsts: a strong max-age and preload without includeSubDomains is one requirement short of eligible",
    almostPreload.preloadEligible === false &&
      almostPreload.preloadRequirements.filter((r) => !r.met).length === 1 &&
      almostPreload.preloadRequirements.find((r) => r.label.includes("includeSubDomains"))?.met === false,
    `got: ${JSON.stringify(almostPreload)}`,
  );

  const eligible = evaluateHsts({
    httpsValue: `max-age=${PRELOAD_MIN_MAX_AGE}; includeSubDomains; preload`,
    httpValue: null,
    httpRedirectsToHttps: true,
  });
  check(
    "hsts: all three preload requirements met makes the site preload-eligible",
    eligible.preloadEligible === true && eligible.preloadRequirements.every((r) => r.met),
    `got: ${JSON.stringify(eligible)}`,
  );

  const leaking = evaluateHsts({ httpsValue: "max-age=100", httpValue: "max-age=100", httpRedirectsToHttps: false });
  check(
    "hsts: a header repeated on the plain-http response is flagged as leaking, not credited",
    leaking.httpLeaksHeader === true,
    `got: ${JSON.stringify(leaking)}`,
  );

  check(
    "hsts: formatMaxAge never rounds a real five-minute value down to zero days",
    formatMaxAge(300) === "5 dəqiqə",
    `got: ${formatMaxAge(300)}`,
  );

  check(
    "hsts: formatMaxAge shows the year approximation only once a full year is reached",
    formatMaxAge(31_536_000).includes("il") && !formatMaxAge(86_400 * 200).includes("il"),
    `got 1y: ${formatMaxAge(31_536_000)}, got 200d: ${formatMaxAge(86_400 * 200)}`,
  );

  const malformed = parseHstsHeader("max-age=not-a-number");
  check(
    "hsts: a malformed max-age value does not throw and parses to null",
    malformed.maxAgeSeconds === null,
    `got: ${JSON.stringify(malformed)}`,
  );
};
