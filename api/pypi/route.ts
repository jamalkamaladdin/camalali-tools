/*
 * Proxies one PyPI package lookup. One upstream call: `/pypi/<name>/json`
 * carries everything this tool shows — see `lib/tools/pypi.ts` for how the
 * `info`, `releases` and `urls` keys of that one body are turned into a card.
 */
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildPypiPackageInfo, parsePypiName, pypiRegistrySegment } from "../../lib/pypi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Package versions do not change minute to minute — ten minutes keeps the
   tool responsive to a fresh publish without asking PyPI on every keystroke's
   worth of visitors. */
const PYPI_CACHE_TTL_MS = 10 * 60_000;

type LoadOutcome = { ok: true; data: unknown } | { ok: false; message: string };

async function loadPackage(segment: string, name: string): Promise<LoadOutcome> {
  const response = await upstream(`https://pypi.org/pypi/${segment}/json`);
  if (!response.ok) return { ok: false, message: upstreamMessage("PyPI", response) };

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch (error) {
    console.error(`pypi: could not parse body for ${name}`, error);
    throw new Error("PyPI gözlənilməz formatda cavab verdi.");
  }

  const info = buildPypiPackageInfo(json);
  if (!info) return { ok: false, message: "PyPI gözlənilməz formatda cavab verdi." };
  return { ok: true, data: info };
}

export async function GET(request: Request) {
  const refused = guard(request, "pypi");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parsePypiName(url.searchParams.get("pkg") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  const segment = pypiRegistrySegment(parsed.name);

  try {
    const outcome = await cached(`pypi:${parsed.name.toLowerCase()}`, PYPI_CACHE_TTL_MS, () =>
      loadPackage(segment, parsed.name),
    );
    if (!outcome.ok) return fail(outcome.message);
    return ok(outcome.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
