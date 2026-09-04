/**
 * Domain registration data — reading an RDAP domain record for the four
 * things a visitor actually asks a whois tool for: age, expiry, registrar
 * and what the status codes mean.
 *
 * Every extractor here is defensive on purpose. RDAP (RFC 9083) is a real
 * standard, but the four fields this tool shows are each buried differently
 * in every registry's answer, and a registry that omits one is answering
 * correctly, not answering badly — `parseDomainName` is the only function
 * here that is allowed to call something an error. Everything downstream of
 * a fetched RDAP body reads what is there and reports `null` for what is
 * not, the same discipline `menim-ip.ts`'s `extractRdapInfo` already uses
 * for the IP side of RDAP.
 *
 * Two things earned their own function and their own tests:
 *
 *   - The age and days-to-expiry arithmetic takes the "now" it measures
 *     against as a parameter rather than reading `Date.now()` itself, so a
 *     test written against a fixture from last year does not start failing
 *     the day it is checked in.
 *   - The EPP/RDAP status dictionary. A live registry answer (verisign's,
 *     read directly for this file) carries status values as lower-case,
 *     space-separated words — `"client transfer prohibited"` — not the
 *     camelCase EPP wire form (`clientTransferProhibited`) that RFC 5731
 *     defines and that most write-ups quote. `normalizeEppCode` folds both
 *     spellings to one key, so the dictionary below only has to say each
 *     thing once.
 */

/* ---------- domain name validation ---------- */

/*
 * A domain name, not a URL and not a bare label. `resolveHost` in
 * `socket-probe.ts` validates a hostname too, but it also resolves it over
 * DNS and refuses private ranges — machinery this tool has no use for: RDAP
 * is asked about the *name*, this server never connects to the domain
 * itself, so there is nothing to rebind and nothing to block. The shape
 * check is small enough to repeat here rather than pull in a module built
 * for a different fence.
 */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type DomainCheck =
  | { ok: true; domain: string; tld: string }
  | { ok: false; error: string };

/** Trims, lower-cases and validates a visitor-typed domain name. */
export function parseDomainName(raw: string): DomainCheck {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, "");

  if (trimmed === "") return { ok: false, error: "Boş sahə — domen adı yaz." };
  if (trimmed.length > 253) {
    return { ok: false, error: "Domen adı həddindən uzundur." };
  }
  if (!DOMAIN_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "Domen adı oxunmadı — «example.com» formatında, sxem və yol olmadan yaz.",
    };
  }

  const tld = trimmed.slice(trimmed.lastIndexOf(".") + 1);
  return { ok: true, domain: trimmed, tld };
}

/* ---------- EPP / RDAP status dictionary ---------- */

export type EppStatusExplained = {
  /** Exactly as the RDAP record wrote it — never normalised for display. */
  code: string;
  explanation: string;
};

