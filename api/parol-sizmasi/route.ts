/*
 * The prefix relay behind the password check.
 *
 * What this route does is small, and what it does NOT do is the point: it
 * never sees a password and it never sees a whole hash. The browser computes
 * the SHA-1, keeps thirty-five of its forty characters to itself, and asks
 * here for everything the breach index knows about the other five. The answer
 * — roughly two thousand hashes, one of which may be the visitor's — is handed
 * back whole, and the match is found beside the password that produced it.
 *
 * That is also why the accepted input is exactly one shape and nothing else.
 * A route that forwards a visitor's string to an outside address is an open
 * proxy unless the string is pinned down, and five hex characters is as pinned
 * down as an input gets.
 */
import { cached } from "../../lib/api-cache";
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { isValidPrefix, normalisePrefix } from "../../lib/parol-sizmasi";

const SERVICE = "Have I Been Pwned";

/*
 * Short on purpose. A range body is around 77 KB and the cache is shared with
 * every other network tool, so an hour-long window would let a few hundred
 * prefixes crowd everything else out of it. Ten minutes covers the repeat this
 * cache actually sees — one visitor trying three variants of the same password
 * — and the breach corpus does not change inside a day anyway.
 */
const CACHE_TTL_MS = 10 * 60_000;

/* `cached` keeps whatever the loader returns and forgets whatever it throws,
   so a failed lookup has to leave as an exception or the tool stays broken for
   the rest of the window. The name is the marker: it tells our own Azerbaijani
   sentence apart from any other error, whose text a stranger must not read. */
const FAILURE = "UpstreamFailure";

function refuse(message: string): never {
  const error = new Error(message);
  error.name = FAILURE;
  throw error;
}

export async function GET(request: Request) {
  const refused = guard(request, "parol-sizmasi");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("prefix") ?? "";
  if (!isValidPrefix(raw)) {
    return fail("Prefiks dəqiq 5 onaltılıq simvol olmalıdır (0–9, a–f).");
  }

  const prefix = normalisePrefix(raw);

  const loaded = await cached(`parol-sizmasi:${prefix}`, CACHE_TTL_MS, async () => {
    const result = await upstream(
      `https://api.pwnedpasswords.com/range/${encodeURIComponent(prefix)}`,
    );
    if (!result.ok) refuse(upstreamMessage(SERVICE, result));
    return result.text;
  })
    .then((range) => ({ ok: true as const, range }))
    .catch((error: unknown) => ({
      ok: false as const,
      message:
        error instanceof Error && error.name === FAILURE
          ? error.message
          : `${SERVICE} ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.`,
    }));

  if (!loaded.ok) return fail(loaded.message, 502);

  // The body goes back untouched. Counting the visitor's suffix here would be
  // one line shorter and would break the only promise this tool makes.
  return ok({ prefix, range: loaded.range });
}
