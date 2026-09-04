/**
 * Regex explainer: a pattern in, a tree of what each piece matches out, in
 * Azerbaijani — as opposed to `regex-spar`, which is a syntax cheat sheet
 * over generic examples, and `regex`, which is a live tester against text
 * the visitor supplies. This file never runs the pattern against anything;
 * it reads the pattern itself.
 *
 * `parseRegex` is a small hand-written recursive-descent parser
 * (alternation -> sequence -> quantified -> atom) producing an AST, because
 * explaining a regex means walking its structure, not its matches — the
 * platform's own regex engine has no API that hands back "this is a named
 * group containing a lazy quantifier". `explain` turns that AST into the
 * Azerbaijani tree the widget renders; `findWarnings` looks for three
 * specific, named traps over the same AST.
 *
 * Worth checking: group numbering (capturing groups only, left to right),
 * named groups, lookaround, quantifier ranges (`{2,4}`, `{3,}`, lazy `??`),
 * character classes with ranges and negation, the three warnings firing on
 * the pattern that is textbook for each and staying quiet on one that is
 * not, and a malformed pattern (unbalanced parenthesis, dangling quantifier)
 * returning an error rather than throwing.
 */

export type QuantKind = "star" | "plus" | "optional" | "range" | "none";

export type RegexNode =
  | { type: "literal"; char: string }
  | { type: "any" }
  | { type: "charClass"; negated: boolean; raw: string }
  | { type: "escapeClass"; kind: "d" | "D" | "w" | "W" | "s" | "S" }
  | { type: "unicodeProperty"; negated: boolean; name: string }
  | { type: "anchorStart" }
  | { type: "anchorEnd" }
  | { type: "wordBoundary"; negated: boolean }
  | { type: "backreference"; ref: string }
  | {
      type: "group";
      kind: "capture" | "non-capture" | "named" | "lookahead" | "neg-lookahead" | "lookbehind" | "neg-lookbehind";
      name?: string;
      number?: number;
      child: RegexNode;
    }
  | { type: "alternation"; options: RegexNode[] }
  | { type: "sequence"; items: RegexNode[] }
  | { type: "quantified"; child: RegexNode; min: number; max: number | null; lazy: boolean; raw: string };

class ParseError extends Error {}

class Cursor {
  constructor(
    public readonly source: string,
    public pos: number = 0,
  ) {}
  peek(): string | undefined {
    return this.source[this.pos];
  }
  next(): string {
    const char = this.source[this.pos];
    if (char === undefined) throw new ParseError("Naxış gözlənilmədən bitdi.");
    this.pos += 1;
    return char;
  }
  eof(): boolean {
    return this.pos >= this.source.length;
  }
  expect(char: string): void {
    if (this.peek() !== char) throw new ParseError(`"${char}" gözlənilirdi, "${this.peek() ?? "naxışın sonu"}" tapıldı.`);
    this.pos += 1;
  }
}

function parseAlternation(c: Cursor): RegexNode {
  const options = [parseSequence(c)];
  while (c.peek() === "|") {
    c.next();
    options.push(parseSequence(c));
  }
  return options.length === 1 ? options[0] : { type: "alternation", options };
}

function parseSequence(c: Cursor): RegexNode {
  const items: RegexNode[] = [];
  while (!c.eof() && c.peek() !== "|" && c.peek() !== ")") {
    items.push(parseQuantified(c));
  }
  if (items.length === 1) return items[0];
  return { type: "sequence", items };
}

function parseQuantified(c: Cursor): RegexNode {
  const start = c.pos;
  const atom = parseAtom(c);
  const q = c.peek();
  if (q === "*" || q === "+" || q === "?") {
    c.next();
    let lazy = false;
    if (c.peek() === "?") {
      c.next();
      lazy = true;
    }
    const min = q === "+" ? 1 : 0;
    const max = q === "?" ? 1 : null;
    return { type: "quantified", child: atom, min, max, lazy, raw: c.source.slice(start, c.pos) };
  }
  if (q === "{") {
    const braceStart = c.pos;
    const match = /^\{(\d+)(,(\d*)?)?\}/.exec(c.source.slice(c.pos));
    if (match) {
      c.pos += match[0].length;
      const min = Number(match[1]);
      const max = match[2] === undefined ? min : match[3] === "" || match[3] === undefined ? null : Number(match[3]);
      let lazy = false;
      if (c.peek() === "?") {
        c.next();
        lazy = true;
      }
      return { type: "quantified", child: atom, min, max, lazy, raw: c.source.slice(start, c.pos) };
    }
    c.pos = braceStart; // "{" that is not a real quantifier is a literal brace
  }
  return atom;
}

let groupCounter = 0;

