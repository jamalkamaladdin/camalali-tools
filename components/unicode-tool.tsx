"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { azLetterUsage, inspectUnicode, textSummary, INSPECT_LIMIT } from "../lib/unicode";

/*
 * A schwa, a dotless and a dotted I pair, a combining-accent "e" (two code
 * points, one grapheme) and a family emoji (one grapheme, five code points,
 * two zero-width joiners) — every disagreement this page exists to show,
 * in one line.
 */
const SAMPLE_TEXT = "Salaəm dünya İ I ı i, café, 👨‍👩‍👦";

export function UnicodeTool() {
  const [text, setText] = useState(SAMPLE_TEXT);

  const summary = useMemo(() => textSummary(text), [text]);
  const rows = useMemo(() => inspectUnicode(text), [text]);
  const azUsage = useMemo(() => azLetterUsage(text), [text]);
  const usedAzLetters = azUsage.filter((entry) => entry.count > 0);

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
          <ToolField label="Mətn" htmlFor="unicode-input">
            <ToolTextArea
              id="unicode-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder="Açmaq istədiyin mətni yaz…"
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolResultPanel title="Ümumi say" hint="dörd ölçü, dörd nəticə">
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <ToolStat label="Qrafem" value={summary.graphemes} note="insan gördüyü simvol" />
          <ToolStat label="Kod nöqtəsi" value={summary.codePoints} />
          <ToolStat label="UTF-16 vahidi" value={summary.utf16Units} />
          <ToolStat label="UTF-8 bayt" value={summary.utf8Bytes} />
          <ToolStat label="ASCII-dən kənar" value={summary.nonAscii} />
          <ToolStat
            label="Görünməz"
            value={summary.invisible}
            tone={summary.invisible > 0 ? "warning" : "default"}
          />
        </div>
      </ToolResultPanel>

      {rows.length > 0 && (
        <ToolResultPanel
          title="Simvol-simvol"
          hint={
            text.length > INSPECT_LIMIT
              ? `ilk ${rows.length} (məhdudiyyət ${INSPECT_LIMIT})`
              : `${rows.length} simvol`
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-result-rule text-left text-muted">
                  <th scope="col" className="p-2 font-normal">
                    Simvol
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Kod nöqtəsi
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Ad
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    UTF-8
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Entity
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    JS
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-b border-result-rule last:border-0">
                    <td className="p-2 font-mono">{row.display}</td>
                    <td className="p-2 font-mono tabular-nums">{row.hex}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2 font-mono">{row.utf8}</td>
                    <td className="p-2 font-mono">{row.entity}</td>
                    <td className="p-2 font-mono">{row.jsEscape}</td>
                    <td className="p-2 font-mono break-all">{row.urlEncoded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolResultPanel>
      )}

      <ToolResultPanel
        title="Azərbaycan hərfləri"
        hint={`${usedAzLetters.length}/16 mətndə var`}
        action={
          usedAzLetters.length > 0 && (
            <CopyButton
              value={usedAzLetters.map((entry) => `${entry.letter} ${entry.count}`).join("\n")}
              label="siyahını kopyala"
            />
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-result-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  Hərf
                </th>
                <th scope="col" className="p-2 font-normal">
                  Kod nöqtəsi
                </th>
                <th scope="col" className="p-2 font-normal">
                  Blok
                </th>
                <th scope="col" className="p-2 font-normal">
                  Bayt (1 ədəd)
                </th>
                <th scope="col" className="p-2 font-normal">
                  Say
                </th>
                <th scope="col" className="p-2 font-normal">
                  Cəmi bayt
                </th>
              </tr>
            </thead>
            <tbody>
              {azUsage.map((entry) => (
                <tr key={entry.letter} className="border-b border-result-rule last:border-0">
                  <td className="p-2 font-mono text-ios-body">{entry.letter}</td>
                  <td className="p-2 font-mono tabular-nums">{entry.hex}</td>
                  <td className="p-2">{entry.block}</td>
                  <td className="p-2 tabular-nums">{entry.utf8Bytes}</td>
                  <td className={`p-2 tabular-nums ${entry.count > 0 ? "text-accent-text font-semibold" : "text-muted"}`}>
                    {entry.count}
                  </td>
                  <td className="p-2 tabular-nums">{entry.totalBytes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ToolResultPanel>

      {text === "" && <ToolNote tone="info">Açmaq üçün ən azı bir simvol yaz.</ToolNote>}
    </div>
  );
}
