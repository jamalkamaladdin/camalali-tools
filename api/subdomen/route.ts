/*
 * The certificate transparency lookup behind the subdomain tool.
 *
 * The folding happens here rather than in the browser for one measured reason:
 * crt.sh answers with one row per certificate, and a domain that has renewed
 * for years answers in megabytes to say a few dozen names. The visitor gets
 * the names.
 *
 * The domain is validated before it is spliced into the outside address —
 * without that this endpoint is a scanner with somebody else's return address
 * on it, and crt.sh is a free service that would be right to block us for it.
 */
import { cached } from "../../lib/api-cache";
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { collectSubdomains, parseCrtRows, readDomain } from "../../lib/subdomen";

const SERVICE = "crt.sh";

/*
 * Ten minutes. A certificate log is append-only and a new certificate appears
 * minutes to hours after it is issued, so nothing is lost by not asking twice
 * — and crt.sh is slow enough under load that a repeat query is the single
 * most expensive thing this tool can do to it.
 */
const CACHE_TTL_MS = 10 * 60_000;

/* See the password route: `cached` remembers a returned value and forgets a
   thrown one, so an outage must leave by throwing. The name separates our own
   sentence from any other error's text. */
const FAILURE = "UpstreamFailure";

function refuse(message: string): never {
  const error = new Error(message);
  error.name = FAILURE;
  throw error;
}

export async function GET(request: Request) {
  const refused = guard(request, "subdomen");
  if (refused) return refused;

  const checked = readDomain(new URL(request.url).searchParams.get("domen") ?? "");
  if (!checked.ok) return fail(checked.error);

  const { domain } = checked;

  const loaded = await cached(`subdomen:${domain}`, CACHE_TTL_MS, async () => {
    const result = await upstream(
      `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
    );
    if (!result.ok) refuse(upstreamMessage(SERVICE, result));

    /* crt.sh returns an HTML error page under load with a 200 on it, so a
       successful status is not the same as a successful answer. */
    const rows = parseCrtRows(result.text);
    if (rows === null) {
      refuse(`${SERVICE} oxunaqlı cavab vermədi: bu, adətən onun yüklü olduğunu göstərir.`);
    }

    return collectSubdomains(rows, domain);
  })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({
      ok: false as const,
      message:
        error instanceof Error && error.name === FAILURE
          ? error.message
          : `${SERVICE} ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.`,
    }));

  if (!loaded.ok) return fail(loaded.message, 502);

  return ok(loaded.result);
}
