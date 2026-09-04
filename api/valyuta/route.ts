/*
 * Serves the two currency tables this tool needs, each in one shot: the whole
 * official AZN bulletin for the "cbar" mode, and the whole USD-pivoted world
 * table for the "world" mode. Neither mode takes a currency pair or an amount
 * as a request parameter — every conversion between the currencies in either
 * table is arithmetic `lib/tools/valyuta.ts` already does in the browser, so
 * fetching the table once covers every pair a visitor might pick from it.
 * That is also why there is nothing here shaped like the usual "validate the
 * string before it reaches a URL" guard: the only visitor-supplied value is
 * `mode`, checked against a fixed pair of literals, and neither upstream URL
 * has anything else built into it.
 */
import { fail, guard, ok, upstream } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildUsdRateTable, cbarRetryDates, formatCbarDate, parseCbarXml } from "../../lib/valyuta";

/* The bank publishes once a day; Frankfurter's own data updates on banking days too — an hour keeps both fresh within a session without asking again on every render. */
const CBAR_CACHE_TTL_MS = 60 * 60_000;
const WORLD_CACHE_TTL_MS = 60 * 60_000;

/* How many days back the retry walks when the bank's server does not answer
   for "today" at all. Sized for the longest realistic run of closed days —
   a public holiday landing next to a weekend — not for the ordinary case,
   which the bank's own fallback already resolves inside a single request. */
const CBAR_MAX_RETRY_DAYS = 6;

type CbarData = { date: string; rates: unknown };
type WorldData = { date: string; usdRates: Record<string, number> };
type LoadOutcome<T> = { ok: true; data: T } | { ok: false; message: string };

async function loadCbarBulletin(): Promise<LoadOutcome<CbarData>> {
  const today = new Date();
  const attempts = cbarRetryDates(today, CBAR_MAX_RETRY_DAYS);

  let lastFailure: string | null = null;
  for (const day of attempts) {
    const response = await upstream(
      `https://www.cbar.az/currencies/${formatCbarDate(day)}.xml`,
    );
    if (!response.ok) {
      lastFailure = `CBAR ${response.reason === "timeout" ? "vaxtında cavab vermədi" : "ilə əlaqə qurulmadı"}.`;
      continue;
    }

    try {
      const bulletin = parseCbarXml(response.text);
      return { ok: true, data: { date: bulletin.date, rates: bulletin.rates } };
    } catch (error) {
      // A parse failure on one day's file is worth trying the previous day
      // for — the file format does not change, but a transient truncated
      // response would otherwise look identical to a real parse bug.
      console.warn(`valyuta: could not parse CBAR bulletin for ${formatCbarDate(day)}`, error);
      lastFailure = "CBAR bülleteni gözlənilməz formatda gəldi.";
    }
  }

  return { ok: false, message: lastFailure ?? "CBAR bülleteni tapılmadı." };
}

async function loadWorldTable(): Promise<LoadOutcome<WorldData>> {
  const response = await upstream("https://api.frankfurter.dev/v1/latest?base=USD");
  if (!response.ok) {
    return {
      ok: false,
      message:
        response.reason === "timeout"
          ? "Frankfurter vaxtında cavab vermədi. Bir azdan yenidən yoxla."
          : "Frankfurter ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.",
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch (error) {
    console.error("valyuta: could not parse Frankfurter body", error);
    return { ok: false, message: "Frankfurter gözlənilməz formatda cavab verdi." };
  }

  const date = typeof (json as { date?: unknown }).date === "string" ? (json as { date: string }).date : "";
  return { ok: true, data: { date, usdRates: buildUsdRateTable(json) } };
}

export async function GET(request: Request) {
  const refused = guard(request, "valyuta");
  if (refused) return refused;

  const mode = new URL(request.url).searchParams.get("mode");
  if (mode !== "cbar" && mode !== "world") {
    return fail("mode 'cbar' və ya 'world' olmalıdır.");
  }

  const outcome =
    mode === "cbar"
      ? await cached("valyuta:cbar", CBAR_CACHE_TTL_MS, loadCbarBulletin)
      : await cached("valyuta:world", WORLD_CACHE_TTL_MS, loadWorldTable);

  if (!outcome.ok) return fail(outcome.message);
  return ok(outcome.data);
}
