/**
 * YAML to JSON and back, written as a *documented subset* of YAML rather than
 * as a complete implementation of it.
 *
 * The rule the whole file obeys: a construct is either understood exactly or
 * refused by name, with a line number. A converter that guesses is worse than
 * one that stops — a silently mistranslated configuration still looks right on
 * this page and breaks in production, where nobody is looking at this tool any
 * more. So anchors, tags, merge keys and the rest raise an error that names
 * them instead of being skipped.
 *
 * Understood: several documents (`---`), block mappings, block sequences,
 * nesting by space indentation, plain and quoted scalars, comments, literal
 * (`|`) and folded (`>`) block scalars with `-`/`+` chomping and the explicit
 * indentation digit, single-line flow collections (`[a, b]`, `{a: 1}`).
 *
 * Refused with a message: `&anchor` / `*alias`, `!tag`, the `<<` merge key,
 * the `? ` complex key, `%` directives, a flow collection or a quoted string
 * broken across lines, a plain scalar continued on the next line, and `.inf` /
 * `.nan`, which JSON has no way to write.
 *
 * Scalars follow the YAML 1.2 core schema — what Go, Rust and js-yaml's
 * default schema read: only `true`/`false` are booleans, so `yes`, `no`, `on`
 * and `off` stay strings. Every place where YAML 1.1 (still what PyYAML's
 * `safe_load` implements) would produce a different value raises a warning
 * rather than leaving the difference silent.
 */
import { formatJson, locate, type IndentOption } from "./json";

export type { IndentOption };

export type YamlIssue = {
  message: string;
  line: number;
  column: number;
  snippet: string;
};

/** A value both schemas accept but read differently. Never fatal. */
export type YamlWarning = { line: number; text: string };

export type YamlToJsonResult =
  | {
      ok: true;
      output: string;
      value: unknown;
      /** More than one means the output is an array of them — the page says so. */
      documents: number;
      warnings: YamlWarning[];
    }
  | { ok: false; error: YamlIssue };

export type JsonToYamlResult =
  | { ok: true; output: string; value: unknown }
  | { ok: false; error: YamlIssue };

/** Deep enough for any hand-written configuration; text cannot contain a cycle. */
const MAX_DEPTH = 200;

class YamlSyntaxError extends Error {
  lineNo: number;
  column: number;

  constructor(lineNo: number, column: number, message: string) {
    super(message);
    this.name = "YamlSyntaxError";
    this.lineNo = lineNo;
    this.column = column;
  }
}

/* ---------- lines ---------- */

type Line = {
  /** 1-based, the way the visitor's editor counts. */
  no: number;
  /** Untouched, because a block scalar's content lives in the raw text. */
  raw: string;
  /** Column (0-based) where the content starts — leading spaces only. */
  indent: number;
  /** From `indent` to the end, trailing whitespace removed. */
  content: string;
  blank: boolean;
};

function scanLines(source: string): Line[] {
  return source.split("\n").map((line, index) => {
    /* A file pasted from Windows carries the carriage return into the block
       scalar's own text, where nothing else would ever strip it. Dropping it
       per line rather than over the whole source keeps every column exact. */
    const raw = line.endsWith("\r") ? line.slice(0, -1) : line;
    const leading = /^ */.exec(raw)?.[0].length ?? 0;
    const content = raw.slice(leading).replace(/\s+$/, "");
    return {
      no: index + 1,
      raw,
      indent: leading,
      content,
      blank: content === "" || content.startsWith("#"),
    };
  });
}

/*
 * A tab in the indentation is the most common way a hand-edited YAML file
 * breaks, and the message most parsers give for it names something else. It is
 * checked per structural line rather than once over the file, because a tab
 * *inside* a block scalar is ordinary text and has to survive.
 */
function checkTabs(line: Line): void {
  if (line.content.startsWith("\t")) {
    throw new YamlSyntaxError(
      line.no,
      line.indent + 1,
      "Girintidə tab simvolu var: YAML girinti üçün yalnız boşluq qəbul edir.",
    );
  }
}

/** True for any character YAML cannot carry raw, optionally allowing newline. */
function hasControlChar(text: string, allowNewline: boolean): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (allowNewline && code === 0x0a) continue;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/* ---------- documents ---------- */

type Range = { from: number; to: number };

