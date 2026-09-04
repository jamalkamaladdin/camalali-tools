/*
 * What is worth checking here: a known-answer pair for each of the ten
 * modes' encode direction, a round trip back through decode for the modes
 * where hand-computing the encoded form would only restate the
 * implementation, the one real difference between HTML and XML mode (a
 * single quote becomes `&#39;` in one and `&apos;` in the other, and XML
 * refuses a name it does not recognise), the two SQL dialects producing
 * different bytes for the same input, and that a genuinely malformed input
 * comes back as an error in every decoder that can fail rather than a throw
 * or a silently wrong string.
 */
import type { CheckSuite } from "./harness.mts";
import {
  decodeBase64Text,
  decodeCsvCell,
  decodeHtmlEntities,
  decodeJsonString,
  decodeJsString,
  decodeRegex,
  decodeShellSingleQuote,
  decodeSqlString,
  decodeUrl,
  decodeXml,
  encodeBase64Text,
  encodeCsvCell,
  encodeHtmlEntities,
  encodeJsonString,
  encodeJsString,
  encodeRegex,
  encodeShellSingleQuote,
  encodeSqlString,
  encodeUrl,
  encodeXml,
} from "../lib/escape";

export const checks: CheckSuite = (check) => {
  const json = encodeJsonString('Salam "dünya"\nnecəsən?');
  const jsonDecoded = decodeJsonString(json);
  check(
    "escape: a JSON string round-trips through encode and decode back to the original text",
    jsonDecoded.ok && jsonDecoded.text === 'Salam "dünya"\nnecəsən?',
    `encoded: ${json}, decoded: ${JSON.stringify(jsonDecoded)}`,
  );

  check(
    "escape: HTML mode escapes a quote as the numeric &#39;, not the named &apos;",
    encodeHtmlEntities("it's") === "it&#39;s",
    `got: ${encodeHtmlEntities("it's")}`,
  );

  const xmlEncoded = encodeXml("a 'b' <c> \"d\" & e");
  check(
    "escape: XML mode escapes a quote as the named &apos;, which HTML mode never produces — the one real difference between the two",
    xmlEncoded === "a &apos;b&apos; &lt;c&gt; &quot;d&quot; &amp; e",
    `got: ${xmlEncoded}`,
  );

  const xmlUnknown = decodeXml("&copy;");
  const htmlKnown = decodeHtmlEntities("&copy;");
  check(
    "escape: XML mode refuses an entity name it does not recognise, unlike HTML mode's much larger table",
    xmlUnknown.ok === false && htmlKnown.ok && htmlKnown.text === "©",
    `xml: ${JSON.stringify(xmlUnknown)}, html: ${JSON.stringify(htmlKnown)}`,
  );

  check(
    "escape: URL component mode escapes a space as %20 and full-URL mode leaves a structural slash alone",
    encodeUrl(" ", "component") === "%20" && encodeUrl("a b/c", "full") === "a%20b/c",
    `got: ${encodeUrl(" ", "component")}, ${encodeUrl("a b/c", "full")}`,
  );

  check(
    "escape: standard SQL doubles an embedded quote, MySQL backslash-escapes it — different bytes for the same input",
    encodeSqlString("O'Brien's", "standard") === "O''Brien''s" &&
      encodeSqlString("O'Brien's", "mysql") === "O\\'Brien\\'s",
    `standard: ${encodeSqlString("O'Brien's", "standard")}, mysql: ${encodeSqlString("O'Brien's", "mysql")}`,
  );

  const sqlDecoded = decodeSqlString(encodeSqlString("O'Brien's", "mysql"), "mysql");
  check(
    "escape: the MySQL-escaped form decodes back to the original string",
    sqlDecoded.ok && sqlDecoded.text === "O'Brien's",
    `got: ${JSON.stringify(sqlDecoded)}`,
  );

  check(
    "escape: standard SQL mode reports an error for a lone, un-doubled quote rather than guessing",
    decodeSqlString("it's", "standard").ok === false,
    `got: ${JSON.stringify(decodeSqlString("it's", "standard"))}`,
  );

  const shellEncoded = encodeShellSingleQuote("it's a test");
  const shellDecoded = decodeShellSingleQuote(shellEncoded);
  check(
    "escape: the POSIX single-quote escape round-trips a value containing a quote back to itself",
    shellEncoded === "'it'\\''s a test'" && shellDecoded.ok && shellDecoded.text === "it's a test",
    `encoded: ${shellEncoded}, decoded: ${JSON.stringify(shellDecoded)}`,
  );

  check(
    "escape: shell mode refuses a value that was never wrapped in single quotes",
    decodeShellSingleQuote("not quoted").ok === false,
    `got: ${JSON.stringify(decodeShellSingleQuote("not quoted"))}`,
  );

  const regexEncoded = encodeRegex("1.5 (a+b)*c?");
  const regexDecoded = decodeRegex(regexEncoded);
  check(
    "escape: regex mode escapes every special character and decode reverses it exactly",
    regexEncoded === "1\\.5 \\(a\\+b\\)\\*c\\?" && regexDecoded.ok && regexDecoded.text === "1.5 (a+b)*c?",
    `got: ${regexEncoded}`,
  );

  const csvEncoded = encodeCsvCell('say "hi", ok');
  const csvDecoded = decodeCsvCell(csvEncoded);
  check(
    "escape: a CSV cell needing quoting doubles its internal quotes, decodes back exactly, and a lone un-doubled quote is reported as malformed rather than silently accepted",
    csvEncoded === '"say ""hi"", ok"' &&
      csvDecoded.ok &&
      csvDecoded.text === 'say "hi", ok' &&
      decodeCsvCell('"broken" tail').ok === false,
    `encoded: ${csvEncoded}, decoded: ${JSON.stringify(csvDecoded)}`,
  );

  const base64Decoded = decodeBase64Text(encodeBase64Text("Azərbaycan", { urlSafe: false, padding: true }));
  check(
    "escape: Base64 round-trips Azerbaijani text through its own UTF-8 encoding",
    base64Decoded.ok && base64Decoded.text === "Azərbaycan",
    `got: ${JSON.stringify(base64Decoded)}`,
  );

  const jsEncoded = encodeJsString("😀", "'", true);
  const jsDecoded = decodeJsString(jsEncoded);
  check(
    "escape: JS string mode can force an astral character to a braced \\u{...} escape and decode reverses it",
    jsEncoded === "'\\u{1f600}'" && jsDecoded.ok && jsDecoded.text === "😀",
    `encoded: ${jsEncoded}, decoded: ${JSON.stringify(jsDecoded)}`,
  );
};
