/**
 * What a link looks like when somebody pastes it into a feed.
 *
 * Open Graph is a contract with four readers that all disagree slightly:
 * Facebook wants a 1.91:1 image and reads `og:*`; X reads `twitter:*` and
 * falls back to `og:*` but decides the card's size from `twitter:card` alone;
 * LinkedIn reads `og:*` and then drops the description in the feed; WhatsApp
 * fetches the image itself before it will draw anything at all.
 *
 * Everything here is a pure function on markup the route already fetched, so
 * every judgement the tool makes can be proved against a fixed string rather
 * than against a site that might change tomorrow. The one thing that cannot
 * be decided without the page's own address - whether `og:image` is a
 * relative path - is exactly the defect this tool exists to catch, which is
 * why `pageUrl` is a parameter of all three entry points instead of being
 * dug out of the markup.
 */
import { absoluteUrl, attr, collectTags, stripTags, type HtmlTag } from "./html.js";

/** Every `og:`, `twitter:`, `article:` and `description` meta, first one wins. */
export type OgData = Record<string, string>;

export type OgPlatform = "facebook" | "twitter" | "linkedin" | "whatsapp";

export type OgCard = {
  platform: OgPlatform;
  title: string;
  description: string;
  /** Absolute, resolved against the page. Null when there is no image at all. */
  image: string | null;
  host: string;
  /** True for the wide 1.91:1 card, false for the small square thumbnail. */
  large: boolean;
};

export type OgExtract = {
  tags: OgData;
  /** The `<title>` element's text, which is what a missing `og:title` falls to. */
  title: string | null;
  /** `<meta name="description">`, the fallback for a missing `og:description`. */
  description: string | null;
  canonical: string | null;
  icon: string | null;
};

export type OgIssue = { severity: "xeta" | "xeberdarliq" | "melumat"; message: string };

/*
 * Where each reader cuts, in characters.
 *
 * These are display limits, not validation limits: nothing rejects a longer
 * string, it just stops being visible, and a visitor who put the important
 * half at the end will never know. WhatsApp is the tightest and LinkedIn the
 * loosest, so a title that survives WhatsApp survives everywhere.
 */
export const PLATFORM_LIMITS: { platform: OgPlatform; label: string; title: number; description: number }[] = [
  { platform: "whatsapp", label: "WhatsApp", title: 65, description: 110 },
  { platform: "twitter", label: "X", title: 70, description: 200 },
  { platform: "facebook", label: "Facebook", title: 88, description: 200 },
  { platform: "linkedin", label: "LinkedIn", title: 119, description: 120 },
];

/** The size every platform's scaler is happy with, and the one to recommend. */
const RECOMMENDED_IMAGE = "1200×630";

/* ---------- extraction ---------- */

/** The meta names worth keeping. Everything else on a page is not our business. */
function isWanted(key: string): boolean {
  return (
    key.startsWith("og:") ||
    key.startsWith("twitter:") ||
    key.startsWith("article:") ||
    key === "description"
  );
}

/**
 * The name a `<meta>` goes by.
 *
 * Open Graph specifies `property`, Twitter specifies `name`, and half the web
 * writes the other one - so both are read, and `attr` has already lowercased
 * the attribute keys, which is what makes attribute order irrelevant here.
 */
function metaKey(tag: HtmlTag): string | null {
  const raw = attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop");
  if (raw === null) return null;
  const key = raw.trim().toLowerCase();
  return key === "" ? null : key;
}

/** The first `<link>` whose `rel` list holds one of `rels`, resolved absolute. */
function linkHref(html: string, base: string, rels: string[]): string | null {
  for (const tag of collectTags(html, "link")) {
    const rel = (attr(tag, "rel") ?? "").trim().toLowerCase().split(/\s+/);
    if (!rels.some((wanted) => rel.includes(wanted))) continue;
    const href = attr(tag, "href");
    if (href === null || href.trim() === "") continue;
    const resolved = absoluteUrl(href, base);
    if (resolved !== null) return resolved;
  }
  return null;
}

/**
 * Reads the sharing metadata out of a page.
 *
 * A repeated key keeps its first value, which is what the scrapers do: an
 * author who wrote `og:image` twice meant the second one as an alternative,
 * not as a correction.
 */
