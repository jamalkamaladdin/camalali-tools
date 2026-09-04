/**
 * URL encoding, parsing and query-string editing — three views of one string,
 * kept in one file because the bugs this tool exists to catch are exactly the
 * mismatches between them: pasting a whole URL into an `encodeURIComponent`
 * field, or reading a form-submitted `+` as a literal plus sign.
 */

export type EncodingStyle = "component" | "uri" | "form";

/**
 * `encodeURIComponent` escapes everything except `A-Z a-z 0-9 - _ . ! ~ * ' ( )`
 * — correct for a single query value or path segment, and wrong for a whole
 * URL, because it also escapes `/`, `:` and `?` and so breaks the very
 * structure it is applied to. `encodeURI` leaves those structural characters
 * alone and is the one meant for a complete URL. Form encoding
 * (`application/x-www-form-urlencoded`, what an HTML `<form>` sends and what
 * `URLSearchParams` produces) escapes a space as `+` rather than `%20` — the
 * one difference that corrupts data silently if a query string built by hand
 * is decoded with the wrong assumption.
 */
export function encodeWithStyle(text: string, style: EncodingStyle): string {
  if (style === "uri") return encodeURI(text);
  if (style === "form") return encodeURIComponent(text).replace(/%20/g, "+");
  return encodeURIComponent(text);
}

export type DecodeOutcome = { ok: true; text: string } | { ok: false; error: string };

export function decodeWithStyle(text: string, style: EncodingStyle): DecodeOutcome {
  try {
    if (style === "form") {
      // A literal `+` means space only under form encoding; encodeURI and
      // encodeURIComponent never produce one on their own, so decoding a `+`
      // as space under those two styles would corrupt a value that legitimately
      // contains the character.
      return { ok: true, text: decodeURIComponent(text.replace(/\+/g, " ")) };
    }
    return { ok: true, text: style === "uri" ? decodeURI(text) : decodeURIComponent(text) };
  } catch {
    return {
      ok: false,
      error: "Yanlış faiz-kodlaşdırma ardıcıllığı: % işarəsindən sonra iki onaltılıq rəqəm gözlənilir.",
    };
  }
}

/*
 * Punycode (RFC 3492) decode only — encoding a Unicode hostname to ASCII is
 * already done for us the moment `new URL(...)` accepts one, since the
 * platform's own IDNA implementation runs inside that constructor. There is
 * no equivalent built-in for the reverse direction in a browser, so turning
 * `xn--e1aybc` back into `тест` for display has to be this file's own work.
 * Ported from the generalised variable-length integer scheme in the RFC —
 * this is the whole algorithm, not an approximation of it, and it is checked
 * against the RFC's own worked examples in the test suite.
 */
const PUNYCODE_BASE = 36;
const PUNYCODE_T_MIN = 1;
const PUNYCODE_T_MAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 0x80;
const PUNYCODE_DELIMITER = "-";

function punycodeAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : Math.floor(delta / 2);
  d += Math.floor(d / numPoints);

  let k = 0;
  const threshold = Math.floor(((PUNYCODE_BASE - PUNYCODE_T_MIN) * PUNYCODE_T_MAX) / 2);
  while (d > threshold) {
    d = Math.floor(d / (PUNYCODE_BASE - PUNYCODE_T_MIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_T_MIN + 1) * d) / (d + PUNYCODE_SKEW));
}

/** `0-9` -> 26-35, `A-Z`/`a-z` -> 0-25, anything else is not a punycode digit. */
function punycodeBasicToDigit(codePoint: number): number {
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x30 + 26;
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41;
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61;
  return -1;
}

/**
 * Decodes one label's payload — the part after the `xn--` prefix a caller has
 * already stripped. Returns `null` on any malformed input rather than
 * throwing, because a hostname label that merely looks like punycode (starts
 * with `xn--` but is not valid ACE) must fall back to being shown as-is.
 */
