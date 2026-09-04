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
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented, ToolTabs, type ToolTabItem } from "./tabs";
import {
  aggregate,
  CIDR_LIST_FORMATS,
  convertCidrListToRange,
  convertRangeToCidr,
  exclude,
  formatBlockList,
  formatIpv4,
  type CidrListFormat,
} from "../lib/cidr-birlesdirme";

const RANGE_SAMPLE = { start: "192.168.1.5", end: "192.168.1.130" };
const CIDR_LIST_SAMPLE = "192.168.1.5/32\n192.168.1.6/31\n192.168.1.8/29\n192.168.1.16/28\n192.168.1.32/27\n192.168.1.64/26\n192.168.1.128/31\n192.168.1.130/32";
const AGGREGATE_SAMPLE = "10.0.0.0/25\n10.0.0.128/25\n10.0.1.0/24\n10.0.1.5\n10.0.0.64/27\n192.168.5.0/24";
const EXCLUDE_SAMPLE = { base: "10.0.0.0/16", subs: "10.0.1.0/24\n10.0.5.0/25" };

/* One output-format switch shared by every result panel below, so the same
   copy button always produces the same three shapes: a quick paste, a
   config-file list, and a single CLI-friendly line. */
function useListFormat() {
  const [format, setFormat] = useState<CidrListFormat>("setir");
  return { format, setFormat };
}

function FormatSwitch({
  format,
  onChange,
}: {
  format: CidrListFormat;
  onChange: (value: CidrListFormat) => void;
}) {
  return (
    <ToolSegmented
      label="Çıxış formatı"
      options={CIDR_LIST_FORMATS}
      value={format}
      onChange={onChange}
    />
  );
}

/* ---------- Range → CIDR ---------- */

function RangeToCidrPanel() {
  const [start, setStart] = useState(RANGE_SAMPLE.start);
  const [end, setEnd] = useState(RANGE_SAMPLE.end);
  const { format, setFormat } = useListFormat();

  const result = useMemo(() => convertRangeToCidr(start, end), [start, end]);

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Aralıq"
          action={
            <ToolButton
              size="chip"
              onClick={() => {
                setStart(RANGE_SAMPLE.start);
                setEnd(RANGE_SAMPLE.end);
              }}
            >
              Nümunə
            </ToolButton>
          }
        />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <ToolField label="Başlanğıc ünvan" htmlFor="cb-range-start">
            <ToolInput
              id="cb-range-start"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              placeholder="192.168.1.5"
              spellCheck={false}
            />
          </ToolField>
          <ToolField label="Son ünvan" htmlFor="cb-range-end">
            <ToolInput
              id="cb-range-end"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              placeholder="192.168.1.130"
              spellCheck={false}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent">{result.error}</ToolNote>
      ) : (
        <ToolResultPanel
          title="Minimal CIDR siyahısı"
          hint={`${result.blocks.length} blok · ${result.totalAddresses} ünvan`}
          action={<FormatSwitch format={format} onChange={setFormat} />}
        >
          <div className="space-y-3 p-4">
            <ToolOutput>{formatBlockList(result.blocks, format)}</ToolOutput>
            <CopyButton value={formatBlockList(result.blocks, format)} label="Siyahını kopyala" />
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}

/* ---------- CIDR → Range ---------- */

function CidrToRangePanel() {
  const [text, setText] = useState(CIDR_LIST_SAMPLE);
  const result = useMemo(() => convertCidrListToRange(text), [text]);

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="CIDR siyahısı"
          hint="hər sətirdə bir CIDR"
          action={
            <ToolButton size="chip" onClick={() => setText(CIDR_LIST_SAMPLE)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="CIDR-lər" htmlFor="cb-cidrs">
            <ToolTextArea
              id="cb-cidrs"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="192.168.1.0/24"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent">{result.error}</ToolNote>
      ) : (
        <ToolResultPanel title="Aralıq" hint={`${result.blockCount} blok`}>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            <ToolStat label="İlk ünvan" value={formatIpv4(result.first)} />
            <ToolStat label="Son ünvan" value={formatIpv4(result.last)} />
            <ToolStat label="Ümumi ünvan sayı" value={result.totalAddresses} />
          </div>
          {result.blockCount > 1 && (
            <p className="px-4 pb-4 text-ios-footnote text-muted">
              Bloklar üst-üstə düşürsə say təkrar sayılır — minimal, təkrarsız say üçün
              «Aqreqasiya» sekmesini işlət.
            </p>
          )}
        </ToolResultPanel>
      )}
    </div>
  );
}

