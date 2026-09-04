/*
 * Docker Hub repository lookups, kept apart from the fetching that happens in
 * the API route: this file only turns the JSON Docker Hub already sent back
 * into shapes the widget can render, plus the one thing that has to happen
 * before any request leaves this server — deciding whether a typed string is
 * even a legal image name.
 *
 * Two calls answer this tool: the repository object (description, star
 * count, pull count, last update) and its tag list (up to ten, each with its
 * own architectures and compressed size). A bare name with no owner — the way
 * almost every visitor will type "nginx" — is completed to "library/nginx"
 * here, the same way `docker pull nginx` completes it: `library` is where
 * Docker Hub keeps every image it verifies itself.
 */

const OFFICIAL_NAMESPACE = "library";
const PART_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MAX_PART_LENGTH = 255;

export type DockerHubNameResult =
  | { ok: true; owner: string; name: string; fullName: string }
  | { ok: false; error: string };

function checkPart(part: string, label: string): string | null {
  if (part === "") return `${label} boşdur.`;
  if (part.length > MAX_PART_LENGTH) return `${label} çox uzundur.`;
  if (!PART_PATTERN.test(part)) {
    return `${label} yalnız kiçik hərf, rəqəm, nöqtə, tire və alt xətdən ibarət ola bilər: "${part}".`;
  }
  return null;
}

/**
 * Validates a name and completes a bare one to the official namespace —
 * "nginx" becomes "library/nginx", exactly what `docker pull nginx` does.
 */
export function parseDockerHubName(raw: string): DockerHubNameResult {
  const value = raw.trim().toLowerCase();
  if (value === "") return { ok: false, error: "Image adı boşdur." };
  if (/\s/.test(value)) return { ok: false, error: "Ad boşluq saxlaya bilməz." };

  const parts = value.split("/");
  if (parts.length > 2) return { ok: false, error: "Ad birdən çox '/' saxlaya bilməz." };

  const [owner, name] = parts.length === 2 ? parts : [OFFICIAL_NAMESPACE, parts[0]];

  const ownerError = checkPart(owner, "Sahib adı");
  if (ownerError) return { ok: false, error: ownerError };
  const nameError = checkPart(name, "Image adı");
  if (nameError) return { ok: false, error: nameError };

  return { ok: true, owner, name, fullName: `${owner}/${name}` };
}

export type DockerHubTag = {
  name: string;
  lastPushed: string | null;
  /** Sum of the compressed layer sizes, in bytes. */
  fullSizeBytes: number | null;
  architectures: string[];
};

export type DockerHubImageInfo = {
  namespace: string;
  name: string;
  fullName: string;
  isOfficial: boolean;
  description: string | null;
  starCount: number;
  pullCount: number;
  lastUpdated: string | null;
  tags: DockerHubTag[];
};

/** One tag entry from the `/tags` list. Returns null for a shape too broken to render. */
export function buildDockerHubTag(raw: unknown): DockerHubTag | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name : null;
  if (!name) return null;

  const images = Array.isArray(obj.images) ? obj.images : [];
  const architectures = new Set<string>();
  let summedSize = 0;
  let hasImageSize = false;
  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const arch = (image as { architecture?: unknown }).architecture;
    // Attestation and SBOM layers report "unknown" instead of a real
    // architecture — they are not a platform the visitor can run.
    if (typeof arch === "string" && arch !== "unknown") architectures.add(arch);
    const size = (image as { size?: unknown }).size;
    if (typeof size === "number") {
      summedSize += size;
      hasImageSize = true;
    }
  }

  const fullSize = typeof obj.full_size === "number" ? obj.full_size : hasImageSize ? summedSize : null;

  return {
    name,
    lastPushed: typeof obj.tag_last_pushed === "string" ? obj.tag_last_pushed : null,
    fullSizeBytes: fullSize,
    architectures: [...architectures].sort(),
  };
}

/** Up to `limit` tags, newest push first — the API's own ordering is not relied on. */
export function buildDockerHubTags(raw: unknown, limit = 10): DockerHubTag[] {
  const resultsField = raw && typeof raw === "object" ? (raw as { results?: unknown }).results : null;
  const results = Array.isArray(resultsField) ? resultsField : [];

  const tags = results.map(buildDockerHubTag).filter((tag): tag is DockerHubTag => tag !== null);

  tags.sort((a, b) => {
    if (a.lastPushed === null) return 1;
    if (b.lastPushed === null) return -1;
    return a.lastPushed < b.lastPushed ? 1 : a.lastPushed > b.lastPushed ? -1 : 0;
  });

  return tags.slice(0, limit);
}

/** Assembles the finished card. Returns null when the repository body has no name. */
export function buildDockerHubImageInfo(
  repoJson: unknown,
  tagsJson: unknown,
  owner: string,
  name: string,
): DockerHubImageInfo | null {
  if (!repoJson || typeof repoJson !== "object") return null;
  const repo = repoJson as Record<string, unknown>;

  const repoName = typeof repo.name === "string" ? repo.name : null;
  if (!repoName) return null;

  const descriptionRaw = typeof repo.description === "string" ? repo.description.trim() : "";

  return {
    namespace: owner,
    name,
    fullName: `${owner}/${name}`,
    isOfficial: owner === OFFICIAL_NAMESPACE,
    description: descriptionRaw === "" ? null : descriptionRaw,
    starCount: typeof repo.star_count === "number" ? repo.star_count : 0,
    pullCount: typeof repo.pull_count === "number" ? repo.pull_count : 0,
    lastUpdated: typeof repo.last_updated === "string" ? repo.last_updated : null,
    tags: buildDockerHubTags(tagsJson),
  };
}
