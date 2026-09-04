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
import { buildPattern, PATTERN_KINDS, patternUsesAngle, type PatternKind } from "../lib/naxis";

const KIND_LABELS: Record<PatternKind, string> = {
  stripes: "Zolaq",
  checkerboard: "Dama",
  dots: "Nöqtə şəbəkəsi",
  grid: "Xətt şəbəkəsi",
  zigzag: "Ziqzaq",
};

export function NaxisTool() {
  const [kind, setKind] = useState<PatternKind>("stripes");
  const [colorA, setColorA] = useState("#0f1115");
  const [colorB, setColorB] = useState("#5b8def");
  const [stepPx, setStepPx] = useState(24);
  const [angleDeg, setAngleDeg] = useState(45);

  const result = useMemo(
    () => buildPattern({ kind, colorA, colorB, stepPx, angleDeg }),
    [kind, colorA, colorB, stepPx, angleDeg],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Naxış" />
        <div className="flex flex-wrap gap-2 p-4">
          {PATTERN_KINDS.map((item) => (
            <ToolButton key={item} selected={kind === item} onClick={() => setKind(item)}>
              {KIND_LABELS[item]}
            </ToolButton>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Rənglər və ölçü" />
        <div className="grid grid-cols-2 gap-3 p-4 min-[560px]:grid-cols-4">
          <ToolField label="Fon rəngi" htmlFor="naxis-color-a">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Fon rəngi seç"
                value={/^#[0-9a-fA-F]{6}$/.test(colorA) ? colorA : "#0f1115"}
                onChange={(event) => setColorA(event.target.value)}
                className="h-11 w-11 shrink-0 cursor-pointer border border-rule bg-surface p-1"
              />
              <ToolInput
                id="naxis-color-a"
                value={colorA}
                onChange={(event) => setColorA(event.target.value)}
                spellCheck={false}
              />
            </div>
          </ToolField>
          <ToolField label="Naxış rəngi" htmlFor="naxis-color-b">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Naxış rəngi seç"
                value={/^#[0-9a-fA-F]{6}$/.test(colorB) ? colorB : "#5b8def"}
                onChange={(event) => setColorB(event.target.value)}
                className="h-11 w-11 shrink-0 cursor-pointer border border-rule bg-surface p-1"
              />
              <ToolInput
                id="naxis-color-b"
                value={colorB}
                onChange={(event) => setColorB(event.target.value)}
                spellCheck={false}
              />
            </div>
          </ToolField>
          <ToolField label="Addım ölçüsü" htmlFor="naxis-step" suffix="px">
            <ToolInput
              id="naxis-step"
              type="number"
              min={1}
              value={stepPx}
              onChange={(event) => setStepPx(Number(event.target.value))}
            />
          </ToolField>
          {patternUsesAngle(kind) && (
            <ToolField label="Bucaq" htmlFor="naxis-angle" suffix="deg">
              <ToolInput
                id="naxis-angle"
                type="number"
                step={5}
                value={angleDeg}
                onChange={(event) => setAngleDeg(Number(event.target.value))}
              />
            </ToolField>
          )}
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
            <div className="p-4">
              <div
                className="h-40 w-full rounded border border-rule"
                style={{
                  backgroundColor: colorA,
                  backgroundImage: result.backgroundImage ?? undefined,
                  backgroundSize: result.backgroundSize ?? undefined,
                  backgroundPosition: result.backgroundPosition ?? undefined,
                }}
              />
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="background-image"
            action={
              result.backgroundImage && (
                <CopyButton value={`background-image: ${result.backgroundImage};`} />
              )
            }
          >
            <div className="p-4">
              <ToolOutput>{`background-image: ${result.backgroundImage};`}</ToolOutput>
            </div>
          </ToolResultPanel>

          <ToolPanel>
            <ToolPanelHeader
              title="Tam CSS"
              action={result.declaration && <CopyButton value={result.declaration} />}
            />
            <div className="p-4">
              <ToolOutput>{result.declaration}</ToolOutput>
            </div>
          </ToolPanel>
        </>
      )}
    </div>
  );
}
