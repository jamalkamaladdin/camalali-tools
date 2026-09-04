/**
 * Everything about a domain's DNS records that can be decided without asking a
 * resolver: whether what the visitor typed is a domain at all, which TXT
 * record is an SPF/DMARC/DKIM policy, whether that policy actually does
 * anything, and what the collected answers add up to.
 *
 * The resolving itself lives in `/api/alet/dns` because it needs Node's
 * resolver, and the split is the point: nothing that needs a network is
 * testable offline, so every judgement the tool makes is here instead, where
 * `scripts/tools-checks/dns.mts` can prove it.
 */

/** The eight types the tool asks for, in the order a zone file usually lists them. */
export const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA"] as const;

export type DnsType = (typeof DNS_TYPES)[number];

/** Azerbaijani one-liners for the record types, shown beside each table. */
export const DNS_TYPE_NOTES: Record<DnsType, string> = {
  A: "Adı IPv4 ünvanına bağlayır — brauzer saytı burada axtarır.",
  AAAA: "Adı IPv6 ünvanına bağlayır. Yoxdursa IPv6-only şəbəkədən giriş NAT64-dən keçir.",
  CNAME: "Adı başqa ada yönləndirir. Kök domendə (apex) qoyula bilməz.",
  MX: "Bu domenə gələn məktubu hansı server qəbul edir. Kiçik prioritet əvvəl sınanır.",
  TXT: "Sərbəst mətn. SPF, DMARC, DKIM və sahiblik təsdiqləri burada saxlanılır.",
  NS: "Domenin zonasına hansı ad serverləri cavabdehdir.",
  SOA: "Zonanın başlanğıc qeydi: əsas ad serveri, seriya nömrəsi və yeniləmə vaxtları.",
  CAA: "Hansı sertifikat mərkəzinin bu domenə sertifikat verə biləcəyini məhdudlaşdırır.",
};

/* ---------- domain validation ---------- */

const MAX_DOMAIN_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

/* A hyphen may sit inside a label but not at either end (RFC 1035 section
   2.3.1), and the underscore that appears in `_dmarc` is not part of a
   hostname a visitor types - the tool adds it itself where it is needed. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type DomainCheck = { ok: true; domain: string } | { ok: false; error: string };

/**
 * Turns whatever the visitor pasted into a bare, lowercase, ASCII domain - or
 * says why it is not one.
 *
 * This is the whole of the route's input validation, which is why it is strict
 * rather than forgiving: an endpoint that hands an unchecked string to a
 * resolver is a name-lookup service somebody else gets to run through this
 * server's address.
 */
export function normalizeDomain(raw: string): DomainCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — domen adı yaz." };

  /* Cut long before the length rules below, so a megabyte of pasted text does
     not get regex-scanned just to be told it is too long. */
  if (trimmed.length > 400) {
    return { ok: false, error: "Mətn həddindən uzundur — domen adı 253 simvoldan çox ola bilməz." };
  }

  /* Four decorations arrive with a pasted domain and all four mean the same
     domain: a scheme, a path, a `user@` prefix (an address bar copy or an
     e-mail address) and the trailing root dot. */
  let value = trimmed.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const at = value.lastIndexOf("@");
  if (at !== -1) value = value.slice(at + 1);
  value = value.split(/[/?#]/)[0];
  value = value.replace(/\.+$/, "");
  const colon = value.indexOf(":");
  if (colon !== -1) value = value.slice(0, colon);

  if (value === "") {
    return { ok: false, error: "Domen adı tapılmadı — «example.com» formatında yaz." };
  }

  /*
   * `URL` is the IDN encoder both the browser and Node already carry, so a
   * domain written with Azerbaijani letters becomes its punycode form with no
   * dependency added. It also throws on the host characters a resolver would
   * refuse anyway (space, backslash, bracket), which is a free first filter.
   */
  let ascii: string;
  try {
    ascii = new URL(`http://${value}`).hostname;
  } catch {
    return { ok: false, error: "Domen adında icazə verilməyən simvol var." };
  }

  /* An IPv6 literal survives the parse wrapped in brackets and an IPv4 literal
     survives as four numbers. Neither has a zone to read; a reverse lookup is
     a different question. */
  if (ascii.startsWith("[") || /^\d+(\.\d+){3}$/.test(ascii)) {
    return { ok: false, error: "IP ünvanı deyil, domen adı lazımdır — məsələn «example.com»." };
  }

  if (ascii.length > MAX_DOMAIN_LENGTH) {
    return {
      ok: false,
      error: `Domen adı 253 simvoldan uzun ola bilməz (${ascii.length} simvol tapıldı).`,
    };
  }

  const labels = ascii.split(".");
  if (labels.length < 2) {
    return { ok: false, error: "Domen ən azı iki hissədən ibarət olmalıdır — «example.com» kimi." };
  }

  for (const label of labels) {
    if (label === "") {
      return { ok: false, error: "Domendə boş hissə var — iki nöqtə yan-yana gəlib." };
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        error: `«${label.slice(0, 24)}…» hissəsi 63 simvoldan uzundur (${label.length} simvol).`,
      };
    }
    if (!LABEL.test(label)) {
      return {
        ok: false,
        error: `«${label}» hissəsində icazə verilməyən simvol var — yalnız hərf, rəqəm və defis olur, defis hissənin əvvəlində və ya sonunda dura bilməz.`,
      };
    }
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || /^\d+$/.test(tld)) {
    return {
      ok: false,
      error: "Domenin son hissəsi düzgün deyil — «.com», «.az», «.io» kimi olmalıdır.",
    };
  }

  return { ok: true, domain: ascii };
}

