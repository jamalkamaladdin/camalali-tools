/**
 * DMARC (RFC 7489) record reading and building.
 *
 * A DMARC record is eleven tags, and eight of them have a default a receiver
 * silently assumes when the tag is absent. That gap is the whole reason this
 * file exists as its own module rather than a thin wrapper around a regex
 * split: `parseDmarcRecord` resolves every tag to the value a receiver would
 * actually use — explicit or defaulted — and keeps a flag saying which one it
 * was, because a visitor reading a three-tag record needs to see the other
 * eight the record is silently relying on, not just the three it typed.
 *
 * The build side is written to reuse the read side rather than duplicate it:
 * `buildDmarc` serialises the fields to a record string and feeds that string
 * straight back into `parseDmarcRecord`, so the explanation and the findings
 * a visitor sees after building are produced by the exact same code path as
 * pasting that string in would have produced — there is no second definition
 * of "what pct=0 means" to drift out of sync with the first.
 */

export type DmarcPolicyValue = "none" | "quarantine" | "reject";
export type DmarcAlignment = "r" | "s";

export type DmarcTag = "v" | "p" | "sp" | "pct" | "rua" | "ruf" | "adkim" | "aspf" | "fo" | "rf" | "ri";

export const DMARC_TAG_ORDER: DmarcTag[] = [
  "v",
  "p",
  "sp",
  "pct",
  "rua",
  "ruf",
  "adkim",
  "aspf",
  "fo",
  "rf",
  "ri",
];

/** The literal defaults RFC 7489 assigns when a tag is absent — half of what this tool is for. */
export const DMARC_DEFAULTS = {
  pct: 100,
  adkim: "r" as DmarcAlignment,
  aspf: "r" as DmarcAlignment,
  fo: "0",
  rf: "afrf",
  ri: 86400,
};

export type DmarcReportUri = {
  /** The full URI as written, `!10m` suffix and all. */
  raw: string;
  /** `mailto:` address with the size suffix stripped off. */
  address: string;
  /** Parsed from a `!10m`-style suffix, in bytes. `null` when no suffix was given. */
  limitBytes: number | null;
};

export type DmarcRecord = {
  v: string;
  p: DmarcPolicyValue;
  sp: DmarcPolicyValue;
  spExplicit: boolean;
  pct: number;
  pctExplicit: boolean;
  rua: DmarcReportUri[];
  ruaExplicit: boolean;
  ruf: DmarcReportUri[];
  rufExplicit: boolean;
  adkim: DmarcAlignment;
  adkimExplicit: boolean;
  aspf: DmarcAlignment;
  aspfExplicit: boolean;
  fo: string;
  foExplicit: boolean;
  rf: string;
  rfExplicit: boolean;
  ri: number;
  riExplicit: boolean;
  /** Tags this file does not know, in the order they appeared — ignored by receivers, not an error. */
  unknownTags: { name: string; value: string }[];
};

export type DmarcParseResult = { ok: true; record: DmarcRecord } | { ok: false; error: string };

const KNOWN_TAGS = new Set<string>(DMARC_TAG_ORDER);

function parsePolicyValue(value: string): DmarcPolicyValue | null {
  if (value === "none" || value === "quarantine" || value === "reject") return value;
  return null;
}

function parseAlignmentValue(value: string): DmarcAlignment | null {
  if (value === "r" || value === "s") return value;
  return null;
}

/**
 * One `mailto:` report URI, size suffix and all. The suffix is `!` followed by
 * a digit run and a `k`/`m`/`g`/`t` unit (RFC 7489 §6.1's `uri` ABNF) — parsed
 * into bytes rather than left in the address, which is the difference between
 * "this parses" and "this chokes on the one character everyone forgets about".
 */
