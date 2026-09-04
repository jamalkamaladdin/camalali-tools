/*
 * Proxies one GitHub lookup — a profile or a repo, told apart by
 * `parseGithubInput` before anything is fetched. Unauthenticated GitHub reads
 * share one 60-requests-per-hour budget across every visitor to this site, so
 * the cache below is load-bearing rather than a courtesy, and the remaining
 * count is read off every response so the widget can say honestly how much
 * of that shared budget is left.
 */
import { fail, guard, ok, upstream, upstreamMessage, type Fetched } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  githubApiPath,
  parseGithubInput,
  parseGithubProfile,
  parseGithubRepo,
  parseRateLimitHeaders,
  type GithubRateLimit,
  type GithubResult,
} from "../../lib/github";

const GITHUB_CACHE_TTL_MS = 15 * 60_000;

type LoadOutcome =
  | { ok: true; result: GithubResult; rateLimit: GithubRateLimit }
  | { ok: false; message: string };

/*
 * `upstream()` drops the response headers on any non-2xx status, so a genuine
 * 403 rate-limit refusal cannot be told apart from a rarer 403 by header here
 * — this is the trade-off of reusing the shared helper rather than hand-rolling
 * a second fetch just for this one route. For an unauthenticated GET against
 * these two read-only endpoints, a 403 is rate limiting in practice, so it is
 * reported as such; a 404 still gets its own accurate message from `upstreamMessage`.
 */
function githubErrorMessage(result: Extract<Fetched, { ok: false }>): string {
  if (result.reason === "status" && result.status === 403) {
    return "GitHub bizi bir müddət gözlədir: açarsız limitə çatdıq (saatda 60 sorğu, bütün ziyarətçilər üçün ortaq). Bir azdan yenidən yoxla.";
  }
  return upstreamMessage("GitHub", result);
}

export async function GET(request: Request) {
  const refused = guard(request, "github");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parseGithubInput(url.searchParams.get("q") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  const target = parsed.target;
  const cacheKey =
    target.kind === "user"
      ? `github:user:${target.login.toLowerCase()}`
      : `github:repo:${target.owner.toLowerCase()}/${target.repo.toLowerCase()}`;

  try {
    const outcome = await cached<LoadOutcome>(cacheKey, GITHUB_CACHE_TTL_MS, async () => {
      const response = await upstream(`https://api.github.com/${githubApiPath(target)}`, {
        headers: { accept: "application/vnd.github+json" },
      });
      if (!response.ok) return { ok: false, message: githubErrorMessage(response) };

      let json: unknown;
      try {
        json = JSON.parse(response.text);
      } catch (error) {
        console.error(`github: could not parse body for ${cacheKey}`, error);
        throw new Error("GitHub gözlənilməz formatda cavab verdi.");
      }

      const result = target.kind === "user" ? parseGithubProfile(json) : parseGithubRepo(json);
      return { ok: true, result, rateLimit: parseRateLimitHeaders(response.headers) };
    });

    if (!outcome.ok) return fail(outcome.message);
    return ok({ result: outcome.result, rateLimit: outcome.rateLimit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
