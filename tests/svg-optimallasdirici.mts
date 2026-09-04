/*
 * What is worth checking here: a realistic Inkscape-flavoured SVG loses its
 * declaration, comments, editor metadata, title/desc and default-valued
 * attributes while an `id` actually referenced by `href="#..."` survives and
 * one that is not does not — the round-trip a wrong regex would break
 * silently — that numeric rounding and colour compaction land on the exact
 * hand-computed string, that turning a rule off leaves its target alone,
 * that the fixed-point loop clears nested empty groups, that a `<style>`
 * selector counts as a reference too, and that blank or non-SVG input comes
 * back unchanged with `wellFormed: false` rather than throwing.
 */
import type { CheckSuite } from "./harness.mts";
import {
  isWellFormedXml,
  optimizeSvg,
  stripEmptyGroups,
  stripUnusedIds,
  SVG_OPTIMIZE_RULES,
  type SvgOptimizeRule,
} from "../lib/svg-optimallasdirici";

const ALL_RULES = new Set<SvgOptimizeRule>(SVG_OPTIMIZE_RULES);

const INKSCAPE_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with Inkscape -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 100.000 100.000" sodipodi:docname="test.svg">
  <metadata id="metadata1"><rdf:RDF></rdf:RDF></metadata>
  <title>My Icon</title>
  <desc>A test icon</desc>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer">
    <g></g>
    <path id="unused1" d="M 10.500 20.000 L 0.500 0.100" fill="#ffffff" opacity="1" />
    <circle id="usedCircle" cx="50.000" cy="50.000" r="10.000" fill="rgb(255, 0, 0)" stroke-width="1.0" stroke-opacity="1"/>
    <use href="#usedCircle" x="0" y="0" />
  </g>
</svg>`;

export const checks: CheckSuite = (check) => {
  const full = optimizeSvg(INKSCAPE_SAMPLE, ALL_RULES, 1);

  check(
    "svg-optimallasdirici: every metadata rule strips the declaration, comment, editor prefixes and title/desc",
    !full.output.includes("<?xml") &&
      !full.output.includes("<!--") &&
      !full.output.includes("sodipodi") &&
      !full.output.includes("inkscape") &&
      !full.output.includes("<title>") &&
      !full.output.includes("<desc>"),
    `got: ${full.output}`,
  );

  check(
    "svg-optimallasdirici: an id referenced via href survives, an unreferenced one is dropped",
    full.output.includes('id="usedCircle"') && !full.output.includes('id="unused1"'),
    `got: ${full.output}`,
  );

  check(
    "svg-optimallasdirici: default-valued opacity and stroke-opacity are dropped, the real fill colour is not touched by that rule",
    !full.output.includes('opacity="1"') && full.output.includes("#fff"),
    `got: ${full.output}`,
  );

  check(
    "svg-optimallasdirici: numeric precision 1 rounds 10.500/20.000/0.500/0.100 to 10.5/20/.5/.1 and colours compact to #fff/#f00",
    full.output.includes('d="M10.5 20L.5 .1"') && full.output.includes("#f00"),
    `got: ${full.output}`,
  );

  check(
    "svg-optimallasdirici: the optimised output is still well-formed XML",
    full.wellFormed === true && isWellFormedXml(full.output) === true,
    `wellFormed: ${full.wellFormed}`,
  );

  check(
    "svg-optimallasdirici: the graphic element count (path/circle/use) is unchanged by optimisation",
    full.elementCountBefore === 3 && full.elementCountAfter === 3,
    `before: ${full.elementCountBefore}, after: ${full.elementCountAfter}`,
  );

  const onlyColors = new Set<SvgOptimizeRule>(["colors"]);
  const partial = optimizeSvg(
    `<?xml version="1.0"?>\n<!-- c -->\n<svg><rect fill="#ffffff"/></svg>`,
    onlyColors,
  );
  check(
    "svg-optimallasdirici: with only the colours rule enabled, the declaration and comment survive untouched while the colour still compacts",
    partial.output.includes("<?xml") &&
      partial.output.includes("<!--") &&
      partial.output.includes("#fff") &&
      partial.applied.length === 1 &&
      partial.applied[0] === "colors",
    `got: ${partial.output}, applied: ${JSON.stringify(partial.applied)}`,
  );

  const nestedEmpty = stripEmptyGroups("<svg><g><g></g></g></svg>");
  check(
    "svg-optimallasdirici: stripEmptyGroups clears two levels of nested empty groups via its fixed-point loop",
    nestedEmpty === "<svg></svg>",
    `got: ${nestedEmpty}`,
  );

  const styleSample =
    '<svg><style>#keep{fill:red}</style><rect id="keep" width="1" height="1"/><rect id="drop" width="1" height="1"/></svg>';
  const styleResult = stripUnusedIds(styleSample);
  check(
    "svg-optimallasdirici: an id referenced only from a <style> selector counts as used",
    styleResult.includes('id="keep"') && !styleResult.includes('id="drop"'),
    `got: ${styleResult}`,
  );

  const emptyInput = optimizeSvg("", ALL_RULES);
  check(
    "svg-optimallasdirici: blank input is handed back unchanged with wellFormed false, not thrown",
    emptyInput.output === "" && emptyInput.wellFormed === false && emptyInput.applied.length === 0,
    `got: ${JSON.stringify(emptyInput)}`,
  );

  const notSvg = optimizeSvg("hello world", ALL_RULES);
  check(
    "svg-optimallasdirici: text with no <svg tag is handed back unchanged with wellFormed false, not thrown",
    notSvg.output === "hello world" && notSvg.wellFormed === false,
    `got: ${JSON.stringify(notSvg)}`,
  );

  check(
    "svg-optimallasdirici: isWellFormedXml rejects a mismatched closing tag",
    isWellFormedXml("<svg><g></svg>") === false,
    `got: ${isWellFormedXml("<svg><g></svg>")}`,
  );
};
