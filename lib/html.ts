/*
 * A tolerant HTML reader for the tools that look at somebody else's page.
 *
 * This is a scanner, not a validator and not a browser. Real pages have tags
 * that are never closed, attributes without quotes, tag names in capitals and
 * entities the author typed by hand — a parser that refuses any of those
 * refuses most of the web, so every one of them is accepted here and turned
 * into the closest sensible answer.
 *
 * No dependencies and no DOM: the same functions run in a route handler and in
 * the browser, which is what lets a tool preview its result client-side and
 * still agree with what the server computed.
 */

/*
 * The named entities worth carrying without a full HTML entity table.
 *
 * The table has around 2200 names in it, almost all of which never appear in
 * a title or a meta description. These are the ones that do, plus the five the
 * specification requires anybody to understand.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  minus: "−",
  shy: "­",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  bdquo: "„",
  sbquo: "‚",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  sup2: "²",
  sup3: "³",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  dagger: "†",
  permil: "‰",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  ne: "≠",
  le: "≤",
  ge: "≥",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "‌",
  zwj: "‍",
};

/*
 * The handful that browsers still decode when the author forgot the semicolon.
 * Extending this set is how `&amperes` starts decoding as `&peres`, so it
 * stays at the names that actually show up written that way.
 */
const LEGACY_BARE = new Set(["amp", "lt", "gt", "quot", "nbsp", "copy", "reg"]);

/*
 * Bytes 0x80-0x9F are undefined in Unicode but are written as numeric
 * references all the time, by editors that meant Windows-1252. `&#146;` is a
 * right single quote in every browser, so it is one here too.
 */
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

const REPLACEMENT = "�";

function fromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0) return REPLACEMENT;
  const mapped = CP1252[code] ?? code;
  /* Lone surrogates and anything past the last plane are not characters, and
     `String.fromCodePoint` throws on them rather than returning nonsense. */
  if (mapped > 0x10ffff) return REPLACEMENT;
  if (mapped >= 0xd800 && mapped <= 0xdfff) return REPLACEMENT;
  if (mapped === 0) return REPLACEMENT;
  return String.fromCodePoint(mapped);
}

/**
 * Turns `&amp;`, `&#39;` and `&#x2019;` back into the characters they stand for.
 *
 * An unknown name is left exactly as written: `&notreal;` is far more likely
 * to be text the author wanted than an entity this table is missing, and
 * silently deleting it would be the worse mistake of the two.
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;

  return text.replace(
    /&(#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31})(;?)/g,
    (whole, body: string, semicolon: string) => {
      if (body.startsWith("#")) {
        /* A numeric reference without its semicolon is still unambiguous - the
           digits end it - so it is decoded either way. */
        const hex = body[1] === "x" || body[1] === "X";
        const digits = hex ? body.slice(2) : body.slice(1);
        return fromCodePoint(Number.parseInt(digits, hex ? 16 : 10));
      }

      const name = body;
      const known = NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()];
      if (known === undefined) return whole;
      if (semicolon === "" && !LEGACY_BARE.has(name.toLowerCase())) return whole;
      return known;
    },
  );
}

/* Everything inside these is program text, not page text. */
const RAW_TEXT_ELEMENTS = ["script", "style", "noscript", "template", "svg"];

/*
 * Elements that never have content, so nothing may be searched for a closer.
 * `meta` and `link` are the two the tools here actually read.
 */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Reduces a document to the words a reader would see.
 *
 * `<script>` and `<style>` go with their contents rather than leaving their
 * source behind as text — dropping only the tags is the classic bug that puts
 * a page's JavaScript into its own description.
 */
