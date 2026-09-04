/*
 * The RFC 7617 worked example (Aladdin / open sesame) is the known-answer
 * this file checks the UTF-8 encoder against. What actually needs proving
 * beyond that is the wrapper logic the RFC doesn't hand you for free: that
 * UTF-8 and Latin-1 genuinely diverge once a non-ASCII letter appears, that a
 * codepoint above U+00FF is refused rather than silently mangled, that the
 * parser recovers the exact pair it was given whichever encoding produced
 * the header, and that every malformed input path returns a message instead
 * of throwing.
 */
import type { CheckSuite } from "./harness.mts";
import { buildBasicAuthHeader, buildServerSnippets, parseBasicAuthHeader } from "../lib/basic-auth";

const rfcExample = buildBasicAuthHeader("Aladdin", "open sesame");

/* "ötücü" carries ö (U+00F6) and ü (U+00FC) — both inside Latin-1's single-byte range, so encoding actually succeeds there and the two Base64 strings can be compared. */
const withinLatin1 = buildBasicAuthHeader("istifadeci", "ötücü");

/* "əlaqə" carries ə (U+0259), outside Latin-1 entirely. */
const outsideLatin1 = buildBasicAuthHeader("istifadeci", "əlaqə");

const usernameWithColon = buildBasicAuthHeader("ad:soyad", "parol123");
const emptyUsername = buildBasicAuthHeader("", "parol123");
const emptyPassword = buildBasicAuthHeader("istifadeci", "");

const utf8RoundTrip = rfcExample.ok ? parseBasicAuthHeader(rfcExample.utf8.header) : null;
const latin1RoundTrip =
  withinLatin1.ok && withinLatin1.latin1.ok ? parseBasicAuthHeader(withinLatin1.latin1.header) : null;

const malformedBase64 = parseBasicAuthHeader("Basic not-base64-at-all!!!");
const noColon = parseBasicAuthHeader(`Basic ${btoa("nocolonhere")}`);
const bareBase64 = parseBasicAuthHeader(btoa("plain:pair"));

const curlSnippet = buildServerSnippets("admin", "o'brien", "https://sayt.com");

export const checks: CheckSuite = (check) => {
  check(
    "basic-auth: RFC 7617's own example encodes to the RFC's own Base64",
    rfcExample.ok && rfcExample.utf8.base64 === "QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
    rfcExample.ok ? `got ${rfcExample.utf8.base64}` : `refused: ${rfcExample.error}`,
  );

  check(
    "basic-auth: an ASCII-only pair encodes identically under UTF-8 and Latin-1",
    rfcExample.ok && rfcExample.latin1.ok && rfcExample.latin1.base64 === rfcExample.utf8.base64,
    rfcExample.ok ? `differs=${rfcExample.differs}` : `refused: ${rfcExample.error}`,
  );

  check(
    "basic-auth: a password with letters inside Latin-1's range encodes differently under UTF-8 and Latin-1",
    withinLatin1.ok && withinLatin1.latin1.ok && withinLatin1.differs,
    withinLatin1.ok
      ? `utf8=${withinLatin1.utf8.base64} latin1=${withinLatin1.latin1.ok ? withinLatin1.latin1.base64 : withinLatin1.latin1.error}`
      : `refused: ${withinLatin1.error}`,
  );

  check(
    "basic-auth: a letter above U+00FF is refused for Latin-1 with a message naming the codepoint",
    outsideLatin1.ok && !outsideLatin1.latin1.ok && outsideLatin1.latin1.error.includes("U+0259"),
    outsideLatin1.ok ? `latin1 result: ${JSON.stringify(outsideLatin1.latin1)}` : `refused: ${outsideLatin1.error}`,
  );

  check(
    "basic-auth: a username containing a colon is refused",
    !usernameWithColon.ok && usernameWithColon.error.length > 0,
    usernameWithColon.ok ? "a colon-bearing username was accepted" : "no message",
  );

  check(
    "basic-auth: an empty username is refused",
    !emptyUsername.ok && emptyUsername.error.length > 0,
    emptyUsername.ok ? "an empty username was accepted" : "no message",
  );

  check(
    "basic-auth: an empty password is refused",
    !emptyPassword.ok && emptyPassword.error.length > 0,
    emptyPassword.ok ? "an empty password was accepted" : "no message",
  );

  check(
    "basic-auth: building then parsing the UTF-8 header recovers the exact original pair",
    utf8RoundTrip !== null &&
      utf8RoundTrip.ok &&
      utf8RoundTrip.username === "Aladdin" &&
      utf8RoundTrip.password === "open sesame" &&
      utf8RoundTrip.encoding === "utf-8",
    utf8RoundTrip === null ? "no header to parse" : `result: ${JSON.stringify(utf8RoundTrip)}`,
  );

  check(
    "basic-auth: parsing a Latin-1-produced header falls back and recovers the exact original pair",
    latin1RoundTrip !== null &&
      latin1RoundTrip.ok &&
      latin1RoundTrip.username === "istifadeci" &&
      latin1RoundTrip.password === "ötücü" &&
      latin1RoundTrip.encoding === "latin1-fallback",
    latin1RoundTrip === null ? "no latin1 header to parse" : `result: ${JSON.stringify(latin1RoundTrip)}`,
  );

  check(
    "basic-auth: parsing malformed Base64 is refused with a message, not thrown",
    !malformedBase64.ok && malformedBase64.error.length > 0,
    malformedBase64.ok ? "malformed base64 was accepted" : "no message",
  );

  check(
    "basic-auth: a decoded pair with no colon is refused",
    !noColon.ok && noColon.error.length > 0,
    noColon.ok ? "a colon-less pair was accepted" : "no message",
  );

  check(
    "basic-auth: parsing accepts bare Base64 with no leading 'Basic ' scheme",
    bareBase64.ok && bareBase64.username === "plain" && bareBase64.password === "pair",
    bareBase64.ok ? `result: ${JSON.stringify(bareBase64)}` : `refused: ${bareBase64.error}`,
  );

  check(
    "basic-auth: the curl snippet single-quote-escapes a password containing an apostrophe",
    curlSnippet.curl.includes(String.raw`o'\''brien`),
    `curl snippet: ${curlSnippet.curl}`,
  );
};