function splitDocuments(lines: Line[]): Range[] {
  const ranges: Range[] = [];
  let from = 0;

  /** A stretch of nothing but blank and comment lines is not a document. */
  const push = (to: number) => {
    for (let k = from; k < to; k++) {
      if (!lines[k].blank) {
        ranges.push({ from, to });
        return;
      }
    }
  };

  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (line.blank || line.indent !== 0) continue;

    if (line.content.startsWith("%")) {
      throw new YamlSyntaxError(
        line.no,
        1,
        "Direktiv (%YAML, %TAG) dəstəklənmir: sətri sil, məlumat ondan asılı deyil.",
      );
    }

    if (line.content === "---" || line.content === "...") {
      push(k);
      from = k + 1;
      continue;
    }

    /* A marker line carrying its own root node ("--- 42") is legal YAML.
       Refused rather than half-read. */
    if (line.content.startsWith("--- ")) {
      throw new YamlSyntaxError(
        line.no,
        5,
        "«---» sətrində dəyər dəstəklənmir: dəyəri növbəti sətirdən yaz.",
      );
    }
  }

  push(lines.length);
  return ranges;
}

/* ---------- block parser ---------- */

type Warn = (lineNo: number, message: string) => void;

function parseRange(lines: Line[], range: Range, warn: Warn): unknown {
  /* A copy, because a compact sequence entry (`- ad: x`) is parsed by
     rewriting its own line as if the value had started a line of its own. */
  const view = lines.slice();
  let i = range.from;
  const end = range.to;

  function peek(): Line | null {
    while (i < end && view[i].blank) i++;
    return i < end ? view[i] : null;
  }

  function fail(line: Line, column: number, message: string): never {
    throw new YamlSyntaxError(line.no, column, message);
  }

  function tooDeep(line: Line): never {
    return fail(line, line.indent + 1, `Quruluş ${MAX_DEPTH} səviyyədən dərindir.`);
  }

  function isSequenceEntry(content: string): boolean {
    return content === "-" || content.startsWith("- ");
  }

  function overIndented(line: Line, indent: number): never {
    return fail(
      line,
      line.indent + 1,
      `Girinti gözləniləndən çoxdur: bu sətir ${indent} boşluqla başlamalıdır, ${line.indent} boşluq var.`,
    );
  }

  /**
   * `blockParent` is the indentation a block scalar on this line measures its
   * body against. It differs from `indent` for a sequence entry: in `- |` the
   * body is indented past the dash, not past the text after it.
   */
  function parseNode(indent: number, depth: number, blockParent = indent): unknown {
    const line = peek();
    if (!line || line.indent < indent) return null;
    if (depth > MAX_DEPTH) tooDeep(line);
    checkTabs(line);

    if (isSequenceEntry(line.content)) return parseSequence(indent, depth);
    if (findKeyEnd(line, line.content) !== null) return parseMapping(indent, depth);

    // Neither `- ` nor `key:` — the node is a lone scalar, which is what the
    // top of a document and the text after a dash both look like.
    i++;
    return parseInline(line, line.content, line.indent, blockParent, depth);
  }

  function parseSequence(indent: number, depth: number): unknown[] {
    const items: unknown[] = [];

    for (;;) {
      const line = peek();
      if (!line || line.indent < indent) break;
      checkTabs(line);

      if (line.indent > indent) overIndented(line, indent);
      if (!isSequenceEntry(line.content)) {
        fail(
          line,
          line.indent + 1,
          "Siyahının içində açar gözlənilmir: hər element «- » ilə başlamalıdır.",
        );
      }

      const afterDash = line.content.slice(1);
      const gap = afterDash.length - afterDash.trimStart().length;
      const rest = afterDash.slice(gap);
      const restIndent = line.indent + 1 + gap;

      if (rest === "" || rest.startsWith("#")) {
        i++;
        const child = peek();
        items.push(child && child.indent > indent ? parseNode(child.indent, depth + 1) : null);
        continue;
      }

      /* The entry's value starts on the dash line, so the line is re-labelled
         with the column where it really starts and handed to the ordinary node
         parser. That one rewrite is what makes `- ad: x`, followed by more keys
         at the same column, behave like any other mapping. */
      view[i] = { ...line, indent: restIndent, content: rest, blank: false };
      items.push(parseNode(restIndent, depth + 1, line.indent));
    }

    return items;
  }

  function parseMapping(indent: number, depth: number): Record<string, unknown> {
    /* A null prototype, so a document carrying a `__proto__` key writes an
       ordinary property instead of reaching this object's prototype. */
    const map = Object.create(null) as Record<string, unknown>;

    for (;;) {
      const line = peek();
      if (!line || line.indent < indent) break;
      checkTabs(line);

      if (line.indent > indent) overIndented(line, indent);
      if (isSequenceEntry(line.content)) {
        fail(
          line,
          line.indent + 1,
          "Açarların arasında «- » elementi var. Siyahı öz açarının altında yazılır.",
        );
      }

      const found = findKeyEnd(line, line.content);
      if (found === null) {
        fail(line, line.indent + 1, "Açar gözlənilirdi: «açar: dəyər» formasında yaz.");
      }
      if (found.key in map) {
        fail(
          line,
          line.indent + 1,
          `Təkrarlanan açar: «${found.key}». Oxuyanların bir hissəsi sonuncunu saxlayır, digərləri xəta verir: adı dəyiş.`,
        );
      }

      const tail = line.content.slice(found.end);
      const rest = tail.replace(/^ +/, "");
      const restIndent = line.indent + found.end + (tail.length - rest.length);
      i++;

      if (rest === "" || rest.startsWith("#")) {
        const child = peek();
        if (child && child.indent > indent) {
          map[found.key] = parseNode(child.indent, depth + 1);
        } else if (child && child.indent === indent && isSequenceEntry(child.content)) {
          /* A sequence written flush with its own key — legal, and the shape
             every Kubernetes and GitHub Actions file is written in. */
          map[found.key] = parseSequence(indent, depth + 1);
        } else {
          map[found.key] = null;
        }
        continue;
      }

      map[found.key] = parseInline(line, rest, restIndent, indent, depth + 1);
    }

    return map;
  }

  /** A value that begins on the line that announced it. */
  function parseInline(
    line: Line,
    rest: string,
    column: number,
    ownerIndent: number,
    depth: number,
  ): unknown {
    if (depth > MAX_DEPTH) tooDeep(line);

    const first = rest[0];

    if (first === "|" || first === ">") return readBlockScalar(line, rest, ownerIndent);

    if (first === "&" || first === "*") {
      fail(
        line,
        column + 1,
        first === "&"
          ? "Anchor (&ad) dəstəklənmir: JSON-da istinad yoxdur, dəyəri təkrar yazmaq lazımdır."
          : "Alias (*ad) dəstəklənmir: istinad etdiyi dəyəri bura köçür.",
      );
    }
    if (first === "!") {
      fail(line, column + 1, "Teq (!tag, !!str) dəstəklənmir: dəyəri teqsiz yaz.");
    }
    if (rest === "-" || rest.startsWith("- ")) {
      fail(
        line,
        column + 1,
        "Siyahı açarla eyni sətirdə başlaya bilməz: «- » növbəti sətirdən, girinti ilə yazılır.",
      );
    }

    if (first === "[" || first === "{") {
      const flow = parseFlow(line, rest, column, depth);
      const after = rest.slice(flow.end).trim();
      if (after !== "" && !after.startsWith("#")) {
        fail(line, column + flow.end + 1, "Axın kolleksiyasından sonra artıq mətn var.");
      }
      return flow.value;
    }

    if (first === '"' || first === "'") {
      const quoted = readQuoted(line, rest, 0, column);
      const after = rest.slice(quoted.end).trim();
      if (after !== "" && !after.startsWith("#")) {
        fail(line, column + quoted.end + 1, "Bağlanan dırnaqdan sonra artıq mətn var.");
      }
      return quoted.value;
    }

    /* A plain scalar may be continued on the following, more indented line in
       real YAML. That form is refused rather than merged, because it looks
       exactly like a mistyped nested block, and choosing between the two is
       the silent mistranslation this tool must not make. */
    const next = i < end ? view[i] : null;
    if (next && !next.blank && next.indent > ownerIndent) {
      // The same shape means two different mistakes: a line that is a key or
      // a list entry was indented wrong, anything else is a continued scalar.
      if (looksStructural(next.content)) overIndented(next, ownerIndent);
      fail(
        next,
        next.indent + 1,
        "Çoxsətirli sadə mətn dəstəklənmir: bir sətirdə yaz, ya da «|» blokundan istifadə et.",
      );
    }

    return resolveScalar(stripComment(rest), line.no, column);
  }

  /* --- keys --- */

  function findKeyEnd(line: Line, content: string): { key: string; end: number } | null {
    if (content === "?" || content.startsWith("? ")) {
      fail(line, line.indent + 1, "Mürəkkəb açar («? ») dəstəklənmir: açar sadə mətn olmalıdır.");
    }
    if (content.startsWith("<<:")) {
      fail(
        line,
        line.indent + 1,
        "Birləşdirmə açarı («<<») dəstəklənmir. O, anchor-a istinad edir, JSON-da qarşılığı yoxdur.",
      );
    }
    if (content.startsWith("[") || content.startsWith("{")) return null;

    if (content.startsWith('"') || content.startsWith("'")) {
      const quoted = readQuoted(line, content, 0, line.indent);
      const after = content.slice(quoted.end);
      if (!after.startsWith(":")) return null;
      if (after.length > 1 && after[1] !== " ") {
        fail(line, line.indent + quoted.end + 2, "«:» işarəsindən sonra boşluq olmalıdır.");
      }
      return { key: quoted.value, end: quoted.end + 1 };
    }

    for (let k = 0; k < content.length; k++) {
      const ch = content[k];
      if (ch === "#" && k > 0 && content[k - 1] === " ") return null;
      if (ch !== ":") continue;
      /* A colon closes the key only when a space or the line's end follows it,
         which is what keeps `saat: 12:30` and `url: http://x` in one piece. */
      if (k + 1 === content.length || content[k + 1] === " ") {
        return { key: content.slice(0, k).trimEnd(), end: k + 1 };
      }
    }

    return null;
  }

  /* --- block scalars --- */

  function readBlockScalar(line: Line, rest: string, ownerIndent: number): string {
    const style = rest[0];
    const header = stripComment(rest.slice(1)).trim();

    let chomp: "clip" | "strip" | "keep" = "clip";
    let explicitIndent = 0;
    for (const ch of header) {
      if (ch === "-") chomp = "strip";
      else if (ch === "+") chomp = "keep";
      else if (ch >= "1" && ch <= "9") explicitIndent = Number(ch);
      else {
        fail(
          line,
          line.indent + 1,
          `Blok başlığında gözlənilməz simvol: «${ch}». Yalnız «-», «+» və 1–9 rəqəmi ola bilər.`,
        );
      }
    }

    const collected: string[] = [];
    // Zero means "not decided yet" — the first non-empty line sets it.
    let blockIndent = explicitIndent > 0 ? ownerIndent + explicitIndent : 0;

    while (i < end) {
      const candidate = view[i];
      const isEmpty = candidate.raw.trim() === "";

      if (!isEmpty) {
        const leading = /^ */.exec(candidate.raw)?.[0].length ?? 0;
        if (leading <= ownerIndent) break;
        if (blockIndent === 0) blockIndent = leading;
        if (leading < blockIndent) break;
      }

      collected.push(isEmpty ? "" : candidate.raw.slice(blockIndent));
      i++;
    }

    /* Trailing empty lines are not content; chomping decides how many of the
       newlines they stand for survive. */
    let trailing = 0;
    while (collected.length > 0 && collected[collected.length - 1] === "") {
      collected.pop();
      trailing++;
    }

    if (collected.length === 0) return chomp === "keep" ? "\n".repeat(trailing) : "";

    const body = style === "|" ? collected.join("\n") : foldLines(collected);
    if (chomp === "strip") return body;
    if (chomp === "keep") return body + "\n".repeat(trailing + 1);
    return `${body}\n`;
  }

  /* --- flow collections --- */

  function parseFlow(
    line: Line,
    text: string,
    column: number,
    depth: number,
  ): { value: unknown; end: number } {
    let p = 0;

    const at = () => column + p + 1;
    const skipSpace = () => {
      while (p < text.length && text[p] === " ") p++;
    };

    function unterminated(): never {
      return fail(
        line,
        at(),
        "Axın kolleksiyası bu sətirdə bağlanmır: çoxsətirli «[ ]» / «{ }» dəstəklənmir.",
      );
    }

    function readNode(level: number): unknown {
      if (level > MAX_DEPTH) tooDeep(line);
      skipSpace();
      if (p >= text.length) unterminated();

      const ch = text[p];
      if (ch === "[") return readSequence(level);
      if (ch === "{") return readMapping(level);
      if (ch === "&" || ch === "*" || ch === "!") {
        fail(line, at(), "Axın kolleksiyasında anchor, alias və teq dəstəklənmir.");
      }
      if (ch === '"' || ch === "'") {
        const quoted = readQuoted(line, text, p, column);
        p = quoted.end;
        return quoted.value;
      }
      return readPlain();
    }

    /** Inside a flow a plain scalar ends at the punctuation, not at a space. */
    function readPlain(): unknown {
      const start = p;
      while (p < text.length) {
        const ch = text[p];
        if (ch === "," || ch === "]" || ch === "}") break;
        if (ch === "#" && p > start && text[p - 1] === " ") break;
        if (ch === ":" && (p + 1 >= text.length || " ,]}".includes(text[p + 1]))) break;
        p++;
      }
      return resolveScalar(text.slice(start, p).trimEnd(), line.no, column + start);
    }

    function readSequence(level: number): unknown[] {
      p++; // '['
      const items: unknown[] = [];
      skipSpace();
      if (text[p] === "]") {
        p++;
        return items;
      }

      for (;;) {
        items.push(readNode(level + 1));
        skipSpace();
        if (p >= text.length) unterminated();
        if (text[p] === ",") {
          p++;
          skipSpace();
          // A comma before the closing bracket is allowed by the YAML grammar,
          // and it is what a list being edited looks like. Accepted, not read
          // as one more empty entry.
          if (text[p] === "]") {
            p++;
            return items;
          }
          continue;
        }
        if (text[p] === "]") {
          p++;
          return items;
        }
        fail(line, at(), "Siyahı elementlərinin arasında vergül gözlənilir.");
      }
    }

    function readMapping(level: number): Record<string, unknown> {
      p++; // '{'
      const map = Object.create(null) as Record<string, unknown>;
      skipSpace();
      if (text[p] === "}") {
        p++;
        return map;
      }

      for (;;) {
        skipSpace();
        const keyStart = p;
        const key = readNode(level + 1);
        skipSpace();
        if (p >= text.length) unterminated();
        if (text[p] !== ":") {
          /* `{a:1}` parsed as one scalar `a:1`, so the loop arrives here with
             the colon already eaten. Naming the missing space is the only
             message that helps; "colon expected" points at nothing. */
          const written = typeof key === "string" ? key : "";
          if (written.includes(":")) {
            fail(line, column + keyStart + 1, "«:» işarəsindən sonra boşluq olmalıdır: {açar: dəyər}.");
          }
          fail(line, at(), "Axın xəritəsində açardan sonra «:» gözlənilir.");
        }

        /* `{a:1}` is not a mapping in YAML at all — it is the single scalar
           `a:1`. Reading it as a pair would be exactly the silent difference
           this tool refuses to produce, so the space is demanded out loud. */
        if (p + 1 < text.length && !" ,}".includes(text[p + 1])) {
          fail(line, at() + 1, "«:» işarəsindən sonra boşluq olmalıdır: {açar: dəyər}.");
        }
        p++;

        const keyText = typeof key === "string" ? key : String(key);
        if (keyText in map) fail(line, column + keyStart + 1, `Təkrarlanan açar: «${keyText}».`);

        skipSpace();
        map[keyText] = text[p] === "," || text[p] === "}" ? null : readNode(level + 1);

        skipSpace();
        if (p >= text.length) unterminated();
        if (text[p] === ",") {
          p++;
          skipSpace();
          if (text[p] === "}") {
            p++;
            return map;
          }
          continue;
        }
        if (text[p] === "}") {
          p++;
          return map;
        }
        fail(line, at(), "Cütlərin arasında vergül gözlənilir.");
      }
    }

    return { value: readNode(depth), end: p };
  }

  /* --- quoted scalars --- */

  function readQuoted(
    line: Line,
    text: string,
    start: number,
    column: number,
  ): { value: string; end: number } {
    const quote = text[start];
    let p = start + 1;
    let out = "";

    while (p < text.length) {
      const ch = text[p];

      if (quote === "'") {
        // The only escape a single-quoted scalar has is a doubled quote.
        if (ch === "'") {
          if (text[p + 1] === "'") {
            out += "'";
            p += 2;
            continue;
          }
          return { value: out, end: p + 1 };
        }
        out += ch;
        p++;
        continue;
      }

      if (ch === "\\") {
        const escape = text[p + 1];
        if (escape === undefined) break;
        if (escape in DOUBLE_QUOTE_ESCAPES) {
          out += DOUBLE_QUOTE_ESCAPES[escape];
          p += 2;
          continue;
        }
        if (escape === "x" || escape === "u" || escape === "U") {
          const width = escape === "x" ? 2 : escape === "u" ? 4 : 8;
          const digits = text.slice(p + 2, p + 2 + width);
          if (digits.length < width || !/^[0-9a-fA-F]+$/.test(digits)) {
            fail(line, column + p + 1, `«\\${escape}» ardınca ${width} onaltılıq rəqəm gözlənilir.`);
          }
          out += String.fromCodePoint(parseInt(digits, 16));
          p += 2 + width;
          continue;
        }
        fail(line, column + p + 1, `Tanınmayan qaçış ardıcıllığı: «\\${escape}».`);
      }

      if (ch === '"') return { value: out, end: p + 1 };
      out += ch;
      p++;
    }

    return fail(
      line,
      column + start + 1,
      "Dırnaq bu sətirdə bağlanmır: çoxsətirli dırnaqlı mətn dəstəklənmir.",
    );
  }

  /* --- plain scalars --- */

  function resolveScalar(raw: string, lineNo: number, column: number): unknown {
    const text = raw.trim();
    if (text === "" || text === "~") return null;

    const lower = text.toLowerCase();
    if (lower === "null") return null;
    if (lower === "true") return true;
    if (lower === "false") return false;

    if (lower === ".inf" || lower === "-.inf" || lower === "+.inf" || lower === ".nan") {
      throw new YamlSyntaxError(
        lineNo,
        column + 1,
        `«${text}» JSON-da yazıla bilmir: JSON-un sonsuzluq və NaN dəyəri yoxdur.`,
      );
    }

    if (lower === "yes" || lower === "no" || lower === "on" || lower === "off") {
      warn(
        lineNo,
        `«${text}» sətir kimi oxundu (YAML 1.2). PyYAML kimi 1.1 oxuyanlar onu true/false sayır. Dəyər bul olmalıdırsa true/false yaz.`,
      );
      return text;
    }

    if (/^[-+]?0[0-9_]+$/.test(text)) {
      warn(
        lineNo,
        `«${text}» sıfırla başlayır və sətir kimi saxlanıldı. YAML 1.1 onu səkkizlik ədəd oxuyur (0755 → 493): rəqəm lazımdırsa baş sıfırı sil.`,
      );
      return text;
    }

    if (/^[-+]?[0-9]+(:[0-5]?[0-9])+$/.test(text)) {
      warn(
        lineNo,
        `«${text}» sətir kimi oxundu. YAML 1.1 iki nöqtəli rəqəmi altmışlıq ədədə çevirir (12:30 → 750): vaxt yazırsansa dırnağa al.`,
      );
      return text;
    }

    if (text.includes("_") && /^[-+]?[0-9][0-9_]*$/.test(text)) {
      warn(
        lineNo,
        `«${text}» sətir kimi oxundu. YAML 1.1 alt xətti rəqəm ayırıcısı sayır (1_000 → 1000): rəqəm lazımdırsa alt xətti sil.`,
      );
      return text;
    }

    if (/^[-+]?[0-9]+$/.test(text)) {
      const value = Number(text);
      /* Past 2^53 the digits no longer survive a JS number, so a Kafka offset
         or a snowflake id would come out of the converter changed. The string
         keeps every digit. */
      if (!Number.isSafeInteger(value)) {
        warn(
          lineNo,
          `«${text}» təhlükəsiz tam ədəd həddindən (2^53) böyükdür və sətir kimi saxlanıldı. Rəqəm kimi yazılsaydı son rəqəmləri dəyişərdi.`,
        );
        return text;
      }
      return value;
    }

    if (/^0x[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(2), 16);
    if (/^0o[0-7]+$/.test(text)) return parseInt(text.slice(2), 8);
    if (/^0b[01]+$/.test(text)) return parseInt(text.slice(2), 2);
    if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(text)) return Number(text);

    return text;
  }

  const root = parseNode(peek()?.indent ?? 0, 1);

  const leftover = peek();
  if (leftover) {
    fail(leftover, leftover.indent + 1, "Sənədin quruluşuna uyğun gəlməyən sətir: girintini yoxla.");
  }

  return root;
}

