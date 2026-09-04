"use client";

import { useId, useMemo, useState } from "react";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { ToolTabs } from "./tabs";
import {
  buildAllowedCurve,
  computeRateLimit,
  DEFAULT_RATE_LIMIT_INPUT,
  tokenBucketAdmit,
  type AllowedCurvePoint,
} from "../lib/rate-limit";

function parseNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("az-AZ");
}

function formatSeconds(value: number): string {
  if (value < 1) return `${(value * 1000).toFixed(0)} ms`;
  return `${value.toFixed(1)} san`;
}

/* ---------- the hand-drawn "allowed over time" chart ---------- */

const CHART_WIDTH = 340;
const CHART_HEIGHT = 160;
const CHART_PAD = 30;

function AllowedCurveChart({ points, windowSeconds, windowLimit }: { points: AllowedCurvePoint[]; windowSeconds: number; windowLimit: number }) {
  const maxT = points[points.length - 1]?.t || 1;
  const maxY = Math.max(...points.map((p) => Math.max(p.fixed, p.sliding, p.tokenBucket)), 1);

  const x = (t: number) => CHART_PAD + (t / maxT) * (CHART_WIDTH - 2 * CHART_PAD);
  const y = (v: number) => CHART_HEIGHT - CHART_PAD - (v / maxY) * (CHART_HEIGHT - 2 * CHART_PAD);
  const boundaryX = x(windowSeconds);

  const path = (key: "fixed" | "sliding" | "tokenBucket") =>
    points.map((p) => `${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full" aria-hidden>
      <line x1={CHART_PAD} y1={CHART_HEIGHT - CHART_PAD} x2={CHART_WIDTH - CHART_PAD} y2={CHART_HEIGHT - CHART_PAD} stroke="currentColor" className="text-muted-2" strokeWidth="1" />
      <line x1={CHART_PAD} y1={CHART_PAD} x2={CHART_PAD} y2={CHART_HEIGHT - CHART_PAD} stroke="currentColor" className="text-muted-2" strokeWidth="1" />

      <line x1={boundaryX} y1={CHART_PAD} x2={boundaryX} y2={CHART_HEIGHT - CHART_PAD} stroke="currentColor" className="text-muted-2" strokeWidth="1" strokeDasharray="3 3" />
      <text x={boundaryX} y={CHART_PAD - 6} fontSize="9" textAnchor="middle" className="fill-muted">
        pəncərə sərhədi
      </text>

      <polyline points={path("fixed")} fill="none" stroke="currentColor" className="text-muted-2" strokeWidth="2" />
      <polyline points={path("sliding")} fill="none" stroke="currentColor" className="text-accent" strokeWidth="2" />
      <polyline points={path("tokenBucket")} fill="none" stroke="currentColor" className="text-ink" strokeWidth="1.5" strokeDasharray="4 2" />

      <text x={CHART_WIDTH - CHART_PAD} y={CHART_HEIGHT - CHART_PAD + 14} fontSize="9" textAnchor="end" className="fill-muted">
        {formatCount(windowSeconds * 2)}san
      </text>
      <text x={CHART_PAD} y={CHART_HEIGHT - CHART_PAD + 14} fontSize="9" textAnchor="start" className="fill-muted">
        0san
      </text>
      <text x={CHART_PAD - 4} y={y(windowLimit)} fontSize="9" textAnchor="end" className="fill-muted">
        {formatCount(windowLimit)}
      </text>
    </svg>
  );
}

export function RateLimitTool() {
  const idPrefix = useId();

  const [ratePerSecond, setRatePerSecond] = useState(String(DEFAULT_RATE_LIMIT_INPUT.ratePerSecond));
  const [burstCapacity, setBurstCapacity] = useState(String(DEFAULT_RATE_LIMIT_INPUT.burstCapacity));
  const [windowSeconds, setWindowSeconds] = useState(String(DEFAULT_RATE_LIMIT_INPUT.windowSeconds));
  const [userCount, setUserCount] = useState(String(DEFAULT_RATE_LIMIT_INPUT.userCount));
  const [incomingBurst, setIncomingBurst] = useState(String(DEFAULT_RATE_LIMIT_INPUT.burstCapacity * 3));

  const result = useMemo(
    () =>
      computeRateLimit({
        ratePerSecond: parseNumber(ratePerSecond),
        burstCapacity: parseNumber(burstCapacity),
        windowSeconds: parseNumber(windowSeconds),
        userCount: Math.round(parseNumber(userCount)),
      }),
    [ratePerSecond, burstCapacity, windowSeconds, userCount],
  );

  const burstResult = useMemo(
    () => tokenBucketAdmit(parseNumber(burstCapacity), parseNumber(incomingBurst)),
    [burstCapacity, incomingBurst],
  );

  const curve = useMemo(() => {
    if (!result.ok) return [];
    return buildAllowedCurve({
      windowSeconds: parseNumber(windowSeconds),
      windowLimit: result.windowLimit,
      tokenBucketCapacity: result.tokenBucket.capacity,
      refillRatePerSecond: result.tokenBucket.refillRatePerSecond,
    });
  }, [result, windowSeconds]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Hədd" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <ToolField label="İcazə verilən sürət" htmlFor={`${idPrefix}-rate`} suffix="sorğu/san">
            <ToolInput id={`${idPrefix}-rate`} inputMode="decimal" value={ratePerSecond} onChange={(e) => setRatePerSecond(e.target.value)} />
          </ToolField>
          <ToolField label="Partlayış (burst) ölçüsü" htmlFor={`${idPrefix}-burst`} suffix="sorğu">
            <ToolInput id={`${idPrefix}-burst`} inputMode="decimal" value={burstCapacity} onChange={(e) => setBurstCapacity(e.target.value)} />
          </ToolField>
          <ToolField label="Pəncərə uzunluğu" htmlFor={`${idPrefix}-window`} suffix="san">
            <ToolInput id={`${idPrefix}-window`} inputMode="decimal" value={windowSeconds} onChange={(e) => setWindowSeconds(e.target.value)} />
          </ToolField>
          <ToolField label="İstifadəçi sayı" htmlFor={`${idPrefix}-users`} suffix="istifadəçi">
            <ToolInput id={`${idPrefix}-users`} inputMode="numeric" min={1} step={1} value={userCount} onChange={(e) => setUserCount(e.target.value)} />
          </ToolField>
        </div>
      </ToolPanel>

      {result.ok ? (
        <ToolResultPanel title="Nəticə" hint={`${formatCount(result.windowLimit)} sorğu / pəncərə`}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <ToolStat label="Pəncərə həddi" value={formatCount(result.windowLimit)} />
            <ToolStat label="Saatlıq hədd" value={formatCount(result.hourlyLimit)} />
            <ToolStat label="Günlük hədd" value={formatCount(result.dailyLimit)} />
            <ToolStat
              label="N istifadəçi üçün ümumi yük"
              value={`${formatCount(result.totalLoadPerSecondForUsers)}/san`}
              note={`${userCount} istifadəçi`}
            />
          </div>

          <div className="p-4 pt-0">
            <ToolTabs
              idPrefix={`${idPrefix}-algos`}
              items={[
                {
                  id: "token-bucket",
                  label: "Token bucket",
                  content: (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <ToolStat label="Tutum" value={formatCount(result.tokenBucket.capacity)} />
                        <ToolStat label="Doldurma sürəti" value={`${formatCount(result.tokenBucket.refillRatePerSecond)}/san`} />
                        <ToolStat label="Boş vedrənin dolma vaxtı" value={formatSeconds(result.tokenBucket.emptyToFullSeconds)} />
                      </div>
                      <ToolField
                        label="Gələn partlayış sına"
                        htmlFor={`${idPrefix}-incoming`}
                        suffix="sorğu (bir anda)"
                      >
                        <ToolInput id={`${idPrefix}-incoming`} inputMode="numeric" value={incomingBurst} onChange={(e) => setIncomingBurst(e.target.value)} />
                      </ToolField>
                      <div className="grid grid-cols-2 gap-3">
                        <ToolStat label="Buraxılan" value={formatCount(burstResult.granted)} />
                        <ToolStat label="Rədd edilən" value={formatCount(burstResult.rejected)} tone={burstResult.rejected > 0 ? "warning" : "default"} />
                      </div>
                      <ToolNote>
                        Vedrə heç vaxt tutumundan çox buraxmır: partlayış nə qədər böyük olsa da, bir anda ən çox{" "}
                        {formatCount(result.tokenBucket.capacity)} sorğu keçir, qalanı sıradan kənarda qalıb rədd olunur (növbəyə düşmür).
                      </ToolNote>
                    </div>
                  ),
                },
                {
                  id: "sliding-window",
                  label: "Sürüşən pəncərə",
                  content: (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <ToolStat label="Pəncərə həddi" value={formatCount(result.slidingWindow.windowLimit)} />
                        <ToolStat
                          label="Sərhəddə buraxılan (əlavə)"
                          value={formatCount(result.slidingWindow.boundaryEstimate)}
                          note="əvvəlki pəncərə tam çəki daşıyır"
                        />
                      </div>
                      <ToolNote>
                        Əvvəlki və cari pəncərənin sayğacları çəkili orta ilə birləşir: sərhəd anında (elapsed=0)
                        çəki hələ tamamilə əvvəlki pəncərəyə aiddir, ona görə həmin an üçün əlavə sorğuya yer qalmır.
                      </ToolNote>
                    </div>
                  ),
                },
                {
                  id: "fixed-window",
                  label: "Sabit pəncərə",
                  content: (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <ToolStat label="Pəncərə həddi" value={formatCount(result.fixedWindow.windowLimit)} />
                        <ToolStat
                          label="Sərhəddə mümkün cəm"
                          value={formatCount(result.fixedWindow.boundaryBurstAllowed)}
                          tone="warning"
                          note="2 × pəncərə həddi"
                        />
                      </div>
                      <ToolNote tone="accent">
                        Ən sadə, ən qüsurlu üsul: sayğac hər pəncərədə sıfırdan başlayır və əvvəlkini unudur. Bir
                        pəncərənin son anında tam hədd, sonra dərhal yeni pəncərənin ilk anında yenə tam hədd
                        keçə bilər: qısa bir intervalda hədddən iki qat çox sorğu.
                      </ToolNote>
                    </div>
                  ),
                },
              ]}
            />
          </div>

          {curve.length > 0 && (
            <div className="p-4 pt-0">
              <ToolPanelHeader title="Zamanla buraxılan sorğular" hint="doymuş tələb fərziyyəsi ilə" />
              <div className="p-3">
                <AllowedCurveChart points={curve} windowSeconds={parseNumber(windowSeconds)} windowLimit={result.windowLimit} />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ios-footnote text-muted">
                  <span className="text-ink">— — sabit pəncərə</span>
                  <span className="text-accent-text">— sürüşən pəncərə</span>
                  <span>┄ token bucket</span>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 pt-0">
            <ToolPanelHeader title="Nümunə başlıqlar" hint="vedrə boşdur ssenarisi" />
            <div className="p-3">
              <ToolOutput>
                {`X-RateLimit-Limit: ${result.headers.limit}
X-RateLimit-Remaining: ${result.headers.remaining}
X-RateLimit-Reset: ${result.headers.resetSeconds}
Retry-After: ${result.headers.retryAfterSeconds}`}
              </ToolOutput>
            </div>
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{result.error}</ToolNote>
      )}
    </div>
  );
}
