/**
 * Response-time breakdown: turning one round trip into the four numbers that
 * actually explain it — DNS lookup, TCP handshake, TLS handshake, time to
 * first byte — instead of the single figure `fetch` hands back.
 *
 * The route does the measuring (three real connections, via
 * `socket-probe.ts`'s `measurePhases`) and hands the three samples here. What
 * is worth checking is entirely in this file: taking the median of three
 * samples per phase rather than trusting one noisy connection, keeping the
 * total exactly equal to the sum of the medians (so the bar chart's segments
 * always add up to the number printed beside it), and naming which phase is
 * heavy enough to blame — a single ms figure never says whether the fix is a
 * DNS provider, a server on another continent, a certificate chain or a slow
 * backend, and those are four different afternoons of work.
 */

export type PhaseName = "dns" | "tcp" | "tls" | "ttfb";

export const PHASE_ORDER: PhaseName[] = ["dns", "tcp", "tls", "ttfb"];

export const PHASE_LABELS: Record<PhaseName, string> = {
  dns: "DNS həlli",
  tcp: "TCP əlsıxması",
  tls: "TLS əlsıxması",
  ttfb: "İlk baytadək (TTFB)",
};

/** One full connection's timing, phase by phase, in whole milliseconds. */
export type PhaseSample = {
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  ttfbMs: number;
  totalMs: number;
};

export type PhaseShare = {
  phase: PhaseName;
  label: string;
  ms: number;
  /** 0..1 of the median total. Zero when the total itself is zero. */
  share: number;
};

export type PhaseBreakdown = {
  samples: PhaseSample[];
  /** Per-phase median across the samples; `totalMs` is the sum of the other four. */
  median: PhaseSample;
  shares: PhaseShare[];
  heaviest: PhaseName;
  diagnosis: string;
};

export type BreakdownResult = { ok: true; breakdown: PhaseBreakdown } | { ok: false; error: string };

/** A single phase's share of the total past which it is called "heavy" rather than merely largest. */
const DOMINANT_SHARE = 0.4;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function fieldOf(sample: PhaseSample, phase: PhaseName): number {
  if (phase === "dns") return sample.dnsMs;
  if (phase === "tcp") return sample.tcpMs;
  if (phase === "tls") return sample.tlsMs;
  return sample.ttfbMs;
}

const DIAGNOSIS: Record<PhaseName, string> = {
  dns:
    "DNS həlli ən ağır mərhələdir — ad server yavaş cavab verir və ya qeydin TTL-i aşağıdır, hər sorğuda yenidən soruşulur. Sürətli, geniş coğrafi şəbəkəyə malik bir DNS provayderi bunu adətən aradan qaldırır.",
  tcp:
    "TCP əlsıxması ən ağır mərhələdir — server ziyarətçidən coğrafi olaraq uzaqdır və ya marşrut dolaşıqdır (gediş-gəliş vaxtı yüksəkdir). Fərqi CDN və ya ziyarətçiyə daha yaxın bir server verir.",
  tls:
    "TLS əlsıxması ən ağır mərhələdir — çox güman ki, aralıq sertifikat zənciri uzundur, ya da OCSP təsdiqi gecikir. Sertifikat zəncirini qısaltmaq və OCSP stapling açmaq bunu adətən sürətləndirir.",
  ttfb:
    "İlk baytadək vaxt (TTFB) ən ağır mərhələdir — bağlantı özü tez qurulub, gecikmə serverin cavabı hazırlamasındadır (backend hesablaması, baza sorğusu). Fərq şəbəkədə deyil, tətbiqin özündədir.",
};

const BALANCED_DIAGNOSIS =
  "Heç bir mərhələ digərlərindən qat-qat ağır deyil — gecikmə dörd mərhələ arasında az-çox bərabər paylanıb.";

/**
 * Reduces three measured samples to one median breakdown with a diagnosis.
 *
 * Each phase is medianed independently across the samples, and the median
 * total is defined as the sum of those four medians rather than the median of
 * the three totals — the two are not the same number in general, and only the
 * first keeps the bar chart's segments summing to the figure printed beside
 * it.
 */
export function buildBreakdown(samples: PhaseSample[]): BreakdownResult {
  if (samples.length === 0) return { ok: false, error: "Ölçmə nümunəsi yoxdur." };

  for (const sample of samples) {
    for (const phase of PHASE_ORDER) {
      const value = fieldOf(sample, phase);
      if (!Number.isFinite(value) || value < 0) {
        return { ok: false, error: "Etibarsız ölçmə dəyəri — mənfi və ya rəqəm olmayan vaxt gəldi." };
      }
    }
  }

  const medianOf = (phase: PhaseName) => median(samples.map((sample) => fieldOf(sample, phase)));

  const dnsMs = medianOf("dns");
  const tcpMs = medianOf("tcp");
  const tlsMs = medianOf("tls");
  const ttfbMs = medianOf("ttfb");
  const totalMs = dnsMs + tcpMs + tlsMs + ttfbMs;

  const medianSample: PhaseSample = { dnsMs, tcpMs, tlsMs, ttfbMs, totalMs };

  const shares: PhaseShare[] = PHASE_ORDER.map((phase) => {
    const ms = fieldOf(medianSample, phase);
    return { phase, label: PHASE_LABELS[phase], ms, share: totalMs > 0 ? ms / totalMs : 0 };
  });

  /* First in `PHASE_ORDER` wins a tie, so the pick is deterministic when two
     phases land on exactly the same share (including the all-zero case). */
  const heaviest = shares.reduce((best, current) => (current.share > best.share ? current : best), shares[0]).phase;
  const heaviestShare = shares.find((entry) => entry.phase === heaviest)?.share ?? 0;

  const diagnosis = heaviestShare >= DOMINANT_SHARE ? DIAGNOSIS[heaviest] : BALANCED_DIAGNOSIS;

  return {
    ok: true,
    breakdown: { samples, median: medianSample, shares, heaviest, diagnosis },
  };
}

export type CavabVaxtiReport = {
  hostname: string;
  url: string;
  address: string;
  addressFamily: 4 | 6;
  secure: boolean;
  breakdown: PhaseBreakdown;
  checkedAt: string;
};
