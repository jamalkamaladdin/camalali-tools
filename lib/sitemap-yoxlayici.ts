/**
 * Reading a live sitemap or feed and saying what is actually in it.
 *
 * The parsing is hand-written TypeScript rather than a library, and that is a
 * decision rather than an omission: the four documents this has to understand
 * are a tiny, well-known subset of XML, while the files in the wild are full
 * of things a strict parser refuses outright - a byte-order mark before the
 * declaration, a namespace prefix on every element, CDATA around a URL, a
 * missing declaration entirely. A parser that throws on the first of those
 * tells the visitor "invalid" about a sitemap Google reads every day.
 *
 * So the scanner is deliberately tolerant about shape and strict about
 * reporting: it recovers from a mismatched tag and carries on counting, but
 * the mismatch is reported with its line and column, because "your XML is
 * broken somewhere" is not an answer anybody can act on.
 *
 * Everything here is pure. The route fetches the bytes and hands them over
 * with the one fact the parser cannot know - whether the read was cut short -
 * so a partial file is reported as partial instead of as a small sitemap.
 */
import { decodeEntities } from "./html";

export type FeedKind = "sitemapindex" | "urlset" | "rss" | "atom" | "namelum";

export type SitemapUrl = {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
};

export type SitemapIssue = { severity: "xeta" | "xeberdarliq"; message: string };

export type SitemapReport = {
  kind: FeedKind;
  /** The root element as written, prefix included, or null when there is none. */
  rootElement: string | null;
  urls: SitemapUrl[];
  /** Only for a sitemap index. Never fetched here - see the route's comment. */
  childSitemaps: string[];
  hosts: string[];
  duplicates: number;
  oldest: string | null;
  newest: string | null;
  truncated: boolean;
  issues: SitemapIssue[];
  /*
   * Two fields past the sitemap protocol, because the tool answers two
   * questions the protocol does not: a feed's own title (an RSS channel or an
   * Atom feed names itself, and that is how a visitor recognises the file they
   * pointed at) and how many entries carry hreflang alternates (a
   * multi-language sitemap that lost its alternates looks identical to a
   * single-language one until this number is zero).
   */
  feedTitle: string | null;
  hreflangCount: number;
};

/** The sitemap protocol's own ceilings, per file. */
export const MAX_URLS_PER_SITEMAP = 50_000;
export const MAX_SITEMAP_BYTES = 52_428_800;

/* ---------- a tolerant XML scanner ---------- */

type XmlNode = {
  /** As written, prefix included: `sitemap:urlset`. */
  name: string;
  /** Without the prefix, lowercased: `urlset`. */
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Character data directly inside this element, entities resolved. */
  text: string;
};

type ParseError = { message: string; line: number; column: number };

type XmlParse = { root: XmlNode | null; error: ParseError | null; unclosed: string[] };

type Ctx = { text: string; stack: XmlNode[]; root: XmlNode | null; error: ParseError | null };

function localName(name: string): string {
  const colon = name.indexOf(":");
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}

/** Line and column of a character offset, both counted from 1. */
function positionOf(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let at = 0; at < index && at < text.length; at += 1) {
    if (text[at] === "\n") {
      line += 1;
      lineStart = at + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/** Records the first structural fault only; later ones are its consequences. */
function note(ctx: Ctx, at: number, message: string): void {
  if (ctx.error === null) ctx.error = { message, ...positionOf(ctx.text, at) };
}

function addText(ctx: Ctx, value: string): void {
  const top = ctx.stack[ctx.stack.length - 1];
  if (top !== undefined) top.text += value;
}

/**
 * Reads the attributes between a tag name and its `>`.
 *
 * `terminated` is the interesting return: a tag that never closes is the one
 * shape the scanner cannot recover from, and it has to be told apart from a
 * tag that simply had no attributes.
 */
function readAttributes(
  text: string,
  start: number,
): { attrs: Record<string, string>; end: number; selfClosing: boolean; terminated: boolean } {
  const attrs: Record<string, string> = {};
  let index = start;
  let selfClosing = false;
  let terminated = false;

  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) index += 1;
    if (index >= text.length) break;

    if (text[index] === ">") {
      index += 1;
      terminated = true;
      break;
    }
    if (text[index] === "/") {
      selfClosing = true;
      index += 1;
      continue;
    }

    const nameStart = index;
    while (index < text.length && !/[\s/>=]/.test(text[index])) index += 1;
    const name = text.slice(nameStart, index).toLowerCase();
    if (name === "") {
      /* Nothing was consumed, which would loop forever. A stray `=` is not
         worth abandoning the tag for. */
      index += 1;
      continue;
    }

    while (index < text.length && /\s/.test(text[index])) index += 1;
    if (text[index] !== "=") {
      attrs[name] = "";
      continue;
    }
    index += 1;
    while (index < text.length && /\s/.test(text[index])) index += 1;

    const quote = text[index];
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, index + 1);
      attrs[name] = decodeEntities(text.slice(index + 1, close === -1 ? text.length : close));
      index = close === -1 ? text.length : close + 1;
    } else {
      const valueStart = index;
      while (index < text.length && !/[\s>]/.test(text[index])) index += 1;
      attrs[name] = decodeEntities(text.slice(valueStart, index));
    }
  }

  return { attrs, end: index, selfClosing, terminated };
}

