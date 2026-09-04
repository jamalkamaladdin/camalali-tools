import { azLongDate } from "../../shared/az-date";
import { dateToIso, isoAddDays, isoToDate } from "../../shared/invoice/dates";

/*
 * The invoice carries its dates as `yyyy-mm-dd` strings, because that is what
 * an `<input type="date">` reads and writes and what the PDF builder expects.
 *
 * The arithmetic itself moved to `lib/invoice/dates.ts` — the due-date rule it
 * now also holds is printed on the document, so it has to be provable by
 * `pnpm verify:tools`. What stays here is the one thing that is presentation:
 * the month name comes from `az-date.ts` because `Intl` has no `az` data in
 * every browser and quietly prints "M09" for the month.
 */

/** "2026-09-01" → "1 sentyabr 2026". An empty or broken date reads as a dash. */
export function formatAzDate(iso: string): string {
  const date = isoToDate(iso);
  if (!date) return iso.trim() || "—";
  return azLongDate(date);
}

/** Today as yyyy-mm-dd in local time — an invoice is dated where it is written. */
export function todayIso(): string {
  return dateToIso(new Date());
}

/** Adds days to a yyyy-mm-dd string, staying on the local calendar. */
export const addDays = isoAddDays;
