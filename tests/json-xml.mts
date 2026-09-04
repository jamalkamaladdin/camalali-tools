/*
 * What is worth checking: a known JSON/XML pair converts correctly in both
 * directions under the `@attr` / `#text` / repeated-tag convention, a
 * JSON → XML → JSON round trip returns the same shape, an attribute and a
 * repeated array tag both survive that round trip, a self-closing element
 * and entity-escaped text decode correctly, and a broken document (unclosed
 * tag, mismatched close tag, two roots, invalid root tag name) comes back as
 * `{ ok: false }` with a line and column rather than throwing.
 */
import type { CheckSuite } from "./harness.mts";
import { isValidXmlTagName, jsonToXml, xmlToJson } from "../lib/json-xml";

export const checks: CheckSuite = (check) => {
  const known = jsonToXml(JSON.stringify({ ad: "Ali", yas: 30 }), "insan");
  check(
    "json-xml: a known flat object becomes the expected element with two child tags",
    known.ok && known.output.includes("<insan>") && known.output.includes("<ad>Ali</ad>") &&
      known.output.includes("<yas>30</yas>"),
    `got: ${JSON.stringify(known)}`,
  );

  const withAttr = jsonToXml(JSON.stringify({ "@id": "5", "#text": "salam" }), "mesaj");
  check(
    'json-xml: an "@" key becomes an attribute and "#text" becomes the element\'s own text',
    withAttr.ok && withAttr.output.includes('<mesaj id="5">salam</mesaj>'),
    `got: ${JSON.stringify(withAttr)}`,
  );

  const original = { user: { name: "Ali", city: "Baki" }, tags: ["a", "b"] };
  const asXml = jsonToXml(JSON.stringify(original), "root");
  const backToJson = asXml.ok ? xmlToJson(asXml.output) : { ok: false as const, error: "n/a" };
  check(
    "json-xml: JSON -> XML -> JSON round-trips a nested object and a repeated array tag",
    asXml.ok && backToJson.ok && JSON.stringify(backToJson.value) === JSON.stringify(original),
    `xml: ${JSON.stringify(asXml)}, back: ${JSON.stringify(backToJson)}`,
  );

  const selfClosing = xmlToJson("<a><b /><c>x</c></a>");
  check(
    "json-xml: a self-closing element becomes an empty string leaf",
    selfClosing.ok &&
      JSON.stringify(selfClosing.value) === JSON.stringify({ b: "", c: "x" }),
    `got: ${JSON.stringify(selfClosing)}`,
  );

  const entities = xmlToJson("<a>1 &lt; 2 &amp; 3 &gt; 0</a>");
  check(
    "json-xml: entity references decode inside text content",
    entities.ok && entities.value === "1 < 2 & 3 > 0",
    `got: ${JSON.stringify(entities)}`,
  );

  const repeated = xmlToJson("<list><item>a</item><item>b</item></list>");
  check(
    "json-xml: repeated sibling tags with the same name collapse into an array",
    repeated.ok && JSON.stringify(repeated.value) === JSON.stringify({ item: ["a", "b"] }),
    `got: ${JSON.stringify(repeated)}`,
  );

  const rootTagReported = xmlToJson('<person id="1"><name>Ali</name></person>');
  check(
    "json-xml: the root tag name and its own attribute are both reported",
    rootTagReported.ok &&
      rootTagReported.rootTag === "person" &&
      JSON.stringify(rootTagReported.value) === JSON.stringify({ "@id": "1", name: "Ali" }),
    `got: ${JSON.stringify(rootTagReported)}`,
  );

  const unclosed = xmlToJson("<a><b>x</a>");
  check(
    "json-xml: a mismatched closing tag returns a line/column error rather than throwing",
    unclosed.ok === false && unclosed.line !== undefined && unclosed.error.length > 0,
    `got: ${JSON.stringify(unclosed)}`,
  );

  const neverClosed = xmlToJson("<a><b>x</b>");
  check(
    "json-xml: a document missing its final closing tag returns an error, not a throw",
    neverClosed.ok === false,
    `got: ${JSON.stringify(neverClosed)}`,
  );

  const twoRoots = xmlToJson("<a>1</a><b>2</b>");
  check(
    "json-xml: two sibling root elements is refused — XML allows exactly one",
    twoRoots.ok === false,
    `got: ${JSON.stringify(twoRoots)}`,
  );

  const badRootTag = jsonToXml(JSON.stringify({ a: 1 }), "1bad");
  check(
    "json-xml: an invalid root tag name is refused before any XML is built",
    badRootTag.ok === false && badRootTag.error.length > 0,
    `got: ${JSON.stringify(badRootTag)}`,
  );

  const badJson = jsonToXml("{not valid", "root");
  check(
    "json-xml: malformed JSON input returns an error rather than throwing",
    badJson.ok === false,
    `got: ${JSON.stringify(badJson)}`,
  );

  check(
    "json-xml: isValidXmlTagName accepts a normal name and rejects one starting with a digit",
    isValidXmlTagName("kanal_1") === true && isValidXmlTagName("1kanal") === false,
    `kanal_1: ${isValidXmlTagName("kanal_1")}, 1kanal: ${isValidXmlTagName("1kanal")}`,
  );

  const empty = xmlToJson("   ");
  check(
    "json-xml: blank input returns an error rather than an empty-document throw",
    empty.ok === false,
    `got: ${JSON.stringify(empty)}`,
  );
};
