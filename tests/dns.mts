/*
 * The DNS tool's judgements, checked without a resolver.
 *
 * Deliberately offline: the interesting part of this tool is not that it can
 * ask a name server, it is what it says about the answer - which SPF record is
 * decorative, which DMARC policy blocks nothing, which mail server is tried
 * first. All of that is arithmetic on strings and all of it is provable here.
 *
 * Two cases compare against published references rather than against this
 * code's own output: Google Workspace's documented SPF line and the DMARC
 * example from RFC 7489 appendix B.2.1.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildFindings,
  classifyTxt,
  describeCaa,
  describeDkim,
  describeDmarc,
  describeSpf,
  dmarcName,
  dnsErrorMessage,
  normalizeDomain,
  sortMxRecords,
  type DnsSection,
  type DnsType,
  type TxtInsight,
} from "../lib/dns";

function domainOf(raw: string): string | null {
  const result = normalizeDomain(raw);
  return result.ok ? result.domain : null;
}

function section(type: DnsType, values: string[]): DnsSection {
  return {
    type,
    status: values.length > 0 ? "ok" : "empty",
    records: values.map((value) => ({ type, value, ttl: null })),
    message: values.length > 0 ? null : "yox",
  };
}

function titles(findings: { title: string }[]): string[] {
  return findings.map((finding) => finding.title);
}

export const checks: CheckSuite = (check) => {
  /* ---- domain validation ---- */

  check(
    "dns: unvan sxemi, yolu ve www ile birlikde temizlenir",
    domainOf("  HTTPS://Www.Example.COM/a/b?q=1#z  ") === "www.example.com",
    `alindi ${domainOf("  HTTPS://Www.Example.COM/a/b?q=1#z  ")}`,
  );

  check(
    "dns: e-poct unvanindan domen cixarilir ve kok noqtesi atilir",
    domainOf("camal@example.az.") === "example.az",
    `alindi ${domainOf("camal@example.az.")}`,
  );

  /* Azerbaijani letters are the reason this path exists: a resolver only
     speaks ASCII, so the tool has to punycode before it asks. */
  check(
    "dns: azerbaycan herfli domen punycode-a cevrilir",
    domainOf("ə.az") === "xn--sna.az",
    `alindi ${domainOf("ə.az")}`,
  );

  check(
    "dns: tek hisseli ad (localhost) redd edilir",
    domainOf("localhost") === null,
    "localhost domen kimi qebul edildi",
  );

  check(
    "dns: IPv4 literali redd edilir",
    domainOf("192.0.2.10") === null && domainOf("http://8.8.8.8/") === null,
    "IP unvani domen kimi qebul edildi",
  );

  check(
    "dns: 64 simvolluq etiket redd edilir, 63 qebul edilir",
    domainOf(`${"a".repeat(64)}.com`) === null &&
      domainOf(`${"a".repeat(63)}.com`) === `${"a".repeat(63)}.com`,
    "etiket uzunlugu heddi tetbiq edilmedi",
  );

  check(
    "dns: alt xett olan etiket redd edilir",
    domainOf("_dmarc.example.com") === null && domainOf("a_b.example.com") === null,
    "alt xett olan etiket qebul edildi",
  );

  check(
    "dns: bos ve reqemli TLD redd edilir",
    domainOf("") === null && domainOf("   ") === null && domainOf("example.123") === null,
    "bos ve ya reqemli TLD qebul edildi",
  );

  check(
    "dns: DMARC adi domenin ozunde yox, _dmarc altinda axtarilir",
    dmarcName("example.com") === "_dmarc.example.com",
    `alindi ${dmarcName("example.com")}`,
  );

  /* ---- SPF ---- */

  /* Reference: the SPF line Google Workspace tells every customer to publish. */
  {
    const spf = describeSpf("v=spf1 include:_spf.google.com ~all");
    check(
      "dns: Google Workspace-in elan etdiyi SPF setri duzgun oxunur",
      spf.all === "softfail" &&
        spf.lookups === 1 &&
        spf.includes.length === 1 &&
        spf.includes[0] === "_spf.google.com" &&
        !spf.overLimit,
      `alindi all=${spf.all} lookups=${spf.lookups} includes=${spf.includes.join(",")}`,
    );
  }

  /* Reference: RFC 7208 section 4.6.4 caps DNS-costing mechanisms at ten. */
  {
    const spf = describeSpf(
      "v=spf1 a mx ptr exists:%{i}.spf.example.com include:one.com include:two.com " +
        "include:three.com include:four.com include:five.com include:six.com include:seven.com -all",
    );
    check(
      "dns: RFC 7208 10 sorgu limiti asilanda isarelenir",
      spf.lookups === 11 && spf.overLimit && spf.all === "fail" && spf.includes.length === 7,
      `alindi lookups=${spf.lookups} overLimit=${spf.overLimit} all=${spf.all}`,
    );
  }

  {
    const spf = describeSpf("v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 redirect=_spf.example.com");
    check(
      "dns: redirect bir sorgu sayilir, ip4/ip6 sayilmir",
      spf.lookups === 1 &&
        spf.redirect === "_spf.example.com" &&
        spf.ipRanges.length === 2 &&
        spf.all === null,
      `alindi lookups=${spf.lookups} redirect=${spf.redirect} ranges=${spf.ipRanges.length}`,
    );
  }

  {
    const insight = classifyTxt("v=spf1 include:mail.example.com +all");
    check(
      "dns: +all olan SPF zeif kimi isarelenir",
      insight.kind === "spf" && insight.weak,
      `alindi kind=${insight.kind} weak=${insight.weak}`,
    );
  }

  /* ---- DMARC ---- */

  /* Reference: RFC 7489 appendix B.2.1, the "report only" example record. */
  {
    const dmarc = describeDmarc("v=DMARC1; p=none; rua=mailto:dmarc-feedback@example.com");
    check(
      "dns: RFC 7489 B.2.1 numunesi p=none, pct=100, bir rua kimi oxunur",
      dmarc.policy === "none" &&
        dmarc.percent === 100 &&
        dmarc.rua.length === 1 &&
        dmarc.subdomainPolicy === null,
      `alindi policy=${dmarc.policy} pct=${dmarc.percent} rua=${dmarc.rua.length}`,
    );
  }

  {
    const dmarc = describeDmarc("v=DMARC1;p=reject;sp=quarantine;pct=250;adkim=s;aspf=r");
    check(
      "dns: pct 100-den boyuk yazilanda kesilir, sp ve adkim oxunur",
      dmarc.percent === 100 &&
        dmarc.policy === "reject" &&
        dmarc.subdomainPolicy === "quarantine" &&
        dmarc.strictDkim &&
        !dmarc.strictSpf,
      `alindi pct=${dmarc.percent} sp=${dmarc.subdomainPolicy} adkim=${dmarc.strictDkim}`,
    );
  }

  {
    const insight = classifyTxt("v=DMARC1; p=quarantine; pct=10");
    check(
      "dns: pct<100 olan DMARC hele qoruma vermir kimi isarelenir",
      insight.kind === "dmarc" && insight.weak,
      `alindi kind=${insight.kind} weak=${insight.weak}`,
    );
  }

  /* ---- DKIM ve digerleri ---- */

  {
    const dkim = describeDkim("v=DKIM1; k=rsa; t=y; p=");
    check(
      "dns: bos p= acarin geri goturulmesi kimi oxunur, t=y test rejimidir",
      dkim.revoked && dkim.testMode && dkim.keyType === "rsa",
      `alindi revoked=${dkim.revoked} test=${dkim.testMode} k=${dkim.keyType}`,
    );
  }

  check(
    "dns: google-site-verification sahiblik tesdiqi kimi taninir",
    classifyTxt("google-site-verification=abc123").kind === "verification",
    `alindi ${classifyTxt("google-site-verification=abc123").kind}`,
  );

  check(
    "dns: taninmayan TXT 'other' qalir ve zeif sayilmir",
    classifyTxt("hello world").kind === "other" && !classifyTxt("hello world").weak,
    "taninmayan TXT sehv tesnif edildi",
  );

  /* ---- MX ---- */

  {
    /* Real published Gmail records, handed over in the order a resolver
       actually returned them - the rotation is the point. */
    const sorted = sortMxRecords([
      { priority: 20, value: "alt2.gmail-smtp-in.l.google.com" },
      { priority: 40, value: "alt4.gmail-smtp-in.l.google.com" },
      { priority: 5, value: "gmail-smtp-in.l.google.com" },
      { priority: 10, value: "alt1.gmail-smtp-in.l.google.com" },
      { priority: 30, value: "alt3.gmail-smtp-in.l.google.com" },
    ]);
    check(
      "dns: MX-ler prioritete gore siralanir",
      sorted.map((record) => record.priority).join(",") === "5,10,20,30,40",
      `alindi ${sorted.map((record) => record.priority).join(",")}`,
    );
  }

  {
    const sorted = sortMxRecords([
      { priority: 10, value: "mx2.example.com" },
      { priority: 10, value: "mx1.example.com" },
    ]);
    check(
      "dns: beraber prioritetde ad sirasi sabit qalir",
      sorted[0].value === "mx1.example.com",
      `alindi ${sorted[0].value}`,
    );
  }

  /* ---- CAA ve xeta metnleri ---- */

  check(
    "dns: tek noqte-vergul CAA-da 'hec kim' demekdir",
    describeCaa("issue", ";").includes("Heç bir mərkəz") &&
      describeCaa("issue", "letsencrypt.org").includes("letsencrypt.org"),
    `alindi ${describeCaa("issue", ";")}`,
  );

  check(
    "dns: taninmayan resolver kodu umumi cumle qaytarir, bos yox",
    dnsErrorMessage("ESOMETHING").length > 0 &&
      dnsErrorMessage("ENOTFOUND") !== dnsErrorMessage("ENODATA"),
    "xeta metnleri ferqlendirilmedi",
  );

  /* ---- yekun neticeler ---- */

  {
    const sections = [
      section("A", ["93.184.216.34"]),
      section("AAAA", []),
      section("CNAME", []),
      section("MX", ["mail.example.com"]),
      section("TXT", ["google-site-verification=x"]),
      section("NS", ["ns1.example.com"]),
      section("SOA", ["ns1.example.com hostmaster 1"]),
      section("CAA", []),
    ];
    const txt: TxtInsight[] = [classifyTxt("google-site-verification=x")];
    const found = titles(buildFindings(sections, txt, null));
    check(
      "dns: MX var, SPF ve DMARC yoxdursa ikisi de xeberdarliq kimi cixir",
      found.includes("SPF qeydi yoxdur") && found.includes("DMARC qeydi yoxdur"),
      `alindi ${found.join(" | ")}`,
    );
    check(
      "dns: CAA ve IPv6 catismazligi melumat kimi qeyd olunur",
      found.includes("CAA qeydi yoxdur") && found.includes("IPv6 ünvanı yoxdur"),
      `alindi ${found.join(" | ")}`,
    );
  }

  {
    const sections = [
      section("A", []),
      section("AAAA", []),
      section("CNAME", []),
      section("MX", []),
      section("TXT", []),
      section("NS", []),
      section("SOA", []),
      section("CAA", []),
    ];
    const found = titles(buildFindings(sections, [], null));
    check(
      "dns: hec bir unvan qeydi yoxdursa bu birinci netice olur",
      found[0] === "Domen IP ünvanına həll olunmur" && found.includes("NS qeydi görünmür"),
      `alindi ${found.join(" | ")}`,
    );
    check(
      "dns: MX yoxdursa SPF/DMARC xeberdarligi verilmir",
      !found.includes("SPF qeydi yoxdur") && found.includes("E-poçt qəbulu qurulmayıb"),
      `alindi ${found.join(" | ")}`,
    );
  }
};
