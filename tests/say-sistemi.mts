import type { CheckSuite } from "./harness.mts";
import {
  bitsToValue,
  bitwiseAnd,
  bitwiseNot,
  bitwiseOr,
  bitwiseXor,
  formatAllBases,
  parseInBase,
  shiftLeft,
  shiftRight,
  toTwosComplementBits,
  toggleBit,
  type ParseResult,
} from "../lib/say-sistemi";

/** `JSON.stringify` throws on a `bigint` field, so a `ParseResult` needs its own printer for failure messages. */
function describeParse(result: ParseResult): string {
  return result.ok ? `ok:${result.value.toString()}` : `error:${result.error}`;
}

export const checks: CheckSuite = (check) => {
  const hex = parseInBase("ff", 16);
  check(
    "known answer: 0xff parses to 255 and prints in all four bases",
    hex.ok &&
      hex.value === 255n &&
      JSON.stringify(formatAllBases(255n)) ===
        JSON.stringify({ base2: "11111111", base8: "377", base10: "255", base16: "ff" }),
    `got: ${describeParse(hex)}`,
  );

  const negativeBinary = parseInBase("-101", 2);
  check(
    "known answer: negative binary literal parses to -5",
    negativeBinary.ok && negativeBinary.value === -5n,
    `got: ${describeParse(negativeBinary)}`,
  );

  const minusOne = toTwosComplementBits(-1n, 8);
  check(
    "boundary: -1 in 8-bit two's complement is all ones",
    minusOne.ok && minusOne.bits === "11111111",
    `got: ${JSON.stringify(minusOne)}`,
  );

  const overflow = toTwosComplementBits(200n, 8);
  check(
    "boundary: a value outside the 8-bit signed range is refused, not truncated",
    overflow.ok === false,
    `got: ${JSON.stringify(overflow)}`,
  );

  check(
    "known answer: AND, OR and XOR at 8 bits",
    bitwiseAnd(0b1100n, 0b1010n, 8) === 0b1000n &&
      bitwiseOr(0b1100n, 0b1010n, 8) === 0b1110n &&
      bitwiseXor(0b1100n, 0b1010n, 8) === 0b0110n,
    `got: AND=${bitwiseAnd(0b1100n, 0b1010n, 8)} OR=${bitwiseOr(0b1100n, 0b1010n, 8)} XOR=${bitwiseXor(0b1100n, 0b1010n, 8)}`,
  );

  check(
    "known answer: NOT flips every bit within the width",
    bitwiseNot(0b00001111n, 8) === 0b11110000n,
    `got: ${bitwiseNot(0b00001111n, 8)}`,
  );

  check(
    "shiftLeft drops bits that overflow the width instead of growing past it",
    shiftLeft(0b10000001n, 1, 8) === 0b00000010n,
    `got: ${shiftLeft(0b10000001n, 1, 8)}`,
  );

  check(
    "logical vs arithmetic right shift differ on a negative-pattern byte — both return the width pattern, which bitsToValue then reads as signed or unsigned",
    shiftRight(248n, 1, 8, false) === 124n &&
      shiftRight(-8n, 1, 8, true) === 252n &&
      bitsToValue(shiftRight(-8n, 1, 8, true).toString(2).padStart(8, "0"), true) === -4n,
    `got: logical=${shiftRight(248n, 1, 8, false)} arithmetic-pattern=${shiftRight(-8n, 1, 8, true)}`,
  );

  const roundTrip = toTwosComplementBits(-100n, 8);
  check(
    "round trip: value -> two's-complement bits -> value",
    roundTrip.ok && bitsToValue(roundTrip.bits, true) === -100n,
    `got: ${JSON.stringify(roundTrip)}`,
  );

  check(
    "toggleBit flips exactly the requested position",
    toggleBit("00000000", 7) === "00000001" && bitsToValue("00000001", false) === 1n,
    `got: ${toggleBit("00000000", 7)}`,
  );

  const badDigit = parseInBase("12g", 8);
  check(
    "malformed input: a digit invalid for the base returns an error, not a throw",
    badDigit.ok === false,
    `got: ${describeParse(badDigit)}`,
  );

  const badBase = parseInBase("10", 37);
  check(
    "malformed input: a base outside 2-36 returns an error",
    badBase.ok === false,
    `got: ${describeParse(badBase)}`,
  );

  const bigValue = parseInBase("18446744073709551615", 10);
  check(
    "BigInt precision: 2^64-1 round-trips exactly through hex, where a JS number would round",
    bigValue.ok && formatAllBases(bigValue.value).base16 === "ffffffffffffffff",
    `got: ${bigValue.ok ? formatAllBases(bigValue.value).base16 : describeParse(bigValue)}`,
  );

  const empty = parseInBase("", 10);
  check("boundary: empty input is an error", empty.ok === false, `got: ${describeParse(empty)}`);
};