function parseReportUri(raw: string): DmarcReportUri | null {
  const trimmed = raw.trim();
  const match = /^mailto:([^\s!]+)(?:!(\d+)([kmgt]))?$/i.exec(trimmed);
  if (!match) return null;
  const [, address, sizeDigits, unit] = match;
  if (!address.includes("@")) return null;

  let limitBytes: number | null = null;
  if (sizeDigits !== undefined && unit !== undefined) {
    const multiplier = { k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }[unit.toLowerCase() as "k" | "m" | "g" | "t"];
    limitBytes = Number(sizeDigits) * multiplier;
  }

  return { raw: trimmed, address, limitBytes };
}

/** A comma-separated `rua`/`ruf` value. `null` means at least one entry was malformed. */
function parseReportUriList(raw: string): DmarcReportUri[] | null {
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) return null;

  const parsed: DmarcReportUri[] = [];
  for (const entry of entries) {
    const uri = parseReportUri(entry);
    if (uri === null) return null;
    parsed.push(uri);
  }
  return parsed;
}

/** The domain half of a report address, lower-cased for comparison. `""` when there is no `@`. */
export function reportUriDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

/**
 * Parses a raw DMARC TXT record value into every tag, explicit and defaulted
 * alike. Never throws — every malformed shape (empty input, a missing or
 * misplaced `v`, an unknown `p`, an out-of-range `pct`, a duplicate tag, a
 * broken URI) comes back as `{ ok: false, error }` with an Azerbaijani
 * sentence a visitor can act on.
 */
