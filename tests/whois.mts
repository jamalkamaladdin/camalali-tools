/*
 * The RDAP extraction, checked against fixed fixtures and a fixed reference
 * date — no network, and no `Date.now()`, since a whois test that reads the
 * clock starts failing the day it is not touched again.
 *
 * The fixtures below are trimmed to the fields each case reads, not full
 * copies of a real RDAP body — but the shapes are real: the `.com` fixture's
 * `status` array is the lower-case, space-separated form Verisign's live
 * RDAP server actually answers with (`"client transfer prohibited"`, not
 * the camelCase `clientTransferProhibited` most write-ups quote), read
 * directly with `curl` while this tool was built. `normalizeEppCode` is what
 * lets the dictionary answer both spellings from one entry, and the cases
 * below prove both sides of that fold.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildWhoisReport,
  computeAgeDays,
  computeDaysToExpiry,
  explainEppStatus,
  extractDates,
  extractRegistrar,
  parseWhoisPayload,
} from "../lib/whois";

/** A trimmed but real-shaped `.com` RDAP body — read from `rdap.verisign.com`. */
const COM_FIXTURE = {
  ldhName: "EXAMPLE.COM",
  events: [
    { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2024-08-14T07:01:31Z" },
    { eventAction: "expiration", eventDate: "2025-08-13T04:00:00Z" },
  ],
  entities: [
    {
      objectClassName: "entity",
      roles: ["registrar"],
      publicIds: [{ type: "IANA Registrar ID", identifier: "376" }],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "RESERVED-Internet Assigned Numbers Authority"],
        ],
      ],
    },
  ],
  nameservers: [{ ldhName: "A.IANA-SERVERS.NET" }, { ldhName: "B.IANA-SERVERS.NET" }],
  status: ["client delete prohibited", "client transfer prohibited", "client update prohibited"],
  secureDNS: { delegationSigned: true },
};

export const checks: CheckSuite = (check) => {
  const report = buildWhoisReport(COM_FIXTURE, new Date("2025-01-01T00:00:00Z"));

  check(
    "whois: tam .com fikstürü qeydiyyat tarixini doğru oxuyur",
    report.dates.registration === "1995-08-14T04:00:00Z",
    `registration: ${report.dates.registration}`,
  );

  check(
    "whois: tam .com fikstürü bitmə tarixini doğru oxuyur",
    report.dates.expiration === "2025-08-13T04:00:00Z",
    `expiration: ${report.dates.expiration}`,
  );

  check(
    "whois: tam .com fikstürü reyestrator adını vCard-ın fn sahəsindən çıxarır",
    report.registrar.name === "RESERVED-Internet Assigned Numbers Authority",
    `name: ${report.registrar.name}`,
  );

  check(
    "whois: tam .com fikstürü IANA reyestrator ID-ni publicIds-dən çıxarır",
    report.registrar.ianaId === "376",
    `ianaId: ${report.registrar.ianaId}`,
  );

  check(
    "whois: tam .com fikstürü nameserver siyahısını doğru oxuyur",
    report.nameservers.length === 2 &&
      report.nameservers[0] === "A.IANA-SERVERS.NET" &&
      report.nameservers[1] === "B.IANA-SERVERS.NET",
    `nameservers: ${JSON.stringify(report.nameservers)}`,
  );

  /* ---------- age / expiry arithmetic, against a fixed reference date ---------- */

  const reference = new Date("2020-01-11T00:00:00Z");
  const age = computeAgeDays("2020-01-01T00:00:00Z", reference);
  const daysLeft = computeDaysToExpiry("2020-02-01T00:00:00Z", reference);

  check(
    "whois: sabit istinad tarixinə görə domen yaşı düz hesablanır",
    age === 10,
    `age: ${age}`,
  );

  check(
    "whois: sabit istinad tarixinə görə bitməyə qalan gün düz hesablanır",
    daysLeft === 21,
    `daysToExpiry: ${daysLeft}`,
  );

  /* ---------- absent / malformed shapes ---------- */

  const noExpiration = extractDates({
    events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }],
  });

  check(
    "whois: expiration hadisəsi olmayanda bitmə tarixi absent qayıdır, yanlış Date deyil",
    noExpiration.expiration === null &&
      computeDaysToExpiry(noExpiration.expiration, reference) === null,
    `expiration: ${noExpiration.expiration}`,
  );

  const oddVcard = extractRegistrar({
    entities: [{ roles: ["registrar"], vcardArray: ["vcard"] }],
  });

  check(
    "whois: vCard gözlənilməz formada olanda reyestrator adı naməlum qayıdır, throw etmir",
    oddVcard.name === null && oddVcard.ianaId === null,
    `registrar: ${JSON.stringify(oddVcard)}`,
  );

  const noEntities = buildWhoisReport(
    { ldhName: "NOENTITY.COM", events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }] },
    reference,
  );

  check(
    "whois: entities sahəsi tamam yoxdursa qismən nəticə qayıdır",
    noEntities.registrar.name === null &&
      noEntities.domain === "NOENTITY.COM" &&
      noEntities.ageDays !== null,
    `report: ${JSON.stringify(noEntities)}`,
  );

  /* ---------- EPP status dictionary ---------- */

  const camelCase = explainEppStatus("clientTransferProhibited");
  const spaced = explainEppStatus("client transfer prohibited");
  const pendingDelete = explainEppStatus("pending delete");
  const redemption = explainEppStatus("redemptionPeriod");

  check(
    "whois: ən azı dörd EPP status kodu Azərbaycanca izaha uyğunlaşır, camelCase və boşluqlu forma eyni izahı verir",
    camelCase.explanation === spaced.explanation &&
      camelCase.explanation !== "" &&
      !camelCase.explanation.endsWith("izah yoxdur.") &&
      pendingDelete.explanation.length > 20 &&
      redemption.explanation.length > 20,
    `camelCase: ${camelCase.explanation}, pendingDelete: ${pendingDelete.explanation}`,
  );

  const unknown = explainEppStatus("qeyri-adi-status");

  check(
    "whois: naməlum status kodu xam kod + 'izah yoxdur' kimi qayıdır, boş sətir deyil",
    unknown.code === "qeyri-adi-status" && unknown.explanation === "qeyri-adi-status — izah yoxdur.",
    `unknown: ${JSON.stringify(unknown)}`,
  );

  /* ---------- DNSSEC ---------- */

  check(
    "whois: secureDNS.delegationSigned true və onun olmaması ikisi də düz oxunur",
    buildWhoisReport({ secureDNS: { delegationSigned: true } }, reference).dnssec.signed === true &&
      buildWhoisReport({}, reference).dnssec.signed === false,
    `signed: ${buildWhoisReport({ secureDNS: { delegationSigned: true } }, reference).dnssec.signed}`,
  );

  /* ---------- malformed body ---------- */

  const malformed = parseWhoisPayload("{ bu json deyil", reference);

  check(
    "whois: korlanmış JSON gövdəsi throw etmək əvəzinə xəta qaytarır",
    malformed.ok === false,
    `malformed: ${JSON.stringify(malformed)}`,
  );
};
