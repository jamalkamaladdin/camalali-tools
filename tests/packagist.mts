/*
 * Cases for the Packagist tool. Fixture shapes mirror the Composer v2 metadata
 * format (`repo.packagist.org/p2/<vendor>/<pkg>.json`) and the older stats
 * body (`packagist.org/packages/<vendor>/<pkg>.json`), including a `dev-`
 * version that must lose to a stable one and an `abandoned` field carrying a
 * replacement package's name.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildPackagistPackageInfo,
  extractPackagistAbandoned,
  extractPackagistDependencies,
  extractRequiresPhp,
  isStableComposerVersion,
  parsePackagistName,
  selectLatestPackagistVersion,
} from "../lib/packagist";

export const checks: CheckSuite = (check) => {
  check(
    "packagist: parsePackagistName splits a vendor/package pair",
    (() => {
      const result = parsePackagistName("guzzlehttp/guzzle");
      return result.ok && result.vendor === "guzzlehttp" && result.name === "guzzle";
    })(),
    `got ${JSON.stringify(parsePackagistName("guzzlehttp/guzzle"))}`,
  );

  check("packagist: parsePackagistName rejects a bare name with no vendor", parsePackagistName("guzzle").ok === false, "a name with no '/' should not pass");

  check(
    "packagist: parsePackagistName rejects a path traversal attempt",
    parsePackagistName("../../etc/passwd").ok === false,
    "more than one '/' should not pass",
  );

  check("packagist: parsePackagistName rejects an empty string", parsePackagistName("").ok === false, "an empty name was accepted");

  check("packagist: isStableComposerVersion rejects a dev- prefixed version", isStableComposerVersion("dev-master") === false, "dev-master is not stable");

  check("packagist: isStableComposerVersion rejects a beta suffix", isStableComposerVersion("2.0.0-beta1") === false, "a beta suffix is not stable");

  check("packagist: isStableComposerVersion accepts a plain version", isStableComposerVersion("7.8.1") === true, "7.8.1 has no instability marker");

  {
    const latest = selectLatestPackagistVersion([
      { version: "dev-master", time: "2026-02-01T00:00:00Z" },
      { version: "7.8.1", time: "2026-01-01T00:00:00Z" },
      { version: "7.7.0", time: "2025-01-01T00:00:00Z" },
    ]);
    check(
      "packagist: selectLatestPackagistVersion prefers a stable release over a newer dev one",
      latest?.version === "7.8.1",
      `got ${JSON.stringify(latest)}`,
    );
  }

  {
    const latest = selectLatestPackagistVersion([{ version: "dev-master", time: "2026-01-01T00:00:00Z" }]);
    check(
      "packagist: selectLatestPackagistVersion falls back to the only release when nothing is stable",
      latest?.version === "dev-master",
      `got ${JSON.stringify(latest)}`,
    );
  }

  check(
    "packagist: extractPackagistDependencies excludes php and ext-* entries",
    JSON.stringify(extractPackagistDependencies({ php: ">=8.1", "ext-json": "*", "psr/log": "^3.0" })) ===
      JSON.stringify(["psr/log ^3.0"]),
    `got ${JSON.stringify(extractPackagistDependencies({ php: ">=8.1", "ext-json": "*", "psr/log": "^3.0" }))}`,
  );

  check(
    "packagist: extractRequiresPhp reads the php constraint",
    extractRequiresPhp({ php: ">=8.1", "psr/log": "^3.0" }) === ">=8.1",
    `got "${extractRequiresPhp({ php: ">=8.1" })}"`,
  );

  check(
    "packagist: extractPackagistAbandoned reads a string replacement as abandoned",
    (() => {
      const result = extractPackagistAbandoned({ package: { abandoned: "new/package" } });
      return result.abandoned === true && result.replacement === "new/package";
    })(),
    `got ${JSON.stringify(extractPackagistAbandoned({ package: { abandoned: "new/package" } }))}`,
  );

  check(
    "packagist: extractPackagistAbandoned reads false as not abandoned",
    extractPackagistAbandoned({ package: { abandoned: false } }).abandoned === false,
    "abandoned: false should not be reported as abandoned",
  );

  check(
    "packagist: buildPackagistPackageInfo returns null when the vendor/package is absent from the p2 body",
    buildPackagistPackageInfo({ packages: {} }, null, "vendor/missing") === null,
    "an empty packages map has no version to report",
  );

  {
    const info = buildPackagistPackageInfo(
      { packages: { "guzzlehttp/guzzle": [{ version: "7.8.1", time: "2026-01-01T00:00:00Z", require: { php: ">=7.2.5" }, license: ["MIT"] }] } },
      { package: { downloads: { total: 500_000_000 }, abandoned: false } },
      "guzzlehttp/guzzle",
    );
    check(
      "packagist: buildPackagistPackageInfo assembles a full card from well-formed bodies",
      info?.latestVersion === "7.8.1" && info?.license.join(",") === "MIT" && info?.downloadsTotal === 500_000_000,
      `got ${JSON.stringify(info)}`,
    );
  }
};
