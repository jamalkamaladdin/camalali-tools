/*
 * What is worth checking here: a known-answer record parses its explicit
 * tags exactly and the RFC 7489 defaults fill in every tag the record left
 * out; the ordered-findings list actually orders (`p=none` first, and only
 * when it applies); the invalidating shapes (duplicate tag, missing/misplaced/
 * wrong `v`, an out-of-range `pct`, an unknown `p`) come back as an error
 * rather than throwing, while an unknown tag is merely ignored; the size
 * suffix on a `rua` URI parses instead of breaking the address; the
 * cross-domain authorisation trap fires only when it should; and the builder
 * round-trips — a serialised record parses back to the fields it was given.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildDmarcFindings,
  parseDmarcRecord,
  serializeDmarcRecord,
  type DmarcBuildFields,
} from "../lib/dmarc-oxucu";

export const checks: CheckSuite = (check) => {
  const known = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:a@b.com; pct=50");
  check(
    "dmarc-oxucu: a known record parses v/p/rua/pct to exactly the declared values",
    known.ok &&
      known.record.v === "DMARC1" &&
      known.record.p === "reject" &&
      known.record.pct === 50 &&
      known.record.pctExplicit === true &&
      known.record.rua.length === 1 &&
      known.record.rua[0].address === "a@b.com",
    `got: ${JSON.stringify(known)}`,
  );

  check(
    "dmarc-oxucu: tags the record left out resolve to their RFC 7489 defaults",
    known.ok &&
      known.record.sp === "reject" &&
      known.record.spExplicit === false &&
      known.record.adkim === "r" &&
      known.record.adkimExplicit === false &&
      known.record.aspf === "r" &&
      known.record.aspfExplicit === false &&
      known.record.fo === "0" &&
      known.record.foExplicit === false &&
      known.record.ri === 86400 &&
      known.record.riExplicit === false,
    `got: ${JSON.stringify(known)}`,
  );

  const withNone = parseDmarcRecord("v=DMARC1; p=none");
  check(
    "dmarc-oxucu: p=none produces the no-protection finding, first in the list",
    withNone.ok && buildDmarcFindings(withNone.record)[0]?.id === "no-protection",
    `got: ${JSON.stringify(withNone.ok ? buildDmarcFindings(withNone.record) : withNone)}`,
  );

  const withReject = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:a@b.com");
  check(
    "dmarc-oxucu: p=reject does not produce the no-protection finding",
    withReject.ok && !buildDmarcFindings(withReject.record).some((f) => f.id === "no-protection"),
    `got: ${JSON.stringify(withReject.ok ? buildDmarcFindings(withReject.record) : withReject)}`,
  );

  const pctZeroReject = parseDmarcRecord("v=DMARC1; p=reject; pct=0; rua=mailto:a@b.com");
  check(
    "dmarc-oxucu: pct=0 with p=reject produces its own finding",
    pctZeroReject.ok && buildDmarcFindings(pctZeroReject.record).some((f) => f.id === "pct-zero-reject"),
    `got: ${JSON.stringify(pctZeroReject)}`,
  );

  const noRua = parseDmarcRecord("v=DMARC1; p=quarantine");
  check(
    "dmarc-oxucu: a missing rua produces the no-reporting finding",
    noRua.ok && buildDmarcFindings(noRua.record).some((f) => f.id === "no-reporting"),
    `got: ${JSON.stringify(noRua)}`,
  );

  const duplicateTag = parseDmarcRecord("v=DMARC1; p=reject; p=quarantine");
  check(
    "dmarc-oxucu: a duplicate tag makes the record invalid",
    duplicateTag.ok === false,
    `got: ${JSON.stringify(duplicateTag)}`,
  );

  const missingV = parseDmarcRecord("p=reject; rua=mailto:a@b.com");
  check(
    "dmarc-oxucu: a record with no v tag is invalid",
    missingV.ok === false,
    `got: ${JSON.stringify(missingV)}`,
  );

  const vNotFirst = parseDmarcRecord("p=reject; v=DMARC1");
  check(
    "dmarc-oxucu: v present but not first is invalid",
    vNotFirst.ok === false,
    `got: ${JSON.stringify(vNotFirst)}`,
  );

  const wrongV = parseDmarcRecord("v=DMARC2; p=reject");
  check(
    "dmarc-oxucu: a wrong v value is invalid",
    wrongV.ok === false,
    `got: ${JSON.stringify(wrongV)}`,
  );

  const unknownTag = parseDmarcRecord("v=DMARC1; p=reject; zzz=whatever");
  check(
    "dmarc-oxucu: an unknown tag is reported as ignored and does not invalidate the record",
    unknownTag.ok === true &&
      unknownTag.record.unknownTags.length === 1 &&
      unknownTag.record.unknownTags[0].name === "zzz" &&
      buildDmarcFindings(unknownTag.record).some((f) => f.id === "unknown-tag"),
    `got: ${JSON.stringify(unknownTag)}`,
  );

  const crossDomain = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:x@other.com");
  const sameDomain = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:x@mine.com");
  check(
    "dmarc-oxucu: a rua address on another domain triggers the cross-domain finding, the same domain does not",
    crossDomain.ok &&
      sameDomain.ok &&
      buildDmarcFindings(crossDomain.record, "mine.com").some((f) => f.id === "cross-domain-rua") &&
      !buildDmarcFindings(sameDomain.record, "mine.com").some((f) => f.id === "cross-domain-rua"),
    `cross: ${JSON.stringify(crossDomain)}, same: ${JSON.stringify(sameDomain)}`,
  );

  const sizedUri = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:a@b.com!10m");
  check(
    "dmarc-oxucu: a !10m size suffix parses and the address is extracted without it",
    sizedUri.ok &&
      sizedUri.record.rua.length === 1 &&
      sizedUri.record.rua[0].address === "a@b.com" &&
      sizedUri.record.rua[0].limitBytes === 10 * 1024 * 1024,
    `got: ${JSON.stringify(sizedUri)}`,
  );

  const twoAddresses = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:a@b.com,mailto:c@d.com");
  check(
    "dmarc-oxucu: two comma-separated rua addresses both parse",
    twoAddresses.ok &&
      twoAddresses.record.rua.length === 2 &&
      twoAddresses.record.rua[0].address === "a@b.com" &&
      twoAddresses.record.rua[1].address === "c@d.com",
    `got: ${JSON.stringify(twoAddresses)}`,
  );

  const roundTripFields: DmarcBuildFields = {
    domain: "mine.com",
    p: "quarantine",
    sp: "reject",
    pct: 50,
    ruaAddresses: ["dmarc@mine.com"],
    rufAddresses: ["forensics@mine.com"],
    adkim: "s",
    aspf: "r",
    fo: "1",
    ri: 3600,
  };
  const serialized = serializeDmarcRecord(roundTripFields);
  const reparsed = parseDmarcRecord(serialized);
  check(
    "dmarc-oxucu: build round-trip - fields to string to parse gives back the same fields",
    reparsed.ok &&
      reparsed.record.p === roundTripFields.p &&
      reparsed.record.sp === roundTripFields.sp &&
      reparsed.record.pct === roundTripFields.pct &&
      reparsed.record.rua.map((uri) => uri.address).join(",") === roundTripFields.ruaAddresses.join(",") &&
      reparsed.record.ruf.map((uri) => uri.address).join(",") === roundTripFields.rufAddresses.join(",") &&
      reparsed.record.adkim === roundTripFields.adkim &&
      reparsed.record.aspf === roundTripFields.aspf &&
      reparsed.record.fo === roundTripFields.fo &&
      reparsed.record.ri === roundTripFields.ri,
    `serialized: ${serialized}, reparsed: ${JSON.stringify(reparsed)}`,
  );

  const badPct = parseDmarcRecord("v=DMARC1; p=reject; pct=101");
  const badP = parseDmarcRecord("v=DMARC1; p=banana");
  check(
    "dmarc-oxucu: pct=101 and p=banana each return an error rather than throwing",
    badPct.ok === false &&
      typeof badPct.error === "string" &&
      badPct.error.length > 0 &&
      badP.ok === false &&
      typeof badP.error === "string" &&
      badP.error.length > 0,
    `pct: ${JSON.stringify(badPct)}, p: ${JSON.stringify(badP)}`,
  );
};
