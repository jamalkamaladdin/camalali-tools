/*
 * Proxies one crates.io lookup. One upstream call: `/api/v1/crates/<name>`
 * carries the crate and every published version — see `lib/tools/crates.ts`
 * for how that one body becomes a card.
 *
 * crates.io's own policy asks anonymous callers for a distinctive
 * `User-Agent` naming the site and a way to reach it, or it answers 403 — the
 * shared `upstream()` helper in `api-route.ts` already sends exactly that on
 * every call it makes (site name plus a contact URL), so nothing extra is
 * added here.
 */
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildCratesPackageInfo, cratesRegistrySegment, parseCratesName } from "../../lib/crates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRATES_CACHE_TTL_MS = 10 * 60_000;

type LoadOutcome = { ok: true; data: unknown } | { ok: false; message: string };

async function loadCrate(segment: string, name: string): Promise<LoadOutcome> {
  const response = await upstream(`https://crates.io/api/v1/crates/${segment}`);
  if (!response.ok) return { ok: false, message: upstreamMessage("crates.io", response) };

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch (error) {
    console.error(`crates: could not parse body for ${name}`, error);
    throw new Error("crates.io gözlənilməz formatda cavab verdi.");
  }

  const info = buildCratesPackageInfo(json);
  if (!info) return { ok: false, message: "crates.io gözlənilməz formatda cavab verdi." };
  return { ok: true, data: info };
}

export async function GET(request: Request) {
  const refused = guard(request, "crates");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parseCratesName(url.searchParams.get("ad") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  const segment = cratesRegistrySegment(parsed.name);

  try {
    const outcome = await cached(`crates:${parsed.name.toLowerCase()}`, CRATES_CACHE_TTL_MS, () =>
      loadCrate(segment, parsed.name),
    );
    if (!outcome.ok) return fail(outcome.message);
    return ok(outcome.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