export function parseDmarcRecord(raw: string): DmarcParseResult {
  // A record pasted straight from a DNS panel often still carries the zone
  // file's own quoting — stripped here so the tag parser below only ever
  // sees the tag=value content, not the storage format around it.
  const unquoted = raw.trim().replace(/^"([\s\S]*)"$/, "$1");
  const trimmed = unquoted.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sətir — DMARC qeydini yapışdır." };
  }

  const entries = trimmed
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) {
    return { ok: false, error: "Boş sətir — DMARC qeydini yapışdır." };
  }

  const parsedTags: { name: string; value: string }[] = [];
  const seenNames = new Set<string>();
  for (const entry of entries) {
    const equals = entry.indexOf("=");
    if (equals === -1) {
      return { ok: false, error: `"${entry}" teq=dəyər formatında deyil.` };
    }
    const name = entry.slice(0, equals).trim().toLowerCase();
    const value = entry.slice(equals + 1).trim();
    if (name === "") {
      return { ok: false, error: `"${entry}" hissəsində teq adı boşdur.` };
    }
    if (seenNames.has(name)) {
      return {
        ok: false,
        error: `"${name}" teqi qeyddə iki dəfə keçir — RFC 7489-a görə bu qeyd etibarsızdır.`,
      };
    }
    seenNames.add(name);
    parsedTags.push({ name, value });
  }

  const vIndex = parsedTags.findIndex((tag) => tag.name === "v");
  if (vIndex === -1) {
    return { ok: false, error: "v teqi yoxdur — DMARC qeydi mütləq v=DMARC1 ilə başlamalıdır." };
  }
  if (vIndex !== 0) {
    return { ok: false, error: "v teqi birinci olmalıdır — başqa teqdən sonra gələn v qeydi etibarsız edir." };
  }
  if (parsedTags[0].value !== "DMARC1") {
    return {
      ok: false,
      error: `v dəyəri dəqiq "DMARC1" olmalıdır, "${parsedTags[0].value}" tapıldı — qeyd etibarsızdır.`,
    };
  }

  const byName = new Map(parsedTags.map((tag) => [tag.name, tag.value]));

  const pRaw = byName.get("p");
  if (pRaw === undefined) {
    return { ok: false, error: "p teqi yoxdur — DMARC qeydi siyasət (none/quarantine/reject) tələb edir." };
  }
  const p = parsePolicyValue(pRaw);
  if (p === null) {
    return {
      ok: false,
      error: `p dəyəri "none", "quarantine" və ya "reject" olmalıdır, "${pRaw}" tapıldı.`,
    };
  }

  const spRaw = byName.get("sp");
  const spExplicit = spRaw !== undefined;
  let sp: DmarcPolicyValue = p;
  if (spExplicit) {
    const parsed = parsePolicyValue(spRaw as string);
    if (parsed === null) {
      return {
        ok: false,
        error: `sp dəyəri "none", "quarantine" və ya "reject" olmalıdır, "${spRaw}" tapıldı.`,
      };
    }
    sp = parsed;
  }

  const pctRaw = byName.get("pct");
  const pctExplicit = pctRaw !== undefined;
  let pct = DMARC_DEFAULTS.pct;
  if (pctExplicit) {
    if (!/^\d+$/.test(pctRaw as string)) {
      return { ok: false, error: `pct tam ədəd olmalıdır, "${pctRaw}" tapıldı.` };
    }
    pct = Number(pctRaw);
    if (pct < 0 || pct > 100) {
      return { ok: false, error: `pct 0 ilə 100 arasında olmalıdır, "${pctRaw}" tapıldı.` };
    }
  }

  const ruaRaw = byName.get("rua");
  const ruaExplicit = ruaRaw !== undefined;
  let rua: DmarcReportUri[] = [];
  if (ruaExplicit) {
    const parsed = parseReportUriList(ruaRaw as string);
    if (parsed === null) {
      return { ok: false, error: `rua ünvanı düzgün formatda deyil: "${ruaRaw}".` };
    }
    rua = parsed;
  }

  const rufRaw = byName.get("ruf");
  const rufExplicit = rufRaw !== undefined;
  let ruf: DmarcReportUri[] = [];
  if (rufExplicit) {
    const parsed = parseReportUriList(rufRaw as string);
    if (parsed === null) {
      return { ok: false, error: `ruf ünvanı düzgün formatda deyil: "${rufRaw}".` };
    }
    ruf = parsed;
  }

  const adkimRaw = byName.get("adkim");
  const adkimExplicit = adkimRaw !== undefined;
  let adkim = DMARC_DEFAULTS.adkim;
  if (adkimExplicit) {
    const parsed = parseAlignmentValue(adkimRaw as string);
    if (parsed === null) {
      return { ok: false, error: `adkim dəyəri "r" və ya "s" olmalıdır, "${adkimRaw}" tapıldı.` };
    }
    adkim = parsed;
  }

  const aspfRaw = byName.get("aspf");
  const aspfExplicit = aspfRaw !== undefined;
  let aspf = DMARC_DEFAULTS.aspf;
  if (aspfExplicit) {
    const parsed = parseAlignmentValue(aspfRaw as string);
    if (parsed === null) {
      return { ok: false, error: `aspf dəyəri "r" və ya "s" olmalıdır, "${aspfRaw}" tapıldı.` };
    }
    aspf = parsed;
  }

  const foRaw = byName.get("fo");
  const foExplicit = foRaw !== undefined;
  const fo = foExplicit ? (foRaw as string) : DMARC_DEFAULTS.fo;

  const rfRaw = byName.get("rf");
  const rfExplicit = rfRaw !== undefined;
  const rf = rfExplicit ? (rfRaw as string) : DMARC_DEFAULTS.rf;

  const riRaw = byName.get("ri");
  const riExplicit = riRaw !== undefined;
  let ri = DMARC_DEFAULTS.ri;
  if (riExplicit) {
    if (!/^\d+$/.test(riRaw as string)) {
      return { ok: false, error: `ri tam ədəd (saniyə) olmalıdır, "${riRaw}" tapıldı.` };
    }
    ri = Number(riRaw);
  }

  const unknownTags = parsedTags.filter((tag) => !KNOWN_TAGS.has(tag.name)).map((tag) => ({ name: tag.name, value: tag.value }));

  return {
    ok: true,
    record: {
      v: parsedTags[0].value,
      p,
      sp,
      spExplicit,
      pct,
      pctExplicit,
      rua,
      ruaExplicit,
      ruf,
      rufExplicit,
      adkim,
      adkimExplicit,
      aspf,
      aspfExplicit,
      fo,
      foExplicit,
      rf,
      rfExplicit,
      ri,
      riExplicit,
      unknownTags,
    },
  };
}

