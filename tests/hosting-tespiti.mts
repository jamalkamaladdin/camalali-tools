/*
 * `hosting-tespiti`'s detectors, checked against hand-built fixtures — no
 * network, since every signal a real page would carry (headers, generator
 * meta, CNAME chain, RDAP organisation) is a plain string or array here.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildHostingReport,
  detectFromCname,
  detectFromGenerator,
  detectFromHeaders,
  detectFromRdapOrg,
  detectFromScriptPaths,
  extractGeneratorMeta,
  toHeaderMap,
} from "../lib/hosting-tespiti";

export const checks: CheckSuite = (check) => {
  const cloudflare = detectFromHeaders(toHeaderMap([["cf-ray", "8a1b2c3d4e5f6789-FRA"]]));
  check(
    "hosting-tespiti: cf-ray basligindan cloudflare cixarilir",
    cloudflare.some((detection) => detection.name === "Cloudflare" && detection.evidence === "8a1b2c3d4e5f6789-FRA"),
    `cloudflare: ${JSON.stringify(cloudflare)}`,
  );

  const nginx = detectFromHeaders(toHeaderMap([["server", "nginx/1.25.3"]]));
  check(
    "hosting-tespiti: server basligindan mehsul adi (versiyasiz) cixarilir",
    nginx.some((detection) => detection.name === "nginx" && detection.category === "server-proqrami"),
    `nginx: ${JSON.stringify(nginx)}`,
  );

  const poweredBy = detectFromHeaders(toHeaderMap([["x-powered-by", "Express"]]));
  check(
    "hosting-tespiti: x-powered-by cercive kimi bildirilir",
    poweredBy.some((detection) => detection.name === "Express" && detection.category === "cercive"),
    `poweredBy: ${JSON.stringify(poweredBy)}`,
  );

  const noSignal = detectFromHeaders(toHeaderMap([["content-type", "text/html"]]));
  check(
    "hosting-tespiti: elamet yoxdursa bos siyahi qaytarir, uydurmur",
    noSignal.length === 0,
    `noSignal: ${JSON.stringify(noSignal)}`,
  );

  const generatorMeta = extractGeneratorMeta('<meta name="generator" content="WordPress 6.5">');
  check(
    "hosting-tespiti: generator meta teqinin content-i oxunur",
    generatorMeta === "WordPress 6.5",
    `generatorMeta: ${JSON.stringify(generatorMeta)}`,
  );

  const noGenerator = extractGeneratorMeta("<meta charset=\"utf-8\">");
  check(
    "hosting-tespiti: generator teqi yoxdursa null qaytarir",
    noGenerator === null,
    `noGenerator: ${JSON.stringify(noGenerator)}`,
  );

  const wpGenerator = detectFromGenerator("WordPress 6.5");
  check(
    "hosting-tespiti: taninan generator adi wordpress kimi oxunur",
    wpGenerator.length === 1 && wpGenerator[0].name === "WordPress",
    `wpGenerator: ${JSON.stringify(wpGenerator)}`,
  );

  const unknownGenerator = detectFromGenerator("MyCustomCms 3.0");
  check(
    "hosting-tespiti: taninmayan generator metni oldugu kimi bildirilir, uydurulmur",
    unknownGenerator.length === 1 && unknownGenerator[0].name === "MyCustomCms 3.0",
    `unknownGenerator: ${JSON.stringify(unknownGenerator)}`,
  );

  const wpPath = detectFromScriptPaths(["https://sayt.com/wp-content/themes/x/style.css"]);
  check(
    "hosting-tespiti: wp-content yolundan wordpress cixarilir",
    wpPath.some((detection) => detection.name === "WordPress"),
    `wpPath: ${JSON.stringify(wpPath)}`,
  );

  const cdnCgiPath = detectFromScriptPaths(["/cdn-cgi/scripts/rocket-loader.js"]);
  check(
    "hosting-tespiti: cdn-cgi yolundan cloudflare cixarilir",
    cdnCgiPath.some((detection) => detection.name === "Cloudflare"),
    `cdnCgiPath: ${JSON.stringify(cdnCgiPath)}`,
  );

  const vercelCname = detectFromCname(["cname.vercel-dns.com"]);
  check(
    "hosting-tespiti: vercel-dns cname-inden vercel cixarilir",
    vercelCname.some((detection) => detection.name === "Vercel"),
    `vercelCname: ${JSON.stringify(vercelCname)}`,
  );

  const noCname = detectFromCname([]);
  check("hosting-tespiti: bos cname zenciri bos netice verir", noCname.length === 0, `noCname: ${JSON.stringify(noCname)}`);

  const rdapAmazon = detectFromRdapOrg({ networkName: null, handle: null, country: null, organisation: "Amazon.com, Inc." }, null);
  check(
    "hosting-tespiti: rdap teskilat adindan aws cixarilir",
    rdapAmazon.some((detection) => detection.name === "Amazon Web Services"),
    `rdapAmazon: ${JSON.stringify(rdapAmazon)}`,
  );

  const fullReport = buildHostingReport({
    headers: [["cf-ray", "abc123-FRA"]],
    html: '<meta name="generator" content="WordPress 6.5">',
    cnameChain: [],
    address: "203.0.113.10",
    rdap: null,
    asnName: null,
  });
  check(
    "hosting-tespiti: hesabat baslıq ve html elametlerini birlesdirir",
    fullReport.detections.some((d) => d.name === "Cloudflare") && fullReport.detections.some((d) => d.name === "WordPress"),
    `fullReport: ${JSON.stringify(fullReport)}`,
  );
};
