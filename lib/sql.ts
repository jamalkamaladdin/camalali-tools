/*
 * SQL formatting and minification.
 *
 * The whole file exists because of one failure mode. A formatter written as
 * `text.replace(/\bselect\b/gi, "\nSELECT")` also rewrites the SELECT inside
 * `WHERE note = 'SELECT * FROM'`, inside `-- SELECT ...` and inside a block
 * comment, and hands back a query that no longer runs — silently, because the
 * result still looks like SQL. So the text is lexed once, and everything after
 * that only moves whole tokens around. A literal and a comment are copied
 * through character for character and are never looked inside again.
 *
 * Dialect: the part PostgreSQL and MySQL agree on, plus the two quoting rules
 * they disagree about, both accepted — MySQL's backtick identifiers and
 * backslash escapes, and PostgreSQL's dollar-quoted bodies. No grammar is
 * parsed: the layout below is driven by which keyword was seen and how deep
 * the parentheses are, which is enough for a query and stops short of being a
 * database.
 */

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Above this the page warns about speed; the formatter itself has no ceiling. */
export const LARGE_INPUT_BYTES = 400_000;

export type SqlTokenType =
  | "word"
  | "string"
  | "number"
  | "lineComment"
  | "blockComment"
  | "operator"
  | "punctuation";

export type SqlToken = {
  type: SqlTokenType;
  /** Verbatim source text, quotes and comment markers included. */
  text: string;
  /**
   * Upper case of `text`, but only for plain ASCII words. A quoted identifier
   * and anything with a letter outside ASCII get "" and can therefore never
   * match a keyword — which is the point: `"ı".toUpperCase()` is `"I"`, so a
   * column honestly named `ınner` would otherwise be recased as INNER.
   */
  upper: string;
  /** Whitespace stood in front of this token in the source. */
  spaced: boolean;
};

export type SqlError = { message: string; line: number; column: number };

export type SqlTokenizeResult =
  | { ok: true; tokens: SqlToken[] }
  | { ok: false; error: SqlError };

const ASCII_WORD = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* Sticky (`y`) rather than anchored on a slice: `source.slice(i)` inside the
   scan loop copies the rest of the query at every token, which turns a 400 KB
   paste into quadratic work. */
const WORD_RE = /[\p{L}\p{N}_$#@]+/uy;
const NUMBER_RE = /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const DOLLAR_TAG_RE = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;

/* Longest first: `->>` has to be tried before `->` and `<=` before `<`, or the
   tail of the operator is lexed as its own token and the formatter writes a
   space through the middle of it. */
const OPERATORS = [
  "->>",
  "#>>",
  "->",
  "#>",
  "<>",
  "<=",
  ">=",
  "!=",
  "||",
  "::",
  ":=",
  "@>",
  "<@",
  "&&",
  "<<",
  ">>",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "&",
  "|",
  "~",
  "!",
  ":",
];

const PUNCTUATION = new Set(["(", ")", "[", "]", ",", ";", "."]);

/**
 * Index just past the closing quote, or -1 when the literal never closes.
 *
 * Two escapes are honoured. The doubled quote (`'it''s'`) is the SQL standard
 * and works in both dialects; the backslash (`'it\'s'`) is MySQL's, and it is
 * accepted because a MySQL dump full of `\'` is far more common in a paste box
 * than the PostgreSQL string it costs — a literal ending in a lone backslash,
 * which is now reported as unterminated instead. Backticks are exempt: MySQL
 * has no backslash escape inside them, only doubling.
 */
function scanQuoted(source: string, start: number, quote: string): number {
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === "\\" && quote !== "`") {
      index++;
      continue;
    }
    if (char === quote) {
      if (source[index + 1] === quote) {
        index++;
        continue;
      }
      return index + 1;
    }
  }
  return -1;
}