/** Where the DMARC policy always lives - never on the domain itself. */
export function dmarcName(domain: string): string {
  return `_dmarc.${domain}`;
}

/* ---------- SPF ---------- */

/*
 * Mechanisms that cost a DNS lookup while SPF is being evaluated. RFC 7208
 * section 4.6.4 caps the total at 10 and says a sender exceeding it must be
 * treated as `permerror` - which in practice means the SPF check is skipped
 * and the mail is judged as if the record did not exist. A record can
 * therefore be perfectly written and still do nothing, and that is worth
 * saying out loud.
 */
const SPF_LOOKUP_MECHANISMS = new Set(["include", "a", "mx", "ptr", "exists"]);

export const SPF_LOOKUP_LIMIT = 10;

/** What happens to mail from a server the record did not list. */
export type SpfAll = "fail" | "softfail" | "neutral" | "pass";

const SPF_ALL_BY_QUALIFIER: Record<string, SpfAll> = {
  "-": "fail",
  "~": "softfail",
  "?": "neutral",
  "+": "pass",
};

export const SPF_ALL_LABELS: Record<SpfAll, string> = {
  fail: "«-all» — siyahıdan kənar server rədd edilir",
  softfail: "«~all» — siyahıdan kənar məktub spama düşür, amma qəbul edilir",
  neutral: "«?all» — heç bir qərar verilmir, qeyd praktiki olaraq boşdur",
  pass: "«+all» — istənilən server bu domenin adından göndərə bilər",
};

export type SpfReport = {
  all: SpfAll | null;
  includes: string[];
  ipRanges: string[];
  redirect: string | null;
  /** How many of the ten allowed lookups this record spends. */
  lookups: number;
  overLimit: boolean;
};

export function describeSpf(value: string): SpfReport {
  const includes: string[] = [];
  const ipRanges: string[] = [];
  let redirect: string | null = null;
  let all: SpfAll | null = null;
  let lookups = 0;

  for (const term of value.trim().split(/\s+/)) {
    if (term === "" || /^v=spf1$/i.test(term)) continue;

    /* Modifiers are `name=value` and carry no qualifier; mechanisms are
       `[qualifier]name[:value][/prefix]`. Only `redirect` among the modifiers
       costs a lookup - `exp` is fetched only to build an error message. */
    const qualified = /^[+\-~?]/.test(term);
    const equals = term.indexOf("=");
    if (!qualified && equals !== -1) {
      if (term.slice(0, equals).toLowerCase() === "redirect") {
        redirect = term.slice(equals + 1);
        lookups += 1;
      }
      continue;
    }

    const qualifier = qualified ? term[0] : "+";
    const body = qualified ? term.slice(1) : term;
    const name = body.split(/[:/]/)[0].toLowerCase();
    const argument = body.includes(":") ? body.slice(body.indexOf(":") + 1) : "";

    if (name === "all") {
      all = SPF_ALL_BY_QUALIFIER[qualifier] ?? "pass";
      continue;
    }
    if (name === "include") {
      includes.push(argument);
      lookups += 1;
      continue;
    }
    if (name === "ip4" || name === "ip6") {
      ipRanges.push(argument === "" ? body : `${name}:${argument}`);
      continue;
    }
    if (SPF_LOOKUP_MECHANISMS.has(name)) lookups += 1;
  }

  return { all, includes, ipRanges, redirect, lookups, overLimit: lookups > SPF_LOOKUP_LIMIT };
}

/* ---------- DMARC ---------- */

export type DmarcPolicy = "none" | "quarantine" | "reject";

