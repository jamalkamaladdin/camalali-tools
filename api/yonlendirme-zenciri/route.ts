import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { auditChain, buildChain, type ChainReport } from "../../lib/yonlendirme-zenciri";
import { followRedirects } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The redirect-chain endpoint.
 *
 * This is the one tool on the site that is *supposed* to follow a stranger's
 * redirect, which makes it the sharpest version of the problem the comment at
 * the top of `api/alet/basliqlar/route.ts` sets out: the first address can be
 * a perfectly ordinary public site whose second hop points at 127.0.0.1, and a
 * browser-style `redirect: "follow"` would make that second request without
 * asking anybody. One hop, straight past the fence.
 *
 * So the walk is not done here and it is not done with `fetch`. It is
 * `followRedirects` in `safe-fetch.ts`, which re-runs the scheme/port check and
 * the DNS check on EVERY hop, refuses the chain at the first address the tools
 * are not allowed to touch, and drops every response body unread. This route's
 * whole job is to hand it a normalised address, cap the hops, and turn what
 * comes back into a reading.
 *
 * `upstream()` from `api-route.ts` is deliberately not used: it hardcodes
 * `redirect: "follow"`, which is precisely the thing being avoided.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A redirect changes when somebody edits a server config, not between two
   clicks — and the far end is a stranger's server we would rather ask once. */
const CACHE_TTL_MS = 300_000;

/*
 * Ten. A browser gives up at around twenty; ten is past every legitimate chain
 * and still short enough that a loop costs ten cheap requests rather than a
 * timeout the visitor watches. `followRedirects` reports the ceiling as
 * `truncated`, so hitting it is a finding rather than a silent trim.
 */
const MAX_HOPS = 10;

type Outcome =
  | { ok: true; report: ChainReport }
  /* A refused address is the visitor's input being wrong (400); an unreachable
     site is the far end failing (502). The two read very differently to
     anybody watching the network tab, so they are not merged. */
  | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "yonlendirme-zenciri");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`yonlendirme-zenciri:${target.url}`, CACHE_TTL_MS, async () => {
    const walked = await followRedirects(target.url, MAX_HOPS);
    if (!walked.ok) return { ok: false, message: walked.message, status: walked.status };

    const steps = buildChain(walked.hops);

    return {
      ok: true,
      report: {
        url: target.url,
        steps,
        issues: auditChain(steps, walked.truncated),
        finalUrl: walked.finalUrl,
        finalStatus: walked.finalStatus,
        truncated: walked.truncated,
        checkedAt: new Date().toISOString(),
      },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
