/*
 * What is worth checking here: the size-growth formula against known
 * byte/base64 length pairs, magic-byte MIME detection for the four formats
 * the entry names (PNG, JPEG, PDF, GIF), a byte round trip through the
 * encoder and decoder, malformed base64 (bad alphabet, bad length) failing
 * as an error rather than throwing, extension-vs-content mismatch being
 * reported rather than silently resolved one way, and the data-URI prefix
 * stripper handling both a wrapped and a bare input.
 */
import type { CheckSuite } from "./harness.mts";
import {
  base64ByteLength,
  base64ToBytes,
  bytesToBase64,
  detectMimeFromMagicBytes,
  exceedsLimit,
  growthPercent,
  MAX_FILE_BYTES,
  resolveMime,
  stripDataUriPrefix,
  wrapBase64,
} from "../lib/base64-fayl";

export const checks: CheckSuite = (check) => {
  check(
    "base64-fayl: base64 length is ceil(n/3)*4 for a spread of known byte counts",
    base64ByteLength(0) === 0 &&
      base64ByteLength(1) === 4 &&
      base64ByteLength(2) === 4 &&
      base64ByteLength(3) === 4 &&
      base64ByteLength(4) === 8 &&
      base64ByteLength(300) === 400,
    `got: ${[0, 1, 2, 3, 4, 300].map(base64ByteLength).join(",")}`,
  );

  const growth = growthPercent(3);
  check(
    "base64-fayl: growth percent for 3 bytes (which encode to 4) is exactly 33.33%",
    Math.abs(growth - 33.333333333333336) < 1e-9,
    `got: ${growth}`,
  );

  check(
    "base64-fayl: growth percent for an empty file is 0, not NaN",
    growthPercent(0) === 0,
    `got: ${growthPercent(0)}`,
  );

  check(
    "base64-fayl: PNG signature (89 50 4E 47 0D 0A 1A 0A) is detected from bytes",
    detectMimeFromMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])) === "image/png",
    `got: ${detectMimeFromMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))}`,
  );

  check(
    "base64-fayl: JPEG signature (FF D8 FF) is detected from bytes",
    detectMimeFromMagicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])) === "image/jpeg",
    `got: ${detectMimeFromMagicBytes(new Uint8Array([0xff, 0xd8, 0xff]))}`,
  );

  check(
    "base64-fayl: PDF signature (%PDF) is detected from bytes",
    detectMimeFromMagicBytes(new TextEncoder().encode("%PDF-1.7 rest of file")) === "application/pdf",
    `got: ${detectMimeFromMagicBytes(new TextEncoder().encode("%PDF-1.7"))}`,
  );

  check(
    "base64-fayl: GIF signature (GIF87a and GIF89a) is detected from bytes",
    detectMimeFromMagicBytes(new TextEncoder().encode("GIF87a...")) === "image/gif" &&
      detectMimeFromMagicBytes(new TextEncoder().encode("GIF89a...")) === "image/gif",
    `got: ${detectMimeFromMagicBytes(new TextEncoder().encode("GIF89a"))}`,
  );

  const original = new Uint8Array([0, 1, 2, 3, 253, 254, 255, 128, 64, 10, 13, 200]);
  const roundTrip = base64ToBytes(bytesToBase64(original));
  check(
    "base64-fayl: bytes survive an encode-then-decode round trip unchanged",
    roundTrip.ok && roundTrip.bytes.length === original.length && roundTrip.bytes.every((b, i) => b === original[i]),
    `got: ${JSON.stringify(roundTrip)}`,
  );

  const badAlphabet = base64ToBytes("not-valid-base64-!!!!");
  check(
    "base64-fayl: base64 with characters outside the alphabet fails as an error, not a throw",
    !badAlphabet.ok,
    `got: ${JSON.stringify(badAlphabet)}`,
  );

  const badLength = base64ToBytes("A");
  check(
    "base64-fayl: base64 whose length is 4n+1 fails as an error (that length is never valid)",
    !badLength.ok,
    `got: ${JSON.stringify(badLength)}`,
  );

  const mismatch = resolveMime("photo.png", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  check(
    "base64-fayl: a .png filename over JPEG bytes is reported as a mismatch, and the bytes win",
    mismatch.mime === "image/jpeg" && mismatch.source === "magic-bytes" && mismatch.mismatch === true,
    `got: ${JSON.stringify(mismatch)}`,
  );

  const noSignature = resolveMime("notes.txt", new TextEncoder().encode("just plain text"));
  check(
    "base64-fayl: a format with no magic bytes falls back to the extension, and is not reported as a mismatch",
    noSignature.mime === "text/plain" && noSignature.source === "extension" && noSignature.mismatch === false,
    `got: ${JSON.stringify(noSignature)}`,
  );

  check(
    "base64-fayl: file-size limit boundary is exclusive — exactly at the limit passes, one byte over fails",
    exceedsLimit(MAX_FILE_BYTES) === false && exceedsLimit(MAX_FILE_BYTES + 1) === true,
    `at limit: ${exceedsLimit(MAX_FILE_BYTES)}, over: ${exceedsLimit(MAX_FILE_BYTES + 1)}`,
  );

  const wrapped = wrapBase64("ABCDEFGHIJ", 4);
  check(
    "base64-fayl: line wrapping breaks at the given width, including a short final line",
    wrapped === "ABCD\nEFGH\nIJ",
    `got: ${JSON.stringify(wrapped)}`,
  );

  const withPrefix = stripDataUriPrefix("data:image/png;base64,QUJD");
  const withoutPrefix = stripDataUriPrefix("QUJD");
  check(
    "base64-fayl: a data URI prefix is separated from the base64 payload, and a bare payload passes through unchanged",
    withPrefix.mime === "image/png" &&
      withPrefix.base64 === "QUJD" &&
      withoutPrefix.mime === null &&
      withoutPrefix.base64 === "QUJD",
    `with: ${JSON.stringify(withPrefix)}, without: ${JSON.stringify(withoutPrefix)}`,
  );
};
