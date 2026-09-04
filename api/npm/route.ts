/*
 * Proxies one npm package lookup. Two upstream calls per package: `/latest`
 * for the authoritative fields, and a search hit for a best-effort release
 * date — see `lib/tools/npm.ts` for why the full packument (the only place
 * that date actually lives) is not fetched instead.
 */
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildNpmPackageInfo, extractReleasedAt, npmRegistrySegment, parseNpmName } from "../../lib/npm";

/* Package versions do not change minute to minute — ten minutes keeps the tool
   responsive to a fresh publish without asking the registry on every keystroke's worth of visitors. */
const NPM_CACHE_TTL_MS = 10 * 60_000;

type LoadOutcome = { ok: true; data: unknown } | { ok: false; message: string };

async function loadPackage(segment: string, fullName: string): Promise<LoadOutcome> {
  const latest = await upstream(`https://registry.npmjs.org/${segment}/latest`);
  if (!latest.ok) return { ok: false, message: upstreamMessage("npm registry", latest) };

  let latestJson: unknown;
  try {
    latestJson = JSON.parse(latest.text);
  } catch (error) {
    console.error(`npm: could not parse /latest body for ${fullName}`, error);
    throw new Error("npm registry gözlənilməz formatda cavab verdi.");
  }

  // Best-effort only: a search miss or a malformed body must not fail a
  // lookup whose main data already arrived successfully above.
  let releasedAt: string | null = null;
  const search = await upstream(
    `https://registry.npmjs.org/-/v1/search?text=${segment}&size=1`,
  );
  if (search.ok) {
    try {
      releasedAt = extractReleasedAt(JSON.parse(search.text), fullName);
    } catch (error) {
      console.warn(`npm: could not parse search body for ${fullName}`, error);
    }
  }

  const info = buildNpmPackageInfo(latestJson, releasedAt);
  if (!info) return { ok: false, message: "npm registry gözlənilməz formatda cavab verdi." };
  return { ok: true, data: info };
}

export async function GET(request: Request) {
  const refused = guard(request, "npm");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parseNpmName(url.searchParams.get("pkg") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  const segment = npmRegistrySegment(parsed.parsed);

  try {
    const outcome = await cached(`npm:${parsed.parsed.full}`, NPM_CACHE_TTL_MS, () =>
      loadPackage(segment, parsed.parsed.full),
    );
    if (!outcome.ok) return fail(outcome.message);
    return ok(outcome.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