/* ---------- findings ---------- */

export type DmarcFindingSeverity = "critical" | "warning" | "info";
export type DmarcFinding = { id: string; severity: DmarcFindingSeverity; text: string };

function reportUriListText(uris: DmarcReportUri[]): string {
  return uris.map((uri) => uri.address).join(", ");
}

/**
 * The ordered list of things worth telling a visitor about a resolved record
 * — ordered because `p=none` belongs at the top when it applies: it is the
 * single most common way a domain believes it is protected while doing
 * nothing. `domain` is optional because the cross-domain `rua` check needs to
 * know whose record this is, which the record itself never carries.
 */
export function buildDmarcFindings(record: DmarcRecord, domain?: string): DmarcFinding[] {
  const findings: DmarcFinding[] = [];

  if (record.p === "none") {
    findings.push({
      id: "no-protection",
      severity: "critical",
      text: "`p=none` heç bir qoruma vermir — bu, izləmə (monitoring) rejimidir. Uyğunsuz mesaj nə karantinə, nə də rədd siyahısına düşür, sadəcə hesabat toplanır. Bir çox domen elə burada dayanıb özünü qorunmuş sanır.",
    });
  }

  if (record.pctExplicit && record.pct < 100) {
    findings.push({
      id: "pct-sample",
      severity: "warning",
      text: `pct=${record.pct} siyasəti mesajların yalnız ${record.pct}%-nə tətbiq edir — qalanı, uyğunsuz olsa belə, bu qaydadan kənarda qalır.`,
    });
  }
  if (record.pct === 0 && record.p === "reject") {
    findings.push({
      id: "pct-zero-reject",
      severity: "critical",
      text: "`pct=0` ilə `p=reject` birlikdə heç nəyi qorumur — siyasət yazılıb, amma tətbiq nisbəti sıfırdır.",
    });
  }

  if (record.rua.length === 0) {
    findings.push({
      id: "no-reporting",
      severity: "warning",
      text: "`rua` yoxdur — heç bir hesabat gəlmir, deməli bu qeydin nə etdiyi heç vaxt öyrənilə bilmir. Ən çox rast gəlinən yarımçıq quraşdırma budur.",
    });
  }

  if (record.ruf.length > 0) {
    findings.push({
      id: "ruf-privacy",
      severity: "info",
      text: "`ruf` uğursuzluq hesabatları mesajın başlıqlarının bir hissəsini daşıyır — bu ünvanı kimin idarə etdiyi məxfilik baxımından əhəmiyyətlidir.",
    });
  }

  if (record.adkim === "s" || record.aspf === "s") {
    findings.push({
      id: "strict-alignment",
      severity: "warning",
      text: "Sərt uyğunlaşma (`adkim=s` və ya `aspf=s`) gözlənildiyindən daha tez-tez subdomen və üçüncü tərəf göndəricilərini sındırır.",
    });
  }

  if (record.unknownTags.length > 0) {
    const names = record.unknownTags.map((tag) => tag.name).join(", ");
    findings.push({
      id: "unknown-tag",
      severity: "info",
      text: `Naməlum teq(lər) (${names}) alıcılar tərəfindən sadəcə nəzərə alınmır — qeydi etibarsız etmir.`,
    });
  }

  if (domain !== undefined && domain.trim() !== "" && record.rua.length > 0) {
    const ownDomain = domain.trim().toLowerCase().replace(/\.$/, "");
    const crossDomain = record.rua.filter((uri) => reportUriDomain(uri.address) !== ownDomain);
    if (crossDomain.length > 0) {
      findings.push({
        id: "cross-domain-rua",
        severity: "critical",
        text: `${reportUriListText(crossDomain)} ünvanı ${domain}-dən başqa domendədir — həmin domen \`${domain}._report._dmarc.<onların domeni>\` altında v=DMARC1 daşıyan bir icazə qeydi saxlamasa, hesabatlar səssizcə dayanır.`,
      });
    }
  }

  return findings;
}

