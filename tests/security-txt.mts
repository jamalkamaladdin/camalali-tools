/*
 * What is worth checking: a well-formed file's fields land in the right
 * bucket in file order, comments and blank lines are ignored, a malformed
 * line is collected rather than dropped or thrown on, the PGP armour is
 * detected and its `Hash:` header line is not mistaken for a field, the two
 * required fields are correctly named missing, and the expiry check reads
 * against an injected clock rather than the real one so past and future are
 * both reproducible.
 */
import type { CheckSuite } from "./harness.mts";
import { evaluateSecurityTxt, parseSecurityTxt } from "../lib/security-txt";

const NOW = new Date("2026-06-01T00:00:00.000Z");

export const checks: CheckSuite = (check) => {
  const basic = parseSecurityTxt(
    "# a comment\nContact: mailto:security@example.com\nExpires: 2027-01-01T00:00:00.000Z\nPreferred-Languages: az, en\n",
  );
  check(
    "security-txt: a well-formed file's fields land in file order, comments are dropped",
    basic.fields.Contact[0] === "mailto:security@example.com" &&
      basic.fields.Expires[0] === "2027-01-01T00:00:00.000Z" &&
      basic.fields["Preferred-Languages"][0] === "az, en",
    `got: ${JSON.stringify(basic.fields)}`,
  );

  const multiContact = parseSecurityTxt("Contact: mailto:a@example.com\nContact: tel:+15555550000\n");
  check(
    "security-txt: repeated Contact lines are all collected, in order",
    multiContact.fields.Contact.length === 2 && multiContact.fields.Contact[1] === "tel:+15555550000",
    `got: ${JSON.stringify(multiContact.fields.Contact)}`,
  );

  const malformed = parseSecurityTxt("Contact: mailto:a@example.com\nthis line has no colon\n");
  check(
    "security-txt: a line without a colon is recorded as unknown rather than thrown on",
    malformed.unknownLines.length === 1 && malformed.unknownLines[0].text === "this line has no colon",
    `got: ${JSON.stringify(malformed.unknownLines)}`,
  );

  const signedDoc = parseSecurityTxt(
    "-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nContact: mailto:a@example.com\n-----BEGIN PGP SIGNATURE-----\nabcdef\n-----END PGP SIGNATURE-----\n",
  );
  check(
    "security-txt: a PGP-armoured file is detected as signed and its Hash: header does not become an unknown line",
    signedDoc.signed === true && signedDoc.unknownLines.length === 0 && signedDoc.fields.Contact.length === 1,
    `got: ${JSON.stringify(signedDoc)}`,
  );

  const unsignedDoc = parseSecurityTxt("Contact: mailto:a@example.com\n");
  check(
    "security-txt: a file with no PGP armour is not marked signed",
    unsignedDoc.signed === false,
    `got: ${JSON.stringify(unsignedDoc)}`,
  );

  const caseFold = parseSecurityTxt("CONTACT: mailto:a@example.com\n");
  check(
    "security-txt: field names are matched case-insensitively",
    caseFold.fields.Contact.length === 1,
    `got: ${JSON.stringify(caseFold.fields)}`,
  );

  const missingExpires = evaluateSecurityTxt(parseSecurityTxt("Contact: mailto:a@example.com\n"), NOW);
  check(
    "security-txt: a file with Contact but no Expires names Expires as the missing required field",
    missingExpires.missingRequired.length === 1 && missingExpires.missingRequired[0] === "Expires",
    `got: ${JSON.stringify(missingExpires.missingRequired)}`,
  );

  const expiredDoc = evaluateSecurityTxt(
    parseSecurityTxt("Contact: mailto:a@example.com\nExpires: 2025-01-01T00:00:00.000Z\n"),
    NOW,
  );
  check(
    "security-txt: an Expires date before the injected clock reads as expired, with a negative day count",
    expiredDoc.expired === true && (expiredDoc.expiresInDays ?? 0) < 0,
    `got: ${JSON.stringify(expiredDoc)}`,
  );

  const futureDoc = evaluateSecurityTxt(
    parseSecurityTxt("Contact: mailto:a@example.com\nExpires: 2027-01-01T00:00:00.000Z\n"),
    NOW,
  );
  check(
    "security-txt: an Expires date after the injected clock reads as not expired, with a positive day count",
    futureDoc.expired === false && (futureDoc.expiresInDays ?? -1) > 0,
    `got: ${JSON.stringify(futureDoc)}`,
  );

  const unparsableExpires = evaluateSecurityTxt(
    parseSecurityTxt("Contact: mailto:a@example.com\nExpires: whenever\n"),
    NOW,
  );
  check(
    "security-txt: an unparsable Expires value does not throw and reports expired as null",
    unparsableExpires.expired === null && unparsableExpires.expiresInDays === null,
    `got: ${JSON.stringify(unparsableExpires)}`,
  );

  const empty = evaluateSecurityTxt(parseSecurityTxt(""), NOW);
  check(
    "security-txt: an empty document has every field missing and reads as empty completeness",
    empty.missingRequired.length === 2 && empty.completeness === "boş",
    `got: ${JSON.stringify(empty)}`,
  );

  const complete = evaluateSecurityTxt(
    parseSecurityTxt("Contact: mailto:a@example.com\nExpires: 2027-01-01T00:00:00.000Z\n"),
    NOW,
  );
  check(
    "security-txt: both required fields present and unexpired reads as complete",
    complete.completeness === "tam",
    `got: ${JSON.stringify(complete)}`,
  );
};
