/**
 * Reading a response's caching headers as the browser (and any CDN in front
 * of the origin) actually reads them — not just whether `Cache-Control` is
 * present, but what it forbids, what a shared cache is and is not allowed to
 * do with the response, and whether the two revalidators (`ETag`,
 * `Last-Modified`) that make a conditional request possible are even there.
 *
 * `Cache-Control` directives interact rather than stack — `no-store` makes
 * every other directive irrelevant, `no-cache` forces revalidation even on a
 * response `max-age` calls fresh — and a header author gets that wrong often
 * enough that the point of this tool is naming the contradiction, not just
 * echoing the header back.
 */

export type CacheControlDirectives = {
  raw: string | null;
  noStore: boolean;
  noCache: boolean;
  mustRevalidate: boolean;
  proxyRevalidate: boolean;
  public: boolean;
  private: boolean;
  immutable: boolean;
  /** Seconds. Null when the directive is absent or its value did not parse. */
  maxAge: number | null;
  sMaxAge: number | null;
  staleWhileRevalidate: number | null;
};

function directiveSeconds(directives: string[], name: string): number | null {
  for (const token of directives) {
    const match = new RegExp(`^${name}\\s*=\\s*"?(\\d+)"?$`, "i").exec(token);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function directivePresent(directives: string[], name: string): boolean {
  return directives.some((token) => token.toLowerCase() === name);
}

/** Malformed tokens (a stray comma, an empty segment) are dropped rather than rejected — this mirrors how a real cache reads a header nobody hand-checked before deploying it. */
export function parseCacheControl(value: string | null): CacheControlDirectives {
  const directives = (value ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");

  return {
    raw: value,
    noStore: directivePresent(directives, "no-store"),
    noCache: directivePresent(directives, "no-cache"),
    mustRevalidate: directivePresent(directives, "must-revalidate"),
    proxyRevalidate: directivePresent(directives, "proxy-revalidate"),
    public: directivePresent(directives, "public"),
    private: directivePresent(directives, "private"),
    immutable: directivePresent(directives, "immutable"),
    maxAge: directiveSeconds(directives, "max-age"),
    sMaxAge: directiveSeconds(directives, "s-maxage"),
    staleWhileRevalidate: directiveSeconds(directives, "stale-while-revalidate"),
  };
}

export type EtagInfo = { present: boolean; weak: boolean; value: string | null };

function readEtag(value: string | null): EtagInfo {
  if (value === null) return { present: false, weak: false, value: null };
  return { present: true, weak: /^W\//.test(value.trim()), value };
}

export type CacheHeadersInput = {
  cacheControl: string | null;
  etag: string | null;
  lastModified: string | null;
  expires: string | null;
  vary: string | null;
  age: string | null;
  pragma: string | null;
};

export type CacheConflict = { message: string };

export type CacheReport = {
  directives: CacheControlDirectives;
  etag: EtagInfo;
  lastModified: string | null;
  vary: string[];
  varyIsWildcard: boolean;
  ageSeconds: number | null;
  /** Whether the response is stored at all — false only for `no-store`. */
  storable: boolean;
  /** Whether a CDN or another shared cache is allowed to keep a copy for other visitors. */
  cacheableByCdn: boolean;
  /** Seconds the response can be served without revalidation. Null when `storable` is false or no freshness signal exists. */
  freshForSeconds: number | null;
  /** Whether a later request can use `If-None-Match` / `If-Modified-Since` instead of a full re-fetch. */
  conditionalRequestReady: boolean;
  conflicts: CacheConflict[];
};

/**
 * Turns the raw header values into the full report: parsed directives, the
 * effective freshness window, and the contradictions a header author is
 * likely to have introduced without meaning to.
 */
export function buildCacheReport(input: CacheHeadersInput, now: Date = new Date()): CacheReport {
  const directives = parseCacheControl(input.cacheControl);
  const etag = readEtag(input.etag);
  const vary = (input.vary ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
  const varyIsWildcard = vary.includes("*");

  const ageSeconds = input.age !== null && /^\d+$/.test(input.age.trim()) ? Number.parseInt(input.age, 10) : null;

  const storable = !directives.noStore;

  const cacheableByCdn = storable && !directives.private && (directives.public || directives.sMaxAge !== null || directives.maxAge !== null) && !varyIsWildcard;

  let freshForSeconds: number | null = null;
  if (storable && !directives.noCache) {
    if (directives.sMaxAge !== null) {
      freshForSeconds = directives.sMaxAge;
    } else if (directives.maxAge !== null) {
      freshForSeconds = directives.maxAge;
    } else if (input.expires !== null) {
      const parsed = new Date(input.expires);
      if (!Number.isNaN(parsed.getTime())) {
        freshForSeconds = Math.max(0, Math.round((parsed.getTime() - now.getTime()) / 1000));
      }
    }
  }

  const conditionalRequestReady = etag.present || input.lastModified !== null;

  const conflicts: CacheConflict[] = [];
  if (directives.noStore && (directives.maxAge !== null || directives.sMaxAge !== null)) {
    conflicts.push({
      message: "«no-store» ilə «max-age» birlikdə yazılıb — «no-store» bütün digər göstərişləri ləğv edir, «max-age» heç vaxt nəzərə alınmır.",
    });
  }
  if (directives.noCache && (directives.maxAge !== null || directives.sMaxAge !== null)) {
    conflicts.push({
      message: "«no-cache» ilə müsbət «max-age» birlikdə yazılıb — «no-cache» yenə də hər sorğuda serverlə yenidən təsdiqləşməyi məcbur edir, «max-age» müddəti gözlənilmədən.",
    });
  }
  if (varyIsWildcard) {
    conflicts.push({
      message: "«Vary: *» yazılıb — bu, cavabın demək olar heç bir ara keşdə saxlanmayacağı mənasına gəlir, çünki hər sorğu fərqli sayılır.",
    });
  }
  if (directives.mustRevalidate && !conditionalRequestReady) {
    conflicts.push({
      message: "«must-revalidate» var, amma nə ETag, nə Last-Modified var — müddət bitəndə server şərti sorğu ala bilmir, tam yenidən yükləməyə məcbur olur.",
    });
  }
  if (directives.private && directives.public) {
    conflicts.push({
      message: "«public» ilə «private» birlikdə yazılıb — RFC 9111-ə görə «private» qalib gəlir, ara keşlər cavabı saxlaya bilmir.",
    });
  }
  if (directives.raw === null && input.pragma !== null && /no-cache/i.test(input.pragma)) {
    conflicts.push({
      message: "Cache-Control yoxdur, yalnız köhnə «Pragma: no-cache» var — müasir brauzerlər cavab başlığında bunu həmişə nəzərə almır, yalnız sorğu başlığında etibarlıdır.",
    });
  }

  return {
    directives,
    etag,
    lastModified: input.lastModified,
    vary,
    varyIsWildcard,
    ageSeconds,
    storable,
    cacheableByCdn,
    freshForSeconds,
    conditionalRequestReady,
    conflicts,
  };
}

export type CacheHeadersReport = CacheReport & {
  url: string;
  status: number;
  checkedAt: string;
};
