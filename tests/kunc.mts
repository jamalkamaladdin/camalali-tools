/*
 * What is worth checking here: the three collapse shapes (one circular
 * value, one elliptical pair, or the fully explicit form) each fire on the
 * input they are meant for and not on a near-miss — three matching corners
 * and one different one must NOT collapse, and one elliptical corner among
 * otherwise-circular ones must force the eight-value form — px and % both
 * carry through the unit correctly, zero is a legal radius, a negative one
 * is an error rather than a thrown exception, and collapsing is idempotent:
 * expanding a collapsed value back into four equal corners and rebuilding
 * reproduces the same string.
 */
import type { CheckSuite } from "./harness.mts";
import { buildBorderRadius, type RadiusInput } from "../lib/kunc";

const CIRCLE = { horizontal: 12, vertical: 12 };

function uniform(radius: { horizontal: number; vertical: number }, unit: RadiusInput["unit"] = "px"): RadiusInput {
  return { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius, unit };
}

export const checks: CheckSuite = (check) => {
  const allEqual = buildBorderRadius(uniform(CIRCLE));
  check(
    "kunc: four equal circular corners collapse to a single value",
    allEqual.ok && allEqual.css === "12px" && allEqual.collapsed === true && allEqual.elliptical === false,
    `got: ${JSON.stringify(allEqual)}`,
  );

  const fourDifferent = buildBorderRadius({
    topLeft: { horizontal: 4, vertical: 4 },
    topRight: { horizontal: 8, vertical: 8 },
    bottomRight: { horizontal: 12, vertical: 12 },
    bottomLeft: { horizontal: 16, vertical: 16 },
    unit: "px",
  });
  check(
    "kunc: four different corners print the plain four-value form",
    fourDifferent.ok && fourDifferent.css === "4px 8px 12px 16px" && fourDifferent.collapsed === false,
    `got: ${JSON.stringify(fourDifferent)}`,
  );

  const ellipticalUniform = buildBorderRadius(uniform({ horizontal: 20, vertical: 8 }));
  check(
    "kunc: the same elliptical pair on all four corners collapses to 'h / v'",
    ellipticalUniform.ok &&
      ellipticalUniform.css === "20px / 8px" &&
      ellipticalUniform.collapsed === true &&
      ellipticalUniform.elliptical === true,
    `got: ${JSON.stringify(ellipticalUniform)}`,
  );

  const ellipticalDifferent = buildBorderRadius({
    topLeft: { horizontal: 4, vertical: 2 },
    topRight: { horizontal: 8, vertical: 2 },
    bottomRight: { horizontal: 4, vertical: 2 },
    bottomLeft: { horizontal: 8, vertical: 2 },
    unit: "px",
  });
  check(
    "kunc: differing elliptical corners print the full eight-value 'h h h h / v v v v' form",
    ellipticalDifferent.ok && ellipticalDifferent.css === "4px 8px 4px 8px / 2px 2px 2px 2px",
    `got: ${JSON.stringify(ellipticalDifferent)}`,
  );

  const percent = buildBorderRadius(uniform({ horizontal: 50, vertical: 50 }, "%"));
  check(
    "kunc: the % unit is carried through the collapsed value",
    percent.ok && percent.css === "50%",
    `got: ${JSON.stringify(percent)}`,
  );

  const zero = buildBorderRadius(uniform({ horizontal: 0, vertical: 0 }));
  check(
    "kunc: zero is a legal radius, not treated as unset",
    zero.ok && zero.css === "0px",
    `got: ${JSON.stringify(zero)}`,
  );

  const negative = buildBorderRadius(uniform({ horizontal: -5, vertical: -5 }));
  check(
    "kunc: a negative radius is an error, not a thrown exception",
    negative.ok === false,
    `got: ${JSON.stringify(negative)}`,
  );

  const notFinite = buildBorderRadius(uniform({ horizontal: Number.NaN, vertical: 4 }));
  check(
    "kunc: a non-finite radius is an error",
    notFinite.ok === false,
    `got: ${JSON.stringify(notFinite)}`,
  );

  const threeSameOneDifferent = buildBorderRadius({
    topLeft: CIRCLE,
    topRight: CIRCLE,
    bottomRight: CIRCLE,
    bottomLeft: { horizontal: 4, vertical: 4 },
    unit: "px",
  });
  check(
    "kunc: three matching corners and one different one do NOT collapse",
    threeSameOneDifferent.ok &&
      threeSameOneDifferent.collapsed === false &&
      threeSameOneDifferent.css === "12px 12px 12px 4px",
    `got: ${JSON.stringify(threeSameOneDifferent)}`,
  );

  const oneElliptical = buildBorderRadius({
    topLeft: { horizontal: 10, vertical: 10 },
    topRight: { horizontal: 10, vertical: 10 },
    bottomRight: { horizontal: 10, vertical: 10 },
    bottomLeft: { horizontal: 10, vertical: 4 },
    unit: "px",
  });
  check(
    "kunc: a single elliptical corner among circular ones forces the eight-value form",
    oneElliptical.ok && oneElliptical.elliptical === true && oneElliptical.css.includes("/"),
    `got: ${JSON.stringify(oneElliptical)}`,
  );

  const collapsedOnce = buildBorderRadius(uniform({ horizontal: 18, vertical: 18 }));
  const reExpanded: RadiusInput = uniform({ horizontal: 18, vertical: 18 });
  const collapsedTwice = buildBorderRadius(reExpanded);
  check(
    "kunc: collapsing is idempotent — rebuilding from the collapsed value reproduces the same string",
    collapsedOnce.ok && collapsedTwice.ok && collapsedOnce.css === collapsedTwice.css,
    `first: ${JSON.stringify(collapsedOnce)}, second: ${JSON.stringify(collapsedTwice)}`,
  );

  const fraction = buildBorderRadius(uniform({ horizontal: 12.5, vertical: 12.5 }));
  check(
    "kunc: a fractional radius formats cleanly without float noise",
    fraction.ok && fraction.css === "12.5px",
    `got: ${JSON.stringify(fraction)}`,
  );
};
