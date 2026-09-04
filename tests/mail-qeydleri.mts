/*
 * The parsing and the audit behind `mail-qeydleri`, checked with fixed
 * strings and no resolver — network stays in the route, everything a wrong
 * edit could silently break lives here instead.
 *
 * Two cases matter more than they look. The TXT chunk join has to use no
 * separator: a DKIM key past 255 bytes arrives split into several chunks,
 * and a space dropped between them corrupts the base64 with no error
 * anywhere downstream. And `isSpfRecord` has to check the start of the
 * string, not any substring — a TXT record that merely mentions `v=spf1` in
 * a sentence is somebody else's text, not a second SPF record to flag.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildDkimSelectorList,
  buildMailFindings,
  buildMxReport,
  describeDkimTxt,
  dkimSelectorHost,
  DKIM_SELECTORS,
  isDmarcRecord,
  isSpfRecord,
  joinTxtChunks,
  parseDmarc,
  sortMxRecords,
  spfAllQualifier,
} from "../lib/mail-qeydleri";

export const checks: CheckSuite = (check) => {
  check(
    "mail-qeydleri: TXT parcalari ayiricisiz birlesir",
    joinTxtChunks(["v=DKIM1; p=AAA", "BBB"]) === "v=DKIM1; p=AAABBB",
    `got: ${JSON.stringify(joinTxtChunks(["v=DKIM1; p=AAA", "BBB"]))}`,
  );

  check(
    "mail-qeydleri: v=spf1 yalniz setrin basinda oldugda SPF sayilir",
    isSpfRecord("v=spf1 include:_spf.google.com -all") === true &&
      isSpfRecord("bax buna v=spf1 include:x.com -all deyilir") === false,
    `basda: ${isSpfRecord("v=spf1 include:_spf.google.com -all")}, ortada: ${isSpfRecord("bax buna v=spf1 include:x.com -all deyilir")}`,
  );

  check(
    "mail-qeydleri: all mexanizminin kefiyyet gostericisi duzgun oxunur",
    spfAllQualifier("v=spf1 -all") === "fail" &&
      spfAllQualifier("v=spf1 +all") === "pass" &&
      spfAllQualifier("v=spf1 include:_spf.google.com") === null,
    `-all: ${spfAllQualifier("v=spf1 -all")}, +all: ${spfAllQualifier("v=spf1 +all")}, yoxdur: ${spfAllQualifier("v=spf1 include:_spf.google.com")}`,
  );

  check(
    "mail-qeydleri: iki SPF qeydi auditin basinda xeberdarliq verir",
    buildMailFindings({
      mx: [{ priority: 10, host: "mail.example.com" }],
      nullMx: false,
      spfRecords: ["v=spf1 -all", "v=spf1 include:other.com -all"],
      dmarc: null,
    })[0]?.title === "Birdən çox SPF qeydi var",
    `first finding: ${JSON.stringify(
      buildMailFindings({
        mx: [{ priority: 10, host: "mail.example.com" }],
        nullMx: false,
        spfRecords: ["v=spf1 -all", "v=spf1 include:other.com -all"],
        dmarc: null,
      })[0],
    )}`,
  );

  check(
    "mail-qeydleri: +all tapinti yaradir, -all yaratmir",
    buildMailFindings({
      mx: [{ priority: 10, host: "mail.example.com" }],
      nullMx: false,
      spfRecords: ["v=spf1 +all"],
      dmarc: null,
    }).some((f) => f.title.includes("+all")) &&
      !buildMailFindings({
        mx: [{ priority: 10, host: "mail.example.com" }],
        nullMx: false,
        spfRecords: ["v=spf1 -all"],
        dmarc: null,
      }).some((f) => f.title.includes("+all")),
    "beklenen: +all tapinti icinde, -all icin yoxdur",
  );

  check(
    "mail-qeydleri: tek '.' hedefi RFC 7505 null MX kimi oxunur, beraber prioritet sabit qalir",
    buildMxReport([{ priority: 0, host: "." }]).nullMx === true &&
      sortMxRecords([
        { priority: 20, host: "b.example.com" },
        { priority: 10, host: "a.example.com" },
        { priority: 10, host: "z.example.com" },
      ]).map((r) => r.host).join(",") === "a.example.com,z.example.com,b.example.com",
    `nullMx: ${buildMxReport([{ priority: 0, host: "." }]).nullMx}, sirali: ${JSON.stringify(
      sortMxRecords([
        { priority: 20, host: "b.example.com" },
        { priority: 10, host: "a.example.com" },
        { priority: 10, host: "z.example.com" },
      ]).map((r) => r.host),
    )}`,
  );

  check(
    "mail-qeydleri: DMARC tagleri oxunur, v=dmarc1 basliqli setir tanınir",
    (() => {
      const parsed = parseDmarc("v=DMARC1; p=reject; sp=quarantine; pct=50; rua=mailto:d@x.com");
      return (
        parsed.policy === "reject" &&
        parsed.subdomainPolicy === "quarantine" &&
        parsed.percent === 50 &&
        parsed.rua[0] === "mailto:d@x.com" &&
        isDmarcRecord("v=DMARC1; p=none") === true &&
        isDmarcRecord("v=spf1 -all") === false
      );
    })(),
    `parsed: ${JSON.stringify(parseDmarc("v=DMARC1; p=reject; sp=quarantine; pct=50; rua=mailto:d@x.com"))}`,
  );

  check(
    "mail-qeydleri: p=none tapinti yaradir, p=reject yaratmir",
    buildMailFindings({
      mx: [{ priority: 10, host: "mail.example.com" }],
      nullMx: false,
      spfRecords: ["v=spf1 -all"],
      dmarc: parseDmarc("v=DMARC1; p=none"),
    }).some((f) => f.title.includes("izləyir")) &&
      !buildMailFindings({
        mx: [{ priority: 10, host: "mail.example.com" }],
        nullMx: false,
        spfRecords: ["v=spf1 -all"],
        dmarc: parseDmarc("v=DMARC1; p=reject"),
      }).some((f) => f.title.includes("izləyir")),
    "beklenen: p=none ucun tapinti var, p=reject ucun yoxdur",
  );

  check(
    "mail-qeydleri: MX var SPF yoxdur ile hec biri yoxdur ferqli tapinti verir",
    buildMailFindings({
      mx: [{ priority: 10, host: "mail.example.com" }],
      nullMx: false,
      spfRecords: [],
      dmarc: null,
    }).some((f) => f.title === "SPF qeydi yoxdur") &&
      !buildMailFindings({ mx: [], nullMx: false, spfRecords: [], dmarc: null }).some(
        (f) => f.title === "SPF qeydi yoxdur",
      ),
    `mxNoSpf: ${JSON.stringify(
      buildMailFindings({ mx: [{ priority: 10, host: "mail.example.com" }], nullMx: false, spfRecords: [], dmarc: null }).map((f) => f.title),
    )}, neither: ${JSON.stringify(buildMailFindings({ mx: [], nullMx: false, spfRecords: [], dmarc: null }).map((f) => f.title))}`,
  );

  check(
    "mail-qeydleri: bos cavab seti 'konfiqurasiya yoxdur' deyir, bos siyahi qaytarmir",
    (() => {
      const findings = buildMailFindings({ mx: [], nullMx: false, spfRecords: [], dmarc: null });
      return findings.length > 0 && findings.some((f) => f.title.includes("konfiqurasiya"));
    })(),
    `got: ${JSON.stringify(buildMailFindings({ mx: [], nullMx: false, spfRecords: [], dmarc: null }).map((f) => f.title))}`,
  );

  check(
    "mail-qeydleri: secici siyahisi tekrarsizdir",
    new Set(DKIM_SELECTORS.map((s) => s.toLowerCase())).size === DKIM_SELECTORS.length,
    `count: ${DKIM_SELECTORS.length}, unique: ${new Set(DKIM_SELECTORS.map((s) => s.toLowerCase())).size}`,
  );

  check(
    "mail-qeydleri: movcud secici tekrarlanmir, yeni secici elave olunur",
    buildDkimSelectorList("google").length === DKIM_SELECTORS.length &&
      buildDkimSelectorList("s2048custom").length === DKIM_SELECTORS.length + 1 &&
      buildDkimSelectorList("s2048custom").includes("s2048custom"),
    `existing: ${buildDkimSelectorList("google").length}, new: ${buildDkimSelectorList("s2048custom").length}`,
  );

  check(
    "mail-qeydleri: secici host adi selector._domainkey.domain duzgun qurulur",
    dkimSelectorHost("example.com", "google") === "google._domainkey.example.com",
    `got: ${dkimSelectorHost("example.com", "google")}`,
  );

  check(
    "mail-qeydleri: geri gotururlmus DKIM acari (bos p=) revoked kimi oxunur",
    describeDkimTxt("v=DKIM1; k=rsa; p=").revoked === true &&
      describeDkimTxt("v=DKIM1; p=ABCXYZ").revoked === false,
    `revoked: ${describeDkimTxt("v=DKIM1; k=rsa; p=").revoked}, active: ${describeDkimTxt("v=DKIM1; p=ABCXYZ").revoked}`,
  );
};
