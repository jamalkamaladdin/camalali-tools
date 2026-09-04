/*
 * What a certificate transparency search answers with, and what is left of it
 * after the noise is removed.
 *
 * crt.sh returns one row per certificate, and every certificate names each
 * host it covers — so a site that renews monthly for two years arrives
 * twenty-four times over, and a wildcard arrives as `*.example.com`, which is
 * not a host anybody can visit. Some rows also carry an address in the SAN
 * list, which is not a host either and is the one field here that could be
 * personal.
 *
 * The answer worth showing is the set of distinct names under the domain, each
 * with the earliest date a certificate was issued for it. Building that set is
 * everything below; it is kept out of the route so it can be proved without
 * asking crt.sh anything.
 */

/** The shape read off a crt.sh row. Everything is `unknown` because it is JSON from outside. */
export type CrtRow = {
  common_name?: unknown;
  name_value?: unknown;
  not_before?: unknown;
};

export type SubdomainEntry = {
  /** Lowercase host. Never a wildcard — the star is folded away before this. */
  name: string;
  /** `YYYY-MM-DD` of the earliest certificate seen for it, or null when the row had no date. */
  firstSeen: string | null;
};

export type SubdomainResult = {
  /** The name actually queried, after normalisation. */
  domain: string;
  /** Distinct hosts found, before the limit is applied. */
  total: number;
  entries: SubdomainEntry[];
  /** How many were left out by the limit. */
  hidden: number;
  /** How many certificate names were wildcards. A high count means one cert covers everything. */
  wildcards: number;
};

/*
 * A large domain can carry thousands of names and a list that long is not read,
 * it is scrolled past. Three hundred is enough to cover every domain an
 * ordinary team owns, and the visitor is told the true total either way.
 */
export const SUBDOMAIN_LIMIT = 300;

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const TLD = /^[a-z]{2,63}$/;

/**
 * Whether a normalised string is a domain name at all.
 *
 * Checked label by label rather than with one regex: the rule "a label may
 * contain a hyphen but may not begin or end with one" needs a lookbehind to
 * write inline, and the loop says the same thing without depending on regex
 * features. The last label must be letters only, which is what keeps an IPv4
 * address — a perfectly good four-label string — out of an outside query.
 */
export function isValidDomain(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;

  const labels = value.split(".");
  // A single label is a machine name on somebody's local network; a
  // certificate log has nothing to say about it.
  if (labels.length < 2) return false;
  if (labels.some((label) => label.length === 0 || label.length > 63)) return false;
  if (!labels.every((label) => LABEL.test(label))) return false;

  return TLD.test(labels[labels.length - 1]);
}

/**
 * Turns whatever was pasted into the name to query.
 *
 * The common paste is a full address out of the browser bar, so the scheme,
 * the port, the path and the trailing dot are removed rather than rejected —
 * refusing `https://example.com/` would be technically correct and useless.
 *
 * `www.` is dropped as well, and that is a deliberate change of meaning: the
 * visitor asking about `www.example.com` wants to know what else is under
 * `example.com`, and querying the host would hide exactly that. The tool shows
 * which name it ended up asking about.
 */
