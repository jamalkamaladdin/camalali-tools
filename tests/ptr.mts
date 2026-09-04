/*
 * The PTR tool's own arithmetic — parsing what the visitor typed and
 * comparing addresses — proven without a resolver. The live lookups
 * (`dns.reverse`, `resolve4`/`resolve6`) live in the route; everything here
 * is string and byte comparison, which is what actually decides whether the
 * forward and reverse records agree.
 */
import type { CheckSuite } from "./harness.mts";
import { buildNameCheck, buildPtrReport, checkIpAddress, ipsEqual, isConsistent } from "../lib/ptr";

export const checks: CheckSuite = (check) => {
  /* ---- input validation ---- */

  check(
    "ptr: duzgun IPv4 qebul edilir, ailesi 4-dur",
    checkIpAddress("93.184.216.34").ok === true &&
      (checkIpAddress("93.184.216.34") as { family: number }).family === 4,
    `alindi ${JSON.stringify(checkIpAddress("93.184.216.34"))}`,
  );

  check(
    "ptr: duzgun IPv6 qebul edilir, ailesi 6-dir",
    checkIpAddress("2606:2800:220:1::248").ok === true &&
      (checkIpAddress("2606:2800:220:1::248") as { family: number }).family === 6,
    `alindi ${JSON.stringify(checkIpAddress("2606:2800:220:1::248"))}`,
  );

  check(
    "ptr: host adi IP kimi qebul edilmir",
    checkIpAddress("example.com").ok === false,
    `alindi ${JSON.stringify(checkIpAddress("example.com"))}`,
  );

  check("ptr: bos setir redd edilir", checkIpAddress("   ").ok === false, `alindi ${JSON.stringify(checkIpAddress("   "))}`);

  /* ---- address comparison ---- */

  check(
    "ptr: eyni IPv4 uygun sayilir, ferqli olan sayilmir",
    ipsEqual("93.184.216.34", "93.184.216.34") && !ipsEqual("93.184.216.34", "93.184.216.35"),
    "IPv4 muqayisesi yanlis netice verdi",
  );

  check(
    "ptr: sixilmis ve acilmis IPv6 yazilisi eyni unvan sayilir",
    ipsEqual("2606:2800:220:1::248", "2606:2800:0220:0001:0000:0000:0000:0248"),
    "IPv6 sixilmis form tanilmadi",
  );

  check(
    "ptr: IPv4 setri ile tamamile ferqli IPv6 setri hec vaxt uygun sayilmir",
    !ipsEqual("93.184.216.34", "::1"),
    "ferqli aileli unvanlar sehven uygun sayildi",
  );

  check(
    "ptr: oxunmayan unvan uygun sayilmir, throw etmir",
    !ipsEqual("not-an-ip", "93.184.216.34"),
    "oxunmayan unvan sehv qiymetlendirildi",
  );

  /* ---- per-name check ---- */

  check(
    "ptr: irəli hell olunan unvanlar arasinda orijinal varsa uygun sayilir",
    buildNameCheck("93.184.216.34", "example.com", ["93.184.216.34"], null).matchesOriginal,
    "uygun hal tanilmadi",
  );

  check(
    "ptr: irəli hell fergli unvan qaytairanda uygunsuz sayilir, xeta oturulur",
    !buildNameCheck("93.184.216.34", "example.com", ["93.184.216.99"], null).matchesOriginal &&
      buildNameCheck("93.184.216.34", "example.com", [], "ENOTFOUND").forwardError === "ENOTFOUND",
    "uygunsuzluq ve xeta dogru daşınmadı",
  );

  /* ---- overall consistency ---- */

  check("ptr: bos siyahi uygun sayilmir", !isConsistent([]), "bos siyahi uygun sayildi");

  check(
    "ptr: en azi bir uygun ad varsa netice uygundur",
    isConsistent([
      buildNameCheck("1.2.3.4", "a.example.com", ["9.9.9.9"], null),
      buildNameCheck("1.2.3.4", "b.example.com", ["1.2.3.4"], null),
    ]),
    "uygun ad tapilmasina baxmayaraq netice yanlis cixdi",
  );

  /* ---- assembled report ---- */

  {
    const checksList = [buildNameCheck("1.2.3.4", "a.example.com", ["1.2.3.4"], null)];
    const report = buildPtrReport("1.2.3.4", 4, checksList);
    check(
      "ptr: hesabatda ptrNames ve consistent dogru qurulur",
      report.ptrNames.join(",") === "a.example.com" && report.consistent === true && report.family === 4,
      `alindi ${JSON.stringify(report)}`,
    );
  }
};