/** camelCase or already-spaced, folded to one lower-case, space-separated key. */
function normalizeEppCode(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/*
 * What each status means for the domain's owner, in plain terms — this is
 * the whole reason the tool exists, since every other whois site prints the
 * raw code and leaves the visitor to search for it. A `client*` code is
 * something a reseller or the owner asked for; a `server*` code is the
 * registry itself acting, usually over a dispute or a policy breach; the
 * `*period` and `pending*` codes name a stage in the domain's lifecycle
 * rather than a lock at all.
 */
const EPP_STATUS_EXPLANATIONS: Record<string, string> = {
  ok: "Domendə heç bir məhdudiyyət yoxdur — transfer, silmə və yeniləmə sərbəstdir.",
  active: "Domen aktivdir və heç bir məhdudiyyət daşımır — bəzi reyestrlər «ok» əvəzinə bu sözü yazır.",

  "client transfer prohibited":
    "Reyestrator (və ya sahibin özü) domenin başqa reyestratora keçirilməsini qəsdən bloklayıb — bu, təhlükəsizlik qıfılıdır, problem əlaməti deyil. Transfer lazım olsa, əvvəlcə reyestratordan bu qıfılı açmaq istənilir.",
  "server transfer prohibited":
    "Reyestrin özü (registry, reyestrator yox) transferi bloklayıb — adətən mübahisə, məhkəmə qərarı və ya reyestrin siyasəti səbəbindən qoyulur.",
  "client delete prohibited":
    "Reyestrator domenin təsadüfən silinməsinin qarşısını almaq üçün qıfıl qoyub — normal qoruyucu tədbirdir.",
  "server delete prohibited":
    "Reyestr domeni silinmədən qoruyur — adətən reyestrin öz siyasəti və ya hüquqi məhdudiyyət səbəbindən.",
  "client renew prohibited":
    "Reyestrator bu domen üçün yenilənməni bloklayıb — nadir hallarda, adətən hesab və ya ödəniş problemi ilə bağlı olur.",
  "server renew prohibited": "Reyestr bu domenin yenilənməsini bloklayıb.",
  "client update prohibited":
    "Reyestrator domen məlumatlarının (nameserver, əlaqə və s.) dəyişdirilməsini bloklayıb — təhlükəsizlik qıfılıdır.",
  "server update prohibited": "Reyestr domen məlumatlarının dəyişdirilməsini bloklayıb.",
  "transfer prohibited":
    "Domenin transferi bloklanıb — reyestr sahiblə reyestratoru ayırmadan bu qıfılı qoyub.",
  "delete prohibited": "Domenin silinməsi bloklanıb.",
  "renew prohibited": "Domenin yenilənməsi bloklanıb.",
  "update prohibited": "Domen məlumatlarının dəyişdirilməsi bloklanıb.",

  "client hold": "Reyestrator domeni DNS-dən müvəqqəti çıxarıb — sayt işləməyəcək, adətən ödəniş problemi və ya sui-istifadə şübhəsi ilə qoyulur.",
  "server hold": "Reyestr domeni DNS-dən çıxarıb — sayt bütün dünyada əlçatmaz olur, adətən mübahisə və ya sui-istifadə araşdırması zamanı qoyulur.",
  locked: "Domen kilidlənib — bu, adətən «client transfer prohibited»-in reyestratorlar tərəfindən istifadə edilən adi adıdır və sahibin özü tərəfindən qoyulan qorumadır.",
  inactive: "Domenin heç bir nameserver-i qeydə alınmayıb — qeydiyyat var, amma DNS qurulmayıb, sayt bu adla açılmayacaq.",

  "pending create": "Domenin qeydiyyatı hələ tamamlanır — adətən bir neçə saat içində bitir.",
  "pending delete": "Domen artıq silinmə prosesindədir — bir neçə gün içində tamamilə boşalacaq və hər kəs onu qeydiyyatdan keçirə biləcək.",
  "pending renew": "Domenin yenilənmə sorğusu icra olunur.",
  "pending restore": "Domen «redemption period»-dan geri qaytarılır — sahibi onu bərpa etmək üçün əlavə ödəniş edib.",
  "pending transfer": "Domenin başqa reyestratora keçirilmə sorğusu təsdiq gözləyir.",
  "pending update": "Domen məlumatlarında dəyişiklik icra olunur.",

  "add period": "Domen son beş gün ərzində qeydə alınıb — bu müddətdə reyestrator qeydiyyatı pulsuz ləğv edə bilər (add grace period).",
  "auto renew period": "Domenin müddəti bitib və avtomatik yenilənib — sahib bu qısa pəncərədə (adətən 45 gün) yenilənməni pulsuz ləğv edə bilər.",
  "renew period": "Domen yaxınlarda əl ilə yenilənib — qısa ləğv pəncərəsindədir (renew grace period).",
  "transfer period": "Domen yaxınlarda başqa reyestratora keçirilib — qısa ləğv pəncərəsindədir (transfer grace period).",
  "redemption period":
    "Domenin müddəti bitib və artıq silinmə mərhələsindədir — bu, itirilmiş domen demək deyil: sahib onu adətən 30 gün ərzində əlavə ödənişlə bərpa edə bilər, sonra tamamilə buraxılır.",
};

/**
 * Explains one raw status code. An unrecognised code comes back with the
 * code itself plus a plain "no explanation" marker — never an empty string,
 * which would read as this tool having silently dropped the status.
 */
export function explainEppStatus(rawCode: string): EppStatusExplained {
  const explanation = EPP_STATUS_EXPLANATIONS[normalizeEppCode(rawCode)];
  return { code: rawCode, explanation: explanation ?? `${rawCode} — izah yoxdur.` };
}

/* ---------- reading the RDAP body ---------- */

export type WhoisDates = {
  registration: string | null;
  lastChanged: string | null;
  expiration: string | null;
  transfer: string | null;
};

const EVENT_FIELDS: Record<string, keyof WhoisDates> = {
  registration: "registration",
  "last changed": "lastChanged",
  expiration: "expiration",
  transfer: "transfer",
};

/**
 * Reads the four dates this tool cares about out of RDAP's `events` array —
 * `[{ eventAction: "registration", eventDate: "…" }, …]`. An action this
 * tool does not track (`"last update of RDAP database"` is common and
 * ignored) is skipped rather than collected; the first occurrence of a
 * tracked action wins, since a well-formed record does not repeat one.
 */
export function extractDates(json: unknown): WhoisDates {
  const dates: WhoisDates = {
    registration: null,
    lastChanged: null,
    expiration: null,
    transfer: null,
  };
  if (typeof json !== "object" || json === null) return dates;

  const events = (json as Record<string, unknown>).events;
  if (!Array.isArray(events)) return dates;

  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const record = event as Record<string, unknown>;
    const action = typeof record.eventAction === "string" ? record.eventAction.toLowerCase().trim() : "";
    const field = EVENT_FIELDS[action];
    if (!field || dates[field] !== null) continue;
    if (typeof record.eventDate === "string" && record.eventDate !== "") {
      dates[field] = record.eventDate;
    }
  }

  return dates;
}

