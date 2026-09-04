/**
 * SVG optimiser, hand-written rule by rule rather than wrapped around a
 * third-party minifier — this site carries no dependency that could do it.
 * Every rule below is a self-contained string transform over the raw markup:
 * there is no DOM here, because Node has none to parse into and a browser's
 * `DOMParser` would silently normalise the very whitespace and attribute
 * order this file is trying to control one rule at a time. Regular
 * expressions over the source text are therefore not a shortcut, they are
 * the only implementation that lets a visitor toggle "strip unused ids" on
 * its own and see just that rule's effect.
 *
 * Each rule is applied independently and its own byte delta is recorded, so
 * the widget can show "which rule earned how much" rather than one opaque
 * total. `optimizeSvg` also re-checks that its own output is still
 * well-formed markup carrying the same graphic elements it started with —
 * the round-trip property a wrong regex would otherwise break silently.
 */

export type SvgOptimizeRule =
  | "xml-declaration"
  | "comments"
  | "editor-metadata"
  | "title-desc"
  | "empty-groups"
  | "unused-ids"
  | "default-attrs"
  | "numeric-precision"
  | "colors"
  | "path-whitespace";

/** Declaration order — also the order rules are applied in and the widget's checkbox list uses. */
export const SVG_OPTIMIZE_RULES: SvgOptimizeRule[] = [
  "xml-declaration",
  "comments",
  "editor-metadata",
  "title-desc",
  "empty-groups",
  "unused-ids",
  "default-attrs",
  "numeric-precision",
  "colors",
  "path-whitespace",
];

export const SVG_OPTIMIZE_RULE_LABELS: Record<SvgOptimizeRule, string> = {
  "xml-declaration": "XML deklarasiyası (<?xml ... ?>) atılır",
  comments: "Şərhlər (<!-- ... -->) atılır",
  "editor-metadata": "Redaktor metadata-sı (<metadata>, sodipodi:, inkscape:) atılır",
  "title-desc": "<title> və <desc> atılır",
  "empty-groups": "Boş <g> qrupları atılır",
  "unused-ids": "İstifadə olunmayan id atributları atılır",
  "default-attrs": "Defolt dəyərli atributlar (opacity=\"1\" və s.) atılır",
  "numeric-precision": "Rəqəmlərin onluq dəqiqliyi azaldılır",
  colors: "Rənglər qısaldılır (#ffffff → #fff, rgb() → hex)",
  "path-whitespace": "Yol məlumatındakı artıq boşluq və sıfırlar yığılır",
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/* ---------- individual rules ---------- */

export function stripXmlDeclaration(svg: string): string {
  return svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}

export function stripComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Editor fingerprints: the whole `<metadata>` block, and any attribute or
 * namespace declaration in the `sodipodi:`/`inkscape:` prefixes Inkscape
 * writes into every file it saves. Kept apart from `title-desc` because
 * `<title>`/`<desc>` can carry real accessibility text a visitor wrote on
 * purpose, while these two prefixes never carry anything a browser reads.
 */
export function stripEditorMetadata(svg: string): string {
  let result = svg.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, "");
  result = result.replace(/<metadata\b[^>]*\/>/gi, "");
  result = result.replace(/\s(?:sodipodi|inkscape):[\w-]+=("[^"]*"|'[^']*')/g, "");
  result = result.replace(/\sxmlns:(?:sodipodi|inkscape)=("[^"]*"|'[^']*')/g, "");
  return result;
}

export function stripTitleAndDesc(svg: string): string {
  return svg
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/gi, "");
}

/**
 * Removes `<g>...</g>` and `<g/>` with nothing (or only whitespace) between
 * the tags. Run repeatedly — up to five passes — because deleting an inner
 * empty group can leave its parent group empty too, and a fixed-point loop
 * is simpler and safer than trying to catch every nesting depth in one
 * regex pass.
 */
export function stripEmptyGroups(svg: string): string {
  let current = svg;
  for (let pass = 0; pass < 5; pass++) {
    const next = current
      .replace(/<g(?:\s[^>]*)?>\s*<\/g>/g, "")
      .replace(/<g(?:\s[^>]*)?\/>/g, "");
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * An `id` is "used" if `#name` appears anywhere else in the document — as a
 * `url(#name)` paint reference, an `href="#name"`/`xlink:href="#name"` reuse,
 * or a `#name { ... }` selector inside an embedded `<style>` block. Scanning
 * the whole document for the `#`-prefixed form rather than trying to
 * enumerate every attribute that can carry a reference is deliberately
 * broad: an `id` this misses as "used" only means it survives when it did
 * not have to, never the reverse, which is the safe direction for a tool
 * that must not change how the picture renders.
 */
export function stripUnusedIds(svg: string): string {
  const used = new Set<string>();
  const referencePattern = /#([A-Za-z0-9_:.\-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = referencePattern.exec(svg)) !== null) {
    used.add(match[1]);
  }

  return svg.replace(/\sid=("([^"]*)"|'([^']*)')/g, (full, _quoted, dq, sq) => {
    const value = dq !== undefined ? dq : sq;
    return used.has(value) ? full : "";
  });
}