function parseAtom(c: Cursor): RegexNode {
  const char = c.next();

  if (char === "(") return parseGroup(c);
  if (char === ".") return { type: "any" };
  if (char === "^") return { type: "anchorStart" };
  if (char === "$") return { type: "anchorEnd" };
  if (char === "[") return parseCharClass(c);
  if (char === "\\") return parseEscape(c);
  return { type: "literal", char };
}

function parseGroup(c: Cursor): RegexNode {
  if (c.peek() === "?") {
    c.next();
    const marker = c.next();
    if (marker === ":") {
      const child = parseAlternation(c);
      c.expect(")");
      return { type: "group", kind: "non-capture", child };
    }
    if (marker === "=") {
      const child = parseAlternation(c);
      c.expect(")");
      return { type: "group", kind: "lookahead", child };
    }
    if (marker === "!") {
      const child = parseAlternation(c);
      c.expect(")");
      return { type: "group", kind: "neg-lookahead", child };
    }
    if (marker === "<") {
      const sign = c.peek();
      if (sign === "=" || sign === "!") {
        c.next();
        const child = parseAlternation(c);
        c.expect(")");
        return { type: "group", kind: sign === "=" ? "lookbehind" : "neg-lookbehind", child };
      }
      let name = "";
      while (c.peek() !== ">") name += c.next();
      c.next(); // ">"
      groupCounter += 1;
      const number = groupCounter;
      const child = parseAlternation(c);
      c.expect(")");
      return { type: "group", kind: "named", name, number, child };
    }
    throw new ParseError(`Naməlum qrup növü: (?${marker}`);
  }
  groupCounter += 1;
  const number = groupCounter;
  const child = parseAlternation(c);
  c.expect(")");
  return { type: "group", kind: "capture", number, child };
}

function parseCharClass(c: Cursor): RegexNode {
  const start = c.pos - 1; // include the "["
  let negated = false;
  if (c.peek() === "^") {
    negated = true;
    c.next();
  }
  if (c.peek() === "]") c.next(); // a "]" right after "[" or "[^" is a literal member, not the closer
  while (c.peek() !== "]") {
    if (c.eof()) throw new ParseError("Xarakter sinfi bağlanmayıb: sona çatan \"]\" yoxdur.");
    if (c.peek() === "\\") c.next();
    c.next();
  }
  c.next(); // closing "]"
  return { type: "charClass", negated, raw: c.source.slice(start, c.pos) };
}

const ESCAPE_CLASS = new Set(["d", "D", "w", "W", "s", "S"]);

function parseEscape(c: Cursor): RegexNode {
  const char = c.next();
  if (ESCAPE_CLASS.has(char)) return { type: "escapeClass", kind: char as "d" | "D" | "w" | "W" | "s" | "S" };
  if (char === "b") return { type: "wordBoundary", negated: false };
  if (char === "B") return { type: "wordBoundary", negated: true };
  if (char === "p" || char === "P") {
    if (c.peek() !== "{") throw new ParseError(`\\${char} sonra "{" gözlənilirdi.`);
    c.next();
    let name = "";
    while (c.peek() !== "}") name += c.next();
    c.next();
    return { type: "unicodeProperty", negated: char === "P", name };
  }
  if (/[1-9]/.test(char)) {
    let ref = char;
    while (/[0-9]/.test(c.peek() ?? "")) ref += c.next();
    return { type: "backreference", ref };
  }
  if (char === "k" && c.peek() === "<") {
    c.next();
    let name = "";
    while (c.peek() !== ">") name += c.next();
    c.next();
    return { type: "backreference", ref: name };
  }
  const literalFor: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0" };
  return { type: "literal", char: literalFor[char] ?? char };
}

export type ParseResult = { ok: true; root: RegexNode; groupCount: number } | { ok: false; error: string };

