"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";
import { buildTriangle, TRIANGLE_DIRECTIONS, type TriangleDirection } from "../lib/ucbucaq";

const DIRECTION_LABELS: Record<TriangleDirection, string> = {
  up: "▲ yuxarı",
  down: "▼ aşağı",
  left: "◀ sol",
  right: "▶ sağ",
  "top-left": "◤ yuxarı-sol",
  "top-right": "◥ yuxarı-sağ",
  "bottom-left": "◣ aşağı-sol",
  "bottom-right": "◢ aşağı-sağ",
};

export function UcbucaqTool() {
  const [direction, setDirection] = useState<TriangleDirection>("up");
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(80);
  const [color, setColor] = useState("#5b8def");

  const result = useMemo(() => buildTriangle(direction, width, height, color), [direction, width, height, color]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="İstiqamət" />
        <div className="grid grid-cols-4 gap-2 p-4">
          {TRIANGLE_DIRECTIONS.map((item) => (
            <ToolButton key={item} selected={direction === item} onClick={() => setDirection(item)}>
              {DIRECTION_LABELS[item]}
            </ToolButton>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Ölçü və rəng" />
        <div className="grid grid-cols-3 gap-3 p-4">
          <ToolField label="En" htmlFor="ucbucaq-width" suffix="px">
            <ToolInput
              id="ucbucaq-width"
              type="number"
              min={1}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            />
          </ToolField>
          <ToolField label="Hündürlük" htmlFor="ucbucaq-height" suffix="px">
            <ToolInput
              id="ucbucaq-height"
              type="number"
              min={1}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
          </ToolField>
          <ToolField label="Rəng" htmlFor="ucbucaq-color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Rəng seç"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#5b8def"}
                onChange={(event) => setColor(event.target.value)}
                className="h-11 w-11 shrink-0 cursor-pointer border border-rule bg-surface p-1"
              />
              <ToolInput
                id="ucbucaq-color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                spellCheck={false}
              />
            </div>
          </ToolField>
        </div>
      </ToolPanel>

      {result.errors.length > 0 ? (
        <ToolNote tone="accent" title="Düzəlt">
          <ul className="list-disc space-y-1 pl-4">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </ToolNote>
      ) : (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div className="flex min-h-40 items-center justify-center p-6">
              {result.borders && (
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderStyle: "solid",
                    borderWidth: `${result.borders.width.top}px ${result.borders.width.right}px ${result.borders.width.bottom}px ${result.borders.width.left}px`,
                    borderColor: `${result.borders.colored.top ? color : "transparent"} ${result.borders.colored.right ? color : "transparent"} ${result.borders.colored.bottom ? color : "transparent"} ${result.borders.colored.left ? color : "transparent"}`,
                  }}
                />
              )}
            </div>
          </ToolPanel>

          <ToolResultPanel title="border üsulu" action={result.borderCss && <CopyButton value={result.borderCss} />}>
            <div className="p-4">
              <ToolOutput>{result.borderCss}</ToolOutput>
            </div>
          </ToolResultPanel>

          <ToolPanel>
            <ToolPanelHeader
              title="clip-path alternativi"
              action={result.clipPathCss && <CopyButton value={result.clipPathCss} />}
            />
            <div className="p-4">
              <ToolOutput>{result.clipPathCss}</ToolOutput>
            </div>
          </ToolPanel>
        </>
      )}
    </div>
  );
}
