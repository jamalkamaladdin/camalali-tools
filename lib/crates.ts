/*
 * crates.io lookups, kept apart from the fetching that happens in the API
 * route: this file only turns the JSON crates.io already sent back into
 * shapes the widget can render, plus the one thing that has to happen before
 * any request leaves this server — deciding whether a typed string is even a
 * legal crate name.
 *
 * One call (`GET /api/v1/crates/<name>`) carries the crate's own fields
 * alongside every published version, each with its own license, publish date
 * and `yanked` flag — a crate can relicense between versions, so the license
 * shown here is read off the version this tool calls "latest", not off the
 * crate as a whole, which carries no license field of its own.
 *
 * crates.io's own site labels `recent_downloads` as the count over the last
 * 90 days, not the last week — the field is carried through under that name
 * so the widget cannot show it next to a "last week" label the two would
 * disagree with.
 */

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_NAME_LENGTH = 64;

export type CratesNameResult = { ok: true; name: string } | { ok: false; error: string };

/** Validates a name the way it will be dropped into a registry URL. */
export function parseCratesName(raw: string): CratesNameResult {
  const value = raw.trim();

  if (value === "") return { ok: false, error: "Crate adı boşdur." };
  if (value.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Ad çox uzundur: ${MAX_NAME_LENGTH} simvol həddi var, ${value.length} tapıldı.`,
    };
  }
  if (/\s/.test(value)) return { ok: false, error: "Ad boşluq saxlaya bilməz." };
  if (!NAME_PATTERN.test(value)) {
    return { ok: false, error: "Ad yalnız hərf, rəqəm, tire və alt xətdən ibarət ola bilər." };
  }

  return { ok: true, name: value };
}

/** The registry path segment for a validated name. */
export function cratesRegistrySegment(name: string): string {
  return encodeURIComponent(name);
}

export type CratesVersionInfo = {
  version: string;
  releasedAt: string;
  yanked: boolean;
  license: string | null;
};

export type CratesPackageInfo = {
  name: string;
  version: string;
  license: string | null;
  downloadsTotal: number;
  /** crates.io's own "recent" window — 90 days, not a week. */
  downloadsRecent90d: number | null;
  documentation: string | null;
  repository: string | null;
  homepage: string | null;
  description: string | null;
  /** Up to five, newest publish first. */
  recentVersions: CratesVersionInfo[];
};

function buildVersionInfo(raw: unknown): CratesVersionInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const num = typeof obj.num === "string" ? obj.num : null;
  const createdAt = typeof obj.created_at === "string" ? obj.created_at : null;
  if (!num || !createdAt) return null;

  return {
    version: num,
    releasedAt: createdAt,
    yanked: obj.yanked === true,
    license: typeof obj.license === "string" && obj.license.trim() !== "" ? obj.license.trim() : null,
  };
}

/** Every parseable version, newest publish first. */
export function extractCratesVersions(rawVersions: unknown): CratesVersionInfo[] {
  if (!Array.isArray(rawVersions)) return [];
  const versions = rawVersions.map(buildVersionInfo).filter((entry): entry is CratesVersionInfo => entry !== null);
  versions.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : a.releasedAt > b.releasedAt ? -1 : 0));
  return versions;
}

/**
 * Assembles the finished card. The "latest" version is the crate's own
 * `newest_version` (falling back to `max_stable_version`, then
 * `max_version`), matched against the versions list — that match is where a
 * version's actual license lives.
 */
export function buildCratesPackageInfo(json: unknown): CratesPackageInfo | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const crate = obj.crate;
  if (!crate || typeof crate !== "object") return null;
  const crateObj = crate as Record<string, unknown>;

  const name = typeof crateObj.name === "string" ? crateObj.name : null;
  if (!name) return null;

  const newest =
    (typeof crateObj.newest_version === "string" && crateObj.newest_version) ||
    (typeof crateObj.max_stable_version === "string" && crateObj.max_stable_version) ||
    (typeof crateObj.max_version === "string" && crateObj.max_version) ||
    null;
  if (!newest) return null;

  const allVersions = extractCratesVersions(obj.versions);
  const latestEntry = allVersions.find((entry) => entry.version === newest) ?? allVersions[0] ?? null;

  const descriptionRaw = typeof crateObj.description === "string" ? crateObj.description.trim() : "";

  return {
    name,
    version: newest,
    license: latestEntry?.license ?? null,
    downloadsTotal: typeof crateObj.downloads === "number" ? crateObj.downloads : 0,
    downloadsRecent90d: typeof crateObj.recent_downloads === "number" ? crateObj.recent_downloads : null,
    documentation: typeof crateObj.documentation === "string" ? crateObj.documentation : null,
    repository: typeof crateObj.repository === "string" ? crateObj.repository : null,
    homepage: typeof crateObj.homepage === "string" ? crateObj.homepage : null,
    description: descriptionRaw === "" ? null : descriptionRaw,
    recentVersions: allVersions.slice(0, 5),
  };
}
