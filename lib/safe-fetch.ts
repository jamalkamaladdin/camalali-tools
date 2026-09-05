/*
 * Fetching an address a stranger chose, on the server, without becoming their
 * scanner.
 *
 * `api-route.ts` already has `upstream()`, but that one is for the handful of
 * services this site picked itself — it follows redirects and reads the whole
 * body, which are exactly the two things you must not do with an address a
 * visitor typed. So the tools that take a URL from the form field come here
 * instead, and the difference between the two modules is the difference
 * between "we chose this host" and "somebody else did".
 *
 * Four rules, all of them enforced below rather than remembered per tool:
 *
 *   1. http and https only, on ports 80 and 443 only. `normalizeTargetUrl`
 *      does this, so `file:`, `gopher:` and a port sweep are gone before
 *      anything is resolved.
 *   2. The host name is resolved first and EVERY address it answers with must
 *      be public. One private answer refuses the whole request, because a name
 *      with two A records only needs one of them to point inward.
 *   3. Redirects are never followed by `fetch`. `redirect: "manual"` means a
 *      302 to http://127.0.0.1/ comes back as a 302, not as a request this
 *      server makes. `followRedirects` walks a chain deliberately, and it
 *      re-runs rules 1 and 2 on every single hop — which is why walking the
 *      chain is safe and letting `fetch` walk it is not.
 *   4. The body is read through a reader with a byte budget and the stream is
 *      cut the moment the budget is spent. A stranger's server does not get to
 *      decide how much of this process's memory it uses.
 *
 * What is left is the DNS rebinding window: the name could resolve to a public
 * address for the check and to a private one for the connection microseconds
 * later. Closing that needs a connection pinned to the checked IP, which means
 * driving TLS by hand and losing SNI and certificate validation with it. The
 * tools take the narrower risk instead, and this comment is the record of that
 * choice rather than an oversight.
 *
 * Node only — `node:dns` is the whole point of the module.
 */
import { lookup } from "node:dns/promises";

import { isBlockedAddress, normalizeTargetUrl } from "./safe-url.js";

/** Longer than any reachable site needs, shorter than a visitor will wait. */
const FETCH_TIMEOUT_MS = 8_000;

/** Half a megabyte is more markup than any page these tools read has. */
const DEFAULT_MAX_BYTES = 512 * 1024;

/** More hops than any honest site uses; past this it is a loop or a trap. */
const DEFAULT_MAX_HOPS = 10;

/*
 * Named honestly so an operator who sees it in their log knows who called, and
 * has somebody to write to if they would rather this site did not.
 */
const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

/**
 * Why the fetch did not happen, in a sentence the visitor is shown as written.
 *
 * 400 is the visitor's input being wrong; 502 is the far end failing. The two
 * read very differently to anybody watching the network tab, so an upstream's
 * own error text never appears here — only sentences this site wrote.
 */
export type SafeFail = { ok: false; message: string; status: 400 | 502 };

export type SafeText = {
  ok: true;
  url: string;
  status: number;
  /** Set when the server answered with a redirect instead of the page. */
  redirectedTo: string | null;
  /** Every header the server sent, in the order it sent them. */
  headers: [string, string][];
  text: string;
  /** True when the body was longer than the budget and was cut. */
  truncated: boolean;
};

/**
 * Resolves the host and refuses anything that is not on the public internet.
 *
 * Fails closed: a name that does not resolve, or resolves to an address this
 * code cannot parse, is refused rather than tried. Returns the refusal
 * sentence, or null when the host is allowed.
 */
export async function publicAddressesOnly(hostname: string): Promise<string | null> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return "Bu host adı IP ünvanına həll olunmur: domen adını yoxla.";
  }

  if (addresses.length === 0) return "Bu host adı heç bir IP ünvanı qaytarmadı.";

  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    return "Bu ünvan daxili və ya ayrılmış şəbəkəyə işarə edir. Alət yalnız internetdə açıq olan saytları yoxlayır.";
  }

  return null;
}

/**
 * Runs rules 1 and 2 over one address.
 *
 * Every hop of every chain goes through here, not just the address the visitor
 * typed, because the second link is the one an attacker controls.
 */
async function checkedTarget(
  url: string,
): Promise<{ ok: true; url: string; hostname: string } | SafeFail> {
  const target = normalizeTargetUrl(url);
  if (!target.ok) return { ok: false, message: target.error, status: 400 };

  const blocked = await publicAddressesOnly(target.hostname);
  if (blocked) return { ok: false, message: blocked, status: 400 };

  return { ok: true, url: target.url, hostname: target.hostname };
}

/** The one sentence shown when the far end did not answer. */
function unreachable(error: unknown): SafeFail {
  const aborted = error instanceof Error && error.name === "AbortError";
  return {
    ok: false,
    status: 502,
    message: aborted
      ? "Sayt 8 saniyə ərzində cavab vermədi."
      : "Saytla əlaqə qurulmadı: ünvan işləyirmi, yoxla.",
  };
}

