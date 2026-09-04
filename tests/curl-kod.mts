/*
 * The tokenizer is the tool's real job, so most cases here exist to break it:
 * a quoted argument with a space `-d` must not split on, a double-quoted
 * header where only `\"` `\\` `\$` are real escapes, a line continuation
 * across two lines. The rest checks that curl -> emitted code -> curl again
 * lands on the same request, which is the property a visitor actually
 * depends on when the tool is used both ways.
 */
import type { CheckSuite } from "./harness.mts";
import { curlFromRequest, parseCurl, parseFetchCode, toFetch } from "../lib/curl-kod";

export const checks: CheckSuite = (check) => {
  const bareGet = parseCurl("curl https://example.az");
  check(
    "curl-kod: bayraqsız əmr GET və düz URL verir",
    bareGet.ok && bareGet.request.method === "GET" && bareGet.request.url === "https://example.az",
    JSON.stringify(bareGet),
  );

  const postWithData = parseCurl("curl -X POST -H 'Content-Type: application/json' -d '{\"a\":1}' https://example.az/x");
  check(
    "curl-kod: -X, -H, -d birlikdə düzgün oxunur",
    postWithData.ok &&
      postWithData.request.method === "POST" &&
      postWithData.request.headers[0]?.[1] === "application/json" &&
      postWithData.request.body === '{"a":1}',
    JSON.stringify(postWithData),
  );

  const jsonFlag = parseCurl(`curl --json '{"a":1}' https://example.az`);
  check(
    "curl-kod: --json həm gövdəni, həm iki başlığı, həm POST-u qoyur",
    jsonFlag.ok &&
      jsonFlag.request.method === "POST" &&
      jsonFlag.request.bodyIsJson &&
      jsonFlag.request.headers.some(([k, v]) => k === "Content-Type" && v === "application/json"),
    JSON.stringify(jsonFlag),
  );

  const withAuth = parseCurl("curl -u kamran:sirr https://example.az");
  check(
    "curl-kod: -u istifadəçi/parolu ayırır",
    withAuth.ok && withAuth.request.auth?.user === "kamran" && withAuth.request.auth?.pass === "sirr",
    JSON.stringify(withAuth),
  );

  const spacedData = parseCurl(`curl -d "va lue with space" https://example.az`);
  check(
    "curl-kod: dırnaq içindəki boşluq ayrı arqument kimi bölünmür",
    spacedData.ok && spacedData.request.body === "va lue with space",
    JSON.stringify(spacedData),
  );

  const multiHeader = parseCurl("curl -H 'A: 1' -H 'B: 2' https://example.az");
  check(
    "curl-kod: bir neçə -H sırası ilə saxlanılır",
    multiHeader.ok && multiHeader.request.headers.length === 2 && multiHeader.request.headers[0][0] === "A" && multiHeader.request.headers[1][0] === "B",
    JSON.stringify(multiHeader),
  );

  const continued = parseCurl("curl https://example.az \\\n  -H 'X-Test: 1'");
  check(
    "curl-kod: sətir sonu \\ ilə davam edən əmr bir sətir kimi oxunur",
    continued.ok && continued.request.headers[0]?.[0] === "X-Test",
    JSON.stringify(continued),
  );

  const formFields = parseCurl("curl -F 'file=@photo.png' -F 'name=Kamran' https://example.az/upload");
  check(
    "curl-kod: -F sahəsi @ ilə fayl olduğunu işarələyir",
    formFields.ok &&
      formFields.request.form?.[0]?.isFile === true &&
      formFields.request.form?.[0]?.value === "photo.png" &&
      formFields.request.form?.[1]?.isFile === false,
    JSON.stringify(formFields),
  );

  const empty = parseCurl("");
  check("curl-kod: boş əmr throw etmir, error qaytarır", empty.ok === false, JSON.stringify(empty));

  const noUrl = parseCurl("curl -X POST");
  check("curl-kod: URL-siz əmr throw etmir, error qaytarır", noUrl.ok === false, JSON.stringify(noUrl));

  const bareGetParsed = parseCurl("curl https://example.az");
  check(
    "curl-kod: sadə GET üçün fetch kodu dəqiq gözlənilən sətirdir",
    bareGetParsed.ok && toFetch(bareGetParsed.request) === 'const response = await fetch("https://example.az");',
    bareGetParsed.ok ? toFetch(bareGetParsed.request) : bareGetParsed.error,
  );

  const fetchCode = 'fetch("https://api.example.az/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({"a":1}) });';
  const parsedFetch = parseFetchCode(fetchCode);
  check(
    "curl-kod: fetch(...) kodundan method, header və body oxunur",
    parsedFetch.ok && parsedFetch.request.method === "POST" && parsedFetch.request.bodyIsJson && parsedFetch.request.headers[0]?.[0] === "Content-Type",
    JSON.stringify(parsedFetch),
  );

  const original = "curl -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer abc123' -d '{\"name\":\"Kamran\",\"age\":30}' https://api.example.com/users";
  const firstParse = parseCurl(original);
  const roundTripCurl = firstParse.ok ? curlFromRequest(firstParse.request) : null;
  const secondParse = roundTripCurl !== null ? parseCurl(roundTripCurl) : null;
  check(
    "curl-kod: curl → emal → curl → emal eyni sorğunu verir (round-trip)",
    firstParse.ok && secondParse !== null && secondParse.ok && JSON.stringify(firstParse.request) === JSON.stringify(secondParse.request),
    `birinci: ${JSON.stringify(firstParse)}, ikinci: ${JSON.stringify(secondParse)}`,
  );
};
