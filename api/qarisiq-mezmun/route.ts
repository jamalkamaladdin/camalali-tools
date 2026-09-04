import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildMixedContentReport, type MixedContentReport } from "../../lib/qarisiq-mezmun";
import { fetchPublicText } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * Fetches a page a stranger chose and scans its own HTML text for `http://`
 * resources — the same four rules every tool that fetches a typed address
 * follows, written out in full in `robots-canli`'s route: scheme and port are
 * restricted by `normalizeTargetUrl`, every resolved address must be public,
 * redirects are reported rather than chased, and the far end's own error text
 * never reaches the visitor. `fetchPublicText` enforces the first three.
 *
 * A mixed-content finding can live anywhere in the document, not only in
 * `<head>` the way sharing metadata does, so the byte budget here is the
 * library default (512 KB) rather than `og-onizleme`'s head-sized one — and a
 * page longer than that is reported as truncated rather than pretending the
 * scan was complete.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A page's markup changes on a deploy, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";

export type QarisiqMezmunReport = MixedContentReport & {
  url: string;
  status: number;
  truncated: boolean;
  checkedAt: string;
};

type Outcome =
  | { ok: true; report: QarisiqMezmunReport }
  /* 400 is the visitor's address being wrong, 502 is the far end failing. */
  | { ok: false; message: string; status: 400 | 502 };

function headerOf(headers: [string, string][], name: string): string | null {
  const found = headers.find(([key]) => key.toLowerCase() === name);
  return found === undefined ? null : found[1];
}

export async function GET(request: Request) {
  const refused = guard(request, "qarisiq-mezmun");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`qarisiq-mezmun:${target.url}`, CACHE_TTL_MS, async () => {
    const fetched = await fetchPublicText(target.url, { accept: HTML_ACCEPT });
    if (!fetched.ok) return { ok: false, message: fetched.message, status: fetched.status };

    if (fetched.redirectedTo !== null) {
      return {
        ok: false,
        status: 502,
        message: `Ünvan ${fetched.status} yönləndirməsi qaytardı. Yönləndirmə izlənmir — «${fetched.redirectedTo}» ünvanını olduğu kimi kopyalayıb yenidən yoxla.`,
      };
    }

    const cspHeader = headerOf(fetched.headers, "content-security-policy");
    const report = buildMixedContentReport(fetched.text, fetched.url, cspHeader);

    return {
      ok: true,
      report: {
        ...report,
        url: fetched.url,
        status: fetched.status,
        truncated: fetched.truncated,
        checkedAt: new Date().toISOString(),
      },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
