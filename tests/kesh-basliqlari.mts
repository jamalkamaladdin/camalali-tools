/*
 * What is worth checking: a basic max-age parses, several directives in one
 * header all parse together, a malformed numeric token is ignored rather
 * than thrown on, `no-store` and `no-cache` are each named as a conflict when
 * paired with a positive max-age, `s-maxage` outranks `max-age` for
 * freshness, freshness falls back to `Expires` and is clamped at zero once
 * that date has passed, a weak ETag is told apart from a strong one, and
 * `private` beats `public` per RFC 9111.
 */
import type { CheckSuite } from "./harness.mts";
import { buildCacheReport, parseCacheControl } from "../lib/kesh-basliqlari";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function input(overrides: Partial<Parameters<typeof buildCacheReport>[0]> = {}) {
  return {
    cacheControl: null,
    etag: null,
    lastModified: null,
    expires: null,
    vary: null,
    age: null,
    pragma: null,
    ...overrides,
  };
}

export const checks: CheckSuite = (check) => {
  const basic = parseCacheControl("max-age=3600");
  check("kesh-basliqlari: a bare max-age parses to seconds", basic.maxAge === 3600, `got: ${JSON.stringify(basic)}`);

  const combo = parseCacheControl("no-cache, must-revalidate");
  check(
    "kesh-basliqlari: several directives in one header all parse together, and an absent max-age stays null",
    combo.noCache && combo.mustRevalidate && combo.maxAge === null,
    `got: ${JSON.stringify(combo)}`,
  );

  const malformedNumber = parseCacheControl("max-age=abc, public");
  check(
    "kesh-basliqlari: a malformed numeric directive is ignored, not thrown on, and its neighbour still parses",
    malformedNumber.maxAge === null && malformedNumber.public === true,
    `got: ${JSON.stringify(malformedNumber)}`,
  );

  const noStoreConflict = buildCacheReport(input({ cacheControl: "no-store, max-age=3600" }), NOW);
  check(
    "kesh-basliqlari: no-store with a positive max-age is flagged as a conflict, and the response is not storable",
    noStoreConflict.storable === false && noStoreConflict.conflicts.some((c) => c.message.includes("no-store")),
    `got: ${JSON.stringify(noStoreConflict)}`,
  );

  const varyStar = buildCacheReport(input({ cacheControl: "public, max-age=60", vary: "*" }), NOW);
  check(
    "kesh-basliqlari: Vary: * is flagged and makes the response uncacheable by a shared cache",
    varyStar.varyIsWildcard === true && varyStar.cacheableByCdn === false,
    `got: ${JSON.stringify(varyStar)}`,
  );

  const sMaxAgeWins = buildCacheReport(input({ cacheControl: "max-age=60, s-maxage=600" }), NOW);
  check(
    "kesh-basliqlari: s-maxage outranks max-age for the effective freshness window",
    sMaxAgeWins.freshForSeconds === 600,
    `got: ${JSON.stringify(sMaxAgeWins)}`,
  );

  const expiresFallback = buildCacheReport(
    input({ expires: new Date(NOW.getTime() + 3_600_000).toUTCString() }),
    NOW,
  );
  check(
    "kesh-basliqlari: with no Cache-Control at all, freshness falls back to a future Expires header",
    expiresFallback.freshForSeconds === 3600,
    `got: ${JSON.stringify(expiresFallback)}`,
  );

  const expiresPast = buildCacheReport(input({ expires: new Date(NOW.getTime() - 3_600_000).toUTCString() }), NOW);
  check(
    "kesh-basliqlari: a past Expires date clamps freshness at zero rather than going negative",
    expiresPast.freshForSeconds === 0,
    `got: ${JSON.stringify(expiresPast)}`,
  );

  const conditionalReady = buildCacheReport(input({ lastModified: "Mon, 01 Jun 2026 00:00:00 GMT" }), NOW);
  const conditionalMissing = buildCacheReport(input(), NOW);
  check(
    "kesh-basliqlari: Last-Modified alone is enough for a conditional request; neither validator present is not",
    conditionalReady.conditionalRequestReady === true && conditionalMissing.conditionalRequestReady === false,
    `ready: ${JSON.stringify(conditionalReady)}, missing: ${JSON.stringify(conditionalMissing)}`,
  );

  const weakEtag = buildCacheReport(input({ etag: 'W/"abc123"' }), NOW);
  const strongEtag = buildCacheReport(input({ etag: '"abc123"' }), NOW);
  check(
    "kesh-basliqlari: a W/-prefixed ETag is detected as weak, a plain one is not",
    weakEtag.etag.weak === true && strongEtag.etag.weak === false,
    `weak: ${JSON.stringify(weakEtag.etag)}, strong: ${JSON.stringify(strongEtag.etag)}`,
  );

  const mustRevalidateNoValidator = buildCacheReport(input({ cacheControl: "must-revalidate" }), NOW);
  check(
    "kesh-basliqlari: must-revalidate without any validator is flagged as a conflict",
    mustRevalidateNoValidator.conflicts.some((c) => c.message.includes("must-revalidate")),
    `got: ${JSON.stringify(mustRevalidateNoValidator)}`,
  );

  const privateWinsOverPublic = buildCacheReport(input({ cacheControl: "public, private, max-age=60" }), NOW);
  check(
    "kesh-basliqlari: private alongside public is flagged, and private wins so the CDN may not cache it",
    privateWinsOverPublic.cacheableByCdn === false &&
      privateWinsOverPublic.conflicts.some((c) => c.message.includes("private")),
    `got: ${JSON.stringify(privateWinsOverPublic)}`,
  );
};
