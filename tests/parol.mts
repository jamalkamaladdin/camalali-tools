/*
 * A password generator is the hardest kind of thing to check by looking at it:
 * biased output and uniform output are both a column of gibberish. So the
 * randomness is injected here, and two cases pin down the part that a reader
 * cannot see — that a draw above the rejection limit really is thrown away,
 * and that a large sample lands flat across the alphabet.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildAlphabet,
  crackTimeLabel,
  entropyBits,
  generatePasswords,
  MAX_COUNT,
  MAX_LENGTH,
  MIN_LENGTH,
  rateStrength,
  SIMILAR_CHARACTERS,
  type CharsetSelection,
  type RandomWords,
} from "../lib/parol";

function sets(
  lowercase: boolean,
  uppercase: boolean,
  digits: boolean,
  symbols: boolean,
): CharsetSelection {
  return { lowercase, uppercase, digits, symbols };
}

const ALL = sets(true, true, true, true);
const LETTERS_AND_DIGITS = sets(true, true, true, false);

/** Hands out exactly these words, then zeros. */
function scripted(words: number[]): RandomWords {
  let handed = false;
  return (count) => {
    if (handed) return new Uint32Array(count);
    handed = true;
    return Uint32Array.from(words);
  };
}

/*
 * xorshift32 with a fixed seed: a poor generator by cryptographic standards,
 * which is the point — it is uniform enough to expose a modulo bias and
 * deterministic enough that the distribution case can never flake.
 */
function xorshift(seed: number): RandomWords {
  let state = seed >>> 0;
  return (count) => {
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      out[i] = state;
    }
    return out;
  };
}

