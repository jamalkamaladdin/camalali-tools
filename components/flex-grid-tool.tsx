"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolSelect,
} from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  buildFlexOutput,
  buildGridOutput,
  type FlexAlignItems,
  type FlexConfig,
  type FlexDirection,
  type FlexJustify,
  type FlexWrap,
  type GridAlignItems,
  type GridConfig,
  type GridJustifyItems,
} from "../lib/flex-grid";

const DEFAULT_ITEM_COUNT = 6;
const MIN_ITEMS = 1;
const MAX_ITEMS = 12;

function PreviewBox({ index }: { index: number }) {
  return (
    <div
      className="flex h-16 min-w-16 items-center justify-center rounded border border-rule bg-result font-mono text-ios-footnote text-muted"
      style={{ flexBasis: "4rem" }}
    >
      {index + 1}
    </div>
  );
}

function ItemCountField({
  id,
  count,
  onChange,
}: {
  id: string;
  count: number;
  onChange: (value: number) => void;
}) {
  return (
    <ToolField label="Element sayı" htmlFor={id}>
      <ToolInput
        id={id}
        type="number"
        inputMode="numeric"
        min={MIN_ITEMS}
        max={MAX_ITEMS}
        value={count}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isInteger(next)) onChange(Math.min(MAX_ITEMS, Math.max(MIN_ITEMS, next)));
        }}
        className="tabular-nums"
      />
    </ToolField>
  );
}

function OutputPanel({ css, tailwind }: { css: string; tailwind: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[48rem]:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-ios-footnote text-muted">CSS</p>
          <CopyButton value={css} label="CSS kopyala" />
        </div>
        <ToolOutput>{css}</ToolOutput>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-ios-footnote text-muted">Tailwind</p>
          <CopyButton value={tailwind} label="Sinif sətrini kopyala" />
        </div>
        <ToolOutput>{tailwind}</ToolOutput>
      </div>
    </div>
  );
}

function FlexPane() {
  const [itemCount, setItemCount] = useState(DEFAULT_ITEM_COUNT);
  const [config, setConfig] = useState<FlexConfig>({
    direction: "row",
    justify: "flex-start",
    align: "stretch",
    wrap: "wrap",
    gapPx: 12,
  });

  const result = useMemo(() => buildFlexOutput(config), [config]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[36rem]:grid-cols-2 min-[62rem]:grid-cols-3">
        <ToolField label="flex-direction" htmlFor="flex-direction">
          <ToolSelect
            id="flex-direction"
            value={config.direction}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, direction: event.target.value as FlexDirection }))
            }
          >
            <option value="row">row</option>
            <option value="row-reverse">row-reverse</option>
            <option value="column">column</option>
            <option value="column-reverse">column-reverse</option>
          </ToolSelect>
        </ToolField>
        <ToolField label="justify-content" htmlFor="flex-justify">
          <ToolSelect
            id="flex-justify"
            value={config.justify}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, justify: event.target.value as FlexJustify }))
            }
          >
            <option value="flex-start">flex-start</option>
            <option value="flex-end">flex-end</option>
            <option value="center">center</option>
            <option value="space-between">space-between</option>
            <option value="space-around">space-around</option>
            <option value="space-evenly">space-evenly</option>
          </ToolSelect>
        </ToolField>
        <ToolField label="align-items" htmlFor="flex-align">
          <ToolSelect
            id="flex-align"
            value={config.align}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, align: event.target.value as FlexAlignItems }))
            }
          >
            <option value="stretch">stretch</option>
            <option value="flex-start">flex-start</option>
            <option value="flex-end">flex-end</option>
            <option value="center">center</option>
            <option value="baseline">baseline</option>
          </ToolSelect>
        </ToolField>
        <ToolField label="flex-wrap" htmlFor="flex-wrap">
          <ToolSelect
            id="flex-wrap"
            value={config.wrap}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, wrap: event.target.value as FlexWrap }))
            }
          >
            <option value="nowrap">nowrap</option>
            <option value="wrap">wrap</option>
            <option value="wrap-reverse">wrap-reverse</option>
          </ToolSelect>
        </ToolField>
        <ToolField label="gap" htmlFor="flex-gap" suffix="px">
          <ToolInput
            id="flex-gap"
            type="number"
            inputMode="numeric"
            min={0}
            value={config.gapPx}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, gapPx: Number(event.target.value) }))
            }
            className="tabular-nums"
          />
        </ToolField>
        <ItemCountField id="flex-items" count={itemCount} onChange={setItemCount} />
      </div>

      {!result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

      {result.ok && (
        <>
          <div
            className="min-h-40 rounded border border-rule bg-paper p-3"
            style={{
              display: "flex",
              flexDirection: config.direction,
              justifyContent: config.justify,
              alignItems: config.align,
              flexWrap: config.wrap,
              gap: `${config.gapPx}px`,
            }}
          >
            {Array.from({ length: itemCount }, (_, i) => (
              <PreviewBox key={i} index={i} />
            ))}
          </div>
          <OutputPanel css={result.css} tailwind={result.tailwind} />
        </>
      )}
    </div>
  );
}