/** Attribute/value pairs whose declared default the SVG/CSS spec already applies — safe to elide without changing rendering. */
const DEFAULT_ATTRS: [string, string][] = [
  ["opacity", "1"],
  ["fill-opacity", "1"],
  ["stroke-opacity", "1"],
  ["stroke-miterlimit", "4"],
  ["fill-rule", "nonzero"],
  ["clip-rule", "nonzero"],
];

export function stripDefaultAttributes(svg: string): string {
  let result = svg;
  for (const [name, value] of DEFAULT_ATTRS) {
    const pattern = new RegExp(`\\s${escapeRegExp(name)}=("${escapeRegExp(value)}"|'${escapeRegExp(value)}')`, "g");
    result = result.replace(pattern, "");
  }
  return result;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

export function roundNumbersInString(value: string, precision: number): string {
  return value.replace(/-?\d+\.\d+/g, (match) => trimTrailingZeros(Number(match).toFixed(precision)));
}

const NUMERIC_ATTRS = [
  "d",
  "points",
  "viewBox",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "stroke-width",
  "offset",
  "transform",
];

/** Applies `transform` to the value of every occurrence of any name in `attrNames`, whichever quote style it was written with. */
function mapAttributeValues(
  svg: string,
  attrNames: string[],
  transform: (value: string) => string,
): string {
  const namesPattern = attrNames.map(escapeRegExp).join("|");
  const pattern = new RegExp(`(\\s(?:${namesPattern})=)("[^"]*"|'[^']*')`, "g");
  return svg.replace(pattern, (_full, prefix: string, quoted: string) => {
    const quoteChar = quoted[0];
    const inner = quoted.slice(1, -1);
    return `${prefix}${quoteChar}${transform(inner)}${quoteChar}`;
  });
}

export function roundNumericAttributes(svg: string, precision: number): string {
  return mapAttributeValues(svg, NUMERIC_ATTRS, (value) => roundNumbersInString(value, precision));
}

function componentToHex(component: number): string {
  return Math.max(0, Math.min(255, component)).toString(16).padStart(2, "0");
}

function collapseHex(hex: string): string {
  const lower = hex.toLowerCase();
  if (
    lower.length === 6 &&
    lower[0] === lower[1] &&
    lower[2] === lower[3] &&
    lower[4] === lower[5]
  ) {
    return `${lower[0]}${lower[2]}${lower[4]}`;
  }
  return lower;
}

/** `rgb(r,g,b)` to hex, then a 6-digit hex to its 3-digit shorthand when the two digits of every channel match. */
export function compressColors(svg: string): string {
  let result = svg.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi, (_full, r, g, b) => {
    return `#${componentToHex(Number(r))}${componentToHex(Number(g))}${componentToHex(Number(b))}`;
  });
  result = result.replace(/#([0-9a-fA-F]{6})\b/g, (_full, hex: string) => `#${collapseHex(hex)}`);
  result = result.replace(/#([0-9a-fA-F]{3})\b/g, (_full, hex: string) => `#${hex.toLowerCase()}`);
  return result;
}

/**
 * Collapses commas and repeated whitespace to single spaces, drops the space
 * a command letter never needs around it, and strips a redundant leading
 * zero before a decimal point (`0.5` → `.5`, `-0.5` → `-.5`) — every parser
 * that reads path data accepts the short form, and it is the single biggest
 * source of dead bytes in an unoptimised `d` attribute.
 */
export function compressPathData(value: string): string {
  let result = value.trim().replace(/[,\s]+/g, " ");
  result = result.replace(/ ?([A-Za-z]) ?/g, "$1");
  result = result.replace(/(?<=^|[ A-Za-z,-])0\.(?=\d)/g, ".");
  return result.trim();
}

export function compressPathAttributes(svg: string): string {
  return mapAttributeValues(svg, ["d", "points"], compressPathData);
}

/* ---------- well-formedness and structural round-trip ---------- */

/**
 * A minimal stack-based tag matcher — not a validator for arbitrary XML, but
 * enough to catch the failure mode a bad regex in this file would actually
 * cause: a rule that deletes half a tag or leaves one unclosed. Runs on the
 * output only, after every rule; the visitor's original input is not
 * assumed to be well-formed in the first place.
 */
export function isWellFormedXml(svg: string): boolean {
  // The attribute run is lazy on purpose: a greedy `[^<>]*` swallows the
  // trailing `/` of a self-closing tag before the final `(\/?)` ever sees
  // it, which is what silently turned every `<path ... />` into an
  // (unclosed) opening tag the first time this was written.
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?(\/?)>/g;
  const stack: string[] = [];
  let sawTag = false;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(svg)) !== null) {
    const [, closing, name, selfClosing] = match;
    sawTag = true;
    if (closing === "/") {
      if (stack.pop() !== name) return false;
    } else if (selfClosing !== "/") {
      stack.push(name);
    }
  }

  return sawTag && stack.length === 0;
}