const DAY_MS = 86_400_000;

/**
 * Whole days between a registration date and `reference`. Floored: a domain
 * registered nineteen hours ago is zero days old, not one.
 */
export function computeAgeDays(registrationIso: string | null, reference: Date): number | null {
  if (registrationIso === null) return null;
  const registered = new Date(registrationIso);
  if (Number.isNaN(registered.getTime())) return null;
  return Math.floor((reference.getTime() - registered.getTime()) / DAY_MS);
}

/**
 * Whole days until an expiry date, `reference` counted from. Ceilinged
 * rather than floored, the opposite rounding from age: a domain that
 * expires in nineteen hours reads as one day left, not zero — the owner
 * still has today to act, and rounding it down to zero would read as
 * already expired. Negative once the date has passed.
 */
export function computeDaysToExpiry(expirationIso: string | null, reference: Date): number | null {
  if (expirationIso === null) return null;
  const expiry = new Date(expirationIso);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - reference.getTime()) / DAY_MS);
}

export type WhoisRegistrar = {
  name: string | null;
  /** The IANA Registrar ID, when the record's `publicIds` carries one. */
  ianaId: string | null;
};

/** Reads one named property out of an entity's `vcardArray` — the same
 *  `["vcard", [[name, params, type, value], …]]` shape `menim-ip.ts` reads,
 *  duplicated rather than imported because that file's version is typed for
 *  a network entity, not a domain registrar; the two never call each other. */
function vcardField(vcardArray: unknown, name: string): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return null;
  const entries = vcardArray[1];
  if (!Array.isArray(entries)) return null;

  for (const entry of entries) {
    if (Array.isArray(entry) && entry[0] === name && typeof entry[3] === "string" && entry[3] !== "") {
      return entry[3];
    }
  }
  return null;
}

/**
 * Finds the entity whose `roles` includes `"registrar"` and reads its name
 * and IANA id. Absent `entities`, an entity with no registrar role, or a
 * `vcardArray` in a shape this function does not recognise all come back as
 * `{ name: null, ianaId: null }` rather than throwing — a registrar this
 * tool cannot name is a smaller gap than a page that will not render.
 */