function openElement(ctx: Ctx, at: number): number {
  const { text } = ctx;
  let cursor = at + 1;
  while (cursor < text.length && /[A-Za-z0-9._:-]/.test(text[cursor])) cursor += 1;

  const name = text.slice(at + 1, cursor);
  if (name === "") {
    /* A `<` that never became a tag is text, and stays. */
    addText(ctx, "<");
    return at + 1;
  }

  const { attrs, end, selfClosing, terminated } = readAttributes(text, cursor);
  if (!terminated) {
    note(ctx, at, `«<${name}>» etiketi bağlanmayıb`);
    return text.length;
  }

  const node: XmlNode = { name, local: localName(name), attrs, children: [], text: "" };
  const parent = ctx.stack[ctx.stack.length - 1];
  if (parent !== undefined) parent.children.push(node);
  else if (ctx.root === null) ctx.root = node;
  else note(ctx, at, `sənəddə ikinci kök element var: «${name}»`);

  if (!selfClosing) ctx.stack.push(node);
  return end;
}

function closeElement(ctx: Ctx, at: number): number {
  const { text } = ctx;
  const close = text.indexOf(">", at);
  if (close === -1) {
    note(ctx, at, "bağlayıcı etiket bitmir");
    return text.length;
  }

  const name = text.slice(at + 2, close).trim();
  const local = localName(name);
  const top = ctx.stack[ctx.stack.length - 1];

  if (top === undefined) {
    note(ctx, at, `«</${name}>» üçün açılan etiket yoxdur`);
    return close + 1;
  }
  if (top.local === local) {
    ctx.stack.pop();
    return close + 1;
  }

  note(ctx, at, `«<${top.name}>» bağlanmadan «</${name}>» gəldi`);
  /* Recovery: if the name does match something deeper, the elements above it
     were left open, so unwind to it and keep counting. If it matches nothing,
     the close tag is stray and is dropped. */
  for (let depth = ctx.stack.length - 2; depth >= 0; depth -= 1) {
    if (ctx.stack[depth].local === local) {
      ctx.stack.length = depth;
      return close + 1;
    }
  }
  return close + 1;
}

/**
 * Turns a document into a tree, reporting the first fault rather than throwing.
 *
 * `unclosed` is handed back separately from `error`, because an element left
 * open at the end of the input means one of two very different things: broken
 * markup, or a file that was cut off mid-read. Only the caller knows which.
 */
function parseXml(text: string): XmlParse {
  const ctx: Ctx = { text, stack: [], root: null, error: null };
  let index = 0;

  while (index < text.length) {
    const at = text.indexOf("<", index);
    if (at === -1) {
      addText(ctx, decodeEntities(text.slice(index)));
      break;
    }
    if (at > index) addText(ctx, decodeEntities(text.slice(index, at)));

    if (text.startsWith("<![CDATA[", at)) {
      const close = text.indexOf("]]>", at + 9);
      /* CDATA is verbatim by definition: `&amp;` inside it is five characters,
         not one, so this is the one text path that is not decoded. */
      addText(ctx, text.slice(at + 9, close === -1 ? text.length : close));
      if (close === -1) {
        note(ctx, at, "CDATA bölməsi bağlanmayıb");
        break;
      }
      index = close + 3;
      continue;
    }

    if (text.startsWith("<!--", at)) {
      const close = text.indexOf("-->", at + 4);
      if (close === -1) {
        note(ctx, at, "şərh bağlanmayıb");
        break;
      }
      index = close + 3;
      continue;
    }

    if (text.startsWith("<!", at) || text.startsWith("<?", at)) {
      const close = text.indexOf(">", at + 2);
      if (close === -1) {
        note(ctx, at, "bəyannamə bağlanmayıb");
        break;
      }
      index = close + 1;
      continue;
    }

    index = text.startsWith("</", at) ? closeElement(ctx, at) : openElement(ctx, at);
  }

  return { root: ctx.root, error: ctx.error, unclosed: ctx.stack.map((node) => node.name) };
}

