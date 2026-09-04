/**
 * Go module proxy arithmetic: validating a module path, escaping it the way
 * the proxy protocol requires, parsing what the proxy answers with, and
 * sorting the result by semantic version.
 *
 * The escaping is the one piece of this file worth reading closely, because
 * it is the actual trap the tool exists to show. `proxy.golang.org` mirrors
 * Go's module cache, and that cache sits on ordinary filesystems — some of
 * them case-insensitive. `github.com/BurntSushi/toml` and a hypothetical
 * `github.com/burntsushi/toml` would collide there, so the module proxy
 * protocol (`golang.org/x/mod/module`, `EscapePath`) rewrites every capital
 * letter to `!` followed by its lowercase form before it ever touches a URL:
 * `BurntSushi` becomes `!burnt!sushi`. Skip this and every request for a
 * mixed-case module 404s — not because the module does not exist, but
 * because the request never reached where it lives.
 */

/* ---------- module path validation ---------- */

export type GoModuleParseResult = { ok: true; path: string } | { ok: false; error: string };

const MAX_PATH_LENGTH = 255;

/*
 * The URL-safety subset of the real module path spec (`golang.org/x/mod/module.CheckPath`):
 * enough to refuse a path that would either break the proxy URL or try to
 * walk out of it, not a full reimplementation of every publish-time rule.
 */
const ALLOWED_CHARACTERS = /^[a-zA-Z0-9.\-_~/]+$/;

/**
 * Validates a module path well enough to build a safe proxy URL from it —
 * rejects a `..` traversal attempt, a leading or trailing slash, and any
 * character the proxy's own path escaping was never designed to carry.
 */
export function parseGoModulePath(raw: string): GoModuleParseResult {
  const value = raw.trim();

  if (value === "") return { ok: false, error: "Modul yolu boşdur." };
  if (value.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `Modul yolu həddindən uzundur (${MAX_PATH_LENGTH} simvol həddi var).` };
  }
  if (/\s/.test(value)) return { ok: false, error: "Modul yolu boşluq saxlaya bilməz." };
  if (value.startsWith("/") || value.endsWith("/")) {
    return { ok: false, error: "Modul yolu \"/\" ilə başlaya və ya bitə bilməz." };
  }
  if (!ALLOWED_CHARACTERS.test(value)) {
    return { ok: false, error: "Modul yolunda qəbul edilməyən simvol var." };
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return { ok: false, error: "Modul yolunda boş, \".\" və ya \"..\" seqmenti qəbul edilmir." };
  }

  const firstSegment = segments[0] ?? "";
  if (!firstSegment.includes(".")) {
    return { ok: false, error: "Modul yolu domenlə başlamalıdır — məsələn github.com/istifadeci/repo." };
  }

  return { ok: true, path: value };
}

/* ---------- the escaping trap ---------- */

/** `BurntSushi` -> `!burnt!sushi` — every capital becomes `!` plus its lowercase form. */
export function escapeModulePath(path: string): string {
  return path.replace(/[A-Z]/g, (letter) => `!${letter.toLowerCase()}`);
}

/** The inverse: `!burnt!sushi` -> `BurntSushi`. */
export function unescapeModulePath(escaped: string): string {
  return escaped.replace(/!([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** `github.com/foo/bar/v3` -> `/v3`; a path with no major-version suffix returns `null`. */
export function extractMajorSuffix(path: string): string | null {
  const match = /\/(v\d+)$/.exec(path);
  return match ? `/${match[1]}` : null;
}

export function buildGoGetCommand(modulePath: string, version: string): string {
  return `go get ${modulePath}@${version}`;
}

/* ---------- semantic version parsing and ordering ---------- */

export type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  raw: string;
};

/** Go's module versions are always `v`-prefixed semver; a bare `1.2.3` is not one. */
export function parseSemver(version: string): ParsedSemver | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    raw: version,
  };
}

/**
 * Semver ordering (major, then minor, then patch), with one rule that reads
 * backwards until it is spelled out: a release with NO prerelease tag
 * outranks one WITH a prerelease tag at the same major.minor.patch — `v1.0.0`
 * is newer than `v1.0.0-rc.1`, because the release is what the tag led up to.
 */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === null && b.prerelease !== null) return 1;
  if (a.prerelease !== null && b.prerelease === null) return -1;
  if (a.prerelease === null && b.prerelease === null) return 0;
  return (a.prerelease as string).localeCompare(b.prerelease as string);
}

/** Unparsable entries (a stray blank line, a malformed tag) are dropped rather than sorted arbitrarily. */
export function sortVersionsDescending(versions: string[]): string[] {
  return versions
    .map((version) => parseSemver(version))
    .filter((parsed): parsed is ParsedSemver => parsed !== null)
    .sort((a, b) => compareSemver(b, a))
    .map((parsed) => parsed.raw);
}

/* ---------- reading what the proxy answers with ---------- */

/** `@v/list` is plain text, one version per line, with no guaranteed order and no trailing-blank-line guarantee either way. */
export function parseVersionList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export type VersionInfo = { version: string; time: string };

/** `@latest` and `@v/<version>.info` share this shape: `{"Version": "v1.2.3", "Time": "2020-01-01T00:00:00Z"}`. */
export function parseVersionInfoJson(json: unknown): VersionInfo | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  const version = typeof record.Version === "string" ? record.Version : null;
  const time = typeof record.Time === "string" ? record.Time : null;
  if (!version || !time) return null;
  return { version, time };
}

export type GoModuleReport = {
  modulePath: string;
  majorSuffix: string | null;
  latestVersion: string;
  latestReleasedAt: string;
  /** Newest first, at most ten. */
  recentVersions: string[];
  goGetCommand: string;
};
