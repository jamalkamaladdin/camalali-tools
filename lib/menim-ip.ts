/**
 * The arithmetic behind "what is my IP address, and what does this
 * connection reveal about me" — everything that has to be right without a
 * browser or a network in front of it.
 *
 * Three unrelated wire formats meet in this one file, and each earned its
 * place by having a sharp edge worth pinning down in a test:
 *
 *   - Team Cymru's ASN lookup answers a DNS TXT query with a pipe-separated
 *     line — `"15169 | 8.8.8.0/24 | US | arin | 1992-12-01"` — and the
 *     service does not pad short answers with empty fields, it just omits
 *     them. Reporting a missing trailing field as `""` would print a country
 *     column that reads as "known and blank" instead of "not given"; `null`
 *     is the honest value here, and `parseCymruOrigin` returns it.
 *   - The reversed query names (`d.c.b.a.origin.asn.cymru.com` for IPv4,
 *     the full nibble reversal for IPv6) are exactly the kind of
 *     off-by-one-hard-to-see string construction a wrong edit breaks
 *     silently, which is why both are built here — as pure string math on
 *     the bytes `parseIpv4`/`parseIpv6` already hand back — rather than
 *     inline in the route where nothing exercises them.
 *   - RDAP is JSON, and the shape a registry actually answers with never
 *     matches the shape the spec describes exactly: the organisation name
 *     sits inside an entity's `vcardArray`, a nested array-of-arrays format
 *     designed for vCard 4.0, not for RDAP. `extractRdapInfo` reads only the
 *     four fields this tool shows and returns `null` for whichever one a
 *     given registry's answer left out, rather than throwing on a record
 *     that is real but incomplete.
 *
 * The fourth export, `parseUserAgent`, is a different kind of parsing —
 * there is no spec for a `User-Agent` string, only conventions three
 * rendering engines each bent to their own history. It is deliberately
 * narrow: three token checks per field, and anything it does not recognise
 * comes back a `null` field rather than a guess dressed up as a browser
 * name — a wrong guess of "Chrome" is worse than an honest unknown result.
 */
import { parseIpv4, parseIpv6 } from "./safe-url";

/* ---------- Team Cymru: origin ASN lookup ---------- */

export type CymruOrigin = {
  /** The announcing AS. When a prefix has several origins Cymru lists them
   *  space-separated in the first field; only the first is kept here, since
   *  the tool reports one connection's one path, not every path that exists. */
  asn: number;
  /** The BGP prefix actually carrying this address, `null` when the answer
   *  did not include it. */
  prefix: string | null;
  country: string | null;
  registry: string | null;
  /** The date the prefix was allocated, as the registry wrote it — not
   *  reparsed into a `Date`, because the tool only ever displays it. */
  allocated: string | null;
};

export type CymruOriginResult =
  | { ok: true; origin: CymruOrigin }
  | { ok: false; error: string };

/**
 * Parses one line of Team Cymru's origin-ASN answer.
 *
 * The only field this refuses to guess at is the ASN itself: everything
 * past it is optional and reported as `null` when absent, but a first field
 * that is not a bare number means the answer is not the shape this tool
 * expects at all, and that is reported as an error rather than as an ASN of
 * `NaN`.
 */
export function parseCymruOrigin(txt: string): CymruOriginResult {
  const fields = txt.split("|").map((field) => field.trim());
  const firstToken = (fields[0] ?? "").split(/\s+/)[0] ?? "";

  if (!/^\d+$/.test(firstToken)) {
    return { ok: false, error: `Cymru cavabı gözlənilən formatda deyil: "${txt}"` };
  }

  return {
    ok: true,
    origin: {
      asn: Number(firstToken),
      prefix: fields[1] || null,
      country: fields[2] || null,
      registry: fields[3] || null,
      allocated: fields[4] || null,
    },
  };
}

/**
 * Parses Team Cymru's AS-name answer (`AS<n>.asn.cymru.com`), which is the
 * same pipe shape with the name in the fifth field —
 * `"15169 | US | arin | 2000-03-30 | GOOGLE, US"`. An absent or empty field
 * comes back `null`, never `""`, for the same reason as `parseCymruOrigin`.
 */
export function parseCymruAsName(txt: string): string | null {
  const fields = txt.split("|").map((field) => field.trim());
  const name = fields[4];
  return name && name !== "" ? name : null;
}

/** `d.c.b.a.origin.asn.cymru.com` for IPv4 `a.b.c.d` — the octets reversed,
 *  which is how every DNS-based ASN lookup addresses an IPv4 host. */
export function cymruIpv4QueryName(address: string): string | null {
  const value = parseIpv4(address);
  if (value === null) return null;

  const a = (value >>> 24) & 0xff;
  const b = (value >>> 16) & 0xff;
  const c = (value >>> 8) & 0xff;
  const d = value & 0xff;
  return `${d}.${c}.${b}.${a}.origin.asn.cymru.com`;
}

/**
 * The IPv6 counterpart: every nibble of the address, written out and
 * reversed — the same convention `ip6.arpa` uses, under `origin6.asn.cymru.com`
 * instead. Built from the 16 bytes `parseIpv6` returns rather than from the
 * visitor's own text, so `::` compression and mixed case never reach this
 * function at all.
 */
