/*
 * Cases for the npm tool. The fixture objects below mirror real shapes seen
 * on `registry.npmjs.org` (checked by hand with curl on 2026-09-02) rather
 * than an invented, tidier JSON: `request`'s deprecation notice, a legacy
 * `{type: "MIT"}` license object, and a scp-style git remote are all things
 * the live registry actually returns for one package or another.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildNpmPackageInfo,
  extractDependencyNames,
  extractReleasedAt,
  normalizeLicense,
  normalizeRepositoryUrl,
  npmRegistrySegment,
  parseNpmName,
} from "../lib/npm";

export const checks: CheckSuite = (check) => {
  check(
    "npm: parseNpmName accepts a plain lowercase name",
    parseNpmName("react").ok === true,
    "a well-formed unscoped name was rejected",
  );

  {
    const result = parseNpmName("@types/node");
    check(
      "npm: parseNpmName splits a scoped name into scope and name",
      result.ok && result.parsed.scope === "types" && result.parsed.name === "node",
      `got ${JSON.stringify(result)}`,
    );
  }

  check(
    "npm: parseNpmName rejects an empty string",
    parseNpmName("").ok === false,
    "an empty package name was accepted",
  );

  check(
    "npm: parseNpmName rejects uppercase letters",
    parseNpmName("React").ok === false,
    "npm names are lowercase-only; 'React' should not pass",
  );

  check(
    "npm: parseNpmName rejects a leading dot",
    parseNpmName(".hidden").ok === false,
    "a name starting with '.' should not pass",
  );

  check(
    "npm: parseNpmName rejects a leading underscore",
    parseNpmName("_private").ok === false,
    "a name starting with '_' should not pass",
  );

  check(
    "npm: parseNpmName rejects a scope with no slash",
    parseNpmName("@types").ok === false,
    "'@types' with no '/name' part should not pass",
  );

  check(
    "npm: parseNpmName rejects more than one slash",
    parseNpmName("a/b/c").ok === false,
    "a name with two slashes should not pass",
  );

  check(
    "npm: parseNpmName rejects a name over the 214-character limit",
    parseNpmName("a".repeat(215)).ok === false,
    "a 215-character name should not pass",
  );

  check(
    "npm: parseNpmName rejects embedded whitespace",
    parseNpmName("left pad").ok === false,
    "a name containing a space should not pass",
  );

  check(
    "npm: parseNpmName accepts dots and hyphens inside a name",
    parseNpmName("lodash.debounce").ok === true && parseNpmName("left-pad").ok === true,
    "dotted and hyphenated names are legal npm names",
  );

  {
    const result = parseNpmName("@types/node");
    const segment = result.ok ? npmRegistrySegment(result.parsed) : "";
    check(
      "npm: npmRegistrySegment percent-encodes the '@' and the '/' of a scoped name",
      segment === "%40types%2Fnode",
      `got "${segment}"`,
    );
  }

  check(
    "npm: normalizeRepositoryUrl strips the 'git+' prefix and the '.git' suffix",
    normalizeRepositoryUrl("git+https://github.com/react/react.git") === "https://github.com/react/react",
    `got "${normalizeRepositoryUrl("git+https://github.com/react/react.git")}"`,
  );

  check(
    "npm: normalizeRepositoryUrl rewrites an scp-style git remote to https",
    normalizeRepositoryUrl("git@github.com:owner/repo.git") === "https://github.com/owner/repo",
    `got "${normalizeRepositoryUrl("git@github.com:owner/repo.git")}"`,
  );

  check(
    "npm: normalizeRepositoryUrl expands the 'github:owner/repo' shorthand",
    normalizeRepositoryUrl("github:owner/repo") === "https://github.com/owner/repo",
    `got "${normalizeRepositoryUrl("github:owner/repo")}"`,
  );

  check(
    "npm: normalizeRepositoryUrl expands the bare 'owner/repo' shorthand",
    normalizeRepositoryUrl("owner/repo") === "https://github.com/owner/repo",
    `got "${normalizeRepositoryUrl("owner/repo")}"`,
  );

  check(
    "npm: normalizeRepositoryUrl reads the url out of an {url} object",
    normalizeRepositoryUrl({ url: "git://github.com/owner/repo.git", type: "git" }) ===
      "https://github.com/owner/repo",
    `got "${normalizeRepositoryUrl({ url: "git://github.com/owner/repo.git", type: "git" })}"`,
  );

  check(
    "npm: normalizeRepositoryUrl returns null when there is nothing to read",
    normalizeRepositoryUrl(undefined) === null && normalizeRepositoryUrl("") === null,
    "a missing repository field should not produce a URL",
  );

  check(
    "npm: normalizeLicense reads the modern string shape",
    normalizeLicense("MIT") === "MIT",
    `got "${normalizeLicense("MIT")}"`,
  );

  check(
    "npm: normalizeLicense reads the legacy {type} object shape",
    normalizeLicense({ type: "MIT", url: "https://example.com" }) === "MIT",
    `got "${normalizeLicense({ type: "MIT", url: "https://example.com" })}"`,
  );

  check(
    "npm: normalizeLicense joins a legacy licenses array",
    normalizeLicense([{ type: "MIT" }, { type: "Apache-2.0" }]) === "MIT / Apache-2.0",
    `got "${normalizeLicense([{ type: "MIT" }, { type: "Apache-2.0" }])}"`,
  );

  check(
    "npm: normalizeLicense returns null for an absent field",
    normalizeLicense(undefined) === null,
    "a missing license should not produce a string",
  );

  {
    const names = extractDependencyNames({ dependencies: { zod: "^3.0.0", react: "^19.0.0" } });
    check(
      "npm: extractDependencyNames sorts the dependency names",
      names.length === 2 && names[0] === "react" && names[1] === "zod",
      `got ${JSON.stringify(names)}`,
    );
  }

  check(
    "npm: extractDependencyNames returns an empty list when there are none",
    extractDependencyNames({ name: "left-pad" }).length === 0,
    "a package with no dependencies field should report zero dependencies",
  );

  check(
    "npm: extractReleasedAt trusts only an exact name match from search",
    extractReleasedAt(
      { objects: [{ package: { name: "react", date: "2026-07-21T15:41:28.716Z" } }] },
      "react",
    ) === "2026-07-21T15:41:28.716Z",
    "an exact top-hit match should return its date",
  );

  check(
    "npm: extractReleasedAt refuses a near-miss top hit",
    extractReleasedAt(
      { objects: [{ package: { name: "react-native", date: "2026-01-01T00:00:00.000Z" } }] },
      "react",
    ) === null,
    "a search top hit for a different package must not be reported as this one's release date",
  );

  {
    const info = buildNpmPackageInfo(
      {
        name: "request",
        version: "2.88.2",
        license: "Apache-2.0",
        deprecated: "request has been deprecated, see https://github.com/request/request/issues/3142",
        dependencies: { qs: "~6.5.2" },
      },
      null,
    );
    check(
      "npm: buildNpmPackageInfo carries the deprecation notice through unchanged",
      info?.deprecated === "request has been deprecated, see https://github.com/request/request/issues/3142",
      `got ${JSON.stringify(info)}`,
    );
  }

  check(
    "npm: buildNpmPackageInfo returns null when name or version is missing",
    buildNpmPackageInfo({ description: "no name or version here" }, null) === null,
    "a body missing name/version is not a package this tool can render",
  );
};
