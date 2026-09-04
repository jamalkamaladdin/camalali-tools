"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { detectFormat, parseTable, stringifyTable, type CsvDelimiter, type TableFormat } from "../lib/cedvel";

const FORMAT_OPTIONS: { value: TableFormat; label: string }[] = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
];

const DELIMITER_OPTIONS = [
  { value: "," as const, label: "vergül" },
  { value: ";" as const, label: "nöqtəli vergül" },
  { value: "\t" as const, label: "tab" },
];

const SAMPLE = `| ad | qiymət |
| --- | ---: |
| Telefon | 399 |
| Qulaqlıq | 59 |`;

export function CedvelTool() {
  const [text, setText] = useState(SAMPLE);
  const [fromFormat, setFromFormat] = useState<TableFormat | "auto">("auto");
  const [toFormat, setToFormat] = useState<TableFormat>("json");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(",");

  const detected = useMemo(() => detectFormat(text), [text]);
  const effectiveFrom = fromFormat === "auto" ? detected : fromFormat;

  const parsed = useMemo(
    () => parseTable(text, effectiveFrom, delimiter),
    [text, effectiveFrom, delimiter],
  );
  const output = useMemo(
    () => (parsed.ok ? stringifyTable(parsed.table, toFormat, delimiter) : null),
    [parsed, toFormat, delimiter],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Format"
          action={
            <>
              <ToolSegmented
                label="Giriş formatı"
                options={[{ value: "auto" as const, label: `avto (${detected})` }, ...FORMAT_OPTIONS]}
                value={fromFormat}
                onChange={setFromFormat}
              />
              <ToolSegmented label="Çıxış formatı" options={FORMAT_OPTIONS} value={toFormat} onChange={setToFormat} />
            </>
          }
        />
        {(effectiveFrom === "csv" || toFormat === "csv") && (
          <div className="border-t border-rule p-3">
            <ToolSegmented label="CSV ayırıcısı" options={DELIMITER_OPTIONS} value={delimiter} onChange={setDelimiter} />
          </div>
        )}
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Cədvəl"
          hint={fromFormat === "auto" ? `avto tanındı: ${detected}` : undefined}
          action={
            <ToolButton size="chip" onClick={() => setText(SAMPLE)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="Giriş" htmlFor="cedvel-input">
            <ToolTextArea
              id="cedvel-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={10}
              spellCheck={false}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!parsed.ok ? (
        <ToolNote tone="accent" title="Çevrilmədi">
          {parsed.error}
          {"line" in parsed && parsed.line !== undefined ? ` (${parsed.line}-ci sətir)` : ""}
        </ToolNote>
      ) : (
        <ToolResultPanel
          title="Nəticə"
          action={output !== null ? <CopyButton value={output} label="Nəticəni kopyala" /> : undefined}
        >
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <ToolStat label="Sütun" value={parsed.table.headers.length} />
              <ToolStat label="Sətir" value={parsed.table.rows.length} />
            </div>
            <ToolOutput>{output || "—"}</ToolOutput>
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
