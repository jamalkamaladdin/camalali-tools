/**
 * A deliberately narrow JavaScript minifier: comments and whitespace only,
 * never identifier mangling. Mangling needs a real parser to know which
 * names are safe to rename — a hand-written regex pass would rename a
 * property access (`obj.count`) along with a local variable (`count`) and
 * silently break the code it touched. That is out of scope for this file on
 * purpose, and the tool says so.
 *
 * The actual difficulty here is not the rules, it is telling code apart from
 * the three things that must never be rewritten inside: a string, a template
 * literal (including whatever runs inside its `${ }`) and a regex literal.
 * A single global regex cannot do this correctly, because it cannot tell a
 * regex-opening `/` from a division `/` — that depends on what token came
 * before it, which is state a stateless pattern does not have. `tokenizeJs`
 * is a small hand-written scanner that carries exactly that one piece of
 * state (`lastSignificant`, the previous non-comment, non-whitespace token)
 * and uses it the way real engines do: a `/` starts a regex unless the
 * previous token could itself be the end of a value (an identifier, a
 * number, a string, or a closing `)`/`]`), in which case it is division.
 *
 * Every rule below runs only on the "code" segments this scanner produces —
 * strings, template literals and regex literals pass through completely
 * opaque, and are put back byte-for-byte at the end. Whatever the minifier
 * still gets wrong, `checkJsSyntax` is the backstop: the result is parsed
 * (never executed) with `new Function()`, and a result that fails to parse
 * is discarded in favour of the original input rather than handed back.
 */

export type JsMinifyRule = "comments" | "whitespace" | "line-joining";

/** Declaration order — also the order rules run in and the widget's checkbox list uses. */
export const JS_MINIFY_RULES: JsMinifyRule[] = ["comments", "whitespace", "line-joining"];

export const JS_MINIFY_RULE_LABELS: Record<JsMinifyRule, string> = {
  comments: "Şərhlər atılır — /*! və // @license qorunur",
  whitespace: "Artıq boşluq və girinti yığılır",
  "line-joining": "Təhlükəsiz olan yerlərdə sətir sonu birləşdirilir",
};

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/* ---------- tokenizer: tells code apart from string / template / regex / comment ---------- */

export type JsSegmentKind = "code" | "string" | "template" | "regex" | "line-comment" | "block-comment";
export type JsSegment = { kind: JsSegmentKind; text: string };

const SPECIAL_CHARS = new Set(['"', "'", "`", "/"]);

/** `src[start]` is `"` or `'`. Returns the index just past the matching close quote. */
function scanStringLiteral(src: string, start: number): number {
  const quote = src[start];
  const n = src.length;
  let i = start + 1;
  while (i < n) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (ch === "\n") return i; // unterminated on this line — stop before the newline
    i++;
  }
  return n;
}

/**
 * `src[start]` is a backtick. Returns the index just past the matching close
 * backtick, correctly stepping over any `${ ... }` interpolation — including
 * one holding its own nested strings, templates or comments — without
 * reading what is inside for any other purpose. A brace, quote or backtick
 * that belongs to a nested string/template inside the interpolation must
 * never be mistaken for the one that ends this template, which is why this
 * calls itself and `scanStringLiteral` rather than just counting braces.
 */
function scanTemplateLiteral(src: string, start: number): number {
  const n = src.length;
  let i = start + 1;
  while (i < n) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return i + 1;
    if (ch === "$" && src[i + 1] === "{") {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        const c2 = src[i];
        if (c2 === "{") {
          depth++;
          i++;
        } else if (c2 === "}") {
          depth--;
          i++;
        } else if (c2 === '"' || c2 === "'") {
          i = scanStringLiteral(src, i);
        } else if (c2 === "`") {
          i = scanTemplateLiteral(src, i);
        } else if (c2 === "/" && src[i + 1] === "/") {
          const nl = src.indexOf("\n", i);
          i = nl === -1 ? n : nl;
        } else if (c2 === "/" && src[i + 1] === "*") {
          const close = src.indexOf("*/", i + 2);
          i = close === -1 ? n : close + 2;
        } else {
          i++;
        }
      }
      continue;
    }
    i++;
  }
  return n;
}

