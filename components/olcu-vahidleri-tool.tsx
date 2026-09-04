"use client";

import { useId, useMemo, useState } from "react";
import { ReferenceTable } from "./reference-table";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
} from "./ui";
import {
  binaryGapPercent,
  BYTE_PAIRS,
  BYTE_UNIT_LABELS,
  BYTE_UNITS,
  convertBytes,
  convertSpeed,
  convertTime,
  formatAmount,
  humanDuration,
  olcuRows,
  olcuSections,
  parseAmount,
  SPEED_UNIT_LABELS,
  SPEED_UNITS,
  TIME_UNIT_LABELS,
  TIME_UNITS,
  timeToSeconds,
  toBitsPerSecond,
  toBytes,
  transferSeconds,
  UPTIME_PRESETS,
  uptimeBudget,
  type ByteUnit,
  type SpeedUnit,
  type TimeUnit,
} from "../lib/olcu-vahidleri";

/*
 * Four converters and a lookup table, arranged so that the page a search
 * engine reads is the whole page.
 *
 * The four are tabs rather than four sections down a scroll, and `ToolTabs`
 * keeps every panel mounted with `hidden` on the ones that are shut — the
 * words behind a closed tab are still in the served HTML. The reference table
 * sits under the tabs instead of inside one of them, because it answers a
 * question none of the four converters does: "what is a normal number here".
 *
 * Nothing below computes. The arithmetic and the printing both live in
 * `lib/olcu-vahidleri`, so a reading shown here and a reading asserted
 * in the check file come out of the same function.
 */

const MAX_PERCENT = 100;

/**
 * The gap between a decimal rung and its binary neighbour, to one decimal.
 *
 * The raw figure is 7,374182400000007 and printing it whole would be answering
 * a question nobody asked: what the visitor is here to learn is that a GiB is
 * about 7,4% bigger than a GB, and the exact bytes are already on the two
 * lines underneath.
 */
function gapPercent(decimal: ByteUnit, binary: ByteUnit): number {
  return Math.round(binaryGapPercent(decimal, binary) * 10) / 10;
}

