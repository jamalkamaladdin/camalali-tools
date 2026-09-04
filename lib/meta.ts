/**
 * Meta tag generation for a single page: standard SEO, Open Graph, Twitter
 * Card, canonical and robots — plus a Next.js App Router `metadata` object
 * that says the same thing in the shape this site's own pages are written in.
 *
 * Pure string assembly. The three previews the widget draws (Google, the
 * social card, Twitter) all read the same `MetaFields` the tag builder does,
 * so the preview can never show a value the generated tags disagree with.
 */

export type TwitterCardType = "summary" | "summary_large_image";

export type MetaFields = {
  title: string;
  description: string;
  url: string;
  image: string;
  siteName: string;
  locale: string;
  twitterCard: TwitterCardType;
  robotsIndex: boolean;
  robotsFollow: boolean;
};

export const EMPTY_META_FIELDS: MetaFields = {
  title: "",
  description: "",
  url: "",
  image: "",
  siteName: "",
  locale: "",
  twitterCard: "summary_large_image",
  robotsIndex: true,
  robotsFollow: true,
};

/*
 * Google truncates a snippet by rendered pixel width, not by character count —
 * a title full of narrow letters fits far more of them than one full of wide
 * capitals. There is no honest way to reproduce that without the same font
 * Google renders with, so this tool measures characters and says so in its
 * FAQ instead of pretending a char count is the real limit. The two numbers
 * below are the commonly cited approximations for where a snippet *tends* to
 * start clipping, kept as a rough steer rather than a hard fact.
 */
export const TITLE_SOFT_LIMIT = 60;
export const DESCRIPTION_SOFT_LIMIT = 155;

export type LengthStatus = "ok" | "near" | "over";

export type LengthCheck = {
  length: number;
  limit: number;
  status: LengthStatus;
};

/** `near` starts at 90% of the limit, so the warning arrives before the cut, not after it. */
export function checkLength(value: string, limit: number): LengthCheck {
  const length = value.length;
  const status: LengthStatus = length > limit ? "over" : length >= limit * 0.9 ? "near" : "ok";
  return { length, limit, status };
}

