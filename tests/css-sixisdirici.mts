/*
 * What is worth checking here: a full run against a small realistic
 * stylesheet lands on the exact hand-computed string; a `/*!` comment
 * survives while an ordinary one does not; a quoted string and a `url()`
 * keep every byte, including internal double spaces, untouched by every
 * rule at once; turning a rule off leaves its target alone while the rest
 * still run; an `@media` prelude's `0px` is never rewritten by the value
 * rules even though the declaration one level in is; a colour shortens in
 * whichever direction is actually shorter, both ways; an unbalanced or
 * blank input never throws; the result is idempotent; and `empty-rules`
 * removes a genuinely empty rule while leaving an empty `@font-face` alone
 * on purpose.
 */
import type { CheckSuite } from "./harness.mts";
import { beautifyCss, CSS_MINIFY_RULES, minifyCss, type CssMinifyRule } from "../lib/css-sixisdirici";

const ALL_RULES = new Set<CssMinifyRule>(CSS_MINIFY_RULES);

export const checks: CheckSuite = (check) => {
  const sample = `.foo  {\n  color:   #ffffff;\n  margin: 0px  0.5em;\n}\n\n.bar{}`;
  const full = minifyCss(sample, ALL_RULES);
  check(
    "css-sixisdirici: known-answer pair — comments/colors/zero-unit/leading-zero/whitespace/semicolon/empty-rules all land on the exact expected string",
    full.output === ".foo{color:#fff;margin:0 .5em}",
    `got: ${full.output}`,
  );

  const licensed = "/*! License */ .a { color: red; }";
  const licensedResult = minifyCss(licensed, ALL_RULES);
  check(
    "css-sixisdirici: a /*! */ comment survives full minification while an ordinary one is stripped",
    licensedResult.output.includes("/*! License */") &&
      minifyCss("/* drop me */ .a{color:red}", ALL_RULES).output.includes("drop me") === false,
    `got: ${licensedResult.output}`,
  );

  const withLiterals = '.a { content: "0px  test"; background: url(foo  bar.png); }';
  const literalsResult = minifyCss(withLiterals, ALL_RULES);
  check(
    "css-sixisdirici: a quoted string and a url() keep their exact bytes — internal double space included — through every rule",
    literalsResult.output.includes('"0px  test"') &&
      literalsResult.output.includes("url(foo  bar.png)"),
    `got: ${literalsResult.output}`,
  );

  const onlyColors = new Set<CssMinifyRule>(["colors"]);
  const isolated = minifyCss("/* keep */ .a  {  color: #ffffff;  }", onlyColors);
  check(
    "css-sixisdirici: with only 'colors' enabled, the comment and the whitespace survive untouched while the colour still compacts",
    isolated.output.includes("/* keep */") &&
      isolated.output.includes("  color: #fff;  ") &&
      isolated.applied.length === 1 &&
      isolated.applied[0] === "colors",
    `got: ${isolated.output}, applied: ${JSON.stringify(isolated.applied)}`,
  );

  const mediaSample = "@media (min-width: 0px) { .a { margin: 0px; } }";
  const mediaResult = minifyCss(mediaSample, ALL_RULES);
  check(
    "css-sixisdirici: an @media prelude's 0px is left exactly as written while the declaration one level in is stripped to 0",
    mediaResult.output.includes("0px)") && mediaResult.output.includes("margin:0}"),
    `got: ${mediaResult.output}`,
  );

  const colorDirections = minifyCss(".a{color:white}.b{color:#ff0000}", ALL_RULES);
  check(
    "css-sixisdirici: a named colour shortens to hex when hex is shorter (white -> #fff), and a hex shortens to a name when the name is shorter (#ff0000 -> red)",
    colorDirections.output.includes("color:#fff") && colorDirections.output.includes("color:red"),
    `got: ${colorDirections.output}`,
  );

  const unbalanced = minifyCss(".a { color: red;", ALL_RULES);
  check(
    "css-sixisdirici: unbalanced input does not throw and is reported as not brace-balanced",
    typeof unbalanced.output === "string" && unbalanced.braceBalanced === false,
    `braceBalanced: ${unbalanced.braceBalanced}`,
  );

  const blank = minifyCss("", ALL_RULES);
  check(
    "css-sixisdirici: blank input is handed back unchanged rather than thrown",
    blank.output === "" && blank.applied.length === 0,
    `got: ${JSON.stringify(blank)}`,
  );

  const twiceMinified = minifyCss(full.output, ALL_RULES);
  check(
    "css-sixisdirici: minifying already-minified output is idempotent",
    twiceMinified.output === full.output,
    `first: ${full.output}, second: ${twiceMinified.output}`,
  );

  const emptyRulesOnly = new Set<CssMinifyRule>(["empty-rules"]);
  const emptyRuleResult = minifyCss(".gone {}\n@font-face {}", emptyRulesOnly);
  check(
    "css-sixisdirici: empty-rules removes a genuinely empty plain rule but deliberately spares an empty @-rule",
    !emptyRuleResult.output.includes(".gone") && emptyRuleResult.output.includes("@font-face {}"),
    `got: ${emptyRuleResult.output}`,
  );

  const percentBoundary = minifyCss(".a{width:100%;height:0%}", new Set<CssMinifyRule>(["zero-units"]));
  check(
    "css-sixisdirici: zero-units boundary — 100% is untouched, 0% becomes 0",
    percentBoundary.output.includes("100%") && percentBoundary.output.includes("height:0"),
    `got: ${percentBoundary.output}`,
  );

  const beautified = beautifyCss(".a{color:#fff;margin:0 .5em}");
  check(
    "css-sixisdirici: beautifyCss reformats a minified rule into one declaration per line with indentation",
    beautified === ".a {\n  color:#fff;\n  margin:0 .5em\n}",
    `got: ${JSON.stringify(beautified)}`,
  );
};