/** `\e` and `\a` have no JS literal, and `\_` is a non-breaking space. */
const DOUBLE_QUOTE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  e: "\u001b",
  a: "\u0007",
  N: "\u0085",
  _: "\u00a0",
  L: "\u2028",
  P: "\u2029",
  "\\": "\\",
  '"': '"',
  "/": "/",
  " ": " ",
};

/** In a folded block a line break becomes a space; an empty line stays a break. */
function foldLines(lines: string[]): string {
  let out = "";
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (k === 0) {
      out = line;
      continue;
    }
    if (line === "") {
      out += "\n";
      continue;
    }
    const previous = lines[k - 1];
    if (previous === "") {
      out += line;
      continue;
    }
    /* A line indented past the block keeps its own break — that is how a code
       sample survives inside a folded paragraph. */
    const moreIndented = line.startsWith(" ") || previous.startsWith(" ");
    out += (moreIndented ? "\n" : " ") + line;
  }
  return out;
}

/** True when a line reads as a key or a list entry rather than as free text. */
function looksStructural(content: string): boolean {
  if (content === "-" || content.startsWith("- ")) return true;
  return content.search(/:( |$)/) > 0;
}

/** Cuts a trailing comment off a plain scalar. `#` opens one only after a space. */
function stripComment(text: string): string {
  for (let k = 0; k < text.length; k++) {
    if (text[k] === "#" && (k === 0 || text[k - 1] === " ")) return text.slice(0, k);
  }
  return text;
}

