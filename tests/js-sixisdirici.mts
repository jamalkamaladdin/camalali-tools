/*
 * What is worth checking here: the classic regex-vs-division ambiguity from
 * the tool's own brief (`a = b / c; d = /re/g`) is resolved correctly; a
 * `/*!` block comment and a `// @license` line comment both survive while an
 * ordinary comment of each kind does not; a string, a template literal (with
 * a live `${...}` interpolation inside) and a regex literal all keep their
 * exact bytes through whitespace collapsing; the ASI trap named in the
 * brief — `return\nvalue` must never become `return value` — is the one
 * case a wrong edit would break silently and quietly change behaviour
 * rather than throw; line-joining still joins where it is provably safe;
 * a syntactically broken result is discarded in favour of the original
 * input rather than handed back; and empty/garbage input never throws.
 */
import type { CheckSuite } from "./harness.mts";
import { JS_MINIFY_RULES, minifyJs, tokenizeJs, type JsMinifyRule } from "../lib/js-sixisdirici";

const ALL_RULES = new Set<JsMinifyRule>(JS_MINIFY_RULES);

export const checks: CheckSuite = (check) => {
  const divisionVsRegex = "a = b / c; d = /re/g;";
  const tokens = tokenizeJs(divisionVsRegex);
  const regexTokens = tokens.filter((t) => t.kind === "regex");
  check(
    "js-sixisdirici: 'a = b / c' is division (no regex token), 'd = /re/g' is one regex token",
    regexTokens.length === 1 && regexTokens[0].text === "/re/g",
    `got: ${JSON.stringify(tokens)}`,
  );

  const commentsSample =
    "/*! keep me */\n// @license keep too\n// drop me\n/* drop me too */\nconst x = 1;";
  const commentsResult = minifyJs(commentsSample, ALL_RULES);
  check(
    "js-sixisdirici: /*! */ and // @license survive full minification, an ordinary comment of each kind does not",
    commentsResult.output.includes("/*! keep me */") &&
      commentsResult.output.includes("// @license keep too") &&
      !commentsResult.output.includes("drop me") &&
      !commentsResult.output.includes("drop me too"),
    `got: ${JSON.stringify(commentsResult.output)}`,
  );

  const literalsSample = 'const s = "a  b"; const t = `x${1 + 1}  y`; const r = /a  b/;';
  const literalsResult = minifyJs(literalsSample, ALL_RULES);
  check(
    "js-sixisdirici: a string, a template literal with a live ${} interpolation, and a regex all keep internal double spaces exactly",
    literalsResult.output.includes('"a  b"') &&
      literalsResult.output.includes("`x${1 + 1}  y`") &&
      literalsResult.output.includes("/a  b/"),
    `got: ${JSON.stringify(literalsResult.output)}`,
  );

  const asiTrap = "function f() {\n  return\n  5\n}";
  const asiResult = minifyJs(asiTrap, ALL_RULES);
  check(
    "js-sixisdirici: the ASI trap — a bare 'return' is never joined to the next line on the same line (would change undefined into 5), and the result still parses",
    !/return[ \t]+5/.test(asiResult.output) && asiResult.syntaxOk === true,
    `got: ${JSON.stringify(asiResult.output)}, syntaxOk: ${asiResult.syntaxOk}`,
  );

  const safeJoin = "const x =\n  5;\nconst y = {\n  a: 1,\n  b: 2\n};";
  const safeJoinResult = minifyJs(safeJoin, new Set<JsMinifyRule>(["line-joining"]));
  check(
    "js-sixisdirici: line-joining merges a line ending in a trailing operator/comma with the next, with a single space",
    safeJoinResult.output.includes("const x = 5;") && safeJoinResult.output.includes("a: 1, b: 2"),
    `got: ${JSON.stringify(safeJoinResult.output)}`,
  );

  const broken = "function f( {";
  const brokenResult = minifyJs(broken, ALL_RULES);
  check(
    "js-sixisdirici: a syntactically broken result is discarded — output falls back to the original input, syntaxOk is false",
    brokenResult.syntaxOk === false && brokenResult.output === broken,
    `got: ${JSON.stringify(brokenResult)}`,
  );

  const valid = "function add(a, b) {\n  return a + b;\n}";
  const validResult = minifyJs(valid, ALL_RULES);
  check(
    "js-sixisdirici: syntactically valid input after minification reports syntaxOk true",
    validResult.syntaxOk === true && validResult.syntaxError === null,
    `got: ${JSON.stringify(validResult)}`,
  );

  const blank = minifyJs("", ALL_RULES);
  check(
    "js-sixisdirici: blank input is handed back unchanged rather than thrown",
    blank.output === "" && blank.applied.length === 0 && blank.syntaxOk === true,
    `got: ${JSON.stringify(blank)}`,
  );

  const garbage = "@@@ ///  ][[";
  check(
    "js-sixisdirici: garbage input does not throw",
    (() => {
      try {
        minifyJs(garbage, ALL_RULES);
        return true;
      } catch {
        return false;
      }
    })(),
    "minifyJs threw on garbage input",
  );

  const whitespaceOnly = minifyJs("function   f(  )  {\n\n\n  return   1;\n}", new Set<JsMinifyRule>(["whitespace"]));
  check(
    "js-sixisdirici: whitespace alone collapses runs of spaces and blank lines without joining any line",
    whitespaceOnly.output === "function f( ) {\nreturn 1;\n}",
    `got: ${JSON.stringify(whitespaceOnly.output)}`,
  );
};
