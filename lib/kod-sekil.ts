/**
 * Code-to-image — the pure half.
 *
 * Two very different kinds of work live in this file and only one of them is
 * worth pinning down with a check suite.
 *
 * The layout maths — the gutter width, the canvas width and height, and the
 * parser for a visitor-typed line-range string — is plain arithmetic. It has
 * no dependency on `shiki`, no dependency on the DOM, and a wrong edit to it
 * produces a wrong number every time, deterministically. That is exactly what
 * `scripts/tools-checks/kod-sekil.mts` covers.
 *
 * `highlightCode` is close to untestable in a meaningful way without a real
 * browser: pinning shiki's exact token boundaries would be asserting a detail
 * of a third-party library's tokenizer, not a fact this project owns, and a
 * future shiki upgrade could re-split tokens in a harmless way that a strict
 * pin would still fail on. The check suite only smoke-tests that the pipeline
 * runs and returns something shaped right.
 *
 * Everything that actually touches `HTMLCanvasElement` — the rounded rect,
 * the gradient or solid fill, the three chrome dots, drawing the gutter and
 * each token's text at a pixel position, `canvas.toBlob`, the clipboard write
 * — had to move to `kod-sekil-tool.tsx`, a client component. None of that
 * exists in the Node process the check runner (`tsx`, no `canvas`, no
 * `document`) or the server that renders this tool's page runs in.
 */

import { createHighlighter, type Highlighter } from "shiki";

/* ---------- layout maths ---------- */

/** Digits in the largest line number — what decides how wide the gutter has to be. */
export function charDigitCount(n: number): number {
  const value = Math.max(1, Math.trunc(Math.abs(n)));
  return String(value).length;
}

/**
 * The line-number column's width: enough characters for the largest line
 * number, plus breathing room on both sides of it.
 */
export function computeLineNumberGutterWidth(
  maxLineNumber: number,
  charWidth: number,
  gutterPadding: number,
): number {
  return charDigitCount(maxLineNumber) * charWidth + gutterPadding * 2;
}

/**
 * The macOS-style traffic-light bar's fixed height. Named rather than left as
 * a bare number in `computeCanvasDimensions` below, because "40" on its own
 * reads as arbitrary and this is not — it is a title-bar height picked to sit
 * comfortably around three 12px dots plus their own padding.
 */
export const CHROME_HEIGHT_PX = 40;

export type CanvasDimensionsInput = {
  lineCount: number;
  longestLineChars: number;
  charWidth: number;
  lineHeight: number;
  /**
   * Not read below — width and height fall out of `charWidth` and
   * `lineHeight` alone, which are themselves derived from the font size by
   * the caller. Kept on the input type anyway so a caller can hand this
   * function the same options object it built for `charWidth`/`lineHeight`
   * without stripping fields first.
   */
  fontSize: number;
  padding: number;
  showLineNumbers: boolean;
  showChrome: boolean;
  gutterWidth: number;
};

/**
 * The overall PNG's dimensions. Width is the padding on both sides, plus the
 * gutter when line numbers are shown, plus the longest line's characters at
 * the font's fixed advance width. Height is the padding on both sides, plus
 * the chrome bar when shown, plus every line at the line height.
 */
export function computeCanvasDimensions(
  options: CanvasDimensionsInput,
): { width: number; height: number } {
  const {
    lineCount,
    longestLineChars,
    charWidth,
    lineHeight,
    padding,
    showLineNumbers,
    showChrome,
    gutterWidth,
  } = options;

  const width = padding * 2 + (showLineNumbers ? gutterWidth : 0) + longestLineChars * charWidth;
  const height = padding * 2 + (showChrome ? CHROME_HEIGHT_PX : 0) + lineCount * lineHeight;

  return { width: Math.round(width), height: Math.round(height) };
}

const SINGLE_LINE = /^(\d+)$/;
const LINE_RANGE = /^(\d+)-(\d+)$/;

