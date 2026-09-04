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
  ToolTextArea,
} from "./ui";
import {
  CASE_MODE_LABELS,
  CASE_MODES,
  convertCase,
  letterComparisonTable,
  localeAgreement,
  type CaseMode,
} from "../lib/herf-registri";

const SAMPLE_TEXT = "İstifadəçi ID-ni yoxlamaq üçün API açarını daxil et.";

export function HerfRegistriTool() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [mode, setMode] = useState<CaseMode>("sentenceCase");

  const output = useMemo(() => convertCase(text, mode), [text, mode]);
  const comparison = useMemo(() => letterComparisonTable(), []);
  const agreement = useMemo(() => localeAgreement(), []);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          action={
            <ToolButton size="chip" onClick={() => setText(SAMPLE_TEXT)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="Mətn" htmlFor="herf-registri-input">
            <ToolTextArea
              id="herf-registri-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder="Çevirmək istədiyin mətni yaz…"
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Format" />
        <div className="flex flex-wrap gap-2 p-4">
          {CASE_MODES.map((candidate) => (
            <ToolButton
              key={candidate}
              size="chip"
              selected={candidate === mode}
              onClick={() => setMode(candidate)}
            >
              {CASE_MODE_LABELS[candidate]}
            </ToolButton>
          ))}
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="Nəticə"
        hint={CASE_MODE_LABELS[mode]}
        action={<CopyButton value={output} label="nəticəni kopyala" />}
      >
        <div className="p-4">
          <ToolOutput>{output || ""}</ToolOutput>
        </div>
      </ToolResultPanel>

      <ToolResultPanel title="I / ı / İ / i" hint="ingilis qaydası ilə Azərbaycan qaydası">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-result-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  Hərf
                </th>
                <th scope="col" className="p-2 font-normal">
                  İngilis kiçik
                </th>
                <th scope="col" className="p-2 font-normal">
                  İngilis böyük
                </th>
                <th scope="col" className="p-2 font-normal">
                  Azərbaycan kiçik
                </th>
                <th scope="col" className="p-2 font-normal">
                  Azərbaycan böyük
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.char} className="border-b border-result-rule last:border-0">
                  <td className="p-2 font-mono text-ios-body">{row.char}</td>
                  <td className="p-2 font-mono">{row.defaultLower}</td>
                  <td className="p-2 font-mono">{row.defaultUpper}</td>
                  <td className="p-2 font-mono text-accent-text font-semibold">{row.azerbaijaniLower}</td>
                  <td className="p-2 font-mono text-accent-text font-semibold">{row.azerbaijaniUpper}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ToolNote tone={agreement.agrees ? "info" : "accent"}>
            {agreement.agrees
              ? "Bu brauzerin öz lokal funksiyası (toLocaleLowerCase/\"az\") bu dörd hərfdə alətin öz cədvəli ilə üst-üstə düşür."
              : `Bu brauzerin lokal funksiyası bu dörd hərfin bəzisində alətin öz cədvəlindən fərqlənir (${agreement.mismatches.join(", ")}): ona görə nəticə həmişə alətin öz cədvəlinə görə hesablanır, lokal funksiyaya görə yox.`}
          </ToolNote>
        </div>
      </ToolResultPanel>
    </div>
  );
}
