/*
 * What every network tool's endpoint does before and after the interesting part.
 *
 * These routes are the only place on the site where a stranger's input decides
 * which outside address the server calls. That is a door worth building once
 * and carefully: unguarded, each of them is an open proxy — somebody else's
 * scanner wearing this server's address, and this server's reputation.
 *
 * So the guard, the timeout and the shape of the answer live here rather than
 * being retyped per tool, and a route that forgets to call `guard` is a route
 * that does not compile against this module's own convention.
 */
import { callerAddress, takeBurst, tooSoon } from "../shared/rate-limit";

/** Generous enough to be usable, small enough that a scan is not worth running. */
const BURST_LIMIT = 20;
const BURST_WINDOW_MS = 60_000;

/** Longer than any of these services needs, shorter than a visitor will wait. */
const UPSTREAM_TIMEOUT_MS = 8_000;

/*
 * Named honestly. Every service reached from here is free and public, and the
 * courteous thing — several of them ask for it outright — is to be identifiable
 * so an operator with a problem has somebody to write to.
 */
const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

/**
 * Refuses the caller if they are asking too fast, and says nothing otherwise.
 *
 * `scope` separates the tools, so somebody looking up DNS records does not use
 * up their turns on the package viewer.
 */
export function guard(request: Request, scope: string): Response | null {
  const verdict = takeBurst(`alet:${scope}`, callerAddress(request), BURST_LIMIT, BURST_WINDOW_MS);
  return verdict.ok ? null : tooSoon(verdict.retryAfter);
}

/** The answer a tool sends when the work succeeded. */
export function ok(data: unknown): Response {
  return Response.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
}

/**
 * The answer a tool sends when it did not.
 *
 * The message is Azerbaijani and is shown to the visitor as written, so it says
 * what happened rather than which exception was thrown — an upstream's own
 * error text is not something a stranger should be reading off this site.
 */
export function fail(message: string, status = 400): Response {
  return Response.json({ ok: false, message }, { status, headers: { "cache-control": "no-store" } });
}

export type Fetched =
  | { ok: true; status: number; text: string; headers: Headers }
  | { ok: false; reason: "timeout" | "network" | "status"; status: number };

/**
 * Calls an outside service with a deadline.
 *
 * Never throws: a tool page turning into a stack trace because a certificate
 * log was slow is a worse outcome than a tool that says it could not reach it.
 * A non-2xx answer still comes back as `ok: false` with the status, because the
 * difference between "not found" and "rate limited" is something the tool
 * usually wants to tell the visitor apart.
 */
export async function upstream(url: string, init?: RequestInit): Promise<Fetched> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: control.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    });

    const text = await response.text();
    if (!response.ok) return { ok: false, reason: "status", status: response.status };
    return { ok: true, status: response.status, text, headers: response.headers };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "network", status: 0 };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * The one sentence a tool shows when the outside service did not answer.
 *
 * Written from the visitor's side: they did nothing wrong, the tool is not
 * broken forever, and trying again is a reasonable next move.
 */
export function upstreamMessage(service: string, result: Extract<Fetched, { ok: false }>): string {
  if (result.reason === "timeout") return `${service} vaxtında cavab vermədi. Bir azdan yenidən yoxla.`;
  if (result.reason === "network") return `${service} ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.`;
  if (result.status === 429) return `${service} çox sorğu aldı və bizi bir müddət gözlədir.`;
  if (result.status === 404) return `${service} belə bir qeyd tapmadı.`;
  return `${service} gözlənilməz cavab verdi (${result.status}).`;
}