/**
 * Parses a visitor-typed spec like `"2,4-6,9"` into the set of highlighted
 * line numbers — `{2,4,5,6,9}`. Built to never throw: a highlight spec is
 * typed by hand next to a code paste, so a stray comma or a transposed digit
 * is the normal case, not the exceptional one.
 *
 * A malformed token (`"abc"`, `"5-"`, decimals) is skipped and the rest of
 * the spec is still honoured. A reversed range (`"5-2"`) is also skipped
 * rather than read backwards or normalised to `2-5` — silently reinterpreting
 * what was typed would highlight lines the visitor never named, which is a
 * worse failure than highlighting nothing for that one token. A line number
 * of zero or a negative number is likewise skipped: there is no line zero to
 * highlight, and this function has no line count to check an upper bound
 * against, so zero and negative are the only "out of range" it can catch.
 */
export function parseLineRanges(spec: string): Set<number> {
  const result = new Set<number>();
  const trimmed = spec.trim();
  if (trimmed === "") return result;

  for (const rawToken of trimmed.split(",")) {
    const token = rawToken.trim();
    if (token === "") continue;

    const rangeMatch = token.match(LINE_RANGE);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start <= 0 || end <= 0 || start > end) continue;
      for (let line = start; line <= end; line += 1) result.add(line);
      continue;
    }

    const singleMatch = token.match(SINGLE_LINE);
    if (singleMatch) {
      const value = Number(singleMatch[1]);
      if (value > 0) result.add(value);
      continue;
    }

    // Anything else ("abc", "5.5", "-3") is a typo, not an error.
  }

  return result;
}

/* ---------- tokenization (shiki) ---------- */

/**
 * The languages a working developer actually pastes here, kept small on
 * purpose — every entry is a grammar bundled into the site's own JS.
 */
const LANG_IDS = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "python",
  "bash",
  "json",
  "css",
  "html",
  "sql",
  "yaml",
  "go",
  "rust",
  "markdown",
] as const;

export type SupportedLang = (typeof LANG_IDS)[number];

const LANG_LABELS: Record<SupportedLang, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  tsx: "TSX",
  jsx: "JSX",
  python: "Python",
  bash: "Bash",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  sql: "SQL",
  yaml: "YAML",
  go: "Go",
  rust: "Rust",
  markdown: "Markdown",
};

export type LangOption = { value: SupportedLang; label: string };

export const SUPPORTED_LANGS: LangOption[] = LANG_IDS.map((id) => ({
  value: id,
  label: LANG_LABELS[id],
}));

/*
 * Kept small for bundle size. "github-light"/"github-dark" match how this
 * project already renders code elsewhere (`mdx-content.tsx`), and two more
 * bundled themes are here for visual variety.
 */
const THEME_IDS = ["github-light", "github-dark", "dracula", "nord"] as const;

export type SupportedTheme = (typeof THEME_IDS)[number];

const THEME_LABELS: Record<SupportedTheme, string> = {
  "github-light": "GitHub Light",
  "github-dark": "GitHub Dark",
  dracula: "Dracula",
  nord: "Nord",
};

export type ThemeOption = { value: SupportedTheme; label: string };

export const SUPPORTED_THEMES: ThemeOption[] = THEME_IDS.map((id) => ({
  value: id,
  label: THEME_LABELS[id],
}));

export type HighlightToken = { content: string; color: string };
export type HighlightedLine = HighlightToken[];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [...THEME_IDS],
    langs: [...LANG_IDS],
  });
  return highlighterPromise;
}

/**
 * Tokenizes `code` under `lang`/`theme` into per-line, per-token content and
 * colour. Shiki itself has no DOM dependency — it already runs server-side in
 * this project to render MDX code blocks — so calling it from this
 * Node-testable file is legitimate; only the pixels it feeds move to the
 * widget.
 */
export async function highlightCode(
  code: string,
  lang: SupportedLang,
  theme: SupportedTheme,
): Promise<HighlightedLine[]> {
  const highlighter = await getHighlighter();
  const { tokens } = highlighter.codeToTokens(code, { lang, theme });
  return tokens.map((line) => line.map((token) => ({ content: token.content, color: token.color ?? "#000000" })));
}
