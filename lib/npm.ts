/*
 * npm registry lookups, kept apart from the fetching that happens in the API
 * route: this file only turns text the registry already sent back into shapes
 * the widget can render, plus the one thing that has to happen before any
 * request leaves this server — deciding whether a typed string is even a legal
 * package name.
 *
 * Two registry calls feed one result. `GET /<name>/latest` is the small,
 * authoritative one — version, license, dependencies, deprecation notice. It
 * has no publish date, though: that field lives only in the full packument's
 * `time` map, and fetching that map for a package like React means downloading
 * every version it has ever published (6.9 MB, measured) to read one date off
 * the end of it. The npm search endpoint carries that date in its top hit, at
 * search-result size, so it is asked instead — and only trusted when the hit's
 * name matches the request exactly, because a search is relevance-ranked and a
 * near-miss on an obscure name is a real possibility.
 */

const MAX_NAME_LENGTH = 214;

export type NpmParsedName = { scope: string | null; name: string; full: string };
export type NpmNameResult = { ok: true; parsed: NpmParsedName } | { ok: false; error: string };

/*
 * The real rule (`validate-npm-package-name`) also rejects a handful of
 * reserved words and a few legacy punctuation marks kept only for old
 * packages. Neither matters here: this only decides whether a string is safe
 * to drop into a registry URL, not whether npm would accept it as a new
 * publish, so the URL-safety subset is the whole of what this needs to check.
 */
const NAME_PART = /^[a-z0-9][a-z0-9._-]*$/;

function checkNamePart(part: string, label: string): string | null {
  if (part === "") return `${label} boşdur.`;
  if (part.startsWith(".") || part.startsWith("_")) {
    return `${label} nöqtə və ya alt xətlə başlaya bilməz: "${part}".`;
  }
  if (!NAME_PART.test(part)) {
    return `${label} yalnız kiçik hərf, rəqəm, nöqtə, tire və alt xətdən ibarət ola bilər: "${part}".`;
  }
  return null;
}

