import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  auditRobots,
  parseRobotsText,
  type RobotsLiveReport,
} from "../../lib/robots-canli";
import { fetchPublicText, type SafeText } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The live robots.txt endpoint.
 *
 * Same fence as every other tool that fetches a typed address, and for the same
 * reason: unguarded it is an open proxy wearing this server's address. Scheme,
 * port and DNS are checked by `normalizeTargetUrl` and `fetchPublicText`, and
 * the body is read against a byte budget rather than into memory whole.
 *
 * Two things are specific to this file:
 *
 *   - The path is ours, not the visitor's. Whatever they type is reduced to a
 *     host and `/robots.txt` is appended, so this endpoint cannot be pointed at
 *     an arbitrary path on an arbitrary server the way a generic fetcher could.
 *   - Redirects ARE followed here, up to three, which `basliqlar` refuses to
 *     do. That is not a relaxation of the fence: each step goes back through
 *     `fetchPublicText`, so the scheme, port and DNS checks run again on every
 *     address. It is allowed because redirecting `sayt.com/robots.txt` to
 *     `www.sayt.com/robots.txt` is normal and correct, and a tool that reported
 *     "301" instead of the file would be wrong about most of the web.
 *
 * A 404 is a result, not a failure: a site with no robots.txt is a site where
 * every page is open to every crawler, and saying so plainly is the honest
 * answer rather than an error the visitor has to interpret.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* robots.txt changes on a deploy, not between two clicks. */
const CACHE_TTL_MS = 300_000;

/* Google reads the first 500 KB and ignores the rest; 512 KB is that plus room
   to see that the limit was passed, which is itself a finding. */
const MAX_BYTES = 512 * 1024;

/* Enough for http -> https -> www, which is the chain nearly every one of these
   turns out to be. Past that the file is not being served where it belongs. */
const MAX_REDIRECTS = 3;

type Outcome =
  | { ok: true; report: RobotsLiveReport }
  | { ok: false; message: string; status: 400 | 502 };

function headerValue(headers: [string, string][], name: string): string | null {
  const found = headers.find(([key]) => key.toLowerCase() === name);
  return found ? found[1] : null;
}

/**
 * Fetches the file, stepping through a redirect at most `MAX_REDIRECTS` times.
 *
 * Every step is a fresh `fetchPublicText`, which is what keeps the address
 * checks on each hop rather than only on the first.
 */
async function readRobots(
  url: string,
): Promise<SafeText | { ok: false; message: string; status: 400 | 502 }> {
  let current = url;

  for (let step = 0; step <= MAX_REDIRECTS; step += 1) {
    const fetched = await fetchPublicText(current, { maxBytes: MAX_BYTES, accept: "text/plain" });
    if (!fetched.ok) return fetched;

    if (fetched.redirectedTo !== null && step < MAX_REDIRECTS) {
      current = fetched.redirectedTo;
      continue;
    }

    return fetched;
  }

  /* Unreachable: the loop either returns or reaches `step === MAX_REDIRECTS`,
     where the redirect branch is closed. Kept so the function has one type. */
  return { ok: false, message: "robots.txt zənciri həddindən uzundur.", status: 502 };
}

export async function GET(request: Request) {
  const refused = guard(request, "robots-canli");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  /* The visitor's path, query and everything else is dropped: only the host
     survives. A bare host normalises to https, and an explicitly typed `http://`
     is honoured for the sites that still only answer there. */
  const robotsUrl = `${target.protocol}//${new URL(target.url).host}/robots.txt`;

  const result = await cached<Outcome>(`robots-canli:${robotsUrl}`, CACHE_TTL_MS, async () => {
    const fetched = await readRobots(robotsUrl);
    if (!fetched.ok) return { ok: false, message: fetched.message, status: fetched.status };

    /* A 404 body is somebody's error page, not a robots.txt. Parsing it would
       invent groups out of prose, so the text is dropped and the audit says
       plainly that there is no file. */
    const text = fetched.status >= 400 ? "" : fetched.text;
    const contentType = headerValue(fetched.headers, "content-type");
    const byteLength = new TextEncoder().encode(text).length;
    const doc = parseRobotsText(text);

    return {
      ok: true,
      report: {
        url: fetched.url,
        status: fetched.status,
        contentType,
        byteLength,
        text,
        truncated: fetched.truncated,
        doc,
        issues: auditRobots(doc, { status: fetched.status, contentType, byteLength, text }),
        checkedAt: new Date().toISOString(),
      },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