/** A quantity and the unit it is in — the input every tab opens with. */
function AmountField<T extends string>({
  idBase,
  label,
  hint,
  value,
  onValue,
  unit,
  onUnit,
  units,
  unitLabels,
}: {
  idBase: string;
  label: string;
  hint?: string;
  value: string;
  onValue: (next: string) => void;
  unit: T;
  onUnit: (next: T) => void;
  units: T[];
  unitLabels: Record<T, string>;
}) {
  return (
    <div className="@container">
      <div className="grid gap-3 @min-[20rem]:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
        <ToolField label={label} hint={hint} htmlFor={`${idBase}-value`}>
          <ToolInput
            id={`${idBase}-value`}
            value={value}
            onChange={(event) => onValue(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className="tabular-nums"
          />
        </ToolField>
        <ToolField label="Vahid" htmlFor={`${idBase}-unit`}>
          <ToolSelect
            id={`${idBase}-unit`}
            value={unit}
            onChange={(event) => onUnit(event.target.value as T)}
          >
            {units.map((item) => (
              <option key={item} value={item}>
                {item}: {unitLabels[item]}
              </option>
            ))}
          </ToolSelect>
        </ToolField>
      </div>
    </div>
  );
}

/** One converted reading: the unit, what it means, the number. */
function Reading({ unit, note, value }: { unit: string; note: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="font-ui text-[11px] text-muted">
        {unit} · {note}
      </p>
      <p className="mt-0.5 font-ui text-sm tabular-nums break-words">{value}</p>
    </div>
  );
}

export function OlcuVahidleriTool() {
  const ids = useId();

  const [sizeValue, setSizeValue] = useState("1");
  const [sizeUnit, setSizeUnit] = useState<ByteUnit>("TB");

  const [speedValue, setSpeedValue] = useState("100");
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>("Mbit/s");

  const [fileValue, setFileValue] = useState("10");
  const [fileUnit, setFileUnit] = useState<ByteUnit>("GB");

  const [timeValue, setTimeValue] = useState("1500000");
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("ms");

  const [percentValue, setPercentValue] = useState("99.9");

  const size = useMemo(() => parseAmount(sizeValue), [sizeValue]);
  const speed = useMemo(() => parseAmount(speedValue, { allowZero: false }), [speedValue]);
  const file = useMemo(() => parseAmount(fileValue), [fileValue]);
  const duration = useMemo(() => parseAmount(timeValue), [timeValue]);

  /* A percentage has a ceiling the other three fields do not, and it is the
     one field where an out-of-range number still looks plausible — 99.99 typed
     as 9999 is a slip, not a request. */
  const percent = useMemo(() => {
    const parsed = parseAmount(percentValue);
    if (parsed.value !== null && parsed.value > MAX_PERCENT) {
      return { value: null, error: "Əlçatanlıq 100%-dən böyük ola bilməz." };
    }
    return parsed;
  }, [percentValue]);

  const sizeReadings = useMemo(
    () => convertBytes(size.value ?? 0, sizeUnit),
    [size.value, sizeUnit],
  );
  const speedReadings = useMemo(
    () => convertSpeed(speed.value ?? 0, speedUnit),
    [speed.value, speedUnit],
  );
  const timeReadings = useMemo(
    () => convertTime(duration.value ?? 0, timeUnit),
    [duration.value, timeUnit],
  );
  const budget = useMemo(
    () => (percent.value === null ? null : uptimeBudget(percent.value)),
    [percent.value],
  );

  const transfer = useMemo(() => {
    if (file.value === null || speed.value === null) return null;
    const bits = toBitsPerSecond(speed.value, speedUnit);
    if (bits <= 0) return null;
    return transferSeconds(toBytes(file.value, fileUnit), bits);
  }, [file.value, fileUnit, speed.value, speedUnit]);

  const sizeBytes = size.value === null ? null : toBytes(size.value, sizeUnit);
  const durationSeconds =
    duration.value === null ? null : timeToSeconds(duration.value, timeUnit);

  const tabs: ToolTabItem[] = [
    {
      id: "hecm",
      label: "Həcm",
      content: (
        <div
          data-spec="olcu-hecm"
          className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @min-[52rem]:items-start"
        >
          <ToolPanel>
            <ToolPanelHeader title="Verilən həcmi" />
            <div className="space-y-3 p-3">
              <AmountField
                idBase={`${ids}-size`}
                label="Həcm"
                value={sizeValue}
                onValue={setSizeValue}
                unit={sizeUnit}
                onUnit={setSizeUnit}
                units={BYTE_UNITS}
                unitLabels={BYTE_UNIT_LABELS}
              />
              {size.error !== null ? (
                <ToolNote tone="accent">{size.error}</ToolNote>
              ) : (
                <ToolNote tone="info" title="Nə göstərilir">
                  Solda onluq vahidlər: istehsalçının və internet paketinin
                  hesabı. Sağda ikilik vahidlər: əməliyyat sisteminin hesabı.
                  Baytların sayı eynidir, yalnız bölən dəyişir.
                </ToolNote>
              )}
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="Bütün vahidlərdə"
            hint={sizeBytes === null ? undefined : `${formatAmount(sizeBytes)} bayt`}
          >
            <div className="@container">
              <div className="grid grid-cols-2 gap-3 p-3">
                <ToolStat
                  label="bit"
                  value={formatAmount(sizeReadings.bit)}
                  note="bir baytda 8 bit"
                />
                <ToolStat
                  label="bayt (B)"
                  value={formatAmount(sizeReadings.B)}
                  note="ölçmənin təməli"
                  tone="accent"
                />
              </div>

              <div className="divide-y divide-rule border-t border-rule">
                {BYTE_PAIRS.map((pair) => (
                  <div key={pair.decimal} className="px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-ui text-[11px] text-muted">
                        {pair.decimal} / {pair.binary}
                      </p>
                      <p className="shrink-0 font-ui text-[11px] tabular-nums text-muted">
                        fərq {formatAmount(gapPercent(pair.decimal, pair.binary))}%
                      </p>
                    </div>
                    <div className="mt-1 grid gap-x-4 gap-y-1 @min-[26rem]:grid-cols-2">
                      <p className="min-w-0 font-ui text-sm tabular-nums break-words">
                        {formatAmount(sizeReadings[pair.decimal])}{" "}
                        <span className="text-muted">{pair.decimal}</span>
                      </p>
                      <p className="min-w-0 font-ui text-sm tabular-nums break-words">
                        {formatAmount(sizeReadings[pair.binary])}{" "}
                        <span className="text-muted">{pair.binary}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ToolResultPanel>
        </div>
      ),
    },
    {
      id: "suret",
      label: "Sürət",
      content: (
        <div
          data-spec="olcu-suret"
          className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @min-[52rem]:items-start"
        >
          <div className="flex flex-col gap-4">
            <ToolPanel>
              <ToolPanelHeader title="Ötürmə sürəti" />
              <div className="space-y-3 p-3">
                <AmountField
                  idBase={`${ids}-speed`}
                  label="Sürət"
                  value={speedValue}
                  onValue={setSpeedValue}
                  unit={speedUnit}
                  onUnit={setSpeedUnit}
                  units={SPEED_UNITS}
                  unitLabels={SPEED_UNIT_LABELS}
                />
                {speed.error !== null && <ToolNote tone="accent">{speed.error}</ToolNote>}
              </div>
            </ToolPanel>

            <ToolPanel>
              <ToolPanelHeader title="Enən faylın həcmi" />
              <div className="space-y-3 p-3">
                <AmountField
                  idBase={`${ids}-file`}
                  label="Fayl"
                  value={fileValue}
                  onValue={setFileValue}
                  unit={fileUnit}
                  onUnit={setFileUnit}
                  units={BYTE_UNITS}
                  unitLabels={BYTE_UNIT_LABELS}
                />
                {file.error !== null && <ToolNote tone="accent">{file.error}</ToolNote>}
              </div>
            </ToolPanel>
          </div>

          <div className="flex flex-col gap-4">
            <ToolResultPanel title="Sürət vahidləri">
              <div className="@container">
                <div className="grid divide-y divide-rule @min-[26rem]:grid-cols-2 @min-[26rem]:divide-y-0">
                  {SPEED_UNITS.map((unit) => (
                    <Reading
                      key={unit}
                      unit={unit}
                      note={SPEED_UNIT_LABELS[unit]}
                      value={formatAmount(speedReadings[unit])}
                    />
                  ))}
                </div>
              </div>
            </ToolResultPanel>

            <ToolResultPanel
              title="Enmə müddəti"
              hint={
                file.value === null || speed.value === null
                  ? undefined
                  : `${fileValue} ${fileUnit} · ${speedValue} ${speedUnit}`
              }
            >
              <div className="space-y-3 p-3">
                <ToolStat
                  label="Nə qədər çəkir"
                  value={transfer === null ? "" : humanDuration(transfer)}
                  note={
                    transfer === null
                      ? "sürət və ya həcm oxunmadı: sıfırdan böyük rəqəm lazımdır"
                      : `${formatAmount(transfer)} saniyə`
                  }
                  tone="accent"
                />
                <ToolNote tone="info" title="Bu rəqəm ideal haldır">
                  TCP, TLS və HTTP başlıqları kanalın 3–10%-ni tutur, ona görə
                  real endirmə bir qədər uzun çəkir. Kanal başqa cihazlarla
                  bölüşülürsə fərq daha da böyüyür.
                </ToolNote>
              </div>
            </ToolResultPanel>
          </div>
        </div>
      ),
    },
    {
      id: "muddet",
      label: "Müddət",
      content: (
        <div
          data-spec="olcu-muddet"
          className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @min-[52rem]:items-start"
        >
          <ToolPanel>
            <ToolPanelHeader title="Müddət" />
            <div className="space-y-3 p-3">
              <AmountField
                idBase={`${ids}-time`}
                label="Müddət"
                value={timeValue}
                onValue={setTimeValue}
                unit={timeUnit}
                onUnit={setTimeUnit}
                units={TIME_UNITS}
                unitLabels={TIME_UNIT_LABELS}
              />
              {duration.error !== null ? (
                <ToolNote tone="accent">{duration.error}</ToolNote>
              ) : (
                <ToolNote tone="info" title="Ay və il">
                  Burada təqvim yox, müddət ölçülür: ay hər yerdə 30, il isə 365
                  gün sayılır.
                </ToolNote>
              )}
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="Bütün vahidlərdə"
            hint={durationSeconds === null ? undefined : humanDuration(durationSeconds)}
          >
            <div className="@container">
              <div className="p-3">
                <ToolStat
                  label="Oxunaqlı forma"
                  value={durationSeconds === null ? "" : humanDuration(durationSeconds)}
                  note={
                    durationSeconds === null
                      ? "rəqəm oxunmadı"
                      : `${formatAmount(durationSeconds)} saniyə`
                  }
                  tone="accent"
                />
              </div>
              <div className="grid divide-y divide-rule border-t border-rule @min-[26rem]:grid-cols-2 @min-[26rem]:divide-y-0">
                {TIME_UNITS.map((unit) => (
                  <Reading
                    key={unit}
                    unit={unit}
                    note={TIME_UNIT_LABELS[unit]}
                    value={formatAmount(timeReadings[unit])}
                  />
                ))}
              </div>
            </div>
          </ToolResultPanel>
        </div>
      ),
    },
    {
      id: "elcatanliq",
      label: "Əlçatanlıq",
      content: (
        <div
          data-spec="olcu-elcatanliq"
          className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @min-[52rem]:items-start"
        >
          <ToolPanel>
            <ToolPanelHeader title="Əlçatanlıq faizi" hint="%" />
            <div className="space-y-3 p-3">
              <ToolField
                label="Faiz"
                hint="0 – 100"
                htmlFor={`${ids}-percent`}
                suffix="%"
                note="SLA-da yazılan rəqəmi yaz: nəticə icazə verilən dayanma müddətidir."
              >
                <ToolInput
                  id={`${ids}-percent`}
                  value={percentValue}
                  onChange={(event) => setPercentValue(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  className="tabular-nums"
                />
              </ToolField>

              <div className="flex flex-wrap gap-1.5">
                {UPTIME_PRESETS.map((preset) => {
                  const text = String(preset);
                  return (
                    <ToolButton
                      key={text}
                      size="chip"
                      selected={percentValue.replace(",", ".") === text}
                      onClick={() => setPercentValue(text)}
                    >
                      {text.replace(".", ",")}%
                    </ToolButton>
                  );
                })}
              </div>

              {percent.error !== null && <ToolNote tone="accent">{percent.error}</ToolNote>}
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="İcazə verilən dayanma"
            hint={percent.value === null ? undefined : `${formatAmount(percent.value)}%`}
          >
            <div className="@container">
              <div className="grid grid-cols-2 gap-3 p-3 @min-[34rem]:grid-cols-4">
                <ToolStat
                  label="Gündə"
                  value={budget === null ? "" : humanDuration(budget.day)}
                  note={budget === null ? "rəqəm oxunmadı" : `${formatAmount(budget.day)} san`}
                />
                <ToolStat
                  label="Həftədə"
                  value={budget === null ? "" : humanDuration(budget.week)}
                  note={budget === null ? "rəqəm oxunmadı" : `${formatAmount(budget.week)} san`}
                />
                <ToolStat
                  label="Ayda"
                  value={budget === null ? "" : humanDuration(budget.month)}
                  note={budget === null ? "30 gün" : `30 gün · ${formatAmount(budget.month)} san`}
                />
                <ToolStat
                  label="İldə"
                  value={budget === null ? "" : humanDuration(budget.year)}
                  note={budget === null ? "365 gün" : `365 gün · ${formatAmount(budget.year)} san`}
                  tone="accent"
                />
              </div>
              <div className="border-t border-rule p-3">
                <ToolNote tone="info" title="Rəqəm nəyi demir">
                  Dayanmanın nə qədər olduğunu göstərir, nə vaxt olduğunu yox.
                  İlin bütün büdcəsi bir gecədə yanan da 99,9% sayılır, ayda beş
                  dəqiqəyə bölünən də.
                </ToolNote>
              </div>
            </div>
          </ToolResultPanel>
        </div>
      ),
    },
  ];

  return (
    <div className="@container" data-spec="olcu-vahidleri-tool">
      <ToolTabs idPrefix="olcu-vahidleri" items={tabs} />

      <ReferenceTable
        rows={olcuRows}
        sections={olcuSections}
        placeholder="prefiks, həcm, sürət və ya gecikmə axtar"
        footnote="Həcm və sürət sətirləri tipik dəyərlərdir: müqayisə üçün, ölçmə üçün yox. Gecikmə şkalası Jeff Dean-in siyahısının bugünkü avadanlıqla yenilənmiş variantıdır."
      />
    </div>
  );
}
