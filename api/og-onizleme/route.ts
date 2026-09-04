import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  auditOpenGraph,
  buildCards,
  extractOpenGraph,
  type OgCard,
  type OgExtract,
  type OgIssue,
} from "../../lib/og-onizleme";
import { fetchPublicText } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * Fetches a page a stranger chose and reads its sharing metadata.
 *
 * Same four rules as `basliqlar`, written out in that route's header comment:
 * http/https on ports 80 and 443 only, every resolved address must be public,
 * redirects are reported rather than followed, and the far end's own error
 * text never reaches the visitor. `fetchPublicText` enforces the first three.
 *
 * The fourth rule is where this route differs from that one, and it is the
 * reason `maxBytes` is not optional here. `basliqlar` wants no body at all and
 * cancels it; this tool has to read one, which means a stranger's server gets
 * to decide how many bytes this process allocates. The budget is the answer:
 * the tags live in `<head>`, so 256 KB reaches them on any page that is not
 * deliberately hostile, and a server streaming gigabytes gets cut at a quarter
 * of a megabyte instead of filling memory.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Enough for the head of any real page. Measured against the heaviest pages
 * this is pointed at: markup before `</head>` is a few tens of kilobytes even
 * on sites that inline their critical CSS, so the budget is roughly an order
 * of magnitude of headroom - and a page that puts its og tags past 256 KB has
 * a problem the scrapers will hit before this tool does.
 */
const MAX_BYTES = 262_144;

/* Sharing tags change when somebody deploys, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";

export type OgReport = {
  url: string;
  status: number;
  redirectedTo: string | null;
  contentType: string | null;
  /** True when the 256 KB budget ran out before the page did. */
  truncated: boolean;
  checkedAt: string;
  data: OgExtract;
  issues: OgIssue[];
  cards: OgCard[];
};

type Outcome =
  | { ok: true; report: OgReport }
  /* 400 is the visitor's address being wrong, 502 is the far end failing. */
  | { ok: false; message: string; status: 400 | 502 };

function looksLikeHtml(contentType: string | null): boolean {
  if (contentType === null) return true;
  return /text\/html|application\/xhtml/i.test(contentType);
}

function headerOf(headers: [string, string][], name: string): string | null {
  const found = headers.find(([key]) => key.toLowerCase() === name);
  return found === undefined ? null : found[1];
}

export async function GET(request: Request) {
  const refused = guard(request, "og-onizleme");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`og-onizleme:${target.url}`, CACHE_TTL_MS, async () => {
    const fetched = await fetchPublicText(target.url, { maxBytes: MAX_BYTES, accept: HTML_ACCEPT });
    if (!fetched.ok) return { ok: false, message: fetched.message, status: fetched.status };

    const contentType = headerOf(fetched.headers, "content-type");
    const data = extractOpenGraph(fetched.text, fetched.url);
    const issues = auditOpenGraph(data, fetched.url);

    /* Response-level findings are prepended rather than folded into the audit:
       they are about the answer, not about the markup, and the audit stays a
       pure function of the markup so its cases can be proved without a
       server. */
    if (fetched.redirectedTo !== null) {
      issues.unshift({
        severity: "xeta",
        message: `Ünvan ${fetched.status} yönləndirməsi qaytardı və səhifənin özü açılmadı. Yönləndirmə izlənmir — «${fetched.redirectedTo}» ünvanını olduğu kimi kopyalayıb yenidən yoxla.`,
      });
    } else if (fetched.status !== 200) {
      issues.unshift({
        severity: "xeta",
        message: `Səhifə HTTP ${fetched.status} qaytardı. Paylaşım robotları da eyni cavabı alacaq və kartı ümumiyyətlə qurmayacaq.`,
      });
    }

    if (!looksLikeHtml(contentType)) {
      issues.unshift({
        severity: "xeberdarliq",
        message: `Cavabın növü «${contentType}» — HTML deyil. Meta teqləri yalnız HTML səhifədə axtarmaq mənalıdır.`,
      });
    }

    return {
      ok: true,
      report: {
        url: fetched.url,
        status: fetched.status,
        redirectedTo: fetched.redirectedTo,
        contentType,
        truncated: fetched.truncated,
        checkedAt: new Date().toISOString(),
        data,
        issues,
        cards: buildCards(data, fetched.url),
      },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
