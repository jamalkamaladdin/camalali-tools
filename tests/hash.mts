/*
 * The hash tool states a fact about the outside world — "this text has this
 * MD5" — so the cases are published vectors from RFC 1321 and FIPS 180-4
 * rather than this file's own output. A hand-written digest that is wrong is
 * wrong silently: it produces 64 plausible hex characters either way.
 *
 * The other half of the cases is the encoding step, which is where a hash of
 * Azerbaijani text actually goes wrong.
 */
import type { CheckSuite } from "./harness.mts";
import {
  formatDigest,
  hashAll,
  md5,
  sha1,
  sha256,
  utf8ByteLength,
  utf8Bytes,
} from "../lib/hash";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* FIPS 180-4, appendix: 56 bytes, which forces the padding into a second block. */
const NIST_TWO_BLOCK = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";

/* U+0259 U+015F y a — the schwa and the s-cedilla, written as escapes so the
   expected byte string below can be read against them. */
const AZ_WORD = "\u0259\u015Fya";

const HEX_ONLY = /^[0-9a-f]+$/;

export const checks: CheckSuite = (check) => {
  check(
    "hash: md5 of the empty string matches RFC 1321",
    md5("") === "d41d8cd98f00b204e9800998ecf8427e",
    `got ${md5("")}`,
  );

  check(
    "hash: md5 of abc matches RFC 1321",
    md5("abc") === "900150983cd24fb0d6963f7d28e17f72",
    `got ${md5("abc")}`,
  );

  check(
    "hash: sha1 of the empty string matches FIPS 180-4",
    sha1("") === "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    `got ${sha1("")}`,
  );

  check(
    "hash: sha1 of abc matches FIPS 180-4",
    sha1("abc") === "a9993e364706816aba3e25717850c26c9cd0d89d",
    `got ${sha1("abc")}`,
  );

  check(
    "hash: sha256 of the empty string matches FIPS 180-4",
    sha256("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    `got ${sha256("")}`,
  );

  check(
    "hash: sha256 of abc matches FIPS 180-4",
    sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    `got ${sha256("abc")}`,
  );

  /*
   * 56 bytes is the padding edge: one more byte than fits beside the 8-byte
   * length field, so the message spills into a second block. A padding bug
   * that the short vectors above cannot see shows up exactly here.
   */
  check(
    "hash: 56-byte NIST vector, all three digests",
    md5(NIST_TWO_BLOCK) === "8215ef0796a20bcaaae116d3876c664a" &&
      sha1(NIST_TWO_BLOCK) === "84983e441c3bd26ebaae4aa1f95129e5e54670f1" &&
      sha256(NIST_TWO_BLOCK) ===
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    `md5 ${md5(NIST_TWO_BLOCK)} sha1 ${sha1(NIST_TWO_BLOCK)} sha256 ${sha256(NIST_TWO_BLOCK)}`,
  );

  /* Exactly one full block of input, so the padding occupies a block of its own. */
  const BLOCK_64 = "a".repeat(64);
  check(
    "hash: 64-byte input pads into a whole extra block",
    md5(BLOCK_64) === "014842d480b571495a4a0363793f7367" &&
      sha256(BLOCK_64) ===
        "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
    `md5 ${md5(BLOCK_64)} sha256 ${sha256(BLOCK_64)}`,
  );

  /* The FIPS long-message vector: 15625 blocks, which is also where a wrong
     bit-length field would finally disagree. */
  const MILLION = "a".repeat(1000000);
  check(
    "hash: one million letters matches the FIPS long-message vector",
    sha1(MILLION) === "34aa973cd4c4daa4f61eeb2bdbad27316534016f" &&
      sha256(MILLION) ===
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    `sha1 ${sha1(MILLION)} sha256 ${sha256(MILLION)}`,
  );

  check(
    "hash: azerbaijani word is 4 characters and 6 utf-8 bytes",
    AZ_WORD.length === 4 &&
      utf8ByteLength(AZ_WORD) === 6 &&
      hex(utf8Bytes(AZ_WORD)) === "c999c59f7961",
    `chars ${AZ_WORD.length} bytes ${utf8ByteLength(AZ_WORD)} hex ${hex(utf8Bytes(AZ_WORD))}`,
  );

  /* Cross-checked against openssl over the same six bytes. A wrong encoding
     would still produce a digest here, which is why the bytes are asserted
     above and the digest below. */
  check(
    "hash: azerbaijani word digest agrees with openssl",
    sha256(AZ_WORD) === "f3d1faad62e0ff504f766f95260e6662c16241ca96286829a417ea7b6323305a" &&
      md5(AZ_WORD) === "f9816bd6520419c81034724855dc7e0c",
    `sha256 ${sha256(AZ_WORD)} md5 ${md5(AZ_WORD)}`,
  );

  check(
    "hash: emoji encodes as one 4-byte sequence, not two 3-byte ones",
    hex(utf8Bytes("\u{1F600}")) === "f09f9880",
    `got ${hex(utf8Bytes("\u{1F600}"))}`,
  );

  /* A string cut through an emoji leaves half a surrogate pair behind. */
  check(
    "hash: lone surrogate becomes u+fffd like TextEncoder",
    hex(utf8Bytes("a\ud83db")) === "61efbfbd62" &&
      hex(utf8Bytes("\udc00")) === "efbfbd",
    `high ${hex(utf8Bytes("a\ud83db"))} low ${hex(utf8Bytes("\udc00"))}`,
  );

  const sample = hashAll("Camal");
  check(
    "hash: digests are lowercase hex of 32, 40 and 64 characters",
    sample.md5.length === 32 &&
      sample.sha1.length === 40 &&
      sample.sha256.length === 64 &&
      HEX_ONLY.test(sample.md5 + sample.sha1 + sample.sha256),
    `lengths ${sample.md5.length}/${sample.sha1.length}/${sample.sha256.length}`,
  );

  /* The complaint this answers: "the other tool gives me a different hash". */
  check(
    "hash: an invisible trailing newline changes every digest",
    sha256("abc") !== sha256("abc\n") && md5("abc") !== md5("abc\n"),
    "trailing newline was ignored somewhere",
  );

  const counted = hashAll(AZ_WORD);
  check(
    "hash: hashAll reports characters and bytes apart",
    counted.characters === 4 && counted.bytes === 6 && counted.sha256 === sha256(AZ_WORD),
    `characters ${counted.characters} bytes ${counted.bytes}`,
  );

  check(
    "hash: formatDigest changes case only",
    formatDigest(sample.sha256, true) === sample.sha256.toUpperCase() &&
      formatDigest(sample.sha256, false) === sample.sha256 &&
      formatDigest(sample.sha256, true).toLowerCase() === sample.sha256,
    `got ${formatDigest(sample.sha256, true).slice(0, 12)}`,
  );

  /* Two inputs whose bytes differ by one bit produce unrelated digests; the
     case guards against a truncation that would make near inputs collide. */
  check(
    "hash: single-character difference changes the whole digest",
    sha256("a") !== sha256("b") && sha1("a") !== sha1("b") && md5("a") !== md5("b"),
    "two different inputs produced the same digest",
  );
};
