/*
 * What is worth checking here: each of the eight rules actually finds and
 * removes the character it claims to, a disabled rule set changes nothing
 * at all, a finding's line/column is correct against a real position, the
 * trailing-whitespace rule still finds a space sitting right before a CRLF
 * line ending, and — the one genuine correctness trap in this file — that
 * line-ending normalisation runs before blank-line collapsing in the output
 * pipeline, so a CRLF file's blank lines collapse exactly like an LF file's
 * would.
 */
import type { CheckSuite } from "./harness.mts";
import { cleanupText, CLEANUP_RULES, type CleanupRuleId } from "../lib/metn-temizleyici";

const ALL_RULES = new Set<CleanupRuleId>(CLEANUP_RULES);

export const checks: CheckSuite = (check) => {
  const invisible = cleanupText("a​b", ALL_RULES);
  check(
    "metn-temizleyici: a zero-width space is found, named ZWSP, and stripped from the output",
    invisible.output === "ab" && invisible.findings[0]?.display === "ZWSP",
    `got: ${JSON.stringify(invisible)}`,
  );

  const nbsp = cleanupText("a b", ALL_RULES);
  check(
    "metn-temizleyici: a non-breaking space is counted and replaced with a plain space",
    nbsp.countsByRule.nbsp === 1 && nbsp.output === "a b",
    `got: ${JSON.stringify(nbsp)}`,
  );

  const quotes = cleanupText("“a”", ALL_RULES);
  check(
    "metn-temizleyici: curly double quotes become straight quotes",
    quotes.output === '"a"',
    `got: ${quotes.output}`,
  );

  const dash = cleanupText("a—b", ALL_RULES);
  check("metn-temizleyici: an em dash becomes a hyphen", dash.output === "a-b", `got: ${dash.output}`);

  const doubled = cleanupText("a  b", ALL_RULES);
  check("metn-temizleyici: a doubled space collapses to one", doubled.output === "a b", `got: ${doubled.output}`);

  const trailing = cleanupText("a \nb", ALL_RULES);
  check(
    "metn-temizleyici: trailing whitespace at a line end is removed",
    trailing.output === "a\nb",
    `got: ${JSON.stringify(trailing.output)}`,
  );

  const blank = cleanupText("a\n\n\n\n\nb", ALL_RULES);
  check(
    "metn-temizleyici: a run of four blank lines (five newlines) is cut down to the maximum of three",
    blank.output === "a\n\n\n\nb" && blank.findings.some((f) => f.rule === "extra-blank-lines"),
    `got: ${JSON.stringify(blank.output)}`,
  );

  const mixed = cleanupText("a\r\nb\rc", ALL_RULES);
  check(
    "metn-temizleyici: both CRLF and a lone CR normalise to LF",
    mixed.output === "a\nb\nc",
    `got: ${JSON.stringify(mixed.output)}`,
  );

  const nothingEnabled = cleanupText("a  b c", new Set<CleanupRuleId>());
  check(
    "metn-temizleyici: with no rule enabled, the output is untouched and nothing is reported",
    nothingEnabled.output === "a  b c" && nothingEnabled.findings.length === 0,
    `got: ${JSON.stringify(nothingEnabled)}`,
  );

  const positioned = cleanupText("ab\u00A0cd", ALL_RULES);
  check(
    "metn-temizleyici: a finding's line and column point at the exact character, not just its index",
    positioned.findings[0]?.line === 1 && positioned.findings[0]?.column === 3,
    `got: ${JSON.stringify(positioned.findings[0])}`,
  );

  const trailingBeforeCrlf = cleanupText("a \r\nb", new Set<CleanupRuleId>(["trailing-whitespace"]));
  check(
    "metn-temizleyici: trailing whitespace is still found right before a CRLF line ending, not hidden by the \\r",
    trailingBeforeCrlf.findings.length === 1 && trailingBeforeCrlf.findings[0]?.column === 2,
    `got: ${JSON.stringify(trailingBeforeCrlf.findings)}`,
  );

  const crlfBlankLines = cleanupText(
    "a\r\n\r\n\r\n\r\n\r\nb",
    new Set<CleanupRuleId>(["mixed-line-endings", "extra-blank-lines"]),
  );
  check(
    "metn-temizleyici: line-ending normalisation runs before blank-line collapsing, so a CRLF file's excess blank lines collapse too",
    crlfBlankLines.output === "a\n\n\n\nb",
    `got: ${JSON.stringify(crlfBlankLines.output)}`,
  );
};