/**
 * `src[start]` is a `/` already judged likely to open a regex by
 * `canPrecedeRegex`. Confirms it by scanning for an unescaped closing `/`
 * outside a `[...]` character class, then consumes trailing flags. Returns
 * `start + 1` (a bail-out, meaning "this was division after all") if no
 * closing `/` is found before a newline — a regex literal cannot span lines.
 */
function scanRegexLiteral(src: string, start: number): number {
  const n = src.length;
  let i = start + 1;
  let inClass = false;
  while (i < n) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "\n") return start + 1;
    if (ch === "[") {
      inClass = true;
      i++;
      continue;
    }
    if (ch === "]") {
      inClass = false;
      i++;
      continue;
    }
    if (ch === "/" && !inClass) {
      i++;
      while (i < n && /[a-zA-Z]/.test(src[i])) i++;
      return i;
    }
    i++;
  }
  return start + 1;
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await",
]);

/**
 * The classic regex-vs-division heuristic: a `/` opens a regex unless the
 * previous significant token could itself be the last token of a value
 * (an identifier, a number, a string/template/regex already scanned, or a
 * closing `)`/`]`) — in which case a `/` right after it can only be
 * division. `}` is treated as allowing a regex (end of a block statement is
 * the more common case than end of an object literal in real code); that is
 * a known, accepted imprecision, not an oversight.
 */
function canPrecedeRegex(lastSignificant: string | null): boolean {
  if (lastSignificant === null) return true;
  if (REGEX_PRECEDING_KEYWORDS.has(lastSignificant)) return true;
  if (/^[A-Za-z_$][\w$]*$/.test(lastSignificant)) return false;
  if (/^[\d.]/.test(lastSignificant)) return false;
  if (lastSignificant === ")" || lastSignificant === "]") return false;
  return true;
}

/** The last identifier/number word in `text`, or its last non-whitespace character, or `null` if `text` is blank. */
function extractLastSignificant(text: string): string | null {
  const trimmed = text.replace(/\s+$/, "");
  if (trimmed === "") return null;
  const word = trimmed.match(/[A-Za-z_$][\w$]*$/);
  if (word) return word[0];
  const number = trimmed.match(/[\d.]+$/);
  if (number) return number[0];
  return trimmed.slice(-1);
}

/**
 * Walks `source` once, classifying every character range as code or one of
 * the four regions that must survive untouched. Nothing here rewrites
 * anything — this only decides where the boundaries are.
 */
export function tokenizeJs(source: string): JsSegment[] {
  const segments: JsSegment[] = [];
  const n = source.length;
  let i = 0;
  let lastSignificant: string | null = null;

  while (i < n) {
    const ch = source[i];

    if (ch === '"' || ch === "'") {
      const end = scanStringLiteral(source, i);
      const text = source.slice(i, end);
      segments.push({ kind: "string", text });
      lastSignificant = text;
      i = end;
      continue;
    }

    if (ch === "`") {
      const end = scanTemplateLiteral(source, i);
      const text = source.slice(i, end);
      segments.push({ kind: "template", text });
      lastSignificant = "`";
      i = end;
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      segments.push({ kind: "line-comment", text: source.slice(i, end) });
      i = end;
      continue;
    }

    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      segments.push({ kind: "block-comment", text: source.slice(i, end) });
      i = end;
      continue;
    }

    if (ch === "/" && canPrecedeRegex(lastSignificant)) {
      const end = scanRegexLiteral(source, i);
      if (end > i + 1) {
        const text = source.slice(i, end);
        segments.push({ kind: "regex", text });
        lastSignificant = text;
        i = end;
        continue;
      }
      // scanRegexLiteral bailed: this '/' is division, fall through to plain code.
    }

    let j = i + 1;
    while (j < n && !SPECIAL_CHARS.has(source[j])) j++;
    const chunk = source.slice(i, j);
    segments.push({ kind: "code", text: chunk });
    const extracted = extractLastSignificant(chunk);
    if (extracted !== null) lastSignificant = extracted;
    i = j;
  }

  return segments;
}