function decodePunycodeLabel(input: string): string | null {
  let n = PUNYCODE_INITIAL_N;
  let i = 0;
  let bias = PUNYCODE_INITIAL_BIAS;
  const output: number[] = [];

  const lastDelimiter = input.lastIndexOf(PUNYCODE_DELIMITER);
  if (lastDelimiter >= 0) {
    for (let j = 0; j < lastDelimiter; j++) {
      const code = input.codePointAt(j) ?? -1;
      if (code >= 0x80) return null; // the basic-code-point part must be ASCII
      output.push(code);
    }
  }

  let index = lastDelimiter >= 0 ? lastDelimiter + 1 : 0;
  const inputLength = input.length;

  while (index < inputLength) {
    const oldI = i;
    let weight = 1;
    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      if (index >= inputLength) return null;
      const digit = punycodeBasicToDigit(input.codePointAt(index) ?? -1);
      index++;
      if (digit === -1) return null;
      if (digit > Math.floor((Number.MAX_SAFE_INTEGER - i) / weight)) return null; // guards a hostile or corrupt label instead of wrapping into a wrong code point
      i += digit * weight;
      const threshold =
        k <= bias ? PUNYCODE_T_MIN : k >= bias + PUNYCODE_T_MAX ? PUNYCODE_T_MAX : k - bias;
      if (digit < threshold) break;
      weight *= PUNYCODE_BASE - threshold;
    }
    const outLength = output.length + 1;
    bias = punycodeAdapt(i - oldI, outLength, oldI === 0);
    n += Math.floor(i / outLength);
    i %= outLength;
    output.splice(i, 0, n);
    i++;
  }

  return String.fromCodePoint(...output);
}

const PUNYCODE_PREFIX = "xn--";

/**
 * Decodes every punycode label of a hostname independently, so one malformed
 * label (hand-typed, truncated) does not hide the readable ones next to it.
 */
export function decodeHostname(hostname: string): string {
  return hostname
    .split(".")
    .map((label) => {
      if (!label.toLowerCase().startsWith(PUNYCODE_PREFIX)) return label;
      return decodePunycodeLabel(label.slice(PUNYCODE_PREFIX.length)) ?? label;
    })
    .join(".");
}

export type ParsedUrl =
  | {
      ok: true;
      href: string;
      protocol: string;
      username: string;
      password: string;
      hostname: string;
      /** `null` when the hostname has no `xn--` label, or none of them decode. */
      hostnameUnicode: string | null;
      port: string;
      pathname: string;
      search: string;
      searchParams: [string, string][];
      hash: string;
    }
  | { ok: false; error: string };

export function parseUrl(raw: string): ParsedUrl {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə: URL yapışdır." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "Bu düzgün mütləq URL deyil: sxem daxil olmalıdır (https://, mailto: və s.).",
    };
  }

  const hostnameUnicode = decodeHostname(url.hostname);

  return {
    ok: true,
    href: url.href,
    protocol: url.protocol,
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    hostnameUnicode: hostnameUnicode === url.hostname ? null : hostnameUnicode,
    port: url.port,
    pathname: url.pathname,
    // `URLSearchParams.entries()` already applies the +-means-space and
    // percent-decoding rules a query string is written under, so the pairs
    // shown in the table are the decoded values, not the raw wire form.
    search: url.search,
    searchParams: [...url.searchParams.entries()],
    hash: url.hash,
  };
}

/**
 * Rebuilds `href`'s query string from an edited key/value table. A row edited
 * down to an empty key is dropped rather than emitted as `?=value` — that is
 * the one row shape a table with a delete button never needs a separate
 * control for.
 */
export function rebuildUrlWithParams(href: string, pairs: [string, string][]): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const params = new URLSearchParams();
  for (const [key, value] of pairs) {
    if (key === "") continue;
    params.append(key, value);
  }
  url.search = params.toString();
  return url.href;
}
