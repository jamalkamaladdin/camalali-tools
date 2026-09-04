/*
 * Packagist / Composer lookups, kept apart from the fetching that happens in
 * the API route: this file only turns the JSON Packagist already sent back
 * into shapes the widget can render, plus the one thing that has to happen
 * before any request leaves this server — deciding whether a typed string is
 * even a legal "vendor/package" name.
 *
 * Two calls feed one result, for the same reason npm's tool makes two: the
 * metadata endpoint (`repo.packagist.org/p2`, Composer's own v2 format)
 * carries every published version with its require list, license and
 * release time, but not download counts or the abandoned flag — those live
 * on the older stats endpoint (`packagist.org/packages/<vendor>/<pkg>.json`)
 * instead, and that call is best-effort: an outage there should not hide
 * version data that already arrived.
 */

const PART_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MAX_PART_LENGTH = 214;

export type PackagistNameResult =
  | { ok: true; vendor: string; name: string; fullName: string }
  | { ok: false; error: string };

function checkPart(part: string, label: string): string | null {
  if (part === "") return `${label} boşdur.`;
  if (part.length > MAX_PART_LENGTH) return `${label} çox uzundur.`;
  if (!PART_PATTERN.test(part)) {
    return `${label} yalnız kiçik hərf, rəqəm, nöqtə, tire və alt xətdən ibarət ola bilər: "${part}".`;
  }
  return null;
}

/** Validates a "vendor/package" name the way it will be dropped into a URL. */
export function parsePackagistName(raw: string): PackagistNameResult {
  const value = raw.trim().toLowerCase();
  if (value === "") return { ok: false, error: "Paket adı boşdur." };
  if (/\s/.test(value)) return { ok: false, error: "Ad boşluq saxlaya bilməz." };

  const parts = value.split("/");
  if (parts.length !== 2) {
    return { ok: false, error: "Ad vendor/paket formatındadır — tək '/' işarəsi olmalıdır." };
  }

  const [vendor, name] = parts;
  const vendorError = checkPart(vendor, "Vendor adı");
  if (vendorError) return { ok: false, error: vendorError };
  const nameError = checkPart(name, "Paket adı");
  if (nameError) return { ok: false, error: nameError };

  return { ok: true, vendor, name, fullName: `${vendor}/${name}` };
}

export type PackagistPackageInfo = {
  name: string;
  latestVersion: string;
  requiresPhp: string | null;
  /** `require` entries, PHP itself and `ext-*` excluded. */
  dependencies: string[];
  license: string[];
  releasedAt: string | null;
  downloadsTotal: number | null;
  downloadsMonthly: number | null;
  /** Null when the stats call failed — "unknown", not "no". */
  abandoned: boolean | null;
  abandonedReplacement: string | null;
};

/*
 * Composer treats anything with a "dev-" prefix or an "-alpha" / "-beta" /
 * "-RC" suffix as unstable by default — the same rule `composer require`
 * itself uses to decide what a bare version constraint may resolve to.
 */
const UNSTABLE_PATTERN = /(^dev-|-dev$|-(alpha|beta|rc)\d*$)/i;

export function isStableComposerVersion(version: string): boolean {
  return !UNSTABLE_PATTERN.test(version.trim());
}

type P2VersionEntry = Record<string, unknown>;

function readEntries(p2Json: unknown, fullName: string): P2VersionEntry[] {
  if (!p2Json || typeof p2Json !== "object") return [];
  const packages = (p2Json as { packages?: unknown }).packages;
  if (!packages || typeof packages !== "object") return [];
  const list = (packages as Record<string, unknown>)[fullName];
  return Array.isArray(list) ? (list as P2VersionEntry[]) : [];
}

/**
 * The most recent stable release by publish time. Falls back to the most
 * recent release of any stability when nothing stable has ever shipped,
 * rather than reporting no version at all for a package that is real.
 */
