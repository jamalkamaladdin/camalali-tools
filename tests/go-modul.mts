/*
 * What is worth checking here: the case-escaping trap this tool exists for,
 * both directions and round-tripped; a traversal attempt in the module path
 * refused; the major-version suffix read correctly (present and absent); a
 * sample proxy JSON shape parsed into the expected fields, and a malformed
 * one rejected; the version list sorted by real semver rather than string
 * order, including a release outranking its own prerelease; and the
 * `go get` command built with an `@version` pin.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildGoGetCommand,
  escapeModulePath,
  extractMajorSuffix,
  parseGoModulePath,
  parseSemver,
  parseVersionInfoJson,
  parseVersionList,
  sortVersionsDescending,
  unescapeModulePath,
} from "../lib/go-modul";

export const checks: CheckSuite = (check) => {
  const escaped = escapeModulePath("github.com/BurntSushi/toml");
  check(
    "go-modul: uppercase letters in a module path are escaped to !lowercase, which is the whole trap this tool exists for",
    escaped === "github.com/!burnt!sushi/toml",
    `got: ${escaped}`,
  );

  const unescaped = unescapeModulePath("github.com/!burnt!sushi/toml");
  check(
    "go-modul: the escaping round-trips back to the original mixed-case path",
    unescaped === "github.com/BurntSushi/toml",
    `got: ${unescaped}`,
  );

  const traversal = parseGoModulePath("github.com/../../etc/passwd");
  check(
    "go-modul: a module path containing a \"..\" segment is refused, not sent upstream",
    !traversal.ok,
    `got: ${JSON.stringify(traversal)}`,
  );

  const noDomain = parseGoModulePath("foo/bar");
  check(
    "go-modul: a path whose first segment has no dot (not a domain) is refused",
    !noDomain.ok,
    `got: ${JSON.stringify(noDomain)}`,
  );

  const valid = parseGoModulePath("github.com/pkg/errors");
  check(
    "go-modul: an ordinary module path is accepted unchanged",
    valid.ok && valid.path === "github.com/pkg/errors",
    `got: ${JSON.stringify(valid)}`,
  );

  check(
    "go-modul: a /v2+ suffix is read from the end of the path, and a path with none reports null",
    extractMajorSuffix("github.com/foo/bar/v2") === "/v2" &&
      extractMajorSuffix("github.com/foo/bar") === null,
    `with: ${extractMajorSuffix("github.com/foo/bar/v2")}, without: ${extractMajorSuffix("github.com/foo/bar")}`,
  );

  check(
    "go-modul: a bare semver without the required v-prefix does not parse",
    parseSemver("1.2.3") === null && parseSemver("v1.2.3")?.raw === "v1.2.3",
    `bare: ${JSON.stringify(parseSemver("1.2.3"))}, prefixed: ${JSON.stringify(parseSemver("v1.2.3"))}`,
  );

  const sorted = sortVersionsDescending(["v1.0.0", "v1.2.3", "v1.2.3-rc.1", "v0.9.0", "not-a-version"]);
  check(
    "go-modul: versions sort by real semver (not string order), a release outranks its own prerelease, and an unparsable entry is dropped",
    JSON.stringify(sorted) === JSON.stringify(["v1.2.3", "v1.2.3-rc.1", "v1.0.0", "v0.9.0"]),
    `got: ${JSON.stringify(sorted)}`,
  );

  check(
    "go-modul: the version list is split on newlines and blank lines are dropped",
    JSON.stringify(parseVersionList("v1.0.0\n\nv1.1.0\n")) === JSON.stringify(["v1.0.0", "v1.1.0"]),
    `got: ${JSON.stringify(parseVersionList("v1.0.0\n\nv1.1.0\n"))}`,
  );

  const sampleInfo = parseVersionInfoJson({ Version: "v1.2.3", Time: "2020-01-01T00:00:00Z" });
  const badInfo = parseVersionInfoJson({ Version: "v1.2.3" });
  check(
    "go-modul: a sample @latest/@v/<version>.info JSON body parses into {version, time}, and a body missing Time is rejected",
    sampleInfo?.version === "v1.2.3" && sampleInfo?.time === "2020-01-01T00:00:00Z" && badInfo === null,
    `sample: ${JSON.stringify(sampleInfo)}, bad: ${JSON.stringify(badInfo)}`,
  );

  const command = buildGoGetCommand("github.com/pkg/errors", "v0.9.1");
  check(
    "go-modul: the go get command pins the exact version with @",
    command === "go get github.com/pkg/errors@v0.9.1",
    `got: ${command}`,
  );
};
