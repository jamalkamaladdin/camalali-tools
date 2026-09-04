/*
 * Proxies one Docker Hub image lookup. Two upstream calls: the repository
 * object for description/stars/pulls, and the tag list for the ten most
 * recent tags — see `lib/tools/docker-hub.ts` for how the two bodies are
 * combined. The tag call is best-effort: a repository that answers but whose
 * tags call fails still returns a card, just with an empty tag list.
 */
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildDockerHubImageInfo, parseDockerHubName } from "../../lib/docker-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCKER_HUB_CACHE_TTL_MS = 10 * 60_000;

type LoadOutcome = { ok: true; data: unknown } | { ok: false; message: string };

async function loadImage(owner: string, name: string): Promise<LoadOutcome> {
  const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  const repo = await upstream(`https://hub.docker.com/v2/repositories/${repoPath}`);
  if (!repo.ok) return { ok: false, message: upstreamMessage("Docker Hub", repo) };

  let repoJson: unknown;
  try {
    repoJson = JSON.parse(repo.text);
  } catch (error) {
    console.error(`docker-hub: could not parse repository body for ${owner}/${name}`, error);
    throw new Error("Docker Hub gözlənilməz formatda cavab verdi.");
  }

  // Best-effort only: a tags failure must not fail a lookup whose repository
  // data already arrived successfully above.
  let tagsJson: unknown = null;
  const tags = await upstream(`https://hub.docker.com/v2/repositories/${repoPath}/tags?page_size=10`);
  if (tags.ok) {
    try {
      tagsJson = JSON.parse(tags.text);
    } catch (error) {
      console.warn(`docker-hub: could not parse tags body for ${owner}/${name}`, error);
    }
  }

  const info = buildDockerHubImageInfo(repoJson, tagsJson, owner, name);
  if (!info) return { ok: false, message: "Docker Hub gözlənilməz formatda cavab verdi." };
  return { ok: true, data: info };
}

export async function GET(request: Request) {
  const refused = guard(request, "docker-hub");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parseDockerHubName(url.searchParams.get("image") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  try {
    const outcome = await cached(`docker-hub:${parsed.fullName}`, DOCKER_HUB_CACHE_TTL_MS, () =>
      loadImage(parsed.owner, parsed.name),
    );
    if (!outcome.ok) return fail(outcome.message);
    return ok(outcome.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
