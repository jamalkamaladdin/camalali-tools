"use client";

import { useMemo, useState } from "react";
import { withInlineCode } from "./inline-code";
import { ToolSegmented, type ToolSegmentedOption } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
} from "./ui";
import { formatDuration } from "../shared/az-date";
import { formatNumber } from "../shared/format";
import {
  BANDWIDTH_PRESETS,
  BANDWIDTH_UNIT_LABELS,
  BANDWIDTH_UNITS,
  calculateTransfer,
  formatBandwidthAuto,
  formatBinarySize,
  formatByteSpeedAuto,
  formatDecimalSize,
  OVERHEAD_PRESETS,
  parseAmount,
  parsePercent,
  SIZE_PRESETS,
  SIZE_UNIT_LABELS,
  SIZE_UNITS,
  TIME_UNIT_LABELS,
  TIME_UNITS,
  type BandwidthUnit,
  type OverheadAssumption,
  type SizeUnit,
  type SolveField,
  type TimeUnit,
} from "../lib/bant-genisliyi";

/*
 * Three quantities and one identity — the widget's only job is deciding which
 * two fields are inputs and which one is the readout, and it does that by
 * hiding exactly the field `solveFor` names rather than by branching the
 * whole layout in three: the size, bandwidth and time fields are each drawn
 * once and each individually conditional on not being the target.
 *
 * The result panel never prints a single number. `calculateTransfer` always
 * returns a theoretical and a realistic figure together, and this file keeps
 * that pairing all the way to the two `ToolStat` tiles — a bandwidth tool
 * that only shows the flattering number is worse than no tool.
 */

const SOLVE_OPTIONS: ToolSegmentedOption<SolveField>[] = [
  { value: "time", label: "Vaxt" },
  { value: "bandwidth", label: "Bant genişliyi" },
  { value: "size", label: "Ölçü" },
];

const OVERHEAD_OPTIONS: ToolSegmentedOption<OverheadAssumption>[] = OVERHEAD_PRESETS.map(
  (preset) => ({ value: preset.id, label: preset.label }),
);

type FormState = {
  solveFor: SolveField;
  sizeValue: string;
  sizeUnit: SizeUnit;
  bandwidthValue: string;
  bandwidthUnit: BandwidthUnit;
  timeValue: string;
  timeUnit: TimeUnit;
  overheadPreset: OverheadAssumption;
  customOverhead: string;
};

const DEFAULT_FORM: FormState = {
  solveFor: "time",
  sizeValue: "4",
  sizeUnit: "GB",
  bandwidthValue: "100",
  bandwidthUnit: "Mbit/s",
  timeValue: "8",
  timeUnit: "h",
  overheadPreset: "tcp-ipv4",
  customOverhead: "10",
};

function overheadLabelFor(preset: OverheadAssumption): string {
  if (preset === "custom") return "öz faizim";
  return OVERHEAD_PRESETS.find((p) => p.id === preset)?.label ?? "";
}

