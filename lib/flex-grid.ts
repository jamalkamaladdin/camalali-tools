/**
 * Flexbox and grid layout builder: turns a small set of options into the
 * exact CSS declarations and the matching Tailwind utility class string, in
 * one place, so the two panels the widget shows never drift apart. A visitor
 * who reads `justify-content: space-between` in the CSS panel and
 * `justify-between` in the Tailwind panel is reading the same decision
 * rendered two ways, not two tools' independent opinions about what that
 * decision means — both strings are built from the same `FlexConfig` /
 * `GridConfig` object in this file, never assembled separately.
 *
 * Every visitor-facing option is validated here rather than trusted from the
 * widget's sliders: a slider clamps, but a visitor can still get an invalid
 * pair past it by typing into a number field directly (browsers do not
 * reject `-5` in an `<input type="number" min="0">`), so `buildFlexOutput`
 * and `buildGridOutput` return a `Result` rather than assume their input is
 * already sound.
 */

export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type FlexJustify =
  | "flex-start"
  | "flex-end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type FlexAlignItems = "stretch" | "flex-start" | "flex-end" | "center" | "baseline";
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";

export type FlexConfig = {
  direction: FlexDirection;
  justify: FlexJustify;
  align: FlexAlignItems;
  wrap: FlexWrap;
  gapPx: number;
};

export type GridColumnsMode = "count" | "auto-fit";
export type GridJustifyItems = "start" | "end" | "center" | "stretch";
export type GridAlignItems = "start" | "end" | "center" | "stretch";

export type GridConfig = {
  columnsMode: GridColumnsMode;
  /** Used when `columnsMode` is `"count"`. */
  columnCount: number;
  /** Used when `columnsMode` is `"auto-fit"`. */
  minColumnWidthPx: number;
  /** `0` means "auto" — no `grid-template-rows` is written at all. */
  rowCount: number;
  gapPx: number;
  justifyItems: GridJustifyItems;
  alignItems: GridAlignItems;
};

export type BuildResult = { ok: true; css: string; tailwind: string } | { ok: false; error: string };

const MAX_GRID_COLUMNS = 24;
/** Tailwind ships named `grid-cols-1`…`grid-cols-12`; past that this file falls back to an arbitrary-value class rather than invent classes that do not exist in the framework. */
const MAX_NAMED_GRID_COLUMNS = 12;
const MAX_NAMED_GRID_ROWS = 6;
/** Tailwind's default spacing scale is 4px per step, up to 96 steps (384px). */
const MAX_NAMED_GAP_STEPS = 96;

const FLEX_DIRECTION_CLASS: Record<FlexDirection, string> = {
  row: "flex-row",
  "row-reverse": "flex-row-reverse",
  column: "flex-col",
  "column-reverse": "flex-col-reverse",
};

const FLEX_JUSTIFY_CLASS: Record<FlexJustify, string> = {
  "flex-start": "justify-start",
  "flex-end": "justify-end",
  center: "justify-center",
  "space-between": "justify-between",
  "space-around": "justify-around",
  "space-evenly": "justify-evenly",
};

const FLEX_ALIGN_CLASS: Record<FlexAlignItems, string> = {
  stretch: "items-stretch",
  "flex-start": "items-start",
  "flex-end": "items-end",
  center: "items-center",
  baseline: "items-baseline",
};

const FLEX_WRAP_CLASS: Record<FlexWrap, string> = {
  nowrap: "flex-nowrap",
  wrap: "flex-wrap",
  "wrap-reverse": "flex-wrap-reverse",
};

const GRID_JUSTIFY_ITEMS_CLASS: Record<GridJustifyItems, string> = {
  start: "justify-items-start",
  end: "justify-items-end",
  center: "justify-items-center",
  stretch: "justify-items-stretch",
};

const GRID_ALIGN_ITEMS_CLASS: Record<GridAlignItems, string> = {
  start: "items-start",
  end: "items-end",
  center: "items-center",
  stretch: "items-stretch",
};

/**
 * A gap that lands exactly on Tailwind's 4px spacing scale gets the named
 * class; anything else — an odd number, a value past the named scale — falls
 * back to an arbitrary-value class so the two panels never disagree about
 * the pixel amount.
 */
