/*
 * The subdomain tool's cases. None of them talks to crt.sh.
 *
 * The fixture rows are shaped the way the real feed is — field names, the
 * newline-separated SAN list, the zoneless `not_before` timestamp — and were
 * copied from an actual `crt.sh/?q=camalali.com&output=json` answer on
 * 2026-09-03. What is being proved is the folding: a feed that names the same
 * host twenty-four times, once with a star in front of it, has to come out as
 * one line with the earliest date on it.
 */
import type { CheckSuite } from "./harness.mts";
import {
  collectSubdomains,
  isValidDomain,
  normaliseDomain,
  parseCrtRows,
  readDomain,
  SUBDOMAIN_LIMIT,
} from "../lib/subdomen";

const ROWS = [
  {
    common_name: "tools.camalali.com",
    name_value: "tools.camalali.com",
    not_before: "2026-08-31T23:53:20",
  },
  {
    common_name: "camalali.com",
    name_value: "camalali.com\nwww.camalali.com",
    not_before: "2025-02-14T10:00:00",
  },
  {
    // A renewal of the same names, later. The earlier date has to survive it.
    common_name: "camalali.com",
    name_value: "camalali.com\nwww.camalali.com",
    not_before: "2026-05-01T10:00:00",
  },
  {
    common_name: "*.camalali.com",
    name_value: "*.camalali.com\nadmin.camalali.com",
    not_before: "2024-11-02T08:30:00",
  },
  {
    // Neither of these belongs under the queried domain, and the second is the
    // one field in this feed that could name a person.
    common_name: "baska.com",
    name_value: "baska.com\nsahib@camalali.com",
    not_before: "2026-01-01T00:00:00",
  },
];

export const checks: CheckSuite = (check) => {
  check(
    "subdomen: adi domen ve cox seviyyeli domen qebul edilir",
    isValidDomain("camalali.com") &&
      isValidDomain("staging.api.example.co.uk") &&
      isValidDomain("xn--80ak6aa92e.com"),
    "duzgun domenlerden biri redd edildi",
  );

  check(
    "subdomen: yanlis formalar redd edilir",
    !isValidDomain("camalali") &&
      !isValidDomain("-pis.com") &&
      !isValidDomain("pis-.com") &&
      !isValidDomain("bos..com") &&
      !isValidDomain("") &&
      !isValidDomain("192.168.1.1"),
    "yanlis formalardan biri kecdi",
  );

  check(
    "subdomen: butov unvan domene qeder qisaldilir",
    normaliseDomain("HTTPS://WWW.Example.com:8443/path?x=1#top") === "example.com",
    `alindi ${normaliseDomain("HTTPS://WWW.Example.com:8443/path?x=1#top")}`,
  );

  check(
    "subdomen: sondaki nokte atilir, tek etiketli www saxlanilir",
    normaliseDomain("camalali.com.") === "camalali.com" && normaliseDomain("www.az") === "www.az",
    `alindi ${normaliseDomain("camalali.com.")} / ${normaliseDomain("www.az")}`,
  );

  const az = readDomain("möhkəm.az");
  check(
    "subdomen: latindan kenar herf punycode mesaji verir",
    !az.ok && az.error.includes("punycode"),
    az.ok ? "qebul edildi" : `mesaj: ${az.error}`,
  );

  const empty = readDomain("   ");
  check(
    "subdomen: bos giris oz mesajini alir",
    !empty.ok && empty.error.includes("Domen adı yaz"),
    empty.ok ? "qebul edildi" : `mesaj: ${empty.error}`,
  );

  check(
    "subdomen: html cavabi null kimi oxunur, massiv ise oxunur",
    parseCrtRows("<html>502</html>") === null && parseCrtRows("[]")?.length === 0,
    "json oxunusu gozlenilmeyen netice verdi",
  );

  const result = collectSubdomains(ROWS, "camalali.com");

  check(
    "subdomen: tekrarlar birlesir, joker acilir, kenar adlar atilir",
    result.total === 4,
    `alindi ${result.total}: ${result.entries.map((entry) => entry.name).join(",")}`,
  );

  check(
    "subdomen: kenar domen ve e-poct siyahiya dusmur",
    !result.entries.some((entry) => entry.name === "baska.com" || entry.name.includes("@")),
    `siyahi: ${result.entries.map((entry) => entry.name).join(",")}`,
  );

  check(
    "subdomen: joker qeydler sayilir",
    result.wildcards === 2,
    `alindi ${result.wildcards}`,
  );

  check(
    "subdomen: adlar elifba sirasindadir",
    result.entries.map((entry) => entry.name).join(",") ===
      "admin.camalali.com,camalali.com,tools.camalali.com,www.camalali.com",
    `alindi ${result.entries.map((entry) => entry.name).join(",")}`,
  );

  check(
    "subdomen: eyni ad ucun en erken tarix saxlanilir",
    result.entries.find((entry) => entry.name === "camalali.com")?.firstSeen === "2024-11-02",
    `alindi ${result.entries.find((entry) => entry.name === "camalali.com")?.firstSeen}`,
  );

  const limited = collectSubdomains(ROWS, "camalali.com", 2);
  check(
    "subdomen: hedd tetbiq olunur ve gizlenen say duzgun sayilir",
    limited.entries.length === 2 && limited.total === 4 && limited.hidden === 2,
    `alindi ${limited.entries.length}/${limited.total}/${limited.hidden}`,
  );

  check(
    "subdomen: zibil giris cokdurmur",
    collectSubdomains(null, "camalali.com").total === 0 &&
      collectSubdomains([null, "salam", 7, { name_value: 42 }], "camalali.com").total === 0,
    "zibil giris netice verdi",
  );

  const pasted = readDomain("https://www.camalali.com/bloq/");
  check(
    "subdomen: yapisdirilan unvan normallasib qebul edilir",
    pasted.ok && pasted.domain === "camalali.com",
    pasted.ok ? `alindi ${pasted.domain}` : `redd edildi: ${pasted.error}`,
  );

  check(
    "subdomen: susmaya gore hedd 300-dur",
    collectSubdomains(ROWS, "camalali.com").entries.length ===
      Math.min(4, SUBDOMAIN_LIMIT),
    `alindi ${collectSubdomains(ROWS, "camalali.com").entries.length}`,
  );
};
