"use client";

import { ReferenceTable } from "./reference-table";
import { regexSparRows, regexSparSections } from "../lib/regex-spar";

export function RegexSparTool() {
  return (
    <ReferenceTable
      rows={regexSparRows}
      sections={regexSparSections}
      placeholder="Sintaksis parçası və ya açar söz axtar: lookahead, lazy, bayraq..."
      footnote="Sintaksis ECMAScript (JavaScript) regex-inə görədir. PCRE (PHP, Perl) və Python-un `re` modulu bir çox yerdə eynidir, amma fərqlər var — \A/\z JavaScript-də yoxdur, PHP-də lookbehind uzunluğu sabit olmalıdır."
    />
  );
}