export function BantGenisliyiTool() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const sizeParsed = parseAmount(form.sizeValue);
  const bandwidthParsed = parseAmount(form.bandwidthValue);
  const timeParsed = parseAmount(form.timeValue);
  const customOverheadParsed = parsePercent(form.customOverhead);

  const overheadPercent =
    form.overheadPreset === "custom"
      ? (customOverheadParsed.value ?? Number.NaN)
      : (OVERHEAD_PRESETS.find((p) => p.id === form.overheadPreset)?.percent ?? 0);

  const showSize = form.solveFor !== "size";
  const showBandwidth = form.solveFor !== "bandwidth";
  const showTime = form.solveFor !== "time";

  const result = useMemo(() => {
    if (form.overheadPreset === "custom" && customOverheadParsed.error) {
      return { ok: false as const, error: customOverheadParsed.error };
    }
    if (showSize && sizeParsed.error) return { ok: false as const, error: sizeParsed.error };
    if (showBandwidth && bandwidthParsed.error) {
      return { ok: false as const, error: bandwidthParsed.error };
    }
    if (showTime && timeParsed.error) return { ok: false as const, error: timeParsed.error };

    return calculateTransfer({
      solveFor: form.solveFor,
      sizeValue: sizeParsed.value ?? 0,
      sizeUnit: form.sizeUnit,
      bandwidthValue: bandwidthParsed.value ?? 0,
      bandwidthUnit: form.bandwidthUnit,
      timeValue: timeParsed.value ?? 0,
      timeUnit: form.timeUnit,
      overheadPercent,
    });
  }, [
    form,
    sizeParsed.value,
    sizeParsed.error,
    bandwidthParsed.value,
    bandwidthParsed.error,
    timeParsed.value,
    timeParsed.error,
    customOverheadParsed.error,
    overheadPercent,
    showSize,
    showBandwidth,
    showTime,
  ]);

  const overheadLabel = overheadLabelFor(form.overheadPreset);
  const overheadPercentText = Number.isFinite(overheadPercent) ? formatNumber(overheadPercent, 1) : "—";

  let theoreticalValue = "—";
  let theoreticalNote = "";
  let realisticValue = "—";
  let realisticNote = "";

  if (result.ok) {
    if (result.solveFor === "time") {
      theoreticalValue = formatDuration(result.theoreticalSeconds);
      theoreticalNote = "Protokol xərci yoxdur — xəttin bütün nominal tutumu istifadə olunur.";
      realisticValue = formatDuration(result.realisticSeconds);
      realisticNote = `${overheadLabel} fərziyyəsi ilə (~${overheadPercentText}% xərc).`;
    } else if (result.solveFor === "bandwidth") {
      theoreticalValue = formatBandwidthAuto(result.theoreticalBps);
      theoreticalNote = `≈ ${formatByteSpeedAuto(result.theoreticalBps)} · protokol xərci yoxdur.`;
      realisticValue = formatBandwidthAuto(result.realisticBps);
      realisticNote = `≈ ${formatByteSpeedAuto(result.realisticBps)} · ${overheadLabel} ilə real alınmalı olan xətt.`;
    } else {
      theoreticalValue = formatDecimalSize(result.theoreticalBytes);
      theoreticalNote = `≈ ${formatBinarySize(result.theoreticalBytes)} · protokol xərci yoxdur.`;
      realisticValue = formatDecimalSize(result.realisticBytes);
      realisticNote = `≈ ${formatBinarySize(result.realisticBytes)} · ${overheadLabel} ilə (~${overheadPercentText}% xərc).`;
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Nə axtarırsan?"
          action={
            <ToolSegmented
              options={SOLVE_OPTIONS}
              value={form.solveFor}
              onChange={(value) => set("solveFor", value)}
              label="Hesablanacaq kəmiyyət"
            />
          }
        />

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {showSize && (
            <ToolField label="Ölçü" htmlFor="bg-size" note={sizeParsed.error ?? undefined}>
              <div className="flex gap-2">
                <ToolInput
                  id="bg-size"
                  value={form.sizeValue}
                  onChange={(event) => set("sizeValue", event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                />
                <ToolSelect
                  aria-label="Ölçü vahidi"
                  value={form.sizeUnit}
                  onChange={(event) => set("sizeUnit", event.target.value as SizeUnit)}
                  className="w-40 shrink-0"
                >
                  {SIZE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit} · {SIZE_UNIT_LABELS[unit]}
                    </option>
                  ))}
                </ToolSelect>
              </div>
            </ToolField>
          )}

          {showBandwidth && (
            <ToolField
              label="Bant genişliyi"
              htmlFor="bg-bandwidth"
              note={bandwidthParsed.error ?? undefined}
            >
              <div className="flex gap-2">
                <ToolInput
                  id="bg-bandwidth"
                  value={form.bandwidthValue}
                  onChange={(event) => set("bandwidthValue", event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                />
                <ToolSelect
                  aria-label="Bant genişliyi vahidi"
                  value={form.bandwidthUnit}
                  onChange={(event) => set("bandwidthUnit", event.target.value as BandwidthUnit)}
                  className="w-44 shrink-0"
                >
                  {BANDWIDTH_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit} · {BANDWIDTH_UNIT_LABELS[unit]}
                    </option>
                  ))}
                </ToolSelect>
              </div>
            </ToolField>
          )}

          {showTime && (
            <ToolField label="Vaxt" htmlFor="bg-time" note={timeParsed.error ?? undefined}>
              <div className="flex gap-2">
                <ToolInput
                  id="bg-time"
                  value={form.timeValue}
                  onChange={(event) => set("timeValue", event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                />
                <ToolSelect
                  aria-label="Vaxt vahidi"
                  value={form.timeUnit}
                  onChange={(event) => set("timeUnit", event.target.value as TimeUnit)}
                  className="w-32 shrink-0"
                >
                  {TIME_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {TIME_UNIT_LABELS[unit]}
                    </option>
                  ))}
                </ToolSelect>
              </div>
            </ToolField>
          )}

          <div className="sm:col-span-2">
            <ToolLabel>Protokol xərci</ToolLabel>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <ToolSegmented
                options={OVERHEAD_OPTIONS}
                value={form.overheadPreset}
                onChange={(value) => set("overheadPreset", value)}
                label="Protokol xərci fərziyyəsi"
              />
              {form.overheadPreset === "custom" && (
                <div className="w-28">
                  <ToolInput
                    aria-label="Öz faizim, faiz"
                    value={form.customOverhead}
                    onChange={(event) => set("customOverhead", event.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    className="tabular-nums"
                  />
                </div>
              )}
              {form.overheadPreset === "custom" && customOverheadParsed.error && (
                <span className="text-ios-footnote text-accent-text">
                  {customOverheadParsed.error}
                </span>
              )}
            </div>
          </div>
        </div>

        {showBandwidth && (
          <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3">
            <ToolLabel>Hazır sürət</ToolLabel>
            {BANDWIDTH_PRESETS.map((preset) => (
              <ToolButton
                key={preset.id}
                size="chip"
                title={preset.note}
                onClick={() => {
                  set("bandwidthValue", String(preset.value));
                  set("bandwidthUnit", preset.unit);
                }}
              >
                {preset.label}
                {preset.note !== undefined && <span className="ml-1 text-muted">*</span>}
              </ToolButton>
            ))}
            <span className="text-ios-footnote text-muted">* faktiki ötürmə, elan olunan sürət yox</span>
          </div>
        )}

        {showSize && (
          <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3">
            <ToolLabel>Hazır ölçü</ToolLabel>
            {SIZE_PRESETS.map((preset) => (
              <ToolButton
                key={preset.id}
                size="chip"
                onClick={() => {
                  set("sizeValue", String(preset.value));
                  set("sizeUnit", preset.unit);
                }}
              >
                {preset.label}
              </ToolButton>
            ))}
          </div>
        )}
      </ToolPanel>

      <ToolResultPanel title="Nəticə" hint={result.ok ? `~${overheadPercentText}% xərc fərz edilir` : undefined}>
        {!result.ok ? (
          <div className="p-4">
            <ToolNote tone="accent" title="Hesablanmadı">
              {result.error}
            </ToolNote>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <ToolStat label="Nəzəri" value={theoreticalValue} note={theoreticalNote} />
            <ToolStat label="Realist" value={realisticValue} note={realisticNote} tone="accent" />
          </div>
        )}
      </ToolResultPanel>

      <ToolNote tone="info">
        {withInlineCode(
          "Bant genişliyi bit əsasında (`Mbit/s`), ölçü isə bayt əsasında (`MB`) satılır — arada 8 dəfə fərq var. Onluq vahid (`MB`, `GB`) disk qutusunda və provayder reklamında, ikilik vahid (`MiB`, `GiB`) isə əməliyyat sisteminin özündə görünür; hər nəticə ikisini də göstərir ki, hansı vahidin işlədiyi aydın olsun.",
        )}
      </ToolNote>
    </div>
  );
}
