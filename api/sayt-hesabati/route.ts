import { fail, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { callerAddress, takeBurst, tooSoon } from "../../shared/rate-limit";
import { fetchPublicText, publicAddressesOnly, type SafeText } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";
import { inspectTls, resolveHost } from "../../lib/socket-probe";
import { parseRobotsText } from "../../lib/robots-canli";
import {
  buildSiteReport,
  type FetchedFile,
  type HttpProbe,
  type SiteReportPayload,
} from "../../lib/site-report";

/*
 * The combined report: one address in, twenty verdicts out.
 *
 * Every other network tool here costs one outside request per click. This one
 * is the exception and it has to be budgeted rather than assumed, because a
 * single click is an amplifier by construction: the page itself, the plain
 * http version of it, robots.txt, sitemap.xml, and one TLS handshake for the
 * certificate the fetch API does not expose. Five connections, named here so
 * the number cannot quietly grow — the fifth is a handshake rather than a
 * request, and it exists because there is no other way to read an expiry date.
 *
 * Two consequences follow from that budget.
 *
 * The rate limit is its own, tighter than `guard()` in `api-route.ts` gives
 * the ordinary tools. Twenty clicks a minute is right for a tool that makes
 * one request; here the same twenty would be a hundred connections to
 * somebody else's server in sixty seconds, which is a load test with a nice
 * interface. Five a minute is the same generosity measured in the unit that
 * actually leaves this machine.
 *
 * And the requests run one after another, not together. Four simultaneous
 * connections read as a burst to any origin that counts them; sequential is
 * both closer to what a browser does and the only order in which robots.txt
 * can name the sitemap that is fetched next.
 *
 * The fence is the one every tool built on `safe-fetch.ts` has: http and https
 * only on ports 80 and 443, every resolved address must be public, redirects
 * are reported rather than followed, and the body is read through a byte
 * budget. The far end's own error text never reaches the visitor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Five reports a minute, because each one is five connections. */
const BURST_LIMIT = 5;
const BURST_WINDOW_MS = 60_000;

/* A report is a snapshot of a deployment, not of a moment. Five minutes is
   long enough that an impatient second click costs nothing and short enough
   that a fix made now is visible before coffee. */
const CACHE_TTL_MS = 300_000;

/* Half a megabyte of markup. Past this the HTML size check has its answer
   already, so reading further would only spend memory to confirm it. */
const MAX_HTML_BYTES = 512 * 1024;

/* robots.txt is a text file with a handful of lines; anything approaching this
   is a generated blocklist nobody reads to the end anyway. */
const MAX_ROBOTS_BYTES = 256 * 1024;

/* Enough for a sitemap of a few tens of thousands of URLs. The dedicated
   sitemap tool reads five times more; here only the count and the format are
   wanted. */
const MAX_SITEMAP_BYTES = 1_048_576;

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
const TEXT_ACCEPT = "text/plain,*/*;q=0.8";
const XML_ACCEPT = "application/xml,text/xml;q=0.9,*/*;q=0.8";

type Outcome =
  | { ok: true; payload: SiteReportPayload }
  | { ok: false; message: string; status: 400 | 502 };

/**
 * Fetches one of the two side files and turns any refusal into a sentence.
 *
 * A missing robots.txt or sitemap is a finding rather than an error, so this
 * never fails the whole report: the file comes back with `error` filled in and
 * the check that reads it decides how much that matters.
 */
async function sideFile(
  url: string,
  maxBytes: number,
  accept: string,
): Promise<FetchedFile> {
  const fetched = await fetchPublicText(url, { maxBytes, accept });

  if (!fetched.ok) {
    return { url, status: 0, text: "", truncated: false, error: `${fetched.message}` };
  }

  if (fetched.redirectedTo !== null) {
    return {
      url,
      status: fetched.status,
      text: "",
      truncated: false,
      error: `Ünvan ${fetched.status} ilə «${fetched.redirectedTo}» ünvanına yönləndirir və faylın özü açılmadı.`,
    };
  }

  if (fetched.status !== 200) {
    return {
      url,
      status: fetched.status,
      text: "",
      truncated: false,
      error: `Ünvan HTTP ${fetched.status} qaytardı.`,
    };
  }

  return {
    url,
    status: fetched.status,
    text: fetched.text,
    truncated: fetched.truncated,
    error: null,
  };
}

/**
 * Asks the plain-http side of the same address whether it redirects.
 *
 * Only the status line and `Location` are wanted, so the body is asked for
 * with a zero budget and cancelled unread. A port 80 that answers nothing is
 * a result too, not a failure — the check phrases it.
 */
async function probeHttp(httpsUrl: string): Promise<HttpProbe & { url: string }> {
  const parsed = new URL(httpsUrl);
  parsed.protocol = "http:";
  parsed.port = "";
  const url = parsed.toString();

  const fetched = await fetchPublicText(url, { maxBytes: 0, accept: HTML_ACCEPT });
  if (!fetched.ok) return { url, reachable: false, status: 0, location: null };

  return {
    url,
    reachable: true,
    status: fetched.status,
    location: fetched.redirectedTo,
  };
}

/**
 * Reads the leaf certificate's remaining days.
 *
 * `fetch` completes a handshake and then throws the certificate away, so the
 * one number this check needs is only reachable through a second connection.
 * A failure here is silent on purpose: the check turns a null into its own
 * sentence, and one unreachable handshake must not cost the other nineteen
 * rows.
 */
async function readCertificate(
  hostname: string,
  port: number,
): Promise<{ daysLeft: number; issuer: string } | null> {
  const resolved = await resolveHost(hostname);
  if (!resolved.ok) return null;

  const tls = await inspectTls({ address: resolved.primary.address, servername: hostname, port });
  if (!tls.ok) return null;

  const leaf = tls.chain[0];
  if (leaf === undefined) return null;

  return { daysLeft: leaf.daysLeft, issuer: leaf.issuer };
}

/** The sitemap robots.txt declares, when it names one on the same host. */
function declaredSitemap(robots: FetchedFile, hostname: string): string | null {
  if (robots.error !== null) return null;

  for (const entry of parseRobotsText(robots.text).sitemaps) {
    try {
      const parsed = new URL(entry.url);
      /* A sitemap on another host is legal and is somebody else's file; this
         report grades one site, so it stays on the host it was given. */
      if (parsed.hostname === hostname) return parsed.toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function buildPayload(target: {
  url: string;
  hostname: string;
  protocol: "http:" | "https:";
}): Promise<Outcome> {
  const blocked = await publicAddressesOnly(target.hostname);
  if (blocked) return { ok: false, message: blocked, status: 400 };

  const secure = target.protocol === "https:";

  /* 1. The page itself. Measured around the call rather than inside it: the
     number is the whole response, which is what the check calls it. */
  const startedAt = Date.now();
  const page: SafeText | { ok: false; message: string; status: 400 | 502 } =
    await fetchPublicText(target.url, { maxBytes: MAX_HTML_BYTES, accept: HTML_ACCEPT });
  const responseMs = Date.now() - startedAt;

  if (!page.ok) return { ok: false, message: page.message, status: page.status };

  if (page.redirectedTo !== null) {
    return {
      ok: false,
      status: 400,
      message: `Ünvan ${page.status} ilə «${page.redirectedTo}» ünvanına yönləndirir. Yönləndirmə izlənmir — həmin ünvanı olduğu kimi kopyalayıb yenidən yoxla.`,
    };
  }

  if (page.status >= 400) {
    return {
      ok: false,
      status: 400,
      message: `Səhifə HTTP ${page.status} qaytardı — hesabat qurmaq üçün açıq bir səhifə lazımdır.`,
    };
  }

  /* 2. The certificate, and 3. the plain-http side. Both only mean something
     when the page arrived over TLS; on an http address they are skipped and
     the report costs two connections instead of five. */
  const parsed = new URL(target.url);
  const port = parsed.port === "" ? 443 : Number.parseInt(parsed.port, 10);
  const certificate = secure ? await readCertificate(target.hostname, port) : null;
  const probe = secure ? await probeHttp(target.url) : null;

  /* 4. robots.txt, then 5. the sitemap it points at. */
  const origin = new URL(target.url).origin;
  const robots = await sideFile(new URL("/robots.txt", origin).toString(), MAX_ROBOTS_BYTES, TEXT_ACCEPT);
  const sitemapUrl =
    declaredSitemap(robots, target.hostname) ?? new URL("/sitemap.xml", origin).toString();
  const sitemap = await sideFile(sitemapUrl, MAX_SITEMAP_BYTES, XML_ACCEPT);

  const report = buildSiteReport({
    url: page.url,
    hostname: target.hostname,
    status: page.status,
    redirectedTo: page.redirectedTo,
    headers: page.headers,
    html: page.text,
    htmlTruncated: page.truncated,
    responseMs,
    httpProbe: probe === null ? null : { reachable: probe.reachable, status: probe.status, location: probe.location },
    certificate,
    robots,
    sitemap,
    checkedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    payload: {
      report,
      status: page.status,
      redirectedTo: page.redirectedTo,
      httpUrl: probe === null ? null : probe.url,
      robotsUrl: robots.url,
      sitemapUrl: sitemap.url,
    },
  };
}

export async function GET(request: Request) {
  /* Not `guard()`: this route needs a stricter allowance than the shared one,
     and the reason is in the header comment above. */
  const verdict = takeBurst(
    "alet:sayt-hesabati",
    callerAddress(request),
    BURST_LIMIT,
    BURST_WINDOW_MS,
  );
  if (!verdict.ok) return tooSoon(verdict.retryAfter);

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`sayt-hesabati:${target.url}`, CACHE_TTL_MS, () =>
    buildPayload(target),
  );

  return result.ok ? ok(result.payload) : fail(result.message, result.status);
}
