"use client";

import { useId, useMemo, useState } from "react";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { computeQueue, DEFAULT_QUEUE_INPUT, queueLengthCurve } from "../lib/novbe";

function parseNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function formatMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} san`;
}

/* ---------- the hand-drawn ρ → queue-length curve ---------- */

const CHART_WIDTH = 300;
const CHART_HEIGHT = 140;
const CHART_PAD = 24;
const CHART_Y_MAX = 10; // visual cap: the curve is clipped above this, which is the point — it keeps climbing off the chart

function chartX(rho: number): number {
  return CHART_PAD + rho * (CHART_WIDTH - 2 * CHART_PAD);
}
function chartY(queueLength: number): number {
  const clamped = Math.min(queueLength, CHART_Y_MAX);
  return CHART_PAD + (1 - clamped / CHART_Y_MAX) * (CHART_HEIGHT - 2 * CHART_PAD);
}

/** The same `ρ²/(1-ρ)` shape used for the reference curve, evaluated once at the visitor's own ρ — for the "buradasan" dot, not for the stat tiles. */
function illustrativeQueueLength(rho: number): number {
  return (rho * rho) / (1 - rho);
}

function QueueCurve({ rho, stable }: { rho: number; stable: boolean }) {
  const points = useMemo(() => queueLengthCurve(), []);
  const path = points.map((p) => `${chartX(p.rho).toFixed(1)},${chartY(p.queueLength).toFixed(1)}`).join(" ");
  const seventyX = chartX(0.7);
  const markerRho = Math.min(rho, 0.985);
  const markerY = chartY(illustrativeQueueLength(markerRho));

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full text-accent" aria-hidden>
      {/* axes */}
      <line
        x1={CHART_PAD}
        y1={CHART_HEIGHT - CHART_PAD}
        x2={CHART_WIDTH - CHART_PAD}
        y2={CHART_HEIGHT - CHART_PAD}
        stroke="currentColor"
        className="text-muted-2"
        strokeWidth="1"
      />
      <line
        x1={CHART_PAD}
        y1={CHART_PAD}
        x2={CHART_PAD}
        y2={CHART_HEIGHT - CHART_PAD}
        stroke="currentColor"
        className="text-muted-2"
        strokeWidth="1"
      />
      {/* 70% utilization marker */}
      <line
        x1={seventyX}
        y1={CHART_PAD}
        x2={seventyX}
        y2={CHART_HEIGHT - CHART_PAD}
        stroke="currentColor"
        className="text-muted-2"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text x={seventyX} y={CHART_PAD - 6} fontSize="9" textAnchor="middle" className="fill-muted">
        70%
      </text>
      {/* the curve */}
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* current ρ */}
      {rho > 0 && (
        <circle
          cx={chartX(markerRho)}
          cy={markerY}
          r="4"
          fill="currentColor"
          strokeWidth="1.5"
          style={{ stroke: "var(--color-result)" }}
        />
      )}
      <text x={CHART_WIDTH - CHART_PAD} y={CHART_HEIGHT - CHART_PAD + 14} fontSize="9" textAnchor="end" className="fill-muted">
        ρ = 100%
      </text>
      <text x={CHART_PAD} y={CHART_HEIGHT - CHART_PAD + 14} fontSize="9" textAnchor="start" className="fill-muted">
        ρ = 0%
      </text>
      {!stable && (
        <text x={CHART_WIDTH - CHART_PAD} y={CHART_PAD - 6} fontSize="9" textAnchor="end" className="fill-muted">
          → sonsuz
        </text>
      )}
    </svg>
  );
}

export function NovbeTool() {
  const idPrefix = useId();
  const [arrivalText, setArrivalText] = useState(String(DEFAULT_QUEUE_INPUT.arrivalRate));
  const [serviceText, setServiceText] = useState(String(DEFAULT_QUEUE_INPUT.serviceTimeMs));
  const [serversText, setServersText] = useState(String(DEFAULT_QUEUE_INPUT.servers));

  const result = useMemo(
    () =>
      computeQueue({
        arrivalRate: parseNumber(arrivalText),
        serviceTimeMs: parseNumber(serviceText),
        servers: Math.round(parseNumber(serversText)),
      }),
    [arrivalText, serviceText, serversText],
  );

  const rho = result.ok ? result.rho : 0;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Sistem" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <ToolField label="Gəliş sürəti (λ)" htmlFor={`${idPrefix}-lambda`} suffix="sorğu/san">
            <ToolInput
              id={`${idPrefix}-lambda`}
              inputMode="decimal"
              value={arrivalText}
              onChange={(event) => setArrivalText(event.target.value)}
            />
          </ToolField>
          <ToolField label="Xidmət vaxtı" htmlFor={`${idPrefix}-service`} suffix="ms">
            <ToolInput
              id={`${idPrefix}-service`}
              inputMode="decimal"
              value={serviceText}
              onChange={(event) => setServiceText(event.target.value)}
            />
          </ToolField>
          <ToolField label="Server sayı" htmlFor={`${idPrefix}-servers`}>
            <ToolInput
              id={`${idPrefix}-servers`}
              inputMode="numeric"
              min={1}
              step={1}
              value={serversText}
              onChange={(event) => setServersText(event.target.value)}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {result.ok && result.stable ? (
        <ToolResultPanel title="Nəticə" hint={`ρ = ${(result.rho * 100).toFixed(1)}%`}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <ToolStat
              label="Utilization (ρ)"
              value={`${(result.rho * 100).toFixed(1)}%`}
              tone={result.rho > 0.7 ? "warning" : "default"}
            />
            <ToolStat label="Növbədə orta sorğu (Lq)" value={result.queueLength.toFixed(2)} />
            <ToolStat label="Sistemdə orta sorğu (L)" value={result.systemLength.toFixed(2)} note="Little: L = λW" />
            <ToolStat label="Növbədə orta gözləmə (Wq)" value={formatMs(result.queueWaitSec)} />
            <ToolStat label="Sistemdə orta vaxt (W)" value={formatMs(result.systemTimeSec)} />
            <ToolStat label="Server sayı" value={String(result.servers)} />
          </div>
          <div className="p-4 pt-0">
            <QueueCurve rho={result.rho} stable />
          </div>
        </ToolResultPanel>
      ) : result.ok && !result.stable ? (
        <ToolResultPanel title="Nəticə" hint={`ρ = ${(result.rho * 100).toFixed(1)}%`}>
          <div className="p-4">
            <ToolNote tone="accent" title="Növbə sabitləşmir">
              {result.reason}
            </ToolNote>
          </div>
          <div className="p-4 pt-0">
            <QueueCurve rho={Math.min(rho, 0.99)} stable={false} />
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{!result.ok ? result.error : ""}</ToolNote>
      )}
    </div>
  );
}