/** One request, with a deadline, never following a redirect itself. */
async function callOnce(
  url: string,
  method: "GET" | "HEAD",
  accept: string,
): Promise<{ ok: true; response: Response } | SafeFail> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      signal: control.signal,
      /* Rule 3. Also the reason a 3xx is reported rather than chased. */
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept },
    });
    return { ok: true, response };
  } catch (error) {
    return unreachable(error);
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Reads at most `maxBytes` of a body and cuts the stream there.
 *
 * `response.text()` is not an option: it reads whatever the far end sends, and
 * the far end is a stranger. The decoder runs in streaming mode so a character
 * split across two chunks — or across the cut itself — comes out as one
 * character rather than as two halves of a mangled one.
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const body = response.body;
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let read = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const room = maxBytes - read;
      if (value.byteLength >= room) {
        text += decoder.decode(value.subarray(0, room), { stream: true });
        read = maxBytes;
        if (value.byteLength > room) {
          truncated = true;
        } else {
          /* The budget landed exactly on a chunk boundary, which says nothing
             about whether more was coming. One more read answers it honestly
             instead of guessing. */
          const peek = await reader.read();
          truncated = !peek.done;
        }
        break;
      }

      text += decoder.decode(value, { stream: true });
      read += value.byteLength;
    }
  } catch {
    /* A stream that dies halfway still has a usable prefix, and the caller has
       already been told how much it got. Losing the prefix would be worse. */
    truncated = true;
  } finally {
    text += decoder.decode();
    await reader.cancel().catch(() => undefined);
  }

  return { text, truncated };
}

/**
 * Fetches an address a stranger chose and hands back a bounded amount of it.
 *
 * Redirects are reported, not followed: `redirectedTo` carries where the site
 * wanted to send us so the caller can show it, and `followRedirects` is there
 * for the callers that want the whole chain.
 */
export async function fetchPublicText(
  url: string,
  opts?: { maxBytes?: number; accept?: string; method?: "GET" | "HEAD" },
): Promise<SafeText | SafeFail> {
  const maxBytes = Math.max(0, opts?.maxBytes ?? DEFAULT_MAX_BYTES);
  const accept = opts?.accept ?? "*/*";
  const method = opts?.method ?? "GET";

  const target = await checkedTarget(url);
  if (!target.ok) return target;

  const called = await callOnce(target.url, method, accept);
  if (!called.ok) return called;

  const { response } = called;

  const location = response.headers.get("location");
  const redirectedTo =
    response.status >= 300 && response.status < 400 && location
      ? absolute(location, target.url)
      : null;

  let body = { text: "", truncated: false };
  if (method === "HEAD" || maxBytes === 0) {
    /* Nothing was asked for, so nothing is read - and the socket is released
       rather than left for the garbage collector to notice. */
    await response.body?.cancel().catch(() => undefined);
  } else {
    body = await readCapped(response, maxBytes);
  }

  return {
    ok: true,
    url: target.url,
    status: response.status,
    redirectedTo,
    headers: [...response.headers.entries()],
    text: body.text,
    truncated: body.truncated,
  };
}

/** Resolves a `Location` value against the address it arrived on. */
function absolute(location: string, base: string): string | null {
  try {
    return new URL(location, base).toString();
  } catch {
    return null;
  }
}

export type Hop = { url: string; status: number; location: string | null };

/**
 * Walks a redirect chain one hop at a time, re-checking every address.
 *
 * This is the opposite of `redirect: "follow"`, not a relaxation of it. The
 * browser-style follow makes the second request without asking anybody, so a
 * public first address and a private second one is a single hop past the
 * fence. Here each hop goes back through `checkedTarget`, so the chain stops
 * at the first address the tools are not allowed to touch.
 *
 * `truncated` means the chain did not end on its own: either it exceeded
 * `maxHops` or it came back to an address it had already visited.
 */
export async function followRedirects(
  url: string,
  maxHops: number = DEFAULT_MAX_HOPS,
): Promise<
  | { ok: true; hops: Hop[]; finalUrl: string; finalStatus: number; truncated: boolean }
  | SafeFail
> {
  const limit = Math.max(1, maxHops);
  const hops: Hop[] = [];
  const seen = new Set<string>();

  let next: string | null = url;
  let truncated = false;

  while (next !== null) {
    if (hops.length >= limit) {
      truncated = true;
      break;
    }

    const target: { ok: true; url: string; hostname: string } | SafeFail =
      await checkedTarget(next);
    if (!target.ok) {
      /* The first address being refused is the visitor's typo; a later one is
         the chain trying to walk somewhere it is not allowed, and saying so
         plainly is more useful than a generic failure. */
      return hops.length === 0
        ? target
        : {
            ok: false,
            status: 400,
            message: `Yönləndirmə zənciri qəbul edilməyən ünvana çıxdı. ${target.message}`,
          };
    }

    if (seen.has(target.url)) {
      truncated = true;
      break;
    }
    seen.add(target.url);

    const called = await callOnce(target.url, "GET", "*/*");
    if (!called.ok) return called;

    /* Only the headers matter here, so the body is dropped unread. */
    await called.response.body?.cancel().catch(() => undefined);

    const status = called.response.status;
    const raw = called.response.headers.get("location");
    const location =
      status >= 300 && status < 400 && raw ? absolute(raw, target.url) : null;

    hops.push({ url: target.url, status, location });
    next = location;
  }

  /* `finalUrl` and `finalStatus` describe the same response on purpose: the
     last address actually fetched, not the one a truncated chain was pointing
     at next. A number that belongs to an address nobody visited is worse than
     no number. */
  const last = hops[hops.length - 1];
  return {
    ok: true,
    hops,
    finalUrl: last ? last.url : url,
    finalStatus: last ? last.status : 0,
    truncated,
  };
}
