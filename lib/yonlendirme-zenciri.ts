/**
 * Reading a redirect chain: what each hop answered, and what is wrong with it.
 *
 * Everything here is a pure function on a list of hops. The walking itself is
 * `followRedirects` in `safe-fetch.ts`, which re-checks every address before it
 * calls it — this module never fetches anything and never decides where to go
 * next, so every judgement the tool shows can be checked without a server to
 * point at.
 *
 * What this module deliberately cannot see: `<meta http-equiv="refresh">` and
 * `location.href = ...`. Both are redirects to a visitor and neither is one to
 * HTTP, so a chain that ends at 200 here may still move afterwards. The widget
 * says so rather than letting the reader assume otherwise.
 */

/** What one hop is, in the reader's terms rather than in status-code terms. */
export type HopKind = "daimi" | "muveqqeti" | "son" | "xeta";

export type ChainStep = {
  url: string;
  status: number;
  /** The `Location` header, already resolved against the address it arrived on. */
  location: string | null;
  kind: HopKind;
  /** The status in words. The number is carried separately and shown beside it,
      so the colour of a badge is never the only thing that says what happened. */
  label: string;
};

export type ChainIssue = {
  severity: "xeta" | "xeberdarliq";
  message: string;
  /** 1-based step number, or null when the finding is about the whole chain. */
  step: number | null;
};

export type ChainReport = {
  /** The address the visitor typed, after normalisation. */
  url: string;
  steps: ChainStep[];
  issues: ChainIssue[];
  finalUrl: string;
  finalStatus: number;
  /** True when the walk stopped on the hop limit or on an address already seen. */
  truncated: boolean;
  checkedAt: string;
};

/*
 * The codes worth naming. Everything outside this table falls back to its class
 * below, so an unusual status is described rather than dropped.
 *
 * 304 sits under "son" on purpose: it is a 3xx by number but it is a cache
 * answer, not a move, and calling it a redirect would put a hop in the chain
 * that nobody travelled.
 */
const STATUS_LABELS: Record<number, { kind: HopKind; label: string }> = {
  200: { kind: "son", label: "son ünvan, səhifə var" },
  201: { kind: "son", label: "yaradıldı" },
  204: { kind: "son", label: "gövdəsiz cavab" },
  300: { kind: "muveqqeti", label: "çoxvariantlı cavab" },
  301: { kind: "daimi", label: "daimi köçürmə" },
  302: { kind: "muveqqeti", label: "müvəqqəti köçürmə" },
  303: { kind: "muveqqeti", label: "başqa ünvana bax" },
  304: { kind: "son", label: "dəyişməyib (keşdən)" },
  307: { kind: "muveqqeti", label: "müvəqqəti köçürmə, metod saxlanılır" },
  308: { kind: "daimi", label: "daimi köçürmə, metod saxlanılır" },
  400: { kind: "xeta", label: "səhv sorğu" },
  401: { kind: "xeta", label: "giriş tələb olunur" },
  403: { kind: "xeta", label: "giriş bağlıdır" },
  404: { kind: "xeta", label: "səhifə tapılmadı" },
  410: { kind: "xeta", label: "səhifə silinib" },
  429: { kind: "xeta", label: "çox sorğu, server gözlədir" },
  500: { kind: "xeta", label: "server xətası" },
  502: { kind: "xeta", label: "şlüz xətası" },
  503: { kind: "xeta", label: "xidmət əlçatmazdır" },
  504: { kind: "xeta", label: "şlüz vaxtı bitdi" },
};

/** Turns a status code into the kind and the word the chain shows for it. */
export function describeStatus(status: number): { kind: HopKind; label: string } {
  const known = STATUS_LABELS[status];
  if (known) return known;
  if (status >= 200 && status < 300) return { kind: "son", label: "uğurlu cavab" };
  if (status >= 300 && status < 400) return { kind: "muveqqeti", label: "yönləndirmə" };
  if (status >= 400 && status < 500) return { kind: "xeta", label: "müştəri tərəfi xətası" };
  if (status >= 500 && status < 600) return { kind: "xeta", label: "server tərəfi xətası" };
  return { kind: "xeta", label: "naməlum cavab" };
}

/** Adds the reading to each hop. The order and the addresses are left alone. */
export function buildChain(
  hops: { url: string; status: number; location: string | null }[],
): ChainStep[] {
  return hops.map((hop) => {
    const { kind, label } = describeStatus(hop.status);
    return { url: hop.url, status: hop.status, location: hop.location, kind, label };
  });
}

/** How many of the steps actually moved the visitor somewhere else. */
export function countRedirects(steps: ChainStep[]): number {
  return steps.filter((step) => step.kind === "daimi" || step.kind === "muveqqeti").length;
}

/* ---------- what changed between two addresses ---------- */

type UrlShape = { scheme: string; host: string; rest: string };

function shapeOf(url: string): UrlShape | null {
  try {
    const parsed = new URL(url);
    return { scheme: parsed.protocol, host: parsed.host, rest: `${parsed.pathname}${parsed.search}` };
  } catch {
    return null;
  }
}

/**
 * Names the single dimension a hop changed, or says it changed several.
 *
 * This is what makes "http -> https -> www" findable: each of those two hops
 * changes exactly one thing, and two one-thing hops in a row are one hop
 * somebody split in half.
 */
type ChangeKind = "sxem" | "host" | "yol" | "qarisiq" | "eyni";