export function extractRegistrar(json: unknown): WhoisRegistrar {
  const empty: WhoisRegistrar = { name: null, ianaId: null };
  if (typeof json !== "object" || json === null) return empty;

  const entities = (json as Record<string, unknown>).entities;
  if (!Array.isArray(entities)) return empty;

  for (const entity of entities) {
    if (typeof entity !== "object" || entity === null) continue;
    const record = entity as Record<string, unknown>;
    const roles = record.roles;
    if (!Array.isArray(roles) || !roles.includes("registrar")) continue;

    const name = vcardField(record.vcardArray, "fn");

    let ianaId: string | null = null;
    const publicIds = record.publicIds;
    if (Array.isArray(publicIds)) {
      for (const entry of publicIds) {
        if (typeof entry !== "object" || entry === null) continue;
        const publicId = entry as Record<string, unknown>;
        if (publicId.type === "IANA Registrar ID" && typeof publicId.identifier === "string") {
          ianaId = publicId.identifier;
          break;
        }
      }
    }

    return { name, ianaId };
  }

  return empty;
}

/** The `ldhName` off every entry in RDAP's `nameservers` array. */
export function extractNameservers(json: unknown): string[] {
  if (typeof json !== "object" || json === null) return [];
  const nameservers = (json as Record<string, unknown>).nameservers;
  if (!Array.isArray(nameservers)) return [];

  const names: string[] = [];
  for (const entry of nameservers) {
    if (typeof entry !== "object" || entry === null) continue;
    const ldh = (entry as Record<string, unknown>).ldhName;
    if (typeof ldh === "string" && ldh !== "") names.push(ldh);
  }
  return names;
}

/** Every entry of RDAP's `status` array, explained. */
export function extractStatuses(json: unknown): EppStatusExplained[] {
  if (typeof json !== "object" || json === null) return [];
  const status = (json as Record<string, unknown>).status;
  if (!Array.isArray(status)) return [];

  return status.filter((entry): entry is string => typeof entry === "string" && entry !== "").map(explainEppStatus);
}

export type WhoisDnssec = { signed: boolean };

/**
 * RFC 9083's `secureDNS` object carries `delegationSigned`, and the RFC
 * itself defaults an absent field to `false` — so a record with no
 * `secureDNS` at all and a record with `secureDNS.delegationSigned: false`
 * read identically here, which is the honest reading of the spec rather
 * than a guess.
 */
export function extractDnssec(json: unknown): WhoisDnssec {
  if (typeof json !== "object" || json === null) return { signed: false };
  const secureDNS = (json as Record<string, unknown>).secureDNS;
  if (typeof secureDNS !== "object" || secureDNS === null) return { signed: false };
  return { signed: (secureDNS as Record<string, unknown>).delegationSigned === true };
}

function extractDomainName(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const ldhName = (json as Record<string, unknown>).ldhName;
  return typeof ldhName === "string" && ldhName !== "" ? ldhName : null;
}

export type WhoisReport = {
  domain: string | null;
  dates: WhoisDates;
  ageDays: number | null;
  daysToExpiry: number | null;
  registrar: WhoisRegistrar;
  nameservers: string[];
  statuses: EppStatusExplained[];
  dnssec: WhoisDnssec;
  /** The same instant `reference` names, stamped onto the report so the
   *  widget can show when the lookup happened without reading `Date.now()`
   *  a second time. */
  checkedAt: string;
};

/** Every extractor above, run once and folded into the shape the widget renders. */
export function buildWhoisReport(json: unknown, reference: Date): WhoisReport {
  const dates = extractDates(json);
  return {
    domain: extractDomainName(json),
    dates,
    ageDays: computeAgeDays(dates.registration, reference),
    daysToExpiry: computeDaysToExpiry(dates.expiration, reference),
    registrar: extractRegistrar(json),
    nameservers: extractNameservers(json),
    statuses: extractStatuses(json),
    dnssec: extractDnssec(json),
    checkedAt: reference.toISOString(),
  };
}

export type WhoisPayloadResult = { ok: true; report: WhoisReport } | { ok: false; error: string };

/**
 * Parses a raw RDAP response body and builds the report in one step — the
 * function the route calls, so `JSON.parse`'s own exception never has to be
 * caught twice. A body that is not JSON at all is the one input every
 * extractor above cannot be handed (they all assume `json: unknown`, but
 * `unknown` still has to have been parsed), so it is turned into a result
 * here instead of thrown.
 */
export function parseWhoisPayload(text: string, reference: Date): WhoisPayloadResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Reyestr gözlənilməz formatda cavab verdi." };
  }
  return { ok: true, report: buildWhoisReport(json, reference) };
}