export function extractOpenGraph(html: string, pageUrl: string): OgExtract {
  const tags: OgData = {};

  for (const tag of collectTags(html, "meta")) {
    const key = metaKey(tag);
    const content = attr(tag, "content");
    if (key === null || content === null) continue;
    if (!isWanted(key) || key in tags) continue;
    tags[key] = content.trim();
  }

  const titleTag = collectTags(html, "title")[0];
  const title = titleTag === undefined ? "" : stripTags(titleTag.inner);
  const description = tags.description ?? "";

  return {
    tags,
    title: title === "" ? null : title,
    description: description === "" ? null : description,
    canonical: linkHref(html, pageUrl, ["canonical"]),
    icon: linkHref(html, pageUrl, ["icon", "apple-touch-icon", "mask-icon"]),
  };
}

/* ---------- what the readers end up with ---------- */

function effectiveTitle(data: OgExtract): string {
  return data.tags["og:title"] ?? data.title ?? "";
}

function effectiveDescription(data: OgExtract): string {
  return data.tags["og:description"] ?? data.description ?? "";
}

/** The domain a card prints under its title, without the `www.` nobody reads. */
function hostOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when the value is a path or a protocol-relative reference, not a URL. */
function isRelative(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value.trim());
}

export function buildCards(data: OgExtract, pageUrl: string): OgCard[] {
  const host = hostOf(pageUrl);
  const resolve = (raw: string | undefined): string | null =>
    raw === undefined || raw.trim() === "" ? null : absoluteUrl(raw, pageUrl);

  const ogImage = resolve(data.tags["og:image"]);
  const twitterImage = resolve(data.tags["twitter:image"]) ?? ogImage;

  const title = effectiveTitle(data);
  const description = effectiveDescription(data);
  const shown = title === "" ? host : title;

  /* X sizes its card from `twitter:card` and from nothing else: with the tag
     absent it draws the small `summary` even when a 1200x630 og:image is
     sitting right there, which is why the audit calls the missing tag out. */
  const card = (data.tags["twitter:card"] ?? "").trim().toLowerCase();

  return [
    { platform: "facebook", title: shown, description, image: ogImage, host, large: true },
    {
      platform: "twitter",
      title: data.tags["twitter:title"] ?? shown,
      description: data.tags["twitter:description"] ?? description,
      image: twitterImage,
      host,
      large: card === "summary_large_image",
    },
    { platform: "linkedin", title: shown, description, image: ogImage, host, large: true },
    { platform: "whatsapp", title: shown, description, image: ogImage, host, large: false },
  ];
}

/* ---------- the audit ---------- */

/** Names of the platforms whose limit `length` is over, tightest first. */
function cutBy(length: number, field: "title" | "description"): string[] {
  return PLATFORM_LIMITS.filter((limit) => length > limit[field]).map((limit) => limit.label);
}

function imageIssues(data: OgExtract, pageUrl: string, out: OgIssue[]): void {
  const raw = data.tags["og:image"] ?? "";
  const twitter = data.tags["twitter:image"] ?? "";

  if (raw === "") {
    out.push(
      twitter === ""
        ? {
            severity: "xeta",
            message:
              "«og:image» yoxdur. Şəkilsiz link lentdə sadəcə bir sətir mətn kimi görünür: Facebook, LinkedIn və WhatsApp heç bir təsvir çəkmir.",
          }
        : {
            severity: "xeberdarliq",
            message:
              "«og:image» yoxdur, yalnız «twitter:image» var. Şəkli X göstərəcək, Facebook, LinkedIn və WhatsApp isə göstərməyəcək: hər iki teqi yazmaq lazımdır.",
          },
    );
    return;
  }

  if (isRelative(raw)) {
    const resolved = absoluteUrl(raw, pageUrl);
    out.push({
      severity: "xeta",
      message: `«og:image» nisbi ünvandır («${raw}»): bu, ən çox rast gəlinən qüsurdur. Facebook nisbi yolu açmır, mütləq ünvan tələb edir.${
        resolved === null ? "" : ` Düzgün variant: «${resolved}».`
      }`,
    });
  }

  if ((data.tags["og:image:width"] ?? "") === "" || (data.tags["og:image:height"] ?? "") === "") {
    out.push({
      severity: "melumat",
      message: `Şəklin ölçüsü bildirilməyib («og:image:width» və «og:image:height»). Ölçü yazılmayanda platforma şəkli özü yükləyib ölçür və ilk paylaşımda kart çox vaxt şəkilsiz çıxır. Tövsiyə olunan ölçü ${RECOMMENDED_IMAGE}.`,
    });
  }

  if ((data.tags["og:image:alt"] ?? "") === "") {
    out.push({
      severity: "melumat",
      message: "«og:image:alt» yoxdur: ekran oxuyucusu kartdakı şəkli təsvir edə bilmir.",
    });
  }
}

