"use client";

import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
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
  ToolStat,
} from "./ui";
import {
  createBezier,
  curvePoints,
  EASING_PRESETS,
  solveProgress,
  toCssString,
  type BezierPoint,
  type CubicBezier,
} from "../lib/asanliq";

/* The 0..1 bezier square, mapped into SVG user units with room above and
   below for a curve that overshoots — `easeOutBack`'s peak sits at y = 1.56,
   which is what SIZE and Y0 below were chosen to still show without clipping. */
const SIZE = 160;
const X0 = 40;
const Y0 = 280;
const VIEW_W = 240;
const VIEW_H = 320;

function toSvgX(x: number): number {
  return X0 + x * SIZE;
}
function toSvgY(y: number): number {
  return Y0 - y * SIZE;
}

function pathFrom(points: BezierPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${toSvgX(point.x).toFixed(2)},${toSvgY(point.y).toFixed(2)}`)
    .join(" ");
}

type HandleId = "p1" | "p2";

const DEFAULT_BEZIER: CubicBezier = EASING_PRESETS.find((preset) => preset.id === "ease")!.bezier;

export function AsanliqTool() {
  const [bezier, setBezier] = useState<CubicBezier>(DEFAULT_BEZIER);
  const [progressX, setProgressX] = useState(0.5);
  const [dragging, setDragging] = useState<HandleId | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const clampedPoint = (svgX: number, svgY: number): BezierPoint => {
    const x = Math.min(Math.max((svgX - X0) / SIZE, 0), 1);
    const y = Math.min(Math.max((Y0 - svgY) / SIZE, -1), 2);
    return { x, y };
  };

  /* Reads `svgRef.current` directly inside the event handler it belongs to —
     not through a helper closed over the ref — so the pointer stays a plain
     DOM handle nothing tries to touch outside an actual pointer event. */
  const onP1PointerDown = (event: PointerEvent<SVGCircleElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging("p1");
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    setBezier((prev) => ({ ...prev, p1: clampedPoint(local.x, local.y) }));
  };

  const onP2PointerDown = (event: PointerEvent<SVGCircleElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging("p2");
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    setBezier((prev) => ({ ...prev, p2: clampedPoint(local.x, local.y) }));
  };

  const onSvgPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    setBezier((prev) => ({ ...prev, [dragging]: clampedPoint(local.x, local.y) }));
  };

  const stopDragging = () => setDragging(null);

  const points = useMemo(() => curvePoints(bezier, 64), [bezier]);
  const curvePath = useMemo(() => pathFrom(points), [points]);
  const cssString = useMemo(() => toCssString(bezier), [bezier]);
  const progressY = useMemo(() => solveProgress(progressX, bezier), [progressX, bezier]);

  const setNumber = (handle: HandleId, axis: "x" | "y") => (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    const { bezier: candidate } = createBezier(
      handle === "p1" ? (axis === "x" ? value : bezier.p1.x) : bezier.p1.x,
      handle === "p1" ? (axis === "y" ? value : bezier.p1.y) : bezier.p1.y,
      handle === "p2" ? (axis === "x" ? value : bezier.p2.x) : bezier.p2.x,
      handle === "p2" ? (axis === "y" ? value : bezier.p2.y) : bezier.p2.y,
    );
    if (candidate) setBezier(candidate);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Hazır dəst" hint={`${EASING_PRESETS.length} əyri`} />
        <div className="flex flex-wrap gap-2 p-4">
          {EASING_PRESETS.map((preset) => {
            const selected =
              preset.bezier.p1.x === bezier.p1.x &&
              preset.bezier.p1.y === bezier.p1.y &&
              preset.bezier.p2.x === bezier.p2.x &&
              preset.bezier.p2.y === bezier.p2.y;
            return (
              <ToolButton
                key={preset.id}
                size="chip"
                selected={selected}
                onClick={() => setBezier(preset.bezier)}
              >
                {preset.label}
              </ToolButton>
            );
          })}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Əyri" hint="nöqtələri sürüşdür" />
        <div className="grid grid-cols-1 gap-4 p-4 min-[560px]:grid-cols-[auto_1fr]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width={VIEW_W}
            height={VIEW_H}
            className="touch-none select-none justify-self-center"
            onPointerMove={onSvgPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            role="img"
            aria-label="Cubic-bezier əyrisi"
          >
            <rect
              x={X0}
              y={toSvgY(1)}
              width={SIZE}
              height={SIZE}
              fill="none"
              stroke="var(--color-rule)"
              strokeWidth={1}
            />
            <line
              x1={toSvgX(0)}
              y1={toSvgY(0)}
              x2={toSvgX(bezier.p1.x)}
              y2={toSvgY(bezier.p1.y)}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <line
              x1={toSvgX(1)}
              y1={toSvgY(1)}
              x2={toSvgX(bezier.p2.x)}
              y2={toSvgY(bezier.p2.y)}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <path d={curvePath} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
            <circle
              cx={toSvgX(progressX)}
              cy={toSvgY(progressY)}
              r={4}
              fill="var(--color-ink)"
            />
            <circle
              cx={toSvgX(bezier.p1.x)}
              cy={toSvgY(bezier.p1.y)}
              r={7}
              className="cursor-grab"
              fill="var(--color-accent)"
              onPointerDown={onP1PointerDown}
            />
            <circle
              cx={toSvgX(bezier.p2.x)}
              cy={toSvgY(bezier.p2.y)}
              r={7}
              className="cursor-grab"
              fill="var(--color-accent)"
              onPointerDown={onP2PointerDown}
            />
          </svg>

          <div className="grid grid-cols-2 gap-3 self-start">
            <ToolField label="p1 x" htmlFor="asanliq-p1x">
              <ToolInput
                id="asanliq-p1x"
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={bezier.p1.x}
                onChange={setNumber("p1", "x")}
              />
            </ToolField>
            <ToolField label="p1 y" htmlFor="asanliq-p1y">
              <ToolInput
                id="asanliq-p1y"
                type="number"
                step={0.01}
                value={bezier.p1.y}
                onChange={setNumber("p1", "y")}
              />
            </ToolField>
            <ToolField label="p2 x" htmlFor="asanliq-p2x">
              <ToolInput
                id="asanliq-p2x"
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={bezier.p2.x}
                onChange={setNumber("p2", "x")}
              />
            </ToolField>
            <ToolField label="p2 y" htmlFor="asanliq-p2y">
              <ToolInput
                id="asanliq-p2y"
                type="number"
                step={0.01}
                value={bezier.p2.y}
                onChange={setNumber("p2", "y")}
              />
            </ToolField>

            <div className="col-span-2">
              <ToolField label="Vaxt nöqtəsi" htmlFor="asanliq-progress" hint={`${Math.round(progressX * 100)}%`}>
                <input
                  id="asanliq-progress"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={progressX}
                  onChange={(event) => setProgressX(Number(event.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
              </ToolField>
            </div>
          </div>
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="cubic-bezier()"
        action={<CopyButton value={cssString} />}
      >
        <div className="space-y-3 p-4">
          <ToolOutput>{cssString}</ToolOutput>
          <ToolStat
            label="Bu vaxt nöqtəsində irəliləmə"
            value={progressY.toFixed(3)}
            note={`Vaxtın ${Math.round(progressX * 100)}%-ində element yolunun ${(progressY * 100).toFixed(1)}%-ni keçib.`}
          />
        </div>
      </ToolResultPanel>

      <ToolNote tone="info">
        x1 və x2 0–1 aralığında saxlanılır — kənara çıxan qiymət avtomatik ən yaxın sərhədə çəkilir. y sərhədsizdir, ona görə əyri hədəfi keçib geri qayıda bilər.
      </ToolNote>
    </div>
  );
}
