/*
 * The claims worth checking here: the fragment stays after the query string
 * once utm_* parameters are added, an existing utm_* value is overwritten
 * rather than duplicated, the two audit warnings fire on exactly the inputs
 * the tool page advertises, a value with a non-ASCII letter survives the
 * build-then-parse round trip unchanged, and parseUtmUrl -> buildUtmUrl loses
 * no information even though URLSearchParams does not promise to preserve
 * parameter order.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditUtm,
  buildUtmUrl,
  EMPTY_UTM,
  parseUtmUrl,
  slugifyParam,
  UTM_PRESETS,
  type UtmFields,
} from "../lib/utm";

function fields(overrides: Partial<UtmFields>): UtmFields {
  return { ...EMPTY_UTM, ...overrides };
}

export const checks: CheckSuite = (check) => {
  const withFragment = buildUtmUrl(
    fields({
      url: "https://sayt.az/b#bolme",
      source: "facebook",
      medium: "social",
      campaign: "yay",
    }),
  );
  check(
    "utm: the #fragment stays after the query string once utm_* is added",
    withFragment.url !== null && /\?.*utm_campaign=yay#bolme$/.test(withFragment.url),
    `got: ${withFragment.url}`,
  );

  const overwritten = buildUtmUrl(
    fields({
      url: "https://sayt.az/b?utm_source=old&other=1",
      source: "new",
      medium: "social",
      campaign: "yay",
    }),
  );
  check(
    "utm: an existing utm_source is overwritten, not duplicated",
    overwritten.url !== null &&
      (overwritten.url.match(/utm_source=/g) ?? []).length === 1 &&
      overwritten.url.includes("utm_source=new") &&
      overwritten.url.includes("other=1"),
    `got: ${overwritten.url}`,
  );

  const upperCaseWarnings = auditUtm(fields({ source: "Facebook", medium: "social", campaign: "yay" }));
  check(
    "utm: an uppercase-letter source (Facebook) raises a case warning naming the field",
    upperCaseWarnings.some(
      (warning) => warning.field === "source" && warning.suggestion === "facebook",
    ),
    `got: ${JSON.stringify(upperCaseWarnings)}`,
  );

  const spaceWarnings = auditUtm(
    fields({ source: "facebook", medium: "social", campaign: "yay kampaniyası" }),
  );
  check(
    "utm: a campaign value with a space (yay kampaniyası) raises a space warning",
    spaceWarnings.some(
      (warning) => warning.field === "campaign" && warning.suggestion === "yay-kampaniyası",
    ),
    `got: ${JSON.stringify(spaceWarnings)}`,
  );

  const azBuild = buildUtmUrl(
    fields({
      url: "https://sayt.az/b",
      source: "facebook",
      medium: "social",
      campaign: "Bakı şəhəri",
    }),
  );
  const azParsed = azBuild.url ? parseUtmUrl(azBuild.url) : null;
  check(
    "utm: an Azerbaijani letter in a value is percent-encoded and decodes back unchanged",
    azBuild.url !== null &&
      azBuild.url.includes("utm_campaign=") &&
      !azBuild.url.includes("Bakı") &&
      azParsed?.fields.campaign === "Bakı şəhəri",
    `built: ${azBuild.url}, parsed back: ${azParsed?.fields.campaign}`,
  );

  const original =
    "https://sayt.az/endirim?fbclid=abc&utm_source=fb&utm_medium=social&utm_campaign=yay&utm_content=v1#top";
  const roundTrip = parseUtmUrl(original);
  const rebuilt = buildUtmUrl(roundTrip.fields);
  const reparsed = rebuilt.url ? parseUtmUrl(rebuilt.url) : null;
  check(
    "utm: buildUtmUrl(parseUtmUrl(x).fields) loses no utm value or extra parameter",
    rebuilt.url !== null &&
      reparsed !== null &&
      reparsed.fields.source === "fb" &&
      reparsed.fields.medium === "social" &&
      reparsed.fields.campaign === "yay" &&
      reparsed.fields.content === "v1" &&
      reparsed.extras.some(([key, value]) => key === "fbclid" && value === "abc") &&
      rebuilt.url.endsWith("#top"),
    `original: ${original}, rebuilt: ${rebuilt.url}`,
  );

  const missingField = buildUtmUrl(fields({ url: "https://sayt.az", source: "facebook", medium: "" }));
  check(
    "utm: a missing mandatory field (medium) fails to build and names the field",
    missingField.url === null && (missingField.error ?? "").includes("utm_medium"),
    `got: ${JSON.stringify(missingField)}`,
  );

  check(
    "utm: slugifyParam replaces whitespace with '-' and keeps Azerbaijani letters",
    slugifyParam("  yay  kampaniyası  ") === "yay-kampaniyası",
    `got: ${JSON.stringify(slugifyParam("  yay  kampaniyası  "))}`,
  );

  check(
    "utm: every preset carries a non-empty source and medium",
    UTM_PRESETS.length > 0 &&
      UTM_PRESETS.every((preset) => preset.source.trim() !== "" && preset.medium.trim() !== ""),
    `got: ${JSON.stringify(UTM_PRESETS)}`,
  );

  const invalidUrl = buildUtmUrl(fields({ url: "not a url", source: "a", medium: "b", campaign: "c" }));
  check(
    "utm: a non-absolute target URL fails with an error, not a thrown exception",
    invalidUrl.url === null && invalidUrl.error !== null,
    `got: ${JSON.stringify(invalidUrl)}`,
  );

  const cleanKeepsExtras = parseUtmUrl(
    "https://sayt.az/b?ref=abc&utm_source=fb&utm_medium=social&utm_campaign=yay",
  );
  check(
    "utm: parseUtmUrl's cleanUrl drops only utm_* parameters, keeping other ones",
    cleanKeepsExtras.cleanUrl.includes("ref=abc") && !cleanKeepsExtras.cleanUrl.includes("utm_"),
    `got: ${cleanKeepsExtras.cleanUrl}`,
  );
};
