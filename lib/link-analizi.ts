/**
 * Link auditor: turns pasted HTML plus the page's own address into the table
 * of every `<a>` on it, what is internal vs external, and what is broken or
 * suspicious about the anchors themselves.
 *
 * Pure functions over the tolerant scanner in `html.ts` — no DOM, so the same
 * code runs in the browser widget without a server round trip.
 */
import { absoluteUrl, attr, collectTags, stripTags } from "./html";

export type PageLink = {
  /** Exactly what the `href` attribute said, untouched. */
  href: string;
  /** `href` resolved against the base address, or null when it never could be. */
  resolved: string | null;
  anchor: string;
  /** Lower-cased tokens of the `rel` attribute. */
  rel: string[];
  targetBlank: boolean;
  internal: boolean;
  /** `href` starts with `#` — a same-page jump, counted separately from external. */
  fragmentOnly: boolean;
  index: number;
};

export type LinkIssue = {
  severity: "xeta" | "xeberdarliq" | "melumat";
  kind: string;
  message: string;
  link: PageLink | null;
};

export type LinkSummary = {
  total: number;
  internal: number;
  external: number;
  nofollow: number;
  uniqueTargets: number;
  anchors: { text: string; count: number }[];
};

/*
 * Weak anchor phrases — wording that names the click instead of the
 * destination. Each language contributes its own set; a phrase spelled the
 * same in both only needs one entry.
 */
export const WEAK_ANCHORS: string[] = [
  "bura",
  "burada",
  "bura klikləyin",
  "daha ətraflı",
  "ətraflı",
  "keçid",
  "link",
  "oxu",
  "bax",
  "click here",
  "read more",
  "here",
];

/** A bare host is not a valid `URL` base on its own; treated as https. */
function ensureScheme(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function stripFragment(url: string): string {
  const hashIndex = url.indexOf("#");
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

/** `javascript:` runs code instead of navigating, and a blank `href` goes nowhere. */
function isDeadHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed === "") return true;
  return /^javascript:/i.test(trimmed);
}

/** Case and surrounding punctuation removed, so trailing marks or arrows do not defeat the match. */
function normalizeAnchorText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * The anchor's text, with the same image-alt fallback as the heading tool:
 * a link whose only content is `<img alt="...">` reads as that alt text to a
 * crawler, not as empty.
 */
function anchorText(inner: string): string {
  const visible = stripTags(inner).trim();
  if (visible !== "") return visible;

  const images = collectTags(inner, "img");
  const altText = images
    .map((image) => (attr(image, "alt") ?? "").trim())
    .find((value) => value !== "");
  return altText ?? "";
}

/** Every `<a>` in the document, in the order it appears. */
export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const base = ensureScheme(baseUrl.trim());
  const baseOrigin = originOf(base);

  return collectTags(html, "a").map((tag): PageLink => {
    const href = (attr(tag, "href") ?? "").trim();
    const anchor = anchorText(tag.inner);
    const rel = (attr(tag, "rel") ?? "")
      .split(/\s+/)
      .map((token) => token.toLowerCase())
      .filter(Boolean);
    const targetBlank = (attr(tag, "target") ?? "").trim().toLowerCase() === "_blank";
    const fragmentOnly = href.startsWith("#");
    const resolved = isDeadHref(href) ? null : absoluteUrl(href, base);

    let internal = false;
    if (resolved !== null && baseOrigin !== null) {
      const targetOrigin = originOf(resolved);
      internal = targetOrigin !== null && targetOrigin === baseOrigin;
    }

    return { href, resolved, anchor, rel, targetBlank, internal, fragmentOnly, index: tag.index };
  });
}

