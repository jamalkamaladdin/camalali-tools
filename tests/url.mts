/*
 * The punycode cases below are checked against real-world and RFC-published
 * pairs, not against this file's own encoder — there is no encoder here to
 * compare against, only the decoder, which is the direction a browser has no
 * built-in for. "тест.рф" <-> "xn--e1aybc.xn--p1ai" is a long-standing public
 * Cyrillic IDN test domain; the Arabic string is RFC 3492's own worked
 * example (Appendix B, sample (A)); "испытание" <-> "xn--80akhbyknj4f" is one
 * of ICANN's own IDN test TLDs. All three were confirmed independently
 * against Node's `url.domainToUnicode` before being hardcoded here.
 */
import type { CheckSuite } from "./harness.mts";
import {
  decodeHostname,
  decodeWithStyle,
  encodeWithStyle,
  parseUrl,
  rebuildUrlWithParams,
} from "../lib/url";

export const checks: CheckSuite = (check) => {
  check(
    "url: azerbaycan herfli deyer encodeURIComponent ile duz kodlanir",
    encodeWithStyle("Cəmran", "component") === "C%C9%99mran",
    `alinan: ${encodeWithStyle("Cəmran", "component")}`,
  );

  check(
    "url: + isareli form kodlamasi boslugu + kimi yazir, %20 yox",
    encodeWithStyle("a b", "form") === "a+b" && encodeWithStyle("a b", "component") === "a%20b",
    `form: ${encodeWithStyle("a b", "form")}, component: ${encodeWithStyle("a b", "component")}`,
  );

  const formDecoded = decodeWithStyle("a+b", "form");
  const componentDecoded = decodeWithStyle("a+b", "component");
  check(
    "url: form dekodda + boslugdur, component dekodda herfi + kimi qalir",
    formDecoded.ok === true &&
      formDecoded.text === "a b" &&
      componentDecoded.ok === true &&
      componentDecoded.text === "a+b",
    `form: ${JSON.stringify(formDecoded)}, component: ${JSON.stringify(componentDecoded)}`,
  );

  check(
    "url: yanlis faiz ardicilligi xeta verir, sindirmir",
    decodeWithStyle("100%", "component").ok === false,
    `alinan: ${JSON.stringify(decodeWithStyle("100%", "component"))}`,
  );

  check(
    "url: artiq kodlanmis metni ikinci defe kodlamaq % isaresini qaciriir",
    encodeWithStyle("%20", "component") === "%2520",
    `alinan: ${encodeWithStyle("%20", "component")}`,
  );

  check(
    "url: kiril punycode host taninmis test domeni ile uygundur (KNOWN: тест.рф)",
    decodeHostname("xn--e1aybc.xn--p1ai") === "тест.рф",
    `alinan: ${decodeHostname("xn--e1aybc.xn--p1ai")}`,
  );

  check(
    "url: RFC 3492 erebce numunesi duz acilir (KNOWN: RFC 3492 Appendix B sample A)",
    decodeHostname("xn--egbpdaj6bu4bxfgehfvwxn") === "ليهمابتكلموشعربي؟",
    `alinan: ${decodeHostname("xn--egbpdaj6bu4bxfgehfvwxn")}`,
  );

  check(
    "url: ICANN-in oz IDN test etiketi duz acilir (KNOWN: испытание)",
    decodeHostname("xn--80akhbyknj4f") === "испытание",
    `alinan: ${decodeHostname("xn--80akhbyknj4f")}`,
  );

  check(
    "url: xn-- ile baslamayan host toxunulmadan qalir",
    decodeHostname("misal.az") === "misal.az",
    `alinan: ${decodeHostname("misal.az")}`,
  );

  const withPort = parseUrl("https://user:parol@misal.az:8443/yol?a=1#b");
  check(
    "url: port, istifadeci adi ve parol duz oxunur",
    withPort.ok === true &&
      withPort.port === "8443" &&
      withPort.username === "user" &&
      withPort.password === "parol",
    `alinan: ${JSON.stringify(withPort)}`,
  );

  const duplicateKeys = parseUrl("https://misal.az/?a=1&a=2");
  check(
    "url: tekrarlanan acar iki ayri setir kimi qalir, birlesmir",
    duplicateKeys.ok === true &&
      duplicateKeys.searchParams.length === 2 &&
      duplicateKeys.searchParams[0][1] === "1" &&
      duplicateKeys.searchParams[1][1] === "2",
    `alinan: ${JSON.stringify(duplicateKeys.ok ? duplicateKeys.searchParams : duplicateKeys)}`,
  );

  const valuelessKey = parseUrl("https://misal.az/?a");
  check(
    "url: deyersiz acar bos setirle oxunur",
    valuelessKey.ok === true &&
      valuelessKey.searchParams.length === 1 &&
      valuelessKey.searchParams[0][0] === "a" &&
      valuelessKey.searchParams[0][1] === "",
    `alinan: ${JSON.stringify(valuelessKey)}`,
  );

  const hashWithQuestionMark = parseUrl("https://misal.az/#/rota?x=1");
  check(
    "url: fraqment daxilindeki ? sorgu kimi oxunmur",
    hashWithQuestionMark.ok === true &&
      hashWithQuestionMark.hash === "#/rota?x=1" &&
      hashWithQuestionMark.search === "",
    `alinan: ${JSON.stringify(hashWithQuestionMark)}`,
  );

  check(
    "url: sxemsiz metn yanlis URL kimi redd edilir",
    parseUrl("misal.az/yol").ok === false,
    `alinan: ${JSON.stringify(parseUrl("misal.az/yol"))}`,
  );

  const base = parseUrl("https://misal.az/?a=1");
  const rebuilt = base.ok
    ? rebuildUrlWithParams(base.href, [
        ["a", "1"],
        ["b", "2"],
      ])
    : null;
  check(
    "url: cedvele setir elave edilende URL yeniden qurulur",
    rebuilt === "https://misal.az/?a=1&b=2",
    `alinan: ${rebuilt}`,
  );

  const droppedEmptyKey = base.ok
    ? rebuildUrlWithParams(base.href, [
        ["", "1"],
        ["b", "2"],
      ])
    : null;
  check(
    "url: bos acarli setir yeniden qurulanda atilir",
    droppedEmptyKey === "https://misal.az/?b=2",
    `alinan: ${droppedEmptyKey}`,
  );
};
