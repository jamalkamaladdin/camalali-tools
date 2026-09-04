"use client";

import { useMemo, useState } from "react";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  COLUMN_TYPE_LABELS,
  CSV_DELIMITER_LABELS,
  CSV_DELIMITERS,
  inspectCsv,
  type CsvDelimiter,
} from "../lib/csv";

/*
 * Deliberately messy, the way a real export is: a name with a quoted comma
 * and an escaped quote inside it, a blank note, an age typed as a word
 * instead of a number (which is what drags that whole column down to the
 * text fallback type — the demonstration that one bad cell changes a
 * column's verdict), and a fifth row with an extra field the others do not
 * have.
 */
const SAMPLE_CSV = `ad;yaş;qeyd;aktiv
"Vəli, Əli";28;"Bakıda ""əla"" iş yeri";true
Aygün;31;;false
Kamran;otuz;test;true
Nərmin;22;yeni işçi;true;əlavə sahə`;

type DelimiterOption = "auto" | CsvDelimiter;

export function CsvTool() {
  const [text, setText] = useState(SAMPLE_CSV);
  const [delimiterOption, setDelimiterOption] = useState<DelimiterOption>("auto");

  const result = useMemo(
    () => inspectCsv(text, delimiterOption === "auto" ? undefined : delimiterOption),
    [text, delimiterOption],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="CSV"
          action={
            <>
              <ToolButton size="chip" onClick={() => setText(SAMPLE_CSV)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />
        <div className="space-y-4 p-4">
          <ToolField label="CSV mətni" htmlFor="csv-input">
            <ToolTextArea
              id="csv-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder="ad,yaş,şəhər&#10;Vəli,28,Bakı"
            />
          </ToolField>

          <ToolField
            label="Ayırıcı"
            htmlFor="csv-delimiter"
            className="max-w-56"
            note={
              delimiterOption === "auto"
                ? "Sətirlər arası sabitliyə görə özü təxmin edilir."
                : undefined
            }
          >
            <ToolSelect
              id="csv-delimiter"
              value={delimiterOption}
              onChange={(event) => setDelimiterOption(event.target.value as DelimiterOption)}
            >
              <option value="auto">Avtomatik</option>
              {CSV_DELIMITERS.map((delimiter) => (
                <option key={delimiter} value={delimiter}>
                  {CSV_DELIMITER_LABELS[delimiter]}
                </option>
              ))}
            </ToolSelect>
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

      {result.ok && (
        <>
          <ToolResultPanel title="Xülasə" hint={`${result.data.rowCount} data sətri`}>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              <ToolStat label="Ayırıcı" value={CSV_DELIMITER_LABELS[result.data.delimiter]} />
              <ToolStat label="Başlıq sətri" value={result.data.hasHeader ? "var" : "yoxdur"} />
              <ToolStat label="Sütun sayı" value={result.data.headers.length} />
              <ToolStat
                label="Pozuq sətir"
                value={result.data.malformedRows.length}
                tone={result.data.malformedRows.length > 0 ? "warning" : "default"}
              />
            </div>
          </ToolResultPanel>

          <ToolPanel>
            <ToolPanelHeader title="Sütunlar" hint={`${result.data.columns.length} sütun`} />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-rule text-left text-muted">
                    <th scope="col" className="p-2 font-normal">
                      Ad
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Tip
                    </th>
                    <th scope="col" className="p-2 text-right font-normal">
                      Dolu
                    </th>
                    <th scope="col" className="p-2 text-right font-normal">
                      Boş
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.columns.map((column) => (
                    <tr key={column.name} className="border-b border-rule last:border-0">
                      <td className="p-2 break-all">{column.name}</td>
                      <td className="p-2">{COLUMN_TYPE_LABELS[column.type]}</td>
                      <td className="p-2 text-right tabular-nums">{column.filledCount}</td>
                      <td className="p-2 text-right tabular-nums">{column.blankCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolPanel>

          {result.data.malformedRows.length > 0 && (
            <ToolNote tone="accent" title="Pozuq sətirlər">
              <ul className="space-y-1">
                {result.data.malformedRows.map((row) => (
                  <li key={row.row}>
                    Sətir {row.row}: {row.actualColumns} sütun tapıldı, {row.expectedColumns}{" "}
                    gözlənilirdi.
                  </li>
                ))}
              </ul>
            </ToolNote>
          )}

          <ToolResultPanel
            title="Önizləmə"
            hint={`ilk ${result.data.preview.length} sətir`}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-result-rule text-left text-muted">
                    {result.data.headers.map((header, index) => (
                      <th key={index} scope="col" className="p-2 font-normal whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.preview.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-result-rule last:border-0">
                      {result.data.headers.map((_, columnIndex) => (
                        <td key={columnIndex} className="p-2 whitespace-nowrap">
                          {row[columnIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolResultPanel>
        </>
      )}
    </div>
  );
}
