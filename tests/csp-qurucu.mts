/*
 * What breaks silently in a hand-written CSP is inheritance — fetch
 * directives fall back to `default-src`, non-inheriting directives never do
 * — so most of this suite is proving `resolveFetchDirectives` and
 * `isNonInheritingDirectiveSet` get that split right, plus that
 * `findWeaknesses` reads the *effective* value rather than only a
 * directive's own. The rest proves the string <-> map conversion is a
 * genuine round-trip and that every malformed input returns a message
 * instead of throwing.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildCspMetaTag,
  buildCspString,
  findWeaknesses,
  isNonInheritingDirectiveSet,
  parseCspString,
  resolveFetchDirectives,
  type CspDirectiveMap,
} from "../lib/csp-qurucu";

const defaultOnly: CspDirectiveMap = { "default-src": ["'self'"] };
const scriptOverridesDefault: CspDirectiveMap = { "default-src": ["'self'"], "script-src": ["'self'", "https://cdn.example.com"] };

const scriptResolved = resolveFetchDirectives(defaultOnly).find((entry) => entry.directive === "script-src");
const scriptOwnResolved = resolveFetchDirectives(scriptOverridesDefault).find((entry) => entry.directive === "script-src");

const explicitUnsafeInline: CspDirectiveMap = { "default-src": ["'self'"], "script-src": ["'self'", "'unsafe-inline'"] };
const inheritedUnsafeInline: CspDirectiveMap = { "default-src": ["'self'", "'unsafe-inline'"] };
const unsafeInlineOnlyOnImg: CspDirectiveMap = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "img-src": ["'self'", "'unsafe-inline'"],
};

const objectUnrestricted: CspDirectiveMap = { "script-src": ["'self'"] };
const objectRestrictedViaDefault: CspDirectiveMap = { "default-src": ["'self'"], "script-src": ["'self'"] };

const missingBaseAndAncestors: CspDirectiveMap = { "default-src": ["'self'"] };
const withBaseAndAncestors: CspDirectiveMap = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
};

const fullPolicy: CspDirectiveMap = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://cdn.example.com"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "upgrade-insecure-requests": [],
};
const builtOnce = buildCspString(fullPolicy);
const reparsed = parseCspString(builtOnce);
const builtTwice = reparsed.ok ? buildCspString(reparsed.directives) : null;

const emptyParse = parseCspString("");
const semicolonsOnlyParse = parseCspString(";;;  ; ");

const metaResult = buildCspMetaTag({
  "default-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "report-uri": ["https://example.com/csp-report"],
});

export const checks: CheckSuite = (check) => {
  check(
    "csp-qurucu: an unset fetch directive inherits default-src's own value",
    scriptResolved !== undefined && scriptResolved.inherited && scriptResolved.effectiveValues.join(" ") === "'self'",
    `resolved: ${JSON.stringify(scriptResolved)}`,
  );

  check(
    "csp-qurucu: an explicitly set fetch directive overrides default-src rather than inheriting it",
    scriptOwnResolved !== undefined &&
      !scriptOwnResolved.inherited &&
      scriptOwnResolved.effectiveValues.join(" ") === "'self' https://cdn.example.com",
    `resolved: ${JSON.stringify(scriptOwnResolved)}`,
  );

  check(
    "csp-qurucu: frame-ancestors does NOT inherit from default-src when unset",
    !isNonInheritingDirectiveSet(defaultOnly, "frame-ancestors"),
    `isNonInheritingDirectiveSet result: ${isNonInheritingDirectiveSet(defaultOnly, "frame-ancestors")}`,
  );

  check(
    "csp-qurucu: base-uri does NOT inherit from default-src when unset",
    !isNonInheritingDirectiveSet(defaultOnly, "base-uri"),
    `isNonInheritingDirectiveSet result: ${isNonInheritingDirectiveSet(defaultOnly, "base-uri")}`,
  );

  check(
    "csp-qurucu: 'unsafe-inline' weakness fires when script-src carries it explicitly",
    findWeaknesses(explicitUnsafeInline).some((w) => w.message.includes("'unsafe-inline'")),
    `weaknesses: ${JSON.stringify(findWeaknesses(explicitUnsafeInline))}`,
  );

  check(
    "csp-qurucu: 'unsafe-inline' weakness fires when script-src inherits it from default-src",
    findWeaknesses(inheritedUnsafeInline).some((w) => w.message.includes("'unsafe-inline'")),
    `weaknesses: ${JSON.stringify(findWeaknesses(inheritedUnsafeInline))}`,
  );

  check(
    "csp-qurucu: 'unsafe-inline' weakness is scoped to script-src/style-src and stays silent when only img-src carries it",
    !findWeaknesses(unsafeInlineOnlyOnImg).some((w) => w.message.includes("'unsafe-inline'")),
    `weaknesses: ${JSON.stringify(findWeaknesses(unsafeInlineOnlyOnImg))}`,
  );

  check(
    "csp-qurucu: object-src is flagged unrestricted when neither it nor default-src is set",
    findWeaknesses(objectUnrestricted).some((w) => w.directive === "object-src"),
    `weaknesses: ${JSON.stringify(findWeaknesses(objectUnrestricted))}`,
  );

  check(
    "csp-qurucu: object-src is NOT flagged once default-src restricts it by inheritance",
    !findWeaknesses(objectRestrictedViaDefault).some((w) => w.directive === "object-src"),
    `weaknesses: ${JSON.stringify(findWeaknesses(objectRestrictedViaDefault))}`,
  );

  check(
    "csp-qurucu: missing base-uri and frame-ancestors are both flagged, and disappear once set",
    findWeaknesses(missingBaseAndAncestors).some((w) => w.directive === "base-uri") &&
      findWeaknesses(missingBaseAndAncestors).some((w) => w.directive === "frame-ancestors") &&
      !findWeaknesses(withBaseAndAncestors).some((w) => w.directive === "base-uri") &&
      !findWeaknesses(withBaseAndAncestors).some((w) => w.directive === "frame-ancestors"),
    `missing: ${JSON.stringify(findWeaknesses(missingBaseAndAncestors))} / set: ${JSON.stringify(findWeaknesses(withBaseAndAncestors))}`,
  );

  check(
    "csp-qurucu: building, parsing and rebuilding a policy string is a stable round-trip",
    reparsed.ok && builtTwice === builtOnce,
    reparsed.ok ? `first: ${builtOnce} / second: ${builtTwice}` : `parse refused: ${reparsed.error}`,
  );

  check(
    "csp-qurucu: an empty string is refused with a message, not thrown",
    !emptyParse.ok && emptyParse.error.length > 0,
    emptyParse.ok ? "an empty string was accepted" : "no message",
  );

  check(
    "csp-qurucu: a string of only semicolons is refused with a message, not thrown",
    !semicolonsOnlyParse.ok && semicolonsOnlyParse.error.length > 0,
    semicolonsOnlyParse.ok ? "a semicolons-only string was accepted" : "no message",
  );

  check(
    "csp-qurucu: the meta tag drops frame-ancestors and report-uri and reports both as dropped",
    !metaResult.tag.includes("frame-ancestors") &&
      !metaResult.tag.includes("report-uri") &&
      metaResult.droppedDirectives.includes("frame-ancestors") &&
      metaResult.droppedDirectives.includes("report-uri"),
    `tag: ${metaResult.tag} / dropped: ${JSON.stringify(metaResult.droppedDirectives)}`,
  );
};
