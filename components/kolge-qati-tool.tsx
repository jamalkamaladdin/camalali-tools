"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolNote, ToolOutput, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";
import { ToolSegmented } from "./tabs";
import { computeElevation, TAILWIND_SHADOW_REFERENCE, type ElevationLevel } from "../lib/kolge-qati";

const LEVEL_OPTIONS = ["1", "2", "3", "4", "5", "6"].map((value) => ({ value, label: value }));

export function KolgeQatiTool() {
  const [levelText, setLevelText] = useState("3");
  const level = Number(levelText) as ElevationLevel;

  const result = useMemo(() => computeElevation(level), [level]);
  const reference = TAILWIND_SHADOW_REFERENCE[level];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Yüksəklik" hint={`${result.ok ? result.layers.length : 0} qat`} />
        <div className="p-4">
          <ToolSegmented
            options={LEVEL_OPTIONS}
            value={levelText}
            onChange={setLevelText}
            label="Yüksəklik səviyyəsi"
            fill
          />
        </div>
      </ToolPanel>

      {result.ok ? (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div className="flex items-center justify-center bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-ink))] p-14">
              <div className="size-28 rounded-lg bg-surface" style={{ boxShadow: result.css }} />
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="CSS"
            action={<CopyButton value={`box-shadow: ${result.css};`} label="box-shadow kopyala" />}
          >
            <ToolOutput className="m-3">{`box-shadow: ${result.css};`}</ToolOutput>
          </ToolResultPanel>

          <ToolNote title="Tailwind qarşılığı">
            Ən yaxın standart sinif: <span className="font-mono">{reference.className}</span> —{" "}
            <span className="font-mono">{reference.css}</span>
          </ToolNote>

          <ToolPanel>
            <ToolPanelHeader title="Qatlar" hint="yaxından uzağa" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-rule text-left text-muted">
                    <th scope="col" className="p-2 font-normal">
                      Qat
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Ofset (Y)
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Bulanıqlıq
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Qatılıq
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.layers.map((layer, index) => (
                    <tr key={index} className="border-b border-rule last:border-0">
                      <td className="p-2 tabular-nums">{index === 0 ? "yaxın" : index === result.layers.length - 1 ? "uzaq" : index + 1}</td>
                      <td className="p-2 tabular-nums">{layer.offsetY}px</td>
                      <td className="p-2 tabular-nums">{layer.blur}px</td>
                      <td className="p-2 tabular-nums">{layer.opacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolPanel>
        </>
      ) : (
        <ToolNote tone="accent" title="Hesablana bilmədi">
          {result.error}
        </ToolNote>
      )}
    </div>
  );
}
