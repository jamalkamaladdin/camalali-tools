/*
 * Raw TCP and TLS, for the three questions `fetch` cannot answer.
 *
 * Every other network tool on this site is built on `safe-fetch`, and that is
 * the right default: it speaks HTTP, it enforces a byte budget and it re-checks
 * the address on every redirect hop. But three things a visitor asks about are
 * below HTTP and invisible from inside it —
 *
 *   - which certificate the far end presents, and when it expires;
 *   - which TLS versions it will still negotiate;
 *   - where the wait actually goes: name lookup, connection, handshake, or the
 *     server thinking.
 *
 * `fetch` gives back a `Response` with all four of those already collapsed into
 * one number, so the tools that report them open the socket themselves. This
 * file is that socket, with the same fence around it as `safe-fetch` has, for
 * the same reason: unguarded, a route built on this is a port scanner and a
 * connection laundry wearing this server's address.
 *
 * Server only. Node's `net` and `tls` are imported here, so nothing in
 * `src/components` may import this file — the route is the boundary.
 *
 * The fence, in the order it is applied:
 *
 *   1. The hostname is checked as a hostname before it is resolved, so a
 *      pasted URL, a path or a shell fragment never reaches the resolver.
 *   2. It is resolved, and every address it resolves to is judged by
 *      `isBlockedAddress`. One private address in the answer refuses the whole
 *      host: a name with both a public and a loopback A record is a DNS-rebind
 *      attempt, not a configuration accident.
 *   3. The connection is made to a *resolved address*, never to the name, and
 *      the name travels separately as the TLS SNI value. Resolving once and
 *      connecting to the result closes the window between the check and the
 *      connection, which is the whole of a rebind attack.
 *   4. Every socket carries a deadline and is destroyed on it. A hung handshake
 *      holds a file descriptor open on this server, not on the visitor's.
 */
import { lookup } from "node:dns/promises";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect, type DetailedPeerCertificate } from "node:tls";
import { isBlockedAddress } from "./safe-url.js";

/** Long enough for a slow handshake abroad, short enough that nobody leaves. */
export const PROBE_TIMEOUT_MS = 6_000;

/** Named honestly, so an operator reading their logs has somebody to write to. */
const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

/*
 * A hostname, and nothing that merely contains one.
 *
 * Deliberately stricter than the RFC: no trailing dot, no underscore, no
 * leading digit-only single label. What it rejects is what matters — a scheme,
 * a slash, a colon, a space, a credential, a percent escape. Anything with
 * those in it is a URL or worse, and the caller has to take it apart first.
 */
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type ProbeFail = { ok: false; message: string; status: 400 | 502 };

export type NameCheck = { ok: true; hostname: string } | ProbeFail;

/**
 * Checks that what the visitor typed is shaped like a hostname, and stops.
 *
 * `resolveHost` below answers a stronger question — does this name point at an
 * address this server will connect to — and for anything that opens a socket
 * that is the right question. For a tool that only ever asks the name server
 * about a name it is the wrong one, because it quietly requires an A or AAAA
 * record: a domain that publishes MX and TXT and no address record is a valid,
 * if uncommon, mail-only configuration, and the mail tools would have refused
 * to look at exactly the domain their visitor came to ask about.
 *
 * There is no SSRF question to answer here. Nothing connects to the name; a
 * resolver is asked what it holds, and an answer of `127.0.0.1` is a finding to
 * be shown rather than an address to be dialled.
 */
export function checkHostname(raw: string): NameCheck {
  const hostname = raw.trim().toLowerCase().replace(/\.$/, "");

  if (hostname === "") return { ok: false, message: "Boş sahə: domen adı yaz.", status: 400 };
  if (hostname.length > 253) {
    return { ok: false, message: "Domen adı həddindən uzundur.", status: 400 };
  }
  if (!HOSTNAME.test(hostname)) {
    return {
      ok: false,
      message: "Domen adı oxunmadı: «example.com» formatında, sxem və yol olmadan yaz.",
      status: 400,
    };
  }

  return { ok: true, hostname };
}

