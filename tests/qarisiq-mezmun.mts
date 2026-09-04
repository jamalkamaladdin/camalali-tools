/*
 * `qarisiq-mezmun`'s scanner, checked against hand-built HTML fixtures — no
 * network, no real page. Each case is the one shape a wrong edit to the tag
 * scanner or the blocked/passive split would break silently.
 */
import type { CheckSuite } from "./harness.mts";
import { buildMixedContentReport, cspHasUpgradeInsecureRequests, findMixedContent } from "../lib/qarisiq-mezmun";

const PAGE = "https://camalali.com/bloq/mezmun";

export const checks: CheckSuite = (check) => {
  const img = findMixedContent('<img src="http://cdn.example.com/logo.png">', PAGE);
  check(
    "qarisiq-mezmun: http sekil passiv sayilir",
    img.length === 1 && img[0].kind === "img" && img[0].blocked === false,
    `img: ${JSON.stringify(img)}`,
  );

  const script = findMixedContent('<script src="http://cdn.example.com/app.js"></script>', PAGE);
  check(
    "qarisiq-mezmun: http skript bloklanir",
    script.length === 1 && script[0].kind === "script" && script[0].blocked === true,
    `script: ${JSON.stringify(script)}`,
  );

  const iframe = findMixedContent('<iframe src="http://widget.example.com/embed"></iframe>', PAGE);
  check(
    "qarisiq-mezmun: http iframe bloklanir",
    iframe.length === 1 && iframe[0].blocked === true,
    `iframe: ${JSON.stringify(iframe)}`,
  );

  const stylesheet = findMixedContent('<link rel="stylesheet" href="http://cdn.example.com/site.css">', PAGE);
  check(
    "qarisiq-mezmun: stylesheet linki bloklanir",
    stylesheet.length === 1 && stylesheet[0].blocked === true,
    `stylesheet: ${JSON.stringify(stylesheet)}`,
  );

  const icon = findMixedContent('<link rel="icon" href="http://cdn.example.com/favicon.ico">', PAGE);
  check(
    "qarisiq-mezmun: icon linki sekil kimi passiv sayilir",
    icon.length === 1 && icon[0].blocked === false,
    `icon: ${JSON.stringify(icon)}`,
  );

  const form = findMixedContent('<form action="http://api.example.com/submit"></form>', PAGE);
  check(
    "qarisiq-mezmun: form hedefi bloklanmir amma tapilir",
    form.length === 1 && form[0].kind === "form" && form[0].blocked === false,
    `form: ${JSON.stringify(form)}`,
  );

  const inlineStyle = findMixedContent(
    '<div style="background-image:url(\'http://cdn.example.com/bg.jpg\')">salam</div>',
    PAGE,
  );
  check(
    "qarisiq-mezmun: inline style icindeki http url tapilir",
    inlineStyle.length === 1 && inlineStyle[0].kind === "inline-style",
    `inlineStyle: ${JSON.stringify(inlineStyle)}`,
  );

  const httpsIgnored = findMixedContent('<img src="https://cdn.example.com/logo.png">', PAGE);
  check(
    "qarisiq-mezmun: artiq https olan resurs siyahiya girmir",
    httpsIgnored.length === 0,
    `httpsIgnored: ${JSON.stringify(httpsIgnored)}`,
  );

  const relativeIgnored = findMixedContent('<img src="/sekiller/logo.png">', PAGE);
  check(
    "qarisiq-mezmun: nisbi yol http sayilmir",
    relativeIgnored.length === 0,
    `relativeIgnored: ${JSON.stringify(relativeIgnored)}`,
  );

  const multiple = findMixedContent(
    '<img src="http://a.example.com/1.png"><script src="http://a.example.com/2.js"></script>',
    PAGE,
  );
  check(
    "qarisiq-mezmun: bir sehifede birden cox tapinti sirayla qaytarilir",
    multiple.length === 2 && multiple[0].index < multiple[1].index,
    `multiple: ${JSON.stringify(multiple)}`,
  );

  check(
    "qarisiq-mezmun: upgrade-insecure-requests direktivi taniniir",
    cspHasUpgradeInsecureRequests("default-src 'self'; upgrade-insecure-requests"),
    "csp direktivi tapilmadi",
  );

  check(
    "qarisiq-mezmun: direktiv yoxdursa yalan qaytarir",
    cspHasUpgradeInsecureRequests("default-src 'self'") === false,
    "csp yanlis netice verdi",
  );

  const httpPage = buildMixedContentReport('<img src="http://a.example.com/1.png">', "http://a.example.com/", null);
  check(
    "qarisiq-mezmun: sehifenin ozu https olmayanda hesabat tetbiq edilmir",
    httpPage.applicable === false && httpPage.findings.length === 0,
    `httpPage: ${JSON.stringify(httpPage)}`,
  );

  const fullReport = buildMixedContentReport(
    '<img src="http://a.example.com/1.png"><script src="http://a.example.com/2.js"></script>',
    PAGE,
    null,
  );
  check(
    "qarisiq-mezmun: hesabat bloklanan ve passiv sayini dogru cemleyir",
    fullReport.blockedCount === 1 && fullReport.passiveCount === 1,
    `fullReport: ${JSON.stringify(fullReport)}`,
  );
};
