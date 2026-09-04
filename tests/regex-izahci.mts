/*
 * The parser is a hand-written recursive-descent regex reader, so the cases
 * that matter are the ones that would silently mis-explain a pattern: group
 * numbering skipping non-capturing groups and lookaround, a quantifier
 * range read correctly, and — the one bug this file's own review caught — a
 * negated character class `[^0-9]` not being mistaken for a real `^` anchor
 * by the multiline-anchor warning, which used to scan the raw source string
 * instead of the parsed tree.
 */
import type { CheckSuite } from "./harness.mts";
import { explain, findWarnings, parseRegex } from "../lib/regex-izahci";

export const checks: CheckSuite = (check) => {
  const digitsPlus = parseRegex("/\\d+/");
  check(
    "regex-izahci: \\d+ 1-və-daha-çox kəmiyyəti kimi izah olunur",
    digitsPlus.ok && explain(digitsPlus.root).quantifier === "1 və ya daha çox",
    JSON.stringify(digitsPlus),
  );

  const namedAndCapture = parseRegex("/(?<year>\\d{4})-(\\d{2})/");
  check(
    "regex-izahci: adlandırılmış qrup #1, sonrakı tutan qrup #2 alır",
    namedAndCapture.ok && namedAndCapture.groupCount === 2,
    JSON.stringify(namedAndCapture),
  );

  const nonCapturing = parseRegex("/(?:abc)(?=xyz)/");
  check(
    "regex-izahci: tutmayan qrup və lookahead qrup sayına daxil olmur",
    nonCapturing.ok && nonCapturing.groupCount === 0,
    JSON.stringify(nonCapturing),
  );

  const nested = parseRegex("/(a+)+/");
  const single = parseRegex("/a+/");
  check(
    "regex-izahci: (a+)+ geriyə-izləmə xəbərdarlığı verir, tək a+ vermir",
    nested.ok && findWarnings("", nested.root).some((w) => w.kind === "backtracking") &&
      single.ok && !findWarnings("", single.root).some((w) => w.kind === "backtracking"),
    `nested: ${JSON.stringify(nested)}, single: ${JSON.stringify(single)}`,
  );

  const unescapedDot = parseRegex("/a.b/");
  const escapedDot = parseRegex("/a\\.b/");
  check(
    "regex-izahci: qaçırılmamış nöqtə xəbərdarlıq verir, qaçırılmış vermir",
    unescapedDot.ok && findWarnings("", unescapedDot.root).some((w) => w.kind === "dot") &&
      escapedDot.ok && !findWarnings("", escapedDot.root).some((w) => w.kind === "dot"),
    `unescaped: ${JSON.stringify(unescapedDot)}, escaped: ${JSON.stringify(escapedDot)}`,
  );

  const multiAnchor = parseRegex("/^a$|^b$/");
  check(
    "regex-izahci: bir neçə ^ olan naxış m bayrağı xəbərdarlığı verir",
    multiAnchor.ok && findWarnings("", multiAnchor.root).some((w) => w.kind === "anchor-multiline"),
    JSON.stringify(multiAnchor),
  );

  const negatedClass = parseRegex("/[^0-9]+/");
  check(
    "regex-izahci: [^0-9] daxilindəki ^ real lövbər sayılmır (yalançı xəbərdarlıq yoxdur)",
    negatedClass.ok && !findWarnings("", negatedClass.root).some((w) => w.kind === "anchor-multiline"),
    JSON.stringify(negatedClass),
  );

  const unbalanced = parseRegex("(abc");
  check("regex-izahci: bağlanmayan mötərizə throw etmir, error qaytarır", unbalanced.ok === false, JSON.stringify(unbalanced));

  const nothingToRepeat = parseRegex("a**");
  check("regex-izahci: keçərsiz təkrar kəmiyyəti (a**) throw etmir, error qaytarır", nothingToRepeat.ok === false, JSON.stringify(nothingToRepeat));

  const literalForm = parseRegex("/abc/gi");
  check("regex-izahci: /naxış/bayraq formatından bayraqlar oxunur", literalForm.ok && literalForm.flags === "gi", JSON.stringify(literalForm));

  const unicodeProp = parseRegex("/\\p{L}+/u");
  check(
    "regex-izahci: \\p{L} unicode xüsusiyyəti kimi tanınır",
    unicodeProp.ok && explain(unicodeProp.root).description.includes("Unicode"),
    JSON.stringify(unicodeProp),
  );

  const empty = parseRegex("");
  check("regex-izahci: boş naxış throw etmədən boş ardıcıllıq verir", empty.ok && empty.root.type === "sequence", JSON.stringify(empty));

  const range = parseRegex("/x{2,4}/");
  check(
    "regex-izahci: {2,4} kəmiyyəti dəqiq aralıq kimi izah olunur",
    range.ok && explain(range.root).quantifier === "2–4",
    JSON.stringify(range),
  );
};