const GRAPHIC_ELEMENTS = [
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "use",
  "image",
];

/** Counts the tags that actually draw something — a `<g>` is a container and is deliberately not among them. */
export function countGraphicElements(svg: string): number {
  let total = 0;
  for (const tag of GRAPHIC_ELEMENTS) {
    const matches = svg.match(new RegExp(`<${tag}(?=[\\s/>])`, "g"));
    total += matches ? matches.length : 0;
  }
  return total;
}

/* ---------- orchestration ---------- */

export type SvgOptimizeResult = {
  output: string;
  applied: SvgOptimizeRule[];
  ruleSavings: { rule: SvgOptimizeRule; bytesSaved: number }[];
  inputBytes: number;
  outputBytes: number;
  savingsPercent: number;
  wellFormed: boolean;
  elementCountBefore: number;
  elementCountAfter: number;
};

/**
 * Runs every rule in `enabled`, in `SVG_OPTIMIZE_RULES` order, over `svg`.
 * Order matters in a few places — `title-desc` after `editor-metadata` so a
 * `<title>` inside an already-stripped `<metadata>` block is not double
 * counted; `numeric-precision` before `path-whitespace` so the leading-zero
 * strip sees numbers already rounded, not the other way round.
 *
 * Input that is blank or does not contain an `<svg` tag is not a document
 * this file can optimise, and is handed back unchanged with `wellFormed:
 * false` rather than thrown — the malformed-input case the check suite
 * pins down.
 */
export function optimizeSvg(
  svg: string,
  enabled: Set<SvgOptimizeRule>,
  precision: number = 2,
): SvgOptimizeResult {
  const inputBytes = byteLength(svg);
  const elementCountBefore = countGraphicElements(svg);

  if (svg.trim() === "" || !/<svg[\s>]/i.test(svg)) {
    return {
      output: svg,
      applied: [],
      ruleSavings: [],
      inputBytes,
      outputBytes: inputBytes,
      savingsPercent: 0,
      wellFormed: false,
      elementCountBefore,
      elementCountAfter: elementCountBefore,
    };
  }

  const clampedPrecision = Math.min(6, Math.max(0, Math.round(precision)));
  let current = svg;
  const applied: SvgOptimizeRule[] = [];
  const ruleSavings: { rule: SvgOptimizeRule; bytesSaved: number }[] = [];

  const runRule = (rule: SvgOptimizeRule, fn: (input: string) => string) => {
    if (!enabled.has(rule)) return;
    const before = byteLength(current);
    const next = fn(current);
    if (next !== current) {
      applied.push(rule);
      current = next;
    }
    ruleSavings.push({ rule, bytesSaved: before - byteLength(current) });
  };

  runRule("xml-declaration", stripXmlDeclaration);
  runRule("comments", stripComments);
  runRule("editor-metadata", stripEditorMetadata);
  runRule("title-desc", stripTitleAndDesc);
  runRule("empty-groups", stripEmptyGroups);
  runRule("unused-ids", stripUnusedIds);
  runRule("default-attrs", stripDefaultAttributes);
  runRule("numeric-precision", (s) => roundNumericAttributes(s, clampedPrecision));
  runRule("colors", compressColors);
  runRule("path-whitespace", compressPathAttributes);

  const outputBytes = byteLength(current);

  return {
    output: current,
    applied,
    ruleSavings,
    inputBytes,
    outputBytes,
    savingsPercent: inputBytes > 0 ? ((inputBytes - outputBytes) / inputBytes) * 100 : 0,
    wellFormed: isWellFormedXml(current),
    elementCountBefore,
    elementCountAfter: countGraphicElements(current),
  };
}
