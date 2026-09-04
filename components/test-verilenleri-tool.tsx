"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolButton, ToolField, ToolInput, ToolNote, ToolOutput, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";
import { ToolSegmented } from "./tabs";
import { ALL_FIELDS, FIELD_LABELS, MAX_ROWS, generateDataset, toCsv, toJson, toSqlInsert, type FieldKey } from "../lib/test-verilenleri";

type OutputFormat = "json" | "csv" | "sql";

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function TestVerilenleriTool() {
  const [selected, setSelected] = useState<FieldKey[]>(["ad", "soyad", "mobil", "eposta"]);
  const [rowCount, setRowCount] = useState(10);
  const [format, setFormat] = useState<OutputFormat>("json");
  const [tableName, setTableName] = useState("test_data");
  const [seed, setSeed] = useState(randomSeed);

  const toggleField = (field: FieldKey) => {
    setSelected((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  };

  const moveField = (field: FieldKey, delta: 1 | -1) => {
    setSelected((prev) => {
      const index = prev.indexOf(field);
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const dataset = useMemo(() => generateDataset(rowCount, selected, seed), [rowCount, selected, seed]);

  const output = useMemo(() => {
    if (!dataset.ok) return null;
    if (format === "json") return toJson(dataset.rows, selected);
    if (format === "csv") return toCsv(dataset.rows, selected);
    return toSqlInsert(dataset.rows, selected, tableName);
  }, [dataset, format, selected, tableName]);

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Uydurma verilənlər">
        Bütün adlar, nömrələr, ünvanlar və IBAN-lar təsadüfi qurulur — real bir şəxsə və ya hesaba aid deyil.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="Sahələr" hint={`${selected.length} seçilib`} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 p-4">
          {ALL_FIELDS.map((field) => {
            const orderIndex = selected.indexOf(field);
            return (
              <div key={field} className="flex items-center gap-2 font-ui text-ios-subhead">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={orderIndex !== -1}
                    onChange={() => toggleField(field)}
                    className="size-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>{FIELD_LABELS[field]}</span>
                </label>
                {orderIndex !== -1 && (
                  <span className="flex items-center gap-1 text-ios-footnote text-muted">
                    <span className="tabular-nums">{orderIndex + 1}</span>
                    <ToolButton size="chip" onClick={() => moveField(field, -1)} disabled={orderIndex === 0}>
                      ↑
                    </ToolButton>
                    <ToolButton size="chip" onClick={() => moveField(field, 1)} disabled={orderIndex === selected.length - 1}>
                      ↓
                    </ToolButton>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Ayarlar"
          action={
            <ToolButton size="chip" onClick={() => setSeed(randomSeed())}>
              Yenidən yarat
            </ToolButton>
          }
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 p-4">
          <ToolField label="Sətir sayı" htmlFor="test-verilenleri-count" hint={`maks. ${MAX_ROWS}`}>
            <ToolInput
              id="test-verilenleri-count"
              type="number"
              min={1}
              max={MAX_ROWS}
              value={rowCount}
              onChange={(event) => setRowCount(Number(event.target.value))}
              className="tabular-nums"
            />
          </ToolField>
          <ToolField label="Format" htmlFor="test-verilenleri-format">
            <ToolSegmented
              label="Çıxış formatı"
              value={format}
              onChange={setFormat}
              options={[
                { value: "json", label: "JSON" },
                { value: "csv", label: "CSV" },
                { value: "sql", label: "SQL" },
              ]}
            />
          </ToolField>
          {format === "sql" && (
            <ToolField label="Cədvəl adı" htmlFor="test-verilenleri-table">
              <ToolInput id="test-verilenleri-table" value={tableName} onChange={(event) => setTableName(event.target.value)} className="font-mono" />
            </ToolField>
          )}
        </div>
      </ToolPanel>

      {!dataset.ok && <ToolNote tone="accent">{dataset.error}</ToolNote>}

      {dataset.ok && output !== null && (
        <ToolResultPanel title="Nəticə" hint={`${dataset.rows.length} sətir`} action={<CopyButton value={output} label="kopyala" />}>
          <div className="p-4">
            <ToolOutput className="max-h-96 overflow-y-auto">{output}</ToolOutput>
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