export function stripTags(html: string): string {
  let text = html;

  /* Comments first: a comment may legally contain something that looks like a
     tag, and removing tags first would leave its halves behind. */
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  for (const element of RAW_TEXT_ELEMENTS) {
    /* The closing tag is optional in this pattern so a truncated page - one
       whose `</script>` never arrived - loses the rest of the file rather than
       spilling its source into the output. */
    text = text.replace(
      new RegExp(`<${element}\\b[^>]*>[\\s\\S]*?(?:</${element}\\s*>|$)`, "gi"),
      " ",
    );
  }

  /* Doctype, processing instructions and CDATA are markup too. */
  text = text.replace(/<![\s\S]*?>/g, " ");
  text = text.replace(/<\?[\s\S]*?\?>/g, " ");

  /* Any remaining tag, including one whose attribute value holds a `>`. */
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  /* A lone `<` that never became a tag is text, and stays. */

  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

export type HtmlTag = {
  /** Lowercased, so `<META>` and `<meta>` are the same tag. */
  name: string;
  /** Keys lowercased, values entity-decoded. */
  attrs: Record<string, string>;
  /** Raw markup between the open and the close, or "" when there is none. */
  inner: string;
  /** Offset of the opening `<` in the input, so callers can order or slice. */
  index: number;
};

/** True for the characters HTML allows to start a tag name. */
function isNameStart(char: string): boolean {
  return /[a-zA-Z]/.test(char);
}

/**
 * Reads the attributes between a tag name and its `>`.
 *
 * Returns where the tag ended so the scanner can carry on, which is the part
 * a regex cannot do: `<a title="a > b">` has a `>` that does not end anything.
 */
function readAttributes(
  html: string,
  start: number,
): { attrs: Record<string, string>; end: number; selfClosing: boolean } {
  const attrs: Record<string, string> = {};
  let index = start;
  let selfClosing = false;

  while (index < html.length) {
    while (index < html.length && /\s/.test(html[index])) index += 1;
    if (index >= html.length) break;

    if (html[index] === ">") {
      index += 1;
      break;
    }
    if (html[index] === "/") {
      selfClosing = true;
      index += 1;
      continue;
    }

    const nameStart = index;
    while (index < html.length && !/[\s/>=]/.test(html[index])) index += 1;
    const name = html.slice(nameStart, index).toLowerCase();
    if (name === "") {
      /* Nothing was consumed, which would loop forever. Step over the
         character instead - a stray `=` is not worth abandoning the tag for. */
      index += 1;
      continue;
    }

    while (index < html.length && /\s/.test(html[index])) index += 1;

    if (html[index] !== "=") {
      /* A bare attribute (`<input disabled>`) is present, with an empty value,
         which is exactly how a browser reports it. */
      if (!(name in attrs)) attrs[name] = "";
      continue;
    }

    index += 1;
    while (index < html.length && /\s/.test(html[index])) index += 1;

    const quote = html[index];
    let value: string;
    if (quote === '"' || quote === "'") {
      index += 1;
      const valueStart = index;
      while (index < html.length && html[index] !== quote) index += 1;
      value = html.slice(valueStart, index);
      /* An unterminated quote runs to the end of the document; taking what is
         there beats discarding the tag. */
      if (index < html.length) index += 1;
    } else {
      const valueStart = index;
      while (index < html.length && !/[\s>]/.test(html[index])) index += 1;
      value = html.slice(valueStart, index);
    }

    /* First wins, the way browsers treat a repeated attribute. */
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }

  return { attrs, end: index, selfClosing };
}

/*
 * Why these two scan by hand instead of lowercasing the document once.
 *
 * `html.toLowerCase()` does not preserve indices. `İ` (U+0130, the capital
 * dotted I) lowercases to TWO code units - `i` plus a combining dot - so every
 * position after the first one shifts by one, and an index found in the lower
 * copy then points one character early in the original. On an Azerbaijani site
 * that letter is not an edge case, it is in ordinary prose, and the symptom is
 * a tag boundary landing mid-word with no error anywhere.
 *
 * Tag names are ASCII by definition, so the comparison only has to fold A-Z.
 * Doing it a character at a time keeps every index in the caller's own string.
 */

/** ASCII-only fold, which is all a tag name can need and the only fold that keeps lengths. */
function asciiLower(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

/** True when `html` spells `name` at `at`, ignoring ASCII case. */
function matchesName(html: string, name: string, at: number): boolean {
  for (let i = 0; i < name.length; i += 1) {
    if (asciiLower(html.charCodeAt(at + i)) !== name.charCodeAt(i)) return false;
  }
  return true;
}

/** Index of the next `<name` opening at or after `from`, or -1. */
function nextOpening(html: string, name: string, from: number): number {
  for (let at = html.indexOf("<", from); at !== -1; at = html.indexOf("<", at + 1)) {
    if (!matchesName(html, name, at + 1)) continue;
    const after = html[at + 1 + name.length];
    if (after === undefined || /[\s/>]/.test(after)) return at;
  }
  return -1;
}

/** Index of the next `</name>` at or after `from`, or -1. */
function nextClosing(html: string, name: string, from: number): number {
  for (let at = html.indexOf("</", from); at !== -1; at = html.indexOf("</", at + 1)) {
    if (!matchesName(html, name, at + 2)) continue;
    const after = html[at + 2 + name.length];
    if (after === undefined || /[\s>]/.test(after)) return at;
  }
  return -1;
}

/**
 * Decides where a tag's content ends.
 *
 * Well-formed nesting is counted, so the outer of two `<div>`s keeps the inner
 * one. When no closing tag exists at all the element is treated as
 * self-terminating and ends at the next one of its own kind, which is what an
 * unclosed `<a>` or `<li>` means in practice — and, more to the point, is what
 * keeps this function returning at all on a page full of them.
 */
function innerRange(html: string, name: string, contentStart: number): [number, number] {
  let depth = 0;
  let cursor = contentStart;

  for (;;) {
    const open = nextOpening(html, name, cursor);
    const close = nextClosing(html, name, cursor);

    if (close === -1) break;

    if (open !== -1 && open < close) {
      depth += 1;
      cursor = open + name.length + 1;
      continue;
    }

    if (depth === 0) return [contentStart, close];
    depth -= 1;
    cursor = close + name.length + 2;
  }

  const orphan = nextOpening(html, name, contentStart);
  return [contentStart, orphan === -1 ? html.length : orphan];
}

/**
 * Every `<name ...>` in the document, in the order they appear.
 *
 * Nested tags of the same name are all reported, outer first, because a caller
 * counting headings wants the count and a caller reading the first one only
 * looks at `[0]`.
 */
export function collectTags(html: string, name: string): HtmlTag[] {
  const wanted = name.toLowerCase();
  const isVoid = VOID_ELEMENTS.has(wanted);
  const found: HtmlTag[] = [];

  let index = 0;
  while (index < html.length) {
    const at = html.indexOf("<", index);
    if (at === -1) break;

    /* Comments and declarations are skipped whole so a tag name mentioned
       inside one is not mistaken for markup. */
    if (html.startsWith("<!--", at)) {
      const end = html.indexOf("-->", at + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }

    const first = html[at + 1];
    if (first === undefined || !isNameStart(first)) {
      index = at + 1;
      continue;
    }

    let cursor = at + 1;
    while (cursor < html.length && /[a-zA-Z0-9:_.-]/.test(html[cursor])) cursor += 1;
    const tagName = html.slice(at + 1, cursor).toLowerCase();

    if (tagName !== wanted) {
      index = cursor;
      continue;
    }

    const { attrs, end, selfClosing } = readAttributes(html, cursor);
    const inner =
      isVoid || selfClosing ? "" : html.slice(...innerRange(html, wanted, end));

    found.push({ name: tagName, attrs, inner, index: at });
    index = end;
  }

  return found;
}

/** One attribute of a tag, or null when it is not there. */
export function attr(tag: HtmlTag, name: string): string | null {
  return tag.attrs[name.toLowerCase()] ?? null;
}

/**
 * Resolves a link against the page it was found on.
 *
 * Returns null rather than throwing, and null rather than guessing: a value
 * `URL` cannot parse is a value this site should not be turning into a request.
 */
export function absoluteUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (trimmed === "") return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}
