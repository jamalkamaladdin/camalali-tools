/*
 * The SSRF fence, checked without a network.
 *
 * This is the guard worth testing hardest, because it fails silently: a hole
 * in it does not break a page, it quietly turns five endpoints into somebody
 * else's port scanner. Every range below is a documented one (RFC 1918,
 * RFC 6598, RFC 3927) and the link-local case is the address every major cloud
 * answers unauthenticated metadata on.
 *
 * The last case is about the refactor rather than about addresses: the rules
 * moved out of `basliqlar.ts` into `safe-url.ts`, and `basliqlar.ts` still
 * re-exports them. If that re-export is ever dropped, the header tool's own
 * checks break with a confusing import error - this one breaks with a sentence
 * that says what happened.
 */
import type { CheckSuite } from "./harness.mts";
import {
  isBlockedAddress,
  normalizeTargetUrl,
  parseIpv4,
  parseIpv6,
} from "../lib/safe-url";
import * as basliqlar from "../lib/basliqlar";

/**
 * The whole fence in one call, the way a route applies it.
 *
 * A route runs `normalizeTargetUrl` first and `isBlockedAddress` over the
 * resolved addresses second, so a case that only tested one of the two would
 * pass while the endpoint stayed open.
 */
function refused(raw: string): boolean {
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return true;
  return isBlockedAddress(target.hostname);
}

export const checks: CheckSuite = (check) => {
  check(
    "safe-url: bos setir unvan sayilmir",
    refused("") && !normalizeTargetUrl("").ok,
    "bos giris qebul edildi",
  );

  check(
    "safe-url: file: sxemi rədd olunur",
    refused("file:///etc/passwd"),
    "file: sxemi kecdi - yerli fayl oxuna bilerdi",
  );

  check(
    "safe-url: qeyri-standart port rədd olunur",
    refused("example.com:8080") && refused("https://example.com:22/"),
    "port suzgeci acigdir - endpoint port skaneri olur",
  );

  check(
    "safe-url: 127.0.0.1 loopback rədd olunur",
    refused("127.0.0.1") && refused("http://127.0.0.1/") && isBlockedAddress("127.0.0.1"),
    "loopback kecdi",
  );

  check(
    "safe-url: 169.254.169.254 bulud metadata unvani rədd olunur",
    refused("169.254.169.254") && isBlockedAddress("169.254.169.254"),
    "metadata servisi kecdi - bu, sirlerin oxunmasi demekdir",
  );

  check(
    "safe-url: 192.168.1.1 ve 10.0.0.1 daxili sebeke rədd olunur",
    refused("192.168.1.1") &&
      refused("10.0.0.1") &&
      isBlockedAddress("192.168.1.1") &&
      isBlockedAddress("10.0.0.1") &&
      isBlockedAddress("172.16.0.1"),
    "RFC 1918 araligi kecdi",
  );

  check(
    "safe-url: ::ffff:127.0.0.1 IPv6 sintaksisi ile gizlenmis loopback rədd olunur",
    isBlockedAddress("::ffff:127.0.0.1") &&
      isBlockedAddress("[::ffff:127.0.0.1]") &&
      refused("https://[::ffff:127.0.0.1]/") &&
      isBlockedAddress("::1"),
    "IPv4-mapped unvan butun siyahini yan kecdi",
  );

  check(
    "safe-url: 0177.0.0.1 kimi oncul sifirli unvan rədd olunur",
    refused("0177.0.0.1") &&
      isBlockedAddress("0177.0.0.1") &&
      parseIpv4("0177.0.0.1") === null &&
      parseIpv4("010.0.0.1") === null,
    "oncul sifir onluq kimi oxundu - iki qat ferqli seye baxir",
  );

  check(
    "safe-url: localhost adi rədd olunur",
    isBlockedAddress("localhost") && isBlockedAddress("metadata.google.internal"),
    "IP kimi oxunmayan ad kecdi - bilinmeyen unvan bagli sayilmalidir",
  );

  {
    const target = normalizeTargetUrl("https://example.com");
    check(
      "safe-url: adi https unvan qebul edilir ve normallasdirilir",
      target.ok &&
        target.hostname === "example.com" &&
        target.protocol === "https:" &&
        target.url === "https://example.com/",
      target.ok ? `alindi ${target.url}` : `rədd edildi: ${target.error}`,
    );
  }

  {
    const bare = normalizeTargetUrl("example.com/a");
    check(
      "safe-url: sxemsiz yazilis http yox, https kimi oxunur",
      bare.ok && bare.url === "https://example.com/a",
      bare.ok ? `alindi ${bare.url}` : `rədd edildi: ${bare.error}`,
    );
  }

  check(
    "safe-url: 8.8.8.8 kimi aciq unvan bloklanmir",
    !isBlockedAddress("8.8.8.8") && !isBlockedAddress("2001:4860:4860::8888"),
    "cepər hər şeyi bloklayır - alet umumiyyetle isləmezdi",
  );

  check(
    "safe-url: unvandaki istifadeci adi/parol rədd olunur",
    refused("https://user:pass@example.com/") &&
      !normalizeTargetUrl("https://user:pass@example.com/").ok,
    "kimlik melumati hedefe gonderilib sonra ziyaretciye qaytarilardi",
  );

  {
    const target = normalizeTargetUrl("https://example.com/a#bolme");
    check(
      "safe-url: fraqment atilir",
      target.ok && !target.url.includes("#"),
      target.ok ? `alindi ${target.url}` : `rədd edildi: ${target.error}`,
    );
  }

  check(
    "safe-url: 2000 simvoldan uzun unvan rədd olunur",
    !normalizeTargetUrl(`https://example.com/${"a".repeat(2100)}`).ok,
    "hedsiz uzun unvan qebul edildi",
  );

  check(
    "safe-url: parseIpv6 sixilmani ve IPv4 quyrugunu duz oxuyur",
    parseIpv6("::1")?.[15] === 1 &&
      parseIpv6("fe80::1")?.[0] === 0xfe &&
      parseIpv6("::ffff:192.168.0.1")?.[12] === 192 &&
      parseIpv6("1::2::3") === null &&
      parseIpv6("nothing") === null,
    "IPv6 oxunusu duzgun deyil",
  );

  check(
    "safe-url: basliqlar modulu hemin funksiyalari geri ixrac edir",
    basliqlar.isBlockedAddress === isBlockedAddress &&
      basliqlar.normalizeTargetUrl === normalizeTargetUrl &&
      basliqlar.parseIpv4 === parseIpv4 &&
      basliqlar.parseIpv6 === parseIpv6,
    "re-export qirilib - basliqlar aletinin oz hallari ve marsrutu sinacaq",
  );
};
