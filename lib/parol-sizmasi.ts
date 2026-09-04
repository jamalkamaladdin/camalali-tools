/*
 * The breach lookup, split so that the half that matters can be proved without
 * a network.
 *
 * The whole tool rests on one property — k-anonymity — and the code is laid
 * out so that the property is structural rather than a promise made in the
 * copy. `splitPasswordHash` is the only function here that ever sees a
 * password, and the only thing it hands onwards is the first five characters
 * of its SHA-1. Everything after it works on the range body, which is byte for
 * byte identical for every visitor who happens to share those five characters,
 * and the match is found by walking that body next to the password that
 * produced it — in the browser, never on a server.
 *
 * SHA-1 is not a design choice. It is the digest the service indexes by, so a
 * stronger hash would have nothing to ask about. It is also the reason the
 * suffix must not travel: SHA-1 of a weak password is reversible by anybody
 * holding the same wordlist the breach index is built from.
 */
import { sha1 } from "./hash";

/** The service splits its index at five hex characters. Nothing else is a valid query. */
export const PREFIX_LENGTH = 5;

/** SHA-1 is 40 hex characters; a range body lists the other 35 of each one. */
export const SUFFIX_LENGTH = 35;

export type PasswordHashParts = {
  /** The whole digest, uppercase. Stays in the browser; shown only on request. */
  hash: string;
  /** The five characters that are sent. */
  prefix: string;
  /** The thirty-five that are not. */
  suffix: string;
};

/**
 * Splits a password's SHA-1 into the part that travels and the part that does not.
 *
 * Uppercase throughout, because the service answers in uppercase and the tool
 * shows both halves side by side — two cases of the same digest on one screen
 * looks like a mismatch to a visitor who is right to be suspicious here.
 */
export function splitPasswordHash(password: string): PasswordHashParts {
  const hash = sha1(password).toUpperCase();
  return {
    hash,
    prefix: hash.slice(0, PREFIX_LENGTH),
    suffix: hash.slice(PREFIX_LENGTH),
  };
}

const PREFIX_SHAPE = /^[0-9a-fA-F]{5}$/;

/**
 * The only input the endpoint accepts.
 *
 * Written as an exact shape rather than a sanitiser: this value is spliced into
 * an outside address, and a validator that trims and hopes is how a tool route
 * becomes a general-purpose relay wearing this server's address.
 */
export function isValidPrefix(value: string): boolean {
  return PREFIX_SHAPE.test(value);
}

/** The service's index is uppercase; a lowercase prefix would miss every row. */
export function normalisePrefix(value: string): string {
  return value.toUpperCase();
}

export type RangeEntry = { suffix: string; count: number };

const SUFFIX_SHAPE = /^[0-9A-F]{35}$/;

/**
 * Reads a range body: one `SUFFIX:COUNT` per line.
 *
 * Lines arrive CRLF-terminated, so every one of them carries a stray carriage
 * return that would otherwise end up inside the suffix and match nothing. A
 * line that does not fit the shape is skipped rather than thrown on — a body
 * with one malformed row is still an answer, and the visitor's own row is
 * probably in the other 1976.
 */
export function parseRangeBody(body: string): RangeEntry[] {
  const entries: RangeEntry[] = [];

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const suffix = line.slice(0, colon).toUpperCase();
    if (!SUFFIX_SHAPE.test(suffix)) continue;

    const count = Number(line.slice(colon + 1));
    if (!Number.isInteger(count) || count < 0) continue;

    entries.push({ suffix, count });
  }

  return entries;
}

/**
 * How many times the password behind `suffix` appears in the breach corpus.
 *
 * Zero covers two cases that are the same answer: the suffix is absent, and
 * the suffix is present with a count of zero — which is what a padded response
 * looks like, since the service can pad a range with decoy rows so that the
 * size of the reply says nothing about how many real hashes it holds.
 */
export function countInRange(body: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  for (const entry of parseRangeBody(body)) {
    if (entry.suffix === wanted) return entry.count;
  }
  return 0;
}

export type ExposureLevel = "clean" | "seen" | "common" | "notorious";

export type Exposure = {
  level: ExposureLevel;
  count: number;
  /** One line naming what was found. */
  headline: string;
  /** What to do about it, in the second person. */
  advice: string;
};

/*
 * Where the bands are drawn, and why they are drawn at all: a single number
 * with no scale reads the same at 3 as at 3,000,000, and those are two very
 * different situations. One appearance means somebody's leaked database
 * happened to contain it; a million means it is in the first page of every
 * cracking wordlist and an attacker reaches it in under a second.
 */
const COMMON_FROM = 10;
const NOTORIOUS_FROM = 1000;

export function describeExposure(count: number): Exposure {
  if (count <= 0) {
    return {
      level: "clean",
      count: 0,
      headline: "Bu parol məlum sızmalarda tapılmadı.",
      advice:
        "Bu, parolun güclü olduğunu göstərmir — yalnız onun hələ ictimai sızma siyahılarına düşmədiyini göstərir. Dünən oğurlanmış, hələ dərc edilməmiş baza da bu cavabı dəyişmir. Parolun etibarlılığını uzunluq, təsadüfilik və hər hesabda ayrı parol işlətmək təyin edir, bu cavab yox.",
    };
  }

  if (count < COMMON_FROM) {
    return {
      level: "seen",
      count,
      headline: `Bu parol məlum sızmalarda ${count} dəfə göründü.`,
      advice:
        "Az görünmə də kifayətdir: parol artıq açıq siyahılardadır və hücumçunun lüğətinə düşüb. İşlətdiyin hər yerdə dəyişdir və eyni parolu təkrar seçmə.",
    };
  }

  if (count < NOTORIOUS_FROM) {
    return {
      level: "common",
      count,
      headline: `Bu parol məlum sızmalarda ${count} dəfə göründü.`,
      advice:
        "Bu səviyyədə parol artıq «şəxsi» sayılmır: onu eyni anda minlərlə insan işlədib. Sınaqdan keçirilən ilk siyahılarda olduğu üçün brute-force gözləmədən, birbaşa yoxlanılır. Dərhal dəyişdir.",
    };
  }

  return {
    level: "notorious",
    count,
    headline: `Bu parol məlum sızmalarda ${count} dəfə göründü.`,
    advice:
      "Bu parol hücum lüğətlərinin ilk sətirlərindədir — onu tapmaq üçün heç bir hesablama lazım deyil, sadəcə siyahıdan oxunur. Hansı hesabda işlədilirsə orada təhlükəsizlik faktiki olaraq yoxdur. İndi dəyişdir və parol menecerinin yaratdığı təsadüfi parolu götür.",
  };
}
