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
import { csvToJson, jsonToCsv, type CsvDelimiter } from "../lib/json-csv";

type Direction = "to-csv" | "to-json";

const DIRECTION_OPTIONS = [
  { value: "to-csv" as const, label: "JSON → CSV" },
  { value: "to-json" as const, label: "CSV → JSON" },
];

const DELIMITER_OPTIONS = [
  { value: "," as const, label: "vergül" },
  { value: ";" as const, label: "nöqtəli vergül" },
  { value: "\t" as const, label: "tab" },
];

const SAMPLE_JSON = JSON.stringify(
  [
    { ad: "Ali", ünvan: { şəhər: "Bakı" }, aktiv: true, dillər: ["az", "en"] },
    { ad: "Aygün", ünvan: { şəhər: "Gəncə" }, aktiv: false, dillər: ["az"] },
  ],
  null,
  2,
);

const SAMPLE_CSV = 'ad,ünvan.şəhər,aktiv\r\nAli,Bakı,true\r\nAygün,Gəncə,false';

export function JsonCsvTool() {
  const [direction, setDirection] = useState<Direction>("to-csv");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(",");
  const [inferTypes, setInferTypes] = useState(false);
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);

  const toCsvResult = useMemo(() => jsonToCsv(jsonText, { delimiter }), [jsonText, delimiter]);
  const toJsonResult = useMemo(
    () => csvToJson(csvText, { delimiter, inferTypes }),
    [csvText, delimiter, inferTypes],
  );

  const isToCsv = direction === "to-csv";
  const result = isToCsv ? toCsvResult : toJsonResult;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="İstiqamət"
          action={
            <>
              <ToolSegmented
                label="Çevirmə istiqaməti"
                options={DIRECTION_OPTIONS}
                value={direction}
                onChange={setDirection}
              />
              <ToolSegmented
                label="Ayırıcı"
                options={DELIMITER_OPTIONS}
                value={delimiter}
                onChange={setDelimiter}
              />
            </>
          }
        />
        {!isToCsv && (
          <div className="flex items-center gap-2 border-t border-rule p-3">
            <label className="flex items-center gap-2 font-ui text-ios-footnote text-muted">
              <input
                type="checkbox"
                checked={inferTypes}
                onChange={(event) => setInferTypes(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Rəqəm, boolean və boş xananı təxmin et
            </label>
          </div>
        )}
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title={isToCsv ? "JSON massivi" : "CSV mətni"}
          action={
            <ToolButton
              size="chip"
              onClick={() => (isToCsv ? setJsonText(SAMPLE_JSON) : setCsvText(SAMPLE_CSV))}
            >
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label={isToCsv ? "JSON" : "CSV"} htmlFor="json-csv-input">
            {isToCsv ? (
              <ToolTextArea
                id="json-csv-input"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={10}
                spellCheck={false}
                placeholder='[{"ad": "Ali"}]'
              />
            ) : (
              <ToolTextArea
                id="json-csv-input"
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                rows={10}
                spellCheck={false}
                placeholder="ad,yas"
              />
            )}
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent" title="Çevrilmədi">
          {result.error}
          {"line" in result && result.line !== undefined ? ` (${result.line}-ci sətir)` : ""}
        </ToolNote>
      ) : (
        <ToolResultPanel
          title={isToCsv ? "CSV" : "JSON"}
          action={<CopyButton value={result.output} label="Nəticəni kopyala" />}
        >
          <div className="space-y-3 p-4">
            {"columns" in result && (
              <div className="grid grid-cols-2 gap-2">
                <ToolStat label="Sətir" value={result.rowCount} />
                <ToolStat label="Sütun" value={result.columns.length} />
              </div>
            )}
            <ToolOutput>{result.output || ""}</ToolOutput>
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