/* ---------- public parsing ---------- */

type ParseFailure = { ok: false; lineNo: number; column: number; message: string };
type ParseSuccess = { ok: true; documents: unknown[]; warnings: YamlWarning[] };

function parseSource(source: string): ParseSuccess | ParseFailure {
  const warnings: YamlWarning[] = [];
  const warn: Warn = (line, text) => {
    // The same warning twice on one line says nothing new.
    if (!warnings.some((item) => item.line === line && item.text === text)) {
      warnings.push({ line, text });
    }
  };

  try {
    const lines = scanLines(source);
    const documents = splitDocuments(lines).map((range) => parseRange(lines, range, warn));
    return { ok: true, documents, warnings };
  } catch (cause) {
    if (cause instanceof YamlSyntaxError) {
      return { ok: false, lineNo: cause.lineNo, column: cause.column, message: cause.message };
    }
    if (cause instanceof RangeError) {
      return {
        ok: false,
        lineNo: 1,
        column: 1,
        message: "Quruluş həddindən artıq dərindir, çevirmə dayandırıldı.",
      };
    }
    /* Anything else is a defect in this parser rather than in the document. It
       still has to reach the visitor as a sentence instead of a blank page,
       because this runs inside a React render. */
    return {
      ok: false,
      lineNo: 1,
      column: 1,
      message: "Sənəd təhlil oluna bilmədi, quruluş gözlənilməz formadadır.",
    };
  }
}