/** One resolved address and the protocol family it belongs to. */
export type HostAddress = { address: string; family: 4 | 6 };

export type ResolvedHost = {
  ok: true;
  hostname: string;
  /** Every address the name answers with, in the resolver's own order. */
  addresses: HostAddress[];
  /** How long the lookup itself took, which is a result and not just overhead. */
  ms: number;
};

/**
 * Turns a hostname into addresses this server is willing to connect to.
 *
 * An IP typed directly is allowed through as itself — somebody checking a
 * certificate on a bare address is a real case — but it is judged by the same
 * block list, so a typed `127.0.0.1` is refused exactly like a resolved one.
 */
export async function resolveHost(raw: string): Promise<ResolvedHost | ProbeFail> {
  const hostname = raw.trim().toLowerCase().replace(/\.$/, "");

  if (hostname === "") return { ok: false, message: "Boş sahə: domen adı yaz.", status: 400 };
  if (hostname.length > 253) {
    return { ok: false, message: "Domen adı həddindən uzundur.", status: 400 };
  }

  /* A literal address skips the resolver but not the block list. */
  const literal = /^[0-9.]+$/.test(hostname) || hostname.includes(":");
  if (literal) {
    if (isBlockedAddress(hostname)) {
      return {
        ok: false,
        message: "Bu ünvan daxili və ya ayrılmış şəbəkəyə işarə edir. Alət yalnız internetdə açıq olan ünvanları yoxlayır.",
        status: 400,
      };
    }
    const family = hostname.includes(":") ? (6 as const) : (4 as const);
    return { ok: true, hostname, addresses: [{ address: hostname, family }], ms: 0 };
  }

  if (!HOSTNAME.test(hostname)) {
    return {
      ok: false,
      message: "Domen adı oxunmadı: «example.com» formatında, sxem və yol olmadan yaz.",
      status: 400,
    };
  }

  const started = performance.now();
  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, message: `«${hostname}» adı DNS-də tapılmadı.`, status: 400 };
  }
  const ms = Math.round(performance.now() - started);

  if (answers.length === 0) {
    return { ok: false, message: `«${hostname}» heç bir IP ünvanına həll olunmur.`, status: 400 };
  }

  /* Rule 2: one bad address condemns the name. */
  if (answers.some((entry) => isBlockedAddress(entry.address))) {
    return {
      ok: false,
      message: "Bu ad daxili şəbəkə ünvanına həll olunur. Alət yalnız internetdə açıq olan hostları yoxlayır.",
      status: 400,
    };
  }

  const addresses = answers.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? (6 as const) : (4 as const),
  }));

  return { ok: true, hostname, addresses, ms };
}

/*
 * How long the first resolved address is tried alone before the other family
 * is dialled alongside it.
 *
 * RFC 8305 calls this the connection attempt delay and puts it at 250 ms;
 * undici uses the same number, and that is why `fetch` never shows the fault
 * this layer used to have. Every tool built on `safe-fetch` races the families
 * for free. Every tool that opens its own socket has to do it here.
 */
export const SECOND_FAMILY_DELAY_MS = 250;

/**
 * The first address of each family, in the resolver's own order.
 *
 * At most two, and deliberately not "every address the name answers with": a
 * second A record fails for the same reason the first one did, so trying it
 * buys nothing and turns one check into a small connection storm. What is
 * worth a second attempt is the *other* protocol.
 */
export function oneAddressPerFamily(addresses: readonly HostAddress[]): HostAddress[] {
  const seen = new Set<number>();
  const picked: HostAddress[] = [];
  for (const entry of addresses) {
    if (seen.has(entry.family)) continue;
    seen.add(entry.family);
    picked.push(entry);
  }
  return picked;
}

type Attempt<T> = { target: HostAddress; result: T | ProbeFail };

/** A generic value is `T | ProbeFail`; this is the only way to tell them apart. */
function isFail(value: { ok: boolean }): value is ProbeFail {
  return value.ok === false;
}

