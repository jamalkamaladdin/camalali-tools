/**
 * Finds the characters a paste brought in that the visitor never typed —
 * invisible spacing characters, a non-breaking space standing in for a
 * plain one, curly quotes and long dashes an editor's autocorrect
 * substituted, doubled spaces, trailing whitespace, runs of blank lines and
 * a mix of line-ending styles — and shows exactly where each one sits before
 * removing anything.
 *
 * Every rule is independently switchable, mirroring `kanonik.ts`'s model:
 * an enabled rule that finds nothing here simply contributes no findings,
 * a disabled rule is not run at all. Findings are always computed against
 * the original text, not against whatever an earlier rule already changed,
 * so a reported line and column never shift depending on which other rules
 * happen to be on.
 *
 * Every special character below is written as a `\u` escape rather than
 * typed literally, the same reasoning `metn-statistikasi.ts` documents for
 * its own abbreviation placeholder: a zero-width or non-breaking character
 * typed directly into a source file risks being silently dropped or
 * normalised by an editor or a transfer step, while an escape sequence
 * cannot be.
 */

export type CleanupRuleId =
  | "invisible"
  | "nbsp"
  | "smart-quotes"
  | "long-dashes"
  | "double-spaces"
  | "trailing-whitespace"
  | "extra-blank-lines"
  | "mixed-line-endings";

export const CLEANUP_RULES: CleanupRuleId[] = [
  "invisible",
  "nbsp",
  "smart-quotes",
  "long-dashes",
  "double-spaces",
  "trailing-whitespace",
  "extra-blank-lines",
  "mixed-line-endings",
];

export const CLEANUP_RULE_LABELS: Record<CleanupRuleId, string> = {
  invisible: "Görünməz simvollar (ZWSP, ZWNJ, ZWJ, BOM, yumşaq defis)",
  nbsp: "Qırılmayan boşluq (NBSP) adi boşluğa salınır",
  "smart-quotes": "Ağıllı dırnaqlar düz dırnağa salınır",
  "long-dashes": "Uzun və qısa tirelər defisə salınır",
  "double-spaces": "İkiqat və artıq boşluqlar birləşdirilir",
  "trailing-whitespace": "Sətir sonundakı boşluqlar silinir",
  "extra-blank-lines": "Üçdən çox ardıcıl boş sətir qısaldılır",
  "mixed-line-endings": "Qarışıq sətir sonları (CRLF/LF) LF-ə salınır",
};

export type Finding = {
  rule: CleanupRuleId;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** 0-based code-unit offset in the original text — a stable sort key across rules. */
  index: number;
  /** The exact matched text, for display; an invisible character shows as its abbreviation instead, see the detector functions below. */
  display: string;
};

/* ---------- position lookup ---------- */

/** One entry per line start, so a match's line/column is a binary search rather than a rescan of everything before it. */
function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function positionAt(lineStarts: number[], index: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: index - lineStarts[low] + 1 };
}

/* ---------- what each rule looks for ---------- */

type RawMatch = { index: number; display: string };

const ZWSP = "\u200B";
const ZWNJ = "\u200C";
const ZWJ = "\u200D";
const BOM = "\uFEFF";
const SOFT_HYPHEN = "\u00AD";
const NBSP = "\u00A0";
const CURLY_DOUBLE_OPEN = "\u201C";
const CURLY_DOUBLE_CLOSE = "\u201D";
const CURLY_SINGLE_OPEN = "\u2018";
const CURLY_SINGLE_CLOSE = "\u2019";
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

const INVISIBLE_NAMES: Record<string, string> = {
  [ZWSP]: "ZWSP",
  [ZWNJ]: "ZWNJ",
  [ZWJ]: "ZWJ",
  [BOM]: "BOM",
  [SOFT_HYPHEN]: "SHY",
};
const INVISIBLE_PATTERN = new RegExp(`[${ZWSP}${ZWNJ}${ZWJ}${BOM}${SOFT_HYPHEN}]`, "g");

const SMART_QUOTES: Record<string, string> = {
  [CURLY_DOUBLE_OPEN]: '"',
  [CURLY_DOUBLE_CLOSE]: '"',
  [CURLY_SINGLE_OPEN]: "'",
  [CURLY_SINGLE_CLOSE]: "'",
};
const SMART_QUOTE_PATTERN = new RegExp(
  `[${CURLY_DOUBLE_OPEN}${CURLY_DOUBLE_CLOSE}${CURLY_SINGLE_OPEN}${CURLY_SINGLE_CLOSE}]`,
  "g",
);

const LONG_DASHES: Record<string, string> = { [EM_DASH]: "-", [EN_DASH]: "-" };
const LONG_DASH_PATTERN = new RegExp(`[${EM_DASH}${EN_DASH}]`, "g");

const NBSP_PATTERN = new RegExp(NBSP, "g");

