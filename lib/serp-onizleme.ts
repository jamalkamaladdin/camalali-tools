/**
 * A Google result preview measured in pixels instead of characters.
 *
 * The `meta` tool next door counts characters, and its FAQ says why: nobody
 * outside Google can reproduce Google's clipping exactly, because Google
 * renders in its own font. This tool fills that gap from the other side rather
 * than pretending the gap is not there — it estimates the rendered width from
 * a bundled Arial advance-width table, and it draws the preview inside a box
 * of the reported clipping width so the browser's own `text-overflow` performs
 * the cut. The number is an estimate and the page says so; the cut is real.
 *
 * Everything here is pure string arithmetic. `toplu-meta` imports the same
 * `estimateWidth` and the same limits, so a title judged "uzun" in the bulk
 * table is the title that clips in the single preview.
 */

export type SerpDevice = "desktop" | "mobile";

export type SerpLimit = {
  /** The width of the title line. A title has one line, so this is its whole budget. */
  titlePx: number;
  /** The width of the description box. */
  descriptionPx: number;
  /** How many lines that box gets before the browser clips it. */
  descriptionLines: number;
};

/*
 * The four numbers every SERP preview quotes. They are the *widely reported*
 * clipping widths, not a measurement taken here: Google renders in its own
 * font, at a column width it changes without notice, and no page on this site
 * can observe that. They live as named constants because the preview box, the
 * verdicts and the honesty statement all have to be built from the same four
 * numbers — a box drawn at one width while the readout judges another is the
 * exact failure this tool exists to avoid.
 *
 * A description's whole budget is `descriptionPx * descriptionLines`, which is
 * what `descriptionBudgetPx` returns; the box is drawn at `descriptionPx` and
 * clamped to `descriptionLines`, so text past the budget is text the visitor
 * watches disappear.
 */
export const SERP_LIMITS: Record<SerpDevice, SerpLimit> = {
  desktop: { titlePx: 600, descriptionPx: 990, descriptionLines: 2 },
  mobile: { titlePx: 400, descriptionPx: 350, descriptionLines: 3 },
};

export const SERP_DEVICES: SerpDevice[] = ["desktop", "mobile"];

/** What the visitor's own language calls each device, for a label or a CSV column. */
export const SERP_DEVICE_LABELS: Record<SerpDevice, string> = {
  desktop: "masaüstü",
  mobile: "mobil",
};

/*
 * The two sizes the snippet is drawn at — and the two sizes the estimate is
 * taken at. One pair for both jobs on purpose: a preview rendered at 20px
 * while the readout measures 18px would disagree with itself on the screen.
 */
export const TITLE_FONT_PX = 20;
export const DESCRIPTION_FONT_PX = 14;

/**
 * The font the preview is drawn in, and the font the width table came from.
 * Arial is not what Google renders with, but it is the closest metric-complete
 * family present on every desktop platform — and it carries the Azerbaijani
 * letters, which is the part that decides whether this tool is usable here at
 * all. Drawing the box in a different family than the table was taken from
 * would make the estimate and the visible cut disagree by design.
 */
export const PREVIEW_FONT_STACK = 'Arial, Helvetica, "Liberation Sans", sans-serif';

/** The description's whole pixel budget on this device: box width times the lines it gets. */
export function descriptionBudgetPx(device: SerpDevice): number {
  const limits = SERP_LIMITS[device];
  return limits.descriptionPx * limits.descriptionLines;
}

/* ---------- the width table ---------- */

/*
 * Arial advance widths, in font design units per em. Grouped by width rather
 * than listed per character, because the thing a reader has to be able to
 * check is that `W` is nearly four times `i` and that `ə` is not missing.
 *
 * The Azerbaijani letters are not decoration here. A title written in this
 * language is full of `ə`, `ı`, `ş` and `ğ`, and a table without them would
 * fall back on every second character — which is the same as not measuring.
 * Each one carries the advance of the base letter it is drawn from, which is
 * how the diacritic forms are built in the font: `ğ` is `g` with a breve over
 * it and takes exactly `g`'s width, `İ` is `I` with a dot.
 */
const UNITS_PER_EM = 1000;

/** Anything outside the table — an emoji, a Cyrillic letter, a rare symbol. The advance of a digit, which is the middle of this font. */
const FALLBACK_ADVANCE = 556;

const ADVANCE_GROUPS: [chars: string, advance: number][] = [
  ["'", 191],
  ["ijlı‘’", 222],
  ["|", 260],
  [" !,./:;\\[]ftIİ", 278],
  ["()-`r“”", 333],
  ["{}", 334],
  ["•", 350],
  ['"', 355],
  ["*", 389],
  ["^", 469],
  ["Jcksvxyzçş", 500],
  ["#$_0123456789abdeghnopquL–«»əğöü", 556],
  ["+<=>~", 584],
  ["FTZ", 611],
  ["&ABEKPSVXYƏŞ", 667],
  ["CDHNRUwÇÜ", 722],
  ["GOQÖĞ", 778],
  ["Mm", 833],
  ["%", 889],
  ["W", 944],
  ["—…", 1000],
  ["@", 1015],
];

