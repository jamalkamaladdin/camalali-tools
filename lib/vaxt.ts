/**
 * Unix timestamp <-> calendar date, both directions.
 *
 * The one genuinely ambiguous step is telling seconds from milliseconds when
 * a visitor pastes a bare integer with no unit attached — both are just
 * digits. Neither `Date` nor `az-date.ts` resolves that on their own, so this
 * file resolves it once, by digit count, and hands the caller the guess it
 * made alongside the result, so a misread is visible on the page instead of
 * silently producing a date fifty thousand years away.
 */

import { AZ_WEEKDAYS, formatAzDateTime } from "../shared/az-date.js";

export type TimestampUnit = "seconds" | "milliseconds";

/*
 * A ten-digit second count reaches the year 2286 (9 999 999 999 s); a second
 * count will not carry an eleventh digit until the year 5138. A millisecond
 * count for "now" already carries thirteen. So any integer of eleven digits
 * or more is unambiguously milliseconds in every year anyone reading this
 * page will be alive for — the threshold needs no calendar lookup, only a
 * digit count.
 */
const SECONDS_MAX_DIGITS = 10;

const INTEGER_PATTERN = /^-?\d+$/;

export type TimestampParseResult =
  | { ok: true; ms: number; unit: TimestampUnit; digits: number }
  | { ok: false; error: string };

/** Parses a pasted Unix timestamp and guesses its unit from its digit count. */
export function parseTimestamp(raw: string): TimestampParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə, Unix vaxt möhürünü yaz." };
  }
  if (!INTEGER_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "Yalnız tam ədəd qəbul olunur: onluq nöqtə, hərf və boşluq olmadan.",
    };
  }

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return {
      ok: false,
      error: "Ədəd JavaScript-in təhlükəsiz tam ədəd sərhədini keçir (±2^53).",
    };
  }

  const digits = String(Math.abs(value)).length;
  const unit: TimestampUnit = digits <= SECONDS_MAX_DIGITS ? "seconds" : "milliseconds";
  const ms = unit === "seconds" ? value * 1000 : value;

  if (Number.isNaN(new Date(ms).getTime())) {
    return { ok: false, error: "Bu ədəddən etibarlı tarix qurmaq mümkün olmadı." };
  }

  return { ok: true, ms, unit, digits };
}

export type TimestampBreakdown = {
  date: Date;
  seconds: number;
  milliseconds: number;
  iso: string;
  utc: string;
  baku: string;
  weekday: string;
  dayOfYear: number;
  daysInYear: number;
};

/** UTC+4, fixed — Azerbaijan has kept no daylight-saving shift since 2016. */
const BAKU_OFFSET_MINUTES = 4 * 60;

/*
 * `az-date.ts`'s formatters read a Date's LOCAL getters, because they were
 * built for values already sitting in the visitor's own zone — a token's
 * expiry, a cron run. This tool needs two zones nobody's runtime is actually
 * in: UTC and fixed Baku. Adding the runtime's own offset back cancels
 * whatever zone Node or the browser happens to be configured for; adding the
 * target zone's offset on top then makes that zone's wall-clock fields
 * readable through the same local getters, as if they were local. The result
 * is the same rendered string wherever this runs — which is what keeps the
 * server-rendered page and the hydrated one identical without a client-only
 * gate, since the only true input to this function is the number the visitor
 * already typed.
 */
function asZoneLocal(date: Date, zoneOffsetMinutes: number): Date {
  return new Date(date.getTime() + (date.getTimezoneOffset() + zoneOffsetMinutes) * 60_000);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 1 for 1 January, 365 or 366 for 31 December — counted in UTC so the answer does not depend on the visitor's own zone. */
function dayOfYearUtc(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const startOfDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((startOfDay - startOfYear) / 86_400_000) + 1;
}

export function describeTimestamp(ms: number): TimestampBreakdown {
  const date = new Date(ms);
  return {
    date,
    seconds: Math.floor(ms / 1000),
    milliseconds: ms,
    iso: date.toISOString(),
    utc: formatAzDateTime(asZoneLocal(date, 0)),
    baku: formatAzDateTime(asZoneLocal(date, BAKU_OFFSET_MINUTES)),
    // `getUTCDay()` picks the index; `AZ_WEEKDAYS` itself is `az-date.ts`'s
    // table, indexed the same way regardless of which getter supplied it.
    weekday: AZ_WEEKDAYS[date.getUTCDay()],
    dayOfYear: dayOfYearUtc(date),
    daysInYear: isLeapYear(date.getUTCFullYear()) ? 366 : 365,
  };
}

export type Zone = "utc" | "baku";

type DateTimeParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

// What an <input type="datetime-local"> sends: seconds are present only when
// the step attribute asks for them, so the group is optional.
const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseLocalDateTimeInput(value: string): DateTimeParts | null {
  const match = LOCAL_DATETIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: second ? Number(second) : 0,
  };
}

export type TimestampFromDateResult = { ok: true; ms: number } | { ok: false; error: string };

/**
 * Builds a Unix timestamp from wall-clock fields, read as either UTC or fixed
 * Baku time. `Date.UTC` never rejects an out-of-range field — 30 fevral rolls
 * silently into 2 mart, and 29 fevral outside a leap year rolls into 1 mart —
 * so the only way to catch that a visitor typed a date that does not exist is
 * to read every field back off the result and compare it to what was typed.
 */
export function timestampFromLocalInput(value: string, zone: Zone): TimestampFromDateResult {
  const parts = parseLocalDateTimeInput(value);
  if (!parts) {
    return {
      ok: false,
      error: "Tarix formatı tanınmadı, gözlənilən forma: YYYY-AA-GGTSS:DD.",
    };
  }

  const naiveUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const check = new Date(naiveUtcMs);
  const roundTripped =
    check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() === parts.month - 1 &&
    check.getUTCDate() === parts.day &&
    check.getUTCHours() === parts.hour &&
    check.getUTCMinutes() === parts.minute &&
    check.getUTCSeconds() === parts.second;

  if (!roundTripped) {
    return {
      ok: false,
      error: "Bu tarix mövcud deyil: məsələn, sıçrayış ili olmayan ildə 29 fevral.",
    };
  }

  const offsetMs = zone === "baku" ? BAKU_OFFSET_MINUTES * 60_000 : 0;
  return { ok: true, ms: naiveUtcMs - offsetMs };
}

/** The one thing the "now" button needs — kept here so the widget calls into this file rather than reading the clock itself. */
export function nowTimestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
