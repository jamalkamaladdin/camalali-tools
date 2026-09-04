import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { parseDomainName, parseWhoisPayload, type WhoisReport } from "../../lib/whois";

/*
 * The RDAP whois endpoint.
 *
 * `rdap.org/domain/<name>` is IANA's free bootstrap: it holds no domain data
 * itself and redirects to whichever registry is authoritative for the TLD.
 * `upstream()` — the module every other network tool's route is built on —
 * follows redirects on its own and, on a non-2xx final answer, hands back
 * only `{ ok: false, status }`, with no way to tell whether a redirect ever
 * happened. That collapses two genuinely different outcomes into the same
 * 404: a TLD with no RDAP service at all, and a TLD whose registry answered
 * and said the domain is not registered. Confusing the two is exactly the
 * "domain not found" claim the tool must not make when the truth is "this
 * registry publishes nothing here".
 *
 * So the first hop is read by hand, with `redirect: "manual"`, before
 * `upstream()` is asked to fetch the actual record — the only way to see
 * whether rdap.org itself is answering or handing off.
 *
 * Measured directly against rdap.org (2026-09-03), redirects included:
 *
 *   curl -s -o /dev/null -w '%{http_code}' https://rdap.org/domain/example.az
 *     -> 404, no Location header. `.az` is not in IANA's RDAP bootstrap
 *        registry (data.iana.org/rdap/dns.json) at all — same for `.io`.
 *   curl -s -o /dev/null -w '%{http_code}' https://rdap.org/domain/example.com
 *     -> 302, Location: https://rdap.verisign.com/com/v1/domain/example.com
 *        (which itself answers 200 with the domain record).
 *   curl -s -o /dev/null -w '%{http_code}' \
 *     https://rdap.org/domain/nonexistent-domain-xyz-123456789zzqq.com
 *     -> 302 to the same Verisign host, which itself answers 404 — a
 *        redirect happened, so this is "not registered", not "no service".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Registration data does not move between two clicks a minute apart — a
   transfer or an expiry is a matter of weeks, not minutes. */
const CACHE_TTL_MS = 30 * 60_000;

const BOOTSTRAP_TIMEOUT_MS = 8_000;

const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";
const RDAP_ACCEPT = "application/rdap+json, application/json";

type Bootstrap =
  | { kind: "redirect"; location: string }
  | { kind: "no-service" }
  | { kind: "failed" };

/** Reads only the first hop of the bootstrap redirect, never following it. */
async function checkBootstrap(domain: string): Promise<Bootstrap> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), BOOTSTRAP_TIMEOUT_MS);

  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: control.signal,
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept: RDAP_ACCEPT },
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      return { kind: "redirect", location };
    }
    if (response.status === 404) return { kind: "no-service" };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(deadline);
  }
}

type Outcome =
  | { ok: true; report: WhoisReport }
  | { ok: false; message: string; status: 400 | 404 | 502 };

async function lookup(domain: string, tld: string): Promise<Outcome> {
  const bootstrap = await checkBootstrap(domain);

  if (bootstrap.kind === "no-service") {
    return {
      ok: false,
      message: `«.${tld}» zonasının reyestri RDAP xidməti dərc etmir: bu, domenin qeydə alınmadığı demək deyil, sadəcə bu yolla oxunacaq açıq qeydiyyat qeydi yoxdur.`,
      status: 404,
    };
  }

  if (bootstrap.kind === "failed") {
    return {
      ok: false,
      message: "rdap.org bootstrap xidməti vaxtında cavab vermədi. Bir azdan yenidən yoxla.",
      status: 502,
    };
  }

  const record = await upstream(bootstrap.location, { headers: { accept: RDAP_ACCEPT } });
  if (!record.ok) {
    if (record.reason === "status" && record.status === 404) {
      return {
        ok: false,
        message: `«${domain}» reyestrdə qeydə alınmayıb.`,
        status: 404,
      };
    }
    return { ok: false, message: upstreamMessage("RDAP reyestri", record), status: 502 };
  }

  const parsed = parseWhoisPayload(record.text, new Date());
  if (!parsed.ok) return { ok: false, message: parsed.error, status: 502 };

  return { ok: true, report: parsed.report };
}

export async function GET(request: Request) {
  const refused = guard(request, "whois");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parseDomainName(url.searchParams.get("domen") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  const { domain, tld } = parsed;

  const result = await cached(`whois:${domain}`, CACHE_TTL_MS, () => lookup(domain, tld));

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