export function normaliseDomain(value: string): string {
  let out = value.trim().toLowerCase();

  out = out.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");

  const cut = out.search(/[/?#]/);
  if (cut !== -1) out = out.slice(0, cut);

  const port = out.indexOf(":");
  if (port !== -1) out = out.slice(0, port);

  out = out.replace(/\.+$/, "");

  if (out.startsWith("www.") && out.split(".").length > 2) out = out.slice(4);

  return out;
}

export type DomainCheck = { ok: true; domain: string } | { ok: false; error: string };

/* Printable ASCII only. Written as a range of printable characters so the
   pattern holds no control characters of its own. */
const ASCII = /^[ -~]*$/;

/**
 * Normalises and validates in one step, with the sentence the visitor sees.
 *
 * Shared by the widget and the route on purpose: the endpoint has to validate
 * because it is a door, the widget wants to say why before spending a request,
 * and two copies of that rule would drift apart on the day the rule changes.
 */
export function readDomain(value: string): DomainCheck {
  const domain = normaliseDomain(value);

  if (domain === "") {
    return { ok: false, error: "Domen adı yaz — məsələn camalali.com." };
  }

  if (!ASCII.test(domain)) {
    return {
      ok: false,
      error:
        "Latın əlifbasından kənar hərf var. Sertifikat loqu belə domenləri punycode formasında saxlayır — «xn--» ilə başlayan formanı yaz.",
    };
  }

  if (!isValidDomain(domain)) {
    return {
      ok: false,
      error:
        "Domen formatı düzgün deyil: ən azı bir nöqtə olmalı, hər hissə hərf və ya rəqəmlə başlayıb-bitməli, sonuncu hissə isə yalnız hərflərdən ibarət olmalıdır.",
    };
  }

  return { ok: true, domain };
}

/** crt.sh answers with a JSON array; anything else is an outage dressed as a page. */
export function parseCrtRows(body: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** crt.sh writes `2026-08-31T23:53:20` with no zone, so only the day is trustworthy. */
function issuedDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

/**
 * Every name a row claims.
 *
 * `name_value` is the SAN list, newline separated, and it is where the
 * subdomains actually are. `common_name` repeats one of them in almost every
 * certificate — it is read anyway, because the two disagree on old
 * certificates and the union is cheap.
 */
function namesOf(row: CrtRow): string[] {
  const names: string[] = [];
  if (typeof row.common_name === "string") names.push(row.common_name);
  if (typeof row.name_value === "string") names.push(...row.name_value.split("\n"));
  return names;
}

function isUnder(name: string, domain: string): boolean {
  return name === domain || name.endsWith(`.${domain}`);
}

/**
 * Folds crt.sh rows into the distinct hosts under `domain`.
 *
 * `rows` is typed `unknown` because it is parsed JSON from a service nobody
 * here controls: a row that is a string, a null, or an object with a numeric
 * `name_value` must be skipped rather than crash a page.
 */
export function collectSubdomains(
  rows: unknown,
  domain: string,
  limit = SUBDOMAIN_LIMIT,
): SubdomainResult {
  const found = new Map<string, string | null>();
  let wildcards = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row !== "object" || row === null) continue;

    const issued = issuedDay((row as CrtRow).not_before);

    for (const raw of namesOf(row as CrtRow)) {
      let name = raw.trim().toLowerCase();
      if (name === "") continue;

      /* A certificate for `*.example.com` proves the domain has a wildcard,
         not that a host called `*` exists. The star is stripped and counted —
         "there is a wildcard here" is itself worth telling the visitor, since
         it means the log will never reveal what sits behind it. */
      if (name.startsWith("*.")) {
        wildcards += 1;
        name = name.slice(2);
      }

      // An address in the SAN list is not a host, and it is the only value in
      // this feed that could belong to a person.
      if (name.includes("@") || name.includes(" ")) continue;
      if (!isUnder(name, domain)) continue;

      /* The date kept is the earliest, because the question the visitor is
         asking is "when did this appear", not "when was it last renewed" —
         and a renewal every ninety days would otherwise erase the answer.
         ISO dates compare correctly as strings, which is the whole reason the
         day is stored as text rather than parsed into a Date. */
      const previous = found.get(name);
      if (previous === undefined) {
        found.set(name, issued);
      } else if (issued !== null && (previous === null || issued < previous)) {
        found.set(name, issued);
      }
    }
  }

  /* Plain alphabetical order. Sorting by first-seen date was the alternative
     and it reads worse: the visitor is looking for one name they half
     remember, and a list they can scan beats a list that tells a story. */
  const all: SubdomainEntry[] = [...found.entries()]
    .map(([name, firstSeen]) => ({ name, firstSeen }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    domain,
    total: all.length,
    entries: all.slice(0, limit),
    hidden: Math.max(0, all.length - limit),
    wildcards,
  };
}
