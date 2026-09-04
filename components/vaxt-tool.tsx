"use client";

import { useMemo, useState } from "react";
import { formatRelative } from "../shared/az-date";
import {
  describeTimestamp,
  nowTimestampSeconds,
  parseTimestamp,
  timestampFromLocalInput,
  type TimestampBreakdown,
  type TimestampParseResult,
  type TimestampFromDateResult,
  type Zone,
} from "../lib/vaxt";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { ToolSegmented } from "./tabs";

const ZONE_OPTIONS = [
  { value: "utc" as const, label: "UTC" },
  { value: "baku" as const, label: "Bakı" },
];

export function VaxtTool() {
  const [timestampInput, setTimestampInput] = useState("");
  const [dateTimeInput, setDateTimeInput] = useState("");
  const [zone, setZone] = useState<Zone>("baku");

  const parsed: TimestampParseResult | null = useMemo(
    () => (timestampInput.trim() === "" ? null : parseTimestamp(timestampInput)),
    [timestampInput],
  );

  const breakdown: TimestampBreakdown | null = useMemo(
    () => (parsed && parsed.ok ? describeTimestamp(parsed.ms) : null),
    [parsed],
  );

  /* "Now" is read once, when the breakdown itself changes, not on every
     render — a converter is not a clock, and pinning it to `breakdown`
     keeps the age of a fixed timestamp stable while the visitor reads it. */
  const relative = useMemo(
    () => (breakdown ? formatRelative(breakdown.date, new Date()) : null),
    [breakdown],
  );

  const reverseResult: TimestampFromDateResult | null = useMemo(
    () => (dateTimeInput.trim() === "" ? null : timestampFromLocalInput(dateTimeInput, zone)),
    [dateTimeInput, zone],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Möhürdən tarixə"
          action={
            <ToolButton
              size="chip"
              onClick={() => setTimestampInput(String(nowTimestampSeconds()))}
            >
              İndi
            </ToolButton>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ToolField
            label="Unix vaxt möhürü"
            htmlFor="vaxt-timestamp-input"
            note="Saniyə (10 rəqəmə qədər) və millisaniyə (11+ rəqəm) avtomatik tanınır."
          >
            <ToolInput
              id="vaxt-timestamp-input"
              value={timestampInput}
              onChange={(event) => setTimestampInput(event.target.value)}
              placeholder="1735732800"
              inputMode="numeric"
              spellCheck={false}
            />
          </ToolField>

          <TimestampResult parsed={parsed} breakdown={breakdown} relative={relative} />
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Tarixdən möhürə"
          action={
            <ToolSegmented label="Zona" options={ZONE_OPTIONS} value={zone} onChange={setZone} />
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ToolField
            label="Tarix və saat"
            htmlFor="vaxt-datetime-input"
            note={`Seçilmiş sahə ${zone === "baku" ? "Bakı" : "UTC"} divar saatı kimi oxunur.`}
          >
            <ToolInput
              id="vaxt-datetime-input"
              type="datetime-local"
              step={1}
              value={dateTimeInput}
              onChange={(event) => setDateTimeInput(event.target.value)}
            />
          </ToolField>

          <ReverseResult result={reverseResult} />
        </div>
      </ToolPanel>
    </div>
  );
}

function TimestampResult({
  parsed,
  breakdown,
  relative,
}: {
  parsed: TimestampParseResult | null;
  breakdown: TimestampBreakdown | null;
  relative: string | null;
}) {
  if (!parsed) {
    return (
      <p className="font-ui text-sm text-muted">
        Vaxt möhürü yaz: ISO, UTC, Bakı vaxtı, nisbi vaxt, həftənin günü və ilin günü burada
        görünəcək.
      </p>
    );
  }

  if (!parsed.ok) {
    return (
      <ToolNote tone="accent" title="Düzgün vaxt möhürü deyil">
        {parsed.error}
      </ToolNote>
    );
  }

  if (!breakdown) return null;

  return (
    <ToolResultPanel
      title="Nəticə"
      hint={
        <span className="tabular-nums">
          {parsed.digits} rəqəm: {parsed.unit === "seconds" ? "saniyə" : "millisaniyə"} kimi
          oxundu
        </span>
      }
      className="min-w-0"
    >
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <ToolStat label="ISO 8601" value={breakdown.iso} />
        <ToolStat label="UTC" value={breakdown.utc} />
        <ToolStat label="Bakı vaxtı (UTC+4)" value={breakdown.baku} />
        <ToolStat label="Nisbi vaxt" value={relative ?? ""} />
        <ToolStat label="Həftənin günü" value={breakdown.weekday} />
        <ToolStat label="İlin günü" value={`${breakdown.dayOfYear} / ${breakdown.daysInYear}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-result-rule p-3">
        <CopyButton value={breakdown.iso} label="ISO-nu kopyala" />
        <CopyButton value={String(breakdown.seconds)} label="saniyəni kopyala" />
        <CopyButton value={String(breakdown.milliseconds)} label="millisaniyəni kopyala" />
      </div>
    </ToolResultPanel>
  );
}

function ReverseResult({ result }: { result: TimestampFromDateResult | null }) {
  if (!result) {
    return (
      <p className="font-ui text-sm text-muted">
        Tarix və saat seç: nəticədə həmin anın Unix vaxt möhürü saniyə və millisaniyə ilə
        görünəcək.
      </p>
    );
  }

  if (!result.ok) {
    return (
      <ToolNote tone="accent" title="Bu tarix qurulmadı">
        {result.error}
      </ToolNote>
    );
  }

  return (
    <ToolResultPanel title="Unix vaxt möhürü" className="min-w-0">
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <ToolStat label="Saniyə" value={String(Math.floor(result.ms / 1000))} />
        <ToolStat label="Millisaniyə" value={String(result.ms)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-result-rule p-3">
        <CopyButton value={String(Math.floor(result.ms / 1000))} label="saniyəni kopyala" />
        <CopyButton value={String(result.ms)} label="millisaniyəni kopyala" />
      </div>
    </ToolResultPanel>
  );
}
