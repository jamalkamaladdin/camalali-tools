/**
 * Number base conversion and the bit-level arithmetic that sits under it:
 * parsing a string in any base from 2 to 36, reading the same value back in
 * binary/octal/decimal/hex at once, and the two's-complement bit pattern a
 * fixed width (8/16/32/64 bits) gives a negative number.
 *
 * Everything here is `BigInt`, never `number`. A 64-bit unsigned value
 * routinely exceeds `Number.MAX_SAFE_INTEGER` (2^53 - 1) — `18446744073709551615`
 * (2^64 - 1) silently rounds to `18446744073709552000` the moment it touches
 * a JS `number`, which is exactly the kind of wrong-but-plausible figure
 * this project refuses to show. `BigInt` has no such ceiling and, as a
 * bonus, its own `toString(radix)` already knows how to print any base from
 * 2 to 36 correctly — this file only has to add what `BigInt` does not
 * have: two's-complement encoding within a chosen width, and the bitwise
 * operators evaluated within that width rather than over an unbounded
 * integer.
 */

export const BIT_WIDTHS = [8, 16, 32, 64] as const;
export type BitWidth = (typeof BIT_WIDTHS)[number];

const DIGIT_VALUE: Record<string, number> = (() => {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const map: Record<string, number> = {};
  for (let i = 0; i < chars.length; i++) map[chars[i]] = i;
  return map;
})();

export type ParseResult = { ok: true; value: bigint } | { ok: false; error: string };

/**
 * Parses a string as a whole number in `base` (2–36). A leading `0x`/`0b`/`0o`
 * is stripped only when it matches the base being asked for — typing `0x`
 * while parsing in base 10 is not a hex number, it is a mistake, and is
 * reported as one rather than silently reinterpreted. Underscores are
 * accepted as visitor-typed digit-group separators (`1111_0000`) and
 * dropped before validation, same as JavaScript's own numeric literals.
 */
export function parseInBase(raw: string, base: number): ParseResult {
  if (!Number.isInteger(base) || base < 2 || base > 36) {
    return { ok: false, error: "Baza 2 ilə 36 arasında bir tam ədəd olmalıdır." };
  }

  let text = raw.trim();
  if (text === "") {
    return { ok: false, error: "Ədəd boşdur." };
  }

  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  const lower = text.toLowerCase();
  if (base === 16 && lower.startsWith("0x")) text = text.slice(2);
  else if (base === 2 && lower.startsWith("0b")) text = text.slice(2);
  else if (base === 8 && lower.startsWith("0o")) text = text.slice(2);

  text = text.replace(/_/g, "");
  if (text === "") {
    return { ok: false, error: "Ədəd boşdur." };
  }

  let result = 0n;
  const bigBase = BigInt(base);
  for (const ch of text.toLowerCase()) {
    const digit = DIGIT_VALUE[ch];
    if (digit === undefined || digit >= base) {
      return { ok: false, error: `"${ch}" simvolu ${base} bazasında düzgün rəqəm deyil.` };
    }
    result = result * bigBase + BigInt(digit);
  }

  return { ok: true, value: negative ? -result : result };
}

export type FourBases = { base2: string; base8: string; base10: string; base16: string };

/** `BigInt.prototype.toString(radix)` handles 2–36 and negative values (as a `-` sign plus magnitude) natively — nothing to hand-roll here. */
export function formatAllBases(value: bigint): FourBases {
  return {
    base2: value.toString(2),
    base8: value.toString(8),
    base10: value.toString(10),
    base16: value.toString(16),
  };
}

export type BitsResult = { ok: true; bits: string } | { ok: false; error: string };

function widthMask(width: BitWidth): bigint {
  return (1n << BigInt(width)) - 1n;
}

/** Reinterprets any bigint as its `width`-bit unsigned pattern, wrapping (mod 2^width) rather than rejecting an out-of-range value — this is what the bitwise operators run on. */
function wrapToWidth(value: bigint, width: BitWidth): bigint {
  const modulus = 1n << BigInt(width);
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

function unsignedToSigned(value: bigint, width: BitWidth): bigint {
  const halfRange = 1n << BigInt(width - 1);
  return value >= halfRange ? value - (1n << BigInt(width)) : value;
}

/** The two's-complement bit string for `value` at `width` bits — an out-of-range value is refused rather than silently truncated, since truncating would show a different number than the one typed. */
export function toTwosComplementBits(value: bigint, width: BitWidth): BitsResult {
  const min = -(1n << BigInt(width - 1));
  const max = (1n << BigInt(width - 1)) - 1n;
  if (value < min || value > max) {
    return {
      ok: false,
      error: `${width} bitlik işarəli aralıq ${min.toString()}..${max.toString()} təşkil edir, bu ədəd sığmır.`,
    };
  }
  return { ok: true, bits: wrapToWidth(value, width).toString(2).padStart(width, "0") };
}

/** The plain unsigned bit string for `value` at `width` bits. */
export function toUnsignedBits(value: bigint, width: BitWidth): BitsResult {
  const max = widthMask(width);
  if (value < 0n || value > max) {
    return {
      ok: false,
      error: `${width} bitlik işarəsiz aralıq 0..${max.toString()} təşkil edir, bu ədəd sığmır.`,
    };
  }
  return { ok: true, bits: value.toString(2).padStart(width, "0") };
}

/** The value a `width`-character bit string represents, read as signed (two's complement) or unsigned. */
export function bitsToValue(bits: string, signed: boolean): bigint {
  const unsigned = BigInt(`0b${bits}`);
  return signed ? unsignedToSigned(unsigned, bits.length as BitWidth) : unsigned;
}

/** Flips the bit at `index` (0 = most significant) and returns the new bit string. */
export function toggleBit(bits: string, index: number): string {
  const chars = [...bits];
  chars[index] = chars[index] === "0" ? "1" : "0";
  return chars.join("");
}

export function bitwiseAnd(a: bigint, b: bigint, width: BitWidth): bigint {
  return wrapToWidth(a, width) & wrapToWidth(b, width);
}

export function bitwiseOr(a: bigint, b: bigint, width: BitWidth): bigint {
  return wrapToWidth(a, width) | wrapToWidth(b, width);
}

export function bitwiseXor(a: bigint, b: bigint, width: BitWidth): bigint {
  return wrapToWidth(a, width) ^ wrapToWidth(b, width);
}

export function bitwiseNot(a: bigint, width: BitWidth): bigint {
  return widthMask(width) ^ wrapToWidth(a, width);
}

export function shiftLeft(a: bigint, amount: number, width: BitWidth): bigint {
  return (wrapToWidth(a, width) << BigInt(amount)) & widthMask(width);
}

/**
 * Logical shift right (unsigned reading, zero-filled) versus arithmetic
 * shift right (signed reading, sign-filled) genuinely differ once the top
 * bit is set — `11111000` read as unsigned 248 shifts right to a small
 * positive number; the same bits read as signed -8 shift right to -4,
 * keeping the sign. `BigInt`'s native `>>` is already an arithmetic shift
 * for a negative operand (floor division by 2^n), so the signed path only
 * has to reinterpret the pattern as signed first and re-encode it after.
 */
export function shiftRight(a: bigint, amount: number, width: BitWidth, signed: boolean): bigint {
  const pattern = wrapToWidth(a, width);
  if (!signed) return pattern >> BigInt(amount);
  const asSigned = unsignedToSigned(pattern, width);
  return wrapToWidth(asSigned >> BigInt(amount), width);
}
