/**
 * Reading what a server actually chose to do with `Accept-Encoding`, one
 * value at a time.
 *
 * The route sends the same request four times, once per candidate encoding,
 * and reads back only two things: `Content-Encoding` (what the server
 * picked, which may not be what was asked for) and `Content-Length` (the
 * byte count of the body as it actually went over the wire). Only
 * `Content-Length` is trusted for size — a body read through Node's own
 * `fetch` would already be transparently decompressed by the time this
 * process saw it, so measuring the decoded bytes and calling that the
 * "compressed size" would be exactly the kind of invented number this site
 * refuses to show. When the server does not declare `Content-Length` (a
 * dynamically compressed, chunked response — common in practice), the size
 * is reported as unknown rather than guessed.
 */

export type Encoding = "gzip" | "br" | "zstd" | "identity";

export const ENCODING_ORDER: Encoding[] = ["gzip", "br", "zstd", "identity"];

export const ENCODING_LABELS: Record<Encoding, string> = {
  gzip: "gzip",
  br: "Brotli",
  zstd: "Zstandard",
  identity: "sıxılmasız",
};

/** What is sent as `Accept-Encoding` for each probe — a single, unambiguous value, never a list a server could pick between. */
export const ACCEPT_ENCODING_FOR: Record<Encoding, string> = {
  gzip: "gzip",
  br: "br",
  zstd: "zstd",
  identity: "identity",
};

/** One request's raw result: what was asked for, what the server declared, and the byte count when the server declared one. */
export type EncodingSample = {
  encoding: Encoding;
  /** The server's `Content-Encoding` value, lower-cased, or null when it sent none (an uncompressed body). */
  chosen: string | null;
  /** From `Content-Length`. Null means the size cannot be measured — the response was chunked. */
  byteSize: number | null;
};

export type EncodingVerdict = {
  encoding: Encoding;
  label: string;
  requestedAcceptEncoding: string;
  serverUsed: string | null;
  /** True when the server's declared encoding matches the one requested (the `identity` request matching "no Content-Encoding at all"). */
  matched: boolean;
  byteSize: number | null;
  /** Percent smaller than the `identity` sample. Null unless both byte sizes are known. */
  savingsPercent: number | null;
};

export type CompressionReport = {
  verdicts: EncodingVerdict[];
  identityByteSize: number | null;
  /** The smallest measured, actually-used compressed encoding — null if none was both used and measurable. */
  bestEncoding: Encoding | null;
  /** True when the server used at least one of the three compressed encodings it was offered. */
  anyCompressionOffered: boolean;
};

export type CompressionResult = { ok: true; report: CompressionReport } | { ok: false; error: string };

/* `Content-Encoding` tokens are compared case-insensitively, the way RFC 9110
   treats every HTTP token — a server answering `Content-Encoding: GZIP` has
   still chosen gzip, and treating that as "ignored the request" would be
   wrong about the server, not about the header. */
function matchesEncoding(encoding: Encoding, chosen: string | null): boolean {
  const normalized = chosen === null ? null : chosen.trim().toLowerCase();
  if (encoding === "identity") return normalized === null || normalized === "identity";
  return normalized === encoding;
}

/**
 * Reduces the four raw samples to a verdict per encoding plus the report's
 * two headline facts: which encoding actually won, and whether compression
 * was offered at all.
 */
export function buildCompressionReport(samples: EncodingSample[]): CompressionResult {
  if (samples.length === 0) return { ok: false, error: "Nümunə yoxdur." };

  const seen = new Set<Encoding>();
  for (const sample of samples) {
    if (seen.has(sample.encoding)) {
      return { ok: false, error: `«${sample.encoding}» üçün iki nümunə göndərilib.` };
    }
    seen.add(sample.encoding);
    if (sample.byteSize !== null && (!Number.isFinite(sample.byteSize) || sample.byteSize < 0)) {
      return { ok: false, error: "Etibarsız bayt ölçüsü: mənfi və ya rəqəm olmayan dəyər gəldi." };
    }
  }

  const identitySample = samples.find((sample) => sample.encoding === "identity") ?? null;
  const identityByteSize = identitySample?.byteSize ?? null;

  const verdicts: EncodingVerdict[] = samples.map((sample) => {
    const matched = matchesEncoding(sample.encoding, sample.chosen);
    const savingsPercent =
      identityByteSize !== null && identityByteSize > 0 && sample.byteSize !== null
        ? Math.round(((identityByteSize - sample.byteSize) / identityByteSize) * 100)
        : null;

    return {
      encoding: sample.encoding,
      label: ENCODING_LABELS[sample.encoding],
      requestedAcceptEncoding: ACCEPT_ENCODING_FOR[sample.encoding],
      serverUsed: sample.chosen,
      matched,
      byteSize: sample.byteSize,
      savingsPercent,
    };
  });

  const compressedMatched = verdicts.filter(
    (v): v is EncodingVerdict & { byteSize: number } =>
      v.encoding !== "identity" && v.matched && v.byteSize !== null,
  );
  const bestEncoding =
    compressedMatched.length === 0
      ? null
      : compressedMatched.reduce((best, current) => (current.byteSize < best.byteSize ? current : best)).encoding;

  const anyCompressionOffered = verdicts.some((v) => v.encoding !== "identity" && v.matched);

  return {
    ok: true,
    report: { verdicts, identityByteSize, bestEncoding, anyCompressionOffered },
  };
}

export type CompressionLiveReport = {
  url: string;
  checkedAt: string;
  result: CompressionResult;
};