/* ---------- tag-by-tag explanation ---------- */

export type DmarcTagExplanation = {
  tag: DmarcTag;
  label: string;
  /** What the tag does, in general. */
  meaning: string;
  /** What the value means for this specific record. */
  hereText: string;
  /** What a receiver assumes when the tag is absent. `null` when the tag is required and has no default. */
  defaultText: string | null;
  explicit: boolean;
};

function policyLabel(value: DmarcPolicyValue): string {
  return { none: "heç nə edilmir", quarantine: "karantinə göndərilir", reject: "rədd edilir" }[value];
}

function alignmentLabel(value: DmarcAlignment): string {
  return value === "s" ? "sərt (strict)" : "yumşaq (relaxed)";
}

/** Every tag, explicit or defaulted — the eleven-row table the whole tool exists to fill in. */
export function explainDmarcTags(record: DmarcRecord): DmarcTagExplanation[] {
  const ruaText = record.rua.length > 0 ? reportUriListText(record.rua) : "yoxdur";
  const rufText = record.ruf.length > 0 ? reportUriListText(record.ruf) : "yoxdur";

  return [
    {
      tag: "v",
      label: "v — versiya",
      meaning: "Qeydin DMARC olduğunu bildirir və protokolun versiyasını göstərir.",
      hereText: `"${record.v}" — düzgün DMARC qeydinin ilk teqi.`,
      defaultText: null,
      explicit: true,
    },
    {
      tag: "p",
      label: "p — siyasət",
      meaning: "Alıcı server SPF/DKIM uyğunsuzluğu tapanda nə edəcəyini deyir: `none`, `quarantine` və ya `reject`.",
      hereText: `"${record.p}" — uyğunsuz mesaj ${policyLabel(record.p)}.`,
      defaultText: null,
      explicit: true,
    },
    {
      tag: "sp",
      label: "sp — subdomen siyasəti",
      meaning: "Əsas domendən fərqli olaraq, yalnız subdomenlərdən gələn poçt üçün siyasəti göstərir.",
      hereText: record.spExplicit
        ? `"${record.sp}" — subdomen mesajı ${policyLabel(record.sp)}.`
        : `Yazılmayıb, "p"-dən miras alınıb: "${record.sp}".`,
      defaultText: "Yoxdursa `p` teqinin dəyərini alır.",
      explicit: record.spExplicit,
    },
    {
      tag: "pct",
      label: "pct — faiz",
      meaning: "Siyasətin uyğunsuz mesajların neçə faizinə tətbiq olunacağını göstərir.",
      hereText: record.pctExplicit
        ? `${record.pct}% — mesajların qalan ${100 - record.pct}%-i siyasətdən kənarda qalır.`
        : `Yazılmayıb, defolt ${DMARC_DEFAULTS.pct}% qəbul edilir — bütün mesajlar.`,
      defaultText: `Yoxdursa ${DMARC_DEFAULTS.pct} qəbul edilir.`,
      explicit: record.pctExplicit,
    },
    {
      tag: "rua",
      label: "rua — məcmu hesabat ünvanı",
      meaning: "Gündəlik məcmu (aggregate) hesabatların göndəriləcəyi `mailto:` ünvan(lar)ı göstərir.",
      hereText: record.ruaExplicit ? ruaText : "Yazılmayıb — heç bir məcmu hesabat gəlmir.",
      defaultText: "Yoxdursa heç bir hesabat göndərilmir.",
      explicit: record.ruaExplicit,
    },
    {
      tag: "ruf",
      label: "ruf — uğursuzluq hesabat ünvanı",
      meaning: "Hər bir uğursuz mesaj üçün ayrıca (forensic) hesabatın göndəriləcəyi ünvan(lar)ı göstərir.",
      hereText: record.rufExplicit ? rufText : "Yazılmayıb — heç bir uğursuzluq hesabatı göndərilmir.",
      defaultText: "Yoxdursa heç bir uğursuzluq hesabatı göndərilmir.",
      explicit: record.rufExplicit,
    },
    {
      tag: "adkim",
      label: "adkim — DKIM uyğunlaşma rejimi",
      meaning: "DKIM imzasının domeni ilə `From` başlığının domeninin necə üst-üstə düşməli olduğunu göstərir.",
      hereText: record.adkimExplicit
        ? `"${record.adkim}" — ${alignmentLabel(record.adkim)} uyğunlaşma.`
        : `Yazılmayıb, defolt "${DMARC_DEFAULTS.adkim}" (${alignmentLabel(DMARC_DEFAULTS.adkim)}) qəbul edilir.`,
      defaultText: "Yoxdursa `r` (yumşaq) qəbul edilir.",
      explicit: record.adkimExplicit,
    },
    {
      tag: "aspf",
      label: "aspf — SPF uyğunlaşma rejimi",
      meaning: "SPF-də təsdiqlənən domenin `From` başlığının domeninə necə uyğun gəlməli olduğunu göstərir.",
      hereText: record.aspfExplicit
        ? `"${record.aspf}" — ${alignmentLabel(record.aspf)} uyğunlaşma.`
        : `Yazılmayıb, defolt "${DMARC_DEFAULTS.aspf}" (${alignmentLabel(DMARC_DEFAULTS.aspf)}) qəbul edilir.`,
      defaultText: "Yoxdursa `r` (yumşaq) qəbul edilir.",
      explicit: record.aspfExplicit,
    },
    {
      tag: "fo",
      label: "fo — uğursuzluq hesabat seçimləri",
      meaning: "`ruf` hesabatının hansı halda göndəriləcəyini göstərir (`0` hər ikisi, `1` hər hansı biri uğursuz olanda).",
      hereText: record.foExplicit
        ? `"${record.fo}"`
        : `Yazılmayıb, defolt "${DMARC_DEFAULTS.fo}" qəbul edilir — yalnız SPF və DKIM-in ikisi də uğursuz olanda.`,
      defaultText: `Yoxdursa "${DMARC_DEFAULTS.fo}" qəbul edilir.`,
      explicit: record.foExplicit,
    },
    {
      tag: "rf",
      label: "rf — hesabat formatı",
      meaning: "Uğursuzluq hesabatının hansı formatda yazılacağını göstərir.",
      hereText: record.rfExplicit ? `"${record.rf}"` : `Yazılmayıb, defolt "${DMARC_DEFAULTS.rf}" qəbul edilir.`,
      defaultText: `Yoxdursa "${DMARC_DEFAULTS.rf}" qəbul edilir.`,
      explicit: record.rfExplicit,
    },
    {
      tag: "ri",
      label: "ri — hesabat intervalı",
      meaning: "Məcmu hesabatların neçə saniyədən bir göndərilməsini istədiyini göstərir.",
      hereText: record.riExplicit
        ? `${record.ri} saniyə`
        : `Yazılmayıb, defolt ${DMARC_DEFAULTS.ri} saniyə (24 saat) qəbul edilir.`,
      defaultText: `Yoxdursa ${DMARC_DEFAULTS.ri} qəbul edilir.`,
      explicit: record.riExplicit,
    },
  ];
}