/*
 * Every generated value lands inside a double-quoted HTML attribute. Left
 * unescaped, a title containing `"` closes the attribute early and the rest
 * of the string becomes markup the page did not intend to have — the classic
 * reflected-content break. `&` is replaced first on purpose: escaping the
 * other characters would otherwise re-encode the very ampersands their own
 * entities introduce (`&lt;` becoming `&amp;lt;`).
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A bare host like "example.com" is not a valid `URL` base on its own; treated as https for both resolution and display. */
function ensureScheme(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * A relative image path (`/og/cover.png`, the common case for a page that
 * hosts its own OG image) is meaningless outside the page it was written on —
 * crawlers that follow `og:image` resolve it against nothing, because there
 * is no HTML document base for a bare meta tag the way there is for `<img>`.
 * Resolved against the page URL here, once, so every consumer of `MetaFields`
 * sees the same absolute address the tags themselves will carry.
 */
export function resolveImageUrl(image: string, pageUrl: string): string {
  const trimmedImage = image.trim();
  if (trimmedImage === "") return "";
  if (/^https?:\/\//i.test(trimmedImage)) return trimmedImage;
  if (trimmedImage.startsWith("//")) return `https:${trimmedImage}`;

  const trimmedPage = pageUrl.trim();
  if (trimmedPage === "") return trimmedImage; // nothing to resolve against — hand back what was typed

  try {
    return new URL(trimmedImage, ensureScheme(trimmedPage)).toString();
  } catch {
    return trimmedImage; // an unparseable page URL must not make the image vanish from the preview
  }
}

/** The host shown beside the favicon in the Google preview, with a placeholder fallback for the state before a URL exists. */
export function extractDisplayDomain(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "nümunə.com";
  try {
    return new URL(ensureScheme(trimmed)).hostname;
  } catch {
    return trimmed;
  }
}

/**
 * One `<meta>` (or `<title>` / `<link>`) line, or nothing when the field
 * behind it is blank. An empty `content=""` is not a harmless placeholder —
 * a crawler reads it as "the author confirmed this is empty", which is worse
 * than the tag never having been written.
 */
function metaLine(attr: "name" | "property", key: string, rawValue: string): string | null {
  const value = rawValue.trim();
  if (value === "") return null;
  return `<meta ${attr}="${key}" content="${escapeHtmlAttribute(value)}">`;
}

/** The raw `<head>` lines, one per array entry so the check file can assert on individual tags. */
export function buildMetaTags(fields: MetaFields): string[] {
  const title = fields.title.trim();
  const description = fields.description.trim();
  const url = fields.url.trim();
  const image = resolveImageUrl(fields.image, url);
  const siteName = fields.siteName.trim();
  const locale = fields.locale.trim();

  const lines: string[] = [];

  if (title !== "") lines.push(`<title>${escapeHtmlAttribute(title)}</title>`);
  const descriptionLine = metaLine("name", "description", description);
  if (descriptionLine) lines.push(descriptionLine);
  if (url !== "") lines.push(`<link rel="canonical" href="${escapeHtmlAttribute(url)}">`);

  // Booleans always have a value, so this tag is never blank — unlike the
  // text fields above, "no opinion" is not an option a checkbox can express.
  const robotsContent = `${fields.robotsIndex ? "index" : "noindex"}, ${
    fields.robotsFollow ? "follow" : "nofollow"
  }`;
  lines.push(`<meta name="robots" content="${robotsContent}">`);

  const ogTitle = metaLine("property", "og:title", title);
  if (ogTitle) lines.push(ogTitle);
  const ogDescription = metaLine("property", "og:description", description);
  if (ogDescription) lines.push(ogDescription);
  lines.push(`<meta property="og:type" content="website">`);
  const ogUrl = metaLine("property", "og:url", url);
  if (ogUrl) lines.push(ogUrl);
  const ogImage = metaLine("property", "og:image", image);
  if (ogImage) lines.push(ogImage);
  const ogSiteName = metaLine("property", "og:site_name", siteName);
  if (ogSiteName) lines.push(ogSiteName);
  const ogLocale = metaLine("property", "og:locale", locale);
  if (ogLocale) lines.push(ogLocale);

  // Facebook and LinkedIn both read Open Graph — there is no separate tag set
  // for them, which is why the widget draws one social-card preview for both.
  lines.push(`<meta name="twitter:card" content="${fields.twitterCard}">`);
  const twitterTitle = metaLine("name", "twitter:title", title);
  if (twitterTitle) lines.push(twitterTitle);
  const twitterDescription = metaLine("name", "twitter:description", description);
  if (twitterDescription) lines.push(twitterDescription);
  const twitterImage = metaLine("name", "twitter:image", image);
  if (twitterImage) lines.push(twitterImage);

  return lines;
}

export function buildMetaHtml(fields: MetaFields): string {
  return buildMetaTags(fields).join("\n");
}

/*
 * The Next.js half. `Metadata` is a plain object, not markup, so it needs its
 * own builder rather than a re-serialisation of the HTML lines above — the
 * key names differ (`openGraph.siteName`, not `og:site_name`) and the values
 * are JS strings, not HTML attribute text, so they must never pass through
 * `escapeHtmlAttribute`: a title with `&` would come out as the literal text
 * `&amp;` in the rendered page instead of the `&` the author typed.
 */
export function buildNextMetadata(fields: MetaFields): Record<string, unknown> {
  const title = fields.title.trim();
  const description = fields.description.trim();
  const url = fields.url.trim();
  const image = resolveImageUrl(fields.image, url);
  const siteName = fields.siteName.trim();
  const locale = fields.locale.trim();

  const metadata: Record<string, unknown> = {};
  if (title !== "") metadata.title = title;
  if (description !== "") metadata.description = description;
  if (url !== "") metadata.alternates = { canonical: url };
  metadata.robots = { index: fields.robotsIndex, follow: fields.robotsFollow };

  const openGraph: Record<string, unknown> = {};
  if (title !== "") openGraph.title = title;
  if (description !== "") openGraph.description = description;
  openGraph.type = "website";
  if (url !== "") openGraph.url = url;
  if (siteName !== "") openGraph.siteName = siteName;
  if (locale !== "") openGraph.locale = locale;
  if (image !== "") openGraph.images = [{ url: image }];
  metadata.openGraph = openGraph;

  const twitter: Record<string, unknown> = { card: fields.twitterCard };
  if (title !== "") twitter.title = title;
  if (description !== "") twitter.description = description;
  if (image !== "") twitter.images = [image];
  metadata.twitter = twitter;

  return metadata;
}

/** Escapes a value for a double-quoted JS/TS string literal — a different job from `escapeHtmlAttribute`, since the destination is source code, not markup. */
function escapeJsString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function serialiseValue(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  const childPad = "  ".repeat(indent + 1);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return `"${escapeJsString(value)}"`;

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${childPad}${serialiseValue(item, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([key, val]) => {
    const printedKey = IDENTIFIER.test(key) ? key : `"${escapeJsString(key)}"`;
    return `${childPad}${printedKey}: ${serialiseValue(val, indent + 1)}`;
  });
  return `{\n${lines.join(",\n")},\n${pad}}`;
}

/** Copy-paste ready for a `page.tsx` or `layout.tsx` — the import line is included, since a `Metadata`-typed constant with no import is a type error the visitor would have to go find. */
export function buildNextMetadataCode(fields: MetaFields): string {
  const metadata = buildNextMetadata(fields);
  return [
    `import type { Metadata } from "next";`,
    "",
    `export const metadata: Metadata = ${serialiseValue(metadata, 0)};`,
  ].join("\n");
}