export function cymruIpv6QueryName(address: string): string | null {
  const bytes = parseIpv6(address);
  if (bytes === null) return null;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.split("").reverse().join(".")}.origin6.asn.cymru.com`;
}

/* ---------- RDAP ---------- */

export type RdapInfo = {
  networkName: string | null;
  handle: string | null;
  country: string | null;
  /** The registrant's organisation name, read out of the first entity that
   *  carries one — RDAP nests this inside a vCard, not as a plain field. */
  organisation: string | null;
};

/** Reads one named property out of an RDAP entity's `vcardArray`, which is
 *  `["vcard", [[name, params, type, value], ...]]` — an array of arrays,
 *  not an object, because that is the shape vCard 4.0 (RFC 6350) defines and
 *  RDAP (RFC 9083) carries verbatim. */
function vcardField(vcardArray: unknown, name: string): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return null;
  const entries = vcardArray[1];
  if (!Array.isArray(entries)) return null;

  for (const entry of entries) {
    if (Array.isArray(entry) && entry[0] === name && typeof entry[3] === "string") {
      return entry[3];
    }
  }
  return null;
}

/**
 * Pulls the four fields this tool shows out of an RDAP IP-network response.
 *
 * Every field is read defensively and independently: a registry that
 * answers with no `entities` array still has a network name and a country,
 * and a response that is not even an object comes back as four `null`s
 * rather than a thrown exception. Nothing here is invented — a field that is
 * not in the JSON is `null`, never a placeholder string.
 */
export function extractRdapInfo(json: unknown): RdapInfo {
  if (typeof json !== "object" || json === null) {
    return { networkName: null, handle: null, country: null, organisation: null };
  }

  const record = json as Record<string, unknown>;
  const networkName = typeof record.name === "string" ? record.name : null;
  const handle = typeof record.handle === "string" ? record.handle : null;
  const country = typeof record.country === "string" ? record.country : null;

  let organisation: string | null = null;
  const entities = record.entities;
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (typeof entity !== "object" || entity === null) continue;
      const fn = vcardField((entity as Record<string, unknown>).vcardArray, "fn");
      if (fn) {
        organisation = fn;
        break;
      }
    }
  }

  return { networkName, handle, country, organisation };
}

/* ---------- what the connection is reported through ---------- */

/**
 * The header `callerAddress` (in `shared/rate-limit`) actually read the
 * address from — reported so the visitor can tell "the site read a proxy
 * header" from "the site read the raw socket", which behind Cloudflare is
 * always the former.
 */
export type AddressSource = "cf-connecting-ip" | "x-forwarded-for" | "bilinmir";

export type MenimIpReport = {
  address: string;
  addressSource: AddressSource;
  asn: CymruOrigin | null;
  asnName: string | null;
  /** Set when the ASN lookup failed outright; `null` alongside a `null`
   *  `asn` is instead the honest "this address has no public route". */
  asnError: string | null;
  rdap: RdapInfo | null;
  rdapError: string | null;
  /** `null` with no error is a normal result: most addresses simply have no
   *  PTR record, or one that names an ISP rather than a person. */
  ptr: string[] | null;
  ptrError: string | null;
  checkedAt: string;
};

/* ---------- the browser's own reveal ---------- */

export type UserAgentInfo = {
  browser: string;
  engine: string;
  platform: string;
};

/** Returned when nothing in the string was recognised — every field carries
 *  the same visitor-facing "unknown" word this tool uses everywhere else. */
const UNKNOWN_UA: UserAgentInfo = { browser: "naməlum", engine: "naməlum", platform: "naməlum" };

/** Order matters: Edge and Opera both carry `Chrome/` and `Safari/` tokens
 *  in their own `User-Agent`, being Chromium themselves, so their own token
 *  has to be checked first or every Edge visitor reads as Chrome. */
function detectBrowserAndEngine(ua: string): { browser: string | null; engine: string | null } {
  if (/Edg\//.test(ua)) return { browser: "Edge", engine: "Blink" };
  if (/OPR\//.test(ua)) return { browser: "Opera", engine: "Blink" };
  if (/Firefox\//.test(ua)) return { browser: "Firefox", engine: "Gecko" };
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return { browser: "Chrome", engine: "Blink" };
  /* Safari's own UA carries both `Version/` (its own release number) and
     `Safari/` (the layout engine's build number); a Chromium browser never
     writes `Version/`, so this is the token that tells the two apart. */
  if (/Version\/[\d.]+.*Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    return { browser: "Safari", engine: "WebKit" };
  }
  return { browser: null, engine: null };
}

function detectPlatform(ua: string): string | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/**
 * Reads browser, engine and platform out of a `User-Agent` string.
 *
 * Every field a real UA does not carry a recognisable token for comes back
 * as the shared unknown sentinel rather than the nearest guess — a string
 * this narrow parser has never seen is exactly the case where a guess is
 * most likely wrong, and a confident wrong answer is worse here than an
 * honest unknown one.
 */
export function parseUserAgent(ua: string): UserAgentInfo {
  const trimmed = ua.trim();
  if (trimmed === "") return UNKNOWN_UA;

  const { browser, engine } = detectBrowserAndEngine(trimmed);
  const platform = detectPlatform(trimmed);

  if (browser === null && engine === null && platform === null) return UNKNOWN_UA;

  return {
    browser: browser ?? UNKNOWN_UA.browser,
    engine: engine ?? UNKNOWN_UA.engine,
    platform: platform ?? UNKNOWN_UA.platform,
  };
}

/**
 * `"UTC+04:00"` from `Date.prototype.getTimezoneOffset()`, which counts
 * minutes the local clock sits behind UTC — the sign JavaScript chose is the
 * opposite of the one the label needs, so a zone four hours ahead of UTC
 * reports `-240` and this function flips it before formatting.
 */
export function formatUtcOffset(getTimezoneOffsetMinutes: number): string {
  const totalMinutes = -getTimezoneOffsetMinutes;
  const sign = totalMinutes < 0 ? "-" : "+";
  const absMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}