function changeBetween(from: string, to: string): ChangeKind {
  const left = shapeOf(from);
  const right = shapeOf(to);
  if (!left || !right) return "qarisiq";

  const scheme = left.scheme !== right.scheme;
  const host = left.host !== right.host;
  const rest = left.rest !== right.rest;
  const changed = [scheme, host, rest].filter(Boolean).length;

  if (changed === 0) return "eyni";
  if (changed > 1) return "qarisiq";
  if (scheme) return "sxem";
  if (host) return "host";
  return "yol";
}

/**
 * The address that closes a loop, or null.
 *
 * Two shapes have to be caught. A chain assembled by hand can carry the same
 * address twice; a chain walked by `followRedirects` cannot, because it stops
 * before repeating one — there the loop shows as the last hop's `Location`
 * pointing back at an address already walked.
 */
function findCycle(steps: ChainStep[]): { index: number; url: string } | null {
  const seen = new Map<string, number>();
  for (let index = 0; index < steps.length; index += 1) {
    if (seen.has(steps[index].url)) return { index, url: steps[index].url };
    seen.set(steps[index].url, index);
  }

  const last = steps[steps.length - 1];
  if (last && last.location !== null && seen.has(last.location)) {
    return { index: steps.length - 1, url: last.location };
  }
  return null;
}

/* A temporary code standing in for a move that is not temporary. 307 is in the
   set and 300 is not: 300 does not claim to be a move at all. */
const TEMPORARY_CODES = new Set([302, 303, 307]);

/** More than this many redirects and the chain is costing measurable time. */
const REDIRECT_WARNING_FLOOR = 2;

/**
 * Every fault the chain can be read for, worst kind first in the caller's view.
 *
 * `truncated` comes from the walker and means the chain did not end on its own
 * — either the hop limit ran out or an address repeated. The two read
 * differently, so a detected loop is reported as a loop and the limit is only
 * blamed when there is no loop to blame.
 *
 * An empty chain yields an empty list rather than a guess: nothing was walked,
 * so there is nothing to say about it.
 */
export function auditChain(steps: ChainStep[], truncated: boolean): ChainIssue[] {
  const issues: ChainIssue[] = [];
  if (steps.length === 0) return issues;

  const cycle = findCycle(steps);
  if (cycle) {
    issues.push({
      severity: "xeta",
      step: cycle.index + 1,
      message: `Dövrə: «${cycle.url}» ünvanı zəncirdə iki dəfə görünür. Brauzer belə zənciri bir neçə dəfə gəzib «çox yönləndirmə» xətası verir və səhifə heç vaxt açılmır.`,
    });
  } else if (truncated) {
    issues.push({
      severity: "xeta",
      step: steps.length,
      message: `Hop həddi keçildi: ${steps.length} addımdan sonra zəncir hələ də bitmirdi. Bu qədər uzun zəncir praktikada həmişə konfiqurasiya səhvidir — bir qayda digərini qidalandırır.`,
    });
  }

  const redirects = countRedirects(steps);
  if (redirects >= REDIRECT_WARNING_FLOOR) {
    issues.push({
      severity: "xeberdarliq",
      step: null,
      message: `Zəncirdə ${redirects} yönləndirmə var. Hər əlavə addım bir gediş-gəliş vaxtı əlavə edir və axtarış sistemləri üçün siqnal itkisidir — köhnə ünvanı birbaşa son ünvana yönləndir, aradakı pillələri saxlama.`,
    });
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];

    if (TEMPORARY_CODES.has(step.status)) {
      issues.push({
        severity: "xeberdarliq",
        step: index + 1,
        message: `${index + 1}. addım ${step.status} qaytarır — bu, «müvəqqəti» deməkdir. Köçürmə daimidirsə köhnə ünvan indeksdə qalır və sıralama yeni ünvana keçmir; daimi köçürmə üçün 301 (və ya metodu saxlamaq lazımdırsa 308) yazılmalıdır.`,
      });
    }

    const next = steps[index + 1];
    if (!next) continue;

    if (step.url.startsWith("https://") && next.url.startsWith("http://")) {
      issues.push({
        severity: "xeta",
        step: index + 2,
        message: `${index + 1}. addım https-dən http-yə enir. Bu addımda bağlantı şifrələnmir — aradakı şəbəkə həm ünvanı, həm də kukiləri oxuya bilir. Yönləndirmə heç vaxt sxemi aşağı salmamalıdır.`,
      });
    }

    const after = steps[index + 2];
    if (!after) continue;

    const first = changeBetween(step.url, next.url);
    const second = changeBetween(next.url, after.url);
    const oneThing = (kind: ChangeKind) => kind === "sxem" || kind === "host";

    if (oneThing(first) && oneThing(second) && first !== second) {
      issues.push({
        severity: "xeberdarliq",
        step: index + 1,
        message: `${index + 1}. və ${index + 2}. addım bir işi ikiyə bölür: biri yalnız sxemi (http/https), digəri yalnız domeni dəyişir. İkisini bir qaydada birləşdirmək olar — məsələn http://sayt.com birbaşa https://www.sayt.com ünvanına.`,
      });
    }
  }

  const last = steps[steps.length - 1];
  if (last.kind === "xeta") {
    issues.push({
      severity: "xeta",
      step: steps.length,
      message: `Zəncir ${last.status} ilə bitir — «${last.label}». Yönləndirmə işləyən səhifəyə çatmır, yəni köhnə ünvana gələn hər ziyarətçi və hər bot bu xətanı görür.`,
    });
  }

  return issues;
}