/* ---------- building ---------- */

export type DmarcBuildFields = {
  domain: string;
  p: DmarcPolicyValue;
  /** `null` means "no `sp` tag — inherit from `p`". */
  sp: DmarcPolicyValue | null;
  pct: number;
  /** Plain `local@domain` addresses — `mailto:` is added on serialisation. */
  ruaAddresses: string[];
  rufAddresses: string[];
  adkim: DmarcAlignment;
  aspf: DmarcAlignment;
  fo: string;
  ri: number;
};

export const DMARC_BUILD_DEFAULTS: DmarcBuildFields = {
  domain: "",
  p: "none",
  sp: null,
  pct: 100,
  ruaAddresses: [],
  rufAddresses: [],
  adkim: "r",
  aspf: "r",
  fo: "0",
  ri: 86400,
};

/** Turns a set of build fields into a `v=...; p=...; ...` string, omitting any tag equal to its default. */
export function serializeDmarcRecord(fields: DmarcBuildFields): string {
  const tags = [`v=DMARC1`, `p=${fields.p}`];

  if (fields.sp !== null) tags.push(`sp=${fields.sp}`);
  if (fields.pct !== DMARC_DEFAULTS.pct) tags.push(`pct=${fields.pct}`);
  if (fields.ruaAddresses.length > 0) {
    tags.push(`rua=${fields.ruaAddresses.map((address) => `mailto:${address}`).join(",")}`);
  }
  if (fields.rufAddresses.length > 0) {
    tags.push(`ruf=${fields.rufAddresses.map((address) => `mailto:${address}`).join(",")}`);
  }
  if (fields.adkim !== DMARC_DEFAULTS.adkim) tags.push(`adkim=${fields.adkim}`);
  if (fields.aspf !== DMARC_DEFAULTS.aspf) tags.push(`aspf=${fields.aspf}`);
  if (fields.fo !== DMARC_DEFAULTS.fo) tags.push(`fo=${fields.fo}`);
  if (fields.ri !== DMARC_DEFAULTS.ri) tags.push(`ri=${fields.ri}`);

  return tags.join("; ");
}

