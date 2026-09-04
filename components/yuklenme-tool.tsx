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
import { buildSpinner, SPINNER_KINDS, type SpinnerKind } from "../lib/yuklenme";

const KIND_LABELS: Record<SpinnerKind, string> = {
  ring: "Halqa",
  dots: "Nöqtələr",
  pulse: "Nəbz",
  skeleton: "Skelet parıltısı",
  bar: "Tərəqqi zolağı",
};

function PreviewMarkup({ kind }: { kind: SpinnerKind }) {
  switch (kind) {
    case "ring":
      return <div className="loader-ring" />;
    case "dots":
      return (
        <div className="loader-dots">
          <span />
          <span />
          <span />
        </div>
      );
    case "pulse":
      return <div className="loader-pulse" />;
    case "skeleton":
      return <div className="loader-skeleton" />;
    case "bar":
      return <div className="loader-bar" />;
  }
}

export function YuklenmeTool() {
  const [kind, setKind] = useState<SpinnerKind>("ring");
  const [sizePx, setSizePx] = useState(40);
  const [color, setColor] = useState("#5b8def");
  const [speedMs, setSpeedMs] = useState(900);

  const result = useMemo(() => buildSpinner({ kind, sizePx, color, speedMs }), [kind, sizePx, color, speedMs]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Növ" />
        <div className="flex flex-wrap gap-2 p-4">
          {SPINNER_KINDS.map((item) => (
            <ToolButton key={item} selected={kind === item} onClick={() => setKind(item)}>
              {KIND_LABELS[item]}
            </ToolButton>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Ölçü, rəng, sürət" />
        <div className="grid grid-cols-3 gap-3 p-4">
          <ToolField label="Ölçü" htmlFor="yuklenme-size" suffix="px">
            <ToolInput
              id="yuklenme-size"
              type="number"
              min={1}
              value={sizePx}
              onChange={(event) => setSizePx(Number(event.target.value))}
            />
          </ToolField>
          <ToolField label="Sürət" htmlFor="yuklenme-speed" suffix="ms">
            <ToolInput
              id="yuklenme-speed"
              type="number"
              min={1}
              step={100}
              value={speedMs}
              onChange={(event) => setSpeedMs(Number(event.target.value))}
            />
          </ToolField>
          <ToolField label="Rəng" htmlFor="yuklenme-color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Rəng seç"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#5b8def"}
                onChange={(event) => setColor(event.target.value)}
                className="h-11 w-11 shrink-0 cursor-pointer border border-rule bg-surface p-1"
              />
              <ToolInput
                id="yuklenme-color"
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
            <div className="flex min-h-32 items-center justify-center p-6">
              <style>{result.css}</style>
              <div className="w-full max-w-64">
                <PreviewMarkup kind={kind} />
              </div>
            </div>
          </ToolPanel>

          <ToolResultPanel title="HTML" action={<CopyButton value={result.html} />}>
            <div className="p-4">
              <ToolOutput>{result.html}</ToolOutput>
            </div>
          </ToolResultPanel>

          <ToolResultPanel title="CSS" action={<CopyButton value={result.css} />}>
            <div className="p-4">
              <ToolOutput>{result.css}</ToolOutput>
            </div>
          </ToolResultPanel>
        </>
      )}
    </div>
  );
}
