/**
 * Naming the hosting, CDN and CMS behind a site from measured signals only —
 * response headers, the HTML's own `generator` tag, well-known script paths,
 * the DNS `CNAME` chain, and the registry record behind the resolved IP.
 *
 * Every detector below returns zero or one `Detection`, and every
 * `Detection` carries the exact string that triggered it. That pairing is
 * the whole point of the file: a tool that says "Cloudflare" without saying
 * "because the `CF-Ray` header was present" is indistinguishable from one
 * that guessed, and this site does not guess. A signal that matches nothing
 * known produces no detection at all — never a placeholder name.
 *
 * The IP-based signals (`detectFromRdapOrg`) reuse the exact RDAP shape
 * `menim-ip.ts` already parses (`RdapInfo`) rather than re-reading a
 * registry's JSON a second way; only the substring match against known cloud
 * providers is new here.
 */
import type { RdapInfo } from "./menim-ip";
import { attr, collectTags } from "./html";

export type DetectionCategory = "proksi-cdn" | "server-proqrami" | "cercive" | "cms" | "bulud-provayder";

export type Detection = {
  name: string;
  category: DetectionCategory;
  /** The Azerbaijani sentence naming which signal triggered this — shown next to the name, never separately. */
  reason: string;
  /** The exact header, meta content or hostname that matched, verbatim. */
  evidence: string;
};