/** Turns a 1-based line and column into the shared line/column/snippet readout. */
function buildIssue(text: string, lineNo: number, column: number, message: string): YamlIssue {
  const lines = text.split("\n");
  let offset = 0;
  for (let k = 0; k < lineNo - 1 && k < lines.length; k++) offset += lines[k].length + 1;

  const where = locate(text, offset + Math.max(0, column - 1));
  return { message, line: where.line, column: where.column, snippet: where.snippet };
}

export type YamlParseResult =
  | { ok: true; documents: unknown[]; warnings: YamlWarning[] }
  | { ok: false; error: YamlIssue };

export function parseYaml(text: string): YamlParseResult {
  const parsed = parseSource(text);
  if (parsed.ok) return { ok: true, documents: parsed.documents, warnings: parsed.warnings };
  return { ok: false, error: buildIssue(text, parsed.lineNo, parsed.column, parsed.message) };
}

/**
 * `lineOffset` exists for the frontmatter mode: the text being parsed is a
 * slice of what the visitor sees, so an error on line 2 of the slice has to be
 * reported on line 4 of their file.
 */
export function yamlToJson(
  text: string,
  indent: IndentOption = "2",
  options: { source?: string; lineOffset?: number } = {},
): YamlToJsonResult {
  const source = options.source ?? text;
  const lineOffset = options.lineOffset ?? 0;

  const parsed = parseSource(text);
  if (!parsed.ok) {
    return {
      ok: false,
      error: buildIssue(source, parsed.lineNo + lineOffset, parsed.column, parsed.message),
    };
  }

  /* One document is itself; several become an array, because JSON has no
     document separator and dropping the extras would be a silent loss. */
  const value =
    parsed.documents.length === 0
      ? null
      : parsed.documents.length === 1
        ? parsed.documents[0]
        : parsed.documents;

  return {
    ok: true,
    output: JSON.stringify(value, null, indent === "tab" ? "\t" : Number(indent)),
    value,
    documents: parsed.documents.length,
    warnings: parsed.warnings.map((item) => ({ ...item, line: item.line + lineOffset })),
  };
}

