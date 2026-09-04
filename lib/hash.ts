/**
 * MD5, SHA-1 and SHA-256, written out in plain TypeScript.
 *
 * `crypto.subtle.digest` does all three in four lines and is deliberately not
 * used: it only exists in a secure context, and this site is opened over
 * `http://<ip>` often enough — a WSL address during development, the origin
 * during a deploy check — that the whole object is simply undefined there. A
 * hash tool that works on one origin and throws on another is worse than a
 * hundred lines of arithmetic that work everywhere. It is also synchronous,
 * which is what lets the widget recompute inside a `useMemo` while the visitor
 * is still typing.
 *
 * The UTF-8 step is written out too, rather than handed to `TextEncoder`. It is
 * the half of the answer nobody checks: a correct algorithm fed the wrong bytes
 * returns a digest that looks exactly as plausible as the right one, and never
 * reports an error. Azerbaijani makes that failure routine — the schwa, the
 * dotted capital and the cedilla letters are all two bytes each, so a
 * four-letter word is six bytes — so the byte layer sits here, under the same
 * cases as the digests that consume it.
 */

const HEX = "0123456789abcdef";

/**
 * The bytes a hash is actually computed over.
 *
 * Exported because the widget shows the count beside the digests: the gap
 * between the character count and the byte count is the whole reason an
 * Azerbaijani string can hash differently in two tools that both claim to do
 * SHA-256.
 */
export function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];

  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);

    /*
     * A JavaScript string is UTF-16, so anything above U+FFFF — an emoji, a
     * rare CJK glyph — arrives as two halves that only mean something
     * together. Read as separate characters they encode to six bytes instead
     * of four, and the digest is wrong.
     */
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      } else {
        /*
         * Half a pair has no UTF-8 form at all. It reaches here when a string
         * was cut through an emoji — a truncated database column, a sliced
         * paste. Emitting the surrogate as-is produces bytes no decoder
         * accepts; U+FFFD is what the encoding standard prescribes and what
         * `TextEncoder` does, so the two agree on such input.
         */
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return Uint8Array.from(out);
}

/** How many bytes the digest is taken over. */
export function utf8ByteLength(input: string): number {
  return utf8Bytes(input).length;
}

/**
 * Merkle-Damgard padding, shared by all three: a single 1 bit, zeros up to 56
 * bytes past a block boundary, then the message length in bits.
 *
 * The one difference between the families is the byte order of that length
 * word — MD5 grew out of little-endian hardware and writes it low byte first,
 * the SHA family writes it high byte first. Everything else about the padding
 * is identical, so it is one function with a flag rather than two.
 */
function pad(bytes: Uint8Array, littleEndianLength: boolean): Uint8Array {
  const total = (Math.floor((bytes.length + 8) / 64) + 1) * 64;
  const out = new Uint8Array(total);
  out.set(bytes);
  out[bytes.length] = 0x80;

  /*
   * The bit count is a 64-bit field and `bytes.length * 8` overflows 32 bits
   * once the input passes 512 MiB. Splitting before multiplying keeps both
   * halves inside the range a double represents exactly.
   */
  const low = (bytes.length % 0x20000000) * 8;
  const high = Math.floor(bytes.length / 0x20000000);

  for (let i = 0; i < 4; i++) {
    const lowByte = (low >>> (i * 8)) & 0xff;
    const highByte = (high >>> (i * 8)) & 0xff;
    if (littleEndianLength) {
      out[total - 8 + i] = lowByte;
      out[total - 4 + i] = highByte;
    } else {
      out[total - 1 - i] = lowByte;
      out[total - 5 - i] = highByte;
    }
  }

  return out;
}

/** Rotate left. Never called with 0 — `x >>> 32` is `x >>> 0` in JavaScript. */
function rotl(value: number, by: number): number {
  return ((value << by) | (value >>> (32 - by))) >>> 0;
}

function rotr(value: number, by: number): number {
  return ((value >>> by) | (value << (32 - by))) >>> 0;
}

/** A 32-bit word as hex, low byte first — MD5's output order. */
function hexLittle(word: number): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    const byte = (word >>> (i * 8)) & 0xff;
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}

/** A 32-bit word as hex, high byte first — the SHA output order. */
function hexBig(word: number): string {
  let out = "";
  for (let i = 3; i >= 0; i--) {
    const byte = (word >>> (i * 8)) & 0xff;
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}

/* ---------- MD5 ---------- */

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10,
  15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/*
 * K[i] = floor(2^32 * |sin(i + 1)|), with i in radians. RFC 1321 defines the
 * table by this formula rather than listing 64 magic numbers, and building it
 * the same way means a typo in a transcribed constant is not possible.
 */
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
}

/**
 * MD5 — 128 bits, 32 hex characters, lowercase.
 *
 * Broken for anything that has to resist an adversary: chosen-prefix collisions
 * are minutes of ordinary compute. Still here because it is the checksum the
 * rest of the world hands you — file listings, ETags, legacy database columns —
 * and comparing one is a legitimate reason to need it.
 */