/**
 * Resolves on the first attempt that worked, and waits for the rest only when
 * none did.
 *
 * `Promise.all` would be the obvious shape and it is the wrong one: a dead
 * address holds its socket until the probe timeout, so awaiting both after the
 * other family has already answered puts those six seconds back into the
 * answer in exchange for nothing. When both fail the verdict is the *first*
 * address's failure, because that is the address a client would have used.
 */
function firstSuccess<T extends { ok: true }>(
  leading: Promise<Attempt<T>>,
  trailing: Promise<Attempt<T>>,
): Promise<Attempt<T>> {
  return new Promise((resolve) => {
    let outstanding = 2;
    const settle = (attempt: Attempt<T>) => {
      if (!isFail(attempt.result)) {
        resolve(attempt);
        return;
      }
      outstanding -= 1;
      if (outstanding === 0) void leading.then(resolve);
    };
    void leading.then(settle);
    void trailing.then(settle);
  });
}

export type FamilyReach<T> = { ok: true; address: string; family: 4 | 6; result: T } | ProbeFail;

/**
 * Runs one probe against a dual-stack host the way a browser would.
 *
 * This exists because of a fault that was measured rather than suspected.
 * `resolveHost` returns the resolver's own order (`verbatim: true`), and on a
 * machine with a global IPv6 address getaddrinfo sorts AAAA first. Every tool
 * here used to take that first address and nothing else, so on every
 * dual-stack site it dialled IPv6, and where the route was advertised but dead
 * the socket sat until the six-second deadline and the tool reported a healthy
 * site as broken. Measured on the production server: camalali.com over its
 * first address 6029 ms and nothing, over its first A record 32 ms and an
 * answer; example.com 6004 ms against 19 ms. `fetch` reached both hosts
 * throughout, which is exactly why the fault stayed invisible for so long.
 *
 * The fix is what a client already does. The first address gets a head start;
 * if it has not answered inside it, the other family is dialled *in parallel*
 * rather than after it, so a working host still costs one connection and a
 * dead route costs one extra instead of the whole timeout. Measured with the
 * first address black-holed: 6008 ms waiting for both, 292 ms taking the first
 * success, and the same result at the end of either.
 *
 * A failure is still a failure, and it is named rather than blamed on the
 * site: the caller gets the first address's own message and says what could
 * not be reached.
 */
export async function probeAcrossFamilies<T extends { ok: true }>(
  addresses: readonly HostAddress[],
  dial: (target: HostAddress) => Promise<T | ProbeFail>,
  delayMs: number = SECOND_FAMILY_DELAY_MS,
): Promise<FamilyReach<T>> {
  const candidates = oneAddressPerFamily(addresses);
  const first = candidates[0];
  if (first === undefined) {
    return { ok: false, message: "Bu ad heç bir IP ünvanına həll olunmur.", status: 400 };
  }

  const attempt = (target: HostAddress): Promise<Attempt<T>> =>
    dial(target).then((result) => ({ target, result }));

  const settle = (value: Attempt<T>): FamilyReach<T> =>
    isFail(value.result)
      ? value.result
      : { ok: true, address: value.target.address, family: value.target.family, result: value.result };

  const leading = attempt(first);
  const second = candidates[1];
  if (second === undefined) return settle(await leading);

  /* The head start. `Promise.race` against a timer, so a host that answers on
     its first address never pays for the second connection at all. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const headStart = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), delayMs);
  });
  const early = await Promise.race([leading, headStart]);
  clearTimeout(timer);

  if (early !== null && !isFail(early.result)) return settle(early);

  return settle(await firstSuccess(leading, attempt(second)));
}

export type PortVerdict = "open" | "refused" | "timeout" | "unreachable";

export type PortResult = {
  port: number;
  verdict: PortVerdict;
  /** Milliseconds to the verdict — the connect time when open, the wait when not. */
  ms: number;
};

/**
 * Opens a TCP connection to one already-resolved address and closes it.
 *
 * Nothing is written, so this is a connect and a FIN and no payload. The three
 * outcomes are kept apart because they mean different things to somebody
 * debugging: `refused` is a host that answered and said no (nothing listening),
 * `timeout` is a firewall dropping the packet silently, and those two lead to
 * opposite next steps.
 */
