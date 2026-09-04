/**
 * Finding `http://` resources referenced from an `https://` page — the
 * "mixed content" a browser silently blocks or silently warns about, with no
 * message anywhere a visitor would think to look.
 *
 * Pure functions over the tolerant scanner in `html.ts`: no DOM, so the same
 * code that scores a fetched page here can run again in the browser widget
 * without a round trip.
 *
 * The blocked/passive split is not this file's invention — it is the W3C
 * Mixed Content specification's own two categories, and the line it draws is
 * narrower than "script bad, image fine": only the three fetch destinations
 * "image", "audio" and "video" are optionally-blockable, everything else
 * defaults to blocked. That is why `<link rel="icon">` (an image fetch) is
 * judged differently from `<link rel="stylesheet">` (not one) even though
 * both are the same tag, and why an inline `style="...url(...)"` reference —
 * almost always a background image — is judged the same as `<img>` rather
 * than the same as `<script>`.
 */
import { absoluteUrl, attr, collectTags } from "./html";

export type MixedContentKind =
  | "img"
  | "script"
  | "link"
  | "iframe"
  | "video"
  | "audio"
  | "source"
  | "form"
  | "inline-style";

export type MixedContentFinding = {
  kind: MixedContentKind;
  /** The literal tag name the resource was found on — `"style"` for the inline case, since there is no element of its own. */
  tag: string;
  /** Which attribute carried the address — `"src"`, `"href"`, `"action"`, or `"style(url)"`. */
  attribute: string;
  /** Exactly what the attribute said, unresolved. */
  raw: string;
  /** Resolved against the page address. */
  url: string;
  blocked: boolean;
  note: string;
  /** Offset in the source HTML, so the widget can list findings in the order they appear on the page. */
  index: number;
};

/** True when a resolved address is unambiguously `http://` — never a match on a protocol-relative or already-secure URL. */
function isPlainHttp(resolved: string | null): resolved is string {
  return resolved !== null && resolved.toLowerCase().startsWith("http://");
}

function resolveAttr(html: string, tagName: string, attrName: string, pageUrl: string): MixedContentFinding[] {
  const findings: MixedContentFinding[] = [];
  for (const tag of collectTags(html, tagName)) {
    const raw = attr(tag, attrName);
    if (raw === null || raw.trim() === "") continue;
    const resolved = absoluteUrl(raw, pageUrl);
    if (!isPlainHttp(resolved)) continue;
    findings.push(buildFinding(tagName as MixedContentKind, tagName, attrName, raw, resolved, tag.index));
  }
  return findings;
}

/** `<link>`'s destination depends on `rel`: an icon is an image fetch, everything else defaults to blocked. */
const IMAGE_LIKE_LINK_RELS = new Set(["icon", "shortcut", "apple-touch-icon", "apple-touch-icon-precomposed", "mask-icon"]);

function linkFindings(html: string, pageUrl: string): MixedContentFinding[] {
  const findings: MixedContentFinding[] = [];
  for (const tag of collectTags(html, "link")) {
    const raw = attr(tag, "href");
    if (raw === null || raw.trim() === "") continue;
    const resolved = absoluteUrl(raw, pageUrl);
    if (!isPlainHttp(resolved)) continue;

    const relTokens = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const imageLike = relTokens.some((token) => IMAGE_LIKE_LINK_RELS.has(token));
    const kind: MixedContentKind = "link";
    const note = imageLike
      ? `<link rel="${relTokens.join(" ")}"> şəkil sorğusu sayılır — passiv, adətən yüklənir amma kilid işarəsini qırır.`
      : `<link href> (${relTokens.join(" ") || "rel yoxdur"}) aktiv məzmun sayılır — brauzer bunu bloklayır.`;
    findings.push({
      kind,
      tag: "link",
      attribute: "href",
      raw,
      url: resolved,
      blocked: !imageLike,
      note,
      index: tag.index,
    });
  }
  return findings;
}

function formFindings(html: string, pageUrl: string): MixedContentFinding[] {
  const findings: MixedContentFinding[] = [];
  for (const tag of collectTags(html, "form")) {
    const raw = attr(tag, "action");
    if (raw === null || raw.trim() === "") continue;
    const resolved = absoluteUrl(raw, pageUrl);
    if (!isPlainHttp(resolved)) continue;
    findings.push({
      kind: "form",
      tag: "form",
      attribute: "action",
      raw,
      url: resolved,
      blocked: false,
      note:
        "Mixed content bloklamasının hissəsi deyil, amma müasir brauzer formu göndərməzdən əvvəl «bağlantı təhlükəsiz deyil» xəbərdarlığı göstərir.",
      index: tag.index,
    });
  }
  return findings;
}