/* ---------- protect: literals always, comments conditionally ---------- */

type CommentEntry = { text: string; removable: boolean };

function isPreservedComment(segment: JsSegment): boolean {
  if (segment.kind === "block-comment") return segment.text.startsWith("/*!");
  return /^\/\/\s*@license\b/.test(segment.text);
}

/**
 * Splits `tokens` into plain code text plus two independent marker stores —
 * literals (always restored verbatim) and comments (restored verbatim only
 * when the `comments` rule is off, or when the comment itself is preserved).
 * The code text handed back has neither strings nor comments left in it, so
 * `collapseJsWhitespace` and `joinJsLines` cannot see — and cannot corrupt —
 * either.
 */
function buildProtectedText(
  tokens: JsSegment[],
): { text: string; literals: string[]; comments: CommentEntry[] } {
  const literals: string[] = [];
  const comments: CommentEntry[] = [];
  let text = "";

  for (const token of tokens) {
    if (token.kind === "code") {
      text += token.text;
      continue;
    }
    if (token.kind === "string" || token.kind === "template" || token.kind === "regex") {
      literals.push(token.text);
      text += ` ${literals.length - 1} `;
      continue;
    }
    comments.push({ text: token.text, removable: !isPreservedComment(token) });
    text += `${comments.length - 1}`;
  }

  return { text, literals, comments };
}

function restoreLiterals(text: string, literals: string[]): string {
  return text.replace(/ (\d+) /g, (_full, index: string) => literals[Number(index)] ?? "");
}

function restoreComments(text: string, comments: CommentEntry[], removeComments: boolean): string {
  return text.replace(/(\d+)/g, (_full, index: string) => {
    const entry = comments[Number(index)];
    if (!entry) return "";
    return entry.removable && removeComments ? "" : entry.text;
  });
}

/* ---------- individual rules (operate on protected, comment-free code text) ---------- */

/** Collapses runs of horizontal whitespace and indentation; never touches which lines exist. */
export function collapseJsWhitespace(code: string): string {
  return code
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const SAFE_JOIN_TRAILING = new Set([
  "{", "(", "[", ",", ";", ":", "?", "=", "+", "-", "*", "%", "&", "|", "^", "~", "<", ">", "!",
]);
const SAFE_JOIN_LEADING = new Set([
  "}", ")", "]", ",", ";", ":", "?", ".", "=", "+", "-", "*", "%", "&", "|", "^", "~", "<", ">",
]);
const ASI_RISK_TRAILING_WORDS = new Set(["return", "break", "continue", "throw", "yield"]);

/**
 * Merges a line into the previous one — with a single space, never zero,
 * so two tokens can never glue into a longer one (`+` before `+` would
 * become `++`, an entirely different operator, if joined with nothing
 * between them) — but only when the join cannot change what automatic
 * semicolon insertion would have done.
 *
 * "Safe" means the previous line's last character or the next line's first
 * character is punctuation that can only continue an expression (`,`, an
 * operator, an opener or closer) — a lone `return`, `break`, `continue`,
 * `throw` or `yield` at the end of the previous line is an explicit veto
 * regardless of what follows, because ASI turns exactly that shape into a
 * complete statement and joining it to the next line would silently attach
 * that line's value to the keyword instead of ending the statement there.
 * `return\n{ x: 1 }` — a live example of the bug this veto exists for — is
 * left with its line break exactly because of this rule.
 */
export function joinJsLines(code: string): string {
  const lines = code.split("\n");
  const result: string[] = [];

  for (const rawLine of lines) {
    if (result.length === 0) {
      result.push(rawLine);
      continue;
    }

    const prevTrimmed = result[result.length - 1].trimEnd();
    const curTrimmed = rawLine.trimStart();

    if (prevTrimmed === "" || curTrimmed === "") {
      result.push(rawLine);
      continue;
    }

    const prevLastChar = prevTrimmed.slice(-1);
    const curFirstChar = curTrimmed.slice(0, 1);
    const prevLastWordMatch = prevTrimmed.match(/[A-Za-z_$][\w$]*$/);
    const prevEndsWithRiskyKeyword =
      prevLastWordMatch !== null && ASI_RISK_TRAILING_WORDS.has(prevLastWordMatch[0]);

    const safeToJoin =
      !prevEndsWithRiskyKeyword &&
      (SAFE_JOIN_TRAILING.has(prevLastChar) || SAFE_JOIN_LEADING.has(curFirstChar));

    if (safeToJoin) {
      result[result.length - 1] = `${prevTrimmed} ${curTrimmed}`;
    } else {
      result.push(rawLine);
    }
  }

  return result.join("\n");
}

/* ---------- syntax check: the backstop, not a substitute for the rules above ---------- */

/**
 * Parses (never executes) the candidate output with `new Function`. This
 * treats `code` as a function body, which accepts a bare top-level `return`
 * but rejects ES module syntax (`import`/`export`) — pasted module code will
 * report a syntax error here even when the minified text is actually fine,
 * and the tool says so rather than silently accepting unverified output.
 */
function checkJsSyntax(code: string): { ok: true } | { ok: false; message: string } {
  try {
    // Syntax check only — this parses `code`, it never invokes it.
    new Function(code);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: detail };
  }
}