export function md5(input: string): string {
  const message = pad(utf8Bytes(input), true);
  const words = new Uint32Array(16);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      words[i] =
        (message[at] |
          (message[at + 1] << 8) |
          (message[at + 2] << 16) |
          (message[at + 3] << 24)) >>>
        0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      /*
       * Four addends reach 2^34, past what a 32-bit integer holds — but a
       * double represents every integer that size exactly, and `>>> 0` is
       * defined as modulo 2^32, so summing in doubles and folding once is both
       * correct and cheaper than folding after every term. The same argument
       * covers `f` being negative: bitwise operators produce signed words, and
       * the modulo handles the sign.
       */
      const sum = (f + a + MD5_K[i] + words[g]) >>> 0;

      a = d;
      d = c;
      c = b;
      b = (b + rotl(sum, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return hexLittle(a0) + hexLittle(b0) + hexLittle(c0) + hexLittle(d0);
}

/* ---------- SHA-1 ---------- */

/**
 * SHA-1 — 160 bits, 40 hex characters, lowercase.
 *
 * Collisions have been public since 2017 (SHAttered), so it is not a signature
 * hash any more. It remains the identifier git writes and the digest older APIs
 * still ask for, which is why the tool computes it beside the other two.
 */
export function sha1(input: string): string {
  const message = pad(utf8Bytes(input), false);
  const w = new Uint32Array(80);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      w[i] =
        ((message[at] << 24) |
          (message[at + 1] << 16) |
          (message[at + 2] << 8) |
          message[at + 3]) >>>
        0;
    }
    /* The message schedule: 16 words of input stretched to 80 by xor and a
       one-bit rotation. That rotation is the only thing separating SHA-1 from
       SHA-0, which fell almost immediately without it. */
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;

      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return hexBig(h0) + hexBig(h1) + hexBig(h2) + hexBig(h3) + hexBig(h4);
}

/* ---------- SHA-256 ---------- */

/*
 * The first 32 bits of the fractional parts of the cube roots of the first 64
 * primes. Listed rather than computed: `Math.cbrt` is not required to be
 * correctly rounded, so deriving them would make the digest depend on the
 * engine's libm — a difference that would surface as one wrong hash on one
 * browser and nowhere else.
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

/**
 * SHA-256 — 256 bits, 64 hex characters, lowercase.
 *
 * The one of the three that is still a cryptographic hash: no collision is
 * known and none is expected. It is the right default for a checksum, a
 * fingerprint or an integrity field.
 */
export function sha256(input: string): string {
  const message = pad(utf8Bytes(input), false);
  const w = new Uint32Array(64);
  const h = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ]);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      w[i] =
        ((message[at] << 24) |
          (message[at + 1] << 16) |
          (message[at + 2] << 8) |
          message[at + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let acc = h[7];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (acc + s1 + choose + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;

      acc = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + acc) >>> 0;
  }

  let out = "";
  for (const word of h) out += hexBig(word);
  return out;
}

/* ---------- what the widget asks for ---------- */

export type HashAlgorithm = "md5" | "sha1" | "sha256";

export type HashSet = {
  md5: string;
  sha1: string;
  sha256: string;
  /** Characters as JavaScript counts them — UTF-16 code units. */
  characters: number;
  /** Bytes the digests were actually taken over. */
  bytes: number;
};

/**
 * All three at once, because the tool shows all three at once and the visitor
 * types once. The byte count travels with them: it is the number that explains
 * why the same word can produce two different digests in two tools.
 */
export function hashAll(input: string): HashSet {
  return {
    md5: md5(input),
    sha1: sha1(input),
    sha256: sha256(input),
    characters: input.length,
    bytes: utf8ByteLength(input),
  };
}

/** Display-only. The digest itself is always lowercase; hex is case-insensitive. */
export function formatDigest(digest: string, uppercase: boolean): string {
  return uppercase ? digest.toUpperCase() : digest;
}

/* ---------- byte-input variants ---------- */

/**
 * SHA-256 over raw bytes, rather than a UTF-8 string.
 *
 * Written for a caller whose input never was text in the first place — a
 * decoded SSH key blob, for one — and would be silently wrong going through
 * `sha256(input)`: that function's only path from a string to bytes is
 * `utf8Bytes`, and binary data pushed through a UTF-8 encoder does not come
 * out the other side unchanged. This shares `pad`, `rotr`, `hexBig` and
 * `SHA256_K` with `sha256` — the constants and the padding are not written
 * twice, only the block loop is, because neither function calls the other.
 */
export function sha256Bytes(bytes: Uint8Array): string {
  const message = pad(bytes, false);
  const w = new Uint32Array(64);
  const h = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ]);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      w[i] =
        ((message[at] << 24) |
          (message[at + 1] << 16) |
          (message[at + 2] << 8) |
          message[at + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let acc = h[7];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (acc + s1 + choose + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;

      acc = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + acc) >>> 0;
  }

  let out = "";
  for (const word of h) out += hexBig(word);
  return out;
}

/**
 * MD5 over raw bytes. Same reasoning as `sha256Bytes` above — a decoded key
 * blob is not text, and `md5(input)` has no path that leaves arbitrary bytes
 * unchanged. Shares `pad`, `rotl`, `hexLittle`, `MD5_K` and `MD5_SHIFTS` with
 * `md5`; only the block loop is written a second time.
 */
export function md5Bytes(bytes: Uint8Array): string {
  const message = pad(bytes, true);
  const words = new Uint32Array(16);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      words[i] =
        (message[at] |
          (message[at + 1] << 8) |
          (message[at + 2] << 16) |
          (message[at + 3] << 24)) >>>
        0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const sum = (f + a + MD5_K[i] + words[g]) >>> 0;

      a = d;
      d = c;
      c = b;
      b = (b + rotl(sum, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return hexLittle(a0) + hexLittle(b0) + hexLittle(c0) + hexLittle(d0);
}