export const DMARC_POLICY_LABELS: Record<DmarcPolicy, string> = {
  none: "yalnız hesabat toplanır, saxta məktub bloklanmır",
  quarantine: "saxta məktub spam qovluğuna atılır",
  reject: "saxta məktub ümumiyyətlə qəbul edilmir",
};

export type DmarcReport = {
  policy: DmarcPolicy | null;
  /** Applies to subdomains; absent means `p` covers them too. */
  subdomainPolicy: DmarcPolicy | null;
  /** `pct` defaults to 100 when the tag is missing (RFC 7489 section 6.3). */
  percent: number;
  rua: string[];
  ruf: string[];
  strictDkim: boolean;
  strictSpf: boolean;
};

function tagsOf(value: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of value.split(";")) {
    const equals = part.indexOf("=");
    if (equals === -1) continue;
    tags.set(part.slice(0, equals).trim().toLowerCase(), part.slice(equals + 1).trim());
  }
  return tags;
}

function asPolicy(value: string | undefined): DmarcPolicy | null {
  const lower = value?.trim().toLowerCase();
  return lower === "none" || lower === "quarantine" || lower === "reject" ? lower : null;
}

export function describeDmarc(value: string): DmarcReport {
  const tags = tagsOf(value);

  const addresses = (tag: string) =>
    (tags.get(tag) ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");

  const rawPercent = Number.parseInt(tags.get("pct") ?? "", 10);

  return {
    policy: asPolicy(tags.get("p")),
    subdomainPolicy: asPolicy(tags.get("sp")),
    percent: Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 100,
    rua: addresses("rua"),
    ruf: addresses("ruf"),
    strictDkim: (tags.get("adkim") ?? "").toLowerCase() === "s",
    strictSpf: (tags.get("aspf") ?? "").toLowerCase() === "s",
  };
}

/* ---------- DKIM ---------- */

export type DkimReport = {
  keyType: string;
  /** An empty `p=` is how a key is withdrawn, not a malformed record. */
  revoked: boolean;
  /** `t=y` tells receivers to treat a failure as if DKIM were not set up. */
  testMode: boolean;
};

export function describeDkim(value: string): DkimReport {
  const tags = tagsOf(value);

  return {
    keyType: (tags.get("k") ?? "rsa").toLowerCase(),
    revoked: tags.has("p") && tags.get("p") === "",
    testMode: (tags.get("t") ?? "")
      .split(":")
      .map((flag) => flag.trim().toLowerCase())
      .includes("y"),
  };
}

/* ---------- TXT classification ---------- */

export type TxtKind = "spf" | "dmarc" | "dkim" | "verification" | "other";

export const TXT_KIND_LABELS: Record<TxtKind, string> = {
  spf: "SPF — göndərən serverlərin siyahısı",
  dmarc: "DMARC — saxta məktuba münasibət",
  dkim: "DKIM — imza açarı",
  verification: "Sahiblik təsdiqi",
  other: "Digər",
};

export type TxtInsight = {
  kind: TxtKind;
  value: string;
  /** One Azerbaijani sentence saying what this record does, with its numbers. */
  note: string;
  /** True when the record exists but does not protect anything. */
  weak: boolean;
};

/*
 * Prefixes third parties ask to be pasted into TXT to prove the domain is
 * yours. They are noise for a mail audit but people do wonder what they are,
 * so they get named rather than dropped into the "other" bucket.
 */
const VERIFICATION_PREFIXES = [
  "google-site-verification=",
  "ms=",
  "facebook-domain-verification=",
  "apple-domain-verification=",
  "atlassian-domain-verification=",
  "yandex-verification:",
  "zoom-domain-verification=",
  "adobe-idp-site-verification=",
  "stripe-verification=",
  "docusign=",
  "globalsign-domain-verification=",
  "onetrust-domain-verification=",
  "shopify-verification-code=",
  "openai-domain-verification=",
];

export function classifyTxt(value: string): TxtInsight {
  const trimmed = value.trim();

  if (/^v=spf1(\s|$)/i.test(trimmed)) {
    const spf = describeSpf(trimmed);
    const pieces = [
      spf.all ? SPF_ALL_LABELS[spf.all] : "«all» mexanizmi yoxdur — qeyd yarımçıqdır",
      `${spf.includes.length} include`,
      `${spf.ipRanges.length} IP bloku`,
      `${spf.lookups}/${SPF_LOOKUP_LIMIT} DNS sorğusu`,
    ];
    if (spf.overLimit) {
      pieces.push("limit aşılıb — qəbuledici SPF-i ümumiyyətlə nəzərə almır");
    }
    return {
      kind: "spf",
      value: trimmed,
      note: pieces.join(" · "),
      weak: spf.overLimit || spf.all === null || spf.all === "pass" || spf.all === "neutral",
    };
  }

  if (/^v=dmarc1(\s*;|$)/i.test(trimmed)) {
    const dmarc = describeDmarc(trimmed);
    const pieces = [
      dmarc.policy
        ? `p=${dmarc.policy} — ${DMARC_POLICY_LABELS[dmarc.policy]}`
        : "«p» tağı yoxdur — qeyd etibarsızdır",
      `${dmarc.percent}% məktuba tətbiq olunur`,
      dmarc.rua.length > 0 ? `${dmarc.rua.length} hesabat ünvanı` : "hesabat ünvanı yoxdur",
    ];
    return {
      kind: "dmarc",
      value: trimmed,
      note: pieces.join(" · "),
      weak: dmarc.policy === null || dmarc.policy === "none" || dmarc.percent < 100,
    };
  }

  if (/^v=dkim1(\s*;|$)/i.test(trimmed)) {
    const dkim = describeDkim(trimmed);
    const pieces = [`açar tipi ${dkim.keyType}`];
    if (dkim.revoked) pieces.push("açar geri götürülüb (p= boşdur)");
    if (dkim.testMode) pieces.push("test rejimi (t=y) — uğursuz imza nəzərə alınmır");
    return {
      kind: "dkim",
      value: trimmed,
      note: pieces.join(" · "),
      weak: dkim.revoked || dkim.testMode,
    };
  }

  const lower = trimmed.toLowerCase();
  const verification = VERIFICATION_PREFIXES.find((prefix) => lower.startsWith(prefix));
  if (verification) {
    return {
      kind: "verification",
      value: trimmed,
      note: `«${verification.replace(/[=:]$/, "")}» xidmətinə domenin sənin olduğunu sübut edir. Silinsə həmin xidmətdəki inteqrasiya qırıla bilər.`,
      weak: false,
    };
  }

  return {
    kind: "other",
    value: trimmed,
    note: "Tanınan siyasət qeydi deyil: sərbəst mətn və ya xüsusi inteqrasiya.",
    weak: false,
  };
}

/* ---------- MX ---------- */

/**
 * Orders mail servers the way a sender tries them: lowest preference number
 * first, ties broken by name.
 *
 * The tie-break is not cosmetic. Resolvers deliberately rotate equal-priority
 * answers between calls so load spreads across them, so an unsorted table
 * reshuffles itself every time the visitor presses the button and reads as a
 * fault in the tool rather than as load balancing.
 */
export function sortMxRecords<T extends { priority: number; value: string }>(
  records: readonly T[],
): T[] {
  return [...records].sort(
    (left, right) => left.priority - right.priority || left.value.localeCompare(right.value, "en"),
  );
}

/* ---------- CAA ---------- */

export function describeCaa(tag: string, value: string): string {
  const authority = value.trim();
  if (tag === "issue" || tag === "issuewild") {
    const scope = tag === "issuewild" ? "wildcard sertifikat" : "sertifikat";
    /* A lone semicolon is the RFC 8659 way of saying "nobody", and it is the
       one CAA value that means the opposite of what it looks like. */
    if (authority === ";") return `Heç bir mərkəz bu domenə ${scope} verə bilməz.`;
    return `Yalnız «${authority}» bu domenə ${scope} verə bilər.`;
  }
  if (tag === "iodef") return `Qayda pozuntusu haqqında bildiriş «${authority}» ünvanına gedir.`;
  if (tag === "contactemail" || tag === "contactphone") {
    return `Domen sahibinin əlaqə məlumatı: ${authority}`;
  }
  return `«${tag}» tağı: ${authority}`;
}

/* ---------- the assembled report ---------- */

export type DnsRecord = {
  type: DnsType;
  /** Formatted the way a zone file would show it. */
  value: string;
  /**
   * Seconds the answer may be cached, or null.
   *
   * Null is honest rather than lazy: Node's resolver only exposes the TTL for
   * A and AAAA answers, and inventing one for the other six would be a number
   * the tool made up.
   */
  ttl: number | null;
  /** MX only - the preference number. */
  priority?: number;
  /** CAA and SOA carry a second line explaining their fields. */
  note?: string;
};

export type DnsSectionStatus = "ok" | "empty" | "error";

export type DnsSection = {
  type: DnsType;
  status: DnsSectionStatus;
  records: DnsRecord[];
  /** Azerbaijani sentence shown instead of a table when there is nothing. */
  message: string | null;
};

export type DnsFinding = { tone: "info" | "accent"; title: string; text: string };

export type DnsReport = {
  domain: string;
  /** ISO stamp; the widget formats it in the visitor's own locale. */
  checkedAt: string;
  sections: DnsSection[];
  txt: TxtInsight[];
  /** The `_dmarc` record, which never sits on the domain itself. */
  dmarc: { name: string; value: string; insight: TxtInsight } | null;
  findings: DnsFinding[];
};

/** Turns a resolver error code into a sentence a visitor can act on. */
export function dnsErrorMessage(code: string): string {
  switch (code) {
    case "ENOTFOUND":
    case "NXDOMAIN":
    case "EBADNAME":
      return "Belə domen qeydiyyatda yoxdur.";
    case "ENODATA":
      return "Bu tipdə qeyd yoxdur.";
    case "ETIMEOUT":
    case "ETIMEDOUT":
      return "Ad serveri vaxtında cavab vermədi.";
    case "ESERVFAIL":
      return "Domenin ad serveri xəta qaytardı (SERVFAIL) — zona sıradan çıxmış ola bilər.";
    case "EREFUSED":
      return "Ad serveri sorğunu rədd etdi.";
    case "ECONNREFUSED":
      return "Ad serveri ilə əlaqə qurulmadı.";
    default:
      return "Qeyd oxunmadı.";
  }
}

function recordsOf(sections: readonly DnsSection[], type: DnsType): DnsRecord[] {
  return sections.find((section) => section.type === type)?.records ?? [];
}

/**
 * The short list of things worth telling somebody who just looked their own
 * domain up. Ordered by how much damage the gap does, not by record type.
 */
export function buildFindings(
  sections: readonly DnsSection[],
  txt: readonly TxtInsight[],
  dmarc: TxtInsight | null,
): DnsFinding[] {
  const findings: DnsFinding[] = [];

  const a = recordsOf(sections, "A");
  const aaaa = recordsOf(sections, "AAAA");
  const cname = recordsOf(sections, "CNAME");
  const mx = recordsOf(sections, "MX");
  const ns = recordsOf(sections, "NS");
  const caa = recordsOf(sections, "CAA");

  if (a.length === 0 && aaaa.length === 0 && cname.length === 0) {
    findings.push({
      tone: "accent",
      title: "Domen IP ünvanına həll olunmur",
      text: "Nə A, nə AAAA, nə də CNAME qeydi var. Bu ad brauzerdə açılmır.",
    });
  }

  if (ns.length === 0) {
    findings.push({
      tone: "accent",
      title: "NS qeydi görünmür",
      text: "Zonanın ad serverləri oxunmadı. Domen yeni köçürülübsə dəyişiklik hələ yayılmamış ola bilər.",
    });
  }

  if (mx.length === 0) {
    findings.push({
      tone: "info",
      title: "E-poçt qəbulu qurulmayıb",
      text: "MX qeydi yoxdur: bu domenə göndərilən məktub çatmır. Yalnız sayt üçün istifadə olunan domendə bu normaldır.",
    });
  } else {
    const spf = txt.find((entry) => entry.kind === "spf") ?? null;

    if (!spf) {
      findings.push({
        tone: "accent",
        title: "SPF qeydi yoxdur",
        text: "Domen məktub qəbul edir, amma göndərən serverlərin siyahısı elan edilməyib. İstənilən server bu domenin adından yaza bilər.",
      });
    } else if (spf.weak) {
      findings.push({ tone: "accent", title: "SPF zəifdir", text: spf.note });
    }

    if (!dmarc) {
      findings.push({
        tone: "accent",
        title: "DMARC qeydi yoxdur",
        text: "SPF və DKIM uğursuz olanda qəbuledicinin nə etməli olduğu deyilmir və heç bir hesabat toplanmır.",
      });
    } else if (dmarc.weak) {
      findings.push({ tone: "accent", title: "DMARC hələ qoruma vermir", text: dmarc.note });
    }
  }

  if (caa.length === 0) {
    findings.push({
      tone: "info",
      title: "CAA qeydi yoxdur",
      text: "Hər sertifikat mərkəzi bu domenə sertifikat verə bilər. CAA qeydi siyahını bir-iki mərkəzlə məhdudlaşdırır.",
    });
  }

  if (a.length > 0 && aaaa.length === 0) {
    findings.push({
      tone: "info",
      title: "IPv6 ünvanı yoxdur",
      text: "Yalnız IPv4 elan edilib. Mobil operatorların IPv6-only şəbəkələrindən giriş NAT64 tərcüməsindən keçir.",
    });
  }

  return findings;
}