/* ---------- orchestration ---------- */

export type JsMinifyResult = {
  output: string;
  applied: JsMinifyRule[];
  ruleSavings: { rule: JsMinifyRule; bytesSaved: number }[];
  inputBytes: number;
  outputBytes: number;
  savingsPercent: number;
  syntaxOk: boolean;
  syntaxError: string | null;
};

export function minifyJs(source: string, enabled: Set<JsMinifyRule>): JsMinifyResult {
  const inputBytes = byteLength(source);

  if (source.trim() === "") {
    return {
      output: source,
      applied: [],
      ruleSavings: [],
      inputBytes,
      outputBytes: inputBytes,
      savingsPercent: 0,
      syntaxOk: true,
      syntaxError: null,
    };
  }

  const tokens = tokenizeJs(source);
  const { text: protectedText, literals, comments } = buildProtectedText(tokens);

  let current = protectedText;
  const applied: JsMinifyRule[] = [];
  const ruleSavings: { rule: JsMinifyRule; bytesSaved: number }[] = [];

  const runRule = (rule: JsMinifyRule, fn: (input: string) => string) => {
    if (!enabled.has(rule)) return;
    const before = byteLength(current);
    const next = fn(current);
    if (next !== current) {
      applied.push(rule);
      current = next;
    }
    ruleSavings.push({ rule, bytesSaved: before - byteLength(current) });
  };

  runRule("whitespace", collapseJsWhitespace);
  runRule("line-joining", joinJsLines);

  current = restoreLiterals(current, literals);

  const beforeComments = byteLength(current);
  current = restoreComments(current, comments, enabled.has("comments"));
  if (enabled.has("comments") && comments.some((entry) => entry.removable)) {
    applied.push("comments");
  }
  ruleSavings.push({ rule: "comments", bytesSaved: beforeComments - byteLength(current) });

  const candidate = current;
  const syntax = checkJsSyntax(candidate);
  const output = syntax.ok ? candidate : source;
  const outputBytes = byteLength(output);

  return {
    output,
    applied: syntax.ok ? applied : [],
    ruleSavings,
    inputBytes,
    outputBytes,
    savingsPercent: syntax.ok && inputBytes > 0 ? ((inputBytes - outputBytes) / inputBytes) * 100 : 0,
    syntaxOk: syntax.ok,
    syntaxError: syntax.ok
      ? null
      : `Sıxılmış kod artıq düzgün JavaScript kimi ayrışmır: ${syntax.message}`,
  };
}