function dedupe(detections: Detection[]): Detection[] {
  const seen = new Set<string>();
  const out: Detection[] = [];
  for (const detection of detections) {
    const key = `${detection.category}:${detection.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(detection);
  }
  return out;
}

/* ---------- response headers ---------- */

export type HeaderMap = ReadonlyMap<string, string>;

export function toHeaderMap(headers: readonly (readonly [string, string])[]): HeaderMap {
  const map = new Map<string, string>();
  for (const [name, value] of headers) map.set(name.toLowerCase(), value);
  return map;
}

/** The product token off the front of a `Server`-shaped value: `"nginx/1.25.3"` → `"nginx"`, `"Apache/2.4 (Unix)"` → `"Apache"`. */
function leadingProduct(value: string): string {
  const match = /^([A-Za-z][A-Za-z0-9._-]*)/.exec(value.trim());
  return match ? match[1] : value.trim();
}

export function detectFromHeaders(headers: HeaderMap): Detection[] {
  const detections: Detection[] = [];

  const server = headers.get("server");
  const via = headers.get("via");
  const cfRay = headers.get("cf-ray");
  const xVercelId = headers.get("x-vercel-id");
  const xAmzCfId = headers.get("x-amz-cf-id");
  const xServedBy = headers.get("x-served-by");
  const xPoweredBy = headers.get("x-powered-by");

  if (cfRay !== undefined || (server && /cloudflare/i.test(server))) {
    detections.push({
      name: "Cloudflare",
      category: "proksi-cdn",
      reason: cfRay !== undefined ? "CF-Ray başlığı tapıldı" : "Server başlığında «cloudflare» yazılıb",
      evidence: cfRay ?? (server as string),
    });
  }

  if (xVercelId !== undefined || (server && /vercel/i.test(server))) {
    detections.push({
      name: "Vercel",
      category: "bulud-provayder",
      reason: xVercelId !== undefined ? "X-Vercel-Id başlığı tapıldı" : "Server başlığında «vercel» yazılıb",
      evidence: xVercelId ?? (server as string),
    });
  }

  if (xAmzCfId !== undefined) {
    detections.push({
      name: "Amazon CloudFront",
      category: "proksi-cdn",
      reason: "X-Amz-Cf-Id başlığı tapıldı",
      evidence: xAmzCfId,
    });
  }

  if (server && /^amazons3/i.test(server)) {
    detections.push({ name: "Amazon S3", category: "bulud-provayder", reason: "Server başlığı «AmazonS3» ilə başlayır", evidence: server });
  }

  if (xServedBy !== undefined && /fastly/i.test(xServedBy)) {
    detections.push({ name: "Fastly", category: "proksi-cdn", reason: "X-Served-By başlığında «fastly» yazılıb", evidence: xServedBy });
  }

  if (via !== undefined && /varnish/i.test(via)) {
    detections.push({ name: "Varnish", category: "proksi-cdn", reason: "Via başlığında «varnish» yazılıb", evidence: via });
  }

  if (via !== undefined && /google/i.test(via)) {
    detections.push({ name: "Google Frontend", category: "bulud-provayder", reason: "Via başlığında «google» yazılıb", evidence: via });
  }

  if (xPoweredBy !== undefined && xPoweredBy.trim() !== "") {
    detections.push({
      name: leadingProduct(xPoweredBy),
      category: "cercive",
      reason: "X-Powered-By başlığı tapıldı",
      evidence: xPoweredBy,
    });
  }

  /* The generic `Server` fallback runs last and only when nothing more
     specific already claimed it — a bare "nginx" behind Cloudflare is still
     worth reporting as the origin's own server software. */
  if (server && server.trim() !== "" && !/cloudflare|vercel/i.test(server)) {
    detections.push({
      name: leadingProduct(server),
      category: "server-proqrami",
      reason: "Server başlığı tapıldı",
      evidence: server,
    });
  }

  return dedupe(detections);
}

/* ---------- HTML: generator meta and known script/link paths ---------- */

export function extractGeneratorMeta(html: string): string | null {
  for (const tag of collectTags(html, "meta")) {
    const name = (attr(tag, "name") ?? "").toLowerCase();
    if (name !== "generator") continue;
    const content = attr(tag, "content");
    if (content && content.trim() !== "") return content.trim();
  }
  return null;
}

const GENERATOR_MATCHES: [RegExp, string][] = [
  [/wordpress/i, "WordPress"],
  [/joomla/i, "Joomla"],
  [/drupal/i, "Drupal"],
  [/wix\.com/i, "Wix"],
  [/squarespace/i, "Squarespace"],
  [/ghost/i, "Ghost"],
  [/shopify/i, "Shopify"],
  [/hugo/i, "Hugo"],
  [/next\.js/i, "Next.js"],
];

export function detectFromGenerator(generator: string | null): Detection[] {
  if (generator === null) return [];
  for (const [pattern, name] of GENERATOR_MATCHES) {
    if (pattern.test(generator)) {
      return [{ name, category: "cms", reason: "generator meta teqi tapıldı", evidence: generator }];
    }
  }
  /* An unrecognised generator string is still real evidence — reported
     verbatim rather than dropped, which is what "no invented numbers" means
     for a name instead of a figure: the site's own claim, not this tool's. */
  return [{ name: generator, category: "cms", reason: "generator meta teqi tapıldı (naməlum sistem)", evidence: generator }];
}

/** Every `src`/`href` this file cares about, from `<script>` and `<link>` tags — the paths a CMS or CDN leaves behind regardless of what the server headers say. */
export function extractScriptAndLinkPaths(html: string): string[] {
  const paths: string[] = [];
  for (const tag of collectTags(html, "script")) {
    const src = attr(tag, "src");
    if (src) paths.push(src);
  }
  for (const tag of collectTags(html, "link")) {
    const href = attr(tag, "href");
    if (href) paths.push(href);
  }
  return paths;
}

const PATH_MATCHES: [RegExp, string, DetectionCategory][] = [
  [/\/wp-content\//i, "WordPress", "cms"],
  [/\/wp-includes\//i, "WordPress", "cms"],
  [/cdn\.shopify\.com/i, "Shopify", "cms"],
  [/static\.wixstatic\.com/i, "Wix", "cms"],
  [/squarespace\.com|sqsp\.net/i, "Squarespace", "cms"],
  [/\/cdn-cgi\//i, "Cloudflare", "proksi-cdn"],
  [/cloudfront\.net/i, "Amazon CloudFront", "proksi-cdn"],
];

export function detectFromScriptPaths(paths: readonly string[]): Detection[] {
  const detections: Detection[] = [];
  for (const path of paths) {
    for (const [pattern, name, category] of PATH_MATCHES) {
      if (pattern.test(path)) {
        detections.push({ name, category, reason: "səhifədəki script/link ünvanında iz tapıldı", evidence: path });
      }
    }
  }
  return dedupe(detections);
}

/* ---------- DNS CNAME chain ---------- */

const CNAME_MATCHES: [RegExp, string][] = [
  [/vercel-dns\.com$/i, "Vercel"],
  [/\.github\.io$/i, "GitHub Pages"],
  [/netlify/i, "Netlify"],
  [/herokudns\.com$|herokuapp\.com$/i, "Heroku"],
  [/azurewebsites\.net$/i, "Microsoft Azure"],
  [/amazonaws\.com$/i, "Amazon Web Services"],
  [/fastly\.net$/i, "Fastly"],
  [/cloudflare\.net$/i, "Cloudflare"],
  [/shopify\.com$/i, "Shopify"],
];

export function detectFromCname(chain: readonly string[]): Detection[] {
  const detections: Detection[] = [];
  for (const host of chain) {
    for (const [pattern, name] of CNAME_MATCHES) {
      if (pattern.test(host)) {
        detections.push({ name, category: "bulud-provayder", reason: "CNAME zəncirində tapıldı", evidence: host });
      }
    }
  }
  return dedupe(detections);
}

/* ---------- RDAP organisation / ASN name ---------- */

const ORG_MATCHES: [RegExp, string][] = [
  [/amazon/i, "Amazon Web Services"],
  [/google/i, "Google Cloud"],
  [/microsoft/i, "Microsoft Azure"],
  [/cloudflare/i, "Cloudflare"],
  [/digitalocean/i, "DigitalOcean"],
  [/\bovh\b/i, "OVH"],
  [/hetzner/i, "Hetzner"],
  [/\bakamai\b|\blinode\b/i, "Akamai (Linode)"],
  [/\bvercel\b/i, "Vercel"],
  [/\bfastly\b/i, "Fastly"],
];

function matchOrgText(text: string | null, reason: string): Detection | null {
  if (text === null || text.trim() === "") return null;
  for (const [pattern, name] of ORG_MATCHES) {
    if (pattern.test(text)) {
      return { name, category: "bulud-provayder", reason, evidence: text };
    }
  }
  return null;
}

export function detectFromRdapOrg(rdap: RdapInfo | null, asnName: string | null): Detection[] {
  const detections: Detection[] = [];
  const orgHit = matchOrgText(rdap?.organisation ?? null, "RDAP təşkilat adında tapıldı");
  if (orgHit) detections.push(orgHit);
  const asnHit = matchOrgText(asnName, "ASN adında tapıldı");
  if (asnHit) detections.push(asnHit);
  return dedupe(detections);
}

/* ---------- the combined report ---------- */

export type HostingReport = {
  detections: Detection[];
  relevantHeaders: { name: string; value: string }[];
  generator: string | null;
  cnameChain: string[];
  address: string | null;
  rdapOrg: string | null;
  asnName: string | null;
};

const RELEVANT_HEADER_NAMES = [
  "server",
  "x-powered-by",
  "via",
  "cf-ray",
  "x-vercel-id",
  "x-amz-cf-id",
  "x-served-by",
];

export function buildHostingReport(input: {
  headers: readonly (readonly [string, string])[];
  html: string;
  cnameChain: readonly string[];
  address: string | null;
  rdap: RdapInfo | null;
  asnName: string | null;
}): HostingReport {
  const headerMap = toHeaderMap(input.headers);
  const generator = extractGeneratorMeta(input.html);
  const scriptPaths = extractScriptAndLinkPaths(input.html);

  const detections = dedupe([
    ...detectFromHeaders(headerMap),
    ...detectFromGenerator(generator),
    ...detectFromScriptPaths(scriptPaths),
    ...detectFromCname(input.cnameChain),
    ...detectFromRdapOrg(input.rdap, input.asnName),
  ]);

  const relevantHeaders = RELEVANT_HEADER_NAMES.filter((name) => headerMap.has(name)).map((name) => ({
    name,
    value: headerMap.get(name) as string,
  }));

  return {
    detections,
    relevantHeaders,
    generator,
    cnameChain: [...input.cnameChain],
    address: input.address,
    rdapOrg: input.rdap?.organisation ?? null,
    asnName: input.asnName,
  };
}
