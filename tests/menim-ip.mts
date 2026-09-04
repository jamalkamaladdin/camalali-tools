/*
 * The three wire formats `menim-ip.ts` parses, checked with no network.
 *
 * Team Cymru's TXT answers and RDAP's JSON both come from services this
 * suite never calls — every fixture below is copied verbatim (or trimmed to
 * the fields actually read) from a real answer, because a hand-typed
 * approximation of a wire format is exactly the kind of fixture that stops
 * catching the bug it was written for. The query-name builders get one
 * known-answer case each, asserting the full string: a single swapped octet
 * or an unreversed nibble sends the DNS query to a name that will never
 * answer, and nothing else in the tool would notice until a real address
 * came back empty.
 */
import type { CheckSuite } from "./harness.mts";
import {
  cymruIpv4QueryName,
  cymruIpv6QueryName,
  extractRdapInfo,
  parseCymruAsName,
  parseCymruOrigin,
  parseUserAgent,
} from "../lib/menim-ip";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0";

/* An ARIN network object, trimmed to the four fields `extractRdapInfo` reads
   — the real response also carries `links`, `events`, `remarks` and more,
   none of which this tool shows. */
const RDAP_FIXTURE = {
  handle: "NET-8-8-8-0-1",
  name: "LVLT-GOGL-8-8-8",
  country: "US",
  entities: [
    {
      handle: "GOGL",
      roles: ["registrant"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "Google LLC"],
        ],
      ],
    },
  ],
};

export const checks: CheckSuite = (check) => {
  /* ---------- Team Cymru: origin ASN ---------- */

  const origin = parseCymruOrigin("15169 | 8.8.8.0/24 | US | arin | 1992-12-01");
  check(
    "menim-ip: cymru origin bilinen cavabi tam oxuyur",
    origin.ok &&
      origin.origin.asn === 15169 &&
      origin.origin.prefix === "8.8.8.0/24" &&
      origin.origin.country === "US" &&
      origin.origin.registry === "arin" &&
      origin.origin.allocated === "1992-12-01",
    `origin: ${JSON.stringify(origin)}`,
  );

  const shortOrigin = parseCymruOrigin("15169 | 8.8.8.0/24");
  check(
    "menim-ip: cymru origin qisa cavabda catisan sahe null-dur, bos setir deyil",
    shortOrigin.ok &&
      shortOrigin.origin.country === null &&
      shortOrigin.origin.registry === null &&
      shortOrigin.origin.allocated === null,
    `origin: ${JSON.stringify(shortOrigin)}`,
  );

  const malformedOrigin = parseCymruOrigin("bu cavab deyil");
  check(
    "menim-ip: cymru origin pozulmus cavab xeta qaytarir, atmir",
    malformedOrigin.ok === false && typeof malformedOrigin.error === "string",
    `origin: ${JSON.stringify(malformedOrigin)}`,
  );

  const asName = parseCymruAsName("15169 | US | arin | 2000-03-30 | GOOGLE, US");
  check(
    "menim-ip: cymru AS adi besinci saheden oxunur",
    asName === "GOOGLE, US",
    `asName: ${JSON.stringify(asName)}`,
  );

  const missingAsName = parseCymruAsName("15169 | US | arin | 2000-03-30");
  check(
    "menim-ip: cymru AS adi yoxdursa null qaytarir",
    missingAsName === null,
    `asName: ${JSON.stringify(missingAsName)}`,
  );

  /* ---------- reversed query names ---------- */

  check(
    "menim-ip: ipv4 sorgu adi tam tersine cevrilir",
    cymruIpv4QueryName("8.8.4.4") === "4.4.8.8.origin.asn.cymru.com",
    `ad: ${cymruIpv4QueryName("8.8.4.4")}`,
  );

  check(
    "menim-ip: yararsiz ipv4 sorgu adi null qaytarir",
    cymruIpv4QueryName("8.8.4.400") === null,
    `ad: ${JSON.stringify(cymruIpv4QueryName("8.8.4.400"))}`,
  );

  /* 2001:4860:4860::8888 expands to
     2001:4860:4860:0000:0000:0000:0000:8888 — 32 hex nibbles, reversed and
     dot-joined under `origin6.asn.cymru.com`. */
  const ipv6Name = cymruIpv6QueryName("2001:4860:4860::8888");
  check(
    "menim-ip: ipv6 sorgu adi tam nibble tersine cevrilir",
    ipv6Name ===
      "8.8.8.8.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.6.8.4.0.6.8.4.1.0.0.2.origin6.asn.cymru.com",
    `ad: ${ipv6Name}`,
  );

  /* ---------- RDAP extraction ---------- */

  const rdap = extractRdapInfo(RDAP_FIXTURE);
  check(
    "menim-ip: rdap sebeke adi, olke ve teskilat cixarilir",
    rdap.networkName === "LVLT-GOGL-8-8-8" && rdap.country === "US" && rdap.organisation === "Google LLC",
    `rdap: ${JSON.stringify(rdap)}`,
  );

  const rdapNoEntities = extractRdapInfo({ handle: "NET-1", name: "SOME-NET", country: "DE" });
  check(
    "menim-ip: entities olmayan rdap qismi netice qaytarir, atmir",
    rdapNoEntities.networkName === "SOME-NET" &&
      rdapNoEntities.country === "DE" &&
      rdapNoEntities.organisation === null,
    `rdap: ${JSON.stringify(rdapNoEntities)}`,
  );

  const rdapGarbage = extractRdapInfo("bu json deyil");
  check(
    "menim-ip: obyekt olmayan rdap cavabi dord null qaytarir, atmir",
    rdapGarbage.networkName === null &&
      rdapGarbage.handle === null &&
      rdapGarbage.country === null &&
      rdapGarbage.organisation === null,
    `rdap: ${JSON.stringify(rdapGarbage)}`,
  );

  /* ---------- User-Agent parsing ---------- */

  const chrome = parseUserAgent(CHROME_WINDOWS);
  check(
    "menim-ip: chrome/windows ua duzgun oxunur",
    chrome.browser === "Chrome" && chrome.engine === "Blink" && chrome.platform === "Windows",
    `chrome: ${JSON.stringify(chrome)}`,
  );

  const safari = parseUserAgent(SAFARI_IOS);
  check(
    "menim-ip: safari/ios ua duzgun oxunur",
    safari.browser === "Safari" && safari.engine === "WebKit" && safari.platform === "iOS",
    `safari: ${JSON.stringify(safari)}`,
  );

  const firefox = parseUserAgent(FIREFOX_LINUX);
  check(
    "menim-ip: firefox/linux ua duzgun oxunur",
    firefox.browser === "Firefox" && firefox.engine === "Gecko" && firefox.platform === "Linux",
    `firefox: ${JSON.stringify(firefox)}`,
  );

  const nonsense = parseUserAgent("this is not any kind of browser string at all 12345");
  check(
    "menim-ip: namelum ua setri yalan cavab yox, 'namelum' qaytarir",
    nonsense.browser === "naməlum" && nonsense.engine === "naməlum" && nonsense.platform === "naməlum",
    `nonsense: ${JSON.stringify(nonsense)}`,
  );
};
