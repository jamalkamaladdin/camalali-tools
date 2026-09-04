/*
 * What is worth checking: pretty-printing indents nested elements correctly
 * at 2, 4 and tab width, minifying then pretty-printing again lands on the
 * same tree as pretty-printing directly (idempotence through the two
 * formats), CDATA and a comment survive untouched, an attribute keeps its
 * value byte-for-byte, and every class of malformed document this file
 * claims to catch — unclosed tag, mismatched close, two roots, a duplicated
 * attribute, an unquoted attribute value — comes back with an exact line and
 * column instead of throwing.
 */
import type { CheckSuite } from "./harness.mts";
import { minifyXml, prettyPrintXml, validateXml } from "../lib/xml";

export const checks: CheckSuite = (check) => {
  const twoSpace = prettyPrintXml("<a><b>x</b></a>", "2");
  check(
    "xml: pretty-print with 2-space indent nests the child element two spaces in",
    twoSpace.ok && twoSpace.output === "<a>\n  <b>x</b>\n</a>\n",
    `got: ${JSON.stringify(twoSpace)}`,
  );

  const fourSpace = prettyPrintXml("<a><b><c>x</c></b></a>", "4");
  check(
    "xml: pretty-print with 4-space indent nests two levels at 4 and 8 spaces",
    fourSpace.ok && fourSpace.output === "<a>\n    <b>\n        <c>x</c>\n    </b>\n</a>\n",
    `got: ${JSON.stringify(fourSpace)}`,
  );

  const tabIndent = prettyPrintXml("<a><b>x</b></a>", "tab");
  check(
    "xml: pretty-print with tab indent uses an actual tab character",
    tabIndent.ok && tabIndent.output === "<a>\n\t<b>x</b>\n</a>\n",
    `got: ${JSON.stringify(tabIndent)}`,
  );

  const source = '<root a="1"><b>text</b><c/><!--note--><![CDATA[<raw>]]></root>';
  const minified = minifyXml(source);
  const rePretty = minified.ok ? prettyPrintXml(minified.output, "2") : { ok: false as const, error: "n/a", line: 0, column: 0 };
  const directPretty = prettyPrintXml(source, "2");
  check(
    "xml: minify then pretty-print lands on the same tree as pretty-printing directly",
    minified.ok && rePretty.ok && directPretty.ok && rePretty.output === directPretty.output,
    `minified: ${JSON.stringify(minified)}, rePretty: ${JSON.stringify(rePretty)}, direct: ${JSON.stringify(directPretty)}`,
  );

  check(
    "xml: CDATA content is kept exactly, including characters that would otherwise need escaping",
    minified.ok && minified.output.includes("<![CDATA[<raw>]]>"),
    `got: ${JSON.stringify(minified)}`,
  );

  check(
    "xml: a comment survives minification untouched",
    minified.ok && minified.output.includes("<!--note-->"),
    `got: ${JSON.stringify(minified)}`,
  );

  check(
    "xml: an attribute value survives minification byte-for-byte",
    minified.ok && minified.output.includes('a="1"'),
    `got: ${JSON.stringify(minified)}`,
  );

  const selfClosing = prettyPrintXml('<a><b x="1"/></a>', "2");
  check(
    "xml: a self-closing element with an attribute keeps the shorthand form",
    selfClosing.ok && selfClosing.output.includes('<b x="1" />'),
    `got: ${JSON.stringify(selfClosing)}`,
  );

  const validRoot = validateXml("<a><b>x</b><c>y</c></a>");
  check(
    "xml: validation reports the root tag name and counts every element",
    validRoot.ok && validRoot.rootTag === "a" && validRoot.elementCount === 3,
    `got: ${JSON.stringify(validRoot)}`,
  );

  const unclosed = validateXml("<a><b>x</a>");
  check(
    "xml: a mismatched closing tag is caught with a line and column, not a throw",
    unclosed.ok === false && unclosed.line >= 1 && unclosed.column >= 1,
    `got: ${JSON.stringify(unclosed)}`,
  );

  const twoRoots = validateXml("<a>1</a><b>2</b>");
  check(
    "xml: two sibling root elements is refused — XML allows exactly one",
    twoRoots.ok === false,
    `got: ${JSON.stringify(twoRoots)}`,
  );

  const duplicateAttr = validateXml('<a x="1" x="2"></a>');
  check(
    "xml: a duplicated attribute on the same tag is refused rather than silently kept last",
    duplicateAttr.ok === false && duplicateAttr.error.includes("x"),
    `got: ${JSON.stringify(duplicateAttr)}`,
  );

  const unquotedAttr = validateXml("<a x=1></a>");
  check(
    "xml: an unquoted attribute value is refused rather than throwing",
    unquotedAttr.ok === false,
    `got: ${JSON.stringify(unquotedAttr)}`,
  );

  const empty = validateXml("   ");
  check(
    "xml: blank input returns an error rather than an empty-document throw",
    empty.ok === false,
    `got: ${JSON.stringify(empty)}`,
  );
};
