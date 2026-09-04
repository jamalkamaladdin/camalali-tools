"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolTextArea,
} from "./ui";
import {
  convertLines,
  NAME_CASES,
  type NameCase,
  type NameConversionLine,
  type NameConversions,
} from "../lib/ad-formati";

const SAMPLE_INPUT = "XMLHttpRequest";

/* `Array.filter` does not narrow a union field on its own — this is the
   predicate that tells TypeScript a line surviving the filter really does
   carry a non-null `conversions`, so BatchResult below can require one
   instead of re-checking null on every row. */
function hasConversions(
  line: NameConversionLine,
): line is NameConversionLine & { conversions: NameConversions } {
  return line.conversions !== null;
}

export function AdFormatiTool() {
  const [input, setInput] = useState("");
  const [batchFormat, setBatchFormat] = useState<NameCase>("snake_case");

  const lines = useMemo(() => convertLines(input), [input]);
  const meaningfulLines = lines.filter(hasConversions);

  // One name in the box: show every format at once, which is the tool's
  // whole point. Several names: showing nine full grids would be a wall of
  // text nobody reads, so batch mode shows one chosen format per line
  // instead — the shape a migration script or a bulk rename actually needs.
  const isBatch = meaningfulLines.length > 1;

  return (
    <div className="mt-8">
      <ToolPanel>
        <ToolPanelHeader
          title="Ad formatı"
          action={
            <>
              <ToolButton size="chip" onClick={() => setInput(SAMPLE_INPUT)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setInput("")} disabled={input === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <ToolField
            label="Ad"
            htmlFor="ad-formati-input"
            hint={
              isBatch ? (
                <span className="tabular-nums">{meaningfulLines.length} ad</span>
              ) : undefined
            }
            note="Bir sətirdə bir ad, bir neçə sətir yapışdırsan toplu rejimə keçir."
          >
            <ToolTextArea
              id="ad-formati-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={"XMLHttpRequest\nuser_id_number\nsome-mixed_Name"}
              spellCheck={false}
              className="min-h-40 font-mono"
            />
          </ToolField>

          {isBatch ? (
            <BatchResult
              lines={meaningfulLines}
              format={batchFormat}
              onFormatChange={setBatchFormat}
            />
          ) : (
            <SingleResult conversions={meaningfulLines[0]?.conversions ?? null} />
          )}
        </div>
      </ToolPanel>
    </div>
  );
}

function SingleResult({ conversions }: { conversions: NameConversions | null }) {
  if (!conversions) {
    return (
      <ToolNote>Bir ad yaz — doqquz format burada bir anda görünəcək.</ToolNote>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {NAME_CASES.map((nameCase) => (
        <div
          key={nameCase}
          data-surface="result"
          className="flex items-center justify-between gap-2 rounded border border-result-rule bg-result p-2.5"
        >
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted">{nameCase}</p>
            <p className="mt-0.5 truncate font-mono text-sm font-semibold">
              {conversions[nameCase]}
            </p>
          </div>
          <CopyButton
            value={conversions[nameCase]}
            label="kopyala"
            className="shrink-0"
          />
        </div>
      ))}
    </div>
  );
}

function BatchResult({
  lines,
  format,
  onFormatChange,
}: {
  lines: (NameConversionLine & { conversions: NameConversions })[];
  format: NameCase;
  onFormatChange: (format: NameCase) => void;
}) {
  const output = lines.map((line) => line.conversions[format]).join("\n");

  return (
    <ToolResultPanel
      title="Toplu nəticə"
      action={
        <>
          <ToolSelect
            value={format}
            onChange={(event) => onFormatChange(event.target.value as NameCase)}
            className="h-8 w-auto px-2 text-xs"
            aria-label="Hədəf format"
          >
            {NAME_CASES.map((nameCase) => (
              <option key={nameCase} value={nameCase}>
                {nameCase}
              </option>
            ))}
          </ToolSelect>
          <CopyButton value={output} label="hamısını kopyala" />
        </>
      }
    >
      <div className="p-3">
        <ToolOutput className="max-h-72 overflow-y-auto">{output}</ToolOutput>
      </div>
    </ToolResultPanel>
  );
}