/* ---------- reading the tree ---------- */

function childrenNamed(node: XmlNode, local: string): XmlNode[] {
  return node.children.filter((child) => child.local === local);
}

/** The trimmed text of the first child with this local name, or null. */
function childText(node: XmlNode, local: string): string | null {
  const child = node.children.find((candidate) => candidate.local === local);
  if (child === undefined) return null;
  const value = child.text.trim();
  return value === "" ? null : value;
}

function readUrlset(root: XmlNode): { urls: SitemapUrl[]; missingLoc: number; hreflang: number } {
  const urls: SitemapUrl[] = [];
  let missingLoc = 0;
  let hreflang = 0;

  for (const entry of childrenNamed(root, "url")) {
    const loc = childText(entry, "loc");
    if (loc === null) {
      missingLoc += 1;
      continue;
    }
    urls.push({
      loc,
      lastmod: childText(entry, "lastmod"),
      changefreq: childText(entry, "changefreq"),
      priority: childText(entry, "priority"),
    });
    if (childrenNamed(entry, "link").some((link) => (link.attrs.hreflang ?? "") !== "")) {
      hreflang += 1;
    }
  }

  return { urls, missingLoc, hreflang };
}

function readRss(root: XmlNode): { urls: SitemapUrl[]; title: string | null } {
  const channel = childrenNamed(root, "channel")[0];
  if (channel === undefined) return { urls: [], title: null };

  const urls = childrenNamed(channel, "item").map((item) => ({
    loc: childText(item, "link") ?? "",
    lastmod: childText(item, "pubdate"),
    changefreq: null,
    priority: null,
  }));

  return { urls, title: childText(channel, "title") };
}

/** Atom keeps the address in an attribute, and prefers the `alternate` link. */
function atomLink(entry: XmlNode): string {
  const links = childrenNamed(entry, "link");
  const alternate = links.find((link) => (link.attrs.rel ?? "alternate") === "alternate");
  const chosen = alternate ?? links[0];
  return chosen?.attrs.href ?? childText(entry, "id") ?? "";
}

function readAtom(root: XmlNode): { urls: SitemapUrl[]; title: string | null } {
  const urls = childrenNamed(root, "entry").map((entry) => ({
    loc: atomLink(entry),
    lastmod: childText(entry, "updated") ?? childText(entry, "published"),
    changefreq: null,
    priority: null,
  }));

  return { urls, title: childText(root, "title") };
}

/* ---------- the report ---------- */

function hostsOf(locs: string[]): string[] {
  const hosts = new Set<string>();
  for (const loc of locs) {
    try {
      hosts.add(new URL(loc).hostname.toLowerCase());
    } catch {
      /* A relative or unparsable `loc` has no host to add; it is reported as
         its own defect rather than counted as a second site. */
    }
  }
  return [...hosts].sort();
}

