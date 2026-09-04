/*
 * Cases for the Docker Hub tool. Fixture shapes mirror what
 * `hub.docker.com/v2/repositories/<owner>/<name>` and its `/tags` endpoint
 * actually return, including the "unknown" architecture entries real
 * multi-arch images now carry for attestation layers.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildDockerHubImageInfo,
  buildDockerHubTag,
  buildDockerHubTags,
  parseDockerHubName,
} from "../lib/docker-hub";

export const checks: CheckSuite = (check) => {
  check(
    "docker-hub: parseDockerHubName completes a bare name to the official namespace",
    (() => {
      const result = parseDockerHubName("nginx");
      return result.ok && result.owner === "library" && result.fullName === "library/nginx";
    })(),
    `got ${JSON.stringify(parseDockerHubName("nginx"))}`,
  );

  check(
    "docker-hub: parseDockerHubName splits an owner/name pair",
    (() => {
      const result = parseDockerHubName("grafana/grafana");
      return result.ok && result.owner === "grafana" && result.name === "grafana";
    })(),
    `got ${JSON.stringify(parseDockerHubName("grafana/grafana"))}`,
  );

  check("docker-hub: parseDockerHubName rejects an empty string", parseDockerHubName("").ok === false, "an empty name was accepted");

  check(
    "docker-hub: parseDockerHubName rejects a path traversal attempt",
    parseDockerHubName("../../etc/passwd").ok === false,
    "more than one '/' should not pass",
  );

  check(
    "docker-hub: parseDockerHubName rejects invalid characters",
    parseDockerHubName("ng$inx").ok === false,
    "a '$' is not a legal Docker Hub name character",
  );

  check(
    "docker-hub: parseDockerHubName rejects embedded whitespace",
    parseDockerHubName("nginx latest").ok === false,
    "a name with a space should not pass",
  );

  {
    const tag = buildDockerHubTag({
      name: "1.27",
      tag_last_pushed: "2026-01-01T00:00:00Z",
      full_size: 54_000_000,
      images: [
        { architecture: "amd64", size: 27_000_000 },
        { architecture: "arm64", size: 27_000_000 },
        { architecture: "unknown", size: 1_000 },
      ],
    });
    check(
      "docker-hub: buildDockerHubTag drops the 'unknown' attestation architecture",
      tag?.architectures.join(",") === "amd64,arm64",
      `got ${JSON.stringify(tag)}`,
    );
  }

  check("docker-hub: buildDockerHubTag returns null when the name is missing", buildDockerHubTag({ images: [] }) === null, "a tag with no name is not renderable");

  {
    const tag = buildDockerHubTag({ name: "slim", images: [{ architecture: "amd64", size: 1000 }, { architecture: "amd64", size: 500 }] });
    check(
      "docker-hub: buildDockerHubTag sums image sizes when full_size is absent",
      tag?.fullSizeBytes === 1500,
      `got ${JSON.stringify(tag)}`,
    );
  }

  {
    const tags = buildDockerHubTags({
      results: [
        { name: "old", tag_last_pushed: "2025-01-01T00:00:00Z", images: [] },
        { name: "new", tag_last_pushed: "2026-01-01T00:00:00Z", images: [] },
      ],
    });
    check(
      "docker-hub: buildDockerHubTags sorts newest push first",
      tags.map((t) => t.name).join(",") === "new,old",
      `got ${JSON.stringify(tags.map((t) => t.name))}`,
    );
  }

  {
    const results = Array.from({ length: 15 }, (_, i) => ({ name: `v${i}`, tag_last_pushed: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, images: [] }));
    const tags = buildDockerHubTags({ results });
    check("docker-hub: buildDockerHubTags caps at ten entries", tags.length === 10, `got ${tags.length}`);
  }

  check(
    "docker-hub: buildDockerHubImageInfo returns null when the repository body has no name",
    buildDockerHubImageInfo({ description: "no name here" }, null, "library", "nginx") === null,
    "a repository body missing 'name' is not one this tool can render",
  );

  {
    const info = buildDockerHubImageInfo(
      { name: "nginx", description: "Official build of Nginx.", star_count: 20000, pull_count: 5_000_000_000, last_updated: "2026-01-01T00:00:00Z" },
      { results: [{ name: "latest", tag_last_pushed: "2026-01-01T00:00:00Z", images: [] }] },
      "library",
      "nginx",
    );
    check(
      "docker-hub: buildDockerHubImageInfo marks the library namespace as official",
      info?.isOfficial === true && info?.tags.length === 1,
      `got ${JSON.stringify(info)}`,
    );
  }
};
