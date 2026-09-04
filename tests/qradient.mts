/*
 * What is worth checking here: each of the three gradient functions comes
 * out in the exact syntax CSS expects, stops entered out of order are
 * repainted in position order rather than entry order (the one piece of real
 * arithmetic this tool does), an angle outside 0-360 wraps instead of being
 * printed raw, and the three ways a stop list can be malformed — fewer than
 * two stops, a position outside 0-100, an empty colour — are all errors
 * rather than thrown exceptions.
 */
import type { CheckSuite } from "./harness.mts";
import { addStop, buildGradient, removeStop, sortStops, type GradientInput } from "../lib/qradient";

const LINEAR: GradientInput = {
  type: "linear",
  angleDeg: 90,
  centerX: 50,
  centerY: 50,
  stops: [
    { color: "#000000", position: 0 },
    { color: "#ffffff", position: 100 },
  ],
};

export const checks: CheckSuite = (check) => {
  const linear = buildGradient(LINEAR);
  check(
    "qradient: a two-stop linear gradient matches the exact CSS function syntax",
    linear.ok && linear.css === "linear-gradient(90deg, #000000 0%, #ffffff 100%)",
    `got: ${JSON.stringify(linear)}`,
  );

  const radial = buildGradient({ ...LINEAR, type: "radial", centerX: 30, centerY: 70 });
  check(
    "qradient: a radial gradient carries its centre as a percentage pair",
    radial.ok && radial.css === "radial-gradient(circle at 30% 70%, #000000 0%, #ffffff 100%)",
    `got: ${JSON.stringify(radial)}`,
  );

  const conic = buildGradient({ ...LINEAR, type: "conic", angleDeg: 45, centerX: 50, centerY: 50 });
  check(
    "qradient: a conic gradient carries both a start angle and a centre",
    conic.ok && conic.css === "conic-gradient(from 45deg at 50% 50%, #000000 0%, #ffffff 100%)",
    `got: ${JSON.stringify(conic)}`,
  );

  const outOfOrder = buildGradient({
    ...LINEAR,
    stops: [
      { color: "#ff0000", position: 80 },
      { color: "#00ff00", position: 10 },
      { color: "#0000ff", position: 50 },
    ],
  });
  check(
    "qradient: stops entered out of order are repainted in ascending position order",
    outOfOrder.ok && outOfOrder.css === "linear-gradient(90deg, #00ff00 10%, #0000ff 50%, #ff0000 80%)",
    `got: ${JSON.stringify(outOfOrder)}`,
  );

  const sorted = sortStops(LINEAR.stops);
  check(
    "qradient: sorting an already-sorted stop list changes nothing",
    sorted[0].position === 0 && sorted[1].position === 100,
    `got: ${JSON.stringify(sorted)}`,
  );

  const wrappedAngle = buildGradient({ ...LINEAR, angleDeg: 450 });
  check(
    "qradient: an angle past 360 wraps rather than being printed raw",
    wrappedAngle.ok && wrappedAngle.css.startsWith("linear-gradient(90deg,"),
    `got: ${JSON.stringify(wrappedAngle)}`,
  );

  const negativeAngle = buildGradient({ ...LINEAR, angleDeg: -90 });
  check(
    "qradient: a negative angle wraps into the equivalent positive one",
    negativeAngle.ok && negativeAngle.css.startsWith("linear-gradient(270deg,"),
    `got: ${JSON.stringify(negativeAngle)}`,
  );

  const oneStop = buildGradient({ ...LINEAR, stops: [{ color: "#000000", position: 0 }] });
  check(
    "qradient: fewer than two stops is an error, not a one-stop gradient",
    oneStop.ok === false,
    `got: ${JSON.stringify(oneStop)}`,
  );

  const badPosition = buildGradient({
    ...LINEAR,
    stops: [
      { color: "#000000", position: -5 },
      { color: "#ffffff", position: 100 },
    ],
  });
  check(
    "qradient: a stop position outside 0-100 is an error",
    badPosition.ok === false,
    `got: ${JSON.stringify(badPosition)}`,
  );

  const emptyColor = buildGradient({
    ...LINEAR,
    stops: [
      { color: "  ", position: 0 },
      { color: "#ffffff", position: 100 },
    ],
  });
  check(
    "qradient: a blank stop colour is an error",
    emptyColor.ok === false,
    `got: ${JSON.stringify(emptyColor)}`,
  );

  const added = addStop(LINEAR.stops);
  check(
    "qradient: addStop grows the list by exactly one",
    added.length === LINEAR.stops.length + 1,
    `got: ${JSON.stringify(added)}`,
  );

  const removed = removeStop(LINEAR.stops, 0);
  check(
    "qradient: removeStop drops exactly the requested index",
    removed.length === 1 && removed[0].color === "#ffffff",
    `got: ${JSON.stringify(removed)}`,
  );
};