/** `url(http://...)` inside a `style="..."` attribute — attributes are not their own tag, so this scans every element's `style` value by hand rather than through `collectTags`. */
function inlineStyleFindings(html: string, pageUrl: string): MixedContentFinding[] {
  const findings: MixedContentFinding[] = [];
  const styleAttr = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const urlRef = /url\(\s*(['"]?)(http:\/\/[^)'"]+)\1?\s*\)/gi;

  let match: RegExpExecArray | null;
  while ((match = styleAttr.exec(html)) !== null) {
    const value = match[1] ?? match[2] ?? "";
    let inner: RegExpExecArray | null;
    urlRef.lastIndex = 0;
    while ((inner = urlRef.exec(value)) !== null) {
      const raw = inner[2];
      const resolved = absoluteUrl(raw, pageUrl);
      if (!isPlainHttp(resolved)) continue;
      findings.push({
        kind: "inline-style",
        tag: "style",
        attribute: "style(url)",
        raw,
        url: resolved,
        blocked: false,
        note: "CSS url() adətən arxa fon şəkli yükləyir — şəkil sorğusu kimi passiv sayılır.",
        index: match.index,
      });
    }
  }
  return findings;
}

function buildFinding(
  kind: MixedContentKind,
  tag: string,
  attribute: string,
  raw: string,
  url: string,
  index: number,
): MixedContentFinding {
  const blocked = kind === "script" || kind === "iframe";
  const note = blocked
    ? `<${tag} ${attribute}> aktiv məzmun sayılır — müasir brauzer bunu avtomatik bloklayır, resurs heç yüklənmir.`
    : `<${tag} ${attribute}> passiv (optionally-blockable) sayılır — əksər brauzerdə yüklənir, amma səhifənin kilid işarəsini qırır.`;
  return { kind, tag, attribute, raw, url, blocked, note, index };
}

/** Every `http://` reference this file knows how to find, in source order. */
export function findMixedContent(html: string, pageUrl: string): MixedContentFinding[] {
  const findings: MixedContentFinding[] = [
    ...resolveAttr(html, "img", "src", pageUrl),
    ...resolveAttr(html, "script", "src", pageUrl),
    ...linkFindings(html, pageUrl),
    ...resolveAttr(html, "iframe", "src", pageUrl),
    ...resolveAttr(html, "video", "src", pageUrl),
    ...resolveAttr(html, "audio", "src", pageUrl),
    ...resolveAttr(html, "source", "src", pageUrl),
    ...formFindings(html, pageUrl),
    ...inlineStyleFindings(html, pageUrl),
  ];
  return findings.sort((a, b) => a.index - b.index);
}

/** A comma-free scan for the one CSP directive that makes every finding below moot: the browser upgrades the request to `https://` before it is ever sent. */
export function cspHasUpgradeInsecureRequests(cspValue: string | null): boolean {
  if (cspValue === null) return false;
  return cspValue
    .split(";")
    .map((directive) => directive.trim().toLowerCase())
    .some((directive) => directive === "upgrade-insecure-requests" || directive.startsWith("upgrade-insecure-requests "));
}

export type MixedContentReport = {
  /** False when the page itself is not `https://` — "mixed" content is meaningless on a plain http page. */
  applicable: boolean;
  findings: MixedContentFinding[];
  upgradeInsecureRequests: boolean;
  blockedCount: number;
  passiveCount: number;
};

/**
 * Assembles the full report from a fetched page's own text and its
 * `Content-Security-Policy` header — pure, so the route's network part and
 * this file's judgement stay independently testable.
 */
export function buildMixedContentReport(html: string, pageUrl: string, cspHeaderValue: string | null): MixedContentReport {
  const applicable = pageUrl.toLowerCase().startsWith("https://");
  const findings = applicable ? findMixedContent(html, pageUrl) : [];
  const upgradeInsecureRequests = cspHasUpgradeInsecureRequests(cspHeaderValue);

  return {
    applicable,
    findings,
    upgradeInsecureRequests,
    blockedCount: findings.filter((finding) => finding.blocked).length,
    passiveCount: findings.filter((finding) => !finding.blocked).length,
  };
}