/** Accepts either a bare pattern or a `/pattern/flags` literal — the flags, if given this way, are returned too. */
export function parseRegex(input: string): ParseResult & { flags?: string } {
  let source = input.trim();
  let flags = "";
  const literalMatch = /^\/(.*)\/([a-z]*)$/s.exec(source);
  if (literalMatch) {
    source = literalMatch[1];
    flags = literalMatch[2];
  }

  groupCounter = 0;
  try {
    // A validity pre-check against the platform's own engine catches
    // constructs this hand-written parser might otherwise wave through
    // silently (an invalid backreference number, for instance).
    new RegExp(source, flags.replace(/[^a-z]/g, ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Bu düzgün regex deyil: ${message}`, flags };
  }

  try {
    const cursor = new Cursor(source);
    const root = parseAlternation(cursor);
    if (!cursor.eof()) throw new ParseError(`Gözlənilməyən "${cursor.peek()}" simvolu.`);
    return { ok: true, root, groupCount: groupCounter, flags };
  } catch (error) {
    const message = error instanceof ParseError ? error.message : "Naxış oxuna bilmədi.";
    return { ok: false, error: message, flags };
  }
}

/* ---------- explaining the tree ---------- */

export type ExplainedNode = {
  token: string;
  description: string;
  quantifier?: string;
  children?: ExplainedNode[];
};

function quantifierLabel(min: number, max: number | null, lazy: boolean): string {
  const greediness = lazy ? " (lazy: mümkün olan ən az sayda)" : "";
  if (min === 0 && max === null) return `0 və ya daha çox${greediness}`;
  if (min === 1 && max === null) return `1 və ya daha çox${greediness}`;
  if (min === 0 && max === 1) return `0 və ya 1${greediness}`;
  if (max === null) return `${min} və ya daha çox${greediness}`;
  if (min === max) return `dəqiq ${min}${greediness}`;
  return `${min}–${max}${greediness}`;
}

const GROUP_LABEL: Record<string, string> = {
  capture: "Tutan qrup",
  "non-capture": "Tutmayan qrup",
  named: "Adlandırılmış qrup",
  lookahead: "İrəli baxış (lookahead)",
  "neg-lookahead": "Mənfi irəli baxış (negative lookahead)",
  lookbehind: "Geri baxış (lookbehind)",
  "neg-lookbehind": "Mənfi geri baxış (negative lookbehind)",
};

const ESCAPE_LABEL: Record<string, string> = {
  d: "rəqəm (0–9)",
  D: "rəqəm olmayan simvol",
  w: "söz simvolu (ASCII hərf, rəqəm, alt xətt)",
  W: "söz simvolu olmayan",
  s: "boşluq simvolu",
  S: "boşluq olmayan simvol",
};

export function explain(node: RegexNode): ExplainedNode {
  switch (node.type) {
    case "literal":
      return { token: node.char, description: `Hərfi mənada "${node.char}" simvolunu tutur.` };
    case "any":
      return { token: ".", description: "İstənilən bir simvolu tutur (yeni sətir istisna, `s` bayrağı olmasa)." };
    case "charClass":
      return {
        token: node.raw,
        description: node.negated
          ? `Xarakter sinfi: daxildəkilərdən BAŞQA istənilən bir simvolu tutur.`
          : `Xarakter sinfi: daxildəkilərdən birini tutur.`,
      };
    case "escapeClass":
      return { token: `\\${node.kind}`, description: `Qısayol: ${ESCAPE_LABEL[node.kind]}.` };
    case "unicodeProperty":
      return {
        token: `\\${node.negated ? "P" : "p"}{${node.name}}`,
        description: `Unicode xüsusiyyəti "${node.name}"${node.negated ? " OLMAYAN" : ""} bir simvolu tutur.`,
      };
    case "anchorStart":
      return { token: "^", description: "Lövbər: sətrin (və ya `m` bayrağı yoxdursa mətnin) əvvəli." };
    case "anchorEnd":
      return { token: "$", description: "Lövbər: sətrin (və ya `m` bayrağı yoxdursa mətnin) sonu." };
    case "wordBoundary":
      return { token: node.negated ? "\\B" : "\\b", description: node.negated ? "Söz sərhədi OLMAYAN mövqe." : "Söz sərhədi: söz simvolu ilə söz-olmayan arasındaki mövqe." };
    case "backreference":
      return { token: `\\${node.ref}`, description: `Geri istinad: ${/^[0-9]+$/.test(node.ref) ? `${node.ref}-ci qrupun` : `"${node.ref}" adlı qrupun`} tutduğu mətni təkrar axtarır.` };
    case "group": {
      const child = explain(node.child);
      const label = GROUP_LABEL[node.kind];
      const numbering = node.kind === "capture" ? ` #${node.number}` : node.kind === "named" ? ` #${node.number}: "${node.name}"` : "";
      return { token: tokenFor(node), description: `${label}${numbering}:`, children: [child] };
    }
    case "alternation":
      return { token: node.options.map(tokenFor).join("|"), description: "Alternativlərdən biri:", children: node.options.map(explain) };
    case "sequence":
      return { token: node.items.map(tokenFor).join(""), description: "Ardıcıllıq:", children: node.items.map(explain) };
    case "quantified": {
      const child = explain(node.child);
      return { ...child, token: node.raw.length > 0 ? `${child.token}${node.raw}` : child.token, quantifier: quantifierLabel(node.min, node.max, node.lazy) };
    }
  }
}

/** A short source-like rendering of a node, used only to label a parent's `token` field — not a full re-serialiser. */
function tokenFor(node: RegexNode): string {
  switch (node.type) {
    case "literal":
      return node.char;
    case "any":
      return ".";
    case "charClass":
      return node.raw;
    case "escapeClass":
      return `\\${node.kind}`;
    case "unicodeProperty":
      return `\\${node.negated ? "P" : "p"}{${node.name}}`;
    case "anchorStart":
      return "^";
    case "anchorEnd":
      return "$";
    case "wordBoundary":
      return node.negated ? "\\B" : "\\b";
    case "backreference":
      return `\\${node.ref}`;
    case "group": {
      const inner = tokenFor(node.child);
      if (node.kind === "capture") return `(${inner})`;
      if (node.kind === "non-capture") return `(?:${inner})`;
      if (node.kind === "named") return `(?<${node.name}>${inner})`;
      if (node.kind === "lookahead") return `(?=${inner})`;
      if (node.kind === "neg-lookahead") return `(?!${inner})`;
      if (node.kind === "lookbehind") return `(?<=${inner})`;
      return `(?<!${inner})`;
    }
    case "alternation":
      return node.options.map(tokenFor).join("|");
    case "sequence":
      return node.items.map(tokenFor).join("");
    case "quantified":
      return node.raw;
  }
}

/* ---------- warnings ---------- */

export type Warning = { kind: "backtracking" | "dot" | "anchor-multiline"; message: string };

/** Unwraps a single-item sequence or a non/capturing group down to the node that actually repeats. */
function unwrapToRepeatable(node: RegexNode): RegexNode {
  if (node.type === "sequence" && node.items.length === 1) return unwrapToRepeatable(node.items[0]);
  if (node.type === "group" && (node.kind === "capture" || node.kind === "non-capture")) return unwrapToRepeatable(node.child);
  return node;
}

function isUnboundedQuantifier(node: RegexNode): boolean {
  return node.type === "quantified" && (node.max === null || node.max > 1);
}

/** Nested unbounded quantifiers — `(a+)+`, `(a*)*`, `(\d+)+` — where the outer repetition can re-split the same
 *  text the inner one already consumed in more than one way, which is what makes backtracking blow up. */
function hasCatastrophicNesting(node: RegexNode): boolean {
  if (node.type === "quantified" && isUnboundedQuantifier(node)) {
    const inner = unwrapToRepeatable(node.child);
    if (isUnboundedQuantifier(inner)) return true;
  }
  return walkChildren(node).some(hasCatastrophicNesting);
}

function hasDot(node: RegexNode): boolean {
  if (node.type === "any") return true;
  return walkChildren(node).some(hasDot);
}

function walkChildren(node: RegexNode): RegexNode[] {
  if (node.type === "group") return [node.child];
  if (node.type === "alternation") return node.options;
  if (node.type === "sequence") return node.items;
  if (node.type === "quantified") return [node.child];
  return [];
}

/* Counted on the AST rather than by scanning the source string, on purpose:
   a raw-string check for "^ not at position 0" flags a negated character
   class like `[^0-9]` as a mid-pattern anchor, because its "^" sits at some
   later index too — but `parseCharClass` never produces an `anchorStart`
   node for that "^", it is consumed as part of the class's raw text. Walking
   the tree only counts a "^"/"$" that the parser actually treated as an
   anchor. */
function countNodesOfType(node: RegexNode, type: RegexNode["type"]): number {
  const self = node.type === type ? 1 : 0;
  return self + walkChildren(node).reduce((sum, child) => sum + countNodesOfType(child, type), 0);
}

export function findWarnings(flags: string, root: RegexNode): Warning[] {
  const warnings: Warning[] = [];

  if (hasCatastrophicNesting(root)) {
    warnings.push({
      kind: "backtracking",
      message: "İç-içə təkrar kəmiyyəti var (məsələn `(a+)+`). Uyğunsuz uzun girişdə mühərrik eksponensial sayda yol sınayır və brauzer donur: daxili qrupu tutmayan qrupa çevirmək kömək etmir, quruluşu dəyişmək lazımdır.",
    });
  }

  if (hasDot(root)) {
    warnings.push({
      kind: "dot",
      message: 'Qaçırılmamış "." istənilən simvolu tutur: hərfi nöqtəni nəzərdə tutursansa "\\." yaz, əks halda naxış gözlədiyindən daha çoxunu tutur.',
    });
  }

  const isMultiline = flags.includes("m");
  if (!isMultiline) {
    const anchorStarts = countNodesOfType(root, "anchorStart");
    const anchorEnds = countNodesOfType(root, "anchorEnd");
    // More than one "^" (or "$") only makes sense if each one is meant to
    // anchor its own line — a single-pass, whole-string match never needs
    // the same anchor twice.
    if (anchorStarts > 1 || anchorEnds > 1) {
      warnings.push({
        kind: "anchor-multiline",
        message: '"^" və "$" `m` bayrağı olmadan yalnız mətnin mütləq əvvəlini/sonunu tutur, hər sətrin yox. Naxışda bir neçə "^" və ya "$" var: bu, hər sətrin əvvəlini/sonunu gözlədiyinin işarəsidir. Belədirsə naxışın sonuna "m" bayrağını əlavə et.',
      });
    }
  }

  return warnings;
}
