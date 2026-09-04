/*
 * Which addresses this server is allowed to be pointed at, decided before any
 * socket is opened.
 *
 * Every tool that fetches an address a stranger typed has the same shape of
 * hole underneath it: left unguarded it turns this site into a scanner for
 * whatever sits on the private side of the server's network — 127.0.0.1, the
 * container next door, and 169.254.169.254, the cloud metadata service that
 * answers without any authentication at all.
 *
 * The rules live here, as pure functions with no network and no Node imports,
 * for two reasons. A guard that cannot be tested offline is a guard nobody can
 * prove; and a guard each tool re-implements is a guard that is right in four
 * places and wrong in the fifth.
 */

/** The only two schemes a fetch from this site makes sense for. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/*
 * Only the two default web ports.
 *
 * The address ranges below already keep the request on the public internet, so
 * this is the second half of the same fence: without it the endpoint answers
 * "which ports are open on this public host" for anybody who asks, one request
 * at a time, and that is a scanner however politely it is phrased.
 */
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** The longest address the tools will even try to parse. */
const MAX_URL_LENGTH = 2000;

export type UrlCheck =
  | { ok: true; url: string; hostname: string; protocol: "http:" | "https:" }
  | { ok: false; error: string };

/**
 * Turns what the visitor typed into an absolute http(s) URL, or refuses it.
 *
 * Refusal is the interesting direction: everything this returns is going to be
 * handed to `fetch` on the server, so anything questionable is rejected rather
 * than repaired.
 */
export function normalizeTargetUrl(raw: string): UrlCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə: ünvan yaz." };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: "Ünvan həddindən uzundur (2000 simvoldan çox)." };
  }

  /* A scheme-less paste is the common case and it means https, not http: the
     bare guess used to be http and that quietly graded every site on its
     redirect response instead of on the real site. */
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "Ünvan oxunmadı: «https://example.com» formatında yaz." };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      error: `«${parsed.protocol.replace(":", "")}» sxemi qəbul edilmir: yalnız http və https yoxlanılır.`,
    };
  }

  /* Credentials in the address would be sent to the target as a header the
     tool then prints back to the visitor. Nothing good comes of carrying them. */
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, error: "Ünvanda istifadəçi adı və ya parol var: onları çıxarıb yenidən yoxla." };
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    return {
      ok: false,
      error: `${parsed.port} portu yoxlanmır: yalnız standart 80 və 443 portları açıqdır.`,
    };
  }

  if (parsed.hostname === "") {
    return { ok: false, error: "Ünvanda host adı yoxdur." };
  }

  /* The fragment never leaves the browser and the tool would only echo it back
     into the result, so it is dropped here rather than carried around. */
  parsed.hash = "";

  return {
    ok: true,
    url: parsed.toString(),
    hostname: parsed.hostname,
    protocol: parsed.protocol as "http:" | "https:",
  };
}

/** Parses dotted-quad IPv4 into a 32-bit number, or null when it is not one. */
export function parseIpv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    /* Leading zeros are rejected rather than parsed: `010.0.0.1` is read as
       octal by some resolvers and as decimal by others, and an address two
       layers disagree about is exactly the input an SSRF filter is bypassed
       with. */
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** Parses IPv6 (including `::` compression and a trailing IPv4 tail) into 16 bytes. */
export function parseIpv6(text: string): Uint8Array | null {
  let value = text.trim();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  /* A zone index (`fe80::1%eth0`) names an interface, not an address. */
  const percent = value.indexOf("%");
  if (percent !== -1) value = value.slice(0, percent);
  if (!value.includes(":")) return null;

  const doubleColon = value.indexOf("::");
  if (doubleColon !== value.lastIndexOf("::")) return null;

  const [headText, tailText] =
    doubleColon === -1
      ? [value, null]
      : [value.slice(0, doubleColon), value.slice(doubleColon + 2)];

  const groups: number[] = [];
  const pushGroups = (part: string, into: number[]): boolean => {
    if (part === "") return true;
    for (const piece of part.split(":")) {
      /* The last group may be written as dotted IPv4, which is how a mapped
         address such as `::ffff:127.0.0.1` reaches here. */
      if (piece.includes(".")) {
        const four = parseIpv4(piece);
        if (four === null) return false;
        into.push((four >>> 16) & 0xffff, four & 0xffff);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(piece)) return false;
      into.push(Number.parseInt(piece, 16));
    }
    return true;
  };

  const head: number[] = [];
  const tail: number[] = [];
  if (!pushGroups(headText, head)) return null;
  if (tailText !== null && !pushGroups(tailText, tail)) return null;

  if (doubleColon === -1) {
    if (head.length !== 8) return null;
    groups.push(...head);
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups.push(...head, ...Array<number>(missing).fill(0), ...tail);
  }

  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = (group >> 8) & 0xff;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

/*
 * IPv4 blocks the server must never be pointed at. Loopback and the three
 * RFC 1918 private ranges are the obvious ones; 169.254.0.0/16 is the one that
 * actually gets exploited, because 169.254.169.254 is the metadata service on
 * every major cloud and it answers without authentication.
 */
const BLOCKED_IPV4: [string, number][] = [
  ["0.0.0.0", 8], // "this network" - and 0.0.0.0 itself routes to localhost
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // RFC 6598 carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including the cloud metadata address
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and 255.255.255.255 broadcast with it
];

/**
 * True when the address belongs to a range the tools refuse to fetch.
 *
 * Anything unparseable is blocked too, and that direction is deliberate: an
 * address this function does not understand is an address it cannot vouch for.
 */
export function isBlockedAddress(address: string): boolean {
  const four = parseIpv4(address);
  if (four !== null) {
    return BLOCKED_IPV4.some(([base, bits]) => {
      const network = parseIpv4(base);
      if (network === null) return false;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (four & mask) >>> 0 === (network & mask) >>> 0;
    });
  }

  const six = parseIpv6(address);
  if (six === null) return true;

  /* An IPv4-mapped address (::ffff:a.b.c.d) is an IPv4 destination wearing
     IPv6 syntax, so it is judged by the IPv4 rules - otherwise ::ffff:127.0.0.1
     walks straight past this whole list. */
  const mappedPrefix = six.slice(0, 10).every((byte) => byte === 0) && six[10] === 0xff && six[11] === 0xff;
  if (mappedPrefix) {
    return isBlockedAddress(`${six[12]}.${six[13]}.${six[14]}.${six[15]}`);
  }

  const allZero = six.every((byte) => byte === 0);
  if (allZero) return true; // ::
  if (six.slice(0, 15).every((byte) => byte === 0) && six[15] === 1) return true; // ::1
  if ((six[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (six[0] === 0xfe && (six[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (six[0] === 0xff) return true; // ff00::/8 multicast

  return false;
}
