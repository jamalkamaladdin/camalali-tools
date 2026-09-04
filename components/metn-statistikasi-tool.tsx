"use client";

import { useMemo, useState } from "react";
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
import { analyseText } from "../lib/metn-statistikasi";

const SAMPLE_TEXT =
  "Salam! Bu, mətn statistikası alətinin nümunəsidir 😀. Alət söz, cümlə və abzas sayını hesablayır: meyvə, tərəvəz və s. kimi qısaltmalardan sonrakı nöqtəni cümlə sonu saymır.\n\nBu, ikinci abzasdır.";

function formatReadingTime(minutes: number, seconds: number): string {
  if (minutes === 0) return `${seconds} san`;
  return `${minutes} dəq ${seconds} san`;
}

export function MetnStatistikasiTool() {
  const [text, setText] = useState("");
  const stats = useMemo(() => analyseText(text), [text]);

  // The UTF-16 length only earns a place on screen when it disagrees with
  // the code-point count — showing two identical numbers side by side would
  // just be noise for every visitor whose text has no emoji in it.
  const lengthsDiffer = stats.utf16LengthWithSpaces !== stats.characterCountWithSpaces;

  return (
    <div className="mt-8">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn statistikası"
          action={
            <>
              <ToolButton size="chip" onClick={() => setText(SAMPLE_TEXT)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ToolField label="Mətn" htmlFor="metn-statistikasi-input">
            <ToolTextArea
              id="metn-statistikasi-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Statistikasını görmək istədiyin mətni yapışdır…"
              className="min-h-80"
            />
          </ToolField>

          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ToolStat
                label="Simvol (boşluqla)"
                value={stats.characterCountWithSpaces}
                note={
                  lengthsDiffer
                    ? `UTF-16 uzunluğu: ${stats.utf16LengthWithSpaces}`
                    : undefined
                }
              />
              <ToolStat label="Simvol (boşluqsuz)" value={stats.characterCountWithoutSpaces} />
              <ToolStat label="Söz sayı" value={stats.wordCount} />
              <ToolStat label="Unikal söz" value={stats.uniqueWordCount} />
              <ToolStat label="Cümlə sayı" value={stats.sentenceCount} />
              <ToolStat label="Abzas sayı" value={stats.paragraphCount} />
              <ToolStat label="Orta söz uzunluğu" value={`${stats.averageWordLength} hərf`} />
              <ToolStat
                label="Orta cümlə uzunluğu"
                value={`${stats.averageSentenceLength} söz`}
              />
            </div>

            <ToolStat
              label="Oxuma vaxtı"
              value={formatReadingTime(stats.readingTime.minutes, stats.readingTime.seconds)}
              note="200 söz/dəqiqə sürəti ilə"
              tone="accent"
              className="col-span-2"
            />

            <ToolResultPanel title="Ən çox işlənən sözlər" hint={`top ${stats.topWords.length}`}>
              <div className="p-3">
                {stats.topWords.length === 0 ? (
                  <p className="font-ui text-xs text-muted">Hələ söz yoxdur.</p>
                ) : (
                  <ol className="space-y-1.5 font-ui text-xs">
                    {stats.topWords.map((entry, index) => (
                      <li key={entry.word} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">
                          <span className="text-muted">{index + 1}.</span> {entry.word}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">{entry.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </ToolResultPanel>

            {lengthsDiffer && (
              <ToolNote>
                Simvol sayı ilə UTF-16 uzunluğu fərqlənir, çünki mətndə emoji və ya oxşar
                iki-vahidli simvol var: hər ikisi eyni yerdə göstərilir.
              </ToolNote>
            )}
          </div>
        </div>
      </ToolPanel>
    </div>
  );
}
