/*
 * Cases for the currency tool. `CBAR_FIXTURE` is a trimmed slice of the real
 * bulletin fetched by hand from `https://www.cbar.az/currencies/02.09.2026.xml`
 * (curl, 2026-09-02) — same loose whitespace and the same two `<ValType>`
 * blocks the live file has, so the regex parser is checked against what the
 * bank actually serves rather than an invented, tidier shape.
 */
import type { CheckSuite } from "./harness.mts";
import {
  cbarDateToIso,
  cbarRetryDates,
  convertAmount,
  crossRate,
  formatCbarDate,
  invertRate,
  parseAmount,
  parseCbarXml,
  stripNominalPrefix,
} from "../lib/valyuta";

const CBAR_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<ValCurs Date="02.09.2026" Name="AZN mezennelari">

    <ValType Type="Bank metallari">
        <Valute Code="XAU">
            <Nominal>1 t.u.</Nominal>
            <Name>Qizil</Name>
            <Value>7322.002</Value>
        </Valute>
    </ValType>

    <ValType Type="Xarici valyutalar">

                            <Valute Code="USD">




                        <Nominal>1</Nominal>

                        <Name>1 ABS dollari</Name>


                    <Value>1.7</Value>
                </Valute>


                            <Valute Code="EUR">
                        <Nominal>1</Nominal>
                        <Name>1 Avro</Name>
                    <Value>1.968</Value>
                </Valute>


                            <Valute Code="KRW">
                        <Nominal>100</Nominal>
                        <Name>100 Cenubi Koreya vonu</Name>
                    <Value>0.1241</Value>
                </Valute>

            </ValType>
</ValCurs>`;

export const checks: CheckSuite = (check) => {
  const bulletin = parseCbarXml(CBAR_FIXTURE);

  check(
    "valyuta: parseCbarXml reads the bulletin date",
    bulletin.date === "02.09.2026",
    `got date ${bulletin.date}`,
  );

  check(
    "valyuta: parseCbarXml skips the metals block",
    !bulletin.rates.some((rate) => rate.code === "XAU"),
    "XAU (a metal, not a currency) leaked into the currency list",
  );

  check(
    "valyuta: parseCbarXml reads a nominal-1 rate as-is",
    bulletin.rates.find((rate) => rate.code === "USD")?.aznPerUnit === 1.7,
    `got ${JSON.stringify(bulletin.rates.find((rate) => rate.code === "USD"))}`,
  );

  check(
    "valyuta: parseCbarXml divides a nominal-100 rate down to one unit",
    bulletin.rates.find((rate) => rate.code === "KRW")?.aznPerUnit === 0.001241,
    `got ${JSON.stringify(bulletin.rates.find((rate) => rate.code === "KRW"))}`,
  );

  check(
    "valyuta: parseCbarXml throws when the date attribute is missing",
    (() => {
      try {
        parseCbarXml("<ValCurs><ValType Type=\"Xarici valyutalar\"></ValType></ValCurs>");
        return false;
      } catch {
        return true;
      }
    })(),
    "a bulletin with no ValCurs Date should not parse silently",
  );

  check(
    "valyuta: parseCbarXml throws when the currency section is missing",
    (() => {
      try {
        parseCbarXml('<ValCurs Date="02.09.2026"></ValCurs>');
        return false;
      } catch {
        return true;
      }
    })(),
    "a bulletin with no 'Xarici valyutalar' block should not parse silently",
  );

  check(
    "valyuta: stripNominalPrefix removes a matching nominal",
    stripNominalPrefix("100 Cenubi Koreya vonu", 100) === "Cenubi Koreya vonu",
    `got "${stripNominalPrefix("100 Cenubi Koreya vonu", 100)}"`,
  );

  check(
    "valyuta: stripNominalPrefix leaves a name with no matching prefix alone",
    stripNominalPrefix("Avro", 1) === "Avro",
    `got "${stripNominalPrefix("Avro", 1)}"`,
  );

  check(
    "valyuta: formatCbarDate writes DD.MM.YYYY in UTC",
    formatCbarDate(new Date(Date.UTC(2026, 8, 3))) === "03.09.2026",
    `got ${formatCbarDate(new Date(Date.UTC(2026, 8, 3)))}`,
  );

  {
    const dates = cbarRetryDates(new Date(Date.UTC(2026, 8, 3)), 4).map(formatCbarDate);
    check(
      "valyuta: cbarRetryDates walks backward one calendar day at a time, newest first",
      dates.length === 4 &&
        dates[0] === "03.09.2026" &&
        dates[1] === "02.09.2026" &&
        dates[2] === "01.09.2026" &&
        dates[3] === "31.08.2026",
      `got ${JSON.stringify(dates)}`,
    );
  }

  check(
    "valyuta: cbarDateToIso converts DD.MM.YYYY to YYYY-MM-DD",
    cbarDateToIso("03.09.2026") === "2026-09-03",
    `got "${cbarDateToIso("03.09.2026")}"`,
  );

  check(
    "valyuta: cbarDateToIso passes through a string that is not that shape",
    cbarDateToIso("not-a-date") === "not-a-date",
    `got "${cbarDateToIso("not-a-date")}"`,
  );

  const usdRates = { USD: 1, EUR: 0.86, GBP: 0.74 };

  check(
    "valyuta: crossRate from USD reads the table directly",
    crossRate(usdRates, "USD", "EUR") === 0.86,
    `got ${crossRate(usdRates, "USD", "EUR")}`,
  );

  check(
    "valyuta: crossRate to USD is the inverse of the table entry",
    Math.abs(crossRate(usdRates, "EUR", "USD") - 1 / 0.86) < 1e-9,
    `got ${crossRate(usdRates, "EUR", "USD")}`,
  );

  check(
    "valyuta: crossRate between two non-USD currencies pivots through USD",
    Math.abs(crossRate(usdRates, "EUR", "GBP") - 0.74 / 0.86) < 1e-9,
    `got ${crossRate(usdRates, "EUR", "GBP")}`,
  );

  check(
    "valyuta: crossRate throws on an unknown currency code",
    (() => {
      try {
        crossRate(usdRates, "USD", "ZZZ");
        return false;
      } catch {
        return true;
      }
    })(),
    "an unknown code should not silently price at zero",
  );

  check(
    "valyuta: parseAmount rejects an empty field",
    parseAmount("").ok === false,
    "an empty amount was accepted",
  );

  check(
    "valyuta: parseAmount rejects a negative amount",
    parseAmount("-5").ok === false,
    "a negative amount was accepted",
  );

  check(
    "valyuta: parseAmount accepts zero",
    (() => {
      const result = parseAmount("0");
      return result.ok && result.value === 0;
    })(),
    "zero is a legal amount to convert",
  );

  check(
    "valyuta: parseAmount accepts a comma decimal separator",
    (() => {
      const result = parseAmount("12,5");
      return result.ok && result.value === 12.5;
    })(),
    `got ${JSON.stringify(parseAmount("12,5"))}`,
  );

  check(
    "valyuta: parseAmount rejects non-numeric text",
    parseAmount("iyirmi manat").ok === false,
    "non-numeric text was accepted as an amount",
  );

  check(
    "valyuta: convertAmount and invertRate round-trip a rate",
    (() => {
      const rate = 1.7;
      const forward = convertAmount(100, rate);
      const back = convertAmount(forward, invertRate(rate));
      return Math.abs(back - 100) < 1e-9;
    })(),
    "forward then inverse conversion did not return the original amount",
  );
};