function GridPane() {
  const [itemCount, setItemCount] = useState(DEFAULT_ITEM_COUNT);
  const [config, setConfig] = useState<GridConfig>({
    columnsMode: "count",
    columnCount: 3,
    minColumnWidthPx: 160,
    rowCount: 0,
    gapPx: 12,
    justifyItems: "stretch",
    alignItems: "stretch",
  });

  const result = useMemo(() => buildGridOutput(config), [config]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[36rem]:grid-cols-2 min-[62rem]:grid-cols-3">
        <ToolField label="Sütun rejimi" htmlFor="grid-mode">
          <ToolSelect
            id="grid-mode"
            value={config.columnsMode}
            onChange={(event) =>
              setConfig((prev) => ({
                ...prev,
                columnsMode: event.target.value as GridConfig["columnsMode"],
              }))
            }
          >
            <option value="count">sabit sayla</option>
            <option value="auto-fit">auto-fit minmax()</option>
          </ToolSelect>
        </ToolField>

        {config.columnsMode === "count" ? (
          <ToolField label="Sütun sayı" htmlFor="grid-columns">
            <ToolInput
              id="grid-columns"
              type="number"
              inputMode="numeric"
              min={1}
              max={24}
              value={config.columnCount}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, columnCount: Number(event.target.value) }))
              }
              className="tabular-nums"
            />
          </ToolField>
        ) : (
          <ToolField label="Minimum sütun eni" htmlFor="grid-min-width" suffix="px">
            <ToolInput
              id="grid-min-width"
              type="number"
              inputMode="numeric"
              min={1}
              value={config.minColumnWidthPx}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, minColumnWidthPx: Number(event.target.value) }))
              }
              className="tabular-nums"
            />
          </ToolField>
        )}

        <ToolField label="Sətir sayı" htmlFor="grid-rows" hint="0 = avtomatik">
          <ToolInput
            id="grid-rows"
            type="number"
            inputMode="numeric"
            min={0}
            value={config.rowCount}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, rowCount: Number(event.target.value) }))
            }
            className="tabular-nums"
          />
        </ToolField>

        <ToolField label="gap" htmlFor="grid-gap" suffix="px">
          <ToolInput
            id="grid-gap"
            type="number"
            inputMode="numeric"
            min={0}
            value={config.gapPx}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, gapPx: Number(event.target.value) }))
            }
            className="tabular-nums"
          />
        </ToolField>

        <ToolField label="justify-items" htmlFor="grid-justify-items">
          <ToolSelect
            id="grid-justify-items"
            value={config.justifyItems}
            onChange={(event) =>
              setConfig((prev) => ({
                ...prev,
                justifyItems: event.target.value as GridJustifyItems,
              }))
            }
          >
            <option value="start">start</option>
            <option value="end">end</option>
            <option value="center">center</option>
            <option value="stretch">stretch</option>
          </ToolSelect>
        </ToolField>

        <ToolField label="align-items" htmlFor="grid-align-items">
          <ToolSelect
            id="grid-align-items"
            value={config.alignItems}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, alignItems: event.target.value as GridAlignItems }))
            }
          >
            <option value="start">start</option>
            <option value="end">end</option>
            <option value="center">center</option>
            <option value="stretch">stretch</option>
          </ToolSelect>
        </ToolField>

        <ItemCountField id="grid-items" count={itemCount} onChange={setItemCount} />
      </div>

      {!result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

      {result.ok && (
        <>
          <div
            className="min-h-40 rounded border border-rule bg-paper p-3"
            style={{
              display: "grid",
              gridTemplateColumns:
                config.columnsMode === "auto-fit"
                  ? `repeat(auto-fit, minmax(${config.minColumnWidthPx}px, 1fr))`
                  : `repeat(${config.columnCount}, minmax(0, 1fr))`,
              gridTemplateRows: config.rowCount > 0 ? `repeat(${config.rowCount}, minmax(0, 1fr))` : undefined,
              gap: `${config.gapPx}px`,
              justifyItems: config.justifyItems,
              alignItems: config.alignItems,
            }}
          >
            {Array.from({ length: itemCount }, (_, i) => (
              <PreviewBox key={i} index={i} />
            ))}
          </div>
          <OutputPanel css={result.css} tailwind={result.tailwind} />
        </>
      )}
    </div>
  );
}

export function FlexGridTool() {
  const tabs: ToolTabItem[] = [
    { id: "flex", label: "Flexbox", content: <FlexPane /> },
    { id: "grid", label: "Grid", content: <GridPane /> },
  ];

  return (
    <div className="mt-8">
      <ToolPanel>
        <ToolPanelHeader title="Düzüm" />
        <div className="p-4">
          <ToolTabs items={tabs} idPrefix="flex-grid" />
        </div>
      </ToolPanel>
    </div>
  );
}