function textIssues(data: OgExtract, out: OgIssue[]): void {
  if ((data.tags["og:title"] ?? "") === "") {
    out.push(
      data.title === null
        ? {
            severity: "xeta",
            message: "Nə «og:title», nə də «title» etiketi var: linkin başlığı boş qalacaq.",
          }
        : {
            severity: "xeberdarliq",
            message: `«og:title» yoxdur. Platformalar səhifənin «title» etiketinə düşür («${data.title}»), orada isə adətən sayt adı da olur və başlıq lentdə kəsilir.`,
          },
    );
  }

  if (effectiveDescription(data) === "") {
    out.push({
      severity: "xeberdarliq",
      message:
        "Təsvir yoxdur: nə «og:description», nə də «meta name=description» yazılıb. Kartın altındakı sətir boş qalır və linkə klikləmək üçün səbəb azalır.",
    });
  } else if ((data.tags["og:description"] ?? "") === "") {
    out.push({
      severity: "melumat",
      message:
        "«og:description» yoxdur, təsvir «meta name=description»-dan götürülür. Facebook bunu adətən qəbul edir, amma açıq yazmaq daha etibarlıdır.",
    });
  }

  if ((data.tags["twitter:card"] ?? "") === "") {
    out.push({
      severity: "melumat",
      message:
        "«twitter:card» yazılmayıb. X bu halda Facebook teqlərindən istifadə edir, amma kartı kiçik («summary») çəkir: böyük şəkil üçün «summary_large_image» lazımdır.",
    });
  }
}

/** Same page or not, ignoring `www.`, a trailing slash and the scheme. */
function sameAddress(left: string, right: string): boolean {
  try {
    const one = new URL(left);
    const two = new URL(right);
    const path = (url: URL) => url.pathname.replace(/\/+$/, "");
    return (
      one.hostname.replace(/^www\./, "") === two.hostname.replace(/^www\./, "") &&
      path(one) === path(two) &&
      one.search === two.search
    );
  } catch {
    return false;
  }
}

function urlIssues(data: OgExtract, pageUrl: string, out: OgIssue[]): void {
  const declared = data.tags["og:url"] ?? "";
  if (declared === "") {
    out.push({
      severity: "melumat",
      message:
        "«og:url» yoxdur. Bu teq paylaşım statistikasının hansı ünvana yazılacağını təyin edir: utm parametrli link paylaşılanda onsuz saylar parçalanır.",
    });
    return;
  }

  const absolute = absoluteUrl(declared, pageUrl);
  if (absolute === null || !sameAddress(absolute, pageUrl)) {
    out.push({
      severity: "xeberdarliq",
      message: `«og:url» («${declared}») yoxladığın ünvanla («${pageUrl}») uyuşmur. Paylaşımın bəyənmə və bölüşmə sayı «og:url»-də yazılan ünvana yazılır, ona görə səhv dəyər statistikanı başqa səhifəyə göndərir.`,
    });
  }
}

function lengthIssues(data: OgExtract, out: OgIssue[]): void {
  const title = effectiveTitle(data);
  const titleCut = cutBy(title.length, "title");
  if (titleCut.length > 0) {
    out.push({
      severity: titleCut.includes("Facebook") ? "xeberdarliq" : "melumat",
      message: `Başlıq ${title.length} simvoldur: ${titleCut.join(", ")} onu kəsəcək. Hədlər: WhatsApp 65, X 70, Facebook 88, LinkedIn 119 simvol.`,
    });
  }

  const description = effectiveDescription(data);
  const descriptionCut = cutBy(description.length, "description");
  if (descriptionCut.length > 0) {
    out.push({
      severity: descriptionCut.includes("Facebook") ? "xeberdarliq" : "melumat",
      message: `Təsvir ${description.length} simvoldur: ${descriptionCut.join(", ")} onu kəsəcək. Hədlər: WhatsApp 110, LinkedIn 120, Facebook və X 200 simvol.`,
    });
  }
}

const SEVERITY_ORDER: Record<OgIssue["severity"], number> = { xeta: 0, xeberdarliq: 1, melumat: 2 };

/**
 * Everything wrong with the page's sharing metadata, worst first.
 *
 * An empty array is the honest "nothing to fix" - the widget says so rather
 * than the audit inventing a congratulation to put in the list.
 */
export function auditOpenGraph(data: OgExtract, pageUrl: string): OgIssue[] {
  const issues: OgIssue[] = [];
  imageIssues(data, pageUrl, issues);
  textIssues(data, issues);
  urlIssues(data, pageUrl, issues);
  lengthIssues(data, issues);
  return issues.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
}