/** Validates and splits a package name the way it will be sent in a URL. */
export function parseNpmName(raw: string): NpmNameResult {
  const value = raw.trim();

  if (value === "") return { ok: false, error: "Paket adı boşdur." };
  if (value.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Ad çox uzundur: ${MAX_NAME_LENGTH} simvol həddi var, ${value.length} tapıldı.`,
    };
  }
  if (/\s/.test(value)) return { ok: false, error: "Ad boşluq saxlaya bilməz." };
  if (value !== value.toLowerCase()) {
    return { ok: false, error: "npm adı yalnız kiçik hərflərdən ibarətdir." };
  }

  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    if (slash === -1) {
      return { ok: false, error: "Scope-lu ad @scope/ad formatındadır: '/' işarəsi yoxdur." };
    }
    const scope = value.slice(1, slash);
    const name = value.slice(slash + 1);
    if (name.includes("/")) {
      return { ok: false, error: "Ad birdən çox '/' saxlaya bilməz." };
    }
    const scopeError = checkNamePart(scope, "Scope adı");
    if (scopeError) return { ok: false, error: scopeError };
    const nameError = checkNamePart(name, "Paket adı");
    if (nameError) return { ok: false, error: nameError };
    return { ok: true, parsed: { scope, name, full: value } };
  }

  const nameError = checkNamePart(value, "Paket adı");
  if (nameError) return { ok: false, error: nameError };
  return { ok: true, parsed: { scope: null, name: value, full: value } };
}

/**
 * The registry path segment for a parsed name. `encodeURIComponent` turns the
 * scope's leading "@" into "%40" and the separating "/" into "%2F" on its
 * own — a scoped name is one path segment to the registry, not two, and an
 * unencoded slash would ask for the wrong route entirely.
 */
export function npmRegistrySegment(parsed: NpmParsedName): string {
  return encodeURIComponent(parsed.full);
}

export type NpmPackageInfo = {
  name: string;
  version: string;
  description: string | null;
  license: string | null;
  deprecated: string | null;
  homepage: string | null;
  repositoryUrl: string | null;
  dependencyNames: string[];
  /** ISO timestamp of the latest version's publish, or null when unconfirmed. */
  releasedAt: string | null;
};

/**
 * `license` is a plain string on every package published this decade, but the
 * registry still serves two older shapes: a single `{type, url}` object, and —
 * on packages last touched before npm settled the field — a `licenses` array
 * of the same objects. All three are read so a package that predates the
 * current convention still shows something instead of "—".
 */
export function normalizeLicense(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  if (Array.isArray(value)) {
    const names = value
      .map((entry) =>
        entry && typeof entry === "object" && "type" in entry
          ? (entry as { type: unknown }).type
          : null,
      )
      .filter((type): type is string => typeof type === "string" && type !== "");
    return names.length > 0 ? names.join(" / ") : null;
  }

  if (value && typeof value === "object" && "type" in value) {
    const type = (value as { type: unknown }).type;
    return typeof type === "string" && type !== "" ? type : null;
  }

  return null;
}

/**
 * `repository` arrives in four shapes across npm's history: a plain string, an
 * `{url}` object, an scp-style git remote, and the "owner/repo" or
 * "github:owner/repo" shorthand npm has always accepted as a publish-time
 * convenience. All four are folded into one https URL a visitor can click,
 * because none of the other three is one.
 */
export function normalizeRepositoryUrl(value: unknown): string | null {
  let raw: string | null = null;
  if (typeof value === "string") {
    raw = value;
  } else if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url: unknown }).url;
    raw = typeof url === "string" ? url : null;
  }

  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Shorthand is checked first and on the untouched string: "owner/repo" has
  // no "://" or "@" in it, which is exactly what tells it apart from every
  // other shape below.
  const shorthand = /^(?:github:)?([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (shorthand && !trimmed.includes("://") && !trimmed.includes("@")) {
    return `https://github.com/${shorthand[1]}/${shorthand[2]}`;
  }

  let url = trimmed.replace(/^git\+/, "");

  // scp-style remote: "git@github.com:owner/repo.git".
  const scp = /^git@([^:]+):(.+)$/.exec(url);
  if (scp) url = `https://${scp[1]}/${scp[2]}`;

  url = url.replace(/^git:\/\//, "https://");
  url = url.replace(/\.git$/, "");
  return url;
}

/** Dependency names, sorted — the count is the headline, the names are the detail. */
export function extractDependencyNames(latestJson: unknown): string[] {
  if (!latestJson || typeof latestJson !== "object") return [];
  const deps = (latestJson as { dependencies?: unknown }).dependencies;
  if (!deps || typeof deps !== "object") return [];
  return Object.keys(deps).sort();
}

/**
 * Reads the publish date out of a search response, but only when the top hit
 * is the exact package asked for. Search is relevance-ranked, not a lookup —
 * for a well-known name the top hit is almost always right, but there is no
 * guarantee, and showing a wrong package's release date under a right
 * package's name would be a fabricated fact, not an approximation.
 */
export function extractReleasedAt(searchJson: unknown, expectedFullName: string): string | null {
  if (!searchJson || typeof searchJson !== "object") return null;
  const objects = (searchJson as { objects?: unknown }).objects;
  if (!Array.isArray(objects) || objects.length === 0) return null;

  const top = objects[0];
  const pkg = top && typeof top === "object" ? (top as { package?: unknown }).package : null;
  if (!pkg || typeof pkg !== "object") return null;

  const name = (pkg as { name?: unknown }).name;
  if (name !== expectedFullName) return null;

  const date = (pkg as { date?: unknown }).date;
  return typeof date === "string" ? date : null;
}

/**
 * Assembles the finished card from the `/latest` body plus a release date
 * fetched separately. Returns null rather than a half-filled card when the
 * body is not what a real registry answer looks like — a package always has a
 * name and a version, and a response missing either is not one this tool
 * should try to render.
 */
export function buildNpmPackageInfo(latestJson: unknown, releasedAt: string | null): NpmPackageInfo | null {
  if (!latestJson || typeof latestJson !== "object") return null;
  const obj = latestJson as Record<string, unknown>;

  const name = typeof obj.name === "string" ? obj.name : null;
  const version = typeof obj.version === "string" ? obj.version : null;
  if (!name || !version) return null;

  return {
    name,
    version,
    description: typeof obj.description === "string" ? obj.description : null,
    license: normalizeLicense(obj.license ?? obj.licenses),
    deprecated: typeof obj.deprecated === "string" ? obj.deprecated : null,
    homepage: typeof obj.homepage === "string" ? obj.homepage : null,
    repositoryUrl: normalizeRepositoryUrl(obj.repository),
    dependencyNames: extractDependencyNames(obj),
    releasedAt,
  };
}