/* ---------- Aggregation ---------- */

function AggregationPanel() {
  const [text, setText] = useState(AGGREGATE_SAMPLE);
  const { format, setFormat } = useListFormat();
  const result = useMemo(() => aggregate(text), [text]);

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="CIDR və IP siyahısı"
          hint="hər sətirdə bir giriş"
          action={
            <ToolButton size="chip" onClick={() => setText(AGGREGATE_SAMPLE)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField
            label="Siyahı"
            htmlFor="cb-aggregate"
            note="Təkrarlar, üst-üstə düşənlər və qonşu bloklar avtomatik təmizlənir."
          >
            <ToolTextArea
              id="cb-aggregate"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="10.0.0.0/25"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent">{result.error}</ToolNote>
      ) : (
        <ToolResultPanel
          title="Minimal ekvivalent siyahı"
          hint={`${result.before} sətir → ${result.after.length} blok`}
          action={<FormatSwitch format={format} onChange={setFormat} />}
        >
          <div className="space-y-3 p-4">
            <ToolOutput>{formatBlockList(result.after, format)}</ToolOutput>
            <CopyButton value={formatBlockList(result.after, format)} label="Siyahını kopyala" />
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}

/* ---------- Exclusion ---------- */

function ExclusionPanel() {
  const [base, setBase] = useState(EXCLUDE_SAMPLE.base);
  const [subs, setSubs] = useState(EXCLUDE_SAMPLE.subs);
  const { format, setFormat } = useListFormat();
  const result = useMemo(() => exclude(base, subs), [base, subs]);

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Şəbəkə və çıxarılacaq bloklar"
          action={
            <ToolButton
              size="chip"
              onClick={() => {
                setBase(EXCLUDE_SAMPLE.base);
                setSubs(EXCLUDE_SAMPLE.subs);
              }}
            >
              Nümunə
            </ToolButton>
          }
        />
        <div className="space-y-3 p-4">
          <ToolField label="Əsas şəbəkə" htmlFor="cb-exclude-base">
            <ToolInput
              id="cb-exclude-base"
              value={base}
              onChange={(event) => setBase(event.target.value)}
              placeholder="10.0.0.0/16"
              spellCheck={false}
            />
          </ToolField>
          <ToolField
            label="Çıxarılacaq bloklar"
            htmlFor="cb-exclude-subs"
            note="Hər sətirdə bir CIDR: əsas şəbəkənin içində olmalıdır."
          >
            <ToolTextArea
              id="cb-exclude-subs"
              value={subs}
              onChange={(event) => setSubs(event.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="10.0.1.0/24"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent">{result.error}</ToolNote>
      ) : (
        <ToolResultPanel
          title="Qalan aralıq"
          hint={`${result.result.length} blok · ${result.totalAddresses} ünvan`}
          action={<FormatSwitch format={format} onChange={setFormat} />}
        >
          <div className="space-y-3 p-4">
            <ToolOutput>{formatBlockList(result.result, format)}</ToolOutput>
            <CopyButton value={formatBlockList(result.result, format)} label="Siyahını kopyala" />
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}

export function CidrBirlesdirmeTool() {
  const tabs: ToolTabItem[] = [
    { id: "range-to-cidr", label: "Aralıq → CIDR", content: <RangeToCidrPanel /> },
    { id: "cidr-to-range", label: "CIDR → Aralıq", content: <CidrToRangePanel /> },
    { id: "aggregate", label: "Aqreqasiya", content: <AggregationPanel /> },
    { id: "exclude", label: "İstisna", content: <ExclusionPanel /> },
  ];

  return (
    <div className="mt-8">
      <ToolTabs items={tabs} idPrefix="cidr-birlesdirme" />
      <ToolLabel className="mt-2">Hesab brauzerdə aparılır — heç nə serverə göndərilmir.</ToolLabel>
    </div>
  );
}