export function probePort(
  address: string,
  port: number,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<PortResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;

    const socket = netConnect({ host: address, port });
    socket.setTimeout(timeoutMs);

    const finish = (verdict: PortVerdict) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ port, verdict, ms: Math.round(performance.now() - started) });
    };

    socket.once("connect", () => finish("open"));
    socket.once("timeout", () => finish("timeout"));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ECONNREFUSED" || error.code === "ECONNRESET" ? "refused" : "unreachable");
    });
  });
}

export type CertificateInfo = {
  subject: string;
  /** Every name the certificate is valid for, SAN and common name folded together. */
  names: string[];
  issuer: string;
  validFrom: string;
  validTo: string;
  /** Whole days left; negative when it has already expired. */
  daysLeft: number;
  serialNumber: string;
  /** SHA-256 of the DER form, colon-separated upper hex, as OpenSSL prints it. */
  fingerprint256: string;
  signatureAlgorithm: string | null;
  /** Key size in bits where the algorithm has one, else null. */
  keyBits: number | null;
  isCa: boolean;
};

export type TlsResult = {
  ok: true;
  address: string;
  port: number;
  /** What was negotiated, e.g. `TLSv1.3`. */
  protocol: string | null;
  cipher: { name: string; version: string } | null;
  /** Whether Node's own store trusts the chain, and why not when it does not. */
  trusted: boolean;
  trustError: string | null;
  /** The leaf first, then each issuer up to the root the server sent. */
  chain: CertificateInfo[];
  /** Whether the leaf actually covers the name that was asked for. */
  nameMatches: boolean;
  /** Handshake time, name lookup excluded. */
  ms: number;
};

/** Colon-separated upper hex is how every other tool prints a fingerprint. */
function tidyFingerprint(value: string): string {
  return value.replace(/:/g, "").toUpperCase().replace(/(.{2})(?!$)/g, "$1:");
}

/** Node hands back an X.509 name as an object; this is its one-line form. */
function nameLine(entry: Record<string, string | string[]> | undefined): string {
  if (!entry) return "";
  const order = ["CN", "O", "OU", "L", "ST", "C"];
  const parts: string[] = [];
  for (const key of order) {
    const value = entry[key];
    if (typeof value === "string" && value !== "") parts.push(`${key}=${value}`);
  }
  return parts.join(", ");
}

/**
 * Pulls every name a certificate claims out of its SAN extension.
 *
 * The common name is included only when the SAN list is empty, which is the
 * honest reading: since 2017 no major client looks at the common name at all,
 * so presenting it as a covered name for a modern certificate would be wrong.
 */
function certificateNames(cert: DetailedPeerCertificate): string[] {
  const alt = typeof cert.subjectaltname === "string" ? cert.subjectaltname : "";
  const names = alt
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.startsWith("DNS:") || piece.startsWith("IP Address:"))
    .map((piece) => piece.replace(/^DNS:/, "").replace(/^IP Address:/, ""));

  if (names.length > 0) return names;
  const common = cert.subject?.CN;
  return typeof common === "string" && common !== "" ? [common] : [];
}

/** The wildcard rule as clients apply it: one label, leftmost only. */
export function nameCoveredBy(hostname: string, patterns: string[]): boolean {
  const host = hostname.toLowerCase();
  return patterns.some((raw) => {
    const pattern = raw.toLowerCase();
    if (pattern === host) return true;
    if (!pattern.startsWith("*.")) return false;
    const suffix = pattern.slice(1); // ".example.com"
    if (!host.endsWith(suffix)) return false;
    /* A wildcard covers exactly one label, so what is left may not contain a dot. */
    return !host.slice(0, host.length - suffix.length).includes(".");
  });
}

