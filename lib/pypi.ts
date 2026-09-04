/*
 * PyPI registry lookups, kept apart from the fetching that happens in the API
 * route: this file only turns the JSON PyPI already sent back into shapes the
 * widget can render, plus the one thing that has to happen before any request
 * leaves this server — deciding whether a typed string is even a legal
 * package name.
 *
 * One upstream call answers everything this tool needs: `GET /pypi/<name>/json`
 * carries the latest release's metadata under `info`, every release's files
 * under `releases`, and the latest release's own files under `urls` — the
 * three keys this file reads.
 */

const MAX_NAME_LENGTH = 214;
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export type PypiNameResult = { ok: true; name: string } | { ok: false; error: string };

/** Validates a name the way it will be dropped into a registry URL. */
export function parsePypiName(raw: string): PypiNameResult {
  const value = raw.trim();

  if (value === "") return { ok: false, error: "Paket adı boşdur." };
  if (value.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Ad çox uzundur: ${MAX_NAME_LENGTH} simvol həddi var, ${value.length} tapıldı.`,
    };
  }
  if (/\s/.test(value)) return { ok: false, error: "Ad boşluq saxlaya bilməz." };
  if (!NAME_PATTERN.test(value)) {
    return { ok: false, error: "Ad yalnız hərf, rəqəm, nöqtə, tire və alt xətdən ibarət ola bilər." };
  }

  return { ok: true, name: value };
}

/** The registry path segment for a validated name. */
export function pypiRegistrySegment(name: string): string {
  return encodeURIComponent(name);
}

export type PypiPackageInfo = {
  name: string;
  version: string;
  summary: string | null;
  license: string | null;
  requiresPython: string | null;
  /** Raw `requires_dist` entries — version range and marker kept intact. */
  dependencies: string[];
  projectUrls: { label: string; url: string }[];
  /** ISO timestamp of the latest version's earliest uploaded file. */
  releasedAt: string | null;
  recentReleases: { version: string; releasedAt: string }[];
  /** e.g. `["sdist", "wheel"]`. */
  packageFormats: string[];
};

const LICENSE_CLASSIFIER_PREFIX = "License :: ";
const MAX_LICENSE_TEXT_LENGTH = 80;

/*
 * `info.license` is free text: some projects write "MIT", others paste the
 * whole license body into it. A classifier is a controlled vocabulary
 * instead — "License :: OSI Approved :: MIT License" — so a matching
 * classifier wins when one exists, and the free-text field is trusted only
 * when it is short enough to be a name rather than a document.
 */
export function normalizePypiLicense(info: Record<string, unknown>): string | null {
  const classifiers = Array.isArray(info.classifiers) ? info.classifiers : [];
  const fromClassifiers = classifiers
    .filter((entry): entry is string => typeof entry === "string" && entry.startsWith(LICENSE_CLASSIFIER_PREFIX))
    .map((entry) => entry.slice(entry.lastIndexOf("::") + 2).trim())
    .filter((label) => label !== "" && label !== "OSI Approved");
  if (fromClassifiers.length > 0) return [...new Set(fromClassifiers)].join(" / ");

  const raw = typeof info.license === "string" ? info.license.trim() : "";
  if (raw === "" || raw.length > MAX_LICENSE_TEXT_LENGTH) return null;
  return raw;
}

/**
 * `requires_dist` entries, trimmed and de-duplicated — not parsed further,
 * because a requirement carries a version range and an optional marker
 * (`; extra == "test"`) that are both part of what the visitor asked to see.
 */
export function extractPypiDependencies(requiresDist: unknown): string[] {
  if (!Array.isArray(requiresDist)) return [];
  const seen = new Set<string>();
  for (const entry of requiresDist) {
    if (typeof entry === "string" && entry.trim() !== "") seen.add(entry.trim());
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

const HOME_PAGE_LABEL = "Homepage";

/** `project_urls` plus `home_page` as a fallback, de-duplicated by address. */
export function extractPypiProjectUrls(info: Record<string, unknown>): { label: string; url: string }[] {
  const urls: { label: string; url: string }[] = [];
  const seen = new Set<string>();

  const projectUrls = info.project_urls;
  if (projectUrls && typeof projectUrls === "object") {
    for (const [label, url] of Object.entries(projectUrls as Record<string, unknown>)) {
      if (typeof url === "string" && url.trim() !== "" && !seen.has(url.trim())) {
        const trimmed = url.trim();
        urls.push({ label, url: trimmed });
        seen.add(trimmed);
      }
    }
  }

  const homePage = typeof info.home_page === "string" ? info.home_page.trim() : "";
  if (homePage !== "" && !seen.has(homePage)) {
    urls.push({ label: HOME_PAGE_LABEL, url: homePage });
    seen.add(homePage);
  }

  return urls;
}

const FORMAT_LABELS: Record<string, string> = {
  sdist: "sdist",
  bdist_wheel: "wheel",
};

/** Distinct packaging formats among the latest release's files, sorted. */
export function extractPypiPackageFormats(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  for (const entry of urls) {
    const packagetype =
      entry && typeof entry === "object" ? (entry as { packagetype?: unknown }).packagetype : null;
    if (typeof packagetype === "string" && packagetype !== "") {
      seen.add(FORMAT_LABELS[packagetype] ?? packagetype);
    }
  }
  return [...seen].sort();
}

function earliestUpload(files: unknown): string | null {
  if (!Array.isArray(files)) return null;
  let earliest: string | null = null;
  for (const file of files) {
    const uploaded =
      file && typeof file === "object" ? (file as { upload_time_iso_8601?: unknown }).upload_time_iso_8601 : null;
    if (typeof uploaded !== "string") continue;
    if (earliest === null || uploaded < earliest) earliest = uploaded;
  }
  return earliest;
}

/** The earliest upload among the latest release's own files. */
export function extractPypiReleasedAt(urls: unknown): string | null {
  return earliestUpload(urls);
}

/** Up to `limit` releases, newest first, each dated by its earliest uploaded file. */
export function extractPypiRecentReleases(
  releases: unknown,
  limit = 5,
): { version: string; releasedAt: string }[] {
  if (!releases || typeof releases !== "object") return [];
  const entries: { version: string; releasedAt: string }[] = [];

  for (const [version, files] of Object.entries(releases as Record<string, unknown>)) {
    const releasedAt = earliestUpload(files);
    if (releasedAt !== null) entries.push({ version, releasedAt });
  }

  entries.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : a.releasedAt > b.releasedAt ? -1 : 0));
  return entries.slice(0, limit);
}

/**
 * Assembles the finished card. Returns null rather than a half-filled card
 * when the body is not what a real PyPI answer looks like — a package always
 * has a name and a version, and a response missing either is not one this
 * tool should try to render.
 */
export function buildPypiPackageInfo(json: unknown): PypiPackageInfo | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const info = obj.info;
  if (!info || typeof info !== "object") return null;
  const infoObj = info as Record<string, unknown>;

  const name = typeof infoObj.name === "string" ? infoObj.name : null;
  const version = typeof infoObj.version === "string" ? infoObj.version : null;
  if (!name || !version) return null;

  const summaryRaw = typeof infoObj.summary === "string" ? infoObj.summary.trim() : "";
  const requiresPythonRaw = typeof infoObj.requires_python === "string" ? infoObj.requires_python.trim() : "";

  return {
    name,
    version,
    summary: summaryRaw === "" ? null : summaryRaw,
    license: normalizePypiLicense(infoObj),
    requiresPython: requiresPythonRaw === "" ? null : requiresPythonRaw,
    dependencies: extractPypiDependencies(infoObj.requires_dist),
    projectUrls: extractPypiProjectUrls(infoObj),
    releasedAt: extractPypiReleasedAt(obj.urls),
    recentReleases: extractPypiRecentReleases(obj.releases),
    packageFormats: extractPypiPackageFormats(obj.urls),
  };
}
