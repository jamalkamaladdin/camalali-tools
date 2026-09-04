/**
 * Random password generation.
 *
 * Two things decide whether a generated password is worth anything, and both
 * are easy to get wrong quietly:
 *
 * 1. Where the randomness comes from. `Math.random` is a fast PRNG with a
 *    small, recoverable state — an attacker who sees one output can often
 *    predict the rest — so every draw here comes from `crypto.getRandomValues`.
 *    That is the same generator `crypto.subtle` sits on, but unlike the subtle
 *    API it needs no secure context, so it also works when this site is opened
 *    over `http://<ip>`.
 *
 * 2. How a random number becomes a character. That step is the one this file
 *    spends the most words on, below.
 *
 * The strings this returns never leave the browser: no storage, no network,
 * nothing on the server.
 */

export type CharsetKey = "lowercase" | "uppercase" | "digits" | "symbols";

export type CharsetSelection = Record<CharsetKey, boolean>;

/*
 * The symbol row is deliberately short. Every character that routinely breaks
 * a paste is left out — the three quote marks and the backslash (shell and YAML
 * escaping), the space (silently trimmed by half the forms on the web), angle
 * brackets (eaten by HTML) and the ampersand (it backgrounds a shell command
 * and separates query parameters). What remains is 16 characters that survive
 * a .env file, a connection string, a CSV cell and a `docker run` argument.
 */
export const CHARSETS: Record<CharsetKey, { label: string; characters: string }> = {
  lowercase: { label: "Kiçik hərflər (a–z)", characters: "abcdefghijklmnopqrstuvwxyz" },
  uppercase: { label: "Böyük hərflər (A–Z)", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  digits: { label: "Rəqəmlər (0–9)", characters: "0123456789" },
  symbols: { label: "Simvollar (!#$%…)", characters: "!#$%()*+-.:=?@^_" },
};

/** The order the sets appear in the alphabet and in the interface. */
export const CHARSET_ORDER: CharsetKey[] = ["lowercase", "uppercase", "digits", "symbols"];

/*
 * The characters people misread off a screen or a printout when they have to
 * retype the password by hand: zero against capital O, and one against
 * lowercase L against capital I. Dropping them costs entropy — the tool says
 * how much — and buys back the support call.
 */
export const SIMILAR_CHARACTERS = "0O1lI";

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;
export const MAX_COUNT = 50;

export type PasswordRequest = {
  length: number;
  count: number;
  sets: CharsetSelection;
  excludeSimilar: boolean;
};

export const DEFAULT_REQUEST: PasswordRequest = {
  length: 20,
  count: 5,
  sets: { lowercase: true, uppercase: true, digits: true, symbols: true },
  excludeSimilar: false,
};

/**
 * A source of 32-bit random words. Real use passes nothing and gets
 * `crypto.getRandomValues`; the checks pass a scripted sequence, which is the
 * only way to prove that a rejected draw is really rejected.
 *
 * A source must return at least one word per call.
 */
export type RandomWords = (count: number) => Uint32Array;

const browserRandom: RandomWords = (count) => {
  const words = new Uint32Array(count);
  crypto.getRandomValues(words);
  return words;
};

/** Drawn in batches: one call per character would be a syscall per character. */
const BUFFER_WORDS = 256;

function wordReader(random: RandomWords): () => number {
  let buffer = random(BUFFER_WORDS);
  let at = 0;

  return () => {
    if (at >= buffer.length) {
      buffer = random(BUFFER_WORDS);
      at = 0;
    }
    return buffer[at++];
  };
}

const WORD_RANGE = 4294967296; // 2^32

/**
 * Pick one index below `bound`, uniformly — by rejection sampling.
 *
 * The obvious `word % bound` is not uniform, and the reason is arithmetic:
 * 2^32 is not a multiple of 62, so when 2^32 outcomes are folded onto 62
 * buckets some buckets receive one more outcome than the others. The first
 * characters of the alphabet come up slightly more often than the last ones —
 * always the first, always the same ones, which is exactly the kind of
 * structure an attacker's word list is built to exploit.
 *
 * At a 32-bit draw the excess is about one part in 10^8 and nobody would
 * notice. The same shortcut written over a `Uint8Array`, which is how it is
 * usually written, is a real defect: 256 = 62 * 4 + 8, so eight of the 62
 * characters get five chances instead of four and are 25% more likely.
 *
 * The fix costs one comparison. Everything at or above the largest multiple of
 * `bound` that fits in 2^32 is thrown away and redrawn, which leaves an exact
 * multiple behind and therefore an exactly flat distribution. That matters
 * beyond neatness here: the entropy figure this tool prints is only true if
 * every character really is equally likely.
 *
 * Termination is not in question — the discarded band is at most `bound - 1`
 * values out of 2^32, so a redraw is needed roughly once in 10^8 characters.
 */
function pick(bound: number, nextWord: () => number): number {
  const limit = WORD_RANGE - (WORD_RANGE % bound);
  let word = nextWord();
  while (word >= limit) word = nextWord();
  return word % bound;
}

/**
 * The characters a password may be built from, in a fixed order so that the
 * same selection always yields the same alphabet — the checks and the displayed
 * "N simvol" count both depend on that.
 */
export function buildAlphabet(sets: CharsetSelection, excludeSimilar: boolean): string {
  let alphabet = "";
  for (const key of CHARSET_ORDER) {
    if (sets[key]) alphabet += CHARSETS[key].characters;
  }
  if (excludeSimilar) {
    alphabet = [...alphabet].filter((c) => !SIMILAR_CHARACTERS.includes(c)).join("");
  }
  return alphabet;
}

/**
 * log2(alphabet^length) — how many bits of guessing the password is worth.
 *
 * The formula is only this simple because every character is drawn
 * independently and uniformly. Generators that force "at least one digit and
 * one symbol" break that assumption and end up quoting a number their own
 * output no longer reaches, which is why this one does not force anything: a
 * long password from a single set beats a short one from four.
 */
export function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize < 2 || length < 1) return 0;
  return length * Math.log2(alphabetSize);
}