/* ---------- frontmatter ---------- */

export type FrontmatterSplit = {
  status: "found" | "missing" | "unterminated";
  frontmatter: string;
  body: string;
  /** How many lines of the file come before the frontmatter's first line. */
  lineOffset: number;
};

/**
 * Splits a `---` fenced header off a Markdown file. The whole file cannot go to
 * the YAML parser: after the closing `---` YAML reads the prose as a second
 * document, where a Markdown heading is a comment and the first ordinary
 * sentence is a syntax error.
 */
export function extractFrontmatter(text: string): FrontmatterSplit {
  const lines = text.split("\n");

  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;

  if (lines[start]?.trim() !== "---") {
    return { status: "missing", frontmatter: "", body: text, lineOffset: 0 };
  }

  for (let k = start + 1; k < lines.length; k++) {
    const marker = lines[k].trimEnd();
    if (marker === "---" || marker === "...") {
      return {
        status: "found",
        frontmatter: lines.slice(start + 1, k).join("\n"),
        body: lines.slice(k + 1).join("\n"),
        lineOffset: start + 1,
      };
    }
  }

  return { status: "unterminated", frontmatter: "", body: text, lineOffset: start + 1 };
}

/* ---------- JSON to YAML ---------- */

const INDICATORS = /^[-?:,[\]{}#&*!|>'"%@`]/;

/** Tokens a plain scalar would come back from as something other than a string. */
function looksTyped(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    ["null", "~", "true", "false", "yes", "no", "on", "off", ".inf", "-.inf", ".nan"].includes(lower)
  ) {
    return true;
  }
  if (/^[-+]?[0-9]+$/.test(text)) return true;
  if (/^0[xob][0-9a-fA-F]+$/.test(text)) return true;
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(text)) return true;
  if (/^[-+]?[0-9]+(:[0-5]?[0-9])+$/.test(text)) return true;
  if (text.includes("_") && /^[-+]?[0-9][0-9_]*$/.test(text)) return true;
  return false;
}

