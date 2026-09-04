/*
 * `cors-yoxlama`'s verdicts, checked with no network: every case here is a
 * known set of response headers and the judgement a browser would actually
 * reach over them.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildCorsReport,
  evaluateCredentialsRisk,
  evaluateHeadersAllowed,
  evaluateMethodAllowed,
  evaluateOriginAllowed,
  normalizeOriginInput,
  parseRequestHeadersInput,
} from "../lib/cors-yoxlama";

export const checks: CheckSuite = (check) => {
  /* ---------- origin ---------- */

  const wildcard = evaluateOriginAllowed("*", "https://camalali.com");
  check("cors-yoxlama: * mensedeki her origin-e icaze verir", wildcard.allowed, `wildcard: ${JSON.stringify(wildcard)}`);

  const exact = evaluateOriginAllowed("https://camalali.com", "https://camalali.com");
  check("cors-yoxlama: deqiq uygun origin icazelidir", exact.allowed, `exact: ${JSON.stringify(exact)}`);

  const mismatch = evaluateOriginAllowed("https://baska.com", "https://camalali.com");
  check(
    "cors-yoxlama: uygunsuz origin icazesizdir ve hər ikisini adlandirir",
    !mismatch.allowed && mismatch.reason.includes("baska.com") && mismatch.reason.includes("camalali.com"),
    `mismatch: ${JSON.stringify(mismatch)}`,
  );

  const missingOrigin = evaluateOriginAllowed(null, "https://camalali.com");
  check("cors-yoxlama: basliq yoxdursa icazesizdir", !missingOrigin.allowed, `missing: ${JSON.stringify(missingOrigin)}`);

  /* ---------- method ---------- */

  const methodOk = evaluateMethodAllowed("GET, POST, put", "PUT");
  check(
    "cors-yoxlama: metod siyahida boyuk-kicik herfden asili olmadan tapilir",
    methodOk.allowed,
    `method: ${JSON.stringify(methodOk)}`,
  );

  const methodMissing = evaluateMethodAllowed("GET, POST", "DELETE");
  check(
    "cors-yoxlama: siyahida olmayan metod icazesizdir ve siyahini gosterir",
    !methodMissing.allowed && methodMissing.allowedMethods.length === 2,
    `method: ${JSON.stringify(methodMissing)}`,
  );

  /* ---------- headers ---------- */

  const headersOk = evaluateHeadersAllowed("Content-Type, Authorization", ["content-type", "Authorization"]);
  check(
    "cors-yoxlama: her basliq boyuk-kicik herfden asili olmadan tapilanda hamisi icazelidir",
    headersOk.allowed && headersOk.missing.length === 0,
    `headers: ${JSON.stringify(headersOk)}`,
  );

  const headersMissing = evaluateHeadersAllowed("Content-Type", ["Content-Type", "Authorization"]);
  check(
    "cors-yoxlama: catmayan basliq missing siyahisinda dogru gorunur",
    !headersMissing.allowed && headersMissing.missing.length === 1 && headersMissing.missing[0] === "Authorization",
    `headers: ${JSON.stringify(headersMissing)}`,
  );

  /* ---------- the forbidden combination ---------- */

  const dangerous = evaluateCredentialsRisk("*", "true");
  const safe = evaluateCredentialsRisk("https://camalali.com", "true");
  check(
    "cors-yoxlama: wildcard+credentials tehlukeli sayilir, konkret origin+credentials yox",
    dangerous !== null && dangerous.severity === "xeta" && safe === null,
    `dangerous: ${JSON.stringify(dangerous)}, safe: ${JSON.stringify(safe)}`,
  );

  /* ---------- input parsing ---------- */

  const bareOrigin = normalizeOriginInput("camalali.com");
  check(
    "cors-yoxlama: sxemsiz mense https qebul edilir",
    bareOrigin.ok && bareOrigin.origin === "https://camalali.com",
    `origin: ${JSON.stringify(bareOrigin)}`,
  );

  const badOrigin = normalizeOriginInput("bu bir ünvan deyil ###");
  check("cors-yoxlama: pozuq mense xeta qaytarir, atmir", badOrigin.ok === false, `origin: ${JSON.stringify(badOrigin)}`);

  const badHeaderToken = parseRequestHeadersInput("Content Type İ");
  check(
    "cors-yoxlama: bosluqlu basliq adi xeta qaytarir",
    badHeaderToken.ok === false,
    `headers: ${JSON.stringify(badHeaderToken)}`,
  );

  /* ---------- the combined report ---------- */

  const goodReport = buildCorsReport(
    { origin: "https://camalali.com", method: "POST", requestHeaders: ["content-type"] },
    { status: 200, headers: [["access-control-allow-origin", "*"]] },
    {
      status: 204,
      headers: [
        ["access-control-allow-origin", "https://camalali.com"],
        ["access-control-allow-methods", "POST, GET"],
        ["access-control-allow-headers", "content-type"],
      ],
    },
  );
  check(
    "cors-yoxlama: hamisi uygun olanda umumi neticə icazelidir",
    goodReport.overallAllowed,
    `report: ${JSON.stringify(goodReport)}`,
  );

  const badReport = buildCorsReport(
    { origin: "https://camalali.com", method: "DELETE", requestHeaders: [] },
    { status: 200, headers: [] },
    { status: 204, headers: [["access-control-allow-origin", "https://camalali.com"]] },
  );
  check(
    "cors-yoxlama: metod siyahisi yoxdursa umumi netice icazesizdir",
    !badReport.overallAllowed,
    `report: ${JSON.stringify(badReport)}`,
  );
};