export type Strength = {
  label: string;
  /** What the number means, in words, for a visitor who has never met "bit". */
  note: string;
};

/*
 * The bands are the ones an offline attack argues for, not the ones a login
 * form checks. Under 40 bits is inside a single machine's reach; from 60 the
 * cost is a data centre; from 80 nothing available today changes the answer.
 */
export function rateStrength(bits: number): Strength {
  if (bits < 40) {
    return {
      label: "Zəif",
      note: "Bir kompüterin gücü ilə qırılır: yalnız əhəmiyyətsiz hesablar üçün.",
    };
  }
  if (bits < 60) {
    return {
      label: "Orta",
      note: "Adi hesab üçün keçər, amma poçt və ya bank hesabı üçün qısadır.",
    };
  }
  if (bits < 80) {
    return {
      label: "Güclü",
      note: "Sızmış baza üzərində aparılan hücuma da davam gətirir.",
    };
  }
  return {
    label: "Çox güclü",
    note: "Bu gün mövcud olan hesablama gücü ilə seçmə yolu ilə tapılmır.",
  };
}

/*
 * Ten billion guesses a second: a rented rack of GPUs against a fast hash
 * (MD5, SHA-1, unsalted SHA-256) — the situation after a database leak, which
 * is how passwords are actually attacked. A password stored with bcrypt or
 * Argon2 costs the attacker orders of magnitude more, so this figure is the
 * pessimistic end and the honest one to quote.
 */
const GUESSES_PER_SECOND = 1e10;

const YEAR_SECONDS = 31557600;

/**
 * How long the average search takes at that rate — half the space, because a
 * search finds the answer halfway through on average.
 *
 * Rounded hard and to two significant words on purpose. "3 milyon il" is the
 * whole message; a digit after the comma would suggest the estimate is precise
 * when the rate it rests on moves by a factor of ten with the hardware.
 */
export function crackTimeLabel(bits: number): string {
  const guesses = Math.pow(2, bits - 1);
  if (!Number.isFinite(guesses)) return "kainatın yaşından qat-qat çox";

  const seconds = guesses / GUESSES_PER_SECOND;
  if (seconds < 1) return "bir saniyədən az";
  if (seconds < 60) return `${Math.round(seconds)} saniyə`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dəqiqə`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} saat`;

  const years = seconds / YEAR_SECONDS;
  if (years < 1) return `${Math.round(seconds / 86400)} gün`;
  if (years < 1000) return `${Math.round(years)} il`;
  if (years < 1e6) return `${Math.round(years / 1000)} min il`;
  if (years < 1e9) return `${Math.round(years / 1e6)} milyon il`;
  if (years < 1e12) return `${Math.round(years / 1e9)} milyard il`;
  return "kainatın yaşından qat-qat çox";
}

export type PasswordBatch =
  | {
      ok: true;
      passwords: string[];
      alphabet: string;
      alphabetSize: number;
      bits: number;
      strength: Strength;
      crackTime: string;
    }
  | { ok: false; error: string };

/**
 * The whole batch in one call, so the widget holds a result rather than a
 * generator it has to drive.
 *
 * Every failure is returned rather than thrown: the caller is a form where a
 * visitor can and will untick the last remaining character set, and that is a
 * message to show, not an exception.
 */
export function generatePasswords(
  request: PasswordRequest,
  random: RandomWords = browserRandom,
): PasswordBatch {
  const { length, count } = request;

  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return {
      ok: false,
      error: `Uzunluq ${MIN_LENGTH} ilə ${MAX_LENGTH} arasında tam ədəd olmalıdır.`,
    };
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return { ok: false, error: `Parol sayı 1 ilə ${MAX_COUNT} arasında olmalıdır.` };
  }

  const alphabet = buildAlphabet(request.sets, request.excludeSimilar);
  if (alphabet.length < 2) {
    return {
      ok: false,
      error:
        "Ən azı bir simvol dəsti seçilməlidir: hazırda seçimdən sonra iki simvol da qalmır.",
    };
  }

  const nextWord = wordReader(random);
  const characters = [...alphabet];
  const passwords: string[] = [];

  for (let i = 0; i < count; i++) {
    let password = "";
    for (let j = 0; j < length; j++) {
      password += characters[pick(characters.length, nextWord)];
    }
    passwords.push(password);
  }

  const bits = entropyBits(characters.length, length);

  return {
    ok: true,
    passwords,
    alphabet,
    alphabetSize: characters.length,
    bits,
    strength: rateStrength(bits),
    crackTime: crackTimeLabel(bits),
  };
}
