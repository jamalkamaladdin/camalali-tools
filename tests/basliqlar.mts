/*
 * The header tool's two halves, both checked without a network.
 *
 * The scoring half is arithmetic and is easy to test. The other half is the
 * SSRF fence - which addresses the server refuses to fetch - and that is the
 * one worth testing hardest, because it fails silently: a hole in it does not
 * break a page, it quietly turns the endpoint into somebody else's scanner.
 * Every range below is a documented one (RFC 1918, RFC 6598, RFC 3927) and the
 * link-local case is the address every cloud answers metadata on.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildHeaderReport,
  gradeFor,
  isBlockedAddress,
  normalizeTargetUrl,
  parseIpv4,
  parseIpv6,
  type HeaderReportInput,
} from "../lib/basliqlar";

const STAMP = "2026-09-03T10:00:00.000Z";

function report(
  headers: [string, string][],
  url = "https://example.com/",
): ReturnType<typeof buildHeaderReport> {
  const input: HeaderReportInput = {
    url,
    status: 200,
    redirectedTo: null,
    headers,
    checkedAt: STAMP,
  };
  return buildHeaderReport(input);
}

function pointsFor(headers: [string, string][], header: string, url?: string): number {
  return report(headers, url).findings.find((finding) => finding.header === header)?.points ?? -1;
}

/* Every header at its strongest value - the only input that should reach 100. */
const PERFECT: [string, string][] = [
  ["content-security-policy", "default-src 'self'; object-src 'none'; base-uri 'none'"],
  ["strict-transport-security", "max-age=63072000; includeSubDomains; preload"],
  ["x-frame-options", "DENY"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "no-referrer"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-embedder-policy", "require-corp"],
  ["cross-origin-resource-policy", "same-origin"],
];

export const checks: CheckSuite = (check) => {
  /* ---- unvan validasiyasi ---- */

  {
    const bare = normalizeTargetUrl("example.com/a");
    check(
      "basliqlar: sxemsiz unvana https elave olunur",
      bare.ok && bare.url === "https://example.com/a",
      `alindi ${bare.ok ? bare.url : bare.error}`,
    );
  }

  check(
    "basliqlar: http ve https-den basqa sxemler redd edilir",
    !normalizeTargetUrl("ftp://example.com").ok &&
      !normalizeTargetUrl("file:///etc/passwd").ok &&
      !normalizeTargetUrl("gopher://example.com").ok,
    "kenar sxem qebul edildi",
  );

  check(
    "basliqlar: 80 ve 443-den basqa portlar redd edilir",
    !normalizeTargetUrl("https://example.com:8080").ok &&
      !normalizeTargetUrl("http://example.com:22").ok &&
      normalizeTargetUrl("https://example.com:443").ok,
    "qeyri-standart port qebul edildi",
  );

  check(
    "basliqlar: unvandaki istifadeci adi ve parol redd edilir",
    !normalizeTargetUrl("https://admin:secret@example.com").ok,
    "kredensial olan unvan qebul edildi",
  );

  check(
    "basliqlar: bos ve oxunmayan unvan redd edilir",
    !normalizeTargetUrl("").ok && !normalizeTargetUrl("   ").ok && !normalizeTargetUrl("https://").ok,
    "bos unvan qebul edildi",
  );

  /* ---- SSRF cepheri ---- */

  {
    const blocked = [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ];
    const leaked = blocked.filter((address) => !isBlockedAddress(address));
    check(
      "basliqlar: sexsi ve ayrilmis IPv4 araliqlari bloklanir",
      leaked.length === 0,
      `bloklanmadi: ${leaked.join(", ")}`,
    );
  }

  {
    const allowed = ["8.8.8.8", "1.1.1.1", "9.255.255.255", "11.0.0.1", "172.32.0.1", "172.15.0.1"];
    const refused = allowed.filter((address) => isBlockedAddress(address));
    check(
      "basliqlar: 172.16/12 serhedinin kenari ve adi ictimai IP-ler kecir",
      refused.length === 0,
      `sehven bloklandi: ${refused.join(", ")}`,
    );
  }

  {
    const blocked = ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"];
    const leaked = blocked.filter((address) => !isBlockedAddress(address));
    check(
      "basliqlar: loopback, unique-local, link-local ve multicast IPv6 bloklanir",
      leaked.length === 0,
      `bloklanmadi: ${leaked.join(", ")}`,
    );
  }

  check(
    "basliqlar: IPv4-mapped IPv6 (::ffff:127.0.0.1) IPv4 qaydalari ile olculur",
    isBlockedAddress("::ffff:127.0.0.1") &&
      isBlockedAddress("::ffff:169.254.169.254") &&
      !isBlockedAddress("::ffff:8.8.8.8"),
    "mapped unvan qaydalardan yan kecdi",
  );

  check(
    "basliqlar: 2001:4860:4860::8888 kimi ictimai IPv6 kecir",
    !isBlockedAddress("2001:4860:4860::8888") && !isBlockedAddress("2606:4700:4700::1111"),
    "ictimai IPv6 sehven bloklandi",
  );

  check(
    "basliqlar: oxunmayan unvan bloklanir (fail closed)",
    isBlockedAddress("not-an-ip") && isBlockedAddress("") && isBlockedAddress("1.2.3"),
    "taninmayan unvan buraxildi",
  );

  check(
    "basliqlar: onunde sifir olan oktet redd edilir (oktal qarisiqligi)",
    parseIpv4("010.0.0.1") === null && parseIpv4("1.2.3.256") === null && parseIpv4("8.8.8.8") !== null,
    "sifirla baslayan oktet parse edildi",
  );

  check(
    "basliqlar: IPv6 parseri :: sixilmasini ve zona sonluqunu oxuyur",
    parseIpv6("fe80::1%eth0") !== null &&
      parseIpv6("2001:db8::1") !== null &&
      parseIpv6("1::2::3") === null,
    "IPv6 parseri sehv netice verdi",
  );

  /* ---- bal hesabi ---- */

  {
    const empty = report([]);
    check(
      "basliqlar: hec bir basliq yoxdursa bal 0 ve qiymet F olur",
      empty.score === 0 && empty.grade === "F" && empty.todo.length === 9,
      `alindi score=${empty.score} grade=${empty.grade} todo=${empty.todo.length}`,
    );
  }

  {
    const full = report(PERFECT);
    check(
      "basliqlar: doqquz basligin en guclu deyeri 100 xal ve A verir",
      full.score === 100 && full.grade === "A" && full.todo.length === 0,
      `alindi score=${full.score} grade=${full.grade} todo=${full.todo.length}`,
    );
  }

  check(
    "basliqlar: qiymet serhedleri sirali qalir",
    gradeFor(100) === "A" &&
      gradeFor(90) === "A" &&
      gradeFor(89) === "B" &&
      gradeFor(65) === "C" &&
      gradeFor(34) === "F",
    `alindi ${[100, 90, 89, 65, 34].map(gradeFor).join(",")}`,
  );

  check(
    "basliqlar: basliq adi buyuk-kicik herfden asili deyil",
    pointsFor([["X-Content-Type-Options", "NoSniff"]], "X-Content-Type-Options") === 10,
    `alindi ${pointsFor([["X-Content-Type-Options", "NoSniff"]], "X-Content-Type-Options")}`,
  );

  /* ---- CSP ---- */

  check(
    "basliqlar: unsafe-inline olan CSP zeif sayilir, nonce ile birlikde yox",
    pointsFor([["content-security-policy", "script-src 'self' 'unsafe-inline'"]], "Content-Security-Policy") === 12 &&
      pointsFor(
        [["content-security-policy", "script-src 'self' 'unsafe-inline' 'nonce-abc123'"]],
        "Content-Security-Policy",
      ) === 25,
    "CSP qiymetlendirmesi gozlenilenden ferqlidir",
  );

  check(
    "basliqlar: skript direktivi olmayan CSP esas isini gormur",
    pointsFor([["content-security-policy", "img-src 'self'"]], "Content-Security-Policy") === 8 &&
      pointsFor([["content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-eval'"]], "Content-Security-Policy") === 18,
    "CSP qiymetlendirmesi gozlenilenden ferqlidir",
  );

  {
    const only = report([["content-security-policy-report-only", "default-src 'self'"]]);
    const csp = only.findings.find((finding) => finding.header === "Content-Security-Policy");
    check(
      "basliqlar: yalniz Report-Only versiyasi varsa xal verilmir",
      csp?.points === 0 && (csp?.note.includes("Report-Only") ?? false),
      `alindi points=${csp?.points}`,
    );
  }

  /* ---- HSTS ---- */

  check(
    "basliqlar: max-age=0 HSTS-i sondurur ve xal vermir",
    pointsFor([["strict-transport-security", "max-age=0"]], "Strict-Transport-Security") === 0 &&
      pointsFor([["strict-transport-security", "max-age=3600"]], "Strict-Transport-Security") === 8 &&
      pointsFor([["strict-transport-security", "max-age=31536000"]], "Strict-Transport-Security") === 18,
    "HSTS qiymetlendirmesi gozlenilenden ferqlidir",
  );

  check(
    "basliqlar: http unvaninda HSTS xal vermir (brauzer onu nezere almir)",
    pointsFor(
      [["strict-transport-security", "max-age=63072000; includeSubDomains"]],
      "Strict-Transport-Security",
      "http://example.com/",
    ) === 0,
    "http unvaninda HSTS xal aldi",
  );

  /* ---- qalan basliqlar ---- */

  check(
    "basliqlar: CSP frame-ancestors X-Frame-Options-un yerini tutur",
    pointsFor([["content-security-policy", "frame-ancestors 'none'"]], "X-Frame-Options") === 15 &&
      pointsFor([["content-security-policy", "frame-ancestors *"]], "X-Frame-Options") === 6,
    "frame-ancestors nezere alinmadi",
  );

  check(
    "basliqlar: referrer siyahisinda son taninan deyer esas goturulur",
    pointsFor([["referrer-policy", "unsafe-url"]], "Referrer-Policy") === 0 &&
      pointsFor([["referrer-policy", "origin"]], "Referrer-Policy") === 5 &&
      pointsFor([["referrer-policy", "no-referrer-when-downgrade, strict-origin-when-cross-origin"]], "Referrer-Policy") === 10,
    "Referrer-Policy qiymetlendirmesi gozlenilenden ferqlidir",
  );

  /* ---- melumat sizmasi ve siralanma ---- */

  {
    const leaky = report([
      ["server", "Apache/2.4.41 (Ubuntu)"],
      ["x-powered-by", "PHP"],
      ["content-type", "text/html"],
    ]);
    check(
      "basliqlar: server ve x-powered-by sizma kimi isarelenir, content-type yox",
      leaky.leaks.length === 2 &&
        leaky.all.filter((entry) => entry.leaks).length === 2 &&
        leaky.leaks[0].note.includes("versiya"),
      `alindi leaks=${leaky.leaks.length}`,
    );
  }

  {
    const partial = report([
      ["x-content-type-options", "nosniff"],
      ["cross-origin-resource-policy", "same-origin"],
    ]);
    check(
      "basliqlar: duzelis siyahisi en cox itirilen xaldan baslayir",
      partial.todo[0].startsWith("Content-Security-Policy") &&
        partial.todo[1].startsWith("Strict-Transport-Security"),
      `alindi ${partial.todo.slice(0, 2).join(" | ")}`,
    );
  }

  {
    const duplicated = report([
      ["permissions-policy", "camera=()"],
      ["permissions-policy", "microphone=()"],
    ]);
    const finding = duplicated.findings.find((entry) => entry.header === "Permissions-Policy");
    check(
      "basliqlar: eyni basliq iki defe gelirse birlesdirilib oxunur",
      finding?.points === 10 && (finding?.note.includes("2") ?? false),
      `alindi points=${finding?.points} note=${finding?.note}`,
    );
  }
};