function describeCertificate(cert: DetailedPeerCertificate): CertificateInfo {
  const validTo = new Date(cert.valid_to);
  const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);

  return {
    subject: nameLine(cert.subject as unknown as Record<string, string | string[]>),
    names: certificateNames(cert),
    issuer: nameLine(cert.issuer as unknown as Record<string, string | string[]>),
    validFrom: new Date(cert.valid_from).toISOString(),
    validTo: validTo.toISOString(),
    daysLeft,
    serialNumber: cert.serialNumber ?? "",
    fingerprint256: tidyFingerprint(cert.fingerprint256 ?? ""),
    signatureAlgorithm: (cert as { asn1Curve?: string; nistCurve?: string }).nistCurve ?? null,
    keyBits: typeof cert.bits === "number" ? cert.bits : null,
    isCa: Boolean((cert as { ca?: boolean }).ca),
  };
}

export type TlsOptions = {
  /** Already resolved and already judged public. */
  address: string;
  /** The name to send as SNI and to check the certificate against. */
  servername: string;
  port?: number;
  /** Force one version, which is how the version-support tool works. */
  version?: "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3";
  timeoutMs?: number;
};

/**
 * Completes a TLS handshake and reports what came back.
 *
 * `rejectUnauthorized` is false on purpose and it is not a weakening: an
 * expired or self-signed certificate is the answer the visitor came for, and a
 * probe that refused to look at one would be blind exactly when it is useful.
 * Nothing is sent over the socket and nothing read from it, so there is no
 * content to be tricked by — the verdict is reported as data instead
 * (`trusted`, `trustError`), and the tool shows it.
 */
export function inspectTls(options: TlsOptions): Promise<TlsResult | ProbeFail> {
  const { address, servername, port = 443, version, timeoutMs = PROBE_TIMEOUT_MS } = options;

  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;

    const socket = tlsConnect({
      host: address,
      port,
      servername,
      rejectUnauthorized: false,
      /* One exact version when asked, otherwise whatever both ends prefer. */
      ...(version ? { minVersion: version, maxVersion: version } : {}),
    });

    socket.setTimeout(timeoutMs);

    const done = (value: TlsResult | ProbeFail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once("secureConnect", () => {
      const ms = Math.round(performance.now() - started);
      const leaf = socket.getPeerCertificate(true);

      if (!leaf || Object.keys(leaf).length === 0) {
        done({ ok: false, message: "Server sertifikat göndərmədi.", status: 502 });
        return;
      }

      /* `issuerCertificate` points at itself once the root is reached, so the
         walk has to stop on identity rather than on null. */
      const chain: CertificateInfo[] = [];
      const seen = new Set<string>();
      let current: DetailedPeerCertificate | undefined = leaf;
      while (current && Object.keys(current).length > 0) {
        const key = current.fingerprint256 ?? current.serialNumber ?? String(chain.length);
        if (seen.has(key)) break;
        seen.add(key);
        chain.push(describeCertificate(current));
        const next: DetailedPeerCertificate | undefined = current.issuerCertificate;
        if (!next || next === current) break;
        current = next;
      }

      const cipher = socket.getCipher();
      const error = (socket as { authorizationError?: Error | string | null }).authorizationError;

      done({
        ok: true,
        address,
        port,
        protocol: socket.getProtocol(),
        cipher: cipher ? { name: cipher.name, version: cipher.version } : null,
        trusted: socket.authorized,
        trustError: socket.authorized ? null : error ? String(error) : "UNKNOWN",
        chain,
        nameMatches: nameCoveredBy(servername, chain[0]?.names ?? []),
        ms,
      });
    });

    socket.once("timeout", () => {
      done({ ok: false, message: `${servername} TLS əlsıxmasını vaxtında tamamlamadı.`, status: 502 });
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
      /* A refused version is the expected answer for the version-support tool,
         not a fault, so the code travels in the message for it to read. */
      done({
        ok: false,
        message: `TLS əlaqəsi qurulmadı (${error.code ?? "XETA"}).`,
        status: 502,
      });
    });
  });
}

