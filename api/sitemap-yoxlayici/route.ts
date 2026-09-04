import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  MAX_SITEMAP_BYTES,
  parseSitemapDocument,
  type SitemapReport,
} from "../../lib/sitemap-yoxlayici";
import { fetchPublicText } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * Fetches a sitemap or a feed a stranger chose and reads it.
 *
 * Same four rules as `basliqlar`, written out in that route's header comment:
 * http/https on ports 80 and 443 only, every resolved address must be public,
 * redirects are reported rather than followed, and the far end's own error
 * text never reaches the visitor. `fetchPublicText` enforces the first three.
 *
 * Two things are specific to this tool.
 *
 * The body has to be read, so it has a budget - 5 MB, against a protocol
 * ceiling of 50 MB. That is a deliberate shortfall rather than a mistake: a
 * sitemap large enough to need the other 45 MB is one nobody is going to read
 * in a browser anyway, and a 50 MB allowance would let one visitor make this
 * process allocate 50 MB per click. Whatever is cut is declared cut, and the
 * tool refuses to present a partial count as a total.
 *
 * A sitemap index is listed and never followed. One click on a 500-entry index
 * would otherwise become 500 requests from this server to somebody else's -
 * an amplifier with a nice interface - and it would spend the visitor's whole
 * rate-limit window in one go. The children are shown as addresses the visitor
 * can check one at a time, which is the same work at a pace the far end can
 * live with.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* One tenth of the protocol ceiling. See the note above. */
const MAX_BYTES = 5_242_880;

/* A sitemap changes when a build publishes, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const XML_ACCEPT =
  "application/xml,text/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8";

/*
 * How many rows travel to the browser. The parse keeps every URL, because the
 * counts, the duplicate check and the date range are all over the whole file;
 * only the sample the table draws is cut. A 50 000-row table is several
 * megabytes of JSON and a page nobody scrolls.
 */
const SAMPLE_LIMIT = 200;

export type SitemapPayload = {
  url: string;
  status: number;
  redirectedTo: string | null;
  contentType: string | null;
  checkedAt: string;
  /** Counts over the whole document, not over the sample below. */
  urlCount: number;
  childCount: number;
  withLastmod: number;
  withChangefreq: number;
  withPriority: number;
  sampleLimit: number;
  /** `urls` and `childSitemaps` hold at most `sampleLimit` rows. */
  report: SitemapReport;
};

type Outcome =
  | { ok: true; payload: SitemapPayload }
  | { ok: false; message: string; status: 400 | 502 };

function headerOf(headers: [string, string][], name: string): string | null {
  const found = headers.find(([key]) => key.toLowerCase() === name);
  return found === undefined ? null : found[1];
}

function looksLikeXml(contentType: string | null): boolean {
  if (contentType === null) return false;
  return /xml|rss|atom/i.test(contentType);
}

/** Findings about the HTTP answer, as opposed to about the document. */
function responseIssues(
  status: number,
  redirectedTo: string | null,
  contentType: string | null,
  contentLength: string | null,
): SitemapReport["issues"] {
  const issues: SitemapReport["issues"] = [];

  if (redirectedTo !== null) {
    issues.push({
      severity: "xeta",
      message: `Ünvan ${status} yönləndirməsi qaytardı və faylın özü açılmadı. Yönləndirmə izlənmir — «${redirectedTo}» ünvanını olduğu kimi kopyalayıb yenidən yoxla.`,
    });
  } else if (status !== 200) {
    issues.push({
      severity: "xeta",
      message: `Fayl HTTP ${status} qaytardı. Sitemap 200 qaytarmalıdır — axtarış robotu da eyni cavabı alacaq və faylı oxumayacaq.`,
    });
  }

  if (redirectedTo === null && !looksLikeXml(contentType)) {
    issues.push({
      severity: "xeberdarliq",
      message: `Cavabın növü «${contentType ?? "bildirilməyib"}» — XML deyil. Bir çox robot bunu qəbul edir, amma düzgün dəyər «application/xml» və ya «text/xml»-dir.`,
    });
  }

  const declared = Number.parseInt(contentLength ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_SITEMAP_BYTES) {
    issues.push({
      severity: "xeberdarliq",
      message: `Fayl ${Math.round(declared / 1_048_576)} MB-dır — protokolun həddi 50 MB-dır. Faylı bölüb sitemap indeksi ilə birləşdirmək lazımdır.`,
    });
  }

  return issues;
}

function counted(report: SitemapReport): Pick<
  SitemapPayload,
  "urlCount" | "childCount" | "withLastmod" | "withChangefreq" | "withPriority"
> {
  return {
    urlCount: report.urls.length,
    childCount: report.childSitemaps.length,
    withLastmod: report.urls.filter((url) => url.lastmod !== null).length,
    withChangefreq: report.urls.filter((url) => url.changefreq !== null).length,
    withPriority: report.urls.filter((url) => url.priority !== null).length,
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "sitemap-yoxlayici");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`sitemap:${target.url}`, CACHE_TTL_MS, async () => {
    const fetched = await fetchPublicText(target.url, { maxBytes: MAX_BYTES, accept: XML_ACCEPT });
    if (!fetched.ok) return { ok: false, message: fetched.message, status: fetched.status };

    const contentType = headerOf(fetched.headers, "content-type");
    const report = parseSitemapDocument(fetched.text, fetched.url, fetched.truncated);
    const stats = counted(report);

    report.issues.unshift(
      ...responseIssues(
        fetched.status,
        fetched.redirectedTo,
        contentType,
        headerOf(fetched.headers, "content-length"),
      ),
    );

    return {
      ok: true,
      payload: {
        url: fetched.url,
        status: fetched.status,
        redirectedTo: fetched.redirectedTo,
        contentType,
        checkedAt: new Date().toISOString(),
        ...stats,
        sampleLimit: SAMPLE_LIMIT,
        report: {
          ...report,
          urls: report.urls.slice(0, SAMPLE_LIMIT),
          childSitemaps: report.childSitemaps.slice(0, SAMPLE_LIMIT),
        },
      },
    };
  });

  return result.ok ? ok(result.payload) : fail(result.message, result.status);
}
