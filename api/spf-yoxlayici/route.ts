import { Resolver } from "node:dns/promises";

import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { checkHostname } from "../../lib/socket-probe";
import { expandSpf, type SpfExpansion, type SpfResolver } from "../../lib/spf-yoxlayici";

/*
 * The SPF expansion endpoint.
 *
 * Two things live here that the pure engine in `spf-yoxlayici.ts` cannot do
 * itself: talking to a real resolver, and deciding whether the visitor typed
 * a domain or pasted a record. Everything else — the recursion, the
 * counting, the findings — is the same code the checks run against a fake
 * resolver, unchanged.
 *
 * `checkHostname` is reused here for exactly one thing: refusing a target that
 * resolves to a private or reserved address, the same fence every other
 * network tool on this site applies before it lets a visitor's input decide
 * which address this server calls. Its own DNS lookup (an A/AAAA check) is
 * separate from the TXT lookups this tool performs — a domain can fail that
 * check with no A record at all and still have a perfectly good SPF policy,
 * so it is only used to reject a target, never to supply the SPF answer.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* An SPF record changes on a deploy or a vendor switch, not between two
   clicks — the same reasoning `robots-canli` uses for its own 5 minutes. */
const CACHE_TTL_MS = 300_000;

const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

const SPF_PREFIX = /^v=spf1(\s|$)/i;

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/**
 * Adapts Node's resolver to the shape `expandSpf` asks for: a domain in,
 * TXT chunk-arrays out, never throwing for "this name has nothing" — only
 * for an actual resolver failure, which the caller turns into a proper
 * Azerbaijani error rather than a silently empty tree.
 */
function makeResolver(): SpfResolver {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

  return async (domain: string) => {
    try {
      return await resolver.resolveTxt(domain);
    } catch (error) {
      const code = errorCode(error);
      /* NXDOMAIN and "no data" are the RFC's own "void lookup" case, not a
         failure of this tool — `expandSpf` reads an empty array as exactly
         that. Anything else (timeout, SERVFAIL, connection refused) is a
         real resolver problem and is left to bubble to the route's catch. */
      if (code === "ENOTFOUND" || code === "ENODATA") return [];
      throw error;
    }
  };
}

/* No real domain names the root when a record is pasted directly, so this
   is a label, not a hostname — it never reaches `checkHostname` or a TXT
   query, only the cycle-detection set and the tree's own display. */
const PASTED_ROOT_LABEL = "yapışdırılan qeyd";

export async function GET(request: Request) {
  const refused = guard(request, "spf-yoxlayici");
  if (refused) return refused;

  const raw = (new URL(request.url).searchParams.get("domen") ?? "").trim();
  if (raw === "") return fail("Boş sahə, domen adı və ya v=spf1 qeydi yaz.");

  try {
    if (SPF_PREFIX.test(raw)) {
      const result = await cached<SpfExpansion>(`spf-yoxlayici:text:${raw}`, CACHE_TTL_MS, () =>
        expandSpf(PASTED_ROOT_LABEL, makeResolver(), { rootRecord: raw }),
      );
      return ok(result);
    }

    const target = checkHostname(raw);
    if (!target.ok) return fail(target.message, target.status);

    const result = await cached<SpfExpansion>(`spf-yoxlayici:${target.hostname}`, CACHE_TTL_MS, () =>
      expandSpf(target.hostname, makeResolver()),
    );
    return ok(result);
  } catch {
    return fail("Ad serveri ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.", 502);
  }
}
