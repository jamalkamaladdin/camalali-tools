"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
} from "./ui";
import { ToolSegmented } from "./tabs";
import {
  buildClipPath,
  buildPresetShape,
  CLIP_PRESET_LABELS,
  CLIP_PRESETS,
  type CircleConfig,
  type ClipPreset,
  type ClipShape,
  type EllipseConfig,
  type InsetConfig,
  type Point,
} from "../lib/kesim";

type ShapeKind = ClipShape["kind"];

const SHAPE_OPTIONS: { value: ShapeKind; label: string }[] = [
  { value: "polygon", label: "Poliqon" },
  { value: "circle", label: "Dairə" },
  { value: "ellipse", label: "Ellips" },
  { value: "inset", label: "Kənar (inset)" },
];

const DEFAULT_POLYGON: Point[] = buildPresetShape("ucbucaq").kind === "polygon"
  ? (buildPresetShape("ucbucaq") as { kind: "polygon"; points: Point[] }).points
  : [];

const DEFAULT_CIRCLE: CircleConfig = { radius: 40, cx: 50, cy: 50 };
const DEFAULT_ELLIPSE: EllipseConfig = { rx: 40, ry: 30, cx: 50, cy: 50 };
const DEFAULT_INSET: InsetConfig = { top: 10, right: 10, bottom: 10, left: 10, radius: 0 };

function PreviewBox({ clipPath }: { clipPath: string | null }) {
  return (
    <div className="flex justify-center rounded border border-rule bg-paper p-6">
      <div
        aria-hidden
        className="size-48 bg-accent"
        style={{ clipPath: clipPath ?? undefined }}
      />
    </div>
  );
}

function PolygonEditor({
  points,
  onChange,
}: {
  points: Point[];
  onChange: (points: Point[]) => void;
}) {
  const updatePoint = (index: number, axis: "x" | "y", value: number) => {
    onChange(points.map((p, i) => (i === index ? { ...p, [axis]: value } : p)));
  };
  const removePoint = (index: number) => {
    if (points.length <= 3) return;
    onChange(points.filter((_, i) => i !== index));
  };
  const addPoint = () => {
    onChange([...points, { x: 50, y: 50 }]);
  };

  return (
    <div className="space-y-2">
      <ToolLabel>Nöqtələr (%)</ToolLabel>
      <div className="space-y-2">
        {points.map((point, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-ios-footnote text-muted tabular-nums">{index + 1}</span>
            <ToolInput
              type="number"
              aria-label={`${index + 1}-ci nöqtənin x koordinatı`}
              value={point.x}
              onChange={(event) => updatePoint(index, "x", Number(event.target.value))}
              className="tabular-nums"
            />
            <ToolInput
              type="number"
              aria-label={`${index + 1}-ci nöqtənin y koordinatı`}
              value={point.y}
              onChange={(event) => updatePoint(index, "y", Number(event.target.value))}
              className="tabular-nums"
            />
            <ToolButton
              size="chip"
              onClick={() => removePoint(index)}
              disabled={points.length <= 3}
              aria-label={`${index + 1}-ci nöqtəni sil`}
            >
              Sil
            </ToolButton>
          </div>
        ))}
      </div>
      <ToolButton size="chip" onClick={addPoint}>
        Nöqtə əlavə et
      </ToolButton>
    </div>
  );
}