function gapClass(gapPx: number): string {
  if (gapPx === 0) return "gap-0";
  if (gapPx > 0 && Number.isInteger(gapPx) && gapPx % 4 === 0 && gapPx / 4 <= MAX_NAMED_GAP_STEPS) {
    return `gap-${gapPx / 4}`;
  }
  return `gap-[${gapPx}px]`;
}

/** Reads a `gap: <n>px;` declaration back out of a CSS block built by this file — the round-trip counterpart to the `gap:` line `buildFlexOutput`/`buildGridOutput` always write. */
export function parseGapDeclaration(css: string): number | null {
  const match = /gap:\s*(-?[\d.]+)px;/.exec(css);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function buildFlexOutput(config: FlexConfig): BuildResult {
  if (!Number.isFinite(config.gapPx) || config.gapPx < 0) {
    return { ok: false, error: "Boşluq (gap) mənfi olmayan ədəd olmalıdır." };
  }

  const css = [
    "display: flex;",
    `flex-direction: ${config.direction};`,
    `justify-content: ${config.justify};`,
    `align-items: ${config.align};`,
    `flex-wrap: ${config.wrap};`,
    `gap: ${config.gapPx}px;`,
  ].join("\n");

  const tailwind = [
    "flex",
    FLEX_DIRECTION_CLASS[config.direction],
    FLEX_JUSTIFY_CLASS[config.justify],
    FLEX_ALIGN_CLASS[config.align],
    FLEX_WRAP_CLASS[config.wrap],
    gapClass(config.gapPx),
  ].join(" ");

  return { ok: true, css, tailwind };
}

function gridTemplateColumns(config: GridConfig): string {
  return config.columnsMode === "auto-fit"
    ? `repeat(auto-fit, minmax(${config.minColumnWidthPx}px, 1fr))`
    : `repeat(${config.columnCount}, minmax(0, 1fr))`;
}

function gridColumnsClass(config: GridConfig): string {
  if (config.columnsMode === "auto-fit") {
    return `grid-cols-[repeat(auto-fit,minmax(${config.minColumnWidthPx}px,1fr))]`;
  }
  return config.columnCount <= MAX_NAMED_GRID_COLUMNS
    ? `grid-cols-${config.columnCount}`
    : `grid-cols-[repeat(${config.columnCount},minmax(0,1fr))]`;
}

function gridRowsClass(rowCount: number): string {
  return rowCount <= MAX_NAMED_GRID_ROWS
    ? `grid-rows-${rowCount}`
    : `grid-rows-[repeat(${rowCount},minmax(0,1fr))]`;
}

export function buildGridOutput(config: GridConfig): BuildResult {
  if (config.columnsMode === "count") {
    if (
      !Number.isInteger(config.columnCount) ||
      config.columnCount < 1 ||
      config.columnCount > MAX_GRID_COLUMNS
    ) {
      return {
        ok: false,
        error: `Sütun sayı 1 ilə ${MAX_GRID_COLUMNS} arasında tam ədəd olmalıdır.`,
      };
    }
  } else if (!Number.isFinite(config.minColumnWidthPx) || config.minColumnWidthPx <= 0) {
    return { ok: false, error: "Minimum sütun eni müsbət ədəd olmalıdır." };
  }

  if (!Number.isInteger(config.rowCount) || config.rowCount < 0) {
    return { ok: false, error: "Sətir sayı mənfi olmayan tam ədəd olmalıdır." };
  }
  if (!Number.isFinite(config.gapPx) || config.gapPx < 0) {
    return { ok: false, error: "Boşluq (gap) mənfi olmayan ədəd olmalıdır." };
  }

  const cssLines = ["display: grid;", `grid-template-columns: ${gridTemplateColumns(config)};`];
  if (config.rowCount > 0) {
    cssLines.push(`grid-template-rows: repeat(${config.rowCount}, minmax(0, 1fr));`);
  }
  cssLines.push(
    `gap: ${config.gapPx}px;`,
    `justify-items: ${config.justifyItems};`,
    `align-items: ${config.alignItems};`,
  );

  const tailwindParts = ["grid", gridColumnsClass(config)];
  if (config.rowCount > 0) tailwindParts.push(gridRowsClass(config.rowCount));
  tailwindParts.push(
    gapClass(config.gapPx),
    GRID_JUSTIFY_ITEMS_CLASS[config.justifyItems],
    GRID_ALIGN_ITEMS_CLASS[config.alignItems],
  );

  return { ok: true, css: cssLines.join("\n"), tailwind: tailwindParts.join(" ") };
}