const ADVANCE = new Map<string, number>();
for (const [chars, advance] of ADVANCE_GROUPS) {
  for (const char of chars) ADVANCE.set(char, advance);
}

/**
 * How wide this text renders at this size, in whole pixels.
 *
 * Iterated by code point rather than by UTF-16 unit, so a character outside
 * the basic plane costs one fallback advance instead of two. Kerning is not
 * modelled — Arial's kern pairs move a title by a pixel or two, which is well
 * inside the error the unknown font already contributes.
 */
export function estimateWidth(text: string, fontSizePx: number): number {
  let units = 0;
  for (const char of text) units += ADVANCE.get(char) ?? FALLBACK_ADVANCE;
  return Math.round((units * fontSizePx) / UNITS_PER_EM);
}

export const ELLIPSIS = "…";

/**
 * The text as it would survive a cut at `maxPx`, ending on a whole word.
 *
 * Cutting mid-word is what makes a generated preview look wrong even when the
 * width is right — Google breaks at the last word that fits and adds the
 * ellipsis after it. The ellipsis has to be paid for out of the same budget,
 * or the "truncated" string is itself too wide.
 *
 * One case cannot obey the rule: a single word wider than the whole box. There
 * the choice is a character cut or an empty string, and an empty string tells
 * the visitor nothing, so the characters are cut and the caller still gets
 * `truncated: true`.
 */
export function truncateToWidth(
  text: string,
  maxPx: number,
  fontSizePx: number,
): { text: string; truncated: boolean } {
  const source = text.trim();
  if (source === "") return { text: "", truncated: false };
  if (estimateWidth(source, fontSizePx) <= maxPx) return { text: source, truncated: false };

  const budget = maxPx - estimateWidth(ELLIPSIS, fontSizePx);

  let kept = "";
  for (const word of source.split(/\s+/)) {
    const candidate = kept === "" ? word : `${kept} ${word}`;
    if (estimateWidth(candidate, fontSizePx) > budget) break;
    kept = candidate;
  }
  if (kept !== "") return { text: `${kept}${ELLIPSIS}`, truncated: true };

  let letters = "";
  for (const char of source) {
    if (estimateWidth(letters + char, fontSizePx) > budget) break;
    letters += char;
  }
  return { text: `${letters}${ELLIPSIS}`, truncated: true };
}

/* ---------- verdicts ---------- */

export type LengthVerdict = "qisa" | "uygun" | "uzun";

/**
 * Below this share of the budget a snippet is "qisa" — not broken, but leaving
 * room Google would have shown. Half is a deliberate choice rather than a
 * measured one: it puts a desktop title under 30 average characters and a
 * desktop description under 70 into the warning, which is where the advice a
 * visitor has already read puts them.
 */
const SHORT_RATIO = 0.5;

export type LengthReading = { chars: number; px: number; verdict: LengthVerdict };

function verdictFor(px: number, budgetPx: number): LengthVerdict {
  if (px > budgetPx) return "uzun";
  if (px < budgetPx * SHORT_RATIO) return "qisa";
  return "uygun";
}

/** Code points, not UTF-16 units — `ə` and `İ` are one character each to the person who typed them. */
function countChars(text: string): number {
  return Array.from(text).length;
}

export function judgeTitle(title: string, device: SerpDevice): LengthReading {
  const text = title.trim();
  const px = estimateWidth(text, TITLE_FONT_PX);
  return { chars: countChars(text), px, verdict: verdictFor(px, SERP_LIMITS[device].titlePx) };
}

export function judgeDescription(text: string, device: SerpDevice): LengthReading {
  const trimmed = text.trim();
  const px = estimateWidth(trimmed, DESCRIPTION_FONT_PX);
  return { chars: countChars(trimmed), px, verdict: verdictFor(px, descriptionBudgetPx(device)) };
}

/** The visitor-facing word for a verdict, used by the readout and by the bulk CSV. */
export const VERDICT_LABELS: Record<LengthVerdict, string> = {
  qisa: "qısa",
  uygun: "uyğun",
  uzun: "uzun",
};

/* ---------- the address line ---------- */

const BREADCRUMB_SEPARATOR = "›";

/** A bare host is not a valid `URL` base by itself; https is assumed for parsing and for display alike. */
function ensureScheme(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

/** A percent-escaped Azerbaijani path segment is unreadable; a malformed one must not take the whole line down with it. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The address as Google draws it: no scheme, no `www.`, and the path as a
 * breadcrumb trail rather than a slash-separated string.
 *
 * This is not cosmetic. The old green URL line was as wide as the path was
 * long; the breadcrumb is what the visitor actually sees above the title, and
 * a preview showing the raw URL would be previewing a page Google stopped
 * drawing years ago. A query string is dropped for the same reason — it is not
 * on that line.
 */
export function displayUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "nümunə.com";

  let parsed: URL;
  try {
    parsed = new URL(ensureScheme(trimmed));
  } catch {
    return trimmed; // an address that does not parse is still what the visitor typed
  }

  const host = parsed.hostname.replace(/^www\./i, "");
  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map(decodeSegment);

  return [host, ...segments].join(` ${BREADCRUMB_SEPARATOR} `);
}
