/*
 * GitHub profile and repo lookups. The parsing half of a network tool: turning
 * a typed string into a validated target, and a REST response body into a
 * card. The fetch itself, the rate-limit guard and the caching all live in the
 * route — this file has no network in it, which is what lets its rules be
 * checked without one.
 */

const LOGIN_PATTERN = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;
const MAX_LOGIN_LENGTH = 39;

/**
 * GitHub's own rule for a login: letters, digits and single hyphens, never a
 * hyphen at either end and never two in a row. `LOGIN_PATTERN` already forbids
 * a leading or doubled hyphen structurally — a run of two would need an empty
 * segment between them, which the pattern has no branch for — but a trailing
 * one slips through the same regex a leading one doesn't, so it gets a
 * separate check.
 */
function checkLogin(login: string, label: string): string | null {
  if (login === "") return `${label} boşdur.`;
  if (login.length > MAX_LOGIN_LENGTH) {
    return `${label} çox uzundur: ${MAX_LOGIN_LENGTH} simvol həddi var, ${login.length} tapıldı.`;
  }
  if (login.endsWith("-") || !LOGIN_PATTERN.test(login)) {
    return `${label} yalnız hərf, rəqəm və tək tiredən ibarət ola bilər, tire ilə başlaya/bitə bilməz: "${login}".`;
  }
  return null;
}

const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_REPO_NAME_LENGTH = 100;

function checkRepoName(name: string): string | null {
  if (name === "") return "Repo adı boşdur.";
  if (name === "." || name === "..") return `Repo adı "${name}" ola bilməz.`;
  if (name.length > MAX_REPO_NAME_LENGTH) {
    return `Repo adı çox uzundur: ${MAX_REPO_NAME_LENGTH} simvol həddi var, ${name.length} tapıldı.`;
  }
  if (!REPO_NAME_PATTERN.test(name)) {
    return `Repo adı yalnız hərf, rəqəm, nöqtə, tire və alt xətdən ibarət ola bilər: "${name}".`;
  }
  return null;
}

export type GithubTarget =
  | { kind: "user"; login: string }
  | { kind: "repo"; owner: string; repo: string };

export type GithubInputResult = { ok: true; target: GithubTarget } | { ok: false; error: string };

/**
 * Tells a profile lookup from a repo lookup by the one visible difference
 * between them — a single "/". Zero slashes is a username; one is
 * owner/repo; more than one is neither and is rejected before it becomes a
 * URL, the same reasoning `parseNpmName` applies to a scoped package name.
 */
export function parseGithubInput(raw: string): GithubInputResult {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "GitHub adı boşdur." };
  if (/\s/.test(value)) return { ok: false, error: "Ad boşluq saxlaya bilməz." };

  const segments = value.split("/");
  if (segments.length > 2) {
    return { ok: false, error: "Yalnız 'istifadəçi' və ya 'owner/repo' formatı qəbul edilir." };
  }

  if (segments.length === 2) {
    const [owner, repo] = segments;
    const ownerError = checkLogin(owner, "Owner adı");
    if (ownerError) return { ok: false, error: ownerError };
    const repoError = checkRepoName(repo);
    if (repoError) return { ok: false, error: repoError };
    return { ok: true, target: { kind: "repo", owner, repo } };
  }

  const loginError = checkLogin(value, "İstifadəçi adı");
  if (loginError) return { ok: false, error: loginError };
  return { ok: true, target: { kind: "user", login: value } };
}

/** The REST path for a target — always ASCII-safe input by the time this runs, but encoded anyway on principle. */
export function githubApiPath(target: GithubTarget): string {
  return target.kind === "user"
    ? `users/${encodeURIComponent(target.login)}`
    : `repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
}

export type GithubProfile = {
  kind: "user";
  login: string;
  name: string | null;
  bio: string | null;
  publicRepos: number;
  followers: number;
  createdAt: string;
  avatarUrl: string;
  htmlUrl: string;
};

export type GithubRepo = {
  kind: "repo";
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  pushedAt: string;
  openIssues: number;
  licenseName: string | null;
  htmlUrl: string;
  archived: boolean;
};

export type GithubResult = GithubProfile | GithubRepo;

export function parseGithubProfile(json: unknown): GithubProfile {
  const obj = (json ?? {}) as Record<string, unknown>;
  return {
    kind: "user",
    login: typeof obj.login === "string" ? obj.login : "",
    name: typeof obj.name === "string" ? obj.name : null,
    bio: typeof obj.bio === "string" ? obj.bio : null,
    publicRepos: typeof obj.public_repos === "number" ? obj.public_repos : 0,
    followers: typeof obj.followers === "number" ? obj.followers : 0,
    createdAt: typeof obj.created_at === "string" ? obj.created_at : "",
    avatarUrl: typeof obj.avatar_url === "string" ? obj.avatar_url : "",
    htmlUrl: typeof obj.html_url === "string" ? obj.html_url : "",
  };
}

export function parseGithubRepo(json: unknown): GithubRepo {
  const obj = (json ?? {}) as Record<string, unknown>;
  const license = obj.license;
  const licenseName =
    license && typeof license === "object" && "name" in license
      ? (license as { name: unknown }).name
      : null;

  return {
    kind: "repo",
    fullName: typeof obj.full_name === "string" ? obj.full_name : "",
    description: typeof obj.description === "string" ? obj.description : null,
    stars: typeof obj.stargazers_count === "number" ? obj.stargazers_count : 0,
    forks: typeof obj.forks_count === "number" ? obj.forks_count : 0,
    language: typeof obj.language === "string" ? obj.language : null,
    pushedAt: typeof obj.pushed_at === "string" ? obj.pushed_at : "",
    openIssues: typeof obj.open_issues_count === "number" ? obj.open_issues_count : 0,
    licenseName: typeof licenseName === "string" ? licenseName : null,
    htmlUrl: typeof obj.html_url === "string" ? obj.html_url : "",
    archived: obj.archived === true,
  };
}

export type GithubRateLimit = { remaining: number | null; limit: number | null };

/**
 * The three rate-limit headers GitHub sends on every response, success or
 * not — read here rather than inline in the route so the same parsing can be
 * handed a hand-built `Headers` in a check, with no request behind it.
 */
export function parseRateLimitHeaders(headers: Headers): GithubRateLimit {
  const remaining = headers.get("x-ratelimit-remaining");
  const limit = headers.get("x-ratelimit-limit");
  return {
    remaining: remaining !== null && remaining !== "" ? Number(remaining) : null,
    limit: limit !== null && limit !== "" ? Number(limit) : null,
  };
}
