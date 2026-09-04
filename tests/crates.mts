/*
 * Cases for the crates tool. Fixture shapes mirror `crates.io/api/v1/crates/<name>`,
 * including a `yanked` version and a crate whose license changed between
 * releases — the license shown must come from the matched "latest" version,
 * not an arbitrary one.
 */
import type { CheckSuite } from "./harness.mts";
import { buildCratesPackageInfo, extractCratesVersions, parseCratesName } from "../lib/crates";

export const checks: CheckSuite = (check) => {
  check("crates: parseCratesName accepts a plain name", parseCratesName("serde").ok === true, "a well-formed crate name was rejected");

  check("crates: parseCratesName accepts hyphens and underscores", parseCratesName("tokio-util").ok === true && parseCratesName("serde_json").ok === true, "hyphenated and underscored names are legal crate names");

  check("crates: parseCratesName rejects an empty string", parseCratesName("").ok === false, "an empty name was accepted");

  check(
    "crates: parseCratesName rejects a path traversal attempt",
    parseCratesName("../etc/passwd").ok === false,
    "a slash is not a legal crate name character",
  );

  check("crates: parseCratesName rejects embedded whitespace", parseCratesName("serde json").ok === false, "a name with a space should not pass");

  check(
    "crates: parseCratesName rejects a name over the length limit",
    parseCratesName("a".repeat(65)).ok === false,
    "a 65-character name should not pass",
  );

  {
    const versions = extractCratesVersions([
      { num: "1.0.0", created_at: "2025-01-01T00:00:00Z", yanked: false, license: "MIT" },
      { num: "1.2.0", created_at: "2026-01-01T00:00:00Z", yanked: false, license: "MIT OR Apache-2.0" },
      { num: "1.1.0", created_at: "2025-06-01T00:00:00Z", yanked: true, license: "MIT" },
    ]);
    check(
      "crates: extractCratesVersions sorts newest publish first",
      versions.map((v) => v.version).join(",") === "1.2.0,1.1.0,1.0.0",
      `got ${JSON.stringify(versions.map((v) => v.version))}`,
    );
  }

  {
    const versions = extractCratesVersions([{ num: "1.1.0", created_at: "2025-06-01T00:00:00Z", yanked: true, license: "MIT" }]);
    check("crates: extractCratesVersions carries the yanked flag through", versions[0]?.yanked === true, `got ${JSON.stringify(versions[0])}`);
  }

  check(
    "crates: extractCratesVersions drops an entry missing its version number",
    extractCratesVersions([{ created_at: "2025-01-01T00:00:00Z" }]).length === 0,
    "a version entry with no 'num' is not renderable",
  );

  check(
    "crates: buildCratesPackageInfo returns null when the crate object has no name",
    buildCratesPackageInfo({ crate: { newest_version: "1.0.0" }, versions: [] }) === null,
    "a crate body missing 'name' is not one this tool can render",
  );

  {
    const info = buildCratesPackageInfo({
      crate: { name: "serde", newest_version: "1.2.0", downloads: 900_000_000, recent_downloads: 12_000_000 },
      versions: [
        { num: "1.0.0", created_at: "2025-01-01T00:00:00Z", yanked: false, license: "MIT" },
        { num: "1.2.0", created_at: "2026-01-01T00:00:00Z", yanked: false, license: "MIT OR Apache-2.0" },
      ],
    });
    check(
      "crates: buildCratesPackageInfo reads the license off the matched newest_version, not an arbitrary one",
      info?.license === "MIT OR Apache-2.0",
      `got ${JSON.stringify(info)}`,
    );
  }

  {
    const info = buildCratesPackageInfo({
      crate: { name: "leftpad", max_version: "0.1.0", downloads: 10 },
      versions: [{ num: "0.1.0", created_at: "2020-01-01T00:00:00Z", yanked: false, license: null }],
    });
    check(
      "crates: buildCratesPackageInfo falls back to max_version when newest_version is absent",
      info?.version === "0.1.0" && info?.license === null,
      `got ${JSON.stringify(info)}`,
    );
  }

  {
    const info = buildCratesPackageInfo({
      crate: { name: "big", newest_version: "1.0.0", downloads: 1 },
      versions: Array.from({ length: 8 }, (_, i) => ({ num: `1.${i}.0`, created_at: `2026-01-0${i + 1}T00:00:00Z`, yanked: false, license: "MIT" })),
    });
    check("crates: buildCratesPackageInfo caps recentVersions at five", info?.recentVersions.length === 5, `got ${info?.recentVersions.length}`);
  }
};