export function selectLatestPackagistVersion(entries: P2VersionEntry[]): P2VersionEntry | null {
  const withTime = entries.filter((entry) => typeof entry.time === "string");
  if (withTime.length === 0) return null;

  const stable = withTime.filter((entry) => isStableComposerVersion(String(entry.version ?? "")));
  const pool = stable.length > 0 ? stable : withTime;

  return pool.reduce((latest, entry) => (String(entry.time) > String(latest.time) ? entry : latest));
}

/** `require` entries other than the PHP runtime itself and its extensions. */
export function extractPackagistDependencies(require: unknown): string[] {
  if (!require || typeof require !== "object") return [];
  return Object.entries(require as Record<string, unknown>)
    .filter(([dep]) => dep !== "php" && !dep.startsWith("ext-"))
    .map(([dep, constraint]) => `${dep} ${typeof constraint === "string" ? constraint : ""}`.trim())
    .sort((a, b) => a.localeCompare(b));
}

export function extractRequiresPhp(require: unknown): string | null {
  if (!require || typeof require !== "object") return null;
  const value = (require as Record<string, unknown>).php;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function extractPackagistLicense(entry: P2VersionEntry): string[] {
  const value = entry.license;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item !== "");
}

/** Reads the abandoned flag off the stats endpoint's package object. */
export function extractPackagistAbandoned(statsJson: unknown): { abandoned: boolean; replacement: string | null } {
  if (!statsJson || typeof statsJson !== "object") return { abandoned: false, replacement: null };
  const pkg = (statsJson as { package?: unknown }).package;
  if (!pkg || typeof pkg !== "object") return { abandoned: false, replacement: null };
  const value = (pkg as Record<string, unknown>).abandoned;
  if (typeof value === "string" && value.trim() !== "") return { abandoned: true, replacement: value.trim() };
  return { abandoned: value === true, replacement: null };
}

export function extractPackagistDownloads(statsJson: unknown): { total: number | null; monthly: number | null } {
  if (!statsJson || typeof statsJson !== "object") return { total: null, monthly: null };
  const pkg = (statsJson as { package?: unknown }).package;
  if (!pkg || typeof pkg !== "object") return { total: null, monthly: null };
  const downloads = (pkg as Record<string, unknown>).downloads;
  if (!downloads || typeof downloads !== "object") return { total: null, monthly: null };
  const total = (downloads as Record<string, unknown>).total;
  const monthly = (downloads as Record<string, unknown>).monthly;
  return {
    total: typeof total === "number" ? total : null,
    monthly: typeof monthly === "number" ? monthly : null,
  };
}

/**
 * Assembles the finished card. `statsJson` may be null — the abandoned flag
 * and the download counts come back as null rather than blocking a lookup
 * whose version data already arrived.
 */
export function buildPackagistPackageInfo(
  p2Json: unknown,
  statsJson: unknown,
  fullName: string,
): PackagistPackageInfo | null {
  const entries = readEntries(p2Json, fullName);
  const latest = selectLatestPackagistVersion(entries);
  if (!latest) return null;

  const version = typeof latest.version === "string" ? latest.version : null;
  if (!version) return null;

  const abandonedInfo: { abandoned: boolean | null; replacement: string | null } =
    statsJson !== null && statsJson !== undefined
      ? extractPackagistAbandoned(statsJson)
      : { abandoned: null, replacement: null };
  const downloads =
    statsJson !== null && statsJson !== undefined
      ? extractPackagistDownloads(statsJson)
      : { total: null, monthly: null };

  return {
    name: fullName,
    latestVersion: version,
    requiresPhp: extractRequiresPhp(latest.require),
    dependencies: extractPackagistDependencies(latest.require),
    license: extractPackagistLicense(latest),
    releasedAt: typeof latest.time === "string" ? latest.time : null,
    downloadsTotal: downloads.total,
    downloadsMonthly: downloads.monthly,
    abandoned: abandonedInfo.abandoned,
    abandonedReplacement: abandonedInfo.replacement,
  };
}