/** The problems in a link table: broken targets, weak wording, missing safety attributes. */
export function auditLinks(links: PageLink[], baseUrl: string): LinkIssue[] {
  const issues: LinkIssue[] = [];
  const baseNoFragment = stripFragment(ensureScheme(baseUrl.trim()));

  for (const link of links) {
    if (link.anchor === "") {
      issues.push({
        severity: "xeta",
        kind: "bos-anchor",
        message: "Linkin mətni yoxdur və içində alt mətnli şəkil də yoxdur: hara apardığı bilinmir.",
        link,
      });
    } else if (WEAK_ANCHORS.includes(normalizeAnchorText(link.anchor))) {
      issues.push({
        severity: "xeberdarliq",
        kind: "zeif-anchor",
        message: `«${link.anchor}» linkin hara apardığını demir: anchor mətni məzmunu təsvir etməlidir.`,
        link,
      });
    }

    if (isDeadHref(link.href)) {
      issues.push({
        severity: "xeta",
        kind: "olu-href",
        message:
          link.href.trim() === ""
            ? "href boşdur: link heç yerə getmir."
            : "href «javascript:» ilə başlayır: axtarış sistemi bu linki izləyə bilmir.",
        link,
      });
    }

    if (link.targetBlank && !link.rel.includes("noopener") && !link.rel.includes("noreferrer")) {
      issues.push({
        severity: "xeberdarliq",
        kind: "noopener-yoxdur",
        message: 'target="_blank" var, rel="noopener" yoxdur: açılan səhifə bu pəncərəyə window.opener ilə çıxış əldə edə bilər.',
        link,
      });
    }

    if (
      !link.fragmentOnly &&
      !isDeadHref(link.href) &&
      link.resolved !== null &&
      stripFragment(link.resolved) === baseNoFragment
    ) {
      issues.push({
        severity: "xeberdarliq",
        kind: "oz-sehifesine-link",
        message: "Bu link səhifənin öz ünvanına gedir.",
        link,
      });
    }
  }

  const byAnchor = new Map<string, { anchor: string; targets: Set<string> }>();
  for (const link of links) {
    if (link.anchor === "" || link.resolved === null) continue;
    const key = normalizeAnchorText(link.anchor);
    const entry = byAnchor.get(key) ?? { anchor: link.anchor, targets: new Set<string>() };
    entry.targets.add(link.resolved);
    byAnchor.set(key, entry);
  }
  for (const entry of byAnchor.values()) {
    if (entry.targets.size < 2) continue;
    issues.push({
      severity: "xeberdarliq",
      kind: "eyni-metn-ferqli-hedef",
      message: `«${entry.anchor}» mətni ${entry.targets.size} fərqli ünvana gedir.`,
      link: null,
    });
  }

  const byTarget = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.resolved === null) continue;
    const normalized = normalizeAnchorText(link.anchor);
    if (normalized === "") continue;
    const set = byTarget.get(link.resolved) ?? new Set<string>();
    set.add(normalized);
    byTarget.set(link.resolved, set);
  }
  for (const [target, anchors] of byTarget) {
    if (anchors.size < 2) continue;
    issues.push({
      severity: "melumat",
      kind: "eyni-hedef-ferqli-metn",
      message: `${target} ünvanına ${anchors.size} fərqli anchor mətni ilə keçid verilib.`,
      link: null,
    });
  }

  return issues;
}

/** Totals and the anchor-text frequency table, sorted by count then alphabetically. */
export function summariseLinks(links: PageLink[]): LinkSummary {
  const total = links.length;
  const internal = links.filter((link) => link.internal).length;
  const external = links.filter((link) => !link.internal && link.resolved !== null).length;
  const nofollow = links.filter((link) => link.rel.includes("nofollow")).length;
  const uniqueTargets = new Set(
    links.filter((link) => link.resolved !== null).map((link) => link.resolved as string),
  ).size;

  const counts = new Map<string, number>();
  for (const link of links) {
    const text = link.anchor.trim();
    if (text === "") continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const anchors = [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

  return { total, internal, external, nofollow, uniqueTargets, anchors };
}
