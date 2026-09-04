import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  evaluateSecurityTxt,
  parseSecurityTxt,
  type SecurityTxtLiveReport,
} from "../../lib/security-txt";
import { fetchPublicText, type SafeText } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The live security.txt endpoint. Same fence as `robots-canli`, for the same
 * reason and built the same way: `normalizeTargetUrl` and `fetchPublicText`
 * check scheme, port and DNS on every hop, and the body is read against a
 * byte budget rather than into memory whole.
 *
 * One thing is specific to this file: RFC 9116 names two locations and gives
 * them an explicit priority. `/.well-known/security.txt` is the current
 * standard location and is always tried first; the bare `/security.txt` at
 * the root is the location the RFC calls deprecated, kept only so an older
 * file is still found. Both paths are ours, never the visitor's — whatever
 * they type is reduced to a host, exactly as in `robots-canli`.
 *
 * A 404 at both locations is a result, not a failure: the report says plainly
 * that neither file exists rather than surfacing an HTTP error, the same way
 * a missing robots.txt is reported as an open crawl policy rather than a
 * broken one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* security.txt changes on a deploy, not between two clicks. */
const CACHE_TTL_MS = 300_000;

/* Comfortably more than any real security.txt — these are a handful of
   contact lines, not a document. */
const MAX_BYTES = 64 * 1024;

/* Enough for http -> https -> www, the same allowance `robots-canli` gives. */
const MAX_REDIRECTS = 3;

type Fetched = SafeText | { ok: false; message: string; status: 400 | 502 };

async function readOnce(url: string): Promise<Fetched> {
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
  return { ok: false, message: "security.txt zənciri həddindən uzundur.", status: 502 };
}

type Outcome = { ok: true; report: SecurityTxtLiveReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "security-txt");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const origin = `${target.protocol}//${new URL(target.url).host}`;
  const wellKnownUrl = `${origin}/.well-known/security.txt`;
  const rootUrl = `${origin}/security.txt`;

  const result = await cached<Outcome>(`security-txt:${origin}`, CACHE_TTL_MS, async () => {
    const tried: { url: string; status: number | null }[] = [];

    const wellKnown = await readOnce(wellKnownUrl);
    if (!wellKnown.ok) return { ok: false, message: wellKnown.message, status: wellKnown.status };
    tried.push({ url: wellKnownUrl, status: wellKnown.status });

    let chosen: SafeText | null = wellKnown.status < 400 ? wellKnown : null;
    let foundAt: "well-known" | "root" | null = chosen ? "well-known" : null;

    if (!chosen) {
      const root = await readOnce(rootUrl);
      if (!root.ok) return { ok: false, message: root.message, status: root.status };
      tried.push({ url: rootUrl, status: root.status });
      if (root.status < 400) {
        chosen = root;
        foundAt = "root";
      }
    }

    const checkedAt = new Date().toISOString();

    if (!chosen) {
      return {
        ok: true,
        report: {
          tried,
          foundAt: null,
          url: null,
          status: null,
          text: "",
          truncated: false,
          doc: null,
          evaluation: null,
          checkedAt,
        },
      };
    }

    const doc = parseSecurityTxt(chosen.text);
    const evaluation = evaluateSecurityTxt(doc, new Date());

    return {
      ok: true,
      report: {
        tried,
        foundAt,
        url: chosen.url,
        status: chosen.status,
        text: chosen.text,
        truncated: chosen.truncated,
        doc,
        evaluation,
        checkedAt,
      },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