function scan(text: string, pattern: RegExp, describe: (matched: string) => string): RawMatch[] {
  const found: RawMatch[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.push({ index: match.index, display: describe(match[0]) });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return found;
}

function findInvisible(text: string): RawMatch[] {
  return scan(text, INVISIBLE_PATTERN, (char) => INVISIBLE_NAMES[char] ?? "?");
}

function findNbsp(text: string): RawMatch[] {
  return scan(text, NBSP_PATTERN, () => "NBSP");
}

function findSmartQuotes(text: string): RawMatch[] {
  return scan(text, SMART_QUOTE_PATTERN, (char) => `${char} -> ${SMART_QUOTES[char]}`);
}

function findLongDashes(text: string): RawMatch[] {
  return scan(text, LONG_DASH_PATTERN, (char) => `${char} -> ${LONG_DASHES[char]}`);
}

function findDoubleSpaces(text: string): RawMatch[] {
  return scan(text, /[ \t]{2,}/g, (run) => `${run.length} boşluq`);
}

/* The lookahead accepts an optional `\r` before the line break rather than
   matching `$` directly, so trailing whitespace on a CRLF-ending line is
   still found without the match swallowing the `\r` itself — the
   mixed-line-endings rule is the one that owns removing that character. */
function findTrailingWhitespace(text: string): RawMatch[] {
  return scan(text, /[ \t]+(?=\r?$)/gm, (run) => `${run.length} boşluq`);
}

/*
 * A run of N newlines separates N-1 blank lines: three newlines in a row
 * leave two blank lines between the text before and after them. The rule
 * removes anything past three blank lines, which is a run of five or more
 * newlines; the boundary is written as newline counts throughout so the
 * off-by-one only has to be reasoned about once, here.
 */
const MAX_BLANK_LINES = 3;
const EXCESS_NEWLINE_RUN = new RegExp(`\\n{${MAX_BLANK_LINES + 2},}`, "g");

function findExtraBlankLines(text: string): RawMatch[] {
  return scan(text, EXCESS_NEWLINE_RUN, (run) => `${run.length - 1} boş sətir`);
}

function findMixedLineEndings(text: string): RawMatch[] {
  return scan(text, /\r\n?/g, (run) => (run === "\r\n" ? "CRLF" : "CR"));
}

const DETECTORS: Record<CleanupRuleId, (text: string) => RawMatch[]> = {
  invisible: findInvisible,
  nbsp: findNbsp,
  "smart-quotes": findSmartQuotes,
  "long-dashes": findLongDashes,
  "double-spaces": findDoubleSpaces,
  "trailing-whitespace": findTrailingWhitespace,
  "extra-blank-lines": findExtraBlankLines,
  "mixed-line-endings": findMixedLineEndings,
};

/* ---------- what each rule does ---------- */

function applyInvisible(text: string): string {
  return text.replace(INVISIBLE_PATTERN, "");
}

function applyNbsp(text: string): string {
  return text.replace(NBSP_PATTERN, " ");
}

function applySmartQuotes(text: string): string {
  return text.replace(SMART_QUOTE_PATTERN, (char) => SMART_QUOTES[char]);
}

function applyLongDashes(text: string): string {
  return text.replace(LONG_DASH_PATTERN, (char) => LONG_DASHES[char]);
}

function applyDoubleSpaces(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ");
}

function applyTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+(?=\r?$)/gm, "");
}

function applyExtraBlankLines(text: string): string {
  return text.replace(EXCESS_NEWLINE_RUN, "\n".repeat(MAX_BLANK_LINES + 1));
}

/* Order matters here: CRLF is turned into LF before a lone CR is, so a CRLF
   pair is never counted as a CRLF followed by a spurious extra LF. */
function applyMixedLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const TRANSFORMERS: Record<CleanupRuleId, (text: string) => string> = {
  invisible: applyInvisible,
  nbsp: applyNbsp,
  "smart-quotes": applySmartQuotes,
  "long-dashes": applyLongDashes,
  "double-spaces": applyDoubleSpaces,
  "trailing-whitespace": applyTrailingWhitespace,
  "extra-blank-lines": applyExtraBlankLines,
  "mixed-line-endings": applyMixedLineEndings,
};

/* ---------- the public API ---------- */

export type CleanResult = {
  output: string;
  findings: Finding[];
  countsByRule: Record<CleanupRuleId, number>;
};

/*
 * The order the output pipeline actually runs in, which is not
 * `CLEANUP_RULES`'s declaration order (that order drives the checkbox list
 * and is alphabetical-by-topic for a visitor scanning it, not
 * implementation-dependent). Line-ending normalisation has to run first
 * here: `extra-blank-lines` counts a blank line as a run of plain `\n`
 * characters, and a `\r` sitting between them on a CRLF file would hide
 * the run from that rule entirely if it ran first.
 */
const OUTPUT_ORDER: CleanupRuleId[] = [
  "mixed-line-endings",
  "invisible",
  "nbsp",
  "smart-quotes",
  "long-dashes",
  "double-spaces",
  "trailing-whitespace",
  "extra-blank-lines",
];

/**
 * Runs every enabled rule. Findings are collected against the untouched
 * input, in `CLEANUP_RULES`'s declared order, so their positions stay
 * meaningful regardless of which other rules are also on; the output is
 * then built separately, by applying the enabled rules in `OUTPUT_ORDER`.
 */
export function cleanupText(text: string, enabled: Set<CleanupRuleId>): CleanResult {
  const lineStarts = buildLineStarts(text);
  const findings: Finding[] = [];
  const countsByRule = {} as Record<CleanupRuleId, number>;

  for (const rule of CLEANUP_RULES) {
    countsByRule[rule] = 0;
    if (!enabled.has(rule)) continue;
    const matches = DETECTORS[rule](text);
    countsByRule[rule] = matches.length;
    for (const match of matches) {
      const { line, column } = positionAt(lineStarts, match.index);
      findings.push({ rule, line, column, index: match.index, display: match.display });
    }
  }
  findings.sort((a, b) => a.index - b.index);

  let output = text;
  for (const rule of OUTPUT_ORDER) {
    if (enabled.has(rule)) output = TRANSFORMERS[rule](output);
  }

  return { output, findings, countsByRule };
}

export function totalFindings(result: CleanResult): number {
  return result.findings.length;
}
