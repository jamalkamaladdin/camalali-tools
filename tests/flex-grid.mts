/*
 * What is worth checking here: a gap that lands on Tailwind's 4px scale gets
 * the named class while an odd one falls back to an arbitrary value, a
 * column count within Tailwind's named range (1-12) gets a named class while
 * one past it falls back the same way, the CSS and Tailwind panels agree on
 * every declaration for the same config (the whole reason this file exists
 * rather than two separate builders), a `rowCount` of 0 omits
 * `grid-template-rows` entirely rather than writing `repeat(0, ...)`, a
 * malformed count or negative gap comes back as an error rather than a
 * thrown exception, and the gap written into a CSS block round-trips back
 * out through `parseGapDeclaration`.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildFlexOutput,
  buildGridOutput,
  parseGapDeclaration,
  type FlexConfig,
  type GridConfig,
} from "../lib/flex-grid";

const BASE_FLEX: FlexConfig = {
  direction: "row",
  justify: "flex-start",
  align: "stretch",
  wrap: "nowrap",
  gapPx: 16,
};

const BASE_GRID: GridConfig = {
  columnsMode: "count",
  columnCount: 4,
  minColumnWidthPx: 200,
  rowCount: 0,
  gapPx: 16,
  justifyItems: "stretch",
  alignItems: "stretch",
};

export const checks: CheckSuite = (check) => {
  const flexGap16 = buildFlexOutput(BASE_FLEX);
  check(
    "flex-grid: a 16px gap (on the 4px scale) gets the named gap-4 Tailwind class",
    flexGap16.ok && flexGap16.tailwind.includes("gap-4") && flexGap16.css.includes("gap: 16px;"),
    JSON.stringify(flexGap16),
  );

  const flexGap17 = buildFlexOutput({ ...BASE_FLEX, gapPx: 17 });
  check(
    "flex-grid: a 17px gap (off the 4px scale) falls back to an arbitrary-value class",
    flexGap17.ok && flexGap17.tailwind.includes("gap-[17px]"),
    JSON.stringify(flexGap17),
  );

  const flexReverse = buildFlexOutput({ ...BASE_FLEX, direction: "row-reverse", justify: "space-between" });
  check(
    "flex-grid: direction and justify both change the CSS declaration and the matching Tailwind class together",
    flexReverse.ok &&
      flexReverse.css.includes("flex-direction: row-reverse;") &&
      flexReverse.css.includes("justify-content: space-between;") &&
      flexReverse.tailwind.includes("flex-row-reverse") &&
      flexReverse.tailwind.includes("justify-between"),
    JSON.stringify(flexReverse),
  );

  const flexNegativeGap = buildFlexOutput({ ...BASE_FLEX, gapPx: -4 });
  check(
    "flex-grid: a negative flex gap returns an error result rather than throwing",
    !flexNegativeGap.ok && flexNegativeGap.error.length > 0,
    JSON.stringify(flexNegativeGap),
  );

  const gridCols4 = buildGridOutput(BASE_GRID);
  check(
    "flex-grid: a 4-column grid (within Tailwind's named 1-12 range) gets grid-cols-4 and the matching template",
    gridCols4.ok &&
      gridCols4.tailwind.includes("grid-cols-4") &&
      gridCols4.css.includes("grid-template-columns: repeat(4, minmax(0, 1fr));"),
    JSON.stringify(gridCols4),
  );

  const gridCols16 = buildGridOutput({ ...BASE_GRID, columnCount: 16 });
  check(
    "flex-grid: a 16-column grid (past Tailwind's named range) falls back to an arbitrary-value class",
    gridCols16.ok && gridCols16.tailwind.includes("grid-cols-[repeat(16,minmax(0,1fr))]"),
    JSON.stringify(gridCols16),
  );

  const gridAutoFit = buildGridOutput({ ...BASE_GRID, columnsMode: "auto-fit", minColumnWidthPx: 240 });
  check(
    "flex-grid: auto-fit mode writes minmax() with the visitor's minimum width, in both panels",
    gridAutoFit.ok &&
      gridAutoFit.css.includes("repeat(auto-fit, minmax(240px, 1fr))") &&
      gridAutoFit.tailwind.includes("minmax(240px,1fr)"),
    JSON.stringify(gridAutoFit),
  );

  const gridNoRows = buildGridOutput(BASE_GRID);
  const gridWithRows = buildGridOutput({ ...BASE_GRID, rowCount: 3 });
  check(
    "flex-grid: rowCount 0 omits grid-template-rows entirely, rowCount 3 writes it explicitly",
    gridNoRows.ok &&
      !gridNoRows.css.includes("grid-template-rows") &&
      gridWithRows.ok &&
      gridWithRows.css.includes("grid-template-rows: repeat(3, minmax(0, 1fr));"),
    `no rows: ${JSON.stringify(gridNoRows)}, with rows: ${JSON.stringify(gridWithRows)}`,
  );

  const gridZeroColumns = buildGridOutput({ ...BASE_GRID, columnCount: 0 });
  const gridTooManyColumns = buildGridOutput({ ...BASE_GRID, columnCount: 25 });
  check(
    "flex-grid: a column count of 0 or past the 24-column ceiling returns an error, not a thrown exception",
    !gridZeroColumns.ok && !gridTooManyColumns.ok,
    `0: ${JSON.stringify(gridZeroColumns)}, 25: ${JSON.stringify(gridTooManyColumns)}`,
  );

  const gridBoundary = buildGridOutput({ ...BASE_GRID, columnCount: 24 });
  check(
    "flex-grid: the column count ceiling itself (24) is accepted — the error is strictly past it",
    gridBoundary.ok,
    JSON.stringify(gridBoundary),
  );

  const flexGap24 = buildFlexOutput({ ...BASE_FLEX, gapPx: 24 });
  check(
    "flex-grid: the gap written into the CSS panel round-trips back through parseGapDeclaration",
    flexGap24.ok && parseGapDeclaration(flexGap24.css) === 24,
    JSON.stringify(flexGap24),
  );

  check(
    "flex-grid: parseGapDeclaration returns null for a CSS block with no gap line, rather than throwing",
    parseGapDeclaration("display: flex;\nflex-direction: row;") === null,
    "expected null",
  );
};