/** The DNS zone line ready to paste — always at `_dmarc.<domain>`, never the apex, which is the trap this exists to prevent. */
export function buildDnsRecordLine(domain: string, recordValue: string): string {
  return `_dmarc.${domain}. IN TXT "${recordValue}"`;
}

export type DmarcBuildResult =
  | {
      ok: true;
      record: string;
      dnsRecordLine: string;
      tags: DmarcTagExplanation[];
      findings: DmarcFinding[];
    }
  | { ok: false; error: string };

/**
 * Validates the builder's fields, serialises them, and — rather than hand-
 * writing a second explanation of what the result means — parses that same
 * string straight back through `parseDmarcRecord` so `tags` and `findings`
 * come from the identical code path a pasted record would go through.
 */
export function buildDmarc(fields: DmarcBuildFields): DmarcBuildResult {
  const domain = fields.domain.trim().replace(/\.$/, "");
  if (domain === "") {
    return { ok: false, error: "Domen adı boşdur." };
  }
  if (!Number.isInteger(fields.pct) || fields.pct < 0 || fields.pct > 100) {
    return { ok: false, error: "pct 0 ilə 100 arasında tam ədəd olmalıdır." };
  }
  if (!Number.isInteger(fields.ri) || fields.ri < 0) {
    return { ok: false, error: "ri mənfi olmayan tam ədəd (saniyə) olmalıdır." };
  }
  for (const address of [...fields.ruaAddresses, ...fields.rufAddresses]) {
    if (!/^[^\s@]+@[^\s@]+$/.test(address)) {
      return { ok: false, error: `"${address}" düzgün e-poçt ünvanı deyil.` };
    }
  }

  const record = serializeDmarcRecord(fields);
  const parsed = parseDmarcRecord(record);
  if (!parsed.ok) {
    // Defensive only — every shape `serializeDmarcRecord` can produce from
    // validated fields parses cleanly; this exists so a future field this
    // function forgets to validate fails loudly instead of silently.
    return { ok: false, error: parsed.error };
  }

  return {
    ok: true,
    record,
    dnsRecordLine: buildDnsRecordLine(domain, record),
    tags: explainDmarcTags(parsed.record),
    findings: buildDmarcFindings(parsed.record, domain),
  };
}