/** Oldest and newest of the timestamps that parse, returned as written. */
function dateRange(stamps: (string | null)[]): { oldest: string | null; newest: string | null } {
  const dated = stamps
    .filter((stamp): stamp is string => stamp !== null)
    .map((stamp) => ({ stamp, time: Date.parse(stamp) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time);

  if (dated.length === 0) return { oldest: null, newest: null };
  return { oldest: dated[0].stamp, newest: dated[dated.length - 1].stamp };
}

function isRelative(loc: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(loc.trim());
}

/**
 * A gzipped file arrives as replacement characters, not as XML.
 *
 * Both signals are checked, because either can be missing: a server can hand
 * back gzip from an address with no `.gz` in it, and a `.gz` address can be
 * transparently decompressed by fetch before this ever sees it.
 */
function looksGzipped(text: string, sourceUrl: string): boolean {
  if (text.charCodeAt(0) === 0x1f) return true;
  try {
    return /\.gz$/i.test(new URL(sourceUrl).pathname);
  } catch {
    return /\.gz(\?|$)/i.test(sourceUrl);
  }
}

function emptyReport(truncated: boolean, issues: SitemapIssue[], rootElement: string | null): SitemapReport {
  return {
    kind: "namelum",
    rootElement,
    urls: [],
    childSitemaps: [],
    hosts: [],
    duplicates: 0,
    oldest: null,
    newest: null,
    truncated,
    issues,
    feedTitle: null,
    hreflangCount: 0,
  };
}

const KINDS: Record<string, FeedKind> = {
  sitemapindex: "sitemapindex",
  urlset: "urlset",
  rss: "rss",
  feed: "atom",
};

/** Everything that is wrong with a set of addresses, whatever produced them. */
function locIssues(kind: FeedKind, locs: string[], duplicates: number, hosts: string[]): SitemapIssue[] {
  const issues: SitemapIssue[] = [];
  const sitemap = kind === "urlset" || kind === "sitemapindex";

  const relative = locs.filter(isRelative);
  if (relative.length > 0) {
    issues.push({
      severity: sitemap ? "xeta" : "xeberdarliq",
      message: `${relative.length} ünvan mütləq deyil (məsələn «${relative[0]}»). Sitemap protokolu tam ünvan tələb edir: «https://» ilə başlamalıdır.`,
    });
  }

  if (duplicates > 0) {
    issues.push({
      severity: "xeberdarliq",
      message: `${duplicates} ünvan təkrarlanır. Təkrar sətir fayl həcmini artırır və axtarış sistemində eyni səhifəni iki dəfə göstərmir, sadəcə lazımsızdır.`,
    });
  }

  if (hosts.length > 1) {
    issues.push({
      severity: "xeberdarliq",
      message: `Faylda ${hosts.length} fərqli host qarışıb: ${hosts.slice(0, 4).join(", ")}${hosts.length > 4 ? " və başqaları" : ""}. Bir sitemap yalnız öz hostunun ünvanlarını saxlamalıdır, əks halda kənar ünvanlar nəzərə alınmır.`,
    });
  }

  return issues;
}

/**
 * Turns a fetched document into the report the tool shows.
 *
 * `truncated` comes from the route rather than being guessed here: an element
 * left open at the end of a cut file is not broken markup, and calling it
 * broken would be the tool's worst possible lie about a working sitemap.
 */
export function parseSitemapDocument(
  text: string,
  sourceUrl: string,
  truncated: boolean,
): SitemapReport {
  /* The byte-order mark is legal in front of an XML declaration and is not
     part of the markup; left in place it turns the declaration into text. */
  const body = text.replace(/^\uFEFF/, "");
  const issues: SitemapIssue[] = [];

  if (truncated) {
    issues.push({
      severity: "xeberdarliq",
      message:
        "Fayl bayt həddindən böyükdür və yalnız başlanğıcı oxundu. Aşağıdakı saylar bütöv faylın deyil, oxunan hissənin saylarıdır: dəqiq rəqəm kimi götürmə.",
    });
  }

  if (looksGzipped(body, sourceUrl)) {
    issues.push({
      severity: "xeta",
      message:
        "Fayl gzip ilə sıxılıb («.xml.gz»). Bu alət sıxılmış faylı açmır: sıxılmamış «sitemap.xml» ünvanını yoxla. Axtarış sistemləri sıxılmış variantı oxuyur, yəni bu, saytın qüsuru deyil.",
    });
    return emptyReport(truncated, issues, null);
  }

  const parsed = parseXml(body);

  /* Held back rather than pushed straight in. An HTML page fails both of these
     - void elements are never closed - and reporting "your XML is broken" about
     a page that was never XML buries the only sentence that helps: this is not
     a sitemap. They are added below, once the document is known to be one. */
  const structural: SitemapIssue[] = [];
  if (parsed.error !== null) {
    structural.push({
      severity: "xeta",
      message: `XML pozuqdur: ${parsed.error.message}, sətir ${parsed.error.line}, mövqe ${parsed.error.column}.`,
    });
  }
  if (!truncated && parsed.unclosed.length > 0) {
    structural.push({
      severity: "xeta",
      message: `XML pozuqdur: «<${parsed.unclosed[parsed.unclosed.length - 1]}>» elementi bağlanmayıb.`,
    });
  }

  const root = parsed.root;
  if (root === null) {
    issues.push({
      severity: "xeta",
      message: "Sənəddə bir dənə də XML elementi tapılmadı: ünvan boş cavab qaytardı və ya HTML səhifədir.",
    });
    return emptyReport(truncated, issues, null);
  }

  const kind = KINDS[root.local] ?? "namelum";
  if (kind === "namelum") {
    issues.push({
      severity: "xeta",
      message: `Bu, sitemap və ya lent deyil. Tapılan kök element: «${root.name}». Sitemap üçün <urlset> və ya <sitemapindex>, lent üçün <rss> və ya <feed> gözlənilir.`,
    });
    return emptyReport(truncated, issues, root.name);
  }

  issues.push(...structural);
  return buildReport(kind, root, truncated, issues);
}

/** The per-kind half of the report, once the document is known to be one of them. */
function buildReport(
  kind: Exclude<FeedKind, "namelum">,
  root: XmlNode,
  truncated: boolean,
  issues: SitemapIssue[],
): SitemapReport {
  let urls: SitemapUrl[] = [];
  let childSitemaps: string[] = [];
  let feedTitle: string | null = null;
  let hreflangCount = 0;
  let stamps: (string | null)[] = [];

  if (kind === "urlset") {
    const read = readUrlset(root);
    urls = read.urls;
    hreflangCount = read.hreflang;
    stamps = urls.map((url) => url.lastmod);
    if (read.missingLoc > 0) {
      issues.push({
        severity: "xeta",
        message: `${read.missingLoc} <url> elementində <loc> yoxdur. <loc> məcburidir: onsuz sətir tamamilə nəzərə alınmır.`,
      });
    }
  } else if (kind === "sitemapindex") {
    const entries = childrenNamed(root, "sitemap");
    childSitemaps = entries.map((entry) => childText(entry, "loc")).filter((loc): loc is string => loc !== null);
    stamps = entries.map((entry) => childText(entry, "lastmod"));
    if (entries.length !== childSitemaps.length) {
      issues.push({
        severity: "xeta",
        message: `${entries.length - childSitemaps.length} <sitemap> elementində <loc> yoxdur.`,
      });
    }
  } else {
    const read = kind === "rss" ? readRss(root) : readAtom(root);
    urls = read.urls.filter((url) => url.loc !== "");
    feedTitle = read.title;
    stamps = read.urls.map((url) => url.lastmod);
  }

  const locs = kind === "sitemapindex" ? childSitemaps : urls.map((url) => url.loc);
  const duplicates = locs.length - new Set(locs).size;
  const hosts = hostsOf(locs);

  issues.push(...locIssues(kind, locs, duplicates, hosts));
  issues.push(...countIssues(kind, locs.length, truncated));

  return {
    kind,
    rootElement: root.name,
    urls,
    childSitemaps,
    hosts,
    duplicates,
    ...dateRange(stamps),
    truncated,
    issues,
    feedTitle,
    hreflangCount,
  };
}

/** Emptiness and the protocol's 50 000 ceiling, which only sitemaps have. */
function countIssues(kind: FeedKind, count: number, truncated: boolean): SitemapIssue[] {
  const issues: SitemapIssue[] = [];
  const sitemap = kind === "urlset" || kind === "sitemapindex";

  if (count === 0 && !truncated) {
    issues.push({
      severity: "xeberdarliq",
      message: sitemap
        ? "Faylda bir dənə də ünvan yoxdur. Boş sitemap axtarış sisteminə heç nə demir."
        : "Lentdə bir dənə də element yoxdur.",
    });
  }

  if (sitemap && count > MAX_URLS_PER_SITEMAP) {
    issues.push({
      severity: "xeberdarliq",
      message: `Faylda ${count.toLocaleString("az-AZ")} ünvan var: protokolun həddi ${MAX_URLS_PER_SITEMAP.toLocaleString("az-AZ")}-dir. Faylı bölüb sitemap indeksi ilə birləşdirmək lazımdır.`,
    });
  }

  return issues;
}
