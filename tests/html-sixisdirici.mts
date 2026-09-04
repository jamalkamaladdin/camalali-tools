/*
 * What is worth checking here: a full run against a small realistic page
 * lands on the exact hand-computed string; a conditional comment survives
 * while an ordinary one does not; `<pre>` keeps its internal whitespace
 * byte-for-byte no matter what else runs; the attribute-quote rule only
 * fires when the value is actually safe unquoted, and boolean-attribute
 * collapsing only fires for a known boolean attribute and leaves a
 * same-named ordinary one alone; `<style>`/`<script>` content is minified
 * through the site's own CSS/JS compressors when the rule is on and left
 * exactly as written when it is off; an external `src` script is never
 * rewritten; a JSON script tag is left alone by name rather than by luck;
 * the tag count invariant holds; and blank/malformed input never throws.
 */
import type { CheckSuite } from "./harness.mts";
import { HTML_MINIFY_RULES, minifyHtml, type HtmlMinifyRule } from "../lib/html-sixisdirici";

const ALL_RULES = new Set<HtmlMinifyRule>(HTML_MINIFY_RULES);

export const checks: CheckSuite = (check) => {
  const sample = '<div  class="foo"   id=\'x\'>\n  <p>hi</p>\n</div>';
  const full = minifyHtml(sample, ALL_RULES);
  check(
    "html-sixisdirici: known-answer pair — attribute quotes drop where safe and whitespace between tags collapses to one space",
    full.output === '<div class=foo id=x> <p>hi</p> </div>',
    `got: ${JSON.stringify(full.output)}`,
  );

  const conditional = "<!--[if IE]><p>old</p><![endif]--><!-- drop me -->";
  const conditionalResult = minifyHtml(conditional, ALL_RULES);
  check(
    "html-sixisdirici: a conditional comment survives full minification while an ordinary comment is stripped",
    conditionalResult.output.includes("<!--[if IE]>") &&
      conditionalResult.output.includes("<![endif]-->") &&
      !conditionalResult.output.includes("drop me"),
    `got: ${JSON.stringify(conditionalResult.output)}`,
  );

  const preSample = "<pre>  a    b\n\n  c  </pre><div>  x   y  </div>";
  const preResult = minifyHtml(preSample, ALL_RULES);
  check(
    "html-sixisdirici: <pre> content keeps its exact internal whitespace while ordinary text around it collapses",
    preResult.output.includes("<pre>  a    b\n\n  c  </pre>") && preResult.output.includes("<div> x y </div>"),
    `got: ${JSON.stringify(preResult.output)}`,
  );

  const unsafeAttr = minifyHtml('<a href="a b" title="ok">x</a>', new Set<HtmlMinifyRule>(["attr-quotes"]));
  check(
    "html-sixisdirici: attr-quotes leaves a value containing a space quoted, but drops quotes from a safe value",
    unsafeAttr.output.includes('href="a b"') && unsafeAttr.output.includes("title=ok"),
    `got: ${JSON.stringify(unsafeAttr.output)}`,
  );

  const boolAttr = minifyHtml(
    '<input disabled="disabled" data-x="data-x">',
    new Set<HtmlMinifyRule>(["boolean-attrs"]),
  );
  check(
    "html-sixisdirici: boolean-attrs collapses a known boolean attribute but leaves a same-named ordinary attribute quoted",
    !boolAttr.output.includes('disabled="disabled"') &&
      boolAttr.output.includes("<input disabled") &&
      boolAttr.output.includes('data-x="data-x"'),
    `got: ${JSON.stringify(boolAttr.output)}`,
  );

  const styleScriptOn = minifyHtml(
    "<style>.a  {  color: #ffffff;  }</style><script>const   x = 1;</script>",
    new Set<HtmlMinifyRule>(["style-script"]),
  );
  check(
    "html-sixisdirici: style-script on runs <style> through the CSS compressor and <script> through the JS compressor",
    styleScriptOn.output.includes("<style>.a{color:#fff}</style>") &&
      styleScriptOn.output.includes("<script>const x = 1;</script>"),
    `got: ${JSON.stringify(styleScriptOn.output)}`,
  );

  const styleScriptOff = minifyHtml(
    "<style>.a  {  color: #ffffff;  }</style>",
    new Set<HtmlMinifyRule>(["comments", "whitespace"]),
  );
  check(
    "html-sixisdirici: with style-script off, <style> content is byte-identical even though whitespace is enabled",
    styleScriptOff.output === "<style>.a  {  color: #ffffff;  }</style>",
    `got: ${JSON.stringify(styleScriptOff.output)}`,
  );

  const externalScript = minifyHtml(
    '<script src="app.js">   </script>',
    new Set<HtmlMinifyRule>(["style-script"]),
  );
  check(
    "html-sixisdirici: a script with src= is never rewritten, since there is nothing inline to compress",
    externalScript.output === '<script src="app.js">   </script>',
    `got: ${JSON.stringify(externalScript.output)}`,
  );

  const jsonScript = minifyHtml(
    '<script type="application/ld+json">{  "a": 1  }</script>',
    new Set<HtmlMinifyRule>(["style-script"]),
  );
  check(
    "html-sixisdirici: a script whose type names JSON is left exactly as written, by name rather than by luck",
    jsonScript.output === '<script type="application/ld+json">{  "a": 1  }</script>',
    `got: ${JSON.stringify(jsonScript.output)}`,
  );

  check(
    "html-sixisdirici: tag count is unchanged by minification (rules shrink bytes, never add or remove a tag)",
    full.tagCountBefore === full.tagCountAfter && full.tagCountBefore === 2,
    `before: ${full.tagCountBefore}, after: ${full.tagCountAfter}`,
  );

  const blank = minifyHtml("", ALL_RULES);
  check(
    "html-sixisdirici: blank input is handed back unchanged rather than thrown",
    blank.output === "" && blank.applied.length === 0,
    `got: ${JSON.stringify(blank)}`,
  );

  const malformed = "<div><p>unclosed";
  check(
    "html-sixisdirici: malformed (unclosed) markup does not throw",
    (() => {
      try {
        minifyHtml(malformed, ALL_RULES);
        return true;
      } catch {
        return false;
      }
    })(),
    "minifyHtml threw on malformed input",
  );
};
