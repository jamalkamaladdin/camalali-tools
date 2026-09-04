/*
 * One note per minute, per address.
 *
 * Both public endpoints turn a stranger's POST into a commit in the content
 * repository. That is the whole point of them, and it is also why an unmetered
 * one is a gift to the first bot that finds it: a thousand requests become a
 * thousand commits, and the archive's history is not something an outsider
 * should be able to write at will.
 *
 * The counter lives in memory rather than in a store, because the shape of the
 * traffic does not need one — a single Node process serves the site, and a
 * restart forgetting who wrote a minute ago is a rounding error, not a hole.
 * Anything that needs to survive a restart belongs in the repository, and that
 * is exactly what the endpoint already writes.
 */

/** How long an address waits between two notes. */
const WINDOW_MS = 60_000;

/* Kept small on purpose: an entry is only useful for a minute, and sweeping on
   write means no timer has to run for the life of the process. */
const seen = new Map<string, number>();

/*
 * Behind Cloudflare the origin sees Cloudflare's address, and behind Caddy it
 * sees the proxy's, so the caller is read from the headers each hop adds.
 * `cf-connecting-ip` is the one Cloudflare guarantees; the first entry of
 * `x-forwarded-for` is what Caddy writes. Neither is trustworthy on its own —
 * a request can claim any of them — but the endpoint they guard writes a text
 * file, not money, and the honest cost of a spoofed header here is one extra
 * note per minute per made-up address.
 */
export function callerAddress(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return "bilinmir";
}

export type RateVerdict = { ok: true } | { ok: false; retryAfter: number };

/**
 * Records this caller and says whether they may proceed. `scope` separates the
 * endpoints, so leaving a guestbook note does not use up the suggestion form.
 */
export function takeTurn(scope: string, address: string): RateVerdict {
  const now = Date.now();

  for (const [key, at] of seen) {
    if (now - at >= WINDOW_MS) seen.delete(key);
  }

  const key = `${scope}:${address}`;
  const last = seen.get(key);
  if (last !== undefined && now - last < WINDOW_MS) {
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - last)) / 1000) };
  }

  seen.set(key, now);
  return { ok: true };
}

/** The refusal itself, so both endpoints answer a rushed visitor identically. */
export function tooSoon(retryAfter: number): Response {
  return Response.json(
    {
      ok: false,
      message: `Çox tez göndərildi. ${retryAfter} saniyə sonra yenidən yoxlayın.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/*
 * The tools need a different shape of patience than the forms do.
 *
 * One note per minute is right for a guestbook, where the second note in the
 * same minute is almost always a bot. It is wrong for a tool: somebody
 * checking their DNS checks three records, and asking them to wait a minute
 * between them is the tool refusing to be used. What has to be stopped here is
 * not the second request, it is the two-hundredth — the visitor who has quietly
 * become a proxy for somebody else's scan.
 */

/** Timestamps within the window, newest last, per scope and address. */
const bursts = new Map<string, number[]>();

const MAX_BURST_KEYS = 2_000;

/**
 * Allows `limit` requests per `windowMs` from one caller, rather than one.
 *
 * The verdict is the same shape the forms return, so a route can refuse with
 * `tooSoon` either way.
 */
export function takeBurst(
  scope: string,
  address: string,
  limit: number,
  windowMs: number,
): RateVerdict {
  const now = Date.now();
  const key = `${scope}:${address}`;

  /* Swept on write, like the map above: an address that stopped calling has
     nothing to expire, and no timer should run for the life of the process. */
  if (bursts.size > MAX_BURST_KEYS) {
    for (const [other, hits] of bursts) {
      if (hits.length === 0 || now - hits[hits.length - 1]! >= windowMs) bursts.delete(other);
    }
  }

  const hits = (bursts.get(key) ?? []).filter((at) => now - at < windowMs);

  if (hits.length >= limit) {
    const oldest = hits[0]!;
    bursts.set(key, hits);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }

  hits.push(now);
  bursts.set(key, hits);
  return { ok: true };
}

/** Forgets every caller. Exists for the checks, which must not see each other. */
export function clearRateLimits() {
  seen.clear();
  bursts.clear();
}
