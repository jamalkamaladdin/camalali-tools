/*
 * What is worth checking: a known table converts correctly for each of the
 * four formats (Markdown, HTML, CSV, JSON), a JSON -> Markdown -> JSON round
 * trip preserves headers and rows, format auto-detection picks the right
 * format for a clean sample of each, a pipe character inside a Markdown
 * cell survives escaping round trip, alignment markers are read and
 * reproduced, and a malformed input in each format (missing separator row,
 * no `<table>`, a ragged CSV row, a non-array JSON root) returns
 * `{ ok: false }` rather than throwing.
 */
import type { CheckSuite } from "./harness.mts";
import {
  detectFormat,
  parseCsvTable,
  parseHtmlTable,
  parseJsonTable,
  parseMarkdownTable,
  parseTable,
  stringifyMarkdownTable,
  stringifyTable,
  type Table,
} from "../lib/cedvel";

const SAMPLE_TABLE: Table = {
  headers: ["ad", "yas"],
  aligns: [null, "right"],
  rows: [
    ["Ali", "30"],
    ["Aygün", "25"],
  ],
};

export const checks: CheckSuite = (check) => {
  const md = parseMarkdownTable("| ad | yas |\n| --- | ---: |\n| Ali | 30 |\n| Aygün | 25 |");
  check(
    "cedvel: a known Markdown table parses to the expected headers, alignment and rows",
    md.ok &&
      JSON.stringify(md.table.headers) === JSON.stringify(["ad", "yas"]) &&
      md.table.aligns[1] === "right" &&
      JSON.stringify(md.table.rows) === JSON.stringify([["Ali", "30"], ["Aygün", "25"]]),
    `got: ${JSON.stringify(md)}`,
  );

  const mdOut = stringifyMarkdownTable(SAMPLE_TABLE);
  const mdOutParsed = parseMarkdownTable(mdOut);
  check(
    "cedvel: stringifying the sample table to Markdown marks the right-aligned column and round-trips",
    /-+:\s*\|/.test(mdOut) &&
      mdOutParsed.ok &&
      mdOutParsed.table.aligns[1] === "right" &&
      JSON.stringify(mdOutParsed.table.rows) === JSON.stringify(SAMPLE_TABLE.rows),
    `got: ${JSON.stringify(mdOut)}`,
  );

  const html = parseHtmlTable(
    "<table><thead><tr><th>ad</th><th>yas</th></tr></thead><tbody><tr><td>Ali</td><td>30</td></tr></tbody></table>",
  );
  check(
    "cedvel: a known HTML table parses to the expected headers and rows",
    html.ok &&
      JSON.stringify(html.table.headers) === JSON.stringify(["ad", "yas"]) &&
      JSON.stringify(html.table.rows) === JSON.stringify([["Ali", "30"]]),
    `got: ${JSON.stringify(html)}`,
  );

  const csv = parseCsvTable("ad,yas\r\nAli,30\r\nAygün,25", ",");
  check(
    "cedvel: a known CSV table parses to the expected headers and rows",
    csv.ok && JSON.stringify(csv.table.rows) === JSON.stringify([["Ali", "30"], ["Aygün", "25"]]),
    `got: ${JSON.stringify(csv)}`,
  );

  const json = parseJsonTable(JSON.stringify([{ ad: "Ali", yas: "30" }]));
  check(
    "cedvel: a known JSON array of objects parses to the expected headers and rows",
    json.ok &&
      JSON.stringify(json.table.headers) === JSON.stringify(["ad", "yas"]) &&
      JSON.stringify(json.table.rows) === JSON.stringify([["Ali", "30"]]),
    `got: ${JSON.stringify(json)}`,
  );

  const asMarkdown = stringifyTable(json.ok ? json.table : SAMPLE_TABLE, "markdown", ",");
  const roundTrip = parseTable(asMarkdown, "markdown", ",");
  check(
    "cedvel: JSON -> Markdown -> JSON round-trips headers and row values (alignment resets, which is expected)",
    json.ok &&
      roundTrip.ok &&
      JSON.stringify(roundTrip.table.headers) === JSON.stringify(json.table.headers) &&
      JSON.stringify(roundTrip.table.rows) === JSON.stringify(json.table.rows),
    `original: ${JSON.stringify(json)}, roundTrip: ${JSON.stringify(roundTrip)}`,
  );

  const pipeCell: Table = { headers: ["a|b"], aligns: [null], rows: [["x|y"]] };
  const pipeMd = stringifyMarkdownTable(pipeCell);
  const pipeBack = parseMarkdownTable(pipeMd);
  check(
    "cedvel: a pipe character inside a Markdown cell survives escaping round trip",
    pipeBack.ok &&
      pipeBack.table.headers[0] === "a|b" &&
      pipeBack.table.rows[0][0] === "x|y",
    `md: ${JSON.stringify(pipeMd)}, back: ${JSON.stringify(pipeBack)}`,
  );

  check(
    "cedvel: format detection recognises a clean Markdown, HTML, CSV and JSON sample",
    detectFormat("| a | b |\n| --- | --- |\n| 1 | 2 |") === "markdown" &&
      detectFormat("<table><tr><th>a</th></tr></table>") === "html" &&
      detectFormat('[{"a":1}]') === "json" &&
      detectFormat("a,b\n1,2") === "csv",
    `md: ${detectFormat("| a | b |\n| --- | --- |\n| 1 | 2 |")}, html: ${detectFormat("<table><tr><th>a</th></tr></table>")}, json: ${detectFormat('[{"a":1}]')}, csv: ${detectFormat("a,b\n1,2")}`,
  );

  const missingSeparator = parseMarkdownTable("| ad | yas |\n| Ali | 30 |");
  check(
    "cedvel: a Markdown block missing its --- separator row returns an error rather than throwing",
    missingSeparator.ok === false,
    `got: ${JSON.stringify(missingSeparator)}`,
  );

  const noTableTag = parseHtmlTable("<div><p>ad, yas</p></div>");
  check(
    "cedvel: HTML with no <table> tag returns an error rather than throwing",
    noTableTag.ok === false,
    `got: ${JSON.stringify(noTableTag)}`,
  );

  const raggedCsv = parseCsvTable("ad,yas\nAli,30,extra", ",");
  check(
    "cedvel: a CSV row with more columns than the header returns a line-numbered error",
    raggedCsv.ok === false && raggedCsv.line === 2,
    `got: ${JSON.stringify(raggedCsv)}`,
  );

  const nonArrayJson = parseJsonTable(JSON.stringify({ a: 1 }));
  check(
    "cedvel: a JSON object at the root (not an array) returns an error rather than throwing",
    nonArrayJson.ok === false,
    `got: ${JSON.stringify(nonArrayJson)}`,
  );
};
