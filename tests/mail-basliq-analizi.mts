/*
 * `mail-basliq-analizi`'s wire-format reading, checked against hand-built
 * header text — no network, since the tool itself never leaves the browser.
 * Every case is the shape a wrong edit to the folding, chain-reversal or
 * `Authentication-Results` regex would break silently.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildMailAnalysis,
  compareSenderFields,
  extractReceivedChain,
  headerValue,
  parseAddressField,
  parseAuthenticationResults,
  parseHeaders,
  unfoldHeaders,
} from "../lib/mail-basliq-analizi";

export const checks: CheckSuite = (check) => {
  /* ---------- folding and splitting ---------- */

  const unfolded = unfoldHeaders("Subject: Salam\n dünya\nFrom: a@b.com");
  check(
    "mail-basliq-analizi: qatlanmis setir bir setre birlesir",
    unfolded === "Subject: Salam dünya\nFrom: a@b.com",
    `unfolded: ${JSON.stringify(unfolded)}`,
  );

  const headers = parseHeaders("Received: hop1\nReceived: hop2\nFrom: a@b.com");
  const receivedCount = headers.filter((header) => header.name === "Received").length;
  check(
    "mail-basliq-analizi: tekrarlanan basliq adlari itmir, sira saxlanir",
    receivedCount === 2 && headers[0].value === "hop1" && headers[1].value === "hop2",
    `headers: ${JSON.stringify(headers)}`,
  );

  const caseInsensitive = headerValue(parseHeaders("FROM: a@b.com"), "from");
  check(
    "mail-basliq-analizi: basliq adi boyuk-kicik herfden asili olmadan tapilir",
    caseInsensitive === "a@b.com",
    `value: ${JSON.stringify(caseInsensitive)}`,
  );

  /* ---------- Received chain ---------- */

  const rawHeaders = parseHeaders(
    [
      "Received: from b.example.com by c.example.com; Thu, 03 Sep 2026 08:00:30 +0000",
      "Received: from a.example.com by b.example.com; Thu, 03 Sep 2026 08:00:00 +0000",
    ].join("\n"),
  );
  const chain = extractReceivedChain(rawHeaders);
  check(
    "mail-basliq-analizi: zencir ters cevrilir - gonderen birinci olur",
    chain.length === 2 && chain[0].from === "a.example.com" && chain[1].from === "b.example.com",
    `chain: ${JSON.stringify(chain)}`,
  );

  check(
    "mail-basliq-analizi: sicrayis gecikmesi tarix ferqinden deqiq hesablanir",
    chain[0].delayMs === 30_000,
    `delay: ${chain[0].delayMs}`,
  );

  const unknownDateChain = extractReceivedChain(
    parseHeaders(
      [
        "Received: from b.example.com by c.example.com; not a real date",
        "Received: from a.example.com by b.example.com; Thu, 03 Sep 2026 08:00:00 +0000",
      ].join("\n"),
    ),
  );
  check(
    "mail-basliq-analizi: oxunmayan tarix null qaytarir, uydurma reqem yox",
    unknownDateChain[1].timestamp === null && unknownDateChain[0].delayMs === null,
    `chain: ${JSON.stringify(unknownDateChain)}`,
  );

  /* ---------- sender comparison ---------- */

  const mismatchHeaders = parseHeaders("From: Bank <bank@bank.com>\nReturn-Path: <bounce@evil.net>");
  const mismatch = compareSenderFields(mismatchHeaders);
  check(
    "mail-basliq-analizi: from ve return-path ferqli domendə uygunsuzluq gorunur",
    mismatch.fromReturnPathMismatch === true,
    `mismatch: ${JSON.stringify(mismatch)}`,
  );

  const matchHeaders = parseHeaders("From: Xeber <xeber@sayt.com>\nReturn-Path: <bounce@sayt.com>");
  const match = compareSenderFields(matchHeaders);
  check(
    "mail-basliq-analizi: eyni domendə uygunsuzluq gorunmur",
    match.fromReturnPathMismatch === false,
    `match: ${JSON.stringify(match)}`,
  );

  /* ---------- address parsing ---------- */

  const named = parseAddressField('"Bank Dəstək" <bank-destek@bank-az.com>');
  check(
    "mail-basliq-analizi: adli ve ünvanli setir ikisini de oxuyur",
    named.name === "Bank Dəstək" && named.address === "bank-destek@bank-az.com",
    `named: ${JSON.stringify(named)}`,
  );

  const bare = parseAddressField("bank-destek@bank-az.com");
  check(
    "mail-basliq-analizi: cili ünvanda ad null qalir",
    bare.name === null && bare.address === "bank-destek@bank-az.com",
    `bare: ${JSON.stringify(bare)}`,
  );

  /* ---------- Authentication-Results ---------- */

  const auth = parseAuthenticationResults(
    "mx.example.az; dkim=fail header.i=@evil.net; spf=softfail (test) smtp.mailfrom=x; dmarc=fail (p=REJECT) header.from=bank.com",
  );
  check(
    "mail-basliq-analizi: spf, dkim, dmarc netice ayri-ayri oxunur",
    auth.spf?.result === "softfail" && auth.dkim?.result === "fail" && auth.dmarc?.result === "fail",
    `auth: ${JSON.stringify(auth)}`,
  );

  const noAuth = parseAuthenticationResults(null);
  check(
    "mail-basliq-analizi: basliq yoxdursa ucu de null qaytarir, atmir",
    noAuth.spf === null && noAuth.dkim === null && noAuth.dmarc === null,
    `noAuth: ${JSON.stringify(noAuth)}`,
  );

  /* ---------- the whole pipeline ---------- */

  const empty = buildMailAnalysis("   ");
  check("mail-basliq-analizi: bos metn xeta qaytarir, atmir", empty.ok === false, `empty: ${JSON.stringify(empty)}`);

  const full = buildMailAnalysis(
    [
      "Received: from a.example.com by b.example.com; Thu, 03 Sep 2026 08:00:00 +0000",
      "X-Spam-Score: 8.4",
      "x-spam-status: Yes",
    ].join("\n"),
  );
  check(
    "mail-basliq-analizi: x-spam basliqlari boyuk-kicik herfden asili olmadan yigilir",
    full.ok && full.analysis.spamHeaders.length === 2,
    `full: ${JSON.stringify(full)}`,
  );
};
