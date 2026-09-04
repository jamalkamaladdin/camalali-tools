/**
 * The record shapes, the audit rules and the DKIM selector list behind
 * `mail-qeydleri` — everything that decides whether mail from a domain is
 * delivered or dropped, gathered in one place so `/api/alet/mail-qeydleri`
 * can stay a thin fetch-and-assemble layer and `scripts/tools-checks` can
 * prove the judgement without a resolver.
 *
 * This file is deliberately narrower than `src/lib/tools/dns.ts`. That file
 * answers "what does this domain have"; this one answers "will mail from
 * this domain arrive, and would a spoofed one be caught" — so a single SPF
 * record is not read for its lookup budget (that is `spf-yoxlayici`'s job)
 * and a DMARC record is not read for `adkim`/`aspf` (that is
 * `dmarc-oxucu`'s). What stays here is the handful of failures that are
 * visible from the records themselves and change the answer to "does mail
 * work": more than one SPF record, a policy that allows anyone to send,
 * a DMARC tag that only watches, and an MX list that was never sorted.
 */

/* ---------- MX ---------- */

export type MxRecord = { priority: number; host: string };

export type MxReport = {
  /** Ascending by priority; ties keep the order the resolver returned. */
  records: MxRecord[];
  /**
   * RFC 7505: a domain that will never receive mail publishes exactly one MX
   * record whose target is the root name, written `.`. That is a deliberate
   * declaration, not a broken record, and is reported as one.
   */
  nullMx: boolean;
};

/**
 * Orders mail servers the way a sending queue tries them: lowest priority
 * number first. No secondary key is applied on purpose — `Array.prototype.sort`
 * has been a stable sort since ES2019, so two records sharing a priority stay
 * in whatever order the resolver answered with, which is itself sometimes a
 * deliberate round-robin the visitor is checking for.
 */
export function sortMxRecords(records: readonly MxRecord[]): MxRecord[] {
  return [...records].sort((left, right) => left.priority - right.priority);
}

/**
 * True when the MX set is the RFC 7505 null-MX declaration: exactly one
 * record whose target is the root domain. Node's resolver can hand that
 * target back as `.` or as an empty string depending on the answer's own
 * encoding, so both are read the same way.
 */
export function isNullMxSet(records: readonly MxRecord[]): boolean {
  return records.length === 1 && (records[0].host === "." || records[0].host === "");
}

export function buildMxReport(rawRecords: readonly MxRecord[]): MxReport {
  const records = sortMxRecords(rawRecords);
  return { records, nullMx: isNullMxSet(records) };
}

/* ---------- TXT chunk joining ---------- */

/**
 * `resolveTxt` hands back one array of strings per record — the chunks a
 * value longer than 255 bytes was split into on the wire. They mean
 * something only rejoined with no separator: a DKIM key crosses that limit
 * on almost every real key, and a single space dropped between two chunks
 * corrupts the base64 without producing an error anywhere downstream.
 */
export function joinTxtChunks(chunks: readonly string[]): string {
  return chunks.join("");
}

/* ---------- SPF ---------- */

export type SpfAllQualifier = "fail" | "softfail" | "neutral" | "pass";

const SPF_ALL_BY_QUALIFIER: Record<string, SpfAllQualifier> = {
  "-": "fail",
  "~": "softfail",
  "?": "neutral",
  "+": "pass",
};

/** One sentence per qualifier, for the record next to whichever one is present. */
export const SPF_ALL_EXPLANATIONS: Record<SpfAllQualifier, string> = {
  fail: "«-all» — siyahıda olmayan server bu domenin adından yazsa, məktub rədd edilir.",
  softfail: "«~all» — siyahıda olmayan server yazsa, məktub adətən spama düşür, amma qəbul edilir.",
  neutral: "«?all» — heç bir qərar verilmir, SPF praktiki olaraq heç nəyi süzmür.",
  pass: "«+all» — istənilən server bu domenin adından yaza bilər, SPF siyasəti faktiki olaraq söndürülüb.",
};

/** A TXT value is an SPF record only when it STARTS WITH `v=spf1` — a mention further in is somebody else's text. */
export function isSpfRecord(value: string): boolean {
  return /^v=spf1(\s|$)/i.test(value.trim());
}

/**
 * Reads the qualifier on the `all` mechanism, token by token — `-all`,
 * `~all`, `?all` or a bare `all` (which is `+all`, `+` being the default
 * qualifier RFC 7208 assigns when none is written). `null` means the record
 * never mentions `all`, which is its own finding: everything not otherwise
 * listed is left with no stated outcome.
 */
export function spfAllQualifier(value: string): SpfAllQualifier | null {
  for (const term of value.trim().split(/\s+/)) {
    const qualified = /^[+\-~?]/.test(term);
    const qualifier = qualified ? term[0] : "+";
    const body = qualified ? term.slice(1) : term;
    if (body.toLowerCase() === "all") return SPF_ALL_BY_QUALIFIER[qualifier] ?? "pass";
  }
  return null;
}

