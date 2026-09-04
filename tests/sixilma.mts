/*
 * What is worth checking: a matched encoding is told apart from a server that
 * ignored the request and fell back to identity, savings are computed
 * relative to the identity sample and stay null when a byte size is
 * unmeasurable, the smallest matched encoding wins `bestEncoding`, a resource
 * the server never compresses reports `anyCompressionOffered: false`, and
 * malformed input (a negative size, a duplicate encoding, an empty list)
 * comes back as an error rather than throwing.
 */
import type { CheckSuite } from "./harness.mts";
import { buildCompressionReport, type EncodingSample } from "../lib/sixilma";

function sample(encoding: EncodingSample["encoding"], chosen: string | null, byteSize: number | null): EncodingSample {
  return { encoding, chosen, byteSize };
}

const COMPRESSED_SET: EncodingSample[] = [
  sample("gzip", "gzip", 4000),
  sample("br", "br", 3200),
  sample("zstd", "zstd", 3500),
  sample("identity", null, 10_000),
];

export const checks: CheckSuite = (check) => {
  const compressed = buildCompressionReport(COMPRESSED_SET);
  check(
    "sixilma: a server that honours the requested encoding is marked matched",
    compressed.ok && compressed.report.verdicts.find((v) => v.encoding === "gzip")?.matched === true,
    `got: ${JSON.stringify(compressed)}`,
  );

  const ignored = buildCompressionReport([
    sample("gzip", "gzip", 4000),
    sample("br", null, 10_000),
    sample("zstd", "zstd", 3500),
    sample("identity", null, 10_000),
  ]);
  check(
    "sixilma: a br request the server answered with no Content-Encoding is not matched",
    ignored.ok && ignored.report.verdicts.find((v) => v.encoding === "br")?.matched === false,
    `got: ${JSON.stringify(ignored)}`,
  );

  const savings = buildCompressionReport(COMPRESSED_SET);
  const brVerdict = savings.ok ? savings.report.verdicts.find((v) => v.encoding === "br") : undefined;
  check(
    "sixilma: savings are computed relative to the identity sample",
    savings.ok && brVerdict?.savingsPercent === 68,
    `got: ${JSON.stringify(brVerdict)}`,
  );

  const unmeasurable = buildCompressionReport([
    sample("gzip", "gzip", null),
    sample("br", "br", 3200),
    sample("zstd", "zstd", 3500),
    sample("identity", null, 10_000),
  ]);
  const gzipVerdict = unmeasurable.ok ? unmeasurable.report.verdicts.find((v) => v.encoding === "gzip") : undefined;
  check(
    "sixilma: a missing Content-Length (chunked response) leaves savings null rather than a guessed number",
    unmeasurable.ok && gzipVerdict?.byteSize === null && gzipVerdict?.savingsPercent === null,
    `got: ${JSON.stringify(gzipVerdict)}`,
  );

  const best = buildCompressionReport(COMPRESSED_SET);
  check(
    "sixilma: the smallest matched compressed encoding is picked as bestEncoding",
    best.ok && best.report.bestEncoding === "br",
    `got: ${JSON.stringify(best)}`,
  );

  const noCompression = buildCompressionReport([
    sample("gzip", null, 10_000),
    sample("br", null, 10_000),
    sample("zstd", null, 10_000),
    sample("identity", null, 10_000),
  ]);
  check(
    "sixilma: a resource the server never compresses reports anyCompressionOffered as false and no bestEncoding",
    noCompression.ok && noCompression.report.anyCompressionOffered === false && noCompression.report.bestEncoding === null,
    `got: ${JSON.stringify(noCompression)}`,
  );

  const caseInsensitive = buildCompressionReport([
    sample("gzip", "GZIP", 4000),
    sample("br", "br", 3200),
    sample("zstd", "zstd", 3500),
    sample("identity", null, 10_000),
  ]);
  check(
    "sixilma: an uppercase Content-Encoding value from the server still matches, per RFC 9110 token comparison",
    caseInsensitive.ok && caseInsensitive.report.verdicts.find((v) => v.encoding === "gzip")?.matched === true,
    `got: ${JSON.stringify(caseInsensitive)}`,
  );

  const missingIdentity = buildCompressionReport([
    sample("gzip", "gzip", 4000),
    sample("br", "br", 3200),
    sample("zstd", "zstd", 3500),
  ]);
  check(
    "sixilma: a missing identity sample does not throw, just leaves identityByteSize and every savingsPercent null",
    missingIdentity.ok &&
      missingIdentity.report.identityByteSize === null &&
      missingIdentity.report.verdicts.every((v) => v.savingsPercent === null),
    `got: ${JSON.stringify(missingIdentity)}`,
  );

  const negative = buildCompressionReport([sample("identity", null, -1)]);
  check(
    "sixilma: a negative byte size is refused as malformed input, not thrown on",
    negative.ok === false,
    `got: ${JSON.stringify(negative)}`,
  );

  const empty = buildCompressionReport([]);
  check(
    "sixilma: an empty sample list is an error",
    empty.ok === false && typeof empty.error === "string" && empty.error.length > 0,
    `got: ${JSON.stringify(empty)}`,
  );

  const duplicate = buildCompressionReport([
    sample("gzip", "gzip", 4000),
    sample("gzip", "gzip", 4000),
    sample("identity", null, 10_000),
  ]);
  check(
    "sixilma: two samples for the same encoding is refused as malformed input",
    duplicate.ok === false,
    `got: ${JSON.stringify(duplicate)}`,
  );
};