export const checks: CheckSuite = (check) => {
  const bits26x10 = entropyBits(26, 10);
  check(
    "parol: 26-letter alphabet over 10 characters is 47.0 bits",
    Math.round(bits26x10 * 10) / 10 === 47.0,
    `got ${bits26x10}`,
  );

  check(
    "parol: entropy is zero when there is nothing to choose from",
    entropyBits(1, 20) === 0 && entropyBits(78, 0) === 0,
    `got ${entropyBits(1, 20)} and ${entropyBits(78, 0)}`,
  );

  check(
    "parol: all four sets give 78 characters, lowercase alone gives 26",
    buildAlphabet(ALL, false).length === 78 &&
      buildAlphabet(sets(true, false, false, false), false).length === 26,
    `got ${buildAlphabet(ALL, false).length} and ${buildAlphabet(sets(true, false, false, false), false).length}`,
  );

  const digitsOnly = buildAlphabet(sets(false, false, true, false), true);
  check(
    "parol: digits without similar characters are exactly 23456789",
    digitsOnly === "23456789",
    `got ${digitsOnly}`,
  );

  const wide = generatePasswords({ length: 40, count: 50, sets: ALL, excludeSimilar: false });
  check(
    "parol: every character comes from the selected alphabet",
    wide.ok &&
      wide.passwords.every((password) => [...password].every((c) => wide.alphabet.includes(c))),
    wide.ok ? "a character outside the alphabet appeared" : `refused: ${wide.error}`,
  );

  const lengths = [MIN_LENGTH, 7, 63, 64, MAX_LENGTH];
  check(
    "parol: the password length is exactly what was asked for",
    lengths.every((length) => {
      const batch = generatePasswords({ length, count: 3, sets: ALL, excludeSimilar: false });
      return batch.ok && batch.passwords.every((password) => password.length === length);
    }),
    "at least one batch came back the wrong length",
  );

  const nothing = generatePasswords({
    length: 20,
    count: 5,
    sets: sets(false, false, false, false),
    excludeSimilar: false,
  });
  check(
    "parol: no character set selected is refused with a message",
    !nothing.ok && nothing.error.length > 0,
    nothing.ok ? "a password was produced from an empty alphabet" : "no message",
  );

  const badLengths = [MIN_LENGTH - 1, MAX_LENGTH + 1, 12.5, Number.NaN];
  check(
    "parol: length outside 4..128 and non-integers are refused",
    badLengths.every(
      (length) => !generatePasswords({ length, count: 1, sets: ALL, excludeSimilar: false }).ok,
    ),
    "an out-of-range length produced a password",
  );

  const badCounts = [0, -3, MAX_COUNT + 1];
  check(
    "parol: count outside 1..50 is refused",
    badCounts.every(
      (count) => !generatePasswords({ length: 20, count, sets: ALL, excludeSimilar: false }).ok,
    ),
    "an out-of-range count produced a batch",
  );

  /*
   * The rejection case. With letters and digits the alphabet is 62 and the
   * largest multiple of 62 below 2^32 is 4294967292, so the first two words
   * here are above the limit and must be thrown away. Plain `word % 62` would
   * keep them and map both onto index 0, which is the bias this guards
   * against: the answer would start with "a" instead of "h".
   */
  const rejecting = generatePasswords(
    { length: 4, count: 1, sets: LETTERS_AND_DIGITS, excludeSimilar: false },
    scripted([4294967292, 4294967295, 7, 0, 61, 30]),
  );
  check(
    "parol: draws at or above the rejection limit are redrawn",
    rejecting.ok && rejecting.passwords[0] === "ha9E",
    rejecting.ok ? `got ${rejecting.passwords[0]}` : `refused: ${rejecting.error}`,
  );

  /*
   * The distribution case. 128000 characters over a 62-character alphabet is
   * about 2065 per character; a modulo bias over a 32-bit draw is far too
   * small to see here, but a bias introduced by a smaller draw or a bad
   * index would move whole buckets. The tolerance is 10 per cent, which is
   * more than four standard deviations for this sample size.
   */
  const source = xorshift(0x9e3779b9);
  const tally = new Map<string, number>();
  let sampled = 0;
  for (let round = 0; round < 20; round++) {
    const batch = generatePasswords(
      { length: 128, count: 50, sets: LETTERS_AND_DIGITS, excludeSimilar: false },
      source,
    );
    if (!batch.ok) break;
    for (const password of batch.passwords) {
      for (const character of password) {
        tally.set(character, (tally.get(character) ?? 0) + 1);
        sampled++;
      }
    }
  }
  const expected = sampled / 62;
  const worst = [...tally.values()].reduce(
    (far, value) => Math.max(far, Math.abs(value - expected)),
    0,
  );
  check(
    "parol: a large sample lands flat across the alphabet",
    tally.size === 62 && sampled === 128000 && worst < expected * 0.1,
    `${tally.size} distinct, ${sampled} sampled, worst deviation ${worst.toFixed(1)} of ${expected.toFixed(1)}`,
  );

  const excluded = generatePasswords({
    length: 128,
    count: 50,
    sets: ALL,
    excludeSimilar: true,
  });
  check(
    "parol: excluded look-alike characters are absent from the output",
    excluded.ok &&
      excluded.alphabetSize === 73 &&
      excluded.passwords.every(
        (password) => ![...password].some((c) => SIMILAR_CHARACTERS.includes(c)),
      ),
    excluded.ok ? `alphabet ${excluded.alphabetSize}` : `refused: ${excluded.error}`,
  );

  /* No hidden state between calls: the same source has to give the same batch. */
  const first = generatePasswords(
    { length: 16, count: 2, sets: ALL, excludeSimilar: false },
    xorshift(12345),
  );
  const second = generatePasswords(
    { length: 16, count: 2, sets: ALL, excludeSimilar: false },
    xorshift(12345),
  );
  check(
    "parol: the same random source reproduces the same batch",
    first.ok && second.ok && first.passwords.join() === second.passwords.join(),
    "two runs of one source disagreed",
  );

  check(
    "parol: the strength band changes at 40, 60 and 80 bits",
    rateStrength(39.9).label !== rateStrength(40).label &&
      rateStrength(59.9).label !== rateStrength(60).label &&
      rateStrength(79.9).label !== rateStrength(80).label,
    "a band boundary did not change the label",
  );

  /*
   * 2^(bits - 1) overflows a double somewhere past 1024 bits and becomes
   * Infinity. The label has to stay a sentence rather than becoming "NaN il".
   */
  check(
    "parol: an unreachable entropy still produces a readable label",
    crackTimeLabel(5000).length > 0 &&
      !crackTimeLabel(5000).includes("NaN") &&
      !crackTimeLabel(5000).includes("Infinity") &&
      crackTimeLabel(20) !== crackTimeLabel(120),
    `got ${crackTimeLabel(5000)}`,
  );
};