export function KesimTool() {
  const [kind, setKind] = useState<ShapeKind>("polygon");
  const [polygonPoints, setPolygonPoints] = useState<Point[]>(DEFAULT_POLYGON);
  const [circle, setCircle] = useState<CircleConfig>(DEFAULT_CIRCLE);
  const [ellipse, setEllipse] = useState<EllipseConfig>(DEFAULT_ELLIPSE);
  const [inset, setInset] = useState<InsetConfig>(DEFAULT_INSET);

  const shape: ClipShape = useMemo(() => {
    switch (kind) {
      case "polygon":
        return { kind: "polygon", points: polygonPoints };
      case "circle":
        return { kind: "circle", config: circle };
      case "ellipse":
        return { kind: "ellipse", config: ellipse };
      case "inset":
        return { kind: "inset", config: inset };
    }
  }, [kind, polygonPoints, circle, ellipse, inset]);

  const result = useMemo(() => buildClipPath(shape), [shape]);

  const applyPreset = (preset: ClipPreset) => {
    const presetShape = buildPresetShape(preset);
    if (presetShape.kind === "polygon") {
      setKind("polygon");
      setPolygonPoints(presetShape.points);
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Hazır qəliblər" />
        <div className="flex flex-wrap gap-2 p-4">
          {CLIP_PRESETS.map((preset) => (
            <ToolButton key={preset} size="chip" onClick={() => applyPreset(preset)}>
              {CLIP_PRESET_LABELS[preset]}
            </ToolButton>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Forma" />
        <div className="space-y-4 p-4">
          <ToolSegmented
            label="Forma növü"
            options={SHAPE_OPTIONS}
            value={kind}
            onChange={setKind}
          />

          {kind === "polygon" && (
            <PolygonEditor points={polygonPoints} onChange={setPolygonPoints} />
          )}

          {kind === "circle" && (
            <div className="grid grid-cols-1 gap-3 min-[30rem]:grid-cols-3">
              <ToolField label="Radius" htmlFor="kesim-circle-r" suffix="%">
                <ToolInput
                  id="kesim-circle-r"
                  type="number"
                  value={circle.radius}
                  onChange={(event) =>
                    setCircle((prev) => ({ ...prev, radius: Number(event.target.value) }))
                  }
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Mərkəz x" htmlFor="kesim-circle-cx" suffix="%">
                <ToolInput
                  id="kesim-circle-cx"
                  type="number"
                  value={circle.cx}
                  onChange={(event) => setCircle((prev) => ({ ...prev, cx: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Mərkəz y" htmlFor="kesim-circle-cy" suffix="%">
                <ToolInput
                  id="kesim-circle-cy"
                  type="number"
                  value={circle.cy}
                  onChange={(event) => setCircle((prev) => ({ ...prev, cy: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
            </div>
          )}

          {kind === "ellipse" && (
            <div className="grid grid-cols-1 gap-3 min-[30rem]:grid-cols-2 min-[48rem]:grid-cols-4">
              <ToolField label="rx" htmlFor="kesim-ellipse-rx" suffix="%">
                <ToolInput
                  id="kesim-ellipse-rx"
                  type="number"
                  value={ellipse.rx}
                  onChange={(event) => setEllipse((prev) => ({ ...prev, rx: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="ry" htmlFor="kesim-ellipse-ry" suffix="%">
                <ToolInput
                  id="kesim-ellipse-ry"
                  type="number"
                  value={ellipse.ry}
                  onChange={(event) => setEllipse((prev) => ({ ...prev, ry: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Mərkəz x" htmlFor="kesim-ellipse-cx" suffix="%">
                <ToolInput
                  id="kesim-ellipse-cx"
                  type="number"
                  value={ellipse.cx}
                  onChange={(event) => setEllipse((prev) => ({ ...prev, cx: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Mərkəz y" htmlFor="kesim-ellipse-cy" suffix="%">
                <ToolInput
                  id="kesim-ellipse-cy"
                  type="number"
                  value={ellipse.cy}
                  onChange={(event) => setEllipse((prev) => ({ ...prev, cy: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
            </div>
          )}

          {kind === "inset" && (
            <div className="grid grid-cols-1 gap-3 min-[30rem]:grid-cols-3 min-[48rem]:grid-cols-5">
              <ToolField label="Üst" htmlFor="kesim-inset-top" suffix="%">
                <ToolInput
                  id="kesim-inset-top"
                  type="number"
                  value={inset.top}
                  onChange={(event) => setInset((prev) => ({ ...prev, top: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Sağ" htmlFor="kesim-inset-right" suffix="%">
                <ToolInput
                  id="kesim-inset-right"
                  type="number"
                  value={inset.right}
                  onChange={(event) => setInset((prev) => ({ ...prev, right: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Alt" htmlFor="kesim-inset-bottom" suffix="%">
                <ToolInput
                  id="kesim-inset-bottom"
                  type="number"
                  value={inset.bottom}
                  onChange={(event) => setInset((prev) => ({ ...prev, bottom: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Sol" htmlFor="kesim-inset-left" suffix="%">
                <ToolInput
                  id="kesim-inset-left"
                  type="number"
                  value={inset.left}
                  onChange={(event) => setInset((prev) => ({ ...prev, left: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
              <ToolField label="Radius" htmlFor="kesim-inset-radius" suffix="px">
                <ToolInput
                  id="kesim-inset-radius"
                  type="number"
                  value={inset.radius}
                  onChange={(event) => setInset((prev) => ({ ...prev, radius: Number(event.target.value) }))}
                  className="tabular-nums"
                />
              </ToolField>
            </div>
          )}
        </div>
      </ToolPanel>

      {!result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

      {result.ok && (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div className="p-4">
              <PreviewBox clipPath={result.value} />
            </div>
          </ToolPanel>

          <ToolPanel>
            <ToolPanelHeader title="clip-path" action={<CopyButton value={result.value} label="Kopyala" />} />
            <div className="p-3">
              <ToolOutput>{`clip-path: ${result.value};`}</ToolOutput>
            </div>
          </ToolPanel>
        </>
      )}
    </div>
  );
}