function needsQuotes(text: string): boolean {
  if (text === "") return true;
  if (text !== text.trim()) return true;
  if (INDICATORS.test(text)) return true;
  if (text.includes(": ") || text.includes(" #") || text.endsWith(":")) return true;
  if (hasControlChar(text, false)) return true;
  return looksTyped(text);
}

function quote(text: string): string {
  let out = '"';
  for (const ch of text) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (hasControlChar(ch, false)) {
      out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
    } else out += ch;
  }
  return `${out}"`;
}

/**
 * A block scalar is the readable way to write a multi-line string, but it can
 * only carry text whose shape survives being re-indented: a trailing space, a
 * first line starting with one, or more than one closing newline would come
 * back different. Those fall back to quotes, which is what keeps the
 * round-trip case in the check file honest.
 */
function blockHeader(text: string): "|" | "|-" | null {
  if (!text.includes("\n")) return null;
  if (hasControlChar(text, true) || text.includes("\t")) return null;

  const trailing = /\n*$/.exec(text)?.[0].length ?? 0;
  if (trailing > 1) return null;

  const body = trailing === 1 ? text.slice(0, -1) : text;
  const lines = body.split("\n");
  if (lines[0].startsWith(" ")) return null;
  if (lines.some((line) => /\s$/.test(line))) return null;

  return trailing === 1 ? "|" : "|-";
}