/* ---------- DMARC ---------- */

export type DmarcPolicy = "none" | "quarantine" | "reject";

export const DMARC_POLICY_LABELS: Record<DmarcPolicy, string> = {
  none: "yalnız hesabat toplanır, saxta məktub bloklanmır",
  quarantine: "saxta məktub spam qovluğuna atılır",
  reject: "saxta məktub ümumiyyətlə qəbul edilmir",
};

export type DmarcReport = {
  raw: string;
  policy: DmarcPolicy | null;
  /** Applies to subdomains; `null` means `p` covers them too. */
  subdomainPolicy: DmarcPolicy | null;
  /** `pct` defaults to 100 when the tag is missing (RFC 7489 section 6.3). */
  percent: number;
  rua: string[];
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

export function isDmarcRecord(value: string): boolean {
  return /^v=dmarc1(\s*;|$)/i.test(value.trim());
}

export function parseDmarc(value: string): DmarcReport {
  const tags = tagsOf(value);
  const rua = (tags.get("rua") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const rawPercent = Number.parseInt(tags.get("pct") ?? "", 10);

  return {
    raw: value.trim(),
    policy: asPolicy(tags.get("p")),
    subdomainPolicy: asPolicy(tags.get("sp")),
    percent: Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 100,
    rua,
  };
}

/* ---------- DKIM ---------- */

/*
 * A selector is chosen by whoever configured the sending service and is not
 * itself published anywhere in DNS — there is no query that lists them. This
 * is the list of names services actually use, gathered from what the common
 * providers document, tried against `<selector>._domainkey.<domain>`. A
 * visitor who knows their own selector can add it; the tool never claims the
 * list is complete.
 */
export const DKIM_SELECTORS: string[] = [
  "google",
  "selector1",
  "selector2",
  "default",
  "dkim",
  "mail",
  "k1",
  "k2",
  "s1",
  "s2",
  "smtp",
  "zoho",
  "mandrill",
  "everlytickey1",
  "mxvault",
];

/* Loose on purpose: real selectors are short DNS labels, occasionally with a
   dot for a version number (`fm1`, `s2048.2024`). What is rejected is
   whitespace, a slash or anything else that does not belong in a hostname. */
const SELECTOR_PATTERN = /^[a-z0-9](?:[a-z0-9_.-]{0,61}[a-z0-9])?$/i;

function isValidSelector(value: string): boolean {
  return SELECTOR_PATTERN.test(value);
}

/**
 * The selectors this tool will try, deduplicated, with a visitor-typed one
 * folded in when it is a plausible DNS label and not already on the list.
 */
export function buildDkimSelectorList(custom?: string): string[] {
  const list: string[] = [];
  const seen = new Set<string>();
  for (const selector of DKIM_SELECTORS) {
    const lower = selector.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    list.push(selector);
  }

  const trimmed = custom?.trim().toLowerCase() ?? "";
  if (trimmed !== "" && isValidSelector(trimmed) && !seen.has(trimmed)) {
    list.push(trimmed);
  }

  return list;
}

export function dkimSelectorHost(domain: string, selector: string): string {
  return `${selector}._domainkey.${domain}`;
}

export type DkimSelectorResult = {
  selector: string;
  found: boolean;
  value: string | null;
  keyType: string | null;
  /** An empty `p=` is how a key is withdrawn, not a malformed record. */
  revoked: boolean;
};

export function describeDkimTxt(value: string): { keyType: string; revoked: boolean } {
  const tags = tagsOf(value);
  return {
    keyType: (tags.get("k") ?? "rsa").toLowerCase(),
    revoked: tags.has("p") && tags.get("p") === "",
  };
}

/* ---------- the rest: MTA-STS, TLS-RPT, BIMI, legacy _domainkey ---------- */

export type MiscRecord = { present: boolean; value: string | null };

export type MailMisc = {
  mtaSts: MiscRecord;
  /** Whether `mta-sts.<domain>` resolves at all — the host the policy file lives on. */
  mtaStsPolicyHost: boolean;
  tlsRpt: MiscRecord;
  bimi: MiscRecord;
  /** The pre-DKIM `_domainkey` convention (RFC 5617, ADSP) — rare, but visible when it is there. */
  domainkey: MiscRecord;
};

/** One Azerbaijani sentence per record, shown beside it regardless of whether it was found. */
export const MAIL_RECORD_NOTES = {
  mx: "Bu domenə gələn məktubu hansı server qəbul edir. Kiçik prioritet əvvəl sınanır.",
  spf: "Bu domenin adından hansı serverlərin məktub göndərə biləcəyini elan edir.",
  dmarc: "SPF və ya DKIM uğursuz olan məktuba nə ediləcəyini deyir və hesabatın hara göndəriləcəyini bildirir.",
  dkim: "Göndərilən məktubun imzasını yoxlamaq üçün açıq açar. Seçici adı DNS-dən oxuna bilmir — bu tanınan adları sınayır.",
  mtaSts: "SMTP-də TLS-i məcburi edən siyasət — göndərən server şifrəsiz əlaqəyə keçə bilmir.",
  tlsRpt: "TLS əlaqə xətaları haqqında hesabatın hara göndəriləcəyini bildirir.",
  bimi: "Məktubun yanında görünəcək marka loqosunu elan edir — yalnız güclü DMARC olan domendə işə yarayır.",
  domainkey: "«_domainkey» altındakı ümumi qeyd — köhnə ADSP siyasətinin (RFC 5617) izi ola bilər.",
} as const;

/* ---------- the assembled report ---------- */

export type MailFinding = { tone: "info" | "accent"; title: string; text: string };

export type MailReport = {
  domain: string;
  checkedAt: string;
  mx: MxReport;
  spf: { records: string[] };
  dmarc: DmarcReport | null;
  dkim: DkimSelectorResult[];
  misc: MailMisc;
  findings: MailFinding[];
};

/**
 * The ordered list of things worth telling somebody who just looked their
 * own domain up — most serious first. A record that is merely absent when
 * nothing depends on it (no MX, so no SPF to speak of) is reported gently,
 * as information; a record that exists and actively does the wrong thing
 * (two SPF records, `+all`, `p=none`) is reported as something to fix.
 */
export function buildMailFindings(input: {
  mx: readonly MxRecord[];
  nullMx: boolean;
  spfRecords: readonly string[];
  dmarc: DmarcReport | null;
}): MailFinding[] {
  const { mx, nullMx, spfRecords, dmarc } = input;
  const findings: MailFinding[] = [];

  if (mx.length === 0 && spfRecords.length === 0 && dmarc === null) {
    findings.push({
      tone: "info",
      title: "Poçt konfiqurasiyası tapılmadı",
      text: "Bu domendə MX, SPF və DMARC qeydlərindən heç biri tapılmadı: hazırda heç bir poçt siyasəti fəaliyyət göstərmir.",
    });
  }

  if (spfRecords.length > 1) {
    findings.push({
      tone: "accent",
      title: "Birdən çox SPF qeydi var",
      text: `Domendə ${spfRecords.length} ədəd SPF qeydi tapıldı. RFC 7208-ə görə bu vəziyyət «permerror»dur: qəbuledici SPF-i bütövlükdə rədd edir, birincini seçmir. Köhnə inteqrasiyanı tapıb yalnız bir SPF qeydi saxla.`,
    });
  }

  const primarySpf = spfRecords[0];
  if (primarySpf !== undefined) {
    const qualifier = spfAllQualifier(primarySpf);
    if (qualifier === "pass") {
      findings.push({
        tone: "accent",
        title: "SPF «+all» ilə bitir",
        text: "İstənilən server bu domenin adından məktub göndərə bilər. «+all» SPF siyasətini faktiki olaraq söndürür. «-all» və ya «~all» ilə əvəz et.",
      });
    } else if (qualifier === null) {
      findings.push({
        tone: "accent",
        title: "SPF qeydində «all» mexanizmi yoxdur",
        text: "Qeyd siyahıda olmayan serverə nə ediləcəyini demir. Sona «-all» və ya (keçid dövrü üçün) «~all» əlavə et.",
      });
    }
  }

  if (dmarc && dmarc.policy === "none") {
    findings.push({
      tone: "accent",
      title: "DMARC yalnız izləyir, qorumur",
      text: "«p=none» saxta məktubu bloklamır, yalnız hesabat toplayır. Əksər domen elə bununla dayanıb özünü qorunmuş sanır. Qorunma üçün «p=quarantine» və ya «p=reject» yaz.",
    });
  }

  if (nullMx) {
    findings.push({
      tone: "info",
      title: "Domen məktub qəbul etmir",
      text: "MX qeydi bilərəkdən tək nöqtəyə («.») yönəldilib: RFC 7505-in «bu domen heç vaxt mail qəbul etməyəcək» elanıdır, xəta deyil.",
    });
  } else if (mx.length === 0) {
    findings.push({
      tone: "info",
      title: "E-poçt qəbulu qurulmayıb",
      text: "MX qeydi yoxdur: bu domenə göndərilən məktub çatmır. Yalnız sayt üçün istifadə olunan domendə bu normaldır.",
    });
  } else {
    if (spfRecords.length === 0) {
      findings.push({
        tone: "accent",
        title: "SPF qeydi yoxdur",
        text: "Domen məktub qəbul edir, amma göndərən serverlərin siyahısı elan edilməyib. İstənilən server bu domenin adından yaza bilər.",
      });
    }
    if (!dmarc) {
      findings.push({
        tone: "accent",
        title: "DMARC qeydi yoxdur",
        text: "SPF və ya DKIM uğursuz olanda qəbuledicinin nə etməli olduğu deyilmir, heç bir hesabat da toplanmır.",
      });
    }
  }

  return findings;
}
