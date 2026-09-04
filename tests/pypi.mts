/*
 * Cases for the PyPI tool. Fixture shapes mirror what `pypi.org/pypi/<name>/json`
 * actually returns: a classifier-based license, a `requires_dist` entry with a
 * PEP 508 marker, and multiple files per release (wheel + sdist).
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildPypiPackageInfo,
  extractPypiDependencies,
  extractPypiPackageFormats,
  extractPypiProjectUrls,
  extractPypiRecentReleases,
  extractPypiReleasedAt,
  normalizePypiLicense,
  parsePypiName,
} from "../lib/pypi";

export const checks: CheckSuite = (check) => {
  check("pypi: parsePypiName accepts a plain lowercase name", parsePypiName("requests").ok === true, "a well-formed name was rejected");

  check("pypi: parsePypiName accepts dots and hyphens", parsePypiName("zope.interface").ok === true, "dotted names are legal on PyPI");

  check("pypi: parsePypiName rejects an empty string", parsePypiName("").ok === false, "an empty name was accepted");

  check("pypi: parsePypiName rejects embedded whitespace", parsePypiName("left pad").ok === false, "a name with a space should not pass");

  check(
    "pypi: parsePypiName rejects a path traversal attempt",
    parsePypiName("../etc/passwd").ok === false,
    "a slash is not a legal PyPI name character",
  );

  check(
    "pypi: parsePypiName rejects a name over the length limit",
    parsePypiName("a".repeat(215)).ok === false,
    "a 215-character name should not pass",
  );

  check(
    "pypi: normalizePypiLicense prefers a matching classifier",
    normalizePypiLicense({
      license: "a long free-text blob that is not a name at all and goes on and on past eighty characters",
      classifiers: ["License :: OSI Approved :: MIT License"],
    }) === "MIT License",
    `got "${normalizePypiLicense({ classifiers: ["License :: OSI Approved :: MIT License"] })}"`,
  );

  check(
    "pypi: normalizePypiLicense accepts a short free-text license with no classifier",
    normalizePypiLicense({ license: "MIT", classifiers: [] }) === "MIT",
    `got "${normalizePypiLicense({ license: "MIT", classifiers: [] })}"`,
  );

  check(
    "pypi: normalizePypiLicense drops an overlong free-text license",
    normalizePypiLicense({
      license: "x".repeat(200),
      classifiers: [],
    }) === null,
    "an 200-character license blob should not be shown as a name",
  );

  {
    const deps = extractPypiDependencies(['requests (>=2.0)', 'typing-extensions; python_version < "3.8"', "requests (>=2.0)"]);
    check(
      "pypi: extractPypiDependencies de-duplicates and sorts",
      deps.length === 2 && deps[0].startsWith("requests"),
      `got ${JSON.stringify(deps)}`,
    );
  }

  {
    const urls = extractPypiProjectUrls({
      project_urls: { Homepage: "https://example.com", Source: "https://github.com/x/y" },
      home_page: "https://example.com",
    });
    check(
      "pypi: extractPypiProjectUrls folds project_urls and de-duplicates against home_page",
      urls.length === 2,
      `got ${JSON.stringify(urls)}`,
    );
  }

  check(
    "pypi: extractPypiPackageFormats maps bdist_wheel to 'wheel' and de-duplicates",
    JSON.stringify(extractPypiPackageFormats([{ packagetype: "bdist_wheel" }, { packagetype: "sdist" }, { packagetype: "bdist_wheel" }])) ===
      JSON.stringify(["sdist", "wheel"]),
    `got ${JSON.stringify(extractPypiPackageFormats([{ packagetype: "bdist_wheel" }, { packagetype: "sdist" }]))}`,
  );

  check(
    "pypi: extractPypiReleasedAt picks the earliest of several files",
    extractPypiReleasedAt([
      { upload_time_iso_8601: "2026-01-02T00:00:00.000000Z" },
      { upload_time_iso_8601: "2026-01-01T00:00:00.000000Z" },
    ]) === "2026-01-01T00:00:00.000000Z",
    "the earliest upload among the latest release's files should win",
  );

  {
    const releases = extractPypiRecentReleases({
      "1.0.0": [{ upload_time_iso_8601: "2025-01-01T00:00:00Z" }],
      "2.0.0": [{ upload_time_iso_8601: "2026-01-01T00:00:00Z" }],
      "1.5.0": [{ upload_time_iso_8601: "2025-06-01T00:00:00Z" }],
    });
    check(
      "pypi: extractPypiRecentReleases sorts newest first",
      releases.map((r) => r.version).join(",") === "2.0.0,1.5.0,1.0.0",
      `got ${JSON.stringify(releases)}`,
    );
  }

  check(
    "pypi: buildPypiPackageInfo returns null when name or version is missing",
    buildPypiPackageInfo({ info: { summary: "no name or version here" } }) === null,
    "a body missing name/version is not a package this tool can render",
  );

  {
    const info = buildPypiPackageInfo({
      info: { name: "requests", version: "2.31.0", requires_python: ">=3.7", requires_dist: ["idna (>=2.5)"] },
      releases: { "2.31.0": [{ upload_time_iso_8601: "2026-01-01T00:00:00Z" }] },
      urls: [{ upload_time_iso_8601: "2026-01-01T00:00:00Z", packagetype: "sdist" }],
    });
    check(
      "pypi: buildPypiPackageInfo assembles a full card from a well-formed body",
      info?.name === "requests" && info?.requiresPython === ">=3.7" && info?.packageFormats.join(",") === "sdist",
      `got ${JSON.stringify(info)}`,
    );
  }
};