export function tokenizeSql(source: string): SqlTokenizeResult {
  const tokens: SqlToken[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  let spaced = false;

  const advance = (count: number) => {
    for (let step = 0; step < count; step++) {
      if (source[index] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
      index++;
    }
  };

  const push = (type: SqlTokenType, text: string) => {
    tokens.push({
      type,
      text,
      upper: type === "word" && ASCII_WORD.test(text) ? text.toUpperCase() : "",
      spaced,
    });
    spaced = false;
    advance(text.length);
  };

  while (index < source.length) {
    const char = source[index];

    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      spaced = true;
      advance(1);
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (char === "-" && source[index + 1] === "-") {
      const stop = source.indexOf("\n", index);
      /* Trailing spaces are left unconsumed on purpose: the next turn of the
         loop reads them as whitespace, so `-- qeyd   ` and `-- qeyd` produce
         the same token and the tool is idempotent over that difference. */
      push("lineComment", source.slice(index, stop === -1 ? source.length : stop).replace(/\s+$/, ""));
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      /* The first closing marker wins. PostgreSQL nests block comments and
         MySQL does not; taking the shorter reading means a nested comment is
         split into a comment plus tokens rather than swallowing the rest of
         the query. */
      const stop = source.indexOf("*/", index + 2);
      if (stop === -1) {
        return {
          ok: false,
          error: {
            message: "Blok şərhi bağlanmayıb: «*/» tapılmadı.",
            line: startLine,
            column: startColumn,
          },
        };
      }
      push("blockComment", source.slice(index, stop + 2));
      continue;
    }

    if (char === "'") {
      const stop = scanQuoted(source, index, "'");
      if (stop === -1) {
        return {
          ok: false,
          error: {
            message: "Sətir dəyəri bağlanmayıb: tək dırnaq açıq qalıb.",
            line: startLine,
            column: startColumn,
          },
        };
      }
      push("string", source.slice(index, stop));
      continue;
    }

    if (char === '"' || char === "`") {
      const stop = scanQuoted(source, index, char);
      if (stop === -1) {
        return {
          ok: false,
          error: {
            message:
              char === '"'
                ? "Qoşa dırnaq bağlanmayıb: sütun və ya cədvəl adı yarımçıqdır."
                : "Tərs dırnaq bağlanmayıb: MySQL adı yarımçıqdır.",
            line: startLine,
            column: startColumn,
          },
        };
      }
      /* A quoted name is a word for spacing purposes and nothing else: `upper`
         comes out "" above, so `"select"` stays a column and is never recased. */
      push("word", source.slice(index, stop));
      continue;
    }

    if (char === "$") {
      DOLLAR_TAG_RE.lastIndex = index;
      const tag = DOLLAR_TAG_RE.exec(source);
      if (tag) {
        const stop = source.indexOf(tag[0], index + tag[0].length);
        if (stop === -1) {
          return {
            ok: false,
            error: {
              message: `Dollar dırnaq bağlanmayıb: «${tag[0]}» qapanmayıb.`,
              line: startLine,
              column: startColumn,
            },
          };
        }
        push("string", source.slice(index, stop + tag[0].length));
        continue;
      }
      /* No tag means this is a `$1` placeholder, which the word scanner takes. */
    }

    if (char >= "0" && char <= "9") {
      NUMBER_RE.lastIndex = index;
      const number = NUMBER_RE.exec(source);
      if (number) {
        push("number", number[0]);
        continue;
      }
    }

    WORD_RE.lastIndex = index;
    const word = WORD_RE.exec(source);
    if (word) {
      push("word", word[0]);
      continue;
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      push("operator", operator);
      continue;
    }

    /* Unknown character: kept as its own token rather than dropped, because
       losing a byte from somebody's query is worse than laying it out oddly. */
    push(PUNCTUATION.has(char) ? "punctuation" : "operator", char);
  }

  return { ok: true, tokens };
}

/* ---------- keywords ---------- */

/*
 * Reserved-ish words only. `date`, `name`, `status`, `year` and friends are
 * deliberately absent: they are keywords in some dialect somewhere, they are
 * also ordinary column names, and recasing a column name is a change the
 * visitor did not ask for.
 */
const KEYWORDS = new Set([
  "ADD", "ALL", "ALTER", "AND", "ANY", "AS", "ASC", "BEGIN", "BETWEEN", "BY",
  "CASCADE", "CASE", "CHECK", "COLUMN", "COMMIT", "CONFLICT", "CONSTRAINT",
  "CREATE", "CROSS", "DEFAULT", "DELETE", "DESC", "DISTINCT", "DO", "DROP",
  "ELSE", "END", "EXCEPT", "EXISTS", "EXPLAIN", "FALSE", "FETCH", "FIRST",
  "FOR", "FOREIGN", "FROM", "FULL", "GROUP", "HAVING", "ILIKE", "IN", "INDEX",
  "INNER", "INSERT", "INTERSECT", "INTO", "IS", "JOIN", "KEY", "LEFT", "LIKE",
  "LIMIT", "MATERIALIZED", "NATURAL", "NEXT", "NOT", "NOTHING", "NULL",
  "NULLS", "OFFSET", "ON", "ONLY", "OR", "ORDER", "OUTER", "OVER", "PARTITION",
  "PRIMARY", "RECURSIVE", "REFERENCES", "RESTRICT", "RETURNING", "RIGHT",
  "ROLLBACK", "ROWS", "SELECT", "SET", "SOME", "TABLE", "THEN", "TRUE",
  "TRUNCATE", "UNION", "UNIQUE", "UPDATE", "USING", "VALUES", "VIEW", "WHEN",
  "WHERE", "WINDOW", "WITH",
]);

/*
 * Recased only when a "(" follows immediately. `SELECT count FROM stats` is a
 * column and stays lower case; `SELECT count(*) FROM stats` is the aggregate
 * and becomes COUNT. The bracket is the only evidence available without a
 * grammar, and it happens to be conclusive.
 */
const FUNCTIONS = new Set([
  "ABS", "AVG", "CAST", "COALESCE", "COUNT", "DENSE_RANK", "EXTRACT",
  "GREATEST", "LAG", "LEAD", "LEAST", "MAX", "MIN", "NULLIF", "RANK",
  "ROW_NUMBER", "SUM",
]);

/** A clause of its own: breaks the line and sits at the block's base indent. */
const CLAUSE_WORDS = new Set([
  "ALTER", "CREATE", "DELETE", "DROP", "EXCEPT", "EXPLAIN", "FETCH", "FROM",
  "HAVING", "INSERT", "INTERSECT", "LIMIT", "OFFSET", "RETURNING", "SELECT",
  "SET", "TRUNCATE", "UNION", "UPDATE", "VALUES", "WHERE", "WINDOW", "WITH",
]);

/*
 * Only a clause when "BY" follows. `ORDER` and `GROUP` are both plausible
 * column names on their own — `SELECT group FROM permissions` must not become
 * a new line.
 */
const PAIRED_CLAUSES = new Set(["ORDER", "GROUP"]);

const JOIN_MODIFIERS = new Set([
  "CROSS", "FULL", "INNER", "LEFT", "NATURAL", "OUTER", "RIGHT",
]);

/** What "(" has to contain before it is treated as a nested query. */
const BLOCK_OPENERS = new Set(["SELECT", "WITH", "VALUES"]);

/** Kept on the SELECT line instead of starting the column list. */
const SELECT_MODIFIERS = new Set(["DISTINCT", "ALL"]);

const NO_SPACE_BEFORE = new Set([",", ";", ")", "]", ".", "::"]);

export type SqlKeywordCase = "upper" | "lower" | "preserve";
export type SqlIndentOption = "2" | "4" | "tab";

export type SqlFormatOptions = {
  keywordCase: SqlKeywordCase;
  indent: SqlIndentOption;
};

export const DEFAULT_SQL_OPTIONS: SqlFormatOptions = {
  keywordCase: "upper",
  indent: "2",
};

export type SqlStats = {
  statements: number;
  tokens: number;
  lines: number;
  /** Deepest parenthesis nesting — a proxy for how hard the query is to read. */
  maxDepth: number;
  comments: number;
  strings: number;
  inputBytes: number;
  outputBytes: number;
};

export type SqlFormatResult =
  | { ok: true; output: string; stats: SqlStats }
  | { ok: false; error: SqlError };

/** The next token that is not a comment — comments must not change layout. */
function nextCode(tokens: SqlToken[], index: number): SqlToken | undefined {
  for (let step = index + 1; step < tokens.length; step++) {
    const token = tokens[step];
    if (token.type !== "lineComment" && token.type !== "blockComment") return token;
  }
  return undefined;
}

function previousCode(tokens: SqlToken[], index: number): SqlToken | undefined {
  for (let step = index - 1; step >= 0; step--) {
    const token = tokens[step];
    if (token.type !== "lineComment" && token.type !== "blockComment") return token;
  }
  return undefined;
}

function caseWord(
  token: SqlToken,
  next: SqlToken | undefined,
  keywordCase: SqlKeywordCase,
): string {
  if (keywordCase === "preserve" || token.upper === "") return token.text;
  const isKeyword =
    KEYWORDS.has(token.upper) || (FUNCTIONS.has(token.upper) && next?.text === "(");
  if (!isKeyword) return token.text;
  return keywordCase === "upper" ? token.upper : token.upper.toLowerCase();
}

/** Length of the JOIN phrase starting here (`LEFT OUTER JOIN` is 3), else 0. */
function joinPhrase(tokens: SqlToken[], index: number): number {
  const first = tokens[index];
  if (first.type !== "word") return 0;
  if (first.upper === "JOIN") return 1;
  if (!JOIN_MODIFIERS.has(first.upper)) return 0;
  /* `LEFT(name, 3)` is a function, and it is told apart here: the scan stops
     at the first word that is neither a join modifier nor JOIN itself. */
  for (let step = 1; step <= 3 && index + step < tokens.length; step++) {
    const word = tokens[index + step];
    if (word.type !== "word") return 0;
    if (word.upper === "JOIN") return step + 1;
    if (!JOIN_MODIFIERS.has(word.upper)) return 0;
  }
  return 0;
}

/** How many words the clause starting here occupies, or 0 when it is not one. */
function clausePhrase(tokens: SqlToken[], index: number, previous: SqlToken | undefined): number {
  const word = tokens[index];
  if (word.type !== "word" || word.upper === "") return 0;

  if (PAIRED_CLAUSES.has(word.upper)) {
    /* The adjacent token, not the next non-comment one: the pair is emitted as
       two words in a row, so a comment wedged between them would be reordered. */
    const next = tokens[index + 1];
    return next !== undefined && next.type === "word" && next.upper === "BY" ? 2 : 0;
  }

  if (!CLAUSE_WORDS.has(word.upper)) return 0;
  /* DELETE FROM is one clause written on one line, not DELETE and then FROM. */
  if (word.upper === "FROM" && previous?.upper === "DELETE") return 0;
  return 1;
}

/** A `-` or `+` that is a sign rather than an arithmetic operator. */
function isSign(previous: SqlToken | undefined): boolean {
  if (previous === undefined) return true;
  if (previous.type === "operator") return true;
  if (previous.type === "punctuation") return previous.text !== ")" && previous.text !== "]";
  return previous.type === "word" && KEYWORDS.has(previous.upper);
}

/* ---------- layout ---------- */

type Frame = {
  /**
   * A block is a statement or a nested query and owns line breaks; a call is
   * everything else in brackets — `coalesce(a, b)`, `values (1, 2)` — and stays
   * on one line, because breaking a three-argument function across four lines
   * is what makes machine-formatted SQL unreadable.
   */
  kind: "block" | "call";
  /** Indent level the clause keywords of this block sit at. */
  indent: number;
  /** Indent of the line the opening bracket was written on. */
  openIndent: number;
  /** Indents of the CASE expressions still open here. */
  cases: number[];
  /** A BETWEEN is waiting for its AND, and that AND must not start a line. */
  between: boolean;
};

function formatTokens(tokens: SqlToken[], options: SqlFormatOptions): string {
  const unit = options.indent === "tab" ? "\t" : options.indent === "4" ? "    " : "  ";
  const lines: string[] = [];
  const root: Frame = { kind: "block", indent: 0, openIndent: 0, cases: [], between: false };
  const stack: Frame[] = [root];

  let buffer = "";
  let bufferIndent = 0;
  let glueNext = false;
  let blankBefore = false;

  const flush = () => {
    if (buffer !== "") {
      lines.push(unit.repeat(bufferIndent) + buffer);
      buffer = "";
    }
  };

  const breakTo = (level: number) => {
    flush();
    bufferIndent = level;
    glueNext = false;
  };

  const write = (text: string, glue: boolean) => {
    if (buffer === "") {
      if (blankBefore && lines.length > 0) lines.push("");
      buffer = text;
    } else {
      buffer += glue ? text : ` ${text}`;
    }
    blankBefore = false;
    glueNext = false;
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const frame = stack[stack.length - 1];
    const inline = frame.kind === "call";
    const next = nextCode(tokens, index);
    const previous = previousCode(tokens, index);
    const glue =
      glueNext ||
      NO_SPACE_BEFORE.has(token.text) ||
      ((token.text === "(" || token.text === "[") && !token.spaced);

    if (token.type === "lineComment") {
      /* Anything written after `--` on this line would be inside the comment,
         so the line ends here whatever the layout wanted next. */
      write(token.text, false);
      flush();
      continue;
    }

    if (token.type === "blockComment") {
      write(token.text, glue);
      continue;
    }

    if (token.text === "(" || token.text === "[") {
      const opensBlock =
        token.text === "(" &&
        !inline &&
        next !== undefined &&
        next.type === "word" &&
        BLOCK_OPENERS.has(next.upper);
      write(token.text, glue);
      const openIndent = bufferIndent;
      if (opensBlock) {
        stack.push({
          kind: "block",
          indent: openIndent + 1,
          openIndent,
          cases: [],
          between: false,
        });
        breakTo(openIndent + 1);
      } else {
        stack.push({
          kind: "call",
          indent: frame.indent,
          openIndent,
          cases: [],
          between: false,
        });
        glueNext = true;
      }
      continue;
    }

    if (token.text === ")" || token.text === "]") {
      const closing = stack.length > 1 ? stack[stack.length - 1] : undefined;
      if (closing !== undefined) stack.pop();
      if (closing !== undefined && closing.kind === "block") {
        breakTo(closing.openIndent);
        write(token.text, false);
      } else {
        write(token.text, true);
      }
      continue;
    }

    if (token.text === ",") {
      write(",", true);
      if (frame.kind === "block") breakTo(frame.indent + 1);
      continue;
    }

    if (token.text === ";") {
      write(";", true);
      flush();
      /* A statement boundary resets everything: an unbalanced bracket in the
         query above must not indent the query below. */
      stack.length = 1;
      root.cases.length = 0;
      root.between = false;
      bufferIndent = 0;
      blankBefore = true;
      continue;
    }

    if (token.text === "." || token.text === "::") {
      write(token.text, true);
      glueNext = true;
      continue;
    }

    if ((token.text === "-" || token.text === "+") && isSign(previous)) {
      write(token.text, glue);
      glueNext = true;
      continue;
    }

    if (token.type !== "word" || inline || token.upper === "") {
      write(token.type === "word" ? caseWord(token, next, options.keywordCase) : token.text, glue);
      continue;
    }

    const word = caseWord(token, next, options.keywordCase);

    const join = joinPhrase(tokens, index);
    if (join > 0) {
      breakTo(frame.indent);
      for (let step = 0; step < join; step++) {
        const part = tokens[index + step];
        write(caseWord(part, tokens[index + step + 1], options.keywordCase), false);
      }
      index += join - 1;
      continue;
    }

    /* `DISTINCT ON (...)` is PostgreSQL's, and its ON belongs to the SELECT
       line — the join ON is the one that starts a line. */
    if (token.upper === "ON" && previous?.upper !== "DISTINCT") {
      breakTo(frame.indent + 1);
      write(word, false);
      continue;
    }

    if (token.upper === "BETWEEN") {
      frame.between = true;
      write(word, glue);
      continue;
    }

    if (token.upper === "AND" || token.upper === "OR") {
      /* The AND of `BETWEEN 1 AND 10` joins two bounds, not two conditions. */
      if (token.upper === "AND" && frame.between) {
        frame.between = false;
        write(word, glue);
        continue;
      }
      breakTo(frame.indent + 1);
      write(word, false);
      continue;
    }

    if (token.upper === "CASE") {
      write(word, glue);
      frame.cases.push(bufferIndent);
      continue;
    }

    if ((token.upper === "WHEN" || token.upper === "ELSE") && frame.cases.length > 0) {
      breakTo(frame.cases[frame.cases.length - 1] + 1);
      write(word, false);
      continue;
    }

    /* END also closes BEGIN blocks, so it only moves when a CASE is open. */
    if (token.upper === "END" && frame.cases.length > 0) {
      breakTo(frame.cases.pop() ?? frame.indent);
      write(word, false);
      continue;
    }

    const clause = clausePhrase(tokens, index, previous);
    if (clause > 0) {
      breakTo(frame.indent);
      for (let step = 0; step < clause; step++) {
        const part = tokens[index + step];
        write(caseWord(part, tokens[index + step + 1], options.keywordCase), false);
      }
      index += clause - 1;

      if (token.upper === "SELECT") {
        while (
          index + 1 < tokens.length &&
          tokens[index + 1].type === "word" &&
          SELECT_MODIFIERS.has(tokens[index + 1].upper)
        ) {
          index++;
          write(caseWord(tokens[index], tokens[index + 1], options.keywordCase), false);
        }
        /* `SELECT *` is one short line rather than two, which is the shape
           everybody writes by hand; a real column list gets the indent. */
        const star = tokens[index + 1];
        const after = tokens[index + 2];
        if (
          star !== undefined &&
          star.text === "*" &&
          after !== undefined &&
          after.type === "word" &&
          after.upper === "FROM"
        ) {
          index++;
          write("*", false);
          continue;
        }
        breakTo(frame.indent + 1);
      }
      continue;
    }

    write(word, glue);
  }

  flush();
  return lines.join("\n");
}

function minifyTokens(tokens: SqlToken[], options: SqlFormatOptions): string {
  let out = "";
  let breakLine = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const text =
      token.type === "word"
        ? caseWord(token, nextCode(tokens, index), options.keywordCase)
        : token.text;

    if (out === "") {
      out = text;
    } else if (breakLine) {
      /* The one newline a minified query cannot lose: without it the tokens
         after a `--` comment would all be inside that comment. */
      out += `\n${text}`;
    } else {
      const previous = tokens[index - 1];
      out += needsSpace(previous, token) ? ` ${text}` : text;
    }

    breakLine = token.type === "lineComment";
  }

  return out;
}

function needsSpace(previous: SqlToken, token: SqlToken): boolean {
  if (NO_SPACE_BEFORE.has(token.text)) return false;
  if (previous.text === "(" || previous.text === "[" || previous.text === "." || previous.text === "::") {
    return false;
  }
  /* The bracket keeps whatever the author decided: `count(*)` closes up and
     `insert into t (a, b)` keeps its space. Dropping it here would make
     format -> minify -> format land on a different text than format alone. */
  if (token.text === "(" || token.text === "[") return token.spaced;
  return true;
}

function buildStats(tokens: SqlToken[], source: string, output: string): SqlStats {
  let statements = 0;
  let comments = 0;
  let strings = 0;
  let depth = 0;
  let maxDepth = 0;
  let pending = false;

  for (const token of tokens) {
    if (token.type === "lineComment" || token.type === "blockComment") {
      comments++;
      continue;
    }
    if (token.type === "string") strings++;
    if (token.text === "(") {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (token.text === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (token.text === ";") {
      /* A stray `;` after a comment-only line is not a statement. */
      if (pending) statements++;
      pending = false;
    } else {
      pending = true;
    }
  }
  if (pending) statements++;

  return {
    statements,
    tokens: tokens.length,
    lines: output === "" ? 0 : output.split("\n").length,
    maxDepth,
    comments,
    strings,
    inputBytes: byteLength(source),
    outputBytes: byteLength(output),
  };
}

export function formatSql(source: string, options: SqlFormatOptions): SqlFormatResult {
  const lexed = tokenizeSql(source);
  if (!lexed.ok) return { ok: false, error: lexed.error };
  const output = formatTokens(lexed.tokens, options);
  return { ok: true, output, stats: buildStats(lexed.tokens, source, output) };
}

export function minifySql(source: string, options: SqlFormatOptions): SqlFormatResult {
  const lexed = tokenizeSql(source);
  if (!lexed.ok) return { ok: false, error: lexed.error };
  const output = minifyTokens(lexed.tokens, options);
  return { ok: true, output, stats: buildStats(lexed.tokens, source, output) };
}
