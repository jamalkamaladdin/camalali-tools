/**
 * Regex evaluation: build a RegExp from pattern + flags, run it against text,
 * and produce three views of the result — the match list, the highlighted
 * segments, and an optional replacement. Pure functions, no React and no DOM.
 */

export type RegexGroupValue = {
  /** 1-based position in the match array — the order `(` opens in the pattern. */
  number: number;
  name: string | null;
  value: string | undefined;
};

export type RegexMatch = {
  index: number;
  value: string;
  groups: RegexGroupValue[];
};

/** A run of text with a flag for whether the highlighter should mark it. */
export type RegexSegment = {
  text: string;
  isMatch: boolean;
};

export type RegexResult =
  | { ok: false; error: string }
  | {
      ok: true;
      matches: RegexMatch[];
      segments: RegexSegment[];
      /** True once MAX_MATCHES was hit — the list stops, the text does not. */
      truncated: boolean;
      /** Present only when a replacement string was supplied. */
      replacement: string | null;
    };

/**
 * A runaway `g` pattern (zero-length matches, or a large text) can otherwise
 * produce matches without bound; this caps the list so the tab stays alive.
 */
export const MAX_MATCHES = 10_000;

/**
 * Numbered groups are positional (`m[1]`, `m[2]`, …) in the order their `(`
 * opens, and named groups share that same order. `RegExpExecArray` exposes a
 * name→value map but not name→number, so the pattern source is walked once to
 * recover it — skipping escapes, character classes and non-capturing
 * constructs (`(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`). Good enough for the
 * patterns this tool is for; it is not a full regex parser.
 */
function parseGroupNames(pattern: string): Array<string | null> {
  const names: Array<string | null> = [];
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === "\\") {
      i++; // an escaped character is never syntax, skip it outright
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch !== "(") continue;

    if (pattern[i + 1] !== "?") {
      names.push(null); // plain capturing group
      continue;
    }
    const isNamed =
      pattern[i + 2] === "<" && pattern[i + 3] !== "=" && pattern[i + 3] !== "!";
    if (isNamed) {
      const close = pattern.indexOf(">", i + 3);
      names.push(close === -1 ? null : pattern.slice(i + 3, close));
      if (close !== -1) i = close;
    }
    // `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!` — none of these capture, skip.
  }

  return names;
}

function buildGroups(
  match: RegExpExecArray,
  names: Array<string | null>,
): RegexGroupValue[] {
  const groups: RegexGroupValue[] = [];
  for (let i = 1; i < match.length; i++) {
    groups.push({ number: i, name: names[i - 1] ?? null, value: match[i] });
  }
  return groups;
}

export function runRegex(params: {
  pattern: string;
  flags: string;
  text: string;
  /** `$1`, `$<name>` etc — native to `String.replace`, nothing to parse here. */
  replacement?: string;
}): RegexResult {
  const { pattern, flags, text, replacement } = params;

  if (pattern === "") {
    return { ok: false, error: "Boş ifadə: regex yaz." };
  }

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (err) {
    return {
      ok: false,
      error: `Xətalı ifadə: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const names = parseGroupNames(pattern);
  const repeat = re.global || re.sticky;

  const matches: RegexMatch[] = [];
  const segments: RegexSegment[] = [];
  let truncated = false;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }

    if (m.index > cursor) {
      segments.push({ text: text.slice(cursor, m.index), isMatch: false });
    }
    segments.push({ text: m[0], isMatch: true });
    cursor = m.index + m[0].length;
    matches.push({ index: m.index, value: m[0], groups: buildGroups(m, names) });

    if (!repeat) break; // no `g`/`y` — `exec` would return the same match forever

    // A zero-length match never moves `lastIndex` on its own, which is the
    // classic infinite loop with `g`; step forward by hand so it terminates.
    if (m[0].length === 0) re.lastIndex += 1;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }

  let replacementResult: string | null = null;
  if (replacement !== undefined) {
    // A fresh RegExp: the exec loop above may have advanced `lastIndex`, and
    // `replace` on a global/sticky pattern reads it as a starting point.
    replacementResult = text.replace(new RegExp(pattern, flags), replacement);
  }

  return { ok: true, matches, segments, truncated, replacement: replacementResult };
}