function formatKey(key: string): string {
  return needsQuotes(key) ? quote(key) : key;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const text = String(value);
  return needsQuotes(text) ? quote(text) : text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasChildren(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return false;
}

/** Empty collections have no block form, so they are written the flow way. */
function emitInline(value: unknown): string {
  if (Array.isArray(value)) return "[]";
  if (isPlainObject(value)) return "{}";
  return formatScalar(value);
}

function emitLines(value: unknown, indent: number): string[] {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const item of value) {
      if (isPlainObject(item) && hasChildren(item)) {
        /* The compact entry: the first key rides on the dash line and the rest
           line up under it, which is how a hand-written list looks. */
        const child = emitLines(item, indent + 2);
        lines.push(`${pad}- ${child[0].slice(indent + 2)}`, ...child.slice(1));
      } else if (hasChildren(item)) {
        /* A list inside a list: the dash keeps its own line, so the inner
           entries cannot be read as entries of the outer one. */
        lines.push(`${pad}-`, ...emitLines(item, indent + 2));
      } else {
        lines.push(`${pad}- ${emitInline(item)}`);
      }
    }
    return lines;
  }

  if (isPlainObject(value)) {
    const lines: string[] = [];
    for (const [key, item] of Object.entries(value)) {
      if (hasChildren(item)) {
        lines.push(`${pad}${formatKey(key)}:`, ...emitLines(item, indent + 2));
        continue;
      }

      if (typeof item === "string") {
        const header = blockHeader(item);
        if (header !== null) {
          const body = header === "|" ? item.slice(0, -1) : item;
          lines.push(`${pad}${formatKey(key)}: ${header}`);
          for (const line of body.split("\n")) lines.push(line === "" ? "" : `${pad}  ${line}`);
          continue;
        }
      }

      lines.push(`${pad}${formatKey(key)}: ${emitInline(item)}`);
    }
    return lines;
  }

  return [`${pad}${emitInline(value)}`];
}

export function stringifyYaml(value: unknown): string {
  if (!hasChildren(value)) return `${emitInline(value)}\n`;
  return `${emitLines(value, 0).join("\n")}\n`;
}

export function jsonToYaml(text: string): JsonToYamlResult {
  if (text.trim() === "") return { ok: true, output: "", value: null };

  /* The JSON tool already turns V8's parser message into an Azerbaijani one
     with a line, a column and a snippet. A second implementation of that here
     would only be a second thing to keep in step. */
  const parsed = formatJson(text, { mode: "pretty", indent: "2", sortKeys: false });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  /* The parsed value travels with the text so the page can count keys and
     depth without parsing the same document a second time. */
  return { ok: true, output: stringifyYaml(parsed.value), value: parsed.value };
}

/* ---------- summary ---------- */

export type YamlSummary = { keys: number; items: number; maxDepth: number };

export function summarise(value: unknown): YamlSummary {
  const totals = { keys: 0, items: 0, maxDepth: 0 };

  const walk = (node: unknown, depth: number): void => {
    if (Array.isArray(node)) {
      totals.maxDepth = Math.max(totals.maxDepth, depth);
      totals.items += node.length;
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (isPlainObject(node)) {
      totals.maxDepth = Math.max(totals.maxDepth, depth);
      const entries = Object.entries(node);
      totals.keys += entries.length;
      for (const [, item] of entries) walk(item, depth + 1);
    }
  };

  walk(value, 1);
  return totals;
}