export type PhaseTiming = {
  ok: true;
  address: string;
  /** Name lookup. Zero when an address was typed directly. */
  dnsMs: number;
  /** TCP handshake — the round trip to the far end, and the closest thing to a ping. */
  tcpMs: number;
  /** TLS handshake on top of it. Zero for plain http. */
  tlsMs: number;
  /** Request written to first byte back: the server actually thinking. */
  ttfbMs: number;
  totalMs: number;
  status: number | null;
  /** The status line and headers, so the tool can show what answered. */
  headers: [string, string][];
};

/**
 * Times one HTTP request phase by phase, on one connection.
 *
 * Deliberately not built on `fetch`: `fetch` returns after the response has
 * begun and reports one duration, with the lookup, the connection, the
 * handshake and the server's own thinking already added together. Those four
 * numbers lead to four different fixes, which is the entire reason a visitor
 * asks for the breakdown, so the request is written onto the socket by hand.
 *
 * Only the head of the response is read — enough for the status line and the
 * headers — and the socket is then destroyed. `Connection: close` is sent so
 * the far end is not left holding an idle connection open for this.
 */
export function measurePhases(
  target: { address: string; hostname: string; path: string; secure: boolean; port?: number; dnsMs?: number },
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<PhaseTiming | ProbeFail> {
  const { address, hostname, path, secure, dnsMs = 0 } = target;
  const port = target.port ?? (secure ? 443 : 80);

  return new Promise((resolve) => {
    let settled = false;
    const clock = { start: performance.now(), connected: 0, secured: 0, written: 0 };
    let head = "";

    const done = (value: PhaseTiming | ProbeFail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    const socket = secure
      ? tlsConnect({ host: address, port, servername: hostname, rejectUnauthorized: false })
      : netConnect({ host: address, port });

    socket.setTimeout(timeoutMs);

    /* On a TLS socket `connect` fires for the TCP layer and `secureConnect`
       after the handshake, which is exactly the split being measured. */
    socket.once("connect", () => {
      clock.connected = performance.now();
    });

    const sendRequest = () => {
      clock.written = performance.now();
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
          `Host: ${hostname}\r\n` +
          `User-Agent: ${USER_AGENT}\r\n` +
          "Accept: */*\r\n" +
          "Accept-Encoding: identity\r\n" +
          "Connection: close\r\n\r\n",
      );
    };

    if (secure) {
      socket.once("secureConnect", () => {
        clock.secured = performance.now();
        sendRequest();
      });
    } else {
      socket.once("connect", () => {
        clock.secured = clock.connected;
        sendRequest();
      });
    }

    let firstByteAt = 0;

    socket.on("data", (chunk: Buffer) => {
      if (firstByteAt === 0) firstByteAt = performance.now();
      head += chunk.toString("latin1");

      /* Everything wanted is above the blank line; 64 KB is a ceiling for a
         server that never sends one. */
      if (head.includes("\r\n\r\n") || head.length > 65_536) {
        const [rawHead] = head.split("\r\n\r\n");
        const lines = rawHead.split("\r\n");
        const statusLine = lines.shift() ?? "";
        const status = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);

        const headers: [string, string][] = [];
        for (const line of lines) {
          const at = line.indexOf(":");
          if (at > 0) headers.push([line.slice(0, at).toLowerCase().trim(), line.slice(at + 1).trim()]);
        }

        const tcpMs = Math.round(clock.connected - clock.start);
        const tlsMs = secure ? Math.round(clock.secured - clock.connected) : 0;

        done({
          ok: true,
          address,
          dnsMs,
          tcpMs,
          tlsMs,
          ttfbMs: Math.round(firstByteAt - clock.written),
          totalMs: dnsMs + Math.round(firstByteAt - clock.start),
          status: Number.isFinite(status) ? status : null,
          headers,
        });
      }
    });

    socket.once("timeout", () => {
      done({ ok: false, message: `${hostname} ${Math.round(timeoutMs / 1000)} saniyə ərzində cavab vermədi.`, status: 502 });
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
      done({ ok: false, message: `Əlaqə qurulmadı (${error.code ?? "XETA"}).`, status: 502 });
    });

    socket.once("close", () => {
      if (!settled) done({ ok: false, message: `${hostname} cavab vermədən əlaqəni kəsdi.`, status: 502 });
    });
  });
}
